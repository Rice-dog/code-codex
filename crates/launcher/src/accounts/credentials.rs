//! Native-only credential selection. Secrets never enter renderer responses or registry files.
use super::{AccountError, Result};
use base64::Engine;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

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

/// Fixed native-only token export supported by the qualified official app-server.
/// The account is checked before exporting; neither this response nor the token is queued to renderer.
pub async fn managed(worker: &super::worker::Worker, email: &str) -> Result<Value> {
    managed_observed(worker,email,None).await
}
pub(super) async fn managed_observed(worker:&super::worker::Worker,email:&str,progress:Option<&super::preparation::Preparation>)->Result<Value>{
    if let Some(p)=progress {p.step("credential-refresh",json!({"method":"account/read","refreshToken":true}));}
    let observed = worker
        .request("account/read", json!({"refreshToken":true}))
        .await?;
    if !observed["account"]["email"]
        .as_str()
        .is_some_and(|e| e.eq_ignore_ascii_case(email))
    {
        return Err(AccountError::new(
            "ACCOUNT_CREDENTIAL_IDENTITY",
            "The authorized account no longer matches this connection.",
        ));
    }
    if let Some(p)=progress {p.step("credential-token-export",json!({"method":"getAuthStatus","refreshToken":false}));}
    let exported = worker
        .request(
            "getAuthStatus",
            json!({"includeToken":true,"refreshToken":false}),
        )
        .await
        .map_err(|e| AccountError::new(&e.code,format!("Execution credential export failed. {}",e.message)))?;
    let token = exported["authToken"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() < 64 * 1024)
        .ok_or_else(|| {
            AccountError::new(
                "ACCOUNT_CREDENTIAL",
                "The official backend did not provide an execution credential.",
            )
        })?;
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
    let account = claims["https://api.openai.com/auth"]["chatgpt_account_id"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() < 256)
        .ok_or_else(|| {
            AccountError::protocol("The official execution credential has no account identity.")
        })?;
    Ok(json!({"type":"chatgptAuthTokens","accessToken":token,"chatgptAccountId":account}))
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
