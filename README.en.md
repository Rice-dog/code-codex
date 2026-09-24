# Code-Codex

[简体中文](README.md) | English

<p align="center">
  <img src="crates/launcher/resources/code-codex.ico" alt="Code-Codex icon" width="96">
</p>

<p align="center">
  <em>Add a local project file tree, preview tabs, and bounded editing to Codex Desktop.</em>
</p>

<p align="center">
  <a href="https://github.com/Rice-dog/code-codex/releases/tag/v0.3.1"><img alt="Version" src="https://img.shields.io/badge/version-0.3.1-blue"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green"></a>
  <img alt="Windows 10 x64 supported" src="https://img.shields.io/badge/platform-Windows%2010%2B%20x64-0078D4?logo=windows&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.85%2B-orange">
  <img alt="Status" src="https://img.shields.io/badge/status-preview-yellow">
</p>

Code-Codex is an unofficial community project that adds a local project file tree
to Codex Desktop. It demonstrates a local Windows companion app, a bounded
workspace bridge, and an injected TypeScript explorer UI for file preview,
editing, navigation, and file operations.

> [!IMPORTANT]
> Code-Codex is not affiliated with OpenAI.

![Code-Codex file tree in Codex](docs/screenshots/file-tree-conversation.png)

![Code-Codex code preview with syntax highlighting](docs/screenshots/code-preview.png)

## Install Option 1: Download EXE

Download the ready-made installer from [`releases`](releases/):

Runtime requirement: Windows 10 version 2004 (build 19041) or newer, x64,
with the official stable Codex/ChatGPT Desktop app installed.

- Recommended: `CodeCodex-0.3.1-x64-setup.exe`
- Alternative: `CodeCodex-0.3.1-x64.msi`
- Portable package: `CodeCodex-0.3.1-x64.zip`
- Standalone uninstaller: `Uninstall-CodeCodex.exe`

You can verify downloads with:

```powershell
Get-FileHash .\CodeCodex-0.3.1-x64-setup.exe -Algorithm SHA256
```

Compare the result with [`SHA256SUMS.txt`](releases/SHA256SUMS.txt).

If the official Codex/ChatGPT Desktop app is installed, the installer checks
for a desktop `Codex` shortcut first and a desktop `ChatGPT` shortcut second.
Only when neither shortcut exists does it create a new managed `Code-Codex`
desktop shortcut.

## Install Option 2: Build EXEs From Source

Requirements:

- Windows 11 x64.
- Rust with the MSVC toolchain.
- Node.js 20.19 or newer.
- Visual Studio Build Tools with Desktop C++.
- .NET SDK if you want to build the MSI package.

Build the release EXE files:

```powershell
./scripts/build.ps1 -Configuration Release
```

The generated EXE files are written to `target/release/`, including:

- `code-codex.exe`
- `code-codex-launcher.exe`
- `Install-CodeCodex.exe`
- `Uninstall-CodeCodex.exe`
- `code-codex-setup.exe`
- `code-codex-shim.exe`
- `code-codex-shortcut.exe`
- `code-codex-uninstall.exe`

Generate the downloadable setup EXE, MSI, and ZIP:

```powershell
./scripts/package.ps1 -Version 0.3.1
```

The generated packages are written to `releases/`.

## Uninstall

Every install path includes a source-built uninstaller program:

- Downloaded setup/ZIP installs place `Uninstall-CodeCodex.exe` under
  `%LOCALAPPDATA%\Programs\Code-Codex`.
- Source builds place `Uninstall-CodeCodex.exe`,
  `Uninstall-CodeCodex.ps1`, and `Finalize-Uninstall.ps1` in `target/release/`.

Run `Uninstall-CodeCodex.exe` to restore the original Codex or ChatGPT shortcut
and remove Code-Codex files. If installation created a standalone `Code-Codex`
desktop shortcut because both official shortcuts were missing, uninstall removes
that shortcut. MSI installs can also be removed from Windows **Installed apps**.

