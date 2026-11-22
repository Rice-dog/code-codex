//! Native-only access to the actual desktop backend. Ordinary JSONL is forwarded
//! unchanged; only our correlated replies and owned refresh requests are consumed.
use super::{AccountError,Result,Worker,credentials};
use serde_json::{Value,json};
use std::{collections::HashMap,sync::{Arc,Mutex,atomic::{AtomicU64,AtomicBool,Ordering}},time::Duration,path::PathBuf};
use tokio::{io::AsyncWriteExt,sync::{Mutex as AsyncMutex,oneshot}};

pub(super) struct Transport {
 writer:AsyncMutex<tokio::process::ChildStdin>,
 pending:Mutex<HashMap<String,oneshot::Sender<Value>>>,
 prefix:String,next:AtomicU64,owned:AtomicBool,
 operation:AsyncMutex<()>,
 provider:AsyncMutex<Option<(String,Arc<Worker>)>>,
}
impl Transport {
 pub(super) fn new(writer:tokio::process::ChildStdin)->Arc<Self>{Arc::new(Self{writer:AsyncMutex::new(writer),pending:Mutex::new(HashMap::new()),prefix:format!("code-codex-primary-{}-",super::nonce()),next:AtomicU64::new(1),owned:AtomicBool::new(false),operation:AsyncMutex::new(()),provider:AsyncMutex::new(None)})}
 pub(super) async fn forward(&self,bytes:&[u8])->Result<()>{let mut writer=self.writer.lock().await;writer.write_all(bytes).await.map_err(|_|error("backend-write"))?;writer.flush().await.map_err(|_|error("backend-flush"))}
 async fn send(&self,value:Value)->Result<()>{let mut bytes=serde_json::to_vec(&value).map_err(|_|error("backend-encode"))?;bytes.push(b'\n');let result=self.forward(&bytes).await;bytes.fill(0);result}
 async fn request(&self,method:&str,params:Value)->Result<Value>{
  let id=format!("{}{}",self.prefix,self.next.fetch_add(1,Ordering::Relaxed));let (tx,rx)=oneshot::channel();self.pending.lock().unwrap().insert(id.clone(),tx);
  let outcome=async{self.send(json!({"id":id,"method":method,"params":params})).await?;tokio::time::timeout(Duration::from_secs(30),rx).await.map_err(|_|error("backend-response-unknown"))?.map_err(|_|error("backend-closed"))}.await;
  self.pending.lock().unwrap().remove(&id);let reply=outcome?;
  if reply.get("error").is_some(){return Err(AccountError::new("ACCOUNT_PRIMARY_REJECTED",format!("The official backend rejected the internal request. method={method}; responseBodyWithheld=true; no login was replayed.")))}Ok(reply["result"].clone())
 }
 /// Called from the stdout pump; never wait for an RPC which this pump must read.
 pub(super) fn consume(self:&Arc<Self>,message:&Value)->bool {
  // A cancelled normal login must keep the current refresh source. Release it
  // only after the official backend confirms that external auth was replaced.
  if self.owned.load(Ordering::Acquire)&&message["method"]=="account/updated" {
   if let Some(mode)=message["params"].get("authMode") {
    if mode.is_null()||mode.as_str().is_some_and(|v|v!="chatgptAuthTokens") {
     self.owned.store(false,Ordering::Release);let own=self.clone();
     tokio::spawn(async move {let mut provider=own.provider.lock().await;if !own.owned.load(Ordering::Acquire){if let Some((_,worker))=provider.take(){worker.stop().await;}}});
    }
   }
  }
  if message.get("method").is_none()&&message["id"].as_str().is_some_and(|id|id.starts_with(&self.prefix)) {
   if let Some(tx)=message["id"].as_str().and_then(|id|self.pending.lock().unwrap().remove(id)){let _=tx.send(message.clone());}return true
  }
  if self.owned.load(Ordering::Acquire)&&message["method"]=="account/chatgptAuthTokens/refresh"&&message.get("id").is_some(){
   let own=self.clone();let id=message["id"].clone();
   tokio::spawn(async move {
    let provider=own.provider.lock().await;
    let result=if let Some((email,worker))=provider.as_ref(){worker.invalidate_credential();credentials::managed(worker,email).await}else{Err(error("refresh-source-unavailable"))};
    let succeeded=result.is_ok();let reply=match result {Ok(mut value)=>{value.as_object_mut().map(|v|v.remove("type"));json!({"id":id,"result":value})},Err(_)=>json!({"id":id,"error":{"code":-32001,"message":"ACCOUNT_REAUTH_REQUIRED: The current primary credential could not be refreshed."}})};
    let _=own.send(reply).await;
    crate::runtime_log::record("accounts","account.primary.refresh",if succeeded{"completed"}else{"failed"},json!({"credentialsExposed":false,"taskSent":false}));
   });return true
  }false
 }
 pub(super) async fn switch(&self,params:&Value)->Result<Value> {
  let _lane=self.operation.try_lock().map_err(|_|error("switch-busy"))?;
  let operation=params["operationId"].as_str().filter(|v|v.len()==32&&v.bytes().all(|b|b.is_ascii_hexdigit())).ok_or_else(||error("operation"))?;
  let email=params["email"].as_str().filter(|v|!v.is_empty()&&v.len()<=320).ok_or_else(||error("target"))?.to_owned();
  let source=PathBuf::from(params["source"].as_str().ok_or_else(||error("source"))?);
  let backup=PathBuf::from(params["backup"].as_str().ok_or_else(||error("backup"))?);
  let official=credentials::official_home()?;
  // Paths arrive exclusively through the authenticated native control endpoint.
  // They contain credential stores; only the exact auth files/keys are copied.
  let previous=self.provider.lock().await.take();
  let started=std::time::Instant::now();let mut stage="credential-install";
  let mut dispatched=false;let mut login_rejected=false;
  let result=async{
   credentials::replace_managed(&source,&official)?;
   stage="credential-source";
   let store=credentials::primary_launch_store(&official).ok_or_else(||error("credential-store"))?;
   let worker=Worker::spawn(&official).await?;
   let auth=match credentials::managed(&worker,&email).await {Ok(value)=>value,Err(e)=>{worker.stop().await;return Err(e)}};
   let expected=auth["accessToken"].as_str().ok_or_else(||error("credential-contract"))?.to_owned();
   // Install the refresh source before login can emit a request/notification.
   *self.provider.lock().await=Some((email.clone(),worker));
   stage="official-login";self.owned.store(true,Ordering::Release);dispatched=true;let login=match self.request("account/login/start",auth).await {Ok(value)=>value,Err(issue)=>{login_rejected=issue.code=="ACCOUNT_PRIMARY_REJECTED";return Err(issue)}};
   if login["type"]!="chatgptAuthTokens"{return Err(error("login-contract"))}
   stage="identity-confirm";let observed=self.request("getAuthStatus",json!({"includeToken":true,"refreshToken":false})).await?;
   if observed["authToken"].as_str()!=Some(expected.as_str()){return Err(error("identity-confirm"))}
   Ok(json!({"completed":true,"authorizationRequired":false,"browserOpened":false,"persistent":true,"startupStore":store}))
  }.await;
  // Before dispatch, restoring the verified managed backup leaves live auth
  // unchanged. After dispatch, an unknown outcome is never replayed or guessed.
  if let Err(ref issue)=result {
   if !dispatched||login_rejected {
    let mut provider=self.provider.lock().await;
    if let Some((_,failed))=provider.take(){failed.stop().await;}
    credentials::replace_managed(&backup,&official).map_err(|_|error("backup-restore"))?;
    self.owned.store(previous.is_some(),Ordering::Release);*provider=previous;
    crate::runtime_log::record("accounts","account.primary.native","restored",json!({"operationId":operation,"stage":stage,"elapsedMs":started.elapsed().as_millis(),"errorCode":issue.code,"loginDispatched":dispatched,"credentialsExposed":false,"browserOpened":false,"taskSent":false}));
    return Ok(json!({"completed":false,"restored":true,"loginDispatched":dispatched,"errorCode":issue.code}));
   }else if let Some((_,old))=previous{old.stop().await;}
  }else if let Some((_,old))=previous{old.stop().await;}
  crate::runtime_log::record("accounts","account.primary.native",if result.is_ok(){"completed"}else{"failed"},json!({"operationId":operation,"stage":stage,"elapsedMs":started.elapsed().as_millis(),"errorCode":result.as_ref().err().map(|e|&e.code),"loginDispatched":dispatched,"credentialsExposed":false,"browserOpened":false,"taskSent":false}));
  result
 }
}
fn error(stage:&str)->AccountError{AccountError::new("ACCOUNT_PRIMARY_NATIVE",format!("Internal primary-account handoff was not completed. stage={stage}; no inference was sent; no login was replayed."))}
#[cfg(all(test,windows))]
mod tests {
 use super::*;
 use tokio::io::{AsyncBufReadExt,BufReader};
 async fn fixture()->(Arc<Transport>,tokio::process::Child,BufReader<tokio::process::ChildStdout>){
  let mut child=tokio::process::Command::new("powershell.exe").args(["-NoProfile","-Command","while($null -ne ($line=[Console]::ReadLine())){[Console]::Out.Write($line+[char]10)}"]).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).creation_flags(0x08000000).kill_on_drop(true).spawn().unwrap();
  let transport=Transport::new(child.stdin.take().unwrap());let output=BufReader::new(child.stdout.take().unwrap());(transport,child,output)
 }
 #[tokio::test]
 async fn owned_responses_are_correlated_without_swallowing_official_messages(){
  let (transport,_child,mut output)=fixture().await;let client=transport.clone();let task=tokio::spawn(async move{client.request("account/read",json!({"refreshToken":false})).await});
  let mut line=String::new();output.read_line(&mut line).await.unwrap();let request:Value=serde_json::from_str(&line).unwrap();
  assert!(!transport.consume(&json!({"id":7,"result":{"ordinary":true}})));assert!(!transport.consume(&json!({"method":"account/updated","params":{"authMode":"chatgpt"}})));
  assert!(transport.consume(&json!({"id":request["id"],"result":{"matched":true}})));assert_eq!(task.await.unwrap().unwrap(),json!({"matched":true}));assert!(transport.pending.lock().unwrap().is_empty());
  assert!(transport.consume(&json!({"id":request["id"],"result":{"late":true}})));
 }
 #[tokio::test]
 async fn native_rejections_withhold_raw_bodies_and_never_replay(){
  let (transport,_child,mut output)=fixture().await;let client=transport.clone();let task=tokio::spawn(async move{client.request("account/login/start",json!({"synthetic":true})).await});
  let mut line=String::new();output.read_line(&mut line).await.unwrap();let request:Value=serde_json::from_str(&line).unwrap();transport.consume(&json!({"id":request["id"],"error":{"code":-1,"message":"synthetic-private-body"}}));
  let issue=task.await.unwrap().unwrap_err();assert_eq!(issue.code,"ACCOUNT_PRIMARY_REJECTED");assert!(!issue.message.contains("synthetic-private-body"));assert!(transport.pending.lock().unwrap().is_empty());
 }
 #[tokio::test]
 async fn unowned_refresh_is_not_intercepted_and_ordinary_frames_are_exact(){
  let (transport,_child,mut output)=fixture().await;assert!(!transport.consume(&json!({"id":5,"method":"account/chatgptAuthTokens/refresh","params":{}})));
  let frame=b"{\"id\":91,  \"method\":\"thread/read\",\"params\":{}}\n";transport.forward(frame).await.unwrap();let mut result=Vec::new();output.read_until(b'\n',&mut result).await.unwrap();assert_eq!(result,frame);
 }
 #[tokio::test]
 async fn refresh_uses_existing_managed_worker_and_logout_releases_only_owned_provider(){
  use base64::Engine;
  let d=tempfile::tempdir().unwrap();let script=d.path().join("managed.ps1");let claims=json!({"email":"fixture@example.invalid","exp":u64::MAX/2,"https://api.openai.com/auth":{"chatgpt_account_id":"fixture-workspace"}});let token=format!("e30.{}.synthetic",base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims.to_string()));
  std::fs::write(&script,format!(r#"param([string]$FixtureRoot)
while($null -ne ($line=[Console]::ReadLine())){{$r=$line|ConvertFrom-Json;if($null -eq $r.id){{continue}};$result=@{{}};if($r.method -eq 'getAuthStatus'){{$result=@{{authMethod='chatgpt';authToken='{token}'}}}}elseif($r.method -eq 'account/read'){{$result=@{{account=@{{type='chatgpt';email='fixture@example.invalid'}}}}}};@{{id=$r.id;result=$result}}|ConvertTo-Json -Compress -Depth 10}}
"#)).unwrap();
  let worker=Worker::spawn_fixture(d.path(),&script,None).await.unwrap();let (transport,_child,mut output)=fixture().await;*transport.provider.lock().await=Some(("fixture@example.invalid".into(),worker.clone()));transport.owned.store(true,Ordering::Release);
  assert!(transport.consume(&json!({"id":"refresh-1","method":"account/chatgptAuthTokens/refresh","params":{}})));let mut line=String::new();output.read_line(&mut line).await.unwrap();let reply:Value=serde_json::from_str(&line).unwrap();assert_eq!(reply["id"],"refresh-1");assert_eq!(reply["result"]["accessToken"],token);assert!(reply["result"].get("type").is_none());
  assert!(!transport.consume(&json!({"method":"account/login/completed","params":{"success":false}})));assert!(transport.owned.load(Ordering::Acquire));
  assert!(!transport.consume(&json!({"method":"account/updated","params":{"authMode":"chatgptAuthTokens"}})));assert!(transport.owned.load(Ordering::Acquire));
  assert!(!transport.consume(&json!({"method":"account/updated","params":{"authMode":null}})));assert!(!transport.owned.load(Ordering::Acquire));
  for _ in 0..100{if worker.is_dead(){break}tokio::task::yield_now().await;}
  assert!(transport.provider.lock().await.is_none());assert!(worker.is_dead());assert!(!transport.consume(&json!({"id":"foreign","method":"account/chatgptAuthTokens/refresh","params":{}})));
 }
}
