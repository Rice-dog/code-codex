function Save-CodeCodexInstallReport([string]$Outcome) {
    try {
        $owned = $false
        if ($script:StorageSnapshotTaken -and (Test-Path -LiteralPath (Join-Path $InstallRoot 'storage-layout.json') -PathType Leaf)) {
            try { $null=Assert-CodeCodexRoot $InstallRoot -Owned; $owned=$true } catch { $owned=$false }
        }
        $folder = if ($owned) { Join-Path $InstallRoot 'logs\install' } else { Join-Path $env:TEMP 'CodeCodex\logs\install' }
        $null = Assert-CodeCodexRoot $folder
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        $report=[ordered]@{schema=1;version=$Version;outcome=$Outcome;timeline=@($script:InstallTrace.ToArray());migrationCopied=$script:MigrationCopied;migrationSkipped=$script:MigrationSkipped;rollbackIssues=@($script:CleanupIssues);rollback=$script:RollbackReport;activation=$script:ActivationReport;versionRetention=$script:VersionRetentionReport;retiredStartupCache=$script:RetiredStartupCacheReport;uiLanguage=[ordered]@{requested=$UiLanguage;before=$script:LanguageBefore;committed=$script:LanguageCommitted}}
        $path=Join-Path $folder ('install-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')+'-'+$PID+'.json')
        [IO.File]::WriteAllText($path,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
        Get-ChildItem -LiteralPath $folder -Filter 'install-*.json' -File | Sort-Object Name -Descending | Select-Object -Skip 10 | ForEach-Object { if(-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)){Remove-Item -LiteralPath $_.FullName -Force} }
    } catch { Write-Warning ('Install report could not be saved: '+$_.Exception.Message) }
}

