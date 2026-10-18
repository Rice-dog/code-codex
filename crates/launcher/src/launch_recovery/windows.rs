use super::*;
use crate::{
    early_startup,
    process_guard::{self, CodexProcessGuard},
    win10_compat,
};
use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::{Path, PathBuf},
    time::SystemTime,
};
use windows_sys::Win32::{
    Foundation::{FILETIME, INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
        Threading::{
            GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
            PROCESS_TERMINATE, QueryFullProcessImageNameW, WaitForSingleObject,
        },
    },
};

pub(super) struct NativeBackend {
    package: String,
    aumid: String,
    arguments: Vec<String>,
    image: PathBuf,
    port: u16,
    inspector: Option<u16>,
    animation: bool,
    original_pid: u32,
    pub launched_after: SystemTime,
    pub early: Option<early_startup::Worker>,
}
impl NativeBackend {
    pub fn new(
        package: String,
        aumid: String,
        arguments: Vec<String>,
        image: PathBuf,
        port: u16,
        inspector: Option<u16>,
        animation: bool,
    ) -> Self {
        Self {
            package,
            aumid,
            arguments,
            image,
            port,
            inspector,
            animation,
            original_pid: 0,
            launched_after: SystemTime::now(),
            early: None,
        }
    }
    pub fn stop_animation(&mut self, reason: &str) {
        if self.early.take().is_some() {
            process_diagnostics::observe(
                "startup animation",
                "worker cancelled",
                "observed",
                json!({"reason":reason,"pid":self.original_pid,"playbackSuccessNotInferred":true}),
            );
        }
    }
    fn start_animation(&mut self, pid: u32) {
        if self.animation {
            self.early = Some(early_startup::start(
                cdp_client::CdpEndpoint::loopback(self.port),
                pid,
                self.launched_after,
            ));
        }
    }
}

#[async_trait]
impl Backend for NativeBackend {
    type Guard = CodexProcessGuard;
    async fn activate(&mut self, attempt: u8) -> Result<Self::Guard, RecoveryError> {
        self.stop_animation("a new activation attempt is starting");
        self.launched_after = SystemTime::now();
        crate::record_startup_event(
            "Codex activation",
            if attempt == 1 {
                "starting official package"
            } else {
                "single safe retry of official package"
            },
        );
        process_diagnostics::observe(
            "startup recovery",
            "package activation",
            "started",
            json!({"attempt":attempt,"rendererPort":self.port,"inspectorPort":self.inspector,"maxAttempts":2}),
        );
        let guard = CodexProcessGuard::activate_package(
            self.package.clone(),
            self.aumid.clone(),
            self.arguments.clone(),
        )
        .await
        .map_err(activation_failure)?;
        self.original_pid = guard.pid();
        crate::record_launch_context(self.port, self.inspector, guard.pid());
        self.start_animation(guard.pid());
        Ok(guard)
    }
    async fn verify(&mut self, guard: &Self::Guard) -> Result<(), ProcessGuardError> {
        let (pid, after, image) = (guard.pid(), self.launched_after, self.image.clone());
        tokio::task::spawn_blocking(move || {
            process_guard::verify_process_identity(pid, after, &image)
        })
        .await
        .map_err(|e| ProcessGuardError::OwnershipUnknown.context("activation identity worker", e))?
    }
    fn exit_code(&mut self, guard: &mut Self::Guard) -> Result<Option<u32>, String> {
        guard
            .exit_code()
            .map_err(|e| format!("OS error {:?}; {e}", e.raw_os_error()))
    }
    async fn observe(&mut self) -> Result<Snapshot, RecoveryError> {
        let (port, inspector, image) = (self.port, self.inspector, self.image.clone());
        tokio::time::timeout(
            Duration::from_millis(1500),
            tokio::task::spawn_blocking(move || observe(port, inspector, &image)),
        )
        .await
        .map_err(|_| {
            RecoveryError::new(
                FailureKind::Unavailable,
                "Native recovery snapshot exceeded 1500 ms; no retry authorized",
            )
        })?
        .map_err(|e| {
            RecoveryError::new(FailureKind::Unavailable, format!("snapshot worker: {e}"))
        })?
    }
    async fn adopt(&mut self, pid: u32) -> Result<Self::Guard, RecoveryError> {
        if pid == self.original_pid {
            return Err(RecoveryError::new(
                FailureKind::Rejected,
                "Exited activation PID cannot be its own successor",
            ));
        }
        let (image, package, after, port, inspector) = (
            self.image.clone(),
            self.package.clone(),
            self.launched_after,
            self.port,
            self.inspector,
        );
        let handle = tokio::time::timeout(
            Duration::from_millis(3500),
            tokio::task::spawn_blocking(move || {
                verify_successor(pid, &image, &package, after, port, inspector)
            }),
        )
        .await
        .map_err(|_| {
            RecoveryError::new(
                FailureKind::Unavailable,
                "Successor verification exceeded 3500 ms; no attachment authorized",
            )
        })?
        .map_err(|e| {
            RecoveryError::new(
                FailureKind::Unavailable,
                format!("successor verification worker: {e}"),
            )
        })??;
        self.stop_animation("trusted successor replaces the original activation PID");
        crate::record_launch_context(self.port, self.inspector, pid);
        crate::record_startup_event(
            "process handoff",
            "trusted successor verified; continuing normal startup",
        );
        process_diagnostics::observe(
            "startup recovery",
            "successor adoption",
            "passed",
            json!({"originalPid":self.original_pid,"successorPid":pid,"retainedHandle":true,"packageWideTermination":false,"pageReadyNotInferred":true}),
        );
        self.start_animation(pid);
        Ok(CodexProcessGuard::from_verified_successor(pid, handle))
    }
    async fn release(&mut self, mut guard: Self::Guard) {
        // Only unarmed original guards reach this method. A rejected successor
        // never becomes a guard with cleanup authority.
        guard.terminate().await;
    }
    async fn pause(&mut self) {
        tokio::time::sleep(INTERVAL).await;
    }
}