## Features

### Core Features

- A Code-Codex menu beside Help in the Codex top bar shows or hides the file tree, opens Preview Market, checks for updates, and opens the project's GitHub repository.
- File tree in the Codex sidebar for local workspaces.
- Drag files and folders from Windows File Explorer into the workspace root or a file-tree folder.
- Context menu actions for create, rename, delete, copy path, reveal, and refresh.
- Drag-and-drop movement for workspace files and folders.
- Main-window file tabs beside the conversation.
- Text preview and editing, including multilingual Markdown content.
- A local bridge restricted to bounded workspace operations.

### Plugins

- Preview Market groups plugins into Appearance, File Preview, and Tools, and opens on Appearance by default.
- File Preview independently enables Markdown, CSV, diagram, image, video, PDF, audio, Jupyter Notebook, Office, and 3D model previews, with all processing performed locally.
- Appearance includes Transparent, Particle Image, Black Hole, Glow Horizon, Heavenly Cloud, Aurora Ionosphere, Milky Way, Layered Mountain, Cloud Train, and Pixel Sculpt backgrounds.
- Git History under Tools shows the current branch, commits, changed files, and colored per-file diffs in read-only mode without repository write operations.

### Updates and Compatibility

- Click the version number at the bottom of the file tree or choose **Check for Updates…** from the Code-Codex menu to check GitHub for the latest published stable release.
- Startup failures show the exact failing stage, a stable support code, a suggested action, and buttons to copy or open a redacted local diagnostic report.
- Codex package versions are diagnostic only; future versions proceed through live protocol and DOM qualification instead of a fixed version allowlist.

## Preview Market Plugins

Preview Market is located at the bottom of the Code-Codex file tree. It groups plugins into
**Appearance**, **File Preview**, and **Tools**, shows one category at a time, and opens on
Appearance by default.

### File Preview Plugins

![Code-Codex interactive glTF and GLB 3D model preview](docs/screenshots/gltf-preview.png)

File Preview can independently enable Markdown, CSV, diagram, image, video, PDF, audio,
Jupyter Notebook, Office document, and glTF 3D model previews. All preview processing runs
locally on the user's computer.

The 3D Model Preview plugin provides an interactive view for `.gltf` and `.glb`
files with orbit, pan, zoom, fit/reset, reference-grid, and animation controls.

### Appearance Plugins

![Code-Codex Particle Image Background appearance plugin](docs/screenshots/particle-image-background.png)

The Particle Image Background appearance plugin transforms locally selected
images into an animated grayscale particle field across Codex. Its image
library supports ordered auto-switching, smooth morphing, per-photo position
and zoom, direct numeric values, and adjustable flow, pointer, source, and
render settings. Transparent Background is available separately. Particle
images and settings remain local to the user's Codex profile.

![Code-Codex Black Hole Background appearance plugin](docs/screenshots/black-hole-background.png)

The Black Hole Background appearance plugin reuses the same full-window
background surface and adds an adjustable ray-marched black hole with temporal
accumulation and bloom. Its renderer quality values are fixed internally for a
consistent experience and are intentionally hidden from users. Enabling it
switches the real Codex Appearance setting to Dark; disabling it restores the
user's previous Appearance setting.

![Code-Codex Glow Horizon Background appearance plugin](docs/screenshots/glow-horizon-background.png)

The Glow Horizon Background appearance plugin adds an interactive luminous
horizon across the full Codex window. It supports top, bottom, left, and right
directions, wheel-driven deformation, inertia and return controls, opening
animation settings, customizable glow colors, and Chinese/English labels.
Enabling it switches Codex to Dark appearance and disabling it restores the
previous appearance setting.

![Code-Codex Heavenly Cloud Background appearance plugin](docs/screenshots/heavenly-cloud-background.png)

