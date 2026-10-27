//! Read-only startup conflict detection, independent of PowerShell/WMI.
use crate::process_guard::ProcessGuardError;
use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::Path,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
        Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
            QueryFullProcessImageNameW, WaitForSingleObject,
        },
    },
};

#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum: u16,
    buffer: *const u16,
}
#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryInformationProcess(
        process: HANDLE,
        class: u32,
        buffer: *mut std::ffi::c_void,
        size: u32,
        returned: *mut u32,
    ) -> i32;
}

fn failure(phase: &str) -> ProcessGuardError {
    ProcessGuardError::Detailed(format!(
        "existing process query failed: backend=native; phase={phase}; OS error {:?}",
        io::Error::last_os_error().raw_os_error()
    ))
}

fn exited_after_query_failure(
    error: Option<i32>,
    remaining: Duration,
    grace: Duration,
    mut wait: impl FnMut(u32) -> u32,
) -> bool {
    // Terminating Electron descendants can still be in ToolHelp while image
    // lookup already returns ERROR_ACCESS_DENIED. Only this retained handle
    // becoming signalled establishes exit; access denial alone never does.
    let initial = wait(0);
    if initial == WAIT_OBJECT_0 {
        return true;
    }
    initial == WAIT_TIMEOUT
        && error == Some(5)
        && !remaining.is_zero()
        && wait(remaining.min(grace).as_millis() as u32) == WAIT_OBJECT_0
}

fn snapshot() -> Result<OwnedHandle, ProcessGuardError> {
    let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if raw == INVALID_HANDLE_VALUE {
        return Err(failure("ToolHelp snapshot"));
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(raw.cast()) })
}

fn capture_entries(
    started: Instant,
    budget: Duration,
) -> Result<Vec<PROCESSENTRY32W>, ProcessGuardError> {
    let snapshot = snapshot()?;
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut more = unsafe { Process32FirstW(snapshot.as_raw_handle().cast(), &mut entry) };
    let mut entries = Vec::new();
    while more != 0 {
        if entries.len() >= 65536 || started.elapsed() > budget {
            return Err(failure(
                "snapshot capture budget exhausted; absence not established",
            ));
        }
        entries.push(entry);
        more = unsafe { Process32NextW(snapshot.as_raw_handle().cast(), &mut entry) };
    }
    if io::Error::last_os_error().raw_os_error() != Some(18) {
        return Err(failure("process enumeration incomplete"));
    }
    if started.elapsed() > budget {
        return Err(failure(
            "snapshot capture budget exhausted; absence not established",
        ));
    }
    Ok(entries)
}

fn reconcile_open_failure(
    pid: u32,
    os_code: Option<i32>,
    restarts: usize,
    started: Instant,
    budget: Duration,
    capture: impl FnOnce() -> Result<Vec<PROCESSENTRY32W>, ProcessGuardError>,
) -> Result<Vec<PROCESSENTRY32W>, ProcessGuardError> {
    let original = ProcessGuardError::Detailed(format!(
        "existing process query failed: backend=native; phase=matching process handle unavailable; OS error {os_code:?}; pid={pid}"
    ));
    // ERROR_INVALID_PARAMETER is only a reason to reconcile a stale entry.
    // It is never proof of absence, and PID0/access denial cannot use this path.
    if pid == 0 || os_code != Some(87) || restarts >= 8 || started.elapsed() >= budget {
        return Err(original);
    }
    let fresh = capture().map_err(|error| {
        original
            .clone()
            .context("Refreshing process snapshot", error)
    })?;
    if started.elapsed() >= budget {
        return Err(original.context(
            "Refreshing process snapshot",
            "Total inspection deadline expired",
        ));
    }
    if fresh.iter().any(|entry| entry.th32ProcessID == pid) {
        return Err(original.context(
            "Refreshing process snapshot",
            "PID remains in the complete fresh snapshot; absence not established",
        ));
    }
    Ok(fresh)
}

