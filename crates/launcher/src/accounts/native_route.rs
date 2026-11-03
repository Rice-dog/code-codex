//! Prepare/commit a per-thread native transport without a GUI login swap.
use super::{AccountError, AccountService, Result, host, preparation, relay};
use cdp_client::CdpEndpoint;
use serde_json::{Value, json};
use std::{path::Path, sync::Arc, time::Duration};

// Only endpoint state, never URLs/capabilities or auth. Survives renderer pin loss.
async fn host_generation(endpoint:CdpEndpoint)->Result<String>{
    use sha2::Digest;
    let discovery=cdp_client::TargetDiscovery::new().map_err(|_|AccountError::new("ACCOUNT_ROUTE_GENERATION","Official process generation discovery is unavailable."))?;
    let version=tokio::time::timeout(Duration::from_secs(3),discovery.version(endpoint)).await.map_err(|_|AccountError::new("ACCOUNT_ROUTE_GENERATION","Official process generation discovery timed out; no endpoint was changed."))?.map_err(|_|AccountError::new("ACCOUNT_ROUTE_GENERATION","Official process generation could not be verified."))?;
    let raw=version.web_socket_debugger_url.ok_or_else(||AccountError::new("ACCOUNT_ROUTE_GENERATION","Official process generation is missing."))?;
    let url=reqwest::Url::parse(&raw).map_err(|_|AccountError::new("ACCOUNT_ROUTE_GENERATION","Official process generation is invalid."))?;
    if url.scheme()!="ws"||url.host_str()!=Some("127.0.0.1")||url.port()!=Some(endpoint.port())||!url.path().starts_with("/devtools/browser/"){return Err(AccountError::new("ACCOUNT_ROUTE_GENERATION","Official process generation did not match the verified endpoint."));}
    Ok(format!("{:x}",sha2::Sha256::digest(raw.as_bytes())))
}
fn route_history(root:&Path,epoch:&str)->Result<Value>{
    let path=root.join("native-route-state.json");
    if !path.exists(){return Ok(json!({}));}
    let metadata=path.symlink_metadata().map_err(|_|AccountError::new("ACCOUNT_ROUTE_STATE","Route recovery state cannot be inspected."))?;
    if !metadata.is_file()||metadata.file_type().is_symlink()||metadata.len()>65536{return Err(AccountError::new("ACCOUNT_ROUTE_STATE","Route recovery state is redirected or exceeds its bound."));}
    let value:Value=serde_json::from_slice(&std::fs::read(path).map_err(|_|AccountError::new("ACCOUNT_ROUTE_STATE","Route recovery state cannot be read."))?).map_err(|_|AccountError::new("ACCOUNT_ROUTE_STATE","Route recovery state is invalid."))?;
    if value["schema"]!=1||!value["hostEpoch"].as_str().is_some_and(|v|v.len()==64&&v.bytes().all(|b|b.is_ascii_hexdigit()))||!value["threads"].as_object().is_some_and(|v|v.len()<=256&&v.iter().all(|(k,v)|!k.is_empty()&&k.len()<=128&&matches!(v.as_str(),Some("relay"|"default"|"pending")))){return Err(AccountError::new("ACCOUNT_ROUTE_STATE","Route recovery state does not satisfy schema1."));}
    Ok(if value["hostEpoch"]==epoch{value["threads"].clone()}else{json!({})})
}
fn save_route_state(root:&Path,epoch:&str,thread:&str,mode:Option<&str>)->Result<()> {
    let mut state=route_history(root,epoch)?;
    if let Some(mode)=mode {
        if state.as_object().unwrap().len()>=256&&!state.as_object().unwrap().contains_key(thread){return Err(AccountError::new("ACCOUNT_ROUTE_STATE_LIMIT","Route recovery state reached256 conversations; no endpoint was changed."));}
        state[thread]=json!(mode);
    }else{state.as_object_mut().unwrap().remove(thread);}
    crate::renderer_storage::atomic(&root.join("native-route-state.json"),&json!({"schema":1,"hostEpoch":epoch,"threads":state})).map_err(|_|AccountError::new("ACCOUNT_ROUTE_STATE","Route recovery state could not be saved. No preparation was accepted."))
}

