//! Windowless entry point used by shortcuts and optional sign-in launch.
//!
//! The console-subsystem `code-codex.exe` remains available for diagnostics
//! and scripted use. This GUI wrapper preserves structured startup failures,
//! adds a redacted diagnostic snapshot, and shows a specific, copyable report.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

#[path = "../exit_codes.rs"]
mod exit_codes;
#[path = "../runtime_redaction.rs"]
#[allow(dead_code)]
mod redaction;
#[path = "../startup_diagnostics.rs"]
mod startup_diagnostics;
#[path = "../localization.rs"]
mod localization;

use startup_diagnostics::{StartupDiagnostic, parse_diagnostic};

const ERROR_TITLE: &str = "Code-Codex startup problem";
const MAX_CAPTURE_BYTES: usize = 256 * 1024;
const MAX_DIALOG_DETAILS_CHARS: usize = 12 * 1024;
const MAX_DIAGNOSTIC_REPORTS: usize = 10;

const DIALOG_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = $env:CLE_ERROR_TITLE
$form.ClientSize = New-Object System.Drawing.Size(620, 410)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowInTaskbar = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.TopMost = $true
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.Icon = [System.Drawing.SystemIcons]::Error

$icon = New-Object System.Windows.Forms.PictureBox
$icon.Location = New-Object System.Drawing.Point(22, 22)
$icon.Size = New-Object System.Drawing.Size(32, 32)
$icon.Image = [System.Drawing.SystemIcons]::Error.ToBitmap()
$icon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::StretchImage
$form.Controls.Add($icon)

$summary = New-Object System.Windows.Forms.Label
$summary.Location = New-Object System.Drawing.Point(70, 18)
$summary.Size = New-Object System.Drawing.Size(525, 44)
$summary.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 13)
$summary.Text = $env:CLE_ERROR_SUMMARY
$form.Controls.Add($summary)

$metadata = New-Object System.Windows.Forms.Label
$metadata.Location = New-Object System.Drawing.Point(22, 72)
$metadata.Size = New-Object System.Drawing.Size(573, 24)
$metadata.ForeColor = [System.Drawing.Color]::DimGray
$metadata.Text = ('{0}: {1}    {2}: {3}' -f $env:CLE_ERROR_STAGE_LABEL, $env:CLE_ERROR_STAGE, $env:CLE_ERROR_CODE_LABEL, $env:CLE_ERROR_CODE)
$form.Controls.Add($metadata)

$reasonTitle = New-Object System.Windows.Forms.Label
$reasonTitle.Location = New-Object System.Drawing.Point(22, 108)
$reasonTitle.Size = New-Object System.Drawing.Size(573, 20)
$reasonTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$reasonTitle.Text = 'Specific reason'
$form.Controls.Add($reasonTitle)

$reason = New-Object System.Windows.Forms.TextBox
$reason.Location = New-Object System.Drawing.Point(22, 132)
$reason.Size = New-Object System.Drawing.Size(573, 62)
$reason.Multiline = $true
$reason.ReadOnly = $true
$reason.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$reason.BackColor = [System.Drawing.SystemColors]::Window
$reason.Text = $env:CLE_ERROR_REASON -replace "(?<!`r)`n", "`r`n"
$form.Controls.Add($reason)

$actionTitle = New-Object System.Windows.Forms.Label
$actionTitle.Location = New-Object System.Drawing.Point(22, 210)
$actionTitle.Size = New-Object System.Drawing.Size(573, 20)
$actionTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$actionTitle.Text = 'Suggested action'
$form.Controls.Add($actionTitle)

$action = New-Object System.Windows.Forms.Label
$action.Location = New-Object System.Drawing.Point(22, 234)
$action.Size = New-Object System.Drawing.Size(573, 52)
$action.Text = $env:CLE_ERROR_GUIDANCE
$form.Controls.Add($action)

