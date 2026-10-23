//! Graceful exit of one pinned process, including hidden/tray and multi-window apps.
//! No titles, terminate access, force flag, file resources or service names.
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::{Path, PathBuf},
    ptr,
};
use windows_sys::Win32::{
    Foundation::{FILETIME, HWND, LPARAM, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::{
        RestartManager::{
            RM_PROCESS_INFO, RM_UNIQUE_PROCESS, RmCritical, RmEndSession, RmExplorer, RmGetList,
            RmRegisterResources, RmService, RmShutdown, RmStartSession,
        },
        Threading::{
            GetCurrentProcessId, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE, QueryFullProcessImageNameW, WaitForSingleObject,
        },
    },
    UI::WindowsAndMessaging::{
        EnumWindows, GW_OWNER, GetClassNameW, GetWindow, GetWindowThreadProcessId, IsWindowVisible,
    },
};

#[link(name = "kernel32")]
unsafe extern "system" {
    fn ProcessIdToSessionId(pid: u32, session: *mut u32) -> i32;
}
#[link(name = "user32")]
unsafe extern "system" {
    fn IsWindowEnabled(window: HWND) -> i32;
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Window {
    handle: usize,
    visible: bool,
    enabled: bool,
    owned: bool,
    class: String,
}
struct Enumeration {
    pid: u32,
    windows: Vec<Window>,
    overflow: bool,
}

unsafe extern "system" fn collect(hwnd: HWND, data: LPARAM) -> i32 {
    // EnumWindows calls synchronously while Enumeration lives on this thread.
    let state = unsafe { &mut *(data as *mut Enumeration) };
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    if pid != state.pid {
        return 1;
    }
    if state.windows.len() >= 128 {
        state.overflow = true;
        return 0;
    }
    let mut class = [0u16; 256];
    let length =
        unsafe { GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32) }.max(0) as usize;
    state.windows.push(Window {
        handle: hwnd as usize,
        visible: unsafe { IsWindowVisible(hwnd) } != 0,
        enabled: unsafe { IsWindowEnabled(hwnd) } != 0,
        owned: !unsafe { GetWindow(hwnd, GW_OWNER) }.is_null(),
        class: String::from_utf16_lossy(&class[..length]),
    });
    1
}

fn windows(pid: u32) -> Result<Vec<Window>, String> {
    let mut state = Enumeration {
        pid,
        windows: Vec::new(),
        overflow: false,
    };
    let ok = unsafe { EnumWindows(Some(collect), (&mut state as *mut Enumeration) as LPARAM) };
    if state.overflow {
        return Err("Codex window enumeration exceeds its safety budget".into());
    }
    if ok == 0 {
        return Err(os_error("EnumWindows"));
    }
    Ok(state.windows)
}
fn os_error(operation: &str) -> String {
    format!("{operation}: {}", io::Error::last_os_error())
}
fn ticks(time: FILETIME) -> u64 {
    (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime)
}
fn same_image(actual: &Path, expected: &Path) -> bool {
    actual
        .to_string_lossy()
        .eq_ignore_ascii_case(&expected.to_string_lossy())
}
fn validate_generation(created: FILETIME, expected_ms: u64) -> Result<(), String> {
    if (ticks(created) / 10_000).checked_sub(11_644_473_600_000) != Some(expected_ms) {
        return Err("Official process creation time changed; no shutdown requested".into());
    }
    Ok(())
}
fn current_session(pid: u32) -> Result<u32, String> {
    let mut session = 0;
    if unsafe { ProcessIdToSessionId(pid, &mut session) } == 0 {
        return Err(os_error("ProcessIdToSessionId"));
    }
    Ok(session)
}
fn exited(handle: &OwnedHandle) -> Result<bool, String> {
    match unsafe { WaitForSingleObject(handle.as_raw_handle().cast(), 0) } {
        WAIT_OBJECT_0 => Ok(true),
        WAIT_TIMEOUT => Ok(false),
        _ => Err(os_error("Process state")),
    }
}
struct Session(u32);
impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            RmEndSession(self.0);
        }
    }
}
fn rm_ok(code: u32, operation: &str) -> Result<(), String> {
    if code == 0 {
        Ok(())
    } else {
        Err(format!(
            "{operation}: Windows error {code}; no forced termination was used"
        ))
    }
}
fn validate_affected(
    rows: &[RM_PROCESS_INFO],
    expected: RM_UNIQUE_PROCESS,
    session: u32,
    reasons: u32,
) -> Result<(), String> {
    if reasons != 0
        || rows.len() > 1
        || rows.iter().any(|row| {
            row.Process.dwProcessId != expected.dwProcessId
                || ticks(row.Process.ProcessStartTime) != ticks(expected.ProcessStartTime)
                || row.TSSessionId != session
                || [RmCritical, RmExplorer, RmService].contains(&row.ApplicationType)
        })
    {
        return Err("Restart Manager scope is not exactly the inspected Codex process; no shutdown requested".into());
    }
    Ok(())
}

