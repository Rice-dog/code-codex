use crate::{early_startup, launch_recovery, process_diagnostics, runtime_log, win10_compat};

use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use std::time::SystemTime;

use crate::bootstrap::{build_bootstrap, resolve_bundle};
use crate::bridge::NativeBridge;
use cdp_client::{
    CapabilityToken, CdpEndpoint, CdpError, CdpSupervisor, IdlePolicy, InjectionConfig,
    PRIMARY_BINDING_NAME, PRIMARY_RECEIVER_NAME, SupervisorOptions, SupervisorProgress,
};

use crate::discovery::{
    ChannelPreference, CodexInstallation, DiscoveryError, DiscoverySource,
    discover_app_server_source, discover_codex, is_supported_version, prepare_app_server_launch,
};
use context_resolver::{AppServerClient, AppServerCommand};

use crate::process_guard::{
    AttachedProcess, CodexProcessGuard, PortReservation, ProcessGuardError, discover_listener_port,
    is_executable_running, launched_process_state, verify_listener_executable,
    verify_listener_owner,
};

use serde_json::json;

use tokio::process::Command;

use tokio_util::sync::CancellationToken;

#[cfg(any(windows, not(windows)))]
use super::needs_windows_10_surface_patch;
use super::{
    ActivateArgs, AppError, AttachArgs, CommonArgs, LaunchFailure, ListenerIdentity,
    ProcessEndpointVerifier, RunArgs, build_launch_arguments, initialize_electron_main_process,
    live_launch_snapshot, publish_startup_diagnostic, record_launch_context,
    record_listener_verified, record_precleanup_probe, record_renderer_port, record_startup_event,
    record_supervisor_progress, startup_trace, validate_extra_arguments, wait_for_endpoint,
    wait_for_launched_endpoint,
};
use workspace_service::{SettingsStore, Workspace, WorkspaceError};

pub(super) fn default_run_args() -> RunArgs {
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
        login_startup: false,
    }
}

