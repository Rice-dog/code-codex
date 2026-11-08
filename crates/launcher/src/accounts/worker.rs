//! An account-owned JSONL transport. Authentication is entirely Codex-managed.
use super::{AccountError, Result};
#[cfg(windows)]
use process_wrap::tokio::{CreationFlags, JobObject};
use process_wrap::tokio::{KillOnDrop, TokioChildWrapper, TokioCommandWrap};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    sync::{Mutex, oneshot},
};

const MAX_MESSAGE: usize = 8 * 1024 * 1024;
type Reply = oneshot::Sender<Result<Value>>;
struct PendingSlot<'a>{slots:&'a std::sync::Mutex<HashMap<u64,Reply>>,id:u64}
impl Drop for PendingSlot<'_>{fn drop(&mut self){self.slots.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&self.id);}}
pub struct Worker {
    pub(super) health:super::worker_health::Health,
    pub(super) lifecycle:tokio::sync::RwLock<()>,
    pub(super) health_gate:Mutex<()>,
    pub(super) replacement:std::sync::RwLock<Option<Arc<Worker>>>,
    pub(super) home:std::path::PathBuf,
    pub(super) sqlite:std::path::PathBuf,
    retiring:std::sync::atomic::AtomicBool,
    auth_transition:std::sync::atomic::AtomicBool,
    credential_refresh:std::sync::Mutex<(u64,u64)>,
    retained_home_lease: std::sync::RwLock<Option<Arc<std::fs::File>>>,
    selection:std::sync::RwLock<Option<String>>,
    auth_source: std::sync::RwLock<Option<(std::path::PathBuf, String, bool, Option<Arc<Worker>>)>>,
    writer: Mutex<tokio::process::ChildStdin>,
    pending: std::sync::Mutex<HashMap<u64, Reply>>,
    requests: Mutex<HashMap<String, Value>>,
    events: Arc<Mutex<super::stream::Stream>>,
    next: AtomicU64,
    evidence: Arc<super::backend_diagnostics::Evidence>,
    child: Mutex<Box<dyn TokioChildWrapper>>,
    dead: std::sync::atomic::AtomicBool,
    _launch: Option<crate::discovery::AppServerLaunch>,
    #[cfg(test)] fixture:Option<std::path::PathBuf>,
}
impl Worker {
    pub(super) fn retain_home_lease(&self,lease:Option<Arc<std::fs::File>>){*self.retained_home_lease.write().unwrap_or_else(std::sync::PoisonError::into_inner)=lease;}
    pub async fn spawn(home: &Path) -> Result<Arc<Self>> {
        Self::spawn_sqlite(home, &home.join("sqlite")).await
    }
    pub async fn spawn_sqlite(home: &Path, sqlite: &Path) -> Result<Arc<Self>> {
        Self::spawn_with_events(home,sqlite,None).await
    }
    pub(super) fn spawn_with_events<'a>(home:&'a Path,sqlite:&'a Path,events:Option<Arc<Mutex<super::stream::Stream>>>)->std::pin::Pin<Box<dyn std::future::Future<Output=Result<Arc<Self>>>+Send+'a>> {
        Box::pin(async move {
        let install = crate::discovery::discover_codex(
            None,
            None,
            crate::discovery::ChannelPreference::Stable,
        )
        .map_err(|_| {
            AccountError::new(
                "ACCOUNT_RUNTIME",
                "The official Codex installation could not be located. stage=runtime-discovery.",
            )
        })?;
        let source =
            crate::discovery::discover_app_server_source(None, Some(&install)).map_err(|_| {
                AccountError::new("ACCOUNT_RUNTIME", "The official app-server is unavailable. stage=backend-source-discovery.")
            })?;
        let launch = crate::discovery::prepare_app_server_launch(source).map_err(|_| {
            AccountError::new(
                "ACCOUNT_RUNTIME",
                "Preparing the official app-server failed. stage=launch-extraction.",
            )
        })?;
        let mut command = tokio::process::Command::new(launch.executable());
        command.env_clear();
        for key in [
            "SystemRoot",
            "WINDIR",
            "PATH",
            "PATHEXT",
            "TEMP",
            "TMP",
            "COMSPEC",
            "SYSTEMDRIVE",
            "PROGRAMFILES",
            "PROGRAMFILES(X86)",
            "PROCESSOR_ARCHITECTURE",
            "NUMBER_OF_PROCESSORS",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "USERNAME",
            "USERDOMAIN",
            "HOMEDRIVE",
            "HOMEPATH",
            "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
        ] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        if let Some(path) = launch.sanitized_path() {
            command.env("PATH", path);
        }
        command.current_dir(launch.hardened_working_directory().unwrap_or(home));
        command
            .env("CODEX_HOME", home)
            .env("CODEX_SQLITE_HOME", sqlite)
            .args([
                "app-server",
                "--listen",
                "stdio://",
                "-c",
                &format!("cli_auth_credentials_store={}",json!(super::credentials::storage_mode(home)?)),
                "-c",
                "analytics.enabled=false",

            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // The executable import search path stays hardened. Child shell tools
        // receive the user's actual PATH through the official shell policy.
        if let Some(path) = std::env::var_os("PATH") {
            command.arg("-c").arg(format!("shell_environment_policy.set.PATH={}", json!(path.to_string_lossy())));
        }
        if home.join("config.toml").exists() {
            for value in super::environment::tool_overrides(home)? { command.arg("-c").arg(value); }
        }
        if !home.join("config.toml").exists() {
            command.args(["-c", "approval_policy=\"on-request\"", "-c", "sandbox_mode=\"read-only\""]);
        }
        let mut command = TokioCommandWrap::from(command);
        command.wrap(KillOnDrop);
        #[cfg(windows)]
        {
            command.wrap(CreationFlags(
                windows::Win32::System::Threading::CREATE_NO_WINDOW,
            ));
            command.wrap(JobObject);
        }
        let child = command.spawn().map_err(|e| {
            AccountError::new(
                "ACCOUNT_SPAWN",
                format!("Starting the isolated account backend failed. stage=process-start; osCode={:?}; kind={:?}.",e.raw_os_error(),e.kind()),
            )
        })?;
        Self::connect(child,Some(launch),home,sqlite,events,#[cfg(test)] None).await
        })
    }
    async fn connect(mut child:Box<dyn TokioChildWrapper>,launch:Option<crate::discovery::AppServerLaunch>,home:&Path,sqlite:&Path,events:Option<Arc<Mutex<super::stream::Stream>>>,#[cfg(test)] fixture:Option<std::path::PathBuf>)->Result<Arc<Self>> {
        let writer = child
            .stdin()
            .take()
            .ok_or_else(|| AccountError::protocol("No backend input pipe."))?;
        let output = child
            .stdout()
            .take()
            .ok_or_else(|| AccountError::protocol("No backend output pipe."))?;
        let evidence=Arc::new(super::backend_diagnostics::Evidence::default());
        evidence.process(child.id());
        let startup = Arc::new(Mutex::new(Vec::<u8>::new()));
        let initialized = Arc::new(std::sync::atomic::AtomicBool::new(false));
        if let Some(mut stderr) = child.stderr().take() {
            let startup = startup.clone();
            let initialized = initialized.clone();
            let evidence=evidence.clone();
            tokio::spawn(async move {
                let mut bytes = [0u8; 4096];
                let mut lines=super::backend_diagnostics::Lines::default();
                loop {
                    let n=match stderr.read(&mut bytes).await {
                        Ok(0)=>{evidence.stderr_end(None);break;},
                        Ok(n)=>n,
                        Err(e)=>{evidence.stderr_end(Some(&e));break;},
                    };
                    lines.feed(&bytes[..n],&evidence);
                    if !initialized.load(Ordering::Acquire) {
                        let mut saved = startup.lock().await;
                        let keep = (16 * 1024usize).saturating_sub(saved.len()).min(n);
                        saved.extend_from_slice(&bytes[..keep]);
                    }
                }
                lines.finish(&evidence);
            });
        }
        let worker = Arc::new(Self {
            health:super::worker_health::Health::default(),lifecycle:tokio::sync::RwLock::new(()),health_gate:Mutex::new(()),replacement:std::sync::RwLock::new(None),home:home.to_owned(),sqlite:sqlite.to_owned(),retiring:std::sync::atomic::AtomicBool::new(false),auth_transition:std::sync::atomic::AtomicBool::new(false),credential_refresh:std::sync::Mutex::new((0,0)),
            retained_home_lease:std::sync::RwLock::new(None),
            selection:std::sync::RwLock::new(None),
            auth_source: std::sync::RwLock::new(None),
            writer: Mutex::new(writer),
            pending: std::sync::Mutex::new(HashMap::new()),
            requests: Mutex::new(HashMap::new()),
            events:events.unwrap_or_else(||Arc::new(Mutex::new(super::stream::Stream::default()))),
            next: AtomicU64::new(1),
            evidence,
            child: Mutex::new(child),
            dead: std::sync::atomic::AtomicBool::new(false),
            _launch: launch,
            #[cfg(test)] fixture,
        });
        let weak = Arc::downgrade(&worker);
        tokio::spawn(async move {
            let mut reader = BufReader::new(output);
            loop {
                let mut bytes = Vec::new();
                let read = (&mut reader)
                    .take((MAX_MESSAGE + 1) as u64)
                    .read_until(b'\n', &mut bytes)
                    .await;
                let Some(worker) = weak.upgrade() else { break };
                if !matches!(read,Ok(n) if n>0) || bytes.len() > MAX_MESSAGE {
                    worker.evidence.terminal(if bytes.len()>MAX_MESSAGE {"stdout-size-limit"} else if read.is_err() {"stdout-read-error"} else {"stdout-eof"});
                    worker.ended().await;
                    break;
                }
                let Ok(message) = serde_json::from_slice::<Value>(&bytes) else {
                    worker.evidence.terminal("stdout-invalid-json");
                    worker.ended().await;
                    break;
                };
                worker.evidence.stdout();
                if message["method"]=="account/login/completed"{worker.auth_transition.store(false,Ordering::Release);}
                if message.get("method").is_some() {
                    if message["method"] == "account/chatgptAuthTokens/refresh" {
                        let source = worker
                            .auth_source
                            .read()
                            .unwrap_or_else(std::sync::PoisonError::into_inner)
                            .clone();
                        let auth = if let Some((home, email, host, managed)) = source {
                            if let Some(managed) = managed {
                                managed.invalidate_credential();
                                super::credentials::managed(&managed, &email).await
                            } else {
                                super::credentials::read(&home, &email, host)
                            }
                        } else {
                            Err(AccountError::protocol(
                                "No native credential source is bound.",
                            ))
                        };
                        let response = match auth {
                            Ok(mut value) => {
                                value.as_object_mut().map(|v| v.remove("type"));
                                json!({"id":message["id"],"result":value})
                            }
                            Err(_) => {
                                json!({"id":message["id"],"error":{"code":-32001,"message":"ACCOUNT_REAUTH_REQUIRED: The selected account credential could not be refreshed. Sign in again; no alternate account was used."}})
                            }
                        };
                        let _ = worker.send(response).await;
                        continue;
                    }
                    // A server request is not a response even when it has an ID.
                    if let Some(id) = message.get("id") {
                        let mut requests = worker.requests.lock().await;
                        if requests.len() >= 64 {
                            drop(requests);
                            worker.ended().await;
                            break;
                        }
                        requests.insert(id.to_string(), message.clone());
                    }
                    if message["method"] == "account/login/completed"
                        || message["method"] == "account/updated"
                        || message["method"] == "account/rateLimits/updated"
                        || message
                            .get("params")
                            .and_then(|p| p.get("threadId"))
                            .is_some()
                        || message["method"] == "thread/started"
                    {
                        worker.push(message).await;
                    }
                } else if let Some(id) = message["id"].as_u64() {
                    if let Some(reply) = worker.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&id) {
                        let value = if message.get("error").is_some() {
                            Err(AccountError::new(
                                if message["error"]["message"].as_str().and_then(super::routing::reason).is_some(){"ACCOUNT_WORKSPACE_ROUTING"}else{"ACCOUNT_BACKEND"},
                                format!("{} Backend evidence: rpcCode={}; reason={}; responseDataWithheld=true; requestReplayed=false; networkObservation={}.",sanitize_error(&message["error"]["message"]),message["error"]["code"].as_i64().map(|v|v.to_string()).unwrap_or_else(||"unavailable".into()),message["error"]["message"].as_str().and_then(super::routing::reason).unwrap_or("backend-rejected"),super::backend_diagnostics::classify(message["error"]["message"].as_str().unwrap_or(""))),
                            ))
                        } else {
                            Ok(message["result"].clone())
                        };
                        let _ = reply.send(value);
                    }
                }
            }
        });
        if let Err(error)=Box::pin(worker.request("initialize",json!({"clientInfo":{"name":"code_codex_multi_account","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}))).await{
            let diagnostic=String::from_utf8_lossy(&startup.lock().await).into_owned();
            worker.stop().await;
            return Err(AccountError::new(&error.code,format!("{} Initialization evidence: {}",error.message,sanitize_error(&json!(diagnostic)))));
        }
        // Authorization has not started yet. Stop retaining stderr before login.
        initialized.store(true, Ordering::Release);
        startup.lock().await.clear();
        worker.send(json!({"method":"initialized"})).await?;
        Ok(worker)
    }
    async fn ended(&self) {
        self.dead.store(true, Ordering::Release);
        for (_, pending) in self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).drain() {
            let _=pending.send(Err(AccountError::new("ACCOUNT_DISCONNECTED","The isolated backend disconnected. The task outcome must be reconciled before retrying.")));
        }
        if !self.retiring.load(Ordering::Acquire){self.push(json!({"method":"code-codex/disconnected","params":{}})).await;}
    }
    pub fn set_selection(&self,value:Option<String>){*self.selection.write().unwrap_or_else(std::sync::PoisonError::into_inner)=value;}
    pub fn selection_matches(&self,value:&str)->bool {self.selection.read().unwrap_or_else(std::sync::PoisonError::into_inner).as_deref()==Some(value)}
    pub fn is_dead(&self) -> bool {
        self.effective().ok().flatten().map_or_else(||self.dead.load(Ordering::Acquire),|w|w.dead.load(Ordering::Acquire))
    }
    async fn push(&self, mut message: Value) {
        // Login error text may contain an authorization URL. It never leaves the native service.
        if message["method"] == "account/login/completed" && !message["params"]["error"].is_null() {
            message["params"]["error"] =
                json!("Account authorization failed. Retry the official sign-in flow.");
        }
        self.events.lock().await.push(message);
    }
    pub async fn events(&self, after: u64) -> Result<Value> {
        self.events.lock().await.batch(after,self.is_dead())
    }
    pub async fn cursor(&self) -> u64 {
        self.events.lock().await.cursor()
    }
    pub async fn request(&self, method: &str, params: Value) -> Result<Value> {
        if let Some(target)=self.effective()? {
            if !super::worker_health::read_only(method){return Err(AccountError::new("ACCOUNT_BACKEND_REPLACED","The previous account backend was replaced. No write or task request was replayed."));}
            return target.healthy_read(method,params).await;
        }
        if super::worker_health::read_only(method)&&self.credential_only(){return self.healthy_read(method,params).await;}
        self.request_local(method,params,Duration::from_secs(45)).await
    }
    /// Native credential broker only. A local token read must not enter the
    /// account/read idle probe (which performs network workspace discovery).
    /// The consumer checks the expected identity, workspace and token lifetime.
    pub(super) fn invalidate_credential(&self){let target=self.effective().ok().flatten();let source=target.as_deref().unwrap_or(self);let mut s=source.credential_refresh.lock().unwrap_or_else(std::sync::PoisonError::into_inner);s.0=s.0.saturating_add(1);}
    pub(super) fn credential_refresh_ticket(&self)->(u64,u64,bool){let target=self.effective().ok().flatten();let source=target.as_deref().unwrap_or(self);let s=source.credential_refresh.lock().unwrap_or_else(std::sync::PoisonError::into_inner);(source.evidence.id,s.0,s.0>s.1||s.0==u64::MAX)}
    pub(super) fn credential_refresh_required(&self)->bool{self.credential_refresh_ticket().2}
    pub(super) fn credential_refreshed(&self,ticket:(u64,u64,bool)){let target=self.effective().ok().flatten();let source=target.as_deref().unwrap_or(self);if source.evidence.id==ticket.0{let mut s=source.credential_refresh.lock().unwrap_or_else(std::sync::PoisonError::into_inner);s.1=s.1.max(ticket.1);}}
    pub(super) async fn cached_credential(&self)->Result<Value>{
        // Share lifecycle admission with ordinary reads, not the exclusive
        // network health lane: a slow quota read must not queue a local token.
        let admission=tokio::time::timeout(Duration::from_secs(15),self.lifecycle.read()).await.map_err(|_|AccountError::new("ACCOUNT_BACKEND_HEALTH_BUSY","The credential backend is completing a lifecycle transition. No task was sent."))?;
        if let Some(target)=self.effective()? {drop(admission);return Box::pin(target.cached_credential()).await;}
        if !self.credential_only()||self.auth_transition.load(Ordering::Acquire){return Err(AccountError::new("ACCOUNT_CREDENTIAL_SOURCE","The credential source is not an idle authorized account backend. No task was sent."));}
        self.request_unlocked("getAuthStatus",json!({"includeToken":true,"refreshToken":false}),Duration::from_secs(15)).await
    }
    pub(super) async fn request_local(&self,method:&str,params:Value,budget:Duration)->Result<Value>{
        let _admission=self.lifecycle.read().await;
        self.request_unlocked(method,params,budget).await
    }
    pub(super) async fn request_unlocked(&self, method: &str, params: Value,budget:Duration) -> Result<Value> {
        let label:String=method.chars().filter(|c|c.is_ascii_alphanumeric()||matches!(c,'/'|'_'|'-')).take(96).collect();
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let mut operation=crate::runtime_log::Operation::start("accounts","account.backend.request",json!({"backendInstance":self.evidence.id,"requestId":id,"method":label,"responseTimeoutMs":budget.as_millis(),"writeTimeoutMs":budget.min(Duration::from_secs(15)).as_millis(),"paramsWithheld":true}));
        let started=std::time::Instant::now();
        let mut stage="check-process";
        let mut pipe_timings=json!({});
        let result:Result<Value>=async {
            if matches!(method,"account/login/start"|"account/logout"){self.auth_transition.store(true,Ordering::Release);}
            if self.is_dead(){return Err(AccountError::new("ACCOUNT_DISCONNECTED","The isolated account backend is not running."));}
            let (tx,rx)=oneshot::channel();
            stage="pending-slots";
            {
                let mut pending=self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
                pending.retain(|_,reply|!reply.is_closed());
                if pending.len()>=32{return Err(AccountError::new("ACCOUNT_BUSY",format!("Too many account requests are pending. pendingCount={}; limit=32.",pending.len())));}
                pending.insert(id,tx);
            }
            let _slot=PendingSlot{slots:&self.pending,id};
            stage="transport-write";
            match tokio::time::timeout(budget.min(Duration::from_secs(15)),self.send_observed(json!({"id":id,"method":method,"params":params}),&mut pipe_timings)).await {
                Ok(Ok(()))=>{},
                Ok(Err(error))=>{self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&id);return Err(error);},
                Err(_)=>{self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&id);return Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN",format!("Backend transport write exceeded its deadline. stage=transport-write; timeoutMs={}; deliveryUnverified=true. Do not automatically repeat the operation.",budget.min(Duration::from_secs(15)).as_millis())));},
            }
            stage="backend-response";
            match tokio::time::timeout(budget,rx).await {
                Ok(Ok(value))=>value,
                Ok(Err(_))=>{self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&id);Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN","The backend response channel closed before confirmation. Do not automatically repeat the operation."))},
                Err(_)=>{self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&id);Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN",format!("The backend response deadline expired. timeoutMs={}. Do not automatically repeat the operation.",budget.as_millis())))},
            }
        }.await;
        if result.is_ok()&&matches!(method,"account/login/cancel"|"account/logout"){self.auth_transition.store(false,Ordering::Release);}
        self.health.observe(method,&result);
        self.health.explicit_auth_changed(method,&result);
        let evidence=if result.is_err(){self.evidence.snapshot()}else{json!({"backendInstance":self.evidence.id})};
        operation.finish(if result.is_ok(){"confirmed"}else{"failed"},json!({"backendEvidence":evidence,"pipeTimings":pipe_timings,"pendingCount":self.pending_count_observed(),"method":label,"requestId":id,"stage":stage,"durationMs":started.elapsed().as_millis(),"processDead":self.is_dead(),"errorCode":result.as_ref().err().map(|e|e.code.as_str()),"message":result.as_ref().err().map(|e|e.message.as_str()),"paramsWithheld":true,"taskReplayed":false}));
        result.map_err(|e|AccountError::new(&e.code,format!("{} Transport evidence: operationId={}; backendInstance={}; requestId={id}; method={label}; stage={stage}; elapsedMs={}; processDead={}; taskReplayed=false.",e.message,operation.id(),self.evidence.id,started.elapsed().as_millis(),self.is_dead())))
    }
    pub async fn reply(&self, id: Value, result: Value) -> Result<Value> {
        let request = self
            .requests
            .lock()
            .await
            .remove(&id.to_string())
            .ok_or_else(|| {
                AccountError::new(
                    "ACCOUNT_REQUEST_EXPIRED",
                    "This approval request is no longer active.",
                )
            })?;
        if !matches!(
            request["method"].as_str(),
            Some(
                "item/commandExecution/requestApproval"
                    | "item/fileChange/requestApproval"
                    | "item/permissions/requestApproval"
                    | "item/tool/requestUserInput"
                    | "item/tool/call"
                    | "mcpServer/elicitation/request"
            )
        ) {
            return Err(AccountError::protocol("Unsupported server request reply."));
        }
        self.send(json!({"id":id,"result":result})).await?;
        Ok(json!({"sent":true}))
    }
    fn pending_count_observed(&self)->usize {self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).len()}
    async fn send(&self, value: Value) -> Result<()> {
        self.send_observed(value,&mut json!({})).await
    }
    async fn send_observed(&self, value: Value, timings:&mut Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(&value)
            .map_err(|_| AccountError::protocol("Invalid backend payload."))?;
        if bytes.len() > MAX_MESSAGE {
            return Err(AccountError::protocol(
                "Account request exceeds its size limit.",
            ));
        }
        bytes.push(b'\n');
        timings["stage"]=json!("writer-lock");
        let at=std::time::Instant::now();
        let mut writer = self.writer.lock().await;
        timings["writerWaitMs"]=json!(at.elapsed().as_millis());
        timings["stage"]=json!("pipe-write");
        let at=std::time::Instant::now();
        let result=writer.write_all(&bytes).await;
        timings["pipeWriteMs"]=json!(at.elapsed().as_millis());
        result.map_err(|e|AccountError::new("ACCOUNT_DISCONNECTED",format!("Writing to the account backend failed. stage=pipe-write; ioKind={:?}; osCode={:?}.",e.kind(),e.raw_os_error())))?;
        timings["stage"]=json!("pipe-flush");
        let at=std::time::Instant::now();
        let result=writer.flush().await;
        timings["pipeFlushMs"]=json!(at.elapsed().as_millis());
        result.map_err(|e|AccountError::new("ACCOUNT_DISCONNECTED",format!("Flushing the account backend failed. stage=pipe-flush; ioKind={:?}; osCode={:?}.",e.kind(),e.raw_os_error())))?;
        timings["stage"]=json!("sent");
        Ok(())
    }
    pub async fn stop(&self) {
        if let Ok(Some(target))=self.effective(){let _=target.stop_physical().await;}
        let _=self.stop_physical().await;
    }
    pub(super) async fn stop_physical(&self)->Result<()> {
        if self.dead.load(Ordering::Acquire){return Ok(());}
        std::pin::Pin::from(self.child.lock().await.kill()).await.map_err(|_|AccountError::new("ACCOUNT_LOGOUT_STOP","The isolated account backend could not be stopped; process exit remains unconfirmed."))?;
        self.dead.store(true,Ordering::Release);Ok(())
    }
    pub async fn stop_checked(&self) -> Result<()> {
        if let Some(target)=self.effective()? {target.stop_physical().await?;}
        self.stop_physical().await
    }
    pub(super) fn effective(&self)->Result<Option<Arc<Worker>>>{
        let mut next=self.replacement.read().unwrap_or_else(std::sync::PoisonError::into_inner).clone();let mut last=None;
        for _ in 0..16 {let Some(worker)=next else{if let Some(target)=&last{*self.replacement.write().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(std::sync::Arc::clone(target));}return Ok(last)};next=worker.replacement.read().unwrap_or_else(std::sync::PoisonError::into_inner).clone();last=Some(worker);}
        Err(AccountError::new("ACCOUNT_BACKEND_HEALTH_CHAIN","The account backend recovery chain could not be verified; no task was sent."))
    }
    fn credential_only(&self)->bool{
        let unselected=self.selection.read().unwrap_or_else(std::sync::PoisonError::into_inner).is_none();
        let no_executor_source=self.auth_source.read().unwrap_or_else(std::sync::PoisonError::into_inner).is_none();unselected&&no_executor_source
    }
    pub(super) async fn can_retire(&self)->bool{
        let empty={let mut pending=self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner);pending.retain(|_,reply|!reply.is_closed());pending.is_empty()};
        let credential_only=self.credential_only();
        credential_only&&!self.auth_transition.load(Ordering::Acquire)&&empty&&self.requests.lock().await.is_empty()
    }
    pub(super) async fn spawn_replacement(&self)->Result<Arc<Self>>{
        #[cfg(test)] if let Some(script)=&self.fixture {return Self::spawn_fixture(&self.home,script,Some(self.events.clone())).await;}

        let worker=Self::spawn_with_events(&self.home,&self.sqlite,Some(self.events.clone())).await?;
        worker.retain_home_lease(self.retained_home_lease.read().unwrap_or_else(std::sync::PoisonError::into_inner).clone());Ok(worker)
    }
    #[cfg(test)]pub(super)fn pending_count(&self)->usize{self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).len()}
    #[cfg(test)] pub(super) fn spawn_fixture<'a>(home:&'a Path,script:&'a Path,events:Option<Arc<Mutex<super::stream::Stream>>>)->std::pin::Pin<Box<dyn std::future::Future<Output=Result<Arc<Self>>>+Send+'a>>{
        Box::pin(async move {
            let mut command=tokio::process::Command::new("powershell.exe");
            command.args(["-NoProfile","-ExecutionPolicy","Bypass","-File"]).arg(script).arg("-FixtureRoot").arg(home).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
            let mut wrap=TokioCommandWrap::from(command);wrap.wrap(KillOnDrop);
            #[cfg(windows)]{wrap.wrap(CreationFlags(windows::Win32::System::Threading::CREATE_NO_WINDOW));wrap.wrap(JobObject);}
            let child=wrap.spawn().map_err(|_|AccountError::protocol("Synthetic account health process failed to start."))?;
            Self::connect(child,None,home,&home.join("sqlite"),events,Some(script.to_owned())).await
        })
    }
    pub(super) fn mark_retiring(&self,value:bool){self.retiring.store(value,Ordering::Release);}
    pub fn set_auth_source(
        &self,
        home: std::path::PathBuf,
        email: String,
        host: bool,
        managed: Option<Arc<Worker>>,
    ) {
        *self
            .auth_source
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) =
            Some((home, email, host, managed));
    }
}
fn sanitize_error(value: &Value) -> String {
    let text = value
        .as_str()
        .unwrap_or("The isolated account backend rejected the request.");
    let lower=text.to_ascii_lowercase();
    if ["access_token","refreshtoken","refresh_token","id_token","accesstoken","authtoken","authorization","bearer ","https://auth.","eyj"].iter().any(|marker|lower.contains(marker))
    {
        return "The isolated account backend rejected the request; authentication details were withheld.".into();
    }
    text.chars().take(1500).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[cfg(windows)]
    async fn diagnostics_follow_real_jsonl_error_timeout_and_post_initialize_stderr_without_replay() {
        let d=tempfile::tempdir().unwrap();let script=d.path().join("diagnostic.ps1");
        std::fs::write(&script,r#"param([string]$FixtureRoot)
while($null -ne ($line=[Console]::ReadLine())) {
 $r=$line|ConvertFrom-Json
 if($null -eq $r.id){continue}
 [IO.File]::AppendAllText((Join-Path $FixtureRoot 'methods'),([string]$r.method+"`n"))
 if($r.method -eq 'account/rateLimits/read') {
  [Console]::Error.WriteLine('reqwest::connect dns error failed to lookup address https://private/?token=private Bearer private')
  @{id=$r.id;error=@{code=-32603;message='error sending request for url (https://private): dns error: failed to lookup address';data=@{token='private'}}}|ConvertTo-Json -Depth 6 -Compress|ForEach-Object{[Console]::WriteLine($_)}
 } elseif($r.method -ne 'fixture/hang') {
  @{id=$r.id;result=@{}}|ConvertTo-Json -Compress|ForEach-Object{[Console]::WriteLine($_)}
 }
}
"#).unwrap();
        let w=Worker::spawn_fixture(d.path(),&script,None).await.unwrap();
        crate::runtime_log::capture_test_events();
        let e=w.request_unlocked("account/rateLimits/read",json!({"private":"private"}),Duration::from_secs(2)).await.unwrap_err();
        assert_eq!(e.code,"ACCOUNT_BACKEND");assert!(e.message.contains("networkObservation=DNS"));
        for _ in 0..100 {if w.evidence.snapshot()["stderrLines"].as_u64().unwrap()>0{break}tokio::time::sleep(Duration::from_millis(5)).await;}
        let stderr=w.evidence.snapshot();assert_eq!(stderr["nearbyStderr"][0]["category"],"DNS");assert!(!stderr.to_string().contains("private"));
        let e=w.request_unlocked("fixture/hang",json!({}),Duration::from_millis(35)).await.unwrap_err();
        assert_eq!(e.code,"ACCOUNT_OUTCOME_UNKNOWN");assert_eq!(w.pending_count(),0);
        let events=crate::runtime_log::take_test_events();
        let terminal:Vec<_>=events.iter().filter(|v|v["action"]=="account.backend.request"&&v["outcome"]=="failed").collect();
        assert_eq!(terminal.len(),2);
        for event in &terminal {
            let detail=&event["details"];assert_eq!(detail["backendEvidence"]["backendInstance"],w.evidence.id);
            assert_eq!(detail["pipeTimings"]["stage"],"sent");assert!(detail["pipeTimings"]["writerWaitMs"].is_number());
            assert_eq!(detail["stage"],"backend-response");assert_eq!(detail["taskReplayed"],false);
        }
        // Runtime redaction still protects the existing sanitized outer error message.
        assert!(!serde_json::to_string(&events).unwrap().contains("Bearer private"));
        let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();
        assert_eq!(methods.lines().filter(|m|*m=="account/rateLimits/read").count(),1);
        assert_eq!(methods.lines().filter(|m|*m=="fixture/hang").count(),1);
        crate::runtime_log::capture_test_events();
        let lock=w.writer.lock().await;
        let e=w.request_unlocked("fixture/lock",json!({}),Duration::from_millis(20)).await.unwrap_err();
        assert_eq!(e.code,"ACCOUNT_OUTCOME_UNKNOWN");assert_eq!(w.pending_count(),0);
        let events=crate::runtime_log::take_test_events();
        let detail=&events.iter().find(|v|v["action"]=="account.backend.request"&&v["outcome"]=="failed").unwrap()["details"];
        assert_eq!(detail["pipeTimings"]["stage"],"writer-lock");
        assert_eq!(detail["stage"],"transport-write");
        drop(lock);
        assert!(!std::fs::read_to_string(d.path().join("methods")).unwrap().contains("fixture/lock"));
        w.stop().await;
    }
    #[tokio::test]
    #[ignore = "Requires the qualified official Windows installation; run explicitly on the maintenance host."]
    async fn real_isolated_backend_does_not_inherit_host_login() {
        let home = tempfile::tempdir().unwrap();
        let worker = Worker::spawn(home.path()).await.unwrap();
        let result = worker
            .request("account/read", json!({"refreshToken":false}))
            .await
            .unwrap();
        assert!(
            result["account"].is_null(),
            "A new account home must not inherit the GUI login"
        );
        assert!(
            !home.path().join("auth.json").exists(),
            "The broker requires OS keyring storage"
        );
        worker.stop().await;
        assert!(worker.is_dead());
    }

    #[tokio::test]
    #[ignore = "Explicit live-account maintenance acceptance; three minimal read-only turns, last interrupted."]
    async fn real_account_single_history_continuation_and_stop() {
        let home=std::path::PathBuf::from(std::env::var_os("ACCOUNT_TEST_HOME").unwrap());
        let email=std::env::var("ACCOUNT_TEST_EMAIL").unwrap();
        let host_email=std::env::var("ACCOUNT_TEST_HOST_EMAIL").unwrap();
        let source=Worker::spawn(&home).await.unwrap();
        let temp=tempfile::tempdir().unwrap();
        let executor=Worker::spawn(temp.path()).await.unwrap();
        async fn terminal(worker:&Worker,id:&str,after:&mut u64)->Result<(String,String)>{
            let end=tokio::time::Instant::now()+Duration::from_secs(100);let mut text=String::new();
            while tokio::time::Instant::now()<end {
                let batch=worker.events(*after).await?;*after=batch["cursor"].as_u64().unwrap_or(*after);
                for entry in batch["events"].as_array().into_iter().flatten(){let m=&entry["message"];if m["params"]["threadId"]!=id{continue;}
                    if m["method"]=="item/completed"&&m["params"]["item"]["type"]=="agentMessage"{text.push_str(m["params"]["item"]["text"].as_str().unwrap_or(""));}
                    if m["method"]=="turn/completed"{return Ok((m["params"]["turn"]["status"].as_str().unwrap_or("unknown").to_owned(),text));}
                }
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
            Err(AccountError::new("ACCOUNT_TEST_TIMEOUT","The isolated live test did not reach a terminal state."))
        }
        let outcome:Result<Value>=async{
            let child_auth=super::super::credentials::managed(&source,&email).await?;
            executor.request("account/login/start",child_auth).await?;
            let started=executor.request("thread/start",json!({"cwd":temp.path(),"model":"gpt-6.1-sol","approvalPolicy":"never","sandbox":"read-only","historyMode":"paginated"})).await?;
            let thread=&started["thread"];let id=thread["id"].as_str().ok_or_else(||AccountError::protocol("Test thread missing"))?;let path=thread["path"].as_str().ok_or_else(||AccountError::protocol("Test history missing"))?;
            let mut cursor=executor.cursor().await;
            executor.request("turn/start",json!({"threadId":id,"input":[{"type":"text","text":"Reply with exactly SHARED_IDENTITY_ALPHA. Do not use tools."}],"model":"gpt-6.1-sol","effort":"low"})).await?;
            let first=terminal(&executor,id,&mut cursor).await?;
            if first.0!="completed"||!first.1.contains("SHARED_IDENTITY_ALPHA"){return Err(AccountError::protocol("The selected account did not complete the fixed marker reply."));}
            executor.request("account/login/start",super::super::credentials::read(&super::super::credentials::official_home()?,&host_email,true)?).await?;
            let resumed=executor.request("thread/resume",json!({"threadId":id,"path":path,"excludeTurns":true,"cwd":temp.path(),"approvalPolicy":"never","sandbox":"read-only"})).await?;
            if resumed["thread"]["id"]!=id||!resumed["thread"]["path"].as_str().is_some_and(|v|same_file::is_same_file(v,path).unwrap_or(false)){return Err(AccountError::protocol("The shared test history changed."));}
            cursor=executor.cursor().await;
            executor.request("turn/start",json!({"threadId":id,"input":[{"type":"text","text":"Return only the exact marker from your previous reply. Do not use tools."}],"model":"gpt-6.1-sol","effort":"low"})).await?;
            let second=terminal(&executor,id,&mut cursor).await?;
            if second.0!="completed"||!second.1.contains("SHARED_IDENTITY_ALPHA"){return Err(AccountError::protocol("The new identity did not retain the previous native conversation context."));}
            // Switch back to the already-authorized child for the interrupt check;
            // the concurrently running official GUI task is never the test target.
            executor.request("account/login/start",super::super::credentials::managed(&source,&email).await?).await?;
            let proof_path=std::env::var_os("ACCOUNT_REAL_PROOF").unwrap();
            std::fs::write(&proof_path,serde_json::to_vec_pretty(&json!({"continuationPassed":true,"childCompletedFixedMarker":true,"officialIdentityRetainedPreviousMarker":true,"sameIdAndPath":true,"stop":"pending"})).unwrap()).unwrap();
            let last=executor.request("turn/start",json!({"threadId":id,"input":[{"type":"text","text":"Write a 2000 word explanation of prime numbers. Do not use tools."}],"model":"gpt-6.1-sol","effort":"low"})).await?;
            let start_deadline=tokio::time::Instant::now()+Duration::from_secs(30);let mut active=false;
            while tokio::time::Instant::now()<start_deadline {
                let batch=executor.events(cursor).await?;cursor=batch["cursor"].as_u64().unwrap_or(cursor);
                for entry in batch["events"].as_array().into_iter().flatten(){let m=&entry["message"];if m["method"]=="turn/started"&&m["params"]["turn"]["id"]==last["turn"]["id"]{active=true;}
                    if m["method"]=="turn/completed"&&m["params"]["turn"]["id"]==last["turn"]["id"] {std::fs::write(&proof_path,serde_json::to_vec_pretty(&json!({"continuationPassed":true,"sameIdAndPath":true,"stop":"turn-ended-before-interrupt","status":m["params"]["turn"]["status"],"error":m["params"]["turn"]["error"]})).unwrap()).unwrap();return Err(AccountError::protocol("The isolated interrupt test ended before cancellation could be requested."));}}
                if active{break;}tokio::time::sleep(Duration::from_millis(75)).await;
            }
            if !active{return Err(AccountError::protocol("The interrupt test never confirmed its turn-start notification."));}
            executor.request("turn/interrupt",json!({"threadId":id,"turnId":last["turn"]["id"]})).await?;
            let stopped=terminal(&executor,id,&mut cursor).await?;
            if stopped.0!="interrupted"{return Err(AccountError::protocol("The isolated test did not confirm interruption."));}
            Ok(json!({"passed":true,"productionWorkerAndCredentialCode":true,"sameIdAndPath":true,"childCompletedFixedMarker":true,"officialIdentityRetainedPreviousMarker":true,"confirmedStop":"interrupted","inferenceTurns":3,"toolsRequested":false,"officialGuiLoginUnchanged":true,"historyCopies":0}))
        }.await;
        executor.stop().await;source.stop().await;
        let proof=outcome.expect("Live acceptance failed; authentication responses and tokens are withheld.");
        std::fs::write(std::env::var_os("ACCOUNT_REAL_PROOF").unwrap(),serde_json::to_vec_pretty(&proof).unwrap()).unwrap();
    }
    #[test]
    fn auth_failure_details_are_withheld() {
        for text in ["accessToken=private", "authToken: private", "Authorization: Bearer private", "eyJprivate.payload.signature", "refreshToken=private"]{assert!(!sanitize_error(&json!(text)).contains("private"));}
        assert!(!sanitize_error(&json!("access_token=secret")).contains("secret"));
        assert!(
            !sanitize_error(&json!("https://auth.openai.com/authorize?state=secret"))
                .contains("secret")
        );
    }
}
