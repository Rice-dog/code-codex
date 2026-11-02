//! Bounded acknowledged stream; merge only unsent adjacent text deltas.
use super::{AccountError,Result};
use serde_json::{Value,json};
use std::collections::VecDeque;
const LIMIT:usize=16*1024*1024;
#[derive(Default)]
pub struct Stream {next:u64,delivered:u64,bytes:usize,queue:VecDeque<(u64,Value)>}
impl Stream {
 pub fn push(&mut self,value:Value){
  if let Some((seq,last))=self.queue.back_mut(){
   let old_size=last.to_string().len();
   if *seq>self.delivered&&merge_delta(last,&value){self.bytes=self.bytes-old_size+last.to_string().len();return;}
  }
  self.next+=1;self.bytes+=value.to_string().len();self.queue.push_back((self.next,value));
  while self.queue.len()>4096||self.bytes>LIMIT {if let Some((_,old))=self.queue.pop_front(){self.bytes=self.bytes.saturating_sub(old.to_string().len());}else{break;}}
 }
 pub fn cursor(&self)->u64{self.next}
 pub fn batch(&mut self,after:u64,dead:bool)->Result<Value>{
  if after>self.next{return Err(AccountError::protocol("Event acknowledgement is ahead of this executor."));}
  if self.queue.front().is_some_and(|(n,_)|after.saturating_add(1)<*n){
   return Err(AccountError::new("ACCOUNT_EVENT_GAP",format!("Account stream backlog was exceeded. after={after}; oldest={}; newest={}; queuedEvents={}; queuedBytes={}; stop or reconcile this task before continuing; no automatic replay.",self.queue.front().unwrap().0,self.next,self.queue.len(),self.bytes)));
  }
  while self.queue.front().is_some_and(|(n,_)|*n<=after){let (_,old)=self.queue.pop_front().unwrap();self.bytes=self.bytes.saturating_sub(old.to_string().len());}
  let mut bytes=0;let mut items=Vec::new();
  for (n,v) in &self.queue {let size=v.to_string().len();if !items.is_empty()&&(items.len()>=256||bytes+size>256*1024){break;}bytes+=size;items.push(json!({"sequence":n,"message":v}));}
  let cursor=items.last().and_then(|v|v["sequence"].as_u64()).unwrap_or(after);self.delivered=self.delivered.max(cursor);
  Ok(json!({"events":items,"cursor":cursor,"hasMore":cursor<self.next,"queuedEvents":self.queue.len(),"queuedBytes":self.bytes,"disconnected":dead}))
 }
}
fn merge_delta(last:&mut Value,next:&Value)->bool{
 let method=last["method"].as_str().unwrap_or("");
 if last.get("id").is_some()||next.get("id").is_some()||!method.ends_with("/delta")||last["method"]!=next["method"]{return false;}
 let (Some(a),Some(b))=(last["params"].as_object(),next["params"].as_object())else{return false;};
 if a.iter().filter(|(k,_)|k.as_str()!="delta").ne(b.iter().filter(|(k,_)|k.as_str()!="delta")){return false;}
 let (Some(x),Some(y))=(a.get("delta").and_then(Value::as_str),b.get("delta").and_then(Value::as_str))else{return false;};
 if x.len()+y.len()>16*1024{return false;}let merged=format!("{x}{y}");last["params"]["delta"]=json!(merged);true
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn burst_retains_terminal_and_ack_does_not_drop_unread_events(){let mut s=Stream::default();for _ in 0..20000{s.push(json!({"method":"item/agentMessage/delta","params":{"threadId":"same","itemId":"one","delta":"x"}}));}s.push(json!({"method":"turn/completed","params":{"threadId":"same","turn":{"status":"completed"}}}));let batch=s.batch(0,false).unwrap();let events=batch["events"].as_array().unwrap();assert_eq!(events.iter().filter_map(|e|e["message"]["params"]["delta"].as_str()).map(str::len).sum::<usize>(),20000);assert_eq!(events.last().unwrap()["message"]["method"],"turn/completed");assert_eq!(s.batch(batch["cursor"].as_u64().unwrap(),false).unwrap()["events"],json!([]));}
 #[test]fn delivered_delta_cannot_be_changed_before_ack(){let mut s=Stream::default();s.push(json!({"method":"item/text/delta","params":{"threadId":"same","delta":"a"}}));assert_eq!(s.batch(0,false).unwrap()["cursor"],1);s.push(json!({"method":"item/text/delta","params":{"threadId":"same","delta":"b"}}));assert_eq!(s.batch(1,false).unwrap()["events"][0]["message"]["params"]["delta"],"b");}
 #[test]fn byte_budget_drains_without_loss_and_overflow_has_actionable_evidence(){let mut s=Stream::default();for i in 0..600{s.push(json!({"method":"item/started","params":{"threadId":"same","itemId":i,"text":"x".repeat(2000)}}));}let mut cursor=0;let mut count=0;loop{let b=s.batch(cursor,false).unwrap();count+=b["events"].as_array().unwrap().len();cursor=b["cursor"].as_u64().unwrap();if b["hasMore"]!=true{break;}}assert_eq!(count,600);for i in 0..5000{s.push(json!({"method":"item/started","params":{"itemId":i}}));}assert!(s.batch(cursor,false).unwrap_err().message.contains("queuedEvents="));}
 #[test]fn no_merge_across_items_or_server_requests(){let mut s=Stream::default();for id in ["one","two"]{s.push(json!({"method":"item/text/delta","params":{"threadId":"same","itemId":id,"delta":"a"}}));}s.push(json!({"id":3,"method":"item/tool/call","params":{"threadId":"same"}}));assert_eq!(s.batch(0,false).unwrap()["events"].as_array().unwrap().len(),3);}
}
