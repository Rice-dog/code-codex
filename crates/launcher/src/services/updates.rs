use std::io;
use std::io::Write as _;

use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Command;

use std::sync::atomic::Ordering;

#[cfg(windows)]
use std::thread;
use std::time::Duration;
#[cfg(windows)]
use std::time::Instant;

use base64::Engine as _;

use cdp_client::{BridgeError, BridgeNotification};

use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::Digest as _;
use tokio::sync::{Mutex, broadcast};

use super::{
    GITHUB_API_ACCEPT, GITHUB_API_VERSION, GITHUB_LATEST_RELEASE_ENDPOINT, MAX_UPDATE_ASSET_BYTES,
    MAX_UPDATE_RESPONSE_BYTES, MIN_UPDATE_ASSET_BYTES, UPDATE_CONNECT_TIMEOUT,
    UPDATE_DOWNLOAD_TIMEOUT, UPDATE_INSTALLER_ACTIVE, UPDATE_REQUEST_TIMEOUT, operation_error,
};

#[derive(Clone)]
pub(super) struct UpdateProgress {
    pub(super) sender: Option<broadcast::Sender<BridgeNotification>>,
    pub(super) epoch: u64,
    pub(super) version: String,
}

impl UpdateProgress {
    pub(super) fn publish(&self, phase: &str, details: Value) {
        crate::runtime_log::record("update", phase, "progress", details.clone());
        if let Some(sender) = &self.sender {
            let _ = sender.send(BridgeNotification { lifecycle_epoch:self.epoch,
                payload:json!({"method":"explorer.update.progress","params":{"latestVersion":self.version,"phase":phase,"details":details}}) });
        }
    }
}

