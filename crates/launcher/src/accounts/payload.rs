//! Bounded transfer over the existing 96 KiB Bridge frame limit.
use super::{AccountError, Result};
use base64::Engine;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
const MAX: usize = 4 * 1024 * 1024;
struct Upload {
    owner: String,
    epoch: u64,
    size: usize,
    sha: String,
    bytes: Vec<u8>,
    next: u64,
    created: Instant,
}
#[derive(Default)]
pub struct Payloads(Mutex<HashMap<String, Upload>>);
pub enum Decoded {
    Request(Value),
    Response(Value),
}
impl Payloads {
    pub fn accept(&self, owner: &str, epoch: u64, p: &Value) -> Result<Decoded> {
        let action = p["action"]
            .as_str()
            .ok_or_else(|| AccountError::protocol("Missing payload action."))?;
        let allowed: &[&str] = match action {
            "payload.start" => &["size", "sha256"],
            "payload.chunk" => &["id", "index", "data"],
            "payload.commit" | "payload.cancel" => &["id"],
            _ => return Err(AccountError::protocol("Unknown payload action.")),
        };
        if p["owner"] != owner
            || !p.as_object().is_some_and(|v| {
                v.keys()
                    .all(|k| k == "action" || k == "owner" || allowed.contains(&k.as_str()))
            })
        {
            return Err(AccountError::protocol("Invalid owner or payload fields."));
        }
        let mut all = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        all.retain(|_, u| u.created.elapsed() < Duration::from_secs(180));
        if action == "payload.start" {
            let size = p["size"]
                .as_u64()
                .filter(|n| *n > 0 && *n <= MAX as u64)
                .ok_or_else(|| {
                    AccountError::protocol("The account payload exceeds its transfer budget.")
                })? as usize;
            let sha = p["sha256"]
                .as_str()
                .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
                .ok_or_else(|| AccountError::protocol("Invalid account payload digest."))?;
            if all.len() >= 4 {
                return Err(AccountError::new(
                    "ACCOUNT_BUSY",
                    "Too many account payload transfers are pending.",
                ));
            }
            let id = super::nonce();
            all.insert(
                id.clone(),
                Upload {
                    owner: owner.into(),
                    epoch,
                    size,
                    sha: sha.into(),
                    bytes: Vec::new(),
                    next: 0,
                    created: Instant::now(),
                },
            );
            return Ok(Decoded::Response(json!({"id":id})));
        }
        let id = p["id"]
            .as_str()
            .ok_or_else(|| AccountError::protocol("Missing account payload ID."))?;
        let u = all.get_mut(id).ok_or_else(|| {
            AccountError::new(
                "ACCOUNT_PAYLOAD_EXPIRED",
                "The account payload transfer is unavailable or expired.",
            )
        })?;
        if u.owner != owner || u.epoch != epoch {
            return Err(AccountError::new(
                "ACCOUNT_STALE_SESSION",
                "The account payload belongs to another document or owner.",
            ));
        }
        if action == "payload.cancel" {
            all.remove(id);
            return Ok(Decoded::Response(json!({"cancelled":true})));
        }
        if action == "payload.chunk" {
            if p["index"].as_u64() != Some(u.next) {
                return Err(AccountError::protocol(
                    "Account payload chunks must arrive in sequence.",
                ));
            }
            let text = p["data"]
                .as_str()
                .filter(|s| s.len() <= 32768)
                .ok_or_else(|| {
                    AccountError::protocol("Account payload chunk exceeds its frame budget.")
                })?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(text)
                .map_err(|_| AccountError::protocol("Invalid account payload chunk."))?;
            if bytes.is_empty() || u.bytes.len() + bytes.len() > u.size {
                return Err(AccountError::protocol(
                    "Account payload length exceeds its declaration.",
                ));
            }
            u.bytes.extend_from_slice(&bytes);
            u.next += 1;
            return Ok(Decoded::Response(json!({"accepted":u.next})));
        }
        let u = all
            .remove(id)
            .ok_or_else(|| AccountError::protocol("Account payload disappeared."))?;
        if u.bytes.len() != u.size || format!("{:x}", Sha256::digest(&u.bytes)) != u.sha {
            return Err(AccountError::protocol(
                "Account payload size or digest did not match.",
            ));
        }
        let request: Value = serde_json::from_slice(&u.bytes).map_err(|_| {
            AccountError::protocol("The completed account payload is invalid JSON.")
        })?;
        if request["owner"] != owner || request["action"] != "shared.rpc" {
            return Err(AccountError::protocol(
                "Only a bounded shared-executor request may use chunk transfer.",
            ));
        }
        Ok(Decoded::Request(request))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn start(p: &Payloads, bytes: &[u8]) -> String {
        let Decoded::Response(v)=p.accept("owner",1,&json!({"action":"payload.start","owner":"owner","size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})).unwrap()else{panic!()};
        v["id"].as_str().unwrap().into()
    }
    #[test]
    fn large_unicode_payload_roundtrip_and_replay_rejected() {
        let p = Payloads::default();
        let v = json!({"action":"shared.rpc","owner":"owner","conversationId":"test-thread","method":"turn/start","params":{"input":[{"type":"text","text":"中文".repeat(30000)}]}});
        let bytes = serde_json::to_vec(&v).unwrap();
        let id = start(&p, &bytes);
        for (index, chunk) in bytes.chunks(24000).enumerate() {
            p.accept("owner",1,&json!({"action":"payload.chunk","owner":"owner","id":id,"index":index,"data":base64::engine::general_purpose::STANDARD.encode(chunk)})).unwrap();
        }
        let commit = json!({"action":"payload.commit","owner":"owner","id":id});
        let Decoded::Request(actual) = p.accept("owner", 1, &commit).unwrap() else {
            panic!()
        };
        assert_eq!(actual, v);
        assert!(p.accept("owner", 1, &commit).is_err());
    }
    #[test]
    fn wrong_owner_epoch_order_size_and_fields_rejected() {
        let p = Payloads::default();
        let id = start(&p, b"{}");
        let chunk =
            json!({"action":"payload.chunk","owner":"owner","id":id,"index":1,"data":"e30="});
        assert!(p.accept("owner", 1, &chunk).is_err());
        assert!(p.accept("other", 1, &chunk).is_err());
        assert!(p.accept("owner", 2, &chunk).is_err());
        assert!(p.accept("owner",1,&json!({"action":"payload.start","owner":"owner","size":MAX+1,"sha256":"a".repeat(64)})).is_err());
        assert!(
            p.accept(
                "owner",
                1,
                &json!({"action":"payload.cancel","owner":"owner","id":id,"command":"evil"})
            )
            .is_err()
        );
        assert!(
            p.accept(
                "owner",
                1,
                &json!({"action":"payload.commit","owner":"owner","id":id})
            )
            .is_err()
        );
    }
}
