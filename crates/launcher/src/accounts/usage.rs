//! Bounded quota and asset projection. Only reset-card IDs needed for explicit redemption; no auth metadata.
use serde_json::{Value,json};
pub fn project(raw: &Value) -> Value {
    fn window(raw: &Value) -> Value {
        let valid = raw["usedPercent"].as_f64().is_some_and(|n| n.is_finite() && (0.0..=100.0).contains(&n))
            && raw["windowDurationMins"].as_u64().is_some_and(|n| n > 0)
            && raw["resetsAt"].as_i64().is_some_and(|n| n > 0);
        if !valid { return Value::Null; }
        json!({"usedPercent":raw["usedPercent"],"windowDurationMins":raw["windowDurationMins"],"resetsAt":raw["resetsAt"]})
    }
    fn bucket(raw: &Value) -> Value {
        let id=raw["limitId"].as_str().filter(|s|s.len()<=100);
        let mut out=json!({"limitId":id,"normalModelSlug":raw["normalModelSlug"].as_str().filter(|s|s.len()<=160),"primary":window(&raw["primary"]),"secondary":window(&raw["secondary"])});
        if let Some(c)=raw.get("credits") { out["credits"]=json!({"balance":c["balance"].as_str().filter(|s|s.len()<=80&&s.parse::<f64>().is_ok_and(|n|n.is_finite()&&n>=0.0)),"hasCredits":c["hasCredits"].as_bool(),"unlimited":c["unlimited"].as_bool()}); }
        out
    }
    let mut buckets=serde_json::Map::new();
    if let Some(values)=raw["rateLimitsByLimitId"].as_object(){for (id,value) in values.iter().take(32){if id.len()<=100{buckets.insert(id.clone(),bucket(value));}}}
    let mut out=json!({"rateLimits":bucket(&raw["rateLimits"]),"rateLimitsByLimitId":buckets});
    if let Some(value)=raw.get("ordinaryUsageAllowed") {out["ordinaryUsageAllowed"]=json!(value.as_bool());}
    if let Some(c)=raw.get("rateLimitResetCredits") {
        let cards=c["credits"].as_array().map(|rows|rows.iter().take(64).filter(|v|v["id"].as_str().is_some_and(|s|!s.is_empty()&&s.len()<=256)&&v["grantedAt"].as_i64().is_some_and(|n|n>0)&&(v["expiresAt"].is_null()||v["expiresAt"].as_i64().is_some_and(|n|n>0&&n<=8640000000000))).map(|v|json!({"id":v["id"],"grantedAt":v["grantedAt"],"title":v["title"].as_str().filter(|s|s.len()<=200),"description":v["description"].as_str().filter(|s|s.len()<=600),"expiresAt":v["expiresAt"].as_i64().filter(|n|*n>0),"status":v["status"].as_str().filter(|s|matches!(*s,"available"|"redeemed"|"redeeming"|"unknown")),"resetType":v["resetType"].as_str().filter(|s|matches!(*s,"codexRateLimits"|"unknown"))})).collect::<Vec<_>>());
        out["rateLimitResetCredits"]=json!({"availableCount":c["availableCount"].as_u64().filter(|n|*n<=9007199254740991),"credits":cards});
    }
    out
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn quota_projection_is_non_secret_and_bounded(){
        let raw=json!({"accountId":"private","rateLimitResetCredits":{"credits":[{"id":"private"}]},"rateLimits":{"limitId":"codex","primary":{"usedPercent":100,"windowDurationMins":300,"resetsAt":2000000000,"token":"private"}}});
        let p=project(&raw);assert_eq!(p["rateLimits"]["primary"]["usedPercent"],100);assert!(!p.to_string().contains("private"));
    }
    #[test] fn malformed_quota_is_unknown_not_zero(){for used in [-1,101]{assert!(project(&json!({"rateLimits":{"primary":{"usedPercent":used,"windowDurationMins":300,"resetsAt":2000000000}}}))["rateLimits"]["primary"].is_null());}}
    #[test] fn assets_are_explicit_bounded_and_sparse() {
        let raw=json!({"authToken":"secret","rateLimits":{"credits":{"balance":"120.5","hasCredits":true,"unlimited":false,"token":"secret"}},"rateLimitResetCredits":{"availableCount":2,"credits":[{"id":"card-id","grantedAt":1,"expiresAt":2000000000,"resetType":"codexRateLimits","status":"available","title":"Full reset","description":"5H and weekly","token":"secret"},{"id":"bad-expiry","grantedAt":1,"expiresAt":-1}]}});
        let v=project(&raw);assert_eq!(v["rateLimits"]["credits"]["balance"],"120.5");assert_eq!(v["rateLimitResetCredits"]["availableCount"],2);assert_eq!(v["rateLimitResetCredits"]["credits"].as_array().unwrap().len(),1);assert_eq!(v["rateLimitResetCredits"]["credits"][0]["id"],"card-id");assert!(!v.to_string().contains("secret"));
        assert!(project(&json!({})).get("rateLimitResetCredits").is_none());
        assert_eq!(project(&json!({"rateLimitResetCredits":{"availableCount":0,"credits":[]}}))["rateLimitResetCredits"]["availableCount"],0);
        assert!(project(&json!({"rateLimitResetCredits":{"availableCount":-1}}))["rateLimitResetCredits"]["availableCount"].is_null());
    }

}
