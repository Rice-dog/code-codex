//! Identity is observed through the launch-owned native host, never supplied by a plugin.
use super::{AccountError, Result};
use cdp_client::{CdpEndpoint, TargetDiscovery};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Seek, SeekFrom},
    time::Duration,
};
use tokio_tungstenite::tungstenite::Message;

/// Fixed native read operations, through the exact qualified dispatcher. Never returns auth tokens.
pub async fn thread_metadata(endpoint: CdpEndpoint, id: &str) -> Result<Value> {
    let expression = format!(
        r#"(async()=>{{const m=await import({});const d=m[{}];const id='cc-shared-'+crypto.randomUUID();const r=await new Promise((resolve,reject)=>{{let off;const timer=setTimeout(()=>{{off?.();reject(Error('Thread metadata timed out'));}},8000);off=d.subscribe('mcp-response',e=>{{if(e.message?.id!==id)return;off();clearTimeout(timer);resolve(e.message);}});d.dispatchMessage('mcp-request',{{hostId:'local',request:{{id,method:'thread/read',params:{{threadId:{},includeTurns:false}}}},priority:'interactive',timeoutMs:8000}});}});if(r.error)throw Error('Thread metadata unavailable');const t=r.result.thread;return {{id:t.id,path:t.path,cwd:t.cwd,status:t.status}};}})()"#,
        profile()["shared"],profile()["dispatcherExport"],json!(id)
    );
    evaluate(endpoint, &expression).await
}
/// An explicitly released service may reopen only for its concrete current document.
pub(super) async fn lease_generation(endpoint:CdpEndpoint)->Result<Option<String>>{
    let binding=format!("__codeCodexLive_{}_{}",env!("CARGO_PKG_VERSION").replace('.',"_"),std::process::id());
    let value=evaluate(endpoint,&format!("(async()=>{{const d=window[Symbol.for('code-codex:document-connection-owner:v2')];if(!d||d.nativeBinding!=={}||typeof d.identity!=='string'||d.identity.length>256)return null;const bytes=new TextEncoder().encode(d.identity);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}})()",json!(binding))).await?;
    Ok(value.as_str().filter(|s|s.len()==64&&s.bytes().all(|c|c.is_ascii_hexdigit())).map(str::to_owned))
}

async fn evaluate(endpoint: CdpEndpoint, expression: &str) -> Result<Value> {
    evaluate_budget(endpoint,expression,Duration::from_secs(12)).await
}
pub(super) async fn evaluate_budget(endpoint:CdpEndpoint,expression:&str,budget:Duration)->Result<Value>{
    let targets = TargetDiscovery::new()
        .map_err(|_| AccountError::protocol("Host discovery unavailable."))?
        .targets(endpoint)
        .await
        .map_err(|_| AccountError::protocol("Host endpoint unavailable."))?;
    let pages: Vec<_> = targets
        .into_iter()
        .filter(|t| t.target_type == "page" && t.url == "app://-/index.html")
        .collect();
    if pages.len() != 1 {
        return Err(AccountError::protocol(
            "A unique native main page is required.",
        ));
    }
    let url = url::Url::parse(&pages[0].web_socket_debugger_url)
        .map_err(|_| AccountError::protocol("Invalid native endpoint."))?;
    if url.scheme() != "ws"
        || url.host_str() != Some("127.0.0.1")
        || url.port() != Some(endpoint.port())
    {
        return Err(AccountError::protocol(
            "Non-owned native endpoint rejected.",
        ));
    }
    tokio::time::timeout(budget,async{
        let (mut socket,_)=tokio_tungstenite::connect_async(url.as_str()).await.map_err(|_|AccountError::protocol("Host observation connection failed."))?;
        socket.send(Message::Text(json!({"id":1,"method":"Runtime.evaluate","params":{"expression":expression,"awaitPromise":true,"returnByValue":true}}).to_string().into())).await.map_err(|_|AccountError::protocol("Host observation send failed."))?;
        while let Some(message)=socket.next().await {let Message::Text(text)=message.map_err(|_|AccountError::protocol("Host observation disconnected."))? else{continue};if text.len()>1024*1024{return Err(AccountError::protocol("Host metadata exceeded its bound."));}let value:Value=serde_json::from_str(&text).map_err(|_|AccountError::protocol("Invalid host metadata."))?;if value["id"]!=1{continue;}if !value["result"]["exceptionDetails"].is_null(){return Err(AccountError::protocol("Native thread metadata could not be verified."));}return Ok(value["result"]["result"]["value"].clone());}Err(AccountError::protocol("Host metadata ended without a result."))
    }).await.map_err(|_|AccountError::protocol("Host metadata timed out."))?
}

