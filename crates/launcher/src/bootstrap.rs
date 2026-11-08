use std::path::{Path, PathBuf};

use cdp_client::CapabilityToken;
#[cfg(test)]
use cdp_client::{PRIMARY_BINDING_NAME, PRIMARY_RECEIVER_NAME};
use serde::Serialize;
use thiserror::Error;

const MAX_UI_BUNDLE_BYTES: u64 = 16 * 1024 * 1024;
const EMBEDDED_UI_BUNDLE: &str = include_str!("../../../packages/explorer-ui/dist/explorer.js");

#[derive(Debug, Clone, Error)]
pub enum BootstrapError {
    #[error("{operation}: {error}; {detail}")]
    Context {
        operation: &'static str,
        detail: String,
        #[source]
        error: Box<BootstrapError>,
    },
    #[error("the Explorer UI bundle was not found")]
    BundleNotFound,
    #[error("the Explorer UI bundle is invalid")]
    InvalidBundle,
}

impl BootstrapError {
    pub fn context(self, operation: &'static str, detail: impl std::fmt::Display) -> Self {
        Self::Context {
            operation,
            detail: detail.to_string().chars().take(1024).collect(),
            error: Box::new(self),
        }
    }
    pub fn kind(&self) -> &Self {
        match self {
            Self::Context { error, .. } => error.kind(),
            other => other,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapMetadata<'a> {
    token: &'a str,
    binding: &'a str,
    receiver: &'a str,
    codex_version: &'a str,
    channel: &'a str,
    compatible: bool,
    manual_workspace: bool,
    startup_splash_active: bool,
    centralized_storage: bool,
    language: workspace_service::ui_language::Preference,
    appearance_modules: &'a serde_json::Value,
}

/// Inventory only the verified installation's role names; never initialize accounts
/// or execute official actions here. Renderer capability/response checks remain required.
pub fn appearance_module_hints(executable: Option<&Path>) -> serde_json::Value {
    let result = executable.ok_or("installation-unavailable").and_then(|p| {
        let path=p.parent().ok_or("installation-parent")?.join("resources/app.asar");
        read_appearance_modules(&path)
    });
    let (value,stage)=match result {
        Ok(v)=>(v,"module-inventory"),
        Err(stage)=>(serde_json::json!({"schema":1,"initial":[],"appearance":[],"stage":stage}),stage),
    };
    crate::runtime_log::record("appearance","official module inventory",if stage=="module-inventory"{"discovered"}else{"unavailable"},serde_json::json!({"stage":stage,"initialCandidates":value["initial"].as_array().map(Vec::len).unwrap_or(0),"actionCandidates":value["appearance"].as_array().map(Vec::len).unwrap_or(0),"accountRuntimeRequired":false,"settingChanged":false}));
    value
}

/// Read only the installed main HTML and its numeric module entry, never all chunks.
pub(crate) fn read_numbered_host_runtimes(path:&Path)->Result<Vec<String>, &'static str>{
    use std::io::{Read,Seek,SeekFrom};
    let meta=path.symlink_metadata().map_err(|_|"bundle-open")?;
    if !meta.is_file()||meta.file_type().is_symlink(){return Err("bundle-file");}
    let mut file=std::fs::File::open(path).map_err(|_|"bundle-open")?;
    let mut raw=[0u8;16];file.read_exact(&mut raw).map_err(|_|"bundle-header-read")?;
    let header_size=u32::from_le_bytes(raw[4..8].try_into().unwrap()) as u64;
    let json_size=u32::from_le_bytes(raw[12..16].try_into().unwrap()) as usize;
    if json_size==0||json_size>16*1024*1024||header_size>16*1024*1024+16||header_size<json_size as u64+8||8+header_size>meta.len(){return Err("bundle-header-budget");}
    let mut data=vec![0u8;json_size];file.read_exact(&mut data).map_err(|_|"bundle-header-read")?;
    let header:serde_json::Value=serde_json::from_slice(&data).map_err(|_|"bundle-header-json")?;
    let web=&header["files"]["webview"]["files"];
    let mut read=|entry:&serde_json::Value,budget:u64|->Result<String,&'static str>{
        let size=entry["size"].as_u64().filter(|v|*v>0&&*v<=budget).ok_or("module-entry-size")?;
        let offset=entry["offset"].as_str().and_then(|v|v.parse::<u64>().ok()).ok_or("module-entry-offset")?;
        let start=8u64.checked_add(header_size).and_then(|v|v.checked_add(offset)).ok_or("module-entry-bound")?;
        if start.checked_add(size).is_none_or(|v|v>meta.len())||entry["unpacked"]==true||!entry["link"].is_null(){return Err("module-entry-bound");}
        file.seek(SeekFrom::Start(start)).map_err(|_|"module-entry-read")?;
        let mut bytes=vec![0u8;size as usize];file.read_exact(&mut bytes).map_err(|_|"module-entry-read")?;
        String::from_utf8(bytes).map_err(|_|"module-entry-utf8")
    };
    if web["index.html"].is_null(){return Ok(Vec::new());}
    let html=read(&web["index.html"],1024*1024)?;let mut runtimes=Vec::new();let mut scripts=0;
    for tag in html.split("<script").skip(1){
        scripts+=1;if scripts>32{return Err("entry-script-budget");}
        let tag=tag.split('>').next().ok_or("entry-script-tag")?;
        if !tag.contains("type=\"module\"")&&!tag.contains("type='module'"){continue;}
        let src=if let Some(v)=tag.split("src=\"").nth(1){v.split('"').next()}else{tag.split("src='").nth(1).and_then(|v|v.split('\'').next())};
        let Some(name)=src.and_then(|v|v.strip_prefix("/assets/").or_else(||v.strip_prefix("./assets/")))else{continue};
        let parts:Vec<_>=name.split('.').collect();
        if name.len()>160||parts.len()!=3||parts[0].is_empty()||!parts[0].bytes().all(|b|b.is_ascii_digit())||parts[1].is_empty()||!parts[1].bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b))||parts[2]!="js"{continue;}
        let source=read(&web["assets"]["files"][name],1024*1024)?;
        if !source.contains("__webpack_require__")||!source.contains(".c=")||!source.contains(".m="){continue;}
        let address=format!("./assets/{name}");if !runtimes.contains(&address){if runtimes.len()>=4{return Err("runtime-entry-budget");}runtimes.push(address);}
    }
    Ok(runtimes)
}

