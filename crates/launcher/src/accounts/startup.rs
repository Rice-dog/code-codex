//! Launch-only native transport; the listener lives in the official process so
//! an idle Code-Codex core handoff cannot strand loaded official actors.
use super::{AccountError, Result, host};
use cdp_client::CdpEndpoint;
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::time::Duration;

fn error(stage:&str)->AccountError {AccountError::new("ACCOUNT_STARTUP_ROUTE",format!("Startup account transport is unavailable. stage={stage}; no task was replayed."))}
fn descriptor_path()->Result<std::path::PathBuf>{Ok(workspace_service::application_paths::data_root().map_err(|_|error("storage"))?.join("account-startup-route.json"))}

pub(crate) fn enabled()->bool {
 let started=std::time::Instant::now();
 let enabled=crate::renderer_storage::settings_snapshot().ok().is_some_and(|v|v["code-codex:multi-account-enabled:v1"]=="true")
  && crate::plugin_store::installed("multi-account").unwrap_or(false);
 crate::runtime_log::record("accounts","account.startup.preference","observed",json!({"enabled":enabled,"durationMs":started.elapsed().as_millis(),"networkRequested":false}));
 enabled
}

/// No host version/export allowlist. Require the official startup configuration
/// mapping in a bounded trusted ASAR entry, and a launch-owned backend path.
pub(crate) fn qualify(installation:&crate::discovery::CodexInstallation)->bool {
 if ["CODEX_APP_SERVER_OPENAI_BASE_URL","CODEX_APP_SERVER_CHATGPT_BASE_URL"].iter().any(|k|std::env::var_os(k).is_some()){return false;}
 (||->std::io::Result<bool>{
  use std::io::{Read,Seek,SeekFrom};
  let path=installation.executable.parent().ok_or_else(||std::io::Error::other("image parent"))?.join("resources/app.asar");
  let mut file=std::fs::File::open(path)?;let mut bytes=[0u8;16];file.read_exact(&mut bytes)?;
  let header_size=u32::from_le_bytes(bytes[4..8].try_into().unwrap())as u64;
  let json_size=u32::from_le_bytes(bytes[12..16].try_into().unwrap())as usize;
  if json_size>16*1024*1024{return Ok(false);}
  let mut header=vec![0;json_size];file.read_exact(&mut header)?;
  let header:Value=serde_json::from_slice(&header)?;
  let Some(entries)=header["files"][".vite"]["files"]["build"]["files"].as_object()else{return Ok(false)};
  let mut scanned=0u64;
  for (name,v) in entries.iter().filter(|(n,_)|n.ends_with(".js")) {
   if name.len()>256||v["unpacked"]==true||!v["link"].is_null(){continue;}
   let Some(size)=v["size"].as_u64().filter(|n|*n<=8*1024*1024)else{continue};
   scanned+=size;if scanned>32*1024*1024{return Ok(false);}
   let Some(offset)=v["offset"].as_str().and_then(|s|s.parse::<u64>().ok())else{continue};
   let Some(start)=offset.checked_add(8+header_size)else{return Ok(false)};
   if start.checked_add(size).is_none_or(|end|end>file.metadata().map(|m|m.len()).unwrap_or(0)){return Ok(false);}
   file.seek(SeekFrom::Start(start))?;let mut bytes=vec![0;size as usize];file.read_exact(&mut bytes)?;
   let source=String::from_utf8_lossy(&bytes);
   if source.contains("CODEX_APP_SERVER_OPENAI_BASE_URL")&&source.contains("openai_base_url")&&source.contains("app-server")&&source.contains(".spawn"){return Ok(true);}
  } Ok(false)
 })().unwrap_or(false)
}

