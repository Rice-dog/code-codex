# Threat model

## Assets

- The user's project path structure and workspace boundary
- Integrity of project files and directories changed through item actions
- Contents of a file the renderer previews or edits
- Codex renderer/session integrity
- Local Codex authentication and conversation data
- Availability of Codex Desktop and the workstation

Only native-classified bounded text may cross the bridge for preview or save.
The renderer may request the documented, path-bounded create, rename, move,
delete, and reveal actions, but it never receives an absolute root or generic filesystem
or process primitive. Credentials, arbitrary file reads/writes, raw binary
content, and Codex session databases remain out of scope. Filename and extension
checks cannot prove that supported text contains no secret.

## Trust zones

| Zone | Trust assumption |
|---|---|
| Launcher process | Trusted code running as the current Windows user |
| Codex renderer | Official renderer, version-gated but not a security boundary |
| Project workspace | Potentially malicious names, links, content, depth, and event volume |
| Other same-user processes | Untrusted; may probe loopback endpoints |
| Remote network | Untrusted and never intentionally reachable |

## Principal threats and controls

| Threat | Control |
|---|---|
| CDP exposed beyond the machine | Bind only to `127.0.0.1`; random port; listener process-tree validation; kill-on-close process job |
| Wrong renderer or document receives the bridge | Official listener identity, one qualified target, top-frame/app-origin lifetime checks |
| Renderer invokes unintended native behavior | Per-launch token, method allowlist, bounded schemas, ingress/queue/rate caps |
| Renderer turns preview into arbitrary file reading | Native extension/name policy; sensitive denylist; fixed 64 KiB ceiling; no caller-supplied root or limit |
| Renderer turns editing or item actions into arbitrary filesystem mutation | Exact method schemas; existing preview-eligible target for save; exclusive empty creation; same-parent no-overwrite rename; workspace-relative no-overwrite move with a fixed leaf; non-root bounded delete; no generic import/write |
| Stale editor overwrites an external change | SHA-256 `expectedVersion` is compared with current exact bytes immediately before the in-place write |
| `..`, UNC, device, ADS, or prefix confusion | Component-level rejection before filesystem access |
| Symlink or junction escapes root | Retained no-follow directory handles; canonical root; final and descendant reparse rejection |
| File or parent is replaced during preview/save/action | Handle-relative traversal; final no-follow checks; retained-root and active-context checks; mutation/context linearization |
| Rename, move, or create overwrites data | Exclusive file creation, collision checks, a single validated leaf, same-parent no-overwrite rename, and fixed-leaf no-overwrite move |
| Recursive delete escapes or exhausts the workspace | Root deletion prohibited; fixed depth/entry ceilings; retained handle-relative walk; no ambient recursive-delete call |
| Reveal becomes command execution or leaks the root | One fixed Windows Explorer invocation with native-only path construction and no renderer-selected executable/arguments |
| Malicious content executes in the renderer | Strict UTF-8/NUL checks; lexical coloring reconstructs exact source through text nodes and fixed spans populated with `textContent`; no HTML, Markdown, SVG, or link execution |
| Preview/save consumes excessive memory or CDP bandwidth | 64 KiB content ceiling, 96 KiB request cap, bounded bridge concurrency, at most eight live UI file tabs, and fixed syntax-run ceiling |
| Ignore files escape or exhaust parsing | Handle-relative opens, reparse rejection, byte and line ceilings |
| Huge directories or event storms | Pagination, caps, debounce, queue bounds, overflow resync |
| DOM changes select the wrong task | Version adapters and fail-closed ambiguity handling |
| Logs, settings, or support output disclose preview text | Preview text is never logged or persisted; structured logs and diagnostics remain redacted |
| Official update corrupts UI | Idempotent injection and compatibility gating |

## Non-goals

The project cannot protect a Windows account already compromised by malicious
same-user code, make undocumented Codex renderer APIs stable, or provide a secure
multi-user service. It does not attempt stealth injection or process memory
modification.

The official renderer is neither a confidentiality boundary nor a user-intent
boundary. While a file tab is open, renderer scripts and same-user processes
capable of inspecting CDP may read its text. More importantly, an authorized
Codex renderer holding the launch capability can preview, receive versions for,
and save any policy-eligible path without clicking the visible **Read only**
toggle. The same capability can request the bounded create, rename, move,
delete, and reveal methods without opening the context menu or accepting its confirmation.
The confirmation is a UX safeguard, not an authorization boundary.
`expectedVersion` prevents stale preview-save overwrite, not malicious renderer
writes. The eight-tab UI limit bounds ordinary retention only.

Save preserves an existing UTF-8 BOM and consistent line-ending convention and
rejects mixed EOL content. It writes through the retained file handle and calls
`fsync`, but the update is not crash-atomic; interruption can leave partial
content. The project also does not attempt comprehensive secret detection,
legacy-encoding conversion, binary/document parsing, or general file APIs.
