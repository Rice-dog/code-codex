//! Rebuild failed history only after exact reasoning rejection evidence.
//! The source archive and upstream response remain untouched. Never retries a turn.
use super::{AccountError, Result};
use serde_json::Value;
use std::{collections::{HashMap, HashSet}, io::{Read, Seek, SeekFrom}, path::Path, sync::Arc};

const WINDOW: u64 = 32 * 1024 * 1024;
#[derive(Default)]
pub(super) struct Recovery {
    rejected: HashSet<String>,
    sent: Arc<HashMap<String, String>>,
    historical_removed: usize,
}

fn item_id(value: &Value) -> Option<&str> {
    let error = value.get("error").or_else(||value.get("response").and_then(|v|v.get("error"))).unwrap_or(value);
    if !matches!(error["code"].as_str(), Some("invalid_encrypted_content" | "encrypted_content_invalid")) { return None; }
    super::relay_diagnostics::encrypted_item(error)
}
fn archived_rejection(row: &Value) -> Option<String> {
    if row["type"] != "event_msg" || row["payload"]["type"] != "task_complete" { return None; }
    let text = row["payload"]["error"]["message"].as_str()?;
    let text = text.strip_prefix("Error running remote compact task: ").unwrap_or(text);
    let error: Value = serde_json::from_str(text).ok()?;
    item_id(&error).map(str::to_owned)
}
fn rows(path: &Path, budget: u64) -> Result<Vec<Value>> {
    let fail = ||AccountError::new("ACCOUNT_CONTEXT_RECOVERY", "ACCOUNT_CONTEXT_RECOVERY: Rejected reasoning evidence could not be read; original archive unchanged; no upstream request sent.");
    let mut file = std::fs::File::open(path).map_err(|_|fail())?;
    let size = file.metadata().map_err(|_|fail())?.len();
    let start = size.saturating_sub(budget);
    file.seek(SeekFrom::Start(start)).map_err(|_|fail())?;
    let mut bytes = Vec::new(); file.take(size-start).read_to_end(&mut bytes).map_err(|_|fail())?;
    let skip = if start > 0 {bytes.iter().position(|b|*b==b'\n').map(|n|n+1).unwrap_or(bytes.len())} else {0};
    let end = bytes.iter().rposition(|b|*b==b'\n').map(|n|n+1).unwrap_or(skip);
    bytes[skip..end].split(|b|*b==b'\n').filter(|l|!l.is_empty()).map(|l|serde_json::from_slice(l).map_err(|_|fail())).collect()
}
impl Recovery {
    pub fn load(home: &Path, path: &Path, thread: &str) -> Result<Self> {
        let path = super::shared::verify_path(home, path, thread)?;
        if rows(&path, 1024*1024)?.iter().any(|r|archived_rejection(r).is_some()) {Self::open(&path)} else {Ok(Self::default())}
    }
    pub fn has_rejections(&self)->bool {!self.rejected.is_empty()}
    pub fn open(path: &Path) -> Result<Self> {
        let rows = rows(path, WINDOW)?;
        let ids: HashSet<String> = rows.iter().filter_map(archived_rejection).take(256).collect();
        let mut result = Self::default();
        for row in &rows {
            if row["type"] == "response_item" {
                let item = &row["payload"];
                if item["type"] == "reasoning" && item["id"].as_str().is_some_and(|id|ids.contains(id)) {
                    if let Some(cipher) = item["encrypted_content"].as_str() {result.rejected.insert(super::relay_diagnostics::fingerprint(cipher));}
                }
            }
        }
        Ok(result)
    }
    pub fn project(&mut self, request: &mut Value) -> usize {
        self.historical_removed=0;
        let Some(input) = request["input"].as_array_mut() else {return 0;};
        // Ordinary history needs only the sent-id map for response attribution.
        self.sent=Arc::new(HashMap::new());
        if self.rejected.is_empty(){
            for item in input.iter().filter(|v|v["type"]=="reasoning") {
                if self.sent.len()>=8192 {break;}
                if let (Some(id),Some(cipher))=(item["id"].as_str(),item["encrypted_content"].as_str()) {Arc::make_mut(&mut self.sent).insert(id.into(),super::relay_diagnostics::fingerprint(cipher));}
            }
            return 0;
        }
        let recovering=input.iter().any(|item|item["type"]=="reasoning"&&item["encrypted_content"].as_str().is_some_and(|cipher|self.rejected.contains(&super::relay_diagnostics::fingerprint(cipher))));
        let anchor=input.iter().rposition(|item|item["role"]=="user"&&matches!(item["type"].as_str(),None|Some("message")));
        let mut removed = 0;
        let mut index=0;
        input.retain(|item| {
            let historical=anchor.is_some_and(|anchor|index<anchor);index+=1;
            if item["type"] != "reasoning" {return true;}
            let Some(cipher) = item["encrypted_content"].as_str() else {return true;};
            let hash = super::relay_diagnostics::fingerprint(cipher);
            if self.rejected.contains(&hash) {removed += 1; return false;}
            // A failed history may contain several incompatible reasoning blocks.
            // Rebuild from its visible task history and native compaction, while
            // retaining active-turn reasoning. This does not label other bytes invalid.
            if recovering&&historical {removed+=1;self.historical_removed+=1;return false;}
            if self.sent.len() < 8192 {
                if let Some(id) = item["id"].as_str() {Arc::make_mut(&mut self.sent).insert(id.into(),hash);}
            }
            true
        });
        if removed > 0 {
            if let Some(object) = request.as_object_mut() {object.remove("previous_response_id");object.remove("prompt_cache_key");}
        }
        removed
    }
    /// Diagnostic ownership only; forwarding and recovery decisions are unchanged.
    pub fn sent_evidence(&self)->Arc<HashMap<String,String>> {self.sent.clone()}
    pub fn historical_removed(&self)->usize {self.historical_removed}
    pub fn observe(&mut self, event: &Value) {
        if let Some(hash) = item_id(event).and_then(|id|self.sent.get(id)) {
            if self.rejected.len() < 256 {self.rejected.insert(hash.clone());}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const ID: &str = "rs_0123456789abcdef";
    fn error() -> Value {json!({"error":{"code":"invalid_encrypted_content","message":format!("The encrypted content for item {ID} could not be verified. Reason: Encrypted content could not be decrypted or parsed.")}})}
    fn request() -> Value {json!({"previous_response_id":"old","prompt_cache_key":"old-cache","context_management":[{"type":"compaction"}],"input":[{"type":"compaction","encrypted_content":"KEEP_COMPACT"},{"type":"reasoning","id":ID,"encrypted_content":"REJECTED"},{"role":"user","content":"Keep my task"},{"type":"reasoning","id":"rs_fedcba9876543210","encrypted_content":"GOOD"},{"type":"function_call_output","call_id":"real","output":"REAL_RESULT"}]})}
    #[test]
    fn failed_history_rebuild_omits_multiple_old_reasoning_blocks_but_keeps_active_turn() {
        let mut r=Recovery::default();r.project(&mut request());r.observe(&error());
        let mut next=request();next["input"].as_array_mut().unwrap().insert(1,json!({"type":"reasoning","id":"rs_1111111111111111","encrypted_content":"OTHER_HISTORICAL_BYTES"}));
        assert_eq!(r.project(&mut next),2);assert_eq!(r.historical_removed(),1);
        assert!(next.to_string().contains("KEEP_COMPACT"));assert!(next.to_string().contains("GOOD"));assert!(next.to_string().contains("REAL_RESULT"));assert!(!next.to_string().contains("OTHER_HISTORICAL_BYTES"));
        let mut clean=request();clean["input"].as_array_mut().unwrap().remove(1);let expected=clean.clone();assert_eq!(r.project(&mut clean),0);assert_eq!(clean,expected);
    }
    #[test]
    fn rejection_uses_exact_sent_reasoning_without_retry_or_archive_write() {
        let mut r=Recovery::default();let mut first=request();let original=first.clone();
        assert_eq!(r.project(&mut first),0);assert_eq!(first,original);
        r.observe(&error());let mut next=request();assert_eq!(r.project(&mut next),1);
        assert_eq!(next["input"].as_array().unwrap().len(),4);
        assert!(next.to_string().contains("KEEP_COMPACT"));assert!(next.to_string().contains("REAL_RESULT"));assert!(next.to_string().contains("GOOD"));
        assert!(!next.to_string().contains("REJECTED"));assert!(next.get("previous_response_id").is_none());assert!(next.get("context_management").is_some());
        let mut changed=request();changed["input"][1]["encrypted_content"]=json!("DIFFERENT_BYTES");assert_eq!(r.project(&mut changed),0);
    }
    #[test]
    fn archive_evidence_is_structured_native_failure_not_quoted_tool_text() {
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("source.jsonl");
        let item=json!({"type":"response_item","payload":{"type":"reasoning","id":ID,"encrypted_content":"REJECTED"}});
        let quoted=json!({"type":"response_item","payload":{"type":"function_call_output","output":error().to_string()}});
        std::fs::write(&path,format!("{item}\n{quoted}\n")).unwrap();
        let mut r=Recovery::open(&path).unwrap();assert_eq!(r.project(&mut request()),0);
        let failure=json!({"type":"event_msg","payload":{"type":"task_complete","error":{"message":format!("Error running remote compact task: {}",error())}}});
        std::fs::write(&path,format!("{item}\n{quoted}\n{failure}\n")).unwrap();let bytes=std::fs::read(&path).unwrap();
        let mut r=Recovery::open(&path).unwrap();assert_eq!(r.project(&mut request()),1);assert_eq!(std::fs::read(path).unwrap(),bytes);
    }
    #[test]
    fn unrelated_or_unverified_errors_do_not_quarantine() {
        let mut r=Recovery::default();r.project(&mut request());
        r.observe(&json!({"error":{"code":"invalid_api_key","message":error()["error"]["message"]}}));
        assert_eq!(r.project(&mut request()),0);
        let mut wrong=error();wrong["error"]["message"]=json!("Unverified arbitrary text");r.observe(&wrong);
        assert_eq!(r.project(&mut request()),0);
    }
    #[test]
    fn diagnostic_snapshot_survives_interleaved_projection_without_changing_recovery() {
        let mut r=Recovery::default();let original=request();let mut first=original.clone();
        r.project(&mut first);let evidence=r.sent_evidence();
        assert_eq!(first,original);assert!(Arc::ptr_eq(&evidence,&r.sent_evidence()));
        r.project(&mut json!({"input":[]}));
        assert_eq!(evidence.get(ID),Some(&super::super::relay_diagnostics::fingerprint("REJECTED")));
        assert!(!r.sent_evidence().contains_key(ID));
        r.observe(&error());assert_eq!(r.project(&mut request()),0);
        // This change records the lost association; it does not add a recovery policy.
    }
}
