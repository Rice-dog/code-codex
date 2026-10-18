use std::io::Write as _;

use std::sync::atomic::Ordering;

use async_trait::async_trait;
use base64::Engine as _;
#[cfg(windows)]
use std::time::Instant;

use cdp_client::{BindingRequest, BridgeError, BridgeHandler};

use serde_json::{Value, json};
use sha2::Digest as _;

#[cfg(any(windows, not(windows)))]
use super::reveal_in_file_explorer;
use super::{NativeBridge, abort_import_locked, lock_unpoisoned, request_summary, result_summary};

#[async_trait]
impl BridgeHandler for NativeBridge {
    async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
        let epoch = request.lifecycle_epoch;
        let method = request.method.clone();
        let started = std::time::Instant::now();
        let log_operation = !method.starts_with("explorer.runtime.")
            && method != "explorer.startup.examples.status"
            && method != "explorer.plugins.status"
            && !method.ends_with(".chunk")
            && !method.ends_with(".resource.chunk");
        let request_ref = if request.id.starts_with("cle-")
            && request.id.len() < 80
            && request
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            request.id.clone()
        } else {
            "untrusted-request-reference".into()
        };
        let mut operation=log_operation.then(||crate::runtime_log::Operation::start("native-bridge",method.clone(),json!({"requestRef":request_ref,"lifecycleEpoch":epoch,"contextRevision":self.inner.context_revision.load(Ordering::Acquire),"requestSummary":request_summary(&request.params)})));
        // Keep validation and early `?`/returns inside the result boundary so every
        // method (including rejected requests) reaches its terminal diagnostic.
        let result = async {
            self.ensure_epoch(epoch)?;
            match request.method.as_str() {
                "explorer.storage.request" => {
                  let context=crate::renderer_storage::request_context(&request.params);
                  crate::renderer_storage::request(request.params).map_err(|e| {
                    crate::runtime_log::record("storage","native persistence","failed",json!({"code":"STORAGE_FAILED","requestContext":context,"ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error(),"errorChain":crate::network_diagnostics::error_details(&e)["errorChain"]}));
                    BridgeError::new("STORAGE_FAILED",format!("Code-Codex storage failed: {e}"))
                  })
                },
                "explorer.runtime.check" => Ok(crate::support_checks::run().await),
                "explorer.startup.examples.status" => crate::startup_examples::status(),
                "explorer.startup.examples.download" => {
                    if request.params.as_object().is_none_or(|p|p.keys().any(|k|k!="id")){return Err(BridgeError::invalid_request());}
                    let id=request.params.get("id").and_then(Value::as_str).ok_or_else(BridgeError::invalid_request)?;
                    crate::startup_examples::download(id).await
                }
                "explorer.startup.examples.chunk" => {
                    if request.params.as_object().is_none_or(|p|p.keys().any(|k|k!="id"&&k!="offset")){return Err(BridgeError::invalid_request());}
                    let id=request.params.get("id").and_then(Value::as_str).ok_or_else(BridgeError::invalid_request)?;
                    let offset=request.params.get("offset").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or_else(BridgeError::invalid_request)?;
                    crate::startup_examples::chunk(id,offset)
                }
                "explorer.installation.open" => {
                    if request.params.as_object().is_some_and(|p| !p.is_empty()) { return Err(BridgeError::invalid_request()); }
                    let root = workspace_service::application_paths::install_root().map_err(|e|BridgeError::new("INSTALLATION_ROOT",format!("Resolving the installation folder failed: {e}")))?.ok_or_else(||BridgeError::new("INSTALLATION_UNAVAILABLE","No installed Code-Codex directory was found."))?;
                    workspace_service::application_paths::validate_install_root(&root).map_err(|e|BridgeError::new("INSTALLATION_ROOT",format!("Validating the installation folder failed: {e}")))?;
                    #[cfg(windows)]
                    {
                        tokio::task::spawn_blocking(move || reveal_in_file_explorer(&root)).await.map_err(|e|BridgeError::new("INSTALLATION_OPEN",format!("Installation folder worker failed: {e}")))?.map_err(|e|BridgeError::new("INSTALLATION_OPEN",format!("Opening the installation folder failed: {e}")))?;
                        Ok(json!({"opened":true}))
                    }
                    #[cfg(not(windows))]
                    { Err(BridgeError::new("UNSUPPORTED","Opening the installation folder is unavailable on this platform.")) }
                }
                "explorer.runtime.list" => {
                    crate::runtime_log::list().map_err(|e| BridgeError::new("RUNTIME_LOG", e))
                }
                "explorer.runtime.read" => {
                    let id = request
                        .params
                        .get("id")
                        .and_then(Value::as_str)
                        .ok_or_else(BridgeError::invalid_request)?;
                    crate::runtime_log::read(id).map_err(|e| BridgeError::new("RUNTIME_LOG", e))
                }
                "explorer.runtime.append" => {
                    let events = request
                        .params
                        .get("events")
                        .and_then(Value::as_array)
                        .filter(|e| e.len() <= 128)
                        .ok_or_else(BridgeError::invalid_request)?;
                    // Validate the whole batch before appending any event.
                    for event in events {
                        for key in ["source", "action", "outcome"] {
                            if !event.get(key).and_then(Value::as_str).is_some_and(|s| {
                                !s.is_empty() && s.len() <= 160 && !s.chars().any(char::is_control)
                            }) {
                                return Err(BridgeError::invalid_request());
                            }
                        }
                        if !event.get("details").is_some_and(Value::is_object)
                            || event.to_string().len() > 8192
                        {
                            return Err(BridgeError::invalid_request());
                        }
                    }
                    for event in events {
                        crate::runtime_log::record(
                            event["source"].as_str().unwrap(),
                            event["action"].as_str().unwrap(),
                            event["outcome"].as_str().unwrap(),
                            event["details"].clone(),
                        );
                    }
                    Ok(json!({"accepted":events.len()}))
                }
                "explorer.context" => self.context(request.params, epoch).await,
                "explorer.context.clear" => self.context_clear(request.params, epoch),
                "explorer.list" => self.list(request.params, epoch).await,
                "explorer.git.history" => self.git_history(request.params, epoch).await,
                "explorer.git.commit" => self.git_commit(request.params, epoch).await,
                "explorer.git.diff" => self.git_diff(request.params, epoch).await,
                "explorer.preview" => self.preview(request.params, epoch).await,
                "explorer.preview.save" => self.preview_save(request.params, epoch).await,
                "explorer.media.info" => self.media_info(request.params, epoch).await,
                "explorer.media.chunk" => self.media_chunk(request.params, epoch).await,
                "explorer.model.resource.info" => {
                    self.model_resource_info(request.params, epoch).await
                }
                "explorer.model.resource.chunk" => {
                    self.model_resource_chunk(request.params, epoch).await
                }
                "explorer.entry.create" => self.entry_create(request.params, epoch).await,
                "explorer.entry.rename" => self.entry_rename(request.params, epoch).await,
                "explorer.entry.move" => self.entry_move_batch(request.params, epoch).await,
                "explorer.entry.copy" => self.entry_copy(request.params, epoch).await,
                "explorer.entry.delete" => self.entry_delete(request.params, epoch).await,
                "explorer.entry.reveal" => self.entry_reveal(request.params, epoch).await,
                "explorer.entry.import.begin" => {
                    self.entry_import_begin(request.params, epoch).await
                }
                "explorer.entry.import.directory" => {
                    self.entry_import_directory(request.params, epoch).await
                }
                "explorer.entry.import.file.begin" => {
                    self.entry_import_file_begin(request.params, epoch).await
                }
                "explorer.entry.import.chunk" => {
                    self.entry_import_chunk(request.params, epoch).await
                }
                "explorer.entry.import.file.finish" => {
                    self.entry_import_file_finish(request.params, epoch).await
                }
                "explorer.entry.import.commit" => {
                    self.entry_import_commit(request.params, epoch).await
                }
                "explorer.entry.import.abort" => {
                    self.entry_import_abort(request.params, epoch).await
                }
                "explorer.watch.start" => self.watch_start(request.params, epoch).await,
                "explorer.watch.stop" => self.watch_stop(request.params, epoch),
                "explorer.settings.get" => self.settings_get(request.params).await,
                "explorer.language.get" => self.language_get(request.params).await,
                "explorer.language.set" => self.language_set(request.params,epoch).await,
                "explorer.settings.set" => self.settings_set(request.params, epoch).await,
                "explorer.plugins.status" => crate::plugin_store::status(),
                "explorer.plugins.install"
                | "explorer.plugins.cancel"
                | "explorer.plugins.load" => {
                    let id = request
                        .params
                        .get("id")
                        .and_then(Value::as_str)
                        .ok_or_else(|| BridgeError::new("PLUGIN_ID", "A plugin ID is required."))?;
                    match method.as_str() {
                        "explorer.plugins.install" => crate::plugin_store::install(id).await,
                        "explorer.plugins.cancel" => crate::plugin_store::cancel(id),
                        _ => crate::plugin_store::sources(id)
                            .map(|source| json!({"id":id,"verifiedSource":source})),
                    }
                }
                "explorer.update.startup" => self.update_startup(request.params, epoch).await,
                "explorer.update.check" => self.update_check(request.params, epoch).await,
                "explorer.update.install" => self.update_install(request.params, epoch).await,
                "explorer.window.transparency.set" => {
                    self.window_transparency_set(request.params, epoch)
                }
                _ => Err(BridgeError::new(
                    "INVALID_REQUEST",
                    "The native method is not allowed.",
                )),
            }
        }
        .await
        .map_err(|mut error| {
            // Carry the same observed failure across native logs and renderer
            // diagnostics. Classification never claims an unobserved root cause.
            let mut details = crate::fault_diagnostics::enrich("native-bridge", &method, "failed",
                json!({"errorCode":error.code,"message":error.message,"requestRef":request_ref,"lifecycleEpoch":epoch}));
            details["fault"]["failureRef"] = json!(format!("bridge-{epoch}-{request_ref}"));
            details["fault"]["requestRef"] = json!(request_ref);
            details["fault"]["lifecycleEpoch"] = json!(epoch);
            error.data = Some(json!({"fault":details["fault"]}));
            error
        });
        if log_operation || (result.is_err() && !method.starts_with("explorer.runtime.")) {
            let mut details = json!({"requestRef":request_ref,"durationMs":started.elapsed().as_millis(),"lifecycleEpoch":epoch,"currentLifecycleEpoch":self.inner.lifecycle_epoch.load(Ordering::Acquire),"contextRevision":self.inner.context_revision.load(Ordering::Acquire)});
            if let Err(error) = &result {
                details["errorCode"] = json!(error.code);
                details["message"] = json!(error.message.chars().take(1500).collect::<String>());
                if let Some(fault) = error.data.as_ref().and_then(|data| data.get("fault")) {
                    details["fault"] = fault.clone();
                }
            }
            if let Ok(value) = &result {
                details["resultSummary"] = result_summary(value);
                if method == "explorer.context" {
                    details["workspaceAvailable"] = json!(value.get("rootName").is_some());
                }
            }
            if let Some(operation) = operation.as_mut() {
                operation.finish(if result.is_ok() { "passed" } else { "failed" }, details);
            } else {
                crate::runtime_log::record("native-bridge", &method, "failed", details);
            }
        }
        result
    }

    fn lifecycle_epoch(&self) -> u64 {
        self.inner.lifecycle_epoch.load(Ordering::Acquire)
    }

    fn invalidate_lifecycle(&self) {
        self.inner.lifecycle_epoch.fetch_add(1, Ordering::AcqRel);
        if self.inner.window_transparency.restore().is_err() {
            tracing::warn!(event = "window_transparency_restore_failed");
        }
        let mut state = lock_unpoisoned(&self.inner.state);
        self.bump_context_request_generation();
        self.stop_watcher_locked(&mut state);
        abort_import_locked(&mut state);
        state.current = None;
        self.inner.context_revision.fetch_add(1, Ordering::AcqRel);
    }
}
