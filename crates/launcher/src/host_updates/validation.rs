//! Append-only compatibility evidence, independent of the inventory baseline.
use super::*;
use cdp_client::CdpEndpoint;
use std::sync::{OnceLock, RwLock};

static ENDPOINT: OnceLock<RwLock<Option<CdpEndpoint>>> = OnceLock::new();
pub(super) fn set_endpoint(endpoint: CdpEndpoint) {
    *ENDPOINT.get_or_init(|| RwLock::new(None)).write().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(endpoint);
}
pub(super) fn endpoint() -> Option<CdpEndpoint> {
    *ENDPOINT.get_or_init(|| RwLock::new(None)).read().unwrap_or_else(std::sync::PoisonError::into_inner)
}
fn engine_hash() -> String {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| hash(&[include_bytes!("validation.rs").as_slice(), include_bytes!("../../../../packages/explorer-ui/dist/host-update-probes.js").as_slice()].concat())).clone()
}
fn id_path(dir: &Path, id: &str) -> io::Result<PathBuf> {
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b)) {
        return Err(io::Error::other("HOST_UPDATE_REPORT_ID: Invalid report identity."));
    }
    let path = dir.join("reports").join(id);
    private_dir(&path)?;
    Ok(path)
}
// A zero-delta analysis refresh must not hide the update that still needs tests.
fn anchor(dir: &Path) -> io::Result<(String, Value)> {
    let latest = read_json(&dir.join("latest.json"))?;
    let id = latest["id"].as_str().ok_or_else(|| io::Error::other("HOST_UPDATE_REPORT_PENDING"))?;
    let report = read_json(&id_path(dir, id)?.join("report.json"))?;
    if report["type"] != "analysis_refresh" { return Ok((id.into(), report)); }
    let mut selected = (id.to_string(), report.clone());
    let mut selected_time = 0;
    for item in fs::read_dir(dir.join("reports"))? {
        let item = item?;
        if !item.file_type()?.is_dir() { continue; }
        let candidate_id = item.file_name().to_string_lossy().into_owned();
        let candidate_path = id_path(dir, &candidate_id)?;
        let r = read_json(&candidate_path.join("report.json"))?;
        if r["version"] == report["version"] && r["package"] == report["package"] && r["type"] == "update" && r["observedMs"].as_u64().unwrap_or(0) > selected_time {
            selected_time = r["observedMs"].as_u64().unwrap_or(0);
            selected = (candidate_id, r);
        }
    }
    // Keep the original update as the immutable anchor, but apply all newly
    // registered dependencies from the current analysis refresh in memory.
    let mut affected = BTreeSet::new();
    for changed in report["changes"].as_array().into_iter().flatten() {
        let mapped: BTreeSet<String> = changed["dependencyIds"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_owned).collect();
        affected.extend(mapped.iter().cloned());
        if let Some(change) = selected.1["changes"].as_array_mut().and_then(|changes|changes.iter_mut().find(|c|c["path"]==changed["path"])) {
            let mut ids: BTreeSet<String> = change["dependencyIds"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_owned).collect();
            ids.extend(mapped);change["dependencyIds"]=json!(ids);
        }
    }
    selected.1["analysisDependencyIds"]=json!(affected);
    selected.1["complete"]=json!(selected.1["complete"]==true && report["complete"]==true);
    Ok(selected)
}
fn identity(dir: &Path, id: &str) -> io::Result<Value> {
    let path = id_path(dir, id)?;
    let latest=read_json(&dir.join("latest.json"))?;
    let inventory_id=latest["id"].as_str().ok_or_else(||io::Error::other("HOST_UPDATE_REPORT_PENDING"))?;
    let inventory=id_path(dir,inventory_id)?;
    Ok(json!({"reportId":id,"reportSha256":hash(&fs::read(path.join("report.json"))?),"snapshotSha256":hash(&fs::read(path.join("snapshot.json"))?),"inventoryId":inventory_id,"inventoryReportSha256":hash(&fs::read(inventory.join("report.json"))?),"inventorySnapshotSha256":hash(&fs::read(inventory.join("snapshot.json"))?),"registryHash":registry_hash(),"engineHash":engine_hash()}))
}
pub(super) fn status(dir: &Path) -> io::Result<Value> {
    if !dir.join("latest.json").is_file() { return Ok(json!({"status":"pending"})); }
    let latest = read_json(&dir.join("latest.json"))?;
    let path = dir.join("validation-latest.json");
    if !path.is_file() { return Ok(json!({"status":"pending"})); }
    let mut index = read_json(&path)?;
    if index["version"] != latest["version"] { return Ok(json!({"status":"pending"})); }
    // Small status reads never re-read an inventory, load host modules or run tests.
    if index["identity"]["registryHash"] != registry_hash() || index["identity"]["engineHash"] != engine_hash() || index["identity"]["inventoryId"] != latest["id"] {
        index["status"] = json!("refresh_required");
    }
    Ok(index)
}
fn check(id: &str, status: &str, scope: &str, detail: &str) -> Value {
    json!({"id":id,"status":status,"scope":scope,"detail":detail})
}
fn summarize(report: &Value, executed: &[Value]) -> Value {
    summarize_with_registry(report, executed, registry())
}
fn summarize_with_registry(report: &Value, executed: &[Value], registry: Value) -> Value {
    let mut checks = executed.to_vec();
    let known: BTreeSet<_> = report["changes"].as_array().into_iter().flatten().flat_map(|c| c["dependencyIds"].as_array().into_iter().flatten().filter_map(Value::as_str)).chain(report["analysisDependencyIds"].as_array().into_iter().flatten().filter_map(Value::as_str)).collect();
    let unknown = report["changes"].as_array().into_iter().flatten().any(|c| c["dependencyIds"].as_array().is_none_or(Vec::is_empty));
    let mut features = Vec::new();
    for rule in registry["rules"].as_array().into_iter().flatten() {
        let id = rule["id"].as_str().unwrap_or("");
        if !unknown && !known.contains(id) { continue; }
        let auto: Vec<_> = rule["automatedChecks"].as_array().into_iter().flatten().filter_map(Value::as_str).collect();
        let mut feature_checks = Vec::new();
        for requested in auto {
            if let Some(executed) = checks.iter().find(|c| c["id"] == requested) { feature_checks.push(executed.clone()); }
            else {
                let missing = check(requested, "manual", "unavailable", "This automatic check did not execute. Recheck with the qualified official document available.");
                feature_checks.push(missing.clone());
                if !checks.iter().any(|c| c["id"] == requested) { checks.push(missing); }
            }
        }
        for (n, required) in rule["checks"].as_array().into_iter().flatten().enumerate() {
            feature_checks.push(json!({"id":format!("{id}.scenario.{n}"),"status":"manual","scope":"behavioral-acceptance","detail":required,"reason":rule["manualReason"],"steps":rule["manualSteps"]}));
        }
        let state = if feature_checks.iter().any(|c| c["status"] == "issue") { "issue" } else if feature_checks.is_empty() || feature_checks.iter().any(|c| c["status"] != "passed") { "manual" } else { "passed" };
        features.push(json!({"id":id,"feature":rule["feature"],"status":state,"checks":feature_checks,"sourceFiles":rule["sources"],"developmentTests":rule["tests"]}));
    }
    let changes: Vec<_> = report["changes"].as_array().into_iter().flatten().map(|c| {
        let unchanged = report["complete"] == true && c["change"] == "dependency_mapping_changed" && c["before"]["sha256"].is_string() && c["before"]["sha256"] == c["after"]["sha256"] && c["before"]["kind"] == c["after"]["kind"];
        let ids: Vec<_> = c["dependencyIds"].as_array().into_iter().flatten().filter_map(Value::as_str).collect();
        let relevant:Vec<_> = features.iter().filter(|f| ids.contains(&f["id"].as_str().unwrap_or(""))).collect();
        let state = if unchanged { "no_impact" } else if relevant.iter().any(|f| f["status"] == "issue") { "issue" } else if !ids.is_empty() && !relevant.is_empty() && relevant.iter().all(|f| f["status"] == "passed") { "passed" } else { "manual" };
        json!({"path":c["path"],"change":c["change"],"classification":if unchanged{"no_impact"}else{"involved"},"status":state,"dependencyIds":ids,"basis":if unchanged{"Only the dependency mapping changed; official bytes and kind are identical. Feature compatibility is reported separately."}else if ids.is_empty(){"No dependency mapping is proven. Unknown code/resources remain involved and require review; absence of a match is not no-impact evidence."}else{"Linked checks and behavioral scenarios determine this status; a partial pass cannot certify the change."}})
    }).collect();
    let count = |state: &str| changes.iter().filter(|c| c["status"] == state).count();
    let counts = json!({"all":changes.len(),"noImpact":count("no_impact"),"passed":count("passed"),"issues":count("issue"),"manual":count("manual"),"manualGroups":features.iter().filter(|f|f["checks"].as_array().is_some_and(|c|c.iter().any(|c|c["status"]=="manual"))).count()+usize::from(unknown)});
    let check_counts = json!({"passed":checks.iter().filter(|c|c["status"]=="passed").count(),"issues":checks.iter().filter(|c|c["status"]=="issue").count(),"manual":checks.iter().filter(|c|c["status"]=="manual").count()});
    json!({"changes":changes,"features":features,"automatedChecks":checks,"counts":counts,"checkCounts":check_counts,"unknownChangesRequireReview":unknown,"coverage":"Executed package/host contracts and behavioral scenarios are reported independently. Development scripts are candidates, not automatically certified tests. No login, account mutation, inference, navigation or provider billing was performed."})
}
fn markdown(result: &Value) -> String {
    let mut s = format!("# Official Codex compatibility validation\n\nReport: {}. Official version: {}.\n\n{} recorded changes: {} no impact, {} passed, {} found issues, {} require manual acceptance.\n\nAutomatic checks: {} passed, {} found issues, {} unavailable. Partial checks do not mean a full functional pass.\n\nRules: {}; engine: {}.\n\n{}\n\n## Executed automatic checks\n\n",result["identity"]["reportId"],result["version"],result["counts"]["all"],result["counts"]["noImpact"],result["counts"]["passed"],result["counts"]["issues"],result["counts"]["manual"],result["checkCounts"]["passed"],result["checkCounts"]["issues"],result["checkCounts"]["manual"],result["identity"]["registryHash"],result["identity"]["engineHash"],result["coverage"].as_str().unwrap_or(""));
    for c in result["automatedChecks"].as_array().into_iter().flatten() { s += &format!("- **{}** `{}` ({}): {}\n",c["status"].as_str().unwrap_or("manual"),c["id"].as_str().unwrap_or(""),c["scope"].as_str().unwrap_or(""),c["detail"].as_str().unwrap_or("")); }
    s += "\n## Grouped behavioral acceptance and required user actions\n\n";
    for feature in result["features"].as_array().into_iter().flatten() {
        s += &format!("### {}: {}\n\n", feature["feature"].as_str().unwrap_or(""), feature["status"].as_str().unwrap_or("manual"));
        let mut reasons = BTreeSet::new();
        for c in feature["checks"].as_array().into_iter().flatten().filter(|c|c["status"]!="passed") {
            s += &format!("- {}: {}\n",c["status"].as_str().unwrap_or("manual"),c["detail"].as_str().unwrap_or(""));
            if let Some(reason) = c["reason"].as_str() { reasons.insert(reason); }
        }
        for reason in reasons { s += &format!("\nWhy manual: {reason}\n"); }
        if let Some(steps) = feature["checks"].as_array().into_iter().flatten().find_map(|c| c["steps"].as_array()) {
            for (i, step) in steps.iter().enumerate() { s += &format!("\n{}. {}\n", i+1, step.as_str().unwrap_or("")); }
        }
    }
    if result["unknownChangesRequireReview"]==true { s += "\n## Unmapped changes\n\nReview the paths below as one source/dependency review. Trace changed exports, imports, call sites and consumers; add a rule and an executable check where possible, then revalidate. No source match means unknown, not harmless.\n"; }
    s += "\n## Every recorded change\n\n";
    for c in result["changes"].as_array().into_iter().flatten() { s += &format!("- {} `{}`; dependencies {}\n",c["status"].as_str().unwrap_or("manual"),c["path"].as_str().unwrap_or("").replace(['`','\n','\r'],"_"),c["dependencyIds"]); }
    s += "\nThe inventory baseline is not a compatibility certificate. Original report/snapshot bytes and earlier validation runs are retained.\n";
    s
}
pub(crate) async fn run(endpoint: Option<CdpEndpoint>, force: bool, cancel: Option<tokio_util::sync::CancellationToken>) -> io::Result<Value> {
    let dir = directory()?;
    if !dir.join("latest.json").is_file() { return Ok(json!({"status":"pending"})); }
    let lock = fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(dir.join("validation.lock"))?;
    if lock.try_lock().is_err() { return Ok(json!({"status":"busy"})); }
    let (id, report) = anchor(&dir)?;
    let identity = identity(&dir, &id)?;
    let report_dir = id_path(&dir, &id)?;
    let index_path = report_dir.join("validation-latest.json");
    if !force && index_path.is_file() && read_json(&index_path)?["identity"] == identity { return status(&dir); }
    if cancel.as_ref().is_some_and(|c|c.is_cancelled()) { return Ok(json!({"status":"cancelled"})); }
    let mut checks = vec![check("package.inventory",if report["complete"]==true{"passed"}else{"issue"},"inventory-integrity",if report["complete"]==true{"The recorded official inventory is complete. This is not functional validation."}else{"The inventory is incomplete; removed files and no-impact results cannot be certified."})];
    let manifest = tokio::task::spawn_blocking(crate::accounts::host::discover_modules).await;
    match manifest {
        Ok(Ok(manifest)) if manifest["version"]==report["version"] => {
            checks.push(check("package.modules","passed","actual-installed-package","Production ASAR/module discovery accepted the current official package and entrypoint inventory."));
            if let Some(endpoint) = endpoint {
                let expression = format!("(async()=>{{{};return await codeCodexHostUpdateProbe.probeHostUpdate({});}})()",include_str!("../../../../packages/explorer-ui/dist/host-update-probes.js"),manifest);
                match crate::accounts::host::evaluate(endpoint,&expression).await {
                    Ok(value) => {
                        for c in value["checks"].as_array().into_iter().flatten() { checks.push(c.clone()); }
                    }
                    Err(_) => checks.push(check("host.connection","manual","actual-host-read-only","The qualified official document could not be observed. No functional failure was inferred; recheck when its connection is available.")),
                }
            } else { checks.push(check("host.connection","manual","actual-host-read-only","No launch-owned official endpoint was supplied. Package checks ran; host checks require an attached native window.")); }
        }
        Ok(Ok(_)) => checks.push(check("package.modules","manual","actual-installed-package","The currently installed package differs from this report. Historical behavior cannot be validated using another version.")),
        _ => checks.push(check("package.modules","manual","actual-installed-package","The current official module inventory could not be read. This is unavailable evidence, not a proven compatibility defect.")),
    }
    if cancel.as_ref().is_some_and(|c|c.is_cancelled()) { return Ok(json!({"status":"cancelled"})); }
    let mut result = summarize(&report,&checks);
    result["schema"] = json!(1);
    result["identity"] = identity;
    result["version"] = report["version"].clone();
    result["inventoryRegistryHash"] = report["registryHash"].clone();
    result["observedMs"] = json!(now());
    result["status"] = json!(if report["type"]=="baseline"{"baseline"}else if result["counts"]["issues"].as_u64().unwrap_or(0)>0 || result["checkCounts"]["issues"].as_u64().unwrap_or(0)>0{"issues_found"}else if result["counts"]["manual"].as_u64().unwrap_or(0)>0 || result["checkCounts"]["manual"].as_u64().unwrap_or(0)>0{"manual_required"}else{"passed"});
    let runs = report_dir.join("validations");fs::create_dir_all(&runs)?;private_dir(&runs)?;
    let dest = tempfile::Builder::new().prefix(&format!("{}-",now())).tempdir_in(&runs)?.keep();
    let text = markdown(&result);
    for (name, bytes) in [("validation.json",encode(&result)?),("validation.md",text.as_bytes().to_vec())] {
        let mut file=fs::OpenOptions::new().write(true).create_new(true).open(dest.join(name))?;file.write_all(&bytes)?;file.sync_all()?;
    }
    let relative = format!("reports/{id}/validations/{}",dest.file_name().unwrap().to_string_lossy());
    let index=json!({"status":result["status"],"identity":result["identity"],"version":result["version"],"observedMs":result["observedMs"],"counts":result["counts"],"checkCounts":result["checkCounts"],"reportPath":format!("{relative}/validation.md")});
    atomic(&index_path,&index)?;
    atomic(&dir.join("validation-latest.json"),&index)?;
    let mut temp=tempfile::NamedTempFile::new_in(&dir)?;temp.write_all(format!("Latest validation: {relative}/validation.md\n\n{text}").as_bytes())?;temp.as_file().sync_all()?;temp.persist(dir.join("VALIDATION.md")).map_err(|e|e.error)?;
    crate::runtime_log::record("compatibility","host-update.validation",result["status"].as_str().unwrap_or("manual_required"),json!({"reportId":id,"counts":result["counts"],"checkCounts":result["checkCounts"],"registryHash":registry_hash(),"engineHash":engine_hash()}));
    Ok(index)
}

#[cfg(test)]
#[path="validation_tests.rs"]
mod tests;