pub(super) fn operate(
    pid: u32,
    created_ms: u64,
    image: &Path,
    close: bool,
) -> Result<Value, String> {
    if pid == 0 || pid == unsafe { GetCurrentProcessId() } {
        return Err("Invalid recovery target".into());
    }
    let expected = dunce::canonicalize(image).map_err(|e| format!("Recovery image: {e}"))?;
    let raw = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            0,
            pid,
        )
    };
    if raw.is_null() {
        return Err(os_error("OpenProcess (query only)"));
    }
    let process = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
    let mut times = [FILETIME::default(); 4];
    if unsafe {
        GetProcessTimes(
            raw,
            &mut times[0],
            &mut times[1],
            &mut times[2],
            &mut times[3],
        )
    } == 0
    {
        return Err(os_error("GetProcessTimes"));
    }
    validate_generation(times[0], created_ms)?;
    let mut buffer = vec![0u16; 32768];
    let mut length = buffer.len() as u32;
    if unsafe { QueryFullProcessImageNameW(raw, 0, buffer.as_mut_ptr(), &mut length) } == 0 {
        return Err(os_error("QueryFullProcessImageNameW"));
    }
    let actual = dunce::canonicalize(PathBuf::from(String::from_utf16_lossy(
        &buffer[..length as usize],
    )))
    .map_err(|e| format!("Process image: {e}"))?;
    if !same_image(&actual, &expected) {
        return Err("Official process image changed; no shutdown requested".into());
    }
    let session_id = current_session(pid)?;
    if session_id != current_session(unsafe { GetCurrentProcessId() })? {
        return Err("Codex belongs to a different Windows session".into());
    }
    let inventory = windows(pid)?;
    let mut report = json!({"schema":1,"pid":pid,"createdMs":created_ms,"readOnly":!close,
        "force":false,"windows":inventory,"shutdownRequested":false,"exited":exited(&process)?});
    if !close || exited(&process)? {
        return Ok(report);
    }
    // Disabled visible windows can indicate unsaved-changes/modal prompts.
    // Do not dismiss them or bypass an application's refusal to exit.
    if inventory.iter().any(|w| w.visible && !w.enabled) {
        return Err(
            "Codex has an active modal dialog; dismiss it before retrying. No shutdown requested"
                .into(),
        );
    }
    let mut handle = 0;
    let mut key = [0u16; 33];
    rm_ok(
        unsafe { RmStartSession(&mut handle, 0, key.as_mut_ptr()) },
        "RmStartSession",
    )?;
    let session = Session(handle);
    let unique = RM_UNIQUE_PROCESS {
        dwProcessId: pid,
        ProcessStartTime: times[0],
    };
    // ONLY this PID + exact FILETIME; never register executable/file resources
    // that could affect other instances or processes using the same files.
    rm_ok(
        unsafe { RmRegisterResources(session.0, 0, ptr::null(), 1, &unique, 0, ptr::null()) },
        "RmRegisterResources",
    )?;
    let mut rows = [RM_PROCESS_INFO::default(); 8];
    let (mut needed, mut count, mut reasons) = (0, rows.len() as u32, 0);
    rm_ok(
        unsafe {
            RmGetList(
                session.0,
                &mut needed,
                &mut count,
                rows.as_mut_ptr(),
                &mut reasons,
            )
        },
        "RmGetList",
    )?;
    if count as usize > rows.len() {
        return Err("Restart Manager returned an invalid process count".into());
    }
    validate_affected(&rows[..count as usize], unique, session_id, reasons)?;
    if exited(&process)? {
        report["exited"] = json!(true);
        return Ok(report);
    }
    if count != 1 {
        return Err(
            "Restart Manager could not verify the registered process; no shutdown requested".into(),
        );
    }
    // Zero explicitly excludes RmForceShutdown. Orderly exit handles hidden/
    // tray windows too; a veto or hung app fails without termination or restart.
    rm_ok(
        unsafe { RmShutdown(session.0, 0, None) },
        "Codex graceful shutdown",
    )?;
    report["shutdownRequested"] = json!(true);
    report["exited"] = json!(exited(&process)?);
    report["method"] = json!("restart-manager-nonforcing");
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shutdown_scope_rejects_other_pids_generations_sessions_and_services() {
        let unique = RM_UNIQUE_PROCESS {
            dwProcessId: 42,
            ProcessStartTime: FILETIME {
                dwLowDateTime: 123,
                dwHighDateTime: 1,
            },
        };
        let row = RM_PROCESS_INFO {
            Process: unique,
            TSSessionId: 2,
            ApplicationType: 1,
            ..Default::default()
        };
        assert!(validate_affected(&[row], unique, 2, 0).is_ok());
        for changed in [
            RM_PROCESS_INFO {
                Process: RM_UNIQUE_PROCESS {
                    dwProcessId: 43,
                    ..unique
                },
                ..row
            },
            RM_PROCESS_INFO {
                Process: RM_UNIQUE_PROCESS {
                    ProcessStartTime: FILETIME::default(),
                    ..unique
                },
                ..row
            },
            RM_PROCESS_INFO {
                TSSessionId: 3,
                ..row
            },
            RM_PROCESS_INFO {
                ApplicationType: RmService,
                ..row
            },
            RM_PROCESS_INFO {
                ApplicationType: RmCritical,
                ..row
            },
            RM_PROCESS_INFO {
                ApplicationType: RmExplorer,
                ..row
            },
        ] {
            assert!(validate_affected(&[changed], unique, 2, 0).is_err());
        }
        assert!(validate_affected(&[row, row], unique, 2, 0).is_err());
        assert!(validate_affected(&[row], unique, 2, 1).is_err());
    }
    #[test]
    fn generation_guard_is_checked_before_window_or_restart_manager_operations() {
        let raw = (11_644_473_600_000u64 + 123_456) * 10_000;
        let time = FILETIME {
            dwLowDateTime: raw as u32,
            dwHighDateTime: (raw >> 32) as u32,
        };
        assert!(validate_generation(time, 123_456).is_ok());
        assert!(validate_generation(time, 123_455).is_err());
        assert!(validate_generation(FILETIME::default(), 0).is_err());
    }
}
