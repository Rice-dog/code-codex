//! Observe the native deployment, before acknowledging update preparation.
use windows::{ApplicationModel::{PackageCatalog, PackageUpdatingEventArgs}, Foundation::TypedEventHandler};
use tokio::sync::watch;

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
    if family != "OpenAI.Codex_2p2nqsd0c76g0" || !super::is_newer(version, from) { return None; }
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

    pub(super) async fn finish_if_updating(&mut self) -> Result<(), String> {
        loop {
            let current = self.state.borrow_and_update().clone();
            match current {
                State::Idle => return Ok(()), // No deployment: ordinary close/cancel.
                State::Complete(result) => return result.map(|_|()),
                State::Updating => self.state.changed().await.map_err(|_|"CC-OFFICIAL-UPDATE-006: Package registration notifications ended before completion".to_owned())?,
            }
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
        let mut registration=Registration::subscribe("26.1103.7773.0").expect("Native current-user catalog subscription");
        registration.finish_if_updating().await.expect("Ordinary close has no deployment to wait for");
        let (sender, receiver)=watch::channel(State::Updating);
        registration.state=receiver;
        let mut finish=std::pin::pin!(registration.finish_if_updating());
        let mut cx=Context::from_waker(Waker::noop());
        assert!(matches!(finish.as_mut().poll(&mut cx),Poll::Pending),"Old process exit cannot release active registration");
        sender.send_replace(State::Complete(Ok("26.1106.6628.0".into())));
        finish.await.expect("Completion releases without a delay or rescan loop");
    }

    #[tokio::test]
    async fn completion_before_exit_and_failure_are_retained() {
        let mut registration=Registration::subscribe("26.1103.7773.0").unwrap();
        let (sender, receiver)=watch::channel(State::Complete(Ok("26.1106.6628.0".into())));
        registration.state=receiver;
        registration.finish_if_updating().await.unwrap();
        sender.send_replace(State::Complete(Err("deployment failed".into())));
        assert_eq!(registration.finish_if_updating().await.unwrap_err(),"deployment failed");
    }
}
