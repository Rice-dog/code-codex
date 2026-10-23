# Windows login startup

Open the top **Code-Codex** application menu and toggle **Start Code-Codex when I
sign in**. This feature is off by default; installation, upgrade, menu inspection
and ordinary launches never opt a user in. Enabling requires an explicit
confirmation. Turning it off removes only Code-Codex's current-user entry and
does not close a running application.

The Chinese menu label is **Code-Codex 开机自启**. As described below, this starts
Code-Codex after Windows sign-in, not before a user logs in.

The registry entry itself is the source of truth; no second settings boolean can
silently restore a choice removed in Windows. This registers a login launch,
not a service running before sign-in. Windows may delay it or additionally
disable it in Startup Apps/Task Manager; that OS-level control is not overridden.

## Existing official Codex startup

The official app's startup setting is left untouched. Enabling login startup
does **not** grant permission to close or interrupt official Codex sessions.
If the official app is already running without a debugging port, the separate
[startup-conflict recovery](startup-conflict-recovery.md) consent still applies.
Its optional remembered permission remains independently revocable. A
debug-managed existing session is preserved and the automatic launch quietly
returns instead of showing a duplicate-start error.

Windows does not guarantee the order of Run entries. This is not a guarantee
against every simultaneous-launch race. Users who want just one login entry can
manually disable the official app's own startup setting; Code-Codex never does
that on their behalf. A queued Code-Codex login command rechecks registration and
does nothing after registration has been removed or cannot be verified.

## Storage and lifecycle

The sole value is `CodeCodexLogin` under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`:

```text
"<installation folder>\CodeCodex.exe" run --login-startup
```

Only a marked, non-redirected Windows installation containing this native binary
and a regular stable launcher can enable it. Development binaries cannot opt an
older installation into startup through the registry locator. Quotes, control
characters and commands exceeding the documented 260 UTF-16-unit Run limit are
rejected, not truncated. No shell, writable script or elevated task is registered.

The installer verifies a stable root shim alongside its versioned shortcut
entry. The shim reads `current-version`, so the registered command remains valid
across upgrades, retention and pointer rollback. An upgrade does not rewrite or
re-enable the registry value. `CodeCodex.exe` is already an owned removal asset;
both Keep and Purge uninstall revoke login startup and remove the launcher.
Failure to remove the registry entry is an uninstall error, not false success.

The menu reads back native results rather than optimistically flipping its
checkmark. A read/write failure exposes explicit revocation, not an inferred
enable or automatic write retry. Authenticated bridge calls reject unknown
parameters, non-booleans and stale lifecycle epochs, including writes queued
behind other settings updates.

## CLI and tests

Use the installed console launcher to inspect or revoke registration even if the
stable launcher or installation marker is missing:

```powershell
code-codex.exe login-startup
code-codex.exe login-startup --disable
# Explicit opt-in, only from a supported installed binary:
code-codex.exe login-startup --enable
```

Native unit tests use an isolated registry namespace, never the actual Run key.
The browser fixture mocks only the native interface and renders the actual menu.
The uninstaller test imports only the production revocation function and points
it at a fresh test key containing an unrelated `Codex` sentinel.

```powershell
cargo test --release --locked -p code-codex --bin code-codex login_startup -- --test-threads=1
cargo test -p cdp-client --locked login_startup -- --test-threads=1
node scripts/test-login-startup.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-login-startup-installer.ps1
```

Real reboot/login behavior, all Windows policies and every official Codex launch
ordering still require manual acceptance; isolated tests do not certify them.
Before downgrading to an older release that does not understand `--login-startup`,
disable this entry first; compatibility with pre-feature binaries is not claimed.

Reference: [Microsoft: Run and RunOnce registry keys](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys).
