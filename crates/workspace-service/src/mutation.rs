use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::path::{Component, Path, PathBuf};

use cap_fs_ext::OpenOptionsFollowExt as _;
#[cfg(not(windows))]
use cap_primitives::fs::hard_link;
use cap_primitives::fs::{
    DirOptions, FollowSymlinks, OpenOptions, create_dir, open, read_base_dir, remove_dir,
    remove_file, rename, stat,
};

use crate::error::{WorkspaceError, map_io};
use crate::listing::{EntryKind, TreeEntry, Workspace};
#[cfg(windows)]
use crate::path_guard::open_regular_file_nofollow;
use crate::path_guard::{
    DirectoryCapability, is_contained, is_link_or_reparse, open_directory_nofollow,
    same_file_identity, validate_relative,
};

/// Maximum recursive depth accepted by one delete operation.
pub const MAX_DELETE_DEPTH: usize = 64;
/// Maximum number of descendants inspected by one delete operation.
pub const MAX_DELETE_ENTRIES: usize = 4_096;
const MAX_LEAF_UTF16_UNITS: usize = 255;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateEntryKind {
    File,
    Directory,
}

impl Workspace {
    pub fn create_entry(
        &self,
        parent_relative_path: &str,
        name: &str,
        kind: CreateEntryKind,
    ) -> Result<TreeEntry, WorkspaceError> {
        self.ensure_root_valid()?;
        let result = (|| {
            let parent = validate_relative(parent_relative_path)?;
            let leaf = validate_leaf(name)?;
            let relative = checked_join(&parent, leaf)?;
            let directory = DirectoryCapability::open(self.root_handle(), &parent)?;
            let parent_handle = directory.handle()?;
            ensure_absent(parent_handle, Path::new(leaf))?;

            match kind {
                CreateEntryKind::File => {
                    let mut options = OpenOptions::new();
                    options
                        .write(true)
                        .create_new(true)
                        .follow(FollowSymlinks::No);
                    let created = open(parent_handle, Path::new(leaf), &options)
                        .map_err(|error| map_mutation_io(&error))?;
                    let metadata = created.metadata().map_err(|error| map_io(&error))?;
                    if is_link_or_reparse(&metadata) || !metadata.is_file() {
                        return Err(WorkspaceError::OutsideWorkspace);
                    }
                }
                CreateEntryKind::Directory => {
                    create_dir(parent_handle, Path::new(leaf), &DirOptions::new())
                        .map_err(|error| map_mutation_io(&error))?;
                    let created = open_directory_nofollow(parent_handle, Path::new(leaf))?;
                    drop(created);
                }
            }

            Ok(make_tree_entry(&relative, name, kind.into()))
        })();
        self.ensure_root_valid()?;
        result
    }

    pub fn rename_entry(
        &self,
        relative_path: &str,
        new_name: &str,
    ) -> Result<TreeEntry, WorkspaceError> {
        self.ensure_root_valid()?;
        let result = (|| {
            let clean = validate_non_root(relative_path)?;
            let old_name = clean
                .file_name()
                .and_then(OsStr::to_str)
                .ok_or(WorkspaceError::InvalidPath)?;
            let new_name = validate_leaf(new_name)?;
            let parent = clean.parent().unwrap_or_else(|| Path::new(""));
            let destination = checked_join(parent, new_name)?;
            let directory = DirectoryCapability::open(self.root_handle(), parent)?;
            let parent_handle = directory.handle()?;
            let source_metadata = validated_entry_metadata(parent_handle, Path::new(old_name))?;
            let kind = kind_from_metadata(&source_metadata);

            if old_name == new_name {
                return Ok(make_tree_entry(&clean, new_name, kind));
            }
            ensure_rename_destination(
                parent_handle,
                Path::new(old_name),
                Path::new(new_name),
                &source_metadata,
            )?;
            rename_entry_no_replace(
                parent_handle,
                Path::new(old_name),
                parent_handle,
                Path::new(new_name),
                &source_metadata,
            )?;
            let renamed_metadata = validated_entry_metadata(parent_handle, Path::new(new_name))?;
            if kind_from_metadata(&renamed_metadata) != kind {
                return Err(WorkspaceError::OutsideWorkspace);
            }
            Ok(make_tree_entry(&destination, new_name, kind))
        })();
        self.ensure_root_valid()?;
        result
    }

