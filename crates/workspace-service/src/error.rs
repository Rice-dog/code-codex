use serde::Serialize;
use thiserror::Error;

/// Stable error codes safe to cross the renderer boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidPath,
    OutsideWorkspace,
    NotFound,
    AccessDenied,
    NotDirectory,
    TooManyEntries,
    ContentTooLarge,
    Conflict,
    NotEditable,
    InvalidSettings,
    Internal,
}

/// Errors deliberately omit the path that caused the failure.
#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("the relative path is invalid")]
    InvalidPath,
    #[error("the requested path is outside the workspace")]
    OutsideWorkspace,
    #[error("the requested path was not found")]
    NotFound,
    #[error("access to the requested path was denied")]
    AccessDenied,
    #[error("the requested path is not a directory")]
    NotDirectory,
    #[error("the directory contains too many entries")]
    TooManyEntries,
    #[error("the edited content is too large")]
    ContentTooLarge,
    #[error("the requested change conflicts with the current workspace state")]
    EntryConflict,
    #[error("the file changed since it was previewed")]
    Conflict,
    #[error("the file cannot be edited through the preview")]
    NotEditable,
    #[error("the settings value is invalid")]
    InvalidSettings,
    #[error("an internal workspace error occurred")]
    Internal,
}

impl WorkspaceError {
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidPath => ErrorCode::InvalidPath,
            Self::OutsideWorkspace => ErrorCode::OutsideWorkspace,
            Self::NotFound => ErrorCode::NotFound,
            Self::AccessDenied => ErrorCode::AccessDenied,
            Self::NotDirectory => ErrorCode::NotDirectory,
            Self::TooManyEntries => ErrorCode::TooManyEntries,
            Self::ContentTooLarge => ErrorCode::ContentTooLarge,
            Self::EntryConflict | Self::Conflict => ErrorCode::Conflict,
            Self::NotEditable => ErrorCode::NotEditable,
            Self::InvalidSettings => ErrorCode::InvalidSettings,
            Self::Internal => ErrorCode::Internal,
        }
    }

    #[must_use]
    pub const fn public_message(&self) -> &'static str {
        match self {
            Self::InvalidPath => "The relative path is invalid.",
            Self::OutsideWorkspace => "The path is outside the active workspace.",
            Self::NotFound => "The requested path no longer exists.",
            Self::AccessDenied => "The requested path cannot be accessed.",
            Self::NotDirectory => "The requested path is not a directory.",
            Self::TooManyEntries => "The directory is too large to display safely.",
            Self::ContentTooLarge => "The edited file exceeds the 64 KiB limit.",
            Self::EntryConflict => {
                "The requested change conflicts with the current workspace state."
            }
            Self::Conflict => "The file changed on disk. Reload it before saving again.",
            Self::NotEditable => "This file cannot be edited in the preview.",
            Self::InvalidSettings => "One or more settings are invalid.",
            Self::Internal => "The workspace operation failed.",
        }
    }
}

pub(crate) fn map_io(error: &std::io::Error) -> WorkspaceError {
    use std::io::ErrorKind;

    match error.kind() {
        ErrorKind::NotFound => WorkspaceError::NotFound,
        ErrorKind::PermissionDenied => WorkspaceError::AccessDenied,
        _ => WorkspaceError::Internal,
    }
}
