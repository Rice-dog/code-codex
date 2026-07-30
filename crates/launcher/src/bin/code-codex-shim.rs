//! Stable, windowless launcher placed at the installation root.
//!
//! The installer updates `current-version` only after a complete version has
//! been installed. This process validates that pointer and starts the selected
//! versioned GUI launcher without waiting for the Codex session to finish.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::fs::File;
use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};

#[path = "../gui_support.rs"]
mod gui_support;

const TITLE: &str = "Code-Codex";
const POINTER_FILE: &str = "current-version";
const VERSIONED_LAUNCHER: &str = "CodeCodex.exe";
const MAX_POINTER_BYTES: u64 = 64;
const MAX_VERSION_LENGTH: usize = 32;

fn main() -> ExitCode {
    match start_selected_version() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            gui_support::show_dialog(
                TITLE,
                &format!(
                    "Code-Codex could not start: {error}\n\nRun the Code-Codex installer again to repair this installation."
                ),
                true,
            );
            ExitCode::FAILURE
        }
    }
}

fn start_selected_version() -> Result<(), String> {
    let executable = env::current_exe()
        .map_err(|error| format!("the installation location could not be determined ({error})"))?;
    let install_root = executable
        .parent()
        .ok_or_else(|| "the launcher does not have a parent directory".to_owned())?;
    let pointer = read_pointer(&install_root.join(POINTER_FILE))?;
    let launcher = resolve_versioned_launcher(install_root, &pointer)?;
    let launcher = verify_launcher_under_root(install_root, &launcher)?;

    let mut command = Command::new(&launcher);
    command
        .args(env::args_os().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    gui_support::configure_hidden(&mut command);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("{} could not be launched ({error})", launcher.display()))
}

fn read_pointer(path: &Path) -> Result<String, String> {
    let file = File::open(path)
        .map_err(|error| format!("{} could not be read ({error})", path.display()))?;
    let mut bytes = Vec::new();
    file.take(MAX_POINTER_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("{} could not be read ({error})", path.display()))?;
    if bytes.len() > MAX_POINTER_BYTES as usize {
        return Err(format!("{} is too large", path.display()));
    }
    String::from_utf8(bytes).map_err(|_| format!("{} is not valid UTF-8 text", path.display()))
}

fn resolve_versioned_launcher(install_root: &Path, pointer: &str) -> Result<PathBuf, String> {
    let version = validate_version_pointer(pointer)?;
    Ok(install_root
        .join("versions")
        .join(version)
        .join(VERSIONED_LAUNCHER))
}

fn validate_version_pointer(pointer: &str) -> Result<&str, String> {
    let version = pointer
        .strip_suffix("\r\n")
        .or_else(|| pointer.strip_suffix('\n'))
        .unwrap_or(pointer);
    if version.is_empty() || version.len() > MAX_VERSION_LENGTH {
        return Err("current-version has an invalid length".to_owned());
    }

    let components: Vec<_> = version.split('.').collect();
    if components.len() != 3
        || components.iter().any(|component| {
            component.is_empty()
                || !component.bytes().all(|byte| byte.is_ascii_digit())
                || (component.len() > 1 && component.starts_with('0'))
        })
    {
        return Err("current-version must contain three dot-separated decimal numbers".to_owned());
    }
    Ok(version)
}

fn verify_launcher_under_root(install_root: &Path, launcher: &Path) -> Result<PathBuf, String> {
    if !launcher.is_file() {
        return Err(format!(
            "the selected launcher is missing: {}",
            launcher.display()
        ));
    }
    let canonical_root = dunce::canonicalize(install_root)
        .map_err(|error| format!("the installation directory could not be verified ({error})"))?;
    let canonical_launcher = dunce::canonicalize(launcher)
        .map_err(|error| format!("the selected launcher could not be verified ({error})"))?;
    if !path_starts_with(&canonical_launcher, &canonical_root) {
        return Err("the selected launcher resolves outside the installation directory".to_owned());
    }
    Ok(canonical_launcher)
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

#[cfg(not(windows))]
fn path_starts_with(candidate: &Path, root: &Path) -> bool {
    candidate.starts_with(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_a_valid_pointer_to_the_versioned_launcher() {
        let root = Path::new("install-root");
        assert_eq!(
            resolve_versioned_launcher(root, "0.1.4\r\n"),
            Ok(root.join("versions").join("0.1.4").join("CodeCodex.exe"))
        );
        assert_eq!(validate_version_pointer("2026.7.23\n"), Ok("2026.7.23"));
    }

    #[test]
    fn rejects_noncanonical_or_path_like_pointers() {
        for pointer in [
            "",
            "0.1",
            "0.1.4.0",
            "01.1.4",
            "0..4",
            ".0.1",
            "0.1.",
            "0.1.4 ",
            " 0.1.4",
            "0.1.4-beta",
            "../0.1.4",
            "0/1/4",
            "0.1.4\n\n",
        ] {
            assert!(
                validate_version_pointer(pointer).is_err(),
                "unexpectedly accepted {pointer:?}"
            );
        }
    }
}
