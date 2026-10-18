//! Independent, bounded UI-language preference. Never changes workspace settings or media.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

pub const MAX_BYTES: u64 = 4096;
static UPDATE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Locale {
    #[serde(rename = "zh-CN")]
    Chinese,
    #[serde(rename = "en")]
    English,
}
impl Locale {
    pub fn from_ui_tag(tag: &str) -> Self {
        if tag
            .split(['-', '_'])
            .next()
            .is_some_and(|s| s.eq_ignore_ascii_case("zh"))
        {
            Self::Chinese
        } else {
            Self::English
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chinese => "zh-CN",
            Self::English => "en",
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Source {
    Installer,
    Menu,
    SystemDefault,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preference {
    pub schema: u8,
    pub locale: Locale,
    pub revision: u32,
    pub source: Source,
}
impl Preference {
    pub fn fallback(locale: Locale) -> Self {
        Self {
            schema: 1,
            locale,
            revision: 0,
            source: Source::SystemDefault,
        }
    }
}
#[derive(Debug, thiserror::Error)]
pub enum LanguageError {
    #[error("CC-LANG-READ-001: {phase}: {cause}")]
    Read {
        phase: &'static str,
        #[source]
        cause: io::Error,
    },
    #[error("CC-LANG-INVALID-001: {0}")]
    Invalid(&'static str),
    #[error("CC-LANG-WRITE-001: {phase}: {cause}")]
    Write {
        phase: &'static str,
        #[source]
        cause: io::Error,
    },
    #[error("CC-LANG-CONFLICT-001: expected revision {expected}, observed {observed}")]
    Conflict { expected: u32, observed: u32 },
}
impl LanguageError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Read { .. } => "CC-LANG-READ-001",
            Self::Invalid(_) => "CC-LANG-INVALID-001",
            Self::Write { .. } => "CC-LANG-WRITE-001",
            Self::Conflict { .. } => "CC-LANG-CONFLICT-001",
        }
    }
}
#[derive(Debug, Clone)]
pub struct LanguageStore {
    root: PathBuf,
}
impl LanguageStore {
    pub fn new(data_root: PathBuf) -> Self {
        Self { root: data_root }
    }
    pub fn for_current_user() -> io::Result<Self> {
        crate::application_paths::data_root().map(Self::new)
    }
    pub fn path(&self) -> PathBuf {
        self.root.join("ui-language.json")
    }
    fn regular(path: &Path) -> io::Result<()> {
        let m = fs::symlink_metadata(path)?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if m.file_attributes() & 0x400 != 0 {
                return Err(io::Error::other("Redirected language file refused"));
            }
        }
        if !m.is_file() || m.file_type().is_symlink() {
            return Err(io::Error::other("Language path is not a regular file"));
        }
        Ok(())
    }
    pub fn load(&self) -> Result<Option<Preference>, LanguageError> {
        crate::application_paths::validate_directory_path(&self.root).map_err(|cause| {
            LanguageError::Read {
                phase: "directory",
                cause,
            }
        })?;
        let path = self.path();
        match Self::regular(&path) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(cause) => {
                return Err(LanguageError::Read {
                    phase: "metadata",
                    cause,
                });
            }
            _ => {}
        }
        let f = fs::File::open(&path).map_err(|cause| LanguageError::Read {
            phase: "open",
            cause,
        })?;
        let mut b = Vec::new();
        f.take(MAX_BYTES + 1)
            .read_to_end(&mut b)
            .map_err(|cause| LanguageError::Read {
                phase: "read",
                cause,
            })?;
        if b.len() as u64 > MAX_BYTES {
            return Err(LanguageError::Invalid("file exceeds 4096 bytes"));
        }
        let p: Preference = serde_json::from_slice(&b)
            .map_err(|_| LanguageError::Invalid("invalid JSON, fields, or locale"))?;
        if p.schema != 1 || p.revision == 0 {
            return Err(LanguageError::Invalid("unsupported schema or revision"));
        }
        Ok(Some(p))
    }
    fn lock_file(&self) -> Result<fs::File, LanguageError> {
        let write = |phase, cause| LanguageError::Write { phase, cause };
        crate::application_paths::validate_directory_path(&self.root)
            .map_err(|e| write("directory", e))?;
        fs::create_dir_all(&self.root).map_err(|e| write("mkdir", e))?;
        // A persistent empty lock file is intentional. Windows denies sharing while held;
        // process exit releases its handle, so a crash cannot leave a blocking lock token.
        let lock = self.root.join(".ui-language.lock");
        if lock.exists() {
            Self::regular(&lock).map_err(|e| write("lock metadata", e))?;
        }
        let start = Instant::now();
        let file = loop {
            let mut options = fs::OpenOptions::new();
            options.read(true).write(true).create(true).truncate(false);
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                options.share_mode(0);
            }
            match options.open(&lock) {
                Ok(file) => break file,
                Err(e)
                    if matches!(e.raw_os_error(), Some(32 | 33))
                        && start.elapsed() < Duration::from_secs(2) =>
                {
                    std::thread::sleep(Duration::from_millis(20))
                }
                Err(e) => return Err(write("lock", e)),
            }
        };
        Ok(file)
    }
    pub fn restore_install(
        &self,
        before: Option<Preference>,
        written_revision: u32,
    ) -> Result<(), LanguageError> {
        let _guard = UPDATE_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _file = self.lock_file()?;
        let current = self.load()?;
        let observed = current.as_ref().map_or(0, |p| p.revision);
        // A journal may have been flushed before the original write failed.
        if current == before {
            return Ok(());
        }
        if let (Some(current), Some(before)) = (&current, &before) {
            if current.locale == before.locale
                && current.source == before.source
                && written_revision.checked_add(1) == Some(current.revision)
            {
                return Ok(());
            }
        }
        if observed != written_revision {
            return Err(LanguageError::Conflict {
                expected: written_revision,
                observed,
            });
        }
        if let Some(mut prior) = before {
            prior.revision = observed
                .checked_add(1)
                .ok_or(LanguageError::Invalid("revision exhausted"))?;
            let mut temp = tempfile::Builder::new()
                .prefix(".ui-language.")
                .suffix(".tmp")
                .tempfile_in(&self.root)
                .map_err(|cause| LanguageError::Write {
                    phase: "rollback candidate",
                    cause,
                })?;
            temp.write_all(
                &serde_json::to_vec_pretty(&prior)
                    .map_err(|_| LanguageError::Invalid("rollback serialization"))?,
            )
            .map_err(|cause| LanguageError::Write {
                phase: "rollback write",
                cause,
            })?;
            temp.as_file()
                .sync_all()
                .map_err(|cause| LanguageError::Write {
                    phase: "rollback flush",
                    cause,
                })?;
            temp.persist(self.path())
                .map_err(|e| LanguageError::Write {
                    phase: "rollback replace",
                    cause: e.error,
                })?;
        } else {
            fs::remove_file(self.path()).map_err(|cause| LanguageError::Write {
                phase: "rollback remove",
                cause,
            })?;
        }
        Ok(())
    }
    /// The commit predicate runs under the cross-process write lock, immediately before persist.
    /// It is used by the bridge to reject stale lifecycle epochs without publishing a file.
    pub fn save(
        &self,
        locale: Locale,
        expected: u32,
        source: Source,
        authorized: impl FnOnce() -> bool,
    ) -> Result<Preference, LanguageError> {
        let _guard = UPDATE_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let write = |phase, cause| LanguageError::Write { phase, cause };
        let _file = self.lock_file()?;
        let current = match self.load() {
            Ok(value) => value,
            Err(LanguageError::Invalid(_)) if expected == 0 && source == Source::Menu => {
                // Explicit re-selection may repair only this preference. Keep bounded
                // original evidence, never reset settings.json or the renderer library.
                let mut bytes = Vec::new();
                fs::File::open(self.path())
                    .map_err(|e| write("repair read", e))?
                    .take(65537)
                    .read_to_end(&mut bytes)
                    .map_err(|e| write("repair read", e))?;
                if bytes.len() > 65536 {
                    return Err(LanguageError::Invalid(
                        "damaged language file exceeds repair backup limit",
                    ));
                }
                let mut backup = tempfile::Builder::new()
                    .prefix(".ui-language.invalid.")
                    .suffix(".json")
                    .tempfile_in(&self.root)
                    .map_err(|e| write("repair backup", e))?;
                backup
                    .write_all(&bytes)
                    .map_err(|e| write("repair backup write", e))?;
                backup
                    .as_file()
                    .sync_all()
                    .map_err(|e| write("repair backup flush", e))?;
                backup
                    .keep()
                    .map_err(|e| write("repair backup commit", e.error))?;
                None
            }
            Err(error) => return Err(error),
        };
        let observed = current.as_ref().map_or(0, |p| p.revision);
        if expected != observed {
            return Err(LanguageError::Conflict { expected, observed });
        }
        if let Some(p) = current.filter(|p| p.locale == locale) {
            return Ok(p);
        }
        let next = Preference {
            schema: 1,
            locale,
            revision: observed
                .checked_add(1)
                .ok_or(LanguageError::Invalid("revision exhausted"))?,
            source,
        };
        let mut temp = tempfile::Builder::new()
            .prefix(".ui-language.")
            .suffix(".tmp")
            .tempfile_in(&self.root)
            .map_err(|e| write("candidate create", e))?;
        let bytes = serde_json::to_vec_pretty(&next)
            .map_err(|_| LanguageError::Invalid("serialization"))?;
        temp.write_all(&bytes)
            .map_err(|e| write("candidate write", e))?;
        temp.as_file().sync_all().map_err(|e| write("flush", e))?;
        if !authorized() {
            return Err(write(
                "authorization",
                io::Error::other("Lifecycle changed before language commit"),
            ));
        }
        temp.persist(self.path())
            .map_err(|e| write("replace", e.error))?;
        // Keep at most three strictly named, regular repair backups. Never follow
        // links or clean other settings, and do not turn cleanup into a save failure.
        if let Ok(entries) = fs::read_dir(&self.root) {
            let mut backups: Vec<_> = entries
                .filter_map(Result::ok)
                .filter(|entry| {
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    name.strip_prefix(".ui-language.invalid.")
                        .and_then(|v| v.strip_suffix(".json"))
                        .is_some_and(|v| {
                            v.len() == 6 && v.bytes().all(|b| b.is_ascii_alphanumeric())
                        })
                        && Self::regular(&entry.path()).is_ok()
                })
                .collect();
            backups.sort_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok());
            let remove = backups.len().saturating_sub(3);
            for entry in backups.into_iter().take(remove) {
                let _ = fs::remove_file(entry.path());
            }
        }
        Ok(next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalization_uses_only_chinese_primary_tag() {
        for t in ["zh", "zh-TW", "ZH-cn", "zh_HK"] {
            assert_eq!(Locale::from_ui_tag(t), Locale::Chinese);
        }
        for t in ["en-US", "fr", "zho", "", "jpn"] {
            assert_eq!(Locale::from_ui_tag(t), Locale::English);
        }
    }
    #[test]
    fn missing_read_has_no_side_effect() {
        let d = tempfile::tempdir().expect("dir");
        let root = d.path().join("missing");
        assert_eq!(LanguageStore::new(root.clone()).load().expect("load"), None);
        assert!(!root.exists());
    }
    #[test]
    fn roundtrip_cas_and_same_locale() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        let p = s
            .save(Locale::Chinese, 0, Source::Installer, || true)
            .expect("save");
        assert_eq!(p.revision, 1);
        assert!(matches!(
            s.save(Locale::English, 0, Source::Menu, || true),
            Err(LanguageError::Conflict { .. })
        ));
        assert_eq!(s.load().expect("read"), Some(p.clone()));
        assert_eq!(
            s.save(Locale::Chinese, 1, Source::Menu, || true)
                .expect("same"),
            p
        );
        assert_eq!(
            s.save(Locale::English, 1, Source::Menu, || true)
                .expect("second")
                .revision,
            2
        );
    }
    #[test]
    fn failed_authorization_preserves_previous_bytes() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        s.save(Locale::English, 0, Source::Installer, || true)
            .expect("first");
        let b = fs::read(s.path()).expect("bytes");
        assert!(s.save(Locale::Chinese, 1, Source::Menu, || false).is_err());
        assert_eq!(fs::read(s.path()).expect("after"), b);
        assert_eq!(fs::read_dir(d.path()).expect("list").count(), 2);
    }
    #[test]
    fn rejects_corruption_and_never_implicitly_overwrites_it() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        for b in [
            b"{}".to_vec(),
            vec![b'x'; 4097],
            br#"{"schema":1,"locale":"fr","revision":1,"source":"menu"}"#.to_vec(),
        ] {
            fs::write(s.path(), &b).expect("fixture");
            assert!(matches!(s.load(), Err(LanguageError::Invalid(_))));
            assert!(
                s.save(Locale::English, 0, Source::Installer, || true)
                    .is_err()
            );
            assert_eq!(fs::read(s.path()).expect("preserved"), b);
        }
    }
    #[test]
    fn explicit_reselection_backs_up_corruption() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        fs::write(s.path(), b"damaged").expect("fixture");
        s.save(Locale::Chinese, 0, Source::Menu, || true)
            .expect("repair");
        assert_eq!(
            s.load().expect("read").expect("preference").locale,
            Locale::Chinese
        );
        let backups: Vec<_> = fs::read_dir(d.path())
            .expect("files")
            .filter_map(Result::ok)
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(".ui-language.invalid.")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(backups[0].path()).expect("backup"), b"damaged");
    }
    #[test]
    fn rejects_directory_as_language_file() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        fs::create_dir(s.path()).expect("fixture");
        assert!(s.load().is_err());
    }
    #[test]
    fn install_rollback_restores_absence_and_prior_selection_idempotently() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        s.save(Locale::Chinese, 0, Source::Installer, || true)
            .expect("first install");
        s.restore_install(None, 1).expect("rollback absence");
        s.restore_install(None, 1).expect("repeat");
        assert_eq!(s.load().expect("read"), None);
        let before = s
            .save(Locale::English, 0, Source::Menu, || true)
            .expect("before");
        let after = s
            .save(Locale::Chinese, 1, Source::Installer, || true)
            .expect("install");
        s.restore_install(Some(before.clone()), after.revision)
            .expect("restore");
        s.restore_install(Some(before), after.revision)
            .expect("idempotent");
        let restored = s.load().expect("read").expect("preference");
        assert_eq!(restored.locale, Locale::English);
        assert_eq!(restored.revision, 3);
    }
    #[test]
    fn install_rollback_does_not_overwrite_newer_user_selection() {
        let d = tempfile::tempdir().expect("dir");
        let s = LanguageStore::new(d.path().to_owned());
        let before = s
            .save(Locale::English, 0, Source::Installer, || true)
            .expect("before");
        s.save(Locale::Chinese, 1, Source::Installer, || true)
            .expect("install");
        let user = s
            .save(Locale::English, 2, Source::Menu, || true)
            .expect("user");
        assert!(matches!(
            s.restore_install(Some(before), 2),
            Err(LanguageError::Conflict { .. })
        ));
        assert_eq!(s.load().expect("read"), Some(user));
    }
}
