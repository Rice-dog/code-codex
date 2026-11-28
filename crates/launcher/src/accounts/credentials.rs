//! Native-only credential selection. Secrets never enter renderer responses or registry files.
use super::{AccountError, Result};
use base64::Engine;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
// Covers relay's 240-second cache plus its 30-second refresh margin.
const MANAGED_MIN_LIFETIME:u64=300;
#[cfg(test)]
#[path="managed_credential_tests.rs"]
mod managed_credential_tests;

pub fn official_home() -> Result<PathBuf> {
    let root = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join(".codex")))
        .ok_or_else(|| AccountError::protocol("Official profile root unavailable."))?;
    workspace_service::application_paths::validate_directory_path(&root)
        .map_err(|_| AccountError::protocol("Official profile root is redirected."))?;
    std::fs::canonicalize(root)
        .map_err(|_| AccountError::protocol("Official profile root unavailable."))
}
pub fn read(home: &Path, email: &str, host: bool) -> Result<Value> {
    workspace_service::application_paths::validate_directory_path(home)
        .map_err(|_| AccountError::protocol("Credential home is redirected."))?;
    let mut bytes = if host {
        let file = official_home()?.join("auth.json");
        if file
            .symlink_metadata()
            .map(|m| m.file_type().is_symlink() || m.len() > 128 * 1024)
            .unwrap_or(true)
        {
            return Err(AccountError::new(
                "ACCOUNT_CREDENTIAL",
                "The official credential file is unavailable or redirected.",
            ));
        }
        std::fs::read(file).map_err(|_| {
            AccountError::new(
                "ACCOUNT_CREDENTIAL",
                "The official account credential is unavailable.",
            )
        })?
    } else {
        return Err(AccountError::protocol(
            "Independent credentials must be read through their official backend.",
        ));
    };
    let raw: Value = serde_json::from_slice(&bytes)
        .map_err(|_| AccountError::protocol("The account credential format is unavailable."))?;
    bytes.fill(0);
    let claims = raw["tokens"]["id_token"]
        .as_str()
        .and_then(|s| s.split('.').nth(1))
        .and_then(|s| {
            base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(s)
                .ok()
        })
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or(Value::Null);
    let claimed = claims["email"]
        .as_str()
        .or_else(|| claims["https://api.openai.com/profile"]["email"].as_str());
    if !claimed.is_some_and(|e| e.eq_ignore_ascii_case(email)) {
        return Err(AccountError::new(
            "ACCOUNT_CREDENTIAL_IDENTITY",
            "The stored credential does not match the observed account. Sign in again.",
        ));
    }
    let token = raw["tokens"]["access_token"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() < 64 * 1024)
        .ok_or_else(|| AccountError::protocol("No account access credential is available."))?;
    let account = raw["tokens"]["account_id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() < 256)
        .ok_or_else(|| AccountError::protocol("The account workspace identity is unavailable."))?;
    Ok(json!({"type":"chatgptAuthTokens","accessToken":token,"chatgptAccountId":account}))
}

/// Preserve the file path for ordinary sign-in. A keyring-only primary is
/// read by the official app-server, via the same bounded credential contract.
pub(super) async fn read_primary(home: &Path, email: &str) -> Result<Value> {
    if primary_launch_store(home) != Some("keyring") {
        return read(home,email,true);
    }
    let worker = super::Worker::spawn(home).await?;
    let result = async {
        let exported = worker.cached_credential().await?;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| AccountError::protocol("The credential observation clock is unavailable."))?.as_secs();
        if let Some(auth) = managed_token(&exported,email,now,false)? {
            return Ok(auth);
        }
        let observed = worker.request("account/read",json!({"refreshToken":false})).await?;
        super::identity::check(&observed,Some(email))?;
        managed_token(&exported,email,now,true)?.ok_or_else(|| AccountError::new(
            "ACCOUNT_CREDENTIAL_STALE","The verified official keyring does not contain a usable primary credential. No task was sent."))
    }.await;
    worker.stop_checked().await?;
    result
}

