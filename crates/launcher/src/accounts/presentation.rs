//! Non-secret, owner-scoped account presentation. Never changes routing or credentials.
use super::{AccountError,Connection,Result};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::path::Path;
#[derive(Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct State {#[serde(default)] order:Vec<String>,#[serde(default)] required:Vec<String>}
fn path(root:&Path)->std::path::PathBuf{root.join("connection-presentation.json")}
fn read(root:&Path)->Result<State>{
 if !path(root).exists(){return Ok(State::default())}
 let v=crate::renderer_storage::read_json(&path(root),8192).map_err(|_|AccountError::protocol("Account presentation could not be read."))?;
 let s:State=serde_json::from_value(v).map_err(|_|AccountError::protocol("Account presentation has an invalid schema."))?;
 for ids in [&s.order,&s.required]{let mut seen=std::collections::HashSet::new();if ids.len()>16||ids.iter().any(|id|!super::valid_id(id)||!seen.insert(id)){return Err(AccountError::protocol("Account presentation identifiers failed validation."))}}
 Ok(s)
}
fn write(root:&Path,s:&State)->Result<()>{crate::renderer_storage::atomic(&path(root),&json!(s)).map_err(|_|AccountError::new("ACCOUNT_PRESENTATION_STORAGE","Account presentation could not be saved. No account selection was changed."))}
pub(super) fn reauthorization_required(root:&Path,id:&str)->Result<bool>{Ok(read(root)?.required.iter().any(|v|v==id))}
pub(super) fn reorder(root:&Path,connections:&[Connection],value:&Value)->Result<Value>{
 let ids:Vec<String>=serde_json::from_value(value.clone()).map_err(|_|AccountError::protocol("Account order must be an array of connection identifiers."))?;
 let mut seen=std::collections::HashSet::new();
 if ids.len()!=connections.len()||ids.len()>16||ids.iter().any(|id|!seen.insert(id)||!connections.iter().any(|c|&c.id==id)){return Err(AccountError::new("ACCOUNT_ORDER_STALE","The account list changed. Refresh it before reordering. No account selection was changed."))}
 let mut s=read(root)?;s.order=ids.clone();write(root,&s)?;Ok(json!({"order":ids}))
}
pub(super) fn observe(root:&Path,id:&str,observed:&Result<Value>,expected:Option<&str>,connections:&[Connection])->Result<()> {
 let status=match observed {Ok(v)=>super::identity::check(v,expected),Err(e)=>Err(e.clone())};
 // A never-authorized connection cannot have an expired verified identity.
 // Keep it available for its first login rather than marking it revoked.
 let known_identity=connections.iter().any(|c|c.id==id&&c.api.is_none()&&c.email.as_deref().is_some_and(|e|!e.trim().is_empty()));
 let required=match status {Ok(())=>false,Err(e)if e.code=="ACCOUNT_AUTH_REQUIRED"=>known_identity,_=>return Ok(())};
 let mut s=read(root)?;let before=s.required.clone();s.required.retain(|v|v!=id&&connections.iter().any(|c|&c.id==v));if required{s.required.push(id.into());}if s.required!=before{write(root,&s)?;}Ok(())
}
pub(super) fn connections(root:&Path,connections:&[Connection])->Result<Vec<Value>>{
 let s=read(root)?;let mut rows:Vec<_>=connections.iter().enumerate().collect();
 rows.sort_by_key(|(index,c)|s.order.iter().position(|v|v==&c.id).unwrap_or(s.order.len()+index));
 Ok(rows.into_iter().map(|(_,c)|{let mut v=json!(c);v["reauthorizationRequired"]=json!(c.api.is_none()&&c.email.as_deref().is_some_and(|e|!e.trim().is_empty())&&s.required.contains(&c.id));v}).collect())
}
#[cfg(test)]mod tests{
 use super::*;
 fn connection(id:char)->Connection{Connection{id:id.to_string().repeat(32),label:"fixture".into(),email:Some("expected@example.invalid".into()),plan:Some("plus".into()),api:None}}
 #[test]fn order_is_an_exact_permutation_and_never_changes_connection_identity(){let d=tempfile::tempdir().unwrap();let rows=vec![connection('b'),connection('c'),connection('d')];let ids:Vec<_>=rows.iter().rev().map(|c|c.id.clone()).collect();reorder(d.path(),&rows,&json!(ids)).unwrap();assert_eq!(connections(d.path(),&rows).unwrap()[0]["id"],rows[2].id);for bad in[json!([rows[0].id]),json!([rows[0].id,rows[0].id,rows[2].id]),json!([rows[0].id,rows[1].id,"host"])]{assert!(reorder(d.path(),&rows,&bad).is_err());}assert_eq!(connections(d.path(),&rows).unwrap()[0]["id"],rows[2].id);}
 #[test]fn only_confirmed_auth_required_marks_a_card_and_valid_identity_clears_it(){let d=tempfile::tempdir().unwrap();let rows=vec![connection('b')];let id=&rows[0].id;for code in["ACCOUNT_OUTCOME_UNKNOWN","ACCOUNT_BACKEND_HEALTH_BACKOFF","ACCOUNT_IDENTITY_UNAVAILABLE"]{observe(d.path(),id,&Err(AccountError::new(code,"fixture")),Some("expected@example.invalid"),&rows).unwrap();assert_eq!(connections(d.path(),&rows).unwrap()[0]["reauthorizationRequired"],false);}observe(d.path(),id,&Ok(json!({"account":null})),Some("expected@example.invalid"),&rows).unwrap();assert_eq!(connections(d.path(),&rows).unwrap()[0]["reauthorizationRequired"],true);observe(d.path(),id,&Ok(json!({"account":{"type":"chatgpt","email":"expected@example.invalid"}})),Some("expected@example.invalid"),&rows).unwrap();assert_eq!(connections(d.path(),&rows).unwrap()[0]["reauthorizationRequired"],false);}
}
