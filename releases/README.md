# Releases

This folder contains ready-made downloadable packages.

Runtime requirement: Windows 10 version 2004 (build 19041) or newer, x64,
with the official stable Codex/ChatGPT Desktop app installed.

## v0.1.61

- `CodeCodex-0.1.61-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.61-x64.msi`: MSI installer.
- `CodeCodex-0.1.61-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps setup and uninstall progress and result windows centered.
- Reasserts final success and error dialog activation after display so they stay above other applications without moving toward the screen edge.

## v0.1.60

- `CodeCodex-0.1.60-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.60-x64.msi`: MSI installer.
- `CodeCodex-0.1.60-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Restores centered placement for setup and uninstall progress and result windows.
- Uses a topmost modal owner so final success and error dialogs open above other applications and receive foreground focus.

## v0.1.59

- `CodeCodex-0.1.59-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.59-x64.msi`: MSI installer.
- `CodeCodex-0.1.59-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Places setup and uninstall progress, completion, and error windows at the top center of the active monitor.
- Keeps those windows topmost and brings them to the foreground on Windows 10 and Windows 11.

## v0.1.58

- `CodeCodex-0.1.58-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.58-x64.msi`: MSI installer.
- `CodeCodex-0.1.58-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps setup and uninstall progress, completion, and error windows above ordinary application windows.
- Shows uninstall progress through the final MSI or installed-file removal stage instead of ending after preparation.

## v0.1.57

- `CodeCodex-0.1.57-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.57-x64.msi`: MSI installer.
- `CodeCodex-0.1.57-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Codex's native conversation title hidden beneath the preview tab strip while preserving its right-side window actions.
- Restores Electron's full DWM client frame when Transparent Background is disabled, preventing black shell regions.

## v0.1.56

- `CodeCodex-0.1.56-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.56-x64.msi`: MSI installer.
- `CodeCodex-0.1.56-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Hides the conversation surface while a file preview is active, including when Transparent Background is enabled.
- Restores the conversation surface and its original state when returning to Conversation or closing the final preview tab.

## v0.1.55

- `CodeCodex-0.1.55-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.55-x64.msi`: MSI installer.
- `CodeCodex-0.1.55-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Transparent Background visible in restored Codex windows by removing Electron's extended DWM client frame on every health pass.
- Preserves the non-layered, input-active Codex window while allowing Chromium's transparent pixels to reach the desktop compositor.
- Retains the restored-window fix across resize, maximize, and restore transitions.

## v0.1.54

- `CodeCodex-0.1.54-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.54-x64.msi`: MSI installer.
- `CodeCodex-0.1.54-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Transparent Background active in both restored and maximized Codex windows by disabling the Windows 11 rounded-corner compositor path while the plugin is enabled.
- Restores the exact original DWM corner preference together with the original accent and backdrop when transparency is disabled or Code-Codex exits.
- Keeps the complete Codex window input-active; transparent pixels do not pass input through to applications behind Codex.

## v0.1.53

- `CodeCodex-0.1.53-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.53-x64.msi`: MSI installer.
- `CodeCodex-0.1.53-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Uses a transparent Windows compositor surface instead of layered color-key pixels, revealing the desktop and applications behind Codex without click-through input.
- Keeps the verified main Codex window non-layered and input-active across its complete rectangular area.
- Serializes transparency revalidation with enable/disable actions and clears the remaining Codex background fade layers.
- Restores the original DWM backdrop and disables the temporary compositor accent when transparency is turned off or Code-Codex exits.

## v0.1.52

- `CodeCodex-0.1.52-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.52-x64.msi`: MSI installer.
- `CodeCodex-0.1.52-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Starts Codex without DirectComposition so Windows color-key transparency uses a redirected surface instead of displaying the key color as black.
- Selects only the verified main Codex app window and rejects the avatar overlay or an incompatible no-redirection surface.
- Verifies the native color key before applying transparent CSS and fails without changing the Codex background when verification does not pass.

## v0.1.51

- `CodeCodex-0.1.51-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.51-x64.msi`: MSI installer.
- `CodeCodex-0.1.51-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Replaces whole-window fading with binary color-key transparency, leaving non-background text, icons, controls, and preview content fully opaque.
- Restores the exact original Codex layered-window state when Transparent Background is disabled or Code-Codex exits.

## v0.1.50

- `CodeCodex-0.1.50-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.50-x64.msi`: MSI installer.
- `CodeCodex-0.1.50-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Removes the fixed Codex package-version allowlist so future versions can proceed through runtime compatibility checks.
- Retains verified process ownership, CDP protocol validation, and live DOM qualification before Code-Codex is injected.

## v0.1.49

- `CodeCodex-0.1.49-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.49-x64.msi`: MSI installer.
- `CodeCodex-0.1.49-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an optional Transparent Background appearance plugin to Preview Market.
- Applies reversible whole-window translucency only to the verified Codex process so applications and the desktop behind Codex remain visible.
- Restores the original opaque appearance when the plugin is disabled or the Code-Codex bridge exits.

## v0.1.48

- `CodeCodex-0.1.48-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.48-x64.msi`: MSI installer.
- `CodeCodex-0.1.48-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds one independently enabled Diagram Preview extension for `.drawio` and `.plantuml` files.
- Renders Draw.io shapes and common PlantUML activity syntax locally as bounded SVG without uploading source code.
- Keeps versioned raw edit mode available and rejects external resources, unsafe XML, and truncated diagrams.

## v0.1.47

- `CodeCodex-0.1.47-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.47-x64.msi`: MSI installer.
- `CodeCodex-0.1.47-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled CSV Preview extension for `.csv` files.
- Renders bounded comma-delimited data in an accessible table with sticky row and column headers.
- Preserves quoted commas, embedded line breaks, leading zeros, and formula-like values as literal text; raw edit mode remains available.

## v0.1.46

- `CodeCodex-0.1.46-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.46-x64.msi`: MSI installer.
- `CodeCodex-0.1.46-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled, local Jupyter Notebook Preview extension for `.ipynb` files.
- Renders Markdown and syntax-highlighted code cells with saved outputs without executing notebook code.
- Loads notebooks through bounded, versioned native chunks and applies read-only rendering limits.

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
./scripts/package.ps1 -Version 0.1.61
```
