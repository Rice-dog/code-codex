use std::collections::{HashMap, HashSet};

use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::time::{Duration, Instant};

use serde_json::Value;

use tokio::sync::{Notify, broadcast, mpsc, oneshot};
use tokio::task::JoinHandle;

use tokio_util::sync::CancellationToken;

use super::{
    BridgeHandler, BridgeNotification, CdpEndpoint, CdpError, CdpTarget, EndpointVerifier,
    INITIAL_RENDERER_QUALIFICATION_TIMEOUT, InjectionConfig, MAX_COMPATIBLE_TARGETS,
    MAX_DISCOVERED_TARGETS, MAX_RECENTLY_QUALIFIED_TARGETS, MAX_REJECTED_EXECUTION_CONTEXTS,
    RECENTLY_QUALIFIED_TARGET_TTL, TargetDiscovery, TargetFilter, run_target_session,
    sleep_or_cancel,
};

#[derive(Debug, Clone)]
pub struct SupervisorOptions {
    pub endpoint: CdpEndpoint,
    pub target_filter: TargetFilter,
    pub poll_interval: Duration,
    pub startup_timeout: Duration,
    pub idle_timeout: Duration,
    pub idle_policy: IdlePolicy,
    pub progress: Option<Arc<SupervisorProgress>>,
}

#[derive(Debug)]
pub struct SupervisorProgress {
    pub(super) state: StdMutex<SupervisorProgressSnapshot>,
    pub(super) started: Instant,
}

#[derive(Debug, Clone, Default)]
pub struct SupervisorProgressSnapshot {
    pub list_attempts: u64,
    pub list_successes: u64,
    pub last_target_count: usize,
    pub last_filter_match_count: usize,
    pub sessions_started: u64,
    pub sessions_ended: u64,
    pub initial_waiting: bool,
    pub initial_wait_observed: bool,
    pub recovery_waiting: bool,
    pub recovery_waits: u64,
    pub recovery_resumes: u64,
    pub last_recovery_wait_ms: u64,
    pub layout_rejections: u64,
    pub last_list_error: Option<String>,
    pub last_session_error: Option<String>,
    pub bootstrap_attempts: u64,
    pub bootstrap_responses: u64,
    pub bootstrap_failures: u64,
    pub layout_probe_attempts: u64,
    pub layout_probe_matches: u64,
    pub last_layout_diagnostic: Option<Value>,
    pub last_ready_state: &'static str,
    pub last_phase: &'static str,
    pub events: Vec<String>,
    pub dropped_events: u64,
}

impl Default for SupervisorProgress {
    fn default() -> Self {
        Self {
            state: StdMutex::new(SupervisorProgressSnapshot::default()),
            started: Instant::now(),
        }
    }
}

impl SupervisorProgress {
    #[must_use]
    pub fn snapshot(&self) -> SupervisorProgressSnapshot {
        self.state.lock().map_or_else(
            |_| SupervisorProgressSnapshot::default(),
            |state| state.clone(),
        )
    }

    pub(super) fn update(&self, action: impl FnOnce(&mut SupervisorProgressSnapshot)) {
        if let Ok(mut state) = self.state.lock() {
            action(&mut state)
        }
    }

    pub(super) fn record(&self, phase: &'static str) {
        if let Ok(mut state) = self.state.lock() {
            state.last_phase = phase;
            if state.events.len() == 32 {
                state.events.remove(0);
                state.dropped_events = state.dropped_events.saturating_add(1);
            }
            state.events.push(format!(
                "+{} ms | {phase}",
                self.started.elapsed().as_millis()
            ));
        }
    }

    pub(super) fn record_target_counts(&self, total: usize, matches: usize) {
        if let Ok(mut state) = self.state.lock() {
            if (state.last_target_count, state.last_filter_match_count) != (total, matches) {
                if state.events.len() == 32 {
                    state.events.remove(0);
                    state.dropped_events = state.dropped_events.saturating_add(1);
                }
                state.events.push(format!(
                    "+{} ms | target set changed | total={total}, filter_matches={matches}",
                    self.started.elapsed().as_millis()
                ));
            }
        }
    }

    pub(super) fn record_ready_state(&self, result: &Value) {
        let state = match result
            .get("result")
            .and_then(|value| value.get("value"))
            .and_then(Value::as_str)
        {
            Some("loading") => "loading",
            Some("interactive") => "interactive",
            Some("complete") => "complete",
            _ => "unknown",
        };
        if self.snapshot().last_ready_state != state {
            self.record(match state {
                "loading" => "candidate_document_loading",
                "interactive" => "candidate_document_interactive",
                "complete" => "candidate_document_complete",
                _ => "candidate_document_state_unknown",
            });
            self.update(|snapshot| snapshot.last_ready_state = state);
        }
    }
}

