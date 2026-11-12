//! Managed official GUI login: preserve the former identity, then verify OAuth outcome.
use super::{AccountError,AccountService,Connection,Result,Worker,credentials,host,retention};
use cdp_client::CdpEndpoint;
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::{path::{Path,PathBuf},time::{Duration,SystemTime,UNIX_EPOCH},sync::Mutex};

static STATE_IO:Mutex<()>=Mutex::new(());
fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis().min(u64::MAX as u128) as u64}

#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Pending {source_owner:String,target_email:String,login_id:String,state:String,
 #[serde(default)] operation_id:String,#[serde(default)] stage:String,
 #[serde(default)] started_at_ms:u64,#[serde(default)] updated_at_ms:u64,
 #[serde(default)] error_code:Option<String>,#[serde(default)] former_primary_preserved:bool,
 #[serde(default)] authorization_requested:bool}
impl Pending {
 fn new(owner:&host::Owner,target:String)->Self{let at=now();Self{source_owner:owner.id.clone(),target_email:target,login_id:String::new(),state:"pending".into(),operation_id:super::nonce(),stage:"idle-check".into(),started_at_ms:at,updated_at_ms:at,error_code:None,former_primary_preserved:false,authorization_requested:false}}
}
struct StartingFence {root:PathBuf,operation_id:String}
impl Drop for StartingFence {
 fn drop(&mut self){let _lock=STATE_IO.lock().unwrap_or_else(std::sync::PoisonError::into_inner);if let Ok(Some(mut value))=read(&self.root){if value.operation_id==self.operation_id&&value.state=="pending"&&value.stage!="authorization-wait"{if value.login_id.is_empty(){value.state="interrupted".into();}value.error_code=Some("ACCOUNT_PRIMARY_INTERRUPTED".into());value.updated_at_ms=now();let _=write(&self.root,&value);event(&value,"interrupted");}}}
}
fn path(root:&Path)->Result<PathBuf>{Ok(root.parent().ok_or_else(||AccountError::protocol("Account parent unavailable."))?.join("primary-switch.json"))}
fn read(root:&Path)->Result<Option<Pending>>{
 let p=path(root)?;if !p.exists(){return Ok(None)}
 let v=crate::renderer_storage::read_json(&p,16384).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_STORAGE","Primary switch state could not be read."))?;
 let value:Pending=serde_json::from_value(v).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_STORAGE","Primary switch state has an invalid schema."))?;
 if value.source_owner.len()!=64||!value.source_owner.bytes().all(|b|b.is_ascii_hexdigit())||value.target_email.len()>320||value.login_id.len()>256||value.operation_id.len()>32||!value.operation_id.bytes().all(|b|b.is_ascii_hexdigit())||value.stage.len()>64||!value.stage.bytes().all(|b|b.is_ascii_lowercase()||b==b'-')||value.error_code.as_ref().is_some_and(|s|s.len()>100||!s.bytes().all(|b|b.is_ascii_uppercase()||b==b'_'))||!matches!(value.state.as_str(),"pending"|"completed"|"cancelled"|"mismatch"|"failed"|"interrupted"){return Err(AccountError::protocol("Primary switch state failed validation."))}
 Ok(Some(value))
}
fn write(root:&Path,p:&Pending)->Result<()>{crate::renderer_storage::atomic(&path(root)?,&json!(p)).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_STORAGE","Primary switch state could not be saved."))}
fn event(p:&Pending,outcome:&str){crate::runtime_log::record("accounts","account.primary",outcome,json!({"operationId":p.operation_id,"stage":p.stage,"state":p.state,"elapsedMs":if p.started_at_ms==0{0}else{p.updated_at_ms.saturating_sub(p.started_at_ms)},"errorCode":p.error_code,"formerPrimaryPreserved":p.former_primary_preserved,"loginDispatched":p.authorization_requested,"authorizationRequested":p.authorization_requested,"taskSent":false,"credentialsExposed":false}));}
fn update(root:&Path,p:&mut Pending,stage:Option<&str>)->Result<()>{
 let _lock=STATE_IO.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
 if !read(root)?.is_some_and(|v|v.operation_id==p.operation_id&&matches!(v.state.as_str(),"pending"|"interrupted")){return Err(AccountError::new("ACCOUNT_PRIMARY_STALE","The primary-account operation was replaced or ended. No authorization was replayed."))}
 if let Some(stage)=stage{p.stage=stage.into();}p.updated_at_ms=now();write(root,p)?;event(p,if p.state=="pending"{"progress"}else{p.state.as_str()});Ok(())
}
fn recovery(p:&Pending)->&'static str{if p.authorization_requested{"Verify the current official login before retrying. Authorization may have started; it was not replayed."}else{"Authorization was not requested. Reopen the panel after the connection recovers and retry when all tasks are idle."}}
pub(super) fn status(root:&Path,owner:&host::Owner)->Result<Value>{
 let Some(mut p)=read(root)?else{return Ok(Value::Null)};
 if matches!(p.state.as_str(),"pending"|"interrupted")&&p.source_owner!=owner.id {
  p.state=if p.target_email.eq_ignore_ascii_case(&owner.label){"completed"}else{"mismatch"}.into();p.updated_at_ms=now();p.stage="identity-confirm".into();p.error_code=if p.state=="mismatch"{Some("ACCOUNT_PRIMARY_IDENTITY_MISMATCH".into())}else{None};
  let _lock=STATE_IO.lock().unwrap_or_else(std::sync::PoisonError::into_inner);if read(root)?.is_some_and(|v|v.operation_id==p.operation_id){write(root,&p)?;event(&p,&p.state);}
 }
 Ok(json!({"state":p.state,"targetEmail":p.target_email,"authorizationRequired":p.state=="pending","operationId":p.operation_id,"stage":p.stage,"elapsedMs":if p.started_at_ms==0{0}else{(if p.state=="pending"{now()}else{p.updated_at_ms}).saturating_sub(p.started_at_ms)},"errorCode":p.error_code,"formerPrimaryPreserved":p.former_primary_preserved,"authorizationRequested":p.authorization_requested,"recovery":if p.error_code.is_some(){Some(recovery(&p))}else{None}}))
}
fn recover_observation(root:&Path,p:&mut Pending,value:&Value)->Result<bool>{
 if !p.login_id.is_empty()||value["operationId"]!=p.operation_id||!value["loginId"].as_str().is_some_and(|s|!s.is_empty()&&s.len()<=256){return Ok(false)}
 let _lock=STATE_IO.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
 if !read(root)?.is_some_and(|v|v.operation_id==p.operation_id&&matches!(v.state.as_str(),"pending"|"interrupted")){return Ok(false)}
 p.login_id=value["loginId"].as_str().unwrap().to_owned();p.state="pending".into();p.error_code=None;p.updated_at_ms=now();p.stage="authorization-wait".into();write(root,p)?;event(p,"reconciled");Ok(true)
}
pub(super) async fn refresh_status(endpoint:CdpEndpoint,root:&Path,owner:&host::Owner)->Result<()> {
 let Some(mut p)=read(root)?else{return Ok(())};if !matches!(p.state.as_str(),"pending"|"interrupted")||p.source_owner!=owner.id||!p.authorization_requested{return Ok(())}
 let value=official(endpoint,json!({"mode":"observation"})).await?;
 // The official identity can change before the bridge awaiting login/start
 // returns. Recover only this exact operation's observation; never replay OAuth.
 recover_observation(root,&mut p,&value)?;
 if p.login_id.is_empty(){return Ok(())}
 if value.is_null()||value["loginId"]!=p.login_id||value["expired"]==true {
  let code=if value["expired"]==true{"ACCOUNT_PRIMARY_AUTHORIZATION_TIMEOUT"}else{"ACCOUNT_PRIMARY_OBSERVATION_LOST"};
  if p.error_code.as_deref()!=Some(code){p.error_code=Some(code.into());update(root,&mut p,None)?;}return Ok(())
 }
 if value["loginId"]==p.login_id&&value["finished"]==true {
  p.state=if value["success"]==true {let actual=host::observe(endpoint).await?;if p.target_email.eq_ignore_ascii_case(&actual.label){"completed"}else{"mismatch"}}else{"failed"}.into();p.error_code=match p.state.as_str(){"mismatch"=>Some("ACCOUNT_PRIMARY_IDENTITY_MISMATCH".into()),"failed"=>Some("ACCOUNT_PRIMARY_AUTHORIZATION_FAILED".into()),_=>None};update(root,&mut p,Some("identity-confirm"))?;
 }Ok(())
}
pub(super) fn guard(root:&Path,owner:&host::Owner,action:&str)->Result<()> {
 let value=status(root,owner)?;
 let uncertain=value["state"]=="interrupted"&&read(root)?.is_some_and(|v|v.authorization_requested);
 if (value["state"]=="pending"||uncertain&&action=="primary.start")&&!matches!(action,"info"|"primary.status"|"native.status"|"primary.cancel"|"session.policy"|"session.end"|"verify"|"usage"|"events"|"shared.events"|"shared.status"|"shared.stop"|"reconcile"|"shared.reconcile") {
  return Err(AccountError::new("ACCOUNT_PRIMARY_PENDING","A primary-account authorization is pending. Complete or cancel it before changing execution accounts. No task was sent."))
 }Ok(())
}
async fn official(endpoint:CdpEndpoint,params:Value)->Result<Value>{
 response(official_value(endpoint,params).await?)
}
async fn official_value(endpoint:CdpEndpoint,params:Value)->Result<Value>{
 let source=include_str!("primary_host.js").replace("__PROFILE__",&host::profile().to_string()).replace("__PARAMS__",&params.to_string());
 host::evaluate_budget(endpoint,&source,Duration::from_secs(20)).await
}
fn response(value:Value)->Result<Value>{
 if let Some(f)=value.get("failure"){return Err(AccountError::new(f["code"].as_str().unwrap_or("ACCOUNT_PRIMARY_RPC"),format!("Primary-account operation was not completed. stage={}; checkedThreads={}; authorizationRequested={}; no inference was sent.",f["stage"].as_str().unwrap_or("unknown"),f["checkedThreads"].as_u64().unwrap_or(0),f["authorizationRequested"].as_bool().unwrap_or(false))))}Ok(value)
}
fn finish_cancel(root:&Path,saved:&mut Pending,confirmed:bool)->Result<Value>{
 saved.state=if confirmed{"cancelled"}else{"failed"}.into();
 saved.error_code=if confirmed{None}else{Some("ACCOUNT_PRIMARY_CANCEL_UNCONFIRMED".into())};
 update(root,saved,Some("authorization-cancel"))?;
 Ok(json!({"cancelled":confirmed,"localSetupEnded":true,"authorizationUnconfirmed":!confirmed&&saved.authorization_requested}))
}
async fn require_plugin_idle(service:&AccountService)->Result<()> {
 let all=tokio::time::timeout(Duration::from_secs(5),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","Primary-account idle verification could not acquire the account registry. No authorization was requested."))?;
 let tasks=all.values().map(|s|s.active.len()).sum::<usize>();
 let logins=all.values().filter(|s|s.login.is_some()).count();
 let preparing=service.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).values().filter(|v|v.snapshot()["status"]=="preparing").count();
 if tasks+logins+preparing>0 {return Err(AccountError::new("ACCOUNT_TURN_ACTIVE",format!("Primary-account switching is blocked by account activity. activeTasks={tasks}; pendingLogins={logins}; preparations={preparing}; finish active tasks or check task status for a stale executor. No authorization was requested.")))}
 Ok(())
}
pub(super) async fn request(service:&AccountService,endpoint:CdpEndpoint,owner:&host::Owner,p:&Value,current:&impl Fn()->bool)->Result<Value>{
 let root=super::owner_root(&owner.id)?;
 if p["action"]=="primary.status"{refresh_status(endpoint,&root,owner).await?;return status(&root,owner)}
 if p["action"]=="primary.cancel" {
  refresh_status(endpoint,&root,owner).await?;
  let Some(mut saved)=read(&root)?else{return Ok(json!({"cancelled":true}))};
  if matches!(saved.state.as_str(),"pending"|"interrupted") {
   if saved.login_id.is_empty(){
    if saved.state=="pending" {return Err(AccountError::new("ACCOUNT_PRIMARY_PREPARING","Primary-account preparation is still running. Wait for a result before cancelling authorization."))}
    return finish_cancel(&root,&mut saved,false);
   }
   let receipt=match official(endpoint,json!({"mode":"cancel","loginId":saved.login_id})).await{Ok(value)=>value,Err(error)=>{saved.error_code=Some(error.code.clone());let _=update(&root,&mut saved,Some("authorization-cancel"));return Err(AccountError::new(&error.code,format!("Cancellation was not confirmed. stage=authorization-cancel; operationId={}; no authorization was replayed. {}",saved.operation_id,error.message)))}};
   return finish_cancel(&root,&mut saved,receipt["status"]=="canceled");
  }
  return Ok(json!({"cancelled":true}));
 }
 guard(&root,owner,"primary.start")?;
 let id=super::text(p,"connectionId")?.to_owned();
 let target={let all=tokio::time::timeout(Duration::from_secs(15),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","Primary switch could not read the account registry. stage=target-selection; authorizationRequested=false."))?;all.get(&owner.id).and_then(|s|s.registry.connections.iter().find(|c|c.id==id&&c.api.is_none())).and_then(|c|c.email.clone()).ok_or_else(||AccountError::new("ACCOUNT_CONNECTION","The selected authorized account is unavailable. stage=target-selection; authorizationRequested=false."))?};
 let mut saved=Pending::new(owner,target);
 {let _lock=STATE_IO.lock().unwrap_or_else(std::sync::PoisonError::into_inner);if read(&root)?.is_some_and(|v|v.state=="pending"){return Err(AccountError::new("ACCOUNT_PRIMARY_PENDING","A primary-account operation is already pending. No authorization was replayed."))}write(&root,&saved)?;event(&saved,"started");}
 let _starting_fence=StartingFence{root:root.clone(),operation_id:saved.operation_id.clone()};
 let outcome:Result<Value>=async {
 // A verified idle native route lock also prevents a concurrent account prepare.
 require_plugin_idle(service).await?;
 official(endpoint,json!({"mode":"check"})).await?;
 update(&root,&mut saved,Some("route-restore"))?;
 let _route_lock=super::native_route::restore(service,endpoint,owner).await?;
 if !current()||host::observe(endpoint).await?.id!=owner.id{return Err(AccountError::new("ACCOUNT_OWNER_CHANGED","The primary identity changed before authorization started."))}
 let all=tokio::time::timeout(Duration::from_secs(15),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","Primary switch could not acquire the account registry."))?;
 if all.values().any(|s|!s.active.is_empty()||s.login.is_some())||service.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).values().any(|v|v.snapshot()["status"]=="preparing") {return Err(AccountError::new("ACCOUNT_TURN_ACTIVE","Finish all tasks and account preparations before changing the primary account."))}
 let state=all.get(&owner.id).ok_or_else(||AccountError::new("ACCOUNT_CONNECTION","Open the connected account list before changing the primary identity."))?;
 let selected=state.registry.connections.iter().find(|c|c.id==id&&c.email.is_some()).cloned().ok_or_else(||AccountError::new("ACCOUNT_CONNECTION","The selected authorized account is unavailable."))?;
 let generation=state.generation.clone();drop(all);
 update(&root,&mut saved,Some("target-verify"))?;
 let worker=super::credential_worker::acquire(service,&root,&owner.id,&id,current).await?;
 let observed=worker.request("account/read",json!({"refreshToken":false})).await?;
 if observed["account"]["email"].as_str().is_none_or(|e|!selected.email.as_ref().is_some_and(|s|s.eq_ignore_ascii_case(e))){return Err(AccountError::new("ACCOUNT_CREDENTIAL_IDENTITY","The selected account must be verified before becoming primary."))}
 let backup_id=super::nonce();let backup_home=root.join(&backup_id);
 update(&root,&mut saved,Some("primary-backup"))?;
 credentials::snapshot_managed(&credentials::official_home()?,&backup_home)?;
 let backup=match Worker::spawn(&backup_home).await {Ok(w)=>w,Err(e)=>{let _=credentials::delete(&backup_home);return Err(e)}};
 update(&root,&mut saved,Some("backup-verify"))?;
 let verified=backup.request("account/read",json!({"refreshToken":false})).await;backup.stop_checked().await?;
 if !verified.as_ref().ok().and_then(|v|v["account"]["email"].as_str()).is_some_and(|e|e.eq_ignore_ascii_case(&owner.label)){let _=credentials::delete(&backup_home);return Err(AccountError::new("ACCOUNT_PRIMARY_BACKUP","The former primary authorization could not be verified. The current login was not changed."))}
 let former=Connection{id:backup_id,label:owner.label.clone(),email:Some(owner.label.clone()),plan:owner.plan.clone(),api:None};
 let remembered={let all=service.state.lock().await;let state=all.get(&owner.id).filter(|s|s.generation==generation&&s.registry.connections.iter().any(|c|c.id==id&&c.email==selected.email)).ok_or_else(||AccountError::new("ACCOUNT_PRIMARY_STALE","The primary-account target changed during verification. No authorization was requested."))?;let mut values=state.registry.connections.clone();values.push(former);values};
 retention::remember(&root,&remembered)?;
 saved.former_primary_preserved=true;

 // Save a pending fence before an official authorization can complete quickly.
 if service.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).values().any(|v|v.snapshot()["status"]=="preparing"){return Err(AccountError::new("ACCOUNT_REQUEST_BUSY","An execution preparation raced the primary-account handoff. The existing login was retained; finish preparation before trying again."))}
 require_plugin_idle(service).await?;
 if !current()||host::observe(endpoint).await?.id!=owner.id{return Err(AccountError::new("ACCOUNT_OWNER_CHANGED","The official identity changed before authorization. No login was requested."))}
 saved.authorization_requested=true;update(&root,&mut saved,Some("authorization-start"))?;
  let value=official_value(endpoint,json!({"mode":"start","operationId":saved.operation_id})).await?;
 if value["failure"]["authorizationRequested"]==false {saved.authorization_requested=false;}
 let value=response(value)?;
 saved.login_id=value["loginId"].as_str().unwrap_or("").to_owned();update(&root,&mut saved,Some("authorization-open"))?;
 if let Err(e)=super::open_authorization(value["authUrl"].as_str().unwrap_or("")){let _=official(endpoint,json!({"mode":"cancel","loginId":saved.login_id})).await;return Err(e)}
 update(&root,&mut saved,Some("authorization-wait"))?;
 Ok(json!({"pending":true,"targetEmail":selected.email,"authorizationRequired":true}))
 }.await;
 match outcome {Ok(v)=>Ok(v),Err(error)=>{saved.state=if !saved.login_id.is_empty(){"pending"}else if saved.authorization_requested{"interrupted"}else{"failed"}.into();saved.error_code=Some(error.code.clone());let _=update(&root,&mut saved,None);Err(AccountError::new(&error.code,format!("{} stage={}; operationId={}; elapsedMs={}; formerPrimaryPreserved={}; {}",error.message,saved.stage,saved.operation_id,now().saturating_sub(saved.started_at_ms),saved.former_primary_preserved,recovery(&saved))))}}
}

#[cfg(test)] mod tests {
 use super::*;
 #[test] fn interrupted_authorization_does_not_block_switch_or_disable_and_can_end_locally(){
  let (_dir,root,owner)=fixture();let mut p=Pending::new(&owner,"b@example.invalid".into());p.state="interrupted".into();p.authorization_requested=true;write(&root,&p).unwrap();
  for action in ["select","native.prepare","native.detach","native.status"] {assert!(guard(&root,&owner,action).is_ok(),"{action}");}
  assert!(guard(&root,&owner,"primary.start").is_err());
  let receipt=finish_cancel(&root,&mut p,false).unwrap();assert_eq!(receipt["cancelled"],false);assert_eq!(receipt["localSetupEnded"],true);assert_eq!(receipt["authorizationUnconfirmed"],true);
  assert_eq!(status(&root,&owner).unwrap()["errorCode"],"ACCOUNT_PRIMARY_CANCEL_UNCONFIRMED");assert!(guard(&root,&owner,"primary.start").is_ok());
 }
 #[test] fn confirmed_cancel_finishes_an_interrupted_known_login_without_stale_write(){
  let (_dir,root,owner)=fixture();let mut p=Pending::new(&owner,"b@example.invalid".into());p.state="interrupted".into();p.login_id="fixture-login".into();p.authorization_requested=true;write(&root,&p).unwrap();
  assert_eq!(finish_cancel(&root,&mut p,true).unwrap()["cancelled"],true);assert_eq!(status(&root,&owner).unwrap()["state"],"cancelled");
  assert!(finish_cancel(&root,&mut p,false).is_err());
 }
 #[tokio::test] async fn pending_preparation_blocks_before_any_route_restoration(){let service=AccountService::default();assert!(require_plugin_idle(&service).await.is_ok());service.preparations.lock().unwrap().insert("owner:task".into(),super::super::preparation::Preparation::start());let error=require_plugin_idle(&service).await.unwrap_err();assert_eq!(error.code,"ACCOUNT_TURN_ACTIVE");assert!(error.message.contains("preparations=1")&&error.message.contains("No authorization was requested"));}
 #[test] fn authorization_is_committed_only_for_the_selected_identity(){
  let dir=tempfile::tempdir().unwrap();let root=dir.path().join("a".repeat(64));std::fs::create_dir(&root).unwrap();let a=host::Owner{id:"a".repeat(64),label:"a@example.invalid".into(),plan:None};let b=host::Owner{id:"b".repeat(64),label:"b@example.invalid".into(),plan:None};
  write(&root,&Pending{login_id:"fixture".into(),..Pending::new(&a,b.label.clone())}).unwrap();assert_eq!(status(&root,&a).unwrap()["state"],"pending");assert!(guard(&root,&a,"native.prepare").is_err());assert!(guard(&root,&a,"info").is_ok());assert!(guard(&root,&a,"primary.cancel").is_ok());assert_eq!(status(&root,&b).unwrap()["state"],"completed");assert!(guard(&root,&b,"native.prepare").is_ok());
  write(&root,&Pending{login_id:"fixture".into(),..Pending::new(&a,b.label.clone())}).unwrap();let d=host::Owner{id:"d".repeat(64),label:"d@example.invalid".into(),plan:None};assert_eq!(status(&root,&d).unwrap()["state"],"mismatch");
 }
 fn fixture()->(tempfile::TempDir,PathBuf,host::Owner){let dir=tempfile::tempdir().unwrap();let root=dir.path().join("a".repeat(64));std::fs::create_dir(&root).unwrap();(dir,root,host::Owner{id:"a".repeat(64),label:"a@example.invalid".into(),plan:None})}
 #[test] fn old_records_remain_readable_without_invented_timing(){let (_dir,root,a)=fixture();crate::renderer_storage::atomic(&path(&root).unwrap(),&json!({"sourceOwner":a.id,"targetEmail":"b@example.invalid","loginId":"old-login","state":"pending"})).unwrap();let value=status(&root,&a).unwrap();assert_eq!(value["state"],"pending");assert_eq!(value["elapsedMs"],0);assert_eq!(value["operationId"],"");}
 #[test] fn dropped_preparation_preserves_last_phase_and_is_not_user_cancellation(){let (_dir,root,a)=fixture();let mut p=Pending::new(&a,"b@example.invalid".into());write(&root,&p).unwrap();update(&root,&mut p,Some("backup-verify")).unwrap();drop(StartingFence{root:root.clone(),operation_id:p.operation_id.clone()});let value=status(&root,&a).unwrap();assert_eq!(value["state"],"interrupted");assert_eq!(value["stage"],"backup-verify");assert_eq!(value["errorCode"],"ACCOUNT_PRIMARY_INTERRUPTED");assert_eq!(value["authorizationRequested"],false);assert!(value["recovery"].as_str().unwrap().contains("not requested"));}
 #[test] fn dropped_authorization_does_not_claim_the_login_was_unchanged(){let (_dir,root,a)=fixture();let mut p=Pending::new(&a,"b@example.invalid".into());p.authorization_requested=true;p.former_primary_preserved=true;p.stage="authorization-start".into();write(&root,&p).unwrap();drop(StartingFence{root:root.clone(),operation_id:p.operation_id.clone()});let value=status(&root,&a).unwrap();assert_eq!(value["state"],"interrupted");assert!(value["recovery"].as_str().unwrap().contains("may have started"));assert_eq!(value["formerPrimaryPreserved"],true);}
 #[test] fn stale_fence_and_stale_progress_cannot_replace_a_new_operation(){let (_dir,root,a)=fixture();let mut first=Pending::new(&a,"b@example.invalid".into());write(&root,&first).unwrap();let next=Pending::new(&a,"c@example.invalid".into());write(&root,&next).unwrap();drop(StartingFence{root:root.clone(),operation_id:first.operation_id.clone()});assert!(update(&root,&mut first,Some("primary-backup")).is_err());assert_eq!(status(&root,&a).unwrap()["operationId"],next.operation_id);assert_eq!(status(&root,&a).unwrap()["state"],"pending");}
 #[test] fn normal_wait_survives_request_exit_and_diagnostics_exclude_login_identifier(){let (_dir,root,a)=fixture();let mut p=Pending::new(&a,"b@example.invalid".into());p.login_id="private-login-id".into();p.stage="authorization-wait".into();write(&root,&p).unwrap();drop(StartingFence{root:root.clone(),operation_id:p.operation_id.clone()});let value=status(&root,&a).unwrap();assert_eq!(value["state"],"pending");assert!(!value.to_string().contains("private-login-id"));assert!(guard(&root,&a,"primary.status").is_ok());assert!(guard(&root,&a,"native.status").is_ok());assert!(guard(&root,&a,"native.ensure").is_err());}
 #[test] fn failure_evidence_cannot_persist_arbitrary_body_or_credential_text(){let (_dir,root,a)=fixture();let mut p=Pending::new(&a,"b@example.invalid".into());p.error_code=Some("secret bearer body".into());write(&root,&p).unwrap();assert!(read(&root).is_err());}
  #[test] fn interrupted_login_recovers_only_its_own_observation_without_reauthorization(){let (_dir,root,a)=fixture();let mut p=Pending::new(&a,"b@example.invalid".into());p.state="interrupted".into();p.authorization_requested=true;p.error_code=Some("ACCOUNT_PRIMARY_INTERRUPTED".into());write(&root,&p).unwrap();assert!(guard(&root,&a,"primary.start").is_err());assert!(!recover_observation(&root,&mut p,&json!({"operationId":"different","loginId":"other"})).unwrap());let operation=p.operation_id.clone();assert!(recover_observation(&root,&mut p,&json!({"operationId":operation,"loginId":"verified-login"})).unwrap());assert_eq!(p.state,"pending");assert_eq!(p.login_id,"verified-login");assert_eq!(p.stage,"authorization-wait");assert!(p.error_code.is_none());}
  #[test] fn an_old_observer_cannot_adopt_a_replacement_operation(){let (_dir,root,a)=fixture();let mut p=Pending::new(&a,"b@example.invalid".into());let replacement=Pending::new(&a,"c@example.invalid".into());write(&root,&replacement).unwrap();let operation=p.operation_id.clone();assert!(!recover_observation(&root,&mut p,&json!({"operationId":operation,"loginId":"old-login"})).unwrap());assert_eq!(read(&root).unwrap().unwrap().operation_id,replacement.operation_id);}
}
