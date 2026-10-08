//! Bounded diagnostic minimization at the native logging boundary.
use regex_automata::meta::Regex;
use serde_json::{Map, Value};
use std::sync::OnceLock;

fn substitute(text: &str, pattern: &Regex, replacement: impl Fn(&str) -> String) -> String {
    let mut result = String::new();
    let mut offset = 0;
    for matched in pattern.find_iter(text) {
        result.push_str(&text[offset..matched.start()]);
        result.push_str(&replacement(&text[matched.start()..matched.end()]));
        offset = matched.end();
    }
    result.push_str(&text[offset..]);
    result
}

pub fn text(input: &str) -> String {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| {
        [
            r#"\b[A-Za-z][A-Za-z0-9+.-]*://[^\s"'<>]+"#,
            r#"(?:\b[A-Za-z]:[\\/]|\\\\|/(?:Users|home|tmp|var|etc|opt|mnt)/|~/)[^\r\n"'<>]*"#,
            r"(?i)\b(?:Bearer\s+\S+|(?:authorization|password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|cookie)\s*[:=]\s*[^,;\r\n]+)",
            r"\bsk-[A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
            r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        ].iter().map(|pattern| Regex::new(pattern).expect("static diagnostic pattern")).collect()
    });
    let mut result: String = input.chars().take(8000).collect();
    result = substitute(&result, &patterns[0], |raw| {
        if let Ok(url) = url::Url::parse(raw)
            && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
            && url.username().is_empty()
            && url.password().is_none()
            && matches!(url.path(), "/json/list" | "/json/version" | "/")
        {
            return format!("{}{}", url.origin().ascii_serialization(), url.path());
        }
        "[url]".into()
    });
    for (pattern, marker) in
        patterns[1..]
            .iter()
            .zip(["[path]", "[credential]", "[credential]", "[email]"])
    {
        result = substitute(&result, pattern, |_| marker.into());
    }
    let mut result: String = result.chars().take(4000).collect();
    if input.chars().count() > 8000 {
        result.push_str(" [truncated]");
    }
    result
}

fn private_key(key: &str) -> bool {
    let key: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    [
        "token",
        "cookie",
        "password",
        "secret",
        "credential",
        "authorization",
        "apikey",
    ]
    .iter()
    .any(|s| key.contains(s))
        || ["path", "url", "uri"].iter().any(|s| key.ends_with(s))
        || matches!(
            key.as_str(),
            "content"
                | "text"
                | "body"
                | "prompt"
                | "messages"
                | "title"
                | "filename"
                | "name"
                | "raw"
                | "data"
                | "database64"
                | "commandline"
                | "sessionid"
                | "accountid"
                | "threadid"
                | "projectid"
        )
}

pub fn value(input: Value) -> Value {
    fn visit(input: Value, depth: usize, budget: &mut usize) -> Value {
        if *budget == 0 || depth > 6 {
            return Value::String("[truncated]".into());
        }
        *budget -= 1;
        match input {
            Value::String(s) => Value::String(text(&s)),
            Value::Array(items) => Value::Array(
                items
                    .into_iter()
                    .take(128)
                    .map(|item| visit(item, depth + 1, budget))
                    .collect(),
            ),
            Value::Object(fields) => {
                let mut result = Map::new();
                for (key, field) in fields.into_iter().take(128) {
                    let sanitized = if private_key(&key) {
                        Value::String("[redacted]".into())
                    } else {
                        visit(field, depth + 1, budget)
                    };
                    result.insert(text(&key).chars().take(160).collect(), sanitized);
                }
                Value::Object(result)
            }
            primitive => primitive,
        }
    }
    visit(input, 0, &mut 256)
}

pub fn document(input: &str) -> String {
    // Old runs remain on disk unchanged, but reading/copying/exporting never
    // bypasses the current policy. Malformed lines cannot fall back to raw text.
    input
        .lines()
        .map(|line| match serde_json::from_str::<Value>(line) {
            Ok(parsed) => format!("{}\n", value(parsed)),
            Err(_) => "{\"redactionFailed\":true,\"reason\":\"invalid log line omitted\"}\n".into(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn nested_sentinels_removed_without_losing_diagnostics() {
        let input = json!({"code":"CC-START-CDP-014","port":7613,"elapsedMs":134185,"nested":[{"apiToken":"SENTINEL_TOKEN","content":"SENTINEL_CHAT","workspacePath":"C:\\Users\\SENTINEL_USER\\private"}],"reason":"EIO at C:\\Users\\SENTINEL_PATH\\file.txt","action":"https://user:pass@example.test/private?secret=SENTINEL_QUERY","outcome":"Bearer SENTINEL_AUTH"});
        let result = value(input);
        assert!(!result.to_string().contains("SENTINEL"));
        assert_eq!(result["code"], "CC-START-CDP-014");
        assert_eq!(result["port"], 7613);
        assert_eq!(result["elapsedMs"], 134185);
        assert_eq!(
            text("http://127.0.0.1:7613/json/list?token=hidden#secret"),
            "http://127.0.0.1:7613/json/list"
        );
    }
    #[test]
    fn paths_credentials_and_old_documents_do_not_leak() {
        for raw in [
            r"\\server\SENTINEL_SHARE\file",
            "/home/SENTINEL_UNIX/file",
            "Bearer SENTINEL_AUTH",
            "token=SENTINEL_KEY",
            "sk-SENTINEL_123456",
            "SENTINEL@example.test",
        ] {
            assert!(!text(raw).contains("SENTINEL"), "{raw}");
        }
        let old = document(
            "{\"message\":\"failed at C:\\\\Users\\\\SENTINEL\\\\file\",\"code\":\"EIO\"}\nmalformed SENTINEL\n",
        );
        assert!(!old.contains("SENTINEL"));
        assert!(old.contains("EIO"));
        assert!(old.contains("redactionFailed"));
        let mut nested = json!("SENTINEL");
        for _ in 0..20 {
            nested = json!({"child":nested});
        }
        assert!(value(nested).to_string().contains("truncated"));
    }
}