// Pointer arithmetic is validated as integers before dereferencing kernel output.
fn command_text(bytes: &[usize]) -> Option<String> {
    let start = bytes.as_ptr() as usize;
    let end = start.checked_add(std::mem::size_of_val(bytes))?;
    if std::mem::size_of_val(bytes) < std::mem::size_of::<UnicodeString>() {
        return None;
    }
    let text = unsafe { &*bytes.as_ptr().cast::<UnicodeString>() };
    let ptr = text.buffer as usize;
    if text.length == 0
        || text.length % 2 != 0
        || text.length > text.maximum
        || ptr % 2 != 0
        || ptr < start + std::mem::size_of::<UnicodeString>()
        || ptr.checked_add(text.length as usize)? > end
    {
        return None;
    }
    String::from_utf16(unsafe { std::slice::from_raw_parts(text.buffer, text.length as usize / 2) })
        .ok()
}

fn command_line(handle: HANDLE) -> Option<String> {
    // ProcessCommandLineInformation (60), optional on supported Windows versions.
    // Fixed maximum allocation; unsupported/access-denied/oversized queries stay unknown.
    let mut buffer = vec![0usize; 65536 / std::mem::size_of::<usize>()];
    let mut returned = 0;
    let status = unsafe {
        NtQueryInformationProcess(handle, 60, buffer.as_mut_ptr().cast(), 65536, &mut returned)
    };
    if status < 0 || returned > 65536 || returned < std::mem::size_of::<UnicodeString>() as u32 {
        return None;
    }
    buffer.truncate((returned as usize).div_ceil(std::mem::size_of::<usize>()));
    command_text(&buffer)
}

pub(crate) fn is_running(image: &Path) -> Result<bool, ProcessGuardError> {
    inspect_with_policy(image, false)
}

/// Only after the consent worker verified the original browser's exit.
/// Electron descendants may still be tearing down. Wait on their retained
/// handles, then take a fresh complete snapshot; never skip live/unknown PIDs.
pub(crate) fn after_restart(image: &Path) -> Result<bool, ProcessGuardError> {
    inspect_with_policy(image, true)
}

fn inspect_with_policy(image: &Path, after_restart: bool) -> Result<bool, ProcessGuardError> {
    let started = Instant::now();
    let budget = Duration::from_millis(if after_restart { 15_000 } else { 1500 });
    let grace = if after_restart {
        budget
    } else {
        Duration::from_millis(250)
    };
    let result = inspect(image, started, budget, grace).and_then(|running| {
        if after_restart && !running {
            // A waited-on old snapshot cannot establish absence of a browser
            // created during teardown. Rescan under the SAME total deadline.
            inspect(image, started, budget, grace)
        } else {
            Ok(running)
        }
    });
    crate::process_diagnostics::observe(
        "existing process",
        "native conflict inspection",
        if result.is_ok() { "passed" } else { "failed" },
        serde_json::json!({"backend":"ToolHelp/retained process handle","wmiRequested":false,"afterVerifiedOldExit":after_restart,"budgetMs":budget.as_millis(),"freshSnapshotRequired":after_restart,"durationMs":started.elapsed().as_millis(),"running":result.as_ref().ok(),"error":result.as_ref().err().map(ToString::to_string),"identityChecksBypassed":false}),
    );
    result
}

fn inspect(
    image: &Path,
    started: Instant,
    budget: Duration,
    grace: Duration,
) -> Result<bool, ProcessGuardError> {
    let expected =
        dunce::canonicalize(image).map_err(|_| failure("official image canonicalization"))?;
    if !expected.is_file() {
        return Err(failure("official image is not a regular file"));
    }
    let name = expected
        .file_name()
        .ok_or_else(|| failure("official file name"))?
        .to_string_lossy();
    let entries = capture_entries(started, budget)?;
    scan_entries(&expected, &name, entries, started, budget, grace)
}

