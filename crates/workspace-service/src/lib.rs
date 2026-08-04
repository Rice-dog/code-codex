//! Security-focused access to a single workspace root.
//!
//! In addition to read-only directory metadata, this crate exposes narrow text
//! preview, save, and bounded workspace-entry mutations. Native policy
//! classifies the relative file name, denies sensitive and non-text classes,
//! and permits at most 64 KiB of strict UTF-8 text. Saving requires the version
//! returned by a complete preview and can update only that existing file. A
//! separate allowlisted media API exposes bounded, versioned chunks for images,
//! videos, PDFs, audio, Jupyter notebooks, Office Open XML documents, and
//! validated legacy PowerPoint presentations with native total-size ceilings;
//! there is no general file reader. All
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
    MAX_AUDIO_PREVIEW_BYTES, MAX_IMAGE_PREVIEW_BYTES, MAX_MEDIA_CHUNK_BYTES,
    MAX_NOTEBOOK_PREVIEW_BYTES, MAX_OFFICE_PREVIEW_BYTES, MAX_PDF_PREVIEW_BYTES, MAX_PREVIEW_BYTES,
    MAX_VIDEO_PREVIEW_BYTES, MEDIA_CHUNK_BYTES, MediaChunk, MediaInfo, MediaKind, PreviewKind,
    PreviewLineEnding, PreviewResult, PreviewUnsupportedReason,
};
pub use settings::{
    PreparedSettings, SETTINGS_CANDIDATE_PREFIX, SETTINGS_CANDIDATE_SUFFIX,
    SETTINGS_CANDIDATE_TOKEN_LENGTH, Settings, SettingsPatch, SettingsStore,
};
pub use watcher::{
    Change, ChangeBatch, ChangeKind, WatchSubscription, WatchVisibility, WatchVisibilityHandle,
    WorkspaceWatcher,
};