$report = New-Object System.Windows.Forms.Label
$report.Location = New-Object System.Drawing.Point(22, 294)
$report.Size = New-Object System.Drawing.Size(573, 36)
$report.ForeColor = [System.Drawing.Color]::DimGray
$report.AutoEllipsis = $true
$report.Text = if ([string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT)) {
    'The diagnostic report could not be saved.'
} else {
    $env:CLE_ERROR_REPORT_LABEL + ': ' + $env:CLE_ERROR_REPORT
}
$form.Controls.Add($report)

$copy = New-Object System.Windows.Forms.Button
$copy.Location = New-Object System.Drawing.Point(22, 350)
$copy.Size = New-Object System.Drawing.Size(118, 34)
$copy.Text = 'Copy details'
$copy.Add_Click({
    $details = $script:copyDetails
    try {
        if (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_LIVE_STATE) -and [IO.File]::Exists($env:CLE_ERROR_LIVE_STATE)) {
            $current = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($env:CLE_ERROR_LIVE_STATE))
            $details = $current.details
        } elseif (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT) -and
        [IO.File]::Exists($env:CLE_ERROR_REPORT)) {
            $details = [IO.File]::ReadAllText($env:CLE_ERROR_REPORT)
        }
    } catch {}
    [System.Windows.Forms.Clipboard]::SetText($details)
})
$form.Controls.Add($copy)

$open = New-Object System.Windows.Forms.Button
$open.Location = New-Object System.Drawing.Point(150, 350)
$open.Size = New-Object System.Drawing.Size(118, 34)
$open.Text = 'Open report'
$open.Enabled = -not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT)
$open.Add_Click({
    if (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT)) {
        $explorer = Join-Path $env:SystemRoot 'explorer.exe'
        & $explorer ('/select,"{0}"' -f $env:CLE_ERROR_REPORT)
    }
})
$form.Controls.Add($open)

$close = New-Object System.Windows.Forms.Button
$close.Location = New-Object System.Drawing.Point(477, 350)
$close.Size = New-Object System.Drawing.Size(118, 34)
$close.Text = 'Close'
$close.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($close)
$form.AcceptButton = $close
$form.CancelButton = $close

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 150
$script:lastLive = ''
$script:copyDetails = $env:CLE_ERROR_DETAILS
$timer.Add_Tick({
    try {
        if (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_LIVE_STATE) -and [IO.File]::Exists($env:CLE_ERROR_LIVE_STATE)) {
            $raw = [IO.File]::ReadAllText($env:CLE_ERROR_LIVE_STATE)
            if ($raw -ne $script:lastLive) {
                $state = ConvertFrom-Json -InputObject $raw
                $script:copyDetails = $state.details
                $reason.Text = $state.reason -replace "(?<!`r)`n", "`r`n"
                $action.Text = $state.guidance
                $script:lastLive = $raw
            }
        }
    } catch {}
})
$form.Add_FormClosed({ $timer.Stop() })
$timer.Start()
[void]$form.ShowDialog()
$timer.Dispose()
$form.Dispose()
"#;

