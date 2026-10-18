use std::path::Path;

use std::sync::Arc;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use cdp_client::BridgeError;
use cdp_client::CapabilityToken;

use serde_json::{Value, json};
use sha2::Digest as _;

#[cfg(any(windows, not(windows)))]
use super::reveal_in_file_explorer;
use super::{
    ActiveImportSession, BatchCopyParams, BatchMoveParams, EntryCreateKind, EntryCreateParams,
    EntryMoveParams, EntryPathParams, EntryRenameParams, ImportBeginParams, ImportChunkParams,
    ImportDirectoryParams, ImportFileBeginParams, ImportSessionParams, NativeBridge,
    PreviewSaveParams, cancelled_error, import_busy_error, internal_error,
    invalid_import_session_error, lock_unpoisoned, map_import_error, map_workspace_error,
    no_context_error, operation_error, validate_active_import, validate_import_session_id,
};
use workspace_service::{
    MAX_IMPORT_CHUNK_BYTES, MAX_PREVIEW_BYTES, PreviewResult, Workspace, WorkspaceError,
};

impl NativeBridge {
    pub(super) async fn preview_save(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        self.preview_save_with_writer(
            params,
            epoch,
            |workspace, relative_path, version, content| {
                workspace.save_preview(&relative_path, &version, &content)
            },
        )
        .await
    }
}

