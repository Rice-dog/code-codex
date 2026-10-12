[CmdletBinding()]
param([string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if (-not $OutputRoot) { $OutputRoot=Join-Path $repo 'artifacts\version-retention-tests' }
$testRoot=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$tokens=$null;$parseErrors=$null
$source=Join-Path $repo 'installer\Install-CodeCodex.ps1'
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
foreach ($name in @('Assert-CodeCodexRoot','Test-ReparsePoint','Trace-Install','Remove-CodeCodexOldVersions')) {
    $function=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    if ($function.Count -ne 1) { throw "Expected one production function $name" }
    . ([scriptblock]::Create($function[0].Extent.Text))
}
$script:InstallTrace=[Collections.Generic.List[object]]::new()
$script:InstallClock=[Diagnostics.Stopwatch]::StartNew()
$results=[Collections.Generic.List[object]]::new()
function New-Fixture([string]$Name,[string[]]$Versions=@('0.4.16','0.4.17','0.4.18','0.4.19')) {
    $root=Join-Path $testRoot $Name
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),' {"schema":1,"product":"Code-Codex"}')
    [IO.File]::WriteAllText((Join-Path $root 'current-version'),'0.4.19')
    foreach ($version in $Versions) {
        $folder=Join-Path $root ('versions\'+$version)
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        foreach ($file in @('code-codex.exe','CodeCodex.exe')) { [IO.File]::WriteAllText((Join-Path $folder $file),'fixture binary') }
    }
    return $root
}
function Check([string]$Name,[bool]$Passed,$Details) {
    $results.Add([ordered]@{name=$Name;passed=$Passed;details=$Details})
    if (-not $Passed) { throw "Failed: $Name" }
}
$root=New-Fixture 'normal'
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() }
Check 'removes all older eligible versions, keeps current and actual previous' ((@(Get-ChildItem (Join-Path $root 'versions')).Count -eq 2) -and $r.previous -eq '0.4.18' -and $r.reclaimedBytes -gt 0 -and $r.outcome -eq 'passed') $r
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.19' $true { @() }
Check 'repair is idempotent and retains closest previous version' ($r.previous -eq '0.4.18' -and $r.reclaimedBytes -eq 0) $r
$root=New-Fixture 'uncommitted'
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $false { throw 'must not query processes' }
Check 'failed or uncommitted installation never deletes versions' ((@(Get-ChildItem (Join-Path $root 'versions')).Count -eq 4) -and $r.reason -eq 'installation not committed') $r
$root=New-Fixture 'numeric-fallback' @('0.4.9','0.4.10','0.4.19')
$r=Remove-CodeCodexOldVersions $root '0.4.19' '' $true { @() }
Check 'numeric fallback prefers .10 over .9' ($r.previous -eq '0.4.10' -and -not (Test-Path (Join-Path $root 'versions\0.4.9'))) $r
$root=New-Fixture 'actual-previous'
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.16' $true { @() }
Check 'retains actual prior active version rather than newest sibling' ((Test-Path (Join-Path $root 'versions\0.4.16')) -and -not (Test-Path (Join-Path $root 'versions\0.4.18'))) $r
$root=New-Fixture 'busy'
$busyPath=Join-Path $root 'versions\0.4.16\code-codex.exe'
$processProbe={ @([pscustomobject]@{Name='code-codex.exe';ExecutablePath=$busyPath;ProcessId=101}) }.GetNewClosure()
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true $processProbe
Check 'running older version survives, other older version reclaimed' ((Test-Path (Join-Path $root 'versions\0.4.16')) -and -not (Test-Path (Join-Path $root 'versions\0.4.17')) -and $r.entries[0].processIds -contains 101) $r
$root=New-Fixture 'locked'
$locked=[IO.File]::Open((Join-Path $root 'versions\0.4.16\CodeCodex.exe'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try { $r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() } } finally { $locked.Dispose() }
Check 'a locked second binary preserves both files of that version' ((@(Get-ChildItem (Join-Path $root 'versions\0.4.16')).Count -eq 2) -and $r.outcome -eq 'partial') $r
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() }
Check 'deferred locked version is removed on a later successful pass' (-not (Test-Path (Join-Path $root 'versions\0.4.16'))) $r
$root=New-Fixture 'unknown-content'
[IO.File]::WriteAllText((Join-Path $root 'versions\0.4.16\personal.txt'),'must survive')
New-Item -ItemType Directory -Path (Join-Path $root 'versions\.staging.tmp') | Out-Null
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() }
Check 'unknown contents and non-version staging directory are untouched' ((Test-Path (Join-Path $root 'versions\0.4.16\personal.txt')) -and (Test-Path (Join-Path $root 'versions\.staging.tmp'))) $r
$root=New-Fixture 'query-failure'
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { throw 'query unavailable' }
Check 'process-query failure defers cleanup without throwing' ((@(Get-ChildItem (Join-Path $root 'versions')).Count -eq 4) -and $r.reason -eq 'query unavailable') $r
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @([pscustomobject]@{Name='CodeCodex.exe';ExecutablePath=$null;ProcessId=101}) }
Check 'uninspectable product process defers cleanup' ((@(Get-ChildItem (Join-Path $root 'versions')).Count -eq 4) -and $r.reason -like '*could not be inspected*') $r
$root=New-Fixture 'marker-mismatch'
[IO.File]::WriteAllText((Join-Path $root 'current-version'),'0.4.18')
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { throw 'must not query' }
Check 'active marker mismatch prevents cleanup' ($r.reason -like '*marker*' -and @(Get-ChildItem (Join-Path $root 'versions')).Count -eq 4) $r
$root=New-Fixture 'foreign-root'
[IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":1,"product":"Other"}')
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() }
Check 'foreign ownership is never cleaned' ($r.reason -like '*ownership*' -and @(Get-ChildItem (Join-Path $root 'versions')).Count -eq 4) $r
$root=New-Fixture 'junction'
$outside=New-Fixture 'outside' @('0.4.16')
$junction=Join-Path $root 'versions\0.4.15'
New-Item -ItemType Junction -Path $junction -Target (Join-Path $outside 'versions\0.4.16') | Out-Null
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() }
Check 'version junction is retained and target untouched' ((Test-Path (Join-Path $junction 'code-codex.exe')) -and (Test-Path (Join-Path $outside 'versions\0.4.16\code-codex.exe'))) $r
$root=New-Fixture 'future-version' @('0.4.17','0.4.18','0.4.19','0.4.20')
$r=Remove-CodeCodexOldVersions $root '0.4.19' '0.4.18' $true { @() }
Check 'future version is retained rather than treated as obsolete' ((Test-Path (Join-Path $root 'versions\0.4.20')) -and -not (Test-Path (Join-Path $root 'versions\0.4.17'))) $r
$root=New-Fixture 'downgrade' @('0.4.16','0.4.18','0.4.19')
[IO.File]::WriteAllText((Join-Path $root 'current-version'),'0.4.18')
$r=Remove-CodeCodexOldVersions $root '0.4.18' '0.4.19' $true { @() }
Check 'explicit downgrade retains the actual prior newer version' ($r.previous -eq '0.4.19' -and -not (Test-Path (Join-Path $root 'versions\0.4.16'))) $r
# Source integration check: do not silently move cleanup before the commit gate.
$text=[IO.File]::ReadAllText($source)
Check 'production call is after transaction commit and included in saved report' ($text.IndexOf('$script:VersionRetentionReport = Remove-CodeCodexOldVersions') -gt $text.IndexOf('$script:InstallCommitted = $true') -and $text.Contains('versionRetention=$script:VersionRetentionReport')) $null
$output=Join-Path $testRoot 'results.json'
[IO.File]::WriteAllText($output,(@{checks=@($results.ToArray());passed=$results.Count;fixtureRoot=$testRoot;source='production installer functions extracted by AST';powershell=$PSVersionTable.PSVersion.ToString()}|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
Write-Output "$($results.Count) retention checks passed. Evidence: $output"
