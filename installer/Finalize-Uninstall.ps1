[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$InstallRoot,
    [Parameter(Mandatory)]
    [int]$ParentPid,
    [int]$LauncherPid = 0,
    [string]$MsiProductCode,
    [switch]$PurgeSettings
)

# storage-contract:start
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
# storage-contract:end

$ErrorActionPreference = "Stop"
$InstallFullPath = Assert-CodeCodexRoot $InstallRoot -Owned
$InstallPrefix = $InstallFullPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$ShortcutOwnerMarker = "Managed by Code-Codex (code-codex/v1)"
$LegacyShortcutDescription = "Launch Codex Desktop with Code-Codex file preview and editing"

function Test-ReparsePoint([IO.FileSystemInfo]$Item) {
    return ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

function Get-ExistingItem([string]$Path) {
    return Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Remove-ReparsePoint([IO.FileSystemInfo]$Item) {
    if ($Item.PSIsContainer) {
        [IO.Directory]::Delete($Item.FullName, $false)
    }
    else {
        [IO.File]::Delete($Item.FullName)
    }
}

function Test-SamePath([string]$Left, [string]$Right) {
    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
        return $false
    }
    try {
        $leftFull = [IO.Path]::GetFullPath($Left).TrimEnd(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        )
        $rightFull = [IO.Path]::GetFullPath($Right).TrimEnd(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        )
        return $leftFull.Equals($rightFull, [StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}

function Remove-VerifiedCodeCodexDesktopShortcut {
    $desktop = [Environment]::GetEnvironmentVariable("CODE_CODEX_DESKTOP")
    if ([string]::IsNullOrWhiteSpace($desktop)) {
        $desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    }
    if ([string]::IsNullOrWhiteSpace($desktop)) { return }

    $shortcutPath = Join-Path $desktop "Code-Codex.lnk"
    $shortcutItem = Get-ExistingItem $shortcutPath
    if ($null -eq $shortcutItem) { return }
    if ($shortcutItem.PSIsContainer -or (Test-ReparsePoint $shortcutItem)) { return }

    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $targetPath = [string]$shortcut.TargetPath
        $description = [string]$shortcut.Description
        if ([string]::IsNullOrWhiteSpace($targetPath)) { return }

        $targetFullPath = [IO.Path]::GetFullPath($targetPath)
        $expectedLauncher = Join-Path $InstallFullPath "CodeCodex.exe"
        $ownedTarget = (Test-SamePath $targetFullPath $expectedLauncher) -or
            $targetFullPath.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)
        $ownedDescription = $description -eq $ShortcutOwnerMarker -or
            $description -eq $LegacyShortcutDescription

        if ($ownedTarget -and $ownedDescription) {
            $shortcutItem.Attributes = [IO.FileAttributes]::Normal
            [IO.File]::Delete($shortcutPath)
        }
    }
    catch {
        return
    }
}

function Assert-AllowedUninstallPath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($fullPath -ne $InstallFullPath -and
        -not $fullPath.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe uninstall path."
    }
}

$ApplicationEntries = @('versions','integration','docs','CodeCodex.exe','CodeCodex.Shortcut.exe','Uninstall-CodeCodex.exe','Uninstall-CodeCodex.ps1','Finalize-Uninstall.ps1','CodeCodex.Brand.png','Codex.ico','current-version','install-type','README.md','README.en.md','LICENSE','THIRD_PARTY_NOTICES_EN.md','THIRD_PARTY_NOTICES_ZH_CN.md','THIRD_PARTY_LICENSES.txt','sbom.spdx.json')
function Test-CodeCodexApplicationFiles([string]$Root) {
    foreach($name in $ApplicationEntries){if(Test-Path -LiteralPath (Join-Path $Root $name)){return $true}}
    return $false
}
function Remove-CodeCodexApplicationFiles([string]$Root,[switch]$Purge) {
    $full = Assert-CodeCodexRoot $Root -Owned
    $names = @($ApplicationEntries)
    if($Purge){$names+=@('data','plugins','logs','temp','backups')}
    foreach($name in $names){
        $target=[IO.Path]::GetFullPath((Join-Path $full $name))
        if(-not $target.StartsWith($full+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Removal target escaped the application root.'}
        Remove-SafeTree $target
    }
    if($Purge){ Remove-SafeTree (Join-Path $full 'storage-layout.json') }
    if((Test-Path -LiteralPath $full) -and @(Get-ChildItem -LiteralPath $full -Force).Count -eq 0){[IO.Directory]::Delete($full,$false)}
}

function Remove-SafeTree([string]$Root) {
    $rootFull = [IO.Path]::GetFullPath($Root)
    Assert-AllowedUninstallPath $rootFull
    $rootItem = Get-ExistingItem $rootFull
    if ($null -eq $rootItem) { return }
    if (Test-ReparsePoint $rootItem) {
        Remove-ReparsePoint $rootItem
        return
    }
    if (-not $rootItem.PSIsContainer) {
        $rootItem.Attributes = [IO.FileAttributes]::Normal
        [IO.File]::Delete($rootFull)
        return
    }

    $prefix = $rootFull.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($child in @(Get-ChildItem -LiteralPath $rootFull -Force)) {
        $childFull = [IO.Path]::GetFullPath($child.FullName)
        if (-not $childFull.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not $childFull.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe uninstall child path."
        }
        $currentChild = Get-Item -LiteralPath $childFull -Force
        if (Test-ReparsePoint $currentChild) {
            Remove-ReparsePoint $currentChild
        }
        elseif (-not $currentChild.PSIsContainer) {
            $currentChild.Attributes = [IO.FileAttributes]::Normal
            [IO.File]::Delete($childFull)
        }
        else {
            Remove-SafeTree $childFull
        }
    }

    $verifiedRoot = Get-ExistingItem $rootFull
    if ($null -eq $verifiedRoot) { return }
    if (Test-ReparsePoint $verifiedRoot) {
        Remove-ReparsePoint $verifiedRoot
        return
    }
    if (-not $verifiedRoot.PSIsContainer -or @(Get-ChildItem -LiteralPath $rootFull -Force).Count -ne 0) {
        throw "The uninstall directory changed while it was being removed."
    }
    [IO.Directory]::Delete($rootFull, $false)
}

function Wait-ForProcessExit([int]$ProcessId, [string]$Description, [object]$Dialog) {
    if ($ProcessId -le 0) { return }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        if ([DateTime]::UtcNow -ge $deadline) {
            throw "$Description did not exit before the uninstall timeout."
        }
        Invoke-UninstallProgressEvents $Dialog
        Start-Sleep -Milliseconds 100
    }
}

function New-UninstallProgressDialog {
    $form = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $form = New-Object System.Windows.Forms.Form
        $form.Text = "Code-Codex uninstall"
        $form.ClientSize = New-Object System.Drawing.Size(460, 220)
        $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
        $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
        $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false
        $form.ControlBox = $false
        $form.ShowInTaskbar = $true
        $form.TopMost = $true
        $form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
        $form.BackColor = [System.Drawing.Color]::White

        $versionPath = Join-Path $InstallFullPath 'current-version'
        try {
            $versionItem = Get-ExistingItem $versionPath
            if ($versionItem -is [IO.FileInfo] -and -not (Test-ReparsePoint $versionItem)) {
                $installedVersion = [IO.File]::ReadAllText($versionPath).Trim()
                if ($installedVersion -match '^[0-9]+\.[0-9]+\.[0-9]+$' -and $installedVersion.Length -le 32) {
                    $form.Text = 'Code-Codex uninstall v' + $installedVersion
                }
            }
        }
        catch {} # An unreadable version marker must not block removal.

        $brandIcon = New-Object System.Windows.Forms.PictureBox
        $brandIcon.Location = New-Object System.Drawing.Point(188, 14)
        $brandIcon.Size = New-Object System.Drawing.Size(84, 84)
        $brandIcon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
        $brandIcon.BackColor = [System.Drawing.Color]::White
        $brandIconPath = Join-Path $InstallFullPath 'CodeCodex.Brand.png'
        $brandIconItem = Get-ExistingItem $brandIconPath
        if ($brandIconItem -is [IO.FileInfo] -and -not (Test-ReparsePoint $brandIconItem)) {
            try {
                $sourceImage = [System.Drawing.Image]::FromFile($brandIconPath)
                try { $brandIcon.Image = [System.Drawing.Bitmap]::new($sourceImage) }
                finally { $sourceImage.Dispose() }
            }
            catch {}
        }
        $uninstallerPath = Join-Path $InstallFullPath 'Uninstall-CodeCodex.exe'
        $uninstallerItem = Get-ExistingItem $uninstallerPath
        if ($uninstallerItem -is [IO.FileInfo] -and -not (Test-ReparsePoint $uninstallerItem)) {
            try {
                $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($uninstallerPath)
                if ($null -eq $brandIcon.Image) {
                    $brandIcon.Image = $form.Icon.ToBitmap()
                }
            }
            catch {}
        }

        $label = New-Object System.Windows.Forms.Label
        $label.AutoSize = $false
        $label.Location = New-Object System.Drawing.Point(20, 113)
        $label.Size = New-Object System.Drawing.Size(420, 24)
        $label.Text = "Preparing Code-Codex removal..."
        $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft

        $detail = New-Object System.Windows.Forms.Label
        $detail.Location = New-Object System.Drawing.Point(20, 140)
        $detail.Size = New-Object System.Drawing.Size(420, 28)
        $detail.ForeColor = [System.Drawing.SystemColors]::GrayText
        $detail.AutoEllipsis = $true

        $progressBar = New-Object System.Windows.Forms.ProgressBar
        $progressBar.Location = New-Object System.Drawing.Point(20, 177)
        $progressBar.Size = New-Object System.Drawing.Size(420, 22)
        $progressBar.Minimum = 0
        $progressBar.Maximum = 100
        $progressBar.Value = 55

        $form.Controls.Add($brandIcon)
        $form.Controls.Add($label)
        $form.Controls.Add($detail)
        $form.Controls.Add($progressBar)
        $form.Show()
        $form.Activate()
        $form.BringToFront()
        [System.Windows.Forms.Application]::DoEvents()

        return [PSCustomObject]@{
            Form = $form
            BrandIcon = $brandIcon
            Label = $label
            Detail = $detail
            ProgressBar = $progressBar
        }
    }
    catch {
        if ($null -ne $form) {
            try { $form.Close() } catch {}
            try { $form.Dispose() } catch {}
        }
        return $null
    }
}

function Set-UninstallProgress(
    [object]$Dialog,
    [int]$Value,
    [string]$Stage,
    [string]$Detail,
    [switch]$Indeterminate
) {
    if ($null -eq $Dialog) { return }
    try {
        if ($Dialog.Form.IsDisposed) { return }
        $Dialog.Label.Text = $Stage
        $Dialog.Detail.Text = $Detail
        if ($Indeterminate) {
            $Dialog.ProgressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
            $Dialog.ProgressBar.MarqueeAnimationSpeed = 30
        }
        else {
            $Dialog.ProgressBar.MarqueeAnimationSpeed = 0
            $Dialog.ProgressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
            $Dialog.ProgressBar.Value = [Math]::Max(0, [Math]::Min(100, $Value))
        }
        Invoke-UninstallProgressEvents $Dialog
    }
    catch {}
}

function Invoke-UninstallProgressEvents([object]$Dialog) {
    if ($null -eq $Dialog) { return }
    try {
        if (-not $Dialog.Form.IsDisposed) {
            $Dialog.Form.TopMost = $true
            [System.Windows.Forms.Application]::DoEvents()
        }
    }
    catch {}
}

function Complete-UninstallProgress([object]$Dialog) {
    Set-UninstallProgress $Dialog 100 "Uninstallation complete" "Code-Codex was removed successfully."
}

function Close-UninstallProgress([object]$Dialog) {
    if ($null -eq $Dialog) { return }
    try {
        if (-not $Dialog.Form.IsDisposed) {
            $Dialog.Form.Close()
        }
    }
    catch {}
    try { $Dialog.Form.Dispose() } catch {}
}

function Show-TopmostMessage(
    [string]$Message,
    [string]$Caption,
    [uint32]$IconFlag
) {
    $owner = $null
    try {
        if ($null -eq ("CodeCodex.FinalizeUninstallNativeMethods" -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CodeCodex
{
    public static class FinalizeUninstallNativeMethods
    {
        private const int WhCbt = 5;
        private const int HcbtActivate = 5;
        private const uint MonitorDefaultToNearest = 2;
        private const uint SwpNoSize = 0x0001;
        private const uint SwpNoMove = 0x0002;
        private const uint SwpShowWindow = 0x0040;
        private static readonly IntPtr HwndTopmost = new IntPtr(-1);

        private delegate IntPtr HookProcedure(int code, IntPtr wParam, IntPtr lParam);
        private delegate void TimerProcedure(IntPtr window, uint message, UIntPtr timerId, uint time);

        [StructLayout(LayoutKind.Sequential)]
        private struct Point
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct Rectangle
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MonitorInformation
        {
            public int Size;
            public Rectangle Monitor;
            public Rectangle WorkArea;
            public uint Flags;
        }

        private static HookProcedure hookProcedure;
        private static IntPtr hookHandle;
        private static Rectangle targetWorkArea;
        private static bool hasTargetWorkArea;
        private static TimerProcedure activationTimerProcedure;
        private static IntPtr activationWindow;
        private static UIntPtr activationTimerId;
        private static int activationAttempts;

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int MessageBoxW(
            IntPtr hWnd,
            string text,
            string caption,
            uint type);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookExW(
            int hookType,
            HookProcedure procedure,
            IntPtr module,
            uint threadId);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnhookWindowsHookEx(IntPtr hook);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(
            IntPtr hook,
            int code,
            IntPtr wParam,
            IntPtr lParam);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out Point point);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromPoint(Point point, uint flags);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool GetMonitorInfoW(
            IntPtr monitor,
            ref MonitorInformation information);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr window, out Rectangle rectangle);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(
            IntPtr window,
            IntPtr insertAfter,
            int x,
            int y,
            int width,
            int height,
            uint flags);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr window);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr window);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(
            uint attachThread,
            uint attachToThread,
            bool attach);

        [DllImport("user32.dll")]
        private static extern IntPtr SetActiveWindow(IntPtr window);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern UIntPtr SetTimer(
            IntPtr window,
            UIntPtr timerId,
            uint interval,
            TimerProcedure procedure);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool KillTimer(IntPtr window, UIntPtr timerId);

        public static int ShowCenteredTopmost(
            IntPtr owner,
            string message,
            string caption,
            uint type)
        {
            CaptureTargetWorkArea(owner);
            hookProcedure = PositionMessageBox;
            hookHandle = SetWindowsHookExW(
                WhCbt,
                hookProcedure,
                IntPtr.Zero,
                GetCurrentThreadId());

            try
            {
                return MessageBoxW(owner, message, caption, type);
            }
            finally
            {
                if (hookHandle != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(hookHandle);
                    hookHandle = IntPtr.Zero;
                }
                hookProcedure = null;
                hasTargetWorkArea = false;
                StopActivationRetry();
            }
        }

        private static void CaptureTargetWorkArea(IntPtr owner)
        {
            IntPtr monitor = owner == IntPtr.Zero
                ? IntPtr.Zero
                : MonitorFromWindow(owner, MonitorDefaultToNearest);
            if (monitor == IntPtr.Zero)
            {
                IntPtr foregroundWindow = GetForegroundWindow();
                if (foregroundWindow != IntPtr.Zero)
                {
                    monitor = MonitorFromWindow(foregroundWindow, MonitorDefaultToNearest);
                }
            }
            if (monitor == IntPtr.Zero)
            {
                Point cursor;
                if (GetCursorPos(out cursor))
                {
                    monitor = MonitorFromPoint(cursor, MonitorDefaultToNearest);
                }
            }

            MonitorInformation information = new MonitorInformation();
            information.Size = Marshal.SizeOf(typeof(MonitorInformation));
            hasTargetWorkArea = monitor != IntPtr.Zero &&
                GetMonitorInfoW(monitor, ref information);
            if (hasTargetWorkArea)
            {
                targetWorkArea = information.WorkArea;
            }
        }

        private static IntPtr PositionMessageBox(int code, IntPtr wParam, IntPtr lParam)
        {
            IntPtr currentHook = hookHandle;
            if (code == HcbtActivate)
            {
                PositionWindow(wParam);
                IntPtr result = CallNextHookEx(currentHook, code, wParam, lParam);
                if (currentHook != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(currentHook);
                    hookHandle = IntPtr.Zero;
                }
                return result;
            }
            return CallNextHookEx(currentHook, code, wParam, lParam);
        }

        private static void PositionWindow(IntPtr window)
        {
            Rectangle rectangle;
            if (!hasTargetWorkArea || !GetWindowRect(window, out rectangle))
            {
                return;
            }

            int width = rectangle.Right - rectangle.Left;
            int height = rectangle.Bottom - rectangle.Top;
            int workWidth = targetWorkArea.Right - targetWorkArea.Left;
            int workHeight = targetWorkArea.Bottom - targetWorkArea.Top;
            int x = targetWorkArea.Left + Math.Max(0, (workWidth - width) / 2);
            int y = targetWorkArea.Top + Math.Max(0, (workHeight - height) / 2);
            x = Math.Min(x, Math.Max(targetWorkArea.Left, targetWorkArea.Right - width));
            y = Math.Min(y, Math.Max(targetWorkArea.Top, targetWorkArea.Bottom - height));

            SetWindowPos(
                window,
                HwndTopmost,
                x,
                y,
                0,
                0,
                SwpNoSize | SwpShowWindow);
            ForceForeground(window);
            if (GetForegroundWindow() != window)
            {
                StartActivationRetry(window);
            }
        }

        private static void StartActivationRetry(IntPtr window)
        {
            StopActivationRetry();
            activationWindow = window;
            activationAttempts = 0;
            activationTimerProcedure = RetryActivation;
            activationTimerId = SetTimer(
                window,
                new UIntPtr(0xC0DE),
                100,
                activationTimerProcedure);
            if (activationTimerId == UIntPtr.Zero)
            {
                activationTimerProcedure = null;
                activationWindow = IntPtr.Zero;
            }
        }

        private static void RetryActivation(
            IntPtr window,
            uint message,
            UIntPtr timerId,
            uint time)
        {
            if (window != activationWindow)
            {
                return;
            }

            activationAttempts++;
            ForceForeground(window);
            if (GetForegroundWindow() == window || activationAttempts >= 5)
            {
                StopActivationRetry();
            }
        }

        private static void StopActivationRetry()
        {
            if (activationWindow != IntPtr.Zero && activationTimerId != UIntPtr.Zero)
            {
                KillTimer(activationWindow, activationTimerId);
            }
            activationTimerId = UIntPtr.Zero;
            activationWindow = IntPtr.Zero;
            activationTimerProcedure = null;
            activationAttempts = 0;
        }

        private static void ForceForeground(IntPtr window)
        {
            uint currentThread = GetCurrentThreadId();
            IntPtr foregroundWindow = GetForegroundWindow();
            uint foregroundProcess;
            uint foregroundThread = foregroundWindow == IntPtr.Zero
                ? 0
                : GetWindowThreadProcessId(foregroundWindow, out foregroundProcess);
            bool attached = foregroundThread != 0 &&
                foregroundThread != currentThread &&
                AttachThreadInput(currentThread, foregroundThread, true);

            try
            {
                SetWindowPos(
                    window,
                    HwndTopmost,
                    0,
                    0,
                    0,
                    0,
                    SwpNoMove | SwpNoSize | SwpShowWindow);
                BringWindowToTop(window);
                SetActiveWindow(window);
                SetForegroundWindow(window);
            }
            finally
            {
                if (attached)
                {
                    AttachThreadInput(currentThread, foregroundThread, false);
                }
            }
        }
    }
}
'@
        }

        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $owner = New-Object System.Windows.Forms.Form
        $owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
        $owner.ShowInTaskbar = $false
        $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
        $owner.Size = New-Object System.Drawing.Size(1, 1)
        $owner.Opacity = 0.01
        $owner.TopMost = $true
        $owner.Show()
        $owner.TopMost = $true
        $owner.BringToFront()
        [void]$owner.Activate()

        $messageBoxFlags = [uint32](0x00040000 -bor 0x00010000 -bor 0x00001000 -bor $IconFlag)
        [void][CodeCodex.FinalizeUninstallNativeMethods]::ShowCenteredTopmost(
            $owner.Handle,
            $Message,
            $Caption,
            $messageBoxFlags
        )
        return $true
    }
    catch {}
    finally {
        if ($null -ne $owner) {
            try { $owner.Close() } catch {}
            try { $owner.Dispose() } catch {}
        }
    }

    $owner = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $owner = New-Object System.Windows.Forms.Form
        $owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow
        $owner.ShowInTaskbar = $false
        $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
        $owner.Size = New-Object System.Drawing.Size(1, 1)
        $owner.Opacity = 0
        $owner.TopMost = $true
        $owner.Show()
        $owner.Activate()

        $messageIcon = if ($IconFlag -eq 0x00000010) {
            [System.Windows.Forms.MessageBoxIcon]::Error
        }
        else {
            [System.Windows.Forms.MessageBoxIcon]::Information
        }
        [void][System.Windows.Forms.MessageBox]::Show(
            $owner,
            $Message,
            $Caption,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            $messageIcon
        )
        return $true
    }
    catch {}
    finally {
        if ($null -ne $owner) {
            try { $owner.Close() } catch {}
            try { $owner.Dispose() } catch {}
        }
    }

    try {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.Popup($Message, 0, $Caption, ([int]$IconFlag -bor 0x00001000))
        return $true
    }
    catch {}

    return $false
}