The Heavenly Cloud Background appearance plugin adds a textureless,
ray-marched celestial cloud tunnel across the full Codex window. It provides
adjustable drift, light density, turbulence, tunnel radius, spectral shift,
pointer steering, opening animation, and three render-quality levels. Its
settings panel supports Chinese and English, and it uses the same automatic
Dark appearance and restoration behavior as the other GPU backgrounds.

![Code-Codex Aurora Ionosphere Background appearance plugin](docs/screenshots/aurora-ionosphere-background.png)

The Aurora Ionosphere Background appearance plugin adds runtime-generated
volumetric aurora curtains and a procedural star field across the full Codex
window. It preserves the source effect's three-pass WebGL pipeline, adaptive
quality, and cinematic reveal while exposing bilingual controls for the ion
field, opening sequence, quality, and animation state.

![Milky Way Background](docs/screenshots/milky-way-background.png)

The Milky Way Background appearance plugin fills the Codex window with five-color
harmonic light. Its bilingual settings panel provides individual colors, flow
speed, amplitude, frequency, scale, rotation, brightness, and opening controls.
It uses one WebGL pass, pauses rendering while hidden, and supports pause, replay,
and reduced motion. Like the other GPU backgrounds, it activates Dark appearance
and restores the previous preference when disabled. The supplied effect project
reconstructs a partial reference to “Milky way” by Almina (@Code4_11).

![Layered Mountain Background](docs/screenshots/layered-mountain-background.png)

Layered Mountain Background adds animated atmospheric ridges, warm backlight, mist, and depth across the Codex window, with bilingual controls for reverse drift, mountain shape, exposure, render scale, quality, pause, and reset; its gentle three-second opening reveals the ridges from back to front, supports replay, and is skipped under reduced motion; the plugin uses a two-pass WebGL 2 renderer with a compact ridge atlas and automatically restores the previous appearance after its native Dark mode is disabled.

![Cloud Train Background](docs/screenshots/cloud-train-background.png)

Cloud Train Background renders clouds, a steam train, and a bridge across Codex, with bilingual controls for speed, zoom, cloud detail, feedback, hue, temperature, independent sky/smoke/train tints, pause, and reset; its staggered in-place opening fades layers from back to front without vertical movement and provides an enable switch, a 0.5–10 second duration, feather width, and replay, defaulting to three seconds and skipping under reduced motion; enabling the plugin uses the native Dark appearance and disabling it restores the previous setting.

#### Pixel Sculpt Background

![Pixel Sculpt Background](docs/screenshots/pixel-sculpt-background.png)

Enable Pixel Sculpt Background in Preview Market to transform images into an interactive 3D pixel-relief background. Its bilingual secondary settings panel controls tile shape, relief depth, pointer ripples, color, position, and rotation, with a local image library, playback ordering, and automatic morph transitions. Enabling the plugin switches Codex to its native Dark appearance; disabling it restores the previous setting.

### Tool Plugins

Git History is available under Tools and shows the current branch and commit history in read-only
mode. Open a commit to inspect its changed files, then select a filename to open a diff tab in the
main conversation area with green additions, red deletions, and purple hunk-location metadata.

## Repository Layout

```text
crates/
  cdp-client/          Chrome DevTools Protocol client
  context-resolver/    Codex task/workspace context resolution
  launcher/            Windows launcher and Codex integration logic
  workspace-service/   File listing, preview, mutation, settings, and watcher code

packages/
  explorer-ui/         Injected TypeScript explorer UI

installer/             Windows installer source files
scripts/               Build and packaging helper scripts
releases/              Ready-made downloadable packages
```

## Notes

Generated build folders such as `target/`, `node_modules/`, `dist/`, and
`artifacts/` are intentionally ignored by Git. Standalone test suites and CI
workflows are not included in this public source package.

## License

[MIT](LICENSE). See the [third-party notices](THIRD_PARTY_NOTICES_EN.md) for effect provenance, Code-Codex modifications, and license boundaries.
