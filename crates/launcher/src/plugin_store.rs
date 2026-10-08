//! First-party downloadable plugins. The trusted catalog is
//! compiled into the core; downloads cannot choose URLs or expected hashes.
use base64::Engine;
use cdp_client::BridgeError;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tokio_util::sync::CancellationToken;

const CATALOG: &str = include_str!("../../../packages/explorer-ui/dist/plugins/catalog.json");
const MAX_SCRIPT: usize = 4 * 1024 * 1024;
const MAX_PACKAGE: usize = 32 * 1024 * 1024;
const MAX_RESOURCES: usize = 32;
const RESOURCE_CHUNK: usize = 1024 * 1024;
const CATEGORIES: [&str; 3] = ["appearance", "file-preview", "developer-tools"];
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Resource {
    pub asset: String,
    pub size: usize,
    pub sha256: String,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default = "script_kind")]
    pub kind: String,
    #[serde(default)]
    pub image: Option<Value>,
    #[serde(default)]
    pub mime_type: String,
}
#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Package {
    pub id: String,
    #[serde(default = "appearance_category")]
    pub category: String,
    pub name: String,
    pub api: u32,
    pub version: String,
    pub release_tag: String,
    pub size: usize,
    pub sha256: String,
    pub asset: String,
    #[serde(default)]
    pub resources: Vec<Resource>,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default = "script_kind")]
    pub kind: String,
    #[serde(default)]
    pub gallery_version: u32,
    #[serde(default)]
    pub default_image_count: usize,
    #[serde(default)]
    pub mime_type: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
}
fn appearance_category() -> String {
    "appearance".into()
}
fn script_kind() -> String {
    "script".into()
}
impl Package {
    fn assets(&self) -> Vec<Self> {
        let mut assets = self
            .resources
            .iter()
            .map(|r| Self {
                asset: r.asset.clone(),
                size: r.size,
                sha256: r.sha256.clone(),
                resources: Vec::new(),
                relative_path: r.relative_path.clone(),
                kind: r.kind.clone(),
                mime_type: r.mime_type.clone(),
                ..self.clone()
            })
            .collect::<Vec<_>>();
        assets.push(Self {
            resources: Vec::new(),
            ..self.clone()
        });
        assets
    }
    fn total_size(&self) -> usize {
        self.resources
            .iter()
            .fold(self.size, |total, r| total.saturating_add(r.size))
    }
}
struct Job {
    cancel: CancellationToken,
    phase: &'static str,
    bytes: usize,
    error: Option<String>,
}
fn jobs() -> &'static Mutex<HashMap<String, Job>> {
    static JOBS: OnceLock<Mutex<HashMap<String, Job>>> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn error(code: &str, message: impl Into<String>) -> BridgeError {
    BridgeError::new(code, message.into())
}
pub(crate) fn catalog() -> Result<Vec<Package>, BridgeError> {
    parse_catalog(CATALOG)
}
fn parse_catalog(source: &str) -> Result<Vec<Package>, BridgeError> {
    let packages: Vec<Package> = serde_json::from_str(source)
        .map_err(|_| error("PLUGIN_CATALOG", "The embedded plugin catalog is invalid."))?;
    if packages.is_empty() || packages.len() > 64 {
        return Err(error(
            "PLUGIN_CATALOG",
            "The plugin catalog count is invalid.",
        ));
    }
    let mut ids = std::collections::HashSet::new();
    let mut assets = std::collections::HashSet::new();
    for p in &packages {
        if !ids.insert(&p.id) || !valid_package(p) {
            return Err(error(
                "PLUGIN_CATALOG",
                "Invalid or duplicate trusted plugin descriptor.",
            ));
        }
        for asset in p.assets() {
            // GitHub Release assets are flat, even though local packages are categorized.
            if !assets.insert(asset.asset) {
                return Err(error("PLUGIN_CATALOG", "Duplicate trusted release asset."));
            }
        }
    }
    for p in &packages {
        dependency_order(&packages, &p.id)?;
    }
    Ok(packages)
}
fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}
fn trusted_asset(p: &Package, name: &str) -> bool {
    safe_component(name)
        && (name.starts_with(&format!("CodeCodex-background-{}-", p.id))
            || name.starts_with(&format!("CodeCodex-plugin-{}-", p.id)))
}
fn safe_relative(value: &str) -> bool {
    !value.is_empty() && value.split('/').count() <= 4 && value.split('/').all(safe_component)
}
fn valid_package(p: &Package) -> bool {
    let mut paths = std::collections::HashSet::new();
    paths.insert(&p.relative_path);
    p.api == 1
        && CATEGORIES.contains(&p.category.as_str())
        && safe_component(&p.id)
        && safe_component(&p.version)
        && p.release_tag.starts_with('v')
        && safe_component(&p.release_tag)
        && p.size > 0
        && p.size <= MAX_SCRIPT
        && valid_hash(&p.sha256)
        && p.kind == "script"
        && trusted_asset(p, &p.asset)
        && p.asset.ends_with(".js")
        && p.relative_path == p.asset
        && p.resources.len() <= MAX_RESOURCES
        && p.total_size() <= MAX_PACKAGE
        && p.resources.iter().all(|r| {
            r.size > 0
                && r.size <= MAX_SCRIPT
                && valid_hash(&r.sha256)
                && trusted_asset(p, &r.asset)
                && safe_relative(&r.relative_path)
                && r.relative_path.rsplit('/').next() == Some(r.asset.as_str())
                && paths.insert(&r.relative_path)
                && match r.kind.as_str() {
                    "script" | "worker" => r.asset.ends_with(".js"),
                    "style" => r.asset.ends_with(".css"),
                    "wasm" => r.asset.ends_with(".wasm"),
                    "binary" => {
                        !r.mime_type.is_empty()
                            && r.mime_type.len() <= 128
                            && r.mime_type
                                .bytes()
                                .all(|c| c.is_ascii_graphic() && c != b'\'' && c != b'\"')
                    }
                    "image" | "thumbnail" => {
                        r.asset.ends_with(".png")
                            && r.relative_path == format!("media/{}", r.asset)
                            && (r.kind != "image" || r.image.as_ref().is_some_and(Value::is_object))
                    }
                    _ => false,
                }
        })
}
fn dependency_order<'a>(
    packages: &'a [Package],
    id: &str,
) -> Result<Vec<&'a Package>, BridgeError> {
    fn visit<'a>(
        packages: &'a [Package],
        id: &str,
        active: &mut Vec<String>,
        done: &mut Vec<&'a Package>,
    ) -> Result<(), BridgeError> {
        if done.iter().any(|p| p.id == id) {
            return Ok(());
        }
        if active.iter().any(|entry| entry == id) {
            return Err(error(
                "PLUGIN_CATALOG",
                "The trusted plugin dependency graph contains a cycle.",
            ));
        }
        let p = packages.iter().find(|p| p.id == id).ok_or_else(|| {
            error(
                "PLUGIN_ID",
                "This plugin or dependency is not in the trusted catalog.",
            )
        })?;
        if p.dependencies.len() > 16
            || p.dependencies
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != p.dependencies.len()
        {
            return Err(error(
                "PLUGIN_CATALOG",
                "Invalid or duplicate trusted plugin dependency.",
            ));
        }
        active.push(id.to_owned());
        for dependency in &p.dependencies {
            visit(packages, dependency, active, done)?;
        }
        active.pop();
        done.push(p);
        Ok(())
    }
    let mut ordered = Vec::new();
    visit(packages, id, &mut Vec::new(), &mut ordered)?;
    if ordered.iter().map(|p| p.total_size()).sum::<usize>() > MAX_PACKAGE {
        return Err(error(
            "PLUGIN_TOO_LARGE",
            "The plugin dependency closure exceeds the bounded load budget.",
        ));
    }
    Ok(ordered)
}
fn package(id: &str) -> Result<Package, BridgeError> {
    catalog()?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| error("PLUGIN_ID", "This plugin is not in the trusted catalog."))
}
pub(crate) fn cache_root() -> Result<PathBuf, BridgeError> {
    let local = std::env::var_os("LOCALAPPDATA").ok_or_else(|| {
        error(
            "PLUGIN_CACHE",
            "The per-user application data directory is unavailable.",
        )
    })?;
    let root = PathBuf::from(local).join("CodeCodex").join("plugin-cache");
    std::fs::create_dir_all(&root)
        .map_err(|e| error("PLUGIN_CACHE", format!("Cannot prepare plugin cache: {e}")))?;
    for path in [root.clone(), root.parent().unwrap().to_path_buf()] {
        let meta = std::fs::symlink_metadata(path)
            .map_err(|e| error("PLUGIN_CACHE", format!("Cache metadata: {e}")))?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(error(
                    "PLUGIN_CACHE",
                    "A redirected/reparse plugin cache is not allowed.",
                ));
            }
        }
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(error(
                "PLUGIN_CACHE",
                "Plugin cache must be a regular directory.",
            ));
        }
    }
    Ok(root)
}
fn path(root: &Path, p: &Package) -> PathBuf {
    root.join("plugins")
        .join(&p.category)
        .join(&p.id)
        .join(&p.version)
        .join(if p.relative_path.is_empty() {
            &p.asset
        } else {
            &p.relative_path
        })
}
fn old_directory_path(root: &Path, p: &Package) -> PathBuf {
    root.join("plugins")
        .join(&p.id)
        .join(&p.version)
        .join(if p.relative_path.is_empty() {
            &p.asset
        } else {
            &p.relative_path
        })
}
fn legacy_paths(root: &Path, p: &Package) -> Vec<PathBuf> {
    let mut paths = vec![old_directory_path(root, p)];
    if p.kind == "script" {
        paths.push(root.join(format!("{}-{}.js", p.id, p.sha256)));
    }
    paths
}
fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && ![".", ".."].contains(&value)
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
}
fn verify_directory(directory: &Path) -> Result<(), BridgeError> {
    let meta = std::fs::symlink_metadata(directory)
        .map_err(|e| error("PLUGIN_CACHE", format!("Plugin directory: {e}")))?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(error(
                "PLUGIN_CACHE",
                "Linked/reparse plugin directories are not allowed.",
            ));
        }
    }
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err(error(
            "PLUGIN_CACHE",
            "Plugin directory must be a regular directory.",
        ));
    }
    Ok(())
}
fn verify_parents(root: &Path, file: &Path, create: bool) -> Result<(), BridgeError> {
    let relative = file
        .parent()
        .and_then(|p| p.strip_prefix(root).ok())
        .ok_or_else(|| error("PLUGIN_CACHE", "Plugin path escapes its cache root."))?;
    verify_directory(root)?;
    let mut parent = root.to_path_buf();
    for component in relative.components() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err(error("PLUGIN_CACHE", "Invalid plugin path component."));
        }
        parent.push(component);
        if create && !parent.exists() {
            std::fs::create_dir(&parent)
                .or_else(|e| {
                    if e.kind() == std::io::ErrorKind::AlreadyExists {
                        Ok(())
                    } else {
                        Err(e)
                    }
                })
                .map_err(|e| error("PLUGIN_CACHE", format!("Create plugin directory: {e}")))?;
        }
        verify_directory(&parent)?;
    }
    Ok(())
}
fn verify(p: &Package, bytes: &[u8]) -> Result<(), BridgeError> {
    if bytes.len() != p.size
        || bytes.len() > MAX_SCRIPT
        || format!("{:x}", Sha256::digest(bytes)) != p.sha256
    {
        return Err(error(
            "PLUGIN_INTEGRITY",
            format!(
                "Plugin {} {} asset {} failed size/SHA-256 verification (expected {} bytes, observed {}).",
                p.id,
                p.version,
                p.asset,
                p.size,
                bytes.len()
            ),
        ));
    }
    match p.kind.as_str() {
        "image" | "thumbnail" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => return Ok(()),
        "wasm" if bytes.starts_with(b"\0asm\x01\0\0\0") => return Ok(()),
        "binary" if !p.mime_type.is_empty() && p.mime_type.len() <= 128 => return Ok(()),
        "script" | "worker" | "style" => {}
        _ => {
            return Err(error(
                "PLUGIN_ENCODING",
                "The verified plugin resource format is invalid.",
            ));
        }
    }
    std::str::from_utf8(bytes).map_err(|_| {
        error(
            "PLUGIN_ENCODING",
            "The verified plugin must be UTF-8 JavaScript.",
        )
    })?;
    Ok(())
}
pub(crate) fn sources(id: &str) -> Result<Vec<String>, BridgeError> {
    let packages = catalog()?;
    let root = cache_root()?;
    let mut sources = Vec::new();
    // Construct the entire verified closure before any script reaches the renderer.
    for p in dependency_order(&packages, id)? {
        sources.extend(sources_for(&root, p)?);
    }
    if sources.is_empty() || sources.len() > 33 || sources.iter().any(|s| s.len() > MAX_SCRIPT) {
        return Err(error(
            "PLUGIN_TOO_LARGE",
            "The plugin exceeds the bounded script batch channel.",
        ));
    }
    Ok(sources)
}
fn sources_for(root: &Path, p: &Package) -> Result<Vec<String>, BridgeError> {
    let mut verified = HashMap::new();
    for asset in p.assets() {
        verified.insert(asset.asset.clone(), read_asset(root, &asset)?);
    }
    let mut sources = Vec::new();
    for r in &p.resources {
        if r.kind == "script" {
            sources.push(
                String::from_utf8(verified[&r.asset].clone())
                    .map_err(|_| error("PLUGIN_ENCODING", "Invalid script encoding"))?,
            );
            continue;
        }
        if ["style", "worker", "wasm", "binary"].contains(&r.kind.as_str()) {
            sources.extend(resource_sources(p, r, &verified[&r.asset]));
            continue;
        }
        if r.kind != "image" {
            continue;
        }
        let mut item = r
            .image
            .clone()
            .ok_or_else(|| error("PLUGIN_CATALOG", "Image metadata is missing"))?;
        let metadata = item
            .as_object_mut()
            .ok_or_else(|| error("PLUGIN_CATALOG", "Image metadata must be an object"))?;
        let thumbnail = metadata.remove("thumbnailAsset");
        metadata.insert(
            "data".into(),
            json!(base64::engine::general_purpose::STANDARD.encode(&verified[&r.asset])),
        );
        if let Some(asset) = thumbnail.and_then(|v| v.as_str().map(str::to_owned)) {
            let thumbnail = verified
                .get(&asset)
                .ok_or_else(|| error("PLUGIN_CATALOG", "The default image thumbnail is missing"))?;
            metadata.insert(
                "thumbnail".into(),
                json!(base64::engine::general_purpose::STANDARD.encode(thumbnail)),
            );
        }
        let source = format!(
            "(()=>{{const key=Symbol.for('code-codex:default-galleries:v1');const registry=window[key]??(window[key]=new Map());let gallery=registry.get({id});if(!gallery||gallery.version!=={version})registry.set({id},gallery={{version:{version},count:{count},images:new Map()}});gallery.images.set({hash},{item});}})();",
            id = json!(p.id),
            version = p.gallery_version,
            count = p.default_image_count,
            hash = json!(r.sha256),
            item = item
        );
        if source.len() > MAX_SCRIPT {
            return Err(error(
                "PLUGIN_TOO_LARGE",
                "Default image registration exceeds the bounded script channel.",
            ));
        }
        sources.push(source);
    }
    sources.push(
        String::from_utf8(verified[&p.asset].clone())
            .map_err(|_| error("PLUGIN_ENCODING", "Invalid main script encoding"))?,
    );
    // This marker is emitted only after every asset has been read and verified
    // and after the package's main registration script. It allows the early
    // startup loader and the later core UI to share the same verified identity.
    sources.push(verified_module_source(p));
    Ok(sources)
}
fn verified_module_source(p: &Package) -> String {
    let fingerprint = json!([
        p.api,
        p.version,
        p.sha256,
        p.resources.iter().map(|r| &r.sha256).collect::<Vec<_>>()
    ]);
    format!(
        "(()=>{{const id={id};const module=window[Symbol.for('code-codex:plugin-modules:v1')]?.get(id)??window[Symbol.for('code-codex:background-modules:v1')]?.get(id);if(module?.api==={api}&&module.version==={version}){{const key=Symbol.for('code-codex:verified-plugin-modules:v1');const registry=window[key]??(window[key]=new Map());registry.set(id,{{fingerprint:JSON.stringify({fingerprint}),module}});}}}})();",
        id = json!(p.id),
        api = p.api,
        version = json!(p.version),
        fingerprint = fingerprint
    )
}
fn resource_sources(p: &Package, r: &Resource, bytes: &[u8]) -> Vec<String> {
    let mut sources = Vec::new();
    let mime = if r.mime_type.is_empty() {
        match r.kind.as_str() {
            "style" => "text/css",
            "worker" => "application/javascript",
            "wasm" => "application/wasm",
            _ => "application/octet-stream",
        }
    } else {
        &r.mime_type
    };
    // Raw resources remain data. Worker scripts never run in the main context;
    // the plugin creates and disposes its own Blob/Worker using these verified bytes.
    for (index, chunk) in bytes.chunks(RESOURCE_CHUNK).enumerate() {
        let init = if index == 0 {
            format!(
                "let resources=registry.get({id});if(!resources||resources.version!=={version})registry.set({id},resources={{version:{version},resources:new Map()}});resources.resources.set({path},{{kind:{kind},mimeType:{mime},bytes:new Uint8Array({size})}});",
                id = json!(p.id),
                version = json!(p.version),
                path = json!(r.relative_path),
                kind = json!(r.kind),
                mime = json!(mime),
                size = bytes.len()
            )
        } else {
            String::new()
        };
        sources.push(format!("(()=>{{const key=Symbol.for('code-codex:plugin-resources:v1');const registry=window[key]??(window[key]=new Map());{init}const bytes=Uint8Array.from(atob({data}),c=>c.charCodeAt(0));registry.get({id}).resources.get({path}).bytes.set(bytes,{offset});}})();",
            data=json!(base64::engine::general_purpose::STANDARD.encode(chunk)),
            id=json!(p.id), path=json!(r.relative_path), offset=index*RESOURCE_CHUNK));
    }
    sources
}
fn read_verified_file(root: &Path, file: &Path, p: &Package) -> Result<Vec<u8>, BridgeError> {
    verify_parents(root, file, false)?;
    let meta = std::fs::symlink_metadata(file).map_err(|_| {
        error(
            "PLUGIN_NOT_INSTALLED",
            format!(
                "Download {} in Preview Market first; required asset {} is missing.",
                p.name, p.asset
            ),
        )
    })?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(error(
                "PLUGIN_INTEGRITY",
                "Linked/reparse plugin cache files are not allowed.",
            ));
        }
    }
    if !meta.is_file() || meta.len() != p.size as u64 || meta.file_type().is_symlink() {
        return Err(error(
            "PLUGIN_INTEGRITY",
            "Cached plugin size or file type is invalid.",
        ));
    }
    let bytes =
        std::fs::read(file).map_err(|e| error("PLUGIN_CACHE", format!("Read plugin: {e}")))?;
    verify(p, &bytes)?;
    Ok(bytes)
}
fn read_asset(root: &Path, p: &Package) -> Result<Vec<u8>, BridgeError> {
    let file = path(root, p);
    if !file.exists() {
        for legacy in legacy_paths(root, p) {
            if std::fs::symlink_metadata(&legacy).is_err() {
                continue;
            }
            let bytes = read_verified_file(root, &legacy, p)?;
            commit(
                root,
                p,
                &bytes,
                tempfile::NamedTempFile::new_in(root)
                    .map_err(|e| error("PLUGIN_CACHE", format!("Migration staging: {e}")))?,
            )?;
            crate::runtime_log::record(
                "plugin-package",
                "cache migration",
                "passed",
                json!({"id":p.id,"category":p.category,"version":p.version,"asset":p.asset}),
            );
            break;
        }
    }
    let bytes = read_verified_file(root, &file, p)?;
    crate::runtime_log::record(
        "plugin-package",
        "cache load",
        "verified",
        json!({"id":p.id,"category":p.category,"version":p.version,"asset":p.asset,"bytes":bytes.len()}),
    );
    Ok(bytes)
}
pub(crate) fn status() -> Result<Value, BridgeError> {
    let root = cache_root()?;
    let packages = catalog()?;
    let jobs = jobs()
        .lock()
        .map_err(|_| error("PLUGIN_STATE", "Plugin operation state unavailable."))?;
    Ok(Value::Array(packages.iter().map(|p|{
        let job=jobs.get(&p.id);
        let closure=dependency_order(&packages,&p.id).expect("catalog dependencies were validated");
        json!({"id":p.id,"category":p.category,"version":p.version,"installed":closure.iter().all(|p|p.assets().iter().all(|asset|source_available(&root,asset))),"phase":job.map(|j|j.phase),"downloaded":job.map(|j|j.bytes).unwrap_or(0),"total":closure.iter().map(|p|p.total_size()).sum::<usize>(),"error":job.and_then(|j|j.error.as_ref())})
    }).collect()))
}
fn source_available(root: &Path, p: &Package) -> bool {
    let current = path(root, p);
    // A current malformed entry must not be silently bypassed by legacy data.
    if std::fs::symlink_metadata(&current).is_ok() {
        return read_verified_file(root, &current, p).is_ok();
    }
    legacy_paths(root, p)
        .iter()
        .find(|file| std::fs::symlink_metadata(file).is_ok())
        .is_some_and(|file| read_verified_file(root, file, p).is_ok())
}
pub(crate) fn cancel(id: &str) -> Result<Value, BridgeError> {
    package(id)?;
    let jobs = jobs()
        .lock()
        .map_err(|_| error("PLUGIN_STATE", "Plugin operation state unavailable."))?;
    if let Some(job) = jobs.get(id) {
        job.cancel.cancel();
    }
    Ok(json!({"cancelRequested":true}))
}
struct JobGuard(String);
impl Drop for JobGuard {
    fn drop(&mut self) {
        if let Ok(mut jobs) = jobs().lock() {
            if let Some(j) = jobs.get_mut(&self.0) {
                if !["installed", "failed", "cancelled"].contains(&j.phase) {
                    j.phase = "cancelled";
                }
            }
        }
    }
}
fn progress(id: &str, phase: &'static str, bytes: usize) {
    if let Ok(mut jobs) = jobs().lock() {
        if let Some(j) = jobs.get_mut(id) {
            j.phase = phase;
            j.bytes = bytes;
        }
    }
}
fn trusted_url(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}
pub(crate) async fn install(id: &str) -> Result<Value, BridgeError> {
    let p = package(id)?;
    let packages = catalog()?;
    let closure = dependency_order(&packages, id)?;
    if sources(id).is_ok() {
        return Ok(
            json!({"id":id,"category":p.category,"version":p.version,"installed":true,"cached":true}),
        );
    }
    let cancel = CancellationToken::new();
    {
        let mut jobs = jobs()
            .lock()
            .map_err(|_| error("PLUGIN_STATE", "Plugin operation state unavailable."))?;
        if jobs
            .get(id)
            .is_some_and(|j| ["downloading", "verifying", "committing"].contains(&j.phase))
        {
            return Err(error("PLUGIN_BUSY", "This plugin is already downloading."));
        }
        if jobs
            .values()
            .filter(|j| ["downloading", "verifying", "committing"].contains(&j.phase))
            .count()
            >= 3
        {
            return Err(error(
                "PLUGIN_BUSY",
                "Three plugin downloads are already running.",
            ));
        }
        jobs.insert(
            id.to_owned(),
            Job {
                cancel: cancel.clone(),
                phase: "downloading",
                bytes: 0,
                error: None,
            },
        );
    }
    let _guard = JobGuard(id.to_owned());
    crate::runtime_log::record(
        "plugin-package",
        "download",
        "started",
        json!({"id":id,"category":p.category,"version":p.version,"expectedBytes":closure.iter().map(|p|p.total_size()).sum::<usize>(),"resourceCount":p.resources.len(),"dependencyCount":closure.len()-1}),
    );
    let result = tokio::select! {
        ()=cancel.cancelled()=>Err(error("PLUGIN_CANCELLED","Plugin download was cancelled.")),
        result=tokio::time::timeout(Duration::from_secs(120),download(&p,&closure))=>result.map_err(|_|error("PLUGIN_NETWORK","Plugin package and resources download exceeded 120 seconds. Retry to reuse already verified files.")).and_then(|result|result),
    };
    if let Err(e) = &result {
        if let Ok(mut jobs) = jobs().lock() {
            if let Some(j) = jobs.get_mut(id) {
                j.phase = if cancel.is_cancelled() {
                    "cancelled"
                } else {
                    "failed"
                };
                j.error = Some(e.message.clone());
            }
        }
        crate::runtime_log::record(
            "plugin-package",
            "download",
            "failed",
            json!({"id":id,"version":p.version,"code":e.code,"reason":e.message}),
        );
    }
    result
}
async fn download(p: &Package, closure: &[&Package]) -> Result<Value, BridgeError> {
    let root = cache_root()?;
    let mut completed = 0;
    for dependency in closure {
        for asset in dependency.assets() {
            if source_available(&root, &asset) {
                // Upgrade the categorized location using verified old bytes, without HTTP.
                read_asset(&root, &asset)?;
            } else {
                download_asset(&asset, completed, &p.id).await?;
            }
            completed += asset.size;
            progress(&p.id, "downloading", completed);
        }
    }
    sources(&p.id)?;
    progress(&p.id, "installed", completed);
    Ok(json!({"id":p.id,"category":p.category,"installed":true,"version":p.version}))
}
async fn download_asset(
    p: &Package,
    completed: usize,
    progress_id: &str,
) -> Result<Value, BridgeError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 || !trusted_url(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| error("PLUGIN_NETWORK", format!("Plugin HTTP client: {e}")))?;
    let url = format!(
        "https://github.com/Rice-dog/code-codex/releases/download/{}/{}",
        p.release_tag, p.asset
    );
    let response = client.get(&url).send().await.map_err(|e| {
        error(
            "PLUGIN_NETWORK",
            format!("Plugin {} request failed: {e}", p.id),
        )
    })?;
    if !response.status().is_success() || !trusted_url(response.url()) {
        return Err(error(
            "PLUGIN_HTTP",
            format!(
                "Plugin {} asset returned HTTP {}. Check that {} plugin assets were published, or retry later.",
                p.id,
                response.status(),
                p.release_tag
            ),
        ));
    }
    if response
        .content_length()
        .is_some_and(|len| len != p.size as u64)
    {
        return Err(error(
            "PLUGIN_INTEGRITY",
            "Plugin HTTP Content-Length does not match the trusted catalog.",
        ));
    }
    let root = cache_root()?;
    receive_asset(p, response, &root, completed, progress_id).await
}
#[cfg(test)]
async fn receive(
    p: &Package,
    response: reqwest::Response,
    root: &Path,
) -> Result<Value, BridgeError> {
    receive_asset(p, response, root, 0, &p.id).await
}
async fn receive_asset(
    p: &Package,
    mut response: reqwest::Response,
    root: &Path,
    completed: usize,
    progress_id: &str,
) -> Result<Value, BridgeError> {
    let staging = tempfile::NamedTempFile::new_in(&root)
        .map_err(|e| error("PLUGIN_CACHE", format!("Plugin staging: {e}")))?;
    let mut bytes = Vec::with_capacity(p.size);
    while let Some(chunk) = response.chunk().await.map_err(|e| {
        error(
            "PLUGIN_NETWORK",
            format!("Plugin stream failed after {} bytes: {e}", bytes.len()),
        )
    })? {
        if bytes.len().saturating_add(chunk.len()) > p.size {
            return Err(error(
                "PLUGIN_INTEGRITY",
                "Plugin stream exceeded its trusted size.",
            ));
        }
        bytes.extend_from_slice(&chunk);
        progress(progress_id, "downloading", completed + bytes.len());
    }
    progress(progress_id, "verifying", completed + bytes.len());
    verify(p, &bytes)?;
    crate::runtime_log::record(
        "plugin-package",
        "integrity",
        "passed",
        json!({"id":p.id,"version":p.version,"bytes":bytes.len()}),
    );
    commit(&root, p, &bytes, staging)?;
    progress(progress_id, "downloading", completed + bytes.len());
    crate::runtime_log::record(
        "plugin-package",
        "install",
        "committed",
        json!({"id":p.id,"version":p.version,"bytes":bytes.len()}),
    );
    Ok(json!({"id":p.id,"installed":true,"version":p.version}))
}
fn commit(
    root: &Path,
    p: &Package,
    bytes: &[u8],
    mut staging: tempfile::NamedTempFile,
) -> Result<(), BridgeError> {
    use std::io::Write;
    verify(p, bytes)?;
    progress(&p.id, "committing", bytes.len());
    staging
        .write_all(bytes)
        .and_then(|()| staging.as_file().sync_all())
        .map_err(|e| error("PLUGIN_CACHE", format!("Write plugin staging: {e}")))?;
    let destination = path(root, p);
    verify_parents(root, &destination, true)?;
    if destination.exists() {
        let meta = std::fs::symlink_metadata(&destination)
            .map_err(|e| error("PLUGIN_CACHE", format!("Invalid cache metadata: {e}")))?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(error(
                    "PLUGIN_CACHE",
                    "Cannot replace a linked/reparse cache file.",
                ));
            }
        }
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(error(
                "PLUGIN_CACHE",
                "Cannot replace a non-regular cache file.",
            ));
        }
        let existing = std::fs::read(&destination)
            .map_err(|e| error("PLUGIN_CACHE", format!("Existing plugin: {e}")))?;
        if verify(p, &existing).is_ok() {
            return Ok(());
        }
        std::fs::remove_file(&destination)
            .map_err(|e| error("PLUGIN_CACHE", format!("Remove damaged plugin cache: {e}")))?;
        crate::runtime_log::record(
            "plugin-package",
            "cache repair",
            "removed damaged package",
            json!({"id":p.id}),
        );
    }
    if let Err(e) = staging.persist_noclobber(&destination) {
        // A second Code-Codex process may have committed the same immutable
        // package first. Accept only an independently verified regular winner.
        if !source_available(root, p) {
            return Err(error("PLUGIN_CACHE", format!("Commit plugin: {e}")));
        }
    }
    Ok(())
}