#[derive(Clone)]
pub struct Owner {
    pub id: String,
    pub label: String,
    pub plan: Option<String>,
}

static CURRENT_PROFILE: std::sync::OnceLock<std::sync::RwLock<Value>> = std::sync::OnceLock::new();
pub fn profile()->Value {CURRENT_PROFILE.get_or_init(||std::sync::RwLock::new(Value::Null)).read().unwrap_or_else(std::sync::PoisonError::into_inner).clone()}

/// Version is diagnostic metadata. Qualification checks official module roles before owner state.
pub async fn verify_profile(endpoint:CdpEndpoint)->Result<()> {
 let manifest=tokio::task::spawn_blocking(discover_modules).await.map_err(|_|AccountError::protocol("Host module discovery worker failed."))??;
 let source=include_str!("../../../../resources/account-host-capabilities.js").replace("export ","");
 let expression=format!("(async()=>{{{};try{{const profile=await qualifyHostModules({});window[Symbol.for('code-codex:account-host-profile:v1')]=profile;return profile;}}catch(error){{return {{failure:{{code:error?.code==='ACCOUNT_HOST_UNSUPPORTED'?error.code:'ACCOUNT_HOST_PROBE',message:String(error?.message??'Host module probe failed').slice(0,1024)}}}};}}}})()",source,manifest);
 let mut selected=evaluate(endpoint,&expression).await?;
 if let Some(code)=selected["failure"]["code"].as_str(){return Err(AccountError::new(code,selected["failure"]["message"].as_str().unwrap_or("Host capability probe failed before loading account state.")));}
 if selected["compatibility"]!="capabilities" || !selected["managerExport"].is_string() || !selected["dispatcherExport"].is_string(){return Err(AccountError::new("ACCOUNT_HOST_UNSUPPORTED","Required host interfaces are unavailable. stage=capability-probe; accountStateLoaded=false; no task was sent."));}
 selected["appearance"]=manifest["appearance"].clone();selected["fingerprints"]=manifest["fingerprints"].clone();
 let publish=format!("window[Symbol.for('code-codex:account-host-profile:v1')]=Object.freeze({});true",selected);evaluate(endpoint,&publish).await?;
 *CURRENT_PROFILE.get_or_init(||std::sync::RwLock::new(Value::Null)).write().unwrap_or_else(std::sync::PoisonError::into_inner)=selected;
 crate::runtime_log::record("accounts","account.compatibility","confirmed",json!({"stage":"capability-probe","observedVersion":manifest["version"],"policy":"capabilities","versionRestricted":false,"accountStateLoaded":false,"taskSent":false}));
 Ok(())
}
fn discover_modules()->Result<Value>{
 let install=crate::discovery::discover_codex(None,None,crate::discovery::ChannelPreference::Stable).map_err(|_|AccountError::new("ACCOUNT_HOST","The official Codex host could not be located."))?;
 let mut file=std::fs::File::open(install.executable.parent().ok_or_else(||AccountError::protocol("Invalid host installation."))?.join("resources/app.asar")).map_err(|_|AccountError::protocol("The host bundle cannot be inspected."))?;
 let mut bytes=[0u8;16];file.read_exact(&mut bytes).map_err(|_|AccountError::protocol("Invalid host bundle header."))?;
 let header_size=u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as u64;
 let json_size=u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
 if json_size>16*1024*1024{return Err(AccountError::protocol("Host bundle metadata exceeds its bound."));}
 let mut header=vec![0u8;json_size];file.read_exact(&mut header).map_err(|_|AccountError::protocol("Host bundle metadata is incomplete."))?;
 let header:Value=serde_json::from_slice(&header).map_err(|_|AccountError::protocol("Host bundle metadata is invalid."))?;
 let entries=header["files"]["webview"]["files"]["assets"]["files"].as_object().ok_or_else(||AccountError::protocol("Official host assets are unavailable."))?;
 let appearance:Vec<_>=entries.keys().filter(|n|n.starts_with("run-app-action-in-primary-window-")&&n.ends_with(".js")&&n.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b))).take(5).map(|n|format!("./assets/{n}")).collect();
 let mut initial=Vec::new();let mut shared=Vec::new();let mut fingerprints=serde_json::Map::new();
 for (name,entry) in entries {
  let role=if name.starts_with("app-initial-"){&mut initial}else if name.starts_with("app-shared-"){&mut shared}else{continue};
  if !name.ends_with(".js")||!name.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b)){continue;}
  if role.len()>=4{return Err(AccountError::new("ACCOUNT_HOST_UNSUPPORTED","Too many official module candidates. stage=module-discovery; accountStateLoaded=false; no task was sent."));}
  let offset=entry["offset"].as_str().and_then(|v|v.parse::<u64>().ok()).ok_or_else(||AccountError::protocol("Invalid official module offset."))?;
  let size=entry["size"].as_u64().filter(|n|*n<=40*1024*1024).ok_or_else(||AccountError::protocol("Invalid official module length."))?;
  let position=8u64.checked_add(header_size).and_then(|n|n.checked_add(offset)).ok_or_else(||AccountError::protocol("Official module offset overflow."))?;
  file.seek(SeekFrom::Start(position)).map_err(|_|AccountError::protocol("Invalid official module offset."))?;
  let mut data=vec![0u8;size as usize];file.read_exact(&mut data).map_err(|_|AccountError::protocol("Incomplete official module."))?;
  fingerprints.insert(name.clone(),json!(format!("{:x}",Sha256::digest(&data))));role.push(format!("./assets/{name}"));
 }
 Ok(json!({"version":install.version,"initial":initial,"shared":shared,"appearance":appearance,"fingerprints":fingerprints}))
}

