//! Disposable core-protocol double. Never discovers, starts or closes Codex.
use std::{
    env, fs,
    path::PathBuf,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
fn phase(root: &PathBuf, base: &str, value: &str, reason: &str, old: bool) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let timestamp = if env::var("CLE_UNIFIED_FIXTURE_MODE").as_deref() == Ok("delayed-ready") {
        now.saturating_sub(600_000).to_string()
    } else {
        now.to_string()
    };
    let text = base
        .replace("__PHASE__", value)
        .replace("REASON", reason)
        .replace("__OLD__", if old { "true" } else { "false" })
        .replace("__START_MS__", if old { &timestamp } else { "null" });
    // Match the real controller's atomic publication, never truncate a file
    // concurrently read by the actual GUI/PowerShell dialog.
    let temporary = root.join("fixture-state.tmp");
    fs::write(&temporary, text).unwrap();
    let deadline = std::time::Instant::now();
    loop {
        match fs::rename(&temporary, root.join("recovery.json")) {
            Ok(()) => break,
            Err(error) if deadline.elapsed() >= Duration::from_secs(1) => panic!("{error}"),
            Err(_) => thread::sleep(Duration::from_millis(10)),
        }
    }
}
fn main() {
    let root = PathBuf::from(env::var("CLE_RECOVERY_UI_DIRECTORY").unwrap());
    let mode = env::var("CLE_UNIFIED_FIXTURE_MODE").unwrap();
    let d = r#"{"schemaVersion":1,"code":"CC-START-STATE-001","stage":"Recovery fixture stage","summary":"Codex startup conflict fixture","reason":"REASON","guidance":"Copy this fixture report. No actual Codex was started or closed."}"#;
    let original = d.replace("REASON", "ORIGINAL_CONFLICT_EVIDENCE");
    let base = format!(
        r#"{{"schema":1,"requestId":"fixture-core-123","phase":"__PHASE__","diagnostic":{d},"original":{original},"history":["ORIGINAL_CONFLICT_EVIDENCE","old exit is not success"],"oldExited":__OLD__,"relaunchStartedMs":__START_MS__}}"#
    );
    if mode == "checking" {
        phase(
            &root,
            &base,
            "checking",
            "Internal inspection; no prompt yet",
            false,
        );
        let deadline = std::time::Instant::now();
        while !root.join("allow-consent").exists() {
            assert!(
                deadline.elapsed() < Duration::from_secs(25),
                "Consent test gate timed out"
            );
            thread::sleep(Duration::from_millis(30));
        }
    }
    phase(
        &root,
        &base,
        "awaiting-consent",
        "Choose explicit recovery or cancel",
        false,
    );
    let stop = std::time::Instant::now();
    while !root.join("action.json").exists() {
        if stop.elapsed() > Duration::from_secs(25) {
            std::process::exit(3);
        }
        thread::sleep(Duration::from_millis(30));
    }
    let decision = fs::read_to_string(root.join("action.json")).unwrap();
    if let Ok(receipt) = env::var("CLE_UNIFIED_FIXTURE_RECEIPT") {
        fs::write(receipt, &decision).unwrap();
    }
    if decision.contains("cancel") {
        phase(&root, &base, "cancelled", "Cancelled without close", false);
        return;
    }
    phase(&root, &base, "closing", "Closing disposable fixture", false);
    let deadline = std::time::Instant::now();
    while !root.join("continue-recovery").exists() {
        assert!(
            deadline.elapsed() < Duration::from_secs(25),
            "Background test gate timed out"
        );
        thread::sleep(Duration::from_millis(30));
    }
    phase(
        &root,
        &base,
        "old-exited",
        "Old fixture exited; replacement unverified",
        true,
    );
    thread::sleep(Duration::from_millis(300));
    if mode == "delayed-ready" {
        phase(
            &root,
            &base,
            "verifying",
            "Aged pending state; launch continues",
            true,
        );
        fs::write(root.join("delayed-pending"), b"pending").unwrap();
        let deadline = std::time::Instant::now();
        while !root.join("release-delayed-ready").exists() {
            assert!(
                deadline.elapsed() < Duration::from_secs(25),
                "Delayed readiness test gate timed out"
            );
            thread::sleep(Duration::from_millis(30));
        }
    }
    if mode == "no-instance" {
        return;
    }
    if mode == "failed" {
        phase(
            &root,
            &base,
            "failed",
            "NEW_INSTANCE_NOT_FOUND_EVIDENCE",
            true,
        );
        eprintln!(
            "CODE_CODEX_STARTUP_DIAGNOSTIC={}",
            d.replace("CC-START-STATE-001", "CC-START-PROCESS-015")
                .replace("REASON", "NEW_INSTANCE_NOT_FOUND_EVIDENCE")
        );
        std::process::exit(22);
    }
    phase(
        &root,
        &base,
        "ready",
        "Verified simulated replacement UI and Bridge",
        true,
    );
    thread::sleep(Duration::from_millis(600));
}
