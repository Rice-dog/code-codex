use super::*;
fn token(mut claims:Value)->Value {
    if claims.get("https://api.openai.com/auth").is_none(){claims["https://api.openai.com/auth"]=json!({"chatgpt_account_id":"fixture-workspace"});}
    let part=base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
    json!({"authToken":format!("fixture.{part}.fixture-signature")})
}
#[test]fn native_token_requires_expected_identity_workspace_and_safe_lifetime(){
    let now=1000;let valid=token(json!({"email":"EXPECTED@example.invalid","exp":2000}));
    assert!(managed_token(&valid,"expected@example.invalid",now,false).unwrap().is_some());
    for claims in [json!({"email":"expected@example.invalid","exp":1300}),json!({"email":"expected@example.invalid","exp":999}),json!({"exp":2000}),json!({"email":"expected@example.invalid"}),json!({"email":"expected@example.invalid","exp":2000,"nbf":1001}),json!({"email":"expected@example.invalid","exp":"2000"}),json!({"email":"expected@example.invalid","exp":2000,"https://api.openai.com/auth":{"chatgpt_account_id":""}})]{
        assert!(managed_token(&token(claims),"expected@example.invalid",now,false).unwrap().is_none());
    }
    for claims in [json!({"email":"other@example.invalid","exp":2000}),json!({"email":"expected@example.invalid","exp":2000,"https://api.openai.com/profile":{"email":"other@example.invalid"}})]{assert_eq!(managed_token(&token(claims),"expected@example.invalid",now,false).unwrap_err().code,"ACCOUNT_CREDENTIAL_IDENTITY");}
    for value in [json!({}),json!({"authToken":"opaque"}),json!({"authToken":42})]{assert!(managed_token(&value,"expected@example.invalid",now,false).unwrap().is_none());}
}
#[test]fn legacy_claims_need_fresh_native_identity_and_known_stale_tokens_never_pass(){
    assert!(managed_token(&token(json!({})),"expected@example.invalid",1000,false).unwrap().is_none());
    assert!(managed_token(&token(json!({})),"expected@example.invalid",1000,true).unwrap().is_some());
    for claims in [json!({"exp":1000}),json!({"exp":2000,"nbf":1001}),json!({"exp":null})]{assert!(managed_token(&token(claims),"expected@example.invalid",1000,true).unwrap().is_none());}
}
#[cfg(windows)]async fn source(mode:&str)->(tempfile::TempDir,std::sync::Arc<super::super::Worker>){
    let d=tempfile::tempdir().unwrap();let script=d.path().join("credential.ps1");let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let fresh=token(json!({"email":"expected@example.invalid","exp":now+3600}));let old=match mode {
        "expired"=>token(json!({"email":"expected@example.invalid","exp":now+10})),
        "mismatch"=>token(json!({"email":"other@example.invalid","exp":now+3600})),
        "legacy"=>token(json!({"exp":now+3600})),
        "empty"|"null"=>json!({"authToken":null}),_=>fresh.clone(),
    };
    let body=r#"param([string]$FixtureRoot)
