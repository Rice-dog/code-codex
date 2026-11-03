//! One official thread and rollout per conversation, independent of execution identity.
use super::{
    AccountError, OwnerState, Result, credentials, directory, host, identifier, policy, save, text,
    worker::Worker,
};
use cdp_client::CdpEndpoint;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub path: PathBuf,
    pub workspace: PathBuf,
    pub connection: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution: Option<super::outcome::Execution>,
}
pub async fn request(
    state: &mut OwnerState,
    root: &Path,
    endpoint: CdpEndpoint,
    _owner: &host::Owner,
    params: &Value,
    workspace: Option<&Path>,
    _progress: Option<&super::preparation::Preparation>,
) -> Result<Value> {
    let action = text(params, "action")?;
    let conversation = identifier(params, "conversationId")?.to_owned();
    if action=="shared.stop" {
        if !state.registry.shared.contains_key(&conversation){return Err(AccountError::protocol("Stop requires an existing shared conversation."));}
        let turn=params.get("turnId").filter(|v|!v.is_null()).map(|_|identifier(params,"turnId")).transpose()?;
        return super::stopping::stop(state,root,&conversation,turn).await;
    }
    let binding = state
        .registry
        .shared
        .get(&conversation)
        .ok_or_else(|| {
            AccountError::new(
                "ACCOUNT_SHARED_HISTORY",
                "Prepare this official conversation before executing.",
            )
        })?
        .clone();
    if action == "shared.reconcile"
        && !state
            .executors
            .get(&conversation)
            .is_some_and(|w| !w.is_dead())
    {
        let started=std::time::Instant::now();
        let executor_state=if state.executors.contains_key(&conversation){"exited"}else{"not-resident"};
        let active_recorded=state.active.contains_key(&conversation);
        // An exclusive owner lease and an exited owned executor permit a read-only
        // journal check. This never resends a task or claims its side effects succeeded.
        let home = credentials::official_home()?;
        verify_path(&home, &binding.path, &conversation)?;
        let execution_home = root.join("execution-v2").join(&conversation);
        directory(&execution_home)?;
        super::environment::prepare_execution_home(&execution_home, &home)?;
        let reader = Worker::spawn_sqlite(&execution_home, &home).await?;
        let result = reader
            .request(
                "thread/read",
                json!({"threadId":conversation,"includeTurns":false}),
            )
            .await;
        reader.stop_checked().await?;
        let result = result?;
        if result["thread"]["id"].as_str() != Some(&conversation)
            || !result["thread"]["path"]
                .as_str()
                .is_some_and(|p| same_file::is_same_file(p, &binding.path).unwrap_or(false))
        {
            return Err(AccountError::protocol(
                "The official history could not be reconciled.",
            ));
        }
        let evidence = super::outcome::observe(&binding.path, binding.execution.as_ref(), state.active.contains_key(&conversation));
        let mut response = evidence.projection();
        response["reconciled"] = json!(true);
        response["processExited"] = json!(true);
        response["executorReusable"] = json!(false);
        response["executorState"] = json!(executor_state);
        response["executionRecorded"] = json!(binding.execution.is_some());
        state.active.remove(&conversation);
        state.registry.active = state.active.clone();
        save(root, &state.registry)?;
        crate::runtime_log::record("accounts","account.reconcile","confirmed",json!({"stage":"exited-history-verified","conversationId":conversation,"durationMs":started.elapsed().as_millis(),"executorState":executor_state,"activeRecorded":active_recorded,"executionRecorded":binding.execution.is_some(),"executorReusable":false,"previousOutcome":evidence.outcome,"reason":evidence.reason,"evidence":response["outcomeEvidence"],"previousTurnId":response["previousTurnId"],"taskReplayed":false,"taskSent":false}));
        return Ok(response);
    }
    let worker = state
        .executors
        .get(&conversation)
        .filter(|w| !w.is_dead())
        .cloned()
        .ok_or_else(|| {
            AccountError::new(
                "ACCOUNT_SHARED_RECONNECT",
                "Reopen the conversation before continuing its shared executor.",
            )
        })?;
    if action == "shared.events" {
        let events = worker.events(params["after"].as_u64().unwrap_or(0)).await?;
        let mut execution_changed=false;
        for entry in events["events"].as_array().into_iter().flatten() {
            if entry["message"]["method"]=="turn/started"&&entry["message"]["params"]["threadId"]==conversation {state.active.insert(conversation.clone(),binding.connection.clone());}
            if entry["message"]["method"] == "turn/completed"
                && entry["message"]["params"]["threadId"] == conversation
                && matches!(
                    entry["message"]["params"]["turn"]["status"].as_str(),
                    Some("completed" | "failed" | "interrupted")
                )
            {
                if let Some(execution)=state.registry.shared.get_mut(&conversation).and_then(|b|b.execution.as_mut()) {
                    let turn=&entry["message"]["params"]["turn"];
                    if super::outcome::turn_id(&turn["id"])==execution.turn_id && execution.turn_id.is_some() {
                        execution.terminal=turn["status"].as_str().map(str::to_owned);execution_changed=true;
                    }
                }
                state.active.remove(&conversation);
            }
        }
        if state.registry.active != state.active || execution_changed {
            state.registry.active = state.active.clone();
            save(root, &state.registry)?;
        }
        return Ok(events);
    }
    if action == "shared.reply" {
        return worker
            .reply(params["id"].clone(), params["result"].clone())
            .await;
    }
    if action == "shared.reconcile" {
        let started=std::time::Instant::now();
        let result = worker
            .request(
                "thread/read",
                json!({"threadId":conversation,"includeTurns":false}),
            )
            .await?;
        if let Err(error)=verify_idle(&result["thread"]) {
            crate::runtime_log::record("accounts","account.reconcile","blocked",json!({"stage":"executor-thread-read","durationMs":started.elapsed().as_millis(),"errorCode":error.code,"activeRecorded":state.active.contains_key(&conversation),"taskSent":false}));
            return Err(error);
        }
        state.active.remove(&conversation);
        state.registry.active = state.active.clone();
        save(root, &state.registry)?;
        let cursor=worker.cursor().await;
        crate::runtime_log::record("accounts","account.reconcile","confirmed",json!({"stage":"executor-idle","durationMs":started.elapsed().as_millis(),"cursor":cursor,"executorReusable":true,"taskReplayed":false}));
        return Ok(json!({"reconciled":true,"cursor":cursor,"executorReusable":true}));
    }
    if !worker.selection_matches(&binding.connection) {
        return Err(AccountError::new("ACCOUNT_PREPARE_REQUIRED","This executor has no committed matching identity. Select the account again before sending; no task was sent."));
    }
    let method = text(params, "method")?;
    crate::runtime_log::record("accounts","account.rpc","requested",json!({"method":method,"activeRecorded":state.active.contains_key(&conversation),"matchingIdentity":worker.selection_matches(&binding.connection)}));
    let mut args = params["params"]
        .as_object()
        .cloned()
        .ok_or_else(|| AccountError::protocol("Shared RPC requires parameters."))?;
    if args.get("threadId").and_then(Value::as_str) != Some(&conversation) {
        return Err(AccountError::protocol(
            "The shared thread ID cannot be replaced.",
        ));
    }
    if matches!(
        method,
        "thread/start" | "thread/inject_items" | "thread/resume"
    ) {
        return Err(AccountError::protocol(
            "Shared conversations never create or inject an account history copy.",
        ));
    }
    let starts_turn=matches!(method,"turn/start"|"thread/queue/start");
    if starts_turn {
        verify_idle(&host::thread_metadata(endpoint, &conversation).await?)?;
        if state.active.contains_key(&conversation)
            || state.registry.selected.get(&conversation) != Some(&binding.connection)
        {
            return Err(AccountError::new(
                "ACCOUNT_TURN_ACTIVE",
                "The shared conversation is active or its account selection changed.",
            ));
        }
        verify_workspace(workspace, &binding.workspace)?;
    }
    policy::confine(method, &mut args, &binding.workspace)?;
    if starts_turn {
        let path=verify_path(&credentials::official_home()?,&binding.path,&conversation)?;
        let offset=std::fs::metadata(path).map_err(|_|AccountError::new("ACCOUNT_HISTORY_OBSERVATION","The pre-send history boundary could not be read. No task was sent."))?.len();
        state.registry.shared.get_mut(&conversation).unwrap().execution=Some(super::outcome::Execution{offset,turn_id:None,terminal:None});
        state
            .active
            .insert(conversation.clone(), binding.connection.clone());
        state.registry.active = state.active.clone();
        save(root, &state.registry)?;
    }
    let result = worker.request(method, Value::Object(args)).await;
    if starts_turn {
        if let Ok(response)=&result {
            if let Some(execution)=state.registry.shared.get_mut(&conversation).and_then(|b|b.execution.as_mut()) {
                execution.turn_id=super::outcome::turn_id(&response["turn"]["id"]);
            }
            save(root,&state.registry)?;
        }
    }
    if starts_turn
        && result.as_ref().err().is_some_and(|e| {
            e.code != "ACCOUNT_OUTCOME_UNKNOWN" && e.code != "ACCOUNT_DISCONNECTED"
        })
    {
        state.active.remove(&conversation);
        state.registry.shared.get_mut(&conversation).unwrap().execution=binding.execution.clone();
        state.registry.active = state.active.clone();
        save(root, &state.registry)?;
    }
    result
}

