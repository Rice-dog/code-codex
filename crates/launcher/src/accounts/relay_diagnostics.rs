//! Bounded metadata projection. No request, model output, capability or credential text.
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub(super) fn failure_class(value: &Value) -> &'static str {
    let error = value.get("error").or_else(|| value.get("response").and_then(|v|v.get("error"))).unwrap_or(value);
    match error.get("code").and_then(Value::as_str).or_else(||error.get("type").and_then(Value::as_str)) {
        Some("invalid_encrypted_content" | "encrypted_content_invalid") => "encrypted-context",
        Some("context_length_exceeded"|"context_window_exceeded"|"max_tokens_exceeded")=>"context-limit",
        Some("rate_limit_exceeded"|"usage_limit_exceeded"|"insufficient_quota")=>"quota-or-rate-limit",
        Some("invalid_api_key"|"invalid_token"|"token_expired"|"authentication_error")=>"authentication",
        Some("permission_denied"|"access_denied")=>"permission",
        Some("server_error"|"internal_server_error")=>"upstream-server",
        _ if error["message"].as_str()==Some("The system is currently experiencing high demand and cannot process your request. Your request exceeds the maximum usage size allowed during peak load. For improved capacity reliability, consider switching to Provisioned Throughput.")=>"upstream-peak-capacity",
        _ if encrypted_item(error).is_some() => "encrypted-context",
        _=>"unclassified",
    }
}

/// Only fixed error codes and a hashed, syntactically verified item reference.
pub(super) fn error_summary(value: &Value) -> Value {
    let error = value.get("error")
        .or_else(|| value.get("response").and_then(|v| v.get("error")))
        .unwrap_or(value);
    let code = error["code"].as_str().or_else(|| error["type"].as_str());
    let known = code.filter(|code| matches!(*code,
        "invalid_encrypted_content" | "encrypted_content_invalid" |
        "context_length_exceeded" | "context_window_exceeded" | "max_tokens_exceeded" |
        "rate_limit_exceeded" | "usage_limit_exceeded" | "insufficient_quota" |
        "invalid_api_key" | "invalid_token" | "token_expired" | "authentication_error" |
        "permission_denied" | "access_denied" | "server_error" | "internal_server_error"));
    json!({"classification": failure_class(value), "errorCode": known,
        "codePresent": code.is_some(), "itemFingerprint": encrypted_item(error).map(fingerprint),
        "messageLogged": false})
}

pub(super) fn encrypted_item(error: &Value) -> Option<&str> {
    let message = error["message"].as_str()?;
    let (item, reason) = message.strip_prefix("The encrypted content for item ")?
        .split_once(" could not be verified.")?;
    if reason.trim() != "Reason: Encrypted content could not be decrypted or parsed." { return None; }
    let hex = item.strip_prefix("rs_")?;
    (hex.len() >= 16 && hex.len() <= 128 && hex.bytes().all(|b| b.is_ascii_hexdigit())).then_some(item)
}