pub async fn observe(endpoint: CdpEndpoint) -> Result<Owner> {
    let discovery = TargetDiscovery::new()
        .map_err(|_| AccountError::protocol("Native host discovery failed."))?;
    let targets = discovery.targets(endpoint).await.map_err(|_| {
        AccountError::new(
            "ACCOUNT_HOST",
            "The launch-owned Codex endpoint is unavailable.",
        )
    })?;
    let pages: Vec<_> = targets
        .into_iter()
        .filter(|t| t.target_type == "page" && t.url == "app://-/index.html")
        .collect();
    if pages.len() != 1 {
        return Err(AccountError::new(
            "ACCOUNT_HOST_AMBIGUOUS",
            "A unique official Codex main document is required for account selection.",
        ));
    }
    let url = url::Url::parse(&pages[0].web_socket_debugger_url)
        .map_err(|_| AccountError::protocol("Invalid native host endpoint."))?;
    if url.scheme() != "ws"
        || url.host_str() != Some("127.0.0.1")
        || url.port() != Some(endpoint.port())
    {
        return Err(AccountError::protocol(
            "Native account observation rejected a non-owned endpoint.",
        ));
    }
    let task = async {
        let (mut socket, _) =
            tokio_tungstenite::connect_async(pages[0].web_socket_debugger_url.as_str())
                .await
                .map_err(|_| {
                    AccountError::protocol("Connecting the native account observer failed.")
                })?;
        let expression = include_str!("host_identity.js").replace("__HOST_SHARED__",&profile()["shared"].to_string()).replace("__HOST_DISPATCHER__",&profile()["dispatcherExport"].to_string());
        socket.send(Message::Text(json!({"id":1,"method":"Runtime.evaluate","params":{"expression":expression,"awaitPromise":true,"returnByValue":true}}).to_string().into())).await.map_err(|_|AccountError::protocol("Native account observation could not be sent."))?;
        while let Some(message) = socket.next().await {
            let message = message
                .map_err(|_| AccountError::protocol("Native account observation disconnected."))?;
            let Message::Text(text) = message else {
                continue;
            };
            if text.len() > 1024 * 1024 {
                return Err(AccountError::protocol(
                    "Native account observation exceeded its bound.",
                ));
            }
            let value: Value = serde_json::from_str(&text)
                .map_err(|_| AccountError::protocol("Invalid account observation envelope."))?;
            if value["id"] != 1 {
                continue;
            }
            if !value["result"]["exceptionDetails"].is_null() {
                return Err(AccountError::new(
                    "ACCOUNT_HOST_IDENTITY",
                    "The current native account could not be verified. Sign in and retry.",
                ));
            }
            let account = &value["result"]["result"]["value"];
            if let Some(failure)=account.get("failure") {
                let code=match failure["code"].as_str(){Some("ACCOUNT_WORKSPACE_ROUTING")=>"ACCOUNT_WORKSPACE_ROUTING",Some("ACCOUNT_HOST_TIMEOUT")=>"ACCOUNT_HOST_TIMEOUT",Some("ACCOUNT_SIGN_IN")=>"ACCOUNT_SIGN_IN",_=>"ACCOUNT_HOST_IDENTITY"};
                let reason=failure["reason"].as_str().filter(|v|v.len()<=64&&v.bytes().all(|c|c.is_ascii_lowercase()||c==b'-')).unwrap_or("official-read-invalid-result");
                crate::runtime_log::record("accounts","account.host-read","failed",json!({"stage":"official-owner-read","errorCode":code,"reason":reason,"rpcCode":failure["rpcCode"].as_i64(),"attempts":failure["attempts"].as_u64(),"durationMs":failure["elapsedMs"].as_u64(),"steps":failure["steps"],"taskSent":false,"credentialsChanged":false,"accountStateChanged":false}));
                return Err(AccountError::new(code,format!("Official account observation failed. stage=official-owner-read; reason={reason}; rpcCode={}; attempts={}; elapsedMs={}; taskSent=false; credentialsChanged=false; existing account state retained. Retry the read after connectivity or the official workspace recovers.",failure["rpcCode"].as_i64().map(|v|v.to_string()).unwrap_or_else(||"unavailable".into()),failure["attempts"].as_u64().unwrap_or(0),failure["elapsedMs"].as_u64().unwrap_or(0))));
            }
            if account["observation"]["recovered"]==true {
                crate::runtime_log::record("accounts","account.host-read","recovered",json!({"stage":"official-owner-read","attempts":account["observation"]["attempts"],"durationMs":account["observation"]["elapsedMs"],"steps":account["observation"]["steps"],"taskSent":false,"credentialsChanged":false}));
            }
            let email = account["email"]
                .as_str()
                .filter(|e| !e.is_empty() && e.len() < 320)
                .ok_or_else(|| {
                    AccountError::new(
                        "ACCOUNT_SIGN_IN",
                        "Sign in to the official Codex host before using account connections.",
                    )
                })?;
            let workspace = account["workspace"].as_str().unwrap_or("");
            let id = format!(
                "{:x}",
                Sha256::digest(
                    format!("code-codex-owner-v1\0{}\0{workspace}", email.to_lowercase())
                        .as_bytes()
                )
            );
            let _ = socket.close(None).await;
            return Ok(Owner {
                id,
                label: email.to_string(),
                plan: account["plan"].as_str().filter(|s|s.len()<=40).map(str::to_owned),
            });
        }
        Err(AccountError::protocol(
            "The native account observer ended before returning an identity.",
        ))
    };
    tokio::time::timeout(Duration::from_secs(12), task)
        .await
        .map_err(|_| {
            AccountError::new(
                "ACCOUNT_HOST_TIMEOUT",
                "The native host account observation timed out.",
            )
        })?
}
