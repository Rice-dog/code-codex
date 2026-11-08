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
    connection:Option<super::Connection>,
}
impl Snapshot {
    pub(super) fn capture(state:&OwnerState,p:&Value)->Result<Self>{
        let id=if p["action"]=="verify" {Some(text(p,"connectionId")?.to_string())}else{state.login.as_ref().map(|v|v.0.clone())};
        if id.as_ref().is_some_and(|id|!state.registry.connections.iter().any(|c|&c.id==id)) {return Err(AccountError::new("ACCOUNT_CONNECTION","The queried connection is no longer available."));}
        if p["action"]=="verify"&&state.registry.connections.iter().any(|c|Some(&c.id)==id.as_ref()&&c.api.is_some()){return Err(AccountError::new("ACCOUNT_API_ACTION","Official authorization verification does not apply to an API connection."));}
        Ok(Self{generation:state.generation.clone(),login:state.login.clone(),worker:id.as_ref().and_then(|id|state.workers.get(id)).cloned(),connection:state.registry.connections.iter().find(|c|Some(&c.id)==id.as_ref()).cloned(),id})
    }
}
fn update_observed_connection(connection:&mut super::Connection,account:&Value,reauthorizing:bool)->Result<()>{
 if !reauthorizing{if let Some(expected)=connection.email.as_deref(){super::identity::check(account,Some(expected))?;}}
 // An unfinished explicit login must not erase the previously saved identity.
 if account["account"].is_null(){return Ok(());}
 connection.email=account["account"]["email"].as_str().map(str::to_owned);
 connection.plan=account["account"]["planType"].as_str().map(str::to_owned);Ok(())
}
fn stale()->AccountError{AccountError::new("ACCOUNT_QUERY_STALE","The login session or connection changed during the read. No account state was committed.")}
fn same_session(s:&OwnerState,snapshot:&Snapshot)->bool {
    s.generation==snapshot.generation && s.login==snapshot.login && snapshot.id.as_ref().is_none_or(|id|s.registry.connections.iter().any(|c|&c.id==id))
}
pub(super) async fn read(service:&AccountService,snapshot:Snapshot,root:&Path,endpoint:CdpEndpoint,owner:&host::Owner,p:&Value,current:impl Fn()->bool)->Result<Value>{
    let started=Instant::now();let verify=p["action"]=="verify";
    super::primary::refresh_status(endpoint,root,owner).await?;
    let worker=if verify {Some(super::credential_worker::acquire(service,root,&owner.id,snapshot.id.as_ref().ok_or_else(stale)?,&current).await?)}else{snapshot.worker.clone()};
    let result:Result<Value>=async {
        // Checking a saved, usable account is local. Only an unfinished login,
        // confirmed reauthorization or insufficient token claims needs refresh.
        let account=if let Some(w)=&worker {
            let c=snapshot.connection.as_ref();let expected=c.and_then(|c|c.email.as_deref());
            let pending=snapshot.login.as_ref().is_some_and(|v|Some(&v.0)==snapshot.id.as_ref());
            Some(if verify&&!pending&&expected.is_some(){super::credentials::observe_managed(w,expected.unwrap(),c.and_then(|c|c.plan.as_deref()),super::presentation::reauthorization_required(root,snapshot.id.as_deref().ok_or_else(stale)?)?).await}else{w.request("account/read",json!({"refreshToken":verify})).await})
        }else{None};
        if !current() || host::observe(endpoint).await?.id!=owner.id {return Err(stale());}
        let mut all=tokio::time::timeout(Duration::from_secs(15),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","The account read could not commit within the registry wait budget. Retry the read."))?;
        let state=all.get_mut(&owner.id).ok_or_else(stale)?;
        if !current() || !same_session(state,&snapshot) {return Err(stale());}
        if let Some(id)=&snapshot.id {
            if let Some(w)=&worker {if !state.workers.get(id).is_some_and(|current|Arc::ptr_eq(current,w)){return Err(stale());}}
            if let Some(observed)=&account {
                let expected=state.registry.connections.iter().find(|c|&c.id==id).and_then(|c|c.email.as_deref());
                super::presentation::observe(root,id,observed,expected,&state.registry.connections)?;
                let account=observed.as_ref().map_err(Clone::clone)?;
                let reauthorizing=state.login.as_ref().is_some_and(|v|&v.0==id);
                let connection=state.registry.connections.iter_mut().find(|c|&c.id==id).ok_or_else(stale)?;
                update_observed_connection(connection,account,reauthorizing)?;
                if account["account"]["type"]=="chatgpt" && state.login.as_ref().is_some_and(|v|&v.0==id){state.login=None;}
                save(root,&state.registry)?;
            }
        }
        if verify {let a=&account.as_ref().ok_or_else(stale)?.as_ref().map_err(Clone::clone)?["account"];Ok(json!({"signedIn":a["type"]=="chatgpt","email":a["email"],"plan":a["planType"]}))}
        else {Ok(json!({"owner":{"id":owner.id,"label":owner.label,"plan":owner.plan},"profile":host::profile(),"connections":super::presentation::connections(root,&state.registry.connections)?,"selected":state.registry.selected,"activeConversations":state.active.keys().collect::<Vec<_>>(),"sharedConversations":state.registry.shared.keys().collect::<Vec<_>>(),"followLogout":super::retention::follows(root)?,"primarySwitch":super::primary::status(root,owner)?,"nativeRouting":true,"nativeRoutes":service.relays.owned(&owner.id).iter().map(|r|(r.thread(),r.connection())).collect::<std::collections::HashMap<_,_>>()}))}
    }.await;
    crate::runtime_log::record("accounts","account.query",if result.is_ok(){"confirmed"}else{"failed"},json!({"action":p["action"],"stage":"read-without-registry-lock","durationMs":started.elapsed().as_millis(),"errorCode":result.as_ref().err().map(|e|e.code.as_str()),"taskSent":false}));
    result
}

#[cfg(test)] mod tests {
    use super::*;
    fn state()->OwnerState {OwnerState{generation:"first".into(),login:None,registry:Default::default(),workers:Default::default(),executors:Default::default(),threads:Default::default(),active:Default::default(),cursors:Default::default(),lease_generation:None,_lease:tempfile::tempfile().unwrap()}}
    #[test]fn failed_verification_never_erases_or_rebinds_saved_identity(){let mut c=super::super::Connection{id:"B".into(),label:"fixture".into(),email:Some("expected@example.invalid".into()),plan:Some("plus".into()),api:None};for value in[json!({"account":null}),json!({"account":{"type":"chatgpt"}}),json!({"account":{"type":"chatgpt","email":"other@example.invalid"}})]{assert!(update_observed_connection(&mut c,&value,false).is_err());assert_eq!(c.email.as_deref(),Some("expected@example.invalid"));assert_eq!(c.plan.as_deref(),Some("plus"));}update_observed_connection(&mut c,&json!({"account":{"type":"chatgpt","email":"expected@example.invalid","planType":"pro"}}),false).unwrap();assert_eq!(c.plan.as_deref(),Some("pro"));}
    #[test] fn logout_and_same_owner_relogin_invalidate_pending_observation(){
        let mut state=state();let snapshot=Snapshot::capture(&state,&json!({"action":"info"})).unwrap();assert!(same_session(&state,&snapshot));state.generation="new-login".into();assert!(!same_session(&state,&snapshot));
    }
    #[test] fn removed_connection_and_replaced_login_cannot_commit_a_late_read(){
        let mut state=state();state.registry.connections.push(super::super::Connection{id:"B".into(),label:"fixture".into(),email:None,plan:None,api:None});let snapshot=Snapshot::capture(&state,&json!({"action":"verify","connectionId":"B"})).unwrap();assert!(same_session(&state,&snapshot));state.login=Some(("B".into(),"new-ceremony".into()));assert!(!same_session(&state,&snapshot));state.login=None;state.registry.connections.clear();assert!(!same_session(&state,&snapshot));
    }
}
