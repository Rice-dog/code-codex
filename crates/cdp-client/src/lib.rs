//! Minimal Chrome DevTools Protocol support for renderer injection.
//!
//! The client is deliberately limited to a loopback endpoint, Codex renderer
//! targets, `Runtime.addBinding`, script injection, and outbound evaluation.
//! It is not a general-purpose remote debugging client.

use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};

type DiagnosticObserver = fn(&str, &str, &str, Value);
static DIAGNOSTIC_OBSERVER: std::sync::OnceLock<DiagnosticObserver> = std::sync::OnceLock::new();
/// Metadata-only observer. Never echoes attacker-selected request IDs or payloads.
pub fn set_diagnostic_observer(observer: DiagnosticObserver) {
    let _ = DIAGNOSTIC_OBSERVER.set(observer);
}
fn observe_rejection(phase: &str, details: Value) {
    static WINDOW: std::sync::OnceLock<StdMutex<(Instant, u32, u64)>> = std::sync::OnceLock::new();
    let Some(observer) = DIAGNOSTIC_OBSERVER.get() else {
        return;
    };
    let Ok(mut window) = WINDOW
        .get_or_init(|| StdMutex::new((Instant::now(), 0, 0)))
        .lock()
    else {
        return;
    };
    if window.0.elapsed() >= Duration::from_secs(10) {
        let suppressed = window.2;
        *window = (Instant::now(), 0, 0);
        if suppressed > 0 {
            observer(
                "cdp-security",
                "rejected ingress observations",
                "throttled",
                json!({"suppressedCount":suppressed}),
            );
        }
    }
    window.1 += 1;
    if window.1 > 12 {
        window.2 += 1;
        return;
    }
    drop(window);
    observer("cdp-security", phase, "rejected", details);
}

use serde_json::{Value, json};

pub const PRIMARY_BINDING_NAME: &str = "__codeCodex";
pub const PRIMARY_RECEIVER_NAME: &str = "__codeCodexReceive";
// A 64 KiB UTF-8 edit expands to about 86 KiB as Base64. Keep ingress tightly
// bounded while leaving room for the authenticated JSON request envelope.
const MAX_BINDING_PAYLOAD_BYTES: usize = 96 * 1024;
const MAX_CDP_MESSAGE_BYTES: usize = 12 * 1024 * 1024;
const MAX_DISCOVERY_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_REQUESTS_PER_SECOND: usize = 120;
const MAX_IN_FLIGHT_REQUESTS: usize = 16;
const MAX_DISCOVERED_TARGETS: usize = 128;
const MAX_COMPATIBLE_TARGETS: usize = 8;
const MAX_RECENTLY_QUALIFIED_TARGETS: usize = 8;
const MAX_REJECTED_EXECUTION_CONTEXTS: usize = 128;
const REPLAY_WINDOW: usize = 4_096;
const RENDERER_LAYOUT_PROBE: &str = "window===window.top&&location.protocol==='app:'&&location.host==='-'&&(()=>{const s='main.main-surface,main[data-app-shell-main-surface=\"default\"]';const active=root=>[...root.querySelectorAll(s)].filter(e=>!e.closest('[data-app-shell-active-page=\"false\"]'));const m=active(document);const loginPanels=[...document.querySelectorAll('div.flex.h-full.w-full.items-center.justify-center.overflow-hidden.bg-surface')].filter(e=>!e.closest('[data-app-shell-active-page=\"false\"]')&&(e.classList.contains('pb-6')||e.classList.contains('pb-12'))&&[...e.children].some(c=>c.classList.contains('w-[340px]')&&c.classList.contains('flex-col')&&c.querySelector('button')&&c.querySelector('svg')));if(m.length===0&&loginPanels.length===1&&!document.querySelector('nav[data-app-navigation-rail],aside.app-shell-left-panel,[data-app-shell-sidebar-trigger]'))return true;const navs=document.querySelectorAll('nav[data-app-navigation-rail=\"true\"]');const homes=[...document.querySelectorAll('nav[data-app-navigation-rail=\"true\"] [data-sidebar-destination=\"builtin:home\"]')].filter(e=>!e.closest('[data-app-shell-active-page=\"false\"]'));const nativeFeature=navs.length===1&&homes.length===1&&homes[0].getAttribute('aria-current')!=='page';if(m.length!==1||(!document.querySelector('[data-app-shell-sidebar-trigger]')&&!nativeFeature))return false;const main=m[0];const mainParent=main.parentElement;let shell=mainParent;for(let depth=0;shell&&depth<5;depth+=1,shell=shell.parentElement){const asides=shell.querySelectorAll(':scope > aside.app-shell-left-panel');if(asides.length!==1||(shell!==mainParent&&shell!==mainParent?.parentElement))continue;const shellMains=active(shell);if(shellMains.length===1&&shellMains[0]===main)return true;}const row=main.closest('[data-app-shell-workspace-row=\"true\"]');if(!row||active(row).length!==1||!mainParent?.className.includes('MainContentClip'))return false;const children=[...row.children];const rails=children.filter(child=>child.matches('aside.app-shell-left-panel'));const workspaces=children.filter(child=>child.contains(main));return rails.length===1&&workspaces.length===1&&children.indexOf(rails[0])<children.indexOf(workspaces[0])&&active(workspaces[0]).length===1&&workspaces[0].contains(main)})()";
const DOCUMENT_READY_STATE_PROBE: &str = "document.readyState";
const INITIAL_RENDERER_QUALIFICATION_TIMEOUT: Duration = Duration::from_secs(5);
const INITIAL_RENDERER_QUALIFICATION_POLL_INTERVAL: Duration = Duration::from_millis(250);
const TRUSTED_NAVIGATION_QUALIFICATION_TIMEOUT: Duration = Duration::from_secs(5);
const STEADY_STATE_QUALIFICATION_INTERVAL: Duration = Duration::from_secs(2);
const NAVIGATION_QUALIFICATION_INTERVAL: Duration = Duration::from_millis(250);
const RECENTLY_QUALIFIED_TARGET_TTL: Duration = Duration::from_secs(30);
const CANDIDATE_APPROVAL_TIMEOUT: Duration = Duration::from_secs(30);

// Only the native first-party package loader can provide executable source.
// Never return those bytes through the renderer's ordinary response channel.

#[cfg(test)]
mod layout_observation_tests {
    use super::*;
    #[test]
    fn observation_preserves_shape_counts_but_not_page_content() {
        let v = layout_observation(
            &json!({"accepted":false,"mainCount":0,"sidebarTriggerCount":1,"title":"PRIVATE","url":"PRIVATE","rowChildren":["PRIVATE"],"mainContentClip":"PRIVATE"}),
        );
        assert_eq!(
            v,
            json!({"accepted":false,"mainCount":0,"sidebarTriggerCount":1})
        );
    }
}

#[cfg(test)]
mod tests {
    include!("initial_wait_tests.rs");

    #[test]
    fn detailed_protocol_errors_preserve_kind_and_hide_payload() {
        let error = parse_cdp_message("private-source-secret").unwrap_err();
        assert!(matches!(error.kind(), CdpError::Protocol));
        let reason = error.to_string();
        assert!(reason.contains("parsing renderer protocol JSON"));
        assert!(reason.contains("line="));
        assert!(!reason.contains("private-source-secret"));
        let nested = error.context("outer operation", "safe metadata");
        assert!(matches!(nested.kind(), CdpError::Protocol));
        assert!(nested.to_string().contains("outer operation"));
        let bounded = CdpError::WebSocket.context("test", "x".repeat(5000));
        assert!(bounded.to_string().len() < 2200);
    }
    #[tokio::test]
    async fn discovery_preserves_http_status_and_json_location() {
        for (status, body) in [
            (503, "private-source-secret"),
            (200, "private-source-secret"),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let port = listener.local_addr().unwrap().port();
            let server = tokio::spawn(async move {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = [0; 1024];
                let _ = stream.read(&mut request).await;
                stream.write_all(format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            });
            let error = TargetDiscovery::new()
                .unwrap()
                .version(CdpEndpoint::loopback(port))
                .await
                .unwrap_err();
            let message = error.to_string();
            assert!(message.contains("CDP HTTP discovery"));
            assert!(!message.contains("private-source-secret"));
            if status == 503 {
                assert!(matches!(error.kind(), CdpError::EndpointUnavailable));
                assert!(message.contains("503"));
            } else {
                assert!(matches!(error.kind(), CdpError::InvalidEndpoint));
                assert!(message.contains("JSON"));
            }
            server.await.unwrap();
        }
    }

    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering as AtomicOrdering};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    use super::*;

    #[test]
    fn native_plugin_source_is_separate_from_response_and_method_scoped() {
        let original = json!({"id":"load", "ok":true, "result":{"id":"glow-horizon", "verifiedSource":"window.verifiedPackage = true;"}});
        let mut ordinary = original.clone();
        assert!(take_verified_plugin_source("explorer.read", &mut ordinary).is_none());
        assert_eq!(ordinary, original);
        let mut failed = json!({"ok":false,"result":{"verifiedSource":"never execute"}});
        assert!(take_verified_plugin_source("explorer.plugins.load", &mut failed).is_none());
        let mut response = original;
        let source = take_verified_plugin_source("explorer.plugins.load", &mut response).unwrap();
        assert!(response["result"].get("verifiedSource").is_none());
        let outbound = OutboundMessage {
            trusted_script: Some(source),
            payload: response,
            document_epoch: 7,
        };
        let expression = outbound_expression(&outbound, PRIMARY_RECEIVER_NAME).unwrap();
        assert!(expression.contains("window.verifiedPackage = true;"));
        assert!(expression.contains("PLUGIN_EXECUTION"));
        assert!(!expression.contains("verifiedSource"));
        assert_eq!(outbound.document_epoch, 7);
    }

    #[test]
    fn native_plugin_source_is_bounded_without_raising_binding_or_cdp_limits() {
        let outbound = OutboundMessage {
            trusted_script: Some(vec!["x".repeat(4 * 1024 * 1024 + 1)]),
            payload: json!({"id":"load","ok":true}),
            document_epoch: 0,
        };
        assert!(outbound_expression(&outbound, PRIMARY_RECEIVER_NAME).is_err());
        assert_eq!(MAX_BINDING_PAYLOAD_BYTES, 96 * 1024);
        assert_eq!(MAX_CDP_MESSAGE_BYTES, 12 * 1024 * 1024);
    }

