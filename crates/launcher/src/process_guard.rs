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
#[cfg(windows)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
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

/// Owns either a directly spawned Codex process tree or the helper supervising
/// an activated Windows package PID. Direct executables retain the existing
/// Job Object behavior; packaged applications use the supported shell
/// activation API and are terminated only after their new process identity is
/// verified.
pub enum CodexProcessGuard {
    Child(CodexChildGuard),
    #[cfg(windows)]
    Package(Box<CodexPackageGuard>),
}

#[cfg(windows)]
pub struct CodexPackageGuard {
    helper: tokio::process::Child,
    control: Option<tokio::process::ChildStdin>,
    pid: u32,
    armed: bool,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PackageActivationResult {
    h_result: i32,
    process_id: u32,
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

impl CodexProcessGuard {
    pub fn spawn(command: TokioCommand) -> io::Result<Self> {
        CodexChildGuard::spawn(command).map(Self::Child)
    }

    /// Activate the official packaged Codex application and retain a helper
    /// that observes the returned activation PID. The helper intentionally
    /// starts unarmed: the caller must verify the returned PID and then call
    /// [`Self::arm_package_termination`] before this guard may terminate the
    /// package.
    pub async fn activate_package(
        package_full_name: String,
        aumid: String,
        arguments: Vec<String>,
    ) -> io::Result<Self> {
        #[cfg(not(windows))]
        {
            let _ = (package_full_name, aumid, arguments);
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "Windows package activation is unavailable on this platform",
            ))
        }
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            const ACTIVATION_TIMEOUT: Duration = Duration::from_secs(30);

            let powershell = trusted_powershell().ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    "trusted System32 PowerShell could not be located",
                )
            })?;
            let activation_arguments = quote_windows_arguments(&arguments);
            let mut command = TokioCommand::new(powershell);
            command
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Sta",
                    "-Command",
                    PACKAGE_ACTIVATION_SCRIPT,
                ])
                .env("CLE_PACKAGE_AUMID", aumid)
                .env("CLE_PACKAGE_FULL_NAME", package_full_name)
                .env("CLE_PACKAGE_ARGUMENTS", activation_arguments)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW);

            let mut helper = command.spawn()?;
            let control = match helper.stdin.take() {
                Some(control) => control,
                None => {
                    let _ = helper.kill().await;
                    let _ = helper.wait().await;
                    return Err(io::Error::other(
                        "package activation helper has no control pipe",
                    ));
                }
            };
            let output = match helper.stdout.take() {
                Some(output) => output,
                None => {
                    stop_unarmed_package_helper(helper, Some(control)).await;
                    return Err(io::Error::other(
                        "package activation helper has no result pipe",
                    ));
                }
            };
            let result_line = match tokio::time::timeout(
                ACTIVATION_TIMEOUT,
                read_package_activation_line(output),
            )
            .await
            {
                Ok(Ok(line)) => line,
                Ok(Err(error)) => {
                    stop_unarmed_package_helper(helper, Some(control)).await;
                    return Err(error);
                }
                Err(_) => {
                    stop_unarmed_package_helper(helper, Some(control)).await;
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "package activation helper did not report a result",
                    ));
                }
            };
            let activation: PackageActivationResult = match serde_json::from_slice(&result_line) {
                Ok(activation) => activation,
                Err(error) => {
                    stop_unarmed_package_helper(helper, Some(control)).await;
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("invalid package activation result: {error}"),
                    ));
                }
            };
            if activation.h_result < 0 || activation.process_id == 0 {
                stop_unarmed_package_helper(helper, Some(control)).await;
                return Err(io::Error::other(format!(
                    "package activation failed with HRESULT 0x{:08X} and PID {}",
                    activation.h_result as u32, activation.process_id
                )));
            }

            Ok(Self::Package(Box::new(CodexPackageGuard {
                helper,
                control: Some(control),
                pid: activation.process_id,
                armed: false,
            })))
        }
    }

    #[must_use]
    pub fn pid(&self) -> u32 {
        match self {
            Self::Child(child) => child.pid(),
            #[cfg(windows)]
            Self::Package(package) => package.pid,
        }
    }

    /// Permit package-wide termination after the caller has established that
    /// activation created the expected new official Codex process.
    pub async fn arm_package_termination(&mut self) -> io::Result<()> {
        match self {
            Self::Child(_) => Ok(()),
            #[cfg(windows)]
            Self::Package(package) => {
                if package.armed {
                    return Ok(());
                }
                let control = package.control.as_mut().ok_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::BrokenPipe,
                        "package activation helper control pipe is closed",
                    )
                })?;
                control.write_all(b"arm\n").await?;
                control.flush().await?;
                package.armed = true;
                Ok(())
            }
        }
    }

    pub async fn wait_for_exit(&mut self) -> io::Result<()> {
        match self {
            Self::Child(child) => child.wait_for_exit().await,
            #[cfg(windows)]
            Self::Package(package) => {
                let status = package.helper.wait().await?;
                if status.success() {
                    Ok(())
                } else {
                    Err(io::Error::other(format!(
                        "package activation helper exited with {status}"
                    )))
                }
            }
        }
    }

    pub async fn terminate(&mut self) {
        match self {
            Self::Child(child) => child.terminate().await,
            #[cfg(windows)]
            Self::Package(package) => package.terminate().await,
        }
    }
}