fn main() -> ExitCode {
    let started = Instant::now();
    let current = match env::current_exe() {
        Ok(current) => current,
        Err(error) => {
            show_fallback_error(
                &format!(
                    "GUI executable lookup failed: os_code={:?}; kind={:?}",
                    error.raw_os_error(),
                    error.kind()
                ),
                started,
            );
            return ExitCode::FAILURE;
        }
    };
    let command_line = current.with_file_name("code-codex.exe");
    if !command_line.is_file() {
        show_fallback_error(
            "The sibling code-codex.exe is missing or is not a regular file.",
            started,
        );
        return ExitCode::FAILURE;
    }

    let mut command = Command::new(&command_line);
    command
        .args(env::args_os().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_hidden(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            show_fallback_error(
                &format!(
                    "Console launcher spawn failed: os_code={:?}; kind={:?}",
                    error.raw_os_error(),
                    error.kind()
                ),
                started,
            );
            return ExitCode::FAILURE;
        }
    };
    let child_pid = child.id();
    let stdout_reader = child
        .stdout
        .take()
        .map(|stdout| thread::spawn(move || read_bounded_tail(stdout, MAX_CAPTURE_BYTES)));
    let live = Arc::new(Mutex::new(None::<StartupDiagnostic>));
    let reader_live = live.clone();
    let stderr_reader = child.stderr.take().map(|stderr| {
        thread::spawn(move || read_live_tail(stderr, MAX_CAPTURE_BYTES, reader_live))
    });

    // A failure marker arrives before expensive post-failure checks finish.
    let live_directory = tempfile::Builder::new()
        .prefix("CodeCodex-Error-")
        .tempdir_in(
            workspace_service::application_paths::temp_root()
                .unwrap_or_else(|_| std::env::temp_dir()),
        )
        .ok();
    let live_state = live_directory.as_ref().map(|d| d.path().join("state.json"));
    let mut last = None;
    let mut report_path = None;
    let mut dialog = None;
    let mut dialog_attempted = false;
    let status = loop {
        let next = live.lock().ok().and_then(|v| v.clone());
        if next.is_some() && next != last {
            let diagnostic = next.as_ref().expect("diagnostic present");
            let report = format_report(
                diagnostic,
                None,
                "Automatic checks are in progress; see Reason above.",
                &format!(
                    "GUI PID: {}; child PID: {}; runtime: {} ms; child still running",
                    std::process::id(),
                    child_pid,
                    started.elapsed().as_millis()
                ),
            );
            if report_path.is_none() {
                report_path = persist_report(&report).ok();
            } else if let Some(path) = report_path.as_ref() {
                let _ = replace_report(path, report.as_bytes());
            }
            if let Some(path) = live_state.as_ref() {
                let _ = write_live_state(path, diagnostic, &report);
            }
            if !dialog_attempted {
                dialog_attempted = true;
                dialog = spawn_startup_error(
                    diagnostic,
                    &report,
                    report_path.as_deref(),
                    live_state.as_deref(),
                );
            }
            last = next;
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Err(error) => break Err(error),
            _ => thread::sleep(Duration::from_millis(50)),
        }
    };
    let _stdout = join_capture(stdout_reader);
    let stderr = join_capture(stderr_reader);
    match status {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => {
            let code = status.code();
            let stderr_text = String::from_utf8_lossy(&stderr);
            let parsed = parse_diagnostic(&stderr_text);
            let marker_present = parsed.is_some();
            let diagnostic = parsed.unwrap_or_else(|| {
                let mut fallback = live
                    .lock()
                    .ok()
                    .and_then(|v| v.clone())
                    .unwrap_or_else(|| fallback_diagnostic(code));
                fallback.reason.push_str(&format!(
                    "\nUnstructured captured stderr (bounded and redacted):\n{}\n",
                    redaction::text(&stderr_text)
                ));
                fallback
            });
            let diagnosis = "Failure-triggered automatic self-check results are included above. The launch endpoint was inspected only where ownership permitted.".to_owned();
            let report = format_report(
                &diagnostic,
                code,
                &diagnosis,
                &format!(
                    "GUI PID: {}; child PID: {}; runtime: {} ms; structured diagnostic: {}; captured stderr: {} bytes",
                    std::process::id(),
                    child_pid,
                    started.elapsed().as_millis(),
                    marker_present,
                    stderr.len()
                ),
            );
            if report_path.is_none() {
                report_path = persist_report(&report).ok();
            } else if let Some(path) = report_path.as_ref() {
                let _ = replace_report(path, report.as_bytes());
            }
            if let Some(path) = live_state.as_ref() {
                let _ = write_live_state(path, &diagnostic, &report);
            }
            if !dialog_attempted {
                show_startup_error(&diagnostic, &report, report_path.as_deref());
            } else if let Some(mut window) = dialog {
                let _ = window.wait();
            }
            ExitCode::from(normalize_failure_code(code))
        }
        Err(error) => {
            let diagnostic = StartupDiagnostic::new(
                "CC-START-LAUNCHER-001",
                "Waiting for Code-Codex",
                "The Code-Codex launcher stopped unexpectedly",
                format!("The launcher process could not be monitored ({error})"),
                "Run the Code-Codex installer again to repair this installation.",
            );
            let diagnosis =
                "Automatic checks will run after the initial error window is opened.".to_owned();
            let report = format_report(
                &diagnostic,
                None,
                &diagnosis,
                &format!(
                    "GUI PID: {}; child PID: {}; runtime: {} ms; child wait failed",
                    std::process::id(),
                    child_pid,
                    started.elapsed().as_millis()
                ),
            );
            let report_path = persist_report(&report).ok();
            show_startup_error(&diagnostic, &report, report_path.as_deref());
            ExitCode::FAILURE
        }
    }
}

