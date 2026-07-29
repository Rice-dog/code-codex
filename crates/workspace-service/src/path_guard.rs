use std::ffi::OsStr;
use std::fs::File;
use std::path::{Component, Path, PathBuf};

#[cfg(not(windows))]
use cap_fs_ext::OpenOptionsMaybeDirExt as _;
use cap_fs_ext::{OpenOptionsFollowExt as _, OpenOptionsSyncExt as _};
use cap_primitives::ambient_authority;
use cap_primitives::fs::{
    FollowSymlinks, Metadata as CapabilityMetadata, MetadataExt as _, OpenOptions, open,
    open_ambient, open_ambient_dir, stat,
};
use same_file::Handle;

use crate::error::{WorkspaceError, map_io};

pub(crate) const MAX_RELATIVE_PATH_UNITS: usize = 1_024;

pub(crate) fn open_canonical_root(root: &Path) -> Result<(PathBuf, File), WorkspaceError> {
    open_canonical_root_with(root, || {})
}

fn open_canonical_root_with(
    root: &Path,
    after_binding: impl FnOnce(),
) -> Result<(PathBuf, File), WorkspaceError> {
    if !root.is_absolute() {
        return Err(WorkspaceError::InvalidPath);
    }

    // Bind the authority first. In particular, don't canonicalize a name and
    // then follow that name later: its final component could be replaced by a
    // reparse point in between. A user-selected symlink is still supported,
    // but its resolved target is retained here and must match every subsequent
    // verification handle.
    let bound = open_ambient_dir(root, ambient_authority()).map_err(|error| map_io(&error))?;
    let metadata = bound.metadata().map_err(|error| map_io(&error))?;
    if !metadata.is_dir() {
        return Err(WorkspaceError::NotDirectory);
    }
    after_binding();

    let canonical = dunce::canonicalize(root).map_err(|error| map_io(&error))?;
    let verified = open_ambient_directory_nofollow(&canonical)?;
    if !same_identity(bound, &verified)? {
        return Err(WorkspaceError::OutsideWorkspace);
    }

    // Verify the canonical name once more. The retained handle permits normal
    // rename/delete operations, so subsequent operations repeat this identity
    // check before using the handle-relative authority.
    let current = open_ambient_directory_nofollow(&canonical)?;
    if !same_identity(
        verified.try_clone().map_err(|error| map_io(&error))?,
        &current,
    )? {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    Ok((canonical, verified))
}

fn open_ambient_directory_nofollow(path: &Path) -> Result<File, WorkspaceError> {
    let options = delete_sharing_directory_options();
    let opened = open_ambient(path, &options, ambient_authority())
        .map_err(|error| map_capability_open(&error))?;
    let metadata = opened.metadata().map_err(|error| map_io(&error))?;
    if is_link_or_reparse(&metadata) {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    if !metadata.is_dir() {
        return Err(WorkspaceError::NotDirectory);
    }
    Ok(opened)
}

pub(crate) fn open_directory_nofollow(parent: &File, path: &Path) -> Result<File, WorkspaceError> {
    let options = delete_sharing_directory_options();
    let opened = open(parent, path, &options).map_err(|error| map_capability_open(&error))?;
    let metadata = opened.metadata().map_err(|error| map_io(&error))?;
    if is_link_or_reparse(&metadata) {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    if !metadata.is_dir() {
        return Err(WorkspaceError::NotDirectory);
    }
    Ok(opened)
}

pub(crate) fn open_regular_file_nofollow(
    parent: &File,
    path: &Path,
) -> Result<File, WorkspaceError> {
    open_regular_file_with_access_nofollow(parent, path, false)
}

pub(crate) fn open_regular_file_for_update_nofollow(
    parent: &File,
    path: &Path,
) -> Result<File, WorkspaceError> {
    open_regular_file_with_access_nofollow(parent, path, true)
}

fn open_regular_file_with_access_nofollow(
    parent: &File,
    path: &Path,
    write: bool,
) -> Result<File, WorkspaceError> {
    let mut components = path.components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(WorkspaceError::InvalidPath);
    }

    let candidate =
        stat(parent, path, FollowSymlinks::No).map_err(|error| map_capability_open(&error))?;
    if is_capability_link_or_reparse(&candidate) {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    if !candidate.is_file() {
        return Err(WorkspaceError::InvalidPath);
    }

    let mut options = OpenOptions::new();
    options.read(true);
    if write {
        options.write(true);
    }
    options.follow(FollowSymlinks::No).nonblock(true);
    #[cfg(windows)]
    {
        use cap_primitives::fs::OpenOptionsExt as _;

        const FILE_SHARE_READ: u32 = 0x1;
        const FILE_SHARE_WRITE: u32 = 0x2;
        const FILE_SHARE_DELETE: u32 = 0x4;
        let share_mode = if write {
            FILE_SHARE_READ | FILE_SHARE_DELETE
        } else {
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
        };
        options.share_mode(share_mode);
    }
    let opened = open(parent, path, &options).map_err(|error| map_capability_open(&error))?;
    let metadata = opened.metadata().map_err(|error| map_io(&error))?;
    if is_link_or_reparse(&metadata) {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    if !metadata.is_file() {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(opened)
}

fn is_capability_link_or_reparse(metadata: &CapabilityMetadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn delete_sharing_directory_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(windows)]
    {
        use cap_primitives::fs::OpenOptionsExt as _;

        // Avoid `maybe_dir`: cap-primitives deliberately removes
        // FILE_SHARE_DELETE from that convenience path. These are the stable
        // CreateFile flags for opening directories without blocking ordinary
        // rename/delete operations.
        const FILE_SHARE_READ: u32 = 0x1;
        const FILE_SHARE_WRITE: u32 = 0x2;
        const FILE_SHARE_DELETE: u32 = 0x4;
        const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
        options
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS);
    }
    #[cfg(not(windows))]
    options.maybe_dir(true);
    options
}

fn same_identity(bound: File, verified: &File) -> Result<bool, WorkspaceError> {
    let bound = Handle::from_file(bound).map_err(|error| map_io(&error))?;
    let verified = Handle::from_file(verified.try_clone().map_err(|error| map_io(&error))?)
        .map_err(|error| map_io(&error))?;
    Ok(bound == verified)
}

pub(crate) fn same_file_identity(left: &File, right: &File) -> Result<bool, WorkspaceError> {
    same_identity(left.try_clone().map_err(|error| map_io(&error))?, right)
}

pub(crate) fn verify_retained_root(
    canonical: &Path,
    retained: &File,
) -> Result<(), WorkspaceError> {
    let current =
        open_ambient_directory_nofollow(canonical).map_err(|_| WorkspaceError::OutsideWorkspace)?;
    if same_identity(
        retained.try_clone().map_err(|error| map_io(&error))?,
        &current,
    )? {
        Ok(())
    } else {
        Err(WorkspaceError::OutsideWorkspace)
    }
}

pub(crate) fn validate_relative(relative: &str) -> Result<PathBuf, WorkspaceError> {
    if relative.len() > MAX_RELATIVE_PATH_UNITS || relative.contains('\0') {
        return Err(WorkspaceError::InvalidPath);
    }

    // Colons reject drive prefixes and NTFS alternate data streams.  Leading
    // separators reject UNC, device, and rooted paths before Path parsing can
    // normalize them differently on another host OS.
    if relative.contains(':')
        || relative.starts_with('/')
        || relative.starts_with('\\')
        || relative.starts_with("//")
        || relative.starts_with("\\\\?\\")
        || relative.starts_with("\\\\.\\")
    {
        return Err(WorkspaceError::InvalidPath);
    }

    if relative.contains('/') && relative.contains('\\') {
        return Err(WorkspaceError::InvalidPath);
    }
    let normalized = relative.replace('\\', "/");
    if normalized.contains("//") {
        return Err(WorkspaceError::InvalidPath);
    }
    let path = Path::new(&normalized);
    if path.is_absolute() {
        return Err(WorkspaceError::InvalidPath);
    }

    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) if valid_windows_component(part) => clean.push(part),
            _ => return Err(WorkspaceError::InvalidPath),
        }
    }

    // The empty string denotes the root. A non-empty spelling that collapsed
    // to empty (for example, ".") is rejected by the component rules above.
    if !relative.is_empty() && clean.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(clean)
}

