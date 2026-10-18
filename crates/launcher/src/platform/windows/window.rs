#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

use std::io::Write as _;

use std::path::Path;

use std::sync::Mutex as StdMutex;
#[cfg(windows)]
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(windows)]
use std::thread;
use std::time::Duration;
#[cfg(windows)]
use std::time::Instant;

use base64::Engine as _;

use cdp_client::CapabilityToken;

use serde_json::Value;
use sha2::Digest as _;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{
    CloseHandle, E_INVALIDARG, GetLastError, HWND, LPARAM, RECT, RPC_E_CHANGED_MODE, S_FALSE, S_OK,
    SetLastError, WAIT_TIMEOUT,
};

use super::lock_unpoisoned;
#[cfg(windows)]
use super::{
    allow_explorer_foreground_activation, demote_foreground_codex_window, visible_explorer_windows,
    window_class,
};
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
    BringWindowToTop, EnumWindows, GW_OWNER, GWL_EXSTYLE, GetForegroundWindow, GetPropW,
    GetSystemMetrics, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
    HWND_NOTOPMOST, HWND_TOPMOST, IsWindow, IsWindowVisible, RemovePropW, SM_CXVIRTUALSCREEN,
    SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_RESTORE, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SetForegroundWindow, SetPropW, SetWindowPos,
    ShowWindowAsync, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};
#[cfg(windows)]
use windows_sys::core::BOOL;
use workspace_service::WorkspaceError;

pub(super) const WINDOW_TRANSPARENCY_BACKGROUND: &str = "transparent";

#[cfg(windows)]
pub(super) const WCA_ACCENT_POLICY: i32 = 19;

#[cfg(windows)]
pub(super) const ACCENT_DISABLED: i32 = 0;

#[cfg(windows)]
pub(super) const ACCENT_ENABLE_TRANSPARENT_GRADIENT: i32 = 2;

#[cfg(windows)]
pub(super) const WINDOW_TRANSPARENCY_ACCENT_FLAGS: u32 = 2;

#[cfg(windows)]
pub(super) const NO_EXTENDED_CLIENT_FRAME: MARGINS = MARGINS {
    cxLeftWidth: 0,
    cxRightWidth: 0,
    cyTopHeight: 0,
    cyBottomHeight: 0,
};

