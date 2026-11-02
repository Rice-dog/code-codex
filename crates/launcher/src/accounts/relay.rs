//! Per-thread inference relay. Native execution/tools/history stay in the official process.
//! The renderer receives no account credential and cannot choose an upstream URL.
use super::{AccountError, Result};
use futures_util::{SinkExt, StreamExt};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
};
use tokio_tungstenite::{
    WebSocketStream,
    tungstenite::{Message, protocol::Role},
};
use tokio_util::sync::CancellationToken;

static QUOTA_REVISION: AtomicUsize = AtomicUsize::new(1);
static ROUTE_SEQUENCE: AtomicUsize = AtomicUsize::new(1);
const MAX_BODY: usize = 32 * 1024 * 1024;
const UPSTREAM: &str = "https://chatgpt.com/backend-api/codex";
#[derive(Default)]
pub(super) struct Routes(pub Mutex<HashMap<String, Arc<Route>>>);
pub(super) struct Route {
    pub owner: String,
    pub thread: String,
    pub base_url: String,
    cancel: CancellationToken,
    ready: AtomicBool,
    active: AtomicUsize,
    quota: Mutex<Option<Value>>,
    selection: std::sync::RwLock<Arc<Credential>>,
    client: reqwest::Client,
    key: String,
    authority: String,
    upstream: String,
    route_id: usize,
    requests: AtomicUsize,
    last_failure: Mutex<Option<Value>>,
}
enum Source {
    Managed(Arc<super::worker::Worker>),
    Official,
    #[cfg(test)]
    Fixture,
}
pub(super) struct Credential {
    pub connection: String,
    source: Source,
    email: String,
    auth: tokio::sync::Mutex<(Value, u64)>,
    cancel: CancellationToken,
}
impl Drop for Route {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}
impl Routes {
    pub fn key(owner: &str, thread: &str) -> String {
        format!("{owner}:{thread}")
    }
    pub fn get(&self, owner: &str, thread: &str) -> Option<Arc<Route>> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(&Self::key(owner, thread))
            .cloned()
    }
    pub fn owned(&self, owner: &str) -> Vec<Arc<Route>> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .values()
            .filter(|r| r.owner == owner)
            .cloned()
            .collect()
    }
    pub fn replace(&self, owner: &str, thread: &str, route: Option<Arc<Route>>) {
        let key = Self::key(owner, thread);
        let mut all = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous = all.get(&key).cloned();
        if let Some(r) = route {
            r.ready.store(true, Ordering::Release);
            if previous.as_ref().is_some_and(|old| Arc::ptr_eq(old, &r)) {
                return;
            }
            all.insert(key, r);
        } else {
            all.remove(&key);
        }
        if let Some(r) = previous {
            r.close();
        }
    }
    pub fn close_owner(&self, owner: &str) {
        for route in self.owned(owner) {
            self.replace(owner, &route.thread, None);
        }
    }
}
impl Route {
    pub async fn prepare_credential(
        connection: String,
        source: Arc<super::worker::Worker>,
        email: String,
    ) -> Result<Arc<Credential>> {
        let auth = super::credentials::managed(&source, &email).await?;
        Ok(Arc::new(Credential {
            connection,
            source: Source::Managed(source),
            email,
            auth: tokio::sync::Mutex::new((auth, now() + 240)),
            cancel: CancellationToken::new(),
        }))
    }
    pub fn prepare_official(email: String) -> Result<Arc<Credential>> {
        let auth = super::credentials::read(&super::credentials::official_home()?, &email, true)?;
        Ok(Arc::new(Credential {
            connection: "host".into(),
            source: Source::Official,
            email,
            auth: tokio::sync::Mutex::new((auth, now() + 240)),
            cancel: CancellationToken::new(),
        }))
    }
    pub async fn start(
        owner: String,
        thread: String,
        credential: Arc<Credential>,
    ) -> Result<Arc<Self>> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| fault("client"))?;
        Self::listen(owner, thread, credential, UPSTREAM.to_owned(), client).await
    }
    async fn listen(
        owner: String,
        thread: String,
        credential: Arc<Credential>,
        upstream: String,
        client: reqwest::Client,
    ) -> Result<Arc<Self>> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| fault("bind"))?;
        let authority = listener
            .local_addr()
            .map_err(|_| fault("local-address"))?
            .to_string();
        let key = super::nonce();
        let route = Arc::new(Self {
            owner,
            thread,
            base_url: format!("http://{authority}/{key}"),
            authority,
            key,
            cancel: CancellationToken::new(),
            ready: AtomicBool::new(false),
            active: AtomicUsize::new(0),
            quota: Mutex::new(None),
            selection: std::sync::RwLock::new(credential),
            client,
            upstream,
            route_id: ROUTE_SEQUENCE.fetch_add(1,Ordering::Relaxed),
            requests: AtomicUsize::new(0),
            last_failure: Mutex::new(None),
        });
        crate::runtime_log::record("accounts","account.relay.lifecycle","listening",json!({"routeId":route.route_id,"localPort":listener.local_addr().ok().map(|a|a.port()),"conversationId":route.thread,"connectionId":route.connection(),"committed":false,"network":crate::network_diagnostics::environment(),"taskSent":false}));
        let weak = Arc::downgrade(&route);
        let cancel = route.cancel.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {_ = cancel.cancelled()=>break,accepted=listener.accept()=>{let Ok((socket,peer))=accepted else{break};if !peer.ip().is_loopback(){continue;}let Some(route)=weak.upgrade()else{break};tokio::spawn(async move{let result=tokio::select!{_ = route.cancel.cancelled()=>Ok(()),r=route.handle(socket)=>r};if let Err(e)=result{crate::runtime_log::record("accounts","account.relay","failed",json!({"stage":e.message,"errorCode":e.code,"routeId":route.route_id,"conversationId":route.thread,"accountCredentialLogged":false,"requestReplayed":false}));}});}}
            }
        });
        Ok(route)
    }
    pub fn close(&self) {
        if !self.cancel.is_cancelled(){crate::runtime_log::record("accounts","account.relay.lifecycle","closed",json!({"routeId":self.route_id,"conversationId":self.thread,"activeRequests":self.active.load(Ordering::Relaxed),"requests":self.requests.load(Ordering::Relaxed),"taskReplayed":false}));}
        self.ready.store(false, Ordering::Release);
        self.cancel.cancel();
    }
    pub fn connection(&self) -> String {
        self.selection
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .connection
            .clone()
    }
    pub fn commit_credential(&self, credential: Arc<Credential>) {
        let mut selection = self
            .selection
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if Arc::ptr_eq(&selection, &credential) {
            return;
        }
        selection.cancel.cancel();
        *selection = credential;
        *self
            .quota
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }
    pub fn status(&self) -> Value {
        json!({"connectionId":self.connection(),"routed":true,"ready":self.ready.load(Ordering::Acquire)&&!self.cancel.is_cancelled(),"activeRequests":self.active.load(Ordering::Relaxed),"quota":self.quota.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone(),"diagnostics":{"routeId":self.route_id,"localPort":self.authority.rsplit(':').next().and_then(|p|p.parse::<u16>().ok()),"requests":self.requests.load(Ordering::Relaxed),"lastFailure":self.last_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone()}})
    }
    fn failed(&self,operation:&mut crate::runtime_log::Operation,stage:&str,details:Value){
        let value=json!({"stage":stage,"routeId":self.route_id,"operationId":operation.id(),"observedAt":now(),"evidence":details,"requestAccepted":"unknown","taskReplayed":false});
        *self.last_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(value.clone());
        operation.finish("failed",value);
    }
    async fn credential(&self, selection: &Credential) -> Result<Value> {
        let mut auth = selection.auth.lock().await;
        if now() + 30 >= auth.1 {
            auth.0 = match &selection.source {
                Source::Managed(source) => {
                    super::credentials::managed(source, &selection.email).await?
                }
                Source::Official => super::credentials::read(
                    &super::credentials::official_home()?,
                    &selection.email,
                    true,
                )?,
                #[cfg(test)]
                Source::Fixture => return Err(fault("fixture-expired")),
            };
            auth.1 = now() + 240;
        }
        Ok(auth.0.clone())
    }
    async fn handle(&self, socket: TcpStream) -> Result<()> {
        let mut io = BufReader::new(socket);
        let header = tokio::time::timeout(Duration::from_secs(10), read_header(&mut io))
            .await
            .map_err(|_| fault("request-header-timeout"))??;
        let request = match parse_header(&header, &self.authority, &self.key) {
            Ok(request) => request,
            Err(error) => {
                reject(
                    &mut io,
                    if error.message.contains("request-body-bound") {
                        413
                    } else {
                        403
                    },
                    &error.message,
                )
                .await?;
                return Err(error);
            }
        };
        let selection = self
            .selection
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        let mut operation = crate::runtime_log::Operation::start(
            "accounts",
            "account.relay",
            json!({"stage":"credential-bound","conversationId":self.thread,"connectionId":selection.connection,"routeId":self.route_id,"localPort":self.authority.rsplit(':').next().and_then(|p|p.parse::<u16>().ok()),"requestSequence":self.requests.fetch_add(1,Ordering::Relaxed)+1,"endpoint":if request.path=="/responses/compact"{"compact"}else{"responses"},"method":request.method.as_str(),"requestBytes":request.length,"transport":if request.websocket{"websocket"}else{"http"},"taskReplayed":false}),
        );
        if !self.ready.load(Ordering::Acquire) {
            operation.finish("blocked",json!({"stage":"route-admission","requestAccepted":false,"upstreamAttempted":false,"taskReplayed":false}));
            return reject(&mut io,503,&format!("ACCOUNT_RELAY_NOT_COMMITTED: stage=route-admission; operationId={}; no upstream request was sent.",operation.id())).await;
        }
        let auth = match self.credential(&selection).await {
            Ok(auth) => auth,
            Err(error) => {
                reject(
                    &mut io,
                    401,
                    &format!(
                        "{}: Account authentication failed. Re-authorize this account.",
                        error.code
                    ),
                )
                .await?;
                operation.finish("failed",json!({"stage":"credential-refresh","errorCode":error.code,"taskReplayed":false}));
                return Err(error);
            }
        };
        let headers = upstream_headers(&request.headers, &auth)?;
        let mut builder = self
            .client
            .request(
                request.method.clone(),
                format!("{}{}", self.upstream, request.path),
            )
            .headers(headers);
        if request.length > 0 {
            operation.event("account.relay.phase","observed",json!({"stage":"request-body","expectedBytes":request.length}));
            let mut body = vec![0; request.length];
            let stage=match tokio::time::timeout(Duration::from_secs(30), io.read_exact(&mut body)).await {Ok(Ok(_))=>None,Ok(Err(_))=>Some("request-body-incomplete"),Err(_)=>Some("request-body-timeout")};
            if let Some(stage)=stage {
                self.failed(&mut operation,stage,json!({"upstreamAttempted":false,"expectedBytes":request.length,"receivedBytes":"unknown"}));
                reject(&mut io,408,&format!("ACCOUNT_RELAY_REQUEST_BODY: stage={stage}; operationId={}; no upstream request was sent.",operation.id())).await?;
                return Err(fault(stage));
            }
            builder = builder.body(body);
        }
        // Request bodies, routing capabilities and upstream errors never enter logs.
        if selection.cancel.is_cancelled() {
            return Err(fault("credential-selection-superseded"));
        }
        operation.event("account.relay.phase","observed",json!({"stage":"upstream-send","requestAcceptance":"unknown"}));
        let mut response = match builder.send().await {
            Ok(response) => response,
            Err(error) => {
                let category = if error.is_timeout() {"timeout"} else if error.is_connect() {"connect"} else if error.is_body() {"body"} else if error.is_decode() {"decode"} else {"transport"};
                self.failed(&mut operation,"upstream-connect",json!({"category":category,"timeout":error.is_timeout(),"connect":error.is_connect(),"networkDiagnosis":crate::network_diagnostics::diagnose(&error,"send").value()}));
                reject(&mut io,502,&format!("ACCOUNT_RELAY_UPSTREAM: stage=upstream-connect; category={category}; operationId={}; request acceptance is unknown; no request was replayed.",operation.id())).await?;
                return Err(fault("upstream-connect"));
            }
        };
        operation.event("account.relay.response","received",json!({"stage":"upstream-response","status":response.status().as_u16(),"correlation":super::relay_diagnostics::correlation(response.headers()),"taskReplayed":false}));
        if response.status().is_server_error() {
            operation.event("account.relay.upstream-http", "failed", json!({"stage":"upstream-http-status","status":response.status().as_u16(),"requestAccepted":"unknown","taskReplayed":false}));
        }
        if response.status() == 401 {
            selection.auth.lock().await.1 = 0;
        }
        if request.websocket && response.status() == 101 {
            let key = request
                .headers
                .get("sec-websocket-key")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| fault("websocket-key"))?;
            let accept =
                tokio_tungstenite::tungstenite::handshake::derive_accept_key(key.as_bytes());
            if response
                .headers()
                .get("sec-websocket-accept")
                .and_then(|v| v.to_str().ok())
                != Some(accept.as_str())
            {
                return Err(fault("websocket-accept"));
            }
            self.observe_headers(response.headers());
            let upstream = response
                .upgrade()
                .await
                .map_err(|_| fault("websocket-upgrade"))?;
            io.write_all(format!("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n").as_bytes()).await.map_err(|_|fault("websocket-client"))?;
            let mut config = tokio_tungstenite::tungstenite::protocol::WebSocketConfig::default();
            config.max_message_size = Some(MAX_BODY);
            config.max_frame_size = Some(MAX_BODY);
            let mut client = WebSocketStream::from_raw_socket(io, Role::Server, Some(config)).await;
            let mut server =
                WebSocketStream::from_raw_socket(upstream, Role::Client, Some(config)).await;
            let mut sampling: Option<Active<'_>> = None;
            let mut client_frames=0u64;let mut server_frames=0u64;let mut sampling_requests=0u64;
            let closed_by=loop {
                tokio::select! {biased;
                 _=selection.cancel.cancelled()=>break "identity-changed",
                 m=client.next()=>{let m=match m{Some(Ok(m))=>m,Some(Err(_))=>break "client-read-error",None=>break "client-eof"};client_frames+=1;if let Message::Text(text)=&m{if text.len()>MAX_BODY{return Err(fault("websocket-message-bound"));}if json_type(text)==Some("response.create")&&sampling.is_none(){self.active.fetch_add(1,Ordering::Relaxed);sampling=Some(Active(&self.active));sampling_requests+=1;operation.event("account.relay.sampling","started",json!({"samplingSequence":sampling_requests,"stage":"websocket-response-create","requestAccepted":"unknown"}));}}if server.send(m).await.is_err(){break "upstream-write-error";}}
                 m=server.next()=>{let m=match m{Some(Ok(m))=>m,Some(Err(_))=>break "upstream-read-error",None=>break "upstream-eof"};server_frames+=1;let mut pass=true;if let Message::Text(text)=&m{if text.len()>MAX_BODY{return Err(fault("websocket-response-bound"));}if let Ok(value)=serde_json::from_str::<Value>(text){pass=!self.observe_event(&value);let kind=value["type"].as_str().unwrap_or("");if matches!(kind,"response.completed"|"response.failed"|"error"){let evidence=json!({"samplingSequence":sampling_requests,"stage":kind,"classification":super::relay_diagnostics::failure_class(&value),"taskReplayed":false});operation.event("account.relay.sampling",if kind=="response.completed"{"completed"}else{"failed"},evidence.clone());if kind!="response.completed"{*self.last_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(json!({"routeId":self.route_id,"operationId":operation.id(),"observedAt":now(),"stage":"websocket-response-error","evidence":evidence,"taskReplayed":false}));}sampling.take();}else if kind=="response.compaction.compacting"{operation.event("account.relay.compaction","observed",json!({"samplingSequence":sampling_requests,"stage":"upstream-compacting","taskReplayed":false}));}}}if pass&&client.send(m).await.is_err(){break "client-write-error";}}
                }
            };
            let details=json!({"stage":"websocket-closed","closedBy":closed_by,"samplingActive":sampling.is_some(),"samplingRequests":sampling_requests,"clientFrames":client_frames,"serverFrames":server_frames,"identityChanged":selection.cancel.is_cancelled(),"taskReplayed":false});
            if sampling.is_some()&&!selection.cancel.is_cancelled(){self.failed(&mut operation,"websocket-disconnected",details);}else{operation.finish("closed",details);}
            return Ok(());
        }
        self.active.fetch_add(1, Ordering::Relaxed);
        let _active = Active(&self.active);
        self.observe_headers(response.headers());
        let status = response.status().as_u16();
        // Do not publish child quota headers to the official host-account cache.
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/json");
        let mut correlation = String::new();
        for name in [
            "retry-after",
            "x-request-id",
            "request-id",
            "x-should-retry",
        ] {
            if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
                correlation.push_str(&format!("{name}: {value}\r\n"));
            }
        }
        io.write_all(format!("HTTP/1.1 {status} Relayed\r\nContent-Type: {content_type}\r\n{correlation}Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n").as_bytes()).await.map_err(|_|fault("response-header"))?;
        let mut body_evidence=super::relay_diagnostics::ErrorBody::default();let mut received=0u64;
        loop {
            let bytes=match response.chunk().await{Ok(Some(bytes))=>bytes,Ok(None)=>break,Err(error)=>{self.failed(&mut operation,"response-stream",json!({"status":status,"receivedBytes":received,"networkDiagnosis":crate::network_diagnostics::diagnose(&error,"body").value()}));return Err(fault("response-stream"));}};
            if bytes.is_empty() {
                continue;
            }
            if selection.cancel.is_cancelled() {
                return Err(fault("credential-selection-superseded"));
            }
            received=received.saturating_add(bytes.len() as u64);
            if status>=400 {body_evidence.observe(&bytes);}
            io.write_all(format!("{:x}\r\n", bytes.len()).as_bytes())
                .await
                .map_err(|_| fault("response-client"))?;
            io.write_all(&bytes)
                .await
                .map_err(|_| fault("response-client"))?;
            io.write_all(b"\r\n")
                .await
                .map_err(|_| fault("response-client"))?;
            io.flush().await.map_err(|_| fault("response-client"))?;
        }
        io.write_all(b"0\r\n\r\n")
            .await
            .map_err(|_| fault("response-client"))?;
        if status>=400 {self.failed(&mut operation,"upstream-http-error",json!({"status":status,"body":body_evidence.summary()}));}
        else {operation.finish("completed",json!({"stage":"http-stream-complete","status":status,"receivedBytes":received,"taskReplayed":false}));}
        Ok(())
    }
    fn record_quota(&self, mut quota: Value) {
        quota["observedAtMs"] = json!(SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64);
        quota["observationRevision"] = json!(QUOTA_REVISION.fetch_add(1, Ordering::Relaxed));
        *self.quota.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(quota);
    }
    fn observe_headers(&self, h: &HeaderMap) {
        let window = |name: &str| {
            let read = |suffix: &str| {
                h.get(format!("x-codex-{name}-{suffix}"))
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<f64>().ok())
                    .filter(|v| v.is_finite() && *v >= 0.0)
            };
            let reset =
                read("reset-at").or_else(|| read("reset-after-seconds").map(|v| v + now() as f64));
            json!({"usedPercent":read("used-percent"),"windowDurationMins":read("window-minutes").map(|v|v as u64),"resetsAt":reset.map(|v|v as u64)})
        };
        let quota = super::usage::project(
            &json!({"rateLimits":{"limitId":"codex","primary":window("primary"),"secondary":window("secondary")}}),
        );
        if !quota["rateLimits"]["primary"].is_null() || !quota["rateLimits"]["secondary"].is_null()
        {
            self.record_quota(quota);
        }
    }
    // Quota-only WebSocket frames belong to this route, not the official GUI login.
    fn observe_event(&self, v: &Value) -> bool {
        let kind = v["type"].as_str().unwrap_or("");
        if !matches!(
            kind,
            "rate_limits.updated" | "codex.rate_limits" | "account.rate_limits.updated"
        ) {
            return false;
        }
        let raw = if v.get("rateLimits").is_some() {
            v.clone()
        } else {
            json!({"rateLimits":v.get("rate_limits").cloned().unwrap_or(Value::Null)})
        };
        let quota = super::usage::project(&raw);
        if !quota["rateLimits"]["primary"].is_null() {
            self.record_quota(quota);
        }
        true
    }
}
struct Active<'a>(&'a AtomicUsize);
impl Drop for Active<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn fault(stage: &str) -> AccountError {
    AccountError::new(
        "ACCOUNT_RELAY",
        format!("stage={stage}; account route forwarding failed; no request was replayed."),
    )
}
async fn reject(io: &mut BufReader<TcpStream>, status: u16, message: &str) -> Result<()> {
    let body = json!({"error":{"message":message,"type":"account_route_unavailable"}}).to_string();
    io.write_all(format!("HTTP/1.1 {status} Rejected\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len()).as_bytes()).await.map_err(|_|fault("reject"))?;
    Ok(())
}
async fn read_header(io: &mut BufReader<TcpStream>) -> Result<String> {
    let mut bytes = Vec::new();
    loop {
        let n = io
            .read_until(b'\n', &mut bytes)
            .await
            .map_err(|_| fault("request-header"))?;
        if n == 0 || bytes.len() > 32768 {
            return Err(fault("request-header-bound"));
        }
        if bytes.ends_with(b"\r\n\r\n") {
            return String::from_utf8(bytes).map_err(|_| fault("request-header-encoding"));
        }
    }
}
struct Request {
    method: reqwest::Method,
    path: String,
    headers: HeaderMap,
    length: usize,
    websocket: bool,
}
fn parse_header(raw: &str, authority: &str, key: &str) -> Result<Request> {
    let mut lines = raw.split("\r\n");
    let start: Vec<_> = lines.next().unwrap_or("").split(' ').collect();
    if start.len() != 3 || start[2] != "HTTP/1.1" {
        return Err(fault("request-line"));
    }
    let path = start[1]
        .strip_prefix(&format!("/{key}"))
        .filter(|p| matches!(*p, "/responses" | "/responses/compact"))
        .ok_or_else(|| fault("request-route"))?
        .to_owned();
    let mut headers = HeaderMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| fault("request-header-shape"))?;
        let name =
            HeaderName::from_bytes(name.as_bytes()).map_err(|_| fault("request-header-name"))?;
        if headers.contains_key(&name) {
            return Err(fault("request-header-duplicate"));
        }
        headers.insert(
            name,
            HeaderValue::from_str(value.trim()).map_err(|_| fault("request-header-value"))?,
        );
    }
    if headers.get("host").and_then(|v| v.to_str().ok()) != Some(authority)
        || headers.contains_key("origin")
        || headers.contains_key("transfer-encoding")
    {
        return Err(fault("request-origin"));
    }
    let websocket = headers
        .get("upgrade")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("websocket"));
    let method = match start[0] {
        "POST" if !websocket => reqwest::Method::POST,
        "GET" if websocket && path == "/responses" => reqwest::Method::GET,
        _ => return Err(fault("request-method")),
    };
    let length = match headers.get("content-length") {
        Some(v) => v
            .to_str()
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .filter(|n| *n <= MAX_BODY)
            .ok_or_else(|| fault("request-body-bound"))?,
        None if websocket => 0,
        None => return Err(fault("request-body-length")),
    };
    Ok(Request {
        method,
        path,
        headers,
        length,
        websocket,
    })
}
fn upstream_headers(input: &HeaderMap, auth: &Value) -> Result<HeaderMap> {
    let mut out = HeaderMap::new();
    for (name, value) in input {
        if matches!(
            name.as_str(),
            "user-agent"
                | "content-type"
                | "accept"
                | "openai-beta"
                | "originator"
                | "version"
                | "session_id"
                | "conversation_id"
                | "sec-websocket-key"
                | "sec-websocket-version"
                | "upgrade"
                | "connection"
        ) || name.as_str().starts_with("x-codex-")
        {
            out.insert(name.clone(), value.clone());
        }
    }
    out.insert(
        "authorization",
        HeaderValue::from_str(&format!(
            "Bearer {}",
            auth["accessToken"]
                .as_str()
                .ok_or_else(|| fault("credential-token"))?
        ))
        .map_err(|_| fault("credential-header"))?,
    );
    out.insert(
        "chatgpt-account-id",
        HeaderValue::from_str(
            auth["chatgptAccountId"]
                .as_str()
                .ok_or_else(|| fault("credential-account"))?,
        )
        .map_err(|_| fault("credential-header"))?,
    );
    Ok(out)
}
fn json_type(text: &str) -> Option<&str> {
    if serde_json::from_str::<Value>(text)
        .ok()
        .is_some_and(|v| v["type"] == "response.create")
    {
        Some("response.create")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn error_response(path:&str,status:u16,body:&str)->(Arc<Route>,reqwest::Response,tokio::task::JoinHandle<()>) {
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();let body=body.to_owned();
        let backend=tokio::spawn(async move{let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);read_header(&mut io).await.unwrap();let mut input=[0;2];io.read_exact(&mut input).await.unwrap();io.write_all(format!("HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nx-request-id: fixture-correlation\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();});
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("owner".into(),"thread".into(),credential("B"),format!("http://{address}"),client.clone()).await.unwrap();route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}{path}",route.base_url)).body("{}").send().await.unwrap();(route,response,backend)
    }
    #[tokio::test] async fn compact_context_error_is_attributed_without_logging_body_or_replaying(){
        crate::runtime_log::capture_test_events();
        let body=r#"{"error":{"code":"context_length_exceeded","message":"private-user-input"}}"#;
        let (route,response,backend)=error_response("/responses/compact",400,body).await;
        assert_eq!(response.status(),400);assert_eq!(response.text().await.unwrap(),body);backend.await.unwrap();tokio::time::sleep(Duration::from_millis(10)).await;
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["evidence"]["body"]["classification"],"context-limit");assert!(!failure.to_string().contains("private-user-input"));
        let events=crate::runtime_log::take_test_events();assert!(events.iter().any(|e|e["details"]["endpoint"]=="compact"));assert!(!serde_json::to_string(&events).unwrap().contains("private-user-input"));assert_eq!(route.requests.load(Ordering::Relaxed),1);route.close();
    }
    #[tokio::test] async fn empty_upstream_502_has_distinct_retained_evidence(){
        let (route,response,backend)=error_response("/responses",502,"").await;assert_eq!(response.status(),502);assert_eq!(response.text().await.unwrap(),"");backend.await.unwrap();tokio::time::sleep(Duration::from_millis(10)).await;
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["stage"],"upstream-http-error");assert_eq!(failure["evidence"]["body"]["emptyBody"],true);assert_eq!(failure["evidence"]["status"],502);assert!(!failure.to_string().contains(&route.key));route.close();
    }
    #[tokio::test] async fn truncated_response_retains_stream_stage_and_observed_bytes(){
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move{let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);read_header(&mut io).await.unwrap();let mut body=[0;2];io.read_exact(&mut body).await.unwrap();io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{}").await.unwrap();});
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("owner".into(),"thread".into(),credential("B"),format!("http://{address}"),client.clone()).await.unwrap();route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}/responses",route.base_url)).body("{}").send().await.unwrap();assert!(response.text().await.is_err());backend.await.unwrap();tokio::time::sleep(Duration::from_millis(10)).await;
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["stage"],"response-stream");assert_eq!(failure["evidence"]["receivedBytes"],2);assert_eq!(route.requests.load(Ordering::Relaxed),1);route.close();
    }
    fn credential(id: &str) -> Arc<Credential> {
        Arc::new(Credential {
            connection: id.into(),
            source: Source::Fixture,
            email: "fixture@example.invalid".into(),
            auth: tokio::sync::Mutex::new((
                json!({"accessToken":format!("fixture-{id}"),"chatgptAccountId":id}),
                now() + 3600,
            )),
            cancel: CancellationToken::new(),
        })
    }
    #[tokio::test]
    async fn failed_upstream_connection_returns_specific_nonsecret_diagnostic() {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();
        let address=listener.local_addr().unwrap();drop(listener);
        let client=reqwest::Client::builder().no_proxy().build().unwrap();
        let route=Route::listen("owner".into(),"thread".into(),credential("B"),format!("http://{address}"),client.clone()).await.unwrap();
        route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}/responses",route.base_url)).body("{}").send().await.unwrap();
        assert_eq!(response.status(),502);let text=response.text().await.unwrap();
        assert!(text.contains("ACCOUNT_RELAY_UPSTREAM"));assert!(text.contains("category=connect"));assert!(text.contains("operationId="));
        assert!(!text.contains(&route.key));assert!(!text.contains("fixture-B"));assert!(!text.contains(&address.to_string()));route.close();
    }
    #[tokio::test]
    async fn upstream_http_502_is_preserved_without_replaying_the_request() {
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move {let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);read_header(&mut io).await.unwrap();let mut body=[0;2];io.read_exact(&mut body).await.unwrap();io.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();assert!(tokio::time::timeout(Duration::from_millis(100),listener.accept()).await.is_err());});
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("owner".into(),"thread".into(),credential("B"),format!("http://{address}"),client.clone()).await.unwrap();route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}/responses",route.base_url)).body("{}").send().await.unwrap();assert_eq!(response.status(),502);assert_eq!(response.text().await.unwrap(),"{}");backend.await.unwrap();route.close();
    }
    #[tokio::test]
    async fn http_route_reuses_one_listener_and_attributes_quota_without_host_cache_headers() {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let backend = tokio::spawn(async move {
            for expected in ["B", "C"] {
                let (socket, _) = listener.accept().await.unwrap();
                let mut io = BufReader::new(socket);
                let raw = read_header(&mut io).await.unwrap();
                assert!(raw.to_ascii_lowercase().contains(&format!(
                    "authorization: bearer fixture-{}",
                    expected.to_ascii_lowercase()
                )));
                assert!(raw.contains(&format!("chatgpt-account-id: {expected}")));
                assert!(!raw.contains("cookie:"));
                let length = raw
                    .lines()
                    .find_map(|s| {
                        s.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .map(|v| v.trim().parse::<usize>().unwrap())
                    })
                    .unwrap();
                let mut body = vec![0; length];
                io.read_exact(&mut body).await.unwrap();
                assert_eq!(body, b"{\"fixture\":true}");
                io.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nx-codex-primary-used-percent: 41\r\nx-codex-primary-window-minutes: 300\r\nx-codex-primary-reset-at: {}\r\nConnection: close\r\n\r\n{{}}",now()+3600).as_bytes()).await.unwrap();
            }
        });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let route = Route::listen(
            "owner".into(),
            "thread".into(),
            credential("B"),
            format!("http://{address}"),
            client.clone(),
        )
        .await
        .unwrap();
        route.ready.store(true, Ordering::Release);
        let original = route.base_url.clone();
        for expected in ["B", "C"] {
            if expected == "C" {
                route.commit_credential(credential("C"));
            }
            let result = client
                .post(format!("{}/responses", route.base_url))
                .header("authorization", "Bearer host")
                .header("cookie", "host-cookie")
                .body("{\"fixture\":true}")
                .send()
                .await
                .unwrap();
            assert_eq!(result.status(), 200);
            assert!(
                !result
                    .headers()
                    .contains_key("x-codex-primary-used-percent")
            );
            assert_eq!(result.text().await.unwrap(), "{}");
            assert_eq!(route.connection(), expected);
            assert_eq!(
                route.status()["quota"]["rateLimits"]["primary"]["usedPercent"],
                41.0
            );
            let first = route.status()["quota"].clone();
            assert!(first["observedAtMs"].as_u64().unwrap() > 0);
            assert!(first["observationRevision"].as_u64().unwrap() > 0);
            assert_eq!(route.status()["quota"], first, "status reads must preserve original observation metadata");
            assert_eq!(route.base_url, original);
        }
        route.close();
        backend.await.unwrap();
    }
    #[tokio::test]
    async fn websocket_forwards_native_messages_and_closes_old_identity_on_switch() {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let backend = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut ws=tokio_tungstenite::accept_hdr_async(socket,|request:&tokio_tungstenite::tungstenite::handshake::server::Request,response:tokio_tungstenite::tungstenite::handshake::server::Response|{assert_eq!(request.headers()["authorization"],"Bearer fixture-B");assert_eq!(request.headers()["chatgpt-account-id"],"B");Ok(response)}).await.unwrap();
            assert_eq!(
                ws.next().await.unwrap().unwrap().to_text().unwrap(),
                "{\"type\":\"response.create\"}"
            );
            ws.send(Message::Text(json!({"type":"rate_limits.updated","rateLimits":{"primary":{"usedPercent":41,"windowDurationMins":300,"resetsAt":now()+3600}}}).to_string().into())).await.unwrap();
            ws.send(Message::Text(
                "{\"type\":\"response.completed\",\"fixture\":true}".into(),
            ))
            .await
            .unwrap();
            let _ = ws.next().await;
        });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let route = Route::listen(
            "owner".into(),
            "thread".into(),
            credential("B"),
            format!("http://{address}"),
            client,
        )
        .await
        .unwrap();
        route.ready.store(true, Ordering::Release);
        let (socket, _) = TcpStream::connect(&route.authority)
            .await
            .map(|s| (s, ()))
            .unwrap();
        let (mut ws, _) = tokio_tungstenite::client_async(
            route.base_url.replace("http://", "ws://") + "/responses",
            socket,
        )
        .await
        .unwrap();
        ws.send(Message::Text("{\"type\":\"response.create\"}".into()))
            .await
            .unwrap();
        let message = ws.next().await.unwrap().unwrap();
        assert_eq!(
            message.to_text().unwrap(),
            "{\"type\":\"response.completed\",\"fixture\":true}"
        );
        assert_eq!(
            route.status()["quota"]["rateLimits"]["primary"]["usedPercent"],
            41
        );
        route.commit_credential(credential("C"));
        let closed = tokio::time::timeout(Duration::from_secs(2), ws.next())
            .await
            .unwrap();
        assert!(closed.is_none() || closed.unwrap().is_err());
        route.close();
        backend.await.unwrap();
    }
    #[test]
    fn route_is_bounded_and_rejects_browser_and_ambiguous_framing() {
        let valid =
            "POST /key/responses HTTP/1.1\r\nHost: 127.0.0.1:1\r\nContent-Length: 2\r\n\r\n";
        assert!(parse_header(valid, "127.0.0.1:1", "key").is_ok());
        for raw in [
            valid.replace("/key/", "/other/"),
            valid.replace("responses ", "../responses "),
            valid.replace(
                "Content-Length: 2",
                "Content-Length: 2\r\nContent-Length: 2",
            ),
            valid.replace(
                "Content-Length: 2",
                "Content-Length: 2\r\nOrigin: https://example.invalid",
            ),
            valid.replace("Content-Length: 2", "Transfer-Encoding: chunked"),
            valid.replace("Content-Length: 2", "Content-Length: 999999999"),
        ] {
            assert!(parse_header(&raw, "127.0.0.1:1", "key").is_err());
        }
    }
    #[test]
    fn native_credentials_replace_host_headers_without_cookie_or_billing_fallback() {
        let mut h = HeaderMap::new();
        h.insert("authorization", HeaderValue::from_static("Bearer host"));
        h.insert("cookie", HeaderValue::from_static("host"));
        h.insert("openai-organization", HeaderValue::from_static("host"));
        h.insert("chatgpt-account-id", HeaderValue::from_static("host"));
        let out = upstream_headers(
            &h,
            &json!({"accessToken":"child","chatgptAccountId":"child-account"}),
        )
        .unwrap();
        assert_eq!(out["authorization"], "Bearer child");
        assert_eq!(out["chatgpt-account-id"], "child-account");
        assert!(!out.contains_key("cookie"));
        assert!(!out.contains_key("openai-organization"));
    }
}
