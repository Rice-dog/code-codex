//! Read-only, bounded process queries. Observations never authorize attachment.
use crate::{process_guard::ProcessGuardError, runtime_log};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    io::{self, Read},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const QUERY_TIMEOUT: Duration = Duration::from_secs(12);
const STDERR_LIMIT: usize = 64 * 1024;
const EVENT_LIMIT: usize = 128;
const REPORT_LIMIT: usize = 80 * 1024;
const PREFIX: &str = "CC_PROCESS_QUERY=";
static HISTORY: OnceLock<Mutex<(VecDeque<String>, usize, Option<Instant>)>> = OnceLock::new();

#[cfg(test)]
pub(crate) static TEST_TRACE_LOCK: Mutex<()> = Mutex::new(());
pub(crate) fn reset() {
    #[cfg(windows)]
    if let Ok(mut slot) = ACTIVATION_HANDLE.lock() {
        *slot = None;
    }
    if let Ok(mut history) = HISTORY.get_or_init(Default::default).lock() {
        *history = (VecDeque::new(), 0, Some(Instant::now()));
    }
}

pub(crate) fn observe(operation: &str, phase: &str, outcome: &str, details: Value) {
    let details = runtime_log::redaction::value(details);
    runtime_log::record(
        "process check",
        phase,
        outcome,
        json!({"check":operation,"observation":details}),
    );
    if let Ok(mut history) = HISTORY.get_or_init(Default::default).lock() {
        let elapsed = history
            .2
            .get_or_insert_with(Instant::now)
            .elapsed()
            .as_millis();
        let line = format!("+{elapsed} ms | {operation} | {phase} | {outcome} | {details}");
        if history.0.len() == EVENT_LIMIT {
            history.0.pop_front();
            history.1 += 1;
        }
        history.0.push_back(line);
    }
}

pub(crate) fn report() -> String {
    let Ok(history) = HISTORY.get_or_init(Default::default).lock() else {
        return "Process verification observations: unavailable (lock failed)".into();
    };
    if history.0.is_empty() {
        return "Process verification observations: no query executed".into();
    }
    let mut result = format!(
        "Process verification observations (schema 1; older events omitted={}):\n",
        history.1
    );
    let mut retained = Vec::new();
    let mut retained_bytes = result.len();
    for line in history.0.iter().rev() {
        if retained_bytes + line.len() > REPORT_LIMIT {
            break;
        }
        retained_bytes += line.len() + 1;
        retained.push(line);
    }
    let omitted = history.0.len() - retained.len();
    for line in retained.into_iter().rev() {
        result.push_str(line);
        result.push('\n');
    }
    if omitted > 0 {
        result.push_str(&format!("Report byte limit: {omitted} events omitted\n"));
    }
    result
}

#[cfg(windows)]
static ACTIVATION_HANDLE: Mutex<Option<(u32, std::os::windows::io::OwnedHandle)>> =
    Mutex::new(None);

/// Retain query access before a PID exits so its actual OS exit code remains
/// observable. This handle grants no terminate permission and owns no process.
#[cfg(windows)]
pub(crate) fn retain_activation_handle(pid: u32) {
    if ACTIVATION_HANDLE
        .lock()
        .is_ok_and(|slot| slot.as_ref().is_some_and(|(existing, _)| *existing == pid))
    {
        return;
    }
    use std::os::windows::io::{FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
    };
    let raw = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            0,
            pid,
        )
    };
    let error = if raw.is_null() {
        io::Error::last_os_error().raw_os_error()
    } else {
        None
    };
    if let Ok(mut slot) = ACTIVATION_HANDLE.lock() {
        *slot = if raw.is_null() {
            None
        } else {
            Some((pid, unsafe { OwnedHandle::from_raw_handle(raw.cast()) }))
        };
    } else if !raw.is_null() {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(raw);
        }
    }
    observe(
        "activation",
        "retain observation handle",
        if raw.is_null() {
            "unavailable"
        } else {
            "passed"
        },
        json!({"pid":pid,"osCode":error,"terminationPermission":false}),
    );
}
#[cfg(not(windows))]
pub(crate) fn retain_activation_handle(_pid: u32) {}

#[derive(Debug)]
struct Capture {
    bytes: Vec<u8>,
    total: usize,
    error: Option<String>,
}

