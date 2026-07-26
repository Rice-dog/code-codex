//! Audited integration of Codex Live Explorer with the user's existing Codex shortcut.
//!
//! The installer invokes this console binary. It deliberately owns only the desktop
//! `Codex.lnk` and legacy shortcuts that can be tied back to this installation root.

use std::fs::{self, OpenOptions};
use std::io::{self, Write as _};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[cfg(windows)]
use std::env;
#[cfg(windows)]
use std::process::{Command, Stdio};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[cfg(windows)]
use std::os::windows::fs::MetadataExt as _;
#[cfg(windows)]
use std::os::windows::process::CommandExt as _;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

const CODEX_PACKAGE_NAME: &str = "OpenAI.Codex";
const CODEX_PACKAGE_FAMILY: &str = "OpenAI.Codex_2p2nqsd0c76g0";
const CODEX_APPLICATION_ID: &str = "App";
const CODEX_AUMID: &str = "OpenAI.Codex_2p2nqsd0c76g0!App";
const SHORTCUT_NAME: &str = "Codex.lnk";
const LEGACY_SHORTCUT_NAME: &str = "Codex Live Explorer.lnk";
const LAUNCHER_NAME: &str = "CodexLiveExplorer.exe";
const DEFAULT_ICON_NAME: &str = "Codex.ico";
const INTEGRATION_DIRECTORY: &str = "integration";
const BACKUP_NAME: &str = "Codex.original.lnk";
const MANIFEST_NAME: &str = "shortcut-manifest.json";
const INSTALL_ROLLBACK_NAME: &str = "install-rollback.json";
const MANIFEST_SCHEMA: u32 = 1;
const INSTALL_ROLLBACK_SCHEMA: u32 = 1;
const MANIFEST_OWNER: &str = "codex-live-explorer";
const OWNER_MARKER: &str = "Managed by Codex Live Explorer (codex-live-explorer/v1)";
const LEGACY_DESCRIPTION: &str = "Launch Codex Desktop with Live Explorer file preview and editing";

#[derive(Debug, Parser)]
#[command(
    name = "codex-live-explorer-shortcut",
    version,
    about = "Safely integrate Codex Live Explorer with the desktop Codex shortcut"
)]
struct Cli {
    /// Desktop directory override for isolated installer tests.
    #[arg(
        long,
        global = true,
        env = "CODEX_LIVE_EXPLORER_DESKTOP",
        value_name = "DIRECTORY"
    )]
    desktop: Option<PathBuf>,
    /// Start Menu Programs directory override for isolated installer tests.
    #[arg(
        long,
        global = true,
        env = "CODEX_LIVE_EXPLORER_START_MENU",
        value_name = "DIRECTORY"
    )]
    start_menu: Option<PathBuf>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Validate Stable Codex and shortcut ownership without changing anything.
    Preflight {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
        #[arg(long, value_name = "VERSION")]
        version: String,
    },
    /// Capture shortcut integration before an MSI install transaction.
    PrepareInstall {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
    },
    /// Restore the state captured by prepare-install after MSI rollback.
    RollbackInstall {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
    },
    /// Discard the state captured by prepare-install after MSI commit.
    CommitInstall {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
    },
    /// Back up the official AppX shortcut and replace it with the Live Explorer launcher.
    Install {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
        #[arg(long, value_name = "VERSION")]
        version: String,
        /// Defer obsolete shortcut cleanup until commit-install (used by MSI).
        #[arg(long)]
        preserve_legacy: bool,
        /// Stable icon file under the installation root (defaults to Codex.ico).
        #[arg(long, value_name = "FILE")]
        icon: Option<PathBuf>,
    },
    /// Restore the byte-for-byte official shortcut when the current link is still ours.
    Restore {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
    },
    /// Print the current integration state as JSON without changing it.
    Status {
        #[arg(long, value_name = "DIRECTORY")]
        install_root: PathBuf,
    },
}

