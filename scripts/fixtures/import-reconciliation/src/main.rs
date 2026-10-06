use std::{io::{self,BufRead,Write},collections::HashMap,fs};
use serde_json::{Value,json};
use workspace_service::{Workspace,ImportSession,CreateEntryKind,ListOptions};
fn main(){
 let root=tempfile::tempdir().unwrap();let workspace=Workspace::open(root.path()).unwrap();let mut sessions:HashMap<String,ImportSession>=HashMap::new();let mut next=0;let mut commits=0;
 for line in io::stdin().lock().lines(){let line=line.unwrap();let v:Value=serde_json::from_str(&line).unwrap();let p=&v["params"];let sid=p["sessionId"].as_str().unwrap_or("");let method=v["method"].as_str().unwrap_or("");
 let r:Result<Value,String>=(||{match method{
 "explorer.entry.import.begin"=>{next+=1;let s=format!("session-{next}");let session=workspace.begin_import("",p["name"].as_str().unwrap(),CreateEntryKind::File,Some(p["sizeBytes"].as_u64().unwrap()),&format!("nonce-{next}")).map_err(|e|format!("{e:?}"))?;sessions.insert(s.clone(),session);Ok(json!({"sessionId":s,"chunkSize":48*1024}))},
 "explorer.entry.import.chunk"=>{let bytes=p["fixtureBytes"].as_array().unwrap().iter().map(|x|x.as_u64().unwrap()as u8).collect::<Vec<_>>();let offset=sessions.get_mut(sid).ok_or("unknown session")?.append_chunk(p["offset"].as_u64().unwrap(),&bytes).map_err(|e|format!("{e:?}"))?;Ok(json!({"nextOffset":offset}))},
 "explorer.entry.import.file.finish"=>{sessions.get_mut(sid).ok_or("unknown session")?.finish_file().map_err(|e|format!("{e:?}"))?;Ok(json!({"finished":true}))},
 "explorer.entry.import.commit"=>{let s=sessions.remove(sid).ok_or("unknown session")?;let e=s.commit().map_err(|e|format!("{e:?}"))?;commits+=1;Ok(json!({"entry":e}))},
 "explorer.entry.import.abort"=>{if let Some(s)=sessions.remove(sid){s.abort().map_err(|e|format!("{e:?}"))?;}Ok(json!({"aborted":true}))},
 "explorer.list"=>{let page=workspace.list(ListOptions::default()).map_err(|e|format!("{e:?}"))?;Ok(serde_json::to_value(page).unwrap())},
 "fixture.state"=>{Ok(json!({"commitCount":commits,"sessions":sessions.len(),"present":root.path().join("dropped.txt").is_file(),"bytes":fs::read(root.path().join("dropped.txt")).ok()}))},
 _=>Err("unsupported fixture operation".into())}}
 )();println!("{}",match r{Ok(result)=>json!({"ok":true,"result":result}),Err(error)=>json!({"ok":false,"error":error})});io::stdout().flush().unwrap();
 }
}
