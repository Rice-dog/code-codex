# Testing

## Automated verification

Run the complete local gate from a fresh PowerShell session:

```powershell
./scripts/test.ps1
```

The gate runs TypeScript type checking/tests and a production bundle, Rust format
and Clippy checks, and all Rust unit/security/integration tests. Release packaging
runs the same gate before creating artifacts and an SPDX SBOM.

Security coverage includes traversal, rooted/UNC/device/ADS spellings, reserved
Windows names, symlink or junction escapes, retained-handle path replacement,
bounded/reparse-safe ignore files, pagination bounds, malformed bridge payloads,
wrong/replayed capabilities, request/queue limits, settings validation, watcher
coalescing, App Server framing/pagination, listener identity, CDP navigation and
frame scoping, ambiguous targets, and renderer selector qualification. UI tests
cover A/B task transitions, context revocation, permanent hidden/ignored-entry
visibility, absence of the former visibility control, and bounded same-document
remounting.

Preview coverage additionally verifies the exact `{relativePath}` schema,
native extension/name allowlist and sensitive denylist, strict UTF-8 and NUL
rejection, the 64 KiB ceiling and truncation flag, and no-follow rejection of a
final or ancestor symlink/junction/reparse point. Retained-handle replacement
tests prove that a file or parent swapped during a request cannot redirect the
read outside the bound workspace. Bridge tests revoke results after task,
workspace, or renderer-lifecycle changes. UI tests verify click/Enter activation,
multi-tab deduplication and close fallback, native conversation-node preservation,
per-tab stale-response suppression, exact text reconstruction through fixed syntax
spans for HTML-like input, path-based language selection, adversarial token-run
bounds, mixed-ending and trailing-blank line numbering, live editor-gutter
updates, synchronized scrolling, accessible unsupported/error states, and
complete tab purging on context change or disconnect.

Save coverage verifies the exact `explorer.preview.save` schema, Base64 decoding,
the 96 KiB binding-request and 64 KiB decoded/final limits, existing-file-only
behavior, content versions and stale-write conflicts, sensitive/type policy,
retained no-follow path handling, BOM/CRLF preservation, and mixed-EOL rejection.
UI tests cover Read only/Editing toggling, save-in-place and save-then-exit,
Ctrl/Cmd+S, conflict/error/reload behavior, and dirty-draft confirmation.

Workspace-item coverage verifies exact schemas for `explorer.entry.create`,
`explorer.entry.rename`, `explorer.entry.move`, `explorer.entry.delete`, and
`explorer.entry.reveal`;
single-component and UTF-16 leaf limits; exclusive creation and collision-safe,
same-parent rename; fixed-leaf collision-safe cross-folder move; root and
self/descendant rejection; bounded recursive deletion; final, ancestor, and
descendant reparse handling; retained-root replacement; and context-clear or
lifecycle races. Reveal tests inject the platform runner and prove that only the
validated native path reaches a fixed two-argument Explorer invocation while no
absolute path is serialized to the renderer. Generic filesystem, import, and
shell methods stay outside the allowlist.

UI context-menu tests verify the exact **Delete** label, confirmation and cancel
paths, New File/New Folder parent selection, preview, rename, relative-path copy,
reveal, and refresh payloads. They also cover right-click and keyboard opening,
viewport clamping, arrow/Home/End navigation, focus restoration, click-away,
Escape/scroll/resize/context dismissal, virtualization-safe targets, disabled
rows, duplicate-action suppression, and dirty preview reconciliation.
Drag tests cover file/folder eligibility, exact move payloads, folder and project
root targets, hover expansion, invalid and external drops, eager source/destination
refresh, and native collision feedback.

The workspace suite includes a 10,000-entry listing budget test. An ignored
100,000-entry stress case can be run explicitly to verify the 50,000-entry scan
ceiling without making routine CI depend on machine-specific disk speed.

## Verified compatibility environments

