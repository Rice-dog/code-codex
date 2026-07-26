use std::collections::{HashMap, HashSet};
use std::env;
use std::io;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use thiserror::Error;
use tokio::process::Command as TokioCommand;

#[cfg(windows)]
use process_wrap::tokio::JobObject;
#[cfg(windows)]
use process_wrap::tokio::TokioCommandWrapper;
use process_wrap::tokio::{KillOnDrop, TokioChildWrapper, TokioCommandWrap};
#[cfg(windows)]
use std::sync::Arc;
#[cfg(windows)]
use win32job::{ExtendedLimitInfo, Job};

#[derive(Debug, Error)]
pub enum ProcessGuardError {
    #[error("a random loopback debugging port could not be reserved")]
    PortUnavailable,
    #[error("the CDP listener process could not be verified")]
    OwnershipUnknown,
    #[error("the existing Codex process state could not be verified")]
    ProcessInspectionUnknown,
    #[error("the CDP listener is not owned by the launched Codex process")]
    OwnershipMismatch,
    #[error("the CDP listener is not owned by the verified official Codex executable")]
    ExecutableMismatch,
}

/// Owns a launched Codex process for the complete debug-enabled lifetime.
///
/// `kill_on_drop` is the final safety net for cancellation and unwinding. The
/// normal cleanup path additionally terminates the Windows process tree so an
/// Electron child cannot retain the debugging listener after the launcher
/// exits.
pub struct CodexChildGuard {
    child: Box<dyn TokioChildWrapper>,
    pid: u32,
    #[cfg(windows)]
    observed_job: Option<Arc<Job>>,
}

/// Assigns the suspended child to a separately retained, queryable job before
/// `process-wrap` assigns and resumes its own kill-on-close job. Windows 8 and
/// newer support this nested-job arrangement. Future descendants inherit both
/// jobs, so the retained job gives the supervisor an exact child-tree liveness
/// signal without weakening the existing kill-on-drop safety net.
#[cfg(windows)]
#[derive(Debug)]
struct ObservableJob {
    job: Arc<Job>,
}

#[cfg(windows)]
impl TokioCommandWrapper for ObservableJob {
    fn post_spawn(
        &mut self,
        child: &mut tokio::process::Child,
        _core: &TokioCommandWrap,
    ) -> io::Result<()> {
        let handle = child
            .raw_handle()
            .ok_or_else(|| io::Error::other("spawned process has no process handle"))?;
        self.job
            .assign_process(handle as isize)
            .map_err(io::Error::other)
    }
}

impl CodexChildGuard {
    pub fn spawn(command: TokioCommand) -> io::Result<Self> {
        let mut command = TokioCommandWrap::from(command);
        #[cfg(windows)]
        let observed_job = {
            let mut limits = ExtendedLimitInfo::new();
            limits.limit_kill_on_job_close();
            let job = Arc::new(Job::create_with_limit_info(&limits).map_err(io::Error::other)?);
            // This wrapper must precede JobObject: JobObject suspends in
            // pre_spawn, ObservableJob assigns in post_spawn, and JobObject
            // then assigns its own job and resumes the process in wrap_child.
            command.wrap(ObservableJob { job: job.clone() });
            job
        };
        command.wrap(KillOnDrop);
        #[cfg(windows)]
        command.wrap(JobObject);
        let child = command.spawn()?;
        let pid = child
            .id()
            .ok_or_else(|| io::Error::other("spawned process has no process ID"))?;
        Ok(Self {
            child,
            pid,
            #[cfg(windows)]
            observed_job: Some(observed_job),
        })
    }

    #[must_use]
    pub const fn pid(&self) -> u32 {
        self.pid
    }

    pub async fn terminate(&mut self) {
        #[cfg(windows)]
        drop(self.observed_job.take());
        // Closing the retained kill-on-close job terminates the complete tree;
        // the process-wrap job then reaps the bootstrap process and provides a
        // second kill-on-drop safety net.
        let cleanup = Box::into_pin(self.child.kill());
        let _ = tokio::time::timeout(Duration::from_secs(5), cleanup).await;
    }

