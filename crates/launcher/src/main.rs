mod bootstrap;
mod bridge;
mod discovery;
mod exit_codes;
mod process_guard;

use std::path::PathBuf;
use std::process::{ExitCode, Stdio};
use std::sync::Arc;
use std::time::SystemTime;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bootstrap::{BootstrapError, build_bootstrap, resolve_bundle};
use bridge::NativeBridge;
use cdp_client::{
    CapabilityToken, CdpEndpoint, CdpError, CdpSupervisor, IdlePolicy, InjectionConfig,
    SupervisorOptions, TargetDiscovery,
};
use clap::{Args, Parser, Subcommand, ValueEnum};
use context_resolver::{AppServerClient, AppServerCommand, ResolverError};
use discovery::{
    AppServerSourceKind, ChannelPreference, CodexInstallation, DiscoveryError, DiscoverySource,
    discover_app_server_source, discover_codex, is_supported_version, prepare_app_server_launch,
};
use process_guard::{
    CodexChildGuard, PortReservation, ProcessGuardError, is_executable_running,
    verify_listener_executable, verify_listener_owner,
};
use serde::Serialize;
use serde_json::{Value, json};
use thiserror::Error;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;
use workspace_service::{SettingsStore, Workspace, WorkspaceError};

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
    #[error(transparent)]
    ProcessGuard(#[from] ProcessGuardError),
    #[error("this Codex Desktop version is not in the compatibility matrix")]
    UnsupportedVersion,
    #[error("Codex Desktop could not be launched")]
    Launch,
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

impl AppError {
    const fn exit_code(&self) -> u8 {
        match self {
            Self::UnsupportedVersion => exit_codes::UNSUPPORTED_VERSION,
            Self::AlreadyRunning => exit_codes::ALREADY_RUNNING,
            Self::Discovery(_)
            | Self::Bootstrap(_)
            | Self::Workspace(_)
            | Self::Resolver(_)
            | Self::Launch => exit_codes::STARTUP_FAILURE,
            Self::Cdp(_)
            | Self::ProcessGuard(_)
            | Self::InvalidLaunchArgument
            | Self::UnverifiedAttach
            | Self::AttachMetadataMismatch => exit_codes::GENERIC_FAILURE,
        }
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    initialize_logging(cli.log_format);
    let result = match cli
        .command
        .unwrap_or_else(|| Commands::Run(default_run_args()))
    {
        Commands::Run(args) => run(args).await,
        Commands::Attach(args) => attach(args).await,
        Commands::Diagnose(args) => diagnose(args).await,
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(event = "launcher_failed", error = %error);
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
    validate_extra_arguments(&args.codex_args)?;
    let installation = discover_codex(
        args.codex_exe.as_deref(),
        args.codex_version.as_deref(),
        args.channel,
    )?;
    let compatible = is_supported_version(&installation.version);
    if !compatible && !args.allow_unsupported_version {
        return Err(AppError::UnsupportedVersion);
    }
    if is_executable_running(&installation.executable)? {
        return Err(AppError::AlreadyRunning);
    }

    let reservation = PortReservation::reserve()?;
    let port = reservation.port()?;
    let endpoint = CdpEndpoint::loopback(port);
    let (bridge, injection) = prepare_runtime(
        &args.common,
        Some(&installation),
        &installation.version,
        &installation.channel,
        compatible,
    )
    .await?;

    let mut command = Command::new(&installation.executable);
    command
        .arg("--remote-debugging-address=127.0.0.1")
        .arg(format!("--remote-debugging-port={port}"))
        .args(&args.codex_args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    reservation.release();
    let launched_after = SystemTime::now();
    let mut child = CodexChildGuard::spawn(command).map_err(|_| AppError::Launch)?;
    let launched_pid = child.pid();
    tracing::info!(event = "codex_launched", channel = %installation.channel);

    let result = async {
        wait_for_endpoint(endpoint, Duration::from_secs(30)).await?;
        tokio::task::spawn_blocking(move || {
            verify_listener_owner(port, launched_pid, launched_after)
        })
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
        tracing::info!(event = "cdp_owner_verified");
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
        tokio::pin!(supervisor);
        tokio::select! {
            biased;
            supervisor_result = &mut supervisor => supervisor_result,
            job_result = child.wait_for_exit() => {
                cancellation.cancel();
                let supervisor_result = supervisor.await;
                job_result.map_err(|_| AppError::Launch)?;
                supervisor_result
            }
        }
    }
    .await;
    child.terminate().await;
    result
}

async fn attach(args: AttachArgs) -> Result<(), AppError> {
    let preference = match args.channel.to_ascii_lowercase().as_str() {
        "beta" => ChannelPreference::Beta,
        "stable" => ChannelPreference::Stable,
        _ => ChannelPreference::Any,
    };
    let installation = discover_codex(None, None, preference)?;
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
    let executable = installation.executable.clone();
    tokio::task::spawn_blocking(move || verify_listener_executable(args.port, &executable))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    wait_for_endpoint(endpoint, Duration::from_secs(5)).await?;
    let (bridge, injection) = prepare_runtime(
        &args.common,
        Some(&installation),
        &installation.version,
        &installation.channel,
        compatible,
    )
    .await?;
    let executable = installation.executable.clone();
    tokio::task::spawn_blocking(move || verify_listener_executable(args.port, &executable))
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
    tracing::info!(event = "authorized_cdp_attach");
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

async fn prepare_runtime(
    common: &CommonArgs,
    installation: Option<&CodexInstallation>,
    version: &str,
    channel: &str,
    compatible: bool,
) -> Result<(Arc<NativeBridge>, InjectionConfig), AppError> {
    let bundle = resolve_bundle(common.ui_bundle.as_deref())?;
    let token = CapabilityToken::generate();
    let bootstrap = build_bootstrap(
        &bundle,
        &token,
        version,
        channel,
        compatible,
        common.workspace.is_some(),
    )?;

    let manual_workspace = if let Some(root) = common.workspace.clone() {
        Some(Arc::new(
            tokio::task::spawn_blocking(move || Workspace::open(root))
                .await
                .map_err(|_| WorkspaceError::Internal)??,
        ))
    } else {
        None
    };
    let resolver = if manual_workspace.is_none() {
        let source = discover_app_server_source(common.app_server.as_deref(), installation)?;
        let launch = prepare_app_server_launch(source)?;
        let mut command = AppServerCommand::codex(launch.executable());
        if let Some(current_dir) = launch.hardened_working_directory() {
            let trusted_path = launch
                .sanitized_path()
                .ok_or(DiscoveryError::AppServerNotFound)?;
            command = command.with_isolated_windows_search(current_dir, trusted_path);
        }
        Some(AppServerClient::connect_guarded(&command, launch).await?)
    } else {
        None
    };
    let settings_store = SettingsStore::for_current_user()?;
    let store = settings_store.clone();
    let settings = tokio::task::spawn_blocking(move || store.load())
        .await
        .map_err(|_| WorkspaceError::Internal)??;
    let bridge = Arc::new(NativeBridge::new(
        resolver,
        manual_workspace,
        settings_store,
        settings,
    ));
    bridge.initialize_manual().await;
    let injection = InjectionConfig::new(bootstrap, token);
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

fn validate_extra_arguments(arguments: &[String]) -> Result<(), AppError> {
    if arguments.iter().any(|argument| {
        let lower = argument.to_ascii_lowercase();
        lower.starts_with("--remote-debugging") || lower.starts_with("--remote-allow-origins")
    }) {
        return Err(AppError::InvalidLaunchArgument);
    }
    Ok(())
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
    let output = serde_json::to_string_pretty(&report).map_err(|_| AppError::Launch)?;
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
    use super::*;

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
        assert_eq!(AppError::Launch.exit_code(), exit_codes::STARTUP_FAILURE);
        assert_eq!(
            AppError::InvalidLaunchArgument.exit_code(),
            exit_codes::GENERIC_FAILURE
        );
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
