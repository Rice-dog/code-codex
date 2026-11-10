//! Trusted release identity shared by application and standalone setup.
pub(crate) const GITHUB_LATEST_RELEASE_ENDPOINT: &str =
    "https://api.github.com/repos/Rice-dog/code-codex/releases/latest";
use cdp_client::BridgeError;
use serde::Deserialize;
pub(crate) const MIN_UPDATE_ASSET_BYTES: u64 = 256 * 1024;
pub(crate) const MAX_UPDATE_ASSET_BYTES: u64 = 128 * 1024 * 1024;
fn update_invalid_response_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_CHECK_INVALID_RESPONSE",
        "GitHub returned an invalid update response. Try again later.",
    )
}
fn update_asset_error() -> BridgeError {
    BridgeError::new(
        "UPDATE_ASSET_UNAVAILABLE",
        "The latest release does not contain a verified Code-Codex setup program.",
    )
}
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GithubLatestRelease {
    pub(crate) tag_name: String,
    pub(crate) html_url: String,
    #[serde(default)]
    pub(crate) assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GithubReleaseAsset {
    pub(crate) name: String,
    pub(crate) browser_download_url: String,
    pub(crate) size: u64,
    pub(crate) digest: Option<String>,
}

pub(crate) fn validate_release_url(release_url: &str, tag_name: &str) -> Result<(), BridgeError> {
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

pub(crate) fn select_update_asset<'a>(
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

pub(crate) fn validate_update_asset(
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

pub(crate) fn trusted_update_download_host(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            url.host_str(),
            Some("github.com" | "release-assets.githubusercontent.com")
        )
}