    /// Wait until every process in the owned Windows Job Object has exited.
    pub async fn wait_for_exit(&mut self) -> io::Result<()> {
        #[cfg(windows)]
        {
            loop {
                let job = self
                    .observed_job
                    .as_ref()
                    .ok_or_else(|| io::Error::other("Codex job is no longer available"))?;
                if job
                    .query_process_id_list()
                    .map_err(io::Error::other)?
                    .is_empty()
                {
                    Box::into_pin(self.child.wait()).await?;
                    return Ok(());
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
        #[cfg(not(windows))]
        {
            Box::into_pin(self.child.wait()).await?;
            Ok(())
        }
    }

    #[cfg(test)]
    fn has_exited(&mut self) -> bool {
        #[cfg(windows)]
        {
            self.observed_job.as_ref().is_none_or(|job| {
                job.query_process_id_list()
                    .is_ok_and(|processes| processes.is_empty())
            })
        }
        #[cfg(not(windows))]
        {
            self.child.try_wait().ok().flatten().is_some()
        }
    }
}

pub struct PortReservation {
    listener: TcpListener,
}

impl PortReservation {
    pub fn reserve() -> Result<Self, ProcessGuardError> {
        let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
            .map_err(|_| ProcessGuardError::PortUnavailable)?;
        Ok(Self { listener })
    }

    pub fn port(&self) -> Result<u16, ProcessGuardError> {
        self.listener
            .local_addr()
            .map(|address| address.port())
            .map_err(|_| ProcessGuardError::PortUnavailable)
    }

    pub fn release(self) {
        drop(self);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct OwnershipSnapshot {
    #[serde(default)]
    listeners: Vec<u32>,
    #[serde(default)]
    processes: Vec<ProcessRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ProcessRecord {
    process_id: u32,
    parent_process_id: u32,
    creation_unix_millis: i64,
    #[serde(default)]
    executable_path: Option<String>,
}

#[cfg(windows)]
pub(crate) fn trusted_powershell() -> Option<PathBuf> {
    trusted_system32_executable(r"WindowsPowerShell\v1.0\powershell.exe")
}

#[cfg(not(windows))]
pub(crate) fn trusted_powershell() -> Option<PathBuf> {
    None
}

#[cfg(windows)]
fn trusted_system32_executable(relative: &str) -> Option<PathBuf> {
    let system_root = PathBuf::from(env::var_os("SystemRoot")?);
    if !system_root.is_absolute() {
        return None;
    }
    let system_root = dunce::canonicalize(system_root).ok()?;
    let system32 = dunce::canonicalize(system_root.join("System32")).ok()?;
    let executable = dunce::canonicalize(system32.join(relative)).ok()?;
    if executable.is_file() && path_starts_with(&executable, &system32) {
        Some(executable)
    } else {
        None
    }
}

pub fn verify_listener_owner(
    port: u16,
    launched_pid: u32,
    launched_after: SystemTime,
) -> Result<(), ProcessGuardError> {
    #[cfg(not(windows))]
    {
        let _ = (port, launched_pid, launched_after);
        Ok(())
    }
    #[cfg(windows)]
    {
        // Both interpolated values are integers created by this process. No
        // renderer or filesystem text enters the PowerShell program.
        let script = ownership_script(port);
        let powershell = trusted_powershell().ok_or(ProcessGuardError::OwnershipUnknown)?;
        let output = StdCommand::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if !output.status.success() || output.stdout.len() > 4 * 1024 * 1024 {
            return Err(ProcessGuardError::OwnershipUnknown);
        }
        let snapshot: OwnershipSnapshot = serde_json::from_slice(&output.stdout)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        let launched_after_millis = launched_after
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?
            .as_millis()
            .try_into()
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        verify_snapshot(&snapshot, launched_pid, launched_after_millis)
    }
}

pub fn verify_listener_executable(
    port: u16,
    official_executable: &Path,
) -> Result<(), ProcessGuardError> {
    #[cfg(not(windows))]
    {
        let _ = (port, official_executable);
        Err(ProcessGuardError::OwnershipUnknown)
    }
    #[cfg(windows)]
    {
        let official_executable = dunce::canonicalize(official_executable)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if !official_executable.is_file() {
            return Err(ProcessGuardError::OwnershipUnknown);
        }
        let powershell = trusted_powershell().ok_or(ProcessGuardError::OwnershipUnknown)?;
        let output = StdCommand::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &ownership_script(port),
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if !output.status.success() || output.stdout.len() > 4 * 1024 * 1024 {
            return Err(ProcessGuardError::OwnershipUnknown);
        }
        let snapshot: OwnershipSnapshot = serde_json::from_slice(&output.stdout)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        verify_snapshot_executable(&snapshot, &official_executable)
    }
}

#[cfg(windows)]
fn ownership_script(port: u16) -> String {
    format!(
        "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $l=@(Get-NetTCPConnection -State Listen -LocalPort {port} | Where-Object {{ $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '::1' }} | Select-Object -ExpandProperty OwningProcess -Unique); $p=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{{Name='CreationUnixMillis';Expression={{([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}}}}); [pscustomobject]@{{Listeners=$l;Processes=$p}} | ConvertTo-Json -Compress -Depth 4"
    )
}

pub fn is_executable_running(executable: &Path) -> Result<bool, ProcessGuardError> {
    #[cfg(not(windows))]
    {
        let _ = executable;
        Ok(false)
    }
    #[cfg(windows)]
    {
        const SCRIPT: &str = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $target=[IO.Path]::GetFullPath($env:CLE_CODEX_EXE); $count=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).Equals($target,[StringComparison]::OrdinalIgnoreCase) }).Count; [Console]::Write($count.ToString([Globalization.CultureInfo]::InvariantCulture))";
        let executable = dunce::canonicalize(executable)
            .map_err(|_| ProcessGuardError::ProcessInspectionUnknown)?;
        if !executable.is_file() {
            return Err(ProcessGuardError::ProcessInspectionUnknown);
        }
        let powershell = trusted_powershell().ok_or(ProcessGuardError::ProcessInspectionUnknown)?;
        let output = StdCommand::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                SCRIPT,
            ])
            .env("CLE_CODEX_EXE", executable.as_os_str())
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| ProcessGuardError::ProcessInspectionUnknown)?;
        parse_running_query_result(output.status.success(), &output.stdout)
    }
}

