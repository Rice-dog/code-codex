use cdp_client::BridgeError;

use serde_json::{Value, json};
use sha2::Digest as _;

use super::{
    NativeBridge, WINDOW_TRANSPARENCY_BACKGROUND, WindowTransparencyParams,
    map_window_transparency_error, operation_error,
};

impl NativeBridge {
    pub(super) fn window_transparency_set(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        self.ensure_epoch(epoch)?;
        let params: WindowTransparencyParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "window_transparency_set",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        self.inner
            .window_transparency
            .set_enabled(params.enabled, &self.inner.lifecycle_epoch, epoch)
            .map_err(map_window_transparency_error)?;
        self.ensure_epoch(epoch)?;
        Ok(json!({
            "enabled": params.enabled,
            "background": WINDOW_TRANSPARENCY_BACKGROUND,
        }))
    }
}
