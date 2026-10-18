//! Bounded read-only support checks. No resets, cache deletion or security-policy changes.
use serde_json::{Value, json};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::io::AsyncReadExt;
static SYSTEM: Mutex<Option<Value>> = Mutex::new(None);
static CHECK_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub(crate) fn environment() -> Value {
    json!({"version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"pointerBits":usize::BITS,"localDataConfigured":std::env::var_os("LOCALAPPDATA").is_some(),"network":crate::network_diagnostics::environment(),"limits":{"runs":10,"runBytes":5*1024*1024,"systemQueryMs":6000,"queryCaptureBytes":32768},"unobservable":["official internal initialization","original connection DNS/TCP/TLS phase timings","full crash dump","security software private policy","kernel packet trace"],"readOnly":true})
}

pub(crate) fn report() -> String {
    let value=SYSTEM.lock().ok().and_then(|v|v.clone()).unwrap_or(json!({"status":"not collected","reason":"No failure-triggered system check has completed."}));
    format!(
        "\nIndependent system evidence (not proof of causation):\n{}\n",
        crate::runtime_log::redaction::value(value)
    )
}

async fn capture(mut reader: impl tokio::io::AsyncRead + Unpin) -> Value {
    let mut buffer = [0u8; 4096];
    let mut kept = Vec::new();
    let mut total = 0usize;
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(n) => {
                total += n;
                kept.extend_from_slice(&buffer[..n.min(32768usize.saturating_sub(kept.len()))]);
            }
            Err(e) => {
                return json!({"bytes":total,"truncated":total>kept.len(),"readError":{"kind":format!("{:?}",e.kind()),"osCode":e.raw_os_error()}});
            }
        }
    }
    json!({"bytes":total,"truncated":total>kept.len(),"captured":String::from_utf8_lossy(&kept)})
}

#[cfg(windows)]
async fn system_query() -> Value {
    let Some(shell) = crate::process_guard::trusted_powershell() else {
        return json!({"status":"unavailable","reason":"trusted PowerShell missing"});
    };
    let mut command = tokio::process::Command::new(shell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            include_str!("support-checks.ps1"),
        ])
        .creation_flags(0x08000000)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            return json!({"status":"unavailable","phase":"spawn","osCode":e.raw_os_error(),"kind":format!("{:?}",e.kind())});
        }
    };
    let out = tokio::spawn(capture(child.stdout.take().expect("stdout pipe")));
    let err = tokio::spawn(capture(child.stderr.take().expect("stderr pipe")));
    let started = Instant::now();
    let status = match tokio::time::timeout(Duration::from_secs(6), child.wait()).await {
        Ok(Ok(status)) => json!({"exitCode":status.code(),"success":status.success()}),
        Ok(Err(e)) => {
            let _ = child.kill().await;
            json!({"waitError":{"kind":format!("{:?}",e.kind()),"osCode":e.raw_os_error()}})
        }
        Err(_) => {
            let cleanup = child.kill().await;
            json!({"timeout":true,"limitMs":6000,"killSucceeded":cleanup.is_ok(),"killOsCode":cleanup.err().and_then(|e|e.raw_os_error())})
        }
    };
    async fn joined(mut task: tokio::task::JoinHandle<Value>) -> Value {
        match tokio::time::timeout(Duration::from_millis(500), &mut task).await {
            Ok(Ok(value)) => value,
            Ok(Err(_)) => json!({"capture":"join failed"}),
            Err(_) => {
                task.abort();
                json!({"capture":"incomplete after deadline"})
            }
        }
    }
    let (mut stdout, mut stderr) = tokio::join!(joined(out), joined(err));
    let raw = stdout.get("captured").and_then(Value::as_str).unwrap_or("");
    let parsed = raw
        .lines()
        .rev()
        .find(|line| !line.starts_with("CC_SUPPORT_STEP:"))
        .and_then(|s| serde_json::from_str::<Value>(s).ok());
    let steps: Vec<Value> = raw
        .lines()
        .filter_map(|line| line.strip_prefix("CC_SUPPORT_STEP:"))
        .filter_map(|line| serde_json::from_str(line).ok())
        .take(32)
        .collect();
    if let Some(fields) = stdout.as_object_mut() {
        fields.remove("captured");
    }
    if let Some(fields) = stderr.as_object_mut() {
        if let Some(Value::String(raw)) = fields.remove("captured") {
            fields.insert(
                "reason".into(),
                json!(crate::runtime_log::redaction::text(&raw)),
            );
        }
    }
    json!({"status":if status["success"]==true && parsed.is_some(){"observed"}else{"unavailable"},"durationMs":started.elapsed().as_millis(),"process":status,"stdout":stdout,"stderr":stderr,"checks":parsed,"steps":steps,"interpretation":"Independent recent system evidence; absence of a matching event does not prove no crash or security interception."})
}
#[cfg(not(windows))]
async fn system_query() -> Value {
    json!({"status":"unsupported","reason":"Windows event and Defender checks are unavailable on this OS."})
}

