use crate::{
    bootstrap, exit_codes, fault_diagnostics, process_diagnostics, runtime_log, support_checks,
};

use std::sync::{Arc, Mutex};

use std::time::{Duration, Instant};

use crate::bootstrap::resolve_bundle;

use cdp_client::{CdpEndpoint, CdpError, SupervisorProgress, TargetDiscovery, TargetFilter};

use crate::discovery::{
    AppServerSourceKind, CodexInstallation, DiscoverySource, discover_app_server_source,
    discover_codex,
};

use crate::process_guard::{ProcessGuardError, launched_process_state};

use crate::startup_diagnostics::StartupDiagnostic;
use serde_json::{Value, json};

use tokio::net::TcpStream;

use super::{
    AppError, DiagnoseArgs, DiagnosticReport, FAILURE_CHECK_STARTED, LaunchFailure,
    ORIGINAL_FAILURE, STARTUP_TRACE, StartupTrace, main_listener_evidence,
};
use url::Url;
use workspace_service::WorkspaceError;

pub(super) fn startup_trace() -> &'static Mutex<StartupTrace> {
    STARTUP_TRACE.get_or_init(|| Mutex::new(StartupTrace::default()))
}

pub(super) fn begin_startup_trace(mode: &'static str) {
    process_diagnostics::reset();
    if let Ok(mut trace) = startup_trace().lock() {
        *trace = StartupTrace {
            started: Some(Instant::now()),
            events: vec![format!("+0 ms | entry | mode={mode}")],
            ..StartupTrace::default()
        };
    }
}

pub(super) fn record_startup_event(stage: &'static str, outcome: &'static str) {
    crate::startup_recovery_ui::stage(stage, outcome);
    runtime_log::record("launcher", stage, outcome, json!({}));
    if let Ok(mut trace) = startup_trace().lock() {
        let elapsed = trace.started.map_or(0, |start| start.elapsed().as_millis());
        if trace.events.len() < 40 {
            trace
                .events
                .push(format!("+{elapsed} ms | {stage} | {outcome}"));
        }
    }
}

pub(super) fn record_launch_context(renderer_port: u16, inspector_port: Option<u16>, pid: u32) {
    process_diagnostics::retain_activation_handle(pid);
    runtime_log::record(
        "launcher",
        "launch context",
        "observed",
        json!({"rendererPort":renderer_port,"inspectorPort":inspector_port,"pid":pid}),
    );
    if let Ok(mut trace) = startup_trace().lock() {
        trace.renderer_port = Some(renderer_port);
        trace.inspector_port = inspector_port;
        trace.launched_pid = Some(pid);
    }
}

pub(super) fn record_renderer_port(port: u16) {
    if let Ok(mut trace) = startup_trace().lock() {
        trace.renderer_port = Some(port);
    }
}

pub(super) fn record_precleanup_probe(probe: String) {
    if let Ok(mut trace) = startup_trace().lock() {
        trace.precleanup_probe = Some(probe);
    }
}

pub(super) fn record_listener_verified() {
    if let Ok(mut trace) = startup_trace().lock() {
        trace.listener_verified = true;
    }
}