/// Fixed native-only token export supported by the qualified official app-server.
/// Native token claims are checked against the saved identity before use.
/// Neither the backend response nor the token is queued to renderer.
pub async fn managed(worker: &super::worker::Worker, email: &str) -> Result<Value> {
    managed_observed(worker,email,None).await
}
/// Non-secret identity projection from the verified native broker. A known
/// reauthorization or unfinished login still requires the official observation.
pub(super) async fn observe_managed(worker:&super::worker::Worker,email:&str,plan:Option<&str>,refresh_required:bool)->Result<Value>{
    if refresh_required{return worker.request("account/read",json!({"refreshToken":true})).await;}
    managed(worker,email).await?;
    Ok(json!({"account":{"type":"chatgpt","email":email,"planType":plan}}))
}
pub(super) async fn managed_observed(worker:&super::worker::Worker,email:&str,progress:Option<&super::preparation::Preparation>)->Result<Value>{
    if let Some(p)=progress {p.step("credential-token-read",json!({"method":"getAuthStatus","refreshToken":false}));}
    let exported=worker.cached_credential().await?;
    let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|AccountError::protocol("The credential observation clock is unavailable."))?.as_secs();
    let reusable=managed_token(&exported,email,now,false)?;
    let refresh_ticket=worker.credential_refresh_ticket();
    if let Some(auth)=reusable.filter(|_|!refresh_ticket.2) {
        crate::runtime_log::record("accounts","account.credential","reused",json!({"source":"native-getAuthStatus","identityMatched":true,"freshnessConfirmed":true,"forcedRefresh":false,"taskSent":false}));return Ok(auth);
    }
    // Refresh only near expiry or when older tokens lack sufficient claims.
    // Account identity is still checked before any refreshed token can be used.
    if let Some(p)=progress {p.step("credential-refresh",json!({"method":"account/read","refreshToken":true}));}
    let observed = worker
        .request("account/read", json!({"refreshToken":true}))
        .await?;
    super::identity::check(&observed,Some(email))?;
    if let Some(p)=progress {p.step("credential-token-export",json!({"method":"getAuthStatus","refreshToken":false}));}
    let exported = worker
        .cached_credential()
        .await
        .map_err(|e| AccountError::new(&e.code,format!("Execution credential export failed. {}",e.message)))?;
    let refreshed_now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|AccountError::protocol("The credential observation clock is unavailable."))?.as_secs();
    let auth=managed_token(&exported,email,refreshed_now,true)?.ok_or_else(||AccountError::new("ACCOUNT_CREDENTIAL_STALE","The official backend did not provide a usable credential after refresh. Check this connection; no task was sent."))?;
    worker.credential_refreshed(refresh_ticket);Ok(auth)
}
fn managed_token(exported:&Value,email:&str,now:u64,identity_confirmed:bool)->Result<Option<Value>>{
    let token = exported["authToken"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() < 64 * 1024)
        ;
    let Some(token)=token else {return Ok(None)};
    let claims = token
        .split('.')
        .nth(1)
        .and_then(|s| {
            base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(s)
                .ok()
        })
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .unwrap_or(Value::Null);
    let emails=[claims["email"].as_str(),claims["https://api.openai.com/profile"]["email"].as_str()];
    let claimed=emails.into_iter().flatten().next();
    if emails.into_iter().flatten().any(|value|!value.eq_ignore_ascii_case(email)){return Err(AccountError::new("ACCOUNT_CREDENTIAL_IDENTITY","The official credential does not match the selected account. No alternate identity was used and no task was sent."));}
    let current=claims["exp"].as_u64().is_some_and(|exp|exp>now.saturating_add(MANAGED_MIN_LIFETIME))&&claims.get("nbf").is_none_or(|v|v.as_u64().is_some_and(|nbf|nbf<=now));
    if !current||claimed.is_none(){
        if !identity_confirmed{return Ok(None);}
        // Retain the older opaque-expiry contract only after a fresh native
        // account/read verified identity. Known stale/future tokens never pass.
        if claims.get("exp").is_some()&&!current||claims.get("nbf").is_some_and(|v|v.as_u64().is_none_or(|nbf|nbf>now)){return Ok(None);}
    }
    let account = claims["https://api.openai.com/auth"]["chatgpt_account_id"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() < 256)
        ;
    let Some(account)=account else {return Ok(None)};
    Ok(Some(json!({"type":"chatgptAuthTokens","accessToken":token,"chatgptAccountId":account})))
}
fn targets(home: &Path) -> Result<Vec<Vec<u16>>> {
    let canonical = std::fs::canonicalize(home)
        .map_err(|_| AccountError::protocol("Credential home unavailable."))?;
    let hash = format!(
        "{:x}",
        Sha256::digest(canonical.to_string_lossy().as_bytes())
    );
    Ok([
        format!("cli|{}.Codex Auth", &hash[..16]),
        format!("secrets|{}.codex", &hash[..16]),
    ]
    .into_iter()
    .map(|v| v.encode_utf16().chain(Some(0)).collect())
    .collect())
}
/// Copy only managed auth material to a fresh native child home. Rebind the
/// encrypted store's Windows key to that exact home; never export to renderer.
pub(super) fn snapshot_managed(source:&Path,destination:&Path)->Result<()> {
    if destination.exists(){return Err(AccountError::new("ACCOUNT_PRIMARY_BACKUP","The credential snapshot requires a fresh private directory. No existing authorization was changed."))}
    workspace_service::application_paths::validate_directory_path(source).map_err(|_|AccountError::protocol("Primary credential source is redirected."))?;
    super::directory(destination)?;
    #[cfg(windows)] {
        use std::os::windows::fs::OpenOptionsExt;
        let mut handle=std::fs::OpenOptions::new().read(true).access_mode(0x00020000|0x00040000).custom_flags(0x02000000).open(destination).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_BACKUP","The credential snapshot ACL could not be opened."))?;
        let descriptor:windows_permissions::LocalBox<windows_permissions::SecurityDescriptor>="D:P(A;OICI;FA;;;OW)(A;OICI;FA;;;SY)".parse().map_err(|_|AccountError::protocol("The credential snapshot ACL is unavailable."))?;
        windows_permissions::wrappers::SetSecurityInfo(&mut handle,windows_permissions::constants::SeObjectType::SE_FILE_OBJECT,windows_permissions::constants::SecurityInformation::Dacl|windows_permissions::constants::SecurityInformation::ProtectedDacl,None,None,descriptor.dacl(),None).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_BACKUP","The credential snapshot could not be restricted to its owner."))?;
    }
    let result=(||{
        let mut copied=0;
        for name in ["auth.json","secrets/codex_auth.age"] {
            let file=source.join(name);if !file.exists(){continue}
            let m=file.symlink_metadata().map_err(|_|AccountError::protocol("Primary credential metadata unavailable."))?;
            if !m.is_file()||m.file_type().is_symlink()||m.len()>128*1024{return Err(AccountError::protocol("Primary credential source failed validation."))}
            workspace_service::application_paths::validate_directory_path(file.parent().unwrap()).map_err(|_|AccountError::protocol("Primary credential directory is redirected."))?;
            let target=destination.join(name);if target.exists(){return Err(AccountError::protocol("Primary credential snapshot must use a fresh home."))}
            super::directory(target.parent().unwrap())?;
            let mut bytes=std::fs::read(file).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_BACKUP","Primary authorization could not be read."))?;
            let write=std::fs::write(target,&bytes);bytes.fill(0);write.map_err(|_|AccountError::new("ACCOUNT_PRIMARY_BACKUP","Primary authorization could not be preserved."))?;copied+=1;
        }
        if copied==0{return Err(AccountError::new("ACCOUNT_PRIMARY_BACKUP","No managed primary authorization is available. The current login was not changed."))}
        if destination.join("auth.json").exists(){crate::renderer_storage::atomic(&destination.join("managed-auth-source.json"),&json!({"schema":1,"store":"file"})).map_err(|_|AccountError::new("ACCOUNT_PRIMARY_BACKUP","The managed credential storage mode could not be recorded."))?;}
        #[cfg(windows)] {
            use windows_sys::Win32::Security::Credentials::{CredReadW,CredWriteW,CredFree,CREDENTIALW};
            let a=targets(source)?;let b=targets(destination)?;
            for (source,target) in a.iter().zip(&b) {unsafe{
                let mut ptr: *mut CREDENTIALW=std::ptr::null_mut();
                if CredReadW(source.as_ptr(),1,0,&mut ptr)==0 {
                    if windows_sys::Win32::Foundation::GetLastError()==1168{continue}
                    return Err(AccountError::new("ACCOUNT_PRIMARY_BACKUP","The native credential key could not be read."))
                }
                let mut value=std::ptr::read(ptr);value.TargetName=target.as_ptr() as *mut u16;
                let written=CredWriteW(&value,0);
                if value.CredentialBlobSize>0&&!value.CredentialBlob.is_null(){std::slice::from_raw_parts_mut(value.CredentialBlob,value.CredentialBlobSize as usize).fill(0)}
                CredFree(ptr.cast());
                if written==0{return Err(AccountError::new("ACCOUNT_PRIMARY_BACKUP","The native credential key could not be preserved."))}
            }}
        }
        Ok(())
    })();
    if result.is_err(){let _=delete(destination);}result
}
/// Replace only managed authorization. Callers preserve a verified native backup
/// and hold the primary operation lane; project/config/history files are untouched.
pub(super) fn replace_managed(source:&Path,destination:&Path)->Result<()> {
    workspace_service::application_paths::validate_directory_path(source).map_err(|_|AccountError::protocol("Credential source is redirected."))?;
    workspace_service::application_paths::validate_directory_path(destination).map_err(|_|AccountError::protocol("Credential destination is redirected."))?;
    if !["auth.json","secrets/codex_auth.age"].iter().any(|n|source.join(n).is_file()){return Err(AccountError::new("ACCOUNT_PRIMARY_STORAGE","Managed authorization is unavailable."))}
    // Stage every file before touching the destination. No credential text enters
    // error bodies, command arguments or ordinary account storage.
    let mut staged=Vec::new();
    for name in ["auth.json","secrets/codex_auth.age"] {
        let input=source.join(name);let output=destination.join(name);
        if !input.exists(){staged.push((output,None));continue}
        let meta=crate::renderer_storage::regular(&input).map_err(|_|AccountError::protocol("Credential source failed validation."))?;
        if meta.len()>128*1024{return Err(AccountError::protocol("Credential source exceeds its bound."))}
        workspace_service::application_paths::validate_directory_path(input.parent().unwrap()).map_err(|_|AccountError::protocol("Credential source directory is redirected."))?;
        super::directory(output.parent().unwrap())?;
        if output.exists(){crate::renderer_storage::regular(&output).map_err(|_|AccountError::protocol("Credential destination is redirected."))?;}
        use std::io::Write;
        let mut file=tempfile::NamedTempFile::new_in(output.parent().unwrap()).map_err(|_|AccountError::protocol("Credential staging failed."))?;
        #[cfg(windows)] {
            use std::os::windows::fs::OpenOptionsExt;
            use windows_sys::Win32::Storage::FileSystem::{FILE_GENERIC_READ,WRITE_DAC,FILE_SHARE_READ,FILE_SHARE_WRITE,FILE_SHARE_DELETE};
            let mut acl=std::fs::OpenOptions::new().access_mode(FILE_GENERIC_READ|WRITE_DAC).share_mode(FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE).open(file.path()).map_err(|_|AccountError::protocol("Credential ACL could not be opened."))?;
            crate::discovery::set_protected_dacl(&mut acl,"D:P(A;;FA;;;OW)(A;;FA;;;SY)").map_err(|_|AccountError::protocol("Credential staging could not be restricted."))?;
        }
        let mut bytes=std::fs::read(input).map_err(|_|AccountError::protocol("Credential source could not be read."))?;
        let result=file.write_all(&bytes);bytes.fill(0);result.map_err(|_|AccountError::protocol("Credential staging failed."))?;
        file.as_file().sync_all().map_err(|_|AccountError::protocol("Credential staging failed."))?;
        staged.push((output,Some(file)));
    }
    #[cfg(windows)] {
        use windows_sys::Win32::Security::Credentials::{CredReadW,CredWriteW,CredDeleteW,CredFree,CREDENTIALW};
        for (input,output) in targets(source)?.iter().zip(targets(destination)?) {unsafe{
            let mut ptr:*mut CREDENTIALW=std::ptr::null_mut();
            if CredReadW(input.as_ptr(),1,0,&mut ptr)==0 {
                if windows_sys::Win32::Foundation::GetLastError()!=1168{return Err(AccountError::protocol("Native credential key could not be read."))}
                if CredDeleteW(output.as_ptr(),1,0)==0&&windows_sys::Win32::Foundation::GetLastError()!=1168{return Err(AccountError::protocol("Old native credential key could not be removed."))}
                continue
            }
            let mut value=std::ptr::read(ptr);value.TargetName=output.as_ptr() as *mut u16;
            let written=CredWriteW(&value,0);
            if value.CredentialBlobSize>0&&!value.CredentialBlob.is_null(){std::slice::from_raw_parts_mut(value.CredentialBlob,value.CredentialBlobSize as usize).fill(0)}
            CredFree(ptr.cast());if written==0{return Err(AccountError::protocol("Native credential key transfer failed."))}
        }}
    }
    for (output,file) in staged {if let Some(file)=file {file.persist(output).map_err(|_|AccountError::protocol("Managed credential commit failed."))?;}else if output.exists(){std::fs::remove_file(output).map_err(|_|AccountError::protocol("Old managed credential removal failed."))?;}}
    let marker=destination.join("managed-auth-source.json");
    let store = if source.join("auth.json").is_file() { "file" } else { "keyring" };
    crate::renderer_storage::atomic(&marker,&json!({"schema":1,"store":store}))
        .map_err(|_|AccountError::protocol("Credential storage mode could not be saved."))?;
    Ok(())
}
pub(super) fn storage_mode(home:&Path)->Result<&'static str>{
 let marker=home.join("managed-auth-source.json");if !marker.exists(){return Ok("keyring")}
 let value=crate::renderer_storage::read_json(&marker,1024).map_err(|_|AccountError::protocol("Managed credential storage marker could not be read."))?;
 match (value["schema"].as_u64(),value["store"].as_str()){
  (Some(1),Some("file"))=>Ok("file"),
  (Some(1),Some("keyring"))=>Ok("keyring"),
  _=>Err(AccountError::protocol("Managed credential storage marker is invalid.")),
 }
}

