[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$contract = Get-Content -LiteralPath (Join-Path $root 'installer/worker-protocol.json') -Raw | ConvertFrom-Json
foreach ($worker in @(
    @{ Name='Uninstall-CodeCodex'; Parameters=$contract.uninstallParameters },
    @{ Name='Finalize-Uninstall'; Parameters=$contract.finalizerParameters }
)) {
    $tokens=$null; $parseErrors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root ('installer/'+$worker.Name+'.ps1')), [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ('Worker syntax error: '+$worker.Name+': '+($parseErrors | Out-String)) }
    $actual=@($ast.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath })
    foreach ($required in $worker.Parameters) {
        if ($actual -notcontains $required) { throw ('Worker protocol mismatch: '+$worker.Name+' missing '+$required) }
    }
}
Write-Output 'Worker parameter ASTs match the shared protocol.'