    pub fn move_entry(
        &self,
        relative_path: &str,
        destination_parent_relative_path: &str,
    ) -> Result<TreeEntry, WorkspaceError> {
        self.ensure_root_valid()?;
        let result = (|| {
            let source = validate_non_root(relative_path)?;
            let destination_parent = validate_relative(destination_parent_relative_path)?;
            let name = source
                .file_name()
                .and_then(OsStr::to_str)
                .ok_or(WorkspaceError::InvalidPath)?;
            let source_parent = source.parent().unwrap_or_else(|| Path::new(""));
            let destination = checked_join(&destination_parent, name)?;
            let source_directory = DirectoryCapability::open(self.root_handle(), source_parent)?;
            let source_parent_handle = source_directory.handle()?;
            let source_metadata = validated_entry_metadata(source_parent_handle, Path::new(name))?;
            let kind = kind_from_metadata(&source_metadata);
            let destination_directory =
                DirectoryCapability::open(self.root_handle(), &destination_parent)?;
            let destination_parent_handle = destination_directory.handle()?;

            if same_file_identity(source_parent_handle, destination_parent_handle)? {
                return Ok(make_tree_entry(&source, name, kind));
            }

            if source_metadata.is_dir() {
                let source_handle = open_directory_nofollow(source_parent_handle, Path::new(name))?;
                for destination_ancestor in destination_directory.handles() {
                    if same_file_identity(&source_handle, destination_ancestor)? {
                        return Err(WorkspaceError::InvalidPath);
                    }
                }
            }

            ensure_absent(destination_parent_handle, Path::new(name))?;
            rename_entry_no_replace(
                source_parent_handle,
                Path::new(name),
                destination_parent_handle,
                Path::new(name),
                &source_metadata,
            )?;
            let moved_metadata =
                validated_entry_metadata(destination_parent_handle, Path::new(name))?;
            if kind_from_metadata(&moved_metadata) != kind {
                return Err(WorkspaceError::OutsideWorkspace);
            }
            Ok(make_tree_entry(&destination, name, kind))
        })();
        self.ensure_root_valid()?;
        result
    }

    pub fn copy_entry(
        &self,
        relative_path: &str,
        destination_parent_relative_path: &str,
    ) -> Result<TreeEntry, WorkspaceError> {
        self.ensure_root_valid()?;
        let result = (|| {
            let source = validate_non_root(relative_path)?;
            let destination_parent = validate_relative(destination_parent_relative_path)?;
            let base_name = source
                .file_name()
                .and_then(OsStr::to_str)
                .ok_or(WorkspaceError::InvalidPath)?;

            let destination_directory =
                DirectoryCapability::open(self.root_handle(), &destination_parent)?;
            let destination_parent_handle = destination_directory.handle()?;

            // Find a unique name using "copy N" suffix if needed.
            let unique_name = find_copy_name(destination_parent_handle, base_name)?;
            let destination = checked_join(&destination_parent, &unique_name)?;

            let source_parent = source.parent().unwrap_or_else(|| Path::new(""));
            let source_directory = DirectoryCapability::open(self.root_handle(), source_parent)?;
            let source_parent_handle = source_directory.handle()?;
            let source_metadata = validated_entry_metadata(source_parent_handle, Path::new(base_name))?;
            let kind = kind_from_metadata(&source_metadata);

            if source_metadata.is_dir() {
                copy_directory(
                    source_parent_handle,
                    Path::new(base_name),
                    destination_parent_handle,
                    Path::new(&unique_name),
                )?;
            } else {
                copy_file(
                    source_parent_handle,
                    Path::new(base_name),
                    destination_parent_handle,
                    Path::new(&unique_name),
                )?;
            }

            Ok(make_tree_entry(&destination, &unique_name, kind))
        })();
        self.ensure_root_valid()?;
        result
    }

    pub fn delete_entry(&self, relative_path: &str) -> Result<(), WorkspaceError> {
        self.ensure_root_valid()?;
        let result = (|| {
            let clean = validate_non_root(relative_path)?;
            let name = clean.file_name().ok_or(WorkspaceError::InvalidPath)?;
            let parent = clean.parent().unwrap_or_else(|| Path::new(""));
            let directory = DirectoryCapability::open(self.root_handle(), parent)?;
            let parent_handle = directory.handle()?;
            let metadata = validated_entry_metadata(parent_handle, Path::new(name))?;

            if metadata.is_dir() {
                let target = open_directory_nofollow(parent_handle, Path::new(name))?;
                let mut inspected = 0;
                inspect_delete_tree(&target, 0, &mut inspected)?;
                let mut deleted = 0;
                delete_directory_contents(&target, 0, &mut deleted)?;
                drop(target);
                remove_dir(parent_handle, Path::new(name))
                    .map_err(|error| map_mutation_io(&error))?;
            } else {
                remove_file(parent_handle, Path::new(name))
                    .map_err(|error| map_mutation_io(&error))?;
            }
            Ok(())
        })();
        self.ensure_root_valid()?;
        result
    }

    /// Resolves an existing non-reparse entry for native reveal UI. The
    /// absolute result must never be serialized back to the renderer.
    pub fn reveal_path(&self, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
        self.ensure_root_valid()?;
        let result = (|| {
            let clean = validate_relative(relative_path)?;
            if clean.as_os_str().is_empty() {
                return Ok(self.root_path().to_path_buf());
            }
            let name = clean.file_name().ok_or(WorkspaceError::InvalidPath)?;
            let parent = clean.parent().unwrap_or_else(|| Path::new(""));
            let directory = DirectoryCapability::open(self.root_handle(), parent)?;
            validated_entry_metadata(directory.handle()?, Path::new(name))?;

            let target = self.root_path().join(&clean);
            if !is_contained(self.root_path(), &target) {
                return Err(WorkspaceError::OutsideWorkspace);
            }
            Ok(target)
        })();
        self.ensure_root_valid()?;
        result
    }
}

impl From<CreateEntryKind> for EntryKind {
    fn from(value: CreateEntryKind) -> Self {
        match value {
            CreateEntryKind::File => Self::File,
            CreateEntryKind::Directory => Self::Directory,
        }
    }
}

