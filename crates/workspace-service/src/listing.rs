use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use cap_fs_ext::OpenOptionsFollowExt as _;
use cap_primitives::fs::MetadataExt as _;
use cap_primitives::fs::{
    FollowSymlinks, Metadata as CapabilityMetadata, OpenOptions, open as open_capability_file,
    read_base_dir, stat,
};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::{Deserialize, Serialize};

use crate::error::{WorkspaceError, map_io};
use crate::path_guard::{
    DirectoryCapability, is_link_or_reparse, open_canonical_root, validate_relative,
    verify_retained_root,
};

const DEFAULT_PAGE_SIZE: usize = 200;
const MAX_PAGE_SIZE: usize = 500;
const MAX_SCANNED_ENTRIES: usize = 50_000;
const MAX_IGNORE_FILE_BYTES: usize = 256 * 1_024;
const MAX_IGNORE_FILE_LINES: usize = 10_000;
const MAX_IGNORE_CHAIN_FILE_PROBES: usize = 64;
const MAX_IGNORE_CHAIN_MATCHERS: usize = 32;
const MAX_IGNORE_CHAIN_BYTES: usize = 1_024 * 1_024;
const MAX_IGNORE_CHAIN_LINES: usize = 4_096;

pub(crate) const DEFAULT_IGNORED_NAMES: &[&str] = &[
    ".git",
    ".cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "venv",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Directory,
    File,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub inaccessible: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPage {
    pub entries: Vec<TreeEntry>,
    pub next_cursor: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ListOptions {
    pub relative_path: String,
    pub cursor: Option<String>,
    pub limit: usize,
    pub show_hidden: bool,
    pub show_ignored: bool,
}

impl Default for ListOptions {
    fn default() -> Self {
        Self {
            relative_path: String::new(),
            cursor: None,
            limit: DEFAULT_PAGE_SIZE,
            show_hidden: false,
            show_ignored: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Workspace {
    root: PathBuf,
    root_handle: Arc<File>,
    display_name: String,
    active_import_staging_names: Arc<Mutex<HashSet<String>>>,
}

impl Workspace {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let (root, root_handle) = open_canonical_root(root.as_ref())?;
        let display_name = root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "workspace".to_owned());
        Ok(Self {
            root,
            root_handle: Arc::new(root_handle),
            display_name,
            active_import_staging_names: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    #[must_use]
    pub fn display_name(&self) -> &str {
        &self.display_name
    }

    /// Native-only canonical root. Do not serialize this value to the renderer.
    #[must_use]
    pub fn root_path(&self) -> &Path {
        &self.root
    }

    /// Cheap native validity probe for long-lived watcher subscriptions.
    /// Returns false after the canonical root name is removed, replaced, or
    /// redirected to a different filesystem object.
    #[must_use]
    pub fn root_is_valid(&self) -> bool {
        self.ensure_root_valid().is_ok()
    }

    pub(crate) fn register_import_staging_name(&self, name: String) {
        self.active_import_staging_names
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(name);
    }

    pub(crate) fn unregister_import_staging_name(&self, name: &str) {
        self.active_import_staging_names
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(name);
    }

    pub(crate) fn active_import_staging_names(&self) -> HashSet<String> {
        self.active_import_staging_names
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn list(&self, mut options: ListOptions) -> Result<ListPage, WorkspaceError> {
        self.ensure_root_valid()?;
        let clean_relative = validate_relative(&options.relative_path)?;
        let active_root_staging_names = clean_relative
            .as_os_str()
            .is_empty()
            .then(|| self.active_import_staging_names());
        options.limit = options.limit.clamp(1, MAX_PAGE_SIZE);
        let offset = decode_cursor(options.cursor.as_deref())?;
        let directory = DirectoryCapability::open(&self.root_handle, &clean_relative)?;
        let ignore = if options.show_ignored {
            None
        } else {
            Some(build_gitignore(&self.root, &clean_relative, &directory))
        };

        // Enumeration and metadata lookup remain relative to the retained
        // no-follow handle, so a rename/reparse swap cannot redirect this
        // operation after validation.
        let directory_handle = directory.handle()?;
        let read_dir = read_base_dir(directory_handle).map_err(|error| map_io(&error))?;
        let default_ignored: HashSet<&str> = DEFAULT_IGNORED_NAMES.iter().copied().collect();
        let mut entries = Vec::new();
        for (index, item) in read_dir.enumerate() {
            if index >= MAX_SCANNED_ENTRIES {
                return Err(WorkspaceError::TooManyEntries);
            }
            let item = match item {
                Ok(item) => item,
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => continue,
                Err(error) => return Err(map_io(&error)),
            };
            let name = item.file_name().to_string_lossy().into_owned();
            if active_root_staging_names
                .as_ref()
                .is_some_and(|active| active.contains(&name))
            {
                continue;
            }
            if !options.show_hidden && name.starts_with('.') {
                continue;
            }

            let metadata = match stat(directory_handle, Path::new(&name), FollowSymlinks::No) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                    entries.push(make_inaccessible(&clean_relative, &name));
                    continue;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(map_io(&error)),
            };
            if !options.show_hidden && is_hidden(&name, &metadata) {
                continue;
            }
            let is_reparse = is_capability_link_or_reparse(&metadata);
            let is_directory = metadata.is_dir() && !is_reparse;
            let relative = clean_relative.join(&name);

            let normalized_name = name.to_ascii_lowercase();
            if !options.show_ignored
                && (default_ignored.contains(normalized_name.as_str())
                    || ignore
                        .as_ref()
                        .is_some_and(|matcher| matcher.is_ignored(&relative, is_directory)))
            {
                continue;
            }

            let relative_path = relative.to_string_lossy().replace('\\', "/");
            let kind = if is_reparse {
                EntryKind::Symlink
            } else if is_directory {
                EntryKind::Directory
            } else {
                EntryKind::File
            };
            entries.push(TreeEntry {
                id: relative_path.clone(),
                name,
                relative_path,
                kind,
                inaccessible: false,
            });
        }

        sort_entries(&mut entries);

        if offset > entries.len() {
            return Err(WorkspaceError::InvalidPath);
        }
        let end = offset.saturating_add(options.limit).min(entries.len());
        let next_cursor = (end < entries.len()).then(|| encode_cursor(end));
        let page_entries = entries[offset..end].to_vec();
        Ok(ListPage {
            entries: page_entries,
            next_cursor,
            truncated: end < entries.len(),
        })
    }

    pub(crate) fn root_handle(&self) -> &File {
        &self.root_handle
    }

    pub(crate) fn ensure_root_valid(&self) -> Result<(), WorkspaceError> {
        verify_retained_root(&self.root, &self.root_handle)
    }
}

pub(crate) fn is_default_ignored_path(relative_path: &str) -> bool {
    relative_path.split('/').any(|component| {
        DEFAULT_IGNORED_NAMES
            .iter()
            .any(|ignored| component.eq_ignore_ascii_case(ignored))
    })
}

fn sort_entries(entries: &mut [TreeEntry]) {
    entries.sort_by(|left, right| {
        kind_rank(left.kind)
            .cmp(&kind_rank(right.kind))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.name.cmp(&right.name))
    });
}

fn is_hidden(name: &str, metadata: &CapabilityMetadata) -> bool {
    #[cfg(windows)]
    let attributes = metadata.file_attributes();
    #[cfg(not(windows))]
    let attributes = {
        let _ = metadata;
        0
    };
    is_hidden_attributes(name, attributes)
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

fn is_hidden_attributes(name: &str, attributes: u32) -> bool {
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    name.starts_with('.') || attributes & FILE_ATTRIBUTE_HIDDEN != 0
}

fn make_inaccessible(parent: &Path, name: &str) -> TreeEntry {
    let relative_path = parent.join(name).to_string_lossy().replace('\\', "/");
    TreeEntry {
        id: relative_path.clone(),
        name: name.to_owned(),
        relative_path,
        kind: EntryKind::Directory,
        inaccessible: true,
    }
}

const fn kind_rank(kind: EntryKind) -> u8 {
    match kind {
        EntryKind::Directory => 0,
        EntryKind::File => 1,
        EntryKind::Symlink => 2,
    }
}

fn encode_cursor(offset: usize) -> String {
    format!("v1.{offset}")
}

fn decode_cursor(cursor: Option<&str>) -> Result<usize, WorkspaceError> {
    match cursor {
        None | Some("") => Ok(0),
        Some(cursor) => cursor
            .strip_prefix("v1.")
            .and_then(|offset| offset.parse::<usize>().ok())
            .filter(|offset| *offset <= MAX_SCANNED_ENTRIES)
            .ok_or(WorkspaceError::InvalidPath),
    }
}

struct IgnoreRules {
    root: PathBuf,
    // Lowest precedence first: repository exclude, root .gitignore, then
    // progressively deeper .gitignore files.
    matchers: Vec<Gitignore>,
}

impl IgnoreRules {
    fn empty(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
            matchers: Vec::new(),
        }
    }

    fn is_ignored(&self, relative: &Path, is_directory: bool) -> bool {
        let candidate = self.root.join(relative);
        let mut ignored = false;
        for matcher in &self.matchers {
            let matched = matcher.matched_path_or_any_parents(&candidate, is_directory);
            if matched.is_ignore() {
                ignored = true;
            } else if matched.is_whitelist() {
                ignored = false;
            }
        }
        ignored
    }
}

#[derive(Default)]
struct IgnoreBudget {
    bytes: usize,
    lines: usize,
    matchers: usize,
}

impl IgnoreBudget {
    fn remaining_bytes(&self) -> usize {
        MAX_IGNORE_CHAIN_BYTES.saturating_sub(self.bytes)
    }

    fn remaining_lines(&self) -> usize {
        MAX_IGNORE_CHAIN_LINES.saturating_sub(self.lines)
    }
}

enum IgnoreMatcherOutcome {
    MissingOrRejected,
    Matcher(Gitignore),
    BudgetExhausted,
}

enum IgnoreReadOutcome {
    MissingOrRejected,
    Contents(String),
    BudgetExhausted,
}

fn build_gitignore(root: &Path, requested: &Path, directory: &DirectoryCapability) -> IgnoreRules {
    // Count probes, not just files that happen to exist. This bounds work in a
    // very deep tree even when every ancestor is missing `.gitignore`.
    if directory.handles().len().saturating_add(1) > MAX_IGNORE_CHAIN_FILE_PROBES {
        return IgnoreRules::empty(root);
    }

    let mut matchers = Vec::new();
    let mut budget = IgnoreBudget::default();

    // Repository-local excludes have lower precedence than every .gitignore.
    if let Some(root_handle) = directory.handles().first()
        && let Ok(git_info) = DirectoryCapability::open(root_handle, Path::new(".git/info"))
        && let Ok(handle) = git_info.handle()
        && let outcome = build_ignore_file(
            handle,
            Path::new("exclude"),
            root,
            root.join(".git").join("info").join("exclude"),
            &mut budget,
        )
    {
        match outcome {
            IgnoreMatcherOutcome::Matcher(matcher) => matchers.push(matcher),
            IgnoreMatcherOutcome::BudgetExhausted => return IgnoreRules::empty(root),
            IgnoreMatcherOutcome::MissingOrRejected => {}
        }
    }

    let mut source_directory = PathBuf::new();
    let mut components = requested.components();
    for handle in directory.handles() {
        let scope = root.join(&source_directory);
        match build_ignore_file(
            handle,
            Path::new(".gitignore"),
            &scope,
            scope.join(".gitignore"),
            &mut budget,
        ) {
            IgnoreMatcherOutcome::Matcher(matcher) => matchers.push(matcher),
            IgnoreMatcherOutcome::BudgetExhausted => return IgnoreRules::empty(root),
            IgnoreMatcherOutcome::MissingOrRejected => {}
        }
        if let Some(component) = components.next() {
            source_directory.push(component.as_os_str());
        }
    }

    IgnoreRules {
        root: root.to_path_buf(),
        matchers,
    }
}

fn build_ignore_file(
    directory: &File,
    name: &Path,
    scope: &Path,
    source: PathBuf,
    budget: &mut IgnoreBudget,
) -> IgnoreMatcherOutcome {
    let contents = match read_ignore_file(directory, name, budget) {
        IgnoreReadOutcome::Contents(contents) => contents,
        IgnoreReadOutcome::BudgetExhausted => return IgnoreMatcherOutcome::BudgetExhausted,
        IgnoreReadOutcome::MissingOrRejected => return IgnoreMatcherOutcome::MissingOrRejected,
    };
    if budget.matchers >= MAX_IGNORE_CHAIN_MATCHERS {
        return IgnoreMatcherOutcome::BudgetExhausted;
    }
    budget.matchers += 1;

    let mut builder = GitignoreBuilder::new(scope);
    for (index, line) in contents.lines().enumerate() {
        let line = if index == 0 {
            line.trim_start_matches('\u{feff}')
        } else {
            line
        };
        let _ = builder.add_line(Some(source.clone()), line);
    }
    match builder.build() {
        Ok(matcher) => IgnoreMatcherOutcome::Matcher(matcher),
        Err(_) => IgnoreMatcherOutcome::MissingOrRejected,
    }
}

fn read_ignore_file(directory: &File, name: &Path, budget: &mut IgnoreBudget) -> IgnoreReadOutcome {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    let Ok(file) = open_capability_file(directory, name, &options) else {
        return IgnoreReadOutcome::MissingOrRejected;
    };
    let Ok(metadata) = file.metadata() else {
        return IgnoreReadOutcome::MissingOrRejected;
    };
    if !metadata.is_file()
        || is_link_or_reparse(&metadata)
        || metadata.len() > MAX_IGNORE_FILE_BYTES as u64
    {
        return IgnoreReadOutcome::MissingOrRejected;
    }
    if metadata.len() > budget.remaining_bytes() as u64 {
        return IgnoreReadOutcome::BudgetExhausted;
    }

    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    let read_limit = MAX_IGNORE_FILE_BYTES
        .min(budget.remaining_bytes())
        .saturating_add(1);
    if file
        .take(read_limit as u64)
        .read_to_end(&mut bytes)
        .is_err()
    {
        return IgnoreReadOutcome::MissingOrRejected;
    }
    if bytes.len() > MAX_IGNORE_FILE_BYTES {
        return IgnoreReadOutcome::MissingOrRejected;
    }
    if bytes.len() > budget.remaining_bytes() {
        return IgnoreReadOutcome::BudgetExhausted;
    }
    let line_count = bytes.iter().filter(|byte| **byte == b'\n').count()
        + usize::from(!bytes.is_empty() && bytes.last() != Some(&b'\n'));
    if line_count > MAX_IGNORE_FILE_LINES {
        return IgnoreReadOutcome::MissingOrRejected;
    }
    if line_count > budget.remaining_lines() {
        return IgnoreReadOutcome::BudgetExhausted;
    }
    let Ok(contents) = String::from_utf8(bytes) else {
        return IgnoreReadOutcome::MissingOrRejected;
    };
    budget.bytes += contents.len();
    budget.lines += line_count;
    IgnoreReadOutcome::Contents(contents)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{Duration, Instant};

    use tempfile::TempDir;

    use super::*;

    fn fixture() -> (TempDir, Workspace) {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir(directory.path().join("src")).expect("create src");
        fs::create_dir(directory.path().join("node_modules")).expect("create ignored");
        fs::write(directory.path().join("README.md"), "not read by service").expect("write file");
        fs::write(directory.path().join("alpha.txt"), "a").expect("write file");
        fs::write(directory.path().join(".secret"), "hidden").expect("write hidden");
        fs::create_dir(directory.path().join(".config")).expect("create hidden directory");
        fs::create_dir(directory.path().join(".git")).expect("create git metadata directory");
        let workspace = Workspace::open(directory.path()).expect("open workspace");
        (directory, workspace)
    }

    fn relative_text(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    fn assert_visible(workspace: &Workspace, relative: &Path, name: &str) {
        let page = workspace
            .list(ListOptions {
                relative_path: relative_text(relative),
                ..ListOptions::default()
            })
            .expect("list budgeted directory");
        assert!(page.entries.iter().any(|entry| entry.name == name));
    }

    fn padded_ignore(pattern: &str) -> Vec<u8> {
        let mut contents = format!("{pattern}\n#").into_bytes();
        contents.resize(MAX_IGNORE_FILE_BYTES, b'x');
        contents
    }

    fn ignore_with_lines(pattern: &str, lines: usize) -> String {
        let mut contents = format!("{pattern}\n");
        contents.push_str(&"#\n".repeat(lines.saturating_sub(1)));
        contents
    }

    #[test]
    fn lists_direct_children_directories_first_and_paginates() {
        let (_directory, workspace) = fixture();
        let first = workspace
            .list(ListOptions {
                limit: 2,
                ..ListOptions::default()
            })
            .expect("first page");
        assert_eq!(first.entries.len(), 2);
        assert_eq!(first.entries[0].name, "src");
        assert!(first.truncated);

        let second = workspace
            .list(ListOptions {
                cursor: first.next_cursor,
                limit: 2,
                ..ListOptions::default()
            })
            .expect("second page");
        assert_eq!(second.entries.len(), 1);
        assert_eq!(second.entries[0].name, "README.md");
    }

    #[test]
    fn only_active_root_import_staging_is_hidden() {
        let (directory, workspace) = fixture();
        let session = workspace
            .begin_import(
                "",
                "final-folder",
                crate::CreateEntryKind::Directory,
                None,
                "listing-active",
            )
            .expect("begin active import");
        let active_name = workspace
            .active_import_staging_names()
            .into_iter()
            .next()
            .expect("registered stage");
        let orphan_name = format!("{}orphan", crate::mutation::IMPORT_STAGING_PREFIX);
        fs::write(directory.path().join(&orphan_name), "partial").expect("orphan fixture");
        fs::create_dir(directory.path().join("container")).expect("nested container");
        let nested_name = format!("{}nested", crate::mutation::IMPORT_STAGING_PREFIX);
        fs::write(
            directory.path().join("container").join(&nested_name),
            "nested",
        )
        .expect("nested prefix fixture");

        let page = workspace
            .list(ListOptions {
                show_hidden: true,
                show_ignored: true,
                limit: 500,
                ..ListOptions::default()
            })
            .expect("list all visible entries");
        assert!(page.entries.iter().all(|entry| entry.name != active_name));
        assert!(page.entries.iter().any(|entry| entry.name == orphan_name));

        let nested = workspace
            .list(ListOptions {
                relative_path: "container".to_owned(),
                show_hidden: true,
                show_ignored: true,
                limit: 500,
                ..ListOptions::default()
            })
            .expect("list nested prefix entry");
        assert!(nested.entries.iter().any(|entry| entry.name == nested_name));

        drop(session);
        assert!(workspace.active_import_staging_names().is_empty());
    }

    #[test]
    fn honors_gitignore_and_visibility_toggles() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join(".gitignore"), "ignored.txt\n").expect("gitignore");
        fs::write(directory.path().join("ignored.txt"), "x").expect("ignored file");

        let normal = workspace.list(ListOptions::default()).expect("normal list");
        assert!(
            normal
                .entries
                .iter()
                .all(|entry| entry.name != "ignored.txt")
        );
        assert!(
            normal
                .entries
                .iter()
                .all(|entry| entry.name != "node_modules")
        );
        assert!(normal.entries.iter().all(|entry| entry.name != ".secret"));
        assert!(normal.entries.iter().all(|entry| entry.name != ".config"));
        assert!(normal.entries.iter().all(|entry| entry.name != ".git"));

        let visible = workspace
            .list(ListOptions {
                show_hidden: true,
                show_ignored: true,
                ..ListOptions::default()
            })
            .expect("visible list");
        assert!(
            visible
                .entries
                .iter()
                .any(|entry| entry.name == "ignored.txt")
        );
        assert!(
            visible
                .entries
                .iter()
                .any(|entry| entry.name == "node_modules")
        );
        assert!(visible.entries.iter().any(|entry| entry.name == ".secret"));
        assert!(
            visible
                .entries
                .iter()
                .any(|entry| entry.name == ".config" && entry.kind == EntryKind::Directory)
        );
        assert!(
            visible
                .entries
                .iter()
                .any(|entry| entry.name == ".git" && entry.kind == EntryKind::Directory)
        );
    }

    #[test]
    fn nested_anchored_gitignore_is_scoped_to_its_directory() {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir_all(directory.path().join("sub/deep")).expect("subtree");
        fs::write(directory.path().join("only.txt"), "root").expect("root file");
        fs::write(directory.path().join("sub/only.txt"), "sub").expect("sub file");
        fs::write(directory.path().join("sub/deep/only.txt"), "deep").expect("deep file");
        fs::write(directory.path().join("sub/.gitignore"), "/only.txt\n").expect("nested ignore");
        let workspace = Workspace::open(directory.path()).expect("workspace");

        let root = workspace.list(ListOptions::default()).expect("root list");
        assert!(root.entries.iter().any(|entry| entry.name == "only.txt"));
        let sub = workspace
            .list(ListOptions {
                relative_path: "sub".to_owned(),
                ..ListOptions::default()
            })
            .expect("sub list");
        assert!(sub.entries.iter().all(|entry| entry.name != "only.txt"));
        let deep = workspace
            .list(ListOptions {
                relative_path: "sub/deep".to_owned(),
                ..ListOptions::default()
            })
            .expect("deep list");
        assert!(deep.entries.iter().any(|entry| entry.name == "only.txt"));
    }

    #[test]
    fn nested_unanchored_patterns_do_not_leak_to_siblings() {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir(directory.path().join("left")).expect("left");
        fs::create_dir(directory.path().join("right")).expect("right");
        fs::write(directory.path().join("left/.gitignore"), "*.tmp\n").expect("left ignore");
        fs::write(directory.path().join("left/value.tmp"), "left").expect("left file");
        fs::write(directory.path().join("right/value.tmp"), "right").expect("right file");
        let workspace = Workspace::open(directory.path()).expect("workspace");

        let left = workspace
            .list(ListOptions {
                relative_path: "left".to_owned(),
                ..ListOptions::default()
            })
            .expect("left list");
        assert!(left.entries.iter().all(|entry| entry.name != "value.tmp"));
        let right = workspace
            .list(ListOptions {
                relative_path: "right".to_owned(),
                ..ListOptions::default()
            })
            .expect("right list");
        assert!(right.entries.iter().any(|entry| entry.name == "value.tmp"));
    }

    #[test]
    fn deeper_gitignore_negation_overrides_parent_rule() {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir(directory.path().join("sub")).expect("sub");
        fs::write(directory.path().join(".gitignore"), "*.log\n").expect("root ignore");
        fs::write(directory.path().join("sub/.gitignore"), "!keep.log\n").expect("nested negation");
        fs::write(directory.path().join("sub/keep.log"), "keep").expect("kept file");
        fs::write(directory.path().join("sub/drop.log"), "drop").expect("ignored file");
        let workspace = Workspace::open(directory.path()).expect("workspace");

        let sub = workspace
            .list(ListOptions {
                relative_path: "sub".to_owned(),
                ..ListOptions::default()
            })
            .expect("sub list");
        assert!(sub.entries.iter().any(|entry| entry.name == "keep.log"));
        assert!(sub.entries.iter().all(|entry| entry.name != "drop.log"));
    }

    #[test]
    fn excessive_ignore_file_probes_fail_open_without_reading_the_chain() {
        let directory = TempDir::new().expect("temp dir");
        fs::write(directory.path().join(".gitignore"), "hidden.txt\n").expect("root ignore");
        let mut relative = PathBuf::new();
        for index in 0..MAX_IGNORE_CHAIN_FILE_PROBES {
            relative.push(format!("d{index}"));
            fs::create_dir(directory.path().join(&relative)).expect("nested directory");
        }
        fs::write(
            directory.path().join(&relative).join("hidden.txt"),
            "visible",
        )
        .expect("candidate");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        assert_visible(&workspace, &relative, "hidden.txt");
    }

    #[test]
    fn excessive_ignore_matchers_discard_partial_parent_rules() {
        let directory = TempDir::new().expect("temp dir");
        fs::write(directory.path().join(".gitignore"), "hidden.txt\n").expect("root ignore");
        let mut relative = PathBuf::new();
        for index in 0..MAX_IGNORE_CHAIN_MATCHERS {
            relative.push(format!("d{index}"));
            let current = directory.path().join(&relative);
            fs::create_dir(&current).expect("nested directory");
            fs::write(current.join(".gitignore"), format!("never-{index}\n"))
                .expect("nested ignore");
        }
        fs::write(
            directory.path().join(&relative).join("hidden.txt"),
            "visible",
        )
        .expect("candidate");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        assert_visible(&workspace, &relative, "hidden.txt");
    }

    #[test]
    fn aggregate_ignore_byte_exhaustion_discards_partial_rules() {
        let directory = TempDir::new().expect("temp dir");
        fs::write(
            directory.path().join(".gitignore"),
            padded_ignore("hidden.txt"),
        )
        .expect("root ignore");
        let files_needed = MAX_IGNORE_CHAIN_BYTES / MAX_IGNORE_FILE_BYTES + 1;
        let mut relative = PathBuf::new();
        for index in 1..files_needed {
            relative.push(format!("d{index}"));
            let current = directory.path().join(&relative);
            fs::create_dir(&current).expect("nested directory");
            fs::write(
                current.join(".gitignore"),
                padded_ignore(&format!("never-{index}")),
            )
            .expect("nested ignore");
        }
        fs::write(
            directory.path().join(&relative).join("hidden.txt"),
            "visible",
        )
        .expect("candidate");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        assert_visible(&workspace, &relative, "hidden.txt");
    }

    #[test]
    fn aggregate_ignore_line_exhaustion_discards_partial_rules() {
        let directory = TempDir::new().expect("temp dir");
        let lines_per_file = MAX_IGNORE_CHAIN_LINES / 2 + 1;
        fs::write(
            directory.path().join(".gitignore"),
            ignore_with_lines("hidden.txt", lines_per_file),
        )
        .expect("root ignore");
        fs::create_dir(directory.path().join("sub")).expect("sub");
        fs::write(
            directory.path().join("sub/.gitignore"),
            ignore_with_lines("never", lines_per_file),
        )
        .expect("nested ignore");
        fs::write(directory.path().join("sub/hidden.txt"), "visible").expect("candidate");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        assert_visible(&workspace, Path::new("sub"), "hidden.txt");
    }

    #[test]
    fn honors_git_info_exclude() {
        let (directory, workspace) = fixture();
        fs::create_dir_all(directory.path().join(".git/info")).expect("git info");
        fs::write(
            directory.path().join(".git/info/exclude"),
            "excluded-by-info.txt\n",
        )
        .expect("exclude file");
        fs::write(directory.path().join("excluded-by-info.txt"), "x").expect("excluded file");

        let page = workspace.list(ListOptions::default()).expect("list");
        assert!(
            page.entries
                .iter()
                .all(|entry| entry.name != "excluded-by-info.txt")
        );
    }

    #[test]
    fn oversized_ignore_files_are_rejected_before_parsing() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("would-be-ignored.txt"), "x").expect("candidate");
        let mut oversized = b"would-be-ignored.txt\n".to_vec();
        oversized.resize(MAX_IGNORE_FILE_BYTES + 1, b'#');
        fs::write(directory.path().join(".gitignore"), oversized).expect("oversized ignore");

        let page = workspace.list(ListOptions::default()).expect("list");
        assert!(
            page.entries
                .iter()
                .any(|entry| entry.name == "would-be-ignored.txt")
        );
    }

    #[test]
    fn excessive_ignore_lines_are_rejected_before_parsing() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("would-be-ignored.txt"), "x").expect("candidate");
        let mut excessive = String::from("would-be-ignored.txt\n");
        excessive.push_str(&"#\n".repeat(MAX_IGNORE_FILE_LINES));
        fs::write(directory.path().join(".gitignore"), excessive).expect("excessive ignore");

        let page = workspace.list(ListOptions::default()).expect("list");
        assert!(
            page.entries
                .iter()
                .any(|entry| entry.name == "would-be-ignored.txt")
        );
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

    #[cfg(any(unix, windows))]
    #[test]
    fn reparse_ignore_and_exclude_files_are_not_followed() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        let external_ignore = outside.path().join("ignore");
        let external_exclude = outside.path().join("exclude");
        fs::write(&external_ignore, "from-ignore.txt\n").expect("external ignore");
        fs::write(&external_exclude, "from-exclude.txt\n").expect("external exclude");
        fs::write(directory.path().join("from-ignore.txt"), "x").expect("ignore candidate");
        fs::write(directory.path().join("from-exclude.txt"), "x").expect("exclude candidate");
        fs::create_dir_all(directory.path().join(".git/info")).expect("git info");

        if !symlink_file(&external_ignore, &directory.path().join(".gitignore"))
            || !symlink_file(
                &external_exclude,
                &directory.path().join(".git/info/exclude"),
            )
        {
            // Windows requires Developer Mode or the symlink privilege. The
            // same no-follow handle path is exercised when it is available.
            return;
        }

        let page = workspace.list(ListOptions::default()).expect("list");
        assert!(
            page.entries
                .iter()
                .any(|entry| entry.name == "from-ignore.txt")
        );
        assert!(
            page.entries
                .iter()
                .any(|entry| entry.name == "from-exclude.txt")
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn reparse_git_metadata_directory_is_not_followed() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        fs::create_dir_all(outside.path().join("info")).expect("outside info");
        fs::write(
            outside.path().join("info/exclude"),
            "from-reparse-git.txt\n",
        )
        .expect("external exclude");
        fs::write(directory.path().join("from-reparse-git.txt"), "x").expect("candidate");
        fs::remove_dir(directory.path().join(".git")).expect("remove fixture git metadata");
        if !symlink_directory(outside.path(), &directory.path().join(".git")) {
            return;
        }

        let page = workspace.list(ListOptions::default()).expect("list");
        assert!(
            page.entries
                .iter()
                .any(|entry| entry.name == "from-reparse-git.txt")
        );
    }

    #[test]
    fn lists_ten_thousand_files_within_budget() {
        let directory = TempDir::new().expect("temp dir");
        for index in 0..10_000 {
            fs::File::create(directory.path().join(format!("entry-{index:05}.txt")))
                .expect("create synthetic entry");
        }
        let workspace = Workspace::open(directory.path()).expect("workspace");
        let started = Instant::now();
        let page = workspace
            .list(ListOptions {
                limit: MAX_PAGE_SIZE,
                ..ListOptions::default()
            })
            .expect("large listing");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert_eq!(page.entries.len(), MAX_PAGE_SIZE);
        assert_eq!(page.entries[0].name, "entry-00000.txt");
        assert!(page.truncated);
    }

    #[test]
    #[ignore = "manual high-cardinality filesystem guard coverage"]
    fn hundred_thousand_file_directory_hits_scan_budget() {
        let directory = TempDir::new().expect("temp dir");
        for index in 0..100_000 {
            fs::File::create(directory.path().join(format!("entry-{index:06}.txt")))
                .expect("create synthetic entry");
        }
        let workspace = Workspace::open(directory.path()).expect("workspace");
        let error = workspace
            .list(ListOptions::default())
            .expect_err("scan must be bounded");
        assert_eq!(error.code(), crate::ErrorCode::TooManyEntries);
    }

    #[test]
    fn recognizes_windows_hidden_attribute_and_dot_names() {
        assert!(is_hidden_attributes("ordinary.txt", 0x2));
        assert!(is_hidden_attributes(".env", 0));
        assert!(!is_hidden_attributes("ordinary.txt", 0));
    }

    #[test]
    fn traversal_is_rejected() {
        let (_directory, workspace) = fixture();
        let error = workspace
            .list(ListOptions {
                relative_path: "../outside".to_owned(),
                ..ListOptions::default()
            })
            .expect_err("traversal must fail");
        assert_eq!(error.code(), crate::ErrorCode::InvalidPath);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn every_list_revalidates_the_retained_root_identity() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let moved = parent.path().join("moved");
        fs::create_dir(&root).expect("root");
        fs::write(root.join("original.txt"), "original").expect("original marker");
        let workspace = Workspace::open(&root).expect("workspace");
        assert!(workspace.root_is_valid());

        fs::rename(&root, &moved).expect("retained handle must permit root move");
        assert!(!workspace.root_is_valid());
        assert_eq!(
            workspace
                .list(ListOptions::default())
                .expect_err("stale root name must fail")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );

        fs::create_dir(&root).expect("replacement root");
        fs::write(root.join("replacement.txt"), "replacement").expect("replacement marker");
        assert!(!workspace.root_is_valid());
        assert_eq!(
            workspace
                .list(ListOptions::default())
                .expect_err("replacement identity must fail")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_visible_but_cannot_be_traversed() {
        use std::os::unix::fs::symlink;

        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        symlink(outside.path(), directory.path().join("escape")).expect("symlink");
        let root = workspace.list(ListOptions::default()).expect("root list");
        assert_eq!(
            root.entries
                .iter()
                .find(|entry| entry.name == "escape")
                .map(|entry| entry.kind),
            Some(EntryKind::Symlink)
        );
        assert!(
            workspace
                .list(ListOptions {
                    relative_path: "escape".to_owned(),
                    ..ListOptions::default()
                })
                .is_err()
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_reparse_escape_cannot_be_traversed() {
        use std::os::windows::fs::symlink_dir;

        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        if symlink_dir(outside.path(), directory.path().join("escape")).is_err() {
            // Creating symlinks requires Developer Mode or the corresponding
            // privilege. The same reparse-bit branch covers junctions.
            return;
        }
        let root = workspace.list(ListOptions::default()).expect("root list");
        assert_eq!(
            root.entries
                .iter()
                .find(|entry| entry.name == "escape")
                .map(|entry| entry.kind),
            Some(EntryKind::Symlink)
        );
        assert!(
            workspace
                .list(ListOptions {
                    relative_path: "escape".to_owned(),
                    ..ListOptions::default()
                })
                .is_err()
        );
    }
}
