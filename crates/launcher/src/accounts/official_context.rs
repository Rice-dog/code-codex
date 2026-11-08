//! Restore native official context; route provenance is offsets, never message copies.
use super::{AccountError, Result};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, io::{Read, Seek, SeekFrom}, path::Path};

const WINDOW:u64=32*1024*1024;
pub(super) fn failure(stage:&str)->AccountError {
    AccountError::new("ACCOUNT_OFFICIAL_CONTEXT",format!("ACCOUNT_OFFICIAL_CONTEXT: Native official context could not be restored. stage={stage}; original archive unchanged; no upstream request sent. Verify the conversation before retrying."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::context_handoff::Handoff;
    use std::io::Write;
    fn append(path:&Path,row:Value){writeln!(std::fs::OpenOptions::new().append(true).open(path).unwrap(),"{row}").unwrap();}
    fn item(path:&Path,v:Value){append(path,json!({"type":"response_item","payload":v}));}
    fn fixture(root:&Path)->std::path::PathBuf {
        std::fs::create_dir_all(root.join("sessions")).unwrap();let p=root.join("sessions/rollout-thread-one.jsonl");
        std::fs::write(&p,format!("{}\n",json!({"type":"session_meta","payload":{"id":"thread-one"}}))).unwrap();
        append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":"OFFICIAL_ORIGINAL"}]}}));p
    }
    fn select(root:&Path,path:&Path,api:bool)->Handoff {
        let s=Handoff::for_route(root.into(),path.into(),"thread-one".into(),root,api).unwrap();s.commit().unwrap();s
    }
    fn request(cipher:&str)->Value{json!({"model":"official-choice","prompt_cache_key":"native-cache","context_management":[{"type":"compaction","compact_threshold":20000}],"input":[{"type":"message","role":"developer","content":"CURRENT_PERMISSION"},{"type":"compaction","encrypted_content":cipher},{"type":"message","role":"user","content":"Continue"},{"type":"function_call","call_id":"real","name":"read","arguments":"{}"},{"type":"function_call_output","call_id":"real","output":"REAL_RESULT"}]})}
    #[test] fn official_request_is_exactly_native_and_does_not_call_summary() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());select(t.path(),&p,true);
        item(&p,json!({"type":"message","role":"assistant","content":"API_VISIBLE_PROGRESS"}));
        let mut s=select(t.path(),&p,false);let mut v=request("OFFICIAL_ORIGINAL");let original=v.clone();
        let report=s.project(&mut v).unwrap();assert_eq!(v,original);assert_eq!(report["requestUnchanged"],true);
        let mut delta=json!({"previous_response_id":"official-response","input":[{"type":"function_call_output","call_id":"x","output":"answer"}]});let original=delta.clone();s.project(&mut delta).unwrap();assert_eq!(delta,original);
    }
    #[test] fn foreign_compaction_restores_original_then_new_official_compaction_passes() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());select(t.path(),&p,true);
        item(&p,json!({"type":"message","role":"assistant","content":"API_PROGRESS_FILE_SAVED"}));
        append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":"API_CIPHER"}]}}));
        let mut s=select(t.path(),&p,false);let bytes=std::fs::read(&p).unwrap();let mut v=request("API_CIPHER");
        let report=s.project(&mut v).unwrap();let text=v.to_string();assert_eq!(report["officialCheckpointRestored"],true);
        assert!(text.contains("OFFICIAL_ORIGINAL"));assert!(text.contains("API_PROGRESS_FILE_SAVED"));assert!(text.contains("REAL_RESULT"));assert!(!text.contains("API_CIPHER"));assert!(v.get("context_management").is_some());assert_eq!(std::fs::read(&p).unwrap(),bytes);
        append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":"NEW_OFFICIAL"}]}}));
        let mut v=request("NEW_OFFICIAL");let original=v.clone();assert_eq!(s.project(&mut v).unwrap()["requestUnchanged"],true);assert_eq!(v,original);
    }
    #[test] fn api_reasoning_isolated_without_summarizing_official_history() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());select(t.path(),&p,true);
        item(&p,json!({"type":"reasoning","encrypted_content":"API_REASONING"}));let mut s=select(t.path(),&p,false);
        let mut v=request("OFFICIAL_ORIGINAL");v["input"].as_array_mut().unwrap().insert(2,json!({"type":"reasoning","encrypted_content":"API_REASONING"}));
        assert_eq!(s.project(&mut v).unwrap()["stage"],"foreign-reasoning-isolated");assert_eq!(v["input"],request("OFFICIAL_ORIGINAL")["input"]);assert!(!v.to_string().contains("task_handoff"));
    }
    #[test] fn current_official_stream_state_is_accepted_before_archive_flush() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());select(t.path(),&p,true);let mut s=select(t.path(),&p,false);
        s.observe(&json!({"type":"response.output_item.done","item":{"type":"reasoning","encrypted_content":"LIVE_OFFICIAL"}}));
        let mut v=request("OFFICIAL_ORIGINAL");v["input"].as_array_mut().unwrap().push(json!({"type":"reasoning","encrypted_content":"LIVE_OFFICIAL"}));let original=v.clone();s.project(&mut v).unwrap();assert_eq!(v,original);
    }
    #[test] fn repeated_api_cycles_keep_original_checkpoint_and_new_progress() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());
        for n in 0..3 {
            select(t.path(),&p,true);item(&p,json!({"type":"message","role":"assistant","content":format!("API_PROGRESS_{n}")}));
            let cipher=format!("API_{n}");append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":cipher}]}}));
            let mut s=select(t.path(),&p,false);let mut v=request(&cipher);s.project(&mut v).unwrap();let text=v.to_string();assert!(text.contains("OFFICIAL_ORIGINAL"));assert!(text.contains(&format!("API_PROGRESS_{n}")));assert!(!text.contains(&format!("\"encrypted_content\":\"API_{n}")));
        }
    }
    #[test] fn unknown_cipher_and_corrupt_or_backwards_boundaries_are_explicit() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());select(t.path(),&p,true);let mut s=select(t.path(),&p,false);
        assert!(s.project(&mut request("UNKNOWN")).unwrap_err().message.contains("opaque-provenance-unavailable"));
        assert!(Provenance::plan(Some(json!({"schema":99})),"thread",0,true).is_err());
        let p=Provenance::plan(None,"thread",100,true).unwrap();assert!(Provenance::plan(Some(p.value),"thread",50,false).is_err());
    }
    #[test] fn legacy_migration_keeps_native_without_inventing_old_provenance() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());crate::accounts::context_handoff::enroll(t.path(),"thread-one").unwrap();
        let mut s=select(t.path(),&p,false);let mut v=request("OFFICIAL_ORIGINAL");let original=v.clone();assert_eq!(s.project(&mut v).unwrap()["stage"],"legacy-native-pass-through");assert_eq!(v,original);
        select(t.path(),&p,true);item(&p,json!({"type":"reasoning","encrypted_content":"NEW_API"}));let mut s=select(t.path(),&p,false);
        assert!(s.project(&mut request("OFFICIAL_ORIGINAL")).unwrap_err().message.contains("opaque-provenance-unavailable"));
    }
    #[test] fn legacy_cipher_is_learned_only_after_official_completion() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());crate::accounts::context_handoff::enroll(t.path(),"thread-one").unwrap();
        let mut s=select(t.path(),&p,false);let mut v=request("OFFICIAL_ORIGINAL");s.project(&mut v).unwrap();
        s.observe(&json!({"type":"response.created"}));
        assert!(!std::fs::read_to_string(crate::accounts::context_handoff::marker(t.path(),"thread-one")).unwrap().contains("acceptedOfficial"));
        s.observe(&json!({"type":"response.completed","response":{"status":"completed","output":[]}}));
        select(t.path(),&p,true);item(&p,json!({"type":"reasoning","encrypted_content":"API_ONLY"}));let mut s=select(t.path(),&p,false);
        let mut v=request("OFFICIAL_ORIGINAL");let original=v.clone();s.project(&mut v).unwrap();assert_eq!(v,original);
    }

    #[test] fn newest_official_checkpoint_wins_after_another_api_visit() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());select(t.path(),&p,true);select(t.path(),&p,false);
        append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":"LATEST_OFFICIAL"}]}}));
        select(t.path(),&p,true);item(&p,json!({"type":"message","role":"assistant","content":"LATEST_API_PROGRESS"}));
        append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":"LATEST_API"}]}}));
        let mut s=select(t.path(),&p,false);let mut v=request("LATEST_API");s.project(&mut v).unwrap();let text=v.to_string();assert!(text.contains("LATEST_OFFICIAL"));assert!(!text.contains("OFFICIAL_ORIGINAL"));assert!(text.contains("LATEST_API_PROGRESS"));
    }
    #[test] fn missing_official_replacement_history_blocks_instead_of_silently_summarizing() {
        let t=tempfile::tempdir().unwrap();let p=fixture(t.path());append(&p,json!({"type":"compacted","payload":{"message":"unavailable"}}));select(t.path(),&p,true);
        append(&p,json!({"type":"compacted","payload":{"replacement_history":[{"type":"compaction","encrypted_content":"FOREIGN"}]}}));
        let mut s=select(t.path(),&p,false);let original=std::fs::read(&p).unwrap();assert!(s.project(&mut request("FOREIGN")).unwrap_err().message.contains("official-checkpoint-unavailable"));assert_eq!(std::fs::read(&p).unwrap(),original);
    }

}
#[derive(Clone)]
pub(super) struct Provenance { pub value:Value }
impl Provenance {
    pub fn plan(previous:Option<Value>,thread:&str,offset:u64,api:bool)->Result<Self> {
        let mut value=match previous {
            None=>json!({"schema":2,"threadId":thread,"mode":"route-context-v2","legacyUnknown":false,"transitions":[{"offset":0,"source":"official"}]}),
            Some(v) if v==json!({"schema":1,"threadId":thread,"mode":"task-records-v1"})=>json!({"schema":2,"threadId":thread,"mode":"route-context-v2","legacyUnknown":true,"transitions":[]}),
            Some(v)=>{Self::validate(&v,thread)?;v},
        };
        let source=if api{"api"}else{"official"};
        let transitions=value["transitions"].as_array_mut().unwrap();
        if transitions.last().is_some_and(|v|v["offset"].as_u64().unwrap()>offset){return Err(failure("archive-truncated"));}
        if transitions.last().is_none_or(|v|v["source"]!=source) {
            if transitions.len()>=256{return Err(failure("route-boundary-limit"));}
            transitions.push(json!({"offset":offset,"source":source}));
        }
        Ok(Self{value})
    }
    pub fn validate(v:&Value,thread:&str)->Result<()> {
        if v["schema"]!=2 || v["threadId"]!=thread || v["mode"]!="route-context-v2" || !v["legacyUnknown"].is_boolean(){return Err(failure("route-schema"));}
        let a=v["transitions"].as_array().filter(|a|!a.is_empty()&&a.len()<=256).ok_or_else(||failure("route-boundaries"))?;
        if let Some(h)=v.get("acceptedOfficial") {if !h.as_array().is_some_and(|a|a.len()<=256&&a.iter().all(|s|s.as_str().is_some_and(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit())))){return Err(failure("accepted-state-schema"));}}
        let mut prior=None;
        for t in a {
            let offset=t["offset"].as_u64().ok_or_else(||failure("route-offset"))?;
            if !matches!(t["source"].as_str(),Some("official"|"api")) || prior.is_some_and(|p|p>offset){return Err(failure("route-order"));}
            prior=Some(offset);
        }
        Ok(())
    }
    fn source(&self,offset:u64)->Option<&str> {
        self.value["transitions"].as_array()?.iter().rev().find(|v|v["offset"].as_u64().is_some_and(|n|n<=offset))?["source"].as_str()
    }
    fn api_start(&self)->Option<u64> {
        self.value["transitions"].as_array()?.iter().find(|v|v["source"]=="api")?["offset"].as_u64()
    }
}
fn fingerprint(item:&Value)->Option<String> {
    item["encrypted_content"].as_str().map(|s|format!("{:x}",Sha256::digest(s.as_bytes())))
}
fn read_window(path:&Path,end:u64)->Result<(u64,Vec<(u64,Value)>)> {
    let mut f=std::fs::File::open(path).map_err(|_|failure("archive-open"))?;
    if f.metadata().map_err(|_|failure("archive-metadata"))?.len()<end{return Err(failure("archive-truncated"));}
    let start=end.saturating_sub(WINDOW);f.seek(SeekFrom::Start(start)).map_err(|_|failure("archive-seek"))?;
    let mut b=Vec::new();f.take(end-start).read_to_end(&mut b).map_err(|_|failure("archive-read"))?;
    let skip=if start>0 {b.iter().position(|v|*v==b'\n').map(|p|p+1).unwrap_or(b.len())}else{0};
    let mut pos=skip;let mut rows=Vec::new();
    while let Some(n)=b[pos..].iter().position(|v|*v==b'\n') {
        let line=&b[pos..pos+n];
        if !line.is_empty(){rows.push((start+pos as u64,serde_json::from_slice(line).map_err(|_|failure("archive-json"))?));}
        pos+=n+1;
    }
    Ok((start,rows))
}
fn historical_policy(item:&Value)->bool {matches!(item["role"].as_str(),Some("system"|"developer"))}

