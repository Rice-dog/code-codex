$ErrorActionPreference='Stop'
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../installer/src/install/execute.ps1') -Raw -Encoding UTF8
$match=[regex]::Match($source,"(?ms)^                    if \(\`$event.source -eq 'launcher' -and \`$event.action -eq 'activation lifetime'.*?^                    }")
if (-not $match.Success) { throw 'Production delegated activation observer not found.' }
$test=[scriptblock]::Create('param($event,$Version,$installedCommandLine,$activation) foreach($observation in @(1)){'+$match.Value+'}; $activation.Id')
$shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$proxy=Get-Process -Id $PID
$worker=Start-Process -FilePath $shell -ArgumentList @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 15') -WindowStyle Hidden -PassThru
try {
 $script:ActivationReport=[ordered]@{pid=$proxy.Id}
 $event=[pscustomobject]@{source='launcher';action='activation lifetime';outcome='delegated';details=[pscustomobject]@{version='fixture';pid=$worker.Id}}
 $id=& $test $event 'fixture' $shell $proxy
 if ($id -ne $worker.Id -or $script:ActivationReport.proxyPid -ne $proxy.Id -or -not $script:ActivationReport.delegated) { throw 'Installer did not follow the verified independent worker.' }
 $rejected=$false
 try { & $test $event 'fixture' 'C:/not-the-installed-core.exe' $proxy | Out-Null } catch { $rejected=$_.Exception.Message -like '*CC-ACTIVATE-LIFETIME-004*' }
 if (-not $rejected) { throw 'Unexpected image was not rejected.' }
 $wrongVersion=& $test $event 'other' $shell $proxy
 if ($wrongVersion -ne $proxy.Id) { throw 'Unrelated version changed the observed process.' }
 Write-Output '3 production installer delegation checks passed: verified identity, wrong image rejected, stale version ignored.'
} finally {
 # Only this fixture's exact retained Process object is closed; no user process.
 $worker.Refresh();if(-not $worker.HasExited){$worker.Kill()};$worker.Dispose()
}