impl NativeBridge {
    pub(super) async fn entry_create(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: EntryCreateParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_create",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let entry = self
            .active_workspace_operation(epoch, move |workspace| {
                workspace.create_entry(
                    &params.parent_relative_path,
                    &params.name,
                    params.kind.into(),
                )
            })
            .await?;
        serde_json::to_value(entry).map_err(|error| {
            operation_error(
                internal_error(),
                "entry_create",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn entry_rename(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: EntryRenameParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_rename",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let entry = self
            .active_workspace_operation(epoch, move |workspace| {
                workspace.rename_entry(&params.relative_path, &params.new_name)
            })
            .await?;
        serde_json::to_value(entry).map_err(|error| {
            operation_error(
                internal_error(),
                "entry_rename",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn entry_move(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: EntryMoveParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_move",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let entry = self
            .active_workspace_operation(epoch, move |workspace| {
                workspace.move_entry(
                    &params.relative_path,
                    &params.destination_parent_relative_path,
                )
            })
            .await?;
        serde_json::to_value(entry).map_err(|error| {
            operation_error(
                internal_error(),
                "entry_move",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn entry_move_batch(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        // Try parsing as batch first (from keyboard shortcut), fall back to single (from context menu).
        if let Ok(batch_params) = serde_json::from_value::<BatchMoveParams>(params.clone()) {
            if batch_params.source_paths.is_empty() || batch_params.source_paths.len() > 1024 {
                return Err(BridgeError::invalid_request());
            }

            let mut results = Vec::new();
            for source_path in batch_params.source_paths {
                let target_dir = batch_params.target_directory.clone();
                let entry = self
                    .active_workspace_operation(epoch, move |workspace| {
                        workspace.move_entry(&source_path, &target_dir)
                    })
                    .await?;
                results.push(entry);
            }

            return serde_json::to_value(json!({ "entries": results })).map_err(|error| {
                operation_error(
                    internal_error(),
                    "entry_move_batch",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            });
        }

        // Fall back to single-entry move for backward compatibility
        self.entry_move(params, epoch).await
    }
}

impl NativeBridge {
    pub(super) async fn entry_copy(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: BatchCopyParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_copy",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if params.source_paths.is_empty() || params.source_paths.len() > 1024 {
            return Err(BridgeError::invalid_request());
        }

        let mut results = Vec::new();
        for source_path in params.source_paths {
            let target_dir = params.target_directory.clone();
            let entry = self
                .active_workspace_operation(epoch, move |workspace| {
                    workspace.copy_entry(&source_path, &target_dir)
                })
                .await?;
            results.push(entry);
        }

        serde_json::to_value(json!({ "entries": results })).map_err(|error| {
            operation_error(
                internal_error(),
                "entry_copy",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn entry_delete(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: EntryPathParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_delete",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        self.active_workspace_operation(epoch, move |workspace| {
            workspace.delete_entry(&params.relative_path)
        })
        .await?;
        Ok(json!({ "deleted": true }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_reveal(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        self.entry_reveal_with_opener(params, epoch, reveal_in_file_explorer)
            .await
    }
}

impl NativeBridge {
    pub(super) async fn entry_reveal_with_opener<F>(
        &self,
        params: Value,
        epoch: u64,
        opener: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(&Path) -> Result<(), WorkspaceError> + Send + 'static,
    {
        let params: EntryPathParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_reveal_with_opener",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        self.active_workspace_operation(epoch, move |workspace| {
            let target = workspace.reveal_path(&params.relative_path)?;
            opener(&target)
        })
        .await?;
        Ok(json!({ "revealed": true }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_begin(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportBeginParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_begin",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        match (params.kind, params.size_bytes) {
            (EntryCreateKind::File, Some(_)) | (EntryCreateKind::Directory, None) => {}
            _ => return Err(BridgeError::invalid_request()),
        }

        let session_id = CapabilityToken::generate().expose().to_owned();
        let staging_nonce = CapabilityToken::generate().expose().to_owned();
        let bridge = self.clone();
        let response_session_id = session_id.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            if state.import_session.is_some() {
                return Err(import_busy_error());
            }
            let context = state.current.as_ref().ok_or_else(no_context_error)?;
            if context.lifecycle_epoch != epoch {
                return Err(cancelled_error());
            }
            let session = context
                .workspace
                .begin_import(
                    &params.destination_parent_relative_path,
                    &params.name,
                    params.kind.into(),
                    params.size_bytes,
                    &staging_nonce,
                )
                .map_err(map_import_error)?;
            if bridge.ensure_epoch(epoch).is_err() {
                let _ = session.abort();
                return Err(cancelled_error());
            }
            state.import_session = Some(ActiveImportSession {
                id: session_id,
                lifecycle_epoch: epoch,
                context_revision: context.revision,
                session,
            });
            Ok(())
        })
        .await
        .map_err(|error| {
            operation_error(
                internal_error(),
                "entry_import_begin",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })??;

        Ok(json!({
            "sessionId": response_session_id,
            "chunkSize": MAX_IMPORT_CHUNK_BYTES,
        }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_directory(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportDirectoryParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_directory",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        self.active_import_operation(epoch, params.session_id, move |session| {
            session.create_directory(&params.relative_path)
        })
        .await?;
        Ok(json!({ "created": true }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_file_begin(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportFileBeginParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_file_begin",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        self.active_import_operation(epoch, params.session_id, move |session| {
            session.begin_file(&params.relative_path, params.size_bytes)
        })
        .await?;
        Ok(json!({ "ready": true }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_chunk(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportChunkParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_chunk",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let bytes = BASE64_STANDARD
            .decode(params.data_base64)
            .map_err(|error| {
                operation_error(
                    BridgeError::invalid_request(),
                    "entry_import_chunk",
                    format!("base64DecodeError={error}; rejected payload omitted"),
                )
            })?;
        if bytes.is_empty() || bytes.len() > MAX_IMPORT_CHUNK_BYTES {
            return Err(BridgeError::invalid_request());
        }
        let next_offset = self
            .active_import_operation(epoch, params.session_id, move |session| {
                session.append_chunk(params.offset, &bytes)
            })
            .await?;
        Ok(json!({ "nextOffset": next_offset }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_file_finish(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportSessionParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_file_finish",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        self.active_import_operation(epoch, params.session_id, |session| session.finish_file())
            .await?;
        Ok(json!({ "finished": true }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_commit(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportSessionParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_commit",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        validate_import_session_id(&params.session_id)?;
        let bridge = self.clone();
        let entry = tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            validate_active_import(&state, epoch, &params.session_id)?;
            let active = state
                .import_session
                .take()
                .ok_or_else(invalid_import_session_error)?;
            // `ImportSession::commit` has no fallible work after its atomic
            // rename, so consuming it here cannot strand an untracked stage.
            active.session.commit().map_err(map_import_error)
        })
        .await
        .map_err(|error| {
            operation_error(
                internal_error(),
                "entry_import_commit",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })??;
        Ok(json!({ "entry": entry }))
    }
}

impl NativeBridge {
    pub(super) async fn entry_import_abort(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ImportSessionParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "entry_import_abort",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        validate_import_session_id(&params.session_id)?;
        let bridge = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            validate_active_import(&state, epoch, &params.session_id)?;
            let active = state
                .import_session
                .take()
                .ok_or_else(invalid_import_session_error)?;
            active.session.abort().map_err(map_import_error)
        })
        .await
        .map_err(|error| {
            operation_error(
                internal_error(),
                "entry_import_abort",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })??;
        Ok(json!({ "aborted": true }))
    }
}

impl NativeBridge {
    pub(super) async fn preview_save_with_writer<F>(
        &self,
        params: Value,
        epoch: u64,
        writer: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, String, String, Vec<u8>) -> Result<PreviewResult, WorkspaceError>
            + Send
            + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: PreviewSaveParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "preview_save_with_writer",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if params.expected_version.len() != 64
            || !params
                .expected_version
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(BridgeError::invalid_request());
        }
        let content = BASE64_STANDARD
            .decode(params.content_base64)
            .map_err(|error| {
                operation_error(
                    BridgeError::invalid_request(),
                    "preview_save_with_writer",
                    format!("base64DecodeError={error}; rejected payload omitted"),
                )
            })?;
        if content.len() > MAX_PREVIEW_BYTES {
            return Err(map_workspace_error(WorkspaceError::ContentTooLarge));
        }

        // Mutation is intentionally performed under the active-context lock.
        // Context clear/switch and lifecycle invalidation therefore linearize
        // either before this save begins or after it has fully synced.
        let bridge = self.clone();
        tokio::task::spawn_blocking(move || {
            let state = lock_unpoisoned(&bridge.inner.state);
            bridge.ensure_epoch(epoch)?;
            let context = state.current.as_ref().ok_or_else(no_context_error)?;
            if context.lifecycle_epoch != epoch {
                return Err(cancelled_error());
            }
            let preview = writer(
                context.workspace.clone(),
                params.relative_path,
                params.expected_version,
                content,
            )
            .map_err(map_workspace_error)?;
            serde_json::to_value(preview).map_err(|error| {
                operation_error(
                    internal_error(),
                    "preview_save_with_writer",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })
        })
        .await
        .map_err(|error| {
            operation_error(
                internal_error(),
                "preview_save_with_writer",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })?
    }
}
