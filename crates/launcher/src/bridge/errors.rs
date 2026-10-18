use cdp_client::BridgeError;

pub(super) fn operation_error(
    mut base: BridgeError,
    operation: &str,
    detail: impl std::fmt::Display,
) -> BridgeError {
    base.message = format!(
        "{} Operation: {}; details: {}",
        base.message,
        operation,
        crate::runtime_log::redaction::text(&detail.to_string())
    );
    base
}
