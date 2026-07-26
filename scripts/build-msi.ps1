[CmdletBinding()]
param(
    [string]$Version = "0.1.20",
    [string]$BinaryPath,
    [string]$GuiBinaryPath,
    [string]$ShimBinaryPath,
    [string]$ShortcutBinaryPath,
    [string]$UninstallBinaryPath,
    [string]$OutputPath,
    [string]$ThirdPartyPath,
    [string]$ThirdPartyLicensesPath,
    [string]$SbomPath,
    [string]$WixPath
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$WixVersion = "5.0.2"
. (Join-Path $PSScriptRoot "msbuild-tools.ps1")

function Get-DeterministicComponentGuid([string]$Identity) {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($Identity))
    }
    finally {
        $sha256.Dispose()
    }
    $bytes = [byte[]]::new(16)
    [Array]::Copy($hash, $bytes, $bytes.Length)
    # Mark the value as a name-derived UUID while retaining deterministic bytes.
    $bytes[7] = ($bytes[7] -band 0x0f) -bor 0x50
    $bytes[8] = ($bytes[8] -band 0x3f) -bor 0x80
    return ([Guid]::new($bytes)).ToString("B").ToUpperInvariant()
}

if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw "MSI version must contain exactly three numeric parts (for example, 1.2.3): $Version"
}

$versionParts = $Version.Split('.') | ForEach-Object { [uint64]$_ }
if ($versionParts[0] -gt 255 -or $versionParts[1] -gt 255 -or $versionParts[2] -gt 65535) {
    throw "MSI version is outside the Windows Installer range 0-255.0-255.0-65535: $Version"
}

if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
    $BinaryPath = Join-Path $RepoRoot "target\release\code-codex.exe"
}
if ([string]::IsNullOrWhiteSpace($GuiBinaryPath)) {
    $GuiBinaryPath = Join-Path $RepoRoot "target\release\code-codex-launcher.exe"
}
if ([string]::IsNullOrWhiteSpace($ShimBinaryPath)) {
    $ShimBinaryPath = Join-Path $RepoRoot "target\release\code-codex-shim.exe"
}
if ([string]::IsNullOrWhiteSpace($ShortcutBinaryPath)) {
    $ShortcutBinaryPath = Join-Path $RepoRoot "target\release\code-codex-shortcut.exe"
}
if ([string]::IsNullOrWhiteSpace($UninstallBinaryPath)) {
    $UninstallBinaryPath = Join-Path $RepoRoot "target\release\code-codex-uninstall.exe"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $RepoRoot "artifacts\CodeCodex-$Version-x64.msi"
}

$BinaryPath = [IO.Path]::GetFullPath($BinaryPath)
$GuiBinaryPath = [IO.Path]::GetFullPath($GuiBinaryPath)
$ShimBinaryPath = [IO.Path]::GetFullPath($ShimBinaryPath)
$ShortcutBinaryPath = [IO.Path]::GetFullPath($ShortcutBinaryPath)
$UninstallBinaryPath = [IO.Path]::GetFullPath($UninstallBinaryPath)
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$readmePath = Join-Path $RepoRoot "README.md"
$licensePath = Join-Path $RepoRoot "LICENSE"
$securityPath = Join-Path $RepoRoot "SECURITY.md"
$docsPath = Join-Path $RepoRoot "docs"
$demoVideoName = "CodeCodex-0.1.0-demo.mp4"
$demoVideoPath = Join-Path $docsPath "demo\$demoVideoName"
if ([string]::IsNullOrWhiteSpace($ThirdPartyPath)) {
    $ThirdPartyPath = Join-Path $RepoRoot "THIRD_PARTY.md"
}
if ([string]::IsNullOrWhiteSpace($ThirdPartyLicensesPath)) {
    $ThirdPartyLicensesPath = Join-Path $RepoRoot "THIRD_PARTY_LICENSES.txt"
}
if ([string]::IsNullOrWhiteSpace($SbomPath)) {
    $SbomPath = Join-Path $RepoRoot "artifacts\sbom.spdx.json"
}
$ThirdPartyPath = [IO.Path]::GetFullPath($ThirdPartyPath)
$ThirdPartyLicensesPath = [IO.Path]::GetFullPath($ThirdPartyLicensesPath)
$SbomPath = [IO.Path]::GetFullPath($SbomPath)
$sourcePath = Join-Path $RepoRoot "installer\Package.wxs"
$settingsCleanupProject = Join-Path $RepoRoot "installer\SettingsCleanupCA.vcxproj"
$settingsCleanupSource = Join-Path $RepoRoot "installer\SettingsCleanupCA.cpp"
$uninstallScriptPath = Join-Path $RepoRoot "installer\Uninstall-CodeCodex.ps1"
$finalizerScriptPath = Join-Path $RepoRoot "installer\Finalize-Uninstall.ps1"

