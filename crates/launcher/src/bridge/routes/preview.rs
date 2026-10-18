use std::sync::Arc;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;

use cdp_client::BridgeError;

use serde_json::Value;

use super::{
    MediaChunkParams, MediaChunkResult, MediaInfoParams, ModelResourceChunkParams,
    ModelResourceInfoParams, NativeBridge, PreviewParams, internal_error, lock_unpoisoned,
    map_media_error, map_workspace_error, no_context_error, operation_error, valid_content_version,
};
use workspace_service::{
    MAX_MEDIA_CHUNK_BYTES, MediaInfo, ModelResourceChunkRequest, ModelResourceInfo, PreviewResult,
    Workspace, WorkspaceError,
};

impl NativeBridge {
    pub(super) async fn preview(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.preview_with_reader(params, epoch, |workspace, relative_path| {
            workspace.preview(&relative_path)
        })
        .await
    }
}

impl NativeBridge {
    pub(super) async fn media_info(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        self.media_info_with_reader(params, epoch, |workspace, relative_path| {
            workspace.media_info(&relative_path)
        })
        .await
    }
}

impl NativeBridge {
    pub(super) async fn media_chunk(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: MediaChunkParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "media_chunk",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if params.length == 0
            || params.length > MAX_MEDIA_CHUNK_BYTES
            || params.offset >= params.expected_size_bytes
            || !valid_content_version(&params.expected_version)
        {
            return Err(BridgeError::invalid_request());
        }

        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let chunk = tokio::task::spawn_blocking(move || {
            workspace.media_chunk(
                &params.relative_path,
                params.offset,
                params.length,
                params.expected_size_bytes,
                &params.expected_version,
            )
        })
        .await;
        self.ensure_active_context(&context, epoch)?;
        let chunk = chunk
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "media_chunk",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_media_error)?;
        serde_json::to_value(MediaChunkResult {
            offset: chunk.offset,
            data_base64: BASE64_STANDARD.encode(chunk.data),
            eof: chunk.eof,
        })
        .map_err(|error| {
            operation_error(
                internal_error(),
                "media_chunk",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn model_resource_info(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ModelResourceInfoParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "model_resource_info",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if !valid_content_version(&params.expected_model_version) {
            return Err(BridgeError::invalid_request());
        }
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let info = tokio::task::spawn_blocking(move || {
            workspace.model_resource_info(
                &params.model_relative_path,
                &params.resource_uri,
                &params.expected_model_version,
            )
        })
        .await;
        self.ensure_active_context(&context, epoch)?;
        let info: ModelResourceInfo = info
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "model_resource_info",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_media_error)?;
        serde_json::to_value(info).map_err(|error| {
            operation_error(
                internal_error(),
                "model_resource_info",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn model_resource_chunk(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: ModelResourceChunkParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "model_resource_chunk",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if params.length == 0
            || params.length > MAX_MEDIA_CHUNK_BYTES
            || params.offset >= params.expected_size_bytes
            || !valid_content_version(&params.expected_model_version)
            || !valid_content_version(&params.expected_version)
        {
            return Err(BridgeError::invalid_request());
        }
        let context = {
            let state = lock_unpoisoned(&self.inner.state);
            self.ensure_epoch(epoch)?;
            state.current.clone().ok_or_else(no_context_error)?
        };
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        let workspace = context.workspace.clone();
        let chunk = tokio::task::spawn_blocking(move || {
            workspace.model_resource_chunk(ModelResourceChunkRequest {
                model_relative_path: &params.model_relative_path,
                resource_uri: &params.resource_uri,
                expected_model_version: &params.expected_model_version,
                offset: params.offset,
                length: params.length,
                expected_size_bytes: params.expected_size_bytes,
                expected_version: &params.expected_version,
            })
        })
        .await;
        self.ensure_active_context(&context, epoch)?;
        let chunk = chunk
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "model_resource_chunk",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_media_error)?;
        serde_json::to_value(MediaChunkResult {
            offset: chunk.offset,
            data_base64: BASE64_STANDARD.encode(chunk.data),
            eof: chunk.eof,
        })
        .map_err(|error| {
            operation_error(
                internal_error(),
                "model_resource_chunk",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn preview_with_reader<F>(
        &self,
        params: Value,
        epoch: u64,
        reader: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, String) -> Result<PreviewResult, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: PreviewParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "preview_with_reader",
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
        let workspace = context.workspace.clone();
        let preview =
            tokio::task::spawn_blocking(move || reader(workspace, params.relative_path)).await;
        self.ensure_active_context(&context, epoch)?;
        let preview = preview
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "preview_with_reader",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_workspace_error)?;
        serde_json::to_value(preview).map_err(|error| {
            operation_error(
                internal_error(),
                "preview_with_reader",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn media_info_with_reader<F>(
        &self,
        params: Value,
        epoch: u64,
        reader: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(Arc<Workspace>, String) -> Result<MediaInfo, WorkspaceError> + Send + 'static,
    {
        self.ensure_epoch(epoch)?;
        let params: MediaInfoParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "media_info_with_reader",
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
        let workspace = context.workspace.clone();
        let info =
            tokio::task::spawn_blocking(move || reader(workspace, params.relative_path)).await;
        self.ensure_active_context(&context, epoch)?;
        let info = info
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "media_info_with_reader",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_media_error)?;
        serde_json::to_value(info).map_err(|error| {
            operation_error(
                internal_error(),
                "media_info_with_reader",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}
