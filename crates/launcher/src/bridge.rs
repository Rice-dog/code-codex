#[cfg(windows)]
use std::ffi::OsString;
use std::io::Write as _;
#[cfg(windows)]
use std::os::windows::ffi::OsStringExt;
use std::path::Path;
#[cfg(windows)]
use std::process::Command;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
#[cfg(windows)]
use std::thread;
use std::time::Duration;
#[cfg(windows)]
use std::time::Instant;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use cdp_client::{BindingRequest, BridgeError, BridgeHandler, BridgeNotification};
use context_resolver::{AppServerClient, ResolverError};
use serde_json::{Value, json};
use sha2::Digest as _;
use tokio::io::AsyncReadExt;
use tokio::sync::{Mutex, RwLock, broadcast};
use tokio::task::JoinHandle;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{E_INVALIDARG, HWND, LPARAM, RECT, S_OK};
#[cfg(all(windows, test))]
use windows_sys::Win32::Graphics::Dwm::DWMSBT_MAINWINDOW;
#[cfg(windows)]
use windows_sys::Win32::Graphics::Dwm::{
    DWMSBT_NONE, DWMWCP_DONOTROUND, DwmExtendFrameIntoClientArea,
};
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    ASFW_ANY, AllowSetForegroundWindow, EnumWindows, GetClassNameW, GetForegroundWindow,
    GetWindowLongPtrW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, HWND_BOTTOM,
    HWND_NOTOPMOST, HWND_TOPMOST, IsWindowVisible, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, SetPropW, SetWindowPos, WS_EX_LAYERED, WS_EX_NOREDIRECTIONBITMAP,
    WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};
#[cfg(windows)]
use windows_sys::core::BOOL;
use workspace_service::{
    CreateEntryKind, ErrorCode, ImportSession, MAX_IMPORT_CHUNK_BYTES, MAX_MEDIA_CHUNK_BYTES,
    MAX_PREVIEW_BYTES, Settings, SettingsStore, WatchSubscription, WatchVisibility,
    WatchVisibilityHandle, Workspace, WorkspaceError, WorkspaceWatcher,
};

const GITHUB_LATEST_RELEASE_ENDPOINT: &str =
    "https://api.github.com/repos/Rice-dog/code-codex/releases/latest";
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";
const GITHUB_API_VERSION: &str = "2022-11-28";
const MAX_UPDATE_RESPONSE_BYTES: usize = 256 * 1024;
const MAX_UPDATE_ASSET_BYTES: u64 = 128 * 1024 * 1024;
const MIN_UPDATE_ASSET_BYTES: u64 = 256 * 1024;
const UPDATE_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const UPDATE_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const UPDATE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(180);
#[cfg(windows)]
static UPDATE_INSTALLER_ACTIVE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
const DEFAULT_GIT_HISTORY_LIMIT: usize = 50;
const MAX_GIT_HISTORY_LIMIT: usize = 100;
const MAX_GIT_HISTORY_SKIP: usize = 10_000;
const MAX_GIT_HISTORY_BYTES: usize = 512 * 1024;
const MAX_GIT_COMMIT_BYTES: usize = 2 * 1024 * 1024;
const MAX_GIT_DIFF_BYTES: usize = 1536 * 1024;
const MAX_GIT_CHANGED_FILES: usize = 500;
const MAX_GIT_STDERR_BYTES: usize = 64 * 1024;

fn request_summary(params: &Value) -> Value {
    // Deliberate allowlist: no paths, account/task IDs, tokens, source or saved text.
    let mut summary = json!({"hasRelativeEntry":params.get("relativePath").is_some(),"hasTaskSelection":params.get("threadId").is_some(),"hasPagination":params.get("cursor").is_some()});
    for key in [
        "limit",
        "skip",
        "offset",
        "length",
        "expectedSizeBytes",
        "visible",
        "enabled",
        "opacity",
        "force",
    ] {
        if let Some(value) = params.get(key).filter(|v| v.is_boolean() || v.is_number()) {
            summary[key] = value.clone();
        }
    }
    for key in ["paths", "entries"] {
        if let Some(items) = params.get(key).and_then(Value::as_array) {
            summary[format!("{key}Count")] = json!(items.len());
        }
    }
    summary
}
fn result_summary(result: &Value) -> Value {
    let mut summary = json!({});
    for key in ["entries", "commits", "files", "changes"] {
        if let Some(items) = result.get(key).and_then(Value::as_array) {
            summary[format!("{key}Count")] = json!(items.len());
        }
    }
    for key in [
        "sizeBytes",
        "chunkCount",
        "chunkSize",
        "truncated",
        "editable",
        "installed",
        "cached",
        "launched",
        "compatible",
        "watching",
    ] {
        if let Some(value) = result.get(key).filter(|v| v.is_boolean() || v.is_number()) {
            summary[key] = value.clone();
        }
    }
    summary["hasNextPage"] = json!(result.get("nextCursor").is_some_and(|v| !v.is_null()));
    if let Some(kind) = result.get("kind").and_then(Value::as_str).filter(|kind| {
        [
            "text",
            "image",
            "video",
            "audio",
            "pdf",
            "office",
            "notebook",
            "model",
            "unsupported",
            "binary",
            "directory",
            "file",
        ]
        .contains(kind)
    }) {
        summary["kind"] = json!(kind);
    }
    summary
}

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
    window_transparency: WindowTransparencyController,
    update_checker: UpdateChecker,
    update_install_lock: Mutex<()>,
}

struct BridgeState {
    current: Option<ActiveContext>,
    import_session: Option<ActiveImportSession>,
    watch_enabled: bool,
    watch_task: Option<JoinHandle<()>>,
    watch_visibility: Option<WatchVisibilityHandle>,
}

struct ActiveImportSession {
    id: String,
    lifecycle_epoch: u64,
    context_revision: u64,
    session: ImportSession,
}

#[derive(Clone)]
struct ActiveContext {
    thread_id: Option<String>,
    workspace: Arc<Workspace>,
    lifecycle_epoch: u64,
    revision: u64,
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
                    import_session: None,
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
                window_transparency: WindowTransparencyController::new(),
                update_checker: UpdateChecker::github(),
                update_install_lock: Mutex::new(()),
            }),
        }
    }

    pub fn bind_verified_window_process(&self, pid: u32) -> bool {
        self.inner
            .window_transparency
            .bind_verified_process(pid)
            .is_ok()
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
            abort_import_locked(&mut state);
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

    async fn active_import_operation<T, F>(
        &self,
        epoch: u64,
        session_id: String,
        operation: F,
    ) -> Result<T, BridgeError>
    where
        T: Send + 'static,
        F: FnOnce(&mut ImportSession) -> Result<T, WorkspaceError> + Send + 'static,
    {
        validate_import_session_id(&session_id)?;
        let bridge = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            validate_active_import(&state, epoch, &session_id)?;
            let result = state
                .import_session
                .as_mut()
                .ok_or_else(invalid_import_session_error)
                .and_then(|active| operation(&mut active.session).map_err(map_import_error));
            if bridge.ensure_epoch(epoch).is_err() {
                if let Some(active) = state.import_session.take() {
                    let _ = active.session.abort();
                }
                return Err(cancelled_error());
            }
            result
        })
        .await
        .map_err(|error| {
            operation_error(
                internal_error(),
                "active_import_operation",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })?
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
        .map_err(|error| {
            operation_error(
                internal_error(),
                "active_workspace_operation",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })?
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

fn no_context_error() -> BridgeError {
    BridgeError::new("NO_CONTEXT", "The active task has no local workspace.")
}

fn internal_error() -> BridgeError {
    BridgeError::new("INTERNAL", "The native operation failed.")
}

fn map_window_transparency_error(error: WindowTransparencyError) -> BridgeError {
    match error {
        WindowTransparencyError::Unsupported => BridgeError::new(
            "UNSUPPORTED",
            "Window transparency is unavailable in this launch mode.",
        ),
        WindowTransparencyError::Unavailable | WindowTransparencyError::Native => BridgeError::new(
            "WINDOW_UNAVAILABLE",
            "Window transparency is unavailable for this Codex window.",
        ),
        WindowTransparencyError::Cancelled => cancelled_error(),
    }
}

fn cancelled_error() -> BridgeError {
    BridgeError::new(
        "CANCELLED",
        "The native operation belongs to an inactive document or context.",
    )
}

#[cfg(windows)]
fn visible_explorer_windows() -> Vec<HWND> {
    let mut windows = Vec::new();
    unsafe {
        let _ = EnumWindows(
            Some(collect_visible_explorer_window),
            &mut windows as *mut Vec<HWND> as LPARAM,
        );
    }
    windows
}

#[cfg(windows)]
unsafe extern "system" fn collect_visible_explorer_window(window: HWND, parameter: LPARAM) -> BOOL {
    if is_explorer_window(window) {
        let windows = unsafe { &mut *(parameter as *mut Vec<HWND>) };
        windows.push(window);
    }
    1
}

#[cfg(windows)]
fn is_explorer_window(window: HWND) -> bool {
    if window.is_null() {
        return false;
    }
    let visible = unsafe { IsWindowVisible(window) };
    if visible == 0 {
        return false;
    }
    matches!(
        window_class(window).as_str(),
        "CabinetWClass" | "ExploreWClass"
    )
}

#[cfg(windows)]
fn window_class(window: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(window, buffer.as_mut_ptr(), buffer.len() as i32) };
    wide_buffer_to_string(&buffer, length)
}

#[cfg(windows)]
fn window_text(window: HWND) -> String {
    let mut buffer = [0u16; 512];
    let length = unsafe { GetWindowTextW(window, buffer.as_mut_ptr(), buffer.len() as i32) };
    wide_buffer_to_string(&buffer, length)
}

#[cfg(windows)]
fn wide_buffer_to_string(buffer: &[u16], length: i32) -> String {
    if length <= 0 {
        return String::new();
    }
    OsString::from_wide(&buffer[..length as usize])
        .to_string_lossy()
        .into_owned()
}

#[cfg(windows)]
fn demote_foreground_codex_window() {
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return;
    }

    let class_name = window_class(foreground);
    let title = window_text(foreground).to_ascii_lowercase();
    if class_name != "Chrome_WidgetWin_1" || !title.contains("codex") {
        return;
    }

    const DEMOTE_FLAGS: u32 = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
    unsafe {
        let _ = SetWindowPos(foreground, HWND_NOTOPMOST, 0, 0, 0, 0, DEMOTE_FLAGS);
        let _ = SetWindowPos(foreground, HWND_BOTTOM, 0, 0, 0, 0, DEMOTE_FLAGS);
    }
}

