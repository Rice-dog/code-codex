//! One user-requested official update; normal close and failed installs do not relaunch.
use std::{sync::atomic::{AtomicBool,Ordering},ffi::OsString};
#[cfg(windows)]
#[path="official_update_registration.rs"]
mod registration;
static PENDING:AtomicBool=AtomicBool::new(false);
pub(crate) fn is_newer(current:&str,previous:&str)->bool {
    fn parts(s:&str)->Option<Vec<u32>>{s.split('.').map(|v|v.parse().ok()).collect()}
    matches!((parts(current),parts(previous)),(Some(a),Some(b)) if a.len()==4&&b.len()==4&&a>b)
}
pub(crate) async fn schedule(port:u16)->Result<(),String>{
    if PENDING.swap(true,Ordering::AcqRel){return Ok(())}
    let result=async{
        let app=crate::discovery::discover_codex(None,None,crate::discovery::ChannelPreference::Stable).map_err(|e|e.to_string())?;
        let target=crate::process_guard::AttachedProcess::for_listener(port,&app.executable).map_err(|e|e.to_string())?;
        let ready=tempfile::Builder::new().prefix("cc-update-handoff-").tempdir().map_err(|e|e.to_string())?;
        let ready_path=ready.path().join("ready");
        let exe=std::env::current_exe().map_err(|e|e.to_string())?;
        let args:Vec<OsString>=vec!["official-update-follow".into(),"--port".into(),port.to_string().into(),"--pid".into(),target.pid().to_string().into(),"--created-ms".into(),target.created_ms().to_string().into(),"--from-version".into(),app.version.into(),"--image".into(),app.executable.into_os_string(),"--ready".into(),ready_path.clone().into_os_string()];
        let pid=crate::activation_lifetime::broker(&exe,&args).await.map_err(|e|e.to_string())?;
        // The native install must not race the worker retaining the old process.
        tokio::time::timeout(std::time::Duration::from_secs(20),async {
            loop {if std::fs::read_to_string(&ready_path).ok().as_deref()==Some(&pid.to_string()){break;}tokio::time::sleep(std::time::Duration::from_millis(25)).await;}
        }).await.map_err(|_|"The update handoff worker did not become ready".to_string())?;
        crate::runtime_log::record("launcher","official update handoff","prepared",serde_json::json!({"workerPid":pid,"officialPid":target.pid()}));
        Ok(())
    }.await;
    if result.is_err(){PENDING.store(false,Ordering::Release);}result
}
pub(crate) async fn follow(port:u16,pid:u32,created_ms:u64,from:String,image:std::path::PathBuf,ready:std::path::PathBuf)->Result<(),String>{
    let target=crate::process_guard::AttachedProcess::for_listener(port,&image).map_err(|e|e.to_string())?;
    if target.pid()!=pid||target.created_ms()!=created_ms{return Err("Official update process identity changed".into())}
    #[cfg(windows)]
    let mut registration = registration::Registration::subscribe(&from).map_err(|e|format!("CC-OFFICIAL-UPDATE-004: Registration notification: {e}"))?;
    crate::runtime_log::record("launcher","official update handoff","registration-listening",serde_json::json!({"officialPid":pid,"fromVersion":from}));
    std::fs::write(ready,std::process::id().to_string()).map_err(|e|e.to_string())?;
    target.wait_for_exit().await.map_err(|e|e.to_string())?;
    crate::runtime_log::record("launcher","official update handoff","original-exited",serde_json::json!({"officialPid":pid,"fromVersion":from}));
    #[cfg(windows)]
    registration.finish_if_updating().await?;
    let next=crate::discovery::discover_codex(None,None,crate::discovery::ChannelPreference::Stable).map_err(|e|e.to_string())?;
    if !is_newer(&next.version,&from){
        crate::runtime_log::record("launcher","official update handoff","not-updated",serde_json::json!({"relaunch":false,"fromVersion":from,"registeredVersion":next.version}));return Ok(())
    }
    let exe=std::env::current_exe().map_err(|e|e.to_string())?;
    let mut command=std::process::Command::new(exe);
    command.args(["run","--official-update-from",&from]).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
    let child=command.spawn().map_err(|e|e.to_string())?;
    crate::runtime_log::record("launcher","official update handoff","relaunched",serde_json::json!({"fromVersion":from,"toVersion":next.version,"workerPid":child.id()}));
    Ok(())
}
#[cfg(test)]mod tests{use super::*;#[test]fn update_requires_new_concrete_package_version(){assert!(is_newer("26.1106.6628.0","26.1103.7773.0"));for (a,b) in [("26.1103.7773.0","26.1103.7773.0"),("26.1103.7773.0","26.1106.6628.0"),("unknown","26.1103.7773.0"),("26.1106.6628","26.1103.7773.0")]{assert!(!is_newer(a,b));}}}
