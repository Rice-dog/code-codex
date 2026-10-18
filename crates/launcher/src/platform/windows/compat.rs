use crate::{process_diagnostics, win10_compat};
use futures_util::{SinkExt, StreamExt};

use std::time::SystemTime;
use std::time::{Duration, Instant};

use cdp_client::{CdpEndpoint, CdpError, TargetDiscovery};

use crate::process_guard::{ProcessGuardError, verify_listener_owner};
use serde::Deserialize;
use serde_json::{Value, json};

use tokio::net::TcpStream;

use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async_with_config};

use url::Url;

use super::{AppError, main, record_startup_event};

pub(super) const DISABLE_DIRECT_COMPOSITION_ARGUMENT: &str = "--disable-direct-composition";

pub(super) const MAIN_INSPECTOR_MESSAGE_BYTES: usize = 256 * 1024;

pub(super) const MAIN_INSPECTOR_MESSAGE_LIMIT: usize = 4_096;

pub(super) const MAIN_INSPECTOR_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) const MAIN_INSPECTOR_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) const MAIN_INSPECTOR_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) const ELECTRON_MAIN_TRANSPARENCY_PATCH: &str = r#"(() => {
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

pub(super) type MainInspectorSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(super) struct MainInspectorSession {
    pub(super) socket: MainInspectorSocket,
    pub(super) pending_paused_event: Option<Value>,
}

impl MainInspectorSession {
    pub(super) fn new(socket: MainInspectorSocket) -> Self {
        Self {
            socket,
            pending_paused_event: None,
        }
    }

    pub(super) async fn command(
        &mut self,
        id: u64,
        method: &str,
        params: Value,
    ) -> Result<Value, CdpError> {
        let command = serde_json::to_string(&json!({
            "id": id,
            "method": method,
            "params": params
        }))
        .map_err(|error| {
            CdpError::Protocol.context(
                "main inspector command encoding",
                format!("method={method}; commandId={id}; cause={error}"),
            )
        })?;
        self.socket
            .send(Message::Text(command.into()))
            .await
            .map_err(|error| {
                CdpError::WebSocket.context("main inspector WebSocket transport", error)
            })?;

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
                        return Err(CdpError::Protocol.context("main inspector command response",format!("method={method}; commandId={id}; remoteCode={:?}; exceptionPresent={}; response body omitted",message.pointer("/error/code").and_then(Value::as_i64),message.pointer("/result/exceptionDetails").is_some())));
                    }
                    return message.get("result").cloned().ok_or_else(||CdpError::Protocol.context("main inspector command response",format!("method={method}; commandId={id}; missing result")));
                }
                if message.get("method").and_then(Value::as_str).is_some() {
                    if is_debugger_paused_event(&message) {
                        if self.pending_paused_event.replace(message).is_some() {
                            return Err(CdpError::Protocol.context("main inspector message validation","unexpected command/event shape or duplicate pause; protocol payload omitted"));
                        }
                    }
                    continue;
                }
                return Err(CdpError::Protocol.context("main inspector message validation","unexpected command/event shape or duplicate pause; protocol payload omitted"));
            }
            Err(CdpError::Protocol.context("main inspector message budget",format!("maxMessages={MAIN_INSPECTOR_MESSAGE_LIMIT}; expected response not received")))
        })
        .await
        .map_err(|error| CdpError::Protocol.context("main inspector command reply timeout",format!("method={method}; commandId={id}; timeoutMs={}; cause={error}",MAIN_INSPECTOR_COMMAND_TIMEOUT.as_millis())))?
    }

    pub(super) async fn wait_for_paused_call_frame(&mut self) -> Result<String, CdpError> {
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
                    return Err(CdpError::Protocol.context("main inspector message validation","unexpected command/event shape or duplicate pause; protocol payload omitted"));
                }
            }
            Err(CdpError::Protocol.context("main inspector message budget",format!("maxMessages={MAIN_INSPECTOR_MESSAGE_LIMIT}; expected response not received")))
        })
        .await
        .map_err(|error| {
            CdpError::Protocol.context(
                "waiting for main inspector Debugger.paused",
                format!(
                    "timeoutMs={}; cause={error}",
                    MAIN_INSPECTOR_STARTUP_TIMEOUT.as_millis()
                ),
            )
        })?
    }
}

