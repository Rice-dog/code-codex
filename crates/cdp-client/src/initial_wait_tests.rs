// Wire-level regressions for a complete HTML document before native UI mounts.
async fn initial_wait_case(mode: &'static str, policy: IdlePolicy, finish_ready: bool) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let mounted = Arc::new(AtomicBool::new(false));
    let bootstrap = Arc::new(AtomicUsize::new(0));
    let server_mounted = mounted.clone();
    let server_bootstrap = bootstrap.clone();
    let server = tokio::spawn(async move {
        let mut connections = JoinSet::new();
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mounted = server_mounted.clone();
            let bootstrap = server_bootstrap.clone();
            connections.spawn(async move {
                let mut prefix = [0; 2048];
                let count = stream.peek(&mut prefix).await.unwrap();
                if String::from_utf8_lossy(&prefix[..count]).starts_with("GET /json/list") {
                    let ready = mounted.load(AtomicOrdering::Acquire);
                    let body = if mode == "empty" && !ready { "[]".to_owned() }
                    else if mode == "list-error" && !ready { "temporary unavailable".to_owned() }
                    else { json!([{"id":"initial-main","type":"page","title":"","url":"app://-/index.html","webSocketDebuggerUrl":format!("ws://127.0.0.1:{port}/devtools/page/initial-main")}]).to_string() };
                    let status = if mode == "list-error" && !ready { 503 } else { 200 };
                    let _ = stream.read(&mut prefix).await;
                    stream.write_all(format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
                    return;
                }
                let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                while let Some(Ok(Message::Text(text))) = socket.next().await {
                    let command: Value = serde_json::from_str(text.as_ref()).unwrap();
                    let expression = command["params"]["expression"].as_str().unwrap_or_default();
                    let result = if expression == RENDERER_LAYOUT_PROBE {
                        json!({"result":{"type":"boolean","value":mounted.load(AtomicOrdering::Acquire)}})
                    } else if expression == DOCUMENT_READY_STATE_PROBE {
                        json!({"result":{"type":"string","value":"complete"}})
                    } else if command["method"] == "Page.addScriptToEvaluateOnNewDocument" {
                        assert!(mounted.load(AtomicOrdering::Acquire), "no binding/bootstrap before DOM qualifies");
                        json!({"identifier":"initial-script"})
                    } else if expression == "window.__initialWaitFixture=true;" {
                        assert!(mounted.load(AtomicOrdering::Acquire));
                        bootstrap.fetch_add(1, AtomicOrdering::AcqRel);
                        json!({"result":{"type":"undefined"}})
                    } else { json!({}) };
                    if socket.send(Message::Text(json!({"id":command["id"],"result":result}).to_string().into())).await.is_err() { break; }
                }
            });
        }
    });
    let mut options = SupervisorOptions::for_endpoint(CdpEndpoint::loopback(port));
    options.poll_interval = Duration::from_millis(15);
    options.startup_timeout = Duration::from_millis(80);
    options.idle_policy = policy;
    let progress = Arc::new(SupervisorProgress::default());
    options.progress = Some(progress.clone());
    let supervisor = CdpSupervisor::new(
        options,
        InjectionConfig::new(
            "window.__initialWaitFixture=true;",
            CapabilityToken::generate(),
        ),
        Arc::new(EchoHandler),
        Arc::new(AllowEndpointVerifier),
    )
    .unwrap();
    let cancellation = CancellationToken::new();
    let running = tokio::spawn(supervisor.run(cancellation.clone()));
    tokio::time::sleep(Duration::from_millis(350)).await;
    assert_eq!(bootstrap.load(AtomicOrdering::Acquire), 0);
    if policy == IdlePolicy::ExitAfterTimeout {
        assert!(
            running.is_finished(),
            "explicit attach keeps its absolute deadline"
        );
        assert!(running.await.unwrap().is_err());
    } else {
        assert!(
            !running.is_finished(),
            "an unmounted document must not end the owned launch"
        );
        assert!(progress.snapshot().initial_waiting);
        assert_eq!(
            progress
                .snapshot()
                .events
                .iter()
                .filter(|s| s.ends_with("initial_renderer_waiting"))
                .count(),
            1
        );
        if finish_ready {
            mounted.store(true, AtomicOrdering::Release);
            tokio::time::timeout(Duration::from_secs(4), async {
                while bootstrap.load(AtomicOrdering::Acquire) == 0 {
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
            })
            .await
            .expect("late native mount must inject without relaunch");
            assert!(!progress.snapshot().initial_waiting);
            assert!(progress.snapshot().initial_wait_observed);
        }
        cancellation.cancel();
        tokio::time::timeout(Duration::from_secs(2), running)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn owned_initial_complete_document_waits_then_mounts_without_relaunch() {
    initial_wait_case("blank", IdlePolicy::RecoverUntilCancelled, true).await;
}
#[tokio::test]
async fn owned_initial_empty_target_list_recovers_after_budget() {
    initial_wait_case("empty", IdlePolicy::RecoverUntilCancelled, true).await;
}
#[tokio::test]
async fn owned_initial_endpoint_error_recovers_after_budget() {
    initial_wait_case("list-error", IdlePolicy::RecoverUntilCancelled, true).await;
}
#[tokio::test]
async fn owned_initial_wait_is_cancellable_without_native_mount() {
    initial_wait_case("blank", IdlePolicy::RecoverUntilCancelled, false).await;
}
#[tokio::test]
async fn explicit_initial_attach_remains_bounded() {
    initial_wait_case("blank", IdlePolicy::ExitAfterTimeout, false).await;
}
