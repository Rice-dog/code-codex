//! Read-only account observations release the registry during backend/network waits.
use super::{AccountError,AccountService,OwnerState,Result,Worker,host,save,text};
use cdp_client::CdpEndpoint;
use serde_json::{Value,json};
use std::{path::Path,sync::Arc,time::{Duration,Instant}};

pub(super) struct Snapshot {
    generation:String,
    login:Option<(String,String)>,
    id:Option<String>,
    worker:Option<Arc<Worker>>,
}
impl Snapshot {
    pub(super) fn capture(state:&OwnerState,p:&Value)->Result<Self>{
        let id=if p["action"]=="verify" {Some(text(p,"connectionId")?.to_string())}else{state.login.as_ref().map(|v|v.0.clone())};
        if id.as_ref().is_some_and(|id|!state.registry.connections.iter().any(|c|&c.id==id)) {return Err(AccountError::new("ACCOUNT_CONNECTION","The queried connection is no longer available."));}
        Ok(Self{generation:state.generation.clone(),login:state.login.clone(),worker:id.as_ref().and_then(|id|state.workers.get(id)).cloned(),id})
    }
}
fn stale()->AccountError{AccountError::new("ACCOUNT_QUERY_STALE","The login session or connection changed during the read. No account state was committed.")}
fn same_session(s:&OwnerState,snapshot:&Snapshot)->bool {
    s.generation==snapshot.generation && s.login==snapshot.login && snapshot.id.as_ref().is_none_or(|id|s.registry.connections.iter().any(|c|&c.id==id))
}
pub(super) async fn read(service:&AccountService,snapshot:Snapshot,root:&Path,endpoint:CdpEndpoint,owner:&host::Owner,p:&Value,current:impl Fn()->bool)->Result<Value>{
    let started=Instant::now();let verify=p["action"]=="verify";
    super::primary::refresh_status(endpoint,root,owner).await?;
    let mut spawned=false;
    let worker=if let Some(w)=&snapshot.worker {Some(w.clone())}else if verify {
        let home=super::retention::home(root,snapshot.id.as_ref().ok_or_else(stale)?)?;super::directory(&home)?;
        let lease=super::retention::home_lease(root,&home)?;spawned=true;let worker=Worker::spawn(&home).await?;worker.retain_home_lease(lease);Some(worker)
    }else{None};
    let result:Result<Value>=async {
        let account=if let Some(w)=&worker {Some(w.request("account/read",json!({"refreshToken":false})).await?)}else{None};
        if !current() || host::observe(endpoint).await?.id!=owner.id {return Err(stale());}
        let mut all=tokio::time::timeout(Duration::from_secs(15),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","The account read could not commit within the registry wait budget. Retry the read."))?;
        let state=all.get_mut(&owner.id).ok_or_else(stale)?;
        if !current() || !same_session(state,&snapshot) {return Err(stale());}
        if let Some(id)=&snapshot.id {
            if spawned {
                if state.workers.contains_key(id) {return Err(stale());}
                state.workers.insert(id.clone(),worker.as_ref().ok_or_else(stale)?.clone());
            }else if let Some(w)=&snapshot.worker {
                if !state.workers.get(id).is_some_and(|current|Arc::ptr_eq(current,w)) {return Err(stale());}
            }
            if !verify && state.login!=snapshot.login {return Err(stale());}
            if let Some(account)=&account {
                let connection=state.registry.connections.iter_mut().find(|c|&c.id==id).ok_or_else(stale)?;
                connection.email=account["account"]["email"].as_str().map(str::to_owned);
                connection.plan=account["account"]["planType"].as_str().map(str::to_owned);
                if account["account"]["type"]=="chatgpt" && state.login.as_ref().is_some_and(|v|&v.0==id){state.login=None;}
                save(root,&state.registry)?;
            }
        }
        if verify {let a=&account.as_ref().ok_or_else(stale)?["account"];Ok(json!({"signedIn":a["type"]=="chatgpt","email":a["email"],"plan":a["planType"]}))}
        else {Ok(json!({"owner":{"id":owner.id,"label":owner.label,"plan":owner.plan},"profile":host::profile(),"connections":state.registry.connections,"selected":state.registry.selected,"activeConversations":state.active.keys().collect::<Vec<_>>(),"sharedConversations":state.registry.shared.keys().collect::<Vec<_>>(),"followLogout":super::retention::follows(root)?,"primarySwitch":super::primary::status(root,owner)?,"nativeRouting":true,"nativeRoutes":service.relays.owned(&owner.id).iter().map(|r|(&r.thread,r.connection())).collect::<std::collections::HashMap<_,_>>()}))}
    }.await;
    if result.is_err() && spawned {if let Some(w)=worker {w.stop().await;}}
    crate::runtime_log::record("accounts","account.query",if result.is_ok(){"confirmed"}else{"failed"},json!({"action":p["action"],"stage":"read-without-registry-lock","durationMs":started.elapsed().as_millis(),"errorCode":result.as_ref().err().map(|e|e.code.as_str()),"taskSent":false}));
    result
}

#[cfg(test)] mod tests {
    use super::*;
    fn state()->OwnerState {OwnerState{generation:"first".into(),login:None,registry:Default::default(),workers:Default::default(),executors:Default::default(),threads:Default::default(),active:Default::default(),cursors:Default::default(),lease_generation:None,_lease:tempfile::tempfile().unwrap()}}
    #[test] fn logout_and_same_owner_relogin_invalidate_pending_observation(){
        let mut state=state();let snapshot=Snapshot::capture(&state,&json!({"action":"info"})).unwrap();assert!(same_session(&state,&snapshot));state.generation="new-login".into();assert!(!same_session(&state,&snapshot));
    }
    #[test] fn removed_connection_and_replaced_login_cannot_commit_a_late_read(){
        let mut state=state();state.registry.connections.push(super::super::Connection{id:"B".into(),label:"fixture".into(),email:None,plan:None});let snapshot=Snapshot::capture(&state,&json!({"action":"verify","connectionId":"B"})).unwrap();assert!(same_session(&state,&snapshot));state.login=Some(("B".into(),"new-ceremony".into()));assert!(!same_session(&state,&snapshot));state.login=None;state.registry.connections.clear();assert!(!same_session(&state,&snapshot));
    }
}