#[cfg(windows)]
impl CodexPackageGuard {
    async fn terminate(&mut self) {
        if let Some(mut control) = self.control.take() {
            let _ = control.write_all(b"terminate\n").await;
            let _ = control.flush().await;
            let _ = control.shutdown().await;
        }
        if tokio::time::timeout(Duration::from_secs(5), self.helper.wait())
            .await
            .is_err()
        {
            let _ = self.helper.kill().await;
            let _ = self.helper.wait().await;
        }
    }
}

#[cfg(windows)]
async fn stop_unarmed_package_helper(
    mut helper: tokio::process::Child,
    control: Option<tokio::process::ChildStdin>,
) {
    drop(control);
    if tokio::time::timeout(Duration::from_secs(2), helper.wait())
        .await
        .is_err()
    {
        let _ = helper.kill().await;
        let _ = helper.wait().await;
    }
}

#[cfg(windows)]
async fn read_package_activation_line(output: tokio::process::ChildStdout) -> io::Result<Vec<u8>> {
    const MAX_ACTIVATION_RESULT_BYTES: usize = 1_024;

    let mut output = BufReader::new(output);
    let mut line = Vec::new();
    loop {
        let (chunk, newline) = {
            let available = output.fill_buf().await?;
            if available.is_empty() {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "package activation helper closed its result pipe",
                ));
            }
            if let Some(position) = available.iter().position(|byte| *byte == b'\n') {
                (available[..position].to_vec(), true)
            } else {
                (available.to_vec(), false)
            }
        };
        let consumed = chunk.len() + usize::from(newline);
        if line.len().saturating_add(chunk.len()) > MAX_ACTIVATION_RESULT_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "package activation helper result exceeded the size limit",
            ));
        }
        line.extend_from_slice(&chunk);
        output.consume(consumed);
        if newline {
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            return Ok(line);
        }
    }
}

