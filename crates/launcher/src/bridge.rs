use std::path::Path;
#[cfg(windows)]
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex, MutexGuard};
use std::time::Duration;

use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use cdp_client::{BindingRequest, BridgeError, BridgeHandler, BridgeNotification};
use context_resolver::{AppServerClient, ResolverError};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::{Mutex, RwLock, broadcast};
use tokio::task::JoinHandle;
use workspace_service::{
    CreateEntryKind, ErrorCode, ListOptions, ListPage, MAX_PREVIEW_BYTES, PreparedSettings,
    PreviewResult, Settings, SettingsPatch, SettingsStore, WatchSubscription, WatchVisibility,
    WatchVisibilityHandle, Workspace, WorkspaceError, WorkspaceWatcher,
};

#[derive(Clone)]
pub struct NativeBridge {
    inner: Arc<BridgeInner>,
}

struct BridgeInner {
    resolver: Option<AppServerClient>,
    manual_workspace: Option<Arc<Workspace>>,
    state: StdMutex<BridgeState>,
    settings_store: SettingsStore,
    settings: std::sync::RwLock<Settings>,
    settings_update_lock: Mutex<()>,
    watch_generation: AtomicU64,
    context_request_generation: AtomicU64,
    context_revision: AtomicU64,
    lifecycle_epoch: AtomicU64,
    notification_sender: RwLock<Option<broadcast::Sender<BridgeNotification>>>,
}

struct BridgeState {
    current: Option<ActiveContext>,
    watch_enabled: bool,
    watch_task: Option<JoinHandle<()>>,
    watch_visibility: Option<WatchVisibilityHandle>,
}

