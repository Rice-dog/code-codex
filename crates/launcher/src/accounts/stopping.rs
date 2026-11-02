//! Explicit user Stop: confirm idle or retire only the plugin-owned executor.
use super::{AccountError,OwnerState,Result,save,worker::Worker};
use serde_json::{Value,json};
use std::{path::Path,sync::Arc,time::Duration};
pub async fn stop(state:&mut OwnerState,root:&Path,id:&str,turn:Option<&str>)->Result<Value>{
 let mut op=crate::runtime_log::Operation::start("accounts","account.stop",json!({"hasTurnId":turn.is_some(),"activeRecorded":state.active.contains_key(id),"taskReplayed":false}));
 let worker=state.executors.get(id).cloned();
 let result=confirm(worker.as_ref(),id,turn,&op).await;
 match result {
  Ok((reusable,cursor,idle_confirmed))=>{
   if !reusable {state.executors.remove(id);}
   state.active.remove(id);state.registry.active=state.active.clone();save(root,&state.registry)?;
   op.finish("passed",json!({"executorReusable":reusable,"cursor":cursor,"previousOutcome":if idle_confirmed{"stopped"}else{"unverified"},"taskReplayed":false}));
   Ok(json!({"stopped":true,"executorReusable":reusable,"cursor":cursor,"previousOutcome":if idle_confirmed{"stopped"}else{"unverified"},"operationId":op.id()}))
  },Err(e)=>{op.finish("failed",json!({"errorCode":e.code,"message":e.message,"taskReplayed":false}));Err(e)}
 }
}
async fn confirm(worker:Option<&Arc<Worker>>,id:&str,turn:Option<&str>,op:&crate::runtime_log::Operation)->Result<(bool,u64,bool)>{
 let Some(w)=worker.filter(|w|!w.is_dead())else{return Ok((false,0,false));};
 let observed=tokio::time::timeout(Duration::from_secs(8),async{
  if let Some(turn)=turn {let result=w.request("turn/interrupt",json!({"threadId":id,"turnId":turn})).await;op.event("account.stop.interrupt","observed",json!({"accepted":result.is_ok(),"errorCode":result.as_ref().err().map(|e|&e.code)}));}
  let _=w.request("thread/backgroundTerminals/clean",json!({"threadId":id})).await;
  for _ in 0..12 {let metadata=w.request("thread/read",json!({"threadId":id,"includeTurns":false})).await?;if matches!(metadata["thread"]["status"]["type"].as_str(),Some("idle"|"notLoaded"|"systemError")){return Ok::<_,AccountError>(());}tokio::time::sleep(Duration::from_millis(250)).await;}
  Err(AccountError::new("ACCOUNT_STOP_PENDING","The executor did not confirm idle after interrupt."))
 }).await;
 // Stop also fences any outstanding UI requests and event-gap state. A clean
 // restart resumes the same official file; it never repeats the previous task.
 op.event("account.stop.confirmation","observed",json!({"idleConfirmed":matches!(observed,Ok(Ok(()))),"deadlineMs":8000,"retiringOwnedExecutor":true}));
 w.set_selection(None);w.stop_checked().await.map_err(|e|AccountError::new("ACCOUNT_STOP_UNCONFIRMED",format!("{} Stop could not confirm process exit; the turn remains locked. operationId={}",e.message,op.id())))?;
 Ok((false,0,matches!(observed,Ok(Ok(())))))
}
