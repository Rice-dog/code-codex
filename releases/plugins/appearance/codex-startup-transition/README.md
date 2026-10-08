# Codex Startup Transition

Downloadable API 1 player. Its verified local cache is loaded before the native loading-page hook, with no network request during startup. Core embeds only a lightweight loader and settings contract; the downloaded package supplies playback, media storage and timeline helpers. Missing or invalid cache skips animation and preserves normal Codex startup. Existing local video, trim, minimum duration, fade and background handoff settings are preserved.
