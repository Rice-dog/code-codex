use std::collections::{HashSet, VecDeque};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use sha2::{Digest, Sha256};
use zip::{CompressionMethod, ZipArchive};

use crate::error::{WorkspaceError, map_io};
use crate::listing::Workspace;
use crate::path_guard::{
    DirectoryCapability, open_regular_file_for_update_nofollow, open_regular_file_nofollow,
    validate_relative,
};

pub const MAX_PREVIEW_BYTES: usize = 64 * 1024;
// Two MiB keeps the base64-encoded bridge response comfortably below the
// CDP message ceiling while bounding a 128-MiB preview to 64 chunks.
pub const MEDIA_CHUNK_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_MEDIA_CHUNK_BYTES: usize = MEDIA_CHUNK_BYTES;
pub const MAX_IMAGE_PREVIEW_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_VIDEO_PREVIEW_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_PDF_PREVIEW_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_AUDIO_PREVIEW_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_OFFICE_PREVIEW_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_NATIVE_POWERPOINT_PREVIEW_BYTES: u64 = 64 * 1024 * 1024;

pub const NATIVE_POWERPOINT_PREVIEW_MIME: &str = "application/vnd.code-codex.powerpoint-slides+zip";

const MEDIA_SIGNATURE_BYTES: usize = 64;
const MAX_OFFICE_ENTRIES: usize = 4_096;
const MAX_OFFICE_ENTRY_BYTES: u64 = 32 * 1024 * 1024;
const MAX_OFFICE_XML_BYTES: u64 = 8 * 1024 * 1024;
const MAX_OFFICE_UNCOMPRESSED_BYTES: u64 = 128 * 1024 * 1024;
const MAX_OFFICE_CONTENT_TYPES_BYTES: u64 = 1024 * 1024;
const MAX_OFFICE_ENTRY_NAME_BYTES: usize = 1_024;
const OFFICE_VALIDATION_BUFFER_BYTES: usize = 32 * 1024;
const MAX_OFFICE_VALIDATION_CACHE_ENTRIES: usize = 16;
const MAX_NATIVE_POWERPOINT_CACHE_ENTRIES: usize = 2;
const MIN_NATIVE_POWERPOINT_SOURCE_BYTES: u64 = 16 * 1024;
const MAX_NATIVE_POWERPOINT_SLIDES: usize = 256;
const MAX_NATIVE_POWERPOINT_SLIDE_BYTES: u64 = 16 * 1024 * 1024;
const NATIVE_POWERPOINT_WIDTH: u32 = 1_440;
const NATIVE_POWERPOINT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
    Pdf,
    Audio,
    Office,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub kind: MediaKind,
    pub mime_type: String,
    pub size_bytes: u64,
    pub version: String,
    pub chunk_size: usize,
    pub chunk_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaChunk {
    pub offset: u64,
    pub data: Vec<u8>,
    pub eof: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewKind {
    Text,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewUnsupportedReason {
    Sensitive,
    UnsupportedType,
    Binary,
    InvalidUtf8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewLineEnding {
    None,
    Lf,
    CrLf,
    Mixed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub kind: PreviewKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub size_bytes: u64,
    pub truncated: bool,
    pub editable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<PreviewUnsupportedReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_ending: Option<PreviewLineEnding>,
}

impl PreviewResult {
    fn text(
        text: String,
        size_bytes: u64,
        truncated: bool,
        version: Option<String>,
        line_ending: PreviewLineEnding,
    ) -> Self {
        let editable = !truncated && line_ending != PreviewLineEnding::Mixed && version.is_some();
        Self {
            kind: PreviewKind::Text,
            text: Some(text),
            size_bytes,
            truncated,
            editable,
            reason: None,
            version,
            line_ending: Some(line_ending),
        }
    }

    fn unsupported(reason: PreviewUnsupportedReason, size_bytes: u64, truncated: bool) -> Self {
        Self {
            kind: PreviewKind::Unsupported,
            text: None,
            size_bytes,
            truncated,
            editable: false,
            reason: Some(reason),
            version: None,
            line_ending: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewPolicy {
    Text,
    Unsupported(PreviewUnsupportedReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MediaPolicy {
    kind: MediaKind,
    mime_type: &'static str,
    maximum_size: u64,
    signature: MediaSignature,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaSignature {
    Png,
    Jpeg,
    Gif,
    Webp,
    Bmp,
    Ico,
    Avif,
    Mp4,
    QuickTime,
    Webm,
    Ogg,
    Pdf,
    Mp3,
    Wav,
    Flac,
    M4a,
    Aac,
    Docx,
    Xlsx,
    Ppt,
    Pptx,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OfficeValidationCacheKey {
    root: PathBuf,
    relative_path: PathBuf,
    signature: MediaSignature,
    size_bytes: u64,
    version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NativePowerPointCacheKey {
    root: PathBuf,
    relative_path: PathBuf,
    source_version: String,
}

#[derive(Debug, Clone)]
struct NativePowerPointCacheEntry {
    key: NativePowerPointCacheKey,
    bundle: NativePowerPointBundle,
}

#[derive(Debug, Clone)]
struct NativePowerPointBundle {
    bytes: Arc<Vec<u8>>,
    version: String,
}

fn office_validation_cache() -> &'static Mutex<VecDeque<OfficeValidationCacheKey>> {
    static CACHE: OnceLock<Mutex<VecDeque<OfficeValidationCacheKey>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn office_validation_is_cached(key: &OfficeValidationCacheKey) -> bool {
    let cache = office_validation_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache.iter().any(|entry| entry == key)
}

fn cache_office_validation(key: OfficeValidationCacheKey) {
    let mut cache = office_validation_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache.retain(|entry| entry.root != key.root || entry.relative_path != key.relative_path);
    cache.push_back(key);
    while cache.len() > MAX_OFFICE_VALIDATION_CACHE_ENTRIES {
        cache.pop_front();
    }
}

fn native_powerpoint_cache() -> &'static Mutex<VecDeque<NativePowerPointCacheEntry>> {
    static CACHE: OnceLock<Mutex<VecDeque<NativePowerPointCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn native_powerpoint_render_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn cached_native_powerpoint_bundle(
    key: &NativePowerPointCacheKey,
) -> Option<NativePowerPointBundle> {
    let mut cache = native_powerpoint_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let index = cache.iter().position(|entry| entry.key == *key)?;
    let entry = cache.remove(index)?;
    let bundle = entry.bundle.clone();
    cache.push_back(entry);
    Some(bundle)
}

fn cache_native_powerpoint_bundle(key: NativePowerPointCacheKey, bundle: NativePowerPointBundle) {
    let mut cache = native_powerpoint_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache
        .retain(|entry| entry.key.root != key.root || entry.key.relative_path != key.relative_path);
    cache.push_back(NativePowerPointCacheEntry { key, bundle });
    while cache.len() > MAX_NATIVE_POWERPOINT_CACHE_ENTRIES {
        cache.pop_front();
    }
}

impl Workspace {
    /// Reads a small, text-only preview through the retained workspace
    /// capability. The renderer never controls the byte ceiling.
    pub fn preview(&self, relative_path: &str) -> Result<PreviewResult, WorkspaceError> {
        self.preview_with_after_read(relative_path, || {})
    }

    /// Returns metadata for a renderer-supported image, video, PDF, audio, or Office file without
    /// transferring its contents. Media is still opened through the retained
    /// workspace capability and is limited by native policy.
    pub fn media_info(&self, relative_path: &str) -> Result<MediaInfo, WorkspaceError> {
        let (mut file, policy, size_bytes, version) = self.open_media(relative_path)?;
        if policy.signature == MediaSignature::Ppt
            && size_bytes >= MIN_NATIVE_POWERPOINT_SOURCE_BYTES
        {
            let clean = validate_relative(relative_path)?;
            if let Some(bundle) =
                self.native_powerpoint_bundle(&clean, &mut file, size_bytes, &version)
            {
                self.ensure_root_valid()?;
                let rendered_size = bundle.bytes.len() as u64;
                let chunk_size = MEDIA_CHUNK_BYTES;
                return Ok(MediaInfo {
                    kind: MediaKind::Office,
                    mime_type: NATIVE_POWERPOINT_PREVIEW_MIME.to_owned(),
                    size_bytes: rendered_size,
                    version: bundle.version,
                    chunk_size,
                    chunk_count: rendered_size.div_ceil(chunk_size as u64),
                });
            }
        }
        drop(file);
        self.ensure_root_valid()?;
        let chunk_size = MEDIA_CHUNK_BYTES;
        let chunk_count = size_bytes.div_ceil(chunk_size as u64);
        Ok(MediaInfo {
            kind: policy.kind,
            mime_type: policy.mime_type.to_owned(),
            size_bytes,
            version,
            chunk_size,
            chunk_count,
        })
    }

    /// Reads one bounded media range. The expected size binds every chunk to
    /// the metadata response and rejects truncation or replacement that changes
    /// the file length while a preview is loading.
    pub fn media_chunk(
        &self,
        relative_path: &str,
        offset: u64,
        length: usize,
        expected_size_bytes: u64,
        expected_version: &str,
    ) -> Result<MediaChunk, WorkspaceError> {
        if length == 0 || length > MAX_MEDIA_CHUNK_BYTES || offset >= expected_size_bytes {
            return Err(WorkspaceError::InvalidPath);
        }
        let _requested_end = offset
            .checked_add(length as u64)
            .ok_or(WorkspaceError::InvalidPath)?;

        let (mut file, policy, size_bytes, version) = self.open_media(relative_path)?;
        if policy.signature == MediaSignature::Ppt && expected_version != version {
            let clean = validate_relative(relative_path)?;
            let key = NativePowerPointCacheKey {
                root: self.root_path().to_path_buf(),
                relative_path: clean,
                source_version: version,
            };
            let bundle = cached_native_powerpoint_bundle(&key)
                .filter(|bundle| bundle.version == expected_version)
                .ok_or(WorkspaceError::Conflict)?;
            if bundle.bytes.len() as u64 != expected_size_bytes {
                return Err(WorkspaceError::Conflict);
            }
            let remaining = expected_size_bytes.saturating_sub(offset);
            let read_length = remaining.min(length as u64) as usize;
            let start = usize::try_from(offset).map_err(|_| WorkspaceError::InvalidPath)?;
            let end = start
                .checked_add(read_length)
                .filter(|end| *end <= bundle.bytes.len())
                .ok_or(WorkspaceError::InvalidPath)?;
            return Ok(MediaChunk {
                offset,
                data: bundle.bytes[start..end].to_vec(),
                eof: end == bundle.bytes.len(),
            });
        }
        if size_bytes != expected_size_bytes || version != expected_version {
            return Err(WorkspaceError::Conflict);
        }

        let remaining = expected_size_bytes.saturating_sub(offset);
        let read_length = remaining.min(length as u64) as usize;
        file.seek(SeekFrom::Start(offset))
            .map_err(|error| map_io(&error))?;
        let mut data = Vec::with_capacity(read_length);
        Read::by_ref(&mut file)
            .take(read_length as u64)
            .read_to_end(&mut data)
            .map_err(|error| map_io(&error))?;
        let final_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let final_size = final_metadata.len();
        let final_version = media_version(&file, &final_metadata)?;
        drop(file);
        self.ensure_root_valid()?;
        if final_size != expected_size_bytes
            || final_version != expected_version
            || data.len() != read_length
        {
            return Err(WorkspaceError::Conflict);
        }

        let end = offset
            .checked_add(data.len() as u64)
            .ok_or(WorkspaceError::InvalidPath)?;
        Ok(MediaChunk {
            offset,
            data,
            eof: end == expected_size_bytes,
        })
    }

    fn native_powerpoint_bundle(
        &self,
        relative_path: &Path,
        source: &mut std::fs::File,
        source_size: u64,
        source_version: &str,
    ) -> Option<NativePowerPointBundle> {
        let key = NativePowerPointCacheKey {
            root: self.root_path().to_path_buf(),
            relative_path: relative_path.to_path_buf(),
            source_version: source_version.to_owned(),
        };
        if let Some(bundle) = cached_native_powerpoint_bundle(&key) {
            return Some(bundle);
        }

        let _render_guard = native_powerpoint_render_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(bundle) = cached_native_powerpoint_bundle(&key) {
            return Some(bundle);
        }

        match render_native_powerpoint_bundle(source, source_size, source_version) {
            Ok(bundle) => {
                let bundle = NativePowerPointBundle {
                    version: native_powerpoint_version(source_version, &bundle),
                    bytes: Arc::new(bundle),
                };
                cache_native_powerpoint_bundle(key, bundle.clone());
                Some(bundle)
            }
            Err(error) => {
                tracing::debug!(%error, "native PowerPoint preview is unavailable; using the embedded renderer");
                None
            }
        }
    }

    fn open_media(
        &self,
        relative_path: &str,
    ) -> Result<(std::fs::File, MediaPolicy, u64, String), WorkspaceError> {
        self.ensure_root_valid()?;
        let clean = validate_relative(relative_path)?;
        if clean.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }

        let name = clean
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(WorkspaceError::InvalidPath)?;
        let lower = name.to_ascii_lowercase();
        let extension = Path::new(&lower)
            .extension()
            .and_then(|extension| extension.to_str());
        if is_sensitive_name(&lower, extension) {
            return Err(WorkspaceError::AccessDenied);
        }
        let policy = media_policy(extension).ok_or(WorkspaceError::NotEditable)?;

        let parent = clean.parent().unwrap_or_else(|| Path::new(""));
        let directory = DirectoryCapability::open(self.root_handle(), parent)?;
        let mut file = open_regular_file_nofollow(directory.handle()?, Path::new(name))?;
        let initial_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let initial_size = initial_metadata.len();
        let initial_version = media_version(&file, &initial_metadata)?;
        if initial_size > policy.maximum_size {
            return Err(WorkspaceError::ContentTooLarge);
        }

        let mut signature = Vec::with_capacity(MEDIA_SIGNATURE_BYTES);
        Read::by_ref(&mut file)
            .take(MEDIA_SIGNATURE_BYTES as u64)
            .read_to_end(&mut signature)
            .map_err(|error| map_io(&error))?;
        let final_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let final_size = final_metadata.len();
        if final_size != initial_size || media_version(&file, &final_metadata)? != initial_version {
            return Err(WorkspaceError::Conflict);
        }
        if !matches_media_signature(policy.signature, &signature) {
            return Err(WorkspaceError::NotEditable);
        }
        if matches!(
            policy.signature,
            MediaSignature::Docx
                | MediaSignature::Xlsx
                | MediaSignature::Ppt
                | MediaSignature::Pptx
        ) {
            let cache_key = OfficeValidationCacheKey {
                root: self.root_path().to_path_buf(),
                relative_path: clean.clone(),
                signature: policy.signature,
                size_bytes: initial_size,
                version: initial_version.clone(),
            };
            if !office_validation_is_cached(&cache_key) {
                if policy.signature == MediaSignature::Ppt {
                    validate_legacy_ppt(&mut file)?;
                } else {
                    validate_office_package(&mut file, policy.signature)?;
                }
                let validated_metadata = file.metadata().map_err(|error| map_io(&error))?;
                if validated_metadata.len() != initial_size
                    || media_version(&file, &validated_metadata)? != initial_version
                {
                    return Err(WorkspaceError::Conflict);
                }
                self.ensure_root_valid()?;
                cache_office_validation(cache_key);
            }
        }
        self.ensure_root_valid()?;
        Ok((file, policy, initial_size, initial_version))
    }

    fn preview_with_after_read(
        &self,
        relative_path: &str,
        after_read: impl FnOnce(),
    ) -> Result<PreviewResult, WorkspaceError> {
        self.ensure_root_valid()?;
        let clean = validate_relative(relative_path)?;
        if clean.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }

        let name = clean
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(WorkspaceError::InvalidPath)?;
        let parent = clean.parent().unwrap_or_else(|| Path::new(""));
        let directory = DirectoryCapability::open(self.root_handle(), parent)?;
        let mut file = open_regular_file_nofollow(directory.handle()?, Path::new(name))?;
        let initial_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let initial_size = initial_metadata.len();

        let policy = preview_policy(name);
        if let PreviewPolicy::Unsupported(reason) = policy {
            drop(file);
            after_read();
            self.ensure_root_valid()?;
            return Ok(PreviewResult::unsupported(
                reason,
                initial_size,
                initial_size > MAX_PREVIEW_BYTES as u64,
            ));
        }

        let read_limit = MAX_PREVIEW_BYTES.saturating_add(1);
        let mut bytes = Vec::with_capacity(read_limit);
        Read::by_ref(&mut file)
            .take(read_limit as u64)
            .read_to_end(&mut bytes)
            .map_err(|error| map_io(&error))?;
        let final_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let size_bytes = final_metadata.len();
        let truncated = bytes.len() > MAX_PREVIEW_BYTES || size_bytes > MAX_PREVIEW_BYTES as u64;
        let sample_has_more_bytes = size_bytes > bytes.len() as u64;
        let contains_nul = bytes.contains(&0);
        let sample_is_valid_or_potentially_incomplete = match std::str::from_utf8(&bytes) {
            Ok(_) => true,
            Err(error) => sample_has_more_bytes && error.error_len().is_none(),
        };
        bytes.truncate(MAX_PREVIEW_BYTES);
        drop(file);
        after_read();
        self.ensure_root_valid()?;

        if contains_nul {
            return Ok(PreviewResult::unsupported(
                PreviewUnsupportedReason::Binary,
                size_bytes,
                truncated,
            ));
        }
        if !sample_is_valid_or_potentially_incomplete {
            return Ok(PreviewResult::unsupported(
                PreviewUnsupportedReason::InvalidUtf8,
                size_bytes,
                truncated,
            ));
        }

        let text = match std::str::from_utf8(&bytes) {
            Ok(text) => text.to_owned(),
            Err(error) if truncated && error.error_len().is_none() => {
                let valid = &bytes[..error.valid_up_to()];
                match std::str::from_utf8(valid) {
                    Ok(text) => text.to_owned(),
                    Err(_) => {
                        return Ok(PreviewResult::unsupported(
                            PreviewUnsupportedReason::InvalidUtf8,
                            size_bytes,
                            truncated,
                        ));
                    }
                }
            }
            Err(_) => {
                return Ok(PreviewResult::unsupported(
                    PreviewUnsupportedReason::InvalidUtf8,
                    size_bytes,
                    truncated,
                ));
            }
        };
        let line_ending = classify_line_ending(&bytes);
        let version =
            (!truncated && size_bytes == bytes.len() as u64).then(|| content_version(&bytes));
        let text = text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned();
        Ok(PreviewResult::text(
            text,
            size_bytes,
            truncated,
            version,
            line_ending,
        ))
    }

    /// Saves a complete text preview when the caller still holds the version
    /// returned by `preview`. This deliberately cannot create files or bypass
    /// the native preview policy.
    pub fn save_preview(
        &self,
        relative_path: &str,
        expected_version: &str,
        content: &[u8],
    ) -> Result<PreviewResult, WorkspaceError> {
        self.ensure_root_valid()?;
        let clean = validate_relative(relative_path)?;
        if clean.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }

        let name = clean
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(WorkspaceError::InvalidPath)?;
        if preview_policy(name) != PreviewPolicy::Text {
            return Err(WorkspaceError::NotEditable);
        }
        if content.len() > MAX_PREVIEW_BYTES {
            return Err(WorkspaceError::ContentTooLarge);
        }
        let new_text = std::str::from_utf8(content).map_err(|_| WorkspaceError::NotEditable)?;
        if new_text.as_bytes().contains(&0)
            || classify_line_ending(new_text.as_bytes()) == PreviewLineEnding::Mixed
        {
            return Err(WorkspaceError::NotEditable);
        }

        let parent = clean.parent().unwrap_or_else(|| Path::new(""));
        let directory = DirectoryCapability::open(self.root_handle(), parent)?;
        let mut file = open_regular_file_for_update_nofollow(directory.handle()?, Path::new(name))?;
        let initial_metadata = file.metadata().map_err(|error| map_io(&error))?;
        if initial_metadata.len() > MAX_PREVIEW_BYTES as u64 {
            return Err(WorkspaceError::NotEditable);
        }

        let mut current = Vec::with_capacity(MAX_PREVIEW_BYTES.saturating_add(1));
        Read::by_ref(&mut file)
            .take(MAX_PREVIEW_BYTES.saturating_add(1) as u64)
            .read_to_end(&mut current)
            .map_err(|error| map_io(&error))?;
        let current_metadata = file.metadata().map_err(|error| map_io(&error))?;
        if current.len() > MAX_PREVIEW_BYTES
            || current_metadata.len() > MAX_PREVIEW_BYTES as u64
            || current_metadata.len() != current.len() as u64
            || current.contains(&0)
            || std::str::from_utf8(&current).is_err()
            || classify_line_ending(&current) == PreviewLineEnding::Mixed
        {
            return Err(WorkspaceError::NotEditable);
        }
        if content_version(&current) != expected_version {
            return Err(WorkspaceError::Conflict);
        }

        let had_bom = current.starts_with(&[0xef, 0xbb, 0xbf]);
        let final_size = content.len().saturating_add(if had_bom { 3 } else { 0 });
        if final_size > MAX_PREVIEW_BYTES {
            return Err(WorkspaceError::ContentTooLarge);
        }
        let mut replacement = Vec::with_capacity(final_size);
        if had_bom {
            replacement.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        }
        replacement.extend_from_slice(content);

        // Revalidate the retained authority immediately before the in-place
        // update. The fixed-size operation preserves file identity and ACLs.
        self.ensure_root_valid()?;
        file.seek(SeekFrom::Start(0))
            .map_err(|error| map_io(&error))?;
        file.write_all(&replacement)
            .map_err(|error| map_io(&error))?;
        file.set_len(replacement.len() as u64)
            .map_err(|error| map_io(&error))?;
        file.sync_all().map_err(|error| map_io(&error))?;
        drop(file);
        self.ensure_root_valid()?;
        self.preview(relative_path)
    }
}

fn content_version(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn media_version(
    file: &std::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<String, WorkspaceError> {
    use std::time::UNIX_EPOCH;

    let modified = metadata.modified().map_err(|error| map_io(&error))?;
    let (before_epoch, duration) = match modified.duration_since(UNIX_EPOCH) {
        Ok(duration) => (false, duration),
        Err(error) => (true, error.duration()),
    };
    let mut digest = Sha256::new();
    digest.update(b"media-v2");
    digest.update(metadata.len().to_le_bytes());
    digest.update([u8::from(before_epoch)]);
    digest.update(duration.as_secs().to_le_bytes());
    digest.update(duration.subsec_nanos().to_le_bytes());
    update_media_identity(&mut digest, file, metadata)?;
    Ok(format!("{:x}", digest.finalize()))
}

fn native_powerpoint_version(source_version: &str, bundle: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(b"native-powerpoint-png-v2");
    digest.update(source_version.as_bytes());
    digest.update((bundle.len() as u64).to_le_bytes());
    digest.update(bundle);
    format!("{:x}", digest.finalize())
}

#[cfg(windows)]
const NATIVE_POWERPOINT_EXPORT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$source = $env:CLE_POWERPOINT_SOURCE
$output = $env:CLE_POWERPOINT_OUTPUT
$pidState = $env:CLE_POWERPOINT_PID_STATE
$maximumSlides = [int]$env:CLE_POWERPOINT_MAX_SLIDES
$renderWidth = [int]$env:CLE_POWERPOINT_RENDER_WIDTH
if (-not $source -or -not $output -or -not $pidState -or $maximumSlides -lt 1 -or $renderWidth -lt 320) {
    throw 'The native PowerPoint preview arguments are invalid.'
}
if (@(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count -ne 0) {
    throw 'PowerPoint is already running; the embedded renderer will be used.'
}

$application = $null
$presentation = $null
try {
    $application = New-Object -ComObject PowerPoint.Application
    $application.AutomationSecurity = 3
    $application.DisplayAlerts = 1
    $ownedProcesses = @(Get-Process -Name POWERPNT -ErrorAction Stop)
    if ($ownedProcesses.Count -ne 1) {
        throw 'The native PowerPoint process could not be isolated.'
    }
    $ownedProcess = $ownedProcesses[0]
    $ownedState = '{0}|{1}' -f $ownedProcess.Id, $ownedProcess.StartTime.ToUniversalTime().Ticks
    [IO.File]::WriteAllText($pidState, $ownedState, [Text.UTF8Encoding]::new($false))
    $presentation = $application.Presentations.Open($source, -1, 0, 0)
    $slideCount = [int]$presentation.Slides.Count
    if ($slideCount -lt 1 -or $slideCount -gt $maximumSlides) {
        throw 'The presentation slide count exceeds the native preview limit.'
    }
    $slideWidth = [double]$presentation.PageSetup.SlideWidth
    $slideHeight = [double]$presentation.PageSetup.SlideHeight
    if ($slideWidth -le 0 -or $slideHeight -le 0) {
        throw 'The presentation has invalid slide dimensions.'
    }
    $renderHeight = [Math]::Max(180, [Math]::Min(2160, [int][Math]::Round($renderWidth * $slideHeight / $slideWidth)))
    for ($index = 1; $index -le $slideCount; $index++) {
        $target = Join-Path $output ('slide-{0:D4}.png' -f $index)
        $slide = $null
        try {
            $slide = $presentation.Slides.Item($index)
            $slide.Export($target, 'PNG', $renderWidth, $renderHeight)
            if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
                throw "PowerPoint did not render slide $index."
            }
        }
        finally {
            if ($null -ne $slide) {
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide)
            }
        }
    }
}
finally {
    if ($null -ne $presentation) {
        try { $presentation.Close() } catch {}
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
    }
    if ($null -ne $application) {
        try { $application.Quit() } catch {}
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
"#;

#[cfg(windows)]
const NATIVE_POWERPOINT_CLEANUP_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$pidState = $env:CLE_POWERPOINT_PID_STATE
if (-not $pidState -or -not (Test-Path -LiteralPath $pidState -PathType Leaf)) {
    exit 0
}
$parts = [IO.File]::ReadAllText($pidState).Trim().Split('|')
if ($parts.Count -ne 2) {
    exit 0
}
$ownedProcessId = 0
$ownedStartTicks = 0L
if (-not [int]::TryParse($parts[0], [ref]$ownedProcessId) -or
    -not [long]::TryParse($parts[1], [ref]$ownedStartTicks)) {
    exit 0
}
$ownedProcess = Get-Process -Id $ownedProcessId -ErrorAction SilentlyContinue
if ($null -ne $ownedProcess -and
    $ownedProcess.ProcessName -eq 'POWERPNT' -and
    $ownedProcess.StartTime.ToUniversalTime().Ticks -eq $ownedStartTicks) {
    Stop-Process -Id $ownedProcessId -Force -ErrorAction SilentlyContinue
}
"#;

#[cfg(windows)]
fn trusted_windows_powershell() -> Result<PathBuf, String> {
    let system_root = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or_else(|| "the Windows directory is unavailable".to_owned())?;
    let system_root = dunce::canonicalize(system_root)
        .map_err(|error| format!("the Windows directory could not be verified: {error}"))?;
    let powershell =
        dunce::canonicalize(system_root.join("System32/WindowsPowerShell/v1.0/powershell.exe"))
            .map_err(|error| format!("Windows PowerShell could not be located: {error}"))?;
    if !powershell.starts_with(&system_root)
        || !powershell
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("powershell.exe"))
        || !powershell.is_file()
    {
        return Err("Windows PowerShell could not be verified".to_owned());
    }
    Ok(powershell)
}

#[cfg(windows)]
fn cleanup_owned_powerpoint(pid_state: &Path) {
    use std::os::windows::process::CommandExt as _;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let Ok(powershell) = trusted_windows_powershell() else {
        return;
    };
    let _ = Command::new(powershell)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            NATIVE_POWERPOINT_CLEANUP_SCRIPT,
        ])
        .env("CLE_POWERPOINT_PID_STATE", pid_state)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(windows)]
fn run_native_powerpoint_export(
    source: &Path,
    output: &Path,
    pid_state: &Path,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt as _;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new(trusted_windows_powershell()?);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            NATIVE_POWERPOINT_EXPORT_SCRIPT,
        ])
        .env("CLE_POWERPOINT_SOURCE", source)
        .env("CLE_POWERPOINT_OUTPUT", output)
        .env("CLE_POWERPOINT_PID_STATE", pid_state)
        .env(
            "CLE_POWERPOINT_MAX_SLIDES",
            MAX_NATIVE_POWERPOINT_SLIDES.to_string(),
        )
        .env(
            "CLE_POWERPOINT_RENDER_WIDTH",
            NATIVE_POWERPOINT_WIDTH.to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .spawn()
        .map_err(|error| format!("PowerPoint preview could not start: {error}"))?;
    let deadline = Instant::now() + NATIVE_POWERPOINT_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                cleanup_owned_powerpoint(pid_state);
                return Err(format!(
                    "PowerPoint preview exited with status {}",
                    status.code().unwrap_or(-1)
                ));
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                cleanup_owned_powerpoint(pid_state);
                return Err("PowerPoint preview timed out".to_owned());
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                cleanup_owned_powerpoint(pid_state);
                return Err(format!(
                    "PowerPoint preview could not be monitored: {error}"
                ));
            }
        }
    }
}

#[cfg(not(windows))]
fn run_native_powerpoint_export(
    _source: &Path,
    _output: &Path,
    _pid_state: &Path,
) -> Result<(), String> {
    Err("native PowerPoint preview is available only on Windows".to_owned())
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24
        || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.get(12..16) != Some(b"IHDR")
    {
        return None;
    }
    let width = u32::from_be_bytes(bytes.get(16..20)?.try_into().ok()?);
    let height = u32::from_be_bytes(bytes.get(20..24)?.try_into().ok()?);
    (width > 0 && height > 0 && width <= 4_096 && height <= 4_096).then_some((width, height))
}

fn bundle_native_powerpoint_slides(output: &Path) -> Result<Vec<u8>, String> {
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    let mut slides = Vec::new();
    let mut total_bytes = 0_u64;
    let mut dimensions = None;
    for index in 1..=MAX_NATIVE_POWERPOINT_SLIDES {
        let name = format!("slide-{index:04}.png");
        let path = output.join(&name);
        if !path.is_file() {
            break;
        }
        let metadata = std::fs::metadata(&path)
            .map_err(|error| format!("rendered slide metadata is unavailable: {error}"))?;
        if metadata.len() == 0 || metadata.len() > MAX_NATIVE_POWERPOINT_SLIDE_BYTES {
            return Err("a rendered PowerPoint slide exceeds the preview limit".to_owned());
        }
        total_bytes = total_bytes
            .checked_add(metadata.len())
            .ok_or_else(|| "the rendered PowerPoint preview size overflowed".to_owned())?;
        if total_bytes > MAX_NATIVE_POWERPOINT_PREVIEW_BYTES {
            return Err("the rendered PowerPoint preview exceeds the size limit".to_owned());
        }
        let bytes = std::fs::read(&path)
            .map_err(|error| format!("a rendered PowerPoint slide could not be read: {error}"))?;
        let current_dimensions = png_dimensions(&bytes)
            .ok_or_else(|| "PowerPoint returned an invalid slide image".to_owned())?;
        if dimensions.is_some_and(|expected| expected != current_dimensions) {
            return Err("PowerPoint returned inconsistent slide dimensions".to_owned());
        }
        dimensions = Some(current_dimensions);
        slides.push((name, bytes));
    }
    if slides.is_empty() {
        return Err("PowerPoint returned no slide images".to_owned());
    }
    let unexpected_entry = std::fs::read_dir(output)
        .map_err(|error| format!("the rendered PowerPoint directory could not be read: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .count()
        != slides.len();
    if unexpected_entry {
        return Err("PowerPoint returned an unexpected preview file".to_owned());
    }

    let (width, height) = dimensions.ok_or_else(|| "slide dimensions are missing".to_owned())?;
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "slideCount": slides.len(),
        "width": width,
        "height": height,
    }))
    .map_err(|error| format!("the PowerPoint preview manifest could not be created: {error}"))?;
    let cursor = std::io::Cursor::new(Vec::new());
    let mut archive = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    archive
        .start_file("manifest.json", options)
        .map_err(|error| format!("the PowerPoint preview archive could not start: {error}"))?;
    archive.write_all(&manifest).map_err(|error| {
        format!("the PowerPoint preview manifest could not be written: {error}")
    })?;
    for (name, bytes) in slides {
        archive
            .start_file(name, options)
            .map_err(|error| format!("a PowerPoint slide could not be archived: {error}"))?;
        archive
            .write_all(&bytes)
            .map_err(|error| format!("a PowerPoint slide could not be written: {error}"))?;
    }
    let bundle = archive
        .finish()
        .map_err(|error| format!("the PowerPoint preview archive could not finish: {error}"))?
        .into_inner();
    if bundle.len() as u64 > MAX_NATIVE_POWERPOINT_PREVIEW_BYTES {
        return Err("the PowerPoint preview archive exceeds the size limit".to_owned());
    }
    Ok(bundle)
}

fn render_native_powerpoint_bundle(
    source: &mut std::fs::File,
    source_size: u64,
    source_version: &str,
) -> Result<Vec<u8>, String> {
    if source_size < MIN_NATIVE_POWERPOINT_SOURCE_BYTES || source_size > MAX_OFFICE_PREVIEW_BYTES {
        return Err("the PowerPoint source size is outside the native preview limits".to_owned());
    }
    let temporary = tempfile::Builder::new()
        .prefix("CodeCodex-PowerPoint-")
        .tempdir()
        .map_err(|error| format!("a PowerPoint preview directory could not be created: {error}"))?;
    let source_path = temporary.path().join("source.ppt");
    let output_path = temporary.path().join("slides");
    let pid_state_path = temporary.path().join("powerpoint-owner.txt");
    std::fs::create_dir(&output_path)
        .map_err(|error| format!("the PowerPoint slide directory could not be created: {error}"))?;
    source
        .seek(SeekFrom::Start(0))
        .map_err(|error| format!("the PowerPoint source could not be rewound: {error}"))?;
    let mut copied_source = std::fs::File::create(&source_path)
        .map_err(|error| format!("the PowerPoint source copy could not be created: {error}"))?;
    let copied = std::io::copy(
        &mut Read::by_ref(source).take(source_size.saturating_add(1)),
        &mut copied_source,
    )
    .map_err(|error| format!("the PowerPoint source could not be copied: {error}"))?;
    if copied != source_size {
        return Err("the PowerPoint source changed while it was being copied".to_owned());
    }
    copied_source.sync_all().map_err(|error| {
        format!("the PowerPoint source copy could not be synchronized: {error}")
    })?;
    drop(copied_source);
    let metadata = source
        .metadata()
        .map_err(|error| format!("the PowerPoint source metadata is unavailable: {error}"))?;
    let final_version = media_version(source, &metadata)
        .map_err(|error| format!("the PowerPoint source could not be revalidated: {error}"))?;
    if metadata.len() != source_size || final_version != source_version {
        return Err("the PowerPoint source changed during preview".to_owned());
    }

    run_native_powerpoint_export(&source_path, &output_path, &pid_state_path)?;
    let bundle = bundle_native_powerpoint_slides(&output_path)?;
    temporary.close().map_err(|error| {
        format!("the PowerPoint preview directory could not be removed: {error}")
    })?;
    Ok(bundle)
}

#[cfg(windows)]
fn update_media_identity(
    digest: &mut Sha256,
    file: &std::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<(), WorkspaceError> {
    use std::hash::{Hash, Hasher};
    use std::os::windows::fs::MetadataExt;

    struct DigestHasher<'a>(&'a mut Sha256);

    impl Hasher for DigestHasher<'_> {
        fn finish(&self) -> u64 {
            0
        }

        fn write(&mut self, bytes: &[u8]) {
            self.0.update((bytes.len() as u64).to_le_bytes());
            self.0.update(bytes);
        }
    }

    let identity_file = file.try_clone().map_err(|error| map_io(&error))?;
    let identity = same_file::Handle::from_file(identity_file).map_err(|error| map_io(&error))?;
    digest.update(b"windows");
    {
        let mut identity_hasher = DigestHasher(digest);
        identity.hash(&mut identity_hasher);
    }
    // `same_file::Handle` hashes the volume serial number and file index on
    // Windows. Creation time adds a fallback discriminator for file systems
    // where those native identifiers can be reused.
    digest.update(metadata.creation_time().to_le_bytes());
    Ok(())
}

#[cfg(unix)]
fn update_media_identity(
    digest: &mut Sha256,
    _file: &std::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<(), WorkspaceError> {
    use std::os::unix::fs::MetadataExt;

    digest.update(b"unix");
    digest.update(metadata.dev().to_le_bytes());
    digest.update(metadata.ino().to_le_bytes());
    digest.update(metadata.ctime().to_le_bytes());
    digest.update(metadata.ctime_nsec().to_le_bytes());
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn update_media_identity(
    digest: &mut Sha256,
    _file: &std::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<(), WorkspaceError> {
    use std::time::UNIX_EPOCH;

    digest.update(b"portable");
    match metadata.created() {
        Ok(created) => {
            digest.update([1]);
            let (before_epoch, duration) = match created.duration_since(UNIX_EPOCH) {
                Ok(duration) => (false, duration),
                Err(error) => (true, error.duration()),
            };
            digest.update([u8::from(before_epoch)]);
            digest.update(duration.as_secs().to_le_bytes());
            digest.update(duration.subsec_nanos().to_le_bytes());
        }
        Err(_) => digest.update([0]),
    }
    Ok(())
}

fn classify_line_ending(bytes: &[u8]) -> PreviewLineEnding {
    let mut saw_lf = false;
    let mut saw_crlf = false;
    let mut saw_lone_cr = false;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' if bytes.get(index + 1) == Some(&b'\n') => {
                saw_crlf = true;
                index += 2;
            }
            b'\r' => {
                saw_lone_cr = true;
                index += 1;
            }
            b'\n' => {
                saw_lf = true;
                index += 1;
            }
            _ => index += 1,
        }
    }
    if saw_lone_cr || (saw_lf && saw_crlf) {
        PreviewLineEnding::Mixed
    } else if saw_crlf {
        PreviewLineEnding::CrLf
    } else if saw_lf {
        PreviewLineEnding::Lf
    } else {
        PreviewLineEnding::None
    }
}

fn preview_policy(name: &str) -> PreviewPolicy {
    let lower = name.to_ascii_lowercase();
    let extension = Path::new(&lower)
        .extension()
        .and_then(|extension| extension.to_str());

    if is_sensitive_name(&lower, extension) {
        return PreviewPolicy::Unsupported(PreviewUnsupportedReason::Sensitive);
    }
    if is_known_text_name(&lower) || is_text_extension(extension) {
        PreviewPolicy::Text
    } else {
        PreviewPolicy::Unsupported(PreviewUnsupportedReason::UnsupportedType)
    }
}

fn media_policy(extension: Option<&str>) -> Option<MediaPolicy> {
    let image = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Image,
        mime_type,
        maximum_size: MAX_IMAGE_PREVIEW_BYTES,
        signature,
    };
    let video = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Video,
        mime_type,
        maximum_size: MAX_VIDEO_PREVIEW_BYTES,
        signature,
    };
    let pdf = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Pdf,
        mime_type,
        maximum_size: MAX_PDF_PREVIEW_BYTES,
        signature,
    };
    let audio = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Audio,
        mime_type,
        maximum_size: MAX_AUDIO_PREVIEW_BYTES,
        signature,
    };
    let office = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Office,
        mime_type,
        maximum_size: MAX_OFFICE_PREVIEW_BYTES,
        signature,
    };

    match extension? {
        "png" => Some(image("image/png", MediaSignature::Png)),
        "jpg" | "jpeg" => Some(image("image/jpeg", MediaSignature::Jpeg)),
        "gif" => Some(image("image/gif", MediaSignature::Gif)),
        "webp" => Some(image("image/webp", MediaSignature::Webp)),
        "bmp" => Some(image("image/bmp", MediaSignature::Bmp)),
        "ico" => Some(image("image/x-icon", MediaSignature::Ico)),
        "avif" => Some(image("image/avif", MediaSignature::Avif)),
        "mp4" | "m4v" => Some(video("video/mp4", MediaSignature::Mp4)),
        "mov" => Some(video("video/quicktime", MediaSignature::QuickTime)),
        "webm" => Some(video("video/webm", MediaSignature::Webm)),
        "ogv" => Some(video("video/ogg", MediaSignature::Ogg)),
        "pdf" => Some(pdf("application/pdf", MediaSignature::Pdf)),
        "mp3" => Some(audio("audio/mpeg", MediaSignature::Mp3)),
        "wav" => Some(audio("audio/wav", MediaSignature::Wav)),
        "flac" => Some(audio("audio/flac", MediaSignature::Flac)),
        "m4a" => Some(audio("audio/mp4", MediaSignature::M4a)),
        "ogg" => Some(audio("audio/ogg", MediaSignature::Ogg)),
        "aac" => Some(audio("audio/aac", MediaSignature::Aac)),
        "docx" => Some(office(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            MediaSignature::Docx,
        )),
        "xlsx" => Some(office(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            MediaSignature::Xlsx,
        )),
        "ppt" => Some(office("application/vnd.ms-powerpoint", MediaSignature::Ppt)),
        "pptx" => Some(office(
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            MediaSignature::Pptx,
        )),
        _ => None,
    }
}

