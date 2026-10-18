//! A small JSONL client for the official Codex App Server protocol.
//!
//! The desktop renderer owns the notion of the *active* thread. This client
//! accepts that thread ID and uses `thread/read` (with `thread/list` fallback)
//! to resolve its stable `cwd` field. It does not inspect Codex databases.

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use serde_json::{Value, json};
use thiserror::Error;
use tokio::io::{AsyncBufRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock, broadcast, oneshot};

#[cfg(windows)]
use process_wrap::tokio::{CreationFlags, JobObject};
use process_wrap::tokio::{KillOnDrop, TokioChildWrapper, TokioCommandWrap};
#[cfg(windows)]
use windows::Win32::System::Threading::CREATE_NO_WINDOW;

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_MESSAGE_BYTES: usize = 4 * 1024 * 1024;
const THREAD_LIST_PAGE_SIZE: usize = 100;
const MAX_THREAD_LIST_PAGES: usize = 10;
type DiagnosticObserver = fn(&str, &str, &str, Value);
static DIAGNOSTIC_OBSERVER: std::sync::OnceLock<DiagnosticObserver> = std::sync::OnceLock::new();
/// Records protocol metadata only; bodies, task IDs and workspace paths are excluded.
pub fn set_diagnostic_observer(observer: DiagnosticObserver) {
    let _ = DIAGNOSTIC_OBSERVER.set(observer);
}
fn diagnostic(action: &str, outcome: &str, details: Value) {
    if let Some(observer) = DIAGNOSTIC_OBSERVER.get() {
        observer("app-server", action, outcome, details);
    }
}
struct RequestTrace {
    started: std::time::Instant,
    method: String,
    number: u64,
    finished: bool,
}
impl RequestTrace {
    fn new(method: &str, number: u64, timeout: Duration) -> Self {
        let method = if ["initialize", "thread/read", "thread/list"].contains(&method) {
            method
        } else {
            "other"
        }
        .to_owned();
        diagnostic(
            "request",
            "started",
            json!({"method":method,"requestNumber":number,"timeoutMs":timeout.as_millis()}),
        );
        Self {
            started: std::time::Instant::now(),
            method,
            number,
            finished: false,
        }
    }
    fn finish(&mut self, outcome: &str, error: Option<&ResolverError>) {
        diagnostic(
            "request",
            outcome,
            json!({"method":self.method,"requestNumber":self.number,"durationMs":self.started.elapsed().as_millis(),"reason":error.map(ToString::to_string),"code":error.map(|error|match error.kind(){ResolverError::Timeout=>"APP_TIMEOUT",ResolverError::Spawn=>"APP_SPAWN",ResolverError::Io=>"APP_IO",ResolverError::Remote{..}=>"APP_REMOTE",_=>"APP_PROTOCOL"})}),
        );
        self.finished = true;
    }
}
impl Drop for RequestTrace {
    fn drop(&mut self) {
        if !self.finished {
            self.finish("interrupted", None);
        }
    }
}

#[derive(Debug, Clone, Error)]
pub enum ResolverError {
    #[error("{operation}: {error}; {detail}")]
    Context {
        operation: &'static str,
        detail: String,
        #[source]
        error: Box<ResolverError>,
    },
    #[error("the App Server process could not be started")]
    Spawn,
    #[error("App Server I/O failed")]
    Io,
    #[error("App Server returned invalid protocol data")]
    Protocol,
    #[error("App Server request timed out")]
    Timeout,
    #[error("App Server returned error code {code}")]
    Remote { code: i64 },
    #[error("the thread has no local workspace")]
    NoWorkspace,
    #[error("the thread ID is invalid")]
    InvalidThreadId,
}

