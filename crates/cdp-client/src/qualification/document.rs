use std::collections::VecDeque;

use std::time::Duration;

use serde_json::{Value, json};

use super::{CdpEndpoint, CdpError, INITIAL_RENDERER_QUALIFICATION_TIMEOUT};
use url::Url;

pub(super) fn validate_websocket_url(endpoint: CdpEndpoint, raw_url: &str) -> Result<(), CdpError> {
    let url = Url::parse(raw_url).map_err(|_| CdpError::InvalidWebSocketEndpoint)?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    if url.scheme() != "ws" || !loopback || url.port_or_known_default() != Some(endpoint.port()) {
        return Err(CdpError::InvalidWebSocketEndpoint);
    }
    Ok(())
}

pub(super) fn layout_observation(value: &Value) -> Value {
    let mut result = serde_json::Map::new();
    for name in [
        "diagnosticVersion",
        "topFrame",
        "appOrigin",
        "accepted",
        "mainCount",
        "totalMainCount",
        "inactiveMainCount",
        "activePageCount",
        "sidebarTriggerCount",
        "nativeFeaturePage",
        "nativeLoginPage",
        "legacyShellMatch",
        "workspaceRowPresent",
        "rowMainCount",
        "mainContentClip",
        "directRailCount",
        "workspaceCount",
        "railBeforeWorkspace",
        "workspaceContainsMain",
    ] {
        if let Some(v) = value.get(name).filter(|v| v.is_boolean() || v.is_u64()) {
            result.insert(name.to_owned(), v.clone());
        }
    }
    // Never copy titles, URLs, page text, arbitrary strings or raw ancestor shapes.
    Value::Object(result)
}

pub(super) fn renderer_probe_matches(result: &Value) -> bool {
    result
        .get("result")
        .and_then(|remote_object| remote_object.get("value"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(super) fn renderer_document_is_loading(result: &Value) -> bool {
    result
        .get("result")
        .and_then(|remote_object| remote_object.get("value"))
        .and_then(Value::as_str)
        == Some("loading")
}

pub(super) fn initial_qualification_retry_timeout(
    observed_loading_document: bool,
    recently_qualified_grace: Duration,
    canonical_startup_grace: bool,
    cold_startup_timeout: Option<Duration>,
) -> Duration {
    let loading_grace = if observed_loading_document {
        INITIAL_RENDERER_QUALIFICATION_TIMEOUT
    } else {
        Duration::ZERO
    };
    let relative_grace = recently_qualified_grace.max(loading_grace);
    match cold_startup_timeout {
        Some(remaining) if canonical_startup_grace => remaining,
        Some(remaining) => relative_grace.min(remaining),
        // No absolute cold deadline + canonical first page is the owned-run
        // wait policy. Navigation/replacement and auxiliary pages never use it.
        None if canonical_startup_grace => Duration::MAX,
        None => relative_grace,
    }
}

pub(super) fn top_frame_started_loading(message: &Value, top_frame_id: Option<&str>) -> bool {
    message.get("method").and_then(Value::as_str) == Some("Page.frameStartedLoading")
        && message
            .get("params")
            .and_then(|params| params.get("frameId"))
            .and_then(Value::as_str)
            .zip(top_frame_id)
            .is_some_and(|(loading, top)| loading == top)
}

pub(super) fn top_frame_navigation_url(message: &Value) -> Result<Option<&str>, CdpError> {
    if message.get("method").and_then(Value::as_str) != Some("Page.frameNavigated") {
        return Ok(None);
    }
    let frame = message
        .get("params")
        .and_then(|params| params.get("frame"))
        .ok_or(CdpError::Protocol)?;
    if frame
        .get("parentId")
        .is_some_and(|parent| !parent.is_null())
    {
        return Ok(None);
    }
    frame
        .get("url")
        .and_then(Value::as_str)
        .map(Some)
        .ok_or(CdpError::Protocol)
}

pub(super) fn setup_contains_top_navigation(events: &VecDeque<Value>) -> Result<bool, CdpError> {
    for event in events {
        if top_frame_navigation_url(event)?.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(super) fn retain_setup_lifecycle_event(
    events: &mut VecDeque<Value>,
    message: &Value,
) -> Result<(), CdpError> {
    let Some(url) = top_frame_navigation_url(message)? else {
        return Ok(());
    };
    if url.len() > 2_048 {
        return Err(CdpError::Protocol);
    }
    // Setup only needs to know that a top navigation happened. Retaining a
    // normalized marker prevents arbitrary console/context events from
    // accumulating hundreds of megabytes before qualification completes.
    events.clear();
    events.push_back(json!({
        "method": "Page.frameNavigated",
        "params": { "frame": { "id": "top", "url": url } }
    }));
    Ok(())
}

pub(super) fn is_trusted_app_url(raw_url: &str) -> bool {
    Url::parse(raw_url).is_ok_and(|url| url.scheme() == "app" && url.host_str() == Some("-"))
}

pub(super) fn binding_execution_context(message: &Value, binding_name: &str) -> Option<u64> {
    if message.get("method")?.as_str()? != "Runtime.bindingCalled" {
        return None;
    }
    let params = message.get("params")?;
    if params.get("name")?.as_str()? != binding_name {
        return None;
    }
    params.get("executionContextId")?.as_u64()
}

pub(super) fn delivery_expression(
    message: &Value,
    receiver_name: &str,
) -> Result<String, CdpError> {
    if receiver_name.is_empty()
        || receiver_name.len() > 96
        || !receiver_name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(CdpError::Protocol);
    }
    let serialized = serde_json::to_string(message).map_err(|_| CdpError::Protocol)?;
    let quoted = serde_json::to_string(&serialized).map_err(|_| CdpError::Protocol)?;
    let receiver = serde_json::to_string(receiver_name).map_err(|_| CdpError::Protocol)?;
    Ok(format!(
        "(()=>{{const m=JSON.parse({quoted});const r=window[{receiver}];if(typeof r==='function'){{r(m);}}else{{window.dispatchEvent(new CustomEvent('code-codex:message',{{detail:m}}));}}}})()"
    ))
}

pub(super) fn bootstrap_evaluation_succeeded(message: &Value, expected_id: u64) -> bool {
    message.get("id").and_then(Value::as_u64) == Some(expected_id)
        && message.get("error").is_none()
        && message
            .get("result")
            .is_some_and(|result| result.get("exceptionDetails").is_none())
}