    #[test]
    fn default_media_sources_are_separate_bounded_evaluations_with_one_final_reply() {
        let mut response = json!({"id":"media-load","ok":true,"result":{"verifiedSource":["window.defaultOne=true;","window.defaultTwo=true;","window.moduleReady=true;"]}});
        let scripts = take_verified_plugin_source("explorer.plugins.load", &mut response).unwrap();
        let outbound = OutboundMessage {
            trusted_script: Some(scripts),
            payload: response,
            document_epoch: 4,
        };
        let expressions = outbound_expressions(&outbound, PRIMARY_RECEIVER_NAME).unwrap();
        assert_eq!(expressions.len(), 3);
        assert!(expressions[0].contains("defaultOne"));
        assert!(!expressions[0].contains(PRIMARY_RECEIVER_NAME));
        assert!(expressions[1].contains("defaultTwo"));
        assert!(expressions[2].contains("moduleReady"));
        assert!(expressions[2].contains("if(window[key])throw"));
        assert!(expressions[2].contains("PLUGIN_EXECUTION"));
        assert!(expressions[2].contains(PRIMARY_RECEIVER_NAME));
        assert!(outbound.payload["result"].get("verifiedSource").is_none());
        let excessive = OutboundMessage {
            trusted_script: Some(vec![String::new(); 34]),
            payload: json!({}),
            document_epoch: 4,
        };
        assert!(outbound_expressions(&excessive, PRIMARY_RECEIVER_NAME).is_err());
    }

    #[test]
    fn supervisor_timeline_keeps_recent_bounded_events_without_target_ids() {
        let progress = SupervisorProgress::default();
        for count in 0..40 {
            progress.record_target_counts(count, 1);
            progress.update(|state| state.last_target_count = count);
        }
        let snapshot = progress.snapshot();
        assert_eq!(snapshot.events.len(), 32);
        assert_eq!(snapshot.dropped_events, 8);
        assert!(
            snapshot
                .events
                .iter()
                .all(|event| !event.contains("target-id"))
        );
        assert!(
            snapshot
                .events
                .last()
                .is_some_and(|event| event.contains("total=39"))
        );
    }

    #[tokio::test]
    async fn diagnostic_probe_rejects_non_launch_websocket_without_connecting() {
        let discovery = TargetDiscovery::new().expect("discovery client");
        let target = CdpTarget {
            id: "target".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: "ws://example.com:1234/devtools/page/target".to_owned(),
        };
        assert!(matches!(
            discovery
                .renderer_layout_diagnostics(CdpEndpoint::loopback(1234), &target)
                .await,
            Err(CdpError::InvalidEndpoint)
        ));
    }

    #[test]
    fn startup_handoff_requires_successful_bootstrap_evaluation() {
        assert!(bootstrap_evaluation_succeeded(
            &json!({"id": 8, "result": {"result": {"type": "undefined"}}}),
            8
        ));
        assert!(!bootstrap_evaluation_succeeded(
            &json!({"id": 7, "result": {}}),
            8
        ));
        assert!(!bootstrap_evaluation_succeeded(
            &json!({"id": 8, "error": {"message": "failed"}}),
            8
        ));
        assert!(!bootstrap_evaluation_succeeded(
            &json!({"id": 8, "result": {"exceptionDetails": {"text": "failed"}}}),
            8
        ));
    }

    struct EchoHandler;