fn parse_running_query_result(
    status_success: bool,
    stdout: &[u8],
) -> Result<bool, ProcessGuardError> {
    const MAX_PROCESS_QUERY_OUTPUT_BYTES: usize = 64;
    if !status_success || stdout.is_empty() || stdout.len() > MAX_PROCESS_QUERY_OUTPUT_BYTES {
        return Err(ProcessGuardError::ProcessInspectionUnknown);
    }
    let count = std::str::from_utf8(stdout)
        .map_err(|_| ProcessGuardError::ProcessInspectionUnknown)?
        .trim();
    if count.is_empty() || !count.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(ProcessGuardError::ProcessInspectionUnknown);
    }
    count
        .parse::<u32>()
        .map(|count| count > 0)
        .map_err(|_| ProcessGuardError::ProcessInspectionUnknown)
}

fn verify_snapshot(
    snapshot: &OwnershipSnapshot,
    launched_pid: u32,
    launched_after_millis: i64,
) -> Result<(), ProcessGuardError> {
    if snapshot.listeners.is_empty() {
        return Err(ProcessGuardError::OwnershipUnknown);
    }
    let processes: HashMap<_, _> = snapshot
        .processes
        .iter()
        .map(|process| (process.process_id, process))
        .collect();
    let creation_matches = snapshot.processes.iter().any(|process| {
        process.process_id == launched_pid
            && process.creation_unix_millis >= launched_after_millis.saturating_sub(5_000)
    });
    if creation_matches
        && snapshot
            .listeners
            .iter()
            .all(|listener| is_process_or_descendant(*listener, launched_pid, &processes))
    {
        Ok(())
    } else {
        Err(ProcessGuardError::OwnershipMismatch)
    }
}

