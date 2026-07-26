[CmdletBinding()]
param(
    [string]$Version = "0.1.20"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Artifacts = Join-Path $RepoRoot "artifacts"
$Stage = Join-Path $Artifacts "CodeCodex-$Version-x64"
$ExpectedStageRoot = [IO.Path]::GetFullPath($Artifacts) + [IO.Path]::DirectorySeparatorChar

$cargoManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "Cargo.toml") -Raw -Encoding UTF8
if ($cargoManifest -notmatch '(?ms)^\[workspace\.package\]\s+.*?^version\s*=\s*"([^"]+)"') {
    throw "Unable to read the workspace version from Cargo.toml"
}
$cargoVersion = $Matches[1]
$uiManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "packages\explorer-ui\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$demoManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "demo-video\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Version -ne $cargoVersion -or
    $Version -ne [string]$uiManifest.version -or
    $Version -ne [string]$demoManifest.version) {
    throw "Release version $Version does not match Cargo ($cargoVersion), UI ($($uiManifest.version)), and demo ($($demoManifest.version)) manifests."
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
& node (Join-Path $PSScriptRoot "generate-third-party.mjs") $thirdPartyNotices $thirdPartyLicenses
if ($LASTEXITCODE -ne 0) { throw "Third-party notice generation failed" }
$demoVideoName = "CodeCodex-0.1.0-demo.mp4"
$demoVideoSource = Join-Path $RepoRoot "docs\demo\$demoVideoName"
$demoVideo = Join-Path $Artifacts $demoVideoName
if (-not (Test-Path -LiteralPath $demoVideoSource -PathType Leaf)) {
    throw "The release demo video is missing: $demoVideoSource"
}
Copy-Item -LiteralPath $demoVideoSource -Destination $demoVideo -Force

$binary = Join-Path $RepoRoot "target\release\code-codex.exe"
$guiBinary = Join-Path $RepoRoot "target\release\code-codex-launcher.exe"
$shimBinary = Join-Path $RepoRoot "target\release\code-codex-shim.exe"
$shortcutBinary = Join-Path $RepoRoot "target\release\code-codex-shortcut.exe"
$setupBinary = Join-Path $RepoRoot "target\release\code-codex-setup.exe"
$uninstallBinary = Join-Path $RepoRoot "target\release\code-codex-uninstall.exe"
foreach ($expectedBinary in @(
    $binary,
    $guiBinary,
    $shimBinary,
    $shortcutBinary,
    $setupBinary,
    $uninstallBinary
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
Copy-Item -LiteralPath $setupBinary -Destination (Join-Path $StageFullPath "Install-CodeCodex.exe")
Copy-Item -LiteralPath (Join-Path $RepoRoot "README.md") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "LICENSE") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "SECURITY.md") -Destination $StageFullPath
Copy-Item -LiteralPath (Join-Path $RepoRoot "docs") -Destination $StageFullPath -Recurse
Copy-Item -LiteralPath $thirdPartyNotices -Destination $StageFullPath
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
    -ThirdPartyPath $thirdPartyNotices `
    -ThirdPartyLicensesPath $thirdPartyLicenses `
    -SbomPath (Join-Path $Artifacts "sbom.spdx.json")

$hashLines = @(
    $zip,
    $setup,
    $msi,
    (Join-Path $Artifacts "sbom.spdx.json"),
    $thirdPartyNotices,
    $thirdPartyLicenses,
    $demoVideo
) | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
    "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), (Split-Path -Leaf $_)
}
$hashLines | Set-Content -LiteralPath (Join-Path $Artifacts "SHA256SUMS.txt") -Encoding ascii

Write-Host "Created $zip"
Write-Host "Created $setup"
Write-Host "Created $msi"
$hashLines | ForEach-Object { Write-Host $_ }
