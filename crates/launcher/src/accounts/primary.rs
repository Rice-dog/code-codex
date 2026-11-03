//! Managed official GUI login: preserve the former identity, then verify OAuth outcome.
use super::{AccountError,AccountService,Connection,Result,Worker,credentials,host,retention};
use cdp_client::CdpEndpoint;
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::{path::{Path,PathBuf},time::Duration};

#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Pending {source_owner:String,target_email:String,login_id:String,state:String}
struct StartingFence {root:PathBuf}
impl Drop for StartingFence {
 fn drop(&mut self){if let Ok(Some(mut value))=read(&self.root){if value.state=="pending"&&value.login_id.is_empty(){value.state="cancelled".into();let _=write(&self.root,&value);}}}
}
fn path(root:&Path)->Result<PathBuf>{Ok(root.parent().ok_or_else(||AccountError::protocol("Account parent unavailable."))?.join("primary-switch.json"))}
fn read(root:&Path)->Result<Option<Pending>>{
 let p=path(root)?;if !p.exists(){return Ok(None)}
 let v=crate::renderer_storage::read_json(&p,16384).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_STORAGE","Primary switch state could not be read."))?;
 let value:Pending=serde_json::from_value(v).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_STORAGE","Primary switch state has an invalid schema."))?;
 if value.source_owner.len()!=64||!value.source_owner.bytes().all(|b|b.is_ascii_hexdigit())||value.target_email.len()>320||value.login_id.len()>256||!matches!(value.state.as_str(),"pending"|"completed"|"cancelled"|"mismatch"){return Err(AccountError::protocol("Primary switch state failed validation."))}
 Ok(Some(value))
}
fn write(root:&Path,p:&Pending)->Result<()>{crate::renderer_storage::atomic(&path(root)?,&json!(p)).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_STORAGE","Primary switch state could not be saved."))}
pub(super) fn status(root:&Path,owner:&host::Owner)->Result<Value>{
 let Some(mut p)=read(root)?else{return Ok(Value::Null)};
 if p.state=="pending"&&p.source_owner!=owner.id {
  p.state=if p.target_email.eq_ignore_ascii_case(&owner.label){"completed"}else{"mismatch"}.into();write(root,&p)?;
 }
 Ok(json!({"state":p.state,"targetEmail":p.target_email,"authorizationRequired":p.state=="pending"}))
}
pub(super) async fn refresh_status(endpoint:CdpEndpoint,root:&Path,owner:&host::Owner)->Result<()> {
 let Some(mut p)=read(root)?else{return Ok(())};if p.state!="pending"||p.source_owner!=owner.id||p.login_id.is_empty(){return Ok(())}
 let value=official(endpoint,json!({"mode":"observation"})).await?;
 if value["loginId"]==p.login_id&&value["finished"]==true {
  p.state=if value["success"]==true {let actual=host::observe(endpoint).await?;if p.target_email.eq_ignore_ascii_case(&actual.label){"completed"}else{"mismatch"}}else{"cancelled"}.into();write(root,&p)?;
 }Ok(())
}
pub(super) fn guard(root:&Path,owner:&host::Owner,action:&str)->Result<()> {
 let value=status(root,owner)?;
 if value["state"]=="pending"&&!matches!(action,"info"|"primary.cancel"|"session.policy"|"session.end"|"verify"|"usage"|"events"|"shared.events"|"shared.status"|"shared.stop"|"reconcile"|"shared.reconcile") {
  return Err(AccountError::new("ACCOUNT_PRIMARY_PENDING","A primary-account authorization is pending. Complete or cancel it before changing execution accounts. No task was sent."))
 }Ok(())
}
async fn official(endpoint:CdpEndpoint,params:Value)->Result<Value>{
 let source=include_str!("primary_host.js").replace("__PROFILE__",&host::profile().to_string()).replace("__PARAMS__",&params.to_string());
 let value=host::evaluate_budget(endpoint,&source,Duration::from_secs(20)).await?;
 if let Some(f)=value.get("failure"){return Err(AccountError::new(f["code"].as_str().unwrap_or("ACCOUNT_PRIMARY_RPC"),format!("Primary-account operation was not completed. stage={}; no inference was sent.",f["stage"].as_str().unwrap_or("unknown"))))}Ok(value)
}
pub(super) async fn request(service:&AccountService,endpoint:CdpEndpoint,owner:&host::Owner,p:&Value,current:&impl Fn()->bool)->Result<Value>{
 let root=super::owner_root(&owner.id)?;
 if p["action"]=="primary.cancel" {
  let Some(mut saved)=read(&root)?else{return Ok(json!({"cancelled":true}))};
  if saved.state=="pending" {official(endpoint,json!({"mode":"cancel","loginId":saved.login_id})).await?;saved.state="cancelled".into();write(&root,&saved)?;}
  return Ok(json!({"cancelled":true}));
 }
 guard(&root,owner,"primary.start")?;
 let id=super::text(p,"connectionId")?.to_owned();
 // A verified idle native route lock also prevents a concurrent account prepare.
 official(endpoint,json!({"mode":"check"})).await?;
 let _route_lock=super::native_route::restore(service,endpoint,owner).await?;
 let mut all=tokio::time::timeout(Duration::from_secs(15),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","Primary switch could not acquire the account registry."))?;
 if !current()||host::observe(endpoint).await?.id!=owner.id{return Err(AccountError::new("ACCOUNT_OWNER_CHANGED","The primary identity changed before authorization started."))}
 if all.values().any(|s|!s.active.is_empty()||s.login.is_some())||service.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).values().any(|v|v.snapshot()["status"]=="preparing") {return Err(AccountError::new("ACCOUNT_TURN_ACTIVE","Finish all tasks and account preparations before changing the primary account."))}
 let state=all.get_mut(&owner.id).ok_or_else(||AccountError::new("ACCOUNT_CONNECTION","Open the connected account list before changing the primary identity."))?;
 let selected=state.registry.connections.iter().find(|c|c.id==id&&c.email.is_some()).cloned().ok_or_else(||AccountError::new("ACCOUNT_CONNECTION","The selected authorized account is unavailable."))?;
 let mut saved=Pending{source_owner:owner.id.clone(),target_email:selected.email.clone().unwrap(),login_id:String::new(),state:"pending".into()};write(&root,&saved)?;
 let _starting_fence=StartingFence{root:root.clone()};
 let worker=super::get_worker(state,&root,&id).await?;
 let observed=worker.request("account/read",json!({"refreshToken":false})).await?;
 if observed["account"]["email"].as_str().is_none_or(|e|!selected.email.as_ref().is_some_and(|s|s.eq_ignore_ascii_case(e))){return Err(AccountError::new("ACCOUNT_CREDENTIAL_IDENTITY","The selected account must be verified before becoming primary."))}
 let backup_id=super::nonce();let backup_home=root.join(&backup_id);
 credentials::snapshot_managed(&credentials::official_home()?,&backup_home)?;
 let backup=match Worker::spawn(&backup_home).await {Ok(w)=>w,Err(e)=>{let _=credentials::delete(&backup_home);return Err(e)}};
 let verified=backup.request("account/read",json!({"refreshToken":false})).await;backup.stop_checked().await?;
 if !verified.as_ref().ok().and_then(|v|v["account"]["email"].as_str()).is_some_and(|e|e.eq_ignore_ascii_case(&owner.label)){let _=credentials::delete(&backup_home);return Err(AccountError::new("ACCOUNT_PRIMARY_BACKUP","The former primary authorization could not be verified. The current login was not changed."))}
 let former=Connection{id:backup_id,label:owner.label.clone(),email:Some(owner.label.clone()),plan:owner.plan.clone()};
 let mut remembered=state.registry.connections.clone();remembered.push(former.clone());retention::remember(&root,&remembered)?;

 // Save a pending fence before an official authorization can complete quickly.
 if service.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner).values().any(|v|v.snapshot()["status"]=="preparing"){return Err(AccountError::new("ACCOUNT_REQUEST_BUSY","An execution preparation raced the primary-account handoff. The existing login was retained; finish preparation before trying again."))}
 let started=official(endpoint,json!({"mode":"start"})).await;
 let value=match started{Ok(v)=>v,Err(e)=>{saved.state="cancelled".into();write(&root,&saved)?;return Err(e)}};
 saved.login_id=value["loginId"].as_str().unwrap_or("").to_owned();write(&root,&saved)?;
 if let Err(e)=super::open_authorization(value["authUrl"].as_str().unwrap_or("")){let _=official(endpoint,json!({"mode":"cancel","loginId":saved.login_id})).await;saved.state="cancelled".into();write(&root,&saved)?;return Err(e)}
 crate::runtime_log::record("accounts","account.primary","authorization-pending",json!({"stage":"official-managed-login","formerPrimaryPreserved":true,"taskSent":false,"credentialsExposed":false}));
 Ok(json!({"pending":true,"targetEmail":selected.email,"authorizationRequired":true}))
}

