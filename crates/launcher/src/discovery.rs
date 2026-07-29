use std::collections::HashSet;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
use same_file::Handle as SameFileHandle;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[cfg(windows)]
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::fs::{File, OpenOptions};
#[cfg(windows)]
use std::io::{Read, Seek, SeekFrom, Write};
#[cfg(windows)]
use std::os::windows::fs::MetadataExt;
#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;
#[cfg(windows)]
use std::time::{Duration, Instant};
#[cfg(windows)]
use tempfile::{Builder as TempDirBuilder, TempDir};
#[cfg(windows)]
use windows_permissions::constants::{SeObjectType, SecurityInformation};
#[cfg(windows)]
use windows_permissions::{LocalBox, SecurityDescriptor};
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_FLAG_OPEN_REPARSE_POINT, FILE_GENERIC_READ, FILE_SHARE_READ, FILE_SHARE_WRITE,
    READ_CONTROL, WRITE_DAC,
};

use crate::process_guard::trusted_powershell;

#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("Codex Desktop was not found")]
    CodexNotFound,
    #[error("the discovered Codex executable is invalid")]
    InvalidExecutable,
    #[error("the Codex App Server executable was not found")]
    AppServerNotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum ChannelPreference {
    Any,
    Stable,
    Beta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexInstallation {
    pub executable: PathBuf,
    pub version: String,
    pub channel: String,
    pub source: DiscoverySource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_server: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiscoverySource {
    Explicit,
    WindowsPackageManager,
    UserInstall,
    Path,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppServerSourceKind {
    ExplicitDevelopmentOverride,
    PackagedOfficial,
}

/// A read-only description of where an App Server would come from.
///
/// Source discovery is intentionally separate from launch preparation so the
/// `diagnose` command never copies or materializes executable content.
#[derive(Debug, Clone)]
pub struct AppServerSource {
    executable: PathBuf,
    kind: AppServerSourceKind,
}

impl AppServerSource {
    #[must_use]
    pub fn kind(&self) -> AppServerSourceKind {
        self.kind
    }
}

/// The executable path prepared for one App Server process lifetime.
///
/// For an official package source, `_stage` owns the open executable and
/// directory handles plus the transient directory. The App Server read loop
/// retains this value through actual child stdout EOF, preventing replacement
/// or adjacent-file creation for the complete child lifetime.
#[derive(Debug)]
pub struct AppServerLaunch {
    executable: PathBuf,
    #[cfg(windows)]
    _stage: Option<StagedAppServer>,
}

impl AppServerLaunch {
    #[must_use]
    pub fn executable(&self) -> &Path {
        &self.executable
    }

    #[must_use]
    pub fn hardened_working_directory(&self) -> Option<&Path> {
        #[cfg(windows)]
        {
            self._stage.as_ref()?.directory.as_ref().map(TempDir::path)
        }
        #[cfg(not(windows))]
        {
            None
        }
    }

    #[must_use]
    pub fn sanitized_path(&self) -> Option<&std::ffi::OsStr> {
        #[cfg(windows)]
        {
            self._stage
                .as_ref()
                .map(|stage| stage.trusted_path.as_os_str())
        }
        #[cfg(not(windows))]
        {
            None
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct StagedAppServer {
    executable_handle: Option<File>,
    executable_acl_handle: Option<File>,
    directory_handle: Option<File>,
    ancestry_handles: Vec<File>,
    directory: Option<TempDir>,
    trusted_path: std::ffi::OsString,
}

#[cfg(windows)]
impl Drop for StagedAppServer {
    fn drop(&mut self) {
        // Release the image lock, restore deletion rights through the retained
        // ACL handle on partial-stage failures, then release the locked parent
        // before asking TempDir to remove the tree.
        self.executable_handle.take();
        if let Some(handle) = self.executable_acl_handle.as_mut() {
            let _ = set_protected_dacl(handle, "D:P(A;;FA;;;AU)(A;;FA;;;SY)(A;;FA;;;BA)");
        }
        self.executable_acl_handle.take();
        self.directory_handle.take();
        if let Some(directory) = self.directory.take() {
            let _ = directory.close();
        }
        self.ancestry_handles.clear();
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PackageRecord {
    name: String,
    version: String,
    install_location: String,
    publisher: String,
    package_family_name: String,
}

pub fn discover_codex(
    explicit: Option<&Path>,
    explicit_version: Option<&str>,
    preference: ChannelPreference,
) -> Result<CodexInstallation, DiscoveryError> {
    if let Some(executable) = explicit {
        let executable = canonical_executable(executable)?;
        return Ok(CodexInstallation {
            executable,
            version: explicit_version.unwrap_or("unknown").to_owned(),
            channel: "custom".to_owned(),
            source: DiscoverySource::Explicit,
            package_name: None,
            app_server: None,
        });
    }

    let mut packages = discover_windows_packages();
    packages.retain(|package| channel_matches(&package.channel, preference));
    packages.sort_by(|left, right| {
        channel_rank(&left.channel, preference)
            .cmp(&channel_rank(&right.channel, preference))
            .then_with(|| version_key(&right.version).cmp(&version_key(&left.version)))
    });
    if let Some(package) = packages.into_iter().next() {
        return Ok(package);
    }

    discover_user_install(preference).ok_or(DiscoveryError::CodexNotFound)
}

fn discover_windows_packages() -> Vec<CodexInstallation> {
    #[cfg(not(windows))]
    {
        Vec::new()
    }
    #[cfg(windows)]
    {
        const SCRIPT: &str = r#"[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-AppxPackage | Where-Object { $_.Name -like 'OpenAI.Codex*' } | Select-Object Name,Version,InstallLocation,Publisher,PackageFamilyName) | ConvertTo-Json -Compress"#;
        let Some(powershell) = trusted_powershell() else {
            return Vec::new();
        };
        let output = Command::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                SCRIPT,
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let Ok(output) = output else {
            return Vec::new();
        };
        if !output.status.success() || output.stdout.len() > 1024 * 1024 {
            return Vec::new();
        }
        let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
            return Vec::new();
        };
        let records: Vec<PackageRecord> = match value {
            serde_json::Value::Array(values) => values
                .into_iter()
                .filter_map(|value| serde_json::from_value(value).ok())
                .collect(),
            value @ serde_json::Value::Object(_) => {
                serde_json::from_value(value).into_iter().collect()
            }
            _ => Vec::new(),
        };
        records
            .into_iter()
            .filter_map(package_installation)
            .collect()
    }
}

#[cfg(windows)]
fn package_installation(record: PackageRecord) -> Option<CodexInstallation> {
    const OFFICIAL_PUBLISHER: &str = "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B";
    const OFFICIAL_FAMILY_SUFFIX: &str = "_2p2nqsd0c76g0";
    if !matches!(record.name.as_str(), "OpenAI.Codex" | "OpenAI.CodexBeta")
        || record.publisher != OFFICIAL_PUBLISHER
        || !record.package_family_name.ends_with(OFFICIAL_FAMILY_SUFFIX)
    {
        return None;
    }
    let root = dunce::canonicalize(&record.install_location).ok()?;
    if !root.is_dir() {
        return None;
    }
    let executable = find_gui_executable(&root)?;
    let app_server = contained_file(&root, &root.join("resources").join("codex.exe"))
        .or_else(|| contained_file(&root, &root.join("app").join("resources").join("codex.exe")));
    let channel = if record.name.to_ascii_lowercase().contains("beta") {
        "beta"
    } else {
        "stable"
    };
    Some(CodexInstallation {
        executable,
        version: record.version,
        channel: channel.to_owned(),
        source: DiscoverySource::WindowsPackageManager,
        package_name: Some(record.name),
        app_server,
    })
}

#[cfg(windows)]
fn find_gui_executable(root: &Path) -> Option<PathBuf> {
    let known = [
        root.join("app").join("ChatGPT.exe"),
        root.join("app").join("ChatGPT (Beta).exe"),
        root.join("app").join("Codex.exe"),
        root.join("ChatGPT.exe"),
        root.join("ChatGPT (Beta).exe"),
        root.join("Codex.exe"),
    ];
    for candidate in known {
        if let Some(candidate) = contained_file(root, &candidate) {
            return Some(candidate);
        }
    }

    // Package layouts may rename the branded executable. Only inspect one
    // bounded directory level, never follow links, and only accept known names.
    let app = root.join("app");
    let entries = std::fs::read_dir(app).ok()?;
    for item in entries.take(128).flatten() {
        let name = item.file_name().to_string_lossy().to_ascii_lowercase();
        if (name.starts_with("chatgpt") || name.starts_with("codex")) && name.ends_with(".exe") {
            if let Some(candidate) = contained_file(root, &item.path()) {
                return Some(candidate);
            }
        }
    }
    None
}

fn contained_file(root: &Path, candidate: &Path) -> Option<PathBuf> {
    let candidate = dunce::canonicalize(candidate).ok()?;
    if candidate.is_file() && path_starts_with(&candidate, root) {
        Some(candidate)
    } else {
        None
    }
}

fn canonical_executable(path: &Path) -> Result<PathBuf, DiscoveryError> {
    let canonical = dunce::canonicalize(path).map_err(|_| DiscoveryError::InvalidExecutable)?;
    if !canonical.is_file() {
        return Err(DiscoveryError::InvalidExecutable);
    }
    Ok(canonical)
}

fn discover_user_install(preference: ChannelPreference) -> Option<CodexInstallation> {
    let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let mut candidates = Vec::new();
    if let Some(local) = local {
        candidates.extend([
            (local.join("Programs/Codex/Codex.exe"), "stable"),
            (local.join("Programs/ChatGPT/ChatGPT.exe"), "stable"),
            (local.join("Programs/Codex Beta/Codex.exe"), "beta"),
        ]);
    }
    candidates.sort_by_key(|(_, channel)| channel_rank(channel, preference));
    for (candidate, channel) in candidates {
        if channel_matches(channel, preference) && candidate.is_file() {
            if let Ok(executable) = canonical_executable(&candidate) {
                return Some(CodexInstallation {
                    executable,
                    version: "unknown".to_owned(),
                    channel: channel.to_owned(),
                    source: DiscoverySource::UserInstall,
                    package_name: None,
                    app_server: None,
                });
            }
        }
    }

    // A PATH hit has no trustworthy channel metadata. An explicit Stable or
    // Beta request must never silently attach debugging flags to an unrelated
    // binary named Codex.exe.
    if preference != ChannelPreference::Any {
        return None;
    }
    find_on_path(&["Codex.exe", "ChatGPT.exe"]).map(|executable| CodexInstallation {
        executable,
        version: "unknown".to_owned(),
        channel: "custom".to_owned(),
        source: DiscoverySource::Path,
        package_name: None,
        app_server: None,
    })
}

pub fn discover_app_server_source(
    explicit: Option<&Path>,
    installation: Option<&CodexInstallation>,
) -> Result<AppServerSource, DiscoveryError> {
    if let Some(explicit) = explicit {
        let executable =
            canonical_executable(explicit).map_err(|_| DiscoveryError::AppServerNotFound)?;
        return Ok(AppServerSource {
            executable,
            kind: AppServerSourceKind::ExplicitDevelopmentOverride,
        });
    }

    let Some(installation) = installation
        .filter(|installation| installation.source == DiscoverySource::WindowsPackageManager)
    else {
        // User installs and PATH binaries have no package/publisher anchor. A
        // caller can still authorize a development binary with --app-server.
        return Err(DiscoveryError::AppServerNotFound);
    };
    let executable = installation
        .app_server
        .as_deref()
        .ok_or(DiscoveryError::AppServerNotFound)
        .and_then(|path| {
            canonical_executable(path).map_err(|_| DiscoveryError::AppServerNotFound)
        })?;

    #[cfg(windows)]
    if !is_windows_apps_anchor(&executable) {
        return Err(DiscoveryError::AppServerNotFound);
    }
    #[cfg(not(windows))]
    return Err(DiscoveryError::AppServerNotFound);

    #[cfg(windows)]
    Ok(AppServerSource {
        executable,
        kind: AppServerSourceKind::PackagedOfficial,
    })
}

pub fn prepare_app_server_launch(
    source: AppServerSource,
) -> Result<AppServerLaunch, DiscoveryError> {
    match source.kind {
        AppServerSourceKind::ExplicitDevelopmentOverride => Ok(AppServerLaunch {
            executable: source.executable,
            #[cfg(windows)]
            _stage: None,
        }),
        AppServerSourceKind::PackagedOfficial => {
            #[cfg(windows)]
            {
                stage_packaged_app_server(&source.executable)
            }
            #[cfg(not(windows))]
            {
                Err(DiscoveryError::AppServerNotFound)
            }
        }
    }
}

#[cfg(windows)]
fn is_windows_apps_anchor(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case("WindowsApps")
    }) && path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("codex.exe"))
}

#[cfg(windows)]
fn trusted_windows_path() -> Result<std::ffi::OsString, DiscoveryError> {
    use known_folders::{KnownFolder, get_known_folder_path};

    let windows = get_known_folder_path(KnownFolder::Windows)
        .and_then(|path| dunce::canonicalize(path).ok())
        .filter(|path| path.is_dir())
        .ok_or(DiscoveryError::AppServerNotFound)?;
    let system = get_known_folder_path(KnownFolder::System)
        .and_then(|path| dunce::canonicalize(path).ok())
        .filter(|path| path.is_dir() && path_starts_with(path, &windows))
        .ok_or(DiscoveryError::AppServerNotFound)?;
    let mut directories = vec![system];
    if let Some(system_x86) = get_known_folder_path(KnownFolder::SystemX86)
        .and_then(|path| dunce::canonicalize(path).ok())
        .filter(|path| path.is_dir() && path_starts_with(path, &windows))
    {
        if !directories.contains(&system_x86) {
            directories.push(system_x86);
        }
    }
    directories.push(windows);
    env::join_paths(directories).map_err(|_| DiscoveryError::AppServerNotFound)
}

#[cfg(windows)]
const STAGE_ROOT_NAME: &str = "code-codex-app-server";
#[cfg(windows)]
const STAGE_DIRECTORY_PREFIX: &str = "stage-";
#[cfg(windows)]
const MAX_STALE_STAGE_SCAN: usize = 32;

#[cfg(windows)]
fn open_stage_root() -> Result<(PathBuf, File, Vec<File>), DiscoveryError> {
    let temp =
        dunce::canonicalize(env::temp_dir()).map_err(|_| DiscoveryError::AppServerNotFound)?;
    let requested = temp.join(STAGE_ROOT_NAME);
    std::fs::create_dir_all(&requested).map_err(|_| DiscoveryError::AppServerNotFound)?;
    let root = dunce::canonicalize(&requested).map_err(|_| DiscoveryError::AppServerNotFound)?;
    if !root.is_dir()
        || !path_starts_with(&root, &temp)
        || root.file_name().and_then(|name| name.to_str()) != Some(STAGE_ROOT_NAME)
        || is_reparse_point(&root)?
    {
        return Err(DiscoveryError::AppServerNotFound);
    }

    // Retain a no-follow, no-delete-share handle for every canonical path
    // component. Locking only the fresh leaf would still allow an ancestor
    // rename to redirect the absolute CreateProcess path.
    let ancestry_handles = open_locked_directory_ancestry(&root)?;
    let retained_root = ancestry_handles
        .last()
        .ok_or(DiscoveryError::AppServerNotFound)?;
    let verified_root = open_locked_directory_nofollow(&root, false)?;
    if !same_file_identity(retained_root, &verified_root)? {
        return Err(DiscoveryError::AppServerNotFound);
    }

    // An unshared lock serializes bounded stale reclamation with creation
    // across launcher processes. It is held until the new stage is fully
    // locked and verified, then released so another active stage may coexist.
    let lock = acquire_stage_lock(&root)?;
    reclaim_stale_stages(&root);
    Ok((root, lock, ancestry_handles))
}

#[cfg(windows)]
fn acquire_stage_lock(root: &Path) -> Result<File, DiscoveryError> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        match try_open_stage_lock(root) {
            Ok(lock) => return Ok(lock),
            Err(error)
                if matches!(error.raw_os_error(), Some(32 | 33)) && Instant::now() < deadline =>
            {
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => return Err(DiscoveryError::AppServerNotFound),
        }
    }
}

#[cfg(windows)]
fn try_open_stage_lock(root: &Path) -> std::io::Result<File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(root.join("stage.lock"))
}

#[cfg(windows)]
fn reclaim_stale_stages(root: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.take(MAX_STALE_STAGE_SCAN).flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if !valid_stage_directory_name(name) {
            continue;
        }
        let path = entry.path();
        if !validated_stale_stage(&path) {
            continue;
        }
        // Active stages reject removal through their retained file/directory
        // sharing handles. A crash releases those handles, and the recoverable
        // DACL deliberately retains DELETE/DELETE_CHILD for this bounded pass.
        let _ = std::fs::remove_dir_all(path);
    }
}

#[cfg(windows)]
fn valid_stage_directory_name(name: &str) -> bool {
    name.len() > STAGE_DIRECTORY_PREFIX.len()
        && name.len() <= 96
        && name.starts_with(STAGE_DIRECTORY_PREFIX)
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(windows)]
fn validated_stale_stage(path: &Path) -> bool {
    if !path.is_dir() || is_reparse_point(path).unwrap_or(true) {
        return false;
    }
    let Ok(mut entries) = std::fs::read_dir(path) else {
        return false;
    };
    let Some(entry) = entries.next() else {
        return true;
    };
    let Ok(entry) = entry else {
        return false;
    };
    if entries.next().is_some()
        || !entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("codex.exe")
    {
        return false;
    }
    let Ok(file_type) = entry.file_type() else {
        return false;
    };
    file_type.is_file()
        && !file_type.is_symlink()
        && !is_reparse_point(&entry.path()).unwrap_or(true)
}

#[cfg(windows)]
fn is_reparse_point(path: &Path) -> Result<bool, DiscoveryError> {
    let metadata =
        std::fs::symlink_metadata(path).map_err(|_| DiscoveryError::AppServerNotFound)?;
    Ok(metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
}

#[cfg(windows)]
fn open_locked_directory_ancestry(path: &Path) -> Result<Vec<File>, DiscoveryError> {
    if !path.is_absolute() {
        return Err(DiscoveryError::AppServerNotFound);
    }
    let mut ancestors: Vec<_> = path
        .ancestors()
        .filter(|ancestor| ancestor.is_absolute())
        .collect();
    ancestors.reverse();
    if ancestors.last().copied() != Some(path) {
        return Err(DiscoveryError::AppServerNotFound);
    }
    ancestors
        .into_iter()
        .map(|ancestor| open_locked_directory_nofollow(ancestor, false))
        .collect()
}

#[cfg(windows)]
fn open_locked_directory_nofollow(path: &Path, write_dac: bool) -> Result<File, DiscoveryError> {
    let mut options = OpenOptions::new();
    options.read(true);
    if write_dac {
        options.access_mode(FILE_GENERIC_READ | WRITE_DAC);
    }
    let opened = options
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let metadata = opened
        .metadata()
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let attributes = metadata.file_attributes();
    if attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 || attributes & FILE_ATTRIBUTE_DIRECTORY == 0
    {
        return Err(DiscoveryError::AppServerNotFound);
    }
    Ok(opened)
}

#[cfg(windows)]
fn bind_locked_stage_directory(path: &Path, write_dac: bool) -> Result<File, DiscoveryError> {
    bind_locked_stage_directory_with(path, write_dac, || {})
}

#[cfg(windows)]
fn bind_locked_stage_directory_with(
    path: &Path,
    write_dac: bool,
    after_binding: impl FnOnce(),
) -> Result<File, DiscoveryError> {
    let retained = open_locked_directory_nofollow(path, write_dac)?;
    after_binding();
    let verified = open_locked_directory_nofollow(path, false)?;
    if !same_file_identity(&retained, &verified)? {
        return Err(DiscoveryError::AppServerNotFound);
    }
    Ok(retained)
}

#[cfg(windows)]
fn same_file_identity(left: &File, right: &File) -> Result<bool, DiscoveryError> {
    let left = SameFileHandle::from_file(
        left.try_clone()
            .map_err(|_| DiscoveryError::AppServerNotFound)?,
    )
    .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let right = SameFileHandle::from_file(
        right
            .try_clone()
            .map_err(|_| DiscoveryError::AppServerNotFound)?,
    )
    .map_err(|_| DiscoveryError::AppServerNotFound)?;
    Ok(left == right)
}

#[cfg(windows)]
fn stage_packaged_app_server(official: &Path) -> Result<AppServerLaunch, DiscoveryError> {
    let official = canonical_executable(official).map_err(|_| DiscoveryError::AppServerNotFound)?;
    let mut official_handle = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .open(&official)
        .map_err(|_| DiscoveryError::AppServerNotFound)?;

    let (stage_root, _stage_root_lock, ancestry_handles) = open_stage_root()?;
    let directory = TempDirBuilder::new()
        .prefix(STAGE_DIRECTORY_PREFIX)
        .tempdir_in(stage_root)
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let executable = directory.path().join("codex.exe");

    // Lock the still-empty parent before creating anything by path. A parent
    // swap before this point cannot detach a verified child because no child
    // exists yet; after this handle opens, delete sharing is denied.
    let mut directory_handle = bind_locked_stage_directory(directory.path(), true)?;

    // Create the sole child with a non-replaceable writable handle. Applying
    // the directory DACL immediately afterward closes child creation, and the
    // bounded enumeration fails closed if anything won the short interval.
    let mut executable_handle = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .share_mode(FILE_SHARE_READ)
        .open(&executable)
        .map_err(|_| DiscoveryError::AppServerNotFound)?;

    let mut executable_acl_handle = OpenOptions::new()
        .read(true)
        .access_mode(READ_CONTROL | WRITE_DAC)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .open(&executable)
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    deny_staged_executable_mutation(&mut executable_acl_handle)?;
    deny_stage_child_creation(&mut directory_handle)?;
    ensure_stage_contains_only_executable(directory.path(), &executable)?;

    let mut stage = StagedAppServer {
        executable_handle: None,
        executable_acl_handle: Some(executable_acl_handle),
        directory_handle: Some(directory_handle),
        ancestry_handles,
        directory: Some(directory),
        trusted_path: trusted_windows_path()?,
    };

    let mut official_hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = official_handle
            .read(&mut buffer)
            .map_err(|_| DiscoveryError::AppServerNotFound)?;
        if read == 0 {
            break;
        }
        official_hasher.update(&buffer[..read]);
        executable_handle
            .write_all(&buffer[..read])
            .map_err(|_| DiscoveryError::AppServerNotFound)?;
    }
    executable_handle
        .sync_all()
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let official_digest: [u8; 32] = official_hasher.finalize().into();

    // The locked file DACL protects the deliberate handle transition. The
    // final retained handle is read-only with read-only sharing, which is
    // compatible with CreateProcess and denies later write/delete opens.
    drop(executable_handle);
    let mut spawn_path_handle = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&executable)
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let spawn_metadata = spawn_path_handle
        .metadata()
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    if spawn_metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || spawn_metadata.file_attributes() & FILE_ATTRIBUTE_DIRECTORY != 0
    {
        return Err(DiscoveryError::AppServerNotFound);
    }

    // The read-only/share-read handle now supplies live immutability. Restore
    // a normally deletable file DACL immediately so a launcher crash cannot
    // strand a large executable; the parent handle/DACL still blocks adjacent
    // files and the retained file handle still blocks write/delete opens.
    if let Some(handle) = stage.executable_acl_handle.as_mut() {
        set_protected_dacl(handle, "D:P(A;;FA;;;AU)(A;;FA;;;SY)(A;;FA;;;BA)")?;
    }
    stage.executable_acl_handle.take();

    // Reopen through the exact path passed to CreateProcess, then verify using
    // that retained handle. A pre-lock parent substitution therefore cannot
    // redirect spawn to bytes other than the official open anchor.
    spawn_path_handle
        .seek(SeekFrom::Start(0))
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let staged_digest = sha256_reader(&mut spawn_path_handle)?;
    if staged_digest != official_digest {
        return Err(DiscoveryError::AppServerNotFound);
    }
    stage.executable_handle = Some(spawn_path_handle);

    // The locked directory intentionally has no adjacent DLLs and cannot gain
    // an `<exe>.local` redirect while the process lives. The launch command
    // also uses this directory as CWD and limits PATH to Known Folder API
    // Windows/system directories, so OS imports resolve through
    // KnownDLLs/system locations rather than user-writable search locations.
    Ok(AppServerLaunch {
        executable,
        _stage: Some(stage),
    })
}