fn unavailable(phase: &str) -> RecoveryError {
    RecoveryError::new(
        FailureKind::Unavailable,
        format!(
            "{phase}; OS error {:?}",
            io::Error::last_os_error().raw_os_error()
        ),
    )
}

fn activation_failure(error: io::Error) -> RecoveryError {
    let kind = if error
        .to_string()
        .starts_with(process_guard::ACTIVATION_OBSERVATION_UNAVAILABLE)
    {
        FailureKind::Unavailable
    } else {
        FailureKind::Activation
    };
    RecoveryError::new(
        kind,
        format!(
            "OS error {:?}; kind {:?}; {error}",
            error.raw_os_error(),
            error.kind()
        ),
    )
}
fn rejected(reason: impl Into<String>) -> RecoveryError {
    RecoveryError::new(FailureKind::Rejected, reason)
}

fn identity_failure(error: ProcessGuardError) -> RecoveryError {
    let text = error.to_string();
    let known_mismatch =
        text.contains("native identity mismatch") || text.contains("native identity rejected");
    RecoveryError::new(
        if known_mismatch {
            FailureKind::Rejected
        } else {
            FailureKind::Unavailable
        },
        text,
    )
}

fn port_owners(port: u16) -> Result<Vec<u32>, RecoveryError> {
    let entries = win10_compat::listeners(port).map_err(|e| {
        RecoveryError::new(
            FailureKind::Unavailable,
            format!("dual-stack port={port}; {e}"),
        )
    })?;
    if entries.iter().any(|e| e.address_kind != "loopback") {
        return Err(rejected(format!(
            "port={port}; non-loopback or wildcard listener prevents recovery"
        )));
    }
    let mut pids = entries.iter().map(|e| e.pid).collect::<Vec<_>>();
    pids.sort_unstable();
    pids.dedup();
    if pids.len() > 1 {
        return Err(rejected(format!(
            "port={port}; multiple listener owners={pids:?}"
        )));
    }
    Ok(pids)
}
fn observe(port: u16, inspector: Option<u16>, image: &Path) -> Result<Snapshot, RecoveryError> {
    let owners = port_owners(port)?;
    let main = inspector.map(port_owners).transpose()?.unwrap_or_default();
    if !owners.is_empty() && !main.is_empty() && owners != main {
        return Err(rejected(
            "Renderer and main inspector belong to different processes",
        ));
    }
    let official_processes = exact_image_processes(image)?;
    Ok(Snapshot {
        candidate: owners.first().copied(),
        any_listener: !owners.is_empty() || !main.is_empty(),
        official_processes,
    })
}

