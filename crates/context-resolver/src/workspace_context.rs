use std::path::PathBuf;

use serde_json::Value;

use super::{ResolverError, ThreadWorkspace};

pub(super) fn parse_thread_workspace(
    result: &Value,
    field: &str,
    expected_id: &str,
) -> Result<ThreadWorkspace, ResolverError> {
    let thread = result.get(field).ok_or(ResolverError::Protocol)?;
    let id = thread
        .get("id")
        .and_then(Value::as_str)
        .ok_or(ResolverError::Protocol)?;
    if id != expected_id {
        return Err(ResolverError::Protocol);
    }
    let cwd = thread
        .get("cwd")
        .and_then(Value::as_str)
        .filter(|cwd| !cwd.is_empty())
        .ok_or(ResolverError::NoWorkspace)?;
    Ok(ThreadWorkspace {
        thread_id: expected_id.to_owned(),
        cwd: PathBuf::from(cwd),
    })
}

pub(super) fn parse_started_notification(message: &Value) -> Option<ThreadWorkspace> {
    let thread = message.get("params")?.get("thread")?;
    let thread_id = thread.get("id")?.as_str()?;
    validate_thread_id(thread_id).ok()?;
    let cwd = thread.get("cwd")?.as_str()?.trim();
    if cwd.is_empty() {
        return None;
    }
    Some(ThreadWorkspace {
        thread_id: thread_id.to_owned(),
        cwd: PathBuf::from(cwd),
    })
}

pub(super) fn validate_thread_id(thread_id: &str) -> Result<(), ResolverError> {
    if thread_id.is_empty()
        || thread_id.len() > 256
        || !thread_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(ResolverError::InvalidThreadId);
    }
    Ok(())
}
