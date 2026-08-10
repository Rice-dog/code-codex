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
use futures_util::{SinkExt, StreamExt};
use process_guard::{
    CodexProcessGuard, PortReservation, ProcessGuardError, is_executable_running,
    verify_listener_executable, verify_listener_owner, verify_process_identity,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
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
    let (bridge, injection) = prepare_runtime(
        &args.common,
        Some(&installation),
        &installation.version,
        &installation.channel,
        compatible,
    )
    .await?;

    let launch_arguments = build_launch_arguments(port, main_inspector_port, &args.codex_args);
    reservation.release();
    if let Some(reservation) = main_inspector_reservation {
        reservation.release();
    }
    let launched_after = SystemTime::now();
    let mut child = if installation.source == DiscoverySource::WindowsPackageManager {
        let package_full_name = installation
            .package_full_name
            .clone()
            .ok_or(AppError::Launch)?;
        let app_user_model_id = installation
            .app_user_model_id
            .clone()
            .ok_or(AppError::Launch)?;
        let mut child = CodexProcessGuard::activate_package(
            package_full_name,
            app_user_model_id,
            launch_arguments,
        )
        .await
        .map_err(|_| AppError::Launch)?;
        let launched_pid = child.pid();
        let official_executable = installation.executable.clone();
        let identity_result = tokio::task::spawn_blocking(move || {
            verify_process_identity(launched_pid, launched_after, &official_executable)
        })
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)?;
        if let Err(error) = identity_result {
            child.terminate().await;
            return Err(error.into());
        }
        if child.arm_package_termination().await.is_err() {
            child.terminate().await;
            return Err(AppError::Launch);
        }
        child
    } else {
        let mut command = Command::new(&installation.executable);
        command
            .args(launch_arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        CodexProcessGuard::spawn(command).map_err(|_| AppError::Launch)?
    };
    let launched_pid = child.pid();
    tracing::info!(event = "codex_launched", channel = %installation.channel);

    let result = async {
        if let Some(main_inspector_endpoint) = main_inspector_endpoint {
            initialize_electron_main_process(main_inspector_endpoint, launched_pid, launched_after)
                .await?;
            tracing::info!(event = "electron_main_transparency_initialized");
        }
        wait_for_endpoint(endpoint, Duration::from_secs(30)).await?;
        tokio::task::spawn_blocking(move || {
            verify_listener_owner(port, launched_pid, launched_after)
        })
        .await
        .map_err(|_| ProcessGuardError::OwnershipUnknown)??;
        tracing::info!(event = "cdp_owner_verified");
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