#[cfg(windows)]
pub(super) fn needs_windows_10_surface_patch() -> bool {
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
pub(super) const fn needs_windows_10_surface_patch() -> bool {
    false
}

pub(super) const fn nt_build_needs_windows_10_surface_patch(major: u32, build: u32) -> bool {
    major == 10 && build < 22_000
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ElectronMainPatchResult {
    pub(super) surface_hook_enabled: bool,
    pub(super) constructor_hook_count: u64,
}

pub(super) async fn initialize_electron_main_process(
    endpoint: CdpEndpoint,
    renderer: CdpEndpoint,
    launched_pid: u32,
    launched_after: SystemTime,
) -> Result<bool, AppError> {
    let result: Result<bool, AppError> = async {
        if !wait_for_win10_inspector(
            endpoint,
            renderer,
            launched_pid,
            launched_after,
            MAIN_INSPECTOR_STARTUP_TIMEOUT,
        )
        .await?
        {
            return Ok(false);
        }
        verify_owned_listener(endpoint, launched_pid, launched_after).await?;

        let target =
            wait_for_main_inspector_target(endpoint, MAIN_INSPECTOR_STARTUP_TIMEOUT).await?;
        let websocket_url = validate_main_inspector_target(endpoint, &target)?;
        let websocket_config = WebSocketConfig::default()
            .max_message_size(Some(MAIN_INSPECTOR_MESSAGE_BYTES))
            .max_frame_size(Some(MAIN_INSPECTOR_MESSAGE_BYTES));
        let (mut socket, _) =
            connect_async_with_config(websocket_url.as_str(), Some(websocket_config), false)
                .await
                .map_err(|error| {
                    CdpError::WebSocket.context("main inspector WebSocket transport", error)
                })?;

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
        let patch: ElectronMainPatchResult =
            serde_json::from_value(evaluation.pointer("/result/value").cloned().ok_or_else(
                || {
                    CdpError::Protocol.context(
                        "validating main inspector patch result",
                        "missing result.value",
                    )
                },
            )?)
            .map_err(|error| {
                CdpError::Protocol.context(
                    "decoding main inspector patch status",
                    format!(
                        "category={:?}; line={}; column={}",
                        error.classify(),
                        error.line(),
                        error.column()
                    ),
                )
            })?;
        if !patch.surface_hook_enabled {
            return Err(CdpError::Protocol
                .context(
                    "validating Windows10 surface hook",
                    "surfaceHookEnabled=false",
                )
                .into());
        }
        tracing::debug!(
            event = "electron_main_transparency_patch_applied",
            constructor_hook_count = patch.constructor_hook_count
        );
        wait_for_tcp_listener_closed(endpoint, MAIN_INSPECTOR_SHUTDOWN_TIMEOUT).await?;
        Ok(true)
    }
    .await;
    result.map_err(|error| {
        if matches!(error, AppError::MainInspector { .. }) {
            return error;
        }
        let operation = match &error {
            AppError::Cdp(CdpError::Context { operation, .. }) => *operation,
            AppError::ProcessGuard(_) => "verifying main inspector listener owner",
            _ => "initializing main-process surface patch",
        };
        AppError::MainInspector {
            operation,
            details: format!(
                "Role: Windows10 main inspector; port={}; launchedPid={}\n{}",
                endpoint.port(),
                launched_pid,
                error
            ),
        }
    })
}

pub(super) async fn receive_main_inspector_json(
    socket: &mut MainInspectorSocket,
) -> Result<Value, CdpError> {
    loop {
        match socket.next().await {
            Some(Ok(Message::Text(text))) => {
                let message: Value = serde_json::from_str(text.as_ref()).map_err(|error| {
                    CdpError::Protocol.context(
                        "parsing main inspector JSON",
                        format!(
                            "line={}; column={}; category={:?}",
                            error.line(),
                            error.column(),
                            error.classify()
                        ),
                    )
                })?;
                if !message.is_object() {
                    return Err(CdpError::Protocol
                        .context("validating main inspector frame", "expected JSON object"));
                }
                return Ok(message);
            }
            Some(Ok(Message::Ping(payload))) => socket
                .send(Message::Pong(payload))
                .await
                .map_err(|error| CdpError::WebSocket.context("main inspector Ping reply", error))?,
            Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(close))) => {
                return Err(CdpError::WebSocket.context(
                    "main inspector receive",
                    format!(
                        "peer closeCode={:?}; peer reason omitted",
                        close.map(|frame| u16::from(frame.code))
                    ),
                ));
            }
            None => {
                return Err(CdpError::WebSocket.context(
                    "main inspector receive",
                    "stream ended without command reply",
                ));
            }
            Some(Ok(_)) => {
                return Err(CdpError::Protocol
                    .context("main inspector receive", "unexpected non-JSON frame"));
            }
            Some(Err(error)) => {
                return Err(CdpError::WebSocket.context("main inspector receive", error));
            }
        }
    }
}

