//! Owner-scoped account connections. Does not alter the official GUI's login.
mod host;
mod routing;
mod environment;
mod payload;
pub use payload::Decoded;
mod credentials;
mod policy;
mod preparation;
mod preparing;
mod session;
mod shared;
mod usage;
mod queries;
mod worker;
mod stream;
mod stopping;
mod outcome;
mod relay;
mod relay_diagnostics;
mod native_route;
use cdp_client::{BridgeError, CdpEndpoint};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex;
use worker::Worker;

#[derive(Debug, Clone)]
pub struct AccountError {
    pub code: String,
    pub message: String,
}
impl AccountError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
    pub fn protocol(message: &str) -> Self {
        Self::new("ACCOUNT_PROTOCOL", message)
    }
}
impl From<AccountError> for BridgeError {
    fn from(e: AccountError) -> Self {
        BridgeError::new(e.code, e.message)
    }
}
type Result<T> = std::result::Result<T, AccountError>;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Connection {
    id: String,
    label: String,
    email: Option<String>,
    plan: Option<String>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Registry {
    #[serde(default)]
    shared: HashMap<String, shared::Binding>,
    #[serde(default)]
    active: HashMap<String, String>,
    #[serde(default)]
    schema: u8,
    #[serde(default)]
    connections: Vec<Connection>,
    #[serde(default)]
    selected: HashMap<String, String>,
    #[serde(default)]
    threads: HashMap<String, (String, String, PathBuf)>,
}
struct OwnerState {
    generation: String,
    executors: HashMap<String, Arc<Worker>>,
    login: Option<(String, String)>,
    registry: Registry,
    workers: HashMap<String, Arc<Worker>>,
    threads: HashMap<String, (String, String, PathBuf)>,
    active: HashMap<String, String>,
    cursors: HashMap<String, u64>,
    _lease: std::fs::File,
    lease_generation:Option<String>,
}
pub struct AccountService {
    relays: relay::Routes,
    native_route_lock:Mutex<()>,
    retired_owners:std::sync::Mutex<HashMap<String,Option<String>>>,
    preparations: std::sync::Mutex<HashMap<String, preparation::Preparation>>,
    payloads: payload::Payloads,
    endpoint: std::sync::RwLock<Option<CdpEndpoint>>,
    qualified: tokio::sync::OnceCell<()>,
    state: Mutex<HashMap<String, OwnerState>>,
}
impl Default for AccountService {
    fn default() -> Self {
        Self {
            relays:relay::Routes::default(),native_route_lock:Mutex::new(()),
            retired_owners:std::sync::Mutex::new(Default::default()),
            preparations: std::sync::Mutex::new(HashMap::new()),
            payloads: payload::Payloads::default(),
            endpoint: std::sync::RwLock::new(None),
            qualified: tokio::sync::OnceCell::new(),
            state: Mutex::new(HashMap::new()),
        }
    }
}
impl AccountService {
    pub async fn decode_payload(
        &self,
        params: Value,
        epoch: u64,
        current: impl Fn() -> bool,
    ) -> Result<Decoded> {
        if !params["action"]
            .as_str()
            .is_some_and(|s| s.starts_with("payload."))
        {
            return Ok(Decoded::Request(params));
        }
        let endpoint = self
            .endpoint
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .ok_or_else(|| {
                AccountError::new("ACCOUNT_HOST", "No verified account host is connected.")
            })?;
        self.qualified
.get_or_try_init(|| host::verify_profile(endpoint))
            .await?;
        let owner = host::observe(endpoint).await?;
        if !current() {
            return Err(AccountError::new(
                "ACCOUNT_STALE_SESSION",
                "The account payload belongs to an inactive document.",
            ));
        }
        self.payloads.accept(&owner.id, epoch, &params)
    }
    pub fn connect(&self, endpoint: CdpEndpoint) {
        *self
            .endpoint
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(endpoint);
    }
    pub async fn request(
        &self,
        params: Value,
        workspace: Option<PathBuf>,
        current: impl Fn() -> bool,
    ) -> Result<Value> {
        let endpoint = self
            .endpoint
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .ok_or_else(|| {
                AccountError::new(
                    "ACCOUNT_HOST",
                    "Account selection requires a launch-owned Codex session.",
                )
            })?;
        let action = text(&params, "action")?.to_string();
        validate_fields(&params, &action)?;
        // Verify before loading owner data or touching an isolated credential entry.
        self.qualified
.get_or_try_init(|| host::verify_profile(endpoint))
            .await?;
        let observe_started=std::time::Instant::now();
        let owner=match host::observe(endpoint).await {
            Ok(owner)=>owner,
            Err(error)=>{
                crate::runtime_log::record("accounts","account.observation","failed",json!({"action":action,"stage":"official-owner","durationMs":observe_started.elapsed().as_millis(),"errorCode":error.code,"taskSent":false}));
                return Err(error);
            }
        };
        if observe_started.elapsed().as_millis()>=1000 {
            crate::runtime_log::record("accounts","account.observation","confirmed",json!({"action":action,"stage":"official-owner","durationMs":observe_started.elapsed().as_millis()}));
        }
        if action != "info" && params["owner"].as_str() != Some(owner.id.as_str()) {
            return Err(AccountError::new(
                "ACCOUNT_OWNER_CHANGED",
                "The native host account changed. Refresh the connection list before continuing.",
            ));
        }
        let progress_key = if matches!(action.as_str(),"shared.prepare"|"shared.status"|"native.prepare"|"native.ensure"|"native.detach") {Some(format!("{}:{}",owner.id,identifier(&params,"conversationId")?))}else{None};
        if action=="shared.status" {
            return Ok(self.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).get(progress_key.as_ref().unwrap()).map(|p|p.snapshot()).unwrap_or(json!({"status":"none"})));
        }
        let progress=if matches!(action.as_str(),"shared.prepare"|"native.prepare"|"native.ensure"|"native.detach") {
            let p=preparation::Preparation::start();
            let mut entries=self.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
            if entries.len()>=32 {entries.retain(|_,p|p.snapshot()["status"]=="preparing");}
            if entries.len()>=32 {return Err(AccountError::new("ACCOUNT_BUSY","Too many preparations are pending."));}
            if entries.get(progress_key.as_ref().unwrap()).is_some_and(|p|p.snapshot()["status"]=="preparing") {return Err(AccountError::new("ACCOUNT_SELECTION_PENDING","This conversation already has a pending preparation."));}
            entries.insert(progress_key.unwrap(),p.clone());Some(p)
        }else{None};
        let _progress_guard=progress.clone().map(preparation::Guard);
        let root = owner_root(&owner.id)?;
        if action.starts_with("native.") {if root.join("ended-session.json").exists(){self.relays.close_owner(&owner.id);return Err(AccountError::new("ACCOUNT_OWNER_CHANGED","The official login session ended. No account route was used."));}return native_route::request(self,endpoint,&owner,&params,workspace.as_deref(),progress.as_ref(),current).await;}
        if action=="session.end" || root.join("ended-session.json").exists() {
            let pending:Vec<_>=self.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).iter().filter(|(key,p)|key.starts_with(&format!("{}:",owner.id)) && (p.snapshot()["status"]=="preparing" || p.snapshot()["cleanupConfirmed"]==false)).map(|(_,p)|p.clone()).collect();
            for p in &pending {p.cancel();}
            // End credentials only after cancelled preparation has closed its resources.
            tokio::time::timeout(std::time::Duration::from_secs(15),async {
                while pending.iter().any(|p|p.snapshot()["status"]=="preparing" || p.snapshot()["cleanupConfirmed"]==false) {tokio::time::sleep(std::time::Duration::from_millis(25)).await;}
            }).await.map_err(|_|AccountError::new("ACCOUNT_LOGOUT_PENDING","Cancelled account preparations have not confirmed cleanup. stage=logout-prepare-cleanup; timeoutMs=15000; logout was not forwarded."))?;
        }
        let queue_started=std::time::Instant::now();
        let observing=matches!(action.as_str(),"shared.events"|"shared.reconcile"|"info"|"verify"|"shared.stop");
        let mut all = if progress.is_some() || observing {
            match tokio::time::timeout(std::time::Duration::from_secs(15),self.state.lock()).await {
                Ok(state)=>state,
                Err(_)=>{
                    let elapsed=queue_started.elapsed().as_millis();
                    crate::runtime_log::record("accounts","account.registry","blocked",json!({"action":action,"stage":"registry-lock","queueWaitMs":elapsed,"timeoutMs":15000,"taskSent":false,"taskReplayed":false}));
                    let e=AccountError::new(if progress.is_some(){"ACCOUNT_PREPARE_BUSY"}else{"ACCOUNT_REQUEST_BUSY"},format!("Account observation could not acquire the registry. action={action}; stage=registry-lock; queueWaitMs={elapsed}; timeoutMs=15000. Retry the read after pending work completes; no task was sent."));
                    if let Some(p)=&progress {let e=p.failure(e);p.finish(Some(&e));return Err(e);}
                    return Err(e);
                }
            }
        }else{self.state.lock().await};
        if queue_started.elapsed().as_millis()>=250 {
            crate::runtime_log::record("accounts","account.registry","acquired",json!({"action":action,"stage":"registry-lock","queueWaitMs":queue_started.elapsed().as_millis()}));
        }
        if !current() {
            return Err(AccountError::new(
                "ACCOUNT_STALE_SESSION",
                "The owning renderer session changed before this action could be committed.",
            ));
        }
        let retired: Vec<_> = all
            .iter()
            .filter(|(id, state)| *id != &owner.id && state.active.is_empty())
            .map(|(id, _)| id.clone())
            .collect();
        for id in retired {
            if let Some(state) = all.remove(&id) {
                self.relays.close_owner(&id);
                for worker in state.workers.values().chain(state.executors.values()) {
                    worker.stop().await;
                }
            }
        }
        if !all.contains_key(&owner.id) {
            let retired=self.retired_owners.lock().unwrap_or_else(std::sync::PoisonError::into_inner).get(&owner.id).cloned();
            let document_generation=host::lease_generation(endpoint).await?;
            if retired.is_some_and(|generation| !lease_generation_changed(generation.as_deref(),document_generation.as_deref())) {
                crate::runtime_log::record("accounts","account.lease","retired",json!({"stage":"post-release-observation","runtimePid":std::process::id(),"runtimeVersion":env!("CARGO_PKG_VERSION"),"action":action,"taskSent":false}));
                return Err(AccountError::new("ACCOUNT_RUNTIME_RETIRED","This native account service released its lease and no longer owns the document. stage=post-release-observation; no account was reconnected and no task was sent."));
            }
            let lease = lease(&root)?;
            let registry = load(&root)?;
            let threads = registry.threads.clone();
            let active = registry.active.clone();
            all.insert(
                owner.id.clone(),
                OwnerState {
                    generation: nonce(),
                    executors: HashMap::new(),
                    login: None,
                    registry,
                    workers: HashMap::new(),
                    threads,
                    active,
                    cursors: HashMap::new(),
                    _lease: lease,
                    lease_generation:document_generation,
                },
            );
        }
        let state = all
            .get_mut(&owner.id)
            .ok_or_else(|| AccountError::protocol("Owner state unavailable."))?;
        if root.join("ended-session.json").exists() {
            session::end(state, &root).await?;
        }
        preparing::admit(self, &owner.id, &params)?;
        if action=="shared.prepare" {
            let transaction=preparing::Transaction::capture(state,&params)?;
            drop(all);
            return preparing::run(self,transaction,&root,endpoint,&owner,&params,workspace.as_deref(),progress.as_ref().ok_or_else(||AccountError::protocol("Preparation diagnostics unavailable."))?,current).await;
        }
        if action=="info" || action=="verify" {
            let snapshot=queries::Snapshot::capture(state,&params)?;
            drop(all);
            return queries::read(self,snapshot,&root,endpoint,&owner,&params,current).await;
        }
        match action.as_str() {
            "session.end" => {
                self.relays.close_owner(&owner.id);
                session::end(state, &root).await?;
                Ok(json!({"ended":true}))
            }
            action if action.starts_with("shared.") => {
                shared::request(
                    state,
                    &root,
                    endpoint,
                    &owner,
                    &params,
                    workspace.as_deref(),
                    progress.as_ref(),
                )
                .await
            }
            "usage" | "reset.consume" => {
                let id = text(&params, "connectionId")?.to_string();
                let expected = state
                    .registry
                    .connections
                    .iter()
                    .find(|c| c.id == id)
                    .and_then(|c| c.email.clone())
                    .ok_or_else(|| {
                        AccountError::new(
                            "ACCOUNT_AUTH_REQUIRED",
                            "Authorize this connection before reading its quota.",
                        )
                    })?;
                let worker = get_worker(state, &root, &id).await?;
                // A slow read must not hold the account registry mutex and block Send/Stop.
                drop(all);
                let account = worker
                    .request("account/read", json!({"refreshToken":false}))
                    .await?;
                if account["account"]["type"] != "chatgpt"
                    || !account["account"]["email"]
                        .as_str()
                        .is_some_and(|email| email.eq_ignore_ascii_case(&expected))
                {
                    return Err(AccountError::new(
                        "ACCOUNT_USAGE_IDENTITY",
                        "The connection identity changed. Verify sign-in before reading quota.",
                    ));
                }
                let raw = worker.request("account/rateLimits/read", json!({})).await?;
                let consumed = if action=="reset.consume" {
                    let card=text(&params,"cardId")?;let key=text(&params,"idempotencyKey")?;
                    if card.len()>256||(key.len()!=36||key.chars().enumerate().any(|(i,c)|if matches!(i,8|13|18|23){c!='-'}else{!c.is_ascii_hexdigit()})){return Err(AccountError::protocol("Invalid reset redemption identity."));}
                    let eligible=raw["rateLimitResetCredits"]["credits"].as_array().is_some_and(|cards|cards.iter().any(|c|c["id"]==card&&c["status"]=="available"&&c["resetType"]=="codexRateLimits"&&(c["expiresAt"].is_null()||c["expiresAt"].as_i64().is_some_and(|v|v>std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64))));
                    if !eligible{return Err(AccountError::new("ACCOUNT_RESET_UNAVAILABLE","The selected reset is unavailable or expired. No redemption was sent."));}
                    if !current()||host::observe(endpoint).await?.id!=owner.id{return Err(AccountError::new("ACCOUNT_STALE_SESSION","The owner changed before reset confirmation. No redemption was sent."));}
                    {
                        let registry=self.state.lock().await;
                        let valid=registry.get(&owner.id).is_some_and(|state|state.workers.get(&id).is_some_and(|w|Arc::ptr_eq(w,&worker))&&state.registry.connections.iter().any(|c|c.id==id&&c.email.as_deref().is_some_and(|email|email.eq_ignore_ascii_case(&expected))));
                        if !valid{return Err(AccountError::new("ACCOUNT_RESET_STALE","The reset account connection changed. No redemption was sent."));}
                    }
                    Some(worker.request("account/rateLimitResetCredit/consume",json!({"creditId":card,"idempotencyKey":key})).await?)
                }else{None};
                if !current() || host::observe(endpoint).await?.id != owner.id {
                    return Err(AccountError::new(
                        "ACCOUNT_STALE_SESSION",
                        "The host owner changed while quota was being read.",
                    ));
                }
                if let Some(value)=consumed {
                    let outcome=value["outcome"].as_str().filter(|s|matches!(*s,"reset"|"alreadyRedeemed"|"nothingToReset"|"noCredit")).ok_or_else(||AccountError::new("ACCOUNT_RESET_OUTCOME_UNKNOWN","The reset outcome could not be verified. Do not submit a new redemption key."))?;
                    Ok(json!({"outcome":outcome}))
                }else{Ok(usage::project(&raw))}
            }
            "release" => {
                // Retire only idle per-thread routes, restoring the native default.
                drop(all);
                let _native_guard=native_route::restore(self,endpoint,&owner).await?;
                let mut all=self.state.lock().await;
                let state=all.get_mut(&owner.id).ok_or_else(||AccountError::protocol("Owner state unavailable after native route restoration."))?;
                if !state.active.is_empty() {
                    return Err(AccountError::new(
                        "ACCOUNT_TURN_ACTIVE",
                        "Connected-account turns must finish or be reconciled before releasing this runtime.",
                    ));
                }
                let workers: Vec<_> = state
                    .workers
                    .values()
                    .chain(state.executors.values())
                    .cloned()
                    .collect();
                for worker in workers {
                    worker.stop().await;
                }
                let released_generation=state.lease_generation.clone();
                all.remove(&owner.id);
                self.retired_owners.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(owner.id.clone(),released_generation);
                crate::runtime_log::record("accounts","account.lease","released",json!({"stage":"idle-release","runtimePid":std::process::id(),"runtimeVersion":env!("CARGO_PKG_VERSION"),"activeTasks":0,"postReleaseFence":true,"taskSent":false}));
                Ok(json!({"released":true}))
            }
            "add" => {
                if state.registry.connections.len() >= 16 {
                    return Err(AccountError::new(
                        "ACCOUNT_LIMIT",
                        "At most sixteen account connections are supported.",
                    ));
                }
                let label = text(&params, "label")?.trim();
                if label.is_empty() || label.len() > 100 || label.chars().any(char::is_control) {
                    return Err(AccountError::protocol(
                        "Enter a connection label between one and one hundred characters.",
                    ));
                }
                let id = nonce();
                let home = root.join(&id);
                directory(&home)?;
                let connection = Connection {
                    id: id.clone(),
                    label: label.into(),
                    email: None,
                    plan: None,
                };
                state.registry.connections.push(connection);
                save(&root, &state.registry)?;
                Ok(json!({"id":id}))
            }
            "select" => {
                let conversation = identifier(&params, "conversationId")?;
                if state.active.contains_key(conversation) {
                    return Err(AccountError::new(
                        "ACCOUNT_TURN_ACTIVE",
                        "Wait for the current turn to finish, or stop it and wait for confirmation before selecting another account.",
                    ));
                }
                let id = text(&params, "connectionId")?;
                if id != "host" && !state.registry.connections.iter().any(|c| c.id == id) {
                    return Err(AccountError::new(
                        "ACCOUNT_CONNECTION",
                        "This account connection does not belong to the current host owner.",
                    ));
                }
                if state.registry.selected.len() >= 4096
                    && !state.registry.selected.contains_key(conversation)
                {
                    return Err(AccountError::new(
                        "ACCOUNT_LIMIT",
                        "The saved conversation selection limit was reached.",
                    ));
                }
                state
                    .registry
                    .selected
                    .insert(conversation.into(), id.into());
                save(&root, &state.registry)?;
                Ok(json!({"selected":id}))
            }
            "login" | "login.cancel" | "verify" | "remove" | "reconcile" => {
                let id = text(&params, "connectionId")?.to_string();
                let index = state
                    .registry
                    .connections
                    .iter()
                    .position(|c| c.id == id)
                    .ok_or_else(|| {
                        AccountError::new(
                            "ACCOUNT_CONNECTION",
                            "This account connection is unavailable for the current owner.",
                        )
                    })?;
                if action == "remove" {
                    if state.active.values().any(|v| v == &id) {
                        return Err(AccountError::new(
                            "ACCOUNT_TURN_ACTIVE",
                            "Stop active tasks before disconnecting this account.",
                        ));
                    }
                    let bound: Vec<_> = state
                        .registry
                        .shared
                        .iter()
                        .filter(|(_, b)| b.connection == id)
                        .map(|(logical, _)| logical.clone())
                        .collect();
                    for logical in bound {
                        if let Some(worker) = state.executors.get(&logical) {
                            worker.stop_checked().await?;
                        }
                        state.executors.remove(&logical);
                        if let Some(binding) = state.registry.shared.get_mut(&logical) {
                            binding.connection = "host".into();
                        }
                    }
                    let worker = get_worker(state, &root, &id).await?;
                    worker.request("account/logout", json!({})).await?;
                    worker.stop().await;
                    credentials::delete(&root.join(&id))?;
                    if state.login.as_ref().is_some_and(|v| v.0 == id) {
                        state.login = None;
                    }
                    state.workers.remove(&id);
                    state.registry.connections.remove(index);
                    state.registry.selected.retain(|_, v| v != &id);
                    state.threads.retain(|_, v| v.0 != id);
                    state.registry.threads = state.threads.clone();
                    save(&root, &state.registry)?;
                    // Retain non-secret local thread history for explicit retention/uninstall policy.
                    return Ok(json!({"disconnected":true}));
                }
                if action == "reconcile" {
                    if state.workers.get(&id).is_some_and(|w| w.is_dead()) {
                        state.workers.remove(&id);
                    }
                    let worker = get_worker(state, &root, &id).await?;
                    let threads: Vec<_> = state
                        .threads
                        .iter()
                        .filter(|(_, v)| v.0 == id && state.active.contains_key(&v.1))
                        .map(|(t, v)| (t.clone(), v.1.clone()))
                        .collect();
                    let mut recovered = Vec::new();
                    for (thread, logical) in threads {
                        let read = worker
                            .request(
                                "thread/read",
                                json!({"threadId":thread,"includeTurns":true}),
                            )
                            .await?;
                        let turns = read["thread"]["turns"].as_array().ok_or_else(|| {
                            AccountError::protocol("Reconciliation did not return thread turns.")
                        })?;
                        if turns.iter().any(|t| t["status"] == "inProgress") {
                            return Err(AccountError::new(
                                "ACCOUNT_TURN_ACTIVE",
                                "This backend still reports an active turn. Stop it before switching.",
                            ));
                        }
                        state.active.remove(&logical);
                        recovered.push(logical);
                    }
                    state.registry.active = state.active.clone();
                    save(&root, &state.registry)?;
                    return Ok(json!({"reconciled":recovered}));
                }
                let worker = get_worker(state, &root, &id).await?;
                if !current() {
                    return Err(AccountError::new(
                        "ACCOUNT_STALE_SESSION",
                        "The owning renderer session changed while the account backend was starting.",
                    ));
                }
                match action.as_str() {
                    "login" => {
                        if state.active.values().any(|v| v == &id) {
                            return Err(AccountError::new(
                                "ACCOUNT_TURN_ACTIVE",
                                "Finish or stop this connection's tasks before authorizing it again.",
                            ));
                        }
                        if let Some((pending, pending_id)) = state.login.clone() {
                            if pending != id {
                                return Err(AccountError::new(
                                    "ACCOUNT_LOGIN_BUSY",
                                    "Finish or cancel the other connection's official authorization first.",
                                ));
                            }
                            worker
                                .request("account/login/cancel", json!({"loginId":pending_id}))
                                .await?;
                            state.login = None;
                        }
                        let login=worker.request("account/login/start",json!({"type":"chatgpt","appBrand":"codex","useHostedLoginSuccessPage":false})).await?;
                        let url = login["authUrl"].as_str().ok_or_else(|| {
                            AccountError::protocol(
                                "The backend did not return an official authorization page.",
                            )
                        })?;
                        let login_id = login["loginId"]
                            .as_str()
                            .ok_or_else(|| {
                                AccountError::protocol(
                                    "The backend did not return an authorization ID.",
                                )
                            })?
                            .to_string();
                        state.login = Some((id.clone(), login_id.clone()));
                        if let Err(error) = open_authorization(url) {
                            let _ = worker
                                .request("account/login/cancel", json!({"loginId":login_id}))
                                .await;
                            state.login = None;
                            return Err(error);
                        }
                        Ok(json!({"loginId":login["loginId"],"pending":true}))
                    }
        "login.cancel" => {
                        let (pending, login_id) = state.login.clone().ok_or_else(|| {
                            AccountError::new(
                                "ACCOUNT_LOGIN_IDLE",
                                "No official authorization is pending.",
                            )
                        })?;
                        if pending != id {
                            return Err(AccountError::new(
                                "ACCOUNT_LOGIN_BUSY",
                                "This connection does not own the pending authorization.",
                            ));
                        }
                        let result = worker
                            .request("account/login/cancel", json!({"loginId":login_id}))
                            .await;
                        state.login = None;
                        result
                    }
                    "events" => {
                        let after = params["after"].as_u64().ok_or_else(|| {
                            AccountError::protocol("An event cursor is required.")
                        })?;
                        let result = worker.events(after).await?;
                        for event in result["events"].as_array().into_iter().flatten() {
                            let message = &event["message"];
                            if message["method"] == "turn/completed" {
                                if let Some(thread) = message["params"]["threadId"].as_str() {
                                    if let Some((_, logical, _)) = state.threads.get(thread) {
                                        state.active.remove(logical);
                                    }
                                }
                            }
                        }
                        if state.registry.active != state.active {
                            state.registry.active = state.active.clone();
                            save(&root, &state.registry)?;
                        }
                        state
                            .cursors
                            .insert(id, result["cursor"].as_u64().unwrap_or(after));
                        Ok(result)
                    }
                    "reply" => {
                        worker
                            .reply(params["id"].clone(), params["result"].clone())
                            .await
                    }
                    _ => Err(AccountError::protocol("Unsupported account action.")),
                }
            }
            _ => Err(AccountError::protocol("Unsupported account action.")),
        }
    }
}
async fn get_worker(state: &mut OwnerState, root: &Path, id: &str) -> Result<Arc<Worker>> {
    if let Some(worker) = state.workers.get(id) {
        if !worker.is_dead() {
            return Ok(worker.clone());
        }
        if state.active.values().any(|v| v == id) {
            return Err(AccountError::new(
                "ACCOUNT_OUTCOME_UNKNOWN",
                "This account disconnected with an unfinished task. Reconcile it before restarting.",
            ));
        }
    }
    let home = root.join(id);
    directory(&home)?;
    let worker = Worker::spawn(&home).await?;
    state.workers.insert(id.into(), worker.clone());
    Ok(worker)
}
fn owner_root(owner: &str) -> Result<PathBuf> {
    let root = workspace_service::application_paths::data_root()
        .map_err(|_| AccountError::new("ACCOUNT_STORAGE", "Resolving account storage failed."))?
        .join("accounts")
        .join(owner);
    directory(&root)?;
    Ok(root)
}
fn directory(path: &Path) -> Result<()> {
    workspace_service::application_paths::validate_directory_path(path)
        .and_then(|_| std::fs::create_dir_all(path))
        .map_err(|_| {
            AccountError::new(
                "ACCOUNT_STORAGE",
                "The account storage directory is unavailable or redirected.",
            )
        })
}
fn load(root: &Path) -> Result<Registry> {
    let path = root.join("connections.json");
    if !path.exists() {
        return Ok(Registry {
            schema: 1,
            ..Default::default()
        });
    }
    let value = crate::renderer_storage::read_json(&path, 1024 * 1024).map_err(|_| {
        AccountError::new(
            "ACCOUNT_STORAGE",
            "The saved account registry could not be read.",
        )
    })?;
    let registry: Registry = serde_json::from_value(value).map_err(|_| {
        AccountError::new(
            "ACCOUNT_STORAGE",
            "The saved account registry has an invalid schema.",
        )
    })?;
    if registry.schema != 1
        || registry.connections.len() > 16
        || registry.selected.len() > 4096
        || registry.threads.len() > 8192
        || registry
            .selected
            .keys()
            .chain(registry.active.keys())
            .any(|id| identifier(&json!({"id":id}), "id").is_err())
        || registry.connections.iter().any(|c| !valid_id(&c.id))
    {
        return Err(AccountError::new(
            "ACCOUNT_STORAGE",
            "The saved account registry failed validation.",
        ));
    }
    Ok(registry)
}
fn save(root: &Path, registry: &Registry) -> Result<()> {
    crate::renderer_storage::atomic(&root.join("connections.json"), &json!(registry))
        .map_err(|_| AccountError::new("ACCOUNT_STORAGE", "Saving the account registry failed."))
}
fn nonce() -> String {
    use sha2::{Digest, Sha256};
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!(
        "{:x}",
        Sha256::digest(
            format!(
                "{}-{:?}-{}",
                std::process::id(),
                std::time::SystemTime::now(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            )
            .as_bytes()
        )
    )[..32]
        .into()
}
fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
fn text<'a>(p: &'a Value, key: &str) -> Result<&'a str> {
    p[key]
        .as_str()
        .filter(|v| v.len() <= 4096)
        .ok_or_else(|| AccountError::protocol("A required account field is missing or invalid."))
}
fn identifier<'a>(p: &'a Value, key: &str) -> Result<&'a str> {
    let s = text(p, key)?;
    if s.is_empty()
        || s.len() > 128
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_:.".contains(&b))
    {
        return Err(AccountError::protocol(
            "Invalid account conversation identifier.",
        ));
    }
    Ok(s)
}
fn validate_fields(params: &Value, action: &str) -> Result<()> {
    let extra: &[&str] = match action {
        "info" | "release" | "session.end" => &[],
        "shared.prepare" => &["conversationId", "connectionId", "settings"],
        "native.prepare" | "native.ensure" => &["conversationId", "connectionId"],
        "native.detach" => &["conversationId"],
        "native.status" => &["conversationId"],
        "shared.events" => &["conversationId", "after"],
        "shared.reconcile" | "shared.status" => &["conversationId"],
        "shared.stop" => &["conversationId", "turnId"],
        "shared.reply" => &["conversationId", "id", "result"],
        "shared.rpc" => &["conversationId", "method", "params"],

        "add" => &["label"],
        "select" => &["conversationId", "connectionId"],
        "login" | "verify" | "remove" | "reconcile" | "usage" => &["connectionId"],
        "reset.consume" => &["connectionId", "cardId", "idempotencyKey"],
        "login.cancel" => &["connectionId", "loginId"],
        "events" => &["connectionId", "after"],
        "reply" => &["connectionId", "id", "result"],

        _ => return Err(AccountError::protocol("Unknown account action.")),
    };
    if !params.as_object().is_some_and(|p| {
        p.keys()
            .all(|k| k == "action" || k == "owner" || extra.contains(&k.as_str()))
    }) {
        return Err(AccountError::protocol("Unexpected account request fields."));
    }
    Ok(())
}
fn open_authorization(value: &str) -> Result<()> {
    let url =
        url::Url::parse(value).map_err(|_| AccountError::protocol("Invalid authorization URL."))?;
    if url.scheme() != "https"
        || !matches!(url.host_str(), Some("auth.openai.com" | "chatgpt.com"))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AccountError::protocol(
            "An unexpected account authorization origin was rejected.",
        ));
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let verb: Vec<u16> = std::ffi::OsStr::new("open")
            .encode_wide()
            .chain(Some(0))
            .collect();
        let address: Vec<u16> = std::ffi::OsStr::new(value)
            .encode_wide()
            .chain(Some(0))
            .collect();
        // ShellExecute observes dispatch failure synchronously. A spawned
        // rundll32 process can exit successfully without opening a browser.
        let result = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                address.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
            )
        };
        if result as isize <= 32 {
            return Err(AccountError::new(
                "ACCOUNT_BROWSER",
                format!(
                    "Windows could not open the official authorization page (shell code {}). Check the default HTTPS browser and retry.",
                    result as isize
                ),
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err(AccountError::new(
            "ACCOUNT_UNSUPPORTED",
            "Account authorization is currently supported on Windows only.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_reject_commands_secrets_and_unexpected_fields() {
        for value in [
            json!({"action":"login","connectionId":"x","command":"evil"}),
            json!({"action":"add","label":"x","accessToken":"secret"}),
            json!({"action":"rpc","path":"C:/"}),
            json!({"action":"usage","connectionId":"x","method":"account/logout"}),
            json!({"action":"usage","connectionId":"x","authToken":"secret"}),
            json!({"action":"unknown"}),
        ] {
            assert!(validate_fields(&value, value["action"].as_str().unwrap()).is_err());
        }
    }
    #[test]
    fn identifiers_cannot_escape_storage() {
        for value in ["../escape", "C:/secret", "a\\b", ""] {
            assert!(identifier(&json!({"id":value}), "id").is_err());
        }
        assert!(identifier(&json!({"id":"01a1-1234"}), "id").is_ok());
        assert!(!valid_id("../secret"));
    }
}

fn lease_generation_changed(previous:Option<&str>,current:Option<&str>)->bool { current.is_some() && current!=previous }

fn lease(root: &Path) -> Result<std::fs::File> {
    let path = root.join("owner.lock");
    if path.exists()
        && (!path.is_file()
            || path
                .symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(true))
    {
        return Err(AccountError::new(
            "ACCOUNT_STORAGE",
            "The account lease is redirected.",
        ));
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    options.open(path).map_err(|error|{
        let busy=matches!(error.raw_os_error(),Some(32|33));
        let code=if busy{"ACCOUNT_OWNER_BUSY"}else{"ACCOUNT_LEASE_STORAGE"};
        crate::runtime_log::record("accounts","account.lease","blocked",json!({"stage":"exclusive-owner-lock","runtimePid":std::process::id(),"runtimeVersion":env!("CARGO_PKG_VERSION"),"osCode":error.raw_os_error(),"errorCode":code,"taskSent":false}));
        AccountError::new(code,format!("{} stage=exclusive-owner-lock; requestingRuntimePid={}; osCode={:?}; taskSent=false. No saved account was removed.",if busy{"Another native runtime still holds the account lease. The account list could not be observed."}else{"The native account lease could not be opened."},std::process::id(),error.raw_os_error()))
    })
}

#[cfg(test)]
mod lease_tests {
    use super::*;
    #[test] fn released_native_endpoint_requires_a_new_concrete_document_generation(){
        assert!(!lease_generation_changed(Some("old"),Some("old")));
        assert!(!lease_generation_changed(Some("old"),None));
        assert!(!lease_generation_changed(None,None));
        assert!(lease_generation_changed(Some("old"),Some("new")));
        assert!(lease_generation_changed(None,Some("new")));
    }
    #[cfg(windows)]
    #[test]
    fn exclusive_native_lease_releases_only_when_all_handles_exit() {
        let root=tempfile::tempdir().unwrap();
        let first=lease(root.path()).unwrap();
        let retained=first.try_clone().unwrap();
        assert_eq!(lease(root.path()).unwrap_err().code,"ACCOUNT_OWNER_BUSY");
        drop(first);
        assert_eq!(lease(root.path()).unwrap_err().code,"ACCOUNT_OWNER_BUSY");
        drop(retained);
        assert!(lease(root.path()).is_ok());
    }
    #[test]
    fn storage_errors_are_not_reported_as_another_runtime() {
        let root=tempfile::tempdir().unwrap();
        let file=root.path().join("not-a-directory");std::fs::write(&file,b"fixture").unwrap();
        let error=lease(&file).unwrap_err();
        assert_eq!(error.code,"ACCOUNT_LEASE_STORAGE");
        assert!(error.message.contains("stage=exclusive-owner-lock"));
        assert!(error.message.contains("osCode="));
    }
}

fn crate_marker(root: &Path, pending: bool) -> Result<()> {
    let path = root.join("ended-session.json");
    if pending {
        crate::renderer_storage::atomic(&path, &json!({"schema":1,"explicitLogout":true}))
            .map_err(|_| AccountError::protocol("Persisting account logout failed."))?;
    } else if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|_| AccountError::protocol("Clearing completed logout marker failed."))?;
    }
    Ok(())
}
