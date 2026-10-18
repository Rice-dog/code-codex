use futures_util::{SinkExt, StreamExt};

use std::error::Error as _;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use tokio_tungstenite::connect_async_with_config;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;

use super::{
    CdpError, CdpTarget, MAX_DISCOVERY_RESPONSE_BYTES, RENDERER_LAYOUT_PROBE, parse_cdp_message,
    send_command,
};
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CdpEndpoint {
    pub(super) port: u16,
}

impl CdpEndpoint {
    #[must_use]
    pub const fn loopback(port: u16) -> Self {
        Self { port }
    }

    #[must_use]
    pub const fn port(self) -> u16 {
        self.port
    }

    pub(super) fn http_url(self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BrowserVersion {
    #[serde(default, rename = "Browser", alias = "browser")]
    pub browser: String,
    #[serde(
        default,
        rename = "Protocol-Version",
        alias = "protocolVersion",
        alias = "protocol_version"
    )]
    pub protocol_version: String,
    #[serde(default, rename = "webSocketDebuggerUrl")]
    pub web_socket_debugger_url: Option<String>,
}

impl BrowserVersion {
    #[must_use]
    pub fn is_supported(&self) -> bool {
        self.protocol_version == "1.3"
    }
}

#[derive(Clone)]
pub struct TargetDiscovery {
    pub(super) client: reqwest::Client,
}

impl TargetDiscovery {
    pub fn new() -> Result<Self, CdpError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| CdpError::InvalidEndpoint)?;
        Ok(Self { client })
    }

    pub async fn version(&self, endpoint: CdpEndpoint) -> Result<BrowserVersion, CdpError> {
        self.get_json(endpoint.http_url("/json/version")).await
    }

    /// Include the local HTTP/OS cause for a startup report without exposing
    /// any response body or weakening the normal fail-closed CDP API.
    pub async fn version_detailed(&self, endpoint: CdpEndpoint) -> Result<BrowserVersion, String> {
        self.get_json_detailed(endpoint.http_url("/json/version"))
            .await
            .map_err(|(_, detail)| detail)
    }

    pub async fn targets(&self, endpoint: CdpEndpoint) -> Result<Vec<CdpTarget>, CdpError> {
        self.get_json(endpoint.http_url("/json/list")).await
    }

    pub async fn targets_detailed(&self, endpoint: CdpEndpoint) -> Result<Vec<CdpTarget>, String> {
        self.get_json_detailed(endpoint.http_url("/json/list"))
            .await
            .map_err(|(_, detail)| detail)
    }

    /// Read-only, bounded diagnostics for a target on the verified launch port.
    /// The expression returns only counts and booleans, never page text or URLs.
    pub async fn renderer_layout_diagnostics(
        &self,
        endpoint: CdpEndpoint,
        target: &CdpTarget,
    ) -> Result<Value, CdpError> {
        let websocket_url =
            Url::parse(&target.web_socket_debugger_url).map_err(|_| CdpError::InvalidEndpoint)?;
        if websocket_url.scheme() != "ws"
            || websocket_url.host_str() != Some("127.0.0.1")
            || websocket_url.port() != Some(endpoint.port())
        {
            return Err(CdpError::InvalidEndpoint);
        }
        const DIAGNOSTIC_PROBE: &str = include_str!("../renderer-layout-diagnostic.js");
        let expression = DIAGNOSTIC_PROBE.replace("__PREDICATE__", RENDERER_LAYOUT_PROBE);
        let probe = async {
            let config = WebSocketConfig::default()
                .max_message_size(Some(64 * 1024))
                .max_frame_size(Some(64 * 1024));
            let (mut socket, _) =
                connect_async_with_config(&target.web_socket_debugger_url, Some(config), false)
                    .await
                    .map_err(|error| {
                        CdpError::WebSocket.context("WebSocket connection or receive", error)
                    })?;
            send_command(
                &mut socket,
                1,
                "Runtime.evaluate",
                json!({
                    "expression": expression,
                    "returnByValue": true
                }),
            )
            .await?;
            for _ in 0..32 {
                let message = socket
                    .next()
                    .await
                    .ok_or(CdpError::WebSocket)?
                    .map_err(|error| {
                        CdpError::WebSocket.context("WebSocket connection or receive", error)
                    })?;
                let Message::Text(text) = message else {
                    continue;
                };
                let response = parse_cdp_message(text.as_ref())?;
                if response.get("id").and_then(Value::as_u64) != Some(1) {
                    continue;
                }
                if response.get("error").is_some() {
                    return Err(CdpError::Protocol);
                }
                return response
                    .pointer("/result/result/value")
                    .filter(|value| value.is_object())
                    .cloned()
                    .ok_or(CdpError::Protocol);
            }
            Err(CdpError::Protocol)
        };
        tokio::time::timeout(Duration::from_secs(3), probe)
            .await
            .map_err(|_| CdpError::WebSocket)?
    }

    pub(super) async fn get_json<T>(&self, url: String) -> Result<T, CdpError>
    where
        T: serde::de::DeserializeOwned,
    {
        self.get_json_detailed(url)
            .await
            .map_err(|(error, detail)| error.context("CDP HTTP discovery", detail))
    }

    pub(super) async fn get_json_detailed<T>(&self, url: String) -> Result<T, (CdpError, String)>
    where
        T: serde::de::DeserializeOwned,
    {
        let mut response = self.client.get(url).send().await.map_err(|error| {
            let mut detail = error.to_string();
            let mut source = error.source();
            for _ in 0..4 {
                let Some(cause) = source else { break };
                detail.push_str("; caused by: ");
                detail.push_str(&cause.to_string());
                source = cause.source();
            }
            detail = detail.chars().take(1024).collect();
            (CdpError::EndpointUnavailable, detail)
        })?;
        if !response.status().is_success() {
            return Err((
                CdpError::EndpointUnavailable,
                format!(
                    "HTTP {} returned status {}",
                    response.url().path(),
                    response.status()
                ),
            ));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_DISCOVERY_RESPONSE_BYTES as u64)
        {
            return Err((
                CdpError::InvalidEndpoint,
                "CDP response exceeded the size limit".to_owned(),
            ));
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|error| {
            (
                CdpError::InvalidEndpoint,
                format!("CDP response body failed: {error}"),
            )
        })? {
            if body.len().saturating_add(chunk.len()) > MAX_DISCOVERY_RESPONSE_BYTES {
                return Err((
                    CdpError::InvalidEndpoint,
                    "CDP response exceeded the size limit".to_owned(),
                ));
            }
            body.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&body).map_err(|error| {
            (
                CdpError::InvalidEndpoint,
                format!("CDP response was not valid JSON: {error}"),
            )
        })
    }
}