/// Includes child/remnant processes. Unavailable matching image evidence blocks
/// a retry rather than treating inaccessible processes as absent.
fn exact_image_processes(image: &Path) -> Result<usize, RecoveryError> {
    let expected = dunce::canonicalize(image).map_err(|e| {
        RecoveryError::new(
            FailureKind::Unavailable,
            format!(
                "official image canonicalization; OS error {:?}",
                e.raw_os_error()
            ),
        )
    })?;
    let name = expected
        .file_name()
        .ok_or_else(|| rejected("official image has no file name"))?
        .to_string_lossy();
    let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if raw == INVALID_HANDLE_VALUE {
        return Err(unavailable("process snapshot"));
    }
    let snapshot = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut more = unsafe { Process32FirstW(snapshot.as_raw_handle().cast(), &mut entry) };
    let mut count = 0;
    let mut scanned = 0;
    while more != 0 {
        scanned += 1;
        if scanned > 4096 {
            return Err(rejected(
                "process snapshot exceeds 4096 entries; retry blocked",
            ));
        }
        let length = entry
            .szExeFile
            .iter()
            .position(|n| *n == 0)
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
                return Err(unavailable("matching process image access"));
            }
            let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
            if unsafe { WaitForSingleObject(raw, 0) } == WAIT_TIMEOUT {
                let mut data = vec![0u16; 32768];
                let mut size = data.len() as u32;
                if unsafe { QueryFullProcessImageNameW(raw, 0, data.as_mut_ptr(), &mut size) } == 0
                {
                    let failure = unavailable("matching process image query");
                    // The retained handle can become signaled between the first
                    // wait and the image query. An observed terminated process
                    // cannot conflict with a successor; an inaccessible LIVE
                    // process still blocks recovery, preserving fail-closed policy.
                    if unsafe { WaitForSingleObject(raw, 0) } == WAIT_OBJECT_0 {
                        more =
                            unsafe { Process32NextW(snapshot.as_raw_handle().cast(), &mut entry) };
                        continue;
                    }
                    return Err(failure);
                }
                let path = dunce::canonicalize(PathBuf::from(String::from_utf16_lossy(
                    &data[..size as usize],
                )))
                .map_err(|e| {
                    RecoveryError::new(
                        FailureKind::Unavailable,
                        format!(
                            "matching process canonicalization; OS error {:?}",
                            e.raw_os_error()
                        ),
                    )
                })?;
                if path
                    .to_string_lossy()
                    .eq_ignore_ascii_case(&expected.to_string_lossy())
                {
                    count += 1;
                }
            } else if unsafe { WaitForSingleObject(handle.as_raw_handle().cast(), 0) }
                != windows_sys::Win32::Foundation::WAIT_OBJECT_0
            {
                return Err(unavailable("matching process state"));
            }
        }
        more = unsafe { Process32NextW(snapshot.as_raw_handle().cast(), &mut entry) };
    }
    if io::Error::last_os_error().raw_os_error() != Some(18) {
        return Err(unavailable("process enumeration incomplete"));
    }
    Ok(count)
}

fn creation_ticks(handle: &OwnedHandle) -> Result<u64, RecoveryError> {
    let mut times = [FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    }; 4];
    if unsafe {
        GetProcessTimes(
            handle.as_raw_handle().cast(),
            &mut times[0],
            &mut times[1],
            &mut times[2],
            &mut times[3],
        )
    } == 0
    {
        return Err(unavailable("successor creation time"));
    }
    Ok((u64::from(times[0].dwHighDateTime) << 32) | u64::from(times[0].dwLowDateTime))
}

