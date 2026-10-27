# Existing-instance startup recovery (Windows)

Local test builds are independent from upstream publication. Building or
installing this checkout does not merge the pull request or publish a release.

When the official packaged Codex is already running without a debugging port,
starting Code-Codex offers **Close and restart** or **Cancel**. The dialog warns
that running tasks/replies and unsaved changes may be interrupted. Enter, Escape
and closing the dialog before confirmation all cancel. Cancellation is a
successful no-op, without a second error popup. Recovery uses the existing
startup diagnostic window, retaining the original support code, specific reason,
Copy details and saved report rather than adding a separate confirmation style.

Internal inspection does not display a partial checking screen. The first visible
window already contains the confirmation, risk notice, unchecked remember option
and Cancel. Suggested action explains both manual close-and-launch through
Code-Codex and the Close and restart button.

After an explicit restart decision is delivered, the window hides immediately.
An ApplicationContext keeps the existing diagnostic hidden without auto-showing
a new owner window or recreating its taskbar handle. Its message loop stays alive to monitor graceful exit, replacement
activation, process/endpoint inspection and visible interface verification in the
background. A failure reopens the original diagnostic with the original conflict
and current specific reason; no automatic second close or restart is attempted.
A running process or exit code zero alone is insufficient. Same-version visible
file tree plus Bridge readiness, or explicit cancellation, ends the background
window process. A 90-second readiness deadline remains a verification limit,
never forced termination. Missing instances, early controller exit and channel
failure still retain a copyable report. Shared readers permit atomic replacement;
a transient file-sharing read is retried for at most three timer ticks rather
than permanently freezing the display on its last successful snapshot.

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
powershell -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File scripts/test-unified-startup-recovery.ps1
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/test-unified-startup-launcher.ps1
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

## Post-close teardown and compact guidance

Only after the consent worker confirms the original browser has exited, the native preflight uses one shared 15-second teardown budget. An image lookup denied during teardown may wait on that same retained handle until it signals; a timeout, unknown wait or persistent access error still blocks relaunch. All entries share the deadline. A second complete snapshot catches a browser created during the wait. Ordinary startup retains its 1500ms total budget and 250ms per-handle grace. No additional close request or forced termination occurs. Diagnostics include the failed PID, parent, configured grace, actual wait and remaining budget.

The duplicate paragraph below Suggested action is removed, and the dialog is shorter. Initial and live failure guidance use the same selected catalog. English technical reasons, support codes, original conflict and full copy/report evidence remain unchanged. Cancel stays the default, Remember stays unchecked, and the restart action still hides the original window immediately.

## Stale process snapshot entries

ToolHelp snapshots are read-only copies, not a live process list. While waiting on one terminating child, another recorded process can disappear before OpenProcess. Error87 on a nonzero matching PID therefore triggers reconciliation: capture a new complete bounded snapshot, require that the failed PID is absent, discard the entire old snapshot and scan the fresh list from the beginning. The error itself never proves exit. A still-present PID, access denial/other errors, incomplete refresh, expired total deadline or8 reconciliation restarts per pass blocks relaunch. Post-close scans share the original15-second deadline, including their final second snapshot. New live exact-image processes are still detected; no new close request is sent. Diagnostics retain failedPID/parent/code, snapshot generation, reconciliation result and whether the deadline/identity checks changed.

References: [ToolHelp snapshot semantics](https://learn.microsoft.com/en-us/windows/win32/toolhelp/snapshots-of-the-system), [OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess). Native tests capture real disposable children, wait for their exit/release handles, require actual OpenProcess87, and verify both empty and new-live-process refresh results.
