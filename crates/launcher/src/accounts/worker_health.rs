//! On-demand read-only health checks for isolated account/credential processes.
//! No model executor, GUI process, login write or user turn is replayed here.
use super::{AccountError,Result,worker::Worker};
use serde_json::{Value,json};
use std::{sync::Mutex,time::{Duration,Instant}};
const IDLE:Duration=Duration::from_secs(300);
const PROBE:Duration=Duration::from_secs(15);
const BACKOFF:Duration=Duration::from_secs(30);
struct State {last_read:Instant,last_repair:Option<Instant>,suspect:bool,identity:Option<String>,identity_locked:bool}
pub(super) struct Health(Mutex<State>);
impl Default for Health {fn default()->Self{Self(Mutex::new(State{last_read:Instant::now(),last_repair:None,suspect:false,identity:None,identity_locked:false}))}}
fn failure(stage:&str,error:&AccountError)->AccountError{AccountError::new("ACCOUNT_BACKEND_HEALTH",format!("Account backend recovery was not confirmed. stage={stage}; originalCode={}; originalFailure={}; no login, tool, or turn request was replayed.",error.code,error.message))}
pub(super) fn read_only(method:&str)->bool{matches!(method,"account/read"|"account/rateLimits/read"|"getAuthStatus")}
fn recoverable(error:&AccountError)->bool{matches!(error.code.as_str(),"ACCOUNT_WORKSPACE_ROUTING"|"ACCOUNT_DISCONNECTED"|"ACCOUNT_OUTCOME_UNKNOWN")}
fn empty_threads(value:&Value)->bool{value["data"].as_array().is_some_and(Vec::is_empty)&&value.get("nextCursor").is_none_or(Value::is_null)}
impl Health {
 pub(super) fn observe(&self,method:&str,result:&Result<Value>){
  if !read_only(method){return;}
  let mut state=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
  match result {
   Ok(value)=>{
    if method=="account/read"&&state.identity_locked&&super::identity::check(value,state.identity.as_deref()).is_err(){state.suspect=true;return;}
    state.last_read=Instant::now();state.suspect=false;if method=="account/read" {if let Some(email)=value["account"]["email"].as_str(){if !state.identity_locked{state.identity=Some(email.to_ascii_lowercase());}}}},
   Err(error)if recoverable(error)=>state.suspect=true,
   _=>{}
  }
 }
 fn check_read(&self,method:&str,result:Result<Value>)->Result<Value>{
  if method!="account/read"{return result;}
  let state=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
  if state.identity_locked{if let Ok(value)=&result{super::identity::check(value,state.identity.as_deref())?;}}
  result
 }
 pub(super) fn explicit_auth_changed(&self,method:&str,result:&Result<Value>){
  if result.is_ok()&&matches!(method,"account/login/start"|"account/logout") {let mut state=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);state.identity_locked=false;state.identity=None;}
 }
 fn due(&self)->bool{let state=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);state.suspect||state.last_read.elapsed()>=IDLE}
 fn backoff(&self)->Option<u128>{let s=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);s.last_repair.filter(|t|s.suspect&&t.elapsed()<BACKOFF).map(|t|BACKOFF.saturating_sub(t.elapsed()).as_millis())}
 fn begin_repair(&self){self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner).last_repair=Some(Instant::now());}
 fn inherit(&self,previous:&Self){let identity=previous.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner).identity.clone();let mut s=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);s.last_repair=Some(Instant::now());s.suspect=true;s.identity=identity;s.identity_locked=true;}
 #[cfg(test)]
 fn identity_matches(&self,value:&Value)->bool{let s=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);value["account"]["type"]=="chatgpt"&&value["account"]["email"].as_str().is_some_and(|email|!email.is_empty()&&email.len()<=320&&s.identity.as_ref().is_none_or(|known|known.eq_ignore_ascii_case(email)))}
}
impl Worker {
 async fn verified_health_account(&self)->Result<Value>{
  let first=self.health.check_read("account/read",self.request_local("account/read",json!({"refreshToken":false}),PROBE).await);
  if first.as_ref().err().is_some_and(super::identity::incomplete){
   crate::runtime_log::record("accounts","account.backend.health","identity-recheck",json!({"stage":"identity-refresh","initialCode":first.as_ref().err().map(|e|e.code.as_str()),"timeoutMs":15000,"responseWithheld":true,"taskReplayed":false}));
   return self.health.check_read("account/read",self.request_local("account/read",json!({"refreshToken":true}),Duration::from_secs(15)).await);
  }first
 }
 pub(super) async fn healthy_read(&self,method:&str,params:Value)->Result<Value>{
  // Quota availability is a remote observation, not evidence that this local
  // process needs replacement. Its caller already checks the account identity.
  // Keep lifecycle admission and deadlines without an idle probe or restart.
  if method=="account/rateLimits/read" {
   if let Some(target)=self.effective()? {
    return Box::pin(target.healthy_read(method,params)).await;
   }
   return tokio::time::timeout(Duration::from_secs(45),self.request_local(method,params,Duration::from_secs(30)))
    .await.map_err(|_|AccountError::new("ACCOUNT_USAGE_TIMEOUT","The quota observation exceeded its deadline. The account backend was retained; no task or write was replayed."))?;
  }
  tokio::time::timeout(Duration::from_secs(45),self.read_with_health(method,params)).await.map_err(|_|AccountError::new("ACCOUNT_BACKEND_HEALTH_TIMEOUT","The bounded account observation ended. No sign-in expiration was inferred and no task or write was replayed."))?
 }
 async fn read_with_health(&self,method:&str,params:Value)->Result<Value>{
  let explicit=method=="account/read"&&params["refreshToken"]==true;
  let _reader=tokio::time::timeout(Duration::from_secs(15),self.health_gate.lock()).await.map_err(|_|AccountError::new("ACCOUNT_BACKEND_HEALTH_BUSY","An account health check is still pending. No request was replayed."))?;
  if let Some(target)=self.effective()? {return Box::pin(target.healthy_read(method,params)).await;}
  if let Some(retry)=self.health.backoff().filter(|_|!explicit){return Err(AccountError::new("ACCOUNT_BACKEND_HEALTH_BACKOFF",format!("The account backend is awaiting another health check. retryAfterMs={retry}; no task was replayed.")));}
  if !explicit&&self.health.due()&&method!="account/read"{
   crate::runtime_log::record("accounts","account.backend.health","checking",json!({"stage":"idle-probe","timeoutMs":PROBE.as_millis(),"readOnly":true,"taskReplayed":false}));
   match self.verified_health_account().await {
    Ok(_)=>{},
    Err(error)if recoverable(&error)=>return self.recover_read(method,params,error).await,
    Err(error)=>return Err(error),
   }
  }
  let result=self.health.check_read(method,self.request_local(method,params.clone(),if method=="account/read"{PROBE}else{Duration::from_secs(30)}).await);
  match result {Err(error)if recoverable(&error)=>self.recover_read(method,params,error).await,result=>result}
 }
 async fn recover_read(&self,method:&str,params:Value,original:AccountError)->Result<Value>{
  if let Some(retry)=self.health.backoff(){return Err(AccountError::new("ACCOUNT_BACKEND_HEALTH_BACKOFF",format!("Account backend recovery is cooling down. retryAfterMs={retry}; originalCode={}; originalFailure={}; no task was replayed.",original.code,original.message)));}
  self.health.begin_repair();
  let mut operation=crate::runtime_log::Operation::start("accounts","account.backend.health",json!({"stage":"recovery-admission","originalCode":original.code,"originalFailure":original.message,"readOnly":true,"taskReplayed":false}));
  let result:Result<Value>=async{
   let _exclusive=tokio::time::timeout(PROBE,self.lifecycle.write()).await.map_err(|_|failure("in-flight-requests",&original))?;
   if !self.can_retire().await{return Err(failure("active-or-pending-backend",&original));}
   let loaded=self.request_unlocked("thread/loaded/list",json!({}),PROBE).await.map_err(|_|failure("idle-capability-unverified",&original))?;
   if !empty_threads(&loaded)||!self.can_retire().await{return Err(failure("loaded-threads-or-pending",&original));}
   self.mark_retiring(true);
   if let Err(error)=self.stop_physical().await{self.mark_retiring(false);return Err(failure("backend-stop",&error));}
   let replacement=Box::pin(self.spawn_replacement()).await.map_err(|error|failure("backend-start",&error))?;
   replacement.health.inherit(&self.health);
   let _replacement_reader=replacement.health_gate.lock().await;
   *self.replacement.write().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(replacement.clone());
   let verified=replacement.verified_health_account().await?;
   if method=="account/read"&&params["refreshToken"]==false{return Ok(verified);}
   // The only replay is the caller's whitelisted read, never its task or login.
   replacement.request_local(method,params,Duration::from_secs(45)).await.map_err(|error|failure("read-retry",&error))
  }.await;
  if result.is_err(){if let Ok(Some(target))=self.effective(){target.health.inherit(&self.health);}}
  operation.finish(if result.is_ok(){"recovered"}else{"blocked"},json!({"stage":if result.is_ok(){"read-confirmed"}else{"recovery-unconfirmed"},"originalCode":original.code,"errorCode":result.as_ref().err().map(|e|e.code.as_str()),"message":result.as_ref().err().map(|e|e.message.as_str()),"readOnly":true,"taskReplayed":false}));result
 }
}
#[cfg(test)] mod tests {
 use super::*;
 #[cfg(windows)] fn fixture(mode:&str)->(tempfile::TempDir,std::path::PathBuf){
  let directory=tempfile::tempdir().unwrap();let script=directory.path().join("backend.ps1");
  let body=r#"param([string]$FixtureRoot)
