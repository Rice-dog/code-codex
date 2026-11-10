//! Launch-owned transport for native hosts without a Node inspector.
//! This process is the official CLI's stdio parent, not another executor.
use super::{AccountError, Result, relay, startup};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    process::Stdio,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
};

pub(crate) const ENV: &str = "CODE_CODEX_STARTUP_BACKEND";
fn failure(stage: &str) -> AccountError {
    AccountError::new(
        "ACCOUNT_STARTUP_ROUTE",
        format!("Startup transport unavailable. stage={stage}; no request was replayed."),
    )
}
fn token(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 128
        && v.bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
#[derive(Clone)]
struct Binding {
    owner: String,
    target: Option<String>,
    proof: Option<String>,
}
#[derive(Default)]
struct State {
    routes: HashMap<String, Binding>,
    blocked: HashSet<String>,
    direct: HashSet<String>,
    threads: HashMap<String, Option<Option<String>>>,
    active: HashMap<String, usize>,
    enabled: bool,
}
impl State {
    fn remember(&mut self, thread: &Value) {
        let Some(id) = thread["id"].as_str().filter(|s| token(s)) else {
            return;
        };
        if self.threads.len() >= 8192 && !self.threads.contains_key(id) {
            return;
        }
        if thread.get("parentThreadId").is_none() && thread.get("source").is_none() {
            return;
        }
        let parent = thread
            .get("parentThreadId")
            .filter(|v| !v.is_null())
            .or_else(|| thread.pointer("/source/subAgent/thread_spawn/parent_thread_id"));
        let record = match parent {
            Some(v) => v.as_str().filter(|s| token(s)).map(|s| Some(s.to_owned())),
            None if thread["source"].get("subAgent").is_some() => None,
            None => Some(None),
        };
        let record = if self.threads.get(id).is_some_and(|old| old != &record) {
            None
        } else {
            record
        };
        self.threads.insert(id.into(), record);
    }
    fn root(&self, id: &str) -> Option<String> {
        let mut id = id;
        let mut seen = HashSet::new();
        for _ in 0..32 {
            if !seen.insert(id) {
                return None;
            }
            match self.threads.get(id)?.as_ref()? {
                Some(parent) => id = parent,
                None => return Some(id.into()),
            }
        }
        None
    }
}
struct Active {
    state: Arc<Mutex<State>>,
    root: String,
}
impl Drop for Active {
    fn drop(&mut self) {
        let mut s = self.state.lock().unwrap();
        if let Some(n) = s.active.get_mut(&self.root) {
            *n -= 1;
            if *n == 0 {
                s.active.remove(&self.root);
            }
        }
    }
}

fn parent_pid() -> u32 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
            System::Diagnostics::ToolHelp::*,
        };
        unsafe {
            let h = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if h == INVALID_HANDLE_VALUE {
                return 0;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of_val(&e) as u32;
            let mut next = Process32FirstW(h, &mut e);
            let mut parent = 0;
            while next != 0 {
                if e.th32ProcessID == std::process::id() {
                    parent = e.th32ParentProcessID;
                    break;
                }
                next = Process32NextW(h, &mut e);
            }
            CloseHandle(h);
            parent
        }
    }
    #[cfg(not(windows))]
    {
        0
    }
}

