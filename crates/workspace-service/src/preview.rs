use std::collections::{HashMap, VecDeque};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};

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
pub const MAX_NOTEBOOK_PREVIEW_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_OFFICE_PREVIEW_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_MODEL_PREVIEW_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_MODEL_RESOURCE_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_MODEL_RESOURCE_AGGREGATE_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_NATIVE_POWERPOINT_PREVIEW_BYTES: u64 = 64 * 1024 * 1024;

pub const NATIVE_POWERPOINT_PREVIEW_MIME: &str = "application/vnd.code-codex.powerpoint-slides+zip";

const MEDIA_SIGNATURE_BYTES: usize = 4 * 1024;
const MAX_MODEL_JSON_BYTES: u64 = 16 * 1024 * 1024;
const MAX_MODEL_EXTERNAL_RESOURCES: usize = 256;
const MAX_MODEL_RESOURCE_URI_BYTES: usize = 2 * 1024;
const MAX_MODEL_RESOURCE_CACHE_ENTRIES: usize = 8;
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
#[cfg(windows)]
const NATIVE_POWERPOINT_COM_UNAVAILABLE_EXIT_CODE: i32 = 41;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
    Pdf,
    Audio,
    Notebook,
    Office,
    Model,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum MediaPreviewNotice {
    #[serde(rename = "powerpoint-required-for-full-fidelity")]
    PowerpointRequiredForFullFidelity,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_notice: Option<MediaPreviewNotice>,
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
    NotebookJson,
    Docx,
    Xlsx,
    Ppt,
    Pptx,
    GltfJson,
    Glb,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OfficeValidationCacheKey {
    root: PathBuf,
    relative_path: PathBuf,
    signature: MediaSignature,
    size_bytes: u64,
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

impl Workspace {
    /// Reads a small, text-only preview through the retained workspace
    /// capability. The renderer never controls the byte ceiling.
    pub fn preview(&self, relative_path: &str) -> Result<PreviewResult, WorkspaceError> {
        self.preview_with_after_read(relative_path, || {})
    }

    /// Returns metadata for a renderer-supported image, video, PDF, audio, notebook, or Office
    /// file without transferring its contents. Media is still opened through the retained
    /// workspace capability and is limited by native policy.
    pub fn media_info(&self, relative_path: &str) -> Result<MediaInfo, WorkspaceError> {
        let (mut file, policy, size_bytes, version) = self.open_media(relative_path)?;
        let mut preview_notice = None;
        if policy.signature == MediaSignature::Ppt
            && size_bytes >= MIN_NATIVE_POWERPOINT_SOURCE_BYTES
        {
            let clean = validate_relative(relative_path)?;
            match self.native_powerpoint_bundle(&clean, &mut file, size_bytes, &version) {
                NativePowerPointPreview::Rendered(bundle) => {
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
                        preview_notice: None,
                    });
                }
                NativePowerPointPreview::PowerpointUnavailable => {
                    preview_notice = Some(MediaPreviewNotice::PowerpointRequiredForFullFidelity);
                }
                NativePowerPointPreview::Embedded => {}
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
            preview_notice,
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

    /// Returns metadata for an external buffer or texture referenced by one
    /// specific glTF model. The resource URI is never treated as a general
    /// workspace path: it must occur in the version-bound model manifest and
    /// resolve, component by component, inside the retained workspace root.
    pub fn model_resource_info(
        &self,
        model_relative_path: &str,
        resource_uri: &str,
        expected_model_version: &str,
    ) -> Result<ModelResourceInfo, WorkspaceError> {
        let (mut model, policy, model_size, model_version) =
            self.open_media(model_relative_path)?;
        if policy.kind != MediaKind::Model {
            return Err(WorkspaceError::NotEditable);
        }
        if model_version != expected_model_version {
            return Err(WorkspaceError::Conflict);
        }
        let model_path = validate_relative(model_relative_path)?;
        let (cache_key, resources) = self.model_resource_snapshot(
            &model_path,
            &mut model,
            policy.signature,
            model_size,
            &model_version,
        )?;
        let descriptor = resources
            .iter()
            .find(|descriptor| descriptor.reference.uri == resource_uri)
            .ok_or(WorkspaceError::InvalidPath)?;
        let (resource, size_bytes, version) = match self.open_model_resource(&descriptor.reference)
        {
            Ok(opened) => opened,
            Err(error) => {
                invalidate_cached_model_resources(&cache_key);
                return Err(error);
            }
        };
        if size_bytes != descriptor.size_bytes || version != descriptor.version {
            invalidate_cached_model_resources(&cache_key);
            return Err(WorkspaceError::Conflict);
        }
        drop(resource);
        self.ensure_model_version(&model, model_size, expected_model_version)?;
        self.ensure_root_valid()?;
        let chunk_size = MEDIA_CHUNK_BYTES;
        Ok(ModelResourceInfo {
            mime_type: descriptor.reference.policy.mime_type.to_owned(),
            size_bytes,
            version,
            chunk_size,
            chunk_count: size_bytes.div_ceil(chunk_size as u64),
        })
    }

    /// Reads one bounded range from a model-scoped external resource. Both the
    /// model and resource descriptors are revalidated before returning bytes,
    /// so stale manifests and same-name replacements fail closed.
    pub fn model_resource_chunk(
        &self,
        request: ModelResourceChunkRequest<'_>,
    ) -> Result<MediaChunk, WorkspaceError> {
        if request.length == 0
            || request.length > MAX_MEDIA_CHUNK_BYTES
            || request.offset >= request.expected_size_bytes
        {
            return Err(WorkspaceError::InvalidPath);
        }
        request
            .offset
            .checked_add(request.length as u64)
            .ok_or(WorkspaceError::InvalidPath)?;

        let (mut model, policy, model_size, model_version) =
            self.open_media(request.model_relative_path)?;
        if policy.kind != MediaKind::Model {
            return Err(WorkspaceError::NotEditable);
        }
        if model_version != request.expected_model_version {
            return Err(WorkspaceError::Conflict);
        }
        let model_path = validate_relative(request.model_relative_path)?;
        let (cache_key, resources) = self.model_resource_snapshot(
            &model_path,
            &mut model,
            policy.signature,
            model_size,
            &model_version,
        )?;
        let descriptor = resources
            .iter()
            .find(|descriptor| descriptor.reference.uri == request.resource_uri)
            .ok_or(WorkspaceError::InvalidPath)?;
        let (mut resource, size_bytes, version) =
            match self.open_model_resource(&descriptor.reference) {
                Ok(opened) => opened,
                Err(error) => {
                    invalidate_cached_model_resources(&cache_key);
                    return Err(error);
                }
            };
        if size_bytes != descriptor.size_bytes
            || version != descriptor.version
            || size_bytes != request.expected_size_bytes
            || version != request.expected_version
        {
            invalidate_cached_model_resources(&cache_key);
            return Err(WorkspaceError::Conflict);
        }

        let remaining = request.expected_size_bytes.saturating_sub(request.offset);
        let read_length = remaining.min(request.length as u64) as usize;
        resource
            .seek(SeekFrom::Start(request.offset))
            .map_err(|error| map_io(&error))?;
        let mut data = Vec::with_capacity(read_length);
        Read::by_ref(&mut resource)
            .take(read_length as u64)
            .read_to_end(&mut data)
            .map_err(|error| map_io(&error))?;
        let final_metadata = resource.metadata().map_err(|error| map_io(&error))?;
        let final_version = media_version(&resource, &final_metadata)?;
        if final_metadata.len() != request.expected_size_bytes
            || final_version != request.expected_version
            || data.len() != read_length
        {
            return Err(WorkspaceError::Conflict);
        }
        drop(resource);
        self.ensure_model_version(&model, model_size, request.expected_model_version)?;
        drop(model);
        self.ensure_root_valid()?;

        let end = request
            .offset
            .checked_add(data.len() as u64)
            .ok_or(WorkspaceError::InvalidPath)?;
        Ok(MediaChunk {
            offset: request.offset,
            data,
            eof: end == request.expected_size_bytes,
        })
    }

    fn model_resource_snapshot(
        &self,
        model_relative_path: &Path,
        model: &mut std::fs::File,
        signature: MediaSignature,
        model_size_bytes: u64,
        model_version: &str,
    ) -> Result<(ModelResourceCacheKey, Arc<Vec<ModelResourceDescriptor>>), WorkspaceError> {
        let key = ModelResourceCacheKey {
            root: self.root_path().to_path_buf(),
            model_relative_path: model_relative_path.to_path_buf(),
            signature,
            model_size_bytes,
            model_version: model_version.to_owned(),
        };
        if let Some(resources) = cached_model_resources(&key) {
            return Ok((key, resources));
        }

        let references =
            model_resource_references(model, signature, model_size_bytes, model_relative_path)?;
        let resources = Arc::new(self.validate_model_resource_set(&references, model_size_bytes)?);
        self.ensure_model_version(model, model_size_bytes, model_version)?;
        self.ensure_root_valid()?;
        cache_model_resources(key.clone(), resources.clone());
        Ok((key, resources))
    }

    fn validate_model_resource_set(
        &self,
        references: &[ModelResourceReference],
        model_size: u64,
    ) -> Result<Vec<ModelResourceDescriptor>, WorkspaceError> {
        if references.len() > MAX_MODEL_EXTERNAL_RESOURCES {
            return Err(WorkspaceError::ContentTooLarge);
        }
        let mut total = model_size;
        let mut opened = HashMap::<PathBuf, (u64, String)>::new();
        let mut descriptors = Vec::with_capacity(references.len());
        for reference in references {
            let (size_bytes, version) =
                if let Some(descriptor) = opened.get(&reference.relative_path) {
                    descriptor.clone()
                } else {
                    let (resource, size_bytes, version) = self.open_model_resource(reference)?;
                    drop(resource);
                    total = total
                        .checked_add(size_bytes)
                        .ok_or(WorkspaceError::ContentTooLarge)?;
                    if total > MAX_MODEL_RESOURCE_AGGREGATE_BYTES {
                        return Err(WorkspaceError::ContentTooLarge);
                    }
                    opened.insert(
                        reference.relative_path.clone(),
                        (size_bytes, version.clone()),
                    );
                    (size_bytes, version)
                };
            if reference
                .declared_size_bytes
                .is_some_and(|declared| declared != size_bytes)
            {
                return Err(WorkspaceError::NotEditable);
            }
            descriptors.push(ModelResourceDescriptor {
                reference: reference.clone(),
                size_bytes,
                version,
            });
        }
        self.ensure_root_valid()?;
        Ok(descriptors)
    }

    fn open_model_resource(
        &self,
        reference: &ModelResourceReference,
    ) -> Result<(std::fs::File, u64, String), WorkspaceError> {
        self.ensure_root_valid()?;
        let name = reference
            .relative_path
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
        let parent = reference
            .relative_path
            .parent()
            .unwrap_or_else(|| Path::new(""));
        let directory = DirectoryCapability::open(self.root_handle(), parent)?;
        let mut file = open_regular_file_nofollow(directory.handle()?, Path::new(name))?;
        let initial_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let initial_size = initial_metadata.len();
        if initial_size > reference.policy.maximum_size {
            return Err(WorkspaceError::ContentTooLarge);
        }
        let initial_version = media_version(&file, &initial_metadata)?;
        let mut signature = Vec::with_capacity(MEDIA_SIGNATURE_BYTES);
        Read::by_ref(&mut file)
            .take(MEDIA_SIGNATURE_BYTES as u64)
            .read_to_end(&mut signature)
            .map_err(|error| map_io(&error))?;
        let final_metadata = file.metadata().map_err(|error| map_io(&error))?;
        if final_metadata.len() != initial_size
            || media_version(&file, &final_metadata)? != initial_version
        {
            return Err(WorkspaceError::Conflict);
        }
        if !matches_model_resource_signature(reference.policy.signature, &signature) {
            return Err(WorkspaceError::NotEditable);
        }
        self.ensure_root_valid()?;
        Ok((file, initial_size, initial_version))
    }

    fn ensure_model_version(
        &self,
        model: &std::fs::File,
        expected_size: u64,
        expected_version: &str,
    ) -> Result<(), WorkspaceError> {
        let metadata = model.metadata().map_err(|error| map_io(&error))?;
        if metadata.len() != expected_size || media_version(model, &metadata)? != expected_version {
            return Err(WorkspaceError::Conflict);
        }
        Ok(())
    }

    fn native_powerpoint_bundle(
        &self,
        relative_path: &Path,
        source: &mut std::fs::File,
        source_size: u64,
        source_version: &str,
    ) -> NativePowerPointPreview {
        let key = NativePowerPointCacheKey {
            root: self.root_path().to_path_buf(),
            relative_path: relative_path.to_path_buf(),
            source_version: source_version.to_owned(),
        };
        if let Some(bundle) = cached_native_powerpoint_bundle(&key) {
            return NativePowerPointPreview::Rendered(bundle);
        }

        let _render_guard = native_powerpoint_render_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(bundle) = cached_native_powerpoint_bundle(&key) {
            return NativePowerPointPreview::Rendered(bundle);
        }

        match render_native_powerpoint_bundle(source, source_size, source_version) {
            Ok(bundle) => {
                let bundle = NativePowerPointBundle {
                    version: native_powerpoint_version(source_version, &bundle),
                    bytes: Arc::new(bundle),
                };
                cache_native_powerpoint_bundle(key, bundle.clone());
                NativePowerPointPreview::Rendered(bundle)
            }
            Err(NativePowerPointRenderError::PowerpointUnavailable) => {
                tracing::debug!("Microsoft PowerPoint is unavailable; using the embedded renderer");
                NativePowerPointPreview::PowerpointUnavailable
            }
            Err(NativePowerPointRenderError::Failed(error)) => {
                tracing::debug!(%error, "native PowerPoint preview is unavailable; using the embedded renderer");
                NativePowerPointPreview::Embedded
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
            MediaSignature::GltfJson | MediaSignature::Glb
        ) {
            self.model_resource_snapshot(
                &clean,
                &mut file,
                policy.signature,
                initial_size,
                &initial_version,
            )?;
            let validated_metadata = file.metadata().map_err(|error| map_io(&error))?;
            if validated_metadata.len() != initial_size
                || media_version(&file, &validated_metadata)? != initial_version
            {
                return Err(WorkspaceError::Conflict);
            }
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
    let notebook = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Notebook,
        mime_type,
        maximum_size: MAX_NOTEBOOK_PREVIEW_BYTES,
        signature,
    };
    let office = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Office,
        mime_type,
        maximum_size: MAX_OFFICE_PREVIEW_BYTES,
        signature,
    };
    let model = |mime_type, signature| MediaPolicy {
        kind: MediaKind::Model,
        mime_type,
        maximum_size: MAX_MODEL_PREVIEW_BYTES,
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
        "ipynb" => Some(notebook(
            "application/x-ipynb+json",
            MediaSignature::NotebookJson,
        )),
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
        "gltf" => Some(model("model/gltf+json", MediaSignature::GltfJson)),
        "glb" => Some(model("model/gltf-binary", MediaSignature::Glb)),
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
        MediaSignature::NotebookJson => matches_notebook_json_signature(bytes),
        MediaSignature::Ppt => bytes.starts_with(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        MediaSignature::Docx | MediaSignature::Xlsx | MediaSignature::Pptx => {
            bytes.starts_with(b"PK\x03\x04")
        }
        MediaSignature::GltfJson => matches_json_object_signature(bytes),
        MediaSignature::Glb => {
            bytes.len() >= 12
                && bytes.starts_with(b"glTF")
                && u32::from_le_bytes(bytes[4..8].try_into().unwrap_or_default()) == 2
        }
    }
}

fn matches_json_object_signature(bytes: &[u8]) -> bool {
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    bytes
        .iter()
        .copied()
        .find(|byte| !matches!(byte, b' ' | b'\t' | b'\r' | b'\n'))
        == Some(b'{')
}

fn matches_notebook_json_signature(bytes: &[u8]) -> bool {
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    bytes
        .iter()
        .copied()
        .find(|byte| !matches!(byte, b' ' | b'\t' | b'\r' | b'\n'))
        == Some(b'{')
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

    fn glb(json: &str, binary: &[u8]) -> Vec<u8> {
        let mut json = json.as_bytes().to_vec();
        while json.len() % 4 != 0 {
            json.push(b' ');
        }
        let binary_length = binary.len().div_ceil(4) * 4;
        let total_length = 12
            + 8
            + json.len()
            + if binary.is_empty() {
                0
            } else {
                8 + binary_length
            };
        let mut bytes = Vec::with_capacity(total_length);
        bytes.extend_from_slice(b"glTF");
        bytes.extend_from_slice(&2_u32.to_le_bytes());
        bytes.extend_from_slice(&(total_length as u32).to_le_bytes());
        bytes.extend_from_slice(&(json.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&0x4e4f_534a_u32.to_le_bytes());
        bytes.extend_from_slice(&json);
        if !binary.is_empty() {
            bytes.extend_from_slice(&(binary_length as u32).to_le_bytes());
            bytes.extend_from_slice(&0x004e_4942_u32.to_le_bytes());
            bytes.extend_from_slice(binary);
            bytes.resize(total_length, 0);
        }
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
    fn native_powerpoint_export_script_protects_borrowed_application() {
        let unavailable_exit = format!("exit {NATIVE_POWERPOINT_COM_UNAVAILABLE_EXIT_CODE}");
        assert!(
            NATIVE_POWERPOINT_EXPORT_SCRIPT
                .contains("GetTypeFromProgID('PowerPoint.Application', $false)")
        );
        assert!(NATIVE_POWERPOINT_EXPORT_SCRIPT.contains(&unavailable_exit));
        assert_eq!(
            NATIVE_POWERPOINT_EXPORT_SCRIPT
                .matches(&unavailable_exit)
                .count(),
            1
        );
        assert!(
            NATIVE_POWERPOINT_EXPORT_SCRIPT
                .find(&unavailable_exit)
                .zip(NATIVE_POWERPOINT_EXPORT_SCRIPT.find("$application = $null"))
                .is_some_and(|(exit, application)| exit < application)
        );
        assert!(NATIVE_POWERPOINT_EXPORT_SCRIPT.contains(
            "[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')"
        ));
        assert!(
            NATIVE_POWERPOINT_EXPORT_SCRIPT
                .contains("$application = [Activator]::CreateInstance($powerPointType)")
        );
        assert!(NATIVE_POWERPOINT_EXPORT_SCRIPT.contains("$isAutomationProcess"));
        assert!(NATIVE_POWERPOINT_EXPORT_SCRIPT.contains("if ($ownsApplication)"));
        assert!(!NATIVE_POWERPOINT_EXPORT_SCRIPT.contains("PowerPoint is already running"));
    }

    #[cfg(windows)]
    #[test]
    fn native_powerpoint_uses_every_verified_powershell_architecture() {
        let powershells = trusted_windows_powershells().expect("trusted Windows PowerShell");
        assert!(!powershells.is_empty());
        assert!(powershells.iter().all(|powershell| {
            powershell.is_file()
                && powershell
                    .file_name()
                    .is_some_and(|name| name.eq_ignore_ascii_case("powershell.exe"))
        }));

        let system_root = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows root"));
        if let Ok(wow64) =
            dunce::canonicalize(system_root.join("SysWOW64/WindowsPowerShell/v1.0/powershell.exe"))
        {
            assert!(powershells.contains(&wow64));
        }
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires Microsoft PowerPoint and CODE_CODEX_NATIVE_POWERPOINT_FIXTURE"]
    fn native_powerpoint_external_fixture_renders_with_each_powershell_architecture() {
        let source = std::env::var_os("CODE_CODEX_NATIVE_POWERPOINT_FIXTURE")
            .map(PathBuf::from)
            .expect("CODE_CODEX_NATIVE_POWERPOINT_FIXTURE");

        for powershell in trusted_windows_powershells().expect("trusted Windows PowerShell") {
            let directory = TempDir::new().expect("temp dir");
            let output = directory.path().join("slides");
            fs::create_dir(&output).expect("slide output");
            let pid_state = directory.path().join("powerpoint.pid");
            match run_native_powerpoint_export_with_shell(&powershell, &source, &output, &pid_state)
            {
                Ok(()) => {}
                Err(NativePowerPointExportAttemptError::ComUnavailable) => {
                    panic!(
                        "PowerPoint COM is unavailable through {}",
                        powershell.display()
                    )
                }
                Err(NativePowerPointExportAttemptError::Failed(error)) => {
                    panic!(
                        "PowerPoint export failed through {}: {error}",
                        powershell.display()
                    )
                }
            }
            let bundle = bundle_native_powerpoint_slides(&output).expect("native slide bundle");
            assert!(!bundle.is_empty());
            std::thread::sleep(Duration::from_secs(2));
        }
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
            "DATA.CSV",
            "ARCHITECTURE.DRAWIO",
            "FLOW.PLANTUML",
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
        assert!(serialized.get("previewNotice").is_none());

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
    fn media_info_serializes_the_powerpoint_full_fidelity_notice() {
        let info = MediaInfo {
            kind: MediaKind::Office,
            mime_type: "application/vnd.ms-powerpoint".to_owned(),
            size_bytes: 1,
            version: "0".repeat(64),
            chunk_size: 1,
            chunk_count: 1,
            preview_notice: Some(MediaPreviewNotice::PowerpointRequiredForFullFidelity),
        };

        let serialized = serde_json::to_value(info).expect("serialize PowerPoint notice");
        assert_eq!(
            serialized["previewNotice"],
            "powerpoint-required-for-full-fidelity"
        );
    }

    #[test]
    fn gltf_and_glb_media_are_validated_and_external_resources_are_model_scoped() {
        let (directory, workspace) = fixture();
        fs::create_dir(directory.path().join("models")).expect("models");
        fs::create_dir(directory.path().join("assets")).expect("assets");
        fs::create_dir(directory.path().join("textures")).expect("textures");
        let buffer = b"bounded model buffer";
        let texture = minimal_png(2, 2);
        fs::write(directory.path().join("assets/model data.bin"), buffer).expect("buffer");
        fs::write(directory.path().join("textures/albedo.png"), &texture).expect("texture");
        let manifest = serde_json::json!({
            "asset": { "version": "2.0" },
            "buffers": [{ "uri": "../assets/model%20data.bin", "byteLength": buffer.len() }],
            "images": [{ "uri": "../textures/albedo.png" }],
        });
        fs::write(
            directory.path().join("models/scene.gltf"),
            serde_json::to_vec(&manifest).expect("model JSON"),
        )
        .expect("gltf");

        let model = workspace
            .media_info("models/scene.gltf")
            .expect("model info");
        assert_eq!(model.kind, MediaKind::Model);
        assert_eq!(model.mime_type, "model/gltf+json");
        assert_eq!(
            serde_json::to_value(&model).expect("serialize model")["kind"],
            "model"
        );

        let resource = workspace
            .model_resource_info(
                "models/scene.gltf",
                "../assets/model%20data.bin",
                &model.version,
            )
            .expect("buffer info");
        assert_eq!(resource.mime_type, "application/octet-stream");
        assert_eq!(resource.size_bytes, buffer.len() as u64);
        let serialized = serde_json::to_value(&resource).expect("serialize resource");
        assert_eq!(serialized["mimeType"], "application/octet-stream");
        assert_eq!(serialized["chunkSize"], MEDIA_CHUNK_BYTES);

        let chunk = workspace
            .model_resource_chunk(ModelResourceChunkRequest {
                model_relative_path: "models/scene.gltf",
                resource_uri: "../assets/model%20data.bin",
                expected_model_version: &model.version,
                offset: 0,
                length: MEDIA_CHUNK_BYTES,
                expected_size_bytes: resource.size_bytes,
                expected_version: &resource.version,
            })
            .expect("buffer chunk");
        assert_eq!(chunk.data, buffer);
        assert!(chunk.eof);

        let image = workspace
            .model_resource_info(
                "models/scene.gltf",
                "../textures/albedo.png",
                &model.version,
            )
            .expect("texture info");
        assert_eq!(image.mime_type, "image/png");
        assert_eq!(image.size_bytes, texture.len() as u64);

        assert_eq!(
            workspace
                .media_info("assets/model data.bin")
                .expect_err("bin is not globally allowlisted")
                .code(),
            crate::ErrorCode::NotEditable
        );
        assert_eq!(
            workspace
                .model_resource_info(
                    "models/scene.gltf",
                    "../assets/unreferenced.bin",
                    &model.version,
                )
                .expect_err("unreferenced resource")
                .code(),
            crate::ErrorCode::InvalidPath
        );

        let binary_model = glb(r#"{"asset":{"version":"2.0"}}"#, b"embedded");
        fs::write(directory.path().join("embedded.glb"), &binary_model).expect("glb");
        let glb_info = workspace.media_info("embedded.glb").expect("GLB info");
        assert_eq!(glb_info.kind, MediaKind::Model);
        assert_eq!(glb_info.mime_type, "model/gltf-binary");
        assert_eq!(glb_info.size_bytes, binary_model.len() as u64);

        for (name, mut invalid) in [
            ("bad-magic.glb", binary_model.clone()),
            ("bad-version.glb", binary_model.clone()),
            ("bad-length.glb", binary_model.clone()),
        ] {
            match name {
                "bad-magic.glb" => invalid[0] = b'X',
                "bad-version.glb" => invalid[4..8].copy_from_slice(&1_u32.to_le_bytes()),
                "bad-length.glb" => invalid[8..12].copy_from_slice(&12_u32.to_le_bytes()),
                _ => unreachable!(),
            }
            fs::write(directory.path().join(name), invalid).expect("invalid GLB");
            assert_eq!(
                workspace
                    .media_info(name)
                    .expect_err("invalid GLB header")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{name}"
            );
        }
    }

    #[test]
    fn model_resource_uris_reject_network_absolute_escape_and_unsafe_types() {
        let (directory, workspace) = fixture();
        fs::create_dir(directory.path().join("models")).expect("models");
        for (name, uri, expected) in [
            (
                "network.gltf",
                "https://example.com/model.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "network-path.gltf",
                "//server/share/model.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "absolute.gltf",
                "/outside/model.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "escape.gltf",
                "../../outside.bin",
                crate::ErrorCode::OutsideWorkspace,
            ),
            (
                "encoded-escape.gltf",
                "%2e%2e/%2e%2e/outside.bin",
                crate::ErrorCode::OutsideWorkspace,
            ),
            (
                "encoded-slash.gltf",
                "nested%2foutside.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "encoded-backslash.gltf",
                "nested%5coutside.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "encoded-nul.gltf",
                "nested%00outside.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "encoded-scheme.gltf",
                "https%3a/example.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "malformed-percent.gltf",
                "nested%2/outside.bin",
                crate::ErrorCode::InvalidPath,
            ),
            (
                "unsupported.gltf",
                "model.exe",
                crate::ErrorCode::NotEditable,
            ),
        ] {
            let manifest = serde_json::json!({
                "asset": { "version": "2.0" },
                "buffers": [{ "uri": uri, "byteLength": 1 }],
            });
            fs::write(
                directory.path().join("models").join(name),
                serde_json::to_vec(&manifest).expect("manifest"),
            )
            .expect("model");
            assert_eq!(
                workspace
                    .media_info(&format!("models/{name}"))
                    .expect_err("unsafe model URI")
                    .code(),
                expected,
                "{uri}"
            );
        }
    }

    #[test]
    fn model_external_buffers_bind_declared_lengths_and_accept_gltf_buffer_extensions() {
        let (directory, workspace) = fixture();
        for extension in ["bin", "glbin", "glbuf"] {
            let resource_name = format!("mesh.{extension}");
            let model_name = format!("mesh-{extension}.gltf");
            fs::write(directory.path().join(&resource_name), b"mesh").expect("model buffer");
            let manifest = serde_json::json!({
                "asset": { "version": "2.0" },
                "buffers": [{ "uri": resource_name, "byteLength": 4 }],
            });
            fs::write(
                directory.path().join(&model_name),
                serde_json::to_vec(&manifest).expect("manifest"),
            )
            .expect("model");
            let model = workspace.media_info(&model_name).expect("model info");
            let resource = workspace
                .model_resource_info(&model_name, &resource_name, &model.version)
                .expect("buffer info");
            assert_eq!(
                resource.mime_type, "application/octet-stream",
                "{extension}"
            );
            assert_eq!(resource.size_bytes, 4, "{extension}");
        }

        fs::write(directory.path().join("wrong-size.bin"), b"four").expect("buffer");
        for (name, declared) in [("short-declaration.gltf", 3), ("long-declaration.gltf", 5)] {
            let manifest = serde_json::json!({
                "asset": { "version": "2.0" },
                "buffers": [{ "uri": "wrong-size.bin", "byteLength": declared }],
            });
            fs::write(
                directory.path().join(name),
                serde_json::to_vec(&manifest).expect("manifest"),
            )
            .expect("model");
            assert_eq!(
                workspace
                    .media_info(name)
                    .expect_err("buffer length mismatch")
                    .code(),
                crate::ErrorCode::NotEditable,
                "{name}"
            );
        }
    }

    #[test]
    fn model_resource_cache_revalidates_only_the_requested_resource_and_is_bounded() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("first-cache.bin"), b"first").expect("first buffer");
        fs::write(directory.path().join("second-cache.bin"), b"second").expect("second buffer");
        let manifest = serde_json::json!({
            "asset": { "version": "2.0" },
            "buffers": [
                { "uri": "first-cache.bin", "byteLength": 5 },
                { "uri": "second-cache.bin", "byteLength": 6 },
            ],
        });
        fs::write(
            directory.path().join("cached.gltf"),
            serde_json::to_vec(&manifest).expect("manifest"),
        )
        .expect("model");
        let model = workspace.media_info("cached.gltf").expect("cached model");

        fs::remove_file(directory.path().join("second-cache.bin")).expect("remove unrequested");
        let first = workspace
            .model_resource_info("cached.gltf", "first-cache.bin", &model.version)
            .expect("cached first resource");
        let chunk = workspace
            .model_resource_chunk(ModelResourceChunkRequest {
                model_relative_path: "cached.gltf",
                resource_uri: "first-cache.bin",
                expected_model_version: &model.version,
                offset: 0,
                length: MEDIA_CHUNK_BYTES,
                expected_size_bytes: first.size_bytes,
                expected_version: &first.version,
            })
            .expect("first resource chunk");
        assert_eq!(chunk.data, b"first");
        assert!(chunk.eof);
        assert_eq!(
            workspace
                .model_resource_info("cached.gltf", "second-cache.bin", &model.version)
                .expect_err("missing requested resource")
                .code(),
            crate::ErrorCode::NotFound
        );

        for index in 0..(MAX_MODEL_RESOURCE_CACHE_ENTRIES + 2) {
            let name = format!("cache-bound-{index}.gltf");
            fs::write(
                directory.path().join(&name),
                br#"{"asset":{"version":"2.0"}}"#,
            )
            .expect("cache model");
            workspace.media_info(&name).expect("cache model info");
        }
        assert!(
            model_resource_cache()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .len()
                <= MAX_MODEL_RESOURCE_CACHE_ENTRIES
        );
    }

    #[test]
    fn model_resource_reads_bind_model_and_resource_versions_and_total_size() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("first.bin"), b"first").expect("first buffer");
        let manifest = serde_json::json!({
            "asset": { "version": "2.0" },
            "buffers": [{ "uri": "first.bin", "byteLength": 5 }],
        });
        let model_path = directory.path().join("scene.gltf");
        fs::write(
            &model_path,
            serde_json::to_vec(&manifest).expect("manifest"),
        )
        .expect("model");
        let model = workspace.media_info("scene.gltf").expect("model");
        let resource = workspace
            .model_resource_info("scene.gltf", "first.bin", &model.version)
            .expect("resource");

        fs::write(directory.path().join("first.bin"), b"other").expect("changed resource");
        assert_eq!(
            workspace
                .model_resource_chunk(ModelResourceChunkRequest {
                    model_relative_path: "scene.gltf",
                    resource_uri: "first.bin",
                    expected_model_version: &model.version,
                    offset: 0,
                    length: 5,
                    expected_size_bytes: resource.size_bytes,
                    expected_version: &resource.version,
                })
                .expect_err("stale resource")
                .code(),
            crate::ErrorCode::Conflict
        );

        let updated_resource = workspace
            .model_resource_info("scene.gltf", "first.bin", &model.version)
            .expect("updated resource");
        let changed_manifest = serde_json::json!({
            "asset": { "version": "2.0" },
            "buffers": [{ "uri": "first.bin", "byteLength": 5 }],
            "extras": { "revision": 2 },
        });
        fs::write(
            &model_path,
            serde_json::to_vec(&changed_manifest).expect("changed manifest"),
        )
        .expect("change model");
        assert_eq!(
            workspace
                .model_resource_chunk(ModelResourceChunkRequest {
                    model_relative_path: "scene.gltf",
                    resource_uri: "first.bin",
                    expected_model_version: &model.version,
                    offset: 0,
                    length: 5,
                    expected_size_bytes: updated_resource.size_bytes,
                    expected_version: &updated_resource.version,
                })
                .expect_err("stale model")
                .code(),
            crate::ErrorCode::Conflict
        );

        for name in ["large-a.bin", "large-b.bin"] {
            let mut file = fs::File::create(directory.path().join(name)).expect("large resource");
            file.write_all(&[1]).expect("resource signature");
            file.set_len(MAX_MODEL_RESOURCE_BYTES)
                .expect("sparse resource");
        }
        let oversized_manifest = serde_json::json!({
            "asset": { "version": "2.0" },
            "buffers": [
                { "uri": "large-a.bin", "byteLength": MAX_MODEL_RESOURCE_BYTES },
                { "uri": "large-b.bin", "byteLength": MAX_MODEL_RESOURCE_BYTES },
            ],
        });
        fs::write(
            directory.path().join("oversized.gltf"),
            serde_json::to_vec(&oversized_manifest).expect("oversized manifest"),
        )
        .expect("oversized model");
        assert_eq!(
            workspace
                .media_info("oversized.gltf")
                .expect_err("aggregate limit")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );
    }

    #[test]
    fn notebook_media_transport_validates_a_bounded_json_prefix_and_serializes_contract() {
        let (directory, workspace) = fixture();
        let plain = br#"{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}"#;
        let with_bom =
            b"\xef\xbb\xbf \t\r\n{\"cells\":[],\"metadata\":{},\"nbformat\":4,\"nbformat_minor\":5}";

        for (name, contents) in [
            ("plain.ipynb", plain.as_slice()),
            ("WITH-BOM.IPYNB", with_bom.as_slice()),
        ] {
            fs::write(directory.path().join(name), contents).expect("notebook fixture");
            let info = workspace.media_info(name).expect("notebook media info");
            assert_eq!(info.kind, MediaKind::Notebook, "{name}");
            assert_eq!(info.mime_type, "application/x-ipynb+json", "{name}");
            assert_eq!(info.size_bytes, contents.len() as u64, "{name}");
            assert_eq!(info.chunk_size, MEDIA_CHUNK_BYTES, "{name}");
            assert_eq!(info.chunk_count, 1, "{name}");

            let serialized = serde_json::to_value(&info).expect("serialize notebook info");
            assert_eq!(serialized["kind"], "notebook", "{name}");
            assert_eq!(serialized["mimeType"], "application/x-ipynb+json", "{name}");

            let chunk = workspace
                .media_chunk(name, 0, info.chunk_size, info.size_bytes, &info.version)
                .expect("notebook chunk");
            assert_eq!(chunk.offset, 0, "{name}");
            assert_eq!(chunk.data, contents, "{name}");
            assert!(chunk.eof, "{name}");
        }

        fs::write(directory.path().join("invalid.ipynb"), b"[1, 2, 3]")
            .expect("invalid notebook prefix");
        assert_eq!(
            workspace
                .media_info("invalid.ipynb")
                .expect_err("invalid notebook prefix")
                .code(),
            crate::ErrorCode::NotEditable
        );

        let mut outside_prefix = vec![b' '; MEDIA_SIGNATURE_BYTES];
        outside_prefix.extend_from_slice(b"{}");
        fs::write(
            directory.path().join("outside-prefix.ipynb"),
            outside_prefix,
        )
        .expect("notebook outside signature prefix");
        assert_eq!(
            workspace
                .media_info("outside-prefix.ipynb")
                .expect_err("object outside bounded signature prefix")
                .code(),
            crate::ErrorCode::NotEditable
        );

        fs::write(directory.path().join(".env.ipynb"), b"{}").expect("sensitive notebook");
        assert_eq!(
            workspace
                .media_info(".env.ipynb")
                .expect_err("sensitive notebook")
                .code(),
            crate::ErrorCode::AccessDenied
        );

        let oversized = directory.path().join("oversized.ipynb");
        let mut file = fs::File::create(&oversized).expect("large notebook");
        file.write_all(b"{}").expect("notebook signature");
        file.set_len(MAX_NOTEBOOK_PREVIEW_BYTES + 1)
            .expect("sparse large notebook");
        drop(file);
        assert_eq!(
            workspace
                .media_info("oversized.ipynb")
                .expect_err("large notebook")
                .code(),
            crate::ErrorCode::ContentTooLarge
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
                MediaKind::Notebook => "notebook",
                MediaKind::Office => "office",
                MediaKind::Model => "model",
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
        fs::write(outside.path().join("outside.bin"), b"outside model buffer")
            .expect("outside model buffer");
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
        ) || !symlink_file(
            &outside.path().join("outside.bin"),
            &directory.path().join("linked.bin"),
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
        fs::write(
            directory.path().join("linked-resource.gltf"),
            br#"{"asset":{"version":"2.0"},"buffers":[{"uri":"linked.bin","byteLength":20}]}"#,
        )
        .expect("model with linked resource");
        assert_eq!(
            workspace
                .media_info("linked-resource.gltf")
                .expect_err("model resource reparse")
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

#[cfg(test)]
#[allow(unused_imports)]
mod test_imports {
    pub(super) use std::collections::{HashMap, HashSet, VecDeque};

    pub(super) use std::io::{Read, Seek, SeekFrom, Write};

    pub(super) use std::path::{Path, PathBuf};

    pub(super) use std::sync::{Arc, Mutex, OnceLock};

    pub(super) use std::time::{Duration, Instant};

    pub(super) use serde::Serialize;

    pub(super) use sha2::{Digest, Sha256};

    pub(super) use zip::{CompressionMethod, ZipArchive};

    pub(super) use crate::error::{WorkspaceError, map_io};

    pub(super) use crate::listing::Workspace;

    pub(super) use crate::path_guard::{
        DirectoryCapability, open_regular_file_for_update_nofollow, open_regular_file_nofollow,
        validate_relative,
    };
}
#[cfg(test)]
#[allow(unused_imports)]
use test_imports::*;

// Domain modules keep the original public and wire contracts.
#[path = "preview/model_resources.rs"]
mod model_resources;
use model_resources::{
    ModelResourceCacheEntry, ModelResourceCacheKey, ModelResourceDescriptor, ModelResourceKind,
    ModelResourcePolicy, ModelResourceReference, ModelResourceSignature, cache_model_resources,
    cached_model_resources, collect_model_resource_references, invalidate_cached_model_resources,
    is_allowed_embedded_model_uri, matches_model_resource_signature, model_resource_cache,
    model_resource_policy, model_resource_references, percent_decode_model_uri_component,
    read_glb_json, read_model_exact, read_model_json, resolve_model_resource_uri,
};
pub use model_resources::{ModelResourceChunkRequest, ModelResourceInfo};
#[path = "preview/native_powerpoint.rs"]
mod native_powerpoint;

#[cfg(any(windows, not(windows)))]
use native_powerpoint::run_native_powerpoint_export;
#[cfg(windows)]
use native_powerpoint::{
    NATIVE_POWERPOINT_CLEANUP_SCRIPT, NATIVE_POWERPOINT_EXPORT_SCRIPT,
    NativePowerPointExportAttemptError, cleanup_owned_powerpoint,
    run_native_powerpoint_export_with_shell, trusted_windows_powershell,
    trusted_windows_powershells,
};
use native_powerpoint::{
    NativePowerPointBundle, NativePowerPointCacheEntry, NativePowerPointCacheKey,
    NativePowerPointPreview, NativePowerPointRenderError, bundle_native_powerpoint_slides,
    cache_native_powerpoint_bundle, cached_native_powerpoint_bundle, native_powerpoint_cache,
    native_powerpoint_render_lock, native_powerpoint_version, png_dimensions,
    render_native_powerpoint_bundle,
};
#[path = "preview/text_policy.rs"]
mod text_policy;

use text_policy::{
    classify_line_ending, content_version, is_known_text_name, is_sensitive_name,
    is_text_extension, preview_policy,
};
#[path = "preview/office_archive.rs"]
mod office_archive;

use office_archive::{
    OfficePackageIdentity, OfficeZipDirectory, OfficeZipEntry, contains_ascii_case_insensitive,
    content_types_has_override, find_xml_declaration, forbidden_office_part,
    inspect_office_zip_directory, is_office_xml_part, le_u16, le_u32, map_office_zip_error,
    office_package_identity, override_tag_matches, read_office_exact, skip_ascii_whitespace,
    supported_office_zip_flags, valid_office_entry_name, valid_office_xml, validate_legacy_ppt,
    validate_office_decompressed_entries, validate_office_extra_fields,
    validate_office_local_headers, validate_office_package, xml_declaration_allows_utf8,
};
