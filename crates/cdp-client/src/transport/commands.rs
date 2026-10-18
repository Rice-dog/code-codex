use futures_util::{SinkExt, StreamExt};
use std::collections::VecDeque;

use std::time::{Duration, Instant};

use serde_json::{Value, json};

use tokio_tungstenite::tungstenite::Message;

use super::{CdpError, MAX_CDP_MESSAGE_BYTES, retain_setup_lifecycle_event};

pub(super) async fn send_command<S>(
    writer: &mut S,
    id: u64,
    method: &str,
    params: Value,
) -> Result<(), CdpError>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let encoded = serde_json::to_string(&json!({
        "id": id,
        "method": method,
        "params": params
    }))
    .map_err(|_| CdpError::Protocol)?;
    writer
        .send(Message::Text(encoded.into()))
        .await
        .map_err(|error| {
            CdpError::WebSocket.context(
                "sending renderer command",
                format!("method={method}; commandId={id}; cause={error}"),
            )
        })
}

pub(super) async fn send_command_before_deadline<S>(
    writer: &mut S,
    id: u64,
    method: &str,
    params: Value,
    deadline: Option<Instant>,
) -> Result<(), CdpError>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    match deadline {
        Some(deadline) => tokio::time::timeout_at(
            tokio::time::Instant::from_std(deadline),
            send_command(writer, id, method, params),
        )
        .await
        .map_err(|_| CdpError::IncompatibleRenderer)?,
        None => send_command(writer, id, method, params).await,
    }
}

pub(super) async fn wait_for_command<S>(
    socket: &mut S,
    expected_id: u64,
    setup_events: &mut VecDeque<Value>,
) -> Result<Value, CdpError>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let incoming = socket.next().await.ok_or_else(|| {
                CdpError::WebSocket.context(
                    "waiting for command reply",
                    format!("stream ended; commandId={expected_id}"),
                )
            })?;
            let incoming = incoming.map_err(|error| {
                CdpError::WebSocket.context("WebSocket connection or receive", error)
            })?;
            let Message::Text(text) = incoming else {
                continue;
            };
            let message = parse_cdp_message(text.as_ref())?;
            if message.get("id").and_then(Value::as_u64) != Some(expected_id) {
                retain_setup_lifecycle_event(setup_events, &message)?;
                continue;
            }
            if message.get("error").is_some() {
                return Err(CdpError::Protocol.context(
                    "command reply rejected",
                    format!(
                        "commandId={expected_id}; remoteCode={:?}; remote message/body omitted",
                        message.pointer("/error/code").and_then(Value::as_i64)
                    ),
                ));
            }
            return message.get("result").cloned().ok_or_else(|| {
                CdpError::Protocol.context(
                    "command reply validation",
                    format!("commandId={expected_id}; missing result"),
                )
            });
        }
    })
    .await
    .map_err(|error| {
        CdpError::WebSocket.context(
            "waiting for renderer command reply",
            format!("commandId={expected_id}; timeoutMs=3000; cause={error}"),
        )
    })?
}

pub(super) async fn wait_for_command_before_deadline<S>(
    socket: &mut S,
    expected_id: u64,
    setup_events: &mut VecDeque<Value>,
    deadline: Option<Instant>,
) -> Result<Value, CdpError>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    match deadline {
        Some(deadline) => tokio::time::timeout_at(
            tokio::time::Instant::from_std(deadline),
            wait_for_command(socket, expected_id, setup_events),
        )
        .await
        .map_err(|_| CdpError::IncompatibleRenderer)?,
        None => wait_for_command(socket, expected_id, setup_events).await,
    }
}

pub(super) fn parse_cdp_message(text: &str) -> Result<Value, CdpError> {
    if text.len() > MAX_CDP_MESSAGE_BYTES {
        return Err(CdpError::Protocol.context(
            "validating renderer protocol frame",
            format!(
                "observedBytes={}; maxBytes={MAX_CDP_MESSAGE_BYTES}",
                text.len()
            ),
        ));
    }
    serde_json::from_str(text).map_err(|error| {
        CdpError::Protocol.context(
            "parsing renderer protocol JSON",
            format!(
                "observedBytes={}; line={}; column={}; category={:?}",
                text.len(),
                error.line(),
                error.column(),
                error.classify()
            ),
        )
    })
}
