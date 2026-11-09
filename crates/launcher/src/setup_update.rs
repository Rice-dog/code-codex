//! Independent online setup admission. Installation stays owned by the existing wizard.
use crate::{gui_support, update_contract};
use semver::Version;
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};

pub(crate) struct Prepared {
    directory: tempfile::TempDir,
    executable: std::path::PathBuf,
    version: String,
}

pub(crate) fn bundled_is_older(arguments: &[OsString]) -> bool {
    let Some(index) = arguments
        .iter()
        .position(|v| v.eq_ignore_ascii_case("-InstallRoot"))
    else {
        return false;
    };
    let Some(root) = arguments.get(index + 1) else {
        return false;
    };
    let Ok(text) = fs::read_to_string(Path::new(root).join("current-version")) else {
        return false;
    };
    let Ok(installed) = Version::parse(text.trim()) else {
        return false;
    };
    Version::parse(env!("CARGO_PKG_VERSION")).is_ok_and(|bundled| installed > bundled)
}

#[derive(Clone)]
pub(crate) struct Available {
    asset: update_contract::GithubReleaseAsset,
    version: String,
    digest: String,
}
pub(crate) type WelcomeCheck =
    std::sync::Arc<std::sync::Mutex<Option<Result<Option<Available>, String>>>>;

pub(crate) fn begin_welcome_check(
    progress: &gui_support::ProgressDialog,
    offline: bool,
) -> WelcomeCheck {
    let result = std::sync::Arc::new(std::sync::Mutex::new(None));
    let output = result.clone();
    let journal = progress.journal();
    let path = progress
        .state_path()
        .expect("ready setup state")
        .parent()
        .expect("setup state directory")
        .join("update.json");
    std::thread::spawn(move || {
        let checked = if offline { Ok(None) } else { check() };
        match &checked {
            Ok(Some(value))=>journal.event("welcome update check","available",serde_json::json!({"version":value.version})),
            Ok(None)=>journal.event("welcome update check","bundled",serde_json::json!({"offline":offline})),
            Err(reason)=>journal.event("welcome update check","failed",serde_json::json!({"reason":reason})),
        }
        let view = match &checked {
            Ok(Some(available)) => {
                serde_json::json!({"state":"available","version":available.version})
            }
            Ok(None) => serde_json::json!({"state":if offline{"offline"}else{"current"}}),
            Err(error) => {
                serde_json::json!({"state":if error.starts_with("SETUP_UPDATE_CHECK:")||error.starts_with("SETUP_UPDATE_HTTP:")||error.starts_with("SETUP_UPDATE_METADATA_BODY:"){"network"}else{"error"}})
            }
        };
        if let Ok(mut slot) = output.lock() {
            *slot = Some(checked);
        }
        let staged = path.with_extension("tmp");
        if fs::write(&staged, view.to_string()).is_ok() {
            let _ = fs::rename(staged, path);
        }
    });
    result
}

