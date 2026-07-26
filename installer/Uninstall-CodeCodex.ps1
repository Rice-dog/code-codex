[CmdletBinding()]
param(
    [switch]$KeepSettings,
    [switch]$PurgeSettings
)

$ErrorActionPreference = "Stop"
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\Code-Codex"
$ProgramsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "Programs"))
$AllowedRoot = $ProgramsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$InstallFullPath = [IO.Path]::GetFullPath($InstallRoot)
$InstallPrefix = $InstallFullPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Test-ReparsePoint([IO.FileSystemInfo]$Item) {
    return ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

function Get-ExistingItem([string]$Path) {
    return Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
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

function Remove-ReparsePoint([IO.FileSystemInfo]$Item) {
    if ($Item.PSIsContainer) {
        [IO.Directory]::Delete($Item.FullName, $false)
    }
    else {
        [IO.File]::Delete($Item.FullName)
    }
}

function Remove-SettingsEntry([string]$Path, [switch]$RegularFileOnly) {
    $item = Get-ExistingItem $Path
    if ($null -eq $item) { return }
    if ($RegularFileOnly -and ((Test-ReparsePoint $item) -or $item.PSIsContainer)) {
        return
    }
    if (Test-ReparsePoint $item) {
        Remove-ReparsePoint $item
    }
    elseif ($item.PSIsContainer) {
        throw "Refusing to recursively remove an unexpected settings directory: $Path"
    }
    else {
        $item.Attributes = [IO.FileAttributes]::Normal
        [IO.File]::Delete($Path)
    }
}

if (-not $InstallFullPath.StartsWith($AllowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected path: $InstallFullPath"
}
if ($KeepSettings -and $PurgeSettings) {
    throw "-KeepSettings and -PurgeSettings cannot be used together."
}

$programsItem = Get-ExistingItem $ProgramsRoot
if ($null -ne $programsItem -and
    (-not $programsItem.PSIsContainer -or (Test-ReparsePoint $programsItem))) {
    throw "Refusing to uninstall through a non-directory or reparse-point Programs path: $ProgramsRoot"
}

$installItem = Get-ExistingItem $InstallFullPath
$processSnapshot = @()
$uninstallerLauncherPid = 0
$finalizerCopy = $null
$finalizerLaunched = $false
$powerShellPath = $null
if ($null -ne $installItem) {
    if (-not $installItem.PSIsContainer -or (Test-ReparsePoint $installItem)) {
        throw "Refusing to uninstall from a non-directory or reparse-point install path: $InstallFullPath"
    }
    $running = @()
    $processSnapshot = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    foreach ($process in $processSnapshot) {
        $knownProductName = [string]$process.Name -in @(
            "code-codex.exe",
            "CodeCodex.exe"
        )
        if ([string]::IsNullOrWhiteSpace([string]$process.ExecutablePath)) {
            if ($knownProductName) { $running += $process.ProcessId }
            continue
        }
        try {
            $processPath = [IO.Path]::GetFullPath([string]$process.ExecutablePath)
            if ($knownProductName -and
                $processPath.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                $running += $process.ProcessId
            }
        }
        catch {
            if ($knownProductName) { $running += $process.ProcessId }
        }
    }
    $running = @($running | Sort-Object -Unique)
    if ($running.Count -gt 0) {
        throw "Code-Codex is still running. Close Codex Desktop, then run the uninstaller again."
    }

    $currentProcessRecord = $processSnapshot |
        Where-Object { [uint32]$_.ProcessId -eq [uint32]$PID } |
        Select-Object -First 1
    if ($null -ne $currentProcessRecord) {
        $parentProcessRecord = $processSnapshot |
            Where-Object {
                [uint32]$_.ProcessId -eq [uint32]$currentProcessRecord.ParentProcessId
            } |
            Select-Object -First 1
        if ($null -ne $parentProcessRecord -and
            [string]$parentProcessRecord.Name -ieq "Uninstall-CodeCodex.exe") {
            $expectedUninstaller = Join-Path $InstallFullPath "Uninstall-CodeCodex.exe"
            if ([string]::IsNullOrWhiteSpace([string]$parentProcessRecord.ExecutablePath) -or
                (Test-SamePath ([string]$parentProcessRecord.ExecutablePath) $expectedUninstaller)) {
                $uninstallerLauncherPid = [int]$parentProcessRecord.ProcessId
            }
        }
    }

    $finalizerSource = Join-Path $InstallFullPath "Finalize-Uninstall.ps1"
    $finalizerItem = Get-ExistingItem $finalizerSource
    if ($null -eq $finalizerItem) {
        throw "Uninstall finalizer is missing: $finalizerSource"
    }
    if ($finalizerItem.PSIsContainer -or (Test-ReparsePoint $finalizerItem)) {
        throw "Refusing to execute a non-file or reparse-point uninstall finalizer: $finalizerSource"
    }

    $systemDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::System)
    $powerShellPath = [IO.Path]::GetFullPath((Join-Path $systemDirectory "WindowsPowerShell\v1.0\powershell.exe"))
    $systemDirectoryFull = [IO.Path]::GetFullPath($systemDirectory) + [IO.Path]::DirectorySeparatorChar
    $powerShellItem = Get-ExistingItem $powerShellPath
    if (-not $powerShellPath.StartsWith($systemDirectoryFull, [StringComparison]::OrdinalIgnoreCase) -or
        $null -eq $powerShellItem -or $powerShellItem.PSIsContainer -or
        (Test-ReparsePoint $powerShellItem)) {
        throw "Trusted Windows PowerShell executable was not found."
    }

    $finalizerCopy = Join-Path $env:TEMP ("CodeCodex-Uninstall-{0}.ps1" -f [Guid]::NewGuid().ToString("N"))
    try {
        Copy-Item -LiteralPath $finalizerSource -Destination $finalizerCopy
        $finalizerCopyItem = Get-ExistingItem $finalizerCopy
        if ($null -eq $finalizerCopyItem -or $finalizerCopyItem.PSIsContainer -or
            (Test-ReparsePoint $finalizerCopyItem) -or
            (Get-FileHash -LiteralPath $finalizerSource -Algorithm SHA256).Hash -ne
                (Get-FileHash -LiteralPath $finalizerCopy -Algorithm SHA256).Hash) {
            throw "The temporary uninstall finalizer could not be verified."
        }
    }
    catch {
        Remove-Item -LiteralPath $finalizerCopy -Force -ErrorAction SilentlyContinue
        throw
    }
}

if ($null -eq $installItem) {
    Write-Host "Code-Codex is not installed."
    return
}

try {
    # A physical uninstaller is also shipped by the MSI. Delegate from the
    # verified temporary helper so Windows Installer can remove this process.
    $installTypePath = Join-Path $InstallFullPath "install-type"
    $installTypeItem = Get-ExistingItem $installTypePath
    if ($null -ne $installTypeItem -and
        ($installTypeItem.PSIsContainer -or (Test-ReparsePoint $installTypeItem))) {
        throw "Refusing to read a non-file or reparse-point installation ownership marker: $installTypePath"
    }
    if ($null -ne $installTypeItem -and
        (Get-Content -LiteralPath $installTypePath -Raw -Encoding UTF8).Trim() -eq "msi") {
        $msiProductCodePattern = '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$'
        $productCandidates = @(
            Get-ItemProperty `
                    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" `
                    -ErrorAction Stop |
                Where-Object {
                    $_.DisplayName -eq "Code-Codex" -and
                    [string]$_.PSChildName -match $msiProductCodePattern -and
                    [string]$_.WindowsInstaller -eq "1"
                }
        )
        $matchingProducts = @(
            $productCandidates |
                Where-Object { Test-SamePath ([string]$_.InstallLocation) $InstallFullPath }
        )
        if ($matchingProducts.Count -eq 0) {
            throw "The Windows Installer product registration for this install location could not be found."
        }
        if ($matchingProducts.Count -ne 1) {
            throw "Multiple Windows Installer product registrations refer to this install location; repair or remove the conflicting registrations before uninstalling."
        }
        $product = $matchingProducts[0]

        $delegateArguments = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", ('"{0}"' -f $finalizerCopy),
            "-InstallRoot", ('"{0}"' -f $InstallFullPath),
            "-ParentPid", $PID,
            "-MsiProductCode", ('"{0}"' -f [string]$product.PSChildName)
        )
        if ($uninstallerLauncherPid -gt 0) {
            $delegateArguments += @("-LauncherPid", $uninstallerLauncherPid)
        }
        Start-Process -FilePath $powerShellPath -WindowStyle Hidden -ArgumentList $delegateArguments
        $finalizerLaunched = $true
        Write-Host "Windows Installer will remove Code-Codex after this window closes."
        return
    }

$shortcutTool = Join-Path $InstallFullPath "CodeCodex.Shortcut.exe"
$shortcutToolItem = Get-ExistingItem $shortcutTool
if ($null -eq $shortcutToolItem -or $shortcutToolItem.PSIsContainer -or (Test-ReparsePoint $shortcutToolItem)) {
    throw "The verified shortcut restoration tool is missing. No files were removed."
}
& $shortcutTool restore --install-root $InstallFullPath
if ($LASTEXITCODE -ne 0) {
    throw "The original Codex shortcut could not be restored. No Code-Codex files were removed."
}

Remove-ItemProperty `
    -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
    -Name "CodeCodex" `
    -ErrorAction SilentlyContinue

if (-not $KeepSettings -or $PurgeSettings) {
    $settingsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "CodeCodex"))
    $allowedLocal = [IO.Path]::GetFullPath($env:LOCALAPPDATA) + [IO.Path]::DirectorySeparatorChar
    if (-not $settingsRoot.StartsWith($allowedLocal, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove unexpected settings path: $settingsRoot"
    }
    $settingsItem = Get-ExistingItem $settingsRoot
    if ($null -ne $settingsItem) {
        if (-not $settingsItem.PSIsContainer) {
            throw "Refusing to remove a non-directory settings path: $settingsRoot"
        }
        if (Test-ReparsePoint $settingsItem) {
            Remove-ReparsePoint $settingsItem
        }
        else {
            foreach ($settingsName in @("settings.json", "settings.json.tmp")) {
                $settingsFile = Join-Path $settingsRoot $settingsName
                Remove-SettingsEntry $settingsFile
            }
            $crashOrphanPattern = [regex]::new(
                '^\.settings\.json\.[A-Za-z0-9]{16}\.tmp$',
                [Text.RegularExpressions.RegexOptions]::CultureInvariant
            )
            $crashOrphanPaths = @(
                [IO.Directory]::EnumerateFileSystemEntries(
                    $settingsRoot,
                    ".settings.json.*.tmp",
                    [IO.SearchOption]::TopDirectoryOnly
                ) | Select-Object -First 64
            )
            foreach ($crashOrphanPath in $crashOrphanPaths) {
                if ($crashOrphanPattern.IsMatch([IO.Path]::GetFileName($crashOrphanPath))) {
                    Remove-SettingsEntry $crashOrphanPath -RegularFileOnly
                }
            }
            $verifiedSettings = Get-ExistingItem $settingsRoot
            if ($null -ne $verifiedSettings -and
                -not (Test-ReparsePoint $verifiedSettings) -and
                $verifiedSettings.PSIsContainer -and
                @(Get-ChildItem -LiteralPath $settingsRoot -Force).Count -eq 0) {
                [IO.Directory]::Delete($settingsRoot, $false)
            }
        }
    }
}

$finalizerArguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $finalizerCopy),
    "-InstallRoot", ('"{0}"' -f $InstallFullPath),
    "-ParentPid", $PID
)
if ($uninstallerLauncherPid -gt 0) {
    $finalizerArguments += @("-LauncherPid", $uninstallerLauncherPid)
}
Start-Process -FilePath $powerShellPath -WindowStyle Hidden -ArgumentList $finalizerArguments
$finalizerLaunched = $true

Write-Host "The original Codex shortcut was restored. Code-Codex will be removed after this window closes."
}
catch {
    if (-not $finalizerLaunched -and
        -not [string]::IsNullOrWhiteSpace([string]$finalizerCopy)) {
        Remove-Item -LiteralPath $finalizerCopy -Force -ErrorAction SilentlyContinue
    }
    throw
}
