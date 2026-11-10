//! Per-thread inference relay. Native execution/tools/history stay in the official process.
//! The renderer receives no account credential and cannot choose an upstream URL.
use super::{AccountError, Result};
use futures_util::{SinkExt, StreamExt};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex, Weak,
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
pub(super) struct Routes {
    routes: Mutex<HashMap<String, Arc<Route>>>,
    shared: tokio::sync::Mutex<Option<Arc<SharedRelay>>>,
}
struct SharedRelay {
    authority: String,
    routes: Mutex<HashMap<String, Weak<Route>>>,
    client: reqwest::Client,
    cancel: CancellationToken,
    probed: AtomicBool,
}
pub(super) struct Route {
    pub owner: String,
    thread: std::sync::RwLock<String>,
    pub base_url: String,
    cancel: CancellationToken,
    ready: AtomicBool,
    active: AtomicUsize,
    quota: Mutex<Option<Value>>,
    selection: std::sync::RwLock<Arc<Credential>>,
    client: reqwest::Client,
    key: String,
    authority: String,
    shared: Option<Weak<SharedRelay>>,
    upstream: String,
    route_id: usize,
    requests: AtomicUsize,
    last_failure: Mutex<Option<Value>>,
    probe: tokio::sync::Mutex<Option<(std::time::Instant, Value)>>,
    handoff: Mutex<Option<super::context_handoff::Handoff>>,
    handoff_generation: AtomicUsize,
    handoff_status: Mutex<Option<Value>>,
    lazy_handoff: Mutex<Option<(std::path::PathBuf,std::path::PathBuf,std::path::PathBuf)>>,
}
enum Source {
    Managed(Arc<super::worker::Worker>),
    Official,
    Api(super::api::Settings),
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
        if let Some(shared) = self.shared.as_ref().and_then(Weak::upgrade) {
            shared.routes.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&self.key);
        }
    }
}
impl Drop for SharedRelay {
    fn drop(&mut self) { self.cancel.cancel(); }
}
impl Routes {
    pub fn key(owner: &str, thread: &str) -> String {
        format!("{owner}:{thread}")
    }
    pub fn get(&self, owner: &str, thread: &str) -> Option<Arc<Route>> {
        self.routes
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(&Self::key(owner, thread))
            .cloned()
    }
    pub fn owned(&self, owner: &str) -> Vec<Arc<Route>> {
        self.routes
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
            .routes
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
            self.replace(owner, &route.thread(), None);
        }
    }
    /// One process-local socket serves all native conversations. Each Route
    /// still owns its credential, context and unguessable URL path.
    pub async fn start_shared(&self, owner: String, thread: String, credential: Arc<Credential>) -> Result<Arc<Route>> {
        self.start_shared_with_upstream(owner, thread, credential, UPSTREAM.to_owned()).await
    }
    async fn start_shared_with_upstream(&self, owner: String, thread: String, credential: Arc<Credential>, upstream: String) -> Result<Arc<Route>> {
        let mut slot = self.shared.lock().await;
        let shared = match slot.as_ref() {
            Some(shared) => shared.clone(),
            None => {
                let shared = SharedRelay::start().await?;
                *slot = Some(shared.clone());
                shared
            }
        };
        let route = Route::new(owner, thread, credential, upstream, shared.client.clone(), shared.authority.clone(), super::nonce(), Some(Arc::downgrade(&shared)));
        shared.routes.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(route.key.clone(), Arc::downgrade(&route));
        Ok(route)
    }
}
impl SharedRelay {
    async fn start() -> Result<Arc<Self>> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| fault("client"))?;
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.map_err(|_| fault("bind"))?;
        let port = listener.local_addr().map_err(|_| fault("local-address"))?.port();
        let shared = Arc::new(Self {
            authority: format!("localhost:{port}"),
            routes: Mutex::new(HashMap::new()),
            client,
            cancel: CancellationToken::new(),
            probed: AtomicBool::new(false),
        });
        let weak = Arc::downgrade(&shared);
        let cancel = shared.cancel.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = cancel.cancelled() => break,
                    accepted = listener.accept() => {
                        let Ok((socket, peer)) = accepted else { break };
                        if !peer.ip().is_loopback() { continue; }
                        let Some(shared) = weak.upgrade() else { break };
                        tokio::spawn(async move {
                            let _ = tokio::select! { _ = shared.cancel.cancelled() => Ok(()), result = shared.handle(socket) => result };
                        });
                    }
                }
            }
        });
        Ok(shared)
    }
    async fn handle(&self, socket: TcpStream) -> Result<()> {
        let mut io = BufReader::new(socket);
        let header = tokio::time::timeout(Duration::from_secs(10), read_header(&mut io))
            .await.map_err(|_| fault("request-header-timeout"))??;
        let key = header.split("\r\n").next().unwrap_or("").split(' ').nth(1)
            .and_then(|path| path.strip_prefix('/'))
            .and_then(|path| path.split_once('/').map(|(key, _)| key))
            .filter(|key| key.len() == 32 && key.bytes().all(|c| c.is_ascii_hexdigit()))
            .ok_or_else(|| fault("request-route"))?;
        let route = self.routes.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(key).and_then(Weak::upgrade);
        let Some(route) = route else {
            return reject(&mut io, 403, "ACCOUNT_RELAY_ROUTE: The conversation route is unavailable; no upstream request was sent.").await;
        };
        let result = tokio::select! {
            _ = route.cancel.cancelled() => Ok(()),
            result = route.handle_header(io, header) => result,
        };
        if let Err(error) = &result {
            crate::runtime_log::record("accounts", "account.relay", "failed", json!({"stage":error.message,"errorCode":error.code,"routeId":route.route_id,"conversationId":route.thread(),"accountCredentialLogged":false,"requestReplayed":false}));
        }
        result
    }
}
impl Route {
    pub async fn prepare_credential(
        connection: String,
        source: Arc<super::worker::Worker>,
        email: String,
        progress:Option<&super::preparation::Preparation>,
    ) -> Result<Arc<Credential>> {
        let auth = super::credentials::managed_observed(&source, &email,progress).await?;
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
    pub fn prepare_api(connection:String,settings:super::api::Settings,key:String)->Result<Arc<Credential>> {
        super::api::validate_key(&key)?;
        Ok(Arc::new(Credential{connection,source:Source::Api(settings),email:String::new(),auth:tokio::sync::Mutex::new((json!({"accessToken":key}),u64::MAX)),cancel:CancellationToken::new()}))
    }
    pub fn api_settings(&self)->Option<super::api::Settings>{
        let selection=self.selection.read().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Source::Api(settings)=&selection.source {Some(settings.clone())}else{None}
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
        let address = listener
            .local_addr()
            .map_err(|_| fault("local-address"))?;
        // The official Windows HTTP client's system-proxy fallback does not
        // reliably interpret Windows' 127.* bypass pattern. An exact localhost
        // bypass works, without changing global proxy or authentication state.
        // Keep the listener on IPv4 loopback and validate the exact Host below.
        let authority = format!("localhost:{}", address.port());
        let route = Self::new(owner, thread, credential, upstream, client, authority, super::nonce(), None);
        crate::runtime_log::record("accounts","account.relay.lifecycle","listening",json!({"routeId":route.route_id,"localPort":address.port(),"loopbackHost":"localhost","listenerFamily":"ipv4","conversationId":route.thread(),"connectionId":route.connection(),"committed":false,"network":crate::network_diagnostics::environment(),"taskSent":false}));
        let weak = Arc::downgrade(&route);
        let cancel = route.cancel.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {_ = cancel.cancelled()=>break,accepted=listener.accept()=>{let Ok((socket,peer))=accepted else{break};if !peer.ip().is_loopback(){continue;}let Some(route)=weak.upgrade()else{break};tokio::spawn(async move{let result=tokio::select!{_ = route.cancel.cancelled()=>Ok(()),r=route.handle(socket)=>r};if let Err(e)=result{crate::runtime_log::record("accounts","account.relay","failed",json!({"stage":e.message,"errorCode":e.code,"routeId":route.route_id,"conversationId":route.thread(),"accountCredentialLogged":false,"requestReplayed":false}));}});}}
            }
        });
        Ok(route)
    }
    fn new(owner:String, thread:String, credential:Arc<Credential>, upstream:String, client:reqwest::Client, authority:String, key:String, shared:Option<Weak<SharedRelay>>) -> Arc<Self> {
        Arc::new(Self {
            owner,
            thread: std::sync::RwLock::new(thread),
            base_url: format!("http://{authority}/{key}"),
            authority,
            key,
            shared,
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
            probe: tokio::sync::Mutex::new(None),
            handoff: Mutex::new(None),
            handoff_generation: AtomicUsize::new(0),
            handoff_status: Mutex::new(None),
            lazy_handoff: Mutex::new(None),
        })
    }
    pub fn expire_uncommitted(&self){let thread=self.thread.read().unwrap_or_else(std::sync::PoisonError::into_inner);if thread.starts_with("draft-")&&!self.ready.load(Ordering::Acquire){drop(thread);self.close();}}
    pub fn thread(&self)->String {self.thread.read().unwrap_or_else(std::sync::PoisonError::into_inner).clone()}
    pub fn bind_thread(&self,thread:String)->Result<()> {
        let mut id=self.thread.write().unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.cancel.is_cancelled()||self.ready.load(Ordering::Acquire)||!id.starts_with("draft-"){return Err(fault("draft-already-bound"));}
        *id=thread;Ok(())
    }
    pub fn close(&self) {
        if !self.cancel.is_cancelled(){crate::runtime_log::record("accounts","account.relay.lifecycle","closed",json!({"routeId":self.route_id,"conversationId":self.thread(),"activeRequests":self.active.load(Ordering::Relaxed),"requests":self.requests.load(Ordering::Relaxed),"taskReplayed":false}));}
        self.ready.store(false, Ordering::Release);
        self.cancel.cancel();
        if let Some(shared) = self.shared.as_ref().and_then(Weak::upgrade) {
            shared.routes.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&self.key);
        }
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
        let mut source=self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        self.handoff_generation.fetch_add(1,Ordering::Relaxed);
        if let Some(source)=source.as_mut(){source.reset_api_bootstrap();}
        drop(source);
        *self
            .quota
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }
    pub fn set_handoff(&self, handoff:super::context_handoff::Handoff) {
        let mut source=self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        self.handoff_generation.fetch_add(1,Ordering::Relaxed);*source=Some(handoff);
    }
    pub fn set_new_handoff(&self,home:std::path::PathBuf,path:std::path::PathBuf,root:std::path::PathBuf){
        *self.lazy_handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some((home,path,root));
    }
    fn has_handoff(&self)->bool {self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner).is_some()||self.lazy_handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner).is_some()}
    fn project_handoff(&self, value:&mut Value)->Result<Option<usize>> {
        let mut source=self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if source.is_none(){
            let mut pending=self.lazy_handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some((home,path,root))=pending.as_ref(){
                let mut handoff=super::context_handoff::Handoff::for_route(home.clone(),path.clone(),self.thread(),root,true)?;
                handoff.verify()?;handoff.commit()?;self.handoff_generation.fetch_add(1,Ordering::Relaxed);*source=Some(handoff);*pending=None;
            }
        }
        if let Some(source)=source.as_mut(){
            let details=source.project(value)?;
            let ticket=details["bootstrapCandidate"].as_bool().filter(|v|*v).map(|_|self.handoff_generation.load(Ordering::Relaxed));
            *self.handoff_status.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(details.clone());
            crate::runtime_log::record("accounts","account.context-handoff","projected",details);
            return Ok(ticket);
        }
        Ok(None)
    }
    fn accept_handoff(&self,ticket:Option<usize>,event:&Value) {
        let Some(ticket)=ticket else{return;};
        let mut source=self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if ticket==self.handoff_generation.load(Ordering::Relaxed) {
            if let Some(source)=source.as_mut(){source.accept_api_bootstrap(event);}
        }
    }
    pub fn status(&self) -> Value {
        let probe = self.probe.try_lock().ok().and_then(|v|v.as_ref().map(|(at,evidence)|json!({"ageMs":at.elapsed().as_millis().min(u64::MAX as u128) as u64,"client":"native-relay-client","evidence":evidence})));
        json!({"connectionId":self.connection(),"routed":true,"ready":self.ready.load(Ordering::Acquire)&&!self.cancel.is_cancelled(),"activeRequests":self.active.load(Ordering::Relaxed),"quota":self.quota.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone(),"diagnostics":{"routeId":self.route_id,"localPort":self.authority.rsplit(':').next().and_then(|p|p.parse::<u16>().ok()),"loopbackHost":"localhost","requests":self.requests.load(Ordering::Relaxed),"localHttpProbe":probe,"contextHandoff":self.handoff_status.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone(),"lastFailure":self.last_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone()}})
    }
    /// A bounded local round trip, with no credentials, prompt or upstream call.
    /// A direct check separates a dead listener from the configured proxy path.
    /// This verifies the native relay client's HTTP path, not model availability.
    pub async fn probe(&self, force: bool) -> Result<()> {
        if self.shared.is_some() && self.cancel.is_cancelled() { return Err(fault("route-closed")); }
        let shared = self.shared.as_ref().and_then(Weak::upgrade);
        if shared.as_ref().is_some_and(|hub| hub.probed.load(Ordering::Acquire)) {
            return Ok(());
        }
        let mut cached = self.probe.lock().await;
        if !force && cached.as_ref().is_some_and(|(at, _)| at.elapsed() < Duration::from_secs(30)) {
            return Ok(());
        }
        let mut operation = crate::runtime_log::Operation::start("accounts", "account.relay.probe", json!({"routeId":self.route_id,"localPort":self.authority.rsplit(':').next(),"loopbackHost":"localhost","stage":"local-http-probe","upstreamAttempted":false,"taskSent":false}));
        let direct = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).build().map_err(|_| fault("probe-client"))?;
        for (stage, client) in [("direct-loopback", &direct), ("configured-http-path", &self.client)] {
            let challenge = super::nonce();
            let response = client.get(format!("{}/health", self.base_url)).header("x-code-codex-route-probe", &challenge).timeout(Duration::from_secs(3)).send().await;
            let (status, valid, network) = match response {
                Ok(response) => {
                    let status = response.status().as_u16();
                    let valid = status == 204 && response.headers().get("x-code-codex-route-probe").and_then(|v| v.to_str().ok()) == Some(&challenge) && response.headers().get("x-code-codex-route-id").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<usize>().ok()) == Some(self.route_id);
                    (Some(status), valid, Value::Null)
                }
                Err(error) => (None, false, crate::network_diagnostics::diagnose(&error, "local-route-probe").value()),
            };
            let evidence = json!({"stage":stage,"status":status,"challengeMatched":valid,"directReachable":stage=="configured-http-path"||valid,"networkDiagnosis":network,"upstreamAttempted":false,"taskSent":false});
            if !valid {
                *cached = None;
                let code = if stage == "direct-loopback" {"ACCOUNT_LOCAL_ROUTE_UNREACHABLE"} else {"ACCOUNT_LOCAL_ROUTE_HTTP_PATH"};
                operation.finish("failed", json!({"errorCode":code,"evidence":evidence}));
                return Err(AccountError::new(code, format!("Local account route verification failed. stage={stage}; status={}; loopbackHost=localhost; challengeMatched=false; directReachable={}; operationId={}; no upstream request was sent. Check the local listener and system proxy bypass before re-selecting the connection.", status.map(|v|v.to_string()).unwrap_or_else(||"unavailable".into()), stage=="configured-http-path", operation.id())));
            }
            operation.event("account.relay.probe.phase", "confirmed", evidence);
        }
        let evidence = json!({"stage":"local-http-probe","challengeMatched":true,"upstreamAttempted":false,"taskSent":false});
        *cached = Some((std::time::Instant::now(), evidence.clone()));
        if let Some(shared) = shared { shared.probed.store(true, Ordering::Release); }
        operation.finish("confirmed", evidence);
        Ok(())
    }
    fn failed(&self,operation:&mut crate::runtime_log::Operation,stage:&str,details:Value){
        let value=json!({"stage":stage,"routeId":self.route_id,"operationId":operation.id(),"observedAt":now(),"evidence":details,"requestAccepted":"unknown","taskReplayed":false});
        *self.last_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(value.clone());
        operation.finish("failed",value);
    }
    async fn credential(&self, selection: &Credential) -> Result<Value> {
        if matches!(selection.source,Source::Managed(_))&&super::presentation::reauthorization_required(&super::owner_root(&self.owner)?,&selection.connection)?{return Err(AccountError::new("ACCOUNT_AUTH_REQUIRED","This connection requires reauthorization before credential reuse. No alternate identity was used."));}
        let mut auth = selection.auth.lock().await;
        if now() + 30 >= auth.1 || matches!(&selection.source,Source::Managed(source)if source.credential_refresh_required()) {
            auth.0 = match &selection.source {
                Source::Managed(source) => {
                    super::credentials::managed(source, &selection.email).await?
                }
                Source::Api(_) => return Ok(auth.0.clone()),
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
        self.handle_header(io, header).await
    }
    async fn handle_header(&self, mut io: BufReader<TcpStream>, header: String) -> Result<()> {
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
        if request.path == "/health" {
            let challenge = request.headers.get("x-code-codex-route-probe").and_then(|v| v.to_str().ok()).filter(|v| v.len()==32 && v.bytes().all(|b| b.is_ascii_hexdigit()));
            let Some(challenge) = challenge else {return reject(&mut io,403,"ACCOUNT_LOCAL_ROUTE_PROBE: A valid local challenge is required; no upstream request was sent.").await;};
            return io.write_all(format!("HTTP/1.1 204 No Content\r\nx-code-codex-route-probe: {challenge}\r\nx-code-codex-route-id: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",self.route_id).as_bytes()).await.map_err(|_|fault("probe-response"));
        }
        let selection = self
            .selection
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        let mut operation = crate::runtime_log::Operation::start(
            "accounts",
            "account.relay",
            json!({"stage":"credential-bound","conversationId":self.thread(),"connectionId":selection.connection,"routeId":self.route_id,"localPort":self.authority.rsplit(':').next().and_then(|p|p.parse::<u16>().ok()),"requestSequence":self.requests.fetch_add(1,Ordering::Relaxed)+1,"endpoint":if request.path=="/responses/compact"{"compact"}else{"responses"},"method":request.method.as_str(),"requestBytes":request.length,"routeSource":if matches!(&selection.source,Source::Api(_)){"api"}else{"official"},"requestEncoding":match request.headers.get("content-encoding").and_then(|v|v.to_str().ok()){None=>"identity",Some("zstd")=>"zstd",Some("gzip")=>"gzip",_=>"other"},"transport":if request.websocket{"websocket"}else{"http"},"taskReplayed":false}),
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
        let api=if let Source::Api(settings)=&selection.source{Some(settings)}else{None};
        if api.is_some()&&request.websocket {
            operation.finish("blocked",json!({"stage":"api-transport-mismatch","errorCode":"ACCOUNT_API_HTTP_REQUIRED","upstreamAttempted":false,"taskSent":false}));
            return reject(&mut io,426,"ACCOUNT_API_HTTP_REQUIRED: This Responses connection uses HTTP streaming. Re-select it before sending.").await;
        }
        let headers = if api.is_some(){api_headers(&request.headers,&auth)?}else{upstream_headers(&request.headers, &auth)?};
        let mut builder = self
            .client
            .request(
                request.method.clone(),
                format!("{}{}", api.map(|s|s.base_url.as_str()).unwrap_or(&self.upstream), request.path),
            )
            .headers(headers);
        let mut bootstrap_ticket=None;
        if request.length > 0 {
            operation.event("account.relay.phase","observed",json!({"stage":"request-body","expectedBytes":request.length}));
            let mut body = vec![0; request.length];
            let stage=match tokio::time::timeout(Duration::from_secs(30), io.read_exact(&mut body)).await {Ok(Ok(_))=>None,Ok(Err(_))=>Some("request-body-incomplete"),Err(_)=>Some("request-body-timeout")};
            if let Some(stage)=stage {
                self.failed(&mut operation,stage,json!({"upstreamAttempted":false,"expectedBytes":request.length,"receivedBytes":"unknown"}));
                reject(&mut io,408,&format!("ACCOUNT_RELAY_REQUEST_BODY: stage={stage}; operationId={}; no upstream request was sent.",operation.id())).await?;
                return Err(fault(stage));
            }
            if let Some(settings)=api {
                if request.headers.contains_key("content-encoding"){return reject(&mut io,400,"ACCOUNT_API_BODY_ENCODING: Compressed requests are not supported by this route. Re-select the API connection; no upstream request was sent.").await;}
                body=api_body(&body,&settings)?;
            }
            if self.has_handoff() {
                if request.headers.contains_key("content-encoding") {return reject(&mut io,400,"ACCOUNT_CONTEXT_ENCODING: Re-select this idle route to disable request compression; original history is unchanged; no upstream request was sent.").await;}
                let projected:Result<Vec<u8>>=(||{let mut value:Value=serde_json::from_slice(&body).map_err(|_|fault("context-request-json"))?;bootstrap_ticket=self.project_handoff(&mut value)?;serde_json::to_vec(&value).map_err(|_|fault("context-request-encode"))})();
                match projected {Ok(bytes) if bytes.len()<=MAX_BODY=>body=bytes,Ok(_)=>return reject(&mut io,413,"ACCOUNT_CONTEXT_BUDGET: Projected request exceeds the local budget; no upstream request was sent.").await,Err(error)=>{operation.finish("blocked",json!({"stage":"context-handoff","errorCode":error.code,"upstreamAttempted":false,"taskSent":false}));return reject(&mut io,409,&error.message).await;}}
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
            if let Source::Managed(source)=&selection.source {source.invalidate_credential();}
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
            let mut socket_history=super::context_handoff::SocketHistory::default();let mut socket_bootstrap_ticket=None;
            let closed_by=loop {
                tokio::select! {biased;
                 _=selection.cancel.cancelled()=>break "identity-changed",
                 m=client.next()=>{let mut m=match m{Some(Ok(m))=>m,Some(Err(_))=>break "client-read-error",None=>break "client-eof"};client_frames+=1;if let Message::Text(text)=&m{if text.len()>MAX_BODY{return Err(fault("websocket-message-bound"));}if json_type(text)==Some("response.create")&&sampling.is_none(){self.active.fetch_add(1,Ordering::Relaxed);sampling=Some(Active(&self.active));sampling_requests+=1;operation.event("account.relay.sampling","started",json!({"samplingSequence":sampling_requests,"stage":"websocket-response-create","requestAccepted":"unknown"}));}}if let Message::Text(text)=&m {if json_type(text)==Some("response.create") {let mut value:Value=serde_json::from_str(text).map_err(|_|fault("context-websocket-json"))?;if let Err(error)=(||{if value["generate"]==false&&value.get("input").is_none(){value["input"]=json!([]);}if self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner).as_ref().is_some_and(|v|v.portable()){socket_history.expand(&mut value)?;}socket_bootstrap_ticket=self.project_handoff(&mut value)?;Ok::<(),AccountError>(())})(){self.failed(&mut operation,"context-handoff",json!({"errorCode":error.code,"taskSent":false,"upstreamSamplingSent":false}));let _=client.send(Message::Text(json!({"type":"error","error":{"code":"account_context_handoff","message":error.message}}).to_string().into())).await;break "context-handoff-blocked";}m=Message::Text(value.to_string().into());}}if server.send(m).await.is_err(){break "upstream-write-error";}}
                 m=server.next()=>{let m=match m{Some(Ok(m))=>m,Some(Err(_))=>break "upstream-read-error",None=>break "upstream-eof"};server_frames+=1;let mut pass=true;if let Message::Text(text)=&m{if text.len()>MAX_BODY{return Err(fault("websocket-response-bound"));}if let Ok(value)=serde_json::from_str::<Value>(text){if self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner).as_ref().is_some_and(|v|v.portable()){socket_history.observe(&value);}self.accept_handoff(socket_bootstrap_ticket,&value);pass=!self.observe_event(&value);let kind=value["type"].as_str().unwrap_or("");if matches!(kind,"response.completed"|"response.failed"|"error"){let evidence=json!({"samplingSequence":sampling_requests,"stage":kind,"classification":super::relay_diagnostics::failure_class(&value),"taskReplayed":false});operation.event("account.relay.sampling",if kind=="response.completed"{"completed"}else{"failed"},evidence.clone());if kind!="response.completed"{*self.last_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(json!({"routeId":self.route_id,"operationId":operation.id(),"observedAt":now(),"stage":"websocket-response-error","evidence":evidence,"taskReplayed":false}));}sampling.take();socket_bootstrap_ticket=None;}else if kind=="response.compaction.compacting"{operation.event("account.relay.compaction","observed",json!({"samplingSequence":sampling_requests,"stage":"upstream-compacting","taskReplayed":false}));}}}if pass&&client.send(m).await.is_err(){break "client-write-error";}}
                }
            };
            let details=json!({"stage":"websocket-closed","closedBy":closed_by,"samplingActive":sampling.is_some(),"samplingRequests":sampling_requests,"clientFrames":client_frames,"serverFrames":server_frames,"identityChanged":selection.cancel.is_cancelled(),"taskReplayed":false});
            if sampling.is_some()&&!selection.cancel.is_cancelled(){self.failed(&mut operation,"websocket-disconnected",details);}else{operation.finish("closed",details);}
            return Ok(());
        }
        self.active.fetch_add(1, Ordering::Relaxed);
        let _active = Active(&self.active);
        if api.is_none(){self.observe_headers(response.headers());}
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
        let sse=content_type.contains("text/event-stream");let mut observation=ResponseObservation::default();let mut model_failure:Option<Value>=None;
        loop {
            let bytes=match response.chunk().await{Ok(Some(bytes))=>bytes,Ok(None)=>break,Err(error)=>{self.failed(&mut operation,"response-stream",json!({"status":status,"receivedBytes":received,"networkDiagnosis":crate::network_diagnostics::diagnose(&error,"body").value()}));return Err(fault("response-stream"));}};
            if bytes.is_empty() {
                continue;
            }
            if selection.cancel.is_cancelled() {
                return Err(fault("credential-selection-superseded"));
            }
            received=received.saturating_add(bytes.len() as u64);
            if status<400 {observation.push(&bytes,sse,|v|{self.accept_handoff(bootstrap_ticket,v);self.observe_event(v);if matches!(v["type"].as_str(),Some("response.failed"|"error")){model_failure=Some(json!({"eventType":v["type"],"classification":super::relay_diagnostics::failure_class(v)}));}});}
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
        if status<400&&!sse {observation.finish(|v|{self.accept_handoff(bootstrap_ticket,v);self.observe_event(v);if matches!(v["type"].as_str(),Some("response.failed"|"error")){model_failure=Some(json!({"eventType":v["type"],"classification":super::relay_diagnostics::failure_class(v)}));}});}
        io.write_all(b"0\r\n\r\n")
            .await
            .map_err(|_| fault("response-client"))?;
        if status>=400 {self.failed(&mut operation,"upstream-http-error",json!({"status":status,"errorSummary":body_evidence.summary()}));}
        else if let Some(failure)=model_failure {self.failed(&mut operation,"upstream-stream-error",json!({"status":status,"receivedBytes":received,"modelFailure":failure,"wireUnchanged":true}));}
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
        if let Some(source)=self.handoff.lock().unwrap_or_else(std::sync::PoisonError::into_inner).as_mut(){source.observe(v);}
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
// Bounded response metadata observer. Wire bytes are forwarded unchanged.
#[derive(Default)]
struct ResponseObservation { bytes:Vec<u8>, dropping:bool }
impl ResponseObservation {
    fn push(&mut self,b:&[u8],sse:bool,mut observe:impl FnMut(&Value)) {
        if !sse {if !self.dropping&&self.bytes.len()+b.len()<=MAX_BODY {self.bytes.extend_from_slice(b);}else{self.bytes.clear();self.dropping=true;}return;}
        for part in b.split_inclusive(|v|*v==b'\n') {
            if self.bytes.len()+part.len()>MAX_BODY {self.bytes.clear();self.dropping=true;}
            if !self.dropping{self.bytes.extend_from_slice(part);}
            if part.last()==Some(&b'\n') {
                if !self.dropping {if let Some(data)=self.bytes.strip_prefix(b"data: "){if let Ok(v)=serde_json::from_slice::<Value>(data){observe(&v);}}}
                self.bytes.clear();self.dropping=false;
            }
        }
    }
    fn finish(&self,mut observe:impl FnMut(&Value)){if !self.dropping{if let Ok(v)=serde_json::from_slice::<Value>(&self.bytes){observe(&v);}}}
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
pub(super) async fn reject(io: &mut BufReader<TcpStream>, status: u16, message: &str) -> Result<()> {
    let body = json!({"error":{"message":message,"type":"account_route_unavailable"}}).to_string();
    io.write_all(format!("HTTP/1.1 {status} Rejected\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len()).as_bytes()).await.map_err(|_|fault("reject"))?;
    Ok(())
}
pub(super) async fn read_header(io: &mut BufReader<TcpStream>) -> Result<String> {
    let mut bytes = Vec::new();
    loop {
        let remaining=(32769usize).saturating_sub(bytes.len());
        if remaining==0{return Err(fault("request-header-bound"));}
        let n = (&mut *io).take(remaining as u64)
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
pub(super) struct Request {
    pub method: reqwest::Method,
    pub path: String,
    pub headers: HeaderMap,
    pub length: usize,
    pub websocket: bool,
}
fn parse_header(raw: &str, authority: &str, key: &str) -> Result<Request> {
    parse_header_paths(raw, authority, key, &["/responses", "/responses/compact", "/health"])
}
pub(super) fn parse_header_paths(raw: &str, authority: &str, key: &str, paths: &[&str]) -> Result<Request> {
    let mut lines = raw.split("\r\n");
    let start: Vec<_> = lines.next().unwrap_or("").split(' ').collect();
    if start.len() != 3 || start[2] != "HTTP/1.1" {
        return Err(fault("request-line"));
    }
    let path = start[1]
        .strip_prefix(&format!("/{key}"))
        .filter(|p| paths.contains(p))
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
        "POST" if !websocket && path != "/health" => reqwest::Method::POST,
        "GET" if websocket && path == "/responses" => reqwest::Method::GET,
        "GET" if !websocket && path == "/health" => reqwest::Method::GET,
        _ => return Err(fault("request-method")),
    };
    let length = match headers.get("content-length") {
        Some(v) => v
            .to_str()
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .filter(|n| *n <= MAX_BODY)
            .ok_or_else(|| fault("request-body-bound"))?,
        None if websocket || path == "/health" => 0,
        None => return Err(fault("request-body-length")),
    };
    if path == "/health" && length != 0 { return Err(fault("probe-body")); }
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
                | "content-encoding"
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
fn api_headers(input:&HeaderMap,auth:&Value)->Result<HeaderMap>{
    let mut out=HeaderMap::new();
    for name in ["user-agent","content-type","accept","originator","version"] {
        if let Some(value)=input.get(name){out.insert(HeaderName::from_static(name),value.clone());}
    }
    out.insert("authorization",HeaderValue::from_str(&format!("Bearer {}",auth["accessToken"].as_str().ok_or_else(||fault("api-credential-token"))?)).map_err(|_|fault("api-credential-header"))?);
    Ok(out)
}
fn api_body(bytes:&[u8],settings:&super::api::Settings)->Result<Vec<u8>>{
    let mut body:Value=serde_json::from_slice(bytes).map_err(|_|AccountError::new("ACCOUNT_API_BODY","The Responses request body is invalid. No upstream request was sent."))?;
    let object=body.as_object_mut().ok_or_else(||fault("api-body-object"))?;
    // Native turn settings may select any saved model, independently per thread.
    // Unknown/foreign IDs still use this connection's explicit default.
    let supported=object.get("model").and_then(Value::as_str).is_some_and(|model|model==settings.model||settings.models.as_ref().is_some_and(|models|models.iter().any(|id|id==model)));
    if !supported {object.insert("model".into(),json!(settings.model));}
    // Provider-specific response IDs must never cross a connection boundary.
    object.remove("previous_response_id");object.remove("prompt_cache_key");
    serde_json::to_vec(&body).map_err(|_|fault("api-body-encode"))
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
    #[tokio::test]
    async fn shared_listener_keeps_conversations_isolated_and_survives_one_route_closing() {
        let upstream = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = upstream.local_addr().unwrap();
        let backend = tokio::spawn(async move {
            let mut observed = Vec::new();
            for _ in 0..2 {
                let (socket, _) = upstream.accept().await.unwrap();
                let mut io = BufReader::new(socket);
                let header = read_header(&mut io).await.unwrap();
                let account = header.lines().find_map(|line| line.strip_prefix("chatgpt-account-id: ")).unwrap().to_owned();
                assert!(header.contains(&format!("authorization: Bearer fixture-{account}")));
                let length = header.lines().find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").and_then(|value| value.trim().parse::<usize>().ok())).unwrap();
                let mut body = vec![0; length];
                io.read_exact(&mut body).await.unwrap();
                assert_eq!(serde_json::from_slice::<Value>(&body).unwrap()["conversation"], account);
                observed.push(account);
                io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();
            }
            observed.sort();
            assert_eq!(observed, ["A", "B"]);
        });
        let routes = Routes::default();
        let endpoint = format!("http://localhost:{}", address.port());
        let a = routes.start_shared_with_upstream("owner".into(), "thread-a".into(), credential("A"), endpoint.clone()).await.unwrap();
        a.probe(true).await.unwrap();
        let b = routes.start_shared_with_upstream("owner".into(), "thread-b".into(), credential("B"), endpoint).await.unwrap();
        b.probe(true).await.unwrap();
        assert_eq!(a.authority, b.authority);
        assert_ne!(a.base_url, b.base_url);
        assert!(b.probe.lock().await.is_none(), "later routes reuse the shared listener proof");
        routes.replace("owner", "thread-a", Some(a.clone()));
        routes.replace("owner", "thread-b", Some(b.clone()));
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let (first, second) = tokio::join!(
            client.post(format!("{}/responses", a.base_url)).json(&json!({"conversation":"A"})).send(),
            client.post(format!("{}/responses", b.base_url)).json(&json!({"conversation":"B"})).send()
        );
        assert_eq!(first.unwrap().status(), 200, "{:?}", a.status()["diagnostics"]["lastFailure"]);
        assert_eq!(second.unwrap().status(), 200, "{:?}", b.status()["diagnostics"]["lastFailure"]);
        backend.await.unwrap();
        routes.replace("owner", "thread-a", None);
        assert_eq!(client.get(format!("{}/health", a.base_url)).send().await.unwrap().status(), 403);
        assert!(!b.cancel.is_cancelled());
        routes.replace("owner", "thread-b", None);
    }
    #[tokio::test]
    async fn shared_draft_path_waits_for_native_thread_binding_without_a_new_listener() {
        let upstream = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = upstream.local_addr().unwrap();
        let backend = tokio::spawn(async move {
            let (socket, _) = upstream.accept().await.unwrap();
            let mut io = BufReader::new(socket);
            let header = read_header(&mut io).await.unwrap();
            assert!(header.contains("chatgpt-account-id: B"));
            let length = header.lines().find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").and_then(|value| value.trim().parse::<usize>().ok())).unwrap();
            let mut body = vec![0; length];
            io.read_exact(&mut body).await.unwrap();
            assert_eq!(serde_json::from_slice::<Value>(&body).unwrap()["thread"], "native-thread");
            io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();
        });
        let routes = Routes::default();
        let endpoint = format!("http://localhost:{}", address.port());
        let existing = routes.start_shared_with_upstream("owner".into(), "existing".into(), credential("A"), endpoint.clone()).await.unwrap();
        existing.probe(true).await.unwrap();
        routes.replace("owner", "existing", Some(existing.clone()));
        let draft = routes.start_shared_with_upstream("owner".into(), "draft-temporary".into(), credential("B"), endpoint).await.unwrap();
        assert_eq!(existing.authority, draft.authority);
        draft.probe(true).await.unwrap();
        assert!(draft.probe.lock().await.is_none());
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        assert_eq!(client.post(format!("{}/responses", draft.base_url)).json(&json!({"thread":"native-thread"})).send().await.unwrap().status(), 503);
        assert_eq!(draft.requests.load(Ordering::Relaxed), 1);
        draft.bind_thread("native-thread".into()).unwrap();
        routes.replace("owner", "native-thread", Some(draft.clone()));
        assert_eq!(client.post(format!("{}/responses", draft.base_url)).json(&json!({"thread":"native-thread"})).send().await.unwrap().status(), 200);
        assert_eq!(draft.requests.load(Ordering::Relaxed), 2);
        backend.await.unwrap();
        routes.replace("owner", "native-thread", None);
        routes.replace("owner", "existing", None);
    }
    #[cfg(windows)]
    #[tokio::test]
    #[ignore="Explicit authenticated live gateway acceptance using synthetic task only"]
    async fn real_api_model_roundtrip_uses_production_handoff_without_foreign_ciphertext(){
        let file=std::env::var_os("CODE_CODEX_CONTEXT_API_REGISTRY").map(std::path::PathBuf::from).expect("Explicit registry required");
        let registry:Value=serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();let connection=registry["connections"].as_array().unwrap().iter().find(|c|c["api"].is_object()).unwrap();let id=connection["id"].as_str().unwrap();
        let key=super::super::api::read(&super::super::retention::home(file.parent().unwrap(),id).unwrap()).expect("Native credential required");
        let requested_model=std::env::var("CODE_CODEX_CONTEXT_API_MODEL").ok();
        let models=match requested_model.as_deref(){
            Some(model)=>vec![model],
            None=>vec!["gpt-6.1-sol","gpt-6-astra","gpt-6.1-sol"],
        };
        let home=tempfile::tempdir().unwrap();let archive=super::super::context_handoff::tests::archive(home.path(),"thread");
        let route=Route::start("fixture-owner".into(),"thread".into(),Route::prepare_api("A".into(),super::super::api::Settings::parse(connection["api"]["baseUrl"].as_str().unwrap(),models[0]).unwrap(),key.clone()).unwrap()).await.unwrap();
        route.set_handoff(super::super::context_handoff::Handoff::open(home.path().into(),archive.clone(),"thread".into()).unwrap());route.ready.store(true,Ordering::Release);
        let client=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(90)).build().unwrap();
        for (stage,model) in models.iter().enumerate(){
            if stage>0 {route.commit_credential(Route::prepare_api(format!("route-{stage}"),super::super::api::Settings::parse(connection["api"]["baseUrl"].as_str().unwrap(),model).unwrap(),key.clone()).unwrap());}
            let response=client.post(format!("{}/responses",route.base_url)).header("user-agent","codex_cli_rs/0.134.0 (Windows 10.0.26200; x86_64) WindowsTerminal").header("originator","codex_cli_rs").json(&json!({"model":model,"store":false,"stream":true,"reasoning":{"effort":"low"},"max_output_tokens":1024,"input":[{"type":"compaction","encrypted_content":"FOREIGN_CIPHER"},{"type":"message","role":"user","content":[{"type":"input_text","text":"Synthetic test only. From the handoff records return JSON with task_id, version, pending_checks, file_marker, deletion_allowed. Never execute tools. Return only JSON."}]}]})).send().await.expect("Synthetic local route request failed; no credential logged");
            let status=response.status().as_u16();let text=response.text().await.expect("Synthetic response stream could not be read");let mut completed=false;let mut output=String::new();
            for line in text.lines().filter_map(|v|v.strip_prefix("data: ")) {let Ok(event)=serde_json::from_str::<Value>(line)else{continue};if event["type"]=="response.output_text.delta" {output.push_str(event["delta"].as_str().unwrap_or(""));}if event["type"]=="response.completed" {completed=true;}}
            let facts:Value=serde_json::from_str(output.trim().trim_start_matches("```json").trim_end_matches("```").trim()).unwrap_or(Value::Null);
            let matched=facts["task_id"]=="PORTABLE_731"&&facts["version"]==7&&facts["pending_checks"]==3&&facts["file_marker"]=="DATA_918"&&facts["deletion_allowed"]==false;
            println!("{}",json!({"stage":stage,"model":model,"status":status,"completed":completed,"fiveTaskFactsMatch":matched,"failure":if status==200{Value::Null}else{route.status()["diagnostics"]["lastFailure"].clone()},"scope":"synthetic-production-projector-same-gateway","rawOutputLogged":false}));
            assert!(status==200&&completed&&matched,"Synthetic task handoff failed; see status and metadata above, original context was not changed");
        }
        route.close();
    }
    #[tokio::test]
    async fn api_native_requests_keep_full_context_across_tools_and_next_user() {
        let home = tempfile::tempdir().unwrap();
        let path = super::super::context_handoff::tests::archive(home.path(), "thread");
        let original = std::fs::read(&path).unwrap();
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = listener.local_addr().unwrap();
        let tools = json!([{"type":"namespace","name":"future_host","tools":[{"type":"custom","name":"runner","description":"Unmodified native schema."}]}]);
        let expected_tools = tools.clone();
        let backend = tokio::spawn(async move {
            for stage in 0..4 {
                let (socket, _) = listener.accept().await.unwrap();
                let mut io = BufReader::new(socket);
                let header = read_header(&mut io).await.unwrap();
                let length = header.lines().find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").map(|n| n.trim().parse::<usize>().unwrap())).unwrap();
                let mut bytes = vec![0; length];
                io.read_exact(&mut bytes).await.unwrap();
                let value: Value = serde_json::from_slice(&bytes).unwrap();
                assert_eq!(value["instructions"], "Complete native tool instructions");
                assert_eq!(value["tools"], expected_tools);
                let text = value.to_string();
                assert!(text.contains("native policy") && text.contains("user-one"));
                assert_eq!(text.contains("listed.md"), stage >= 1);
                assert_eq!(text.contains("read-body-731"), stage >= 2);
                assert_eq!(text.contains("user-two"), stage == 3);
                assert!(!text.contains("task_handoff_records"));
                assert!(value.get("previous_response_id").is_none());
                let body = "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output\":[]}}\n\n";
                io.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let route = Route::listen("owner".into(), "thread".into(), Route::prepare_api("api".into(), super::super::api::Settings::parse(&format!("http://{address}"), "model").unwrap(), "synthetic-key".into()).unwrap(), format!("http://{address}"), client.clone()).await.unwrap();
        route.set_handoff(super::super::context_handoff::Handoff::open(home.path().into(), path.clone(), "thread".into()).unwrap());
        route.ready.store(true, Ordering::Release);
        let mut input = vec![json!({"role":"developer","content":"native policy"}), json!({"role":"user","content":"user-one"})];
        for stage in 0..4 {
            if matches!(stage, 1 | 2) {
                let id = format!("tool-{stage}");
                input.extend([json!({"type":"custom_tool_call","call_id":id,"name":"runner","input":"native command"}),json!({"type":"custom_tool_call_output","call_id":id,"output":if stage==1 {"listed.md"} else {"read-body-731"}})]);
            }
            if stage == 3 { input.push(json!({"role":"user","content":"user-two"})); }
            let response = client.post(format!("{}/responses", route.base_url)).json(&json!({"input":input,"tools":tools,"instructions":"Complete native tool instructions","previous_response_id":"other-provider"})).send().await.unwrap();
            assert_eq!(response.status(), 200);
            response.bytes().await.unwrap();
        }
        backend.await.unwrap();
        route.close();
        assert_eq!(std::fs::read(path).unwrap(), original);
    }
    #[tokio::test]
    async fn portable_http_roundtrip_isolates_ciphertext_and_keeps_new_route_progress(){
        use std::io::Write;
        let home=tempfile::tempdir().unwrap();let path=super::super::context_handoff::tests::archive(home.path(),"thread");let original=std::fs::read(&path).unwrap();
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move {
            for stage in 0..3 {
                let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);let raw=read_header(&mut io).await.unwrap();let length=raw.lines().find_map(|v|v.to_ascii_lowercase().strip_prefix("content-length:").map(|v|v.trim().parse::<usize>().unwrap())).unwrap();let mut bytes=vec![0;length];io.read_exact(&mut bytes).await.unwrap();let value:Value=serde_json::from_slice(&bytes).unwrap();let text=value.to_string();
                assert!(text.contains("PORTABLE_731"));assert!(text.contains("Never delete files"));assert!(!text.contains("FOREIGN_CIPHER"));assert!(!text.contains("ORIGINAL_OPAQUE_MUST_REMAIN"));assert!(value.get("previous_response_id").is_none());
                if stage==2 {assert!(text.contains("NEW_B_PROGRESS"));assert!(raw.contains("chatgpt-account-id: host"));}else{assert!(!raw.contains("chatgpt-account-id"));assert_eq!(value["model"],format!("api-{stage}"));}
                io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();
            }
        });
        let client=reqwest::Client::builder().no_proxy().build().unwrap();
        let api=|n|Route::prepare_api(format!("api-{n}"),super::super::api::Settings::parse(&format!("http://{address}"),&format!("api-{n}")).unwrap(),format!("synthetic-{n}")).unwrap();
        let route=Route::listen("owner".into(),"thread".into(),api(0),format!("http://{address}"),client.clone()).await.unwrap();route.set_handoff(super::super::context_handoff::Handoff::open(home.path().into(),path.clone(),"thread".into()).unwrap());route.ready.store(true,Ordering::Release);
        for stage in 0..3 {
            if stage==1 {route.commit_credential(api(1));}
            if stage==2 {let mut f=std::fs::OpenOptions::new().append(true).open(&path).unwrap();writeln!(f,"{}",json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"NEW_B_PROGRESS"}]}})).unwrap();route.commit_credential(credential("host"));}
            let response=client.post(format!("{}/responses",route.base_url)).json(&json!({"model":"official-model","previous_response_id":"private-prior","input":[{"type":"compaction","encrypted_content":"FOREIGN_CIPHER"},{"type":"message","role":"user","content":[{"type":"input_text","text":"Continue the verified task"}]}]})).send().await.unwrap();assert_eq!(response.status(),200);response.bytes().await.unwrap();
        }
        backend.await.unwrap();route.close();assert!(std::fs::read(&path).unwrap().starts_with(&original));assert_eq!(route.status()["diagnostics"]["contextHandoff"]["originalArchiveUnchanged"],true);
    }
    #[tokio::test]
    async fn portable_websocket_tool_delta_is_complete_and_does_not_forward_foreign_state(){
        let home=tempfile::tempdir().unwrap();let path=super::super::context_handoff::tests::archive(home.path(),"thread");let original=std::fs::read(&path).unwrap();
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move {
            let (socket,_)=listener.accept().await.unwrap();let mut ws=tokio_tungstenite::accept_async(socket).await.unwrap();
            let first:Value=serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();assert!(!first.to_string().contains("FOREIGN_CIPHER"));assert!(first.to_string().contains("PORTABLE_731"));
            let call=json!({"type":"function_call","call_id":"pair","name":"fixture_read","arguments":"{}","id":"provider-item"});
            ws.send(Message::Text(json!({"type":"response.output_item.done","item":call}).to_string().into())).await.unwrap();ws.send(Message::Text(json!({"type":"response.completed","response":{"id":"source-response","output":[call]}}).to_string().into())).await.unwrap();
            let second:Value=serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();let input=second["input"].as_array().unwrap();assert_eq!(input.iter().filter(|v|v["type"]=="function_call"&&v["call_id"]=="pair").count(),1);assert_eq!(input.iter().filter(|v|v["type"]=="function_call_output"&&v["output"]=="REAL_RESULT").count(),1);assert!(second.get("previous_response_id").is_none());
            ws.send(Message::Text(json!({"type":"response.completed","response":{"id":"done","output":[]}}).to_string().into())).await.unwrap();
        });
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("owner".into(),"thread".into(),credential("host"),format!("http://{address}"),client).await.unwrap();route.set_handoff(super::super::context_handoff::Handoff::open(home.path().into(),path.clone(),"thread".into()).unwrap());route.ready.store(true,Ordering::Release);
        let socket=TcpStream::connect(&route.authority).await.unwrap();let (mut ws,_)=tokio_tungstenite::client_async(route.base_url.replace("http://","ws://")+"/responses",socket).await.unwrap();
        ws.send(Message::Text(json!({"type":"response.create","input":[{"type":"compaction","encrypted_content":"FOREIGN_CIPHER"},{"type":"message","role":"user","content":[{"type":"input_text","text":"Read the fixture"}]}]}).to_string().into())).await.unwrap();
        for _ in 0..2 {ws.next().await.unwrap().unwrap();}
        ws.send(Message::Text(json!({"type":"response.create","previous_response_id":"source-response","input":[{"type":"function_call_output","call_id":"pair","output":"REAL_RESULT"}]}).to_string().into())).await.unwrap();assert!(ws.next().await.unwrap().unwrap().to_text().unwrap().contains("response.completed"));backend.await.unwrap();route.close();assert_eq!(std::fs::read(&path).unwrap(),original);
    }
    #[test]
    fn response_observer_tracks_chunked_sse_and_compact_json_without_touching_wire() {
        let mut observer=ResponseObservation::default();let mut events=Vec::new();
        for chunk in b"data: {\"type\":\"response.completed\",\"response\":{\"output\":[]}}\n\n".chunks(3) {observer.push(chunk,true,|v|events.push(v.clone()));}
        assert_eq!(events.len(),1);assert_eq!(events[0]["type"],"response.completed");
        let mut observer=ResponseObservation::default();observer.push(b"{\"output\":[]}",false,|_|panic!());observer.finish(|v|events.push(v.clone()));assert_eq!(events.len(),2);
    }
    #[tokio::test]
    async fn official_http_keeps_native_context_after_api_without_archive_writes() {
        let home=tempfile::tempdir().unwrap();let path=super::super::context_handoff::tests::archive(home.path(),"thread");
        let source=super::super::context_handoff::Handoff::for_route(home.path().into(),path.clone(),"thread".into(),home.path(),true).unwrap();source.commit().unwrap();
        let source=super::super::context_handoff::Handoff::for_route(home.path().into(),path.clone(),"thread".into(),home.path(),false).unwrap();source.commit().unwrap();
        let original=std::fs::read(&path).unwrap();
        let expected=json!({"model":"native-choice","prompt_cache_key":"native-cache","context_management":[{"type":"compaction","compact_threshold":4000}],"input":[{"type":"compaction","encrypted_content":"ORIGINAL_OPAQUE_MUST_REMAIN"},{"type":"message","role":"user","content":"Continue"}]});let wire=expected.clone();
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move{let (s,_)=listener.accept().await.unwrap();let mut io=BufReader::new(s);let raw=read_header(&mut io).await.unwrap();let length=raw.lines().find_map(|s|s.to_ascii_lowercase().strip_prefix("content-length:").map(|s|s.trim().parse::<usize>().unwrap())).unwrap();let mut body=vec![0;length];io.read_exact(&mut body).await.unwrap();assert_eq!(serde_json::from_slice::<Value>(&body).unwrap(),wire);io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();});
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("owner".into(),"thread".into(),credential("host"),format!("http://{address}"),client.clone()).await.unwrap();route.set_handoff(source);route.ready.store(true,Ordering::Release);
        assert_eq!(client.post(format!("{}/responses",route.base_url)).json(&expected).send().await.unwrap().status(),200);backend.await.unwrap();assert_eq!(std::fs::read(path).unwrap(),original);route.close();
    }
    #[tokio::test]
    async fn official_websocket_deltas_keep_native_response_chain() {
        let home=tempfile::tempdir().unwrap();let path=super::super::context_handoff::tests::archive(home.path(),"thread");
        let source=super::super::context_handoff::Handoff::for_route(home.path().into(),path.clone(),"thread".into(),home.path(),true).unwrap();source.commit().unwrap();
        let source=super::super::context_handoff::Handoff::for_route(home.path().into(),path,"thread".into(),home.path(),false).unwrap();source.commit().unwrap();
        let first=json!({"type":"response.create","input":[{"type":"compaction","encrypted_content":"ORIGINAL_OPAQUE_MUST_REMAIN"},{"type":"message","role":"user","content":"Continue"}]});
        let delta=json!({"type":"response.create","previous_response_id":"official-native-id","input":[{"type":"function_call_output","call_id":"pair","output":"REAL_RESULT"}]});let f=first.clone();let d=delta.clone();
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move{let (s,_)=listener.accept().await.unwrap();let mut ws=tokio_tungstenite::accept_async(s).await.unwrap();let v:Value=serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();assert_eq!(v,f);ws.send(Message::Text(json!({"type":"response.completed","response":{"id":"official-native-id","output":[]}}).to_string().into())).await.unwrap();let v:Value=serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();assert_eq!(v,d);ws.send(Message::Text(json!({"type":"response.completed","response":{"output":[]}}).to_string().into())).await.unwrap();});
        let route=Route::listen("owner".into(),"thread".into(),credential("host"),format!("http://{address}"),reqwest::Client::builder().no_proxy().build().unwrap()).await.unwrap();route.set_handoff(source);route.ready.store(true,Ordering::Release);
        let socket=TcpStream::connect(&route.authority).await.unwrap();let (mut ws,_)=tokio_tungstenite::client_async(route.base_url.replace("http://","ws://")+"/responses",socket).await.unwrap();
        ws.send(Message::Text(first.to_string().into())).await.unwrap();ws.next().await.unwrap().unwrap();ws.send(Message::Text(delta.to_string().into())).await.unwrap();ws.next().await.unwrap().unwrap();backend.await.unwrap();route.close();
    }
    #[tokio::test]
    async fn official_http_fallback_preserves_compressed_bytes_and_encoding_after_api_switch() {
        let body = vec![31,139,8,0,0,0,0,0,2,255,171,86,202,204,43,40,45,81,178,138,142,173,5,0,172,10,194,174,12,0,0,0];
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();let expected=body.clone();
        let backend=tokio::spawn(async move {
            let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);let raw=read_header(&mut io).await.unwrap();
            assert!(raw.contains("content-encoding: gzip"));assert!(raw.contains("authorization: Bearer fixture-host"));assert!(!raw.contains("synthetic-api"));
            let mut bytes=vec![0;expected.len()];io.read_exact(&mut bytes).await.unwrap();assert_eq!(bytes,expected);
            io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();
        });
        let client=reqwest::Client::builder().no_proxy().build().unwrap();
        let api=Route::prepare_api("api".into(),super::super::api::Settings::parse("https://example.invalid/v1","synthetic-model").unwrap(),"synthetic-api".into()).unwrap();
        let route=Route::listen("owner".into(),"thread".into(),api,format!("http://{address}"),client.clone()).await.unwrap();
        route.commit_credential(credential("host"));route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}/responses",route.base_url)).header("content-encoding","gzip").header("content-type","application/json").body(body).send().await.unwrap();
        assert_eq!(response.status(),200);assert_eq!(response.text().await.unwrap(),"{}");backend.await.unwrap();route.close();
    }
    #[cfg(windows)]
    #[tokio::test]
    #[ignore = "Requires an explicitly selected real official backend; isolated local fixture only"]
    async fn real_official_http_client_uses_production_loopback_route_with_system_proxy() { native_http_roundtrip(false).await; }
    #[cfg(windows)]
    #[tokio::test]
    #[ignore = "Explicit local native-client fixture; no external inference or credentials"]
    async fn real_new_draft_first_turn_waits_for_account_binding() { native_http_roundtrip(true).await; }
    #[cfg(windows)]
    async fn native_http_roundtrip(draft:bool) {
        use tokio::io::AsyncBufReadExt;
        let exe = std::env::var_os("CODE_CODEX_NATIVE_HTTP_PROBE").expect("Explicit official backend path required");
        let home = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let backend = tokio::spawn(async move {
            let (socket, _) = tokio::time::timeout(Duration::from_secs(25), listener.accept()).await.unwrap().unwrap();
            let mut io = BufReader::new(socket);
            let raw = read_header(&mut io).await.unwrap();
            assert!(raw.starts_with("POST /v1/responses HTTP/1.1"));
            assert!(raw.contains("authorization: Bearer synthetic-probe-only"));
            assert!(!raw.contains("chatgpt-account-id"));
            assert!(!raw.contains("content-encoding"));
            let length = raw.lines().find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").map(|v|v.trim().parse::<usize>().unwrap())).unwrap();
            let mut bytes = vec![0; length];io.read_exact(&mut bytes).await.unwrap();
            let body: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["model"], "synthetic-bound-model");
            assert!(body.to_string().contains(if draft {"FIRST_DRAFT_731"}else{"PLAIN_NATIVE_731"}));assert!(!body.to_string().contains("ORIGINAL_OPAQUE_MUST_REMAIN"));
            assert!(body["tools"].as_array().is_some_and(|v|!v.is_empty()));
            let item = json!({"type":"message","id":"msg_fixture","role":"assistant","status":"completed","content":[{"type":"output_text","text":"LOCAL_ROUTE_PROBE_OK","annotations":[]}]});
            let events = [json!({"type":"response.created","response":{"id":"resp_fixture","status":"in_progress","output":[]}}),json!({"type":"response.output_item.done","output_index":0,"item":item}),json!({"type":"response.completed","response":{"id":"resp_fixture","status":"completed","output":[item],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}})];
            let body = events.iter().map(|event|format!("event: {}\ndata: {event}\n\n",event["type"].as_str().unwrap())).collect::<String>();
            io.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        });
        let settings = super::super::api::Settings::parse(&format!("http://localhost:{port}/v1"), "synthetic-bound-model").unwrap();
        let route = Route::start("fixture-owner".into(), if draft {"draft-fixture".into()}else{"fixture-thread".into()}, Route::prepare_api("fixture-api".into(), settings, "synthetic-probe-only".into()).unwrap()).await.unwrap();
        if !draft {let archive=super::super::context_handoff::tests::archive(home.path(),"fixture-thread");
        route.set_handoff(super::super::context_handoff::Handoff::open(home.path().into(),archive,"fixture-thread".into()).unwrap());route.ready.store(true, Ordering::Release);}
        route.probe(true).await.unwrap();
        let mut command = tokio::process::Command::new(exe);
        command.env_clear();
        for name in ["SYSTEMROOT","WINDIR","PATH","PATHEXT","TEMP","TMP","COMSPEC","USERPROFILE","APPDATA","LOCALAPPDATA","SYSTEMDRIVE"] {if let Some(value)=std::env::var_os(name){command.env(name,value);}}
        command.env("OPENAI_API_KEY","local-carrier-fixture-only");
        // Deliberately no NO_PROXY: preserve the machine's system-proxy case.
        let mut child = command.args(["app-server","--listen","stdio://","-c","analytics.enabled=false"]).env("CODEX_HOME",home.path()).env("CODEX_SQLITE_HOME",home.path().join("sqlite")).current_dir(home.path()).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).kill_on_drop(true).spawn().unwrap();
        let mut input = child.stdin.take().unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        async fn rpc(input:&mut tokio::process::ChildStdin,lines:&mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,id:u32,method:&str,params:Value)->Value {
            input.write_all(format!("{}\n",json!({"id":id,"method":method,"params":params})).as_bytes()).await.unwrap();
            loop {let line=tokio::time::timeout(Duration::from_secs(20),lines.next_line()).await.unwrap().unwrap().expect("Backend exited");let value:Value=serde_json::from_str(&line).unwrap();if value["id"]==id {assert!(value.get("error").is_none(),"Official RPC failed: {method}");return value["result"].clone();}}
        }
        rpc(&mut input,&mut lines,1,"initialize",json!({"clientInfo":{"name":"local_http_route_fixture","version":"1"},"capabilities":{"experimentalApi":true}})).await;
        input.write_all(b"{\"method\":\"initialized\"}\n").await.unwrap();
        // New drafts and existing official conversations both use the official carrier.
        // A fresh app-server with its default provider rejects legacy custom-provider turns.
        let config=super::super::draft::configuration(&route.base_url,route.api_settings().as_ref());
        let started=rpc(&mut input,&mut lines,2,"thread/start",json!({"cwd":home.path(),"approvalPolicy":"never","sandbox":"read-only","modelProvider":"openai","model":"synthetic-bound-model","config":config})).await;
        let thread=started["thread"]["id"].as_str().unwrap();
        if draft {
            assert_eq!(started["thread"]["modelProvider"],"openai");assert!(!route.status()["ready"].as_bool().unwrap());
            route.bind_thread(thread.to_owned()).unwrap();
            route.set_new_handoff(home.path().into(),std::path::PathBuf::from(started["thread"]["path"].as_str().unwrap()),home.path().into());
            route.ready.store(true,Ordering::Release);assert_eq!(route.thread(),thread);assert!(route.bind_thread("other".into()).is_err());
        }
        rpc(&mut input,&mut lines,3,"turn/start",json!({"threadId":thread,"model":"synthetic-ui-override","input":[{"type":"text","text":if draft {"Return FIRST_DRAFT_731"}else{"Return PLAIN_NATIVE_731."}}]})).await;
        let completed=tokio::time::timeout(Duration::from_secs(25),async {
            loop {let value:Value=serde_json::from_str(&lines.next_line().await.unwrap().expect("Backend exited")).unwrap();if value["method"]=="turn/completed" {return value["params"]["turn"]["status"]=="completed";}}
        }).await.unwrap();
        child.kill().await.unwrap();route.close();backend.await.unwrap();
        assert!(completed,"Official client did not complete through the production relay");
        let requests=route.requests.load(Ordering::Relaxed);
        // The built-in provider can attempt a WebSocket handshake before
        // the relay directs it to HTTP. The fixture saw one upstream POST.
        assert!((1..=2).contains(&requests));
        assert!(route.status()["diagnostics"]["lastFailure"].is_null());
    }
    #[tokio::test]
    async fn draft_listener_cannot_send_or_rebind_after_expiry(){
        let route=Route::start("fixture".into(),"draft-fixture".into(),Route::prepare_api("api".into(),super::super::api::Settings::parse("https://example.invalid/v1","synthetic-model").unwrap(),"synthetic-only".into()).unwrap()).await.unwrap();
        route.probe(true).await.unwrap();
        let response=reqwest::Client::builder().no_proxy().build().unwrap().post(format!("{}/responses",route.base_url)).json(&json!({"input":[]})).send().await.unwrap();
        assert_eq!(response.status(),503);assert!(!route.status()["ready"].as_bool().unwrap());
        route.expire_uncommitted();assert!(route.bind_thread("native-thread".into()).is_err());
    }
    #[tokio::test]
    async fn api_and_official_credentials_endpoints_models_and_compact_are_isolated(){
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move{
            for (name,path) in [("A","/A/v1/responses"),("B","/B/v1/responses/compact"),("official","/official/responses")] {
                let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);let raw=read_header(&mut io).await.unwrap();
                assert!(raw.starts_with(&format!("POST {path} ")));assert!(!raw.to_lowercase().contains("cookie:"));
                if name!="official"{assert!(raw.contains(&format!("authorization: Bearer synthetic-{name}")));assert!(!raw.contains("chatgpt-account-id"));assert!(!raw.contains("host-secret"));assert!(!raw.contains("x-codex-test"));}
                else{assert!(raw.contains("authorization: Bearer fixture-host"));assert!(raw.contains("chatgpt-account-id: host"));assert!(!raw.contains("synthetic-"));}
                let length=raw.lines().find_map(|s|s.to_lowercase().strip_prefix("content-length:").map(|s|s.trim().parse::<usize>().unwrap())).unwrap();let mut bytes=vec![0;length];io.read_exact(&mut bytes).await.unwrap();let body:Value=serde_json::from_slice(&bytes).unwrap();
                if name!="official"{assert_eq!(body["model"],format!("model-{name}"));assert!(body.get("previous_response_id").is_none());assert!(body.get("prompt_cache_key").is_none());assert_eq!(body["tools"][0]["name"],"test_tool");}
                else{assert_eq!(body["model"],"official-model");}
                io.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nx-codex-primary-used-percent: 10\r\nx-codex-primary-window-minutes: 300\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await.unwrap();
            }
        });
        let client=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).build().unwrap();
        let a=Route::prepare_api("api-a".into(),super::super::api::Settings::parse(&format!("http://{address}/A/v1"),"model-A").unwrap(),"synthetic-A".into()).unwrap();
        let route=Route::listen("owner".into(),"thread".into(),a,format!("http://{address}/official"),client.clone()).await.unwrap();route.ready.store(true,Ordering::Release);let url=route.base_url.clone();
        for name in ["A","B","official"]{
            if name=="B"{route.commit_credential(Route::prepare_api("api-b".into(),super::super::api::Settings::parse(&format!("http://{address}/B/v1"),"model-B").unwrap(),"synthetic-B".into()).unwrap());}
            if name=="official"{route.commit_credential(credential("host"));}
            let path=if name=="B"{"/responses/compact"}else{"/responses"};
            let response=client.post(format!("{url}{path}")).header("authorization","Bearer host-secret").header("chatgpt-account-id","host-secret").header("cookie","host-secret").header("x-codex-test","host-private").json(&json!({"model":"official-model","previous_response_id":"private-prior-id","prompt_cache_key":"private-cache-id","tools":[{"type":"function","name":"test_tool","parameters":{}}],"input":[]})).send().await.unwrap();
            assert_eq!(response.status(),200);assert_eq!(response.text().await.unwrap(),"{}");if name!="official"{assert!(route.status()["quota"].is_null());}
        }
        backend.await.unwrap();assert_eq!(route.base_url,url);route.close();
    }
    #[test] fn api_configuration_contains_no_key_and_api_headers_exclude_official_identity(){
        let settings=super::super::api::Settings::parse("https://example.invalid/v1","model").unwrap();let json=serde_json::to_string(&settings).unwrap();assert!(!json.contains("key"));
        let mut input=HeaderMap::new();input.insert("authorization",HeaderValue::from_static("Bearer official"));input.insert("chatgpt-account-id",HeaderValue::from_static("official-id"));input.insert("openai-organization",HeaderValue::from_static("official-org"));
        let out=api_headers(&input,&json!({"accessToken":"synthetic-api-key"})).unwrap();assert_eq!(out["authorization"],"Bearer synthetic-api-key");assert_eq!(out.len(),1);
    }
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
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["evidence"]["errorSummary"]["classification"],"context-limit");assert!(!failure.to_string().contains("private-user-input"));
        let events=crate::runtime_log::take_test_events();assert!(events.iter().any(|e|e["details"]["endpoint"]=="compact"));assert!(!serde_json::to_string(&events).unwrap().contains("private-user-input"));assert_eq!(route.requests.load(Ordering::Relaxed),1);route.close();
    }
    #[tokio::test] async fn empty_upstream_502_has_distinct_retained_evidence(){
        let (route,response,backend)=error_response("/responses",502,"").await;assert_eq!(response.status(),502);assert_eq!(response.text().await.unwrap(),"");backend.await.unwrap();tokio::time::sleep(Duration::from_millis(10)).await;
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["stage"],"upstream-http-error");assert_eq!(failure["evidence"]["errorSummary"]["emptyBody"],true);assert_eq!(failure["evidence"]["status"],502);assert!(!failure.to_string().contains(&route.key));route.close();
    }
    #[tokio::test] async fn truncated_response_retains_stream_stage_and_observed_bytes(){
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let backend=tokio::spawn(async move{let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);read_header(&mut io).await.unwrap();let mut body=[0;2];io.read_exact(&mut body).await.unwrap();io.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{}").await.unwrap();});
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("owner".into(),"thread".into(),credential("B"),format!("http://{address}"),client.clone()).await.unwrap();route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}/responses",route.base_url)).body("{}").send().await.unwrap();assert!(response.text().await.is_err());backend.await.unwrap();tokio::time::sleep(Duration::from_millis(10)).await;
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["stage"],"response-stream");assert_eq!(failure["evidence"]["receivedBytes"],2);assert_eq!(route.requests.load(Ordering::Relaxed),1);route.close();
    }
    #[tokio::test]
    async fn http200_model_failure_is_recorded_without_changing_wire_or_replaying(){
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let event=json!({"type":"response.failed","response":{"error":{"message":"The system is currently experiencing high demand and cannot process your request. Your request exceeds the maximum usage size allowed during peak load. For improved capacity reliability, consider switching to Provisioned Throughput.","private_payload":"NEVER_LOG_ME"}}});
        let wire=format!("event: response.failed\ndata: {event}\n\n");let sent=wire.clone();
        let backend=tokio::spawn(async move{let (socket,_)=listener.accept().await.unwrap();let mut io=BufReader::new(socket);let raw=read_header(&mut io).await.unwrap();let len=raw.lines().find_map(|l|l.to_ascii_lowercase().strip_prefix("content-length:").map(|s|s.trim().parse::<usize>().unwrap())).unwrap();let mut body=vec![0;len];io.read_exact(&mut body).await.unwrap();io.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{sent}",sent.len()).as_bytes()).await.unwrap();});
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let route=Route::listen("fixture".into(),"thread".into(),credential("host"),format!("http://{address}"),client.clone()).await.unwrap();route.ready.store(true,Ordering::Release);
        let response=client.post(format!("{}/responses",route.base_url)).json(&json!({"input":[]})).send().await.unwrap();assert_eq!(response.status(),200);assert_eq!(response.text().await.unwrap(),wire);backend.await.unwrap();
        for _ in 0..20 {if !route.status()["diagnostics"]["lastFailure"].is_null(){break;}tokio::time::sleep(Duration::from_millis(10)).await;}
        let failure=route.status()["diagnostics"]["lastFailure"].clone();assert_eq!(failure["stage"],"upstream-stream-error");assert_eq!(failure["evidence"]["modelFailure"]["classification"],"upstream-peak-capacity");assert!(!failure.to_string().contains("NEVER_LOG_ME"));assert_eq!(route.requests.load(Ordering::Relaxed),1);route.close();
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
    async fn local_http_probe_verifies_listener_before_commit_without_auth_or_upstream() {
        let backend = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let route = Route::start("probe-owner".into(), "probe-thread".into(), credential("B")).await.unwrap();
        assert!(route.base_url.starts_with("http://localhost:"));
        assert_eq!(route.status()["ready"], false);
        route.probe(true).await.unwrap();
        route.probe(false).await.unwrap();
        assert_eq!(route.requests.load(Ordering::Relaxed), 0);
        assert_eq!(route.active.load(Ordering::Relaxed), 0);
        assert!(route.probe.lock().await.is_some());
        assert!(tokio::time::timeout(Duration::from_millis(40), backend.accept()).await.is_err());
        route.close();
        let error = route.probe(true).await.unwrap_err();
        assert_eq!(error.code, "ACCOUNT_LOCAL_ROUTE_UNREACHABLE");
        assert!(error.message.contains("directReachable=false"));
        assert!(!error.message.contains(&route.key));
    }
    #[tokio::test]
    async fn configured_http_proxy_cannot_impersonate_a_ready_local_listener() {
        let proxy = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = proxy.local_addr().unwrap();
        let fake = tokio::spawn(async move {
            let (mut socket, _) = proxy.accept().await.unwrap();
            let mut request = [0u8; 4096];
            let _ = socket.read(&mut request).await.unwrap();
            socket.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n").await.unwrap();
        });
        let client = reqwest::Client::builder().no_proxy().proxy(reqwest::Proxy::all(format!("http://{address}")).unwrap()).build().unwrap();
        let route = Route::listen("owner".into(), "thread".into(), credential("B"), UPSTREAM.into(), client).await.unwrap();
        let error = route.probe(true).await.unwrap_err();
        assert_eq!(error.code, "ACCOUNT_LOCAL_ROUTE_HTTP_PATH");
        assert!(error.message.contains("status=204"));
        assert!(error.message.contains("directReachable=true"));
        assert_eq!(route.status()["ready"], false);
        assert_eq!(route.requests.load(Ordering::Relaxed), 0);
        assert!(!error.message.contains(&route.key));
        fake.await.unwrap();route.close();
    }
    #[test]
    fn local_probe_is_not_an_inference_or_cross_origin_endpoint() {
        let valid = "GET /capability/health HTTP/1.1\r\nHost: localhost:1\r\nx-code-codex-route-probe: 0123456789abcdef0123456789abcdef\r\n\r\n";
        assert!(parse_header(valid, "localhost:1", "capability").is_ok());
        for raw in [valid.replace("capability/health", "wrong/health"),valid.replace("localhost:1", "other:1"),valid.replace("GET", "POST"),valid.replace("\r\n\r\n", "\r\nOrigin: https://untrusted.invalid\r\n\r\n"),valid.replace("\r\n\r\n", "\r\nContent-Length: 1\r\n\r\n"),valid.replace("/health", "/health?query=1")] {
            assert!(parse_header(&raw, "localhost:1", "capability").is_err());
        }
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
    #[tokio::test]
    async fn unterminated_header_is_bounded_before_newline_or_socket_close(){
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();
        let sender=tokio::spawn(async move{let mut socket=TcpStream::connect(address).await.unwrap();socket.write_all(&vec![b'x';65536]).await.unwrap();tokio::time::sleep(Duration::from_secs(1)).await;});
        let(socket,_)=listener.accept().await.unwrap();let mut reader=BufReader::new(socket);
        let error=tokio::time::timeout(Duration::from_millis(500),read_header(&mut reader)).await.expect("Header limit must not wait for a newline").unwrap_err();assert!(error.message.contains("request-header-bound"));sender.abort();
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

#[cfg(test)]
#[path = "native_api_acceptance.rs"]
mod native_api_acceptance;
