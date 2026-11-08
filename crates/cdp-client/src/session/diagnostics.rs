//! Metadata for qualified Bridge transport. Does not alter delivery or retry requests.
use serde_json::{Value,json};
use std::time::{Duration,Instant};

pub(super) struct Trace {
    start:Instant,
    stage:&'static str,
    details:Value,
    finished:bool,
}
impl Trace {
    pub fn new(id:&str,method:&str,epoch:u64)->Option<Self> {
        if !matches!(method,"explorer.accounts.request"|"explorer.language.get"|"explorer.plugins.status"|"explorer.login.startup.get"|"explorer.host.updates.status") {return None;}
        let reference=if id.starts_with("cle-")&&id.len()<80&&id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){id}else{"withheld"};
        Some(Self{start:Instant::now(),stage:"dispatch-admitted",details:json!({"requestRef":reference,"method":method,"documentEpoch":epoch,"payloadWithheld":true,"taskReplayed":false}),finished:false})
    }
    pub fn phase(&mut self,stage:&'static str) {
        self.stage=stage;
        self.details[stage]=json!(self.start.elapsed().as_millis());
    }
    pub fn elapsed(&self)->Duration {self.start.elapsed()}
    pub fn handler_result(&mut self,success:bool) {self.details["handlerSucceeded"]=json!(success);}
    pub fn qualification_wait(mut self,count:usize) {self.phase("document-qualification");self.details["pendingCount"]=json!(count);self.finished=true;self.emit("deferred");}
    pub fn finish(&mut self,stage:&'static str,failed:bool) {
        if self.finished {return;}
        self.phase(stage);self.finished=true;
        if failed||self.elapsed()>=Duration::from_millis(500) {self.emit(if failed{"observation-failed"}else{"observed"});}
    }
    fn emit(&self,outcome:&str) {
        let mut details=self.details.clone();details["stage"]=json!(self.stage);details["durationMs"]=json!(self.start.elapsed().as_millis());
        details["rendererConsumptionConfirmed"]=json!(false);
        if let Some(observer)=super::DIAGNOSTIC_OBSERVER.get() {observer("cdp-transport","bridge.delivery",outcome,details);}
    }
}
impl Drop for Trace {
    fn drop(&mut self) {if !self.finished {self.emit("interrupted");}}
}

/// Diagnostic-only bounded acknowledgement table. Expiration never resends/cancels work.
#[derive(Default)]
pub(super) struct Acks(std::collections::BTreeMap<u64,(Instant,Trace)>);
impl Acks {
    pub fn insert(&mut self,id:u64,mut trace:Trace) {
        if self.0.len()>=256 {if let Some((_,(_,mut old)))=self.0.pop_first(){old.finish("ack-capacity",true);}}
        trace.phase("cdp-write-complete");self.0.insert(id,(Instant::now(),trace));
    }
    pub fn observe(&mut self,message:&Value)->bool {
        let Some(id)=message["id"].as_u64() else{return false;};
        let Some((_,mut trace))=self.0.remove(&id) else{return false;};
        let failed=message.get("error").is_some()||!message["result"].is_object()||message["result"].get("exceptionDetails").is_some();
        trace.finish(if failed{"evaluation-rejected"}else{"evaluation-acknowledged"},failed);true
    }
    pub fn expire(&mut self) {
        let ids:Vec<_>=self.0.iter().filter(|(_, (at,_))|at.elapsed()>=Duration::from_secs(15)).map(|(id,_)|*id).collect();
        for id in ids {if let Some((_,mut t))=self.0.remove(&id){t.finish("evaluation-ack-deadline",true);}}
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn only_fixed_methods_and_safe_references_are_retained() {
        assert!(Trace::new("cle-1","private.method",1).is_none());
        let t=Trace::new("private-secret","explorer.language.get",3).unwrap();
        assert!(!t.details.to_string().contains("private"));assert_eq!(t.details["requestRef"],"withheld");
    }
    #[test] fn bounded_ack_records_distinguish_rejection_ack_and_expiry() {
        let mut a=Acks::default();
        for id in 0..300 {a.insert(id,Trace::new("cle-fixture","explorer.accounts.request",1).unwrap());}
        assert_eq!(a.0.len(),256);
        assert!(a.observe(&json!({"id":299,"result":{"exceptionDetails":{"text":"private secret"}}})));
        assert!(a.observe(&json!({"id":298,"result":{"result":{"type":"undefined"}}})));
        assert!(!a.observe(&json!({"id":0})));
        for (at,_) in a.0.values_mut(){*at=Instant::now()-Duration::from_secs(16);}
        a.expire();assert!(a.0.is_empty());
    }
    #[test] fn slow_handler_does_not_expire_a_new_delivery_ack() {
        let mut t=Trace::new("cle-fixture","explorer.accounts.request",1).unwrap();
        t.start=Instant::now()-Duration::from_secs(60);t.phase("handler-entered");t.handler_result(true);t.phase("handler-completed");
        assert_eq!(t.details["handlerSucceeded"],true);
        let mut a=Acks::default();a.insert(1,t);a.expire();assert_eq!(a.0.len(),1);
        assert!(a.observe(&json!({"id":1,"result":{}})));
    }
}