#[cfg(windows)]
pub(super) const FULL_EXTENDED_CLIENT_FRAME: MARGINS = MARGINS {
    cxLeftWidth: -1,
    cxRightWidth: -1,
    cyTopHeight: -1,
    cyBottomHeight: -1,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum WindowTransparencyError {
    Unsupported,
    Unavailable,
    Native,
    Cancelled,
}

pub(super) struct WindowTransparencyController {
    #[cfg(windows)]
    pub(super) state: StdMutex<WindowTransparencyState>,
    #[cfg(windows)]
    pub(super) marker: WindowTransparencyMarker,
}

#[cfg(windows)]
#[derive(Default)]
pub(super) struct WindowTransparencyState {
    pub(super) process: Option<BoundWindowProcess>,
    pub(super) active: Option<ActiveWindowTransparency>,
}

#[cfg(windows)]
pub(super) struct BoundWindowProcess {
    pub(super) pid: u32,
    pub(super) handle: isize,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct AccentPolicy {
    pub(super) state: i32,
    pub(super) flags: u32,
    pub(super) gradient_color: u32,
    pub(super) animation_id: u32,
}

#[cfg(windows)]
#[repr(C)]
pub(super) struct WindowCompositionAttributeData {
    pub(super) attribute: i32,
    pub(super) data: *mut std::ffi::c_void,
    pub(super) size_of_data: usize,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum OriginalAccentPolicy {
    Known(AccentPolicy),
    Unknown,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SystemBackdropSnapshot {
    Unsupported,
    Value(i32),
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum WindowCornerPreferenceSnapshot {
    Unsupported,
    Value(i32),
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TransparencyClientFrame {
    Full,
    None,
}

#[cfg(windows)]
pub(super) struct WindowTransparencyMarker {
    pub(super) property_name: Vec<u16>,
    pub(super) cookie: usize,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy)]
pub(super) struct ActiveWindowTransparency {
    pub(super) window: isize,
    pub(super) pid: u32,
    pub(super) thread_id: u32,
    pub(super) original_accent_policy: OriginalAccentPolicy,
    pub(super) original_system_backdrop: SystemBackdropSnapshot,
    pub(super) original_window_corner_preference: WindowCornerPreferenceSnapshot,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct WindowRectangle {
    pub(super) left: i32,
    pub(super) top: i32,
    pub(super) right: i32,
    pub(super) bottom: i32,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct WindowCandidate {
    pub(super) window: isize,
    pub(super) pid: u32,
    pub(super) thread_id: u32,
    pub(super) visible: bool,
    pub(super) unowned: bool,
    pub(super) chrome_widget: bool,
    pub(super) app_window: bool,
    pub(super) tool_window: bool,
    pub(super) no_redirection_bitmap: bool,
    pub(super) rectangle: WindowRectangle,
}

#[cfg(windows)]
pub(super) struct WindowEnumerationContext {
    pub(super) pid: u32,
    pub(super) virtual_screen: WindowRectangle,
    pub(super) candidates: Vec<WindowCandidate>,
}

impl WindowTransparencyController {
    pub(super) fn new() -> Self {
        Self {
            #[cfg(windows)]
            state: StdMutex::new(WindowTransparencyState::default()),
            #[cfg(windows)]
            marker: WindowTransparencyMarker::new(),
        }
    }

    pub(super) fn bind_verified_process(&self, pid: u32) -> Result<(), WindowTransparencyError> {
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

    pub(super) fn set_enabled(
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

    pub(super) fn restore(&self) -> Result<(), WindowTransparencyError> {
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
    pub(super) fn enable_locked(
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
    pub(super) fn restore_locked(
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
    pub(super) fn is_live(&self) -> bool {
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
    pub(super) fn new() -> Self {
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

    pub(super) fn property_name(&self) -> *const u16 {
        self.property_name.as_ptr()
    }

    pub(super) fn cookie(&self) -> *mut std::ffi::c_void {
        self.cookie as *mut std::ffi::c_void
    }
}

#[cfg(windows)]
impl ActiveWindowTransparency {
    pub(super) fn still_belongs_to(
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
pub(super) fn restore_active_window(
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
pub(super) fn restore_window_system_backdrop<F>(
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
pub(super) fn read_window_system_backdrop(
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
pub(super) fn classify_system_backdrop_read(
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
pub(super) fn write_window_system_backdrop(
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
pub(super) fn restore_window_corner_preference<F>(
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
pub(super) fn read_window_corner_preference(
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
pub(super) fn classify_window_corner_preference_read(
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
pub(super) fn write_window_corner_preference(
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
pub(super) fn clear_extended_client_frame<F>(
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
pub(super) fn transparency_client_frame(
    system_backdrop: SystemBackdropSnapshot,
) -> TransparencyClientFrame {
    match system_backdrop {
        SystemBackdropSnapshot::Unsupported => TransparencyClientFrame::Full,
        SystemBackdropSnapshot::Value(_) => TransparencyClientFrame::None,
    }
}

#[cfg(windows)]
pub(super) fn clear_extended_client_frame_with<F, E>(
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
pub(super) fn restore_extended_client_frame<F>(
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
pub(super) fn claim_window_marker(
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
pub(super) fn window_has_marker(window: HWND, marker: &WindowTransparencyMarker) -> bool {
    !window.is_null() && unsafe { IsWindow(window) } != 0 && raw_window_has_marker(window, marker)
}

#[cfg(windows)]
pub(super) fn raw_window_has_marker(window: HWND, marker: &WindowTransparencyMarker) -> bool {
    !window.is_null() && unsafe { GetPropW(window, marker.property_name()) } == marker.cookie()
}

#[cfg(windows)]
pub(super) fn cleanup_claimed_window_marker(window: HWND, marker: &WindowTransparencyMarker) {
    if raw_window_has_marker(window, marker) {
        let _ = unsafe { RemovePropW(window, marker.property_name()) };
    }
}

#[cfg(windows)]
pub(super) fn remove_window_marker(
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
pub(super) fn release_window_marker(window: HWND, marker: &WindowTransparencyMarker) {
    if window_has_marker(window, marker) {
        let _ = unsafe { RemovePropW(window, marker.property_name()) };
    }
}

#[cfg(windows)]
pub(super) type SetWindowCompositionAttributeFn =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttributeData) -> BOOL;

#[cfg(windows)]
pub(super) type GetWindowCompositionAttributeFn =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttributeData) -> BOOL;

#[cfg(windows)]
pub(super) const TRANSPARENT_ACCENT_POLICY: AccentPolicy = AccentPolicy {
    state: ACCENT_ENABLE_TRANSPARENT_GRADIENT,
    flags: WINDOW_TRANSPARENCY_ACCENT_FLAGS,
    gradient_color: 0,
    animation_id: 0,
};

#[cfg(windows)]
pub(super) const DISABLED_ACCENT_POLICY: AccentPolicy = AccentPolicy {
    state: ACCENT_DISABLED,
    flags: 0,
    gradient_color: 0,
    animation_id: 0,
};

#[cfg(windows)]
pub(super) fn resolve_set_window_composition_attribute() -> Option<SetWindowCompositionAttributeFn>
{
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
pub(super) fn resolve_get_window_composition_attribute() -> Option<GetWindowCompositionAttributeFn>
{
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
pub(super) fn read_window_accent_policy(window: HWND) -> Option<AccentPolicy> {
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
pub(super) fn snapshot_window_accent_policy(window: HWND) -> OriginalAccentPolicy {
    read_window_accent_policy(window)
        .map(OriginalAccentPolicy::Known)
        .unwrap_or(OriginalAccentPolicy::Unknown)
}

#[cfg(windows)]
pub(super) fn write_window_accent_policy(
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
pub(super) fn validate_transparency_window_style(
    style: isize,
) -> Result<(), WindowTransparencyError> {
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
pub(super) fn apply_window_transparency<F>(
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
pub(super) fn restore_window_accent_policy<F>(
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
pub(super) fn read_extended_style(window: HWND) -> Result<isize, WindowTransparencyError> {
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
pub(super) fn has_extended_style(style: isize, flag: u32) -> bool {
    style & flag as isize != 0
}

#[cfg(windows)]
pub(super) fn window_identity(window: HWND) -> Option<(u32, u32)> {
    if window.is_null() || unsafe { IsWindow(window) } == 0 {
        return None;
    }
    let mut pid = 0;
    let thread_id = unsafe { GetWindowThreadProcessId(window, &mut pid) };
    (pid != 0 && thread_id != 0).then_some((pid, thread_id))
}

#[cfg(windows)]
pub(super) fn candidate_still_belongs_to_process(
    candidate: &WindowCandidate,
    process: &BoundWindowProcess,
) -> bool {
    process.is_live()
        && window_identity(candidate.window as HWND) == Some((candidate.pid, candidate.thread_id))
        && candidate.pid == process.pid
        && window_class(candidate.window as HWND) == "Chrome_WidgetWin_1"
}

#[cfg(windows)]
pub(super) fn select_codex_window(pid: u32) -> Result<WindowCandidate, WindowTransparencyError> {
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
pub(super) unsafe extern "system" fn collect_codex_window_candidate(
    window: HWND,
    parameter: LPARAM,
) -> BOOL {
    let context = unsafe { &mut *(parameter as *mut WindowEnumerationContext) };
    if let Some(candidate) = inspect_window_candidate(window, context.virtual_screen) {
        if candidate.qualifies(context.pid, context.virtual_screen) {
            context.candidates.push(candidate);
        }
    }
    1
}

#[cfg(windows)]
pub(super) fn inspect_window_candidate(
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
    pub(super) fn qualifies(&self, pid: u32, virtual_screen: WindowRectangle) -> bool {
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
pub(super) fn select_unique_candidate(
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
pub(super) fn virtual_screen_rectangle() -> Result<WindowRectangle, WindowTransparencyError> {
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
pub(super) fn rectangle_is_nontrivial(rectangle: WindowRectangle, screen: WindowRectangle) -> bool {
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

#[cfg(windows)]
pub(super) fn reveal_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    let existing_explorer_windows = visible_explorer_windows();
    demote_foreground_codex_window();
    allow_explorer_foreground_activation();
    open_target_in_file_explorer(target)?;
    raise_new_explorer_window(&existing_explorer_windows);
    Ok(())
}

#[cfg(windows)]
pub(super) fn open_target_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
    if target.is_dir() {
        open_directory_in_file_explorer(target)
    } else {
        select_item_in_file_explorer(target)
    }
}

#[cfg(windows)]
pub(super) fn open_directory_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
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
pub(super) fn select_item_in_file_explorer(target: &Path) -> Result<(), WorkspaceError> {
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
pub(super) fn path_to_wide(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
pub(super) fn hresult_failed(result: i32) -> bool {
    result < 0
}

#[cfg(windows)]
pub(super) struct ComInitialization {
    pub(super) initialized: bool,
}

#[cfg(windows)]
impl ComInitialization {
    pub(super) fn initialize() -> Result<Self, WorkspaceError> {
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
pub(super) fn raise_new_explorer_window(existing_windows: &[HWND]) {
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
pub(super) fn raise_explorer_window(window: HWND) {
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
