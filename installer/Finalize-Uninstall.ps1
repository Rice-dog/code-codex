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

function New-UninstallProgressDialog {
    $form = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $form = New-Object System.Windows.Forms.Form
        $form.Text = "Code-Codex uninstall"
        $form.ClientSize = New-Object System.Drawing.Size(420, 116)
        $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
        $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
        $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false
        $form.ControlBox = $false
        $form.ShowInTaskbar = $true
        $form.TopMost = $true

        $label = New-Object System.Windows.Forms.Label
        $label.AutoSize = $false
        $label.Location = New-Object System.Drawing.Point(24, 20)
        $label.Size = New-Object System.Drawing.Size(372, 24)
        $label.Text = "Removing Code-Codex..."
        $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft

        $progressBar = New-Object System.Windows.Forms.ProgressBar
        $progressBar.Location = New-Object System.Drawing.Point(24, 58)
        $progressBar.Size = New-Object System.Drawing.Size(372, 22)
        $progressBar.Minimum = 0
        $progressBar.Maximum = 100
        $progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
        $progressBar.MarqueeAnimationSpeed = 30

        $form.Controls.Add($label)
        $form.Controls.Add($progressBar)
        $form.Show()
        $form.Activate()
        $form.BringToFront()
        [System.Windows.Forms.Application]::DoEvents()

        return [PSCustomObject]@{
            Form = $form
            Label = $label
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
    if ($null -eq $Dialog) { return }
    try {
        if (-not $Dialog.Form.IsDisposed) {
            $Dialog.Label.Text = "Code-Codex was removed successfully."
            $Dialog.ProgressBar.MarqueeAnimationSpeed = 0
            $Dialog.ProgressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
            $Dialog.ProgressBar.Value = 100
            $Dialog.Form.Activate()
            $Dialog.Form.BringToFront()
            [System.Windows.Forms.Application]::DoEvents()
        }
    }
    catch {}
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
    $progressDialog = New-UninstallProgressDialog

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
            -ArgumentList @("/x", $MsiProductCode, "/qn") `
            -PassThru
        while (-not $msiProcess.WaitForExit(100)) {
            Invoke-UninstallProgressEvents $progressDialog
        }
        $msiProcess.WaitForExit()
        Invoke-UninstallProgressEvents $progressDialog
        if ([int]$msiProcess.ExitCode -notin @(0, 1641, 3010)) {
            throw "Windows Installer could not remove Code-Codex (exit code $($msiProcess.ExitCode))."
        }
        Remove-VerifiedCodeCodexDesktopShortcut
    }
    else {
        Remove-VerifiedCodeCodexDesktopShortcut
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
            Invoke-UninstallProgressEvents $progressDialog
            if (-not $removed) {
                Start-Sleep -Milliseconds 200
                Invoke-UninstallProgressEvents $progressDialog
            }
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
