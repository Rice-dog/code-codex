use super::{NativeBridge, internal_error, lock_unpoisoned, require_empty_object};
use cdp_client::BridgeError;
use serde::Deserialize;
use serde_json::{Value, json};

impl NativeBridge {
    pub(super) async fn login_startup_get(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let _state = lock_unpoisoned(&this.inner.state);
            this.ensure_epoch(epoch)?;
            crate::login_startup::status()
                .map(|state| json!(state))
                .map_err(|error| BridgeError::new("LOGIN_STARTUP", error.to_string()))
        })
        .await
        .map_err(|_| internal_error())?
    }

    pub(super) async fn login_startup_set(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Patch {
            enabled: bool,
        }
        let patch: Patch =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.ensure_epoch(epoch)?;
        let _update = self.inner.settings_update_lock.lock().await;
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            // Match the existing settings commit boundary: invalidated sessions
            // cannot mutate OS state while queued behind another settings write.
            let _state = lock_unpoisoned(&this.inner.state);
            this.ensure_epoch(epoch)?;
            crate::login_startup::set(patch.enabled)
                .map(|state| json!(state))
                .map_err(|error| BridgeError::new("LOGIN_STARTUP", error.to_string()))
        })
        .await
        .map_err(|_| internal_error())?
    }
}
