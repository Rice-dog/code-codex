use serde::{Deserialize, Serialize};

use workspace_service::{CreateEntryKind, SettingsPatch};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContextResult {
    pub(super) thread_id: Option<String>,
    pub(super) project_name: String,
    pub(super) root_name: String,
    // The absolute workspace root. Sent once so the renderer can build absolute
    // paths (e.g. Copy Absolute Path) locally without a per-action round-trip.
    pub(super) root_path: String,
    pub(super) compatible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ContextParams {
    #[serde(default)]
    pub(super) thread_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ListParams {
    #[serde(default)]
    pub(super) relative_path: String,
    #[serde(default)]
    pub(super) cursor: Option<String>,
    #[serde(default)]
    pub(super) limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GitHistoryParams {
    #[serde(default)]
    pub(super) skip: Option<usize>,
    #[serde(default)]
    pub(super) limit: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct GitCommitSummary {
    pub(super) hash: String,
    pub(super) short_hash: String,
    pub(super) author: String,
    pub(super) authored_at: String,
    pub(super) subject: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GitHistoryResult {
    pub(super) branch: String,
    pub(super) detached: bool,
    pub(super) commits: Vec<GitCommitSummary>,
    pub(super) has_more: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GitCommitParams {
    pub(super) hash: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct GitChangedFile {
    pub(super) status: String,
    pub(super) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) old_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GitCommitResult {
    pub(super) hash: String,
    pub(super) short_hash: String,
    pub(super) author: String,
    pub(super) author_email: String,
    pub(super) authored_at: String,
    pub(super) message: String,
    pub(super) files: Vec<GitChangedFile>,
    pub(super) files_truncated: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GitDiffParams {
    pub(super) hash: String,
    pub(super) path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GitDiffResult {
    pub(super) path: String,
    pub(super) content: String,
    pub(super) truncated: bool,
}

pub(super) struct BoundedGitOutput {
    pub(super) bytes: Vec<u8>,
    pub(super) truncated: bool,
}

pub(super) struct GitCommandOutput {
    pub(super) stdout: BoundedGitOutput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PreviewParams {
    pub(super) relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PreviewSaveParams {
    pub(super) relative_path: String,
    pub(super) expected_version: String,
    pub(super) content_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MediaInfoParams {
    pub(super) relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MediaChunkParams {
    pub(super) relative_path: String,
    pub(super) offset: u64,
    pub(super) length: usize,
    pub(super) expected_size_bytes: u64,
    pub(super) expected_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MediaChunkResult {
    pub(super) offset: u64,
    pub(super) data_base64: String,
    pub(super) eof: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ModelResourceInfoParams {
    pub(super) model_relative_path: String,
    pub(super) resource_uri: String,
    pub(super) expected_model_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ModelResourceChunkParams {
    pub(super) model_relative_path: String,
    pub(super) resource_uri: String,
    pub(super) expected_model_version: String,
    pub(super) offset: u64,
    pub(super) length: usize,
    pub(super) expected_size_bytes: u64,
    pub(super) expected_version: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum EntryCreateKind {
    File,
    Directory,
}

impl From<EntryCreateKind> for CreateEntryKind {
    fn from(value: EntryCreateKind) -> Self {
        match value {
            EntryCreateKind::File => Self::File,
            EntryCreateKind::Directory => Self::Directory,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EntryCreateParams {
    pub(super) parent_relative_path: String,
    pub(super) name: String,
    pub(super) kind: EntryCreateKind,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EntryRenameParams {
    pub(super) relative_path: String,
    pub(super) new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EntryMoveParams {
    pub(super) relative_path: String,
    pub(super) destination_parent_relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct BatchCopyParams {
    pub(super) source_paths: Vec<String>,
    pub(super) target_directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct BatchMoveParams {
    pub(super) source_paths: Vec<String>,
    pub(super) target_directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EntryPathParams {
    pub(super) relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ImportBeginParams {
    pub(super) destination_parent_relative_path: String,
    pub(super) name: String,
    pub(super) kind: EntryCreateKind,
    #[serde(default, deserialize_with = "deserialize_optional_import_size")]
    pub(super) size_bytes: Option<u64>,
}

pub(super) fn deserialize_optional_import_size<'de, D>(
    deserializer: D,
) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    u64::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ImportDirectoryParams {
    pub(super) session_id: String,
    pub(super) relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ImportFileBeginParams {
    pub(super) session_id: String,
    pub(super) relative_path: String,
    pub(super) size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ImportChunkParams {
    pub(super) session_id: String,
    pub(super) offset: u64,
    pub(super) data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ImportSessionParams {
    pub(super) session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct SettingsWrapper {
    pub(super) settings: SettingsPatch,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct WindowTransparencyParams {
    pub(super) enabled: bool,
}
