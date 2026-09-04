#[cfg(windows)]
use std::ffi::OsString;
#[cfg(windows)]
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::Path;
#[cfg(windows)]
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex, MutexGuard};
#[cfg(windows)]
use std::thread;
use std::time::Duration;
#[cfg(windows)]
use std::time::Instant;

use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use cdp_client::CapabilityToken;
use cdp_client::{BindingRequest, BridgeError, BridgeHandler, BridgeNotification};
use context_resolver::{AppServerClient, ResolverError};
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::{Mutex, RwLock, broadcast};
use tokio::task::JoinHandle;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{
    CloseHandle, E_INVALIDARG, GetLastError, HWND, LPARAM, RECT, RPC_E_CHANGED_MODE, S_FALSE, S_OK,
    SetLastError, WAIT_TIMEOUT,
};
#[cfg(all(windows, test))]
use windows_sys::Win32::Graphics::Dwm::DWMSBT_MAINWINDOW;
#[cfg(windows)]
use windows_sys::Win32::Graphics::Dwm::{
    DWMSBT_NONE, DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
    DwmExtendFrameIntoClientArea, DwmGetWindowAttribute, DwmSetWindowAttribute,
};
#[cfg(windows)]
use windows_sys::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize};
#[cfg(windows)]
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    GetProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
    WaitForSingleObject,
};
#[cfg(windows)]
use windows_sys::Win32::UI::Controls::MARGINS;
#[cfg(windows)]
use windows_sys::Win32::UI::Shell::{
    ILFree, SHOpenFolderAndSelectItems, SHParseDisplayName, ShellExecuteW,
};
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    ASFW_ANY, AllowSetForegroundWindow, BringWindowToTop, EnumWindows, GW_OWNER, GWL_EXSTYLE,
    GetClassNameW, GetForegroundWindow, GetPropW, GetSystemMetrics, GetWindow, GetWindowLongPtrW,
    GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, HWND_BOTTOM, HWND_NOTOPMOST,
    HWND_TOPMOST, IsWindow, IsWindowVisible, RemovePropW, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_RESTORE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, SetForegroundWindow, SetPropW, SetWindowPos, ShowWindowAsync, WS_EX_APPWINDOW,
    WS_EX_LAYERED, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};
#[cfg(windows)]
use windows_sys::core::BOOL;
use workspace_service::{
    CreateEntryKind, ErrorCode, ImportSession, ListOptions, ListPage, MAX_IMPORT_CHUNK_BYTES,
    MAX_MEDIA_CHUNK_BYTES, MAX_PREVIEW_BYTES, MediaInfo, ModelResourceChunkRequest,
    ModelResourceInfo, PreparedSettings, PreviewResult, Settings, SettingsPatch, SettingsStore,
    WatchSubscription, WatchVisibility, WatchVisibilityHandle, Workspace, WorkspaceError,
    WorkspaceWatcher,
};

const GITHUB_LATEST_RELEASE_ENDPOINT: &str =
    "https://api.github.com/repos/Rice-dog/code-codex/releases/latest";
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";
const GITHUB_API_VERSION: &str = "2022-11-28";
const MAX_UPDATE_RESPONSE_BYTES: usize = 256 * 1024;
const UPDATE_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const UPDATE_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

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
}

struct UpdateChecker {
    client: Option<reqwest::Client>,
    endpoint: String,
}

#[derive(Debug, Deserialize)]
struct GithubLatestRelease {
    tag_name: String,
    html_url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum UpdateAvailability {
    UpToDate,
    UpdateAvailable,
    Ahead,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    current_version: String,
    latest_version: String,
    status: UpdateAvailability,
    tag_name: String,
    release_url: String,
}

impl UpdateChecker {
    fn github() -> Self {
        Self::new(GITHUB_LATEST_RELEASE_ENDPOINT)
    }

    fn new(endpoint: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(UPDATE_CONNECT_TIMEOUT)
            .timeout(UPDATE_REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .ok();
        Self {
            client,
            endpoint: endpoint.into(),
        }
    }

    async fn check(&self, current_version: &str) -> Result<UpdateCheckResult, BridgeError> {
        let client = self.client.as_ref().ok_or_else(update_unavailable_error)?;
        let mut response = client
            .get(&self.endpoint)
            .header(ACCEPT, GITHUB_API_ACCEPT)
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header(USER_AGENT, format!("Code-Codex/{current_version}"))
            .send()
            .await
            .map_err(|_| update_unavailable_error())?;

        let status = response.status();
        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        {
            return Err(update_rate_limited_error());
        }
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(BridgeError::new(
                "UPDATE_NOT_PUBLISHED",
                "No published Code-Codex release was found on GitHub.",
            ));
        }
        if !status.is_success() {
            return Err(update_unavailable_error());
        }
        if !response_is_json(&response)
            || response
                .content_length()
                .is_some_and(|length| length > MAX_UPDATE_RESPONSE_BYTES as u64)
        {
            return Err(update_invalid_response_error());
        }

        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| update_unavailable_error())?
        {
            if body.len().saturating_add(chunk.len()) > MAX_UPDATE_RESPONSE_BYTES {
                return Err(update_invalid_response_error());
            }
            body.extend_from_slice(&chunk);
        }
        let release: GithubLatestRelease =
            serde_json::from_slice(&body).map_err(|_| update_invalid_response_error())?;
        classify_update(current_version, release)
    }
}

fn response_is_json(response: &reqwest::Response) -> bool {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"))
}

fn classify_update(
    current_version: &str,
    release: GithubLatestRelease,
) -> Result<UpdateCheckResult, BridgeError> {
    let current = Version::parse(current_version).map_err(|_| update_internal_error())?;
    if release.tag_name.len() > 80 {
        return Err(update_invalid_response_error());
    }
    let latest_text = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name);
    let latest = Version::parse(latest_text).map_err(|_| update_invalid_response_error())?;
    if !latest.pre.is_empty() || !latest.build.is_empty() {
        return Err(update_invalid_response_error());
    }
    validate_release_url(&release.html_url, &release.tag_name)?;

    let status = match current.cmp(&latest) {
        std::cmp::Ordering::Less => UpdateAvailability::UpdateAvailable,
        std::cmp::Ordering::Equal => UpdateAvailability::UpToDate,
        std::cmp::Ordering::Greater => UpdateAvailability::Ahead,
    };
    Ok(UpdateCheckResult {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        status,
        tag_name: release.tag_name,
        release_url: release.html_url,
    })
}

fn validate_release_url(release_url: &str, tag_name: &str) -> Result<(), BridgeError> {
    if release_url.len() > 512 {
        return Err(update_invalid_response_error());
    }
    let parsed = url::Url::parse(release_url).map_err(|_| update_invalid_response_error())?;
    let expected_path = format!("/Rice-dog/code-codex/releases/tag/{tag_name}");
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != expected_path
    {
        return Err(update_invalid_response_error());
    }
    Ok(())
}

fn update_unavailable_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_UNAVAILABLE",
        "GitHub could not be reached. Check your connection and try again.",
    )
}

fn update_rate_limited_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_RATE_LIMITED",
        "GitHub temporarily limited update checks. Try again later.",
    )
}

fn update_invalid_response_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_INVALID_RESPONSE",
        "GitHub returned an invalid update response. Try again later.",
    )
}

