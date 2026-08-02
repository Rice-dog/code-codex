[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [switch]$SkipUi
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$UiRoot = Join-Path $RepoRoot "packages\explorer-ui"
$PreviousMsvcRustFlags = $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS
$StaticCrtFlag = "-C target-feature=+crt-static"
if ([string]::IsNullOrWhiteSpace($PreviousMsvcRustFlags)) {
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS = $StaticCrtFlag
}
elseif ($PreviousMsvcRustFlags -notmatch '(?i)(^|\s)target-feature=(?:[^\s]*,)?\+crt-static(?:,|\s|$)') {
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS = "$PreviousMsvcRustFlags $StaticCrtFlag"
}

function Resolve-Cargo {
    $command = Get-Command cargo -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $userCargo = Join-Path $HOME ".cargo\bin\cargo.exe"
    if (Test-Path -LiteralPath $userCargo) { return $userCargo }

    throw "Cargo was not found. Install Rustup or reopen the terminal after installation."
}

Push-Location $RepoRoot
try {
    if (-not $SkipUi) {
        if (-not (Test-Path -LiteralPath (Join-Path $UiRoot "package-lock.json"))) {
            throw "The explorer UI lockfile is missing. Run npm install in packages/explorer-ui first."
        }
        & npm --prefix $UiRoot ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
        & npm --prefix $UiRoot run build
        if ($LASTEXITCODE -ne 0) { throw "UI build failed with exit code $LASTEXITCODE" }
    }

    $cargo = Resolve-Cargo
    $arguments = @("build", "--workspace", "--locked")
    if ($Configuration -eq "Release") { $arguments += "--release" }
    & $cargo @arguments
    if ($LASTEXITCODE -ne 0) { throw "Cargo build failed with exit code $LASTEXITCODE" }

    $profile = if ($Configuration -eq "Release") { "release" } else { "debug" }
    $outputRoot = Join-Path $RepoRoot "target\$profile"
    $setupStub = Join-Path $outputRoot "code-codex-setup.exe"
    $uninstallerStub = Join-Path $outputRoot "code-codex-uninstall.exe"
    $installScript = Join-Path $RepoRoot "installer\Install-CodeCodex.ps1"
    $uninstallScript = Join-Path $RepoRoot "installer\Uninstall-CodeCodex.ps1"
    $finalizerScript = Join-Path $RepoRoot "installer\Finalize-Uninstall.ps1"

    foreach ($required in @($setupStub, $uninstallerStub, $installScript, $uninstallScript, $finalizerScript)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required source-built installer payload is missing: $required"
        }
    }

    Copy-Item -LiteralPath $setupStub -Destination (Join-Path $outputRoot "Install-CodeCodex.exe") -Force
    Copy-Item -LiteralPath $uninstallerStub -Destination (Join-Path $outputRoot "Uninstall-CodeCodex.exe") -Force
    Copy-Item -LiteralPath $installScript -Destination $outputRoot -Force
    Copy-Item -LiteralPath $uninstallScript -Destination $outputRoot -Force
    Copy-Item -LiteralPath $finalizerScript -Destination $outputRoot -Force
}
finally {
    Pop-Location
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS = $PreviousMsvcRustFlags
}
