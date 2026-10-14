//! Shared failure vocabulary. Suggestions are not diagnoses or permission to retry writes.
use serde_json::{Value, json};

pub(crate) fn is_failure(outcome: &str) -> bool {
    matches!(
        outcome,
        "failed"
            | "error"
            | "failure"
            | "rejected"
            | "timeout"
            | "stalled"
            | "interrupted"
            | "cancelled"
            | "aborted"
    )
}

pub(crate) fn enrich(source: &str, action: &str, outcome: &str, mut details: Value) -> Value {
    if !is_failure(outcome) {
        return details;
    }
    if !details.is_object() {
        details = json!({"observation":details});
    }
    // Inspect explicit metadata, not error-message keywords. Unknown errors stay unknown.
    let code = ["errorCode", "code", "ioKind"]
        .into_iter()
        .find_map(|key| details.get(key).and_then(Value::as_str))
        .unwrap_or("UNCLASSIFIED");
    let known_startup = [
        ("CC-START-DISCOVERY", "installation-discovery"),
        ("CC-PLUGIN-CACHE", "plugin-cache"),
        ("CC-START-UI", "ui-bootstrap"),
        ("CC-START-CODEX", "application-launch"),
        ("CC-START-WORKSPACE", "workspace"),
        ("CC-START-COMPAT", "compatibility"),
        ("CC-START-STATE", "process-state"),
        ("CC-START-SECURITY", "security-boundary"),
    ]
    .into_iter()
    .find_map(|(prefix, domain)| code.starts_with(prefix).then_some(domain));
    let domain = if let Some(domain) = known_startup {
        domain
    } else if code.starts_with("APP_") {
        "app-server"
    } else if code.starts_with("UPDATE_") {
        "update"
    } else if code.starts_with("GIT_") {
        "git"
    } else if code.starts_with("PLUGIN_") {
        "plugin"
    } else if code.starts_with("CC-START-PROCESS") || source.contains("process") {
        "process"
    } else if code.starts_with("CC-START-MAIN") {
        "main-inspector"
    } else if code.starts_with("CC-START-CDP") || source.contains("cdp") {
        "renderer-connection"
    } else if code.starts_with("CC-START-APP") || source.contains("app-server") {
        "app-server"
    } else if source.contains("install") || source.contains("setup") {
        "installation"
    } else if action.contains("settings") || source.contains("settings") {
        "settings"
    } else if action.contains("git") || source.contains("git") {
        "git"
    } else if source.contains("plugin") || action.contains("plugin") {
        "plugin"
    } else if source.contains("update") || action.contains("update") {
        "update"
    } else if source.contains("workspace") || action.contains("list") || action.contains("watch") {
        "workspace"
    } else if source.contains("preview") || action.contains("preview") {
        "preview"
    } else if source == "codex-observed" {
        "official-window-observation"
    } else if source.contains("bridge") {
        "bridge"
    } else {
        "other"
    };
    let (class, guidance) = match code {
        "ACCESS_DENIED" | "PermissionDenied" => (
            "access",
            "Inspect the recorded OS error and access policy; do not disable security software automatically.",
        ),
        "NOT_FOUND" | "NotFound" | "PLUGIN_NOT_INSTALLED" => (
            "missing",
            "Recheck availability and installation state; a missing file alone does not prove quarantine.",
        ),
        "PLUGIN_INTEGRITY" | "INTEGRITY" => (
            "integrity",
            "Keep the previous verified package. Download the trusted asset again; never execute the rejected bytes.",
        ),
        "PLUGIN_NETWORK" => (
            "transport",
            "Compare request error chain, proxy observations and independent probes. Probe success cannot prove the original route worked.",
        ),
        "PLUGIN_HTTP" => (
            "http",
            "Check HTTP status, asset/tag and Retry-After. 404 does not establish a local network fault.",
        ),
        "CONFLICT" | "EntryConflict" => (
            "conflict",
            "Reload state and reconcile the result before retrying a write; never overwrite blindly.",
        ),
        "UNAUTHORIZED" | "INVALID_REQUEST" | "RATE_LIMITED" | "REQUEST_CAPACITY" => (
            "security-boundary",
            "Inspect authorization, replay, payload-size and rate/capacity evidence. Preserve the security gate; do not echo attacker-selected IDs or weaken authentication.",
        ),
        "OUTSIDE_WORKSPACE" | "INVALID_PATH" => (
            "security-boundary",
            "Keep the active workspace boundary; reselect an authorized relative target.",
        ),
        "INVALID_SETTINGS" => (
            "settings-validation",
            "Inspect the validation stage. Preserve the previous settings; do not reset or delete them automatically.",
        ),
        "RESOURCE_LOAD" => (
            "resource",
            "Compare resource type, media error code and package integrity; HTTP status may be unavailable at the DOM boundary.",
        ),
        "GPU_CONTEXT_LOST" => (
            "gpu-context",
            "Check existing effect recovery and context-restored events. Driver metadata is supporting evidence, not proof of a driver crash.",
        ),
        "PLUGIN_ENCODING" | "PLUGIN_EXECUTION" | "PLUGIN_IMPORT" => (
            "module",
            "Compare verified-installed, loaded and enabled/applied states, module API/version and first-frame evidence.",
        ),
        "APP_TIMEOUT" => (
            "app-server-timeout",
            "Inspect request method/number and reply timeout; a timeout alone does not prove the child exited.",
        ),
        "APP_IO" => (
            "app-server-stdio",
            "Compare request write/flush, response channel and reader terminal events with native I/O evidence.",
        ),
        "APP_PROTOCOL" | "APP_REMOTE" => (
            "app-server-protocol",
            "Inspect frame shape/JSON location or remote error code; protocol bodies are omitted.",
        ),
        "APP_SPAWN" => (
            "app-server-spawn",
            "Inspect child spawn and standard-stream acquisition evidence.",
        ),
        "UPDATE_LOCAL_IO" => (
            "local-filesystem",
            "Inspect the update temporary-file operation and native ioKind/osCode; this is a local file failure.",
        ),
        "PLUGIN_STATE" => (
            "state-lock",
            "Plugin state synchronization failed; inspect the recorded lock/operation cause.",
        ),
        "PLUGIN_CATALOG" => (
            "catalog-validation",
            "Inspect catalog JSON location, asset metadata, count and dependency validation.",
        ),
        "INTERNAL" => (
            "internal-operation",
            "Inspect the concrete operation and captured exception. The internal code alone does not identify its origin.",
        ),
        "NOT_EDITABLE" => (
            "validation",
            "Inspect the reported validation rule and preserve the existing content/settings.",
        ),
        "TIMEOUT" => (
            "timeout",
            "Check the last completed phase and cancellation state. For writes, reconcile disk state before retrying.",
        ),
        "PLUGIN_BUSY" | "PLUGIN_CANCELLED" | "CANCELLED" => (
            "lifecycle",
            "Inspect the active operation and its terminal event; cancellation is not proof of a crash.",
        ),
        "CONTENT_TOO_LARGE" | "TOO_MANY_ENTRIES" | "PLUGIN_TOO_LARGE" => (
            "limit",
            "Compare observed and allowed size/count. The safety limit is intentional.",
        ),
        "RUNTIME_LOG" => (
            "diagnostic-storage",
            "The current run may remain available in memory. Check storageError and export before closing.",
        ),
        _ if known_startup.is_some() => (
            domain,
            "Inspect the specific operation, validation rule and captured cause for this known startup module. Keep the original failure and separate auxiliary checks from proof of origin.",
        ),
        _ if code.starts_with("CC-START-PROCESS") => (
            "process-verification",
            "Compare embedded-query errors, native process/listener evidence and pre-cleanup state; do not bypass identity checks.",
        ),
        _ if code.starts_with("CC-START-MAIN") => (
            "main-inspector",
            "Inspect the main-process inspector operation, port, timeout and pre-cleanup process state. Renderer CDP availability is a separate observation; do not infer network or security-software causation from this failure alone.",
        ),
        _ if code.starts_with("CC-START-APP") => (
            "app-server-communication",
            "Inspect spawn/stdio/request/response details, request number and timeout. Preserve method and underlying OS/protocol evidence; a channel closure alone does not establish a child crash.",
        ),
        _ if code.starts_with("CC-START-CDP") => (
            "renderer-qualification",
            "Compare endpoint availability, target filter, layout predicates and bootstrap phases; a support code alone does not prove a layout change.",
        ),
        _ if code.starts_with("UPDATE_") => (
            "update-operation",
            "Inspect release/status/asset/local-file/integrity/installer stages and retain the current installed version.",
        ),
        _ if code.starts_with("GIT_") => (
            "git-operation",
            "Inspect git operation, executable availability, exit status and bounded stderr.",
        ),
        _ if details["timeout"] == true => (
            "timeout",
            "Check timeout budget and the last completed phase; transport phase and root cause may remain unknown.",
        ),
        _ if details["connect"] == true => (
            "transport",
            "Inspect all causes and independent network checks; connect alone does not distinguish DNS, proxy, TCP or TLS.",
        ),
        _ if matches!(outcome, "cancelled" | "interrupted") => (
            "lifecycle",
            "Inspect dispose, navigation, cancellation and cleanup events. The cause may be unavailable.",
        ),
        _ => (
            "unclassified",
            "Use the correlated timeline and Run Checks. Preserve the original failure; collect external evidence if internal cause is unavailable.",
        ),
    };
    let mut missing = vec![];
    if code == "UNCLASSIFIED" {
        missing.push("specific error code");
    }
    if ![
        "errorChain",
        "reason",
        "message",
        "error",
        "ioKind",
        "observation",
    ]
    .iter()
    .any(|key| details.get(key).is_some())
    {
        missing.push("underlying error evidence");
    }
    let observed = [
        "reason",
        "message",
        "error",
        "requestFlags",
        "errorChain",
        "ioKind",
        "nativeErrors",
        "osErrorCode",
        "status",
        "httpStatus",
        "timeout",
        "connect",
        "operationId",
        "requestRef",
        "jobId",
    ]
    .into_iter()
    .filter_map(|key| {
        details
            .get(key)
            .map(|value| (key.to_owned(), value.clone()))
    })
    .collect::<serde_json::Map<_, _>>();
    details["fault"] = json!({"schema":2,"source":source,"operation":action,"outcome":outcome,"domain":domain,"classification":class,"observedCode":code,"observedFailure":observed,"rootCause":"underlying origin not proven by classification; observed operation failure is recorded above","suggestedAction":guidance,"missingEvidence":missing,"automaticRepair":"not inferred; consult explicit recovery events","writeRetry":"requires reconciliation","observationOnly":true});
    details
}

