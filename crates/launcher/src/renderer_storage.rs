//! Bounded native persistence for Code-Codex preferences and user media only.
//! Renderer paths are never accepted; scope, record and upload names are confined.
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
const CHUNK: usize = 64 * 1024;
const MAX_FILE: u64 = 128 * 1024 * 1024;
fn err(text: &str) -> io::Error {
    io::Error::other(text)
}
fn directory(path: &Path) -> io::Result<()> {
    workspace_service::application_paths::validate_directory_path(path)?;
    fs::create_dir_all(path)
}
pub(crate) fn regular(path: &Path) -> io::Result<fs::Metadata> {
    let m = fs::symlink_metadata(path)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err(err("Linked resource refused"));
        }
    }
    if !m.is_file() || m.file_type().is_symlink() {
        return Err(err("Resource must be a regular file"));
    }
    Ok(m)
}
pub(crate) fn atomic(path: &Path, value: &Value) -> io::Result<()> {
    if path.exists() {
        regular(path)?;
    }
    let mut candidate =
        tempfile::NamedTempFile::new_in(path.parent().ok_or_else(|| err("No resource parent"))?)?;
    candidate.write_all(value.to_string().as_bytes())?;
    candidate.as_file().sync_all()?;
    candidate.persist(path).map_err(|e| e.error)?;
    Ok(())
}
pub(crate) fn read_json(path: &Path, limit: u64) -> io::Result<Value> {
    if regular(path)?.len() > limit {
        return Err(err("Resource metadata exceeds its limit"));
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
fn text<'a>(p: &'a Value, key: &str) -> io::Result<&'a str> {
    p[key]
        .as_str()
        .ok_or_else(|| err("Required resource field missing"))
}
pub(crate) fn scope_path(root: &Path, scope: &str) -> io::Result<PathBuf> {
    if !matches!(scope, "startup" | "particle-image" | "pixel-sculpt" | "custom-background") {
        return Err(err("Unknown media scope"));
    }
    Ok(root.join("media").join(scope))
}
fn token(value: &str) -> io::Result<&str> {
    if value.len() != 32 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(err("Invalid resource upload token"));
    }
    Ok(value)
}
fn record_name(id: &str) -> io::Result<String> {
    if id.is_empty() || id.len() > 256 {
        return Err(err("Invalid media identifier"));
    }
    Ok(format!("{:x}", Sha256::digest(id.as_bytes())))
}
fn field(value: &str) -> io::Result<&str> {
    if matches!(value, "blob" | "file" | "thumbnail") {
        Ok(value)
    } else {
        Err(err("Unknown blob field"))
    }
}

