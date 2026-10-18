//! Clickable, windowless entry point for the portable uninstaller script.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::process::{ExitCode, Output};

#[path = "../gui_support.rs"]
mod gui_support;
#[path = "../script_wrapper.rs"]
mod script_wrapper;

const TITLE: &str = "Code-Codex uninstall";
const UNINSTALL_SCRIPT_NAME: &str = "Uninstall-CodeCodex.ps1";
const FINALIZER_SCRIPT_NAME: &str = "Finalize-Uninstall.ps1";
const DELEGATED_UNINSTALL_MARKER: &str = "CODE_CODEX_UNINSTALL_DELEGATED";
const EMBEDDED_UNINSTALL_SCRIPT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../installer/Uninstall-CodeCodex.ps1"
));
const EMBEDDED_FINALIZER_SCRIPT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../installer/Finalize-Uninstall.ps1"
));

fn main() -> ExitCode {
    let mut arguments: Vec<_> = env::args_os().skip(1).collect();
    let root = match requested_root(&arguments) {
        Ok(root) => root,
        Err(error) => { gui_support::show_dialog(TITLE, &error, true); return ExitCode::FAILURE; }
    };
    if env::var_os("CLE_UNINSTALL_STAGED").is_none() {
        return match stage_uninstaller(&root, &arguments) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => { gui_support::show_dialog(TITLE, &error, true); ExitCode::FAILURE }
        };
    }
    let version = installed_version();
    gui_support::localization::set_session(gui_support::localization::locale());
    let purge = arguments.iter().any(|a| a.to_string_lossy().eq_ignore_ascii_case("-PurgeSettings"));
    let mut progress = gui_support::ProgressDialog::open_uninstall(TITLE, &version, root.as_os_str(), purge);
    let result = match progress.wait_for_uninstall_confirmation() {
        Ok(Some(purge)) => {
            arguments.retain(|a| !["-keepsettings", "-purgesettings"].contains(&a.to_string_lossy().to_lowercase().as_str()));
            arguments.push(if purge { "-PurgeSettings" } else { "-KeepSettings" }.into());
            arguments.push("-SharedProgress".into());
            run_uninstall(&arguments, &mut progress).and_then(|output| {
                // The installation's logs may already be purged. Preserve the
                // result (including non-fatal empty-root diagnostics) outside it.
                let report = env::temp_dir().join(format!("CodeCodex-Uninstall-Result-{}.txt", std::process::id()));
                let _ = fs::write(report, format!("Exit status: {}\n{}\n{}", output.status, sanitize_script_output(&output.stderr), sanitize_script_output(&output.stdout)));
                if output.status.success() && !stdout_indicates_delegation(&output.stdout) { Ok(Some(output)) }
                else { Err(format!("CC-UNINSTALL-REMOVE-001\nExit status: {}\n{}\n{}", output.status, sanitize_script_output(&output.stderr), sanitize_script_output(&output.stdout))) }
            })
        }
        Ok(None) => Ok(None),
        Err(error) => Err(format!("CC-UNINSTALL-UI-001\n{error}")),
    };
    let code = match result {
        Ok(Some(_)) => match progress.finish_setup("Code-Codex was uninstalled successfully.") {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => { gui_support::show_dialog(TITLE, &format!("CC-UNINSTALL-FINISH-001\nCode-Codex was removed, but the completion window failed.\n{error}"), true); ExitCode::FAILURE }
        },
        Ok(None) => ExitCode::SUCCESS,
        Err(error) => {
            // Keep all captured evidence in the copyable report. Never show Finish
            // when the removal helper failed or only delegated another process.
            let report = env::temp_dir().join(format!("CodeCodex-Uninstall-Failure-{}.txt", std::process::id()));
            let saved = fs::write(&report, &error).is_ok();
            if progress.show_report(&error, saved.then_some(report.as_path())).is_err() { gui_support::show_dialog(TITLE, &error, true); }
            ExitCode::FAILURE
        }
    };
    progress.close();
    schedule_staged_cleanup();
    code
}

fn requested_root(arguments: &[OsString]) -> Result<PathBuf, String> {
    let mut root = None;
    let mut keep = false; let mut purge = false;
    let mut args = arguments.iter();
    while let Some(arg) = args.next() {
        match arg.to_string_lossy().to_lowercase().as_str() {
            "-installroot" => {
                if root.is_some() { return Err("InstallRoot was supplied more than once.".into()); }
                root = Some(PathBuf::from(args.next().ok_or("InstallRoot requires a folder.")?));
            }
            "-keepsettings" => keep = true,
            "-purgesettings" => purge = true,
            _ => return Err(format!("Unsupported uninstall argument: {}",arg.to_string_lossy())),
        }
    }
    if keep && purge { return Err("-KeepSettings and -PurgeSettings cannot be used together.".into()); }
    root.or_else(|| workspace_service::application_paths::install_root().ok().flatten())
        .ok_or_else(|| "The Code-Codex installation folder could not be found.".into())
}

