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