pub(crate) fn parameters(installation:&crate::discovery::CodexInstallation,renderer:CdpEndpoint,port:u16,native:bool)->Result<Value>{
 let backend=installation.app_server.as_ref().ok_or_else(||error("backend-path"))?;
 let backend=dunce::canonicalize(backend).map_err(|_|error("backend-path"))?;
 let backend_size=crate::renderer_storage::regular(&backend).map_err(|_|error("backend-file"))?.len();
 if backend_size>512*1024*1024{return Err(error("backend-bound"));}
 let backend_sha256=if native {String::new()}else{use std::io::Read;let mut file=std::fs::File::open(&backend).map_err(|_|error("backend-open"))?;let mut hash=Sha256::new();let mut bytes=vec![0;1024*1024];loop{let n=file.read(&mut bytes).map_err(|_|error("backend-read"))?;if n==0{break;}hash.update(&bytes[..n]);}format!("{:x}",hash.finalize())};
 let blocked=if native {std::collections::BTreeSet::new()}else{blocked_threads()?};
 Ok(json!({"schema":1,"rendererPort":renderer.port(),"port":port,"key":super::nonce(),"control":super::nonce(),"backend":backend,"backendSize":backend_size,"backendSha256":backend_sha256,"blocked":blocked}))
}
pub(super) fn blocked_threads()->Result<std::collections::BTreeSet<String>> {
 let mut blocked=std::collections::BTreeSet::new();
 let accounts=workspace_service::application_paths::data_root().map_err(|_|error("storage"))?.join("accounts");
 if accounts.exists(){
  workspace_service::application_paths::validate_directory_path(&accounts).map_err(|_|error("accounts-path"))?;
  for entry in std::fs::read_dir(&accounts).map_err(|_|error("accounts-read"))?.take(257){
   let entry=entry.map_err(|_|error("accounts-read"))?;let name=entry.file_name().to_string_lossy().into_owned();
   if name.len()!=64||!name.bytes().all(|b|b.is_ascii_hexdigit()){continue;}
   let root=entry.path();workspace_service::application_paths::validate_directory_path(&root).map_err(|_|error("owner-path"))?;
   let path=root.join("connections.json");
   if path.exists(){let registry=crate::renderer_storage::read_json(&path,1024*1024).map_err(|_|error("selection-read"))?;if let Some(selected)=registry["selected"].as_object(){for (id,target)in selected{if target!="host"{if blocked.len()>=4096{return Err(error("selection-bound"));}blocked.insert(id.clone());}}}}
  }
 }
 Ok(blocked)
}
pub(crate) fn initializer(params:&Value)->String{include_str!("startup_broker.js").replace("__PARAMS__",&params.to_string())}
pub(crate) fn save_descriptor(params:&Value,pid:u32)->Result<()> {
 use std::io::Write;
 let mut descriptor=params.clone();descriptor["pid"]=json!(pid);for key in ["blocked","backend","backendSize","backendSha256","manifest"]{descriptor.as_object_mut().unwrap().remove(key);}
 let path=descriptor_path()?;
 if path.exists(){crate::renderer_storage::regular(&path).map_err(|_|error("descriptor-file"))?;}
 let mut staged=tempfile::NamedTempFile::new_in(path.parent().ok_or_else(||error("descriptor-parent"))?).map_err(|_|error("descriptor-stage"))?;
 // This rendezvous includes launch capabilities, never account tokens. Apply
 // the existing protected-DACL helper before writing any capability bytes.
 #[cfg(windows)]{
  use std::os::windows::fs::OpenOptionsExt;
  use windows_sys::Win32::Storage::FileSystem::{FILE_GENERIC_READ,FILE_SHARE_READ,FILE_SHARE_WRITE,FILE_SHARE_DELETE,WRITE_DAC};
  let mut acl=std::fs::OpenOptions::new().access_mode(FILE_GENERIC_READ|WRITE_DAC).share_mode(FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE).open(staged.path()).map_err(|_|error("descriptor-acl-open"))?;
  crate::discovery::set_protected_dacl(&mut acl,"D:P(A;;FA;;;OW)(A;;FA;;;SY)(A;;FA;;;BA)").map_err(|_|error("descriptor-acl"))?;
 }
 #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;staged.as_file().set_permissions(std::fs::Permissions::from_mode(0o600)).map_err(|_|error("descriptor-permissions"))?;}
 staged.write_all(descriptor.to_string().as_bytes()).map_err(|_|error("descriptor-write"))?;staged.as_file().sync_all().map_err(|_|error("descriptor-sync"))?;
 staged.persist(path).map_err(|_|error("descriptor-commit"))?;Ok(())
}

