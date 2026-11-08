use super::*;
fn gate(
    dir: &Path,
    previous: Option<&Snapshot>,
    target: &str,
    force: bool,
    next: Snapshot,
) -> io::Result<Value> {
    version_gate::check(dir, previous, target, force, None, || Ok(next))
}
#[test]
fn equal_version_startup_never_scans_or_rewrites_baseline_even_after_a_day() {
    let dir = tempfile::tempdir().unwrap();
    let mut a = snapshot();
    a.full_hash_ms = 0;
    commit(dir.path(), &a, None).unwrap();
    let before = fs::read(dir.path().join("baseline.json")).unwrap();
    let result = version_gate::check(dir.path(), Some(&a), "old", false, None, || {
        panic!("same version must never traverse files")
    })
    .unwrap();
    assert_eq!(result["status"], "version_unchanged");
    assert_eq!(result["scanned"], false);
    assert_eq!(fs::read(dir.path().join("baseline.json")).unwrap(), before);
    assert!(!dir.path().join("attempts.json").exists());
}
#[test]
fn successful_new_version_saves_report_then_automatically_promotes_baseline() {
    let dir = tempfile::tempdir().unwrap();
    let a = snapshot();
    commit(dir.path(), &a, None).unwrap();
    let mut b = a.clone();
    b.version = "3".into();
    b.entries
        .insert("new.js".into(), entry("x", "code_or_unknown", &[]));
    let result = gate(dir.path(), Some(&a), "3", false, b.clone()).unwrap();
    assert_eq!(result["baselinePromoted"], true);
    assert_eq!(
        read_json(&dir.path().join("baseline.json")).unwrap()["version"],
        "3"
    );
    let again = version_gate::check(dir.path(), Some(&b), "3", false, None, || {
        panic!("same target must skip")
    })
    .unwrap();
    assert_eq!(again["scanned"], false);
    let attempts = read_json(&dir.path().join("attempts.json")).unwrap();
    assert_eq!(
        attempts.as_object().unwrap().values().next().unwrap()["state"],
        "complete"
    );
}
#[test]
fn completed_relation_is_reused_even_when_baseline_still_points_to_older_version() {
    let dir = tempfile::tempdir().unwrap();
    let a = snapshot();
    commit(dir.path(), &a, None).unwrap();
    let mut b = a.clone();
    b.version = "3".into();
    gate(dir.path(), Some(&a), "3", false, b).unwrap();
    atomic(&dir.path().join("baseline.json"), &a).unwrap();
    let result = version_gate::check(dir.path(), Some(&a), "3", false, None, || {
        panic!("completed relation must not be scanned again")
    })
    .unwrap();
    assert_eq!(result["status"], "already_checked");
    assert_eq!(
        read_json(&dir.path().join("baseline.json")).unwrap()["version"],
        "3"
    );
}
#[test]
fn failed_relation_retains_old_baseline_and_manual_retry_can_complete_it() {
    let dir = tempfile::tempdir().unwrap();
    let a = snapshot();
    commit(dir.path(), &a, None).unwrap();
    assert!(
        version_gate::check(dir.path(), Some(&a), "3", false, None, || Err(
            io::Error::other("fixture")
        ))
        .is_err()
    );
    assert_eq!(
        read_json(&dir.path().join("baseline.json")).unwrap()["version"],
        "old"
    );
    let skipped = version_gate::check(dir.path(), Some(&a), "3", false, None, || {
        panic!("failure must not auto repeat")
    })
    .unwrap();
    assert_eq!(skipped["status"], "retry_required");
    let mut b = a.clone();
    b.version = "3".into();
    assert_eq!(
        gate(dir.path(), Some(&a), "3", true, b).unwrap()["baselinePromoted"],
        true
    );
}
#[test]
fn persisted_running_partial_and_cancelled_attempts_never_automatically_repeat() {
    for mode in ["running", "partial", "cancelled"] {
        let dir = tempfile::tempdir().unwrap();
        let a = snapshot();
        commit(dir.path(), &a, None).unwrap();
        let mut b = a.clone();
        b.version = "3".into();
        if mode == "partial" {
            b.complete = false;
            b.issues.push("partial".into());
            gate(dir.path(), Some(&a), "3", false, b).unwrap();
        } else if mode == "cancelled" {
            let token = tokio_util::sync::CancellationToken::new();
            token.cancel();
            version_gate::check(dir.path(), Some(&a), "3", false, Some(&token), || Ok(b)).unwrap();
        } else {
            let r = std::panic::catch_unwind(|| {
                version_gate::check(dir.path(), Some(&a), "3", false, None, || {
                    panic!("simulated crash")
                })
            });
            assert!(r.is_err());
        }
        assert_eq!(
            read_json(&dir.path().join("baseline.json")).unwrap()["version"],
            "old"
        );
        assert_eq!(
            version_gate::check(dir.path(), Some(&a), "3", false, None, || panic!(
                "must not run"
            ))
            .unwrap()["status"],
            "retry_required"
        );
    }
}
#[test]
fn corrupted_completed_report_is_not_used_to_upgrade_baseline() {
    let dir = tempfile::tempdir().unwrap();
    let a = snapshot();
    commit(dir.path(), &a, None).unwrap();
    let mut b = a.clone();
    b.version = "3".into();
    gate(dir.path(), Some(&a), "3", false, b).unwrap();
    let id = read_json(&dir.path().join("latest.json")).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    fs::write(
        dir.path().join("reports").join(id).join("snapshot.json"),
        "{}",
    )
    .unwrap();
    atomic(&dir.path().join("baseline.json"), &a).unwrap();
    let result = version_gate::check(dir.path(), Some(&a), "3", false, None, || {
        panic!("corruption requires explicit retry")
    })
    .unwrap();
    assert_eq!(result["status"], "retry_required");
    assert_eq!(
        read_json(&dir.path().join("baseline.json")).unwrap()["version"],
        "old"
    );
}
#[test]
fn report_storage_failure_and_version_race_do_not_promote_baseline() {
    for mode in ["write_failure", "version_race"] {
        let dir = tempfile::tempdir().unwrap();
        let a = snapshot();
        commit(dir.path(), &a, None).unwrap();
        let mut b = a.clone();
        b.version = if mode == "version_race" { "4" } else { "3" }.into();
        b.entries
            .insert("new.js".into(), entry("x", "code_or_unknown", &[]));
        if mode == "write_failure" {
            let reports = dir.path().join("reports");
            fs::rename(&reports, dir.path().join("reports-retained")).unwrap();
            fs::write(reports, b"blocks directory").unwrap();
        }
        assert!(gate(dir.path(), Some(&a), "3", false, b).is_err());
        assert_eq!(
            read_json(&dir.path().join("baseline.json")).unwrap()["version"],
            "old"
        );
    }
}
#[test]
fn empty_first_baseline_force_same_version_and_rollback_each_have_explicit_semantics() {
    let dir = tempfile::tempdir().unwrap();
    let a = snapshot();
    let first = gate(dir.path(), None, "old", false, a.clone()).unwrap();
    assert_eq!(first["baselinePromoted"], true);
    let mut b = a.clone();
    b.entries.insert(
        "same-version.js".into(),
        entry("new", "code_or_unknown", &[]),
    );
    assert_eq!(
        gate(dir.path(), Some(&a), "old", true, b.clone()).unwrap()["scanned"],
        true
    );
    let mut c = b.clone();
    c.version = "older".into();
    assert_eq!(
        gate(dir.path(), Some(&b), "older", false, c).unwrap()["baselinePromoted"],
        true
    );
}
fn entry(body: &str, kind: &str, deps: &[&str]) -> Entry {
    Entry {
        size: body.len() as u64,
        sha256: hash(body.as_bytes()),
        kind: kind.into(),
        dependencies: deps.iter().map(|s| s.to_string()).collect(),
        stamp: "1".into(),
    }
}
fn snapshot() -> Snapshot {
    Snapshot {
        registry_hash: "fixture".into(),
        schema: 1,
        version: "old".into(),
        package: "official".into(),
        root: "fixture".into(),
        observed_ms: 1,
        full_hash_ms: 1,
        complete: true,
        entries: BTreeMap::new(),
        issues: vec![],
    }
}
#[test]
#[ignore = "Explicit startup-only version observation on installed official package; no file traversal or inference."]
fn actual_installed_startup_version_gate_skips_same_version_without_touching_baseline() {
    let dir = directory().unwrap();
    let baseline = fs::read(dir.join("baseline.json")).unwrap();
    let reports = fs::read_dir(dir.join("reports")).unwrap().count();
    let before = fs::metadata(dir.join("baseline.json"))
        .unwrap()
        .modified()
        .unwrap();
    let start = Instant::now();
    let result = run(false).unwrap();
    assert_eq!(result["status"], "version_unchanged");
    assert_eq!(result["scanned"], false);
    assert_eq!(fs::read(dir.join("baseline.json")).unwrap(), baseline);
    assert_eq!(
        fs::metadata(dir.join("baseline.json"))
            .unwrap()
            .modified()
            .unwrap(),
        before
    );
    assert_eq!(fs::read_dir(dir.join("reports")).unwrap().count(), reports);
    println!(
        "STARTUP_VERSION_GATE_REAL {}",
        json!({"durationMs":start.elapsed().as_millis(),"result":result,"baselineBytesAndMtimeUnchanged":true,"reportCountUnchanged":true,"inferenceRequests":0,"accountMutations":0})
    );
}
#[test]
fn update_records_all_three_categories_and_before_after() {
    let old = snapshot();
    let mut next = old.clone();
    next.entries.insert(
        "app.js".into(),
        entry("appServerManagers", "code_or_unknown", &["accounts"]),
    );
    next.entries
        .insert("unknown.node".into(), entry("a", "code_or_unknown", &[]));
    next.entries
        .insert("logo.png".into(), entry("b", "resource", &[]));
    let r = report(Some(&old), &next);
    assert_eq!(
        r["counts"],
        json!({"all":3,"pluginDependency":1,"noKnownPluginDependency":1,"needsReview":1})
    );
    assert_eq!(r["validation"]["status"], "not_tested");
    assert_eq!(r["dependencies"][0]["id"], "accounts");
}
#[test]
fn removals_keep_old_dependencies_and_never_call_partial_missing_a_removal() {
    let mut old = snapshot();
    old.entries
        .insert("gone.js".into(), entry("x", "code_or_unknown", &["models"]));
    let mut next = snapshot();
    assert_eq!(changes(Some(&old), &next)[0]["change"], "removed");
    assert_eq!(
        changes(Some(&old), &next)[0]["dependencyIds"],
        json!(["models"])
    );
    next.complete = false;
    assert_eq!(changes(Some(&old), &next)[0]["change"], "not_observed");
}
#[test]
fn same_version_byte_changes_and_version_only_changes_are_recorded_without_duplicate_reports() {
    let d = tempfile::tempdir().unwrap();
    let mut a = snapshot();
    a.entries
        .insert("a.js".into(), entry("one", "code_or_unknown", &[]));
    assert_eq!(commit(d.path(), &a, None).unwrap()["changed"], true);
    assert_eq!(commit(d.path(), &a, Some(&a)).unwrap()["changed"], false);
    let mut b = a.clone();
    b.entries
        .insert("a.js".into(), entry("two", "code_or_unknown", &[]));
    assert_eq!(commit(d.path(), &b, Some(&a)).unwrap()["changed"], true);
    let mut c = b.clone();
    c.version = "new".into();
    assert_eq!(commit(d.path(), &c, Some(&b)).unwrap()["changed"], true);
    assert_eq!(fs::read_dir(d.path().join("reports")).unwrap().count(), 3);
}
#[test]
fn partial_scan_keeps_last_complete_baseline_and_report_is_durable() {
    let d = tempfile::tempdir().unwrap();
    let a = snapshot();
    commit(d.path(), &a, None).unwrap();
    let bytes = fs::read(d.path().join("baseline.json")).unwrap();
    let mut b = a.clone();
    b.complete = false;
    b.issues.push("fixture incomplete".into());
    commit(d.path(), &b, Some(&a)).unwrap();
    assert_eq!(fs::read(d.path().join("baseline.json")).unwrap(), bytes);
    assert_eq!(
        read_json(&d.path().join("latest.json")).unwrap()["complete"],
        false
    );
}
#[test]
fn dependency_registry_has_valid_source_and_test_paths_and_every_rule_is_reachable() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let registry = rules();
    assert!(registry.len() >= 8);
    let mut ids = BTreeSet::new();
    for r in registry {
        assert!(ids.insert(r.id));
        assert!(!r.tokens.is_empty() || !r.paths.is_empty());
        for file in r.sources.iter().chain(&r.tests) {
            assert!(root.join(file).is_file(), "{file}")
        }
    }
}
fn asar(path: &Path, files: Value, body: &[u8]) {
    let h = serde_json::to_vec(&json!({"files":files})).unwrap();
    let header = h.len() + 8;
    let mut out = Vec::new();
    out.extend(4u32.to_le_bytes());
    out.extend((header as u32).to_le_bytes());
    out.extend(((h.len() + 4) as u32).to_le_bytes());
    out.extend((h.len() as u32).to_le_bytes());
    out.extend(h);
    out.extend(body);
    fs::write(path, out).unwrap();
}
fn installation(root: &Path) -> crate::discovery::CodexInstallation {
    crate::discovery::CodexInstallation {
        executable: root.join("ChatGPT.exe"),
        version: "unknown-new".into(),
        channel: "stable".into(),
        source: crate::discovery::DiscoverySource::WindowsPackageManager,
        package_name: Some("OpenAI.Codex".into()),
        package_full_name: Some("fixture-package".into()),
        app_user_model_id: None,
        app_server: None,
    }
}
#[test]
fn complete_inventory_hashes_packed_unpacked_and_unknown_resources_without_source_logging() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("resources")).unwrap();
    fs::write(d.path().join("ChatGPT.exe"), b"fixture").unwrap();
    let body = b"appServerManagers";
    asar(
        &d.path().join("resources/app.asar"),
        json!({"old-or-new.js":{"offset":"0","size":body.len()},"native.node":{"unpacked":true,"size":1},"alias":{"link":"old-or-new.js"}}),
        body,
    );
    fs::write(d.path().join("logo.png"), b"x").unwrap();
    let s = scan::inventory(&installation(d.path()), None, true).unwrap();
    assert!(s.complete, "{:?}", s.issues);
    let e = &s.entries["resources/app.asar!/old-or-new.js"];
    assert_eq!(e.sha256, hash(body));
    assert!(e.dependencies.contains(&"accounts".into()));
    assert!(s.entries.contains_key("resources/app.asar!/native.node"));
    assert!(
        !String::from_utf8(encode(&s).unwrap())
            .unwrap()
            .contains("appServerManagers")
    );
}
#[test]
fn malformed_asar_is_incomplete_and_never_counts_as_no_impact() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("resources")).unwrap();
    asar(
        &d.path().join("resources/app.asar"),
        json!({"escape":{"offset":"999999","size":1}}),
        b"x",
    );
    let s = scan::inventory(&installation(d.path()), None, true).unwrap();
    assert!(!s.complete);
    assert!(!s.issues.is_empty());
}
#[test]
fn daily_force_hash_detects_preserved_metadata_while_normal_scan_reuses_hashes() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("resources")).unwrap();
    asar(&d.path().join("resources/app.asar"), json!({}), b"");
    let file = d.path().join("unknown.js");
    fs::write(&file, "one").unwrap();
    let install = installation(d.path());
    let old = scan::inventory(&install, None, true).unwrap();
    let modified = fs::metadata(&file).unwrap().modified().unwrap();
    fs::write(&file, "two").unwrap();
    fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(modified))
        .unwrap();
    let cached = scan::inventory(&install, Some(&old), false).unwrap();
    assert_eq!(
        cached.entries["unknown.js"].sha256,
        old.entries["unknown.js"].sha256
    );
    let full = scan::inventory(&install, Some(&old), true).unwrap();
    assert_ne!(
        full.entries["unknown.js"].sha256,
        old.entries["unknown.js"].sha256
    );
}
#[test]
fn scanner_rejects_asar_path_traversal_and_links_are_only_recorded() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("resources")).unwrap();
    asar(
        &d.path().join("resources/app.asar"),
        json!({"../outside":{"offset":"0","size":1}}),
        b"x",
    );
    let s = scan::inventory(&installation(d.path()), None, true).unwrap();
    assert!(!s.complete);
    assert_eq!(s.entries.len(), 1);
}
#[test]
fn report_uses_safe_literal_paths_and_keeps_testing_separate() {
    let mut a = snapshot();
    a.entries
        .insert("bad`name\n.js".into(), entry("x", "code_or_unknown", &[]));
    let text = markdown(&report(None, &a));
    assert!(text.contains("NOT TESTED"));
    assert!(!text.contains("bad`name\n"));
}
#[test]
fn repeated_identical_partial_inventory_is_deduplicated_without_losing_failures() {
    let d = tempfile::tempdir().unwrap();
    let mut a = snapshot();
    a.complete = false;
    a.issues.push("fixture unreadable".into());
    assert_eq!(commit(d.path(), &a, None).unwrap()["changed"], true);
    a.observed_ms += 100;
    assert_eq!(commit(d.path(), &a, None).unwrap()["changed"], false);
    assert!(!d.path().join("baseline.json").exists());
    assert_eq!(fs::read_dir(d.path().join("reports")).unwrap().count(), 1);
}
#[test]
fn owner_ledger_lock_prevents_two_writers() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("scan.lock");
    let a = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&p)
        .unwrap();
    a.try_lock().unwrap();
    let b = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&p)
        .unwrap();
    assert!(b.try_lock().is_err());
    drop(a);
    assert!(b.try_lock().is_ok());
}
#[cfg(windows)]
#[test]
fn redirected_filesystem_tree_is_not_followed_or_classified_as_unaffected() {
    let d = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("private-token.json"), "must-not-read").unwrap();
    fs::create_dir(d.path().join("resources")).unwrap();
    asar(&d.path().join("resources/app.asar"), json!({}), b"");
    junction::create(outside.path(), d.path().join("redirected")).unwrap();
    let s = scan::inventory(&installation(d.path()), None, true).unwrap();
    assert!(!s.complete);
    assert!(!s.entries.keys().any(|p| p.contains("private-token")));
    junction::delete(d.path().join("redirected")).unwrap();
}
#[test]
fn reinstall_rollback_is_a_new_report_not_an_overwritten_old_version() {
    let d = tempfile::tempdir().unwrap();
    let a = snapshot();
    let mut b = a.clone();
    b.version = "newer".into();
    commit(d.path(), &a, None).unwrap();
    commit(d.path(), &b, Some(&a)).unwrap();
    commit(d.path(), &a, Some(&b)).unwrap();
    assert_eq!(fs::read_dir(d.path().join("reports")).unwrap().count(), 3);
    assert!(d.path().join("LATEST.md").is_file());
}
#[test]
fn malformed_baseline_metadata_is_rejected_instead_of_read_as_an_empty_inventory() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("baseline.json"), "{broken}").unwrap();
    assert!(read_json(&d.path().join("baseline.json")).is_err());
}
#[test]
#[ignore = "Explicit local official package inventory; no model, account or credential operations."]
fn actual_installed_official_inventory() {
    let start = Instant::now();
    let first = run(true).unwrap();
    println!(
        "HOST_UPDATE_REAL_SCAN {}",
        json!({"durationMs":start.elapsed().as_millis(),"result":first})
    );
    assert_eq!(first["complete"], true);
    let start = Instant::now();
    let second = run(false).unwrap();
    println!(
        "HOST_UPDATE_CACHED_SCAN {}",
        json!({"durationMs":start.elapsed().as_millis(),"result":second})
    );
    assert_eq!(second["status"], "version_unchanged");
    assert_eq!(second["scanned"], false);
}