/// Only a committed managed transfer chooses the native store at next launch.
/// An ordinary login that replaced the material takes precedence over a stale marker.
pub(super) fn primary_launch_store(home: &Path) -> Option<&'static str> {
    if !home.join("managed-auth-source.json").is_file() {
        return None;
    }
    let file = home.join("auth.json").is_file();
    let encrypted = home.join("secrets/codex_auth.age").is_file();
    match (storage_mode(home).ok()?, file, encrypted) {
        ("file", true, _) => Some("file"),
        ("keyring", false, true) => Some("keyring"),
        _ => None,
    }
}
pub fn delete(home: &Path) -> Result<()> {
    workspace_service::application_paths::validate_directory_path(home)
        .map_err(|_| AccountError::protocol("Credential home is redirected."))?;
    #[cfg(windows)]
    for target in targets(home)? {
        unsafe {
            if windows_sys::Win32::Security::Credentials::CredDeleteW(target.as_ptr(), 1, 0) == 0
                && windows_sys::Win32::Foundation::GetLastError() != 1168
            {
                return Err(AccountError::new(
                    "ACCOUNT_LOGOUT_CREDENTIAL",
                    "A child credential could not be removed. It remains blocked by the ended-session marker.",
                ));
            }
        }
    }
    for file in [home.join("secrets/codex_auth.age"), home.join("auth.json")] {
        if file.exists() {
            workspace_service::application_paths::validate_directory_path(file.parent().unwrap())
                .map_err(|_| AccountError::protocol("Credential directory is redirected."))?;
            if file
                .symlink_metadata()
                .map(|m| !m.is_file() || m.file_type().is_symlink())
                .unwrap_or(true)
            {
                return Err(AccountError::protocol("Credential file is redirected."));
            }
            std::fs::remove_file(file).map_err(|_| {
                AccountError::new(
                    "ACCOUNT_LOGOUT_CREDENTIAL",
                    "The child credential file could not be removed. Logout remains blocked.",
                )
            })?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn managed_transfer_and_restore_preserve_unrelated_profile_data(){
        let d=tempfile::tempdir().unwrap();let old=d.path().join("old");let new=d.path().join("new");let live=d.path().join("live");
        for home in [&old,&new,&live]{std::fs::create_dir_all(home).unwrap();}
        std::fs::write(old.join("auth.json"),b"synthetic-old").unwrap();std::fs::write(new.join("auth.json"),b"synthetic-new").unwrap();std::fs::write(live.join("auth.json"),b"synthetic-old").unwrap();
        std::fs::write(live.join("config.toml"),b"keep-config").unwrap();std::fs::write(live.join("history.jsonl"),b"keep-history").unwrap();
        replace_managed(&new,&live).unwrap();assert_eq!(std::fs::read(live.join("auth.json")).unwrap(),b"synthetic-new");assert_eq!(storage_mode(&live).unwrap(),"file");
        replace_managed(&old,&live).unwrap();assert_eq!(std::fs::read(live.join("auth.json")).unwrap(),b"synthetic-old");
        assert_eq!(std::fs::read(live.join("config.toml")).unwrap(),b"keep-config");assert_eq!(std::fs::read(live.join("history.jsonl")).unwrap(),b"keep-history");
    }
    #[test]
    fn primary_launch_reuses_committed_store_but_not_a_stale_selection() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("official");
        let keyring_home = temp.path().join("keyring");
        let secrets = keyring_home.join("secrets");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::create_dir_all(&secrets).unwrap();
        std::fs::write(secrets.join("codex_auth.age"), b"synthetic").unwrap();
        std::fs::write(home.join("auth.json"), b"former-primary").unwrap();
        assert_eq!(primary_launch_store(&home), None);
        replace_managed(&keyring_home, &home).unwrap();
        assert_eq!(primary_launch_store(&home), Some("keyring"));
        assert!(!home.join("auth.json").exists());
        std::fs::write(home.join("auth.json"), b"desktop-login").unwrap();
        assert_eq!(primary_launch_store(&home), None);
        let file_home = temp.path().join("file");
        std::fs::create_dir_all(&file_home).unwrap();
        std::fs::write(file_home.join("auth.json"), b"promoted-file").unwrap();
        replace_managed(&file_home, &home).unwrap();
        assert_eq!(primary_launch_store(&home), Some("file"));
        std::fs::remove_file(home.join("auth.json")).unwrap();
        assert_eq!(primary_launch_store(&home), None);
    }
    #[test]
    fn unavailable_or_oversized_transfer_does_not_touch_existing_authorization(){
        let d=tempfile::tempdir().unwrap();let source=d.path().join("source");let live=d.path().join("live");std::fs::create_dir(&source).unwrap();std::fs::create_dir(&live).unwrap();std::fs::write(live.join("auth.json"),b"synthetic-old").unwrap();
        assert!(replace_managed(&source,&live).is_err());assert_eq!(std::fs::read(live.join("auth.json")).unwrap(),b"synthetic-old");
        std::fs::write(source.join("auth.json"),vec![b'x';128*1024+1]).unwrap();assert!(replace_managed(&source,&live).is_err());assert_eq!(std::fs::read(live.join("auth.json")).unwrap(),b"synthetic-old");
    }
    #[tokio::test]
    #[ignore="Explicit local non-mutating primary credential snapshot validation; no inference or official login writes."]
    async fn managed_primary_snapshot_is_readable_without_changing_the_original(){
        let source=official_home().unwrap();let temporary=tempfile::tempdir().unwrap();let destination=temporary.path().join("preserved-auth");
        let before:Vec<_>=["auth.json","secrets/codex_auth.age"].iter().map(|n|{let p=source.join(n);(n.to_string(),std::fs::read(p).ok().map(|b|Sha256::digest(b).to_vec()))}).collect();
        snapshot_managed(&source,&destination).expect("Native managed credential snapshot failed without changing the primary");
        let worker=super::super::worker::Worker::spawn(&destination).await.unwrap();
        let result=worker.request("account/read",json!({"refreshToken":false})).await;
        worker.stop_checked().await.unwrap();let cleanup=delete(&destination);
        assert!(cleanup.is_ok(),"Temporary credential cleanup failed");
        assert!(result.as_ref().ok().is_some_and(|v|v["account"]["type"]=="chatgpt"),"The preserved authorization could not be read by the official backend");
        for (name,hash) in before{assert_eq!(std::fs::read(source.join(name)).ok().map(|b|Sha256::digest(b).to_vec()),hash,"Original credential storage changed during read-only snapshot validation");}
    }
    #[tokio::test]
    #[ignore="Explicit local keyring route verification with an isolated snapshot; no live login or inference."]
    async fn keyring_primary_route_reads_the_official_store() {
        let expected = std::env::var("CODE_CODEX_TEST_PRIMARY_IDENTITY").expect("Expected identity unavailable");
        let original = official_home().unwrap();
        assert_eq!(primary_launch_store(&original), Some("keyring"));
        let temporary = tempfile::tempdir().unwrap();
        let home = temporary.path().join("keyring");
        snapshot_managed(&original,&home).unwrap();
        crate::renderer_storage::atomic(&home.join("managed-auth-source.json"),&json!({"schema":1,"store":"keyring"})).unwrap();
        let result = read_primary(&home,&expected).await;
        let cleaned = delete(&home);
        assert!(cleaned.is_ok(),"Isolated keyring fixture cleanup failed");
        assert!(result.is_ok(),"The official keyring route could not verify its isolated primary credential");
    }
    #[tokio::test]
    #[ignore = "Explicit local Windows credential check; emits no credentials or account response."]
    async fn real_credential_authorizes_native_executor_only() {
        let home = PathBuf::from(
            std::env::var_os("ACCOUNT_TEST_HOME").expect("explicit account test home"),
        );
        let email = std::env::var("ACCOUNT_TEST_EMAIL").expect("explicit account test email");
        let source = if std::env::var("ACCOUNT_TEST_HOST").as_deref() == Ok("true") {
            None
        } else {
            Some(crate::accounts::worker::Worker::spawn(&home).await.unwrap())
        };
        let auth = if let Some(source) = &source {
            managed(source, &email)
                .await
                .expect("native managed credential read failed")
        } else {
            read(&home, &email, true).expect("host credential read failed")
        };
        let temporary = tempfile::tempdir().unwrap();
        let executor = crate::accounts::worker::Worker::spawn(temporary.path())
            .await
            .unwrap();
        let login = executor.request("account/login/start", auth).await;
        if login.is_err() {
            executor.stop().await;
            panic!("native credential handoff rejected without exposing its response");
        }
        let account = executor
            .request("account/read", json!({"refreshToken":false}))
            .await
            .unwrap();
        let matched = account["account"]["email"]
            .as_str()
            .is_some_and(|value| value.eq_ignore_ascii_case(&email));
        executor.stop_checked().await.unwrap();
        if let Some(source) = source {
            source.stop_checked().await.unwrap();
        }
        assert!(matched, "executor did not confirm selected identity");
        assert!(
            !temporary.path().join("auth.json").exists(),
            "external tokens must not persist in executor home"
        );
    }
}