$ErrorActionPreference='Stop'
$counterPath=Join-Path $FixtureRoot 'starts'
$generation=if(Test-Path -LiteralPath $counterPath){[int][IO.File]::ReadAllText($counterPath)+1}else{1}
[IO.File]::WriteAllText($counterPath,[string]$generation)
$reads=0
$mode='__MODE__'
while($null -ne ($line=[Console]::ReadLine())){
 $request=$line|ConvertFrom-Json
 [IO.File]::AppendAllText((Join-Path $FixtureRoot 'methods'),([string]$request.method+"`n"))
 if($null -eq $request.id){continue}
 $result=@{}
 $failure=$null
 if($request.method -eq 'account/read'){
  $reads++
  if($mode -eq 'cancel' -and $reads -gt 1){continue}
  $email=if($mode -eq 'identity' -and $generation -gt 1){'other@example.invalid'}else{'expected@example.invalid'}
  if(($reads -gt 1 -and $generation -eq 1) -or ($mode -eq 'persistent' -and $generation -gt 1) -or ($mode -eq 'flap' -and $reads -gt 1)){
   if($mode -ne 'healthy'){$failure=@{code=-32603;message='workspace routing discovery timed out'}}
   if($mode -eq 'auth'){$failure=@{code=-32603;message='Invalid authentication'}}
   if($mode -eq 'pending'){@{id='pending-ask';method='item/tool/requestUserInput';params=@{}}|ConvertTo-Json -Compress|ForEach-Object{[Console]::WriteLine($_)}}
  }
  $result=@{account=@{type='chatgpt';email=$email}}
  if($generation -gt 1 -and $mode -in @('empty','partial','transient')){
   if($mode -eq 'empty'){$result=@{account=$null}}elseif($mode -eq 'partial'){$result=@{account=@{type='chatgpt'}}}elseif($reads -eq 1){$result=@{account=@{type='chatgpt'}}}
  }
 }elseif($request.method -eq 'thread/loaded/list'){
  $result=@{data=@();nextCursor=$null}
  if($mode -eq 'loaded'){$result=@{data=@('active-task');nextCursor=$null}}
  if($mode -eq 'paged'){$result=@{data=@();nextCursor='more'}}
  if($mode -eq 'unsupported'){$failure=@{code=-32601;message='Method not found'}}
 }elseif($request.method -eq 'account/logout'){
  if($mode -eq 'write-error'){$failure=@{code=-32603;message='workspace routing discovery timed out'}}
 }elseif($request.method -eq 'account/rateLimits/read'){$result=@{rateLimits=@{}}}
 if($null -ne $failure){$reply=@{id=$request.id;error=$failure}}else{$reply=@{id=$request.id;result=$result}}
 [Console]::WriteLine(($reply|ConvertTo-Json -Compress -Depth 8))
}
"#;
  std::fs::write(&script,body.replace("__MODE__",mode)).unwrap();(directory,script)
 }
 #[cfg(windows)] async fn started(mode:&str)->(tempfile::TempDir,std::sync::Arc<Worker>){let(d,s)=fixture(mode);let w=Worker::spawn_fixture(d.path(),&s,None).await.unwrap();w.request("account/read",json!({"refreshToken":false})).await.unwrap();(d,w)}
 #[cfg(windows)] fn starts(path:&std::path::Path)->u32{std::fs::read_to_string(path.join("starts")).unwrap().parse().unwrap()}
 #[cfg(windows)] fn idle(worker:&Worker){worker.health.0.lock().unwrap().last_read=Instant::now()-IDLE;}
 #[tokio::test]#[cfg(windows)]async fn isolated_read_recovery_replaces_only_idle_backend_once(){let(d,w)=started("routing").await;idle(&w);let account=w.request("account/read",json!({"refreshToken":false})).await.unwrap();assert_eq!(account["account"]["email"],"expected@example.invalid");assert_eq!(starts(d.path()),2);assert!(!w.is_dead());w.request("account/rateLimits/read",json!({})).await.unwrap();assert_eq!(starts(d.path()),2);let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert_eq!(methods.lines().filter(|m|*m=="thread/loaded/list").count(),1);assert!(!methods.contains("turn/")&&!methods.contains("account/login"));w.stop_checked().await.unwrap();assert!(w.is_dead());}
 #[tokio::test]#[cfg(windows)]async fn concurrent_reads_share_one_repair_and_old_writes_never_follow_replacement(){let(d,w)=started("routing").await;idle(&w);let mut requests=Vec::new();for _ in 0..4{let clone=w.clone();requests.push(tokio::spawn(async move{clone.request("account/read",json!({"refreshToken":false})).await}));}for request in requests{assert!(request.await.unwrap().is_ok());}assert_eq!(starts(d.path()),2);assert_eq!(w.request("account/logout",json!({})).await.unwrap_err().code,"ACCOUNT_BACKEND_REPLACED");tokio::time::sleep(Duration::from_millis(25)).await;let events=w.events(0).await.unwrap();assert!(!events.to_string().contains("code-codex/disconnected"));assert!(!std::fs::read_to_string(d.path().join("methods")).unwrap().contains("account/logout"));w.stop().await;}
 #[tokio::test]#[cfg(windows)]async fn quota_read_does_not_probe_idle_backend_or_restart(){let(d,w)=started("healthy").await;idle(&w);w.request("account/rateLimits/read",json!({})).await.unwrap();assert_eq!(starts(d.path()),1);let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert_eq!(methods.lines().filter(|m|*m=="account/read").count(),1);assert_eq!(methods.lines().filter(|m|*m=="account/rateLimits/read").count(),1);assert!(!methods.contains("thread/loaded/list"));w.stop().await;}
 #[tokio::test]#[cfg(windows)]async fn native_cached_credential_read_does_not_launch_idle_network_probe(){let(d,w)=started("routing").await;idle(&w);w.cached_credential().await.unwrap();w.stop_checked().await.unwrap();let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert_eq!(methods.lines().filter(|m|*m=="account/read").count(),1);assert_eq!(methods.lines().filter(|m|*m=="getAuthStatus").count(),1);assert_eq!(starts(d.path()),1);}
 #[tokio::test]#[cfg(windows)]async fn loaded_unknown_paginated_pending_and_executor_backends_are_never_restarted(){for mode in["loaded","unsupported","paged","pending","routing","executor-auth","login-pending"]{let(d,w)=started(mode).await;if mode=="routing"{w.set_selection(Some("task-owner".into()));}if mode=="executor-auth"{w.set_auth_source(d.path().to_owned(),"expected@example.invalid".into(),false,None);}if mode=="login-pending"{w.request("account/login/start",json!({"type":"chatgpt"})).await.unwrap();}idle(&w);assert!(w.request("account/read",json!({"refreshToken":false})).await.is_err(),"{mode}");assert_eq!(starts(d.path()),1,"{mode}");w.stop().await;}}
 #[tokio::test]#[cfg(windows)]async fn persistent_failure_backoff_and_identity_mismatch_do_not_loop_or_accept_other_account(){for mode in["persistent","identity"]{let(d,w)=started(mode).await;idle(&w);assert!(w.request("account/read",json!({"refreshToken":false})).await.is_err());assert_eq!(starts(d.path()),2);let second=w.request("account/read",json!({"refreshToken":false})).await.unwrap_err();assert_eq!(second.code,"ACCOUNT_BACKEND_HEALTH_BACKOFF");assert_eq!(starts(d.path()),2);if mode=="identity"{let current=w.effective().unwrap().unwrap();current.health.0.lock().unwrap().last_repair=Some(Instant::now()-BACKOFF);let error=w.request("account/read",json!({"refreshToken":false})).await.unwrap_err();assert_eq!(error.code,"ACCOUNT_CREDENTIAL_IDENTITY");assert!(current.health.due());let auth_error=w.request("getAuthStatus",json!({"includeToken":true})).await.unwrap_err();assert_eq!(auth_error.code,"ACCOUNT_CREDENTIAL_IDENTITY");assert!(!std::fs::read_to_string(d.path().join("methods")).unwrap().contains("getAuthStatus"));assert_eq!(starts(d.path()),2);}w.stop().await;}}
 #[tokio::test]#[cfg(windows)]async fn successful_probe_followed_by_another_route_failure_still_respects_cooldown(){let(d,w)=started("flap").await;idle(&w);w.request("account/read",json!({"refreshToken":false})).await.unwrap();assert_eq!(starts(d.path()),2);let error=w.request("account/read",json!({"refreshToken":false})).await.unwrap_err();assert_eq!(error.code,"ACCOUNT_BACKEND_HEALTH_BACKOFF");assert_eq!(starts(d.path()),2);w.stop().await;}
 #[tokio::test]#[cfg(windows)]async fn authentication_errors_and_writes_are_not_recovered_or_replayed(){let(d,w)=started("auth").await;idle(&w);assert_eq!(w.request("account/read",json!({"refreshToken":false})).await.unwrap_err().code,"ACCOUNT_BACKEND");assert_eq!(starts(d.path()),1);w.stop().await;let(d,w)=started("write-error").await;assert!(w.request("account/logout",json!({})).await.is_err());assert_eq!(starts(d.path()),1);assert_eq!(std::fs::read_to_string(d.path().join("methods")).unwrap().lines().filter(|m|*m=="account/logout").count(),1);w.stop().await;}

 #[tokio::test]#[cfg(windows)]#[ignore="Explicit read-only official isolated backend capability check; no account credentials or inference."]
 async fn real_official_backend_idle_capability_is_empty_and_account_is_not_inherited(){
  assert_eq!(std::env::var("CC_HEALTH_OFFICIAL_CAPABILITY").as_deref(),Ok("1"));
  let home=tempfile::tempdir().unwrap();let worker=Worker::spawn(home.path()).await.unwrap();
  let result=worker.request("thread/loaded/list",json!({})).await;
  let account=worker.request("account/read",json!({"refreshToken":false})).await;
  worker.stop_checked().await.unwrap();assert!(empty_threads(&result.unwrap()));assert!(account.unwrap()["account"].is_null());
  println!("OFFICIAL_HEALTH_ACCEPTANCE {}",json!({"compatible":true,"loadedEmpty":true,"accountPresent":false,"inferenceRequests":0,"credentialLogged":false}));
 }
 #[test]fn health_is_on_demand_and_tracks_idle_and_explicit_failures(){let h=Health::default();assert!(!h.due());h.0.lock().unwrap().last_read=Instant::now()-IDLE;assert!(h.due());h.observe("account/read",&Ok(json!({"account":{"type":"chatgpt","email":"expected@example.invalid"}})));assert!(!h.due());h.observe("account/read",&Err(AccountError::new("ACCOUNT_WORKSPACE_ROUTING","fixed failure")));assert!(h.due());h.begin_repair();assert!(h.backoff().is_some());}
 #[test]fn no_write_or_task_is_replayable(){for m in["turn/start","thread/start","thread/resume","account/login/start","account/logout","initialize","item/tool/call"]{assert!(!read_only(m));}for m in["account/read","getAuthStatus","account/rateLimits/read"]{assert!(read_only(m));}}
 #[test]fn idle_contract_fails_closed_for_unknown_loaded_and_paginated(){assert!(empty_threads(&json!({"data":[],"nextCursor":null})));for v in[json!({}),json!({"data":null}),json!({"data":["thread"]}),json!({"data":[],"nextCursor":"more"})]{assert!(!empty_threads(&v));}}
 #[test]fn auth_and_unknown_backend_errors_do_not_trigger_process_recovery(){for code in["ACCOUNT_AUTH_REQUIRED","ACCOUNT_CREDENTIAL_IDENTITY","ACCOUNT_BACKEND","ACCOUNT_PROTOCOL","ACCOUNT_BUSY"]{assert!(!recoverable(&AccountError::new(code,"fixture")));}let h=Health::default();h.observe("account/read",&Err(AccountError::new("ACCOUNT_AUTH_REQUIRED","fixture")));assert!(!h.due());}
 #[tokio::test]#[cfg(windows)]async fn incomplete_recovered_identity_refreshes_once_without_accepting_or_exporting_unknown_account(){
  for (mode,code) in [("empty","ACCOUNT_AUTH_REQUIRED"),("partial","ACCOUNT_IDENTITY_UNAVAILABLE"),("transient","")]{let(d,w)=started(mode).await;idle(&w);let result=w.request("account/read",json!({"refreshToken":false})).await;if code.is_empty(){assert_eq!(result.unwrap()["account"]["email"],"expected@example.invalid");}else{assert_eq!(result.unwrap_err().code,code);let current=w.effective().unwrap().unwrap();assert!(current.health.due());assert!(w.request("getAuthStatus",json!({"includeToken":true})).await.is_err());assert!(!std::fs::read_to_string(d.path().join("methods")).unwrap().contains("getAuthStatus"));}assert_eq!(starts(d.path()),2);assert_eq!(std::fs::read_to_string(d.path().join("methods")).unwrap().lines().filter(|m|*m=="account/read").count(),4);w.stop().await;}
 }
 #[tokio::test]#[cfg(windows)]async fn explicit_identity_refresh_is_not_blocked_by_passive_health_backoff(){let(d,w)=started("empty").await;idle(&w);assert_eq!(w.request("account/read",json!({"refreshToken":false})).await.unwrap_err().code,"ACCOUNT_AUTH_REQUIRED");let count=std::fs::read_to_string(d.path().join("methods")).unwrap().lines().filter(|m|*m=="account/read").count();assert_eq!(w.request("account/read",json!({"refreshToken":true})).await.unwrap_err().code,"ACCOUNT_AUTH_REQUIRED");assert_eq!(std::fs::read_to_string(d.path().join("methods")).unwrap().lines().filter(|m|*m=="account/read").count(),count+1);assert_eq!(starts(d.path()),2);w.stop().await;}
 #[tokio::test]#[cfg(windows)]async fn cancelled_real_backend_request_releases_pending_slot_without_waiting_for_a_response(){let(_d,w)=started("cancel").await;let copy=w.clone();let job=tokio::spawn(async move{copy.request("account/read",json!({"refreshToken":false})).await});for _ in 0..100{if w.pending_count()==1{break}tokio::time::sleep(Duration::from_millis(2)).await;}assert_eq!(w.pending_count(),1);job.abort();let _=job.await;assert_eq!(w.pending_count(),0);w.stop().await;}
 #[tokio::test]#[cfg(windows)]#[ignore="Explicit saved-connection read-only validation; no inference or authorization dispatch."]
 async fn real_saved_connection_read_only_contract(){
  assert_eq!(std::env::var("CC_SAVED_READ_ACCEPTANCE").as_deref(),Ok("1"));
  let total_start=Instant::now();let mut timing=Vec::new();
  let root=std::path::PathBuf::from(std::env::var_os("CC_SAVED_OWNER_ROOT").expect("owner root required"));
  let base=workspace_service::application_paths::data_root().unwrap().join("accounts");let root=std::fs::canonicalize(root).unwrap();let base=std::fs::canonicalize(base).unwrap();assert!(root.parent()==Some(base.as_path()));
  let registry=super::super::load(&root).unwrap();let id=std::env::var("CC_SAVED_CONNECTION").unwrap();let connection=registry.connections.iter().find(|c|c.id==id&&c.api.is_none()&&c.email.is_some()).unwrap();
  let source=super::super::retention::home(&root,&id).unwrap();let temporary=tempfile::tempdir().unwrap();let home=temporary.path().join("read-only-snapshot");timing.push(json!({"phase":"registry","elapsedMs":total_start.elapsed().as_millis()}));super::super::credentials::snapshot_managed(&source,&home).unwrap();timing.push(json!({"phase":"credential-snapshot","elapsedMs":total_start.elapsed().as_millis()}));super::super::super::runtime_log::capture_test_events();let worker=Worker::spawn(&home).await.unwrap();timing.push(json!({"phase":"backend-started","elapsedMs":total_start.elapsed().as_millis()}));let start=Instant::now();let account=worker.request("account/read",json!({"refreshToken":false})).await;
  let matched=account.as_ref().is_ok_and(|v|super::super::identity::check(v,connection.email.as_deref()).is_ok());let quota=if matched{Some(worker.request("account/rateLimits/read",json!({})).await)}else{None};worker.stop_checked().await.unwrap();super::super::credentials::delete(&home).unwrap();
  println!("SAVED_BACKEND_READ_ACCEPTANCE {}",json!({"identityMatched":matched,"accountCode":account.as_ref().err().map(|e|e.code.as_str()),"quotaCode":quota.as_ref().and_then(|r|r.as_ref().err()).map(|e|e.code.as_str()),"quotaPresent":quota.as_ref().is_some_and(|r|r.as_ref().is_ok_and(|v|v.get("rateLimits").is_some())),"durationMs":start.elapsed().as_millis(),"inferenceRequests":0,"loginRequests":0,"credentialsExposed":false}));
  println!("SAVED_BACKEND_TIMING {}",json!({"totalMs":total_start.elapsed().as_millis(),"phases":timing,"backendRequests":super::super::super::runtime_log::take_test_events().into_iter().filter(|v|v["action"]=="account.backend.request").collect::<Vec<_>>()}));
  assert!(matched,"Saved connection could not be verified: {:?}",account.err());assert!(quota.unwrap().is_ok());
  let warm_home=tempfile::tempdir().unwrap();let warm_start=Instant::now();let warm=Worker::spawn(warm_home.path()).await.unwrap();let warm_ms=warm_start.elapsed().as_millis();warm.stop_checked().await.unwrap();println!("SAVED_BACKEND_WARM_START {}",json!({"durationMs":warm_ms,"sameProcessStageRetained":true,"inferenceRequests":0,"loginRequests":0}));
 }
 #[tokio::test]#[cfg(windows)]#[ignore="Explicit saved-account single-flight timing; temporary native credential snapshot, no inference/login."]
 async fn real_saved_identity_single_flight_timing(){
  assert_eq!(std::env::var("CC_SAVED_READ_ACCEPTANCE").as_deref(),Ok("1"));
  let root=std::fs::canonicalize(std::env::var_os("CC_SAVED_OWNER_ROOT").unwrap()).unwrap();
  let base=std::fs::canonicalize(workspace_service::application_paths::data_root().unwrap().join("accounts")).unwrap();assert_eq!(root.parent(),Some(base.as_path()));
  let registry=super::super::load(&root).unwrap();let id=std::env::var("CC_SAVED_CONNECTION").unwrap();let c=registry.connections.iter().find(|c|c.id==id&&c.api.is_none()&&c.email.is_some()).unwrap();
  let source=super::super::retention::home(&root,&id).unwrap();let temporary=tempfile::tempdir().unwrap();let home=temporary.path().join("single-flight-snapshot");
  super::super::credentials::snapshot_managed(&source,&home).unwrap();let worker=Worker::spawn(&home).await.unwrap();let mut records=Vec::new();
  {
   use base64::Engine;
   let start=Instant::now();let value=worker.request_local("getAuthStatus",json!({"includeToken":true,"refreshToken":false}),Duration::from_secs(45)).await;
   let claims=value.as_ref().ok().and_then(|v|v["authToken"].as_str()).and_then(|t|t.split('.').nth(1)).and_then(|s|base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).ok()).and_then(|s|serde_json::from_slice::<Value>(&s).ok()).unwrap_or(Value::Null);
   let email=claims["email"].as_str().or_else(||claims["https://api.openai.com/profile"]["email"].as_str());
   records.push(json!({"method":"getAuthStatus","durationMs":start.elapsed().as_millis(),"identityMatched":email.zip(c.email.as_deref()).is_some_and(|(a,b)|a.eq_ignore_ascii_case(b)),"workspacePresent":claims["https://api.openai.com/auth"]["chatgpt_account_id"].is_string(),"errorCode":value.as_ref().err().map(|e|e.code.as_str())}));
  }
  for refresh in [false,true]{let start=Instant::now();let result=worker.request_local("account/read",json!({"refreshToken":refresh}),Duration::from_secs(45)).await;let matched=result.as_ref().is_ok_and(|v|super::super::identity::check(v,c.email.as_deref()).is_ok());records.push(json!({"method":"account/read","refresh":refresh,"durationMs":start.elapsed().as_millis(),"identityMatched":matched,"errorCode":result.as_ref().err().map(|e|e.code.as_str())}));}
  worker.stop_checked().await.unwrap();super::super::credentials::delete(&home).unwrap();
  println!("SAVED_SINGLE_FLIGHT {}",json!({"reads":records,"inferenceRequests":0,"loginRequests":0,"credentialsExposed":false}));assert!(records.iter().all(|r|r["identityMatched"]==true));
 }
 #[test]fn replacement_identity_and_backoff_are_preserved(){let h=Health::default();h.observe("account/read",&Ok(json!({"account":{"type":"chatgpt","email":"expected@example.invalid"}})));let n=Health::default();n.inherit(&h);assert!(n.backoff().is_some());assert!(n.identity_matches(&json!({"account":{"type":"chatgpt","email":"EXPECTED@example.invalid"}})));assert!(!n.identity_matches(&json!({"account":{"type":"chatgpt","email":"other@example.invalid"}})));}
 #[tokio::test]#[cfg(windows)]#[ignore="Explicit real saved-account credential reuse and native executor check; temporary snapshot, no inference/OAuth."]
 async fn real_saved_managed_credential_and_executor_contract(){
  assert_eq!(std::env::var("CC_SAVED_READ_ACCEPTANCE").as_deref(),Ok("1"));
  let root=std::fs::canonicalize(std::env::var_os("CC_SAVED_OWNER_ROOT").unwrap()).unwrap();let base=std::fs::canonicalize(workspace_service::application_paths::data_root().unwrap().join("accounts")).unwrap();assert_eq!(root.parent(),Some(base.as_path()));
  let registry=super::super::load(&root).unwrap();let id=std::env::var("CC_SAVED_CONNECTION").unwrap();let connection=registry.connections.iter().find(|c|c.id==id&&c.api.is_none()&&c.email.is_some()).unwrap();let email=connection.email.as_deref().unwrap();
  let source=super::super::retention::home(&root,&id).unwrap();let temporary=tempfile::tempdir().unwrap();let home=temporary.path().join("managed-contract");super::super::credentials::snapshot_managed(&source,&home).unwrap();
  let worker=Worker::spawn(&home).await.unwrap();let start=Instant::now();let auth=super::super::credentials::managed(&worker,email).await;let read_ms=start.elapsed().as_millis();
  let executor_home=tempfile::tempdir().unwrap();let executor=Worker::spawn(executor_home.path()).await.unwrap();let result:Result<()>=async{let auth=auth?;executor.request("account/login/start",auth).await?;let value=executor.request("account/read",json!({"refreshToken":false})).await?;super::super::identity::check(&value,Some(email))?;Ok(())}.await;
  executor.stop_checked().await.unwrap();worker.stop_checked().await.unwrap();super::super::credentials::delete(&home).unwrap();
  println!("MANAGED_EXECUTOR_ACCEPTANCE {}",json!({"credentialReadMs":read_ms,"identityMatched":result.is_ok(),"errorCode":result.as_ref().err().map(|e|e.code.as_str()),"executorCredentialPersisted":executor_home.path().join("auth.json").exists(),"inferenceRequests":0,"oauthRequests":0,"credentialsExposed":false}));assert!(result.is_ok());assert!(!executor_home.path().join("auth.json").exists());
 }
 #[tokio::test]#[cfg(windows)]#[ignore="Explicit real saved-account native relay/identity/quota check; temporary snapshot, no inference/OAuth."]
 async fn real_saved_native_route_credential_contract(){
  assert_eq!(std::env::var("CC_SAVED_READ_ACCEPTANCE").as_deref(),Ok("1"));
  let root=std::fs::canonicalize(std::env::var_os("CC_SAVED_OWNER_ROOT").unwrap()).unwrap();let base=std::fs::canonicalize(workspace_service::application_paths::data_root().unwrap().join("accounts")).unwrap();assert_eq!(root.parent(),Some(base.as_path()));
  let registry=super::super::load(&root).unwrap();let id=std::env::var("CC_SAVED_CONNECTION").unwrap();let c=registry.connections.iter().find(|c|c.id==id&&c.api.is_none()&&c.email.is_some()).unwrap();let email=c.email.as_deref().unwrap();
  let source=super::super::retention::home(&root,&id).unwrap();let temporary=tempfile::tempdir().unwrap();let home=temporary.path().join("native-route-contract");super::super::credentials::snapshot_managed(&source,&home).unwrap();let worker=Worker::spawn(&home).await.unwrap();
  let started=Instant::now();let credential=super::super::relay::Route::prepare_credential(id.clone(),worker.clone(),email.into(),None).await;let credential_ms=started.elapsed().as_millis();
  let route=match credential{Ok(c)=>Some(super::super::relay::Route::start(root.file_name().unwrap().to_str().unwrap().into(),format!("acceptance-{}",super::super::nonce()),c).await.unwrap()),Err(_)=>None};
  let probe=if let Some(route)=&route{route.probe(true).await}else{Err(AccountError::protocol("Credential preparation failed"))};
  let check_start=Instant::now();let identity=super::super::credentials::observe_managed(&worker,email,c.plan.as_deref(),false).await;let identity_ms=check_start.elapsed().as_millis();
  let quota_start=Instant::now();let quota=worker.request("account/rateLimits/read",json!({})).await;let quota_ms=quota_start.elapsed().as_millis();
  if let Some(route)=&route{route.close();}worker.stop_checked().await.unwrap();super::super::credentials::delete(&home).unwrap();
  println!("NATIVE_ROUTE_CREDENTIAL_ACCEPTANCE {}",json!({"credentialMs":credential_ms,"localRouteReady":probe.is_ok(),"identityMatched":identity.as_ref().is_ok_and(|v|super::super::identity::check(v,Some(email)).is_ok()),"identityMs":identity_ms,"quotaMs":quota_ms,"quotaPresent":quota.as_ref().is_ok_and(|v|v.get("rateLimits").is_some()),"quotaCode":quota.as_ref().err().map(|e|e.code.as_str()),"inferenceRequests":0,"oauthRequests":0,"credentialsExposed":false}));assert!(probe.is_ok());assert!(identity.is_ok());assert!(quota.is_ok());
 }
}