fn capacity(scope: &Path) -> io::Result<()> {
    let mut stack = vec![scope.to_path_buf()];
    let mut files = 0;
    let mut bytes = 0u64;
    while let Some(dir) = stack.pop() {
        workspace_service::application_paths::validate_directory_path(&dir)?;
        if !dir.exists() {
            continue;
        }
        for e in fs::read_dir(dir)? {
            let e = e?;
            let meta = fs::symlink_metadata(e.path())?;
            if meta.is_dir() {
                stack.push(e.path());
            } else {
                bytes = bytes.saturating_add(regular(&e.path())?.len());
                files += 1;
            }
            if bytes > 1024 * 1024 * 1024 || files > 2048 {
                return Err(err(
                    "Media scope capacity reached; remove unused media before importing more",
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn settings_snapshot() -> io::Result<Value> {
    let path = workspace_service::application_paths::data_root()?.join("renderer-settings.json");
    read_preferences(&path)
}
fn read_preferences(path: &Path) -> io::Result<Value> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(json!({})),
        Err(e) => return Err(e),
        Ok(_) => {}
    }
    let value = read_json(&path, 80 * 1024)?;
    validate_preferences(&value)?;
    Ok(value)
}

fn validate_preferences(value: &Value) -> io::Result<()> {
    let values = value
        .as_object()
        .ok_or_else(|| err("Invalid preferences"))?;
    if values.len() > 128
        || value.to_string().len() > 80 * 1024
        || values.iter().any(|(k, v)| {
            !k.starts_with("code-codex:")
                || k.contains("lease")
                || k.len() > 128
                || !v.is_string()
                || v.as_str().is_some_and(|s| s.len() > 64 * 1024)
        })
    {
        return Err(err(
            "Preferences exceeded the Code-Codex allowlist or size limit",
        ));
    }
    Ok(())
}

/// Metadata-only support evidence. Does not create directories or read blob contents.
pub(crate) fn diagnostic_status() -> Value {
    match workspace_service::application_paths::data_root() {
        Ok(root) => diagnostic_at(&root),
        Err(e) => {
            json!({"status":"unavailable","readOnly":true,"reason":e.to_string(),"ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error()})
        }
    }
}
fn diagnostic_at(root: &Path) -> Value {
    fn failure(e: io::Error) -> Value {
        json!({"status":"failed","reason":e.to_string(),"ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error()})
    }
    if let Err(e) = workspace_service::application_paths::validate_directory_path(root) {
        return failure(e);
    }
    let prefs = root.join("renderer-settings.json");
    let preferences = match fs::symlink_metadata(&prefs) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            json!({"status":"missing","interpretation":"No native preferences have been committed."})
        }
        Err(e) => failure(e),
        Ok(_) => match read_json(&prefs, 80 * 1024).and_then(|v| {
            validate_preferences(&v)?;
            Ok(v)
        }) {
            Ok(v) => {
                json!({"status":"valid","entryCount":v.as_object().map_or(0,|m|m.len()),"valuesOmitted":true})
            }
            Err(e) => failure(e),
        },
    };
    let started = std::time::Instant::now();
    let mut scopes = Vec::new();
    for scope in [
        "startup",
        "particle-image",
        "pixel-sculpt",
        "custom-background",
    ] {
        let path = scope_path(root, scope).unwrap_or_else(|_| root.join("invalid"));
        let entries = match workspace_service::application_paths::validate_directory_path(&path)
            .and_then(|_| fs::read_dir(&path))
        {
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                scopes.push(json!({"scope":scope,"status":"missing","recordsChecked":0}));
                continue;
            }
            Err(e) => {
                scopes.push(json!({"scope":scope,"observation":failure(e)}));
                continue;
            }
            Ok(v) => v,
        };
        let mut checked = 0usize;
        let mut invalid = 0usize;
        let mut failed_entries = 0usize;
        let mut unreferenced = 0usize;
        let mut scanned = 0usize;
        let mut errors = Vec::new();
        let mut limited = false;
        let mut active = std::collections::HashSet::new();
        let mut jobs = Vec::new();
        for entry in entries {
            if scanned >= 512 || checked >= 64 || started.elapsed().as_millis() >= 1500 {
                limited = true;
                break;
            }
            scanned += 1;
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    failed_entries += 1;
                    if errors.len() < 8 {
                        errors.push(failure(e));
                    }
                    continue;
                }
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if token(&name).is_ok() {
                jobs.push(name);
                continue;
            }
            if name.len() != 69
                || !name.ends_with(".json")
                || !name.as_bytes()[..64].iter().all(|b| b.is_ascii_hexdigit())
            {
                continue;
            }
            checked += 1;
            let result = (|| -> io::Result<()> {
                let doc = read_json(&entry.path(), 64 * 1024)?;
                if record_name(text(&doc, "id")?)? != name[..64] {
                    return Err(err("Media index identifier does not match its filename"));
                }
                let job = token(text(&doc, "job")?)?;
                active.insert(job.to_owned());
                if !doc["record"].is_object() {
                    return Err(err("Media record metadata is invalid"));
                }
                let blobs = doc["blobs"]
                    .as_object()
                    .filter(|b| !b.is_empty() && b.len() <= 3)
                    .ok_or_else(|| err("Invalid blob descriptors"))?;
                let upload = path.join(job);
                workspace_service::application_paths::validate_directory_path(&upload)?;
                for (key, b) in blobs {
                    let blob = upload.join(field(key)?);
                    let size = regular(&blob)?.len();
                    if size > MAX_FILE || b["size"].as_u64() != Some(size) {
                        return Err(err("Media blob length differs from its manifest"));
                    }
                    if !b["sha256"]
                        .as_str()
                        .is_some_and(|s| s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()))
                    {
                        return Err(err("Invalid media hash descriptor"));
                    }
                }
                Ok(())
            })();
            if let Err(e) = result {
                invalid += 1;
                if errors.len() < 8 {
                    errors.push(failure(e));
                }
            }
        }
        if !limited {
            unreferenced = jobs.iter().filter(|j| !active.contains(*j)).count();
        }
        scopes.push(json!({"scope":scope,"status":if invalid+failed_entries>0{"failed"}else if limited{"partial"}else{"observed"},"recordsChecked":checked,"invalidRecords":invalid,"entryFailures":failed_entries,"entriesScanned":scanned,"unreferencedUploadCandidates":if limited{Value::Null}else{json!(unreferenced)},"limitReached":limited,"errors":errors,"contentHash":"not read; checked during commit and restore"}));
    }
    json!({"status":"completed","readOnly":true,"preferences":preferences,"scopes":scopes,"limits":{"entriesPerScope":512,"recordsPerScope":64,"budgetMs":1500,"errorsPerScope":8},"durationMs":started.elapsed().as_millis(),"writesAttempted":false,"interpretation":"Metadata evidence only; completed does not mean healthy or prove full content integrity."})
}

pub(crate) fn request(params: Value) -> io::Result<Value> {
    let root = workspace_service::application_paths::data_root()?;
    handle(&root, params)
}
pub(crate) fn request_context(params: &Value) -> Value {
    let action = params["action"]
        .as_str()
        .filter(|s| {
            matches!(
                *s,
                "cache.status"
                    | "cache.publish"
                    | "cache.prepare"
                    | "settings.read"
                    | "settings.write"
                    | "media.list"
                    | "media.read"
                    | "media.write"
                    | "media.commit"
                    | "media.delete"
            )
        })
        .unwrap_or("unknown");
    let scope = params["scope"].as_str().filter(|s| {
        matches!(
            *s,
            "startup" | "particle-image" | "pixel-sculpt" | "custom-background"
        )
    });
    json!({"action":action,"scope":scope,"offset":params["offset"].as_u64(),"encodedChunkBytes":params["data"].as_str().map(str::len),"contentOmitted":true})
}
pub(crate) fn handle(root: &Path, p: Value) -> io::Result<Value> {
    workspace_service::application_paths::validate_directory_path(root)?;
    let action = text(&p, "action")?;
    if action == "settings.read" {
        let path = root.join("renderer-settings.json");
        return read_preferences(&path);
    }
    if action == "settings.write" {
        validate_preferences(&p["values"])?;
        directory(root)?;
        atomic(&root.join("renderer-settings.json"), &p["values"])?;
        return Ok(json!({"saved":true}));
    }
    let scope = scope_path(root, text(&p, "scope")?)?;
    workspace_service::application_paths::validate_directory_path(&scope)?;
    if action == "media.list" {
        if !scope.exists() {
            return Ok(json!([]));
        }
        workspace_service::application_paths::validate_directory_path(&scope)?;
        let mut records = vec![];
        for entry in fs::read_dir(&scope)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.ends_with(".json")
                && name.len() == 69
                && name.as_bytes()[..64].iter().all(|b| b.is_ascii_hexdigit())
            {
                records.push(read_json(&entry.path(), 64 * 1024)?);
                if records.len() > 64
                {
                    return Err(err("Media record limit exceeded"));
                }
            }
        }
        return Ok(json!(records));
    }
    let id = text(&p, "id")?;
    let name = record_name(id)?;
    let manifest = scope.join(format!("{name}.json"));
    if action == "media.delete" {
        if manifest.exists() {
            let doc = read_json(&manifest, 64 * 1024)?;
            let job = token(text(&doc, "job")?)?.to_owned();
            fs::remove_file(&manifest)?;
            let upload = scope.join(job);
            workspace_service::application_paths::validate_directory_path(&upload)?;
            for field in ["blob", "file", "thumbnail"] {
                let path = upload.join(field);
                if path.exists() {
                    regular(&path)?;
                    fs::remove_file(path)?;
                }
            }
            if upload.exists() {
                fs::remove_dir(upload)?;
            }
        }
        return Ok(json!({"removed":true}));
    }
    if action == "media.read" {
        let doc = read_json(&manifest, 64 * 1024)?;
        let job = token(text(&doc, "job")?)?;
        let field = field(text(&p, "field")?)?;
        let offset = p["offset"].as_u64().ok_or_else(|| err("Missing offset"))?;
        let path = scope.join(job).join(field);
        workspace_service::application_paths::validate_directory_path(
            path.parent().ok_or_else(|| err("Missing parent"))?,
        )?;
        let size = regular(&path)?.len();
        if size > MAX_FILE || offset > size {
            return Err(err("Invalid media read range"));
        }
        let mut file = fs::File::open(path)?;
        file.seek(SeekFrom::Start(offset))?;
        let mut bytes = vec![];
        file.take(CHUNK as u64).read_to_end(&mut bytes)?;
        return Ok(
            json!({"data":BASE64.encode(&bytes),"size":size,"offset":offset,"complete":offset+bytes.len() as u64==size}),
        );
    }
    let job = token(text(&p, "job")?)?;
    let upload = scope.join(job);
    if action == "media.write" {
        let field = field(text(&p, "field")?)?;
        let offset = p["offset"].as_u64().ok_or_else(|| err("Missing offset"))?;
        let encoded = text(&p, "data")?;
        if encoded.len() > CHUNK * 4 / 3 + 4 {
            return Err(err("Media chunk too large"));
        }
        let bytes = BASE64
            .decode(encoded)
            .map_err(|_| err("Invalid media encoding"))?;
        if bytes.len() > CHUNK
            || offset
                .checked_add(bytes.len() as u64)
                .is_none_or(|end| end > MAX_FILE)
        {
            return Err(err("Media upload exceeds limit"));
        }
        if offset == 0 {
            capacity(&scope)?;
        }
        directory(&upload)?;
        let path = upload.join(field);
        if path.exists() {
            regular(&path)?;
        }
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .read(true)
            .open(&path)?;
        if file.metadata()?.len() != offset {
            return Err(err("Media upload offset mismatch; no data was overwritten"));
        }
        file.write_all(&bytes)?;
        file.sync_data()?;
        return Ok(json!({"received":offset+bytes.len() as u64}));
    }
    if action == "media.commit" {
        workspace_service::application_paths::validate_directory_path(&upload)?;
        if !p["record"].is_object() || p["record"].to_string().len() > 16 * 1024 {
            return Err(err("Media metadata too large"));
        }
        let blobs = p["blobs"]
            .as_object()
            .ok_or_else(|| err("Missing blob descriptors"))?;
        if blobs.is_empty() || blobs.len() > 3 {
            return Err(err("Invalid blob count"));
        }
        for (key, blob) in blobs {
            let path = upload.join(field(key)?);
            let size = regular(&path)?.len();
            if size > MAX_FILE || blob["size"].as_u64() != Some(size) {
                return Err(err("Media length verification failed"));
            }
            let mut file = fs::File::open(&path)?;
            let mut digest = Sha256::new();
            let mut buffer = [0u8; 65536];
            loop {
                let n = file.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                digest.update(&buffer[..n]);
            }
            if blob["sha256"].as_str() != Some(format!("{:x}", digest.finalize()).as_str()) {
                return Err(err("Media integrity verification failed"));
            }
        }
        directory(&scope)?;
        capacity(&scope)?;
        let doc = json!({"id":id,"job":job,"record":p["record"],"blobs":p["blobs"]});
        atomic(&manifest, &doc)?;
        // Bound storage by removing only superseded, unreferenced upload directories in this scope.
        prune_uploads(&scope)?;
        return Ok(json!({"saved":true,"verified":true}));
    }
    Err(err("Unknown storage operation"))
}
fn prune_uploads(scope: &Path) -> io::Result<()> {
    let mut active = std::collections::HashSet::new();
    for e in fs::read_dir(scope)? {
        let e = e?;
        if e.path().extension().is_some_and(|s| s == "json") {
            if let Ok(doc) = read_json(&e.path(), 64 * 1024) {
                if let Some(job) = doc["job"].as_str() {
                    active.insert(job.to_owned());
                }
            }
        }
    }
    for e in fs::read_dir(scope)? {
        let e = e?;
        let name = e.file_name().to_string_lossy().into_owned();
        if token(&name).is_err() || active.contains(&name) {
            continue;
        }
        let m = fs::symlink_metadata(e.path())?;
        // A concurrent upload has a one-hour lease. Never follow a linked directory.
        if m.modified()?.elapsed().unwrap_or_default().as_secs() < 3600 {
            continue;
        }
        workspace_service::application_paths::validate_directory_path(&e.path())?;
        for field in ["blob", "file", "thumbnail"] {
            let path = e.path().join(field);
            if path.exists() {
                regular(&path)?;
                fs::remove_file(path)?;
            }
        }
        let _ = fs::remove_dir(e.path());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_reads_reject_non_owned_preferences_and_checks_do_not_write() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("absent");
        let status = diagnostic_at(&root);
        assert_eq!(status["preferences"]["status"], "missing");
        assert!(!root.exists());
        fs::create_dir(&root).unwrap();
        fs::write(
            root.join("renderer-settings.json"),
            r#"{"official-secret":"private"}"#,
        )
        .unwrap();
        assert!(handle(&root, json!({"action":"settings.read"})).is_err());
        assert_eq!(diagnostic_at(&root)["preferences"]["status"], "failed");
        let context = request_context(
            &json!({"action":"media.write","scope":"startup","offset":64,"data":"secret blob","values":{"private":"secret"}}),
        );
        assert_eq!(context["encodedChunkBytes"], 11);
        assert!(!context.to_string().contains("secret"));
    }
    #[test]
    fn metadata_check_reports_missing_blobs_and_unicode_names_do_not_panic() {
        let root = tempfile::tempdir().unwrap();
        let scope = root.path().join("media/startup");
        fs::create_dir_all(&scope).unwrap();
        let id = "fixture";
        let name = record_name(id).unwrap();
        fs::write(scope.join(format!("{name}.json")),json!({"id":id,"job":"0123456789abcdef0123456789abcdef","record":{},"blobs":{"blob":{"size":1,"sha256":"a".repeat(64)}}}).to_string()).unwrap();
        fs::write(scope.join(format!("{}a.json", "中".repeat(21))), "{}").unwrap();
        let check = diagnostic_at(root.path());
        assert_eq!(check["scopes"][0]["invalidRecords"], 1);
        assert_eq!(check["scopes"][0]["status"], "failed");
        assert_eq!(
            handle(
                root.path(),
                json!({"action":"media.list","scope":"startup"})
            )
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
            1
        );
        assert!(handle(root.path(),json!({"action":"media.write","scope":"startup","id":"overflow","job":"0123456789abcdef0123456789abcdef","field":"blob","offset":u64::MAX,"data":"YQ=="})).is_err());
    }
    #[test]
    fn settings_confined_and_roundtrip() {
        let root = tempfile::tempdir().expect("root");
        assert!(
            handle(
                root.path(),
                json!({"action":"settings.write","values":{"official-secret":"no"}})
            )
            .is_err()
        );
        handle(
            root.path(),
            json!({"action":"settings.write","values":{"code-codex:test":"yes"}}),
        )
        .expect("save");
        assert_eq!(
            handle(root.path(), json!({"action":"settings.read"})).expect("read")["code-codex:test"],
            "yes"
        );
        assert!(
            handle(
                root.path(),
                json!({"action":"media.list","scope":"../escape"})
            )
            .is_err()
        );
    }
    #[test]
    fn media_verified_commit_ranges_and_tombstone() {
        let root = tempfile::tempdir().expect("root");
        let job = "0123456789abcdef0123456789abcdef";
        let common = json!({"scope":"startup","id":"selected","job":job});
        let mut p = common.clone();
        p["action"] = json!("media.write");
        p["field"] = json!("blob");
        p["offset"] = json!(0);
        p["data"] = json!(BASE64.encode(b"video"));
        handle(root.path(), p.clone()).expect("write");
        assert!(handle(root.path(), p).is_err());
        let mut p = common.clone();
        p["action"] = json!("media.commit");
        p["record"] = json!({"id":"selected"});
        p["blobs"] = json!({"blob":{"size":5,"sha256":format!("{:x}",Sha256::digest(b"video"))}});
        handle(root.path(), p).expect("commit");
        let v=handle(root.path(),json!({"action":"media.read","scope":"startup","id":"selected","field":"blob","offset":0})).expect("read");
        assert_eq!(v["data"], BASE64.encode(b"video"));
        handle(
            root.path(),
            json!({"action":"media.delete","scope":"startup","id":"selected"}),
        )
        .expect("delete");
        assert_eq!(
            handle(
                root.path(),
                json!({"action":"media.list","scope":"startup"})
            )
            .expect("list"),
            json!([])
        );
    }
}

#[cfg(test)]
#[test]
fn retired_startup_movie_scope_cannot_read_write_or_publish() {
    let root=tempfile::tempdir().unwrap();
    for action in ["media.list","media.write","cache.status","cache.publish"] {
        assert!(handle(root.path(),json!({"action":action,"scope":"startup-render","id":"a","job":"b"})).is_err(),"{action}");
    }
    assert!(!root.path().join("cache/startup-video").exists());
}