function Show-UninstallFailure([string]$Detail) {
    $message = "Code-Codex could not be fully removed. Close Codex or ChatGPT and Code-Codex, then run the uninstaller again.`r`n`r`n$Detail"
    if (Show-TopmostMessage $message "Code-Codex uninstall" 0x00000010) {
        return
    }

    $failureLog = Join-Path $env:TEMP ("CodeCodex-Uninstall-Failure-{0}.txt" -f [Guid]::NewGuid().ToString("N"))
    $message | Set-Content -LiteralPath $failureLog -Encoding UTF8
    $notepad = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::System)) "notepad.exe"
    if (Test-Path -LiteralPath $notepad -PathType Leaf) {
        Start-Process -FilePath $notepad -WindowStyle Normal -ArgumentList @(('"{0}"' -f $failureLog))
    }
}

function Show-UninstallSuccess {
    [void](Show-TopmostMessage `
        "Code-Codex was uninstalled successfully." `
        "Code-Codex uninstall" `
        0x00000040)
}

$exitCode = 0
$progressDialog = $null
try {
    $null = Assert-CodeCodexRoot $InstallFullPath -Owned

    $progressDialog = New-UninstallProgressDialog
    Set-UninstallProgress $progressDialog 56 "Waiting for uninstaller" "Allowing the previous removal step to close."
    Wait-ForProcessExit $ParentPid "The uninstall script" $progressDialog
    Wait-ForProcessExit $LauncherPid "The installed uninstaller" $progressDialog

    if (-not [string]::IsNullOrWhiteSpace($MsiProductCode)) {
        Set-UninstallProgress $progressDialog 60 "Starting Windows Installer" "Checking the registered Code-Codex package."
        $msiProductCodePattern = '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$'
        if ($MsiProductCode -notmatch $msiProductCodePattern) {
            throw "Invalid Windows Installer product code."
        }
        $systemDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::System)
        $systemDirectoryFull = [IO.Path]::GetFullPath($systemDirectory) + [IO.Path]::DirectorySeparatorChar
        $msiexec = [IO.Path]::GetFullPath((Join-Path $systemDirectory "msiexec.exe"))
        $msiexecItem = Get-ExistingItem $msiexec
        if (-not $msiexec.StartsWith($systemDirectoryFull, [StringComparison]::OrdinalIgnoreCase) -or
            $null -eq $msiexecItem -or $msiexecItem.PSIsContainer -or
            (Test-ReparsePoint $msiexecItem)) {
            throw "Trusted Windows Installer executable was not found."
        }
        $msiProcess = Start-Process `
            -FilePath $msiexec `
            -ArgumentList @("/x", $MsiProductCode, "/qn") `
            -PassThru
        Set-UninstallProgress $progressDialog 60 "Removing Windows Installer package" "Windows is uninstalling the registered Code-Codex files." -Indeterminate
        while (-not $msiProcess.WaitForExit(100)) {
            Invoke-UninstallProgressEvents $progressDialog
        }
        $msiProcess.WaitForExit()
        Invoke-UninstallProgressEvents $progressDialog
        if ([int]$msiProcess.ExitCode -notin @(0, 1641, 3010)) {
            throw "Windows Installer could not remove Code-Codex (exit code $($msiProcess.ExitCode))."
        }
        Set-UninstallProgress $progressDialog 94 "Cleaning desktop shortcuts" "Removing shortcuts owned by Code-Codex."
        Remove-VerifiedCodeCodexDesktopShortcut
        if ($PurgeSettings) {
            foreach($name in @('data','plugins','logs','temp','backups','storage-layout.json')) { Remove-SafeTree (Join-Path $InstallFullPath $name) }
            Remove-ItemProperty 'HKCU:\Software\CodeCodex' -Name RetainedRoot,InstallPath -ErrorAction SilentlyContinue
        } else {
            [IO.File]::WriteAllText((Join-Path $InstallFullPath 'storage-layout.json'),'{"schema":1,"product":"Code-Codex","layout":"centralized"}')
            New-Item 'HKCU:\Software\CodeCodex' -Force | Out-Null
            New-ItemProperty 'HKCU:\Software\CodeCodex' -Name RetainedRoot -PropertyType String -Value $InstallFullPath -Force | Out-Null
        }
    }
    else {
        Set-UninstallProgress $progressDialog 60 "Cleaning desktop shortcuts" "Removing shortcuts owned by Code-Codex."
        Remove-VerifiedCodeCodexDesktopShortcut
        $removed = (-not (Test-CodeCodexApplicationFiles $InstallFullPath)) -and -not $PurgeSettings
        $lastFailure = "Installed files may still be in use."
        for ($attempt = 1; -not $removed -and $attempt -le 30; $attempt++) {
            if ($attempt -eq 1) {
                Set-UninstallProgress $progressDialog 70 "Removing application files" "Deleting the installed Code-Codex versions and support files."
            }
            else {
                Set-UninstallProgress $progressDialog 70 "Waiting for files to unlock" "Retrying file removal (attempt $attempt of 30)."
            }
            try {
                Remove-CodeCodexApplicationFiles $InstallFullPath -Purge:$PurgeSettings
                $removed = -not (Test-CodeCodexApplicationFiles $InstallFullPath)
            }
            catch {
                $lastFailure = $_.Exception.Message
            }
            Invoke-UninstallProgressEvents $progressDialog
            if (-not $removed) {
                Start-Sleep -Milliseconds 200
                Invoke-UninstallProgressEvents $progressDialog
            }
        }

        if (-not $removed) {
            throw $lastFailure
        }

        New-Item 'HKCU:\Software\CodeCodex' -Force | Out-Null
        Remove-ItemProperty 'HKCU:\Software\CodeCodex' -Name InstallPath -ErrorAction SilentlyContinue
        if (-not $PurgeSettings) { New-ItemProperty 'HKCU:\Software\CodeCodex' -Name RetainedRoot -PropertyType String -Value $InstallFullPath -Force | Out-Null }
        else { Remove-ItemProperty 'HKCU:\Software\CodeCodex' -Name RetainedRoot -ErrorAction SilentlyContinue }
        # Keep the recovery entry until installed files are confirmed gone.
        Set-UninstallProgress $progressDialog 94 "Removing Windows registration" "Deleting the Code-Codex installed-app entry."
        $portableUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCodex"
        if (Test-Path -LiteralPath $portableUninstallKey) {
            Remove-Item `
                -LiteralPath $portableUninstallKey `
                -Recurse `
                -Force `
                -ErrorAction Stop
        }
    }

    Complete-UninstallProgress $progressDialog
    Start-Sleep -Milliseconds 250
    Invoke-UninstallProgressEvents $progressDialog
    Close-UninstallProgress $progressDialog
    $progressDialog = $null
    Show-UninstallSuccess
}
catch {
    $exitCode = 3
    Close-UninstallProgress $progressDialog
    $progressDialog = $null
    Show-UninstallFailure $_.Exception.Message
}
finally {
    Close-UninstallProgress $progressDialog
    $self = $MyInvocation.MyCommand.Path
    Remove-Item -LiteralPath $self -Force -ErrorAction SilentlyContinue
}

exit $exitCode
