[CmdletBinding()]
param(
    [string]$Version = "0.1.48"
)

$ErrorActionPreference = "Stop"
$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceBinary = Join-Path $SourceRoot "code-codex.exe"
$SourceRuntimeLauncher = Join-Path $SourceRoot "code-codex-launcher.exe"
$SourceShim = Join-Path $SourceRoot "code-codex-shim.exe"
$SourceShortcutTool = Join-Path $SourceRoot "code-codex-shortcut.exe"
$SourceUninstallerExecutable = Join-Path $SourceRoot "code-codex-uninstall.exe"
$SourceUninstaller = Join-Path $SourceRoot "Uninstall-CodeCodex.ps1"
$SourceFinalizer = Join-Path $SourceRoot "Finalize-Uninstall.ps1"
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\Code-Codex"
$ProgramsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "Programs"))
$VersionsRoot = Join-Path $InstallRoot "versions"
$VersionRoot = Join-Path $VersionsRoot $Version

function Test-ReparsePoint([IO.FileSystemInfo]$Item) {
    return ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

function Get-ExistingItem([string]$Path) {
    return Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Assert-RegularFile([string]$Path, [string]$Description) {
    $item = Get-ExistingItem $Path
    if ($null -eq $item -or
        $item.PSIsContainer -or
        $item -isnot [IO.FileInfo] -or
        (Test-ReparsePoint $item)) {
        throw "$Description must be a regular file: $Path"
    }
    return $item
}

function Assert-SafeFileCopy([string]$Source, [string]$Destination) {
    [void](Assert-RegularFile $Source "Documentation source")

    $destinationDirectory = Split-Path -Parent $Destination
    $destinationDirectoryItem = Get-ExistingItem $destinationDirectory
    if ($null -ne $destinationDirectoryItem -and
        (-not $destinationDirectoryItem.PSIsContainer -or
            $destinationDirectoryItem -isnot [IO.DirectoryInfo] -or
            (Test-ReparsePoint $destinationDirectoryItem))) {
        throw "Documentation destination parent must be a regular directory: $destinationDirectory"
    }

    $destinationItem = Get-ExistingItem $Destination
    if ($null -ne $destinationItem -and
        ($destinationItem.PSIsContainer -or
            $destinationItem -isnot [IO.FileInfo] -or
            (Test-ReparsePoint $destinationItem))) {
        throw "Documentation destination must be a regular file: $Destination"
    }
}

function Assert-SafeDocumentTree([string]$Source, [string]$Destination) {
    $sourceItem = Get-ExistingItem $Source
    if ($null -eq $sourceItem -or
        -not $sourceItem.PSIsContainer -or
        $sourceItem -isnot [IO.DirectoryInfo] -or
        (Test-ReparsePoint $sourceItem)) {
        throw "Documentation source must be a regular directory: $Source"
    }

    $destinationItem = Get-ExistingItem $Destination
    if ($null -ne $destinationItem -and
        (-not $destinationItem.PSIsContainer -or
            $destinationItem -isnot [IO.DirectoryInfo] -or
            (Test-ReparsePoint $destinationItem))) {
        throw "Documentation destination must be a regular directory: $Destination"
    }

    foreach ($sourceChild in @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop)) {
        $destinationChild = Join-Path $Destination $sourceChild.Name
        if ($sourceChild.PSIsContainer) {
            Assert-SafeDocumentTree $sourceChild.FullName $destinationChild
        }
        else {
            Assert-SafeFileCopy $sourceChild.FullName $destinationChild
        }
    }
}

function Copy-AtomicFile([string]$Source, [string]$Destination) {
    [void](Assert-RegularFile $Source "Copy source")
    $destinationDirectory = Split-Path -Parent $Destination
    $destinationDirectoryItem = Get-ExistingItem $destinationDirectory
    if ($null -eq $destinationDirectoryItem) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        $destinationDirectoryItem = Get-ExistingItem $destinationDirectory
    }
    if ($null -eq $destinationDirectoryItem -or
        -not $destinationDirectoryItem.PSIsContainer -or
        $destinationDirectoryItem -isnot [IO.DirectoryInfo] -or
        (Test-ReparsePoint $destinationDirectoryItem)) {
        throw "Copy destination parent must be a regular directory: $destinationDirectory"
    }

    $destinationItem = Get-ExistingItem $Destination
    if ($null -ne $destinationItem -and
        ($destinationItem.PSIsContainer -or
            $destinationItem -isnot [IO.FileInfo] -or
            (Test-ReparsePoint $destinationItem))) {
        throw "Copy destination must be a regular file: $Destination"
    }

    $temporary = Join-Path $destinationDirectory (".{0}.{1}.tmp" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    $replacementBackup = Join-Path $destinationDirectory (".{0}.{1}.replace-backup" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    try {
        Copy-Item -LiteralPath $Source -Destination $temporary
        $destinationItem = Get-ExistingItem $Destination
        if ($null -ne $destinationItem -and
            ($destinationItem.PSIsContainer -or
                $destinationItem -isnot [IO.FileInfo] -or
                (Test-ReparsePoint $destinationItem))) {
            throw "Copy destination must remain a regular file: $Destination"
        }
        if ($null -ne $destinationItem) {
            [IO.File]::Replace($temporary, $Destination, $replacementBackup, $true)
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
        }
        else {
            [IO.File]::Move($temporary, $Destination)
        }
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
    }
}

function Copy-SafeDocumentTree([string]$Source, [string]$Destination) {
    Assert-SafeDocumentTree $Source $Destination

    $destinationItem = Get-ExistingItem $Destination
    if ($null -eq $destinationItem) {
        $destinationParent = Split-Path -Parent $Destination
        $destinationParentItem = Get-ExistingItem $destinationParent
        if ($null -eq $destinationParentItem -or
            -not $destinationParentItem.PSIsContainer -or
            $destinationParentItem -isnot [IO.DirectoryInfo] -or
            (Test-ReparsePoint $destinationParentItem)) {
            throw "Documentation destination parent must be a regular directory: $destinationParent"
        }
        New-Item -ItemType Directory -Path $Destination | Out-Null
        $destinationItem = Get-ExistingItem $Destination
    }
    if ($null -eq $destinationItem -or
        -not $destinationItem.PSIsContainer -or
        $destinationItem -isnot [IO.DirectoryInfo] -or
        (Test-ReparsePoint $destinationItem)) {
        throw "Documentation destination must be a regular directory: $Destination"
    }

    foreach ($sourceChild in @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop)) {
        $destinationChild = Join-Path $Destination $sourceChild.Name
        if ($sourceChild.PSIsContainer) {
            Copy-SafeDocumentTree $sourceChild.FullName $destinationChild
        }
        else {
            Assert-SafeFileCopy $sourceChild.FullName $destinationChild
            Copy-AtomicFile $sourceChild.FullName $destinationChild
        }
    }
}

function Write-AtomicText([string]$Destination, [string]$Content) {
    $directory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = Join-Path $directory (".{0}.{1}.tmp" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    $replacementBackup = Join-Path $directory (".{0}.{1}.replace-backup" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    try {
        [IO.File]::WriteAllText($temporary, $Content, [Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $Destination -PathType Leaf) {
            [IO.File]::Replace($temporary, $Destination, $replacementBackup, $true)
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
        }
        else {
            [IO.File]::Move($temporary, $Destination)
        }
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
    }
}

if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or $Version.Length -gt 32) {
    throw "Release version must be a bounded three-part numeric version: $Version"
}

$requiredPayload = @(
    $SourceBinary,
    $SourceRuntimeLauncher,
    $SourceShim,
    $SourceShortcutTool,
    $SourceUninstallerExecutable,
    $SourceUninstaller,
    $SourceFinalizer
)
foreach ($payload in $requiredPayload) {
    $item = Get-ExistingItem $payload
    if ($null -eq $item -or $item.PSIsContainer -or (Test-ReparsePoint $item)) {
        throw "Required payload must be a regular file next to this installer: $payload"
    }
}

$programsItem = Get-ExistingItem $ProgramsRoot
if ($null -ne $programsItem -and
    (-not $programsItem.PSIsContainer -or (Test-ReparsePoint $programsItem))) {
    throw "Refusing to install through a non-directory or reparse-point Programs path: $ProgramsRoot"
}
$existingInstall = Get-ExistingItem $InstallRoot
if ($null -ne $existingInstall -and
    (-not $existingInstall.PSIsContainer -or (Test-ReparsePoint $existingInstall))) {
    throw "Refusing to install into a non-directory or reparse-point path: $InstallRoot"
}

$documentCopies = @()
foreach ($document in @(
    "README.md",
    "README.zh-CN.md",
    "LICENSE",
    "THIRD_PARTY_LICENSES.txt",
    "sbom.spdx.json"
)) {
    $sourceDocument = Join-Path $SourceRoot $document
    if ($null -ne (Get-ExistingItem $sourceDocument)) {
        $destinationDocument = Join-Path $InstallRoot $document
        Assert-SafeFileCopy $sourceDocument $destinationDocument
        $documentCopies += [PSCustomObject]@{
            Source = $sourceDocument
            Destination = $destinationDocument
        }
    }
}
$sourceDocs = Join-Path $SourceRoot "docs"
$installedDocs = Join-Path $InstallRoot "docs"
$installDocumentation = $null -ne (Get-ExistingItem $sourceDocs)
if ($installDocumentation) {
    Assert-SafeDocumentTree $sourceDocs $installedDocs
}

$installFullPath = [IO.Path]::GetFullPath($InstallRoot)
$programsPrefix = $ProgramsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$versionFullPath = [IO.Path]::GetFullPath($VersionRoot)
$installPrefix = $installFullPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $installFullPath.StartsWith($programsPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    -not $versionFullPath.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to install outside the expected per-user Programs directory."
}

$installTypePath = Join-Path $InstallRoot "install-type"
$installTypeItem = Get-ExistingItem $installTypePath
if ($null -ne $installTypeItem) {
    if ($installTypeItem.PSIsContainer -or (Test-ReparsePoint $installTypeItem)) {
        throw "Refusing to read a non-file or reparse-point installation ownership marker: $installTypePath"
    }
    if ((Get-Content -LiteralPath $installTypePath -Raw -Encoding UTF8).Trim() -eq "msi") {
        throw "Code-Codex is owned by Windows Installer. Uninstall it through Windows Installed apps before using the standalone installer."
    }
}

$msiProductCodePattern = '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$'
$uninstallRegistryRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
$uninstallRegistryPattern = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
$existingMsiRegistration = $null
if (Test-Path -LiteralPath $uninstallRegistryRoot) {
    $existingMsiRegistration = Get-ItemProperty $uninstallRegistryPattern -ErrorAction Stop |
        Where-Object {
            $_.DisplayName -eq "Code-Codex" -and
            [string]$_.PSChildName -match $msiProductCodePattern -and
            [string]$_.WindowsInstaller -eq "1"
        } |
        Select-Object -First 1
}
if ($null -ne $existingMsiRegistration) {
    throw "Code-Codex is registered with Windows Installer. Uninstall it through Windows Installed apps before using the standalone installer."
}

& $SourceShortcutTool preflight --install-root $InstallRoot --version $Version
if ($LASTEXITCODE -ne 0) {
    throw "Stable Codex could not be validated for Code-Codex integration. No installation files were changed."
}

New-Item -ItemType Directory -Path $VersionsRoot -Force | Out-Null
$versionsItem = Get-Item -LiteralPath $VersionsRoot -Force
if (-not $versionsItem.PSIsContainer -or (Test-ReparsePoint $versionsItem)) {
    throw "The versions path must be a regular directory: $VersionsRoot"
}

if (Test-Path -LiteralPath $VersionRoot) {
    $versionItem = Get-Item -LiteralPath $VersionRoot -Force
    if (-not $versionItem.PSIsContainer -or (Test-ReparsePoint $versionItem)) {
        throw "The release path must be a regular directory: $VersionRoot"
    }
    foreach ($pair in @(
        @($SourceBinary, (Join-Path $VersionRoot "code-codex.exe")),
        @($SourceRuntimeLauncher, (Join-Path $VersionRoot "CodeCodex.exe"))
    )) {
        if (-not (Test-Path -LiteralPath $pair[1] -PathType Leaf) -or
            (Get-FileHash -LiteralPath $pair[0] -Algorithm SHA256).Hash -ne
                (Get-FileHash -LiteralPath $pair[1] -Algorithm SHA256).Hash) {
            throw "Version $Version is already installed with a different payload. Use a new release version."
        }
    }
}
else {
    $stagingVersion = Join-Path $VersionsRoot (".{0}.{1}.tmp" -f $Version, [Guid]::NewGuid().ToString("N"))
    try {
        New-Item -ItemType Directory -Path $stagingVersion | Out-Null
        Copy-Item -LiteralPath $SourceBinary -Destination (Join-Path $stagingVersion "code-codex.exe")
        Copy-Item -LiteralPath $SourceRuntimeLauncher -Destination (Join-Path $stagingVersion "CodeCodex.exe")
        [IO.Directory]::Move($stagingVersion, $VersionRoot)
    }
    finally {
        if (Test-Path -LiteralPath $stagingVersion) {
            Remove-Item -LiteralPath $stagingVersion -Recurse -Force
        }
    }
}

Copy-AtomicFile $SourceShim (Join-Path $InstallRoot "CodeCodex.exe")
Copy-AtomicFile $SourceShortcutTool (Join-Path $InstallRoot "CodeCodex.Shortcut.exe")
Copy-AtomicFile $SourceUninstallerExecutable (Join-Path $InstallRoot "Uninstall-CodeCodex.exe")
Copy-AtomicFile $SourceUninstaller (Join-Path $InstallRoot "Uninstall-CodeCodex.ps1")
Copy-AtomicFile $SourceFinalizer (Join-Path $InstallRoot "Finalize-Uninstall.ps1")

foreach ($documentCopy in $documentCopies) {
    Assert-SafeFileCopy $documentCopy.Source $documentCopy.Destination
    Copy-AtomicFile $documentCopy.Source $documentCopy.Destination
}
if ($installDocumentation) {
    Copy-SafeDocumentTree $sourceDocs $installedDocs
}

Write-AtomicText (Join-Path $InstallRoot "current-version") ($Version + "`n")
Write-AtomicText (Join-Path $InstallRoot "install-type") "portable`n"

# Remove the obsolete sign-in launch entry. The existing Codex or ChatGPT
# shortcut is now the single user-controlled entry point for both the official
# app and Code-Codex.
Remove-ItemProperty `
    -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
    -Name "CodeCodex" `
    -ErrorAction SilentlyContinue

$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCodex"
New-Item -Path $uninstallKey -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayName" -PropertyType String -Value "Code-Codex" -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -PropertyType String -Value $Version -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "Publisher" -PropertyType String -Value "Code-Codex contributors" -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "InstallLocation" -PropertyType String -Value $InstallRoot -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -PropertyType String -Value (Join-Path $InstallRoot "Uninstall-CodeCodex.exe") -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "UninstallString" -PropertyType String `
    -Value ('"{0}"' -f (Join-Path $InstallRoot "Uninstall-CodeCodex.exe")) -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "NoModify" -PropertyType DWord -Value 1 -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "NoRepair" -PropertyType DWord -Value 1 -Force | Out-Null

$installedShortcutTool = Join-Path $InstallRoot "CodeCodex.Shortcut.exe"
& $installedShortcutTool install --install-root $InstallRoot --version $Version
if ($LASTEXITCODE -ne 0) {
    throw "The Codex or ChatGPT desktop shortcut could not be redirected, or the Code-Codex shortcut could not be created (exit code $LASTEXITCODE)."
}

Write-Host "Installed Code-Codex $Version. The Codex, ChatGPT, or Code-Codex desktop shortcut now starts Code-Codex."
