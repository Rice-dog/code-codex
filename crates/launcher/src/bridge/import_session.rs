use cdp_client::BridgeError;

use sha2::Digest as _;

use super::{BridgeState, cancelled_error, no_context_error};
pub(super) fn abort_import_locked(state: &mut BridgeState) {
    if let Some(active) = state.import_session.take()
        && active.session.abort().is_err()
    {
        tracing::warn!(event = "workspace_import_cleanup_failed");
    }
}

pub(super) fn validate_import_session_id(session_id: &str) -> Result<(), BridgeError> {
    if session_id.len() == 43
        && session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Ok(())
    } else {
        Err(BridgeError::invalid_request())
    }
}

pub(super) fn validate_active_import(
    state: &BridgeState,
    epoch: u64,
    session_id: &str,
) -> Result<(), BridgeError> {
    let context = state.current.as_ref().ok_or_else(no_context_error)?;
    let active = state
        .import_session
        .as_ref()
        .ok_or_else(invalid_import_session_error)?;
    if active.id != session_id {
        return Err(invalid_import_session_error());
    }
    if active.lifecycle_epoch != epoch
        || context.lifecycle_epoch != epoch
        || active.context_revision != context.revision
    {
        return Err(cancelled_error());
    }
    Ok(())
}

pub(super) fn invalid_import_session_error() -> BridgeError {
    BridgeError::new("INVALID_REQUEST", "The file import session is invalid.")
}

pub(super) fn import_busy_error() -> BridgeError {
    BridgeError::new("CONFLICT", "Another file import is already active.")
}