foreach ($requiredPath in @(
    $BinaryPath,
    $GuiBinaryPath,
    $ShimBinaryPath,
    $ShortcutBinaryPath,
    $UninstallBinaryPath,
    $readmePath,
    $licensePath,
    $securityPath,
    (Join-Path $docsPath "architecture.md"),
    (Join-Path $docsPath "compatibility.md"),
    (Join-Path $docsPath "prior-art.md"),
    (Join-Path $docsPath "protocol.md"),
    (Join-Path $docsPath "testing.md"),
    (Join-Path $docsPath "threat-model.md"),
    (Join-Path $docsPath "demo\README.md"),
    $demoVideoPath,
    $ThirdPartyPath,
    $ThirdPartyLicensesPath,
    $SbomPath,
    $sourcePath,
    $settingsCleanupProject,
    $settingsCleanupSource,
    $uninstallScriptPath,
    $finalizerScriptPath
)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required MSI input was not found: $requiredPath"
    }
}

if ([string]::IsNullOrWhiteSpace($WixPath)) {
    $toolRoot = Join-Path $env:TEMP "CodeCodex-Wix\$WixVersion"
    $WixPath = Join-Path $toolRoot "wix.exe"
    if (-not (Test-Path -LiteralPath $WixPath -PathType Leaf)) {
        $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
        if (-not $dotnet) {
            throw "WiX was not supplied and the .NET SDK is unavailable. Install .NET or pass -WixPath."
        }

        New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
        & $dotnet.Source tool install wix --tool-path $toolRoot --version $WixVersion
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to restore the workspace's pinned WiX Toolset $WixVersion."
        }
    }
}

$WixPath = [IO.Path]::GetFullPath($WixPath)
if (-not (Test-Path -LiteralPath $WixPath -PathType Leaf)) {
    throw "WiX executable was not found: $WixPath"
}

