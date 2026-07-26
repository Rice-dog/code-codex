# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and
the project uses semantic versioning.

## [Unreleased]

## [0.1.19] - 2026-07-24

### Fixed

- Keep the file-tree scrollbar's top triangle pointing up and bottom triangle
  pointing down at every scroll position, while fading the inactive endpoint.
- Lighten the file-tree scrollbar thumb in light and dark themes.

## [0.1.18] - 2026-07-24

### Fixed

- Switch file-tree endpoint triangles through their background images because
  Stable Codex Chromium ignores opacity on native scrollbar buttons.

## [0.1.17] - 2026-07-24

### Changed

- Show each file-tree scrollbar triangle only while its matching endpoint is
  reached; hide both indicators while the thumb is between endpoints.

## [0.1.16] - 2026-07-24

### Fixed

- Render the file-tree scrollbar endpoint controls as transparent triangle
  images instead of filled rectangular buttons in Chromium.

## [0.1.15] - 2026-07-24

### Changed

- Remove the visible `Project files` header label and refine the file-tree
  scrollbar thumb color and endpoint arrow visibility states.

## [0.1.14] - 2026-07-24

### Changed

- Align the bundled security and protocol documentation with permanent
  all-entry visibility, including `.git`, while retaining legacy settings
  compatibility.

## [0.1.13] - 2026-07-24

### Changed

- Always show hidden and ignored files and folders, including `.git`, and remove
  the visibility filter control so older saved preferences cannot hide entries.

## [0.1.12] - 2026-07-24

### Changed

- Show hidden files and folders by default and further soften the editing focus
  stroke.

## [0.1.11] - 2026-07-24

### Changed

- Restore the default arrow cursor in the file tree, soften the editing focus
  stroke, and clarify that the hidden-entry filter includes folders.

## [0.1.10] - 2026-07-24

### Added

- Add a sticky, responsive line-number gutter to syntax-highlighted file
  previews and the editor, including live draft updates and synchronized vertical
  scrolling without changing copied source text.

## [0.1.8] - 2026-07-24

### Added

- Add internal drag-and-drop for moving existing files and folders into another
  workspace folder or back to the project root, with hover expansion, clear drop
  feedback, collision protection, and eager source/destination refresh.
- Add the exact-schema `explorer.entry.move` operation with retained no-follow
  capabilities and root, reparse, collision, and self/descendant rejection.

### Fixed

- Pass the Windows Explorer `/select,` switch separately from paths so selected
  files with spaces or Unicode are revealed in the correct folder.

## [0.1.7] - 2026-07-24

### Changed

- Replace unreliable browser prompts in Stable Codex with keyboard-accessible,
  in-menu forms and confirmations for file actions, including inline validation,
  pending states, and visible success or error feedback.
- Fall back to the renderer copy command when the Clipboard API is unavailable
  or rejects a relative-path copy request.

### Fixed

- Correct collision-safe Windows file renames, including read-only files, without
  leaving duplicate source and destination entries after a failed cleanup.

## [0.1.6] - 2026-07-24

### Added

- Add a rounded, keyboard-accessible explorer context menu with preview, New
  File, New Folder, rename, relative-path copy, reveal, refresh, and confirmed
  deletion. The destructive command is labeled exactly **Delete**.
- Add exact-schema native create, rename, delete, and reveal operations enforced
  through retained workspace capabilities.

### Security

- Keep creation exclusive, rename within one parent and collision-safe, reject
  workspace-root and reparse-point mutations, and bound recursive deletion by
  depth and entry count without ambient recursive filesystem access.
- Validate reveal targets natively and invoke only fixed Windows Explorer
  arguments without returning absolute paths to the renderer.

## [0.1.4] - 2026-07-23

### Added

- Add clickable, windowless setup and uninstall executables for the portable
  release.
- Preserve a byte-for-byte backup of the official desktop `Codex.lnk`, together
  with a versioned ownership manifest, so uninstall can restore it exactly.

### Changed

- Make the existing desktop **Codex** shortcut launch Stable Codex through Live
  Explorer while preserving its name and official icon. Installation no longer
  creates separate desktop or Start Menu shortcuts for Code-Codex.
- Keep the shortcut target and setup tools at a stable installation root while
  placing release payloads under `versions\0.1.4` for predictable upgrades.
- Reject in-place switches between portable and MSI ownership before changing
  the shared installation root; uninstalling first remains supported.

### Security

- Validate the official Codex AppX identity before replacing the desktop
  shortcut, and replace or restore links atomically.
- Refuse to overwrite a desktop shortcut changed by another program or the user;
  uninstall restores the backup only while the current link is still owned by
  Code-Codex.
- Prefer the standalone setup executable's embedded release payload over files
  beside it, and preserve the prior shortcut state if an MSI install rolls back.
- Reject unsafe documentation destinations and physical cross-installer ownership
  conflicts before either installer mutates the installation.
- Keep a fresh portable installation retryable after a verified shortcut staging
  or replacement failure while preserving recovery state for ambiguous outcomes.

## [0.1.3] - 2026-07-23

### Fixed

- Preserve Codex's native user-message navigation rail while Code-Codex is
  expanded by reserving its responsive conversation lane without replacing or
  intercepting the native controls.
