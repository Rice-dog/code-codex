//! Local, read-only official-package change ledger. Classification is not a functional test.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[path = "host_updates/scan.rs"]
mod scan;
#[path = "host_updates/scheduler.rs"]
pub(crate) mod scheduler;
#[path = "host_updates/version_gate.rs"]
mod version_gate;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct Entry {
    size: u64,
    sha256: String,
    kind: String,
    dependencies: Vec<String>,
    stamp: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(super) struct Snapshot {
    #[serde(default)]
    registry_hash: String,
    schema: u32,
    version: String,
    package: String,
    root: String,
    observed_ms: u64,
    full_hash_ms: u64,
    complete: bool,
    entries: BTreeMap<String, Entry>,
    issues: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Rule {
    id: String,
    feature: String,
    sources: Vec<String>,
    tests: Vec<String>,
    tokens: Vec<String>,
    paths: Vec<String>,
}
fn rules() -> Vec<Rule> {
    serde_json::from_str::<Value>(include_str!(
        "../../../resources/host-update-dependencies.json"
    ))
    .expect("embedded dependency registry")["rules"]
        .as_array()
        .expect("registry rules")
        .iter()
        .map(|v| serde_json::from_value(v.clone()).expect("registry rule"))
        .collect()
}
fn registry_hash() -> String {
    hash(
        &[
            include_bytes!("../../../resources/host-update-dependencies.json").as_slice(),
            b"path-scope-v2",
        ]
        .concat(),
    )
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn encode(v: &impl Serialize) -> io::Result<Vec<u8>> {
    serde_json::to_vec_pretty(v).map_err(io::Error::other)
}
pub(crate) fn status() -> io::Result<Value> {
    let dir = directory()?;
    let latest = dir.join("latest.json");
    Ok(
        json!({"latest":if latest.exists(){read_json(&latest)?}else{Value::Null},"scan":if dir.join("status.json").exists(){read_json(&dir.join("status.json"))?}else{json!({"status":"pending"})}}),
    )
}
pub(crate) fn directory() -> io::Result<PathBuf> {
    let p = workspace_service::application_paths::data_root()?.join("host-updates");
    workspace_service::application_paths::validate_directory_path(&p)?;
    fs::create_dir_all(&p)?;
    private_dir(&p)?;
    Ok(p)
}
fn regular(path: &Path) -> io::Result<fs::Metadata> {
    let m = path.symlink_metadata()?;
    if m.file_type().is_symlink() {
        return Err(io::Error::other("redirected path"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("reparse point"));
        }
    }
    Ok(m)
}
fn private_dir(path: &Path) -> io::Result<()> {
    workspace_service::application_paths::validate_directory_path(path)?;
    if !regular(path)?.is_dir() {
        return Err(io::Error::other("not a directory"));
    }
    Ok(())
}
fn read_json(path: &Path) -> io::Result<Value> {
    if !regular(path)?.is_file() || fs::metadata(path)?.len() > 64 * 1024 * 1024 {
        return Err(io::Error::other("ledger file bound"));
    }
    serde_json::from_slice(&fs::read(path)?).map_err(io::Error::other)
}
fn atomic(path: &Path, value: &impl Serialize) -> io::Result<()> {
    crate::renderer_storage::atomic(
        path,
        &serde_json::to_value(value).map_err(io::Error::other)?,
    )
}

fn changes(previous: Option<&Snapshot>, current: &Snapshot) -> Vec<Value> {
    let empty = BTreeMap::new();
    let old = previous.map(|p| &p.entries).unwrap_or(&empty);
    let names: BTreeSet<_> = old.keys().chain(current.entries.keys()).collect();
    names.into_iter().filter_map(|name|{let a=old.get(name);let b=current.entries.get(name);if a.zip(b).is_some_and(|(a,b)|a.sha256==b.sha256&&a.kind==b.kind){return None}
 let dependencies:BTreeSet<_>=a.into_iter().chain(b).flat_map(|e|e.dependencies.iter().cloned()).collect();
 let category=if !dependencies.is_empty(){"plugin_dependency"}else if b.or(a).is_some_and(|e|e.kind=="resource"){"no_known_plugin_dependency"}else{"needs_review"};
 Some(json!({"path":name,"change":if a.is_none(){"added"}else if b.is_none(){if current.complete{"removed"}else{"not_observed"}}else{"modified"},"category":category,"dependencyIds":dependencies,"before":a,"after":b,"functionalImpact":"not_tested"}))}).collect()
}
fn report(previous: Option<&Snapshot>, current: &Snapshot) -> Value {
    let changes = changes(previous, current);
    let registry = rules();
    let affected: BTreeSet<String> = changes
        .iter()
        .flat_map(|v| {
            v["dependencyIds"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    let dependencies:Vec<_>=registry.iter().filter(|r|affected.contains(&r.id)).map(|r|json!({"id":r.id,"feature":r.feature,"sourceFiles":r.sources,"suggestedTests":r.tests,"functionalImpact":"not_tested"})).collect();
    json!({"schema":1,"dependencyRevision":1,"type":if previous.is_none(){"baseline"}else if changes.is_empty()&&previous.is_some_and(|p|p.version==current.version&&p.package==current.package){"analysis_refresh"}else{"update"},"observedMs":current.observed_ms,"previousVersion":previous.map(|s|&s.version),"version":current.version,"package":current.package,"complete":current.complete,"counts":{"all":changes.len(),"pluginDependency":changes.iter().filter(|v|v["category"]=="plugin_dependency").count(),"noKnownPluginDependency":changes.iter().filter(|v|v["category"]=="no_known_plugin_dependency").count(),"needsReview":changes.iter().filter(|v|v["category"]=="needs_review").count()},"dependencies":dependencies,"issues":current.issues,"changes":changes,"validation":{"status":"not_tested","reason":"Static dependency candidates only. Actual behavior must be tested separately; no inference, OAuth or account mutation was performed."},"coverage":"Observed installed package files and packed ASAR entries. Unobserved intermediate versions and server-side changes cannot be reconstructed. Resource classification means no registered dependency identified, not proof of no behavioral effect."})
}
fn markdown(v: &Value) -> String {
    let mut s = format!(
        "# Official Codex update report\n\nVersion: {} -> {}\n\nType: {}. Complete inventory: {}. Functional impact: NOT TESTED.\n\n## Summary\n\n{} changes; {} involve plugin dependencies; {} have no known plugin dependency; {} need review.\n\n{}\n\n## Affected plugin dependencies\n\n",
        v["previousVersion"],
        v["version"],
        v["type"],
        v["complete"],
        v["counts"]["all"],
        v["counts"]["pluginDependency"],
        v["counts"]["noKnownPluginDependency"],
        v["counts"]["needsReview"],
        v["coverage"].as_str().unwrap_or("")
    );
    for r in v["dependencies"].as_array().into_iter().flatten() {
        s += &format!(
            "- {}\n  - Source: {}\n  - Suggested checks: {}\n",
            r["feature"], r["sourceFiles"], r["suggestedTests"]
        )
    }
    s += "\n## Inventory issues\n\n";
    for issue in v["issues"].as_array().into_iter().flatten() {
        s += &format!("- {issue}\n")
    }
    for (category, title) in [
        ("plugin_dependency", "Priority: plugin dependencies"),
        ("needs_review", "Unmapped changes: review required"),
        (
            "no_known_plugin_dependency",
            "Other recorded resource changes",
        ),
    ] {
        s += &format!("\n## {title}\n\n");
        for c in v["changes"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|c| c["category"] == category)
        {
            let name = c["path"]
                .as_str()
                .unwrap_or("")
                .replace(['\n', '\r', '`'], "_");
            s += &format!(
                "- {} `{}`; dependencies {}; functional impact NOT TESTED\n",
                c["change"].as_str().unwrap_or("unknown"),
                name,
                c["dependencyIds"]
            );
        }
    }
    s += "\nFull hashes, sizes and before/after metadata are in report.json beside this file. All reports are retained; no automatic code repair is performed.\n";
    s
}
fn commit(dir: &Path, current: &Snapshot, previous: Option<&Snapshot>) -> io::Result<Value> {
    commit_report(dir, current, previous, true)
}
fn commit_report(
    dir: &Path,
    current: &Snapshot,
    previous: Option<&Snapshot>,
    promote: bool,
) -> io::Result<Value> {
    let r = report(previous, current);
    let identity = json!({"version":current.version,"package":current.package,"complete":current.complete,"issues":current.issues,"registry":hash(include_bytes!("../../../resources/host-update-dependencies.json")),"files":current.entries.iter().map(|(name,e)|json!([name,e.size,e.sha256,e.kind,e.dependencies])).collect::<Vec<_>>()});
    let signature = hash(&encode(&identity)?);
    let latest_path = dir.join("latest.json");
    let changed = if latest_path.exists() {
        read_json(&latest_path)?["signature"] != signature
    } else {
        true
    };
    if changed {
        let reports = dir.join("reports");
        workspace_service::application_paths::validate_directory_path(&reports)?;
        fs::create_dir_all(&reports)?;
        private_dir(&reports)?;
        let dest = tempfile::Builder::new()
            .prefix(&format!("{}-", current.observed_ms))
            .tempdir_in(&reports)?
            .keep();
        let id = dest.file_name().unwrap().to_string_lossy().into_owned();
        for (name, bytes) in [
            ("snapshot.json", encode(current)?),
            ("report.json", encode(&r)?),
            ("report.md", markdown(&r).into_bytes()),
        ] {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dest.join(name))?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }
        let latest_text = dir.join("LATEST.md");
        if latest_text.exists() {
            regular(&latest_text)?;
        }
        let mut temp = tempfile::NamedTempFile::new_in(dir)?;
        temp.write_all(format!("Report: reports/{id}/report.md\n\n{}", markdown(&r)).as_bytes())?;
        temp.as_file().sync_all()?;
        temp.persist(latest_text).map_err(|e| e.error)?;
        // Commit a report before changing either pointer; a failed write never erases the old baseline.
        atomic(
            &dir.join("latest.json"),
            &json!({"schema":1,"signature":signature,"id":id,"version":current.version,"complete":current.complete,"counts":r["counts"],"type":r["type"],"observedMs":current.observed_ms,"functionalImpact":"not_tested"}),
        )?;
        crate::runtime_log::record(
            "compatibility",
            "host-update.detected",
            "recorded",
            json!({"version":current.version,"type":r["type"],"counts":r["counts"],"complete":current.complete,"functionalImpact":"not_tested","reportId":id}),
        );
    }
    // Incomplete scans are reported, but never become the removal/comparison baseline.
    if current.complete && promote {
        atomic(&dir.join("baseline.json"), current)?;
    }
    Ok(
        json!({"changed":changed,"version":current.version,"complete":current.complete,"counts":r["counts"],"reportDirectory":dir}),
    )
}
pub(crate) fn retry() -> Value {
    static PENDING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if PENDING.swap(true, std::sync::atomic::Ordering::AcqRel) {
        return json!({"scheduled":false,"status":"busy"});
    }
    tokio::task::spawn_blocking(|| {
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                PENDING.store(false, std::sync::atomic::Ordering::Release)
            }
        }
        let _reset = Reset;
        let _ = observed_run(true, None);
    });
    json!({"scheduled":true})
}
pub(crate) fn run(force: bool) -> io::Result<Value> {
    observed_run(force, None)
}
fn observed_run(
    force: bool,
    cancel: Option<tokio_util::sync::CancellationToken>,
) -> io::Result<Value> {
    let result = run_owned(force, cancel);
    if result.is_err() {
        if let Ok(dir) = directory() {
            let _ = atomic(
                &dir.join("status.json"),
                &json!({"status":"failed","observedMs":now(),"code":"HOST_UPDATE_SCAN","message":"The update observation failed. Previous reports and the last complete baseline were retained; no no-impact conclusion was made."}),
            );
        }
    }
    result
}
fn run_owned(
    force: bool,
    cancel: Option<tokio_util::sync::CancellationToken>,
) -> io::Result<Value> {
    let dir = directory()?;
    let lock_path = dir.join("scan.lock");
    if lock_path.exists() {
        regular(&lock_path)?;
    }
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)?;
    if lock.try_lock().is_err() {
        return Ok(
            json!({"status":"busy","message":"HOST_UPDATE_BUSY: Another read-only scan owns the ledger."}),
        );
    }
    let previous = if dir.join("baseline.json").exists() {
        Some(
            serde_json::from_value::<Snapshot>(read_json(&dir.join("baseline.json"))?)
                .map_err(io::Error::other)?,
        )
    } else {
        None
    };
    let install = match crate::discovery::discover_codex(
        None,
        None,
        crate::discovery::ChannelPreference::Stable,
    ) {
        Ok(v) => v,
        Err(_) => {
            let value = json!({"status":"unavailable","observedMs":now(),"code":"HOST_UPDATE_DISCOVERY","message":"The trusted official package could not be discovered. Previous reports were retained; no no-impact conclusion was made."});
            atomic(&dir.join("status.json"), &value)?;
            return Ok(value);
        }
    };
    if install.source != crate::discovery::DiscoverySource::WindowsPackageManager {
        return Err(io::Error::other(
            "HOST_UPDATE_SOURCE: Only the verified official package may be inventoried.",
        ));
    }
    version_gate::check(
        &dir,
        previous.as_ref(),
        &install.version,
        force,
        cancel.as_ref(),
        || scan::inventory_owned(&install, previous.as_ref(), true, cancel.clone()),
    )
}
/// Existing core lifetime owns one startup observation; there is no timer. No renderer or account/plugin instance owns it.
pub(crate) struct Monitor(tokio_util::sync::CancellationToken);
impl Drop for Monitor {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
pub(crate) fn start(parent: tokio_util::sync::CancellationToken) -> Monitor {
    let cancel = parent.child_token();
    let guard = Monitor(cancel.clone());
    tokio::spawn(async move {
        if cancel.is_cancelled() {
            return;
        }
        let owner = cancel.clone();
        let result = tokio::task::spawn_blocking(move || observed_run(false, Some(owner))).await;
        if !matches!(result, Ok(Ok(_))) {
            crate::runtime_log::record(
                "compatibility",
                "host-update.scan",
                "failed",
                json!({"code":"HOST_UPDATE_SCAN","previousReportsPreserved":true}),
            );
        }
    });
    guard
}

#[cfg(test)]
#[path = "host_updates/tests.rs"]
mod tests;
