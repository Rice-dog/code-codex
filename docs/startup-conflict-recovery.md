# Existing-instance startup recovery (Windows)

This feature does not reserve or bump a release version. Local acceptance was
performed with a separately numbered 0.5.9 test build, not an upstream release.

When the official packaged Codex is already running without a debugging port,
starting Code-Codex offers **Close and restart** or **Cancel**. The dialog warns
that running tasks/replies and unsaved changes may be interrupted. Enter, Escape
and closing the dialog all cancel. Cancellation is a successful no-op, without a
second error popup.

The **Automatically close and reopen Codex next time** checkbox starts unchecked.
It saves consent only after a successful graceful close. Later launches can use
that saved consent without asking again. The independent `data/startup-recovery.json`
preference does not change workspace settings, chats or media. Invalid preference
data cannot grant consent.

If saving the optional remembered choice fails **after Codex has exited**, this
launch still continues through the same fresh process check and normal launch
path. The worker returns `ready-preference-warning`; the launcher records
`CC-START-PREF-001` rather than reporting a failed restart. It does not retry
closing Codex, silently claim the preference was saved, or infer permission from
the error. Future attempts re-read the actual preference; an uncertain write
result is not a reason to guess its contents. Storage errors while reading
consent still fail closed **before** any close request.

Revoke consent using the installed console launcher:

```powershell
code-codex.exe reset-startup-recovery
```

Revocation is intentionally different from optional persistence: a failed revoke
must report failure, never pretend the existing permission was removed.

Recovery only applies to the official Windows package selected by discovery.
Existing debug-enabled sessions, ambiguous root processes, changed process
generations and uninspectable identities are never closed automatically. The
helper retains the inspected process handle across the dialog and rechecks its
image and creation time before its graceful exit request. Native `EnumWindows`
enumerates the target's top-level windows (including hidden windows), without
reading titles. A disabled visible window blocks recovery rather than bypassing
a modal prompt. The helper uses Windows Restart Manager to request orderly app
exit, not `.NET Process.CloseMainWindow`, which can fail on hidden/tray windows
and can merely hide an Electron window instead of exiting its browser process.

Only the retained PID and exact native creation FILETIME are registered; no file
resources, services, other instances or child processes are registered. The
affected process list must match that one process and Windows session. The
shutdown flags are **zero** (never `RmForceShutdown`); app refusal is respected.
The native subprocess is limited to 45 seconds, followed by at most 15 seconds
waiting for the original process to exit. A helper timeout kills only the helper,
not Codex. Recovery launches again only after the original exits and a fresh
check finds no remaining official browser process.
Other startup errors retain their existing diagnostics.

The helper is embedded in the native launcher and passed to trusted Windows
PowerShell through stdin with a short encoded bootstrap. It does not compile C# at startup or execute
scripts from a writable temporary path. Native diagnostics remain English;
ordinary dialog text follows the existing global language preference.
PowerShell progress is suppressed before module initialization so CLIXML progress
records cannot obscure the actual failure.

Regression coverage (no official Codex process is closed):

```powershell
powershell -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File scripts/test-startup-conflict.ps1
node scripts/check-i18n.mjs
```

After building the native release, check the compiled CLI/helper transport in an
isolated executable-relative storage root (the fixture is retained under
`artifacts/startup-conflict-native`):

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/test-startup-conflict-native.ps1
powershell -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File scripts/test-startup-conflict-windows.ps1
powershell -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File scripts/test-startup-conflict.ps1 -RequireNative
```

The `startup-recovery-native` Windows CI job builds the embedded launcher and
requires the native binary for all three integration suites. It also runs the
Rust worker-protocol and process-identity tests. The lightweight contracts job
can run policy/preference tests without a native build; native coverage there is
explicitly reported as skipped, not passed. The CI job never invokes the real
Codex launcher/installer or shuts down an installed Codex instance.

These fixtures verify preference IO, dialog defaults, native read-only identity,
mocked recovery decisions, the compiled CLI/helper reset transport and a real
graceful exit of disposable off-screen WinForms child processes. The native
window suite covers visible, multiple and hidden/no-main-window fixtures,
unrelated-process survival, generation/image mismatch, disabled/modal windows,
and an application veto. Persistence regressions use a real Windows file-sharing
lock to verify that failed replacement preserves old consent bytes and removes
its staging file. They also cover a simulated commit-then-error result, no
write/close retry, and failed revocation retaining the previous permission.
The policy suite runs native operations when a
release binary is available; otherwise it explicitly reports that integration
part as skipped. A complete real Codex restart and saved-draft recovery still
require the user's manual acceptance.

API references: [EnumWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows),
[RmRegisterResources](https://learn.microsoft.com/en-us/windows/win32/api/restartmanager/nf-restartmanager-rmregisterresources),
[RmShutdown](https://learn.microsoft.com/en-us/windows/win32/api/restartmanager/nf-restartmanager-rmshutdown).