fn replace_report(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes)?;
    fs::rename(temporary, path)
}

fn write_live_state(path: &Path, diagnostic: &StartupDiagnostic, details: &str) -> io::Result<()> {
    let state = serde_json::json!({"reason":live_dialog_reason(&diagnostic.reason),"guidance":localization::text(&diagnostic.guidance),"details":details});
    replace_report(path, &serde_json::to_vec(&state)?)
}

fn live_dialog_reason(reason: &str) -> String {
    let chars: Vec<_> = reason.chars().collect();
    if chars.len() <= MAX_DIALOG_DETAILS_CHARS {
        return reason.to_owned();
    }
    let half = MAX_DIALOG_DETAILS_CHARS / 2;
    format!(
        "{}\n[Middle details retained in Copy details / Open report]\n{}",
        chars[..half].iter().collect::<String>(),
        chars[chars.len() - half..].iter().collect::<String>()
    )
}

fn read_live_tail(
    mut reader: impl Read,
    limit: usize,
    live: Arc<Mutex<Option<StartupDiagnostic>>>,
) -> io::Result<Vec<u8>> {
    let mut tail = Vec::new();
    let mut buffer = [0u8; 4096];
    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        tail.extend_from_slice(&buffer[..n]);
        if tail.len() > limit {
            tail.drain(..tail.len() - limit);
        }
        if let Some(diagnostic) = parse_diagnostic(&String::from_utf8_lossy(&tail)) {
            if let Ok(mut state) = live.lock() {
                *state = Some(diagnostic);
            }
        }
    }
    Ok(tail)
}

fn read_bounded_tail(mut reader: impl Read, limit: usize) -> io::Result<Vec<u8>> {
    let mut tail = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        if read >= limit {
            tail.clear();
            tail.extend_from_slice(&buffer[read - limit..read]);
            continue;
        }
        if tail.len() + read > limit {
            tail.drain(..tail.len() + read - limit);
        }
        tail.extend_from_slice(&buffer[..read]);
    }
    Ok(tail)
}

fn join_capture(reader: Option<thread::JoinHandle<io::Result<Vec<u8>>>>) -> Vec<u8> {
    reader
        .and_then(|reader| reader.join().ok())
        .and_then(Result::ok)
        .unwrap_or_default()
}

