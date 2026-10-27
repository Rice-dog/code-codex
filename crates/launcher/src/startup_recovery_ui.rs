//! A per-launch status/action channel for the existing diagnostic window.
//! This owns presentation only; the retained process identity still authorizes close.
#![allow(dead_code)] // Shared by the native core and windowless wrapper.
use crate::startup_diagnostics::StartupDiagnostic;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

pub const CHANNEL_ENV: &str = "CLE_RECOVERY_UI_DIRECTORY";
// Observation threshold only: the launch/qualification pipeline owns failure.
pub const READINESS_DELAY_NOTICE_MS: u64 = 90_000;
static CHANNEL: OnceLock<Mutex<Option<Channel>>> = OnceLock::new();

struct Channel {
    root: PathBuf,
    _temporary: Option<tempfile::TempDir>,
    _window: Option<std::process::Child>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct State {
    pub schema: u8,
    pub request_id: String,
    pub phase: String,
    pub diagnostic: StartupDiagnostic,
    pub original: StartupDiagnostic,
    pub history: Vec<String>,
    pub old_exited: bool,
    pub relaunch_started_ms: Option<u64>,
    #[serde(default)]
    pub readiness_delayed: bool,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn validate_root(root: &Path) -> io::Result<()> {
    workspace_service::application_paths::validate_directory_path(root)?;
    if !root.is_absolute() || !root.is_dir() {
        return Err(io::Error::other(
            "Startup UI channel directory is unavailable",
        ));
    }
    Ok(())
}
pub fn read(root: &Path) -> io::Result<Option<State>> {
    validate_root(root)?;
    let path = root.join("recovery.json");
    let metadata = match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        value => value?,
    };
    workspace_service::application_paths::validate_directory_path(root)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("Redirected startup UI state refused"));
        }
    }
    if !metadata.is_file() || metadata.len() > 64 * 1024 {
        return Err(io::Error::other("Invalid startup UI state size or type"));
    }
    let state: State = serde_json::from_slice(&fs::read(path)?)?;
    if state.schema != 1
        || state.request_id.is_empty()
        || state.request_id.len() > 100
        || state.history.len() > 64
    {
        return Err(io::Error::other("Invalid startup UI state schema"));
    }
    Ok(Some(state))
}
pub fn write(root: &Path, state: &State) -> io::Result<()> {
    use std::io::Write;
    validate_root(root)?;
    let mut file = tempfile::NamedTempFile::new_in(root)?;
    file.write_all(&serde_json::to_vec(state)?)?;
    file.as_file().sync_all()?;
    file.persist(root.join("recovery.json"))
        .map_err(|e| e.error)?;
    Ok(())
}
// Losing the consent window must cancel a pending decision, never authorize close.
pub fn cancel_pending(root: &Path, state: &State) -> io::Result<()> {
    use std::io::Write;
    if !["checking", "awaiting-consent"].contains(&state.phase.as_str()) {
        return Ok(());
    }
    validate_root(root)?;
    let mut file = tempfile::NamedTempFile::new_in(root)?;
    file.write_all(&serde_json::to_vec(
        &json!({"schema":1,"requestId":state.request_id,"action":"cancel","remember":false}),
    )?)?;
    file.as_file().sync_all()?;
    match file.persist_noclobber(root.join("action.json")) {
        Ok(_) => Ok(()),
        Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(e.error),
    }
}
pub fn begin() -> Result<PathBuf, String> {
    let mut slot = CHANNEL
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "Startup UI channel lock failed")?;
    let (root, temporary) = if let Some(root) = std::env::var_os(CHANNEL_ENV) {
        (PathBuf::from(root), None)
    } else {
        let directory = tempfile::Builder::new()
            .prefix("CodeCodex-Recovery-")
            .tempdir()
            .map_err(|e| format!("Startup UI channel: {e}"))?;
        (directory.path().to_owned(), Some(directory))
    };
    validate_root(&root).map_err(|e| e.to_string())?;
    let original = StartupDiagnostic::new(
        "CC-START-STATE-001",
        "Checking the Codex process",
        "Codex Desktop is already running without Code-Codex",
        "An official Codex instance is already running. No close request has been sent.",
        "Close Codex, then start it through Code-Codex, or click Close and restart below.",
    );
    let state = State {
        schema: 1,
        request_id: format!("{}-{}", std::process::id(), now_ms()),
        phase: "checking".into(),
        diagnostic: original.clone(),
        original,
        history: vec!["Checking the existing instance before offering recovery.".into()],
        old_exited: false,
        relaunch_started_ms: None,
        readiness_delayed: false,
    };
    write(&root, &state).map_err(|e| e.to_string())?;
    let window = if temporary.is_some() {
        spawn_console_window(&root, &state)
    } else {
        None
    };
    if temporary.is_some() && window.is_none() {
        return Err(
            "The shared startup diagnostic window could not be opened; no close requested".into(),
        );
    }
    *slot = Some(Channel {
        root: root.clone(),
        _temporary: temporary,
        _window: window,
    });
    Ok(root)
}

