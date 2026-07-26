//! Windowless entry point used by shortcuts and optional sign-in launch.
//!
//! The console-subsystem `code-codex.exe` remains available for
//! diagnostics and scripted use. This tiny GUI-subsystem wrapper starts that
//! same executable without allocating a console window, forwards its exit
//! status, and presents categorized startup failures to shortcut users.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

#[path = "../exit_codes.rs"]
mod exit_codes;

const ERROR_TITLE: &str = "Code-Codex";

fn main() -> ExitCode {
    let Ok(current) = env::current_exe() else {
        show_error(message_for_exit_code(None));
        return ExitCode::FAILURE;
    };
    let command_line = current.with_file_name("code-codex.exe");
    if !command_line.is_file() {
        show_error(message_for_exit_code(None));
        return ExitCode::FAILURE;
    }

    let mut command = Command::new(command_line);
    command
        .args(env::args_os().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.status() {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => {
            let code = status.code();
            show_error(message_for_exit_code(code));
            ExitCode::from(normalize_failure_code(code))
        }
        Err(_) => {
            show_error(message_for_exit_code(None));
            ExitCode::FAILURE
        }
    }
}

fn message_for_exit_code(code: Option<i32>) -> &'static str {
    match code.and_then(|code| u8::try_from(code).ok()) {
        Some(exit_codes::UNSUPPORTED_VERSION) => {
            "This Codex Desktop version is not supported by Code-Codex. Run code-codex.exe diagnose from a terminal for compatibility details."
        }
        Some(exit_codes::ALREADY_RUNNING) => {
            "Codex Desktop is already running without Code-Codex. Close Codex Desktop, then start it again from the official Codex desktop shortcut."
        }
        Some(exit_codes::STARTUP_FAILURE) => {
            "Code-Codex could not start its App Server or another required startup component. Run code-codex.exe diagnose from a terminal for details."
        }
        _ => {
            "Code-Codex stopped because of an unexpected error. Run code-codex.exe from a terminal for diagnostic output."
        }
    }
}

fn normalize_failure_code(code: Option<i32>) -> u8 {
    code.and_then(|code| u8::try_from(code).ok())
        .filter(|code| *code != 0)
        .unwrap_or(exit_codes::GENERIC_FAILURE)
}

#[cfg(windows)]
fn show_error(message: &str) {
    const DIALOG_SCRIPT: &str = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:CLE_ERROR_MESSAGE,$env:CLE_ERROR_TITLE,[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error)";
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
        .env("CLE_ERROR_MESSAGE", message)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
    let _ = command.status();
}

#[cfg(not(windows))]
fn show_error(message: &str) {
    eprintln!("{ERROR_TITLE}: {message}");
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
    fn stable_exit_codes_select_visible_failure_categories() {
        assert!(
            message_for_exit_code(Some(i32::from(exit_codes::UNSUPPORTED_VERSION)))
                .contains("not supported")
        );
        assert!(
            message_for_exit_code(Some(i32::from(exit_codes::ALREADY_RUNNING)))
                .contains("already running")
        );
        assert!(
            message_for_exit_code(Some(i32::from(exit_codes::STARTUP_FAILURE)))
                .contains("App Server")
        );
        assert!(message_for_exit_code(Some(99)).contains("unexpected error"));
        assert_eq!(normalize_failure_code(None), exit_codes::GENERIC_FAILURE);
    }
}