#[cfg(windows)]
fn deny_stage_child_creation(directory_handle: &mut File) -> Result<(), DiscoveryError> {
    // Deny add-file/add-directory plus DACL/owner mutation to Everyone and to
    // Owner Rights. The latter removes the owner's otherwise implicit
    // WRITE_DAC bypass. Authenticated users retain the remaining rights, while
    // the retained no-delete-share handle blocks parent deletion and rename.
    set_protected_dacl(
        directory_handle,
        "D:P(D;;0x000C0006;;;WD)(D;;0x000C0006;;;OW)(A;;FA;;;AU)(A;;FA;;;SY)(A;;FA;;;BA)",
    )
}

#[cfg(windows)]
fn deny_staged_executable_mutation(executable_acl_handle: &mut File) -> Result<(), DiscoveryError> {
    // Deny data/attribute writes, delete, WRITE_DAC, and WRITE_OWNER before
    // closing the writable copy handle. OWNER RIGHTS prevents an owner-token
    // DACL rewrite during the transition to the read-only spawn handle.
    set_protected_dacl(
        executable_acl_handle,
        "D:P(D;;0x000D0116;;;WD)(D;;0x000D0116;;;OW)(A;;FRFX;;;AU)(A;;FRFX;;;SY)(A;;FRFX;;;BA)",
    )
}

