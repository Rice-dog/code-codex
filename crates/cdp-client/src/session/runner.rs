use futures_util::{SinkExt, StreamExt};
use std::collections::{HashSet, VecDeque};

use std::sync::Arc;

use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use tokio::sync::{Notify, Semaphore, broadcast, mpsc, oneshot};
use tokio::task::JoinSet;
use tokio_tungstenite::connect_async_with_config;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_util::sync::CancellationToken;

#[path = "ingress.rs"]
mod ingress;
use ingress::ContextIngress;

use super::{
    BridgeHandler, BridgeNotification, CANDIDATE_APPROVAL_TIMEOUT, CdpEndpoint, CdpError,
    CdpTarget, DIAGNOSTIC_OBSERVER, DOCUMENT_READY_STATE_PROBE, EndpointVerifier,
    INITIAL_RENDERER_QUALIFICATION_POLL_INTERVAL, InjectionConfig, MAX_CDP_MESSAGE_BYTES,
    MAX_IN_FLIGHT_REQUESTS, NAVIGATION_QUALIFICATION_INTERVAL, OutboundMessage,
    RENDERER_LAYOUT_PROBE, STEADY_STATE_QUALIFICATION_INTERVAL, SecureGate, SessionStatus,
    SupervisorProgress, TRUSTED_NAVIGATION_QUALIFICATION_TIMEOUT, authorize_binding_request,
    binding_execution_context, bootstrap_evaluation_succeeded, bounded_binding_payload,
    delivery_expression, dispatch_request, initial_qualification_retry_timeout, is_trusted_app_url,
    layout_observation, outbound_expressions, parse_cdp_message, remember_rejected_context,
    renderer_document_is_loading, renderer_probe_matches, send_command,
    send_command_before_deadline, setup_contains_top_navigation, top_frame_navigation_url,
    top_frame_started_loading, validate_websocket_url, wait_for_candidate_approval,
    wait_for_command, wait_for_command_before_deadline,
};

