//! Per-user, windowless installed-package observation while the GUI is closed.
use super::*;
pub(crate) fn configure(enable: bool) -> io::Result<Value> {
    if enable {
        return Err(io::Error::other(
            "HOST_UPDATE_STARTUP_ONLY: Periodic registration was retired.",
        ));
    }
    #[cfg(not(windows))]
    {
        let _ = enable;
        Err(io::Error::other(
            "HOST_UPDATE_SCHEDULER: Windows Task Scheduler is required.",
        ))
    }
    #[cfg(windows)]
    {
        use std::{
            os::windows::process::CommandExt,
            process::{Command, Stdio},
        };
        let root = workspace_service::application_paths::install_root()?.ok_or_else(|| {
            io::Error::other("HOST_UPDATE_INSTALLATION: An installed application is required.")
        })?;
        workspace_service::application_paths::validate_install_root(&root)?;
        let root = dunce::canonicalize(root)?;
        let exe = dunce::canonicalize(std::env::current_exe()?)?;
        if !exe.starts_with(&root) || exe.file_name().is_none_or(|n| n != "code-codex.exe") {
            return Err(io::Error::other(
                "HOST_UPDATE_INSTALLATION: Only the installed core can manage its own scheduled check.",
            ));
        }
        let marker = format!(
            "Code-Codex host update ledger {}",
            hash(root.to_string_lossy().to_ascii_lowercase().as_bytes())
        );
        let name = format!(
            "Code-Codex-HostUpdates-{}",
            &hash(root.to_string_lossy().to_ascii_lowercase().as_bytes())[..16]
        );
        let ps = PathBuf::from(
            std::env::var_os("SystemRoot")
                .ok_or_else(|| io::Error::other("Windows directory unavailable"))?,
        )
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        if !regular(&ps)?.is_file() {
            return Err(io::Error::other("Trusted PowerShell unavailable"));
        }
        let literal = |s: &str| format!("'{}'", s.replace('\'', "''"));
        let script = include_str!("scheduler.ps1")
            .replace("__TASK_NAME__", &literal(&name))
            .replace("__MARKER__", &literal(&marker))
            .replace("__ENABLE__", if enable { "$true" } else { "$false" });
        let mut child = Command::new(&ps)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let start = Instant::now();
        loop {
            if child.try_wait()?.is_some() {
                break;
            }
            if start.elapsed() > Duration::from_secs(20) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(io::Error::other(
                    "HOST_UPDATE_SCHEDULER: Task registration observation timed out.",
                ));
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let output = child.wait_with_output()?;
        if !output.status.success() {
            return Err(io::Error::other(
                "HOST_UPDATE_SCHEDULER: The per-user task operation failed or a foreign task already owns its name.",
            ));
        }
        let registered: Value = serde_json::from_slice(&output.stdout).map_err(io::Error::other)?;
        let value = json!({"enabled":enable,"taskName":registered["taskName"],"intervalSeconds":null,"mode":"startup_only","userOnly":true,"inferenceRequests":0,"commandVerified":true});
        atomic(&directory()?.join("scheduler.json"), &value)?;
        Ok(value)
    }
}