#[derive(Debug, Error)]
enum IntegrationError {
    #[cfg(not(windows))]
    #[error("this shortcut integration tool is supported only on Windows")]
    UnsupportedPlatform,
    #[error("{0}")]
    InvalidArgument(String),
    #[error("required path is missing or has an unsafe type: {0}")]
    UnsafePath(PathBuf),
    #[error("the official desktop Codex shortcut was not found: {0}")]
    ShortcutMissing(PathBuf),
    #[error("the desktop Codex shortcut is not the official stable Codex AppX link")]
    InvalidOfficialShortcut,
    #[error(
        "the desktop Codex shortcut was changed by another application or the user; it was not overwritten"
    )]
    ShortcutConflict,
    #[error("shortcut integration state is incomplete or inconsistent: {0}")]
    InvalidState(String),
    #[error("the original Codex shortcut backup is missing or corrupt; no shortcut was changed")]
    BackupCorrupt,
    #[error("Windows Shell shortcut operation failed: {0}")]
    Shell(String),
    #[error("official stable Codex icon discovery failed: {0}")]
    OfficialIcon(String),
    #[error("could not read or write {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("could not encode or decode the shortcut manifest: {0}")]
    Manifest(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
struct IntegrationPaths {
    install_root: PathBuf,
    desktop: PathBuf,
    start_menu: Option<PathBuf>,
    shortcut: PathBuf,
    launcher: PathBuf,
    default_icon: PathBuf,
    state_directory: PathBuf,
    backup: PathBuf,
    manifest: PathBuf,
    install_rollback: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ShortcutManifest {
    schema_version: u32,
    owner: String,
    installed_version: String,
    shortcut_path: PathBuf,
    backup_path: PathBuf,
    original_sha256: String,
    original_aumid: String,
    launcher_path: PathBuf,
    icon_path: PathBuf,
    owner_marker: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutMetadata {
    #[serde(default)]
    target: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    target_parsing_path: String,
    #[serde(default)]
    icon_location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodedSnapshotFile {
    sha256: String,
    bytes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallRollbackSnapshot {
    schema_version: u32,
    owner: String,
    install_root: PathBuf,
    shortcut_path: PathBuf,
    prior_state: IntegrationState,
    shortcut: EncodedSnapshotFile,
    manifest: Option<EncodedSnapshotFile>,
    backup: Option<EncodedSnapshotFile>,
    icon: Option<EncodedSnapshotFile>,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPackageIconReport {
    name: String,
    package_family_name: String,
    application_id: String,
    install_location: PathBuf,
    assets: Vec<PathBuf>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum IntegrationState {
    Managed,
    Official,
    Unconfigured,
    Missing,
    Conflict,
}

#[derive(Debug, Clone, Copy)]
enum ReplacementGuard {
    Owned,
    Official,
    Missing,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationReport {
    action: &'static str,
    state: IntegrationState,
    shortcut_path: PathBuf,
    backup_path: PathBuf,
    manifest_path: PathBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    installed_version: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    removed_legacy_shortcuts: Vec<PathBuf>,
}

trait ShortcutShell {
    fn inspect(&self, path: &Path) -> Result<ShortcutMetadata, IntegrationError>;
    fn create(
        &self,
        path: &Path,
        target: &Path,
        working_directory: &Path,
        icon: &Path,
        description: &str,
    ) -> Result<(), IntegrationError>;
    fn replace_file(&self, staged: &Path, destination: &Path) -> Result<(), IntegrationError>;
    fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError>;
}

fn main() -> ExitCode {
    match execute() {
        Ok(report) => match serde_json::to_string_pretty(&report) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("codex-live-explorer-shortcut: {error}");
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("codex-live-explorer-shortcut: {error}");
            ExitCode::FAILURE
        }
    }
}

fn execute() -> Result<OperationReport, IntegrationError> {
    let cli = Cli::parse();
    let (install_root, action) = match &cli.command {
        Commands::Preflight { install_root, .. }
        | Commands::PrepareInstall { install_root }
        | Commands::RollbackInstall { install_root }
        | Commands::CommitInstall { install_root }
        | Commands::Install { install_root, .. }
        | Commands::Restore { install_root }
        | Commands::Status { install_root } => (install_root, &cli.command),
    };
    let paths = if matches!(action, Commands::Preflight { .. }) {
        IntegrationPaths::resolve_with_options(
            install_root,
            cli.desktop.as_deref(),
            cli.start_menu.as_deref(),
            true,
        )?
    } else {
        IntegrationPaths::resolve(
            install_root,
            cli.desktop.as_deref(),
            cli.start_menu.as_deref(),
        )?
    };
    let shell = PlatformShortcutShell::new()?;

    match action {
        Commands::Preflight { version, .. } => preflight(&shell, &paths, version),
        Commands::PrepareInstall { .. } => prepare_install(&shell, &paths),
        Commands::RollbackInstall { .. } => rollback_install(&shell, &paths),
        Commands::CommitInstall { .. } => commit_install(&shell, &paths),
        Commands::Install {
            version,
            preserve_legacy,
            icon,
            ..
        } => {
            install_with_legacy_cleanup(&shell, &paths, version, icon.as_deref(), !preserve_legacy)
        }
        Commands::Restore { .. } => restore(&shell, &paths),
        Commands::Status { .. } => status(&shell, &paths),
    }
}

impl IntegrationPaths {
    fn resolve(
        install_root: &Path,
        desktop_override: Option<&Path>,
        start_menu_override: Option<&Path>,
    ) -> Result<Self, IntegrationError> {
        Self::resolve_with_options(install_root, desktop_override, start_menu_override, false)
    }

    fn resolve_with_options(
        install_root: &Path,
        desktop_override: Option<&Path>,
        start_menu_override: Option<&Path>,
        allow_missing_install_root: bool,
    ) -> Result<Self, IntegrationError> {
        let install_root = if allow_missing_install_root {
            canonical_safe_directory_or_missing(install_root)?
        } else {
            canonical_safe_directory(install_root)?
        };
        let desktop = match desktop_override {
            Some(path) => canonical_safe_directory(path)?,
            None => canonical_safe_directory(&resolve_desktop()?)?,
        };
        let start_menu = match start_menu_override {
            Some(path) => Some(canonical_safe_directory(path)?),
            None => resolve_start_menu().and_then(|path| canonical_safe_directory(&path).ok()),
        };
        let state_directory = install_root.join(INTEGRATION_DIRECTORY);

        Ok(Self {
            shortcut: desktop.join(SHORTCUT_NAME),
            launcher: install_root.join(LAUNCHER_NAME),
            default_icon: install_root.join(DEFAULT_ICON_NAME),
            backup: state_directory.join(BACKUP_NAME),
            manifest: state_directory.join(MANIFEST_NAME),
            install_rollback: state_directory.join(INSTALL_ROLLBACK_NAME),
            install_root,
            desktop,
            start_menu,
            state_directory,
        })
    }
}

fn preflight(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    version: &str,
) -> Result<OperationReport, IntegrationError> {
    validate_version(version)?;
    build_multi_image_ico(shell.official_icon_pngs()?)?;

    let current = inspect_optional(shell, &paths.shortcut)?;
    let manifest = read_manifest_optional(&paths.manifest)?;
    if manifest.is_none() && paths.backup.exists() {
        return Err(IntegrationError::InvalidState(
            "an original shortcut backup exists without a manifest".to_owned(),
        ));
    }
    let (state, installed_version) = match (manifest.as_ref(), current.as_ref()) {
        (Some(manifest), Some(metadata)) if is_owned(metadata, paths) => {
            validate_manifest(manifest, paths)?;
            validate_backup(shell, paths, manifest)?;
            ensure_safe_regular_file(&paths.launcher)?;
            (
                IntegrationState::Managed,
                Some(manifest.installed_version.clone()),
            )
        }
        (None, Some(metadata)) if is_official(metadata) => (IntegrationState::Official, None),
        (_, None) => return Err(IntegrationError::ShortcutMissing(paths.shortcut.clone())),
        _ => return Err(IntegrationError::ShortcutConflict),
    };

    Ok(OperationReport {
        action: "preflight",
        state,
        shortcut_path: paths.shortcut.clone(),
        backup_path: paths.backup.clone(),
        manifest_path: paths.manifest.clone(),
        installed_version,
        removed_legacy_shortcuts: Vec::new(),
    })
}

fn prepare_install(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<OperationReport, IntegrationError> {
    if paths.install_rollback.exists() {
        reconcile_stale_install_snapshot(shell, paths)?;
    }

    let current = inspect_optional(shell, &paths.shortcut)?
        .ok_or_else(|| IntegrationError::ShortcutMissing(paths.shortcut.clone()))?;
    let manifest = read_manifest_optional(&paths.manifest)?;
    if manifest.is_none() && paths.backup.exists() {
        return Err(IntegrationError::InvalidState(
            "an original shortcut backup exists without a manifest".to_owned(),
        ));
    }
    let (prior_state, installed_version) = match manifest.as_ref() {
        Some(manifest) if is_owned(&current, paths) => {
            validate_manifest(manifest, paths)?;
            validate_backup(shell, paths, manifest)?;
            (
                IntegrationState::Managed,
                Some(manifest.installed_version.clone()),
            )
        }
        None if is_official(&current) => (IntegrationState::Official, None),
        _ => return Err(IntegrationError::ShortcutConflict),
    };

    let shortcut = encode_snapshot_file(read_file(&paths.shortcut)?);
    let manifest_file = encode_optional_regular_file(&paths.manifest)?;
    let backup = encode_optional_regular_file(&paths.backup)?;
    let icon = encode_optional_regular_file(&paths.default_icon)?;
    ensure_safe_directory(&paths.state_directory, true)?;
    let snapshot = InstallRollbackSnapshot {
        schema_version: INSTALL_ROLLBACK_SCHEMA,
        owner: MANIFEST_OWNER.to_owned(),
        install_root: paths.install_root.clone(),
        shortcut_path: paths.shortcut.clone(),
        prior_state,
        shortcut,
        manifest: manifest_file,
        backup,
        icon,
    };
    write_json_atomic(shell, &paths.install_rollback, &snapshot)?;

    Ok(OperationReport {
        action: "prepare-install",
        state: prior_state,
        shortcut_path: paths.shortcut.clone(),
        backup_path: paths.backup.clone(),
        manifest_path: paths.manifest.clone(),
        installed_version,
        removed_legacy_shortcuts: Vec::new(),
    })
}

fn rollback_install(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<OperationReport, IntegrationError> {
    let snapshot = read_install_snapshot(paths)?;
    let shortcut_bytes = decode_snapshot_file(&snapshot.shortcut)?;
    let manifest_bytes = snapshot
        .manifest
        .as_ref()
        .map(decode_snapshot_file)
        .transpose()?;
    let backup_bytes = snapshot
        .backup
        .as_ref()
        .map(decode_snapshot_file)
        .transpose()?;
    let icon_bytes = snapshot
        .icon
        .as_ref()
        .map(decode_snapshot_file)
        .transpose()?;

    let installed_version = validate_install_snapshot(
        paths,
        &snapshot,
        manifest_bytes.as_deref(),
        backup_bytes.as_deref(),
    )?;
    let current = inspect_optional(shell, &paths.shortcut)?;
    let already_restored =
        sha256_file(&paths.shortcut).ok().as_deref() == Some(snapshot.shortcut.sha256.as_str());
    if !already_restored
        && !current
            .as_ref()
            .is_some_and(|metadata| is_owned(metadata, paths))
    {
        return Err(IntegrationError::ShortcutConflict);
    }

    match snapshot.prior_state {
        IntegrationState::Managed => {
            write_atomic_bytes(
                shell,
                &paths.backup,
                backup_bytes
                    .as_deref()
                    .ok_or_else(|| invalid_install_snapshot("managed backup is missing"))?,
                "Codex.original.rollback",
                "lnk",
            )?;
            restore_optional_file(
                shell,
                &paths.default_icon,
                icon_bytes.as_deref(),
                "Codex",
                "ico",
            )?;
            write_atomic_bytes(
                shell,
                &paths.manifest,
                manifest_bytes
                    .as_deref()
                    .ok_or_else(|| invalid_install_snapshot("managed manifest is missing"))?,
                "shortcut-manifest.rollback",
                "json",
            )?;
            if !already_restored {
                write_atomic_bytes(
                    shell,
                    &paths.shortcut,
                    &shortcut_bytes,
                    "Codex.rollback",
                    "lnk",
                )?;
            }
            verify_rollback_shortcut(shell, paths, &snapshot)?;
        }
        IntegrationState::Official => {
            if !already_restored {
                write_atomic_bytes(
                    shell,
                    &paths.shortcut,
                    &shortcut_bytes,
                    "Codex.rollback",
                    "lnk",
                )?;
            }
            verify_rollback_shortcut(shell, paths, &snapshot)?;
            remove_safe_regular_file_if_present(&paths.manifest)?;
            remove_safe_regular_file_if_present(&paths.backup)?;
            restore_optional_file(
                shell,
                &paths.default_icon,
                icon_bytes.as_deref(),
                "Codex",
                "ico",
            )?;
        }
        _ => return Err(invalid_install_snapshot("unsupported prior state")),
    }

    remove_safe_regular_file_if_present(&paths.install_rollback)?;
    remove_state_directory_if_empty(paths)?;
    Ok(OperationReport {
        action: "rollback-install",
        state: snapshot.prior_state,
        shortcut_path: paths.shortcut.clone(),
        backup_path: paths.backup.clone(),
        manifest_path: paths.manifest.clone(),
        installed_version,
        removed_legacy_shortcuts: Vec::new(),
    })
}

fn commit_install(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<OperationReport, IntegrationError> {
    let mut report = status(shell, paths)?;
    if paths.install_rollback.exists() {
        if report.state != IntegrationState::Managed {
            return Err(IntegrationError::InvalidState(
                "cannot commit an install rollback snapshot before shortcut installation succeeds"
                    .to_owned(),
            ));
        }
        let snapshot = read_install_snapshot(paths)?;
        let manifest_bytes = snapshot
            .manifest
            .as_ref()
            .map(decode_snapshot_file)
            .transpose()?;
        let backup_bytes = snapshot
            .backup
            .as_ref()
            .map(decode_snapshot_file)
            .transpose()?;
        validate_install_snapshot(
            paths,
            &snapshot,
            manifest_bytes.as_deref(),
            backup_bytes.as_deref(),
        )?;
        remove_safe_regular_file_if_present(&paths.install_rollback)?;
        remove_state_directory_if_empty(paths)?;
        report.removed_legacy_shortcuts = remove_verified_legacy_shortcuts(shell, paths)?;
    }
    report.action = "commit-install";
    Ok(report)
}

#[cfg(test)]
fn install(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    version: &str,
    icon_override: Option<&Path>,
) -> Result<OperationReport, IntegrationError> {
    install_with_legacy_cleanup(shell, paths, version, icon_override, true)
}

fn install_with_legacy_cleanup(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    version: &str,
    icon_override: Option<&Path>,
    cleanup_legacy: bool,
) -> Result<OperationReport, IntegrationError> {
    validate_version(version)?;
    ensure_safe_regular_file(&paths.launcher)?;
    ensure_safe_directory(&paths.state_directory, true)?;
    let icon = match icon_override {
        Some(path) => {
            let path = if path.is_absolute() {
                path.to_path_buf()
            } else {
                paths.install_root.join(path)
            };
            canonical_safe_file_under(&path, &paths.install_root)?
        }
        None => {
            refresh_stable_icon(shell, paths)?;
            canonical_safe_file_under(&paths.default_icon, &paths.install_root)?
        }
    };

    let current = inspect_optional(shell, &paths.shortcut)?;
    let existing_manifest = read_manifest_optional(&paths.manifest)?;
    let mut fresh_manifest = None;
    let mut manifest = match existing_manifest {
        Some(manifest) => {
            validate_manifest(&manifest, paths)?;
            validate_backup(shell, paths, &manifest)?;
            manifest
        }
        None if paths.backup.exists() => recover_manifest(shell, paths, version, &icon)?,
        None => {
            let metadata = current
                .as_ref()
                .ok_or_else(|| IntegrationError::ShortcutMissing(paths.shortcut.clone()))?;
            if !is_official(metadata) {
                return Err(IntegrationError::InvalidOfficialShortcut);
            }
            let original_sha256 = sha256_file(&paths.shortcut)?;
            create_original_backup(paths)?;
            let manifest = new_manifest(paths, version, &icon, original_sha256);
            fresh_manifest = Some(manifest.clone());
            if let Err(error) = validate_backup(shell, paths, &manifest) {
                let _ = cleanup_failed_fresh_install(shell, paths, &manifest);
                return Err(error);
            }
            if let Err(error) = write_manifest(shell, &paths.manifest, &manifest) {
                let _ = cleanup_failed_fresh_install(shell, paths, &manifest);
                return Err(error);
            }
            manifest
        }
    };

    let replacement_guard = match current.as_ref() {
        Some(metadata) if is_owned(metadata, paths) => ReplacementGuard::Owned,
        Some(metadata) if is_official(metadata) => ReplacementGuard::Official,
        None if paths.backup.is_file() => ReplacementGuard::Missing,
        _ => return Err(IntegrationError::ShortcutConflict),
    };

    let staged = staged_path(&paths.desktop, "Codex", "lnk");
    let result = (|| {
        manifest.installed_version = version.to_owned();
        manifest.icon_path = icon.clone();
        write_manifest(shell, &paths.manifest, &manifest)?;

        shell.create(
            &staged,
            &paths.launcher,
            &paths.install_root,
            &icon,
            OWNER_MARKER,
        )?;
        let staged_metadata = shell.inspect(&staged)?;
        if !is_owned(&staged_metadata, paths) {
            return Err(IntegrationError::Shell(
                "the staged shortcut did not retain its ownership metadata".to_owned(),
            ));
        }
        verify_replacement_guard(shell, paths, replacement_guard, &manifest.original_sha256)?;
        shell.replace_file(&staged, &paths.shortcut)?;

        let removed_legacy_shortcuts = if cleanup_legacy {
            remove_verified_legacy_shortcuts(shell, paths)?
        } else {
            Vec::new()
        };
        Ok(OperationReport {
            action: "install",
            state: IntegrationState::Managed,
            shortcut_path: paths.shortcut.clone(),
            backup_path: paths.backup.clone(),
            manifest_path: paths.manifest.clone(),
            installed_version: Some(version.to_owned()),
            removed_legacy_shortcuts,
        })
    })();

    if result.is_err() {
        remove_if_present(&staged);
        if let Some(fresh_manifest) = fresh_manifest.as_ref() {
            let _ = cleanup_failed_fresh_install(shell, paths, fresh_manifest);
        }
    }
    result
}

fn cleanup_failed_fresh_install(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    expected_manifest: &ShortcutManifest,
) -> Result<bool, IntegrationError> {
    if !is_exact_official_shortcut(shell, paths, &expected_manifest.original_sha256) {
        return Ok(false);
    }

    let manifest_digest = match read_manifest_optional(&paths.manifest) {
        Ok(Some(manifest)) if manifest == *expected_manifest => {
            match sha256_file(&paths.manifest) {
                Ok(digest) => Some(digest),
                Err(_) => return Ok(false),
            }
        }
        Ok(None) => None,
        Ok(Some(_)) | Err(_) => return Ok(false),
    };
    if validate_backup(shell, paths, expected_manifest).is_err() {
        return Ok(false);
    }

    if !is_exact_official_shortcut(shell, paths, &expected_manifest.original_sha256) {
        return Ok(false);
    }
    if let Some(expected_digest) = manifest_digest {
        if sha256_file(&paths.manifest).ok().as_deref() != Some(expected_digest.as_str()) {
            return Ok(false);
        }
        remove_safe_regular_file_if_present(&paths.manifest)?;
    }

    // Keep the original bytes until the last possible moment. If verification becomes
    // ambiguous after the manifest is removed, the orphaned backup is recoverable.
    if !is_exact_official_shortcut(shell, paths, &expected_manifest.original_sha256)
        || validate_backup(shell, paths, expected_manifest).is_err()
    {
        return Ok(false);
    }
    remove_safe_regular_file_if_present(&paths.backup)?;
    remove_state_directory_if_empty(paths)?;
    Ok(true)
}

fn is_exact_official_shortcut(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    expected_sha256: &str,
) -> bool {
    matches!(
        inspect_optional(shell, &paths.shortcut),
        Ok(Some(metadata))
            if is_official(&metadata)
                && sha256_file(&paths.shortcut).ok().as_deref() == Some(expected_sha256)
    )
}

fn verify_replacement_guard(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    guard: ReplacementGuard,
    original_sha256: &str,
) -> Result<(), IntegrationError> {
    let current = inspect_optional(shell, &paths.shortcut)?;
    let unchanged = match (guard, current.as_ref()) {
        (ReplacementGuard::Owned, Some(metadata)) => is_owned(metadata, paths),
        (ReplacementGuard::Official, Some(metadata)) => {
            is_official(metadata)
                && sha256_file(&paths.shortcut).ok().as_deref() == Some(original_sha256)
        }
        (ReplacementGuard::Missing, None) => true,
        _ => false,
    };
    if unchanged {
        Ok(())
    } else {
        Err(IntegrationError::ShortcutConflict)
    }
}

fn restore(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<OperationReport, IntegrationError> {
    let Some(manifest) = read_manifest_optional(&paths.manifest)? else {
        if paths.backup.exists() {
            return Err(IntegrationError::InvalidState(
                "an original shortcut backup exists without a manifest".to_owned(),
            ));
        }
        let state = match inspect_optional(shell, &paths.shortcut)?.as_ref() {
            Some(metadata) if is_official(metadata) => IntegrationState::Official,
            Some(_) => return Err(IntegrationError::ShortcutConflict),
            None => return Err(IntegrationError::ShortcutMissing(paths.shortcut.clone())),
        };
        return Ok(OperationReport {
            action: "restore",
            state,
            shortcut_path: paths.shortcut.clone(),
            backup_path: paths.backup.clone(),
            manifest_path: paths.manifest.clone(),
            installed_version: None,
            removed_legacy_shortcuts: Vec::new(),
        });
    };
    validate_manifest(&manifest, paths)?;
    validate_backup(shell, paths, &manifest)?;

    let current = inspect_optional(shell, &paths.shortcut)?;
    let state = match current.as_ref() {
        Some(metadata) if is_owned(metadata, paths) => {
            let staged = staged_path(&paths.desktop, "Codex.restore", "lnk");
            copy_file_exclusive(&paths.backup, &staged)?;
            if let Err(error) = shell.replace_file(&staged, &paths.shortcut) {
                remove_if_present(&staged);
                return Err(error);
            }
            let restored = shell
                .inspect(&paths.shortcut)
                .map_err(|_| IntegrationError::BackupCorrupt)?;
            if !is_official(&restored) || sha256_file(&paths.shortcut)? != manifest.original_sha256
            {
                return Err(IntegrationError::BackupCorrupt);
            }
            IntegrationState::Official
        }
        Some(metadata) if is_official(metadata) => IntegrationState::Official,
        Some(_) | None => return Err(IntegrationError::ShortcutConflict),
    };

    if state == IntegrationState::Official {
        remove_integration_state(paths)?;
    }

    Ok(OperationReport {
        action: "restore",
        state,
        shortcut_path: paths.shortcut.clone(),
        backup_path: paths.backup.clone(),
        manifest_path: paths.manifest.clone(),
        installed_version: Some(manifest.installed_version),
        removed_legacy_shortcuts: Vec::new(),
    })
}

fn remove_integration_state(paths: &IntegrationPaths) -> Result<(), IntegrationError> {
    for path in [&paths.manifest, &paths.backup] {
        fs::remove_file(path).map_err(|source| io_error(path, source))?;
    }
    match fs::remove_dir(&paths.state_directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::DirectoryNotEmpty => Ok(()),
        Err(error) => Err(io_error(&paths.state_directory, error)),
    }
}

fn status(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<OperationReport, IntegrationError> {
    let manifest = read_manifest_optional(&paths.manifest)?;
    if manifest.is_none() && paths.backup.exists() {
        return Err(IntegrationError::InvalidState(
            "an original shortcut backup exists without a manifest".to_owned(),
        ));
    }
    if let Some(manifest) = manifest.as_ref() {
        validate_manifest(manifest, paths)?;
        validate_backup(shell, paths, manifest)?;
    }

    let current = inspect_optional(shell, &paths.shortcut)?;
    let state = match (manifest.as_ref(), current.as_ref()) {
        (Some(_), Some(metadata)) if is_owned(metadata, paths) => IntegrationState::Managed,
        (_, Some(metadata)) if is_official(metadata) => IntegrationState::Official,
        (None, None) => IntegrationState::Unconfigured,
        (Some(_), None) => IntegrationState::Missing,
        _ => IntegrationState::Conflict,
    };

    Ok(OperationReport {
        action: "status",
        state,
        shortcut_path: paths.shortcut.clone(),
        backup_path: paths.backup.clone(),
        manifest_path: paths.manifest.clone(),
        installed_version: manifest.map(|value| value.installed_version),
        removed_legacy_shortcuts: Vec::new(),
    })
}

fn recover_manifest(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    version: &str,
    icon: &Path,
) -> Result<ShortcutManifest, IntegrationError> {
    let metadata = shell
        .inspect(&paths.backup)
        .map_err(|_| IntegrationError::BackupCorrupt)?;
    if !is_official(&metadata) {
        return Err(IntegrationError::BackupCorrupt);
    }
    let manifest = new_manifest(paths, version, icon, sha256_file(&paths.backup)?);
    write_manifest(shell, &paths.manifest, &manifest)?;
    Ok(manifest)
}

fn new_manifest(
    paths: &IntegrationPaths,
    version: &str,
    icon: &Path,
    original_sha256: String,
) -> ShortcutManifest {
    ShortcutManifest {
        schema_version: MANIFEST_SCHEMA,
        owner: MANIFEST_OWNER.to_owned(),
        installed_version: version.to_owned(),
        shortcut_path: paths.shortcut.clone(),
        backup_path: paths.backup.clone(),
        original_sha256,
        original_aumid: CODEX_AUMID.to_owned(),
        launcher_path: paths.launcher.clone(),
        icon_path: icon.to_path_buf(),
        owner_marker: OWNER_MARKER.to_owned(),
    }
}

fn validate_manifest(
    manifest: &ShortcutManifest,
    paths: &IntegrationPaths,
) -> Result<(), IntegrationError> {
    let icon_is_stable = manifest.icon_path.is_absolute()
        && path_starts_with(&manifest.icon_path, &paths.install_root);
    if manifest.schema_version != MANIFEST_SCHEMA
        || manifest.owner != MANIFEST_OWNER
        || manifest.original_aumid != CODEX_AUMID
        || manifest.owner_marker != OWNER_MARKER
        || !paths_equal(&manifest.shortcut_path, &paths.shortcut)
        || !paths_equal(&manifest.backup_path, &paths.backup)
        || !paths_equal(&manifest.launcher_path, &paths.launcher)
        || !icon_is_stable
        || manifest.original_sha256.len() != 64
    {
        return Err(IntegrationError::InvalidState(
            "manifest ownership or path fields do not match this installation".to_owned(),
        ));
    }
    Ok(())
}

fn validate_backup(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    manifest: &ShortcutManifest,
) -> Result<(), IntegrationError> {
    ensure_safe_regular_file(&paths.backup).map_err(|_| IntegrationError::BackupCorrupt)?;
    let digest = sha256_file(&paths.backup).map_err(|_| IntegrationError::BackupCorrupt)?;
    if digest != manifest.original_sha256 {
        return Err(IntegrationError::BackupCorrupt);
    }
    let metadata = shell
        .inspect(&paths.backup)
        .map_err(|_| IntegrationError::BackupCorrupt)?;
    if metadata.target_parsing_path != manifest.original_aumid || !is_official(&metadata) {
        return Err(IntegrationError::BackupCorrupt);
    }
    Ok(())
}

fn create_original_backup(paths: &IntegrationPaths) -> Result<(), IntegrationError> {
    ensure_safe_regular_file(&paths.shortcut)?;
    let bytes = read_file(&paths.shortcut)?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".Codex.original.")
        .suffix(".lnk")
        .tempfile_in(&paths.state_directory)
        .map_err(|source| io_error(&paths.state_directory, source))?;
    temporary
        .write_all(&bytes)
        .map_err(|source| io_error(temporary.path(), source))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|source| io_error(temporary.path(), source))?;
    temporary
        .persist_noclobber(&paths.backup)
        .map_err(|error| io_error(&paths.backup, error.error))?;
    Ok(())
}

fn write_manifest(
    shell: &impl ShortcutShell,
    path: &Path,
    manifest: &ShortcutManifest,
) -> Result<(), IntegrationError> {
    write_json_atomic(shell, path, manifest)
}

fn write_json_atomic(
    shell: &impl ShortcutShell,
    path: &Path,
    value: &impl Serialize,
) -> Result<(), IntegrationError> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write_atomic_bytes(shell, path, &bytes, "shortcut-state", "json")
}

fn write_atomic_bytes(
    shell: &impl ShortcutShell,
    path: &Path,
    bytes: &[u8],
    prefix: &str,
    extension: &str,
) -> Result<(), IntegrationError> {
    let parent = path.parent().ok_or_else(|| {
        IntegrationError::InvalidState("atomic file has no parent directory".to_owned())
    })?;
    let mut temporary = tempfile::Builder::new()
        .prefix(&format!(".{prefix}."))
        .suffix(&format!(".{extension}"))
        .tempfile_in(parent)
        .map_err(|source| io_error(parent, source))?;
    temporary
        .write_all(bytes)
        .map_err(|source| io_error(temporary.path(), source))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|source| io_error(temporary.path(), source))?;
    let staged = temporary
        .into_temp_path()
        .keep()
        .map_err(|error| io_error(path, error.error))?;
    if let Err(error) = shell.replace_file(&staged, path) {
        remove_if_present(&staged);
        return Err(error);
    }
    Ok(())
}

fn encode_snapshot_file(bytes: Vec<u8>) -> EncodedSnapshotFile {
    EncodedSnapshotFile {
        sha256: sha256_bytes(&bytes),
        bytes: BASE64.encode(bytes),
    }
}

fn encode_optional_regular_file(
    path: &Path,
) -> Result<Option<EncodedSnapshotFile>, IntegrationError> {
    match fs::symlink_metadata(path) {
        Ok(_) => {
            ensure_safe_regular_file(path)?;
            Ok(Some(encode_snapshot_file(read_file(path)?)))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(io_error(path, source)),
    }
}

fn decode_snapshot_file(file: &EncodedSnapshotFile) -> Result<Vec<u8>, IntegrationError> {
    let bytes = BASE64
        .decode(&file.bytes)
        .map_err(|_| invalid_install_snapshot("snapshot data is not valid Base64"))?;
    if file.sha256.len() != 64 || sha256_bytes(&bytes) != file.sha256 {
        return Err(invalid_install_snapshot(
            "snapshot file hash does not match",
        ));
    }
    Ok(bytes)
}

fn read_install_snapshot(
    paths: &IntegrationPaths,
) -> Result<InstallRollbackSnapshot, IntegrationError> {
    ensure_safe_regular_file(&paths.install_rollback)
        .map_err(|_| invalid_install_snapshot("snapshot file is missing or unsafe"))?;
    let bytes = read_file(&paths.install_rollback)?;
    serde_json::from_slice(&bytes).map_err(IntegrationError::from)
}

fn reconcile_stale_install_snapshot(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<(), IntegrationError> {
    let snapshot = read_install_snapshot(paths)?;
    decode_snapshot_file(&snapshot.shortcut)?;
    let manifest_bytes = snapshot
        .manifest
        .as_ref()
        .map(decode_snapshot_file)
        .transpose()?;
    let backup_bytes = snapshot
        .backup
        .as_ref()
        .map(decode_snapshot_file)
        .transpose()?;
    if let Some(icon) = snapshot.icon.as_ref() {
        decode_snapshot_file(icon)?;
    }
    validate_install_snapshot(
        paths,
        &snapshot,
        manifest_bytes.as_deref(),
        backup_bytes.as_deref(),
    )?;

    let current = inspect_optional(shell, &paths.shortcut)?;
    let manifest = read_manifest_optional(&paths.manifest)?;
    let coherent = match (manifest.as_ref(), current.as_ref()) {
        (Some(manifest), Some(metadata)) if is_owned(metadata, paths) => {
            validate_manifest(manifest, paths)?;
            validate_backup(shell, paths, manifest)?;
            ensure_safe_regular_file(&paths.launcher)?;
            true
        }
        (None, Some(metadata)) if is_official(metadata) && !paths.backup.exists() => true,
        _ => false,
    };
    if !coherent {
        return Err(IntegrationError::ShortcutConflict);
    }

    remove_safe_regular_file_if_present(&paths.install_rollback)?;
    remove_state_directory_if_empty(paths)
}

fn validate_install_snapshot(
    paths: &IntegrationPaths,
    snapshot: &InstallRollbackSnapshot,
    manifest_bytes: Option<&[u8]>,
    backup_bytes: Option<&[u8]>,
) -> Result<Option<String>, IntegrationError> {
    if snapshot.schema_version != INSTALL_ROLLBACK_SCHEMA
        || snapshot.owner != MANIFEST_OWNER
        || !paths_equal(&snapshot.install_root, &paths.install_root)
        || !paths_equal(&snapshot.shortcut_path, &paths.shortcut)
    {
        return Err(invalid_install_snapshot(
            "snapshot ownership or path fields do not match this installation",
        ));
    }
    match snapshot.prior_state {
        IntegrationState::Official => {
            if manifest_bytes.is_some() || backup_bytes.is_some() {
                return Err(invalid_install_snapshot(
                    "official state unexpectedly contains managed integration files",
                ));
            }
            Ok(None)
        }
        IntegrationState::Managed => {
            let manifest_bytes = manifest_bytes
                .ok_or_else(|| invalid_install_snapshot("managed manifest is missing"))?;
            let backup_bytes = backup_bytes
                .ok_or_else(|| invalid_install_snapshot("managed backup is missing"))?;
            let manifest: ShortcutManifest = serde_json::from_slice(manifest_bytes)?;
            validate_manifest(&manifest, paths)?;
            if sha256_bytes(backup_bytes) != manifest.original_sha256 {
                return Err(invalid_install_snapshot(
                    "managed backup does not match its manifest",
                ));
            }
            Ok(Some(manifest.installed_version))
        }
        _ => Err(invalid_install_snapshot("unsupported prior state")),
    }
}

fn invalid_install_snapshot(detail: &str) -> IntegrationError {
    IntegrationError::InvalidState(format!("install rollback snapshot is invalid: {detail}"))
}

fn verify_rollback_shortcut(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
    snapshot: &InstallRollbackSnapshot,
) -> Result<(), IntegrationError> {
    let restored = shell
        .inspect(&paths.shortcut)
        .map_err(|_| IntegrationError::ShortcutConflict)?;
    let state_matches = match snapshot.prior_state {
        IntegrationState::Managed => is_owned(&restored, paths),
        IntegrationState::Official => is_official(&restored),
        _ => false,
    };
    if !state_matches || sha256_file(&paths.shortcut)? != snapshot.shortcut.sha256 {
        return Err(IntegrationError::ShortcutConflict);
    }
    Ok(())
}

fn restore_optional_file(
    shell: &impl ShortcutShell,
    path: &Path,
    bytes: Option<&[u8]>,
    prefix: &str,
    extension: &str,
) -> Result<(), IntegrationError> {
    match bytes {
        Some(bytes) => write_atomic_bytes(shell, path, bytes, prefix, extension),
        None => remove_safe_regular_file_if_present(path),
    }
}

fn remove_safe_regular_file_if_present(path: &Path) -> Result<(), IntegrationError> {
    match fs::symlink_metadata(path) {
        Ok(_) => {
            ensure_safe_regular_file(path)?;
            fs::remove_file(path).map_err(|source| io_error(path, source))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(io_error(path, source)),
    }
}

fn remove_state_directory_if_empty(paths: &IntegrationPaths) -> Result<(), IntegrationError> {
    match fs::symlink_metadata(&paths.state_directory) {
        Ok(_) => {
            ensure_safe_directory(&paths.state_directory, false)?;
            match fs::remove_dir(&paths.state_directory) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == io::ErrorKind::DirectoryNotEmpty => Ok(()),
                Err(source) => Err(io_error(&paths.state_directory, source)),
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(io_error(&paths.state_directory, source)),
    }
}

fn refresh_stable_icon(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<(), IntegrationError> {
    match fs::symlink_metadata(&paths.default_icon) {
        Ok(_) => ensure_safe_regular_file(&paths.default_icon)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(source) => return Err(io_error(&paths.default_icon, source)),
    }
    let icon = build_multi_image_ico(shell.official_icon_pngs()?)?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".Codex.")
        .suffix(".ico")
        .tempfile_in(&paths.install_root)
        .map_err(|source| io_error(&paths.install_root, source))?;
    temporary
        .write_all(&icon)
        .map_err(|source| io_error(temporary.path(), source))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|source| io_error(temporary.path(), source))?;
    let staged = temporary
        .into_temp_path()
        .keep()
        .map_err(|error| io_error(&paths.default_icon, error.error))?;
    if let Err(error) = shell.replace_file(&staged, &paths.default_icon) {
        remove_if_present(&staged);
        return Err(error);
    }
    ensure_safe_regular_file(&paths.default_icon)
}

fn build_multi_image_ico(pngs: Vec<Vec<u8>>) -> Result<Vec<u8>, IntegrationError> {
    let mut images = pngs
        .into_iter()
        .map(|png| {
            let (width, height) = png_dimensions(&png)?;
            if width != height || !(1..=256).contains(&width) {
                return Err(IntegrationError::OfficialIcon(
                    "icon PNGs must be square and no larger than 256 pixels".to_owned(),
                ));
            }
            Ok((width, png))
        })
        .collect::<Result<Vec<_>, IntegrationError>>()?;
    images.sort_by_key(|(size, _)| *size);
    if images.len() < 2 {
        return Err(IntegrationError::OfficialIcon(
            "the stable Codex package did not provide multiple icon resolutions".to_owned(),
        ));
    }
    if images.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return Err(IntegrationError::OfficialIcon(
            "the stable Codex package provided duplicate icon resolutions".to_owned(),
        ));
    }
    let count = u16::try_from(images.len()).map_err(|_| {
        IntegrationError::OfficialIcon("too many icon resolutions were found".to_owned())
    })?;
    let directory_size = 6usize
        .checked_add(images.len().checked_mul(16).ok_or_else(|| {
            IntegrationError::OfficialIcon("icon directory is too large".to_owned())
        })?)
        .ok_or_else(|| IntegrationError::OfficialIcon("icon is too large".to_owned()))?;
    let payload_size = images.iter().try_fold(0usize, |total, (_, png)| {
        total
            .checked_add(png.len())
            .ok_or_else(|| IntegrationError::OfficialIcon("icon is too large".to_owned()))
    })?;
    let capacity = directory_size
        .checked_add(payload_size)
        .ok_or_else(|| IntegrationError::OfficialIcon("icon is too large".to_owned()))?;
    let mut ico = Vec::with_capacity(capacity);
    ico.extend_from_slice(&0u16.to_le_bytes());
    ico.extend_from_slice(&1u16.to_le_bytes());
    ico.extend_from_slice(&count.to_le_bytes());

    let mut offset = u32::try_from(directory_size)
        .map_err(|_| IntegrationError::OfficialIcon("icon is too large".to_owned()))?;
    for (size, png) in &images {
        let encoded_size = if *size == 256 {
            0
        } else {
            u8::try_from(*size)
                .map_err(|_| IntegrationError::OfficialIcon("invalid icon resolution".to_owned()))?
        };
        let png_len = u32::try_from(png.len())
            .map_err(|_| IntegrationError::OfficialIcon("icon image is too large".to_owned()))?;
        ico.extend_from_slice(&[encoded_size, encoded_size, 0, 0]);
        ico.extend_from_slice(&1u16.to_le_bytes());
        ico.extend_from_slice(&32u16.to_le_bytes());
        ico.extend_from_slice(&png_len.to_le_bytes());
        ico.extend_from_slice(&offset.to_le_bytes());
        offset = offset
            .checked_add(png_len)
            .ok_or_else(|| IntegrationError::OfficialIcon("icon is too large".to_owned()))?;
    }
    for (_, png) in images {
        ico.extend_from_slice(&png);
    }
    Ok(ico)
}

fn png_dimensions(png: &[u8]) -> Result<(u32, u32), IntegrationError> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if png.len() < 24
        || &png[..8] != PNG_SIGNATURE
        || png[8..12] != 13u32.to_be_bytes()
        || &png[12..16] != b"IHDR"
    {
        return Err(IntegrationError::OfficialIcon(
            "an icon asset is not a supported PNG".to_owned(),
        ));
    }
    let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let height = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    Ok((width, height))
}

fn icon_asset_size(name: &str) -> Option<u16> {
    const PREFIX: &str = "Square44x44Logo.targetsize-";
    const SUFFIX: &str = "_altform-unplated.png";
    let size = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    if size.is_empty() || !size.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let size = size.parse::<u16>().ok()?;
    (1..=256).contains(&size).then_some(size)
}

fn read_manifest_optional(path: &Path) -> Result<Option<ShortcutManifest>, IntegrationError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(Into::into),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(io_error(path, source)),
    }
}

fn remove_verified_legacy_shortcuts(
    shell: &impl ShortcutShell,
    paths: &IntegrationPaths,
) -> Result<Vec<PathBuf>, IntegrationError> {
    let mut candidates = vec![paths.desktop.join(LEGACY_SHORTCUT_NAME)];
    let mut legacy_start_menu_directory = None;
    if let Some(start_menu) = paths.start_menu.as_ref() {
        candidates.push(start_menu.join(LEGACY_SHORTCUT_NAME));
        let product_directory = start_menu.join("Codex Live Explorer");
        candidates.push(product_directory.join(LEGACY_SHORTCUT_NAME));
        legacy_start_menu_directory = Some(product_directory);
    }
    let mut removed = Vec::new();
    for candidate in candidates {
        let expected_digest = match sha256_file(&candidate) {
            Ok(digest) => digest,
            Err(_) => continue,
        };
        let Ok(Some(metadata)) = inspect_optional(shell, &candidate) else {
            continue;
        };
        if !is_verified_legacy(&metadata, paths) {
            continue;
        }
        if sha256_file(&candidate).ok().as_deref() != Some(expected_digest.as_str()) {
            continue;
        }
        fs::remove_file(&candidate).map_err(|source| io_error(&candidate, source))?;
        removed.push(candidate);
    }
    if let Some(directory) = legacy_start_menu_directory {
        let _ = fs::remove_dir(directory);
    }
    Ok(removed)
}

fn is_verified_legacy(metadata: &ShortcutMetadata, paths: &IntegrationPaths) -> bool {
    let target = Path::new(&metadata.target);
    target
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(LAUNCHER_NAME))
        && path_starts_with(target, &paths.install_root)
        && (metadata.description == LEGACY_DESCRIPTION || metadata.description == OWNER_MARKER)
}

fn is_official(metadata: &ShortcutMetadata) -> bool {
    metadata.target_parsing_path == CODEX_AUMID
}

fn is_owned(metadata: &ShortcutMetadata, paths: &IntegrationPaths) -> bool {
    metadata.description == OWNER_MARKER
        && !metadata.target.is_empty()
        && paths_equal(Path::new(&metadata.target), &paths.launcher)
}

fn inspect_optional(
    shell: &impl ShortcutShell,
    path: &Path,
) -> Result<Option<ShortcutMetadata>, IntegrationError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
                return Err(IntegrationError::UnsafePath(path.to_path_buf()));
            }
            #[cfg(windows)]
            if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(IntegrationError::UnsafePath(path.to_path_buf()));
            }
            shell.inspect(path).map(Some)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(io_error(path, source)),
    }
}

fn validate_version(version: &str) -> Result<(), IntegrationError> {
    let parts: Vec<_> = version.split('.').collect();
    let valid_part = |part: &&str| {
        !part.is_empty()
            && part.bytes().all(|byte| byte.is_ascii_digit())
            && (part.len() == 1 || !part.starts_with('0'))
    };
    if version.len() > 32 || parts.len() != 3 || !parts.iter().all(valid_part) {
        return Err(IntegrationError::InvalidArgument(
            "version must be a canonical three-part numeric version of at most 32 bytes".to_owned(),
        ));
    }
    Ok(())
}

fn canonical_safe_directory(path: &Path) -> Result<PathBuf, IntegrationError> {
    ensure_safe_directory(path, false)?;
    dunce::canonicalize(path).map_err(|source| io_error(path, source))
}

fn canonical_safe_directory_or_missing(path: &Path) -> Result<PathBuf, IntegrationError> {
    if !path.is_absolute() {
        return Err(IntegrationError::InvalidArgument(
            "the prospective install directory must be absolute".to_owned(),
        ));
    }

    let mut cursor = path.to_path_buf();
    let mut missing = Vec::new();
    loop {
        match fs::symlink_metadata(&cursor) {
            Ok(_) => {
                let mut resolved = canonical_safe_directory(&cursor)?;
                for component in missing.iter().rev() {
                    resolved.push(component);
                }
                return Ok(resolved);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let component = match cursor.components().next_back() {
                    Some(std::path::Component::Normal(component)) => component.to_os_string(),
                    _ => {
                        return Err(IntegrationError::InvalidArgument(
                            "the prospective install directory contains an invalid component"
                                .to_owned(),
                        ));
                    }
                };
                missing.push(component);
                if !cursor.pop() {
                    return Err(IntegrationError::InvalidArgument(
                        "the prospective install directory has no existing ancestor".to_owned(),
                    ));
                }
            }
            Err(source) => return Err(io_error(&cursor, source)),
        }
    }
}

fn ensure_safe_directory(path: &Path, create: bool) -> Result<(), IntegrationError> {
    if create {
        fs::create_dir_all(path).map_err(|source| io_error(path, source))?;
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| io_error(path, source))?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err(IntegrationError::UnsafePath(path.to_path_buf()));
    }
    #[cfg(windows)]
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(IntegrationError::UnsafePath(path.to_path_buf()));
    }
    Ok(())
}

