$ErrorActionPreference='Stop'
$repo = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'assert-storage-contract.ps1')
# Exercise the deployed installer copy, not only the standalone source helper.
$source = [IO.File]::ReadAllText((Join-Path $repo 'installer\Install-CodeCodex.ps1'))
$embedded = [regex]::Match($source, '(?ms)^# storage-contract:start\r?\n(.*?)^# storage-contract:end').Groups[1].Value
. ([scriptblock]::Create($embedded))
$testParent=Join-Path ([IO.Path]::GetTempPath()) ('CodeCodex-Retirement-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testParent | Out-Null
$report=[ordered]@{checks=@()}
try {
    $owned=Join-Path $testParent 'owned';New-Item -ItemType Directory -Path $owned | Out-Null
    '{"schema":1,"product":"Code-Codex"}'|Set-Content (Join-Path $owned 'storage-layout.json')
    $cache=Join-Path $owned 'data\cache\startup-video';New-Item -ItemType Directory -Path $cache -Force|Out-Null
    $media=Join-Path $owned 'data\media\startup';New-Item -ItemType Directory -Path $media -Force|Out-Null
    'derived-only'|Set-Content (Join-Path $cache 'movie');'keep-original'|Set-Content (Join-Path $media 'movie')
    $result=Remove-CodeCodexRetiredStartupCache $owned
    if($result.outcome -ne 'removed' -or (Test-Path $cache) -or (Get-Content (Join-Path $media 'movie')) -ne 'keep-original'){throw 'Scoped retirement failed'}
    $report.checks+='Owned fixed cache removed; original media preserved'
    if((Remove-CodeCodexRetiredStartupCache $owned).outcome -ne 'absent'){throw 'Second cleanup must be idempotent'}
    $report.checks+='Repeated cleanup is idempotent'
    $unowned=Join-Path $testParent 'unowned';$unownedCache=Join-Path $unowned 'data\cache\startup-video'
    New-Item -ItemType Directory -Path $unownedCache -Force|Out-Null;'keep'|Set-Content (Join-Path $unownedCache 'movie')
    if((Remove-CodeCodexRetiredStartupCache $unowned).outcome -ne 'retained' -or -not (Test-Path (Join-Path $unownedCache 'movie'))){throw 'Unowned removal was allowed'}
    $report.checks+='Unowned directory rejected without removing contents'
    New-Item -ItemType Directory -Path $cache -Force|Out-Null
    $outside=Join-Path $testParent 'outside';New-Item -ItemType Directory -Path $outside|Out-Null;'keep'|Set-Content (Join-Path $outside 'movie')
    $link=Join-Path $cache 'redirect';New-Item -ItemType Junction -Path $link -Target $outside|Out-Null
    if((Remove-CodeCodexRetiredStartupCache $owned).outcome -ne 'retained' -or -not (Test-Path (Join-Path $outside 'movie'))){throw 'Reparse child was followed'}
    $report.checks+='Reparse child rejected; outside data preserved'
    # Reproduce the missing-helper packaging error in an isolated source copy.
    $broken = Join-Path $testParent 'broken'; New-Item -ItemType Directory -Path $broken | Out-Null
    foreach ($name in @('Storage-Layout.ps1','Install-CodeCodex.ps1','Uninstall-CodeCodex.ps1','Finalize-Uninstall.ps1')) {
        Copy-Item -LiteralPath (Join-Path $repo "installer\$name") -Destination $broken
    }
    $old = [IO.File]::ReadAllText((Join-Path $broken 'Install-CodeCodex.ps1'))
    $old = $old.Replace($embedded, $embedded.Substring($embedded.IndexOf('function Get-CodeCodexRegisteredRoot')))
    [IO.File]::WriteAllText((Join-Path $broken 'Install-CodeCodex.ps1'), $old)
    $rejected = $false
    try { & (Join-Path $PSScriptRoot 'assert-storage-contract.ps1') -InstallerRoot $broken } catch { $rejected = $_.Exception.Message -like '*contract differs*' }
    if (-not $rejected) { throw 'Missing embedded helper was not rejected before packaging' }
    $report.checks+='Missing deployed helper rejected by packaging gate'
    $cleanupCall = [regex]::Match($source, '(?s)try \{\s*\$script:RetiredStartupCacheReport = Remove-CodeCodexRetiredStartupCache.*?(?=\$installedCommandLine =)').Value
    if (-not $cleanupCall) { throw 'Optional maintenance call not found' }
    $defense = & {
        function Remove-CodeCodexRetiredStartupCache { throw 'simulated maintenance failure' }
        function Trace-Install { param($Phase,$Outcome) }
        $InstallRoot=$owned
        . ([scriptblock]::Create($cleanupCall))
        $script:RetiredStartupCacheReport
    }
    if ($defense.outcome -ne 'retained' -or $defense.reason -ne 'simulated maintenance failure' -or -not $defense.originalMediaPreserved) { throw 'Optional maintenance incorrectly becomes an installation failure' }
    $report.checks+='Cleanup call failure remains nonfatal and records the precise cause'
    # Remove only this known junction, then validate every target before fixture cleanup.
    [IO.Directory]::Delete($link)
    $report.passed=$true
} finally {
    $absolute=[IO.Path]::GetFullPath($testParent);$temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if(-not $absolute.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test cleanup'}
    $queue=[Collections.Generic.Queue[string]]::new();$queue.Enqueue($absolute)
    while($queue.Count){foreach($node in Get-ChildItem -LiteralPath $queue.Dequeue() -Force){if($node.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Test cleanup reparse refusal'};if($node.PSIsContainer){$queue.Enqueue($node.FullName)}}}
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
$report|ConvertTo-Json -Depth 5
