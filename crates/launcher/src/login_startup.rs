//! Opt-in current-user login registration. The OS entry is the only source of
//! truth: reading never creates a key and no launch can silently re-enable it.
use serde::Serialize;
use std::{io, path::Path};

pub(crate) const VALUE_NAME: &str = "CodeCodexLogin";
#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub supported: bool,
    pub enabled: bool,
}

fn command_for(root: &Path) -> io::Result<String> {
    workspace_service::application_paths::validate_install_root(root)?;
    let launcher = root.join("CodeCodex.exe");
    let meta = std::fs::symlink_metadata(&launcher)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("Redirected login launcher refused"));
        }
    }
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err(io::Error::other("Login launcher is not a regular file"));
    }
    command_line(&launcher)
}

fn command_line(launcher: &Path) -> io::Result<String> {
    let text = launcher
        .to_str()
        .ok_or_else(|| io::Error::other("Invalid login launcher path"))?;
    if text.chars().any(|c| c == '"' || c.is_control()) {
        return Err(io::Error::other("Invalid login launcher path"));
    }
    let command = format!("\"{text}\" run --login-startup");
    // Run commands have a documented 260-character limit. Never truncate.
    if command.encode_utf16().count() > 260 {
        return Err(io::Error::other(
            "Login command exceeds the Windows Run limit",
        ));
    }
    Ok(command)
}

#[cfg(windows)]
fn installed_command() -> io::Result<Option<String>> {
    let Some(root) = workspace_service::application_paths::install_root()? else {
        return Ok(None);
    };
    let root = dunce::canonicalize(root)?;
    let executable = dunce::canonicalize(std::env::current_exe()?)?;
    // A development binary must not register a different, possibly older
    // installation merely because a registry locator exists for that folder.
    if !executable.starts_with(&root) {
        return Ok(None);
    }
    command_for(&root).map(Some)
}

trait EntryStore {
    fn read(&self) -> io::Result<Option<String>>;
    fn write(&self, command: &str) -> io::Result<()>;
    fn remove(&self) -> io::Result<()>;
}

fn change(store: &impl EntryStore, command: Option<&str>, enabled: bool) -> io::Result<()> {
    if enabled {
        let command = command.ok_or_else(|| {
            io::Error::other("Login startup requires a supported installed launcher")
        })?;
        if store.read()?.as_deref().is_some_and(|old| old != command) {
            return Err(io::Error::other(
                "Existing Code-Codex login entry differs; disable it before enabling this installation",
            ));
        }
        store.write(command)?;
        if store.read()?.as_deref() != Some(command) {
            return Err(io::Error::other("Login registration could not be verified"));
        }
    } else {
        // Revocation needs no executable, marker or valid old command. It only
        // deletes our distinct value, never the Run key or Codex's own entry.
        store.remove()?;
        if store.read()?.is_some() {
            return Err(io::Error::other("Login startup permission was not removed"));
        }
    }
    Ok(())
}

#[cfg(windows)]
struct RegistryEntry<'a> {
    hive: &'a winreg::RegKey,
    key: &'a str,
}
#[cfg(windows)]
impl EntryStore for RegistryEntry<'_> {
    fn read(&self) -> io::Result<Option<String>> {
        use winreg::{enums::REG_SZ, types::FromRegValue};
        let key = match self.hive.open_subkey(self.key) {
            Ok(key) => key,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let value = match key.get_raw_value(VALUE_NAME) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        if value.vtype != REG_SZ || value.bytes.len() > 522 || value.bytes.len() % 2 != 0 {
            return Err(io::Error::other("Invalid Code-Codex login registry value"));
        }
        let text = String::from_reg_value(&value)?;
        if text.contains('\0') {
            return Err(io::Error::other("Invalid login command"));
        }
        Ok(Some(text))
    }
    fn write(&self, command: &str) -> io::Result<()> {
        let (key, _) = self.hive.create_subkey(self.key)?;
        key.set_value(VALUE_NAME, &command)
    }
    fn remove(&self) -> io::Result<()> {
        let key = match self
            .hive
            .open_subkey_with_flags(self.key, winreg::enums::KEY_SET_VALUE)
        {
            Ok(key) => key,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
        };
        match key.delete_value(VALUE_NAME) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            result => result,
        }
    }
}

pub(crate) fn status() -> io::Result<Status> {
    #[cfg(not(windows))]
    {
        Ok(Status {
            supported: false,
            enabled: false,
        })
    }
    #[cfg(windows)]
    {
        let hive = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        let stored = RegistryEntry {
            hive: &hive,
            key: RUN_KEY,
        }
        .read()?;
        let command = installed_command();
        // A missing/old launcher must not prevent inspecting a disabled setting.
        match (stored, command) {
            (None, command) => Ok(Status {
                supported: matches!(command, Ok(Some(_))),
                enabled: false,
            }),
            (Some(stored), Ok(Some(command))) if stored == command => Ok(Status {
                supported: true,
                enabled: true,
            }),
            _ => Err(io::Error::other(
                "Login entry is stale or unavailable; use login-startup --disable to revoke it",
            )),
        }
    }
}