fn ensure_safe_regular_file(path: &Path) -> Result<(), IntegrationError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| io_error(path, source))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(IntegrationError::UnsafePath(path.to_path_buf()));
    }
    #[cfg(windows)]
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(IntegrationError::UnsafePath(path.to_path_buf()));
    }
    Ok(())
}

fn canonical_safe_file_under(path: &Path, root: &Path) -> Result<PathBuf, IntegrationError> {
    ensure_safe_regular_file(path)?;
    let canonical = dunce::canonicalize(path).map_err(|source| io_error(path, source))?;
    if !path_starts_with(&canonical, root) {
        return Err(IntegrationError::InvalidArgument(format!(
            "icon must be stored under the installation root: {}",
            path.display()
        )));
    }
    Ok(canonical)
}

fn copy_file_exclusive(source: &Path, destination: &Path) -> Result<(), IntegrationError> {
    let bytes = read_file(source)?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(destination)
        .map_err(|source| io_error(destination, source))?;
    file.write_all(&bytes)
        .map_err(|source| io_error(destination, source))?;
    file.sync_all()
        .map_err(|source| io_error(destination, source))?;
    Ok(())
}

fn read_file(path: &Path) -> Result<Vec<u8>, IntegrationError> {
    fs::read(path).map_err(|source| io_error(path, source))
}

