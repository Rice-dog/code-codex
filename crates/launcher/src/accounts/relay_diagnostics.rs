//! Bounded metadata projection. No request, model output, capability or credential text.
use serde_json::{Value, json};

pub(super) fn failure_class(value: &Value) -> &'static str {
    let error = value.get("error").or_else(|| value.get("response").and_then(|v|v.get("error"))).unwrap_or(value);
    match error.get("code").and_then(Value::as_str).or_else(||error.get("type").and_then(Value::as_str)) {
        Some("context_length_exceeded"|"context_window_exceeded"|"max_tokens_exceeded")=>"context-limit",
        Some("rate_limit_exceeded"|"usage_limit_exceeded"|"insufficient_quota")=>"quota-or-rate-limit",
        Some("invalid_api_key"|"invalid_token"|"token_expired"|"authentication_error")=>"authentication",
        Some("permission_denied"|"access_denied")=>"permission",
        Some("server_error"|"internal_server_error")=>"upstream-server",
        _=>"unclassified",
    }
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
        let class=if complete {serde_json::from_slice::<Value>(&self.bytes).ok().map(|v|failure_class(&v)).unwrap_or("unclassified")}else{"unclassified"};
        json!({"receivedBytes":self.received,"emptyBody":self.received==0,"classification":class,"classificationBodyComplete":complete,"bodyLogged":false})
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
}
