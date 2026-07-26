//! Security-focused access to a single workspace root.
//!
//! In addition to read-only directory metadata, this crate exposes narrow text
//! preview, save, and bounded workspace-entry mutations. Native policy
//! classifies the relative file name, denies sensitive and non-text classes,
//! and permits at most 64 KiB of strict UTF-8 text. Saving requires the version
//! returned by a complete preview and can update only that existing file;
//! there is no general file reader or raw-byte API. All
//! renderer-controlled paths are relative, validated component-by-component,
//! and opened through retained no-follow capabilities rooted at the workspace.

mod error;
mod listing;
mod mutation;
mod path_guard;
mod preview;
mod settings;
mod watcher;

pub use error::{ErrorCode, WorkspaceError};
pub use listing::{EntryKind, ListOptions, ListPage, TreeEntry, Workspace};
pub use mutation::CreateEntryKind;
pub use preview::{
    MAX_PREVIEW_BYTES, PreviewKind, PreviewLineEnding, PreviewResult, PreviewUnsupportedReason,
};
pub use settings::{
    PreparedSettings, SETTINGS_CANDIDATE_PREFIX, SETTINGS_CANDIDATE_SUFFIX,
    SETTINGS_CANDIDATE_TOKEN_LENGTH, Settings, SettingsPatch, SettingsStore,
};
pub use watcher::{
    Change, ChangeBatch, ChangeKind, WatchSubscription, WatchVisibility, WatchVisibilityHandle,
    WorkspaceWatcher,
};