fn drain(mut reader: impl Read, limit: usize) -> Capture {
    let mut result = Capture {
        bytes: Vec::new(),
        total: 0,
        error: None,
    };
    let mut chunk = [0; 8192];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                result.total = result.total.saturating_add(count);
                let retain = count.min(limit.saturating_sub(result.bytes.len()));
                result.bytes.extend_from_slice(&chunk[..retain]);
            }
            Err(error) => {
                result.error = Some(format!(
                    "kind={:?}; OS error={:?}",
                    error.kind(),
                    error.raw_os_error()
                ));
                break;
            }
        }
    }
    result
}

fn wrapped_script(body: &str) -> String {
    include_str!("process-query.ps1").replace("__CC_QUERY_BODY__", body)
}

fn stderr_events(bytes: &[u8]) -> Vec<Value> {
    String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| {
            line.strip_prefix(PREFIX)
                .and_then(|value| serde_json::from_str(value).ok())
        })
        .collect()
}

#[cfg(windows)]
pub(crate) fn capture_helper_stderr(
    mut pipe: tokio::process::ChildStderr,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut chunk = [0u8; 4096];
        let mut total = 0usize;
        let mut retained = Vec::new();
        loop {
            match pipe.read(&mut chunk).await {
                Ok(0) => break,
                Ok(count) => {
                    total = total.saturating_add(count);
                    let take = count.min(STDERR_LIMIT.saturating_sub(total.saturating_sub(count)));
                    retained.extend_from_slice(&chunk[..take]);
                    // Keep memory bounded over the helper lifetime. Complete
                    // structured lines are emitted as soon as they arrive.
                    while let Some(index) = retained.iter().position(|byte| *byte == b'\n') {
                        let line: Vec<_> = retained.drain(..=index).collect();
                        record_helper_line(&line);
                    }
                    if total > STDERR_LIMIT {
                        retained.clear();
                    }
                }
                Err(error) => {
                    observe(
                        "package activation",
                        "helper stderr",
                        "failed",
                        json!({"osCode":error.raw_os_error(),"kind":format!("{:?}",error.kind())}),
                    );
                    break;
                }
            }
        }
        if !retained.is_empty() {
            record_helper_line(&retained);
        }
        observe(
            "package activation",
            "helper stderr",
            "completed",
            json!({"bytes":total,"limit":STDERR_LIMIT,"truncated":total>STDERR_LIMIT}),
        );
    })
}
#[cfg(windows)]
fn record_helper_line(bytes: &[u8]) {
    let events = stderr_events(bytes);
    if events.is_empty() {
        observe(
            "package activation",
            "helper stderr",
            "observed",
            json!({"message":runtime_log::redaction::text(&String::from_utf8_lossy(bytes))}),
        );
    } else {
        for event in events {
            observe(
                "package activation",
                event["phase"].as_str().unwrap_or("unknown"),
                event["outcome"].as_str().unwrap_or("unknown"),
                event.clone(),
            );
        }
    }
}
#[cfg(windows)]
pub(crate) async fn finish_helper_capture(reader: Option<tokio::task::JoinHandle<()>>) {
    if let Some(mut reader) = reader {
        if tokio::time::timeout(Duration::from_secs(1), &mut reader)
            .await
            .is_err()
        {
            reader.abort();
            observe(
                "package activation",
                "helper stderr",
                "incomplete",
                json!({"reason":"reader did not close within 1 second"}),
            );
        }
    }
}

fn retryable(events: &[Value], timed_out: bool) -> bool {
    timed_out
        || events.iter().any(|event| {
            event["outcome"] == "failed"
                && matches!(
                    event["category"].as_str(),
                    Some("ResourceUnavailable" | "OperationTimeout" | "ObjectNotFound")
                )
        })
}

fn activation_assessment(activation: &Value, owners: &[Value]) -> &'static str {
    match activation["state"].as_str() {
        Some("exited")
            if owners.iter().any(|owner| {
                owner["pid"] != activation["pid"] && owner["exactOfficialIdentity"] == true
            }) =>
        {
            "activation PID exited; another new official-image process owns the port; possible handoff or surviving child, not proven"
        }
        Some("exited")
            if activation["exitCode"]
                .as_u64()
                .is_some_and(|code| code != 0) =>
        {
            "activation PID exited with a nonzero OS status before cleanup; underlying crash/termination cause unknown"
        }
        Some("exited") if activation["exitCode"] == 0 => {
            "activation PID exited with OS status 0 before cleanup; normal-status exit does not prove successful startup"
        }
        Some("exited") => "activation PID exited before cleanup; OS exit status unavailable",
        Some("running") => {
            "activation PID is running; identity inspection failed; compare CIM and native API errors"
        }
        _ => {
            "activation process state is unavailable; do not infer exit or crash from a failed query"
        }
    }
}