fn run_diagnose(command_line: &Path) -> String {
    let mut command = Command::new(command_line);
    command
        .args(["diagnose", "--full"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_hidden(&mut command);
    match command.spawn() {
        Ok(mut child) => {
            let stdout = child
                .stdout
                .take()
                .map(|r| thread::spawn(move || read_bounded_tail(r, MAX_CAPTURE_BYTES)));
            let stderr = child
                .stderr
                .take()
                .map(|r| thread::spawn(move || read_bounded_tail(r, MAX_CAPTURE_BYTES)));
            let started = Instant::now();
            let status = loop {
                match child.try_wait() {
                    Ok(Some(status)) => break Some(status),
                    _ if started.elapsed() >= Duration::from_secs(15) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break None;
                    }
                    Err(_) => break None,
                    _ => thread::sleep(Duration::from_millis(50)),
                }
            };
            let stdout = bounded_text(&join_capture(stdout), MAX_CAPTURE_BYTES);
            let stderr = bounded_text(&join_capture(stderr), MAX_CAPTURE_BYTES);
            if status.is_none() {
                return format!(
                    "Automatic self-check timed out after 15 seconds. Partial output:\n{stdout}\n{stderr}"
                );
            }
            if !stdout.trim().is_empty() {
                stdout
            } else {
                if stderr.trim().is_empty() {
                    format!(
                        "diagnose exited with status {} and returned no details",
                        status.expect("completed")
                    )
                } else {
                    stderr
                }
            }
        }
        Err(error) => format!("diagnose could not be started ({error})"),
    }
}

fn bounded_text(bytes: &[u8], limit: usize) -> String {
    let start = bytes.len().saturating_sub(limit);
    String::from_utf8_lossy(&bytes[start..]).into_owned()
}

fn bounded_dialog_details(details: &str) -> String {
    let mut text: String = details.chars().take(MAX_DIALOG_DETAILS_CHARS).collect();
    if details.chars().count() > MAX_DIALOG_DETAILS_CHARS {
        text.push_str("\n\n[Open the saved report for the remaining diagnostic details.]\n");
    }
    text
}

fn format_report(
    diagnostic: &StartupDiagnostic,
    exit_code: Option<i32>,
    diagnosis: &str,
    launcher_context: &str,
) -> String {
    let exit_code = exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unavailable".to_owned());
    let raw=format!(
        "Code-Codex startup diagnostic\n\nCode-Codex version: {}\nSupport code: {}\nStage: {}\nSummary: {}\nReason: {}\nSuggested action: {}\nProcess exit code: {}\nGUI launcher process: {}\n\nPost-failure installation check (cdp.notRequested means this separate check was not given the launch's random port; the actual endpoint observations are in Reason above):\n{}\n",
        env!("CARGO_PKG_VERSION"),
        diagnostic.code,
        diagnostic.stage,
        diagnostic.summary,
        diagnostic.reason,
        diagnostic.guidance,
        exit_code,
        launcher_context,
        diagnosis.trim(),
    );
    format!("{}\n{}: {} / revision {}\n{}: {}\n{}: {}\n{}: {}\n\n{}:\n{}",
        localization::text("Code-Codex startup diagnostic"),localization::text("UI language"),localization::locale().as_str(),localization::preference().revision,
        localization::text("Stage"),localization::text(&diagnostic.stage),localization::text("Summary"),localization::text(&diagnostic.summary),
        localization::text("Suggested action"),localization::text(&diagnostic.guidance),localization::text("Original diagnostic evidence"),raw)
}

fn persist_report(report: &str) -> io::Result<PathBuf> {
    let directory = workspace_service::application_paths::log_root("diagnostics")?;
    workspace_service::application_paths::validate_directory_path(&directory)?;
    fs::create_dir_all(&directory)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let path = directory.join(format!("startup-{timestamp}-{}.txt", std::process::id()));
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, report)?;
    fs::rename(&temporary, &path)?;
    prune_old_reports(&directory, &path);
    Ok(path)
}

fn prune_old_reports(directory: &Path, keep: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut reports: Vec<_> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path != keep
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("startup-") && name.ends_with(".txt"))
        })
        .collect();
    reports.sort();
    let remove_count = reports
        .len()
        .saturating_sub(MAX_DIAGNOSTIC_REPORTS.saturating_sub(1));
    for report in reports.into_iter().take(remove_count) {
        let _ = fs::remove_file(report);
    }
}