/// Controls waiting for the initial renderer and later renderer disappearance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdlePolicy {
    /// Return after `idle_timeout`; useful when attaching to an external process.
    ExitAfterTimeout,
    /// Keep initial and subsequent discovery alive until explicit cancellation.
    /// The startup timeout is an observation threshold for this owned-job policy.
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
            progress: None,
        }
    }
}

pub struct CdpSupervisor<H> {
    pub(super) discovery: TargetDiscovery,
    pub(super) options: SupervisorOptions,
    pub(super) injection: InjectionConfig,
    pub(super) handler: Arc<H>,
    pub(super) endpoint_verifier: Arc<dyn EndpointVerifier>,
    pub(super) notifications: broadcast::Sender<BridgeNotification>,
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
        let keep_initial_waiting = self.options.idle_policy == IdlePolicy::RecoverUntilCancelled;
        let mut next_session_generation = 1_u64;
        let mut idle_since = None;
        let mut recovery_started: Option<Instant> = None;
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
            if keep_initial_waiting
                && !qualified_target_seen
                && started.elapsed() >= self.options.startup_timeout
            {
                if let Some(progress) = &self.options.progress {
                    if !progress.snapshot().initial_wait_observed {
                        progress.update(|state| {
                            state.initial_waiting = true;
                            state.initial_wait_observed = true;
                        });
                        progress.record("initial_renderer_waiting");
                        tracing::info!(
                            event = "initial_renderer_waiting",
                            code = "CC-START-RENDERER-WAIT-001",
                            failure_inferred = false,
                            network_cause = "unproven",
                            native_dispatch = "blocked until qualified"
                        );
                    }
                }
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
            if let Some(progress) = &self.options.progress {
                progress
                    .update(|state| state.list_attempts = state.list_attempts.saturating_add(1));
            }
            let targets = match self.discovery.targets(self.options.endpoint).await {
                Ok(targets) => {
                    if let Some(progress) = &self.options.progress {
                        let matches = targets
                            .iter()
                            .filter(|target| self.options.target_filter.accepts(target))
                            .count();
                        if progress.snapshot().last_list_error.is_some() {
                            progress.record("target_list_recovered");
                        }
                        progress.record_target_counts(targets.len(), matches);
                        progress.update(|state| {
                            state.list_successes = state.list_successes.saturating_add(1);
                            state.last_target_count = targets.len();
                            state.last_filter_match_count = matches;
                            state.last_list_error = None;
                        });
                    }
                    targets
                }
                Err(error)
                    if !qualified_target_seen
                        && (keep_initial_waiting
                            || started.elapsed() < self.options.startup_timeout) =>
                {
                    if let Some(progress) = &self.options.progress {
                        if progress.snapshot().last_list_error.is_none() {
                            progress.record("target_list_unavailable");
                        }
                        progress.update(|state| state.last_list_error = Some(error.to_string()));
                    }
                    tracing::debug!(event = "cdp_waiting", code = ?error);
                    sleep_or_cancel(self.options.poll_interval, &cancellation).await;
                    continue;
                }
                Err(error) if qualified_target_seen => {
                    if let Some(progress) = &self.options.progress {
                        if progress.snapshot().last_list_error.is_none() {
                            progress.record("target_list_unavailable");
                        }
                        progress.update(|state| state.last_list_error = Some(error.to_string()));
                    }
                    tracing::debug!(event = "cdp_temporarily_unavailable", code = ?error);
                    Vec::new()
                }
                Err(error) => {
                    if let Some(progress) = &self.options.progress {
                        if progress.snapshot().last_list_error.is_none() {
                            progress.record("target_list_unavailable");
                        }
                        progress.update(|state| state.last_list_error = Some(error.to_string()));
                    }
                    return Err(error);
                }
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
                let canonical_startup_grace =
                    canonical_renderer_startup_grace(&target, qualified_target_seen);
                // Only the canonical first page may wait without an overall deadline.
                // Individual commands and all noncanonical candidates stay bounded.
                let cold_startup_deadline = if keep_initial_waiting && canonical_startup_grace {
                    None
                } else {
                    cold_startup_deadline(startup_deadline, qualified_target_seen)
                };
                let status_sender = session_status_sender.clone();
                let progress = self.options.progress.clone();
                let task = tokio::spawn(async move {
                    if let Some(progress) = &progress {
                        progress.update(|state| {
                            state.sessions_started = state.sessions_started.saturating_add(1)
                        });
                        progress.record("candidate_session_started");
                    }
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
                        progress.clone(),
                    )
                    .await;
                    if lease_held.load(AtomicOrdering::Acquire) {
                        session_handler.invalidate_lifecycle();
                    }
                    let incompatible = matches!(result, Err(CdpError::IncompatibleRenderer));
                    if let Some(progress) = &progress {
                        progress.update(|state| {
                            state.sessions_ended = state.sessions_ended.saturating_add(1);
                            if incompatible {
                                state.layout_rejections = state.layout_rejections.saturating_add(1)
                            }
                            state.last_session_error =
                                result.as_ref().err().map(ToString::to_string);
                        });
                        progress.record(if incompatible {
                            "layout_rejected"
                        } else {
                            "session_ended"
                        });
                    }
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
                if let Some(since) = recovery_started.take() {
                    if let Some(progress) = &self.options.progress {
                        progress.update(|state| {
                            state.recovery_waiting = false;
                            state.recovery_resumes += 1;
                            state.last_recovery_wait_ms =
                                since.elapsed().as_millis().try_into().unwrap_or(u64::MAX);
                        });
                        progress.record("renderer_recovery_requalified");
                    }
                    tracing::info!(
                        event = "renderer_recovery_requalified",
                        waited_ms = since.elapsed().as_millis(),
                        writes_replayed = false
                    );
                }
                if let Some(progress) = &self.options.progress {
                    if progress.snapshot().initial_waiting {
                        progress.update(|state| state.initial_waiting = false);
                        progress.record("initial_renderer_qualified_after_wait");
                    }
                }
                qualified_target_seen = true;
                idle_since = None;
            }
            if qualified_targets.is_empty() {
                if qualified_target_seen && recovery_started.is_none() {
                    recovery_started = Some(Instant::now());
                    if let Some(progress) = &self.options.progress {
                        progress.update(|state| {
                            state.recovery_waiting = true;
                            state.recovery_waits += 1;
                        });
                        progress.record("renderer_recovery_waiting");
                    }
                    tracing::info!(event="renderer_recovery_waiting", idle_policy=?self.options.idle_policy, native_dispatch="blocked until qualified", root_cause="not inferred");
                }
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
                } else if !keep_initial_waiting && started.elapsed() >= self.options.startup_timeout
                {
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

pub(super) fn idle_policy_stops_supervisor(
    policy: IdlePolicy,
    idle_for: Duration,
    timeout: Duration,
) -> bool {
    policy == IdlePolicy::ExitAfterTimeout && idle_for >= timeout
}

pub(super) struct TargetSession {
    pub(super) session_generation: u64,
    pub(super) cancellation: CancellationToken,
    pub(super) lease_held: Arc<AtomicBool>,
    pub(super) qualification_nudge: Arc<Notify>,
    pub(super) task: JoinHandle<()>,
}

pub(super) fn apply_session_status(
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
    pub(super) fn stop(self) -> bool {
        self.cancellation.cancel();
        self.task.abort();
        self.lease_held.load(AtomicOrdering::Acquire)
    }
}

pub(super) fn stop_all_sessions(sessions: &mut HashMap<String, TargetSession>) {
    for (_, session) in sessions.drain() {
        let _ = session.stop();
    }
}

pub(super) fn stop_stale_sessions(
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

pub(super) fn remember_recently_qualified_target(
    targets: &mut HashMap<String, Instant>,
    target_id: String,
) {
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

pub(super) fn prune_recently_qualified_targets(targets: &mut HashMap<String, Instant>) {
    targets.retain(|_, qualified_at| qualified_at.elapsed() < RECENTLY_QUALIFIED_TARGET_TTL);
}

pub(super) fn recently_qualified_target_grace(
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

pub(super) fn cold_startup_deadline(
    startup_deadline: Instant,
    qualified_target_seen: bool,
) -> Option<Instant> {
    (!qualified_target_seen).then_some(startup_deadline)
}

pub(super) fn canonical_renderer_startup_grace(
    target: &CdpTarget,
    qualified_target_seen: bool,
) -> bool {
    !qualified_target_seen && target.url == "app://-/index.html"
}

pub(super) fn nudge_unresolved_qualifications(
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

pub(super) fn retain_live_candidates_and_nudge(
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

pub(super) fn register_qualified_target(
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

pub(super) fn validate_target_budget(discovered: usize, compatible: usize) -> Result<(), CdpError> {
    if discovered > MAX_DISCOVERED_TARGETS || compatible > MAX_COMPATIBLE_TARGETS {
        Err(CdpError::TooManyTargets)
    } else {
        Ok(())
    }
}

pub(super) fn remember_rejected_context(contexts: &mut HashSet<u64>, context_id: u64) {
    if contexts.len() < MAX_REJECTED_EXECUTION_CONTEXTS {
        contexts.insert(context_id);
    }
}

pub(super) fn candidate_cohort_is_ambiguous(
    qualified: &HashSet<String>,
    pending: &HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
) -> bool {
    pending.len() > 1 || (!pending.is_empty() && !qualified.is_empty())
}

pub(super) fn candidate_cohort_ready(
    sessions: &HashMap<String, TargetSession>,
    qualified: &HashSet<String>,
    pending: &HashMap<String, oneshot::Sender<Result<(), CdpError>>>,
) -> bool {
    pending.len() == 1
        && sessions
            .keys()
            .all(|target_id| qualified.contains(target_id) || pending.contains_key(target_id))
}

pub(super) fn grant_renderer_lease(
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

pub(super) enum SessionStatus {
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

pub(super) async fn wait_for_candidate_approval(
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