/// Two short read-only samples, taken before the unarmed activation helper is
/// stopped. Another owner's identity is evidence only, never attach authority.
#[cfg(windows)]
pub(crate) fn activation_failure_details(
    pid: u32,
    port: u16,
    official: &std::path::Path,
    launched_after: std::time::SystemTime,
) -> String {
    let started = Instant::now();
    let mut summary = String::new();
    for sample in 1..=2 {
        if sample > 1 {
            std::thread::sleep(Duration::from_millis(300));
        }
        let activation = native_process(pid);
        let listener_pids = native_listeners("activation failure", port);
        let mut owners = Vec::new();
        for owner in listener_pids.iter().take(8) {
            let mut details = native_process(*owner);
            let identity = crate::process_guard::verify_process_identity_native(
                *owner,
                launched_after,
                official,
            );
            details["exactOfficialIdentity"] = json!(identity.is_ok());
            details["identityError"] = json!(identity.err().map(|error| error.to_string()));
            owners.push(details);
        }
        let assessment = activation_assessment(&activation, &owners);
        observe(
            "activation failure",
            "pre-cleanup assessment",
            "observed",
            json!({"sample":sample,"elapsedMs":started.elapsed().as_millis(),"activation":activation,"port":port,"listenerOwners":owners,"ownerCount":listener_pids.len(),"ownersOmitted":listener_pids.len().saturating_sub(8),"assessment":assessment,"automaticHandoff":false,"crashCauseKnown":false}),
        );
        summary.push_str(&format!(
            "Sample {sample} (+{} ms): {assessment}\nActivation PID {pid}: state={}; OS exit status={}; exit time (Unix ms)={}; loopback port {port} owners={listener_pids:?}; other-owner exact identities={}\n",
            started.elapsed().as_millis(),activation["state"].as_str().unwrap_or("unknown"),
            activation["exitCodeHex"].as_str().unwrap_or("unavailable"),activation["exitUnixMs"],
            owners.iter().filter(|owner| owner["pid"] != pid && owner["exactOfficialIdentity"] == true).count()
        ));
    }
    native_observation("activation failure", Some(port), Some(pid));
    summary.push_str("Observation only: this probe performs no attachment or restart. See preceding recovery decisions for any activation retry or successor adoption. Port response alone cannot establish a trusted handoff. OS exit status is not the PowerShell query exit code.\n");
    summary
}

#[cfg(not(windows))]
pub(crate) fn activation_failure_details(
    _pid: u32,
    _port: u16,
    _official: &std::path::Path,
    _launched_after: std::time::SystemTime,
) -> String {
    "Activation failure assessment: unavailable on this platform".into()
}

/// Run only trusted, compiled-in read-only queries. Retry query failures once;
/// identity/ownership mismatches from parsed output are never retried here.
#[cfg(windows)]
pub(crate) fn query(
    operation: &str,
    body: &str,
    environment: &[(&str, &std::ffi::OsStr)],
    stdout_limit: usize,
    context: Value,
) -> Result<Vec<u8>, ProcessGuardError> {
    query_with_timeout(
        operation,
        body,
        environment,
        stdout_limit,
        context,
        QUERY_TIMEOUT,
    )
}

#[cfg(windows)]
pub(crate) fn query_with_timeout(
    operation: &str,
    body: &str,
    environment: &[(&str, &std::ffi::OsStr)],
    stdout_limit: usize,
    context: Value,
    timeout: Duration,
) -> Result<Vec<u8>, ProcessGuardError> {
    query_attempts(operation, body, environment, stdout_limit, context, timeout, 2)
}

/// Recovery has its own total budget; do not nest an implicit second query.
#[cfg(windows)]
pub(crate) fn query_once_with_timeout(
    operation: &str,
    body: &str,
    environment: &[(&str, &std::ffi::OsStr)],
    stdout_limit: usize,
    context: Value,
    timeout: Duration,
) -> Result<Vec<u8>, ProcessGuardError> {
    query_attempts(operation, body, environment, stdout_limit, context, timeout, 1)
}

