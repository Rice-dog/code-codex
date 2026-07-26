//! Minimal Chrome DevTools Protocol support for renderer injection.
//!
//! The client is deliberately limited to a loopback endpoint, Codex renderer
//! targets, `Runtime.addBinding`, script injection, and outbound evaluation.
//! It is not a general-purpose remote debugging client.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use constant_time_eq::constant_time_eq;
use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;
use tokio::sync::{Mutex, Notify, Semaphore, broadcast, mpsc, oneshot};
use tokio::task::{JoinHandle, JoinSet};
use tokio_tungstenite::connect_async_with_config;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_util::sync::CancellationToken;
use url::Url;

pub const PRIMARY_BINDING_NAME: &str = "__codexLiveExplorer";
// A 64 KiB UTF-8 edit expands to about 86 KiB as Base64. Keep ingress tightly
// bounded while leaving room for the authenticated JSON request envelope.
const MAX_BINDING_PAYLOAD_BYTES: usize = 96 * 1024;
const MAX_CDP_MESSAGE_BYTES: usize = 4 * 1024 * 1024;
const MAX_DISCOVERY_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_REQUESTS_PER_SECOND: usize = 120;
const MAX_IN_FLIGHT_REQUESTS: usize = 16;
const MAX_DISCOVERED_TARGETS: usize = 128;
const MAX_COMPATIBLE_TARGETS: usize = 8;
const MAX_RECENTLY_QUALIFIED_TARGETS: usize = 8;
const MAX_REJECTED_EXECUTION_CONTEXTS: usize = 128;
const REPLAY_WINDOW: usize = 4_096;
const RENDERER_LAYOUT_PROBE: &str = "window===window.top&&location.protocol==='app:'&&location.host==='-'&&Boolean(document.querySelector('aside.app-shell-left-panel')&&document.querySelector('main.main-surface')&&document.querySelector('[data-app-shell-sidebar-trigger]'))";
const DOCUMENT_READY_STATE_PROBE: &str = "document.readyState";
const INITIAL_RENDERER_QUALIFICATION_TIMEOUT: Duration = Duration::from_secs(5);
const INITIAL_RENDERER_QUALIFICATION_POLL_INTERVAL: Duration = Duration::from_millis(250);
const TRUSTED_NAVIGATION_QUALIFICATION_TIMEOUT: Duration = Duration::from_secs(5);
const STEADY_STATE_QUALIFICATION_INTERVAL: Duration = Duration::from_secs(2);
const NAVIGATION_QUALIFICATION_INTERVAL: Duration = Duration::from_millis(250);
const RECENTLY_QUALIFIED_TARGET_TTL: Duration = Duration::from_secs(30);
const CANDIDATE_APPROVAL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub enum CdpError {
    #[error("the CDP endpoint is unavailable")]
    EndpointUnavailable,
    #[error("the CDP endpoint returned invalid data")]
    InvalidEndpoint,
    #[error("the CDP protocol version is not supported")]
    UnsupportedProtocol,
    #[error("no compatible Codex renderer target was found")]
    NoCompatibleTarget,
    #[error("more than one Codex renderer target matched the supported layout")]
    AmbiguousRenderer,
    #[error("the CDP endpoint exposed too many renderer targets")]
    TooManyTargets,
    #[error("the target does not contain the supported Codex renderer layout")]
    IncompatibleRenderer,
    #[error("the renderer WebSocket endpoint was rejected")]
    InvalidWebSocketEndpoint,
    #[error("the CDP listener identity changed or could not be verified")]
    EndpointIdentityMismatch,
    #[error("the renderer WebSocket connection failed")]
    WebSocket,
    #[error("the CDP session returned invalid protocol data")]
    Protocol,
}

/// Random per-launch bearer capability. Debug formatting never reveals it.
#[derive(Clone, PartialEq, Eq)]
pub struct CapabilityToken(Arc<str>);

impl CapabilityToken {
    #[must_use]
    pub fn generate() -> Self {
        let mut bytes = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        Self(Arc::from(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// Intended only for constructing the trusted injected bootstrap.
    #[must_use]
    pub fn expose(&self) -> &str {
        &self.0
    }

    fn matches(&self, candidate: &str) -> bool {
        constant_time_eq(self.0.as_bytes(), candidate.as_bytes())
    }
}

impl fmt::Debug for CapabilityToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CapabilityToken([REDACTED])")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CdpEndpoint {
    port: u16,
}

impl CdpEndpoint {
    #[must_use]
    pub const fn loopback(port: u16) -> Self {
        Self { port }
    }

    #[must_use]
    pub const fn port(self) -> u16 {
        self.port
    }

    fn http_url(self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BrowserVersion {
    #[serde(default, rename = "Browser", alias = "browser")]
    pub browser: String,
    #[serde(
        default,
        rename = "Protocol-Version",
        alias = "protocolVersion",
        alias = "protocol_version"
    )]
    pub protocol_version: String,
    #[serde(default, rename = "webSocketDebuggerUrl")]
    pub web_socket_debugger_url: Option<String>,
}

impl BrowserVersion {
    #[must_use]
    pub fn is_supported(&self) -> bool {
        self.protocol_version == "1.3"
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CdpTarget {
    pub id: String,
    #[serde(rename = "type")]
    pub target_type: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub web_socket_debugger_url: String,
}

#[derive(Clone)]
pub struct TargetDiscovery {
    client: reqwest::Client,
}

impl TargetDiscovery {
    pub fn new() -> Result<Self, CdpError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| CdpError::InvalidEndpoint)?;
        Ok(Self { client })
    }

    pub async fn version(&self, endpoint: CdpEndpoint) -> Result<BrowserVersion, CdpError> {
        self.get_json(endpoint.http_url("/json/version")).await
    }

    pub async fn targets(&self, endpoint: CdpEndpoint) -> Result<Vec<CdpTarget>, CdpError> {
        self.get_json(endpoint.http_url("/json/list")).await
    }

    async fn get_json<T>(&self, url: String) -> Result<T, CdpError>
    where
        T: serde::de::DeserializeOwned,
    {
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| CdpError::EndpointUnavailable)?;
        if !response.status().is_success() {
            return Err(CdpError::EndpointUnavailable);
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_DISCOVERY_RESPONSE_BYTES as u64)
        {
            return Err(CdpError::InvalidEndpoint);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| CdpError::InvalidEndpoint)?
        {
            if body.len().saturating_add(chunk.len()) > MAX_DISCOVERY_RESPONSE_BYTES {
                return Err(CdpError::InvalidEndpoint);
            }
            body.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&body).map_err(|_| CdpError::InvalidEndpoint)
    }
}

#[derive(Debug, Clone, Default)]
pub struct TargetFilter {
    pub allow_any_page: bool,
}

impl TargetFilter {
    #[must_use]
    pub fn accepts(&self, target: &CdpTarget) -> bool {
        if target.target_type != "page" || target.web_socket_debugger_url.is_empty() {
            return false;
        }
        self.allow_any_page
            || target.url == "app://-/index.html"
            || (target.url.starts_with("app://-/") && target.title.contains("Codex"))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BindingRequest {
    pub id: String,
    pub token: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
    #[serde(skip)]
    pub lifecycle_epoch: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BridgeError {
    pub code: String,
    pub message: String,
}

impl BridgeError {
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    #[must_use]
    pub fn invalid_request() -> Self {
        Self::new("INVALID_REQUEST", "The native request is invalid.")
    }
}

#[async_trait]
pub trait BridgeHandler: Send + Sync + 'static {
    async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError>;

    fn lifecycle_epoch(&self) -> u64 {
        0
    }

    fn invalidate_lifecycle(&self) {}
}

#[async_trait]
pub trait EndpointVerifier: Send + Sync + 'static {
    async fn verify(&self, endpoint: CdpEndpoint) -> Result<(), CdpError>;
}

#[derive(Debug, Clone)]
pub struct BridgeNotification {
    pub payload: Value,
    pub lifecycle_epoch: u64,
}

struct OutboundMessage {
    payload: Value,
    document_epoch: u64,
}

#[derive(Debug)]
struct GateState {
    recent_requests: VecDeque<Instant>,
    recent_ids: VecDeque<String>,
    seen_ids: HashSet<String>,
}

struct SecureGate {
    token: CapabilityToken,
    state: Mutex<GateState>,
}

impl SecureGate {
    fn new(token: CapabilityToken) -> Self {
        Self {
            token,
            state: Mutex::new(GateState {
                recent_requests: VecDeque::new(),
                recent_ids: VecDeque::new(),
                seen_ids: HashSet::new(),
            }),
        }
    }

