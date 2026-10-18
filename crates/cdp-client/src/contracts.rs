use rand::RngCore;

use std::fmt;
use std::sync::Arc;

use std::sync::atomic::AtomicBool;

use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use constant_time_eq::constant_time_eq;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use super::{CdpEndpoint, PRIMARY_BINDING_NAME, PRIMARY_RECEIVER_NAME};

#[derive(Debug, Clone, Error)]
pub enum CdpError {
    #[error("{operation}: {error}; {detail}")]
    Context {
        operation: &'static str,
        detail: String,
        #[source]
        error: Box<CdpError>,
    },
    #[error("the CDP endpoint is unavailable")]
    EndpointUnavailable,
    #[error("the CDP endpoint returned invalid data")]
    InvalidEndpoint,
    #[error("the CDP protocol version is not supported")]
    UnsupportedProtocol,
    #[error("no compatible Codex renderer target was found")]
    NoCompatibleTarget,
    #[error("more than one Codex renderer target matched the supported layout")]
    AmbiguousRenderer,
    #[error("the CDP endpoint exposed too many renderer targets")]
    TooManyTargets,
    #[error("the target does not contain the supported Codex renderer layout")]
    IncompatibleRenderer,
    #[error("the renderer WebSocket endpoint was rejected")]
    InvalidWebSocketEndpoint,
    #[error("the CDP listener identity changed or could not be verified")]
    EndpointIdentityMismatch,
    #[error("the renderer WebSocket connection failed")]
    WebSocket,
    #[error("the CDP session returned invalid protocol data")]
    Protocol,
    #[error("renderer qualification response timed out")]
    QualificationTimeout,
}

impl CdpError {
    pub fn context(self, operation: &'static str, detail: impl std::fmt::Display) -> Self {
        Self::Context {
            operation,
            detail: detail.to_string().chars().take(2048).collect(),
            error: Box::new(self),
        }
    }
    pub fn kind(&self) -> &Self {
        match self {
            Self::Context { error, .. } => error.kind(),
            other => other,
        }
    }
}

/// Random per-launch bearer capability. Debug formatting never reveals it.
#[derive(Clone, PartialEq, Eq)]
pub struct CapabilityToken(pub(super) Arc<str>);

impl CapabilityToken {
    #[must_use]
    pub fn generate() -> Self {
        let mut bytes = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        Self(Arc::from(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// Intended only for constructing the trusted injected bootstrap.
    #[must_use]
    pub fn expose(&self) -> &str {
        &self.0
    }

    pub(super) fn matches(&self, candidate: &str) -> bool {
        constant_time_eq(self.0.as_bytes(), candidate.as_bytes())
    }
}

impl fmt::Debug for CapabilityToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CapabilityToken([REDACTED])")
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CdpTarget {
    pub id: String,
    #[serde(rename = "type")]
    pub target_type: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub web_socket_debugger_url: String,
}

#[derive(Debug, Clone, Default)]
pub struct TargetFilter {
    pub allow_any_page: bool,
}

impl TargetFilter {
    #[must_use]
    pub fn accepts(&self, target: &CdpTarget) -> bool {
        if target.target_type != "page" || target.web_socket_debugger_url.is_empty() {
            return false;
        }
        self.allow_any_page
            || target.url == "app://-/index.html"
            || (target.url.starts_with("app://-/") && target.title.contains("Codex"))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BindingRequest {
    pub id: String,
    pub token: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
    #[serde(skip)]
    pub lifecycle_epoch: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BridgeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl BridgeError {
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            data: None,
        }
    }

    #[must_use]
    pub fn invalid_request() -> Self {
        Self::new("INVALID_REQUEST", "The native request is invalid.")
    }
}

#[async_trait]
pub trait BridgeHandler: Send + Sync + 'static {
    async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError>;

    fn lifecycle_epoch(&self) -> u64 {
        0
    }

    fn invalidate_lifecycle(&self) {}
}

#[async_trait]
pub trait EndpointVerifier: Send + Sync + 'static {
    async fn verify(&self, endpoint: CdpEndpoint) -> Result<(), CdpError>;
}

#[derive(Debug, Clone)]
pub struct BridgeNotification {
    pub payload: Value,
    pub lifecycle_epoch: u64,
}

pub(super) struct OutboundMessage {
    pub(super) trusted_script: Option<Vec<String>>,
    pub(super) payload: Value,
    pub(super) document_epoch: u64,
}

#[derive(Clone)]
pub struct InjectionConfig {
    pub binding_name: String,
    pub receiver_name: String,
    pub bootstrap_source: Arc<str>,
    /// The source installed for later navigations, which must not replay the
    /// initial native-to-renderer startup handoff.
    pub navigation_bootstrap_source: Option<Arc<str>>,
    pub capability_token: CapabilityToken,
    /// Signals that the verified renderer evaluated the bootstrap source.
    pub startup_handoff: Option<Arc<AtomicBool>>,
}

impl InjectionConfig {
    #[must_use]
    pub fn new(bootstrap_source: impl Into<Arc<str>>, token: CapabilityToken) -> Self {
        Self {
            binding_name: PRIMARY_BINDING_NAME.to_owned(),
            receiver_name: PRIMARY_RECEIVER_NAME.to_owned(),
            bootstrap_source: bootstrap_source.into(),
            navigation_bootstrap_source: None,
            capability_token: token,
            startup_handoff: None,
        }
    }
}