| Item | Observed value |
|---|---|
| Windows | Windows 11 x64 build 26200 |
| Codex Stable | 26.715.10079.0 — default startup target |
| Codex Beta | 26.715.3651.0 — explicit compatibility target |
| Chromium / CDP | 150.0.7871.124 / protocol 1.3 |
| Beta App Server baseline | 0.145.0-alpha.18 |
| Renderer URL | `app://-/index.html` |

The package accepted `--remote-debugging-address=127.0.0.1` and a random
`--remote-debugging-port`. `/json/list` required polling. URL and title alone were
ambiguous because an auxiliary renderer looked identical, so the main target was
qualified by all three selectors:

```text
aside.app-shell-left-panel
main.main-surface
[data-app-shell-sidebar-trigger]
```

The active local task used
`[data-app-action-sidebar-thread-active="true"]` and a
`data-app-action-sidebar-thread-id="local:<UUID>"` value. Binding requests were
received before and after two page reloads. A reload can legitimately leave no
task selected; this must render the no-project state, not guess a workspace.

App Server was initialized over newline-delimited stdio and `thread/read` returned
the selected thread's `cwd`. `thread/list` fallback uses `useStateDbOnly: true` to
avoid the scan-and-repair behavior of a default list request.

## Manual compatibility smoke test

Use an isolated Stable launch or a disposable Windows profile; never interrupt
another active Codex session. Confirm:

1. Code-Codex launches the selected Codex package with loopback-only CDP.
2. Exactly one panel mounts between the native sidebar and conversation. Confirm
   only one project/root label is visible when both names are equal.
3. The root matches the selected local task and changes after switching tasks.
4. Expanding a directory requests only its immediate children. Confirm hidden
   and ignored entries, including `.git`, remain visible and no visibility filter
   control is present.
5. Select two allowlisted UTF-8 files. Confirm the main surface shows
   `Conversation`, then one deduplicated tab per file, and that the active file
   occupies the full main view. Switch subjects and confirm the original
   conversation state is unchanged. Confirm the selected-tab background extends
   through the close button without being cut off at the `X`.
6. Confirm a file over 64 KiB is labeled truncated and HTML-like text is shown
   literally, never executed.
7. Select a sensitive, binary, unsupported, and symlink/reparse test file; no
   bytes appear and the unavailable state is explicit.
8. For an editable file, click **Read only**, change text, then click **Editing**.
   Confirm the file is saved and highlighted read-only preview returns. Re-enter
   editing and verify Ctrl+S saves without exiting.
9. Verify an existing BOM and CRLF line endings survive a save. Confirm a mixed
   EOL file, a truncated file, and an unsupported/sensitive/reparse file cannot
   enter editing, and preview save never creates, deletes, renames, or moves a path.
10. Modify an editing file externally before saving. Confirm save reports a
    conflict, keeps the draft, and requires reload rather than overwriting disk.
11. Rapidly open two files, close one while it is loading, then switch tasks; no
   stale content or closed tab from the former file/workspace may reappear.
12. Right-click a file, folder, and blank tree area and verify the appropriate
    menu. Confirm the destructive item is labeled exactly **Delete**, cancellation
    sends no request, acceptance deletes the target, and New File/New Folder add
    an empty sibling or child without overwriting an existing entry. Exercise the
    same menu with Shift+F10 or the Context Menu key and verify focus returns.
13. Rename and delete previewed files and directories; only affected tabs close,
    dirty drafts require confirmation, and unrelated conversation/tab state stays
    intact. Drag a file and a non-empty folder into another folder, then drag one
    back to the project root. Confirm collisions and self/descendant drops are
    rejected and a closed folder expands after a sustained hover. Reveal opens
    Windows Explorer with the selected item highlighted, including when its path
    contains spaces or Unicode, without exposing an absolute path in the renderer
    response. Create and modify test paths; badges appear within 500 ms.
14. Reload the renderer twice; the panel returns without duplication and the
   native conversation is restored.
15. Select a cloud or ordinary chat; no local root, file tab, preview text, or
    edit draft is retained.
16. Exit Codex; the watcher and Code-Codex supervisor exit.

Record only versions, error codes, timings, and redacted selector outcomes. Do not
publish paths, titles, preview text, conversation content, credentials, or session
databases.