#[cfg(test)] mod tests {
 use super::*;
 #[test] fn authorization_is_committed_only_for_the_selected_identity(){
  let dir=tempfile::tempdir().unwrap();let root=dir.path().join("a".repeat(64));std::fs::create_dir(&root).unwrap();let a=host::Owner{id:"a".repeat(64),label:"a@example.invalid".into(),plan:None};let b=host::Owner{id:"b".repeat(64),label:"b@example.invalid".into(),plan:None};
  write(&root,&Pending{source_owner:a.id.clone(),target_email:b.label.clone(),login_id:"fixture".into(),state:"pending".into()}).unwrap();assert_eq!(status(&root,&a).unwrap()["state"],"pending");assert!(guard(&root,&a,"native.prepare").is_err());assert!(guard(&root,&a,"info").is_ok());assert!(guard(&root,&a,"primary.cancel").is_ok());assert_eq!(status(&root,&b).unwrap()["state"],"completed");assert!(guard(&root,&b,"native.prepare").is_ok());
  write(&root,&Pending{source_owner:a.id.clone(),target_email:b.label.clone(),login_id:"fixture".into(),state:"pending".into()}).unwrap();let d=host::Owner{id:"d".repeat(64),label:"d@example.invalid".into(),plan:None};assert_eq!(status(&root,&d).unwrap()["state"],"mismatch");
 }
}
