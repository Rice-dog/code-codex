//! A bounded, uncommitted listener for the official new-thread creation callback.
use super::{AccountError,AccountService,Result,host,relay};
use cdp_client::CdpEndpoint;
use serde_json::{Value,json};
use std::{collections::HashMap,path::{Path,PathBuf},sync::Arc,time::{Duration,Instant}};

pub(super) struct Draft {
    owner:String, selected:String, generation:String, connection:Value, cwd:PathBuf,
    route:Arc<relay::Route>, created:Instant, committed:bool,preparation_id:Option<String>,
}
impl Drop for Draft {fn drop(&mut self){if !self.committed{self.route.close();}}}
pub(super) type Drafts=std::sync::Mutex<HashMap<String,Draft>>;
pub(super) fn close(service:&AccountService,owner:&str){service.drafts.lock().unwrap_or_else(std::sync::PoisonError::into_inner).retain(|_,d|d.owner!=owner);}
pub(super) fn cancel_preparation(service:&AccountService,owner:&str,id:&str){service.drafts.lock().unwrap_or_else(std::sync::PoisonError::into_inner).retain(|_,d|d.owner!=owner||d.preparation_id.as_deref()!=Some(id));}
fn failure(stage:&str)->AccountError {AccountError::new("ACCOUNT_DRAFT_PREPARATION",format!("New-conversation account admission failed. stage={stage}; no first turn was permitted. Review the selected connection before sending again."))}

// The GUI's loaded actor is authoritative before thread/start flushes its archive.
// Never accept a renderer-declared cwd in place of this fixed native read.
fn verify_created_thread(metadata:&Value,thread:&str,expected_cwd:&Path)->Result<()> {
    if metadata["id"].as_str()!=Some(thread){return Err(failure("native-thread-identity"));}
    let cwd=metadata["cwd"].as_str().filter(|v|!v.is_empty()).ok_or_else(||failure("native-workspace-missing"))?;
    let workspace=workspace_service::Workspace::open(cwd).map_err(|_|failure("native-workspace-unavailable"))?;
    if !same_file::is_same_file(workspace.root_path(),expected_cwd).unwrap_or(false){return Err(failure("workspace-changed"));}
    if metadata["status"]["type"]!="idle"{return Err(failure("native-thread-contract"));}
    if metadata["modelProvider"]!="openai"{return Err(failure("native-provider"));}
    Ok(())
}

