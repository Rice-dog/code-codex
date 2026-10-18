use std::collections::VecDeque;
use std::io::Seek;
use std::io::{Read, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;

use crate::error::{WorkspaceError, map_io};

use super::{
    MAX_IMAGE_PREVIEW_BYTES, MAX_MODEL_EXTERNAL_RESOURCES, MAX_MODEL_JSON_BYTES,
    MAX_MODEL_RESOURCE_BYTES, MAX_MODEL_RESOURCE_CACHE_ENTRIES, MAX_MODEL_RESOURCE_URI_BYTES,
    MediaSignature, ftyp_has_brand,
};
use crate::path_guard::validate_relative;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelResourceInfo {
    pub mime_type: String,
    pub size_bytes: u64,
    pub version: String,
    pub chunk_size: usize,
    pub chunk_count: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelResourceChunkRequest<'a> {
    pub model_relative_path: &'a str,
    pub resource_uri: &'a str,
    pub expected_model_version: &'a str,
    pub offset: u64,
    pub length: usize,
    pub expected_size_bytes: u64,
    pub expected_version: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ModelResourceKind {
    Buffer,
    Image,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ModelResourceSignature {
    Any,
    Png,
    Jpeg,
    Webp,
    Avif,
    Ktx2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct ModelResourcePolicy {
    pub(super) mime_type: &'static str,
    pub(super) maximum_size: u64,
    pub(super) signature: ModelResourceSignature,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ModelResourceReference {
    pub(super) uri: String,
    pub(super) relative_path: PathBuf,
    pub(super) policy: ModelResourcePolicy,
    pub(super) declared_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ModelResourceDescriptor {
    pub(super) reference: ModelResourceReference,
    pub(super) size_bytes: u64,
    pub(super) version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ModelResourceCacheKey {
    pub(super) root: PathBuf,
    pub(super) model_relative_path: PathBuf,
    pub(super) signature: MediaSignature,
    pub(super) model_size_bytes: u64,
    pub(super) model_version: String,
}

#[derive(Debug, Clone)]
pub(super) struct ModelResourceCacheEntry {
    pub(super) key: ModelResourceCacheKey,
    pub(super) resources: Arc<Vec<ModelResourceDescriptor>>,
}

pub(super) fn model_resource_cache() -> &'static Mutex<VecDeque<ModelResourceCacheEntry>> {
    static CACHE: OnceLock<Mutex<VecDeque<ModelResourceCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(VecDeque::new()))
}

pub(super) fn cached_model_resources(
    key: &ModelResourceCacheKey,
) -> Option<Arc<Vec<ModelResourceDescriptor>>> {
    let mut cache = model_resource_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let index = cache.iter().position(|entry| entry.key == *key)?;
    let entry = cache.remove(index)?;
    let resources = entry.resources.clone();
    cache.push_back(entry);
    Some(resources)
}

pub(super) fn cache_model_resources(
    key: ModelResourceCacheKey,
    resources: Arc<Vec<ModelResourceDescriptor>>,
) {
    let mut cache = model_resource_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache.retain(|entry| entry.key != key);
    cache.push_back(ModelResourceCacheEntry { key, resources });
    while cache.len() > MAX_MODEL_RESOURCE_CACHE_ENTRIES {
        cache.pop_front();
    }
}

pub(super) fn invalidate_cached_model_resources(key: &ModelResourceCacheKey) {
    let mut cache = model_resource_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache.retain(|entry| entry.key != *key);
}

pub(super) fn model_resource_references(
    file: &mut std::fs::File,
    signature: MediaSignature,
    size_bytes: u64,
    model_path: &Path,
) -> Result<Vec<ModelResourceReference>, WorkspaceError> {
    let json = read_model_json(file, signature, size_bytes)?;
    let document: serde_json::Value =
        serde_json::from_slice(&json).map_err(|_| WorkspaceError::NotEditable)?;
    let object = document.as_object().ok_or(WorkspaceError::NotEditable)?;
    let asset = object
        .get("asset")
        .and_then(serde_json::Value::as_object)
        .ok_or(WorkspaceError::NotEditable)?;
    if asset.get("version").and_then(serde_json::Value::as_str) != Some("2.0") {
        return Err(WorkspaceError::NotEditable);
    }

    let mut references = Vec::new();
    collect_model_resource_references(
        object,
        "buffers",
        ModelResourceKind::Buffer,
        model_path,
        &mut references,
    )?;
    collect_model_resource_references(
        object,
        "images",
        ModelResourceKind::Image,
        model_path,
        &mut references,
    )?;
    if references.len() > MAX_MODEL_EXTERNAL_RESOURCES {
        return Err(WorkspaceError::ContentTooLarge);
    }
    Ok(references)
}

pub(super) fn read_model_json(
    file: &mut std::fs::File,
    signature: MediaSignature,
    size_bytes: u64,
) -> Result<Vec<u8>, WorkspaceError> {
    file.seek(SeekFrom::Start(0))
        .map_err(|error| map_io(&error))?;
    match signature {
        MediaSignature::GltfJson => {
            if size_bytes > MAX_MODEL_JSON_BYTES {
                return Err(WorkspaceError::ContentTooLarge);
            }
            let capacity =
                usize::try_from(size_bytes).map_err(|_| WorkspaceError::ContentTooLarge)?;
            let mut json = Vec::with_capacity(capacity);
            Read::by_ref(file)
                .take(size_bytes.saturating_add(1))
                .read_to_end(&mut json)
                .map_err(|error| map_io(&error))?;
            if json.len() as u64 != size_bytes {
                return Err(WorkspaceError::Conflict);
            }
            Ok(json.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&json).to_vec())
        }
        MediaSignature::Glb => read_glb_json(file, size_bytes),
        _ => Err(WorkspaceError::NotEditable),
    }
}

pub(super) fn read_glb_json(
    file: &mut std::fs::File,
    size_bytes: u64,
) -> Result<Vec<u8>, WorkspaceError> {
    const GLB_HEADER_BYTES: u64 = 12;
    const GLB_CHUNK_HEADER_BYTES: u64 = 8;
    const GLB_JSON_CHUNK: u32 = 0x4e4f_534a;

    if size_bytes < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES {
        return Err(WorkspaceError::NotEditable);
    }
    let mut header = [0_u8; GLB_HEADER_BYTES as usize];
    read_model_exact(file, &mut header)?;
    let version = u32::from_le_bytes(header[4..8].try_into().unwrap_or_default());
    let declared_size = u32::from_le_bytes(header[8..12].try_into().unwrap_or_default()) as u64;
    if &header[..4] != b"glTF" || version != 2 || declared_size != size_bytes {
        return Err(WorkspaceError::NotEditable);
    }

    let mut chunk_header = [0_u8; GLB_CHUNK_HEADER_BYTES as usize];
    read_model_exact(file, &mut chunk_header)?;
    let json_size = u32::from_le_bytes(chunk_header[..4].try_into().unwrap_or_default()) as u64;
    let chunk_type = u32::from_le_bytes(chunk_header[4..8].try_into().unwrap_or_default());
    if json_size == 0
        || json_size > MAX_MODEL_JSON_BYTES
        || json_size % 4 != 0
        || chunk_type != GLB_JSON_CHUNK
        || GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + json_size > size_bytes
    {
        return Err(WorkspaceError::NotEditable);
    }
    let json_capacity = usize::try_from(json_size).map_err(|_| WorkspaceError::ContentTooLarge)?;
    let mut json = vec![0_u8; json_capacity];
    read_model_exact(file, &mut json)?;

    let mut position = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + json_size;
    while position < size_bytes {
        if size_bytes - position < GLB_CHUNK_HEADER_BYTES {
            return Err(WorkspaceError::NotEditable);
        }
        read_model_exact(file, &mut chunk_header)?;
        let chunk_size =
            u32::from_le_bytes(chunk_header[..4].try_into().unwrap_or_default()) as u64;
        if chunk_size % 4 != 0
            || position
                .checked_add(GLB_CHUNK_HEADER_BYTES)
                .and_then(|position| position.checked_add(chunk_size))
                .is_none_or(|end| end > size_bytes)
        {
            return Err(WorkspaceError::NotEditable);
        }
        file.seek(SeekFrom::Current(i64::from(chunk_size as u32)))
            .map_err(|error| map_io(&error))?;
        position += GLB_CHUNK_HEADER_BYTES + chunk_size;
    }
    if position != size_bytes {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(json)
}

pub(super) fn read_model_exact(
    file: &mut std::fs::File,
    bytes: &mut [u8],
) -> Result<(), WorkspaceError> {
    file.read_exact(bytes).map_err(|error| {
        if error.kind() == std::io::ErrorKind::UnexpectedEof {
            WorkspaceError::NotEditable
        } else {
            map_io(&error)
        }
    })
}

pub(super) fn collect_model_resource_references(
    document: &serde_json::Map<String, serde_json::Value>,
    field: &str,
    kind: ModelResourceKind,
    model_path: &Path,
    output: &mut Vec<ModelResourceReference>,
) -> Result<(), WorkspaceError> {
    let Some(value) = document.get(field) else {
        return Ok(());
    };
    let entries = value.as_array().ok_or(WorkspaceError::NotEditable)?;
    for entry in entries {
        let entry = entry.as_object().ok_or(WorkspaceError::NotEditable)?;
        let declared_size_bytes = match kind {
            ModelResourceKind::Buffer => Some(
                entry
                    .get("byteLength")
                    .and_then(serde_json::Value::as_u64)
                    .filter(|length| *length > 0)
                    .ok_or(WorkspaceError::NotEditable)?,
            ),
            ModelResourceKind::Image => None,
        };
        let Some(uri_value) = entry.get("uri") else {
            continue;
        };
        let uri = uri_value.as_str().ok_or(WorkspaceError::NotEditable)?;
        if is_allowed_embedded_model_uri(uri, kind) {
            continue;
        }
        if uri
            .get(..5)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
        {
            return Err(WorkspaceError::NotEditable);
        }
        let relative_path = resolve_model_resource_uri(model_path, uri)?;
        let policy = model_resource_policy(kind, &relative_path)?;
        output.push(ModelResourceReference {
            uri: uri.to_owned(),
            relative_path,
            policy,
            declared_size_bytes,
        });
        if output.len() > MAX_MODEL_EXTERNAL_RESOURCES {
            return Err(WorkspaceError::ContentTooLarge);
        }
    }
    Ok(())
}

pub(super) fn is_allowed_embedded_model_uri(uri: &str, kind: ModelResourceKind) -> bool {
    let lower = uri.to_ascii_lowercase();
    let prefixes: &[&str] = match kind {
        ModelResourceKind::Buffer => &[
            "data:application/octet-stream;base64,",
            "data:application/gltf-buffer;base64,",
        ],
        ModelResourceKind::Image => &[
            "data:image/png;base64,",
            "data:image/jpeg;base64,",
            "data:image/webp;base64,",
            "data:image/avif;base64,",
            "data:image/ktx2;base64,",
        ],
    };
    prefixes
        .iter()
        .any(|prefix| lower.starts_with(prefix) && uri.len() > prefix.len())
}

pub(super) fn resolve_model_resource_uri(
    model_path: &Path,
    uri: &str,
) -> Result<PathBuf, WorkspaceError> {
    if uri.is_empty()
        || uri.len() > MAX_MODEL_RESOURCE_URI_BYTES
        || uri.contains(['\0', '\\', '?', '#', ':'])
        || uri.starts_with('/')
        || uri.starts_with("//")
    {
        return Err(WorkspaceError::InvalidPath);
    }

    let mut resolved = model_path
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .to_path_buf();
    for encoded_component in uri.split('/') {
        if encoded_component.is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }
        let component = percent_decode_model_uri_component(encoded_component)?;
        match component.as_str() {
            "." => continue,
            ".." => {
                if !resolved.pop() {
                    return Err(WorkspaceError::OutsideWorkspace);
                }
            }
            _ => {
                if component.contains(['/', '\\', ':']) || validate_relative(&component).is_err() {
                    return Err(WorkspaceError::InvalidPath);
                }
                resolved.push(component);
            }
        }
    }
    if resolved.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(resolved)
}

pub(super) fn percent_decode_model_uri_component(value: &str) -> Result<String, WorkspaceError> {
    fn hex(value: u8) -> Option<u8> {
        match value {
            b'0'..=b'9' => Some(value - b'0'),
            b'a'..=b'f' => Some(value - b'a' + 10),
            b'A'..=b'F' => Some(value - b'A' + 10),
            _ => None,
        }
    }

    let source = value.as_bytes();
    let mut decoded = Vec::with_capacity(source.len());
    let mut index = 0;
    while index < source.len() {
        if source[index] == b'%' {
            let high = source.get(index + 1).and_then(|value| hex(*value));
            let low = source.get(index + 2).and_then(|value| hex(*value));
            let (Some(high), Some(low)) = (high, low) else {
                return Err(WorkspaceError::InvalidPath);
            };
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(source[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| WorkspaceError::InvalidPath)
}

pub(super) fn model_resource_policy(
    kind: ModelResourceKind,
    relative_path: &Path,
) -> Result<ModelResourcePolicy, WorkspaceError> {
    let extension = relative_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or(WorkspaceError::NotEditable)?;
    let policy = match (kind, extension.as_str()) {
        (ModelResourceKind::Buffer, "bin" | "glbin" | "glbuf") => ModelResourcePolicy {
            mime_type: "application/octet-stream",
            maximum_size: MAX_MODEL_RESOURCE_BYTES,
            signature: ModelResourceSignature::Any,
        },
        (ModelResourceKind::Image, "png") => ModelResourcePolicy {
            mime_type: "image/png",
            maximum_size: MAX_IMAGE_PREVIEW_BYTES,
            signature: ModelResourceSignature::Png,
        },
        (ModelResourceKind::Image, "jpg" | "jpeg") => ModelResourcePolicy {
            mime_type: "image/jpeg",
            maximum_size: MAX_IMAGE_PREVIEW_BYTES,
            signature: ModelResourceSignature::Jpeg,
        },
        (ModelResourceKind::Image, "webp") => ModelResourcePolicy {
            mime_type: "image/webp",
            maximum_size: MAX_IMAGE_PREVIEW_BYTES,
            signature: ModelResourceSignature::Webp,
        },
        (ModelResourceKind::Image, "avif") => ModelResourcePolicy {
            mime_type: "image/avif",
            maximum_size: MAX_IMAGE_PREVIEW_BYTES,
            signature: ModelResourceSignature::Avif,
        },
        (ModelResourceKind::Image, "ktx2") => ModelResourcePolicy {
            mime_type: "image/ktx2",
            maximum_size: MAX_IMAGE_PREVIEW_BYTES,
            signature: ModelResourceSignature::Ktx2,
        },
        _ => return Err(WorkspaceError::NotEditable),
    };
    Ok(policy)
}

pub(super) fn matches_model_resource_signature(
    signature: ModelResourceSignature,
    bytes: &[u8],
) -> bool {
    match signature {
        ModelResourceSignature::Any => !bytes.is_empty(),
        ModelResourceSignature::Png => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        ModelResourceSignature::Jpeg => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        ModelResourceSignature::Webp => {
            bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
        }
        ModelResourceSignature::Avif => ftyp_has_brand(bytes, &[b"avif", b"avis"]),
        ModelResourceSignature::Ktx2 => bytes.starts_with(b"\xabKTX 20\xbb\r\n\x1a\n"),
    }
}
