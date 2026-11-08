//! One bounded official fallback for a gateway response before any asset body.
//! No credentials, mirror URLs, alternate hashes or background refresh tasks.
use super::{Package, error};
use cdp_client::BridgeError;
use serde::Deserialize;
use serde_json::json;
use std::{collections::HashMap, sync::{Mutex, OnceLock}, time::{Duration, Instant}};

const REPOSITORY: &str = "https://api.github.com/repos/Rice-dog/code-codex";
const METADATA_LIMIT: usize = 2 * 1024 * 1024;
const CACHE_TTL: Duration = Duration::from_secs(600);
const GATEWAY_COOLDOWN: Duration = Duration::from_secs(60);
fn gateway_failure()-> &'static Mutex<Option<Instant>> {
    static FAILURE:OnceLock<Mutex<Option<Instant>>>=OnceLock::new();
    FAILURE.get_or_init(||Mutex::new(None))
}
pub(super) fn prefer_api()->bool {
    gateway_failure().lock().ok().is_some_and(|at|at.is_some_and(|t|t.elapsed()<GATEWAY_COOLDOWN))
}
pub(super) fn record_gateway_failure() {
    if let Ok(mut at)=gateway_failure().lock(){*at=Some(Instant::now());}
}
#[derive(Clone, Deserialize)]
struct Asset { id:u64, name:String, state:String, size:u64, digest:Option<String> }
#[derive(Deserialize)]
struct Release { tag_name:String, draft:bool, assets:Vec<Asset> }
type Cache = HashMap<String,(Instant,Vec<Asset>)>;
fn cache()-> &'static Mutex<Cache> {
    static CACHE:OnceLock<Mutex<Cache>>=OnceLock::new();
    CACHE.get_or_init(Default::default)
}
pub(super) fn trusted_api_asset(url:&url::Url)->bool {
    url.host_str()==Some("api.github.com")
        && url.fragment().is_none()
        && matches!(url.query(),None|Some("download=1"))
        && url.path().strip_prefix("/repos/Rice-dog/code-codex/releases/assets/")
            .is_some_and(|id| !id.is_empty()&&id.len()<=20&&id.bytes().all(|c|c.is_ascii_digit()))
}
async fn release_assets(client:&reqwest::Client,p:&Package,parent:u64)->Result<Vec<Asset>,BridgeError> {
    if let Ok(cache)=cache().lock() {
        if let Some((at,assets))=cache.get(&p.release_tag).filter(|(at,_)|at.elapsed()<CACHE_TTL) {
            crate::runtime_log::record("plugin-package","official release metadata","cache hit",json!({"parentOperationId":parent,"releaseTag":p.release_tag,"ageMs":at.elapsed().as_millis()}));
            return Ok(assets.clone());
        }
    }
    let endpoint=format!("{REPOSITORY}/releases/tags/{}",p.release_tag);
    let mut trace=crate::network_diagnostics::HttpTrace::start("plugin-package",&endpoint,10_000,10_000,json!({"parentOperationId":parent,"phase":"official-api-metadata","releaseTag":p.release_tag}));
    let result=async {
        let mut response=trace.send(client.get(&endpoint).timeout(Duration::from_secs(10)).header("Accept","application/vnd.github+json")).await
            .map_err(|e|crate::network_diagnostics::transport_error("PLUGIN","official API metadata",&p.id,&e))?;
        if !response.status().is_success(){return Err(crate::network_diagnostics::http_error("PLUGIN","official API metadata",&response));}
        if response.url().as_str()!=endpoint {return Err(error("PLUGIN_API_METADATA","Official release metadata used an unexpected endpoint."));}
        let mut bytes=Vec::new();
        while let Some(chunk)=response.chunk().await.map_err(|e|crate::network_diagnostics::transport_error("PLUGIN","official API metadata body",&p.id,&e))? {
            if bytes.len().saturating_add(chunk.len())>METADATA_LIMIT{return Err(error("PLUGIN_API_METADATA","Official release metadata exceeded its size bound."));}
            bytes.extend_from_slice(&chunk);
        }
        let release:Release=serde_json::from_slice(&bytes).map_err(|_|error("PLUGIN_API_METADATA","Official release metadata does not satisfy its response contract."))?;
        if release.draft||release.tag_name!=p.release_tag||release.assets.len()>2048 {
            return Err(error("PLUGIN_API_METADATA","Official release metadata does not match the pinned public release."));
        }
        Ok(release.assets)
    }.await;
    match &result {
        Ok(assets)=>trace.operation.finish("passed",json!({"assetCount":assets.len(),"releaseTag":p.release_tag})),
        Err(e)=>trace.operation.finish("failed",json!({"code":e.code,"phase":"official-api-metadata"})),
    }
    let assets=result?;
    if let Ok(mut entries)=cache().lock() {
        entries.retain(|_,(at,_)|at.elapsed()<CACHE_TTL);
        if entries.len()>=8 {
            if let Some(oldest)=entries.iter().max_by_key(|(_, (at,_))|at.elapsed()).map(|(tag,_)|tag.clone()){entries.remove(&oldest);}
        }
        entries.insert(p.release_tag.clone(),(Instant::now(),assets.clone()));
    }
    Ok(assets)
}
pub(super) async fn recover(client:&reqwest::Client,p:&Package,parent:u64)->Result<reqwest::Response,BridgeError> {
    let assets=release_assets(client,p,parent).await?;
    let matches=assets.iter().filter(|a|a.name==p.asset).collect::<Vec<_>>();
    if matches.len()!=1{return Err(error("PLUGIN_API_ASSET","The pinned asset is absent or ambiguous in the official release."));}
    let asset=matches[0];
    if asset.id==0||asset.state!="uploaded"||asset.size!=p.size as u64
        ||asset.digest.as_ref().is_some_and(|d|d!=&format!("sha256:{}",p.sha256)) {
        return Err(error("PLUGIN_INTEGRITY","Official API asset metadata disagrees with the trusted catalog."));
    }
    let endpoint=format!("{REPOSITORY}/releases/assets/{}?download=1",asset.id);
    let mut trace=crate::network_diagnostics::HttpTrace::start("plugin-package",&endpoint,10_000,120_000,json!({"parentOperationId":parent,"phase":"official-api-asset","asset":p.asset,"releaseTag":p.release_tag,"expectedBytes":p.size}));
    let result=trace.send(client.get(&endpoint).header("Accept","application/octet-stream")).await
        .map_err(|e|crate::network_diagnostics::transport_error("PLUGIN","official API asset",&p.id,&e));
    let response=match result {
        Ok(response) if response.status().is_success()=>response,
        Ok(response)=>{let failure=crate::network_diagnostics::http_error("PLUGIN","official API asset",&response);trace.operation.finish("failed",json!({"status":response.status().as_u16(),"code":failure.code}));return Err(failure)},
        Err(failure)=>{trace.operation.finish("failed",json!({"code":failure.code}));return Err(failure)}
    };
    trace.operation.finish("handed-off",json!({"bodyOwnerOperationId":parent,"integrityVerified":false,"remainingGate":"pinned size/SHA256 and cache commit"}));
    Ok(response)
}