pub(super) async fn run(args: RunArgs) -> Result<(), AppError> {
    if args.login_startup && !crate::login_startup::status().is_ok_and(|state| state.enabled) {
        record_startup_event("login startup", "disabled or unverified registration; queued login launch skipped");
        return Ok(());
    }
    record_startup_event("arguments", "validating launch arguments");
    validate_extra_arguments(&args.codex_args)?;
    record_startup_event("discovery", "finding official Codex installation");
    let installation = discover_codex(
        args.codex_exe.as_deref(),
        args.codex_version.as_deref(),
        args.channel,
    )?;
    record_startup_event("discovery", "official Codex installation found");
    process_diagnostics::observe(
        "startup",
        "official runtime",
        "discovered",
        json!({"officialVersion":installation.version,"channel":installation.channel,"source":installation.source,"launcherVersion":env!("CARGO_PKG_VERSION")}),
    );

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
        if installation.source != DiscoverySource::WindowsPackageManager {
            return Err(AppError::AlreadyRunning);
        }
        record_startup_event("existing process", "offering consent-based graceful restart");
        match crate::startup_conflict::resolve(&installation.executable)
            .await
            .map_err(AppError::StartupConflict)?
        {
            crate::startup_conflict::Outcome::Cancelled => {
                record_startup_event("existing process", "restart cancelled; existing Codex preserved");
                return Ok(());
            }
            crate::startup_conflict::Outcome::Managed => {
                if args.login_startup {
                    record_startup_event("existing process", "login launch skipped; existing debug-managed Codex preserved");
                    return Ok(());
                }
                return Err(AppError::AlreadyRunning);
            }
            crate::startup_conflict::Outcome::ReadyWithPreferenceWarning => {
                // Only persistence failed, after the inspected process exited.
                // Keep the same fresh process check and normal launch path.
                record_startup_event("existing process", "restart preference persistence not confirmed; continuing this launch");
                runtime_log::record("launcher", "startup restart preference", "warning", json!({
                    "code":"CC-START-PREF-001",
                    "launchContinues":true,
                    "consentPersistence":"not confirmed",
                    "nextLaunch":"re-read stored consent; never infer permission from this warning"
                }));
                tracing::warn!(code="CC-START-PREF-001", "Restart preference persistence could not be confirmed; this launch continues and future launches re-check stored consent");
            }
            crate::startup_conflict::Outcome::Ready => {}
        }
        if is_executable_running(&installation.executable)? {
            return Err(AppError::AlreadyRunning);
        }
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
    let windows_10 = needs_windows_10_surface_patch();
    let request_main_inspector = if windows_10 {
        let image = installation.executable.clone();
        let capability =
            tokio::task::spawn_blocking(move || win10_compat::inspect_capability(&image)).await;
        let request = capability
            .as_ref()
            .map_or(true, |c| c.should_request_inspector());
        process_diagnostics::observe(
            "Windows10 compatibility",
            "official inspector capability",
            if request {
                "patch requested"
            } else {
                "opaque fallback"
            },
            json!({"officialVersion":installation.version,"capability":capability.as_ref().ok(),"workerFailed":capability.is_err(),"surfacePatchApplied":false,"requestMainInspector":request,"officialImageModified":false}),
        );
        record_startup_event(
            "Windows10 compatibility",
            if request {
                "main inspector capability enabled or unknown; requesting surface patch"
            } else {
                "native runtime or disabled inspector; continuing without Electron surface patch or inspect-brk"
            },
        );
        request
    } else {
        false
    };
    let main_inspector_reservation = if request_main_inspector {
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
    if windows_10 {
        process_diagnostics::observe(
            "Windows10 compatibility",
            "requested debug switches",
            "prepared",
            json!({"rendererPort":port,"mainInspectorPort":main_inspector_port,"inspectBreakRequested":request_main_inspector,"opaqueSurface":!request_main_inspector,"officialVersion":installation.version,"argumentsOmitted":true}),
        );
    }
    reservation.release();
    if let Some(reservation) = main_inspector_reservation {
        reservation.release();
    }
    let mut launched_after = SystemTime::now();
    record_startup_event("Codex activation", "starting official process");
    let mut early_player = None;
    let mut child = if installation.source == DiscoverySource::WindowsPackageManager {
        let package_full_name = installation
            .package_full_name
            .clone()
            .ok_or(LaunchFailure::MissingPackageIdentity)?;
        let aumid = installation
            .app_user_model_id
            .clone()
            .ok_or(LaunchFailure::MissingApplicationId)?;
        let result = launch_recovery::launch_package(
            package_full_name,
            aumid,
            launch_arguments,
            installation.executable.clone(),
            port,
            main_inspector_port,
            startup_enabled,
        )
        .await;
        let (mut child, after, worker) = match result {
            Ok(value) => value,
            Err(error) => {
                let pid = startup_trace().lock().ok().and_then(|t| t.launched_pid);
                process_diagnostics::native_observation(
                    "activation recovery failed before cleanup",
                    Some(port),
                    pid,
                );
                if let Some(pid) = pid {
                    let image = installation.executable.clone();
                    let observations = tokio::task::spawn_blocking(move || {
                        process_diagnostics::activation_failure_details(
                            pid,
                            port,
                            &image,
                            launched_after,
                        )
                    })
                    .await
                    .unwrap_or_else(|_| "Final observations unavailable".into());
                    record_precleanup_probe(format!(
                        "Recovery decision: {error}\nFinal observations after releasing the unarmed helper:\n{observations}"
                    ));
                }
                return Err(error.into());
            }
        };
        launched_after = after;
        early_player = worker;
        if child.arm_package_termination().await.is_err() {
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
            let patched = initialize_electron_main_process(main_inspector_endpoint, endpoint, launched_pid, launched_after).await?;
            record_startup_event("main inspector", if patched { "surface patch initialized" } else { "verified native UI ready; continuing with opaque surface fallback" });
            tracing::info!(event = "electron_main_transparency_result", surface_patch_applied = patched);
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
        .map_err(|error|ProcessGuardError::OwnershipUnknown.context("run ownership worker",error))??;
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
                child.exit_code().map_err(|error| LaunchFailure::ProcessWait {
                    os_code: error.raw_os_error(), kind: error.kind(),
                })?;
                supervisor_result
            }
        }
    }
    .await;
    let supervisor_started = startup_trace()
        .lock()
        .is_ok_and(|trace| trace.supervisor_progress.is_some());
    // A transport failure can win the select at the same time as process exit.
    // Reconcile against the retained activation handle before any cleanup.
    let result = if supervisor_started {
        match child.exit_code() {
            Ok(code) => reconcile_supervisor_exit(result, code),
            Err(error) => {
                runtime_log::record(
                    "startup",
                    "exit status",
                    "unavailable",
                    json!({"ioKind":format!("{:?}",error.kind()),"osCode":error.raw_os_error()}),
                );
                result
            }
        }
    } else {
        result
    };
    record_startup_event(
        if supervisor_started {
            "renderer supervisor"
        } else {
            "launch preparation"
        },
        if result.is_err() { "failed" } else { "ended" },
    );
    if result.is_err() {
        if let Err(error) = &result {
            publish_startup_diagnostic(
                error,
                "\nAutomatic self-check: preserving live-launch evidence before cleanup.\n",
            );
        }
        process_diagnostics::native_observation("pre-cleanup", Some(port), Some(launched_pid));
        let snapshot = tokio::time::timeout(
            Duration::from_secs(8),
            live_launch_snapshot(endpoint, main_inspector_port, launched_pid),
        )
        .await;
        record_precleanup_probe(snapshot.unwrap_or_else(|_|format!("Process: {}\nLive-launch supplementary probes timed out after 8 seconds; preceding native observations retained.",launched_process_state(launched_pid))));
    }
    let result = match result {
        Err(AppError::Cdp(CdpError::NoCompatibleTarget | CdpError::IncompatibleRenderer)) => {
            Err(AppError::CdpTarget("Renderer qualification failed; see the pre-cleanup live-launch check below for candidate details.".to_owned()))
        }
        other => other,
    };
    record_startup_event("cleanup", "terminating launched Codex process");
    child.terminate().await;
    record_startup_event(
        "cleanup",
        "process guard termination returned; inspect observed state",
    );
    process_diagnostics::observe(
        "cleanup",
        "activation PID after termination",
        "observed",
        process_diagnostics::native_process(launched_pid),
    );
    if result.is_err() {
        process_diagnostics::native_observation("post-cleanup", Some(port), Some(launched_pid));
    }
    drop(early_player);
    result
}