# Cleanup is a post-commit maintenance action, never part of rollback. Unknown
# files and busy versions are retained; no recursive delete follows a directory.
function Remove-CodeCodexOldVersions([string]$Root, [string]$Current, [string]$Previous, [bool]$Committed,
    [scriptblock]$Processes = { Get-CimInstance Win32_Process -OperationTimeoutSec 3 -ErrorAction Stop | Select-Object Name,ExecutablePath,ProcessId }) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $report = [ordered]@{policy='current-and-previous';current=$Current;previous=$null;outcome='skipped';reason=$null;reclaimedBytes=0L;entries=@();durationMs=0L}
    Trace-Install 'Version retention' 'started'
    try {
        if (-not $Committed) { $report.reason='installation not committed'; return $report }
        $pattern = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
        if ($Current -notmatch $pattern -or $Current.Length -gt 32) { throw 'Invalid current version.' }
        $full = Assert-CodeCodexRoot $Root -Owned
        $marker = Get-Item -LiteralPath (Join-Path $full 'current-version') -Force -ErrorAction Stop
        if ($marker.PSIsContainer -or (Test-ReparsePoint $marker) -or $marker.Length -gt 64 -or
            ([IO.File]::ReadAllText($marker.FullName)).Trim() -ne $Current) { throw 'Active version marker does not match the committed installation.' }
        $versions = Join-Path $full 'versions'
        $null = Assert-CodeCodexRoot $versions
        $directories = @(Get-ChildItem -LiteralPath $versions -Force -ErrorAction Stop)
        $currentDirectory = Get-Item -LiteralPath (Join-Path $versions $Current) -Force -ErrorAction Stop
        if (-not $currentDirectory.PSIsContainer -or (Test-ReparsePoint $currentDirectory)) { throw 'Invalid current version directory.' }
        foreach ($binary in @('code-codex.exe','CodeCodex.exe')) {
            $currentFile = Get-Item -LiteralPath (Join-Path $currentDirectory.FullName $binary) -Force -ErrorAction Stop
            if ($currentFile.PSIsContainer -or (Test-ReparsePoint $currentFile)) { throw 'Invalid current version binary.' }
        }
        $eligible = @($directories | Where-Object { $_.PSIsContainer -and -not (Test-ReparsePoint $_) -and $_.Name.Length -le 32 -and $_.Name -match $pattern -and $null -ne ($_.Name -as [version]) })
        # Keep the actual version that was active before this update, including
        # an explicit downgrade. Repair installs fall back to the nearest older version.
        $previousName = if ($Previous) { $Previous.Trim() } else { '' }
        if ($previousName -ne $Current -and $previousName -match $pattern -and $eligible.Name -contains $previousName) {
            $report.previous = $previousName
        } else {
            $fallback = @($eligible | Where-Object { [version]$_.Name -lt [version]$Current } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1)
            if ($fallback.Count) { $report.previous = $fallback[0].Name }
        }
        $candidates = @($directories | Where-Object { $_.Name -ne $Current -and $_.Name -ne $report.previous })
        if (-not $candidates.Count) { $report.outcome='passed'; return $report }
        # An unavailable executable path for a product process is not proof that
        # it is idle. Fail closed, rather than kill processes to reclaim space.
        $snapshot = @(& $Processes)
        if (@($snapshot | Where-Object { $_.Name -in @('code-codex.exe','CodeCodex.exe','code-codex-launcher.exe') -and -not $_.ExecutablePath }).Count) {
            throw 'A Code-Codex process executable path could not be inspected.'
        }
        foreach ($directory in $candidates) {
            $entry = [ordered]@{version=$directory.Name;outcome='retained';phase='directory verification';reason=$null;errorType=$null;hresult=$null;bytes=0L;removedBytes=0L;processIds=@()}
            $handles = [Collections.Generic.List[IDisposable]]::new()
            try {
                $candidate = [IO.Path]::GetFullPath($directory.FullName)
                if ([IO.Path]::GetDirectoryName($candidate) -ne $versions -or -not $directory.PSIsContainer -or
                    (Test-ReparsePoint $directory) -or $directory.Name -notmatch $pattern -or $null -eq ($directory.Name -as [version])) {
                    throw 'Unknown or redirected version entry.'
                }
                if ([version]$directory.Name -gt [version]$Current) { throw 'A newer version is not an older-version cleanup candidate.' }
                $null = Assert-CodeCodexRoot $candidate
                $children = @(Get-ChildItem -LiteralPath $candidate -Force -ErrorAction Stop)
                if ($children.Count -ne 2 -or @($children | Where-Object { $_.PSIsContainer -or (Test-ReparsePoint $_) -or $_.Name -notin @('code-codex.exe','CodeCodex.exe') }).Count) {
                    throw 'Version directory has additional, missing or redirected files.'
                }
                $entry.phase='process check'
                $active = @($snapshot | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($candidate+'\',[StringComparison]::OrdinalIgnoreCase) })
                if ($active.Count) { $entry.processIds=@($active.ProcessId); throw 'Version is still used by a running process.' }
                # Hold both binaries against new readers/executions before removing
                # either one. FileShare.Delete permits this maintenance delete only.
                $entry.phase='lock binaries'
                foreach ($child in $children) {
                    $handles.Add([IO.File]::Open($child.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Delete))
                    $entry.bytes += $child.Length
                }
                $entry.phase='delete binaries'
                foreach ($child in $children) {
                    [IO.File]::Delete($child.FullName)
                    $report.reclaimedBytes += $child.Length
                    $entry.removedBytes += $child.Length
                }
                foreach ($handle in $handles) { $handle.Dispose() }; $handles.Clear()
                $entry.phase='remove empty directory'
                [IO.Directory]::Delete($candidate, $false)
                $entry.outcome='removed'
            } catch {
                $entry.reason=$_.Exception.GetBaseException().Message
                $entry.errorType=$_.Exception.GetBaseException().GetType().FullName
                $entry.hresult=$_.Exception.GetBaseException().HResult
                if ($entry.removedBytes) { $entry.outcome='partial' }
            } finally {
                foreach ($handle in $handles) { $handle.Dispose() }
                $report.entries += $entry
                Trace-Install ('Version retention '+$directory.Name) $entry.outcome
            }
        }
        $report.outcome = if (@($report.entries | Where-Object outcome -ne 'removed').Count) { 'partial' } else { 'passed' }
    } catch {
        $report.reason=$_.Exception.GetBaseException().Message
    } finally {
        $report.durationMs=$clock.ElapsedMilliseconds
        Trace-Install 'Version retention' $report.outcome
    }
    return $report
}
