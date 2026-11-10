use super::*;
fn fixture() -> Value { json!({"complete":true,"changes":[
 {"path":"same.js","change":"dependency_mapping_changed","before":{"sha256":"same","kind":"code"},"after":{"sha256":"same","kind":"code"},"dependencyIds":["ok"]},
 {"path":"ok.js","dependencyIds":["ok"]},
 {"path":"bad.js","dependencyIds":["bad"]},
 {"path":"partial.js","dependencyIds":["partial"]},
 {"path":"unknown.js","dependencyIds":[]}
 ]}) }
fn registry_fixture() -> Value { json!({"rules":[
 {"id":"ok","automatedChecks":["ok-check"],"checks":[]},
 {"id":"bad","automatedChecks":["bad-check"],"checks":[]},
 {"id":"partial","automatedChecks":["ok-check"],"checks":["A real provider/tool turn needs deliberate execution."],"manualReason":"Provider use is not executed in an active conversation.","manualSteps":["Use a disposable task and confirm exactly one tool call."]}
 ]}) }
fn checks() -> Vec<Value> { vec![check("ok-check","passed","fixture","pass"),check("bad-check","issue","fixture","fail")] }
#[test]
fn four_way_results_are_distinct_and_sum_to_every_change() {
 let r=summarize_with_registry(&fixture(),&checks(),registry_fixture());
 assert_eq!(r["counts"]["all"],5);assert_eq!(r["counts"]["noImpact"],1);assert_eq!(r["counts"]["passed"],1);assert_eq!(r["counts"]["issues"],1);assert_eq!(r["counts"]["manual"],2);
 assert_eq!(r["changes"][4]["classification"],"involved");
 assert_eq!(r["checkCounts"]["passed"],1);assert_eq!(r["checkCounts"]["issues"],1);
}
#[test]
fn partial_pass_never_becomes_a_full_feature_or_change_pass() {
 let r=summarize_with_registry(&fixture(),&checks(),registry_fixture());
 assert_eq!(r["changes"][3]["status"],"manual");
 let partial=r["features"].as_array().unwrap().iter().find(|f|f["id"]=="partial").unwrap();
 assert_eq!(partial["checks"][0]["status"],"passed");assert_eq!(partial["checks"][1]["status"],"manual");
 assert!(markdown(&r).contains("disposable task"));assert!(markdown(&r).contains("Why manual"));
}
#[test]
fn unexecuted_automatic_check_is_manual_and_is_not_claimed_passed() {
 let r=summarize_with_registry(&fixture(),&[],registry_fixture());
 assert_eq!(r["counts"]["passed"],0);assert_eq!(r["counts"]["issues"],0);assert_eq!(r["checkCounts"]["manual"],2);
}
#[test]
fn incomplete_inventory_cannot_prove_a_mapping_only_no_impact() {
 let mut input=fixture();input["complete"]=json!(false);
 let r=summarize_with_registry(&input,&checks(),registry_fixture());assert_eq!(r["counts"]["noImpact"],0);
}
#[test]
fn unknown_resource_and_unknown_code_are_not_harmless() {
 let r=summarize_with_registry(&json!({"complete":true,"changes":[{"path":"image.png","category":"no_known_plugin_dependency","dependencyIds":[]},{"path":"new.js","dependencyIds":[]}]}),&checks(),registry_fixture());
 assert_eq!(r["counts"]["manual"],2);assert_eq!(r["counts"]["noImpact"],0);assert_eq!(r["features"].as_array().unwrap().len(),3);
}
fn report_dir(dir:&Path,id:&str,kind:&str,time:u64)->PathBuf {
 let p=dir.join("reports").join(id);fs::create_dir_all(&p).unwrap();
 atomic(&p.join("report.json"),&json!({"version":"new","package":"official","type":kind,"observedMs":time,"complete":true})).unwrap();
 fs::write(p.join("snapshot.json"),b"snapshot").unwrap();p
}
#[test]
fn refresh_retains_the_last_real_update_and_all_original_bytes() {
 let d=tempfile::tempdir().unwrap();let p=report_dir(d.path(),"original","update",1);let before=fs::read(p.join("report.json")).unwrap();
 report_dir(d.path(),"refresh","analysis_refresh",2);atomic(&d.path().join("latest.json"),&json!({"id":"refresh"})).unwrap();
 assert_eq!(anchor(d.path()).unwrap().0,"original");assert_eq!(fs::read(p.join("report.json")).unwrap(),before);
 let a=identity(d.path(),"original").unwrap();assert_eq!(a["reportSha256"],hash(&before));
 fs::write(p.join("report.json"),b"changed").unwrap();assert_ne!(identity(d.path(),"original").unwrap(),a);
}
#[test]
fn stale_engine_rules_and_version_are_separate_from_inventory_freshness() {
 let d=tempfile::tempdir().unwrap();atomic(&d.path().join("latest.json"),&json!({"version":"new"})).unwrap();
 assert_eq!(status(d.path()).unwrap()["status"],"pending");
 let mut index=json!({"status":"manual_required","version":"new","identity":{"registryHash":registry_hash(),"engineHash":engine_hash(),"inventoryId":null}});
 atomic(&d.path().join("validation-latest.json"),&index).unwrap();assert_eq!(status(d.path()).unwrap()["status"],"manual_required");
 index["identity"]["engineHash"]=json!("old");atomic(&d.path().join("validation-latest.json"),&index).unwrap();assert_eq!(status(d.path()).unwrap()["status"],"refresh_required");
 index["identity"]["engineHash"]=json!(engine_hash());index["identity"]["registryHash"]=json!("old");atomic(&d.path().join("validation-latest.json"),&index).unwrap();assert_eq!(status(d.path()).unwrap()["status"],"refresh_required");
 index["version"]=json!("another");atomic(&d.path().join("validation-latest.json"),&index).unwrap();assert_eq!(status(d.path()).unwrap()["status"],"pending");
}
#[test]
fn registry_check_references_resolve_and_manual_steps_are_concrete() {
 let ids=["package.inventory","package.modules","host.interfaces","host.quota","host.layout","host.menu","host.composer","host.theme","host.models","host.ownership","regression.interfaces","regression.layout","regression.models"];
 for r in registry()["rules"].as_array().unwrap() {
  assert!(!r["automatedChecks"].as_array().unwrap().is_empty());
  for id in r["automatedChecks"].as_array().unwrap(){assert!(ids.contains(&id.as_str().unwrap()),"{id}");}
  assert!(!r["manualReason"].as_str().unwrap().is_empty());assert!(!r["manualSteps"].as_array().unwrap().is_empty());
 }
}
#[test]
fn report_ids_cannot_escape_the_ledger() {
 let d=tempfile::tempdir().unwrap();for id in ["../other","a/b","a\\b",""]{assert!(id_path(d.path(),id).is_err());}
}
#[test]
fn nonzero_reclassification_adds_new_rules_without_erasing_update_paths() {
 let d=tempfile::tempdir().unwrap();let original=report_dir(d.path(),"original","update",1);
 let mut report=read_json(&original.join("report.json")).unwrap();report["changes"]=json!([{"path":"changed.js","dependencyIds":["old"]}]);atomic(&original.join("report.json"),&report).unwrap();let before=fs::read(original.join("report.json")).unwrap();
 let refresh=report_dir(d.path(),"refresh","analysis_refresh",2);let mut report=read_json(&refresh.join("report.json")).unwrap();report["changes"]=json!([{"path":"changed.js","dependencyIds":["new"]},{"path":"unchanged.js","dependencyIds":["extra"]}]);atomic(&refresh.join("report.json"),&report).unwrap();
 atomic(&d.path().join("latest.json"),&json!({"id":"refresh"})).unwrap();let (id,merged)=anchor(d.path()).unwrap();
 assert_eq!(id,"original");assert_eq!(merged["changes"].as_array().unwrap().len(),1);assert_eq!(merged["changes"][0]["dependencyIds"],json!(["new","old"]));assert_eq!(merged["analysisDependencyIds"],json!(["extra","new"]));assert_eq!(fs::read(original.join("report.json")).unwrap(),before);
 assert_eq!(identity(d.path(),"original").unwrap()["inventoryId"],"refresh");
}
