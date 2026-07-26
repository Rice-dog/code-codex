[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$UiRoot = Join-Path $RepoRoot "packages\explorer-ui"
$DemoRoot = Join-Path $RepoRoot "demo-video"
$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$Cargo = if ($cargoCommand) { $cargoCommand.Source } else { Join-Path $HOME ".cargo\bin\cargo.exe" }

if (-not (Test-Path -LiteralPath $Cargo)) {
    throw "Cargo was not found. Reopen the terminal after installing Rustup."
}

Push-Location $RepoRoot
try {
    & (Join-Path $PSScriptRoot "test-installer.ps1")

    & npm --prefix $UiRoot ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    & npm --prefix $UiRoot run typecheck
    if ($LASTEXITCODE -ne 0) { throw "UI typecheck failed" }
    & npm --prefix $UiRoot test
    if ($LASTEXITCODE -ne 0) { throw "UI tests failed" }
    & npm --prefix $UiRoot run build
    if ($LASTEXITCODE -ne 0) { throw "UI build failed" }

    & npm --prefix $DemoRoot ci
    if ($LASTEXITCODE -ne 0) { throw "Demo-video npm ci failed" }
    & npm --prefix $DemoRoot run lint
    if ($LASTEXITCODE -ne 0) { throw "Demo-video source validation failed" }
    & (Join-Path $PSScriptRoot "test-demo.ps1")

    & $Cargo fmt --all -- --check
    if ($LASTEXITCODE -ne 0) { throw "cargo fmt check failed" }
    & $Cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
    if ($LASTEXITCODE -ne 0) { throw "cargo clippy failed" }
    & $Cargo test --workspace --all-features --locked
    if ($LASTEXITCODE -ne 0) { throw "cargo test failed" }

    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $metadataTemp = Join-Path $tempBase ("CodeCodex-metadata-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $metadataTemp -Force | Out-Null
    try {
        $testSbom = Join-Path $metadataTemp "sbom.spdx.json"
        $testNotices = Join-Path $metadataTemp "THIRD_PARTY.md"
        $testLicenses = Join-Path $metadataTemp "THIRD_PARTY_LICENSES.txt"

        & node (Join-Path $PSScriptRoot "generate-sbom.mjs") $testSbom
        if ($LASTEXITCODE -ne 0) { throw "SBOM generation failed" }
        & node (Join-Path $PSScriptRoot "verify-sbom.mjs") $testSbom
        if ($LASTEXITCODE -ne 0) { throw "SBOM verification failed" }
        & node (Join-Path $PSScriptRoot "generate-third-party.mjs") $testNotices $testLicenses
        if ($LASTEXITCODE -ne 0) { throw "Third-party notice generation failed" }

        foreach ($name in @("THIRD_PARTY.md", "THIRD_PARTY_LICENSES.txt")) {
            $committed = Join-Path $RepoRoot $name
            $generated = Join-Path $metadataTemp $name
            if (-not (Test-Path -LiteralPath $committed -PathType Leaf)) {
                throw "Required legal notice is missing: $committed"
            }
            if ((Get-FileHash -LiteralPath $committed -Algorithm SHA256).Hash -ne
                (Get-FileHash -LiteralPath $generated -Algorithm SHA256).Hash) {
                throw "$name is stale; run scripts/generate-third-party.mjs and commit the result"
            }
        }
    }
    finally {
        $metadataTempFull = [IO.Path]::GetFullPath($metadataTemp)
        if ($metadataTempFull.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
            (Test-Path -LiteralPath $metadataTempFull)) {
            Remove-Item -LiteralPath $metadataTempFull -Recurse -Force
        }
    }
}
finally {
    Pop-Location
}