pub(super) fn fingerprint(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

/// Exact failed-item lookup from this request's already-computed recovery index.
/// The current route index is comparison evidence, never a retry or recovery rule.
pub(super) fn rejected_input(value:&Value, request:Option<&std::collections::HashMap<String,String>>, current:Option<&std::collections::HashMap<String,String>>)->Option<Value> {
    let error=value.get("error").or_else(||value.get("response").and_then(|v|v.get("error"))).unwrap_or(value);
    if !matches!(error["code"].as_str(),Some("invalid_encrypted_content"|"encrypted_content_invalid")){return None;}
    let id=encrypted_item(error)?;
    let sent=request.and_then(|v|v.get(id));let indexed=current.and_then(|v|v.get(id));
    Some(json!({"itemFingerprint":fingerprint(id),"requestCipherFingerprint":sent,
        "currentIndexCipherFingerprint":indexed,"requestIndexAvailable":request.is_some(),
        "requestIndexedItems":request.map(|v|v.len()),"recoveryIndexMatchesRequest":sent.zip(indexed).map(|(a,b)|a==b),
        "requestItemPresent":sent.is_some(),"currentIndexItemPresent":indexed.is_some(),
        "indexScope":"native-input-before-provider-projection","cause":"unproven","payloadLogged":false}))
}
/// Cheap envelope evidence from the already-parsed request, no serialization.
pub(super) fn request_state(value:&Value)->Option<Value> {
    let input=value["input"].as_array()?;
    Some(json!({"inputItems":input.len(),"toolDefinitions":value["tools"].as_array().map(|v|v.len()),
        "previousResponseFingerprint":value["previous_response_id"].as_str().map(fingerprint),
        "promptCacheKeyFingerprint":value["prompt_cache_key"].as_str().map(fingerprint),
        "modelFingerprint":value["model"].as_str().map(fingerprint),"generating":value["generate"]!=false}))
}

/// Diagnostic budgets never affect forwarding. Missing samples are explicit.
pub(super) fn opaque_summary(items: &[Value]) -> Option<Value> {
    let mut count = 0usize;
    let mut samples = Vec::new();
    let mut hashed_bytes = 0usize;
    for item in items {
        let Some(cipher) = item["encrypted_content"].as_str() else { continue };
        count += 1;
        if samples.len() >= 16 || hashed_bytes.saturating_add(cipher.len()) > 2 * 1024 * 1024 { continue }
        hashed_bytes += cipher.len();
        let kind = match item["type"].as_str() {
            Some("reasoning") => "reasoning", Some("compaction") => "compaction", _ => "other",
        };
        samples.push(json!({"kind":kind,"itemFingerprint":item["id"].as_str().map(fingerprint),
            "opaqueFingerprint":fingerprint(cipher),"bytes":cipher.len(),
            "status":item["status"].as_str().filter(|s|matches!(*s,"completed"|"incomplete"|"in_progress")).unwrap_or("unknown")}));
    }
    (count > 0).then(|| json!({"opaqueCount":count,"omittedSamples":count-samples.len(),
        "hashedBytes":hashed_bytes,"samples":samples,"payloadLogged":false}))
}

pub(super) fn correlation(headers:&reqwest::header::HeaderMap)->Value {
    let mut value=json!({});
    for name in ["x-request-id","request-id","retry-after","x-should-retry"] {
        if let Some(text)=headers.get(name).and_then(|v|v.to_str().ok()).filter(|s|!s.is_empty()&&s.len()<=128&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_. :".contains(&b))) {
            value[name]=json!(text);
        }
    }
    value
}

/// Small error responses only; preserve the original bytes on the forwarding path.
#[derive(Default)]
pub(super) struct ErrorBody { bytes:Vec<u8>, pub received:u64 }
impl ErrorBody {
    pub fn observe(&mut self,bytes:&[u8]) {
        self.received=self.received.saturating_add(bytes.len() as u64);
        self.bytes.extend_from_slice(&bytes[..bytes.len().min(16384usize.saturating_sub(self.bytes.len()))]);
    }
    pub fn summary(&self)->Value {
        let complete=self.received==self.bytes.len() as u64;
        let error = complete.then(||serde_json::from_slice::<Value>(&self.bytes).ok()).flatten();
        let class = error.as_ref().map(failure_class).unwrap_or("unclassified");
        json!({"error":error.as_ref().map(error_summary),"receivedBytes":self.received,"emptyBody":self.received==0,"classification":class,"classificationBodyComplete":complete,"bodyLogged":false})
    }
    pub fn value(&self)->Option<Value> {
        (self.received==self.bytes.len() as u64).then(||serde_json::from_slice(&self.bytes).ok()).flatten()
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn known_context_errors_are_distinct_from_auth_quota_and_unknown_text(){
        assert_eq!(failure_class(&json!({"error":{"code":"context_length_exceeded","message":"secret prompt"}})),"context-limit");
        assert_eq!(failure_class(&json!({"response":{"error":{"code":"token_expired"}}})),"authentication");
        assert_eq!(failure_class(&json!({"error":{"code":"insufficient_quota"}})),"quota-or-rate-limit");
        assert_eq!(failure_class(&json!({"error":{"code":"secret-user-string","message":"context_length_exceeded"}})),"unclassified");
    }
    #[test] fn bounded_body_and_headers_never_project_arbitrary_text(){
        let mut body=ErrorBody::default();body.observe(br#"{"error":{"code":"context_length_exceeded","message":"private-input"}}"#);
        assert_eq!(body.summary()["classification"],"context-limit");assert!(!body.summary().to_string().contains("private-input"));
        body.observe(&vec![b'x';20000]);assert_eq!(body.bytes.len(),16384);assert_eq!(body.summary()["classificationBodyComplete"],false);
        let mut headers=reqwest::header::HeaderMap::new();headers.insert("x-request-id","request-fixture-1".parse().unwrap());headers.insert("request-id","http://127.0.0.1/private".parse().unwrap());headers.insert("authorization","Bearer secret".parse().unwrap());
        assert_eq!(correlation(&headers),json!({"x-request-id":"request-fixture-1"}));
    }
    #[test] fn safe_failure_metadata_survives_the_real_log_redaction_boundary(){
        let mut error=ErrorBody::default();error.observe(br#"{"error":{"code":"invalid_api_key","message":"private provider detail"}}"#);
        let value=crate::runtime_log::redaction::value(json!({"routeSource":"api","requestEncoding":"identity","errorSummary":error.summary(),"body":"private provider detail","authorization":"Bearer private"}));
        assert_eq!(value["routeSource"],"api");assert_eq!(value["errorSummary"]["classification"],"authentication");
        assert_eq!(value["body"],"[redacted]");assert_eq!(value["authorization"],"[redacted]");assert!(!value.to_string().contains("private provider detail"));
    }
}

#[cfg(test)] mod encrypted_tests {
    use super::*;
    #[test] fn refused_item_evidence_is_exact_private_and_request_scoped() {
        let id="rs_0123456789abcdef";
        let error=json!({"error":{"code":"invalid_encrypted_content","message":format!("The encrypted content for item {id} could not be verified. Reason: Encrypted content could not be decrypted or parsed.")}});
        let input=std::collections::HashMap::from([(id.into(),fingerprint("PRIVATE_CIPHER"))]);
        let current=std::collections::HashMap::new();
        let observed=rejected_input(&error,Some(&input),Some(&current)).unwrap();
        assert_eq!(observed["requestCipherFingerprint"],fingerprint("PRIVATE_CIPHER"));
        assert_eq!(observed["requestItemPresent"],true);assert_eq!(observed["currentIndexItemPresent"],false);
        assert!(observed["recoveryIndexMatchesRequest"].is_null());
        let safe=crate::runtime_log::redaction::value(observed);
        assert_eq!(safe["requestCipherFingerprint"],fingerprint("PRIVATE_CIPHER"));
        assert!(!safe.to_string().contains("PRIVATE_"));assert!(!safe.to_string().contains(id));
        assert_eq!(rejected_input(&error,None,None).unwrap()["requestIndexAvailable"],false);
        assert!(rejected_input(&json!({"error":{"code":"invalid_api_key","message":error["error"]["message"]}}),Some(&input),None).is_none());
        assert!(rejected_input(&json!({"error":{"code":"invalid_encrypted_content","message":"arbitrary private text"}}),Some(&input),None).is_none());
    }
    #[test] fn request_envelope_is_metadata_and_does_not_change_input() {
        let input=json!({"input":[{"role":"user","content":"PRIVATE_TEXT"}],"previous_response_id":"PRIVATE_PREV","prompt_cache_key":"PRIVATE_CACHE","model":"PRIVATE_MODEL","tools":[{"description":"PRIVATE_TOOL"}]});
        let original=input.clone();let safe=crate::runtime_log::redaction::value(request_state(&input).unwrap());
        assert_eq!(input,original);assert_eq!(safe["inputItems"],1);assert_eq!(safe["toolDefinitions"],1);
        assert_eq!(safe["previousResponseFingerprint"],fingerprint("PRIVATE_PREV"));assert!(!safe.to_string().contains("PRIVATE_"));
        assert!(request_state(&json!({"type":"response.output_item.done"})).is_none());
    }
    #[test] fn encrypted_error_and_unknown_fields_are_distinct_and_private() {
        let id="rs_0123456789abcdef";
        let value=json!({"error":{"code":"invalid_encrypted_content","message":format!("The encrypted content for item {id} could not be verified. Reason: Encrypted content could not be decrypted or parsed.")}});
        let safe=crate::runtime_log::redaction::value(error_summary(&value));
        assert_eq!(safe["classification"],"encrypted-context");
        assert_eq!(safe["itemFingerprint"],fingerprint(id));
        assert!(!safe.to_string().contains(id));
        assert_eq!(error_summary(&json!({"error":{"code":"private-code","message":"private-prompt"}}))["errorCode"],Value::Null);
    }
    #[test] fn opaque_observation_is_bounded_without_mutating_input() {
        let items=vec![json!({"id":"rs_fixture","type":"reasoning","encrypted_content":"PRIVATE_CIPHER","status":"completed"});20];
        let original=items.clone();let summary=opaque_summary(&items).unwrap();
        assert_eq!(summary["opaqueCount"],20);assert_eq!(summary["omittedSamples"],4);
        assert!(!summary.to_string().contains("PRIVATE_CIPHER"));assert_eq!(items,original);
        let large=vec![json!({"encrypted_content":"x".repeat(2*1024*1024+1)})];
        assert_eq!(opaque_summary(&large).unwrap()["omittedSamples"],1);
        assert!(opaque_summary(&[json!({"role":"user","content":"private"})]).is_none());
    }
}
