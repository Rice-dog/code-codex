//! Fixed optional LAN helper, owned by the authenticated document lifetime.
use std::{collections::HashMap, net::Ipv4Addr, process::Stdio, sync::{Arc, Mutex, atomic::{AtomicBool,AtomicU64,Ordering}}};
use cdp_client::{BridgeError,BridgeNotification};
use serde::Deserialize;
use serde_json::{Value,json};
use tokio::{io::{AsyncBufReadExt,AsyncWriteExt,BufReader},sync::{broadcast,oneshot}};
use process_wrap::tokio::{TokioChildWrapper,TokioCommandWrap,KillOnDrop};

#[derive(Deserialize)]
#[serde(tag="action",rename_all="lowercase",deny_unknown_fields)]
pub(crate) enum Action {
    Open {code:String, #[serde(default)] locale:Option<String>, #[serde(default)] address:Option<Ipv4Addr>}, Approve {peer:String}, Reject {peer:String},
    Disconnect {}, Files {}, Stop {}, Status {},
}
pub(crate) fn validate(value:&Value)->Result<Action,BridgeError> {
    let action:Action=serde_json::from_value(value.clone()).map_err(|_|BridgeError::invalid_request())?;
    match &action {
        Action::Open{code,..} if code.len()!=6||!code.bytes().all(|b|b.is_ascii_digit())=>Err(BridgeError::invalid_request()),
        Action::Open{locale:Some(locale),..} if !matches!(locale.as_str(),"en"|"zh-CN")=>Err(BridgeError::invalid_request()),
        Action::Open{address:None,..} if value.get("address").is_some()=>Err(BridgeError::invalid_request()),
        Action::Approve{peer}|Action::Reject{peer} if peer.is_empty()||peer.len()>64||!peer.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')=>Err(BridgeError::invalid_request()),
        _=>Ok(action),
    }
}
fn error(message:impl Into<String>)->BridgeError {BridgeError::new("REMOTE_ENGINE",message)}
fn lock<T>(mutex:&Mutex<T>)->std::sync::MutexGuard<'_,T> {mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)}
type Response=oneshot::Sender<Result<Value,BridgeError>>;
pub(crate) struct Engine {
    child:Mutex<Option<Box<dyn TokioChildWrapper>>>,
    input:tokio::sync::Mutex<tokio::process::ChildStdin>,
    pending:Mutex<HashMap<u64,Response>>,
    sequence:AtomicU64,
    closed:AtomicBool,
    pid:Option<u32>,
    epoch:u64,
}
impl Engine {
    pub(crate) async fn start(sender:Option<broadcast::Sender<BridgeNotification>>,epoch:u64)->Result<Arc<Self>,BridgeError> {
        let file=tokio::task::spawn_blocking(crate::plugin_store::lan_engine).await.map_err(|_|error("The engine identity worker failed."))??;
        let mut command=tokio::process::Command::new(file);
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        let mut wrapped=TokioCommandWrap::from(command);wrapped.wrap(KillOnDrop);
        #[cfg(windows)] {
            wrapped.wrap(process_wrap::tokio::CreationFlags(windows::Win32::System::Threading::CREATE_NO_WINDOW));
            wrapped.wrap(process_wrap::tokio::JobObject);
        }
        let mut child=wrapped.spawn().map_err(|e|error(format!("The LAN engine could not start: {e}")))?;
        let pid=child.id();
        let input=child.stdin().take().ok_or_else(||error("The LAN input pipe is unavailable."))?;
        let output=child.stdout().take().ok_or_else(||error("The LAN output pipe is unavailable."))?;
        let engine=Arc::new(Self{child:Mutex::new(Some(child)),input:tokio::sync::Mutex::new(input),pending:Mutex::new(HashMap::new()),sequence:AtomicU64::new(0),closed:AtomicBool::new(false),pid,epoch});
        crate::runtime_log::record("lan-remote","engine","started",json!({"pid":pid,"lifecycleEpoch":epoch}));
        let weak=Arc::downgrade(&engine);
        tokio::spawn(async move {
            let mut reader=BufReader::new(output);let mut bytes=Vec::new();
            loop {
                bytes.clear();
                // Bounded protocol frame; never log the private configuration or room code.
                let read=reader.read_until(b'\n',&mut bytes).await;
                if !matches!(read,Ok(n) if n>0)||bytes.len()>16*1024 {break;}
                let Ok(value)=serde_json::from_slice::<Value>(&bytes) else {continue;};
                let Some(current)=weak.upgrade() else {return;};
                if let Some(id)=value["id"].as_u64() {
                    if let Some(reply)=lock(&current.pending).remove(&id) {
                        crate::runtime_log::record("lan-remote","command","completed",json!({"pid":pid,"lifecycleEpoch":epoch,"commandId":id,"failed":value.get("error").is_some()}));
                        let result=if let Some(message)=value["error"].as_str(){Err(error(message))}else{Ok(value["result"].clone())};
                        let _=reply.send(result);
                    }
                } else if value["event"]=="state" && value["state"].is_object() {
                    let error_code=value["state"]["error"].as_str().and_then(|s|s.split(':').next()).filter(|s|s.starts_with("REMOTE_")&&s.len()<=64&&s.bytes().all(|b|b.is_ascii_uppercase()||b==b'_'));
                    crate::runtime_log::record("lan-remote","room state","changed",json!({"pid":pid,"lifecycleEpoch":epoch,"role":value["state"]["role"],"phase":value["state"]["phase"],"connected":value["state"]["connected"],"pendingCount":value["state"]["pending"].as_array().map(Vec::len),"errorCode":error_code}));
                    if let Some(sender)=&sender {let _=sender.send(BridgeNotification{payload:json!({"method":"explorer.lan.state","params":value["state"]}),lifecycle_epoch:epoch});}
                }
            }
            if let Some(current)=weak.upgrade() {let unexpected=!current.is_closed();current.cancel();
                if !unexpected {return;}
                if let Some(sender)=&sender {let _=sender.send(BridgeNotification{payload:json!({"method":"explorer.lan.state","params":{"role":"idle","phase":"error","pending":[],"connected":false,"error":"REMOTE_ENGINE_EXITED: The LAN engine stopped. Reopen the room to try again."}}),lifecycle_epoch:epoch});}
            }
        });
        Ok(engine)
    }
    pub(crate) fn is_closed(&self)->bool {self.closed.load(Ordering::Acquire)}
    pub(crate) fn cancel(&self) {
        if self.closed.swap(true,Ordering::AcqRel){return;}
        crate::runtime_log::record("lan-remote","engine","closed",json!({"pid":self.pid,"lifecycleEpoch":self.epoch}));
        drop(lock(&self.child).take());
        for (_,reply) in lock(&self.pending).drain(){let _=reply.send(Err(error("The LAN engine connection closed.")));}
    }
    pub(crate) async fn request(&self,mut params:Value,valid:impl Fn()->bool)->Result<Value,BridgeError> {
        let id=self.sequence.fetch_add(1,Ordering::Relaxed)+1;
        let mut input=self.input.lock().await;
        if self.is_closed()||!valid(){return Err(error("The LAN document connection is no longer active."));}
        params["id"]=json!(id);let (send,receive)=oneshot::channel();lock(&self.pending).insert(id,send);
        crate::runtime_log::record("lan-remote","command","started",json!({"pid":self.pid,"lifecycleEpoch":self.epoch,"commandId":id,"action":params["action"]}));
        let mut bytes=serde_json::to_vec(&params).map_err(|_|BridgeError::invalid_request())?;bytes.push(b'\n');
        if input.write_all(&bytes).await.is_err(){lock(&self.pending).remove(&id);self.cancel();return Err(error("The LAN command pipe closed."));}
        drop(input);
        receive.await.map_err(|_|error("The LAN command response closed."))?
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn fixed_actions_reject_paths_and_malformed_room_or_peer() {
        for value in [json!({"action":"open","code":"12345"}),json!({"action":"open","code":"１２３４５６"}),json!({"action":"open","code":"123456","path":"C:/evil.exe"}),json!({"action":"approve","peer":"../x"}),json!({"action":"shell"}),json!({"action":"status","code":"123456"})] {assert!(validate(&value).is_err(),"{value}");}
        for value in [json!({"action":"open","code":"012345"}),json!({"action":"approve","peer":"abc-123"}),json!({"action":"stop"}),json!({"action":"files"}),json!({"action":"status"})]{assert!(validate(&value).is_ok());}
    }
    #[test] fn address_join_accepts_an_ipv4_literal_but_never_treats_bad_input_as_broadcast() {
        for address in [json!(null),json!(""),json!("host.example"),json!("100.91.42.8:34591"),json!("::1")] {
            assert!(validate(&json!({"action":"open","code":"012345","address":address})).is_err());
        }
        assert!(matches!(validate(&json!({"action":"open","code":"012345","address":"100.91.42.8"})),
            Ok(Action::Open{address:Some(address),..}) if address.octets()==[100,91,42,8]));
    }
}