fn matches_media_signature(signature: MediaSignature, bytes: &[u8]) -> bool {
    match signature {
        MediaSignature::Png => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        MediaSignature::Jpeg => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        MediaSignature::Gif => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        MediaSignature::Webp => {
            bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
        }
        MediaSignature::Bmp => bytes.starts_with(b"BM"),
        MediaSignature::Ico => bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]),
        MediaSignature::Avif => ftyp_has_brand(bytes, &[b"avif", b"avis"]),
        MediaSignature::Mp4 => bytes.len() >= 12 && &bytes[4..8] == b"ftyp",
        MediaSignature::QuickTime => ftyp_has_brand(bytes, &[b"qt  "]),
        MediaSignature::Webm => bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]),
        MediaSignature::Ogg => bytes.starts_with(b"OggS"),
        MediaSignature::Pdf => matches_pdf_signature(bytes),
        MediaSignature::Mp3 => matches_mp3_signature(bytes),
        MediaSignature::Wav => {
            bytes.len() >= 12
                && (bytes.starts_with(b"RIFF") || bytes.starts_with(b"RF64"))
                && &bytes[8..12] == b"WAVE"
        }
        MediaSignature::Flac => bytes.starts_with(b"fLaC"),
        MediaSignature::M4a => ftyp_has_brand(
            bytes,
            &[b"M4A ", b"M4B ", b"mp41", b"mp42", b"isom", b"iso2"],
        ),
        MediaSignature::Aac => matches_aac_signature(bytes),
        MediaSignature::Ppt => bytes.starts_with(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        MediaSignature::Docx | MediaSignature::Xlsx | MediaSignature::Pptx => {
            bytes.starts_with(b"PK\x03\x04")
        }
    }
}