pub(super) async fn request(service:&AccountService,endpoint:CdpEndpoint,owner:&host::Owner,p:&Value,progress:Option<&super::preparation::Preparation>,current:impl Fn()->bool)->Result<Value>{
    let lock=async{tokio::time::timeout(Duration::from_secs(15),service.native_route_lock.lock()).await.map_err(|_|failure("transition-busy"))};
    let _guard=if let Some(p)=progress{p.wait(lock).await?}else{lock.await?};
    let root=super::owner_root(&owner.id)?;
    if root.join("ended-session.json").exists()||!current(){return Err(failure("session-ended"));}
    if p["action"]=="draft.cancel" {
        let token=super::identifier(p,"token")?;
        let mut drafts=service.drafts.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if drafts.get(token).is_some_and(|d|d.owner==owner.id){drafts.remove(token);}
        return Ok(json!({"cancelled":true}));
    }
    if p["action"]=="draft.prepare" {
        let progress=progress.ok_or_else(||failure("preparation-unavailable"))?;
        let selected=super::identifier(p,"connectionId")?.to_owned();
        let cwd=std::fs::canonicalize(super::text(p,"cwd")?).map_err(|_|failure("workspace"))?;
        // Only reserve a listener here. A draft has no native ID to resolve yet.
        // Commit reads the real actor from the owning native GUI and verifies cwd.
        if !cwd.is_dir(){return Err(failure("workspace-unavailable"));}
        {
            let mut drafts=service.drafts.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
            drafts.retain(|_,d|d.created.elapsed()<Duration::from_secs(120));
            if drafts.len()>=4||service.relays.owned(&owner.id).len()>=32{return Err(failure("listener-limit"));}
        }
        let (generation,connection)={
            let mut all=service.state.lock().await;let state=all.get_mut(&owner.id).ok_or_else(||failure("registry-unavailable"))?;
            let connection=state.registry.connections.iter().find(|c|c.id==selected&&(c.email.is_some()||c.api.is_some())).cloned().ok_or_else(||failure("connection-unavailable"))?;
            (state.generation.clone(),connection)
        };
        let worker=if connection.api.is_none(){Some(progress.wait(super::credential_worker::acquire(service,&root,&owner.id,&selected,&current)).await?)}else{None};
        if connection.api.is_none()&&super::presentation::reauthorization_required(&root,&selected)?{return Err(AccountError::new("ACCOUNT_AUTH_REQUIRED","This connection requires reauthorization before starting a new chat; no task was sent."));}
        let credential=if let Some(api)=&connection.api{relay::Route::prepare_api(selected.clone(),api.clone(),super::api::read(&super::retention::home(&root,&selected)?)?)?}
            else{progress.wait(relay::Route::prepare_credential(selected.clone(),worker.ok_or_else(||failure("credentials"))?,connection.email.clone().ok_or_else(||failure("email"))?,Some(progress))).await?};
        let token=super::nonce();
        let route=service.relays.start_shared(owner.id.clone(),format!("draft-{token}"),credential).await?;
        let expired=Arc::downgrade(&route);tokio::spawn(async move{tokio::time::sleep(Duration::from_secs(120)).await;if let Some(route)=expired.upgrade(){route.expire_uncommitted();}});
        let draft=Draft{owner:owner.id.clone(),selected: selected.clone(),generation,connection:serde_json::to_value(&connection).map_err(|_|failure("connection-snapshot"))?,cwd,route:route.clone(),created:Instant::now(),committed:false,preparation_id:p["preparationId"].as_str().map(str::to_owned)};
        progress.wait(route.probe(true)).await?;
        if !current()||progress.is_cancelled()||host::observe(endpoint).await?.id!=owner.id{return Err(failure("owner-changed"));}
        let config=configuration(&route.base_url,connection.api.as_ref());
        service.drafts.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(token.clone(),draft);
        crate::runtime_log::record("accounts","account.draft","prepared",json!({"stage":"listener-ready","connectionId":selected,"taskSent":false}));
        progress.finish(None);return Ok(json!({"token":token,"config":config,"model":connection.api.map(|a|a.model)}));
    }
    let token=super::identifier(p,"token")?;
    let mut draft={let mut drafts=service.drafts.lock().unwrap_or_else(std::sync::PoisonError::into_inner);if !drafts.get(token).is_some_and(|d|d.owner==owner.id){return Err(failure("token-unavailable"));}drafts.remove(token).unwrap()};
    if draft.created.elapsed()>=Duration::from_secs(120){return Err(failure("expired"));}
    let thread=super::identifier(p,"conversationId")?.to_owned();
    let metadata=host::thread_metadata(endpoint,&thread).await?;
    let api=draft.route.api_settings();
    verify_created_thread(&metadata,&thread,&draft.cwd)?;
    // Native thread/start reserves the archive path; it is flushed on turn/start.
    // Resolve and verify it at the first relay admission, before any API request.
    let new_archive=if api.is_some(){Some(PathBuf::from(metadata["path"].as_str().filter(|v|!v.is_empty()).ok_or_else(||failure("archive-path"))?))}else{None};
    if !current()||host::observe(endpoint).await?.id!=owner.id{return Err(failure("owner-changed"));}
    let home=if new_archive.is_some(){Some(super::credentials::official_home()?)}else{None};
    let mut all=service.state.lock().await;let state=all.get_mut(&owner.id).ok_or_else(||failure("registry-retired"))?;
    if state.generation!=draft.generation||state.registry.selected.contains_key(&thread)||state.active.contains_key(&thread)||!state.registry.connections.iter().any(|c|c.id==draft.selected&&serde_json::to_value(c).ok().as_ref()==Some(&draft.connection)){return Err(failure("connection-changed"));}
    super::native_route::adopt(endpoint,&thread,&draft.route.base_url,api.as_ref()).await?;
    let mut registry=state.registry.clone();registry.selected.insert(thread.clone(),draft.selected.clone());
    if !current(){return Err(failure("session-retired-before-commit"));}
    draft.route.bind_thread(thread.clone())?;
    super::save(&root,&registry)?;
    if let Some(path)=new_archive{draft.route.set_new_handoff(home.unwrap(),path,root.clone());}
    service.relays.replace(&owner.id,&thread,Some(draft.route.clone()));state.registry=registry;draft.committed=true;
    crate::runtime_log::record("accounts","account.draft","committed",json!({"stage":"before-first-turn","conversationId":thread,"connectionId":draft.selected,"taskSent":false}));
    Ok(json!({"threadId":thread,"selected":draft.selected,"ready":true,"routed":true}))
}
pub(super) fn configuration(base:&str,api:Option<&super::api::Settings>)->Value{
    let mut config=json!({"thread_unload_delay_secs":0,"model_provider":"openai","openai_base_url":base,"features":{"enable_request_compression":false}});
    if let Some(api)=api{config["model"]=json!(api.model);}
    config
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn unflushed_native_draft_requires_exact_identity_physical_workspace_idle_and_provider(){
        let directory=tempfile::tempdir().unwrap();
        let other=tempfile::tempdir().unwrap();
        let metadata=json!({"id":"fresh-thread","cwd":directory.path(),"path":directory.path().join("not-written-yet.jsonl"),"status":{"type":"idle"},"modelProvider":"openai"});
        assert!(!Path::new(metadata["path"].as_str().unwrap()).exists());
        verify_created_thread(&metadata,"fresh-thread",directory.path()).unwrap();
        for (field,value,stage) in [("id",json!("other-thread"),"native-thread-identity"),("cwd",json!(other.path()),"workspace-changed"),("cwd",Value::Null,"native-workspace-missing"),("cwd",json!(directory.path().join("missing")),"native-workspace-unavailable"),("status",json!({"type":"active"}),"native-thread-contract"),("status",Value::Null,"native-thread-contract"),("modelProvider",json!("code_codex_api"),"native-provider")] {
            let mut invalid=metadata.clone();invalid[field]=value;
            let error=verify_created_thread(&invalid,"fresh-thread",directory.path()).unwrap_err();
            assert!(error.message.contains(stage),"{field}: {}",error.message);
        }
    }
    #[test] fn draft_configuration_has_no_credential_and_keeps_official_and_api_routes_separate(){
        let api=super::super::api::Settings::parse("https://example.invalid/v1","synthetic-model").unwrap();
        let value=configuration("http://localhost:1/opaque",Some(&api));
        assert_eq!(value["model_provider"],"openai");assert_eq!(value["model"],"synthetic-model");
        assert!(value.get("model_providers").is_none());assert_eq!(value["openai_base_url"],"http://localhost:1/opaque");
        assert_eq!(value["features"]["enable_request_compression"],false);assert!(!value.to_string().contains("Bearer"));
        let value=configuration("http://localhost:1/opaque",None);assert_eq!(value["model_provider"],"openai");
        assert!(value.get("model_providers").is_none());assert_eq!(value["openai_base_url"],"http://localhost:1/opaque");
    }
}
