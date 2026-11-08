//! Explicit Responses connections. Keys are stored in the native credential vault,
//! never in registry, general info, resume configuration or diagnostics. Only an explicit
//! owner-qualified editor request returns the key to its transient password field.
use super::{AccountError, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub(super) struct Settings { pub base_url:String, pub model:String, #[serde(default,skip_serializing_if="Option::is_none")] pub models:Option<Vec<String>> }
impl Settings {
    pub fn with_models(mut self,value:Option<&serde_json::Value>)->Result<Self>{
        if let Some(value)=value {
            let items=value.as_array().ok_or_else(||invalid("models-schema"))?;
            if items.is_empty()||items.len()>256{return Err(invalid("models-count"));}
            let mut models=Vec::new();
            for item in items {
                let id=item.as_str().ok_or_else(||invalid("model-id"))?;
                let parsed=Self::parse(&self.base_url,id)?;
                if parsed.model!=id||models.contains(&parsed.model){return Err(invalid("models-exact-id"));}
                models.push(parsed.model);
            }
            if !models.contains(&self.model){return Err(invalid("default-model-not-enabled"));}
            self.models=Some(models);
        }
        Ok(self)
    }
    pub fn valid(&self)->bool{
        let value=self.models.as_ref().map(|models|serde_json::json!(models));
        Self::parse(&self.base_url,&self.model).and_then(|s|s.with_models(value.as_ref())).is_ok()
    }
    pub fn parse(base:&str,model:&str)->Result<Self>{
        let mut url=reqwest::Url::parse(base.trim()).map_err(|_|invalid("endpoint-parse"))?;
        let local=matches!(url.host_str(),Some("localhost"|"127.0.0.1"|"[::1]"));
        if base.len()>2048 || url.host_str().is_none() || !(url.scheme()=="https" || local&&url.scheme()=="http") || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some(){return Err(invalid("endpoint-origin"));}
        let path=url.path().trim_end_matches('/').to_owned();
        if path.ends_with("/responses") || path.ends_with("/responses/compact") || path.contains("/console"){return Err(invalid("endpoint-base-path"));}
        url.set_path(&path);
        let model=model.trim();
        if model.is_empty()||model.len()>160||!model.bytes().all(|c|c.is_ascii_alphanumeric()||b"-_.:/".contains(&c)){return Err(invalid("model-id"));}
        Ok(Self{base_url:url.to_string().trim_end_matches('/').into(),model:model.into(),models:None})
    }
}
fn invalid(stage:&str)->AccountError{AccountError::new("ACCOUNT_API_CONFIGURATION",format!("Invalid Responses connection. stage={stage}; use an HTTPS API base URL (HTTP is allowed only for loopback), without credentials/query/fragment, and an explicit model ID. No request was sent."))}
pub(super) fn validate_key(key:&str)->Result<()>{
    if key.is_empty()||key.len()>2400||!key.bytes().all(|c|c.is_ascii_graphic()) {return Err(AccountError::new("ACCOUNT_API_KEY","The API key must contain 1-2400 printable ASCII characters without whitespace. No request was sent."));}Ok(())
}
fn target(home:&Path)->Result<Vec<u16>>{
    use sha2::{Digest,Sha256};
    workspace_service::application_paths::validate_directory_path(home).map_err(|_|invalid("credential-path"))?;
    let canonical=std::fs::canonicalize(home).map_err(|_|invalid("credential-home"))?;
    // Same managed target convention as the installer Purge and credentials::delete.
    let hash=format!("{:x}",Sha256::digest(canonical.to_string_lossy().as_bytes()));
    Ok(format!("secrets|{}.codex",&hash[..16]).encode_utf16().chain(Some(0)).collect())
}
pub(super) fn store(home:&Path,key:&str)->Result<()>{
    validate_key(key)?;let target=target(home)?;
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::Security::Credentials::{CREDENTIALW,CredWriteW};
        let mut bytes=key.as_bytes().to_vec();
        let credential=CREDENTIALW{Type:1,TargetName:target.as_ptr() as _,CredentialBlobSize:bytes.len() as u32,CredentialBlob:bytes.as_mut_ptr(),Persist:2,..std::mem::zeroed()};
        let ok=CredWriteW(&credential,0)!=0;bytes.fill(0);
        if !ok{return Err(AccountError::new("ACCOUNT_API_KEY_STORAGE","The API key could not be stored in Windows Credential Manager. No connection was added."));}Ok(())
    }
    #[cfg(not(windows))] {let _=(home,key,target);Err(AccountError::new("ACCOUNT_API_KEY_STORAGE","This build has no supported native API credential vault."))}
}
pub(super) fn read(home:&Path)->Result<String>{
    let target=target(home)?;
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::Security::Credentials::{CredReadW,CredFree};
        let mut raw=std::ptr::null_mut();
        if CredReadW(target.as_ptr(),1,0,&mut raw)==0{return Err(AccountError::new("ACCOUNT_API_KEY_MISSING","The API credential is unavailable. Edit this connection and enter its key again. No fallback account was used."));}
        let item=&*raw;
        let value=if item.CredentialBlobSize>0&&item.CredentialBlobSize<=2400&&!item.CredentialBlob.is_null(){String::from_utf8(std::slice::from_raw_parts(item.CredentialBlob,item.CredentialBlobSize as usize).to_vec()).ok()}else{None};
        CredFree(raw as _);let key=value.ok_or_else(||invalid("credential-shape"))?;validate_key(&key)?;Ok(key)
    }
    #[cfg(not(windows))] {let _=target;Err(AccountError::new("ACCOUNT_API_KEY_STORAGE","This build has no supported native API credential vault."))}
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn enabled_models_are_explicit_bounded_and_migrate_legacy(){
        use serde_json::json;
        let legacy:Settings=serde_json::from_value(json!({"baseUrl":"https://example.invalid/v1","model":"one"})).unwrap();
        assert!(legacy.models.is_none()&&legacy.valid());
        let chosen=Settings::parse("https://example.invalid/v1","one").unwrap().with_models(Some(&json!(["one","vendor/two"]))).unwrap();
        assert!(chosen.valid());assert_eq!(serde_json::to_value(&chosen).unwrap()["models"],json!(["one","vendor/two"]));
        for value in [json!([]),json!(["other"]),json!(["one","one"]),json!(["one"," bad"]),json!(false),json!(["one",null]),json!(vec!["one";257])] {
            assert!(Settings::parse("https://example.invalid/v1","one").unwrap().with_models(Some(&value)).is_err());
        }
        let bad:Settings=serde_json::from_value(json!({"baseUrl":"https://example.invalid/v1","model":"one","models":["other"]})).unwrap();assert!(!bad.valid());
    }
    #[test] fn endpoint_and_key_boundaries(){
        assert_eq!(Settings::parse("https://example.invalid/v1/","vendor/model-1").unwrap().base_url,"https://example.invalid/v1");
        assert!(Settings::parse("http://127.0.0.1:3456/v1","model").is_ok());
        for base in ["http://example.invalid/v1","https://user:secret@example.invalid/v1","https://example.invalid/v1?key=secret","https://example.invalid/v1#secret","https://example.invalid/v1/responses","https://example.invalid/console"] {assert!(Settings::parse(base,"model").is_err());}
        for model in ["","model\nsecret","model with spaces"]{assert!(Settings::parse("https://example.invalid/v1",model).is_err());}
        for key in ["","secret\nheader"," secret","secret "]{assert!(validate_key(key).is_err());}
    }
    #[test] #[cfg(windows)] fn isolated_native_vault_roundtrip_and_delete(){
        let dir=tempfile::tempdir().unwrap();store(dir.path(),"synthetic-api-credential").unwrap();assert_eq!(read(dir.path()).unwrap(),"synthetic-api-credential");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(),0);super::super::credentials::delete(dir.path()).unwrap();assert!(read(dir.path()).is_err());
    }
}