pub(super) async fn sleep_or_cancel(duration: Duration, cancellation: &CancellationToken) {
    tokio::select! {
        () = cancellation.cancelled() => {}
        () = tokio::time::sleep(duration) => {}
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn run_target_session<H>(
    endpoint: CdpEndpoint,
    target: CdpTarget,
    injection: InjectionConfig,
    handler: Arc<H>,
    endpoint_verifier: Arc<dyn EndpointVerifier>,
    mut notifications: broadcast::Receiver<BridgeNotification>,
    cancellation: CancellationToken,
    initial_settle_timeout: Duration,
    cold_startup_deadline: Option<Instant>,
    canonical_startup_grace: bool,
    qualification_nudge: Arc<Notify>,
    session_generation: u64,
    status_sender: mpsc::UnboundedSender<SessionStatus>,
    lease_held: Arc<AtomicBool>,
    progress: Option<Arc<SupervisorProgress>>,
) -> Result<(), CdpError>
where
    H: BridgeHandler,
{
    validate_websocket_url(endpoint, &target.web_socket_debugger_url)?;
    let websocket_config = WebSocketConfig::default()
        .max_message_size(Some(MAX_CDP_MESSAGE_BYTES))
        .max_frame_size(Some(MAX_CDP_MESSAGE_BYTES));
    let connection = connect_async_with_config(
        &target.web_socket_debugger_url,
        Some(websocket_config),
        false,
    );
    let connection = match cold_startup_deadline {
        Some(deadline) => {
            tokio::time::timeout_at(tokio::time::Instant::from_std(deadline), connection)
                .await
                .map_err(|_| CdpError::IncompatibleRenderer)?
        }
        None => connection.await,
    };
    let (mut socket, _) = connection
        .map_err(|error| CdpError::WebSocket.context("renderer WebSocket handshake", error))?;
    match cold_startup_deadline {
        Some(deadline) => tokio::time::timeout_at(
            tokio::time::Instant::from_std(deadline),
            endpoint_verifier.verify(endpoint),
        )
        .await
        .map_err(|_| CdpError::IncompatibleRenderer)??,
        None => endpoint_verifier.verify(endpoint).await?,
    }

    let mut setup_events = VecDeque::new();
    let mut next_id = 1_u64;
    send_command_before_deadline(
        &mut socket,
        next_id,
        "Runtime.enable",
        json!({}),
        cold_startup_deadline,
    )
    .await?;
    let _ = wait_for_command_before_deadline(
        &mut socket,
        next_id,
        &mut setup_events,
        cold_startup_deadline,
    )
    .await?;
    next_id += 1;
    send_command_before_deadline(
        &mut socket,
        next_id,
        "Page.enable",
        json!({}),
        cold_startup_deadline,
    )
    .await?;
    let _ = wait_for_command_before_deadline(
        &mut socket,
        next_id,
        &mut setup_events,
        cold_startup_deadline,
    )
    .await?;
    next_id += 1;
    // A replacement renderer target can be discoverable before Chromium has
    // finished creating its document. Treat that state as transient instead
    // of caching the main target as an incompatible auxiliary renderer.
    let qualification_started = Instant::now();
    let cold_startup_timeout = cold_startup_deadline
        .map(|deadline| deadline.saturating_duration_since(qualification_started));
    let mut observed_loading_document = false;
    let mut final_probe_requested = false;
    let renderer_matches = loop {
        if cold_startup_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            return Err(CdpError::IncompatibleRenderer);
        }
        send_command_before_deadline(
            &mut socket,
            next_id,
            "Runtime.evaluate",
            json!({
                "expression": RENDERER_LAYOUT_PROBE,
                "returnByValue": true
            }),
            cold_startup_deadline,
        )
        .await?;
        let probe = wait_for_command_before_deadline(
            &mut socket,
            next_id,
            &mut setup_events,
            cold_startup_deadline,
        )
        .await?;
        next_id += 1;
        let layout_matches = renderer_probe_matches(&probe);
        if let Some(progress) = &progress {
            progress.update(|state| {
                state.layout_probe_attempts = state.layout_probe_attempts.saturating_add(1);
                if layout_matches {
                    state.layout_probe_matches = state.layout_probe_matches.saturating_add(1);
                }
            });
        }
        if layout_matches {
            if cold_startup_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                return Err(CdpError::IncompatibleRenderer);
            }
            break true;
        }
        if let Some(progress) = &progress {
            if progress.snapshot().layout_probe_attempts % 40 == 1 {
                let expression = include_str!("../renderer-layout-diagnostic.js")
                    .replace("__PREDICATE__", RENDERER_LAYOUT_PROBE);
                let diagnostic_id = next_id;
                next_id += 1;
                if send_command_before_deadline(
                    &mut socket,
                    diagnostic_id,
                    "Runtime.evaluate",
                    json!({"expression":expression,"returnByValue":true}),
                    cold_startup_deadline,
                )
                .await
                .is_ok()
                {
                    if let Ok(diagnostic) = wait_for_command_before_deadline(
                        &mut socket,
                        diagnostic_id,
                        &mut setup_events,
                        cold_startup_deadline,
                    )
                    .await
                    {
                        if let Some(value) = diagnostic.pointer("/result/value") {
                            progress.update(|state| {
                                state.last_layout_diagnostic = Some(layout_observation(value))
                            });
                        }
                    }
                }
            }
        }
        if final_probe_requested {
            return Err(CdpError::IncompatibleRenderer);
        }
        send_command_before_deadline(
            &mut socket,
            next_id,
            "Runtime.evaluate",
            json!({
                "expression": DOCUMENT_READY_STATE_PROBE,
                "returnByValue": true
            }),
            cold_startup_deadline,
        )
        .await?;
        let ready_state = wait_for_command_before_deadline(
            &mut socket,
            next_id,
            &mut setup_events,
            cold_startup_deadline,
        )
        .await?;
        next_id += 1;
        if let Some(progress) = &progress {
            progress.record_ready_state(&ready_state);
        }
        observed_loading_document |= renderer_document_is_loading(&ready_state);
        let retry_timeout = initial_qualification_retry_timeout(
            observed_loading_document,
            initial_settle_timeout,
            canonical_startup_grace,
            cold_startup_timeout,
        );
        if retry_timeout.is_zero() {
            break false;
        }
        if qualification_started.elapsed() >= retry_timeout {
            return Err(CdpError::IncompatibleRenderer);
        }
        let poll_interval = cold_startup_deadline.map_or(
            INITIAL_RENDERER_QUALIFICATION_POLL_INTERVAL,
            |deadline| {
                INITIAL_RENDERER_QUALIFICATION_POLL_INTERVAL
                    .min(deadline.saturating_duration_since(Instant::now()))
            },
        );
        if poll_interval.is_zero() {
            return Err(CdpError::IncompatibleRenderer);
        }
        tokio::select! {
            () = cancellation.cancelled() => return Ok(()),
            () = qualification_nudge.notified() => final_probe_requested = true,
            () = tokio::time::sleep(poll_interval) => {}
        }
    };
    if !renderer_matches {
        return Err(CdpError::IncompatibleRenderer);
    }
    if let Some(progress) = &progress {
        progress.record("layout_qualified");
    }
    setup_events.clear();

    // DOM qualification only creates a candidate. The supervisor grants a
    // single renderer lease before this session receives a binding or token.
    let (approval_sender, approval_receiver) = oneshot::channel();
    status_sender
        .send(SessionStatus::Candidate {
            target_id: target.id.clone(),
            session_generation,
            approval: approval_sender,
        })
        .map_err(|_| CdpError::Protocol)?;
    let approval = tokio::select! {
        () = cancellation.cancelled() => return Ok(()),
        approval = wait_for_candidate_approval(
            approval_receiver,
            cold_startup_deadline,
            CANDIDATE_APPROVAL_TIMEOUT,
        ) => approval?
    };
    approval?;
    lease_held.store(true, AtomicOrdering::Release);
    if let Some(progress) = &progress {
        progress.record("renderer_lease_granted");
    }

    // Re-probe after awaiting the lease. Any navigation observed during the
    // wait invalidates the candidate before token-bearing source is installed.
    send_command(
        &mut socket,
        next_id,
        "Runtime.evaluate",
        json!({
            "expression": RENDERER_LAYOUT_PROBE,
            "returnByValue": true
        }),
    )
    .await?;
    let probe = wait_for_command(&mut socket, next_id, &mut setup_events).await?;
    if !renderer_probe_matches(&probe) || setup_contains_top_navigation(&setup_events)? {
        return Err(CdpError::IncompatibleRenderer);
    }
    next_id += 1;
    setup_events.clear();
    send_command(
        &mut socket,
        next_id,
        "Runtime.addBinding",
        json!({ "name": injection.binding_name }),
    )
    .await?;
    let _ = wait_for_command(&mut socket, next_id, &mut setup_events).await?;
    if let Some(progress) = &progress {
        progress.record("native_binding_installed");
    }
    next_id += 1;
    send_command(
        &mut socket,
        next_id,
        "Page.addScriptToEvaluateOnNewDocument",
        json!({ "source": injection.navigation_bootstrap_source.as_deref().unwrap_or(injection.bootstrap_source.as_ref()) }),
    )
    .await?;
    let _ = wait_for_command(&mut socket, next_id, &mut setup_events).await?;
    if let Some(progress) = &progress {
        progress.record("navigation_bootstrap_registered");
    }
    if setup_contains_top_navigation(&setup_events)? {
        return Err(CdpError::IncompatibleRenderer);
    }
    next_id += 1;

    let (mut writer, mut reader) = socket.split();
    let initial_bootstrap_eval_id = next_id;
    if let Some(progress) = &progress {
        progress
            .update(|state| state.bootstrap_attempts = state.bootstrap_attempts.saturating_add(1));
        progress.record("bootstrap_evaluation_started");
    }
    send_command(
        &mut writer,
        next_id,
        "Runtime.evaluate",
        json!({
            "expression": injection.bootstrap_source.as_ref(),
            "awaitPromise": true,
            "returnByValue": true
        }),
    )
    .await?;
    next_id += 1;

    let gate = Arc::new(SecureGate::new(injection.capability_token));
    let dispatch_slots = Arc::new(Semaphore::new(MAX_IN_FLIGHT_REQUESTS));
    let mut handler_tasks = JoinSet::new();
    let (outbound_sender, mut outbound_receiver) = mpsc::channel::<OutboundMessage>(256);
    let mut document_epoch = 0_u64;
    let mut document_qualified = true;
    let mut pending_requests = VecDeque::new();
    let mut trusted_execution_context = None;
    let mut execution_context_probe = None;
    let mut rejected_execution_contexts = HashSet::new();
    let mut top_frame_id: Option<String> = None;
    let mut qualification_probe = None;
    let mut top_document_loaded = true;
    let mut navigation_in_progress = false;
    let mut navigation_awaiting_frame = false;
    let mut navigation_started_at = None;
    let mut last_qualification = Instant::now();
    let mut qualification_tick = tokio::time::interval(Duration::from_millis(250));
    qualification_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    qualification_tick.tick().await;
    loop {
        tokio::select! {
            () = cancellation.cancelled() => break,
            completed = handler_tasks.join_next(), if !handler_tasks.is_empty() => {
                let _ = completed;
            }
            _ = qualification_tick.tick() => {
                if execution_context_probe
                    .as_ref()
                    .is_some_and(|(_, _, _, started): &(u64, u64, ContextIngress, Instant)| {
                        started.elapsed() >= Duration::from_secs(3)
                    })
                {
                    if let Some((_, context_id, _, _)) = execution_context_probe.take() {
                        remember_rejected_context(&mut rejected_execution_contexts, context_id);
                    }
                }
                if qualification_probe
                    .as_ref()
                    .is_some_and(|(_, started): &(u64, Instant)| {
                        started.elapsed() >= Duration::from_secs(3)
                    })
                {
                    return Err(CdpError::QualificationTimeout.context("renderer qualification reply timeout", "budgetMs=3000; dispatch remains blocked"));
                }
                if top_document_loaded
                    && qualification_probe.is_none()
                    && last_qualification.elapsed()
                        >= if navigation_in_progress {
                            NAVIGATION_QUALIFICATION_INTERVAL
                        } else {
                            STEADY_STATE_QUALIFICATION_INTERVAL
                        }
                {
                    send_command(
                        &mut writer,
                        next_id,
                        "Runtime.evaluate",
                        json!({
                            "expression": RENDERER_LAYOUT_PROBE,
                            "returnByValue": true
                        }),
                    ).await?;
                    qualification_probe = Some((next_id, Instant::now()));
                    next_id += 1;
                }
            }
            outbound = outbound_receiver.recv() => {
                let Some(outbound) = outbound else { break; };
                if !document_qualified
                    || trusted_execution_context.is_none()
                    || outbound.document_epoch != document_epoch
                {
                    continue;
                }
                for expression in outbound_expressions(&outbound, &injection.receiver_name)? {
                send_command(
                    &mut writer,
                    next_id,
                    "Runtime.evaluate",
                    json!({ "expression": expression, "awaitPromise": false, "contextId":trusted_execution_context }),
                ).await?;
                next_id += 1;
                }
            }
            notification = notifications.recv() => match notification {
                Ok(notification) => {
                    if !document_qualified
                        || trusted_execution_context.is_none()
                        || notification.lifecycle_epoch != handler.lifecycle_epoch()
                    {
                        continue;
                    }
                    let expression = delivery_expression(&notification.payload, &injection.receiver_name)?;
                    send_command(
                        &mut writer,
                        next_id,
                        "Runtime.evaluate",
                        json!({ "expression": expression, "awaitPromise": false }),
                    ).await?;
                    next_id += 1;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    if !document_qualified || trusted_execution_context.is_none() {
                        continue;
                    }
                    let resync = json!({ "method": "explorer.resync", "params": {} });
                    let expression = delivery_expression(&resync, &injection.receiver_name)?;
                    send_command(
                        &mut writer,
                        next_id,
                        "Runtime.evaluate",
                        json!({ "expression": expression, "awaitPromise": false }),
                    ).await?;
                    next_id += 1;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
            incoming = reader.next() => {
                let Some(incoming) = incoming else { break; };
                let incoming = incoming.map_err(|error| CdpError::WebSocket.context("WebSocket connection or receive", error))?;
                match incoming {
                    Message::Text(text) => {
                        let message = parse_cdp_message(text.as_ref())?;
                        if message.get("id").and_then(Value::as_u64) == Some(initial_bootstrap_eval_id) {
                            let succeeded = bootstrap_evaluation_succeeded(&message, initial_bootstrap_eval_id);
                            if let Some(progress) = &progress {
                                progress.update(|state| {
                                    state.bootstrap_responses = state.bootstrap_responses.saturating_add(1);
                                    if !succeeded {
                                        state.bootstrap_failures = state.bootstrap_failures.saturating_add(1);
                                    }
                                });
                                progress.record(if succeeded { "bootstrap_evaluation_succeeded" } else { "bootstrap_evaluation_failed" });
                            }
                            if let Some(handoff) = &injection.startup_handoff {
                                if !succeeded {
                                    tracing::warn!(event = "startup_visual_handoff_failed");
                                }
                                handoff.store(true, AtomicOrdering::Release);
                            }
                            continue;
                        }
                        let execution_context_probe_id =
                            execution_context_probe.as_ref().map(|(id, _, _, _)| *id);
                        if execution_context_probe_id.is_some()
                            && message.get("id").and_then(Value::as_u64)
                                == execution_context_probe_id
                        {
                            let (_, context_id, payloads, _) =
                                execution_context_probe.take().ok_or(CdpError::Protocol)?;
                            if message
                                .get("result")
                                .is_some_and(renderer_probe_matches)
                            {
                                trusted_execution_context = Some(context_id);
                                rejected_execution_contexts.remove(&context_id);
                                last_qualification = Instant::now();
                                for payload in payloads.into_payloads() {
                                authorize_binding_request(
                                    &payload,
                                    gate.as_ref(),
                                    document_qualified,
                                    &mut pending_requests,
                                    handler.clone(),
                                    outbound_sender.clone(),
                                    dispatch_slots.clone(),
                                    &mut handler_tasks,
                                    document_epoch,
                                ).await?;
                                }
                            } else {
                                remember_rejected_context(
                                    &mut rejected_execution_contexts,
                                    context_id,
                                );
                            }
                            continue;
                        }
                        let qualification_probe_id =
                            qualification_probe.as_ref().map(|(id, _)| *id);
                        if qualification_probe_id.is_some()
                            && message.get("id").and_then(Value::as_u64)
                                == qualification_probe_id
                        {
                            qualification_probe = None;
                            let probe = message.get("result").ok_or(CdpError::Protocol)?;
                            if !renderer_probe_matches(probe) {
                                if navigation_in_progress
                                    && navigation_started_at.is_some_and(|started: Instant| {
                                        started.elapsed()
                                            < TRUSTED_NAVIGATION_QUALIFICATION_TIMEOUT
                                    })
                                {
                                    // React can mount the verified shell selectors after
                                    // readyState reaches complete. Keep native dispatch
                                    // blocked and retry only inside this navigation window.
                                    last_qualification = Instant::now();
                                    continue;
                                }
                                return Err(CdpError::IncompatibleRenderer);
                            }
                            last_qualification = Instant::now();
                            // A sign-in route can temporarily fail the probe while
                            // retaining its default execution-context ID. A negative
                            // cache from that route must not block the verified Home
                            // document forever. Each subsequent request is still
                            // subject to context probing, token and ingress checks.
                            if !rejected_execution_contexts.is_empty() {
                                if let Some(observer)=DIAGNOSTIC_OBSERVER.get() {
                                    observer("cdp-session","requalification","recovered",json!({"code":"CC-SESSION-CONTEXT-001","invalidatedNegativeContexts":rejected_execution_contexts.len(),"nativeSecurityUnchanged":true,"writesReplayed":false}));
                                }
                                rejected_execution_contexts.clear();
                                if document_qualified && trusted_execution_context.is_none() {
                                    let expression=delivery_expression(&json!({"method":"explorer.resync","params":{"reason":"execution-context-requalified","documentEpoch":document_epoch}}),&injection.receiver_name)?;
                                    send_command(&mut writer,next_id,"Runtime.evaluate",json!({"expression":expression,"awaitPromise":false})).await?;
                                    next_id+=1;
                                }
                            }
                            if !document_qualified {
                                document_qualified = true;
                                navigation_in_progress = false;
                                navigation_awaiting_frame = false;
                                navigation_started_at = None;
                                while let Some(request) = pending_requests.pop_front() {
                                    dispatch_request(
                                        request,
                                        handler.clone(),
                                        outbound_sender.clone(),
                                        dispatch_slots.clone(),
                                        &mut handler_tasks,
                                        document_epoch,
                                    )?;
                                }
                                // A new document may have run the navigation bootstrap
                                // before the trusted shell became ready. Reinstall only
                                // after qualification, then notify retained clients.
                                send_command(&mut writer, next_id, "Runtime.evaluate", json!({
                                    "expression": injection.navigation_bootstrap_source.as_deref().unwrap_or(injection.bootstrap_source.as_ref()),
                                    "awaitPromise": false
                                })).await?;
                                next_id += 1;
                                let resync = json!({ "method": "explorer.resync", "params": {"reason":"document-requalified","documentEpoch":document_epoch} });
                                let expression = delivery_expression(&resync, &injection.receiver_name)?;
                                send_command(
                                    &mut writer,
                                    next_id,
                                    "Runtime.evaluate",
                                    json!({ "expression": expression, "awaitPromise": false }),
                                ).await?;
                                next_id += 1;
                            }
                            continue;
                        }
                        if top_frame_started_loading(&message, top_frame_id.as_deref()) {
                            if !navigation_in_progress {
                                handler.invalidate_lifecycle();
                                handler_tasks.abort_all();
                                document_epoch = document_epoch.wrapping_add(1);
                                pending_requests.clear();
                                gate.reset_for_new_document().await;
                                navigation_started_at = Some(Instant::now());
                            }
                            navigation_in_progress = true;
                            navigation_awaiting_frame = true;
                            document_qualified = false;
                            trusted_execution_context = None;
                            execution_context_probe = None;
                            rejected_execution_contexts.clear();
                            top_document_loaded = false;
                            qualification_probe = None;
                            last_qualification = Instant::now();
                            continue;
                        }
                        if let Some(url) = top_frame_navigation_url(&message)? {
                            if !is_trusted_app_url(url) {
                                return Err(CdpError::IncompatibleRenderer);
                            }
                            let navigated_frame_id = message
                                .get("params")
                                .and_then(|params| params.get("frame"))
                                .and_then(|frame| frame.get("id"))
                                .and_then(Value::as_str)
                                .ok_or(CdpError::Protocol)?;
                            let starts_distinct_navigation = !navigation_in_progress
                                || (!navigation_awaiting_frame
                                    && top_frame_id
                                        .as_deref()
                                        .is_some_and(|current| current != navigated_frame_id));
                            if starts_distinct_navigation {
                                handler.invalidate_lifecycle();
                                handler_tasks.abort_all();
                                document_epoch = document_epoch.wrapping_add(1);
                                trusted_execution_context = None;
                                execution_context_probe = None;
                                rejected_execution_contexts.clear();
                                pending_requests.clear();
                                gate.reset_for_new_document().await;
                                navigation_started_at = Some(Instant::now());
                            }
                            navigation_in_progress = true;
                            navigation_awaiting_frame = false;
                            document_qualified = false;
                            top_frame_id = Some(navigated_frame_id.to_owned());
                            top_document_loaded = false;
                            qualification_probe = None;
                            last_qualification = Instant::now();
                            continue;
                        }
                        if message.get("method").and_then(Value::as_str) == Some("Page.loadEventFired") {
                            top_document_loaded = true;
                            continue;
                        }
                        if message.get("method").and_then(Value::as_str)
                            == Some("Runtime.executionContextsCleared")
                        {
                            if !navigation_in_progress {
                                handler.invalidate_lifecycle();
                                handler_tasks.abort_all();
                                document_epoch = document_epoch.wrapping_add(1);
                                navigation_started_at = Some(Instant::now());
                            }
                            navigation_in_progress = true;
                            navigation_awaiting_frame = true;
                            trusted_execution_context = None;
                            execution_context_probe = None;
                            rejected_execution_contexts.clear();
                            document_qualified = false;
                            top_document_loaded = false;
                            qualification_probe = None;
                            last_qualification = Instant::now();
                            pending_requests.clear();
                            gate.reset_for_new_document().await;
                            continue;
                        }
                        if message.get("method").and_then(Value::as_str)
                            == Some("Runtime.executionContextCreated")
                        {
                            let context = message
                                .get("params")
                                .and_then(|params| params.get("context"));
                            let context_id = context
                                .and_then(|context| context.get("id"))
                                .and_then(Value::as_u64);
                            let auxiliary = context.and_then(|context| context.get("auxData"));
                            let is_default = auxiliary
                                .and_then(|data| data.get("isDefault"))
                                .and_then(Value::as_bool)
                                .unwrap_or(false);
                            let frame_matches = auxiliary
                                .and_then(|data| data.get("frameId"))
                                .and_then(Value::as_str)
                                .zip(top_frame_id.as_deref())
                                .is_some_and(|(frame, top)| frame == top);
                            if is_default && frame_matches {
                                trusted_execution_context = context_id;
                                if let Some(context_id) = context_id {
                                    rejected_execution_contexts.remove(&context_id);
                                }
                            }
                            continue;
                        }
                        if message.get("method").and_then(Value::as_str)
                            == Some("Runtime.executionContextDestroyed")
                        {
                            let destroyed = message
                                .get("params")
                                .and_then(|params| params.get("executionContextId"))
                                .and_then(Value::as_u64);
                            if let Some(destroyed) = destroyed {
                                rejected_execution_contexts.remove(&destroyed);
                            }
                            if destroyed == trusted_execution_context {
                                if !navigation_in_progress {
                                    handler.invalidate_lifecycle();
                                    handler_tasks.abort_all();
                                    document_epoch = document_epoch.wrapping_add(1);
                                    navigation_started_at = Some(Instant::now());
                                }
                                navigation_in_progress = true;
                                navigation_awaiting_frame = true;
                                trusted_execution_context = None;
                                document_qualified = false;
                                top_document_loaded = false;
                                qualification_probe = None;
                                last_qualification = Instant::now();
                                pending_requests.clear();
                                gate.reset_for_new_document().await;
                            }
                            if execution_context_probe
                                .as_ref()
                                .is_some_and(|(_, context_id, _, _)| Some(*context_id) == destroyed)
                            {
                                execution_context_probe = None;
                            }
                            continue;
                        }
                        if let Some(context_id) =
                            binding_execution_context(&message, &injection.binding_name)
                        {
                            if rejected_execution_contexts.contains(&context_id) {
                                continue;
                            }
                            if let Some(trusted) = trusted_execution_context {
                                if context_id != trusted {
                                    continue;
                                }
                                if let Some(payload) =
                                    bounded_binding_payload(&message, &injection.binding_name)
                                {
                                    authorize_binding_request(
                                        payload,
                                        gate.as_ref(),
                                        document_qualified,
                                        &mut pending_requests,
                                        handler.clone(),
                                        outbound_sender.clone(),
                                        dispatch_slots.clone(),
                                        &mut handler_tasks,
                                        document_epoch,
                                    ).await?;
                                }
                            } else if let Some((_, probing_context, payloads, _)) = execution_context_probe.as_mut() {
                                if context_id == *probing_context {
                                    if let Some(payload) = bounded_binding_payload(&message, &injection.binding_name) {
                                        if !payloads.push(payload) {
                                            super::observe_rejection("execution-context ingress queue",json!({"code":"CC-SESSION-INGRESS-001","reason":"Qualification ingress queue limit reached; request was not dispatched.","maxPending":MAX_IN_FLIGHT_REQUESTS,"payloadBytes":payload.len()}));
                                        }
                                    }
                                }
                            } else {
                                let Some(payload) =
                                    bounded_binding_payload(&message, &injection.binding_name)
                                else {
                                    continue;
                                };
                                let Some(payloads) = ContextIngress::with_first(payload) else { continue; };
                                send_command(
                                    &mut writer,
                                    next_id,
                                    "Runtime.evaluate",
                                    json!({
                                        "expression": RENDERER_LAYOUT_PROBE,
                                        "contextId": context_id,
                                        "returnByValue": true
                                    }),
                                ).await?;
                                execution_context_probe =
                                    Some((next_id, context_id, payloads, Instant::now()));
                                next_id += 1;
                            }
                        }
                    }
                    Message::Ping(payload) => writer.send(Message::Pong(payload)).await.map_err(|_| CdpError::WebSocket)?,
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }
    Ok(())
}