fn sha256_file(path: &Path) -> Result<String, IntegrationError> {
    let bytes = read_file(path)?;
    Ok(sha256_bytes(&bytes))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    encoded
}

fn staged_path(directory: &Path, prefix: &str, extension: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let value = COUNTER.fetch_add(1, Ordering::Relaxed);
    directory.join(format!(
        ".{prefix}.{}.{}.{extension}",
        std::process::id(),
        value
    ))
}

fn remove_if_present(path: &Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => {}
    }
}

fn io_error(path: &Path, source: io::Error) -> IntegrationError {
    IntegrationError::Io {
        path: path.to_path_buf(),
        source,
    }
}

#[cfg(windows)]
fn paths_equal(left: &Path, right: &Path) -> bool {
    comparable_path(left).eq_ignore_ascii_case(&comparable_path(right))
}

#[cfg(not(windows))]
fn paths_equal(left: &Path, right: &Path) -> bool {
    comparable_path(left) == comparable_path(right)
}

fn comparable_path(path: &Path) -> String {
    dunce::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_owned()
}

fn path_starts_with(candidate: &Path, root: &Path) -> bool {
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

#[cfg(windows)]
fn resolve_desktop() -> Result<PathBuf, IntegrationError> {
    use known_folders::{KnownFolder, get_known_folder_path};

    get_known_folder_path(KnownFolder::Desktop)
        .or_else(|| env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join("Desktop")))
        .ok_or_else(|| IntegrationError::InvalidArgument("Desktop directory was not found".into()))
}