#[cfg(windows)]
fn allow_explorer_foreground_activation() {
    unsafe {
        let _ = AllowSetForegroundWindow(ASFW_ANY);
    }
}

#[cfg(not(windows))]
fn reveal_in_file_explorer(_target: &Path) -> Result<(), WorkspaceError> {
    Err(WorkspaceError::Internal)
}

fn map_resolver_error(error: ResolverError) -> BridgeError {
    crate::runtime_log::record(
        "app-server",
        "workspace resolution",
        "failed",
        crate::network_diagnostics::error_details(&error),
    );
    match error.kind() {
        ResolverError::NoWorkspace | ResolverError::InvalidThreadId => no_context_error(),
        _ => operation_error(
            BridgeError::new("APP_SERVER_FAILED", "The App Server operation failed."),
            "workspace resolution",
            &error,
        ),
    }
}

fn map_workspace_error(error: WorkspaceError) -> BridgeError {
    crate::runtime_log::record(
        "workspace",
        "native operation",
        "failed",
        crate::network_diagnostics::error_details(&error),
    );
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

fn map_import_error(error: WorkspaceError) -> BridgeError {
    match error.code() {
        ErrorCode::ContentTooLarge => BridgeError::new(
            "CONTENT_TOO_LARGE",
            "The dropped file or folder exceeds the import size limit.",
        ),
        ErrorCode::TooManyEntries => BridgeError::new(
            "TOO_MANY_ENTRIES",
            "The dropped folder contains too many nested entries.",
        ),
        _ => map_workspace_error(error),
    }
}

fn map_media_error(error: WorkspaceError) -> BridgeError {
    match error.code() {
        ErrorCode::ContentTooLarge => BridgeError::new(
            "CONTENT_TOO_LARGE",
            "This media file exceeds the native preview size limit.",
        ),
        ErrorCode::NotEditable => BridgeError::new(
            "NOT_EDITABLE",
            "This file is not a supported media preview.",
        ),
        _ => map_workspace_error(error),
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn update_local_failure_keeps_operation_and_native_cause() {
        let error = update_local_error(
            "writing installer chunk",
            &std::io::Error::from_raw_os_error(5),
        );
        assert_eq!(error.code, "UPDATE_LOCAL_IO");
        assert!(error.message.contains("writing installer chunk"));
        assert!(error.message.contains("osCode=Some(5)"));
        let mapped = map_resolver_error(
            ResolverError::Io.context("reading App Server stdout", "EOF; requestNumber=8"),
        );
        assert_eq!(mapped.code, "APP_SERVER_FAILED");
        assert!(mapped.message.contains("EOF"));
        let hidden = operation_error(
            internal_error(),
            "update_local_failure_keeps_operation_and_native_cause",
            "Bearer SENTINEL-secret",
        );
        assert!(!hidden.message.contains("SENTINEL"));
    }

    use std::fs;
    use std::sync::mpsc as std_mpsc;

    use cdp_client::CapabilityToken;
    use tempfile::TempDir;
    use tokio::io::{
        AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader, duplex,
        split,
    };
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;
    #[cfg(windows)]
    use windows_sys::Win32::Foundation::POINT;
    #[cfg(windows)]
    use windows_sys::Win32::Graphics::Dwm::DwmFlush;
    #[cfg(windows)]
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, DispatchMessageW, GWL_STYLE, MSG, PM_REMOVE, PeekMessageW,
        TranslateMessage, WS_DISABLED, WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_POPUP,
        WindowFromPoint,
    };

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

    #[tokio::test]
    async fn language_rpc_preserves_files_rejects_invalid_fields_and_conflicts() {
        let (directory, bridge) = manual_bridge().await;
        let language_path = directory.path().join("settings/ui-language.json");
        let initial = bridge
            .handle(request("explorer.language.get", json!({})))
            .await
            .unwrap();
        assert_eq!(initial["preference"]["revision"], 0);
        assert!(!language_path.exists());
        for params in [
            json!({"locale":"fr","expectedRevision":0}),
            json!({"locale":"en","expectedRevision":0,"path":"SENTINEL"}),
            json!({"locale":"en","expectedRevision":-1}),
        ] {
            assert_eq!(
                bridge
                    .handle(request("explorer.language.set", params))
                    .await
                    .unwrap_err()
                    .code,
                "INVALID_REQUEST"
            );
        }
        assert_eq!(
            bridge
                .handle(request("explorer.language.get", json!({"path":"SENTINEL"})))
                .await
                .unwrap_err()
                .code,
            "INVALID_REQUEST"
        );
        let result = bridge
            .handle(request(
                "explorer.language.set",
                json!({"locale":"zh-CN","expectedRevision":0}),
            ))
            .await
            .unwrap();
        assert_eq!(result["locale"], "zh-CN");
        assert_eq!(result["revision"], 1);
        let bytes = fs::read(&language_path).unwrap();
        assert_eq!(
            bridge
                .handle(request(
                    "explorer.language.set",
                    json!({"locale":"en","expectedRevision":0})
                ))
                .await
                .unwrap_err()
                .code,
            "CC-LANG-CONFLICT-001"
        );
        assert_eq!(
            bridge
                .handle(request_at(
                    "explorer.language.set",
                    json!({"locale":"en","expectedRevision":1}),
                    999
                ))
                .await
                .unwrap_err()
                .code,
            "CANCELLED"
        );
        assert_eq!(fs::read(&language_path).unwrap(), bytes);
        fs::write(&language_path, b"damaged").unwrap();
        let fallback = bridge
            .handle(request("explorer.language.get", json!({})))
            .await
            .unwrap();
        assert_eq!(fallback["issue"]["code"], "CC-LANG-INVALID-001");
        assert_eq!(fs::read(&language_path).unwrap(), b"damaged");
        bridge
            .handle(request(
                "explorer.language.set",
                json!({"locale":"en","expectedRevision":0}),
            ))
            .await
            .unwrap();
        assert_eq!(
            bridge
                .handle(request("explorer.language.get", json!({})))
                .await
                .unwrap()["preference"]["locale"],
            "en"
        );
    }

    #[tokio::test]
    async fn startup_example_rpc_routes_to_bounded_native_handlers() {
        let (_directory, bridge) = manual_bridge().await;
        let status = bridge
            .handle(request("explorer.startup.examples.status", json!({})))
            .await
            .unwrap();
        assert_eq!(status.as_array().unwrap().len(), 2);
        // Invalid IDs are rejected by the actual sample handler before any
        // network, application cache or user video library is touched.
        for method in [
            "explorer.startup.examples.download",
            "explorer.startup.examples.chunk",
        ] {
            let params = if method.ends_with(".chunk") {
                json!({"id":"fixture-not-a-sample","offset":0})
            } else {
                json!({"id":"fixture-not-a-sample"})
            };
            let error = bridge.handle(request(method, params)).await.unwrap_err();
            assert_eq!(
                error.code, "EXAMPLE_ID",
                "wrong native dispatch for {method}"
            );
            let error = bridge
                .handle(request(
                    method,
                    json!({"id":"the-intelligence-age","url":"SENTINEL_EXTERNAL"}),
                ))
                .await
                .unwrap_err();
            assert_eq!(error.code, "INVALID_REQUEST");
        }
    }

    #[tokio::test]
    async fn diagnostics_capture_early_validation_and_stale_epoch_without_private_payloads() {
        let (_directory, bridge) = manual_bridge().await;
        crate::runtime_log::capture_test_events();
        let failure = bridge
            .handle(request(
                "explorer.plugins.install",
                json!({"relativePath":"SENTINEL_PRIVATE","token":"SENTINEL_TOKEN"}),
            ))
            .await
            .unwrap_err();
        assert_eq!(failure.code, "PLUGIN_ID");
        let events = crate::runtime_log::take_test_events();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["outcome"], "started");
        assert_eq!(events[1]["outcome"], "failed");
        assert_eq!(
            events[0]["details"]["operationId"],
            events[1]["details"]["operationId"]
        );
        assert!(!serde_json::to_string(&events).unwrap().contains("SENTINEL"));
        crate::runtime_log::capture_test_events();
        let failure = bridge
            .handle(request_at("explorer.list", json!({}), 999))
            .await
            .unwrap_err();
        assert_eq!(failure.code, "CANCELLED");
        let events = crate::runtime_log::take_test_events();
        assert_eq!(events.len(), 2);
        assert_eq!(events[1]["details"]["errorCode"], "CANCELLED");
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

    #[test]
    fn git_identifiers_and_paths_reject_unsafe_input() {
        assert!(valid_git_hash(&"a".repeat(40)));
        assert!(valid_git_hash(&"B".repeat(64)));
        assert!(!valid_git_hash("HEAD"));
        assert!(!valid_git_hash(&"z".repeat(40)));

        assert!(valid_git_relative_path("src/main.rs"));
        assert!(valid_git_relative_path("README.md"));
        assert!(!valid_git_relative_path(""));
        assert!(!valid_git_relative_path("../secret.txt"));
        assert!(!valid_git_relative_path("/absolute.txt"));
        assert!(!valid_git_relative_path("C:\\absolute.txt"));
    }

    #[test]
    fn parses_bounded_git_history_records() {
        let hash = "a".repeat(40);
        let bytes =
            format!("{hash}\0abc1234\0Ada\02026-09-20T10:00:00+08:00\0Add history viewer\0");
        let commits = parse_git_history(bytes.as_bytes()).expect("history");
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].hash, hash);
        assert_eq!(commits[0].short_hash, "abc1234");
        assert_eq!(commits[0].author, "Ada");
        assert_eq!(commits[0].subject, "Add history viewer");
    }

    #[test]
    fn parses_changed_files_and_renames() {
        let files = parse_git_changed_files(
            b"M\0src/main.rs\0A\0README.md\0R100\0old name.txt\0new name.txt\0",
        )
        .expect("changed files");
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].status, "M");
        assert_eq!(files[0].path, "src/main.rs");
        assert_eq!(files[2].status, "R100");
        assert_eq!(files[2].old_path.as_deref(), Some("old name.txt"));
        assert_eq!(files[2].path, "new name.txt");
    }

    #[tokio::test]
    async fn read_only_git_bridge_returns_history_commit_and_diff() {
        let (directory, bridge) = manual_bridge().await;
        let git = |args: &[&str]| {
            let status = std::process::Command::new("git")
                .args(args)
                .current_dir(directory.path())
                .env("GIT_TERMINAL_PROMPT", "0")
                .status()
                .expect("git should be available for bridge tests");
            assert!(status.success(), "git command failed: {args:?}");
        };
        git(&["init", "-q"]);
        git(&["config", "user.name", "Code Codex Test"]);
        git(&["config", "user.email", "code-codex@example.invalid"]);
        git(&["add", "README.md"]);
        git(&["commit", "-q", "-m", "Initial history"]);

        let history = bridge
            .handle(request(
                "explorer.git.history",
                json!({ "skip": 0, "limit": 50 }),
            ))
            .await
            .expect("history");
        assert_eq!(history["commits"][0]["subject"], "Initial history");
        let hash = history["commits"][0]["hash"]
            .as_str()
            .expect("commit hash")
            .to_owned();

        let commit = bridge
            .handle(request("explorer.git.commit", json!({ "hash": hash })))
            .await
            .expect("commit");
        assert_eq!(commit["files"][0]["path"], "README.md");
        assert_eq!(commit["files"][0]["status"], "A");

        let diff = bridge
            .handle(request(
                "explorer.git.diff",
                json!({ "hash": hash, "path": "README.md" }),
            ))
            .await
            .expect("diff");
        assert!(diff["content"].as_str().is_some_and(|content| {
            content.contains("diff --git") && content.contains("+content")
        }));
        assert_eq!(diff["truncated"], false);
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

    async fn mock_update_server(
        response: Vec<u8>,
    ) -> (
        String,
        oneshot::Receiver<String>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock update server");
        let address = listener.local_addr().expect("mock server address");
        let (request_sender, request_receiver) = oneshot::channel();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept update request");
            let mut request = Vec::new();
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let mut chunk = [0_u8; 1024];
                let read = stream.read(&mut chunk).await.expect("read update request");
                if read == 0 || request.len().saturating_add(read) > 16 * 1024 {
                    break;
                }
                request.extend_from_slice(&chunk[..read]);
            }
            let _ = request_sender.send(String::from_utf8_lossy(&request).into_owned());
            let _ = stream.write_all(&response).await;
        });
        (
            format!("http://{address}/repos/Rice-dog/code-codex/releases/latest"),
            request_receiver,
            task,
        )
    }

    fn http_response(status: &str, content_type: &str, body: &[u8]) -> Vec<u8> {
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        [head.as_bytes(), body].concat()
    }

    fn github_release(tag_name: &str) -> GithubLatestRelease {
        GithubLatestRelease {
            tag_name: tag_name.to_owned(),
            html_url: format!("https://github.com/Rice-dog/code-codex/releases/tag/{tag_name}"),
            assets: Vec::new(),
        }
    }

    fn github_setup_asset(version: &str) -> GithubReleaseAsset {
        let name = format!("CodeCodex-{version}-x64-setup.exe");
        GithubReleaseAsset {
            browser_download_url: format!(
                "https://github.com/Rice-dog/code-codex/releases/download/v{version}/{name}"
            ),
            name,
            size: MIN_UPDATE_ASSET_BYTES,
            digest: Some(format!("sha256:{}", "a".repeat(64))),
        }
    }

    #[test]
    fn update_comparison_covers_current_ahead_and_available_versions() {
        let current =
            classify_update("0.1.91", github_release("v0.1.91")).expect("current release");
        assert_eq!(current.status, UpdateAvailability::UpToDate);
        assert_eq!(current.current_version, "0.1.91");
        assert_eq!(current.latest_version, "0.1.91");

        let ahead = classify_update("0.1.91", github_release("v0.1.72")).expect("ahead release");
        assert_eq!(ahead.status, UpdateAvailability::Ahead);

        let available =
            classify_update("0.1.91", github_release("v0.2.0")).expect("available release");
        assert_eq!(available.status, UpdateAvailability::UpdateAvailable);
    }

    #[test]
    fn update_metadata_rejects_prereleases_and_untrusted_release_urls() {
        let prerelease = classify_update("0.1.91", github_release("v0.2.0-beta.1"))
            .expect_err("latest endpoint must only return stable releases");
        assert_eq!(prerelease.code, "UPDATE_CHECK_INVALID_RESPONSE");

        let build_metadata = classify_update("0.1.91", github_release("v0.2.0+build.1"))
            .expect_err("release versions must match the three-part package version contract");
        assert_eq!(build_metadata.code, "UPDATE_CHECK_INVALID_RESPONSE");

        let untrusted = classify_update(
            "0.1.91",
            GithubLatestRelease {
                tag_name: "v0.2.0".to_owned(),
                html_url: "https://example.com/Rice-dog/code-codex/releases/tag/v0.2.0".to_owned(),
                assets: Vec::new(),
            },
        )
        .expect_err("untrusted release URL");
        assert_eq!(untrusted.code, "UPDATE_CHECK_INVALID_RESPONSE");
    }

    #[test]
    fn automatic_update_accepts_only_the_exact_hashed_setup_asset() {
        let mut release = github_release("v0.2.0");
        release.assets.push(github_setup_asset("0.2.0"));
        let asset = select_update_asset(&release, "0.2.0").expect("setup asset");
        assert_eq!(
            validate_update_asset(asset, &release.tag_name, "0.2.0")
                .expect("verified asset metadata"),
            "a".repeat(64)
        );

        release.assets[0].browser_download_url =
            "https://example.com/CodeCodex-0.2.0-x64-setup.exe".to_owned();
        let untrusted = validate_update_asset(&release.assets[0], "v0.2.0", "0.2.0")
            .expect_err("untrusted download URL");
        assert_eq!(untrusted.code, "UPDATE_ASSET_UNAVAILABLE");

        release.assets[0] = github_setup_asset("0.2.0");
        release.assets[0].digest = None;
        let missing_digest = validate_update_asset(&release.assets[0], "v0.2.0", "0.2.0")
            .expect_err("missing digest");
        assert_eq!(missing_digest.code, "UPDATE_ASSET_UNAVAILABLE");
    }

    #[tokio::test]
    async fn update_rpc_uses_bounded_native_github_request_and_required_headers() {
        let body = serde_json::to_vec(&json!({
            "tag_name": "v999.0.0",
            "html_url": "https://github.com/Rice-dog/code-codex/releases/tag/v999.0.0"
        }))
        .expect("release JSON");
        let response = http_response("200 OK", "application/json; charset=utf-8", &body);
        let (endpoint, request_receiver, server) = mock_update_server(response).await;
        let (_directory, mut bridge) = manual_bridge().await;
        Arc::get_mut(&mut bridge.inner)
            .expect("exclusive bridge")
            .update_checker = UpdateChecker::new(endpoint);

        let result = bridge
            .handle(request("explorer.update.check", json!({})))
            .await
            .expect("update result");
        assert_eq!(result["currentVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(result["latestVersion"], "999.0.0");
        assert_eq!(result["status"], "updateAvailable");
        assert_eq!(
            result["releaseUrl"],
            "https://github.com/Rice-dog/code-codex/releases/tag/v999.0.0"
        );

        let request = request_receiver.await.expect("captured update request");
        let request = request.to_ascii_lowercase();
        assert!(request.starts_with("get /repos/rice-dog/code-codex/releases/latest http/1.1\r\n"));
        assert!(request.contains("accept: application/vnd.github+json\r\n"));
        assert!(request.contains("x-github-api-version: 2022-11-28\r\n"));
        assert!(request.contains(&format!(
            "user-agent: code-codex/{}\r\n",
            env!("CARGO_PKG_VERSION")
        )));
        server.await.expect("mock update server");
    }

    #[tokio::test]
    async fn startup_update_is_shared_and_manual_check_remains_fresh() {
        let body = serde_json::to_vec(&json!({
            "tag_name": "v999.0.0",
            "html_url": "https://github.com/Rice-dog/code-codex/releases/tag/v999.0.0"
        }))
        .unwrap();
        let (endpoint, request_receiver, server) =
            mock_update_server(http_response("200 OK", "application/json", &body)).await;
        let (_directory, mut bridge) = manual_bridge().await;
        Arc::get_mut(&mut bridge.inner).unwrap().update_checker = UpdateChecker::new(endpoint);
        let (first, second) = tokio::join!(
            bridge.handle(request("explorer.update.startup", json!({}))),
            bridge.handle(request("explorer.update.startup", json!({})))
        );
        assert_eq!(first.unwrap(), second.unwrap());
        request_receiver.await.unwrap();
        server.await.unwrap();
        assert_eq!(
            bridge
                .handle(request("explorer.update.startup", json!({})))
                .await
                .unwrap()["status"],
            "updateAvailable"
        );
        assert!(
            bridge
                .handle(request("explorer.update.check", json!({})))
                .await
                .is_err(),
            "manual check must try the now-closed server afresh"
        );
    }

    #[tokio::test]
    async fn startup_update_caches_failure_without_claiming_latest() {
        let (endpoint, request_receiver, server) = mock_update_server(http_response(
            "429 Too Many Requests",
            "application/json",
            b"{}",
        ))
        .await;
        let checker = UpdateChecker::new(endpoint);
        let first = checker.check_startup("0.4.1").await.unwrap_err();
        request_receiver.await.unwrap();
        server.await.unwrap();
        let second = checker.check_startup("0.4.1").await.unwrap_err();
        assert_eq!(first.code, "UPDATE_NET_HTTP_RATE_LIMIT");
        assert_eq!(second.code, first.code);
    }

    #[tokio::test]
    async fn update_client_construction_failure_is_not_replaced_with_generic_unavailable() {
        let invalid = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get("http://[invalid")
            .build()
            .unwrap_err();
        let original = crate::network_diagnostics::transport_error(
            "UPDATE",
            "client build",
            "fixture",
            &invalid,
        );
        assert_eq!(original.code, "UPDATE_NET_CLIENT_CONFIGURATION");
        let mut checker = UpdateChecker::new("http://127.0.0.1:1");
        checker.client = Err(original.clone());
        let observed = checker.check("0.4.62").await.unwrap_err();
        assert_eq!(observed.code, original.code);
        assert_eq!(observed.message, original.message);
    }

    #[tokio::test]
    async fn update_rpc_rejects_parameters_before_any_network_request() {
        let (_directory, bridge) = manual_bridge().await;
        let error = bridge
            .handle(request(
                "explorer.update.check",
                json!({ "endpoint": "https://example.com/latest" }),
            ))
            .await
            .expect_err("update endpoint cannot be supplied by the renderer");
        assert_eq!(error.code, "INVALID_REQUEST");
        let error = bridge
            .handle(request(
                "explorer.update.startup",
                json!({"endpoint":"https://example.com"}),
            ))
            .await
            .unwrap_err();
        assert_eq!(error.code, "INVALID_REQUEST");
    }

    #[tokio::test]
    async fn update_install_rechecks_github_and_requires_the_setup_asset() {
        let body = serde_json::to_vec(&json!({
            "tag_name": "v999.0.0",
            "html_url": "https://github.com/Rice-dog/code-codex/releases/tag/v999.0.0",
            "assets": []
        }))
        .expect("release JSON");
        let response = http_response("200 OK", "application/json", &body);
        let (endpoint, _request_receiver, server) = mock_update_server(response).await;
        let (_directory, mut bridge) = manual_bridge().await;
        Arc::get_mut(&mut bridge.inner)
            .expect("exclusive bridge")
            .update_checker = UpdateChecker::new(endpoint);

        let error = bridge
            .handle(request(
                "explorer.update.install",
                json!({ "latestVersion": "999.0.0" }),
            ))
            .await
            .expect_err("the exact setup asset is required");
        assert_eq!(error.code, "UPDATE_ASSET_UNAVAILABLE");
        server.await.expect("mock update server");

        let invalid = bridge
            .handle(request(
                "explorer.update.install",
                json!({ "latestVersion": "v999.0.0" }),
            ))
            .await
            .expect_err("renderer version must be canonical");
        assert_eq!(invalid.code, "INVALID_REQUEST");
    }

    #[tokio::test]
    async fn update_check_rejects_oversized_and_rate_limited_responses() {
        let oversized_body = vec![b'x'; MAX_UPDATE_RESPONSE_BYTES + 1];
        let oversized_response = http_response("200 OK", "application/json", &oversized_body);
        let (endpoint, _request, server) = mock_update_server(oversized_response).await;
        let error = UpdateChecker::new(endpoint)
            .check("0.1.91")
            .await
            .expect_err("oversized response");
        assert_eq!(error.code, "UPDATE_CHECK_INVALID_RESPONSE");
        server.await.expect("oversized response server");

        let limited_response = http_response("403 Forbidden", "application/json", b"{}");
        let (endpoint, _request, server) = mock_update_server(limited_response).await;
        let error = UpdateChecker::new(endpoint)
            .check("0.1.91")
            .await
            .expect_err("rate limited response");
        assert_eq!(error.code, "UPDATE_NET_HTTP_FORBIDDEN");
        server.await.expect("rate limited response server");
    }

    #[cfg(windows)]
    struct TransparencyTestWindow(HWND);

    #[cfg(windows)]
    impl TransparencyTestWindow {
        fn new(ex_style: u32) -> Self {
            let window = unsafe {
                CreateWindowExW(
                    ex_style,
                    windows_sys::w!("BUTTON"),
                    windows_sys::w!("CodeCodex transparency test"),
                    WS_POPUP,
                    0,
                    0,
                    32,
                    32,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                )
            };
            assert!(
                !window.is_null(),
                "create disposable transparency test window"
            );
            Self(window)
        }

        fn handle(&self) -> HWND {
            self.0
        }

        fn assert_presented_client_input_owner(&self, stage: &str) {
            assert_ne!(
                unsafe {
                    SetWindowPos(
                        self.0,
                        HWND_TOPMOST,
                        48,
                        48,
                        32,
                        32,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    )
                },
                0,
                "show disposable input fixture"
            );
            let started = Instant::now();
            let (rect, point, hit, inner_point, inner_hit, visible, enabled, style, hit_pid) = loop {
                let mut message: MSG = unsafe { std::mem::zeroed() };
                unsafe {
                    while PeekMessageW(&mut message, self.0, 0, 0, PM_REMOVE) != 0 {
                        let _ = TranslateMessage(&message);
                        let _ = DispatchMessageW(&message);
                    }
                    let _ = DwmFlush();
                }
                let mut rect = RECT {
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                };
                assert_ne!(
                    unsafe { GetWindowRect(self.0, &mut rect) },
                    0,
                    "fixture rectangle"
                );
                // This fixture is a borderless popup. Derive a client point from
                // its actual screen rectangle instead of assuming desktop scale.
                let point = POINT {
                    x: (rect.left + rect.right) / 2,
                    y: (rect.top + rect.bottom) / 2,
                };
                let hit = unsafe { WindowFromPoint(point) };
                // Retain the old (56,56) interior check at this 32px geometry,
                // as well as the center, while deriving both from the real rect.
                let inner_point = POINT {
                    x: rect.left + (rect.right - rect.left) / 4,
                    y: rect.top + (rect.bottom - rect.top) / 4,
                };
                let inner_hit = unsafe { WindowFromPoint(inner_point) };
                let visible = unsafe { IsWindowVisible(self.0) } != 0;
                let enabled =
                    unsafe { GetWindowLongPtrW(self.0, GWL_STYLE) } as u32 & WS_DISABLED == 0;
                let style = read_extended_style(self.0).expect("presented fixture style");
                let mut hit_pid = 0;
                unsafe { GetWindowThreadProcessId(hit, &mut hit_pid) };
                if (hit == self.0 && inner_hit == self.0)
                    || started.elapsed() >= Duration::from_secs(1)
                {
                    break (
                        rect,
                        point,
                        hit,
                        inner_point,
                        inner_hit,
                        visible,
                        enabled,
                        style,
                        hit_pid,
                    );
                }
                thread::sleep(Duration::from_millis(10));
            };
            eprintln!(
                "{stage}: fixture={:?}; rect=({},{},{},{}); point=({},{}); visible={visible}; enabled={enabled}; exstyle={style:#x}; hit={hit:?}; inner=({},{}); inner_hit={inner_hit:?}; hit_pid={hit_pid}; settled_ms={}",
                self.0,
                rect.left,
                rect.top,
                rect.right,
                rect.bottom,
                point.x,
                point.y,
                inner_point.x,
                inner_point.y,
                started.elapsed().as_millis()
            );
            assert!(
                visible && enabled,
                "{stage}: input fixture must be visible and enabled"
            );
            assert!(
                has_extended_style(style, WS_EX_TOPMOST),
                "{stage}: input fixture must remain topmost"
            );
            assert_eq!(
                hit, self.0,
                "{stage}: transparent client pixels must remain owned by the Codex HWND; point=({},{}); hit_pid={hit_pid}; fixture_exstyle={style:#x}",
                point.x, point.y
            );
            assert_eq!(
                inner_hit, self.0,
                "{stage}: original interior pixels must remain owned by the Codex HWND; point=({},{})",
                inner_point.x, inner_point.y
            );
        }
    }

    #[cfg(windows)]
    impl Drop for TransparencyTestWindow {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyWindow(self.0);
            }
        }
    }

    #[tokio::test]
    async fn window_transparency_rpc_is_strict_and_unbound_launches_fail_closed() {
        let (_directory, bridge) = manual_bridge().await;
        let unsupported = bridge
            .handle(request(
                "explorer.window.transparency.set",
                json!({ "enabled": true }),
            ))
            .await
            .expect_err("manual/attach-style bridge must not target a window");
        assert_eq!(unsupported.code, "UNSUPPORTED");

        for invalid in [
            json!({}),
            json!({ "enabled": "true" }),
            json!({ "enabled": true, "window": 123 }),
        ] {
            let error = bridge
                .handle(request("explorer.window.transparency.set", invalid))
                .await
                .expect_err("invalid transparency request");
            assert_eq!(error.code, "INVALID_REQUEST");
        }
    }

    #[cfg(windows)]
    #[test]
    fn transparency_compositor_policy_preserves_style_and_input_ownership() {
        // Background test processes may not receive foreground permission to
        // promote an existing window. Create this disposable fixture topmost
        // from the outset, without activating it or altering any other window.
        let window =
            TransparencyTestWindow::new(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST);
        window.assert_presented_client_input_owner("before transparency");
        let original_style =
            read_extended_style(window.handle()).expect("initial non-layered ex-style");
        let original_backdrop =
            read_window_system_backdrop(window.handle()).expect("probe system backdrop");
        let original_corner =
            read_window_corner_preference(window.handle()).expect("probe corner preference");
        let original_accent = snapshot_window_accent_policy(window.handle());
        let mut changed = false;

        assert!(
            unsafe { DwmExtendFrameIntoClientArea(window.handle(), &FULL_EXTENDED_CLIENT_FRAME) }
                >= 0
        );

        apply_window_transparency(
            window.handle(),
            original_backdrop,
            original_corner,
            &mut changed,
            || true,
        )
        .expect("apply compositor transparency");
        assert!(changed);
        let applied_style = read_extended_style(window.handle()).expect("active ex-style");
        assert_eq!(applied_style, original_style);
        assert!(!has_extended_style(applied_style, WS_EX_LAYERED));
        assert!(!has_extended_style(applied_style, WS_EX_TRANSPARENT));
        if let Some(applied_policy) = read_window_accent_policy(window.handle()) {
            assert_eq!(applied_policy, TRANSPARENT_ACCENT_POLICY);
        }
        if matches!(original_corner, WindowCornerPreferenceSnapshot::Value(_)) {
            assert_eq!(
                read_window_corner_preference(window.handle()),
                Ok(WindowCornerPreferenceSnapshot::Value(DWMWCP_DONOTROUND))
            );
        }
        if let WindowCornerPreferenceSnapshot::Value(preference) = original_corner
            && preference != DWMWCP_DONOTROUND
        {
            write_window_corner_preference(window.handle(), preference)
                .expect("simulate restored-window corner reset");
            let mut refreshed = false;
            apply_window_transparency(
                window.handle(),
                original_backdrop,
                original_corner,
                &mut refreshed,
                || true,
            )
            .expect("reapply transparency after restored-window transition");
            assert!(refreshed);
            assert_eq!(
                read_window_corner_preference(window.handle()),
                Ok(WindowCornerPreferenceSnapshot::Value(DWMWCP_DONOTROUND))
            );
        }

        window.assert_presented_client_input_owner("after transparency");

        restore_window_accent_policy(window.handle(), original_accent, || true)
            .expect("restore original accent");
        restore_window_system_backdrop(window.handle(), original_backdrop, || true)
            .expect("restore original backdrop");
        restore_window_corner_preference(window.handle(), original_corner, || true)
            .expect("restore original corner preference");
        restore_extended_client_frame(window.handle(), || true)
            .expect("restore Electron's full client frame");
        if let OriginalAccentPolicy::Known(policy) = original_accent {
            assert_eq!(read_window_accent_policy(window.handle()), Some(policy));
        }
        if let WindowCornerPreferenceSnapshot::Value(preference) = original_corner {
            assert_eq!(
                read_window_corner_preference(window.handle()),
                Ok(WindowCornerPreferenceSnapshot::Value(preference))
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn transparency_client_frame_uses_the_legacy_windows_10_glass_path() {
        assert_eq!(
            transparency_client_frame(SystemBackdropSnapshot::Unsupported),
            TransparencyClientFrame::Full
        );
        assert_eq!(
            transparency_client_frame(SystemBackdropSnapshot::Value(DWMSBT_NONE)),
            TransparencyClientFrame::None
        );
    }

    #[cfg(windows)]
    #[test]
    fn transparency_frame_normalization_is_zero_owned_and_fail_closed() {
        let window = 41_isize as HWND;
        let mut ownership_checks = 0;
        let mut calls = 0;
        clear_extended_client_frame_with(
            window,
            || {
                ownership_checks += 1;
                true
            },
            |received_window, margins| {
                calls += 1;
                assert_eq!(received_window, window);
                let margins = unsafe { &*margins };
                assert_eq!(margins.cxLeftWidth, 0);
                assert_eq!(margins.cxRightWidth, 0);
                assert_eq!(margins.cyTopHeight, 0);
                assert_eq!(margins.cyBottomHeight, 0);
                S_OK
            },
        )
        .expect("normalize the owned client frame");
        assert_eq!(ownership_checks, 2);
        assert_eq!(calls, 1);

        assert_eq!(
            clear_extended_client_frame_with(window, || true, |_, _| E_INVALIDARG),
            Err(WindowTransparencyError::Native)
        );
        assert_eq!(
            clear_extended_client_frame_with(
                window,
                || false,
                |_, _| panic!("an unowned window must not be mutated"),
            ),
            Err(WindowTransparencyError::Unavailable)
        );

        let mut first_check = true;
        assert_eq!(
            clear_extended_client_frame_with(
                window,
                || {
                    let owned = first_check;
                    first_check = false;
                    owned
                },
                |_, _| S_OK,
            ),
            Err(WindowTransparencyError::Unavailable)
        );
    }

    #[cfg(windows)]
    #[test]
    fn transparency_system_backdrop_probe_only_accepts_invalid_argument_as_unsupported() {
        assert_eq!(
            classify_system_backdrop_read(S_OK, DWMSBT_MAINWINDOW),
            Ok(SystemBackdropSnapshot::Value(DWMSBT_MAINWINDOW))
        );
        assert_eq!(
            classify_system_backdrop_read(E_INVALIDARG, 0),
            Ok(SystemBackdropSnapshot::Unsupported)
        );
        assert_eq!(
            classify_system_backdrop_read(0x8000_4005_u32 as i32, 0),
            Err(WindowTransparencyError::Native)
        );
        assert_eq!(
            classify_window_corner_preference_read(S_OK, DWMWCP_DONOTROUND),
            Ok(WindowCornerPreferenceSnapshot::Value(DWMWCP_DONOTROUND))
        );
        assert_eq!(
            classify_window_corner_preference_read(E_INVALIDARG, 0),
            Ok(WindowCornerPreferenceSnapshot::Unsupported)
        );
        assert_eq!(
            classify_window_corner_preference_read(0x8000_4005_u32 as i32, 0),
            Err(WindowTransparencyError::Native)
        );
    }

    #[cfg(windows)]
    #[test]
    fn transparency_rejects_click_through_or_incompatible_styles_before_mutation() {
        for rejected_style in [WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_NOREDIRECTIONBITMAP] {
            let initial_style = WS_EX_APPWINDOW | rejected_style;
            let window = TransparencyTestWindow::new(initial_style);
            let mut changed = false;
            assert_eq!(
                apply_window_transparency(
                    window.handle(),
                    SystemBackdropSnapshot::Unsupported,
                    WindowCornerPreferenceSnapshot::Unsupported,
                    &mut changed,
                    || true,
                ),
                Err(WindowTransparencyError::Unavailable)
            );
            assert!(!changed);
            assert_eq!(
                read_extended_style(window.handle()).expect("unchanged ex-style"),
                initial_style as isize
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn transparency_marker_mismatch_fails_before_native_mutation() {
        let window = TransparencyTestWindow::new(WS_EX_APPWINDOW);
        let marker = WindowTransparencyMarker::new();
        let second_launch_marker = WindowTransparencyMarker::new();
        assert_ne!(marker.property_name, second_launch_marker.property_name);
        assert_ne!(marker.cookie, second_launch_marker.cookie);
        claim_window_marker(window.handle(), &marker).expect("claim disposable window");
        assert!(window_has_marker(window.handle(), &marker));
        let mismatched = WindowTransparencyMarker {
            property_name: marker.property_name.clone(),
            cookie: marker.cookie.wrapping_add(1).max(1),
        };
        assert_ne!(mismatched.cookie, marker.cookie);
        assert!(!window_has_marker(window.handle(), &mismatched));
        let before = read_extended_style(window.handle()).expect("style before rejected restore");
        assert_eq!(
            restore_window_accent_policy(window.handle(), OriginalAccentPolicy::Unknown, || {
                window_has_marker(window.handle(), &mismatched)
            }),
            Err(WindowTransparencyError::Unavailable)
        );
        assert_eq!(
            read_extended_style(window.handle()).expect("style after rejected restore"),
            before
        );
        remove_window_marker(window.handle(), &marker).expect("remove disposable marker");
        assert!(!window_has_marker(window.handle(), &marker));

        assert_ne!(
            unsafe { SetPropW(window.handle(), marker.property_name(), marker.cookie()) },
            0,
            "simulate SetPropW succeeding before verification fails"
        );
        assert!(raw_window_has_marker(window.handle(), &marker));
        cleanup_claimed_window_marker(window.handle(), &marker);
        assert!(!raw_window_has_marker(window.handle(), &marker));
    }

    #[cfg(windows)]
    fn transparency_test_screen() -> WindowRectangle {
        WindowRectangle {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        }
    }

    #[cfg(windows)]
    fn transparency_test_candidate(window: isize, pid: u32) -> WindowCandidate {
        WindowCandidate {
            window,
            pid,
            thread_id: 17,
            visible: true,
            unowned: true,
            chrome_widget: true,
            app_window: true,
            tool_window: false,
            no_redirection_bitmap: false,
            rectangle: WindowRectangle {
                left: 100,
                top: 100,
                right: 900,
                bottom: 700,
            },
        }
    }

    #[cfg(windows)]
    #[test]
    fn transparency_selection_prefers_the_verified_foreground_window() {
        let screen = transparency_test_screen();
        let pid = 42;
        let foreground = transparency_test_candidate(101, pid);
        let candidates = [
            transparency_test_candidate(202, pid),
            transparency_test_candidate(303, pid),
        ];
        let selected = select_unique_candidate(Some(foreground), &candidates, pid, screen)
            .expect("qualified foreground");
        assert_eq!(selected.window, foreground.window);
    }

    #[cfg(windows)]
    #[test]
    fn transparency_selection_requires_one_safe_fallback() {
        let screen = transparency_test_screen();
        let pid = 42;
        let only = transparency_test_candidate(101, pid);
        assert_eq!(
            select_unique_candidate(None, &[only], pid, screen)
                .expect("unique fallback")
                .window,
            only.window
        );

        let ambiguous = [only, transparency_test_candidate(202, pid)];
        assert_eq!(
            select_unique_candidate(None, &ambiguous, pid, screen),
            Err(WindowTransparencyError::Unavailable)
        );
    }

    #[cfg(windows)]
    #[test]
    fn transparency_selection_accepts_composition_disabled_main_window_style() {
        const COMPOSITION_DISABLED_MAIN_STYLE: isize = 0x0004_0100;
        let screen = transparency_test_screen();
        let pid = 42;
        let mut stable_codex = transparency_test_candidate(101, pid);
        stable_codex.app_window =
            has_extended_style(COMPOSITION_DISABLED_MAIN_STYLE, WS_EX_APPWINDOW);
        stable_codex.tool_window =
            has_extended_style(COMPOSITION_DISABLED_MAIN_STYLE, WS_EX_TOOLWINDOW);
        stable_codex.no_redirection_bitmap =
            has_extended_style(COMPOSITION_DISABLED_MAIN_STYLE, WS_EX_NOREDIRECTIONBITMAP);

        assert!(stable_codex.app_window);
        assert!(!stable_codex.tool_window);
        assert!(!stable_codex.no_redirection_bitmap);
        assert!(stable_codex.qualifies(pid, screen));
        assert_eq!(
            select_unique_candidate(None, &[stable_codex], pid, screen)
                .expect("stable Codex main HWND")
                .window,
            stable_codex.window
        );
    }

    #[cfg(windows)]
    #[test]
    fn transparency_selection_rejects_unrelated_or_overlay_windows() {
        let screen = transparency_test_screen();
        let pid = 42;
        let mut wrong_pid = transparency_test_candidate(101, pid + 1);
        let mut owned = transparency_test_candidate(102, pid);
        owned.unowned = false;
        let mut wrong_class = transparency_test_candidate(103, pid);
        wrong_class.chrome_widget = false;
        let mut overlay = transparency_test_candidate(104, pid);
        overlay.app_window = false;
        overlay.tool_window = true;
        overlay.rectangle = WindowRectangle {
            left: 40,
            top: 40,
            right: 180,
            bottom: 120,
        };
        let mut offscreen = transparency_test_candidate(105, pid);
        offscreen.rectangle = WindowRectangle {
            left: -32_000,
            top: -32_000,
            right: -31_200,
            bottom: -31_400,
        };
        let mut direct_composition = transparency_test_candidate(106, pid);
        direct_composition.no_redirection_bitmap = true;
        let safe = transparency_test_candidate(107, pid);
        let candidates = [
            wrong_pid,
            owned,
            wrong_class,
            overlay,
            offscreen,
            direct_composition,
            safe,
        ];
        assert_eq!(
            select_unique_candidate(None, &candidates, pid, screen)
                .expect("only safe Codex host")
                .window,
            safe.window
        );

        wrong_pid.pid = pid;
        wrong_pid.thread_id = 0;
        assert!(!wrong_pid.qualifies(pid, screen));
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
        let root_name = response["rootName"].as_str().expect("rootName string");
        assert!(!root_name.contains(['/', '\\']));
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
    async fn media_bridge_returns_bounded_base64_chunks_and_rejects_stale_descriptors() {
        let (directory, bridge) = manual_bridge().await;
        let mut contents = vec![0x5a; 100];
        contents[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        fs::write(directory.path().join("preview.png"), &contents).expect("image");

        let info = bridge
            .handle(request(
                "explorer.media.info",
                json!({ "relativePath": "preview.png" }),
            ))
            .await
            .expect("media info");
        assert_eq!(info["kind"], "image");
        assert_eq!(info["mimeType"], "image/png");
        assert_eq!(info["sizeBytes"], contents.len() as u64);
        assert_eq!(info["chunkSize"], MAX_MEDIA_CHUNK_BYTES);
        assert_eq!(info["chunkCount"], 1);
        assert_eq!(info["version"].as_str().map(str::len), Some(64));

        let version = info["version"].as_str().expect("media version");
        let chunk = bridge
            .handle(request(
                "explorer.media.chunk",
                json!({
                    "relativePath": "preview.png",
                    "offset": 0,
                    "length": 32,
                    "expectedSizeBytes": info["sizeBytes"],
                    "expectedVersion": version,
                }),
            ))
            .await
            .expect("media chunk");
        assert_eq!(chunk["offset"], 0);
        assert_eq!(chunk["eof"], false);
        assert_eq!(
            BASE64_STANDARD
                .decode(chunk["dataBase64"].as_str().expect("base64 data"))
                .expect("decode chunk"),
            contents[..32]
        );

        let last = bridge
            .handle(request(
                "explorer.media.chunk",
                json!({
                    "relativePath": "preview.png",
                    "offset": 96,
                    "length": MAX_MEDIA_CHUNK_BYTES,
                    "expectedSizeBytes": info["sizeBytes"],
                    "expectedVersion": version,
                }),
            ))
            .await
            .expect("last media chunk");
        assert_eq!(last["eof"], true);
        assert_eq!(
            BASE64_STANDARD
                .decode(last["dataBase64"].as_str().expect("last base64 data"))
                .expect("decode last chunk"),
            contents[96..]
        );

        for (params, expected_code) in [
            (
                json!({
                    "relativePath": "preview.png",
                    "offset": 0,
                    "length": 1,
                    "expectedSizeBytes": info["sizeBytes"],
                    "expectedVersion": "0".repeat(64),
                }),
                "CONFLICT",
            ),
            (
                json!({
                    "relativePath": "preview.png",
                    "offset": 0,
                    "length": 1,
                    "expectedSizeBytes": 101,
                    "expectedVersion": version,
                }),
                "CONFLICT",
            ),
        ] {
            let error = bridge
                .handle(request("explorer.media.chunk", params))
                .await
                .expect_err("stale media descriptor");
            assert_eq!(error.code, expected_code);
        }

        for invalid in [
            json!({}),
            json!({ "relativePath": "preview.png", "extra": true }),
        ] {
            let error = bridge
                .handle(request("explorer.media.info", invalid))
                .await
                .expect_err("invalid media info schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }

        for invalid in [
            json!({}),
            json!({
                "relativePath": "preview.png",
                "offset": 0,
                "length": 0,
                "expectedSizeBytes": info["sizeBytes"],
                "expectedVersion": version,
            }),
            json!({
                "relativePath": "preview.png",
                "offset": 0,
                "length": MAX_MEDIA_CHUNK_BYTES + 1,
                "expectedSizeBytes": info["sizeBytes"],
                "expectedVersion": version,
            }),
            json!({
                "relativePath": "preview.png",
                "offset": info["sizeBytes"],
                "length": 1,
                "expectedSizeBytes": info["sizeBytes"],
                "expectedVersion": version,
            }),
            json!({
                "relativePath": "preview.png",
                "offset": 0,
                "length": 1,
                "expectedSizeBytes": info["sizeBytes"],
                "expectedVersion": "not-a-version",
            }),
            json!({
                "relativePath": "preview.png",
                "offset": 0,
                "length": 1,
                "expectedSizeBytes": info["sizeBytes"],
                "expectedVersion": version,
                "force": true,
            }),
        ] {
            let error = bridge
                .handle(request("explorer.media.chunk", invalid))
                .await
                .expect_err("invalid media chunk schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }
    }

    #[tokio::test]
    async fn model_resource_bridge_is_manifest_scoped_bounded_and_version_bound() {
        let (directory, bridge) = manual_bridge().await;
        fs::create_dir(directory.path().join("models")).expect("models");
        fs::create_dir(directory.path().join("assets")).expect("assets");
        let resource_bytes = b"model buffer";
        fs::write(directory.path().join("assets/mesh.bin"), resource_bytes).expect("buffer");
        let manifest = json!({
            "asset": { "version": "2.0" },
            "buffers": [{ "uri": "../assets/mesh.bin", "byteLength": resource_bytes.len() }],
        });
        fs::write(
            directory.path().join("models/scene.gltf"),
            serde_json::to_vec(&manifest).expect("manifest"),
        )
        .expect("model");

        let model = bridge
            .handle(request(
                "explorer.media.info",
                json!({ "relativePath": "models/scene.gltf" }),
            ))
            .await
            .expect("model info");
        assert_eq!(model["kind"], "model");
        assert_eq!(model["mimeType"], "model/gltf+json");

        let resource = bridge
            .handle(request(
                "explorer.model.resource.info",
                json!({
                    "modelRelativePath": "models/scene.gltf",
                    "resourceUri": "../assets/mesh.bin",
                    "expectedModelVersion": model["version"],
                }),
            ))
            .await
            .expect("resource info");
        assert_eq!(resource["mimeType"], "application/octet-stream");
        assert_eq!(resource["sizeBytes"], resource_bytes.len() as u64);
        assert_eq!(resource["chunkSize"], MAX_MEDIA_CHUNK_BYTES);
        assert_eq!(resource["chunkCount"], 1);

        let chunk = bridge
            .handle(request(
                "explorer.model.resource.chunk",
                json!({
                    "modelRelativePath": "models/scene.gltf",
                    "resourceUri": "../assets/mesh.bin",
                    "expectedModelVersion": model["version"],
                    "offset": 0,
                    "length": MAX_MEDIA_CHUNK_BYTES,
                    "expectedSizeBytes": resource["sizeBytes"],
                    "expectedVersion": resource["version"],
                }),
            ))
            .await
            .expect("resource chunk");
        assert_eq!(chunk["offset"], 0);
        assert_eq!(chunk["eof"], true);
        assert_eq!(
            BASE64_STANDARD
                .decode(chunk["dataBase64"].as_str().expect("resource base64"))
                .expect("decode resource"),
            resource_bytes
        );

        let unreferenced = bridge
            .handle(request(
                "explorer.model.resource.info",
                json!({
                    "modelRelativePath": "models/scene.gltf",
                    "resourceUri": "../assets/other.bin",
                    "expectedModelVersion": model["version"],
                }),
            ))
            .await
            .expect_err("unreferenced resource");
        assert_eq!(unreferenced.code, "INVALID_PATH");

        for invalid in [
            json!({}),
            json!({
                "modelRelativePath": "models/scene.gltf",
                "resourceUri": "../assets/mesh.bin",
                "expectedModelVersion": "not-a-version",
            }),
            json!({
                "modelRelativePath": "models/scene.gltf",
                "resourceUri": "../assets/mesh.bin",
                "expectedModelVersion": model["version"],
                "extra": true,
            }),
        ] {
            let error = bridge
                .handle(request("explorer.model.resource.info", invalid))
                .await
                .expect_err("invalid model resource info schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }

        for invalid in [
            json!({}),
            json!({
                "modelRelativePath": "models/scene.gltf",
                "resourceUri": "../assets/mesh.bin",
                "expectedModelVersion": model["version"],
                "offset": 0,
                "length": 0,
                "expectedSizeBytes": resource["sizeBytes"],
                "expectedVersion": resource["version"],
            }),
            json!({
                "modelRelativePath": "models/scene.gltf",
                "resourceUri": "../assets/mesh.bin",
                "expectedModelVersion": model["version"],
                "offset": 0,
                "length": 1,
                "expectedSizeBytes": resource["sizeBytes"],
                "expectedVersion": "not-a-version",
            }),
        ] {
            let error = bridge
                .handle(request("explorer.model.resource.chunk", invalid))
                .await
                .expect_err("invalid model resource chunk schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }

        let stale = bridge
            .handle(request(
                "explorer.model.resource.chunk",
                json!({
                    "modelRelativePath": "models/scene.gltf",
                    "resourceUri": "../assets/mesh.bin",
                    "expectedModelVersion": "0".repeat(64),
                    "offset": 0,
                    "length": 1,
                    "expectedSizeBytes": resource["sizeBytes"],
                    "expectedVersion": resource["version"],
                }),
            ))
            .await
            .expect_err("stale model descriptor");
        assert_eq!(stale.code, "CONFLICT");
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
    async fn dropped_file_and_folder_imports_stream_through_strict_sessions() {
        let (directory, bridge) = manual_bridge().await;
        fs::create_dir(directory.path().join("imports")).expect("imports directory");

        let file_begin = bridge
            .handle(request(
                "explorer.entry.import.begin",
                json!({
                    "destinationParentRelativePath": "imports",
                    "name": "single.bin",
                    "kind": "file",
                    "sizeBytes": 6,
                }),
            ))
            .await
            .expect("begin file import");
        assert_eq!(file_begin["chunkSize"], MAX_IMPORT_CHUNK_BYTES);
        let file_session = file_begin["sessionId"]
            .as_str()
            .expect("file session")
            .to_owned();
        let first = bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": file_session,
                    "offset": 0,
                    "dataBase64": BASE64_STANDARD.encode("abc"),
                }),
            ))
            .await
            .expect("first chunk");
        assert_eq!(first, json!({ "nextOffset": 3 }));
        bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": file_session,
                    "offset": 3,
                    "dataBase64": BASE64_STANDARD.encode("def"),
                }),
            ))
            .await
            .expect("second chunk");
        bridge
            .handle(request(
                "explorer.entry.import.file.finish",
                json!({ "sessionId": file_session }),
            ))
            .await
            .expect("finish file");
        let committed = bridge
            .handle(request(
                "explorer.entry.import.commit",
                json!({ "sessionId": file_session }),
            ))
            .await
            .expect("commit file");
        assert_eq!(committed["entry"]["relativePath"], "imports/single.bin");
        assert_eq!(
            fs::read(directory.path().join("imports/single.bin")).expect("file bytes"),
            b"abcdef"
        );

        let folder_begin = bridge
            .handle(request(
                "explorer.entry.import.begin",
                json!({
                    "destinationParentRelativePath": "imports",
                    "name": "folder",
                    "kind": "directory",
                }),
            ))
            .await
            .expect("begin folder import");
        let folder_session = folder_begin["sessionId"]
            .as_str()
            .expect("folder session")
            .to_owned();
        bridge
            .handle(request(
                "explorer.entry.import.directory",
                json!({ "sessionId": folder_session, "relativePath": "nested" }),
            ))
            .await
            .expect("nested directory");
        bridge
            .handle(request(
                "explorer.entry.import.file.begin",
                json!({
                    "sessionId": folder_session,
                    "relativePath": "nested/value.txt",
                    "sizeBytes": 5,
                }),
            ))
            .await
            .expect("begin nested file");
        bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": folder_session,
                    "offset": 0,
                    "dataBase64": BASE64_STANDARD.encode("value"),
                }),
            ))
            .await
            .expect("nested chunk");
        bridge
            .handle(request(
                "explorer.entry.import.file.finish",
                json!({ "sessionId": folder_session }),
            ))
            .await
            .expect("finish nested file");
        bridge
            .handle(request(
                "explorer.entry.import.commit",
                json!({ "sessionId": folder_session }),
            ))
            .await
            .expect("commit folder");
        assert_eq!(
            fs::read_to_string(directory.path().join("imports/folder/nested/value.txt"))
                .expect("nested content"),
            "value"
        );
    }

    #[tokio::test]
    async fn import_rpc_rejects_untrusted_paths_invalid_chunks_and_unknown_fields() {
        let (directory, bridge) = manual_bridge().await;

        for params in [
            json!({
                "destinationParentRelativePath": "",
                "name": "unsafe.bin",
                "kind": "file",
                "sizeBytes": 1,
                "sourcePath": "C:\\Windows\\win.ini",
            }),
            json!({
                "destinationParentRelativePath": "",
                "name": "missing-size.bin",
                "kind": "file",
            }),
            json!({
                "destinationParentRelativePath": "",
                "name": "folder",
                "kind": "directory",
                "sizeBytes": 0,
            }),
            json!({
                "destinationParentRelativePath": "",
                "name": "folder-null",
                "kind": "directory",
                "sizeBytes": null,
            }),
        ] {
            let error = bridge
                .handle(request("explorer.entry.import.begin", params))
                .await
                .expect_err("invalid begin schema");
            assert_eq!(error.code, "INVALID_REQUEST");
        }
        assert!(!directory.path().join("unsafe.bin").exists());

        let begin = bridge
            .handle(request(
                "explorer.entry.import.begin",
                json!({
                    "destinationParentRelativePath": "",
                    "name": "bounded.bin",
                    "kind": "file",
                    "sizeBytes": 2,
                }),
            ))
            .await
            .expect("begin bounded import");
        let session_id = begin["sessionId"].as_str().expect("session").to_owned();
        let wrong_session = CapabilityToken::generate().expose().to_owned();
        let error = bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": wrong_session,
                    "offset": 0,
                    "dataBase64": BASE64_STANDARD.encode("x"),
                }),
            ))
            .await
            .expect_err("wrong session");
        assert_eq!(error.code, "INVALID_REQUEST");

        for data in ["not base64".to_owned(), BASE64_STANDARD.encode([])] {
            let error = bridge
                .handle(request(
                    "explorer.entry.import.chunk",
                    json!({ "sessionId": session_id, "offset": 0, "dataBase64": data }),
                ))
                .await
                .expect_err("invalid chunk");
            assert_eq!(error.code, "INVALID_REQUEST");
        }
        let oversized = vec![0_u8; MAX_IMPORT_CHUNK_BYTES + 1];
        let error = bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": session_id,
                    "offset": 0,
                    "dataBase64": BASE64_STANDARD.encode(oversized),
                }),
            ))
            .await
            .expect_err("oversized chunk");
        assert_eq!(error.code, "INVALID_REQUEST");

        bridge
            .handle(request(
                "explorer.entry.import.abort",
                json!({ "sessionId": session_id }),
            ))
            .await
            .expect("abort import");
        assert!(!directory.path().join("bounded.bin").exists());
        assert!(
            fs::read_dir(directory.path())
                .expect("workspace root")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".__code_codex_import_"))
        );
    }

    #[tokio::test]
    async fn context_clear_aborts_and_cleans_an_active_import() {
        let (directory, bridge) = manual_bridge().await;
        let begin = bridge
            .handle(request(
                "explorer.entry.import.begin",
                json!({
                    "destinationParentRelativePath": "",
                    "name": "partial.bin",
                    "kind": "file",
                    "sizeBytes": 3,
                }),
            ))
            .await
            .expect("begin import");
        let session_id = begin["sessionId"].as_str().expect("session").to_owned();
        bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": session_id,
                    "offset": 0,
                    "dataBase64": BASE64_STANDARD.encode("a"),
                }),
            ))
            .await
            .expect("partial chunk");
        bridge
            .handle(request("explorer.context.clear", json!({})))
            .await
            .expect("clear context");

        assert!(!directory.path().join("partial.bin").exists());
        assert!(
            lock_unpoisoned(&bridge.inner.state)
                .import_session
                .is_none()
        );
        assert!(
            fs::read_dir(directory.path())
                .expect("workspace root")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".__code_codex_import_"))
        );
    }

    #[tokio::test]
    async fn lifecycle_invalidation_aborts_and_cleans_an_active_import() {
        let (directory, bridge) = manual_bridge().await;
        let begin = bridge
            .handle(request(
                "explorer.entry.import.begin",
                json!({
                    "destinationParentRelativePath": "",
                    "name": "stale.bin",
                    "kind": "file",
                    "sizeBytes": 2,
                }),
            ))
            .await
            .expect("begin import");
        let session_id = begin["sessionId"].as_str().expect("session").to_owned();
        bridge
            .handle(request(
                "explorer.entry.import.chunk",
                json!({
                    "sessionId": session_id,
                    "offset": 0,
                    "dataBase64": BASE64_STANDARD.encode("x"),
                }),
            ))
            .await
            .expect("partial chunk");

        bridge.invalidate_lifecycle();

        assert!(!directory.path().join("stale.bin").exists());
        let state = lock_unpoisoned(&bridge.inner.state);
        assert!(state.import_session.is_none());
        assert!(state.current.is_none());
        drop(state);
        assert!(
            fs::read_dir(directory.path())
                .expect("workspace root")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".__code_codex_import_"))
        );
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
    fn reveal_path_to_windows_wide_preserves_unicode_spaces_and_commas() {
        let target = Path::new("C:\\workspace with spaces\\\u{6587}\u{4ef6}, source.rs");
        let wide = path_to_wide(target);
        assert_eq!(wide.last().copied(), Some(0));
        let roundtrip = std::ffi::OsString::from_wide(&wide[..wide.len() - 1]);
        assert_eq!(roundtrip, target.as_os_str());
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

    #[tokio::test]
    async fn login_startup_rejects_invalid_payloads_and_invalidated_documents() {
        let (_directory, bridge) = manual_bridge().await;
        for (method, params) in [
            ("explorer.login.startup.get", json!({"extra":true})),
            ("explorer.login.startup.set", json!({"enabled":"true"})),
            ("explorer.login.startup.set", json!({"enabled":true,"command":"untrusted"})),
            ("explorer.login.startup.set", json!({})),
        ] {
            assert_eq!(bridge.handle(request(method, params)).await.unwrap_err().code, "INVALID_REQUEST");
        }
        bridge.invalidate_lifecycle();
        for (method, params) in [
            ("explorer.login.startup.get", json!({})),
            ("explorer.login.startup.set", json!({"enabled":true})),
        ] {
            assert_eq!(bridge.handle(request_at(method, params, 0)).await.unwrap_err().code, "CANCELLED");
        }
    }

    #[tokio::test]
    async fn login_startup_queued_write_cannot_commit_after_lifecycle_invalidation() {
        let (_directory, bridge) = manual_bridge().await;
        let update = bridge.inner.settings_update_lock.lock().await;
        let pending_bridge = bridge.clone();
        let pending = tokio::spawn(async move {
            pending_bridge.handle(request("explorer.login.startup.set", json!({"enabled":true}))).await
        });
        tokio::task::yield_now().await;
        assert!(!pending.is_finished());
        bridge.invalidate_lifecycle();
        drop(update);
        assert_eq!(pending.await.unwrap().unwrap_err().code, "CANCELLED");
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
    #[cfg(windows)]
    async fn lifecycle_epoch_changes_before_transparency_restoration_can_block() {
        let (_directory, bridge) = manual_bridge().await;
        let transparency_guard = lock_unpoisoned(&bridge.inner.window_transparency.state);
        let invalidating_bridge = bridge.clone();
        let invalidation = std::thread::spawn(move || {
            invalidating_bridge.invalidate_lifecycle();
        });

        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while bridge.lifecycle_epoch() == 0 && std::time::Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert_eq!(
            bridge.lifecycle_epoch(),
            1,
            "the stale document must be revoked before restoration waits for its native lock"
        );

        drop(transparency_guard);
        invalidation.join().expect("lifecycle invalidation thread");
        assert_eq!(
            bridge
                .inner
                .window_transparency
                .set_enabled(false, &bridge.inner.lifecycle_epoch, 0,),
            Err(WindowTransparencyError::Cancelled),
            "a request that passed its outer check before invalidation must fail again under the native lock"
        );
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
        let fault = &stale.data.as_ref().expect("native failure envelope")["fault"];
        assert_eq!(fault["schema"], 2);
        assert_eq!(fault["observedCode"], "CANCELLED");
        assert_eq!(fault["lifecycleEpoch"], 0);
        assert!(
            fault["failureRef"]
                .as_str()
                .unwrap()
                .starts_with("bridge-0-")
        );

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

#[cfg(all(test, windows))]
mod update_handoff_tests {
    use super::*;
    use std::os::windows::process::CommandExt;
    fn child(script: &str, ready: &Path) -> std::process::Child {
        let mut command =
            Command::new(crate::process_guard::trusted_powershell().expect("PowerShell"));
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("TEST_READY", ready)
            .creation_flags(0x08000000)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command.spawn().expect("fixture process")
    }
    #[test]
    fn installer_window_wait_requires_ack_and_distinguishes_exit_from_timeout() {
        let dir = tempfile::tempdir().expect("fixture dir");
        let ready = dir.path().join("window-ready");
        let op = crate::runtime_log::Operation::start("update", "fixture handoff", json!({}));
        let mut delayed = child(
            "Start-Sleep -Milliseconds 250; [IO.File]::WriteAllText($env:TEST_READY,'ready'); Start-Sleep -Seconds 1",
            &ready,
        );
        let started = Instant::now();
        assert!(
            await_installer_window(&mut delayed, &ready, Duration::from_secs(8), &op)
                .expect("ready")
        );
        assert!(started.elapsed() >= Duration::from_millis(200));
        delayed.wait().expect("exit");
        std::fs::remove_file(&ready).expect("remove marker");
        let mut exited = child("exit 7", &ready);
        assert_eq!(
            await_installer_window(&mut exited, &ready, Duration::from_secs(8), &op)
                .expect_err("early exit")
                .code,
            "UPDATE_INSTALLER_EARLY_EXIT"
        );
        let mut stalled = child("Start-Sleep -Seconds 2", &ready);
        assert!(
            !await_installer_window(&mut stalled, &ready, Duration::from_millis(100), &op)
                .expect("timeout")
        );
        assert!(
            stalled.try_wait().expect("query").is_none(),
            "timeout must not kill an active installer"
        );
        stalled.kill().expect("fixture cleanup");
        stalled.wait().expect("fixture reaped");
    }
    #[test]
    fn update_progress_keeps_epoch_and_version_without_install_success_claim() {
        let (sender, mut receiver) = broadcast::channel(8);
        let p = UpdateProgress {
            sender: Some(sender),
            epoch: 42,
            version: "9.0.0".into(),
        };
        p.publish("waiting for installer window", json!({"timeoutMs":15000}));
        let n = receiver.try_recv().expect("notification");
        assert_eq!(n.lifecycle_epoch, 42);
        assert_eq!(n.payload["params"]["latestVersion"], "9.0.0");
        assert_eq!(n.payload["method"], "explorer.update.progress");
        assert!(n.payload["params"]["installationComplete"].is_null());
    }
}

#[cfg(test)]
#[allow(unused_imports)]
mod test_imports {
    pub(super) use async_trait::async_trait;
    pub(super) use base64::Engine as _;
    pub(super) use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
    pub(super) use cdp_client::CapabilityToken;
    pub(super) use cdp_client::{BindingRequest, BridgeError, BridgeHandler, BridgeNotification};
    pub(super) use context_resolver::{AppServerClient, ResolverError};
    pub(super) use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
    pub(super) use semver::Version;
    pub(super) use serde::{Deserialize, Serialize};
    pub(super) use serde_json::{Value, json};
    pub(super) use sha2::Digest as _;
    #[cfg(windows)]
    pub(super) use std::ffi::OsString;
    pub(super) use std::io;
    pub(super) use std::io::Write as _;
    #[cfg(windows)]
    pub(super) use std::os::windows::ffi::{OsStrExt, OsStringExt};
    pub(super) use std::path::{Component, Path, PathBuf};
    #[cfg(windows)]
    pub(super) use std::process::Command;
    pub(super) use std::process::Stdio;
    #[cfg(windows)]
    pub(super) use std::sync::OnceLock;
    pub(super) use std::sync::atomic::{AtomicU64, Ordering};
    pub(super) use std::sync::{Arc, Mutex as StdMutex, MutexGuard};
    #[cfg(windows)]
    pub(super) use std::thread;
    pub(super) use std::time::Duration;
    #[cfg(windows)]
    pub(super) use std::time::Instant;
    pub(super) use tokio::sync::{Mutex, RwLock, broadcast};
    pub(super) use tokio::task::JoinHandle;
    pub(super) use tokio::{io::AsyncReadExt, process::Command as TokioCommand};
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::Foundation::{
        CloseHandle, E_INVALIDARG, GetLastError, HWND, LPARAM, RECT, RPC_E_CHANGED_MODE, S_FALSE,
        S_OK, SetLastError, WAIT_TIMEOUT,
    };
    #[cfg(all(windows, test))]
    pub(super) use windows_sys::Win32::Graphics::Dwm::DWMSBT_MAINWINDOW;
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::Graphics::Dwm::{
        DWMSBT_NONE, DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
        DwmExtendFrameIntoClientArea, DwmGetWindowAttribute, DwmSetWindowAttribute,
    };
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::System::Com::{
        COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize,
    };
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::System::Threading::{
        GetProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
        WaitForSingleObject,
    };
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::UI::Controls::MARGINS;
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::UI::Shell::{
        ILFree, SHOpenFolderAndSelectItems, SHParseDisplayName, ShellExecuteW,
    };
    #[cfg(windows)]
    pub(super) use windows_sys::Win32::UI::WindowsAndMessaging::{
        ASFW_ANY, AllowSetForegroundWindow, BringWindowToTop, EnumWindows, GW_OWNER, GWL_EXSTYLE,
        GetClassNameW, GetForegroundWindow, GetPropW, GetSystemMetrics, GetWindow,
        GetWindowLongPtrW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, HWND_BOTTOM,
        HWND_NOTOPMOST, HWND_TOPMOST, IsWindow, IsWindowVisible, RemovePropW, SM_CXVIRTUALSCREEN,
        SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_RESTORE, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SetForegroundWindow, SetPropW, SetWindowPos,
        ShowWindowAsync, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOREDIRECTIONBITMAP,
        WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };
    #[cfg(windows)]
    pub(super) use windows_sys::core::BOOL;
    pub(super) use workspace_service::{
        CreateEntryKind, ErrorCode, ImportSession, ListOptions, ListPage, MAX_IMPORT_CHUNK_BYTES,
        MAX_MEDIA_CHUNK_BYTES, MAX_PREVIEW_BYTES, MediaInfo, ModelResourceChunkRequest,
        ModelResourceInfo, PreparedSettings, PreviewResult, Settings, SettingsPatch, SettingsStore,
        WatchSubscription, WatchVisibility, WatchVisibilityHandle, Workspace, WorkspaceError,
        WorkspaceWatcher,
    };
}
#[cfg(test)]
#[allow(unused_imports)]
use test_imports::*;

// Domain modules keep the original public and wire contracts.
#[path = "services/updates.rs"]
mod services_updates;

#[cfg(windows)]
use services_updates::await_installer_window;
#[cfg(any(windows, not(windows)))]
use services_updates::launch_downloaded_update;
use services_updates::{
    DownloadedUpdate, GithubLatestRelease, GithubReleaseAsset, UpdateAvailability,
    UpdateCheckResult, UpdateChecker, UpdateInstallParams, UpdateInstallResult, UpdateProgress,
    classify_update, response_is_json, select_update_asset, trusted_update_download_host,
    update_asset_error, update_busy_error, update_download_error, update_internal_error,
    update_invalid_response_error, update_launch_error, update_local_error,
    update_no_longer_available_error, update_transport_error, update_unavailable_error,
    update_verification_error, validate_release_url, validate_update_asset,
};
#[path = "bridge/errors.rs"]
mod errors;

use errors::operation_error;
#[path = "bridge/contracts.rs"]
mod contracts;

use contracts::{
    BatchCopyParams, BatchMoveParams, BoundedGitOutput, ContextParams, ContextResult,
    EntryCreateKind, EntryCreateParams, EntryMoveParams, EntryPathParams, EntryRenameParams,
    GitChangedFile, GitCommandOutput, GitCommitParams, GitCommitResult, GitCommitSummary,
    GitDiffParams, GitDiffResult, GitHistoryParams, GitHistoryResult, ImportBeginParams,
    ImportChunkParams, ImportDirectoryParams, ImportFileBeginParams, ImportSessionParams,
    ListParams, MediaChunkParams, MediaChunkResult, MediaInfoParams, ModelResourceChunkParams,
    ModelResourceInfoParams, PreviewParams, PreviewSaveParams, SettingsWrapper,
    WindowTransparencyParams, deserialize_optional_import_size,
};
#[path = "platform/windows/window.rs"]
mod platform_windows_window;

#[cfg(any(windows, not(windows)))]
use platform_windows_window::reveal_in_file_explorer;
use platform_windows_window::{
    ACCENT_DISABLED, ACCENT_ENABLE_TRANSPARENT_GRADIENT, GetWindowCompositionAttributeFn,
    SetWindowCompositionAttributeFn, WCA_ACCENT_POLICY, WINDOW_TRANSPARENCY_ACCENT_FLAGS,
    WINDOW_TRANSPARENCY_BACKGROUND, WindowTransparencyController, WindowTransparencyError,
};
#[cfg(windows)]
use platform_windows_window::{
    AccentPolicy, ActiveWindowTransparency, BoundWindowProcess, ComInitialization,
    DISABLED_ACCENT_POLICY, FULL_EXTENDED_CLIENT_FRAME, NO_EXTENDED_CLIENT_FRAME,
    OriginalAccentPolicy, SystemBackdropSnapshot, TRANSPARENT_ACCENT_POLICY,
    TransparencyClientFrame, WindowCandidate, WindowCompositionAttributeData,
    WindowCornerPreferenceSnapshot, WindowEnumerationContext, WindowRectangle,
    WindowTransparencyMarker, WindowTransparencyState, apply_window_transparency,
    candidate_still_belongs_to_process, claim_window_marker, classify_system_backdrop_read,
    classify_window_corner_preference_read, cleanup_claimed_window_marker,
    clear_extended_client_frame, clear_extended_client_frame_with, collect_codex_window_candidate,
    has_extended_style, hresult_failed, inspect_window_candidate, open_directory_in_file_explorer,
    open_target_in_file_explorer, path_to_wide, raise_explorer_window, raise_new_explorer_window,
    raw_window_has_marker, read_extended_style, read_window_accent_policy,
    read_window_corner_preference, read_window_system_backdrop, rectangle_is_nontrivial,
    release_window_marker, remove_window_marker, resolve_get_window_composition_attribute,
    resolve_set_window_composition_attribute, restore_active_window, restore_extended_client_frame,
    restore_window_accent_policy, restore_window_corner_preference, restore_window_system_backdrop,
    select_codex_window, select_item_in_file_explorer, select_unique_candidate,
    snapshot_window_accent_policy, transparency_client_frame, validate_transparency_window_style,
    virtual_screen_rectangle, window_has_marker, window_identity, write_window_accent_policy,
    write_window_corner_preference, write_window_system_backdrop,
};
#[path = "bridge/routes/git.rs"]
mod routes_git;

use routes_git::{
    collect_bounded, git_output_too_large_error, nul_fields, parse_git_changed_files,
    parse_git_commit_metadata, parse_git_history, run_git_readonly, valid_git_hash,
    valid_git_relative_path,
};
#[path = "bridge/routes/workspace.rs"]
mod routes_workspace;

#[path = "bridge/routes/preview.rs"]
mod routes_preview;

#[path = "bridge/routes/mutation.rs"]
mod routes_mutation;

#[path = "bridge/routes/settings.rs"]
mod routes_settings;
#[path = "bridge/routes/login_startup.rs"]
mod routes_login_startup;

#[path = "bridge/routes/updates.rs"]
mod routes_updates;

#[path = "bridge/routes/window.rs"]
mod routes_window;

#[path = "bridge/router.rs"]
mod router;

#[path = "bridge/state.rs"]
mod state;

use state::{
    lock_unpoisoned, read_unpoisoned, require_empty_object, valid_content_version, write_unpoisoned,
};
#[path = "bridge/import_session.rs"]
mod import_session;

use import_session::{
    abort_import_locked, import_busy_error, invalid_import_session_error, validate_active_import,
    validate_import_session_id,
};
