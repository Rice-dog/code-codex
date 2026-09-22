use serde::{Deserialize, Serialize};

pub const DIAGNOSTIC_PREFIX: &str = "CODE_CODEX_STARTUP_DIAGNOSTIC=";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupDiagnostic {
    pub schema_version: u8,
    pub code: String,
    pub stage: String,
    pub summary: String,
    pub reason: String,
    pub guidance: String,
}

impl StartupDiagnostic {
    pub fn new(
        code: &str,
        stage: &str,
        summary: &str,
        reason: impl Into<String>,
        guidance: &str,
    ) -> Self {
        Self {
            schema_version: 1,
            code: code.to_owned(),
            stage: stage.to_owned(),
            summary: summary.to_owned(),
            reason: reason.into(),
            guidance: guidance.to_owned(),
        }
    }

    #[allow(dead_code)]
    pub fn encoded_line(&self) -> Option<String> {
        serde_json::to_string(self)
            .ok()
            .map(|json| format!("{DIAGNOSTIC_PREFIX}{json}"))
    }
}

#[allow(dead_code)]
pub fn parse_diagnostic(output: &str) -> Option<StartupDiagnostic> {
    output.lines().rev().find_map(|line| {
        let payload = line.trim().strip_prefix(DIAGNOSTIC_PREFIX)?;
        serde_json::from_str(payload).ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_round_trips_through_stderr_marker() {
        let diagnostic = StartupDiagnostic::new(
            "CC-START-APP-003",
            "Starting App Server",
            "The App Server did not respond",
            "App Server request timed out",
            "Restart Codex and try again.",
        );
        let output = format!(
            "INFO starting\n{}\nerror: App Server request timed out\n",
            diagnostic.encoded_line().expect("encoded diagnostic")
        );
        assert_eq!(parse_diagnostic(&output), Some(diagnostic));
    }

    #[test]
    fn malformed_marker_is_ignored() {
        assert!(parse_diagnostic("CODE_CODEX_STARTUP_DIAGNOSTIC={bad json}").is_none());
    }
}