#[cfg(not(windows))]
fn resolve_desktop() -> Result<PathBuf, IntegrationError> {
    Err(IntegrationError::UnsupportedPlatform)
}

#[cfg(windows)]
fn resolve_start_menu() -> Option<PathBuf> {
    use known_folders::{KnownFolder, get_known_folder_path};

    get_known_folder_path(KnownFolder::Programs).or_else(|| {
        env::var_os("APPDATA")
            .map(|root| PathBuf::from(root).join(r"Microsoft\Windows\Start Menu\Programs"))
    })
}

#[cfg(not(windows))]
fn resolve_start_menu() -> Option<PathBuf> {
    None
}

#[cfg(windows)]
struct PlatformShortcutShell {
    powershell: PathBuf,
    system32: PathBuf,
}

#[cfg(not(windows))]
struct PlatformShortcutShell;

#[cfg(windows)]
impl PlatformShortcutShell {
    fn new() -> Result<Self, IntegrationError> {
        use known_folders::{KnownFolder, get_known_folder_path};

        let system32 = get_known_folder_path(KnownFolder::System)
            .and_then(|path| dunce::canonicalize(path).ok())
            .filter(|path| path.is_dir())
            .ok_or_else(|| IntegrationError::Shell("System32 was not found".to_owned()))?;
        let powershell = dunce::canonicalize(
            system32.join(r"WindowsPowerShell\v1.0\powershell.exe"),
        )
        .map_err(|_| IntegrationError::Shell("trusted Windows PowerShell was not found".into()))?;
        if !powershell.is_file() || !path_starts_with(&powershell, &system32) {
            return Err(IntegrationError::Shell(
                "trusted Windows PowerShell was not found".to_owned(),
            ));
        }
        Ok(Self {
            powershell,
            system32,
        })
    }

    fn run(
        &self,
        script: &str,
        variables: &[(&str, &std::ffi::OsStr)],
    ) -> Result<std::process::Output, IntegrationError> {
        let mut command = Command::new(&self.powershell);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
            ])
            .current_dir(&self.system32)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, value) in variables {
            command.env(name, value);
        }
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
        let output = command
            .output()
            .map_err(|error| IntegrationError::Shell(error.to_string()))?;
        if output.status.success() {
            Ok(output)
        } else {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            Err(IntegrationError::Shell(if message.is_empty() {
                "PowerShell returned a failure status".to_owned()
            } else {
                message
            }))
        }
    }
}

#[cfg(not(windows))]
impl PlatformShortcutShell {
    fn new() -> Result<Self, IntegrationError> {
        Err(IntegrationError::UnsupportedPlatform)
    }
}

#[cfg(windows)]
impl ShortcutShell for PlatformShortcutShell {
    fn inspect(&self, path: &Path) -> Result<ShortcutMetadata, IntegrationError> {
        const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$path = [IO.Path]::GetFullPath($env:CLE_SHORTCUT_PATH)
$directory = [IO.Path]::GetDirectoryName($path)
$name = [IO.Path]::GetFileName($path)
$wscript = New-Object -ComObject WScript.Shell
$shortcut = $wscript.CreateShortcut($path)
$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace($directory)
if ($null -eq $folder) { throw 'The shortcut directory could not be opened.' }
$item = $folder.ParseName($name)
if ($null -eq $item) { throw 'The shortcut could not be parsed.' }
[PSCustomObject]@{
    target = [string]$shortcut.TargetPath
    description = [string]$shortcut.Description
    targetParsingPath = [string]$item.ExtendedProperty('System.Link.TargetParsingPath')
    iconLocation = [string]$shortcut.IconLocation
} | ConvertTo-Json -Compress
"#;
        let output = self.run(SCRIPT, &[("CLE_SHORTCUT_PATH", path.as_os_str())])?;
        let text = String::from_utf8(output.stdout)
            .map_err(|error| IntegrationError::Shell(error.to_string()))?;
        serde_json::from_str(text.trim_start_matches('\u{feff}').trim())
            .map_err(IntegrationError::from)
    }

    fn create(
        &self,
        path: &Path,
        target: &Path,
        working_directory: &Path,
        icon: &Path,
        description: &str,
    ) -> Result<(), IntegrationError> {
        const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$path = [IO.Path]::GetFullPath($env:CLE_SHORTCUT_PATH)
if ([IO.Path]::GetExtension($path) -ine '.lnk') { throw 'Shortcut staging path must end in .lnk.' }
$wscript = New-Object -ComObject WScript.Shell
$shortcut = $wscript.CreateShortcut($path)
$shortcut.TargetPath = [IO.Path]::GetFullPath($env:CLE_SHORTCUT_TARGET)
$shortcut.WorkingDirectory = [IO.Path]::GetFullPath($env:CLE_SHORTCUT_WORKING_DIRECTORY)
$shortcut.IconLocation = ('{0},0' -f [IO.Path]::GetFullPath($env:CLE_SHORTCUT_ICON))
$shortcut.Description = $env:CLE_SHORTCUT_DESCRIPTION
$shortcut.WindowStyle = 1
$shortcut.Save()
"#;
        self.run(
            SCRIPT,
            &[
                ("CLE_SHORTCUT_PATH", path.as_os_str()),
                ("CLE_SHORTCUT_TARGET", target.as_os_str()),
                (
                    "CLE_SHORTCUT_WORKING_DIRECTORY",
                    working_directory.as_os_str(),
                ),
                ("CLE_SHORTCUT_ICON", icon.as_os_str()),
                (
                    "CLE_SHORTCUT_DESCRIPTION",
                    std::ffi::OsStr::new(description),
                ),
            ],
        )?;
        Ok(())
    }

    fn replace_file(&self, staged: &Path, destination: &Path) -> Result<(), IntegrationError> {
        if staged.parent() != destination.parent() {
            return Err(IntegrationError::InvalidState(
                "atomic shortcut replacement must stay in one directory".to_owned(),
            ));
        }
        const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$staged = [IO.Path]::GetFullPath($env:CLE_STAGED_PATH)
$destination = [IO.Path]::GetFullPath($env:CLE_DESTINATION_PATH)
if ([IO.Path]::GetDirectoryName($staged) -ine [IO.Path]::GetDirectoryName($destination)) {
    throw 'Atomic replacement paths are not in the same directory.'
}
if ([IO.File]::Exists($destination)) {
    $backupName = '.{0}.{1}.replace-backup' -f [IO.Path]::GetFileName($destination), [Guid]::NewGuid().ToString('N')
    $backup = [IO.Path]::Combine([IO.Path]::GetDirectoryName($destination), $backupName)
    [IO.File]::Replace($staged, $destination, $backup, $true)
    try { [IO.File]::Delete($backup) } catch { }
}
else {
    [IO.File]::Move($staged, $destination)
}
"#;
        self.run(
            SCRIPT,
            &[
                ("CLE_STAGED_PATH", staged.as_os_str()),
                ("CLE_DESTINATION_PATH", destination.as_os_str()),
            ],
        )?;
        Ok(())
    }

    fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError> {
        const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$packages = @(
    Get-AppxPackage -Name $env:CLE_CODEX_PACKAGE_NAME -PackageTypeFilter Main |
        Where-Object { [string]$_.PackageFamilyName -ceq $env:CLE_CODEX_PACKAGE_FAMILY }
)
if ($packages.Count -ne 1) { throw 'Exactly one official stable Codex AppX package was not found.' }
$package = $packages[0]
$manifest = Get-AppxPackageManifest -Package $package
$applications = @(
    $manifest.Package.Applications.Application |
        Where-Object { [string]$_.Id -ceq $env:CLE_CODEX_APPLICATION_ID }
)
if ($applications.Count -ne 1) { throw 'The official stable Codex AppX application identity was not found.' }
$assetsRoot = Join-Path ([string]$package.InstallLocation) 'assets'
$assets = @(
    Get-ChildItem -LiteralPath $assetsRoot -File -Filter 'Square44x44Logo.targetsize-*_altform-unplated.png' |
        Sort-Object -Property Name |
        ForEach-Object { [string]$_.FullName }
)
[PSCustomObject]@{
    name = [string]$package.Name
    packageFamilyName = [string]$package.PackageFamilyName
    applicationId = [string]$applications[0].Id
    installLocation = [string]$package.InstallLocation
    assets = $assets
} | ConvertTo-Json -Compress
"#;
        let output = self.run(
            SCRIPT,
            &[
                (
                    "CLE_CODEX_PACKAGE_NAME",
                    std::ffi::OsStr::new(CODEX_PACKAGE_NAME),
                ),
                (
                    "CLE_CODEX_PACKAGE_FAMILY",
                    std::ffi::OsStr::new(CODEX_PACKAGE_FAMILY),
                ),
                (
                    "CLE_CODEX_APPLICATION_ID",
                    std::ffi::OsStr::new(CODEX_APPLICATION_ID),
                ),
            ],
        )?;
        let text = String::from_utf8(output.stdout)
            .map_err(|error| IntegrationError::OfficialIcon(error.to_string()))?;
        let report: OfficialPackageIconReport =
            serde_json::from_str(text.trim_start_matches('\u{feff}').trim())?;
        if report.name != CODEX_PACKAGE_NAME
            || report.package_family_name != CODEX_PACKAGE_FAMILY
            || report.application_id != CODEX_APPLICATION_ID
            || format!("{}!{}", report.package_family_name, report.application_id) != CODEX_AUMID
        {
            return Err(IntegrationError::OfficialIcon(
                "the discovered package identity is not the official stable Codex AUMID".to_owned(),
            ));
        }

        let package_root = canonical_safe_directory(&report.install_location)?;
        let assets_root = canonical_safe_directory(&package_root.join("assets"))?;
        if !path_starts_with(&assets_root, &package_root) {
            return Err(IntegrationError::OfficialIcon(
                "the package assets directory escaped the stable package root".to_owned(),
            ));
        }
        let mut pngs = Vec::with_capacity(report.assets.len());
        for asset in report.assets {
            let expected_size = asset
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(icon_asset_size)
                .ok_or_else(|| {
                    IntegrationError::OfficialIcon(
                        "the package returned an unexpected icon asset name".to_owned(),
                    )
                })?;
            let asset = canonical_safe_file_under(&asset, &assets_root)?;
            let png = read_file(&asset)?;
            let (width, height) = png_dimensions(&png)?;
            if width != u32::from(expected_size) || height != u32::from(expected_size) {
                return Err(IntegrationError::OfficialIcon(format!(
                    "icon asset dimensions do not match its target size: {}",
                    asset.display()
                )));
            }
            pngs.push(png);
        }
        Ok(pngs)
    }
}

#[cfg(not(windows))]
impl ShortcutShell for PlatformShortcutShell {
    fn inspect(&self, _path: &Path) -> Result<ShortcutMetadata, IntegrationError> {
        Err(IntegrationError::UnsupportedPlatform)
    }

    fn create(
        &self,
        _path: &Path,
        _target: &Path,
        _working_directory: &Path,
        _icon: &Path,
        _description: &str,
    ) -> Result<(), IntegrationError> {
        Err(IntegrationError::UnsupportedPlatform)
    }

    fn replace_file(&self, _staged: &Path, _destination: &Path) -> Result<(), IntegrationError> {
        Err(IntegrationError::UnsupportedPlatform)
    }

    fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError> {
        Err(IntegrationError::UnsupportedPlatform)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[derive(Debug, Default)]
    struct FakeShell;

    impl ShortcutShell for FakeShell {
        fn inspect(&self, path: &Path) -> Result<ShortcutMetadata, IntegrationError> {
            let bytes = fs::read(path).map_err(|source| io_error(path, source))?;
            serde_json::from_slice(&bytes).map_err(IntegrationError::from)
        }

        fn create(
            &self,
            path: &Path,
            target: &Path,
            _working_directory: &Path,
            icon: &Path,
            description: &str,
        ) -> Result<(), IntegrationError> {
            write_fixture(
                path,
                &ShortcutMetadata {
                    target: target.to_string_lossy().into_owned(),
                    description: description.to_owned(),
                    target_parsing_path: target.to_string_lossy().into_owned(),
                    icon_location: format!("{},0", icon.display()),
                },
            )
        }

        fn replace_file(&self, staged: &Path, destination: &Path) -> Result<(), IntegrationError> {
            if staged.parent() != destination.parent() {
                return Err(IntegrationError::InvalidState(
                    "test replacement crossed directories".to_owned(),
                ));
            }
            if destination.exists() {
                fs::remove_file(destination).map_err(|source| io_error(destination, source))?;
            }
            fs::rename(staged, destination).map_err(|source| io_error(destination, source))
        }

        fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError> {
            Ok(vec![synthetic_png(16), synthetic_png(32)])
        }
    }

    #[derive(Debug, Default)]
    struct ShortcutReplacementFailureShell;

    impl ShortcutShell for ShortcutReplacementFailureShell {
        fn inspect(&self, path: &Path) -> Result<ShortcutMetadata, IntegrationError> {
            FakeShell.inspect(path)
        }

        fn create(
            &self,
            path: &Path,
            target: &Path,
            working_directory: &Path,
            icon: &Path,
            description: &str,
        ) -> Result<(), IntegrationError> {
            FakeShell.create(path, target, working_directory, icon, description)
        }

        fn replace_file(&self, staged: &Path, destination: &Path) -> Result<(), IntegrationError> {
            if destination
                .file_name()
                .is_some_and(|name| name == SHORTCUT_NAME)
            {
                return Err(IntegrationError::Shell(
                    "injected shortcut replacement failure".to_owned(),
                ));
            }
            FakeShell.replace_file(staged, destination)
        }

        fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError> {
            FakeShell.official_icon_pngs()
        }
    }

    #[derive(Debug, Clone, Copy)]
    enum FreshInstallFailurePoint {
        Create,
        StagedInspect,
        GuardInspect,
    }

    #[derive(Debug)]
    struct FreshInstallFailureShell {
        failure_point: FreshInstallFailurePoint,
        shortcut_inspections: Cell<usize>,
    }

    impl FreshInstallFailureShell {
        fn new(failure_point: FreshInstallFailurePoint) -> Self {
            Self {
                failure_point,
                shortcut_inspections: Cell::new(0),
            }
        }
    }

    impl ShortcutShell for FreshInstallFailureShell {
        fn inspect(&self, path: &Path) -> Result<ShortcutMetadata, IntegrationError> {
            if path.file_name().is_some_and(|name| name == SHORTCUT_NAME) {
                let inspections = self.shortcut_inspections.get() + 1;
                self.shortcut_inspections.set(inspections);
                if matches!(self.failure_point, FreshInstallFailurePoint::GuardInspect)
                    && inspections == 2
                {
                    return Err(IntegrationError::Shell(
                        "injected replacement guard inspection failure".to_owned(),
                    ));
                }
            }
            if matches!(self.failure_point, FreshInstallFailurePoint::StagedInspect)
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with(".Codex.") && name.ends_with(".lnk"))
            {
                return Err(IntegrationError::Shell(
                    "injected staged shortcut inspection failure".to_owned(),
                ));
            }
            FakeShell.inspect(path)
        }

        fn create(
            &self,
            path: &Path,
            target: &Path,
            working_directory: &Path,
            icon: &Path,
            description: &str,
        ) -> Result<(), IntegrationError> {
            FakeShell.create(path, target, working_directory, icon, description)?;
            if matches!(self.failure_point, FreshInstallFailurePoint::Create) {
                return Err(IntegrationError::Shell(
                    "injected staged shortcut creation failure".to_owned(),
                ));
            }
            Ok(())
        }

        fn replace_file(&self, staged: &Path, destination: &Path) -> Result<(), IntegrationError> {
            FakeShell.replace_file(staged, destination)
        }

        fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError> {
            FakeShell.official_icon_pngs()
        }
    }

    #[derive(Debug, Default)]
    struct ReplaceThenFailureShell;

    impl ShortcutShell for ReplaceThenFailureShell {
        fn inspect(&self, path: &Path) -> Result<ShortcutMetadata, IntegrationError> {
            FakeShell.inspect(path)
        }

        fn create(
            &self,
            path: &Path,
            target: &Path,
            working_directory: &Path,
            icon: &Path,
            description: &str,
        ) -> Result<(), IntegrationError> {
            FakeShell.create(path, target, working_directory, icon, description)
        }

        fn replace_file(&self, staged: &Path, destination: &Path) -> Result<(), IntegrationError> {
            FakeShell.replace_file(staged, destination)?;
            if destination
                .file_name()
                .is_some_and(|name| name == SHORTCUT_NAME)
            {
                return Err(IntegrationError::Shell(
                    "injected post-replacement failure".to_owned(),
                ));
            }
            Ok(())
        }

        fn official_icon_pngs(&self) -> Result<Vec<Vec<u8>>, IntegrationError> {
            FakeShell.official_icon_pngs()
        }
    }

    struct Fixture {
        _temporary: tempfile::TempDir,
        paths: IntegrationPaths,
        original: Vec<u8>,
    }

    fn fixture() -> Fixture {
        let temporary = tempfile::tempdir().expect("temporary root");
        let install_root = temporary.path().join("install");
        let desktop = temporary.path().join("desktop");
        let start_menu = temporary.path().join("start-menu");
        fs::create_dir_all(&install_root).expect("install root");
        fs::create_dir_all(&desktop).expect("desktop");
        fs::create_dir_all(&start_menu).expect("start menu");
        fs::write(install_root.join(LAUNCHER_NAME), b"launcher").expect("launcher");
        fs::write(install_root.join(DEFAULT_ICON_NAME), b"icon").expect("icon");
        let paths = IntegrationPaths::resolve(&install_root, Some(&desktop), Some(&start_menu))
            .expect("paths");
        write_fixture(&paths.shortcut, &official_metadata()).expect("official shortcut");
        let original = fs::read(&paths.shortcut).expect("original bytes");
        Fixture {
            _temporary: temporary,
            paths,
            original,
        }
    }

    fn official_metadata() -> ShortcutMetadata {
        ShortcutMetadata {
            target: String::new(),
            description: "Codex".to_owned(),
            target_parsing_path: CODEX_AUMID.to_owned(),
            icon_location: String::new(),
        }
    }

    fn unrelated_metadata() -> ShortcutMetadata {
        ShortcutMetadata {
            target: r"C:\Other\other.exe".to_owned(),
            description: "User shortcut".to_owned(),
            target_parsing_path: r"C:\Other\other.exe".to_owned(),
            icon_location: String::new(),
        }
    }

    fn write_fixture(path: &Path, metadata: &ShortcutMetadata) -> Result<(), IntegrationError> {
        let bytes = serde_json::to_vec_pretty(metadata)?;
        fs::write(path, bytes).map_err(|source| io_error(path, source))
    }

    fn synthetic_png(size: u32) -> Vec<u8> {
        let mut png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR".to_vec();
        png.extend_from_slice(&size.to_be_bytes());
        png.extend_from_slice(&size.to_be_bytes());
        png.extend_from_slice(&[8, 6, 0, 0, 0]);
        png
    }

    fn little_u16(bytes: &[u8], offset: usize) -> u16 {
        u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
    }

