//! Bounded, per-launch diagnostics. Logging failure never fails an application operation.
use serde_json::{Value, json};
#[path = "runtime_redaction.rs"]
pub(crate) mod redaction;
use std::{
    collections::VecDeque,
    fs, io,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: usize = 5 * 1024 * 1024;
const KEEP_RUNS: usize = 10;
static OPERATION_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static LOG: OnceLock<Mutex<RunLog>> = OnceLock::new();
static WRITER: Mutex<()> = Mutex::new(());
#[cfg(test)]
thread_local! { static TEST_EVENTS: std::cell::RefCell<Option<Vec<Value>>> = const { std::cell::RefCell::new(None) }; }
#[cfg(test)]
pub(crate) fn capture_test_events() {
    TEST_EVENTS.with(|events| *events.borrow_mut() = Some(Vec::new()));
}
#[cfg(test)]
pub(crate) fn take_test_events() -> Vec<Value> {
    TEST_EVENTS.with(|events| events.borrow_mut().take().unwrap_or_default())
}

/// A bounded operation timeline. Dropped async work is visible without pretending it succeeded.
pub(crate) struct Operation {
    source: &'static str,
    action: String,
    id: u64,
    started: Instant,
    finished: bool,
}
impl Operation {
    pub(crate) fn start(source: &'static str, action: impl Into<String>, details: Value) -> Self {
        let op = Self {
            source,
            action: action.into(),
            id: OPERATION_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1,
            started: Instant::now(),
            finished: false,
        };
        op.event(&op.action, "started", details);
        op
    }
    pub(crate) fn id(&self) -> u64 {
        self.id
    }
    pub(crate) fn event(&self, phase: &str, outcome: &str, mut details: Value) {
        if !details.is_object() {
            details = json!({});
        }
        details["operationId"] = json!(self.id);
        details["durationMs"] = json!(self.started.elapsed().as_millis());
        record(self.source, phase, outcome, details);
    }
    pub(crate) fn finish(&mut self, outcome: &str, details: Value) {
        if self.finished {
            return;
        }
        self.event(&self.action, outcome, details);
        self.finished = true;
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        if !self.finished {
            self.finish("interrupted", json!({"reason":"Operation ended without a result (future dropped, cancellation or unwind)."}));
        }
    }
}

struct RunLog {
    directory: PathBuf,
    id: String,
    started: Instant,
    started_at: u128,
    sequence: u64,
    dropped: u64,
    events: VecDeque<String>,
    bytes: usize,
    dirty: bool,
    storage_error: Option<String>,
    failure_total: u64,
    failure_counts: std::collections::BTreeMap<String, u64>,
    oversized_events: u64,
}

impl RunLog {
    fn document(&self) -> String {
        let header = json!({"schema":1,"runId":self.id,"version":env!("CARGO_PKG_VERSION"),"startedAt":self.started_at,"droppedEvents":self.dropped,"maxBytes":MAX_BYTES,"redactionPolicy":1,"faultSchema":2,"failureTotal":self.failure_total,"failureCounts":self.failure_counts,"oversizedEvents":self.oversized_events,"failureSummaryScope":"entire run including trimmed events; detailed events are retained only within limits"});
        format!(
            "{}\n{}",
            header,
            self.events.iter().cloned().collect::<String>()
        )
    }
    fn push(&mut self, source: &str, action: &str, outcome: &str, details: Value) {
        self.sequence += 1;
        let mut details = redaction::value(crate::fault_diagnostics::enrich(
            source, action, outcome, details,
        ));
        if crate::fault_diagnostics::is_failure(outcome) {
            self.failure_total += 1;
            let group = format!(
                "{}:{}",
                details["fault"]["domain"].as_str().unwrap_or("other"),
                details["fault"]["classification"]
                    .as_str()
                    .unwrap_or("unclassified")
            );
            *self.failure_counts.entry(group).or_default() += 1;
        }
        let original_bytes = details.to_string().len();
        if original_bytes > 28 * 1024 {
            self.oversized_events += 1;
            // Retain the failed step and its most useful evidence instead of dropping the whole event.
            let mut compact = json!({"detailsOmitted":true,"originalDetailBytes":original_bytes});
            for key in [
                "fault",
                "operationId",
                "requestRef",
                "durationMs",
                "errorCode",
                "code",
                "reason",
                "message",
                "errorChain",
                "ioKind",
                "osErrorCode",
                "osCode",
                "attempt",
                "phase",
                "observedAt",
            ] {
                if let Some(value) = details.get(key) {
                    compact[key] = match value {
                        Value::String(value) => json!(value.chars().take(2000).collect::<String>()),
                        Value::Array(values) => json!(
                            values
                                .iter()
                                .take(4)
                                .map(|v| v.to_string().chars().take(1000).collect::<String>())
                                .collect::<Vec<_>>()
                        ),
                        _ => value.clone(),
                    };
                }
            }
            details = compact;
        }
        let line = format!(
            "{}\n",
            json!({"sequence":self.sequence,"time":now(),"elapsedMs":self.started.elapsed().as_millis(),"source":redaction::text(source),"action":redaction::text(action),"outcome":redaction::text(outcome),"details":details})
        );
        // Reserve more than the maximum metadata header, retain complete UTF-8 events.
        if line.len() > 32 * 1024 {
            self.dropped += 1;
            self.dirty = true;
            return;
        }
        self.bytes += line.len();
        self.events.push_back(line);
        if self.bytes > MAX_BYTES - 16 * 1024 {
            // Remove an oldest batch, avoiding rewriting the entire file on every new event.
            while self.bytes > MAX_BYTES * 4 / 5 {
                if let Some(old) = self.events.pop_front() {
                    self.bytes -= old.len();
                    self.dropped += 1;
                } else {
                    break;
                }
            }
        }
        self.dirty = true;
    }
    #[cfg(test)]
    fn persist(&mut self) -> io::Result<()> {
        if !self.dirty {
            return Ok(());
        }
        fs::create_dir_all(&self.directory)?;
        let target = self.directory.join(format!("{}.jsonl", self.id));
        let temporary = self.directory.join(format!("{}.tmp", self.id));
        fs::write(&temporary, self.document())?;
        replace(&temporary, &target)?;
        trim_runs(&self.directory, &self.id)?;
        self.dirty = false;
        self.storage_error = None;
        Ok(())
    }
}

#[cfg(windows)]
fn replace(from: &std::path::Path, to: &std::path::Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };
    let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            a.as_ptr(),
            b.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
#[cfg(not(windows))]
fn replace(from: &std::path::Path, to: &std::path::Path) -> io::Result<()> {
    fs::rename(from, to)
}

fn now() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 80 && id.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}
fn run_files(directory: &std::path::Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && entry.path().extension().is_some_and(|e| e == "jsonl")
            && entry
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(valid_id)
        {
            files.push(entry.path());
        }
    }
    files.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    Ok(files)
}
fn trim_runs(directory: &std::path::Path, current: &str) -> io::Result<()> {
    let files = run_files(directory)?;
    let mut kept = 1;
    for path in files {
        if path.file_stem().and_then(|s| s.to_str()) == Some(current) {
            continue;
        }
        if kept < KEEP_RUNS {
            kept += 1;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

pub fn begin(mode: &str) {
    let location = workspace_service::application_paths::log_root("runtime");
    let location_error = location.as_ref().err().map(ToString::to_string);
    let directory =
        location.unwrap_or_else(|_| std::env::temp_dir().join("CodeCodex-emergency-runtime"));
    let started_at = now();
    let log = RunLog {
        directory,
        id: format!("{started_at:013}-{}", std::process::id()),
        started: Instant::now(),
        started_at,
        sequence: 0,
        dropped: 0,
        events: VecDeque::new(),
        bytes: 0,
        dirty: true,
        storage_error: location_error,
        failure_total: 0,
        failure_counts: Default::default(),
        oversized_events: 0,
    };
    if LOG.set(Mutex::new(log)).is_err() {
        return;
    }
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("Non-string panic payload");
        record(
            "launcher",
            "panic",
            "failed",
            json!({"reason":message,"line":info.location().map(|l|l.line()),"column":info.location().map(|l|l.column()),"unwindOutcome":"not known","externalCrashDump":"not captured"}),
        );
        flush();
        previous_hook(info);
    }));
    cdp_client::set_diagnostic_observer(record);
    workspace_service::set_diagnostic_observer(record);
    context_resolver::set_diagnostic_observer(record);
    record("launcher", "session", "started", json!({"mode":mode}));
    record(
        "storage",
        "location contract",
        "observed",
        json!({"centralized":workspace_service::application_paths::install_root().ok().flatten().is_some(),"layoutSchema":1,"runRetention":10,"maxRunBytes":MAX_BYTES,"settings":"data/settings.json","plugins":"plugins/<category>/<id>/<version>","runtimeLogs":"logs/runtime","diagnostics":"logs/diagnostics","legacyCopyRetained":true}),
    );
    record(
        "diagnostics",
        "environment",
        "observed",
        crate::support_checks::environment(),
    );
    flush();
    let _ = std::thread::Builder::new()
        .name("runtime-log-writer".into())
        .spawn(|| {
            loop {
                std::thread::sleep(Duration::from_secs(1));
                flush();
            }
        });
}
pub fn record(source: &str, action: &str, outcome: &str, details: Value) {
    #[cfg(test)]
    TEST_EVENTS.with(|events| { if let Some(events)=events.borrow_mut().as_mut() {events.push(json!({"source":source,"action":action,"outcome":outcome,"details":redaction::value(details.clone())}));} });
    if let Some(log) = LOG.get()
        && let Ok(mut log) = log.lock()
    {
        log.push(source, action, outcome, details);
    }
}
pub fn flush() {
    let Ok(_writer) = WRITER.try_lock() else {
        return;
    };
    let Some(log) = LOG.get() else {
        return;
    };
    let snapshot = match log.lock() {
        Ok(state) if state.dirty => (
            state.directory.clone(),
            state.id.clone(),
            state.sequence,
            state.dropped,
            state.document(),
        ),
        _ => return,
    };
    // Disk access never holds the event mutex or blocks recording/application operations.
    let result = (|| -> io::Result<()> {
        fs::create_dir_all(&snapshot.0)?;
        let temporary = snapshot.0.join(format!("{}.tmp", snapshot.1));
        let target = snapshot.0.join(format!("{}.jsonl", snapshot.1));
        fs::write(&temporary, &snapshot.4)?;
        replace(&temporary, &target)?;
        trim_runs(&snapshot.0, &snapshot.1)
    })();
    if let Ok(mut state) = log.lock() {
        match result {
            Ok(()) => {
                state.storage_error = None;
                if state.sequence == snapshot.2 && state.dropped == snapshot.3 {
                    state.dirty = false;
                }
            }
            Err(error) => state.storage_error = Some(redaction::text(&error.to_string())),
        }
    }
}
pub fn list() -> Result<Value, String> {
    flush();
    let log = LOG
        .get()
        .ok_or("Runtime logging has not started")?
        .lock()
        .map_err(|_| "Runtime log lock failed")?;
    let (files, directory_error) = match run_files(&log.directory) {
        Ok(files) => (files, None),
        Err(error) => (
            Vec::new(),
            Some(
                json!({"kind":format!("{:?}",error.kind()),"osCode":error.raw_os_error(),"reason":redaction::text(&error.to_string())}),
            ),
        ),
    };
    let mut runs: Vec<Value> = files
        .into_iter()
        .take(KEEP_RUNS)
        .filter_map(|path| {
            let id = path.file_stem()?.to_str()?.to_owned();
            Some(json!({"id":id,"bytes":fs::metadata(&path).ok()?.len(),"current":id==log.id}))
        })
        .collect();
    if !runs.iter().any(|run| run["id"] == log.id) {
        runs.insert(
            0,
            json!({"id":log.id,"bytes":log.document().len(),"current":true}),
        );
        runs.truncate(KEEP_RUNS);
    }
    Ok(
        json!({"runs":runs,"currentRun":log.id,"storageError":log.storage_error,"maxBytes":MAX_BYTES,"keepRuns":KEEP_RUNS,"directoryError":directory_error}),
    )
}
pub fn read(id: &str) -> Result<Value, String> {
    if !valid_id(id) {
        return Err("Invalid run ID".into());
    }
    flush();
    let log = LOG
        .get()
        .ok_or("Runtime logging has not started")?
        .lock()
        .map_err(|_| "Runtime log lock failed")?;
    let text = if id == log.id {
        log.document()
    } else {
        let path = log.directory.join(format!("{id}.jsonl"));
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_BYTES as u64
        {
            return Err("Invalid or oversized runtime log".into());
        }
        fs::read_to_string(path).map_err(|e| e.to_string())?
    };
    Ok(json!({"text":redaction::document(&text),"storageError":log.storage_error}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operation_terminal_events_are_correlated_and_dropped_futures_are_visible() {
        capture_test_events();
        let mut operation = Operation::start("test", "download", json!({"expectedBytes":10}));
        let id = operation.id();
        operation.event("verify", "passed", json!({"receivedBytes":10}));
        operation.finish("passed", json!({}));
        operation.finish("failed", json!({}));
        drop(operation);
        drop(Operation::start("test", "aborted", json!({})));
        let events = take_test_events();
        assert_eq!(events.len(), 5);
        assert_eq!(events[0]["details"]["operationId"], id);
        assert_eq!(events[2]["details"]["operationId"], id);
        assert_eq!(events[2]["outcome"], "passed");
        assert_eq!(events[4]["outcome"], "interrupted");
    }
    fn fixture(directory: PathBuf) -> RunLog {
        RunLog {
            directory,
            id: "0000000001000-1".into(),
            started: Instant::now(),
            started_at: 1000,
            sequence: 0,
            dropped: 0,
            events: VecDeque::new(),
            bytes: 0,
            dirty: true,
            storage_error: None,
            failure_total: 0,
            failure_counts: Default::default(),
            oversized_events: 0,
        }
    }
    #[test]
    fn trims_oldest_complete_events_under_five_mb() {
        let mut log = fixture(PathBuf::new());
        for i in 0..3000 {
            log.push(
                "test",
                "event",
                "passed",
                json!({"n":i,"unicode":"中文".repeat(500)}),
            );
        }
        assert!(log.document().len() <= MAX_BYTES);
        assert!(log.dropped > 0);
        let lines: Vec<Value> = log
            .document()
            .lines()
            .map(|s| serde_json::from_str(s).unwrap())
            .collect();
        assert_eq!(lines.last().unwrap()["details"]["n"], 2999);
        assert!(lines[1]["details"]["n"].as_u64().unwrap() > 0);
    }
    #[test]
    fn failure_summary_survives_trimming_and_oversized_errors_keep_core_evidence() {
        let mut log = fixture(PathBuf::new());
        log.push("plugin","download","failed",json!({"code":"PLUGIN_NETWORK","reason":"original failure","errorChain":["transport","inner"],"extra":vec!["x".repeat(3999);100]}));
        let document = log.document();
        let lines: Vec<Value> = document
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(lines[0]["oversizedEvents"], 1);
        assert_eq!(lines[1]["details"]["code"], "PLUGIN_NETWORK");
        assert_eq!(lines[1]["details"]["detailsOmitted"], true);
        assert_eq!(lines[1]["details"]["fault"]["classification"], "transport");
        for i in 0..1800 {
            log.push(
                "test",
                "fill",
                "passed",
                json!({"i":i,"large":"x".repeat(3900)}),
            );
        }
        assert!(log.dropped > 0);
        assert_eq!(log.failure_total, 1);
        assert!(log.document().len() <= MAX_BYTES);
        let header: Value = serde_json::from_str(log.document().lines().next().unwrap()).unwrap();
        assert_eq!(header["failureCounts"]["plugin:transport"], 1);
    }
    #[test]
    fn persists_restarts_and_keeps_ten_runs() {
        let directory = std::env::temp_dir().join(format!(
            "cc-runtime-log-test-{}-{}",
            std::process::id(),
            now()
        ));
        fs::create_dir_all(&directory).unwrap();
        for i in 0..15 {
            fs::write(directory.join(format!("{i:013}-2.jsonl")), "{}\n").unwrap();
        }
        let mut log = fixture(directory.clone());
        log.push("test", "saved", "passed", json!({}));
        log.persist().unwrap();
        assert_eq!(run_files(&directory).unwrap().len(), 10);
        let text = fs::read_to_string(directory.join("0000000001000-1.jsonl")).unwrap();
        assert!(text.contains("saved"));
        assert!(!valid_id("../other"));
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn persisted_events_are_redacted_and_retain_error_codes() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = fixture(directory.path().to_path_buf());
        log.push(
            "launcher",
            "import",
            "failed",
            json!({
                "code":"TIMEOUT", "port":7613, "attempt":1,
                "authorization":"Bearer SENTINEL_AUTH", "prompt":"SENTINEL_CHAT",
                "nested":[{"message":"EIO at C:\\Users\\SENTINEL_USER\\file"}]
            }),
        );
        log.persist().unwrap();
        let disk = fs::read_to_string(directory.path().join("0000000001000-1.jsonl")).unwrap();
        assert!(!disk.contains("SENTINEL"));
        assert!(disk.contains("redactionPolicy"));
        let event: Value = serde_json::from_str(disk.lines().nth(1).unwrap()).unwrap();
        assert_eq!(event["details"]["code"], "TIMEOUT");
        assert_eq!(event["details"]["port"], 7613);
        assert_eq!(event["sequence"], 1);
    }
}
