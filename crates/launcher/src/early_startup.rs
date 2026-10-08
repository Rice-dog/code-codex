//! Optional loading-screen player, supervised independently of normal startup.
//! It carries no native capability and never pauses the official application.
use crate::{process_guard, runtime_log};
use cdp_client::{CdpEndpoint, TargetDiscovery};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    time::{Duration, Instant, SystemTime},
};
use tokio::net::TcpStream;
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async_with_config,
    tungstenite::{Message, protocol::WebSocketConfig},
};
use tokio_util::sync::CancellationToken;
use url::Url;

pub(super) const SOURCE: &str = include_str!("../../../packages/explorer-ui/dist/startup-early.js");
const WINDOW: Duration = Duration::from_secs(120);
const SNAPSHOT: &str = r#"JSON.stringify((()=>{const q=window[Symbol.for('code-codex:runtime-events:v1')];const events=q?q.events.filter(e=>e.source==='startup-animation'):[];if(q)q.events=q.events.filter(e=>e.source!=='startup-animation');const host=document.querySelector('.code-codex-startup-host');return {status:window.__CODE_CODEX_EARLY_STARTUP_STATUS__||{stage:'awaiting-document'},readyState:document.readyState,bodyPresent:!!document.body,videoPresent:!!(host&&host.shadowRoot&&host.shadowRoot.querySelector('video')),events}})())"#;

pub struct Worker {
    cancellation: CancellationToken,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.cancellation.cancel();
        self.task.abort();
    }
}
pub fn start(endpoint: CdpEndpoint, pid: u32, launched_after: SystemTime) -> Worker {
    let cancellation = CancellationToken::new();
    let cancel = cancellation.clone();
    let task = tokio::spawn(async move {
        let result = tokio::select! {
            ()=cancel.cancelled()=>Err("launch cancelled".to_owned()),
            result=supervise(endpoint,pid,launched_after,WINDOW)=>result,
        };
        match result {
            Ok(()) => event("worker", "finished", json!({})),
            Err(reason) => event(
                "worker",
                "stopped",
                json!({"reason":reason,"normalStartupUnaffected":true}),
            ),
        }
    });
    Worker { cancellation, task }
}
fn event(action: &str, outcome: &str, details: Value) {
    runtime_log::record("startup-animation", action, outcome, details);
}
fn eligible(kind: &str, url: &str) -> bool {
    kind == "page" && url == "app://-/index.html"
}
fn websocket_allowed(url: &Url, endpoint: CdpEndpoint) -> bool {
    url.scheme() == "ws"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(endpoint.port())
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
}