fn matches_pdf_signature(bytes: &[u8]) -> bool {
    bytes.len() >= 8
        && bytes.starts_with(b"%PDF-")
        && bytes[5].is_ascii_digit()
        && bytes[6] == b'.'
        && bytes[7].is_ascii_digit()
}

fn matches_mp3_signature(bytes: &[u8]) -> bool {
    let has_id3_header = bytes.len() >= 10
        && bytes.starts_with(b"ID3")
        && matches!(bytes[3], 2..=4)
        && bytes[4] != 0xff
        && bytes[6..10].iter().all(|byte| byte & 0x80 == 0);
    if has_id3_header {
        return true;
    }

    if bytes.len() < 4 || bytes[0] != 0xff || bytes[1] & 0xe0 != 0xe0 {
        return false;
    }
    let version = (bytes[1] >> 3) & 0x03;
    let layer = (bytes[1] >> 1) & 0x03;
    let bitrate = bytes[2] >> 4;
    let sample_rate = (bytes[2] >> 2) & 0x03;
    version != 0x01 && layer != 0 && !matches!(bitrate, 0 | 0x0f) && sample_rate != 0x03
}

fn matches_aac_signature(bytes: &[u8]) -> bool {
    if bytes.starts_with(b"ADIF") {
        return true;
    }
    if bytes.len() < 7
        || bytes[0] != 0xff
        || bytes[1] & 0xf6 != 0xf0
        || (bytes[2] >> 2) & 0x0f == 0x0f
    {
        return false;
    }

    let header_length = if bytes[1] & 0x01 == 0 { 9 } else { 7 };
    let frame_length = (((bytes[3] & 0x03) as usize) << 11)
        | ((bytes[4] as usize) << 3)
        | ((bytes[5] as usize) >> 5);
    frame_length >= header_length
}

#[derive(Debug)]
struct OfficeZipEntry {
    name: String,
    flags: u16,
    compression: u16,
    crc32: u32,
    compressed_size: u64,
    uncompressed_size: u64,
    local_header_offset: u64,
}

#[derive(Debug)]
struct OfficeZipDirectory {
    entries: Vec<OfficeZipEntry>,
    names: HashSet<String>,
}

