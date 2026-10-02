mod bootstrap;
mod bridge;
mod discovery;
mod early_startup;
mod exit_codes;
#[allow(dead_code)]
mod gui_support;
mod process_guard;
mod runtime_log;
mod startup_diagnostics;

use std::path::PathBuf;
use std::process::{ExitCode, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bootstrap::{BootstrapError, build_bootstrap, resolve_bundle};
use bridge::NativeBridge;
use cdp_client::{
    CapabilityToken, CdpEndpoint, CdpError, CdpSupervisor, IdlePolicy, InjectionConfig,
    PRIMARY_BINDING_NAME, PRIMARY_RECEIVER_NAME, SupervisorOptions, SupervisorProgress,
    TargetDiscovery, TargetFilter,
};
use clap::{Args, Parser, Subcommand, ValueEnum};
use context_resolver::{AppServerClient, AppServerCommand, ResolverError};
use discovery::{
    AppServerSourceKind, ChannelPreference, CodexInstallation, DiscoveryError, DiscoverySource,
    discover_app_server_source, discover_codex, is_supported_version, prepare_app_server_launch,
};
use futures_util::{SinkExt, StreamExt};
use process_guard::{
    CodexProcessGuard, PortReservation, ProcessGuardError, discover_listener_port,
    is_executable_running, launched_process_state, verify_listener_executable,
    verify_listener_owner, verify_process_identity,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use startup_diagnostics::StartupDiagnostic;
use thiserror::Error;
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async_with_config};
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;
use url::Url;
use workspace_service::{SettingsStore, Workspace, WorkspaceError};

#[derive(Default)]
struct StartupTrace {
    started: Option<Instant>,
    events: Vec<String>,
    renderer_port: Option<u16>,
    inspector_port: Option<u16>,
    launched_pid: Option<u32>,
    listener_verified: bool,
    precleanup_probe: Option<String>,
    supervisor_progress: Option<Arc<SupervisorProgress>>,
}

static STARTUP_TRACE: OnceLock<Mutex<StartupTrace>> = OnceLock::new();

fn startup_trace() -> &'static Mutex<StartupTrace> {
    STARTUP_TRACE.get_or_init(|| Mutex::new(StartupTrace::default()))
}

fn begin_startup_trace(mode: &'static str) {
    if let Ok(mut trace) = startup_trace().lock() {
        *trace = StartupTrace {
            started: Some(Instant::now()),
            events: vec![format!("+0 ms | entry | mode={mode}")],
            ..StartupTrace::default()
        };
    }
}