    #[async_trait]
    impl BridgeHandler for EchoHandler {
        async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
            Ok(json!({ "accepted": request.method }))
        }
    }

    struct AllowEndpointVerifier;

    #[async_trait]
    impl EndpointVerifier for AllowEndpointVerifier {
        async fn verify(&self, _endpoint: CdpEndpoint) -> Result<(), CdpError> {
            Ok(())
        }
    }

    struct RejectEndpointVerifier {
        calls: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl EndpointVerifier for RejectEndpointVerifier {
        async fn verify(&self, _endpoint: CdpEndpoint) -> Result<(), CdpError> {
            self.calls.fetch_add(1, AtomicOrdering::SeqCst);
            Err(CdpError::EndpointIdentityMismatch)
        }
    }

    struct RecordingHandler {
        ids: Arc<std::sync::Mutex<Vec<String>>>,
    }

    #[async_trait]
    impl BridgeHandler for RecordingHandler {
        async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
            self.ids
                .lock()
                .expect("recording handler lock")
                .push(request.id);
            Ok(json!({ "accepted": true }))
        }
    }

    struct EpochRecordingHandler {
        epoch: AtomicU64,
        requests: Arc<std::sync::Mutex<Vec<(String, u64)>>>,
    }

    #[async_trait]
    impl BridgeHandler for EpochRecordingHandler {
        async fn handle(&self, request: BindingRequest) -> Result<Value, BridgeError> {
            self.requests
                .lock()
                .expect("epoch recording handler lock")
                .push((request.id, request.lifecycle_epoch));
            Ok(json!({ "accepted": true }))
        }

        fn lifecycle_epoch(&self) -> u64 {
            self.epoch.load(AtomicOrdering::Acquire)
        }

        fn invalidate_lifecycle(&self) {
            self.epoch.fetch_add(1, AtomicOrdering::AcqRel);
        }
    }

    async fn approve_candidate(receiver: &mut mpsc::UnboundedReceiver<SessionStatus>) -> String {
        let status = tokio::time::timeout(Duration::from_secs(3), receiver.recv())
            .await
            .expect("candidate timeout")
            .expect("candidate status");
        let SessionStatus::Candidate {
            target_id,
            approval,
            ..
        } = status
        else {
            panic!("expected candidate status");
        };
        approval.send(Ok(())).expect("approve candidate");
        target_id
    }

    fn pending_target_session() -> TargetSession {
        let cancellation = CancellationToken::new();
        let task_cancellation = cancellation.clone();
        let task = tokio::spawn(async move { task_cancellation.cancelled().await });
        TargetSession {
            session_generation: 1,
            cancellation,
            lease_held: Arc::new(AtomicBool::new(false)),
            qualification_nudge: Arc::new(Notify::new()),
            task,
        }
    }

    #[test]
    fn capability_is_random_and_redacted() {
        let first = CapabilityToken::generate();
        let second = CapabilityToken::generate();
        assert_ne!(first, second);
        assert_eq!(format!("{first:?}"), "CapabilityToken([REDACTED])");
        assert!(first.expose().len() >= 40);
    }

    #[tokio::test]
    async fn gate_rejects_wrong_tokens_and_replays() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let wrong = json!({
            "id": "request-1",
            "token": "wrong",
            "method": "explorer.context",
            "params": {}
        });
        assert_eq!(
            gate.authorize(&wrong.to_string())
                .await
                .expect_err("wrong token")
                .code,
            "UNAUTHORIZED"
        );
        let valid = json!({
            "id": "request-1",
            "token": token.expose(),
            "method": "explorer.context",
            "params": {}
        });
        gate.authorize(&valid.to_string()).await.expect("valid");
        assert!(gate.authorize(&valid.to_string()).await.is_err());
    }

    // Read the actual caller, not a duplicated list of supposedly valid names.
    // ObjectBridge fixtures bypass this production CDP authorization boundary.
    fn startup_example_renderer_methods() -> Vec<&'static str> {
        let source = include_str!("../../../packages/explorer-ui/src/startup-video-examples.ts");
        let mut methods: Vec<_> = source
            .split(['\'', '"'])
            .filter(|part| part.starts_with("explorer."))
            .collect();
        methods.sort_unstable();
        methods.dedup();
        assert_eq!(methods.len(), 3);
        methods
    }

    #[tokio::test]
    async fn language_renderer_methods_cross_real_authorization_and_replay_guards() {
        let source = include_str!("../../../packages/explorer-ui/src/core/localization/runtime.ts");
        let backend = include_str!("../../launcher/src/bridge/router.rs");
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        for (index, method) in ["explorer.language.get", "explorer.language.set"]
            .iter()
            .enumerate()
        {
            assert!(source.contains(method));
            assert!(backend.contains(&format!("\"{method}\" =>")));
            let mut payload = json!({"id":format!("language-{index}"),"token":"invalid","method":method,"params":{}});
            assert_eq!(
                gate.authorize(&payload.to_string()).await.unwrap_err().code,
                "UNAUTHORIZED"
            );
            payload["token"] = json!(token.expose());
            gate.authorize(&payload.to_string()).await.unwrap();
            assert_eq!(
                gate.authorize(&payload.to_string()).await.unwrap_err().code,
                "INVALID_REQUEST"
            );
        }
    }

    #[tokio::test]
    async fn login_startup_renderer_methods_cross_real_authorization_and_replay_guards() {
        let source = include_str!("../../../packages/explorer-ui/src/app/explorer-element.ts");
        let backend = include_str!("../../launcher/src/bridge/router.rs");
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        for (index, method) in ["explorer.login.startup.get", "explorer.login.startup.set"].iter().enumerate() {
            assert!(source.contains(method));
            assert!(backend.contains(&format!("\"{method}\" =>")));
            let mut payload = json!({"id":format!("login-startup-{index}"),"token":"invalid","method":method,"params":{}});
            assert_eq!(gate.authorize(&payload.to_string()).await.unwrap_err().code, "UNAUTHORIZED");
            payload["token"] = json!(token.expose());
            gate.authorize(&payload.to_string()).await.unwrap();
            assert_eq!(gate.authorize(&payload.to_string()).await.unwrap_err().code, "INVALID_REQUEST");
        }
    }

    #[tokio::test]
    async fn startup_example_renderer_methods_cross_real_binding_authorization() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let (sender, mut receiver) = mpsc::channel(4);
        let mut tasks = JoinSet::new();
        let slots = Arc::new(Semaphore::new(MAX_IN_FLIGHT_REQUESTS));
        let mut pending = VecDeque::new();
        let backend = include_str!("../../launcher/src/bridge/router.rs");
        for (index, method) in startup_example_renderer_methods().into_iter().enumerate() {
            assert!(
                backend.contains(&format!("\"{method}\" =>")),
                "missing native dispatch: {method}"
            );
            let payload = json!({"id":format!("sample-{index}"),"token":token.expose(),"method":method,"params":{"id":"the-intelligence-age"}}).to_string();
            authorize_binding_request(
                &payload,
                &gate,
                true,
                &mut pending,
                Arc::new(EchoHandler),
                sender.clone(),
                slots.clone(),
                &mut tasks,
                7,
            )
            .await
            .unwrap();
            let message = tokio::time::timeout(Duration::from_millis(500), receiver.recv())
                .await
                .unwrap_or_else(|_| panic!("renderer method rejected before dispatch: {method}"))
                .expect("authenticated response");
            assert_eq!(message.document_epoch, 7);
            assert_eq!(message.payload["ok"], true);
            assert_eq!(message.payload["result"]["accepted"], method);
            assert_eq!(message.payload["id"], format!("sample-{index}"));
            tasks.join_next().await.unwrap().unwrap();
        }
        assert!(pending.is_empty() && tasks.is_empty());
    }

    #[tokio::test]
    async fn startup_example_rpc_does_not_relax_capability_or_replay_guards() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        for (index, method) in startup_example_renderer_methods().into_iter().enumerate() {
            let mut payload = json!({"id":format!("protected-example-{index}"),"token":"incorrect","method":method,"params":{}});
            assert_eq!(
                gate.authorize(&payload.to_string()).await.unwrap_err().code,
                "UNAUTHORIZED"
            );
            payload["token"] = json!(token.expose());
            gate.authorize(&payload.to_string()).await.unwrap();
            assert_eq!(
                gate.authorize(&payload.to_string()).await.unwrap_err().code,
                "INVALID_REQUEST"
            );
        }
        let legacy = json!({"id":"legacy-example","token":token.expose(),"method":"explorer.startupExamples.download","params":{}});
        let error = gate.authorize(&legacy.to_string()).await.unwrap_err();
        assert_eq!(error.code, "INVALID_REQUEST");
        assert!(error.message.contains("lowercase"));
    }

    #[test]
    fn production_renderer_rpc_literals_obey_native_method_grammar() {
        fn inspect(directory: &std::path::Path, checked: &mut usize) {
            for entry in std::fs::read_dir(directory).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    inspect(&path, checked);
                    continue;
                }
                if path.extension().is_none_or(|extension| extension != "ts") {
                    continue;
                }
                let source = std::fs::read_to_string(&path).unwrap();
                for method in source.split(['\'', '"']) {
                    if method.starts_with("explorer.")
                        && method
                            .bytes()
                            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-'))
                    {
                        assert!(
                            valid_method(method),
                            "invalid RPC literal in {}: {method}",
                            path.display()
                        );
                        *checked += 1;
                    }
                }
            }
        }
        let root =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/explorer-ui/src");
        let mut checked = 0;
        inspect(&root, &mut checked);
        assert!(checked > 50);
    }

    #[tokio::test]
    async fn gate_bounds_request_rate_and_payload_size() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        for index in 0..MAX_REQUESTS_PER_SECOND {
            let payload = json!({
                "id": format!("rate-{index}"),
                "token": token.expose(),
                "method": "explorer.context",
                "params": {}
            });
            gate.authorize(&payload.to_string())
                .await
                .expect("within rate limit");
        }
        let excess = json!({
            "id": "rate-excess",
            "token": token.expose(),
            "method": "explorer.context",
            "params": {}
        });
        assert_eq!(
            gate.authorize(&excess.to_string())
                .await
                .expect_err("rate limited")
                .code,
            "RATE_LIMITED"
        );
        assert!(
            gate.authorize(&"x".repeat(MAX_BINDING_PAYLOAD_BYTES + 1))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn gate_accepts_one_maximum_sized_base64_preview_save() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let payload = json!({
            "id": "maximum-preview-save",
            "token": token.expose(),
            "method": "explorer.preview.save",
            "params": {
                "relativePath": "src/maximum-size-file.txt",
                "expectedVersion": "0".repeat(64),
                "contentBase64": base64::engine::general_purpose::STANDARD.encode(
                    vec![b'x'; 64 * 1024]
                ),
            }
        })
        .to_string();
        assert!(payload.len() <= MAX_BINDING_PAYLOAD_BYTES);
        gate.authorize(&payload)
            .await
            .expect("bounded preview save payload");
    }

    #[tokio::test]
    async fn wrong_tokens_are_charged_to_the_rate_window() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token);
        for index in 0..MAX_REQUESTS_PER_SECOND {
            let payload = json!({
                "id": format!("wrong-{index}"),
                "token": "wrong",
                "method": "explorer.context",
                "params": {}
            });
            assert_eq!(
                gate.authorize(&payload.to_string())
                    .await
                    .expect_err("wrong token")
                    .code,
                "UNAUTHORIZED"
            );
        }
        let excess = json!({
            "id": "wrong-excess",
            "token": "wrong",
            "method": "explorer.context",
            "params": {}
        });
        assert_eq!(
            gate.authorize(&excess.to_string())
                .await
                .expect_err("rate limited")
                .code,
            "RATE_LIMITED"
        );
    }

    #[tokio::test]
    async fn reload_resets_only_the_bounded_document_gate_state() {
        let token = CapabilityToken::generate();
        let gate = SecureGate::new(token.clone());
        let request = json!({
            "id": "reload-1",
            "token": token.expose(),
            "method": "explorer.context",
            "params": {}
        })
        .to_string();
        gate.authorize(&request).await.expect("first document");
        assert!(gate.authorize(&request).await.is_err());
        gate.reset_for_new_document().await;
        gate.authorize(&request).await.expect("new document");
    }

    #[test]
    fn target_filter_fails_closed() {
        let filter = TargetFilter::default();
        let codex = CdpTarget {
            id: "1".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: "ws://127.0.0.1:9222/devtools/page/1".to_owned(),
        };
        assert!(filter.accepts(&codex));
        let mut website = codex.clone();
        website.url = "https://example.com".to_owned();
        assert!(!filter.accepts(&website));
        website.target_type = "service_worker".to_owned();
        website.url = "app://-/index.html".to_owned();
        assert!(!filter.accepts(&website));
    }

    #[test]
    fn default_supervisor_startup_timeout_remains_bounded() {
        assert_eq!(
            SupervisorOptions::for_endpoint(CdpEndpoint::loopback(9222)).startup_timeout,
            Duration::from_secs(30)
        );
    }

    #[test]
    fn more_than_one_dom_qualified_renderer_is_rejected() {
        let mut qualified = HashSet::new();
        register_qualified_target(&mut qualified, "main-1".to_owned()).expect("first renderer");
        let error = register_qualified_target(&mut qualified, "main-2".to_owned())
            .expect_err("ambiguous renderer");
        assert!(matches!(error, CdpError::AmbiguousRenderer));
    }

    #[tokio::test]
    async fn only_one_dom_qualified_session_receives_a_renderer_lease() {
        let mut qualified = HashSet::new();
        let (first_approval, first_result) = oneshot::channel();
        grant_renderer_lease(&mut qualified, "main-1".to_owned(), first_approval)
            .expect("first lease");
        assert!(matches!(first_result.await, Ok(Ok(()))));

        let (second_approval, second_result) = oneshot::channel();
        let error = grant_renderer_lease(&mut qualified, "main-2".to_owned(), second_approval)
            .expect_err("second lease");
        assert!(matches!(error, CdpError::AmbiguousRenderer));
        assert!(matches!(
            second_result.await,
            Ok(Err(CdpError::AmbiguousRenderer))
        ));
    }

    #[tokio::test]
    async fn cold_candidate_approval_is_not_truncated_by_the_recovery_timeout() {
        let (approval_sender, approval_receiver) = oneshot::channel();
        let sender = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(75)).await;
            approval_sender
                .send(Ok(()))
                .expect("cold approval receiver");
        });
        let deadline = Instant::now() + Duration::from_secs(2);

        let approval = wait_for_candidate_approval(
            approval_receiver,
            Some(deadline),
            Duration::from_millis(25),
        )
        .await
        .expect("cold approval wait");

        assert!(approval.is_ok());
        sender.await.expect("cold approval sender");
    }

    #[tokio::test]
    async fn cold_candidate_approval_is_rejected_after_its_absolute_deadline() {
        let (approval_sender, approval_receiver) = oneshot::channel();
        let deadline = Instant::now() + Duration::from_millis(20);
        tokio::time::sleep(Duration::from_millis(40)).await;
        approval_sender
            .send(Ok(()))
            .expect("queued late cold approval");

        let result =
            wait_for_candidate_approval(approval_receiver, Some(deadline), Duration::from_secs(30))
                .await;

        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
    }

    #[tokio::test]
    async fn recovery_candidate_approval_retains_its_bounded_timeout() {
        let (approval_sender, approval_receiver) = oneshot::channel();
        let started = Instant::now();
        let result =
            wait_for_candidate_approval(approval_receiver, None, Duration::from_millis(30)).await;
        drop(approval_sender);

        assert!(matches!(result, Err(CdpError::Protocol)));
        assert!(started.elapsed() >= Duration::from_millis(20));
    }

    #[tokio::test]
    async fn first_candidate_waits_for_a_delayed_compatible_probe() {
        let mut sessions = HashMap::from([("fast".to_owned(), pending_target_session())]);
        let qualified = HashSet::new();
        let (fast_approval, mut fast_result) = oneshot::channel();
        let mut pending = HashMap::from([("fast".to_owned(), fast_approval)]);
        // A newly discovered compatible target is spawned into the cohort
        // before readiness is evaluated, so the fast candidate remains held.
        sessions.insert("delayed".to_owned(), pending_target_session());
        assert!(!candidate_cohort_ready(&sessions, &qualified, &pending));
        assert!(
            tokio::time::timeout(Duration::from_millis(50), &mut fast_result)
                .await
                .is_err(),
            "fast candidate must not receive a token/native lease while delayed is unresolved"
        );

        let (delayed_approval, delayed_result) = oneshot::channel();
        pending.insert("delayed".to_owned(), delayed_approval);
        assert!(candidate_cohort_is_ambiguous(&qualified, &pending));
        for (_, approval) in pending.drain() {
            let _ = approval.send(Err(CdpError::AmbiguousRenderer));
        }
        assert!(matches!(
            fast_result.await,
            Ok(Err(CdpError::AmbiguousRenderer))
        ));
        assert!(matches!(
            delayed_result.await,
            Ok(Err(CdpError::AmbiguousRenderer))
        ));
        stop_all_sessions(&mut sessions);
    }

    #[tokio::test]
    async fn first_candidate_nudges_only_unresolved_peer_qualifications() {
        let candidate = pending_target_session();
        let candidate_nudge = candidate.qualification_nudge.clone();
        let peer = pending_target_session();
        let peer_nudge = peer.qualification_nudge.clone();
        let qualified_session = pending_target_session();
        let qualified_nudge = qualified_session.qualification_nudge.clone();
        let mut sessions = HashMap::from([
            ("candidate".to_owned(), candidate),
            ("peer".to_owned(), peer),
            ("qualified".to_owned(), qualified_session),
        ]);
        let qualified = HashSet::from(["qualified".to_owned()]);
        let (approval, _approval_result) = oneshot::channel();
        let mut pending = HashMap::from([("candidate".to_owned(), approval)]);
        let compatible = HashSet::from([
            "candidate".to_owned(),
            "peer".to_owned(),
            "qualified".to_owned(),
        ]);

        retain_live_candidates_and_nudge(&sessions, &qualified, &mut pending, &compatible);

        assert!(
            tokio::time::timeout(Duration::from_millis(50), peer_nudge.notified())
                .await
                .is_ok(),
            "unresolved peer must receive a final-probe nudge"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(20), candidate_nudge.notified())
                .await
                .is_err(),
            "the pending candidate must not nudge itself"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(20), qualified_nudge.notified())
                .await
                .is_err(),
            "an already-qualified session must not be nudged"
        );
        stop_all_sessions(&mut sessions);

        let replacement = pending_target_session();
        let replacement_nudge = replacement.qualification_nudge.clone();
        let mut replacement_sessions = HashMap::from([("replacement".to_owned(), replacement)]);
        let (stale_approval, _stale_result) = oneshot::channel();
        let mut stale_pending = HashMap::from([("vanished".to_owned(), stale_approval)]);
        retain_live_candidates_and_nudge(
            &replacement_sessions,
            &HashSet::new(),
            &mut stale_pending,
            &HashSet::from(["replacement".to_owned()]),
        );
        assert!(stale_pending.is_empty());
        assert!(
            tokio::time::timeout(Duration::from_millis(20), replacement_nudge.notified())
                .await
                .is_err(),
            "a vanished candidate must not nudge a newly discovered replacement"
        );
        stop_all_sessions(&mut replacement_sessions);
    }

    #[tokio::test]
    async fn stale_candidate_generation_cannot_claim_a_reinserted_target_id() {
        let target_id = "reappearing-main".to_owned();
        let mut old_session = pending_target_session();
        old_session.session_generation = 41;
        let mut sessions = HashMap::from([(target_id.clone(), old_session)]);
        let (stale_approval, stale_result) = oneshot::channel();
        let stale_candidate = SessionStatus::Candidate {
            target_id: target_id.clone(),
            session_generation: 41,
            approval: stale_approval,
        };

        sessions
            .remove(&target_id)
            .expect("old target session")
            .stop();
        let mut replacement = pending_target_session();
        replacement.session_generation = 42;
        sessions.insert(target_id.clone(), replacement);

        let mut qualified = HashSet::new();
        let mut recently_qualified = HashMap::new();
        let mut pending = HashMap::new();
        let mut rejected = HashMap::new();
        apply_session_status(
            stale_candidate,
            &mut sessions,
            &mut qualified,
            &mut recently_qualified,
            &mut pending,
            &mut rejected,
        );

        assert!(pending.is_empty());
        assert!(
            stale_result.await.is_err(),
            "stale approval must be dropped"
        );
        assert_eq!(
            sessions
                .get(&target_id)
                .expect("replacement session")
                .session_generation,
            42
        );

        apply_session_status(
            SessionStatus::Ended {
                target_id: target_id.clone(),
                session_generation: 41,
                incompatible: true,
            },
            &mut sessions,
            &mut qualified,
            &mut recently_qualified,
            &mut pending,
            &mut rejected,
        );
        assert!(sessions.contains_key(&target_id));
        assert!(rejected.is_empty());
        stop_all_sessions(&mut sessions);
    }

    #[test]
    fn target_and_rejected_context_collections_are_strictly_bounded() {
        assert!(validate_target_budget(MAX_DISCOVERED_TARGETS, MAX_COMPATIBLE_TARGETS).is_ok());
        assert!(validate_target_budget(MAX_DISCOVERED_TARGETS + 1, 0).is_err());
        assert!(validate_target_budget(1, MAX_COMPATIBLE_TARGETS + 1).is_err());

        let mut contexts = HashSet::new();
        for context_id in 0..10_000 {
            remember_rejected_context(&mut contexts, context_id);
        }
        assert_eq!(contexts.len(), MAX_REJECTED_EXECUTION_CONTEXTS);
    }

    #[test]
    fn setup_discards_large_non_lifecycle_event_floods() {
        let mut retained = VecDeque::new();
        let event = json!({
            "method": "Runtime.consoleAPICalled",
            "params": { "payload": "x".repeat(256 * 1024) }
        });
        for _ in 0..256 {
            retain_setup_lifecycle_event(&mut retained, &event).expect("ignore console event");
        }
        assert!(retained.is_empty());
    }

    #[tokio::test]
    async fn completed_dispatch_tasks_are_reaped_from_the_join_set() {
        let (sender, mut receiver) = mpsc::channel(32);
        let mut tasks = JoinSet::new();
        let slots = Arc::new(Semaphore::new(MAX_IN_FLIGHT_REQUESTS));
        for index in 0..MAX_IN_FLIGHT_REQUESTS {
            dispatch_request(
                BindingRequest {
                    id: format!("dispatch-{index}"),
                    token: String::new(),
                    method: "explorer.context".to_owned(),
                    params: json!({}),
                    lifecycle_epoch: 0,
                },
                Arc::new(EchoHandler),
                sender.clone(),
                slots.clone(),
                &mut tasks,
                0,
            )
            .expect("dispatch");
        }
        for _ in 0..MAX_IN_FLIGHT_REQUESTS {
            receiver.recv().await.expect("response");
            let _ = tasks.join_next().await;
        }
        assert!(tasks.is_empty());
    }

    #[tokio::test]
    async fn sessions_are_cancelled_when_targets_stop_matching() {
        let cancellation = CancellationToken::new();
        let observed = cancellation.clone();
        let task_cancellation = cancellation.clone();
        let task = tokio::spawn(async move {
            task_cancellation.cancelled().await;
        });
        let mut sessions = HashMap::from([(
            "main-1".to_owned(),
            TargetSession {
                session_generation: 1,
                cancellation,
                lease_held: Arc::new(AtomicBool::new(true)),
                qualification_nudge: Arc::new(Notify::new()),
                task,
            },
        )]);
        let mut qualified = HashSet::from(["main-1".to_owned()]);
        assert!(stop_stale_sessions(
            &mut sessions,
            &mut qualified,
            &HashSet::new()
        ));
        assert!(sessions.is_empty());
        assert!(qualified.is_empty());
        assert!(observed.is_cancelled());
    }

    #[test]
    fn binding_payload_is_bounded_before_dispatch() {
        let oversized = "x".repeat(MAX_BINDING_PAYLOAD_BYTES + 1);
        let event = json!({
            "method": "Runtime.bindingCalled",
            "params": {
                "name": PRIMARY_BINDING_NAME,
                "payload": oversized,
                "executionContextId": 7
            }
        });
        assert!(bounded_binding_payload(&event, PRIMARY_BINDING_NAME).is_none());
        assert_eq!(
            binding_execution_context(&event, PRIMARY_BINDING_NAME),
            Some(7)
        );
    }

    #[test]
    fn renderer_probe_is_top_frame_and_app_origin_scoped() {
        assert!(RENDERER_LAYOUT_PROBE.starts_with("window===window.top"));
        assert!(RENDERER_LAYOUT_PROBE.contains("location.protocol==='app:'"));
        assert!(RENDERER_LAYOUT_PROBE.contains("location.host==='-'"));
        assert!(RENDERER_LAYOUT_PROBE.contains("main.main-surface"));
        assert!(RENDERER_LAYOUT_PROBE.contains("main[data-app-shell-main-surface=\"default\"]"));
        assert!(RENDERER_LAYOUT_PROBE.contains("m.length!==1"));
        assert!(RENDERER_LAYOUT_PROBE.contains(":scope > aside.app-shell-left-panel"));
        assert!(RENDERER_LAYOUT_PROBE.contains("let shell=mainParent"));
        assert!(RENDERER_LAYOUT_PROBE.contains("depth<5"));
        assert!(RENDERER_LAYOUT_PROBE.contains("asides.length!==1"));
        assert!(RENDERER_LAYOUT_PROBE.contains("const mainParent=main.parentElement"));
        assert!(RENDERER_LAYOUT_PROBE.contains("shell!==mainParent?.parentElement"));
        assert!(RENDERER_LAYOUT_PROBE.contains("shellMains.length===1&&shellMains[0]===main"));
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum ProbeFixtureNodeKind {
        Other,
        Main,
        Aside,
        Trigger,
    }

    #[derive(Clone, Copy)]
    struct ProbeFixtureNode {
        parent: Option<usize>,
        kind: ProbeFixtureNodeKind,
    }

    fn fixture_descends_from(nodes: &[ProbeFixtureNode], node: usize, ancestor: usize) -> bool {
        let mut current = nodes[node].parent;
        while let Some(index) = current {
            if index == ancestor {
                return true;
            }
            current = nodes[index].parent;
        }
        false
    }

    // Mirror the legacy structural part of the browser probe in a tiny
    // DOM-shaped model. The current workspace row is checked in Chrome by
    // scripts/test-codex-layout.mjs.
    fn fixture_matches_renderer_shell(nodes: &[ProbeFixtureNode]) -> bool {
        let mains = nodes
            .iter()
            .enumerate()
            .filter_map(|(index, node)| (node.kind == ProbeFixtureNodeKind::Main).then_some(index))
            .collect::<Vec<_>>();
        if mains.len() != 1
            || !nodes
                .iter()
                .any(|node| node.kind == ProbeFixtureNodeKind::Trigger)
        {
            return false;
        }
        let main = mains[0];
        let Some(main_parent) = nodes[main].parent else {
            return false;
        };
        let mut shell = Some(main_parent);
        for _ in 0..5 {
            let Some(shell_index) = shell else {
                break;
            };
            let direct_asides = nodes
                .iter()
                .filter(|node| {
                    node.parent == Some(shell_index) && node.kind == ProbeFixtureNodeKind::Aside
                })
                .count();
            let mut shell_main_count = 0;
            let mut contains_main = false;
            for (index, node) in nodes.iter().enumerate() {
                if index != shell_index
                    && node.kind == ProbeFixtureNodeKind::Main
                    && fixture_descends_from(nodes, index, shell_index)
                {
                    shell_main_count += 1;
                    contains_main |= index == main;
                }
            }
            let supported_depth =
                shell_index == main_parent || nodes[main_parent].parent == Some(shell_index);
            if direct_asides == 1 && supported_depth && shell_main_count == 1 && contains_main {
                return true;
            }
            shell = nodes[shell_index].parent;
        }
        false
    }

    #[test]
    fn renderer_probe_shell_relation_covers_legacy_direct_and_wrapped_layouts() {
        let old = [
            ProbeFixtureNode {
                parent: None,
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Aside,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Main,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Trigger,
            },
        ];
        assert!(fixture_matches_renderer_shell(&old));

        let wrapped = [
            ProbeFixtureNode {
                parent: None,
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Aside,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(2),
                kind: ProbeFixtureNodeKind::Main,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Trigger,
            },
        ];
        assert!(fixture_matches_renderer_shell(&wrapped));
    }

    #[test]
    fn renderer_probe_shell_relation_fails_closed_for_invalid_layouts() {
        let missing_aside = [
            ProbeFixtureNode {
                parent: None,
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Main,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Trigger,
            },
        ];
        assert!(!fixture_matches_renderer_shell(&missing_aside));

        let unrelated_shell = [
            ProbeFixtureNode {
                parent: None,
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Aside,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(2),
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(3),
                kind: ProbeFixtureNodeKind::Main,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Trigger,
            },
        ];
        assert!(!fixture_matches_renderer_shell(&unrelated_shell));

        let multiple_mains = [
            ProbeFixtureNode {
                parent: None,
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Aside,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Main,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Main,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Trigger,
            },
        ];
        assert!(!fixture_matches_renderer_shell(&multiple_mains));

        let missing_trigger = [
            ProbeFixtureNode {
                parent: None,
                kind: ProbeFixtureNodeKind::Other,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Aside,
            },
            ProbeFixtureNode {
                parent: Some(0),
                kind: ProbeFixtureNodeKind::Main,
            },
        ];
        assert!(!fixture_matches_renderer_shell(&missing_trigger));
    }

    #[test]
    fn completed_auxiliary_renderer_has_no_selector_settle_grace() {
        assert_eq!(
            initial_qualification_retry_timeout(false, Duration::ZERO, false, None),
            Duration::ZERO
        );
        assert_eq!(
            initial_qualification_retry_timeout(
                false,
                INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
                false,
                None,
            ),
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT
        );
        assert_eq!(
            initial_qualification_retry_timeout(true, Duration::ZERO, false, None),
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT
        );
        assert_eq!(
            initial_qualification_retry_timeout(true, Duration::from_secs(10), false, None),
            Duration::from_secs(10),
            "loading fallback must not shorten an explicit settle grace"
        );
    }

    #[test]
    fn canonical_renderer_receives_absolute_startup_grace() {
        let deadline = Instant::now() + Duration::from_secs(30);
        let mut target = CdpTarget {
            id: "main".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: "ws://127.0.0.1:9222/devtools/page/main".to_owned(),
        };
        assert!(canonical_renderer_startup_grace(&target, false));
        assert_eq!(cold_startup_deadline(deadline, false), Some(deadline));
        assert!(
            !canonical_renderer_startup_grace(&target, true),
            "startup grace ends after the first qualified renderer"
        );
        assert_eq!(
            cold_startup_deadline(deadline, true),
            None,
            "an expired cold-start deadline must not poison post-lease recovery"
        );
        target.url = "app://-/index.html?initialRoute=%2Favatar-overlay".to_owned();
        assert!(!canonical_renderer_startup_grace(&target, false));

        let remaining = Duration::from_secs(17);
        assert_eq!(
            initial_qualification_retry_timeout(false, Duration::ZERO, true, Some(remaining)),
            remaining
        );
        assert_eq!(
            initial_qualification_retry_timeout(
                true,
                INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
                true,
                Some(Duration::from_secs(2)),
            ),
            Duration::from_secs(2),
            "the loading fallback must not extend the absolute startup deadline"
        );
        assert_eq!(
            initial_qualification_retry_timeout(
                true,
                INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
                false,
                Some(Duration::from_secs(2)),
            ),
            Duration::from_secs(2),
            "noncanonical loading grace must be capped by the cold-start deadline"
        );
        assert_eq!(
            initial_qualification_retry_timeout(false, Duration::ZERO, false, Some(remaining),),
            Duration::ZERO,
            "completed auxiliary renderers retain no settle grace"
        );
    }

    #[test]
    fn recently_qualified_grace_survives_an_absent_discovery_poll_and_is_bounded() {
        let mut targets = HashMap::new();
        remember_recently_qualified_target(&mut targets, "reload-main".to_owned());

        // A transient empty /json/list poll must not erase the exact target ID
        // that is allowed to settle when it reappears on the next poll.
        assert_eq!(
            recently_qualified_target_grace(&mut targets, "reload-main"),
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT
        );
        assert_eq!(
            recently_qualified_target_grace(&mut targets, "different-main"),
            Duration::ZERO,
            "grace must be limited to the exact previously qualified target ID"
        );

        for index in 0..(MAX_RECENTLY_QUALIFIED_TARGETS * 4) {
            remember_recently_qualified_target(&mut targets, format!("target-{index}"));
        }
        assert_eq!(targets.len(), MAX_RECENTLY_QUALIFIED_TARGETS);

        let exact_target = format!("target-{}", MAX_RECENTLY_QUALIFIED_TARGETS * 4 - 1);
        targets.insert(
            exact_target.clone(),
            Instant::now() - RECENTLY_QUALIFIED_TARGET_TTL - Duration::from_millis(1),
        );
        assert_eq!(
            recently_qualified_target_grace(&mut targets, &exact_target),
            Duration::ZERO,
            "expired target IDs must not receive selector-settle grace"
        );
        assert!(targets.len() < MAX_RECENTLY_QUALIFIED_TARGETS);
    }

    #[test]
    fn owned_process_policy_recovers_past_the_attach_idle_timeout() {
        let timeout = Duration::from_secs(5);
        let transient_gap = Duration::from_secs(30);

        assert!(idle_policy_stops_supervisor(
            IdlePolicy::ExitAfterTimeout,
            transient_gap,
            timeout,
        ));
        assert!(!idle_policy_stops_supervisor(
            IdlePolicy::RecoverUntilCancelled,
            transient_gap,
            timeout,
        ));
    }

    async fn initial_context_burst_case(mode: &'static str) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = CapabilityToken::generate();
        let server_token = token.clone();
        let ids = Arc::new(std::sync::Mutex::new(Vec::new()));
        let observed = ids.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let mut sent = false;
            let mut replies = HashSet::new();
            while let Some(Ok(Message::Text(text))) = socket.next().await {
                let command: Value = serde_json::from_str(text.as_ref()).unwrap();
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let context_probe =
                    expression == RENDERER_LAYOUT_PROBE && command["params"]["contextId"] == 1;
                if context_probe {
                    assert!(
                        observed.lock().unwrap().is_empty(),
                        "No dispatch before qualification"
                    );
                    if mode == "navigation" {
                        socket
                            .send(Message::Text(
                                json!({"method":"Runtime.executionContextsCleared","params":{}})
                                    .to_string()
                                    .into(),
                            ))
                            .await
                            .unwrap();
                    }
                }
                let result = if expression == RENDERER_LAYOUT_PROBE {
                    json!({"result":{"type":"boolean","value": !context_probe || mode != "rejected"}})
                } else if command["method"] == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({"identifier":"burst-script"})
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({"id":command["id"],"result":result})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
                if context_probe && mode != "accepted" {
                    break;
                }
                if expression == "window.__burstFixture=true;" && !sent {
                    sent = true;
                    // Deliver the complete burst before reading/responding to the
                    // qualification command. Old code retained only request0.
                    for index in 0..9 {
                        let request = json!({"id":format!("burst-{index}"),"token":if index==7 {"invalid"}else{server_token.expose()},"method":"explorer.context","params":{}});
                        socket.send(Message::Text(json!({"method":"Runtime.bindingCalled","params":{"name":PRIMARY_BINDING_NAME,"executionContextId":if index==8 {2}else{1},"payload":request.to_string()}}).to_string().into())).await.unwrap();
                    }
                } else if expression.contains(PRIMARY_RECEIVER_NAME)
                    && expression.contains("burst-")
                {
                    let index = (0..9)
                        .find(|index| expression.contains(&format!("burst-{index}")))
                        .unwrap();
                    assert!(replies.insert(index), "No duplicate deliveries");
                    assert!(
                        index < 7,
                        "Wrong-token and foreign-context IDs must never be echoed"
                    );
                    if replies.len() == 7 {
                        break;
                    }
                }
            }
            let _ = socket.close(None).await;
        });
        let target = CdpTarget {
            id: "burst-main".into(),
            target_type: "page".into(),
            title: "Codex".into(),
            url: "app://-/index.html".into(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/burst-main"),
        };
        let (_sender, notifications) = broadcast::channel(4);
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let cancellation = CancellationToken::new();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__burstFixture=true;", token),
            Arc::new(RecordingHandler { ids: ids.clone() }),
            Arc::new(AllowEndpointVerifier),
            notifications,
            cancellation.clone(),
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        ));
        approve_candidate(&mut status_receiver).await;
        tokio::time::timeout(Duration::from_secs(5), server)
            .await
            .expect("All initial requests must finish without renderer timeouts")
            .unwrap();
        cancellation.cancel();
        let _ = tokio::time::timeout(Duration::from_secs(2), session)
            .await
            .unwrap()
            .unwrap();
        let mut actual = ids.lock().unwrap().clone();
        actual.sort();
        let expected: Vec<String> = if mode == "accepted" {
            (0..7).map(|index| format!("burst-{index}")).collect()
        } else {
            Vec::new()
        };
        assert_eq!(
            actual, expected,
            "Each authorized request once; wrong tokens, other frames and invalidated batches never dispatch"
        );
    }

    #[tokio::test]
    async fn initial_context_probe_preserves_concurrent_ingress_and_checks_every_token() {
        initial_context_burst_case("accepted").await;
    }
    #[tokio::test]
    async fn rejected_context_discards_the_entire_unprocessed_burst() {
        initial_context_burst_case("rejected").await;
    }
    #[tokio::test]
    async fn navigation_discards_pending_context_ingress_before_a_late_probe_reply() {
        initial_context_burst_case("navigation").await;
    }

    #[tokio::test]
    async fn retained_activation_recovers_rpc_after_login_gap_longer_than_five_seconds() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = CapabilityToken::generate();
        let server_token = token.clone();
        let visible = Arc::new(AtomicBool::new(true));
        let delivered = Arc::new(AtomicUsize::new(0));
        let server_visible = visible.clone();
        let server_delivered = delivered.clone();
        let server = tokio::spawn(async move {
            let mut connections = JoinSet::new();
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let visible = server_visible.clone();
                let delivered = server_delivered.clone();
                let token = server_token.clone();
                connections.spawn(async move {
                    let mut prefix = [0u8;2048];
                    let count = stream.peek(&mut prefix).await.unwrap();
                    if String::from_utf8_lossy(&prefix[..count]).starts_with("GET /json/list") {
                        let body = if visible.load(AtomicOrdering::Acquire) {
                            json!([{"id":"login-main","type":"page","title":"Codex","url":"app://-/index.html","webSocketDebuggerUrl":format!("ws://127.0.0.1:{port}/devtools/page/login-main")}]).to_string()
                        } else { "[]".into() };
                        let _ = stream.read(&mut prefix).await;
                        stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
                        return;
                    }
                    let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                    let mut sent = false;
                    while let Some(Ok(Message::Text(text))) = socket.next().await {
                        let command:Value = serde_json::from_str(text.as_ref()).unwrap();
                        let expression = command["params"]["expression"].as_str().unwrap_or_default();
                        let result = if expression == RENDERER_LAYOUT_PROBE {
                            json!({"result":{"type":"boolean","value":true}})
                        } else if command["method"] == "Page.addScriptToEvaluateOnNewDocument" {
                            json!({"identifier":"login-script"})
                        } else { json!({}) };
                        socket.send(Message::Text(json!({"id":command["id"],"result":result}).to_string().into())).await.unwrap();
                        if expression == "window.__loginFixture=true;" && !sent {
                            sent = true;
                            let serial = delivered.load(AtomicOrdering::Acquire)+1;
                            let request = json!({"id":format!("login-rpc-{serial}"),"token":token.expose(),"method":"explorer.context","params":{}});
                            socket.send(Message::Text(json!({"method":"Runtime.bindingCalled","params":{"name":PRIMARY_BINDING_NAME,"executionContextId":1,"payload":request.to_string()}}).to_string().into())).await.unwrap();
                        } else if expression.contains("__codeCodexReceive") {
                            let prior = delivered.fetch_add(1,AtomicOrdering::AcqRel);
                            assert!(expression.contains(&format!("login-rpc-{}",prior+1)),"fresh request must receive its own reply");
                            if prior == 0 {
                                visible.store(false,AtomicOrdering::Release);
                                let visible = visible.clone();
                                tokio::spawn(async move {
                                    tokio::time::sleep(Duration::from_millis(6200)).await;
                                    visible.store(true,AtomicOrdering::Release);
                                });
                                let _ = socket.close(None).await;
                            }
                            break;
                        }
                    }
                });
            }
        });
        let mut options = SupervisorOptions::for_endpoint(CdpEndpoint::loopback(port));
        options.poll_interval = Duration::from_millis(30);
        options.idle_policy = IdlePolicy::RecoverUntilCancelled;
        let progress = Arc::new(SupervisorProgress::default());
        options.progress = Some(progress.clone());
        let supervisor = CdpSupervisor::new(
            options,
            InjectionConfig::new("window.__loginFixture=true;", token),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
        )
        .unwrap();
        let cancellation = CancellationToken::new();
        let running = tokio::spawn(supervisor.run(cancellation.clone()));
        tokio::time::timeout(Duration::from_secs(10), async {
            while delivered.load(AtomicOrdering::Acquire) < 1 {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("first RPC");
        tokio::time::sleep(Duration::from_millis(5500)).await;
        assert!(
            !running.is_finished(),
            "activation must survive the former five-second idle exit"
        );
        assert!(progress.snapshot().recovery_waiting);
        tokio::time::timeout(Duration::from_secs(10), async {
            while delivered.load(AtomicOrdering::Acquire) < 2 {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("new account RPC after requalification");
        assert_eq!(progress.snapshot().recovery_resumes, 1);
        assert!(progress.snapshot().last_recovery_wait_ms >= 6000);
        cancellation.cancel();
        tokio::time::timeout(Duration::from_secs(2), running)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        server.abort();
    }

    #[test]
    fn top_navigation_fails_closed_but_iframe_navigation_is_ignored() {
        let trusted_top = json!({
            "method": "Page.frameNavigated",
            "params": { "frame": { "id": "top", "url": "app://-/index.html" } }
        });
        let trusted_url = top_frame_navigation_url(&trusted_top)
            .expect("top event")
            .expect("top URL");
        assert!(is_trusted_app_url(trusted_url));

        let untrusted_top = json!({
            "method": "Page.frameNavigated",
            "params": { "frame": { "id": "top", "url": "https://example.com/" } }
        });
        let untrusted_url = top_frame_navigation_url(&untrusted_top)
            .expect("top event")
            .expect("top URL");
        assert!(!is_trusted_app_url(untrusted_url));

        let iframe = json!({
            "method": "Page.frameNavigated",
            "params": {
                "frame": {
                    "id": "child",
                    "parentId": "top",
                    "url": "https://example.com/"
                }
            }
        });
        assert_eq!(
            top_frame_navigation_url(&iframe).expect("iframe event"),
            None
        );
    }

    #[test]
    fn protocol_compatibility_is_explicit() {
        let mut version = BrowserVersion {
            browser: "Chrome/150.0".to_owned(),
            protocol_version: "1.3".to_owned(),
            web_socket_debugger_url: None,
        };
        assert!(version.is_supported());
        version.protocol_version = "2.0".to_owned();
        assert!(!version.is_supported());
    }

    #[test]
    fn parses_chromium_json_version_wire_names() {
        let version: BrowserVersion = serde_json::from_str(
            r#"{
                "Browser":"Chrome/150.0.7871.124",
                "Protocol-Version":"1.3",
                "webSocketDebuggerUrl":"ws://127.0.0.1:3592/devtools/browser/example"
            }"#,
        )
        .expect("Chromium /json/version fixture");
        assert_eq!(version.browser, "Chrome/150.0.7871.124");
        assert_eq!(version.protocol_version, "1.3");
        assert!(version.is_supported());
        assert_eq!(
            version.web_socket_debugger_url.as_deref(),
            Some("ws://127.0.0.1:3592/devtools/browser/example")
        );
    }

    #[tokio::test]
    async fn discovery_refuses_http_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request).await.expect("request");
            stream
                .write_all(
                    b"HTTP/1.1 302 Found\r\nLocation: https://example.com/json/version\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("redirect response");
        });

        let discovery = TargetDiscovery::new().expect("discovery");
        let result = discovery.version(CdpEndpoint::loopback(port)).await;
        assert!(
            result
                .as_ref()
                .is_err_and(|error| matches!(error.kind(), CdpError::EndpointUnavailable))
        );
        server.await.expect("server task");
    }

    #[tokio::test]
    async fn detailed_version_probe_preserves_local_connection_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        drop(listener);

        let discovery = TargetDiscovery::new().expect("discovery");
        let detail = discovery
            .version_detailed(CdpEndpoint::loopback(port))
            .await
            .expect_err("no listener");
        assert!(detail.contains(&port.to_string()));
        assert!(detail.contains("caused by:"));
    }

    #[test]
    fn websocket_endpoint_must_match_loopback_port() {
        let endpoint = CdpEndpoint::loopback(9222);
        assert!(validate_websocket_url(endpoint, "ws://127.0.0.1:9222/devtools/page/1").is_ok());
        assert!(validate_websocket_url(endpoint, "ws://localhost:9222/devtools/page/1").is_ok());
        assert!(validate_websocket_url(endpoint, "ws://10.0.0.1:9222/devtools/page/1").is_err());
        assert!(validate_websocket_url(endpoint, "ws://127.0.0.1:9223/devtools/page/1").is_err());
    }

    #[tokio::test]
    async fn listener_handoff_is_rejected_after_websocket_handshake_before_cdp_commands() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            matches!(
                tokio::time::timeout(Duration::from_secs(2), socket.next()).await,
                Ok(Some(Ok(Message::Text(_))))
            )
        });
        let calls = Arc::new(AtomicUsize::new(0));
        let target = CdpTarget {
            id: "handoff".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/handoff"),
        };
        let (_notification_sender, notifications) = broadcast::channel(1);
        let (status_sender, _status_receiver) = mpsc::unbounded_channel();
        let result = run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__neverInjected=true;", CapabilityToken::generate()),
            Arc::new(EchoHandler),
            Arc::new(RejectEndpointVerifier {
                calls: calls.clone(),
            }),
            notifications,
            CancellationToken::new(),
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        )
        .await;
        assert!(matches!(result, Err(CdpError::EndpointIdentityMismatch)));
        assert_eq!(calls.load(AtomicOrdering::SeqCst), 1);
        assert!(!server.await.expect("server task"));
    }

    #[test]
    fn outbound_data_is_encoded_not_interpolated() {
        let expression = delivery_expression(
            &json!({
                "id": "x",
                "result": "</script>\u{2028}'\""
            }),
            PRIMARY_RECEIVER_NAME,
        )
        .expect("expression");
        assert!(expression.contains("JSON.parse"));
        assert!(expression.contains("__codeCodexReceive"));
    }

    #[tokio::test]
    async fn mock_renderer_qualifies_injects_and_round_trips_binding() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let token = CapabilityToken::generate();
        let request_token = token.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut binding_sent = false;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate"
                    && expression.contains("aside.app-shell-left-panel")
                {
                    json!({ "result": { "type": "boolean", "value": true } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__mockExplorerLoaded=true;"
                    && !binding_sent
                {
                    binding_sent = true;
                    let payload = json!({
                        "id": "integration-1",
                        "token": request_token.expose(),
                        "method": "explorer.context",
                        "params": {}
                    });
                    socket
                        .send(Message::Text(
                            json!({
                                "method": "Runtime.bindingCalled",
                                "params": {
                                    "name": PRIMARY_BINDING_NAME,
                                    "payload": payload.to_string(),
                                    "executionContextId": 1
                                }
                            })
                            .to_string()
                            .into(),
                        ))
                        .await
                        .expect("binding event");
                } else if method == "Runtime.evaluate" && expression.contains("__codeCodexReceive")
                {
                    return expression.to_owned();
                }
            }
        });

        let target = CdpTarget {
            id: "mock-main".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/mock-main"),
        };
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token.clone());
        let (notification_sender, notifications) = broadcast::channel(4);
        let _notification_sender = notification_sender;
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session = tokio::spawn(async move {
            run_target_session(
                CdpEndpoint::loopback(port),
                target,
                injection,
                Arc::new(EchoHandler),
                Arc::new(AllowEndpointVerifier),
                notifications,
                session_cancellation,
                Duration::ZERO,
                None,
                false,
                Arc::new(Notify::new()),
                1,
                status_sender,
                Arc::new(AtomicBool::new(false)),
                None,
            )
            .await
        });

        let qualified_target = approve_candidate(&mut status_receiver).await;

        let delivered = tokio::time::timeout(Duration::from_secs(5), server)
            .await
            .expect("mock renderer timeout")
            .expect("mock renderer task");
        assert!(delivered.contains("integration-1"));
        assert!(delivered.contains("accepted"));
        assert_eq!(qualified_target, "mock-main");
        cancellation.cancel();
        let result = tokio::time::timeout(Duration::from_secs(2), session)
            .await
            .expect("session stop")
            .expect("session task");
        assert!(
            result.is_ok()
                || result
                    .as_ref()
                    .is_err_and(|error| matches!(error.kind(), CdpError::WebSocket))
        );
    }

    #[tokio::test]
    async fn cold_canonical_renderer_waits_for_completed_document_react_mount() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut layout_probe_count = 0_u8;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    layout_probe_count += 1;
                    json!({
                        "result": {
                            "type": "boolean",
                            // The HTML document is complete before React has
                            // mounted the canonical app shell.
                            "value": layout_probe_count >= 3
                        }
                    })
                } else if method == "Runtime.evaluate" && expression == DOCUMENT_READY_STATE_PROBE {
                    json!({ "result": { "type": "string", "value": "complete" } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__delayedPrimaryLoaded=true;"
                {
                    return layout_probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "delayed-primary".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/delayed-primary"),
        };
        let (_notification_sender, notifications) = broadcast::channel(4);
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new(
                "window.__delayedPrimaryLoaded=true;",
                CapabilityToken::generate(),
            ),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            session_cancellation,
            Duration::ZERO,
            Some(Instant::now() + Duration::from_secs(2)),
            true,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        ));

        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "delayed-primary"
        );
        let probes = tokio::time::timeout(Duration::from_secs(5), server)
            .await
            .expect("delayed primary timeout")
            .expect("mock renderer task");
        assert_eq!(probes, 4);
        cancellation.cancel();
        let result = session.await.expect("session task");
        assert!(
            result.is_ok()
                || result
                    .as_ref()
                    .is_err_and(|error| matches!(error.kind(), CdpError::WebSocket))
        );
    }

    #[tokio::test]
    async fn qualification_nudge_forces_one_fresh_fail_closed_probe() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let (first_probe_sender, first_probe_receiver) = oneshot::channel();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut layout_probe_count = 0_u8;
            let mut first_probe_sender = Some(first_probe_sender);
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    layout_probe_count += 1;
                    json!({ "result": { "type": "boolean", "value": false } })
                } else if method == "Runtime.evaluate" && expression == DOCUMENT_READY_STATE_PROBE {
                    json!({ "result": { "type": "string", "value": "complete" } })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");
                if layout_probe_count == 1 {
                    if let Some(sender) = first_probe_sender.take() {
                        sender.send(()).expect("first probe signal");
                    }
                } else if layout_probe_count == 2 {
                    return layout_probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "nudge-peer".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/nudge-peer"),
        };
        let (_notification_sender, notifications) = broadcast::channel(1);
        let (status_sender, _status_receiver) = mpsc::unbounded_channel();
        let qualification_nudge = Arc::new(Notify::new());
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__neverInjected=true;", CapabilityToken::generate()),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            CancellationToken::new(),
            Duration::ZERO,
            Some(Instant::now() + Duration::from_secs(10)),
            true,
            qualification_nudge.clone(),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        ));

        tokio::time::timeout(Duration::from_secs(2), first_probe_receiver)
            .await
            .expect("first probe timeout")
            .expect("first probe signal");
        qualification_nudge.notify_one();
        let result = tokio::time::timeout(Duration::from_secs(2), session)
            .await
            .expect("nudged session timeout")
            .expect("session task");
        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
        assert_eq!(server.await.expect("mock renderer task"), 2);
    }

    #[tokio::test]
    async fn cold_startup_deadline_rejects_a_late_true_layout_probe() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            loop {
                let Some(Ok(Message::Text(text))) = socket.next().await else {
                    return;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    tokio::time::sleep(Duration::from_millis(750)).await;
                    json!({ "result": { "type": "boolean", "value": true } })
                } else {
                    json!({})
                };
                if socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .is_err()
                {
                    return;
                }
            }
        });

        let target = CdpTarget {
            id: "late-primary".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/late-primary"),
        };
        let (_notification_sender, notifications) = broadcast::channel(1);
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let started = Instant::now();
        let result = run_target_session(
            CdpEndpoint::loopback(port),
            target,
            InjectionConfig::new("window.__neverInjected=true;", CapabilityToken::generate()),
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            CancellationToken::new(),
            Duration::ZERO,
            Some(started + Duration::from_millis(500)),
            true,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        )
        .await;

        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
        assert!(
            status_receiver.try_recv().is_err(),
            "no candidate may escape"
        );
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "the absolute deadline must cap a late true probe"
        );
        tokio::time::timeout(Duration::from_secs(2), server)
            .await
            .expect("late probe server timeout")
            .expect("late probe server task");
    }

    #[tokio::test]
    async fn replacement_session_waits_for_loading_document_and_preserves_first_reload_request() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let token = CapabilityToken::generate();
        let request_token = token.clone();
        let recorded_requests = Arc::new(std::sync::Mutex::new(Vec::new()));
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut layout_probe_count = 0_u8;
            let mut reload_sent = false;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    layout_probe_count += 1;
                    json!({
                        "result": {
                            "type": "boolean",
                            // Probe 1 is a recently-qualified replacement whose
                            // readyState is already complete but React has not
                            // mounted. Probe 4 is the same transient gap during
                            // the captured in-place reload lifecycle.
                            "value": !matches!(layout_probe_count, 1 | 4)
                        }
                    })
                } else if method == "Runtime.evaluate" && expression == DOCUMENT_READY_STATE_PROBE {
                    json!({ "result": { "type": "string", "value": "complete" } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__mockExplorerLoaded=true;"
                    && !reload_sent
                {
                    reload_sent = true;
                    let first_request = json!({
                        "id": "first-reload-request",
                        "token": request_token.expose(),
                        "method": "explorer.watch.stop",
                        "params": {}
                    });
                    // Chromium 150 emits two Runtime clears for one reload.
                    // They, the top-frame navigation, and the preload binding
                    // are one document transition and therefore one epoch.
                    let events = [
                        json!({
                            "method": "Page.frameStartedLoading",
                            "params": { "frameId": "top" }
                        }),
                        json!({ "method": "Runtime.executionContextsCleared", "params": {} }),
                        json!({ "method": "Runtime.executionContextsCleared", "params": {} }),
                        json!({
                            "method": "Page.frameNavigated",
                            "params": {
                                "frame": { "id": "top", "url": "app://-/index.html" }
                            }
                        }),
                        json!({
                            "method": "Runtime.executionContextCreated",
                            "params": {
                                "context": {
                                    "id": 3,
                                    "auxData": { "isDefault": true, "frameId": "top" }
                                }
                            }
                        }),
                        json!({
                            "method": "Runtime.executionContextCreated",
                            "params": {
                                "context": {
                                    "id": 4,
                                    "auxData": { "isDefault": false, "frameId": "top" }
                                }
                            }
                        }),
                        json!({
                            "method": "Runtime.bindingCalled",
                            "params": {
                                "name": PRIMARY_BINDING_NAME,
                                "payload": first_request.to_string(),
                                "executionContextId": 3
                            }
                        }),
                        json!({ "method": "Page.domContentEventFired", "params": {} }),
                        json!({ "method": "Page.loadEventFired", "params": {} }),
                        json!({
                            "method": "Page.frameStoppedLoading",
                            "params": { "frameId": "top" }
                        }),
                    ];
                    for event in events {
                        socket
                            .send(Message::Text(event.to_string().into()))
                            .await
                            .expect("reload lifecycle event");
                    }
                } else if method == "Runtime.evaluate"
                    && expression.contains("first-reload-request")
                {
                    return layout_probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "replacement-main".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!(
                "ws://127.0.0.1:{port}/devtools/page/replacement-main"
            ),
        };
        let handler = Arc::new(EpochRecordingHandler {
            epoch: AtomicU64::new(0),
            requests: recorded_requests,
        });
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token);
        let (_notification_sender, notifications) = broadcast::channel(4);
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session_handler = handler.clone();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            injection,
            session_handler,
            Arc::new(AllowEndpointVerifier),
            notifications,
            session_cancellation,
            INITIAL_RENDERER_QUALIFICATION_TIMEOUT,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        ));
        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "replacement-main"
        );

        let probes = tokio::time::timeout(Duration::from_secs(7), server)
            .await
            .expect("replacement/reload timeout")
            .expect("mock renderer task");
        assert_eq!(probes, 5);
        assert_eq!(handler.epoch.load(AtomicOrdering::Acquire), 1);
        assert_eq!(
            *handler.requests.lock().expect("recorded requests"),
            vec![("first-reload-request".to_owned(), 1)]
        );
        cancellation.cancel();
        let result = session.await.expect("session task");
        assert!(
            result.is_ok()
                || result
                    .as_ref()
                    .is_err_and(|error| matches!(error.kind(), CdpError::WebSocket))
        );
    }

    #[tokio::test]
    async fn navigation_blocks_native_dispatch_until_requalified_and_clears_old_queue() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let token = CapabilityToken::generate();
        let request_token = token.clone();
        let recorded_ids = Arc::new(std::sync::Mutex::new(Vec::new()));
        let ids_for_server = recorded_ids.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut probe_count = 0_u8;
            let mut navigation_sent = false;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    probe_count += 1;
                    if probe_count == 3 {
                        assert!(
                            ids_for_server.lock().expect("recorded ids lock").is_empty(),
                            "native handler ran before post-navigation qualification"
                        );
                    }
                    json!({ "result": { "type": "boolean", "value": true } })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");

                if method == "Runtime.evaluate"
                    && expression == "window.__mockExplorerLoaded=true;"
                    && !navigation_sent
                {
                    navigation_sent = true;
                    let stale = json!({
                        "id": "stale-document-request",
                        "token": request_token.expose(),
                        "method": "explorer.context",
                        "params": {}
                    });
                    let fresh = json!({
                        "id": "fresh-document-request",
                        "token": request_token.expose(),
                        "method": "explorer.context",
                        "params": {}
                    });
                    let events = [
                        json!({
                            "method": "Page.frameNavigated",
                            "params": { "frame": { "id": "top-2", "url": "app://-/index.html" } }
                        }),
                        json!({ "method": "Page.loadEventFired", "params": {} }),
                        json!({
                            "method": "Runtime.bindingCalled",
                            "params": {
                                "name": PRIMARY_BINDING_NAME,
                                "payload": stale.to_string(),
                                "executionContextId": 2
                            }
                        }),
                        json!({
                            "method": "Page.frameNavigated",
                            "params": { "frame": { "id": "top-3", "url": "app://-/index.html" } }
                        }),
                        json!({ "method": "Page.loadEventFired", "params": {} }),
                        json!({
                            "method": "Runtime.bindingCalled",
                            "params": {
                                "name": PRIMARY_BINDING_NAME,
                                "payload": fresh.to_string(),
                                "executionContextId": 3
                            }
                        }),
                    ];
                    for event in events {
                        socket
                            .send(Message::Text(event.to_string().into()))
                            .await
                            .expect("lifecycle event");
                    }
                } else if method == "Runtime.evaluate"
                    && expression.contains("fresh-document-request")
                {
                    return probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "mock-navigation".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/mock-navigation"),
        };
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token);
        let (_notification_sender, notifications) = broadcast::channel(4);
        let cancellation = CancellationToken::new();
        let (status_sender, mut status_receiver) = mpsc::unbounded_channel();
        let session_cancellation = cancellation.clone();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            injection,
            Arc::new(RecordingHandler {
                ids: recorded_ids.clone(),
            }),
            Arc::new(AllowEndpointVerifier),
            notifications,
            session_cancellation,
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        ));
        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "mock-navigation"
        );

        let probes = tokio::time::timeout(Duration::from_secs(7), server)
            .await
            .expect("mock renderer timeout")
            .expect("mock renderer task");
        assert_eq!(probes, 5);
        assert_eq!(
            *recorded_ids.lock().expect("recorded ids lock"),
            vec!["fresh-document-request".to_owned()]
        );
        cancellation.cancel();
        let result = session.await.expect("session task");
        assert!(
            result.is_ok()
                || result
                    .as_ref()
                    .is_err_and(|error| matches!(error.kind(), CdpError::WebSocket))
        );
    }

    #[tokio::test]
    async fn qualified_renderer_is_rechecked_for_its_full_lifetime() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("websocket accept");
            let mut probe_count = 0_u8;
            loop {
                let message = socket
                    .next()
                    .await
                    .expect("client message")
                    .expect("valid websocket message");
                let Message::Text(text) = message else {
                    continue;
                };
                let command: Value = serde_json::from_str(text.as_ref()).expect("CDP command");
                let id = command["id"].as_u64().expect("command ID");
                let method = command["method"].as_str().expect("command method");
                let expression = command["params"]["expression"].as_str().unwrap_or_default();
                let result = if method == "Runtime.evaluate" && expression == RENDERER_LAYOUT_PROBE
                {
                    probe_count += 1;
                    json!({
                        "result": {
                            "type": "boolean",
                            "value": probe_count < 3
                        }
                    })
                } else if method == "Page.addScriptToEvaluateOnNewDocument" {
                    json!({ "identifier": "script-1" })
                } else {
                    json!({})
                };
                socket
                    .send(Message::Text(
                        json!({ "id": id, "result": result }).to_string().into(),
                    ))
                    .await
                    .expect("CDP response");
                if probe_count == 3 {
                    return probe_count;
                }
            }
        });

        let target = CdpTarget {
            id: "mock-lifetime".to_owned(),
            target_type: "page".to_owned(),
            title: "Codex".to_owned(),
            url: "app://-/index.html".to_owned(),
            web_socket_debugger_url: format!("ws://127.0.0.1:{port}/devtools/page/mock-lifetime"),
        };
        let token = CapabilityToken::generate();
        let injection = InjectionConfig::new("window.__mockExplorerLoaded=true;", token);
        let (notification_sender, notifications) = broadcast::channel(4);
        let _notification_sender = notification_sender;
        let cancellation = CancellationToken::new();
        let (status_sender, _status_receiver) = mpsc::unbounded_channel();
        let session = tokio::spawn(run_target_session(
            CdpEndpoint::loopback(port),
            target,
            injection,
            Arc::new(EchoHandler),
            Arc::new(AllowEndpointVerifier),
            notifications,
            cancellation,
            Duration::ZERO,
            None,
            false,
            Arc::new(Notify::new()),
            1,
            status_sender,
            Arc::new(AtomicBool::new(false)),
            None,
        ));

        let mut status_receiver = _status_receiver;
        assert_eq!(
            approve_candidate(&mut status_receiver).await,
            "mock-lifetime"
        );

        let result = tokio::time::timeout(Duration::from_secs(7), session)
            .await
            .expect("session timeout")
            .expect("session task");
        assert!(matches!(result, Err(CdpError::IncompatibleRenderer)));
        assert_eq!(server.await.expect("mock renderer task"), 3);
    }
}