fn package_matches(handle: &OwnedHandle, expected: &str) -> Result<bool, RecoveryError> {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetPackageFullName(
            process: windows_sys::Win32::Foundation::HANDLE,
            length: *mut u32,
            name: *mut u16,
        ) -> i32;
    }
    let mut size = 0;
    let result = unsafe {
        GetPackageFullName(
            handle.as_raw_handle().cast(),
            &mut size,
            std::ptr::null_mut(),
        )
    };
    if result == 15700 {
        return Ok(false);
    } // APPMODEL_ERROR_NO_PACKAGE
    if result != 122 || size == 0 || size > 4096 {
        return Err(RecoveryError::new(
            FailureKind::Unavailable,
            format!("GetPackageFullName size; OS status={result}"),
        ));
    }
    let mut data = vec![0u16; size as usize];
    let result =
        unsafe { GetPackageFullName(handle.as_raw_handle().cast(), &mut size, data.as_mut_ptr()) };
    if result != 0 || size as usize > data.len() {
        return Err(RecoveryError::new(
            FailureKind::Unavailable,
            format!("GetPackageFullName value; OS status={result}"),
        ));
    }
    let len = data.iter().position(|n| *n == 0).unwrap_or(data.len());
    Ok(String::from_utf16_lossy(&data[..len]).eq_ignore_ascii_case(expected))
}

fn user_matches(handle: &OwnedHandle) -> Result<bool, RecoveryError> {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::HANDLE;
    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn OpenProcessToken(process: HANDLE, access: u32, token: *mut HANDLE) -> i32;
        fn GetTokenInformation(
            token: HANDLE,
            class: u32,
            information: *mut c_void,
            length: u32,
            returned: *mut u32,
        ) -> i32;
        fn EqualSid(first: *const c_void, second: *const c_void) -> i32;
    }
    fn user(process: HANDLE) -> Result<Vec<u64>, RecoveryError> {
        let mut raw = std::ptr::null_mut();
        if unsafe { OpenProcessToken(process, 8, &mut raw) } == 0 {
            return Err(unavailable("successor user token"));
        }
        let token = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
        let mut size = 0;
        unsafe {
            GetTokenInformation(
                token.as_raw_handle().cast(),
                1,
                std::ptr::null_mut(),
                0,
                &mut size,
            )
        };
        if io::Error::last_os_error().raw_os_error() != Some(122) || size < 16 || size > 65536 {
            return Err(unavailable("successor token size"));
        }
        let mut data = vec![0u64; (size as usize).div_ceil(8)];
        if unsafe {
            GetTokenInformation(
                token.as_raw_handle().cast(),
                1,
                data.as_mut_ptr().cast(),
                size,
                &mut size,
            )
        } == 0
        {
            return Err(unavailable("successor token user"));
        }
        Ok(data)
    }
    let own = user(unsafe { windows_sys::Win32::System::Threading::GetCurrentProcess() })?;
    let other = user(handle.as_raw_handle().cast())?;
    let first = unsafe { *own.as_ptr().cast::<*const c_void>() };
    let second = unsafe { *other.as_ptr().cast::<*const c_void>() };
    if first.is_null() || second.is_null() {
        return Err(unavailable("successor token SID unavailable"));
    }
    Ok(unsafe { EqualSid(first, second) } != 0)
}

#[derive(Debug, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Arguments {
    present: bool,
    available: bool,
    root: bool,
    renderer: bool,
    address: bool,
    inspector: bool,
    created_ms: u64,
}

impl Arguments {
    fn matches(&self, ticks: u64) -> bool {
        self.present
            && self.available
            && self.root
            && self.renderer
            && self.address
            && self.inspector
            && ticks.checked_sub(116444736000000000).map(|n| n / 10000) == Some(self.created_ms)
    }
}

