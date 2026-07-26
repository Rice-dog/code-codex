# Prebuilt Releases

Ready-to-run Windows x64 builds of Code-Codex. Use these if you just
want to install the file tree into Codex Desktop without building from source.

> All builds here work with **any** Codex Desktop version (the version
> compatibility gate is disabled in this build).

## Install

Pick **one** of the following.

### Option A — One-click setup (recommended)

1. Go to [`v0.1.20/`](v0.1.20/).
2. Download `CodeCodex-0.1.20-x64-setup.exe`.
3. Double-click it. It installs to
   `%LOCALAPPDATA%\Programs\Code-Codex` and redirects your existing
   Codex desktop shortcut to launch Code-Codex.
4. Launch Codex from your normal shortcut — the file tree appears in the sidebar.

### Option B — MSI

Double-click `CodeCodex-0.1.20-x64.msi`. Same result as Option A, but
registered as a standard Windows Installer package.

### Option C — Portable ZIP

1. Extract `CodeCodex-0.1.20-x64.zip` anywhere.
2. Run `Install-CodeCodex.exe` from the extracted folder.

## Uninstall

You do **not** need to open Windows Settings. Any of these work:

- Run `Uninstall-CodeCodex.exe` from
  `%LOCALAPPDATA%\Programs\Code-Codex`, **or**
- If you used the MSI: uninstall from **Settings → Apps** as usual, **or**
- Open the installed folder and run the uninstaller directly.

Uninstalling restores your original Codex desktop shortcut, removes all
Code-Codex files, and clears the Apps & Features entry. Your Codex
installation is left untouched.

> The uninstaller `.exe` is a thin wrapper that runs the
> `Uninstall-CodeCodex.ps1` script sitting next to it. Keep them
> together — do not copy the `.exe` somewhere else on its own.

## Build it yourself instead

See the repository [README](../README.md) build section. In short:

```bash
# 1. Frontend bundle
cd packages/explorer-ui && npm ci && npm run build

# 2. Rust binary
cargo build --release --bin code-codex

# 3. Package installers (Windows, PowerShell)
powershell -File scripts/package.ps1 -Version 0.1.20
```

Output lands in `artifacts/`.

## Verify downloads (optional)

SHA-256 for the 0.1.20 build:

```
CodeCodex-0.1.20-x64-setup.exe
  df159559ad24fd1c36aa1911367276c65aeb84c5aa56383283a11aaca0a58695
CodeCodex-0.1.20-x64.msi
  7c9fce9640481faecd59bc1e96029249ec864175d39789acc53bdeebcf7b1d5a
CodeCodex-0.1.20-x64.zip
  5b9b93a0d5dda676b5407bc881a0ccad2da2b319e737ebba15fac1133f454daf
```

Check on Windows with:

```powershell
Get-FileHash .\CodeCodex-0.1.20-x64-setup.exe -Algorithm SHA256
```
