//! Bounded transport observations and safe-read recovery; strict TLS remains required.
mod failure;
use crate::runtime_log::Operation;
pub(crate) use failure::{
    diagnose, from_wire_code, http_diagnosis, http_error, timeout_error, transport_error,
};
use serde_json::{Value, json};
use std::{
    error::Error,
    time::{Duration, Instant},
};

pub(crate) fn error_details(error: &(dyn Error + 'static)) -> Value {
    let mut chain = vec![error.to_string()];
    let mut source = failure::next_cause(error);
    while let Some(cause) = source {
        if chain.len() == 8 {
            break;
        }
        chain.push(cause.to_string());
        source = failure::next_cause(cause);
    }
    let mut current = Some(error);
    let mut native = vec![];
    for _ in 0..8 {
        let Some(cause) = current else { break };
        if let Some(io) = cause.downcast_ref::<std::io::Error>() {
            native.push(json!({"kind":format!("{:?}",io.kind()),"osCode":io.raw_os_error()}));
        }
        current = failure::next_cause(cause);
    }
    let request=error.downcast_ref::<reqwest::Error>().map(|request|json!({"timeout":request.is_timeout(),"connect":request.is_connect(),"body":request.is_body(),"decode":request.is_decode(),"redirect":request.is_redirect(),"status":request.status().map(|status|status.as_u16()),"phaseAttribution":"Library flags and native errors are observations; DNS/TCP/TLS origin is not inferred."}));
    let network = if error.is::<reqwest::Error>() || error.is::<rustls::Error>() {
        diagnose(error, "unknown").value()
    } else {
        Value::Null
    };
    json!({"errorChain":chain,"chainTruncated":source.is_some(),"nativeErrors":native,"requestFlags":request,"networkDiagnosis":network})
}

fn transient_transport(error: &(dyn Error + 'static)) -> bool {
    diagnose(error, "send").transient()
}

pub(crate) fn error_message(error: &(dyn Error + 'static)) -> String {
    let details = error_details(error);
    // Error messages also go to notices; never expose credentials, URLs or local paths.
    crate::runtime_log::redaction::text(
        &details["errorChain"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("; caused by: "),
    )
}

pub(crate) fn environment() -> Value {
    let present = |key: &str| std::env::var_os(key).is_some_and(|s| !s.is_empty());
    let mut value = json!({"httpProxyEnvPresent":present("HTTP_PROXY") || present("http_proxy"),"httpsProxyEnvPresent":present("HTTPS_PROXY") || present("https_proxy"),"allProxyEnvPresent":present("ALL_PROXY") || present("all_proxy"),"noProxyEnvPresent":present("NO_PROXY") || present("no_proxy"),"systemProxyAutoRead":cfg!(windows),"tlsBackend":"rustls","networkLibrary":"reqwest 0.12","observationOnly":true});
    value["trustRoots"] = json!(if cfg!(windows) {
        "bundled-public-and-system-native"
    } else {
        "bundled-public"
    });
    value["certificateVerification"] = json!(true);
    value["hostnameVerification"] = json!(true);
    value["automaticCertificateImport"] = json!(false);
    value["proxySelection"] =
        json!("reqwest environment/system precedence; selected route is not exposed");
    value["pacSupport"] = json!("Configured PAC is observed only; execution is not proven");
    value["windowsProxy"] = windows_proxy();
    value
}
#[cfg(windows)]
fn windows_proxy() -> Value {
    use windows_sys::Win32::{
        Foundation::ERROR_SUCCESS,
        System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RRF_RT_REG_SZ, RegGetValueW},
    };
    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let read = |key: &str, flags: u32, data: *mut std::ffi::c_void, size: &mut u32| {
        let name: Vec<u16> = key.encode_utf16().chain(Some(0)).collect();
        unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                data,
                size,
            )
        }
    };
    let mut enabled = 0u32;
    let mut bytes = 4;
    let status = read(
        "ProxyEnable",
        RRF_RT_REG_DWORD,
        (&mut enabled as *mut u32).cast(),
        &mut bytes,
    );
    let configured = |key: &str| {
        let mut bytes = 0;
        read(key, RRF_RT_REG_SZ, std::ptr::null_mut(), &mut bytes) == ERROR_SUCCESS && bytes > 2
    };
    json!({"readStatus":status,"staticEnabled":status==ERROR_SUCCESS && enabled==1,"staticConfigured":configured("ProxyServer"),"pacConfigured":configured("AutoConfigURL"),"configurationReadOnly":true})
}
#[cfg(not(windows))]
fn windows_proxy() -> Value {
    json!({"available":false})
}

pub(crate) struct HttpTrace {
    pub(crate) operation: Operation,
    host: String,
    port: u16,
}
impl HttpTrace {
    pub(crate) fn start(
        source: &'static str,
        endpoint: &str,
        connect_ms: u64,
        total_ms: u64,
        mut details: Value,
    ) -> Self {
        let host = url::Url::parse(endpoint)
            .ok()
            .and_then(|u| u.host_str().map(str::to_owned))
            .unwrap_or_default();
        details["host"] = json!(host);
        details["connectTimeoutMs"] = json!(connect_ms);
        details["requestTimeoutMs"] = json!(total_ms);
        details["environment"] = environment();
        details["transportStages"] = json!(
            "DNS/proxy/TCP/TLS are performed together by reqwest; individual phase timings are not exposed."
        );
        Self {
            operation: Operation::start(source, "HTTP request", details),
            host,
            port: url::Url::parse(endpoint)
                .ok()
                .and_then(|u| u.port_or_known_default())
                .unwrap_or(443),
        }
    }
    pub(crate) async fn send(
        &mut self,
        request: reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, reqwest::Error> {
        let retry = request.try_clone().filter(|clone| {
            clone
                .try_clone()
                .and_then(|r| r.build().ok())
                .is_some_and(|r| {
                    matches!(*r.method(), reqwest::Method::GET | reqwest::Method::HEAD)
                })
        });
        let mut result = request.send().await;
        if let Err(error) = &result {
            let eligible = retry.is_some() && transient_transport(error) && !error.is_timeout();
            if eligible {
                let mut first = error_details(error);
                first["connect"] = json!(error.is_connect());
                first["timeout"] = json!(error.is_timeout());
                first["attempt"] = json!(1);
                first["recoveryPlanned"] =
                    json!("One retry of the same GET/HEAD before response headers");
                self.operation.event("HTTP attempt", "failed", first);
                self.operation.event(
                    "HTTP read retry",
                    "started",
                    json!({"attempt":2,"delayMs":250,"maxAttempts":2,"writeReplayed":false}),
                );
                tokio::time::sleep(Duration::from_millis(250)).await;
                result = retry.expect("eligible cloned read request").send().await;
                self.operation.event("HTTP read retry",if result.is_ok(){"recovered"}else{"failed"},json!({"attempt":2,"meaning":"Recovered transport only; HTTP status, body and integrity checks still required."}));
            } else {
                self.operation.event("HTTP retry decision","not eligible",json!({"safeReadClone":retry.is_some(),"transientOsError":transient_transport(error),"timeout":error.is_timeout(),"reason":"Only explicitly transient native connection errors on GET/HEAD before headers qualify; no write, timeout, TLS-policy or HTTP-status retries."}));
            }
        }
        match result {
            Ok(response) => {
                self.operation.event("HTTP headers","received",json!({"status":response.status().as_u16(),"finalHost":response.url().host_str(),"contentLength":response.content_length(),"contentType":response.headers().get("content-type").and_then(|v|v.to_str().ok()),"retryAfter":response.headers().get("retry-after").and_then(|v|v.to_str().ok()),"rateLimitRemaining":response.headers().get("x-ratelimit-remaining").and_then(|v|v.to_str().ok()),"rateLimitReset":response.headers().get("x-ratelimit-reset").and_then(|v|v.to_str().ok()),"networkDiagnosis":if response.status().is_success(){Value::Null}else{http_diagnosis(response.status().as_u16(),response.headers()).value()}}));
                Ok(response)
            }
            Err(error) => {
                self.fail("send", &error, 0);
                self.probe_route().await;
                Err(error)
            }
        }
    }
    async fn probe_route(&self) {
        static LAST: std::sync::OnceLock<
            std::sync::Mutex<std::collections::HashMap<String, Instant>>,
        > = std::sync::OnceLock::new();
        let probe_key = format!("{}:{}", self.host, self.port);
        let allowed = LAST
            .get_or_init(Default::default)
            .lock()
            .is_ok_and(|mut entries| {
                entries.retain(|_, at| at.elapsed() < Duration::from_secs(30));
                if entries.contains_key(&probe_key) || entries.len() >= 8 {
                    false
                } else {
                    entries.insert(probe_key.clone(), Instant::now());
                    true
                }
            });
        if !allowed {
            self.operation.event("post-failure network checks","skipped",json!({"reason":"host check rate limit or diagnostic lock unavailable","intervalMs":30000,"originalFailurePreserved":true}));
            return;
        }
        let started = Instant::now();
        let result = tokio::time::timeout(
            Duration::from_millis(800),
            tokio::net::lookup_host((self.host.as_str(), self.port)),
        )
        .await;
        match result {
            Ok(Ok(addresses)) => {
                let addresses: Vec<_> = addresses.collect();
                self.operation.event("post-failure DNS probe","observed",json!({"host":self.host,"probeDurationMs":started.elapsed().as_millis(),"probe":{"resolvedAddressCount":addresses.len()},"interpretation":"Separate local resolver; not original request DNS or proxy route."}));
                for (index, address) in addresses.into_iter().take(2).enumerate() {
                    let started = Instant::now();
                    let result = tokio::time::timeout(
                        Duration::from_millis(500),
                        tokio::net::TcpStream::connect(address),
                    )
                    .await;
                    let outcome = match result {
                        Ok(Ok(_)) => json!({"connected":true}),
                        Ok(Err(error)) => {
                            json!({"connected":false,"kind":format!("{:?}",error.kind()),"osCode":error.raw_os_error(),"errorChain":error_details(&error)["errorChain"]})
                        }
                        Err(_) => json!({"connected":false,"timeoutMs":500}),
                    };
                    self.operation.event("post-failure TCP probe","observed",json!({"candidate":index+1,"addressFamily":if address.is_ipv4(){"IPv4"}else{"IPv6"},"durationMs":started.elapsed().as_millis(),"probe":outcome,"tlsChecked":false,"interpretation":"Direct independent TCP connection, bypassing HTTP proxy; not proof about the original request."}));
                }
            }
            other => {
                let probe = match other {
                    Ok(Err(e)) => error_details(&e),
                    Err(_) => json!({"probeTimeoutMs":800}),
                    _ => unreachable!(),
                };
                self.operation.event("post-failure DNS probe","observed",json!({"host":self.host,"probeDurationMs":started.elapsed().as_millis(),"probe":probe,"TCP":"skipped because DNS yielded no addresses","interpretation":"Independent resolver observation only."}));
            }
        }
    }
    pub(crate) fn fail(&mut self, phase: &str, error: &reqwest::Error, bytes: u64) {
        let mut details = error_details(error);
        details["networkDiagnosis"] = diagnose(error, phase).value();
        details["phase"] = json!(phase);
        details["receivedBytes"] = json!(bytes);
        details["timeout"] = json!(error.is_timeout());
        details["connect"] = json!(error.is_connect());
        details["redirect"] = json!(error.is_redirect());
        details["body"] = json!(error.is_body());
        details["request"] = json!(error.is_request());
        self.operation.finish("failed", details);
    }
}

/// Log at 25% milestones or once per five seconds; never emit per-chunk events.
pub(crate) struct TransferProgress {
    last: Instant,
    milestone: u64,
    chunks: u64,
}
impl TransferProgress {
    pub(crate) fn new() -> Self {
        Self {
            last: Instant::now(),
            milestone: 0,
            chunks: 0,
        }
    }
    pub(crate) fn observe(&mut self, operation: &Operation, bytes: u64, total: u64) {
        self.chunks += 1;
        let milestone = if total == 0 {
            0
        } else {
            bytes.saturating_mul(4) / total
        };
        if milestone > self.milestone || self.last.elapsed() >= Duration::from_secs(5) {
            operation.event("HTTP transfer","progress",json!({"receivedBytes":bytes,"expectedBytes":total,"chunks":self.chunks,"percent":if total==0 {0}else{bytes.saturating_mul(100)/total}}));
            self.milestone = milestone;
            self.last = Instant::now();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    #[tokio::test]
    async fn connection_failure_keeps_transport_chain_and_separate_dns_observation() {
        crate::runtime_log::capture_test_events();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        let mut trace = HttpTrace::start("test", &endpoint, 1000, 1000, json!({}));
        let client = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_millis(200))
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let error = trace.send(client.get(endpoint)).await.unwrap_err();
        assert!(error.is_connect());
        let events = crate::runtime_log::take_test_events();
        let failure = events.iter().find(|e| e["outcome"] == "failed").unwrap();
        assert!(failure["details"]["errorChain"].as_array().unwrap().len() >= 2);
        assert_eq!(failure["details"]["connect"], true);
        assert_eq!(
            failure["details"]["networkDiagnosis"]["code"],
            if error.is_timeout() {
                "TIMEOUT_HEADERS"
            } else {
                "CONNECTION_REFUSED"
            }
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| e["action"] == "HTTP read retry")
                .count(),
            if error.is_timeout() { 0 } else { 1 }
        );
        assert!(
            events
                .iter()
                .any(|e| e["action"] == "post-failure DNS probe")
        );
        assert!(error_message(&error).contains("caused by"));
    }
    #[test]
    fn transient_native_connection_classification_excludes_policy_and_permission_errors() {
        for kind in [
            std::io::ErrorKind::ConnectionRefused,
            std::io::ErrorKind::ConnectionReset,
            std::io::ErrorKind::ConnectionAborted,
        ] {
            assert!(transient_transport(&std::io::Error::from(kind)));
        }
        for kind in [
            std::io::ErrorKind::PermissionDenied,
            std::io::ErrorKind::InvalidData,
            std::io::ErrorKind::TimedOut,
        ] {
            assert!(!transient_transport(&std::io::Error::from(kind)));
        }
    }
    #[tokio::test]
    async fn timeout_and_post_requests_are_not_replayed() {
        let client = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_millis(80))
            .timeout(Duration::from_millis(80))
            .build()
            .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        // Listening without reading/responding deterministically times out after transport connects.
        let endpoint = format!("http://{address}");
        for request in [client.get(&endpoint), client.post(&endpoint)] {
            crate::runtime_log::capture_test_events();
            let mut trace = HttpTrace::start("test", &endpoint, 80, 80, json!({}));
            let error = trace.send(request).await.unwrap_err();
            assert!(error.is_timeout());
            let events = crate::runtime_log::take_test_events();
            assert!(
                !events
                    .iter()
                    .any(|event| event["action"] == "HTTP read retry")
            );
            assert!(
                events.iter().any(
                    |event| event["outcome"] == "failed" && event["details"]["timeout"] == true
                )
            );
        }
        drop(listener);
    }
    #[tokio::test]
    async fn headers_and_mid_body_failure_are_distinguished() {
        crate::runtime_log::capture_test_events();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 2048];
            let _ = socket.read(&mut request).await;
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\nshort",
                )
                .await
                .unwrap();
        });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let mut trace = HttpTrace::start("test", &endpoint, 1000, 1000, json!({}));
        let response = trace.send(client.get(endpoint)).await.unwrap();
        let error = response.bytes().await.unwrap_err();
        trace.fail("body stream", &error, 5);
        server.await.unwrap();
        let events = crate::runtime_log::take_test_events();
        assert!(events.iter().any(|e| e["action"] == "HTTP headers"
            && e["details"]["status"] == 200
            && e["details"]["contentLength"] == 100));
        assert!(events.iter().any(|e| e["outcome"] == "failed"
            && e["details"]["phase"] == "body stream"
            && e["details"]["receivedBytes"] == 5));
    }
    #[test]
    fn detailed_errors_are_redacted_and_progress_does_not_log_per_chunk() {
        crate::runtime_log::capture_test_events();
        let mut operation = Operation::start("test", "transfer", json!({}));
        let mut progress = TransferProgress::new();
        for bytes in 1..=1000 {
            progress.observe(&operation, bytes, 1000);
        }
        operation.finish("passed", json!({}));
        let events = crate::runtime_log::take_test_events();
        assert_eq!(
            events
                .iter()
                .filter(|e| e["action"] == "HTTP transfer")
                .count(),
            4
        );
        let error = std::io::Error::other(
            "failed https://alice:SENTINEL_PASSWORD@example.org/file?token=SENTINEL_TOKEN at C:\\Users\\SENTINEL_USER\\file",
        );
        let safe = error_message(&error);
        assert!(!safe.contains("SENTINEL"));
        let details = crate::runtime_log::redaction::value(error_details(&error));
        assert!(!details.to_string().contains("SENTINEL"));
    }
}
