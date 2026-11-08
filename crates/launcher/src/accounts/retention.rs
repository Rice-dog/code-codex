//! Explicit same-device authorization retention. Homes never move: OS keys stay valid.
use super::{AccountError,Connection,Registry,Result};
use serde::{Deserialize,Serialize};
use std::path::{Path,PathBuf};

#[derive(Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Store { #[serde(default="yes")] follow_logout:bool, #[serde(default)] entries:Vec<Entry> }
fn yes()->bool{true}
#[derive(Clone,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry { owner:String, connection:Connection }
fn path(root:&Path)->Result<PathBuf>{
 let parent=root.parent().ok_or_else(||AccountError::protocol("Account storage parent unavailable."))?;
 workspace_service::application_paths::validate_directory_path(parent).map_err(|_|AccountError::protocol("Retained account storage is redirected."))?;
 Ok(parent.join("retained-accounts.json"))
}
fn read(root:&Path)->Result<Store>{
 let p=path(root)?;if !p.exists(){return Ok(Store{follow_logout:true,entries:vec![]})}
 let value=crate::renderer_storage::read_json(&p,128*1024).map_err(|_|AccountError::new("ACCOUNT_RETENTION_STORAGE","Retained account settings could not be read."))?;
 let s:Store=serde_json::from_value(value).map_err(|_|AccountError::new("ACCOUNT_RETENTION_STORAGE","Retained account settings have an invalid schema."))?;
 if s.entries.len()>32||s.entries.iter().any(|e|e.owner.len()!=64||!e.owner.bytes().all(|b|b.is_ascii_hexdigit())||!super::valid_id(&e.connection.id)) {return Err(AccountError::new("ACCOUNT_RETENTION_STORAGE","Retained account references failed validation."));}
 let mut ids=std::collections::HashSet::new();if s.entries.iter().any(|e|!ids.insert(&e.connection.id)){return Err(AccountError::protocol("Duplicate retained account reference."))}
 Ok(s)
}
fn write(root:&Path,s:&Store)->Result<()>{crate::renderer_storage::atomic(&path(root)?,&serde_json::json!(s)).map_err(|_|AccountError::new("ACCOUNT_RETENTION_STORAGE","Retained account settings could not be saved."))}
pub(super) fn follows(root:&Path)->Result<bool>{Ok(read(root)?.follow_logout)}
pub(super) fn set_follow(root:&Path,value:bool)->Result<()>{let mut s=read(root)?;s.follow_logout=value;write(root,&s)}
pub(super) fn home(root:&Path,id:&str)->Result<PathBuf>{
 if !super::valid_id(id){return Err(AccountError::protocol("Invalid retained account identifier."))}
 let store=read(root)?;
 let home=if let Some(entry)=store.entries.iter().find(|e|e.connection.id==id){root.parent().ok_or_else(||AccountError::protocol("Account parent unavailable."))?.join(&entry.owner).join(id)}else{root.join(id)};
 workspace_service::application_paths::validate_directory_path(&home).map_err(|_|AccountError::protocol("Retained credential home is redirected."))?;Ok(home)
}
/// A retained home can be reused by another primary only while its original
/// owner runtime has released the lease. Keep that lease for the worker lifetime.
pub(super) fn home_lease(root:&Path,home:&Path)->Result<Option<std::sync::Arc<std::fs::File>>>{
 use std::sync::{Arc,Weak,Mutex,OnceLock};use std::collections::HashMap;
 let origin=home.parent().ok_or_else(||AccountError::protocol("Credential home parent unavailable."))?;
 if origin==root{return Ok(None)}
 static LEASES:OnceLock<Mutex<HashMap<PathBuf,Weak<std::fs::File>>>>=OnceLock::new();
 let mut leases=LEASES.get_or_init(Default::default).lock().unwrap_or_else(std::sync::PoisonError::into_inner);
 leases.retain(|_,v|v.strong_count()>0);
 if let Some(lease)=leases.get(origin).and_then(Weak::upgrade){return Ok(Some(lease))}
 let lease=Arc::new(super::lease(origin)?);leases.insert(origin.to_owned(),Arc::downgrade(&lease));Ok(Some(lease))
}
pub(super) fn remember(root:&Path,connections:&[Connection])->Result<()>{
 let mut s=read(root)?;let owner=root.file_name().and_then(|s|s.to_str()).filter(|v|v.len()==64&&v.bytes().all(|b|b.is_ascii_hexdigit())).ok_or_else(||AccountError::protocol("Invalid retained owner identity."))?;
 for c in connections.iter().filter(|c|c.email.is_some()||c.api.is_some()){
  if let Some(e)=s.entries.iter_mut().find(|e|e.connection.id==c.id){e.connection=c.clone();}
  else if let Some(e)=s.entries.iter_mut().find(|e|e.connection.email.as_ref().zip(c.email.as_ref()).is_some_and(|(a,b)|a.eq_ignore_ascii_case(b))) {*e=Entry{owner:owner.into(),connection:c.clone()};}
  else{s.entries.push(Entry{owner:owner.into(),connection:c.clone()});}
 }
 if s.entries.len()>32{return Err(AccountError::new("ACCOUNT_RETENTION_LIMIT","Too many retained account authorizations. Remove an unused connection first."))}write(root,&s)
}
pub(super) fn attach(root:&Path,registry:&mut Registry,primary_email:&str)->Result<()> {
 let s=read(root)?;let mut changed=false;
 for e in s.entries {
  if e.connection.api.is_some(){if !registry.connections.iter().any(|c|c.id==e.connection.id){if registry.connections.len()>=16{return Err(AccountError::new("ACCOUNT_RETENTION_LIMIT","The retained connection list exceeds its limit."));}registry.connections.push(e.connection);changed=true;}continue;}
  let Some(email)=&e.connection.email else{continue};
  if email.eq_ignore_ascii_case(primary_email)||registry.connections.iter().any(|c|c.id==e.connection.id){continue}
  if let Some(index)=registry.connections.iter().position(|c|c.email.as_ref().is_some_and(|v|v.eq_ignore_ascii_case(email))){registry.connections[index]=e.connection;changed=true;continue}
  if registry.connections.len()>=16{return Err(AccountError::new("ACCOUNT_RETENTION_LIMIT","The retained account list exceeds the sixteen-connection limit."))}
  registry.connections.push(e.connection);changed=true;
 }
 // Never attach the current GUI identity as its own child.
 let old=registry.connections.len();registry.connections.retain(|c|!c.email.as_ref().is_some_and(|v|v.eq_ignore_ascii_case(primary_email)));changed|=old!=registry.connections.len();
 if changed{super::save(root,registry)?;}Ok(())
}
pub(super) fn forget(root:&Path,id:&str)->Result<()> {let mut s=read(root)?;s.entries.retain(|e|e.connection.id!=id);write(root,&s)}
pub(super) fn clear(root:&Path)->Result<()> {
 let mut store=read(root)?;
 for entry in &store.entries {let home=home(root,&entry.connection.id)?;if home.exists(){super::credentials::delete(&home)?;}}
 store.entries.clear();write(root,&store)
}

