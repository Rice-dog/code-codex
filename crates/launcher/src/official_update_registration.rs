//! Observe the native deployment, before acknowledging update preparation.
use windows::{ApplicationModel::{PackageCatalog, PackageUpdatingEventArgs}, Foundation::TypedEventHandler, Management::Deployment::PackageManager, core::HSTRING};
use tokio::sync::watch;

const CODEX_FAMILY: &str = "OpenAI.Codex_2p2nqsd0c76g0";

#[derive(Clone, Debug, PartialEq)]
enum State { Idle, Updating, Complete(Result<String, String>) }

pub(super) struct Registration {
    catalog: PackageCatalog,
    token: i64,
    state: watch::Receiver<State>,
    // The COM cookie owns the process MTA and releases it after the event source.
    _mta: Mta,
}

struct Mta(usize);
impl Drop for Mta {
    fn drop(&mut self) {
        let _ = unsafe { windows::Win32::System::Com::CoDecrementMTAUsage(windows::Win32::System::Com::CO_MTA_USAGE_COOKIE(self.0 as *mut _)) };
    }
}

fn observation(family: &str, version: &str, from: &str, complete: bool, error: i32) -> Option<State> {
    if family != CODEX_FAMILY || !super::is_newer(version, from) { return None; }
    Some(if complete {
        State::Complete(if error < 0 { Err(format!("CC-OFFICIAL-UPDATE-005: Package registration failed: HRESULT=0x{:08X}",error as u32)) } else { Ok(version.to_owned()) })
    } else { State::Updating })
}

impl Registration {
    pub(super) fn subscribe(from: &str) -> windows::core::Result<Self> {
        let mta = Mta(unsafe { windows::Win32::System::Com::CoIncrementMTAUsage()? }.0 as usize);
        let catalog = PackageCatalog::OpenForCurrentUser()?;
        let (sender, state) = watch::channel(State::Idle);
        let from = from.to_owned();
        let token = catalog.PackageUpdating(&TypedEventHandler::<PackageCatalog, PackageUpdatingEventArgs>::new(move |_, args| {
            let Some(args) = args.as_ref() else { return Ok(()); };
            let info = args.TargetPackage()?.Id()?;
            let v = info.Version()?;
            let version = format!("{}.{}.{}.{}",v.Major,v.Minor,v.Build,v.Revision);
            let Some(next) = observation(&info.FamilyName()?.to_string(), &version, &from, args.IsComplete()?, args.ErrorCode()?.0) else { return Ok(()); };
            sender.send_if_modified(|current| {
                if matches!(current, State::Complete(_)) || *current == next { return false; }
                let outcome = if matches!(next,State::Updating) {"registration-started"} else {"registration-completed"};
                crate::runtime_log::record("launcher","official update handoff",outcome,serde_json::json!({"fromVersion":from,"targetVersion":version,"result":format!("{next:?}")}));
                *current = next.clone(); true
            });
            Ok(())
        }))?;
        Ok(Self { catalog, token, state, _mta: mta })
    }

    pub(super) async fn wait_for_registered(&mut self, from: &str) -> Result<Option<String>, String> {
        let manager = PackageManager::new().map_err(|e| e.to_string())?;
        let family = HSTRING::from(CODEX_FAMILY);
        wait_for_registration(&mut self.state, std::time::Duration::from_secs(120), || {
            let mut newest = None::<String>;
            for package in manager.FindPackagesByUserSecurityIdPackageFamilyName(&HSTRING::new(), &family)? {
                let v = package.Id()?.Version()?;
                let version = format!("{}.{}.{}.{}",v.Major,v.Minor,v.Build,v.Revision);
                if super::is_newer(&version, newest.as_deref().unwrap_or(from)) { newest = Some(version); }
            }
            Ok(newest)
        }).await
    }
}