#[cfg(test)]
#[allow(unused_imports)]
mod test_imports {
    pub(super) use async_trait::async_trait;
    pub(super) use base64::Engine as _;
    pub(super) use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    pub(super) use constant_time_eq::constant_time_eq;
    pub(super) use futures_util::{SinkExt, StreamExt};
    pub(super) use rand::RngCore;
    pub(super) use serde::{Deserialize, Serialize};
    pub(super) use serde_json::{Value, json};
    pub(super) use std::collections::{HashMap, HashSet, VecDeque};
    pub(super) use std::error::Error as _;
    pub(super) use std::fmt;
    pub(super) use std::sync::Arc;
    pub(super) use std::sync::Mutex as StdMutex;
    pub(super) use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
    pub(super) use std::time::{Duration, Instant};
    pub(super) use thiserror::Error;
    pub(super) use tokio::sync::{Mutex, Notify, Semaphore, broadcast, mpsc, oneshot};
    pub(super) use tokio::task::{JoinHandle, JoinSet};
    pub(super) use tokio_tungstenite::connect_async_with_config;
    pub(super) use tokio_tungstenite::tungstenite::Message;
    pub(super) use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
    pub(super) use tokio_util::sync::CancellationToken;
    pub(super) use url::Url;
}
#[cfg(test)]
#[allow(unused_imports)]
use test_imports::*;

