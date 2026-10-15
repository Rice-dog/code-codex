//! Read-only capability evidence and conservative Windows 10 surface fallback.
//! A successful compatibility decision never replaces process/renderer authorization.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    time::Instant,
};

const SENTINEL: &[u8] = b"dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX";
const CHUNK: usize = 1024 * 1024;
const MAX_IMAGE: u64 = 512 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InspectCapability {
    Enabled,
    Disabled,
    Removed,
    NativeChromium,
    Unknown,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Capability {
    pub state: InspectCapability,
    pub reason: String,
    pub duration_ms: u128,
}
impl Capability {
    pub fn should_request_inspector(&self) -> bool {
        !matches!(
            self.state,
            InspectCapability::Disabled
                | InspectCapability::Removed
                | InspectCapability::NativeChromium
        )
    }
}

// Format is the read-only wire consumed by electron/fuses, not a patching API:
// sentinel + numeric version(1) + length + ASCII state bytes; option 3 is Node CLI inspect.
fn scan_fuse(
    reader: &mut (impl Read + Seek),
    length: u64,
) -> Result<(InspectCapability, &'static str), io::Error> {
    if length > MAX_IMAGE {
        return Ok((
            InspectCapability::Unknown,
            "image exceeds 512 MiB scan limit",
        ));
    }
    let mut position = 0u64;
    let mut found = None;
    let mut buffer = vec![0u8; CHUNK + SENTINEL.len() - 1];
    while position < length {
        reader.seek(SeekFrom::Start(position))?;
        let size = (length - position).min(buffer.len() as u64) as usize;
        reader.read_exact(&mut buffer[..size])?;
        for index in 0..size.saturating_sub(SENTINEL.len() - 1) {
            if buffer[index] == SENTINEL[0] && &buffer[index..index + SENTINEL.len()] == SENTINEL {
                let offset = position + index as u64;
                if found.is_some_and(|previous| previous != offset) {
                    return Ok((
                        InspectCapability::Unknown,
                        "multiple fuse sentinels in Windows image",
                    ));
                }
                found = Some(offset);
            }
        }
        position += CHUNK as u64;
    }
    let Some(offset) = found else {
        return Ok((InspectCapability::Unknown, "fuse sentinel not found"));
    };
    reader.seek(SeekFrom::Start(offset + SENTINEL.len() as u64))?;
    let mut header = [0u8; 2];
    if reader.read_exact(&mut header).is_err() {
        return Ok((InspectCapability::Unknown, "truncated fuse header"));
    }
    if header[0] != 1 || header[1] < 4 {
        return Ok((
            InspectCapability::Unknown,
            "unsupported fuse version or short wire",
        ));
    }
    let mut wire = vec![0; header[1] as usize];
    if reader.read_exact(&mut wire).is_err() {
        return Ok((InspectCapability::Unknown, "truncated fuse wire"));
    }
    Ok(match wire[3] {
        b'0' => (
            InspectCapability::Disabled,
            "Node CLI inspector explicitly disabled by official image",
        ),
        b'1' => (
            InspectCapability::Enabled,
            "Node CLI inspector enabled by official image",
        ),
        b'r' => (
            InspectCapability::Removed,
            "Node CLI inspector removed by official image",
        ),
        _ => (
            InspectCapability::Unknown,
            "unknown Node CLI inspector state",
        ),
    })
}

pub(crate) fn inspect_capability(path: &Path) -> Capability {
    let started = Instant::now();
    let result = (|| {
        let mut file = File::open(path)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Ok((
                InspectCapability::Unknown,
                "official image is not a regular file",
            ));
        }
        if native_chromium_layout(path)? {
            return Ok((
                InspectCapability::NativeChromium,
                "official native Chromium runtime layout; Electron BrowserWindow/Node patch not applicable",
            ));
        }
        scan_fuse(&mut file, metadata.len())
    })();
    let (state, reason) = match result {
        Ok((state, reason)) => (state, reason.to_owned()),
        Err(error) => (
            InspectCapability::Unknown,
            format!(
                "image read failed: kind={:?}; osCode={:?}",
                error.kind(),
                error.raw_os_error()
            ),
        ),
    };
    Capability {
        state,
        reason,
        duration_ms: started.elapsed().as_millis(),
    }
}