/// Called before Clap/logging; stdout remains exclusively official JSONL.
pub(crate) async fn run(raw: std::ffi::OsString) -> Result<u8> {
    let mut p: Value = serde_json::from_str(&raw.to_string_lossy())
        .map_err(|_| failure("launch-configuration"))?;
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let server = args.iter().any(|a| a == "app-server");
    let serving = server && !args.iter().any(|a| a == "--print-startup-config");
    let mut command = tokio::process::Command::new(
        p["backend"]
            .as_str()
            .ok_or_else(|| failure("backend-path"))?,
    );
    if server {
        command.args([
            "-c",
            &format!(
                "openai_base_url={}",
                json!(format!(
                    "http://localhost:{}/{}",
                    p["port"],
                    p["key"].as_str().unwrap()
                ))
            ),
            "-c",
            "features.enable_request_compression=false",
            "-c",
            "thread_unload_delay_secs=0",
        ]);
    }
    command
        .args(args)
        .env_remove(ENV)
        .env_remove("CODEX_CLI_PATH")
        .env("CODEX_APP_RUNTIME_CLI_PATH", p["backend"].as_str().unwrap())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    if serving {
        p["blocked"] = json!(startup::blocked_threads()?);
    }
    let state = Arc::new(Mutex::new(State {
        blocked: p["blocked"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        enabled: true,
        ..State::default()
    }));
    let listener = if serving {
        Some(
            TcpListener::bind((
                std::net::Ipv4Addr::LOCALHOST,
                p["port"].as_u64().unwrap() as u16,
            ))
            .await
            .map_err(|_| failure("bind"))?,
        )
    } else {
        None
    };
    let mut child = command.spawn().map_err(|_| failure("backend-spawn"))?;
    if let Some(listener) = listener {
        p["brokerPid"] = json!(std::process::id());
        let official = parent_pid();
        if official == 0 {
            return Err(failure("launch-parent"));
        }
        startup::save_descriptor(&p, official)?;
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| failure("client"))?;
        let direct = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| failure("local-client"))?;
        let state = state.clone();
        let p = p.clone();
        tokio::spawn(async move {
            while let Ok((stream, address)) = listener.accept().await {
                if !address.ip().is_loopback() {
                    continue;
                }
                let (state, p, client, direct) =
                    (state.clone(), p.clone(), client.clone(), direct.clone());
                tokio::spawn(async move {
                    let _ = serve(stream, state, p, official, client, direct).await;
                });
            }
        });
    }
    let mut input = child.stdin.take().unwrap();
    let mut output = child.stdout.take().unwrap();
    let stdin = tokio::spawn(async move {
        let _ = tokio::io::copy(&mut tokio::io::stdin(), &mut input).await;
    });
    let stdout = tokio::spawn(async move {
        let mut target = tokio::io::stdout();
        let mut bytes = vec![0u8; 64 * 1024];
        let mut line = Vec::new();
        let mut dropping = false;
        loop {
            let n = output
                .read(&mut bytes)
                .await
                .map_err(|_| failure("backend-read"))?;
            if n == 0 {
                break;
            }
            for segment in bytes[..n].split_inclusive(|b| *b == b'\n') {
                if !dropping {
                    if line.len() + segment.len() > 1024 * 1024 {
                        line.clear();
                        dropping = true;
                    } else {
                        line.extend_from_slice(segment);
                    }
                }
                if segment.last() == Some(&b'\n') {
                    if !dropping {
                        if let Ok(v) = serde_json::from_slice::<Value>(&line) {
                            let thread = if v["method"] == "thread/started" {
                                &v["params"]["thread"]
                            } else {
                                &v["result"]["thread"]
                            };
                            state.lock().unwrap().remember(thread);
                        }
                    }
                    line.clear();
                    dropping = false;
                }
            }
            target
                .write_all(&bytes[..n])
                .await
                .map_err(|_| failure("backend-forward"))?;
            target.flush().await.map_err(|_| failure("backend-flush"))?;
        }
        Ok::<_, AccountError>(())
    });
    let exit = child.wait().await.map_err(|_| failure("backend-exit"))?;
    stdin.abort();
    stdout.await.map_err(|_| failure("backend-output"))??;
    Ok(exit.code().unwrap_or(1).clamp(0, 255) as u8)
}