fn verify_snapshot_executable(
    snapshot: &OwnershipSnapshot,
    official_executable: &Path,
) -> Result<(), ProcessGuardError> {
    if snapshot.listeners.is_empty() {
        return Err(ProcessGuardError::OwnershipUnknown);
    }
    let processes: HashMap<_, _> = snapshot
        .processes
        .iter()
        .map(|process| (process.process_id, process))
        .collect();
    if snapshot.listeners.iter().all(|listener| {
        process_chain_contains_executable(*listener, official_executable, &processes)
    }) {
        Ok(())
    } else {
        Err(ProcessGuardError::ExecutableMismatch)
    }
}

fn process_chain_contains_executable(
    pid: u32,
    official_executable: &Path,
    processes: &HashMap<u32, &ProcessRecord>,
) -> bool {
    let official = official_executable.to_string_lossy().to_lowercase();
    let mut current = pid;
    let mut visited = HashSet::new();
    let mut child_creation = None;
    for _ in 0..64 {
        if current == 0 || !visited.insert(current) {
            return false;
        }
        let Some(process) = processes.get(&current) else {
            return false;
        };
        if child_creation.is_some_and(|created| process.creation_unix_millis > created) {
            return false;
        }
        if process
            .executable_path
            .as_deref()
            .is_some_and(|path| path.to_lowercase() == official)
        {
            return true;
        }
        child_creation = Some(process.creation_unix_millis);
        current = process.parent_process_id;
    }
    false
}

fn is_process_or_descendant(
    pid: u32,
    ancestor: u32,
    processes: &HashMap<u32, &ProcessRecord>,
) -> bool {
    let mut current = pid;
    let mut visited = HashSet::new();
    let mut child_creation = None;
    for _ in 0..64 {
        if current == 0 || !visited.insert(current) {
            return false;
        }
        let Some(process) = processes.get(&current) else {
            return false;
        };
        if child_creation.is_some_and(|created| process.creation_unix_millis > created) {
            return false;
        }
        if current == ancestor {
            return true;
        }
        child_creation = Some(process.creation_unix_millis);
        current = process.parent_process_id;
    }
    false
}

