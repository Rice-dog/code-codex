use std::path::{Path, PathBuf};

#[cfg(not(windows))]
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

use crate::WorkspaceError;

pub const MIN_PANEL_WIDTH: u16 = 180;
pub const MAX_PANEL_WIDTH: u16 = 480;
/// Crash-orphan candidates use exactly
/// `.settings.json.<16 ASCII alphanumeric characters>.tmp` so uninstallers
/// can match them without accepting arbitrary files.
pub const SETTINGS_CANDIDATE_PREFIX: &str = ".settings.json.";
pub const SETTINGS_CANDIDATE_TOKEN_LENGTH: usize = 16;
pub const SETTINGS_CANDIDATE_SUFFIX: &str = ".tmp";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub panel_width: u16,
    pub collapsed: bool,
    pub show_hidden: bool,
    pub show_ignored: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            panel_width: 260,
            collapsed: false,
            show_hidden: true,
            show_ignored: true,
        }
    }
}

impl Settings {
    fn validate(&self) -> Result<(), WorkspaceError> {
        if !(MIN_PANEL_WIDTH..=MAX_PANEL_WIDTH).contains(&self.panel_width) {
            return Err(WorkspaceError::InvalidSettings);
        }
        Ok(())
    }

    pub fn apply(&mut self, patch: SettingsPatch) -> Result<(), WorkspaceError> {
        let mut updated = self.clone();
        if let Some(value) = patch.panel_width {
            updated.panel_width = value;
        }
        if let Some(value) = patch.collapsed {
            updated.collapsed = value;
        }
        if let Some(value) = patch.show_hidden {
            updated.show_hidden = value;
        }
        if let Some(value) = patch.show_ignored {
            updated.show_ignored = value;
        }
        updated.validate()?;
        *self = updated;
        Ok(())
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub panel_width: Option<u16>,
    pub collapsed: Option<bool>,
    pub show_hidden: Option<bool>,
    pub show_ignored: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct SettingsStore {
    path: PathBuf,
}

/// A fully written settings candidate that has not changed the canonical
/// `settings.json` yet. Dropping it abandons the update and removes the
/// staging file.
#[derive(Debug)]
pub struct PreparedSettings {
    temporary: tempfile::NamedTempFile,
    destination: PathBuf,
}

impl PreparedSettings {
    #[must_use]
    pub fn temporary_path(&self) -> &Path {
        self.temporary.path()
    }

    /// Atomically replaces the canonical settings file with the prepared
    /// candidate. Until this call succeeds, the previous file remains intact.
    pub fn commit(self) -> Result<(), WorkspaceError> {
        let Self {
            temporary,
            destination,
        } = self;
        temporary
            .persist(destination)
            .map(drop)
            .map_err(|_| WorkspaceError::AccessDenied)
    }
}

impl SettingsStore {
    pub fn for_current_user() -> Result<Self, WorkspaceError> {
        #[cfg(windows)]
        {
            let local = std::env::var_os("LOCALAPPDATA").ok_or(WorkspaceError::Internal)?;
            Ok(Self::new(
                PathBuf::from(local)
                    .join("CodexLiveExplorer")
                    .join("settings.json"),
            ))
        }
        #[cfg(not(windows))]
        {
            let directories = ProjectDirs::from("dev", "CodexLiveExplorer", "CodexLiveExplorer")
                .ok_or(WorkspaceError::Internal)?;
            Ok(Self::new(directories.config_dir().join("settings.json")))
        }
    }

    #[must_use]
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> Result<Settings, WorkspaceError> {
        let bytes = match std::fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Settings::default());
            }
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err(WorkspaceError::AccessDenied);
            }
            Err(_) => return Err(WorkspaceError::Internal),
        };
        let settings: Settings =
            serde_json::from_slice(&bytes).map_err(|_| WorkspaceError::InvalidSettings)?;
        settings.validate()?;
        Ok(settings)
    }

    pub fn save(&self, settings: &Settings) -> Result<(), WorkspaceError> {
        self.prepare(settings)?.commit()
    }

    /// Writes and flushes a candidate file without changing `settings.json`.
    /// The caller can perform any final authorization checks before commit.
    pub fn prepare(&self, settings: &Settings) -> Result<PreparedSettings, WorkspaceError> {
        settings.validate()?;
        let parent = self.path.parent().ok_or(WorkspaceError::Internal)?;
        std::fs::create_dir_all(parent).map_err(|_| WorkspaceError::AccessDenied)?;
        let mut temporary = tempfile::Builder::new()
            .prefix(SETTINGS_CANDIDATE_PREFIX)
            .rand_bytes(SETTINGS_CANDIDATE_TOKEN_LENGTH)
            .suffix(SETTINGS_CANDIDATE_SUFFIX)
            .tempfile_in(parent)
            .map_err(|_| WorkspaceError::AccessDenied)?;
        let bytes = serde_json::to_vec_pretty(settings).map_err(|_| WorkspaceError::Internal)?;
        std::io::Write::write_all(temporary.as_file_mut(), &bytes)
            .map_err(|_| WorkspaceError::AccessDenied)?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|_| WorkspaceError::AccessDenied)?;
        Ok(PreparedSettings {
            temporary,
            destination: self.path.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::*;

    fn assert_candidate_name(path: &Path) {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .expect("candidate filename");
        let token = name
            .strip_prefix(SETTINGS_CANDIDATE_PREFIX)
            .and_then(|name| name.strip_suffix(SETTINGS_CANDIDATE_SUFFIX))
            .expect("strict candidate pattern");
        assert_eq!(token.len(), SETTINGS_CANDIDATE_TOKEN_LENGTH);
        assert!(token.bytes().all(|byte| byte.is_ascii_alphanumeric()));
    }

    #[test]
    fn round_trips_settings_atomically() {
        let directory = TempDir::new().expect("temp dir");
        let store = SettingsStore::new(directory.path().join("nested/settings.json"));
        assert_eq!(store.load().expect("defaults"), Settings::default());
        assert!(Settings::default().show_hidden);
        assert!(Settings::default().show_ignored);
        let first = Settings {
            panel_width: 320,
            collapsed: true,
            show_hidden: true,
            show_ignored: false,
        };
        store.save(&first).expect("first save");
        assert_eq!(store.load().expect("first load"), first);
        let replacement = Settings {
            panel_width: 420,
            collapsed: false,
            show_hidden: false,
            show_ignored: true,
        };
        store.save(&replacement).expect("replacement save");
        assert_eq!(store.load().expect("replacement load"), replacement);
    }

    #[test]
    fn prepared_update_does_not_change_canonical_settings_until_commit() {
        let directory = TempDir::new().expect("temp dir");
        let store = SettingsStore::new(directory.path().join("settings.json"));
        let original = Settings::default();
        store.save(&original).expect("original save");
        let replacement = Settings {
            panel_width: 300,
            collapsed: true,
            show_hidden: true,
            show_ignored: true,
        };

        let abandoned = store.prepare(&replacement).expect("prepare abandoned");
        let abandoned_path = abandoned.temporary_path().to_path_buf();
        let concurrent = store.prepare(&replacement).expect("prepare concurrent");
        let concurrent_path = concurrent.temporary_path().to_path_buf();
        assert_ne!(abandoned_path, concurrent_path);
        assert_candidate_name(&abandoned_path);
        assert_candidate_name(&concurrent_path);
        assert_eq!(store.load().expect("load before abandonment"), original);
        assert!(abandoned_path.is_file());
        assert!(concurrent_path.is_file());
        drop(abandoned);
        drop(concurrent);
        assert_eq!(store.load().expect("load after abandonment"), original);
        assert!(!abandoned_path.exists());
        assert!(!concurrent_path.exists());

        let committed = store.prepare(&replacement).expect("prepare committed");
        let committed_path = committed.temporary_path().to_path_buf();
        assert_eq!(store.load().expect("load before commit"), original);
        committed.commit().expect("commit");
        assert_eq!(store.load().expect("load after commit"), replacement);
        assert!(!committed_path.exists());
    }

    #[test]
    fn rejects_width_outside_ui_contract() {
        let mut settings = Settings::default();
        assert!(
            settings
                .apply(SettingsPatch {
                    panel_width: Some(100),
                    ..SettingsPatch::default()
                })
                .is_err()
        );
        assert_eq!(settings, Settings::default());
    }
}