pub(super) fn reconcile_supervisor_exit(
    result: Result<(), AppError>,
    exit_code: Option<u32>,
) -> Result<(), AppError> {
    let transport_or_qualification = match &result {
        Ok(()) => true,
        Err(AppError::Cdp(error)) => matches!(
            error.kind(),
            CdpError::EndpointUnavailable
                | CdpError::WebSocket
                | CdpError::NoCompatibleTarget
                | CdpError::IncompatibleRenderer
        ),
        _ => false,
    };
    match exit_code {
        Some(0) if transport_or_qualification => {
            let previous = result.as_ref().err().map(ToString::to_string);
            runtime_log::record(
                "startup",
                "activation process exit",
                "normal",
                json!({"exitCode":0,"priorSupervisorError":previous,"errorPopup":false,"pluginMountedNotInferred":true}),
            );
            record_startup_event(
                "process exit",
                "normal exit; renderer supervision ended without an error popup",
            );
            Ok(())
        }
        Some(code) if code != 0 && transport_or_qualification => {
            runtime_log::record(
                "startup",
                "activation process exit",
                "failed",
                json!({"exitCode":code,"priorSupervisorError":result.as_ref().err().map(ToString::to_string)}),
            );
            Err(LaunchFailure::ProcessExited { code }.into())
        }
        _ => result,
    }
}

