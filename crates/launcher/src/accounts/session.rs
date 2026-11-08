//! Explicit logout tombstone. A process exit, missing renderer or timeout never calls this.
use super::{AccountError, OwnerState, Result, credentials, save};

use std::path::Path;
pub async fn end(state: &mut OwnerState, root: &Path) -> Result<()> {
    state.generation=super::nonce();
    // Persist revocation before attempting network/credential cleanup so a crash cannot restore children.
    workspace_service::application_paths::validate_directory_path(root)
        .map_err(|_| AccountError::protocol("Session root is redirected."))?;
    super::crate_marker(root, true)?;
    for worker in state.executors.values() {
        worker.stop_checked().await?;
    }
    state.executors.clear();
    for worker in state.workers.values() {
        worker.stop_checked().await?;
    }
    state.workers.clear();
    finish(state, root)?;
    Ok(())
}
/// Explicit logout can keep authorization, but never live tasks or route state.
pub async fn end_with_policy(state:&mut OwnerState,root:&Path)->Result<()> {
    if super::retention::follows(root)? {return end(state,root).await;}
    end_retaining(state,root).await
}
async fn end_retaining(state:&mut OwnerState,root:&Path)->Result<()> {
    crate::renderer_storage::atomic(&root.join("ended-session.json"),&serde_json::json!({"schema":1,"explicitLogout":true,"retain":true})).map_err(|_|AccountError::protocol("Retained logout state could not be saved."))?;
    state.generation=super::nonce();
    super::retention::remember(root,&state.registry.connections)?;
    for worker in state.executors.values().chain(state.workers.values()){worker.stop_checked().await?;}
    state.executors.clear();state.workers.clear();state.registry=super::Registry{schema:1,..Default::default()};
    state.threads.clear();state.active.clear();state.cursors.clear();state.login=None;
    save(root,&state.registry)?;super::crate_marker(root,false)?;Ok(())
}
pub(super) async fn complete_pending(state:&mut OwnerState,root:&Path)->Result<()>{
 let marker=crate::renderer_storage::read_json(&root.join("ended-session.json"),4096).map_err(|_|AccountError::protocol("Pending logout state could not be read."))?;
 if marker["retain"]==true{end_retaining(state,root).await}else{end(state,root).await}
}
pub fn finish(state: &mut OwnerState, root: &Path) -> Result<()> {
    for connection in &state.registry.connections {
        let home = super::retention::home(root,&connection.id)?;
        workspace_service::application_paths::validate_directory_path(&home)
            .map_err(|_| AccountError::protocol("Child credential home is redirected."))?;
        if home.exists() {
            credentials::delete(&home)?;
            super::retention::forget(root,&connection.id)?;
        }
    }
    super::retention::clear(root)?;
    state.registry.connections.clear();
    state.registry.selected.clear();
    state.registry.threads.clear();
    state.registry.active.clear();
    for binding in state.registry.shared.values_mut() {
        binding.connection = "host".into();
    }
    state.threads.clear();
    state.active.clear();
    state.login = None;
    save(root, &state.registry)?;
    super::crate_marker(root, false)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[tokio::test]
    async fn retained_logout_survives_interruption_and_new_primary_then_followed_logout_removes_auth(){
        let dir=tempfile::tempdir().unwrap();let a=dir.path().join("a".repeat(64));let d=dir.path().join("d".repeat(64));std::fs::create_dir(&a).unwrap();std::fs::create_dir(&d).unwrap();
        let id="b".repeat(32);let home=a.join(&id);std::fs::create_dir(&home).unwrap();std::fs::write(home.join("auth.json"),"synthetic-authorization").unwrap();
        let mut state=OwnerState{generation:"old".into(),executors:HashMap::new(),workers:HashMap::new(),login:None,threads:HashMap::new(),active:HashMap::new(),cursors:HashMap::new(),registry:super::super::Registry{schema:1,..Default::default()},lease_generation:None,_lease:tempfile::tempfile().unwrap()};
        state.registry.connections.push(super::super::Connection{id:id.clone(),label:"B".into(),email:Some("b@example.invalid".into()),plan:None,api:None});state.registry.selected.insert("old-task".into(),id.clone());state.active.insert("old-task".into(),id.clone());
        super::super::retention::set_follow(&a,false).unwrap();
        crate::renderer_storage::atomic(&a.join("ended-session.json"),&serde_json::json!({"schema":1,"explicitLogout":true,"retain":true})).unwrap();
        complete_pending(&mut state,&a).await.unwrap();assert!(home.join("auth.json").exists());assert!(state.registry.connections.is_empty()&&state.active.is_empty()&&state.registry.selected.is_empty());assert!(!a.join("ended-session.json").exists());
        super::super::retention::attach(&d,&mut state.registry,"d@example.invalid").unwrap();assert_eq!(state.registry.connections.len(),1);assert_eq!(super::super::retention::home(&d,&id).unwrap(),home);
        super::super::retention::set_follow(&d,true).unwrap();end_with_policy(&mut state,&d).await.unwrap();assert!(!home.join("auth.json").exists());let mut next=super::super::Registry::default();super::super::retention::attach(&a,&mut next,"a@example.invalid").unwrap();assert!(next.connections.is_empty());
    }
    #[tokio::test]
    async fn explicit_logout_marker_survives_restart_without_erasing_project_history() {
        let root = tempfile::tempdir().unwrap();
        let root_path=root.path().join("a".repeat(64));std::fs::create_dir(&root_path).unwrap();let root=root_path.as_path();
        let id = "a".repeat(32);
        let home = root.join(&id);
        std::fs::create_dir(&home).unwrap();
        std::fs::write(home.join("old-snapshot.json"), "historic user data").unwrap();
        let mut registry = super::super::Registry {
            schema: 1,
            ..Default::default()
        };
        registry.connections.push(super::super::Connection {
            id,
            label: "test".into(),
            email: None,
            plan: None,
            api: None,
        });
        registry.selected.insert("logical".into(), "host".into());
        save(root, &registry).unwrap();
        super::super::crate_marker(root, true).unwrap();
        let registry = super::super::load(root).unwrap();
        let lease = super::super::lease(root).unwrap();
        let mut state = OwnerState {
            generation: super::super::nonce(),
            executors: HashMap::new(),
            workers: HashMap::new(),
            login: None,
            threads: HashMap::new(),
            active: HashMap::new(),
            cursors: HashMap::new(),
            registry,
            lease_generation:None,_lease: lease,
        };
        end(&mut state, root).await.unwrap();
        assert!(state.registry.connections.is_empty());
        assert!(state.registry.selected.is_empty());
        assert!(!root.join("ended-session.json").exists());
        assert!(home.join("old-snapshot.json").exists());
        assert!(super::super::load(root).unwrap().connections.is_empty());
    }
}
