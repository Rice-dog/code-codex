//! Per-connection advertised model lists. Credentials stay in the native vault.
use super::{AccountError, AccountService, Result, api, host, identifier, text};
use cdp_client::CdpEndpoint;
use serde_json::{Value, json};
use std::time::Duration;

fn failure(stage: &str) -> AccountError {
    AccountError::new("ACCOUNT_API_MODELS", format!("API model catalog is unavailable. stage={stage}; the existing model selection was retained."))
}
pub(super) fn parse(value: &Value) -> Result<Vec<String>> {
    let data = value["data"].as_array().ok_or_else(|| failure("response-schema"))?;
    if data.len() > 2048 { return Err(failure("model-count")); }
    let mut ids = Vec::new();
    for model in data {
        let id = model["id"].as_str().ok_or_else(|| failure("model-id"))?;
        let parsed = api::Settings::parse("https://model-validation.invalid", id).map_err(|_| failure("model-id"))?;
        if parsed.model != id { return Err(failure("model-id")); }
        if !ids.iter().any(|existing| existing == id) { ids.push(id.to_owned()); }
    }
    if ids.is_empty() { return Err(failure("empty-catalog")); }
    Ok(ids)
}
async fn fetch(settings: &api::Settings, key: &str) -> Result<Vec<String>> {
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10)).build().map_err(|_| failure("client"))?;
    let mut response = client.get(format!("{}/models", settings.base_url))
        .header("user-agent", "codex_cli_rs").header("originator", "codex_cli_rs")
        .bearer_auth(key).send().await.map_err(|_| failure("network"))?;
    if !response.status().is_success() {
        return Err(failure(&format!("http-{}", response.status().as_u16())));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| failure("response-read"))? {
        if bytes.len() + chunk.len() > 1024 * 1024 { return Err(failure("response-budget")); }
        bytes.extend_from_slice(&chunk);
    }
    parse(&serde_json::from_slice::<Value>(&bytes).map_err(|_| failure("response-json"))?)
}
async fn available(settings:&api::Settings,key:&str)->Result<Vec<String>>{
    if let Some(models)=&settings.models {Ok(models.clone())}else{fetch(settings,key).await}
}
pub(super) async fn request(
    service: &AccountService, endpoint: CdpEndpoint, owner: &host::Owner,
    params: &Value, current: impl Fn() -> bool,
) -> Result<Value> {
    if params["action"]=="api.catalog" {
        let settings=api::Settings::parse(text(params,"baseUrl")?,"catalog-validation")?;
        let key=text(params,"apiKey")?;api::validate_key(key)?;
        let models=fetch(&settings,key).await?;
        if models.len()>256{return Err(failure("editor-model-count"));}
        if !current()||host::observe(endpoint).await?.id!=owner.id{return Err(failure("session-changed"));}
        return Ok(json!({"models":models}));
    }
    let id = identifier(params, "connectionId")?;
    let root = super::owner_root(&owner.id)?;
    let (generation, settings) = {
        let all = service.state.lock().await;
        let state = all.get(&owner.id).ok_or_else(|| failure("session"))?;
        let api = state.registry.connections.iter().find(|c| c.id == id).and_then(|c| c.api.clone()).ok_or_else(|| failure("connection"))?;
        (state.generation.clone(), api)
    };
    let key = api::read(&super::retention::home(&root, id)?)?;
    let catalog = available(&settings,&key).await;
    if !current() || host::observe(endpoint).await?.id != owner.id { return Err(failure("session-changed")); }
    let selecting = params["action"] == "api.model";
    let _guard = if selecting {
        Some(tokio::time::timeout(Duration::from_secs(15), service.native_route_lock.lock()).await.map_err(|_| failure("transition-busy"))?)
    } else { None };
    if selecting {
        for route in service.relays.owned(&owner.id).iter().filter(|route| route.connection() == id) {
            super::native_route::require_idle(endpoint, &route.thread()).await?;
        }
    }
    let mut all = service.state.lock().await;
    let state = all.get_mut(&owner.id).ok_or_else(|| failure("session"))?;
    let original = state.registry.connections.iter().find(|c| c.id == id).and_then(|c| c.api.as_ref()).ok_or_else(|| failure("connection"))?;
    if !current() || state.generation != generation || serde_json::to_value(original).ok() != serde_json::to_value(&settings).ok() {
        return Err(failure("connection-changed"));
    }
    if !selecting {
        return Ok(match catalog {
            Ok(models) => json!({"models":models,"selected":settings.model,"source":"api","warning":null}),
            Err(error) => json!({"models":[settings.model],"selected":settings.model,"source":"configured","warning":error.message}),
        });
    }
    let model = text(params, "model")?;
    let models = catalog.unwrap_or_else(|_| vec![settings.model.clone()]);
    if !models.iter().any(|id| id == model) { return Err(failure("model-not-advertised")); }
    if state.active.values().any(|connection| connection == id) {
        return Err(AccountError::new("ACCOUNT_TURN_ACTIVE", "Finish the active task before changing its model."));
    }
    let mut registry = state.registry.clone();
    let target = registry.connections.iter_mut().find(|c| c.id == id).and_then(|c| c.api.as_mut()).ok_or_else(|| failure("connection"))?;
    target.model = model.into();
    super::save(&root, &registry)?;
    state.registry = registry;
    Ok(json!({"selected":model}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn saved_model_filter_is_authoritative_and_does_not_refetch_removed_models(){
        let settings=api::Settings::parse("https://unreachable.invalid/v1","one").unwrap().with_models(Some(&json!(["one","vendor/two"]))).unwrap();
        let models=available(&settings,"synthetic-key").await.unwrap();assert_eq!(models,vec!["one","vendor/two"]);assert!(!models.iter().any(|m|m=="removed"));
    }
    #[test]
    fn catalog_is_bounded_deduplicated_and_preserves_exact_ids() {
        assert_eq!(parse(&json!({"data":[{"id":"vendor/gpt-6"},{"id":"vendor/gpt-6"},{"id":"GPT-6-pro"}]})).unwrap(), vec!["vendor/gpt-6", "GPT-6-pro"]);
        for value in [json!({}),json!({"data":[]}),json!({"data":[{"id":"bad model"}]}),json!({"data":[{"id":"injected\nvalue"}]}),json!({"data":[{"id":" model "}]})] {
            assert!(parse(&value).is_err());
        }
        assert!(parse(&json!({"data":vec![json!({"id":"model"});2049]})).is_err());
    }
    #[tokio::test]
    #[ignore = "Requires an explicitly selected local connection and live API credential; never runs in ordinary tests."]
    async fn live_selected_connection_catalog() {
        let owner = std::env::var("CC_CATALOG_OWNER").expect("Explicit owner required");
        let id = std::env::var("CC_CATALOG_CONNECTION").expect("Explicit connection required");
        assert!(owner.len() == 64 && owner.bytes().all(|c| c.is_ascii_hexdigit()));
        assert!(super::super::valid_id(&id));
        let root = std::path::PathBuf::from(std::env::var("CC_CATALOG_ROOT").expect("Explicit account storage root required")).join(owner);
        let registry: Value = serde_json::from_slice(&std::fs::read(root.join("connections.json")).unwrap()).unwrap();
        let connection = registry["connections"].as_array().unwrap().iter().find(|c| c["id"] == id).unwrap();
        let settings: api::Settings = serde_json::from_value(connection["api"].clone()).unwrap();
        let key = api::read(&super::super::retention::home(&root, &id).unwrap()).unwrap();
        let models = fetch(&settings, &key).await.unwrap();
        println!("CATALOG_ACCEPTANCE {}", json!({"models":models,"configured":settings.model,"inferenceRequests":0,"credentialLogged":false}));
    }
    #[tokio::test]
    async fn fetch_sends_native_client_headers_and_only_its_api_key() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut bytes = Vec::new(); let mut part = [0u8; 1024];
            while !bytes.ends_with(b"\r\n\r\n") { let n = socket.read(&mut part).unwrap(); assert!(n > 0); bytes.extend_from_slice(&part[..n]); }
            let request = String::from_utf8(bytes).unwrap().to_lowercase();
            assert!(request.starts_with("get /v1/models http/1.1\r\n"));
            assert!(request.contains("\r\nuser-agent: codex_cli_rs\r\n"));
            assert!(request.contains("\r\noriginator: codex_cli_rs\r\n"));
            assert!(request.contains("\r\nauthorization: bearer synthetic-key\r\n"));
            assert!(!request.contains("chatgpt-account-id") && !request.contains("cookie:"));
            let body = r#"{"data":[{"id":"vendor/model"}]}"#;
            write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let settings = api::Settings::parse(&format!("http://{address}/v1"), "configured").unwrap();
        assert_eq!(fetch(&settings, "synthetic-key").await.unwrap(), vec!["vendor/model"]);
        server.join().unwrap();
    }
}
