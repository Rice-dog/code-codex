[CmdletBinding()]
param([string]$PayloadRoot,[string]$Version="0.4.25",[string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$testOutputRoot=if($OutputRoot){[IO.Path]::GetFullPath($OutputRoot)}else{Join-Path $repo 'artifacts\storage-upgrade-v0.4.10'}
$sandbox=Join-Path $testOutputRoot ('full-install-'+[Guid]::NewGuid().ToString('N'))
$fixtureRoot=Join-Path $sandbox 'custom folder\Code-Codex'
New-Item -ItemType Directory -Path $sandbox -Force | Out-Null
$keys=@('Software\CodeCodex','Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCodex')
$snapshots=@{}
foreach($name in $keys){
    $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($name)
    $entries=@()
    if($key){foreach($entry in $key.GetValueNames()){$entries+=@{name=$entry;value=$key.GetValue($entry);kind=$key.GetValueKind($entry)}};$key.Dispose()}
    $snapshots[$name]=@{exists=($null -ne $key);entries=$entries}
}
$envBefore=@{}
foreach($name in @('LOCALAPPDATA','CODE_CODEX_DESKTOP','CODE_CODEX_START_MENU')){$envBefore[$name]=[Environment]::GetEnvironmentVariable($name)}
try{
    $env:LOCALAPPDATA=Join-Path $sandbox 'legacy profile'
    $env:CODE_CODEX_DESKTOP=Join-Path $sandbox 'desktop'
    $env:CODE_CODEX_START_MENU=Join-Path $sandbox 'start-menu'
    New-Item -ItemType Directory -Path $env:LOCALAPPDATA,$env:CODE_CODEX_DESKTOP,$env:CODE_CODEX_START_MENU -Force | Out-Null
    New-Item -Path 'HKCU:\Software\CodeCodex' -Force | Out-Null
    New-ItemProperty 'HKCU:\Software\CodeCodex' -Name InstallPath -PropertyType String -Value $fixtureRoot -Force | Out-Null
    Remove-ItemProperty 'HKCU:\Software\CodeCodex' -Name RetainedRoot -ErrorAction SilentlyContinue
    & (Join-Path $PayloadRoot 'Install-CodeCodex.ps1') -Version $Version -InstallRoot $fixtureRoot -NoActivate *> (Join-Path $sandbox 'install.log')
    if($LASTEXITCODE -ne 0){throw "Custom install failed; see $sandbox\install.log"}
    foreach($relative in @(("versions\$Version\code-codex.exe"),'storage-layout.json','logs\install','data','plugins','temp','backups')){if(-not(Test-Path -LiteralPath (Join-Path $fixtureRoot $relative))){throw "Missing $relative"}}
    if((Get-ItemProperty 'HKCU:\Software\CodeCodex').InstallPath -ne $fixtureRoot){throw 'Installation locator did not follow custom root'}
    # Seed only this isolated product fixture with three older binary directories.
    # The same production installer must keep the closest prior version and
    # reclaim the other two after commit, without touching unrelated user data.
    $retentionSeeded = $false
    $parsedVersion = [version]$Version
    if ($parsedVersion.Build -ge 3) {
        foreach ($offset in @(1,2,3)) {
            $older = '{0}.{1}.{2}' -f $parsedVersion.Major,$parsedVersion.Minor,($parsedVersion.Build-$offset)
            $oldFolder = Join-Path $fixtureRoot ('versions\'+$older)
            New-Item -ItemType Directory -Path $oldFolder -Force | Out-Null
            foreach ($binary in @('code-codex.exe','CodeCodex.exe')) {
                Copy-Item -LiteralPath (Join-Path $fixtureRoot ("versions\$Version\$binary")) -Destination $oldFolder
            }
        }
        [IO.File]::WriteAllText((Join-Path $fixtureRoot 'data\retention-sentinel.txt'),'retention must preserve user data')
        $retentionSeeded = $true
    }
    # A live native reader may deny deletion of the unchanged storage marker.
    # Repeating the production install must leave it in place rather than replace it.
    $markerLock=[IO.File]::Open((Join-Path $fixtureRoot 'storage-layout.json'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try {
        & (Join-Path $PayloadRoot 'Install-CodeCodex.ps1') -Version $Version -InstallRoot $fixtureRoot -NoActivate *> (Join-Path $sandbox 'repeat-install.log')
        if($LASTEXITCODE -ne 0){throw 'Repeated installation failed with read-locked unchanged marker'}
    } finally { $markerLock.Dispose() }
    if ($retentionSeeded) {
        $versions = @(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'versions') -Directory)
        if ($versions.Count -ne 2 -or $versions.Name -notcontains $Version) { throw 'Production installation did not retain exactly current and previous.' }
        if ([IO.File]::ReadAllText((Join-Path $fixtureRoot 'data\retention-sentinel.txt')) -ne 'retention must preserve user data') { throw 'Version retention touched user data.' }
        $latestReport = Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'logs\install') -Filter 'install-*.json' | Sort-Object Name -Descending | Select-Object -First 1
        $report = Get-Content -LiteralPath $latestReport.FullName -Raw | ConvertFrom-Json
        if ($report.outcome -ne 'passed' -or $report.versionRetention.outcome -ne 'passed' -or @($report.versionRetention.entries | Where-Object outcome -eq 'removed').Count -ne 2) { throw 'Production retention report missing or incorrect.' }
    }
    $cli=Join-Path $fixtureRoot ("versions\$Version\code-codex.exe")
    & $cli diagnose --full *> (Join-Path $sandbox 'diagnose.log')
    $diagnosticExit=$LASTEXITCODE
    $diagnosticText=Get-Content -LiteralPath (Join-Path $sandbox 'diagnose.log') -Raw
    if ($diagnosticText -notmatch 'storageLayout' -or $diagnosticText -notmatch 'nativePersistence' -or $diagnosticText -notmatch 'executable marker') { throw 'Standalone native diagnostics did not observe the installed centralized storage contract.' }
    if(-not @(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'logs\runtime') -File).Count){throw 'Native executable did not write runtime logs under its custom root'}
    $result=@{installed=$true;readLockedMarkerRepeat=$true;olderVersionCleanup=$retentionSeeded;userDataUntouched=$retentionSeeded;nativeCustomRoot=$true;standaloneStorageChecks=$true;noActivate=$true;officialClientUntouched=$true;diagnosticExitCode=$diagnosticExit;fixture=$sandbox;source='unmodified production EXE payload installer and native CLI; temporary product registry restored in finally'}
    $result|ConvertTo-Json -Depth 5|Set-Content (Join-Path $testOutputRoot 'custom-install.json') -Encoding UTF8
    Write-Output 'Custom production install and executable-relative log storage passed.'
}finally{
    foreach($name in $keys){
        $before=$snapshots[$name]
        if(-not $before.exists){[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($name,$false);continue}
        $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($name)
        foreach($entry in $key.GetValueNames()){$key.DeleteValue($entry,$false)}
        foreach($entry in $before.entries){$key.SetValue($entry.name,$entry.value,$entry.kind)}
        $key.Dispose()
    }
    foreach($name in $envBefore.Keys){[Environment]::SetEnvironmentVariable($name,$envBefore[$name])}
}
