//! Correlated cancellation also fences an operation whose request arrives late.
use super::{AccountError,Result,preparation::Preparation};
use std::{collections::HashMap,sync::Mutex,time::{Duration,Instant}};
#[derive(Default)]pub(super) struct Controls(Mutex<HashMap<String,(Instant,Option<Preparation>)>>);
impl Controls {
 fn key(owner:&str,id:&str)->String{format!("{owner}:{id}")}
 pub(super) fn admit(&self,owner:&str,id:&str,p:&Preparation)->Result<()> {
  let mut entries=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
  entries.retain(|_,(at,p)|at.elapsed()<Duration::from_secs(300)||p.as_ref().is_some_and(|p|p.snapshot()["status"]=="preparing"));
  let key=Self::key(owner,id);
  if entries.contains_key(&key){return Err(AccountError::new("ACCOUNT_PREPARE_CANCELLED","This account operation was already admitted or cancelled. No operation was replayed."));}
  if entries.len()>=128{return Err(AccountError::new("ACCOUNT_BUSY","The account operation admission limit was reached. No operation was started."));}
  entries.insert(key,(Instant::now(),Some(p.clone())));Ok(())
 }
 pub(super) fn cancel(&self,owner:&str,id:&str)->Result<bool>{
  let mut entries=self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
  entries.retain(|_,(at,p)|at.elapsed()<Duration::from_secs(300)||p.as_ref().is_some_and(|p|p.snapshot()["status"]=="preparing"));
  let key=Self::key(owner,id);if !entries.contains_key(&key)&&entries.len()>=128{return Err(AccountError::new("ACCOUNT_BUSY","The account cancellation fence limit was reached."));}
  let p=entries.insert(key,(Instant::now(),None)).and_then(|(_,p)|p);let pending=p.as_ref().is_some_and(|p|p.snapshot()["status"]=="preparing");if let Some(p)=p{p.cancel();}Ok(pending)
 }
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn cancellation_before_arrival_fences_only_the_exact_owner_and_operation(){let c=Controls::default();assert!(!c.cancel("a","one").unwrap());assert!(c.admit("a","one",&Preparation::start()).is_err());let p=Preparation::start();c.admit("b","one",&p).unwrap();assert!(!p.is_cancelled());c.admit("a","two",&Preparation::start()).unwrap();}
 #[test]fn cancelling_current_preparation_wakes_it_without_cancelling_a_new_identity(){let c=Controls::default();let p=Preparation::start();c.admit("a","one",&p).unwrap();assert!(c.cancel("a","one").unwrap());assert!(p.is_cancelled());let next=Preparation::start();c.admit("a","two",&next).unwrap();assert!(!next.is_cancelled());assert!(c.admit("a","one",&Preparation::start()).is_err());}
}
