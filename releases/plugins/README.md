# Code-Codex plugins

Three categories: appearance, file-preview and developer-tools. One directory per plugin within its category, using the stable plugin ID. Each contains its main JavaScript, manifest, notices and original media. The startup player is downloaded too; a tiny core cache dispatcher loads its verified bytes before full UI preparation, with no network request during startup.

GitHub Release assets use unique flat asset names; release-assets.json maps those names to this local directory tree. Download and offline import follow the embedded catalog. The core installer excludes this directory.