#[test]
fn cancelled_scan_owner_yields_partial_evidence_without_reading_more_files() {
    let d = tempfile::tempdir().unwrap();
    let token = tokio_util::sync::CancellationToken::new();
    token.cancel();
    let s = scan::inventory_owned(&installation(d.path()), None, true, Some(token)).unwrap();
    assert!(!s.complete);
    assert!(s.entries.is_empty());
}

#[test]
fn archive_container_does_not_mark_every_nested_resource_as_bridge_code() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("resources")).unwrap();
    asar(
        &d.path().join("resources/app.asar"),
        json!({"logo.png":{"offset":"0","size":1},"unknown.js":{"offset":"1","size":1}}),
        b"ab",
    );
    let s = scan::inventory(&installation(d.path()), None, true).unwrap();
    assert!(
        s.entries["resources/app.asar"]
            .dependencies
            .contains(&"transport".into())
    );
    assert!(
        s.entries["resources/app.asar!/logo.png"]
            .dependencies
            .is_empty()
    );
    assert!(
        s.entries["resources/app.asar!/unknown.js"]
            .dependencies
            .is_empty()
    );
}

#[test]
fn supervisor_monitor_guard_cancels_only_its_child_on_every_exit_path() {
    let parent = tokio_util::sync::CancellationToken::new();
    let child = parent.child_token();
    let guard = Monitor(child.clone());
    drop(guard);
    assert!(child.is_cancelled());
    assert!(!parent.is_cancelled());
}
