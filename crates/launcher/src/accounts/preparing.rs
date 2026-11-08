//! Prepare against a private working registry; publish only the target routing.
//! No conversation content or credentials are copied into this transaction metadata.
use super::{AccountError,AccountService,OwnerState,Result,Worker,host,identifier,text,shared,preparation,save};
use cdp_client::CdpEndpoint;
use serde_json::{Value,json};
use std::{collections::HashMap,path::Path,sync::Arc,time::Duration};

pub(super) struct Transaction {
    working:OwnerState,
    conversation:String,
    selected:String,
    prior_shared:Option<shared::Binding>,
    prior_selected:Option<String>,
    prior_workers:HashMap<String,Arc<Worker>>,
    prior_executor:Option<Arc<Worker>>,
    touched:bool,
    committed:bool,
    progress:Option<preparation::Preparation>,
}
fn same_worker(a:Option<&Arc<Worker>>,b:Option<&Arc<Worker>>)->bool {
    match (a,b) {(None,None)=>true,(Some(a),Some(b))=>Arc::ptr_eq(a,b),_=>false}
}
fn same_binding(a:Option<&shared::Binding>,b:Option<&shared::Binding>)->bool {
    match (a,b) {(None,None)=>true,(Some(a),Some(b))=>a.path==b.path&&a.workspace==b.workspace&&a.connection==b.connection,_=>false}
}
impl Transaction {
    pub(super) fn capture(state:&OwnerState,p:&Value)->Result<Self>{
        let conversation=identifier(p,"conversationId")?.to_owned();let selected=text(p,"connectionId")?.to_owned();
        let working=OwnerState{generation:state.generation.clone(),registry:state.registry.clone(),login:state.login.clone(),workers:state.workers.clone(),executors:state.executors.clone(),threads:state.threads.clone(),active:state.active.clone(),cursors:state.cursors.clone(),lease_generation:state.lease_generation.clone(),_lease:state._lease.try_clone().map_err(|_|AccountError::new("ACCOUNT_STORAGE","The owner lease could not be retained for preparation."))?};
        Ok(Self{prior_shared:state.registry.shared.get(&conversation).cloned(),prior_selected:state.registry.selected.get(&conversation).cloned(),prior_workers:state.workers.clone(),prior_executor:state.executors.get(&conversation).cloned(),working,conversation,selected,touched:false,committed:false,progress:None})
    }
    fn invalidation(&self,state:&OwnerState)->Option<&'static str>{
        if state.generation!=self.working.generation{return Some("login-generation-changed");}
        if state.login!=self.working.login{return Some("login-ceremony-changed");}
        if state.active.contains_key(&self.conversation){return Some("target-turn-became-active");}
        if !same_binding(state.registry.shared.get(&self.conversation),self.prior_shared.as_ref()){return Some("target-binding-changed");}
        if state.registry.selected.get(&self.conversation)!=self.prior_selected.as_ref(){return Some("target-selection-changed");}
        if !same_worker(state.executors.get(&self.conversation),self.prior_executor.as_ref()){return Some("target-executor-replaced");}
        if self.selected!="host" {
            let Some(connection)=state.registry.connections.iter().find(|c|c.id==self.selected)else{return Some("target-connection-removed");};
            if !self.working.registry.connections.iter().find(|c|c.id==self.selected).is_some_and(|original|connection.email.is_some()&&connection.email==original.email){return Some("target-connection-identity-changed");}
        }
        if !same_worker(state.workers.get(&self.selected),self.prior_workers.get(&self.selected)){return Some("credential-worker-replaced");}
        None
    }
    #[cfg(test)] fn valid(&self,state:&OwnerState)->bool{self.invalidation(state).is_none()}
    fn routing(&self,state:&OwnerState,root:&Path)->Result<super::Registry>{
        let binding=self.working.registry.shared.get(&self.conversation).cloned().ok_or_else(||stale("prepared-routing-missing"))?;
        let mut registry=state.registry.clone();registry.shared.insert(self.conversation.clone(),binding);registry.selected.insert(self.conversation.clone(),self.selected.clone());
        save(root,&registry)?;Ok(registry)
    }
    fn abandoned(&self)->Vec<Arc<Worker>> {
        let mut workers:Vec<_>=self.working.workers.iter().filter(|(id,w)|!same_worker(Some(w),self.prior_workers.get(*id))).map(|(_,w)|w.clone()).collect();
        if let Some(w)=self.working.executors.get(&self.conversation) {
            if self.touched || !same_worker(Some(w),self.prior_executor.as_ref()){w.set_selection(None);workers.push(w.clone());}
        }
        workers
    }
}
impl Drop for Transaction {
    fn drop(&mut self){
        if self.committed{return;}
        let workers=self.abandoned();let progress=self.progress.clone();
        if let Some(p)=&progress{p.cleanup(workers.is_empty());}
        // A cancelled bridge future must not orphan its uncommitted process.
        if let Ok(runtime)=tokio::runtime::Handle::try_current(){runtime.spawn(async move{
            let mut confirmed=true;
            for worker in workers {let result=tokio::time::timeout(Duration::from_secs(5),worker.stop_checked()).await;
                confirmed &= matches!(result,Ok(Ok(())));
                crate::runtime_log::record("accounts","account.prepare.cleanup",if matches!(result,Ok(Ok(()))){"confirmed"}else{"unconfirmed"},json!({"reason":"cancelled-or-abandoned","taskSent":false}));
            }
            if let Some(p)=progress{p.cleanup(confirmed);}
        });}
    }
}
pub(super) fn admit(service:&AccountService,owner:&str,p:&Value)->Result<()> {
    let action=p["action"].as_str().unwrap_or("");
    if matches!(action,"info"|"verify"|"usage"|"session.end"|"connections.reorder"){return Ok(());}
    let own=p["conversationId"].as_str();let prefix=format!("{owner}:");
    let entries=service.preparations.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    for (key,progress) in entries.iter().filter(|(key,_)|key.starts_with(&prefix)){
        let snapshot=progress.snapshot();if snapshot["status"]!="preparing"{continue;}
        let same=own.is_some_and(|id|key==&format!("{owner}:{id}"));
        if action=="shared.prepare" && same {continue;}
        // Other conversations retain their own Send/Stop/event lane.
        if action.starts_with("shared.") && !same {continue;}
        return Err(AccountError::new("ACCOUNT_REQUEST_BUSY",format!("Account operation conflicts with a pending preparation. action={action}; operationId={}; phase={}; elapsedMs={}; taskSent=false. Wait for preparation to finish; no operation was replayed.",snapshot["operationId"],snapshot["phase"].as_str().unwrap_or("unknown"),snapshot["elapsedMs"])));
    }
    Ok(())
}
pub(super) async fn run(service:&AccountService,mut tx:Transaction,root:&Path,endpoint:CdpEndpoint,owner:&host::Owner,p:&Value,workspace:Option<&Path>,progress:&preparation::Preparation,current:impl Fn()->bool)->Result<Value>{
    tx.progress=Some(progress.clone());
    progress.step("registry-snapshot-released",json!({"registryHeld":false}));
    let result=preparation::bounded(progress.remaining(Duration::from_secs(90)),async {
        let value=tokio::select!{
            result=preparation::bounded(Duration::from_secs(70),shared::prepare(&mut tx.working,root,endpoint,owner,p,workspace,progress,&mut tx.touched))=>result?,
            _=progress.cancelled()=>return Err(stale("official-session-ended")),
        };
        progress.step("commit-owner-validation",json!({"registryHeld":false}));
        if !current() || host::observe(endpoint).await?.id!=owner.id{return Err(stale("owner-or-renderer-changed"));}
        progress.step("commit-registry-wait",json!({"timeoutMs":15000}));
        let mut all=tokio::time::timeout(Duration::from_secs(15),service.state.lock()).await.map_err(|_|AccountError::new("ACCOUNT_REQUEST_BUSY","Preparation could not reacquire the registry for commit. stage=commit-registry-wait; timeoutMs=15000; taskSent=false."))?;
        let state=all.get_mut(&owner.id).ok_or_else(||stale("owner-state-removed"))?;
        if !current(){return Err(stale("renderer-session-changed"));}
        if progress.is_cancelled(){return Err(stale("official-session-ended"));}
        if let Some(reason)=tx.invalidation(state){return Err(stale(reason));}
        let worker=tx.working.executors.get(&tx.conversation).filter(|w|!w.is_dead()).cloned().ok_or_else(||stale("prepared-executor-exited"))?;
        progress.step("commit-routing-persist",json!({"registryHeld":true}));
        let registry=tx.routing(state,root)?;
        state.registry=registry;state.executors.insert(tx.conversation.clone(),worker.clone());
        if let Some(source)=tx.working.workers.get(&tx.selected){state.workers.insert(tx.selected.clone(),source.clone());}
        worker.set_selection(Some(tx.selected.clone()));tx.committed=true;
        Ok(value)
    }).await;
    match result {
        Ok(value)=>{progress.finish(None);Ok(value)}
        Err(error)=>{
            let failure=progress.failure(error);
            progress.step("rollback-owned-resources",json!({"touchedExecutor":tx.touched,"registryHeld":false}));
            let mut confirmed=true;let workers=tx.abandoned();
            for (index,worker) in workers.iter().enumerate(){
                let stopped=matches!(tokio::time::timeout(Duration::from_secs(5),worker.stop_checked()).await,Ok(Ok(())));
                confirmed &= stopped;progress.step("rollback-worker-exit",json!({"resourceOrdinal":index,"confirmed":stopped,"timeoutMs":5000}));
            }
            // Never remove a replacement installed by a newer owner/session operation.
            if tx.touched {
                if let Ok(mut all)=tokio::time::timeout(Duration::from_secs(5),service.state.lock()).await {
                    if let Some(state)=all.get_mut(&owner.id){if state.generation==tx.working.generation && same_worker(state.executors.get(&tx.conversation),tx.working.executors.get(&tx.conversation)){state.executors.remove(&tx.conversation);}}
                }else{confirmed=false;}
            }
            let error=AccountError::new(&failure.code,format!("{} Cleanup evidence: resources={}; exitConfirmed={confirmed}; current routing metadata was not overwritten by rollback; taskSent=false.",failure.message,workers.len()));
            // Retry cleanup on drop only if process exit could not be confirmed.
            tx.committed=confirmed;progress.cleanup(confirmed);progress.finish(Some(&error));Err(error)
        }
    }
}
fn stale(reason:&str)->AccountError{AccountError::new("ACCOUNT_PREPARE_STALE",format!("Preparation was invalidated before commit. reason={reason}; taskSent=false; select the account again."))}

