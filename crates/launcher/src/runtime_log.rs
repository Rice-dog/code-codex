//! Bounded, per-launch diagnostics. Logging failure never fails an application operation.
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    fs, io,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: usize = 5 * 1024 * 1024;
const KEEP_RUNS: usize = 10;
static LOG: OnceLock<Mutex<RunLog>> = OnceLock::new();
static WRITER: Mutex<()> = Mutex::new(());

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
}

impl RunLog {
    fn document(&self) -> String {
        let header = json!({"schema":1,"runId":self.id,"version":env!("CARGO_PKG_VERSION"),"startedAt":self.started_at,"droppedEvents":self.dropped,"maxBytes":MAX_BYTES});
        format!(
            "{}\n{}",
            header,
            self.events.iter().cloned().collect::<String>()
        )
    }
    fn push(&mut self, source: &str, action: &str, outcome: &str, details: Value) {
        self.sequence += 1;
        let line = format!(
            "{}\n",
            json!({"sequence":self.sequence,"time":now(),"elapsedMs":self.started.elapsed().as_millis(),"source":source,"action":action,"outcome":outcome,"details":details})
        );
        // Reserve more than the maximum metadata header, retain complete UTF-8 events.
        if line.len() > 32 * 1024 {
            self.dropped += 1;
            self.dirty = true;
            return;
        }
        self.bytes += line.len();
        self.events.push_back(line);
        if self.bytes > MAX_BYTES - 1024 {
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
    let directory = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("CodeCodex/runtime-logs");
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
        storage_error: None,
    };
    if LOG.set(Mutex::new(log)).is_err() {
        return;
    }
    record("launcher", "session", "started", json!({"mode":mode}));
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
            Err(error) => state.storage_error = Some(error.to_string()),
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
    let files = run_files(&log.directory).unwrap_or_default();
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
        json!({"runs":runs,"currentRun":log.id,"storageError":log.storage_error,"maxBytes":MAX_BYTES,"keepRuns":KEEP_RUNS}),
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
    Ok(json!({"text":text,"storageError":log.storage_error}))
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