#[cfg(windows)]
fn query_attempts(
    operation: &str,
    body: &str,
    environment: &[(&str, &std::ffi::OsStr)],
    stdout_limit: usize,
    context: Value,
    timeout: Duration,
    max_attempts: u8,
) -> Result<Vec<u8>, ProcessGuardError> {
    use std::os::windows::process::CommandExt;
    let mut first_failure = None;
    for attempt in 1..=max_attempts {
        observe(
            operation,
            "query",
            "started",
            json!({"attempt":attempt,"timeoutMs":timeout.as_millis(),"stdoutLimit":stdout_limit,"stderrLimit":STDERR_LIMIT,"context":context,"commandSource":"trusted System32 PowerShell","profile":false,"readOnly":true}),
        );
        let started = Instant::now();
        let Some(powershell) = crate::process_guard::trusted_powershell() else {
            observe(
                operation,
                "query spawn",
                "failed",
                json!({"reason":"trusted System32 PowerShell was not found"}),
            );
            return Err(ProcessGuardError::Detailed(format!(
                "{operation} query: trusted System32 PowerShell was not found"
            )));
        };
        let mut command = Command::new(powershell);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &wrapped_script(body),
            ])
            .envs(environment.iter().copied())
            .env("CLE_PROCESS_QUERY_ATTEMPT", attempt.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x0800_0000);
        let mut child = command.spawn().map_err(|error| {
            observe(operation, "query spawn", "failed", json!({"osCode":error.raw_os_error(),"kind":format!("{:?}",error.kind()),"durationMs":started.elapsed().as_millis()}));
            ProcessGuardError::Detailed(format!("{operation} query could not start: OS error {:?}; kind={:?}",error.raw_os_error(),error.kind()))
        })?;
        let stdout = child.stdout.take().expect("configured stdout pipe");
        let stderr = child.stderr.take().expect("configured stderr pipe");
        let output_reader = std::thread::spawn(move || drain(stdout, stdout_limit));
        let error_reader = std::thread::spawn(move || drain(stderr, STDERR_LIMIT));
        let mut timed_out = false;
        let waited = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(error);
                }
                Ok(None) if started.elapsed() >= timeout => {
                    timed_out = true;
                    let kill = child.kill();
                    observe(
                        operation,
                        "query timeout cleanup",
                        if kill.is_ok() { "passed" } else { "failed" },
                        json!({"attempt":attempt,"osCode":kill.as_ref().err().and_then(io::Error::raw_os_error)}),
                    );
                    break child.wait();
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            }
        };
        let output = output_reader.join().unwrap_or(Capture {
            bytes: vec![],
            total: 0,
            error: Some("stdout reader panicked".into()),
        });
        let errors = error_reader.join().unwrap_or(Capture {
            bytes: vec![],
            total: 0,
            error: Some("stderr reader panicked".into()),
        });
        let events = stderr_events(&errors.bytes);
        for event in &events {
            observe(
                operation,
                event["phase"].as_str().unwrap_or("unknown"),
                event["outcome"].as_str().unwrap_or("unknown"),
                json!({"attempt":attempt,"queryEvent":event}),
            );
        }
        let raw = String::from_utf8_lossy(&errors.bytes)
            .lines()
            .filter(|line| !line.starts_with(PREFIX))
            .collect::<Vec<_>>()
            .join("\n");
        let status = waited.as_ref().ok();
        let passed = !timed_out
            && status.is_some_and(|s| s.success())
            && output.total > 0
            && output.total <= stdout_limit
            && output.error.is_none()
            && errors.error.is_none();
        observe(
            operation,
            "query result",
            if passed { "passed" } else { "failed" },
            json!({"attempt":attempt,"queryPid":child.id(),"exitCode":status.and_then(|s|s.code()),"exitCodeBelongsTo":"PowerShell query, not Codex","durationMs":started.elapsed().as_millis(),"timedOut":timed_out,"stdoutBytes":output.total,"stdoutTruncated":output.total>stdout_limit,"stderrBytes":errors.total,"stderrTruncated":errors.total>STDERR_LIMIT,"stderrUtf8Valid":std::str::from_utf8(&errors.bytes).is_ok(),"stdoutReadError":output.error,"stderrReadError":errors.error,"waitError":waited.as_ref().err().map(|e|format!("{:?}; OS={:?}",e.kind(),e.raw_os_error())),"structuredEventCount":events.len(),"unstructuredStderr":runtime_log::redaction::text(&raw)}),
        );
        if passed {
            return Ok(output.bytes);
        }
        let failure = format!(
            "{operation} query failed: attempt={attempt}; exit={:?}; stdout_bytes={}; stderr_bytes={}; timeout={timed_out}; last_phase={}; error={}",
            status.and_then(|s| s.code()),
            output.total,
            errors.total,
            events
                .last()
                .and_then(|e| e["phase"].as_str())
                .unwrap_or("no structured observation"),
            runtime_log::redaction::text(
                &events
                    .iter()
                    .find(|e| e["outcome"] == "failed")
                    .map(Value::to_string)
                    .unwrap_or_else(|| raw.clone())
            )
        );
        first_failure.get_or_insert_with(|| failure.clone());
        if attempt < max_attempts && retryable(&events, timed_out) && output.total <= stdout_limit {
            observe(
                operation,
                "query retry",
                "scheduled",
                json!({"delayMs":300,"reason":"transient query error; no identity mismatch bypass","firstFailure":first_failure}),
            );
            std::thread::sleep(Duration::from_millis(300));
        } else {
            observe(
                operation,
                "query retry",
                "not attempted",
                json!({"reason":"non-transient error, output limit or attempt budget exhausted","attempts":attempt}),
            );
            return Err(ProcessGuardError::Detailed(format!(
                "{failure}; first_failure={}",
                first_failure.as_deref().unwrap_or("none")
            )));
        }
    }
    unreachable!("two attempts always return")
}

