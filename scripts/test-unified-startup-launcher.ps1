[CmdletBinding()]
param([string]$Output='artifacts/unified-startup-launcher',[string]$BinaryPath)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(-not $BinaryPath){$BinaryPath=Join-Path $repo 'target/release/code-codex-launcher.exe'}
$BinaryPath=(Resolve-Path -LiteralPath $BinaryPath).Path
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output))
if (-not $out.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo 'artifacts'))+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture output' }
[void][IO.Directory]::CreateDirectory($out)
$stub=Join-Path $out 'fixture-core.exe'
& rustc --edition=2024 (Join-Path $repo 'scripts/fixtures/unified-startup-worker.rs') -o $stub
if($LASTEXITCODE -ne 0){throw 'Protocol fixture compilation failed'}
$checks=New-Object Collections.Generic.List[string]
function Check([bool]$Ok,[string]$Label){if(-not $Ok){throw $Label};$checks.Add($Label)}
foreach($mode in @('checking','cancel','cancel-window','cancel-channel','failed','no-instance','ready','delayed-ready')) {
 $fixture=Join-Path $out ($mode+'-'+[Guid]::NewGuid().ToString('N'))
 $bin=Join-Path $fixture 'versions\test';[void][IO.Directory]::CreateDirectory($bin)
 [IO.File]::WriteAllText((Join-Path $fixture 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
 $gui=Join-Path $bin 'CodeCodex.exe';Copy-Item -LiteralPath $BinaryPath -Destination $gui
 Copy-Item -LiteralPath $stub -Destination (Join-Path $bin 'code-codex.exe')
 $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$gui;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.EnvironmentVariables['CLE_UNIFIED_FIXTURE_MODE']=$mode
 $info.EnvironmentVariables['CLE_UNIFIED_FIXTURE_RECEIPT']=(Join-Path $fixture 'decision-received.json')
 $process=[Diagnostics.Process]::Start($info);$windows=New-Object Collections.ArrayList
 try {
  $end=[DateTime]::UtcNow.AddSeconds(25);$channel=$null
  do {
   $state=Get-ChildItem -LiteralPath (Join-Path $fixture 'temp') -Filter recovery.json -File -Recurse -ErrorAction SilentlyContinue|Select-Object -First 1
   if($state){$channel=$state.DirectoryName;break};Start-Sleep -Milliseconds 80
  }while(-not $process.HasExited -and [DateTime]::UtcNow -lt $end)
  Check ($null -ne $channel) ($mode+': actual GUI supplied private per-launch channel')
  if($mode -eq 'checking') {
   $status=Get-Content -LiteralPath (Join-Path $channel 'recovery.json') -Raw|ConvertFrom-Json
   Check ($status.phase -ceq 'checking') 'Fixture holds the original internal checking phase'
   $early=@(Get-CimInstance Win32_Process -Filter ("ParentProcessId="+$process.Id)|Where-Object {$_.Name -ieq 'powershell.exe'})
   Check ($early.Count -eq 0) 'Compiled GUI does not create a partial diagnostic window during internal checking'
   [IO.File]::WriteAllText((Join-Path $channel 'allow-consent'),'continue')
   $end=[DateTime]::UtcNow.AddSeconds(25)
  }
  do {
   $rows=@(Get-CimInstance Win32_Process -Filter ("ParentProcessId="+$process.Id)|Where-Object {$_.Name -ieq 'powershell.exe'})
   if($rows.Count -eq 1){$window=[Diagnostics.Process]::GetProcessById($rows[0].ProcessId);[void]$window.Handle;$window.Refresh();if($window.MainWindowHandle -ne [IntPtr]::Zero){[void]$windows.Add($window);break};$window.Dispose()}
   Start-Sleep -Milliseconds 100
  }while([DateTime]::UtcNow -lt $end)
  Check ($windows.Count -eq 1) ($mode+': one existing diagnostic window, no second consent popup')
  $window=$windows[0];$first=$window.MainWindowHandle
  if($mode -in @('cancel-window','cancel-channel')) {
   if($mode -eq 'cancel-channel'){Remove-Item -LiteralPath (Join-Path $channel 'recovery.json') -Force;Start-Sleep -Milliseconds 300}
   $window.Kill();[void]$window.WaitForExit(5000)
   Check ($process.WaitForExit(12000) -and $process.ExitCode -eq 0) 'Lost consent window cancels without stranding the worker'
   $decision=Get-Content -LiteralPath (Join-Path $fixture 'decision-received.json') -Raw|ConvertFrom-Json
   Check ($decision.action -ceq 'cancel' -and -not $decision.remember) 'Lost consent window never grants close or remembered permission'
   continue
  }
  $command=if($mode -eq 'cancel'){'cancel'}else{'restart'}
  [IO.File]::WriteAllText((Join-Path $channel 'action.json'),('{"schema":1,"requestId":"fixture-core-123","action":"'+$command+'","remember":false}'))
  if($command -eq 'restart') {
   $end=[DateTime]::UtcNow.AddSeconds(8)
   do {$window.Refresh();if($window.MainWindowHandle -eq [IntPtr]::Zero){break};Start-Sleep -Milliseconds 60}while([DateTime]::UtcNow -lt $end)
   Check (-not $window.HasExited -and $window.MainWindowHandle -eq [IntPtr]::Zero) ($mode+': diagnostic disappears while background verification keeps running')
   [IO.File]::WriteAllText((Join-Path $channel 'continue-recovery'),'continue')
  }
  if($mode -eq 'delayed-ready') {
   $end=[DateTime]::UtcNow.AddSeconds(8)
   do {if(Test-Path -LiteralPath (Join-Path $channel 'delayed-pending')){break};Start-Sleep -Milliseconds 60}while([DateTime]::UtcNow -lt $end)
   Check (Test-Path -LiteralPath (Join-Path $channel 'delayed-pending')) 'Delayed readiness gate is held by the disposable controller'
   $pendingBytes=[IO.File]::ReadAllText((Join-Path $channel 'recovery.json'))
   $flash=$false;$end=[DateTime]::UtcNow.AddSeconds(2)
   do {$window.Refresh();if($window.MainWindowHandle -ne [IntPtr]::Zero){$flash=$true};Start-Sleep -Milliseconds 40}while([DateTime]::UtcNow -lt $end)
   Check (-not $flash -and -not $window.HasExited) 'Compiled wrapper and real dialog remain hidden throughout aged pending startup'
   Check ([IO.File]::ReadAllText((Join-Path $channel 'recovery.json')) -ceq $pendingBytes) 'Neither compiled wrapper nor dialog overwrites the pending state'
   [IO.File]::WriteAllText((Join-Path $channel 'release-delayed-ready'),'continue')
  }
  if($mode -in @('ready','checking','cancel','delayed-ready')){
   Check ($process.WaitForExit(15000) -and $process.ExitCode -eq 0) ($mode+': verified ready or explicit cancel finishes successfully')
   Check ($window.WaitForExit(5000)) ($mode+': background diagnostic process exits instead of lingering over Codex')
  }else{
   $end=[DateTime]::UtcNow.AddSeconds(15)
   do {$status=Get-Content -LiteralPath (Join-Path $channel 'recovery.json') -Raw|ConvertFrom-Json;if($status.phase -in @('failed','cancelled')){break};Start-Sleep -Milliseconds 100}while([DateTime]::UtcNow -lt $end)
   Check ($status.phase -in @('failed','cancelled')) ($mode+': terminal state published, not endless loading')
   if($mode -eq 'no-instance'){Check ($status.diagnostic.code -ceq 'CC-START-RECOVERY-INSTANCE-001') 'Even exit zero without replacement is a missing-instance failure'}
   Start-Sleep -Milliseconds 700;$window.Refresh()
   Check (-not $window.HasExited -and $window.MainWindowHandle -eq $first) ($mode+': original diagnostic window survives with the same identity')
   $reports=@(Get-ChildItem -LiteralPath (Join-Path $fixture 'logs/diagnostics') -Filter '*.txt' -File)
   Check ($reports.Count -eq 1) ($mode+': one persistent diagnostic report')
   $report=[IO.File]::ReadAllText($reports[0].FullName)
   Check ($report.Contains('ORIGINAL_CONFLICT_EVIDENCE')) ($mode+': original conflict remains in saved report')
   if($mode -eq 'failed'){Check ($report.Contains('NEW_INSTANCE_NOT_FOUND_EVIDENCE')) 'Saved report includes new launch failure and old conflict'}
   if($mode -eq 'no-instance'){Check ($report.Contains('CC-START-RECOVERY-INSTANCE-001')) 'Missing replacement is persisted as a specific error'}
   Check ($window.CloseMainWindow()) ($mode+': explicit Close remains available after terminal result')
   Check ($process.WaitForExit(12000)) ($mode+': GUI exits after user closes its diagnostic')
   Check ($process.ExitCode -eq $(if($mode -eq 'cancel'){0}else{22})) ($mode+': cancellation and unverified restart have distinct exit statuses')
  }
 }finally{
  # Only exact fixture child handles opened above, never official Codex processes.
  foreach($window in $windows){if(-not $window.HasExited){$window.Kill();[void]$window.WaitForExit(5000)};$window.Dispose()}
  if(-not $process.HasExited){$process.Kill();[void]$process.WaitForExit(5000)};$process.Dispose()
 }
}
@{passed=$true;checks=$checks;scope='Actual compiled GUI launcher with disposable core-protocol double, no official Codex start/close or OS startup mutation'}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding UTF8
Write-Output ('Unified compiled launcher: '+$checks.Count+' checks passed')
