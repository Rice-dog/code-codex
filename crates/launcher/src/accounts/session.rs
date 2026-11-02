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
pub fn finish(state: &mut OwnerState, root: &Path) -> Result<()> {
    for connection in &state.registry.connections {
        let home = root.join(&connection.id);
        workspace_service::application_paths::validate_directory_path(&home)
            .map_err(|_| AccountError::protocol("Child credential home is redirected."))?;
        if home.exists() {
            credentials::delete(&home)?;
        }
    }
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
    async fn explicit_logout_marker_survives_restart_without_erasing_project_history() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path();
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
