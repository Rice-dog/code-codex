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
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

#[path = "../exit_codes.rs"]
mod exit_codes;
#[path = "../startup_diagnostics.rs"]
mod startup_diagnostics;

use startup_diagnostics::{StartupDiagnostic, parse_diagnostic};

const ERROR_TITLE: &str = "Code-Codex startup problem";
const MAX_CAPTURE_BYTES: usize = 64 * 1024;
const MAX_DIALOG_DETAILS_CHARS: usize = 12 * 1024;
const MAX_DIAGNOSTIC_REPORTS: usize = 10;
const DIAGNOSTIC_DIRECTORY: &str = "CodeCodex\\diagnostics";

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
$metadata.Text = ('Stage: {0}    Support code: {1}' -f $env:CLE_ERROR_STAGE, $env:CLE_ERROR_CODE)
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
$reason.Text = $env:CLE_ERROR_REASON
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
    'Diagnostic report: ' + $env:CLE_ERROR_REPORT
}
$form.Controls.Add($report)

$copy = New-Object System.Windows.Forms.Button
$copy.Location = New-Object System.Drawing.Point(22, 350)
$copy.Size = New-Object System.Drawing.Size(118, 34)
$copy.Text = 'Copy details'
$copy.Add_Click({
    $details = if (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT) -and
        [IO.File]::Exists($env:CLE_ERROR_REPORT)) {
        [IO.File]::ReadAllText($env:CLE_ERROR_REPORT)
    } else {
        $env:CLE_ERROR_DETAILS
    }
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

[void]$form.ShowDialog()
$form.Dispose()
"#;

fn main() -> ExitCode {
    let Ok(current) = env::current_exe() else {
        show_fallback_error();
        return ExitCode::FAILURE;
    };
    let command_line = current.with_file_name("code-codex.exe");
    if !command_line.is_file() {
        show_fallback_error();
        return ExitCode::FAILURE;
    }

    let mut command = Command::new(&command_line);
    command
        .args(env::args_os().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_hidden(&mut command);

    let Ok(mut child) = command.spawn() else {
        show_fallback_error();
        return ExitCode::FAILURE;
    };
    let stdout_reader = child
        .stdout
        .take()
        .map(|stdout| thread::spawn(move || read_bounded_tail(stdout, MAX_CAPTURE_BYTES)));
    let stderr_reader = child
        .stderr
        .take()
        .map(|stderr| thread::spawn(move || read_bounded_tail(stderr, MAX_CAPTURE_BYTES)));

    let status = child.wait();
    let _stdout = join_capture(stdout_reader);
    let stderr = join_capture(stderr_reader);
    match status {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => {
            let code = status.code();
            let stderr_text = String::from_utf8_lossy(&stderr);
            let diagnostic =
                parse_diagnostic(&stderr_text).unwrap_or_else(|| fallback_diagnostic(code));
            let diagnosis = run_diagnose(&command_line);
            let report = format_report(&diagnostic, code, &diagnosis);
            let report_path = persist_report(&report).ok();
            show_startup_error(&diagnostic, &report, report_path.as_deref());
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
            let diagnosis = run_diagnose(&command_line);
            let report = format_report(&diagnostic, None, &diagnosis);
            let report_path = persist_report(&report).ok();
            show_startup_error(&diagnostic, &report, report_path.as_deref());
            ExitCode::FAILURE
        }
    }
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
        .arg("diagnose")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_hidden(&mut command);
    match command.output() {
        Ok(output) => {
            let stdout = bounded_text(&output.stdout, MAX_CAPTURE_BYTES);
            if !stdout.trim().is_empty() {
                stdout
            } else {
                let stderr = bounded_text(&output.stderr, MAX_CAPTURE_BYTES);
                if stderr.trim().is_empty() {
                    format!(
                        "diagnose exited with status {} and returned no details",
                        output.status
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
) -> String {
    let exit_code = exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unavailable".to_owned());
    format!(
        "Code-Codex startup diagnostic\n\nCode-Codex version: {}\nSupport code: {}\nStage: {}\nSummary: {}\nReason: {}\nSuggested action: {}\nProcess exit code: {}\n\nRedacted diagnose result:\n{}\n",
        env!("CARGO_PKG_VERSION"),
        diagnostic.code,
        diagnostic.stage,
        diagnostic.summary,
        diagnostic.reason,
        diagnostic.guidance,
        exit_code,
        diagnosis.trim(),
    )
}

fn persist_report(report: &str) -> io::Result<PathBuf> {
    let local_app_data = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "LOCALAPPDATA is unavailable"))?;
    let directory = local_app_data.join(DIAGNOSTIC_DIRECTORY);
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
    let Some(powershell) = trusted_system32_executable(r"WindowsPowerShell\v1.0\powershell.exe")
    else {
        return;
    };
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            DIALOG_SCRIPT,
        ])
        .env("CLE_ERROR_TITLE", ERROR_TITLE)
        .env("CLE_ERROR_SUMMARY", &diagnostic.summary)
        .env("CLE_ERROR_STAGE", &diagnostic.stage)
        .env("CLE_ERROR_CODE", &diagnostic.code)
        .env("CLE_ERROR_REASON", &diagnostic.reason)
        .env("CLE_ERROR_GUIDANCE", &diagnostic.guidance)
        .env("CLE_ERROR_DETAILS", bounded_dialog_details(details))
        .env(
            "CLE_ERROR_REPORT",
            report_path.map(Path::as_os_str).unwrap_or_default(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_hidden(&mut command);
    let _ = command.status();
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

fn show_fallback_error() {
    let diagnostic = StartupDiagnostic::new(
        "CC-START-LAUNCHER-002",
        "Opening Code-Codex",
        "The Code-Codex launcher could not start",
        "The installed console launcher was missing or could not be opened.",
        "Run the Code-Codex installer again to repair this installation.",
    );
    let report = format_report(&diagnostic, None, "diagnose was unavailable");
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
        let report = format_report(&diagnostic, Some(22), "{\"status\":\"available\"}");
        assert!(report.contains("Support code: CC-START-UNKNOWN-001"));
        assert!(report.contains("Code-Codex version:"));
        assert!(report.contains("Redacted diagnose result:"));
    }

    #[test]
    fn dialog_environment_details_are_bounded_without_breaking_unicode() {
        let details = "诊".repeat(MAX_DIALOG_DETAILS_CHARS + 10);
        let bounded = bounded_dialog_details(&details);
        assert!(bounded.starts_with(&"诊".repeat(MAX_DIALOG_DETAILS_CHARS)));
        assert!(bounded.contains("Open the saved report"));
    }
}