#[derive(Clone)]
struct ActiveContext {
    thread_id: Option<String>,
    workspace: Arc<Workspace>,
    lifecycle_epoch: u64,
    revision: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextResult {
    thread_id: Option<String>,
    project_name: String,
    root_name: String,
    // The absolute workspace root. Sent once so the renderer can build absolute
    // paths (e.g. Copy Absolute Path) locally without a per-action round-trip.
    root_path: String,
    compatible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContextParams {
    #[serde(default)]
    thread_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListParams {
    #[serde(default)]
    relative_path: String,
    #[serde(default)]
    cursor: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewParams {
    relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewSaveParams {
    relative_path: String,
    expected_version: String,
    content_base64: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum EntryCreateKind {
    File,
    Directory,
}

impl From<EntryCreateKind> for CreateEntryKind {
    fn from(value: EntryCreateKind) -> Self {
        match value {
            EntryCreateKind::File => Self::File,
            EntryCreateKind::Directory => Self::Directory,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntryCreateParams {
    parent_relative_path: String,
    name: String,
    kind: EntryCreateKind,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntryRenameParams {
    relative_path: String,
    new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntryMoveParams {
    relative_path: String,
    destination_parent_relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BatchCopyParams {
    source_paths: Vec<String>,
    target_directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BatchMoveParams {
    source_paths: Vec<String>,
    target_directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntryPathParams {
    relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SettingsWrapper {
    settings: SettingsPatch,
}

impl NativeBridge {
    pub fn new(
        resolver: Option<AppServerClient>,
        manual_workspace: Option<Arc<Workspace>>,
        settings_store: SettingsStore,
        settings: Settings,
    ) -> Self {
        Self {
            inner: Arc::new(BridgeInner {
                resolver,
                manual_workspace,
                state: StdMutex::new(BridgeState {
                    current: None,
                    watch_enabled: false,
                    watch_task: None,
                    watch_visibility: None,
                }),
                settings_store,
                settings: std::sync::RwLock::new(settings),
                settings_update_lock: Mutex::new(()),
                watch_generation: AtomicU64::new(0),
                context_request_generation: AtomicU64::new(0),
                context_revision: AtomicU64::new(0),
                lifecycle_epoch: AtomicU64::new(0),
                notification_sender: RwLock::new(None),
            }),
        }
    }

    pub async fn initialize_manual(&self) {
        if let Some(workspace) = self.inner.manual_workspace.clone() {
            let epoch = self.inner.lifecycle_epoch.load(Ordering::Acquire);
            if let Ok(request_generation) = self.begin_context_request(epoch) {
                let _ = self
                    .replace_context(None, workspace, epoch, request_generation)
                    .await;
            }
        }
    }

    pub async fn set_notification_sender(&self, sender: broadcast::Sender<BridgeNotification>) {
        *self.inner.notification_sender.write().await = Some(sender);
    }

    async fn context(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.ensure_epoch(epoch)?;
        let params: ContextParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let request_generation = self.begin_context_request(epoch)?;
        let requested_thread = params
            .thread_id
            .as_deref()
            .map(|thread| thread.strip_prefix("local:").unwrap_or(thread))
            .map(str::to_owned);

        if let Some(thread_id) = requested_thread {
            if let Some(workspace) = self.inner.manual_workspace.clone() {
                self.replace_context(Some(thread_id), workspace, epoch, request_generation)
                    .await?;
            } else {
                let resolver = self.inner.resolver.as_ref().ok_or_else(no_context_error)?;
                let resolved = resolver.resolve_thread(&thread_id).await;
                self.ensure_context_request(epoch, request_generation)?;
                let resolved = resolved.map_err(map_resolver_error)?;
                let workspace = Workspace::open(resolved.cwd).map(Arc::new);
                self.ensure_context_request(epoch, request_generation)?;
                let workspace = workspace.map_err(map_workspace_error)?;
                self.replace_context(Some(thread_id), workspace, epoch, request_generation)
                    .await?;
            }
        } else if lock_unpoisoned(&self.inner.state)
            .current
            .as_ref()
            .is_none_or(|context| context.lifecycle_epoch != epoch)
        {
            if let Some(workspace) = self.inner.manual_workspace.clone() {
                self.replace_context(None, workspace, epoch, request_generation)
                    .await?;
            }
        }

        let context = self.active_context_for_request(epoch, request_generation)?;
        let result = ContextResult {
            thread_id: context.thread_id,
            project_name: context.workspace.display_name().to_owned(),
            root_name: context.workspace.display_name().to_owned(),
            root_path: context.workspace.root_path().to_string_lossy().into_owned(),
            compatible: true,
            reason: None,
        };
        serde_json::to_value(result).map_err(|_| internal_error())
    }

    async fn replace_context(
        &self,
        thread_id: Option<String>,
        workspace: Arc<Workspace>,
        epoch: u64,
        request_generation: u64,
    ) -> Result<(), BridgeError> {
        let mut subscription = None;
        loop {
            self.ensure_context_request(epoch, request_generation)?;
            let watch_enabled = lock_unpoisoned(&self.inner.state).watch_enabled;
            if watch_enabled && subscription.is_none() {
                let visibility = self.watch_visibility();
                let candidate = WorkspaceWatcher::subscribe_with_visibility(
                    workspace.clone(),
                    Duration::from_millis(150),
                    visibility,
                );
                self.ensure_context_request(epoch, request_generation)?;
                match candidate {
                    Ok(candidate) => subscription = Some(candidate),
                    Err(error) => {
                        let state = lock_unpoisoned(&self.inner.state);
                        self.ensure_context_request(epoch, request_generation)?;
                        if state.watch_enabled {
                            return Err(map_workspace_error(error));
                        }
                    }
                }
            }

            let visibility = self.watch_visibility();
            let mut state = lock_unpoisoned(&self.inner.state);
            self.ensure_context_request(epoch, request_generation)?;
            if state.watch_enabled && subscription.is_none() {
                drop(state);
                continue;
            }

            let revision = self.inner.context_revision.fetch_add(1, Ordering::AcqRel) + 1;
            let generation = self.inner.watch_generation.fetch_add(1, Ordering::AcqRel) + 1;
            if let Some(task) = state.watch_task.take() {
                task.abort();
            }
            state.watch_visibility = None;
            state.current = Some(ActiveContext {
                thread_id,
                workspace,
                lifecycle_epoch: epoch,
                revision,
            });
            if state.watch_enabled {
                let replacement = subscription.take().ok_or_else(internal_error)?;
                replacement.visibility.update(visibility);
                self.install_watcher_locked(&mut state, replacement, generation, epoch);
            }
            return Ok(());
        }
    }

    async fn list(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.list_with_scanner(params, epoch, |workspace, options| workspace.list(options))
            .await
    }

    async fn preview(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.preview_with_reader(params, epoch, |workspace, relative_path| {
            workspace.preview(&relative_path)
        })
        .await
    }

    async fn preview_save(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.preview_save_with_writer(
            params,
            epoch,
            |workspace, relative_path, version, content| {
                workspace.save_preview(&relative_path, &version, &content)
            },
        )
        .await
    }

    async fn entry_create(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: EntryCreateParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let entry = self
            .active_workspace_operation(epoch, move |workspace| {
                workspace.create_entry(
                    &params.parent_relative_path,
                    &params.name,
                    params.kind.into(),
                )
            })
            .await?;
        serde_json::to_value(entry).map_err(|_| internal_error())
    }

    async fn entry_rename(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: EntryRenameParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let entry = self
            .active_workspace_operation(epoch, move |workspace| {
                workspace.rename_entry(&params.relative_path, &params.new_name)
            })
            .await?;
        serde_json::to_value(entry).map_err(|_| internal_error())
    }

    async fn entry_move(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: EntryMoveParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let entry = self
            .active_workspace_operation(epoch, move |workspace| {
                workspace.move_entry(
                    &params.relative_path,
                    &params.destination_parent_relative_path,
                )
            })
            .await?;
        serde_json::to_value(entry).map_err(|_| internal_error())
    }

    async fn entry_move_batch(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        // Try parsing as batch first (from keyboard shortcut), fall back to single (from context menu).
        if let Ok(batch_params) = serde_json::from_value::<BatchMoveParams>(params.clone()) {
            if batch_params.source_paths.is_empty() || batch_params.source_paths.len() > 1024 {
                return Err(BridgeError::invalid_request());
            }

            let mut results = Vec::new();
            for source_path in batch_params.source_paths {
                let target_dir = batch_params.target_directory.clone();
                let entry = self
                    .active_workspace_operation(epoch, move |workspace| {
                        workspace.move_entry(&source_path, &target_dir)
                    })
                    .await?;
                results.push(entry);
            }

            return serde_json::to_value(json!({ "entries": results })).map_err(|_| internal_error());
        }

        // Fall back to single-entry move for backward compatibility
        self.entry_move(params, epoch).await
    }

    async fn entry_copy(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: BatchCopyParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        if params.source_paths.is_empty() || params.source_paths.len() > 1024 {
            return Err(BridgeError::invalid_request());
        }

        let mut results = Vec::new();
        for source_path in params.source_paths {
            let target_dir = params.target_directory.clone();
            let entry = self
                .active_workspace_operation(epoch, move |workspace| {
                    workspace.copy_entry(&source_path, &target_dir)
                })
                .await?;
            results.push(entry);
        }

        serde_json::to_value(json!({ "entries": results })).map_err(|_| internal_error())
    }

    async fn entry_delete(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: EntryPathParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.active_workspace_operation(epoch, move |workspace| {
            workspace.delete_entry(&params.relative_path)
        })
        .await?;
        Ok(json!({ "deleted": true }))
    }

    async fn entry_reveal(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.entry_reveal_with_opener(params, epoch, reveal_in_file_explorer)
            .await
    }

    async fn entry_reveal_with_opener<F>(
        &self,
        params: Value,
        epoch: u64,
        opener: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(&Path) -> Result<(), WorkspaceError> + Send + 'static,
    {
        let params: EntryPathParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.active_workspace_operation(epoch, move |workspace| {
            let target = workspace.reveal_path(&params.relative_path)?;
            opener(&target)
        })
        .await?;
        Ok(json!({ "revealed": true }))
    }

    async fn active_workspace_operation<T, F>(
        &self,
        epoch: u64,
        operation: F,
    ) -> Result<T, BridgeError>
    where
        T: Send + 'static,
        F: FnOnce(Arc<Workspace>) -> Result<T, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let bridge = self.clone();
        tokio::task::spawn_blocking(move || {
            // Keep mutations and their native side effects linearized with
            // context clear, task switching, and document invalidation.
            let state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            let context = state.current.as_ref().ok_or_else(no_context_error)?;
            if context.lifecycle_epoch != epoch {
                return Err(cancelled_error());
            }
            operation(context.workspace.clone()).map_err(map_workspace_error)
        })
        .await
        .map_err(|_| internal_error())?
    }

    async fn preview_save_with_writer<F>(
        &self,
        params: Value,
        epoch: u64,
        writer: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, String, String, Vec<u8>) -> Result<PreviewResult, WorkspaceError>
            + Send
            + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: PreviewSaveParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        if params.expected_version.len() != 64
            || !params
                .expected_version
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(BridgeError::invalid_request());
        }
        let content = BASE64_STANDARD
            .decode(params.content_base64)
            .map_err(|_| BridgeError::invalid_request())?;
        if content.len() > MAX_PREVIEW_BYTES {
            return Err(map_workspace_error(WorkspaceError::ContentTooLarge));
        }

        // Mutation is intentionally performed under the active-context lock.
        // Context clear/switch and lifecycle invalidation therefore linearize
        // either before this save begins or after it has fully synced.
        let bridge = self.clone();
        tokio::task::spawn_blocking(move || {
            let state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            let context = state.current.as_ref().ok_or_else(no_context_error)?;
            if context.lifecycle_epoch != epoch {
                return Err(cancelled_error());
            }
            let preview = writer(
                context.workspace.clone(),
                params.relative_path,
                params.expected_version,
                content,
            )
            .map_err(map_workspace_error)?;
            serde_json::to_value(preview).map_err(|_| internal_error())
        })
        .await
        .map_err(|_| internal_error())?
    }

    async fn list_with_scanner<F>(
        &self,
        params: Value,
        epoch: u64,
        scanner: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, ListOptions) -> Result<ListPage, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: ListParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let options = ListOptions {
            relative_path: params.relative_path,
            cursor: params.cursor,
            limit: params.limit.unwrap_or(200),
            show_hidden: true,
            show_ignored: true,
        };
        let workspace = context.workspace.clone();
        let page = tokio::task::spawn_blocking(move || scanner(workspace, options)).await;
        self.ensure_active_context(&context, epoch)?;
        let page = page
            .map_err(|_| internal_error())?
            .map_err(map_workspace_error)?;
        serde_json::to_value(page).map_err(|_| internal_error())
    }

    async fn preview_with_reader<F>(
        &self,
        params: Value,
        epoch: u64,
        reader: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, String) -> Result<PreviewResult, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: PreviewParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let preview =
            tokio::task::spawn_blocking(move || reader(workspace, params.relative_path)).await;
        self.ensure_active_context(&context, epoch)?;
        let preview = preview
            .map_err(|_| internal_error())?
            .map_err(map_workspace_error)?;
        serde_json::to_value(preview).map_err(|_| internal_error())
    }

    async fn settings_get(&self, params: Value) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        serde_json::to_value(read_unpoisoned(&self.inner.settings).clone())
            .map_err(|_| internal_error())
    }

    async fn settings_set(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.settings_set_with_preparer(params, epoch, |store, settings| store.prepare(&settings))
            .await
    }

    async fn settings_set_with_preparer<F>(
        &self,
        params: Value,
        epoch: u64,
        prepare: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(SettingsStore, Settings) -> Result<PreparedSettings, WorkspaceError>
            + Send
            + 'static,
    {
        self.ensure_epoch(epoch)?;
        let _update = self.inner.settings_update_lock.lock().await;
        self.ensure_epoch(epoch)?;
        let patch: SettingsPatch = if params.get("settings").is_some() {
            serde_json::from_value::<SettingsWrapper>(params)
                .map(|wrapper| wrapper.settings)
                .map_err(|_| BridgeError::invalid_request())?
        } else {
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?
        };
        let mut updated = read_unpoisoned(&self.inner.settings).clone();
        updated.apply(patch).map_err(map_workspace_error)?;
        let response = serde_json::to_value(&updated).map_err(|_| internal_error())?;
        let store = self.inner.settings_store.clone();
        let to_prepare = updated.clone();
        let prepared = tokio::task::spawn_blocking(move || prepare(store, to_prepare)).await;
        let mut settings = write_unpoisoned(&self.inner.settings);
        let _state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        let prepared = prepared
            .map_err(|_| internal_error())?
            .map_err(map_workspace_error)?;
        prepared.commit().map_err(map_workspace_error)?;
        *settings = updated;
        Ok(response)
    }

    async fn watch_start(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.ensure_epoch(epoch)?;
        require_empty_object(&params)?;
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        let visibility = self.watch_visibility();
        let subscription = WorkspaceWatcher::subscribe_with_visibility(
            context.workspace.clone(),
            Duration::from_millis(150),
            visibility,
        );
        self.ensure_epoch(epoch)?;
        let mut state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        if state
            .current
            .as_ref()
            .is_none_or(|active| active.revision != context.revision)
        {
            return Err(cancelled_error());
        }
        let subscription = subscription.map_err(map_workspace_error)?;
        let generation = self.inner.watch_generation.fetch_add(1, Ordering::AcqRel) + 1;
        if let Some(task) = state.watch_task.take() {
            task.abort();
        }
        state.watch_enabled = true;
        state.watch_visibility = None;
        self.install_watcher_locked(&mut state, subscription, generation, epoch);
        Ok(json!({ "watching": true }))
    }

    fn watch_stop(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        let mut state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        self.stop_watcher_locked(&mut state);
        Ok(json!({ "watching": false }))
    }

    fn context_clear(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        let mut state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        let request_generation = self.bump_context_request_generation();
        self.ensure_context_request(epoch, request_generation)?;
        self.stop_watcher_locked(&mut state);
        state.current = None;
        self.inner.context_revision.fetch_add(1, Ordering::AcqRel);
        Ok(json!({ "cleared": true }))
    }

    fn stop_watcher_locked(&self, state: &mut BridgeState) {
        state.watch_enabled = false;
        self.inner.watch_generation.fetch_add(1, Ordering::AcqRel);
        state.watch_visibility = None;
        if let Some(task) = state.watch_task.take() {
            task.abort();
        }
    }

    fn install_watcher_locked(
        &self,
        state: &mut BridgeState,
        mut subscription: WatchSubscription,
        generation: u64,
        epoch: u64,
    ) {
        state.watch_visibility = Some(subscription.visibility.clone());
        let bridge = self.clone();
        let lifecycle_epoch = epoch;
        state.watch_task = Some(tokio::spawn(async move {
            while let Some(batch) = subscription.receiver.recv().await {
                if bridge.inner.watch_generation.load(Ordering::Acquire) != generation {
                    break;
                }
                if batch.resync {
                    bridge
                        .notify_watcher_at(
                            json!({ "method": "explorer.resync", "params": {} }),
                            lifecycle_epoch,
                            generation,
                        )
                        .await;
                }
                if !batch.changes.is_empty() {
                    bridge
                        .notify_watcher_at(
                            json!({
                                "method": "explorer.changed",
                                "params": { "changes": batch.changes }
                            }),
                            lifecycle_epoch,
                            generation,
                        )
                        .await;
                }
            }
            if bridge.inner.watch_generation.load(Ordering::Acquire) == generation {
                let should_notify = {
                    let mut state = lock_unpoisoned(&bridge.inner.state);
                    if bridge.inner.watch_generation.load(Ordering::Acquire) == generation {
                        state.watch_enabled = false;
                        state.watch_visibility = None;
                        state.watch_task = None;
                        true
                    } else {
                        false
                    }
                };
                if should_notify {
                    bridge
                        .notify_watcher_at(
                            json!({ "method": "explorer.resync", "params": {} }),
                            lifecycle_epoch,
                            generation,
                        )
                        .await;
                }
            }
        }));
    }

    fn watch_visibility(&self) -> WatchVisibility {
        WatchVisibility {
            show_hidden: true,
            show_ignored: true,
        }
    }

    fn begin_context_request(&self, epoch: u64) -> Result<u64, BridgeError> {
        let _state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        Ok(self.bump_context_request_generation())
    }

    fn bump_context_request_generation(&self) -> u64 {
        self.inner
            .context_request_generation
            .fetch_add(1, Ordering::AcqRel)
            + 1
    }

    fn ensure_context_request(
        &self,
        epoch: u64,
        request_generation: u64,
    ) -> Result<(), BridgeError> {
        self.ensure_epoch(epoch)?;
        if self
            .inner
            .context_request_generation
            .load(Ordering::Acquire)
            == request_generation
        {
            Ok(())
        } else {
            Err(cancelled_error())
        }
    }

    fn active_context_for_request(
        &self,
        epoch: u64,
        request_generation: u64,
    ) -> Result<ActiveContext, BridgeError> {
        let state = lock_unpoisoned(&self.inner.state);
        self.ensure_context_request(epoch, request_generation)?;
        state.current.clone().ok_or_else(no_context_error)
    }

    fn ensure_active_context(
        &self,
        expected: &ActiveContext,
        epoch: u64,
    ) -> Result<(), BridgeError> {
        self.ensure_epoch(epoch)?;
        let state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        if state.current.as_ref().is_some_and(|current| {
            current.lifecycle_epoch == epoch
                && current.revision == expected.revision
                && Arc::ptr_eq(&current.workspace, &expected.workspace)
        }) {
            Ok(())
        } else {
            Err(cancelled_error())
        }
    }

    async fn notify_watcher_at(
        &self,
        notification: Value,
        lifecycle_epoch: u64,
        watch_generation: u64,
    ) {
        let sender = self.inner.notification_sender.read().await.clone();
        let _state = lock_unpoisoned(&self.inner.state);
        if self.inner.watch_generation.load(Ordering::Acquire) == watch_generation
            && let Some(sender) = sender
        {
            let _ = sender.send(BridgeNotification {
                payload: notification,
                lifecycle_epoch,
            });
        }
    }

    fn ensure_epoch(&self, epoch: u64) -> Result<(), BridgeError> {
        if self.inner.lifecycle_epoch.load(Ordering::Acquire) == epoch {
            Ok(())
        } else {
            Err(BridgeError::new(
                "CANCELLED",
                "The native operation belongs to an inactive document.",
            ))
        }
    }
}

#[async_trait]
impl BridgeHandler for NativeBridge {
    async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
        let epoch = request.lifecycle_epoch;
        self.ensure_epoch(epoch)?;
        match request.method.as_str() {
            "explorer.context" => self.context(request.params, epoch).await,
            "explorer.context.clear" => self.context_clear(request.params, epoch),
            "explorer.list" => self.list(request.params, epoch).await,
            "explorer.preview" => self.preview(request.params, epoch).await,
            "explorer.preview.save" => self.preview_save(request.params, epoch).await,
            "explorer.entry.create" => self.entry_create(request.params, epoch).await,
            "explorer.entry.rename" => self.entry_rename(request.params, epoch).await,
            "explorer.entry.move" => self.entry_move_batch(request.params, epoch).await,
            "explorer.entry.copy" => self.entry_copy(request.params, epoch).await,
            "explorer.entry.delete" => self.entry_delete(request.params, epoch).await,
            "explorer.entry.reveal" => self.entry_reveal(request.params, epoch).await,
            "explorer.watch.start" => self.watch_start(request.params, epoch).await,
            "explorer.watch.stop" => self.watch_stop(request.params, epoch),
            "explorer.settings.get" => self.settings_get(request.params).await,
            "explorer.settings.set" => self.settings_set(request.params, epoch).await,
            _ => Err(BridgeError::new(
                "INVALID_REQUEST",
                "The native method is not allowed.",
            )),
        }
    }

    fn lifecycle_epoch(&self) -> u64 {
        self.inner.lifecycle_epoch.load(Ordering::Acquire)
    }

    fn invalidate_lifecycle(&self) {
        let mut state = lock_unpoisoned(&self.inner.state);
        self.bump_context_request_generation();
        self.inner.lifecycle_epoch.fetch_add(1, Ordering::AcqRel);
        self.stop_watcher_locked(&mut state);
        state.current = None;
        self.inner.context_revision.fetch_add(1, Ordering::AcqRel);
    }
}

fn lock_unpoisoned<T>(mutex: &StdMutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn read_unpoisoned<T>(lock: &std::sync::RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn write_unpoisoned<T>(lock: &std::sync::RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn require_empty_object(value: &Value) -> Result<(), BridgeError> {
    if value.as_object().is_some_and(serde_json::Map::is_empty) || value.is_null() {
        Ok(())
    } else {
        Err(BridgeError::invalid_request())
    }
}

fn no_context_error() -> BridgeError {
    BridgeError::new("NO_CONTEXT", "The active task has no local workspace.")
}

fn internal_error() -> BridgeError {
    BridgeError::new("INTERNAL", "The native operation failed.")
}

fn cancelled_error() -> BridgeError {
    BridgeError::new(
        "CANCELLED",
        "The native operation belongs to an inactive document or context.",
    )
}

#[cfg(windows)]
fn reveal_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    build_reveal_command(target)?
        .spawn()
        .map_err(|_| WorkspaceError::Internal)?;
    Ok(())
}

#[cfg(windows)]
fn build_reveal_command(target: &Path) -> Result<Command, WorkspaceError> {
    let windows_directory = std::env::var_os("SystemRoot")
        .filter(|value| !value.is_empty())
        .ok_or(WorkspaceError::Internal)?;
    let explorer = std::path::PathBuf::from(windows_directory).join("explorer.exe");
    if !explorer.is_absolute() {
        return Err(WorkspaceError::Internal);
    }
    let mut command = Command::new(explorer);
    command.arg("/select,").arg(target);
    Ok(command)
}

#[cfg(not(windows))]
fn reveal_in_file_explorer(_target: &Path) -> Result<(), WorkspaceError> {
    Err(WorkspaceError::Internal)
}

fn map_resolver_error(error: ResolverError) -> BridgeError {
    match error {
        ResolverError::NoWorkspace | ResolverError::InvalidThreadId => no_context_error(),
        _ => internal_error(),
    }
}

fn map_workspace_error(error: WorkspaceError) -> BridgeError {
    let code = match error.code() {
        ErrorCode::InvalidPath => "INVALID_PATH",
        ErrorCode::OutsideWorkspace => "OUTSIDE_WORKSPACE",
        ErrorCode::NotFound => "NOT_FOUND",
        ErrorCode::AccessDenied => "ACCESS_DENIED",
        ErrorCode::NotDirectory => "INVALID_PATH",
        ErrorCode::TooManyEntries => "TOO_MANY_ENTRIES",
        ErrorCode::ContentTooLarge => "CONTENT_TOO_LARGE",
        ErrorCode::Conflict => "CONFLICT",
        ErrorCode::NotEditable => "NOT_EDITABLE",
        ErrorCode::InvalidSettings => "INVALID_REQUEST",
        ErrorCode::Internal => "INTERNAL",
    };
    BridgeError::new(code, error.public_message())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc as std_mpsc;

    use cdp_client::CapabilityToken;
    use tempfile::TempDir;
    use tokio::io::{
        AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader, duplex, split,
    };
    use tokio::sync::oneshot;

    use super::*;

    async fn manual_bridge() -> (TempDir, NativeBridge) {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir(directory.path().join("src")).expect("src");
        fs::write(directory.path().join("README.md"), "content").expect("file");
        let workspace = Arc::new(Workspace::open(directory.path()).expect("workspace"));
        let settings_store = SettingsStore::new(directory.path().join("settings/settings.json"));
        let bridge = NativeBridge::new(None, Some(workspace), settings_store, Settings::default());
        bridge.initialize_manual().await;
        (directory, bridge)
    }

    fn request(method: &str, params: Value) -> BindingRequest {
        request_at(method, params, 0)
    }

    fn request_at(method: &str, params: Value, lifecycle_epoch: u64) -> BindingRequest {
        BindingRequest {
            id: "test-1".to_owned(),
            token: CapabilityToken::generate().expose().to_owned(),
            method: method.to_owned(),
            params,
            lifecycle_epoch,
        }
    }

    async fn read_json_line<R>(reader: &mut R) -> Value
    where
        R: AsyncBufRead + Unpin,
    {
        let mut line = String::new();
        reader.read_line(&mut line).await.expect("read JSONL");
        serde_json::from_str(&line).expect("valid JSONL")
    }

    async fn write_json_line<W>(writer: &mut W, value: Value)
    where
        W: AsyncWrite + Unpin,
    {
        let mut encoded = serde_json::to_vec(&value).expect("encode JSONL");
        encoded.push(b'\n');
        writer.write_all(&encoded).await.expect("write JSONL");
    }

    #[tokio::test]
    async fn manual_context_reports_the_absolute_root_and_hides_it_from_the_name() {
        let (directory, bridge) = manual_bridge().await;
        let response = bridge
            .handle(request("explorer.context", json!({})))
            .await
            .expect("context");
        // The absolute root is sent once so the renderer can build absolute
        // paths locally (Copy Absolute Path) without a per-action round-trip.
        let root = directory.path().to_string_lossy().to_string();
        assert_eq!(response["rootPath"], json!(root));
        // The display name must remain a leaf label, never the absolute path.
        assert_ne!(response["rootName"], json!(root));
        assert!(!response["rootName"].as_str().unwrap().contains(['/', '\\']));
        assert_eq!(response["compatible"], true);
    }

    #[tokio::test]
    async fn renderer_cannot_supply_workspace_root_or_traverse() {
        let (_directory, bridge) = manual_bridge().await;
        let spoof = bridge
            .handle(request(
                "explorer.context",
                json!({ "workspaceRoot": "C:\\Windows" }),
            ))
            .await;
        assert!(spoof.is_err());

        let traversal = bridge
            .handle(request(
                "explorer.list",
                json!({ "relativePath": "../outside" }),
            ))
            .await
            .expect_err("traversal");
        assert_eq!(traversal.code, "INVALID_PATH");
    }

    #[tokio::test]
    async fn legacy_visibility_settings_cannot_hide_list_entries() {
        let (directory, bridge) = manual_bridge().await;
        fs::create_dir(directory.path().join(".git")).expect("git metadata");
        fs::create_dir(directory.path().join("node_modules")).expect("ignored directory");
        fs::write(directory.path().join(".secret"), "hidden").expect("hidden file");

        let settings = bridge
            .handle(request(
                "explorer.settings.set",
                json!({ "showHidden": false, "showIgnored": false }),
            ))
            .await
            .expect("legacy settings update");
        assert_eq!(settings["showHidden"], false);
        assert_eq!(settings["showIgnored"], false);

        let page = bridge
            .handle(request("explorer.list", json!({})))
            .await
            .expect("all-visible list");
        let entries = page["entries"].as_array().expect("entries");
        for expected in [".git", ".secret", "node_modules"] {
            assert!(
                entries.iter().any(|entry| entry["name"] == expected),
                "missing all-visible entry: {expected}"
            );
        }
    }

    #[tokio::test]
    async fn method_allowlist_keeps_generic_content_and_mutation_apis_forbidden() {
        let (_directory, bridge) = manual_bridge().await;
        for method in [
            "explorer.readFile",
            "explorer.writeFile",
            "explorer.create",
            "explorer.delete",
            "explorer.remove",
            "explorer.move",
            "explorer.reveal",
            "shell.execute",
        ] {
            let result = bridge.handle(request(method, json!({}))).await;
            assert!(result.is_err(), "method must be rejected: {method}");
        }
    }

    #[tokio::test]
    async fn preview_accepts_only_its_bounded_schema_and_returns_camel_case_text() {
        let (_directory, bridge) = manual_bridge().await;
        let preview = bridge
            .handle(request(
                "explorer.preview",
                json!({ "relativePath": "README.md" }),
            ))
            .await
            .expect("preview");
        assert_eq!(preview["kind"], "text");
        assert_eq!(preview["text"], "content");
        assert_eq!(preview["sizeBytes"], 7);
        assert_eq!(preview["truncated"], false);
        assert_eq!(preview["editable"], true);
        assert_eq!(preview["lineEnding"], "none");
        assert_eq!(preview["version"].as_str().map(str::len), Some(64));
        assert!(preview.get("reason").is_none());

        for invalid in [
            json!({}),
            json!({ "relativePath": "README.md", "limit": 1 }),
            json!({ "relativePath": 7 }),
            json!({ "relative_path": "README.md" }),
        ] {
            let error = bridge
                .handle(request("explorer.preview", invalid))
                .await
                .expect_err("invalid preview schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }
    }

    #[tokio::test]
    async fn preview_save_uses_an_exact_bounded_schema_and_detects_conflicts() {
        let (directory, bridge) = manual_bridge().await;
        let preview = bridge
            .handle(request(
                "explorer.preview",
                json!({ "relativePath": "README.md" }),
            ))
            .await
            .expect("preview");
        let version = preview["version"].as_str().expect("preview version");
        let params = json!({
            "relativePath": "README.md",
            "expectedVersion": version,
            "contentBase64": BASE64_STANDARD.encode("updated content\n"),
        });
        let saved = bridge
            .handle(request("explorer.preview.save", params.clone()))
            .await
            .expect("save");
        assert_eq!(saved["text"], "updated content\n");
        assert_eq!(saved["editable"], true);
        assert_ne!(saved["version"], preview["version"]);
        assert_eq!(
            fs::read_to_string(directory.path().join("README.md")).expect("saved file"),
            "updated content\n"
        );

        let conflict = bridge
            .handle(request("explorer.preview.save", params))
            .await
            .expect_err("stale version");
        assert_eq!(conflict.code, "CONFLICT");

        for invalid in [
            json!({}),
            json!({
                "relativePath": "README.md",
                "expectedVersion": saved["version"],
                "contentBase64": BASE64_STANDARD.encode("valid"),
                "force": true,
            }),
            json!({
                "relativePath": "README.md",
                "expectedVersion": "not-a-version",
                "contentBase64": BASE64_STANDARD.encode("valid"),
            }),
            json!({
                "relativePath": "README.md",
                "expectedVersion": saved["version"],
                "contentBase64": "%%%",
            }),
        ] {
            let error = bridge
                .handle(request("explorer.preview.save", invalid))
                .await
                .expect_err("invalid save schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }

        let oversized = bridge
            .handle(request(
                "explorer.preview.save",
                json!({
                    "relativePath": "README.md",
                    "expectedVersion": saved["version"],
                    "contentBase64": BASE64_STANDARD.encode(vec![b'x'; MAX_PREVIEW_BYTES + 1]),
                }),
            ))
            .await
            .expect_err("oversized content");
        assert_eq!(oversized.code, "CONTENT_TOO_LARGE");
    }

    #[tokio::test]
    async fn entry_mutations_use_exact_schemas_and_return_relative_entries() {
        let (directory, bridge) = manual_bridge().await;

        let created_file = bridge
            .handle(request(
                "explorer.entry.create",
                json!({
                    "parentRelativePath": "src",
                    "name": "generated.rs",
                    "kind": "file",
                }),
            ))
            .await
            .expect("create file");
        assert_eq!(created_file["relativePath"], "src/generated.rs");
        assert_eq!(created_file["name"], "generated.rs");
        assert_eq!(created_file["kind"], "file");
        assert_eq!(
            fs::read(directory.path().join("src/generated.rs")).expect("created bytes"),
            b""
        );

        let created_directory = bridge
            .handle(request(
                "explorer.entry.create",
                json!({
                    "parentRelativePath": "src",
                    "name": "nested",
                    "kind": "directory",
                }),
            ))
            .await
            .expect("create directory");
        assert_eq!(created_directory["relativePath"], "src/nested");
        assert_eq!(created_directory["kind"], "directory");
        assert!(directory.path().join("src/nested").is_dir());
        fs::write(directory.path().join("src/nested/child.txt"), "child").expect("nested child");

        let renamed = bridge
            .handle(request(
                "explorer.entry.rename",
                json!({
                    "relativePath": "src/generated.rs",
                    "newName": "renamed.rs",
                }),
            ))
            .await
            .expect("rename file");
        assert_eq!(renamed["relativePath"], "src/renamed.rs");
        assert_eq!(renamed["name"], "renamed.rs");
        assert!(!directory.path().join("src/generated.rs").exists());
        assert!(directory.path().join("src/renamed.rs").is_file());

        let moved = bridge
            .handle(request(
                "explorer.entry.move",
                json!({
                    "relativePath": "src/renamed.rs",
                    "destinationParentRelativePath": "",
                }),
            ))
            .await
            .expect("move file");
        assert_eq!(moved["relativePath"], "renamed.rs");
        assert_eq!(moved["name"], "renamed.rs");
        assert!(!directory.path().join("src/renamed.rs").exists());
        assert!(directory.path().join("renamed.rs").is_file());

        let deleted = bridge
            .handle(request(
                "explorer.entry.delete",
                json!({ "relativePath": "src/nested" }),
            ))
            .await
            .expect("delete directory");
        assert_eq!(deleted, json!({ "deleted": true }));
        assert!(!directory.path().join("src/nested").exists());

        for (method, params) in [
            (
                "explorer.entry.create",
                json!({ "name": "missing-parent.txt", "kind": "file" }),
            ),
            (
                "explorer.entry.create",
                json!({
                    "parentRelativePath": "",
                    "name": "extra.txt",
                    "kind": "file",
                    "overwrite": true,
                }),
            ),
            (
                "explorer.entry.rename",
                json!({
                    "relativePath": "README.md",
                    "newName": "README.txt",
                    "destination": "elsewhere/README.txt",
                }),
            ),
            (
                "explorer.entry.delete",
                json!({ "relativePath": "README.md", "recursive": true }),
            ),
            (
                "explorer.entry.move",
                json!({ "relativePath": "README.md" }),
            ),
            (
                "explorer.entry.move",
                json!({
                    "relativePath": "README.md",
                    "destinationParentRelativePath": "src",
                    "overwrite": true,
                }),
            ),
        ] {
            let error = bridge
                .handle(request(method, params))
                .await
                .expect_err("unknown fields must fail");
            assert_eq!(error.code, "INVALID_REQUEST", "method: {method}");
        }
    }

    #[tokio::test]
    async fn entry_mutations_reject_traversal_roots_reserved_names_and_collisions() {
        let (directory, bridge) = manual_bridge().await;
        fs::write(directory.path().join("occupied.txt"), "keep").expect("occupied");

        for params in [
            json!({ "parentRelativePath": "../outside", "name": "x", "kind": "file" }),
            json!({ "parentRelativePath": "", "name": "../outside", "kind": "file" }),
            json!({ "parentRelativePath": "", "name": "CON.txt", "kind": "file" }),
            json!({ "parentRelativePath": "", "name": "trailing.", "kind": "directory" }),
        ] {
            let error = bridge
                .handle(request("explorer.entry.create", params))
                .await
                .expect_err("invalid create path");
            assert_eq!(error.code, "INVALID_PATH");
        }

        let collision = bridge
            .handle(request(
                "explorer.entry.create",
                json!({
                    "parentRelativePath": "",
                    "name": "occupied.txt",
                    "kind": "file",
                }),
            ))
            .await
            .expect_err("create must not overwrite");
        assert_eq!(collision.code, "CONFLICT");
        assert_eq!(
            fs::read_to_string(directory.path().join("occupied.txt")).expect("unchanged"),
            "keep"
        );

        for (method, params) in [
            (
                "explorer.entry.rename",
                json!({ "relativePath": "", "newName": "workspace-renamed" }),
            ),
            (
                "explorer.entry.rename",
                json!({ "relativePath": "README.md", "newName": "../outside" }),
            ),
            ("explorer.entry.delete", json!({ "relativePath": "" })),
            (
                "explorer.entry.delete",
                json!({ "relativePath": "../outside" }),
            ),
            (
                "explorer.entry.move",
                json!({
                    "relativePath": "",
                    "destinationParentRelativePath": "src",
                }),
            ),
            (
                "explorer.entry.move",
                json!({
                    "relativePath": "README.md",
                    "destinationParentRelativePath": "../outside",
                }),
            ),
        ] {
            let error = bridge
                .handle(request(method, params))
                .await
                .expect_err("invalid mutation path");
            assert_eq!(error.code, "INVALID_PATH", "method: {method}");
        }
    }

    #[tokio::test]
    async fn reveal_validates_natively_without_returning_the_absolute_path() {
        let (directory, bridge) = manual_bridge().await;
        fs::create_dir(directory.path().join("folder with spaces")).expect("reveal folder");
        fs::write(
            directory
                .path()
                .join("folder with spaces/\u{6587}\u{4ef6}.txt"),
            "content",
        )
        .expect("reveal file");
        let relative = "folder with spaces/\u{6587}\u{4ef6}.txt";
        let expected = directory.path().join(relative);
        let captured = Arc::new(StdMutex::new(None::<std::path::PathBuf>));
        let opener_capture = captured.clone();
        let response = bridge
            .entry_reveal_with_opener(json!({ "relativePath": relative }), 0, move |target| {
                *lock_unpoisoned(&opener_capture) = Some(target.to_path_buf());
                Ok(())
            })
            .await
            .expect("reveal");
        assert_eq!(response, json!({ "revealed": true }));
        assert_eq!(
            lock_unpoisoned(&captured).as_deref(),
            Some(expected.as_path())
        );
        assert!(
            !response
                .to_string()
                .contains(&directory.path().to_string_lossy().to_string())
        );

        for invalid in [
            json!({}),
            json!({ "relativePath": "README.md", "command": "cmd.exe" }),
            json!({ "relativePath": "../outside" }),
            json!({ "relativePath": "missing.txt" }),
        ] {
            let invoked = Arc::new(StdMutex::new(false));
            let invoked_in_opener = invoked.clone();
            let error = bridge
                .entry_reveal_with_opener(invalid, 0, move |_| {
                    *lock_unpoisoned(&invoked_in_opener) = true;
                    Ok(())
                })
                .await
                .expect_err("invalid reveal");
            assert!(matches!(
                error.code.as_str(),
                "INVALID_REQUEST" | "INVALID_PATH" | "NOT_FOUND"
            ));
            assert!(!*lock_unpoisoned(&invoked));
        }
    }

    #[cfg(windows)]
    #[test]
    fn reveal_command_keeps_the_selector_separate_from_a_unicode_path() {
        let target = Path::new("C:\\workspace with spaces\\\u{6587}\u{4ef6}, source.rs");
        let command = build_reveal_command(target).expect("reveal command");
        assert_eq!(
            Path::new(command.get_program()).file_name(),
            Some(std::ffi::OsStr::new("explorer.exe"))
        );
        let arguments: Vec<_> = command.get_args().map(ToOwned::to_owned).collect();
        assert_eq!(
            arguments,
            [
                std::ffi::OsString::from("/select,"),
                target.as_os_str().to_owned(),
            ]
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn context_clear_waits_for_an_in_progress_workspace_mutation() {
        let (directory, bridge) = manual_bridge().await;
        let (mutation_started, started) = oneshot::channel();
        let (release, mutation_release) = std_mpsc::channel();
        let mutation_bridge = bridge.clone();
        let mutation = tokio::spawn(async move {
            mutation_bridge
                .active_workspace_operation(0, move |workspace| {
                    let _ = mutation_started.send(());
                    mutation_release.recv().expect("release mutation");
                    workspace.create_entry("", "linearized.txt", CreateEntryKind::File)
                })
                .await
        });
        started.await.expect("mutation started");

        let clear_bridge = bridge.clone();
        let mut clear = tokio::spawn(async move {
            clear_bridge
                .handle(request("explorer.context.clear", json!({})))
                .await
        });
        assert!(
            tokio::time::timeout(Duration::from_millis(80), &mut clear)
                .await
                .is_err(),
            "context clear must wait while the mutation owns the active context"
        );

        release.send(()).expect("release mutation");
        let entry = mutation
            .await
            .expect("mutation task")
            .expect("mutation result");
        assert_eq!(entry.relative_path, "linearized.txt");
        assert!(directory.path().join("linearized.txt").is_file());
        clear
            .await
            .expect("clear task")
            .expect("clear after mutation");
        assert!(lock_unpoisoned(&bridge.inner.state).current.is_none());
    }

    #[tokio::test]
    async fn stale_document_cannot_invoke_workspace_entry_operations() {
        let (directory, bridge) = manual_bridge().await;
        bridge.invalidate_lifecycle();

        for (method, params) in [
            (
                "explorer.entry.create",
                json!({
                    "parentRelativePath": "",
                    "name": "stale.txt",
                    "kind": "file",
                }),
            ),
            (
                "explorer.entry.rename",
                json!({ "relativePath": "README.md", "newName": "stale.md" }),
            ),
            (
                "explorer.entry.move",
                json!({
                    "relativePath": "README.md",
                    "destinationParentRelativePath": "src",
                }),
            ),
            (
                "explorer.entry.delete",
                json!({ "relativePath": "README.md" }),
            ),
            (
                "explorer.entry.reveal",
                json!({ "relativePath": "README.md" }),
            ),
        ] {
            let error = bridge
                .handle(request_at(method, params, 0))
                .await
                .expect_err("stale document request");
            assert_eq!(error.code, "CANCELLED", "method: {method}");
        }

        assert!(!directory.path().join("stale.txt").exists());
        assert!(directory.path().join("README.md").is_file());
        assert!(!directory.path().join("stale.md").exists());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn context_clear_waits_for_an_in_progress_save_to_commit() {
        let (directory, bridge) = manual_bridge().await;
        let preview = bridge
            .handle(request(
                "explorer.preview",
                json!({ "relativePath": "README.md" }),
            ))
            .await
            .expect("preview");
        let params = json!({
            "relativePath": "README.md",
            "expectedVersion": preview["version"],
            "contentBase64": BASE64_STANDARD.encode("linearized\n"),
        });
        let (write_started, started) = oneshot::channel();
        let (release, write_release) = std_mpsc::channel();
        let save_bridge = bridge.clone();
        let save = tokio::spawn(async move {
            save_bridge
                .preview_save_with_writer(
                    params,
                    0,
                    move |workspace, relative_path, expected_version, content| {
                        let _ = write_started.send(());
                        write_release.recv().expect("release save");
                        workspace.save_preview(&relative_path, &expected_version, &content)
                    },
                )
                .await
        });
        started.await.expect("save started");

        let clear_bridge = bridge.clone();
        let clear = tokio::spawn(async move {
            clear_bridge
                .handle(request("explorer.context.clear", json!({})))
                .await
        });
        tokio::task::yield_now().await;
        assert!(!clear.is_finished(), "clear must wait for the active save");

        release.send(()).expect("release write");
        let saved = save.await.expect("save task").expect("saved response");
        assert_eq!(saved["text"], "linearized\n");
        assert_eq!(
            clear.await.expect("clear task").expect("clear")["cleared"],
            true
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("README.md")).expect("saved file"),
            "linearized\n"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn concurrent_saves_with_one_version_cannot_both_commit() {
        let (_directory, bridge) = manual_bridge().await;
        let preview = bridge
            .handle(request(
                "explorer.preview",
                json!({ "relativePath": "README.md" }),
            ))
            .await
            .expect("preview");
        let version = preview["version"].as_str().expect("version").to_owned();
        let first_bridge = bridge.clone();
        let first_version = version.clone();
        let first = tokio::spawn(async move {
            first_bridge
                .handle(request(
                    "explorer.preview.save",
                    json!({
                        "relativePath": "README.md",
                        "expectedVersion": first_version,
                        "contentBase64": BASE64_STANDARD.encode("first\n"),
                    }),
                ))
                .await
        });
        let second_bridge = bridge.clone();
        let second = tokio::spawn(async move {
            second_bridge
                .handle(request(
                    "explorer.preview.save",
                    json!({
                        "relativePath": "README.md",
                        "expectedVersion": version,
                        "contentBase64": BASE64_STANDARD.encode("second\n"),
                    }),
                ))
                .await
        });
        let results = [
            first.await.expect("first task"),
            second.await.expect("second task"),
        ];
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter_map(|result| result.as_ref().err())
                .filter(|error| error.code == "CONFLICT")
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn watch_start_installs_a_real_watcher_and_context_clear_stops_it() {
        let (_directory, bridge) = manual_bridge().await;
        let started = bridge
            .handle(request("explorer.watch.start", json!({})))
            .await
            .expect("watch start");
        assert_eq!(started["watching"], true);
        {
            let state = lock_unpoisoned(&bridge.inner.state);
            assert!(state.watch_enabled);
            assert!(state.watch_task.is_some());
            assert!(state.watch_visibility.is_some());
        }

        let cleared = bridge
            .handle(request("explorer.context.clear", json!({})))
            .await
            .expect("context clear");
        assert_eq!(cleared["cleared"], true);
        {
            let state = lock_unpoisoned(&bridge.inner.state);
            assert!(!state.watch_enabled);
            assert!(state.watch_task.is_none());
            assert!(state.watch_visibility.is_none());
            assert!(state.current.is_none());
        }

        let list = bridge
            .handle(request("explorer.list", json!({})))
            .await
            .expect_err("cleared context");
        assert_eq!(list.code, "NO_CONTEXT");

        let preview = bridge
            .handle(request(
                "explorer.preview",
                json!({ "relativePath": "README.md" }),
            ))
            .await
            .expect_err("preview after clear");
        assert_eq!(preview.code, "NO_CONTEXT");
    }

    #[tokio::test]
    async fn context_clear_rejects_renderer_supplied_fields() {
        let (_directory, bridge) = manual_bridge().await;
        let result = bridge
            .handle(request(
                "explorer.context.clear",
                json!({ "workspaceRoot": "C:\\Windows" }),
            ))
            .await;
        assert!(result.is_err());
        assert!(lock_unpoisoned(&bridge.inner.state).current.is_some());
    }

    #[tokio::test]
    async fn slow_list_does_not_block_clear_and_cannot_return_stale_results() {
        let (_directory, bridge) = manual_bridge().await;
        let (scan_started, started) = oneshot::channel();
        let (release, scan_release) = std_mpsc::channel();

        let list_bridge = bridge.clone();
        let list_task = tokio::spawn(async move {
            list_bridge
                .list_with_scanner(json!({}), 0, move |workspace, options| {
                    let _ = scan_started.send(());
                    scan_release.recv().expect("release scan");
                    workspace.list(options)
                })
                .await
        });
        started.await.expect("scan started");
        assert!(!list_task.is_finished());

        let cleared = tokio::time::timeout(
            Duration::from_secs(1),
            bridge.handle(request("explorer.context.clear", json!({}))),
        )
        .await
        .expect("clear must not wait for scan")
        .expect("clear");
        assert_eq!(cleared["cleared"], true);
        release.send(()).expect("release list");
        let list_error = list_task
            .await
            .expect("list task")
            .expect_err("stale list must be cancelled");
        assert_eq!(list_error.code, "CANCELLED");

        let after_clear = bridge
            .handle(request("explorer.list", json!({})))
            .await
            .expect_err("list after clear");
        assert_eq!(after_clear.code, "NO_CONTEXT");
    }

    #[tokio::test]
    async fn stale_list_error_is_replaced_with_cancelled() {
        let (_directory, bridge) = manual_bridge().await;
        let (scan_started, started) = oneshot::channel();
        let (release, scan_release) = std_mpsc::channel();
        let list_bridge = bridge.clone();
        let list_task = tokio::spawn(async move {
            list_bridge
                .list_with_scanner(json!({}), 0, move |_workspace, _options| {
                    let _ = scan_started.send(());
                    scan_release.recv().expect("release scan");
                    Err(WorkspaceError::AccessDenied)
                })
                .await
        });
        started.await.expect("scan started");
        bridge
            .handle(request("explorer.context.clear", json!({})))
            .await
            .expect("clear");
        release.send(()).expect("release scan");

        let error = list_task
            .await
            .expect("list task")
            .expect_err("stale list error");
        assert_eq!(error.code, "CANCELLED");
    }

    #[tokio::test]
    async fn slow_preview_does_not_block_clear_and_cannot_return_stale_content() {
        let (_directory, bridge) = manual_bridge().await;
        let (read_started, started) = oneshot::channel();
        let (release, read_release) = std_mpsc::channel();
        let preview_bridge = bridge.clone();
        let preview_task = tokio::spawn(async move {
            preview_bridge
                .preview_with_reader(
                    json!({ "relativePath": "README.md" }),
                    0,
                    move |workspace, relative_path| {
                        let _ = read_started.send(());
                        read_release.recv().expect("release preview");
                        workspace.preview(&relative_path)
                    },
                )
                .await
        });
        started.await.expect("preview started");
        assert!(!preview_task.is_finished());

        let cleared = tokio::time::timeout(
            Duration::from_secs(1),
            bridge.handle(request("explorer.context.clear", json!({}))),
        )
        .await
        .expect("clear must not wait for preview")
        .expect("clear");
        assert_eq!(cleared["cleared"], true);
        release.send(()).expect("release preview");
        let error = preview_task
            .await
            .expect("preview task")
            .expect_err("stale preview must be cancelled");
        assert_eq!(error.code, "CANCELLED");
    }

    #[tokio::test]
    async fn stale_preview_error_is_replaced_with_cancelled() {
        let (_directory, bridge) = manual_bridge().await;
        let (read_started, started) = oneshot::channel();
        let (release, read_release) = std_mpsc::channel();
        let preview_bridge = bridge.clone();
        let preview_task = tokio::spawn(async move {
            preview_bridge
                .preview_with_reader(
                    json!({ "relativePath": "README.md" }),
                    0,
                    move |_workspace, _relative_path| {
                        let _ = read_started.send(());
                        read_release.recv().expect("release preview");
                        Err(WorkspaceError::AccessDenied)
                    },
                )
                .await
        });
        started.await.expect("preview started");
        bridge
            .handle(request("explorer.context.clear", json!({})))
            .await
            .expect("clear");
        release.send(()).expect("release preview");

        let error = preview_task
            .await
            .expect("preview task")
            .expect_err("stale preview error");
        assert_eq!(error.code, "CANCELLED");
    }

    #[tokio::test]
    async fn legacy_visibility_settings_cannot_hide_the_installed_watcher() {
        let (_directory, bridge) = manual_bridge().await;
        bridge
            .handle(request("explorer.watch.start", json!({})))
            .await
            .expect("watch start");
        let retained = lock_unpoisoned(&bridge.inner.state)
            .watch_visibility
            .clone()
            .expect("visibility handle");
        let expected = WatchVisibility {
            show_hidden: true,
            show_ignored: true,
        };
        assert_eq!(retained.current(), expected);

        let settings = bridge
            .handle(request(
                "explorer.settings.set",
                json!({ "showHidden": false, "showIgnored": false }),
            ))
            .await
            .expect("settings update");
        assert_eq!(settings["showHidden"], false);
        assert_eq!(settings["showIgnored"], false);

        assert_eq!(retained.current(), expected);
        assert_eq!(
            lock_unpoisoned(&bridge.inner.state)
                .watch_visibility
                .as_ref()
                .expect("active visibility")
                .current(),
            expected
        );
    }

    #[tokio::test]
    async fn invalidated_settings_update_cannot_commit_disk_memory_or_visibility() {
        let (_directory, bridge) = manual_bridge().await;
        bridge
            .handle(request("explorer.watch.start", json!({})))
            .await
            .expect("watch start");
        bridge
            .handle(request(
                "explorer.settings.set",
                json!({ "panelWidth": 300 }),
            ))
            .await
            .expect("baseline settings");
        let store = bridge.inner.settings_store.clone();
        let baseline = store.load().expect("baseline disk settings");
        let retained_visibility = lock_unpoisoned(&bridge.inner.state)
            .watch_visibility
            .clone()
            .expect("visibility handle");
        let (prepared_sender, prepared_receiver) = oneshot::channel();
        let (release_sender, release_receiver) = std_mpsc::channel();
        let stale_bridge = bridge.clone();
        let stale = tokio::spawn(async move {
            stale_bridge
                .settings_set_with_preparer(
                    json!({ "showHidden": false, "showIgnored": false }),
                    0,
                    move |store, settings| {
                        let prepared = store.prepare(&settings)?;
                        let _ = prepared_sender.send(prepared.temporary_path().to_path_buf());
                        release_receiver.recv().expect("release prepared update");
                        Ok(prepared)
                    },
                )
                .await
        });
        let prepared_path = prepared_receiver.await.expect("settings prepared");
        assert_eq!(store.load().expect("disk before invalidation"), baseline);
        assert!(prepared_path.is_file());

        bridge.invalidate_lifecycle();
        release_sender.send(()).expect("release stale update");
        let error = stale
            .await
            .expect("stale settings task")
            .expect_err("stale settings update must be cancelled");
        assert_eq!(error.code, "CANCELLED");

        assert_eq!(store.load().expect("disk after cancellation"), baseline);
        assert_eq!(*read_unpoisoned(&bridge.inner.settings), baseline);
        assert_eq!(
            retained_visibility.current(),
            WatchVisibility {
                show_hidden: true,
                show_ignored: true,
            }
        );
        assert!(!prepared_path.exists());
    }

    #[tokio::test]
    async fn lifecycle_invalidation_synchronously_clears_context_and_watcher() {
        let (_directory, bridge) = manual_bridge().await;
        bridge
            .handle(request("explorer.watch.start", json!({})))
            .await
            .expect("watch start");
        let watch_generation = bridge.inner.watch_generation.load(Ordering::Acquire);
        let context_generation = bridge
            .inner
            .context_request_generation
            .load(Ordering::Acquire);

        bridge.invalidate_lifecycle();

        assert_eq!(bridge.lifecycle_epoch(), 1);
        assert!(bridge.inner.watch_generation.load(Ordering::Acquire) > watch_generation);
        assert!(
            bridge
                .inner
                .context_request_generation
                .load(Ordering::Acquire)
                > context_generation
        );
        {
            let state = lock_unpoisoned(&bridge.inner.state);
            assert!(state.current.is_none());
            assert!(!state.watch_enabled);
            assert!(state.watch_task.is_none());
            assert!(state.watch_visibility.is_none());
        }

        let stale = bridge
            .handle(request("explorer.context", json!({})))
            .await
            .expect_err("old document request");
        assert_eq!(stale.code, "CANCELLED");

        let current = bridge
            .handle(request_at("explorer.context", json!({}), 1))
            .await
            .expect("manual context in new lifecycle");
        assert_eq!(current["compatible"], true);
    }

    #[tokio::test]
    async fn newer_context_resolution_wins_without_waiting_for_the_older_request() {
        let first_workspace = TempDir::new().expect("first workspace");
        let second_workspace = TempDir::new().expect("second workspace");
        let settings_directory = TempDir::new().expect("settings directory");
        let first_path = first_workspace.path().to_path_buf();
        let second_path = second_workspace.path().to_path_buf();
        let (client_stream, server_stream) = duplex(32 * 1024);
        let (client_read, client_write) = split(client_stream);
        let (server_read, mut server_write) = split(server_stream);
        let (first_seen, seen) = oneshot::channel();
        let (release_first, released) = oneshot::channel();
        let server = tokio::spawn(async move {
            let mut reader = BufReader::new(server_read);
            let initialize = read_json_line(&mut reader).await;
            write_json_line(
                &mut server_write,
                json!({ "id": initialize["id"], "result": {} }),
            )
            .await;
            let initialized = read_json_line(&mut reader).await;
            assert_eq!(initialized["method"], "initialized");

            let first = read_json_line(&mut reader).await;
            assert_eq!(first["params"]["threadId"], "thread-a");
            let _ = first_seen.send(());

            let second = read_json_line(&mut reader).await;
            assert_eq!(second["params"]["threadId"], "thread-b");
            write_json_line(
                &mut server_write,
                json!({
                    "id": second["id"],
                    "result": {
                        "thread": {
                            "id": "thread-b",
                            "cwd": second_path
                        }
                    }
                }),
            )
            .await;

            released.await.expect("release first response");
            write_json_line(
                &mut server_write,
                json!({
                    "id": first["id"],
                    "result": {
                        "thread": {
                            "id": "thread-a",
                            "cwd": first_path
                        }
                    }
                }),
            )
            .await;
        });
        let resolver = AppServerClient::connect_io(BufReader::new(client_read), client_write)
            .await
            .expect("resolver");
        let bridge = NativeBridge::new(
            Some(resolver),
            None,
            SettingsStore::new(settings_directory.path().join("settings.json")),
            Settings::default(),
        );

        let first_bridge = bridge.clone();
        let first = tokio::spawn(async move {
            first_bridge
                .handle(request(
                    "explorer.context",
                    json!({ "threadId": "thread-a" }),
                ))
                .await
        });
        seen.await.expect("first request seen");

        let second_bridge = bridge.clone();
        let second = tokio::spawn(async move {
            second_bridge
                .handle(request(
                    "explorer.context",
                    json!({ "threadId": "thread-b" }),
                ))
                .await
        });
        let response = tokio::time::timeout(Duration::from_secs(1), second)
            .await
            .expect("newer request must not wait")
            .expect("second task")
            .expect("second context");
        assert_eq!(response["threadId"], "thread-b");

        release_first.send(()).expect("release first");
        let stale = first
            .await
            .expect("first task")
            .expect_err("older context must be cancelled");
        assert_eq!(stale.code, "CANCELLED");
        let context = lock_unpoisoned(&bridge.inner.state)
            .current
            .clone()
            .expect("current context");
        assert_eq!(context.thread_id.as_deref(), Some("thread-b"));
        assert_eq!(context.workspace.root_path(), second_workspace.path());
        server.await.expect("server task");
    }
}