#[cfg(test)]
mod tests {

    #[test]
    fn precise_failures_distinguish_observation_from_unproven_origin() {
        let main = enrich(
            "launcher",
            "startup",
            "failed",
            json!({"code":"CC-START-MAIN-001","reason":"TCP listener timeout; port=55996"}),
        );
        assert_eq!(main["fault"]["domain"], "main-inspector");
        assert_eq!(main["fault"]["operation"], "startup");
        assert!(
            main["fault"]["observedFailure"]["reason"]
                .as_str()
                .unwrap()
                .contains("55996")
        );
        assert!(
            main["fault"]["rootCause"]
                .as_str()
                .unwrap()
                .contains("not proven")
        );
        let app = enrich(
            "app-server",
            "request",
            "failed",
            json!({"code":"CC-START-APP-005","reason":"BrokenPipe"}),
        );
        assert_eq!(app["fault"]["domain"], "app-server");
        assert_eq!(app["fault"]["schema"], 2);
        for code in [
            "CC-START-DISCOVERY-002",
            "CC-PLUGIN-CACHE-001",
            "CC-START-UI-002",
            "CC-START-CODEX-001",
            "CC-START-WORKSPACE-007",
            "CC-START-COMPAT-001",
            "CC-START-STATE-001",
            "CC-START-SECURITY-003",
        ] {
            let event = enrich(
                "launcher",
                "startup",
                "failed",
                json!({"code":code,"reason":"specific cause"}),
            );
            assert_ne!(event["fault"]["classification"], "unclassified");
            assert_ne!(event["fault"]["domain"], "other");
        }
        let unknown = enrich("preview", "decode", "failed", json!({}));
        assert!(
            !unknown["fault"]["missingEvidence"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }

    use super::*;
    #[test]
    fn distinguishes_integrity_conflicts_and_unknowns_without_message_guessing() {
        assert_eq!(
            enrich(
                "plugin",
                "install",
                "failed",
                json!({"code":"PLUGIN_INTEGRITY"})
            )["fault"]["classification"],
            "integrity"
        );
        let conflict = enrich(
            "native-bridge",
            "write",
            "failed",
            json!({"code":"CONFLICT"}),
        );
        assert_eq!(conflict["fault"]["classification"], "conflict");
        assert_eq!(conflict["fault"]["writeRetry"], "requires reconciliation");
        let unknown = enrich(
            "test",
            "request",
            "failed",
            json!({"reason":"firewall virus DNS permissions"}),
        );
        assert_eq!(unknown["fault"]["classification"], "unclassified");
        assert_eq!(unknown["reason"], "firewall virus DNS permissions");
        assert!(
            unknown["fault"]["missingEvidence"]
                .as_array()
                .unwrap()
                .contains(&json!("specific error code"))
        );
        assert_eq!(
            enrich("test", "request", "passed", json!({"n":1})),
            json!({"n":1})
        );
    }
}