$mode='__MODE__'
$exports=0
while($null -ne ($line=[Console]::ReadLine())){
 $r=$line|ConvertFrom-Json
 [IO.File]::AppendAllText((Join-Path $FixtureRoot 'methods'),([string]$r.method+':'+[string]$r.params.refreshToken+"`n"))
 if($null -eq $r.id){continue}
 $v=@{}
 if($r.method -eq 'getAuthStatus'){$exports++;$v=if($exports -eq 1 -or $mode -eq 'legacy'){'__OLD__'|ConvertFrom-Json}else{'__FRESH__'|ConvertFrom-Json}}
 if($r.method -eq 'account/rateLimits/read' -and $mode -eq 'quota-pending'){continue}
 if($r.method -eq 'account/read'){
  if($mode -eq 'fresh'){@{id=$r.id;error=@{code=-32603;message='workspace routing discovery timed out'}}|ConvertTo-Json -Compress -Depth 8|ForEach-Object{[Console]::WriteLine($_)};continue}
  $v=if($mode -eq 'null'){@{account=$null}}else{@{account=@{type='chatgpt';email='expected@example.invalid'}}}
 }
 @{id=$r.id;result=$v}|ConvertTo-Json -Compress -Depth 8|ForEach-Object{[Console]::WriteLine($_)}
}
"#;
    std::fs::write(&script,body.replace("__MODE__",mode).replace("__OLD__",&old.to_string()).replace("__FRESH__",&fresh.to_string())).unwrap();
    let w=super::super::Worker::spawn_fixture(d.path(),&script,None).await.unwrap();(d,w)
}
#[tokio::test]#[cfg(windows)]async fn fresh_credential_uses_one_local_read_and_no_network_identity_refresh(){
    let(d,w)=source("fresh").await;let auth=managed(&w,"expected@example.invalid").await.unwrap();assert_eq!(auth["chatgptAccountId"],"fixture-workspace");w.stop_checked().await.unwrap();
    let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert_eq!(methods.matches("getAuthStatus:").count(),1);assert!(!methods.contains("account/read")&&!methods.contains("account/login")&&!methods.contains("turn/"));
}
#[tokio::test]#[cfg(windows)]async fn expired_empty_and_legacy_credentials_refresh_once_and_null_auth_stays_required(){
    for mode in ["expired","empty","legacy","null"]{let(d,w)=source(mode).await;let result=managed(&w,"expected@example.invalid").await;if mode=="null"{assert_eq!(result.unwrap_err().code,"ACCOUNT_AUTH_REQUIRED");}else{assert_eq!(result.unwrap()["chatgptAccountId"],"fixture-workspace");}w.stop_checked().await.unwrap();let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert_eq!(methods.matches("account/read:True").count(),1,"{mode}");assert_eq!(methods.matches("getAuthStatus:").count(),if mode=="null"{1}else{2},"{mode}");assert!(!methods.contains("account/login")&&!methods.contains("turn/"));}
}
#[tokio::test]#[cfg(windows)]async fn mismatched_identity_and_pending_login_never_export_a_usable_credential(){
    let(d,w)=source("mismatch").await;assert_eq!(managed(&w,"expected@example.invalid").await.unwrap_err().code,"ACCOUNT_CREDENTIAL_IDENTITY");w.stop_checked().await.unwrap();assert!(!std::fs::read_to_string(d.path().join("methods")).unwrap().contains("account/read"));
    let(d,w)=source("fresh").await;w.request("account/login/start",json!({"type":"chatgpt"})).await.unwrap();assert_eq!(managed(&w,"expected@example.invalid").await.unwrap_err().code,"ACCOUNT_CREDENTIAL_SOURCE");w.stop_checked().await.unwrap();assert!(!std::fs::read_to_string(d.path().join("methods")).unwrap().contains("getAuthStatus"));
}
#[tokio::test]#[cfg(windows)]async fn ordinary_check_preserves_plan_but_confirmed_reauthorization_still_requires_native_read(){
    let(d,w)=source("fresh").await;let account=observe_managed(&w,"expected@example.invalid",Some("plus"),false).await.unwrap();assert_eq!(account["account"]["planType"],"plus");assert_eq!(account["account"]["email"],"expected@example.invalid");
    let error=observe_managed(&w,"expected@example.invalid",Some("plus"),true).await.unwrap_err();assert_eq!(error.code,"ACCOUNT_BACKEND_HEALTH");assert!(error.message.contains("originalCode=ACCOUNT_WORKSPACE_ROUTING"));w.stop_checked().await.unwrap();let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert_eq!(methods.matches("getAuthStatus:").count(),1);assert_eq!(methods.matches("account/read:True").count(),1);
}
#[tokio::test]#[cfg(windows)]async fn slow_quota_does_not_block_local_credential_selection(){
    let(d,w)=source("quota-pending").await;let worker=w.clone();let quota=tokio::spawn(async move{worker.request("account/rateLimits/read",json!({})).await});
    for _ in 0..100{if w.pending_count()>0{break;}tokio::time::sleep(std::time::Duration::from_millis(5)).await;}assert_eq!(w.pending_count(),1);
    let result=tokio::time::timeout(std::time::Duration::from_secs(2),managed(&w,"expected@example.invalid")).await;quota.abort();let _=quota.await;assert!(result.unwrap().is_ok());w.stop_checked().await.unwrap();let methods=std::fs::read_to_string(d.path().join("methods")).unwrap();assert!(!methods.contains("account/read"));
}
#[tokio::test]#[cfg(windows)]async fn upstream_rejection_requires_refresh_and_only_verified_success_clears_it(){
    let(d,w)=source("fresh").await;w.invalidate_credential();assert!(managed(&w,"expected@example.invalid").await.is_err());assert!(w.credential_refresh_required());w.stop_checked().await.unwrap();assert!(std::fs::read_to_string(d.path().join("methods")).unwrap().contains("account/read:True"));
    let(_d,w)=source("empty").await;w.invalidate_credential();assert!(managed(&w,"expected@example.invalid").await.is_ok());assert!(!w.credential_refresh_required());w.stop_checked().await.unwrap();
}
#[tokio::test]#[cfg(windows)]async fn a_later_rejection_survives_an_older_refresh_completion(){
    let(_d,w)=source("fresh").await;w.invalidate_credential();let old=w.credential_refresh_ticket();w.invalidate_credential();w.credential_refreshed(old);assert!(w.credential_refresh_required());let current=w.credential_refresh_ticket();w.credential_refreshed(current);assert!(!w.credential_refresh_required());w.stop_checked().await.unwrap();
}
