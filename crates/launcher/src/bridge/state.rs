use std::io::Write as _;

use std::sync::{Mutex as StdMutex, MutexGuard};

use cdp_client::BridgeError;

use serde_json::Value;

pub(super) fn lock_unpoisoned<T>(mutex: &StdMutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub(super) fn read_unpoisoned<T>(lock: &std::sync::RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub(super) fn write_unpoisoned<T>(
    lock: &std::sync::RwLock<T>,
) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub(super) fn require_empty_object(value: &Value) -> Result<(), BridgeError> {
    if value.as_object().is_some_and(serde_json::Map::is_empty) || value.is_null() {
        Ok(())
    } else {
        Err(BridgeError::invalid_request())
    }
}

pub(super) fn valid_content_version(version: &str) -> bool {
    version.len() == 64
        && version
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