pub(crate) async fn run() -> Value {
    run_with_progress(|_, _, _| {}).await
}

pub(crate) async fn run_with_progress(mut progress: impl FnMut(&str, &str, &Value)) -> Value {
    let Ok(_guard) = CHECK_LOCK.try_lock() else {
        return json!({"status":"busy","reason":"A read-only support check is already in progress."});
    };
    let mut op = crate::runtime_log::Operation::start(
        "diagnostics",
        "support checks",
        json!({"readOnly":true,"networkRequested":false,"cacheDeleted":false,"settingsReset":false}),
    );
    let environment = environment();
    progress("environment", "observed", &environment);
    op.event("environment", "observed", environment.clone());
    progress(
        "components, settings and plugin assets",
        "started",
        &json!({}),
    );
    let local = tokio::task::spawn_blocking(local_checks)
        .await
        .unwrap_or_else(|_| json!({"status":"unavailable","reason":"local check worker failed"}));
    op.event("local state", "observed", local.clone());
    progress("components, settings and plugin assets", "observed", &local);
    progress("system evidence", "started", &json!({"timeoutMs":6000}));
    let system = system_query().await;
    progress("system evidence", "observed", &system);
    op.event("system evidence", "observed", system.clone());
    if let Ok(mut stored) = SYSTEM.lock() {
        *stored = Some(system.clone());
    }
    op.finish("completed",json!({"interpretation":"Checks completed, not a claim that all components are healthy. Inspect each check status."}));
    crate::runtime_log::flush();
    json!({"status":"completed","environment":environment,"local":local,"system":system})
}

