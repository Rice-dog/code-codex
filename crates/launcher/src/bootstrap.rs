use std::path::{Path, PathBuf};

use cdp_client::{CapabilityToken, PRIMARY_BINDING_NAME};
use serde::Serialize;
use thiserror::Error;

const MAX_UI_BUNDLE_BYTES: u64 = 5 * 1024 * 1024;
const EMBEDDED_UI_BUNDLE: &str = include_str!("../../../packages/explorer-ui/dist/explorer.js");

#[derive(Debug, Error)]
pub enum BootstrapError {
    #[error("the Explorer UI bundle was not found")]
    BundleNotFound,
    #[error("the Explorer UI bundle is invalid")]
    InvalidBundle,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapMetadata<'a> {
    token: &'a str,
    binding: &'a str,
    codex_version: &'a str,
    channel: &'a str,
    compatible: bool,
    manual_workspace: bool,
}

#[derive(Debug, Clone)]
pub enum BundleSource {
    Embedded,
    DevelopmentOverride(PathBuf),
}

pub fn resolve_bundle(explicit: Option<&Path>) -> Result<BundleSource, BootstrapError> {
    if let Some(explicit) = explicit {
        return validate_bundle_path(explicit).map(BundleSource::DevelopmentOverride);
    }
    if EMBEDDED_UI_BUNDLE.is_empty() || EMBEDDED_UI_BUNDLE.len() as u64 > MAX_UI_BUNDLE_BYTES {
        return Err(BootstrapError::InvalidBundle);
    }
    Ok(BundleSource::Embedded)
}

fn validate_bundle_path(path: &Path) -> Result<PathBuf, BootstrapError> {
    let canonical = dunce::canonicalize(path).map_err(|_| BootstrapError::BundleNotFound)?;
    let metadata = canonical
        .metadata()
        .map_err(|_| BootstrapError::InvalidBundle)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_UI_BUNDLE_BYTES {
        return Err(BootstrapError::InvalidBundle);
    }
    Ok(canonical)
}

pub fn build_bootstrap(
    bundle_source: &BundleSource,
    token: &CapabilityToken,
    codex_version: &str,
    channel: &str,
    compatible: bool,
    manual_workspace: bool,
) -> Result<String, BootstrapError> {
    let development_bundle;
    let bundle = match bundle_source {
        BundleSource::Embedded => EMBEDDED_UI_BUNDLE,
        BundleSource::DevelopmentOverride(path) => {
            development_bundle =
                std::fs::read_to_string(path).map_err(|_| BootstrapError::InvalidBundle)?;
            &development_bundle
        }
    };
    if bundle.len() as u64 > MAX_UI_BUNDLE_BYTES {
        return Err(BootstrapError::InvalidBundle);
    }
    let metadata = BootstrapMetadata {
        token: token.expose(),
        binding: PRIMARY_BINDING_NAME,
        codex_version,
        channel,
        compatible,
        manual_workspace,
    };
    let metadata = serde_json::to_string(&metadata).map_err(|_| BootstrapError::InvalidBundle)?;
    Ok(format!(
        "(()=>{{'use strict';if(window!==window.top||location.protocol!=='app:'||location.host!=='-'){{return;}}const bootstrap=Object.freeze({metadata});Object.defineProperty(window,'__CODE_CODEX_BOOTSTRAP__',{{value:bootstrap,writable:false,configurable:true,enumerable:false}});try{{\n{bundle}\n}}finally{{try{{delete window.__CODE_CODEX_BOOTSTRAP__;}}catch(_error){{}}}}}})();\n//# sourceURL=code-codex://explorer.js"
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    #[test]
    fn embeds_metadata_without_leaking_token_via_debug() {
        let directory = TempDir::new().expect("temp dir");
        let bundle = directory.path().join("explorer.js");
        fs::write(&bundle, "window.__bundleLoaded=true;").expect("bundle");
        let token = CapabilityToken::generate();
        let source = build_bootstrap(
            &BundleSource::DevelopmentOverride(bundle),
            &token,
            "26.715.3651.0",
            "beta",
            true,
            false,
        )
        .expect("bootstrap");
        assert!(source.contains(token.expose()));
        assert!(source.contains("26.715.3651.0"));
        assert!(source.contains("\"manualWorkspace\":false"));
        assert!(source.contains("__CODE_CODEX_BOOTSTRAP__"));
        assert!(source.contains("delete window.__CODE_CODEX_BOOTSTRAP__"));
        let guard = source.find("window!==window.top").expect("top-frame guard");
        let exposed_token = source.find(token.expose()).expect("token metadata");
        assert!(guard < exposed_token);
        assert!(source.contains("location.protocol!=='app:'"));
        assert!(source.contains("location.host!=='-'"));
        assert!(!format!("{token:?}").contains(token.expose()));
    }

    #[test]
    fn rejects_empty_bundle() {
        let directory = TempDir::new().expect("temp dir");
        let bundle = directory.path().join("empty.js");
        fs::write(&bundle, "").expect("empty bundle");
        assert!(validate_bundle_path(&bundle).is_err());
    }

    #[test]
    fn default_bundle_is_embedded_and_non_empty() {
        let source = resolve_bundle(None).expect("embedded source");
        assert!(matches!(source, BundleSource::Embedded));
        let token = CapabilityToken::generate();
        let bootstrap = build_bootstrap(&source, &token, "26.715.3651.0", "beta", true, true)
            .expect("embedded bootstrap");
        assert!(bootstrap.len() > token.expose().len() + 1_000);
        assert!(bootstrap.contains("\"manualWorkspace\":true"));
    }
}
