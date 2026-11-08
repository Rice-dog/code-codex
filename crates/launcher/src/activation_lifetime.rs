//! Live activation must outlive an account executor's kill-on-close Job Object.
//! WMI starts the same executable as the current user, outside the caller's job.
//! No task jobs are weakened and no external command/path comes from the renderer.
use crate::process_guard::ProcessGuardError;

pub(crate) async fn delegate_if_job_owned(worker: bool) -> Result<bool, ProcessGuardError> {
    #[cfg(not(windows))]
    { let _ = worker; Ok(false) }
    #[cfg(windows)]
    {
        if !in_job()? {
            if worker { crate::runtime_log::record("launcher","activation lifetime","independent",serde_json::json!({"code":"CC-ACTIVATE-LIFETIME-002","pid":std::process::id(),"callerJobOwned":false,"version":env!("CARGO_PKG_VERSION")})); }
            return Ok(false);
        }
        if worker {
            return Err(ProcessGuardError::Detailed("CC-ACTIVATE-LIFETIME-002: The activation worker still belongs to a caller job. No renderer handoff was attempted.".into()));
        }
        let exe = std::env::current_exe().map_err(|e| ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-001: Current executable unavailable: {e}")))?;
        let mut arguments: Vec<_> = std::env::args_os().skip(1).collect();
        arguments.push("--activation-worker".into());
        let started = std::time::SystemTime::now();
        let pid = broker(&exe, &arguments).await?;
        let handle = crate::process_guard::retain_native_identity(pid, started, &exe, None)?;
        crate::runtime_log::record("launcher", "activation lifetime", "delegated", serde_json::json!({"code":"CC-ACTIVATE-LIFETIME-001","pid":pid,"version":env!("CARGO_PKG_VERSION"),"callerJobOwned":true,"rendererHandoffAttempted":false}));
        // Retain identity while waiting; exiting/killing this proxy cannot kill the worker.
        loop {
            if let Some(code) = crate::process_guard::process_handle_exit_code(&handle)
                .map_err(|e| ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-003: Worker observation failed: {e}")))? {
                crate::runtime_log::record("launcher", "activation lifetime", "worker-exited", serde_json::json!({"code":"CC-ACTIVATE-LIFETIME-003","pid":pid,"exitCode":code}));
                if code != 0 { return Err(ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-003: Activation worker exited with status {code}."))); }
                return Ok(true);
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
    }
}

#[cfg(windows)]
fn in_job() -> Result<bool, ProcessGuardError> {
    let mut value = 0;
    let ok = unsafe { windows_sys::Win32::System::JobObjects::IsProcessInJob(windows_sys::Win32::System::Threading::GetCurrentProcess(), std::ptr::null_mut(), &mut value) };
    if ok == 0 { return Err(ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-001: Job observation failed: {}",std::io::Error::last_os_error()))); }
    Ok(value != 0)
}

#[cfg(windows)]
fn quote(argument: &std::ffi::OsStr) -> Result<String, ProcessGuardError> {
    let argument = argument.to_str().ok_or_else(||ProcessGuardError::Detailed("Activation arguments must be valid Unicode.".into()))?;
    if argument.contains('\0') { return Err(ProcessGuardError::Detailed("Activation arguments contain a null character.".into())); }
    let mut quoted = String::from("\"");let mut slashes = 0;
    for c in argument.chars() {
        if c == '\\' { slashes += 1; continue; }
        if c == '"' { quoted.extend(std::iter::repeat_n('\\',slashes*2+1)); } else { quoted.extend(std::iter::repeat_n('\\',slashes)); }
        slashes = 0;quoted.push(c);
    }
    quoted.extend(std::iter::repeat_n('\\',slashes*2));quoted.push('"');Ok(quoted)
}

#[cfg(windows)]
pub(crate) async fn broker(exe: &std::path::Path, args: &[std::ffi::OsString]) -> Result<u32, ProcessGuardError> {
    use base64::Engine;
    let command = std::iter::once(exe.as_os_str()).chain(args.iter().map(|a|a.as_os_str())).map(quote).collect::<Result<Vec<_>,_>>()?.join(" ");
    let literal = command.replace('\'', "''");
    let script = format!("$ErrorActionPreference='Stop';$startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{{ShowWindow=[uint16]0}};$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{CommandLine='{literal}';ProcessStartupInformation=$startup}};@{{returnValue=$r.ReturnValue;pid=$r.ProcessId}}|ConvertTo-Json -Compress");
    let bytes: Vec<_> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let shell = crate::process_guard::trusted_powershell().ok_or_else(||ProcessGuardError::Detailed("CC-ACTIVATE-LIFETIME-001: Trusted System32 PowerShell unavailable.".into()))?;
    let output = tokio::time::timeout(std::time::Duration::from_secs(20),tokio::process::Command::new(shell).args(["-NoProfile","-NonInteractive","-EncodedCommand",&encoded]).creation_flags(0x0800_0000).kill_on_drop(true).output()).await
        .map_err(|_|ProcessGuardError::Detailed("CC-ACTIVATE-LIFETIME-001: Activation broker exceeded 20 seconds. No renderer handoff was attempted.".into()))?
        .map_err(|e|ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-001: Activation broker failed: {e}")))?;
    if !output.status.success() || output.stdout.len()>4096 { return Err(ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-001: Activation broker failed: status={}; stderr={}",output.status,String::from_utf8_lossy(&output.stderr).chars().take(1200).collect::<String>()))); }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|_|ProcessGuardError::Detailed("CC-ACTIVATE-LIFETIME-001: Invalid activation broker result.".into()))?;
    if value["returnValue"]!=0 { return Err(ProcessGuardError::Detailed(format!("CC-ACTIVATE-LIFETIME-001: Windows rejected activation: {}",value["returnValue"]))); }
    value["pid"].as_u64().and_then(|p|u32::try_from(p).ok()).filter(|p|*p>0).ok_or_else(||ProcessGuardError::Detailed("CC-ACTIVATE-LIFETIME-001: Activation broker returned no process identity.".into()))
}

#[cfg(all(test,windows))]
mod tests {
    use super::*;
    use std::{ffi::OsString,process::Stdio};
    use process_wrap::tokio::{TokioCommandWrap,JobObject,KillOnDrop,CreationFlags};

    #[test]
    fn windows_arguments_preserve_spaces_quotes_slashes_and_shell_characters() {
        assert_eq!(quote(std::ffi::OsStr::new("E:\\space dir\\")).unwrap(),"\"E:\\space dir\\\\\"");
        assert_eq!(quote(std::ffi::OsStr::new("a\"b")).unwrap(),"\"a\\\"b\"");
        assert_eq!(quote(std::ffi::OsStr::new("a' $() ` ; &")).unwrap(),"\"a' $() ` ; &\"");
        assert!(quote(std::ffi::OsStr::new("a\0b")).is_err());
    }

    #[tokio::test]
    #[ignore = "one-time child launched inside a real kill-on-close job by the parent test"]
    async fn broker_job_child() {
        let Some(file)=std::env::var_os("CC_ACTIVATION_TEST_PID") else {return;};
        assert!(in_job().unwrap());
        let shell=crate::process_guard::trusted_powershell().unwrap();
        let pid=broker(&shell,&[OsString::from("-NoProfile"),OsString::from("-NonInteractive"),OsString::from("-Command"),OsString::from("Start-Sleep -Seconds 8")]).await.unwrap();
        std::fs::write(file,pid.to_string()).unwrap();
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
    }

    #[tokio::test]
    async fn broker_worker_survives_termination_of_the_real_caller_job() {
        let temp=tempfile::tempdir().unwrap();let file=temp.path().join("worker-pid.txt");
        let mut command=tokio::process::Command::new(std::env::current_exe().unwrap());
        command.args(["--exact","activation_lifetime::tests::broker_job_child","--ignored","--nocapture"]).env("CC_ACTIVATION_TEST_PID",&file).stdin(Stdio::null()).stdout(Stdio::null());
        let mut command=TokioCommandWrap::from(command);command.wrap(KillOnDrop);command.wrap(CreationFlags(windows::Win32::System::Threading::CREATE_NO_WINDOW));command.wrap(JobObject);
        let started=std::time::SystemTime::now();let mut child=command.spawn().unwrap();let deadline=std::time::Instant::now()+std::time::Duration::from_secs(25);
        while !file.exists(){assert!(std::time::Instant::now()<deadline,"Broker child did not report its worker");tokio::time::sleep(std::time::Duration::from_millis(100)).await;}
        let pid=std::fs::read_to_string(file).unwrap().parse().unwrap();let shell=crate::process_guard::trusted_powershell().unwrap();let handle=crate::process_guard::retain_native_identity(pid,started,&shell,None).unwrap();
        std::pin::Pin::from(child.kill()).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(350)).await;
        assert!(crate::process_guard::process_handle_exit_code(&handle).unwrap().is_none(),"Activation worker died with its caller job");
        // The bounded fixture exits naturally; no arbitrary process is killed.
        let deadline=std::time::Instant::now()+std::time::Duration::from_secs(12);
        while crate::process_guard::process_handle_exit_code(&handle).unwrap().is_none(){assert!(std::time::Instant::now()<deadline);tokio::time::sleep(std::time::Duration::from_millis(100)).await;}
    }
}
