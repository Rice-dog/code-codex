mod bootstrap;
mod bridge;
mod discovery;
mod early_startup;
mod exit_codes;
mod fault_diagnostics;
#[allow(dead_code)]
mod gui_support;
mod launch_recovery;
mod network_diagnostics;
mod plugin_store;
mod process_diagnostics;
mod process_guard;
mod renderer_storage;
mod runtime_log;
mod startup_diagnostics;
mod startup_examples;
mod support_checks;
mod win10_compat;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;
use std::time::{Duration, Instant};

use bootstrap::BootstrapError;
use cdp_client::{CdpEndpoint, CdpError, IdlePolicy, SupervisorProgress};
use clap::{Args, Parser, Subcommand, ValueEnum};
use context_resolver::ResolverError;
use discovery::{ChannelPreference, CodexInstallation, DiscoveryError, DiscoverySource};
use futures_util::{SinkExt, StreamExt};
use process_guard::{AttachedProcess, PortReservation, ProcessGuardError};
use serde::Serialize;
use serde_json::{Value, json};
use startup_diagnostics::StartupDiagnostic;
use thiserror::Error;
use tokio_tungstenite::connect_async_with_config;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tracing_subscriber::EnvFilter;
use workspace_service::WorkspaceError;

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
static FAILURE_CHECK_STARTED: OnceLock<Instant> = OnceLock::new();
static ORIGINAL_FAILURE: OnceLock<StartupDiagnostic> = OnceLock::new();

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
    /// Inspect cached first-party backgrounds, or import verified offline release assets.
    Plugins {
        #[arg(long)]
        import_dir: Option<PathBuf>,
    },
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
    /// Collect bounded read-only support checks without starting Codex.
    #[arg(long)]
    full: bool,
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
    #[error("background package operation failed ({code}): {message}")]
    Plugin { code: String, message: String },
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
    #[error("Windows 10 main-process inspector failed during {operation}: {details}")]
    MainInspector {
        operation: &'static str,
        details: String,
    },
    #[error("Codex debugging endpoint did not become available: {0}")]
    CdpStartup(String),
    #[error("no compatible Codex renderer target was found: {0}")]
    CdpTarget(String),
    #[error(transparent)]
    ProcessGuard(#[from] ProcessGuardError),
    #[error(transparent)]
    Recovery(#[from] launch_recovery::RecoveryError),
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
    #[error("the activated Codex process exited with status {code} (0x{code:08X})")]
    ProcessExited { code: u32 },
    #[error("the installation diagnostic result could not be serialized")]
    DiagnosticSerialization,
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
        Commands::Plugins { .. } => "plugins",
    };
    if mode != "diagnose" || matches!(&command, Commands::Diagnose(args) if args.full) {
        runtime_log::begin(mode);
    }
    begin_startup_trace(mode);
    let result = match command {
        Commands::Run(args) => run(args).await,
        Commands::Attach(args) => attach(args).await,
        Commands::Activate(args) => activate(args).await,
        Commands::Diagnose(args) => diagnose(args).await,
        Commands::Plugins { import_dir } => {
            let result = if let Some(directory) = import_dir {
                plugin_store::import_directory(&directory)
            } else {
                plugin_store::status()
            };
            result
                .map(|value| println!("{value}"))
                .map_err(|error| AppError::Plugin {
                    code: error.code,
                    message: error.message,
                })
        }
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
            let checks = automatic_failure_checks(&error).await;
            let mut diagnostic = enrich_startup_diagnostic(&error);
            diagnostic.reason.push_str(&checks);
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

#[cfg(test)]
mod supervisor_exit_tests {
    use super::*;
    #[test]
    fn normal_exit_preserves_transport_history_without_a_fatal_popup() {
        assert!(
            reconcile_supervisor_exit(Err(CdpError::EndpointUnavailable.into()), Some(0)).is_ok()
        );
        assert!(
            reconcile_supervisor_exit(Err(CdpError::IncompatibleRenderer.into()), Some(0)).is_ok()
        );
        assert!(reconcile_supervisor_exit(Err(CdpError::WebSocket.into()), None).is_err());
    }
    #[test]
    fn nonzero_exit_and_security_failures_are_not_hidden() {
        assert!(matches!(
            reconcile_supervisor_exit(Err(CdpError::EndpointUnavailable.into()), Some(23)),
            Err(AppError::Launch(LaunchFailure::ProcessExited { code: 23 }))
        ));
        assert!(
            reconcile_supervisor_exit(Err(CdpError::EndpointIdentityMismatch.into()), Some(0))
                .is_err()
        );
        assert!(reconcile_supervisor_exit(Err(CdpError::Protocol.into()), Some(0)).is_err());
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
    AttachedProcess(Arc<AttachedProcess>),
}

#[cfg(test)]
mod win10_compat_integration_tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    async fn renderer_fixture(qualified: bool) -> (CdpEndpoint, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                tokio::spawn(async move {
                    let mut peek = [0; 4096];
                    let n =
                        match tokio::time::timeout(Duration::from_secs(3), stream.peek(&mut peek))
                            .await
                        {
                            Ok(Ok(n)) if n > 0 => n,
                            _ => return,
                        };
                    let request = String::from_utf8_lossy(&peek[..n]);
                    if request.contains("/fixture") {
                        let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
                        if let Some(Ok(Message::Text(text))) = ws.next().await {
                            let request: Value = serde_json::from_str(&text).unwrap();
                            assert_eq!(request["method"], "Runtime.evaluate");
                            ws.send(Message::Text(json!({"id":request["id"],"result":{"result":{"value":{"diagnosticVersion":4,"accepted":qualified,"topFrame":true,"appOrigin":true,"readyState":"complete"}}}}).to_string().into())).await.unwrap();
                        }
                    } else {
                        let version = request.starts_with("GET /json/version");
                        let mut buffer = [0; 4096];
                        let _ = stream.read(&mut buffer).await;
                        let body=if version {json!({"Browser":"Fixture","Protocol-Version":"1.3"})} else {json!([{"id":"fixture","type":"page","title":"Codex","url":"app://-/index.html","webSocketDebuggerUrl":format!("ws://127.0.0.1:{port}/fixture")}])}.to_string();
                        stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
                    }
                });
            }
        });
        (CdpEndpoint::loopback(port), task)
    }
    #[tokio::test]
    async fn win10_fallback_uses_verified_ready_renderer_but_not_tcp_alone() {
        let (renderer, server) = renderer_fixture(true).await;
        let reservation = PortReservation::reserve().unwrap();
        let main = reservation.port().unwrap();
        reservation.release();
        let result = wait_for_win10_inspector(
            CdpEndpoint::loopback(main),
            renderer,
            std::process::id(),
            SystemTime::UNIX_EPOCH,
            Duration::from_secs(8),
        )
        .await;
        server.abort();
        assert!(matches!(result, Ok(false)), "{result:?}");
        let (renderer, server) = renderer_fixture(false).await;
        let result = wait_for_win10_inspector(
            CdpEndpoint::loopback(main),
            renderer,
            std::process::id(),
            SystemTime::UNIX_EPOCH,
            Duration::from_millis(2200),
        )
        .await;
        server.abort();
        assert!(result.is_err(), "unqualified UI must not allow fallback");
    }
    #[tokio::test]
    async fn win10_foreign_main_listener_is_rejected_and_has_precise_support_code() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = CdpEndpoint::loopback(listener.local_addr().unwrap().port());
        let error = wait_for_win10_inspector(
            endpoint,
            endpoint,
            u32::MAX,
            SystemTime::UNIX_EPOCH,
            Duration::from_secs(1),
        )
        .await
        .unwrap_err();
        assert_eq!(error.startup_diagnostic().code, "CC-START-MAIN-010");
    }
    #[test]
    fn new_inspector_classifications_have_distinct_codes() {
        for (operation, code) in [
            ("main inspector activation process exited", "008"),
            ("main inspector arguments not honored", "009"),
            ("main inspector foreign listener", "010"),
            ("main inspector listener unreachable", "011"),
            ("main inspector listener absent", "012"),
            ("main inspector evidence unavailable", "013"),
            ("main inspector TCP access denied", "014"),
            ("main inspector renderer verification failed", "015"),
        ] {
            let diagnostic = AppError::MainInspector {
                operation,
                details: "observed test condition".into(),
            }
            .startup_diagnostic();
            assert_eq!(diagnostic.code, format!("CC-START-MAIN-{code}"));
            assert_eq!(diagnostic.reason, "observed test condition");
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticReport {
    codex: Value,
    app_server: Value,
    ui_bundle: Value,
    cdp: Value,
}

#[cfg(test)]
mod tests {

    #[tokio::test]
    async fn inspector_timeout_retains_port_budget_attempts_and_os_error() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let error = wait_for_tcp_listener(CdpEndpoint::loopback(port), Duration::from_millis(40))
            .await
            .unwrap_err();
        let detail = error.to_string();
        for field in [
            "main inspector TCP",
            "timeoutMs=40",
            "elapsedMs=",
            "attempts=",
        ] {
            assert!(detail.contains(field), "{detail}");
        }
        assert!(detail.contains(&format!("port={port}")));
        assert!(
            (detail.contains("ioKind=") && detail.contains("osCode="))
                || detail.contains("attemptBudgetMs=")
        );
        let diagnostic = AppError::MainInspector {
            operation: "waiting for main inspector TCP listener",
            details: detail.clone(),
        }
        .startup_diagnostic();
        assert_eq!(diagnostic.code, "CC-START-MAIN-001");
        assert!(diagnostic.stage.contains("Windows 10"));
        assert_eq!(diagnostic.reason, detail);
    }
    #[test]
    fn contextual_errors_keep_specific_support_codes() {
        let diagnostic = AppError::Resolver(ResolverError::Io.context(
            "writing App Server request",
            "ioKind=BrokenPipe; requestNumber=4",
        ))
        .startup_diagnostic();
        assert_eq!(diagnostic.code, "CC-START-APP-005");
        assert!(diagnostic.reason.contains("BrokenPipe"));
        let diagnostic = AppError::Bootstrap(
            BootstrapError::InvalidBundle.context("reading UI bundle", "ioKind=PermissionDenied"),
        )
        .startup_diagnostic();
        assert_eq!(diagnostic.code, "CC-START-UI-002");
        assert!(diagnostic.reason.contains("PermissionDenied"));
        let diagnostic = AppError::Discovery(
            DiscoveryError::AppServerNotFound
                .context("staging official App Server", "cause=access denied"),
        )
        .startup_diagnostic();
        assert!(diagnostic.reason.contains("staging official"));
    }

    #[test]
    fn early_animation_bundle_is_isolated_and_rejects_late_replay() {
        assert!(super::early_startup::SOURCE.len() < 512 * 1024);
        assert!(!super::early_startup::SOURCE.contains("__CODE_CODEX_BOOTSTRAP__"));
        assert!(!super::early_startup::SOURCE.contains("explorer.context"));
        assert!(super::early_startup::SOURCE.contains("app:"));
        assert!(super::early_startup::SOURCE.contains("/index.html"));
        assert!(super::early_startup::SOURCE.contains("plugin-modules:v1"));
        assert!(super::early_startup::SOURCE.contains("codex-startup-transition"));
        assert!(!super::early_startup::SOURCE.contains("data-app-shell-main-surface"));
        assert!(super::early_startup::SOURCE.contains("early-startup-entry:v2"));
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

    #[tokio::test]
    async fn process_failure_preserves_snapshot_and_reads_version_without_dom_probe() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let _guard = process_diagnostics::TEST_TRACE_LOCK.lock().unwrap();
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().await.expect("accept");
                let mut request = [0u8; 2048];
                let count = socket.read(&mut request).await.expect("read");
                if count > 0 {
                    assert!(
                        String::from_utf8_lossy(&request[..count]).starts_with("GET /json/version")
                    );
                    let body = format!(
                        r#"{{"Browser":"Chrome/123.0","Protocol-Version":"1.3","webSocketDebuggerUrl":"ws://127.0.0.1:{port}/devtools/browser/fixture"}}"#
                    );
                    socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.expect("response");
                }
            }
        });
        begin_startup_trace("fixture");
        record_launch_context(port, None, std::process::id());
        record_precleanup_probe("Process: PID 21904 has exited".into());
        tokio::time::timeout(Duration::from_secs(3), complete_startup_failure_probe())
            .await
            .expect("bounded probe");
        server.await.expect("server");
        let trace = startup_trace().lock().expect("trace");
        let text = trace.precleanup_probe.as_deref().expect("snapshot");
        assert!(text.contains("PID 21904 has exited"));
        assert!(text.contains("TCP: loopback connection accepted"));
        assert!(text.contains("GET /json/version: responded"), "{text}");
        assert!(text.contains("skipped because listener ownership was not verified"));
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
        let _guard = process_diagnostics::TEST_TRACE_LOCK.lock().unwrap();
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
        assert_eq!(codes.len(), 6);
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
    fn query_failure_keeps_process_code_and_observations_in_copy_details() {
        let _guard = process_diagnostics::TEST_TRACE_LOCK.lock().unwrap();
        begin_startup_trace("fixture");
        process_diagnostics::observe(
            "listener ownership",
            "Get-NetTCPConnection",
            "failed",
            json!({"exceptionType":"CimException","hresult":-2147024891,"port":52346}),
        );
        let error = AppError::from(ProcessGuardError::Detailed(
            "listener ownership query failed: fixture".into(),
        ));
        let diagnostic = enrich_startup_diagnostic(&error);
        assert_eq!(diagnostic.code, "CC-START-PROCESS-006");
        assert!(diagnostic.reason.contains("Get-NetTCPConnection"));
        assert!(diagnostic.reason.contains("-2147024891"));
        let decoded =
            startup_diagnostics::parse_diagnostic(&diagnostic.encoded_line().expect("marker"))
                .expect("decoded");
        assert_eq!(decoded, diagnostic);
        let error = AppError::from(ProcessGuardError::Detailed("process identity query failed: last_phase=required activation fields; error=process identity is unavailable; same PID native recovery failed: exited\nActivation failure assessment:\nOS exit status=0x00000017; possible handoff not proven".into()));
        let diagnostic = enrich_startup_diagnostic(&error);
        assert_eq!(diagnostic.code, "CC-START-PROCESS-005");
        assert!(diagnostic.reason.contains("OS exit status=0x00000017"));
        assert!(
            diagnostic
                .reason
                .contains("process identity is unavailable")
        );
        assert_eq!(
            startup_diagnostics::parse_diagnostic(&diagnostic.encoded_line().expect("marker"))
                .expect("decoded"),
            diagnostic
        );
        assert_eq!(
            process_diagnostic(&ProcessGuardError::Detailed(
                "existing process query failed".into()
            ))
            .0,
            "CC-START-PROCESS-011"
        );
        assert_eq!(
            process_diagnostic(&ProcessGuardError::Detailed(
                "listener discovery query failed".into()
            ))
            .0,
            "CC-START-PROCESS-012"
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

#[cfg(test)]
#[allow(unused_imports)]
mod test_imports {
    pub(super) use crate::bootstrap::{BootstrapError, build_bootstrap, resolve_bundle};
    pub(super) use crate::bridge::NativeBridge;
    pub(super) use crate::discovery::{
        AppServerSourceKind, ChannelPreference, CodexInstallation, DiscoveryError, DiscoverySource,
        discover_app_server_source, discover_codex, is_supported_version,
        prepare_app_server_launch,
    };
    pub(super) use crate::process_guard::{
        AttachedProcess, CodexProcessGuard, PortReservation, ProcessGuardError,
        discover_listener_port, is_executable_running, launched_process_state,
        verify_listener_executable, verify_listener_owner,
    };
    pub(super) use crate::startup_diagnostics::StartupDiagnostic;
    pub(super) use async_trait::async_trait;
    pub(super) use cdp_client::{
        CapabilityToken, CdpEndpoint, CdpError, CdpSupervisor, IdlePolicy, InjectionConfig,
        PRIMARY_BINDING_NAME, PRIMARY_RECEIVER_NAME, SupervisorOptions, SupervisorProgress,
        TargetDiscovery, TargetFilter,
    };
    pub(super) use clap::{Args, Parser, Subcommand, ValueEnum};
    pub(super) use context_resolver::{AppServerClient, AppServerCommand, ResolverError};
    pub(super) use futures_util::{SinkExt, StreamExt};
    pub(super) use serde::{Deserialize, Serialize};
    pub(super) use serde_json::{Value, json};
    pub(super) use std::path::PathBuf;
    pub(super) use std::process::{ExitCode, Stdio};
    pub(super) use std::sync::{Arc, Mutex, OnceLock};
    pub(super) use std::time::SystemTime;
    pub(super) use std::time::{Duration, Instant};
    pub(super) use thiserror::Error;
    pub(super) use tokio::net::TcpStream;
    pub(super) use tokio::process::Command;
    pub(super) use tokio_tungstenite::tungstenite::Message;
    pub(super) use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
    pub(super) use tokio_tungstenite::{
        MaybeTlsStream, WebSocketStream, connect_async_with_config,
    };
    pub(super) use tokio_util::sync::CancellationToken;
    pub(super) use tracing_subscriber::EnvFilter;
    pub(super) use url::Url;
    pub(super) use workspace_service::{SettingsStore, Workspace, WorkspaceError};
}
#[cfg(test)]
#[allow(unused_imports)]
use test_imports::*;

// Domain modules keep the original public and wire contracts.
#[path = "app/diagnostics.rs"]
mod app_diagnostics;

#[cfg(test)]
use app_diagnostics::process_only_snapshot_does_not_suppress_endpoint_diagnostics;
use app_diagnostics::{
    automatic_failure_checks, begin_startup_trace, cdp_diagnostic, complete_startup_failure_probe,
    diagnose, diagnose_cdp, enrich_startup_diagnostic, failure_probe_complete, launch_diagnostic,
    live_launch_snapshot, process_diagnostic, publish_startup_diagnostic, record_launch_context,
    record_listener_verified, record_precleanup_probe, record_renderer_port, record_startup_event,
    record_supervisor_progress, redacted_codex_diagnostic, safe_layout_scalar, safe_layout_summary,
    safe_layout_tag, safe_target_location, startup_trace, startup_trace_report,
    target_discovery_snapshot, workspace_diagnostic,
};
#[path = "app/runtime.rs"]
mod app_runtime;

use app_runtime::{
    activate, attach, default_run_args, prepare_runtime, reconcile_supervisor_exit, run,
    startup_timeout_for_idle_policy, supervise,
};
#[path = "app/endpoints.rs"]
mod app_endpoints;

use app_endpoints::{
    build_launch_arguments, validate_extra_arguments, wait_for_endpoint, wait_for_launched_endpoint,
};
#[path = "platform/windows/compat.rs"]
mod platform_windows_compat;

#[cfg(any(windows, not(windows)))]
use platform_windows_compat::needs_windows_10_surface_patch;
#[cfg(test)]
use platform_windows_compat::wait_for_tcp_listener;
use platform_windows_compat::{
    DISABLE_DIRECT_COMPOSITION_ARGUMENT, ELECTRON_MAIN_TRANSPARENCY_PATCH, ElectronMainPatchResult,
    MAIN_INSPECTOR_COMMAND_TIMEOUT, MAIN_INSPECTOR_MESSAGE_BYTES, MAIN_INSPECTOR_MESSAGE_LIMIT,
    MAIN_INSPECTOR_SHUTDOWN_TIMEOUT, MAIN_INSPECTOR_STARTUP_TIMEOUT, MainInspectorSession,
    MainInspectorSocket, initialize_electron_main_process, is_debugger_paused_event,
    main_listener_evidence, nt_build_needs_windows_10_surface_patch, paused_call_frame_id,
    receive_main_inspector_json, validate_main_inspector_target, verify_owned_listener,
    wait_for_main_inspector_target, wait_for_tcp_listener_closed, wait_for_win10_inspector,
    win10_renderer_ready,
};