fn update_internal_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_FAILED",
        "The installed Code-Codex version could not be checked.",
    )
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MediaInfoParams {
    relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MediaChunkParams {
    relative_path: String,
    offset: u64,
    length: usize,
    expected_size_bytes: u64,
    expected_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaChunkResult {
    offset: u64,
    data_base64: String,
    eof: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ModelResourceInfoParams {
    model_relative_path: String,
    resource_uri: String,
    expected_model_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ModelResourceChunkParams {
    model_relative_path: String,
    resource_uri: String,
    expected_model_version: String,
    offset: u64,
    length: usize,
    expected_size_bytes: u64,
    expected_version: String,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportBeginParams {
    destination_parent_relative_path: String,
    name: String,
    kind: EntryCreateKind,
    #[serde(default, deserialize_with = "deserialize_optional_import_size")]
    size_bytes: Option<u64>,
}

fn deserialize_optional_import_size<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    u64::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportDirectoryParams {
    session_id: String,
    relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportFileBeginParams {
    session_id: String,
    relative_path: String,
    size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportChunkParams {
    session_id: String,
    offset: u64,
    data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportSessionParams {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SettingsWrapper {
    settings: SettingsPatch,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct WindowTransparencyParams {
    enabled: bool,
}

const WINDOW_TRANSPARENCY_BACKGROUND: &str = "transparent";
#[cfg(windows)]
const WCA_ACCENT_POLICY: i32 = 19;
#[cfg(windows)]
const ACCENT_DISABLED: i32 = 0;
#[cfg(windows)]
const ACCENT_ENABLE_TRANSPARENT_GRADIENT: i32 = 2;
#[cfg(windows)]
const WINDOW_TRANSPARENCY_ACCENT_FLAGS: u32 = 2;
#[cfg(windows)]
const NO_EXTENDED_CLIENT_FRAME: MARGINS = MARGINS {
    cxLeftWidth: 0,
    cxRightWidth: 0,
    cyTopHeight: 0,
    cyBottomHeight: 0,
};
#[cfg(windows)]
const FULL_EXTENDED_CLIENT_FRAME: MARGINS = MARGINS {
    cxLeftWidth: -1,
    cxRightWidth: -1,
    cyTopHeight: -1,
    cyBottomHeight: -1,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WindowTransparencyError {
    Unsupported,
    Unavailable,
    Native,
    Cancelled,
}

struct WindowTransparencyController {
    #[cfg(windows)]
    state: StdMutex<WindowTransparencyState>,
    #[cfg(windows)]
    marker: WindowTransparencyMarker,
}

#[cfg(windows)]
#[derive(Default)]
struct WindowTransparencyState {
    process: Option<BoundWindowProcess>,
    active: Option<ActiveWindowTransparency>,
}

#[cfg(windows)]
struct BoundWindowProcess {
    pid: u32,
    handle: isize,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AccentPolicy {
    state: i32,
    flags: u32,
    gradient_color: u32,
    animation_id: u32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowCompositionAttributeData {
    attribute: i32,
    data: *mut std::ffi::c_void,
    size_of_data: usize,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OriginalAccentPolicy {
    Known(AccentPolicy),
    Unknown,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SystemBackdropSnapshot {
    Unsupported,
    Value(i32),
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WindowCornerPreferenceSnapshot {
    Unsupported,
    Value(i32),
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TransparencyClientFrame {
    Full,
    None,
}

#[cfg(windows)]
struct WindowTransparencyMarker {
    property_name: Vec<u16>,
    cookie: usize,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy)]
struct ActiveWindowTransparency {
    window: isize,
    pid: u32,
    thread_id: u32,
    original_accent_policy: OriginalAccentPolicy,
    original_system_backdrop: SystemBackdropSnapshot,
    original_window_corner_preference: WindowCornerPreferenceSnapshot,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WindowRectangle {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WindowCandidate {
    window: isize,
    pid: u32,
    thread_id: u32,
    visible: bool,
    unowned: bool,
    chrome_widget: bool,
    app_window: bool,
    tool_window: bool,
    no_redirection_bitmap: bool,
    rectangle: WindowRectangle,
}

#[cfg(windows)]
struct WindowEnumerationContext {
    pid: u32,
    virtual_screen: WindowRectangle,
    candidates: Vec<WindowCandidate>,
}

impl WindowTransparencyController {
    fn new() -> Self {
        Self {
            #[cfg(windows)]
            state: StdMutex::new(WindowTransparencyState::default()),
            #[cfg(windows)]
            marker: WindowTransparencyMarker::new(),
        }
    }

    fn bind_verified_process(&self, pid: u32) -> Result<(), WindowTransparencyError> {
        #[cfg(not(windows))]
        {
            let _ = pid;
            Err(WindowTransparencyError::Unsupported)
        }
        #[cfg(windows)]
        {
            if pid == 0 {
                return Err(WindowTransparencyError::Unavailable);
            }
            let handle = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    pid,
                )
            };
            if handle.is_null() {
                return Err(WindowTransparencyError::Unavailable);
            }
            let process = BoundWindowProcess {
                pid,
                handle: handle as isize,
            };
            if !process.is_live() {
                return Err(WindowTransparencyError::Unavailable);
            }

            let mut state = lock_unpoisoned(&self.state);
            if state
                .process
                .as_ref()
                .is_some_and(|existing| existing.pid == pid && existing.is_live())
            {
                return Ok(());
            }
            Self::restore_locked(&mut state, &self.marker)?;
            state.process = Some(process);
            Ok(())
        }
    }

    fn set_enabled(
        &self,
        enabled: bool,
        lifecycle_epoch: &AtomicU64,
        expected_epoch: u64,
    ) -> Result<(), WindowTransparencyError> {
        #[cfg(not(windows))]
        {
            let _ = (enabled, lifecycle_epoch, expected_epoch);
            Err(WindowTransparencyError::Unsupported)
        }
        #[cfg(windows)]
        {
            let mut state = lock_unpoisoned(&self.state);
            if lifecycle_epoch.load(Ordering::Acquire) != expected_epoch {
                return Err(WindowTransparencyError::Cancelled);
            }
            if enabled {
                Self::enable_locked(&mut state, &self.marker)
            } else {
                Self::restore_locked(&mut state, &self.marker)
            }
        }
    }

    fn restore(&self) -> Result<(), WindowTransparencyError> {
        #[cfg(not(windows))]
        {
            Ok(())
        }
        #[cfg(windows)]
        {
            Self::restore_locked(&mut lock_unpoisoned(&self.state), &self.marker)
        }
    }

    #[cfg(windows)]
    fn enable_locked(
        state: &mut WindowTransparencyState,
        marker: &WindowTransparencyMarker,
    ) -> Result<(), WindowTransparencyError> {
        let process = state
            .process
            .as_ref()
            .ok_or(WindowTransparencyError::Unsupported)?;
        if !process.is_live() {
            state.active = None;
            return Err(WindowTransparencyError::Unavailable);
        }
        if let Some(active) = state.active.take() {
            if active.still_belongs_to(process, marker) {
                let mut refresh_changed_native_state = false;
                if apply_window_transparency(
                    active.window as HWND,
                    active.original_system_backdrop,
                    active.original_window_corner_preference,
                    &mut refresh_changed_native_state,
                    || active.still_belongs_to(process, marker),
                )
                .is_ok()
                {
                    state.active = Some(active);
                    return Ok(());
                }
                let mut active = active;
                if let Err(error) = restore_active_window(process, marker, &mut active) {
                    state.active = Some(active);
                    return Err(error);
                }
            }
        }

        let candidate = select_codex_window(process.pid)?;
        if !candidate_still_belongs_to_process(&candidate, process) {
            return Err(WindowTransparencyError::Unavailable);
        }
        claim_window_marker(candidate.window as HWND, marker)?;
        if !candidate_still_belongs_to_process(&candidate, process)
            || !window_has_marker(candidate.window as HWND, marker)
        {
            release_window_marker(candidate.window as HWND, marker);
            return Err(WindowTransparencyError::Unavailable);
        }
        let original_ex_style = match read_extended_style(candidate.window as HWND) {
            Ok(style) => style,
            Err(error) => {
                release_window_marker(candidate.window as HWND, marker);
                return Err(error);
            }
        };
        if let Err(error) = validate_transparency_window_style(original_ex_style) {
            release_window_marker(candidate.window as HWND, marker);
            return Err(error);
        }
        let original_system_backdrop = match read_window_system_backdrop(candidate.window as HWND) {
            Ok(backdrop) => backdrop,
            Err(error) => {
                release_window_marker(candidate.window as HWND, marker);
                return Err(error);
            }
        };
        let original_window_corner_preference =
            match read_window_corner_preference(candidate.window as HWND) {
                Ok(preference) => preference,
                Err(error) => {
                    release_window_marker(candidate.window as HWND, marker);
                    return Err(error);
                }
            };
        let original_accent_policy = snapshot_window_accent_policy(candidate.window as HWND);
        let mut active = ActiveWindowTransparency {
            window: candidate.window,
            pid: candidate.pid,
            thread_id: candidate.thread_id,
            original_accent_policy,
            original_system_backdrop,
            original_window_corner_preference,
        };

        if !active.still_belongs_to(process, marker) {
            release_window_marker(candidate.window as HWND, marker);
            return Err(WindowTransparencyError::Unavailable);
        }
        let mut native_state_changed = false;
        let applied = apply_window_transparency(
            candidate.window as HWND,
            original_system_backdrop,
            original_window_corner_preference,
            &mut native_state_changed,
            || active.still_belongs_to(process, marker),
        );
        if applied.is_ok() {
            state.active = Some(active);
            return Ok(());
        }

        if native_state_changed && restore_active_window(process, marker, &mut active).is_err() {
            state.active = Some(active);
        } else if !native_state_changed {
            release_window_marker(candidate.window as HWND, marker);
        }
        applied
    }

    #[cfg(windows)]
    fn restore_locked(
        state: &mut WindowTransparencyState,
        marker: &WindowTransparencyMarker,
    ) -> Result<(), WindowTransparencyError> {
        let Some(mut active) = state.active.take() else {
            return Ok(());
        };
        let Some(process) = state.process.as_ref() else {
            return Ok(());
        };
        if let Err(error) = restore_active_window(process, marker, &mut active) {
            state.active = Some(active);
            return Err(error);
        }
        Ok(())
    }
}

impl Drop for WindowTransparencyController {
    fn drop(&mut self) {
        #[cfg(windows)]
        {
            let state = self
                .state
                .get_mut()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let _ = Self::restore_locked(state, &self.marker);
        }
    }
}

#[cfg(windows)]
impl BoundWindowProcess {
    fn is_live(&self) -> bool {
        let handle = self.handle as *mut std::ffi::c_void;
        !handle.is_null()
            && unsafe { GetProcessId(handle) } == self.pid
            && unsafe { WaitForSingleObject(handle, 0) } == WAIT_TIMEOUT
    }
}

#[cfg(windows)]
impl Drop for BoundWindowProcess {
    fn drop(&mut self) {
        let handle = self.handle as *mut std::ffi::c_void;
        if !handle.is_null() {
            unsafe {
                let _ = CloseHandle(handle);
            }
        }
    }
}

#[cfg(windows)]
impl WindowTransparencyMarker {
    fn new() -> Self {
        let launcher_pid = std::process::id();
        let nonce = CapabilityToken::generate();
        let mut property_name = format!(
            "CodeCodex.Transparency.Owner.{launcher_pid}.{}",
            nonce.expose()
        )
        .encode_utf16()
        .collect::<Vec<_>>();
        property_name.push(0);
        let cookie = nonce
            .expose()
            .bytes()
            .take(std::mem::size_of::<usize>())
            .fold(0_usize, |value, byte| {
                value.rotate_left(7) ^ usize::from(byte)
            })
            .max(1);
        Self {
            property_name,
            cookie,
        }
    }

    fn property_name(&self) -> *const u16 {
        self.property_name.as_ptr()
    }

    fn cookie(&self) -> *mut std::ffi::c_void {
        self.cookie as *mut std::ffi::c_void
    }
}

#[cfg(windows)]
impl ActiveWindowTransparency {
    fn still_belongs_to(
        &self,
        process: &BoundWindowProcess,
        marker: &WindowTransparencyMarker,
    ) -> bool {
        process.pid == self.pid
            && process.is_live()
            && window_identity(self.window as HWND) == Some((self.pid, self.thread_id))
            && window_class(self.window as HWND) == "Chrome_WidgetWin_1"
            && window_has_marker(self.window as HWND, marker)
    }
}

#[cfg(windows)]
fn restore_active_window(
    process: &BoundWindowProcess,
    marker: &WindowTransparencyMarker,
    active: &mut ActiveWindowTransparency,
) -> Result<(), WindowTransparencyError> {
    if !process.is_live() || unsafe { IsWindow(active.window as HWND) } == 0 {
        return Ok(());
    }
    if !active.still_belongs_to(process, marker) {
        // A destroyed/reused HWND must never be mutated, even if that means
        // there is no longer a live window on which restoration is meaningful.
        return Ok(());
    }

    let accent_result =
        restore_window_accent_policy(active.window as HWND, active.original_accent_policy, || {
            active.still_belongs_to(process, marker)
        });
    let backdrop_result = restore_window_system_backdrop(
        active.window as HWND,
        active.original_system_backdrop,
        || active.still_belongs_to(process, marker),
    );
    let corner_result = restore_window_corner_preference(
        active.window as HWND,
        active.original_window_corner_preference,
        || active.still_belongs_to(process, marker),
    );
    // Transparency temporarily removes Electron's full DWM client frame.
    // Restore it with the native backdrop so Codex's unpainted shell regions
    // do not fall back to black after the extension is disabled.
    let frame_result = restore_extended_client_frame(active.window as HWND, || {
        active.still_belongs_to(process, marker)
    });
    accent_result?;
    backdrop_result?;
    corner_result?;
    frame_result?;
    if active.still_belongs_to(process, marker) {
        remove_window_marker(active.window as HWND, marker)?;
    }
    Ok(())
}

#[cfg(windows)]
fn restore_window_system_backdrop<F>(
    window: HWND,
    original_system_backdrop: SystemBackdropSnapshot,
    mut still_owned: F,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
{
    let original_system_backdrop = match original_system_backdrop {
        SystemBackdropSnapshot::Unsupported => return Ok(()),
        SystemBackdropSnapshot::Value(backdrop) => backdrop,
    };
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    write_window_system_backdrop(window, original_system_backdrop)?;
    if still_owned() {
        Ok(())
    } else {
        Err(WindowTransparencyError::Unavailable)
    }
}

#[cfg(windows)]
fn read_window_system_backdrop(
    window: HWND,
) -> Result<SystemBackdropSnapshot, WindowTransparencyError> {
    let mut backdrop = 0_i32;
    let result = unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_SYSTEMBACKDROP_TYPE as u32,
            std::ptr::addr_of_mut!(backdrop).cast(),
            std::mem::size_of::<i32>() as u32,
        )
    };
    classify_system_backdrop_read(result, backdrop)
}

#[cfg(windows)]
fn classify_system_backdrop_read(
    result: i32,
    backdrop: i32,
) -> Result<SystemBackdropSnapshot, WindowTransparencyError> {
    if result >= 0 {
        Ok(SystemBackdropSnapshot::Value(backdrop))
    } else if result == E_INVALIDARG {
        // Windows 10 exposes DwmGetWindowAttribute but does not implement this
        // Windows 11 attribute. Other failures are not capability signals.
        Ok(SystemBackdropSnapshot::Unsupported)
    } else {
        Err(WindowTransparencyError::Native)
    }
}

#[cfg(windows)]
fn write_window_system_backdrop(
    window: HWND,
    backdrop: i32,
) -> Result<(), WindowTransparencyError> {
    let result = unsafe {
        DwmSetWindowAttribute(
            window,
            DWMWA_SYSTEMBACKDROP_TYPE as u32,
            std::ptr::addr_of!(backdrop).cast(),
            std::mem::size_of::<i32>() as u32,
        )
    };
    if result < 0 {
        return Err(WindowTransparencyError::Native);
    }
    match read_window_system_backdrop(window)? {
        SystemBackdropSnapshot::Value(current) if current == backdrop => Ok(()),
        SystemBackdropSnapshot::Value(_) | SystemBackdropSnapshot::Unsupported => {
            Err(WindowTransparencyError::Unavailable)
        }
    }
}

#[cfg(windows)]
fn restore_window_corner_preference<F>(
    window: HWND,
    original_window_corner_preference: WindowCornerPreferenceSnapshot,
    mut still_owned: F,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
{
    let original_window_corner_preference = match original_window_corner_preference {
        WindowCornerPreferenceSnapshot::Unsupported => return Ok(()),
        WindowCornerPreferenceSnapshot::Value(preference) => preference,
    };
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    write_window_corner_preference(window, original_window_corner_preference)?;
    if still_owned() {
        Ok(())
    } else {
        Err(WindowTransparencyError::Unavailable)
    }
}

#[cfg(windows)]
fn read_window_corner_preference(
    window: HWND,
) -> Result<WindowCornerPreferenceSnapshot, WindowTransparencyError> {
    let mut preference = 0_i32;
    let result = unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            std::ptr::addr_of_mut!(preference).cast(),
            std::mem::size_of::<i32>() as u32,
        )
    };
    classify_window_corner_preference_read(result, preference)
}

#[cfg(windows)]
fn classify_window_corner_preference_read(
    result: i32,
    preference: i32,
) -> Result<WindowCornerPreferenceSnapshot, WindowTransparencyError> {
    if result >= 0 {
        Ok(WindowCornerPreferenceSnapshot::Value(preference))
    } else if result == E_INVALIDARG {
        // Rounded-corner preferences were introduced in Windows 11. Windows 10
        // has no rounded compositor path to disable for restored windows.
        Ok(WindowCornerPreferenceSnapshot::Unsupported)
    } else {
        Err(WindowTransparencyError::Native)
    }
}

#[cfg(windows)]
fn write_window_corner_preference(
    window: HWND,
    preference: i32,
) -> Result<(), WindowTransparencyError> {
    let result = unsafe {
        DwmSetWindowAttribute(
            window,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            std::ptr::addr_of!(preference).cast(),
            std::mem::size_of::<i32>() as u32,
        )
    };
    if result < 0 {
        return Err(WindowTransparencyError::Native);
    }
    match read_window_corner_preference(window)? {
        WindowCornerPreferenceSnapshot::Value(current) if current == preference => Ok(()),
        WindowCornerPreferenceSnapshot::Value(_) | WindowCornerPreferenceSnapshot::Unsupported => {
            Err(WindowTransparencyError::Unavailable)
        }
    }
}

#[cfg(windows)]
fn clear_extended_client_frame<F>(
    window: HWND,
    still_owned: F,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
{
    clear_extended_client_frame_with(window, still_owned, |window, margins| unsafe {
        DwmExtendFrameIntoClientArea(window, margins)
    })
}

#[cfg(windows)]
fn transparency_client_frame(system_backdrop: SystemBackdropSnapshot) -> TransparencyClientFrame {
    match system_backdrop {
        SystemBackdropSnapshot::Unsupported => TransparencyClientFrame::Full,
        SystemBackdropSnapshot::Value(_) => TransparencyClientFrame::None,
    }
}

#[cfg(windows)]
fn clear_extended_client_frame_with<F, E>(
    window: HWND,
    mut still_owned: F,
    mut extend_frame: E,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
    E: FnMut(HWND, *const MARGINS) -> i32,
{
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    let result = extend_frame(window, &NO_EXTENDED_CLIENT_FRAME);
    if result < 0 {
        return Err(WindowTransparencyError::Native);
    }
    if still_owned() {
        Ok(())
    } else {
        Err(WindowTransparencyError::Unavailable)
    }
}

#[cfg(windows)]
fn restore_extended_client_frame<F>(
    window: HWND,
    mut still_owned: F,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
{
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    let result = unsafe { DwmExtendFrameIntoClientArea(window, &FULL_EXTENDED_CLIENT_FRAME) };
    if result < 0 {
        return Err(WindowTransparencyError::Native);
    }
    if still_owned() {
        Ok(())
    } else {
        Err(WindowTransparencyError::Unavailable)
    }
}

#[cfg(windows)]
fn claim_window_marker(
    window: HWND,
    marker: &WindowTransparencyMarker,
) -> Result<(), WindowTransparencyError> {
    if !unsafe { GetPropW(window, marker.property_name()) }.is_null() {
        return Err(WindowTransparencyError::Unavailable);
    }
    let claimed = unsafe { SetPropW(window, marker.property_name(), marker.cookie()) } != 0;
    if !claimed {
        return Err(WindowTransparencyError::Unavailable);
    }
    if !window_has_marker(window, marker) {
        cleanup_claimed_window_marker(window, marker);
        return Err(WindowTransparencyError::Unavailable);
    }
    Ok(())
}

#[cfg(windows)]
fn window_has_marker(window: HWND, marker: &WindowTransparencyMarker) -> bool {
    !window.is_null() && unsafe { IsWindow(window) } != 0 && raw_window_has_marker(window, marker)
}

#[cfg(windows)]
fn raw_window_has_marker(window: HWND, marker: &WindowTransparencyMarker) -> bool {
    !window.is_null() && unsafe { GetPropW(window, marker.property_name()) } == marker.cookie()
}

#[cfg(windows)]
fn cleanup_claimed_window_marker(window: HWND, marker: &WindowTransparencyMarker) {
    if raw_window_has_marker(window, marker) {
        let _ = unsafe { RemovePropW(window, marker.property_name()) };
    }
}

#[cfg(windows)]
fn remove_window_marker(
    window: HWND,
    marker: &WindowTransparencyMarker,
) -> Result<(), WindowTransparencyError> {
    if !window_has_marker(window, marker) {
        return Err(WindowTransparencyError::Unavailable);
    }
    let removed = unsafe { RemovePropW(window, marker.property_name()) };
    if removed != marker.cookie() {
        return Err(WindowTransparencyError::Native);
    }
    Ok(())
}

#[cfg(windows)]
fn release_window_marker(window: HWND, marker: &WindowTransparencyMarker) {
    if window_has_marker(window, marker) {
        let _ = unsafe { RemovePropW(window, marker.property_name()) };
    }
}

#[cfg(windows)]
type SetWindowCompositionAttributeFn =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttributeData) -> BOOL;

#[cfg(windows)]
type GetWindowCompositionAttributeFn =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttributeData) -> BOOL;

#[cfg(windows)]
const TRANSPARENT_ACCENT_POLICY: AccentPolicy = AccentPolicy {
    state: ACCENT_ENABLE_TRANSPARENT_GRADIENT,
    flags: WINDOW_TRANSPARENCY_ACCENT_FLAGS,
    gradient_color: 0,
    animation_id: 0,
};

#[cfg(windows)]
const DISABLED_ACCENT_POLICY: AccentPolicy = AccentPolicy {
    state: ACCENT_DISABLED,
    flags: 0,
    gradient_color: 0,
    animation_id: 0,
};

#[cfg(windows)]
fn resolve_set_window_composition_attribute() -> Option<SetWindowCompositionAttributeFn> {
    static FUNCTION: OnceLock<Option<SetWindowCompositionAttributeFn>> = OnceLock::new();
    *FUNCTION.get_or_init(|| {
        let module = unsafe { GetModuleHandleW(windows_sys::w!("user32.dll")) };
        if module.is_null() {
            return None;
        }
        let raw = unsafe { GetProcAddress(module, b"SetWindowCompositionAttribute\0".as_ptr()) }?;
        // GetProcAddress erases the signature; this is the system ABI used by
        // the compositor export on supported Windows builds.
        Some(unsafe {
            std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                SetWindowCompositionAttributeFn,
            >(raw)
        })
    })
}

#[cfg(windows)]
fn resolve_get_window_composition_attribute() -> Option<GetWindowCompositionAttributeFn> {
    static FUNCTION: OnceLock<Option<GetWindowCompositionAttributeFn>> = OnceLock::new();
    *FUNCTION.get_or_init(|| {
        let module = unsafe { GetModuleHandleW(windows_sys::w!("user32.dll")) };
        if module.is_null() {
            return None;
        }
        let raw = unsafe { GetProcAddress(module, b"GetWindowCompositionAttribute\0".as_ptr()) }?;
        Some(unsafe {
            std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                GetWindowCompositionAttributeFn,
            >(raw)
        })
    })
}

#[cfg(windows)]
fn read_window_accent_policy(window: HWND) -> Option<AccentPolicy> {
    let function = resolve_get_window_composition_attribute()?;
    let mut policy = DISABLED_ACCENT_POLICY;
    let mut data = WindowCompositionAttributeData {
        attribute: WCA_ACCENT_POLICY,
        data: std::ptr::addr_of_mut!(policy).cast(),
        size_of_data: std::mem::size_of::<AccentPolicy>(),
    };
    (unsafe { function(window, std::ptr::addr_of_mut!(data)) } != 0).then_some(policy)
}

#[cfg(windows)]
fn snapshot_window_accent_policy(window: HWND) -> OriginalAccentPolicy {
    read_window_accent_policy(window)
        .map(OriginalAccentPolicy::Known)
        .unwrap_or(OriginalAccentPolicy::Unknown)
}

#[cfg(windows)]
fn write_window_accent_policy(
    window: HWND,
    policy: AccentPolicy,
) -> Result<(), WindowTransparencyError> {
    let function =
        resolve_set_window_composition_attribute().ok_or(WindowTransparencyError::Unsupported)?;
    let mut policy = policy;
    let mut data = WindowCompositionAttributeData {
        attribute: WCA_ACCENT_POLICY,
        data: std::ptr::addr_of_mut!(policy).cast(),
        size_of_data: std::mem::size_of::<AccentPolicy>(),
    };
    if unsafe { function(window, std::ptr::addr_of_mut!(data)) } == 0 {
        return Err(WindowTransparencyError::Native);
    }
    if read_window_accent_policy(window).is_some_and(|current| current != policy) {
        Err(WindowTransparencyError::Unavailable)
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn validate_transparency_window_style(style: isize) -> Result<(), WindowTransparencyError> {
    if has_extended_style(style, WS_EX_LAYERED)
        || has_extended_style(style, WS_EX_TRANSPARENT)
        || has_extended_style(style, WS_EX_NOREDIRECTIONBITMAP)
    {
        Err(WindowTransparencyError::Unavailable)
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn apply_window_transparency<F>(
    window: HWND,
    original_system_backdrop: SystemBackdropSnapshot,
    original_window_corner_preference: WindowCornerPreferenceSnapshot,
    native_state_changed: &mut bool,
    mut still_owned: F,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
{
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    let original_style = read_extended_style(window)?;
    validate_transparency_window_style(original_style)?;
    if resolve_set_window_composition_attribute().is_none() {
        return Err(WindowTransparencyError::Unsupported);
    }
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    match original_system_backdrop {
        SystemBackdropSnapshot::Unsupported => {}
        SystemBackdropSnapshot::Value(_) => match read_window_system_backdrop(window)? {
            SystemBackdropSnapshot::Value(DWMSBT_NONE) => {}
            SystemBackdropSnapshot::Value(_) => {
                *native_state_changed = true;
                write_window_system_backdrop(window, DWMSBT_NONE)?;
            }
            SystemBackdropSnapshot::Unsupported => {
                return Err(WindowTransparencyError::Unavailable);
            }
        },
    }
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }

    match original_window_corner_preference {
        WindowCornerPreferenceSnapshot::Unsupported => {}
        WindowCornerPreferenceSnapshot::Value(_) => match read_window_corner_preference(window)? {
            WindowCornerPreferenceSnapshot::Value(DWMWCP_DONOTROUND) => {}
            WindowCornerPreferenceSnapshot::Value(_) => {
                *native_state_changed = true;
                write_window_corner_preference(window, DWMWCP_DONOTROUND)?;
            }
            WindowCornerPreferenceSnapshot::Unsupported => {
                return Err(WindowTransparencyError::Unavailable);
            }
        },
    }
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }

    *native_state_changed = true;
    write_window_accent_policy(window, TRANSPARENT_ACCENT_POLICY)?;
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    match transparency_client_frame(original_system_backdrop) {
        TransparencyClientFrame::Full => {
            // Windows 10 has no system-backdrop surface. Its legacy DWM path
            // needs glass extended through the client area so Chromium's
            // transparent pixels can reach the desktop compositor.
            restore_extended_client_frame(window, &mut still_owned)?;
        }
        TransparencyClientFrame::None => {
            // Windows 11 already supplies a system-backdrop surface. Electron's
            // full client frame flattens transparent pixels in restored windows,
            // so remove only that frame while transparency is active.
            clear_extended_client_frame(window, &mut still_owned)?;
        }
    }
    let applied_style = read_extended_style(window)?;
    if applied_style != original_style {
        return Err(WindowTransparencyError::Unavailable);
    }
    validate_transparency_window_style(applied_style)?;
    if matches!(original_system_backdrop, SystemBackdropSnapshot::Value(_)) {
        match read_window_system_backdrop(window)? {
            SystemBackdropSnapshot::Value(DWMSBT_NONE) => {}
            SystemBackdropSnapshot::Value(_) | SystemBackdropSnapshot::Unsupported => {
                return Err(WindowTransparencyError::Unavailable);
            }
        }
    }
    if matches!(
        original_window_corner_preference,
        WindowCornerPreferenceSnapshot::Value(_)
    ) {
        match read_window_corner_preference(window)? {
            WindowCornerPreferenceSnapshot::Value(DWMWCP_DONOTROUND) => {}
            WindowCornerPreferenceSnapshot::Value(_)
            | WindowCornerPreferenceSnapshot::Unsupported => {
                return Err(WindowTransparencyError::Unavailable);
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn restore_window_accent_policy<F>(
    window: HWND,
    original_accent_policy: OriginalAccentPolicy,
    mut still_owned: F,
) -> Result<(), WindowTransparencyError>
where
    F: FnMut() -> bool,
{
    if !still_owned() {
        return Err(WindowTransparencyError::Unavailable);
    }
    // GetWindowCompositionAttribute is undocumented and may not be exported.
    // When it cannot snapshot the host state, ACCENT_DISABLED is the only
    // deterministic non-transparent restoration policy.
    let policy = match original_accent_policy {
        OriginalAccentPolicy::Known(policy) => policy,
        OriginalAccentPolicy::Unknown => DISABLED_ACCENT_POLICY,
    };
    write_window_accent_policy(window, policy)?;
    if still_owned() {
        Ok(())
    } else {
        Err(WindowTransparencyError::Unavailable)
    }
}

#[cfg(windows)]
fn read_extended_style(window: HWND) -> Result<isize, WindowTransparencyError> {
    unsafe {
        SetLastError(0);
    }
    let style = unsafe { GetWindowLongPtrW(window, GWL_EXSTYLE) };
    if style == 0 && unsafe { GetLastError() } != 0 {
        Err(WindowTransparencyError::Native)
    } else {
        Ok(style)
    }
}

#[cfg(windows)]
fn has_extended_style(style: isize, flag: u32) -> bool {
    style & flag as isize != 0
}

#[cfg(windows)]
fn window_identity(window: HWND) -> Option<(u32, u32)> {
    if window.is_null() || unsafe { IsWindow(window) } == 0 {
        return None;
    }
    let mut pid = 0;
    let thread_id = unsafe { GetWindowThreadProcessId(window, &mut pid) };
    (pid != 0 && thread_id != 0).then_some((pid, thread_id))
}

#[cfg(windows)]
fn candidate_still_belongs_to_process(
    candidate: &WindowCandidate,
    process: &BoundWindowProcess,
) -> bool {
    process.is_live()
        && window_identity(candidate.window as HWND) == Some((candidate.pid, candidate.thread_id))
        && candidate.pid == process.pid
        && window_class(candidate.window as HWND) == "Chrome_WidgetWin_1"
}

#[cfg(windows)]
fn select_codex_window(pid: u32) -> Result<WindowCandidate, WindowTransparencyError> {
    let virtual_screen = virtual_screen_rectangle()?;
    let foreground = unsafe { GetForegroundWindow() };
    if let Some(candidate) = inspect_window_candidate(foreground, virtual_screen) {
        if candidate.qualifies(pid, virtual_screen) {
            return Ok(candidate);
        }
    }

    let mut context = WindowEnumerationContext {
        pid,
        virtual_screen,
        candidates: Vec::new(),
    };
    let enumerated = unsafe {
        EnumWindows(
            Some(collect_codex_window_candidate),
            &mut context as *mut WindowEnumerationContext as LPARAM,
        )
    } != 0;
    if !enumerated {
        return Err(WindowTransparencyError::Native);
    }
    select_unique_candidate(None, &context.candidates, pid, virtual_screen)
}

#[cfg(windows)]
unsafe extern "system" fn collect_codex_window_candidate(window: HWND, parameter: LPARAM) -> BOOL {
    let context = unsafe { &mut *(parameter as *mut WindowEnumerationContext) };
    if let Some(candidate) = inspect_window_candidate(window, context.virtual_screen) {
        if candidate.qualifies(context.pid, context.virtual_screen) {
            context.candidates.push(candidate);
        }
    }
    1
}

#[cfg(windows)]
fn inspect_window_candidate(
    window: HWND,
    virtual_screen: WindowRectangle,
) -> Option<WindowCandidate> {
    let (pid, thread_id) = window_identity(window)?;
    let mut rectangle = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if unsafe { GetWindowRect(window, &mut rectangle) } == 0 {
        return None;
    }
    let ex_style = read_extended_style(window).ok()?;
    Some(WindowCandidate {
        window: window as isize,
        pid,
        thread_id,
        visible: unsafe { IsWindowVisible(window) } != 0,
        unowned: unsafe { GetWindow(window, GW_OWNER) }.is_null(),
        chrome_widget: window_class(window) == "Chrome_WidgetWin_1",
        app_window: has_extended_style(ex_style, WS_EX_APPWINDOW),
        tool_window: has_extended_style(ex_style, WS_EX_TOOLWINDOW),
        no_redirection_bitmap: has_extended_style(ex_style, WS_EX_NOREDIRECTIONBITMAP),
        rectangle: WindowRectangle {
            left: rectangle.left,
            top: rectangle.top,
            right: rectangle.right,
            bottom: rectangle.bottom,
        },
    })
    .filter(|candidate| rectangle_is_nontrivial(candidate.rectangle, virtual_screen))
}

#[cfg(windows)]
impl WindowCandidate {
    fn qualifies(&self, pid: u32, virtual_screen: WindowRectangle) -> bool {
        self.pid == pid
            && self.thread_id != 0
            && self.visible
            && self.unowned
            && self.chrome_widget
            && self.app_window
            && !self.tool_window
            && !self.no_redirection_bitmap
            && rectangle_is_nontrivial(self.rectangle, virtual_screen)
    }
}

#[cfg(windows)]
fn select_unique_candidate(
    foreground: Option<WindowCandidate>,
    candidates: &[WindowCandidate],
    pid: u32,
    virtual_screen: WindowRectangle,
) -> Result<WindowCandidate, WindowTransparencyError> {
    if let Some(candidate) = foreground {
        if candidate.qualifies(pid, virtual_screen) {
            return Ok(candidate);
        }
    }
    let mut matches = candidates
        .iter()
        .copied()
        .filter(|candidate| candidate.qualifies(pid, virtual_screen));
    let candidate = matches.next().ok_or(WindowTransparencyError::Unavailable)?;
    if matches.next().is_some() {
        return Err(WindowTransparencyError::Unavailable);
    }
    Ok(candidate)
}

#[cfg(windows)]
fn virtual_screen_rectangle() -> Result<WindowRectangle, WindowTransparencyError> {
    let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };
    if width <= 0 || height <= 0 {
        return Err(WindowTransparencyError::Unavailable);
    }
    Ok(WindowRectangle {
        left,
        top,
        right: left.saturating_add(width),
        bottom: top.saturating_add(height),
    })
}

#[cfg(windows)]
fn rectangle_is_nontrivial(rectangle: WindowRectangle, screen: WindowRectangle) -> bool {
    const MINIMUM_WIDTH: i64 = 300;
    const MINIMUM_HEIGHT: i64 = 180;
    const MINIMUM_VISIBLE_WIDTH: i64 = 150;
    const MINIMUM_VISIBLE_HEIGHT: i64 = 90;

    let width = i64::from(rectangle.right) - i64::from(rectangle.left);
    let height = i64::from(rectangle.bottom) - i64::from(rectangle.top);
    let visible_width =
        i64::from(rectangle.right.min(screen.right)) - i64::from(rectangle.left.max(screen.left));
    let visible_height =
        i64::from(rectangle.bottom.min(screen.bottom)) - i64::from(rectangle.top.max(screen.top));
    width >= MINIMUM_WIDTH
        && height >= MINIMUM_HEIGHT
        && visible_width >= MINIMUM_VISIBLE_WIDTH
        && visible_height >= MINIMUM_VISIBLE_HEIGHT
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

    async fn media_info(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.media_info_with_reader(params, epoch, |workspace, relative_path| {
            workspace.media_info(&relative_path)
        })
        .await
    }

    async fn media_chunk(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: MediaChunkParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        if params.length == 0
            || params.length > MAX_MEDIA_CHUNK_BYTES
            || params.offset >= params.expected_size_bytes
            || !valid_content_version(&params.expected_version)
        {
            return Err(BridgeError::invalid_request());
        }

        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let chunk = tokio::task::spawn_blocking(move || {
            workspace.media_chunk(
                &params.relative_path,
                params.offset,
                params.length,
                params.expected_size_bytes,
                &params.expected_version,
            )
        })
        .await;
        self.ensure_active_context(&context, epoch)?;
        let chunk = chunk
            .map_err(|_| internal_error())?
            .map_err(map_media_error)?;
        serde_json::to_value(MediaChunkResult {
            offset: chunk.offset,
            data_base64: BASE64_STANDARD.encode(chunk.data),
            eof: chunk.eof,
        })
        .map_err(|_| internal_error())
    }

    async fn model_resource_info(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: ModelResourceInfoParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        if !valid_content_version(&params.expected_model_version) {
            return Err(BridgeError::invalid_request());
        }
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let info = tokio::task::spawn_blocking(move || {
            workspace.model_resource_info(
                &params.model_relative_path,
                &params.resource_uri,
                &params.expected_model_version,
            )
        })
        .await;
        self.ensure_active_context(&context, epoch)?;
        let info: ModelResourceInfo = info
            .map_err(|_| internal_error())?
            .map_err(map_media_error)?;
        serde_json::to_value(info).map_err(|_| internal_error())
    }

    async fn model_resource_chunk(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: ModelResourceChunkParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        if params.length == 0
            || params.length > MAX_MEDIA_CHUNK_BYTES
            || params.offset >= params.expected_size_bytes
            || !valid_content_version(&params.expected_model_version)
            || !valid_content_version(&params.expected_version)
        {
            return Err(BridgeError::invalid_request());
        }
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let chunk = tokio::task::spawn_blocking(move || {
            workspace.model_resource_chunk(ModelResourceChunkRequest {
                model_relative_path: &params.model_relative_path,
                resource_uri: &params.resource_uri,
                expected_model_version: &params.expected_model_version,
                offset: params.offset,
                length: params.length,
                expected_size_bytes: params.expected_size_bytes,
                expected_version: &params.expected_version,
            })
        })
        .await;
        self.ensure_active_context(&context, epoch)?;
        let chunk = chunk
            .map_err(|_| internal_error())?
            .map_err(map_media_error)?;
        serde_json::to_value(MediaChunkResult {
            offset: chunk.offset,
            data_base64: BASE64_STANDARD.encode(chunk.data),
            eof: chunk.eof,
        })
        .map_err(|_| internal_error())
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

            return serde_json::to_value(json!({ "entries": results }))
                .map_err(|_| internal_error());
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

    async fn entry_import_begin(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: ImportBeginParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        match (params.kind, params.size_bytes) {
            (EntryCreateKind::File, Some(_)) | (EntryCreateKind::Directory, None) => {}
            _ => return Err(BridgeError::invalid_request()),
        }

        let session_id = CapabilityToken::generate().expose().to_owned();
        let staging_nonce = CapabilityToken::generate().expose().to_owned();
        let bridge = self.clone();
        let response_session_id = session_id.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            if state.import_session.is_some() {
                return Err(import_busy_error());
            }
            let context = state.current.as_ref().ok_or_else(no_context_error)?;
            if context.lifecycle_epoch != epoch {
                return Err(cancelled_error());
            }
            let session = context
                .workspace
                .begin_import(
                    &params.destination_parent_relative_path,
                    &params.name,
                    params.kind.into(),
                    params.size_bytes,
                    &staging_nonce,
                )
                .map_err(map_import_error)?;
            if bridge.ensure_epoch(epoch).is_err() {
                let _ = session.abort();
                return Err(cancelled_error());
            }
            state.import_session = Some(ActiveImportSession {
                id: session_id,
                lifecycle_epoch: epoch,
                context_revision: context.revision,
                session,
            });
            Ok(())
        })
        .await
        .map_err(|_| internal_error())??;

        Ok(json!({
            "sessionId": response_session_id,
            "chunkSize": MAX_IMPORT_CHUNK_BYTES,
        }))
    }

    async fn entry_import_directory(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportDirectoryParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.active_import_operation(epoch, params.session_id, move |session| {
            session.create_directory(&params.relative_path)
        })
        .await?;
        Ok(json!({ "created": true }))
    }

    async fn entry_import_file_begin(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportFileBeginParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.active_import_operation(epoch, params.session_id, move |session| {
            session.begin_file(&params.relative_path, params.size_bytes)
        })
        .await?;
        Ok(json!({ "ready": true }))
    }

    async fn entry_import_chunk(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: ImportChunkParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        let bytes = BASE64_STANDARD
            .decode(params.data_base64)
            .map_err(|_| BridgeError::invalid_request())?;
        if bytes.is_empty() || bytes.len() > MAX_IMPORT_CHUNK_BYTES {
            return Err(BridgeError::invalid_request());
        }
        let next_offset = self
            .active_import_operation(epoch, params.session_id, move |session| {
                session.append_chunk(params.offset, &bytes)
            })
            .await?;
        Ok(json!({ "nextOffset": next_offset }))
    }

    async fn entry_import_file_finish(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportSessionParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.active_import_operation(epoch, params.session_id, |session| session.finish_file())
            .await?;
        Ok(json!({ "finished": true }))
    }

    async fn entry_import_commit(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: ImportSessionParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        validate_import_session_id(&params.session_id)?;
        let bridge = self.clone();
        let entry = tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            validate_active_import(&state, epoch, &params.session_id)?;
            let active = state
                .import_session
                .take()
                .ok_or_else(invalid_import_session_error)?;
            // `ImportSession::commit` has no fallible work after its atomic
            // rename, so consuming it here cannot strand an untracked stage.
            active.session.commit().map_err(map_import_error)
        })
        .await
        .map_err(|_| internal_error())??;
        Ok(json!({ "entry": entry }))
    }

    async fn entry_import_abort(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: ImportSessionParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        validate_import_session_id(&params.session_id)?;
        let bridge = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            validate_active_import(&state, epoch, &params.session_id)?;
            let active = state
                .import_session
                .take()
                .ok_or_else(invalid_import_session_error)?;
            active.session.abort().map_err(map_import_error)
        })
        .await
        .map_err(|_| internal_error())??;
        Ok(json!({ "aborted": true }))
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
        .map_err(|_| internal_error())?
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

    async fn media_info_with_reader<F>(
        &self,
        params: Value,
        epoch: u64,
        reader: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, String) -> Result<MediaInfo, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: MediaInfoParams =
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
        let info =
            tokio::task::spawn_blocking(move || reader(workspace, params.relative_path)).await;
        self.ensure_active_context(&context, epoch)?;
        let info = info
            .map_err(|_| internal_error())?
            .map_err(map_media_error)?;
        serde_json::to_value(info).map_err(|_| internal_error())
    }

    async fn settings_get(&self, params: Value) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        serde_json::to_value(read_unpoisoned(&self.inner.settings).clone())
            .map_err(|_| internal_error())
    }

    async fn update_check(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        self.ensure_epoch(epoch)?;
        let result = self
            .inner
            .update_checker
            .check(env!("CARGO_PKG_VERSION"))
            .await?;
        self.ensure_epoch(epoch)?;
        serde_json::to_value(result).map_err(|_| update_internal_error())
    }

    fn window_transparency_set(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.ensure_epoch(epoch)?;
        let params: WindowTransparencyParams =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.inner
            .window_transparency
            .set_enabled(params.enabled, &self.inner.lifecycle_epoch, epoch)
            .map_err(map_window_transparency_error)?;
        self.ensure_epoch(epoch)?;
        Ok(json!({
            "enabled": params.enabled,
            "background": WINDOW_TRANSPARENCY_BACKGROUND,
        }))
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
        abort_import_locked(&mut state);
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
            "explorer.media.info" => self.media_info(request.params, epoch).await,
            "explorer.media.chunk" => self.media_chunk(request.params, epoch).await,
            "explorer.model.resource.info" => self.model_resource_info(request.params, epoch).await,
            "explorer.model.resource.chunk" => {
                self.model_resource_chunk(request.params, epoch).await
            }
            "explorer.entry.create" => self.entry_create(request.params, epoch).await,
            "explorer.entry.rename" => self.entry_rename(request.params, epoch).await,
            "explorer.entry.move" => self.entry_move_batch(request.params, epoch).await,
            "explorer.entry.copy" => self.entry_copy(request.params, epoch).await,
            "explorer.entry.delete" => self.entry_delete(request.params, epoch).await,
            "explorer.entry.reveal" => self.entry_reveal(request.params, epoch).await,
            "explorer.entry.import.begin" => self.entry_import_begin(request.params, epoch).await,
            "explorer.entry.import.directory" => {
                self.entry_import_directory(request.params, epoch).await
            }
            "explorer.entry.import.file.begin" => {
                self.entry_import_file_begin(request.params, epoch).await
            }
            "explorer.entry.import.chunk" => self.entry_import_chunk(request.params, epoch).await,
            "explorer.entry.import.file.finish" => {
                self.entry_import_file_finish(request.params, epoch).await
            }
            "explorer.entry.import.commit" => self.entry_import_commit(request.params, epoch).await,
            "explorer.entry.import.abort" => self.entry_import_abort(request.params, epoch).await,
            "explorer.watch.start" => self.watch_start(request.params, epoch).await,
            "explorer.watch.stop" => self.watch_stop(request.params, epoch),
            "explorer.settings.get" => self.settings_get(request.params).await,
            "explorer.settings.set" => self.settings_set(request.params, epoch).await,
            "explorer.update.check" => self.update_check(request.params, epoch).await,
            "explorer.window.transparency.set" => {
                self.window_transparency_set(request.params, epoch)
            }
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

fn lock_unpoisoned<T>(mutex: &StdMutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn abort_import_locked(state: &mut BridgeState) {
    if let Some(active) = state.import_session.take()
        && active.session.abort().is_err()
    {
        tracing::warn!(event = "workspace_import_cleanup_failed");
    }
}

fn validate_import_session_id(session_id: &str) -> Result<(), BridgeError> {
    if session_id.len() == 43
        && session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Ok(())
    } else {
        Err(BridgeError::invalid_request())
    }
}

fn validate_active_import(
    state: &BridgeState,
    epoch: u64,
    session_id: &str,
) -> Result<(), BridgeError> {
    let context = state.current.as_ref().ok_or_else(no_context_error)?;
    let active = state
        .import_session
        .as_ref()
        .ok_or_else(invalid_import_session_error)?;
    if active.id != session_id {
        return Err(invalid_import_session_error());
    }
    if active.lifecycle_epoch != epoch
        || context.lifecycle_epoch != epoch
        || active.context_revision != context.revision
    {
        return Err(cancelled_error());
    }
    Ok(())
}

fn invalid_import_session_error() -> BridgeError {
    BridgeError::new("INVALID_REQUEST", "The file import session is invalid.")
}

fn import_busy_error() -> BridgeError {
    BridgeError::new("CONFLICT", "Another file import is already active.")
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

fn valid_content_version(version: &str) -> bool {
    version.len() == 64
        && version
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
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
fn reveal_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    let existing_explorer_windows = visible_explorer_windows();
    demote_foreground_codex_window();
    allow_explorer_foreground_activation();
    open_target_in_file_explorer(target)?;
    raise_new_explorer_window(&existing_explorer_windows);
    Ok(())
}

#[cfg(windows)]
fn open_target_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    if target.is_dir() {
        open_directory_in_file_explorer(target)
    } else {
        select_item_in_file_explorer(target)
    }
}

#[cfg(windows)]
fn open_directory_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    let target = path_to_wide(target);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            std::ptr::null(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_RESTORE,
        )
    };
    if (result as isize) > 32 {
        Ok(())
    } else {
        Err(WorkspaceError::Internal)
    }
}

#[cfg(windows)]
fn select_item_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    let _com = ComInitialization::initialize()?;
    let target = path_to_wide(target);
    let mut item = std::ptr::null_mut();
    let parse_result = unsafe {
        SHParseDisplayName(
            target.as_ptr(),
            std::ptr::null_mut(),
            &mut item,
            0,
            std::ptr::null_mut(),
        )
    };
    if hresult_failed(parse_result) || item.is_null() {
        return Err(WorkspaceError::Internal);
    }

    let reveal_result = unsafe { SHOpenFolderAndSelectItems(item, 0, std::ptr::null(), 0) };
    unsafe {
        ILFree(item);
    }
    if hresult_failed(reveal_result) {
        Err(WorkspaceError::Internal)
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn path_to_wide(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn hresult_failed(result: i32) -> bool {
    result < 0
}

#[cfg(windows)]
struct ComInitialization {
    initialized: bool,
}

#[cfg(windows)]
impl ComInitialization {
    fn initialize() -> Result<Self, WorkspaceError> {
        let result = unsafe { CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32) };
        if hresult_failed(result) && result != RPC_E_CHANGED_MODE {
            return Err(WorkspaceError::Internal);
        }
        Ok(Self {
            initialized: matches!(result, S_OK | S_FALSE),
        })
    }
}

#[cfg(windows)]
impl Drop for ComInitialization {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(windows)]
fn raise_new_explorer_window(existing_windows: &[HWND]) {
    let deadline = Instant::now() + Duration::from_millis(900);
    while Instant::now() < deadline {
        if let Some(window) = visible_explorer_windows()
            .into_iter()
            .find(|window| !existing_windows.contains(window))
        {
            raise_explorer_window(window);
            return;
        }
        thread::sleep(Duration::from_millis(1));
    }

    if let Some(window) = visible_explorer_windows().into_iter().next() {
        raise_explorer_window(window);
    }
}

#[cfg(windows)]
fn raise_explorer_window(window: HWND) {
    if window.is_null() {
        return;
    }

    const RAISE_FLAGS: u32 = SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW;
    const RELEASE_FLAGS: u32 = RAISE_FLAGS | SWP_NOACTIVATE;

    unsafe {
        let _ = ShowWindowAsync(window, SW_RESTORE);
        let _ = SetWindowPos(window, HWND_TOPMOST, 0, 0, 0, 0, RAISE_FLAGS);
        let _ = BringWindowToTop(window);
        let _ = SetForegroundWindow(window);
    }
    thread::sleep(Duration::from_millis(250));
    unsafe {
        let _ = SetWindowPos(window, HWND_NOTOPMOST, 0, 0, 0, 0, RELEASE_FLAGS);
    }
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
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_POPUP,
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
            },
        )
        .expect_err("untrusted release URL");
        assert_eq!(untrusted.code, "UPDATE_CHECK_INVALID_RESPONSE");
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
        assert_eq!(error.code, "UPDATE_CHECK_RATE_LIMITED");
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
        let window = TransparencyTestWindow::new(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
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

        assert_ne!(
            unsafe {
                SetWindowPos(
                    window.handle(),
                    HWND_TOPMOST,
                    48,
                    48,
                    32,
                    32,
                    SWP_NOACTIVATE | SWP_SHOWWINDOW,
                )
            },
            0
        );
        assert_eq!(
            unsafe { WindowFromPoint(POINT { x: 56, y: 56 }) },
            window.handle(),
            "transparent client pixels must remain owned by the Codex HWND"
        );

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
