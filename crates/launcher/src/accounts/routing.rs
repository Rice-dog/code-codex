//! Exact official routing failures, distinct from login/permission/transport failures.
pub(super) fn reason(message: &str) -> Option<&'static str> {
    match message {
        "workspace routing discovery failed" => Some("workspace-routing-discovery-failed"),
        "workspace routing discovery timed out" => Some("workspace-routing-discovery-timeout"),
        "Workspace routing is unavailable" => Some("workspace-routing-unavailable"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn known_routing_failures_are_distinct() {
        for (message, reason) in [
            ("workspace routing discovery failed", "workspace-routing-discovery-failed"),
            ("workspace routing discovery timed out", "workspace-routing-discovery-timeout"),
            ("Workspace routing is unavailable", "workspace-routing-unavailable"),
        ] { assert_eq!(super::reason(message), Some(reason)); }
    }
    #[test]
    fn unknown_auth_permission_and_message_lookalikes_are_not_routing() {
        for message in ["Invalid authentication", "Permission denied", "workspace routing discovery failed: secret", "request timed out", "ACCOUNT_TURN_ACTIVE", ""] {
            assert_eq!(super::reason(message), None);
        }
    }
}
