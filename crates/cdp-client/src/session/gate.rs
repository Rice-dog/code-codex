use std::collections::{HashSet, VecDeque};

use std::sync::Arc;

use std::time::{Duration, Instant};

use serde_json::{Value, json};

use tokio::sync::{Mutex, Semaphore, mpsc};
use tokio::task::JoinSet;

use super::{
    BindingRequest, BridgeError, BridgeHandler, CapabilityToken, CdpError,
    MAX_BINDING_PAYLOAD_BYTES, MAX_IN_FLIGHT_REQUESTS, MAX_REQUESTS_PER_SECOND, OutboundMessage,
    REPLAY_WINDOW, binding_execution_context, observe_rejection, take_verified_plugin_source,
};

#[derive(Debug)]
pub(super) struct GateState {
    pub(super) recent_requests: VecDeque<Instant>,
    pub(super) recent_ids: VecDeque<String>,
    pub(super) seen_ids: HashSet<String>,
}

pub(super) struct SecureGate {
    pub(super) token: CapabilityToken,
    pub(super) state: Mutex<GateState>,
}

impl SecureGate {
    pub(super) fn new(token: CapabilityToken) -> Self {
        Self {
            token,
            state: Mutex::new(GateState {
                recent_requests: VecDeque::new(),
                recent_ids: VecDeque::new(),
                seen_ids: HashSet::new(),
            }),
        }
    }

    pub(super) async fn authorize(&self, payload: &str) -> Result<BindingRequest, BridgeError> {
        if payload.len() > MAX_BINDING_PAYLOAD_BYTES {
            return Err(BridgeError::invalid_request());
        }
        // Charge every bounded ingress attempt before parsing or checking the
        // bearer token. Otherwise an attacker can send unlimited wrong-token
        // requests without ever entering the rate window.
        let now = Instant::now();
        let mut state = self.state.lock().await;
        while state
            .recent_requests
            .front()
            .is_some_and(|instant| now.duration_since(*instant) >= Duration::from_secs(1))
        {
            state.recent_requests.pop_front();
        }
        if state.recent_requests.len() >= MAX_REQUESTS_PER_SECOND {
            return Err(BridgeError::new(
                "RATE_LIMITED",
                "Too many native requests.",
            ));
        }
        state.recent_requests.push_back(now);
        drop(state);

        let request: BindingRequest =
            serde_json::from_str(payload).map_err(|_| BridgeError::invalid_request())?;
        if !valid_request_id(&request.id) {
            return Err(BridgeError::new(
                "INVALID_REQUEST",
                "The native request ID format is invalid.",
            ));
        }
        if !valid_method(&request.method) {
            return Err(BridgeError::new(
                "INVALID_REQUEST",
                "The native request method must use lowercase ASCII letters or dots.",
            ));
        }
        if !self.token.matches(&request.token) {
            return Err(BridgeError::new(
                "UNAUTHORIZED",
                "The native capability is invalid.",
            ));
        }

        let mut state = self.state.lock().await;
        if state.seen_ids.contains(&request.id) {
            return Err(BridgeError::new(
                "INVALID_REQUEST",
                "The request ID was already used.",
            ));
        }
        state.seen_ids.insert(request.id.clone());
        state.recent_ids.push_back(request.id.clone());
        if state.recent_ids.len() > REPLAY_WINDOW {
            if let Some(expired) = state.recent_ids.pop_front() {
                state.seen_ids.remove(&expired);
            }
        }
        Ok(request)
    }

    pub(super) async fn reset_for_new_document(&self) {
        let mut state = self.state.lock().await;
        state.recent_requests.clear();
        state.recent_ids.clear();
        state.seen_ids.clear();
    }
}

pub(super) fn valid_request_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

pub(super) fn valid_method(method: &str) -> bool {
    !method.is_empty()
        && method.len() <= 128
        && method
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'.')
}

pub(super) fn dispatch_request<H>(
    mut request: BindingRequest,
    handler: Arc<H>,
    outbound_sender: mpsc::Sender<OutboundMessage>,
    dispatch_slots: Arc<Semaphore>,
    handler_tasks: &mut JoinSet<()>,
    document_epoch: u64,
) -> Result<(), CdpError>
where
    H: BridgeHandler,
{
    request.lifecycle_epoch = handler.lifecycle_epoch();
    match dispatch_slots.try_acquire_owned() {
        Ok(permit) => {
            handler_tasks.spawn(async move {
                let _permit = permit;
                let id = request.id.clone();
                let method = request.method.clone();
                let mut response = match handler.handle(request).await {
                    Ok(result) => json!({ "id": id, "ok": true, "result": result }),
                    Err(error) => json!({ "id": id, "ok": false, "error": error }),
                };
                let trusted_script = take_verified_plugin_source(&method, &mut response);
                let _ = outbound_sender
                    .send(OutboundMessage {
                        trusted_script,
                        payload: response,
                        document_epoch,
                    })
                    .await;
            });
        }
        Err(_) => {
            let response = json!({
                "id": request.id,
                "ok": false,
                "error": BridgeError::new("RATE_LIMITED", "Too many native requests.")
            });
            outbound_sender
                .try_send(OutboundMessage {
                    trusted_script: None,
                    payload: response,
                    document_epoch,
                })
                .map_err(|_| CdpError::Protocol)?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn authorize_binding_request<H>(
    payload: &str,
    gate: &SecureGate,
    document_qualified: bool,
    pending_requests: &mut VecDeque<BindingRequest>,
    handler: Arc<H>,
    outbound_sender: mpsc::Sender<OutboundMessage>,
    dispatch_slots: Arc<Semaphore>,
    handler_tasks: &mut JoinSet<()>,
    document_epoch: u64,
) -> Result<(), CdpError>
where
    H: BridgeHandler,
{
    let request = match gate.authorize(payload).await {
        Ok(request) => request,
        Err(error) => {
            // Local metadata only. Never echo IDs to unauthenticated callers.
            observe_rejection(
                "binding authorization",
                json!({"code":error.code,"reason":error.message,"payloadBytes":payload.len(),"documentQualified":document_qualified,"payloadOmitted":true}),
            );
            return Ok(());
        }
    };
    if document_qualified {
        dispatch_request(
            request,
            handler,
            outbound_sender,
            dispatch_slots,
            handler_tasks,
            document_epoch,
        )
    } else {
        if pending_requests.len() < MAX_IN_FLIGHT_REQUESTS {
            pending_requests.push_back(request);
        } else {
            observe_rejection(
                "pending request capacity",
                json!({"code":"REQUEST_CAPACITY","limit":MAX_IN_FLIGHT_REQUESTS,"documentQualified":false}),
            );
        }
        Ok(())
    }
}

pub(super) fn bounded_binding_payload<'a>(
    message: &'a Value,
    binding_name: &str,
) -> Option<&'a str> {
    binding_execution_context(message, binding_name)?;
    let params = message.get("params")?;
    let payload = params.get("payload").and_then(Value::as_str)?;
    if payload.len() > MAX_BINDING_PAYLOAD_BYTES {
        observe_rejection(
            "binding payload limit",
            json!({"code":"INVALID_REQUEST","payloadBytes":payload.len(),"limit":MAX_BINDING_PAYLOAD_BYTES,"payloadOmitted":true}),
        );
        return None;
    }
    Some(payload)
}
