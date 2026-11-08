//! Connection-local startup lanes. Network/initialization never owns the registry mutex.
use super::{AccountError,AccountService,Result,Worker};
use std::{collections::HashMap,path::Path,sync::{Arc,Mutex},time::Duration};
#[derive(Default)]pub(super)struct Starts(Mutex<HashMap<String,Arc<tokio::sync::Mutex<()>>>>);
impl Starts{fn lane(&self,owner:&str,id:&str)->Arc<tokio::sync::Mutex<()>>{let mut lanes=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);lanes.retain(|_,v|Arc::strong_count(v)>1);lanes.entry(format!("{owner}:{id}")).or_default().clone()}}
pub(super) async fn acquire(service:&AccountService,root:&Path,owner:&str,id:&str,current:impl Fn()->bool)->Result<Arc<Worker>>{
 acquire_with(service,root,owner,id,current,|home|Box::pin(async move{Worker::spawn(&home).await})).await
}
fn stale()->AccountError{AccountError::new("ACCOUNT_QUERY_STALE","The account changed during credential backend startup. No connection or task was changed.")}
async fn acquire_with<F>(service:&AccountService,root:&Path,owner:&str,id:&str,current:impl Fn()->bool,spawn:F)->Result<Arc<Worker>>where F:FnOnce(std::path::PathBuf)->std::pin::Pin<Box<dyn std::future::Future<Output=Result<Arc<Worker>>>+Send>>{
 let lane=service.worker_starts.lane(owner,id);
 let _creation=tokio::time::timeout(Duration::from_secs(15),lane.lock()).await.map_err(|_|AccountError::new("ACCOUNT_BACKEND_START_BUSY","This connection's backend is still starting. Other connections are unaffected."))?;
 let (generation,expected)={
  let mut all=service.state.lock().await;let state=all.get_mut(owner).ok_or_else(stale)?;
  let connection=state.registry.connections.iter().find(|c|c.id==id&&c.api.is_none()).ok_or_else(stale)?;
  let expected=connection.email.clone();
  if let Some(worker)=state.workers.get(id).cloned(){let worker=worker.effective()?.unwrap_or(worker);if !worker.is_dead(){state.workers.insert(id.into(),worker.clone());return Ok(worker)}}
  if state.active.values().any(|v|v==id){return Err(AccountError::new("ACCOUNT_OUTCOME_UNKNOWN","A disconnected account still owns unfinished work. Check its task status before restarting."));}
  (state.generation.clone(),expected)
 };
 let home=super::retention::home(root,id)?;super::directory(&home)?;let lease=super::retention::home_lease(root,&home)?;
 let worker=spawn(home).await?;worker.retain_home_lease(lease);
 if !current()||root.join("ended-session.json").exists(){worker.stop().await;return Err(stale())}
 let mut all=service.state.lock().await;
 if !current()||!all.get(owner).is_some_and(|s|s.generation==generation&&s.registry.connections.iter().any(|c|c.id==id&&c.api.is_none()&&c.email==expected)) {drop(all);worker.stop().await;return Err(stale())}
 let state=all.get_mut(owner).unwrap();
 if let Some(existing)=state.workers.get(id).filter(|w|!w.is_dead()).cloned(){drop(all);worker.stop().await;return Ok(existing)}
 state.workers.insert(id.into(),worker.clone());Ok(worker)
}
#[cfg(test)]mod tests{use super::*;
 #[tokio::test]async fn slow_backend_start_does_not_block_the_registry_or_other_connection_lanes(){
  let service=Arc::new(AccountService::default());let root=tempfile::tempdir().unwrap();let owner="a".repeat(64);let id="b".repeat(32);
  let state=super::super::OwnerState{generation:"one".into(),executors:Default::default(),login:None,registry:super::super::Registry{connections:vec![super::super::Connection{id:id.clone(),label:"fixture".into(),email:Some("fixture@example.invalid".into()),plan:None,api:None}],..Default::default()},workers:Default::default(),threads:Default::default(),active:Default::default(),cursors:Default::default(),_lease:tempfile::tempfile().unwrap(),lease_generation:None};
  service.state.lock().await.insert(owner.clone(),state);let copy=service.clone();let path=root.path().to_owned();let job=tokio::spawn(async move{acquire_with(&copy,&path,&owner,&id,||true,|_|Box::pin(std::future::pending())).await});tokio::time::sleep(Duration::from_millis(20)).await;
  assert!(tokio::time::timeout(Duration::from_millis(30),service.state.lock()).await.is_ok());job.abort();let _=job.await;
 }
 #[test]fn the_same_connection_has_one_lane_and_distinct_connections_are_independent(){let s=Starts::default();let a=s.lane("owner","a");let same=s.lane("owner","a");let b=s.lane("owner","b");assert!(Arc::ptr_eq(&a,&same));assert!(!Arc::ptr_eq(&a,&b));}
}