// Domain modules keep the original public and wire contracts.
#[path = "contracts.rs"]
mod contracts;
use contracts::OutboundMessage;
pub use contracts::{
    BindingRequest, BridgeError, BridgeHandler, BridgeNotification, CapabilityToken, CdpError,
    CdpTarget, EndpointVerifier, InjectionConfig, TargetFilter,
};
#[path = "transport/endpoint.rs"]
mod transport_endpoint;
pub use transport_endpoint::{BrowserVersion, CdpEndpoint, TargetDiscovery};

#[path = "session/delivery.rs"]
mod session_delivery;

use session_delivery::{outbound_expression, outbound_expressions, take_verified_plugin_source};
#[path = "session/gate.rs"]
mod session_gate;

use session_gate::{
    GateState, SecureGate, authorize_binding_request, bounded_binding_payload, dispatch_request,
    valid_method, valid_request_id,
};
#[path = "supervisor/scheduler.rs"]
mod supervisor_scheduler;
pub use supervisor_scheduler::{
    CdpSupervisor, IdlePolicy, SupervisorOptions, SupervisorProgress, SupervisorProgressSnapshot,
};
use supervisor_scheduler::{
    SessionStatus, TargetSession, apply_session_status, candidate_cohort_is_ambiguous,
    candidate_cohort_ready, canonical_renderer_startup_grace, cold_startup_deadline,
    grant_renderer_lease, idle_policy_stops_supervisor, nudge_unresolved_qualifications,
    prune_recently_qualified_targets, recently_qualified_target_grace, register_qualified_target,
    remember_recently_qualified_target, remember_rejected_context,
    retain_live_candidates_and_nudge, stop_all_sessions, stop_stale_sessions,
    validate_target_budget, wait_for_candidate_approval,
};
#[path = "session/runner.rs"]
mod session_runner;

use session_runner::{run_target_session, sleep_or_cancel};
#[path = "qualification/document.rs"]
mod qualification_document;

use qualification_document::{
    binding_execution_context, bootstrap_evaluation_succeeded, delivery_expression,
    initial_qualification_retry_timeout, is_trusted_app_url, layout_observation,
    renderer_document_is_loading, renderer_probe_matches, retain_setup_lifecycle_event,
    setup_contains_top_navigation, top_frame_navigation_url, top_frame_started_loading,
    validate_websocket_url,
};
#[path = "transport/commands.rs"]
mod transport_commands;

use transport_commands::{
    parse_cdp_message, send_command, send_command_before_deadline, wait_for_command,
    wait_for_command_before_deadline,
};