/// An independent Win32 observation when PowerShell/CIM failed. It is never a
/// fallback authorization and never changes/terminates the observed processes.
#[cfg(not(windows))]
pub(crate) fn native_observation(operation: &str, port: Option<u16>, pid: Option<u32>) {
    observe(
        operation,
        "native observation",
        "unavailable",
        json!({"reason":"Windows only","port":port,"pid":pid}),
    );
}
#[cfg(not(windows))]
pub(crate) fn native_process(pid: u32) -> Value {
    json!({"pid":pid,"reason":"Windows only"})
}
#[cfg(windows)]
pub(crate) fn native_observation(operation: &str, port: Option<u16>, launched_pid: Option<u32>) {
    use std::{
        collections::{HashMap, HashSet},
        mem::size_of,
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
    };
    let started = Instant::now();
    observe(
        operation,
        "native independent observation",
        "started",
        json!({"port":port,"launchedPid":launched_pid,"authorization":"diagnostic only; security checks remain required"}),
    );
    let listeners = port
        .map(|port| native_listeners(operation, port))
        .unwrap_or_default();
    let mut parents = HashMap::new();
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        observe(
            operation,
            "native parent snapshot",
            "failed",
            json!({"osCode":io::Error::last_os_error().raw_os_error()}),
        );
    } else {
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut available = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
        while available && parents.len() < 65_536 {
            parents.insert(entry.th32ProcessID, entry.th32ParentProcessID);
            available = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
        }
        let final_code = io::Error::last_os_error().raw_os_error();
        unsafe {
            CloseHandle(snapshot);
        }
        observe(
            operation,
            "native parent snapshot",
            "observed",
            json!({"processCount":parents.len(),"finalOsCode":final_code,"expectedEndOfEnumerationCode":18}),
        );
    }
    let mut seen = HashSet::new();
    for owner in listeners.iter().copied().chain(launched_pid) {
        let mut pid = owner;
        for depth in 0..8 {
            if pid == 0 || !seen.insert(pid) {
                break;
            }
            let parent = parents.get(&pid).copied();
            let mut details = native_process(pid);
            details["parentPid"] = json!(parent);
            details["chainDepth"] = json!(depth);
            details["isListenerOwner"] = json!(listeners.contains(&pid));
            details["isActivationPid"] = json!(Some(pid) == launched_pid);
            observe(operation, "native process", "observed", details);
            let Some(next) = parent else {
                break;
            };
            pid = next;
        }
    }
    observe(
        operation,
        "native independent observation",
        "completed",
        json!({"durationMs":started.elapsed().as_millis(),"listenerOwners":listeners,"observedProcesses":seen.len(),"interpretation":"An exited activation PID with a responsive endpoint can indicate process handoff; no handoff or crash is proven without owner identity and exit evidence."}),
    );
}