fn read_appearance_modules(path:&Path)->Result<serde_json::Value,&'static str> {
    use std::io::Read;
    let metadata=path.symlink_metadata().map_err(|_|"bundle-metadata")?;
    if !metadata.is_file()||metadata.file_type().is_symlink(){return Err("bundle-regular-file");}
    let mut file=std::fs::File::open(path).map_err(|_|"bundle-open")?;
    let mut bytes=[0u8;16];file.read_exact(&mut bytes).map_err(|_|"bundle-header")?;
    let header_size=u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as u64;
    let size=u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
    if size==0||size>16*1024*1024||header_size>16*1024*1024+16||header_size<size as u64+8||8+header_size>metadata.len(){return Err("bundle-header-budget");}
    let mut data=vec![0u8;size];file.read_exact(&mut data).map_err(|_|"bundle-header-read")?;
    let header:serde_json::Value=serde_json::from_slice(&data).map_err(|_|"bundle-header-json")?;
    let entries=header["files"]["webview"]["files"]["assets"]["files"].as_object().ok_or("bundle-assets")?;
    let mut initial=Vec::new();let mut appearance=Vec::new();
    for (name,entry) in entries {
        let group=if name.starts_with("app-initial-"){&mut initial}else if name.starts_with("run-app-action-in-primary-window-"){&mut appearance}else{continue;};
        if !name.ends_with(".js"){continue;}
        if name.len()>200||!name.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b)){return Err("module-role-path");}
        if group.len()>=4{return Err("module-role-ambiguity");}
        let offset=entry["offset"].as_str().and_then(|v|v.parse::<u64>().ok()).ok_or("module-entry-offset")?;
        let size=entry["size"].as_u64().filter(|n|*n>0&&*n<=40*1024*1024).ok_or("module-entry-size")?;
        let end=8u64.checked_add(header_size).and_then(|n|n.checked_add(offset)).and_then(|n|n.checked_add(size)).ok_or("module-entry-bound")?;
        if end>metadata.len()||entry["unpacked"]==true||!entry["link"].is_null(){return Err("module-entry-bound");}
        group.push(format!("./assets/{name}"));
    }
    Ok(serde_json::json!({"schema":1,"initial":initial,"appearance":appearance,"runtimes":read_numbered_host_runtimes(path)?,"stage":"module-inventory"}))
}

