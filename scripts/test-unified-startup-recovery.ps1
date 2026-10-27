[CmdletBinding()]
param([string]$Output='artifacts/unified-startup-recovery',[ValidateSet('en','zh-CN')][string]$Locale='en')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output))
if (-not $out.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo 'artifacts'))+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test output' }
[void][IO.Directory]::CreateDirectory($out)
$root=Join-Path $out ([Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($root)
$env:CLE_RECOVERY_UI_DIRECTORY=$root
$env:CLE_ERROR_LIVE_STATE=''
$env:CLE_ERROR_REPORT=''
$env:CLE_ERROR_DETAILS='ORIGINAL_DIAGNOSTIC'
$env:CLE_ERROR_OWNER_PID=[string]$PID
$env:CLE_ERROR_TITLE='Code-Codex startup problem'
$env:CLE_ERROR_SUMMARY='Codex Desktop is already running without Code-Codex'
$env:CLE_ERROR_REASON='ORIGINAL_DIAGNOSTIC: official instance exists'
$env:CLE_ERROR_GUIDANCE='Cancel or explicitly choose Close and restart.'
$env:CLE_ERROR_CODE='CC-START-STATE-001';$env:CLE_ERROR_STAGE='Checking the Codex process'
$factorySource=[IO.File]::ReadAllText((Join-Path $repo 'crates/launcher/src/startup_dialog.ps1'))
$englishCatalog=Get-Content -LiteralPath (Join-Path $repo 'resources/i18n/en.json') -Raw -Encoding UTF8|ConvertFrom-Json
$targetCatalog=Get-Content -LiteralPath (Join-Path $repo ("resources/i18n/$Locale.json")) -Raw -Encoding UTF8|ConvertFrom-Json
if($Locale -eq 'zh-CN') {
 $guidancePairs=New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
 foreach($entry in $englishCatalog.PSObject.Properties){
  if(-not $guidancePairs.ContainsKey([string]$entry.Value)){$guidancePairs.Add([string]$entry.Value,[string]$targetCatalog.($entry.Name))}
 }
 $lines=@('$script:guidanceTranslations=[Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)')
 foreach($pair in $guidancePairs.GetEnumerator()){$lines+=('$script:guidanceTranslations.Add('''+$pair.Key.Replace("'","''")+''','''+$pair.Value.Replace("'","''")+''')')}
 $factorySource=$factorySource.Replace('$script:guidanceTranslations=@{} # CODE_CODEX_GUIDANCE_TRANSLATIONS',($lines -join "`n"))
 foreach($entry in $englishCatalog.PSObject.Properties){
  $original=[string]$entry.Value;$translated=[string]$targetCatalog.($entry.Name)
  if(-not $original.Contains("`n") -and -not $original.Contains("`r")){$factorySource=$factorySource.Replace(".Text = '"+$original.Replace("'","''")+"'",".Text = '"+$translated.Replace("'","''")+"'")}
 }
}
. ([scriptblock]::Create($factorySource))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'crates/launcher/src/startup_conflict.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors.Message -join ';') }
foreach($f in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)) { . ([scriptblock]::Create($f.Extent.Text)) }
$checks=New-Object Collections.Generic.List[string]
function Check([bool]$Ok,[string]$Label){if(-not $Ok){throw $Label};$checks.Add($Label)}
function Reject([scriptblock]$Action,[string]$Label){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Check $failed $Label}
function New-State([string]$Phase='awaiting-consent') {
 $d=@{code='CC-START-STATE-001';stage='Checking the Codex process';summary='Codex Desktop is already running without Code-Codex';reason='ORIGINAL_DIAGNOSTIC: official instance exists';guidance='Close Codex, then start it through Code-Codex, or click Close and restart below.'}
 [ordered]@{schema=1;requestId='test-identity-123';phase=$Phase;diagnostic=$d.Clone();original=$d.Clone();history=@('Original conflict retained');oldExited=$false;relaunchStartedMs=$null}
}
function Write-State($State){[IO.File]::WriteAllText((Join-Path $root 'recovery.json'),($State|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false))}
function Pump { $end=[DateTime]::UtcNow.AddMilliseconds(450);while([DateTime]::UtcNow -lt $end){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 15} }
function Dispose-Dialog($Dialog){$script:recoveryBusy=$false;$script:recoveryDecisionSent=$true;$Dialog.Form.Close();$Dialog.Timer.Dispose();$Dialog.Form.Dispose()}
$dialog=$null
try {
 Write-State (New-State)
 $dialog=New-CodeCodexStartupDialog
 $dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000)
 $dialog.Form.Show()
 $script:visibleTransitions=1
 $dialog.Form.Add_VisibleChanged({if($script:form.Visible){$script:visibleTransitions++}})
 Check ($dialog.Restart.Visible -and $dialog.Remember.Visible -and $dialog.Restart.Enabled -and $dialog.Form.Opacity -eq 1) 'First paint has the complete consent controls without waiting for a timer tick'
 Check ($script:action.Text -ceq $targetCatalog.'startupConflict.suggestedAction') 'Ordinary recovery instructions use the selected global language'
 Check ($dialog.Reason.Text.Contains('Original conflict: CC-START-STATE-001')) 'Technical diagnostic evidence stays English in both languages'
 $initial=New-Object Drawing.Bitmap($dialog.Form.Width,$dialog.Form.Height);$dialog.Form.DrawToBitmap($initial,(New-Object Drawing.Rectangle(0,0,$initial.Width,$initial.Height)));$initial.Save((Join-Path $out 'initial-consent.png'));$initial.Dispose()
 Pump
 $handle=$dialog.Form.Handle
 Check ($dialog.Form.Controls.Count -eq 13) 'Existing diagnostic framework retained without the redundant warning paragraph'
 Check ($dialog.Form.ClientSize.Height -lt 550) 'Compact window removes the unused warning space'
 Check ($dialog.Form.AcceptButton -eq $dialog.Cancel -and $dialog.Form.CancelButton -eq $dialog.Cancel) 'Enter and Escape default to cancellation'
 Check (-not $dialog.Remember.Checked) 'Remember remains unchecked'
 Check ($dialog.Restart.Enabled -and $dialog.Restart.Visible) 'Verified consent phase exposes restart in the same window'
 Check ($dialog.Reason.Text.Contains('ORIGINAL_DIAGNOSTIC')) 'Original reason retained beside recovery information'
 $dialog.Remember.Checked=$true;$dialog.Restart.PerformClick()
 Check (-not $dialog.Form.Visible) 'Actual restart click hides immediately before any timer or controller response'
 Pump
 $decisionRecord=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'action.json')))
 Check ($decisionRecord.action -ceq 'restart' -and $decisionRecord.remember -and $decisionRecord.requestId -ceq 'test-identity-123') 'Restart delivers exact explicit choice once'
 $actionBytes=[IO.File]::ReadAllText((Join-Path $root 'action.json'))
 $dialog.Restart.PerformClick();Pump
 Check ([IO.File]::ReadAllText((Join-Path $root 'action.json')) -ceq $actionBytes) 'Repeated click cannot overwrite or duplicate recovery choice'
 Check (-not $dialog.Restart.Enabled -and -not $dialog.Cancel.Enabled) 'Pending restart blocks duplicate actions and accidental cancellation'
 foreach($phase in @('closing','old-exited','verifying')) {
  $s=New-State $phase;$s.oldExited=$phase -ne 'closing';$s.relaunchStartedMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$s.diagnostic.reason='Current phase '+$phase;Write-State $s;Pump
  Check ($dialog.Form.Handle -eq $handle -and -not $dialog.Form.Visible) ('Background recovery remains hidden with the same diagnostic identity during '+$phase)
  Check ($dialog.Reason.Text.Contains('Current phase '+$phase) -and $dialog.Reason.Text.Contains('ORIGINAL_DIAGNOSTIC')) ('Stage and original evidence coexist: '+$phase)
 }
 $s=New-State 'failed';$s.oldExited=$true;$s.diagnostic.code='CC-START-PROCESS-015';$s.diagnostic.reason="Replacement instance not found: fixture failure`r`n`r`nStartup trace:`r`nFULL_TRACE_FIXTURE";Write-State $s;Pump
 Check ($dialog.Form.Handle -eq $handle -and $dialog.Form.Visible -and $dialog.Cancel.Enabled) 'Missing replacement keeps original window and restores Close'
 Check ($script:visibleTransitions -eq 2) 'Only the initial consent and terminal failure are ever shown'
 Pump
 Check ($dialog.Form.Handle -eq $handle -and $script:visibleTransitions -eq 2) 'Failure refresh never recreates or flashes an intermediate window'
 Check ($dialog.Reason.Text.Contains('Replacement instance not found') -and $dialog.Reason.Text.Contains('ORIGINAL_DIAGNOSTIC')) 'Failure does not replace original conflict evidence'
 Check (-not $dialog.Restart.Enabled) 'Failure never automatically repeats a close request'
 Check (-not $dialog.Reason.Text.Contains('FULL_TRACE_FIXTURE') -and $script:copyDetails.Contains('FULL_TRACE_FIXTURE')) 'Verbose internal trace stays in copy/report evidence, not the compact error window'
 $help='Copy the full diagnostic report and send it to the Code-Codex developer. The process observations identify which check failed.'
 $s.diagnostic.guidance=$help;Write-State $s;Pump
 $expectedHelp=if($Locale -eq 'zh-CN'){$targetCatalog.'text.7ef05e8f1682'}else{$help}
 Check ($script:action.Text -ceq $expectedHelp) 'Post-restart failure guidance keeps the selected language after a live state transition'
 Check ($dialog.Reason.Text.Contains('Replacement instance not found')) 'Localized guidance does not translate the raw failure reason'
 foreach($key in @('startupRecovery.reportReadyTimeoutAction','startupRecovery.uiReadyTimeoutAction','startupRecovery.instanceMissingAction','startupRecovery.documentBlockedAction')){
  $s.diagnostic.guidance=[string]$englishCatalog.$key;Write-State $s;Pump
  Check ($script:action.Text -ceq [string]$targetCatalog.$key) ('Additional recovery branch uses selected language: '+$key)
 }
 $bitmap=New-Object Drawing.Bitmap($dialog.Form.Width,$dialog.Form.Height);$dialog.Form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)));$bitmap.Save((Join-Path $out 'same-window-failure.png'));$bitmap.Dispose()
 Dispose-Dialog $dialog;$dialog=$null

 Remove-Item -LiteralPath (Join-Path $root 'recovery.json') -Force
 $dialog=New-CodeCodexStartupDialog
 Check ($dialog.Form.Opacity -eq 1 -and -not $dialog.Restart.Enabled) 'An ordinary startup failure without a recovery state remains visible'
 $dialog.Timer.Dispose();$dialog.Form.Dispose();$dialog=$null

 Write-State (New-State 'checking')
 $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show()
 Check ($dialog.Form.Opacity -eq 0) 'Internal checking is never exposed as a partial initial screen'
 Write-State (New-State);Pump
 Check ($dialog.Restart.Visible -and $dialog.Remember.Visible -and $dialog.Form.Opacity -eq 1) 'Checked state becomes one complete consent screen'
 Dispose-Dialog $dialog;$dialog=$null

 Write-State (New-State 'verifying')
 $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show();Pump
 $script:originalReader=(Get-Command Read-CodeCodexStartupText).ScriptBlock
 $script:sharingFaults=2
 Set-Item Function:Read-CodeCodexStartupText -Value {
  param([string]$Path)
  if($script:sharingFaults -gt 0 -and $Path.EndsWith('recovery.json')){$script:sharingFaults--;throw [IO.IOException]::new('Fixture transient sharing conflict',-2147024864)}
  & $script:originalReader $Path
 }
 try {
  Pump
  Check (-not $script:recoveryReadFailed -and -not $dialog.Form.Visible) 'Short sharing conflicts do not freeze or reopen a successful background handoff'
  Write-State (New-State 'ready');Pump
  Check (-not $dialog.Form.Visible -and -not $script:recoveryReadFailed) 'Ready is still processed after transient read failures'
 }finally{Set-Item Function:Read-CodeCodexStartupText -Value $script:originalReader}
 $dialog.Timer.Dispose();$dialog.Form.Dispose();$dialog=$null

 foreach($broken in @('missing','malformed')) {
  Write-State (New-State 'verifying')
  $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show();Pump
  if($broken -eq 'missing'){Remove-Item -LiteralPath (Join-Path $root 'recovery.json') -Force}else{[IO.File]::WriteAllText((Join-Path $root 'recovery.json'),'{"schema":2}')}
  Pump
  Check ($dialog.Cancel.Enabled -and -not $dialog.Restart.Enabled -and $dialog.Reason.Text.Contains('CC-START-RECOVERY-UI-002')) ($broken+': lost channel releases Close and prevents new authorization')
  Check ($dialog.Reason.Text.Contains('ORIGINAL_DIAGNOSTIC')) ($broken+': original evidence retained on channel failure')
  Dispose-Dialog $dialog;$dialog=$null
 }

 # Replay a delayed but healthy launch through the production form. The UI
 # must never write a failure over the core's pending/ready state.
 $s=New-State 'verifying';$s.oldExited=$true;$s.relaunchStartedMs=[DateTimeOffset]::UtcNow.AddMinutes(-10).ToUnixTimeMilliseconds();Write-State $s
 $pendingBytes=[IO.File]::ReadAllText((Join-Path $root 'recovery.json'))
 $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show();Pump
 $state=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'recovery.json')))
 Check ($state.phase -ceq 'verifying' -and -not $dialog.Form.Visible) 'Aged live startup never displays a timer-generated error'
 Check ([IO.File]::ReadAllText((Join-Path $root 'recovery.json')) -ceq $pendingBytes) 'Diagnostic form cannot overwrite the core recovery state'
 $s.phase='ready';$s.diagnostic.reason='Actual same-version visible interface and Bridge ready';Write-State $s
 $readyBytes=[IO.File]::ReadAllText((Join-Path $root 'recovery.json'));Pump
 Check (-not $dialog.Form.Visible -and -not $script:recoveryBusy) 'Delayed real readiness closes the diagnostic without a failure flash'
 Check ([IO.File]::ReadAllText((Join-Path $root 'recovery.json')) -ceq $readyBytes) 'Late-ready evidence is never replaced by an obsolete UI deadline'
 $dialog.Timer.Dispose();$dialog.Form.Dispose();$dialog=$null

 Write-State (New-State 'verifying')
 $env:CLE_ERROR_OWNER_PID='2147483647'
 $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show();Pump
 Check ($dialog.Cancel.Enabled -and -not $dialog.Restart.Enabled -and $dialog.Reason.Text.Contains('CC-START-RECOVERY-CONTROLLER-001')) 'Lost startup controller releases the UI as an explicit failure'
 Dispose-Dialog $dialog;$dialog=$null;$env:CLE_ERROR_OWNER_PID=[string]$PID

 Write-State (New-State 'verifying')
 $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show();Pump
 Write-State (New-State 'ready');Pump
 Check (-not $dialog.Form.Visible) 'Verified ready closes the same diagnostic automatically'
 $dialog.Timer.Dispose();$dialog.Form.Dispose();$dialog=$null

 Remove-Item -LiteralPath (Join-Path $root 'action.json') -Force
 Write-State (New-State)
 $dialog=New-CodeCodexStartupDialog;$dialog.Form.StartPosition='Manual';$dialog.Form.Location=New-Object Drawing.Point(-12000,-12000);$dialog.Form.Show();Pump
 $dialog.Cancel.PerformClick();Pump
 $choice=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'action.json')))
 Check ($choice.action -ceq 'cancel' -and -not $choice.remember) 'Cancellation does not grant close or remembered permission'
 $dialog.Timer.Dispose();$dialog.Form.Dispose();$dialog=$null

 # Production headless consent reader: malformed/stale decisions fail closed.
 foreach($bad in @(
  '{"schema":1,"requestId":"wrong","action":"restart","remember":true}',
  '{"schema":1,"requestId":"test-identity-123","action":"restart","remember":"true"}',
  '{"schema":1,"requestId":"test-identity-123","action":"restart","remember":true,"extra":1}',
  '{"schema":1,"requestId":"test-identity-123","action":"cancel","action":"restart","remember":true}',
  ('x'*4097))) {
  Write-State (New-State);[IO.File]::WriteAllText((Join-Path $root 'action.json'),$bad)
  Reject {Wait-RestartUiDecision} 'Malformed, oversized or stale consent cannot authorize a close'
 }
 Write-State (New-State);[IO.File]::WriteAllText((Join-Path $root 'action.json'),'{"schema":1,"requestId":"test-identity-123","action":"cancel","remember":true}')
 $choice=Wait-RestartUiDecision;Check (-not $choice.Accepted -and -not $choice.Remember) 'Cancelled decision ignores a forged remember flag'
 Write-State (New-State);[IO.File]::WriteAllText((Join-Path $root 'action.json'),'{"schema":1,"requestId":"test-identity-123","action":"restart","remember":false}')
 $choice=Wait-RestartUiDecision;Check ($choice.Accepted -and -not $choice.Remember) 'Valid explicit restart leaves automatic authorization off by default'
 Write-State (New-State);Publish-RestartUiPhase 'old-exited' 'Original exited' 'Not a successful replacement yet'
 $state=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'recovery.json')))
 Check ($state.oldExited -and $state.phase -ceq 'old-exited' -and $state.relaunchStartedMs -gt 0) 'Old exit starts bounded verification but never reports ready'
 $result=@{passed=$true;checks=$checks;scope='Real shared WinForms factory and production consent reader with disposable channel only; no official process or registry changes'}
 $result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding UTF8
 Write-Output ('Unified startup recovery: '+$checks.Count+' checks passed')
} finally {
 if($null -ne $dialog){Dispose-Dialog $dialog}
 $env:CLE_RECOVERY_UI_DIRECTORY='';$env:CLE_ERROR_OWNER_PID=''
}
