# Compatibility

Compatibility requires all three layers to pass: package discovery, Chromium CDP
launch, and a renderer adapter that can identify the selected local thread without
ambiguity.

| Platform | Codex channel | Package version | Status |
|---|---|---:|---|
| Windows 11 x64 | Stable | 26.715.10079.0 | **Supported (default):** full CDP, renderer, App Server, preview, and reload smoke verified |
| Windows 11 x64 | Beta | 26.715.3651.0 | **Supported (explicit):** full CDP, renderer, App Server, and watcher smoke verified |
| Windows 11 x64 | Stable | 26.715.4045.0 | **Not allowlisted:** historical package/API observation only |

Only entries marked **Supported** are accepted without a development override.
An observed package is not a promise that its DOM or launch behavior is
compatible. Diagnostics report the detected version and adapter decision without
logging project paths.

The Stable probe used an isolated launcher-owned process and a random loopback
port. It verified Chromium 150 / CDP 1.3, main-shell qualification, native
binding round trips, real App Server task-to-workspace resolution, exact bounded
preview reconstruction, suffix-aware icons, syntax highlighting, physical
Conversation/file switching, dismissal/reselection, and unique reinjection after
two consecutive page reloads. The user's active Stable process was not restarted
or modified during the probe. The earlier Beta M0 probe remains the explicit
fallback baseline and used App Server `0.145.0-alpha.18` with `thread/read`.

Unknown versions must leave the official interface untouched and report
`UNSUPPORTED_VERSION`. Add support by capturing a redacted DOM fixture, creating
a versioned adapter, and passing selector contract and manual smoke tests. Open
the checked-in [compatibility report form](https://github.com/codex-live-explorer/codex-live-explorer/issues/new?template=compatibility.yml)
directly; this works from packaged documentation without relying on a configured
Git remote.
