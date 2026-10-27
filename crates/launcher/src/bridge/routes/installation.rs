use super::{NativeBridge, internal_error, lock_unpoisoned};
use cdp_client::BridgeError;
use serde_json::{Value, json};
use std::{fs, io, path::{Path, PathBuf}, process::Command};

fn uninstaller_command(root: &Path) -> io::Result<Command> {
    workspace_service::application_paths::validate_install_root(root)?;
    let executable = root.join("Uninstall-CodeCodex.exe");
    let metadata = fs::symlink_metadata(&executable)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("Redirected uninstaller refused"));
        }
    }
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(io::Error::other("The installed uninstaller is not a regular file"));
    }
    let mut command = Command::new(executable);
    // Always open the existing interactive wizard; never supply silent/Purge flags.
    command.arg("-InstallRoot").arg(root)
        .current_dir(std::env::temp_dir())
        .env_remove("CLE_UNINSTALL_STAGED")
        .env_remove("CODE_CODEX_UNINSTALL_DELEGATED")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    Ok(command)
}

fn installed_root() -> io::Result<PathBuf> {
    let root = workspace_service::application_paths::install_root()?
        .ok_or_else(|| io::Error::other("No installed Code-Codex directory was found"))?;
    workspace_service::application_paths::validate_install_root(&root)?;
    let root = dunce::canonicalize(root)?;
    if !dunce::canonicalize(std::env::current_exe()?)?.starts_with(&root) {
        return Err(io::Error::other("The running core does not belong to the installed application"));
    }
    Ok(root)
}

impl NativeBridge {
    pub(super) async fn installation_uninstall(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        if !params.as_object().is_some_and(serde_json::Map::is_empty) {
            return Err(BridgeError::invalid_request());
        }
        self.ensure_epoch(epoch)?;
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let _state = lock_unpoisoned(&this.inner.state);
            this.ensure_epoch(epoch)?;
            #[cfg(windows)]
            {
                let launch = || -> io::Result<()> {
                    let root = installed_root()?;
                    let mut command = uninstaller_command(&root)?;
                    command.spawn()?;
                    Ok(())
                };
                launch().map_err(|e| BridgeError::new("UNINSTALL_OPEN", format!("Opening the Code-Codex uninstall wizard failed: {e}")))?;
                Ok(json!({"opened":true}))
            }
            #[cfg(not(windows))]
            { Err(BridgeError::new("UNSUPPORTED", "The uninstall wizard is unavailable on this platform.")) }
        }).await.map_err(|_| internal_error())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uninstall_menu_requires_owned_root_and_regular_helper_and_only_opens_wizard() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(uninstaller_command(root).is_err());
        fs::write(root.join("storage-layout.json"), br#"{"schema":1,"product":"Other"}"#).unwrap();
        assert!(uninstaller_command(root).is_err());
        fs::write(root.join("storage-layout.json"), br#"{"schema":1,"product":"Code-Codex"}"#).unwrap();
        assert!(uninstaller_command(root).is_err());
        fs::create_dir(root.join("Uninstall-CodeCodex.exe")).unwrap();
        assert!(uninstaller_command(root).is_err());
        fs::remove_dir(root.join("Uninstall-CodeCodex.exe")).unwrap();
        fs::write(root.join("Uninstall-CodeCodex.exe"), b"fixture only; never launched").unwrap();
        let command = uninstaller_command(root).unwrap();
        assert_eq!(command.get_program(), root.join("Uninstall-CodeCodex.exe"));
        assert_eq!(command.get_args().collect::<Vec<_>>(), vec![std::ffi::OsStr::new("-InstallRoot"), root.as_os_str()]);
        assert_eq!(command.get_current_dir(), Some(std::env::temp_dir().as_path()));
    }
}