fn component_paths(root: &std::path::Path) -> [(&'static str, std::path::PathBuf); 5] {
    let installed = root
        .parent()
        .is_some_and(|p| p.file_name() == Some(std::ffi::OsStr::new("versions")));
    let install_root = if installed {
        root.parent()
            .and_then(std::path::Path::parent)
            .unwrap_or(root)
    } else {
        root
    };
    [
        ("code-codex.exe", root.join("code-codex.exe")),
        (
            "code-codex-launcher.exe",
            root.join(if installed {
                "CodeCodex.exe"
            } else {
                "code-codex-launcher.exe"
            }),
        ),
        (
            "code-codex-shim.exe",
            if installed {
                let versioned = root.file_name().map(|version| install_root.join(format!("CodeCodex-{}.exe", version.to_string_lossy())));
                versioned.filter(|path|path.is_file()).unwrap_or_else(||install_root.join("CodeCodex.exe"))
            } else { install_root.join("code-codex-shim.exe") },
        ),
        (
            "code-codex-shortcut.exe",
            install_root.join(if installed {
                "CodeCodex.Shortcut.exe"
            } else {
                "code-codex-shortcut.exe"
            }),
        ),
        (
            "code-codex-uninstall.exe",
            install_root.join(if installed {
                "Uninstall-CodeCodex.exe"
            } else {
                "code-codex-uninstall.exe"
            }),
        ),
    ]
}

fn local_checks() -> Value {
    let components=std::env::current_exe().ok().and_then(|p|p.parent().map(std::path::Path::to_path_buf)).map(|root| {
        component_paths(&root).map(|(component, path)|{
            match std::fs::symlink_metadata(path) {
                Ok(m)=>json!({"component":component,"regularFile":m.is_file(),"symlink":m.file_type().is_symlink(),"bytes":m.len(),"integrity":"not compared to a trusted manifest"}),
                Err(e)=>json!({"component":component,"status":"unavailable","osCode":e.raw_os_error(),"kind":format!("{:?}",e.kind())}),
            }
        })
    });
    let settings = match workspace_service::SettingsStore::for_current_user().and_then(|s| s.load())
    {
        Ok(_) => json!({"status":"valid or defaults","valuesOmitted":true}),
        Err(e) => json!({"status":"failed","code":e.code(),"reason":e.public_message()}),
    };
    let packages = match crate::plugin_store::diagnostic_status() {
        Ok(value) => {
            json!({"status":"observed","packages":value,"interpretation":"Missing downloadable packages are normal. Installed does not prove renderer loaded or enabled."})
        }
        Err(e) => json!({"status":"failed","code":e.code,"reason":e.message}),
    };
    let language=match workspace_service::ui_language::LanguageStore::for_current_user() {
        Ok(store)=>match store.load(){Ok(value)=>json!({"status":"passed","saved":value.is_some(),"preference":value.unwrap_or_else(||workspace_service::ui_language::Preference::fallback(crate::gui_support::localization::system_locale())),"readOnly":true}),Err(error)=>json!({"status":"fallback","code":error.code(),"reason":error.to_string(),"preference":crate::gui_support::localization::preference(),"readOnly":true})},
        Err(error)=>json!({"status":"fallback","code":"CC-LANG-READ-001","reason":error.to_string(),"readOnly":true}),
    };
    json!({"uiLanguage":language,"components":components,"settings":settings,"plugins":packages,"storageLayout":workspace_service::application_paths::diagnostic_status(),"nativePersistence":crate::renderer_storage::diagnostic_status(),"diskWriteProbe":"not attempted","officialInternals":"not inspected"})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn component_locations_find_versioned_root_launcher() {
        let temp = tempfile::tempdir().unwrap();
        let version = temp.path().join("versions/0.4.62");
        std::fs::create_dir_all(&version).unwrap();
        let shim = temp.path().join("CodeCodex-0.4.62.exe");
        std::fs::write(&shim, b"fixture").unwrap();
        assert_eq!(component_paths(&version)[2].1, shim);
    }
    #[test]
    fn component_locations_match_staging_and_installed_layouts() {
        let staging = std::path::Path::new("payload");
        let installed = std::path::Path::new("Code-Codex")
            .join("versions")
            .join("0.4.6");
        assert_eq!(
            component_paths(staging)[1].1,
            staging.join("code-codex-launcher.exe")
        );
        let mapped = component_paths(&installed);
        assert_eq!(mapped[1].1, installed.join("CodeCodex.exe"));
        assert_eq!(
            mapped[2].1,
            std::path::Path::new("Code-Codex").join("CodeCodex.exe")
        );
        assert_eq!(
            mapped[3].1,
            std::path::Path::new("Code-Codex").join("CodeCodex.Shortcut.exe")
        );
        assert_eq!(
            mapped[4].1,
            std::path::Path::new("Code-Codex").join("Uninstall-CodeCodex.exe")
        );
    }
    #[tokio::test]
    async fn output_capture_drains_but_stays_bounded() {
        let input = vec![b'x'; 100000];
        let observed = capture(input.as_slice()).await;
        assert_eq!(observed["bytes"], 100000);
        assert_eq!(observed["truncated"], true);
        assert_eq!(observed["captured"].as_str().unwrap().len(), 32768);
    }
    #[test]
    fn environment_records_limits_and_unknowns_without_paths() {
        let data = environment();
        assert_eq!(data["readOnly"], true);
        assert_eq!(data["limits"]["runBytes"], 5 * 1024 * 1024);
        assert!(data["unobservable"].as_array().unwrap().len() >= 5);
    }
}
