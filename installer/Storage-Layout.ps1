# Shared install/uninstall location contract. No recursive operation follows a reparse point.
function Remove-CodeCodexRetiredStartupCache([string]$Root) {
    $report = [ordered]@{outcome='not-run';relativePath='data/cache/startup-video';removedBytes=0L;originalMediaPreserved=$true}
    try {
        $owned = Assert-CodeCodexRoot $Root -Owned
        $target = [IO.Path]::GetFullPath((Join-Path $owned 'data\cache\startup-video'))
        if (-not $target.StartsWith($owned+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Retired cache escaped the application root.' }
        $cursor = $target
        while (-not $cursor.Equals($owned,[StringComparison]::OrdinalIgnoreCase)) {
            $node = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
            if ($node -and (-not $node.PSIsContainer -or ($node.Attributes -band [IO.FileAttributes]::ReparsePoint))) { throw "Redirected retired cache ancestor refused: $cursor" }
            $cursor = Split-Path -Parent $cursor
        }
        if (-not (Test-Path -LiteralPath $target)) { $report.outcome='absent'; return $report }
        $queue = [Collections.Generic.Queue[string]]::new(); $queue.Enqueue($target)
        $count = 0
        while ($queue.Count) {
            foreach ($node in Get-ChildItem -LiteralPath $queue.Dequeue() -Force -ErrorAction Stop) {
                $count++; if ($count -gt 4096) { throw 'Retired cache enumeration budget exceeded.' }
                if ($node.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Redirected retired cache child refused: $($node.Name)" }
                if ($node.PSIsContainer) { $queue.Enqueue($node.FullName) } else { $report.removedBytes += $node.Length }
            }
        }
        # Exact absolute target and every ancestor/child have been checked above.
        Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
        $report.outcome='removed'
    } catch { $report.outcome='retained'; $report.reason=$_.Exception.Message; $report.removedBytes=0L }
    return $report
}

function Get-CodeCodexRegisteredRoot {
    $entry = Get-ItemProperty 'HKCU:\Software\CodeCodex' -ErrorAction SilentlyContinue
    if ($entry -and $entry.InstallPath) { return [string]$entry.InstallPath }
    $old = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCodex' -ErrorAction SilentlyContinue
    if ($old -and $old.InstallLocation) { return [string]$old.InstallLocation }
    if ($entry -and $entry.RetainedRoot) { return [string]$entry.RetainedRoot }
    return Join-Path $env:LOCALAPPDATA 'Programs\Code-Codex'
}

function Assert-CodeCodexRoot([string]$Root, [switch]$Owned) {
    if ($Root -notmatch '^[A-Za-z]:[\\/]' -or $Root.Contains('"') -or $Root.Contains('..') -or $Root.Length -gt 180) {
        throw 'Choose a bounded absolute folder on a local drive (no network, relative or device paths).'
    }
    $full = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if ($full.Length -le 3 -or $full.EndsWith('.') -or $full.EndsWith(' ')) { throw 'A drive root is not an application folder.' }
    foreach ($protected in @($env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA, $env:WINDIR, $env:ProgramFiles, ${env:ProgramFiles(x86)}, [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'))) {
        if ($protected -and $full.Equals([IO.Path]::GetFullPath($protected).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a dedicated Code-Codex folder, not a system or personal folder itself.' }
        if ($protected -and $protected -in @($env:WINDIR, $env:ProgramFiles, ${env:ProgramFiles(x86)}) -and $full.StartsWith($protected.TrimEnd('\')+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a user-writable folder outside Windows and Program Files.' }
    }
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))
    if (-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed) { throw 'Installation requires an available fixed local drive.' }
    $cursor = $full
    while ($cursor) {
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($item -and (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))) { throw "Linked or non-directory storage ancestor refused: $cursor" }
        $cursor = Split-Path -Parent $cursor
    }
    if ($Owned) {
        $marker = Join-Path $full 'storage-layout.json'
        $item = Get-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
        if ($item) {
            if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 4096) { throw 'Invalid or redirected storage marker; ownership refused.' }
            $layout = [IO.File]::ReadAllText($marker) | ConvertFrom-Json
            if ($layout.schema -eq 1 -and $layout.product -eq 'Code-Codex') { return $full }
            throw 'Unsupported storage marker; legacy ownership fallback refused.'
        }
        $legacy = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\Code-Codex'))
        $legacyMarker = Get-Item -LiteralPath (Join-Path $full 'install-type') -Force -ErrorAction SilentlyContinue
        if (-not $full.Equals($legacy,[StringComparison]::OrdinalIgnoreCase) -or -not $legacyMarker -or $legacyMarker.PSIsContainer -or ($legacyMarker.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Application ownership could not be verified; no files will be removed.' }
    }
    return $full
}

function Get-CodeCodexDataHash([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item -isnot [IO.FileInfo] -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Migration hash input must be a regular file: $Path"
    }
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $algorithm = $null
    try {
        $algorithm = [Security.Cryptography.SHA256]::Create()
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '')
    } finally {
        if ($algorithm) { $algorithm.Dispose() }
        $stream.Dispose()
    }
}

function Copy-CodeCodexDataTree([string]$Source, [string]$Destination) {
    $item = Get-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
    if (-not $item) { return }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Redirected migration source refused: $Source" }
    $existing = Get-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    if ($existing -and ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Redirected migration destination refused: $Destination" }
    if ($item.PSIsContainer) {
        if ($existing -and -not $existing.PSIsContainer) { throw 'Migration destination has conflicting file type.' }
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        foreach ($child in Get-ChildItem -LiteralPath $Source -Force) {
            Copy-CodeCodexDataTree $child.FullName (Join-Path $Destination $child.Name)
        }
    } else {
        if ($existing) {
            # Newer destination data wins. Keep the original source for recovery.
            $script:MigrationSkipped++
            return
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
        $stage = $Destination + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
        try {
            Copy-Item -LiteralPath $Source -Destination $stage
            if ((Get-CodeCodexDataHash $Source) -ne (Get-CodeCodexDataHash $stage)) { throw 'Migrated resource hash mismatch.' }
            [IO.File]::Move($stage, $Destination)
            $script:MigrationCopied++
        } finally { if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force } }
    }
}

function Measure-CodeCodexMigration([string]$Source, [string]$Destination) {
    $item = Get-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
    if (-not $item) { return [long]0 }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Redirected migration source refused: $Source" }
    if (-not $item.PSIsContainer) { if (Test-Path -LiteralPath $Destination) { return [long]0 }; return [long]$item.Length }
    [long]$size = 0
    foreach ($child in Get-ChildItem -LiteralPath $Source -Force) { $size += Measure-CodeCodexMigration $child.FullName (Join-Path $Destination $child.Name) }
    return $size
}

function Test-CodeCodexAtomicStorage([string]$Root, [scriptblock]$Progress = {param($phase,$status)}) {
    $full = Assert-CodeCodexRoot $Root
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { throw 'Atomic storage probe requires an existing verified directory.' }
    $prefix = Join-Path $full ('.atomic-check-' + [Guid]::NewGuid().ToString('N'))
    $source = $prefix + '.source'; $target = $prefix + '.target'; $replacement = $prefix + '.replacement'; $backup = $prefix + '.backup'
    $phase = 'create'; $failure = $null; $cleanup = @()
    try {
        & $Progress $phase 'started'
        [IO.File]::WriteAllText($source,'probe-source')
        & $Progress $phase 'passed'
        $phase = 'rename'; & $Progress $phase 'started'
        [IO.File]::Move($source,$target)
        & $Progress $phase 'passed'
        $phase = 'replace'; & $Progress $phase 'started'
        [IO.File]::WriteAllText($replacement,'probe-replacement')
        [IO.File]::Replace($replacement,$target,$backup,$true)
        if ([IO.File]::ReadAllText($target) -ne 'probe-replacement') { throw 'Atomic replacement probe content mismatch.' }
        & $Progress $phase 'passed'
    } catch { $failure = $_; & $Progress $phase 'failed' }
    finally {
        foreach ($path in @($source,$target,$replacement,$backup)) {
            try {
                # Only these four exact task-created regular nodes are eligible.
                if ([IO.Path]::GetDirectoryName($path) -ne $full) { throw 'Probe cleanup path escaped its verified root.' }
                $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
                if ($item) {
                    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Probe cleanup encountered a redirected node.' }
                    Remove-Item -LiteralPath $path -Force
                }
            } catch { $cleanup += $_.Exception.GetBaseException().Message }
        }
        & $Progress 'cleanup' $(if ($cleanup.Count) {'partial'} else {'passed'})
    }
    if ($failure) { throw [IO.IOException]::new(('Storage replacement preflight failed; phase='+$phase+'; cleanupIssues='+$cleanup.Count),$failure.Exception) }
    if ($cleanup.Count) { throw [IO.IOException]::new(('Storage probe cleanup failed: '+($cleanup -join '; '))) }
}

function Initialize-CodeCodexStorage([string]$Root) {
    $script:MigrationCopied = 0; $script:MigrationSkipped = 0
    [long]$required = 100MB
    $legacy = Join-Path $env:LOCALAPPDATA 'CodeCodex'
    foreach ($pair in @(@('settings.json','data\settings.json'),@('runtime-logs','logs\runtime'),@('diagnostics','logs\diagnostics'),@('plugin-cache\plugins','plugins'))) {
        $required += Measure-CodeCodexMigration (Join-Path $legacy $pair[0]) (Join-Path $Root $pair[1])
    }
    $previous = Get-ItemProperty 'HKCU:\Software\CodeCodex' -ErrorAction SilentlyContinue
    if ($previous -and $previous.RetainedRoot) {
        $previousRoot = Assert-CodeCodexRoot ([string]$previous.RetainedRoot) -Owned
        if (-not $Root.Equals($previousRoot,[StringComparison]::OrdinalIgnoreCase)) {
            foreach ($relative in @('data','plugins','logs','backups')) { $required += Measure-CodeCodexMigration (Join-Path $previousRoot $relative) (Join-Path $Root $relative) }
        }
    }
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Root))
    if ($drive.AvailableFreeSpace -lt $required) { throw "Insufficient space for verified migration and installation: required=$required; available=$($drive.AvailableFreeSpace)." }
    foreach ($relative in @('data','plugins','logs\runtime','logs\diagnostics','logs\install','logs\update','temp','backups')) {
        $target = Join-Path $Root $relative
        $null = Assert-CodeCodexRoot $target
        New-Item -ItemType Directory -Path $target -Force | Out-Null
    }
    # Keep private preferences and diagnostic content private even on a shared data drive.
    foreach ($relative in @('data','logs','temp','backups')) {
        $target = Join-Path $Root $relative
        $acl = [IO.Directory]::GetAccessControl($target, [Security.AccessControl.AccessControlSections]::Access)
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($existingRule in @($acl.Access)) { $null = $acl.RemoveAccessRuleSpecific($existingRule) }
        foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
            $acl.AddAccessRule($rule)
        }
        [IO.Directory]::SetAccessControl($target, $acl)
    }
    $registered = Get-ItemProperty 'HKCU:\Software\CodeCodex' -ErrorAction SilentlyContinue
    $retained = if ($registered) { [string]$registered.RetainedRoot } else { '' }
    if ($retained -and -not $Root.Equals($retained,[StringComparison]::OrdinalIgnoreCase)) {
        $retained = Assert-CodeCodexRoot $retained -Owned
        foreach ($relative in @('data','plugins','logs','backups')) {
            Copy-CodeCodexDataTree (Join-Path $retained $relative) (Join-Path $Root $relative)
        }
    }
    $old = Join-Path $env:LOCALAPPDATA 'CodeCodex'
    foreach ($pair in @(@('settings.json','data\settings.json'),@('runtime-logs','logs\runtime'),@('diagnostics','logs\diagnostics'))) {
        Copy-CodeCodexDataTree (Join-Path $old $pair[0]) (Join-Path $Root $pair[1])
    }
    $oldPlugins = Join-Path $old 'plugin-cache'
    if (Test-Path -LiteralPath $oldPlugins) {
        $null = Assert-CodeCodexRoot $oldPlugins
        foreach ($item in Get-ChildItem -LiteralPath $oldPlugins -Force) {
            if ($item.Name -eq 'plugins' -or $item.Name -match '^[a-z0-9-]+-[a-f0-9]{64}\.js$') {
                Copy-CodeCodexDataTree $item.FullName (Join-Path $Root $item.Name)
            }
        }
    }
    $report = [ordered]@{schema=1;copied=$script:MigrationCopied;preservedDestination=$script:MigrationSkipped;sourceRetained=$true;retainedRootMigrated=[bool]($retained -and -not $Root.Equals($retained,[StringComparison]::OrdinalIgnoreCase));completedAt=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText((Join-Path $Root 'backups\legacy-migration.json'),($report|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}

function Show-CodeCodexDirectoryChoice([string]$Initial, [bool]$Existing) {
    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object Windows.Forms.Form
    $form.Text='Code-Codex installation'; $form.Width=620; $form.Height=225
    $form.StartPosition='CenterScreen'; $form.FormBorderStyle='FixedDialog'; $form.MaximizeBox=$false; $form.MinimizeBox=$false; $form.TopMost=$true
    $label=New-Object Windows.Forms.Label; $label.Text=if($Existing){'Update in the existing folder. Settings, plugins and logs are preserved.'}else{'Choose one folder for Code-Codex, settings, plugins and logs.'}; $label.SetBounds(20,18,560,32); $form.Controls.Add($label)
    $box=New-Object Windows.Forms.TextBox; $box.Text=$Initial; $box.SetBounds(20,57,460,26); $box.ReadOnly=$Existing; $form.Controls.Add($box)
    $browse=New-Object Windows.Forms.Button; $browse.Text='Browse...'; $browse.SetBounds(488,55,90,30); $browse.Enabled=-not $Existing; $form.Controls.Add($browse)
    $browse.Add_Click({$dialog=New-Object Windows.Forms.FolderBrowserDialog; $dialog.Description='Select a parent folder. A dedicated Code-Codex subfolder will be created.'; if($dialog.ShowDialog() -eq 'OK'){$box.Text=Join-Path $dialog.SelectedPath 'Code-Codex'}; $dialog.Dispose()}.GetNewClosure())
    $note=New-Object Windows.Forms.Label; $note.Text='Default: current user installation on C: (no administrator rights required).'; $note.SetBounds(20,92,560,25); $form.Controls.Add($note)
    $ok=New-Object Windows.Forms.Button; $ok.Text=if($Existing){'Update'}else{'Install'}; $ok.SetBounds(388,130,90,32); $ok.DialogResult='OK'; $form.Controls.Add($ok); $form.AcceptButton=$ok
    $cancel=New-Object Windows.Forms.Button; $cancel.Text='Cancel'; $cancel.SetBounds(488,130,90,32); $cancel.DialogResult='Cancel'; $form.Controls.Add($cancel); $form.CancelButton=$cancel
    try { if($form.ShowDialog() -ne 'OK'){return $null}; return $box.Text } finally { $form.Dispose() }
}