fn validate_non_root(relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    let clean = validate_relative(relative_path)?;
    if clean.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(clean)
}

fn validate_leaf(name: &str) -> Result<&str, WorkspaceError> {
    if name.is_empty() || name.encode_utf16().count() > MAX_LEAF_UTF16_UNITS {
        return Err(WorkspaceError::InvalidPath);
    }
    let clean = validate_relative(name)?;
    let mut components = clean.components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(name)
}

fn checked_join(parent: &Path, leaf: &str) -> Result<PathBuf, WorkspaceError> {
    let joined = parent.join(leaf);
    let normalized = joined.to_string_lossy().replace('\\', "/");
    validate_relative(&normalized)
}

fn validated_entry_metadata(
    parent: &File,
    name: &Path,
) -> Result<cap_primitives::fs::Metadata, WorkspaceError> {
    let metadata = stat(parent, name, FollowSymlinks::No).map_err(|error| map_io(&error))?;
    if is_capability_link_or_reparse(&metadata) {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    Ok(metadata)
}

fn ensure_absent(parent: &File, name: &Path) -> Result<(), WorkspaceError> {
    match stat(parent, name, FollowSymlinks::No) {
        Ok(metadata) if is_capability_link_or_reparse(&metadata) => {
            Err(WorkspaceError::OutsideWorkspace)
        }
        Ok(_) => Err(WorkspaceError::EntryConflict),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(map_io(&error)),
    }
}

fn ensure_rename_destination(
    parent: &File,
    source_name: &Path,
    destination_name: &Path,
    source_metadata: &cap_primitives::fs::Metadata,
) -> Result<(), WorkspaceError> {
    #[cfg(windows)]
    if source_name != destination_name {
        return match stat(parent, destination_name, FollowSymlinks::No) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(map_io(&error)),
            Ok(destination_metadata) => {
                if is_capability_link_or_reparse(&destination_metadata) {
                    return Err(WorkspaceError::OutsideWorkspace);
                }
                if kind_from_metadata(&destination_metadata) != kind_from_metadata(source_metadata)
                {
                    return Err(WorkspaceError::EntryConflict);
                }
                let source = open_entry_nofollow(parent, source_name, source_metadata)?;
                let destination =
                    open_entry_nofollow(parent, destination_name, &destination_metadata)?;
                if !same_file_identity(&source, &destination)?
                    || !is_stored_name_case_change(parent, source_name, destination_name)?
                {
                    Err(WorkspaceError::EntryConflict)
                } else {
                    Ok(())
                }
            }
        };
    }

    let _ = source_name;
    let _ = source_metadata;
    ensure_absent(parent, destination_name)
}

#[cfg(windows)]
fn is_stored_name_case_change(
    parent: &File,
    source_name: &Path,
    destination_name: &Path,
) -> Result<bool, WorkspaceError> {
    let mut source_is_stored = false;
    let mut destination_is_stored = false;
    for item in read_base_dir(parent).map_err(|error| map_io(&error))? {
        let stored_name = item.map_err(|error| map_io(&error))?.file_name();
        source_is_stored |= stored_name.as_os_str() == source_name.as_os_str();
        destination_is_stored |= stored_name.as_os_str() == destination_name.as_os_str();
    }
    Ok(source_is_stored && !destination_is_stored)
}

#[cfg(windows)]
fn rename_entry_no_replace(
    source_parent: &File,
    source_name: &Path,
    destination_parent: &File,
    destination_name: &Path,
    _source_metadata: &cap_primitives::fs::Metadata,
) -> Result<(), WorkspaceError> {
    // Windows rename is no-replace and works for read-only files and on
    // filesystems that do not implement hard links.
    rename(
        source_parent,
        source_name,
        destination_parent,
        destination_name,
    )
    .map_err(|error| map_mutation_io(&error))
}

#[cfg(not(windows))]
fn rename_entry_no_replace(
    source_parent: &File,
    source_name: &Path,
    destination_parent: &File,
    destination_name: &Path,
    source_metadata: &cap_primitives::fs::Metadata,
) -> Result<(), WorkspaceError> {
    if source_metadata.is_file() {
        rename_file_no_replace(
            source_parent,
            source_name,
            destination_parent,
            destination_name,
        )
    } else {
        rename(
            source_parent,
            source_name,
            destination_parent,
            destination_name,
        )
        .map_err(|error| map_mutation_io(&error))
    }
}

#[cfg(not(windows))]
fn rename_file_no_replace(
    source_parent: &File,
    source_name: &Path,
    destination_parent: &File,
    destination_name: &Path,
) -> Result<(), WorkspaceError> {
    hard_link(
        source_parent,
        source_name,
        destination_parent,
        destination_name,
    )
    .map_err(|error| map_mutation_io(&error))?;
    if let Err(error) = remove_file(source_parent, source_name) {
        if remove_file(destination_parent, destination_name).is_err() {
            return Err(WorkspaceError::Internal);
        }
        return Err(map_mutation_io(&error));
    }
    Ok(())
}