pub(super) async fn attach(args: AttachArgs) -> Result<(), AppError> {
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
        runtime_log::record(
            "launcher",
            "live activation",
            "skipped",
            json!({"code":"CC-INSTALL-ACTIVATE-008","reason":"official-package-required","version":env!("CARGO_PKG_VERSION")}),
        );
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
        .map_err(|error| {
            ProcessGuardError::OwnershipUnknown.context("attach ownership worker", error)
        })??;
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
        .map_err(|error| {
            ProcessGuardError::OwnershipUnknown.context("attach ownership worker", error)
        })??;
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

pub(super) async fn activate(args: ActivateArgs) -> Result<(), AppError> {
    record_startup_event(
        "discovery",
        "finding official Codex installation for activation",
    );
    let installation = discover_codex(None, None, args.channel)?;
    record_startup_event("discovery", "installation found");
    if installation.source != DiscoverySource::WindowsPackageManager {
        runtime_log::record(
            "launcher",
            "live activation",
            "skipped",
            json!({"code":"CC-INSTALL-ACTIVATE-008","reason":"official-package-required","version":env!("CARGO_PKG_VERSION")}),
        );
        tracing::info!(
            event = "live_activation_skipped",
            reason = "official_package_required"
        );
        return Ok(());
    }
    let executable = installation.executable.clone();
    let port = tokio::task::spawn_blocking(move || discover_listener_port(&executable))
        .await
        .map_err(|error| {
            ProcessGuardError::OwnershipUnknown.context("activate ownership worker", error)
        })??;
    let Some(port) = port else {
        let running = is_executable_running(&installation.executable).ok();
        runtime_log::record(
            "launcher",
            "live activation",
            "skipped",
            json!({"code":if running==Some(true){"CC-INSTALL-ACTIVATE-007"}else{"CC-INSTALL-ACTIVATE-004"},"reason":if running==Some(true){"official-process-running-without-verified-listener"}else{"no-verified-running-target"},"officialProcessRunning":running,"version":env!("CARGO_PKG_VERSION")}),
        );
        tracing::info!(
            event = "live_activation_skipped",
            reason = "no_verified_listener"
        );
        return Ok(());
    };
    let endpoint = CdpEndpoint::loopback(port);
    let executable = installation.executable.clone();
    let observed_process = Arc::new(
        tokio::task::spawn_blocking(move || AttachedProcess::for_listener(port, &executable))
            .await
            .map_err(|e| {
                ProcessGuardError::OwnershipUnknown.context("activate lifetime observer", e)
            })??,
    );
    runtime_log::record(
        "launcher",
        "activation lifetime",
        "attached",
        json!({"code":"CC-SESSION-OWNER-001","pid":observed_process.pid(),"retainedHandle":true,"terminationRights":false,"idlePolicy":"recover-until-process-exit"}),
    );
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
        .map_err(|error| {
            ProcessGuardError::OwnershipUnknown.context("activate ownership worker", error)
        })??;
    record_listener_verified();
    record_startup_event("listener ownership", "verified official executable");
    tracing::info!(
        event = "live_activation_started",
        port,
        version = env!("CARGO_PKG_VERSION")
    );
    record_startup_event("renderer discovery", "activation supervisor started");
    let cancellation = CancellationToken::new();
    let supervisor = supervise(
        endpoint,
        bridge,
        injection,
        ListenerIdentity::AttachedProcess(observed_process.clone()),
        false,
        IdlePolicy::RecoverUntilCancelled,
        cancellation.clone(),
    );
    tokio::pin!(supervisor);
    tokio::select! {
        result = &mut supervisor => result,
        result = observed_process.wait_for_exit() => {
            cancellation.cancel();
            let stopped = supervisor.await;
            match result {
                Ok(code) => runtime_log::record("launcher","activation lifetime","official-process-exited",json!({"code":"CC-SESSION-OWNER-002","pid":observed_process.pid(),"exitCode":code,"officialProcessTerminatedByCodeCodex":false})),
                Err(error) => {
                    runtime_log::record("launcher","activation lifetime","failed",json!({"code":"CC-SESSION-OWNER-003","pid":observed_process.pid(),"reason":error.to_string(),"observationUnknownNotExit":true}));
                    return Err(error.into());
                }
            }
            stopped
        }
    }
}

pub(super) async fn prepare_runtime(
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

pub(super) async fn supervise(
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

pub(super) fn startup_timeout_for_idle_policy(idle_policy: IdlePolicy) -> Duration {
    match idle_policy {
        IdlePolicy::RecoverUntilCancelled => Duration::from_secs(120),
        IdlePolicy::ExitAfterTimeout => Duration::from_secs(30),
    }
}
