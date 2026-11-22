use std::{fs, io, path::{Path, PathBuf}};

const PENDING: &str = "welcome-pending";

fn marker(root: &Path) -> PathBuf {
    root.join("data").join(PENDING)
}

pub fn pending(root: &Path) -> bool {
    fs::symlink_metadata(marker(root)).is_ok_and(|entry| entry.is_file())
}

/// Called only by a successful installer commit. The storage directory belongs
/// to Code-Codex and follows the existing keep/purge rules.
pub fn configure(root: &Path, fresh: bool) -> io::Result<()> {
    let path = marker(root);
    super::application_paths::validate_directory_path(
        path.parent().expect("welcome marker has a parent"),
    )?;
    // Migrated settings also identify a legacy installation if its registration
    // was already lost. These files are not written by installer language setup.
    let data = root.join("data");
    let has_prior_settings = ["settings.json", "renderer-settings.json"]
        .into_iter()
        .any(|name| data.join(name).exists());
    if fresh && !has_prior_settings {
        match fs::OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(_) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
            Err(error) => Err(error),
        }
    } else {
        consume(root).map(|_| ())
    }
}

/// Removing a single fixed marker makes simultaneous documents race on one
/// filesystem operation. Only the document that removes it may show the UI.
pub fn consume(root: &Path) -> io::Result<bool> {
    let path = marker(root);
    super::application_paths::validate_directory_path(
        path.parent().expect("welcome marker has a parent"),
    )?;
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_install_is_consumed_once_across_windows() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("data")).unwrap();
        configure(root.path(), true).unwrap();
        assert!(pending(root.path()));
        std::thread::scope(|threads| {
            let a = threads.spawn(|| consume(root.path()).unwrap());
            let b = threads.spawn(|| consume(root.path()).unwrap());
            assert_ne!(a.join().unwrap(), b.join().unwrap());
        });
        assert!(!pending(root.path()));
    }

    #[test]
    fn old_and_retained_installs_are_quiet_and_purge_allows_a_new_welcome() {
        let root = tempfile::tempdir().unwrap();
        let data = root.path().join("data");
        fs::create_dir(&data).unwrap();
        configure(root.path(), true).unwrap();
        configure(root.path(), false).unwrap();
        assert!(!pending(root.path()));
        fs::write(data.join("settings.json"), "{}").unwrap();
        configure(root.path(), true).unwrap();
        assert!(!pending(root.path()));
        fs::remove_file(data.join("settings.json")).unwrap();
        configure(root.path(), true).unwrap();
        assert!(pending(root.path()));
    }
}