const ARGUMENT_SCRIPT: &str = r#"
$p=Invoke-CCStep 'successor command-line summary' { Get-CimInstance Win32_Process -Filter ('ProcessId = '+$env:CLE_SUCCESSOR_PID) -ErrorAction Stop }
$line=if($p){$p.CommandLine}else{$null}; $root=$false; $render=$false; $address=$false; $inspect=$false
if($line){
  $root=$line -notmatch '(?i)(?:^|\s|\")--type(?:=|\s|\"|$)'
  $r=@([regex]::Matches($line,'(?i)(?:^|\s|\")--remote-debugging-port=(?<value>[^\s\"]+)(?=\s|\"|$)'))
  $a=@([regex]::Matches($line,'(?i)(?:^|\s|\")--remote-debugging-address=(?<value>[^\s\"]+)(?=\s|\"|$)'))
  $i=@([regex]::Matches($line,'(?i)(?:^|\s|\")--(?<name>inspect-brk|inspect-port|inspect)(?:=(?<value>[^\s\"]+))?(?=\s|\"|$)'))
  $render=$r.Count -eq 1 -and $r[0].Groups['value'].Value -eq $env:CLE_RENDER_PORT
  $address=$a.Count -eq 1 -and $a[0].Groups['value'].Value -eq '127.0.0.1'
  $inspect=if($env:CLE_INSPECT_PORT){$i.Count -eq 1 -and $i[0].Groups['name'].Value -ieq 'inspect-brk' -and $i[0].Groups['value'].Value -eq ('127.0.0.1:'+$env:CLE_INSPECT_PORT)}else{$i.Count -eq 0}
}
$created=if($p -and $p.CreationDate){([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds()}else{0}
@{present=[bool]$p;available=[bool]$line;root=[bool]$root;renderer=[bool]$render;address=[bool]$address;inspector=[bool]$inspect;createdMs=$created}|ConvertTo-Json -Compress
"#;

fn argument_summary(
    pid: u32,
    port: u16,
    inspector: Option<u16>,
) -> Result<Arguments, RecoveryError> {
    let (pid, port, inspector) = (
        pid.to_string(),
        port.to_string(),
        inspector.map(|p| p.to_string()).unwrap_or_default(),
    );
    let bytes = process_diagnostics::query_once_with_timeout(
        "startup successor arguments",
        ARGUMENT_SCRIPT,
        &[
            ("CLE_SUCCESSOR_PID", pid.as_ref()),
            ("CLE_RENDER_PORT", port.as_ref()),
            ("CLE_INSPECT_PORT", inspector.as_ref()),
        ],
        4096,
        json!({"pid":pid,"fullCommandLineRetained":false}),
        Duration::from_millis(2500),
    )
    .map_err(|e| RecoveryError::new(FailureKind::Unavailable, e.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|e| {
        RecoveryError::new(
            FailureKind::Unavailable,
            format!("successor argument summary JSON: {e}"),
        )
    })
}

fn verify_successor(
    pid: u32,
    image: &Path,
    package: &str,
    after: SystemTime,
    port: u16,
    inspector: Option<u16>,
) -> Result<OwnedHandle, RecoveryError> {
    process_guard::verify_process_identity_native(pid, after, image).map_err(identity_failure)?;
    let before = process_diagnostics::native_process(pid)["creationFiletime"]
        .as_u64()
        .ok_or_else(|| unavailable("successor generation"))?;
    let raw = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE | PROCESS_TERMINATE,
            0,
            pid,
        )
    };
    if raw.is_null() {
        return Err(unavailable("successor retained handle"));
    }
    let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
    let ticks = creation_ticks(&handle)?;
    if before != ticks || unsafe { WaitForSingleObject(raw, 0) } != WAIT_TIMEOUT {
        return Err(rejected("Successor generation changed or exited"));
    }
    let package_ok = package_matches(&handle, package)?;
    let user_ok = user_matches(&handle)?;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn ProcessIdToSessionId(pid: u32, session: *mut u32) -> i32;
    }
    let (mut own_session, mut candidate_session) = (0, 0);
    if unsafe { ProcessIdToSessionId(std::process::id(), &mut own_session) } == 0
        || unsafe { ProcessIdToSessionId(pid, &mut candidate_session) } == 0
    {
        return Err(unavailable("successor session identity"));
    }
    process_diagnostics::observe(
        "startup recovery",
        "successor native identity",
        "observed",
        json!({"pid":pid,"packageMatches":package_ok,"sessionMatches":own_session==candidate_session,"sameUser":user_ok,"creationFiletime":ticks}),
    );
    if !package_ok || !user_ok || own_session != candidate_session {
        return Err(rejected(
            "Successor package identity, user or session did not match",
        ));
    }
    let arguments = argument_summary(pid, port, inspector)?;
    process_diagnostics::observe(
        "startup recovery",
        "successor argument summary",
        "observed",
        json!({"pid":pid,"arguments":arguments,"fullCommandLineRetained":false}),
    );
    if !arguments.present || !arguments.available {
        return Err(RecoveryError::new(
            FailureKind::Unavailable,
            "Successor command line is unavailable",
        ));
    }
    if !arguments.matches(ticks) {
        return Err(rejected(
            "Successor root/debug arguments or generation did not match",
        ));
    }
    process_guard::verify_process_identity_native(pid, after, image).map_err(identity_failure)?;
    process_guard::verify_listener_owner_fast(port, pid, after)
        .map_err(|e| rejected(format!("Successor renderer ownership: {e}")))?;
    let owners = port_owners(port)?;
    let main = inspector.map(port_owners).transpose()?.unwrap_or_default();
    if owners != [pid]
        || (!main.is_empty() && main != [pid])
        || unsafe { WaitForSingleObject(raw, 0) } != WAIT_TIMEOUT
        || creation_ticks(&handle)? != ticks
    {
        return Err(rejected(
            "Successor final liveness or dual-stack ownership recheck failed",
        ));
    }
    Ok(handle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncBufReadExt, BufReader};

    #[test]
    fn accepted_activation_with_missing_handle_is_not_reported_as_windows_denial() {
        let e = activation_failure(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "{}: pid=123; osCode=5",
                process_guard::ACTIVATION_OBSERVATION_UNAVAILABLE
            ),
        ));
        assert_eq!(e.kind, FailureKind::Unavailable);
        assert!(e.details.contains("pid=123") && e.details.contains("osCode=5"));
        assert_eq!(
            activation_failure(io::Error::from_raw_os_error(5)).kind,
            FailureKind::Activation
        );
    }

    async fn fixture(
        extra: &[&str],
    ) -> (tokio::process::Child, tempfile::TempDir, u16, SystemTime) {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("owned fixture.ps1");
        std::fs::write(&script,"$l=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,[int]$env:CC_FIXTURE_PORT); $l.Start(); [Console]::WriteLine('ready'); [Console]::Out.Flush(); Start-Sleep -Seconds 120").unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let after = SystemTime::now();
        let mut child = tokio::process::Command::new(process_guard::trusted_powershell().unwrap())
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-File"])
            .arg(&script)
            .args([
                format!("--remote-debugging-port={port}"),
                "--remote-debugging-address=127.0.0.1".to_owned(),
            ])
            .args(extra)
            .env("CC_FIXTURE_PORT", port.to_string())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x0800_0000)
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut line = String::new();
        tokio::time::timeout(
            Duration::from_secs(10),
            BufReader::new(child.stdout.take().unwrap()).read_line(&mut line),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(line.trim(), "ready");
        (child, dir, port, after)
    }
    #[test]
    fn every_argument_and_generation_proof_is_required() {
        let ticks = 116444736000000000 + 1234 * 10000;
        for field in [
            "present",
            "available",
            "root",
            "renderer",
            "address",
            "inspector",
            "createdMs",
        ] {
            let mut value = json!({"present":true,"available":true,"root":true,"renderer":true,"address":true,"inspector":true,"createdMs":1234});
            assert!(
                serde_json::from_value::<Arguments>(value.clone())
                    .unwrap()
                    .matches(ticks)
            );
            value[field] = if field == "createdMs" {
                json!(1233)
            } else {
                json!(false)
            };
            assert!(
                !serde_json::from_value::<Arguments>(value)
                    .unwrap()
                    .matches(ticks),
                "{field}"
            );
        }
    }
    #[tokio::test]
    async fn real_windows_ports_commands_generation_user_and_missing_package() {
        let (mut child, _dir, port, after) = fixture(&[]).await;
        let pid = child.id().unwrap();
        let image = process_guard::trusted_powershell().unwrap();
        assert_eq!(port_owners(port).unwrap(), [pid]);
        assert!(exact_image_processes(&image).unwrap() > 0);
        let summary = argument_summary(pid, port, None).unwrap();
        let raw = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                0,
                pid,
            )
        };
        assert!(!raw.is_null());
        let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
        assert!(summary.matches(creation_ticks(&handle).unwrap()));
        assert!(user_matches(&handle).unwrap());
        assert!(!package_matches(&handle, "not-a-real-package").unwrap());
        assert_eq!(
            verify_successor(pid, &image, "not-a-real-package", after, port, None)
                .unwrap_err()
                .kind,
            FailureKind::Rejected
        );
        assert!(
            child.try_wait().unwrap().is_none(),
            "Rejected candidate must remain untouched"
        );
        child.kill().await.unwrap();
        child.wait().await.unwrap();
    }
    #[tokio::test]
    async fn actual_command_line_rejects_wrong_duplicate_child_and_inspector_switches() {
        for extra in [
            vec!["--type=renderer"],
            vec!["--remote-debugging-port=1"],
            vec!["--remote-debugging-address=0.0.0.0"],
            vec!["--inspect-brk=127.0.0.1:1"],
        ] {
            let (mut child, _dir, port, _) = fixture(&extra).await;
            let pid = child.id().unwrap();
            let summary = argument_summary(pid, port, None).unwrap_or_else(|error| panic!("{error:?}; {}", process_diagnostics::report()));
            let ticks = process_diagnostics::native_process(pid)["creationFiletime"]
                .as_u64()
                .unwrap();
            assert!(
                !summary.matches(ticks),
                "extra={extra:?}; summary={summary:?}"
            );
            child.kill().await.unwrap();
            child.wait().await.unwrap();
        }
    }
    #[tokio::test]
    async fn recovered_guard_only_stops_the_retained_owned_fixture() {
        let (mut target, _dir, _, _) = fixture(&[]).await;
        let (mut sibling, _other, _, _) = fixture(&[]).await;
        let pid = target.id().unwrap();
        let raw = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE | PROCESS_TERMINATE,
                0,
                pid,
            )
        };
        assert!(!raw.is_null());
        let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
        let mut guard = CodexProcessGuard::from_verified_successor(pid, handle);
        assert!(guard.exit_code().unwrap().is_none());
        guard.terminate().await;
        tokio::time::timeout(Duration::from_secs(5), guard.wait_for_exit())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(guard.exit_code().unwrap(), Some(0));
        assert!(sibling.try_wait().unwrap().is_none());
        target.wait().await.unwrap();
        drop(guard);
        assert!(sibling.try_wait().unwrap().is_none());
        sibling.kill().await.unwrap();
        sibling.wait().await.unwrap();
    }
    #[test]
    fn foreign_wildcard_listener_blocks_recovery() {
        let listener = std::net::TcpListener::bind("0.0.0.0:0").unwrap();
        assert_eq!(
            port_owners(listener.local_addr().unwrap().port())
                .unwrap_err()
                .kind,
            FailureKind::Rejected
        );
    }

    #[tokio::test]
    async fn exited_activation_pid_is_never_adopted_as_its_own_successor() {
        let mut backend = NativeBackend::new(
            "fixture".into(),
            "fixture".into(),
            vec![],
            std::env::current_exe().unwrap(),
            1,
            None,
            false,
        );
        backend.original_pid = std::process::id();
        let result = backend.adopt(std::process::id()).await;
        assert!(matches!(
            result,
            Err(RecoveryError {
                kind: FailureKind::Rejected,
                ..
            })
        ));
    }

    #[test]
    fn absent_exact_image_and_closed_ports_are_observed_without_starting_it() {
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("unique-absent-official-fixture.exe");
        std::fs::copy(std::env::current_exe().unwrap(), &image).unwrap();
        assert_eq!(exact_image_processes(&image).unwrap(), 0);
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(port_owners(port).unwrap().is_empty());
    }
}