- Keep the conversation content and composer centered to the same bounded width
  when the native navigation lane is reserved.

## [0.1.2] - 2026-07-23

### Added

- Add live, bounded syntax highlighting to the editable preview while retaining
  the native textarea for input, selection, clipboard, keyboard, and IME use.

### Changed

- Use a higher-contrast editor palette in light and dark themes, with distinct
  colors for properties, strings, constants, numbers, headings, and punctuation.
- Expand TOML highlighting for table paths, array tables, dotted, quoted, and
  numeric keys, inline tables, and signed special numbers.

### Fixed

- Keep read and edit modes on the same token renderer and palette, update tokens
  immediately while typing, and synchronize both scroll axes after rerenders.
- Restore native text in forced-color and IME composition states so the editor
  remains legible and accessible.

## [0.1.1] - 2026-07-23

### Added

- Add bounded editing for existing, complete preview-eligible UTF-8 files through
  `explorer.preview.save`, with Base64 ingress, 64 KiB content limits, preserved
  BOM/line endings, and optimistic content-version conflict detection.

### Changed

- Make verified Codex Stable `26.715.10079.0` the default target for bare CLI,
  `run`, Start Menu, desktop-shortcut, and optional sign-in launches. Beta
  `26.715.3651.0` remains available with `--channel beta`, while
  `--channel any` now prefers Stable.
- Allowlist Stable `26.715.10079.0` after isolated end-to-end CDP, renderer,
  App Server, preview, highlighting, mouse-switching, dismissal, and reload
  verification.
- Replace the active preview with an editor when **Read only** is toggled; saving
  returns to the highlighted view, while Ctrl/Cmd+S saves in place.

### Fixed

- Remove the duplicate explorer root label when it matches the project title.
- Extend the active file-tab background through its close button.
- Replace equal-version development installations correctly and stop both MSI
  and portable installs before mutation when Code-Codex is still running.

### Security

- Keep directory listing read-only and expose no generic write/create/delete/move
  API. Save reuses preview policy and retained no-follow handles, rejects mixed
  line endings and stale versions, and keeps bridge ingress capped at 96 KiB.

## [0.1.0] - 2026-07-22

### Added

- Windows Rust launcher and Codex package discovery.
- Loopback CDP connector with idempotent renderer injection.
- Read-only, capability-protected native explorer bridge.
- Secure lazy directory listing and real-time filesystem notifications.
- Automatic active-thread-to-workspace resolution with a manual diagnostics
  fallback.
- Accessible Shadow DOM file tree with resizing, collapse, themes, virtualization,
  hidden/ignored filters, remount recovery, and explicit file-change badges.
- Loaded-file filtering with ancestor context, keyboard shortcuts, and accessible
  empty-result feedback.
- Suffix-aware file icons for common languages, configuration, media, archives,
  documents, databases, shells, Git metadata, and lockfiles.
- Explicit file-selection previews for native-allowlisted UTF-8 text, bounded to
  the first 64 KiB with truncation and unsupported-state feedback.
- A VS Code-style subject bar in the Codex main surface with a permanent
  Conversation subject and bounded, switchable file tabs. The native
  conversation remains mounted while a file occupies the main view.
- Dependency-free, path-selected syntax highlighting with bounded token runs,
  light/dark palettes, and literal text-node rendering for hostile source text.
- Per-user MSI and portable installation with optional sign-in launch.
- Unit, security, bridge, watcher, UI, performance, packaging, SBOM, and legal
  metadata verification.

### Fixed

- Carve the main subject tab strip out of Codex's Electron draggable header so
  physical mouse clicks switch tabs instead of being consumed as window input.
- Match the explorer to Codex's neutral interface typography and surfaces, keep
  compact header text on dedicated grid rows, and re-anchor the verified native
  conversation toolbar so it cannot paint over the inline panel.
- Keep the canonical renderer under bounded qualification while its completed
  HTML document is still waiting for the React app shell to mount, and
  immediately final-probe unresolved peers before granting the native lease.
- Give owned cold launches a bounded 120-second renderer window while keeping
  attach mode at 30 seconds, and preserve that absolute deadline while a
  qualified candidate waits for auxiliary targets to be ruled out.
- Fence renderer-session status by generation so late messages from a replaced
  CDP target cannot authorize or remove its successor during reload recovery.
- Restore a deliberately hidden explorer when a local task is selected or
  reselected, while ignoring cloud tasks, modified clicks, and nested Pin or
  Archive controls.
- Match the compact tree reference with 28-pixel rows, 10-pixel gutters,
  18-pixel indentation, continuous guides, and one shared chevron/icon slot.

### Security

- Bound the native bridge to an exact official listener, qualified top-frame
  document lifetime, per-launch capability, bounded ingress queue, and strict
  read-only method allowlist.
- Bound workspace enumeration to retained no-follow handles and rejected
  reparse-point or oversized ignore sources.
- Bound text preview to a fixed native extension allowlist and sensitive
  denylist, strict UTF-8/NUL validation, retained handle-relative no-follow file
  opens, and a 64 KiB return ceiling with one sentinel byte sampled for
  truncation; no general `readFile` or raw-byte method was added.
- Added a kill-on-close Windows Job Object for the complete debug-enabled Codex
  process tree.