fn update(f: impl FnOnce(&mut State)) {
    let Some(slot) = CHANNEL.get() else { return };
    let Ok(slot) = slot.lock() else { return };
    let Some(channel) = slot.as_ref() else { return };
    if let Ok(Some(mut state)) = read(&channel.root) {
        let before = state.clone();
        f(&mut state);
        if state != before {
            let _ = write(&channel.root, &state);
        }
    }
}
pub fn directory() -> Option<PathBuf> {
    CHANNEL
        .get()?
        .lock()
        .ok()?
        .as_ref()
        .map(|channel| channel.root.clone())
}
pub fn advance(state: &mut State, stage: &str, reason: &str) {
    if !state.old_exited || ["ready", "failed", "cancelled"].contains(&state.phase.as_str()) {
        return;
    }
    state.phase = "verifying".into();
    state.diagnostic.stage = stage.to_owned();
    state.diagnostic.summary = "Checking the replacement Codex instance".into();
    state.diagnostic.reason = reason.to_owned();
    if state.history.len() < 64 {
        state.history.push(format!("{stage}: {reason}"));
    }
}
pub fn stage(stage: &str, reason: &str) {
    update(|state| advance(state, stage, reason));
}
pub fn relaunching() {
    update(|state| {
        state.old_exited = true;
        state.relaunch_started_ms.get_or_insert_with(now_ms);
        advance(
            state,
            "Starting replacement",
            "The old instance exited. A replacement has not yet been verified.",
        );
    });
}
pub fn failed(diagnostic: &StartupDiagnostic) {
    update(|state| {
        if state.phase == "ready" || state.phase == "cancelled" {
            return;
        }
        state.phase = "failed".into();
        state.diagnostic = diagnostic.clone();
        state.diagnostic.reason = diagnostic.reason.chars().take(4000).collect();
        state.history.push(format!(
            "Failed: {} {}",
            diagnostic.code,
            diagnostic.reason.chars().take(500).collect::<String>()
        ));
        state.history.truncate(64);
    });
}
pub fn cancelled() {
    update(|state| {
        state.phase = "cancelled".into();
        state.diagnostic.reason = "Recovery was cancelled or another recovery controller is active. The current instance was preserved.".into();
    });
}
pub fn finished_without_ready() -> bool {
    let mut failed = false;
    update(|state| {
        if ["ready", "cancelled", "failed"].contains(&state.phase.as_str()) {
            return;
        }
        state.phase = "failed".into();
        failed = true;
        state.diagnostic = StartupDiagnostic::new(
            "CC-START-RECOVERY-INSTANCE-001",
            "Verifying replacement instance",
            "The replacement Codex instance was not confirmed",
            "The startup controller ended before a visible same-version interface and Bridge were verified. Closing the old instance is not startup success.",
            "Keep this report. Start Code-Codex again explicitly after checking the recorded failure; no repeated close was requested.",
        );
    });
    failed
}
fn ready_event(source: &str, action: &str, outcome: &str, details: &Value) -> bool {
    source == "renderer"
        && action == "file tree state"
        && ["ready", "empty", "no-project"].contains(&outcome)
        && details["version"] == env!("CARGO_PKG_VERSION")
        && details["bridgeAvailable"] == true
        && details["visible"] == true
}
pub fn observe(source: &str, action: &str, outcome: &str, details: &Value) {
    if !ready_event(source, action, outcome, details) {
        return;
    }
    update(confirm_ready);
}
fn confirm_ready(state: &mut State) {
    if !state.old_exited || ["ready", "failed", "cancelled"].contains(&state.phase.as_str()) {
        return;
    }
    state.phase = "ready".into();
    state.diagnostic.stage = "Interface ready".into();
    state.diagnostic.summary = "The replacement interface is ready".into();
    state.diagnostic.reason =
        "The replacement instance has a visible same-version interface and a working Bridge."
            .into();
    if state.history.len() == 64 {
        state.history.remove(1);
    }
    state
        .history
        .push("Verified replacement interface and Bridge ready.".into());
}
// Only the core mutates post-consent recovery state. A delayed observation is
// not evidence of failure; in particular, it cannot outrun initial document
// qualification or overwrite a concurrent renderer-ready event in another process.
pub fn note_readiness_delay(state: &mut State, now: u64) -> bool {
    if state.readiness_delayed
        || !state.old_exited
        || ["ready", "failed", "cancelled"].contains(&state.phase.as_str())
    {
        return false;
    }
    if state
        .relaunch_started_ms
        .is_some_and(|start| now.saturating_sub(start) >= READINESS_DELAY_NOTICE_MS)
    {
        state.readiness_delayed = true;
        if state.history.len() == 64 {
            state.history.remove(1);
        }
        state.history.push("CC-START-RECOVERY-WAIT-001: Interface readiness is still pending. Elapsed time alone is not a startup failure; the current launch continues without another close or retry.".into());
        return true;
    }
    false
}
pub fn check_readiness_delay() -> bool {
    let mut delayed = false;
    update(|state| delayed = note_readiness_delay(state, now_ms()));
    delayed
}
pub fn presentation(state: &State) -> Value {
    json!({"phase":state.phase,"requestId":state.request_id,"restartAllowed":state.phase=="awaiting-consent",
        "busy":!["awaiting-consent","failed","ready","cancelled"].contains(&state.phase.as_str()),
        "summary":state.diagnostic.summary,"stage":state.diagnostic.stage,"code":state.diagnostic.code,
        "reason":format!("Original conflict: {}\n{}\n\n{}\n\nRecovery timeline:\n{}",state.original.code,state.original.reason,state.diagnostic.reason,state.history.join("\n")),
        "guidance":state.diagnostic.guidance,"details":format!("Original diagnostic:\n{:?}\n\nCurrent diagnostic:\n{:?}\n\n{}",state.original,state.diagnostic,state.history.join("\n"))})
}