async fn descriptor(endpoint:CdpEndpoint)->Result<Option<Value>>{
 let path=descriptor_path()?;if !path.exists(){return Ok(None);}
 let v=crate::renderer_storage::read_json(&path,8192).map_err(|_|error("descriptor-read"))?;
 // Stale launch metadata is never a route for this official process.
 if v["schema"]!=1||v["rendererPort"]!=endpoint.port(){return Ok(None);}
 let Some(pid)=v["pid"].as_u64().and_then(|v|u32::try_from(v).ok()).filter(|v|*v>0)else{return Err(error("descriptor-pid"))};
 let Some(port)=v["port"].as_u64().and_then(|v|u16::try_from(v).ok()).filter(|v|*v>0)else{return Err(error("descriptor-port"))};
 for key in ["key","control"]{if !v[key].as_str().is_some_and(|s|s.len()==32&&s.bytes().all(|b|b.is_ascii_hexdigit())){return Err(error("descriptor-capability"));}}
 let broker_pid=v["brokerPid"].as_u64().and_then(|v|u32::try_from(v).ok()).unwrap_or(pid);
 tokio::task::spawn_blocking(move||{crate::process_guard::verify_listener_owner_fast(endpoint.port(),pid,std::time::UNIX_EPOCH)?;crate::process_guard::verify_listener_owner_fast(port,broker_pid,std::time::UNIX_EPOCH)}).await.map_err(|_|error("owner-worker"))?.map_err(|_|error("listener-owner"))?;
 Ok(Some(v))
}
fn control_client()->Result<reqwest::Client>{reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(3)).build().map_err(|_|error("control-client"))}
async fn control(client:&reqwest::Client,v:&Value,payload:Value)->Result<Value>{
 let result=client.post(format!("http://localhost:{}/{}/control",v["port"].as_u64().unwrap(),v["key"].as_str().unwrap())).header("x-code-codex-control",v["control"].as_str().unwrap()).json(&payload).send().await.map_err(|_|error("control-send"))?;
 if !result.status().is_success(){return Err(error("control-rejected"));}
 let bytes=result.bytes().await.map_err(|_|error("control-read"))?;if bytes.len()>8192{return Err(error("control-bound"));}
 serde_json::from_slice(&bytes).map_err(|_|error("control-json"))
}
async fn ready_descriptor(endpoint:CdpEndpoint)->Result<Option<(Value,reqwest::Client)>>{
 let Some(v)=descriptor(endpoint).await?else{return Ok(None)};
 let client=control_client()?;
 let status=control(&client,&v,json!({"action":"status"})).await?;
 if status["schema"]!=1||status["pid"]!=v["pid"]||status["rendererPort"]!=endpoint.port()||status["ready"]!=true||!status["spawns"].as_u64().is_some_and(|v|v>0){return Err(error("backend-startup-unverified"));}
 Ok(Some((v,client)))
}
pub(crate) async fn verify_launch(endpoint:CdpEndpoint)->Result<bool>{
 let Some(v)=descriptor(endpoint).await?else{return Ok(false)};
 let client=control_client()?;
 let started=std::time::Instant::now();
 let mut status=control(&client,&v,json!({"action":"status"})).await?;
 // Renderer CDP can be open before the desktop has requested its backend.
 // Observe the original native startup, not just a debugging-port milestone.
 while status["spawns"].as_u64()==Some(0)&&status["failed"]==false&&started.elapsed()<Duration::from_secs(15){
  tokio::time::sleep(Duration::from_millis(100)).await;
  status=control(&client,&v,json!({"action":"status"})).await?;
 }
 if status["spawns"].as_u64()==Some(0){
  control(&client,&v,json!({"action":"retire"})).await?;
  std::fs::remove_file(descriptor_path()?).map_err(|_|error("unapplied-descriptor-removal"))?;
  crate::runtime_log::record("accounts","account.startup.transport","not-applied",json!({"stage":"native-backend-spawn","fallback":"existing-native-routing","taskReplayed":false}));return Ok(false);
 }
 let ready=status["ready"]==true&&status["failed"]==false&&status["pid"]==v["pid"];
 crate::runtime_log::record("accounts","account.startup.transport",if ready{"confirmed"}else{"failed"},json!({"stage":"native-backend-spawn","ready":ready,"backendSpawns":status["spawns"],"officialProcessOwned":true,"taskReplayed":false}));
 if !ready{return Err(error("startup-confirmation"));}Ok(true)
}
async fn bind(client:&reqwest::Client,v:&Value,owner:&host::Owner,thread:&str,target:Option<&str>)->Result<()> {
 let proof=if target.is_some(){let auth=super::credentials::read(&super::credentials::official_home()?,&owner.label,true)?;let token=auth["accessToken"].as_str().ok_or_else(||error("owner-credential"))?;Some(format!("{:x}",Sha256::digest(format!("Bearer {token}").as_bytes())))}else{None};
 let reply=control(client,v,json!({"action":"bind","owner":owner.id,"thread":thread,"target":target,"proof":proof})).await?;
 if reply["accepted"]!=true{return Err(error("binding-result"));}Ok(())
}
pub(super) async fn restore(endpoint:CdpEndpoint,owner:&host::Owner)->Result<()> {
 let Some(v)=descriptor(endpoint).await?else{return Ok(())};
 let reply=control(&control_client()?,&v,json!({"action":"restore","owner":owner.id})).await?;
 if reply["accepted"]!=true{return Err(error("restore-result"));}Ok(())
}