impl ResolverError {
    pub fn context(self, operation: &'static str, detail: impl std::fmt::Display) -> Self {
        Self::Context {
            operation,
            detail: detail.to_string().chars().take(2048).collect(),
            error: Box::new(self),
        }
    }
    pub fn kind(&self) -> &Self {
        match self {
            Self::Context { error, .. } => error.kind(),
            other => other,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppServerCommand {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub current_dir: Option<PathBuf>,
    pub environment: Vec<(OsString, OsString)>,
}

impl AppServerCommand {
    #[must_use]
    pub fn codex(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            args: vec![
                OsString::from("app-server"),
                OsString::from("--listen"),
                OsString::from("stdio://"),
            ],
            current_dir: None,
            environment: Vec::new(),
        }
    }

    /// Isolate a packaged App Server from a user-writable current directory
    /// and inherited executable/DLL search path. Callers intentionally do not
    /// use this for an explicitly authorized development override.
    #[must_use]
    pub fn with_isolated_windows_search(
        mut self,
        current_dir: impl Into<PathBuf>,
        trusted_path: impl Into<OsString>,
    ) -> Self {
        self.current_dir = Some(current_dir.into());
        self.environment
            .push((OsString::from("PATH"), trusted_path.into()));
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreadWorkspace {
    pub thread_id: String,
    pub cwd: PathBuf,
}

type DynWriter = Box<dyn AsyncWrite + Unpin + Send>;

struct Inner {
    writer: Mutex<DynWriter>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, ResolverError>>>>,
    next_id: AtomicU64,
    timeout: Duration,
    workspaces: RwLock<HashMap<String, PathBuf>>,
    notifications: broadcast::Sender<Value>,
    child: Mutex<Option<Box<dyn TokioChildWrapper>>>,
    // The read loop owns another Arc to this slot. A launch guard therefore
    // survives client/child drop until stdout reaches EOF (actual process
    // exit), including initialization-failure paths.
    _lifetime_guard: Arc<StdMutex<Option<Box<dyn Send + Sync>>>>,
}

#[derive(Clone)]
pub struct AppServerClient {
    inner: Arc<Inner>,
}

impl AppServerClient {
    pub async fn connect(command: &AppServerCommand) -> Result<Self, ResolverError> {
        Self::connect_inner(command, None).await
    }

    pub async fn connect_guarded<G>(
        command: &AppServerCommand,
        guard: G,
    ) -> Result<Self, ResolverError>
    where
        G: Send + Sync + 'static,
    {
        Self::connect_inner(command, Some(Box::new(guard))).await
    }

    async fn connect_inner(
        command: &AppServerCommand,
        guard: Option<Box<dyn Send + Sync>>,
    ) -> Result<Self, ResolverError> {
        let mut process = Command::new(&command.program);
        process
            .args(&command.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(current_dir) = &command.current_dir {
            process.current_dir(current_dir);
        }
        for (name, value) in &command.environment {
            process.env(name, value);
        }
        let mut process = TokioCommandWrap::from(process);
        #[cfg(windows)]
        process.wrap(CreationFlags(CREATE_NO_WINDOW));
        process.wrap(KillOnDrop);
        #[cfg(windows)]
        process.wrap(JobObject);
        let mut child = process.spawn().map_err(|error| {
            ResolverError::Spawn.context(
                "starting App Server child",
                format!(
                    "ioKind={:?}; osCode={:?}; cause={error}",
                    error.kind(),
                    error.raw_os_error()
                ),
            )
        })?;
        let stdout = child.stdout().take().ok_or_else(|| {
            ResolverError::Spawn.context("acquiring App Server stdout", "child has no piped stdout")
        })?;
        let stdin = child.stdin().take().ok_or_else(|| {
            ResolverError::Spawn.context("acquiring App Server stdin", "child has no piped stdin")
        })?;
        let stderr_task = child.stderr().take().map(|mut stderr| tokio::spawn(async move {
            let mut bytes = [0_u8; 2048]; let mut total = 0_u64;
            loop { match stderr.read(&mut bytes).await {
                Ok(0) => break,
                Ok(n) => { total=total.saturating_add(n as u64); },
                Err(e) => { diagnostic("stderr drain","failed",json!({"code":"APP_STDERR_READ","ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error()}));break; }
            }}
            diagnostic("stderr drain","closed",json!({"bytesObserved":total,"contentOmitted":true,"interpretation":"stderr bytes alone do not establish a startup failure"}));
        }));
        let client = match Self::connect_io_inner(BufReader::new(stdout), stdin, guard).await {
            Ok(client) => client,
            Err(error) => {
                let exit = child.try_wait();
                diagnostic(
                    "initialization child state",
                    "failed",
                    json!({"code":"APP_INITIALIZE_FAILED","exitCode":exit.as_ref().ok().and_then(|v|v.as_ref()).and_then(|v|v.code()),"stillRunning":matches!(exit,Ok(None)),"exitObservationError":exit.err().map(|e|e.to_string()),"reason":error.to_string()}),
                );
                if let Some(task) = stderr_task {
                    task.abort();
                }
                return Err(error);
            }
        };
        *client.inner.child.lock().await = Some(child);
        Ok(client)
    }

    /// Connect using arbitrary async streams. Primarily useful for protocol
    /// conformance tests and embedders.
    pub async fn connect_io<R, W>(reader: R, writer: W) -> Result<Self, ResolverError>
    where
        R: AsyncBufRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        Self::connect_io_inner(reader, writer, None).await
    }

    async fn connect_io_inner<R, W>(
        reader: R,
        writer: W,
        guard: Option<Box<dyn Send + Sync>>,
    ) -> Result<Self, ResolverError>
    where
        R: AsyncBufRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        let (notifications, _) = broadcast::channel(128);
        let lifetime_guard = Arc::new(StdMutex::new(guard));
        let inner = Arc::new(Inner {
            writer: Mutex::new(Box::new(writer)),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            timeout: DEFAULT_REQUEST_TIMEOUT,
            workspaces: RwLock::new(HashMap::new()),
            notifications,
            child: Mutex::new(None),
            _lifetime_guard: lifetime_guard.clone(),
        });
        tokio::spawn(read_loop(Arc::downgrade(&inner), reader, lifetime_guard));
        let client = Self { inner };
        client.initialize().await?;
        Ok(client)
    }

    async fn initialize(&self) -> Result<(), ResolverError> {
        let _: Value = self
            .request(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "code-codex",
                        "title": "Code-Codex",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": { "experimentalApi": false }
                }),
            )
            .await?;
        self.notify_without_params("initialized").await
    }

    pub async fn resolve_thread(&self, thread_id: &str) -> Result<ThreadWorkspace, ResolverError> {
        validate_thread_id(thread_id)?;
        if let Some(cwd) = self.inner.workspaces.read().await.get(thread_id).cloned() {
            return Ok(ThreadWorkspace {
                thread_id: thread_id.to_owned(),
                cwd,
            });
        }

        match self
            .request(
                "thread/read",
                json!({ "threadId": thread_id, "includeTurns": false }),
            )
            .await
        {
            Ok(result) => {
                let workspace = parse_thread_workspace(&result, "thread", thread_id)?;
                self.cache(&workspace).await;
                Ok(workspace)
            }
            Err(error) if matches!(error.kind(), ResolverError::Remote { .. }) => {
                self.resolve_from_list(thread_id).await
            }
            Err(error) => Err(error),
        }
    }

    async fn resolve_from_list(&self, thread_id: &str) -> Result<ThreadWorkspace, ResolverError> {
        let mut cursor: Option<String> = None;
        for _ in 0..MAX_THREAD_LIST_PAGES {
            let result = self
                .request(
                    "thread/list",
                    json!({
                        "limit": THREAD_LIST_PAGE_SIZE,
                        "cursor": cursor.as_deref(),
                        "archived": false,
                        "useStateDbOnly": true
                    }),
                )
                .await?;
            let threads = result
                .get("data")
                .and_then(Value::as_array)
                .ok_or(ResolverError::Protocol)?;
            for thread in threads {
                if thread.get("id").and_then(Value::as_str) == Some(thread_id) {
                    let cwd = thread
                        .get("cwd")
                        .and_then(Value::as_str)
                        .filter(|cwd| !cwd.is_empty())
                        .ok_or(ResolverError::NoWorkspace)?;
                    let workspace = ThreadWorkspace {
                        thread_id: thread_id.to_owned(),
                        cwd: PathBuf::from(cwd),
                    };
                    self.cache(&workspace).await;
                    return Ok(workspace);
                }
            }

            let next_cursor = result
                .get("nextCursor")
                .and_then(Value::as_str)
                .filter(|next| !next.is_empty())
                .map(str::to_owned);
            if next_cursor.is_none() {
                return Err(ResolverError::NoWorkspace);
            }
            if next_cursor == cursor {
                return Err(ResolverError::Protocol);
            }
            cursor = next_cursor;
        }
        Err(ResolverError::NoWorkspace)
    }

    async fn cache(&self, workspace: &ThreadWorkspace) {
        self.inner
            .workspaces
            .write()
            .await
            .insert(workspace.thread_id.clone(), workspace.cwd.clone());
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, ResolverError> {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let mut trace = RequestTrace::new(method, id, self.inner.timeout);
        let result=async {
        if method.is_empty() || method.len() > 128 {
            return Err(ResolverError::Protocol);
        }
        let message = json!({ "id": id, "method": method, "params": params });
        let mut encoded = serde_json::to_vec(&message).map_err(|_| ResolverError::Protocol)?;
        if encoded.len() > MAX_MESSAGE_BYTES {
            return Err(ResolverError::Protocol);
        }
        encoded.push(b'\n');
        let (sender, receiver) = oneshot::channel();
        self.inner.pending.lock().await.insert(id, sender);
        let write_result = async {
            let mut writer = self.inner.writer.lock().await;
            writer.write_all(&encoded).await?;
            writer.flush().await
        }
        .await;
        if let Err(e)=write_result {
            diagnostic("request write","failed",json!({"requestNumber":id,"ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error()}));
            self.inner.pending.lock().await.remove(&id);
            return Err(ResolverError::Io.context("writing App Server request", format!("requestNumber={id}; ioKind={:?}; osCode={:?}; cause={e}",e.kind(),e.raw_os_error())));
        }
        match tokio::time::timeout(self.inner.timeout, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => Err(ResolverError::Io.context("waiting for App Server reply", format!("requestNumber={id}; response channel closed; cause={error}"))),
            Err(_) => {
                self.inner.pending.lock().await.remove(&id);
                Err(ResolverError::Timeout.context("waiting for App Server reply", format!("requestNumber={id}; timeoutMs={}",self.inner.timeout.as_millis())))
            }
        }
        }.await;
        let result = result.map_err(|error| {
            error.context(
                "App Server request",
                format!(
                    "method={}; requestNumber={id}; timeoutMs={}",
                    trace.method,
                    self.inner.timeout.as_millis()
                ),
            )
        });
        trace.finish(
            if result.is_ok() { "passed" } else { "failed" },
            result.as_ref().err(),
        );
        result
    }

    pub async fn notify(&self, method: &str, params: Value) -> Result<(), ResolverError> {
        let message = json!({ "method": method, "params": params });
        self.write_notification(message).await
    }

    async fn notify_without_params(&self, method: &str) -> Result<(), ResolverError> {
        let message = json!({ "method": method });
        self.write_notification(message).await
    }

    async fn write_notification(&self, message: Value) -> Result<(), ResolverError> {
        let mut encoded = serde_json::to_vec(&message).map_err(|_| ResolverError::Protocol)?;
        encoded.push(b'\n');
        let mut writer = self.inner.writer.lock().await;
        writer.write_all(&encoded).await.map_err(|error| {
            ResolverError::Io.context(
                "writing App Server notification",
                format!(
                    "ioKind={:?}; osCode={:?}; cause={error}",
                    error.kind(),
                    error.raw_os_error()
                ),
            )
        })?;
        writer.flush().await.map_err(|error| {
            ResolverError::Io.context(
                "flushing App Server notification",
                format!(
                    "ioKind={:?}; osCode={:?}; cause={error}",
                    error.kind(),
                    error.raw_os_error()
                ),
            )
        })
    }

    #[must_use]
    pub fn subscribe_notifications(&self) -> broadcast::Receiver<Value> {
        self.inner.notifications.subscribe()
    }
}

pub fn executable_exists(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {

    #[test]
    fn context_keeps_resolver_error_family_and_bounded_details() {
        let error = ResolverError::Timeout
            .context("reply wait", "timeoutMs=10")
            .context("request", "method=thread/read; requestNumber=3");
        assert!(matches!(error.kind(), ResolverError::Timeout));
        let text = error.to_string();
        assert!(text.contains("method=thread/read"));
        assert!(text.contains("timeoutMs=10"));
        assert!(matches!(
            ResolverError::Remote { code: 42 }
                .context("request", "method=thread/read")
                .kind(),
            ResolverError::Remote { code: 42 }
        ));
        assert!(
            ResolverError::Io
                .context("bounded", "x".repeat(4096))
                .to_string()
                .len()
                < 2200
        );
    }

    use std::sync::atomic::{AtomicBool, Ordering};

    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, duplex, split};
    use tokio::sync::oneshot;

    use super::*;

    struct DropProbe(Arc<AtomicBool>);

    impl Drop for DropProbe {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }

    async fn wait_for_probe(probe: &AtomicBool) {
        tokio::time::timeout(Duration::from_secs(1), async {
            while !probe.load(Ordering::Acquire) {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("guard drop");
    }

    #[test]
    fn isolated_search_settings_are_opt_in() {
        let ordinary = AppServerCommand::codex("codex.exe");
        assert!(ordinary.current_dir.is_none());
        assert!(ordinary.environment.is_empty());

        let isolated = ordinary
            .clone()
            .with_isolated_windows_search(r"C:\locked-stage", r"C:\Windows\System32");
        assert_eq!(
            isolated.current_dir,
            Some(PathBuf::from(r"C:\locked-stage"))
        );
        assert_eq!(
            isolated.environment,
            vec![(
                OsString::from("PATH"),
                OsString::from(r"C:\Windows\System32")
            )]
        );
        assert!(ordinary.current_dir.is_none());
        assert!(ordinary.environment.is_empty());
    }

    #[tokio::test]
    async fn launch_guard_survives_last_client_until_reader_eof() {
        let (client_read, mut server_write) = duplex(16 * 1024);
        let (client_write, server_read) = duplex(16 * 1024);
        let (release, released) = oneshot::channel::<()>();
        let (closed, client_closed) = oneshot::channel::<()>();
        let server = tokio::spawn(async move {
            let mut reader = BufReader::new(server_read);
            let mut line = String::new();
            reader.read_line(&mut line).await.expect("initialize read");
            let initialize: Value = serde_json::from_str(&line).expect("initialize json");
            let id = initialize["id"].as_u64().expect("initialize id");
            server_write
                .write_all(format!("{{\"id\":{id},\"result\":{{}}}}\n").as_bytes())
                .await
                .expect("initialize response");
            line.clear();
            reader.read_line(&mut line).await.expect("initialized read");
            line.clear();
            assert_eq!(reader.read_line(&mut line).await.expect("client EOF"), 0);
            let _ = closed.send(());
            let _ = released.await;
        });

        let dropped = Arc::new(AtomicBool::new(false));
        let client = AppServerClient::connect_io_inner(
            BufReader::new(client_read),
            client_write,
            Some(Box::new(DropProbe(dropped.clone()))),
        )
        .await
        .expect("connect");
        drop(client);
        tokio::time::timeout(Duration::from_secs(1), client_closed)
            .await
            .expect("client writer close")
            .expect("client close signal");
        assert!(!dropped.load(Ordering::Acquire));

        let _ = release.send(());
        server.await.expect("server task");
        wait_for_probe(&dropped).await;
    }

    #[tokio::test]
    async fn initialization_failure_guard_survives_until_reader_eof() {
        let (client_read, mut server_write) = duplex(16 * 1024);
        let (client_write, server_read) = duplex(16 * 1024);
        let (release, released) = oneshot::channel::<()>();
        let (closed, client_closed) = oneshot::channel::<()>();
        let server = tokio::spawn(async move {
            let mut reader = BufReader::new(server_read);
            let mut line = String::new();
            reader.read_line(&mut line).await.expect("initialize read");
            let initialize: Value = serde_json::from_str(&line).expect("initialize json");
            let id = initialize["id"].as_u64().expect("initialize id");
            server_write
                .write_all(format!("{{\"id\":{id},\"error\":{{\"code\":-32000}}}}\n").as_bytes())
                .await
                .expect("initialize error");
            line.clear();
            assert_eq!(reader.read_line(&mut line).await.expect("client EOF"), 0);
            let _ = closed.send(());
            let _ = released.await;
        });

        let dropped = Arc::new(AtomicBool::new(false));
        let result = AppServerClient::connect_io_inner(
            BufReader::new(client_read),
            client_write,
            Some(Box::new(DropProbe(dropped.clone()))),
        )
        .await;
        assert!(result.is_err());
        tokio::time::timeout(Duration::from_secs(1), client_closed)
            .await
            .expect("client writer close")
            .expect("client close signal");
        assert!(!dropped.load(Ordering::Acquire));

        let _ = release.send(());
        server.await.expect("server task");
        wait_for_probe(&dropped).await;
    }

    #[tokio::test]
    async fn initializes_and_resolves_thread_cwd() {
        let (client_stream, server_stream) = duplex(16 * 1024);
        let (client_read, client_write) = split(client_stream);
        let (server_read, mut server_write) = split(server_stream);
        let server = tokio::spawn(async move {
            let mut reader = BufReader::new(server_read);
            let mut line = String::new();

            reader.read_line(&mut line).await.expect("initialize read");
            let initialize: Value = serde_json::from_str(&line).expect("initialize json");
            assert_eq!(initialize["method"], "initialize");
            let id = initialize["id"].as_u64().expect("initialize id");
            server_write
                .write_all(format!("{{\"id\":{id},\"result\":{{}}}}\n").as_bytes())
                .await
                .expect("initialize response");

            line.clear();
            reader.read_line(&mut line).await.expect("initialized read");
            let initialized: Value = serde_json::from_str(&line).expect("initialized json");
            assert_eq!(initialized["method"], "initialized");
            assert!(initialized.get("params").is_none());

            line.clear();
            reader.read_line(&mut line).await.expect("thread read");
            let request: Value = serde_json::from_str(&line).expect("thread json");
            assert_eq!(request["method"], "thread/read");
            let id = request["id"].as_u64().expect("thread id");
            server_write
                .write_all(
                    format!(
                        "{{\"id\":{id},\"result\":{{\"thread\":{{\"id\":\"thread-1\",\"cwd\":\"C:\\\\work\\\\demo\"}}}}}}\n"
                    )
                    .as_bytes(),
                )
                .await
                .expect("thread response");
        });

        let client = AppServerClient::connect_io(BufReader::new(client_read), client_write)
            .await
            .expect("connect");
        let workspace = client.resolve_thread("thread-1").await.expect("resolve");
        assert_eq!(workspace.cwd, PathBuf::from(r"C:\work\demo"));
        server.await.expect("server task");
    }

    #[test]
    fn thread_read_requires_an_exact_response_identifier() {
        let missing = json!({ "thread": { "cwd": "C:\\work" } });
        assert!(parse_thread_workspace(&missing, "thread", "thread-1").is_err());
        let mismatch = json!({ "thread": { "id": "thread-2", "cwd": "C:\\work" } });
        assert!(parse_thread_workspace(&mismatch, "thread", "thread-1").is_err());
        let exact = json!({ "thread": { "id": "thread-1", "cwd": "C:\\work" } });
        assert!(parse_thread_workspace(&exact, "thread", "thread-1").is_ok());
    }

    #[tokio::test]
    async fn thread_list_fallback_is_cursor_paginated() {
        let (client_stream, server_stream) = duplex(32 * 1024);
        let (client_read, client_write) = split(client_stream);
        let (server_read, mut server_write) = split(server_stream);
        let server = tokio::spawn(async move {
            let mut reader = BufReader::new(server_read);
            let mut line = String::new();

            reader.read_line(&mut line).await.expect("initialize read");
            let request: Value = serde_json::from_str(&line).expect("initialize json");
            let id = request["id"].as_u64().expect("initialize id");
            server_write
                .write_all(format!("{{\"id\":{id},\"result\":{{}}}}\n").as_bytes())
                .await
                .expect("initialize response");

            line.clear();
            reader.read_line(&mut line).await.expect("initialized read");
            line.clear();
            reader.read_line(&mut line).await.expect("thread read");
            let request: Value = serde_json::from_str(&line).expect("thread read json");
            let id = request["id"].as_u64().expect("thread read id");
            server_write
                .write_all(format!("{{\"id\":{id},\"error\":{{\"code\":-32601}}}}\n").as_bytes())
                .await
                .expect("thread read error");

            line.clear();
            reader.read_line(&mut line).await.expect("first list");
            let first: Value = serde_json::from_str(&line).expect("first list json");
            assert_eq!(first["method"], "thread/list");
            assert_eq!(first["params"]["cursor"], Value::Null);
            assert_eq!(first["params"]["archived"], false);
            assert_eq!(first["params"]["useStateDbOnly"], true);
            let id = first["id"].as_u64().expect("first list id");
            server_write
                .write_all(
                    format!(
                        "{{\"id\":{id},\"result\":{{\"data\":[],\"nextCursor\":\"page-2\"}}}}\n"
                    )
                    .as_bytes(),
                )
                .await
                .expect("first list response");

            line.clear();
            reader.read_line(&mut line).await.expect("second list");
            let second: Value = serde_json::from_str(&line).expect("second list json");
            assert_eq!(second["params"]["cursor"], "page-2");
            assert_eq!(second["params"]["archived"], false);
            assert_eq!(second["params"]["useStateDbOnly"], true);
            let id = second["id"].as_u64().expect("second list id");
            server_write
                .write_all(
                    format!(
                        "{{\"id\":{id},\"result\":{{\"data\":[{{\"id\":\"thread-9\",\"cwd\":\"C:\\\\work\\\\paged\"}}],\"nextCursor\":null}}}}\n"
                    )
                    .as_bytes(),
                )
                .await
                .expect("second list response");
        });

        let client = AppServerClient::connect_io(BufReader::new(client_read), client_write)
            .await
            .expect("connect");
        let workspace = client.resolve_thread("thread-9").await.expect("resolve");
        assert_eq!(workspace.cwd, PathBuf::from(r"C:\work\paged"));
        server.await.expect("server task");
    }

    #[test]
    fn rejects_untrusted_thread_identifiers() {
        for invalid in [
            "",
            "../thread",
            "thread/id",
            "a thread",
            "client-new-thread:cf82454b-fadc-48b0-9ce0-e5e3221a00d2",
            "💥",
        ] {
            assert!(validate_thread_id(invalid).is_err());
        }
    }
}

#[cfg(test)]
#[allow(unused_imports)]
mod test_imports {
    #[cfg(windows)]
    pub(super) use process_wrap::tokio::{CreationFlags, JobObject};
    pub(super) use process_wrap::tokio::{KillOnDrop, TokioChildWrapper, TokioCommandWrap};
    pub(super) use serde_json::{Value, json};
    pub(super) use std::collections::HashMap;
    pub(super) use std::ffi::OsString;
    pub(super) use std::path::{Path, PathBuf};
    pub(super) use std::process::Stdio;
    pub(super) use std::sync::atomic::{AtomicU64, Ordering};
    pub(super) use std::sync::{Arc, Mutex as StdMutex, Weak};
    pub(super) use std::time::Duration;
    pub(super) use thiserror::Error;
    pub(super) use tokio::io::{
        AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader,
    };
    pub(super) use tokio::process::Command;
    pub(super) use tokio::sync::{Mutex, RwLock, broadcast, oneshot};
    #[cfg(windows)]
    pub(super) use windows::Win32::System::Threading::CREATE_NO_WINDOW;
}
#[cfg(test)]
#[allow(unused_imports)]
use test_imports::*;

// Domain modules keep the original public and wire contracts.
#[path = "client.rs"]
mod client;

use client::read_loop;
#[path = "workspace_context.rs"]
mod workspace_context;

use workspace_context::{parse_started_notification, parse_thread_workspace, validate_thread_id};
