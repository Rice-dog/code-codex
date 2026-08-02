# Code-Codex

![Windows 10 x64 supported](https://img.shields.io/badge/Windows%2010%20x64-supported-0078D4?logo=windows&logoColor=white)

English | [简体中文](README.zh-CN.md)

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

- Recommended: `CodeCodex-0.1.33-x64-setup.exe`
- Alternative: `CodeCodex-0.1.33-x64.msi`
- Portable package: `CodeCodex-0.1.33-x64.zip`
- Standalone uninstaller: `Uninstall-CodeCodex.exe`

You can verify downloads with:

```powershell
Get-FileHash .\CodeCodex-0.1.33-x64-setup.exe -Algorithm SHA256
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
- Node.js 20 or newer.
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
./scripts/package.ps1 -Version 0.1.33
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

- File tree in the Codex sidebar for local workspaces.
- Main-window file tabs beside the conversation.
- Text preview and editing, including multilingual Markdown content.
- Context menu actions for create, rename, delete, copy path, reveal, and refresh.
- Drag and drop file movement.
- Local bridge code for bounded workspace operations.

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

[MIT](LICENSE).