pub(super) struct UpdateChecker {
    pub(super) startup_result: Mutex<Option<Result<UpdateCheckResult, BridgeError>>>,
    pub(super) client: Result<reqwest::Client, BridgeError>,
    pub(super) download_client: Result<reqwest::Client, BridgeError>,
    pub(super) endpoint: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct GithubLatestRelease {
    pub(super) tag_name: String,
    pub(super) html_url: String,
    #[serde(default)]
    pub(super) assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct GithubReleaseAsset {
    pub(super) name: String,
    pub(super) browser_download_url: String,
    pub(super) size: u64,
    pub(super) digest: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum UpdateAvailability {
    UpToDate,
    UpdateAvailable,
    Ahead,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateCheckResult {
    pub(super) current_version: String,
    pub(super) latest_version: String,
    pub(super) status: UpdateAvailability,
    pub(super) tag_name: String,
    pub(super) release_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct UpdateInstallParams {
    pub(super) latest_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateInstallResult {
    pub(super) latest_version: String,
    pub(super) launched: bool,
    pub(super) window_ready: bool,
}

impl UpdateChecker {
    pub(super) fn github() -> Self {
        Self::new(GITHUB_LATEST_RELEASE_ENDPOINT)
    }

    pub(super) fn new(endpoint: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(UPDATE_CONNECT_TIMEOUT)
            .timeout(UPDATE_REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .inspect_err(|e| {
                crate::runtime_log::record(
                    "update",
                    "HTTP client",
                    "failed",
                    crate::network_diagnostics::error_details(e),
                )
            })
            .map_err(|e| {
                crate::network_diagnostics::transport_error(
                    "UPDATE",
                    "client build",
                    "latest release client",
                    &e,
                )
            });
        let download_client = reqwest::Client::builder()
            .connect_timeout(UPDATE_CONNECT_TIMEOUT)
            .timeout(UPDATE_DOWNLOAD_TIMEOUT)
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                let allowed=attempt.previous().len()<5 && trusted_update_download_host(attempt.url());
                crate::runtime_log::record("update","HTTP redirect",if allowed{"followed"}else{"rejected"},json!({"fromHost":attempt.previous().last().and_then(|u|u.host_str()),"toHost":attempt.url().host_str(),"status":attempt.status().as_u16(),"redirectCount":attempt.previous().len()}));
                if !allowed {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .inspect_err(|e|crate::runtime_log::record("update","download client","failed",crate::network_diagnostics::error_details(e)))
            .map_err(|e|crate::network_diagnostics::transport_error("UPDATE","client build","installer download client",&e));
        Self {
            startup_result: Mutex::new(None),
            client,
            download_client,
            endpoint: endpoint.into(),
        }
    }

    // Cache both success and failure for this launcher run, across renderers and
    // bridge reconnects. Explicit checks and installation always fetch afresh.
    pub(super) async fn check_startup(
        &self,
        current_version: &str,
    ) -> Result<UpdateCheckResult, BridgeError> {
        let mut cached = self.startup_result.lock().await;
        if let Some(result) = cached.as_ref() {
            crate::runtime_log::record(
                "update",
                "startup check",
                "cached",
                json!({"networkRequested":false,"previousCheckSucceeded":result.is_ok()}),
            );
            return result.clone();
        }
        let result = self.check(current_version).await;
        *cached = Some(result.clone());
        result
    }

    pub(super) async fn check(
        &self,
        current_version: &str,
    ) -> Result<UpdateCheckResult, BridgeError> {
        classify_update(current_version, self.fetch_release(current_version).await?)
    }

    pub(super) async fn fetch_release(
        &self,
        current_version: &str,
    ) -> Result<GithubLatestRelease, BridgeError> {
        let mut trace = crate::network_diagnostics::HttpTrace::start(
            "update",
            &self.endpoint,
            5_000,
            10_000,
            json!({"purpose":"latest release","currentVersion":current_version}),
        );
        let result = self.fetch_release_inner(current_version, &mut trace).await;
        match &result {
            Ok(release)=>trace.operation.finish("passed",json!({"phase":"release parsed","releaseTag":release.tag_name,"assetCount":release.assets.len()})),
            Err(e)=>trace.operation.finish("failed",json!({"code":e.code,"reason":e.message})),
        }
        result
    }
    pub(super) async fn fetch_release_inner(
        &self,
        current_version: &str,
        trace: &mut crate::network_diagnostics::HttpTrace,
    ) -> Result<GithubLatestRelease, BridgeError> {
        let client = self.client.as_ref().map_err(Clone::clone)?;
        let mut response = trace
            .send(
                client
                    .get(&self.endpoint)
                    .header(ACCEPT, GITHUB_API_ACCEPT)
                    .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
                    .header(USER_AGENT, format!("Code-Codex/{current_version}")),
            )
            .await
            .map_err(|e| update_transport_error(update_unavailable_error(), &e, "send"))?;

        let status = response.status();
        if !status.is_success() {
            return Err(crate::network_diagnostics::http_error(
                "UPDATE",
                "latest release",
                &response,
            ));
        }
        if !response_is_json(&response)
            || response
                .content_length()
                .is_some_and(|length| length > MAX_UPDATE_RESPONSE_BYTES as u64)
        {
            return Err(update_invalid_response_error());
        }

        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| {
            trace.fail("release body", &e, body.len() as u64);
            update_transport_error(update_unavailable_error(), &e, "release body")
        })? {
            if body.len().saturating_add(chunk.len()) > MAX_UPDATE_RESPONSE_BYTES {
                return Err(update_invalid_response_error());
            }
            body.extend_from_slice(&chunk);
        }
        trace.operation.event(
            "release body",
            "received",
            json!({"receivedBytes":body.len()}),
        );
        serde_json::from_slice(&body).map_err(|e| {
            trace.operation.event(
                "release JSON",
                "failed",
                crate::network_diagnostics::error_details(&e),
            );
            update_invalid_response_error()
        })
    }

    pub(super) async fn download_installer(
        &self,
        current_version: &str,
        expected_latest_version: &str,
        progress: &UpdateProgress,
    ) -> Result<DownloadedUpdate, BridgeError> {
        let mut operation = crate::runtime_log::Operation::start(
            "update",
            "prepare installer",
            json!({"currentVersion":current_version,"requestedVersion":expected_latest_version}),
        );
        let result = self
            .download_installer_inner(
                current_version,
                expected_latest_version,
                &operation,
                progress,
            )
            .await;
        match &result {
            Ok(_) => operation.finish("passed", json!({"integrityVerified":true})),
            Err(e) => operation.finish("failed", json!({"code":e.code,"reason":e.message})),
        }
        result
    }
    pub(super) async fn download_installer_inner(
        &self,
        current_version: &str,
        expected_latest_version: &str,
        operation: &crate::runtime_log::Operation,
        progress: &UpdateProgress,
    ) -> Result<DownloadedUpdate, BridgeError> {
        progress.publish("checking release", json!({}));
        let release = self.fetch_release(current_version).await?;
        let update = classify_update(current_version, release.clone())?;
        if update.status != UpdateAvailability::UpdateAvailable
            || update.latest_version != expected_latest_version
        {
            return Err(update_no_longer_available_error());
        }
        let asset = select_update_asset(&release, &update.latest_version)?;
        let expected_digest =
            validate_update_asset(asset, &release.tag_name, &update.latest_version)?;
        progress.publish(
            "downloading",
            json!({"expectedBytes":asset.size,"receivedBytes":0,"percent":0}),
        );
        operation.event("installer asset","selected",json!({"releaseTag":release.tag_name,"expectedBytes":asset.size,"expectedSha256":expected_digest}));
        let download_client = self.download_client.as_ref().map_err(Clone::clone)?;
        let mut trace = crate::network_diagnostics::HttpTrace::start(
            "update",
            &asset.browser_download_url,
            5_000,
            180_000,
            json!({"purpose":"installer","expectedBytes":asset.size,"parentOperationId":operation.id()}),
        );
        let result=async {
        let mut response = trace.send(download_client
            .get(&asset.browser_download_url)
            .header(ACCEPT, "application/octet-stream")
            .header(USER_AGENT, format!("Code-Codex/{current_version}")))
            .await
            .map_err(|e|update_transport_error(update_download_error(),&e,"send"))?;
        if !response.status().is_success() {
            return Err(crate::network_diagnostics::http_error("UPDATE","installer download",&response));
        }
        if !trusted_update_download_host(response.url())
            || response
                .content_length()
                .is_some_and(|length| length != asset.size || length > MAX_UPDATE_ASSET_BYTES)
        {
            return Err(operation_error(update_download_error(),"validating installer HTTP headers",format!("status={}; trustedFinalHost={}; contentLength={:?}; expectedBytes={}; maxBytes={MAX_UPDATE_ASSET_BYTES}",response.status().as_u16(),trusted_update_download_host(response.url()),response.content_length(),asset.size)));
        }

        let directory = tempfile::Builder::new()
            .prefix("CodeCodex-Update-")
            .tempdir_in(workspace_service::application_paths::temp_root().map_err(|error|operation_error(update_download_error(),"resolving update temporary root",error))?)
            .map_err(|error|update_local_error("creating update temporary directory",&error))?;
        let installer_path = directory.path().join(&asset.name);
        let mut file =
            std::fs::File::create(&installer_path).map_err(|error|update_local_error("creating downloaded installer file",&error))?;
        let mut digest = sha2::Sha256::new();
        let mut downloaded = 0_u64;
        let mut last_percent = 0;
        let mut transfer=crate::network_diagnostics::TransferProgress::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e|{trace.fail("installer body",&e,downloaded);update_transport_error(update_download_error(),&e,"installer body")})?
        {
            downloaded = downloaded.saturating_add(chunk.len() as u64);
            if downloaded > asset.size || downloaded > MAX_UPDATE_ASSET_BYTES {
                return Err(update_download_error());
            }
            file.write_all(&chunk)
                .map_err(|error|update_local_error("writing downloaded installer chunk",&error))?;
            sha2::Digest::update(&mut digest, &chunk);
            transfer.observe(&trace.operation,downloaded,asset.size);
            let percent = downloaded.saturating_mul(100) / asset.size.max(1);
            if percent > last_percent {
                last_percent = percent;
                progress.publish("downloading", json!({"receivedBytes":downloaded,"expectedBytes":asset.size,"percent":percent.min(100)}));
            }
        }
        progress.publish("verifying", json!({"receivedBytes":downloaded}));
        file.sync_all().map_err(|error|update_local_error("flushing downloaded installer file",&error))?;
        drop(file);
        let observed_digest=format!("{:x}",sha2::Digest::finalize(digest));
        operation.event("installer integrity","checked",json!({"expectedBytes":asset.size,"receivedBytes":downloaded,"expectedSha256":expected_digest,"observedSha256":observed_digest,"matches":downloaded==asset.size && observed_digest==expected_digest}));
        if downloaded != asset.size
            || observed_digest != expected_digest
        {
            return Err(operation_error(update_verification_error(),"verifying downloaded installer",format!("expectedBytes={}; receivedBytes={downloaded}; digestMatches={}",asset.size,observed_digest==expected_digest)));
        }

        Ok(DownloadedUpdate {
            installer_path,
            directory,
            latest_version: update.latest_version,
        })
        }.await;
        match &result {
            Ok(_) => trace
                .operation
                .finish("passed", json!({"integrityVerified":true})),
            Err(e) => trace
                .operation
                .finish("failed", json!({"code":e.code,"reason":e.message})),
        }
        result
    }
}

pub(super) fn update_local_error(operation: &str, error: &std::io::Error) -> BridgeError {
    operation_error(
        BridgeError::new(
            "UPDATE_LOCAL_IO",
            "The update's local temporary file operation failed.",
        ),
        operation,
        format!(
            "ioKind={:?}; osCode={:?}; cause={error}",
            error.kind(),
            error.raw_os_error()
        ),
    )
}

pub(super) fn update_transport_error(
    base: BridgeError,
    error: &reqwest::Error,
    phase: &str,
) -> BridgeError {
    crate::network_diagnostics::transport_error("UPDATE", phase, &base.code, error)
}

pub(super) struct DownloadedUpdate {
    pub(super) installer_path: std::path::PathBuf,
    pub(super) directory: tempfile::TempDir,
    pub(super) latest_version: String,
}

pub(super) fn response_is_json(response: &reqwest::Response) -> bool {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"))
}

pub(super) fn classify_update(
    current_version: &str,
    release: GithubLatestRelease,
) -> Result<UpdateCheckResult, BridgeError> {
    let current = Version::parse(current_version).map_err(|error| {
        operation_error(update_internal_error(), "parsing installed version", error)
    })?;
    if release.tag_name.len() > 80 {
        return Err(update_invalid_response_error());
    }
    let latest_text = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name);
    let latest = Version::parse(latest_text).map_err(|error| {
        operation_error(
            update_invalid_response_error(),
            "parsing release version",
            error,
        )
    })?;
    if !latest.pre.is_empty() || !latest.build.is_empty() {
        return Err(update_invalid_response_error());
    }
    validate_release_url(&release.html_url, &release.tag_name)?;

    let status = match current.cmp(&latest) {
        std::cmp::Ordering::Less => UpdateAvailability::UpdateAvailable,
        std::cmp::Ordering::Equal => UpdateAvailability::UpToDate,
        std::cmp::Ordering::Greater => UpdateAvailability::Ahead,
    };
    Ok(UpdateCheckResult {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        status,
        tag_name: release.tag_name,
        release_url: release.html_url,
    })
}

pub(super) fn validate_release_url(release_url: &str, tag_name: &str) -> Result<(), BridgeError> {
    if release_url.len() > 512 {
        return Err(update_invalid_response_error());
    }
    let parsed = url::Url::parse(release_url).map_err(|_| update_invalid_response_error())?;
    let expected_path = format!("/Rice-dog/code-codex/releases/tag/{tag_name}");
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != expected_path
    {
        return Err(update_invalid_response_error());
    }
    Ok(())
}

pub(super) fn select_update_asset<'a>(
    release: &'a GithubLatestRelease,
    latest_version: &str,
) -> Result<&'a GithubReleaseAsset, BridgeError> {
    let expected_name = format!("CodeCodex-{latest_version}-x64-setup.exe");
    let mut matches = release
        .assets
        .iter()
        .filter(|asset| asset.name == expected_name);
    let asset = matches.next().ok_or_else(update_asset_error)?;
    if matches.next().is_some() {
        return Err(update_asset_error());
    }
    Ok(asset)
}

pub(super) fn validate_update_asset(
    asset: &GithubReleaseAsset,
    tag_name: &str,
    latest_version: &str,
) -> Result<String, BridgeError> {
    let expected_name = format!("CodeCodex-{latest_version}-x64-setup.exe");
    if asset.name != expected_name
        || asset.size < MIN_UPDATE_ASSET_BYTES
        || asset.size > MAX_UPDATE_ASSET_BYTES
        || asset.browser_download_url.len() > 1_024
    {
        return Err(update_asset_error());
    }
    let parsed = url::Url::parse(&asset.browser_download_url).map_err(|_| update_asset_error())?;
    let expected_path =
        format!("/Rice-dog/code-codex/releases/download/{tag_name}/{expected_name}");
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != expected_path
    {
        return Err(update_asset_error());
    }
    let digest = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .map(str::to_ascii_lowercase)
        .ok_or_else(update_asset_error)?;
    Ok(digest)
}

pub(super) fn trusted_update_download_host(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            url.host_str(),
            Some("github.com" | "release-assets.githubusercontent.com")
        )
}

#[cfg(windows)]
pub(super) fn launch_downloaded_update(
    update: DownloadedUpdate,
) -> Result<UpdateInstallResult, BridgeError> {
    if UPDATE_INSTALLER_ACTIVE.swap(true, Ordering::AcqRel) {
        return Err(update_busy_error());
    }
    let ready_path = update.directory.path().join("window-ready");
    let mut operation = crate::runtime_log::Operation::start(
        "update",
        "installer window handoff",
        json!({"latestVersion":update.latest_version,"timeoutMs":15000}),
    );
    let mut child = Command::new(&update.installer_path)
        .env("CLE_UPDATE_WINDOW_READY", &ready_path)
        .spawn()
        .map_err(|error| {
            UPDATE_INSTALLER_ACTIVE.store(false, Ordering::Release);
            operation.finish("failed",json!({"phase":"spawn","osCode":error.raw_os_error(),"kind":format!("{:?}",error.kind())}));
            operation_error(update_launch_error(),"starting verified installer process",format!("ioKind={:?}; osCode={:?}",error.kind(),error.raw_os_error()))
        })?;
    operation.event("installer process", "started", json!({"pid":child.id()}));
    let started = Instant::now();
    let outcome =
        await_installer_window(&mut child, &ready_path, Duration::from_secs(15), &operation);
    let window_ready = outcome.as_ref().copied().unwrap_or(false);
    let failure = outcome.err();
    operation.finish(if window_ready {"passed"} else if failure.is_some() {"failed"} else {"timeout"}, json!({"windowReady":window_ready,"durationMs":started.elapsed().as_millis(),"installationComplete":false,"processNotTerminated":true}));
    let retained_directory = update.directory.keep();
    let installer_path = update.installer_path;
    thread::spawn(move || {
        let _ = child.wait();
        UPDATE_INSTALLER_ACTIVE.store(false, Ordering::Release);
        let _ = std::fs::remove_file(installer_path);
        let _ = std::fs::remove_file(ready_path);
        let _ = std::fs::remove_dir(retained_directory);
    });
    if let Some(error) = failure {
        return Err(error);
    }
    Ok(UpdateInstallResult {
        latest_version: update.latest_version,
        launched: true,
        window_ready,
    })
}

#[cfg(windows)]
pub(super) fn await_installer_window(
    child: &mut std::process::Child,
    ready_path: &Path,
    budget: Duration,
    operation: &crate::runtime_log::Operation,
) -> Result<bool, BridgeError> {
    let started = Instant::now();
    loop {
        if std::fs::read_to_string(ready_path).is_ok_and(|s| s == "ready") {
            return Ok(true);
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                operation.event(
                    "installer process",
                    "exited",
                    json!({"exitCode":status.code()}),
                );
                return Err(BridgeError::new(
                    "UPDATE_INSTALLER_EARLY_EXIT",
                    "The installer exited before its window appeared. Check the installation diagnostic report.",
                ));
            }
            Err(error) => {
                operation.event(
                    "installer process",
                    "failed",
                    json!({"osCode":error.raw_os_error(),"kind":format!("{:?}",error.kind())}),
                );
                return Err(update_local_error(
                    "checking installer process state",
                    &error,
                ));
            }
            _ if started.elapsed() >= budget => return Ok(false),
            _ => thread::sleep(Duration::from_millis(50)),
        }
    }
}

#[cfg(not(windows))]
pub(super) fn launch_downloaded_update(
    _update: DownloadedUpdate,
) -> Result<UpdateInstallResult, BridgeError> {
    Err(BridgeError::new(
        "UPDATE_INSTALL_UNSUPPORTED",
        "Automatic Code-Codex updates are supported on Windows only.",
    ))
}

pub(super) fn update_unavailable_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_UNAVAILABLE",
        "GitHub could not be reached. Check your connection and try again.",
    )
}

pub(super) fn update_invalid_response_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_INVALID_RESPONSE",
        "GitHub returned an invalid update response. Try again later.",
    )
}

pub(super) fn update_internal_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_FAILED",
        "The installed Code-Codex version could not be checked.",
    )
}

pub(super) fn update_no_longer_available_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_NO_LONGER_AVAILABLE",
        "The selected Code-Codex update is no longer the latest release.",
    )
}

pub(super) fn update_asset_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_ASSET_UNAVAILABLE",
        "The latest release does not contain a verified Code-Codex setup program.",
    )
}

pub(super) fn update_download_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_DOWNLOAD_FAILED",
        "The Code-Codex update could not be downloaded from GitHub.",
    )
}

pub(super) fn update_verification_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_VERIFY_FAILED",
        "The downloaded Code-Codex update did not pass integrity verification.",
    )
}

pub(super) fn update_launch_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_LAUNCH_FAILED",
        "The verified Code-Codex setup program could not be opened.",
    )
}

pub(super) fn update_busy_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_INSTALL_BUSY",
        "Another Code-Codex update is already being prepared.",
    )
}