#[cfg(windows)]
fn set_protected_dacl(handle: &mut File, sddl: &str) -> Result<(), DiscoveryError> {
    let descriptor: LocalBox<SecurityDescriptor> = sddl
        .parse()
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    let dacl = descriptor.dacl().ok_or(DiscoveryError::AppServerNotFound)?;
    windows_permissions::wrappers::SetSecurityInfo(
        handle,
        SeObjectType::SE_FILE_OBJECT,
        SecurityInformation::Dacl | SecurityInformation::ProtectedDacl,
        None,
        None,
        Some(dacl),
        None,
    )
    .map_err(|_| DiscoveryError::AppServerNotFound)
}

#[cfg(windows)]
fn ensure_stage_contains_only_executable(
    directory: &Path,
    executable: &Path,
) -> Result<(), DiscoveryError> {
    let mut entries =
        std::fs::read_dir(directory).map_err(|_| DiscoveryError::AppServerNotFound)?;
    let entry = entries
        .next()
        .transpose()
        .map_err(|_| DiscoveryError::AppServerNotFound)?
        .ok_or(DiscoveryError::AppServerNotFound)?;
    if entry.path() != executable || entries.next().is_some() {
        return Err(DiscoveryError::AppServerNotFound);
    }
    let file_type = entry
        .file_type()
        .map_err(|_| DiscoveryError::AppServerNotFound)?;
    if !file_type.is_file() || file_type.is_symlink() {
        return Err(DiscoveryError::AppServerNotFound);
    }
    Ok(())
}

