//! Optional original media, never bundled in the installer or fetched at startup.
use base64::Engine;
use cdp_client::BridgeError;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

const CATALOG: &str = include_str!("../../../resources/startup-examples/catalog.json");
const RESPONSE_WAIT: Duration = Duration::from_secs(20);
const BODY_IDLE_WAIT: Duration = Duration::from_secs(20);
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Sample {
    pub id: String,
    pub name: String,
    asset: String,
    release_tag: String,
    pub size: usize,
    pub sha256: String,
    #[serde(rename = "type")]
    pub mime: String,
    source: String,
}
#[derive(Default)]
struct Job {
    phase: &'static str,
    received: usize,
    error: Option<String>,
    data: Option<Arc<Vec<u8>>>,
}
struct DownloadGuard(String);
impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut states) = jobs().lock() {
            if let Some(job) = states.get_mut(&self.0) {
                if !matches!(job.phase, "ready" | "failed") {
                    job.phase = "cancelled";
                    job.error = Some(
                        "The native download operation was cancelled before completion".into(),
                    );
                    job.data = None;
                }
            }
        }
    }
}
fn jobs() -> &'static Mutex<HashMap<String, Job>> {
    static JOBS: OnceLock<Mutex<HashMap<String, Job>>> = OnceLock::new();
    JOBS.get_or_init(Default::default)
}
fn lane() -> &'static tokio::sync::Mutex<()> {
    static LANE: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LANE.get_or_init(Default::default)
}
fn err(code: &str, message: impl ToString) -> BridgeError {
    BridgeError::new(code, message.to_string())
}
pub(crate) fn catalog() -> Result<Vec<Sample>, BridgeError> {
    serde_json::from_str(CATALOG).map_err(|e| err("EXAMPLE_CATALOG", e))
}
fn sample(id: &str) -> Result<Sample, BridgeError> {
    catalog()?.into_iter().find(|s| s.id == id).ok_or_else(|| {
        err(
            "EXAMPLE_ID",
            "Unknown startup example; no URL was accepted.",
        )
    })
}
fn progress(
    id: &str,
    phase: &'static str,
    received: usize,
    error: Option<String>,
    data: Option<Arc<Vec<u8>>>,
) -> Result<(), BridgeError> {
    let mut states = jobs()
        .lock()
        .map_err(|_| err("EXAMPLE_STATE", "Example progress lock is unavailable"))?;
    states.insert(
        id.into(),
        Job {
            phase,
            received,
            error,
            data,
        },
    );
    Ok(())
}
pub(crate) fn status() -> Result<Value, BridgeError> {
    let states = jobs()
        .lock()
        .map_err(|_| err("EXAMPLE_STATE", "Example progress lock is unavailable"))?;
    Ok(Value::Array(catalog()?.into_iter().map(|s| {let j=states.get(&s.id);json!({"id":s.id,"phase":j.map(|j|j.phase).unwrap_or("idle"),"receivedBytes":j.map(|j|j.received).unwrap_or(0),"totalBytes":s.size,"error":j.and_then(|j|j.error.as_ref())})}).collect()))
}
fn cache_root() -> Result<PathBuf, BridgeError> {
    let root = workspace_service::application_paths::data_root()
        .map_err(|e| err("EXAMPLE_STORAGE", e))?
        .join("cache")
        .join("startup-examples");
    workspace_service::application_paths::validate_directory_path(&root)
        .map_err(|e| err("EXAMPLE_STORAGE", e))?;
    fs::create_dir_all(&root).map_err(|e| err("EXAMPLE_STORAGE", e))?;
    workspace_service::application_paths::validate_directory_path(&root)
        .map_err(|e| err("EXAMPLE_STORAGE", e))?;
    Ok(root)
}
fn verified(s: &Sample, bytes: &[u8]) -> Result<(), BridgeError> {
    let observed = format!("{:x}", Sha256::digest(bytes));
    if bytes.len() != s.size || observed != s.sha256 {
        return Err(err(
            "EXAMPLE_INTEGRITY",
            format!(
                "Example {} integrity failed: expectedBytes={}, observedBytes={}, expectedSHA256={}, observedSHA256={observed}",
                s.id,
                s.size,
                bytes.len(),
                s.sha256
            ),
        ));
    }
    Ok(())
}
fn read_cached(root: &Path, s: &Sample) -> Result<Option<Vec<u8>>, BridgeError> {
    workspace_service::application_paths::validate_directory_path(root)
        .map_err(|e| err("EXAMPLE_STORAGE", e))?;
    let path = root.join(format!("{}.mp4", s.sha256));
    let meta = match fs::symlink_metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(err("EXAMPLE_STORAGE", e)),
    };
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(err(
                "EXAMPLE_STORAGE",
                "Linked example cache files are refused",
            ));
        }
    }
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err(err(
            "EXAMPLE_STORAGE",
            "Example cache is not a regular file",
        ));
    }
    if meta.len() != s.size as u64 {
        return Ok(None);
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x0020_0000);
    }
    let mut file = options.open(path).map_err(|e| err("EXAMPLE_STORAGE", e))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take((s.size + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| err("EXAMPLE_STORAGE", e))?;
    if verified(s, &bytes).is_err() {
        return Ok(None);
    }
    Ok(Some(bytes))
}
fn trusted(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}
pub(crate) async fn download(id: &str) -> Result<Value, BridgeError> {
    let s = sample(id)?;
    let _lane = lane().lock().await;
    let mut operation = crate::runtime_log::Operation::start(
        "startup-examples",
        "download",
        json!({"id":id,"asset":s.asset,"expectedBytes":s.size}),
    );
    progress(id, "checking", 0, None, None)?;
    let _job = DownloadGuard(id.into());
    let result = download_inner(&s).await;
    match result {
        Ok((bytes, cached)) => {
            progress(id, "ready", bytes.len(), None, Some(Arc::new(bytes)))?;
            operation.finish(
                "passed",
                json!({"id":id,"cached":cached,"integrityVerified":true}),
            );
            Ok(json!({"id":id,"cached":cached,"size":s.size}))
        }
        Err(e) => {
            let received = jobs()
                .lock()
                .ok()
                .and_then(|j| j.get(id).map(|j| j.received))
                .unwrap_or(0);
            let _ = progress(id, "failed", received, Some(e.message.clone()), None);
            operation.finish(
                "failed",
                json!({"id":id,"code":e.code,"reason":e.message,"receivedBytes":received}),
            );
            Err(e)
        }
    }
}
async fn download_inner(s: &Sample) -> Result<(Vec<u8>, bool), BridgeError> {
    let root = cache_root()?;
    download_at_root(s, &root).await
}
async fn download_at_root(s: &Sample, root: &Path) -> Result<(Vec<u8>, bool), BridgeError> {
    if let Some(bytes) = read_cached(&root, s)? {
        return Ok((bytes, true));
    }
    let endpoint = format!(
        "https://github.com/Rice-dog/code-codex/releases/download/{}/{}",
        s.release_tag, s.asset
    );
    let mut trace = crate::network_diagnostics::HttpTrace::start(
        "startup-examples",
        &endpoint,
        10000,
        120000,
        json!({"id":s.id,"expectedBytes":s.size}),
    );
    let request_operation = trace.operation.id();
    let client=reqwest::Client::builder().connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(120)).redirect(reqwest::redirect::Policy::custom(move|a|{
        let allowed=a.previous().len()<=5&&trusted(a.url());
        crate::runtime_log::record("startup-examples","HTTP redirect",if allowed{"followed"}else{"rejected"},json!({"operationId":request_operation,"status":a.status().as_u16(),"toHost":a.url().host_str(),"redirectCount":a.previous().len(),"trusted":trusted(a.url())}));
        if allowed{a.follow()}else{a.stop()}
    })).build().map_err(|e|err("EXAMPLE_NETWORK",crate::network_diagnostics::error_message(&e)))?;
    progress(&s.id, "connecting", 0, None, None)?;
    let response = response_headers(s, client.get(&endpoint), &mut trace, RESPONSE_WAIT).await?;
    if let Err(error) = check_http_status(s, response.status()) {
        trace.operation.finish("failed", json!({"id":s.id,"asset":s.asset,"status":response.status().as_u16(),"code":error.code,"phase":"response headers","receivedBytes":0}));
        return Err(error);
    }
    if !trusted(response.url()) {
        return Err(err(
            "EXAMPLE_REDIRECT",
            format!("Example {} response used an untrusted redirect", s.id),
        ));
    }
    progress(&s.id, "downloading", 0, None, None)?;
    let bytes = receive(s, response, &root, &mut trace).await?;
    trace.operation.finish("passed",json!({"id":s.id,"receivedBytes":bytes.len(),"integrityVerified":true,"cacheCommitted":true}));
    Ok((bytes, false))
}
fn check_http_status(s: &Sample, status: reqwest::StatusCode) -> Result<(), BridgeError> {
    if status.is_success() {
        return Ok(());
    }
    let code = if status == reqwest::StatusCode::NOT_FOUND {
        "EXAMPLE_NOT_FOUND"
    } else {
        "EXAMPLE_HTTP"
    };
    Err(err(
        code,
        format!(
            "Example {}: HTTP {}; asset={} release={}. {}",
            s.id,
            status.as_u16(),
            s.asset,
            s.release_tag,
            if status == reqwest::StatusCode::NOT_FOUND {
                "The published example asset was not found."
            } else {
                "The server refused or could not serve the example request."
            }
        ),
    ))
}
fn wait_timeout(
    s: &Sample,
    trace: &mut crate::network_diagnostics::HttpTrace,
    phase: &str,
    wait: Duration,
    received: usize,
) -> BridgeError {
    let code = if phase == "response headers" {
        "EXAMPLE_CONNECT_TIMEOUT"
    } else {
        "EXAMPLE_BODY_TIMEOUT"
    };
    trace.operation.finish("failed", json!({"id":s.id,"asset":s.asset,"code":code,"phase":phase,"timeoutMs":wait.as_millis(),"receivedBytes":received,"rootCauseNotInferred":true}));
    err(
        code,
        format!(
            "Example {}: timed out waiting for {phase}; timeoutMs={}; receivedBytes={received}; asset={}. Check access to GitHub and its release asset host, then retry. This observation does not identify the DNS, proxy, TCP or TLS cause.",
            s.id,
            wait.as_millis(),
            s.asset
        ),
    )
}
async fn response_headers(
    s: &Sample,
    request: reqwest::RequestBuilder,
    trace: &mut crate::network_diagnostics::HttpTrace,
    wait: Duration,
) -> Result<reqwest::Response, BridgeError> {
    match tokio::time::timeout(wait, trace.send(request)).await {
        Ok(result) => result.map_err(|e| {
            err(
                "EXAMPLE_NETWORK",
                crate::network_diagnostics::error_message(&e),
            )
        }),
        Err(_) => Err(wait_timeout(s, trace, "response headers", wait, 0)),
    }
}
async fn receive(
    s: &Sample,
    response: reqwest::Response,
    root: &Path,
    trace: &mut crate::network_diagnostics::HttpTrace,
) -> Result<Vec<u8>, BridgeError> {
    receive_with_idle_timeout(s, response, root, trace, BODY_IDLE_WAIT).await
}
async fn receive_with_idle_timeout(
    s: &Sample,
    mut response: reqwest::Response,
    root: &Path,
    trace: &mut crate::network_diagnostics::HttpTrace,
    idle_wait: Duration,
) -> Result<Vec<u8>, BridgeError> {
    if response
        .content_length()
        .is_some_and(|n| n != s.size as u64)
    {
        return Err(err(
            "EXAMPLE_INTEGRITY",
            "Example Content-Length differs from the trusted descriptor",
        ));
    }
    let mut bytes = Vec::with_capacity(s.size);
    let mut transfer = crate::network_diagnostics::TransferProgress::new();
    loop {
        let part = tokio::time::timeout(idle_wait, response.chunk())
            .await
            .map_err(|_| wait_timeout(s, trace, "next body chunk", idle_wait, bytes.len()))?;
        let Some(chunk) = part.map_err(|e| {
            trace.fail("body stream", &e, bytes.len() as u64);
            err(
                "EXAMPLE_NETWORK",
                crate::network_diagnostics::error_message(&e),
            )
        })?
        else {
            break;
        };
        if bytes.len().saturating_add(chunk.len()) > s.size {
            return Err(err(
                "EXAMPLE_INTEGRITY",
                "Example body exceeded the trusted size",
            ));
        }
        bytes.extend_from_slice(&chunk);
        progress(&s.id, "downloading", bytes.len(), None, None)?;
        transfer.observe(&trace.operation, bytes.len() as u64, s.size as u64);
    }
    progress(&s.id, "verifying", bytes.len(), None, None)?;
    verified(s, &bytes)?;
    workspace_service::application_paths::validate_directory_path(root)
        .map_err(|e| err("EXAMPLE_STORAGE", e))?;
    let target = root.join(format!("{}.mp4", s.sha256));
    if let Ok(meta) = fs::symlink_metadata(&target) {
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(err("EXAMPLE_STORAGE", "Linked cache destination refused"));
            }
        }
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(err("EXAMPLE_STORAGE", "Unsafe cache destination"));
        }
    }
    let mut staging =
        tempfile::NamedTempFile::new_in(root).map_err(|e| err("EXAMPLE_STORAGE", e))?;
    staging
        .write_all(&bytes)
        .and_then(|_| staging.as_file().sync_all())
        .map_err(|e| {
            err(
                "EXAMPLE_STORAGE",
                format!("Example staging write/sync failed: {e}"),
            )
        })?;
    staging.persist(&target).map_err(|e| {
        err(
            "EXAMPLE_STORAGE",
            format!("Example cache commit failed: {e}"),
        )
    })?;
    Ok(bytes)
}
pub(crate) fn chunk(id: &str, offset: usize) -> Result<Value, BridgeError> {
    let s = sample(id)?;
    let data = jobs()
        .lock()
        .map_err(|_| err("EXAMPLE_STATE", "Example state unavailable"))?
        .get(id)
        .and_then(|j| j.data.clone())
        .ok_or_else(|| err("EXAMPLE_NOT_READY", "Download and verify the example first"))?;
    if offset > data.len() {
        return Err(BridgeError::invalid_request());
    }
    let end = offset.saturating_add(64 * 1024).min(data.len());
    Ok(
        json!({"data":base64::engine::general_purpose::STANDARD.encode(&data[offset..end]),"offset":offset,"nextOffset":end,"size":s.size,"done":end==data.len()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn small_sample(bytes: &[u8]) -> Sample {
        let mut s = catalog().unwrap().remove(0);
        s.size = bytes.len();
        s.sha256 = format!("{:x}", Sha256::digest(bytes));
        s
    }
    #[test]
    fn descriptors_are_fixed_and_renderer_urls_are_not_accepted() {
        let samples = catalog().unwrap();
        assert_eq!(samples.len(), 2);
        assert_eq!(samples.iter().map(|s| s.size).sum::<usize>(), 15606731);
        assert!(sample("https://github.com/arbitrary.mp4").is_err());
        for s in samples {
            assert_eq!(s.release_tag, "startup-examples-v1");
            assert!(s.sha256.len() == 64);
        }
        assert!(!trusted(
            &url::Url::parse("https://github.com.evil.invalid/x").unwrap()
        ));
        assert!(!trusted(&url::Url::parse("http://github.com/x").unwrap()));
        assert!(!trusted(
            &url::Url::parse("https://user:password@github.com/x").unwrap()
        ));
    }
    #[test]
    fn cache_integrity_is_verified_and_corruption_requires_redownload() {
        let root = tempfile::tempdir().unwrap();
        let s = small_sample(b"original bytes");
        let target = root.path().join(format!("{}.mp4", s.sha256));
        assert!(read_cached(root.path(), &s).unwrap().is_none());
        fs::write(&target, b"original bytes").unwrap();
        assert_eq!(
            read_cached(root.path(), &s).unwrap().unwrap(),
            b"original bytes"
        );
        fs::write(&target, b"tampered bytes").unwrap();
        assert!(read_cached(root.path(), &s).unwrap().is_none());
        assert_eq!(verified(&s, b"bad").unwrap_err().code, "EXAMPLE_INTEGRITY");
        fs::remove_file(&target).unwrap();
        fs::create_dir(&target).unwrap();
        assert_eq!(
            read_cached(root.path(), &s).unwrap_err().code,
            "EXAMPLE_STORAGE"
        );
    }
    #[test]
    fn missing_asset_and_server_refusal_are_distinct() {
        let s = small_sample(b"example");
        let missing = check_http_status(&s, reqwest::StatusCode::NOT_FOUND).unwrap_err();
        assert_eq!(missing.code, "EXAMPLE_NOT_FOUND");
        assert!(missing.message.contains(&s.asset) && missing.message.contains(&s.release_tag));
        for status in [403, 429, 503] {
            let error =
                check_http_status(&s, reqwest::StatusCode::from_u16(status).unwrap()).unwrap_err();
            assert_eq!(error.code, "EXAMPLE_HTTP");
            assert!(error.message.contains(&status.to_string()));
        }
    }
    #[tokio::test]
    async fn stalled_response_headers_fail_with_a_bounded_specific_error() {
        use tokio::io::AsyncReadExt;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut connection, _) = listener.accept().await.unwrap();
            let mut request = [0; 8192];
            let _ = connection.read(&mut request).await;
            tokio::time::sleep(Duration::from_secs(2)).await;
        });
        let s = small_sample(b"example");
        let endpoint = format!("http://{address}");
        let mut trace = crate::network_diagnostics::HttpTrace::start(
            "startup-examples",
            &endpoint,
            1000,
            3000,
            json!({"fixture":true}),
        );
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let error = response_headers(
            &s,
            client.get(endpoint),
            &mut trace,
            Duration::from_millis(100),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, "EXAMPLE_CONNECT_TIMEOUT");
        assert!(
            error.message.contains("response headers") && error.message.contains("receivedBytes=0")
        );
        server.abort();
    }
    #[tokio::test]
    async fn stalled_body_reports_received_bytes_and_preserves_previous_cache() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let bytes = b"original example";
        let s = small_sample(bytes);
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join(format!("{}.mp4", s.sha256));
        fs::write(&target, bytes).unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut connection, _) = listener.accept().await.unwrap();
            let mut request = [0; 8192];
            let _ = connection.read(&mut request).await;
            connection
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 16\r\nConnection: close\r\n\r\nori")
                .await
                .unwrap();
            tokio::time::sleep(Duration::from_secs(2)).await;
        });
        let endpoint = format!("http://{address}");
        let response = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(&endpoint)
            .send()
            .await
            .unwrap();
        let mut trace = crate::network_diagnostics::HttpTrace::start(
            "startup-examples",
            &endpoint,
            1000,
            3000,
            json!({"fixture":true}),
        );
        let error = receive_with_idle_timeout(
            &s,
            response,
            root.path(),
            &mut trace,
            Duration::from_millis(100),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, "EXAMPLE_BODY_TIMEOUT");
        assert!(error.message.contains("receivedBytes=3"));
        assert_eq!(fs::read(target).unwrap(), bytes);
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
        server.abort();
    }
    async fn response(bytes: Vec<u8>, length: usize) -> reqwest::Response {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut connection, _) = listener.accept().await.unwrap();
            let mut request = [0; 8192];
            let _ = connection.read(&mut request).await;
            let header =
                format!("HTTP/1.1 200 OK\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n");
            connection.write_all(header.as_bytes()).await.unwrap();
            connection.write_all(&bytes).await.unwrap();
        });
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{address}"))
            .send()
            .await
            .unwrap()
    }
    #[tokio::test]
    async fn transfer_commits_only_verified_bytes_and_preserves_previous_cache_on_error() {
        let root = tempfile::tempdir().unwrap();
        let bytes = b"original example";
        let s = small_sample(bytes);
        let mut trace = crate::network_diagnostics::HttpTrace::start(
            "startup-examples",
            "http://localhost",
            1000,
            3000,
            json!({"fixture":true}),
        );
        let r = response(bytes.to_vec(), bytes.len()).await;
        let received = receive(&s, r, root.path(), &mut trace).await.unwrap();
        assert_eq!(received, bytes);
        assert_eq!(read_cached(root.path(), &s).unwrap().unwrap(), bytes);
        let r = response(b"tampered example".to_vec(), bytes.len()).await;
        assert!(receive(&s, r, root.path(), &mut trace).await.is_err());
        assert_eq!(read_cached(root.path(), &s).unwrap().unwrap(), bytes);
        let r = response(bytes.to_vec(), bytes.len() + 1).await;
        assert_eq!(
            receive(&s, r, root.path(), &mut trace)
                .await
                .unwrap_err()
                .code,
            "EXAMPLE_INTEGRITY"
        );
        trace.operation.finish("passed", json!({"fixture":true}));
    }
    #[tokio::test]
    async fn interrupted_transfer_cannot_publish_a_partial_movie() {
        let root = tempfile::tempdir().unwrap();
        let s = small_sample(b"complete bytes");
        let mut trace = crate::network_diagnostics::HttpTrace::start(
            "startup-examples",
            "http://localhost",
            1000,
            3000,
            json!({"fixture":true}),
        );
        let r = response(b"short".to_vec(), s.size).await;
        assert_eq!(
            receive(&s, r, root.path(), &mut trace)
                .await
                .unwrap_err()
                .code,
            "EXAMPLE_NETWORK"
        );
        assert!(read_cached(root.path(), &s).unwrap().is_none());
        trace.operation.finish("passed", json!({"fixture":true}));
    }
    #[tokio::test]
    #[ignore = "explicit public sample download verification, isolated temporary cache"]
    async fn published_sample_assets_are_verified() {
        let root = tempfile::tempdir().unwrap();
        for s in catalog().unwrap() {
            let (bytes, cached) = download_at_root(&s, root.path()).await.unwrap();
            assert!(!cached);
            verified(&s, &bytes).unwrap();
            let (again, cached) = download_at_root(&s, root.path()).await.unwrap();
            assert!(cached);
            assert_eq!(again, bytes);
        }
    }
}
