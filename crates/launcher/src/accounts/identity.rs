//! Native-only account response validation; never log response bodies or identities.
use super::{AccountError,Result};
use serde_json::Value;
pub(super) fn check(value:&Value,expected:Option<&str>)->Result<()>{
 let Some(account)=value.get("account")else{return Err(AccountError::new("ACCOUNT_IDENTITY_UNAVAILABLE","The backend account response is incomplete. Retry the account check; saved authorization was not removed. No task was sent."));};
 if account.is_null(){return Err(AccountError::new("ACCOUNT_AUTH_REQUIRED","The backend reports no signed-in account. Check or reauthorize this connection; this response alone does not establish that the saved login expired. No task was sent."));}
 let Some(kind)=account["type"].as_str()else{return Err(AccountError::new("ACCOUNT_IDENTITY_UNAVAILABLE","The backend account type is unavailable. Retry the account check; no task was sent."));};
 if kind!="chatgpt"{return Err(AccountError::new("ACCOUNT_AUTH_MODE_MISMATCH","The backend did not return an official ChatGPT account. Check this connection's authorization mode; no task was sent."));}
 let Some(email)=account["email"].as_str().filter(|e|!e.is_empty()&&e.len()<=320)else{return Err(AccountError::new("ACCOUNT_IDENTITY_UNAVAILABLE","The backend did not provide a verifiable account identity. Retry the account check; saved authorization was not removed. No task was sent."));};
 if expected.is_some_and(|e|!e.eq_ignore_ascii_case(email)){return Err(AccountError::new("ACCOUNT_CREDENTIAL_IDENTITY","The backend returned a different account from this connection's verified identity. Reauthorize the intended account; no task was sent."));}Ok(())
}
pub(super) fn incomplete(error:&AccountError)->bool{matches!(error.code.as_str(),"ACCOUNT_IDENTITY_UNAVAILABLE"|"ACCOUNT_AUTH_REQUIRED")}
#[cfg(test)]mod tests{use super::*;use serde_json::json;
 #[test]fn identity_failures_are_distinct_and_matching_is_case_insensitive(){assert!(check(&json!({"account":{"type":"chatgpt","email":"A@example.invalid"}}),Some("a@example.invalid")).is_ok());for(v,code)in[(json!({}),"ACCOUNT_IDENTITY_UNAVAILABLE"),(json!({"account":null}),"ACCOUNT_AUTH_REQUIRED"),(json!({"account":{"type":"chatgpt"}}),"ACCOUNT_IDENTITY_UNAVAILABLE"),(json!({"account":{"type":"apiKey"}}),"ACCOUNT_AUTH_MODE_MISMATCH"),(json!({"account":{"type":"chatgpt","email":"other@example.invalid"}}),"ACCOUNT_CREDENTIAL_IDENTITY")]{let e=check(&v,Some("a@example.invalid")).unwrap_err();assert_eq!(e.code,code);assert!(!e.message.contains("other@example.invalid"));}}
}
