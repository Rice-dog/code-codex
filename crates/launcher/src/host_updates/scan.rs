use super::*;
const MAX_FILES: usize = 50_000;
const MAX_BYTES: u64 = 8 * 1024 * 1024 * 1024;
struct Scan<'a> {
    cancel: Option<tokio_util::sync::CancellationToken>,
    root: &'a Path,
    prefix: String,
    old: Option<&'a Snapshot>,
    reuse: bool,
    entries: BTreeMap<String, Entry>,
    issues: Vec<String>,
    bytes: u64,
    started: Instant,
    rules: Vec<Rule>,
}
impl Scan<'_> {
    fn budget(&self) -> io::Result<()> {
        if self.cancel.as_ref().is_some_and(|c| c.is_cancelled()) {
            return Err(io::Error::other("scan owner ended"));
        }
        if self.entries.len() >= MAX_FILES
            || self.bytes > MAX_BYTES
            || self.started.elapsed() > Duration::from_secs(300)
        {
            Err(io::Error::other("inventory budget reached"))
        } else {
            Ok(())
        }
    }
    fn classify(&self, name: &str, bytes: Option<&[u8]>) -> Vec<String> {
        let source = bytes.map(String::from_utf8_lossy);
        // ASAR is a container, not a dependency inherited by every nested asset.
        let name = name.rsplit("!/").next().unwrap_or(name);
        self.rules
            .iter()
            .filter(|r| {
                r.paths
                    .iter()
                    .any(|p| name.to_ascii_lowercase().contains(&p.to_ascii_lowercase()))
                    || source
                        .as_ref()
                        .is_some_and(|s| r.tokens.iter().any(|t| s.contains(t)))
            })
            .map(|r| r.id.clone())
            .collect()
    }
    fn read(
        &mut self,
        name: &str,
        file: &mut fs::File,
        size: u64,
        stamp: String,
    ) -> io::Result<()> {
        self.budget()?;
        let old = self.old.and_then(|p| p.entries.get(name));
        if self.reuse && old.is_some_and(|e| e.size == size && e.stamp == stamp) {
            self.entries.insert(name.into(), old.unwrap().clone());
            return Ok(());
        }
        if self.bytes.checked_add(size).is_none_or(|b| b > MAX_BYTES) {
            return Err(io::Error::other("inventory byte budget reached"));
        }
        self.bytes += size;
        let text = name.ends_with(".js")
            || name.ends_with(".css")
            || name.ends_with(".html")
            || name.ends_with(".json");
        let mut body = Vec::new();
        let mut digest = Sha256::new();
        let mut remaining = size;
        let mut buffer = [0u8; 64 * 1024];
        while remaining > 0 {
            self.budget()?;
            let n = file.read(&mut buffer[..remaining.min(65536) as usize])?;
            if n == 0 {
                return Err(io::Error::other("file truncated during scan"));
            }
            digest.update(&buffer[..n]);
            if text && size <= 48 * 1024 * 1024 {
                body.extend_from_slice(&buffer[..n]);
            }
            remaining -= n as u64;
        }
        let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        let resource = matches!(
            ext.as_str(),
            "png"
                | "jpg"
                | "jpeg"
                | "webp"
                | "gif"
                | "ico"
                | "woff"
                | "woff2"
                | "ttf"
                | "mp3"
                | "wav"
                | "mp4"
        );
        let deps = self.classify(name, Some(&body));
        self.entries.insert(
            name.into(),
            Entry {
                size,
                sha256: format!("{:x}", digest.finalize()),
                kind: if resource {
                    "resource"
                } else {
                    "code_or_unknown"
                }
                .into(),
                dependencies: deps,
                stamp,
            },
        );
        Ok(())
    }
    fn tree(&mut self, dir: &Path, depth: usize) -> io::Result<()> {
        self.budget()?;
        if depth > 64 {
            return Err(io::Error::other("directory depth bound"));
        }
        private_dir(dir)?;
        let mut rows = fs::read_dir(dir)?
            .take(MAX_FILES + 1)
            .collect::<io::Result<Vec<_>>>()?;
        rows.sort_by_key(|e| e.file_name());
        if rows.len() > MAX_FILES {
            return Err(io::Error::other("directory entry bound"));
        }
        for row in rows {
            self.budget()?;
            let path = row.path();
            let name = self.prefix.clone() + &path
                .strip_prefix(self.root)
                .map_err(io::Error::other)?
                .to_string_lossy()
                .replace('\\', "/");
            let meta = match regular(&path) {
                Ok(v) => v,
                Err(_) => {
                    self.issues
                        .push(format!("unreadable-or-redirected: {name}"));
                    continue;
                }
            };
            if meta.is_dir() {
                if let Err(e) = self.tree(&path, depth + 1) {
                    self.issues
                        .push(format!("directory-incomplete: {name}; {e}"));
                }
                continue;
            }
            if !meta.is_file() {
                self.issues.push(format!("non-regular-file: {name}"));
                continue;
            }
            let stamp = format!(
                "{}:{}",
                meta.len(),
                meta.modified()?
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            );
            let result: io::Result<()> = (|| {
                let mut file = fs::File::open(&path)?;
                self.read(&name, &mut file, meta.len(), stamp.clone())?;
                if name.ends_with("resources/app.asar") {
                    self.asar(&mut file, &name, &stamp, meta.len())?;
                }
                let after = fs::metadata(&path)?;
                if after.len() != meta.len() || after.modified()? != meta.modified()? {
                    return Err(io::Error::other("package changed while scanning"));
                }
                Ok(())
            })();
            if let Err(e) = result {
                self.issues.push(format!("file-incomplete: {name}; {e}"));
            }
        }
        Ok(())
    }
    fn runtime_catalog(&mut self) -> io::Result<()> {
        let path=self.root.join("AppxBlockMap.xml");
        let metadata=regular(&path)?;
        if metadata.len()>32*1024*1024 { return Err(io::Error::other("Runtime block map exceeds existing metadata bound")); }
        let xml=fs::read_to_string(&path)?;
        let files=runtime::catalog(&xml)?;
        if files.is_empty() { return Err(io::Error::other("Runtime block map contains no files")); }
        // PackageManager supplies a registered immutable MSIX root. FileHash is
        // the official per-file SHA-256, not a claim that local bytes were reread.
        for file in files {
            self.budget()?;
            if file.name.is_empty() || file.name.split('/').any(|c|c.is_empty()||c=="."||c==".."||c.contains(':')) || file.name.starts_with('/') {
                return Err(io::Error::other("Runtime block map has an invalid relative path"));
            }
            let name=format!("{}{}",self.prefix,file.name);
            if self.entries.contains_key(&name) { return Err(io::Error::other("Runtime block map has duplicate files")); }
            if let Some(sha256)=file.sha256 {
                let dependencies=self.classify(&name,None);
                self.entries.insert(name,Entry{size:file.size,sha256,kind:"code_or_unknown".into(),dependencies,stamp:"msix-declared-file-sha256-v1".into()});
            } else {
                // Older block maps may lack whole-file hashes. Read only those
                // files, retaining the same path checks, budgets and cancellation.
                let path=self.root.join(&file.name);let meta=regular(&path)?;
                if !meta.is_file() || meta.len()!=file.size { return Err(io::Error::other("Runtime catalog/file size mismatch")); }
                self.read(&name,&mut fs::File::open(path)?,file.size,"runtime-file-bytes-v1".into())?;
            }
        }
        // Keep the catalog and package identity metadata as actual byte evidence.
        for relative in ["AppxBlockMap.xml","AppxManifest.xml","runtime.json"] {
            let path=self.root.join(relative);let meta=regular(&path)?;
            self.read(&format!("{}{relative}",self.prefix),&mut fs::File::open(path)?,meta.len(),"runtime-metadata-bytes-v1".into())?;
        }
        Ok(())
    }
    fn asar(&mut self, file: &mut fs::File, name: &str, stamp: &str, len: u64) -> io::Result<()> {
        if self.reuse
            && self
                .old
                .and_then(|p| p.entries.get(name))
                .is_some_and(|e| e.stamp == stamp)
        {
            let prefix = format!("{name}!/");
            for (n, e) in self
                .old
                .unwrap()
                .entries
                .range(prefix.clone()..)
                .take_while(|(n, _)| n.starts_with(&prefix))
            {
                self.budget()?;
                self.entries.insert(n.clone(), e.clone());
            }
            return Ok(());
        }
        file.seek(SeekFrom::Start(0))?;
        let mut raw = [0; 16];
        file.read_exact(&mut raw)?;
        let header = u32::from_le_bytes(raw[4..8].try_into().unwrap()) as u64;
        let size = u32::from_le_bytes(raw[12..16].try_into().unwrap()) as usize;
        if size == 0
            || size > 32 * 1024 * 1024
            || header > 32 * 1024 * 1024 + 16
            || header < size as u64 + 8
            || 8 + header > len
        {
            return Err(io::Error::other("asar header bound"));
        }
        let mut bytes = vec![0; size];
        file.read_exact(&mut bytes)?;
        let tree: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        self.asar_tree(
            file,
            &tree["files"],
            &format!("{name}!"),
            8 + header,
            len,
            stamp,
            0,
        )
    }
    fn asar_tree(
        &mut self,
        file: &mut fs::File,
        tree: &Value,
        prefix: &str,
        base: u64,
        len: u64,
        stamp: &str,
        depth: usize,
    ) -> io::Result<()> {
        self.budget()?;
        if depth > 64 {
            return Err(io::Error::other("asar depth bound"));
        }
        let tree = tree
            .as_object()
            .ok_or_else(|| io::Error::other("asar files object"))?;
        for (name, e) in tree {
            self.budget()?;
            if name.is_empty()
                || name.len() > 512
                || name.contains(['\\', '/'])
                || name == ".."
                || name == "."
            {
                return Err(io::Error::other("asar entry path"));
            }
            let path = format!("{prefix}/{name}");
            if e.get("files").is_some() {
                self.asar_tree(file, &e["files"], &path, base, len, stamp, depth + 1)?;
                continue;
            }
            if e["unpacked"] == true || e["link"].is_string() {
                self.entries.insert(
                    path.clone(),
                    Entry {
                        size: e["size"].as_u64().unwrap_or(0),
                        sha256: hash(&encode(e)?),
                        kind: "asar_external_reference".into(),
                        dependencies: self.classify(&path, None),
                        stamp: stamp.into(),
                    },
                );
                continue;
            }
            let size = e["size"]
                .as_u64()
                .ok_or_else(|| io::Error::other("asar entry size"))?;
            let offset = e["offset"]
                .as_str()
                .and_then(|v| v.parse::<u64>().ok())
                .ok_or_else(|| io::Error::other("asar offset"))?;
            let start = base
                .checked_add(offset)
                .ok_or_else(|| io::Error::other("asar offset overflow"))?;
            if start.checked_add(size).is_none_or(|v| v > len) {
                return Err(io::Error::other("asar entry boundary"));
            }
            file.seek(SeekFrom::Start(start))?;
            self.read(&path, file, size, stamp.into())?;
        }
        Ok(())
    }
}
pub(super) fn inventory(
    install: &crate::discovery::CodexInstallation,
    old: Option<&Snapshot>,
    force: bool,
) -> io::Result<Snapshot> {
    inventory_owned(install, old, force, None)
}
pub(super) fn inventory_owned(
    install: &crate::discovery::CodexInstallation,
    old: Option<&Snapshot>,
    force: bool,
    cancel: Option<tokio_util::sync::CancellationToken>,
) -> io::Result<Snapshot> {
    inventory_components(install, &[], old, force, cancel)
}
pub(super) fn inventory_components(
    install: &crate::discovery::CodexInstallation,
    runtimes: &[runtime::RuntimePackage],
    old: Option<&Snapshot>,
    force: bool,
    cancel: Option<tokio_util::sync::CancellationToken>,
) -> io::Result<Snapshot> {
    let parent = install
        .executable
        .parent()
        .ok_or_else(|| io::Error::other("installation root"))?;
    let root = parent
        .parent()
        .filter(|p| p.join("AppxManifest.xml").is_file())
        .unwrap_or(parent);
    private_dir(root)?;
    let observed = now();
    let same = old.is_some_and(|s| {
        s.root == root.to_string_lossy()
            && s.version == install.version
            && s.package == install.package_full_name.clone().unwrap_or_default()
    });
    let reuse = same && old.is_some_and(|s| s.registry_hash == registry_hash()) && !force;
    let mut scan = Scan {
        cancel,
        root,
        prefix: String::new(),
        old: if same { old } else { None },
        reuse,
        entries: BTreeMap::new(),
        issues: Vec::new(),
        bytes: 0,
        started: Instant::now(),
        rules: rules(),
    };
    if reuse && old.is_some_and(|s|s.complete) {
        scan.entries.extend(old.unwrap().entries.iter().filter(|(name,_)|!name.starts_with("runtime/") && !name.starts_with("runtime-registration/")).map(|(n,e)|(n.clone(),e.clone())));
    } else if let Err(e) = scan.tree(root, 0) {
        scan.issues.push(format!("inventory-incomplete: {e}"));
    }
    if !scan
        .entries
        .keys()
        .any(|p| p.ends_with("resources/app.asar"))
    {
        scan.issues.push("official bundle was not observed".into())
    }
    for package in runtimes {
        let name = format!("runtime-registration/{}.json",package.package);
        let bytes = encode(package)?;
        scan.entries.insert(name.clone(), Entry { size: bytes.len() as u64, sha256: hash(&bytes), kind: "code_or_unknown".into(), dependencies: scan.classify("runtime-registration/metadata.json",Some(&bytes)), stamp: "registration".into() });
    }
    if let Some(package) = runtime::inventory_package(runtimes) {
        scan.prefix = format!("runtime/{}/",package.package);
        let reusable = !force && old.is_some_and(|s|s.complete && s.registry_hash==registry_hash() && runtime::inventory_package(&s.runtimes)==Some(package));
        if reusable {
            scan.entries.extend(old.unwrap().entries.iter().filter(|(n,_)|n.starts_with(&scan.prefix)).map(|(n,e)|(n.clone(),e.clone())));
        } else {
            scan.root = Path::new(&package.root);
            scan.reuse = false;
            if let Err(e) = scan.runtime_catalog() { scan.issues.push(format!("runtime-inventory-incomplete: {}; {e}",package.package)); }
        }
    }
    Ok(Snapshot {
        registry_hash: registry_hash(),
        runtimes: runtimes.to_vec(),
        schema: 2,
        version: install.version.clone(),
        package: install.package_full_name.clone().unwrap_or_default(),
        root: root.to_string_lossy().into(),
        observed_ms: observed,
        full_hash_ms: if reuse {
            old.unwrap().full_hash_ms
        } else {
            observed
        },
        complete: scan.issues.is_empty(),
        entries: scan.entries,
        issues: scan.issues,
    })
}