#[cfg(test)] mod tests{
 use super::*;
 #[test] fn another_owner_runtime_cannot_share_a_retained_authorization(){
  let dir=tempfile::tempdir().unwrap();let a=dir.path().join("a".repeat(64));let d=dir.path().join("d".repeat(64));std::fs::create_dir(&a).unwrap();std::fs::create_dir(&d).unwrap();let home=a.join("b".repeat(32));std::fs::create_dir(&home).unwrap();
  let original=super::super::lease(&a).unwrap();assert!(home_lease(&d,&home).is_err());drop(original);
  let one=home_lease(&d,&home).unwrap().unwrap();let two=home_lease(&d,&home).unwrap().unwrap();assert!(std::sync::Arc::ptr_eq(&one,&two));assert!(super::super::lease(&a).is_err());drop(one);drop(two);assert!(super::super::lease(&a).is_ok());
 }
 #[test] fn retention_preserves_home_across_primary_changes_without_task_state(){
  let dir=tempfile::tempdir().unwrap();let a=dir.path().join("a".repeat(64));let d=dir.path().join("d".repeat(64));std::fs::create_dir_all(&a).unwrap();std::fs::create_dir_all(&d).unwrap();
  let b=Connection{id:"b".repeat(32),email:Some("b@example.invalid".into()),label:"B".into(),plan:Some("plus".into()),api:None};std::fs::create_dir(a.join(&b.id)).unwrap();
  assert!(follows(&a).unwrap());set_follow(&a,false).unwrap();remember(&a,&[b.clone()]).unwrap();assert!(!follows(&d).unwrap());let mut registry=Registry{schema:1,..Default::default()};attach(&d,&mut registry,"d@example.invalid").unwrap();assert_eq!(registry.connections.len(),1);assert_eq!(home(&d,&b.id).unwrap(),a.join(&b.id));assert!(registry.active.is_empty()&&registry.selected.is_empty()&&registry.shared.is_empty());
  let mut self_registry=Registry{schema:1,..Default::default()};attach(&d,&mut self_registry,"b@example.invalid").unwrap();assert!(self_registry.connections.is_empty());forget(&d,&b.id).unwrap();let mut none=Registry::default();attach(&d,&mut none,"d@example.invalid").unwrap();assert!(none.connections.is_empty());
 }
 #[test] fn invalid_retained_home_is_rejected(){let dir=tempfile::tempdir().unwrap();let root=dir.path().join("a".repeat(64));std::fs::create_dir(&root).unwrap();crate::renderer_storage::atomic(&dir.path().join("retained-accounts.json"),&serde_json::json!({"followLogout":false,"entries":[{"owner":"../escape","connection":{"id":"b".repeat(32),"label":"B","email":null,"plan":null}}]})).unwrap();assert!(home(&root,&"b".repeat(32)).is_err());}
}