fn fallback_diagnostic(code: Option<i32>) -> StartupDiagnostic {
    match code.and_then(|code| u8::try_from(code).ok()) {
        Some(exit_codes::UNSUPPORTED_VERSION) => StartupDiagnostic::new(
            "CC-START-COMPAT-001",
            "Checking compatibility",
            "This Codex Desktop version is not supported",
            "The launcher did not return structured compatibility details.",
            "Update Code-Codex or install a supported Codex Desktop version.",
        ),
        Some(exit_codes::ALREADY_RUNNING) => StartupDiagnostic::new(
            "CC-START-STATE-001",
            "Checking the Codex process",
            "Codex Desktop is already running without Code-Codex",
            "The existing Codex process was not started through Code-Codex.",
            "Close Codex Desktop, then start it from the Codex or Code-Codex desktop shortcut.",
        ),
        Some(exit_codes::STARTUP_FAILURE) => StartupDiagnostic::new(
            "CC-START-UNKNOWN-001",
            "Starting required components",
            "A required Code-Codex component could not start",
            "The launcher did not return structured startup details.",
            "Copy the diagnostic details and include them when reporting this problem.",
        ),
        _ => StartupDiagnostic::new(
            "CC-START-UNKNOWN-002",
            "Running Code-Codex",
            "Code-Codex stopped because of an unexpected error",
            "The launcher did not return structured error details.",
            "Copy the diagnostic details and include them when reporting this problem.",
        ),
    }
}

fn normalize_failure_code(code: Option<i32>) -> u8 {
    code.and_then(|code| u8::try_from(code).ok())
        .filter(|code| *code != 0)
        .unwrap_or(exit_codes::GENERIC_FAILURE)
}

#[cfg(windows)]
fn show_startup_error(diagnostic: &StartupDiagnostic, details: &str, report_path: Option<&Path>) {
    let state_directory = tempfile::Builder::new()
        .prefix("CodeCodex-Error-")
        .tempdir_in(
            workspace_service::application_paths::temp_root()
                .unwrap_or_else(|_| std::env::temp_dir()),
        )
        .ok();
    let state_path = state_directory
        .as_ref()
        .map(|d| d.path().join("state.json"));
    let mut initial = diagnostic.clone();
    initial
        .reason
        .push_str("\nAutomatic self-check: running; original error retained.\n");
    if let Some(path) = state_path.as_ref() {
        let _ = write_live_state(path, &initial, details);
    }
    let window = spawn_startup_error(&initial, details, report_path, state_path.as_deref());
    // Fallback path: the core may not even start. Keep the same window and
    // inspect the GUI environment; missing core prevents deeper checks.
    let mut final_diagnostic = initial;
    let core = env::current_exe()
        .ok()
        .map(|p| p.with_file_name("code-codex.exe"));
    let check = core
        .as_ref()
        .filter(|p| p.is_file())
        .map(|p| run_diagnose(p))
        .unwrap_or_else(|| {
            "Full core checks skipped: core executable is missing or unavailable.".to_owned()
        });
    final_diagnostic.reason.push_str(&format!("GUI environment: local data configured={}; trusted PowerShell available={}.\n{check}\nAutomatic self-check: completed with the statuses shown above. No automatic repair was performed.\n",env::var_os("LOCALAPPDATA").is_some(),trusted_system32_executable(r"WindowsPowerShell\v1.0\powershell.exe").is_some()));
    let report = format!(
        "{details}\nFallback automatic checks:\n{}",
        final_diagnostic.reason
    );
    if let Some(path) = report_path {
        let _ = replace_report(path, report.as_bytes());
    }
    if let Some(path) = state_path.as_ref() {
        let _ = write_live_state(path, &final_diagnostic, &report);
    }
    if let Some(mut child) = window {
        let _ = child.wait();
    }
}

