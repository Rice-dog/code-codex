function New-UninstallProgressDialog {
    $form = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $form = New-Object System.Windows.Forms.Form
        $form.Text = ConvertTo-RemovalUiText "Code-Codex uninstall"
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
                    $form.Text = (ConvertTo-RemovalUiText 'Code-Codex uninstall') + ' v' + $installedVersion
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
        $label.Text = ConvertTo-RemovalUiText "Preparing Code-Codex removal..."
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
    if ($SharedProgress) {
        if ([string]::IsNullOrWhiteSpace($env:CLE_PROGRESS_STATE_PATH)) { throw 'Shared uninstall progress channel is missing.' }
        $message = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Stage+"`n"+$Detail))
        $kind = if ($Indeterminate) { 'marquee' } else { 'progress' }
        [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH,([DateTime]::UtcNow.Ticks.ToString()+'|'+$kind+'|'+$Value+'|'+$message),[Text.UTF8Encoding]::new($false))
        return
    }
    if ($null -eq $Dialog) { return }
    try {
        if ($Dialog.Form.IsDisposed) { return }
        $Dialog.Label.Text = ConvertTo-RemovalUiText $Stage
        $Dialog.Detail.Text = ConvertTo-RemovalUiText $Detail
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
    $Message=ConvertTo-RemovalUiText $Message
    $Caption=ConvertTo-RemovalUiText $Caption
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