#[cfg(windows)]
fn spawn_console_window(root: &Path, state: &State) -> Option<std::process::Child> {
    use std::{
        io::Write,
        os::windows::process::CommandExt,
        process::{Command, Stdio},
    };
    let shell = std::env::var_os("SystemRoot")
        .map(PathBuf::from)?
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let source = format!(
        "{}\nStart-CodeCodexStartupDialog",
        include_str!("startup_dialog.ps1")
    );
    let source = crate::localization::dialog_script(&source);
    let mut child = Command::new(shell).args(["-NoProfile","-NonInteractive","-STA","-Command","$ProgressPreference='SilentlyContinue';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); & ([scriptblock]::Create([Console]::In.ReadToEnd()))"])
        .env("CLE_ERROR_TITLE","Code-Codex startup problem").env("CLE_ERROR_SUMMARY",&state.diagnostic.summary)
        .env("CLE_ERROR_STAGE",&state.diagnostic.stage).env("CLE_ERROR_CODE",&state.diagnostic.code)
        .env("CLE_RECOVERY_UI_DIRECTORY",root).env("CLE_ERROR_LIVE_STATE",root.join("dialog.json"))
        .env("CLE_ERROR_OWNER_PID",std::process::id().to_string())
        .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x0800_0000).spawn().ok()?;
    let payload = source.as_bytes();
    if child.stdin.take()?.write_all(payload).is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    }
    Some(child)
}
#[cfg(not(windows))]
fn spawn_console_window(_: &Path, _: &State) -> Option<std::process::Child> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> State {
        let d = StartupDiagnostic::new(
            "CC-START-STATE-001",
            "Existing",
            "Conflict",
            "Original reason",
            "Cancel",
        );
        State {
            schema: 1,
            request_id: "fixture-123".into(),
            phase: "verifying".into(),
            diagnostic: d.clone(),
            original: d,
            history: vec![],
            old_exited: true,
            relaunch_started_ms: Some(1000),
            readiness_delayed: false,
        }
    }
    #[test]
    fn delayed_launch_remains_pending_and_accepts_real_readiness() {
        let mut s = sample();
        advance(&mut s, "Codex activation", "process handle acquired");
        assert_eq!(s.phase, "verifying");
        assert_eq!(s.original.reason, "Original reason");
        assert!(!note_readiness_delay(&mut s, 90_999));
        assert!(note_readiness_delay(&mut s, 91_000));
        assert_eq!(s.phase, "verifying");
        assert_eq!(s.original.reason, "Original reason");
        assert!(!note_readiness_delay(&mut s, u64::MAX));
        advance(
            &mut s,
            "renderer discovery",
            "still qualifying the document",
        );
        assert_eq!(s.phase, "verifying");
        confirm_ready(&mut s);
        assert_eq!(s.phase, "ready");
        assert!(s.readiness_delayed);
        assert_eq!(
            s.history.iter().filter(|s| s.contains("WAIT-001")).count(),
            1
        );
        assert_eq!(s.original.reason, "Original reason");
    }
    #[test]
    fn completed_cancelled_and_failed_states_cannot_be_reopened_by_a_delay_or_late_event() {
        for phase in ["ready", "failed", "cancelled"] {
            let mut s = sample();
            s.phase = phase.into();
            assert!(!note_readiness_delay(&mut s, u64::MAX));
            confirm_ready(&mut s);
            assert_eq!(s.phase, phase);
        }
    }
    #[test]
    fn observed_slow_start_replay_never_becomes_a_failure() {
        let mut s = sample();
        // User's .36 trace: timeout at103s, valid no-project128s, tree ready147s.
        for elapsed in [24_040, 27_069, 103_582, 124_785, 127_725] {
            note_readiness_delay(&mut s, 1000 + elapsed);
            assert_eq!(s.phase, "verifying");
        }
        let evidence =
            json!({"version":env!("CARGO_PKG_VERSION"),"bridgeAvailable":true,"visible":true});
        assert!(ready_event(
            "renderer",
            "file tree state",
            "no-project",
            &evidence
        ));
        confirm_ready(&mut s);
        assert!(!note_readiness_delay(&mut s, 1000 + 146_618));
        assert_eq!(s.phase, "ready");
    }
    #[test]
    fn delay_is_bounded_and_never_creates_a_report_before_relaunch() {
        let mut s = sample();
        s.old_exited = false;
        assert!(!note_readiness_delay(&mut s, u64::MAX));
        s.old_exited = true;
        s.relaunch_started_ms = None;
        assert!(!note_readiness_delay(&mut s, u64::MAX));
        s.relaunch_started_ms = Some(1000);
        s.history = vec!["original".into(); 64];
        assert!(note_readiness_delay(&mut s, 91_000));
        confirm_ready(&mut s);
        assert_eq!(s.history.len(), 64);
        assert_eq!(s.history[0], "original");
    }
    #[test]
    fn readiness_requires_current_version_visible_bridge_not_just_a_process_or_cdp_reply() {
        let ready =
            json!({"version":env!("CARGO_PKG_VERSION"),"bridgeAvailable":true,"visible":true});
        assert!(ready_event("renderer", "file tree state", "ready", &ready));
        for value in [
            json!({}),
            json!({"version":"0.0.1","bridgeAvailable":true,"visible":true}),
            json!({"version":env!("CARGO_PKG_VERSION"),"bridgeAvailable":false,"visible":true}),
            json!({"version":env!("CARGO_PKG_VERSION"),"bridgeAvailable":true,"visible":false}),
        ] {
            assert!(!ready_event("renderer", "file tree state", "ready", &value));
        }
        assert!(!ready_event("launcher", "CDP version", "ready", &ready));
        assert!(!ready_event(
            "renderer",
            "file tree state",
            "loading",
            &ready
        ));
    }
    #[test]
    fn lost_consent_window_cancels_without_overwriting_an_explicit_decision() {
        let root = tempfile::tempdir().unwrap();
        let mut state = sample();
        state.phase = "awaiting-consent".into();
        cancel_pending(root.path(), &state).unwrap();
        let file = root.path().join("action.json");
        let decision: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert_eq!(decision["action"], "cancel");
        assert_eq!(decision["remember"], false);
        fs::write(&file, b"explicit prior decision").unwrap();
        cancel_pending(root.path(), &state).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"explicit prior decision");
        fs::remove_file(&file).unwrap();
        state.phase = "verifying".into();
        cancel_pending(root.path(), &state).unwrap();
        assert!(!file.exists());
    }
    #[test]
    fn channel_roundtrip_is_bounded_and_rejects_schema_or_redirected_input() {
        let d = tempfile::tempdir().unwrap();
        let s = sample();
        write(d.path(), &s).unwrap();
        assert_eq!(read(d.path()).unwrap().unwrap().request_id, s.request_id);
        fs::write(d.path().join("recovery.json"), vec![b'x'; 65 * 1024]).unwrap();
        assert!(read(d.path()).is_err());
        let mut invalid = s.clone();
        invalid.schema = 2;
        write(d.path(), &invalid).unwrap();
        assert!(read(d.path()).is_err());
        invalid = s;
        invalid.history = vec!["x".into(); 65];
        write(d.path(), &invalid).unwrap();
        assert!(read(d.path()).is_err());
    }
}
