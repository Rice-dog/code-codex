[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$InstallRoot,
    [Parameter(Mandatory)]
    [int]$ParentPid,
    [int]$LauncherPid = 0,
    [string]$MsiProductCode
)

$ErrorActionPreference = "Stop"
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

function Remove-ReparsePoint([IO.FileSystemInfo]$Item) {
    if ($Item.PSIsContainer) {
        [IO.Directory]::Delete($Item.FullName, $false)
    }
    else {
        [IO.File]::Delete($Item.FullName)
    }
}

function Assert-AllowedUninstallPath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($fullPath -ne $InstallFullPath -and
        -not $fullPath.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe uninstall path."
    }
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
        throw "Unsafe non-directory uninstall root."
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

function Wait-ForProcessExit([int]$ProcessId, [string]$Description) {
    if ($ProcessId -le 0) { return }
    Wait-Process -Id $ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    if ($null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        throw "$Description did not exit before the uninstall timeout."
    }
}

function Show-UninstallFailure([string]$Detail) {
    $message = "Code-Codex could not be fully removed. Close Codex and Code-Codex, then run the uninstaller again.`r`n`r`n$Detail"
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show(
            $message,
            "Code-Codex uninstall",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
        return
    }
    catch {}

    try {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.Popup($message, 0, "Code-Codex uninstall", 16)
        return
    }
    catch {}

    $failureLog = Join-Path $env:TEMP ("CodeCodex-Uninstall-Failure-{0}.txt" -f [Guid]::NewGuid().ToString("N"))
    $message | Set-Content -LiteralPath $failureLog -Encoding UTF8
    $notepad = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::System)) "notepad.exe"
    if (Test-Path -LiteralPath $notepad -PathType Leaf) {
        Start-Process -FilePath $notepad -WindowStyle Normal -ArgumentList @(('"{0}"' -f $failureLog))
    }
}

$exitCode = 0
try {
    if (-not $InstallFullPath.StartsWith($AllowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "The requested install path is outside the per-user Programs directory."
    }
    $programsItem = Get-ExistingItem $ProgramsRoot
    if ($null -ne $programsItem) {
        if (-not $programsItem.PSIsContainer -or (Test-ReparsePoint $programsItem)) {
            throw "The per-user Programs directory is not a regular directory."
        }
    }

    Wait-ForProcessExit $ParentPid "The uninstall script"
    Wait-ForProcessExit $LauncherPid "The installed uninstaller"

    if (-not [string]::IsNullOrWhiteSpace($MsiProductCode)) {
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
            -ArgumentList @("/x", $MsiProductCode, "/passive") `
            -Wait `
            -PassThru
        if ([int]$msiProcess.ExitCode -notin @(0, 1641, 3010)) {
            throw "Windows Installer could not remove Code-Codex (exit code $($msiProcess.ExitCode))."
        }
    }
    else {
        $removed = $null -eq (Get-ExistingItem $InstallFullPath)
        $lastFailure = "Installed files may still be in use."
        for ($attempt = 1; -not $removed -and $attempt -le 30; $attempt++) {
            try {
                Remove-SafeTree $InstallFullPath
            }
            catch {
                $lastFailure = $_.Exception.Message
            }
            $removed = $null -eq (Get-ExistingItem $InstallFullPath)
            if (-not $removed) { Start-Sleep -Milliseconds 200 }
        }

        if (-not $removed) {
            throw $lastFailure
        }

        # Keep the recovery entry until installed files are confirmed gone.
        $portableUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCodex"
        if (Test-Path -LiteralPath $portableUninstallKey) {
            Remove-Item `
                -LiteralPath $portableUninstallKey `
                -Recurse `
                -Force `
                -ErrorAction Stop
        }
    }
}
catch {
    $exitCode = 3
    Show-UninstallFailure $_.Exception.Message
}
finally {
    $self = $MyInvocation.MyCommand.Path
    Remove-Item -LiteralPath $self -Force -ErrorAction SilentlyContinue
}

exit $exitCode
