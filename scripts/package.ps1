[CmdletBinding()]
param(
    [string]$Version = "0.4.4",
    [string]$WixPath
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Artifacts = Join-Path $RepoRoot "artifacts"
$Stage = Join-Path $Artifacts "CodeCodex-$Version-x64"
$ExpectedStageRoot = [IO.Path]::GetFullPath($Artifacts) + [IO.Path]::DirectorySeparatorChar
$ReleaseRoot = Join-Path $RepoRoot "releases"

$cargoManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "Cargo.toml") -Raw -Encoding UTF8
if ($cargoManifest -notmatch '(?ms)^\[workspace\.package\]\s+.*?^version\s*=\s*"([^"]+)"') {
    throw "Unable to read the workspace version from Cargo.toml"
}
$cargoVersion = $Matches[1]
$uiManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "packages\explorer-ui\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Version -ne $cargoVersion -or $Version -ne [string]$uiManifest.version) {
    throw "Release version $Version does not match Cargo ($cargoVersion) and UI ($($uiManifest.version)) manifests."
}

& (Join-Path $PSScriptRoot "build.ps1") -Configuration Release

$StageFullPath = [IO.Path]::GetFullPath($Stage)
if (-not $StageFullPath.StartsWith($ExpectedStageRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe staging path: $StageFullPath"
}

if (Test-Path -LiteralPath $StageFullPath) {
    Remove-Item -LiteralPath $StageFullPath -Recurse -Force
}
New-Item -ItemType Directory -Path $StageFullPath -Force | Out-Null

& node (Join-Path $PSScriptRoot "generate-sbom.mjs") (Join-Path $Artifacts "sbom.spdx.json")
if ($LASTEXITCODE -ne 0) { throw "SBOM generation failed" }
& node (Join-Path $PSScriptRoot "verify-sbom.mjs") (Join-Path $Artifacts "sbom.spdx.json")
if ($LASTEXITCODE -ne 0) { throw "SBOM verification failed" }
$thirdPartyNotices = Join-Path $Artifacts "THIRD_PARTY.md"
$thirdPartyLicenses = Join-Path $Artifacts "THIRD_PARTY_LICENSES.txt"
$visualEffectNoticesEn = Join-Path $RepoRoot "THIRD_PARTY_NOTICES_EN.md"
$visualEffectNoticesZh = Join-Path $RepoRoot "THIRD_PARTY_NOTICES_ZH_CN.md"
& node (Join-Path $PSScriptRoot "generate-third-party.mjs") $thirdPartyNotices $thirdPartyLicenses
if ($LASTEXITCODE -ne 0) { throw "Third-party notice generation failed" }
$binary = Join-Path $RepoRoot "target\release\code-codex.exe"
$guiBinary = Join-Path $RepoRoot "target\release\code-codex-launcher.exe"
$shimBinary = Join-Path $RepoRoot "target\release\code-codex-shim.exe"
$shortcutBinary = Join-Path $RepoRoot "target\release\code-codex-shortcut.exe"
$setupBinary = Join-Path $RepoRoot "target\release\code-codex-setup.exe"
$uninstallBinary = Join-Path $RepoRoot "target\release\code-codex-uninstall.exe"
$installProgram = Join-Path $RepoRoot "target\release\Install-CodeCodex.exe"
$uninstallProgram = Join-Path $RepoRoot "target\release\Uninstall-CodeCodex.exe"
foreach ($expectedBinary in @(
    $binary,
    $guiBinary,
    $shimBinary,
    $shortcutBinary,
    $setupBinary,
    $uninstallBinary,
    $installProgram,
    $uninstallProgram
)) {
    if (-not (Test-Path -LiteralPath $expectedBinary -PathType Leaf)) {
        throw "Expected release binary not found: $expectedBinary"
    }
}

Copy-Item -LiteralPath $binary -Destination $StageFullPath
Copy-Item -LiteralPath $guiBinary -Destination $StageFullPath
Copy-Item -LiteralPath $shimBinary -Destination $StageFullPath
Copy-Item -LiteralPath $shortcutBinary -Destination $StageFullPath
Copy-Item -LiteralPath $uninstallBinary -Destination $StageFullPath
Copy-Item -LiteralPath $installProgram -Destination $StageFullPath
Copy-Item -LiteralPath $uninstallProgram -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "crates\launcher\resources\code-codex.png") `
    -Destination (Join-Path $StageFullPath "CodeCodex.Brand.png")
Copy-Item -LiteralPath (Join-Path $RepoRoot "README.md") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "README.en.md") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "LICENSE") -Destination $StageFullPath
Copy-Item -LiteralPath $visualEffectNoticesEn -Destination $StageFullPath
Copy-Item -LiteralPath $visualEffectNoticesZh -Destination $StageFullPath
# Documentation screenshots remain in GitHub; do not include them in installers.
Copy-Item -LiteralPath $thirdPartyLicenses -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $Artifacts "sbom.spdx.json") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "installer\Install-CodeCodex.ps1") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "installer\Uninstall-CodeCodex.ps1") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "installer\Finalize-Uninstall.ps1") -Destination $StageFullPath

$zip = Join-Path $Artifacts "CodeCodex-$Version-x64.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath $StageFullPath -DestinationPath $zip -CompressionLevel Optimal

$setup = Join-Path $Artifacts "CodeCodex-$Version-x64-setup.exe"
if (Test-Path -LiteralPath $setup) { Remove-Item -LiteralPath $setup -Force }
$setupStub = [IO.File]::ReadAllBytes($setupBinary)
$setupPayload = [IO.File]::ReadAllBytes($zip)
$setupStream = [IO.File]::Open($setup, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
    $setupStream.Write($setupStub, 0, $setupStub.Length)
    $setupStream.Write($setupPayload, 0, $setupPayload.Length)
    $footerWriter = [IO.BinaryWriter]::new($setupStream, [Text.Encoding]::ASCII, $true)
    try {
        $footerWriter.Write([Text.Encoding]::ASCII.GetBytes("CLEXZIP1"))
        $footerWriter.Write([uint64]$setupStub.LongLength)
        $footerWriter.Write([uint64]$setupPayload.LongLength)
        $footerWriter.Flush()
    }
    finally {
        $footerWriter.Dispose()
    }
}
finally {
    $setupStream.Dispose()
}

$msi = Join-Path $Artifacts "CodeCodex-$Version-x64.msi"
& (Join-Path $PSScriptRoot "build-msi.ps1") `
    -Version $Version `
    -BinaryPath $binary `
    -GuiBinaryPath $guiBinary `
    -ShimBinaryPath $shimBinary `
    -ShortcutBinaryPath $shortcutBinary `
    -UninstallBinaryPath $uninstallBinary `
    -OutputPath $msi `
    -ThirdPartyLicensesPath $thirdPartyLicenses `
    -VisualEffectNoticesEnPath $visualEffectNoticesEn `
    -VisualEffectNoticesZhPath $visualEffectNoticesZh `
    -SbomPath (Join-Path $Artifacts "sbom.spdx.json") `
    -WixPath $WixPath

$downloadUninstaller = Join-Path $Artifacts "Uninstall-CodeCodex.exe"
Copy-Item -LiteralPath $uninstallProgram -Destination $downloadUninstaller -Force

# Plugins are organized by ID; this directory never enters the core installer.
$pluginStage = Join-Path $Artifacts "plugin-release-$Version"
$pluginStageFull = [IO.Path]::GetFullPath($pluginStage)
if (-not $pluginStageFull.StartsWith($ExpectedStageRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe plugin staging path" }
if (Test-Path -LiteralPath $pluginStageFull) { Remove-Item -LiteralPath $pluginStageFull -Recurse -Force }
& node (Join-Path $PSScriptRoot "stage-plugin-release.mjs") $pluginStageFull
if ($LASTEXITCODE -ne 0) { throw "Plugin release staging failed" }
$pluginInventoryJson = Get-Content (Join-Path $Artifacts 'plugin-release-inventory.json') -Raw -Encoding UTF8 | ConvertFrom-Json
# Windows PowerShell 5.1 does not enumerate ConvertFrom-Json's root array.
# Materialize entries explicitly so the inventory/hash list never contains a nested array.
$pluginInventory = @(foreach ($pluginAsset in $pluginInventoryJson) { $pluginAsset })

New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null
$history = Join-Path $Artifacts ("plugin-release-history/" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $history -Force | Out-Null
$releaseFull = [IO.Path]::GetFullPath($ReleaseRoot) + [IO.Path]::DirectorySeparatorChar
$historyFull = [IO.Path]::GetFullPath($history)
if (-not $historyFull.StartsWith($ExpectedStageRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe history path' }
$previousPlugins = Join-Path $ReleaseRoot 'plugins'
if (Test-Path -LiteralPath $previousPlugins) {
    $previousFull = [IO.Path]::GetFullPath($previousPlugins)
    if (-not $previousFull.StartsWith($releaseFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe previous plugin path' }
    Move-Item -LiteralPath $previousFull -Destination (Join-Path $history 'plugins')
}
foreach ($legacy in @(Get-ChildItem -LiteralPath $ReleaseRoot -File | Where-Object { $_.Name -match '^CodeCodex-background-.*\.(js|json)$' })) {
    if (-not $legacy.FullName.StartsWith($releaseFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe legacy asset path' }
    Move-Item -LiteralPath $legacy.FullName -Destination (Join-Path $history $legacy.Name)
}
Copy-Item -LiteralPath $pluginStageFull -Destination (Join-Path $ReleaseRoot 'plugins') -Recurse
foreach ($releaseFile in @($setup,$msi,$zip,$downloadUninstaller)) { Copy-Item -LiteralPath $releaseFile -Destination $ReleaseRoot -Force }
$assetInventory = @($setup,$msi,$zip,$downloadUninstaller) | ForEach-Object {
    $asset = Get-Item -LiteralPath $_
    [pscustomobject]@{ assetName=$asset.Name; path=$asset.Name; size=$asset.Length; sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$assetInventory = @($assetInventory) + $pluginInventory
$assetInventory | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReleaseRoot 'release-assets.json') -Encoding UTF8
$hashLines = $assetInventory | ForEach-Object { "{0}  {1}" -f $_.sha256,$_.path }
$hashLines | Set-Content -LiteralPath (Join-Path $ReleaseRoot 'SHA256SUMS.txt') -Encoding ascii
Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'SHA256SUMS.txt') -Destination (Join-Path $Artifacts 'SHA256SUMS.txt') -Force

$currentPackageNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($currentPackage in @($setup, $msi, $zip)) {
    [void]$currentPackageNames.Add((Split-Path -Leaf $currentPackage))
}
foreach ($packageRoot in @($Artifacts, $ReleaseRoot)) {
    Get-ChildItem -LiteralPath $packageRoot -File | Where-Object {
        $_.Name -match '^CodeCodex-.+-x64(?:-setup\.exe|\.msi|\.zip)$' -and
        -not $currentPackageNames.Contains($_.Name)
    } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }
}

Get-ChildItem -LiteralPath $Artifacts -Directory | Where-Object {
    $_.Name -match '^CodeCodex-.+-x64$'
} | ForEach-Object {
    $stagingDirectory = [IO.Path]::GetFullPath($_.FullName)
    if (-not $stagingDirectory.StartsWith($ExpectedStageRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe staging directory: $stagingDirectory"
    }
    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
}

Write-Host "Created $zip"
Write-Host "Created $setup"
Write-Host "Created $msi"
Write-Host "Created $downloadUninstaller"
$hashLines | ForEach-Object { Write-Host $_ }