async fn native(endpoint: CdpEndpoint, params: Value) -> Result<Value> {
    let mut params = params;
    let mut operation=crate::runtime_log::Operation::start("accounts","account.native-transition",json!({"mode":params["mode"],"conversationId":params["threadId"],"target":if params["baseUrl"].is_string(){"relay"}else{"default"},"stage":"native-route-open","taskSent":false}));
    params["binding"] = json!(format!(
        "__codeCodexLive_{}_{}",
        env!("CARGO_PKG_VERSION").replace('.', "_"),
        std::process::id()
    ));
    let expression = include_str!("native_route.js")
        .replace("__PARAMS__", &params.to_string())
        .replace("__PROFILE__", &host::profile().to_string());
    let budget = if params["mode"] == "switch" { 105 } else { 55 };
    let value = match host::evaluate_budget(endpoint, &expression, Duration::from_secs(budget)).await {
        Ok(value)=>value,
        Err(error)=>{
            operation.finish("failed",json!({"stage":"native-route-evaluate","errorCode":error.code,"taskSent":false,"endpointOutcome":"unverified"}));
            if params["mode"] == "switch" {
                return Err(AccountError::new("ACCOUNT_NATIVE_RECOVERY_PENDING",format!("Native routing observation ended before subscription recovery was verified. stage=native-route-evaluate; originalCode={}; endpointOutcome=unverified; no inference was sent. Verify the original conversation before retrying.",error.code)));
            }
            return Err(error);
        }
    };
    if let Some(failure) = value.get("failure") {
        operation.finish("failed",json!({"stage":failure["stage"],"errorCode":failure["code"],"backendReopened":failure["switched"],"diagnostics":value["diagnostics"],"taskSent":false}));
        let code = if failure["switched"] != true && value["diagnostics"]["subscriptionTouched"] == true && value["diagnostics"]["originalSubscriptionRestored"] != true {
            "ACCOUNT_NATIVE_RECOVERY_PENDING"
        } else {failure["code"].as_str().unwrap_or("ACCOUNT_NATIVE_ROUTE")};
        return Err(AccountError::new(
            code,
            format!(
                "Native account routing failed. stage={}; backendReopened={}; subscriptionTouched={}; originalSubscriptionRestored={}; recovery={}; reason={}; no inference request was sent. Re-select the account after the current operation finishes.",
                failure["stage"].as_str().unwrap_or("unknown"),
                failure["switched"] == true,
                value["diagnostics"]["subscriptionTouched"] == true,
                value["diagnostics"]["originalSubscriptionRestored"] == true,
                value["diagnostics"]["subscriptionRecovery"].as_str().unwrap_or("unknown"),
                failure["reason"].as_str().unwrap_or("unknown")
            ),
        ));
    }
    operation.finish("confirmed",json!({"stage":"native-route-result","ready":value["ready"],"routed":value["routed"],"inProgress":value["inProgress"],"diagnostics":value["diagnostics"],"taskSent":false}));
    Ok(value)
}
pub(super) async fn restore<'a>(
    service: &'a AccountService,
    endpoint: CdpEndpoint,
    owner: &host::Owner,
) -> Result<tokio::sync::MutexGuard<'a, ()>> {
    let _operation = service.native_route_lock.lock().await;
    let root=super::owner_root(&owner.id)?;
    let epoch=if service.relays.owned(&owner.id).is_empty(){None}else{Some(host_generation(endpoint).await?)};
    for route in service.relays.owned(&owner.id) {
        native(endpoint, json!({"mode":"switch","threadId":route.thread})).await?;
        save_route_state(&root,epoch.as_deref().unwrap(),&route.thread,Some("default"))?;
        service.relays.replace(&owner.id, &route.thread, None);
    }
    Ok(_operation)
}
pub(super) async fn request(
    service: &AccountService,
    endpoint: CdpEndpoint,
    owner: &host::Owner,
    p: &Value,
    workspace: Option<&Path>,
    progress: Option<&preparation::Preparation>,
    current: impl Fn() -> bool,
) -> Result<Value> {
    let thread = super::identifier(p, "conversationId")?.to_owned();
    if p["action"] == "native.status" {
        return Ok(service
            .relays
            .get(&owner.id, &thread)
            .map(|r| r.status())
            .unwrap_or(
                json!({"connectionId":"host","routed":false,"ready":true,"activeRequests":0}),
            ));
    }
    let progress = progress
        .ok_or_else(|| AccountError::protocol("Native preparation diagnostics are unavailable."))?;
    if p["action"] == "native.ensure" {
        let selected = super::text(p, "connectionId")?;
        {
            let all = service.state.lock().await;
            if all
                .get(&owner.id)
                .and_then(|s| s.registry.selected.get(&thread))
                .map(String::as_str)
                .unwrap_or("host")
                != selected
            {
                return Err(stale());
            }
        }
        if let Some(route) = service.relays.get(&owner.id, &thread) {
            if route.connection() == selected
                && native(
                    endpoint,
                    json!({"mode":"check","threadId":thread,"baseUrl":route.base_url}),
                )
                .await?["ready"]
                    == true
            {
                if !current() || host::observe(endpoint).await?.id != owner.id {
                    return Err(stale());
                }
                progress.finish(None);
                return Ok(
                    json!({"ready":true,"selected":selected,"threadId":thread,"routed":true,"reusedNativeExecution":true}),
                );
            }
        } else if selected == "host" {
            // A renderer pin can outlive its native owner. An empty new registry
            // does not prove the official conversation uses its default endpoint.
            let check = native(endpoint, json!({"mode":"check","threadId":thread})).await?;
            let history=route_history(&super::owner_root(&owner.id)?,&host_generation(endpoint).await?)?;
            let registered={let all=service.state.lock().await;all.get(&owner.id).is_some_and(|s|s.registry.selected.contains_key(&thread))};
            let recovery_required=matches!(history[&thread].as_str(),Some("relay"|"pending"));
            if check["routed"] == false&&!recovery_required {
                progress.finish(None);
                return Ok(json!({"ready":true,"selected":"host","threadId":thread}));
            }
            progress.step("native-orphan-route", json!({"previousPinPresent":check["routed"]==true,"recoveryState":history[&thread],"registeredSelection":registered,"taskSent":false}));
        }
    }
    let result = prepare(service, endpoint, owner, p, workspace, progress, &current).await;
    if let Err(error) = &result {
        progress.cleanup(true);
        let error = progress.failure(error.clone());
        progress.finish(Some(&error));
    } else {
        progress.finish(None);
    }
    result
}
async fn prepare(
    service: &AccountService,
    endpoint: CdpEndpoint,
    owner: &host::Owner,
    p: &Value,
    workspace: Option<&Path>,
    progress: &preparation::Preparation,
    current: &impl Fn() -> bool,
) -> Result<Value> {
    let _operation=tokio::time::timeout(Duration::from_secs(15),service.native_route_lock.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","Native account preparation is already running. stage=native-route-lock; timeoutMs=15000; no inference was sent."))?;
    super::primary::guard(&super::owner_root(&owner.id)?,owner,"native.prepare")?;
    if !current() || progress.is_cancelled() {
        return Err(stale());
    }
    let thread = super::identifier(p, "conversationId")?.to_owned();
    let selected = if p["action"] == "native.detach" {
        "host".to_owned()
    } else {
        super::text(p, "connectionId")?.to_owned()
    };
    progress.phase("native-history", 15);
    let metadata = host::thread_metadata(endpoint, &thread).await?;
    let cwd = std::fs::canonicalize(metadata["cwd"].as_str().unwrap_or(""))
        .map_err(|_| AccountError::protocol("The native thread workspace is unavailable."))?;
    if !workspace.is_some_and(|root| same_file::is_same_file(root, &cwd).unwrap_or(false)) {
        return Err(AccountError::new(
            "ACCOUNT_WORKSPACE_CHANGED",
            "Native account preparation requires the current verified project. No inference was sent.",
        ));
    }
    if native(endpoint, json!({"mode":"state","threadId":thread})).await?["inProgress"] != false {
        return Err(AccountError::new(
            "ACCOUNT_TURN_ACTIVE",
            "The native task must reach a terminal state before switching.",
        ));
    }
    let root = super::owner_root(&owner.id)?;
    let (generation, prior_selected, worker, email) = {
        let mut all = service.state.lock().await;
        let state = all.get_mut(&owner.id).ok_or_else(stale)?;
        if state.active.contains_key(&thread){return Err(AccountError::new("ACCOUNT_TURN_ACTIVE","A previous account executor still owns this conversation. Check its task status before preparing the native route. No inference was sent."));}
        let email = if selected == "host" {
            None
        } else {
            Some(
                state
                    .registry
                    .connections
                    .iter()
                    .find(|c| c.id == selected)
                    .and_then(|c| c.email.clone())
                    .ok_or_else(|| {
                        AccountError::new(
                            "ACCOUNT_AUTH_REQUIRED",
                            "Authorize this account before selecting it.",
                        )
                    })?,
            )
        };
        let worker = if selected == "host" {
            None
        } else {
            Some(super::get_worker(state, &root, &selected).await?)
        };
        (
            state.generation.clone(),
            state.registry.selected.get(&thread).cloned(),
            worker,
            email,
        )
    };
    progress.phase("credentials", 35);
    let prior = service.relays.get(&owner.id, &thread);
    let credential = match (worker, email) {
        (Some(worker), Some(email)) => {
            Some(relay::Route::prepare_credential(selected.clone(), worker, email).await?)
        }
        _ if selected == "host" && prior.is_some() && p["action"] != "native.detach" => {
            Some(relay::Route::prepare_official(owner.label.clone())?)
        }
        _ => None,
    };
    if prior.is_none() && service.relays.owned(&owner.id).len() >= 32 {
        return Err(AccountError::new(
            "ACCOUNT_ROUTE_LIMIT",
            "At most32 native conversations may retain prepared account routes. Restore an idle conversation to the official account before preparing another.",
        ));
    }
    let candidate = if let Some(credential) = &credential {
        Some(if let Some(prior) = &prior {
            prior.clone()
        } else {
            relay::Route::start(owner.id.clone(), thread.clone(), credential.clone()).await?
        })
    } else {
        None
    };
    // A candidate listener has no active route and cannot send until commit.
    let mut guard = Candidate(if prior.is_none() {
        candidate.clone()
    } else {
        None
    });
    if !current() || progress.is_cancelled() || host::observe(endpoint).await?.id != owner.id {
        return Err(stale());
    }
    progress.phase("native-transport", 65);
    let epoch=host_generation(endpoint).await?;
    let previous_mode=route_history(&root,&epoch)?[&thread].as_str().map(str::to_owned);
    save_route_state(&root,&epoch,&thread,Some("pending"))?;
    let switch = native(
        endpoint,
        json!({"mode":"switch","threadId":thread,"baseUrl":candidate.as_ref().map(|r|&r.base_url)}),
    )
    .await;
    let commit:Result<Value>=async {
  let result=switch?;
  if let (Some(before),Some(after))=(result["path"].as_str(),result["resumedPath"].as_str()){if !same_file::is_same_file(before,after).unwrap_or(false){return Err(AccountError::new("ACCOUNT_SHARED_HISTORY","Native routing did not preserve the same physical conversation history. No inference was sent."));}}
  if !current()||progress.is_cancelled()||host::observe(endpoint).await?.id!=owner.id{return Err(stale());}
  progress.phase("commit-selection",95);
  save_route_state(&root,&epoch,&thread,Some(if candidate.is_some(){"relay"}else{"default"}))?;
  let mut all=service.state.lock().await;let state=all.get_mut(&owner.id).ok_or_else(stale)?;
  if state.generation!=generation||state.registry.selected.get(&thread)!=prior_selected.as_ref(){return Err(stale());}
  let mut registry=state.registry.clone();registry.selected.insert(thread.clone(),selected.clone());super::save(&root,&registry)?;
  state.registry=registry;if let (Some(route),Some(credential))=(&candidate,&credential){route.commit_credential(credential.clone());}service.relays.replace(&owner.id,&thread,candidate.clone());
  Ok(json!({"ready":true,"selected":selected,"threadId":thread,"routed":candidate.is_some(),"permissionsPreserved":result["permissionsPreserved"],"executionMode":"native-relay"}))
 }.await;
    // The loaded actor kept its original endpoint. A second transition would
    // repeat the same unload wait and can obscure the first concrete failure.
    if commit.as_ref().err().is_some_and(|e|e.code == "ACCOUNT_NATIVE_RECOVERY_PENDING") {
        progress.step("native-original-subscription-unverified",json!({"recoveryState":"pending","taskSent":false}));
        // Keep pending recovery evidence and do not race a still-running
        // renderer transition with a second unsubscribe/rollback operation.
        return commit;
    }
    if commit.as_ref().err().is_some_and(|e|e.message.contains("backendReopened=false;")) {
        save_route_state(&root,&epoch,&thread,previous_mode.as_deref())?;
        progress.step("native-original-route-retained",json!({"previousRoutePresent":prior.is_some(),"taskSent":false}));
        return commit;
    }
    if commit.is_err() {
        progress.step(
            "native-route-rollback",
            json!({"previousRoutePresent":prior.is_some(),"taskSent":false}),
        );
        let rollback = native(
            endpoint,
            json!({"mode":"switch","threadId":thread,"baseUrl":prior.as_ref().map(|r|&r.base_url)}),
        )
        .await;
        if rollback.is_err() {
            return Err(AccountError::new(
                "ACCOUNT_NATIVE_ROLLBACK",
                "Native account preparation and restoration failed. stage=native-route-rollback; selection was not committed; no inference was sent. Re-select an account before sending.",
            ));
        }
    }
    if commit.is_ok() {
        guard.0 = None;
    } // Route ownership moved to the owner-scoped registry.
    commit
}
struct Candidate(Option<Arc<relay::Route>>);
impl Drop for Candidate {
    fn drop(&mut self) {
        if let Some(r) = &self.0 {
            r.close();
        }
    }
}
fn stale() -> AccountError {
    AccountError::new(
        "ACCOUNT_PREPARE_STALE",
        "Native account preparation was invalidated before commit. No inference was sent.",
    )
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn recovery_state_survives_pin_loss_and_is_scoped_to_official_process(){
        let root=tempfile::tempdir().unwrap();let first="a".repeat(64);let next="b".repeat(64);
        save_route_state(root.path(),&first,"thread-one",Some("pending")).unwrap();
        assert_eq!(route_history(root.path(),&first).unwrap()["thread-one"],"pending");
        save_route_state(root.path(),&first,"thread-one",Some("relay")).unwrap();assert_eq!(route_history(root.path(),&first).unwrap()["thread-one"],"relay");
        assert_eq!(route_history(root.path(),&next).unwrap(),json!({}));
        save_route_state(root.path(),&first,"thread-one",Some("default")).unwrap();assert_eq!(route_history(root.path(),&first).unwrap()["thread-one"],"default");
        let text=std::fs::read_to_string(root.path().join("native-route-state.json")).unwrap();assert!(!text.contains("http"));assert!(!text.contains("capability"));
    }
    #[test] fn malformed_recovery_state_is_not_treated_as_default_execution(){
        let root=tempfile::tempdir().unwrap();std::fs::write(root.path().join("native-route-state.json"),b"{}").unwrap();
        assert_eq!(route_history(root.path(),&"a".repeat(64)).unwrap_err().code,"ACCOUNT_ROUTE_STATE");
    }
}
