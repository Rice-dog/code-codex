//! Observation only: does not change proxy selection, DNS, TLS or retry behavior.
use crate::runtime_log::Operation;
use serde_json::{Value, json};
use std::{
    error::Error,
    time::{Duration, Instant},
};

pub(crate) fn error_details(error: &(dyn Error + 'static)) -> Value {
    let mut chain = vec![error.to_string()];
    let mut source = error.source();
    while let Some(cause) = source {
        if chain.len() == 8 {
            break;
        }
        chain.push(cause.to_string());
        source = cause.source();
    }
    json!({"errorChain":chain,"chainTruncated":source.is_some()})
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
    let mut value = json!({"httpProxyEnvPresent":present("HTTP_PROXY") || present("http_proxy"),"httpsProxyEnvPresent":present("HTTPS_PROXY") || present("https_proxy"),"allProxyEnvPresent":present("ALL_PROXY") || present("all_proxy"),"noProxyEnvPresent":present("NO_PROXY") || present("no_proxy"),"systemProxyAutoRead":false,"tlsBackend":"rustls","networkLibrary":"reqwest 0.12","observationOnly":true});
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
        }
    }
    pub(crate) async fn send(
        &mut self,
        request: reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, reqwest::Error> {
        match request.send().await {
            Ok(response) => {
                self.operation.event("HTTP headers","received",json!({"status":response.status().as_u16(),"finalHost":response.url().host_str(),"contentLength":response.content_length(),"contentType":response.headers().get("content-type").and_then(|v|v.to_str().ok()),"retryAfter":response.headers().get("retry-after").and_then(|v|v.to_str().ok()),"rateLimitRemaining":response.headers().get("x-ratelimit-remaining").and_then(|v|v.to_str().ok())}));
                Ok(response)
            }
            Err(error) => {
                self.fail("send", &error, 0);
                // Separate bounded probe after failure, never mistaken for request DNS/proxy behavior.
                let started = Instant::now();
                let result = tokio::time::timeout(
                    Duration::from_millis(800),
                    tokio::net::lookup_host((self.host.as_str(), 443)),
                )
                .await;
                let observation = match result {
                    Ok(Ok(addresses)) => json!({"resolvedAddressCount":addresses.count()}),
                    Ok(Err(e)) => error_details(&e),
                    Err(_) => json!({"probeTimeoutMs":800}),
                };
                self.operation.event("post-failure DNS probe","observed",json!({"host":self.host,"probeDurationMs":started.elapsed().as_millis(),"probe":observation,"interpretation":"Separate local DNS observation; not the failed request resolver or proxy route."}));
                Err(error)
            }
        }
    }
    pub(crate) fn fail(&mut self, phase: &str, error: &reqwest::Error, bytes: u64) {
        let mut details = error_details(error);
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
        assert!(
            events
                .iter()
                .any(|e| e["action"] == "post-failure DNS probe")
        );
        assert!(error_message(&error).contains("caused by"));
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
