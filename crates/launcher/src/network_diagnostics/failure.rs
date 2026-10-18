//! Stable transport observations, not guesses about the operator or firewall.
use cdp_client::BridgeError;
use rustls::{CertificateError, Error as TlsError};
use serde_json::{Value, json};
use std::{error::Error, io};

pub(super) fn next_cause<'a>(
    error: &'a (dyn Error + 'static),
) -> Option<&'a (dyn Error + 'static)> {
    // io::Error::source delegates to its payload's source, skipping the payload
    // itself. Nested IO wrappers otherwise hide rustls and resolver error types.
    if let Some(inner) = error.downcast_ref::<io::Error>().and_then(|e| e.get_ref()) {
        Some(inner)
    } else {
        error.source()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Diagnosis {
    pub(crate) kind: &'static str,
    pub(crate) evidence: &'static str,
}

// Diagnostics remain English regardless of the ordinary UI language.
// These native strings do not change downloadable plugin bytes.
fn wording(kind: &str) -> (&'static str, &'static str) {
    match kind {
        "TLS_UNKNOWN_ISSUER" => (
            "The certificate issuer is not trusted.",
            "Check the server certificate chain and the system's trusted roots. If an HTTPS proxy is intentional, ask its administrator to verify its certificate. Retrying alone will not repair trust.",
        ),
        "TLS_EXPIRED" => (
            "The certificate has expired.",
            "Check the system clock and ask the server or proxy administrator to renew the certificate.",
        ),
        "TLS_NOT_YET_VALID" => (
            "The certificate is not valid yet.",
            "Check the system clock and the certificate's validity period.",
        ),
        "TLS_HOSTNAME" => (
            "The certificate does not match the requested host.",
            "Check the endpoint and proxy configuration with the administrator. Do not bypass hostname verification.",
        ),
        "TLS_REVOKED" => (
            "The certificate has been revoked.",
            "Ask the server or proxy administrator to replace it. Do not reuse or trust the rejected certificate.",
        ),
        "TLS_CERTIFICATE" => (
            "Certificate validation failed.",
            "Inspect the original certificate error and chain with the administrator; certificate validation remains enabled.",
        ),
        "TLS_HANDSHAKE" => (
            "The TLS handshake failed.",
            "Inspect the TLS protocol error and server or proxy compatibility. This does not prove a certificate trust failure.",
        ),
        "PROXY_AUTH" => (
            "The proxy requires authentication.",
            "Check the configured proxy and its authentication. No credentials are logged or guessed.",
        ),
        "PROXY_TUNNEL" => (
            "The proxy tunnel could not be established.",
            "Inspect the original CONNECT response and proxy policy. The proxy's reason may be unavailable.",
        ),
        "DNS" => (
            "Name resolution failed.",
            "Check DNS and proxy settings. The failed resolver may belong to the proxy route; separate probes do not prove the original route works.",
        ),
        "CONNECTION_REFUSED" => (
            "The connection was refused.",
            "Check the target or proxy listener and network route. This alone does not prove a firewall fault.",
        ),
        "CONNECTION_RESET" => (
            "The connection was reset.",
            "A safe GET or HEAD may be retried once before response headers. Check the original route if it persists.",
        ),
        "CONNECTION_ABORTED" => (
            "The connection was interrupted.",
            "A safe GET or HEAD may be retried once before response headers; writes and partial downloads are not replayed.",
        ),
        "ACCESS_DENIED" => (
            "The connection was denied by the operating system.",
            "Inspect the native error and local policy. Do not assume or disable a particular security product.",
        ),
        "TIMEOUT_HEADERS" => (
            "Timed out before response headers arrived.",
            "Check the timeout budget and original network route. This observation cannot distinguish DNS, proxy, TCP or TLS delay.",
        ),
        "TIMEOUT_BODY" => (
            "Timed out while receiving the response body.",
            "Retry the download manually after checking the route. Previously complete, verified assets remain reusable.",
        ),
        "TIMEOUT_OPERATION" => (
            "The overall download deadline was exceeded.",
            "Inspect the last completed stage; this overall deadline does not identify a DNS, TCP or TLS cause. Complete verified assets remain reusable.",
        ),
        "BODY_INTERRUPTED" => (
            "The response body was interrupted or incomplete.",
            "Retry the download manually. Partial bytes are never installed; existing verified cache is preserved.",
        ),
        "REDIRECT" => (
            "The redirect policy rejected the response.",
            "Check the redirect count and allowed host. Do not follow an untrusted download location.",
        ),
        "DECODE" => (
            "The response could not be decoded.",
            "Inspect the response format and original decode error. A successful connection does not prove a valid response.",
        ),
        "CLIENT_CONFIGURATION" => (
            "The HTTP client or request configuration is invalid.",
            "Inspect the client construction error, URL and proxy configuration. No network connection is proven to have occurred.",
        ),
        "HTTP_NOT_FOUND" => (
            "The requested release or asset was not found (HTTP 404).",
            "Check the exact release tag, asset name and publication. A 404 does not mean a local connection failure.",
        ),
        "HTTP_AUTH" => (
            "The server requires authentication (HTTP 401).",
            "Check repository visibility and access authorization. Do not share credentials in diagnostic reports.",
        ),
        "HTTP_FORBIDDEN" => (
            "The server refused access (HTTP 403).",
            "Check access policy and repository visibility. A 403 without rate-limit evidence is not classified as rate limiting.",
        ),
        "HTTP_RATE_LIMIT" => (
            "The server rate limit was reached.",
            "Wait for Retry-After or the rate-limit reset, then retry manually. No immediate automatic HTTP retry is made.",
        ),
        "HTTP_SERVER" => (
            "The server returned an HTTP server error.",
            "Try again later and retain the HTTP status. This does not prove a local network fault.",
        ),
        "HTTP_STATUS" => (
            "The server returned an unsuccessful HTTP response.",
            "Inspect the exact HTTP status and request role before choosing a recovery action.",
        ),
        _ => (
            "The network operation failed; its specific origin is not established.",
            "Inspect the original error chain, request stage and proxy observations. Do not infer DNS, TLS or firewall failure from Connect alone.",
        ),
    }
}

impl Diagnosis {
    pub(crate) fn value(self) -> Value {
        let (message, recovery) = wording(self.kind);
        json!({"schema":1,"code":self.kind,"evidence":self.evidence,
            "summary":message,"recovery":recovery,"rootCause":"Observed failure only; responsible server, proxy or local policy may be unproven.",
            "automaticRetry":if self.transient(){"one-safe-read-before-headers"}else{"none"},
            "tlsVerification":"required","cachePolicy":"preserve-verified-assets"})
    }
    pub(crate) fn transient(self) -> bool {
        matches!(
            self.kind,
            "CONNECTION_REFUSED" | "CONNECTION_RESET" | "CONNECTION_ABORTED"
        )
    }
    fn wire_code(self, scope: &str) -> String {
        format!("{scope}_NET_{}", self.kind)
    }
    fn message(self) -> String {
        let (summary, recovery) = wording(self.kind);
        format!("{summary} {recovery}")
    }
}

fn certificate(error: &CertificateError) -> &'static str {
    match error {
        CertificateError::UnknownIssuer => "TLS_UNKNOWN_ISSUER",
        CertificateError::Expired | CertificateError::ExpiredContext { .. } => "TLS_EXPIRED",
        CertificateError::NotValidYet | CertificateError::NotValidYetContext { .. } => {
            "TLS_NOT_YET_VALID"
        }
        CertificateError::NotValidForName | CertificateError::NotValidForNameContext { .. } => {
            "TLS_HOSTNAME"
        }
        CertificateError::Revoked => "TLS_REVOKED",
        _ => "TLS_CERTIFICATE",
    }
}

pub(crate) fn diagnose(error: &(dyn Error + 'static), phase: &str) -> Diagnosis {
    let mut current = Some(error);
    let mut native = None;
    let mut marker = None;
    let mut tls = None;
    let request = error.downcast_ref::<reqwest::Error>();
    for _ in 0..16 {
        let Some(cause) = current else { break };
        if let Some(t) = cause.downcast_ref::<TlsError>() {
            tls = Some(match t {
                TlsError::InvalidCertificate(c) => certificate(c),
                _ => "TLS_HANDSHAKE",
            });
        }
        if let Some(io) = cause.downcast_ref::<io::Error>() {
            let kind = match io.raw_os_error() {
                // Windows resolver errors, not arbitrary platform errno values.
                #[cfg(windows)]
                Some(11001..=11004) => Some("DNS"),
                _ => match io.kind() {
                    io::ErrorKind::ConnectionRefused => Some("CONNECTION_REFUSED"),
                    io::ErrorKind::ConnectionReset => Some("CONNECTION_RESET"),
                    io::ErrorKind::ConnectionAborted
                    | io::ErrorKind::Interrupted
                    | io::ErrorKind::NotConnected => Some("CONNECTION_ABORTED"),
                    io::ErrorKind::PermissionDenied => Some("ACCESS_DENIED"),
                    _ => None,
                },
            };
            native = native.or(kind);
        }
        // hyper-util resolver/tunnel error types are private. Only use exact
        // library observations in a real reqwest error chain, never arbitrary
        // user text, and explicitly record the weaker evidence source.
        if request.is_some() {
            marker = marker.or(match cause.to_string().as_str() {
                "tunnel error: proxy authorization required" => Some("PROXY_AUTH"),
                "tunnel error: unsuccessful"
                | "tunnel error: unexpected end of file"
                | "tunnel error: proxy response headers too long" => Some("PROXY_TUNNEL"),
                "dns error" => Some("DNS"),
                _ => None,
            });
        }
        current = next_cause(cause);
    }
    if let Some(kind) = tls {
        return Diagnosis {
            kind,
            evidence: "rustls-error-type",
        };
    }
    if let Some(kind) = marker {
        return Diagnosis {
            kind,
            evidence: "exact-library-diagnostic",
        };
    }
    let body = phase.contains("body") || phase.contains("chunk");
    if let Some(r) = request {
        let kind = if r.is_timeout() {
            Some(if body || r.is_body() {
                "TIMEOUT_BODY"
            } else {
                "TIMEOUT_HEADERS"
            })
        } else if r.is_builder() {
            Some("CLIENT_CONFIGURATION")
        } else if r.is_redirect() {
            Some("REDIRECT")
        } else if body || r.is_body() {
            Some("BODY_INTERRUPTED")
        } else if r.is_decode() {
            Some("DECODE")
        } else {
            None
        };
        if let Some(kind) = kind {
            return Diagnosis {
                kind,
                evidence: "reqwest-flags-and-operation-stage",
            };
        }
    }
    if let Some(kind) = native {
        return Diagnosis {
            kind,
            evidence: "native-io-error",
        };
    }
    Diagnosis {
        kind: "UNKNOWN",
        evidence: "insufficient-specific-evidence",
    }
}

pub(crate) fn from_wire_code(code: &str) -> Option<Diagnosis> {
    let (scope, kind) = code.split_once("_NET_")?;
    if !matches!(scope, "PLUGIN" | "EXAMPLE" | "UPDATE") {
        return None;
    }
    let parsed = known_kind(kind);
    if parsed == "UNKNOWN" && kind != "UNKNOWN" {
        return None;
    }
    Some(Diagnosis {
        kind: parsed,
        evidence: "propagated-stable-error-code",
    })
}
fn known_kind(kind: &str) -> &'static str {
    // All protocol codes are static, with no unbounded allocation or leaking.
    const KINDS: &[&str] = &[
        "TLS_UNKNOWN_ISSUER",
        "TLS_EXPIRED",
        "TLS_NOT_YET_VALID",
        "TLS_HOSTNAME",
        "TLS_REVOKED",
        "TLS_CERTIFICATE",
        "TLS_HANDSHAKE",
        "PROXY_AUTH",
        "PROXY_TUNNEL",
        "DNS",
        "CONNECTION_REFUSED",
        "CONNECTION_RESET",
        "CONNECTION_ABORTED",
        "ACCESS_DENIED",
        "TIMEOUT_HEADERS",
        "TIMEOUT_BODY",
        "TIMEOUT_OPERATION",
        "BODY_INTERRUPTED",
        "REDIRECT",
        "DECODE",
        "CLIENT_CONFIGURATION",
        "HTTP_NOT_FOUND",
        "HTTP_AUTH",
        "HTTP_FORBIDDEN",
        "HTTP_RATE_LIMIT",
        "HTTP_SERVER",
        "HTTP_STATUS",
        "UNKNOWN",
    ];
    KINDS
        .iter()
        .copied()
        .find(|v| *v == kind)
        .unwrap_or("UNKNOWN")
}

fn bridge(d: Diagnosis, scope: &str, phase: &str, role: &str, evidence: &str) -> BridgeError {
    let details =
        crate::runtime_log::redaction::text(&format!("phase={phase}; role={role}; {evidence}"));
    BridgeError::new(d.wire_code(scope), format!("{}\n{details}", d.message()))
}
pub(crate) fn transport_error(
    scope: &str,
    phase: &str,
    role: &str,
    error: &reqwest::Error,
) -> BridgeError {
    bridge(
        diagnose(error, phase),
        scope,
        phase,
        role,
        &super::error_message(error),
    )
}
pub(crate) fn timeout_error(
    scope: &str,
    phase: &str,
    role: &str,
    timeout_ms: u128,
    bytes: Option<usize>,
) -> BridgeError {
    let kind = if phase.contains("body") || phase.contains("chunk") {
        "TIMEOUT_BODY"
    } else if phase == "response headers" || phase == "send" {
        "TIMEOUT_HEADERS"
    } else {
        "TIMEOUT_OPERATION"
    };
    bridge(
        Diagnosis {
            kind,
            evidence: "explicit-operation-deadline",
        },
        scope,
        phase,
        role,
        &format!(
            "timeoutMs={timeout_ms}; receivedBytes={}",
            bytes
                .map(|v| v.to_string())
                .unwrap_or_else(|| "unknown".to_owned())
        ),
    )
}
pub(crate) fn http_diagnosis(status: u16, headers: &reqwest::header::HeaderMap) -> Diagnosis {
    let kind = match status {
        300..=399 => "REDIRECT",
        401 => "HTTP_AUTH",
        404 => "HTTP_NOT_FOUND",
        407 => "PROXY_AUTH",
        429 => "HTTP_RATE_LIMIT",
        403 if headers
            .get("x-ratelimit-remaining")
            .is_some_and(|v| v == "0")
            || headers.contains_key("retry-after") =>
        {
            "HTTP_RATE_LIMIT"
        }
        403 => "HTTP_FORBIDDEN",
        500..=599 => "HTTP_SERVER",
        _ => "HTTP_STATUS",
    };
    Diagnosis {
        kind,
        evidence: "http-status-and-headers",
    }
}
pub(crate) fn http_error(scope: &str, role: &str, response: &reqwest::Response) -> BridgeError {
    let d = http_diagnosis(response.status().as_u16(), response.headers());
    let bounded_header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| {
                v.chars()
                    .filter(|c| !c.is_control())
                    .take(160)
                    .collect::<String>()
            })
    };
    bridge(
        d,
        scope,
        "HTTP response",
        role,
        &format!(
            "status={}; retryAfter={:?}; rateLimitReset={:?}",
            response.status().as_u16(),
            bounded_header("retry-after"),
            bounded_header("x-ratelimit-reset")
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::Arc, time::Duration};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn typed_certificates_native_errors_and_unknowns_are_distinct() {
        for (cert, kind) in [
            (CertificateError::UnknownIssuer, "TLS_UNKNOWN_ISSUER"),
            (CertificateError::Expired, "TLS_EXPIRED"),
            (CertificateError::NotValidYet, "TLS_NOT_YET_VALID"),
            (CertificateError::NotValidForName, "TLS_HOSTNAME"),
            (CertificateError::Revoked, "TLS_REVOKED"),
            (CertificateError::BadSignature, "TLS_CERTIFICATE"),
        ] {
            let tls = TlsError::InvalidCertificate(cert);
            assert_eq!(diagnose(&tls, "send").kind, kind);
            let wrapped = io::Error::new(io::ErrorKind::InvalidData, tls);
            assert_eq!(diagnose(&wrapped, "body stream").kind, kind);
            assert!(!diagnose(&wrapped, "send").transient());
            assert_eq!(
                super::super::error_details(&wrapped)["networkDiagnosis"],
                Value::Null
            );
            assert_eq!(
                super::super::error_details(&wrapped)["chainTruncated"],
                false
            );
        }
        for (native, kind, retry) in [
            (io::ErrorKind::ConnectionRefused, "CONNECTION_REFUSED", true),
            (io::ErrorKind::ConnectionReset, "CONNECTION_RESET", true),
            (io::ErrorKind::ConnectionAborted, "CONNECTION_ABORTED", true),
            (io::ErrorKind::PermissionDenied, "ACCESS_DENIED", false),
        ] {
            let d = diagnose(&io::Error::from(native), "send");
            assert_eq!(d.kind, kind);
            assert_eq!(d.transient(), retry);
        }
        // Arbitrary text is never treated as a typed TLS/DNS/proxy observation.
        for text in [
            "UnknownIssuer",
            "dns error",
            "tunnel error: proxy authorization required",
            "firewall blocked",
        ] {
            assert_eq!(diagnose(&io::Error::other(text), "send").kind, "UNKNOWN");
        }
        #[cfg(windows)]
        assert_eq!(
            diagnose(&io::Error::from_raw_os_error(11001), "send").kind,
            "DNS"
        );
    }

    #[test]
    fn http_status_policy_does_not_call_every_403_rate_limited() {
        let mut h = reqwest::header::HeaderMap::new();
        for (status, kind) in [
            (401, "HTTP_AUTH"),
            (403, "HTTP_FORBIDDEN"),
            (404, "HTTP_NOT_FOUND"),
            (407, "PROXY_AUTH"),
            (429, "HTTP_RATE_LIMIT"),
            (503, "HTTP_SERVER"),
            (418, "HTTP_STATUS"),
        ] {
            assert_eq!(http_diagnosis(status, &h).kind, kind);
            assert!(!http_diagnosis(status, &h).transient());
        }
        h.insert("x-ratelimit-remaining", "0".parse().unwrap());
        assert_eq!(http_diagnosis(403, &h).kind, "HTTP_RATE_LIMIT");
        h.clear();
        h.insert("retry-after", "120".parse().unwrap());
        assert_eq!(http_diagnosis(403, &h).kind, "HTTP_RATE_LIMIT");
    }

    #[test]
    fn wire_codes_propagate_to_faults_and_diagnostics_remain_english() {
        for kind in [
            "TLS_UNKNOWN_ISSUER",
            "TLS_EXPIRED",
            "TLS_HOSTNAME",
            "TLS_REVOKED",
            "DNS",
            "PROXY_AUTH",
            "HTTP_NOT_FOUND",
            "HTTP_FORBIDDEN",
            "HTTP_RATE_LIMIT",
            "TIMEOUT_HEADERS",
            "TIMEOUT_BODY",
            "BODY_INTERRUPTED",
            "UNKNOWN",
        ] {
            let d = Diagnosis {
                kind,
                evidence: "fixture",
            };
            assert!(d.message().is_ascii());
            assert!(d.message().len() > 40);
            for scope in ["PLUGIN", "EXAMPLE", "UPDATE"] {
                let code = d.wire_code(scope);
                assert_eq!(from_wire_code(&code).unwrap().kind, kind);
                let event = crate::fault_diagnostics::enrich(
                    "native-bridge",
                    "request",
                    "failed",
                    json!({"code":code,"reason":"specific cause"}),
                );
                assert_eq!(event["fault"]["classification"], kind);
                assert_eq!(event["networkDiagnosis"]["code"], kind);
            }
        }
        let raw = crate::fault_diagnostics::enrich(
            "update",
            "HTTP request",
            "failed",
            json!({"errorChain":["original TLS failure"],"networkDiagnosis":Diagnosis{kind:"TLS_UNKNOWN_ISSUER",evidence:"rustls-error-type"}.value()}),
        );
        assert_eq!(raw["fault"]["observedCode"], "TLS_UNKNOWN_ISSUER");
        assert!(
            !raw["fault"]["missingEvidence"]
                .as_array()
                .unwrap()
                .contains(&json!("specific error code"))
        );
        assert!(from_wire_code("PLUGIN_NET_MADE_UP").is_none());
        assert!(from_wire_code("ARBITRARY_NET_TLS_EXPIRED").is_none());
        assert_eq!(
            timeout_error("PLUGIN", "package download", "fixture", 120000, None).code,
            "PLUGIN_NET_TIMEOUT_OPERATION"
        );
        assert_eq!(
            timeout_error("EXAMPLE", "next body chunk", "fixture", 20000, Some(42)).code,
            "EXAMPLE_NET_TIMEOUT_BODY"
        );
    }

    async fn one_http_response(reply: Vec<u8>) -> (String, tokio::task::JoinHandle<Vec<u8>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let (mut socket, _) = tokio::time::timeout(Duration::from_secs(3), listener.accept())
                .await
                .unwrap()
                .unwrap();
            let mut bytes = vec![0; 8192];
            let count = tokio::time::timeout(Duration::from_secs(3), socket.read(&mut bytes))
                .await
                .unwrap()
                .unwrap();
            socket.write_all(&reply).await.unwrap();
            bytes.truncate(count);
            bytes
        });
        (endpoint, task)
    }

    #[tokio::test]
    async fn real_connect_proxy_authentication_and_rejected_tunnels_keep_their_codes() {
        for (status, expected) in [(407, "PROXY_AUTH"), (502, "PROXY_TUNNEL")] {
            let (endpoint, server) = one_http_response(
                format!("HTTP/1.1 {status} Test\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .into_bytes(),
            )
            .await;
            let client = reqwest::Client::builder()
                .no_proxy()
                .proxy(reqwest::Proxy::all(&endpoint).unwrap())
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap();
            let error = client
                .get("https://example.invalid/")
                .send()
                .await
                .unwrap_err();
            assert_eq!(
                diagnose(&error, "send").kind,
                expected,
                "{}",
                super::super::error_message(&error)
            );
            assert!(
                String::from_utf8_lossy(&server.await.unwrap())
                    .starts_with("CONNECT example.invalid:443")
            );
            let bridge = transport_error("PLUGIN", "send", "fixture", &error);
            assert_eq!(bridge.code, format!("PLUGIN_NET_{expected}"));
        }
    }

    #[tokio::test]
    async fn body_timeout_and_truncation_are_not_header_or_certificate_errors() {
        let (endpoint, server) = one_http_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\nshort".to_vec(),
        )
        .await;
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let error = client
            .get(endpoint)
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap_err();
        assert_eq!(diagnose(&error, "body stream").kind, "BODY_INTERRUPTED");
        server.await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = [0; 4096];
            let _ = socket.read(&mut buf).await;
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n")
                .await
                .unwrap();
            tokio::time::sleep(Duration::from_millis(350)).await;
        });
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_millis(150))
            .build()
            .unwrap();
        let error = client
            .get(endpoint)
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap_err();
        assert_eq!(diagnose(&error, "body stream").kind, "TIMEOUT_BODY");
        assert_eq!(
            transport_error("UPDATE", "body stream", "fixture", &error).code,
            "UPDATE_NET_TIMEOUT_BODY"
        );
        server.await.unwrap();
    }

    fn tls_server() -> (String, Vec<u8>, tokio::task::JoinHandle<()>) {
        tls_server_with_dates(None)
    }
    fn tls_server_with_dates(
        dates: Option<(i32, i32)>,
    ) -> (String, Vec<u8>, tokio::task::JoinHandle<()>) {
        let mut params = rcgen::CertificateParams::new(vec!["localhost".into()]).unwrap();
        if let Some((start, end)) = dates {
            params.not_before = rcgen::date_time_ymd(start, 1, 1);
            params.not_after = rcgen::date_time_ymd(end, 1, 1);
        }
        let signing_key = rcgen::KeyPair::generate().unwrap();
        let cert = params.self_signed(&signing_key).unwrap();
        let der = cert.der().to_vec();
        let key = rustls::pki_types::PrivatePkcs8KeyDer::from(signing_key.serialize_der()).into();
        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert.der().clone()], key)
            .unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!(
            "https://localhost:{}",
            listener.local_addr().unwrap().port()
        );
        let server = tokio::task::spawn_blocking(move || {
            use std::io::{Read, Write};
            listener.set_nonblocking(true).unwrap();
            let start = std::time::Instant::now();
            let (socket, _) = loop {
                match listener.accept() {
                    Ok(pair) => break pair,
                    Err(e)
                        if e.kind() == io::ErrorKind::WouldBlock
                            && start.elapsed() < Duration::from_secs(3) =>
                    {
                        std::thread::sleep(Duration::from_millis(10))
                    }
                    Err(e) => panic!("TLS test listener: {e}"),
                }
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            socket
                .set_write_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let conn = rustls::ServerConnection::new(Arc::new(config)).unwrap();
            let mut stream = rustls::StreamOwned::new(conn, socket);
            let mut buf = [0; 4096];
            if stream.read(&mut buf).is_ok() {
                let _ = stream.write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                );
                let _ = stream.flush();
            }
        });
        (endpoint, der, server)
    }

    #[tokio::test]
    async fn real_tls_rejects_unknown_issuer_and_accepts_explicit_test_trust() {
        let (endpoint, _, server) = tls_server();
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        crate::runtime_log::capture_test_events();
        let mut trace =
            super::super::HttpTrace::start("test", &endpoint, 3000, 3000, json!({"fixture":true}));
        let error = trace.send(client.get(endpoint)).await.unwrap_err();
        assert_eq!(
            diagnose(&error, "send").kind,
            "TLS_UNKNOWN_ISSUER",
            "{}",
            super::super::error_message(&error)
        );
        assert_eq!(
            transport_error("UPDATE", "send", "fixture", &error).code,
            "UPDATE_NET_TLS_UNKNOWN_ISSUER"
        );
        assert!(!diagnose(&error, "send").transient());
        let events = crate::runtime_log::take_test_events();
        assert!(!events.iter().any(|e| e["action"] == "HTTP read retry"));
        assert!(events.iter().any(|e| e["outcome"] == "failed"
            && e["details"]["networkDiagnosis"]["code"] == "TLS_UNKNOWN_ISSUER"));
        server.await.unwrap();
        let (endpoint, der, server) = tls_server();
        // Test-local trust only; never add certificates to the user's store.
        let client = reqwest::Client::builder()
            .no_proxy()
            .add_root_certificate(reqwest::Certificate::from_der(&der).unwrap())
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        let response = client.get(endpoint).send().await.unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.text().await.unwrap(), "ok");
        server.await.unwrap();
    }

    #[test]
    fn evidence_and_messages_are_redacted_and_do_not_override_specific_nonnetwork_failures() {
        let error = io::Error::other("https://USER:SENTINEL@example.org/?token=SENTINEL");
        let safe = super::super::error_message(&error);
        assert!(!safe.contains("SENTINEL"));
        let event = crate::fault_diagnostics::enrich(
            "plugin",
            "verify",
            "failed",
            json!({"code":"PLUGIN_INTEGRITY","networkDiagnosis":diagnose(&error,"body").value()}),
        );
        assert_eq!(event["fault"]["classification"], "integrity");
        assert_eq!(super::super::environment()["certificateVerification"], true);
        assert_eq!(super::super::environment()["hostnameVerification"], true);
        assert_eq!(
            super::super::error_details(&io::Error::from(io::ErrorKind::PermissionDenied))["networkDiagnosis"],
            Value::Null
        );
    }

    #[tokio::test]
    async fn real_tls_still_enforces_expiry_validity_and_hostname_with_test_trust() {
        for (dates, mismatch, expected) in [
            (Some((2000, 2001)), false, "TLS_EXPIRED"),
            (Some((2099, 2100)), false, "TLS_NOT_YET_VALID"),
            (None, true, "TLS_HOSTNAME"),
        ] {
            let (endpoint, der, server) = tls_server_with_dates(dates);
            let endpoint = if mismatch {
                endpoint.replace("localhost", "127.0.0.1")
            } else {
                endpoint
            };
            let client = reqwest::Client::builder()
                .no_proxy()
                .add_root_certificate(reqwest::Certificate::from_der(&der).unwrap())
                .timeout(Duration::from_secs(3))
                .build()
                .unwrap();
            let error = client.get(endpoint).send().await.unwrap_err();
            assert_eq!(
                diagnose(&error, "send").kind,
                expected,
                "{}",
                super::super::error_message(&error)
            );
            assert!(!diagnose(&error, "send").transient());
            server.await.unwrap();
        }
    }
}
