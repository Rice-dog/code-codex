use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

const DIALOG_SCRIPT: &str = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; $icon = if ($env:CLE_DIALOG_ERROR -eq '1') {[System.Windows.Forms.MessageBoxIcon]::Error} else {[System.Windows.Forms.MessageBoxIcon]::Information}; [void][System.Windows.Forms.MessageBox]::Show($env:CLE_DIALOG_MESSAGE,$env:CLE_DIALOG_TITLE,[System.Windows.Forms.MessageBoxButtons]::OK,$icon)";

pub(crate) fn show_dialog(title: &str, message: &str, error: bool) {
    let Ok(powershell) = trusted_system32_powershell() else {
        eprintln!("{title}: {message}");
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
        .env("CLE_DIALOG_TITLE", title)
        .env("CLE_DIALOG_MESSAGE", message)
        .env("CLE_DIALOG_ERROR", if error { "1" } else { "0" })
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_hidden(&mut command);
    let _ = command.status();
}

#[cfg(windows)]
pub(crate) fn trusted_system32_powershell() -> Result<PathBuf, String> {
    let system_root = env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or_else(|| "the Windows system directory could not be identified".to_owned())?;
    let system_root = dunce::canonicalize(system_root)
        .map_err(|error| format!("the Windows directory could not be verified: {error}"))?;
    let system32 = dunce::canonicalize(system_root.join("System32"))
        .map_err(|error| format!("the System32 directory could not be verified: {error}"))?;
    let powershell = dunce::canonicalize(
        system32
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe"),
    )
    .map_err(|error| format!("Windows PowerShell could not be verified: {error}"))?;

    if !powershell.is_file() || !path_starts_with(&powershell, &system32) {
        return Err("trusted Windows PowerShell was not found under System32".to_owned());
    }
    Ok(powershell)
}

#[cfg(not(windows))]
pub(crate) fn trusted_system32_powershell() -> Result<PathBuf, String> {
    Err("this launcher is supported only on Windows".to_owned())
}

pub(crate) fn configure_hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
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
