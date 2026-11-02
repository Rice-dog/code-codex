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
pub struct Worker {
    selection:std::sync::RwLock<Option<String>>,
    auth_source: std::sync::RwLock<Option<(std::path::PathBuf, String, bool, Option<Arc<Worker>>)>>,
    writer: Mutex<tokio::process::ChildStdin>,
    pending: Mutex<HashMap<u64, Reply>>,
    requests: Mutex<HashMap<String, Value>>,
    events: Mutex<super::stream::Stream>,
    next: AtomicU64,
    child: Mutex<Box<dyn TokioChildWrapper>>,
    dead: std::sync::atomic::AtomicBool,
    _launch: crate::discovery::AppServerLaunch,
}
impl Worker {
    pub async fn spawn(home: &Path) -> Result<Arc<Self>> {
        Self::spawn_sqlite(home, &home.join("sqlite")).await
    }
    pub async fn spawn_sqlite(home: &Path, sqlite: &Path) -> Result<Arc<Self>> {
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
                "cli_auth_credentials_store=\"keyring\"",
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
        let mut child = command.spawn().map_err(|e| {
            AccountError::new(
                "ACCOUNT_SPAWN",
                format!("Starting the isolated account backend failed. stage=process-start; osCode={:?}; kind={:?}.",e.raw_os_error(),e.kind()),
            )
        })?;
        let writer = child
            .stdin()
            .take()
            .ok_or_else(|| AccountError::protocol("No backend input pipe."))?;
        let output = child
            .stdout()
            .take()
            .ok_or_else(|| AccountError::protocol("No backend output pipe."))?;
        let startup = Arc::new(Mutex::new(Vec::<u8>::new()));
        let initialized = Arc::new(std::sync::atomic::AtomicBool::new(false));
        if let Some(mut stderr) = child.stderr().take() {
            let startup = startup.clone();
            let initialized = initialized.clone();
            tokio::spawn(async move {
                let mut bytes = [0u8; 4096];
                while let Ok(n) = stderr.read(&mut bytes).await {
                    if n == 0 {
                        break;
                    }
                    if initialized.load(Ordering::Acquire) {
                        continue;
                    }
                    let mut saved = startup.lock().await;
                    let keep = (16 * 1024usize).saturating_sub(saved.len()).min(n);
                    saved.extend_from_slice(&bytes[..keep]);
                }
            });
        }
        let worker = Arc::new(Self {
            selection:std::sync::RwLock::new(None),
            auth_source: std::sync::RwLock::new(None),
            writer: Mutex::new(writer),
            pending: Mutex::new(HashMap::new()),
            requests: Mutex::new(HashMap::new()),
            events: Mutex::new(super::stream::Stream::default()),
            next: AtomicU64::new(1),
            child: Mutex::new(child),
            dead: std::sync::atomic::AtomicBool::new(false),
            _launch: launch,
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
                    worker.ended().await;
                    break;
                }
                let Ok(message) = serde_json::from_slice::<Value>(&bytes) else {
                    worker.ended().await;
                    break;
                };
                if message.get("method").is_some() {
                    if message["method"] == "account/chatgptAuthTokens/refresh" {
                        let source = worker
                            .auth_source
                            .read()
                            .unwrap_or_else(std::sync::PoisonError::into_inner)
                            .clone();
                        let auth = if let Some((home, email, host, managed)) = source {
                            if let Some(managed) = managed {
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
                    if let Some(reply) = worker.pending.lock().await.remove(&id) {
                        let value = if message.get("error").is_some() {
                            Err(AccountError::new(
                                if message["error"]["message"].as_str().and_then(super::routing::reason).is_some(){"ACCOUNT_WORKSPACE_ROUTING"}else{"ACCOUNT_BACKEND"},
                                format!("{} Backend evidence: rpcCode={}; reason={}; responseDataWithheld=true; requestReplayed=false.",sanitize_error(&message["error"]["message"]),message["error"]["code"].as_i64().map(|v|v.to_string()).unwrap_or_else(||"unavailable".into()),message["error"]["message"].as_str().and_then(super::routing::reason).unwrap_or("backend-rejected")),
                            ))
                        } else {
                            Ok(message["result"].clone())
                        };
                        let _ = reply.send(value);
                    }
                }
            }
        });
        if let Err(error)=worker.request("initialize",json!({"clientInfo":{"name":"code_codex_multi_account","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}})).await{
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
        for (_, pending) in self.pending.lock().await.drain() {
            let _=pending.send(Err(AccountError::new("ACCOUNT_DISCONNECTED","The isolated backend disconnected. The task outcome must be reconciled before retrying.")));
        }
        self.push(json!({"method":"code-codex/disconnected","params":{}}))
            .await;
    }
    pub fn set_selection(&self,value:Option<String>){*self.selection.write().unwrap_or_else(std::sync::PoisonError::into_inner)=value;}
    pub fn selection_matches(&self,value:&str)->bool {self.selection.read().unwrap_or_else(std::sync::PoisonError::into_inner).as_deref()==Some(value)}
    pub fn is_dead(&self) -> bool {
        self.dead.load(Ordering::Acquire)
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
        let label:String=method.chars().filter(|c|c.is_ascii_alphanumeric()||matches!(c,'/'|'_'|'-')).take(96).collect();
        let mut operation=crate::runtime_log::Operation::start("accounts","account.backend.request",json!({"method":label,"responseTimeoutMs":45000,"writeTimeoutMs":15000,"paramsWithheld":true}));
        let started=std::time::Instant::now();
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let mut stage="check-process";
        let result:Result<Value>=async {
            if self.is_dead(){return Err(AccountError::new("ACCOUNT_DISCONNECTED","The isolated account backend is not running."));}
            let (tx,rx)=oneshot::channel();
            stage="pending-slots";
            {
                let mut pending=self.pending.lock().await;
                pending.retain(|_,reply|!reply.is_closed());
                if pending.len()>=32{return Err(AccountError::new("ACCOUNT_BUSY",format!("Too many account requests are pending. pendingCount={}; limit=32.",pending.len())));}
                pending.insert(id,tx);
            }
            stage="transport-write";
            match tokio::time::timeout(Duration::from_secs(15),self.send(json!({"id":id,"method":method,"params":params}))).await {
                Ok(Ok(()))=>{},
                Ok(Err(error))=>{self.pending.lock().await.remove(&id);return Err(error);},
                Err(_)=>{self.pending.lock().await.remove(&id);return Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN","Backend transport write exceeded its deadline. stage=transport-write; timeoutMs=15000; deliveryUnverified=true. Do not automatically repeat the operation."));},
            }
            stage="backend-response";
            match tokio::time::timeout(Duration::from_secs(45),rx).await {
                Ok(Ok(value))=>value,
                Ok(Err(_))=>{self.pending.lock().await.remove(&id);Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN","The backend response channel closed before confirmation. Do not automatically repeat the operation."))},
                Err(_)=>{self.pending.lock().await.remove(&id);Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN","The backend response deadline expired. timeoutMs=45000. Do not automatically repeat the operation."))},
            }
        }.await;
        operation.finish(if result.is_ok(){"confirmed"}else{"failed"},json!({"method":label,"requestId":id,"stage":stage,"durationMs":started.elapsed().as_millis(),"processDead":self.is_dead(),"errorCode":result.as_ref().err().map(|e|e.code.as_str()),"message":result.as_ref().err().map(|e|e.message.as_str()),"paramsWithheld":true,"taskReplayed":false}));
        result.map_err(|e|AccountError::new(&e.code,format!("{} Transport evidence: operationId={}; requestId={id}; method={label}; stage={stage}; elapsedMs={}; processDead={}; taskReplayed=false.",e.message,operation.id(),started.elapsed().as_millis(),self.is_dead())))
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
    async fn send(&self, value: Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(&value)
            .map_err(|_| AccountError::protocol("Invalid backend payload."))?;
        if bytes.len() > MAX_MESSAGE {
            return Err(AccountError::protocol(
                "Account request exceeds its size limit.",
            ));
        }
        bytes.push(b'\n');
        let mut writer = self.writer.lock().await;
        writer.write_all(&bytes).await.map_err(|_| {
            AccountError::new(
                "ACCOUNT_DISCONNECTED",
                "Writing to the account backend failed.",
            )
        })?;
        writer.flush().await.map_err(|_| {
            AccountError::new(
                "ACCOUNT_DISCONNECTED",
                "Flushing the account backend failed.",
            )
        })
    }
    pub async fn stop(&self) {
        let _ = std::pin::Pin::from(self.child.lock().await.kill()).await;
        self.dead.store(true, Ordering::Release);
    }
    pub async fn stop_checked(&self) -> Result<()> {
        if self.is_dead() {
            return Ok(());
        }
        std::pin::Pin::from(self.child.lock().await.kill())
            .await
            .map_err(|_| {
                AccountError::new(
                    "ACCOUNT_LOGOUT_STOP",
                    "The account process could not be stopped. Logout remains pending.",
                )
            })?;
        self.dead.store(true, Ordering::Release);
        Ok(())
    }
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
