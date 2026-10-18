use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

use cdp_client::BridgeError;

use serde_json::{Value, json};
use sha2::Digest as _;

use super::{
    ContextParams, ContextResult, ListParams, NativeBridge, abort_import_locked, cancelled_error,
    internal_error, lock_unpoisoned, map_resolver_error, map_workspace_error, no_context_error,
    operation_error, require_empty_object,
};
use workspace_service::{
    ListOptions, ListPage, WatchVisibility, Workspace, WorkspaceError, WorkspaceWatcher,
};

impl NativeBridge {
    pub(super) async fn context(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.ensure_epoch(epoch)?;
        let params: ContextParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "context",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let request_generation = self.begin_context_request(epoch)?;
        let requested_thread = params
            .thread_id
            .as_deref()
            .map(|thread| thread.strip_prefix("local:").unwrap_or(thread))
            .map(str::to_owned);

        if let Some(thread_id) = requested_thread {
            if let Some(workspace) = self.inner.manual_workspace.clone() {
                self.replace_context(Some(thread_id), workspace, epoch, request_generation)
                    .await?;
            } else {
                let resolver = self.inner.resolver.as_ref().ok_or_else(no_context_error)?;
                let resolved = resolver.resolve_thread(&thread_id).await;
                self.ensure_context_request(epoch, request_generation)?;
                let resolved = resolved.map_err(map_resolver_error)?;
                let workspace = Workspace::open(resolved.cwd).map(Arc::new);
                self.ensure_context_request(epoch, request_generation)?;
                let workspace = workspace.map_err(map_workspace_error)?;
                self.replace_context(Some(thread_id), workspace, epoch, request_generation)
                    .await?;
            }
        } else if lock_unpoisoned(&self.inner.state)
            .current
            .as_ref()
            .is_none_or(|context| context.lifecycle_epoch != epoch)
        {
            if let Some(workspace) = self.inner.manual_workspace.clone() {
                self.replace_context(None, workspace, epoch, request_generation)
                    .await?;
            }
        }

        let context = self.active_context_for_request(epoch, request_generation)?;
        let result = ContextResult {
            thread_id: context.thread_id,
            project_name: context.workspace.display_name().to_owned(),
            root_name: context.workspace.display_name().to_owned(),
            root_path: context.workspace.root_path().to_string_lossy().into_owned(),
            compatible: true,
            reason: None,
        };
        serde_json::to_value(result).map_err(|error| {
            operation_error(
                internal_error(),
                "context",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn list(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.list_with_scanner(params, epoch, |workspace, options| workspace.list(options))
            .await
    }
}

impl NativeBridge {
    pub(super) async fn list_with_scanner<F>(
        &self,
        params: Value,
        epoch: u64,
        scanner: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, ListOptions) -> Result<ListPage, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: ListParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "list_with_scanner",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let options = ListOptions {
            relative_path: params.relative_path,
            cursor: params.cursor,
            limit: params.limit.unwrap_or(200),
            show_hidden: true,
            show_ignored: true,
        };
        let workspace = context.workspace.clone();
        let page = tokio::task::spawn_blocking(move || scanner(workspace, options)).await;
        self.ensure_active_context(&context, epoch)?;
        let page = page
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "list_with_scanner",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_workspace_error)?;
        serde_json::to_value(page).map_err(|error| {
            operation_error(
                internal_error(),
                "list_with_scanner",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn watch_start(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        self.ensure_epoch(epoch)?;
        require_empty_object(&params)?;
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        let visibility = self.watch_visibility();
        let subscription = WorkspaceWatcher::subscribe_with_visibility(
            context.workspace.clone(),
            Duration::from_millis(150),
            visibility,
        );
        self.ensure_epoch(epoch)?;
        let mut state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        if state
            .current
            .as_ref()
            .is_none_or(|active| active.revision != context.revision)
        {
            return Err(cancelled_error());
        }
        let subscription = subscription.map_err(map_workspace_error)?;
        let generation = self.inner.watch_generation.fetch_add(1, Ordering::AcqRel) + 1;
        if let Some(task) = state.watch_task.take() {
            task.abort();
        }
        state.watch_enabled = true;
        state.watch_visibility = None;
        self.install_watcher_locked(&mut state, subscription, generation, epoch);
        Ok(json!({ "watching": true }))
    }
}

impl NativeBridge {
    pub(super) fn watch_stop(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        let mut state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        self.stop_watcher_locked(&mut state);
        Ok(json!({ "watching": false }))
    }
}

impl NativeBridge {
    pub(super) fn context_clear(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        let mut state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        let request_generation = self.bump_context_request_generation();
        self.ensure_context_request(epoch, request_generation)?;
        self.stop_watcher_locked(&mut state);
        abort_import_locked(&mut state);
        state.current = None;
        self.inner.context_revision.fetch_add(1, Ordering::AcqRel);
        Ok(json!({ "cleared": true }))
    }
}

impl NativeBridge {
    pub(super) fn watch_visibility(&self) -> WatchVisibility {
        WatchVisibility {
            show_hidden: true,
            show_ignored: true,
        }
    }
}