pub(super) async fn prepare(state:&mut OwnerState,root:&Path,endpoint:CdpEndpoint,owner:&host::Owner,params:&Value,workspace:Option<&Path>,progress:&super::preparation::Preparation,touched:&mut bool)->Result<Value>{
    let conversation=identifier(params,"conversationId")?.to_owned();
        let selected = text(params, "connectionId")?;
        if state.active.contains_key(&conversation) {
            return Err(AccountError::new(
                "ACCOUNT_TURN_ACTIVE",
                "The previous turn must reach a confirmed terminal state before selecting another identity.",
            ));
        }
        if selected != "host" && !state.registry.connections.iter().any(|c| c.id == selected && c.email.is_some()) {
            return Err(AccountError::protocol("The selected connection is not authorized for this owner."));
        }
        let verified = workspace
            .ok_or_else(|| AccountError::protocol("No verified native project is available."))?;
        progress.phase("validate-settings",10);
        let mut settings=params.get("settings").cloned().unwrap_or(json!({})).as_object().cloned().ok_or_else(||AccountError::protocol("Invalid native permission settings."))?;
        settings.insert("threadId".into(),json!(conversation));
        policy::confine("thread/settings/update",&mut settings,verified)?;
        progress.phase("native-history",20);
        let metadata = host::thread_metadata(endpoint, &conversation).await?;
        verify_idle(&metadata)?;
        if metadata["id"].as_str() != Some(&conversation) {
            return Err(AccountError::protocol(
                "The official thread identity did not match.",
            ));
        }
        let path = PathBuf::from(metadata["path"].as_str().ok_or_else(|| {
            AccountError::new(
                "ACCOUNT_SHARED_HISTORY",
                "The official conversation has no persistent history path yet.",
            )
        })?);
        let home = credentials::official_home()?;
        let path = verify_path(&home, &path, &conversation)?;
        let cwd = std::fs::canonicalize(metadata["cwd"].as_str().unwrap_or(""))
            .map_err(|_| AccountError::protocol("The native thread workspace is unavailable."))?;
        if verify_workspace(Some(verified), &cwd).is_err() {
            return Err(AccountError::protocol(
                "Official thread and verified project do not match.",
            ));
        }
        if let Some(prior) = state.registry.shared.get(&conversation) {
            if prior.path != path || prior.workspace != cwd {
                return Err(AccountError::new(
                    "ACCOUNT_SHARED_HISTORY_CHANGED",
                    "The official conversation history or project changed. No turn was sent.",
                ));
            }
        }
        progress.phase("credentials",35);
        let source = if selected == "host" {
            (home.clone(), owner.label.clone(), None)
        } else {
            let email = state
                .registry
                .connections
                .iter()
                .find(|c| c.id == selected)
                .and_then(|c| c.email.clone())
                .ok_or_else(|| {
                    AccountError::new(
                        "ACCOUNT_AUTH_REQUIRED",
                        "Authorize this account before selecting it.",
                    )
                })?;
            progress.step("credential-worker-start",json!({"reused":state.workers.get(selected).is_some_and(|w|!w.is_dead())}));
            let account = super::get_worker(state, root, selected).await?;
            (super::retention::home(root,selected)?, email, Some(account))
        };
        progress.step("credential-export",json!({"source":if selected=="host"{"official-file"}else{"managed-backend"}}));
        let auth = if let Some(account) = &source.2 {
            credentials::managed_observed(account, &source.1, Some(progress)).await?
        } else {
            credentials::read(&source.0, &source.1, true)?
        };
        progress.phase("tool-runtime",50);
        let worker = if let Some(worker) = state.executors.get(&conversation) {
            if worker.is_dead() {
                worker.stop().await;
                None
            } else {
                Some(worker.clone())
            }
        } else {
            None
        };
        let worker = if let Some(worker) = worker {
            worker
        } else {
            let execution_home = root.join("execution-v2").join(&conversation);
            directory(&execution_home)?;
            super::environment::prepare_execution_home(&execution_home, &home)?;
            *touched=true;
            let worker = Worker::spawn_sqlite(&execution_home, &home).await?;
            state.executors.insert(conversation.clone(), worker.clone());
            worker
        };
        progress.phase("authenticate",65);
        *touched=true;worker.set_selection(None);
        worker.request("account/login/start", auth).await?;
        worker.set_auth_source(source.0, source.1, selected == "host", source.2);
        progress.phase("resume-history",80);
        let resumed=worker.request("thread/resume",json!({"threadId":conversation,"path":path,"excludeTurns":true,"cwd":cwd})).await?;
        if resumed["thread"]["id"].as_str() != Some(&conversation)
            || !resumed["thread"]["path"]
                .as_str()
                .is_some_and(|p| same_file::is_same_file(p, &path).unwrap_or(false))
        {
            return Err(AccountError::new(
                "ACCOUNT_SHARED_HISTORY",
                "The execution backend did not resume the same official history. No turn was sent.",
            ));
        }
        progress.phase("apply-permissions",90);
        if settings.len()>1 {worker.request("thread/settings/update",Value::Object(settings)).await?;}
        progress.phase("commit-selection",95);
        state.registry.shared.insert(
            conversation.clone(),
            Binding {
                path,
                workspace: cwd,
                connection: selected.into(),
                execution: state.registry.shared.get(&conversation).and_then(|b|b.execution.clone()),
            },
        );
        state.registry.selected.insert(conversation.clone(), selected.into());
        // The service commits this working routing under the short registry lock.
        return Ok(json!({"threadId":conversation,"shared":true,"cursor":worker.cursor().await}));

}