fn stage_uninstaller(root: &std::path::Path, arguments: &[OsString]) -> Result<(), String> {
    let source = env::current_exe().map_err(|e|e.to_string())?;
    let directory = tempfile::Builder::new().prefix("CodeCodex-Uninstall-").tempdir().map_err(|e|e.to_string())?;
    let target = directory.path().join("Uninstall-CodeCodex.exe");
    fs::copy(&source, &target).map_err(|e| format!("CC-UNINSTALL-STAGE-001: {e}"))?;
    use sha2::{Digest, Sha256};
    let original = fs::read(&source).map_err(|e|e.to_string())?;
    let copy = fs::read(&target).map_err(|e|e.to_string())?;
    if Sha256::digest(&original) != Sha256::digest(&copy) { return Err("CC-UNINSTALL-STAGE-002: temporary executable verification failed.".into()); }
    let mut command = staged_uninstaller_command(&target, root, arguments)?;
    command.spawn().map_err(|e|format!("CC-UNINSTALL-STAGE-003: {e}"))?;
    // The child owns this directory after launch; it schedules exact-file cleanup
    // after Finish/Cancel. The installed entry must exit before file removal.
    let _ = directory.keep();
    Ok(())
}

fn staged_uninstaller_command(target: &std::path::Path, root: &std::path::Path, arguments: &[OsString]) -> Result<std::process::Command, String> {
    let directory = target.parent().ok_or("CC-UNINSTALL-CWD-001: Missing staged executable directory.")?;
    let mut command = std::process::Command::new(target);
    // Explorer and terminals commonly launch us with InstallRoot as their CWD.
    // Moving just the executable leaves that directory handle inherited by the
    // wizard and worker, preventing deletion of the otherwise empty root.
    command.current_dir(directory).args(arguments).env("CLE_UNINSTALL_STAGED", "1");
    if !arguments.iter().any(|a| a.to_string_lossy().eq_ignore_ascii_case("-InstallRoot")) {
        command.arg("-InstallRoot").arg(root);
    }
    gui_support::configure_hidden(&mut command);
    Ok(command)
}

fn schedule_staged_cleanup() {
    let Ok(executable) = env::current_exe() else { return };
    let Some(directory) = executable.parent() else { return };
    // Never delete the real installation, even if an environment flag was forged.
    if executable.file_name().and_then(|s|s.to_str()) != Some("Uninstall-CodeCodex.exe")
        || directory.parent() != Some(env::temp_dir().as_path())
        || !directory.file_name().is_some_and(|s|s.to_string_lossy().starts_with("CodeCodex-Uninstall-")) { return; }
    let Ok(powershell) = gui_support::trusted_system32_powershell() else { return };
    let file = executable.to_string_lossy().replace('\'', "''");
    let folder = directory.to_string_lossy().replace('\'', "''");
    let script = format!("Wait-Process -Id {} -ErrorAction SilentlyContinue; for($attempt=0;$attempt -lt 30;$attempt++){{try{{Remove-Item -LiteralPath '{}' -Force -ErrorAction Stop; [IO.Directory]::Delete('{}',$false);break}}catch{{Start-Sleep -Milliseconds 200}}}}", std::process::id(),file,folder);
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(script.encode_utf16().flat_map(u16::to_le_bytes).collect::<Vec<_>>());
    let mut command = std::process::Command::new(powershell);
    command.current_dir(env::temp_dir());
    command.args(["-NoProfile","-NonInteractive","-EncodedCommand",&encoded]);
    gui_support::configure_hidden(&mut command);
    let _ = command.spawn();
}

fn installed_version() -> String {
    workspace_service::application_paths::install_root()
        .ok()
        .flatten()
        .and_then(|root| fs::read_to_string(root.join("current-version")).ok())
        .map(|value| value.trim().to_owned())
        .filter(|value| {
            value.len() <= 32
                && value.split('.').count() == 3
                && value
                    .split('.')
                    .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
        })
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_owned())
}

fn run_uninstall(
    arguments: &[OsString],
    progress: &mut gui_support::ProgressDialog,
) -> Result<Output, String> {
    progress.set_progress_detail(
        15,
        "Checking installation",
        "Verifying the installed files and running processes.",
    );
    progress.set_progress_detail(
        25,
        "Preparing uninstaller",
        "Loading the bundled removal script.",
    );
    let scripts = stage_removal_scripts()?;
    let script = scripts.path().join(UNINSTALL_SCRIPT_NAME);
    // Always execute the matched embedded pair. Installed/sibling scripts may
    // belong to an older release and must never negotiate this UI protocol.
    script_wrapper::run_script_with_progress(&script, arguments.iter().cloned(), progress)
}