#[cfg(windows)]
fn open_entry_nofollow(
    parent: &File,
    name: &Path,
    metadata: &cap_primitives::fs::Metadata,
) -> Result<File, WorkspaceError> {
    if metadata.is_dir() {
        open_directory_nofollow(parent, name)
    } else if metadata.is_file() {
        open_regular_file_nofollow(parent, name)
    } else {
        Err(WorkspaceError::InvalidPath)
    }
}

fn kind_from_metadata(metadata: &cap_primitives::fs::Metadata) -> EntryKind {
    if metadata.is_dir() {
        EntryKind::Directory
    } else {
        EntryKind::File
    }
}

fn make_tree_entry(relative: &Path, name: &str, kind: EntryKind) -> TreeEntry {
    let relative_path = relative.to_string_lossy().replace('\\', "/");
    TreeEntry {
        id: relative_path.clone(),
        name: name.to_owned(),
        relative_path,
        kind,
        inaccessible: false,
    }
}

fn inspect_delete_tree(
    directory: &File,
    depth: usize,
    entries: &mut usize,
) -> Result<(), WorkspaceError> {
    if depth >= MAX_DELETE_DEPTH {
        return Err(WorkspaceError::TooManyEntries);
    }
    for item in read_base_dir(directory).map_err(|error| map_io(&error))? {
        let item = item.map_err(|error| map_io(&error))?;
        charge_delete_entry(entries)?;
        let name = item.file_name();
        let metadata = stat(directory, Path::new(&name), FollowSymlinks::No)
            .map_err(|error| map_io(&error))?;
        if is_capability_link_or_reparse(&metadata) {
            return Err(WorkspaceError::OutsideWorkspace);
        }
        if metadata.is_dir() {
            let child = open_directory_nofollow(directory, Path::new(&name))?;
            inspect_delete_tree(&child, depth + 1, entries)?;
        }
    }
    Ok(())
}

fn delete_directory_contents(
    directory: &File,
    depth: usize,
    entries: &mut usize,
) -> Result<(), WorkspaceError> {
    if depth >= MAX_DELETE_DEPTH {
        return Err(WorkspaceError::TooManyEntries);
    }
    let names: Vec<OsString> = read_base_dir(directory)
        .map_err(|error| map_io(&error))?
        .map(|item| {
            item.map(|entry| entry.file_name())
                .map_err(|error| map_io(&error))
        })
        .collect::<Result<_, _>>()?;
    for name in names {
        charge_delete_entry(entries)?;
        let path = Path::new(&name);
        let metadata =
            stat(directory, path, FollowSymlinks::No).map_err(|error| map_mutation_io(&error))?;
        if is_capability_link_or_reparse(&metadata) {
            return Err(WorkspaceError::OutsideWorkspace);
        }
        if metadata.is_dir() {
            let child = open_directory_nofollow(directory, path)?;
            delete_directory_contents(&child, depth + 1, entries)?;
            drop(child);
            remove_dir(directory, path).map_err(|error| map_mutation_io(&error))?;
        } else {
            remove_file(directory, path).map_err(|error| map_mutation_io(&error))?;
        }
    }
    Ok(())
}

fn charge_delete_entry(entries: &mut usize) -> Result<(), WorkspaceError> {
    *entries = entries.saturating_add(1);
    if *entries > MAX_DELETE_ENTRIES {
        Err(WorkspaceError::TooManyEntries)
    } else {
        Ok(())
    }
}

