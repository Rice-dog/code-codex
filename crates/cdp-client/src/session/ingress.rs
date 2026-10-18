use std::collections::VecDeque;

use crate::{MAX_BINDING_PAYLOAD_BYTES, MAX_IN_FLIGHT_REQUESTS};

/// Unprocessed ingress owned by one context probe. Dropping the probe on
/// navigation, destruction, rejection or timeout drops every buffered request.
pub(super) struct ContextIngress(VecDeque<String>);

impl ContextIngress {
    pub(super) fn with_first(payload: &str) -> Option<Self> {
        let mut pending = Self(VecDeque::new());
        pending.push(payload).then_some(pending)
    }

    pub(super) fn push(&mut self, payload: &str) -> bool {
        if payload.len() > MAX_BINDING_PAYLOAD_BYTES || self.0.len() >= MAX_IN_FLIGHT_REQUESTS {
            return false;
        }
        self.0.push_back(payload.to_owned());
        true
    }

    pub(super) fn into_payloads(self) -> VecDeque<String> {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffered_ingress_is_fifo_and_strictly_count_and_byte_bounded() {
        assert!(ContextIngress::with_first(&"x".repeat(MAX_BINDING_PAYLOAD_BYTES + 1)).is_none());
        let mut pending = ContextIngress::with_first("first").unwrap();
        assert!(!pending.push(&"x".repeat(MAX_BINDING_PAYLOAD_BYTES + 1)));
        for index in 1..MAX_IN_FLIGHT_REQUESTS {
            assert!(pending.push(&index.to_string()));
        }
        assert!(!pending.push("overflow"));
        let values = pending.into_payloads();
        assert_eq!(values.len(), MAX_IN_FLIGHT_REQUESTS);
        assert_eq!(values.front().unwrap(), "first");
        assert_eq!(
            values.back().unwrap(),
            &(MAX_IN_FLIGHT_REQUESTS - 1).to_string()
        );
    }
}
