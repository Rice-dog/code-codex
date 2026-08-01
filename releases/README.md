# Releases

This folder contains ready-made downloadable packages.

Runtime requirement: Windows 10 version 2004 (build 19041) or newer, x64,
with the official stable Codex/ChatGPT Desktop app installed.

## v0.1.33

- `CodeCodex-0.1.33-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.33-x64.msi`: MSI installer.
- `CodeCodex-0.1.33-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- `Uninstall-CodeCodex.exe`: standalone uninstaller for an existing install.
- `SHA256SUMS.txt`: SHA-256 checksums for the downloadable files.

If official Codex/ChatGPT Desktop is installed, the installer checks desktop
`Codex` first, then desktop `ChatGPT`. It creates a managed `Code-Codex`
desktop shortcut only when neither official shortcut exists, and removes that
managed shortcut on uninstall.

The same files can be regenerated from source with:

```powershell
./scripts/package.ps1 -Version 0.1.33
```
