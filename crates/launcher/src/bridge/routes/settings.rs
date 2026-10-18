use cdp_client::{BridgeError, BridgeNotification};

use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Digest as _;

use super::{
    NativeBridge, SettingsWrapper, internal_error, lock_unpoisoned, map_workspace_error,
    operation_error, read_unpoisoned, require_empty_object, write_unpoisoned,
};
use workspace_service::{PreparedSettings, Settings, SettingsPatch, SettingsStore, WorkspaceError};

impl NativeBridge {
    pub(super) async fn language_get(&self, params: Value) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        let store = workspace_service::ui_language::LanguageStore::new(
            self.inner
                .settings_store
                .path()
                .parent()
                .ok_or_else(internal_error)?
                .to_owned(),
        );
        let result = store.load();
        let issue = result
            .as_ref()
            .err()
            .map(|e| json!({"code":e.code(),"reason":e.to_string()}));
        let preference = result.ok().flatten().unwrap_or_else(|| {
            workspace_service::ui_language::Preference::fallback(
                crate::gui_support::localization::system_locale(),
            )
        });
        Ok(json!({"preference":preference,"issue":issue,"supported":["zh-CN","en"]}))
    }
}

impl NativeBridge {
    pub(super) async fn language_set(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Patch {
            locale: workspace_service::ui_language::Locale,
            expected_revision: u32,
        }
        let patch: Patch =
            serde_json::from_value(params).map_err(|_| BridgeError::invalid_request())?;
        self.ensure_epoch(epoch)?;
        let _update = self.inner.settings_update_lock.lock().await;
        let this = self.clone();
        let preference = tokio::task::spawn_blocking(move || {
            let _state = lock_unpoisoned(&this.inner.state);
            this.ensure_epoch(epoch)?;
            let root = this
                .inner
                .settings_store
                .path()
                .parent()
                .ok_or_else(internal_error)?
                .to_owned();
            workspace_service::ui_language::LanguageStore::new(root)
                .save(
                    patch.locale,
                    patch.expected_revision,
                    workspace_service::ui_language::Source::Menu,
                    || true,
                )
                .map_err(|e| {
                    crate::runtime_log::record(
                        "localization",
                        "save",
                        "failed",
                        json!({"code":e.code(),"reason":e.to_string()}),
                    );
                    BridgeError::new(e.code(), e.to_string())
                })
        })
        .await
        .map_err(|_| internal_error())??;
        crate::gui_support::localization::set_session(preference.locale);
        crate::runtime_log::record(
            "localization",
            "save",
            "passed",
            json!({"locale":preference.locale,"revision":preference.revision,"source":"menu"}),
        );
        if let Some(sender) = self.inner.notification_sender.read().await.as_ref() {
            let _ = sender.send(BridgeNotification {
                lifecycle_epoch: epoch,
                payload: json!({"method":"explorer.language.changed","params":preference}),
            });
        }
        Ok(json!(preference))
    }
}

impl NativeBridge {
    pub(super) async fn settings_get(&self, params: Value) -> Result<Value, BridgeError> {
        require_empty_object(&params)?;
        serde_json::to_value(read_unpoisoned(&self.inner.settings).clone()).map_err(|error| {
            operation_error(
                internal_error(),
                "settings_get",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn settings_set(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        self.settings_set_with_preparer(params, epoch, |store, settings| store.prepare(&settings))
            .await
    }
}

impl NativeBridge {
    pub(super) async fn settings_set_with_preparer<F>(
        &self,
        params: Value,
        epoch: u64,
        prepare: F,
    ) -> Result<Value, BridgeError>
    where
        F: FnOnce(SettingsStore, Settings) -> Result<PreparedSettings, WorkspaceError>
            + Send
            + 'static,
    {
        self.ensure_epoch(epoch)?;
        let _update = self.inner.settings_update_lock.lock().await;
        self.ensure_epoch(epoch)?;
        let patch: SettingsPatch = if params.get("settings").is_some() {
            serde_json::from_value::<SettingsWrapper>(params)
                .map(|wrapper| wrapper.settings)
                .map_err(|error| {
                    operation_error(
                        BridgeError::invalid_request(),
                        "settings_set_with_preparer",
                        format!(
                            "category={:?}; line={}; column={}; rejected payload omitted",
                            error.classify(),
                            error.line(),
                            error.column()
                        ),
                    )
                })?
        } else {
            serde_json::from_value(params).map_err(|error| {
                operation_error(
                    BridgeError::invalid_request(),
                    "settings_set_with_preparer",
                    format!(
                        "category={:?}; line={}; column={}; rejected payload omitted",
                        error.classify(),
                        error.line(),
                        error.column()
                    ),
                )
            })?
        };
        let mut updated = read_unpoisoned(&self.inner.settings).clone();
        updated.apply(patch).map_err(map_workspace_error)?;
        let response = serde_json::to_value(&updated).map_err(|error| {
            operation_error(
                internal_error(),
                "settings_set_with_preparer",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })?;
        let store = self.inner.settings_store.clone();
        let to_prepare = updated.clone();
        let prepared = tokio::task::spawn_blocking(move || prepare(store, to_prepare)).await;
        let mut settings = write_unpoisoned(&self.inner.settings);
        let _state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        let prepared = prepared
            .map_err(|error| {
                operation_error(
                    internal_error(),
                    "settings_set_with_preparer",
                    format!(
                        "exceptionType={}; cause={error}",
                        std::any::type_name_of_val(&error)
                    ),
                )
            })?
            .map_err(map_workspace_error)?;
        prepared.commit().map_err(map_workspace_error)?;
        *settings = updated;
        Ok(response)
    }
}