fn control(s: &mut State, v: &Value, p: &Value, official: u32) -> Result<Value> {
    let thread = v["thread"].as_str().filter(|s| token(s));
    match v["action"].as_str() {
        Some("status") => {
            return Ok(
                json!({"schema":1,"pid":official,"rendererPort":p["rendererPort"],"ready":true,"spawns":1,"enabled":s.enabled,"routeCount":s.routes.len(),"blockedCount":s.blocked.len()}),
            );
        }
        Some("route") if thread.is_some() => {
            let id = thread.unwrap();
            return Ok(
                json!({"direct":s.direct.contains(id),"blocked":s.blocked.contains(id),"target":s.routes.get(id).and_then(|b|b.target.as_ref())}),
            );
        }
        Some("native") if thread.is_some() && v["direct"].is_boolean() => {
            let id = thread.unwrap();
            if v["direct"] == true {
                if s.direct.len() >= 4096 && !s.direct.contains(id) {
                    return Err(failure("bound"));
                }
                s.direct.insert(id.into());
            } else {
                s.direct.remove(id);
                s.routes.remove(id);
                s.blocked.remove(id);
            }
            return Ok(json!({"accepted":true}));
        }
        _ => {}
    }
    let owner = v["owner"]
        .as_str()
        .filter(|v| v.len() == 64 && v.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(|| failure("binding-owner"))?;
    match v["action"].as_str() {
        Some("restore") => {
            if s.routes
                .iter()
                .any(|(id, b)| b.owner == owner && s.active.get(id).copied().unwrap_or(0) > 0)
            {
                return Err(failure("active"));
            }
            s.routes.retain(|_, b| b.owner != owner);
            s.blocked.clear();
            s.enabled = false;
        }
        Some("bind") if thread.is_some() => {
            let id = thread.unwrap();
            if s.active.get(id).copied().unwrap_or(0) > 0 {
                return Err(failure("active"));
            }
            let target = if v["target"].is_null() {
                None
            } else {
                let t = v["target"].as_str().ok_or_else(|| failure("target"))?;
                let u = url::Url::parse(t).map_err(|_| failure("target"))?;
                if u.scheme() != "http"
                    || u.host_str() != Some("localhost")
                    || u.port().is_none()
                    || !u.username().is_empty()
                    || u.password().is_some()
                    || u.query().is_some()
                    || u.fragment().is_some()
                    || u.path().len() != 33
                    || !u.path()[1..].bytes().all(|b| b.is_ascii_hexdigit())
                    || !v["proof"]
                        .as_str()
                        .is_some_and(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
                {
                    return Err(failure("target"));
                }
                Some(t.to_owned())
            };
            if s.routes.len() >= 4096 && !s.routes.contains_key(id)
                || s.routes.get(id).is_some_and(|b| b.owner != owner)
            {
                return Err(failure("binding-owner"));
            }
            s.routes.insert(
                id.into(),
                Binding {
                    owner: owner.into(),
                    target,
                    proof: v["proof"].as_str().map(String::from),
                },
            );
            s.blocked.remove(id);
            s.enabled = true;
        }
        _ => return Err(failure("binding-action")),
    }
    Ok(json!({"accepted":true}))
}
fn headers(mut h: reqwest::header::HeaderMap) -> reqwest::header::HeaderMap {
    for k in [
        "host",
        "connection",
        "proxy-authorization",
        "proxy-connection",
        "keep-alive",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "origin",
        "cookie",
        "content-length",
    ] {
        h.remove(k);
    }
    h
}
async fn serve(
    stream: TcpStream,
    state: Arc<Mutex<State>>,
    p: Value,
    official: u32,
    client: reqwest::Client,
    direct: reqwest::Client,
) -> Result<()> {
    let mut io = BufReader::new(stream);
    let raw = relay::read_header(&mut io).await?;
    let r = relay::parse_header_paths(
        &raw,
        &format!("localhost:{}", p["port"]),
        p["key"].as_str().unwrap(),
        &["/responses", "/responses/compact", "/control"],
    )?;
    if r.websocket {
        return relay::reject(
            &mut io,
            426,
            "ACCOUNT_STARTUP_HTTP: Use native HTTP transport.",
        )
        .await;
    }
    if r.path == "/control" {
        if r.headers
            .get("x-code-codex-control")
            .and_then(|v| v.to_str().ok())
            != p["control"].as_str()
            || r.length > 16384
        {
            return relay::reject(
                &mut io,
                403,
                "ACCOUNT_STARTUP_CONTROL: Control authentication failed.",
            )
            .await;
        }
        let mut body = vec![0; r.length];
        io.read_exact(&mut body)
            .await
            .map_err(|_| failure("control-read"))?;
        let reply = serde_json::from_slice(&body)
            .map_err(|_| failure("control-json"))
            .and_then(|v| control(&mut state.lock().unwrap(), &v, &p, official));
        return match reply {
            Ok(v) => {
                let body = v.to_string();
                io.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len()).as_bytes()).await.map_err(|_|failure("control-reply"))
            }
            Err(e) => relay::reject(&mut io, 409, &e.message).await,
        };
    }
    let id = r
        .headers
        .get("thread-id")
        .and_then(|v| v.to_str().ok())
        .filter(|v| token(v))
        .ok_or_else(|| failure("thread"))?;
    let (root, binding) = {
        let mut s = state.lock().unwrap();
        let root = s.root(id).ok_or_else(|| failure("lineage"))?;
        if r.headers.get("session-id").is_some_and(|v| {
            v.to_str()
                .map_or(true, |s| !token(s) || s != id && s != root)
        }) || s.blocked.contains(id)
            || s.blocked.contains(&root)
        {
            return Err(failure("pending"));
        }
        let binding = s.routes.get(&root).cloned();
        *s.active.entry(root.clone()).or_default() += 1;
        (root, binding)
    };
    let _active = Active { state, root };
    if let Some(b) = &binding {
        if b.target.is_some()
            && b.proof.as_deref()
                != Some(
                    format!(
                        "{:x}",
                        Sha256::digest(
                            r.headers
                                .get("authorization")
                                .map(|v| v.as_bytes())
                                .unwrap_or_default()
                        )
                    )
                    .as_str(),
                )
        {
            return Err(failure("owner"));
        }
    }
    let target = format!(
        "{}{}",
        binding
            .as_ref()
            .and_then(|b| b.target.as_deref())
            .unwrap_or("https://chatgpt.com/backend-api/codex"),
        r.path
    );
    let mut body = vec![0; r.length];
    io.read_exact(&mut body)
        .await
        .map_err(|_| failure("body"))?;
    let transport = if binding.as_ref().is_some_and(|b| b.target.is_some()) {
        &direct
    } else {
        &client
    };
    let request = transport
        .post(target)
        .headers(headers(r.headers))
        .body(body);
    let (mut reader, mut writer) = io.into_inner().into_split();
    let transfer = async {
        let mut response = match request.send().await {
            Ok(response) => response,
            Err(_) => {
                let body=json!({"error":{"type":"account_route_unavailable","message":"ACCOUNT_STARTUP_UPSTREAM: Upstream request failed; no request was replayed."}}).to_string();
                writer.write_all(format!("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",body.len()).as_bytes()).await.map_err(|_|failure("response-write"))?;
                return Ok(());
            }
        };
        let mut head = format!(
            "HTTP/1.1 {} Relayed\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n",
            response.status().as_u16()
        );
        for (k, v) in headers(response.headers().clone()).iter() {
            head.push_str(k.as_str());
            head.push_str(": ");
            head.push_str(v.to_str().map_err(|_| failure("response-header"))?);
            head.push_str("\r\n");
        }
        head.push_str("\r\n");
        writer
            .write_all(head.as_bytes())
            .await
            .map_err(|_| failure("response-write"))?;
        while let Some(bytes) = response
            .chunk()
            .await
            .map_err(|_| failure("upstream-stream"))?
        {
            if bytes.is_empty() {
                continue;
            }
            writer
                .write_all(format!("{:x}\r\n", bytes.len()).as_bytes())
                .await
                .map_err(|_| failure("response-write"))?;
            writer
                .write_all(&bytes)
                .await
                .map_err(|_| failure("response-write"))?;
            writer
                .write_all(b"\r\n")
                .await
                .map_err(|_| failure("response-write"))?;
        }
        writer
            .write_all(b"0\r\n\r\n")
            .await
            .map_err(|_| failure("response-write"))?;
        Ok(())
    };
    let mut disconnected = [0];
    tokio::select! {r=transfer=>r,_=reader.read(&mut disconnected)=>Ok(())}
}