fn native_chromium_layout(executable: &Path) -> io::Result<bool> {
    let Some(parent) = executable.parent() else {
        return Ok(false);
    };
    let manifest = parent.join("owl-shell-runtime.json");
    let metadata = match std::fs::symlink_metadata(&manifest) {
        Ok(m) => m,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 8192 {
        return Ok(false);
    }
    let mut bytes = Vec::new();
    File::open(manifest)?.take(8193).read_to_end(&mut bytes)?;
    if bytes.len() > 8192 {
        return Ok(false);
    }
    let value: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    if value["schemaVersion"] != 1 || value["platform"] != "win32" || value["arch"] != "x64" {
        return Ok(false);
    }
    for name in ["chrome.dll", "resources.pak"] {
        let metadata = match std::fs::symlink_metadata(parent.join(name)) {
            Ok(m) => m,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e),
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() == 0 {
            return Ok(false);
        }
    }
    Ok(true)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Listener {
    pub pid: u32,
    pub family: u32,
    pub address_kind: &'static str,
}

#[cfg(windows)]
pub(crate) fn listeners(port: u16) -> Result<Vec<Listener>, String> {
    use std::mem::size_of;
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID,
        TCP_TABLE_OWNER_PID_LISTENER,
    };
    let mut listeners = Vec::new();
    for family in [2u32, 23u32] {
        let mut bytes = 0u32;
        let first = unsafe {
            GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut bytes,
                0,
                family,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if first != 122 || !(4..=4 * 1024 * 1024).contains(&bytes) {
            return Err(format!(
                "listener table size query failed: family={family}; osCode={first}; bytes={bytes}"
            ));
        }
        let mut table = vec![0u64; (bytes as usize).div_ceil(8)];
        let result = unsafe {
            GetExtendedTcpTable(
                table.as_mut_ptr().cast(),
                &mut bytes,
                0,
                family,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if result != 0 {
            return Err(format!(
                "listener table query failed: family={family}; osCode={result}"
            ));
        }
        let count = table[0] as u32 as usize;
        let row_size = if family == 2 {
            size_of::<MIB_TCPROW_OWNER_PID>()
        } else {
            size_of::<MIB_TCP6ROW_OWNER_PID>()
        };
        if 4 + count.saturating_mul(row_size) > bytes as usize || bytes as usize > table.len() * 8 {
            return Err(format!("listener table bounds invalid: family={family}"));
        }
        let rows = unsafe { table.as_ptr().cast::<u8>().add(4) };
        for index in 0..count {
            let (pid, raw_port, address_kind) = if family == 2 {
                let row = unsafe { &*rows.add(index * row_size).cast::<MIB_TCPROW_OWNER_PID>() };
                let kind = if row.dwLocalAddr == 0 {
                    "wildcard"
                } else if row.dwLocalAddr.to_ne_bytes()[0] == 127 {
                    "loopback"
                } else {
                    "other"
                };
                (row.dwOwningPid, row.dwLocalPort, kind)
            } else {
                let row = unsafe { &*rows.add(index * row_size).cast::<MIB_TCP6ROW_OWNER_PID>() };
                let kind = if row.ucLocalAddr == [0; 16] {
                    "wildcard"
                } else if row.ucLocalAddr == std::net::Ipv6Addr::LOCALHOST.octets() {
                    "loopback"
                } else {
                    "other"
                };
                (row.dwOwningPid, row.dwLocalPort, kind)
            };
            if u16::from_be(raw_port as u16) == port {
                if listeners.len() >= 32 {
                    return Err("target listener count exceeds bounded observation limit".into());
                }
                listeners.push(Listener {
                    pid,
                    family,
                    address_kind,
                });
            }
        }
    }
    Ok(listeners)
}
#[cfg(not(windows))]
pub(crate) fn listeners(_: u16) -> Result<Vec<Listener>, String> {
    Err("native listener evidence unsupported on this OS".into())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Arguments {
    pub process_present: bool,
    pub command_line_available: bool,
    pub inspector_matches: bool,
    pub renderer_matches: bool,
    pub inspector_switch_count: usize,
}

#[cfg(windows)]
pub(crate) fn arguments(pid: u32, main_port: u16, renderer_port: u16) -> Result<Arguments, String> {
    const SCRIPT: &str = r#"
$p = Invoke-CCStep 'main inspector command-line summary' { Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + $env:CLE_ACTIVATION_PID) -ErrorAction Stop }
$line = if ($p) { $p.CommandLine } else { $null }
$inspectorMatches = $false; $rendererMatches = $false; $inspectCount = 0
if ($line) {
  foreach ($m in [regex]::Matches($line, '(?i)(?:^|\s|")--(?<name>inspect-brk|inspect-port|inspect|remote-debugging-port)(?:=(?<value>[^\s"]+))?(?=\s|"|$)')) {
    $name = $m.Groups['name'].Value.ToLowerInvariant()
    if ($name -eq 'remote-debugging-port') { $rendererMatches = $m.Groups['value'].Value -eq $env:CLE_RENDER_PORT }
    else { $inspectCount++; if ($name -eq 'inspect-brk' -and $m.Groups['value'].Value -eq ('127.0.0.1:' + $env:CLE_MAIN_PORT)) { $inspectorMatches = $true } }
  }
}
@{processPresent=[bool]$p;commandLineAvailable=[bool]$line;inspectorMatches=$inspectorMatches;rendererMatches=$rendererMatches;inspectorSwitchCount=$inspectCount} | ConvertTo-Json -Compress
"#;
    let pid = pid.to_string();
    let main = main_port.to_string();
    let renderer = renderer_port.to_string();
    let result = crate::process_diagnostics::query_with_timeout(
        "main inspector arguments",
        SCRIPT,
        &[
            ("CLE_ACTIVATION_PID", pid.as_ref()),
            ("CLE_MAIN_PORT", main.as_ref()),
            ("CLE_RENDER_PORT", renderer.as_ref()),
        ],
        4096,
        json!({"pid":pid,"mainPort":main,"rendererPort":renderer,"fullCommandLineRetained":false}),
        std::time::Duration::from_secs(6),
    )
    .map_err(|e| e.to_string())?;
    let summary: Arguments = serde_json::from_slice(&result).map_err(|e| {
        format!(
            "argument summary decoding failed: category={:?}; line={}; column={}",
            e.classify(),
            e.line(),
            e.column()
        )
    })?;
    crate::process_diagnostics::observe(
        "main inspector",
        "actual debug-switch summary",
        "observed",
        json!(&summary),
    );
    Ok(summary)
}
#[cfg(not(windows))]
pub(crate) fn arguments(_: u32, _: u16, _: u16) -> Result<Arguments, String> {
    Err("argument evidence unsupported on this OS".into())
}

pub(crate) fn classify(
    pid: u32,
    running: bool,
    table: &Result<Vec<Listener>, String>,
    args: Option<&Arguments>,
) -> &'static str {
    if !running {
        "main inspector activation process exited"
    } else if table
        .as_ref()
        .is_ok_and(|rows| rows.iter().any(|r| r.pid != pid))
    {
        "main inspector foreign listener"
    } else if table.as_ref().is_ok_and(|rows| !rows.is_empty()) {
        "main inspector listener unreachable"
    } else if args.is_some_and(|a| {
        a.command_line_available
            && (!a.inspector_matches || !a.renderer_matches || a.inspector_switch_count != 1)
    }) {
        "main inspector arguments not honored"
    } else if table.is_err() {
        "main inspector evidence unavailable"
    } else {
        "main inspector listener absent"
    }
}

pub(crate) fn may_fallback(
    running: bool,
    table: &Result<Vec<Listener>, String>,
    qualified: bool,
) -> bool {
    running && table.as_ref().is_ok_and(Vec::is_empty) && qualified
}
pub(crate) fn layout_summary(value: &Value) -> Value {
    let mut result = serde_json::Map::new();
    for key in [
        "accepted",
        "topFrame",
        "appOrigin",
        "mainCount",
        "nativeLoginPage",
        "nativeFeaturePage",
    ] {
        if let Some(v) = value.get(key).filter(|v| v.is_boolean() || v.is_u64()) {
            result.insert(key.into(), v.clone());
        }
    }
    if let Some(v) = value
        .get("readyState")
        .and_then(Value::as_str)
        .filter(|v| matches!(*v, "loading" | "interactive" | "complete"))
    {
        result.insert("readyState".into(), v.into());
    }
    Value::Object(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn image(state: u8) -> Vec<u8> {
        [SENTINEL, &[1, 4, b'1', b'1', b'1', state]].concat()
    }
    #[test]
    fn fuse_wire_states_and_unknowns() {
        for (s, expected) in [
            (b'0', InspectCapability::Disabled),
            (b'1', InspectCapability::Enabled),
            (b'r', InspectCapability::Removed),
            (b'?', InspectCapability::Unknown),
        ] {
            let b = image(s);
            assert_eq!(
                scan_fuse(&mut Cursor::new(&b), b.len() as u64).unwrap().0,
                expected
            );
        }
        for b in [
            vec![],
            SENTINEL.to_vec(),
            [SENTINEL, &[2, 4, b'1', b'1', b'1', b'0']].concat(),
            [SENTINEL, &[1, 9, b'0']].concat(),
            [image(b'0'), image(b'1')].concat(),
        ] {
            assert_eq!(
                scan_fuse(&mut Cursor::new(&b), b.len() as u64).unwrap().0,
                InspectCapability::Unknown
            );
        }
    }
    #[test]
    fn streaming_fuse_boundary_and_limit() {
        let mut b = vec![0; CHUNK - 10];
        b.extend(image(b'0'));
        assert_eq!(
            scan_fuse(&mut Cursor::new(&b), b.len() as u64).unwrap().0,
            InspectCapability::Disabled
        );
        assert_eq!(
            scan_fuse(&mut Cursor::new([]), MAX_IMAGE + 1).unwrap().0,
            InspectCapability::Unknown
        );
    }
    #[test]
    fn fallback_needs_positive_proof_and_no_listener_in_either_family() {
        assert!(may_fallback(true, &Ok(vec![]), true));
        assert!(!may_fallback(true, &Ok(vec![]), false));
        assert!(!may_fallback(false, &Ok(vec![]), true));
        assert!(!may_fallback(true, &Err("denied".into()), true));
        for family in [2, 23] {
            assert!(!may_fallback(
                true,
                &Ok(vec![Listener {
                    pid: 9,
                    family,
                    address_kind: "wildcard"
                }]),
                true
            ));
        }
        assert_eq!(
            classify(9, true, &Ok(vec![]), None),
            "main inspector listener absent"
        );
        assert_eq!(
            classify(9, false, &Ok(vec![]), None),
            "main inspector activation process exited"
        );
        assert_eq!(
            classify(9, true, &Err("unavailable".into()), None),
            "main inspector evidence unavailable"
        );
        assert_eq!(
            classify(
                9,
                true,
                &Ok(vec![Listener {
                    pid: 8,
                    family: 2,
                    address_kind: "loopback"
                }]),
                None
            ),
            "main inspector foreign listener"
        );
    }
    #[test]
    fn layout_logs_have_no_user_content() {
        let v = layout_summary(
            &json!({"accepted":true,"readyState":"complete","title":"private","url":"private","rowChildren":["private"]}),
        );
        assert_eq!(v, json!({"accepted":true,"readyState":"complete"}));
    }
    #[test]
    fn native_runtime_is_positive_evidence_not_missing_fuse_guess() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("ChatGPT.exe");
        std::fs::write(&exe, []).unwrap();
        assert_eq!(inspect_capability(&exe).state, InspectCapability::Unknown);
        std::fs::write(
            dir.path().join("owl-shell-runtime.json"),
            br#"{"schemaVersion":1,"platform":"win32","arch":"x64"}"#,
        )
        .unwrap();
        std::fs::write(dir.path().join("chrome.dll"), b"fixture").unwrap();
        assert_eq!(inspect_capability(&exe).state, InspectCapability::Unknown);
        std::fs::write(dir.path().join("resources.pak"), b"fixture").unwrap();
        let result = inspect_capability(&exe);
        assert_eq!(result.state, InspectCapability::NativeChromium);
        assert!(!result.should_request_inspector());
        std::fs::write(
            dir.path().join("owl-shell-runtime.json"),
            br#"{"schemaVersion":2,"platform":"win32","arch":"x64"}"#,
        )
        .unwrap();
        assert_eq!(inspect_capability(&exe).state, InspectCapability::Unknown);
    }
    #[test]
    fn argument_and_listener_faults_are_distinct() {
        let args = Arguments {
            process_present: true,
            command_line_available: true,
            inspector_matches: false,
            renderer_matches: true,
            inspector_switch_count: 0,
        };
        assert_eq!(
            classify(9, true, &Ok(vec![]), Some(&args)),
            "main inspector arguments not honored"
        );
        assert_eq!(
            classify(
                9,
                true,
                &Ok(vec![Listener {
                    pid: 9,
                    family: 2,
                    address_kind: "loopback"
                }]),
                Some(&args)
            ),
            "main inspector listener unreachable"
        );
        let unavailable = Arguments {
            command_line_available: false,
            ..args
        };
        assert_eq!(
            classify(9, true, &Err("denied".into()), Some(&unavailable)),
            "main inspector evidence unavailable"
        );
    }
    #[test]
    #[ignore = "explicit read-only installed official-image observation"]
    fn installed_official_image_capability() {
        let path =
            std::env::var_os("CLE_TEST_OFFICIAL_IMAGE").expect("explicit official image path");
        println!(
            "{}",
            serde_json::to_string(&inspect_capability(Path::new(&path))).unwrap()
        );
    }
    #[cfg(windows)]
    #[test]
    fn native_listener_finds_current_ipv4_and_ipv6_process() {
        for addr in ["127.0.0.1:0", "0.0.0.0:0", "[::1]:0"] {
            let listener = std::net::TcpListener::bind(addr).unwrap();
            let port = listener.local_addr().unwrap().port();
            assert!(
                listeners(port)
                    .unwrap()
                    .iter()
                    .any(|r| r.pid == std::process::id()),
                "{addr}"
            );
        }
    }
    #[cfg(windows)]
    #[test]
    fn argument_probe_distinguishes_missing_process_without_private_command() {
        let a = arguments(std::process::id(), 55444, 55445).unwrap();
        assert!(a.process_present);
        assert!(!a.inspector_matches);
        let missing = arguments(u32::MAX, 55444, 55445).unwrap();
        assert!(!missing.process_present);
    }
    #[cfg(windows)]
    #[test]
    fn real_argument_summary_checks_ports_and_does_not_retain_private_arguments() {
        use std::os::windows::process::CommandExt;
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("argument-fixture.ps1");
        std::fs::write(&script,"param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Rest)\nStart-Sleep -Seconds 60").unwrap();
        let mut child =
            std::process::Command::new(crate::process_guard::trusted_powershell().unwrap())
                .args(["-NoProfile", "-File"])
                .arg(&script)
                .args([
                    "--inspect-brk=127.0.0.1:55444",
                    "--remote-debugging-port=55445",
                    "--private-token=DO_NOT_RETAIN_THIS",
                ])
                .creation_flags(0x0800_0000)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap();
        let result = arguments(child.id(), 55444, 55445);
        let wrong = arguments(child.id(), 55443, 55445);
        let _ = child.kill();
        let _ = child.wait();
        let result = result.unwrap();
        assert!(result.inspector_matches && result.renderer_matches);
        assert_eq!(result.inspector_switch_count, 1);
        assert!(
            !serde_json::to_string(&result)
                .unwrap()
                .contains("DO_NOT_RETAIN_THIS")
        );
        assert!(!wrong.unwrap().inspector_matches);
    }
}