fn stage_removal_scripts() -> Result<tempfile::TempDir, String> {
    let directory = tempfile::Builder::new().prefix("CodeCodex-RemovalScripts-")
        .tempdir().map_err(|e| format!("CC-UNINSTALL-COMPAT-001: script directory creation failed: {e}"))?;
    for (name, source) in [(UNINSTALL_SCRIPT_NAME, EMBEDDED_UNINSTALL_SCRIPT), (FINALIZER_SCRIPT_NAME, EMBEDDED_FINALIZER_SCRIPT)] {
        // Windows PowerShell 5.1 otherwise reads non-ASCII source as ANSI.
        let bytes = format!("\u{feff}{}", source.trim_start_matches('\u{feff}')).into_bytes();
        let path = directory.path().join(name);
        fs::write(&path, &bytes).map_err(|e| format!("CC-UNINSTALL-COMPAT-002: staging {name} failed: {e}"))?;
        let staged = fs::read(&path).map_err(|e| format!("CC-UNINSTALL-COMPAT-002: reading {name} failed: {e}"))?;
        if staged != bytes { return Err(format!("CC-UNINSTALL-COMPAT-002: staged {name} did not match embedded resources")); }
    }
    Ok(directory)
}

fn stdout_indicates_delegation(bytes: &[u8]) -> bool {
    sanitize_script_output(bytes)
        .lines()
        .any(|line| line.trim() == DELEGATED_UNINSTALL_MARKER)
}

#[cfg(test)]
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

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use super::{first_meaningful_line, stdout_indicates_delegation, requested_root, stage_removal_scripts, UNINSTALL_SCRIPT_NAME, FINALIZER_SCRIPT_NAME, EMBEDDED_UNINSTALL_SCRIPT, EMBEDDED_FINALIZER_SCRIPT};

    #[test]
    fn stages_a_matched_utf8_pair_and_cleans_only_its_temporary_directory() {
        let scripts = stage_removal_scripts().expect("stage scripts");
        let folder = scripts.path().to_path_buf();
        for (name, source) in [(UNINSTALL_SCRIPT_NAME, EMBEDDED_UNINSTALL_SCRIPT), (FINALIZER_SCRIPT_NAME, EMBEDDED_FINALIZER_SCRIPT)] {
            let bytes = std::fs::read(folder.join(name)).expect("staged file");
            assert!(bytes.starts_with(&[0xef, 0xbb, 0xbf]));
            assert_eq!(&bytes[3..], source.trim_start_matches('\u{feff}').as_bytes());
            assert!(source.contains("SharedProgress"));
        }
        drop(scripts);
        assert!(!folder.exists());
    }

    #[test]
    fn staged_executable_does_not_inherit_installation_working_directory() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let root = temporary.path().join("installation");
        let staged = temporary.path().join("staged").join("Uninstall-CodeCodex.exe");
        let command = super::staged_uninstaller_command(&staged, &root, &[]).expect("staged command");
        assert_eq!(command.get_current_dir(), staged.parent());
        assert_ne!(command.get_current_dir(), Some(root.as_path()));
        assert_eq!(command.get_args().collect::<Vec<_>>(), vec![std::ffi::OsStr::new("-InstallRoot"), root.as_os_str()]);
        let arguments = vec![OsString::from("-InstallRoot"), root.as_os_str().to_owned(), OsString::from("-PurgeSettings")];
        let command = super::staged_uninstaller_command(&staged, &root, &arguments).expect("explicit root");
        assert_eq!(command.get_args().collect::<Vec<_>>(), arguments.iter().map(|arg| arg.as_os_str()).collect::<Vec<_>>());
    }

    #[test]
    fn preserves_explicit_unicode_root_and_rejects_conflicting_removal_options() {
        let path = std::path::PathBuf::from("E:\\中文 Apps\\user's Code-Codex");
        assert_eq!(requested_root(&["-InstallRoot".into(), path.as_os_str().into()]).ok(), Some(path));
        assert!(requested_root(&["-KeepSettings".into(), "-PurgeSettings".into()]).is_err());
        assert!(requested_root(&["-InstallRoot".into()]).is_err());
        assert!(requested_root(&["-SharedProgress".into()]).is_err());
    }

    #[test]
    fn recognizes_the_finalizer_handoff_marker() {
        assert!(stdout_indicates_delegation(
            b"Preparing removal\r\nCODE_CODEX_UNINSTALL_DELEGATED\r\n"
        ));
        assert!(!stdout_indicates_delegation(
            b"Code-Codex is not installed.\r\n"
        ));
    }

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
