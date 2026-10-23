//! Explicit user consent for gracefully replacing an existing official desktop.
use std::path::Path;

#[cfg(windows)]
#[path = "startup_conflict_windows.rs"]
mod windows;

#[cfg(windows)]
const SCRIPT_READER: &str = r#"$ProgressPreference='SilentlyContinue';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); & ([scriptblock]::Create([Console]::In.ReadToEnd()))"#;

pub(crate) fn window_operation(
    pid: u32,
    created_ms: u64,
    image: &Path,
    close: bool,
) -> std::process::ExitCode {
    #[cfg(windows)]
    let result = windows::operate(pid, created_ms, image, close);
    #[cfg(not(windows))]
    let result: Result<serde_json::Value, String> = {
        let _ = (pid, created_ms, image, close);
        Err("Native startup recovery requires Windows".into())
    };
    match result {
        Ok(value) => {
            println!("{value}");
            std::process::ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::ExitCode::from(22)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Outcome {
    Ready,
    ReadyWithPreferenceWarning,
    Cancelled,
    Managed,
}

#[cfg(windows)]
fn parse_worker_reply(reply: &str, reset: bool) -> Result<Outcome, String> {
    match (reset, reply.trim()) {
        (true, "reset") | (false, "ready") => Ok(Outcome::Ready),
        (false, "ready-preference-warning") => Ok(Outcome::ReadyWithPreferenceWarning),
        (false, "cancelled") => Ok(Outcome::Cancelled),
        (false, "managed") => Ok(Outcome::Managed),
        _ => Err("Startup recovery returned an invalid response".into()),
    }
}

pub(crate) async fn resolve(executable: &Path) -> Result<Outcome, String> {
    let executable = executable.to_owned();
    tokio::task::spawn_blocking(move || invoke(Some(&executable), false))
        .await
        .map_err(|_| "Startup recovery worker failed".to_owned())?
}

pub(crate) fn reset() -> Result<(), String> {
    match invoke(None, true)? {
        Outcome::Ready => Ok(()),
        _ => {
            Err("Automatic restart permission was not cleared; retry when recovery is idle".into())
        }
    }
}

fn invoke(executable: Option<&Path>, reset: bool) -> Result<Outcome, String> {
    #[cfg(not(windows))]
    {
        let _ = (executable, reset);
        Err("Existing-instance recovery is available on Windows only".into())
    }
    #[cfg(windows)]
    {
        use base64::{Engine as _, engine::general_purpose::STANDARD};
        use std::{
            io::Write as _,
            os::windows::process::CommandExt as _,
            process::{Command, Stdio},
        };
        let shell = crate::process_guard::trusted_powershell()
            .ok_or("The trusted Windows PowerShell executable is unavailable")?;
        let store = workspace_service::SettingsStore::for_current_user()
            .map_err(|e| format!("Startup recovery preference location: {e}"))?;
        let path = store.path().with_file_name("startup-recovery.json");
        let source =
            crate::gui_support::localization::dialog_script(include_str!("startup_conflict.ps1"));
        // Keep the encoded bootstrap short. Feed the embedded source through stdin
        // so translated dialogs cannot exceed Windows' command-line length limit.
        let bytes: Vec<u8> = SCRIPT_READER
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        let mut command = Command::new(shell);
        command.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand"])
            .arg(STANDARD.encode(bytes))
            .env("CLE_RESTART_PREFERENCE", path)
            .env("CLE_RESTART_MODE", if reset { "reset" } else { "resolve" })
            .env("CLE_RESTART_HELPER", std::env::current_exe().map_err(|e| format!("Native helper location: {e}"))?)
            .env("CLE_RESTART_WARNING", crate::gui_support::localization::text(
                "Codex is already open. Closing it may interrupt running replies or tasks and lose unsaved changes. Close its windows and reopen through Code-Codex? Saved chats and project files are not deleted."))
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
            .creation_flags(0x0800_0000);
        if let Some(image) = executable {
            command.env("CLE_RESTART_EXECUTABLE", image);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Startup recovery dialog: {e}"))?;
        let delivered = child
            .stdin
            .take()
            .ok_or_else(|| std::io::Error::other("Recovery input pipe unavailable"))
            .and_then(|mut input| input.write_all(source.as_bytes()));
        if let Err(error) = delivered {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Startup recovery source delivery: {error}"));
        }
        let output = child
            .wait_with_output()
            .map_err(|e| format!("Startup recovery dialog: {e}"))?;
        if !output.status.success() {
            let reason: String = String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(2048)
                .collect();
            return Err(format!(
                "Existing Codex could not be closed safely: {}",
                reason.trim()
            ));
        }
        parse_worker_reply(&String::from_utf8_lossy(&output.stdout), reset)
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn preference_save_warning_keeps_launch_eligible_without_claiming_consent_saved() {
        assert_eq!(
            parse_worker_reply("ready-preference-warning\r\n", false),
            Ok(Outcome::ReadyWithPreferenceWarning)
        );
        assert_eq!(parse_worker_reply("ready", false), Ok(Outcome::Ready));
        assert_eq!(
            parse_worker_reply("cancelled", false),
            Ok(Outcome::Cancelled)
        );
        assert_eq!(parse_worker_reply("managed", false), Ok(Outcome::Managed));
    }

    #[test]
    fn reset_never_treats_a_save_warning_or_launch_reply_as_success() {
        assert_eq!(parse_worker_reply("reset", true), Ok(Outcome::Ready));
        for reply in [
            "ready-preference-warning",
            "ready",
            "cancelled",
            "managed",
            "",
            "reset\nready",
        ] {
            assert!(parse_worker_reply(reply, true).is_err(), "{reply:?}");
        }
        assert!(parse_worker_reply("reset", false).is_err());
        assert!(parse_worker_reply("ready\nunexpected", false).is_err());
    }
}