/// Offline installation accepts only the exact files/hashes already trusted by
/// this core. It does not add user-selected code or change the release catalog.
pub(crate) fn import_directory(directory: &Path) -> Result<Value, BridgeError> {
    let root = cache_root()?;
    let mut imported = Vec::new();
    for p in catalog()? {
        let Some(base) = [
            directory.join("plugins").join(&p.category).join(&p.id),
            directory.join(&p.category).join(&p.id),
            directory.join("plugins").join(&p.id),
            directory.join(&p.id),
            directory.to_path_buf(),
        ]
        .into_iter()
        .find(|base| base.join(&p.asset).exists()) else {
            continue;
        };
        for p in p.assets() {
            let input = base.join(if p.relative_path.is_empty() {
                &p.asset
            } else {
                &p.relative_path
            });
            verify_parents(directory, &input, false)?;
            if !input.exists() {
                return Err(error(
                    "PLUGIN_IMPORT",
                    format!("Missing default-media asset: {}", p.asset),
                ));
            }
            let meta = std::fs::symlink_metadata(&input)
                .map_err(|e| error("PLUGIN_IMPORT", format!("Import metadata: {e}")))?;
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err(error(
                        "PLUGIN_IMPORT",
                        "Linked/reparse import files are not allowed.",
                    ));
                }
            }
            if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != p.size as u64 {
                return Err(error(
                    "PLUGIN_IMPORT",
                    format!("{} is not the expected regular package file.", p.id),
                ));
            }
            let bytes = std::fs::read(&input)
                .map_err(|e| error("PLUGIN_IMPORT", format!("Read import: {e}")))?;
            verify(&p, &bytes)?;
            commit(
                &root,
                &p,
                &bytes,
                tempfile::NamedTempFile::new_in(&root)
                    .map_err(|e| error("PLUGIN_CACHE", format!("Import staging: {e}")))?,
            )?;
        }
        imported.push(p.id);
    }
    Ok(json!({"imported":imported}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_path(root: &Path, p: &Package) -> PathBuf {
        let file = path(root, p);
        verify_parents(root, &file, true).unwrap();
        file
    }
    #[test]
    fn catalog_is_bounded_unique_and_pinned() {
        let packages = catalog().unwrap();
        assert!(packages.len() >= 10);
        let mut ids = std::collections::HashSet::new();
        for p in packages {
            assert!(ids.insert(p.id.clone()));
            assert_eq!(p.api, 1);
            assert!(trusted_asset(&p, &p.asset));
            assert!(CATEGORIES.contains(&p.category.as_str()));
            assert!(p.size <= MAX_SCRIPT);
            assert!(!p.id.contains('/'));
            assert!(package(&p.id).is_ok());
        }
    }

    #[test]
    fn default_companions_are_required_and_individually_verified() {
        let first = b"default photo metadata";
        let mut p = fixture_package(b"main renderer");
        p.resources.push(Resource {
            asset: "CodeCodex-plugin-fixture-default-photo.js".into(),
            relative_path: String::new(),
            kind: script_kind(),
            image: None,
            mime_type: String::new(),
            size: first.len(),
            sha256: format!("{:x}", Sha256::digest(first)),
        });
        let assets = p.assets();
        assert_eq!(assets.len(), 2);
        assert_eq!(p.total_size(), first.len() + p.size);
        let root = tempfile::tempdir().unwrap();
        std::fs::write(test_path(root.path(), &assets[1]), b"main renderer").unwrap();
        assert!(
            !assets
                .iter()
                .all(|asset| source_available(root.path(), asset))
        );
        std::fs::write(test_path(root.path(), &assets[0]), first).unwrap();
        assert!(
            assets
                .iter()
                .all(|asset| source_available(root.path(), asset))
        );
        std::fs::write(test_path(root.path(), &assets[0]), b"corrupted").unwrap();
        assert!(
            !assets
                .iter()
                .all(|asset| source_available(root.path(), asset))
        );
    }
    #[test]
    fn integrity_rejects_truncation_and_changed_bytes() {
        let bytes = b"verified script";
        let p = Package {
            id: "test".into(),
            category: appearance_category(),
            name: "Test".into(),
            api: 1,
            version: "1.0.0".into(),
            release_tag: "v0.3.92".into(),
            size: bytes.len(),
            sha256: format!("{:x}", Sha256::digest(bytes)),
            asset: "test.js".into(),
            resources: Vec::new(),
            kind: script_kind(),
            ..Default::default()
        };
        assert!(verify(&p, bytes).is_ok());
        assert!(verify(&p, &bytes[1..]).is_err());
        assert!(verify(&p, b"modified script").is_err());
        let root = tempfile::tempdir().unwrap();
        commit(
            root.path(),
            &p,
            bytes,
            tempfile::NamedTempFile::new_in(root.path()).unwrap(),
        )
        .unwrap();
        assert_eq!(std::fs::read(test_path(root.path(), &p)).unwrap(), bytes);
    }
    #[test]
    fn trusted_origins_reject_userinfo_http_ports_and_other_repositories() {
        for bad in [
            "http://github.com/x",
            "https://evil.example/x",
            "https://github.com:444/x",
            "https://user@github.com/x",
        ] {
            assert!(!trusted_url(&url::Url::parse(bad).unwrap()));
        }
        assert!(trusted_url(
            &url::Url::parse("https://release-assets.githubusercontent.com/x").unwrap()
        ));
        assert!(package("../../evil").is_err());
    }
    fn fixture_package(bytes: &[u8]) -> Package {
        Package {
            id: "fixture".into(),
            category: appearance_category(),
            name: "Fixture".into(),
            api: 1,
            version: "1.0.0".into(),
            release_tag: "v0.3.92".into(),
            size: bytes.len(),
            sha256: format!("{:x}", Sha256::digest(bytes)),
            asset: "CodeCodex-plugin-fixture-1.0.0.js".into(),
            relative_path: "CodeCodex-plugin-fixture-1.0.0.js".into(),
            resources: Vec::new(),
            kind: script_kind(),
            ..Default::default()
        }
    }
    #[test]
    fn verified_legacy_cache_migrates_without_download() {
        let bytes = b"legacy verified script";
        let p = fixture_package(bytes);
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join(format!("{}-{}.js", p.id, p.sha256));
        std::fs::write(&legacy, bytes).unwrap();
        assert!(source_available(root.path(), &p));
        assert!(!path(root.path(), &p).exists());
        assert_eq!(read_asset(root.path(), &p).unwrap(), bytes);
        assert_eq!(std::fs::read(path(root.path(), &p)).unwrap(), bytes);
        assert!(legacy.exists());
        std::fs::remove_file(path(root.path(), &p)).unwrap();
        std::fs::write(&legacy, b"legacy damaged script!").unwrap();
        assert!(!source_available(root.path(), &p));
        assert!(read_asset(root.path(), &p).is_err());
        assert!(!path(root.path(), &p).exists());
    }
    #[test]
    fn categorized_cache_reuses_all_verified_old_directory_resources() {
        let main = b"verified module";
        let png = b"\x89PNG\r\n\x1a\nresource";
        let mut p = fixture_package(main);
        p.category = "file-preview".into();
        p.resources.push(Resource {
            asset: "CodeCodex-plugin-fixture-image.png".into(),
            relative_path: "media/CodeCodex-plugin-fixture-image.png".into(),
            kind: "image".into(),
            mime_type: String::new(),
            image: Some(json!({"name":"Default"})),
            size: png.len(),
            sha256: format!("{:x}", Sha256::digest(png)),
        });
        assert!(valid_package(&p));
        let root = tempfile::tempdir().unwrap();
        for asset in p.assets() {
            let old = old_directory_path(root.path(), &asset);
            verify_parents(root.path(), &old, true).unwrap();
            let bytes = if asset.kind == "script" {
                &main[..]
            } else {
                &png[..]
            };
            std::fs::write(&old, bytes).unwrap();
            assert!(source_available(root.path(), &asset));
            assert_eq!(read_asset(root.path(), &asset).unwrap(), bytes);
            assert!(old.exists());
            assert!(
                path(root.path(), &asset)
                    .starts_with(root.path().join("plugins/file-preview/fixture/1.0.0"))
            );
            assert_eq!(std::fs::read(path(root.path(), &asset)).unwrap(), bytes);
        }
    }
    fn descriptor(id: &str, dependencies: Vec<&str>) -> Value {
        json!({"id":id,"category":"file-preview","name":id,"api":1,"version":"1.0.0",
            "releaseTag":"v0.3.96","size":1,"sha256":"a".repeat(64),
            "asset":format!("CodeCodex-plugin-{id}-1.0.0.js"),"relativePath":format!("CodeCodex-plugin-{id}-1.0.0.js"),"dependencies":dependencies})
    }
    #[test]
    fn trusted_catalog_rejects_bad_categories_paths_and_dependency_graphs() {
        let good = descriptor("preview", vec![]);
        assert!(parse_catalog(&json!([good]).to_string()).is_ok());
        for key in ["category", "relativePath", "releaseTag"] {
            let mut invalid = descriptor("preview", vec![]);
            invalid[key] = json!("../outside");
            assert!(parse_catalog(&json!([invalid]).to_string()).is_err());
        }
        for invalid in [
            json!([descriptor("preview", vec!["missing"])]),
            json!([descriptor("preview", vec!["preview"])]),
            json!([
                descriptor("first", vec!["second"]),
                descriptor("second", vec!["first"])
            ]),
            json!([
                descriptor("first", vec!["second", "second"]),
                descriptor("second", vec![])
            ]),
            json!([descriptor("same", vec![]), descriptor("same", vec![])]),
        ] {
            assert!(parse_catalog(&invalid.to_string()).is_err());
        }
        let packages = parse_catalog(
            &json!([
                descriptor("first", vec!["second"]),
                descriptor("second", vec![])
            ])
            .to_string(),
        )
        .unwrap();
        assert_eq!(
            dependency_order(&packages, "first")
                .unwrap()
                .iter()
                .map(|p| p.id.as_str())
                .collect::<Vec<_>>(),
            vec!["second", "first"]
        );
    }
    #[test]
    fn worker_and_wasm_resources_are_verified_data_not_main_context_scripts() {
        let main = b"window.mainReady=true;";
        let worker = b"self.postMessage('worker only');";
        let wasm = b"\0asm\x01\0\0\0";
        let mut p = fixture_package(main);
        p.category = "file-preview".into();
        for (kind, name, bytes) in [
            ("worker", "worker.js", &worker[..]),
            ("wasm", "module.wasm", &wasm[..]),
        ] {
            p.resources.push(Resource {
                asset: format!("CodeCodex-plugin-fixture-{name}"),
                relative_path: format!("resources/CodeCodex-plugin-fixture-{name}"),
                kind: kind.into(),
                mime_type: String::new(),
                image: None,
                size: bytes.len(),
                sha256: format!("{:x}", Sha256::digest(bytes)),
            });
        }
        assert!(valid_package(&p));
        let root = tempfile::tempdir().unwrap();
        for asset in p.assets() {
            let bytes = match asset.kind.as_str() {
                "worker" => &worker[..],
                "wasm" => &wasm[..],
                _ => &main[..],
            };
            commit(
                root.path(),
                &asset,
                bytes,
                tempfile::NamedTempFile::new_in(root.path()).unwrap(),
            )
            .unwrap();
        }
        let sources = sources_for(root.path(), &p).unwrap();
        assert_eq!(sources.len(), 4);
        assert!(sources[0].contains("plugin-resources:v1"));
        assert!(sources[0].contains("Uint8Array"));
        assert!(!sources[0].contains("self.postMessage"));
        assert!(sources[1].contains("application/wasm"));
        assert_eq!(sources[2].as_bytes(), main);
        assert!(sources[3].contains("verified-plugin-modules:v1"));
        assert!(sources[3].contains(&p.sha256));
        for resource in &p.resources {
            assert!(sources[3].contains(&resource.sha256));
        }
        assert!(sources[3].contains("JSON.stringify([1,\"1.0.0\""));
        let wasm_asset = p.assets().into_iter().find(|p| p.kind == "wasm").unwrap();
        assert!(verify(&wasm_asset, b"not wasm").is_err());
        std::fs::write(path(root.path(), &wasm_asset), b"damaged").unwrap();
        assert!(sources_for(root.path(), &p).is_err());
    }
    #[test]
    fn raw_binary_registration_stays_within_script_channel_after_base64_expansion() {
        let bytes = vec![b'x'; MAX_SCRIPT];
        let p = fixture_package(b"main");
        let r = Resource {
            asset: "CodeCodex-plugin-fixture-buffer.bin".into(),
            relative_path: "resources/CodeCodex-plugin-fixture-buffer.bin".into(),
            kind: "binary".into(),
            mime_type: "application/octet-stream".into(),
            image: None,
            size: bytes.len(),
            sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        let sources = resource_sources(&p, &r, &bytes);
        assert_eq!(sources.len(), 4);
        assert!(sources.iter().all(|source| source.len() < MAX_SCRIPT));
        assert!(sources[0].contains("new Uint8Array(4194304)"));
        assert!(sources[3].contains(",3145728)"));
    }
    #[test]
    fn raw_media_is_verified_before_bounded_registration_and_main() {
        let png = b"\x89PNG\r\n\x1a\nfixture";
        let main = b"/*main last*/";
        let mut p = fixture_package(main);
        p.gallery_version = 1;
        p.default_image_count = 1;
        for (kind, asset) in [("thumbnail", "thumb.png"), ("image", "image.png")] {
            p.resources.push(Resource {
                asset: asset.into(),
                relative_path: format!("media/{asset}"),
                kind: kind.into(),
                size: png.len(),
                sha256: format!("{:x}", Sha256::digest(png)),
                mime_type: String::new(),
                image: (kind == "image")
                    .then(|| json!({"name":"Original","thumbnailAsset":"thumb.png"})),
            });
        }
        let root = tempfile::tempdir().unwrap();
        for asset in p.assets() {
            let bytes = if asset.kind == "script" {
                &main[..]
            } else {
                &png[..]
            };
            commit(
                root.path(),
                &asset,
                bytes,
                tempfile::NamedTempFile::new_in(root.path()).unwrap(),
            )
            .unwrap();
        }
        let sources = sources_for(root.path(), &p).unwrap();
        assert_eq!(sources.len(), 3);
        assert!(sources[0].contains("default-galleries:v1"));
        assert!(sources[0].contains("\"thumbnail\""));
        assert!(!sources[0].contains("thumbnailAsset"));
        assert!(sources[0].len() < MAX_SCRIPT);
        assert_eq!(sources[1].as_bytes(), main);
        assert!(sources[2].contains("verified-plugin-modules:v1"));
        std::fs::write(path(root.path(), &p.assets()[0]), b"corrupted").unwrap();
        assert!(sources_for(root.path(), &p).is_err());
    }
    #[test]
    fn directory_boundaries_and_non_directory_parents_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        assert!(verify_parents(root.path(), &root.path().join("../escape.js"), true).is_err());
        std::fs::write(root.path().join("plugins"), b"not a directory").unwrap();
        let p = fixture_package(b"script");
        assert!(read_asset(root.path(), &p).is_err());
        assert!(
            commit(
                root.path(),
                &p,
                b"script",
                tempfile::NamedTempFile::new_in(root.path()).unwrap()
            )
            .is_err()
        );
    }
    async fn http_fixture(bytes: Vec<u8>, delay_tail: bool) -> reqwest::Response {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            let (mut client, _) = server.accept().unwrap();
            let mut request = [0u8; 2048];
            let _ = client.read(&mut request);
            write!(
                client,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                bytes.len()
            )
            .unwrap();
            if delay_tail {
                let _ = client.write_all(&bytes[..1]);
                std::thread::sleep(Duration::from_millis(100));
                let _ = client.write_all(&bytes[1..]);
            } else {
                let _ = client.write_all(&bytes);
            }
        });
        reqwest::Client::new()
            .get(format!("http://{address}/fixture"))
            .send()
            .await
            .unwrap()
    }
    #[tokio::test]
    async fn http_body_is_verified_before_atomic_commit() {
        let bytes = b"first party module";
        let p = fixture_package(bytes);
        let root = tempfile::tempdir().unwrap();
        let response = http_fixture(bytes.to_vec(), false).await;
        receive(&p, response, root.path()).await.unwrap();
        assert_eq!(std::fs::read(test_path(root.path(), &p)).unwrap(), bytes);
    }
    #[tokio::test]
    async fn corrupt_and_oversized_streams_leave_no_package() {
        let p = fixture_package(b"expected script");
        for bytes in [b"tampered script".to_vec(), vec![b'x'; p.size + 100]] {
            let root = tempfile::tempdir().unwrap();
            assert!(
                receive(&p, http_fixture(bytes, false).await, root.path())
                    .await
                    .is_err()
            );
            assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
        }
    }
    #[tokio::test]
    async fn cancelling_a_stream_removes_its_staging_file() {
        let bytes = vec![b'x'; 1024];
        let p = fixture_package(&bytes);
        let root = tempfile::tempdir().unwrap();
        let response = http_fixture(bytes, true).await;
        tokio::select! {_ = tokio::time::sleep(Duration::from_millis(10))=>{},result=receive(&p,response,root.path())=>panic!("stream should still be pending: {result:?}")};
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
    }
    #[test]
    fn damaged_cache_is_repaired_only_after_new_bytes_verify() {
        let bytes = b"good script";
        let p = fixture_package(bytes);
        let root = tempfile::tempdir().unwrap();
        std::fs::write(test_path(root.path(), &p), b"bad").unwrap();
        commit(
            root.path(),
            &p,
            bytes,
            tempfile::NamedTempFile::new_in(root.path()).unwrap(),
        )
        .unwrap();
        assert_eq!(std::fs::read(test_path(root.path(), &p)).unwrap(), bytes);
    }
}