#[derive(Debug, Clone)]
pub enum BundleSource {
    Embedded,
    DevelopmentOverride(PathBuf),
}

pub fn resolve_bundle(explicit: Option<&Path>) -> Result<BundleSource, BootstrapError> {
    if let Some(explicit) = explicit {
        return validate_bundle_path(explicit).map(BundleSource::DevelopmentOverride);
    }
    if EMBEDDED_UI_BUNDLE.is_empty() || EMBEDDED_UI_BUNDLE.len() as u64 > MAX_UI_BUNDLE_BYTES {
        return Err(BootstrapError::InvalidBundle.context(
            "validating UI bundle",
            format!(
                "maxBytes={MAX_UI_BUNDLE_BYTES}; expected nonempty regular file or embedded bundle"
            ),
        ));
    }
    Ok(BundleSource::Embedded)
}

fn validate_bundle_path(path: &Path) -> Result<PathBuf, BootstrapError> {
    let canonical = dunce::canonicalize(path).map_err(|error| {
        BootstrapError::BundleNotFound.context(
            "resolving UI bundle path",
            format!(
                "ioKind={:?}; osCode={:?}",
                error.kind(),
                error.raw_os_error()
            ),
        )
    })?;
    let metadata = canonical.metadata().map_err(|error| {
        BootstrapError::InvalidBundle.context(
            "reading UI bundle metadata",
            format!(
                "ioKind={:?}; osCode={:?}",
                error.kind(),
                error.raw_os_error()
            ),
        )
    })?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_UI_BUNDLE_BYTES {
        return Err(BootstrapError::InvalidBundle.context(
            "validating UI bundle",
            format!(
                "maxBytes={MAX_UI_BUNDLE_BYTES}; expected nonempty regular file or embedded bundle"
            ),
        ));
    }
    Ok(canonical)
}

