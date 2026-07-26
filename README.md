# Code-Codex

English | [简体中文](README.zh-CN.md)

**Code-Codex gives Codex Desktop the project file tree it is missing, and makes
opening and previewing project files effortless.** It is a local-first tree with
bounded file actions, text preview, and editing that follows the selected local
task and leaves the official Codex installation untouched.

> [!IMPORTANT]
> Code-Codex is an unofficial community project. It is not affiliated
> with, endorsed by, or supported by OpenAI. OpenAI, ChatGPT, and Codex may be
> trademarks of OpenAI.

## What it does

- Launches the installed Windows Codex Desktop package with a random,
  loopback-only Chrome DevTools endpoint.
- Injects one isolated `<code-codex>` Shadow DOM panel between the native
  task sidebar and conversation surface.
- Reads the selected local thread ID from a versioned renderer adapter and resolves
  its `cwd` through the official Codex App Server protocol.
- Lists all immediate directory children, including hidden and ignored entries
  such as `.git`, paginates large folders, and virtualizes rendered rows. Selected,
  native-allowlisted text files
  open as line-numbered tabs across the top of the Codex main surface.
- Lets an existing, complete preview-eligible UTF-8 file up to 64 KiB be edited
  and saved with optimistic version checking. Markdown (`.md`) and other UTF-8
  text render correctly regardless of language, including Chinese content.
- Provides a compact file/folder context menu for preview, empty file/folder
  creation, same-parent rename, confirmed delete, relative-path copy, reveal in
  Windows Explorer, and targeted refresh. Existing workspace files and folders
  can be dragged into another workspace folder without overwrite.
- Watches the active workspace and marks added, modified, deleted, and renamed
  paths without rescanning the entire repository.
- Supports keyboard navigation, typeahead, resizing, collapse, light/dark themes,
  reduced motion, explicit error states, and a narrow-window drawer.
- Fails closed for unknown Codex versions, ambiguous renderers, non-local tasks,
  invalid paths, and workspace escapes.