#[cfg(windows)]
const PACKAGE_ACTIVATION_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$source = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CodexLiveExplorerPackageGuard
{
    [Flags]
    public enum ActivateOptions : uint
    {
        None = 0,
        DesignMode = 1,
        NoErrorUI = 2,
        NoSplashScreen = 4
    }

    public enum PackageExecutionState : int
    {
        Unknown = 0,
        Running = 1,
        Suspending = 2,
        Suspended = 3,
        Terminated = 4
    }

    [ComImport]
    [Guid("1BB12A62-2AD8-432B-8CCF-0C2C52AFCD5B")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPackageExecutionStateChangeNotification
    {
        [PreserveSig]
        int OnStateChanged(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            PackageExecutionState newState);
    }

    [ComImport]
    [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            ActivateOptions options,
            out uint processId);

        [PreserveSig]
        int ActivateForFile(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray,
            [MarshalAs(UnmanagedType.LPWStr)] string verb,
            out uint processId);

        [PreserveSig]
        int ActivateForProtocol(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray,
            out uint processId);
    }

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    public class ApplicationActivationManager
    {
    }

    // Method order and signatures mirror the complete IPackageDebugSettings
    // vtable in ShObjIdl_core.h. In particular, TerminateAllProcesses is slot
    // 5 and GetPackageExecutionState is slot 13 after IUnknown.
    [ComImport]
    [Guid("F27C3930-8029-4AD1-94E3-3DBA417810C1")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPackageDebugSettings
    {
        [PreserveSig]
        int EnableDebugging(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            [MarshalAs(UnmanagedType.LPWStr)] string debuggerCommandLine,
            IntPtr environment);

        [PreserveSig]
        int DisableDebugging(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int Suspend(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int Resume(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int TerminateAllProcesses(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int SetTargetSessionId(uint sessionId);

        [PreserveSig]
        int EnumerateBackgroundTasks(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            out uint taskCount,
            out IntPtr taskIds,
            out IntPtr taskNames);

        [PreserveSig]
        int ActivateBackgroundTask(ref Guid taskId);

        [PreserveSig]
        int StartServicing(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int StopServicing(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int StartSessionRedirection(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            uint sessionId);

        [PreserveSig]
        int StopSessionRedirection(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int GetPackageExecutionState(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            out PackageExecutionState packageExecutionState);

        [PreserveSig]
        int RegisterForPackageStateChanges(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            IPackageExecutionStateChangeNotification packageExecutionStateChangeNotification,
            out uint cookie);

        [PreserveSig]
        int UnregisterForPackageStateChanges(uint cookie);
    }

    [ComImport]
    [Guid("B1AEC16F-2383-4852-B0E9-8F0B1DC66B4D")]
    public class PackageDebugSettings
    {
    }

    public sealed class ActivationResult
    {
        public int HResult { get; set; }
        public uint ProcessId { get; set; }
    }

    public static class Activator
    {
        public static ActivationResult Activate(string appUserModelId, string arguments)
        {
            IApplicationActivationManager manager = null;
            uint processId = 0;
            int hresult;
            try
            {
                manager = (IApplicationActivationManager)new ApplicationActivationManager();
                hresult = manager.ActivateApplication(
                    appUserModelId,
                    arguments,
                    ActivateOptions.NoErrorUI,
                    out processId);
            }
            catch (Exception error)
            {
                hresult = Marshal.GetHRForException(error);
                processId = 0;
            }
            finally
            {
                if (manager != null && Marshal.IsComObject(manager))
                {
                    try
                    {
                        Marshal.FinalReleaseComObject(manager);
                    }
                    catch
                    {
                    }
                }
            }
            return new ActivationResult { HResult = hresult, ProcessId = processId };
        }
    }

    public sealed class PackageController : IDisposable
    {
        private IPackageDebugSettings settings;

        public PackageController()
        {
            settings = (IPackageDebugSettings)new PackageDebugSettings();
        }

        public int TerminateAllProcesses(string packageFullName)
        {
            return settings.TerminateAllProcesses(packageFullName);
        }

        public void Dispose()
        {
            if (settings != null && Marshal.IsComObject(settings))
            {
                Marshal.FinalReleaseComObject(settings);
            }
            settings = null;
        }
    }
}
'@

$controller = $null
$activatedProcess = $null
$activationCompleted = $false
$activationHResult = [int]0
$activatedProcessId = [uint32]0
try {
    Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
    $controller = New-Object CodexLiveExplorerPackageGuard.PackageController
    $activation = [CodexLiveExplorerPackageGuard.Activator]::Activate(
        $env:CLE_PACKAGE_AUMID,
        $env:CLE_PACKAGE_ARGUMENTS)
    $activationHResult = [int]$activation.HResult
    $activatedProcessId = [uint32]$activation.ProcessId
    $activationCompleted = $true
    if ($activationHResult -ge 0 -and $activatedProcessId -ne 0) {
        $activatedProcess = [Diagnostics.Process]::GetProcessById([int]$activatedProcessId)
        $null = $activatedProcess.Handle
    }
}
catch {
    if (-not $activationCompleted) {
        $activationHResult = [Runtime.InteropServices.Marshal]::GetHRForException($_.Exception)
        $activatedProcessId = [uint32]0
    }
    $activatedProcess = $null
}

$culture = [Globalization.CultureInfo]::InvariantCulture
$resultJson = '{"HResult":' + $activationHResult.ToString($culture) +
    ',"ProcessId":' + $activatedProcessId.ToString($culture) + '}'
[Console]::Out.WriteLine($resultJson)
[Console]::Out.Flush()

if ($activationHResult -lt 0 -or $activatedProcessId -eq 0 -or
    $null -eq $controller -or $null -eq $activatedProcess) {
    if ($null -ne $controller) {
        $controller.Dispose()
    }
    exit 1
}

$packageFullName = $env:CLE_PACKAGE_FULL_NAME
$armed = $false
$inputClosed = $false
$terminateRequested = $false
$terminationIssued = $false
$terminationSucceeded = $false
$processExited = $false
$monitorFailed = $false
$readTask = [Console]::In.ReadLineAsync()

try {
    while ($true) {
        if (-not $inputClosed -and $readTask.IsCompleted) {
            $line = $readTask.Result
            if ($null -eq $line) {
                $inputClosed = $true
                if ($armed) {
                    $terminateRequested = $true
                }
            }
            else {
                $controlMessage = $line.Trim().ToLowerInvariant()
                if ($controlMessage -eq 'arm') {
                    $armed = $true
                }
                elseif ($controlMessage -eq 'terminate') {
                    if ($armed) {
                        $terminateRequested = $true
                    }
                    else {
                        $inputClosed = $true
                    }
                }
                else {
                    $inputClosed = $true
                    if ($armed) {
                        $terminateRequested = $true
                    }
                }
                if (-not $inputClosed) {
                    $readTask = [Console]::In.ReadLineAsync()
                }
            }
        }

        if ($inputClosed -and -not $armed) {
            break
        }

        if ($terminateRequested -and -not $terminationIssued) {
            $terminationHResult = [int]$controller.TerminateAllProcesses($packageFullName)
            $terminationIssued = $true
            $terminationSucceeded = $terminationHResult -ge 0
            if (-not $terminationSucceeded) {
                $monitorFailed = $true
                break
            }
        }

        if ($activatedProcess.HasExited) {
            $processExited = $true
            break
        }
        Start-Sleep -Milliseconds 100
    }
}
catch {
    $monitorFailed = $true
}
finally {
    if ($armed -and -not $processExited -and -not $terminationSucceeded) {
        try {
            $null = $controller.TerminateAllProcesses($packageFullName)
        }
        catch {
        }
    }
    $activatedProcess.Dispose()
    $controller.Dispose()
}

if ($monitorFailed) {
    exit 2
}
exit 0
"#;

/// Quote one argument using the Windows C runtime/CommandLineToArgvW rules.
/// This is deliberately shell-independent: the resulting command line is
/// supplied directly to `ActivateApplication`.
fn quote_windows_argument(argument: &str) -> String {
    if !argument.is_empty()
        && !argument
            .chars()
            .any(|character| character == '"' || character.is_whitespace())
    {
        return argument.to_owned();
    }

    let mut quoted = String::with_capacity(argument.len().saturating_add(2));
    quoted.push('"');
    let mut backslashes = 0usize;
    for character in argument.chars() {
        match character {
            '\\' => backslashes = backslashes.saturating_add(1),
            '"' => {
                for _ in 0..backslashes.saturating_mul(2).saturating_add(1) {
                    quoted.push('\\');
                }
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                for _ in 0..backslashes {
                    quoted.push('\\');
                }
                backslashes = 0;
                quoted.push(character);
            }
        }
    }
    for _ in 0..backslashes.saturating_mul(2) {
        quoted.push('\\');
    }
    quoted.push('"');
    quoted
}

fn quote_windows_arguments(arguments: &[String]) -> String {
    arguments
        .iter()
        .map(|argument| quote_windows_argument(argument))
        .collect::<Vec<_>>()
        .join(" ")
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
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ProcessIdentitySnapshot {
    process_id: u32,
    creation_unix_millis: i64,
    executable_path: String,
    creation_matches: bool,
    executable_matches: bool,
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

/// Verify that an activation PID belongs to a newly-created instance of the
/// exact canonical official executable. All process inspection runs in the
/// trusted System32 PowerShell, and all dynamic values are passed through its
/// environment rather than interpolated into the program.
pub fn verify_process_identity(
    pid: u32,
    launched_after: SystemTime,
    official_executable: &Path,
) -> Result<(), ProcessGuardError> {
    #[cfg(not(windows))]
    {
        let _ = (pid, launched_after, official_executable);
        Err(ProcessGuardError::OwnershipUnknown)
    }
    #[cfg(windows)]
    {
        const MAX_IDENTITY_OUTPUT_BYTES: usize = 4 * 1024;

        if pid == 0 {
            return Err(ProcessGuardError::OwnershipMismatch);
        }
        let official_executable = dunce::canonicalize(official_executable)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if !official_executable.is_file() {
            return Err(ProcessGuardError::OwnershipUnknown);
        }
        let launched_after_millis: i64 = launched_after
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?
            .as_millis()
            .try_into()
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        let powershell = trusted_powershell().ok_or(ProcessGuardError::OwnershipUnknown)?;
        let output = StdCommand::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                PROCESS_IDENTITY_SCRIPT,
            ])
            .env("CLE_CODEX_PID", pid.to_string())
            .env(
                "CLE_CODEX_LAUNCHED_AFTER_MILLIS",
                launched_after_millis.to_string(),
            )
            .env("CLE_CODEX_EXE", official_executable.as_os_str())
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if !output.status.success()
            || output.stdout.is_empty()
            || output.stdout.len() > MAX_IDENTITY_OUTPUT_BYTES
        {
            return Err(ProcessGuardError::OwnershipUnknown);
        }
        let snapshot: ProcessIdentitySnapshot = serde_json::from_slice(&output.stdout)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if snapshot.process_id != pid
            || snapshot.creation_unix_millis < launched_after_millis
            || !snapshot.creation_matches
        {
            return Err(ProcessGuardError::OwnershipMismatch);
        }
        if !snapshot.executable_matches {
            return Err(ProcessGuardError::ExecutableMismatch);
        }
        let observed_executable = dunce::canonicalize(&snapshot.executable_path)
            .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if !observed_executable.is_file()
            || observed_executable.to_string_lossy().to_lowercase()
                != official_executable.to_string_lossy().to_lowercase()
        {
            return Err(ProcessGuardError::ExecutableMismatch);
        }
        Ok(())
    }
}

#[cfg(windows)]
const PROCESS_IDENTITY_SCRIPT: &str = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); $culture=[Globalization.CultureInfo]::InvariantCulture; $processId=[uint32]::Parse($env:CLE_CODEX_PID,$culture); $launchedAfter=[int64]::Parse($env:CLE_CODEX_LAUNCHED_AFTER_MILLIS,$culture); $process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$processId.ToString($culture)); if($null -eq $process -or $null -eq $process.ExecutablePath){throw 'process identity is unavailable'}; $actual=[IO.Path]::GetFullPath([string]$process.ExecutablePath); $target=[IO.Path]::GetFullPath($env:CLE_CODEX_EXE); $created=([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds(); [pscustomobject]@{ProcessId=[uint32]$process.ProcessId;CreationUnixMillis=[int64]$created;ExecutablePath=$actual;CreationMatches=($created -ge $launchedAfter);ExecutableMatches=$actual.Equals($target,[StringComparison]::OrdinalIgnoreCase)} | ConvertTo-Json -Compress";

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
    fn quotes_windows_arguments_with_spaces_and_empty_values() {
        assert_eq!(quote_windows_argument("plain"), "plain");
        assert_eq!(quote_windows_argument(""), r#""""#);
        assert_eq!(quote_windows_argument("two words"), r#""two words""#);
        assert_eq!(
            quote_windows_arguments(&["plain".to_owned(), "two words".to_owned()]),
            r#"plain "two words""#
        );
    }

    #[test]
    fn quotes_windows_arguments_with_quotes_and_backslashes() {
        assert_eq!(
            quote_windows_argument(r#"say "hello""#),
            r#""say \"hello\"""#
        );
        assert_eq!(
            quote_windows_argument(r"C:\Program Files\Codex\"),
            r#""C:\Program Files\Codex\\""#
        );
        assert_eq!(
            quote_windows_argument(r#"C:\path\"quoted"#),
            r#""C:\path\\\"quoted""#
        );
    }

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

    #[cfg(windows)]
    #[test]
    fn verifies_a_real_process_identity_and_creation_time() {
        let current = std::env::current_exe().expect("current executable");
        verify_process_identity(std::process::id(), UNIX_EPOCH, &current)
            .expect("verify current process identity");
        assert!(
            verify_process_identity(std::process::id(), SystemTime::now(), &current).is_err(),
            "a process created before the supplied launch time must be rejected"
        );
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
