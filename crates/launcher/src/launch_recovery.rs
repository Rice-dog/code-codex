//! Bounded recovery for a Windows activation PID which exited before identity
//! verification. Exit status zero and a responding port are never authority.
use crate::{process_diagnostics, process_guard::ProcessGuardError};
use async_trait::async_trait;
use serde::Serialize;
use serde_json::json;
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(5);
const INTERVAL: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FailureKind {
    Activation,
    Identity,
    EarlyExit,
    Rejected,
    Unavailable,
    Existing,
    Exhausted,
}

#[derive(Debug, thiserror::Error)]
#[error("startup recovery {kind:?}: {details}")]
pub(crate) struct RecoveryError {
    pub kind: FailureKind,
    pub details: String,
    pub identity: Option<ProcessGuardError>,
}
impl RecoveryError {
    fn new(kind: FailureKind, details: impl Into<String>) -> Self {
        Self {
            kind,
            details: details.into(),
            identity: None,
        }
    }
    pub fn diagnostic(&self) -> (&'static str, &'static str) {
        match self.kind {
            FailureKind::Activation => (
                "CC-START-CODEX-003",
                "Windows could not activate the Codex package",
            ),
            FailureKind::Identity => (
                "CC-START-PROCESS-005",
                "The activated Codex process could not be inspected",
            ),
            FailureKind::EarlyExit => (
                "CC-START-PROCESS-013",
                "Codex exited before startup and no trusted successor was found",
            ),
            FailureKind::Rejected => (
                "CC-START-PROCESS-014",
                "The startup successor or debugging listener failed verification",
            ),
            FailureKind::Unavailable => (
                "CC-START-PROCESS-015",
                "Startup recovery could not obtain complete process and port evidence",
            ),
            FailureKind::Existing => (
                "CC-START-PROCESS-016",
                "An existing Codex process prevented a safe startup retry",
            ),
            FailureKind::Exhausted => (
                "CC-START-PROCESS-017",
                "Codex exited again after the single automatic startup retry",
            ),
        }
    }
    pub fn guidance(&self) -> &'static str {
        match self.kind {
            FailureKind::Existing => {
                "Close the existing official Codex instance, then launch Code-Codex again. No existing instance was closed automatically."
            }
            FailureKind::Rejected => {
                "Do not bypass process verification. Send the report containing the candidate identity and port ownership checks to the developer."
            }
            FailureKind::Unavailable => {
                "Send the report containing the unavailable check and Windows error code to the developer. No retry was attempted with incomplete evidence."
            }
            _ => {
                "Send the full startup report to the developer. It includes activation attempts, actual process exit codes and the recovery decision."
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub(crate) struct Snapshot {
    /// All renderer listener addresses are loopback, with exactly this owner.
    pub candidate: Option<u32>,
    pub any_listener: bool,
    pub official_processes: usize,
}

#[async_trait]
trait Backend {
    type Guard: Send;
    async fn activate(&mut self, attempt: u8) -> Result<Self::Guard, RecoveryError>;
    async fn verify(&mut self, guard: &Self::Guard) -> Result<(), ProcessGuardError>;
    fn exit_code(&mut self, guard: &mut Self::Guard) -> Result<Option<u32>, String>;
    async fn observe(&mut self) -> Result<Snapshot, RecoveryError>;
    async fn adopt(&mut self, pid: u32) -> Result<Self::Guard, RecoveryError>;
    async fn release(&mut self, guard: Self::Guard);
    async fn pause(&mut self);
    fn window_expired(&self, started: Instant) -> bool {
        started.elapsed() >= WINDOW
    }
}

fn retry_gate(snapshot: &Snapshot) -> Result<(), RecoveryError> {
    if snapshot.any_listener || snapshot.candidate.is_some() {
        return Err(RecoveryError::new(
            FailureKind::Rejected,
            "A debugging listener appeared before retry; no relaunch is authorized",
        ));
    }
    if snapshot.official_processes != 0 {
        return Err(RecoveryError::new(
            FailureKind::Existing,
            format!(
                "Exact official image processes still running: {}; no process was terminated",
                snapshot.official_processes
            ),
        ));
    }
    Ok(())
}

async fn drive<B: Backend + Send>(backend: &mut B) -> Result<B::Guard, RecoveryError> {
    let mut history = Vec::new();
    for attempt in 1..=2 {
        let mut guard = backend.activate(attempt).await.map_err(|mut error| {
            error.details = format!(
                "attempt={attempt}; {}; precedingAttempts={history:?}",
                error.details
            );
            error
        })?;
        let verification = backend.verify(&guard).await.and_then(|()| {
            match backend.exit_code(&mut guard) {
                Ok(None) => Ok(()),
                Ok(Some(code)) => Err(ProcessGuardError::Detailed(format!("activation exited immediately after identity verification: actualExitCode={code}"))),
                Err(reason) => Err(ProcessGuardError::Detailed(format!("activation liveness recheck unavailable: {reason}"))),
            }
        });
        match verification {
            Ok(()) => {
                process_diagnostics::observe(
                    "startup recovery",
                    "activation identity",
                    "passed",
                    json!({"attempt":attempt,"priorAttempts":history,"pageReadyNotInferred":true}),
                );
                return Ok(guard);
            }
            Err(error) => {
                let state = backend.exit_code(&mut guard);
                process_diagnostics::observe(
                    "startup recovery",
                    "activation identity",
                    "failed",
                    json!({"attempt":attempt,"originalError":error.to_string(),"actualExitCode":state.as_ref().ok().copied().flatten(),"stateError":state.as_ref().err()}),
                );
                match state {
                    Ok(Some(code)) => {
                        process_diagnostics::observe(
                            "startup recovery",
                            "activation exited before startup",
                            "observed",
                            json!({"supportCode":"CC-START-PROCESS-013","attempt":attempt,"actualExitCode":code,"activationSucceededNotStartup":true}),
                        );
                        history.push(format!("attempt={attempt}; actualExitCode={code} (0x{code:08X}); identityError={error}"));
                    }
                    Ok(None) => {
                        backend.release(guard).await;
                        return Err(RecoveryError {
                            kind: FailureKind::Identity,
                            details: format!(
                                "attempt={attempt}; original process is still alive; no recovery authorized; {error}; precedingAttempts={history:?}"
                            ),
                            identity: Some(error),
                        });
                    }
                    Err(reason) => {
                        backend.release(guard).await;
                        return Err(RecoveryError::new(
                            FailureKind::Unavailable,
                            format!(
                                "attempt={attempt}; original process exit state unavailable: {reason}; {error}; precedingAttempts={history:?}"
                            ),
                        ));
                    }
                }
            }
        }
        let started = Instant::now();
        process_diagnostics::observe(
            "startup recovery",
            "successor discovery",
            "started",
            json!({"attempt":attempt,"windowMs":WINDOW.as_millis(),"pollMs":INTERVAL.as_millis(),"exitZeroIsNotSuccess":true}),
        );
        let observed = loop {
            let snapshot = match backend.observe().await {
                Ok(value) => value,
                Err(mut error) => {
                    backend.release(guard).await;
                    error.details = format!(
                        "attempt={attempt}; {}; precedingAttempts={history:?}",
                        error.details
                    );
                    return Err(error);
                }
            };
            if let Some(pid) = snapshot.candidate {
                let adopted = backend.adopt(pid).await;
                // The old helper was never armed. Never transfer its package-wide
                // termination authority to the successor.
                backend.release(guard).await;
                return adopted.map_err(|mut error| {
                    error.details = format!(
                        "attempt={attempt}; {}; precedingAttempts={history:?}",
                        error.details
                    );
                    error
                });
            }
            if backend.window_expired(started) {
                break snapshot;
            }
            backend.pause().await;
        };
        process_diagnostics::observe(
            "startup recovery",
            "successor discovery",
            "completed",
            json!({"attempt":attempt,"elapsedMs":started.elapsed().as_millis(),"snapshot":observed,"priorAttempts":history}),
        );
        if let Err(mut error) = retry_gate(&observed) {
            backend.release(guard).await;
            error.details = format!("{}; precedingAttempts={history:?}", error.details);
            return Err(error);
        }
        backend.release(guard).await;
        if attempt == 2 {
            return Err(RecoveryError::new(
                FailureKind::Exhausted,
                format!(
                    "No verified successor after two activation attempts; precedingAttempts={history:?}"
                ),
            ));
        }
        // Reconcile after helper cleanup and once more immediately before the
        // second activation. An outside application can still race activation;
        // the subsequent identity and port checks remain mandatory.
        for checkpoint in ["after helper release", "immediately before retry"] {
            let snapshot = backend.observe().await.map_err(|mut error| {
                error.details = format!(
                    "checkpoint={checkpoint}; {}; precedingAttempts={history:?}",
                    error.details
                );
                error
            })?;
            retry_gate(&snapshot).map_err(|mut error| {
                error.details = format!(
                    "checkpoint={checkpoint}; {}; precedingAttempts={history:?}",
                    error.details
                );
                error
            })?;
        }
        process_diagnostics::observe(
            "startup recovery",
            "automatic retry",
            "authorized",
            json!({"nextAttempt":2,"maxAttempts":2,"noOfficialProcess":true,"bothPortsAbsent":true,"priorAttempts":history}),
        );
    }
    Err(RecoveryError::new(
        FailureKind::EarlyExit,
        "No trusted successor",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn errors_round_trip_with_specific_codes_and_translated_owned_titles() {
        let mut codes = std::collections::HashSet::new();
        let en: serde_json::Value =
            serde_json::from_str(include_str!("../../../resources/i18n/en.json")).unwrap();
        let zh: serde_json::Value =
            serde_json::from_str(include_str!("../../../resources/i18n/zh-CN.json")).unwrap();
        for kind in [
            FailureKind::Activation,
            FailureKind::Identity,
            FailureKind::EarlyExit,
            FailureKind::Rejected,
            FailureKind::Unavailable,
            FailureKind::Existing,
            FailureKind::Exhausted,
        ] {
            let e = RecoveryError::new(kind, "actualExitCode=0; original evidence kept");
            let diagnostic = crate::AppError::Recovery(e).startup_diagnostic();
            assert!(codes.insert(diagnostic.code.clone()));
            assert!(diagnostic.reason.contains("original evidence kept"));
            assert!(diagnostic.encoded_line().is_some());
            let classified = crate::fault_diagnostics::enrich(
                "launcher",
                "startup diagnostic",
                "failed",
                json!({"code":diagnostic.code}),
            );
            assert_ne!(classified["fault"]["classification"], "unclassified");
            let key = en
                .as_object()
                .unwrap()
                .iter()
                .find(|(_, v)| v.as_str() == Some(&diagnostic.summary))
                .map(|(k, _)| k)
                .expect("owned title has English catalog key");
            assert_ne!(en[key], zh[key], "error title translated: {key}");
        }
    }

    #[derive(Default)]
    struct Fake {
        outcomes: VecDeque<bool>,
        states: VecDeque<Result<Option<u32>, String>>,
        snapshots: VecDeque<Result<Snapshot, FailureKind>>,
        activations: Vec<u8>,
        released: Vec<u32>,
        polls: usize,
        adopted: Vec<u32>,
        reject_adoption: bool,
        fail_activation: bool,
    }
    impl Fake {
        fn retry() -> Self {
            Self {
                outcomes: VecDeque::from([false, true]),
                states: VecDeque::from([Ok(Some(0)), Ok(None)]),
                ..Self::default()
            }
        }
    }
    #[async_trait]
    impl Backend for Fake {
        type Guard = u32;
        async fn activate(&mut self, attempt: u8) -> Result<u32, RecoveryError> {
            self.activations.push(attempt);
            self.polls = 0;
            if self.fail_activation {
                Err(RecoveryError::new(
                    FailureKind::Activation,
                    "HRESULT=0x80070005",
                ))
            } else {
                Ok(attempt as u32)
            }
        }
        async fn verify(&mut self, _: &u32) -> Result<(), ProcessGuardError> {
            if self.outcomes.pop_front().unwrap_or(false) {
                Ok(())
            } else {
                Err(ProcessGuardError::Detailed(
                    "original identity query failed".into(),
                ))
            }
        }
        fn exit_code(&mut self, _: &mut u32) -> Result<Option<u32>, String> {
            self.states.pop_front().unwrap_or(Ok(Some(0)))
        }
        async fn observe(&mut self) -> Result<Snapshot, RecoveryError> {
            self.snapshots
                .pop_front()
                .unwrap_or(Ok(Snapshot::default()))
                .map_err(|kind| RecoveryError::new(kind, "injected evidence failure"))
        }
        async fn adopt(&mut self, pid: u32) -> Result<u32, RecoveryError> {
            self.adopted.push(pid);
            if self.reject_adoption {
                Err(RecoveryError::new(
                    FailureKind::Rejected,
                    "candidate identity mismatch",
                ))
            } else {
                Ok(pid)
            }
        }
        async fn release(&mut self, guard: u32) {
            self.released.push(guard);
        }
        async fn pause(&mut self) {
            self.polls += 1;
        }
        fn window_expired(&self, _: Instant) -> bool {
            self.polls >= 1
        }
    }
    #[tokio::test]
    async fn healthy_launch_does_not_wait_scan_or_retry() {
        let mut f = Fake {
            outcomes: VecDeque::from([true]),
            states: VecDeque::from([Ok(None)]),
            ..Fake::default()
        };
        assert_eq!(drive(&mut f).await.unwrap(), 1);
        assert_eq!(f.activations, [1]);
        assert!(f.released.is_empty());
        assert_eq!(f.polls, 0);
    }
    #[tokio::test]
    async fn early_exit_then_single_retry_succeeds() {
        let mut f = Fake::retry();
        assert_eq!(drive(&mut f).await.unwrap(), 2);
        assert_eq!(f.activations, [1, 2]);
        assert_eq!(f.released, [1]);
    }
    #[tokio::test]
    async fn normal_exit_is_not_success_and_retry_is_bounded() {
        let mut f = Fake::default();
        let e = drive(&mut f).await.unwrap_err();
        assert_eq!(e.kind, FailureKind::Exhausted);
        assert_eq!(f.activations, [1, 2]);
        assert_eq!(f.released, [1, 2]);
        assert!(
            e.details.contains("attempt=1")
                && e.details.contains("attempt=2")
                && e.details.contains("actualExitCode=0")
        );
    }
    #[tokio::test]
    async fn nonzero_exit_is_preserved() {
        let mut f = Fake::default();
        f.states = VecDeque::from([Ok(Some(23)), Ok(Some(9))]);
        let e = drive(&mut f).await.unwrap_err();
        assert!(e.details.contains("actualExitCode=23") && e.details.contains("actualExitCode=9"));
    }
    #[tokio::test]
    async fn trusted_successor_avoids_reactivation_and_releases_old_helper() {
        let mut f = Fake::default();
        f.snapshots.push_back(Ok(Snapshot {
            candidate: Some(77),
            any_listener: true,
            official_processes: 1,
        }));
        assert_eq!(drive(&mut f).await.unwrap(), 77);
        assert_eq!(f.activations, [1]);
        assert_eq!(f.adopted, [77]);
        assert_eq!(f.released, [1]);
    }
    #[tokio::test]
    async fn rejected_successor_does_not_trigger_retry() {
        let mut f = Fake {
            reject_adoption: true,
            ..Fake::default()
        };
        f.snapshots.push_back(Ok(Snapshot {
            candidate: Some(77),
            ..Snapshot::default()
        }));
        assert_eq!(drive(&mut f).await.unwrap_err().kind, FailureKind::Rejected);
        assert_eq!(f.activations, [1]);
        assert_eq!(f.released, [1]);
    }
    #[tokio::test]
    async fn alive_but_unverified_process_is_never_restarted() {
        let mut f = Fake::default();
        f.states.push_back(Ok(None));
        let e = drive(&mut f).await.unwrap_err();
        assert_eq!(e.kind, FailureKind::Identity);
        assert!(e.identity.is_some());
        assert_eq!(f.activations, [1]);
        assert_eq!(f.polls, 0);
    }
    #[tokio::test]
    async fn unknown_original_exit_state_never_restarts() {
        let mut f = Fake::default();
        f.states.push_back(Err("access denied".into()));
        assert_eq!(
            drive(&mut f).await.unwrap_err().kind,
            FailureKind::Unavailable
        );
        assert_eq!(f.activations, [1]);
    }
    #[tokio::test]
    async fn incomplete_evidence_blocks_recovery() {
        for kind in [FailureKind::Unavailable, FailureKind::Rejected] {
            let mut f = Fake::default();
            f.snapshots.push_back(Err(kind));
            assert_eq!(drive(&mut f).await.unwrap_err().kind, kind);
            assert_eq!(f.activations, [1]);
            assert_eq!(f.released, [1]);
        }
    }
    #[tokio::test]
    async fn existing_official_process_prevents_retry() {
        let mut f = Fake::default();
        for _ in 0..2 {
            f.snapshots.push_back(Ok(Snapshot {
                official_processes: 1,
                ..Snapshot::default()
            }));
        }
        assert_eq!(drive(&mut f).await.unwrap_err().kind, FailureKind::Existing);
        assert_eq!(f.activations, [1]);
    }
    #[tokio::test]
    async fn late_process_or_listener_at_each_recheck_blocks_retry() {
        for checkpoint in [2, 3] {
            for listener in [false, true] {
                let mut f = Fake::default();
                for _ in 0..checkpoint {
                    f.snapshots.push_back(Ok(Snapshot::default()));
                }
                f.snapshots.push_back(Ok(Snapshot {
                    candidate: listener.then_some(77),
                    any_listener: listener,
                    official_processes: 1,
                }));
                let e = drive(&mut f).await.unwrap_err();
                assert!(matches!(
                    e.kind,
                    FailureKind::Existing | FailureKind::Rejected
                ));
                assert_eq!(f.activations, [1]);
                assert!(f.adopted.is_empty());
            }
        }
    }
    #[tokio::test]
    async fn activation_denial_keeps_os_evidence_and_does_not_retry() {
        let mut f = Fake {
            fail_activation: true,
            ..Fake::default()
        };
        let e = drive(&mut f).await.unwrap_err();
        assert_eq!(e.kind, FailureKind::Activation);
        assert!(e.details.contains("80070005"));
        assert_eq!(f.activations, [1]);
    }
    #[test]
    fn retry_gate_requires_no_process_and_no_listener() {
        assert!(retry_gate(&Snapshot::default()).is_ok());
        for s in [
            Snapshot {
                candidate: Some(1),
                ..Snapshot::default()
            },
            Snapshot {
                any_listener: true,
                ..Snapshot::default()
            },
            Snapshot {
                official_processes: 1,
                ..Snapshot::default()
            },
        ] {
            assert!(retry_gate(&s).is_err());
        }
    }
}

#[cfg(windows)]
mod windows;

pub(crate) async fn launch_package(
    package: String,
    aumid: String,
    arguments: Vec<String>,
    image: std::path::PathBuf,
    port: u16,
    inspector: Option<u16>,
    animation: bool,
) -> Result<
    (
        crate::process_guard::CodexProcessGuard,
        std::time::SystemTime,
        Option<crate::early_startup::Worker>,
    ),
    RecoveryError,
> {
    #[cfg(windows)]
    {
        let mut backend = windows::NativeBackend::new(
            package, aumid, arguments, image, port, inspector, animation,
        );
        let result = drive(&mut backend).await;
        if let Err(error) = &result {
            process_diagnostics::observe(
                "startup recovery",
                "final decision",
                "failed",
                json!({"supportCode":error.diagnostic().0,"reason":error.to_string(),"normalStartupNotEstablished":true}),
            );
            backend.stop_animation("startup connection was not established");
        }
        result.map(|guard| (guard, backend.launched_after, backend.early.take()))
    }
    #[cfg(not(windows))]
    {
        let _ = (package, aumid, arguments, image, port, inspector, animation);
        Err(RecoveryError::new(
            FailureKind::Unavailable,
            "Windows package recovery is unavailable on this platform",
        ))
    }
}