fn validate_office_package(
    file: &mut std::fs::File,
    signature: MediaSignature,
) -> Result<(), WorkspaceError> {
    let expected = office_package_identity(signature).ok_or(WorkspaceError::NotEditable)?;
    let archive_file = file.try_clone().map_err(|error| map_io(&error))?;
    let mut archive = ZipArchive::new(archive_file).map_err(map_office_zip_error)?;
    if archive.offset() != 0 || archive.is_empty() || archive.len() > MAX_OFFICE_ENTRIES {
        return Err(WorkspaceError::NotEditable);
    }

    let directory = inspect_office_zip_directory(file, archive.central_directory_start())?;
    if directory.entries.len() != archive.len()
        || !directory.names.contains("[Content_Types].xml")
        || !directory.names.contains("_rels/.rels")
        || !directory.names.contains(expected.main_part)
    {
        return Err(WorkspaceError::NotEditable);
    }

    let main_entry = directory
        .entries
        .iter()
        .find(|entry| entry.name == expected.main_part)
        .ok_or(WorkspaceError::NotEditable)?;
    if main_entry.uncompressed_size == 0 {
        return Err(WorkspaceError::NotEditable);
    }

    if archive
        .has_overlapping_files()
        .map_err(map_office_zip_error)?
    {
        return Err(WorkspaceError::NotEditable);
    }
    validate_office_decompressed_entries(&mut archive, &directory.entries)?;

    let mut content_types = archive
        .by_name("[Content_Types].xml")
        .map_err(map_office_zip_error)?;
    if content_types.encrypted()
        || content_types.size() == 0
        || content_types.size() > MAX_OFFICE_CONTENT_TYPES_BYTES
    {
        return Err(WorkspaceError::NotEditable);
    }
    let declared_size =
        usize::try_from(content_types.size()).map_err(|_| WorkspaceError::NotEditable)?;
    let mut xml = Vec::with_capacity(declared_size);
    Read::by_ref(&mut content_types)
        .take(MAX_OFFICE_CONTENT_TYPES_BYTES + 1)
        .read_to_end(&mut xml)
        .map_err(|_| WorkspaceError::NotEditable)?;
    if xml.len() != declared_size
        || !content_types_has_override(&xml, expected.main_part, expected.content_type)
        || contains_ascii_case_insensitive(&xml, b"macroenabled")
        || contains_ascii_case_insensitive(&xml, b"vbaproject")
        || contains_ascii_case_insensitive(&xml, b"activex")
    {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(())
}

fn validate_legacy_ppt(file: &mut std::fs::File) -> Result<(), WorkspaceError> {
    const CFB_STREAM_BUFFER_BYTES: usize = 1024 * 1024;
    const CURRENT_USER_RECORD: u16 = 0x0ff6;
    const USER_EDIT_RECORD: u16 = 0x0ff5;
    const CURRENT_USER_SIZE: u32 = 0x14;
    const UNENCRYPTED_TOKEN: u32 = 0xe391_c05f;

    let compound_file = file.try_clone().map_err(|error| map_io(&error))?;
    let mut compound = cfb::OpenOptions::new()
        .max_buffer_size(CFB_STREAM_BUFFER_BYTES)
        .open_with(compound_file)
        .map_err(|_| WorkspaceError::NotEditable)?;

    let mut entry_count = 0_usize;
    let mut total_stream_bytes = 0_u64;
    for entry in compound.walk() {
        entry_count = entry_count
            .checked_add(1)
            .filter(|count| *count <= MAX_OFFICE_ENTRIES)
            .ok_or(WorkspaceError::NotEditable)?;
        if entry.path().components().count() > 32 {
            return Err(WorkspaceError::NotEditable);
        }
        let folded_name = entry.name().to_ascii_lowercase();
        if folded_name.contains("vbaproject")
            || folded_name == "vba"
            || folded_name == "_vba_project"
            || folded_name == "macros"
            || folded_name == "objectpool"
            || folded_name == "activex"
            || folded_name == "encryptedpackage"
            || folded_name == "encryptionsummary"
            || folded_name == "drmcontent"
            || folded_name == "dataspaces"
            || folded_name == "transforminfo"
        {
            return Err(WorkspaceError::NotEditable);
        }
        if !entry.is_stream() {
            continue;
        }
        if entry.len() > MAX_OFFICE_ENTRY_BYTES {
            return Err(WorkspaceError::NotEditable);
        }
        total_stream_bytes = total_stream_bytes
            .checked_add(entry.len())
            .filter(|bytes| *bytes <= MAX_OFFICE_UNCOMPRESSED_BYTES)
            .ok_or(WorkspaceError::NotEditable)?;
    }

    let mut current_user_path = None;
    let mut current_user_length = 0_u64;
    let mut document_path = None;
    let mut document_length = 0_u64;
    for entry in compound.read_root_storage() {
        if !entry.is_stream() {
            continue;
        }
        if entry.name().eq_ignore_ascii_case("Current User") {
            current_user_path = Some(entry.path().to_path_buf());
            current_user_length = entry.len();
        } else if entry.name().eq_ignore_ascii_case("PowerPoint Document") {
            document_path = Some(entry.path().to_path_buf());
            document_length = entry.len();
        }
    }
    let current_user_path = current_user_path.ok_or(WorkspaceError::NotEditable)?;
    let document_path = document_path.ok_or(WorkspaceError::NotEditable)?;
    if current_user_length < 20 || document_length < 8 {
        return Err(WorkspaceError::NotEditable);
    }

    let mut current_user = compound
        .open_stream(current_user_path)
        .map_err(|_| WorkspaceError::NotEditable)?;
    let mut current_user_header = [0_u8; 20];
    current_user
        .read_exact(&mut current_user_header)
        .map_err(|_| WorkspaceError::NotEditable)?;
    let current_user_record_length = u64::from(le_u32(&current_user_header[4..8]));
    let current_edit_offset = u64::from(le_u32(&current_user_header[16..20]));
    if le_u16(&current_user_header[2..4]) != CURRENT_USER_RECORD
        || current_user_record_length < 20
        || 8_u64
            .checked_add(current_user_record_length)
            .is_none_or(|end| end > current_user_length)
        || le_u32(&current_user_header[8..12]) != CURRENT_USER_SIZE
        || le_u32(&current_user_header[12..16]) != UNENCRYPTED_TOKEN
        || current_edit_offset
            .checked_add(8)
            .is_none_or(|end| end > document_length)
    {
        return Err(WorkspaceError::NotEditable);
    }
    drop(current_user);

    let mut document = compound
        .open_stream(document_path)
        .map_err(|_| WorkspaceError::NotEditable)?;
    document
        .seek(SeekFrom::Start(current_edit_offset))
        .map_err(|_| WorkspaceError::NotEditable)?;
    let mut user_edit_header = [0_u8; 8];
    document
        .read_exact(&mut user_edit_header)
        .map_err(|_| WorkspaceError::NotEditable)?;
    let user_edit_length = u64::from(le_u32(&user_edit_header[4..8]));
    if le_u16(&user_edit_header[2..4]) != USER_EDIT_RECORD
        || user_edit_length < 20
        || current_edit_offset
            .checked_add(8)
            .and_then(|start| start.checked_add(user_edit_length))
            .is_none_or(|end| end > document_length)
    {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(())
}

fn validate_office_decompressed_entries(
    archive: &mut ZipArchive<std::fs::File>,
    directory_entries: &[OfficeZipEntry],
) -> Result<(), WorkspaceError> {
    let mut aggregate_actual_size = 0_u64;
    let mut buffer = [0_u8; OFFICE_VALIDATION_BUFFER_BYTES];
    let mut folded_names = HashSet::new();
    for index in 0..archive.len() {
        let directory_entry = directory_entries
            .get(index)
            .ok_or(WorkspaceError::NotEditable)?;
        let (declared_size, compressed_size, is_directory, is_xml_part) = {
            let entry = archive.by_index_raw(index).map_err(map_office_zip_error)?;
            let logical_name = entry.name();
            let folded_name = logical_name.to_ascii_lowercase();
            if entry.encrypted()
                || entry.is_symlink()
                || !matches!(
                    entry.compression(),
                    CompressionMethod::Stored | CompressionMethod::Deflated
                )
                || entry.size() > MAX_OFFICE_ENTRY_BYTES
                || entry.size() != directory_entry.uncompressed_size
                || entry.compressed_size() != directory_entry.compressed_size
                || entry.crc32() != directory_entry.crc32
                || logical_name.as_bytes() != directory_entry.name.as_bytes()
                || !valid_office_entry_name(logical_name.as_bytes())
                || !folded_names.insert(folded_name.clone())
                || forbidden_office_part(&folded_name)
            {
                return Err(WorkspaceError::NotEditable);
            }
            let is_xml_part = is_office_xml_part(&folded_name);
            if is_xml_part && entry.size() > MAX_OFFICE_XML_BYTES {
                return Err(WorkspaceError::NotEditable);
            }
            (
                entry.size(),
                entry.compressed_size(),
                entry.is_dir(),
                is_xml_part,
            )
        };
        if is_directory {
            if declared_size != 0 || compressed_size != 0 {
                return Err(WorkspaceError::NotEditable);
            }
            continue;
        }

        let mut entry = archive.by_index(index).map_err(map_office_zip_error)?;
        let mut entry_actual_size = 0_u64;
        let mut xml = is_xml_part.then(Vec::new);
        loop {
            let read = entry
                .read(&mut buffer)
                .map_err(|_| WorkspaceError::NotEditable)?;
            if read == 0 {
                break;
            }
            entry_actual_size = entry_actual_size
                .checked_add(read as u64)
                .filter(|size| *size <= MAX_OFFICE_ENTRY_BYTES)
                .ok_or(WorkspaceError::NotEditable)?;
            aggregate_actual_size = aggregate_actual_size
                .checked_add(read as u64)
                .filter(|size| *size <= MAX_OFFICE_UNCOMPRESSED_BYTES)
                .ok_or(WorkspaceError::NotEditable)?;
            if let Some(xml) = &mut xml {
                let next_length = xml
                    .len()
                    .checked_add(read)
                    .filter(|length| *length <= MAX_OFFICE_XML_BYTES as usize)
                    .ok_or(WorkspaceError::NotEditable)?;
                xml.reserve(next_length.saturating_sub(xml.len()));
                xml.extend_from_slice(&buffer[..read]);
            }
        }
        if entry_actual_size != declared_size {
            return Err(WorkspaceError::NotEditable);
        }
        if xml.is_some_and(|xml| !valid_office_xml(&xml)) {
            return Err(WorkspaceError::NotEditable);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
struct OfficePackageIdentity {
    main_part: &'static str,
    content_type: &'static str,
}

fn office_package_identity(signature: MediaSignature) -> Option<OfficePackageIdentity> {
    match signature {
        MediaSignature::Docx => Some(OfficePackageIdentity {
            main_part: "word/document.xml",
            content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        }),
        MediaSignature::Xlsx => Some(OfficePackageIdentity {
            main_part: "xl/workbook.xml",
            content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        }),
        MediaSignature::Pptx => Some(OfficePackageIdentity {
            main_part: "ppt/presentation.xml",
            content_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
        }),
        _ => None,
    }
}

fn inspect_office_zip_directory(
    file: &mut std::fs::File,
    central_directory_start: u64,
) -> Result<OfficeZipDirectory, WorkspaceError> {
    const CENTRAL_HEADER_SIGNATURE: [u8; 4] = *b"PK\x01\x02";
    const END_SIGNATURE: [u8; 4] = *b"PK\x05\x06";

    let file_size = file.metadata().map_err(|error| map_io(&error))?.len();
    if central_directory_start == 0 || central_directory_start >= file_size {
        return Err(WorkspaceError::NotEditable);
    }
    file.seek(SeekFrom::Start(central_directory_start))
        .map_err(|error| map_io(&error))?;

    let mut entries = Vec::new();
    let mut names = HashSet::new();
    let mut folded_names = HashSet::new();
    let mut total_uncompressed = 0_u64;
    let end_record_start;
    loop {
        let record_start = file.stream_position().map_err(|error| map_io(&error))?;
        let mut signature = [0_u8; 4];
        read_office_exact(file, &mut signature)?;
        if signature == END_SIGNATURE {
            end_record_start = record_start;
            break;
        }
        if signature != CENTRAL_HEADER_SIGNATURE || entries.len() >= MAX_OFFICE_ENTRIES {
            return Err(WorkspaceError::NotEditable);
        }

        let mut fixed = [0_u8; 42];
        read_office_exact(file, &mut fixed)?;
        let flags = le_u16(&fixed[4..6]);
        let compression = le_u16(&fixed[6..8]);
        let crc32 = le_u32(&fixed[12..16]);
        let compressed_size = u64::from(le_u32(&fixed[16..20]));
        let uncompressed_size = u64::from(le_u32(&fixed[20..24]));
        let name_length = usize::from(le_u16(&fixed[24..26]));
        let extra_length = usize::from(le_u16(&fixed[26..28]));
        let comment_length = u64::from(le_u16(&fixed[28..30]));
        let disk_number = le_u16(&fixed[30..32]);
        let local_header_offset = u64::from(le_u32(&fixed[38..42]));
        if name_length == 0
            || name_length > MAX_OFFICE_ENTRY_NAME_BYTES
            || disk_number != 0
            || compressed_size == u64::from(u32::MAX)
            || uncompressed_size == u64::from(u32::MAX)
            || local_header_offset == u64::from(u32::MAX)
            || !supported_office_zip_flags(flags, compression)
            || uncompressed_size > MAX_OFFICE_ENTRY_BYTES
        {
            return Err(WorkspaceError::NotEditable);
        }

        let mut raw_name = vec![0_u8; name_length];
        read_office_exact(file, &mut raw_name)?;
        if !valid_office_entry_name(&raw_name) {
            return Err(WorkspaceError::NotEditable);
        }
        let mut extra = vec![0_u8; extra_length];
        read_office_exact(file, &mut extra)?;
        validate_office_extra_fields(&extra)?;
        let name = std::str::from_utf8(&raw_name)
            .map_err(|_| WorkspaceError::NotEditable)?
            .to_owned();
        let folded = name.to_ascii_lowercase();
        if !names.insert(name.clone())
            || !folded_names.insert(folded.clone())
            || forbidden_office_part(&folded)
            || (is_office_xml_part(&folded) && uncompressed_size > MAX_OFFICE_XML_BYTES)
        {
            return Err(WorkspaceError::NotEditable);
        }
        total_uncompressed = total_uncompressed
            .checked_add(uncompressed_size)
            .ok_or(WorkspaceError::NotEditable)?;
        if total_uncompressed > MAX_OFFICE_UNCOMPRESSED_BYTES {
            return Err(WorkspaceError::NotEditable);
        }

        let current = file.stream_position().map_err(|error| map_io(&error))?;
        let next = current
            .checked_add(comment_length)
            .filter(|next| *next <= file_size)
            .ok_or(WorkspaceError::NotEditable)?;
        file.seek(SeekFrom::Start(next))
            .map_err(|error| map_io(&error))?;
        entries.push(OfficeZipEntry {
            name,
            flags,
            compression,
            crc32,
            compressed_size,
            uncompressed_size,
            local_header_offset,
        });
    }

    let mut end = [0_u8; 18];
    read_office_exact(file, &mut end)?;
    let disk_number = le_u16(&end[0..2]);
    let central_disk = le_u16(&end[2..4]);
    let disk_entries = usize::from(le_u16(&end[4..6]));
    let total_entries = usize::from(le_u16(&end[6..8]));
    let declared_central_size = u64::from(le_u32(&end[8..12]));
    let declared_central_start = u64::from(le_u32(&end[12..16]));
    let comment_length = u64::from(le_u16(&end[16..18]));
    let actual_central_size = end_record_start
        .checked_sub(central_directory_start)
        .ok_or(WorkspaceError::NotEditable)?;
    let after_comment = file
        .stream_position()
        .map_err(|error| map_io(&error))?
        .checked_add(comment_length)
        .ok_or(WorkspaceError::NotEditable)?;
    if disk_number != 0
        || central_disk != 0
        || disk_entries != entries.len()
        || total_entries != entries.len()
        || declared_central_size != actual_central_size
        || declared_central_start != central_directory_start
        || after_comment != file_size
    {
        return Err(WorkspaceError::NotEditable);
    }

    validate_office_local_headers(file, central_directory_start, &entries)?;
    Ok(OfficeZipDirectory { entries, names })
}

fn validate_office_local_headers(
    file: &mut std::fs::File,
    central_directory_start: u64,
    entries: &[OfficeZipEntry],
) -> Result<(), WorkspaceError> {
    const LOCAL_HEADER_SIGNATURE: [u8; 4] = *b"PK\x03\x04";
    let mut ranges = Vec::with_capacity(entries.len());
    for entry in entries {
        file.seek(SeekFrom::Start(entry.local_header_offset))
            .map_err(|error| map_io(&error))?;
        let mut fixed = [0_u8; 30];
        read_office_exact(file, &mut fixed)?;
        if fixed[..4] != LOCAL_HEADER_SIGNATURE {
            return Err(WorkspaceError::NotEditable);
        }
        let flags = le_u16(&fixed[6..8]);
        let compression = le_u16(&fixed[8..10]);
        let crc32 = le_u32(&fixed[14..18]);
        let compressed_size = u64::from(le_u32(&fixed[18..22]));
        let uncompressed_size = u64::from(le_u32(&fixed[22..26]));
        let name_length = usize::from(le_u16(&fixed[26..28]));
        let extra_length = usize::from(le_u16(&fixed[28..30]));
        if flags != entry.flags
            || compression != entry.compression
            || name_length != entry.name.len()
        {
            return Err(WorkspaceError::NotEditable);
        }
        if flags & 0x0008 == 0
            && (crc32 != entry.crc32
                || compressed_size != entry.compressed_size
                || uncompressed_size != entry.uncompressed_size)
        {
            return Err(WorkspaceError::NotEditable);
        }
        let mut raw_name = vec![0_u8; name_length];
        read_office_exact(file, &mut raw_name)?;
        if raw_name != entry.name.as_bytes() {
            return Err(WorkspaceError::NotEditable);
        }
        let mut extra = vec![0_u8; extra_length];
        read_office_exact(file, &mut extra)?;
        validate_office_extra_fields(&extra)?;
        let data_start = entry
            .local_header_offset
            .checked_add(30)
            .and_then(|value| value.checked_add(name_length as u64))
            .and_then(|value| value.checked_add(extra_length as u64))
            .ok_or(WorkspaceError::NotEditable)?;
        let data_end = data_start
            .checked_add(entry.compressed_size)
            .filter(|end| *end <= central_directory_start)
            .ok_or(WorkspaceError::NotEditable)?;
        ranges.push(entry.local_header_offset..data_end);
    }
    ranges.sort_unstable_by_key(|range| range.start);
    if ranges.first().map(|range| range.start) != Some(0)
        || ranges.windows(2).any(|pair| pair[0].end > pair[1].start)
    {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(())
}

fn supported_office_zip_flags(flags: u16, compression: u16) -> bool {
    const DATA_DESCRIPTOR: u16 = 1 << 3;
    const UTF8_NAMES: u16 = 1 << 11;
    const DEFLATE_OPTIONS: u16 = (1 << 1) | (1 << 2);
    let allowed = DATA_DESCRIPTOR | UTF8_NAMES | DEFLATE_OPTIONS;
    flags & !allowed == 0
        && matches!(compression, 0 | 8)
        && (compression == 8 || flags & DEFLATE_OPTIONS == 0)
}

fn validate_office_extra_fields(mut extra: &[u8]) -> Result<(), WorkspaceError> {
    const ZIP64_EXTRA_FIELD: u16 = 0x0001;
    const UNICODE_PATH_EXTRA_FIELD: u16 = 0x7075;

    while !extra.is_empty() {
        if extra.len() < 4 {
            return Err(WorkspaceError::NotEditable);
        }
        let header_id = le_u16(&extra[..2]);
        let data_length = usize::from(le_u16(&extra[2..4]));
        let field_length = 4_usize
            .checked_add(data_length)
            .filter(|length| *length <= extra.len())
            .ok_or(WorkspaceError::NotEditable)?;
        if matches!(header_id, ZIP64_EXTRA_FIELD | UNICODE_PATH_EXTRA_FIELD) {
            return Err(WorkspaceError::NotEditable);
        }
        extra = &extra[field_length..];
    }
    Ok(())
}

fn valid_office_entry_name(name: &[u8]) -> bool {
    if name.is_empty()
        || name.len() > MAX_OFFICE_ENTRY_NAME_BYTES
        || !name.is_ascii()
        || name.starts_with(b"/")
        || name.contains(&b'\\')
        || name.contains(&0)
        || name.contains(&b':')
        || name.contains(&b'?')
        || name.contains(&b'#')
    {
        return false;
    }
    let without_directory_suffix = name.strip_suffix(b"/").unwrap_or(name);
    !without_directory_suffix.is_empty()
        && without_directory_suffix
            .split(|byte| *byte == b'/')
            .all(|component| !component.is_empty() && component != b"." && component != b"..")
}

fn forbidden_office_part(lower_name: &str) -> bool {
    lower_name.ends_with("vbaproject.bin")
        || lower_name.contains("/activex/")
        || lower_name.contains("/embeddings/")
}

fn is_office_xml_part(lower_name: &str) -> bool {
    lower_name.ends_with(".xml") || lower_name.ends_with(".rels")
}

fn valid_office_xml(xml: &[u8]) -> bool {
    let xml = xml.strip_prefix(b"\xef\xbb\xbf").unwrap_or(xml);
    if xml.contains(&0) || std::str::from_utf8(xml).is_err() {
        return false;
    }
    if contains_ascii_case_insensitive(xml, b"<!doctype")
        || contains_ascii_case_insensitive(xml, b"<!entity")
    {
        return false;
    }

    let Some(declaration_start) = find_xml_declaration(xml) else {
        return true;
    };
    if declaration_start != 0 {
        return false;
    }
    let Some(relative_end) = xml[5..].windows(2).position(|window| window == b"?>") else {
        return false;
    };
    let declaration_end = 5 + relative_end;
    let Ok(declaration) = std::str::from_utf8(&xml[5..declaration_end]) else {
        return false;
    };
    if !xml_declaration_allows_utf8(declaration) {
        return false;
    }
    find_xml_declaration(&xml[declaration_end + 2..]).is_none()
}

fn find_xml_declaration(xml: &[u8]) -> Option<usize> {
    xml.windows(5).enumerate().find_map(|(index, candidate)| {
        if !candidate.eq_ignore_ascii_case(b"<?xml") {
            return None;
        }
        xml.get(index + 5)
            .is_some_and(u8::is_ascii_whitespace)
            .then_some(index)
    })
}

fn xml_declaration_allows_utf8(declaration: &str) -> bool {
    let bytes = declaration.as_bytes();
    let mut cursor = 0;
    while cursor < bytes.len() {
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor == bytes.len() {
            return true;
        }
        let name_start = cursor;
        while cursor < bytes.len()
            && (bytes[cursor].is_ascii_alphanumeric()
                || matches!(bytes[cursor], b'_' | b':' | b'-' | b'.'))
        {
            cursor += 1;
        }
        if cursor == name_start {
            return false;
        }
        let name = &declaration[name_start..cursor];
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            return false;
        }
        cursor = skip_ascii_whitespace(bytes, cursor + 1);
        if cursor >= bytes.len() || !matches!(bytes[cursor], b'\'' | b'"') {
            return false;
        }
        let quote = bytes[cursor];
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != quote {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return false;
        }
        let value = &declaration[value_start..cursor];
        cursor += 1;
        if name.eq_ignore_ascii_case("encoding") && !value.eq_ignore_ascii_case("utf-8") {
            return false;
        }
    }
    true
}

fn content_types_has_override(xml: &[u8], main_part: &str, content_type: &str) -> bool {
    if !valid_office_xml(xml) {
        return false;
    }
    let xml = xml.strip_prefix(b"\xef\xbb\xbf").unwrap_or(xml);
    let Ok(source) = std::str::from_utf8(xml) else {
        return false;
    };
    let expected_part = format!("/{main_part}");
    let bytes = source.as_bytes();
    let mut cursor = 0;
    while cursor < bytes.len() {
        let Some(relative_start) = bytes[cursor..].iter().position(|byte| *byte == b'<') else {
            break;
        };
        let start = cursor + relative_start;
        let mut quote = None;
        let mut end = start + 1;
        while end < bytes.len() {
            let byte = bytes[end];
            if let Some(expected_quote) = quote {
                if byte == expected_quote {
                    quote = None;
                }
            } else if byte == b'\'' || byte == b'"' {
                quote = Some(byte);
            } else if byte == b'>' {
                break;
            }
            end += 1;
        }
        if end >= bytes.len() {
            return false;
        }
        if override_tag_matches(&source[start + 1..end], &expected_part, content_type) {
            return true;
        }
        cursor = end + 1;
    }
    false
}

fn override_tag_matches(tag: &str, expected_part: &str, expected_content_type: &str) -> bool {
    let bytes = tag.as_bytes();
    let mut cursor = skip_ascii_whitespace(bytes, 0);
    if cursor >= bytes.len() || matches!(bytes[cursor], b'/' | b'!' | b'?') {
        return false;
    }
    let name_start = cursor;
    while cursor < bytes.len() && !bytes[cursor].is_ascii_whitespace() && bytes[cursor] != b'/' {
        cursor += 1;
    }
    let element_name = &tag[name_start..cursor];
    if element_name.rsplit(':').next() != Some("Override") {
        return false;
    }

    let mut part_name = None;
    let mut content_type = None;
    while cursor < bytes.len() {
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor >= bytes.len() || bytes[cursor] == b'/' {
            break;
        }
        let attribute_start = cursor;
        while cursor < bytes.len()
            && !bytes[cursor].is_ascii_whitespace()
            && bytes[cursor] != b'='
            && bytes[cursor] != b'/'
        {
            cursor += 1;
        }
        if attribute_start == cursor {
            return false;
        }
        let attribute_name = &tag[attribute_start..cursor];
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            return false;
        }
        cursor = skip_ascii_whitespace(bytes, cursor + 1);
        if cursor >= bytes.len() || !matches!(bytes[cursor], b'\'' | b'"') {
            return false;
        }
        let quote = bytes[cursor];
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != quote {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return false;
        }
        let value = &tag[value_start..cursor];
        cursor += 1;
        match attribute_name.rsplit(':').next() {
            Some("PartName") => part_name = Some(value),
            Some("ContentType") => content_type = Some(value),
            _ => {}
        }
    }
    part_name == Some(expected_part) && content_type == Some(expected_content_type)
}

fn skip_ascii_whitespace(bytes: &[u8], mut cursor: usize) -> usize {
    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    cursor
}

fn contains_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && haystack.windows(needle.len()).any(|window| {
            window
                .iter()
                .zip(needle)
                .all(|(left, right)| left.eq_ignore_ascii_case(right))
        })
}

fn read_office_exact(file: &mut std::fs::File, bytes: &mut [u8]) -> Result<(), WorkspaceError> {
    file.read_exact(bytes).map_err(|error| {
        if error.kind() == std::io::ErrorKind::UnexpectedEof {
            WorkspaceError::NotEditable
        } else {
            map_io(&error)
        }
    })
}

fn map_office_zip_error(error: zip::result::ZipError) -> WorkspaceError {
    match error {
        zip::result::ZipError::Io(error) => map_io(&error),
        _ => WorkspaceError::NotEditable,
    }
}

fn le_u16(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

fn le_u32(bytes: &[u8]) -> u32 {
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn ftyp_has_brand(bytes: &[u8], expected: &[&[u8; 4]]) -> bool {
    if bytes.len() < 16 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    let declared_size = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    if declared_size < 16 {
        return false;
    }
    let inspected_end = declared_size.min(bytes.len());
    expected.contains(&bytes[8..12].try_into().unwrap_or(b"    "))
        || bytes[16..inspected_end]
            .chunks_exact(4)
            .any(|brand| expected.contains(&brand.try_into().unwrap_or(b"    ")))
}

fn is_sensitive_name(name: &str, extension: Option<&str>) -> bool {
    const SENSITIVE_NAMES: &[&str] = &[
        ".npmrc",
        ".pypirc",
        ".netrc",
        "_netrc",
        "credentials",
        "credentials.json",
        "secrets.json",
    ];
    const SSH_PRIVATE_KEY_NAMES: &[&str] =
        &["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "id_xmss"];

    name.starts_with(".env")
        || SENSITIVE_NAMES.contains(&name)
        || SSH_PRIVATE_KEY_NAMES.iter().any(|private_name| {
            name == *private_name || name.starts_with(&format!("{private_name}."))
        })
        || matches!(
            extension,
            Some(
                "pem"
                    | "key"
                    | "pkey"
                    | "ppk"
                    | "pk8"
                    | "der"
                    | "crt"
                    | "cer"
                    | "csr"
                    | "p12"
                    | "pfx"
                    | "jks"
                    | "keystore"
                    | "kdb"
                    | "kdbx"
                    | "gpg"
                    | "pgp"
            )
        )
}

fn is_known_text_name(name: &str) -> bool {
    const TEXT_NAMES: &[&str] = &[
        ".babelrc",
        ".browserslistrc",
        ".dockerignore",
        ".editorconfig",
        ".eslintignore",
        ".eslintrc",
        ".gitattributes",
        ".gitignore",
        ".gitmodules",
        ".node-version",
        ".npmignore",
        ".nvmrc",
        ".prettierignore",
        ".prettierrc",
        ".python-version",
        ".ruby-version",
        ".stylelintignore",
        ".stylelintrc",
        ".tool-versions",
        "authors",
        "brewfile",
        "changelog",
        "changes",
        "code_of_conduct",
        "containerfile",
        "contributing",
        "contributors",
        "copying",
        "dockerfile",
        "gemfile",
        "gnumakefile",
        "history",
        "justfile",
        "license",
        "makefile",
        "notice",
        "procfile",
        "rakefile",
        "readme",
        "security",
        "taskfile",
        "vagrantfile",
    ];

    TEXT_NAMES.contains(&name)
        || (Path::new(name).extension().is_none()
            && (name.starts_with("license-") || name.starts_with("licence-")))
}

fn is_text_extension(extension: Option<&str>) -> bool {
    matches!(
        extension,
        Some(
            "txt"
                | "text"
                | "log"
                | "md"
                | "markdown"
                | "mdx"
                | "rst"
                | "adoc"
                | "asciidoc"
                | "tex"
                | "diff"
                | "patch"
                | "ts"
                | "tsx"
                | "mts"
                | "cts"
                | "js"
                | "jsx"
                | "mjs"
                | "cjs"
                | "py"
                | "pyi"
                | "pyw"
                | "rs"
                | "go"
                | "java"
                | "kt"
                | "kts"
                | "swift"
                | "c"
                | "h"
                | "cc"
                | "cpp"
                | "cxx"
                | "hpp"
                | "hxx"
                | "cs"
                | "fs"
                | "fsx"
                | "vb"
                | "php"
                | "rb"
                | "rake"
                | "lua"
                | "pl"
                | "pm"
                | "r"
                | "dart"
                | "scala"
                | "sc"
                | "groovy"
                | "gvy"
                | "ex"
                | "exs"
                | "erl"
                | "hrl"
                | "clj"
                | "cljs"
                | "cljc"
                | "edn"
                | "hs"
                | "lhs"
                | "ml"
                | "mli"
                | "sol"
                | "zig"
                | "nim"
                | "jl"
                | "sh"
                | "bash"
                | "zsh"
                | "fish"
                | "ps1"
                | "psm1"
                | "psd1"
                | "bat"
                | "cmd"
                | "html"
                | "htm"
                | "css"
                | "scss"
                | "sass"
                | "less"
                | "styl"
                | "vue"
                | "svelte"
                | "astro"
                | "hbs"
                | "handlebars"
                | "mustache"
                | "ejs"
                | "njk"
                | "jinja"
                | "jinja2"
                | "j2"
                | "liquid"
                | "twig"
                | "xml"
                | "xsl"
                | "xslt"
                | "xsd"
                | "wxs"
                | "wxl"
                | "wxi"
                | "csproj"
                | "fsproj"
                | "vbproj"
                | "vcxproj"
                | "wixproj"
                | "props"
                | "targets"
                | "resx"
                | "plist"
                | "json"
                | "jsonc"
                | "json5"
                | "yaml"
                | "yml"
                | "toml"
                | "ini"
                | "cfg"
                | "conf"
                | "config"
                | "properties"
                | "csv"
                | "tsv"
                | "sql"
                | "graphql"
                | "gql"
                | "proto"
                | "lock"
                | "sum"
                | "mod"
                | "cmake"
                | "gradle"
                | "sbt"
                | "mk"
                | "make"
                | "ipynb"
        )
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::{Cursor, Read as _, Write};

    use tempfile::TempDir;
    use zip::ZipWriter;
    use zip::write::{FullFileOptions, SimpleFileOptions};

    use super::*;

    fn fixture() -> (TempDir, Workspace) {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir(directory.path().join("src")).expect("src");
        fs::write(directory.path().join("src/main.rs"), "fn main() {}\n").expect("source");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        (directory, workspace)
    }

    fn minimal_png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes
    }

    #[test]
    fn native_powerpoint_bundle_has_a_bounded_ordered_manifest() {
        let directory = TempDir::new().expect("temp dir");
        fs::write(
            directory.path().join("slide-0001.png"),
            minimal_png(1_440, 1_080),
        )
        .expect("first slide");
        fs::write(
            directory.path().join("slide-0002.png"),
            minimal_png(1_440, 1_080),
        )
        .expect("second slide");

        let bundle = bundle_native_powerpoint_slides(directory.path()).expect("slide bundle");
        let mut archive = ZipArchive::new(Cursor::new(bundle)).expect("preview archive");
        assert_eq!(archive.len(), 3);
        let mut manifest = String::new();
        archive
            .by_name("manifest.json")
            .expect("manifest")
            .read_to_string(&mut manifest)
            .expect("manifest text");
        let manifest: serde_json::Value = serde_json::from_str(&manifest).expect("manifest JSON");
        assert_eq!(manifest["schemaVersion"], 1);
        assert_eq!(manifest["slideCount"], 2);
        assert_eq!(manifest["width"], 1_440);
        assert_eq!(manifest["height"], 1_080);
        assert!(archive.by_name("slide-0001.png").is_ok());
        assert!(archive.by_name("slide-0002.png").is_ok());
    }

    #[test]
    fn native_powerpoint_version_binds_the_exact_rendered_bundle() {
        let first = native_powerpoint_version("source-version", b"same-size-a");
        let second = native_powerpoint_version("source-version", b"same-size-b");
        assert_ne!(first, second);
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires Microsoft PowerPoint and CODE_CODEX_NATIVE_POWERPOINT_FIXTURE"]
    fn native_powerpoint_external_fixture_renders_through_media_transport() {
        let source = std::env::var_os("CODE_CODEX_NATIVE_POWERPOINT_FIXTURE")
            .map(PathBuf::from)
            .expect("CODE_CODEX_NATIVE_POWERPOINT_FIXTURE");
        let directory = TempDir::new().expect("temp dir");
        fs::copy(&source, directory.path().join("presentation.ppt")).expect("copy fixture");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        let info = workspace
            .media_info("presentation.ppt")
            .expect("native PowerPoint info");
        assert_eq!(info.kind, MediaKind::Office);
        assert_eq!(info.mime_type, NATIVE_POWERPOINT_PREVIEW_MIME);
        let mut bundle = Vec::with_capacity(info.size_bytes as usize);
        let mut offset = 0_u64;
        while offset < info.size_bytes {
            let length = MEDIA_CHUNK_BYTES.min((info.size_bytes - offset) as usize);
            let chunk = workspace
                .media_chunk(
                    "presentation.ppt",
                    offset,
                    length,
                    info.size_bytes,
                    &info.version,
                )
                .expect("native PowerPoint chunk");
            offset += chunk.data.len() as u64;
            bundle.extend_from_slice(&chunk.data);
        }
        assert_eq!(bundle.len() as u64, info.size_bytes);
        let mut archive = ZipArchive::new(Cursor::new(bundle)).expect("native preview archive");
        let mut manifest = String::new();
        archive
            .by_name("manifest.json")
            .expect("native manifest")
            .read_to_string(&mut manifest)
            .expect("native manifest text");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest).expect("native manifest JSON");
        assert!(
            manifest["slideCount"]
                .as_u64()
                .is_some_and(|count| count > 0)
        );
        assert!(archive.by_name("slide-0001.png").is_ok());
    }

    fn office_archive(
        main_part: &str,
        content_type: &str,
        extras: &[(String, Vec<u8>)],
        compression: CompressionMethod,
    ) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut archive = ZipWriter::new(cursor);
        let options = SimpleFileOptions::default().compression_method(compression);
        let content_types = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/{main_part}" ContentType="{content_type}"/></Types>"#
        );
        for (name, contents) in [
            ("[Content_Types].xml", content_types.as_bytes()),
            ("_rels/.rels", b"<Relationships/>" as &[u8]),
            (main_part, b"<root/>" as &[u8]),
        ] {
            archive
                .start_file(name, options)
                .expect("start Office part");
            archive.write_all(contents).expect("write Office part");
        }
        for (name, contents) in extras {
            archive
                .start_file(name, options)
                .expect("start extra Office part");
            archive
                .write_all(contents)
                .expect("write extra Office part");
        }
        archive.finish().expect("finish Office ZIP").into_inner()
    }

    fn docx_archive(extras: &[(String, Vec<u8>)]) -> Vec<u8> {
        office_archive(
            "word/document.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
            extras,
            CompressionMethod::Deflated,
        )
    }

    fn legacy_ppt(header_token: u32, active_storage: Option<&str>) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut compound = cfb::CompoundFile::create(cursor).expect("create legacy PowerPoint");
        {
            let mut current_user = compound
                .create_stream("/Current User")
                .expect("create Current User stream");
            current_user
                .write_all(&[0x00, 0x00, 0xf6, 0x0f, 0x14, 0x00, 0x00, 0x00])
                .expect("write Current User record header");
            current_user
                .write_all(&0x14_u32.to_le_bytes())
                .expect("write Current User size");
            current_user
                .write_all(&header_token.to_le_bytes())
                .expect("write Current User token");
            current_user
                .write_all(&0_u32.to_le_bytes())
                .expect("write current edit offset");
            current_user
                .write_all(&[0_u8; 8])
                .expect("finish Current User record");
        }
        {
            let mut document = compound
                .create_stream("/PowerPoint Document")
                .expect("create PowerPoint Document stream");
            document
                .write_all(&[0x00, 0x00, 0xf5, 0x0f, 0x14, 0x00, 0x00, 0x00])
                .expect("write UserEditAtom header");
            document
                .write_all(&[0_u8; 20])
                .expect("finish UserEditAtom");
        }
        if let Some(storage) = active_storage {
            compound
                .create_storage(format!("/{storage}"))
                .expect("create active storage");
        }
        compound.into_inner().into_inner()
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = u32::MAX;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xedb8_8320 & 0_u32.wrapping_sub(crc & 1));
            }
        }
        !crc
    }

    fn utf16_xml(source: &str, little_endian: bool) -> Vec<u8> {
        let mut bytes = if little_endian {
            vec![0xff, 0xfe]
        } else {
            vec![0xfe, 0xff]
        };
        for unit in source.encode_utf16() {
            let encoded = if little_endian {
                unit.to_le_bytes()
            } else {
                unit.to_be_bytes()
            };
            bytes.extend_from_slice(&encoded);
        }
        bytes
    }

    fn docx_archive_with_unicode_path_extra(raw_name: &str, logical_name: &str) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut archive = ZipWriter::new(cursor);
        let simple = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let content_types = r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#;
        for (name, contents) in [
            ("[Content_Types].xml", content_types.as_bytes()),
            ("_rels/.rels", b"<Relationships/>" as &[u8]),
            ("word/document.xml", b"<root/>" as &[u8]),
        ] {
            archive
                .start_file(name, simple)
                .expect("start required Office part");
            archive
                .write_all(contents)
                .expect("write required Office part");
        }

        let mut unicode_payload = Vec::with_capacity(5 + logical_name.len());
        unicode_payload.push(1);
        // zip-rs validates custom options before it knows the eventual entry
        // name, so write the empty-name CRC first and patch the finished local
        // and central records to construct a valid Unicode-path differential.
        unicode_payload.extend_from_slice(&0_u32.to_le_bytes());
        unicode_payload.extend_from_slice(logical_name.as_bytes());
        let mut unicode_options =
            FullFileOptions::default().compression_method(CompressionMethod::Deflated);
        unicode_options
            .add_extra_data(0x7075, unicode_payload, false)
            .expect("Unicode path extra field");
        archive
            .start_file(raw_name, unicode_options)
            .expect("start Unicode-path Office part");
        archive
            .write_all(b"<root/>")
            .expect("write Unicode-path Office part");
        let mut bytes = archive.finish().expect("finish Office ZIP").into_inner();
        let expected_crc = crc32(raw_name.as_bytes()).to_le_bytes();
        for (signature, fixed_size) in [(b"PK\x03\x04", 30), (b"PK\x01\x02", 46)] {
            let header = zip_header(&bytes, signature, raw_name);
            let extra_start = header + fixed_size + raw_name.len();
            assert_eq!(
                &bytes[extra_start..extra_start + 2],
                &0x7075_u16.to_le_bytes()
            );
            bytes[extra_start + 5..extra_start + 9].copy_from_slice(&expected_crc);
        }
        bytes
    }

    fn zip_header(bytes: &[u8], signature: &[u8; 4], name: &str) -> usize {
        let (fixed_size, name_length_offset) = if signature == b"PK\x03\x04" {
            (30, 26)
        } else {
            (46, 28)
        };
        bytes
            .windows(4)
            .enumerate()
            .filter(|(_, window)| *window == signature)
            .find_map(|(offset, _)| {
                let length_end = offset + name_length_offset + 2;
                if length_end > bytes.len() {
                    return None;
                }
                let length = usize::from(u16::from_le_bytes([
                    bytes[offset + name_length_offset],
                    bytes[offset + name_length_offset + 1],
                ]));
                let start = offset + fixed_size;
                let end = start.checked_add(length)?;
                (bytes.get(start..end) == Some(name.as_bytes())).then_some(offset)
            })
            .expect("ZIP entry header")
    }

    fn patch_zip_u16(
        bytes: &mut [u8],
        name: &str,
        local_offset: usize,
        central_offset: usize,
        value: u16,
    ) {
        for (signature, field_offset) in [
            (b"PK\x03\x04", local_offset),
            (b"PK\x01\x02", central_offset),
        ] {
            let header = zip_header(bytes, signature, name);
            bytes[header + field_offset..header + field_offset + 2]
                .copy_from_slice(&value.to_le_bytes());
        }
    }

    fn patch_zip_u32(
        bytes: &mut [u8],
        name: &str,
        local_offset: usize,
        central_offset: usize,
        value: u32,
    ) {
        for (signature, field_offset) in [
            (b"PK\x03\x04", local_offset),
            (b"PK\x01\x02", central_offset),
        ] {
            let header = zip_header(bytes, signature, name);
            bytes[header + field_offset..header + field_offset + 4]
                .copy_from_slice(&value.to_le_bytes());
        }
    }

    fn rename_zip_entry_same_length(bytes: &mut [u8], from: &str, to: &str) {
        assert_eq!(from.len(), to.len());
        for signature in [b"PK\x03\x04", b"PK\x01\x02"] {
            let header = zip_header(bytes, signature, from);
            let fixed_size = if signature == b"PK\x03\x04" { 30 } else { 46 };
            bytes[header + fixed_size..header + fixed_size + from.len()]
                .copy_from_slice(to.as_bytes());
        }
    }

    #[test]
    fn previews_nested_utf8_and_strips_the_bom() {
        let (directory, workspace) = fixture();
        fs::write(
            directory.path().join("src/bom.ts"),
            b"\xef\xbb\xbfexport const answer = 42;\n",
        )
        .expect("bom source");

        let ordinary = workspace.preview("src/main.rs").expect("ordinary preview");
        assert_eq!(ordinary.kind, PreviewKind::Text);
        assert_eq!(ordinary.text.as_deref(), Some("fn main() {}\n"));
        assert_eq!(ordinary.size_bytes, 13);
        assert!(!ordinary.truncated);
        assert!(ordinary.editable);
        assert_eq!(ordinary.line_ending, Some(PreviewLineEnding::Lf));
        assert_eq!(ordinary.version.as_deref().map(str::len), Some(64));

        let bom = workspace.preview("src/bom.ts").expect("bom preview");
        assert_eq!(bom.text.as_deref(), Some("export const answer = 42;\n"));
        assert_eq!(bom.size_bytes, 29);
    }

    #[test]
    fn saves_existing_preview_and_rejects_stale_versions() {
        let (directory, workspace) = fixture();
        let original = workspace.preview("src/main.rs").expect("original preview");
        let original_version = original.version.expect("editable version");

        let saved = workspace
            .save_preview(
                "src/main.rs",
                &original_version,
                b"fn main() { println!(\"ok\"); }\n",
            )
            .expect("save preview");
        assert_eq!(
            fs::read_to_string(directory.path().join("src/main.rs")).expect("saved source"),
            "fn main() { println!(\"ok\"); }\n"
        );
        assert_eq!(
            saved.text.as_deref(),
            Some("fn main() { println!(\"ok\"); }\n")
        );
        assert_ne!(saved.version.as_deref(), Some(original_version.as_str()));
        assert!(saved.editable);

        fs::write(directory.path().join("src/main.rs"), "same length!\n").expect("external edit");
        let error = workspace
            .save_preview(
                "src/main.rs",
                saved.version.as_deref().expect("saved version"),
                b"mine\n",
            )
            .expect_err("stale save must conflict");
        assert_eq!(error.code(), crate::ErrorCode::Conflict);
        assert_eq!(
            fs::read_to_string(directory.path().join("src/main.rs")).expect("external source"),
            "same length!\n"
        );
    }

    #[test]
    fn saves_empty_files_and_preserves_bom_and_crlf() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("empty.txt"), []).expect("empty file");
        fs::write(
            directory.path().join("windows.txt"),
            b"\xef\xbb\xbffirst\r\nsecond\r\n",
        )
        .expect("windows file");

        let empty = workspace.preview("empty.txt").expect("empty preview");
        assert!(empty.editable);
        assert_eq!(empty.line_ending, Some(PreviewLineEnding::None));
        let empty_saved = workspace
            .save_preview(
                "empty.txt",
                empty.version.as_deref().expect("empty version"),
                b"now populated",
            )
            .expect("save empty file");
        assert_eq!(empty_saved.text.as_deref(), Some("now populated"));

        let windows = workspace.preview("windows.txt").expect("windows preview");
        assert_eq!(windows.text.as_deref(), Some("first\r\nsecond\r\n"));
        assert_eq!(windows.line_ending, Some(PreviewLineEnding::CrLf));
        let saved = workspace
            .save_preview(
                "windows.txt",
                windows.version.as_deref().expect("windows version"),
                b"changed\r\n",
            )
            .expect("save windows file");
        assert_eq!(saved.text.as_deref(), Some("changed\r\n"));
        assert_eq!(
            fs::read(directory.path().join("windows.txt")).expect("saved bytes"),
            b"\xef\xbb\xbfchanged\r\n"
        );
    }

    #[test]
    fn save_reuses_preview_policy_and_content_limits() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join(".env"), "TOKEN=secret\n").expect("sensitive file");
        fs::write(
            directory.path().join("large.txt"),
            vec![b'x'; MAX_PREVIEW_BYTES + 1],
        )
        .expect("large file");
        fs::write(directory.path().join("mixed.txt"), b"one\r\ntwo\n").expect("mixed file");

        assert_eq!(
            workspace
                .save_preview(".env", &"0".repeat(64), b"replacement")
                .expect_err("sensitive save")
                .code(),
            crate::ErrorCode::NotEditable
        );
        assert_eq!(
            workspace
                .save_preview("large.txt", &"0".repeat(64), b"replacement")
                .expect_err("truncated save")
                .code(),
            crate::ErrorCode::NotEditable
        );
        let mixed = workspace.preview("mixed.txt").expect("mixed preview");
        assert!(!mixed.editable);
        assert_eq!(mixed.line_ending, Some(PreviewLineEnding::Mixed));

        let original = workspace.preview("src/main.rs").expect("editable preview");
        let version = original.version.as_deref().expect("version");
        for invalid in [b"nul\0byte".as_slice(), &[0xff], b"one\r\ntwo\n"] {
            assert_eq!(
                workspace
                    .save_preview("src/main.rs", version, invalid)
                    .expect_err("invalid edit content")
                    .code(),
                crate::ErrorCode::NotEditable
            );
        }
        assert_eq!(
            workspace
                .save_preview("src/main.rs", version, &vec![b'y'; MAX_PREVIEW_BYTES + 1])
                .expect_err("oversized edit")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );
        assert_eq!(
            workspace
                .save_preview("../outside.rs", version, b"outside")
                .expect_err("traversal save")
                .code(),
            crate::ErrorCode::InvalidPath
        );
    }

    #[test]
    fn rejects_root_directory_and_ambiguous_paths() {
        let (_directory, workspace) = fixture();
        for invalid in [
            "",
            ".",
            "..",
            "../secret.rs",
            "/etc/passwd",
            "C:/Windows/win.ini",
            "src/main.rs:stream",
        ] {
            assert_eq!(
                workspace
                    .preview(invalid)
                    .expect_err("invalid preview path")
                    .code(),
                crate::ErrorCode::InvalidPath,
                "path should fail: {invalid}"
            );
        }
        assert_eq!(
            workspace.preview("src").expect_err("directory").code(),
            crate::ErrorCode::InvalidPath
        );
    }

    #[test]
    fn bounds_reads_and_preserves_a_valid_utf8_prefix_at_the_cutoff() {
        let (directory, workspace) = fixture();
        let mut contents = vec![b'a'; MAX_PREVIEW_BYTES - 1];
        contents.extend_from_slice("é-tail".as_bytes());
        fs::write(directory.path().join("large.txt"), &contents).expect("large text");

        let preview = workspace.preview("large.txt").expect("large preview");
        assert_eq!(preview.kind, PreviewKind::Text);
        assert_eq!(
            preview.text.as_deref().map(str::len),
            Some(MAX_PREVIEW_BYTES - 1)
        );
        assert_eq!(preview.size_bytes, contents.len() as u64);
        assert!(preview.truncated);
    }

    #[test]
    fn distinguishes_exact_limit_from_one_byte_over_limit() {
        let (directory, workspace) = fixture();
        fs::write(
            directory.path().join("exact.txt"),
            vec![b'x'; MAX_PREVIEW_BYTES],
        )
        .expect("exact text");
        fs::write(
            directory.path().join("over.txt"),
            vec![b'y'; MAX_PREVIEW_BYTES + 1],
        )
        .expect("over text");

        let exact = workspace.preview("exact.txt").expect("exact preview");
        assert_eq!(exact.text.as_deref().map(str::len), Some(MAX_PREVIEW_BYTES));
        assert_eq!(exact.size_bytes, MAX_PREVIEW_BYTES as u64);
        assert!(!exact.truncated);
        assert!(exact.editable);
        assert!(exact.version.is_some());

        let over = workspace.preview("over.txt").expect("over preview");
        assert_eq!(over.text.as_deref().map(str::len), Some(MAX_PREVIEW_BYTES));
        assert_eq!(over.size_bytes, (MAX_PREVIEW_BYTES + 1) as u64);
        assert!(over.truncated);
        assert!(!over.editable);
        assert!(over.version.is_none());
    }

    #[test]
    fn huge_files_have_a_bounded_preview_response() {
        let (directory, workspace) = fixture();
        let path = directory.path().join("huge.txt");
        let mut file = fs::File::create(&path).expect("huge file");
        file.write_all(&vec![b'z'; MAX_PREVIEW_BYTES + 1])
            .expect("preview prefix");
        const HUGE_SIZE: u64 = 32 * 1024 * 1024;
        file.set_len(HUGE_SIZE).expect("extend huge file");
        drop(file);

        let preview = workspace.preview("huge.txt").expect("huge preview");
        assert_eq!(preview.kind, PreviewKind::Text);
        assert_eq!(
            preview.text.as_deref().map(str::len),
            Some(MAX_PREVIEW_BYTES)
        );
        assert_eq!(preview.size_bytes, HUGE_SIZE);
        assert!(preview.truncated);
    }

    #[test]
    fn rejects_nul_and_invalid_utf8_without_returning_bytes() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("binary.txt"), b"prefix\0secret").expect("nul file");
        fs::write(directory.path().join("invalid.txt"), [b'a', 0xff, b'b']).expect("invalid file");

        let nul = workspace.preview("binary.txt").expect("nul result");
        assert_eq!(nul.kind, PreviewKind::Unsupported);
        assert_eq!(nul.reason, Some(PreviewUnsupportedReason::Binary));
        assert!(nul.text.is_none());

        let invalid = workspace.preview("invalid.txt").expect("invalid result");
        assert_eq!(invalid.kind, PreviewKind::Unsupported);
        assert_eq!(invalid.reason, Some(PreviewUnsupportedReason::InvalidUtf8));
        assert!(invalid.text.is_none());
    }

    #[test]
    fn rejects_a_nul_in_the_truncation_sentinel_byte() {
        let (directory, workspace) = fixture();
        let mut contents = vec![b'a'; MAX_PREVIEW_BYTES];
        contents.push(0);
        fs::write(directory.path().join("sentinel.txt"), contents).expect("sentinel file");

        let result = workspace.preview("sentinel.txt").expect("sentinel result");
        assert_eq!(result.kind, PreviewKind::Unsupported);
        assert_eq!(result.reason, Some(PreviewUnsupportedReason::Binary));
        assert_eq!(result.size_bytes, (MAX_PREVIEW_BYTES + 1) as u64);
        assert!(result.truncated);
        assert!(result.text.is_none());
    }

    #[test]
    fn validates_utf8_in_the_sentinel_but_allows_a_potentially_incomplete_sequence() {
        let (directory, workspace) = fixture();
        let mut invalid = vec![b'a'; MAX_PREVIEW_BYTES];
        invalid.push(0xff);
        fs::write(directory.path().join("invalid-sentinel.txt"), invalid)
            .expect("invalid sentinel file");

        let invalid_result = workspace
            .preview("invalid-sentinel.txt")
            .expect("invalid sentinel result");
        assert_eq!(invalid_result.kind, PreviewKind::Unsupported);
        assert_eq!(
            invalid_result.reason,
            Some(PreviewUnsupportedReason::InvalidUtf8)
        );
        assert!(invalid_result.truncated);
        assert!(invalid_result.text.is_none());

        let mut incomplete_eof = vec![b'b'; MAX_PREVIEW_BYTES - 1];
        incomplete_eof.extend_from_slice(&[0xf0, 0x9f]);
        fs::write(directory.path().join("incomplete-eof.txt"), incomplete_eof)
            .expect("incomplete eof file");

        let incomplete_eof_result = workspace
            .preview("incomplete-eof.txt")
            .expect("incomplete eof result");
        assert_eq!(incomplete_eof_result.kind, PreviewKind::Unsupported);
        assert_eq!(
            incomplete_eof_result.reason,
            Some(PreviewUnsupportedReason::InvalidUtf8)
        );
        assert!(incomplete_eof_result.truncated);
        assert!(incomplete_eof_result.text.is_none());

        let mut potentially_incomplete = vec![b'c'; MAX_PREVIEW_BYTES - 1];
        potentially_incomplete.extend_from_slice(&[0xf0, 0x9f, 0x92, 0xa9]);
        fs::write(
            directory.path().join("potentially-incomplete.txt"),
            potentially_incomplete,
        )
        .expect("potentially incomplete file");

        let incomplete_result = workspace
            .preview("potentially-incomplete.txt")
            .expect("potentially incomplete result");
        assert_eq!(incomplete_result.kind, PreviewKind::Text);
        assert_eq!(
            incomplete_result.text.as_deref().map(str::len),
            Some(MAX_PREVIEW_BYTES - 1)
        );
        assert!(incomplete_result.truncated);
        assert!(incomplete_result.reason.is_none());
    }

    #[test]
    fn gates_sensitive_unknown_and_binary_or_executable_types_before_reading() {
        let (directory, workspace) = fixture();
        for name in [
            ".env",
            ".env.local",
            ".npmrc",
            ".pypirc",
            ".netrc",
            "id_rsa",
            "id_ed25519.bak",
            "client.pem",
            "store.pfx",
            "secrets.json",
        ] {
            fs::write(directory.path().join(name), "should not cross").expect("sensitive file");
            let result = workspace.preview(name).expect("sensitive result");
            assert_eq!(result.kind, PreviewKind::Unsupported, "{name}");
            assert_eq!(
                result.reason,
                Some(PreviewUnsupportedReason::Sensitive),
                "{name}"
            );
            assert!(result.text.is_none());
        }

        for name in [
            "image.png",
            "archive.zip",
            "manual.pdf",
            "database.sqlite",
            "program.exe",
            "unknown.blob",
        ] {
            fs::write(
                directory.path().join(name),
                "valid UTF-8 must still be gated",
            )
            .expect("unsupported file");
            let result = workspace.preview(name).expect("unsupported result");
            assert_eq!(result.kind, PreviewKind::Unsupported, "{name}");
            assert_eq!(
                result.reason,
                Some(PreviewUnsupportedReason::UnsupportedType),
                "{name}"
            );
            assert!(result.text.is_none());
        }
    }

    #[test]
    fn permits_known_text_extensions_and_project_file_names_case_insensitively() {
        let (directory, workspace) = fixture();
        for name in [
            "README",
            "Dockerfile",
            "CONFIG.YAML",
            "query.SQL",
            ".editorconfig",
        ] {
            fs::write(directory.path().join(name), "text").expect("text file");
            assert_eq!(
                workspace.preview(name).expect("text preview").kind,
                PreviewKind::Text,
                "{name}"
            );
        }
    }

    #[test]
    fn media_info_and_chunks_are_bounded_versioned_and_camel_case() {
        let (directory, workspace) = fixture();
        let mut contents = vec![0x5a; MEDIA_CHUNK_BYTES + 17];
        contents[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        fs::write(directory.path().join("preview.png"), &contents).expect("image");

        let info = workspace.media_info("preview.png").expect("media info");
        assert_eq!(info.kind, MediaKind::Image);
        assert_eq!(info.mime_type, "image/png");
        assert_eq!(info.size_bytes, contents.len() as u64);
        assert_eq!(info.version.len(), 64);
        assert_eq!(info.chunk_size, MEDIA_CHUNK_BYTES);
        assert_eq!(info.chunk_count, 2);

        let serialized = serde_json::to_value(&info).expect("serialize media info");
        assert_eq!(serialized["kind"], "image");
        assert_eq!(serialized["mimeType"], "image/png");
        assert_eq!(serialized["sizeBytes"], contents.len() as u64);
        assert_eq!(serialized["chunkSize"], MEDIA_CHUNK_BYTES);
        assert_eq!(serialized["chunkCount"], 2);

        let first = workspace
            .media_chunk(
                "preview.png",
                0,
                info.chunk_size,
                info.size_bytes,
                &info.version,
            )
            .expect("first chunk");
        assert_eq!(first.offset, 0);
        assert_eq!(first.data, contents[..MEDIA_CHUNK_BYTES]);
        assert!(!first.eof);

        let last = workspace
            .media_chunk(
                "preview.png",
                MEDIA_CHUNK_BYTES as u64,
                info.chunk_size,
                info.size_bytes,
                &info.version,
            )
            .expect("last chunk");
        assert_eq!(last.data, contents[MEDIA_CHUNK_BYTES..]);
        assert!(last.eof);

        assert_eq!(
            workspace
                .media_chunk("preview.png", 0, 0, info.size_bytes, &info.version)
                .expect_err("empty chunk")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        assert_eq!(
            workspace
                .media_chunk(
                    "preview.png",
                    0,
                    MAX_MEDIA_CHUNK_BYTES + 1,
                    info.size_bytes,
                    &info.version,
                )
                .expect_err("oversized chunk")
                .code(),
            crate::ErrorCode::InvalidPath
        );
        assert_eq!(
            workspace
                .media_chunk("preview.png", 0, 1, info.size_bytes + 1, &info.version,)
                .expect_err("changed size")
                .code(),
            crate::ErrorCode::Conflict
        );
        assert_eq!(
            workspace
                .media_chunk("preview.png", 0, 1, info.size_bytes, &"0".repeat(64))
                .expect_err("changed version")
                .code(),
            crate::ErrorCode::Conflict
        );
    }

    #[test]
    fn media_chunks_reject_same_size_replacements_with_restored_modified_time() {
        let (directory, workspace) = fixture();
        let path = directory.path().join("same-size.png");
        let mut original = vec![0x11; 128];
        original[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        fs::write(&path, &original).expect("original image");
        let original_modified = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .expect("original modified time");
        let info = workspace.media_info("same-size.png").expect("media info");

        let mut replacement = original.clone();
        replacement[64] = 0x22;
        let replacement_path = directory.path().join("replacement.png");
        fs::write(&replacement_path, replacement).expect("same-size replacement");
        let file = fs::OpenOptions::new()
            .write(true)
            .open(&replacement_path)
            .expect("replacement handle");
        if file
            .set_times(fs::FileTimes::new().set_modified(original_modified))
            .is_err()
        {
            return;
        }
        drop(file);
        if fs::metadata(&replacement_path)
            .and_then(|metadata| metadata.modified())
            .ok()
            != Some(original_modified)
        {
            return;
        }

        // Keep both files allocated until replacement so their native file
        // identities cannot be reused, then restore the original path.
        fs::remove_file(&path).expect("remove original image");
        fs::rename(&replacement_path, &path).expect("replace image");
        let replacement_metadata = fs::metadata(&path).expect("replacement metadata");
        assert_eq!(replacement_metadata.len(), info.size_bytes);
        if replacement_metadata.modified().ok() != Some(original_modified) {
            return;
        }

        let changed = workspace
            .media_chunk("same-size.png", 0, 64, info.size_bytes, &info.version)
            .expect_err("same-size replacement");
        assert_eq!(changed.code(), crate::ErrorCode::Conflict);
        assert_ne!(
            workspace
                .media_info("same-size.png")
                .expect("replacement info")
                .version,
            info.version
        );
    }

    #[test]
    fn office_policy_accepts_only_matching_docx_xlsx_ppt_and_pptx_packages() {
        let (directory, workspace) = fixture();
        for (name, main_part, content_type, mime_type) in [
            (
                "document.docx",
                "word/document.xml",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            (
                "workbook.xlsx",
                "xl/workbook.xml",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
            (
                "slides.pptx",
                "ppt/presentation.xml",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ),
        ] {
            let bytes = office_archive(main_part, content_type, &[], CompressionMethod::Deflated);
            fs::write(directory.path().join(name), &bytes).expect("Office package");
            let info = workspace.media_info(name).expect("Office media info");
            assert_eq!(info.kind, MediaKind::Office, "{name}");
            assert_eq!(info.mime_type, mime_type, "{name}");
            assert_eq!(info.size_bytes, bytes.len() as u64, "{name}");
            assert_eq!(info.chunk_count, 1, "{name}");
        }

        let legacy = legacy_ppt(0xe391_c05f, None);
        fs::write(directory.path().join("slides.ppt"), &legacy).expect("legacy PowerPoint package");
        let legacy_info = workspace
            .media_info("slides.ppt")
            .expect("legacy PowerPoint media info");
        assert_eq!(legacy_info.kind, MediaKind::Office);
        assert_eq!(legacy_info.mime_type, "application/vnd.ms-powerpoint");
        assert_eq!(legacy_info.size_bytes, legacy.len() as u64);
        assert_eq!(legacy_info.chunk_count, 1);

        let docx = docx_archive(&[]);
        fs::write(directory.path().join("mismatch.xlsx"), docx).expect("mismatched Office package");
        assert_eq!(
            workspace
                .media_info("mismatch.xlsx")
                .expect_err("mismatched Office type")
                .code(),
            crate::ErrorCode::NotEditable
        );

        fs::write(directory.path().join("renamed.ppt"), docx_archive(&[]))
            .expect("renamed DOCX package");
        assert_eq!(
            workspace
                .media_info("renamed.ppt")
                .expect_err("renamed DOCX as legacy PowerPoint")
                .code(),
            crate::ErrorCode::NotEditable
        );

        let wrong_main = office_archive(
            "word/other.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
            &[],
            CompressionMethod::Stored,
        );
        fs::write(directory.path().join("missing-main.docx"), wrong_main)
            .expect("missing main part");
        assert_eq!(
            workspace
                .media_info("missing-main.docx")
                .expect_err("missing main part")
                .code(),
            crate::ErrorCode::NotEditable
        );

        let macro_enabled = office_archive(
            "word/document.xml",
            "application/vnd.ms-word.document.macroEnabled.main+xml",
            &[],
            CompressionMethod::Stored,
        );
        fs::write(directory.path().join("macro.docx"), macro_enabled).expect("macro package");
        assert_eq!(
            workspace
                .media_info("macro.docx")
                .expect_err("macro-enabled package")
                .code(),
            crate::ErrorCode::NotEditable
        );
    }

    #[test]
    fn legacy_ppt_policy_rejects_encryption_and_active_content() {
        let (directory, workspace) = fixture();
        for (name, bytes) in [
            ("encrypted.ppt", legacy_ppt(0xf3d1_c4df, None)),
            (
                "embedded-object.ppt",
                legacy_ppt(0xe391_c05f, Some("ObjectPool")),
            ),
            ("macro.ppt", legacy_ppt(0xe391_c05f, Some("VBA"))),
        ] {
            fs::write(directory.path().join(name), bytes).expect("unsafe legacy PowerPoint");
            assert_eq!(
                workspace
                    .media_info(name)
                    .expect_err("unsafe legacy PowerPoint")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{name}"
            );
        }
    }

    #[test]
    fn office_policy_rejects_ambiguous_or_unsafe_zip_structures() {
        let (directory, workspace) = fixture();

        let mut traversal = docx_archive(&[("safe/part.xml".to_owned(), Vec::new())]);
        rename_zip_entry_same_length(&mut traversal, "safe/part.xml", "../evil/x.xml");

        let mut duplicate = docx_archive(&[
            ("safe/a.xml".to_owned(), Vec::new()),
            ("safe/b.xml".to_owned(), Vec::new()),
        ]);
        rename_zip_entry_same_length(&mut duplicate, "safe/b.xml", "safe/a.xml");

        let mut encrypted = docx_archive(&[("safe/part.xml".to_owned(), Vec::new())]);
        patch_zip_u16(&mut encrypted, "safe/part.xml", 6, 8, 1);

        let mut unsupported_compression = docx_archive(&[("safe/part.xml".to_owned(), Vec::new())]);
        patch_zip_u16(&mut unsupported_compression, "safe/part.xml", 8, 10, 12);

        let active_content = docx_archive(&[("word/vbaProject.bin".to_owned(), vec![0_u8])]);

        for (name, bytes) in [
            ("traversal.docx", traversal),
            ("duplicate.docx", duplicate),
            ("encrypted.docx", encrypted),
            ("unsupported-compression.docx", unsupported_compression),
            ("active-content.docx", active_content),
        ] {
            fs::write(directory.path().join(name), bytes).expect("unsafe Office package");
            assert_eq!(
                workspace
                    .media_info(name)
                    .expect_err("unsafe Office ZIP")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{name}"
            );
        }
    }

    #[test]
    fn office_policy_rejects_forged_expansion_crc_and_unicode_paths() {
        let (directory, workspace) = fixture();
        let reject = |name: &str, bytes: &[u8]| {
            fs::write(directory.path().join(name), bytes).expect("write unsafe Office package");
            assert_eq!(
                workspace
                    .media_info(name)
                    .expect_err("unsafe Office package")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{name}"
            );
        };

        let payload_name = "safe/payload.bin";
        let mut forged_length = docx_archive(&[(payload_name.to_owned(), vec![b'a'; 64 * 1024])]);
        patch_zip_u32(&mut forged_length, payload_name, 22, 24, 128 * 1024);
        reject("forged-length.docx", &forged_length);

        let bomb_name = "safe/compressed.bin";
        let mut forged_bomb = docx_archive(&[(
            bomb_name.to_owned(),
            vec![0_u8; MAX_OFFICE_ENTRY_BYTES as usize + 1],
        )]);
        patch_zip_u32(&mut forged_bomb, bomb_name, 22, 24, 1);
        reject("forged-bomb.docx", &forged_bomb);

        let crc_name = "safe/crc.bin";
        let mut bad_crc = docx_archive(&[(crc_name.to_owned(), b"checksum".to_vec())]);
        patch_zip_u32(&mut bad_crc, crc_name, 14, 16, 0);
        reject("bad-crc.docx", &bad_crc);

        let unicode_path =
            docx_archive_with_unicode_path_extra("safe/part.xml", "word/vbaProject.bin");
        reject("unicode-path.docx", &unicode_path);
    }

    #[test]
    fn office_policy_bounds_and_sanitizes_every_xml_part() {
        let (directory, workspace) = fixture();
        let reject = |name: &str, bytes: &[u8]| {
            fs::write(directory.path().join(name), bytes).expect("write unsafe Office package");
            assert_eq!(
                workspace
                    .media_info(name)
                    .expect_err("unsafe Office XML")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{name}"
            );
        };

        let doctype = docx_archive(&[(
            "word/styles.xml".to_owned(),
            b"<!DoCtYpE root><root/>".to_vec(),
        )]);
        reject("doctype.docx", &doctype);

        let entity = docx_archive(&[(
            "word/_rels/document.xml.rels".to_owned(),
            b"<!EnTiTy external SYSTEM 'file:///secret'><Relationships/>".to_vec(),
        )]);
        reject("entity.docx", &entity);

        let utf16_doctype = docx_archive(&[(
            "word/utf16-doctype.xml".to_owned(),
            utf16_xml(
                r#"<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE root><root/>"#,
                true,
            ),
        )]);
        reject("utf16-doctype.docx", &utf16_doctype);

        let utf16_entity = docx_archive(&[(
            "word/_rels/utf16.rels".to_owned(),
            utf16_xml(
                "<!ENTITY external SYSTEM 'file:///secret'><Relationships/>",
                false,
            ),
        )]);
        reject("utf16-entity.docx", &utf16_entity);

        let declared_utf16 = docx_archive(&[(
            "word/declared-utf16.xml".to_owned(),
            br#"<?xml version="1.0" encoding="UTF-16"?><root/>"#.to_vec(),
        )]);
        reject("declared-utf16.docx", &declared_utf16);

        let invalid_utf8 = docx_archive(&[("word/invalid.xml".to_owned(), vec![b'<', 0xff, b'>'])]);
        reject("invalid-utf8.docx", &invalid_utf8);

        let valid_bom = docx_archive(&[(
            "word/utf8-bom.xml".to_owned(),
            b"\xef\xbb\xbf<?xml version='1.0' encoding='utf-8'?><root/>".to_vec(),
        )]);
        fs::write(directory.path().join("utf8-bom.docx"), valid_bom)
            .expect("write UTF-8 BOM Office package");
        workspace
            .media_info("utf8-bom.docx")
            .expect("UTF-8 BOM Office XML");

        let xml_name = "word/large.xml";
        let mut forged_xml = docx_archive(&[(
            xml_name.to_owned(),
            vec![b' '; MAX_OFFICE_XML_BYTES as usize + 1],
        )]);
        patch_zip_u32(&mut forged_xml, xml_name, 22, 24, 1);
        reject("forged-xml.docx", &forged_xml);
    }

    #[test]
    fn office_policy_bounds_entries_and_expanded_data() {
        let (directory, workspace) = fixture();

        let mut oversized_entry = docx_archive(&[("safe/large.bin".to_owned(), Vec::new())]);
        patch_zip_u32(
            &mut oversized_entry,
            "safe/large.bin",
            22,
            24,
            u32::try_from(MAX_OFFICE_ENTRY_BYTES + 1).expect("entry bound fits u32"),
        );
        fs::write(
            directory.path().join("oversized-entry.docx"),
            oversized_entry,
        )
        .expect("oversized entry package");
        assert_eq!(
            workspace
                .media_info("oversized-entry.docx")
                .expect_err("oversized expanded entry")
                .code(),
            crate::ErrorCode::NotEditable
        );

        let total_names = (0..9)
            .map(|index| (format!("safe/expanded-{index}.bin"), Vec::new()))
            .collect::<Vec<_>>();
        let mut oversized_total = docx_archive(&total_names);
        for (name, _) in &total_names {
            patch_zip_u32(
                &mut oversized_total,
                name,
                22,
                24,
                u32::try_from(MAX_OFFICE_ENTRY_BYTES).expect("entry bound fits u32"),
            );
        }
        fs::write(
            directory.path().join("oversized-total.docx"),
            oversized_total,
        )
        .expect("oversized total package");
        assert_eq!(
            workspace
                .media_info("oversized-total.docx")
                .expect_err("oversized expanded total")
                .code(),
            crate::ErrorCode::NotEditable
        );

        let too_many_names = (0..(MAX_OFFICE_ENTRIES - 2))
            .map(|index| (format!("safe/entry-{index}.xml"), Vec::new()))
            .collect::<Vec<_>>();
        let too_many = docx_archive(&too_many_names);
        fs::write(directory.path().join("too-many.docx"), too_many)
            .expect("too many entries package");
        assert_eq!(
            workspace
                .media_info("too-many.docx")
                .expect_err("too many Office entries")
                .code(),
            crate::ErrorCode::NotEditable
        );
    }

    #[test]
    fn media_policy_allows_only_supported_signatures_and_size_classes() {
        let (directory, workspace) = fixture();
        for (name, contents, kind, mime_type) in [
            (
                "preview.png",
                &b"\x89PNG\r\n\x1a\n"[..],
                MediaKind::Image,
                "image/png",
            ),
            (
                "preview.jpg",
                &b"\xff\xd8\xff"[..],
                MediaKind::Image,
                "image/jpeg",
            ),
            (
                "preview.jpeg",
                &b"\xff\xd8\xff"[..],
                MediaKind::Image,
                "image/jpeg",
            ),
            ("preview.gif", &b"GIF89a"[..], MediaKind::Image, "image/gif"),
            (
                "preview.webp",
                &b"RIFF\0\0\0\0WEBP"[..],
                MediaKind::Image,
                "image/webp",
            ),
            ("preview.bmp", &b"BM"[..], MediaKind::Image, "image/bmp"),
            (
                "preview.ico",
                &b"\0\0\x01\0"[..],
                MediaKind::Image,
                "image/x-icon",
            ),
            (
                "preview.avif",
                &b"\0\0\0\x14ftypmif1\0\0\0\0avif"[..],
                MediaKind::Image,
                "image/avif",
            ),
            (
                "clip.mp4",
                &b"\0\0\0\x10ftypisom\0\0\0\0"[..],
                MediaKind::Video,
                "video/mp4",
            ),
            (
                "clip.m4v",
                &b"\0\0\0\x10ftypM4V \0\0\0\0"[..],
                MediaKind::Video,
                "video/mp4",
            ),
            (
                "clip.mov",
                &b"\0\0\0\x10ftypqt  \0\0\0\0"[..],
                MediaKind::Video,
                "video/quicktime",
            ),
            (
                "clip.webm",
                &b"\x1a\x45\xdf\xa3"[..],
                MediaKind::Video,
                "video/webm",
            ),
            ("clip.ogv", &b"OggS"[..], MediaKind::Video, "video/ogg"),
            (
                "document.pdf",
                &b"%PDF-1.7\n"[..],
                MediaKind::Pdf,
                "application/pdf",
            ),
            (
                "tagged.mp3",
                &b"ID3\x04\0\0\0\0\0\0"[..],
                MediaKind::Audio,
                "audio/mpeg",
            ),
            (
                "frame.mp3",
                &b"\xff\xfb\x90\x64"[..],
                MediaKind::Audio,
                "audio/mpeg",
            ),
            (
                "sound.wav",
                &b"RIFF\x04\0\0\0WAVE"[..],
                MediaKind::Audio,
                "audio/wav",
            ),
            ("sound.flac", &b"fLaC"[..], MediaKind::Audio, "audio/flac"),
            (
                "sound.m4a",
                &b"\0\0\0\x10ftypM4A \0\0\0\0"[..],
                MediaKind::Audio,
                "audio/mp4",
            ),
            ("sound.ogg", &b"OggS"[..], MediaKind::Audio, "audio/ogg"),
            (
                "sound.aac",
                &b"\xff\xf1\x50\x80\x00\xff\xfc"[..],
                MediaKind::Audio,
                "audio/aac",
            ),
            ("adif.aac", &b"ADIF"[..], MediaKind::Audio, "audio/aac"),
        ] {
            fs::write(directory.path().join(name), contents).expect("media fixture");
            let info = workspace.media_info(name).expect("media info");
            assert_eq!(info.kind, kind, "{name}");
            assert_eq!(info.mime_type, mime_type, "{name}");
            let serialized = serde_json::to_value(&info).expect("serialize media info");
            let expected_kind = match kind {
                MediaKind::Image => "image",
                MediaKind::Video => "video",
                MediaKind::Pdf => "pdf",
                MediaKind::Audio => "audio",
                MediaKind::Office => "office",
            };
            assert_eq!(serialized["kind"], expected_kind, "{name}");
        }

        let png = b"\x89PNG\r\n\x1a\nrest";
        fs::write(directory.path().join(".env.png"), png).expect("sensitive image");
        fs::write(directory.path().join("spoof.png"), b"not an image").expect("spoof");
        fs::write(
            directory.path().join("spoof.avif"),
            b"\0\0\0\x10ftypmif1\0\0\0\0",
        )
        .expect("spoof avif");
        fs::write(
            directory.path().join("spoof.mov"),
            b"\0\0\0\x10ftypisom\0\0\0\0",
        )
        .expect("spoof quicktime");
        fs::write(directory.path().join("vector.svg"), b"<svg/>").expect("svg");
        fs::write(directory.path().join("movie.avi"), b"RIFF....AVI ").expect("avi");
        fs::write(directory.path().join("empty.png"), []).expect("empty image");
        fs::write(directory.path().join("spoof.pdf"), b"%PDF-invalid").expect("spoof pdf");
        fs::write(directory.path().join("spoof.mp3"), b"ID3\xff\0\0\0\0\0\0").expect("spoof mp3");
        fs::write(directory.path().join("spoof.wav"), b"RIFF\x04\0\0\0AVI ").expect("spoof wav");
        fs::write(directory.path().join("spoof.flac"), b"not flac").expect("spoof flac");
        fs::write(
            directory.path().join("spoof.m4a"),
            b"\0\0\0\x10ftypavif\0\0\0\0",
        )
        .expect("spoof m4a");
        fs::write(directory.path().join("spoof.ogg"), b"not ogg").expect("spoof ogg");
        fs::write(directory.path().join("spoof.aac"), b"\xff\xf1\xfc\0\0\0\0").expect("spoof aac");

        assert_eq!(
            workspace
                .media_info(".env.png")
                .expect_err("sensitive media")
                .code(),
            crate::ErrorCode::AccessDenied
        );
        for unsupported in [
            "spoof.png",
            "spoof.avif",
            "spoof.mov",
            "vector.svg",
            "movie.avi",
            "empty.png",
            "spoof.pdf",
            "spoof.mp3",
            "spoof.wav",
            "spoof.flac",
            "spoof.m4a",
            "spoof.ogg",
            "spoof.aac",
        ] {
            assert_eq!(
                workspace
                    .media_info(unsupported)
                    .expect_err("unsupported media")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{unsupported}"
            );
        }

        let oversized = directory.path().join("oversized.png");
        let mut file = fs::File::create(&oversized).expect("large image");
        file.write_all(png).expect("image signature");
        file.set_len(MAX_IMAGE_PREVIEW_BYTES + 1)
            .expect("sparse large image");
        drop(file);
        assert_eq!(
            workspace
                .media_info("oversized.png")
                .expect_err("large image")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );

        let oversized_pdf = directory.path().join("oversized.pdf");
        let mut file = fs::File::create(&oversized_pdf).expect("large pdf");
        file.write_all(b"%PDF-1.7").expect("pdf signature");
        file.set_len(MAX_PDF_PREVIEW_BYTES + 1)
            .expect("sparse large pdf");
        drop(file);
        assert_eq!(
            workspace
                .media_info("oversized.pdf")
                .expect_err("large pdf")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );

        let oversized_audio = directory.path().join("oversized.mp3");
        let mut file = fs::File::create(&oversized_audio).expect("large audio");
        file.write_all(b"ID3\x04\0\0\0\0\0\0")
            .expect("audio signature");
        file.set_len(MAX_AUDIO_PREVIEW_BYTES + 1)
            .expect("sparse large audio");
        drop(file);
        assert_eq!(
            workspace
                .media_info("oversized.mp3")
                .expect_err("large audio")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );

        let oversized_office = directory.path().join("oversized.docx");
        let mut file = fs::File::create(&oversized_office).expect("large Office file");
        file.write_all(b"PK\x03\x04").expect("Office signature");
        file.set_len(MAX_OFFICE_PREVIEW_BYTES + 1)
            .expect("sparse large Office file");
        drop(file);
        assert_eq!(
            workspace
                .media_info("oversized.docx")
                .expect_err("large Office file")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );
    }

    #[test]
    fn serializes_the_camel_case_discriminated_contract() {
        let result =
            PreviewResult::unsupported(PreviewUnsupportedReason::InvalidUtf8, 70_000, true);
        let value = serde_json::to_value(result).expect("serialize preview");
        assert_eq!(value["kind"], "unsupported");
        assert_eq!(value["sizeBytes"], 70_000);
        assert_eq!(value["truncated"], true);
        assert_eq!(value["editable"], false);
        assert_eq!(value["reason"], "invalid-utf8");
        assert!(value.get("text").is_none());
        assert!(value.get("version").is_none());
        assert!(value.get("lineEnding").is_none());
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
    fn rejects_final_file_and_ancestor_reparse_points() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        fs::write(outside.path().join("outside.rs"), "outside").expect("outside file");
        fs::write(
            outside.path().join("outside.png"),
            b"\x89PNG\r\n\x1a\noutside",
        )
        .expect("outside image");
        fs::create_dir(outside.path().join("tree")).expect("outside tree");
        fs::write(outside.path().join("tree/nested.rs"), "outside nested").expect("outside nested");
        fs::write(
            outside.path().join("tree/nested.png"),
            b"\x89PNG\r\n\x1a\noutside nested",
        )
        .expect("outside nested image");

        if !symlink_file(
            &outside.path().join("outside.rs"),
            &directory.path().join("linked.rs"),
        ) || !symlink_file(
            &outside.path().join("outside.png"),
            &directory.path().join("linked.png"),
        ) || !symlink_directory(
            &outside.path().join("tree"),
            &directory.path().join("linked-tree"),
        ) {
            return;
        }

        assert_eq!(
            workspace
                .preview("linked.rs")
                .expect_err("file reparse")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .preview("linked-tree/nested.rs")
                .expect_err("ancestor reparse")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .save_preview("linked.rs", &"0".repeat(64), b"replacement")
                .expect_err("file reparse save")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .save_preview("linked-tree/nested.rs", &"0".repeat(64), b"replacement",)
                .expect_err("ancestor reparse save")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .media_info("linked.png")
                .expect_err("media file reparse")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .media_info("linked-tree/nested.png")
                .expect_err("media ancestor reparse")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            fs::read_to_string(outside.path().join("outside.rs")).expect("outside file"),
            "outside"
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn root_replacement_after_read_prevents_content_from_returning() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let moved = parent.path().join("moved");
        fs::create_dir(&root).expect("root");
        fs::write(root.join("secret.txt"), "bound content").expect("content");
        let workspace = Workspace::open(&root).expect("workspace");

        let result = workspace.preview_with_after_read("secret.txt", || {
            fs::rename(&root, &moved).expect("move original root");
            fs::create_dir(&root).expect("replacement root");
            fs::write(root.join("secret.txt"), "replacement content").expect("replacement");
        });
        assert_eq!(
            result.expect_err("stale root must fail").code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }
}
