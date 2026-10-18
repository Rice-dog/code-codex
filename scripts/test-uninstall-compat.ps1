[CmdletBinding()]
param([string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputRoot)) { $OutputRoot = Join-Path $repo ('artifacts/uninstall-script-compat/protocol/run-' + [Guid]::NewGuid().ToString('N')) }
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force $OutputRoot | Out-Null
$source=[IO.File]::ReadAllText((Join-Path $repo 'installer/Uninstall-CodeCodex.ps1'))
$finalizer=[IO.File]::ReadAllText((Join-Path $repo 'installer/Finalize-Uninstall.ps1'))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Production uninstall script syntax invalid'}
# The full production preflight runs; stop before process scanning or shortcut
# changes. Both portable/MSI invocation blocks are tested separately below.
$stop=@'
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'observation.json'),(@{finalizerSource=$finalizerSource;shared=[bool]$SharedProgress} | ConvertTo-Json))
return
'@
if(-not $source.Contains('$processSnapshot = @()')){throw 'Preflight boundary not found'}
$cases=@('old57','new59','missing-installed','invalid-installed','legacy-direct','missing-paired','old-paired','syntax-paired','redirected-paired','missing-channel')
$results=@()
foreach($case in $cases) {
 $dir=Join-Path $OutputRoot $case; $root=Join-Path $dir 'Code-Codex'; $bundle=Join-Path $dir 'bundle'
 New-Item -ItemType Directory -Force $root,$bundle | Out-Null
 [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
 [IO.File]::WriteAllText((Join-Path $root 'sentinel.txt'),'original bytes')
 [IO.File]::WriteAllText((Join-Path $root 'Uninstall-CodeCodex.ps1'),"throw 'INSTALLED UNINSTALL SCRIPT MUST NOT RUN'")
 $legacy='param([string]$InstallRoot,[int]$ParentPid,[switch]$PurgeSettings); throw "INSTALLED FINALIZER MUST NOT RUN"'
 if($case -notin @('missing-installed')) {
  $old=if($case -eq 'new59'){$finalizer}elseif($case -eq 'invalid-installed'){'param('}else{$legacy}
  [IO.File]::WriteAllText((Join-Path $root 'Finalize-Uninstall.ps1'),$old,[Text.UTF8Encoding]::new($true))
 }
 $paired=Join-Path $bundle 'Finalize-Uninstall.ps1'
 if($case -ne 'missing-paired') {
  $pair=if($case -eq 'old-paired'){$legacy}elseif($case -eq 'syntax-paired'){'param('}else{$finalizer}
  [IO.File]::WriteAllText($paired,$pair,[Text.UTF8Encoding]::new($true))
 }
 if($case -eq 'redirected-paired') {
  [IO.File]::Delete($paired)
  # A junction models a redirected node without requiring symlink privilege.
  New-Item -ItemType Junction -Path $paired -Target $root | Out-Null
 }
 $runner=Join-Path $bundle 'Uninstall-CodeCodex.ps1'
 [IO.File]::WriteAllText($runner,$source.Replace('$processSnapshot = @()',$stop),[Text.UTF8Encoding]::new($true))
 $state=Join-Path $dir 'state'; [IO.File]::WriteAllText($state,'0|progress|0|')
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"
 $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$runner+'" -InstallRoot "'+$root+'"'+$(if($case -ne 'legacy-direct'){' -SharedProgress'}else{''})
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
 $info.EnvironmentVariables['CLE_PROGRESS_STATE_PATH']=$(if($case -eq 'missing-channel'){''}else{$state})
 $process=[Diagnostics.Process]::Start($info);$stderr=$process.StandardError.ReadToEndAsync();$stdout=$process.StandardOutput.ReadToEndAsync()
 if(-not $process.WaitForExit(15000)){$process.Kill();throw "Preflight timed out: $case"}
 $message=$stdout.Result+"`n"+$stderr.Result
 [IO.File]::WriteAllText((Join-Path $dir 'process.log'),$message)
 $errorCode=switch($case){'missing-paired'{'003'};'redirected-paired'{'003'};'old-paired'{'004'};'syntax-paired'{'004'};'missing-channel'{'005'};default{$null}}
 $observation=Join-Path $bundle 'observation.json'
 if($errorCode) {
  if($process.ExitCode -eq 0 -or $message -notmatch ('CC-UNINSTALL-COMPAT-'+$errorCode) -or (Test-Path $observation)){throw "Gate did not stop before mutation: $case $message"}
 } else {
  if($process.ExitCode -ne 0 -or -not(Test-Path $observation)){throw "Compatible preflight failed: $case $message"}
  $observed=Get-Content $observation -Raw | ConvertFrom-Json
  $expected=if($case -eq 'legacy-direct'){Join-Path $root 'Finalize-Uninstall.ps1'}else{$paired}
  if($observed.finalizerSource -ne $expected){throw "Selected wrong-generation helper: $case"}
 }
 if([IO.File]::ReadAllText((Join-Path $root 'sentinel.txt')) -ne 'original bytes'){throw 'Preflight altered install files'}
 $results+=@{case=$case;passed=$true;exitCode=$process.ExitCode;earlyGate=$errorCode}
}
# Exercise the actual portable/MSI SharedProgress call sites with a recording
# helper. This is protocol validation, not a Windows Installer transaction.
$branches=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Clauses[0].Item1.Extent.Text -eq '$SharedProgress'},$true) | Where-Object {$_.Extent.Text -match '& \$finalizerCopy'})
if($branches.Count -ne 2){throw 'Expected portable and MSI shared invocation branches'}
foreach($branch in $branches) {
 foreach($purge in @($false,$true)) {
  foreach($status in @(0,3)) {
   $msi=$branch.Extent.Text -match 'MsiProductCode';$kind=if($msi){'msi'}else{'portable'}
   $dir=Join-Path $OutputRoot ($kind+'-'+$purge+'-'+$status); New-Item -ItemType Directory -Force $dir | Out-Null
   $root=Join-Path $dir "中文 Apps\user's Code-Codex"
   $helper=Join-Path $dir 'helper.ps1';$record=Join-Path $dir 'record.json'
   $helperSource='param([string]$InstallRoot,[int]$ParentPid,[switch]$PurgeSettings,[string]$MsiProductCode,[switch]$SharedProgress)' + "`n" + '@{InstallRoot=$InstallRoot;ParentPid=$ParentPid;PurgeSettings=[bool]$PurgeSettings;SharedProgress=[bool]$SharedProgress;MsiProductCode=$MsiProductCode} | ConvertTo-Json | Set-Content -LiteralPath $env:FIXTURE_RECORD -Encoding UTF8; exit '+$status
   [IO.File]::WriteAllText($helper,$helperSource,[Text.UTF8Encoding]::new($true))
   $body=$branch.Clauses[0].Item2.Extent.Text;$body=$body.Substring(1,$body.Length-2)
   $caller='param($Target,$Root,[switch]$PurgeSettings)' + "`n" + '$finalizerCopy=$Target;$InstallFullPath=$Root;$product=@{PSChildName="{12345678-1234-1234-1234-123456789ABC}"}' + "`n"+$body
   $runner=Join-Path $dir 'caller.ps1';[IO.File]::WriteAllText($runner,$caller,[Text.UTF8Encoding]::new($true))
   $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$runner+'" -Target "'+$helper+'" -Root "'+$root+'"'+$(if($purge){' -PurgeSettings'}else{''})
   $info.EnvironmentVariables['FIXTURE_RECORD']=$record
   $process=[Diagnostics.Process]::Start($info);$stderr=$process.StandardError.ReadToEndAsync();$stdout=$process.StandardOutput.ReadToEndAsync()
   if(-not $process.WaitForExit(15000)){$process.Kill();throw 'Shared invocation timeout'}
   [IO.File]::WriteAllText((Join-Path $dir 'process.log'),$stdout.Result+"`n"+$stderr.Result)
   $parameters=Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
   if($process.ExitCode -ne $status -or $parameters.InstallRoot -ne $root -or -not $parameters.SharedProgress -or $parameters.ParentPid -ne 0 -or $parameters.PurgeSettings -ne $purge -or ($msi -and -not $parameters.MsiProductCode)){throw 'Shared arguments or finalizer status lost'}
   $results+=@{case=$kind;passed=$true;purge=$purge;propagatedExitCode=$status;realMsiTransaction=$false}
  }
 }
}
$results | ConvertTo-Json | Set-Content (Join-Path $OutputRoot 'results.json') -Encoding utf8
Write-Output "Uninstall compatibility: $($results.Count) cases passed in Windows PowerShell 5.1."