pub(crate) fn set(enabled: bool) -> io::Result<Status> {
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err(io::Error::other(
            "Login startup is available on Windows only",
        ))
    }
    #[cfg(windows)]
    {
        let hive = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        let store = RegistryEntry {
            hive: &hive,
            key: RUN_KEY,
        };
        let command = if enabled {
            Some(installed_command()?.ok_or_else(|| {
                io::Error::other(
                    "Login startup requires this binary to belong to a supported installation",
                )
            })?)
        } else {
            None
        };
        change(&store, command.as_deref(), enabled)?;
        if enabled {
            status()
        } else {
            Ok(Status {
                supported: true,
                enabled: false,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Fake {
        value: RefCell<Option<String>>,
        deny_write: bool,
        deny_remove: bool,
        write_then_error: bool,
    }
    impl EntryStore for Fake {
        fn read(&self) -> io::Result<Option<String>> {
            Ok(self.value.borrow().clone())
        }
        fn write(&self, value: &str) -> io::Result<()> {
            if self.deny_write {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
            *self.value.borrow_mut() = Some(value.into());
            if self.write_then_error {
                return Err(io::Error::other("fixture uncertain commit"));
            }
            Ok(())
        }
        fn remove(&self) -> io::Result<()> {
            if self.deny_remove {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }
    #[test]
    fn defaults_off_and_only_explicit_enable_registers() {
        let store = Fake::default();
        assert_eq!(store.read().unwrap(), None);
        assert!(change(&store, None, true).is_err());
        change(&store, Some("quoted trusted command"), true).unwrap();
        assert_eq!(
            store.read().unwrap().as_deref(),
            Some("quoted trusted command")
        );
        change(&store, None, false).unwrap();
        change(&store, None, false).unwrap();
        assert_eq!(store.read().unwrap(), None);
    }
    #[test]
    fn failure_never_claims_enable_or_revoke_succeeded() {
        let denied = Fake {
            deny_write: true,
            ..Default::default()
        };
        assert!(change(&denied, Some("new"), true).is_err());
        let uncertain = Fake {
            write_then_error: true,
            ..Default::default()
        };
        assert!(change(&uncertain, Some("committed"), true).is_err());
        assert_eq!(uncertain.read().unwrap().as_deref(), Some("committed"));
        change(&uncertain, None, false).unwrap();
        assert_eq!(uncertain.read().unwrap(), None);
        assert_eq!(denied.read().unwrap(), None);
        let denied = Fake {
            value: RefCell::new(Some("old".into())),
            deny_remove: true,
            ..Default::default()
        };
        assert!(change(&denied, None, false).is_err());
        assert_eq!(denied.read().unwrap().as_deref(), Some("old"));
        assert!(change(&denied, Some("new"), true).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn real_registry_roundtrip_only_touches_its_namespaced_value() {
        let hive = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        let path = format!(
            r"Software\CodeCodexTestFixtures\login-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let store = RegistryEntry {
            hive: &hive,
            key: &path,
        };
        assert_eq!(store.read().unwrap(), None);
        assert!(
            hive.open_subkey(&path).is_err(),
            "read must not create a key"
        );
        let (key, _) = hive.create_subkey(&path).unwrap();
        key.set_value("Codex", &"official sentinel").unwrap();
        change(&store, Some("fixture"), true).unwrap();
        assert_eq!(store.read().unwrap().as_deref(), Some("fixture"));
        assert!(change(&store, Some("different installation"), true).is_err());
        key.set_value(VALUE_NAME, &123u32).unwrap();
        assert!(
            store.read().is_err(),
            "wrong registry types cannot be interpreted as enabled"
        );
        change(&store, None, false).unwrap();
        assert_eq!(
            key.get_value::<String, _>("Codex").unwrap(),
            "official sentinel"
        );
        drop(key);
        hive.delete_subkey_all(&path).unwrap();
    }
    #[test]
    fn launcher_is_quoted_and_missing_or_redirected_files_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Chinese-中文 with spaces");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("storage-layout.json"),
            r#"{"schema":1,"product":"Code-Codex"}"#,
        )
        .unwrap();
        assert!(command_for(&root).is_err());
        std::fs::write(root.join("CodeCodex.exe"), b"fixture").unwrap();
        let command = command_for(&root).unwrap();
        assert!(command.starts_with('"'));
        assert!(command.ends_with("CodeCodex.exe\" run --login-startup"));
        assert!(!command.contains("powershell"));
        std::fs::write(root.join("current-version"), "0.5.8\n").unwrap();
        assert_eq!(
            command_for(&root).unwrap(),
            command,
            "upgrading the pointer cannot pin or re-enable a registry entry"
        );
        std::fs::remove_file(root.join("storage-layout.json")).unwrap();
        assert!(command_for(&root).is_err());
    }

    #[test]
    fn command_budget_and_argument_injection_are_rejected() {
        assert!(command_line(Path::new("bad\"launcher.exe")).is_err());
        assert!(command_line(Path::new("bad\nlauncher.exe")).is_err());
        assert!(command_line(Path::new(&"x".repeat(260))).is_err());
        // Count UTF-16 code units, not UTF-8 bytes or scalar values.
        assert!(command_line(Path::new(&"😀".repeat(130))).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn redirected_installation_root_is_not_registered() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("owned");
        let link = dir.path().join("redirect");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("storage-layout.json"),
            r#"{"schema":1,"product":"Code-Codex"}"#,
        )
        .unwrap();
        std::fs::write(root.join("CodeCodex.exe"), b"fixture").unwrap();
        junction::create(&root, &link).unwrap();
        assert!(command_for(&link).is_err());
        junction::delete(&link).unwrap();
    }
}