fn valid_windows_component(component: &OsStr) -> bool {
    let value = component.to_string_lossy();
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.ends_with(' ')
        || value.ends_with('.')
        || value.chars().any(|character| {
            matches!(
                character,
                '<' | '>' | '"' | '|' | '?' | '*' | '\0' | '\u{1}'..='\u{1f}'
            )
        })
    {
        return false;
    }

    let stem = value.split('.').next().unwrap_or_default();
    let upper = stem.to_ascii_uppercase();
    !matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !is_numbered_device(&upper, "COM")
        && !is_numbered_device(&upper, "LPT")
}

fn is_numbered_device(value: &str, prefix: &str) -> bool {
    value
        .strip_prefix(prefix)
        .and_then(|suffix| suffix.parse::<u8>().ok())
        .is_some_and(|number| (1..=9).contains(&number))
}

/// A directory opened component-by-component without following links or
/// Windows reparse points. Every ancestor handle remains alive for the
/// operation. Windows handles allow delete sharing, so normal workspace
/// rename/delete operations are not blocked; all traversal remains relative to
/// the retained, no-follow parent capabilities.
pub(crate) struct DirectoryCapability {
    handles: Vec<File>,
}

impl DirectoryCapability {
    pub(crate) fn open(root: &File, relative: &Path) -> Result<Self, WorkspaceError> {
        let mut handles = vec![root.try_clone().map_err(|error| map_io(&error))?];
        for component in relative.components() {
            let Component::Normal(part) = component else {
                return Err(WorkspaceError::InvalidPath);
            };
            let parent = handles.last().ok_or(WorkspaceError::Internal)?;
            let opened = open_directory_nofollow(parent, Path::new(part))?;
            handles.push(opened);
        }
        Ok(Self { handles })
    }