fn scan_entries(
    expected: &Path,
    name: &str,
    mut entries: Vec<PROCESSENTRY32W>,
    started: Instant,
    budget: Duration,
    grace: Duration,
) -> Result<bool, ProcessGuardError> {
    let mut index = 0;
    let mut restarts = 0;
    while index < entries.len() {
        if started.elapsed() > budget {
            return Err(failure(
                "snapshot budget exhausted; absence not established",
            ));
        }
        let entry = &entries[index];
        let length = entry
            .szExeFile
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(entry.szExeFile.len());
        if String::from_utf16_lossy(&entry.szExeFile[..length]).eq_ignore_ascii_case(&name) {
            let raw = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    entry.th32ProcessID,
                )
            };
            if raw.is_null() {
                let os_code = io::Error::last_os_error().raw_os_error();
                let refreshed = reconcile_open_failure(
                    entry.th32ProcessID,
                    os_code,
                    restarts,
                    started,
                    budget,
                    || capture_entries(started, budget),
                );
                crate::process_diagnostics::observe(
                    "existing process",
                    "matching process open reconciliation",
                    if refreshed.is_ok() {
                        "stale snapshot replaced"
                    } else {
                        "failed"
                    },
                    serde_json::json!({"pid":entry.th32ProcessID,"parentPid":entry.th32ParentProcessID,"osCode":os_code,"snapshotRestart":restarts,"freshSnapshotCompleteAndPidAbsent":refreshed.is_ok(),"deadlineExtended":false,"identityChecksBypassed":false,"error":refreshed.as_ref().err().map(ToString::to_string)}),
                );
                entries = refreshed?;
                restarts += 1;
                index = 0;
                continue;
            }
            let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
            let state = unsafe { WaitForSingleObject(raw, 0) };
            if state == WAIT_TIMEOUT {
                let mut path = vec![0u16; 32768];
                let mut size = path.len() as u32;
                if unsafe { QueryFullProcessImageNameW(raw, 0, path.as_mut_ptr(), &mut size) } == 0
                {
                    let os_code = io::Error::last_os_error().raw_os_error();
                    let error = failure("matching image query");
                    let remaining = budget.saturating_sub(started.elapsed());
                    let waited = Instant::now();
                    let exited =
                        exited_after_query_failure(os_code, remaining, grace, |ms| unsafe {
                            WaitForSingleObject(raw, ms)
                        });
                    crate::process_diagnostics::observe(
                        "existing process",
                        "retained image-query failure",
                        if exited { "exited" } else { "failed" },
                        serde_json::json!({"pid":entry.th32ProcessID,"parentPid":entry.th32ParentProcessID,"osCode":os_code,"sameRetainedHandle":true,"exitConfirmed":exited,"graceLimitMs":grace.as_millis(),"waitedMs":waited.elapsed().as_millis(),"remainingBudgetMs":remaining.as_millis(),"identityChecksBypassed":false}),
                    );
                    if !exited {
                        return Err(error);
                    }
                } else {
                    use std::os::windows::ffi::OsStringExt;
                    let actual = std::path::PathBuf::from(std::ffi::OsString::from_wide(
                        &path[..size as usize],
                    ));
                    let actual = dunce::canonicalize(actual)
                        .map_err(|_| failure("matching image canonicalization"))?;
                    if actual
                        .as_os_str()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(&expected.as_os_str().to_string_lossy())
                    {
                        let command = command_line(raw);
                        match unsafe { WaitForSingleObject(handle.as_raw_handle().cast(), 0) } {
                            WAIT_OBJECT_0 => {}
                            WAIT_TIMEOUT => {
                                if crate::process_guard::should_count_running_process(
                                    command.as_deref(),
                                ) {
                                    return Ok(true);
                                }
                            }
                            _ => return Err(failure("matching process wait after command query")),
                        }
                    }
                }
            } else if state != WAIT_OBJECT_0 {
                return Err(failure("matching process wait state unknown"));
            }
        }
        index += 1;
    }
    if started.elapsed() > budget {
        return Err(failure(
            "snapshot budget exhausted; absence not established",
        ));
    }
    Ok(false)
}

