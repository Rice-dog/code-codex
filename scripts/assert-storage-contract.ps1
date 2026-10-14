[CmdletBinding()]
param([string]$InstallerRoot)
$ErrorActionPreference = 'Stop'
if (-not $InstallerRoot) { $InstallerRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'installer' }
$canonical = ([IO.File]::ReadAllText((Join-Path $InstallerRoot 'Storage-Layout.ps1')) -replace "`r`n", "`n").Trim()
foreach ($name in @('Install-CodeCodex.ps1','Uninstall-CodeCodex.ps1','Finalize-Uninstall.ps1')) {
    $source = [IO.File]::ReadAllText((Join-Path $InstallerRoot $name)) -replace "`r`n", "`n"
    $copies = [regex]::Matches($source, '(?ms)^# storage-contract:start\n(.*?)^# storage-contract:end')
    if ($copies.Count -ne 1 -or $copies[0].Groups[1].Value.Trim() -cne $canonical) {
        throw "Embedded storage contract differs from Storage-Layout.ps1: $name. Sync it before building."
    }
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw "Invalid PowerShell in ${name}: $($parseErrors[0].Message)" }
    $functions = @($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]}, $true) | ForEach-Object Name)
    foreach ($required in @('Assert-CodeCodexRoot','Get-CodeCodexRegisteredRoot','Remove-CodeCodexRetiredStartupCache')) {
        if ($required -notin $functions) { throw "Required embedded function $required missing from $name." }
    }
}
Write-Host 'Embedded storage contracts verified: install, uninstall, finalizer.'