/// Adapt only native-route transport operations. The existing account
/// preparation, commit, rollback, disable/re-enable and task gates stay intact.
pub(super) async fn transition(endpoint:CdpEndpoint,p:&Value)->Result<Option<Value>>{
 if !matches!(p["mode"].as_str(),Some("check"|"switch")){return Ok(None);}
 let Some((v,client))=ready_descriptor(endpoint).await?else{return Ok(None)};
 let thread=p["threadId"].as_str().ok_or_else(||error("thread"))?;
 let route=control(&client,&v,json!({"action":"route","thread":thread})).await?;
 if route["direct"]==true||p["api"].is_object(){return Ok(None);}
 let state_params=json!({"mode":"state","threadId":thread});
 let expression=include_str!("native_route.js").replace("__PARAMS__",&state_params.to_string()).replace("__PROFILE__",&host::profile().to_string());
 let state=host::evaluate_budget(endpoint,&expression,Duration::from_secs(55)).await?;
 if !state["inProgress"].is_boolean(){return Err(error("native-state"));}
 if p["mode"]=="check" {
  let ready=route["blocked"]==false&&route["target"]==p["baseUrl"];
  if ready&&route["target"].is_string()&&state["inProgress"]==false{let owner=host::observe(endpoint).await?;bind(&client,&v,&owner,thread,route["target"].as_str()).await?;}
  return Ok(Some(json!({"ready":ready,"routed":route["target"].is_string()||route["blocked"]==true,"inProgress":state["inProgress"],"startupTransport":true})));
 }
 if state["inProgress"]!=false{return Err(AccountError::new("ACCOUNT_TURN_ACTIVE","Finish the active task before preparing this account."));}
 let owner=host::observe(endpoint).await?;
 bind(&client,&v,&owner,thread,p["baseUrl"].as_str()).await?;
 crate::runtime_log::record("accounts","account.startup.transition","confirmed",json!({"conversationId":thread,"actorReleased":false,"taskSent":false}));
 Ok(Some(json!({"ready":true,"permissionsPreserved":true,"startupTransport":true})))
}
pub(super) async fn observe_transition(endpoint:CdpEndpoint,p:&Value,result:&Value)->Result<()> {
 if !matches!(p["mode"].as_str(),Some("adopt"|"switch"))||result["ready"]!=true{return Ok(());}
 let Some((v,client))=ready_descriptor(endpoint).await?else{return Ok(())};
 let reply=control(&client,&v,json!({"action":"native","thread":p["threadId"],"direct":p["baseUrl"].is_string()})).await?;
 if reply["accepted"]!=true{return Err(error("native-transition"));}Ok(())
}
