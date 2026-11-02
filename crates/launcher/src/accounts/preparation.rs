//! Read-only preparation progress, cancellation and bounded diagnostic stages.
use super::AccountError;
use crate::runtime_log::Operation;
use serde_json::{Value,json};
use std::sync::{Arc,Mutex};
use std::time::Instant;

pub async fn bounded<T>(budget:std::time::Duration,future:impl std::future::Future<Output=super::Result<T>>)->super::Result<T>{
    let timeout=||Err(AccountError::new("ACCOUNT_PREPARE_TIMEOUT","Account preparation exceeded its deadline. The pending preparation was cancelled; no task was sent."));
    if budget.is_zero(){return timeout();}
    // Unlike timeout(), poll the deadline first when delayed scheduling makes
    // both branches ready. Do not poll work that could commit after expiry.
    tokio::select!{biased;
        _=tokio::time::sleep(budget)=>timeout(),
        result=future=>result,
    }
}

#[derive(Clone)]
pub struct Preparation(Arc<Shared>);
struct Shared{state:Mutex<State>,cancelled:std::sync::atomic::AtomicBool,notify:tokio::sync::Notify}
pub struct Guard(pub Preparation);
impl Drop for Guard {
    fn drop(&mut self){
        if self.0.snapshot()["status"]=="preparing" {
            let e=self.0.failure(AccountError::new("ACCOUNT_PREPARE_CANCELLED","The preparation ended before completion. Select the account again; no task was sent."));
            self.0.finish(Some(&e));
        }
    }
}
struct State { operation:Operation, started:Instant, phase:&'static str, step:&'static str, phase_started:Instant, step_started:Instant, progress:u8, status:&'static str, error:Option<(String,String)>, cleanup:Option<bool> }
impl Preparation {
    pub fn start()->Self {
        Self(Arc::new(Shared{state:Mutex::new(State{operation:Operation::start("accounts","account.prepare",json!({"workBudgetMs":70000,"totalPrepareBudgetMs":90000,"message":"No inference request is sent during preparation."})),started:Instant::now(),phase:"queued",step:"queued",phase_started:Instant::now(),step_started:Instant::now(),progress:5,status:"preparing",error:None,cleanup:None}),cancelled:std::sync::atomic::AtomicBool::new(false),notify:tokio::sync::Notify::new()}))
    }
    pub fn phase(&self,phase:&'static str,progress:u8){
        let mut s=self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous=s.phase;let duration=s.phase_started.elapsed().as_millis();
        s.operation.event("account.prepare.phase","completed",json!({"phase":previous,"phaseDurationMs":duration}));
        s.phase=phase;s.step=phase;s.phase_started=Instant::now();s.step_started=Instant::now();s.progress=progress;
        s.operation.event("account.prepare.phase","observed",json!({"phase":phase,"progress":progress}));
    }
    pub fn step(&self,step:&'static str,details:Value){
        let mut s=self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous=s.step;let duration=s.step_started.elapsed().as_millis();
        s.operation.event("account.prepare.step","completed",json!({"phase":s.phase,"step":previous,"stepDurationMs":duration}));
        s.step=step;s.step_started=Instant::now();
        s.operation.event("account.prepare.step","observed",json!({"phase":s.phase,"step":step,"details":details}));
    }
    pub fn remaining(&self,budget:std::time::Duration)->std::time::Duration{budget.saturating_sub(self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner).started.elapsed())}
    pub fn cleanup(&self,confirmed:bool){self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner).cleanup=Some(confirmed);}
    pub fn is_cancelled(&self)->bool{self.0.cancelled.load(std::sync::atomic::Ordering::Acquire)}
    pub fn cancel(&self){self.0.cancelled.store(true,std::sync::atomic::Ordering::Release);self.0.notify.notify_one();}
    pub async fn cancelled(&self){loop{if self.0.cancelled.load(std::sync::atomic::Ordering::Acquire){return;}self.0.notify.notified().await;}}
    pub fn finish(&self,error:Option<&AccountError>){
        let mut s=self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if s.status!="preparing"{return;}
        s.status=if error.is_some(){"failed"}else{"ready"};
        s.error=error.map(|e|(e.code.clone(),e.message.clone()));
        if error.is_none(){s.phase="ready";s.progress=100;}
        let result=json!({"phase":s.phase,"errorCode":error.map(|e|e.code.as_str()),"message":error.map(|e|e.message.as_str()),"taskSent":false});
        s.operation.finish(if error.is_some(){"failed"}else{"completed"},result);
    }
    pub fn failure(&self,error:AccountError)->AccountError {
        let s=self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        AccountError::new(&error.code,format!("{} Preparation evidence: operationId={}; phase={}; step={}; elapsedMs={}; phaseElapsedMs={}; stepElapsedMs={}; taskSent=false; this failed preparation did not commit a new selection. No task was automatically retried.",error.message,s.operation.id(),s.phase,s.step,s.started.elapsed().as_millis(),s.phase_started.elapsed().as_millis(),s.step_started.elapsed().as_millis()))
    }
    pub fn snapshot(&self)->Value {
        let s=self.0.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        json!({"operationId":s.operation.id(),"phase":s.phase,"step":s.step,"phaseElapsedMs":s.phase_started.elapsed().as_millis(),"stepElapsedMs":s.step_started.elapsed().as_millis(),"progress":s.progress,"status":s.status,"elapsedMs":s.started.elapsed().as_millis(),"errorCode":s.error.as_ref().map(|e|&e.0),"cleanupConfirmed":s.cleanup,"taskSent":false})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn phase_and_failure_are_bounded_nonsecret_and_readable_without_registry(){
        let p=Preparation::start();p.phase("validate-settings",10);
        let e=p.failure(AccountError::new("ACCOUNT_TEST","Invalid profile"));p.finish(Some(&e));
        let s=p.snapshot();assert_eq!(s["status"],"failed");assert_eq!(s["phase"],"validate-settings");assert_eq!(s["taskSent"],false);
        assert!(e.message.contains("operationId="));assert!(e.message.contains("did not commit a new selection"));
    }
    #[tokio::test]
    async fn explicit_logout_cancellation_wakes_a_waiting_preparation(){
        let p=Preparation::start();let other=p.clone();let waiting=tokio::spawn(async move{other.cancelled().await;});p.cancel();
        tokio::time::timeout(std::time::Duration::from_millis(100),waiting).await.unwrap().unwrap();assert!(p.is_cancelled());
    }
    #[test]
    fn credential_substeps_remain_correlated_with_the_failed_method(){
        let p=Preparation::start();p.phase("credentials",35);p.step("credential-token-export",json!({"method":"getAuthStatus"}));
        assert!(p.remaining(std::time::Duration::from_secs(90))<=std::time::Duration::from_secs(90));
        assert_eq!(p.remaining(std::time::Duration::ZERO),std::time::Duration::ZERO);
        let error=p.failure(AccountError::new("ACCOUNT_BACKEND","Routing failed"));assert!(error.message.contains("step=credential-token-export"));assert!(error.message.contains("phaseElapsedMs="));assert_eq!(p.snapshot()["step"],"credential-token-export");
    }
    #[tokio::test]
    async fn timeout_cancels_work_instead_of_allowing_a_late_commit(){
        let committed=Arc::new(std::sync::atomic::AtomicBool::new(false));let marker=committed.clone();
        let result=bounded(std::time::Duration::from_millis(1),async move{
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            marker.store(true,std::sync::atomic::Ordering::SeqCst);Ok(())
        }).await;
        assert_eq!(result.unwrap_err().code,"ACCOUNT_PREPARE_TIMEOUT");
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        assert!(!committed.load(std::sync::atomic::Ordering::SeqCst));
        let p=Preparation::start();{let _guard=Guard(p.clone());p.phase("authenticate",65);}
        assert_eq!(p.snapshot()["status"],"failed");
        assert_eq!(p.snapshot()["errorCode"],"ACCOUNT_PREPARE_CANCELLED");
    }
    #[tokio::test]
    async fn delayed_scheduler_checks_deadline_before_ready_work(){
        let committed=Arc::new(std::sync::atomic::AtomicBool::new(false));let marker=committed.clone();
        let pending=bounded(std::time::Duration::from_millis(1),async move{
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            marker.store(true,std::sync::atomic::Ordering::SeqCst);Ok(())
        });
        tokio::pin!(pending);
        assert!(futures_util::poll!(&mut pending).is_pending());
        // Deliberately don't poll either branch until both timers have elapsed.
        tokio::time::sleep(std::time::Duration::from_millis(40)).await;
        assert_eq!(pending.await.unwrap_err().code,"ACCOUNT_PREPARE_TIMEOUT");
        assert!(!committed.load(std::sync::atomic::Ordering::SeqCst));
    }
    #[tokio::test]
    async fn zero_budget_never_polls_work_and_success_before_deadline_is_allowed(){
        let mut polled=false;
        let result=bounded(std::time::Duration::ZERO,async{polled=true;Ok(())}).await;
        assert_eq!(result.unwrap_err().code,"ACCOUNT_PREPARE_TIMEOUT");assert!(!polled);
        assert_eq!(bounded(std::time::Duration::from_secs(1),async{Ok(42)}).await.unwrap(),42);
    }
}