pub(crate) fn check() -> Result<Option<Available>, String> {
    let bundled = Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("Code-Codex-Setup/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| format!("SETUP_UPDATE_CLIENT: {e}"))?;
        let mut response = client
            .get(update_contract::GITHUB_LATEST_RELEASE_ENDPOINT)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| format!("SETUP_UPDATE_CHECK: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("SETUP_UPDATE_HTTP: status={}", response.status()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("SETUP_UPDATE_METADATA_BODY: {e}"))?
        {
            if bytes.len() + chunk.len() > 256 * 1024 {
                return Err("SETUP_UPDATE_METADATA_LIMIT".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let release: update_contract::GithubLatestRelease =
            serde_json::from_slice(&bytes).map_err(|e| format!("SETUP_UPDATE_METADATA: {e}"))?;
        update_contract::validate_release_url(&release.html_url, &release.tag_name)
            .map_err(|e| e.message)?;
        let latest = Version::parse(
            release
                .tag_name
                .strip_prefix('v')
                .unwrap_or(&release.tag_name),
        )
        .map_err(|e| format!("SETUP_UPDATE_VERSION: {e}"))?;
        if !latest.pre.is_empty() || !latest.build.is_empty() {
            return Err("SETUP_UPDATE_UNSTABLE_RELEASE".into());
        }
        if latest <= bundled {
            return Ok(None);
        }
        let asset = update_contract::select_update_asset(&release, &latest.to_string())
            .map_err(|e| e.message)?;
        let digest =
            update_contract::validate_update_asset(asset, &release.tag_name, &latest.to_string())
                .map_err(|e| e.message)?;
        Ok(Some(Available {
            asset: asset.clone(),
            version: latest.to_string(),
            digest,
        }))
    })
}

pub(crate) fn download(
    available: Available,
    arguments: &[OsString],
    progress: &mut gui_support::ProgressDialog,
) -> Result<Prepared, String> {
    if let Some(index) = arguments
        .iter()
        .position(|v| v.eq_ignore_ascii_case("-InstallRoot"))
    {
        if let Some(root) = arguments.get(index + 1) {
            if let Ok(text) = fs::read_to_string(Path::new(root).join("current-version")) {
                if let Ok(installed) = Version::parse(text.trim()) {
                    if Version::parse(&available.version).is_ok_and(|latest| latest < installed) {
                        return Err("SETUP_UPDATE_DOWNGRADE".into());
                    }
                }
            }
        }
    }
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    let asset = &available.asset;
    runtime.block_on(async {
        progress.set_progress_detail(
            10,
            "Downloading",
            "Downloading the latest verified installer.",
        );
        let download = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5
                    && update_contract::trusted_update_download_host(attempt.url())
                {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .user_agent("Code-Codex-Setup")
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = download
            .get(&asset.browser_download_url)
            .send()
            .await
            .map_err(|e| format!("SETUP_UPDATE_DOWNLOAD: {e}"))?;
        if !response.status().is_success()
            || !update_contract::trusted_update_download_host(response.url())
        {
            return Err("SETUP_UPDATE_DOWNLOAD_RESPONSE".into());
        }
        let directory = tempfile::Builder::new()
            .prefix("CodeCodex-Setup-Update-")
            .tempdir()
            .map_err(|e| e.to_string())?;
        let executable = directory.path().join(&asset.name);
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&executable)
            .map_err(|e| e.to_string())?;
        let mut size = 0u64;
        let mut hash = Sha256::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("SETUP_UPDATE_DOWNLOAD_BODY: {e}"))?
        {
            if !progress.window_open() {
                return Err("SETUP_UPDATE_CANCELLED".into());
            }
            size += chunk.len() as u64;
            if size > asset.size {
                return Err("SETUP_UPDATE_SIZE".into());
            }
            hash.update(&chunk);
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            progress.set_progress_detail(
                10 + (size * 65 / asset.size) as u8,
                "Downloading",
                "Downloading the latest verified installer.",
            );
        }
        file.sync_all().map_err(|e| e.to_string())?;
        if size != asset.size || format!("{:x}", hash.finalize()) != available.digest {
            return Err("SETUP_UPDATE_INTEGRITY".into());
        }
        if !progress.window_open() {
            return Err("SETUP_UPDATE_CANCELLED".into());
        }
        Ok(Prepared {
            directory,
            executable,
            version: available.version.clone(),
        })
    })
}

impl Prepared {
    pub(crate) fn install(self, arguments: &[OsString], original: &Path) -> Result<bool, String> {
        let receipt = self.directory.path().join("installed-receipt");
        let status = Command::new(&self.executable)
            .args(arguments)
            .env("CODECODEX_SETUP_OFFLINE", "1")
            .env("CODECODEX_SETUP_RECEIPT", &receipt)
            .env(
                "CLE_UPDATE_WINDOW_READY",
                self.directory.path().join("window-ready"),
            )
            .status()
            .map_err(|e| format!("SETUP_UPDATE_LAUNCH: {e}"))?;
        if !status.success() {
            return Err(format!("SETUP_UPDATE_INSTALL: exit={:?}", status.code()));
        }
        if fs::read_to_string(&receipt).ok().as_deref() != Some(self.version.as_str()) {
            return Ok(false);
        }
        // The old setup still maps its executable. A bounded helper waits for
        // this exact process before committing the new bytes beside the original.
        let script = self.directory.path().join("replace.ps1");
        fs::write(&script, REPLACE).map_err(|e| e.to_string())?;
        let mut helper = Command::new(gui_support::trusted_system32_powershell()?);
        helper
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&script)
            .arg("-ParentPid")
            .arg(std::process::id().to_string())
            .arg("-Source")
            .arg(&self.executable)
            .arg("-Target")
            .arg(original)
            .arg("-ExpectedHash")
            .arg(format!(
                "{:x}",
                Sha256::digest(fs::read(&self.executable).map_err(|e| e.to_string())?)
            ))
            .env("CLE_SETUP_REPLACE_FAILURE",gui_support::localization::text("Code-Codex was installed, but the saved setup file could not be updated. You can keep using it to check for new versions."))
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        gui_support::configure_hidden(&mut helper);
        if helper.spawn().is_err() {
            gui_support::show_dialog(
                "Code-Codex setup",
                "Code-Codex was installed, but the saved setup file could not be updated. You can keep using it to check for new versions.",
                false,
            );
            return Ok(true);
        }
        let _retained_for_helper = self.directory.keep();
        Ok(true)
    }
}
const REPLACE: &str = r#"param([int]$ParentPid,[string]$Source,[string]$Target,[string]$ExpectedHash)
$ErrorActionPreference='Stop'
try {
 $p=Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
 if($p -and -not $p.WaitForExit(120000)){exit 1}
 if(-not [IO.File]::Exists($Source)){exit 1}
 if(([IO.File]::GetAttributes($Source) -band [IO.FileAttributes]::ReparsePoint) -or ([IO.File]::GetAttributes($Target) -band [IO.FileAttributes]::ReparsePoint)){exit 1}
 if((Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash -ne $ExpectedHash){exit 1}
 $stage=$Target+'.update-'+[Guid]::NewGuid().ToString('N')
 [IO.File]::Copy($Source,$stage,$false)
 [IO.File]::Replace($stage,$Target,$null)
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'replacement-result.txt'),'replaced')
 if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Source)) -eq [IO.Path]::GetFullPath($PSScriptRoot)){try{[IO.File]::Delete($Source)}catch{}}
} catch {
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'replacement-result.txt'),'SETUP_REPLACEMENT_FAILED: '+$_.Exception.Message)
 Add-Type -AssemblyName System.Windows.Forms
 [void][Windows.Forms.MessageBox]::Show($env:CLE_SETUP_REPLACE_FAILURE,'Code-Codex setup')
 exit 1
}
"#;