pub(super) struct OfficialContext {
    provenance:Provenance,
    cache:Option<(u64,Option<std::time::SystemTime>,HashMap<String,String>,Vec<Value>,bool)>,
    live:HashSet<String>,
    pending:HashSet<String>,
}
impl OfficialContext {
    pub fn new(provenance:Provenance)->Self{Self{provenance,cache:None,live:HashSet::new(),pending:HashSet::new()}}
    pub fn observe(&mut self,event:&Value) {
        let items:Vec<&Value>=if event["type"]=="response.output_item.done"{vec![&event["item"]]}
            else {event["response"]["output"].as_array().or_else(||event["output"].as_array()).map(|v|v.iter().collect()).unwrap_or_default()};
        for item in items {if let Some(h)=fingerprint(item){if self.live.len()<8192{self.live.insert(h);}}}
    }
    pub fn accepted(&mut self,event:&Value)->Option<Value> {
        if event["type"]=="response.failed" || event["type"]=="error" {self.pending.clear();return None;}
        if event["type"]!="response.completed" && event["status"]!="completed" {return None;}
        if self.pending.is_empty(){return None;}
        let mut hashes=self.provenance.value["acceptedOfficial"].as_array().cloned().unwrap_or_default();
        for h in self.pending.drain() {if !hashes.iter().any(|v|v==&h)&&hashes.len()<256{hashes.push(json!(h));}}
        self.provenance.value["acceptedOfficial"]=json!(hashes);self.cache=None;Some(self.provenance.value.clone())
    }
    fn sources(&mut self,path:&Path)->Result<(&HashMap<String,String>,&Vec<Value>,bool)> {
        let m=std::fs::metadata(path).map_err(|_|failure("archive-metadata"))?;let size=m.len();let stamp=m.modified().ok();
        if !self.cache.as_ref().is_some_and(|c|c.0==size&&c.1==stamp) {
            let mut sources=HashMap::new();let mut base=Vec::new();let mut complete=false;
            if let Some(end)=self.provenance.api_start() {
                let (start,rows)=read_window(path,end)?;complete=start==0 && !self.provenance.value["legacyUnknown"].as_bool().unwrap_or(true);
                for (offset,row) in rows {
                    let source=self.provenance.source(offset).unwrap_or("unknown");
                    let items:Vec<&Value>=if row["type"]=="response_item"{vec![&row["payload"]]}else if row["type"]=="compacted"{row["payload"]["replacement_history"].as_array().map(|v|v.iter().collect()).unwrap_or_default()}else{vec![]};
                    for item in items {if let Some(h)=fingerprint(item){sources.entry(h).or_insert_with(||source.into());}}
                    if row["type"]=="compacted" {
                        if let Some(history)=row["payload"]["replacement_history"].as_array(){base=history.clone();complete=true;}
                        else {base.clear();complete=false;}
                    }else if row["type"]=="response_item" {base.push(row["payload"].clone());}
                }
            }
            let (_,rows)=read_window(path,size)?;
            for (offset,row) in rows {
                let source=self.provenance.source(offset).unwrap_or("unknown");
                let items:Vec<&Value>=if row["type"]=="response_item" {vec![&row["payload"]]}
                    else if row["type"]=="compacted" {row["payload"]["replacement_history"].as_array().map(|v|v.iter().collect()).unwrap_or_default()}else{vec![]};
                for item in items {if let Some(h)=fingerprint(item){sources.entry(h).or_insert_with(||source.into());}}
            }
            if let Some(hashes)=self.provenance.value["acceptedOfficial"].as_array(){for h in hashes.iter().filter_map(Value::as_str){sources.insert(h.into(),"official".into());}}
            // Prefer the latest verified official checkpoint, including progress from
            // earlier visits, instead of returning to the first ever official state.
            if let Some(end)=self.provenance.value["transitions"].as_array().and_then(|a|a.iter().rev().find(|v|v["source"]=="api")).and_then(|v|v["offset"].as_u64()) {
                let (_,rows)=read_window(path,end)?;let mut fresh=None;
                for (offset,row) in rows {
                    let source=self.provenance.source(offset).unwrap_or("unknown");
                    if row["type"]=="compacted" && source=="official" {
                        fresh=None;
                        if let Some(history)=row["payload"]["replacement_history"].as_array() {
                            if history.iter().filter_map(fingerprint).all(|h|sources.get(&h).is_none_or(|s|s=="official")) {
                                for item in history {if let Some(h)=fingerprint(item){sources.insert(h,"official".into());}}
                                fresh=Some(history.clone());
                            }
                        }
                    }else if row["type"]=="response_item" && source=="official" {if let Some(v)=fresh.as_mut(){v.push(row["payload"].clone());}}
                }
                if let Some(v)=fresh {base=v;complete=true;}
            }
            self.cache=Some((size,stamp,sources,base,complete));
        }
        let c=self.cache.as_ref().unwrap();Ok((&c.2,&c.3,c.4))
    }
    pub fn project(&mut self,path:&Path,request:&mut Value,handoff:impl FnOnce()->Result<Value>)->Result<Value> {
        // No API interval since legacy migration: leave native official behavior intact.
        if self.provenance.api_start().is_none(){
            self.pending=request["input"].as_array().map(|a|a.iter().filter_map(fingerprint).take(256).collect()).unwrap_or_default();
            return Ok(json!({"mode":"official-native","stage":"legacy-native-pass-through","requestUnchanged":true,"originalArchiveUnchanged":true}));
        }
        if request["input"].as_array().is_some_and(|a|a.iter().filter_map(fingerprint).all(|h|self.live.contains(&h)||self.cache.as_ref().is_some_and(|c|c.2.get(&h).is_some_and(|s|s=="official"))||self.provenance.value["acceptedOfficial"].as_array().is_some_and(|a|a.iter().any(|v|v==&h)))) {
            return Ok(json!({"mode":"official-native","stage":"native-pass-through","requestUnchanged":true,"originalArchiveUnchanged":true}));
        }
        let live=self.live.clone();
        let (sources,base,complete)=self.sources(path)?;
        let input=request["input"].as_array().ok_or_else(||failure("input-array"))?;
        let mut foreign=HashSet::new();let mut compact=None;
        for (i,item) in input.iter().enumerate() {
            if let Some(h)=fingerprint(item) {
                if live.contains(&h){continue;}
                match sources.get(&h).map(String::as_str) {
                    Some("official")=>{},
                    Some("api")=>{foreign.insert(i);if item["type"]=="compaction"{compact=Some(i);}},
                    _=>return Err(failure("opaque-provenance-unavailable")),
                }
            }
        }
        if foreign.is_empty(){return Ok(json!({"mode":"official-native","stage":"native-pass-through","requestUnchanged":true,"originalArchiveUnchanged":true}));}
        let projected=if let Some(boundary)=compact {
            if !complete{return Err(failure("official-checkpoint-unavailable"));}
            // Do not silently keep foreign state inherited by an earlier mixed checkpoint.
            if base.iter().filter_map(fingerprint).any(|h|sources.get(&h).is_some_and(|s|s!="official")){return Err(failure("official-checkpoint-mixed"));}
            let mut v=input.iter().filter(|v|historical_policy(v)).cloned().collect::<Vec<_>>();
            v.extend(base.iter().filter(|v|!historical_policy(v)).cloned());
            v.push(handoff()?);
            v.extend(input.iter().enumerate().skip(boundary+1).filter(|(i,v)|!foreign.contains(i)&&!historical_policy(v)).map(|(_,v)|v.clone()));v
        }else{input.iter().enumerate().filter(|(i,_)|!foreign.contains(i)).map(|(_,v)|v.clone()).collect()};
        let removed=foreign.len();let rebuilt=compact.is_some();
        request["input"]=json!(projected);
        if let Some(v)=request.as_object_mut(){v.remove("previous_response_id");v.remove("prompt_cache_key");}
        Ok(json!({"mode":"official-native","stage":if rebuilt{"official-checkpoint-with-api-progress"}else{"foreign-reasoning-isolated"},"sourceOpaqueItemsNotForwarded":removed,"officialCheckpointRestored":rebuilt,"requestUnchanged":false,"originalArchiveUnchanged":true,"taskReplayed":false}))
    }
}