#[cfg(windows)]
fn path_starts_with(candidate: &Path, root: &Path) -> bool {
    let candidate: Vec<_> = candidate
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let root: Vec<_> = root
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    candidate.starts_with(&root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserves_only_ipv4_loopback() {
        let reservation = PortReservation::reserve().expect("reserve");
        let address = reservation.listener.local_addr().expect("address");
        assert_eq!(address.ip(), IpAddr::V4(Ipv4Addr::LOCALHOST));
        assert_ne!(address.port(), 0);
    }

    #[test]
    fn verifies_descendant_process_chain_without_cycles() {
        let mut snapshot = OwnershipSnapshot {
            listeners: vec![30],
            processes: vec![
                ProcessRecord {
                    process_id: 30,
                    parent_process_id: 20,
                    creation_unix_millis: 1_020,
                    executable_path: None,
                },
                ProcessRecord {
                    process_id: 20,
                    parent_process_id: 10,
                    creation_unix_millis: 1_010,
                    executable_path: None,
                },
                ProcessRecord {
                    process_id: 10,
                    parent_process_id: 1,
                    creation_unix_millis: 1_000,
                    executable_path: None,
                },
            ],
        };
        assert!(verify_snapshot(&snapshot, 10, 1_000).is_ok());
        assert!(verify_snapshot(&snapshot, 10, 10_000).is_err());
        assert!(verify_snapshot(&snapshot, 99, 1_000).is_err());
        snapshot.processes[1].creation_unix_millis = 2_000;
        assert!(verify_snapshot(&snapshot, 10, 1_000).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn verifies_a_real_loopback_listener_owner() {
        let reservation = PortReservation::reserve().expect("reserve");
        let port = reservation.port().expect("port");
        verify_listener_owner(port, std::process::id(), UNIX_EPOCH)
            .expect("current process owns listener");
    }

    #[cfg(windows)]
    #[test]
    fn detects_a_running_executable_by_canonical_path() {
        let current = std::env::current_exe().expect("current executable");
        assert!(is_executable_running(&current).expect("inspect running processes"));
    }

    #[test]
    fn process_query_output_fails_closed() {
        assert_eq!(parse_running_query_result(true, b"0\r\n").ok(), Some(false));
        assert_eq!(parse_running_query_result(true, b"2").ok(), Some(true));
        assert!(parse_running_query_result(false, b"0").is_err());
        assert!(parse_running_query_result(true, b"").is_err());
        assert!(parse_running_query_result(true, b"1\n0").is_err());
        assert!(parse_running_query_result(true, &[0xff]).is_err());
        assert!(parse_running_query_result(true, &[b'1'; 65]).is_err());
    }

    #[test]
    fn attached_listener_requires_the_official_executable_in_every_process_chain() {
        let mut snapshot = OwnershipSnapshot {
            listeners: vec![30],
            processes: vec![
                ProcessRecord {
                    process_id: 30,
                    parent_process_id: 20,
                    creation_unix_millis: 0,
                    executable_path: Some(r"C:\Official\helper.exe".to_owned()),
                },
                ProcessRecord {
                    process_id: 20,
                    parent_process_id: 0,
                    creation_unix_millis: 0,
                    executable_path: Some(r"C:\Official\Codex.exe".to_owned()),
                },
            ],
        };
        assert!(verify_snapshot_executable(&snapshot, Path::new(r"c:\official\CODEX.exe")).is_ok());
        assert!(verify_snapshot_executable(&snapshot, Path::new(r"C:\Other\Codex.exe")).is_err());
        snapshot.processes[0].creation_unix_millis = 1_000;
        snapshot.processes[1].creation_unix_millis = 2_000;
        assert!(
            verify_snapshot_executable(&snapshot, Path::new(r"C:\Official\Codex.exe")).is_err()
        );
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn guarded_child_cleanup_waits_for_process_exit() {
        let powershell = trusted_powershell().expect("trusted PowerShell");
        let mut command = TokioCommand::new(powershell);
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Sleep -Seconds 30",
        ]);
        let mut guard = CodexChildGuard::spawn(command).expect("spawn child");
        assert!(!guard.has_exited());
        guard.terminate().await;
        assert!(guard.has_exited());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn job_cleanup_kills_descendant_after_bootstrap_parent_exits() {
        let directory = tempfile::TempDir::new().expect("temp dir");
        let pid_file = directory.path().join("descendant.pid");
        let powershell = trusted_powershell().expect("trusted PowerShell");
        let mut command = TokioCommand::new(&powershell);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$child=Start-Process -FilePath $env:CLE_POWERSHELL -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 30') -PassThru; [IO.File]::WriteAllText($env:CLE_CHILD_PID,[string]$child.Id)",
            ])
            .env("CLE_POWERSHELL", &powershell)
            .env("CLE_CHILD_PID", &pid_file)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut guard = CodexChildGuard::spawn(command).expect("spawn bootstrap");
        let bootstrap_pid = guard.pid();

        let descendant_pid = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Ok(contents) = std::fs::read_to_string(&pid_file) {
                    if let Ok(pid) = contents.trim().parse::<u32>() {
                        break pid;
                    }
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
        })
        .await
        .expect("descendant pid");

        tokio::time::timeout(Duration::from_secs(5), async {
            while process_exists(bootstrap_pid) {
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
        })
        .await
        .expect("bootstrap parent exit");
        assert!(process_exists(descendant_pid));
        assert!(
            !guard.has_exited(),
            "the observable Job Object must remain live while a descendant runs"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(250), guard.wait_for_exit())
                .await
                .is_err(),
            "natural-exit monitoring must wait for the complete child tree"
        );

        guard.terminate().await;
        assert!(guard.has_exited());
        assert!(!process_exists(descendant_pid));
    }

    #[cfg(windows)]
    fn process_exists(pid: u32) -> bool {
        let Some(powershell) = trusted_powershell() else {
            return false;
        };
        let script = format!(
            "$process=Get-Process -Id {pid} -ErrorAction SilentlyContinue; if($process){{exit 0}}else{{exit 1}}"
        );
        StdCommand::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    }
}