    fn little_u32(bytes: &[u8], offset: usize) -> u32 {
        u32::from_le_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ])
    }

    #[test]
    fn ico_layout_embeds_sorted_png_resolutions() {
        let png16 = synthetic_png(16);
        let png32 = synthetic_png(32);
        let ico = build_multi_image_ico(vec![png32.clone(), png16.clone()]).expect("ICO");

        assert_eq!(little_u16(&ico, 0), 0);
        assert_eq!(little_u16(&ico, 2), 1);
        assert_eq!(little_u16(&ico, 4), 2);
        assert_eq!((ico[6], ico[7]), (16, 16));
        assert_eq!(little_u32(&ico, 14), png16.len() as u32);
        assert_eq!(little_u32(&ico, 18), 38);
        assert_eq!((ico[22], ico[23]), (32, 32));
        assert_eq!(little_u32(&ico, 30), png32.len() as u32);
        assert_eq!(little_u32(&ico, 34), 38 + png16.len() as u32);
        assert_eq!(&ico[38..38 + png16.len()], png16.as_slice());
        assert_eq!(&ico[38 + png16.len()..], png32.as_slice());
    }

    #[test]
    fn version_requires_canonical_three_part_numeric_form() {
        for version in ["0.1.4", "26.715.10079", "999999999.0.1"] {
            validate_version(version).expect("valid canonical version");
        }
        for version in ["", "1", "1.2", "1.2.3.4", "01.2.3", "1.02.3", "v1.2.3"] {
            assert!(validate_version(version).is_err(), "accepted {version}");
        }
    }

    #[test]
    fn install_backs_up_exact_bytes_and_repeat_install_preserves_them() {
        let fixture = fixture();
        let shell = FakeShell;

        let first = install(&shell, &fixture.paths, "0.1.4", None).expect("first install");
        assert_eq!(first.state, IntegrationState::Managed);
        assert_eq!(
            fs::read(&fixture.paths.backup).expect("backup"),
            fixture.original
        );
        let original_backup = fs::read(&fixture.paths.backup).expect("backup bytes");

        let second = install(&shell, &fixture.paths, "0.1.5", None).expect("repeat install");
        assert_eq!(second.state, IntegrationState::Managed);
        assert_eq!(
            fs::read(&fixture.paths.backup).expect("backup after repeat"),
            original_backup
        );
        let manifest = read_manifest_optional(&fixture.paths.manifest)
            .expect("manifest read")
            .expect("manifest exists");
        assert_eq!(manifest.installed_version, "0.1.5");
    }

    #[test]
    fn preflight_accepts_official_shortcut_without_creating_install_state() {
        let temporary = tempfile::tempdir().expect("temporary root");
        let missing_parent = temporary.path().join("missing-parent");
        let install_root = missing_parent.join("Programs").join("Codex Live Explorer");
        let desktop = temporary.path().join("desktop");
        let start_menu = temporary.path().join("start-menu");
        fs::create_dir(&desktop).expect("desktop");
        fs::create_dir(&start_menu).expect("start menu");
        let paths = IntegrationPaths::resolve_with_options(
            &install_root,
            Some(&desktop),
            Some(&start_menu),
            true,
        )
        .expect("prospective paths");
        write_fixture(&paths.shortcut, &official_metadata()).expect("official shortcut");
        let original = fs::read(&paths.shortcut).expect("shortcut bytes");

        let report = preflight(&FakeShell, &paths, "0.1.4").expect("preflight");
        assert_eq!(report.state, IntegrationState::Official);
        assert_eq!(fs::read(&paths.shortcut).expect("shortcut bytes"), original);
        assert!(!install_root.exists());
        assert!(!missing_parent.exists());
        assert!(!paths.state_directory.exists());
        assert!(!paths.default_icon.exists());
    }

    #[test]
    fn fresh_install_rollback_restores_exact_official_state() {
        let fixture = fixture();
        let shell = FakeShell;
        let original_icon = fs::read(&fixture.paths.default_icon).expect("original icon");
        let legacy = fixture.paths.desktop.join(LEGACY_SHORTCUT_NAME);
        write_fixture(
            &legacy,
            &ShortcutMetadata {
                target: fixture.paths.launcher.to_string_lossy().into_owned(),
                description: LEGACY_DESCRIPTION.to_owned(),
                target_parsing_path: String::new(),
                icon_location: String::new(),
            },
        )
        .expect("legacy shortcut");
        let legacy_bytes = fs::read(&legacy).expect("legacy shortcut bytes");

        let prepared = prepare_install(&shell, &fixture.paths).expect("prepare install");
        assert_eq!(prepared.state, IntegrationState::Official);
        install_with_legacy_cleanup(&shell, &fixture.paths, "0.1.4", None, false)
            .expect("transactional install");
        assert!(legacy.exists());
        assert_ne!(
            fs::read(&fixture.paths.shortcut).expect("managed shortcut"),
            fixture.original
        );

        let rolled_back = rollback_install(&shell, &fixture.paths).expect("rollback install");
        assert_eq!(rolled_back.state, IntegrationState::Official);
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("restored shortcut"),
            fixture.original
        );
        assert_eq!(
            fs::read(&fixture.paths.default_icon).expect("restored icon"),
            original_icon
        );
        assert!(!fixture.paths.manifest.exists());
        assert!(!fixture.paths.backup.exists());
        assert!(!fixture.paths.install_rollback.exists());
        assert!(!fixture.paths.state_directory.exists());
        assert_eq!(fs::read(&legacy).expect("legacy shortcut"), legacy_bytes);
    }

    #[test]
    fn fresh_install_rollback_replacement_failure_preserves_recovery_state() {
        let fixture = fixture();
        let shell = FakeShell;

        prepare_install(&shell, &fixture.paths).expect("prepare install");
        install_with_legacy_cleanup(&shell, &fixture.paths, "0.1.4", None, false)
            .expect("transactional install");

        let managed_shortcut = fs::read(&fixture.paths.shortcut).expect("managed shortcut");
        let managed_manifest = fs::read(&fixture.paths.manifest).expect("managed manifest");
        let original_backup = fs::read(&fixture.paths.backup).expect("original backup");
        let managed_icon = fs::read(&fixture.paths.default_icon).expect("managed icon");
        let rollback_snapshot =
            fs::read(&fixture.paths.install_rollback).expect("rollback snapshot");

        let error = rollback_install(&ShortcutReplacementFailureShell, &fixture.paths)
            .expect_err("shortcut replacement must fail");
        assert!(matches!(error, IntegrationError::Shell(_)));
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("preserved managed shortcut"),
            managed_shortcut
        );
        assert_eq!(
            fs::read(&fixture.paths.manifest).expect("preserved managed manifest"),
            managed_manifest
        );
        assert_eq!(
            fs::read(&fixture.paths.backup).expect("preserved original backup"),
            original_backup
        );
        assert_eq!(
            fs::read(&fixture.paths.default_icon).expect("preserved managed icon"),
            managed_icon
        );
        assert_eq!(
            fs::read(&fixture.paths.install_rollback).expect("preserved rollback snapshot"),
            rollback_snapshot
        );
        assert!(fixture.paths.state_directory.is_dir());
    }

    #[test]
    fn managed_upgrade_rollback_preserves_prior_integration_exactly() {
        let fixture = fixture();
        let shell = FakeShell;
        install(&shell, &fixture.paths, "0.1.4", None).expect("initial install");
        let prior_shortcut = fs::read(&fixture.paths.shortcut).expect("prior shortcut");
        let prior_manifest = fs::read(&fixture.paths.manifest).expect("prior manifest");
        let prior_backup = fs::read(&fixture.paths.backup).expect("prior backup");
        let prior_icon = fs::read(&fixture.paths.default_icon).expect("prior icon");

        let prepared = prepare_install(&shell, &fixture.paths).expect("prepare upgrade");
        assert_eq!(prepared.state, IntegrationState::Managed);
        install(&shell, &fixture.paths, "0.1.5", None).expect("upgrade");
        assert_ne!(
            fs::read(&fixture.paths.manifest).expect("upgraded manifest"),
            prior_manifest
        );

        let rolled_back = rollback_install(&shell, &fixture.paths).expect("rollback upgrade");
        assert_eq!(rolled_back.state, IntegrationState::Managed);
        assert_eq!(rolled_back.installed_version.as_deref(), Some("0.1.4"));
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("restored shortcut"),
            prior_shortcut
        );
        assert_eq!(
            fs::read(&fixture.paths.manifest).expect("restored manifest"),
            prior_manifest
        );
        assert_eq!(
            fs::read(&fixture.paths.backup).expect("restored backup"),
            prior_backup
        );
        assert_eq!(
            fs::read(&fixture.paths.default_icon).expect("restored icon"),
            prior_icon
        );
        assert!(!fixture.paths.install_rollback.exists());
        assert_eq!(
            status(&shell, &fixture.paths).expect("status").state,
            IntegrationState::Managed
        );
    }

    #[test]
    fn install_commit_keeps_new_managed_state_and_discards_snapshot() {
        let fixture = fixture();
        let shell = FakeShell;
        let legacy = fixture.paths.desktop.join(LEGACY_SHORTCUT_NAME);
        write_fixture(
            &legacy,
            &ShortcutMetadata {
                target: fixture.paths.launcher.to_string_lossy().into_owned(),
                description: LEGACY_DESCRIPTION.to_owned(),
                target_parsing_path: String::new(),
                icon_location: String::new(),
            },
        )
        .expect("legacy shortcut");
        prepare_install(&shell, &fixture.paths).expect("prepare install");
        install_with_legacy_cleanup(&shell, &fixture.paths, "0.1.4", None, false)
            .expect("transactional install");
        assert!(legacy.exists());

        let committed = commit_install(&shell, &fixture.paths).expect("commit install");
        assert_eq!(committed.state, IntegrationState::Managed);
        assert_eq!(committed.installed_version.as_deref(), Some("0.1.4"));
        assert_eq!(committed.removed_legacy_shortcuts, vec![legacy.clone()]);
        assert!(!legacy.exists());
        assert!(!fixture.paths.install_rollback.exists());
        assert!(fixture.paths.manifest.exists());
        assert!(fixture.paths.backup.exists());
    }

    #[test]
    fn prepare_install_replaces_a_valid_stale_official_snapshot() {
        let fixture = fixture();
        let shell = FakeShell;

        prepare_install(&shell, &fixture.paths).expect("first prepare install");
        let report = prepare_install(&shell, &fixture.paths).expect("second prepare install");
        assert_eq!(report.state, IntegrationState::Official);

        let snapshot = read_install_snapshot(&fixture.paths).expect("new rollback snapshot");
        assert_eq!(snapshot.prior_state, IntegrationState::Official);
        assert_eq!(
            decode_snapshot_file(&snapshot.shortcut).expect("snapshot shortcut"),
            fixture.original
        );
        assert!(snapshot.manifest.is_none());
        assert!(snapshot.backup.is_none());
        assert_eq!(
            validate_install_snapshot(&fixture.paths, &snapshot, None, None)
                .expect("valid official snapshot"),
            None
        );
    }

    #[test]
    fn prepare_install_replaces_a_valid_stale_snapshot_with_managed_state() {
        let fixture = fixture();
        let shell = FakeShell;

        prepare_install(&shell, &fixture.paths).expect("prepare fresh install");
        let stale_snapshot =
            fs::read(&fixture.paths.install_rollback).expect("stale rollback snapshot");
        install_with_legacy_cleanup(&shell, &fixture.paths, "0.1.4", None, false)
            .expect("transactional install without commit");
        let managed_shortcut = fs::read(&fixture.paths.shortcut).expect("managed shortcut");
        let managed_manifest = fs::read(&fixture.paths.manifest).expect("managed manifest");
        let managed_backup = fs::read(&fixture.paths.backup).expect("managed backup");

        let report = prepare_install(&shell, &fixture.paths).expect("prepare managed install");
        assert_eq!(report.state, IntegrationState::Managed);
        let replacement_snapshot =
            fs::read(&fixture.paths.install_rollback).expect("replacement rollback snapshot");
        assert_ne!(replacement_snapshot, stale_snapshot);

        let snapshot = read_install_snapshot(&fixture.paths).expect("managed rollback snapshot");
        assert_eq!(snapshot.prior_state, IntegrationState::Managed);
        assert_eq!(
            decode_snapshot_file(&snapshot.shortcut).expect("snapshot shortcut"),
            managed_shortcut
        );
        let manifest = snapshot.manifest.as_ref().expect("snapshot manifest");
        let manifest_bytes = decode_snapshot_file(manifest).expect("snapshot manifest bytes");
        assert_eq!(manifest_bytes, managed_manifest);
        let backup = snapshot.backup.as_ref().expect("snapshot backup");
        let backup_bytes = decode_snapshot_file(backup).expect("snapshot backup bytes");
        assert_eq!(backup_bytes, managed_backup);
        assert_eq!(
            validate_install_snapshot(
                &fixture.paths,
                &snapshot,
                Some(&manifest_bytes),
                Some(&backup_bytes),
            )
            .expect("valid managed snapshot")
            .as_deref(),
            Some("0.1.4")
        );
    }

    #[test]
    fn prepare_install_preserves_a_valid_stale_snapshot_on_conflict() {
        let fixture = fixture();
        let shell = FakeShell;

        prepare_install(&shell, &fixture.paths).expect("prepare install");
        let rollback_snapshot =
            fs::read(&fixture.paths.install_rollback).expect("rollback snapshot");
        write_fixture(&fixture.paths.shortcut, &unrelated_metadata())
            .expect("conflicting shortcut");
        let conflicting_shortcut =
            fs::read(&fixture.paths.shortcut).expect("conflicting shortcut bytes");

        let error = prepare_install(&shell, &fixture.paths)
            .expect_err("stale snapshot reconciliation must fail closed");
        assert!(matches!(error, IntegrationError::ShortcutConflict));
        assert_eq!(
            fs::read(&fixture.paths.install_rollback).expect("preserved rollback snapshot"),
            rollback_snapshot
        );
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("preserved conflicting shortcut"),
            conflicting_shortcut
        );
    }

    #[test]
    fn restore_is_byte_for_byte_and_idempotent() {
        let fixture = fixture();
        let shell = FakeShell;
        install(&shell, &fixture.paths, "0.1.4", None).expect("install");

        let restored = restore(&shell, &fixture.paths).expect("restore");
        assert_eq!(restored.state, IntegrationState::Official);
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("restored shortcut"),
            fixture.original
        );
        assert!(!fixture.paths.backup.exists());
        assert!(!fixture.paths.manifest.exists());
        let second = restore(&shell, &fixture.paths).expect("idempotent restore");
        assert_eq!(second.state, IntegrationState::Official);
    }

    #[test]
    fn restore_without_a_manifest_rejects_a_missing_shortcut() {
        let fixture = fixture();
        fs::remove_file(&fixture.paths.shortcut).expect("remove official shortcut");

        let error = restore(&FakeShell, &fixture.paths).expect_err("restore must report missing");
        assert!(matches!(
            error,
            IntegrationError::ShortcutMissing(ref path) if path == &fixture.paths.shortcut
        ));
    }

    #[test]
    fn restore_without_a_manifest_rejects_a_conflicting_shortcut() {
        let fixture = fixture();
        write_fixture(&fixture.paths.shortcut, &unrelated_metadata())
            .expect("conflicting shortcut");
        let conflicting_shortcut =
            fs::read(&fixture.paths.shortcut).expect("conflicting shortcut bytes");

        let error = restore(&FakeShell, &fixture.paths).expect_err("restore must report conflict");
        assert!(matches!(error, IntegrationError::ShortcutConflict));
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("preserved conflicting shortcut"),
            conflicting_shortcut
        );
    }

    #[test]
    fn restore_does_not_overwrite_a_user_changed_shortcut() {
        let fixture = fixture();
        let shell = FakeShell;
        install(&shell, &fixture.paths, "0.1.4", None).expect("install");
        write_fixture(&fixture.paths.shortcut, &unrelated_metadata()).expect("user shortcut");
        let user_bytes = fs::read(&fixture.paths.shortcut).expect("user bytes");

        let error = restore(&shell, &fixture.paths).expect_err("restore must report conflict");
        assert!(matches!(error, IntegrationError::ShortcutConflict));
        assert!(fixture.paths.backup.exists());
        assert!(fixture.paths.manifest.exists());
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("preserved user shortcut"),
            user_bytes
        );
    }

    #[test]
    fn corrupt_backup_blocks_restore_before_the_managed_link_changes() {
        let fixture = fixture();
        let shell = FakeShell;
        install(&shell, &fixture.paths, "0.1.4", None).expect("install");
        let managed = fs::read(&fixture.paths.shortcut).expect("managed bytes");
        fs::write(&fixture.paths.backup, b"corrupt").expect("corrupt backup");

        let error = restore(&shell, &fixture.paths).expect_err("restore must fail closed");
        assert!(matches!(error, IntegrationError::BackupCorrupt));
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("managed shortcut"),
            managed
        );
    }

    #[test]
    fn install_removes_only_verified_legacy_shortcuts() {
        let fixture = fixture();
        let shell = FakeShell;
        let owned_legacy = fixture.paths.desktop.join(LEGACY_SHORTCUT_NAME);
        let unrelated_legacy = fixture
            .paths
            .start_menu
            .as_ref()
            .expect("start menu")
            .join(LEGACY_SHORTCUT_NAME);
        let legacy_product_directory = fixture
            .paths
            .start_menu
            .as_ref()
            .expect("start menu")
            .join("Codex Live Explorer");
        fs::create_dir(&legacy_product_directory).expect("legacy product directory");
        let nested_owned_legacy = legacy_product_directory.join(LEGACY_SHORTCUT_NAME);
        write_fixture(
            &owned_legacy,
            &ShortcutMetadata {
                target: fixture.paths.launcher.to_string_lossy().into_owned(),
                description: LEGACY_DESCRIPTION.to_owned(),
                target_parsing_path: String::new(),
                icon_location: String::new(),
            },
        )
        .expect("owned legacy");
        write_fixture(
            &nested_owned_legacy,
            &ShortcutMetadata {
                target: fixture.paths.launcher.to_string_lossy().into_owned(),
                description: LEGACY_DESCRIPTION.to_owned(),
                target_parsing_path: String::new(),
                icon_location: String::new(),
            },
        )
        .expect("nested owned legacy");
        write_fixture(&unrelated_legacy, &unrelated_metadata()).expect("unrelated legacy");

        let report = install(&shell, &fixture.paths, "0.1.4", None).expect("install");
        assert_eq!(
            report.removed_legacy_shortcuts,
            vec![owned_legacy.clone(), nested_owned_legacy]
        );
        assert!(!owned_legacy.exists());
        assert!(unrelated_legacy.exists());
        assert!(!legacy_product_directory.exists());
    }

    #[test]
    fn status_distinguishes_official_managed_missing_and_conflict() {
        let fixture = fixture();
        let shell = FakeShell;
        assert_eq!(
            status(&shell, &fixture.paths)
                .expect("official status")
                .state,
            IntegrationState::Official
        );
        install(&shell, &fixture.paths, "0.1.4", None).expect("install");
        assert_eq!(
            status(&shell, &fixture.paths)
                .expect("managed status")
                .state,
            IntegrationState::Managed
        );
        fs::remove_file(&fixture.paths.shortcut).expect("remove shortcut");
        assert_eq!(
            status(&shell, &fixture.paths)
                .expect("missing status")
                .state,
            IntegrationState::Missing
        );
        write_fixture(&fixture.paths.shortcut, &unrelated_metadata()).expect("conflict fixture");
        assert_eq!(
            status(&shell, &fixture.paths)
                .expect("conflict status")
                .state,
            IntegrationState::Conflict
        );
    }

    #[test]
    fn orphaned_valid_backup_is_recovered_without_overwriting_it() {
        let fixture = fixture();
        let shell = FakeShell;
        ensure_safe_directory(&fixture.paths.state_directory, true).expect("state directory");
        create_original_backup(&fixture.paths).expect("orphaned backup");
        let backup = fs::read(&fixture.paths.backup).expect("backup bytes");

        install(&shell, &fixture.paths, "0.1.4", None).expect("recover install");
        assert_eq!(
            fs::read(&fixture.paths.backup).expect("recovered backup"),
            backup
        );
        assert!(fixture.paths.manifest.is_file());
    }

    fn assert_fresh_install_failure_is_clean_and_retryable(shell: &impl ShortcutShell) {
        let fixture = fixture();

        install(shell, &fixture.paths, "0.1.4", None).expect_err("install must fail");

        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("unchanged official shortcut"),
            fixture.original
        );
        assert!(!fixture.paths.manifest.exists());
        assert!(!fixture.paths.backup.exists());
        assert!(!fixture.paths.state_directory.exists());
        assert_eq!(
            fs::read_dir(&fixture.paths.desktop)
                .expect("desktop entries")
                .count(),
            1,
            "failed staging must not leave a temporary shortcut"
        );

        install(&FakeShell, &fixture.paths, "0.1.4", None).expect("retry install");
        restore(&FakeShell, &fixture.paths).expect("restore after retry");
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("restored official shortcut"),
            fixture.original
        );
    }

    #[test]
    fn fresh_install_stage_and_replacement_failures_are_clean_and_retryable() {
        assert_fresh_install_failure_is_clean_and_retryable(&FreshInstallFailureShell::new(
            FreshInstallFailurePoint::Create,
        ));
        assert_fresh_install_failure_is_clean_and_retryable(&FreshInstallFailureShell::new(
            FreshInstallFailurePoint::StagedInspect,
        ));
        assert_fresh_install_failure_is_clean_and_retryable(&FreshInstallFailureShell::new(
            FreshInstallFailurePoint::GuardInspect,
        ));
        assert_fresh_install_failure_is_clean_and_retryable(&ShortcutReplacementFailureShell);
    }

    #[test]
    fn ambiguous_fresh_replacement_failure_preserves_recovery_state_for_retry() {
        let fixture = fixture();

        install(&ReplaceThenFailureShell, &fixture.paths, "0.1.4", None)
            .expect_err("replacement reports failure after mutation");

        assert_eq!(
            status(&FakeShell, &fixture.paths)
                .expect("managed recovery status")
                .state,
            IntegrationState::Managed
        );
        assert!(fixture.paths.manifest.is_file());
        assert_eq!(
            fs::read(&fixture.paths.backup).expect("preserved original backup"),
            fixture.original
        );

        install(&FakeShell, &fixture.paths, "0.1.5", None).expect("retry managed install");
        restore(&FakeShell, &fixture.paths).expect("restore after retry");
        assert_eq!(
            fs::read(&fixture.paths.shortcut).expect("restored official shortcut"),
            fixture.original
        );
    }

    #[cfg(windows)]
    #[test]
    fn real_windows_shell_round_trip_restores_an_official_fixture_exactly() {
        let shell = PlatformShortcutShell::new().expect("Windows Shell bridge");
        let Some(production_desktop) = resolve_desktop().ok() else {
            return;
        };
        let production_shortcut = production_desktop.join(SHORTCUT_NAME);
        let Ok(production_metadata) = shell.inspect(&production_shortcut) else {
            return;
        };
        if !is_official(&production_metadata) {
            return;
        }

        let temporary = tempfile::tempdir().expect("temporary integration root");
        let install_root = temporary.path().join("install");
        let desktop = temporary.path().join("desktop");
        let start_menu = temporary.path().join("start-menu");
        fs::create_dir_all(&install_root).expect("install root");
        fs::create_dir_all(&desktop).expect("desktop");
        fs::create_dir_all(&start_menu).expect("start menu");
        fs::write(install_root.join(LAUNCHER_NAME), b"launcher fixture").expect("launcher");
        fs::write(install_root.join(DEFAULT_ICON_NAME), b"icon fixture").expect("icon");
        fs::copy(&production_shortcut, desktop.join(SHORTCUT_NAME)).expect("official fixture copy");
        let paths = IntegrationPaths::resolve(&install_root, Some(&desktop), Some(&start_menu))
            .expect("integration paths");
        let original = fs::read(&paths.shortcut).expect("original fixture bytes");

        let installed = install(&shell, &paths, "0.1.4", None).expect("install");
        assert_eq!(installed.state, IntegrationState::Managed);
        assert_eq!(
            status(&shell, &paths).expect("status").state,
            IntegrationState::Managed
        );
        let restored = restore(&shell, &paths).expect("restore");
        assert_eq!(restored.state, IntegrationState::Official);
        assert_eq!(
            fs::read(&paths.shortcut).expect("restored fixture bytes"),
            original
        );
    }
}
