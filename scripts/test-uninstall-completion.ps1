[CmdletBinding()]
param([string]$OutputRoot,[string]$FinalizerPath)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(-not $OutputRoot){$OutputRoot=Join-Path $repo ('artifacts/uninstall-completion-'+[guid]::NewGuid().ToString('N'))}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\')+'\'
if(-not $OutputRoot.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $OutputRoot)){throw 'Use a new fixture folder inside repository artifacts.'}
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
if(-not $FinalizerPath){$FinalizerPath=Join-Path $repo 'installer/Finalize-Uninstall.ps1'}
$source=[IO.File]::ReadAllText($FinalizerPath)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class CodeCodexDirectoryLockFixture {
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    public static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
}
'@
$isolation=@'
function Remove-VerifiedCodeCodexDesktopShortcut {}
function New-UninstallProgressDialog { throw 'Unexpected legacy UI' }
function Show-UninstallSuccess { throw 'Unexpected success popup' }
function Show-UninstallFailure { throw 'Unexpected failure popup' }
function New-Item { param([string]$Path,[switch]$Force) if($Path -notlike 'HKCU:*'){throw 'Unexpected fixture New-Item'} }
function New-ItemProperty { param($Path,$Name,$PropertyType,$Value,[switch]$Force) if($Path -notlike 'HKCU:*'){throw 'Unexpected registry write'} }
function Remove-ItemProperty { [CmdletBinding()]param($Path,$Name) if($Path -notlike 'HKCU:*'){throw 'Unexpected registry removal'} }
function Remove-Item { [CmdletBinding()]param([string]$LiteralPath,[switch]$Force,[switch]$Recurse) if($LiteralPath -like 'HKCU:*'){return}; Microsoft.PowerShell.Management\Remove-Item @PSBoundParameters }
function Start-Sleep { param($Milliseconds) }
$script:FixtureAttempts=0
function Count-FixtureAttempt { $script:FixtureAttempts++; [IO.File]::WriteAllText($env:CLE_FIXTURE_CALLS,[string]$script:FixtureAttempts) }
'@
$results=@()
foreach($case in @('keep','purge','unknown','late-keep','late-purge','root-retry','partial-purge','first-error','unowned','invalid-marker','redirected-root','inherited-cwd','external-root-lock','root-access-denied')) {
    $dir=Join-Path $OutputRoot $case;$root=Join-Path $dir "中文 user's Code-Codex"
    New-Item -ItemType Directory -Path "$root/data","$root/plugins","$root/versions" -Force | Out-Null
    [IO.File]::WriteAllText("$root/storage-layout.json",'{"schema":1,"product":"Code-Codex"}')
    [IO.File]::WriteAllText("$root/CodeCodex-0.5.4.exe",'managed launcher')
    [IO.File]::WriteAllText("$root/versions/fixture",'managed version')
    [IO.File]::WriteAllText("$root/data/media",'private fixture')
    $sentinel=Join-Path $dir 'outside.txt';[IO.File]::WriteAllText($sentinel,'untouched')
    if($case -eq 'unknown'){[IO.File]::WriteAllText("$root/personal.txt",'personal')}
    if($case -eq 'unowned'){Remove-Item -LiteralPath "$root/storage-layout.json"}
    if($case -eq 'invalid-marker'){[IO.File]::WriteAllText("$root/storage-layout.json",'{"schema":1,"product":"Other"}')}
    if($case -eq 'redirected-root'){
        $outside=Join-Path $dir 'outside';Move-Item -LiteralPath $root -Destination $outside
        New-Item -ItemType Junction -Path $root -Target $outside | Out-Null
    }
    $body=$source;$extra=''
    if($case -in @('late-keep','late-purge','partial-purge','first-error')){
        $body=$body.Replace('function Remove-CodeCodexApplicationFiles(', 'function Remove-FixtureActualApplicationFiles(')
        $extra=switch($case){
            'first-error' { 'function Remove-CodeCodexApplicationFiles { Count-FixtureAttempt; if($script:FixtureAttempts -eq 1){throw "Fixture original sharing violation"}; throw "Fixture secondary ownership failure" }' }
            'partial-purge' { 'function Remove-CodeCodexApplicationFiles { param($Root,[switch]$Purge) Count-FixtureAttempt; Remove-FixtureActualApplicationFiles $Root; throw "Fixture protected data remains" }' }
            default { 'function Remove-CodeCodexApplicationFiles { param($Root,[switch]$Purge) Count-FixtureAttempt; Remove-FixtureActualApplicationFiles $Root -Purge:$Purge; throw "Fixture exception after completed deletion" }' }
        }
    }
    if($case -eq 'root-retry'){
        $body=$body.Replace('function Remove-CodeCodexEmptyRoot(', 'function Remove-FixtureActualEmptyRoot(')
        $extra='function Remove-CodeCodexEmptyRoot { param($Root) Count-FixtureAttempt; if($script:FixtureAttempts -eq 1){throw "Fixture empty directory temporarily busy"}; Remove-FixtureActualEmptyRoot $Root }'
    }
    if($case -eq 'root-access-denied'){
        $body=$body.Replace('function Remove-CodeCodexEmptyRoot(', 'function Remove-FixtureActualEmptyRoot(')
        $extra='function Remove-CodeCodexEmptyRoot { param($Root) Count-FixtureAttempt; throw [UnauthorizedAccessException]::new("Fixture root permission denied") }'
    }
    $runner=Join-Path $dir 'worker.ps1';$state=Join-Path $dir 'progress';$calls=Join-Path $dir 'calls'
    [IO.File]::WriteAllText($state,'0|progress|0|')
    [IO.File]::WriteAllText($runner,$body.Replace('$exitCode = 0',($isolation+"`n"+$extra+"`n`$exitCode = 0")),[Text.UTF8Encoding]::new($true))
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"
    $purge=$case -notin @('keep','late-keep')
    $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$runner+'" -InstallRoot "'+$root+'" -ParentPid 0 -SharedProgress'+$(if($purge){' -PurgeSettings'}else{''})
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
    if($case -eq 'inherited-cwd'){$info.WorkingDirectory=$root}
    $info.EnvironmentVariables['CLE_PROGRESS_STATE_PATH']=$state;$info.EnvironmentVariables['CLE_FIXTURE_CALLS']=$calls
    $directoryLock=$null
    if($case -eq 'external-root-lock'){
        $directoryLock=[CodeCodexDirectoryLockFixture]::CreateFile($root,2147483648,3,[IntPtr]::Zero,3,0x02000000,[IntPtr]::Zero)
        if($directoryLock.IsInvalid){throw 'Could not acquire real directory handle fixture'}
    }
    $p=[Diagnostics.Process]::Start($info);$err=$p.StandardError.ReadToEndAsync();$out=$p.StandardOutput.ReadToEndAsync()
    if(-not $p.WaitForExit(20000)){$p.Kill();throw "Fixture timeout: $case"}
    $stderr=$err.Result;$stdout=$out.Result;[IO.File]::WriteAllText((Join-Path $dir 'process.log'),$stdout+"`n"+$stderr)
    $count=if(Test-Path -LiteralPath $calls){[int][IO.File]::ReadAllText($calls)}else{0}
    $failure=$case -in @('partial-purge','first-error','unowned','invalid-marker','redirected-root','root-access-denied')
    $ok=if($failure){$p.ExitCode -ne 0}else{$p.ExitCode -eq 0}
    if($case -in @('late-keep','late-purge')){$ok=$ok -and $count -eq 1}
    if($case -eq 'root-retry'){$ok=$ok -and $count -eq 2 -and -not(Test-Path -LiteralPath $root)}
    if($case -eq 'first-error'){$ok=$ok -and $stderr.Contains('First failure: Fixture original sharing violation') -and $stderr.Contains('last failure: Fixture secondary ownership failure') -and $count -eq 30}
    if($case -eq 'partial-purge'){$ok=$ok -and (Test-Path -LiteralPath "$root/data/media") -and (Test-Path -LiteralPath "$root/storage-layout.json") -and $count -eq 30}
    if($case -eq 'root-access-denied'){$ok=$ok -and $stderr.Contains('Fixture root permission denied') -and (Test-Path -LiteralPath "$root/storage-layout.json") -and $count -eq 30}
    if($case -eq 'inherited-cwd'){$ok=$ok -and $stdout.Contains('CC-UNINSTALL-CWD-000')}
    if($case -in @('unowned','invalid-marker','redirected-root')){$ok=$ok -and [IO.File]::ReadAllText("$root/data/media") -eq 'private fixture'}
    if(-not $failure){
        $ok=$ok -and -not(Test-Path -LiteralPath "$root/versions") -and -not(Test-Path -LiteralPath "$root/CodeCodex-0.5.4.exe")
        if(-not $purge){$ok=$ok -and [IO.File]::ReadAllText("$root/data/media") -eq 'private fixture' -and (Test-Path -LiteralPath "$root/storage-layout.json")}
        elseif($case -eq 'unknown'){$ok=$ok -and [IO.File]::ReadAllText("$root/personal.txt") -eq 'personal' -and -not(Test-Path -LiteralPath "$root/storage-layout.json")}
        elseif($case -eq 'external-root-lock'){$ok=$ok -and (Test-Path -LiteralPath $root) -and @(Get-ChildItem -LiteralPath $root -Force).Count -eq 0 -and $stdout.Contains('CC-UNINSTALL-ROOT-001')}
        else{$ok=$ok -and -not(Test-Path -LiteralPath $root)}
    }
    $ok=$ok -and [IO.File]::ReadAllText($sentinel) -eq 'untouched'
    if($directoryLock){$directoryLock.Dispose()}
    $results+=@{case=$case;passed=[bool]$ok;exitCode=$p.ExitCode;attempts=$count;registryAndDesktop='isolated';filesystem='production worker with documented fault injection'}
}
$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputRoot 'results.json') -Encoding UTF8
$failed=@($results|Where-Object {-not $_.passed})
if($failed.Count){throw ('Uninstall completion cases failed: '+(($failed|ForEach-Object case)-join ', '))}
Write-Output "Uninstall completion: $($results.Count) cases passed in Windows PowerShell5.1."