pub fn build_bootstrap(
    bundle_source: &BundleSource,
    token: &CapabilityToken,
    binding: &str,
    receiver: &str,
    codex_version: &str,
    channel: &str,
    compatible: bool,
    manual_workspace: bool,
    startup_splash_active: bool,
    appearance_modules: &serde_json::Value,
) -> Result<String, BootstrapError> {
    let development_bundle;
    let bundle = match bundle_source {
        BundleSource::Embedded => EMBEDDED_UI_BUNDLE,
        BundleSource::DevelopmentOverride(path) => {
            development_bundle = std::fs::read_to_string(path).map_err(|error| {
                BootstrapError::InvalidBundle.context(
                    "reading UTF-8 UI bundle",
                    format!(
                        "ioKind={:?}; osCode={:?}",
                        error.kind(),
                        error.raw_os_error()
                    ),
                )
            })?;
            &development_bundle
        }
    };
    if bundle.len() as u64 > MAX_UI_BUNDLE_BYTES {
        return Err(BootstrapError::InvalidBundle.context(
            "validating UI bundle",
            format!(
                "maxBytes={MAX_UI_BUNDLE_BYTES}; expected nonempty regular file or embedded bundle"
            ),
        ));
    }
    let metadata = BootstrapMetadata {
        token: token.expose(),
        binding,
        receiver,
        codex_version,
        channel,
        compatible,
        manual_workspace,
        startup_splash_active,
        appearance_modules,
        language: crate::gui_support::localization::preference(),
        centralized_storage: workspace_service::application_paths::install_root()
            .ok()
            .flatten()
            .is_some(),
    };
    let metadata = serde_json::to_string(&metadata).map_err(|error| {
        BootstrapError::InvalidBundle.context("serializing bootstrap metadata", error)
    })?;
    Ok(format!(
        "(()=>{{'use strict';if(window!==window.top||location.protocol!=='app:'||location.host!=='-'){{return;}}const bootstrap=Object.freeze({metadata});Object.defineProperty(window,Symbol.for('code-codex:appearance-module-hints:v1'),{{value:Object.freeze(bootstrap.appearanceModules),writable:false,configurable:true,enumerable:false}});Object.defineProperty(window,'__CODE_CODEX_BOOTSTRAP__',{{value:bootstrap,writable:false,configurable:true,enumerable:false}});try{{\n{bundle}\n}}finally{{try{{delete window.__CODE_CODEX_BOOTSTRAP__;}}catch(_error){{}}}}if(bootstrap.startupSplashActive){{return Promise.race([Promise.resolve(window.__CODE_CODEX_STARTUP_VISUAL_READY__),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);}}}})();\n//# sourceURL=code-codex://explorer.js"
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    fn fixture_asar(path:&Path,entries:serde_json::Value) {
        let header=serde_json::to_vec(&serde_json::json!({"files":{"webview":{"files":{"assets":{"files":entries}}}}})).unwrap();
        let size=header.len() as u32;let mut b=Vec::new();for n in [4u32,size+8,size+4,size]{b.extend(n.to_le_bytes());}b.extend(header);b.extend([0;32]);fs::write(path,b).unwrap();
    }
    #[test] fn appearance_inventory_is_independent_bounded_and_uses_existing_role_paths(){
        let root=TempDir::new().unwrap();let p=root.path().join("app.asar");
        fixture_asar(&p,serde_json::json!({"app-initial-old_or_NEW.js":{"offset":"0","size":1},"run-app-action-in-primary-window-unknown.js":{"offset":"1","size":1},"account-secret.js":{"offset":"0","size":1}}));
        let v=read_appearance_modules(&p).unwrap();assert_eq!(v["initial"],serde_json::json!(["./assets/app-initial-old_or_NEW.js"]));assert_eq!(v["appearance"],serde_json::json!(["./assets/run-app-action-in-primary-window-unknown.js"]));assert!(!v.to_string().contains("account-secret"));
        assert_eq!(appearance_module_hints(None)["stage"],"installation-unavailable");
    }
    #[test] fn appearance_inventory_rejects_paths_ambiguous_and_out_of_bounds_entries(){
        let root=TempDir::new().unwrap();let p=root.path().join("app.asar");
        for (entries,stage) in [(serde_json::json!({"run-app-action-in-primary-window-../evil.js":{"offset":"0","size":1}}),"module-role-path"),(serde_json::json!({"app-initial-a.js":{"offset":"9999999","size":1}}),"module-entry-bound"),(serde_json::json!({"app-initial-a.js":{"offset":"0","size":1,"unpacked":true}}),"module-entry-bound")] {
            fixture_asar(&p,entries);assert_eq!(read_appearance_modules(&p).unwrap_err(),stage);
        }
        let entries=(0..5).map(|n|(format!("app-initial-{n}.js"),serde_json::json!({"offset":"0","size":1}))).collect::<serde_json::Map<_,_>>();fixture_asar(&p,serde_json::Value::Object(entries));assert_eq!(read_appearance_modules(&p).unwrap_err(),"module-role-ambiguity");
        fs::write(&p,[0;16]).unwrap();assert_eq!(read_appearance_modules(&p).unwrap_err(),"bundle-header-budget");
    }
    #[test] fn numbered_inventory_uses_only_main_html_entries_and_rejects_redirected_bytes(){
        let root=TempDir::new().unwrap();let p=root.path().join("app.asar");
        let html="<script type=\"module\" src=\"https://evil.test/123.abc.js\"></script><script type=\"module\" src=\"/assets/123.abc.js?bad\"></script><script type=\"module\" src=\"/assets/123.abc.js\"></script>";
        let source="var r={};r.c={};r.m={};export{r as __webpack_require__};";
        let write=|unpacked:bool|{let header=serde_json::to_vec(&serde_json::json!({"files":{"webview":{"files":{"index.html":{"offset":"0","size":html.len()},"assets":{"files":{"123.abc.js":{"offset":html.len().to_string(),"size":source.len(),"unpacked":unpacked},"unreferenced.js":{"offset":"0","size":1}}}}}}})).unwrap();let size=header.len() as u32;let mut b=Vec::new();for n in [4u32,size+8,size+4,size]{b.extend(n.to_le_bytes());}b.extend(header);b.extend(html.as_bytes());b.extend(source.as_bytes());fs::write(&p,b).unwrap();};
        write(false);assert_eq!(read_numbered_host_runtimes(&p).unwrap(),vec!["./assets/123.abc.js"]);
        write(true);assert_eq!(read_numbered_host_runtimes(&p).unwrap_err(),"module-entry-bound");
    }
    #[test]
    #[ignore="Explicit read-only official installation inventory; no accounts or RPC/actions"]
    fn real_official_appearance_inventory_requires_no_account_runtime(){
        let path=std::env::var_os("CODE_CODEX_APPEARANCE_ASAR").map(PathBuf::from).expect("Explicit official bundle required");let v=read_appearance_modules(&path).unwrap();assert!(!v["appearance"].as_array().unwrap().is_empty()||!v["runtimes"].as_array().unwrap().is_empty());println!("{}",v);
    }

    #[test]
    fn embeds_metadata_without_leaking_token_via_debug() {
        let directory = TempDir::new().expect("temp dir");
        let bundle = directory.path().join("explorer.js");
        fs::write(&bundle, "window.__bundleLoaded=true;").expect("bundle");
        let token = CapabilityToken::generate();
        let source = build_bootstrap(
            &BundleSource::DevelopmentOverride(bundle),
            &token,
            PRIMARY_BINDING_NAME,
            PRIMARY_RECEIVER_NAME,
            "26.715.3651.0",
            "beta",
            true,
            false,
            false,
            &serde_json::json!({}),
        )
        .expect("bootstrap");
        assert!(source.contains(token.expose()));
        assert!(source.contains("26.715.3651.0"));
        assert!(source.contains("\"manualWorkspace\":false"));
        assert!(source.contains("\"startupSplashActive\":false"));
        assert!(source.contains("__CODE_CODEX_BOOTSTRAP__"));
        assert!(source.contains("delete window.__CODE_CODEX_BOOTSTRAP__"));
        let guard = source.find("window!==window.top").expect("top-frame guard");
        let exposed_token = source.find(token.expose()).expect("token metadata");
        assert!(guard < exposed_token);
        assert!(source.contains("location.protocol!=='app:'"));
        assert!(source.contains("location.host!=='-'"));
        assert!(!format!("{token:?}").contains(token.expose()));
    }

    #[test]
    fn rejects_empty_bundle() {
        let directory = TempDir::new().expect("temp dir");
        let bundle = directory.path().join("empty.js");
        fs::write(&bundle, "").expect("empty bundle");
        assert!(validate_bundle_path(&bundle).is_err());
    }

    #[test]
    fn accepts_bundle_larger_than_legacy_limit() {
        let directory = TempDir::new().expect("temp dir");
        let bundle = directory.path().join("explorer.js");
        fs::write(&bundle, vec![b'a'; 9 * 1024 * 1024]).expect("bundle");
        assert!(validate_bundle_path(&bundle).is_ok());
    }

    #[test]
    fn startup_splash_handoff_waits_for_renderer_visual() {
        let directory = TempDir::new().expect("temp dir");
        let bundle = directory.path().join("explorer.js");
        fs::write(&bundle, "window.__bundleLoaded=true;").expect("bundle");
        let source = build_bootstrap(
            &BundleSource::DevelopmentOverride(bundle),
            &CapabilityToken::generate(),
            PRIMARY_BINDING_NAME,
            PRIMARY_RECEIVER_NAME,
            "26.715.3651.0",
            "beta",
            true,
            false,
            true,
            &serde_json::json!({}),
        )
        .expect("bootstrap");
        assert!(source.contains("\"startupSplashActive\":true"));
        assert!(source.contains("Promise.resolve(window.__CODE_CODEX_STARTUP_VISUAL_READY__)"));
        assert!(source.contains("Promise.race"));
    }

    #[test]
    fn default_bundle_is_embedded_and_non_empty() {
        let source = resolve_bundle(None).expect("embedded source");
        assert!(matches!(source, BundleSource::Embedded));
        let token = CapabilityToken::generate();
        let bootstrap = build_bootstrap(
            &source,
            &token,
            PRIMARY_BINDING_NAME,
            PRIMARY_RECEIVER_NAME,
            "26.715.3651.0",
            "beta",
            true,
            true,
            false,
            &serde_json::json!({}),
        )
        .expect("embedded bootstrap");
        assert!(bootstrap.len() > token.expose().len() + 1_000);
        assert!(bootstrap.contains("\"manualWorkspace\":true"));
    }
}