#[cfg(windows)]
fn native_listeners(operation: &str, port: u16) -> Vec<u32> {
    use std::mem::size_of;
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID,
        TCP_TABLE_OWNER_PID_LISTENER,
    };
    let mut owners = Vec::new();
    for family in [2u32, 23u32] {
        let mut bytes = 0;
        let first = unsafe {
            GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut bytes,
                0,
                family,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if bytes < 4 || bytes > 4 * 1024 * 1024 {
            observe(
                operation,
                "GetExtendedTcpTable",
                "failed",
                json!({"family":family,"osCode":first,"tableBytes":bytes}),
            );
            continue;
        }
        let mut table = vec![0u64; (bytes as usize).div_ceil(8)];
        let result = unsafe {
            GetExtendedTcpTable(
                table.as_mut_ptr().cast(),
                &mut bytes,
                0,
                family,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        let count = table[0] as u32 as usize;
        let row_size = if family == 2 {
            size_of::<MIB_TCPROW_OWNER_PID>()
        } else {
            size_of::<MIB_TCP6ROW_OWNER_PID>()
        };
        if result != 0
            || 4 + count.saturating_mul(row_size) > table.len() * 8
            || 4 + count.saturating_mul(row_size) > bytes as usize
        {
            observe(
                operation,
                "GetExtendedTcpTable",
                "failed",
                json!({"family":family,"osCode":result,"tableBytes":bytes,"rowCount":count}),
            );
            continue;
        }
        // Both Windows row structures have 4-byte alignment; the count occupies
        // the first DWORD and the allocated u64 buffer is sufficiently aligned.
        let rows = unsafe { table.as_ptr().cast::<u8>().add(4) };
        for index in 0..count {
            let (owner, local_port, loopback) = if family == 2 {
                let row = unsafe { &*rows.add(index * row_size).cast::<MIB_TCPROW_OWNER_PID>() };
                (
                    row.dwOwningPid,
                    row.dwLocalPort,
                    row.dwLocalAddr == u32::from_ne_bytes([127, 0, 0, 1]),
                )
            } else {
                let row = unsafe { &*rows.add(index * row_size).cast::<MIB_TCP6ROW_OWNER_PID>() };
                let mut loopback = [0u8; 16];
                loopback[15] = 1;
                (
                    row.dwOwningPid,
                    row.dwLocalPort,
                    row.ucLocalAddr == loopback,
                )
            };
            if loopback && u16::from_be(local_port as u16) == port && !owners.contains(&owner) {
                owners.push(owner);
            }
        }
        observe(
            operation,
            "GetExtendedTcpTable",
            "passed",
            json!({"family":family,"rowCount":count,"port":port,"matchingOwners":owners}),
        );
    }
    owners
}

#[cfg(windows)]
pub(crate) fn native_process(pid: u32) -> Value {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME, WAIT_OBJECT_0, WAIT_TIMEOUT},
        System::Threading::{
            GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE, QueryFullProcessImageNameW, WaitForSingleObject,
        },
    };
    let retained = ACTIVATION_HANDLE.lock().ok();
    let retained_handle = retained
        .as_ref()
        .and_then(|slot| slot.as_ref())
        .filter(|(retained_pid, _)| *retained_pid == pid)
        .map(|(_, handle)| handle.as_raw_handle().cast());
    let handle = retained_handle.unwrap_or_else(|| unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            0,
            pid,
        )
    });
    if handle.is_null() {
        return json!({"pid":pid,"openProcess":false,"osCode":io::Error::last_os_error().raw_os_error()});
    }
    let wait = unsafe { WaitForSingleObject(handle, 0) };
    let wait_error = if !matches!(wait, WAIT_OBJECT_0 | WAIT_TIMEOUT) {
        io::Error::last_os_error().raw_os_error()
    } else {
        None
    };
    let mut exit = 0;
    let exit_ok = unsafe { GetExitCodeProcess(handle, &mut exit) } != 0;
    let exit_error = if exit_ok {
        None
    } else {
        io::Error::last_os_error().raw_os_error()
    };
    let mut image = vec![0u16; 32768];
    let mut length = image.len() as u32;
    let image_ok =
        unsafe { QueryFullProcessImageNameW(handle, 0, image.as_mut_ptr(), &mut length) } != 0;
    let image_error = if image_ok {
        None
    } else {
        io::Error::last_os_error().raw_os_error()
    };
    let image_text = String::from_utf16_lossy(&image[..if image_ok { length as usize } else { 0 }]);
    let mut created = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut ended = created;
    let mut kernel = created;
    let mut user = created;
    let time_ok =
        unsafe { GetProcessTimes(handle, &mut created, &mut ended, &mut kernel, &mut user) } != 0;
    let time_error = if time_ok {
        None
    } else {
        io::Error::last_os_error().raw_os_error()
    };
    if retained_handle.is_none() {
        unsafe {
            CloseHandle(handle);
        }
    }
    let millis = |time: FILETIME| {
        let ticks = ((time.dwHighDateTime as u64) << 32) | time.dwLowDateTime as u64;
        (ticks > 0).then(|| ticks.saturating_sub(116444736000000000) / 10000)
    };
    let image_kind = if image_text.to_ascii_lowercase().contains("\\windowsapps\\") {
        "WindowsApps"
    } else {
        "other or unavailable"
    };
    json!({"pid":pid,"openProcess":true,"retainedActivationHandle":retained_handle.is_some(),"state":match wait {WAIT_OBJECT_0=>"exited",WAIT_TIMEOUT=>"running",_=>"unknown"},"waitOsCode":wait_error,"exitCode":if exit_ok && wait==WAIT_OBJECT_0 {Some(exit)} else {None},"exitCodeHex":if exit_ok && wait==WAIT_OBJECT_0 {Some(format!("0x{exit:08X}"))} else {None},"exitCodeOsCode":exit_error,"imageAvailable":image_ok,"imageLocation":image_kind,"imageOsCode":image_error,"creationFiletime":if time_ok {Some(((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64)} else {None},"creationUnixMs":if time_ok {millis(created)} else {None},"exitUnixMs":if time_ok {millis(ended)} else {None},"timesOsCode":time_error})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activation_assessment_separates_exit_handoff_and_unknown() {
        let exited = json!({"pid":21904,"state":"exited","exitCode":0});
        assert!(activation_assessment(&exited, &[]).contains("status 0"));
        let other = json!({"pid":21905,"exactOfficialIdentity":true});
        assert!(activation_assessment(&exited, &[other]).contains("possible handoff"));
        assert!(
            !activation_assessment(
                &exited,
                &[json!({"pid":21905,"exactOfficialIdentity":false})]
            )
            .contains("handoff")
        );
        assert!(
            activation_assessment(&json!({"pid":1,"state":"exited","exitCode":23}), &[])
                .contains("nonzero")
        );
        assert!(
            activation_assessment(&json!({"state":"exited"}), &[]).contains("status unavailable")
        );
        assert!(activation_assessment(&json!({"state":"running"}), &[]).contains("running"));
        assert!(activation_assessment(&json!({"openProcess":false}), &[]).contains("do not infer"));
    }
    #[test]
    fn drains_all_bytes_but_retains_only_the_limit() {
        let capture = drain(io::Cursor::new(vec![42; 100_000]), 17);
        assert_eq!(capture.total, 100_000);
        assert_eq!(capture.bytes, vec![42; 17]);
    }
    #[test]
    fn parser_and_retry_policy_do_not_treat_permissions_as_transient() {
        let events=stderr_events(b"CC_PROCESS_QUERY={\"phase\":\"tcp\",\"outcome\":\"failed\",\"category\":\"PermissionDenied\"}\nnoise\n");
        assert_eq!(events.len(), 1);
        assert!(!retryable(&events, false));
        assert!(retryable(
            &[json!({"outcome":"failed","category":"ResourceUnavailable"})],
            false
        ));
        assert!(retryable(&[], true));
        assert!(!wrapped_script("Write-Output 1").contains("__CC_QUERY_BODY__"));
    }
    #[cfg(windows)]
    #[test]
    fn actual_powershell_preserves_unicode_errors_and_the_failed_step() {
        runtime_log::capture_test_events();
        let result = query(
            "fixture",
            "Invoke-CCStep 'test failure' { throw '中文错误 C:\\Users\\PRIVATE_SENTINEL\\secret.txt' }",
            &[],
            4096,
            json!({}),
        );
        assert!(result.is_err());
        let events = runtime_log::take_test_events();
        let encoded = serde_json::to_string(&events).expect("events");
        assert!(encoded.contains("test failure"));
        assert!(encoded.contains("中文错误"));
        assert!(!encoded.contains("PRIVATE_SENTINEL"));
        assert!(encoded.contains("fullyQualifiedErrorId"));
        assert!(encoded.contains("hresult"));
    }
    #[cfg(windows)]
    #[test]
    fn actual_powershell_output_is_bounded_and_timeout_is_reaped() {
        assert!(
            query(
                "fixture",
                "[Console]::Write(('x' * 10000))",
                &[],
                32,
                json!({})
            )
            .is_err()
        );
        let started = Instant::now();
        assert!(
            query_with_timeout(
                "fixture",
                "Start-Sleep -Seconds 30",
                &[],
                32,
                json!({}),
                Duration::from_millis(400)
            )
            .is_err()
        );
        assert!(started.elapsed() < Duration::from_secs(8));
    }
    #[cfg(windows)]
    #[test]
    fn transient_failure_retains_first_error_and_recovers_once() {
        runtime_log::capture_test_events();
        let output=query("fixture", "if ($env:CLE_PROCESS_QUERY_ATTEMPT -eq '1') { Invoke-CCStep 'transient fixture' { Write-Error 'listener not yet present' -Category ObjectNotFound -ErrorId 'CCTransientFixture' } }; [Console]::Write('ready')", &[],4096,json!({})).expect("second query recovers");
        assert_eq!(output, b"ready");
        let events = runtime_log::take_test_events();
        assert!(
            events
                .iter()
                .any(|e| e["action"] == "query retry" && e["outcome"] == "scheduled")
        );
        assert!(events.iter().any(|e| e["action"] == "query result"
            && e["details"]["observation"]["attempt"] == 1
            && e["outcome"] == "failed"));
        assert!(events.iter().any(|e| e["action"] == "query result"
            && e["details"]["observation"]["attempt"] == 2
            && e["outcome"] == "passed"));
    }
    #[cfg(windows)]
    #[test]
    fn real_native_listener_and_cim_agree_without_changing_authorization() {
        use crate::process_guard::{verify_listener_owner, verify_process_identity};
        let listener =
            std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).expect("listener");
        let port = listener.local_addr().expect("address").port();
        let pid = std::process::id();
        assert!(native_listeners("fixture", port).contains(&pid));
        let process = native_process(pid);
        assert_eq!(process["state"], "running");
        assert!(process["creationUnixMs"].is_number());
        verify_process_identity(
            pid,
            std::time::UNIX_EPOCH,
            &std::env::current_exe().expect("image"),
        )
        .expect("actual identity");
        verify_listener_owner(port, pid, std::time::UNIX_EPOCH).expect("actual ownership");
        assert!(verify_listener_owner(port, 0, std::time::UNIX_EPOCH).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn retained_activation_handle_preserves_exit_code_after_process_exit() {
        let _guard = TEST_TRACE_LOCK.lock().unwrap();
        use std::os::windows::process::CommandExt;
        let mut child =
            Command::new(crate::process_guard::trusted_powershell().expect("PowerShell"))
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "Start-Sleep -Milliseconds 500; exit 23",
                ])
                .creation_flags(0x0800_0000)
                .spawn()
                .expect("child");
        let pid = child.id();
        retain_activation_handle(pid);
        child.wait().expect("wait");
        let process = native_process(pid);
        assert_eq!(process["state"], "exited");
        assert_eq!(process["exitCode"], 23);
        assert_eq!(process["retainedActivationHandle"], true);
        let listener =
            std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).expect("listener");
        let details = activation_failure_details(
            pid,
            listener.local_addr().expect("address").port(),
            &std::env::current_exe().expect("image"),
            std::time::UNIX_EPOCH,
        );
        assert!(details.contains("Sample 1"));
        assert!(details.contains("Sample 2"));
        assert!(details.contains("0x00000017"));
        assert!(details.contains("possible handoff"));
        assert!(details.contains("this probe performs no attachment or restart"));
        assert!(details.contains("See preceding recovery decisions"));
        assert!(
            crate::process_guard::verify_process_identity_native(
                pid,
                std::time::UNIX_EPOCH,
                &std::env::current_exe().expect("image")
            )
            .is_err()
        );
    }
}