pub(super) fn record_supervisor_progress(progress: Arc<SupervisorProgress>) {
    let observed = progress.clone();
    tokio::spawn(async move {
        let mut previous = String::new();
        loop {
            if crate::startup_recovery_ui::check_readiness_delay() {
                runtime_log::record(
                    "launcher",
                    "replacement readiness",
                    "waiting",
                    json!({
                        "code":"CC-START-RECOVERY-WAIT-001", "failureInferred":false,
                        "diagnosticWindowShown":false, "launchContinues":true
                    }),
                );
            }
            let state = observed.snapshot();
            let summary = json!({"phase":state.last_phase,"sessionsStarted":state.sessions_started,"sessionsEnded":state.sessions_ended,"layoutRejections":state.layout_rejections,"layoutMatches":state.layout_probe_matches,"bootstrapAttempts":state.bootstrap_attempts,"bootstrapFailures":state.bootstrap_failures,"targets":state.last_target_count,"matches":state.last_filter_match_count,"documentState":state.last_ready_state,"listError":state.last_list_error,"sessionError":state.last_session_error,"initialWaiting":state.initial_waiting,"initialWaitObserved":state.initial_wait_observed,"initialWaitCode":if state.initial_waiting {Some("CC-START-RENDERER-WAIT-001")}else{None},"layoutObservation":state.last_layout_diagnostic,"networkCause":"unproven; official request timings not collected","recoveryWaiting":state.recovery_waiting,"recoveryWaits":state.recovery_waits,"recoveryResumes":state.recovery_resumes,"lastRecoveryWaitMs":state.last_recovery_wait_ms});
            let encoded = summary.to_string();
            if encoded != previous {
                runtime_log::record("cdp", "renderer supervisor", "observed", summary);
                previous = encoded;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
    if let Ok(mut trace) = startup_trace().lock() {
        trace.supervisor_progress = Some(progress);
    }
}

pub(super) fn startup_trace_report() -> String {
    let Ok(trace) = startup_trace().lock() else {
        return "\n\nStartup trace: unavailable (trace lock failed)".to_owned();
    };
    let mut report = format!(
        "\n\nStartup trace:\nRenderer layout diagnostic schema: v4\n{}",
        trace.events.join("\n")
    );
    report.push_str(&format!(
        "\nRenderer port: {}\nMain inspector port: {}\nLaunched PID: {}\nListener ownership verified: {}",
        trace.renderer_port.map_or("not reserved".to_owned(), |port| port.to_string()),
        trace.inspector_port.map_or("not used".to_owned(), |port| port.to_string()),
        trace.launched_pid.map_or("not launched".to_owned(), |pid| pid.to_string()),
        trace.listener_verified,
    ));
    if let Some(probe) = &trace.precleanup_probe {
        report.push_str("\nPre-cleanup live-launch check:\n");
        report.push_str(probe);
    }
    report.push_str("\n");
    report.push_str(&process_diagnostics::report());
    if let Some(progress) = &trace.supervisor_progress {
        let state = progress.snapshot();
        report.push_str(&format!(
            "\nRenderer supervisor progress: /json/list attempts={}; successes={}; last target count={}; last filter matches={}; sessions started={}; sessions ended={}; layout rejections={}; layout probes={}; layout matches={}; last document state={}; bootstrap attempts={}; bootstrap responses={}; bootstrap failures={}; last phase={}; last list error={}; last session error={}",
            state.list_attempts,
            state.list_successes,
            state.last_target_count,
            state.last_filter_match_count,
            state.sessions_started,
            state.sessions_ended,
            state.layout_rejections,
            state.layout_probe_attempts,
            state.layout_probe_matches,
            if state.last_ready_state.is_empty() { "not_observed" } else { state.last_ready_state },
            state.bootstrap_attempts,
            state.bootstrap_responses,
            state.bootstrap_failures,
            if state.last_phase.is_empty() { "not_started" } else { state.last_phase },
            state.last_list_error.as_deref().unwrap_or("none"),
            state.last_session_error.as_deref().unwrap_or("none"),
        ));
        if !state.events.is_empty() {
            report.push_str(&format!(
                "\nRenderer event timeline (latest 32, no target IDs; earlier events omitted={}):\n",
                state.dropped_events
            ));
            report.push_str(&state.events.join("\n"));
        }
        if let Some(layout) = state.last_layout_diagnostic {
            report.push_str(&format!("\nLast bounded renderer layout observation (not proof of successful injection): {layout}"));
        }
    }
    report
}

pub(super) fn enrich_startup_diagnostic(error: &AppError) -> StartupDiagnostic {
    let mut diagnostic = error.startup_diagnostic();
    if let Some(original) = ORIGINAL_FAILURE.get()
        && original != &diagnostic
    {
        diagnostic.reason.push_str(&format!(
            "\nOriginal first failure (retained):\nSupport code: {}\nStage: {}\nReason: {}\n",
            original.code, original.stage, original.reason
        ));
    }
    diagnostic.reason.push_str(&startup_trace_report());
    diagnostic.reason.push_str(&format!(
        "\nFault interpretation (observation only):\n{}\n",
        runtime_log::redaction::value(fault_diagnostics::enrich(
            "launcher",
            &diagnostic.stage,
            "failed",
            json!({"code":diagnostic.code,"reason":diagnostic.reason})
        ))
    ));
    diagnostic.reason.push_str(&support_checks::report());
    diagnostic
}

pub(super) async fn complete_startup_failure_probe() {
    let (port, main_port, verified, previous) = match startup_trace().lock() {
        Ok(trace) => (
            trace.renderer_port,
            trace.inspector_port,
            trace.listener_verified,
            trace.precleanup_probe.clone(),
        ),
        Err(_) => return,
    };
    if failure_probe_complete(previous.as_deref()) {
        return;
    }
    let Some(port) = port else { return };
    let endpoint = CdpEndpoint::loopback(port);
    let tcp = tokio::time::timeout(
        Duration::from_millis(700),
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await;
    let mut observations = previous.into_iter().collect::<Vec<_>>();
    if let Some(main_port) = main_port {
        observations.push(main_listener_evidence(main_port).await);
    }
    observations.push(match tcp {
        Ok(Ok(stream)) => {
            drop(stream);
            "TCP: loopback connection accepted".to_owned()
        }
        Ok(Err(error)) => format!("TCP: connection failed ({error})"),
        Err(_) => "TCP: timed out after 700 ms".to_owned(),
    });
    if let Ok(discovery) = TargetDiscovery::new() {
        observations.push(match discovery.version_detailed(endpoint).await {
            Ok(version) => format!(
                "GET /json/version: responded; protocol_supported={}",
                version.is_supported()
            ),
            Err(error) => format!("GET /json/version: failed ({error})"),
        });
        if verified {
            observations.push(
                match tokio::time::timeout(
                    Duration::from_secs(8),
                    target_discovery_snapshot(endpoint, None),
                )
                .await
                {
                    Ok(details) => details,
                    Err(_) => {
                        "GET /json/list and layout probes: timed out after 8 seconds".to_owned()
                    }
                },
            );
        } else {
            observations.push(
                "Target and layout probes: skipped because listener ownership was not verified"
                    .to_owned(),
            );
        }
    }
    record_precleanup_probe(observations.join("\n"));
}

pub(super) fn failure_probe_complete(previous: Option<&str>) -> bool {
    // A process-only early snapshot must not suppress endpoint diagnostics.
    // An explicit probe timeout is terminal too; do not retry after cleanup.
    previous.is_some_and(|text| {
        text.contains("TCP:") || text.contains("supplementary probes timed out")
    })
}

#[cfg(test)]
#[test]
pub(super) fn process_only_snapshot_does_not_suppress_endpoint_diagnostics() {
    assert!(!failure_probe_complete(Some(
        "Process: PID 21904 has exited"
    )));
    assert!(!failure_probe_complete(None));
    assert!(failure_probe_complete(Some(
        "Process: PID 21904 has exited\nTCP: connection failed"
    )));
    assert!(failure_probe_complete(Some(
        "Live-launch supplementary probes timed out after 3 seconds"
    )));
}

pub(super) fn publish_startup_diagnostic(error: &AppError, checks: &str) {
    FAILURE_CHECK_STARTED.get_or_init(Instant::now);
    ORIGINAL_FAILURE.get_or_init(|| error.startup_diagnostic());
    let mut diagnostic = enrich_startup_diagnostic(error);
    diagnostic.reason.push_str(checks);
    if let Some(line) = diagnostic.encoded_line() {
        eprintln!("{line}");
    }
}

pub(super) async fn automatic_failure_checks(error: &AppError) -> String {
    let started = *FAILURE_CHECK_STARTED.get_or_init(Instant::now);
    let mut report = String::from("\nAutomatic self-check: running (15 second budget)\n");
    publish_startup_diagnostic(error, &report);
    runtime_log::record(
        "diagnostics",
        "automatic failure checks",
        "started",
        json!({"budgetMs":15000,"readOnly":true}),
    );
    let budget = Duration::from_secs(15).saturating_sub(started.elapsed());
    let outcome = tokio::time::timeout(budget, async {
        report.push_str(
            "Live-launch observations: started; existing pre-cleanup evidence is retained.\n",
        );
        publish_startup_diagnostic(error, &report);
        complete_startup_failure_probe().await;
        support_checks::run_with_progress(|phase, outcome, evidence| {
            let evidence = runtime_log::redaction::value(evidence.clone());
            report.push_str(&format!(
                "+{} ms | {phase} | {outcome}\n{}\n",
                started.elapsed().as_millis(),
                serde_json::to_string_pretty(&evidence).unwrap_or_default()
            ));
            publish_startup_diagnostic(error, &report);
        })
        .await;
    })
    .await;
    let status = if outcome.is_ok() {
        "completed"
    } else {
        "timeout"
    };
    report = report.replacen(
        "Automatic self-check: running",
        &format!("Automatic self-check: {status}"),
        1,
    );
    report.push_str(&format!(
        "Automatic self-check: {status}; elapsed={} ms.\n",
        started.elapsed().as_millis()
    ));
    report.push_str("Recovery assessment: activation recovery and query/connection retries are recorded in the preceding launch evidence. This separate self-check performs no relaunch, policy change, settings reset or resource deletion. A completed inspection does not establish successful recovery; unavailable checks are not passes.\n");
    if outcome.is_err() {
        report.push_str("The total budget expired; unfinished checks were cancelled and partial results retained.\n");
    }
    runtime_log::record(
        "diagnostics",
        "automatic failure checks",
        status,
        json!({"durationMs":started.elapsed().as_millis(),"report":report}),
    );
    publish_startup_diagnostic(error, &report);
    report
}

impl AppError {
    pub(super) const fn exit_code(&self) -> u8 {
        match self {
            Self::UnsupportedVersion => exit_codes::UNSUPPORTED_VERSION,
            Self::AlreadyRunning => exit_codes::ALREADY_RUNNING,
            Self::StartupConflict(_) => exit_codes::STARTUP_FAILURE,
            Self::Discovery(_)
            | Self::Bootstrap(_)
            | Self::Workspace(_)
            | Self::Resolver(_)
            | Self::Launch(_) => exit_codes::STARTUP_FAILURE,
            Self::Plugin { .. }
            | Self::Cdp(_)
            | Self::MainInspector { .. }
            | Self::CdpStartup(_)
            | Self::CdpTarget(_)
            | Self::ProcessGuard(_)
            | Self::Recovery(_)
            | Self::InvalidLaunchArgument
            | Self::UnverifiedAttach
            | Self::AttachMetadataMismatch => exit_codes::GENERIC_FAILURE,
        }
    }

    pub(super) fn startup_diagnostic(&self) -> StartupDiagnostic {
        use crate::bootstrap::BootstrapError;
        use crate::discovery::DiscoveryError;
        use crate::process_guard::ProcessGuardError;
        use cdp_client::CdpError;
        use context_resolver::ResolverError;

        let reason = self.to_string();
        if let Self::Discovery(DiscoveryError::Context { .. }) = self {
            let Self::Discovery(error) = self else {
                unreachable!()
            };
            let mut diagnostic = Self::Discovery(error.kind().clone()).startup_diagnostic();
            diagnostic.reason = reason;
            return diagnostic;
        }
        if let Self::ProcessGuard(ProcessGuardError::Context { .. }) = self {
            let Self::ProcessGuard(error) = self else {
                unreachable!()
            };
            let mut diagnostic = Self::ProcessGuard(error.kind().clone()).startup_diagnostic();
            diagnostic.reason = reason;
            return diagnostic;
        }
        if let Self::Resolver(ResolverError::Context { .. }) = self {
            let Self::Resolver(error) = self else {
                unreachable!()
            };
            let mut diagnostic = Self::Resolver(error.kind().clone()).startup_diagnostic();
            diagnostic.reason = reason;
            return diagnostic;
        }
        if let Self::Bootstrap(BootstrapError::Context { .. }) = self {
            let Self::Bootstrap(error) = self else {
                unreachable!()
            };
            let mut diagnostic = Self::Bootstrap(error.kind().clone()).startup_diagnostic();
            diagnostic.reason = reason;
            return diagnostic;
        }
        match self {
            Self::MainInspector { operation, details } => {
                let code = match *operation {
                    "waiting for main inspector TCP listener" => "CC-START-MAIN-001",
                    "waiting for main inspector target" | "selecting main inspector target" => {
                        "CC-START-MAIN-002"
                    }
                    "main inspector WebSocket transport" | "main inspector receive" => {
                        "CC-START-MAIN-003"
                    }
                    "verifying main inspector listener owner" => "CC-START-MAIN-004",
                    "waiting for main inspector Debugger.paused" => "CC-START-MAIN-005",
                    "main inspector command response" | "main inspector command reply timeout" => {
                        "CC-START-MAIN-006"
                    }
                    "main inspector activation process exited" => "CC-START-MAIN-008",
                    "main inspector arguments not honored" => "CC-START-MAIN-009",
                    "main inspector foreign listener" => "CC-START-MAIN-010",
                    "main inspector listener unreachable" => "CC-START-MAIN-011",
                    "main inspector listener absent" => "CC-START-MAIN-012",
                    "main inspector evidence unavailable" => "CC-START-MAIN-013",
                    "main inspector TCP access denied" => "CC-START-MAIN-014",
                    "main inspector renderer verification failed" => "CC-START-MAIN-015",
                    _ => "CC-START-MAIN-007",
                };
                StartupDiagnostic::new(
                    code,
                    "Preparing the Windows 10 window compatibility patch",
                    &format!("Windows 10 main-process failure: {operation}"),
                    details.clone(),
                    "Inspect the recorded inspector capability, actual debug-switch summary, IPv4/IPv6 listener owners, original process state and renderer fallback decision. Missing listeners, rejected arguments, local access denial and unreachable listeners are distinct observations; security-software causation requires separate evidence. Unsafe or unproven fallback is not performed.",
                )
            }
            Self::Resolver(ResolverError::Context { .. })
            | Self::Bootstrap(BootstrapError::Context { .. })
            | Self::Discovery(DiscoveryError::Context { .. }) => {
                unreachable!("context normalized above")
            }
            Self::Plugin { code, .. } => StartupDiagnostic::new(
                match code.as_str() {
                    "PLUGIN_INTEGRITY" => "CC-PLUGIN-CACHE-002",
                    "PLUGIN_ENCODING" => "CC-PLUGIN-CACHE-003",
                    "PLUGIN_EXECUTION" => "CC-PLUGIN-CACHE-004",
                    "PLUGIN_IMPORT" => "CC-PLUGIN-CACHE-005",
                    "PLUGIN_NOT_INSTALLED" => "CC-PLUGIN-CACHE-006",
                    "PLUGIN_CATALOG" => "CC-PLUGIN-CACHE-007",
                    "PLUGIN_STATE" => "CC-PLUGIN-CACHE-008",
                    _ => "CC-PLUGIN-CACHE-001",
                },
                "Preparing background packages",
                "A background package could not be prepared",
                reason,
                "Check the verified release package and per-user cache permissions. Send the full report if it repeats.",
            ),
            Self::Discovery(DiscoveryError::PackageQueryFailed { .. }) => StartupDiagnostic::new(
                "CC-START-DISCOVERY-003",
                "Querying Codex Desktop registration",
                "Windows could not check the Codex Desktop installation",
                reason,
                "Restart Code-Codex once. If it repeats, repair the official Codex Desktop app in Windows Settings.",
            ),
            Self::Discovery(DiscoveryError::StablePackageNotRegistered) => StartupDiagnostic::new(
                "CC-START-DISCOVERY-004",
                "Finding stable Codex Desktop",
                "Stable Codex Desktop is not registered for this Windows user",
                reason,
                "Install the official stable Codex Desktop app for this Windows user, then start Code-Codex again.",
            ),
            Self::Discovery(DiscoveryError::StablePackageNotRegisteredBetaOnly) => {
                StartupDiagnostic::new(
                    "CC-START-DISCOVERY-005",
                    "Finding stable Codex Desktop",
                    "Only Codex Beta is registered for this Windows user",
                    reason,
                    "Install the official stable Codex Desktop app; the desktop shortcut starts the stable channel.",
                )
            }
            Self::Discovery(DiscoveryError::PackageIdentityRejected) => StartupDiagnostic::new(
                "CC-START-DISCOVERY-006",
                "Verifying Codex Desktop registration",
                "The registered Codex package identity could not be trusted",
                reason,
                "Repair the official Codex Desktop app. Code-Codex will not launch an unverified package.",
            ),
            Self::Discovery(DiscoveryError::PackageLocationUnavailable { .. }) => {
                StartupDiagnostic::new(
                    "CC-START-DISCOVERY-007",
                    "Opening Codex Desktop",
                    "The registered Codex installation directory is unavailable",
                    reason,
                    "Repair the official Codex Desktop app in Windows Settings, then start Code-Codex again.",
                )
            }
            Self::Discovery(DiscoveryError::PackageExecutableMissing) => StartupDiagnostic::new(
                "CC-START-DISCOVERY-008",
                "Finding the Codex executable",
                "The registered Codex package has no usable desktop executable",
                reason,
                "Repair the official Codex Desktop app in Windows Settings, then start Code-Codex again.",
            ),
            Self::Discovery(DiscoveryError::CodexNotFound) => StartupDiagnostic::new(
                "CC-START-DISCOVERY-001",
                "Finding Codex Desktop",
                "Codex Desktop was not found",
                reason,
                "Install or repair the official Codex Desktop app, then start Code-Codex again.",
            ),
            Self::Discovery(DiscoveryError::InvalidExecutable) => StartupDiagnostic::new(
                "CC-START-DISCOVERY-002",
                "Verifying Codex Desktop",
                "The selected Codex executable could not be validated",
                reason,
                "Check the configured executable and the recorded path operation. Remove an invalid explicit override to use official package discovery; do not bypass package identity or access checks.",
            ),
            Self::Discovery(DiscoveryError::AppServerNotFound) => StartupDiagnostic::new(
                "CC-START-APP-001",
                "Finding the App Server",
                "The Codex App Server was not found",
                reason,
                "Update or repair Codex Desktop, then start Code-Codex again.",
            ),
            Self::Bootstrap(BootstrapError::BundleNotFound) => StartupDiagnostic::new(
                "CC-START-UI-001",
                "Loading the Explorer UI",
                "The Explorer UI bundle was not found",
                reason,
                "Run the Code-Codex installer again to repair this installation.",
            ),
            Self::Bootstrap(BootstrapError::InvalidBundle) => StartupDiagnostic::new(
                "CC-START-UI-002",
                "Validating the Explorer UI",
                "The Explorer UI bundle is invalid",
                reason,
                "Run the Code-Codex installer again to repair this installation.",
            ),
            Self::Resolver(ResolverError::Spawn) => StartupDiagnostic::new(
                "CC-START-APP-002",
                "Starting the App Server",
                "The App Server process could not be started",
                reason,
                "Restart Windows, then repair Codex Desktop if this problem continues.",
            ),
            Self::Resolver(ResolverError::Timeout) => StartupDiagnostic::new(
                "CC-START-APP-003",
                "Waiting for the App Server",
                "The App Server did not respond in time",
                reason,
                "Restart Codex Desktop and try again. If it repeats, include the diagnostic report when reporting the problem.",
            ),
            Self::Resolver(ResolverError::Protocol) => StartupDiagnostic::new(
                "CC-START-APP-004",
                "Connecting to the App Server",
                "The App Server returned invalid data",
                reason,
                "Update Codex Desktop and Code-Codex to compatible versions.",
            ),
            Self::Resolver(ResolverError::Io) => StartupDiagnostic::new(
                "CC-START-APP-005",
                "Communicating with the App Server",
                "Communication with the App Server failed",
                reason,
                "Restart Codex Desktop and try again. Include the diagnostic report if it repeats.",
            ),
            Self::Resolver(ResolverError::Remote { .. }) => StartupDiagnostic::new(
                "CC-START-APP-006",
                "Requesting App Server data",
                "The App Server rejected a request",
                reason,
                "Update Codex Desktop and Code-Codex, then try again.",
            ),
            Self::Resolver(ResolverError::NoWorkspace) => StartupDiagnostic::new(
                "CC-START-WORKSPACE-001",
                "Resolving the active workspace",
                "The selected task has no local workspace",
                reason,
                "Open a local Codex task that is connected to a project folder.",
            ),
            Self::Resolver(ResolverError::InvalidThreadId) => StartupDiagnostic::new(
                "CC-START-WORKSPACE-002",
                "Resolving the active task",
                "The active task identifier is invalid",
                reason,
                "Switch to another Codex task and try again.",
            ),
            Self::Workspace(error) => {
                let (code, guidance) = workspace_diagnostic(error);
                StartupDiagnostic::new(
                    code,
                    "Opening the workspace",
                    "The local workspace could not be opened",
                    error.to_string(),
                    guidance,
                )
            }
            Self::Cdp(CdpError::EndpointUnavailable) => StartupDiagnostic::new(
                "CC-START-CDP-001",
                "Connecting to Codex Desktop",
                "The Codex debugging endpoint was unavailable",
                reason,
                "Restart Codex Desktop from the Code-Codex shortcut and try again.",
            ),
            Self::CdpStartup(details) => StartupDiagnostic::new(
                "CC-START-CDP-013",
                "Connecting to Codex Desktop",
                "The Codex debugging endpoint was unavailable",
                details.clone(),
                "Close Codex Desktop completely and start Code-Codex again. If this repeats, send the full diagnostic report to the developer.",
            ),
            Self::Cdp(CdpError::NoCompatibleTarget) => StartupDiagnostic::new(
                "CC-START-CDP-002",
                "Finding the Codex window",
                "No Codex renderer target was found",
                reason,
                "Send the diagnostic report to the developer so the target list can be checked.",
            ),
            Self::Cdp(CdpError::IncompatibleRenderer) => StartupDiagnostic::new(
                "CC-START-CDP-008",
                "Checking the Codex window layout",
                "The Codex renderer layout is incompatible",
                reason,
                "Update Code-Codex and include the diagnostic report if this Codex Desktop version is current.",
            ),
            Self::CdpTarget(details) => StartupDiagnostic::new(
                "CC-START-CDP-014",
                "Checking the Codex window layout",
                "A Codex page was found, but its renderer layout did not match",
                details.clone(),
                "Copy details and send the report to the developer. A Codex update or a different window mode may have changed the layout; the report lists each failed rule and a text-free structural snapshot.",
            ),
            Self::Cdp(CdpError::AmbiguousRenderer) => StartupDiagnostic::new(
                "CC-START-CDP-003",
                "Selecting the Codex window",
                "More than one compatible Codex window was detected",
                reason,
                "Close extra Codex windows and start Code-Codex again.",
            ),
            Self::Cdp(error) => {
                let (code, stage, summary, guidance) = cdp_diagnostic(error);
                StartupDiagnostic::new(code, stage, summary, error.to_string(), guidance)
            }
            Self::ProcessGuard(ProcessGuardError::PortUnavailable) => StartupDiagnostic::new(
                "CC-START-PROCESS-001",
                "Preparing a local connection",
                "A local debugging port could not be reserved",
                reason,
                "Restart Windows or check whether security software is blocking local loopback connections.",
            ),
            Self::Recovery(error) => {
                let (code, summary) = error
                    .identity
                    .as_ref()
                    .map(process_diagnostic)
                    .unwrap_or_else(|| error.diagnostic());
                StartupDiagnostic::new(
                    code,
                    "Recovering Codex startup",
                    summary,
                    error.to_string(),
                    error.guidance(),
                )
            }
            Self::ProcessGuard(error) => {
                let (code, summary) = process_diagnostic(error);
                StartupDiagnostic::new(
                    code,
                    "Verifying the Codex process",
                    summary,
                    error.to_string(),
                    "Copy the full diagnostic report and send it to the Code-Codex developer. The process observations identify which check failed.",
                )
            }
            Self::UnsupportedVersion => StartupDiagnostic::new(
                "CC-START-COMPAT-001",
                "Checking compatibility",
                "This Codex Desktop version is not supported",
                reason,
                "Update Code-Codex or install a supported Codex Desktop version.",
            ),
            Self::AlreadyRunning => StartupDiagnostic::new(
                "CC-START-STATE-001",
                "Checking the Codex process",
                "Codex Desktop is already running without Code-Codex",
                reason,
                "Close Codex Desktop, then start it from the Codex or Code-Codex desktop shortcut.",
            ),
            Self::StartupConflict(_) => StartupDiagnostic::new(
                "CC-START-STATE-002",
                "Reopening Codex through Code-Codex",
                "Codex could not be reopened automatically",
                reason,
                "Close Codex manually and try again. To revoke automatic restart permission, run code-codex reset-startup-recovery.",
            ),
            Self::Launch(error) => {
                let (code, stage, summary) = launch_diagnostic(error);
                StartupDiagnostic::new(
                    code,
                    stage,
                    summary,
                    error.to_string(),
                    "Include the diagnostic report when reporting this Codex startup failure.",
                )
            }
            Self::InvalidLaunchArgument => StartupDiagnostic::new(
                "CC-START-SECURITY-001",
                "Validating startup options",
                "A restricted startup option was rejected",
                reason,
                "Remove custom debugging or inspection arguments and try again.",
            ),
            Self::UnverifiedAttach => StartupDiagnostic::new(
                "CC-START-SECURITY-002",
                "Verifying the running Codex instance",
                "The running Codex listener could not be verified",
                reason,
                "Start the official Codex Desktop app through the Code-Codex shortcut.",
            ),
            Self::AttachMetadataMismatch => StartupDiagnostic::new(
                "CC-START-SECURITY-003",
                "Checking the running Codex instance",
                "The Codex installation metadata does not match",
                reason,
                "Start the official Codex Desktop app through the Code-Codex shortcut.",
            ),
        }
    }
}

pub(super) fn workspace_diagnostic(error: &WorkspaceError) -> (&'static str, &'static str) {
    match error {
        WorkspaceError::InvalidPath => (
            "CC-START-WORKSPACE-004",
            "Check the project folder path and try again.",
        ),
        WorkspaceError::OutsideWorkspace => (
            "CC-START-WORKSPACE-005",
            "Select a folder inside the active project.",
        ),
        WorkspaceError::NotFound => (
            "CC-START-WORKSPACE-006",
            "Check whether the project folder was moved or deleted.",
        ),
        WorkspaceError::AccessDenied => (
            "CC-START-WORKSPACE-007",
            "Check that this Windows account can access the project folder.",
        ),
        WorkspaceError::NotDirectory => (
            "CC-START-WORKSPACE-008",
            "Select a project directory rather than a file.",
        ),
        WorkspaceError::TooManyEntries => {
            ("CC-START-WORKSPACE-009", "Choose a smaller project folder.")
        }
        WorkspaceError::ContentTooLarge => ("CC-START-WORKSPACE-010", "Choose a smaller file."),
        WorkspaceError::EntryConflict => (
            "CC-START-WORKSPACE-011",
            "Reload the project and retry the change.",
        ),
        WorkspaceError::Conflict => (
            "CC-START-WORKSPACE-012",
            "Reload the file because it changed on disk.",
        ),
        WorkspaceError::NotEditable => {
            ("CC-START-WORKSPACE-013", "Open a supported editable file.")
        }
        WorkspaceError::InvalidSettings => (
            "CC-START-WORKSPACE-014",
            "Reset the invalid project setting and retry.",
        ),
        WorkspaceError::Internal => (
            "CC-START-WORKSPACE-003",
            "Include the diagnostic report when reporting this workspace failure.",
        ),
    }
}

pub(super) fn cdp_diagnostic(
    error: &CdpError,
) -> (&'static str, &'static str, &'static str, &'static str) {
    match error.kind() {
        CdpError::QualificationTimeout => (
            "CC-START-CDP-015",
            "Revalidating the renderer after navigation",
            "The renderer did not answer its qualification probe within three seconds",
            "Inspect the last navigation and execution-context events. Native requests remain blocked until the current document is verified; no write request is replayed.",
        ),
        CdpError::Context { .. } => unreachable!("kind unwraps context"),
        CdpError::InvalidEndpoint => (
            "CC-START-CDP-006",
            "Reading the Codex debugging endpoint",
            "The debugging endpoint returned invalid data",
            "Restart Codex Desktop through Code-Codex and include the diagnostic report if it repeats.",
        ),
        CdpError::UnsupportedProtocol => (
            "CC-START-CDP-005",
            "Checking the debugging protocol",
            "The Codex debugging protocol is unsupported",
            "Update Code-Codex or use a supported Codex Desktop version.",
        ),
        CdpError::TooManyTargets => (
            "CC-START-CDP-007",
            "Listing Codex windows",
            "The debugging endpoint reported too many targets",
            "Close extra Codex windows and restart Code-Codex.",
        ),
        CdpError::InvalidWebSocketEndpoint => (
            "CC-START-CDP-009",
            "Checking the Codex window connection",
            "The renderer WebSocket endpoint was rejected",
            "Include the diagnostic report so the endpoint format can be checked.",
        ),
        CdpError::EndpointIdentityMismatch => (
            "CC-START-CDP-010",
            "Verifying the debugging listener",
            "The debugging listener identity changed or could not be verified",
            "Close Codex Desktop completely and start it through the Code-Codex shortcut.",
        ),
        CdpError::WebSocket => (
            "CC-START-CDP-011",
            "Connecting to the Codex renderer",
            "The renderer WebSocket connection failed",
            "Restart Codex Desktop and include the diagnostic report if the connection fails again.",
        ),
        CdpError::Protocol => (
            "CC-START-CDP-012",
            "Communicating with the Codex renderer",
            "The renderer returned invalid protocol data",
            "Update Code-Codex and include the diagnostic report if it repeats.",
        ),
        CdpError::EndpointUnavailable => (
            "CC-START-CDP-001",
            "Connecting to Codex Desktop",
            "The Codex debugging endpoint was unavailable",
            "Restart Codex Desktop through Code-Codex.",
        ),
        CdpError::NoCompatibleTarget => (
            "CC-START-CDP-002",
            "Finding the Codex window",
            "No Codex renderer target was found",
            "Include the diagnostic report when reporting the missing target.",
        ),
        CdpError::AmbiguousRenderer => (
            "CC-START-CDP-003",
            "Selecting the Codex window",
            "More than one compatible Codex window was detected",
            "Close extra Codex windows and try again.",
        ),
        CdpError::IncompatibleRenderer => (
            "CC-START-CDP-008",
            "Checking the Codex window layout",
            "The Codex renderer layout is incompatible",
            "Update Code-Codex.",
        ),
    }
}

pub(super) fn process_diagnostic(error: &ProcessGuardError) -> (&'static str, &'static str) {
    match error.kind() {
        ProcessGuardError::Context { .. } => unreachable!("kind unwraps context"),
        ProcessGuardError::PortUnavailable => (
            "CC-START-PROCESS-001",
            "A local debugging port could not be reserved",
        ),
        ProcessGuardError::OwnershipUnknown => (
            "CC-START-PROCESS-002",
            "The listener process could not be inspected",
        ),
        ProcessGuardError::ProcessInspectionUnknown => (
            "CC-START-PROCESS-011",
            "The existing Codex process state could not be inspected",
        ),
        ProcessGuardError::OwnershipMismatch => (
            "CC-START-PROCESS-007",
            "The listener does not belong to the launched Codex process",
        ),
        ProcessGuardError::ExecutableMismatch => (
            "CC-START-PROCESS-009",
            "The listener does not belong to the verified Codex executable",
        ),
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("activated PID or creation time mismatch")
                || detail.starts_with("activation returned PID") =>
        {
            (
                "CC-START-PROCESS-003",
                "The activated Codex PID or creation time did not match",
            )
        }
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("activated executable mismatch")
                || detail.starts_with("canonical executable mismatch") =>
        {
            (
                "CC-START-PROCESS-004",
                "The activated Codex executable did not match",
            )
        }
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("official executable")
                || detail.starts_with("canonical official executable")
                || detail.starts_with("observed executable canonicalization") =>
        {
            (
                "CC-START-PROCESS-010",
                "The official Codex executable path could not be verified",
            )
        }
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("process identity query")
                || detail.starts_with("process identity response")
                || detail.starts_with("trusted System32 PowerShell") =>
        {
            (
                "CC-START-PROCESS-005",
                "The activated Codex process could not be inspected",
            )
        }
        ProcessGuardError::Detailed(detail) if detail.starts_with("existing process query") => (
            "CC-START-PROCESS-011",
            "The existing Codex process state could not be inspected",
        ),
        ProcessGuardError::Detailed(detail) if detail.starts_with("listener discovery query") => (
            "CC-START-PROCESS-012",
            "The existing Codex debugging port could not be discovered",
        ),
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("listener ownership query")
                || detail.starts_with("listener ownership response") =>
        {
            (
                "CC-START-PROCESS-006",
                "The debugging listener owner could not be inspected",
            )
        }
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("listener executable query")
                || detail.starts_with("listener executable response") =>
        {
            (
                "CC-START-PROCESS-008",
                "The listener executable could not be inspected",
            )
        }
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("the CDP listener is not owned by the launched") =>
        {
            (
                "CC-START-PROCESS-007",
                "The listener does not belong to the launched Codex process",
            )
        }
        ProcessGuardError::Detailed(detail)
            if detail.starts_with("the CDP listener is not owned by the verified") =>
        {
            (
                "CC-START-PROCESS-009",
                "The listener does not belong to the verified Codex executable",
            )
        }
        ProcessGuardError::Detailed(_) => (
            "CC-START-PROCESS-002",
            "The Codex process identity could not be verified",
        ),
    }
}

pub(super) fn launch_diagnostic(
    error: &LaunchFailure,
) -> (&'static str, &'static str, &'static str) {
    match error {
        LaunchFailure::MissingPackageIdentity => (
            "CC-START-CODEX-001",
            "Reading Codex registration",
            "The Codex package identity is missing",
        ),
        LaunchFailure::MissingApplicationId => (
            "CC-START-CODEX-002",
            "Reading Codex registration",
            "The Codex application ID is missing",
        ),
        LaunchFailure::PackageSupervision => (
            "CC-START-CODEX-004",
            "Supervising Codex Desktop",
            "The activated Codex process could not be supervised",
        ),
        LaunchFailure::DirectSpawn { .. } => (
            "CC-START-CODEX-005",
            "Starting Codex Desktop",
            "The Codex executable could not be started",
        ),
        LaunchFailure::ProcessWait { .. } => (
            "CC-START-CODEX-006",
            "Monitoring Codex Desktop",
            "The Codex process could not be monitored",
        ),
        LaunchFailure::ProcessExited { .. } => (
            "CC-START-CODEX-008",
            "Monitoring Codex Desktop",
            "The activated Codex process exited with a nonzero status",
        ),
        LaunchFailure::DiagnosticSerialization => (
            "CC-START-CODEX-007",
            "Preparing diagnostics",
            "The installation diagnostic result could not be serialized",
        ),
    }
}

pub(super) async fn live_launch_snapshot(
    endpoint: CdpEndpoint,
    inspector_port: Option<u16>,
    launched_pid: u32,
) -> String {
    let mut lines = vec![format!("Process: {}", launched_process_state(launched_pid))];
    let tcp = tokio::time::timeout(
        Duration::from_millis(700),
        TcpStream::connect(("127.0.0.1", endpoint.port())),
    )
    .await;
    lines.push(match tcp {
        Ok(Ok(_)) => "TCP: loopback connection accepted".to_owned(),
        Ok(Err(error)) => format!("TCP: connection failed ({error})"),
        Err(_) => "TCP: timed out after 700 ms".to_owned(),
    });
    if let Some(inspector_port) = inspector_port {
        lines.push(main_listener_evidence(inspector_port).await);
        let inspector = tokio::time::timeout(
            Duration::from_millis(700),
            TcpStream::connect(("127.0.0.1", inspector_port)),
        )
        .await;
        lines.push(match inspector {
            Ok(Ok(_)) => "Main inspector TCP: connection accepted".to_owned(),
            Ok(Err(error)) => format!("Main inspector TCP: connection failed ({error})"),
            Err(_) => "Main inspector TCP: timed out after 700 ms".to_owned(),
        });
    }
    let Ok(discovery) = TargetDiscovery::new() else {
        lines.push("CDP: diagnostic client could not be initialized".to_owned());
        return lines.join("\n");
    };
    lines.push(match discovery.version_detailed(endpoint).await {
        Ok(version) => format!(
            "GET /json/version: responded; protocol_supported={}",
            version.is_supported()
        ),
        Err(error) => format!("GET /json/version: failed ({error})"),
    });
    let verified = startup_trace()
        .lock()
        .is_ok_and(|trace| trace.listener_verified);
    if verified {
        lines.push(
            match tokio::time::timeout(
                Duration::from_secs(8),
                target_discovery_snapshot(endpoint, Some(launched_pid)),
            )
            .await
            {
                Ok(details) => details,
                Err(_) => "GET /json/list and layout probes: timed out after 8 seconds".to_owned(),
            },
        );
    } else {
        lines.push(
            "Target and layout probes: skipped because listener ownership was not verified"
                .to_owned(),
        );
    }
    lines.join("\n")
}

pub(super) async fn target_discovery_snapshot(
    endpoint: CdpEndpoint,
    launched_pid: Option<u32>,
) -> String {
    let pid_label = launched_pid.map_or("attached process".to_owned(), |pid| format!("PID {pid}"));
    let Ok(discovery) = TargetDiscovery::new() else {
        return format!("Codex {pid_label}; CDP target discovery could not be initialized");
    };
    match discovery.targets(endpoint).await {
        Ok(targets) => {
            let filter = TargetFilter::default();
            let page_count = targets
                .iter()
                .filter(|target| target.target_type == "page")
                .count();
            let mut pages = Vec::new();
            for (index, target) in targets
                .iter()
                .filter(|target| target.target_type == "page")
                .take(8)
                .enumerate()
            {
                let accepted = filter.accepts(target);
                let mut page = format!(
                    "Page {}: location={}; query_present={}; title_contains_Codex={}; websocket_present={}; filter_accepted={}",
                    index + 1,
                    safe_target_location(&target.url),
                    Url::parse(&target.url).is_ok_and(|url| url.query().is_some()),
                    target.title.contains("Codex"),
                    !target.web_socket_debugger_url.is_empty(),
                    accepted,
                );
                if !accepted {
                    let filter_reason = if target.web_socket_debugger_url.is_empty() {
                        "no renderer WebSocket"
                    } else if target.url.starts_with("app://-/") {
                        "noncanonical app URL without Codex title"
                    } else {
                        "URL is outside accepted Codex app pages"
                    };
                    page.push_str(&format!("; filter_reason={filter_reason}"));
                }
                if accepted {
                    let probe = discovery
                        .renderer_layout_diagnostics(endpoint, target)
                        .await;
                    page.push_str(&format!(
                        "; layout={}",
                        match probe {
                            Ok(values) => safe_layout_summary(&values),
                            Err(error) => format!("probe unavailable ({error})"),
                        }
                    ));
                } else {
                    page.push_str("; layout=not probed because target filter rejected page");
                }
                pages.push(page);
            }
            format!(
                "Codex process: {pid_label}\nCDP port: {}\nTargets: {} total, {} pages\nCandidate details (titles, URL queries and page text omitted; at most 8 pages):\n{}",
                endpoint.port(),
                targets.len(),
                page_count,
                if pages.is_empty() {
                    "none".to_owned()
                } else {
                    pages.join("\n")
                },
            )
        }
        Err(error) => format!(
            "Codex process: {pid_label}\nCDP port: {}\nThe endpoint became unavailable while collecting target locations: {error}",
            endpoint.port(),
        ),
    }
}

pub(super) fn safe_layout_summary(value: &Value) -> String {
    const BOOLEAN_FIELDS: &[&str] = &[
        "topFrame",
        "appOrigin",
        "legacyShellMatch",
        "workspaceRowPresent",
        "mainContentClip",
        "railBeforeWorkspace",
        "workspaceContainsMain",
        "nativeFeaturePage",
        "nativeLoginPage",
        "accepted",
    ];
    const COUNT_FIELDS: &[&str] = &[
        "mainCount",
        "totalMainCount",
        "inactiveMainCount",
        "activePageCount",
        "sidebarTriggerCount",
        "rowMainCount",
        "directRailCount",
        "workspaceCount",
        "unifiedTabStripCount",
    ];
    let mut fields = Vec::new();
    for name in BOOLEAN_FIELDS {
        fields.push(format!(
            "{name}={}",
            value
                .get(name)
                .and_then(Value::as_bool)
                .map_or("unknown", |flag| if flag { "true" } else { "false" })
        ));
    }
    for name in COUNT_FIELDS {
        fields.push(format!(
            "{name}={}",
            value
                .get(name)
                .and_then(Value::as_u64)
                .map_or_else(|| "unknown".to_owned(), |count| count.to_string())
        ));
    }
    let state = match value.get("readyState").and_then(Value::as_str) {
        Some("loading") => "loading",
        Some("interactive") => "interactive",
        Some("complete") => "complete",
        _ => "unknown",
    };
    fields.push(format!("readyState={state}"));
    let mut report = fields.join(", ");
    const RULES: &[&str] = &[
        "top_frame",
        "app_origin",
        "unique_main",
        "sidebar_trigger_present",
        "legacy_shell_or_workspace_row",
        "row_unique_main",
        "main_content_clip",
        "one_direct_rail",
        "one_main_owner_child",
        "rail_before_main_owner",
        "owner_unique_main",
    ];
    if let Some(checks) = value.get("checks").and_then(Value::as_array) {
        let failed = checks
            .iter()
            .filter_map(|check| {
                let name = check.get("name").and_then(Value::as_str)?;
                if RULES.contains(&name)
                    && safe_layout_scalar(check.get("expected"))
                        != safe_layout_scalar(check.get("actual"))
                {
                    Some(name)
                } else {
                    None
                }
            })
            .take(RULES.len())
            .collect::<Vec<_>>();
        report.push_str(&format!(
            "\n  Failed rules: {}",
            if failed.is_empty() {
                "none".to_owned()
            } else {
                failed.join(", ")
            }
        ));
        report.push_str("\n  Qualification rules (expected -> actual):");
        for check in checks.iter().take(RULES.len()) {
            let Some(name) = check.get("name").and_then(Value::as_str) else {
                continue;
            };
            if !RULES.contains(&name) {
                continue;
            }
            let expected = safe_layout_scalar(check.get("expected"));
            let actual = safe_layout_scalar(check.get("actual"));
            report.push_str(&format!(
                "\n    {name}: {expected} -> {actual} [{}]",
                if expected == actual { "pass" } else { "FAIL" }
            ));
        }
    }
    let row_count = value
        .get("rowChildCount")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    report.push_str(&format!("\n  Row direct children: {row_count}"));
    if let Some(children) = value.get("rowChildren").and_then(Value::as_array) {
        for child in children.iter().take(8) {
            let index = child.get("index").and_then(Value::as_u64).unwrap_or(0);
            let tag = safe_layout_tag(child.get("tag"));
            let count = child.get("childCount").and_then(Value::as_u64).unwrap_or(0);
            report.push_str(&format!(
                "\n    child {index}: tag={tag}, children={count}, containsMain={}, directRail={}, workspaceClass={}, unifiedTabAttribute={}",
                safe_layout_scalar(child.get("containsMain")),
                safe_layout_scalar(child.get("directRail")),
                safe_layout_scalar(child.get("workspaceClass")),
                safe_layout_scalar(child.get("unifiedTabAttribute")),
            ));
        }
    }
    if let Some(ancestors) = value.get("mainAncestors").and_then(Value::as_array) {
        report.push_str("\n  Main-to-row ancestry (bounded, no text or class names):");
        for ancestor in ancestors.iter().take(8) {
            let depth = ancestor.get("depth").and_then(Value::as_u64).unwrap_or(0);
            let tag = safe_layout_tag(ancestor.get("tag"));
            let count = ancestor
                .get("childCount")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            report.push_str(&format!(
                "\n    depth {depth}: tag={tag}, children={count}, workspaceRow={}, directRowChild={}, mainClip={}, workspaceClass={}",
                safe_layout_scalar(ancestor.get("workspaceRow")),
                safe_layout_scalar(ancestor.get("directRowChild")),
                safe_layout_scalar(ancestor.get("mainClip")),
                safe_layout_scalar(ancestor.get("workspaceClass")),
            ));
        }
    }
    if let Some(explorer) = value.get("explorer") {
        let count = explorer.get("count").and_then(Value::as_u64).unwrap_or(0);
        let placement = match explorer.get("placement").and_then(Value::as_str) {
            Some("inline") => "inline",
            Some("drawer") => "drawer",
            _ => "unknown",
        };
        let display = match explorer.get("display").and_then(Value::as_str) {
            Some("none") => "none",
            Some("shown") => "shown",
            _ => "unknown",
        };
        let visibility = match explorer.get("visibility").and_then(Value::as_str) {
            Some("hidden") => "hidden",
            Some("visible") => "visible",
            _ => "unknown",
        };
        report.push_str(&format!(
            "\n  Explorer mount: count={count}, placement={placement}, display={display}, visibility={visibility}"
        ));
    }
    report
}

pub(super) fn safe_layout_scalar(value: Option<&Value>) -> String {
    match value {
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value
            .as_u64()
            .filter(|number| *number <= 10_000)
            .map_or("unknown".to_owned(), |number| number.to_string()),
        _ => "unknown".to_owned(),
    }
}

pub(super) fn safe_layout_tag(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("DIV") => "DIV",
        Some("ASIDE") => "ASIDE",
        Some("MAIN") => "MAIN",
        Some("SECTION") => "SECTION",
        Some("ARTICLE") => "ARTICLE",
        Some("HEADER") => "HEADER",
        Some("NAV") => "NAV",
        _ => "OTHER",
    }
}

pub(super) fn safe_target_location(raw: &str) -> String {
    let Ok(url) = Url::parse(raw) else {
        return "invalid URL".to_owned();
    };
    if url.scheme() == "app" && url.host_str() == Some("-") {
        return format!("app://-{}", url.path());
    }
    format!("{}: (non-app target)", url.scheme())
}

pub(super) async fn diagnose(args: DiagnoseArgs) -> Result<(), AppError> {
    if args.full {
        let checks = tokio::time::timeout(Duration::from_secs(14), support_checks::run()).await;
        let report = match checks {
            Ok(value) => value,
            Err(_) => {
                json!({"status":"timeout","budgetMs":14000,"partialResults":"Recorded support-check events remain in runtime logs","readOnly":true})
            }
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&report)
                .map_err(|_| LaunchFailure::DiagnosticSerialization)?
        );
        return Ok(());
    }
    let installation = discover_codex(args.codex_exe.as_deref(), None, args.channel);
    let codex = match &installation {
        Ok(installation) => redacted_codex_diagnostic(installation),
        Err(error) => json!({ "status": "unavailable", "reason": error.to_string() }),
    };
    let app_server =
        match discover_app_server_source(args.app_server.as_deref(), installation.as_ref().ok()) {
            Ok(source) => json!({
                "status": "available",
                "packaged": source.kind() == AppServerSourceKind::PackagedOfficial
            }),
            Err(error) => json!({ "status": "unavailable", "reason": error.to_string() }),
        };
    let ui_bundle = match resolve_bundle(args.ui_bundle.as_deref()) {
        Ok(bootstrap::BundleSource::Embedded) => {
            json!({ "status": "available", "source": "embedded" })
        }
        Ok(bootstrap::BundleSource::DevelopmentOverride(_)) => {
            json!({ "status": "available", "source": "developmentOverride" })
        }
        Err(error) => json!({ "status": "unavailable", "reason": error.to_string() }),
    };
    let cdp = if let Some(port) = args.port {
        diagnose_cdp(CdpEndpoint::loopback(port)).await
    } else {
        json!({ "status": "notRequested" })
    };
    let report = DiagnosticReport {
        codex,
        app_server,
        ui_bundle,
        cdp,
    };
    let output = serde_json::to_string_pretty(&report)
        .map_err(|_| LaunchFailure::DiagnosticSerialization)?;
    println!("{output}");
    Ok(())
}

pub(super) fn redacted_codex_diagnostic(installation: &CodexInstallation) -> Value {
    let source = match installation.source {
        DiscoverySource::Explicit => "explicit",
        DiscoverySource::WindowsPackageManager => "windowsPackageManager",
        DiscoverySource::UserInstall => "userInstall",
        DiscoverySource::Path => "path",
        DiscoverySource::MacOsApplication => "macOsApplication",
    };
    json!({
        "status": "available",
        "version": installation.version,
        "channel": installation.channel,
        "source": source,
        "officialPackage": matches!(installation.source, DiscoverySource::WindowsPackageManager | DiscoverySource::MacOsApplication),
        "packageName": installation.package_name,
        "packagedAppServer": installation.app_server.is_some()
    })
}

pub(super) async fn diagnose_cdp(endpoint: CdpEndpoint) -> Value {
    let Ok(discovery) = TargetDiscovery::new() else {
        return json!({ "status": "invalid" });
    };
    let version = discovery.version(endpoint).await;
    let targets = discovery.targets(endpoint).await;
    match (version, targets) {
        (Ok(version), Ok(targets)) => json!({
            "status": "available",
            "browser": version.browser,
            "protocolVersion": version.protocol_version,
            "targetCount": targets.len(),
            "pageTargetCount": targets.iter()
                .filter(|target| target.target_type == "page")
                .count()
        }),
        _ => json!({ "status": "unavailable" }),
    }
}
