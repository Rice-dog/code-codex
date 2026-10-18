[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$source=[IO.File]::ReadAllText((Join-Path $root 'installer/Install-CodeCodex.ps1'))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
foreach($name in @('Get-CodeCodexInstallFailureCode','New-CodeCodexRollbackIssue')){
 $fn=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $name)
 if($fn.Count -ne 1){throw "Missing function: $name"}
 . ([scriptblock]::Create($fn[0].Extent.Text))
}
$count=0
foreach($test in @(@(5,'ACCESS-001'),@(32,'SHARING-001'),@(33,'LOCK-001'),@(112,'SPACE-001'),@(39,'SPACE-002'),@(206,'PATH-LENGTH-001'),@(3,'PATH-MISSING-001'),@(2,'FILE-MISSING-001'),@(183,'CONFLICT-001'),@(80,'CONFLICT-002'),@(19,'READONLY-001'),@(21,'DRIVE-001'))){
 $e=[Runtime.InteropServices.Marshal]::GetExceptionForHR([int](-2147024896+$test[0]))
 $actual=Get-CodeCodexInstallFailureCode $e 'file operation'
 if($actual -ne ('CC-INSTALL-'+$test[1])){throw "Expected $($test[1]); got $actual"};$count++
}
foreach($test in @(@('CC-INSTALL-INTEGRITY-001: mismatch','CC-INSTALL-INTEGRITY-001'),@('unknown cause','CC-INSTALL-UNKNOWN-001'))){if((Get-CodeCodexInstallFailureCode ([Exception]::new($test[0])) 'unknown') -ne $test[1]){throw 'Explicit/unknown classification mismatch'};$count++}
try{throw [IO.IOException]::new('test rollback failure')}catch{$issue=New-CodeCodexRollbackIssue 'marker restore' $_;if($issue.reason -ne 'test rollback failure' -or -not $issue.hresult -or $issue.operation -ne 'marker restore'){throw 'Rollback evidence incomplete'};$count++}
if($source -notmatch 'installationCommitted' -or $source -notmatch 'readiness-timeout' -or $source -notmatch 'completed-unverified'){throw 'Terminal state separation missing'};$count++
Write-Output "$count installation diagnostics checks passed; no installation or removal executed."