#[cfg(test)] mod tests {
    use super::*;
    fn state()->OwnerState{OwnerState{generation:"one".into(),login:None,registry:super::super::Registry{schema:1,..Default::default()},workers:Default::default(),executors:Default::default(),threads:Default::default(),active:Default::default(),cursors:Default::default(),lease_generation:None,_lease:tempfile::tempfile().unwrap()}}
    fn params()->Value{json!({"action":"shared.prepare","conversationId":"task","connectionId":"host"})}
    #[test] fn late_prepare_cannot_commit_after_logout_routing_or_activity_changes(){
        let mut s=state();let t=Transaction::capture(&s,&params()).unwrap();assert!(t.valid(&s));s.generation="two".into();assert!(!t.valid(&s));s.generation="one".into();s.active.insert("task".into(),"host".into());assert!(!t.valid(&s));s.active.clear();s.registry.selected.insert("task".into(),"B".into());assert!(!t.valid(&s));
    }
    #[test] fn unrelated_query_updates_survive_target_routing_merge(){
        let mut s=state();let mut t=Transaction::capture(&s,&params()).unwrap();
        s.registry.selected.insert("other".into(),"B".into());s.active.insert("other".into(),"B".into());
        t.working.registry.shared.insert("task".into(),shared::Binding{path:"history".into(),workspace:"workspace".into(),connection:"host".into(),execution:None});
        assert!(t.valid(&s));let root=tempfile::tempdir().unwrap();let merged=t.routing(&s,root.path()).unwrap();
        assert_eq!(merged.selected["other"],"B");assert_eq!(merged.selected["task"],"host");assert_eq!(s.active["other"],"B");
        assert_eq!(super::super::load(root.path()).unwrap().selected["other"],"B");
    }
    #[test] fn failed_persist_and_removed_connection_cannot_publish_preparation(){
        let mut s=state();let mut p=params();p["connectionId"]=json!("B");
        s.registry.connections.push(super::super::Connection{id:"B".into(),label:"test".into(),email:Some("test@example.invalid".into()),plan:None,api:None});
        let mut t=Transaction::capture(&s,&p).unwrap();assert!(t.valid(&s));s.registry.connections.clear();assert!(!t.valid(&s));
        t.working.registry.shared.insert("task".into(),shared::Binding{path:"history".into(),workspace:"workspace".into(),connection:"B".into(),execution:None});
        let file=tempfile::NamedTempFile::new().unwrap();assert!(t.routing(&s,file.path()).is_err());assert!(!s.registry.selected.contains_key("task"));
    }
    #[tokio::test] async fn reads_and_other_conversation_stop_are_admitted_during_prepare(){
        let service=AccountService::default();service.preparations.lock().unwrap().insert("owner:task".into(),preparation::Preparation::start());
        for action in ["info","usage","verify","session.end"]{assert!(admit(&service,"owner",&json!({"action":action})).is_ok());}
        assert!(admit(&service,"owner",&json!({"action":"shared.stop","conversationId":"other"})).is_ok());
        for action in ["shared.rpc","shared.stop","shared.reconcile"]{assert_eq!(admit(&service,"owner",&json!({"action":action,"conversationId":"task"})).unwrap_err().code,"ACCOUNT_REQUEST_BUSY");}
        assert!(admit(&service,"owner",&json!({"action":"remove"})).is_err());
        // The state remains lockable during a simulated slow preparation.
        let slow=tokio::spawn(async {tokio::time::sleep(Duration::from_millis(40)).await;});
        assert!(tokio::time::timeout(Duration::from_millis(10),service.state.lock()).await.is_ok());slow.await.unwrap();
    }
}