pub(super) fn is_debugger_paused_event(message: &Value) -> bool {
    message.get("method").and_then(Value::as_str) == Some("Debugger.paused")
}

pub(super) fn paused_call_frame_id(message: &Value) -> Result<String, CdpError> {
    let call_frame_id = message
        .pointer("/params/callFrames/0/callFrameId")
        .and_then(Value::as_str)
        .filter(|call_frame_id| !call_frame_id.is_empty() && call_frame_id.len() <= 1_024)
        .ok_or_else(|| {
            CdpError::Protocol.context(
                "validating main inspector paused call frame",
                "callFrameId missing, empty or longer than 1024 bytes",
            )
        })?;
    Ok(call_frame_id.to_owned())
}

pub(super) async fn verify_owned_listener(
    endpoint: CdpEndpoint,
    launched_pid: u32,
    launched_after: SystemTime,
) -> Result<(), AppError> {
    let port = endpoint.port();
    tokio::task::spawn_blocking(move || verify_listener_owner(port, launched_pid, launched_after))
        .await
        .map_err(|error| {
            ProcessGuardError::OwnershipUnknown
                .context("verify_owned_listener ownership worker", error)
        })??;
    Ok(())
}

pub(super) async fn main_listener_evidence(port: u16) -> String {
    let result = tokio::task::spawn_blocking(move || win10_compat::listeners(port)).await;
    let value = match result {
        Ok(Ok(rows)) => json!({"port":port,"ipv4AndIpv6Complete":true,"listeners":rows}),
        other => json!({"port":port,"ipv4AndIpv6Complete":false,"reason":format!("{other:?}")}),
    };
    process_diagnostics::observe(
        "main inspector",
        "supplementary native listeners",
        "observed",
        value.clone(),
    );
    format!("Main inspector native listener evidence: {value}")
}