    async fn authorize(&self, payload: &str) -> Result<BindingRequest, BridgeError> {
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
        if !valid_request_id(&request.id) || !valid_method(&request.method) {
            return Err(BridgeError::invalid_request());
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

    async fn reset_for_new_document(&self) {
        let mut state = self.state.lock().await;
        state.recent_requests.clear();
        state.recent_ids.clear();
        state.seen_ids.clear();
    }
}

fn valid_request_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

fn valid_method(method: &str) -> bool {
    !method.is_empty()
        && method.len() <= 128
        && method
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'.')
}

#[derive(Clone)]
pub struct InjectionConfig {
    pub binding_name: String,
    pub bootstrap_source: Arc<str>,
    pub capability_token: CapabilityToken,
}

impl InjectionConfig {
    #[must_use]
    pub fn new(bootstrap_source: impl Into<Arc<str>>, token: CapabilityToken) -> Self {
        Self {
            binding_name: PRIMARY_BINDING_NAME.to_owned(),
            bootstrap_source: bootstrap_source.into(),
            capability_token: token,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SupervisorOptions {
    pub endpoint: CdpEndpoint,
    pub target_filter: TargetFilter,
    pub poll_interval: Duration,
    pub startup_timeout: Duration,
    pub idle_timeout: Duration,
    pub idle_policy: IdlePolicy,
}

/// Controls what happens after a previously-qualified renderer disappears.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdlePolicy {
    /// Return after `idle_timeout`; useful when attaching to an external process.
    ExitAfterTimeout,
    /// Continue polling until explicit cancellation; used for an owned Codex job.
    RecoverUntilCancelled,
}

impl SupervisorOptions {
    #[must_use]
    pub fn for_endpoint(endpoint: CdpEndpoint) -> Self {
        Self {
            endpoint,
            target_filter: TargetFilter::default(),
            poll_interval: Duration::from_millis(500),
            startup_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(5),
            idle_policy: IdlePolicy::ExitAfterTimeout,
        }
    }
}

pub struct CdpSupervisor<H> {
    discovery: TargetDiscovery,
    options: SupervisorOptions,
    injection: InjectionConfig,
    handler: Arc<H>,
    endpoint_verifier: Arc<dyn EndpointVerifier>,
    notifications: broadcast::Sender<BridgeNotification>,
}

impl<H> CdpSupervisor<H>
where
    H: BridgeHandler,
{
    pub fn new(
        options: SupervisorOptions,
        injection: InjectionConfig,
        handler: Arc<H>,
        endpoint_verifier: Arc<dyn EndpointVerifier>,
    ) -> Result<Self, CdpError> {
        let (notifications, _) = broadcast::channel(256);
        Ok(Self {
            discovery: TargetDiscovery::new()?,
            options,
            injection,
            handler,
            endpoint_verifier,
            notifications,
        })
    }

    #[must_use]
    pub fn notification_sender(&self) -> broadcast::Sender<BridgeNotification> {
        self.notifications.clone()
    }

    pub async fn run(self, cancellation: CancellationToken) -> Result<(), CdpError> {
        let started = Instant::now();
        let startup_deadline = started
            .checked_add(self.options.startup_timeout)
            .ok_or(CdpError::Protocol)?;
        let mut qualified_target_seen = false;
        let mut next_session_generation = 1_u64;
        let mut idle_since = None;
        let mut sessions: HashMap<String, TargetSession> = HashMap::new();
        let mut qualified_targets = HashSet::new();
        let mut recently_qualified_targets: HashMap<String, Instant> = HashMap::new();
        let mut pending_candidates = HashMap::new();
        let mut rejected_targets: HashMap<String, Instant> = HashMap::new();
        let (session_status_sender, mut session_status_receiver) =
            mpsc::unbounded_channel::<SessionStatus>();

        loop {
            if cancellation.is_cancelled() {
                break;
            }
            while let Ok(status) = session_status_receiver.try_recv() {
                apply_session_status(
                    status,
                    &mut sessions,
                    &mut qualified_targets,
                    &mut recently_qualified_targets,
                    &mut pending_candidates,
                    &mut rejected_targets,
                );
            }
            let targets = match self.discovery.targets(self.options.endpoint).await {
                Ok(targets) => targets,
                Err(error)
                    if !qualified_target_seen
                        && started.elapsed() < self.options.startup_timeout =>
                {
                    tracing::debug!(event = "cdp_waiting", code = ?error);
                    sleep_or_cancel(self.options.poll_interval, &cancellation).await;
                    continue;
                }
                Err(error) if qualified_target_seen => {
                    tracing::debug!(event = "cdp_temporarily_unavailable", code = ?error);
                    Vec::new()
                }
                Err(error) => return Err(error),
            };
            let discovered_target_count = targets.len();
            if validate_target_budget(discovered_target_count, 0).is_err() {
                self.handler.invalidate_lifecycle();
                stop_all_sessions(&mut sessions);
                return Err(CdpError::TooManyTargets);
            }
            let present_targets: HashSet<_> =
                targets.iter().map(|target| target.id.clone()).collect();
            rejected_targets.retain(|target_id, rejected_at| {
                present_targets.contains(target_id)
                    && rejected_at.elapsed() < Duration::from_secs(10)
            });
            prune_recently_qualified_targets(&mut recently_qualified_targets);
            let compatible: Vec<_> = targets
                .into_iter()
                .filter(|target| self.options.target_filter.accepts(target))
                .filter(|target| !rejected_targets.contains_key(&target.id))
                .collect();
            if validate_target_budget(discovered_target_count, compatible.len()).is_err() {
                self.handler.invalidate_lifecycle();
                stop_all_sessions(&mut sessions);
                return Err(CdpError::TooManyTargets);
            }
            let compatible_targets: HashSet<_> =
                compatible.iter().map(|target| target.id.clone()).collect();
            let disappeared_qualified_targets: Vec<_> = qualified_targets
                .difference(&compatible_targets)
                .cloned()
                .collect();
            for target_id in disappeared_qualified_targets {
                remember_recently_qualified_target(&mut recently_qualified_targets, target_id);
            }
            if stop_stale_sessions(&mut sessions, &mut qualified_targets, &compatible_targets) {
                self.handler.invalidate_lifecycle();
            }

            for target in compatible {
                if sessions.contains_key(&target.id) {
                    continue;
                }
                let injection = self.injection.clone();
                let handler = self.handler.clone();
                let session_handler = handler.clone();
                let endpoint_verifier = self.endpoint_verifier.clone();
                let notifications = self.notifications.subscribe();
                let endpoint = self.options.endpoint;
                let session_cancellation = cancellation.child_token();
                let stored_cancellation = session_cancellation.clone();
                let lease_held = Arc::new(AtomicBool::new(false));
                let stored_lease = lease_held.clone();
                let qualification_nudge = Arc::new(Notify::new());
                let stored_qualification_nudge = qualification_nudge.clone();
                let target_id = target.id.clone();
                let session_key = target_id.clone();
                let session_generation = next_session_generation;
                let Some(next_generation) = next_session_generation.checked_add(1) else {
                    self.handler.invalidate_lifecycle();
                    stop_all_sessions(&mut sessions);
                    return Err(CdpError::Protocol);
                };
                next_session_generation = next_generation;
                let initial_settle_timeout =
                    recently_qualified_target_grace(&mut recently_qualified_targets, &target_id);
                let cold_startup_deadline =
                    cold_startup_deadline(startup_deadline, qualified_target_seen);
                let canonical_startup_grace =
                    canonical_renderer_startup_grace(&target, qualified_target_seen);
                let status_sender = session_status_sender.clone();
                let task = tokio::spawn(async move {
                    let result = run_target_session(
                        endpoint,
                        target,
                        injection,
                        handler,
                        endpoint_verifier,
                        notifications,
                        session_cancellation,
                        initial_settle_timeout,
                        cold_startup_deadline,
                        canonical_startup_grace,
                        qualification_nudge,
                        session_generation,
                        status_sender.clone(),
                        lease_held.clone(),
                    )
                    .await;
                    if lease_held.load(AtomicOrdering::Acquire) {
                        session_handler.invalidate_lifecycle();
                    }
                    let incompatible = matches!(result, Err(CdpError::IncompatibleRenderer));
                    if let Err(error) = &result {
                        tracing::debug!(event = "cdp_session_ended", target_id = %target_id, code = ?error);
                    }
                    let _ = status_sender.send(SessionStatus::Ended {
                        target_id,
                        session_generation,
                        incompatible,
                    });
                });
                sessions.insert(
                    session_key,
                    TargetSession {
                        session_generation,
                        cancellation: stored_cancellation,
                        lease_held: stored_lease,
                        qualification_nudge: stored_qualification_nudge,
                        task,
                    },
                );
            }
            retain_live_candidates_and_nudge(
                &sessions,
                &qualified_targets,
                &mut pending_candidates,
                &compatible_targets,
            );
            if candidate_cohort_is_ambiguous(&qualified_targets, &pending_candidates) {
                for (_, approval) in pending_candidates.drain() {
                    let _ = approval.send(Err(CdpError::AmbiguousRenderer));
                }
                self.handler.invalidate_lifecycle();
                stop_all_sessions(&mut sessions);
                return Err(CdpError::AmbiguousRenderer);
            }
            if candidate_cohort_ready(&sessions, &qualified_targets, &pending_candidates) {
                let target_id = pending_candidates
                    .keys()
                    .next()
                    .cloned()
                    .ok_or(CdpError::Protocol)?;
                let approval = pending_candidates
                    .remove(&target_id)
                    .ok_or(CdpError::Protocol)?;
                grant_renderer_lease(&mut qualified_targets, target_id, approval)?;
                qualified_target_seen = true;
                idle_since = None;
            }
            if qualified_targets.is_empty() {
                if !sessions.is_empty() {
                    idle_since = None;
                } else if qualified_target_seen {
                    if self.options.idle_policy == IdlePolicy::ExitAfterTimeout {
                        let since = idle_since.get_or_insert_with(Instant::now);
                        if idle_policy_stops_supervisor(
                            self.options.idle_policy,
                            since.elapsed(),
                            self.options.idle_timeout,
                        ) {
                            break;
                        }
                    } else {
                        idle_since = None;
                    }
                } else if started.elapsed() >= self.options.startup_timeout {
                    return Err(CdpError::NoCompatibleTarget);
                }
            }
            sleep_or_cancel(self.options.poll_interval, &cancellation).await;
        }

        cancellation.cancel();
        self.handler.invalidate_lifecycle();
        stop_all_sessions(&mut sessions);
        Ok(())
    }
}

fn idle_policy_stops_supervisor(policy: IdlePolicy, idle_for: Duration, timeout: Duration) -> bool {
    policy == IdlePolicy::ExitAfterTimeout && idle_for >= timeout
}

struct TargetSession {
    session_generation: u64,
    cancellation: CancellationToken,
    lease_held: Arc<AtomicBool>,
    qualification_nudge: Arc<Notify>,
    task: JoinHandle<()>,
}

fn apply_session_status(
    status: SessionStatus,
    sessions: &mut HashMap<String, TargetSession>,
    qualified_targets: &mut HashSet<String>,
    recently_qualified_targets: &mut HashMap<String, Instant>,
    pending_candidates: &mut HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
    rejected_targets: &mut HashMap<String, Instant>,
) {
    match status {
        SessionStatus::Candidate {
            target_id,
            session_generation,
            approval,
        } => {
            if sessions
                .get(&target_id)
                .is_some_and(|session| session.session_generation == session_generation)
            {
                pending_candidates.insert(target_id, approval);
            }
        }
        SessionStatus::Ended {
            target_id,
            session_generation,
            incompatible,
        } => {
            if !sessions
                .get(&target_id)
                .is_some_and(|session| session.session_generation == session_generation)
            {
                return;
            }
            sessions.remove(&target_id);
            pending_candidates.remove(&target_id);
            if qualified_targets.remove(&target_id) {
                remember_recently_qualified_target(recently_qualified_targets, target_id.clone());
            }
            if incompatible {
                rejected_targets.insert(target_id, Instant::now());
            }
        }
    }
}

impl TargetSession {
    fn stop(self) -> bool {
        self.cancellation.cancel();
        self.task.abort();
        self.lease_held.load(AtomicOrdering::Acquire)
    }
}

fn stop_all_sessions(sessions: &mut HashMap<String, TargetSession>) {
    for (_, session) in sessions.drain() {
        let _ = session.stop();
    }
}

fn stop_stale_sessions(
    sessions: &mut HashMap<String, TargetSession>,
    qualified_targets: &mut HashSet<String>,
    matching_targets: &HashSet<String>,
) -> bool {
    let stale: Vec<_> = sessions
        .keys()
        .filter(|target_id| !matching_targets.contains(*target_id))
        .cloned()
        .collect();
    let mut stopped_leased = false;
    for target_id in &stale {
        if let Some(session) = sessions.remove(target_id) {
            stopped_leased |= session.stop();
        }
        qualified_targets.remove(target_id);
    }
    qualified_targets.retain(|target_id| matching_targets.contains(target_id));
    stopped_leased
}

fn remember_recently_qualified_target(targets: &mut HashMap<String, Instant>, target_id: String) {
    prune_recently_qualified_targets(targets);
    if !targets.contains_key(&target_id) && targets.len() >= MAX_RECENTLY_QUALIFIED_TARGETS {
        let oldest = targets
            .iter()
            .min_by_key(|(_, qualified_at)| **qualified_at)
            .map(|(target_id, _)| target_id.clone());
        if let Some(oldest) = oldest {
            targets.remove(&oldest);
        }
    }
    targets.insert(target_id, Instant::now());
}

fn prune_recently_qualified_targets(targets: &mut HashMap<String, Instant>) {
    targets.retain(|_, qualified_at| qualified_at.elapsed() < RECENTLY_QUALIFIED_TARGET_TTL);
}

fn recently_qualified_target_grace(
    targets: &mut HashMap<String, Instant>,
    target_id: &str,
) -> Duration {
    prune_recently_qualified_targets(targets);
    if targets.contains_key(target_id) {
        INITIAL_RENDERER_QUALIFICATION_TIMEOUT
    } else {
        Duration::ZERO
    }
}

fn cold_startup_deadline(
    startup_deadline: Instant,
    qualified_target_seen: bool,
) -> Option<Instant> {
    (!qualified_target_seen).then_some(startup_deadline)
}

fn canonical_renderer_startup_grace(target: &CdpTarget, qualified_target_seen: bool) -> bool {
    !qualified_target_seen && target.url == "app://-/index.html"
}

fn nudge_unresolved_qualifications(
    sessions: &HashMap<String, TargetSession>,
    qualified: &HashSet<String>,
    pending: &HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
) {
    for (target_id, session) in sessions {
        if !qualified.contains(target_id) && !pending.contains_key(target_id) {
            session.qualification_nudge.notify_one();
        }
    }
}

fn retain_live_candidates_and_nudge(
    sessions: &HashMap<String, TargetSession>,
    qualified: &HashSet<String>,
    pending: &mut HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
    compatible_targets: &HashSet<String>,
) {
    pending.retain(|target_id, _| compatible_targets.contains(target_id));
    if !pending.is_empty() {
        nudge_unresolved_qualifications(sessions, qualified, pending);
    }
}

fn register_qualified_target(
    qualified_targets: &mut HashSet<String>,
    target_id: String,
) -> Result<(), CdpError> {
    qualified_targets.insert(target_id);
    if qualified_targets.len() > 1 {
        Err(CdpError::AmbiguousRenderer)
    } else {
        Ok(())
    }
}

fn validate_target_budget(discovered: usize, compatible: usize) -> Result<(), CdpError> {
    if discovered > MAX_DISCOVERED_TARGETS || compatible > MAX_COMPATIBLE_TARGETS {
        Err(CdpError::TooManyTargets)
    } else {
        Ok(())
    }
}

fn remember_rejected_context(contexts: &mut HashSet<u64>, context_id: u64) {
    if contexts.len() < MAX_REJECTED_EXECUTION_CONTEXTS {
        contexts.insert(context_id);
    }
}

fn candidate_cohort_is_ambiguous(
    qualified: &HashSet<String>,
    pending: &HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
) -> bool {
    pending.len() > 1 || (!pending.is_empty() && !qualified.is_empty())
}

fn candidate_cohort_ready(
    sessions: &HashMap<String, TargetSession>,
    qualified: &HashSet<String>,
    pending: &HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
) -> bool {
    pending.len() == 1
        && sessions
            .keys()
            .all(|target_id| qualified.contains(target_id) || pending.contains_key(target_id))
}

fn grant_renderer_lease(
    qualified_targets: &mut HashSet<String>,
    target_id: String,
    approval: oneshot::Sender<Result<(), CdpError>>,
) -> Result<(), CdpError> {
    if let Err(error) = register_qualified_target(qualified_targets, target_id.clone()) {
        let _ = approval.send(Err(CdpError::AmbiguousRenderer));
        return Err(error);
    }
    if approval.send(Ok(())).is_err() {
        qualified_targets.remove(&target_id);
        return Err(CdpError::Protocol);
    }
    Ok(())
}

enum SessionStatus {
    Candidate {
        target_id: String,
        session_generation: u64,
        approval: oneshot::Sender<Result<(), CdpError>>,
    },
    Ended {
        target_id: String,
        session_generation: u64,
        incompatible: bool,
    },
}

async fn sleep_or_cancel(duration: Duration, cancellation: &CancellationToken) {
    tokio::select! {
        () = cancellation.cancelled() => {}
        () = tokio::time::sleep(duration) => {}
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_target_session<H>(
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
    let (mut socket, _) = connection.map_err(|_| CdpError::WebSocket)?;
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
        if renderer_probe_matches(&probe) {
            if cold_startup_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                return Err(CdpError::IncompatibleRenderer);
            }
            break true;
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
    next_id += 1;
    send_command(
        &mut socket,
        next_id,
        "Page.addScriptToEvaluateOnNewDocument",
        json!({ "source": injection.bootstrap_source.as_ref() }),
    )
    .await?;
    let _ = wait_for_command(&mut socket, next_id, &mut setup_events).await?;
    if setup_contains_top_navigation(&setup_events)? {
        return Err(CdpError::IncompatibleRenderer);
    }
    next_id += 1;

    let (mut writer, mut reader) = socket.split();
    send_command(
        &mut writer,
        next_id,
        "Runtime.evaluate",
        json!({
            "expression": injection.bootstrap_source.as_ref(),
            "awaitPromise": false,
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
                    .is_some_and(|(_, _, _, started): &(u64, u64, String, Instant)| {
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
                    return Err(CdpError::Protocol);
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
                let expression = delivery_expression(&outbound.payload)?;
                send_command(
                    &mut writer,
                    next_id,
                    "Runtime.evaluate",
                    json!({ "expression": expression, "awaitPromise": false }),
                ).await?;
                next_id += 1;
            }
            notification = notifications.recv() => match notification {
                Ok(notification) => {
                    if !document_qualified
                        || trusted_execution_context.is_none()
                        || notification.lifecycle_epoch != handler.lifecycle_epoch()
                    {
                        continue;
                    }
                    let expression = delivery_expression(&notification.payload)?;
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
                    let expression = delivery_expression(&resync)?;
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
                let incoming = incoming.map_err(|_| CdpError::WebSocket)?;
                match incoming {
                    Message::Text(text) => {
                        let message = parse_cdp_message(text.as_ref())?;
                        let execution_context_probe_id =
                            execution_context_probe.as_ref().map(|(id, _, _, _)| *id);
                        if execution_context_probe_id.is_some()
                            && message.get("id").and_then(Value::as_u64)
                                == execution_context_probe_id
                        {
                            let (_, context_id, payload, _) =
                                execution_context_probe.take().ok_or(CdpError::Protocol)?;
                            if message
                                .get("result")
                                .is_some_and(renderer_probe_matches)
                            {
                                trusted_execution_context = Some(context_id);
                                rejected_execution_contexts.remove(&context_id);
                                last_qualification = Instant::now();
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
                                let resync = json!({ "method": "explorer.resync", "params": {} });
                                let expression = delivery_expression(&resync)?;
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
                            } else if execution_context_probe.is_none() {
                                let Some(payload) =
                                    bounded_binding_payload(&message, &injection.binding_name)
                                else {
                                    continue;
                                };
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
                                    Some((next_id, context_id, payload.to_owned(), Instant::now()));
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

fn dispatch_request<H>(
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
                let response = match handler.handle(request).await {
                    Ok(result) => json!({ "id": id, "ok": true, "result": result }),
                    Err(error) => json!({ "id": id, "ok": false, "error": error }),
                };
                let _ = outbound_sender
                    .send(OutboundMessage {
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
                    payload: response,
                    document_epoch,
                })
                .map_err(|_| CdpError::Protocol)?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn authorize_binding_request<H>(
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
    let Ok(request) = gate.authorize(payload).await else {
        // Unauthenticated, malformed, replayed, and rate-excess traffic is
        // silently dropped. Echoing an attacker-selected ID lets an iframe
        // reject a legitimate renderer promise with the same predictable ID.
        return Ok(());
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
        }
        Ok(())
    }
}

fn validate_websocket_url(endpoint: CdpEndpoint, raw_url: &str) -> Result<(), CdpError> {
    let url = Url::parse(raw_url).map_err(|_| CdpError::InvalidWebSocketEndpoint)?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    if url.scheme() != "ws" || !loopback || url.port_or_known_default() != Some(endpoint.port()) {
        return Err(CdpError::InvalidWebSocketEndpoint);
    }
    Ok(())
}

async fn wait_for_candidate_approval(
    approval_receiver: oneshot::Receiver<Result<(), CdpError>>,
    cold_startup_deadline: Option<Instant>,
    recovery_timeout: Duration,
) -> Result<Result<(), CdpError>, CdpError> {
    match cold_startup_deadline {
        Some(deadline) => {
            let approval = tokio::time::timeout_at(
                tokio::time::Instant::from_std(deadline),
                approval_receiver,
            )
            .await
            .map_err(|_| CdpError::IncompatibleRenderer)?
            .map_err(|_| CdpError::Protocol)?;
            if Instant::now() >= deadline {
                return Err(CdpError::IncompatibleRenderer);
            }
            Ok(approval)
        }
        None => tokio::time::timeout(recovery_timeout, approval_receiver)
            .await
            .map_err(|_| CdpError::Protocol)?
            .map_err(|_| CdpError::Protocol),
    }
}

async fn send_command<S>(
    writer: &mut S,
    id: u64,
    method: &str,
    params: Value,
) -> Result<(), CdpError>
where
    S: futures_util::Sink<Message> + Unpin,
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
        .map_err(|_| CdpError::WebSocket)
}

async fn send_command_before_deadline<S>(
    writer: &mut S,
    id: u64,
    method: &str,
    params: Value,
    deadline: Option<Instant>,
) -> Result<(), CdpError>
where
    S: futures_util::Sink<Message> + Unpin,
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

async fn wait_for_command<S>(
    socket: &mut S,
    expected_id: u64,
    setup_events: &mut VecDeque<Value>,
) -> Result<Value, CdpError>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let incoming = socket.next().await.ok_or(CdpError::WebSocket)?;
            let incoming = incoming.map_err(|_| CdpError::WebSocket)?;
            let Message::Text(text) = incoming else {
                continue;
            };
            let message = parse_cdp_message(text.as_ref())?;
            if message.get("id").and_then(Value::as_u64) != Some(expected_id) {
                retain_setup_lifecycle_event(setup_events, &message)?;
                continue;
            }
            if message.get("error").is_some() {
                return Err(CdpError::Protocol);
            }
            return message.get("result").cloned().ok_or(CdpError::Protocol);
        }
    })
    .await
    .map_err(|_| CdpError::WebSocket)?
}

async fn wait_for_command_before_deadline<S>(
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

fn parse_cdp_message(text: &str) -> Result<Value, CdpError> {
    if text.len() > MAX_CDP_MESSAGE_BYTES {
        return Err(CdpError::Protocol);
    }
    serde_json::from_str(text).map_err(|_| CdpError::Protocol)
}

fn renderer_probe_matches(result: &Value) -> bool {
    result
        .get("result")
        .and_then(|remote_object| remote_object.get("value"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn renderer_document_is_loading(result: &Value) -> bool {
    result
        .get("result")
        .and_then(|remote_object| remote_object.get("value"))
        .and_then(Value::as_str)
        == Some("loading")
}

fn initial_qualification_retry_timeout(
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
        None => relative_grace,
    }
}

fn top_frame_started_loading(message: &Value, top_frame_id: Option<&str>) -> bool {
    message.get("method").and_then(Value::as_str) == Some("Page.frameStartedLoading")
        && message
            .get("params")
            .and_then(|params| params.get("frameId"))
            .and_then(Value::as_str)
            .zip(top_frame_id)
            .is_some_and(|(loading, top)| loading == top)
}

fn top_frame_navigation_url(message: &Value) -> Result<Option<&str>, CdpError> {
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

fn setup_contains_top_navigation(events: &VecDeque<Value>) -> Result<bool, CdpError> {
    for event in events {
        if top_frame_navigation_url(event)?.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

fn retain_setup_lifecycle_event(
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

fn is_trusted_app_url(raw_url: &str) -> bool {
    Url::parse(raw_url).is_ok_and(|url| url.scheme() == "app" && url.host_str() == Some("-"))
}

fn binding_execution_context(message: &Value, binding_name: &str) -> Option<u64> {
    if message.get("method")?.as_str()? != "Runtime.bindingCalled" {
        return None;
    }
    let params = message.get("params")?;
    if params.get("name")?.as_str()? != binding_name {
        return None;
    }
    params.get("executionContextId")?.as_u64()
}

fn bounded_binding_payload<'a>(message: &'a Value, binding_name: &str) -> Option<&'a str> {
    binding_execution_context(message, binding_name)?;
    let params = message.get("params")?;
    let payload = params.get("payload").and_then(Value::as_str)?;
    if payload.len() > MAX_BINDING_PAYLOAD_BYTES {
        return None;
    }
    Some(payload)
}

fn delivery_expression(message: &Value) -> Result<String, CdpError> {
    let serialized = serde_json::to_string(message).map_err(|_| CdpError::Protocol)?;
    let quoted = serde_json::to_string(&serialized).map_err(|_| CdpError::Protocol)?;
    Ok(format!(
        "(()=>{{const m=JSON.parse({quoted});if(typeof window.__codexLiveExplorerReceive==='function'){{window.__codexLiveExplorerReceive(m);}}else{{window.dispatchEvent(new CustomEvent('codex-live-explorer:message',{{detail:m}}));}}}})()"
    ))
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering as AtomicOrdering};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    use super::*;

    struct EchoHandler;

    #[async_trait]
    impl BridgeHandler for EchoHandler {
        async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
            Ok(json!({ "accepted": request.method }))
        }
    }

    struct AllowEndpointVerifier;

    #[async_trait]
    impl EndpointVerifier for AllowEndpointVerifier {
        async fn verify(&self, _endpoint: CdpEndpoint) -> Result<(), CdpError> {
            Ok(())
        }
    }

    struct RejectEndpointVerifier {
        calls: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl EndpointVerifier for RejectEndpointVerifier {
        async fn verify(&self, _endpoint: CdpEndpoint) -> Result<(), CdpError> {
            self.calls.fetch_add(1, AtomicOrdering::SeqCst);
            Err(CdpError::EndpointIdentityMismatch)
        }
    }

    struct RecordingHandler {
        ids: Arc<std::sync::Mutex<Vec<String>>>,
    }

    #[async_trait]
    impl BridgeHandler for RecordingHandler {
        async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
            self.ids
                .lock()
                .expect("recording handler lock")
                .push(request.id);
            Ok(json!({ "accepted": true }))
        }
    }

    struct EpochRecordingHandler {
        epoch: AtomicU64,
        requests: Arc<std::sync::Mutex<Vec<(String, u64)>>>,
    }

    #[async_trait]
    impl BridgeHandler for EpochRecordingHandler {
        async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
            self.requests
                .lock()
                .expect("epoch recording handler lock")
                .push((request.id, request.lifecycle_epoch));
            Ok(json!({ "accepted": true }))
        }

        fn lifecycle_epoch(&self) -> u64 {
            self.epoch.load(AtomicOrdering::Acquire)
        }

        fn invalidate_lifecycle(&self) {
            self.epoch.fetch_add(1, AtomicOrdering::AcqRel);
        }
    }

    async fn approve_candidate(receiver: &mut mpsc::UnboundedReceiver<SessionStatus>) -> String {
        let status = tokio::time::timeout(Duration::from_secs(3), receiver.recv())
            .await
            .expect("candidate timeout")
            .expect("candidate status");
        let SessionStatus::Candidate {
            target_id,
            approval,
            ..
        } = status
        else {
            panic!("expected candidate status");
        };
        approval.send(Ok(())).expect("approve candidate");
        target_id
    }

    fn pending_target_session() -> TargetSession {
        let cancellation = CancellationToken::new();
        let task_cancellation = cancellation.clone();
        let task = tokio::spawn(async move { task_cancellation.cancelled().await });
        TargetSession {
            session_generation: 1,
            cancellation,
            lease_held: Arc::new(AtomicBool::new(false)),
            qualification_nudge: Arc::new(Notify::new()),
            task,
        }
    }

    #[test]
    fn capability_is_random_and_redacted() {
        let first = CapabilityToken::generate();
        let second = CapabilityToken::generate();
        assert_ne!(first, second);
        assert_eq!(format!("{first:?}"), "CapabilityToken([REDACTED])");
        assert!(first.expose().len() >= 40);
    }

    #[tokio::test]
    async fn gate_rejects_wrong_tokens_and_replays() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let wrong = json!({
            "id": "request-1",
            "token": "wrong",
            "method": "explorer.context",
            "params": {}
        });
        assert_eq!(
            gate.authorize(&wrong.to_string())
                .await
                .expect_err("wrong token")
                .code,
            "UNAUTHORIZED"
        );
        let valid = json!({
            "id": "request-1",
            "token": token.expose(),
            "method": "explorer.context",
            "params": {}
        });
        gate.authorize(&valid.to_string()).await.expect("valid");
        assert!(gate.authorize(&valid.to_string()).await.is_err());
    }

    #[tokio::test]
    async fn gate_bounds_request_rate_and_payload_size() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        for index in 0..MAX_REQUESTS_PER_SECOND {
            let payload = json!({
                "id": format!("rate-{index}"),
                "token": token.expose(),
                "method": "explorer.context",
                "params": {}
            });
            gate.authorize(&payload.to_string())
                .await
                .expect("within rate limit");
        }
        let excess = json!({
            "id": "rate-excess",
            "token": token.expose(),
            "method": "explorer.context",
            "params": {}
        });
        assert_eq!(
            gate.authorize(&excess.to_string())
                .await
                .expect_err("rate limited")
                .code,
            "RATE_LIMITED"
        );
        assert!(
            gate.authorize(&"x".repeat(MAX_BINDING_PAYLOAD_BYTES + 1))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn gate_accepts_one_maximum_sized_base64_preview_save() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let payload = json!({
            "id": "maximum-preview-save",
            "token": token.expose(),
            "method": "explorer.preview.save",
            "params": {
                "relativePath": "src/maximum-size-file.txt",
                "expectedVersion": "0".repeat(64),
                "contentBase64": base64::engine::general_purpose::STANDARD.encode(
                    vec![b'x'; 64 * 1024]
                ),
            }
        })
        .to_string();
        assert!(payload.len() <= MAX_BINDING_PAYLOAD_BYTES);
        gate.authorize(&payload)
            .await
            .expect("bounded preview save payload");
    }

    #[tokio::test]
    async fn wrong_tokens_are_charged_to_the_rate_window() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token);
        for index in 0..MAX_REQUESTS_PER_SECOND {
            let payload = json!({
                "id": format!("wrong-{index}"),
                "token": "wrong",
                "method": "explorer.context",
                "params": {}
            });
            assert_eq!(
                gate.authorize(&payload.to_string())
                    .await
                    .expect_err("wrong token")
                    .code,
                "UNAUTHORIZED"
            );
        }
        let excess = json!({
            "id": "wrong-excess",
            "token": "wrong",
            "method": "explorer.context",
            "params": {}
        });
        assert_eq!(
            gate.authorize(&excess.to_string())
                .await
                .expect_err("rate limited")
                .code,
            "RATE_LIMITED"
        );
    }

    #[tokio::test]
    async fn reload_resets_only_the_bounded_document_gate_state() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let request = json!({
            "id": "reload-1",
            "token": token.expose(),
            "method": "explorer.context",
            "params": {}
        })
        .to_string();
        gate.authorize(&request).await.expect("first document");
        assert!(gate.authorize(&request).await.is_err());
        gate.reset_for_new_document().await;
        gate.authorize(&request).await.expect("new document");
    }

    #[test]
    fn target_filter_fails_closed() {
        let filter = TargetFilter::default();
        let codex = CdpTarget {
            id: "1".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: "ws://127.0.0.1:9222/devtools/page/1".to_owned(),
        };
        assert!(filter.accepts(&codex));
        let mut website = codex.clone();
        website.url = "https://example.com".to_owned();
        assert!(!filter.accepts(&website));
        website.target_type = "service_worker".to_owned();
        website.url = "app://-/index.html".to_owned();
        assert!(!filter.accepts(&website));
    }

    #[test]
    fn default_supervisor_startup_timeout_remains_bounded() {
        assert_eq!(
            SupervisorOptions::for_endpoint(CdpEndpoint::loopback(9222)).startup_timeout,
            Duration::from_secs(30)
        );
    }

    #[test]
    fn more_than_one_dom_qualified_renderer_is_rejected() {
        let mut qualified = HashSet::new();
        register_qualified_target(&mut qualified, "main-1".to_owned()).expect("first renderer");
        let error = register_qualified_target(&mut qualified, "main-2".to_owned())
            .expect_err("ambiguous renderer");
        assert!(matches!(error, CdpError::AmbiguousRenderer));
    }

    #[tokio::test]
    async fn only_one_dom_qualified_session_receives_a_renderer_lease() {
        let mut qualified = HashSet::new();
        let (first_approval, first_result) = oneshot::channel();
        grant_renderer_lease(&mut qualified, "main-1".to_owned(), first_approval)
            .expect("first lease");
        assert!(matches!(first_result.await, Ok(Ok(()))));

        let (second_approval, second_result) = oneshot::channel();
        let error = grant_renderer_lease(&mut qualified, "main-2".to_owned(), second_approval)
            .expect_err("second lease");
        assert!(matches!(error, CdpError::AmbiguousRenderer));
        assert!(matches!(
            second_result.await,
            Ok(Err(CdpError::AmbiguousRenderer))
        ));
    }

    #[tokio::test]
    async fn cold_candidate_approval_is_not_truncated_by_the_recovery_timeout() {
        let (approval_sender, approval_receiver) = oneshot::channel();
        let sender = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(75)).await;
            approval_sender
                .send(Ok(()))
                .expect("cold approval receiver");
        });
        let deadline = Instant::now() + Duration::from_secs(2);

        let approval = wait_for_candidate_approval(
            approval_receiver,
            Some(deadline),
            Duration::from_millis(25),
        )
        .await
        .expect("cold approval wait");

        assert!(approval.is_ok());
        sender.await.expect("cold approval sender");
    }

    #[tokio::test]
    async fn cold_candidate_approval_is_rejected_after_its_absolute_deadline() {
        let (approval_sender, approval_receiver) = oneshot::channel();
        let deadline = Instant::now() + Duration::from_millis(20);
        tokio::time::sleep(Duration::from_millis(40)).await;
        approval_sender
            .send(Ok(()))
            .expect("queued late cold approval");

        let result =
            wait_for_candidate_approval(approval_receiver, Some(deadline), Duration::from_secs(30))
                .await;

        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
    }

    #[tokio::test]
    async fn recovery_candidate_approval_retains_its_bounded_timeout() {
        let (approval_sender, approval_receiver) = oneshot::channel();
        let started = Instant::now();
        let result =
            wait_for_candidate_approval(approval_receiver, None, Duration::from_millis(30)).await;
        drop(approval_sender);

        assert!(matches!(result, Err(CdpError::Protocol)));
        assert!(started.elapsed() >= Duration::from_millis(20));
    }

    #[tokio::test]
    async fn first_candidate_waits_for_a_delayed_compatible_probe() {
        let mut sessions = HashMap::from([("fast".to_owned(), pending_target_session())]);
        let qualified = HashSet::new();
        let (fast_approval, mut fast_result) = oneshot::channel();
        let mut pending = HashMap::from([("fast".to_owned(), fast_approval)]);
        // A newly discovered compatible target is spawned into the cohort
        // before readiness is evaluated, so the fast candidate remains held.
        sessions.insert("delayed".to_owned(), pending_target_session());
        assert!(!candidate_cohort_ready(&sessions, &qualified, &pending));
        assert!(
            tokio::time::timeout(Duration::from_millis(50), &mut fast_result)
                .await
                .is_err(),
            "fast candidate must not receive a token/native lease while delayed is unresolved"
        );

        let (delayed_approval, delayed_result) = oneshot::channel();
        pending.insert("delayed".to_owned(), delayed_approval);
        assert!(candidate_cohort_is_ambiguous(&qualified, &pending));
        for (_, approval) in pending.drain() {
            let _ = approval.send(Err(CdpError::AmbiguousRenderer));
        }
        assert!(matches!(
            fast_result.await,
            Ok(Err(CdpError::AmbiguousRenderer))
        ));
        assert!(matches!(
            delayed_result.await,
            Ok(Err(CdpError::AmbiguousRenderer))
        ));
        stop_all_sessions(&mut sessions);
    }

    #[tokio::test]
    async fn first_candidate_nudges_only_unresolved_peer_qualifications() {
        let candidate = pending_target_session();
        let candidate_nudge = candidate.qualification_nudge.clone();
        let peer = pending_target_session();
        let peer_nudge = peer.qualification_nudge.clone();
        let qualified_session = pending_target_session();
        let qualified_nudge = qualified_session.qualification_nudge.clone();
        let mut sessions = HashMap::from([
            ("candidate".to_owned(), candidate),
            ("peer".to_owned(), peer),
            ("qualified".to_owned(), qualified_session),
        ]);
        let qualified = HashSet::from(["qualified".to_owned()]);
        let (approval, _approval_result) = oneshot::channel();
        let mut pending = HashMap::from([("candidate".to_owned(), approval)]);
        let compatible = HashSet::from([
            "candidate".to_owned(),
            "peer".to_owned(),
            "qualified".to_owned(),
        ]);

        retain_live_candidates_and_nudge(&sessions, &qualified, &mut pending, &compatible);

        assert!(
            tokio::time::timeout(Duration::from_millis(50), peer_nudge.notified())
                .await
                .is_ok(),
            "unresolved peer must receive a final-probe nudge"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(20), candidate_nudge.notified())
                .await
                .is_err(),
            "the pending candidate must not nudge itself"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(20), qualified_nudge.notified())
                .await
                .is_err(),
            "an already-qualified session must not be nudged"
        );
        stop_all_sessions(&mut sessions);

        let replacement = pending_target_session();
        let replacement_nudge = replacement.qualification_nudge.clone();
        let mut replacement_sessions = HashMap::from([("replacement".to_owned(), replacement)]);
        let (stale_approval, _stale_result) = oneshot::channel();
        let mut stale_pending = HashMap::from([("vanished".to_owned(), stale_approval)]);
        retain_live_candidates_and_nudge(
            &replacement_sessions,
            &HashSet::new(),
            &mut stale_pending,
            &HashSet::from(["replacement".to_owned()]),
        );
        assert!(stale_pending.is_empty());
        assert!(
            tokio::time::timeout(Duration::from_millis(20), replacement_nudge.notified())
                .await
                .is_err(),
            "a vanished candidate must not nudge a newly discovered replacement"
        );
        stop_all_sessions(&mut replacement_sessions);
    }

    #[tokio::test]
    async fn stale_candidate_generation_cannot_claim_a_reinserted_target_id() {
        let target_id = "reappearing-main".to_owned();
        let mut old_session = pending_target_session();
        old_session.session_generation = 41;
        let mut sessions = HashMap::from([(target_id.clone(), old_session)]);
        let (stale_approval, stale_result) = oneshot::channel();
        let stale_candidate = SessionStatus::Candidate {
            target_id: target_id.clone(),
            session_generation: 41,
            approval: stale_approval,
        };

        sessions
            .remove(&target_id)
            .expect("old target session")
            .stop();
        let mut replacement = pending_target_session();
        replacement.session_generation = 42;
        sessions.insert(target_id.clone(), replacement);

        let mut qualified = HashSet::new();
        let mut recently_qualified = HashMap::new();
        let mut pending = HashMap::new();
        let mut rejected = HashMap::new();
        apply_session_status(
            stale_candidate,
            &mut sessions,
            &mut qualified,
            &mut recently_qualified,
            &mut pending,
            &mut rejected,
        );

        assert!(pending.is_empty());
        assert!(
            stale_result.await.is_err(),
            "stale approval must be dropped"
        );
        assert_eq!(
            sessions
                .get(&target_id)
                .expect("replacement session")
                .session_generation,
            42
        );

        apply_session_status(
            SessionStatus::Ended {
                target_id: target_id.clone(),
                session_generation: 41,
                incompatible: true,
            },
            &mut sessions,
            &mut qualified,
            &mut recently_qualified,
            &mut pending,
            &mut rejected,
        );
        assert!(sessions.contains_key(&target_id));
        assert!(rejected.is_empty());
        stop_all_sessions(&mut sessions);
    }

    #[test]
    fn target_and_rejected_context_collections_are_strictly_bounded() {
        assert!(validate_target_budget(MAX_DISCOVERED_TARGETS, MAX_COMPATIBLE_TARGETS).is_ok());
        assert!(validate_target_budget(MAX_DISCOVERED_TARGETS + 1, 0).is_err());
        assert!(validate_target_budget(1, MAX_COMPATIBLE_TARGETS + 1).is_err());

        let mut contexts = HashSet::new();
        for context_id in 0..10_000 {
            remember_rejected_context(&mut contexts, context_id);
        }
        assert_eq!(contexts.len(), MAX_REJECTED_EXECUTION_CONTEXTS);
    }

    #[test]
    fn setup_discards_large_non_lifecycle_event_floods() {
        let mut retained = VecDeque::new();
        let event = json!({
            "method": "Runtime.consoleAPICalled",
            "params": { "payload": "x".repeat(256 * 1024) }
        });
        for _ in 0..256 {
            retain_setup_lifecycle_event(&mut retained, &event).expect("ignore console event");
        }
        assert!(retained.is_empty());
    }

    #[tokio::test]
    async fn completed_dispatch_tasks_are_reaped_from_the_join_set() {
        let (sender, mut receiver) = mpsc::channel(32);
        let mut tasks = JoinSet::new();
        let slots = Arc::new(Semaphore::new(MAX_IN_FLIGHT_REQUESTS));
        for index in 0..MAX_IN_FLIGHT_REQUESTS {
            dispatch_request(
                BindingRequest {
                    id: format!("dispatch-{index}"),
                    token: String::new(),
                    method: "explorer.context".to_owned(),
                    params: json!({}),
                    lifecycle_epoch: 0,
                },
                Arc::new(EchoHandler),
                sender.clone(),
                slots.clone(),
                &mut tasks,
                0,
            )
            .expect("dispatch");
        }
        for _ in 0..MAX_IN_FLIGHT_REQUESTS {
            receiver.recv().await.expect("response");
            let _ = tasks.join_next().await;
        }
        assert!(tasks.is_empty());
    }

    #[tokio::test]
    async fn sessions_are_cancelled_when_targets_stop_matching() {
        let cancellation = CancellationToken::new();
        let observed = cancellation.clone();
        let task_cancellation = cancellation.clone();
        let task = tokio::spawn(async move {
            task_cancellation.cancelled().await;
        });
        let mut sessions = HashMap::from([(
            "main-1".to_owned(),
            TargetSession {
                session_generation: 1,
                cancellation,
                lease_held: Arc::new(AtomicBool::new(true)),
                qualification_nudge: Arc::new(Notify::new()),
                task,
            },
        )]);
        let mut qualified = HashSet::from(["main-1".to_owned()]);
        assert!(stop_stale_sessions(
            &mut sessions,
            &mut qualified,
            &HashSet::new()
        ));
        assert!(sessions.is_empty());
        assert!(qualified.is_empty());
        assert!(observed.is_cancelled());
    }

    #[test]
    fn binding_payload_is_bounded_before_dispatch() {
        let oversized = "x".repeat(MAX_BINDING_PAYLOAD_BYTES + 1);
        let event = json!({
            "method": "Runtime.bindingCalled",
            "params": {
                "name": PRIMARY_BINDING_NAME,
                "payload": oversized,
                "executionContextId": 7
            }
        });
        assert!(bounded_binding_payload(&event, PRIMARY_BINDING_NAME).is_none());
        assert_eq!(
            binding_execution_context(&event, PRIMARY_BINDING_NAME),
            Some(7)
        );
    }

    #[test]
    fn renderer_probe_is_top_frame_and_app_origin_scoped() {
        assert!(RENDERER_LAYOUT_PROBE.starts_with("window===window.top"));
        assert!(RENDERER_LAYOUT_PROBE.contains("location.protocol==='app:'"));
        assert!(RENDERER_LAYOUT_PROBE.contains("location.host==='-'"));
    }

    #[test]
    fn completed_auxiliary_renderer_has_no_selector_settle_grace() {
        assert_eq!(
            initial_qualification_retry_timeout(false, Duration::ZERO, false, None),
            Duration::ZERO
        );
        assert_eq!(
            initial_qualification_retry_timeout(
                false,
                INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
                false,
                None,
            ),
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT
        );
        assert_eq!(
            initial_qualification_retry_timeout(true, Duration::ZERO, false, None),
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT
        );
        assert_eq!(
            initial_qualification_retry_timeout(true, Duration::from_secs(10), false, None),
            Duration::from_secs(10),
            "loading fallback must not shorten an explicit settle grace"
        );
    }

    #[test]
    fn canonical_renderer_receives_absolute_startup_grace() {
        let deadline = Instant::now() + Duration::from_secs(30);
        let mut target = CdpTarget {
            id: "main".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: "ws://127.0.0.1:9222/devtools/page/main".to_owned(),
        };
        assert!(canonical_renderer_startup_grace(&target, false));
        assert_eq!(cold_startup_deadline(deadline, false), Some(deadline));
        assert!(
            !canonical_renderer_startup_grace(&target, true),
            "startup grace ends after the first qualified renderer"
        );
        assert_eq!(
            cold_startup_deadline(deadline, true),
            None,
            "an expired cold-start deadline must not poison post-lease recovery"
        );
        target.url = "app://-/index.html?initialRoute=%2Favatar-overlay".to_owned();
        assert!(!canonical_renderer_startup_grace(&target, false));

        let remaining = Duration::from_secs(17);
        assert_eq!(
            initial_qualification_retry_timeout(false, Duration::ZERO, true, Some(remaining)),
            remaining
        );
        assert_eq!(
            initial_qualification_retry_timeout(
                true,
                INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
                true,
                Some(Duration::from_secs(2)),
            ),
            Duration::from_secs(2),
            "the loading fallback must not extend the absolute startup deadline"
        );
        assert_eq!(
            initial_qualification_retry_timeout(
                true,
                INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
                false,
                Some(Duration::from_secs(2)),
            ),
            Duration::from_secs(2),
            "noncanonical loading grace must be capped by the cold-start deadline"
        );
        assert_eq!(
            initial_qualification_retry_timeout(false, Duration::ZERO, false, Some(remaining),),
            Duration::ZERO,
            "completed auxiliary renderers retain no settle grace"
        );
    }

    #[test]
    fn recently_qualified_grace_survives_an_absent_discovery_poll_and_is_bounded() {
        let mut targets = HashMap::new();
        remember_recently_qualified_target(&mut targets, "reload-main".to_owned());

        // A transient empty /json/list poll must not erase the exact target ID
        // that is allowed to settle when it reappears on the next poll.
        assert_eq!(
            recently_qualified_target_grace(&mut targets, "reload-main"),
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT
        );
        assert_eq!(
            recently_qualified_target_grace(&mut targets, "different-main"),
            Duration::ZERO,
            "grace must be limited to the exact previously qualified target ID"
        );

        for index in 0..(MAX_RECENTLY_QUALIFIED_TARGETS * 4) {
            remember_recently_qualified_target(&mut targets, format!("target-{index}"));
        }
        assert_eq!(targets.len(), MAX_RECENTLY_QUALIFIED_TARGETS);

        let exact_target = format!("target-{}", MAX_RECENTLY_QUALIFIED_TARGETS * 4 - 1);
        targets.insert(
            exact_target.clone(),
            Instant::now() - RECENTLY_QUALIFIED_TARGET_TTL - Duration::from_millis(1),
        );
        assert_eq!(
            recently_qualified_target_grace(&mut targets, &exact_target),
            Duration::ZERO,
            "expired target IDs must not receive selector-settle grace"
        );
        assert!(targets.len() < MAX_RECENTLY_QUALIFIED_TARGETS);
    }

    #[test]
    fn owned_process_policy_recovers_past_the_attach_idle_timeout() {
        let timeout = Duration::from_secs(5);
        let transient_gap = Duration::from_secs(30);

        assert!(idle_policy_stops_supervisor(
            IdlePolicy::ExitAfterTimeout,
            transient_gap,
            timeout,
        ));
        assert!(!idle_policy_stops_supervisor(
            IdlePolicy::RecoverUntilCancelled,
            transient_gap,
            timeout,
        ));
    }

    #[test]
    fn top_navigation_fails_closed_but_iframe_navigation_is_ignored() {
        let trusted_top = json!({
            "method": "Page.frameNavigated",
            "params": { "frame": { "id": "top", "url": "app://-/index.html" } }
        });
        let trusted_url = top_frame_navigation_url(&trusted_top)
            .expect("top event")
            .expect("top URL");
        assert!(is_trusted_app_url(trusted_url));

        let untrusted_top = json!({
            "method": "Page.frameNavigated",
            "params": { "frame": { "id": "top", "url": "https://example.com/" } }
        });
        let untrusted_url = top_frame_navigation_url(&untrusted_top)
            .expect("top event")
            .expect("top URL");
        assert!(!is_trusted_app_url(untrusted_url));

        let iframe = json!({
            "method": "Page.frameNavigated",
            "params": {
                "frame": {
                    "id": "child",
                    "parentId": "top",
                    "url": "https://example.com/"
                }
            }
        });
        assert_eq!(
            top_frame_navigation_url(&iframe).expect("iframe event"),
            None
        );
    }

    #[test]
    fn protocol_compatibility_is_explicit() {
        let mut version = BrowserVersion {
            browser: "Chrome/150.0".to_owned(),
            protocol_version: "1.3".to_owned(),
            web_socket_debugger_url: None,
        };
        assert!(version.is_supported());
        version.protocol_version = "2.0".to_owned();
        assert!(!version.is_supported());
    }

    #[test]
    fn parses_chromium_json_version_wire_names() {
        let version: BrowserVersion = serde_json::from_str(
            r#"{
                "Browser":"Chrome/150.0.7871.124",
                "Protocol-Version":"1.3",
                "webSocketDebuggerUrl":"ws://127.0.0.1:3592/devtools/browser/example"
            }"#,
        )
        .expect("Chromium /json/version fixture");
        assert_eq!(version.browser, "Chrome/150.0.7871.124");
        assert_eq!(version.protocol_version, "1.3");
        assert!(version.is_supported());
        assert_eq!(
            version.web_socket_debugger_url.as_deref(),
            Some("ws://127.0.0.1:3592/devtools/browser/example")
        );
    }

    #[tokio::test]
    async fn discovery_refuses_http_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request).await.expect("request");
            stream
                .write_all(
                    b"HTTP/1.1 302 Found\r\nLocation: https://example.com/json/version\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("redirect response");
        });

