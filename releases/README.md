# Prebuilt Releases

Ready-to-run Windows x64 builds of Codex Live Explorer. Use these if you just
want to install the file tree into Codex Desktop without building from source.

> All builds here work with **any** Codex Desktop version (the version
> compatibility gate is disabled in this build).

## Install

Pick **one** of the following.

### Option A — One-click setup (recommended)

1. Go to [`v0.1.20/`](v0.1.20/).
2. Download `CodexLiveExplorer-0.1.20-x64-setup.exe`.
3. Double-click it. It installs to
   `%LOCALAPPDATA%\Programs\Codex Live Explorer` and redirects your existing
   Codex desktop shortcut to launch Live Explorer.
4. Launch Codex from your normal shortcut — the file tree appears in the sidebar.

### Option B — MSI

Double-click `CodexLiveExplorer-0.1.20-x64.msi`. Same result as Option A, but
registered as a standard Windows Installer package.

### Option C — Portable ZIP

1. Extract `CodexLiveExplorer-0.1.20-x64.zip` anywhere.
2. Run `Install-CodexLiveExplorer.exe` from the extracted folder.

## Uninstall

You do **not** need to open Windows Settings. Any of these work:

- Run `Uninstall-CodexLiveExplorer.exe` from
  `%LOCALAPPDATA%\Programs\Codex Live Explorer`, **or**
- If you used the MSI: uninstall from **Settings → Apps** as usual, **or**
- Open the installed folder and run the uninstaller directly.

Uninstalling restores your original Codex desktop shortcut, removes all
Codex Live Explorer files, and clears the Apps & Features entry. Your Codex
installation is left untouched.

> The uninstaller `.exe` is a thin wrapper that runs the
> `Uninstall-CodexLiveExplorer.ps1` script sitting next to it. Keep them
> together — do not copy the `.exe` somewhere else on its own.

## Build it yourself instead

See the repository [README](../README.md) build section. In short:

```bash
# 1. Frontend bundle
cd packages/explorer-ui && npm ci && npm run build

# 2. Rust binary
cargo build --release --bin codex-live-explorer

# 3. Package installers (Windows, PowerShell)
powershell -File scripts/package.ps1 -Version 0.1.20
```

Output lands in `artifacts/`.

## Verify downloads (optional)

SHA-256 for the 0.1.20 build:

```
CodexLiveExplorer-0.1.20-x64-setup.exe
  e7e84bfcdb8c378862fe50d846bfa7d2b834c5990c771cdd6887615f36e01ef9
CodexLiveExplorer-0.1.20-x64.msi
  4683bf6e937a397493b95a7dc71bd13c959a654af123f98914c1f98d15578895
CodexLiveExplorer-0.1.20-x64.zip
  cf312b8e0648b8b026ff4edcb9f3a23e0592885982540ffa953f375ec53b6b1b
```

Check on Windows with:

```powershell
Get-FileHash .\CodexLiveExplorer-0.1.20-x64-setup.exe -Algorithm SHA256
```
