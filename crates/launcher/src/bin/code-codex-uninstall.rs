//! Clickable, windowless entry point for the portable uninstaller script.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::process::{ExitCode, Output};
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
        Ok(output) if output.status.success() => {
            gui_support::show_dialog(TITLE, "Code-Codex was uninstalled successfully.", false);
            ExitCode::SUCCESS
        }
        Ok(output) => {
            let exit_detail = output.status.code().map_or_else(
                || "The uninstall script stopped without an exit code.".to_owned(),
                |code| format!("The uninstall script exited with code {code}."),
            );
            let detail = captured_failure_detail(&output).unwrap_or(exit_detail);
            gui_support::show_dialog(
                TITLE,
                &format!(
                    "Code-Codex could not be uninstalled.\n\n{detail}\n\nInstalled files were left in place where possible."
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

fn run_uninstall(arguments: &[OsString]) -> Result<Output, String> {
    if let Some(output) = script_wrapper::run_sibling_script_captured(
        UNINSTALL_SCRIPT_NAME,
        arguments.iter().cloned(),
    )? {
        return Ok(output);
    }

    let script = embedded_script_path()?;
    fs::write(&script, EMBEDDED_UNINSTALL_SCRIPT).map_err(|error| {
        format!(
            "the embedded uninstall script could not be staged at {}: {error}",
            script.display()
        )
    })?;
    let result = script_wrapper::run_script_captured(&script, arguments.iter().cloned());
    let _ = fs::remove_file(&script);
    result
}

fn captured_failure_detail(output: &Output) -> Option<String> {
    [&output.stderr[..], &output.stdout[..]]
        .into_iter()
        .find_map(first_meaningful_line)
}

fn first_meaningful_line(bytes: &[u8]) -> Option<String> {
    sanitize_script_output(bytes)
        .lines()
        .map(str::trim)
        .find(|line| {
            !line.is_empty()
                && !line.starts_with("At ")
                && !line.starts_with('+')
                && !line.starts_with("CategoryInfo")
                && !line.starts_with("FullyQualifiedErrorId")
        })
        .map(|line| line.chars().take(600).collect())
}

fn sanitize_script_output(bytes: &[u8]) -> String {
    let decoded = if bytes.starts_with(&[0xff, 0xfe]) {
        decode_utf16_le(&bytes[2..])
    } else if looks_like_utf16_le(bytes) {
        decode_utf16_le(bytes)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    };
    decoded
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .filter(|character| *character == '\n' || *character == '\t' || !character.is_control())
        .collect::<String>()
        .trim()
        .to_owned()
}

fn looks_like_utf16_le(bytes: &[u8]) -> bool {
    if bytes.len() < 4 || bytes.len() % 2 != 0 {
        return false;
    }
    let pairs = bytes.chunks_exact(2).take(64);
    let mut count = 0usize;
    let mut zero_high_bytes = 0usize;
    for pair in pairs {
        count += 1;
        if pair[1] == 0 {
            zero_high_bytes += 1;
        }
    }
    count > 0 && zero_high_bytes * 4 >= count * 3
}

fn decode_utf16_le(bytes: &[u8]) -> String {
    let units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect::<Vec<_>>();
    String::from_utf16_lossy(&units)
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

#[cfg(test)]
mod tests {
    use super::first_meaningful_line;

    #[test]
    fn extracts_the_actionable_powershell_error() {
        let stderr = b"Code-Codex could not be stopped automatically.\r\nAt C:\\Uninstall-CodeCodex.ps1:1 char:1\r\n+ throw\r\n";
        assert_eq!(
            first_meaningful_line(stderr).as_deref(),
            Some("Code-Codex could not be stopped automatically.")
        );
    }

    #[test]
    fn skips_powershell_error_scaffolding() {
        let stderr = b"At C:\\Uninstall-CodeCodex.ps1:1 char:1\r\n+ throw\r\nCategoryInfo: OperationStopped\r\n";
        assert_eq!(first_meaningful_line(stderr), None);
    }

    #[test]
    fn decodes_utf16_powershell_errors() {
        let mut stderr = vec![0xff, 0xfe];
        stderr.extend(
            "The installed process could not be stopped."
                .encode_utf16()
                .flat_map(u16::to_le_bytes),
        );
        assert_eq!(
            first_meaningful_line(&stderr).as_deref(),
            Some("The installed process could not be stopped.")
        );
    }
}