#[cfg(windows)]
fn sha256_reader(reader: &mut File) -> Result<[u8; 32], DiscoveryError> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| DiscoveryError::AppServerNotFound)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().into())
}

fn find_on_path(names: &[&str]) -> Option<PathBuf> {
    let mut visited = HashSet::new();
    for directory in env::split_paths(&env::var_os("PATH")?) {
        let Ok(directory) = dunce::canonicalize(directory) else {
            continue;
        };
        if !visited.insert(directory.clone()) {
            continue;
        }
        for name in names {
            let candidate = directory.join(name);
            if let Ok(executable) = canonical_executable(&candidate) {
                return Some(executable);
            }
        }
    }
    None
}

fn channel_matches(channel: &str, preference: ChannelPreference) -> bool {
    match preference {
        ChannelPreference::Any => true,
        ChannelPreference::Stable => channel == "stable",
        ChannelPreference::Beta => channel == "beta",
    }
}

fn channel_rank(channel: &str, preference: ChannelPreference) -> u8 {
    match (preference, channel) {
        (ChannelPreference::Stable, "stable") | (ChannelPreference::Beta, "beta") => 0,
        (ChannelPreference::Any, "stable") => 0,
        (ChannelPreference::Any, "beta") => 1,
        _ => 2,
    }
}

