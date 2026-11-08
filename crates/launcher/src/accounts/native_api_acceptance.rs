//! Explicit end-to-end acceptance using the installed Codex backend and saved API.
//! Runs only a synthetic task in a temporary workspace and never logs credentials.
use super::super::{api, relay, retention};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, sync::atomic::Ordering, time::Duration};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[cfg(windows)]
#[tokio::test]
#[ignore = "Explicit saved API credential and installed native backend; temporary files only"]
async fn real_native_api_creates_and_reads_files_across_two_turns() { native_acceptance(false).await; }

#[cfg(windows)]
#[tokio::test]
#[ignore = "Explicit real official and API roundtrip in a temporary workspace"]
async fn real_native_official_api_official_retains_task_progress() { native_acceptance(true).await; }

#[cfg(windows)]
async fn native_acceptance(roundtrip: bool) {
    let registry_path = PathBuf::from(std::env::var_os("CODE_CODEX_CONTEXT_API_REGISTRY").expect("Explicit registry path"));
    let registry: Value = serde_json::from_slice(&std::fs::read(&registry_path).unwrap()).unwrap();
    let connection = registry["connections"].as_array().unwrap().iter()
        .find(|entry| entry["api"]["baseUrl"].as_str().is_some_and(|url| url.starts_with("https://agentrouter.org"))).unwrap();
    let id = connection["id"].as_str().unwrap();
    let key = api::read(&retention::home(registry_path.parent().unwrap(), id).unwrap()).unwrap();
    let model = connection["api"]["model"].as_str().unwrap();
    let settings = api::Settings::parse(connection["api"]["baseUrl"].as_str().unwrap(), model).unwrap();
    let api_credential = relay::Route::prepare_api("api".into(), settings, key).unwrap();
    let official_credential = if roundtrip {
        use base64::Engine;
        let auth_path = super::super::credentials::official_home().unwrap().join("auth.json");
        let auth: Value = serde_json::from_slice(&std::fs::read(auth_path).unwrap()).unwrap();
        let token = auth["tokens"]["id_token"].as_str().unwrap();
        let claims: Value = serde_json::from_slice(&base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(token.split('.').nth(1).unwrap()).unwrap()).unwrap();
        let email = claims["email"].as_str().or_else(|| claims["https://api.openai.com/profile"]["email"].as_str()).unwrap();
        Some(relay::Route::prepare_official(email.into()).unwrap())
    } else { None };
    let initial_credential = official_credential.as_ref().unwrap_or(&api_credential).clone();
    let route = relay::Route::start("acceptance".into(), "draft-acceptance".into(), initial_credential).await.unwrap();
    let home = tempfile::tempdir().unwrap();
    let workspace = home.path().join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let marker = format!("NATIVE_{}", super::super::nonce());
    std::fs::write(workspace.join("acceptance.md"), &marker).unwrap();
    let exe = std::env::var_os("CODE_CODEX_NATIVE_HTTP_PROBE").expect("Explicit backend path");
    let mut command = tokio::process::Command::new(exe);
    command.env_clear();
    for name in ["SYSTEMROOT","WINDIR","PATH","PATHEXT","TEMP","TMP","COMSPEC","USERPROFILE","APPDATA","LOCALAPPDATA","SYSTEMDRIVE"] {
        if let Some(value) = std::env::var_os(name) { command.env(name, value); }
    }
    let mut child = command.args(["app-server", "--listen", "stdio://", "-c", "analytics.enabled=false"])
        .env("CODEX_HOME", home.path()).env("CODEX_SQLITE_HOME", home.path().join("sqlite"))
        .env("OPENAI_API_KEY", "local-carrier-fixture-only")
        .current_dir(&workspace).stdin(Stdio::piped()).stdout(Stdio::piped())
        .stderr(Stdio::null()).kill_on_drop(true).spawn().unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    async fn rpc(
        input: &mut tokio::process::ChildStdin,
        lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
        id: u32, method: &str, params: Value,
    ) -> Value {
        input.write_all(format!("{}\n", json!({"id":id,"method":method,"params":params})).as_bytes()).await.unwrap();
        loop {
            let line = tokio::time::timeout(Duration::from_secs(20), lines.next_line()).await.unwrap().unwrap().expect("Native backend exited");
            let value: Value = serde_json::from_str(&line).unwrap();
            if value["id"] == id {
                assert!(value.get("error").is_none(), "Native RPC rejected the acceptance stage");
                return value["result"].clone();
            }
        }
    }
    rpc(&mut input, &mut lines, 1, "initialize", json!({"clientInfo":{"name":"codex_cli_rs","version":"1"},"capabilities":{"experimentalApi":true}})).await;
    input.write_all(b"{\"method\":\"initialized\"}\n").await.unwrap();
    let initial_model = if roundtrip { "gpt-6.1-sol" } else { model };
    let mut config = super::super::draft::configuration(&route.base_url, route.api_settings().as_ref());
    config["model_reasoning_effort"] = json!("low");
    let started = rpc(&mut input, &mut lines, 2, "thread/start", json!({
        "cwd":workspace,"approvalPolicy":"never","sandbox":"danger-full-access",
        "modelProvider":"openai","model":initial_model,"config":config
    })).await;
    let thread = started["thread"]["id"].as_str().unwrap();
    route.bind_thread(thread.into()).unwrap();
    let archive_path = PathBuf::from(started["thread"]["path"].as_str().unwrap());
    if !roundtrip {
        route.set_new_handoff(home.path().into(), archive_path.clone(), home.path().into());
    }
    route.ready.store(true, Ordering::Release);
    let seed = format!("OFFICIAL_SEED_{}", super::super::nonce());
    let mut prompts = Vec::new();
    if roundtrip {
        prompts.push(format!("Remember the exact seed token {seed} for this synthetic task. Reply only with it. No tools needed yet."));
    }
    prompts.extend([
        "Synthetic acceptance in the current temporary workspace only. Use the native tools to list files, read acceptance.md, then create result.txt containing exactly the marker you read. Run a command to read result.txt back. Return only that marker after verifying the command output. Do not ask to upload files.",
        "Continue the same task using native local tools. Read result.txt and create second.txt with the same marker. Run a command to read second.txt back. Return only the marker. Keep all work inside the current workspace.",
    ].into_iter().map(str::to_owned));
    if roundtrip {
        prompts.pop();
        prompts[1].push_str(" Also recall the exact OFFICIAL_SEED token from the previous official turn and write it to inherited.txt.");
        prompts.push("Use native local tools to read result.txt and inherited.txt from this temporary workspace. Return both exact tokens and nothing else.".into());
    }
    for (stage, prompt) in prompts.iter().enumerate() {
        let started_at = std::time::Instant::now();
        if roundtrip && matches!(stage, 1 | 2) {
            let api = stage == 1;
            let handoff = super::super::context_handoff::Handoff::for_route(home.path().into(), archive_path.clone(), thread.into(), home.path(), api).unwrap();
            handoff.commit().unwrap();
            route.commit_credential(if api { api_credential.clone() } else { relay::Route::prepare_official(official_credential.as_ref().unwrap().email.clone()).unwrap() });
            route.set_handoff(handoff);
        }
        let current_model = if roundtrip && matches!(stage, 0 | 2) { initial_model } else { model };
        rpc(&mut input, &mut lines, stage as u32 + 3, "turn/start", json!({"threadId":thread,"model":current_model,"input":[{"type":"text","text":prompt}]})).await;
        let (completed, output) = tokio::time::timeout(Duration::from_secs(240), async {
            let mut output = String::new();
            loop {
                let value: Value = serde_json::from_str(&lines.next_line().await.unwrap().expect("Backend exited")).unwrap();
                if value["method"] == "item/agentMessage/delta" {
                    output.push_str(value["params"]["delta"].as_str().unwrap_or(""));
                }
                if value["method"] == "turn/completed" {
                    let native_error = value["params"]["turn"]["error"]["message"].as_str().unwrap_or("");
                    let safe_error = native_error.split_whitespace().map(|word| if word.contains("://") { "[url]" } else { word }).collect::<Vec<_>>().join(" ");
                    println!("{}", json!({"nativeTurnErrorKind":value["params"]["turn"]["error"]["codexErrorInfo"],"nativeError":safe_error.chars().take(800).collect::<String>()}));
                    return (value["params"]["turn"]["status"] == "completed", output);
                }
            }
        }).await.expect("Native acceptance turn timed out");
        let api_stage = if roundtrip { stage.saturating_sub(1) } else { stage };
        let file = workspace.join(if roundtrip || api_stage == 0 { "result.txt" } else { "second.txt" });
        let matched = if roundtrip && stage == 0 {
            output.contains(&seed)
        } else {
            std::fs::read_to_string(file).is_ok_and(|text| text.trim().trim_start_matches('\u{feff}') == marker)
        };
        let inherited = if roundtrip && stage >= 1 {
            std::fs::read_to_string(workspace.join("inherited.txt")).is_ok_and(|text| text.trim().trim_start_matches('\u{feff}') == seed)
        } else { true };
        let reply_matches = if roundtrip && stage == 0 { output.contains(&seed) } else { output.contains(&marker) };
        let roundtrip_matches = !roundtrip || stage != 2 || output.contains(&seed);
        println!("{}", json!({"stage":stage,"nativeTurnCompleted":completed,"actualFileMatches":matched,"replyMatches":reply_matches,"inheritedOfficialSeed":inherited,"roundtripMatches":roundtrip_matches,"officialRoundtrip":roundtrip,"elapsedMs":started_at.elapsed().as_millis(),"mode":"real-native-backend-real-api","rawContentLogged":false,"relayFailure":route.status()["diagnostics"]["lastFailure"]}));
        assert!(completed && matched && inherited && reply_matches && roundtrip_matches, "Native tool acceptance failed");
    }
    if !roundtrip {
        assert_eq!(route.status()["diagnostics"]["contextHandoff"]["nativeInstructionsPreserved"], true);
    }
    child.kill().await.unwrap();
    route.close();
}
