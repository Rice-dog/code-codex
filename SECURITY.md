# Security policy

Code-Codex is deliberately narrow: it shows path metadata for one local
workspace, watches that workspace, and provides bounded preview/save plus exact
create, rename, move, delete, and reveal operations. It does not expose a general
`readFile`, `writeFile`, import, shell, credential, model, authentication, or
arbitrary native-dispatch operation.

## Supported versions

Security fixes are provided for the latest released version. Compatibility is
explicitly gated by Codex Desktop package version; an unknown renderer adapter
must fail closed instead of guessing where to inject or which task is active.

## Reporting a vulnerability

Open a private GitHub security advisory for the repository. Include the Live
Explorer version, Codex Desktop package version, Windows build, reproduction
steps, and impact. Do not include credentials, session databases, project source,
or unredacted absolute paths in a public issue.

## Security boundaries

- CDP listens on `127.0.0.1` on a randomly selected port and is active only for
  the Codex process launched by Code-Codex.
- The renderer bridge requires a per-launch random capability token and accepts
  only the documented `explorer.*` method allowlist.
- The renderer sends only relative paths. Native code rejects absolute, parent,
  UNC, device, alternate-data-stream, overlong, and NUL-containing paths.
- Every candidate is resolved under a canonical workspace root. Symlinks and
  junctions that leave the root are rejected and never traversed recursively.
- Preview, save, and item actions open every parent and final candidate through
  retained, handle-relative no-follow capabilities. Symlinks, junctions, and
  other reparse points are rejected rather than traversed.
- Creation uses one validated leaf and exclusive file creation; rename changes
  only that leaf within its current parent and never overwrites an entry. The
  workspace root cannot be renamed or deleted.
- Directory deletion is depth/count bounded and recursively walks retained
  no-follow handles instead of an ambient recursive-delete API.
- Reveal accepts only a validated existing relative path and invokes fixed
  Windows Explorer arguments. Absolute roots do not cross into the renderer.
- Directory responses and request rates are bounded. Watcher overflow triggers a
  bounded refresh of expanded directories rather than a repository-wide scan.
- Default logs omit absolute paths, file names, bridge tokens, and request bodies.
- Settings contain panel width and collapsed state. Legacy visibility fields
  remain parseable, but hidden and ignored entries, including `.git`, are always
  included in directory listings and watcher coverage.

## File preview and save policy

`explorer.preview` accepts exactly one validated relative path. The byte ceiling,
file classification, and encoding policy are fixed in native code; the renderer
cannot supply a root, raise the limit, or request raw bytes.

The UI requests preview after a file selection, but native code cannot
authenticate a physical click. It authenticates the renderer document and
per-launch capability; a renderer holding that capability can request any
relative path that passes the native preview policy. The allowlist, denylist,
containment checks, and byte ceiling are therefore enforced independently of UI
state.

`explorer.preview.save` accepts exactly one relative path, the 64-character
version returned by `explorer.preview`, and Base64-encoded replacement text. It
can update only an existing, complete preview-eligible regular file. This save
method cannot create, delete, rename, move, or write another path or raw bytes.
The bridge allows at most 96 KiB of request JSON so a Base64-encoded 64 KiB edit
fits while remaining bounded.

- At most the first 64 KiB is returned, with an explicit `truncated` flag when
  the regular file is larger.
- Only the documented source, markup, data/configuration, script, and plain-text
  extension/name allowlist is eligible. Binary media, archives, executables,
  databases, and office document formats remain unsupported.
- `.env` variants, credential dotfiles, private-key, certificate, keystore, and
  other known sensitive names or extensions are denied even if they contain
  valid text. This denylist is defense in depth and cannot identify every secret.
- Accepted content must be strict UTF-8 (an initial UTF-8 BOM is allowed) and
  contain no NUL byte. Invalid UTF-8 and binary-looking data are not returned.
- Editing is available only when the complete existing file and replacement are
  at most 64 KiB and use no mixed line endings. Native code preserves an existing
  UTF-8 BOM and the previewed LF or CRLF convention.
- Save reopens the same path through retained, handle-relative no-follow
  capabilities, reapplies the sensitive/type/content policy, and compares the
  current SHA-256 content version with `expectedVersion`. A mismatch returns
  `CONFLICT` instead of overwriting a newer external change.
- Preview text is rendered only through text nodes and fixed-class token spans
  populated with `textContent`. Bounded lexical highlighting does not execute
  HTML, Markdown, SVG, scripts, or links from a project file.
- Preview contents are not written to settings, persistent or on-disk caches,
  browser storage, diagnostics, or logs. The UI keeps at most eight live file
  tabs and their syntax-rendering results in a bounded renderer-memory cache,
  and purges both on workspace/context changes, dismissal, or disconnect.
  Watcher notifications continue to contain paths and event kinds only.

The complete effective allowlist and denylist are documented in
[the bridge protocol](docs/protocol.md).

The visible **Read only** / **Editing** control, context menu, and **Delete**
confirmation are workflow affordances, not security boundaries. An authorized
Codex renderer holding the per-launch capability can call preview/save and the
bounded create, rename, move, delete, or reveal methods without those physical clicks.
The move method accepts only an existing workspace-relative source and a
workspace-relative destination folder; it preserves the leaf name and cannot
overwrite or import an external path.
`expectedVersion` prevents accidental stale preview-save overwrite; it does not
stop a malicious authorized renderer from changing workspace data.

## Residual risk

CDP grants extensive control over the debugged desktop renderer. Another process
running as the same Windows user may be able to race or inspect a loopback debug
endpoint. The capability token narrows the native bridge but does not turn an
already-compromised Codex renderer into a trusted environment. Do not run Live
Explorer on a Windows account shared with untrusted processes.

Selected preview text crosses into the official Codex renderer. The active file
is placed in an open Shadow DOM, and inactive open tabs remain in bounded
renderer memory. Renderer scripts or a same-user process that can inspect the
debug session may therefore read it. Closing a tab or clearing the workbench
removes Code-Codex's references but cannot guarantee immediate erasure of
every renderer-memory copy. Do not treat the tab limit or sensitive-name
denylist as a confidentiality boundary.

Saving updates the retained file handle in place, truncates to the replacement
length, and calls `fsync`. This preserves file identity and ACLs but is not
crash-atomic: a process or system failure during the write can leave partial
content. Backup or source control remains the recovery boundary.

Regular-file rename creates a capability-relative hard link at the exclusive
destination and then removes the old name. It does not clobber a destination,
but it requires hard-link support and is not a single crash-atomic operation.
Recursive delete preflights its complete bounded subtree; a concurrent same-user
change during the deletion pass can still leave a partially deleted subtree
inside the workspace. Neither path follows a reparse point or escapes the
retained root. Source control remains the recovery boundary for item mutations.

Code-Codex is an unofficial community tool. It does not modify the Codex
installation, but Codex updates can break undocumented renderer integration. Stop
using a build whose compatibility gate or target verification fails.