fn verify_workspace(workspace: Option<&Path>, expected: &Path) -> Result<()> {
    // Workspace::open normalizes Windows verbatim prefixes, whereas thread
    // metadata is canonicalized by std. Compare the native directories, not
    // their display spellings. Missing/unreadable/replaced roots fail closed.
    let matches = workspace.is_some_and(|path| {
        path.is_dir()
            && expected.is_dir()
            && same_file::is_same_file(path, expected).unwrap_or(false)
    });
    if !matches {
        return Err(AccountError::protocol("The project changed before Send."));
    }
    Ok(())
}
fn verify_idle(metadata: &Value) -> Result<()> {
    match metadata["status"]["type"].as_str() {
        Some("idle" | "notLoaded" | "systemError") => Ok(()),
        Some("active") => Err(AccountError::new(
            "ACCOUNT_TURN_ACTIVE",
            "The official conversation still has an active turn. No shared turn was sent.",
        )),
        _ => Err(AccountError::new(
            "ACCOUNT_THREAD_STATE",
            "The official conversation state could not be confirmed. No shared turn was sent.",
        )),
    }
}
pub fn verify_path(home: &Path, path: &Path, id: &str) -> Result<PathBuf> {
    workspace_service::application_paths::validate_directory_path(
        path.parent()
            .ok_or_else(|| AccountError::protocol("History parent unavailable."))?,
    )
    .map_err(|_| AccountError::protocol("History parent is redirected."))?;
    let metadata = path
        .symlink_metadata()
        .map_err(|_| AccountError::protocol("Official history file unavailable."))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(AccountError::protocol(
            "Official history file is redirected.",
        ));
    }
    let p = std::fs::canonicalize(path)
        .map_err(|_| AccountError::protocol("Official history file unavailable."))?;
    if !(p.starts_with(home.join("sessions")) || p.starts_with(home.join("archived_sessions")))
        || !p
            .file_name()
            .is_some_and(|n| n.to_string_lossy().contains(id))
    {
        return Err(AccountError::protocol(
            "History must be the verified official conversation's existing file.",
        ));
    }
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_send_checks_directory_identity_not_path_spelling() {
        let project = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let native = workspace_service::Workspace::open(project.path()).unwrap();
        let metadata = std::fs::canonicalize(project.path()).unwrap();
        assert!(verify_workspace(Some(native.root_path()), &metadata).is_ok());
        assert!(verify_workspace(Some(other.path()), &metadata).is_err());
        assert!(verify_workspace(None, &metadata).is_err());
        assert!(verify_workspace(Some(&project.path().join("missing")), &metadata).is_err());
        assert!(verify_workspace(Some(native.root_path()), &other.path().join("missing")).is_err());
        #[cfg(windows)]
        {
            // Production Bridge uses dunce; metadata uses std's verbatim path.
            assert_ne!(native.root_path(), metadata);
            assert!(metadata.to_string_lossy().starts_with(r"\\?\"));
            let alternate = PathBuf::from(native.root_path().to_string_lossy().to_uppercase());
            assert!(verify_workspace(Some(&alternate), &metadata).is_ok());
        }
    }
    #[test]
    fn native_active_or_unknown_state_cannot_prepare_another_identity() {
        assert!(verify_idle(&json!({"status":{"type":"active"}})).is_err());
        assert!(verify_idle(&json!({})).is_err());
        assert!(verify_idle(&json!({"status":{"type":"idle"}})).is_ok());
    }
    #[test]
    fn shared_path_accepts_only_the_existing_official_thread() {
        let home = tempfile::tempdir().unwrap();
        let home = std::fs::canonicalize(home.path()).unwrap();
        let sessions = home.join("sessions");
        std::fs::create_dir(&sessions).unwrap();
        let id = "01a1-test";
        let path = sessions.join(format!("rollout-{id}.jsonl"));
        std::fs::write(&path, "history").unwrap();
        assert!(verify_path(&home, &path, id).is_ok());
        assert!(verify_path(&home, &path, "other-thread").is_err());
        let outside = home.join("rollout-01a1-test.jsonl");
        std::fs::write(&outside, "unrelated").unwrap();
        assert!(verify_path(&home, &outside, id).is_err());
        assert_eq!(std::fs::read_to_string(path).unwrap(), "history");
    }
}