async fn supervise(
    endpoint: CdpEndpoint,
    pid: u32,
    launched_after: SystemTime,
    timeout: Duration,
) -> Result<(), String> {
    event(
        "worker",
        "started",
        json!({"port":endpoint.port(),"pid":pid,"discoveryWindowMs":timeout.as_millis(),"concurrentWithNormalStartup":true}),
    );
    let discovery = TargetDiscovery::new().map_err(|e| format!("discovery client: {e}"))?;
    let started = Instant::now();
    let mut attempts = 0u32;
    let mut candidates = HashMap::<String, usize>::new();
    let mut last_list = String::new();
    let mut last_error = String::new();
    let mut last_heartbeat = Instant::now();
    loop {
        if started.elapsed() >= timeout {
            return Err(format!(
                "loading-screen discovery deadline; attempts={attempts}; candidates={}; last failure={last_error}",
                candidates.len()
            ));
        }
        attempts += 1;
        match discovery.targets_detailed(endpoint).await {
            Err(error) => {
                let description = error;
                if last_error != description {
                    event(
                        "target discovery",
                        "retrying",
                        json!({"attempt":attempts,"elapsedMs":started.elapsed().as_millis(),"error":description}),
                    );
                    last_error = description;
                }
            }
            Ok(targets) => {
                let pages:Vec<Value>=targets.iter().filter(|t|t.target_type=="page").take(12).map(|t| {
                    let location=Url::parse(&t.url).ok();
                    let safe_location=location.as_ref().filter(|u|u.scheme()=="app"&&u.host_str()==Some("-")).map(|u|format!("app://-{}",u.path()));
                    json!({"location":safe_location.unwrap_or_else(||"non-main location omitted".into()),"queryPresent":location.as_ref().is_some_and(|u|u.query().is_some()),"filterAccepted":eligible(&t.target_type,&t.url),"websocketPresent":!t.web_socket_debugger_url.is_empty()})
                }).collect();
                let summary = json!({"targetCount":targets.len(),"pages":pages}).to_string();
                if summary != last_list {
                    event(
                        "target discovery",
                        "observed",
                        json!({"attempt":attempts,"elapsedMs":started.elapsed().as_millis(),"snapshot":serde_json::from_str::<Value>(&summary).unwrap_or(Value::Null)}),
                    );
                    last_list = summary;
                }
                for target in targets.iter().filter(|t| eligible(&t.target_type, &t.url)) {
                    let next = candidates.len() + 1;
                    let number = *candidates.entry(target.id.clone()).or_insert(next);
                    let url = Url::parse(&target.web_socket_debugger_url)
                        .map_err(|e| format!("page {number}: invalid WebSocket URL: {e}"))?;
                    if !websocket_allowed(&url, endpoint) {
                        return Err(format!(
                            "page {number}: WebSocket endpoint security check rejected"
                        ));
                    }
                    let remaining = timeout.saturating_sub(started.elapsed());
                    match tokio::time::timeout(
                        remaining,
                        session(endpoint, pid, launched_after, &url, number),
                    )
                    .await
                    {
                        Ok(Ok(())) => return Ok(()),
                        Ok(Err(error)) => {
                            event(
                                "candidate session",
                                "retrying",
                                json!({"page":number,"attempt":attempts,"reason":error}),
                            );
                            last_error = error;
                        }
                        Err(_) => {
                            return Err(format!(
                                "page {number}: loading-screen supervision deadline"
                            ));
                        }
                    }
                }
            }
        }
        if last_heartbeat.elapsed() >= Duration::from_secs(5) {
            event(
                "discovery progress",
                "waiting",
                json!({"elapsedMs":started.elapsed().as_millis(),"attempts":attempts,"candidates":candidates.len(),"lastFailure":last_error}),
            );
            last_heartbeat = Instant::now();
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn session(
    endpoint: CdpEndpoint,
    pid: u32,
    launched_after: SystemTime,
    url: &Url,
    page: usize,
) -> Result<(), String> {
    event(
        "listener ownership",
        "checking",
        json!({"page":page,"pid":pid,"port":endpoint.port()}),
    );
    process_guard::verify_listener_owner_fast(endpoint.port(), pid, launched_after)
        .map_err(|e| format!("listener owner: {e:?}"))?;
    event("listener ownership", "passed", json!({"page":page}));
    let config = WebSocketConfig::default()
        .max_message_size(Some(2 * 1024 * 1024))
        .max_frame_size(Some(2 * 1024 * 1024));
    let (mut socket, _) = tokio::time::timeout(
        Duration::from_secs(2),
        connect_async_with_config(url.as_str(), Some(config), false),
    )
    .await
    .map_err(|_| "WebSocket connection timed out".to_owned())?
    .map_err(|e| format!("WebSocket connection: {e}"))?;
    event("candidate session", "connected", json!({"page":page}));
    let mut id = 0u64;
    command(&mut socket, &mut id, "Page.enable", json!({})).await?;
    // The core carries only the entry hook. Both video and background playback
    // require the independently downloaded, hash-verified startup package.
    // Never download or wait for a network request while Codex is launching.
    let selected = command(&mut socket, &mut id, "Runtime.evaluate", json!({
        "expression":"(()=>{try{const s=JSON.parse(localStorage.getItem('code-codex:startup-transition:v1')||'null');return {enabled:s?.enabled===true,backgroundId:s?.enabled&&s.source==='background'?s.backgroundId:''}}catch{return {enabled:false,backgroundId:''}}})()",
        "returnByValue":true
    })).await.ok().and_then(|value|value.pointer("/result/value").cloned()).unwrap_or(Value::Null);
    let enabled = selected
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let background_id = selected
        .get("backgroundId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let mut sources = Vec::new();
    if enabled {
        match crate::plugin_store::sources("codex-startup-transition") {
            Ok(startup) => {
                let background = if background_id.is_empty() {
                    Ok(Vec::new())
                } else {
                    crate::plugin_store::sources(background_id)
                };
                match background {
                    Ok(mut background) => {
                        event(
                            "cached startup package",
                            "verified",
                            json!({"id":"codex-startup-transition","scriptCount":startup.len(),"verifiedScriptBytes":startup.iter().map(String::len).sum::<usize>(),"networkRequested":false,"stage":"before full UI"}),
                        );
                        if !background_id.is_empty() {
                            event(
                                "cached background",
                                "verified",
                                json!({"id":background_id,"scriptCount":background.len(),"verifiedScriptBytes":background.iter().map(String::len).sum::<usize>(),"networkRequested":false,"stage":"before full UI"}),
                            );
                        }
                        // Register background factories before the player, then run
                        // the tiny hook only after every required script is ready.
                        background.extend(startup);
                        sources = background;
                    }
                    Err(error) => event(
                        "cached background",
                        "unavailable",
                        json!({"id":background_id,"code":error.code,"reason":error.message,"startupSkipped":true,"networkRequested":false,"normalStartupUnaffected":true}),
                    ),
                }
            }
            Err(error) => event(
                "cached startup package",
                "unavailable",
                json!({"id":"codex-startup-transition","code":error.code,"reason":error.message,"startupSkipped":true,"networkRequested":false,"normalStartupUnaffected":true}),
            ),
        }
    } else {
        event(
            "cached startup package",
            "not requested",
            json!({"reason":"plugin disabled","networkRequested":false}),
        );
    }
    sources.push(SOURCE.to_owned());
    for (index, source) in sources.into_iter().enumerate() {
        // Keep this session alive so the new-document registration survives navigation.
        match command(
            &mut socket,
            &mut id,
            "Page.addScriptToEvaluateOnNewDocument",
            json!({"source":source}),
        )
        .await
        {
            Ok(_) => event("navigation hook", "installed", json!({"page":page})),
            Err(error) => event(
                "navigation hook",
                "failed",
                json!({"page":page,"reason":error,"fallback":"evaluate current document; reconnect after navigation"}),
            ),
        }
        command(
            &mut socket,
            &mut id,
            "Runtime.evaluate",
            json!({"expression":source,"returnByValue":true}),
        )
        .await?;
        event(
            "loading source",
            "evaluated",
            json!({"page":page,"sourceIndex":index,"sourceBytes":source.len(),"stage":"before full UI"}),
        );
    }
    let mut previous = String::new();
    loop {
        let value = command(
            &mut socket,
            &mut id,
            "Runtime.evaluate",
            json!({"expression":SNAPSHOT,"returnByValue":true}),
        )
        .await?;
        let text = value
            .pointer("/result/value")
            .and_then(Value::as_str)
            .ok_or("snapshot returned no JSON string")?;
        let snapshot: Value =
            serde_json::from_str(text).map_err(|e| format!("snapshot JSON: {e}"))?;
        if let Some(events) = snapshot["events"].as_array() {
            for entry in events.iter().take(1000) {
                if let (Some(action), Some(outcome)) =
                    (entry["action"].as_str(), entry["outcome"].as_str())
                {
                    runtime_log::record(
                        "startup-animation",
                        action,
                        outcome,
                        entry["details"].clone(),
                    );
                }
            }
        }
        let status = json!({"page":page,"status":snapshot["status"],"readyState":snapshot["readyState"],"bodyPresent":snapshot["bodyPresent"],"videoPresent":snapshot["videoPresent"]});
        let encoded = status.to_string();
        if encoded != previous {
            event("player status", "observed", status);
            previous = encoded;
        }
        if matches!(
            snapshot.pointer("/status/stage").and_then(Value::as_str),
            Some("complete" | "skipped" | "failed")
        ) {
            event(
                "candidate session",
                "completed",
                json!({"page":page,"playerStage":snapshot["status"]["stage"],"reason":snapshot["status"]["reason"]}),
            );
            let _ = socket.close(None).await;
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

async fn command(
    socket: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    id: &mut u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    *id += 1;
    let expected = *id;
    let started = Instant::now();
    // Log command names, never injected source, URL queries, page content or capability tokens.
    event(
        "CDP command",
        "sent",
        json!({"method":method,"id":expected}),
    );
    socket
        .send(Message::Text(
            json!({"id":expected,"method":method,"params":params})
                .to_string()
                .into(),
        ))
        .await
        .map_err(|e| format!("{method} send: {e}"))?;
    let mut received = 0usize;
    let result = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let message = socket
                .next()
                .await
                .ok_or_else(|| format!("{method}: WebSocket closed before reply"))?
                .map_err(|e| format!("{method} receive: {e}"))?;
            if let Message::Close(frame) = message {
                return Err(format!("{method}: WebSocket close frame {frame:?}"));
            }
            let Message::Text(text) = message else {
                continue;
            };
            received += 1;
            let value: Value = serde_json::from_str(&text)
                .map_err(|e| format!("{method}: invalid CDP JSON: {e}"))?;
            if value["id"].as_u64() != Some(expected) {
                if let Some(notification) = value["method"].as_str() {
                    if matches!(notification, "Page.frameNavigated" | "Page.domContentEventFired" | "Page.loadEventFired" | "Inspector.detached" | "Inspector.targetCrashed") {
                        event("renderer lifecycle", "observed", json!({"notification":notification,"topFrame":value.pointer("/params/frame/parentId").is_none()}));
                    }
                    if notification == "Page.frameNavigated" && value.pointer("/params/frame/parentId").is_none() {
                        if let Some(url) = value.pointer("/params/frame/url").and_then(Value::as_str) {
                            if !eligible("page",url) {
                                return Err("loading page navigated away from the canonical main document; rediscovering".to_owned());
                            }
                        }
                    }
                }
                continue;
            }
            if !value["error"].is_null() {
                return Err(format!("{method}: CDP error {}", value["error"]));
            }
            if !value
                .pointer("/result/exceptionDetails")
                .is_none_or(Value::is_null)
            {
                return Err(format!(
                    "{method}: JavaScript exception {}",
                    value["result"]["exceptionDetails"]
                ));
            }
            return value
                .get("result")
                .cloned()
                .ok_or_else(|| format!("{method}: missing result"));
        }
    })
    .await
    .map_err(|_| format!("{method}: reply timeout after 3000 ms; received messages={received}"))?;
    if method != "Runtime.evaluate" || result.is_err() {
        event(
            "CDP command",
            if result.is_ok() { "passed" } else { "failed" },
            json!({"method":method,"id":expected,"durationMs":started.elapsed().as_millis(),"receivedMessages":received,"reason":result.as_ref().err()}),
        );
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keeps_main_page_and_loopback_security_boundary() {
        assert!(eligible("page", "app://-/index.html"));
        for url in [
            "app://-/index.html?initialRoute=x",
            "app://-/detached-window.html",
            "https://example.com/index.html",
            "about:blank",
        ] {
            assert!(!eligible("page", url));
        }
        assert!(!eligible("worker", "app://-/index.html"));
        let endpoint = CdpEndpoint::loopback(1234);
        assert!(websocket_allowed(
            &Url::parse("ws://127.0.0.1:1234/devtools/page/test").unwrap(),
            endpoint
        ));
        for url in [
            "ws://localhost:1234/a",
            "ws://127.0.0.1:1235/a",
            "ws://user@127.0.0.1:1234/a",
            "ws://127.0.0.1:1234/a?x=1",
        ] {
            assert!(!websocket_allowed(&Url::parse(url).unwrap(), endpoint));
        }
    }

    #[tokio::test]
    async fn discovers_a_late_page_and_keeps_navigation_hook_alive_until_completion() {
        use std::sync::{Arc, Mutex};
        use tokio::{
            io::{AsyncReadExt, AsyncWriteExt},
            net::TcpListener,
        };
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = CdpEndpoint::loopback(listener.local_addr().unwrap().port());
        let commands = Arc::new(Mutex::new(Vec::<String>::new()));
        let seen = commands.clone();
        let born = Instant::now();
        let server = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let seen = seen.clone();
                tokio::spawn(async move {
                    let mut prefix = [0u8; 128];
                    let count = stream.peek(&mut prefix).await.unwrap();
                    if String::from_utf8_lossy(&prefix[..count]).starts_with("GET /json/list") {
                        let mut request_bytes = [0u8; 4096];
                        stream.read(&mut request_bytes).await.unwrap();
                        let targets = if born.elapsed() >= Duration::from_millis(3100) {
                            json!([{"id":"late-main","type":"page","title":"","url":"app://-/index.html","webSocketDebuggerUrl":format!("ws://127.0.0.1:{}/devtools/page/late",endpoint.port())}])
                        } else {
                            json!([])
                        };
                        let body = targets.to_string();
                        stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
                    } else {
                        let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
                        let mut snapshots = 0;
                        while let Some(Ok(Message::Text(text))) = ws.next().await {
                            let request: Value = serde_json::from_str(&text).unwrap();
                            let method = request["method"].as_str().unwrap();
                            seen.lock().unwrap().push(method.to_owned());
                            let snapshot = request
                                .pointer("/params/expression")
                                .and_then(Value::as_str)
                                == Some(SNAPSHOT);
                            let result = if snapshot {
                                snapshots += 1;
                                json!({"result":{"type":"string","value":json!({"status":{"stage":if snapshots>1 {"complete"}else{"playing"}},"readyState":"loading","bodyPresent":true,"videoPresent":true,"events":[]}).to_string()}})
                            } else {
                                json!({})
                            };
                            ws.send(Message::Text(
                                json!({"id":request["id"],"result":result})
                                    .to_string()
                                    .into(),
                            ))
                            .await
                            .unwrap();
                        }
                    }
                });
            }
        });
        supervise(
            endpoint,
            std::process::id(),
            SystemTime::UNIX_EPOCH,
            Duration::from_secs(8),
        )
        .await
        .unwrap();
        assert!(born.elapsed() >= Duration::from_secs(3));
        let methods = commands.lock().unwrap();
        assert!(
            methods
                .iter()
                .any(|m| m == "Page.addScriptToEvaluateOnNewDocument")
        );
        assert!(methods.iter().filter(|m| *m == "Runtime.evaluate").count() >= 3);
        server.abort();
    }

    #[tokio::test]
    async fn reports_original_cdp_error_and_command_name() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            let Some(Ok(Message::Text(text))) = ws.next().await else {
                panic!("missing request")
            };
            let request: Value = serde_json::from_str(&text).unwrap();
            ws.send(Message::Text(json!({"id":request["id"],"error":{"code":-32000,"message":"fixture broken document"}}).to_string().into())).await.unwrap();
        });
        let (mut socket, _) =
            connect_async_with_config(format!("ws://127.0.0.1:{port}"), None, false)
                .await
                .unwrap();
        let error = command(
            &mut socket,
            &mut 0,
            "Runtime.evaluate",
            json!({"expression":"true"}),
        )
        .await
        .unwrap_err();
        assert!(error.contains("Runtime.evaluate"));
        assert!(error.contains("-32000"));
        assert!(error.contains("fixture broken document"));
        server.await.unwrap();
    }
}
