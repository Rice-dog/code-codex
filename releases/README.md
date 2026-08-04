# Releases

This folder contains ready-made downloadable packages.

Runtime requirement: Windows 10 version 2004 (build 19041) or newer, x64,
with the official stable Codex/ChatGPT Desktop app installed.

## v0.1.45

- `CodeCodex-0.1.45-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.45-x64.msi`: MSI installer.
- `CodeCodex-0.1.45-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Splits automatically overflowing DOCX paragraphs and tables into page-sized preview cards when the source file has no cached Word page-break markers.
- Preserves same-size next-page section transitions while retaining dotted leaders and right-aligned cached page numbers.

## v0.1.44

- `CodeCodex-0.1.44-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.44-x64.msi`: MSI installer.
- `CodeCodex-0.1.44-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Restores dotted leaders and right-aligned cached page numbers in DOCX contents and illustration lists.
- Honors direct page-before properties in the preview copy so sections such as illustration lists begin on a new page without modifying the source document.

## v0.1.43

- `CodeCodex-0.1.43-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.43-x64.msi`: MSI installer.
- `CodeCodex-0.1.43-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Improves legacy PPT fidelity through local, read-only Microsoft PowerPoint rendering when available, with the embedded renderer retained as a fallback.

## v0.1.42

- `CodeCodex-0.1.42-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.42-x64.msi`: MSI installer.
- `CodeCodex-0.1.42-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Improves DOCX layout fidelity and adds local, read-only legacy PPT preview support.

## v0.1.41

- `CodeCodex-0.1.41-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.41-x64.msi`: MSI installer.
- `CodeCodex-0.1.41-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled, local Office Preview extension for DOCX, XLSX, and PPTX files.

## v0.1.40

- `CodeCodex-0.1.40-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.40-x64.msi`: MSI installer.
- `CodeCodex-0.1.40-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds independently enabled PDF Preview and Audio Preview extensions to Preview Market.

## v0.1.39

- `CodeCodex-0.1.39-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.39-x64.msi`: MSI installer.
- `CodeCodex-0.1.39-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Removes plugin description text from Preview Market cards while preserving format tags.

## v0.1.38

- `CodeCodex-0.1.38-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.38-x64.msi`: MSI installer.
- `CodeCodex-0.1.38-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds independently enabled Image Preview and Video Preview extensions to Preview Market.
- Loads supported media through bounded, versioned native chunks and releases temporary Blob URLs when previews close.
- Supports PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, MP4, WebM, OGV, MOV, and M4V previews.

## v0.1.37

- `CodeCodex-0.1.37-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.37-x64.msi`: MSI installer.
- `CodeCodex-0.1.37-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds rendered, directly editable Markdown in Edit mode when Markdown Preview is enabled.
- Saves visual edits back as Markdown source and preserves the visible scroll position.
- Preserves YAML front matter, HTML comments, table pipes/line breaks, and editor focus during saves.

## v0.1.36

- `CodeCodex-0.1.36-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.36-x64.msi`: MSI installer.
- `CodeCodex-0.1.36-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Preserves the visible code position and caret when entering edit mode.
- Keeps Markdown rendered in read-only mode and raw in edit mode.

## v0.1.35

- `CodeCodex-0.1.35-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.35-x64.msi`: MSI installer.
- `CodeCodex-0.1.35-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Simplifies the Markdown preview card text and file-type tags.

## v0.1.34

- `CodeCodex-0.1.34-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.34-x64.msi`: MSI installer.
- `CodeCodex-0.1.34-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds the attached Preview Market popover and bundled Markdown previewer.

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
./scripts/package.ps1 -Version 0.1.45
```