fn version_key(version: &str) -> [u32; 4] {
    let mut key = [0; 4];
    for (slot, component) in key.iter_mut().zip(version.split('.')) {
        *slot = component.parse().unwrap_or(0);
    }
    key
}

fn path_starts_with(candidate: &Path, root: &Path) -> bool {
    #[cfg(windows)]
    {
        let candidate: Vec<_> = candidate
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
            .collect();
        let root: Vec<_> = root
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
            .collect();
        candidate.starts_with(&root)
    }
    #[cfg(not(windows))]
    {
        candidate.starts_with(root)
    }
}

#[must_use]
pub fn is_supported_version(_version: &str) -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compatibility_allows_all_versions() {
        assert!(is_supported_version("26.715.10079.0"));
        assert!(is_supported_version("26.715.3651.0"));
        assert!(is_supported_version("26.721.4979.0"));
        assert!(is_supported_version("26.715.4045.0"));
        assert!(is_supported_version("26.715.9999.0"));
        assert!(is_supported_version("unknown"));
    }

    #[test]
    fn verified_stable_is_preferred_when_channel_is_any() {
        assert!(
            channel_rank("stable", ChannelPreference::Any)
                < channel_rank("beta", ChannelPreference::Any)
        );
        assert!(channel_matches("stable", ChannelPreference::Stable));
        assert!(!channel_matches("beta", ChannelPreference::Stable));
        assert!(channel_matches("beta", ChannelPreference::Beta));
        assert!(!channel_matches("stable", ChannelPreference::Beta));
        assert!(version_key("26.715.10000.0") > version_key("26.715.9999.0"));
    }

    #[test]
    fn explicit_channels_do_not_match_unknown_path_channels() {
        assert!(!channel_matches("custom", ChannelPreference::Stable));
        assert!(!channel_matches("custom", ChannelPreference::Beta));
        assert!(channel_matches("custom", ChannelPreference::Any));
    }

    #[test]
    fn explicit_app_server_override_remains_available_for_development() {
        let directory = tempfile::TempDir::new().expect("temp dir");
        let explicit = directory.path().join("development-app-server.exe");
        std::fs::write(&explicit, b"development override").expect("explicit executable");

        let source =
            discover_app_server_source(Some(&explicit), None).expect("explicit override source");
        assert_eq!(
            source.kind(),
            AppServerSourceKind::ExplicitDevelopmentOverride
        );
        assert_eq!(
            source.executable,
            dunce::canonicalize(&explicit).expect("canonical explicit executable")
        );

        let resolved = prepare_app_server_launch(source).expect("explicit launch");
        assert_eq!(
            resolved.executable(),
            dunce::canonicalize(&explicit)
                .expect("canonical explicit executable")
                .as_path()
        );
    }

    #[test]
    fn unanchored_app_server_is_not_implicitly_trusted() {
        let directory = tempfile::TempDir::new().expect("temp dir");
        let executable = directory.path().join("codex.exe");
        std::fs::write(&executable, b"unanchored").expect("test executable");
        let installation = CodexInstallation {
            executable: executable.clone(),
            version: "test".to_owned(),
            channel: "custom".to_owned(),
            source: DiscoverySource::UserInstall,
            package_name: None,
            app_server: Some(executable),
        };

        assert!(discover_app_server_source(None, Some(&installation)).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn packaged_source_discovery_does_not_materialize_a_copy() {
        let directory = tempfile::TempDir::new().expect("temp dir");
        let official_directory = directory.path().join("WindowsApps").join("official");
        std::fs::create_dir_all(&official_directory).expect("official directory");
        let official = official_directory.join("codex.exe");
        std::fs::write(&official, b"official app server").expect("official executable");
        let installation = CodexInstallation {
            executable: official.clone(),
            version: "test".to_owned(),
            channel: "beta".to_owned(),
            source: DiscoverySource::WindowsPackageManager,
            package_name: Some("OpenAI.CodexBeta".to_owned()),
            app_server: Some(official.clone()),
        };

        let source = discover_app_server_source(None, Some(&installation)).expect("source");
        assert_eq!(source.kind(), AppServerSourceKind::PackagedOfficial);
        assert_eq!(
            source.executable,
            dunce::canonicalize(&official).expect("canonical official")
        );
        assert_eq!(
            std::fs::read_dir(&official_directory)
                .expect("read official directory")
                .count(),
            1
        );
    }

    #[cfg(windows)]
    #[test]
    fn staged_bytes_are_identical_and_paths_are_unique_then_cleaned() {
        let source_directory = tempfile::TempDir::new().expect("source temp dir");
        let official = source_directory.path().join("codex.exe");
        let bytes: Vec<u8> = (0_u32..200_000)
            .map(|index| ((index.wrapping_mul(31) + 17) % 251) as u8)
            .collect();
        std::fs::write(&official, &bytes).expect("official executable");

        let first = stage_packaged_app_server(&official).expect("first stage");
        let second = stage_packaged_app_server(&official).expect("second stage");
        assert_eq!(
            std::fs::read(first.executable()).expect("staged bytes"),
            bytes
        );
        assert_ne!(first.executable(), second.executable());
        assert_ne!(first.executable().parent(), second.executable().parent());

        let first_directory = first
            .executable()
            .parent()
            .expect("stage parent")
            .to_path_buf();
        let second_directory = second
            .executable()
            .parent()
            .expect("stage parent")
            .to_path_buf();
        drop(first);
        drop(second);
        assert!(!first_directory.exists());
        assert!(!second_directory.exists());
    }

    #[cfg(windows)]
    #[test]
    fn staged_guard_denies_write_rename_replace_and_adjacent_files() {
        let source_directory = tempfile::TempDir::new().expect("source temp dir");
        let official = source_directory.path().join("codex.exe");
        std::fs::write(&official, b"official app server").expect("official executable");
        let launch = stage_packaged_app_server(&official).expect("stage");
        let executable = launch.executable().to_path_buf();
        let stage_directory = executable.parent().expect("stage parent").to_path_buf();
        assert_eq!(
            launch.hardened_working_directory(),
            Some(stage_directory.as_path())
        );
        let trusted_path: Vec<_> = env::split_paths(
            launch
                .sanitized_path()
                .expect("packaged launch path policy"),
        )
        .collect();
        assert!(trusted_path.len() >= 2);
        assert!(
            trusted_path
                .iter()
                .all(|path| path.is_absolute() && path.is_dir())
        );
        assert!(!trusted_path.contains(&source_directory.path().to_path_buf()));

        assert!(OpenOptions::new().write(true).open(&executable).is_err());
        assert!(std::fs::rename(&executable, stage_directory.join("renamed.exe")).is_err());
        assert!(std::fs::remove_file(&executable).is_err());
        assert!(
            std::fs::rename(&stage_directory, stage_directory.with_extension("renamed")).is_err()
        );

        assert!(
            OpenOptions::new()
                .read(true)
                .access_mode(READ_CONTROL | WRITE_DAC)
                .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
                .open(&stage_directory)
                .is_err()
        );

        let replacement = source_directory.path().join("replacement.exe");
        std::fs::write(&replacement, b"replacement").expect("replacement");
        assert!(std::fs::rename(&replacement, &executable).is_err());
        assert!(std::fs::copy(&replacement, &executable).is_err());

        assert!(
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(stage_directory.join("version.dll"))
                .is_err()
        );
        assert!(std::fs::create_dir(stage_directory.join("codex.exe.local")).is_err());
        assert_eq!(
            std::fs::read_dir(&stage_directory)
                .expect("read locked stage")
                .count(),
            1
        );
    }

    #[cfg(windows)]
    #[test]
    fn nofollow_stage_binding_rejects_a_junction() {
        let root = tempfile::TempDir::new().expect("root");
        let target = root.path().join("attacker-target");
        let junction_path = root.path().join("stage-junction_1");
        std::fs::create_dir(&target).expect("target");
        std::fs::write(target.join("marker.txt"), b"attacker").expect("marker");
        junction::create(&target, &junction_path).expect("create junction");

        assert!(open_locked_directory_nofollow(&junction_path, true).is_err());
        assert!(!target.join("codex.exe").exists());
        assert_eq!(
            std::fs::read(target.join("marker.txt")).expect("marker survives"),
            b"attacker"
        );

        junction::delete(&junction_path).expect("delete junction");
    }

    #[cfg(windows)]
    #[test]
    fn retained_stage_binding_blocks_or_rejects_junction_substitution() {
        use std::cell::Cell;

        let root = tempfile::TempDir::new().expect("root");
        let stage = root.path().join("stage-bound_1");
        let displaced = root.path().join("displaced");
        let target = root.path().join("attacker-target");
        std::fs::create_dir(&stage).expect("stage");
        std::fs::create_dir(&target).expect("target");
        let swapped = Cell::new(false);

        let result = bind_locked_stage_directory_with(&stage, true, || {
            if std::fs::rename(&stage, &displaced).is_ok() {
                junction::create(&target, &stage).expect("replacement junction");
                swapped.set(true);
            }
        });

        if swapped.get() {
            assert!(result.is_err());
            junction::delete(&stage).expect("delete replacement junction");
            std::fs::remove_dir(&displaced).expect("remove displaced stage");
        } else {
            assert!(result.is_ok());
            assert!(!displaced.exists());
        }
    }

    #[cfg(windows)]
    #[test]
    fn retained_ancestry_blocks_parent_rename() {
        let root = tempfile::TempDir::new().expect("root");
        let first = root.path().join("first");
        let leaf = first.join("second");
        let moved = root.path().join("moved");
        std::fs::create_dir_all(&leaf).expect("path ancestry");
        let handles = open_locked_directory_ancestry(&leaf).expect("locked ancestry");

        assert!(std::fs::rename(&first, &moved).is_err());
        drop(handles);
        std::fs::rename(&first, &moved).expect("rename after ancestry release");
    }

    #[cfg(windows)]
    #[test]
    fn stale_stage_is_user_deletable_after_all_handles_close() {
        let source_directory = tempfile::TempDir::new().expect("source temp dir");
        let official = source_directory.path().join("codex.exe");
        std::fs::write(&official, b"official app server").expect("official executable");
        let mut launch = stage_packaged_app_server(&official).expect("stage");
        let mut stage = launch._stage.take().expect("staged guard");
        stage.executable_handle.take();
        stage.executable_acl_handle.take();
        stage.directory_handle.take();
        let stale = stage.directory.take().expect("stage directory").keep();
        drop(stage);
        drop(launch);

        std::fs::remove_dir_all(&stale).expect("stale stage remains deletable");
        assert!(!stale.exists());
    }

    #[cfg(windows)]
    #[test]
    fn transition_dacl_is_deletable_after_crash_style_handle_loss() {
        let root = tempfile::TempDir::new().expect("root");
        let stage_directory = root.path().join("stage-transition_1");
        std::fs::create_dir(&stage_directory).expect("stage directory");
        let executable = stage_directory.join("codex.exe");
        let executable_handle = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .share_mode(FILE_SHARE_READ)
            .open(&executable)
            .expect("create executable");
        let mut executable_acl_handle = OpenOptions::new()
            .read(true)
            .access_mode(READ_CONTROL | WRITE_DAC)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&executable)
            .expect("executable ACL handle");
        let mut directory_handle = OpenOptions::new()
            .access_mode(FILE_GENERIC_READ | WRITE_DAC)
            .share_mode(FILE_SHARE_READ)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(&stage_directory)
            .expect("directory handle");
        deny_staged_executable_mutation(&mut executable_acl_handle).expect("file DACL");
        deny_stage_child_creation(&mut directory_handle).expect("directory DACL");

        // Simulate process-handle loss without running Drop's ACL restoration.
        drop(executable_handle);
        drop(executable_acl_handle);
        drop(directory_handle);
        std::fs::remove_dir_all(&stage_directory)
            .expect("parent DELETE_CHILD keeps crash cleanup recoverable");
        assert!(!stage_directory.exists());
    }

    #[cfg(windows)]
    #[test]
    fn stale_reclamation_is_bounded_to_validated_stage_payloads() {
        let root = tempfile::TempDir::new().expect("root");
        let empty = root.path().join("stage-empty_1");
        let executable_only = root.path().join("stage-executable_1");
        let unexpected = root.path().join("stage-unexpected_1");
        let unrelated = root.path().join("unrelated");
        std::fs::create_dir(&empty).expect("empty");
        std::fs::create_dir(&executable_only).expect("executable stage");
        std::fs::write(executable_only.join("codex.exe"), b"stale").expect("stale executable");
        std::fs::create_dir(&unexpected).expect("unexpected stage");
        std::fs::write(unexpected.join("other.txt"), b"do not delete").expect("unexpected file");
        std::fs::create_dir(&unrelated).expect("unrelated");

        reclaim_stale_stages(root.path());

        assert!(!empty.exists());
        assert!(!executable_only.exists());
        assert!(unexpected.exists());
        assert!(unrelated.exists());
    }

    #[cfg(windows)]
    #[test]
    fn stage_lock_serializes_creators() {
        let root = tempfile::TempDir::new().expect("root");
        let first = try_open_stage_lock(root.path()).expect("first lock");
        assert!(try_open_stage_lock(root.path()).is_err());
        drop(first);
        assert!(try_open_stage_lock(root.path()).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn stale_reclamation_has_a_strict_scan_bound() {
        let root = tempfile::TempDir::new().expect("root");
        for index in 0..(MAX_STALE_STAGE_SCAN + 5) {
            std::fs::create_dir(root.path().join(format!("stage-bounded_{index}")))
                .expect("stage directory");
        }

        reclaim_stale_stages(root.path());

        let remaining = std::fs::read_dir(root.path())
            .expect("remaining stages")
            .count();
        assert!(remaining >= 5);
    }
}
