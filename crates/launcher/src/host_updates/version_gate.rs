//! Durable startup transition admission. File scans are injected for meaningful negative tests.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
struct Attempt {
    from: String,
    to: String,
    state: String,
    at: u64,
    report: Option<String>,
    snapshot_hash: Option<String>,
}
type Journal = BTreeMap<String, Attempt>;
fn key(from: &str, to: &str) -> String {
    hash(&encode(&[from, to]).expect("version strings serialize"))
}
fn load_journal(dir: &Path) -> io::Result<Journal> {
    let file = dir.join("attempts.json");
    if file.exists() {
        serde_json::from_value(read_json(&file)?).map_err(io::Error::other)
    } else {
        Ok(Journal::new())
    }
}
fn write_status(dir: &Path, status: &str, from: &str, to: &str) -> io::Result<()> {
    atomic(
        &dir.join("status.json"),
        &json!({"status":status,"observedMs":now(),"fromVersion":from,"version":to,"trigger":"startup_version","manualRetryRequired":status=="retry_required","functionalImpact":"not_tested"}),
    )
}
fn saved_snapshot(dir: &Path, a: &Attempt) -> io::Result<Snapshot> {
    let id = a
        .report
        .as_deref()
        .filter(|id| {
            !id.is_empty()
                && id.len() < 160
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
        })
        .ok_or_else(|| io::Error::other("invalid completed report reference"))?;
    let reports = dir.join("reports");
    private_dir(&reports)?;
    let folder = reports.join(id);
    private_dir(&folder)?;
    let path = folder.join("snapshot.json");
    let value = read_json(&path)?;
    let bytes = fs::read(&path)?;
    if a.snapshot_hash.as_deref() != Some(hash(&bytes).as_str()) {
        return Err(io::Error::other("completed snapshot fingerprint mismatch"));
    }
    let report = read_json(&folder.join("report.json"))?;
    let snapshot: Snapshot = serde_json::from_value(value).map_err(io::Error::other)?;
    if !snapshot.complete
        || snapshot.version != a.to
        || report["complete"] != true
        || report["version"] != a.to
    {
        return Err(io::Error::other("completed report contract mismatch"));
    }
    Ok(snapshot)
}
pub(super) fn check(
    dir: &Path,
    previous: Option<&Snapshot>,
    to: &str,
    force: bool,
    cancel: Option<&tokio_util::sync::CancellationToken>,
    scan: impl FnOnce() -> io::Result<Snapshot>,
) -> io::Result<Value> {
    let from = previous.map(|p| p.version.as_str()).unwrap_or("");
    // Same-version startup never traverses files, even when registry rules or metadata changed.
    if !force && previous.is_some_and(|p| p.complete && p.version == to) {
        write_status(dir, "version_unchanged", from, to)?;
        return Ok(
            json!({"status":"version_unchanged","version":to,"scanned":false,"baselinePromoted":false}),
        );
    }
    let mut journal = load_journal(dir)?;
    let relation = key(from, to);
    if !force {
        if let Some(a) = journal.get(&relation) {
            if a.from != from || a.to != to {
                return Err(io::Error::other("version transition key mismatch"));
            }
            if a.state == "complete" {
                match saved_snapshot(dir, a) {
                    Ok(snapshot) => {
                        atomic(&dir.join("baseline.json"), &snapshot)?;
                        write_status(dir, "already_checked", from, to)?;
                        return Ok(
                            json!({"status":"already_checked","version":to,"scanned":false,"baselinePromoted":true}),
                        );
                    }
                    Err(_) => {
                        write_status(dir, "retry_required", from, to)?;
                        return Ok(
                            json!({"status":"retry_required","version":to,"scanned":false,"reason":"HOST_UPDATE_REPORT_UNVERIFIED: The recorded completed snapshot could not be verified."}),
                        );
                    }
                }
            }
            write_status(dir, "retry_required", from, to)?;
            return Ok(
                json!({"status":"retry_required","version":to,"scanned":false,"reason":"HOST_UPDATE_INCOMPLETE: The prior attempt did not complete. Explicit retry is required."}),
            );
        }
    }
    let mut attempt = Attempt {
        from: from.into(),
        to: to.into(),
        state: "running".into(),
        at: now(),
        report: None,
        snapshot_hash: None,
    };
    journal.insert(relation.clone(), attempt.clone());
    atomic(&dir.join("attempts.json"), &journal)?;
    write_status(dir, "scanning", from, to)?;
    let result = (|| {
        let current = scan()?;
        if current.version != to {
            return Err(io::Error::other("official version changed during scan"));
        }
        if cancel.is_some_and(|c| c.is_cancelled()) {
            return Ok((
                json!({"status":"cancelled","version":to,"scanned":true,"baselinePromoted":false}),
                None,
                "cancelled",
            ));
        }
        let mut value = commit_report(dir, &current, previous, false)?;
        let latest = read_json(&dir.join("latest.json"))?;
        if !current.complete {
            return Ok((
                json!({"status":"partial","version":to,"scanned":true,"baselinePromoted":false,"counts":value["counts"]}),
                None,
                "partial",
            ));
        }
        attempt.report = latest["id"].as_str().map(str::to_owned);
        let folder = dir.join("reports").join(
            attempt
                .report
                .as_deref()
                .ok_or_else(|| io::Error::other("report id missing"))?,
        );
        let snapshot_file = folder.join("snapshot.json");
        regular(&snapshot_file)?;
        attempt.snapshot_hash = Some(hash(&fs::read(snapshot_file)?));
        let verified = saved_snapshot(dir, &attempt)?;
        // Report/snapshot durability precedes baseline promotion and completion marking.
        atomic(&dir.join("baseline.json"), &verified)?;
        value["status"] = json!("complete");
        value["scanned"] = json!(true);
        value["baselinePromoted"] = json!(true);
        Ok((value, Some(verified), "complete"))
    })();
    match result {
        Ok((value, _, state)) => {
            attempt.state = state.into();
            journal.insert(relation, attempt);
            atomic(&dir.join("attempts.json"), &journal)?;
            write_status(dir, state, from, to)?;
            Ok(value)
        }
        Err(error) => {
            attempt.state = "failed".into();
            journal.insert(relation, attempt);
            atomic(&dir.join("attempts.json"), &journal)?;
            write_status(dir, "failed", from, to)?;
            Err(error)
        }
    }
}
