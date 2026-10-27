//! Shared by windowless setup, launcher diagnostics and the uninstaller.
#![allow(dead_code)] // Each windowless binary uses a different subset of this shared module.
use std::sync::{OnceLock, RwLock};
use workspace_service::ui_language::{LanguageStore, Locale, Preference};
static SESSION: RwLock<Option<Locale>> = RwLock::new(None);
static CATALOGS: OnceLock<(serde_json::Value, serde_json::Value)> = OnceLock::new();

pub(crate) fn system_locale() -> Locale {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetUserDefaultUILanguage() -> u16;
        }
        // LANGID primary language 0x04 includes simplified and traditional Chinese.
        let id = unsafe { GetUserDefaultUILanguage() };
        if id == 0 {
            tracing::warn!(
                code = "CC-LANG-DETECT-001",
                "Windows display language unavailable; using English"
            );
        }
        if id & 0x3ff == 4 {
            return Locale::Chinese;
        }
    }
    Locale::English
}
pub(crate) fn set_session(locale: Locale) {
    *SESSION
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(locale);
}
pub(crate) fn preference() -> Preference {
    let fallback = Preference::fallback(system_locale());
    match LanguageStore::for_current_user().and_then(|s| s.load().map_err(std::io::Error::other)) {
        Ok(Some(p)) => p,
        Ok(None) => fallback,
        Err(e) => {
            tracing::warn!(error=%e,"language preference fallback");
            fallback
        }
    }
}
pub(crate) fn locale() -> Locale {
    SESSION
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .unwrap_or_else(|| preference().locale)
}
pub(crate) fn catalogs() -> &'static (serde_json::Value, serde_json::Value) {
    CATALOGS.get_or_init(|| {
        (
            serde_json::from_str(include_str!("../../../resources/i18n/en.json"))
                .unwrap_or_default(),
            serde_json::from_str(include_str!("../../../resources/i18n/zh-CN.json"))
                .unwrap_or_default(),
        )
    })
}
pub(crate) fn text(original: &str) -> String {
    if locale() == Locale::English {
        return original.to_owned();
    }
    let (en, zh) = catalogs();
    if let Some((key, _)) = en
        .as_object()
        .and_then(|m| m.iter().find(|(_, v)| v.as_str() == Some(original)))
    {
        return zh[key].as_str().unwrap_or(original).to_owned();
    }
    // Dynamic native summaries use one bounded, explicitly cataloged slot;
    // the captured operation/path/error remains original evidence.
    if let Some(entries) = en.as_object() {
        for (key, value) in entries {
            let Some(template) = value.as_str() else {
                continue;
            };
            let Some(start) = template.find('{') else {
                continue;
            };
            let Some(end) = template[start..].find('}').map(|v| start + v) else {
                continue;
            };
            if template[end + 1..].contains('{') {
                continue;
            }
            if let Some(value) = original
                .strip_prefix(&template[..start])
                .and_then(|v| v.strip_suffix(&template[end + 1..]))
            {
                if let Some(translated) = zh[key].as_str() {
                    return translated.replace(&template[start..=end], value);
                }
            }
        }
    }
    original
        .lines()
        .map(|line| {
            if let Some((key, _)) = en
                .as_object()
                .and_then(|m| m.iter().find(|(_, v)| v.as_str() == Some(line.trim())))
            {
                zh[key].as_str().unwrap_or(line).to_owned()
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Localize only constant WinForms .Text assignments, never script protocol/log tokens.
pub(crate) fn dialog_script(source: &str) -> String {
    if locale() == Locale::English {
        return source.to_owned();
    }
    let (en, zh) = catalogs();
    let mut result = source.to_owned();
    if let Some(entries) = en.as_object() {
        // Dynamic recovery guidance arrives after the dialog source is
        // localized. Embed the same catalog as data for that one UI field;
        // never replace protocol values or raw diagnostic evidence.
        if result.contains("# CODE_CODEX_GUIDANCE_TRANSLATIONS") {
            let mut translations = std::collections::BTreeMap::new();
            for (key, value) in entries {
                if let (Some(original), Some(translated)) = (value.as_str(), zh[key].as_str()) {
                    translations.entry(original).or_insert(translated);
                }
            }
            let pairs = translations
                .iter()
                .map(|(original, translated)| {
                    format!(
                        "$script:guidanceTranslations.Add('{}','{}')",
                        original.replace('\'', "''"),
                        translated.replace('\'', "''")
                    )
                })
                .collect::<Vec<_>>()
                .join(";\n");
            result = result.replace("$script:guidanceTranslations=@{} # CODE_CODEX_GUIDANCE_TRANSLATIONS",
                &format!("$script:guidanceTranslations=[Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)\n{pairs}"));
        }
        for (key, value) in entries {
            if let (Some(original), Some(translated)) = (value.as_str(), zh[key].as_str()) {
                if original.contains(['\n', '\r']) {
                    continue;
                }
                let original = original.replace('\'', "''");
                let translated = translated.replace('\'', "''");
                result = result.replace(
                    &format!(".Text = '{original}'"),
                    &format!(".Text = '{translated}'"),
                );
            }
        }
    }
    result
}

#[cfg(test)]
mod recovery_tests {
    use super::*;
    #[test]
    fn ordinary_recovery_guidance_localizes_without_changing_protocol_or_evidence() {
        const HELP: &str =
            "Close Codex, then start it through Code-Codex, or click Close and restart below.";
        let source = include_str!("startup_dialog.ps1");
        set_session(Locale::English);
        assert_eq!(dialog_script(source), source);
        set_session(Locale::Chinese);
        let translated = dialog_script(source);
        assert!(translated.contains(&format!("$script:guidanceTranslations.Add('{HELP}','关闭 Codex，并通过 Code-Codex 来启动，或者直接点击下方的“关闭并重新启动”按钮。')")));
        assert!(translated.contains("$script:action.Text=$script:guidanceTranslations[$Guidance]"));
        assert!(!translated.contains("# CODE_CODEX_GUIDANCE_TRANSLATIONS"));
        assert!(translated.contains("CC-START-RECOVERY-UI-002: Startup state could not be read."));
        assert!(translated.contains("Original conflict: "));
        set_session(Locale::English);
    }
}