pub(crate) fn observe_origin(mode: &str) {
    let result = (|| {
        let start = Instant::now();
        let snapshot = snapshot()?;
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = unsafe { Process32FirstW(snapshot.as_raw_handle().cast(), &mut entry) };
        let mut scanned = 0;
        while more != 0 && scanned < 65536 && start.elapsed() < Duration::from_millis(100) {
            if entry.th32ProcessID == std::process::id() {
                return Ok(entry.th32ParentProcessID);
            }
            scanned += 1;
            more = unsafe { Process32NextW(snapshot.as_raw_handle().cast(), &mut entry) };
        }
        Err(failure("launch parent observation unavailable"))
    })();
    crate::process_diagnostics::observe(
        "startup",
        "invocation origin",
        "observed",
        serde_json::json!({"mode":mode,"launcherPid":std::process::id(),"parentPid":result.as_ref().ok(),"parentLookupError":result.err().map(|e|e.to_string()),"parentIdentityVerified":false,"triggerAction":"unknown; parent PID alone does not establish user action","rawCommandLineCollected":false}),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vanished_open_requires_exact_error_absent_nonzero_pid_and_complete_snapshot() {
        let start = Instant::now();
        let budget = Duration::from_secs(2);
        assert!(reconcile_open_failure(42, Some(87), 0, start, budget, || Ok(vec![])).is_ok());
        for (pid, code, retries) in [
            (0, Some(87), 0),
            (42, Some(5), 0),
            (42, None, 0),
            (42, Some(87), 8),
        ] {
            assert!(
                reconcile_open_failure(pid, code, retries, start, budget, || panic!(
                    "Ineligible failure must not refresh"
                ))
                .is_err()
            );
        }
        assert!(
            reconcile_open_failure(42, Some(87), 0, start, Duration::ZERO, || panic!(
                "Expired deadline must not refresh"
            ))
            .is_err()
        );
        let mut present: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        present.th32ProcessID = 42;
        let error = reconcile_open_failure(42, Some(87), 0, start, budget, || Ok(vec![present]))
            .err()
            .unwrap();
        assert!(error.to_string().contains("absence not established"));
        assert!(error.to_string().contains("pid=42"));
        assert_eq!(
            crate::app_diagnostics::process_diagnostic(&error).0,
            "CC-START-PROCESS-011"
        );
        assert!(
            reconcile_open_failure(42, Some(87), 0, start, budget, || Err(failure(
                "incomplete fixture snapshot"
            )))
            .is_err()
        );
        assert!(
            reconcile_open_failure(42, Some(87), 0, start, Duration::from_millis(30), || {
                std::thread::sleep(Duration::from_millis(40));
                Ok(vec![])
            })
            .is_err()
        );
    }

    fn snapshot_child(image: &Path, ms: u32) -> std::process::Child {
        use std::os::windows::process::CommandExt;
        std::process::Command::new(image)
            .args([
                "--exact",
                "process_preflight::tests::image_query_exit_fixture",
                "--test-threads=1",
            ])
            .env("CLE_PREFLIGHT_EXIT_FIXTURE", ms.to_string())
            .creation_flags(0x0800_0000)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap()
    }

    fn actual_stale_entry() -> (tempfile::TempDir, std::path::PathBuf, PROCESSENTRY32W) {
        let directory = tempfile::tempdir().unwrap();
        let image = directory.path().join("snapshot-exit-fixture.exe");
        std::fs::copy(std::env::current_exe().unwrap(), &image).unwrap();
        // inspect() canonicalizes before scan_entries(). Temp paths on hosted
        // Windows runners may contain RUNNER~1; retain that production contract.
        let image = dunce::canonicalize(image).unwrap();
        let mut child = snapshot_child(&image, 200);
        let pid = child.id();
        let entry = capture_entries(Instant::now(), Duration::from_secs(2))
            .unwrap()
            .into_iter()
            .find(|row| row.th32ProcessID == pid)
            .unwrap();
        assert!(child.wait().unwrap().success());
        drop(child); // Release the final fixture handle; never identify by a recycled PID.
        assert_native_open87(pid);
        (directory, image, entry)
    }

    fn assert_native_open87(pid: u32) {
        let deadline = Instant::now();
        loop {
            let raw = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    pid,
                )
            };
            let code = io::Error::last_os_error().raw_os_error();
            if raw.is_null() {
                assert_eq!(
                    code,
                    Some(87),
                    "Actual OpenProcess87 must be observed, not mocked"
                );
                eprintln!(
                    "Native stale fixture: pid={pid}; actualOpenError=87; objectReclamationMs={}",
                    deadline.elapsed().as_millis()
                );
                return;
            }
            let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
            assert_eq!(
                unsafe { WaitForSingleObject(raw, 0) },
                WAIT_OBJECT_0,
                "Fixture PID may have been reused; no process was modified"
            );
            drop(handle);
            assert!(
                deadline.elapsed() < Duration::from_secs(5),
                "Exited fixture object still externally retained; actual OS87 not reproduced"
            );
            // Exit and final object reclamation are different events. Release
            // the probe handle before waiting for the latter.
            std::thread::sleep(Duration::from_millis(30));
        }
    }

    #[test]
    fn actual_open87_stale_snapshot_is_replaced_and_absence_rechecked() {
        let (_directory, image, entry) = actual_stale_entry();
        assert!(
            !scan_entries(
                &image,
                "snapshot-exit-fixture.exe",
                vec![entry],
                Instant::now(),
                Duration::from_secs(2),
                Duration::from_millis(250)
            )
            .unwrap()
        );
    }

    #[test]
    fn actual_open87_refresh_still_finds_a_new_live_browser() {
        let (_directory, image, entry) = actual_stale_entry();
        let ready = _directory.path().join("replacement-ready");
        use std::os::windows::process::CommandExt;
        let mut replacement = std::process::Command::new(&image)
            .args([
                "--exact",
                "process_preflight::tests::image_query_exit_fixture",
                "--test-threads=1",
            ])
            .env("CLE_PREFLIGHT_EXIT_FIXTURE", "15000")
            .env("CLE_PREFLIGHT_READY_FILE", &ready)
            .creation_flags(0x0800_0000)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let ready_started = Instant::now();
        while !ready.is_file()
            && replacement.try_wait().unwrap().is_none()
            && ready_started.elapsed() < Duration::from_secs(5)
        {
            std::thread::sleep(Duration::from_millis(10));
        }
        if !ready.is_file() {
            let _ = replacement.kill();
            let _ = replacement.wait();
            panic!("Replacement fixture did not confirm initialization before snapshot test");
        }
        let result = scan_entries(
            &image,
            "snapshot-exit-fixture.exe",
            vec![entry],
            Instant::now(),
            Duration::from_secs(2),
            Duration::from_millis(250),
        );
        let _ = replacement.kill();
        let _ = replacement.wait();
        assert!(
            result.unwrap(),
            "Refreshing a stale snapshot must not miss the new exact-image process"
        );
    }

    #[test]
    fn actual_open87_discards_all_obsolete_entries_after_two_children_exit() {
        let directory = tempfile::tempdir().unwrap();
        let image = directory.path().join("snapshot-exit-fixture.exe");
        std::fs::copy(std::env::current_exe().unwrap(), &image).unwrap();
        let mut children = vec![snapshot_child(&image, 1500), snapshot_child(&image, 1500)];
        let pids: Vec<_> = children.iter().map(std::process::Child::id).collect();
        let entries: Vec<_> = capture_entries(Instant::now(), Duration::from_secs(2))
            .unwrap()
            .into_iter()
            .filter(|row| pids.contains(&row.th32ProcessID))
            .collect();
        assert_eq!(
            entries.len(),
            2,
            "Both real children must be in the same old snapshot"
        );
        for child in &mut children {
            assert!(child.wait().unwrap().success());
        }
        drop(children);
        for pid in pids {
            assert_native_open87(pid);
        }
        assert!(
            !scan_entries(
                &image,
                "snapshot-exit-fixture.exe",
                entries,
                Instant::now(),
                Duration::from_secs(2),
                Duration::from_millis(250)
            )
            .unwrap()
        );
    }

    #[test]
    fn image_query_denial_requires_same_handle_exit_and_respects_budget() {
        let mut calls = Vec::new();
        assert!(exited_after_query_failure(
            Some(5),
            Duration::from_secs(1),
            Duration::from_millis(250),
            |ms| {
                calls.push(ms);
                if ms == 0 { WAIT_TIMEOUT } else { WAIT_OBJECT_0 }
            }
        ));
        assert_eq!(calls, vec![0, 250]);
        for code in [None, Some(5), Some(87)] {
            assert!(!exited_after_query_failure(
                code,
                Duration::from_secs(1),
                Duration::from_millis(250),
                |_| WAIT_TIMEOUT
            ));
            assert!(!exited_after_query_failure(
                code,
                Duration::from_secs(1),
                Duration::from_millis(250),
                |_| u32::MAX
            ));
        }
        let mut unknown_calls = 0;
        assert!(!exited_after_query_failure(
            Some(5),
            Duration::from_secs(1),
            Duration::from_millis(250),
            |_| {
                unknown_calls += 1;
                if unknown_calls == 1 {
                    u32::MAX
                } else {
                    WAIT_OBJECT_0
                }
            }
        ));
        assert_eq!(unknown_calls, 1);
        calls.clear();
        assert!(!exited_after_query_failure(
            Some(5),
            Duration::ZERO,
            Duration::from_millis(250),
            |ms| {
                calls.push(ms);
                WAIT_TIMEOUT
            }
        ));
        assert_eq!(calls, vec![0]);
        calls.clear();
        assert!(!exited_after_query_failure(
            Some(5),
            Duration::from_millis(17),
            Duration::from_millis(250),
            |ms| {
                calls.push(ms);
                WAIT_TIMEOUT
            }
        ));
        assert_eq!(calls, vec![0, 17]);
        calls.clear();
        assert!(!exited_after_query_failure(
            Some(87),
            Duration::from_secs(1),
            Duration::from_millis(250),
            |ms| {
                calls.push(ms);
                WAIT_TIMEOUT
            }
        ));
        assert_eq!(calls, vec![0]);
    }
    #[test]
    fn image_query_exit_fixture() {
        if std::env::var_os("CLE_PREFLIGHT_EXIT_FIXTURE").is_some() {
            if let Some(path) = std::env::var_os("CLE_PREFLIGHT_READY_FILE") {
                std::fs::write(path, b"ready").unwrap();
            }
            let ms = std::env::var("CLE_PREFLIGHT_EXIT_FIXTURE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100);
            std::thread::sleep(Duration::from_millis(ms));
        }
    }
    #[test]
    fn image_query_denial_waits_for_actual_retained_child_exit() {
        use std::os::windows::process::CommandExt;
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "process_preflight::tests::image_query_exit_fixture",
                "--test-threads=1",
            ])
            .env("CLE_PREFLIGHT_EXIT_FIXTURE", "100")
            .creation_flags(0x0800_0000)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let raw = child.as_raw_handle().cast();
        assert!(exited_after_query_failure(
            Some(5),
            Duration::from_secs(1),
            Duration::from_millis(250),
            |ms| unsafe { WaitForSingleObject(raw, ms) }
        ));
        assert!(child.wait().unwrap().success());
    }

    #[test]
    fn post_close_wait_handles_slow_descendant_without_reclassifying_a_live_process() {
        use std::os::windows::process::CommandExt;
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "process_preflight::tests::image_query_exit_fixture",
                "--test-threads=1",
            ])
            .env("CLE_PREFLIGHT_EXIT_FIXTURE", "800")
            .creation_flags(0x0800_0000)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let raw = child.as_raw_handle().cast();
        assert!(!exited_after_query_failure(
            Some(5),
            Duration::from_millis(40),
            Duration::from_secs(15),
            |ms| unsafe { WaitForSingleObject(raw, ms) }
        ));
        // This is precisely the previous 250ms failure: the process is still
        // alive, so no absence is claimed. The post-close policy keeps waiting.
        assert!(!exited_after_query_failure(
            Some(5),
            Duration::from_secs(1),
            Duration::from_millis(250),
            |ms| unsafe { WaitForSingleObject(raw, ms) }
        ));
        assert!(exited_after_query_failure(
            Some(5),
            Duration::from_secs(3),
            Duration::from_secs(15),
            |ms| unsafe { WaitForSingleObject(raw, ms) }
        ));
        assert!(child.wait().unwrap().success());
    }

    #[test]
    fn post_close_still_detects_live_and_different_exact_images() {
        let exe = std::env::current_exe().unwrap();
        assert!(after_restart(&exe).unwrap());
        let dir = tempfile::tempdir().unwrap();
        let other = dir.path().join(exe.file_name().unwrap());
        std::fs::write(&other, b"not executing").unwrap();
        assert!(!after_restart(&other).unwrap());
    }
    #[test]
    fn native_preflight_current_and_other_image() {
        let exe = std::env::current_exe().expect("current image");
        assert!(is_running(&exe).expect("native current process"));
        let dir = tempfile::tempdir().expect("tempdir");
        let other = dir.path().join(exe.file_name().expect("file"));
        std::fs::write(&other, b"not executing").expect("fixture");
        assert!(!is_running(&other).expect("same basename different exact image"));
        assert!(is_running(&dir.path().join("missing.exe")).is_err());
    }
    #[test]
    fn native_preflight_command_query_same_handle() {
        let raw = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                0,
                std::process::id(),
            )
        };
        assert!(!raw.is_null());
        let h = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
        let command = command_line(h.as_raw_handle().cast()).expect("native command line");
        assert!(!command.is_empty());
    }
    #[test]
    fn native_preflight_rejects_invalid_kernel_text() {
        assert!(command_text(&[]).is_none());
        let mut bytes = vec![0usize; 16];
        assert!(command_text(&bytes).is_none());
        let base = bytes.as_ptr() as usize;
        let header = unsafe { &mut *bytes.as_mut_ptr().cast::<UnicodeString>() };
        header.length = 2;
        header.maximum = 2;
        header.buffer = (base + 4096) as *const u16;
        assert!(command_text(&bytes).is_none());
    }
    #[test]
    fn native_preflight_command_text_bounds_and_unknown_policy() {
        let mut bytes = vec![0usize; 16];
        let ptr = unsafe {
            bytes
                .as_mut_ptr()
                .cast::<u8>()
                .add(std::mem::size_of::<UnicodeString>())
                .cast::<u16>()
        };
        unsafe {
            *ptr = b'x' as u16;
        }
        let header = unsafe { &mut *bytes.as_mut_ptr().cast::<UnicodeString>() };
        header.length = 2;
        header.maximum = 2;
        header.buffer = ptr;
        assert_eq!(command_text(&bytes).as_deref(), Some("x"));
        unsafe {
            (*bytes.as_mut_ptr().cast::<UnicodeString>()).length = 1;
        }
        assert!(command_text(&bytes).is_none());
        unsafe {
            (*bytes.as_mut_ptr().cast::<UnicodeString>()).length = 4;
        }
        assert!(command_text(&bytes).is_none());
        assert!(crate::process_guard::should_count_running_process(None));
        assert!(crate::process_guard::should_count_running_process(Some("")));
        assert!(!crate::process_guard::should_count_running_process(Some(
            "Codex.exe --type=renderer"
        )));
    }
    #[test]
    fn native_preflight_failure_keeps_stable_support_code() {
        let error = failure("synthetic access denied");
        assert_eq!(
            crate::app_diagnostics::process_diagnostic(&error).0,
            "CC-START-PROCESS-011"
        );
    }
}