fn record_startup_event(stage: &'static str, outcome: &'static str) {
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

fn record_launch_context(renderer_port: u16, inspector_port: Option<u16>, pid: u32) {
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

fn record_renderer_port(port: u16) {
    if let Ok(mut trace) = startup_trace().lock() {
        trace.renderer_port = Some(port);
    }
}

fn record_precleanup_probe(probe: String) {
    if let Ok(mut trace) = startup_trace().lock() {
        trace.precleanup_probe = Some(probe);
    }
}

fn record_listener_verified() {
    if let Ok(mut trace) = startup_trace().lock() {
        trace.listener_verified = true;
    }
}

fn record_supervisor_progress(progress: Arc<SupervisorProgress>) {
    let observed = progress.clone();
    tokio::spawn(async move {
        let mut previous = String::new();
        loop {
            let state = observed.snapshot();
            let summary = json!({"phase":state.last_phase,"sessionsStarted":state.sessions_started,"sessionsEnded":state.sessions_ended,"layoutRejections":state.layout_rejections,"layoutMatches":state.layout_probe_matches,"bootstrapAttempts":state.bootstrap_attempts,"bootstrapFailures":state.bootstrap_failures,"targets":state.last_target_count,"matches":state.last_filter_match_count,"documentState":state.last_ready_state,"listError":state.last_list_error,"sessionError":state.last_session_error});
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

fn startup_trace_report() -> String {
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
    }
    report
}

fn enrich_startup_diagnostic(error: &AppError) -> StartupDiagnostic {
    let mut diagnostic = error.startup_diagnostic();
    diagnostic.reason.push_str(&startup_trace_report());
    diagnostic
}

async fn complete_startup_failure_probe() {
    let (port, verified, already_captured) = match startup_trace().lock() {
        Ok(trace) => (
            trace.renderer_port,
            trace.listener_verified,
            trace.precleanup_probe.is_some(),
        ),
        Err(_) => return,
    };
    if already_captured {
        return;
    }
    let Some(port) = port else { return };
    let endpoint = CdpEndpoint::loopback(port);
    let tcp = tokio::time::timeout(
        Duration::from_millis(700),
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await;
    let mut observations = vec![match tcp {
        Ok(Ok(_)) => "TCP: loopback connection accepted".to_owned(),
        Ok(Err(error)) => format!("TCP: connection failed ({error})"),
        Err(_) => "TCP: timed out after 700 ms".to_owned(),
    }];
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

#[derive(Debug, Parser)]
#[command(
    name = "code-codex",
    version,
    about = "Live project tree and bounded file editor for Codex Desktop"
)]
struct Cli {
    #[arg(long, value_enum, default_value_t = LogFormat::Text, global = true)]
    log_format: LogFormat,
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum LogFormat {
    Text,
    Json,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Discover and launch the official Codex Desktop application.
    Run(RunArgs),
    /// Attach to a user-authorized, already-running loopback CDP endpoint.
    Attach(AttachArgs),
    /// Activate this installed version inside an already-running Code-Codex session.
    Activate(ActivateArgs),
    /// Report package, bundle, App Server, and optional CDP diagnostics.
    Diagnose(DiagnoseArgs),
}

#[derive(Debug, Args)]
struct CommonArgs {
    /// Development-only fixed workspace. The renderer can never change it.
    #[arg(long, value_name = "DIRECTORY")]
    workspace: Option<PathBuf>,
    /// Development-only UI bundle override (defaults to the embedded production bundle).
    #[arg(long, value_name = "FILE")]
    ui_bundle: Option<PathBuf>,
    /// Codex CLI executable used for `app-server --listen stdio://`.
    #[arg(long, value_name = "FILE")]
    app_server: Option<PathBuf>,
}

#[derive(Debug, Args)]
struct RunArgs {
    #[command(flatten)]
    common: CommonArgs,
    /// Explicit Codex Desktop executable instead of package discovery.
    #[arg(long, value_name = "FILE")]
    codex_exe: Option<PathBuf>,
    /// Version associated with an explicit executable.
    #[arg(long, requires = "codex_exe")]
    codex_version: Option<String>,
    /// Codex channel to launch.
    #[arg(long, value_enum, default_value_t = ChannelPreference::Stable)]
    channel: ChannelPreference,
    /// Additional non-CDP arguments passed to Codex Desktop.
    #[arg(long = "codex-arg", allow_hyphen_values = true)]
    codex_args: Vec<String>,
    /// Development override. The UI still receives compatible=false.
    #[arg(long)]
    allow_unsupported_version: bool,
}

#[derive(Debug, Args)]
struct AttachArgs {
    #[command(flatten)]
    common: CommonArgs,
    #[arg(long)]
    port: u16,
    #[arg(long, default_value = "unknown")]
    codex_version: String,
    #[arg(long, default_value = "attached")]
    channel: String,
    #[arg(long)]
    allow_unsupported_version: bool,
    /// Diagnostics only; URL/title filtering is relaxed, but DOM qualification remains mandatory.
    #[arg(long)]
    allow_any_page: bool,
}

#[derive(Debug, Args)]
struct ActivateArgs {
    #[command(flatten)]
    common: CommonArgs,
    #[arg(long, value_enum, default_value_t = ChannelPreference::Any)]
    channel: ChannelPreference,
}

#[derive(Debug, Args)]
struct DiagnoseArgs {
    #[arg(long, value_enum, default_value_t = ChannelPreference::Any)]
    channel: ChannelPreference,
    #[arg(long)]
    codex_exe: Option<PathBuf>,
    #[arg(long)]
    app_server: Option<PathBuf>,
    #[arg(long)]
    ui_bundle: Option<PathBuf>,
    #[arg(long)]
    port: Option<u16>,
}

#[derive(Debug, Error)]
enum AppError {
    #[error(transparent)]
    Discovery(#[from] DiscoveryError),
    #[error(transparent)]
    Bootstrap(#[from] BootstrapError),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error(transparent)]
    Resolver(#[from] ResolverError),
    #[error(transparent)]
    Cdp(#[from] CdpError),
    #[error("Codex debugging endpoint did not become available: {0}")]
    CdpStartup(String),
    #[error("no compatible Codex renderer target was found: {0}")]
    CdpTarget(String),
    #[error(transparent)]
    ProcessGuard(#[from] ProcessGuardError),
    #[error("this Codex Desktop version is not in the compatibility matrix")]
    UnsupportedVersion,
    #[error(transparent)]
    Launch(#[from] LaunchFailure),
    #[error(
        "Codex Desktop is already running without this launcher; close it and start Code-Codex again"
    )]
    AlreadyRunning,
    #[error("a security-sensitive Codex launch argument was rejected")]
    InvalidLaunchArgument,
    #[error("attach requires a listener owned by an official packaged Codex installation")]
    UnverifiedAttach,
    #[error("attach metadata does not match the verified Codex installation")]
    AttachMetadataMismatch,
}

#[derive(Debug, Error)]
enum LaunchFailure {
    #[error("the registered Codex package is missing its full identity")]
    MissingPackageIdentity,
    #[error("the registered Codex package is missing its application ID")]
    MissingApplicationId,
    #[error("Windows package activation failed: OS error {os_code:?}, kind {kind:?}")]
    PackageActivation {
        os_code: Option<i32>,
        kind: std::io::ErrorKind,
    },
    #[error("the activated package could not be supervised")]
    PackageSupervision,
    #[error("the Codex executable could not be started: OS error {os_code:?}, kind {kind:?}")]
    DirectSpawn {
        os_code: Option<i32>,
        kind: std::io::ErrorKind,
    },
    #[error("the Codex process could not be monitored: OS error {os_code:?}, kind {kind:?}")]
    ProcessWait {
        os_code: Option<i32>,
        kind: std::io::ErrorKind,
    },
    #[error("the installation diagnostic result could not be serialized")]
    DiagnosticSerialization,
}

impl AppError {
    const fn exit_code(&self) -> u8 {
        match self {
            Self::UnsupportedVersion => exit_codes::UNSUPPORTED_VERSION,
            Self::AlreadyRunning => exit_codes::ALREADY_RUNNING,
            Self::Discovery(_)
            | Self::Bootstrap(_)
            | Self::Workspace(_)
            | Self::Resolver(_)
            | Self::Launch(_) => exit_codes::STARTUP_FAILURE,
            Self::Cdp(_)
            | Self::CdpStartup(_)
            | Self::CdpTarget(_)
            | Self::ProcessGuard(_)
            | Self::InvalidLaunchArgument
            | Self::UnverifiedAttach
            | Self::AttachMetadataMismatch => exit_codes::GENERIC_FAILURE,
        }
    }

    fn startup_diagnostic(&self) -> StartupDiagnostic {
        use bootstrap::BootstrapError;
        use cdp_client::CdpError;
        use context_resolver::ResolverError;
        use discovery::DiscoveryError;
        use process_guard::ProcessGuardError;

        let reason = self.to_string();
        match self {
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
                "The Codex installation could not be verified",
                reason,
                "Repair or reinstall the official Codex Desktop app.",
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

fn workspace_diagnostic(error: &WorkspaceError) -> (&'static str, &'static str) {
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

fn cdp_diagnostic(error: &CdpError) -> (&'static str, &'static str, &'static str, &'static str) {
    match error {
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

fn process_diagnostic(error: &ProcessGuardError) -> (&'static str, &'static str) {
    match error {
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

fn launch_diagnostic(error: &LaunchFailure) -> (&'static str, &'static str, &'static str) {
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
        LaunchFailure::PackageActivation { .. } => (
            "CC-START-CODEX-003",
            "Activating Codex Desktop",
            "Windows could not activate the Codex package",
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
        LaunchFailure::DiagnosticSerialization => (
            "CC-START-CODEX-007",
            "Preparing diagnostics",
            "The installation diagnostic result could not be serialized",
        ),
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    initialize_logging(cli.log_format);
    let command = cli
        .command
        .unwrap_or_else(|| Commands::Run(default_run_args()));
    let mode = match &command {
        Commands::Run(_) => "run",
        Commands::Attach(_) => "attach",
        Commands::Activate(_) => "activate",
        Commands::Diagnose(_) => "diagnose",
    };
    if mode != "diagnose" {
        runtime_log::begin(mode);
    }
    begin_startup_trace(mode);
    let result = match command {
        Commands::Run(args) => run(args).await,
        Commands::Attach(args) => attach(args).await,
        Commands::Activate(args) => activate(args).await,
        Commands::Diagnose(args) => diagnose(args).await,
    };
    match result {
        Ok(()) => {
            runtime_log::record("launcher", "session", "finished", json!({}));
            runtime_log::flush();
            ExitCode::SUCCESS
        }
        Err(error) => {
            tracing::error!(event = "launcher_failed", error = %error);
            record_startup_event("exit", "startup failed");
            complete_startup_failure_probe().await;
            let diagnostic = enrich_startup_diagnostic(&error);
            runtime_log::record(
                "launcher",
                "startup diagnostic",
                "failed",
                json!({"supportCode":diagnostic.code,"report":diagnostic.reason}),
            );
            runtime_log::flush();
            if let Some(line) = diagnostic.encoded_line() {
                eprintln!("{line}");
            }
            eprintln!("error: {error}");
            ExitCode::from(error.exit_code())
        }
    }
}

fn default_run_args() -> RunArgs {
    RunArgs {
        common: CommonArgs {
            workspace: None,
            ui_bundle: None,
            app_server: None,
        },
        codex_exe: None,
        codex_version: None,
        channel: ChannelPreference::Stable,
        codex_args: Vec::new(),
        allow_unsupported_version: false,
    }
}

fn initialize_logging(format: LogFormat) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    match format {
        LogFormat::Text => {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_target(false)
                .compact()
                .init();
        }
        LogFormat::Json => {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_target(false)
                .json()
                .init();
        }
    }
}

async fn run(args: RunArgs) -> Result<(), AppError> {
    record_startup_event("arguments", "validating launch arguments");
    validate_extra_arguments(&args.codex_args)?;
    record_startup_event("discovery", "finding official Codex installation");
    let installation = discover_codex(
        args.codex_exe.as_deref(),
        args.codex_version.as_deref(),
        args.channel,
    )?;
    record_startup_event("discovery", "official Codex installation found");
    runtime_log::record(
        "launcher",
        "Codex installation",
        "discovered",
        json!({"version":installation.version,"channel":installation.channel,"source":installation.source}),
    );
    let compatible = is_supported_version(&installation.version);
    if !compatible && !args.allow_unsupported_version {
        return Err(AppError::UnsupportedVersion);
    }
    record_startup_event("existing process", "checking for conflicting Codex process");
    if is_executable_running(&installation.executable)? {
        return Err(AppError::AlreadyRunning);
    }
    record_startup_event("existing process", "no conflicting process");

    let startup_enabled = SettingsStore::for_current_user()
        .ok()
        .and_then(|store| store.load().ok())
        .is_some_and(|settings| settings.startup_transition_enabled);
    runtime_log::record(
        "launcher",
        "startup animation preference",
        "loaded",
        json!({"enabled":startup_enabled}),
    );
    record_startup_event("port reservation", "reserving loopback debugging port");
    let reservation = PortReservation::reserve()?;
    let port = reservation.port()?;
    let endpoint = CdpEndpoint::loopback(port);
    record_startup_event("port reservation", "renderer port reserved");
    let main_inspector_reservation = if needs_windows_10_surface_patch() {
        Some(PortReservation::reserve()?)
    } else {
        None
    };
    let main_inspector_port = main_inspector_reservation
        .as_ref()
        .map(PortReservation::port)
        .transpose()?;
    let main_inspector_endpoint = main_inspector_port.map(CdpEndpoint::loopback);
    record_startup_event("launch configuration", "debugging arguments prepared");
    let launch_arguments = build_launch_arguments(port, main_inspector_port, &args.codex_args);
    reservation.release();
    if let Some(reservation) = main_inspector_reservation {
        reservation.release();
    }
    let launched_after = SystemTime::now();
    record_startup_event("Codex activation", "starting official process");
    let mut early_player = None;
    let mut child = if installation.source == DiscoverySource::WindowsPackageManager {
        let package_full_name = installation
            .package_full_name
            .clone()
            .ok_or(LaunchFailure::MissingPackageIdentity)?;
        let app_user_model_id = installation
            .app_user_model_id
            .clone()
            .ok_or(LaunchFailure::MissingApplicationId)?;
        let mut child = CodexProcessGuard::activate_package(
            package_full_name,
            app_user_model_id,
            launch_arguments,
        )
        .await
        .map_err(|error| LaunchFailure::PackageActivation {
            os_code: error.raw_os_error(),
            kind: error.kind(),
        })?;
        let launched_pid = child.pid();
        record_launch_context(port, main_inspector_port, launched_pid);
        if startup_enabled {
            record_startup_event(
                "early startup animation",
                "starting concurrent loading-page supervisor after activation",
            );
            early_player = Some(early_startup::start(endpoint, launched_pid, launched_after));
        }
        record_startup_event("process identity", "checking activated executable");
        let official_executable = installation.executable.clone();
        let identity_result = tokio::task::spawn_blocking(move || {
            verify_process_identity(launched_pid, launched_after, &official_executable)
        })
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if let Err(error) = identity_result {
            record_startup_event("process identity", "verification failed");
            record_precleanup_probe(format!("Process: {}", launched_process_state(launched_pid)));
            child.terminate().await;
            return Err(error.into());
        }
        record_startup_event("process identity", "official executable verified");
        if child.arm_package_termination().await.is_err() {
            record_startup_event("process supervision", "could not arm process guard");
            record_precleanup_probe(format!("Process: {}", launched_process_state(launched_pid)));
            child.terminate().await;
            return Err(LaunchFailure::PackageSupervision.into());
        }
        child
    } else {
        let mut command = Command::new(&installation.executable);
        command
            .args(launch_arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        CodexProcessGuard::spawn(command).map_err(|error| LaunchFailure::DirectSpawn {
            os_code: error.raw_os_error(),
            kind: error.kind(),
        })?
    };
    if startup_enabled && early_player.is_none() {
        early_player = Some(early_startup::start(endpoint, child.pid(), launched_after));
    }
    let launched_pid = child.pid();
    record_launch_context(port, main_inspector_port, launched_pid);
    record_startup_event("Codex activation", "process handle acquired");
    tracing::info!(event = "codex_launched", channel = %installation.channel);

    let result = async {
        if let Some(main_inspector_endpoint) = main_inspector_endpoint {
            record_startup_event("main inspector", "waiting for Windows 10 surface patch");
            initialize_electron_main_process(main_inspector_endpoint, launched_pid, launched_after)
                .await?;
            record_startup_event("main inspector", "surface patch initialized");
            tracing::info!(event = "electron_main_transparency_initialized");
        }
        record_startup_event("CDP version", "waiting for renderer debugging endpoint");
        wait_for_launched_endpoint(endpoint, launched_pid, Duration::from_secs(30)).await?;
        record_startup_event("CDP version", "supported endpoint responded");
        if startup_enabled {
            record_startup_event("early startup animation", "concurrent supervisor continues through App Server preparation and renderer discovery");
        }
        tracing::info!(event = "codex_renderer_ready", resolver_start = "deferred");
        // Start the resolver only after the official desktop has opened its
        // renderer/CDP endpoint.  The packaged resolver is a second Codex App
        // Server process and uses the same CODEX_HOME SQLite database as the
        // desktop.  Starting it before desktop activation can win the startup
        // migration/lock race and make the desktop report "database access is
        // denied" before the file tree is rendered.
        record_startup_event(
            "runtime preparation",
            "preparing UI bundle and App Server bridge",
        );
        let (bridge, injection) = prepare_runtime(
            &args.common,
            Some(&installation),
            &installation.version,
            &installation.channel,
            compatible,
            PRIMARY_BINDING_NAME,
            PRIMARY_RECEIVER_NAME,
            startup_enabled,
        )
        .await?;
        record_startup_event(
            "runtime preparation",
            "UI bundle, bridge and settings prepared",
        );
        record_startup_event("listener ownership", "verifying renderer port owner");
        tokio::task::spawn_blocking(move || {
            verify_listener_owner(port, launched_pid, launched_after)
        })
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
        tracing::info!(event = "cdp_owner_verified");
        record_listener_verified();
        record_startup_event("listener ownership", "verified against launched process");
        if !bridge.bind_verified_window_process(launched_pid) {
            tracing::warn!(event = "codex_window_process_binding_failed");
        }
        let cancellation = CancellationToken::new();
        let supervisor = supervise(
            endpoint,
            bridge,
            injection,
            ListenerIdentity::LaunchedProcess {
                pid: launched_pid,
                launched_after,
            },
            false,
            IdlePolicy::RecoverUntilCancelled,
            cancellation.clone(),
        );
        record_startup_event("renderer discovery", "supervisor started");
        tokio::pin!(supervisor);
        tokio::select! {
            biased;
            supervisor_result = &mut supervisor => supervisor_result,
            job_result = child.wait_for_exit() => {
                cancellation.cancel();
                let supervisor_result = supervisor.await;
                job_result.map_err(|error| LaunchFailure::ProcessWait {
                    os_code: error.raw_os_error(),
                    kind: error.kind(),
                })?;
                supervisor_result
            }
        }
    }
    .await;
    record_startup_event(
        "renderer supervisor",
        if result.is_err() { "failed" } else { "ended" },
    );
    if result.is_err() {
        record_precleanup_probe(
            live_launch_snapshot(endpoint, main_inspector_port, launched_pid).await,
        );
    }
    let result = match result {
        Err(AppError::Cdp(CdpError::NoCompatibleTarget | CdpError::IncompatibleRenderer)) => {
            Err(AppError::CdpTarget("Renderer qualification failed; see the pre-cleanup live-launch check below for candidate details.".to_owned()))
        }
        other => other,
    };
    record_startup_event("cleanup", "terminating launched Codex process");
    child.terminate().await;
    drop(early_player);
    result
}

async fn attach(args: AttachArgs) -> Result<(), AppError> {
    record_startup_event(
        "discovery",
        "finding official Codex installation for attach",
    );
    let preference = match args.channel.to_ascii_lowercase().as_str() {
        "beta" => ChannelPreference::Beta,
        "stable" => ChannelPreference::Stable,
        _ => ChannelPreference::Any,
    };
    let installation = discover_codex(None, None, preference)?;
    record_startup_event("discovery", "installation found");
    if installation.source != DiscoverySource::WindowsPackageManager {
        return Err(AppError::UnverifiedAttach);
    }
    if args.codex_version != "unknown" && args.codex_version != installation.version {
        return Err(AppError::AttachMetadataMismatch);
    }
    let compatible = is_supported_version(&installation.version);
    if !compatible && !args.allow_unsupported_version {
        return Err(AppError::UnsupportedVersion);
    }
    let endpoint = CdpEndpoint::loopback(args.port);
    record_renderer_port(args.port);
    record_startup_event("listener ownership", "verifying official executable");
    let executable = installation.executable.clone();
    tokio::task::spawn_blocking(move || verify_listener_executable(args.port, &executable))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    record_listener_verified();
    record_startup_event("listener ownership", "verified official executable");
    record_startup_event("CDP version", "waiting for attached endpoint");
    wait_for_endpoint(endpoint, Duration::from_secs(5)).await?;
    record_startup_event("CDP version", "attached endpoint responded");
    record_startup_event(
        "runtime preparation",
        "preparing UI bundle and App Server bridge",
    );
    let (bridge, injection) = prepare_runtime(
        &args.common,
        Some(&installation),
        &installation.version,
        &installation.channel,
        compatible,
        PRIMARY_BINDING_NAME,
        PRIMARY_RECEIVER_NAME,
        false,
    )
    .await?;
    record_startup_event("runtime preparation", "UI bundle and bridge prepared");
    let executable = installation.executable.clone();
    tokio::task::spawn_blocking(move || verify_listener_executable(args.port, &executable))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    tracing::info!(event = "authorized_cdp_attach");
    record_startup_event("renderer discovery", "attached supervisor started");
    supervise(
        endpoint,
        bridge,
        injection,
        ListenerIdentity::OfficialExecutable(installation.executable),
        args.allow_any_page,
        IdlePolicy::ExitAfterTimeout,
        CancellationToken::new(),
    )
    .await
}

async fn activate(args: ActivateArgs) -> Result<(), AppError> {
    record_startup_event(
        "discovery",
        "finding official Codex installation for activation",
    );
    let installation = discover_codex(None, None, args.channel)?;
    record_startup_event("discovery", "installation found");
    if installation.source != DiscoverySource::WindowsPackageManager {
        tracing::info!(
            event = "live_activation_skipped",
            reason = "official_package_required"
        );
        return Ok(());
    }
    let executable = installation.executable.clone();
    let port = tokio::task::spawn_blocking(move || discover_listener_port(&executable))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    let Some(port) = port else {
        tracing::info!(
            event = "live_activation_skipped",
            reason = "no_verified_listener"
        );
        return Ok(());
    };
    let endpoint = CdpEndpoint::loopback(port);
    record_renderer_port(port);
    record_startup_event("CDP version", "waiting for discovered listener");
    wait_for_endpoint(endpoint, Duration::from_secs(5)).await?;
    record_startup_event("CDP version", "endpoint responded");
    let suffix = format!(
        "{}_{}",
        env!("CARGO_PKG_VERSION").replace('.', "_"),
        std::process::id()
    );
    let binding_name = format!("__codeCodexLive_{suffix}");
    let receiver_name = format!("__codeCodexReceiveLive_{suffix}");
    let compatible = is_supported_version(&installation.version);
    record_startup_event(
        "runtime preparation",
        "preparing UI bundle and App Server bridge",
    );
    let (bridge, injection) = prepare_runtime(
        &args.common,
        Some(&installation),
        &installation.version,
        &installation.channel,
        compatible,
        &binding_name,
        &receiver_name,
        false,
    )
    .await?;
    record_startup_event("runtime preparation", "UI bundle and bridge prepared");
    let executable = installation.executable.clone();
    tokio::task::spawn_blocking(move || verify_listener_executable(port, &executable))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    record_listener_verified();
    record_startup_event("listener ownership", "verified official executable");
    tracing::info!(
        event = "live_activation_started",
        port,
        version = env!("CARGO_PKG_VERSION")
    );
    record_startup_event("renderer discovery", "activation supervisor started");
    supervise(
        endpoint,
        bridge,
        injection,
        ListenerIdentity::OfficialExecutable(installation.executable),
        false,
        IdlePolicy::ExitAfterTimeout,
        CancellationToken::new(),
    )
    .await
}

async fn prepare_runtime(
    common: &CommonArgs,
    installation: Option<&CodexInstallation>,
    version: &str,
    channel: &str,
    compatible: bool,
    binding_name: &str,
    receiver_name: &str,
    startup_splash_active: bool,
) -> Result<(Arc<NativeBridge>, InjectionConfig), AppError> {
    record_startup_event("UI bundle", "resolving embedded renderer bundle");
    let bundle = resolve_bundle(common.ui_bundle.as_deref())?;
    record_startup_event("UI bundle", "bundle resolved");
    let token = CapabilityToken::generate();
    record_startup_event("UI bootstrap", "building renderer bootstrap");
    let bootstrap = build_bootstrap(
        &bundle,
        &token,
        binding_name,
        receiver_name,
        version,
        channel,
        compatible,
        common.workspace.is_some(),
        startup_splash_active,
    )?;
    record_startup_event("UI bootstrap", "bootstrap built");
    let navigation_bootstrap = if startup_splash_active {
        Some(build_bootstrap(
            &bundle,
            &token,
            binding_name,
            receiver_name,
            version,
            channel,
            compatible,
            common.workspace.is_some(),
            false,
        )?)
    } else {
        None
    };

    let manual_workspace = if let Some(root) = common.workspace.clone() {
        record_startup_event("workspace", "opening explicitly selected workspace");
        Some(Arc::new(
            tokio::task::spawn_blocking(move || Workspace::open(root))
                .await
                .map_err(|_| WorkspaceError::Internal)??,
        ))
    } else {
        None
    };
    let resolver = if manual_workspace.is_none() {
        record_startup_event("App Server", "discovering packaged App Server");
        let source = discover_app_server_source(common.app_server.as_deref(), installation)?;
        let launch = prepare_app_server_launch(source)?;
        let mut command = AppServerCommand::codex(launch.executable());
        if let Some(current_dir) = launch.hardened_working_directory() {
            let trusted_path = launch
                .sanitized_path()
                .ok_or(DiscoveryError::AppServerNotFound)?;
            command = command.with_isolated_windows_search(current_dir, trusted_path);
        }
        record_startup_event("App Server", "connecting guarded local bridge");
        let client = AppServerClient::connect_guarded(&command, launch).await?;
        record_startup_event("App Server", "guarded local bridge connected");
        Some(client)
    } else {
        None
    };
    record_startup_event("settings", "loading local settings");
    let settings_store = SettingsStore::for_current_user()?;
    let store = settings_store.clone();
    let settings = tokio::task::spawn_blocking(move || store.load())
        .await
        .map_err(|_| WorkspaceError::Internal)??;
    record_startup_event("settings", "local settings loaded");
    let bridge = Arc::new(NativeBridge::new(
        resolver,
        manual_workspace,
        settings_store,
        settings,
    ));
    bridge.initialize_manual().await;
    let mut injection = InjectionConfig::new(bootstrap, token);
    injection.navigation_bootstrap_source = navigation_bootstrap.map(Into::into);
    injection.binding_name = binding_name.to_owned();
    injection.receiver_name = receiver_name.to_owned();
    Ok((bridge, injection))
}

async fn supervise(
    endpoint: CdpEndpoint,
    bridge: Arc<NativeBridge>,
    injection: InjectionConfig,
    listener_identity: ListenerIdentity,
    allow_any_page: bool,
    idle_policy: IdlePolicy,
    cancellation: CancellationToken,
) -> Result<(), AppError> {
    let mut options = SupervisorOptions::for_endpoint(endpoint);
    options.target_filter.allow_any_page = allow_any_page;
    options.idle_policy = idle_policy;
    options.startup_timeout = startup_timeout_for_idle_policy(idle_policy);
    let progress = Arc::new(SupervisorProgress::default());
    record_supervisor_progress(progress.clone());
    options.progress = Some(progress);
    let endpoint_verifier = Arc::new(ProcessEndpointVerifier {
        identity: listener_identity,
    });
    let supervisor = CdpSupervisor::new(options, injection, bridge.clone(), endpoint_verifier)?;
    bridge
        .set_notification_sender(supervisor.notification_sender())
        .await;
    let signal_cancellation = cancellation.clone();
    let signal_task = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            signal_cancellation.cancel();
        }
    });
    tracing::info!(event = "explorer_supervisor_started");
    let result = supervisor.run(cancellation).await;
    signal_task.abort();
    result?;
    tracing::info!(event = "explorer_supervisor_stopped");
    Ok(())
}

fn startup_timeout_for_idle_policy(idle_policy: IdlePolicy) -> Duration {
    match idle_policy {
        IdlePolicy::RecoverUntilCancelled => Duration::from_secs(120),
        IdlePolicy::ExitAfterTimeout => Duration::from_secs(30),
    }
}

struct ProcessEndpointVerifier {
    identity: ListenerIdentity,
}

enum ListenerIdentity {
    LaunchedProcess {
        pid: u32,
        launched_after: SystemTime,
    },
    OfficialExecutable(PathBuf),
}

#[async_trait]
impl cdp_client::EndpointVerifier for ProcessEndpointVerifier {
    async fn verify(&self, endpoint: CdpEndpoint) -> Result<(), CdpError> {
        let verification = match &self.identity {
            ListenerIdentity::LaunchedProcess {
                pid,
                launched_after,
            } => {
                let pid = *pid;
                let launched_after = *launched_after;
                let port = endpoint.port();
                tokio::task::spawn_blocking(move || {
                    verify_listener_owner(port, pid, launched_after)
                })
            }
            ListenerIdentity::OfficialExecutable(executable) => {
                let executable = executable.clone();
                let port = endpoint.port();
                tokio::task::spawn_blocking(move || verify_listener_executable(port, &executable))
            }
        };
        verification
            .await
            .map_err(|_| CdpError::EndpointIdentityMismatch)?
            .map_err(|_| CdpError::EndpointIdentityMismatch)
    }
}

async fn wait_for_endpoint(endpoint: CdpEndpoint, timeout: Duration) -> Result<(), CdpError> {
    let discovery = TargetDiscovery::new()?;
    let started = Instant::now();
    loop {
        match discovery.version(endpoint).await {
            Ok(version) if version.is_supported() => return Ok(()),
            Ok(_) => return Err(CdpError::UnsupportedProtocol),
            Err(_) => {}
        }
        if started.elapsed() >= timeout {
            return Err(CdpError::EndpointUnavailable);
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

/// Preserve the observations from this exact launch. A separate `diagnose`
/// process cannot know the randomly selected port after the launcher exits.
async fn wait_for_launched_endpoint(
    endpoint: CdpEndpoint,
    launched_pid: u32,
    timeout: Duration,
) -> Result<(), AppError> {
    let discovery = TargetDiscovery::new()?;
    let started = Instant::now();
    let mut attempts = 0_u32;
    loop {
        attempts = attempts.saturating_add(1);
        let last_error = match discovery.version_detailed(endpoint).await {
            Ok(version) if version.is_supported() => return Ok(()),
            Ok(_) => return Err(CdpError::UnsupportedProtocol.into()),
            Err(error) => error.to_string(),
        };
        if started.elapsed() >= timeout {
            let tcp_state = match tokio::time::timeout(
                Duration::from_millis(500),
                TcpStream::connect(("127.0.0.1", endpoint.port())),
            )
            .await
            {
                Ok(Ok(_)) => "TCP listener accepted a loopback connection".to_owned(),
                Ok(Err(error)) => format!("TCP connection failed: {error}"),
                Err(_) => "TCP connection timed out after 500 ms".to_owned(),
            };
            let process_state = launched_process_state(launched_pid);
            return Err(AppError::CdpStartup(format!(
                "Expected endpoint: http://127.0.0.1:{}/json/version\nWaited: {} ms; requests: {}\nLast CDP result: {}\nFinal loopback probe: {}\nLaunched Codex process: {}",
                endpoint.port(),
                started.elapsed().as_millis(),
                attempts,
                last_error,
                tcp_state,
                process_state,
            )));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

async fn live_launch_snapshot(
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

async fn target_discovery_snapshot(endpoint: CdpEndpoint, launched_pid: Option<u32>) -> String {
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

fn safe_layout_summary(value: &Value) -> String {
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

fn safe_layout_scalar(value: Option<&Value>) -> String {
    match value {
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value
            .as_u64()
            .filter(|number| *number <= 10_000)
            .map_or("unknown".to_owned(), |number| number.to_string()),
        _ => "unknown".to_owned(),
    }
}

fn safe_layout_tag(value: Option<&Value>) -> &'static str {
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

fn safe_target_location(raw: &str) -> String {
    let Ok(url) = Url::parse(raw) else {
        return "invalid URL".to_owned();
    };
    if url.scheme() == "app" && url.host_str() == Some("-") {
        return format!("app://-{}", url.path());
    }
    format!("{}: (non-app target)", url.scheme())
}

fn validate_extra_arguments(arguments: &[String]) -> Result<(), AppError> {
    if arguments.iter().any(|argument| {
        let lower = argument.to_ascii_lowercase();
        lower.starts_with("--remote-debugging")
            || lower.starts_with("--remote-allow-origins")
            || lower.starts_with("--inspect")
            || lower.starts_with("--debug")
    }) {
        return Err(AppError::InvalidLaunchArgument);
    }
    Ok(())
}

const DISABLE_DIRECT_COMPOSITION_ARGUMENT: &str = "--disable-direct-composition";
const MAIN_INSPECTOR_MESSAGE_BYTES: usize = 256 * 1024;
const MAIN_INSPECTOR_MESSAGE_LIMIT: usize = 4_096;
const MAIN_INSPECTOR_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const MAIN_INSPECTOR_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const MAIN_INSPECTOR_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(15);
const ELECTRON_MAIN_TRANSPARENCY_PATCH: &str = r#"(() => {
    const localRequire = typeof require === 'function'
        ? require
        : typeof process.mainModule?.require === 'function'
            ? process.mainModule.require.bind(process.mainModule)
            : process.getBuiltinModule('node:module').createRequire(process.execPath);
    const inspector = localRequire('node:inspector');
    const Module = localRequire('node:module');
    const hookMarker = Symbol.for('code-codex.win10-transparent-surface.v1');
    const hookStateMarker = Symbol.for('code-codex.win10-transparent-surface-state.v1');
    const transparentColor = '#00000000';
    let surfaceHookEnabled = false;
    let hookState = Module._load?.[hookStateMarker];
    try {
        const electron = localRequire('electron');
        const OriginalBrowserWindow = electron.BrowserWindow;
        if (Module._load?.[hookMarker] === true) {
            surfaceHookEnabled = true;
        } else if (typeof OriginalBrowserWindow === 'function') {
            hookState = { constructorHookCount: 0 };
            const TransparentBrowserWindow = new Proxy(OriginalBrowserWindow, {
                construct(target, argumentsList) {
                    const options = argumentsList[0];
                    const transparentOptions = options && typeof options === 'object'
                        ? {
                            ...options,
                            transparent: true,
                            backgroundColor: transparentColor,
                            backgroundMaterial: undefined
                        }
                        : options;
                    const window = Reflect.construct(
                        target,
                        [transparentOptions, ...argumentsList.slice(1)],
                        target
                    );
                    const originalSetBackgroundColor = window.setBackgroundColor;
                    if (typeof originalSetBackgroundColor !== 'function') {
                        throw new TypeError('BrowserWindow.setBackgroundColor is unavailable');
                    }
                    Object.defineProperties(window, {
                        setBackgroundColor: {
                            configurable: false,
                            writable: false,
                            value() {
                                return Reflect.apply(originalSetBackgroundColor, window, [transparentColor]);
                            }
                        },
                        setBackgroundMaterial: {
                            configurable: false,
                            writable: false,
                            value() {
                                return Reflect.apply(originalSetBackgroundColor, window, [transparentColor]);
                            }
                        }
                    });
                    Reflect.apply(originalSetBackgroundColor, window, [transparentColor]);
                    hookState.constructorHookCount += 1;
                    return window;
                }
            });
            const electronProxy = new Proxy(electron, {
                get(target, property) {
                    if (property === 'BrowserWindow') return TransparentBrowserWindow;
                    return Reflect.get(target, property, target);
                }
            });
            const originalLoad = Module._load;
            function patchedLoad(request, parent, isMain) {
                const loaded = Reflect.apply(originalLoad, this, [request, parent, isMain]);
                return request === 'electron' ? electronProxy : loaded;
            }
            Object.defineProperty(patchedLoad, hookMarker, { value: true });
            Object.defineProperty(patchedLoad, hookStateMarker, { value: hookState });
            Module._load = patchedLoad;
            surfaceHookEnabled = Module._load?.[hookMarker] === true;
        }
        for (const argumentsList of [process.argv, process.execArgv]) {
            for (let index = argumentsList.length - 1; index >= 0; index -= 1) {
                if (argumentsList[index].toLowerCase().startsWith('--inspect-brk')) {
                    argumentsList.splice(index, 1);
                }
            }
        }
        try { electron.app.commandLine.removeSwitch('inspect-brk'); } catch {}
    } finally {
        setTimeout(() => {
            try { inspector.close(); } catch {}
        }, 500);
    }
    return {
        surfaceHookEnabled,
        constructorHookCount: hookState?.constructorHookCount ?? 0
    };
})()"#;

type MainInspectorSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct MainInspectorSession {
    socket: MainInspectorSocket,
    pending_paused_event: Option<Value>,
}

impl MainInspectorSession {
    fn new(socket: MainInspectorSocket) -> Self {
        Self {
            socket,
            pending_paused_event: None,
        }
    }

    async fn command(&mut self, id: u64, method: &str, params: Value) -> Result<Value, CdpError> {
        let command = serde_json::to_string(&json!({
            "id": id,
            "method": method,
            "params": params
        }))
        .map_err(|_| CdpError::Protocol)?;
        self.socket
            .send(Message::Text(command.into()))
            .await
            .map_err(|_| CdpError::WebSocket)?;

        tokio::time::timeout(MAIN_INSPECTOR_COMMAND_TIMEOUT, async {
            for _ in 0..MAIN_INSPECTOR_MESSAGE_LIMIT {
                let message = receive_main_inspector_json(&mut self.socket).await?;
                if message.get("id").and_then(Value::as_u64) == Some(id) {
                    if message.get("error").is_some()
                        || message
                            .get("result")
                            .and_then(|result| result.get("exceptionDetails"))
                            .is_some()
                    {
                        return Err(CdpError::Protocol);
                    }
                    return message.get("result").cloned().ok_or(CdpError::Protocol);
                }
                if message.get("method").and_then(Value::as_str).is_some() {
                    if is_debugger_paused_event(&message) {
                        if self.pending_paused_event.replace(message).is_some() {
                            return Err(CdpError::Protocol);
                        }
                    }
                    continue;
                }
                return Err(CdpError::Protocol);
            }
            Err(CdpError::Protocol)
        })
        .await
        .map_err(|_| CdpError::Protocol)?
    }

    async fn wait_for_paused_call_frame(&mut self) -> Result<String, CdpError> {
        if let Some(event) = self.pending_paused_event.take() {
            return paused_call_frame_id(&event);
        }

        tokio::time::timeout(MAIN_INSPECTOR_STARTUP_TIMEOUT, async {
            for _ in 0..MAIN_INSPECTOR_MESSAGE_LIMIT {
                let message = receive_main_inspector_json(&mut self.socket).await?;
                if is_debugger_paused_event(&message) {
                    return paused_call_frame_id(&message);
                }
                if message.get("method").and_then(Value::as_str).is_none() {
                    return Err(CdpError::Protocol);
                }
            }
            Err(CdpError::Protocol)
        })
        .await
        .map_err(|_| CdpError::Protocol)?
    }
}

#[cfg(windows)]
fn needs_windows_10_surface_patch() -> bool {
    use windows_sys::Wdk::System::SystemServices::RtlGetVersion;
    use windows_sys::Win32::System::SystemInformation::OSVERSIONINFOW;

    let mut version = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..OSVERSIONINFOW::default()
    };
    // RtlGetVersion is unaffected by application-manifest compatibility
    // declarations and is the authoritative source for the NT build number.
    let status = unsafe { RtlGetVersion(&mut version) };
    status >= 0
        && nt_build_needs_windows_10_surface_patch(version.dwMajorVersion, version.dwBuildNumber)
}

#[cfg(not(windows))]
const fn needs_windows_10_surface_patch() -> bool {
    false
}

const fn nt_build_needs_windows_10_surface_patch(major: u32, build: u32) -> bool {
    major == 10 && build < 22_000
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ElectronMainPatchResult {
    surface_hook_enabled: bool,
    constructor_hook_count: u64,
}

async fn initialize_electron_main_process(
    endpoint: CdpEndpoint,
    launched_pid: u32,
    launched_after: SystemTime,
) -> Result<(), AppError> {
    wait_for_tcp_listener(endpoint, MAIN_INSPECTOR_STARTUP_TIMEOUT).await?;
    verify_owned_listener(endpoint, launched_pid, launched_after).await?;

    let target = wait_for_main_inspector_target(endpoint, MAIN_INSPECTOR_STARTUP_TIMEOUT).await?;
    let websocket_url = validate_main_inspector_target(endpoint, &target)?;
    let websocket_config = WebSocketConfig::default()
        .max_message_size(Some(MAIN_INSPECTOR_MESSAGE_BYTES))
        .max_frame_size(Some(MAIN_INSPECTOR_MESSAGE_BYTES));
    let (mut socket, _) =
        connect_async_with_config(websocket_url.as_str(), Some(websocket_config), false)
            .await
            .map_err(|_| CdpError::WebSocket)?;

    // Pin the connected inspector to the launched official process immediately
    // before evaluating the fixed, non-user-controlled initializer.
    if let Err(error) = verify_owned_listener(endpoint, launched_pid, launched_after).await {
        let _ = socket.close(None).await;
        return Err(error);
    }

    // `--inspect-brk` begins in a pre-execution context where `process` and
    // CommonJS `require` are unavailable. Advance to the first paused call
    // frame, then install the hook before Codex's main module executes.
    let mut session = MainInspectorSession::new(socket);
    session.command(1, "Runtime.enable", json!({})).await?;
    session.command(2, "Debugger.enable", json!({})).await?;
    session
        .command(3, "Runtime.runIfWaitingForDebugger", json!({}))
        .await?;
    let call_frame_id = session.wait_for_paused_call_frame().await?;

    let evaluation = session
        .command(
            4,
            "Debugger.evaluateOnCallFrame",
            json!({
                "callFrameId": call_frame_id,
                "expression": ELECTRON_MAIN_TRANSPARENCY_PATCH,
                "returnByValue": true,
                "silent": false
            }),
        )
        .await;
    let resume = session.command(5, "Debugger.resume", json!({})).await;
    let _ = session.socket.send(Message::Close(None)).await;
    drop(session);

    let evaluation = evaluation?;
    resume?;
    let patch: ElectronMainPatchResult = serde_json::from_value(
        evaluation
            .pointer("/result/value")
            .cloned()
            .ok_or(CdpError::Protocol)?,
    )
    .map_err(|_| CdpError::Protocol)?;
    if !patch.surface_hook_enabled {
        return Err(CdpError::Protocol.into());
    }
    tracing::debug!(
        event = "electron_main_transparency_patch_applied",
        constructor_hook_count = patch.constructor_hook_count
    );
    wait_for_tcp_listener_closed(endpoint, MAIN_INSPECTOR_SHUTDOWN_TIMEOUT).await?;
    Ok(())
}

async fn receive_main_inspector_json(socket: &mut MainInspectorSocket) -> Result<Value, CdpError> {
    loop {
        match socket.next().await {
            Some(Ok(Message::Text(text))) => {
                let message: Value =
                    serde_json::from_str(text.as_ref()).map_err(|_| CdpError::Protocol)?;
                if !message.is_object() {
                    return Err(CdpError::Protocol);
                }
                return Ok(message);
            }
            Some(Ok(Message::Ping(payload))) => socket
                .send(Message::Pong(payload))
                .await
                .map_err(|_| CdpError::WebSocket)?,
            Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(_))) | None => return Err(CdpError::WebSocket),
            Some(Ok(_)) => return Err(CdpError::Protocol),
            Some(Err(_)) => return Err(CdpError::WebSocket),
        }
    }
}

fn is_debugger_paused_event(message: &Value) -> bool {
    message.get("method").and_then(Value::as_str) == Some("Debugger.paused")
}

fn paused_call_frame_id(message: &Value) -> Result<String, CdpError> {
    let call_frame_id = message
        .pointer("/params/callFrames/0/callFrameId")
        .and_then(Value::as_str)
        .filter(|call_frame_id| !call_frame_id.is_empty() && call_frame_id.len() <= 1_024)
        .ok_or(CdpError::Protocol)?;
    Ok(call_frame_id.to_owned())
}

async fn verify_owned_listener(
    endpoint: CdpEndpoint,
    launched_pid: u32,
    launched_after: SystemTime,
) -> Result<(), AppError> {
    let port = endpoint.port();
    tokio::task::spawn_blocking(move || verify_listener_owner(port, launched_pid, launched_after))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    Ok(())
}

async fn wait_for_tcp_listener(endpoint: CdpEndpoint, timeout: Duration) -> Result<(), CdpError> {
    let started = Instant::now();
    loop {
        if TcpStream::connect(("127.0.0.1", endpoint.port()))
            .await
            .is_ok()
        {
            return Ok(());
        }
        if started.elapsed() >= timeout {
            return Err(CdpError::EndpointUnavailable);
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn wait_for_tcp_listener_closed(
    endpoint: CdpEndpoint,
    timeout: Duration,
) -> Result<(), CdpError> {
    let started = Instant::now();
    loop {
        if TcpStream::connect(("127.0.0.1", endpoint.port()))
            .await
            .is_err()
        {
            return Ok(());
        }
        if started.elapsed() >= timeout {
            return Err(CdpError::Protocol);
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn wait_for_main_inspector_target(
    endpoint: CdpEndpoint,
    timeout: Duration,
) -> Result<cdp_client::CdpTarget, CdpError> {
    let discovery = TargetDiscovery::new()?;
    let started = Instant::now();
    loop {
        if let Ok(targets) = discovery.targets(endpoint).await {
            if targets.len() == 1 {
                return targets.into_iter().next().ok_or(CdpError::InvalidEndpoint);
            }
            if targets.len() > 1 {
                return Err(CdpError::InvalidEndpoint);
            }
        }
        if started.elapsed() >= timeout {
            return Err(CdpError::EndpointUnavailable);
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

fn validate_main_inspector_target(
    endpoint: CdpEndpoint,
    target: &cdp_client::CdpTarget,
) -> Result<Url, CdpError> {
    if target.target_type != "node" || target.id.is_empty() {
        return Err(CdpError::InvalidEndpoint);
    }
    let url = Url::parse(&target.web_socket_debugger_url)
        .map_err(|_| CdpError::InvalidWebSocketEndpoint)?;
    let valid = url.scheme() == "ws"
        && url.host_str() == Some("127.0.0.1")
        && url.port_or_known_default() == Some(endpoint.port())
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().len() > 1;
    if !valid {
        return Err(CdpError::InvalidWebSocketEndpoint);
    }
    Ok(url)
}

fn build_launch_arguments(
    port: u16,
    main_inspector_port: Option<u16>,
    extra_arguments: &[String],
) -> Vec<String> {
    let mut arguments = vec![
        "--remote-debugging-address=127.0.0.1".to_owned(),
        format!("--remote-debugging-port={port}"),
    ];
    if let Some(main_inspector_port) = main_inspector_port {
        arguments.push(format!("--inspect-brk=127.0.0.1:{main_inspector_port}"));
    } else {
        arguments.push(DISABLE_DIRECT_COMPOSITION_ARGUMENT.to_owned());
    }
    arguments.extend(
        extra_arguments
            .iter()
            .filter(|argument| !argument.eq_ignore_ascii_case(DISABLE_DIRECT_COMPOSITION_ARGUMENT))
            .cloned(),
    );
    arguments
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticReport {
    codex: Value,
    app_server: Value,
    ui_bundle: Value,
    cdp: Value,
}

async fn diagnose(args: DiagnoseArgs) -> Result<(), AppError> {
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

fn redacted_codex_diagnostic(installation: &CodexInstallation) -> Value {
    let source = match installation.source {
        DiscoverySource::Explicit => "explicit",
        DiscoverySource::WindowsPackageManager => "windowsPackageManager",
        DiscoverySource::UserInstall => "userInstall",
        DiscoverySource::Path => "path",
    };
    json!({
        "status": "available",
        "version": installation.version,
        "channel": installation.channel,
        "source": source,
        "officialPackage": installation.source == DiscoverySource::WindowsPackageManager,
        "packageName": installation.package_name,
        "packagedAppServer": installation.app_server.is_some()
    })
}

async fn diagnose_cdp(endpoint: CdpEndpoint) -> Value {
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

#[cfg(test)]
mod tests {
    #[test]
    fn early_animation_bundle_is_isolated_and_rejects_late_replay() {
        assert!(super::early_startup::SOURCE.len() < 512 * 1024);
        assert!(!super::early_startup::SOURCE.contains("__CODE_CODEX_BOOTSTRAP__"));
        assert!(!super::early_startup::SOURCE.contains("explorer.context"));
        assert!(super::early_startup::SOURCE.contains("app:"));
        assert!(super::early_startup::SOURCE.contains("/index.html"));
        assert!(super::early_startup::SOURCE.contains("data-app-shell-main-surface"));
        assert!(super::early_startup::SOURCE.contains("early-promise:v1"));
    }

    use super::*;

    #[tokio::test]
    async fn launched_endpoint_failure_keeps_port_and_process_evidence() {
        let reservation = PortReservation::reserve().expect("loopback port");
        let port = reservation.port().expect("reserved port");
        drop(reservation);

        let error = wait_for_launched_endpoint(
            CdpEndpoint::loopback(port),
            std::process::id(),
            Duration::from_millis(50),
        )
        .await
        .expect_err("endpoint has no listener");
        let AppError::CdpStartup(details) = error else {
            panic!("expected detailed CDP startup failure");
        };
        assert!(details.contains(&format!("127.0.0.1:{port}/json/version")));
        assert!(details.contains("Final loopback probe:"));
        assert!(details.contains(&format!("PID {}", std::process::id())));
    }

    #[test]
    fn target_snapshot_location_excludes_query_and_external_host() {
        assert_eq!(
            safe_target_location("app://-/index.html?initialRoute=%2Fprivate"),
            "app://-/index.html"
        );
        assert_eq!(
            safe_target_location("https://example.com/private?token=secret"),
            "https: (non-app target)"
        );
    }

    #[test]
    fn layout_summary_keeps_only_known_scalar_diagnostics() {
        let summary = safe_layout_summary(&json!({
            "mainCount": 1,
            "accepted": false,
            "readyState": "complete",
            "pageText": "private conversation",
            "title": "private title",
            "checks": [
                {"name": "main_content_clip", "expected": true, "actual": false},
                {"name": "private conversation", "expected": true, "actual": false}
            ],
            "rowChildren": [{"index": 0, "tag": "DIV", "childCount": 2,
                "containsMain": true, "directRail": false, "workspaceClass": false,
                "unifiedTabAttribute": false, "text": "private conversation"}],
            "mainAncestors": [{"depth": 0, "tag": "PRIVATE", "childCount": 1,
                "workspaceRow": false, "directRowChild": false, "mainClip": false,
                "workspaceClass": false, "className": "private conversation"}]
        }));
        assert!(summary.contains("mainCount=1"));
        assert!(summary.contains("accepted=false"));
        assert!(summary.contains("readyState=complete"));
        assert!(summary.contains("main_content_clip: true -> false [FAIL]"));
        assert!(summary.contains("child 0: tag=DIV"));
        assert!(summary.contains("depth 0: tag=OTHER"));
        assert!(!summary.contains("private"));
    }

    #[test]
    fn startup_defaults_to_stable_channel() {
        let implicit = default_run_args();
        assert!(matches!(implicit.channel, ChannelPreference::Stable));

        let parsed = Cli::try_parse_from(["code-codex", "run"]).expect("parse default run command");
        let Some(Commands::Run(explicit)) = parsed.command else {
            panic!("run command was not parsed");
        };
        assert!(matches!(explicit.channel, ChannelPreference::Stable));
    }

    #[test]
    fn renderer_cannot_override_debug_endpoint_through_extra_args() {
        assert!(validate_extra_arguments(&["--disable-gpu".to_owned()]).is_ok());
        assert!(
            validate_extra_arguments(&["--remote-debugging-address=0.0.0.0".to_owned()]).is_err()
        );
        assert!(validate_extra_arguments(&["--REMOTE-DEBUGGING-PORT=80".to_owned()]).is_err());
        assert!(validate_extra_arguments(&["--inspect=0.0.0.0:9229".to_owned()]).is_err());
        assert!(validate_extra_arguments(&["--INSPECT-BRK=5858".to_owned()]).is_err());
        assert!(validate_extra_arguments(&["--debug-port=5858".to_owned()]).is_err());
    }

    #[test]
    fn codex_launch_preserves_the_alpha_compositor_only_for_the_win10_surface_patch() {
        let win10_arguments = build_launch_arguments(
            4321,
            Some(4322),
            &[
                "--disable-gpu".to_owned(),
                "--DISABLE-DIRECT-COMPOSITION".to_owned(),
            ],
        );
        assert!(win10_arguments.contains(&"--remote-debugging-port=4321".to_owned()));
        assert!(win10_arguments.contains(&"--inspect-brk=127.0.0.1:4322".to_owned()));
        assert!(win10_arguments.contains(&"--disable-gpu".to_owned()));
        assert_eq!(
            win10_arguments
                .iter()
                .filter(|argument| {
                    argument.eq_ignore_ascii_case(DISABLE_DIRECT_COMPOSITION_ARGUMENT)
                })
                .count(),
            0
        );

        let ordinary_arguments = build_launch_arguments(
            4321,
            None,
            &[
                "--disable-gpu".to_owned(),
                "--DISABLE-DIRECT-COMPOSITION".to_owned(),
            ],
        );
        assert!(
            ordinary_arguments
                .iter()
                .all(|argument| !argument.starts_with("--inspect"))
        );
        assert!(ordinary_arguments.contains(&"--disable-gpu".to_owned()));
        assert_eq!(
            ordinary_arguments
                .iter()
                .filter(|argument| {
                    argument.eq_ignore_ascii_case(DISABLE_DIRECT_COMPOSITION_ARGUMENT)
                })
                .count(),
            1
        );
    }

    #[test]
    fn main_inspector_target_requires_one_exact_ipv4_loopback_node_endpoint() {
        let endpoint = CdpEndpoint::loopback(4322);
        let target = cdp_client::CdpTarget {
            id: "2c6b16cc-bf2c-4f24-9172-e84832a31e52".to_owned(),
            target_type: "node".to_owned(),
            title: "Codex".to_owned(),
            url: "file:///Codex/resources/app.asar/main.js".to_owned(),
            web_socket_debugger_url: "ws://127.0.0.1:4322/2c6b16cc-bf2c-4f24-9172-e84832a31e52"
                .to_owned(),
        };
        assert!(validate_main_inspector_target(endpoint, &target).is_ok());

        for invalid_url in [
            "ws://localhost:4322/2c6b16cc-bf2c-4f24-9172-e84832a31e52",
            "ws://127.0.0.1:4323/2c6b16cc-bf2c-4f24-9172-e84832a31e52",
            "ws://127.0.0.1:4322/2c6b16cc-bf2c-4f24-9172-e84832a31e52?token=value",
            "wss://127.0.0.1:4322/2c6b16cc-bf2c-4f24-9172-e84832a31e52",
        ] {
            let mut invalid = target.clone();
            invalid.web_socket_debugger_url = invalid_url.to_owned();
            assert!(validate_main_inspector_target(endpoint, &invalid).is_err());
        }

        let mut renderer = target;
        renderer.target_type = "page".to_owned();
        assert!(validate_main_inspector_target(endpoint, &renderer).is_err());
    }

    #[test]
    fn main_process_patch_is_constant_and_closes_its_inspector() {
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("transparent: true"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("const transparentColor = '#00000000'"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("backgroundColor: transparentColor"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("backgroundMaterial: undefined"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("Module._load = patchedLoad"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("setBackgroundColor: {"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("setBackgroundMaterial: {"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("constructorHookCount += 1"));
        assert!(ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("inspector.close()"));
        assert!(!ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("isSystemBackdropSupported"));
        assert!(!ELECTRON_MAIN_TRANSPARENCY_PATCH.contains("WS_EX_TRANSPARENT"));
    }

    #[test]
    fn electron_main_surface_patch_is_scoped_to_windows_10_builds() {
        assert!(nt_build_needs_windows_10_surface_patch(10, 19_041));
        assert!(nt_build_needs_windows_10_surface_patch(10, 19_045));
        assert!(!nt_build_needs_windows_10_surface_patch(10, 22_000));
        assert!(!nt_build_needs_windows_10_surface_patch(10, 26_100));
        assert!(!nt_build_needs_windows_10_surface_patch(6, 3));
    }

    #[tokio::test]
    async fn main_inspector_session_preserves_pause_event_while_correlating_response() {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("bind mock inspector");
        let port = listener
            .local_addr()
            .expect("mock inspector address")
            .port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept inspector client");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("accept inspector websocket");
            let message = socket
                .next()
                .await
                .expect("inspector request")
                .expect("valid inspector request");
            let Message::Text(text) = message else {
                panic!("inspector request must be text");
            };
            let request: Value = serde_json::from_str(text.as_ref()).expect("request JSON");
            assert_eq!(request.get("id").and_then(Value::as_u64), Some(7));
            assert_eq!(
                request.get("method").and_then(Value::as_str),
                Some("Runtime.runIfWaitingForDebugger")
            );
            socket
                .send(Message::Text(
                    json!({
                        "method": "Debugger.paused",
                        "params": {
                            "reason": "Break on start",
                            "callFrames": [{"callFrameId": "4721008079512459587.1.0"}]
                        }
                    })
                    .to_string()
                    .into(),
                ))
                .await
                .expect("send paused event");
            socket
                .send(Message::Text(
                    json!({"method": "Runtime.executionContextCreated", "params": {}})
                        .to_string()
                        .into(),
                ))
                .await
                .expect("send unrelated event");
            socket
                .send(Message::Text(
                    json!({"id": 7, "result": {}}).to_string().into(),
                ))
                .await
                .expect("send inspector response");
        });

        let config = WebSocketConfig::default()
            .max_message_size(Some(MAIN_INSPECTOR_MESSAGE_BYTES))
            .max_frame_size(Some(MAIN_INSPECTOR_MESSAGE_BYTES));
        let (socket, _) =
            connect_async_with_config(format!("ws://127.0.0.1:{port}/mock"), Some(config), false)
                .await
                .expect("connect mock inspector");
        let mut session = MainInspectorSession::new(socket);
        let response = session
            .command(7, "Runtime.runIfWaitingForDebugger", json!({}))
            .await
            .expect("correlated inspector response");
        assert_eq!(response, json!({}));
        assert_eq!(
            session
                .wait_for_paused_call_frame()
                .await
                .expect("preserved paused call frame"),
            "4721008079512459587.1.0"
        );
        drop(session);
        server.await.expect("mock inspector task");
    }

    #[test]
    fn paused_call_frame_requires_one_bounded_nonempty_identifier() {
        assert!(
            paused_call_frame_id(&json!({
                "method": "Debugger.paused",
                "params": {"callFrames": [{"callFrameId": "frame-1"}]}
            }))
            .is_ok()
        );
        for invalid in [
            json!({"method": "Debugger.paused", "params": {"callFrames": []}}),
            json!({
                "method": "Debugger.paused",
                "params": {"callFrames": [{"callFrameId": ""}]}
            }),
            json!({
                "method": "Debugger.paused",
                "params": {"callFrames": [{"callFrameId": "x".repeat(1_025)}]}
            }),
        ] {
            assert!(paused_call_frame_id(&invalid).is_err());
        }
    }

    #[tokio::test]
    async fn main_inspector_listener_shutdown_is_proved_by_connection_refusal() {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("bind lifecycle listener");
        let endpoint = CdpEndpoint::loopback(
            listener
                .local_addr()
                .expect("lifecycle listener address")
                .port(),
        );
        wait_for_tcp_listener(endpoint, Duration::from_secs(1))
            .await
            .expect("listener opens");
        drop(listener);
        wait_for_tcp_listener_closed(endpoint, Duration::from_secs(1))
            .await
            .expect("listener closes");
    }

    #[test]
    fn user_visible_launcher_failures_have_stable_exit_categories() {
        assert_eq!(
            AppError::UnsupportedVersion.exit_code(),
            exit_codes::UNSUPPORTED_VERSION
        );
        assert_eq!(
            AppError::AlreadyRunning.exit_code(),
            exit_codes::ALREADY_RUNNING
        );
        assert_eq!(
            AppError::Launch(LaunchFailure::PackageSupervision).exit_code(),
            exit_codes::STARTUP_FAILURE
        );
        assert_eq!(
            AppError::InvalidLaunchArgument.exit_code(),
            exit_codes::GENERIC_FAILURE
        );
    }

    #[test]
    fn generic_errors_receive_the_same_bounded_startup_trace() {
        begin_startup_trace("run");
        record_startup_event("CDP version", "supported endpoint responded");
        record_renderer_port(13699);
        for error in [
            AppError::Cdp(CdpError::EndpointUnavailable),
            AppError::UnsupportedVersion,
        ] {
            let report = enrich_startup_diagnostic(&error);
            assert!(report.reason.contains("Startup trace:"));
            assert!(report.reason.contains("supported endpoint responded"));
            assert!(report.reason.contains("Renderer port: 13699"));
        }
    }

    #[test]
    fn startup_failures_expose_specific_safe_support_details() {
        let unregistered =
            AppError::Discovery(DiscoveryError::StablePackageNotRegistered).startup_diagnostic();
        assert_eq!(unregistered.code, "CC-START-DISCOVERY-004");
        assert!(unregistered.reason.contains("this Windows user"));

        let inaccessible = AppError::Discovery(DiscoveryError::PackageLocationUnavailable {
            code: "Win32=5 (0x00000005)".to_owned(),
        })
        .startup_diagnostic();
        assert_eq!(inaccessible.code, "CC-START-DISCOVERY-007");
        assert!(inaccessible.reason.contains("directory"));
        assert!(inaccessible.reason.contains("5"));
        assert!(!inaccessible.reason.contains("C:\\"));

        let app_server =
            AppError::Discovery(DiscoveryError::AppServerNotFound).startup_diagnostic();
        assert_eq!(app_server.code, "CC-START-APP-001");
        assert_eq!(app_server.stage, "Finding the App Server");
        assert!(app_server.reason.contains("App Server executable"));

        let timeout = AppError::Resolver(ResolverError::Timeout).startup_diagnostic();
        assert_eq!(timeout.code, "CC-START-APP-003");
        assert_eq!(timeout.stage, "Waiting for the App Server");

        let bundle = AppError::Bootstrap(BootstrapError::InvalidBundle).startup_diagnostic();
        assert_eq!(bundle.code, "CC-START-UI-002");
        assert!(bundle.guidance.contains("installer"));

        assert_eq!(
            AppError::Cdp(CdpError::IncompatibleRenderer)
                .startup_diagnostic()
                .code,
            "CC-START-CDP-008"
        );
        assert_eq!(
            AppError::Cdp(CdpError::NoCompatibleTarget)
                .startup_diagnostic()
                .code,
            "CC-START-CDP-002"
        );
        assert_eq!(
            AppError::Workspace(WorkspaceError::AccessDenied)
                .startup_diagnostic()
                .code,
            "CC-START-WORKSPACE-007"
        );
        assert_eq!(
            AppError::AttachMetadataMismatch.startup_diagnostic().code,
            "CC-START-SECURITY-003"
        );
        assert_eq!(
            AppError::ProcessGuard(ProcessGuardError::Detailed(
                "listener executable query failed: port=61373, exit=Some(1)".into()
            ))
            .startup_diagnostic()
            .code,
            "CC-START-PROCESS-008"
        );
    }

    #[test]
    fn distinct_cdp_failures_have_distinct_support_codes() {
        let errors = [
            CdpError::EndpointUnavailable,
            CdpError::InvalidEndpoint,
            CdpError::UnsupportedProtocol,
            CdpError::NoCompatibleTarget,
            CdpError::AmbiguousRenderer,
            CdpError::TooManyTargets,
            CdpError::IncompatibleRenderer,
            CdpError::InvalidWebSocketEndpoint,
            CdpError::EndpointIdentityMismatch,
            CdpError::WebSocket,
            CdpError::Protocol,
        ];
        let codes: std::collections::HashSet<_> = errors
            .into_iter()
            .map(|error| AppError::Cdp(error).startup_diagnostic().code)
            .collect();
        assert_eq!(codes.len(), 11);
    }

    #[test]
    fn distinct_launch_failures_have_distinct_support_codes() {
        let errors = [
            LaunchFailure::MissingPackageIdentity,
            LaunchFailure::MissingApplicationId,
            LaunchFailure::PackageActivation {
                os_code: Some(5),
                kind: std::io::ErrorKind::PermissionDenied,
            },
            LaunchFailure::PackageSupervision,
            LaunchFailure::DirectSpawn {
                os_code: Some(2),
                kind: std::io::ErrorKind::NotFound,
            },
            LaunchFailure::ProcessWait {
                os_code: None,
                kind: std::io::ErrorKind::Other,
            },
            LaunchFailure::DiagnosticSerialization,
        ];
        let codes: std::collections::HashSet<_> = errors
            .into_iter()
            .map(|error| AppError::Launch(error).startup_diagnostic().code)
            .collect();
        assert_eq!(codes.len(), 7);
    }

    #[test]
    fn owned_launch_gets_a_longer_bounded_startup_window_than_attach() {
        assert_eq!(
            startup_timeout_for_idle_policy(IdlePolicy::RecoverUntilCancelled),
            Duration::from_secs(120)
        );
        assert_eq!(
            startup_timeout_for_idle_policy(IdlePolicy::ExitAfterTimeout),
            Duration::from_secs(30)
        );
    }

    #[test]
    fn diagnostics_do_not_expose_installation_paths() {
        let installation = CodexInstallation {
            executable: PathBuf::from(r"C:\Users\secret\Codex.exe"),
            version: "26.715.3651.0".to_owned(),
            channel: "beta".to_owned(),
            source: DiscoverySource::WindowsPackageManager,
            package_name: Some("OpenAI.CodexBeta".to_owned()),
            package_full_name: Some("OpenAI.CodexBeta_26.715.3651.0_x64__2p2nqsd0c76g0".to_owned()),
            app_user_model_id: Some("OpenAI.CodexBeta_2p2nqsd0c76g0!App".to_owned()),
            app_server: Some(PathBuf::from(r"C:\Users\secret\codex.exe")),
        };
        let report = redacted_codex_diagnostic(&installation).to_string();
        assert!(!report.contains("Users"));
        assert!(!report.contains("secret"));
        assert!(!report.contains("Codex.exe"));
        assert!(report.contains("26.715.3651.0"));
        assert!(report.contains("OpenAI.CodexBeta"));
    }
}
