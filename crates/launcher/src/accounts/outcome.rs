//! Bounded, read-only evidence of the last turn. Never infers tool success.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{fs::File, io::{Read, Seek, SeekFrom}, path::Path};

const TAIL_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Execution {
    pub offset: u64,
    pub turn_id: Option<String>,
    pub terminal: Option<String>,
}

pub(super) fn turn_id(value: &Value) -> Option<String> {
    value.as_str().filter(|s| !s.is_empty() && s.len() <= 128 && s.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_:".contains(&c))).map(str::to_owned)
}
pub(super) fn terminal(status: &str) -> bool { matches!(status, "completed" | "failed" | "interrupted") }

pub(super) struct Evidence {
    pub outcome: &'static str,
    pub reason: &'static str,
    pub turn_id: Option<String>,
    bytes: usize,
    offset: u64,
}
impl Evidence {
    fn unknown(reason: &'static str, execution: Option<&Execution>) -> Self {
        Self { outcome: "unverified", reason, turn_id: execution.and_then(|e| e.turn_id.clone()), bytes: 0, offset: 0 }
    }
    pub fn projection(&self) -> Value {
        json!({"previousOutcome":self.outcome,"outcomeReason":self.reason,"previousTurnId":self.turn_id,
            "outcomeEvidence":{"source":if self.reason=="persisted-native-terminal"{"persisted-native-event"}else{"official-journal"},"bytesRead":self.bytes,"tailOffset":self.offset,"limitBytes":TAIL_BYTES},
            "outcomeKey":format!("{}:{}:{}:{}",self.offset,self.bytes,self.turn_id.as_deref().unwrap_or("none"),self.reason)})
    }
}

/// Caller must first verify owner, history identity/path and executor exit.
/// A clipped/malformed tail remains unknown; it never causes a full-history read.
pub(super) fn observe(path: &Path, execution: Option<&Execution>, active_recorded: bool) -> Evidence {
    let inspect = || -> std::io::Result<Evidence> {
        let mut file = File::open(path)?;
        let before = file.metadata()?;
        let offset = before.len().saturating_sub(TAIL_BYTES);
        file.seek(SeekFrom::Start(offset))?;
        let mut bytes = Vec::new();
        (&mut file).take(TAIL_BYTES + 1).read_to_end(&mut bytes)?;
        let after = file.metadata()?;
        if before.len() != after.len() || before.modified()? != after.modified()? || bytes.len() as u64 > TAIL_BYTES {
            return Ok(Evidence::unknown("journal-changing", execution));
        }
        let mut result = classify(&bytes, offset, execution, active_recorded);
        result.bytes = bytes.len(); result.offset = offset;
        Ok(result)
    };
    inspect().unwrap_or_else(|_| Evidence::unknown("journal-read-unavailable", execution))
}

fn classify(bytes: &[u8], offset: u64, execution: Option<&Execution>, active_recorded: bool) -> Evidence {
    let unknown = |reason| Evidence::unknown(reason, execution);
    if !bytes.is_empty() && bytes.last() != Some(&b'\n') { return unknown("journal-incomplete-record"); }
    if execution.is_some_and(|e| e.offset > offset + bytes.len() as u64) { return unknown("journal-truncated"); }
    let mut position = offset;
    let mut latest: Option<(String, &'static str)> = None;
    let mut saw_start = false;
    let mut newer_user_input = false;
    for (index, line) in bytes.split_inclusive(|b| *b == b'\n').enumerate() {
        let start = position; position += line.len() as u64;
        // The first record may start before this bounded window.
        if index == 0 && offset != 0 { continue; }
        if execution.is_some_and(|e| start < e.offset) { continue; }
        if line.iter().all(u8::is_ascii_whitespace) { continue; }
        let Ok(record) = serde_json::from_slice::<Value>(line) else { return unknown("journal-invalid-record"); };
        let payload = &record["payload"];
        if record["type"] == "response_item" && payload["type"] == "message" && payload["role"] == "user" {
            // Official journals put the current input AFTER task_started.
            // It is new unmatched work only when no open turn owns it.
            if latest.as_ref().is_none_or(|(_,status)|*status!="unverified") { newer_user_input = true; }
        }
        if record["type"] != "event_msg" { continue; }
        let event = payload["type"].as_str().unwrap_or("");
        if !matches!(event, "task_started" | "task_complete" | "turn_aborted") { continue; }
        let Some(id) = turn_id(&payload["turn_id"]) else { return unknown("journal-turn-id-missing"); };
        if event == "task_started" {
            latest = Some((id, "unverified")); newer_user_input = false; saw_start = true;
        } else {
            if newer_user_input { return unknown("newer-input-without-terminal"); }
            if latest.as_ref().is_some_and(|(started, _)| started != &id) { return unknown("journal-terminal-mismatch"); }
            latest = Some((id, if event == "task_complete" { "completed" } else { "interrupted" }));
            newer_user_input = false;
        }
    }
    if newer_user_input { return unknown("newer-input-without-terminal"); }
    if let Some((id, outcome)) = latest {
        if execution.is_some_and(|e|e.turn_id.is_none()) && !saw_start { return unknown("pending-send-without-matching-start"); }
        if execution.and_then(|e| e.turn_id.as_ref()).is_some_and(|expected| expected != &id) { return unknown("execution-turn-mismatch"); }
        let persisted=execution.filter(|e|!active_recorded&&e.turn_id.as_ref()==Some(&id)).and_then(|e|e.terminal.as_deref()).filter(|s|terminal(s));
        if outcome == "unverified" {
            if let Some(status)=persisted {
                return Evidence { outcome:match status {"failed"=>"failed","interrupted"=>"interrupted",_=>"completed"},reason:"persisted-native-terminal",turn_id:Some(id),bytes:0,offset:0 };
            }
            return Evidence { turn_id: Some(id), ..unknown("turn-without-terminal") };
        }
        // A pre-send checkpoint with no accepted turn ID must match an observed start.
        // Its offset already excludes every earlier completed turn.
        let outcome=execution.filter(|e|!active_recorded&&e.turn_id.as_ref()==Some(&id)).and_then(|e|e.terminal.as_deref()).filter(|s|terminal(s)).map(|s|match s{"failed"=>"failed","interrupted"=>"interrupted",_=>"completed"}).unwrap_or(outcome);
        return Evidence { outcome, reason: "matching-journal-terminal", turn_id: Some(id), bytes: 0, offset: 0 };
    }
    if let Some(e) = execution {
        // A matched native terminal was persisted when the event stream consumed it.
        // It is useful when a large later record clipped the start/terminal out of the tail.
        if !active_recorded && e.turn_id.is_some() && e.terminal.as_deref().is_some_and(terminal) {
            return Evidence { outcome: match e.terminal.as_deref() { Some("completed") => "completed", Some("failed") => "failed", _ => "interrupted" },
                reason: "persisted-native-terminal", turn_id: e.turn_id.clone(), bytes: 0, offset: 0 };
        }
        return unknown("execution-without-terminal");
    }
    if offset == 0 && !active_recorded { return Evidence { outcome: "idle", reason: "no-recorded-turn", turn_id: None, bytes: 0, offset: 0 }; }
    unknown("terminal-outside-observation-window")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn lines(records: &[Value]) -> Vec<u8> { records.iter().map(|v| format!("{v}\n")).collect::<String>().into_bytes() }
    fn event(kind: &str, id: &str) -> Value { json!({"type":"event_msg","payload":{"type":kind,"turn_id":id}}) }
    #[test] fn normal_restart_recognizes_terminal_without_claiming_tool_success() {
        for (kind, status) in [("task_complete", "completed"), ("turn_aborted", "interrupted")] {
            let b = lines(&[event("task_started","A"),event(kind,"A")]);
            assert_eq!(classify(&b,0,None,true).outcome,status);
        }
    }
    #[test] fn older_completion_does_not_hide_new_or_unmatched_work() {
        let b=lines(&[event("task_complete","A"),event("task_started","B")]);
        assert_eq!(classify(&b,0,None,true).reason,"turn-without-terminal");
        let b=lines(&[event("task_started","B"),event("task_complete","A")]);
        assert_eq!(classify(&b,0,None,true).reason,"journal-terminal-mismatch");
        let b=lines(&[event("task_complete","A"),json!({"type":"response_item","payload":{"type":"message","role":"user","content":[]}})]);
        assert_eq!(classify(&b,0,None,false).outcome,"unverified");
        let b=lines(&[event("task_complete","A"),json!({"type":"response_item","payload":{"type":"message","role":"user","content":[]}}),event("task_complete","A")]);
        assert_eq!(classify(&b,0,None,false).reason,"newer-input-without-terminal");
        let b=lines(&[event("task_started","A"),json!({"type":"response_item","payload":{"type":"message","role":"user","content":[]}}),event("task_complete","A")]);
        assert_eq!(classify(&b,0,None,false).outcome,"completed");
    }
    #[test] fn persisted_pending_start_cannot_reuse_an_old_completion() {
        let b=lines(&[event("task_complete","A")]);
        let pending=Execution{offset:b.len() as u64,turn_id:None,terminal:None};
        assert_eq!(classify(&b,0,Some(&pending),false).outcome,"unverified");
        let b=lines(&[event("task_started","B"),event("task_complete","B")]);
        let mismatch=Execution{offset:0,turn_id:Some("A".into()),terminal:None};
        assert_eq!(classify(&b,0,Some(&mismatch),false).reason,"execution-turn-mismatch");
    }
    #[test] fn malformed_partial_or_truncated_records_remain_unknown() {
        let mut b=lines(&[event("task_complete","A")]);b.pop();
        assert_eq!(classify(&b,0,None,false).reason,"journal-incomplete-record");
        assert_eq!(classify(b"bad\n",0,None,false).reason,"journal-invalid-record");
        let e=Execution{offset:99,turn_id:None,terminal:None};
        assert_eq!(classify(b"",0,Some(&e),false).reason,"journal-truncated");
        assert_eq!(classify(b"",0,None,false).outcome,"idle");
        assert_eq!(classify(b"",0,None,true).outcome,"unverified");
    }
    #[test] fn persisted_terminal_is_used_only_without_newer_work_or_active_record() {
        let e=Execution{offset:0,turn_id:Some("A".into()),terminal:Some("failed".into())};
        assert_eq!(classify(b"",0,Some(&e),false).outcome,"failed");
        assert_eq!(classify(b"",0,Some(&e),true).outcome,"unverified");
        assert_eq!(classify(&lines(&[event("task_started","B")]),0,Some(&e),false).outcome,"unverified");
        assert_eq!(classify(&lines(&[event("task_started","A")]),0,Some(&e),false).outcome,"failed");
        assert_eq!(classify(&lines(&[event("task_started","A")]),0,Some(&e),true).outcome,"unverified");
    }
    #[test] fn pending_delivery_and_terminal_failure_keep_their_exact_evidence() {
        let pending=Execution{offset:0,turn_id:None,terminal:None};
        assert_eq!(classify(&lines(&[event("task_complete","A")]),0,Some(&pending),true).reason,"pending-send-without-matching-start");
        assert_eq!(classify(&lines(&[event("task_started","B"),event("task_complete","B")]),0,Some(&pending),true).outcome,"completed");
        let failed=Execution{offset:0,turn_id:Some("A".into()),terminal:Some("failed".into())};
        assert_eq!(classify(&lines(&[event("task_complete","A")]),0,Some(&failed),false).outcome,"failed");
    }
    #[test] fn old_binding_schema_remains_compatible_and_read_errors_are_diagnostic() {
        let old:super::super::shared::Binding=serde_json::from_value(json!({"path":"history","workspace":"project","connection":"host"})).unwrap();
        assert!(old.execution.is_none());
        assert_eq!(observe(Path::new("nonexistent-outcome-fixture"),None,false).reason,"journal-read-unavailable");
    }
    #[test] fn large_journal_read_is_bounded_and_does_not_export_content() {
        use std::io::Write;
        let mut f=tempfile::NamedTempFile::new().unwrap();
        f.as_file_mut().set_len(TAIL_BYTES*2).unwrap();
        f.as_file_mut().seek(SeekFrom::End(0)).unwrap();
        f.write_all(&lines(&[event("task_started","B"),event("task_complete","B")])).unwrap();
        let e=observe(f.path(),None,true);
        assert_eq!(e.outcome,"completed");assert!(e.bytes as u64<=TAIL_BYTES);assert!(e.offset>0);
        assert!(!e.projection().to_string().contains("payload"));
    }
    #[test]
    #[ignore = "Explicit read-only maintenance observation of a verified official history; no inference or changes."]
    fn read_verified_official_journal_tail() {
        let path=std::path::PathBuf::from(std::env::var("CODE_CODEX_OUTCOME_TEST_HISTORY").expect("Explicit history required"));
        let id=std::env::var("CODE_CODEX_OUTCOME_TEST_THREAD").expect("Explicit thread required");
        let home=std::fs::canonicalize(std::env::var("CODE_CODEX_OUTCOME_TEST_HOME").expect("Explicit official history root required")).unwrap();
        let path=super::super::shared::verify_path(&home,&path,&id).unwrap();
        let evidence=observe(&path,None,false);
        assert!(evidence.bytes as u64<=TAIL_BYTES);
        println!("{}",evidence.projection());
    }
}