fn is_capability_link_or_reparse(metadata: &cap_primitives::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use cap_primitives::fs::MetadataExt as _;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn map_mutation_io(error: &std::io::Error) -> WorkspaceError {
    use std::io::ErrorKind;

    match error.kind() {
        ErrorKind::AlreadyExists | ErrorKind::DirectoryNotEmpty => WorkspaceError::EntryConflict,
        ErrorKind::InvalidInput => WorkspaceError::InvalidPath,
        ErrorKind::NotFound => WorkspaceError::NotFound,
        ErrorKind::PermissionDenied => WorkspaceError::AccessDenied,
        ErrorKind::NotADirectory => WorkspaceError::NotDirectory,
        _ => WorkspaceError::Internal,
    }
}

/// Find a unique filename with "copy N" suffix when the base name exists.
/// Examples: "file.txt" → "file copy 1.txt", "folder" → "folder copy 1"
fn find_copy_name(parent_handle: &File, base_name: &str) -> Result<String, WorkspaceError> {
    // Split name into stem and extension
    let (stem, ext) = match base_name.rfind('.') {
        Some(idx) if idx > 0 => {
            let (s, e) = base_name.split_at(idx);
            (s, e) // ext includes the dot
        }
        _ => (base_name, ""),
    };

    // Try the original name first
    if stat(parent_handle, Path::new(base_name), FollowSymlinks::No).is_err() {
        return Ok(base_name.to_owned());
    }

    // Try "stem copy N.ext" for N = 1, 2, 3...
    for n in 1..=9999 {
        let candidate = format!("{} copy {}{}", stem, n, ext);
        if stat(parent_handle, Path::new(&candidate), FollowSymlinks::No).is_err() {
            return Ok(candidate);
        }
    }

    Err(WorkspaceError::Conflict)
}

/// Copy a single file.
fn copy_file(
    source_parent: &File,
    source_name: &Path,
    dest_parent: &File,
    dest_name: &Path,
) -> Result<(), WorkspaceError> {
    use std::io::{Read, Write};

    let source = open(
        source_parent,
        source_name,
        OpenOptions::new().read(true).follow(FollowSymlinks::No),
    )
    .map_err(|e| map_mutation_io(&e))?;

    let mut dest = open(
        dest_parent,
        dest_name,
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .follow(FollowSymlinks::No),
    )
    .map_err(|e| map_mutation_io(&e))?;

    let mut buffer = vec![0u8; 65536];
    let mut reader = std::io::BufReader::new(source);
    loop {
        let count = reader.read(&mut buffer).map_err(|e| map_io(&e))?;
        if count == 0 {
            break;
        }
        dest.write_all(&buffer[..count]).map_err(|e| map_io(&e))?;
    }
    dest.flush().map_err(|e| map_io(&e))?;
    Ok(())
}

/// Recursively copy a directory and its contents.
fn copy_directory(
    source_parent: &File,
    source_name: &Path,
    dest_parent: &File,
    dest_name: &Path,
) -> Result<(), WorkspaceError> {
    // Create destination directory
    create_dir(dest_parent, dest_name, &DirOptions::new())
        .map_err(|e| map_mutation_io(&e))?;

    let source_dir = open_directory_nofollow(source_parent, source_name)?;
    let dest_dir = open_directory_nofollow(dest_parent, dest_name)?;

    let entries: Vec<OsString> = read_base_dir(&source_dir)
        .map_err(|e| map_io(&e))?
        .map(|item| {
            item.map(|entry| entry.file_name())
                .map_err(|e| map_io(&e))
        })
        .collect::<Result<_, _>>()?;

    for name in entries {
        let path = Path::new(&name);
        let metadata = stat(&source_dir, path, FollowSymlinks::No)
            .map_err(|e| map_mutation_io(&e))?;

        if metadata.is_dir() {
            copy_directory(&source_dir, path, &dest_dir, path)?;
        } else if metadata.is_file() {
            copy_file(&source_dir, path, &dest_dir, path)?;
        }
        // Skip symlinks and other special files
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    fn fixture() -> (TempDir, Workspace) {
        let directory = TempDir::new().expect("temp dir");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        (directory, workspace)
    }

    #[test]
    fn creates_new_files_and_directories_and_returns_tree_entries() {
        let (directory, workspace) = fixture();
        let folder = workspace
            .create_entry("", "src", CreateEntryKind::Directory)
            .expect("directory");
        let file = workspace
            .create_entry("src", "main.rs", CreateEntryKind::File)
            .expect("file");

        assert_eq!(folder.kind, EntryKind::Directory);
        assert_eq!(folder.relative_path, "src");
        assert_eq!(file.kind, EntryKind::File);
        assert_eq!(file.relative_path, "src/main.rs");
        assert!(directory.path().join("src/main.rs").is_file());
    }

    #[test]
    fn create_never_overwrites_an_existing_entry() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("keep.txt"), "original").expect("fixture");

        let error = workspace
            .create_entry("", "keep.txt", CreateEntryKind::File)
            .expect_err("collision");
        assert_eq!(error.code(), crate::ErrorCode::Conflict);
        assert_eq!(
            fs::read_to_string(directory.path().join("keep.txt")).expect("read"),
            "original"
        );
    }

    #[test]
    fn strict_leaf_validation_rejects_ambiguous_reserved_and_long_names() {
        let (_directory, workspace) = fixture();
        for invalid in ["", ".", "..", "nested/file", "nested\\file", "NUL.txt"] {
            assert_eq!(
                workspace
                    .create_entry("", invalid, CreateEntryKind::File)
                    .expect_err("invalid leaf")
                    .code(),
                crate::ErrorCode::InvalidPath,
                "unexpected result for {invalid:?}"
            );
        }
        let too_long = "a".repeat(MAX_LEAF_UTF16_UNITS + 1);
        assert_eq!(
            workspace
                .create_entry("", &too_long, CreateEntryKind::File)
                .expect_err("long leaf")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        assert!(validate_leaf(&"a".repeat(MAX_LEAF_UTF16_UNITS)).is_ok());
        assert_eq!(
            validate_leaf(&"\u{1f600}".repeat(128))
                .expect_err("UTF-16 units, not scalar count")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        let overlong_parent = format!("{}/{}", "a".repeat(512), "b".repeat(511));
        assert_eq!(
            workspace
                .create_entry(&overlong_parent, "c", CreateEntryKind::File)
                .expect_err("aggregate path limit")
                .code(),
            crate::ErrorCode::InvalidPath
        );
    }

    #[test]
    fn rename_is_same_parent_and_never_overwrites() {
        let (directory, workspace) = fixture();
        fs::create_dir(directory.path().join("src")).expect("src");
        fs::write(directory.path().join("src/old.txt"), "old").expect("old");
        fs::write(directory.path().join("src/keep.txt"), "keep").expect("keep");

        let renamed = workspace
            .rename_entry("src/old.txt", "new.txt")
            .expect("rename");
        assert_eq!(renamed.relative_path, "src/new.txt");
        assert_eq!(renamed.kind, EntryKind::File);
        let error = workspace
            .rename_entry("src/new.txt", "keep.txt")
            .expect_err("collision");
        assert_eq!(error.code(), crate::ErrorCode::Conflict);
        assert_eq!(
            fs::read_to_string(directory.path().join("src/keep.txt")).expect("keep remains"),
            "keep"
        );
    }

    #[test]
    fn move_files_and_nonempty_directories_between_workspace_folders() {
        let (directory, workspace) = fixture();
        fs::create_dir_all(directory.path().join("source/tree/nested")).expect("source tree");
        fs::create_dir(directory.path().join("destination")).expect("destination");
        fs::write(directory.path().join("source/file.txt"), "file").expect("file");
        fs::write(
            directory.path().join("source/tree/nested/keep.txt"),
            "nested",
        )
        .expect("nested file");

        let moved_file = workspace
            .move_entry("source/file.txt", "destination")
            .expect("move file");
        assert_eq!(moved_file.relative_path, "destination/file.txt");
        assert_eq!(moved_file.kind, EntryKind::File);
        assert!(!directory.path().join("source/file.txt").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("destination/file.txt")).expect("moved file"),
            "file"
        );

        let moved_directory = workspace
            .move_entry("source/tree", "destination")
            .expect("move directory");
        assert_eq!(moved_directory.relative_path, "destination/tree");
        assert_eq!(moved_directory.kind, EntryKind::Directory);
        assert_eq!(
            fs::read_to_string(directory.path().join("destination/tree/nested/keep.txt"))
                .expect("moved nested file"),
            "nested"
        );

        let unchanged = workspace
            .move_entry("destination/file.txt", "destination")
            .expect("same-parent no-op");
        assert_eq!(unchanged.relative_path, "destination/file.txt");
    }

    #[test]
    fn move_rejects_collisions_invalid_destinations_and_descendants() {
        let (directory, workspace) = fixture();
        fs::create_dir_all(directory.path().join("source/tree/child")).expect("source tree");
        fs::create_dir(directory.path().join("destination")).expect("destination");
        fs::write(directory.path().join("source/item.txt"), "source").expect("source file");
        fs::write(directory.path().join("destination/item.txt"), "destination")
            .expect("destination file");
        fs::write(directory.path().join("not-a-folder.txt"), "file").expect("plain file");

        assert_eq!(
            workspace
                .move_entry("source/item.txt", "destination")
                .expect_err("collision")
                .code(),
            crate::ErrorCode::Conflict
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("destination/item.txt"))
                .expect("destination preserved"),
            "destination"
        );
        assert_eq!(
            workspace
                .move_entry("source/item.txt", "not-a-folder.txt")
                .expect_err("file destination")
                .code(),
            crate::ErrorCode::NotDirectory
        );
        for destination in ["source/tree", "source/tree/child"] {
            assert_eq!(
                workspace
                    .move_entry("source/tree", destination)
                    .expect_err("self or descendant")
                    .code(),
                crate::ErrorCode::InvalidPath
            );
        }
        assert!(directory.path().join("source/tree/child").is_dir());
    }

    #[test]
    fn rename_move_and_delete_reject_the_workspace_root() {
        let (_directory, workspace) = fixture();
        assert_eq!(
            workspace.delete_entry("").expect_err("root delete").code(),
            crate::ErrorCode::InvalidPath
        );
        assert_eq!(
            workspace
                .rename_entry("", "renamed")
                .expect_err("root rename")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        assert_eq!(
            workspace
                .move_entry("", "destination")
                .expect_err("root move")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        assert_eq!(
            workspace
                .move_entry("file.txt", "../outside")
                .expect_err("destination traversal")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        assert!(workspace.reveal_path("").is_ok());
    }

    #[cfg(not(windows))]
    #[test]
    fn file_rename_primitive_atomically_refuses_an_existing_destination() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("source.txt"), "source").expect("source");
        fs::write(directory.path().join("destination.txt"), "destination").expect("destination");

        let error = rename_file_no_replace(
            workspace.root_handle(),
            Path::new("source.txt"),
            workspace.root_handle(),
            Path::new("destination.txt"),
        )
        .expect_err("no replacement");
        assert_eq!(error.code(), crate::ErrorCode::Conflict);
        assert_eq!(
            fs::read_to_string(directory.path().join("source.txt")).expect("source remains"),
            "source"
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("destination.txt"))
                .expect("destination remains"),
            "destination"
        );
    }

    #[test]
    fn recursive_delete_removes_only_the_requested_subtree() {
        let (directory, workspace) = fixture();
        fs::create_dir_all(directory.path().join("remove/deep")).expect("tree");
        fs::write(directory.path().join("remove/root.txt"), "root").expect("root file");
        fs::write(directory.path().join("remove/deep/nested.txt"), "nested").expect("nested file");
        fs::write(directory.path().join("keep.txt"), "keep").expect("keep");

        workspace.delete_entry("remove").expect("recursive delete");
        assert!(!directory.path().join("remove").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("keep.txt")).expect("keep remains"),
            "keep"
        );
    }

    #[test]
    fn delete_depth_budget_is_checked_before_removing_entries() {
        let (directory, workspace) = fixture();
        let mut path = directory.path().join("too-deep");
        fs::create_dir(&path).expect("root");
        for index in 0..MAX_DELETE_DEPTH {
            path.push(format!("d{index}"));
            fs::create_dir(&path).expect("nested");
        }
        fs::write(path.join("marker.txt"), "marker").expect("marker");

        let error = workspace
            .delete_entry("too-deep")
            .expect_err("depth budget");
        assert_eq!(error.code(), crate::ErrorCode::TooManyEntries);
        assert!(directory.path().join("too-deep").exists());
        assert!(path.join("marker.txt").exists());
    }

    #[test]
    fn delete_entry_budget_is_checked_before_removing_entries() {
        let (directory, workspace) = fixture();
        fs::create_dir(directory.path().join("too-many")).expect("directory");
        for index in 0..=MAX_DELETE_ENTRIES {
            fs::write(directory.path().join(format!("too-many/{index}.txt")), "x").expect("entry");
        }

        let error = workspace
            .delete_entry("too-many")
            .expect_err("entry budget");
        assert_eq!(error.code(), crate::ErrorCode::TooManyEntries);
        assert_eq!(
            fs::read_dir(directory.path().join("too-many"))
                .expect("directory remains")
                .count(),
            MAX_DELETE_ENTRIES + 1
        );
    }

    #[test]
    fn reveal_returns_only_a_validated_existing_native_path() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("file.txt"), "value").expect("file");
        assert_eq!(
            workspace.reveal_path("").expect("reveal root"),
            directory.path()
        );
        assert_eq!(
            workspace.reveal_path("file.txt").expect("reveal"),
            directory.path().join("file.txt")
        );
        assert_eq!(
            workspace
                .reveal_path("missing.txt")
                .expect_err("missing")
                .code(),
            crate::ErrorCode::NotFound
        );
        assert_eq!(
            workspace
                .reveal_path("../outside")
                .expect_err("traversal")
                .code(),
            crate::ErrorCode::InvalidPath
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn final_reparse_points_are_rejected_by_mutations_and_reveal() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        fs::write(outside.path().join("external.txt"), "external").expect("external");
        fs::create_dir(directory.path().join("destination")).expect("destination");
        if !symlink_file(
            &outside.path().join("external.txt"),
            &directory.path().join("link.txt"),
        ) {
            return;
        }

        for error in [
            workspace
                .create_entry("", "link.txt", CreateEntryKind::File)
                .expect_err("create over link"),
            workspace
                .rename_entry("link.txt", "renamed.txt")
                .expect_err("rename link"),
            workspace
                .move_entry("link.txt", "destination")
                .expect_err("move link"),
            workspace.delete_entry("link.txt").expect_err("delete link"),
            workspace.reveal_path("link.txt").expect_err("reveal link"),
        ] {
            assert_eq!(error.code(), crate::ErrorCode::OutsideWorkspace);
        }
        assert_eq!(
            fs::read_to_string(outside.path().join("external.txt")).expect("external remains"),
            "external"
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn move_rejects_a_reparse_destination_without_touching_either_tree() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        fs::write(directory.path().join("source.txt"), "source").expect("source");
        fs::write(outside.path().join("outside.txt"), "outside").expect("outside marker");
        if !symlink_directory(outside.path(), &directory.path().join("destination-link")) {
            return;
        }

        assert_eq!(
            workspace
                .move_entry("source.txt", "destination-link")
                .expect_err("reparse destination")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("source.txt")).expect("source remains"),
            "source"
        );
        assert_eq!(
            fs::read_to_string(outside.path().join("outside.txt")).expect("outside remains"),
            "outside"
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn recursive_delete_rejects_nested_reparse_points_before_removing_anything() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        fs::write(outside.path().join("keep.txt"), "keep").expect("outside marker");
        fs::create_dir(directory.path().join("remove")).expect("container");
        if !symlink_directory(outside.path(), &directory.path().join("remove/link")) {
            return;
        }

        fs::write(directory.path().join("remove/local.txt"), "local").expect("local marker");
        assert_eq!(
            workspace
                .delete_entry("remove")
                .expect_err("reject nested link")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert!(directory.path().join("remove/local.txt").exists());
        assert!(directory.path().join("remove/link").exists());
        assert_eq!(
            fs::read_to_string(outside.path().join("keep.txt")).expect("outside preserved"),
            "keep"
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn retained_root_replacement_is_rejected_by_every_entry_operation() {
        let (first, workspace, root, moved) = replaced_root_fixture();
        assert_eq!(
            workspace
                .create_entry("", "unexpected.txt", CreateEntryKind::File)
                .expect_err("stale root")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert!(!root.join("unexpected.txt").exists());
        assert!(!moved.join("unexpected.txt").exists());
        drop(first);

        let (second, workspace, root, moved) = replaced_root_fixture();
        assert_eq!(
            workspace
                .rename_entry("target.txt", "renamed.txt")
                .expect_err("stale root rename")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert!(root.join("target.txt").exists());
        assert!(moved.join("target.txt").exists());
        drop(second);

        let (third, workspace, root, moved) = replaced_root_fixture();
        assert_eq!(
            workspace
                .move_entry("target.txt", "destination")
                .expect_err("stale root move")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert!(root.join("target.txt").exists());
        assert!(moved.join("target.txt").exists());
        drop(third);

        let (fourth, workspace, root, moved) = replaced_root_fixture();
        assert_eq!(
            workspace
                .delete_entry("target.txt")
                .expect_err("stale root delete")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert!(root.join("target.txt").exists());
        assert!(moved.join("target.txt").exists());
        drop(fourth);

        let (_fifth, workspace, _root, _moved) = replaced_root_fixture();
        assert_eq!(
            workspace
                .reveal_path("target.txt")
                .expect_err("stale root reveal")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }

    #[cfg(any(unix, windows))]
    fn replaced_root_fixture() -> (TempDir, Workspace, PathBuf, PathBuf) {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let moved = parent.path().join("moved");
        fs::create_dir(&root).expect("root");
        fs::write(root.join("target.txt"), "original").expect("original target");
        fs::create_dir(root.join("destination")).expect("original destination");
        let workspace = Workspace::open(&root).expect("workspace");
        fs::rename(&root, &moved).expect("move retained root");
        fs::create_dir(&root).expect("replacement root");
        fs::write(root.join("target.txt"), "replacement").expect("replacement target");
        fs::create_dir(root.join("destination")).expect("replacement destination");
        (parent, workspace, root, moved)
    }

    #[cfg(windows)]
    #[test]
    fn windows_case_only_rename_preserves_the_entry() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("Name.txt"), "content").expect("file");

        let renamed = workspace
            .rename_entry("Name.txt", "name.txt")
            .expect("case-only rename");
        assert_eq!(renamed.relative_path, "name.txt");
        assert_eq!(
            fs::read_to_string(directory.path().join("name.txt")).expect("renamed content"),
            "content"
        );
        let names: Vec<_> = fs::read_dir(directory.path())
            .expect("directory")
            .map(|entry| entry.expect("entry").file_name())
            .collect();
        assert_eq!(names, [OsString::from("name.txt")]);
    }

    #[cfg(windows)]
    #[test]
    fn windows_unicode_case_only_rename_preserves_the_entry() {
        let (directory, workspace) = fixture();
        let upper = "\u{00c4}.txt";
        let lower = "\u{00e4}.txt";
        fs::write(directory.path().join(upper), "content").expect("file");

        let renamed = workspace
            .rename_entry(upper, lower)
            .expect("Unicode case-only rename");
        assert_eq!(renamed.relative_path, lower);
        assert_eq!(
            fs::read_to_string(directory.path().join(lower)).expect("renamed content"),
            "content"
        );
        let names: Vec<_> = fs::read_dir(directory.path())
            .expect("directory")
            .map(|entry| entry.expect("entry").file_name())
            .collect();
        assert_eq!(names, [OsString::from(lower)]);
    }

    #[cfg(windows)]
    #[test]
    fn windows_read_only_file_rename_does_not_leave_a_duplicate() {
        let (directory, workspace) = fixture();
        let source = directory.path().join("read-only.txt");
        let destination = directory.path().join("renamed.txt");
        fs::write(&source, "content").expect("file");
        let original_permissions = fs::metadata(&source).expect("metadata").permissions();
        let mut permissions = original_permissions.clone();
        permissions.set_readonly(true);
        fs::set_permissions(&source, permissions).expect("read-only");

        workspace
            .rename_entry("read-only.txt", "renamed.txt")
            .expect("read-only rename");
        assert!(!source.exists());
        assert_eq!(
            fs::read_to_string(&destination).expect("renamed content"),
            "content"
        );

        fs::set_permissions(destination, original_permissions).expect("restore permissions");
    }

    #[cfg(windows)]
    #[test]
    fn windows_share_locked_rename_fails_without_creating_a_destination() {
        use std::os::windows::fs::OpenOptionsExt as _;

        const FILE_SHARE_READ: u32 = 0x1;
        let (directory, workspace) = fixture();
        let source = directory.path().join("locked.txt");
        let destination = directory.path().join("renamed.txt");
        fs::write(&source, "content").expect("file");
        let held = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(&source)
            .expect("locked handle");

        workspace
            .rename_entry("locked.txt", "renamed.txt")
            .expect_err("sharing violation");
        assert!(source.exists());
        assert!(!destination.exists());
        drop(held);
    }

    #[cfg(windows)]
    #[test]
    fn windows_existing_hard_link_name_is_still_a_conflict() {
        let (directory, workspace) = fixture();
        let source = directory.path().join("source.txt");
        let destination = directory.path().join("destination.txt");
        fs::write(&source, "content").expect("file");
        fs::hard_link(&source, &destination).expect("hard link");

        assert_eq!(
            workspace
                .rename_entry("source.txt", "destination.txt")
                .expect_err("stored destination must conflict")
                .code(),
            crate::ErrorCode::Conflict
        );
        assert!(source.exists());
        assert!(destination.exists());
    }

    #[cfg(unix)]
    fn symlink_file(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[cfg(windows)]
    fn symlink_file(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_file(target, link).is_ok()
    }

    #[cfg(unix)]
    fn symlink_directory(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[cfg(windows)]
    fn symlink_directory(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_dir(target, link).is_ok()
    }
}
