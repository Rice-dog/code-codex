//! Clickable, windowless entry point for the portable uninstaller script.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::process::{ExitCode, ExitStatus};
use std::time::{SystemTime, UNIX_EPOCH};

#[path = "../gui_support.rs"]
mod gui_support;
#[path = "../script_wrapper.rs"]
mod script_wrapper;

const TITLE: &str = "Code-Codex uninstall";
const UNINSTALL_SCRIPT_NAME: &str = "Uninstall-CodeCodex.ps1";
const EMBEDDED_UNINSTALL_SCRIPT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../installer/Uninstall-CodeCodex.ps1"
));

fn main() -> ExitCode {
    let arguments: Vec<_> = env::args_os().skip(1).collect();
    let result = run_uninstall(&arguments);
    match result {
        Ok(status) if status.success() => {
            gui_support::show_dialog(TITLE, "Code-Codex was uninstalled successfully.", false);
            ExitCode::SUCCESS
        }
        Ok(status) => {
            let detail = status.code().map_or_else(
                || "without an exit code".to_owned(),
                |code| format!("with exit code {code}"),
            );
            gui_support::show_dialog(
                TITLE,
                &format!(
                    "Code-Codex could not be uninstalled ({detail}). Installed files were left in place where possible."
                ),
                true,
            );
            ExitCode::FAILURE
        }
        Err(error) => {
            gui_support::show_dialog(
                TITLE,
                &format!("Code-Codex could not be uninstalled: {error}"),
                true,
            );
            ExitCode::FAILURE
        }
    }
}

fn run_uninstall(arguments: &[OsString]) -> Result<ExitStatus, String> {
    if let Some(status) =
        script_wrapper::run_sibling_script(UNINSTALL_SCRIPT_NAME, arguments.iter().cloned())?
    {
        return Ok(status);
    }

    let script = embedded_script_path()?;
    fs::write(&script, EMBEDDED_UNINSTALL_SCRIPT).map_err(|error| {
        format!(
            "the embedded uninstall script could not be staged at {}: {error}",
            script.display()
        )
    })?;
    let result = script_wrapper::run_script(&script, arguments.iter().cloned());
    let _ = fs::remove_file(&script);
    result
}

fn embedded_script_path() -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("the system clock could not be read: {error}"))?
        .as_nanos();
    let mut script = env::temp_dir();
    script.push(format!(
        "CodeCodex-Uninstall-{}-{nonce}.ps1",
        std::process::id()
    ));
    Ok(script)
}