#[cfg(windows)]
fn spawn_startup_error(
    diagnostic: &StartupDiagnostic,
    details: &str,
    report_path: Option<&Path>,
    live_state: Option<&Path>,
) -> Option<std::process::Child> {
    let Some(powershell) = trusted_system32_executable(r"WindowsPowerShell\v1.0\powershell.exe")
    else {
        return None;
    };
    let dialog_script=localization::dialog_script(DIALOG_SCRIPT);
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &dialog_script,
        ])
        .env("CLE_ERROR_TITLE", localization::text(ERROR_TITLE))
        .env("CLE_ERROR_SUMMARY", localization::text(&diagnostic.summary))
        .env("CLE_ERROR_STAGE", localization::text(&diagnostic.stage))
        .env("CLE_ERROR_CODE", &diagnostic.code)
        .env("CLE_ERROR_STAGE_LABEL",localization::text("Stage"))
        .env("CLE_ERROR_CODE_LABEL",localization::text("Support code"))
        .env("CLE_ERROR_REPORT_LABEL",localization::text("Diagnostic report"))
        .env(
            "CLE_ERROR_REASON",
            bounded_dialog_details(&diagnostic.reason),
        )
        .env("CLE_ERROR_GUIDANCE", localization::text(&diagnostic.guidance))
        .env("CLE_ERROR_DETAILS", bounded_dialog_details(details))
        .env(
            "CLE_ERROR_REPORT",
            report_path.map(Path::as_os_str).unwrap_or_default(),
        )
        .env(
            "CLE_ERROR_LIVE_STATE",
            live_state.map(Path::as_os_str).unwrap_or_default(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_hidden(&mut command);
    command.spawn().ok()
}

#[cfg(not(windows))]
fn spawn_startup_error(
    _: &StartupDiagnostic,
    _: &str,
    _: Option<&Path>,
    _: Option<&Path>,
) -> Option<std::process::Child> {
    None
}

#[cfg(not(windows))]
fn show_startup_error(diagnostic: &StartupDiagnostic, details: &str, report_path: Option<&Path>) {
    eprintln!(
        "{ERROR_TITLE}: {}\n{}\nReport: {}\n\n{}",
        diagnostic.summary,
        diagnostic.reason,
        report_path
            .map(|path| path.display().to_string())
            .unwrap_or_else(|| "unavailable".to_owned()),
        details
    );
}

fn show_fallback_error(reason: &str, started: Instant) {
    let diagnostic = StartupDiagnostic::new(
        "CC-START-LAUNCHER-002",
        "Opening Code-Codex",
        "The Code-Codex launcher could not start",
        reason,
        "Run the Code-Codex installer again to repair this installation.",
    );
    let report = format_report(
        &diagnostic,
        None,
        "diagnose was unavailable",
        &format!(
            "GUI PID: {}; child PID: not started; runtime: {} ms",
            std::process::id(),
            started.elapsed().as_millis()
        ),
    );
    let report_path = persist_report(&report).ok();
    show_startup_error(&diagnostic, &report, report_path.as_deref());
}

#[cfg(windows)]
fn configure_hidden(command: &mut Command) {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn configure_hidden(_command: &mut Command) {}

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
    fn streamed_failure_is_available_before_eof_and_preserves_final_copy() {
        let first = StartupDiagnostic::new(
            "CC-START-PROCESS-006",
            "Identity",
            "Failed",
            "FIRST_FAILURE",
            "Copy",
        );
        let mut final_report = first.clone();
        final_report
            .reason
            .push_str("\nAutomatic self-check: completed\nFINAL_EVIDENCE");
        let live = Arc::new(Mutex::new(None));
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("port");
        let mut writer =
            std::net::TcpStream::connect(listener.local_addr().expect("address")).expect("writer");
        let reader = listener.accept().expect("reader").0;
        let sink = live.clone();
        let task = thread::spawn(move || read_live_tail(reader, MAX_CAPTURE_BYTES, sink));
        use std::io::Write;
        writeln!(writer, "{}", first.encoded_line().expect("marker")).expect("send");
        let deadline = Instant::now() + Duration::from_secs(2);
        while live.lock().expect("lock").is_none() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(*live.lock().expect("lock"), Some(first));
        assert!(
            !task.is_finished(),
            "window data available while diagnostics still run"
        );
        writeln!(writer, "{}", final_report.encoded_line().expect("marker")).expect("send final");
        drop(writer);
        task.join().expect("join").expect("capture");
        assert_eq!(*live.lock().expect("lock"), Some(final_report.clone()));
        let directory = tempfile::tempdir().expect("temp");
        let path = directory.path().join("state.json");
        let full = format_report(&final_report, Some(1), "{}", "GUI PID: 1");
        write_live_state(&path, &final_report, &full).expect("state");
        let state: serde_json::Value =
            serde_json::from_slice(&fs::read(path).expect("read")).expect("JSON");
        assert!(
            state["details"]
                .as_str()
                .expect("copy")
                .contains("FIRST_FAILURE")
        );
        assert!(
            state["details"]
                .as_str()
                .expect("copy")
                .contains("FINAL_EVIDENCE")
        );
    }

    #[test]
    fn long_live_reason_keeps_original_and_latest_evidence() {
        let reason = format!("FIRST_FAILURE{}FINAL_CHECK", "诊".repeat(20000));
        let visible = live_dialog_reason(&reason);
        assert!(visible.contains("FIRST_FAILURE"));
        assert!(visible.contains("FINAL_CHECK"));
        assert!(visible.contains("Middle details retained"));
    }
    use std::io::Cursor;

    #[test]
    fn bounded_reader_keeps_only_the_latest_bytes() {
        let output = read_bounded_tail(Cursor::new(b"0123456789"), 6).expect("bounded output");
        assert_eq!(output, b"456789");
    }

    #[test]
    fn structured_failure_is_preferred_over_exit_code_fallback() {
        let diagnostic = StartupDiagnostic::new(
            "CC-START-APP-001",
            "Finding the App Server",
            "The Codex App Server was not found",
            "the Codex App Server executable was not found",
            "Repair Codex Desktop.",
        );
        let output = diagnostic.encoded_line().expect("encoded diagnostic");
        assert_eq!(parse_diagnostic(&output), Some(diagnostic));
    }

    #[test]
    fn startup_exit_code_retains_useful_fallback() {
        let diagnostic = fallback_diagnostic(Some(i32::from(exit_codes::STARTUP_FAILURE)));
        assert_eq!(diagnostic.code, "CC-START-UNKNOWN-001");
        assert!(diagnostic.summary.contains("required"));
    }

    #[test]
    fn report_contains_support_fields_and_version() {
        let diagnostic = fallback_diagnostic(Some(i32::from(exit_codes::STARTUP_FAILURE)));
        let report = format_report(
            &diagnostic,
            Some(22),
            "{\"status\":\"available\"}",
            "GUI PID: 1",
        );
        assert!(report.contains("Support code: CC-START-UNKNOWN-001"));
        assert!(report.contains("Code-Codex version:"));
        assert!(report.contains("Post-failure installation check"));
        assert!(report.contains("cdp.notRequested"));
    }

    #[test]
    fn detailed_process_report_survives_capture_and_copy_while_dialog_is_bounded() {
        let mut reason = "过程信息\n".repeat(10_000);
        reason.push_str("FINAL_PROCESS_QUERY_EXCEPTION");
        let diagnostic = StartupDiagnostic::new(
            "CC-START-PROCESS-006",
            "Verifying the Codex process",
            "Listener query failed",
            reason,
            "Copy details",
        );
        let encoded = diagnostic.encoded_line().expect("encoded");
        assert!(encoded.len() > 64 * 1024);
        let captured = read_bounded_tail(Cursor::new(encoded.as_bytes()), MAX_CAPTURE_BYTES)
            .expect("captured");
        let parsed = parse_diagnostic(std::str::from_utf8(&captured).expect("UTF-8"))
            .expect("diagnostic retained");
        let report = format_report(&parsed, Some(1), "{}", "GUI PID: 1");
        assert!(report.contains("FINAL_PROCESS_QUERY_EXCEPTION"));
        assert!(!bounded_dialog_details(&report).contains("FINAL_PROCESS_QUERY_EXCEPTION"));
    }

    #[test]
    fn dialog_environment_details_are_bounded_without_breaking_unicode() {
        let details = "诊".repeat(MAX_DIALOG_DETAILS_CHARS + 10);
        let bounded = bounded_dialog_details(&details);
        assert!(bounded.starts_with(&"诊".repeat(MAX_DIALOG_DETAILS_CHARS)));
        assert!(bounded.contains("Open the saved report"));
    }
}