The native bridge has no general `readFile`, `writeFile`, import, search, shell,
credential, model, or arbitrary-command operation. Content access is limited to
fixed-policy preview/save methods, and tree changes are limited to exact-schema,
workspace-bounded create, rename, move, delete, and reveal methods described under
[Security and privacy](#security-and-privacy).

## Verified baseline

| Layer | Verified version |
|---|---|
| Windows | Windows 11 x64, build 26200 |
| Codex Stable | 26.715.10079.0 — default; CDP launch, injection, reload, App Server, preview |
| Codex Beta | 26.715.3651.0 — supported as an explicit legacy channel |
| Chromium / CDP | 150.0.7871.124 / protocol 1.3 |
| Codex App Server | 0.145.0-alpha.18 |

Stable `26.715.10079.0` passed an isolated end-to-end probe covering the native
workspace resolver, physical tree and subject-tab clicks, exact text preview,
syntax highlighting, dismissal/reselection, and two renderer reloads. Beta
`26.715.3651.0` remains allowlisted for explicit compatibility use.

Renderer integration is an undocumented compatibility layer. Exact package
versions are allowlisted; updates require a selector-contract and smoke-test pass.
See [compatibility](docs/compatibility.md).

## Install a release

Prebuilt Windows x64 installers are bundled in [`releases/v0.1.20/`](releases/v0.1.20/)
(and attached to GitHub Releases). See [`releases/README.md`](releases/README.md)
for the full install/uninstall walkthrough. In short: download the setup EXE,
double-click, done. This build works with **any** Codex Desktop version.

### One-click setup

Double-click `CodeCodex-<version>-x64-setup.exe`, or run
`CodeCodex-<version>-x64.msi`. Both install for the current user under
`%LOCALAPPDATA%\Programs\Code-Codex` without administrator privileges.
Use the same format for later upgrades. To switch between setup EXE/ZIP and
MSI ownership, uninstall the existing copy first; setup stops before changing
files when it detects the other installer type.

Setup keeps the existing desktop shortcut named **Codex**, preserves its
official icon, and redirects it through Code-Codex. It does not add a
separate desktop or Start Menu shortcut. The original AppX shortcut is backed up
byte for byte for uninstall.

### Portable ZIP

The portable ZIP includes `Install-CodeCodex.exe` for one-click setup
after extraction, plus the audited PowerShell entry point for scripted setup:

```powershell
./Install-CodeCodex.ps1
```

Release artifacts include SHA-256 checksums, an SPDX inventory of the shipped
executable and embedded-UI build supply chain, verbatim license/notice texts for
linked Rust crates, and reproducible build inputs. The optional Remotion demo
authoring toolchain is source-only, locked separately under `demo-video/`, and is
not installed or represented as an application runtime dependency. The
executables and MSI produced by the included local and GitHub Actions workflows
are unsigned because this project does not have a code-signing certificate.
Verify `SHA256SUMS.txt` before running them; Windows may show an
unknown-publisher warning. A production publisher should code-sign the MSI and
executables before distribution.

## Use

Setup and upgrades can finish while Codex is open. Restart Codex afterward, then
launch **Codex** from the same desktop shortcut you already use. That shortcut
now starts verified Stable Codex through Code-Codex, so the panel is
available after Codex opens; no server or separate launcher shortcut is
required.

The executable defaults to `run` and launches the verified Stable channel.
Beta remains available explicitly; `--channel any` prefers Stable and falls
back to Beta only when Stable is unavailable:

```powershell
code-codex.exe
code-codex.exe run --channel stable
code-codex.exe run --channel beta
code-codex.exe diagnose --channel stable
```

The desktop shortcut targets the stable, unversioned
`%LOCALAPPDATA%\Programs\Code-Codex\CodeCodex.exe` GUI launcher,
so no console window remains open and upgrades do not need a version-specific
shortcut. `current-version` selects the payload under `versions`; the
command-line executable remains available there for `diagnose`, scripting, and
development flags.

Useful development-only modes:

```powershell
# Pin a workspace while testing the file service and renderer.
code-codex.exe run --channel stable --workspace C:\work\demo

# Attach to a loopback CDP endpoint owned by an installed official Codex package.
code-codex.exe attach --port 9222 --codex-version 26.715.10079.0 --channel stable
```

Code-Codex refuses caller-supplied CDP flags in `--codex-arg`, absolute paths
from the renderer, unverified attach listeners, and unsupported versions unless
the explicit development override is supplied. Diagnostics print redacted
versions and counts; default runtime logs omit project paths and file names.

Use the header close control to hide Code-Codex and stop its watcher. Select
or reselect a local task in the Codex sidebar to show it again. Closing the panel
affects only the current task selection; launching Codex again from the desktop
shortcut starts Code-Codex again.

Select a supported file, or focus it and press Enter, to open it in the main
Codex surface. The top subject bar keeps **Conversation** first and adds one tab
per open file, so switching back never destroys the conversation. Reopening a
file reuses its tab; close a file with its tab close button, or press Escape to
return to Conversation. Up to eight file tabs can remain open at once.

Each file view shows at most the first 64 KiB and labels truncated files. Binary,
invalid UTF-8, sensitive, reparse-point, and unsupported file types show a
bounded unavailable state instead of content. Known code and configuration
formats receive deterministic, path-based syntax colors; plain and unknown text
keeps its literal unstyled form. A sticky line-number gutter stays aligned in
read-only and editing modes without entering copied text. Highlighting is
cosmetic and never activates project HTML, Markdown, SVG, scripts, or links.

For a complete editable preview, click **Read only** to replace the highlighted
view with a text editor. Click **Editing** to save and return to the read-only
preview, or press Ctrl+S (Cmd+S where applicable) to save without leaving the
editor. A save is rejected if the file changed after it was previewed; reload the
file before retrying. UTF-8 BOM and consistent CRLF/LF style are preserved.
Truncated files and files with mixed line endings cannot be edited.

Right-click a file or folder for its context menu. **New File** and **New Folder**
create an empty sibling from a file row or a child from a folder row; the same
commands create at the workspace root from blank tree space. Rename stays within
the current parent and never overwrites an existing entry. The destructive item
is labeled **Delete** and asks for confirmation when activated. Shift+F10 and the
Context Menu key expose the same keyboard-navigable menu.

## Build from source

Prerequisites:

- Windows 11 x64
- Rust stable MSVC with rustfmt and Clippy
- Visual Studio Build Tools with Desktop C++ and Windows 11 SDK
- Node.js 24 and npm
- .NET 8 SDK (used to restore the pinned WiX 5 tool for MSI packaging)
- An installed Codex Desktop package for manual compatibility testing

From a fresh PowerShell session:

```powershell
./scripts/test.ps1
./scripts/build.ps1 -Configuration Release
./scripts/package.ps1 -Version 0.1.19
```

`test.ps1` runs TypeScript tests/type checking/build, Rust formatting, Clippy with
warnings denied, all workspace tests, and release-metadata validation.
`package.ps1` produces a portable ZIP, per-user MSI, checksums, SPDX SBOM, and
generated third-party notices under `artifacts/`.

The default production bundle is compiled into the Rust executable. The
`--ui-bundle` option is an explicit local-development override, not a dynamic
update mechanism.

## Architecture

```text
Windows package discovery → Codex process → loopback CDP → renderer adapter
                                                     ↓
                                    capability-protected native bridge
                                       ↙                         ↘
                          App Server thread/cwd          secure workspace service
                                                               ↓
                                                   lazy listing + watcher
```

- `crates/launcher`: process/package lifecycle, diagnostics, bridge orchestration
- `crates/cdp-client`: target discovery, binding, injection, and reinjection
- `crates/context-resolver`: newline-delimited App Server client
- `crates/workspace-service`: containment, listing, bounded preview and item
  actions, settings, and watcher
- `packages/explorer-ui`: dependency-light injected TypeScript UI and demo

Read [architecture](docs/architecture.md), [bridge protocol](docs/protocol.md),
[threat model](docs/threat-model.md), and [testing](docs/testing.md) for details.

## Security and privacy

- CDP binds only to `127.0.0.1` on a random port, and its listener PID must belong
  to the launched Codex process tree.
- Every binding request needs a one-launch capability and passes rate, size, method,
  and schema gates.
- Native path access binds the canonical root once, validates every relative
  component, and opens paths through retained no-follow directory capabilities;
  Windows path ambiguities and symlink/junction escapes are rejected.
- `explorer.preview` accepts one relative path and returns at most 64 KiB of
  strict UTF-8 text for a native-allowlisted file. It denies known sensitive
  names and key/certificate/credential formats, rejects NUL/binary content, and
  never follows a symlink, junction, or other reparse point.
- `explorer.preview.save` can update only an existing, complete, preview-eligible
  UTF-8 file of at most 64 KiB. It accepts Base64-encoded content and the exact
  version returned by preview and rechecks the same path/sensitive/reparse policy.
- Item actions accept only validated relative paths and one-component names.
  Creation is exclusive, rename stays within one parent without overwrite, root
  mutation is prohibited, and drag-to-move preserves the source leaf while
  rejecting collisions and self/descendant destinations. Recursive delete is
  depth/count bounded and walks retained no-follow handles. Reveal uses fixed
  Windows Explorer arguments and never returns an absolute path to the renderer.
- Watcher notifications contain relative paths and event kinds, never contents.
- Settings persist panel width and collapse state. Legacy visibility fields remain
  parseable for compatibility, but listing and watching always include hidden and
  ignored entries, including `.git`.

Preview text crosses the capability-protected CDP bridge into the official Codex
renderer and may remain in memory while its file tab is open. The UI bounds its
live tab set and purges every tab on task/context changes, dismissal, or renderer
disconnect. Text is not written to Code-Codex settings or logs, but the
renderer is not a confidentiality boundary: renderer scripts and other processes
running as the same Windows user may be able to inspect displayed text. File
selection, the **Read only** toggle, context-menu activation, and delete
confirmation are UI conventions rather than native proofs of user intent. An
authorized Codex renderer holding the launch capability can preview/save eligible
paths and invoke the bounded item actions without those clicks. `expectedVersion`
prevents stale preview-save overwrite; it does not prevent a malicious authorized
renderer from writing. Saves use an in-place write followed
by `fsync`, preserving file identity and ACLs, but are not crash-atomic. Do not
preview or edit secrets on an account shared with untrusted processes. The
sensitive-name denylist is defense in depth, not a secret scanner.

CDP still expands the attack surface for other processes running as the same
Windows user. Read [SECURITY.md](SECURITY.md) before using the tool on a shared or
untrusted account.

## Uninstall

Use Windows **Installed apps** or double-click
`%LOCALAPPDATA%\Programs\Code-Codex\Uninstall-CodeCodex.exe`.
Scripted installations can also run `Uninstall-CodeCodex.ps1`; pass
`-KeepSettings` only when you deliberately want to preserve panel preferences
for a later reinstall.

Uninstall validates the saved shortcut hash and confirms that the current
desktop link still targets Code-Codex before restoring the original
`Codex.lnk` byte for byte. If the shortcut was changed after installation, the
uninstaller leaves it untouched and reports the conflict instead of overwriting
someone else's change, and no Code-Codex files are removed. After a successful
shortcut restore, uninstall removes only Code-Codex files and UI settings;
Codex, local projects, credentials, and conversations remain untouched. Close
Codex before uninstalling.

## License

[MIT](LICENSE). See [THIRD_PARTY.md](THIRD_PARTY.md) for the dependency inventory
and [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) for the corresponding
license and notice texts.
