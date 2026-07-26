[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [switch]$SkipUi
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$UiRoot = Join-Path $RepoRoot "packages\explorer-ui"

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
}
finally {
    Pop-Location
}