    pub(crate) fn handle(&self) -> Result<&File, WorkspaceError> {
        self.handles.last().ok_or(WorkspaceError::Internal)
    }

    pub(crate) fn handles(&self) -> &[File] {
        &self.handles
    }
}

fn map_capability_open(error: &std::io::Error) -> WorkspaceError {
    use std::io::ErrorKind;

    match error.kind() {
        ErrorKind::NotFound => WorkspaceError::NotFound,
        ErrorKind::PermissionDenied => WorkspaceError::AccessDenied,
        ErrorKind::NotADirectory => WorkspaceError::NotDirectory,
        // A no-follow open reports platform-specific error kinds for links
        // and reparse points. Treat all other failures as an untrusted path
        // and fail closed rather than falling back to ambient path access.
        _ => WorkspaceError::OutsideWorkspace,
    }
}

pub(crate) fn is_contained(root: &Path, candidate: &Path) -> bool {
    #[cfg(windows)]
    {
        let root_parts: Vec<_> = root
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
            .collect();
        let candidate_parts: Vec<_> = candidate
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
            .collect();
        candidate_parts.starts_with(&root_parts)
    }
    #[cfg(not(windows))]
    {
        candidate.starts_with(root)
    }
}

pub(crate) fn is_link_or_reparse(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub(crate) fn relative_for_event(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let text = relative.to_string_lossy().replace('\\', "/");
    let clean = validate_relative(&text).ok()?;
    let mut current = root.to_path_buf();
    for component in clean.components() {
        let Component::Normal(part) = component else {
            return None;
        };
        current.push(part);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if is_link_or_reparse(&metadata) => return None,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return None,
        }
    }
    if current.exists() {
        let canonical = dunce::canonicalize(&current).ok()?;
        if !is_contained(root, &canonical) {
            return None;
        }
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    #[test]
    fn accepts_only_unambiguous_relative_paths() {
        for valid in ["", "src", "src/lib.rs", "文档/说明.md"] {
            assert!(validate_relative(valid).is_ok(), "expected valid: {valid}");
        }
        for invalid in [
            ".",
            "..",
            "../secret",
            "src/../secret",
            "src//secret",
            "src\\/secret",
            "/root",
            "\\root",
            "//server/share",
            "C:/Windows",
            "file.txt:stream",
            "CON",
            "aux.txt",
            "LPT9.log",
            "trailing. ",
            "has*glob",
        ] {
            assert!(
                validate_relative(invalid).is_err(),
                "expected invalid: {invalid}"
            );
        }
    }

    #[test]
    fn root_identity_comparison_rejects_a_different_directory() {
        let first = TempDir::new().expect("first");
        let second = TempDir::new().expect("second");
        let first_handle = open_ambient_directory_nofollow(first.path()).expect("first capability");
        let second_handle =
            open_ambient_directory_nofollow(second.path()).expect("second capability");
        assert!(!same_identity(first_handle, &second_handle).expect("compare identity"));
    }

    #[cfg(unix)]
    fn create_directory_symlink(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[cfg(windows)]
    fn create_directory_symlink(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_dir(target, link).is_ok()
    }

    #[cfg(unix)]
    fn remove_directory_symlink(link: &Path) -> std::io::Result<()> {
        fs::remove_file(link)
    }

    #[cfg(windows)]
    fn remove_directory_symlink(link: &Path) -> std::io::Result<()> {
        fs::remove_dir(link)
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn root_symlink_swap_after_binding_is_rejected() {
        let parent = TempDir::new().expect("parent");
        let first = parent.path().join("first");
        let second = parent.path().join("second");
        let root = parent.path().join("workspace");
        fs::create_dir(&first).expect("first root");
        fs::create_dir(&second).expect("second root");
        if !create_directory_symlink(&first, &root) {
            return;
        }

        let result = open_canonical_root_with(&root, || {
            remove_directory_symlink(&root).expect("remove original root link");
            assert!(
                create_directory_symlink(&second, &root),
                "create replacement root link"
            );
        });
        assert_eq!(
            result.expect_err("swapped root must fail").code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }

    #[cfg(unix)]
    #[test]
    fn root_replacement_between_binding_and_canonicalization_is_rejected() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let original = parent.path().join("original");
        fs::create_dir(&root).expect("root");
        fs::write(root.join("original.txt"), "original").expect("original marker");

        let result = open_canonical_root_with(&root, || {
            fs::rename(&root, &original).expect("move bound root");
            fs::create_dir(&root).expect("replacement root");
            fs::write(root.join("replacement.txt"), "replacement").expect("replacement marker");
        });
        assert_eq!(
            result.expect_err("replacement must fail").code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }

    #[cfg(windows)]
    #[test]
    fn retained_root_handle_allows_move_but_rejects_stale_and_replacement_names() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let moved = parent.path().join("moved");
        fs::create_dir(&root).expect("root");
        let (canonical, retained) = open_canonical_root(&root).expect("open original root");

        fs::rename(&root, &moved).expect("retained root must permit rename");
        assert_eq!(
            verify_retained_root(&canonical, &retained)
                .expect_err("missing canonical name must fail closed")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );

        fs::create_dir(&root).expect("replacement root");
        fs::write(root.join("replacement.txt"), "replacement").expect("replacement marker");
        assert_eq!(
            verify_retained_root(&canonical, &retained)
                .expect_err("replacement identity must fail closed")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }

    #[cfg(windows)]
    #[test]
    fn retained_root_and_subdirectory_handles_allow_delete() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let inside = root.join("inside");
        fs::create_dir_all(&inside).expect("workspace tree");
        let (canonical, retained) = open_canonical_root(&root).expect("open root");
        let capability =
            DirectoryCapability::open(&retained, Path::new("inside")).expect("subdirectory");

        fs::remove_dir(&inside).expect("retained subdirectory must permit delete");
        drop(capability);
        fs::remove_dir(&root).expect("retained root must permit delete");
        assert_eq!(
            verify_retained_root(&canonical, &retained)
                .expect_err("deleted canonical root must fail closed")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn opened_directory_remains_bound_after_path_replacement() {
        let root = TempDir::new().expect("root");
        fs::create_dir(root.path().join("inside")).expect("inside");
        fs::write(root.path().join("inside/safe.txt"), "safe").expect("safe file");
        let root_handle = open_ambient_directory_nofollow(root.path()).expect("root capability");
        let capability =
            DirectoryCapability::open(&root_handle, Path::new("inside")).expect("capability");

        fs::rename(root.path().join("inside"), root.path().join("moved")).expect("rename");
        fs::create_dir(root.path().join("inside")).expect("replacement");
        fs::write(root.path().join("inside/attacker.txt"), "outside").expect("replacement file");

        let names: Vec<_> =
            cap_primitives::fs::read_base_dir(capability.handle().expect("directory handle"))
                .expect("read held directory")
                .map(|entry| entry.expect("entry").file_name())
                .collect();
        assert!(names.iter().any(|name| name == "safe.txt"));
        assert!(names.iter().all(|name| name != "attacker.txt"));
    }
}
