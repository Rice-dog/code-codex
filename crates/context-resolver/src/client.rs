use tokio::io::AsyncBufReadExt;

use std::sync::{Arc, Mutex as StdMutex, Weak};

use serde_json::{Value, json};

use tokio::io::AsyncBufRead;

use super::{Inner, MAX_MESSAGE_BYTES, ResolverError, diagnostic, parse_started_notification};

pub(super) async fn read_loop<R>(
    inner: Weak<Inner>,
    mut reader: R,
    _lifetime_guard: Arc<StdMutex<Option<Box<dyn Send + Sync>>>>,
) where
    R: AsyncBufRead + Unpin,
{
    let mut line = String::new();
    let mut terminal = ResolverError::Io.context(
        "reading App Server stdout",
        "stream ended (EOF); child exit code not observed here",
    );
    loop {
        line.clear();
        let read = match reader.read_line(&mut line).await {
            Ok(read) => read,
            Err(error) => {
                terminal = ResolverError::Io.context(
                    "reading App Server stdout",
                    format!(
                        "ioKind={:?}; osCode={:?}; cause={error}",
                        error.kind(),
                        error.raw_os_error()
                    ),
                );
                diagnostic(
                    "transport read",
                    "failed",
                    json!({"ioKind":format!("{:?}",error.kind()),"osErrorCode":error.raw_os_error()}),
                );
                break;
            }
        };
        if read == 0 {
            diagnostic("transport read", "closed", json!({"reason":"EOF"}));
            break;
        }
        if line.len() > MAX_MESSAGE_BYTES {
            terminal = ResolverError::Protocol.context(
                "reading App Server frame",
                format!("observedBytes={}; maxBytes={MAX_MESSAGE_BYTES}", line.len()),
            );
            diagnostic(
                "protocol frame",
                "failed",
                json!({"observedBytes":line.len(),"maxBytes":MAX_MESSAGE_BYTES}),
            );
            break;
        }
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            diagnostic(
                "protocol frame",
                "rejected",
                json!({"code":"APP_PROTOCOL","reason":"Invalid JSON","observedBytes":line.len(),"parseLocation":serde_json::from_str::<Value>(&line).err().map(|error|format!("line={}, column={}, category={:?}",error.line(),error.column(),error.classify()))}),
            );
            continue;
        };
        let Some(inner) = inner.upgrade() else {
            break;
        };
        if let Some(id) = message.get("id").and_then(Value::as_u64) {
            if let Some(sender) = inner.pending.lock().await.remove(&id) {
                let result = if let Some(error) = message.get("error") {
                    Err(ResolverError::Remote {
                        code: error.get("code").and_then(Value::as_i64).unwrap_or(-1),
                    })
                } else {
                    message
                        .get("result")
                        .cloned()
                        .ok_or(ResolverError::Protocol)
                };
                let _ = sender.send(result);
            }
            continue;
        }
        if message.get("method").and_then(Value::as_str) == Some("thread/started") {
            if let Some(workspace) = parse_started_notification(&message) {
                inner
                    .workspaces
                    .write()
                    .await
                    .insert(workspace.thread_id, workspace.cwd);
            }
        }
        let _ = inner.notifications.send(message);
    }

    if let Some(inner) = inner.upgrade() {
        if let Some(child) = inner.child.lock().await.as_mut() {
            let exit = child.try_wait();
            diagnostic(
                "stdout terminal child state",
                "observed",
                json!({"exitCode":exit.as_ref().ok().and_then(|v|v.as_ref()).and_then(|v|v.code()),"stillRunning":matches!(exit,Ok(None)),"exitObservationError":exit.err().map(|e|e.to_string()),"causeNotInferred":true}),
            );
        }
        let mut pending = inner.pending.lock().await;
        diagnostic(
            "transport pending requests",
            "released",
            json!({"pendingCount":pending.len()}),
        );
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err(terminal.clone()));
        }
    }
}
