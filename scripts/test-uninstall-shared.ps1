[CmdletBinding()]
param([string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/branded-uninstall/finalizer-tests'))
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force $OutputRoot | Out-Null
$source=[IO.File]::ReadAllText((Join-Path $repo 'installer/Finalize-Uninstall.ps1'))
$tokens=$null;$errors=$null
[void][Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Finalizer syntax invalid'}
$callerAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'installer/Uninstall-CodeCodex.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Uninstall caller syntax invalid'}
$sharedBranch=$callerAst.FindAll({param($node) $node -is [Management.Automation.Language.IfStatementAst] -and $node.Clauses[0].Item1.Extent.Text -eq '$SharedProgress'},$true) | Where-Object {$_.Extent.Text -notmatch 'MsiProductCode' -and $_.Extent.Text -match '& \$finalizerCopy'} | Select-Object -First 1
if(-not $sharedBranch){throw 'Production shared finalizer caller not found'}
$callerBody=$sharedBranch.Clauses[0].Item2.Extent.Text
$callerBody=$callerBody.Substring(1,$callerBody.Length-2)
# Isolate registry, desktop and legacy windows. Keep production root checks,
# file deletion, progress protocol, retries and failure exit status intact.
$isolation=@'
function Remove-VerifiedCodeCodexDesktopShortcut {}
function New-UninstallProgressDialog { throw 'Legacy progress window must not open' }
function Show-UninstallSuccess { throw 'Legacy success popup must not open' }
function Show-UninstallFailure { throw 'Legacy failure popup must not open' }
function New-Item { param([string]$Path,[switch]$Force) if($Path -notlike 'HKCU:*'){throw 'Unexpected fixture New-Item'} }
function New-ItemProperty { param($Path,$Name,$PropertyType,$Value,[switch]$Force) if($Path -notlike 'HKCU:*'){throw 'Unexpected fixture registry write'} }
function Remove-ItemProperty { [CmdletBinding()]param($Path,$Name) if($Path -notlike 'HKCU:*'){throw 'Unexpected fixture registry removal'} }
function Remove-Item { [CmdletBinding()]param([string]$LiteralPath,[switch]$Force,[switch]$Recurse) if($LiteralPath -like 'HKCU:*'){return}; Microsoft.PowerShell.Management\Remove-Item @PSBoundParameters }
'@
$results=@()
foreach($case in @('keep','purge','failure')) {
 $dir=Join-Path $OutputRoot $case; $root=Join-Path $dir 'Code-Codex'
 New-Item -ItemType Directory -Force "$root/data","$root/plugins","$root/versions" | Out-Null
 [IO.File]::WriteAllText("$root/storage-layout.json",'{"schema":1,"product":"Code-Codex"}')
 [IO.File]::WriteAllText("$root/CodeCodex.exe",'fixture executable data')
 [IO.File]::WriteAllText("$root/versions/fixture.txt",'fixture version')
 [IO.File]::WriteAllText("$root/data/private.txt",'private fixture media')
 $sentinel=Join-Path $dir 'outside.txt'; [IO.File]::WriteAllText($sentinel,'untouched')
 $extra=if($case -eq 'failure'){"`nfunction Remove-CodeCodexApplicationFiles { throw 'Fixture locked application file' }; function Start-Sleep { param(`$Milliseconds) }`n"}else{''}
 $runner=Join-Path $dir 'finalizer.ps1'
 [IO.File]::WriteAllText($runner,$source.Replace('$exitCode = 0',($isolation+$extra+"`n`$exitCode = 0")),[Text.UTF8Encoding]::new($true))
 $caller=Join-Path $dir 'caller.ps1'
 [IO.File]::WriteAllText($caller,('param([string]$Target,[string]$InstallRoot,[switch]$PurgeSettings)' + "`n" + '$finalizerCopy=$Target; $InstallFullPath=$InstallRoot' + "`n" + $callerBody),[Text.UTF8Encoding]::new($true))
 $state=Join-Path $dir 'state'; [IO.File]::WriteAllText($state,'0|progress|0|')
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"
 $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$caller+'" -Target "'+$runner+'" -InstallRoot "'+$root+'"'+$(if($case -eq 'purge'){' -PurgeSettings'}else{''})
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true;$info.EnvironmentVariables['CLE_PROGRESS_STATE_PATH']=$state
 $process=[Diagnostics.Process]::Start($info);$stderr=$process.StandardError.ReadToEndAsync();$stdout=$process.StandardOutput.ReadToEndAsync()
 if(-not $process.WaitForExit(15000)){$process.Kill();throw "Finalizer timeout: $case"}
 $errorText=$stderr.Result;[IO.File]::WriteAllText((Join-Path $dir 'process.log'),$stdout.Result+"`n"+$errorText)
 if($case -eq 'failure') {
  if($process.ExitCode -ne 3 -or $errorText -notmatch 'Fixture locked application file' -or -not(Test-Path "$root/CodeCodex.exe")){throw 'Failure was swallowed or showed success'}
 } else {
  if($process.ExitCode -ne 0 -or (Test-Path "$root/CodeCodex.exe") -or (Test-Path "$root/versions")){throw "Removal failed: $case $errorText"}
  if($case -eq 'keep' -and [IO.File]::ReadAllText("$root/data/private.txt") -ne 'private fixture media'){throw 'Keep settings lost media'}
  if($case -eq 'purge' -and (Test-Path -LiteralPath $root)){throw 'Purge left owned fixture root'}
 }
 if([IO.File]::ReadAllText($sentinel) -ne 'untouched'){throw 'Removed outside root'}
 if([IO.File]::ReadAllText($state) -notmatch '\|progress\|'){throw 'Shared progress was not sent'}
 $results+=@{case=$case;passed=$true;exitCode=$process.ExitCode;externalRegistryAndDesktop='mocked';productionFileRemoval=$true}
}
$results | ConvertTo-Json | Set-Content (Join-Path $OutputRoot 'results.json') -Encoding utf8
Write-Output 'Shared finalizer: keep, purge and failure passed; no legacy UI; registry/desktop isolated.'
