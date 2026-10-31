use std::sync::atomic::Ordering;

use cdp_client::BridgeError;

use semver::Version;

use serde_json::{Value, json};
use sha2::Digest as _;

#[cfg(any(windows, not(windows)))]
use super::launch_downloaded_update;
use super::{
    NativeBridge, UPDATE_INSTALLER_ACTIVE, UpdateInstallParams, UpdateProgress, operation_error,
    require_empty_object, update_busy_error, update_internal_error,
};

impl NativeBridge {
    pub(super) async fn update_startup(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        self.ensure_epoch(epoch)?;
        let result = self
            .inner
            .update_checker
            .check_startup(env!("CARGO_PKG_VERSION"))
            .await?;
        // This launch-wide metadata has no workspace capability. A project switch
        // while GitHub responds must not turn a valid startup check into CANCELLED.
        serde_json::to_value(result).map_err(|_| update_internal_error())
    }
}

impl NativeBridge {
    pub(super) async fn update_check(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        self.ensure_epoch(epoch)?;
        let result = self
            .inner
            .update_checker
            .check(env!("CARGO_PKG_VERSION"))
            .await?;
        self.ensure_epoch(epoch)?;
        serde_json::to_value(result).map_err(|_| update_internal_error())
    }
}

impl NativeBridge {
    pub(super) async fn update_install(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        // The published installer is a Windows EXE; refuse before downloading it.
        #[cfg(not(windows))]
        return Err(BridgeError::new(
            "UPDATE_INSTALL_UNSUPPORTED",
            "Automatic Code-Codex updates are supported on Windows only.",
        ));
        #[cfg(windows)]
        if UPDATE_INSTALLER_ACTIVE.load(Ordering::Acquire) {
            return Err(update_busy_error());
        }
        self.ensure_epoch(epoch)?;
        let params: UpdateInstallParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "update_install",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let requested = Version::parse(&params.latest_version).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "update_install",
                format!("versionParseError={error}; rejected version value omitted"),
            )
        })?;
        if requested.to_string() != params.latest_version
            || !requested.pre.is_empty()
            || !requested.build.is_empty()
        {
            return Err(BridgeError::invalid_request());
        }
        let _guard = self
            .inner
            .update_install_lock
            .try_lock()
            .map_err(|_| update_busy_error())?;
        let update = self
            .inner
            .update_checker
            .download_installer(
                env!("CARGO_PKG_VERSION"),
                &params.latest_version,
                &UpdateProgress {
                    sender: self.inner.notification_sender.read().await.clone(),
                    epoch,
                    version: params.latest_version.clone(),
                },
            )
            .await?;
        self.ensure_epoch(epoch)?;
        let progress = UpdateProgress {
            sender: self.inner.notification_sender.read().await.clone(),
            epoch,
            version: params.latest_version.clone(),
        };
        progress.publish("waiting for installer window", json!({"timeoutMs":15000}));
        let result = tokio::task::spawn_blocking(move || launch_downloaded_update(update))
            .await
            .map_err(|_| update_internal_error())??;
        progress.publish(
            if result.window_ready {
                "installer window shown"
            } else {
                "installer window unconfirmed"
            },
            json!({"windowReady":result.window_ready,"installationComplete":false}),
        );
        serde_json::to_value(result).map_err(|_| update_internal_error())
    }
}