        let discovery = TargetDiscovery::new().expect("discovery");
        let result = discovery.version(CdpEndpoint::loopback(port)).await;
        assert!(matches!(result, Err(CdpError::EndpointUnavailable)));
        server.await.expect("server task");
    }

    #[test]
    fn websocket_endpoint_must_match_loopback_port() {
        let endpoint = CdpEndpoint::loopback(9222);
        assert!(validate_websocket_url(endpoint, "ws://127.0.0.1:9222/devtools/page/1").is_ok());
        assert!(validate_websocket_url(endpoint, "ws://localhost:9222/devtools/page/1").is_ok());
        assert!(validate_websocket_url(endpoint, "ws://10.0.0.1:9222/devtools/page/1").is_err());
        assert!(validate_websocket_url(endpoint, "ws://127.0.0.1:9223/devtools/page/1").is_err());
    }

    #[tokio::test]
    async fn listener_handoff_is_rejected_after_websocket_handshake_before_cdp_commands() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            matches!(
                tokio::time::timeout(Duration::from_secs(2), socket.next()).await,
                Ok(Some(Ok(Message::Text(_))))
            )
        });
        let calls = Arc::new(AtomicUsize::new(0));
        let target = CdpTarget {
            id: "handoff".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/handoff"),
        };
        let (_notification_sender, notifications) = broadcast::channel(1);
        let (status_sender, _status_receiver) = mpsc::unbounded_channel();
        let result = run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__neverInjected=true;", CapabilityToken::generate()),
            Arc::new(EchoHandler),
            Arc::new(RejectEndpointVerifier {
                calls: calls.clone(),
            }),
            notifications,
            CancellationToken::new(),
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        )
        .await;
        assert!(matches!(result, Err(CdpError::EndpointIdentityMismatch)));
        assert_eq!(calls.load(AtomicOrdering::SeqCst), 1);
        assert!(!server.await.expect("server task"));
    }

    #[test]
    fn outbound_data_is_encoded_not_interpolated() {
        let expression = delivery_expression(&json!({
            "id": "x",
            "result": "</script>\u{2028}'\""
        }))
        .expect("expression");
        assert!(expression.contains("JSON.parse"));
        assert!(expression.contains("__codexLiveExplorerReceive"));
    }

    #[tokio::test]
    async fn mock_renderer_qualifies_injects_and_round_trips_binding() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let token = CapabilityToken::generate();
        let request_token = token.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut binding_sent = false;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate"
                    && expression.contains("aside.app-shell-left-panel")
                {
                    json!({ "result": { "type": "boolean", "value": true } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__mockExplorerLoaded=true;"
                    && !binding_sent
                {
                    binding_sent = true;
                    let payload = json!({
                        "id": "integration-1",
                        "token": request_token.expose(),
                        "method": "explorer.context",
                        "params": {}
                    });
                    socket
                        .send(Message::Text(
                            json!({
                                "method": "Runtime.bindingCalled",
                                "params": {
                                    "name": PRIMARY_BINDING_NAME,
                                    "payload": payload.to_string(),
                                    "executionContextId": 1
                                }
                            })
                            .to_string()
                            .into(),
                        ))
                        .await
                        .expect("binding event");
                } else if method == "Runtime.evaluate"
                    && expression.contains("__codexLiveExplorerReceive")
                {
                    return expression.to_owned();
                }
            }
        });

        let target = CdpTarget {
            id: "mock-main".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/mock-main"),
        };
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token.clone());
        let (notification_sender, notifications) = broadcast::channel(4);
        let _notification_sender = notification_sender;
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session = tokio::spawn(async move {
            run_target_session(
                CdpEndpoint::loopback(port),
                target,
                injection,
                Arc::new(EchoHandler),
                Arc::new(AllowEndpointVerifier),
                notifications,
                session_cancellation,
                Duration::ZERO,
                None,
                false,
                Arc::new(Notify::new()),
                1,
                status_sender,
                Arc::new(AtomicBool::new(false)),
            )
            .await
        });

        let qualified_target = approve_candidate(&mut status_receiver).await;

        let delivered = tokio::time::timeout(Duration::from_secs(5), server)
            .await
            .expect("mock renderer timeout")
            .expect("mock renderer task");
        assert!(delivered.contains("integration-1"));
        assert!(delivered.contains("accepted"));
        assert_eq!(qualified_target, "mock-main");
        cancellation.cancel();
        let result = tokio::time::timeout(Duration::from_secs(2), session)
            .await
            .expect("session stop")
            .expect("session task");
        assert!(result.is_ok() || matches!(result, Err(CdpError::WebSocket)));
    }

    #[tokio::test]
    async fn cold_canonical_renderer_waits_for_completed_document_react_mount() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut layout_probe_count = 0_u8;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    layout_probe_count += 1;
                    json!({
                        "result": {
                            "type": "boolean",
                            // The HTML document is complete before React has
                            // mounted the canonical app shell.
                            "value": layout_probe_count >= 3
                        }
                    })
                } else if method == "Runtime.evaluate" && expression == DOCUMENT_READY_STATE_PROBE {
                    json!({ "result": { "type": "string", "value": "complete" } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__delayedPrimaryLoaded=true;"
                {
                    return layout_probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "delayed-primary".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/delayed-primary"),
        };
        let (_notification_sender, notifications) = broadcast::channel(4);
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new(
                "window.__delayedPrimaryLoaded=true;",
                CapabilityToken::generate(),
            ),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            session_cancellation,
            Duration::ZERO,
            Some(Instant::now() + Duration::from_secs(2)),
            true,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        ));

        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "delayed-primary"
        );
        let probes = tokio::time::timeout(Duration::from_secs(5), server)
            .await
            .expect("delayed primary timeout")
            .expect("mock renderer task");
        assert_eq!(probes, 4);
        cancellation.cancel();
        let result = session.await.expect("session task");
        assert!(result.is_ok() || matches!(result, Err(CdpError::WebSocket)));
    }

    #[tokio::test]
    async fn qualification_nudge_forces_one_fresh_fail_closed_probe() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let (first_probe_sender, first_probe_receiver) = oneshot::channel();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut layout_probe_count = 0_u8;
            let mut first_probe_sender = Some(first_probe_sender);
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    layout_probe_count += 1;
                    json!({ "result": { "type": "boolean", "value": false } })
                } else if method == "Runtime.evaluate" && expression == DOCUMENT_READY_STATE_PROBE {
                    json!({ "result": { "type": "string", "value": "complete" } })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");
                if layout_probe_count == 1 {
                    if let Some(sender) = first_probe_sender.take() {
                        sender.send(()).expect("first probe signal");
                    }
                } else if layout_probe_count == 2 {
                    return layout_probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "nudge-peer".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/nudge-peer"),
        };
        let (_notification_sender, notifications) = broadcast::channel(1);
        let (status_sender, _status_receiver) = mpsc::unbounded_channel();
        let qualification_nudge = Arc::new(Notify::new());
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__neverInjected=true;", CapabilityToken::generate()),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            CancellationToken::new(),
            Duration::ZERO,
            Some(Instant::now() + Duration::from_secs(10)),
            true,
            qualification_nudge.clone(),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        ));

        tokio::time::timeout(Duration::from_secs(2), first_probe_receiver)
            .await
            .expect("first probe timeout")
            .expect("first probe signal");
        qualification_nudge.notify_one();
        let result = tokio::time::timeout(Duration::from_secs(2), session)
            .await
            .expect("nudged session timeout")
            .expect("session task");
        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
        assert_eq!(server.await.expect("mock renderer task"), 2);
    }

    #[tokio::test]
    async fn cold_startup_deadline_rejects_a_late_true_layout_probe() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            loop {
                let Some(Ok(Message::Text(text))) = socket.next().await else {
                    return;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    tokio::time::sleep(Duration::from_millis(750)).await;
                    json!({ "result": { "type": "boolean", "value": true } })
                } else {
                    json!({})
                };
                if socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .is_err()
                {
                    return;
                }
            }
        });

        let target = CdpTarget {
            id: "late-primary".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/late-primary"),
        };
        let (_notification_sender, notifications) = broadcast::channel(1);
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let started = Instant::now();
        let result = run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__neverInjected=true;", CapabilityToken::generate()),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            CancellationToken::new(),
            Duration::ZERO,
            Some(started + Duration::from_millis(500)),
            true,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        )
        .await;

        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
        assert!(
            status_receiver.try_recv().is_err(),
            "no candidate may escape"
        );
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "the absolute deadline must cap a late true probe"
        );
        tokio::time::timeout(Duration::from_secs(2), server)
            .await
            .expect("late probe server timeout")
            .expect("late probe server task");
    }

    #[tokio::test]
    async fn replacement_session_waits_for_loading_document_and_preserves_first_reload_request() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let token = CapabilityToken::generate();
        let request_token = token.clone();
        let recorded_requests = Arc::new(std::sync::Mutex::new(Vec::new()));
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut layout_probe_count = 0_u8;
            let mut reload_sent = false;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    layout_probe_count += 1;
                    json!({
                        "result": {
                            "type": "boolean",
                            // Probe 1 is a recently-qualified replacement whose
                            // readyState is already complete but React has not
                            // mounted. Probe 4 is the same transient gap during
                            // the captured in-place reload lifecycle.
                            "value": !matches!(layout_probe_count, 1 | 4)
                        }
                    })
                } else if method == "Runtime.evaluate" && expression == DOCUMENT_READY_STATE_PROBE {
                    json!({ "result": { "type": "string", "value": "complete" } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__mockExplorerLoaded=true;"
                    && !reload_sent
                {
                    reload_sent = true;
                    let first_request = json!({
                        "id": "first-reload-request",
                        "token": request_token.expose(),
                        "method": "explorer.watch.stop",
                        "params": {}
                    });
                    // Chromium 150 emits two Runtime clears for one reload.
                    // They, the top-frame navigation, and the preload binding
                    // are one document transition and therefore one epoch.
                    let events = [
                        json!({
                            "method": "Page.frameStartedLoading",
                            "params": { "frameId": "top" }
                        }),
                        json!({ "method": "Runtime.executionContextsCleared", "params": {} }),
                        json!({ "method": "Runtime.executionContextsCleared", "params": {} }),
                        json!({
                            "method": "Page.frameNavigated",
                            "params": {
                                "frame": { "id": "top", "url": "app://-/index.html" }
                            }
                        }),
                        json!({
                            "method": "Runtime.executionContextCreated",
                            "params": {
                                "context": {
                                    "id": 3,
                                    "auxData": { "isDefault": true, "frameId": "top" }
                                }
                            }
                        }),
                        json!({
                            "method": "Runtime.executionContextCreated",
                            "params": {
                                "context": {
                                    "id": 4,
                                    "auxData": { "isDefault": false, "frameId": "top" }
                                }
                            }
                        }),
                        json!({
                            "method": "Runtime.bindingCalled",
                            "params": {
                                "name": PRIMARY_BINDING_NAME,
                                "payload": first_request.to_string(),
                                "executionContextId": 3
                            }
                        }),
                        json!({ "method": "Page.domContentEventFired", "params": {} }),
                        json!({ "method": "Page.loadEventFired", "params": {} }),
                        json!({
                            "method": "Page.frameStoppedLoading",
                            "params": { "frameId": "top" }
                        }),
                    ];
                    for event in events {
                        socket
                            .send(Message::Text(event.to_string().into()))
                            .await
                            .expect("reload lifecycle event");
                    }
                } else if method == "Runtime.evaluate"
                    && expression.contains("first-reload-request")
                {
                    return layout_probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "replacement-main".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!(
                "ws://127.0.0.1:{port}/devtools/page/replacement-main"
            ),
        };
        let handler = Arc::new(EpochRecordingHandler {
            epoch: AtomicU64::new(0),
            requests: recorded_requests,
        });
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token);
        let (_notification_sender, notifications) = broadcast::channel(4);
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session_handler = handler.clone();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            injection,
            session_handler,
            Arc::new(AllowEndpointVerifier),
            notifications,
            session_cancellation,
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        ));
        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "replacement-main"
        );

        let probes = tokio::time::timeout(Duration::from_secs(7), server)
            .await
            .expect("replacement/reload timeout")
            .expect("mock renderer task");
        assert_eq!(probes, 5);
        assert_eq!(handler.epoch.load(AtomicOrdering::Acquire), 1);
        assert_eq!(
            *handler.requests.lock().expect("recorded requests"),
            vec![("first-reload-request".to_owned(), 1)]
        );
        cancellation.cancel();
        let result = session.await.expect("session task");
        assert!(result.is_ok() || matches!(result, Err(CdpError::WebSocket)));
    }

    #[tokio::test]
    async fn navigation_blocks_native_dispatch_until_requalified_and_clears_old_queue() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let token = CapabilityToken::generate();
        let request_token = token.clone();
        let recorded_ids = Arc::new(std::sync::Mutex::new(Vec::new()));
        let ids_for_server = recorded_ids.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut probe_count = 0_u8;
            let mut navigation_sent = false;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    probe_count += 1;
                    if probe_count == 3 {
                        assert!(
                            ids_for_server.lock().expect("recorded ids lock").is_empty(),
                            "native handler ran before post-navigation qualification"
                        );
                    }
                    json!({ "result": { "type": "boolean", "value": true } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__mockExplorerLoaded=true;"
                    && !navigation_sent
                {
                    navigation_sent = true;
                    let stale = json!({
                        "id": "stale-document-request",
                        "token": request_token.expose(),
                        "method": "explorer.context",
                        "params": {}
                    });
                    let fresh = json!({
                        "id": "fresh-document-request",
                        "token": request_token.expose(),
                        "method": "explorer.context",
                        "params": {}
                    });
                    let events = [
                        json!({
                            "method": "Page.frameNavigated",
                            "params": { "frame": { "id": "top-2", "url": "app://-/index.html" } }
                        }),
                        json!({ "method": "Page.loadEventFired", "params": {} }),
                        json!({
                            "method": "Runtime.bindingCalled",
                            "params": {
                                "name": PRIMARY_BINDING_NAME,
                                "payload": stale.to_string(),
                                "executionContextId": 2
                            }
                        }),
                        json!({
                            "method": "Page.frameNavigated",
                            "params": { "frame": { "id": "top-3", "url": "app://-/index.html" } }
                        }),
                        json!({ "method": "Page.loadEventFired", "params": {} }),
                        json!({
                            "method": "Runtime.bindingCalled",
                            "params": {
                                "name": PRIMARY_BINDING_NAME,
                                "payload": fresh.to_string(),
                                "executionContextId": 3
                            }
                        }),
                    ];
                    for event in events {
                        socket
                            .send(Message::Text(event.to_string().into()))
                            .await
                            .expect("lifecycle event");
                    }
                } else if method == "Runtime.evaluate"
                    && expression.contains("fresh-document-request")
                {
                    return probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "mock-navigation".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/mock-navigation"),
        };
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token);
        let (_notification_sender, notifications) = broadcast::channel(4);
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            injection,
            Arc::new(RecordingHandler {
                ids: recorded_ids.clone(),
            }),
            Arc::new(AllowEndpointVerifier),
            notifications,
            session_cancellation,
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        ));
        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "mock-navigation"
        );

        let probes = tokio::time::timeout(Duration::from_secs(7), server)
            .await
            .expect("mock renderer timeout")
            .expect("mock renderer task");
        assert_eq!(probes, 5);
        assert_eq!(
            *recorded_ids.lock().expect("recorded ids lock"),
            vec!["fresh-document-request".to_owned()]
        );
        cancellation.cancel();
        let result = session.await.expect("session task");
        assert!(result.is_ok() || matches!(result, Err(CdpError::WebSocket)));
    }

    #[tokio::test]
    async fn qualified_renderer_is_rechecked_for_its_full_lifetime() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut probe_count = 0_u8;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    probe_count += 1;
                    json!({
                        "result": {
                            "type": "boolean",
                            "value": probe_count < 3
                        }
                    })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");
                if probe_count == 3 {
                    return probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "mock-lifetime".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/mock-lifetime"),
        };
        let token = CapabilityToken::generate();
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token);
        let (notification_sender, notifications) = broadcast::channel(4);
        let _notification_sender = notification_sender;
        let cancellation = CancellationToken::new();
        let (status_sender, _status_receiver) = mpsc::unbounded_channel();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            injection,
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            cancellation,
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
        ));

        let mut status_receiver = _status_receiver;
        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "mock-lifetime"
        );

        let result = tokio::time::timeout(Duration::from_secs(7), session)
            .await
            .expect("session timeout")
            .expect("session task");
        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
        assert_eq!(server.await.expect("mock renderer task"), 3);
    }
}