$msbuild = Get-CodexMsBuildPath
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempPrefix = $tempBase.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
) + [IO.Path]::DirectorySeparatorChar
$customActionBuildRoot = Join-Path $tempBase (
    "CodeCodex-MsiCA-" + [Guid]::NewGuid().ToString("N")
)
$customActionBuildRoot = [IO.Path]::GetFullPath($customActionBuildRoot)
if (-not $customActionBuildRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe MSI custom-action build path: $customActionBuildRoot"
}
New-Item -ItemType Directory -Path $customActionBuildRoot | Out-Null
$customActionBuildItem = Get-Item -LiteralPath $customActionBuildRoot -Force
if (-not $customActionBuildItem.PSIsContainer -or
    ($customActionBuildItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "MSI custom-action build path must be a regular directory: $customActionBuildRoot"
}

try {
    $currentVersionPath = Join-Path $customActionBuildRoot "current-version"
    $installTypePath = Join-Path $customActionBuildRoot "install-type"
    $commandLineComponentGuid = Get-DeterministicComponentGuid "CodeCodex|CommandLinePayload|$Version"
    $runtimeLauncherComponentGuid = Get-DeterministicComponentGuid "CodeCodex|RuntimeLauncherPayload|$Version"
    [IO.File]::WriteAllText($currentVersionPath, $Version + "`n", [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($installTypePath, "msi`n", [Text.UTF8Encoding]::new($false))

    $customActionIntermediate = Join-Path $customActionBuildRoot "obj"
    & $msbuild $settingsCleanupProject `
        /nologo `
        /m `
        /p:Configuration=Release `
        /p:Platform=x64 `
        /p:IgnoreWarnIntDirInTempDetected=true `
        "/p:OutDir=$customActionBuildRoot\" `
        "/p:IntDir=$customActionIntermediate\"
    if ($LASTEXITCODE -ne 0) {
        throw "MSI settings-cleanup custom-action build failed with exit code $LASTEXITCODE."
    }
    $settingsCleanupCAPath = Join-Path $customActionBuildRoot "SettingsCleanupCA.dll"
    $settingsCleanupCAItem = Get-Item -LiteralPath $settingsCleanupCAPath -Force -ErrorAction SilentlyContinue
    if ($null -eq $settingsCleanupCAItem -or
        $settingsCleanupCAItem.PSIsContainer -or
        ($settingsCleanupCAItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "MSI settings-cleanup custom action was not built as a regular file."
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $OutputPath) {
        Remove-Item -LiteralPath $OutputPath -Force
    }

    $arguments = @(
        "build",
        "--nologo",
        "-arch", "x64",
        "-d", "ProductVersion=$Version",
        "-d", "BinaryPath=$BinaryPath",
        "-d", "GuiBinaryPath=$GuiBinaryPath",
        "-d", "ShimBinaryPath=$ShimBinaryPath",
        "-d", "ShortcutBinaryPath=$ShortcutBinaryPath",
        "-d", "UninstallBinaryPath=$UninstallBinaryPath",
        "-d", "UninstallScriptPath=$uninstallScriptPath",
        "-d", "FinalizerScriptPath=$finalizerScriptPath",
        "-d", "CurrentVersionPath=$currentVersionPath",
        "-d", "InstallTypePath=$installTypePath",
        "-d", "CommandLineComponentGuid=$commandLineComponentGuid",
        "-d", "RuntimeLauncherComponentGuid=$runtimeLauncherComponentGuid",
        "-d", "ReadmePath=$readmePath",
        "-d", "LicensePath=$licensePath",
        "-d", "SecurityPath=$securityPath",
        "-d", "DocsPath=$docsPath",
        "-d", "DemoVideoPath=$demoVideoPath",
        "-d", "DemoVideoName=$demoVideoName",
        "-d", "ThirdPartyPath=$ThirdPartyPath",
        "-d", "ThirdPartyLicensesPath=$ThirdPartyLicensesPath",
        "-d", "SbomPath=$SbomPath",
        "-d", "SettingsCleanupCAPath=$settingsCleanupCAPath",
        "-pdbtype", "none",
        "-out", $OutputPath,
        $sourcePath
    )

    & $WixPath @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "WiX MSI build failed with exit code $LASTEXITCODE."
    }

    if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
        throw "WiX reported success but the MSI was not created: $OutputPath"
    }

    & $WixPath msi validate --nologo -sice ICE91 $OutputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Windows Installer validation failed with exit code $LASTEXITCODE."
    }
}
finally {
    $cleanupItem = Get-Item -LiteralPath $customActionBuildRoot -Force -ErrorAction SilentlyContinue
    if ($null -ne $cleanupItem -and
        $customActionBuildRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        if (($cleanupItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            [IO.Directory]::Delete($customActionBuildRoot, $false)
        }
        elseif ($cleanupItem.PSIsContainer) {
            Remove-Item -LiteralPath $customActionBuildRoot -Recurse -Force
        }
    }
}

Write-Host "Created $OutputPath"
