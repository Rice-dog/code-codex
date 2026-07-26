//! Clickable, windowless entry point for the portable uninstaller script.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::process::ExitCode;

#[path = "../gui_support.rs"]
mod gui_support;
#[path = "../script_wrapper.rs"]
mod script_wrapper;

const TITLE: &str = "Code-Codex uninstall";

fn main() -> ExitCode {
    let result = script_wrapper::run_sibling_script(
        "Uninstall-CodeCodex.ps1",
        env::args_os().skip(1),
    )
    .and_then(|status| {
        status.ok_or_else(|| {
            "the required script Uninstall-CodeCodex.ps1 was not found next to this program"
                .to_owned()
        })
    });
    match result {
        Ok(status) if status.success() => ExitCode::SUCCESS,
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