async fn wait_for_registration(
    state: &mut watch::Receiver<State>,
    budget: std::time::Duration,
    mut registered: impl FnMut() -> windows::core::Result<Option<String>>,
) -> Result<Option<String>, String> {
    use std::time::Duration;
    let deadline = tokio::time::Instant::now() + budget;
    let mut interval = Duration::from_millis(500);
    let mut notification_open = true;
    loop {
        if let State::Complete(Err(error)) = state.borrow_and_update().clone() { return Err(error); }
        match registered() {
            Ok(Some(version)) => return Ok(Some(version)),
            result if tokio::time::Instant::now() >= deadline => return result.map_err(|error| format!("CC-OFFICIAL-UPDATE-006: Registration could not be verified: {error}")),
            _ => {}
        }
        // Only a user-requested update, after confirmed exit, can reach here.
        // Native notifications wake immediately; a missed notification falls
        // back to this current-user package-family query, without PowerShell.
        let next = (tokio::time::Instant::now() + interval).min(deadline);
        tokio::select! {
            result = state.changed(), if notification_open => notification_open = result.is_ok(),
            () = tokio::time::sleep_until(next) => interval = (interval * 2).min(Duration::from_secs(2)),
        }
    }
}

impl Drop for Registration {
    fn drop(&mut self) { let _ = self.catalog.RemovePackageUpdating(self.token); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_matching_newer_registration_is_observed() {
        let old="26.1103.7773.0";let new="26.1106.6628.0";let family="OpenAI.Codex_2p2nqsd0c76g0";
        assert_eq!(observation("unrelated",new,old,true,0),None);
        assert_eq!(observation(family,old,old,true,0),None);
        assert_eq!(observation(family,new,old,false,0),Some(State::Updating));
        assert_eq!(observation(family,new,old,true,0),Some(State::Complete(Ok(new.into()))));
        assert!(matches!(observation(family,new,old,true,0x80073cf9u32 as i32),Some(State::Complete(Err(_)))));
    }

    #[tokio::test]
    async fn native_subscription_and_exit_during_registration() {
        use std::{future::Future, task::{Context, Poll, Waker}};
        let _registration=Registration::subscribe("26.1103.7773.0").expect("Native current-user catalog subscription");
        let (sender, mut receiver)=watch::channel(State::Updating);
        let available=std::cell::Cell::new(false);
        let mut finish=std::pin::pin!(wait_for_registration(&mut receiver, std::time::Duration::from_secs(2), ||Ok(available.get().then(||"26.1106.6628.0".to_owned()))));
        let mut cx=Context::from_waker(Waker::noop());
        assert!(matches!(finish.as_mut().poll(&mut cx),Poll::Pending),"Old process exit cannot release active registration");
        available.set(true);
        sender.send_replace(State::Complete(Ok("26.1106.6628.0".into())));
        assert_eq!(finish.await.unwrap().as_deref(),Some("26.1106.6628.0"));
    }

    #[tokio::test]
    async fn completion_before_exit_and_failure_are_retained() {
        let (sender, mut receiver)=watch::channel(State::Complete(Ok("26.1106.6628.0".into())));
        let budget=std::time::Duration::ZERO;
        assert_eq!(wait_for_registration(&mut receiver,budget,||Ok(Some("26.1106.6628.0".into()))).await.unwrap().as_deref(),Some("26.1106.6628.0"));
        sender.send_replace(State::Complete(Err("deployment failed".into())));
        assert_eq!(wait_for_registration(&mut receiver,budget,||panic!("A failed update must not relaunch")).await.unwrap_err(),"deployment failed");
    }

    #[tokio::test]
    async fn missing_notification_uses_registration_and_never_relaunches_old_version() {
        use std::time::Duration;
        let (_sender, mut receiver)=watch::channel(State::Idle);
        let mut reads=0;
        let version=wait_for_registration(&mut receiver,Duration::from_secs(2),||{
            reads+=1;
            Ok((reads==2).then(||"26.1106.6628.0".into()))
        }).await.unwrap();
        assert_eq!(version.as_deref(),Some("26.1106.6628.0"));
        assert_eq!(wait_for_registration(&mut receiver,Duration::ZERO,||Ok(None)).await.unwrap(),None);
    }
}
