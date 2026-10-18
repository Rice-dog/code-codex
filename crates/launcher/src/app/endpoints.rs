use crate::process_diagnostics;

use async_trait::async_trait;
use std::time::{Duration, Instant};

use cdp_client::{CdpEndpoint, CdpError, TargetDiscovery};

use crate::process_guard::{
    launched_process_state, verify_listener_executable, verify_listener_owner,
};

use serde_json::json;

use tokio::net::TcpStream;

use super::{
    AppError, DISABLE_DIRECT_COMPOSITION_ARGUMENT, ListenerIdentity, ProcessEndpointVerifier,
};

#[async_trait]
impl cdp_client::EndpointVerifier for ProcessEndpointVerifier {
    async fn verify(&self, endpoint: CdpEndpoint) -> Result<(), CdpError> {
        let verification = match &self.identity {
            ListenerIdentity::AttachedProcess(process) => {
                let process = process.clone();
                let port = endpoint.port();
                tokio::task::spawn_blocking(move || process.verify_listener(port))
            }
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

pub(super) async fn wait_for_endpoint(
    endpoint: CdpEndpoint,
    timeout: Duration,
) -> Result<(), CdpError> {
    let discovery = TargetDiscovery::new()?;
    let started = Instant::now();
    let mut attempts = 0u32;
    loop {
        attempts += 1;
        let last = match discovery.version(endpoint).await {
            Ok(version) if version.is_supported() => return Ok(()),
            Ok(version) => {
                return Err(CdpError::UnsupportedProtocol.context(
                    "checking renderer CDP protocol",
                    format!(
                        "port={}; observedProtocol={}; expectedProtocol=1.3",
                        endpoint.port(),
                        version.protocol_version
                    ),
                ));
            }
            Err(error) => error.to_string(),
        };
        if started.elapsed() >= timeout {
            return Err(CdpError::EndpointUnavailable.context("waiting for attached renderer CDP endpoint",format!("port={}; path=/json/version; timeoutMs={}; elapsedMs={}; attempts={attempts}; lastResult={last}",endpoint.port(),timeout.as_millis(),started.elapsed().as_millis())));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

/// Preserve the observations from this exact launch. A separate `diagnose`
/// process cannot know the randomly selected port after the launcher exits.
pub(super) async fn wait_for_launched_endpoint(
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
            process_diagnostics::observe(
                "startup",
                "renderer endpoint readiness",
                "failed",
                json!({"pid":launched_pid,"port":endpoint.port(),"elapsedMs":started.elapsed().as_millis(),"requests":attempts,"processState":process_state,"lastCdpResult":last_error,"tcpState":tcp_state,"processIdentityIsNotPageReadiness":true}),
            );
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

pub(super) fn validate_extra_arguments(arguments: &[String]) -> Result<(), AppError> {
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

pub(super) fn build_launch_arguments(
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
