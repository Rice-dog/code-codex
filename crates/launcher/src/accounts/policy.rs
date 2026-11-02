//! The renderer can select an identity, never expand its native execution boundary.
use super::{AccountError, Result};
use serde_json::{Map, Value, json};
use std::path::Path;

pub fn confine(method: &str, args: &mut Map<String, Value>, root: &Path) -> Result<()> {
    let allowed: &[&str] = match method {
        "thread/start" => &["model", "baseInstructions", "developerInstructions"],
        "thread/resume" => &["threadId", "excludeTurns"],
        "thread/read" => &["threadId", "includeTurns"],
        "thread/turns/list" => &["threadId", "cursor", "limit", "sortDirection", "itemsView"],
        "thread/items/list" => &["threadId", "turnId", "cursor", "limit"],
        "thread/inject_items" => &["threadId", "items"],
        "thread/settings/update" => &["threadId", "approvalPolicy", "approvalsReviewer", "permissions", "sandboxPolicy", "model", "effort", "summary", "serviceTier", "collaborationMode", "multiAgentMode", "disabledPluginIds", "personality"],
        "turn/settings/update" => &["threadId", "turnId", "approvalsReviewer", "model", "effort", "summary", "serviceTier"],
        "turn/start" => &["approvalPolicy", "approvalsReviewer", "permissions", "sandboxPolicy", "clientUserMessageId", "additionalContext", "toolOutput", "disabledPluginIds", "multiAgentMode", "responsesapiClientMetadata", "turnTrigger", "parentTurnId", "rootTurnId",
            "threadId",
            "input",
            "model",
            "effort",
            "summary",
            "serviceTier",
            "collaborationMode",
            "personality",
            "outputSchema",
        ],
        "turn/interrupt" => &["threadId", "turnId"],
        "thread/backgroundTerminals/clean" => &["threadId"],
        "thread/queue/list" => &["threadId","cursor","limit"],
        "thread/queue/add" => &["threadId","input","clientUserMessageId"],
        "thread/queue/update" => &["threadId","queuedSubmissionId","input"],
        "thread/queue/delete" => &["threadId","queuedSubmissionId"],
        "thread/queue/reorder" => &["threadId","queuedSubmissionIds"],
        "thread/queue/start" => &["threadId","queuedSubmissionId"],
        "thread/goal/set" => &["threadId","status"],
        "turn/steer" => &["threadId", "input", "expectedTurnId"],
        _ => {
            return Err(AccountError::protocol(
                "This account backend method is not exposed.",
            ));
        }
    };
    args.retain(|k, _| allowed.contains(&k.as_str()));
    if method=="thread/goal/set"&&args.get("status").and_then(Value::as_str)!=Some("paused"){return Err(AccountError::protocol("Only the native Stop goal-pause operation is exposed."));}
    if matches!(method, "thread/start" | "thread/resume" | "turn/start") {
        args.insert("cwd".into(), json!(root));
    }
    validate_permissions(args, root)?;
    // Collaboration mode contains developer instructions, but never environment,
    // auth, endpoint or permission configuration. Keep its documented wire shape.
    if let Some(mode) = args
        .get_mut("collaborationMode")
        .and_then(Value::as_object_mut)
    {
        mode.retain(|k, _| matches!(k.as_str(), "mode" | "settings"));
        if let Some(settings) = mode.get_mut("settings").and_then(Value::as_object_mut) {
            settings.retain(|k, _| {
                matches!(
                    k.as_str(),
                    "model" | "reasoning_effort" | "developer_instructions"
                )
            });
        }
    }
    if serde_json::to_vec(args)
        .map_err(|_| AccountError::protocol("Invalid account RPC payload."))?
        .len()
        > 4 * 1024 * 1024
    {
        return Err(AccountError::protocol(
            "Account RPC exceeds its bounded payload limit.",
        ));
    }
    Ok(())
}

fn validate_permissions(args: &Map<String, Value>, root: &Path) -> Result<()> {
    if let Some(value) = args.get("approvalPolicy").filter(|v| !v.is_null()) {
        if !matches!(value.as_str(), Some("never" | "untrusted" | "on-request")) {
            return Err(AccountError::protocol("Unsupported native approval policy."));
        }
    }
    if let Some(value) = args.get("approvalsReviewer").filter(|v| !v.is_null()) {
        if !matches!(value.as_str(), Some("user" | "auto_review" | "guardian_subagent")) {
            return Err(AccountError::protocol("Unsupported native approvals reviewer."));
        }
    }
    if let Some(profile) = args.get("permissions").filter(|v| !v.is_null()) {
        if !profile.as_str().is_some_and(valid_profile) {
            return Err(AccountError::new("ACCOUNT_PERMISSIONS_PROFILE", "Invalid native permissions profile. Expected a qualified built-in (:read-only, :workspace, :danger-full-access) or a bounded named profile identifier; no identity was committed."));
        }
        if args.get("sandboxPolicy").is_some_and(|v| !v.is_null()) { return Err(AccountError::protocol("Conflicting native permissions selections.")); }
    }
    if let Some(policy) = args.get("sandboxPolicy").filter(|v| !v.is_null()) {
        let map=policy.as_object().ok_or_else(|| AccountError::protocol("Invalid native sandbox policy."))?;
        let allowed: &[&str] = match policy["type"].as_str() {
            Some("dangerFullAccess") => &["type"],
            Some("readOnly") => &["type", "networkAccess"],
            Some("workspaceWrite") => &["type", "networkAccess", "writableRoots", "excludeTmpdirEnvVar", "excludeSlashTmp"],
            _ => return Err(AccountError::protocol("Unsupported native sandbox policy.")),
        };
        if map.keys().any(|k| !allowed.contains(&k.as_str())) { return Err(AccountError::protocol("Unknown native sandbox field.")); }
        for name in ["networkAccess","excludeTmpdirEnvVar","excludeSlashTmp"] {
            if map.get(name).is_some_and(|v| !v.is_boolean()) { return Err(AccountError::protocol("Invalid native sandbox flag.")); }
        }
        if let Some(roots) = map.get("writableRoots") {
            let roots=roots.as_array().ok_or_else(|| AccountError::protocol("Invalid native writable roots."))?;
            for path in roots {
                let path=path.as_str().ok_or_else(|| AccountError::protocol("Invalid native writable root."))?;
                let path=dunce::canonicalize(path).map_err(|_| AccountError::protocol("Native writable root is unavailable."))?;
                let base=dunce::canonicalize(root).map_err(|_| AccountError::protocol("Native project is unavailable."))?;
                if !path.starts_with(base) { return Err(AccountError::protocol("Native writable root is outside this project. Select Full access explicitly for broader access.")); }
            }
        }
    }
    Ok(())
}

