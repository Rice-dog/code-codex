[CmdletBinding()]
param([string]$BinaryPath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $BinaryPath) { $BinaryPath = Join-Path $repo 'target\release\code-codex.exe' }
$BinaryPath = (Resolve-Path -LiteralPath $BinaryPath).Path
$testRoot = Join-Path $repo ('artifacts\startup-conflict-native\' + [Guid]::NewGuid().ToString('N'))
$binRoot = Join-Path $testRoot 'versions\test'
New-Item -ItemType Directory -Path $binRoot -Force | Out-Null
# Executable-relative storage keeps this smoke test out of the real installation.
[IO.File]::WriteAllText((Join-Path $testRoot 'storage-layout.json'), '{"schema":1,"product":"Code-Codex"}')
$binary = Join-Path $binRoot 'code-codex.exe'
Copy-Item -LiteralPath $BinaryPath -Destination $binary
& $binary reset-startup-recovery
if ($LASTEXITCODE -ne 0) { throw 'Native recovery reset failed' }
$preference = Join-Path $testRoot 'data\startup-recovery.json'
$value = Get-Content -LiteralPath $preference -Raw -Encoding UTF8 | ConvertFrom-Json
if ($value.schema -ne 1 -or $value.autoRestart -isnot [bool] -or $value.autoRestart) {
    throw 'Native recovery reset wrote an invalid preference'
}
Write-Host ('Native recovery transport/reset passed; isolated fixture retained at ' + $testRoot)