pub(super) async fn win10_renderer_ready(
    renderer: CdpEndpoint,
    pid: u32,
    launched_after: SystemTime,
) -> Result<bool, AppError> {
    // A TCP/version response alone can be produced before a usable app exists.
    // Only the normal trusted URL + existing structural qualification proves
    // the native UI has progressed beyond the initial inspector break.
    verify_owned_listener(renderer, pid, launched_after)
        .await
        .map_err(|e| AppError::MainInspector {
            operation: "main inspector renderer verification failed",
            details: format!(
                "rendererPort={}; originalPid={pid}; cause={e}",
                renderer.port()
            ),
        })?;
    let discovery = TargetDiscovery::new()?;
    let version = match discovery.version(renderer).await {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    if !version.is_supported() {
        return Ok(false);
    }
    let targets = match discovery.targets(renderer).await {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    for target in targets
        .into_iter()
        .filter(|t| t.target_type == "page" && t.url == "app://-/index.html")
        .take(4)
    {
        match discovery
            .renderer_layout_diagnostics(renderer, &target)
            .await
        {
            Ok(value) => {
                let summary = win10_compat::layout_summary(&value);
                process_diagnostics::observe(
                    "Windows10 compatibility",
                    "read-only renderer readiness",
                    "observed",
                    summary.clone(),
                );
                if summary["accepted"] == true
                    && summary["topFrame"] == true
                    && summary["appOrigin"] == true
                    && matches!(
                        summary["readyState"].as_str(),
                        Some("interactive" | "complete")
                    )
                {
                    verify_owned_listener(renderer, pid, launched_after)
                        .await
                        .map_err(|e| AppError::MainInspector {
                            operation: "main inspector renderer verification failed",
                            details: format!(
                                "renderer ownership recheck failed: port={}; cause={e}",
                                renderer.port()
                            ),
                        })?;
                    return Ok(true);
                }
            }
            Err(e) => process_diagnostics::observe(
                "Windows10 compatibility",
                "read-only renderer readiness",
                "unavailable",
                json!({"reason":e.to_string(),"pageDataRetained":false}),
            ),
        }
    }
    Ok(false)
}

pub(super) async fn wait_for_win10_inspector(
    endpoint: CdpEndpoint,
    renderer: CdpEndpoint,
    pid: u32,
    launched_after: SystemTime,
    timeout: Duration,
) -> Result<bool, AppError> {
    let started = Instant::now();
    let mut attempts = 0u32;
    let mut refused = 0u32;
    let mut timed_out = 0u32;
    let mut denied = 0u32;
    let mut last = "no connection attempted".to_owned();
    let mut next_checkpoint = Duration::ZERO;
    let mut args = None;
    let main_port = endpoint.port();
    let renderer_port = renderer.port();
    // This auxiliary CIM query must not delay TCP readiness or add its retry
    // budget to the inspector's 30-second wait.
    let mut argument_task = Some(tokio::task::spawn_blocking(move || {
        win10_compat::arguments(pid, main_port, renderer_port)
    }));
    let mut checkpoint = 0;
    loop {
        let elapsed = started.elapsed();
        if elapsed >= next_checkpoint || elapsed >= timeout {
            let port = endpoint.port();
            let evidence = tokio::task::spawn_blocking(move || {
                (
                    win10_compat::listeners(port),
                    process_diagnostics::native_process(pid),
                )
            })
            .await;
            let (table, process) = evidence.unwrap_or_else(|e| {
                (
                    Err(format!("native observation worker failed: {e}")),
                    json!({"state":"unknown"}),
                )
            });
            if argument_task
                .as_ref()
                .is_some_and(|task| task.is_finished())
            {
                match argument_task.take().expect("finished argument task").await {
                    Ok(Ok(summary)) => {
                        process_diagnostics::observe(
                            "main inspector",
                            "actual debug switches",
                            "observed",
                            json!(&summary),
                        );
                        args = Some(summary);
                    }
                    other => {
                        process_diagnostics::observe(
                            "main inspector",
                            "actual debug switches",
                            "unavailable",
                            json!({"reason":format!("{other:?}"),"fullCommandLineRetained":false}),
                        );
                    }
                }
            }
            let running = process["state"] == "running";
            let exited = process["state"] == "exited";
            let foreign = table
                .as_ref()
                .is_ok_and(|rows| rows.iter().any(|r| r.pid != pid));
            let operation = if foreign {
                "main inspector foreign listener"
            } else if !running && !exited {
                "main inspector evidence unavailable"
            } else {
                win10_compat::classify(pid, running, &table, args.as_ref())
            };
            let observations = json!({"port":port,"rendererPort":renderer.port(),"originalPid":pid,"elapsedMs":started.elapsed().as_millis(),"tcpWaitBudgetMs":timeout.as_millis(),"readinessProbeBudgetMs":8000,"attempts":attempts,"connectionRefused":refused,"attemptTimeouts":timed_out,"accessDenied":denied,"lastConnection":last,"listenerSnapshot":table.as_ref().ok(),"listenerQueryError":table.as_ref().err(),"process":process,"actualSwitches":args,"actualSwitchSummaryStatus":if args.is_some(){"observed"}else if argument_task.is_some(){"pending"}else{"unavailable"},"observedClassification":operation,"rootCause":"not inferred from TCP outcome"});
            process_diagnostics::observe(
                "main inspector",
                "listener checkpoint",
                "observed",
                observations.clone(),
            );
            let fatal = exited || foreign;
            if fatal {
                return Err(AppError::MainInspector {
                    operation,
                    details: observations.to_string(),
                });
            }
            if started.elapsed() >= Duration::from_secs(2)
                && running
                && table.as_ref().is_ok_and(Vec::is_empty)
            {
                let ready = tokio::time::timeout(
                    Duration::from_secs(8),
                    win10_renderer_ready(renderer, pid, launched_after),
                )
                .await;
                match ready {
                    Ok(Err(e)) => return Err(e),
                    Ok(Ok(true)) => {
                        let final_evidence = tokio::task::spawn_blocking(move || {
                            (
                                win10_compat::listeners(port),
                                process_diagnostics::native_process(pid),
                            )
                        })
                        .await;
                        if let Ok((final_table, final_process)) = final_evidence {
                            if win10_compat::may_fallback(
                                final_process["state"] == "running",
                                &final_table,
                                true,
                            ) {
                                record_startup_event(
                                    "Windows10 compatibility",
                                    "main inspector absent; authorized renderer UI ready; opaque fallback accepted",
                                );
                                process_diagnostics::observe(
                                    "Windows10 compatibility",
                                    "surface fallback",
                                    "accepted",
                                    json!({"mainPort":port,"rendererPort":renderer.port(),"originalPid":pid,"surfacePatchApplied":false,"nativeUiQualified":true,"mainListenerAbsentInBothFamilies":true,"ownershipVerifiedTwice":true,"opaqueSurface":true,"elapsedMs":started.elapsed().as_millis()}),
                                );
                                return Ok(false);
                            }
                        }
                    }
                    _ => {}
                }
                process_diagnostics::observe(
                    "Windows10 compatibility",
                    "surface fallback",
                    "not proven",
                    json!({"mainPort":port,"rendererPort":renderer.port(),"reason":"qualified native renderer readiness and final listener/process recheck were not all established","surfacePatchApplied":false}),
                );
            }
            if started.elapsed() >= timeout {
                let operation = if denied > 0 && table.as_ref().is_ok_and(Vec::is_empty) {
                    "main inspector TCP access denied"
                } else {
                    operation
                };
                record_startup_event("main inspector TCP listener", operation);
                return Err(AppError::MainInspector {
                    operation,
                    details: format!(
                        "Role: Windows10 main inspector; timeoutMs={}; elapsedMs={}; observations={observations}; fallback=not established",
                        timeout.as_millis(),
                        started.elapsed().as_millis()
                    ),
                });
            }
            checkpoint += 1;
            next_checkpoint = match checkpoint {
                1 => Duration::from_secs(2),
                2 => Duration::from_secs(5),
                3 => Duration::from_secs(15),
                _ => timeout,
            };
        }
        attempts = attempts.saturating_add(1);
        let budget = timeout
            .saturating_sub(started.elapsed())
            .min(Duration::from_millis(500));
        if budget.is_zero() {
            continue;
        }
        match tokio::time::timeout(budget, TcpStream::connect(("127.0.0.1", endpoint.port()))).await
        {
            Ok(Ok(_)) => return Ok(true),
            Ok(Err(e)) => {
                if e.kind() == std::io::ErrorKind::ConnectionRefused {
                    refused += 1;
                }
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    denied += 1;
                }
                last = format!(
                    "ioKind={:?}; osCode={:?}; cause={e}",
                    e.kind(),
                    e.raw_os_error()
                );
            }
            Err(_) => {
                timed_out += 1;
                last = format!("attempt timeout; attemptBudgetMs={}", budget.as_millis());
            }
        }
        tokio::time::sleep(
            Duration::from_millis(100).min(timeout.saturating_sub(started.elapsed())),
        )
        .await;
    }
}

#[cfg(test)]
pub(super) async fn wait_for_tcp_listener(
    endpoint: CdpEndpoint,
    timeout: Duration,
) -> Result<(), CdpError> {
    let started = Instant::now();
    let mut attempts = 0u32;
    loop {
        attempts = attempts.saturating_add(1);
        let remaining = timeout.saturating_sub(started.elapsed());
        let budget = remaining.min(Duration::from_millis(500));
        let last =
            match tokio::time::timeout(budget, TcpStream::connect(("127.0.0.1", endpoint.port())))
                .await
            {
                Ok(Ok(_)) => return Ok(()),
                Ok(Err(error)) => format!(
                    "ioKind={:?}; osCode={:?}; cause={error}",
                    error.kind(),
                    error.raw_os_error()
                ),
                Err(_) => format!(
                    "TCP attempt timed out; attemptBudgetMs={}",
                    budget.as_millis()
                ),
            };
        if started.elapsed() >= timeout {
            let detail = format!(
                "port={}; timeoutMs={}; elapsedMs={}; attempts={attempts}; lastConnection={last}",
                endpoint.port(),
                timeout.as_millis(),
                started.elapsed().as_millis()
            );
            record_startup_event("main inspector TCP listener", "TCP listener wait timed out");
            process_diagnostics::observe(
                "main inspector",
                "TCP listener wait",
                "failed",
                json!({"code":"CC-START-MAIN-001","port":endpoint.port(),"timeoutMs":timeout.as_millis(),"elapsedMs":started.elapsed().as_millis(),"attempts":attempts,"reason":detail}),
            );
            return Err(CdpError::EndpointUnavailable
                .context("waiting for main inspector TCP listener", detail));
        }
        tokio::time::sleep(
            Duration::from_millis(100).min(timeout.saturating_sub(started.elapsed())),
        )
        .await;
    }
}

pub(super) async fn wait_for_tcp_listener_closed(
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
            return Err(CdpError::Protocol.context(
                "waiting for main inspector listener shutdown",
                format!(
                    "port={}; timeoutMs={}; elapsedMs={}; listener still accepted TCP",
                    endpoint.port(),
                    timeout.as_millis(),
                    started.elapsed().as_millis()
                ),
            ));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

pub(super) async fn wait_for_main_inspector_target(
    endpoint: CdpEndpoint,
    timeout: Duration,
) -> Result<cdp_client::CdpTarget, CdpError> {
    let discovery = TargetDiscovery::new()?;
    let started = Instant::now();
    let mut attempts = 0u32;
    loop {
        attempts += 1;
        let last = match discovery.targets(endpoint).await {
            Ok(mut targets) if targets.len() == 1 => return Ok(targets.remove(0)),
            Ok(targets) if targets.len() > 1 => {
                return Err(CdpError::InvalidEndpoint.context(
                    "selecting main inspector target",
                    format!(
                        "port={}; observedTargets={}; expectedTargets=1",
                        endpoint.port(),
                        targets.len()
                    ),
                ));
            }
            Ok(_) => "target list is empty".to_owned(),
            Err(error) => error.to_string(),
        };
        if started.elapsed() >= timeout {
            return Err(CdpError::EndpointUnavailable.context(
                "waiting for main inspector target",
                format!(
                    "port={}; timeoutMs={}; elapsedMs={}; attempts={attempts}; lastResult={last}",
                    endpoint.port(),
                    timeout.as_millis(),
                    started.elapsed().as_millis()
                ),
            ));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

pub(super) fn validate_main_inspector_target(
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