fn valid_profile(s: &str) -> bool {
    matches!(s, ":read-only" | ":workspace" | ":danger-full-access")
        || (!s.is_empty() && s.len() <= 128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b,b'-'|b'_'|b'.')))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_stop_cleanup_and_follow_up_queue_are_scoped_without_expanding_configuration(){
        for method in ["thread/backgroundTerminals/clean","thread/queue/list","thread/queue/add","thread/queue/update","thread/queue/delete","thread/queue/reorder","thread/queue/start"]{
            let mut args=json!({"threadId":"same","input":[],"auth":"secret","cwd":"elsewhere","config":{"secret":"private"}}).as_object().unwrap().clone();confine(method,&mut args,Path::new("C:/verified")).unwrap();assert_eq!(args["threadId"],"same");assert!(!args.contains_key("auth")&&!args.contains_key("cwd")&&!args.contains_key("config"));
        }
        for status in ["active","completed"]{assert!(confine("thread/goal/set",&mut json!({"threadId":"same","status":status}).as_object().unwrap().clone(),Path::new("C:/verified")).is_err());}
        assert!(confine("thread/goal/set",&mut json!({"threadId":"same","status":"paused"}).as_object().unwrap().clone(),Path::new("C:/verified")).is_ok());
    }
    #[test]
    fn official_builtin_profiles_survive_quota_paused_selection_and_send() {
        for profile in [":read-only", ":workspace", ":danger-full-access", "my-project"] {
            for method in ["thread/settings/update", "turn/start"] {
                let mut args=json!({"threadId":"same-history", "permissions":profile,"approvalPolicy":"never"}).as_object().unwrap().clone();
                confine(method,&mut args,Path::new("C:/verified")).unwrap();
                assert_eq!(args["permissions"],profile);
            }
        }
        for profile in [":unknown", "../danger", "profile:arbitrary", "", "x\nsecret"] {
            let mut args=json!({"permissions":profile}).as_object().unwrap().clone();
            let error=confine("turn/start",&mut args,Path::new("C:/verified")).unwrap_err();
            assert_eq!(error.code,"ACCOUNT_PERMISSIONS_PROFILE");
            assert!(!error.message.contains(profile) || profile.is_empty());
        }
    }
    #[test]
    fn native_permission_selection_survives_and_arbitrary_config_does_not() {
        for method in ["turn/start", "thread/settings/update"] {
            let mut args=json!({"threadId":"same", "approvalPolicy":"never", "sandboxPolicy":{"type":"dangerFullAccess"}, "config":{"evil":true}}).as_object().unwrap().clone();
            confine(method,&mut args,Path::new("C:/verified")).unwrap();
            assert_eq!(args["approvalPolicy"],"never");assert_eq!(args["sandboxPolicy"]["type"],"dangerFullAccess");assert!(!args.contains_key("config"));
        }
        let root=tempfile::tempdir().unwrap();let other=tempfile::tempdir().unwrap();
        let mut args=json!({"sandboxPolicy":{"type":"workspaceWrite","writableRoots":[other.path()]}}).as_object().unwrap().clone();
        assert!(confine("turn/start",&mut args,root.path()).is_err());
    }
    #[test]
    fn renderer_cannot_override_account_or_workspace() {
        for method in ["thread/start", "thread/resume", "turn/start"] {
            let mut args=json!({"threadId":"test","cwd":"C:/other","config":{"model_provider":"evil"},"permissions":"../danger","sandbox":"danger-full-access","environments":["evil"],"modelProvider":"evil","dynamicTools":[{}],"collaborationMode":{"mode":"default","settings":{"model":"test","credentials":"secret"}}}).as_object().unwrap().clone();
            if method == "turn/start" { assert!(confine(method, &mut args, Path::new("C:/verified")).is_err()); }
            args.remove("permissions");
            confine(method, &mut args, Path::new("C:/verified")).unwrap();
            assert_eq!(args["cwd"], "C:/verified");
            assert!(!args.contains_key("approvalPolicy"));
            for key in [
                "config",
                "permissions",
                "environments",
                "modelProvider",
                "dynamicTools",
            ] {
                assert!(!args.contains_key(key));
            }
            assert!(
                args.get("collaborationMode")
                    .and_then(|m| m.get("settings"))
                    .and_then(|s| s.get("credentials"))
                    .is_none()
            );
        }
    }
    #[test]
    fn unrestricted_backend_methods_are_not_exposed() {
        for method in [
            "config/read",
            "config/write",
            "account/read",
            "account/login/start",
            "model/list",
        ] {
            assert!(confine(method, &mut Map::new(), Path::new("C:/verified")).is_err());
        }
    }
}
