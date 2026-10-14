use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
#[path = "setup_observability.rs"]
pub(crate) mod setup_observability;
use serde_json::json;
use setup_observability::SetupJournal;

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

const DIALOG_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CodeCodexNativeDialog
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
        IntPtr owner,
        string message,
        string title,
        uint flags
    );

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookExW(
        int hookType,
        HookProcedure procedure,
        IntPtr module,
        uint threadId
    );

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(
        IntPtr hook,
        int code,
        IntPtr wParam,
        IntPtr lParam
    );

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
        ref MonitorInformation information
    );

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
        uint flags
    );

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
        bool attach
    );

    [DllImport("user32.dll")]
    private static extern IntPtr SetActiveWindow(IntPtr window);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern UIntPtr SetTimer(
        IntPtr window,
        UIntPtr timerId,
        uint interval,
        TimerProcedure procedure
    );

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool KillTimer(IntPtr window, UIntPtr timerId);

    public static int ShowCenteredTopmost(
        IntPtr owner,
        string message,
        string title,
        uint flags
    )
    {
        CaptureTargetWorkArea(owner);
        hookProcedure = PositionMessageBox;
        hookHandle = SetWindowsHookExW(
            WhCbt,
            hookProcedure,
            IntPtr.Zero,
            GetCurrentThreadId()
        );

        try
        {
            return MessageBoxW(owner, message, title, flags);
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
        hasTargetWorkArea = monitor != IntPtr.Zero && GetMonitorInfoW(monitor, ref information);
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
            SwpNoSize | SwpShowWindow
        );
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
            activationTimerProcedure
        );
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
        uint time
    )
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
                SwpNoMove | SwpNoSize | SwpShowWindow
            );
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
'@

$MB_OK = [uint32]0x00000000
$MB_ICONERROR = [uint32]0x00000010
$MB_ICONINFORMATION = [uint32]0x00000040
$MB_SYSTEMMODAL = [uint32]0x00001000
$MB_SETFOREGROUND = [uint32]0x00010000
$MB_TOPMOST = [uint32]0x00040000
$icon = if ($env:CLE_DIALOG_ERROR -eq '1') { $MB_ICONERROR } else { $MB_ICONINFORMATION }
$flags = [uint32]($MB_OK -bor $icon -bor $MB_SYSTEMMODAL -bor $MB_SETFOREGROUND -bor $MB_TOPMOST)
$owner = New-Object System.Windows.Forms.Form
$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$owner.ShowInTaskbar = $false
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0.01
$owner.TopMost = $true
try {
    $owner.Show()
    $owner.TopMost = $true
    $owner.BringToFront()
    [void]$owner.Activate()
    [void][CodeCodexNativeDialog]::ShowCenteredTopmost(
        $owner.Handle,
        $env:CLE_DIALOG_MESSAGE,
        $env:CLE_DIALOG_TITLE,
        $flags
    )
}
finally {
    $owner.Close()
    $owner.Dispose()
}
"#;
#[allow(dead_code)]
const PROGRESS_DIALOG_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Write-UiEvent([string]$Phase, [string]$Status, $Detail = @{}) {
    [Console]::WriteLine('CC_SETUP_UI_EVENT:' + (ConvertTo-Json -Depth 6 -Compress -InputObject @{phase=$Phase;status=$Status;detail=$Detail}))
}
function Write-UiMarker([string]$Path, [string]$Content) {
    if (-not $Path) { return }
    $candidate = $Path + '.tmp'
    [IO.File]::WriteAllText($candidate,$Content,[Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($Path)) {
        $backup=$Path+'.previous'; [IO.File]::Replace($candidate,$Path,$backup); [IO.File]::Delete($backup)
    } else { [IO.File]::Move($candidate,$Path) }
}
trap {
    $chain=@(); $exception=$_.Exception
    while ($exception -and $chain.Count -lt 8) { $chain += @{type=$exception.GetType().FullName;hresult=$exception.HResult;message=$exception.Message};$exception=$exception.InnerException }
    Write-UiEvent 'unhandled UI exception' 'failed' @{chain=$chain;line=$_.InvocationInfo.ScriptLineNumber;errorId=$_.FullyQualifiedErrorId}
    [Console]::Error.WriteLine(($_ | Out-String)); exit 1
}
Write-UiEvent 'UI bootstrap' 'started' @{pid=$PID;powerShell=$PSVersionTable.PSVersion.ToString();languageMode=[string]$ExecutionContext.SessionState.LanguageMode}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
# PowerShell is a separate executable: parent EXE DPI manifests do not opt this
# UI thread in. Set awareness before creating any window, then own all geometry
# in logical pixels so page changes and WM_DPICHANGED cannot double-scale it.
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class CodeCodexDpiForm : Form {
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern uint GetDpiForSystem();
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr handle);
    [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr context);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    public int LayoutDpi { get; private set; }
    public event EventHandler LayoutDpiChanged;
    public static void EnableNativeDpi() {
        try {
            if (SetThreadDpiAwarenessContext(new IntPtr(-4)) != IntPtr.Zero) return;
            if (SetThreadDpiAwarenessContext(new IntPtr(-2)) != IntPtr.Zero) return;
        } catch (EntryPointNotFoundException) { }
        SetProcessDPIAware();
    }
    public CodeCodexDpiForm() {
        try { LayoutDpi = (int)GetDpiForSystem(); }
        catch (EntryPointNotFoundException) { using (var g = Graphics.FromHwnd(IntPtr.Zero)) LayoutDpi = (int)g.DpiX; }
        if (LayoutDpi <= 0) LayoutDpi = 96;
    }
    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        try { LayoutDpi = (int)GetDpiForWindow(Handle); } catch (EntryPointNotFoundException) { }
        if (LayoutDpiChanged != null) LayoutDpiChanged(this, EventArgs.Empty);
    }
    protected override void WndProc(ref Message message) {
        if (message.Msg == 0x02E0) {
            LayoutDpi = (int)((long)message.WParam & 0xffff);
            var rect = (Rect)Marshal.PtrToStructure(message.LParam, typeof(Rect));
            base.WndProc(ref message);
            Bounds = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
            if (LayoutDpiChanged != null) LayoutDpiChanged(this, EventArgs.Empty);
            Invalidate(true);
            return;
        }
        base.WndProc(ref message);
    }
}
public class CodeCodexBrandPanel : Panel {
    public CodeCodexBrandPanel() { DoubleBuffered = true; }
    protected override void OnPaintBackground(PaintEventArgs e) {
        if (BackgroundImage == null) { base.OnPaintBackground(e); return; }
        // Cover the panel without stretching the artwork's aspect ratio.
        float scale = Math.Max((float)Width / BackgroundImage.Width, (float)Height / BackgroundImage.Height);
        float w = Width / scale, h = Height / scale;
        var source = new RectangleF((BackgroundImage.Width-w)/2, (BackgroundImage.Height-h)/2, w, h);
        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        using (var attributes = new System.Drawing.Imaging.ImageAttributes()) {
            attributes.SetWrapMode(WrapMode.TileFlipXY);
            e.Graphics.DrawImage(BackgroundImage, ClientRectangle, source.X, source.Y, source.Width, source.Height, GraphicsUnit.Pixel, attributes);
        }
    }
}
public class CodeCodexBrandIcon : PictureBox {
    protected override void OnPaint(PaintEventArgs e) {
        if (Image == null) { base.OnPaint(e); return; }
        float scale = Math.Min((float)Width / Image.Width, (float)Height / Image.Height);
        float w = Image.Width*scale, h = Image.Height*scale;
        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        e.Graphics.DrawImage(Image, (Width-w)/2, (Height-h)/2, w, h);
    }
}
'@
[CodeCodexDpiForm]::EnableNativeDpi()
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:uiBounds = @{}
$script:uiFonts = @{}
$script:ownedUiFonts = @{}
$script:uiLogicalSize = [System.Drawing.Size]::new(460, 220)
function Set-UiFont($Control, [double]$Points, $Style = [System.Drawing.FontStyle]::Regular) {
    $script:uiFonts[$Control] = @($Points, $Style)
    $pixels = [single]($Points * $form.LayoutDpi / 72.0)
    $previous = $script:ownedUiFonts[$Control]
    if ($previous -and $previous.Size -eq $pixels -and $previous.Style -eq $Style) { return }
    # Explicit pixel fonts prevent cached WinForms HFONTs retaining the previous
    # monitor's size when automatic scaling is intentionally disabled.
    $font = [System.Drawing.Font]::new('Segoe UI', $pixels, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    $Control.Font = $font
    $script:ownedUiFonts[$Control] = $font
    if ($previous) { $previous.Dispose() }
}
function Set-UiBounds($Control, [int]$X, [int]$Y, [int]$Width, [int]$Height) {
    $script:uiBounds[$Control] = @($X, $Y, $Width, $Height)
    $scale = $form.LayoutDpi / 96.0
    $Control.SetBounds([int][Math]::Round($X*$scale), [int][Math]::Round($Y*$scale), [int][Math]::Round($Width*$scale), [int][Math]::Round($Height*$scale))
}
function Update-UiLayout {
    $form.SuspendLayout()
    try {
        $scale = $form.LayoutDpi / 96.0
        $form.ClientSize = [System.Drawing.Size]::new([int][Math]::Round($script:uiLogicalSize.Width*$scale), [int][Math]::Round($script:uiLogicalSize.Height*$scale))
        if ($script:setupWizard) {
            # Keep the client width; fit the entire window, including native chrome,
            # to 3:1.8 at the current DPI. Never scale down the fonts to fit.
            $chromeHeight = $form.Height - $form.ClientSize.Height
            $form.ClientSize = [System.Drawing.Size]::new($form.ClientSize.Width, [int][Math]::Round($form.Width*0.6)-$chromeHeight)
        }
        foreach ($control in @($script:uiFonts.Keys)) {
            $f = $script:uiFonts[$control]
            Set-UiFont $control $f[0] $f[1]
        }
        foreach ($control in @($script:uiBounds.Keys)) {
            $b = $script:uiBounds[$control]
            Set-UiBounds $control $b[0] $b[1] $b[2] $b[3]
        }
        if ($script:setupWizard -and $brandPanel) {
            $logicalHeight = [int][Math]::Round($form.ClientSize.Height/$scale)
            Set-UiBounds $brandPanel 0 0 240 $logicalHeight
            Set-UiBounds $brandVersion 20 ($logicalHeight-38) 200 22
            Set-UiBounds $actions 240 ($logicalHeight-64) 480 64
            if ($script:setupPage -eq 'finish') { Set-UiBounds $detail 268 112 424 ($logicalHeight-190) }
            if ($script:setupPage -eq 'report') { Set-UiBounds $script:reportBox 268 112 424 ($logicalHeight-190) }
        }
    } finally { $form.ResumeLayout(); $form.Invalidate($true) }
}

$form = New-Object CodeCodexDpiForm
$form.Text = "$($env:CLE_PROGRESS_TITLE) v$($env:CLE_PROGRESS_VERSION)"
$form.ClientSize = New-Object System.Drawing.Size(460, 220)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ControlBox = $false
$form.ShowIcon = $true
$form.ShowInTaskbar = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.TopMost = $true
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
Set-UiFont $form 9
$form.BackColor = [System.Drawing.Color]::White
try {
    $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:CLE_PROGRESS_EXECUTABLE)
} catch {}

$brandIcon = New-Object CodeCodexBrandIcon
Set-UiBounds $brandIcon 194 14 72 72
$brandIcon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$brandIcon.BackColor = [System.Drawing.Color]::White
try {
    $sourceImage = [System.Drawing.Image]::FromFile($env:CLE_PROGRESS_ICON_PATH)
    try { $brandIcon.Image = [System.Drawing.Bitmap]::new($sourceImage) }
    finally { $sourceImage.Dispose() }
} catch {
    try { $brandIcon.Image = $form.Icon.ToBitmap() } catch {}
}
$form.Controls.Add($brandIcon)

$status = New-Object System.Windows.Forms.Label
Set-UiBounds $status 20 105 420 28
$status.AutoEllipsis = $true
$status.Text = $env:CLE_PROGRESS_MESSAGE
$form.Controls.Add($status)

$detail = New-Object System.Windows.Forms.Label
Set-UiBounds $detail 20 139 420 30
$detail.AutoEllipsis = $true
$detail.ForeColor = [System.Drawing.SystemColors]::GrayText
$form.Controls.Add($detail)

$bar = New-Object System.Windows.Forms.ProgressBar
Set-UiBounds $bar 20 179 420 22
$bar.Minimum = 0
$bar.Maximum = 100
$initialValue = 0
if ([int]::TryParse($env:CLE_PROGRESS_VALUE, [ref]$initialValue)) {
    $bar.Value = [Math]::Max(0, [Math]::Min(100, $initialValue))
}
$form.Controls.Add($bar)

# Setup uses one branded wizard; the updater starts directly on Installing.
$script:setupWizard = $env:CLE_SETUP_WIZARD -eq '1'
$script:setupPending = $env:CLE_SETUP_SELECT -eq '1'
$script:allowClose = $false
$script:setupPage = 'welcome'
if ($script:setupWizard) {
    . $env:CLE_SETUP_STORAGE_CONTRACT
    $script:setupRoot = Get-CodeCodexRegisteredRoot
    if ($env:CLE_SETUP_INITIAL_ROOT) { $script:setupRoot = $env:CLE_SETUP_INITIAL_ROOT }
    $script:setupExistingRoot = Get-CodeCodexRegisteredRoot
    $script:setupExisting = Test-Path -LiteralPath (Join-Path $script:setupExistingRoot 'current-version') -PathType Leaf
    if ($script:setupExisting) { $script:setupRoot = $script:setupExistingRoot }
    $script:uiLogicalSize = [System.Drawing.Size]::new(720, 400)
    $form.ControlBox = $true
    $brandPanel = New-Object CodeCodexBrandPanel
    Set-UiBounds $brandPanel 0 0 240 400
    $brandPanel.BackColor = [System.Drawing.Color]::FromArgb(240, 246, 250)
    $backgroundSource = [System.Drawing.Image]::FromFile($env:CLE_SETUP_BACKGROUND_PATH)
    try { $brandPanel.BackgroundImage = [System.Drawing.Bitmap]::new($backgroundSource) }
    finally { $backgroundSource.Dispose() }
    $brandPanel.BackgroundImageLayout = [System.Windows.Forms.ImageLayout]::Stretch
    $form.Controls.Add($brandPanel)
    $brandPanel.Controls.Add($brandIcon)
    $brandIcon.BackColor = [System.Drawing.Color]::Transparent
    Set-UiBounds $brandIcon 84 101 72 72
    $brandName = New-Object System.Windows.Forms.Label
    $brandName.Text = 'Code-Codex'
    Set-UiBounds $brandName 12 188 216 40
    $brandName.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    Set-UiFont $brandName 20 ([System.Drawing.FontStyle]::Bold)
    $brandName.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 53)
    $brandName.BackColor = [System.Drawing.Color]::Transparent
    $brandPanel.Controls.Add($brandName)
    $brandTagline = New-Object System.Windows.Forms.Label
    $brandTagline.Text = "Your workspace, expanded."
    Set-UiBounds $brandTagline 16 233 208 38
    $brandTagline.TextAlign = [System.Drawing.ContentAlignment]::TopCenter
    $brandTagline.ForeColor = [System.Drawing.Color]::FromArgb(83, 103, 122)
    $brandTagline.BackColor = [System.Drawing.Color]::Transparent
    $brandPanel.Controls.Add($brandTagline)
    $brandVersion = New-Object System.Windows.Forms.Label
    $brandVersion.Text = 'v' + $env:CLE_PROGRESS_VERSION
    Set-UiBounds $brandVersion 20 408 200 22
    $brandVersion.ForeColor = [System.Drawing.Color]::FromArgb(83, 103, 122)
    $brandVersion.BackColor = [System.Drawing.Color]::Transparent
    $brandPanel.Controls.Add($brandVersion)
    $stepCaption = New-Object System.Windows.Forms.Label
    Set-UiBounds $stepCaption 268 26 424 22
    $stepCaption.ForeColor = [System.Drawing.Color]::FromArgb(83, 103, 122)
    $form.Controls.Add($stepCaption)
    Set-UiBounds $status 268 65 424 78
    Set-UiFont $status 20 ([System.Drawing.FontStyle]::Bold)
    $status.AutoEllipsis = $false
    $status.UseCompatibleTextRendering = $false
    $status.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 53)
    $status.TextAlign = [System.Drawing.ContentAlignment]::TopLeft
    Set-UiBounds $detail 268 152 424 58
    $detail.TextAlign = [System.Drawing.ContentAlignment]::TopLeft
    $detail.AutoEllipsis = $false
    $detail.ForeColor = [System.Drawing.Color]::FromArgb(83, 91, 104)
    Set-UiBounds $bar 268 285 424 16
    $bar.Visible = $false

    $licenseBox = New-Object System.Windows.Forms.TextBox
    $licenseBox.Name = 'LicenseText'
    $licenseBox.AccessibleName = 'License agreement'
    Set-UiBounds $licenseBox 268 159 424 124
    $licenseBox.ReadOnly = $true
    $licenseBox.Multiline = $true
    $licenseBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
    $licenseBox.BackColor = [System.Drawing.Color]::FromArgb(247, 249, 251)
    $licenseBox.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    Set-UiFont $licenseBox 9
    $licenseBox.Text = [IO.File]::ReadAllText($env:CLE_SETUP_LICENSE_PATH) -replace "\r?\n", "`r`n"
    $licenseBox.TabIndex = 0
    $form.Controls.Add($licenseBox)
    $agreement = New-Object System.Windows.Forms.CheckBox
    $agreement.Name = 'AcceptLicense'
    $agreement.Text = 'I accept the license agreement'
    Set-UiBounds $agreement 268 291 424 28
    $agreement.TabIndex = 1
    $form.Controls.Add($agreement)
    $custom = New-Object System.Windows.Forms.CheckBox
    $custom.Name = 'CustomInstallation'
    $custom.Text = 'Custom installation'
    Set-UiBounds $custom 268 154 424 28
    $custom.TabIndex = 0
    $form.Controls.Add($custom)
    $pathPanel = New-Object System.Windows.Forms.Panel
    Set-UiBounds $pathPanel 268 186 424 136
    $pathPanel.TabIndex = 1
    $form.Controls.Add($pathPanel)
    $pathLabel = New-Object System.Windows.Forms.Label
    $pathLabel.Text = 'Installation folder'
    Set-UiBounds $pathLabel 0 0 424 22
    $pathPanel.Controls.Add($pathLabel)
    $pathBox = New-Object System.Windows.Forms.TextBox
    $pathBox.Name = 'InstallationFolder'
    $pathBox.Text = $script:setupRoot
    Set-UiBounds $pathBox 0 28 320 28
    $pathBox.TabIndex = 0
    $pathBox.AccessibleName = 'Installation folder'
    $pathPanel.Controls.Add($pathBox)
    $browse = New-Object System.Windows.Forms.Button
    $browse.Name = 'BrowseFolder'
    $browse.Text = 'Browse...'
    Set-UiBounds $browse 330 26 94 32
    $browse.TabIndex = 1
    $pathPanel.Controls.Add($browse)
    $pathHint = New-Object System.Windows.Forms.Label
    $pathHint.Name = 'FolderFeedback'
    Set-UiBounds $pathHint 0 67 424 66
    $pathHint.ForeColor = [System.Drawing.Color]::FromArgb(83, 91, 104)
    $pathHint.Text = 'Settings, plugins and logs will be stored in this folder.'
    $pathPanel.Controls.Add($pathHint)
    $actions = New-Object System.Windows.Forms.Panel
    Set-UiBounds $actions 240 386 480 64
    $actions.BackColor = [System.Drawing.Color]::White
    $actions.TabIndex = 3
    $form.Controls.Add($actions)
    $back = New-Object System.Windows.Forms.Button
    $back.Name = 'PreviousStep'
    $back.Text = 'Back'
    Set-UiBounds $back 28 14 80 36
    $back.TabIndex = 0
    $actions.Controls.Add($back)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Name = 'CancelSetup'
    $cancel.Text = 'Cancel'
    Set-UiBounds $cancel 244 14 96 36
    $cancel.TabIndex = 1
    $actions.Controls.Add($cancel)
    $install = New-Object System.Windows.Forms.Button
    $install.Name = 'WizardAction'
    Set-UiBounds $install 352 14 100 36
    $install.BackColor = [System.Drawing.Color]::FromArgb(35, 95, 192)
    $install.ForeColor = [System.Drawing.Color]::White
    $install.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $install.FlatAppearance.BorderSize = 0
    $install.TabIndex = 2
    $actions.Controls.Add($install)
    foreach ($button in @($back, $cancel, $browse)) {
        $button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
        $button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(218, 224, 230)
        $button.BackColor = [System.Drawing.Color]::White
        $button.ForeColor = [System.Drawing.Color]::FromArgb(48, 61, 74)
    }
    function Show-SetupPage([string]$Page) {
        Write-UiEvent 'wizard page' 'shown' @{page=$Page}
        $script:setupPage = $Page
        $licenseBox.Visible = $Page -eq 'license'
        $agreement.Visible = $Page -eq 'license'
        $custom.Visible = $Page -eq 'folder' -and -not $script:setupExisting
        $pathPanel.Visible = $Page -eq 'folder' -and ($script:setupExisting -or $custom.Checked)
        $bar.Visible = $Page -eq 'installing'
        $actions.Visible = $Page -ne 'installing'
        $back.Visible = $Page -in @('license', 'folder')
        $cancel.Visible = $Page -ne 'finish'
        $install.Enabled = $Page -ne 'license' -or $agreement.Checked
        $form.AcceptButton = if ($Page -eq 'installing') { $null } else { $install }
        $form.CancelButton = if ($Page -eq 'finish') { $install } elseif ($Page -eq 'installing') { $null } else { $cancel }
        $form.ControlBox = $Page -ne 'installing'
        Set-UiFont $status $(if ($Page -eq 'welcome') { 20 } else { 18 }) ([System.Drawing.FontStyle]::Bold)
        Set-UiBounds $status 268 50 424 $(if ($Page -eq 'welcome') { 78 } else { 40 })
        Set-UiBounds $detail 268 $(if ($Page -eq 'welcome') { 136 } else { 98 }) 424 58
        switch ($Page) {
            'welcome' {
                $stepCaption.Text = 'WELCOME'
                $status.Text = "Welcome to`nCode-Codex Setup"
                $detail.Text = 'Add a file tree, previews and customizable backgrounds to your Codex workspace.'
                $install.Text = 'Next'
            }
            'license' {
                $stepCaption.Text = '01 / LICENSE AGREEMENT'
                $status.Text = 'License Agreement'
                $detail.Text = 'Code-Codex uses the MIT License. Third-party license notices are included with the installed software.'
                $install.Text = 'Next'
                [void]$licenseBox.Focus()
                $licenseBox.Select(0, 0)
                $licenseBox.ScrollToCaret()
            }
            'folder' {
                $stepCaption.Text = '02 / INSTALLATION FOLDER'
                $status.Text = if ($script:setupExisting) { 'Update Code-Codex' } else { 'Installation Folder' }
                $detail.Text = if ($script:setupExisting) { 'Your settings, downloaded plugins and media will be kept.' } else { 'Use the default folder on your C drive, or choose a dedicated folder.' }
                $install.Text = 'Install'
            }
            'installing' {
                $stepCaption.Text = '03 / INSTALLING'
                $status.Text = 'Preparing setup...'
                $detail.Text = 'Preparing the installation files.'
            }
            'finish' {
                $stepCaption.Text = '04 / COMPLETE'
                $status.Text = 'Installation Complete'
                $install.Text = 'Finish'
                $script:allowClose = $true
            }
        }
        Update-UiLayout
    }
    $agreement.Add_CheckedChanged({ Write-UiEvent 'license consent' 'changed' @{accepted=$agreement.Checked}; if ($script:setupPage -eq 'license') { $install.Enabled = $agreement.Checked } })
    $custom.Add_CheckedChanged({
        $pathPanel.Visible = $script:setupPage -eq 'folder' -and $custom.Checked
        if (-not $custom.Checked) { $pathBox.Text = $script:setupRoot }
    })
    $browse.Add_Click({
        Write-UiEvent 'folder picker' 'opened'
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Choose a parent folder. A dedicated Code-Codex folder will be created.'
        $dialog.SelectedPath = Split-Path -Parent $pathBox.Text
        try { if ($dialog.ShowDialog($form) -eq 'OK') { $pathBox.Text = Join-Path $dialog.SelectedPath 'Code-Codex' } }
        finally { $dialog.Dispose(); Write-UiEvent 'folder picker' 'closed' }
    })
    function Test-SetupFolder {
        try {
            $root = Assert-CodeCodexRoot $pathBox.Text
            if ($script:setupExisting -and -not $root.Equals([IO.Path]::GetFullPath($script:setupExistingRoot).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Updates must use the existing installation folder.'
            }
            if (Test-Path -LiteralPath (Join-Path $root 'storage-layout.json')) { $null = Assert-CodeCodexRoot $root -Owned }
            elseif (-not $script:setupExisting -and (Test-Path -LiteralPath $root) -and @(Get-ChildItem -LiteralPath $root -Force).Count -gt 0) {
                throw 'Choose an empty dedicated folder, or an existing Code-Codex data folder.'
            }
            $pathHint.ForeColor = [System.Drawing.Color]::FromArgb(83, 91, 104)
            $pathHint.Text = 'Settings, plugins and logs will be stored in this folder.'
            return $root
        } catch {
            Write-UiEvent 'folder validation' 'failed' @{reason=$_.Exception.Message;type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult}
            $pathHint.ForeColor = [System.Drawing.Color]::FromArgb(170, 35, 35)
            $pathHint.Text = $_.Exception.Message
            return $null
        }
    }
    $pathBox.Add_Leave({ if ($script:setupPage -eq 'folder') { $null = Test-SetupFolder } })
    $pathBox.Add_TextChanged({
        $pathHint.ForeColor = [System.Drawing.Color]::FromArgb(83, 91, 104)
        $pathHint.Text = 'Settings, plugins and logs will be stored in this folder.'
    })
    $back.Add_Click({ if ($script:setupPage -ne 'report') { Show-SetupPage $(if ($script:setupPage -eq 'folder') { 'license' } else { 'welcome' }) } })
    $cancel.Add_Click({ if ($script:setupPage -ne 'report') { Write-UiEvent 'user action' 'cancelled'; $form.Close() } })
    $install.Add_Click({
        switch ($script:setupPage) {
            'welcome' { Show-SetupPage 'license'; return }
            'license' { if ($agreement.Checked) { Show-SetupPage 'folder' }; return }
            'finish' { Write-UiEvent 'user action' 'Finish'; $form.Close(); return }
            'report' { Write-UiEvent 'user action' 'Close report'; $form.Close(); return }
        }
        if ($script:setupPage -ne 'folder' -or -not $script:setupPending -or -not $agreement.Checked) { return }
        $root = Test-SetupFolder
        if (-not $root) {
            if (-not $script:setupExisting) { $custom.Checked = $true }
            $pathPanel.Visible = $true
            $pathBox.Focus()
            return
        }
        try {
            $decision = @{ installRoot = $root } | ConvertTo-Json -Compress
            $stagedDecision = $env:CLE_SETUP_DECISION_PATH + '.tmp'
            [IO.File]::WriteAllText($stagedDecision, $decision, [System.Text.UTF8Encoding]::new($false))
            [IO.File]::Move($stagedDecision, $env:CLE_SETUP_DECISION_PATH)
        } catch {
            Write-UiEvent 'folder response' 'write failed' @{reason=$_.Exception.Message;hresult=$_.Exception.HResult}
            $pathPanel.Visible = $true
            $pathHint.ForeColor = [System.Drawing.Color]::FromArgb(170, 35, 35)
            $pathHint.Text = 'Setup could not start: ' + $_.Exception.Message
            return
        }
        $script:setupPending = $false
        Show-SetupPage 'installing'
    })
    if ($script:setupExisting) {
        $pathBox.ReadOnly = $true
        $browse.Enabled = $false
        $pathHint.Text = 'Installation folder is locked during updates. Your settings, plugins and media will be kept.'
    } elseif ($env:CLE_SETUP_INITIAL_ROOT) { $custom.Checked = $true }
    Show-SetupPage $(if ($script:setupPending) { 'welcome' } else { 'installing' })
    $form.Add_FormClosing({
        if (-not $script:setupPending -and -not $script:allowClose -and $_.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) { $_.Cancel = $true }
    })
    $form.Add_FormClosed({
        if ($brandPanel.BackgroundImage) { $brandPanel.BackgroundImage.Dispose() }
    })
}

function Set-ProgressMessage([string]$Message) {
    $lines = $Message -split "`n", 2
    $status.Text = $lines[0]
    $detail.Text = if ($lines.Length -gt 1) { $lines[1] } else { '' }
}

$parentId = 0
[void][int]::TryParse($env:CLE_PROGRESS_PARENT_PID, [ref]$parentId)
$script:lastCommand = ''
$script:parentCheckTicks = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50
$timer.Add_Tick({
    $script:parentCheckTicks++
    if ($script:parentCheckTicks -ge 20) {
        $script:parentCheckTicks = 0
        try { Write-UiMarker $env:CLE_PROGRESS_HEARTBEAT_PATH 'alive' } catch { Write-UiEvent 'heartbeat' 'write failed' @{reason=$_.Exception.Message} }
        try {
            $parent = [System.Diagnostics.Process]::GetProcessById($parentId)
            if ($parent.HasExited) {
                $timer.Stop()
                $script:allowClose = $true
                $form.Close()
                return
            }
            $parent.Dispose()
        } catch {
            $timer.Stop()
            $script:allowClose = $true
            $form.Close()
            return
        }
    }

    try {
        $command = [IO.File]::ReadAllText($env:CLE_PROGRESS_STATE_PATH)
        if ($command -ne $script:lastCommand) {
            $parts = $command -split '\|', 4
            if ($parts.Length -eq 4 -and $parts[1] -eq 'close') {
                $script:lastCommand = $command
                $timer.Stop()
                $script:allowClose = $true
                $form.Close()
                return
            } elseif (-not $script:setupPending -and $parts.Length -eq 4 -and $parts[1] -eq 'finish' -and $script:setupWizard) {
                Show-SetupPage 'finish'
                Set-UiBounds $detail 268 112 424 ([int][Math]::Round($form.ClientSize.Height/($form.LayoutDpi/96.0))-190)
                $detail.Text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[3]))
                $form.Refresh()
                Write-UiMarker $env:CLE_PROGRESS_ACK_PATH ($parts[0]+'|finish')
                Write-UiEvent 'finish page' 'acknowledged' @{sequence=$parts[0]}
                $script:lastCommand = $command
            } elseif ($parts.Length -eq 4 -and $parts[1] -eq 'checks') {
                $script:setupPending = $false
                if ($script:setupWizard) { Show-SetupPage 'installing' }
                Set-ProgressMessage ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[3])))
                $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
                $script:lastCommand = $command
                Write-UiEvent 'automatic checks' 'displayed'
            } elseif ($parts.Length -eq 4 -and $parts[1] -eq 'report' -and $script:setupWizard) {
                $script:report = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[3])) | ConvertFrom-Json
                $script:setupPending = $false; $script:allowClose = $true; $script:setupPage = 'report'
                $status.Text = 'Installation Diagnostic'; Set-UiFont $status 18 ([Drawing.FontStyle]::Bold)
                $stepCaption.Text = 'DIAGNOSTIC REPORT'; $detail.Visible=$false; $bar.Visible=$false; $licenseBox.Visible=$false; $agreement.Visible=$false; $custom.Visible=$false; $pathPanel.Visible=$false
                if (-not $script:reportBox) {
                    $script:reportBox = New-Object System.Windows.Forms.TextBox
                    $script:reportBox.Name = 'DiagnosticReport'; $script:reportBox.Multiline=$true; $script:reportBox.ReadOnly=$true; $script:reportBox.ScrollBars='Vertical'; $script:reportBox.BackColor=[Drawing.Color]::FromArgb(247,249,251)
                    Set-UiBounds $script:reportBox 268 112 424 ([int][Math]::Round($form.ClientSize.Height/($form.LayoutDpi/96.0))-190); $form.Controls.Add($script:reportBox)
                    $back.Add_Click({ if ($script:setupPage -eq 'report') { try { [System.Windows.Forms.Clipboard]::SetText([string]$script:report.message); Write-UiEvent 'report copy' 'completed' } catch { Write-UiEvent 'report copy' 'failed' @{reason=$_.Exception.Message} } } })
                    $cancel.Add_Click({ if ($script:setupPage -eq 'report' -and $script:report.path) { try { [Diagnostics.Process]::Start((Join-Path $env:SystemRoot 'System32\notepad.exe'),('"'+$script:report.path+'"')) | Out-Null;Write-UiEvent 'report open' 'completed' } catch { Write-UiEvent 'report open' 'failed' @{reason=$_.Exception.Message} } } })
                }
                $script:reportBox.Text=([string]$script:report.message) -replace "\r?\n", "`r`n"; $script:reportBox.Select(0,0)
                $actions.Visible=$true; $back.Visible=$true; $cancel.Visible=$true
                $back.Text='Copy details'; $cancel.Text='Open report'; $cancel.Enabled=[bool]$script:report.path
                $install.Text='Close'; $install.Enabled=$true; $form.ControlBox=$true; $form.AcceptButton=$install; $form.CancelButton=$install
                Update-UiLayout; $form.Refresh(); Write-UiMarker $env:CLE_PROGRESS_ACK_PATH ($parts[0]+'|report')
                Write-UiEvent 'diagnostic report' 'acknowledged' @{sequence=$parts[0]}
                $script:lastCommand=$command
            } elseif (-not $script:setupPending -and $parts.Length -eq 4 -and $parts[1] -eq 'progress') {
                $value = 0
                if ([int]::TryParse($parts[2], [ref]$value)) {
                    $bar.MarqueeAnimationSpeed = 0
                    $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
                    $bar.Value = [Math]::Max(0, [Math]::Min(100, $value))
                }
                Set-ProgressMessage ([System.Text.Encoding]::UTF8.GetString(
                    [Convert]::FromBase64String($parts[3])
                ))
                $script:lastCommand = $command
            } elseif (-not $script:setupPending -and $parts.Length -eq 4 -and $parts[1] -eq 'marquee') {
                Set-ProgressMessage ([System.Text.Encoding]::UTF8.GetString(
                    [Convert]::FromBase64String($parts[3])
                ))
                $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
                $bar.MarqueeAnimationSpeed = 24
                $script:lastCommand = $command
            }
        }
    } catch {
        if ($script:lastUiReadError -ne $_.Exception.Message) { $script:lastUiReadError=$_.Exception.Message;Write-UiEvent 'UI command processing' 'failed' @{reason=$_.Exception.Message;type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult} }
    }
})
$form.Add_LayoutDpiChanged({ Update-UiLayout })
Update-UiLayout
$form.Add_Shown({
    Update-UiLayout
    $form.TopMost = $true
    $form.BringToFront()
    [void]$form.Activate()
    Write-UiMarker $env:CLE_PROGRESS_HEARTBEAT_PATH 'alive'
    [IO.File]::WriteAllText(
        $env:CLE_PROGRESS_READY_PATH,
        'ready',
        (New-Object System.Text.UTF8Encoding($false))
    )
    Write-UiEvent 'UI ready' 'confirmed' @{dpi=$form.LayoutDpi;width=$form.ClientSize.Width;height=$form.ClientSize.Height}
})
$form.Add_FormClosed({
    Write-UiEvent 'UI window' 'closed' @{page=$script:setupPage}
    $timer.Stop(); $timer.Dispose()
    if ($brandIcon.Image) { $brandIcon.Image.Dispose() }
    foreach ($font in $script:ownedUiFonts.Values) { $font.Dispose() }
    $script:ownedUiFonts.Clear()
})
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
"#;

#[allow(dead_code)]
pub(crate) struct ProgressDialog {
    child: Option<Child>,
    state_directory: Option<tempfile::TempDir>,
    state_path: Option<PathBuf>,
    sequence: u64,
    journal: SetupJournal,
    startup_error: Option<String>,
    manual: bool,
    heartbeat_missing_since: std::cell::Cell<Option<Instant>>,
}

#[allow(dead_code)]
impl ProgressDialog {
    pub(crate) fn open(title: &str, message: &str, value: u8, version: &str) -> Self {
        Self::open_mode(title, message, value, version, false, None, None)
    }

    pub(crate) fn open_setup(
        title: &str,
        version: &str,
        initial_root: Option<&std::ffi::OsStr>,
        background: &[u8],
        license: &str,
    ) -> Self {
        Self::open_mode(
            title,
            "Ready to install",
            0,
            version,
            true,
            initial_root,
            Some((background, license)),
        )
    }

    pub(crate) fn open_update(
        title: &str,
        version: &str,
        background: &[u8],
        license: &str,
    ) -> Self {
        Self::open_mode(
            title,
            "Preparing setup...",
            0,
            version,
            false,
            None,
            Some((background, license)),
        )
    }

    fn open_mode(
        title: &str,
        message: &str,
        value: u8,
        version: &str,
        select: bool,
        initial_root: Option<&std::ffi::OsStr>,
        setup_assets: Option<(&[u8], &str)>,
    ) -> Self {
        let journal = SetupJournal::new();
        journal.event(
            "UI resources",
            "started",
            json!({"selectDirectory":select,"brandedWizard":setup_assets.is_some()}),
        );
        let powershell = match trusted_system32_powershell() {
            Ok(p) => p,
            Err(e) => {
                return Self::failed(journal, format!("Trusted PowerShell discovery failed: {e}"));
            }
        };
        let state_directory = match tempfile::Builder::new()
            .prefix("CodeCodex-Progress-")
            .tempdir_in(
                workspace_service::application_paths::temp_root()
                    .unwrap_or_else(|_| std::env::temp_dir()),
            ) {
            Ok(v) => v,
            Err(e) => {
                return Self::failed(
                    journal,
                    format!(
                        "UI communication directory creation failed: {e}; OS code={:?}",
                        e.raw_os_error()
                    ),
                );
            }
        };
        let ready_path = state_directory.path().join("ready");
        let state_path = state_directory.path().join("state");
        let icon_path = state_directory.path().join("CodeCodex.Brand.png");
        let storage_contract_path = state_directory.path().join("Storage-Layout.ps1");
        let background_path = state_directory.path().join("Setup.Background.png");
        let license_path = state_directory.path().join("LICENSE.txt");
        let script_path = state_directory.path().join("Setup.UI.ps1");
        let ui_script = format!("\u{feff}{PROGRESS_DIALOG_SCRIPT}");
        let mut resources: Vec<(&Path, &[u8])> = vec![
            (&script_path, ui_script.as_bytes()),
            (&state_path, b"0|progress|0|"),
            (&icon_path, include_bytes!("../resources/code-codex.png")),
        ];
        if setup_assets.is_some() {
            resources.push((
                &storage_contract_path,
                include_bytes!("../../../installer/Storage-Layout.ps1"),
            ));
        }
        if let Some((background, license)) = setup_assets {
            resources.push((&background_path, background));
            resources.push((&license_path, license.as_bytes()));
        }
        for (path, bytes) in resources {
            if let Err(e) = fs::write(path, bytes) {
                return Self::failed(
                    journal,
                    format!(
                        "UI resource {} could not be written: {e}; OS code={:?}",
                        path.file_name().unwrap_or_default().to_string_lossy(),
                        e.raw_os_error()
                    ),
                );
            }
        }
        journal.event(
            "UI resources",
            "completed",
            json!({"embeddedAssets":setup_assets.is_some()}),
        );
        let executable = env::current_exe().unwrap_or_default();
        let mut command = Command::new(powershell);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-STA",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&script_path)
            .env("CLE_PROGRESS_TITLE", title)
            .env("CLE_PROGRESS_MESSAGE", single_line_message(message))
            .env("CLE_PROGRESS_VALUE", value.min(100).to_string())
            .env("CLE_PROGRESS_VERSION", single_line_message(version))
            .env("CLE_PROGRESS_ICON_PATH", &icon_path)
            .env("CLE_PROGRESS_EXECUTABLE", executable)
            .env("CLE_PROGRESS_READY_PATH", &ready_path)
            .env("CLE_PROGRESS_STATE_PATH", &state_path)
            .env("CLE_PROGRESS_PARENT_PID", std::process::id().to_string())
            .env("CLE_SETUP_BACKGROUND_PATH", &background_path)
            .env("CLE_SETUP_LICENSE_PATH", &license_path)
            .env("CLE_SETUP_SELECT", if select { "1" } else { "0" })
            .env(
                "CLE_SETUP_WIZARD",
                if setup_assets.is_some() { "1" } else { "0" },
            )
            .env("CLE_SETUP_INITIAL_ROOT", initial_root.unwrap_or_default())
            .env("CLE_SETUP_STORAGE_CONTRACT", &storage_contract_path)
            .env(
                "CLE_SETUP_DECISION_PATH",
                state_directory.path().join("selection.json"),
            )
            .env("CLE_PROGRESS_ACK_PATH", state_directory.path().join("ack"))
            .env(
                "CLE_PROGRESS_HEARTBEAT_PATH",
                state_directory.path().join("heartbeat"),
            )
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_hidden(&mut command);

        journal.event("UI process", "starting", json!({"readyLimitMs":8000}));
        let mut child = match command.spawn() {
            Ok(c) => c,
            Err(e) => {
                return Self::failed(
                    journal,
                    format!(
                        "UI PowerShell process could not start: {e}; OS code={:?}",
                        e.raw_os_error()
                    ),
                );
            }
        };
        journal.event("UI process", "started", json!({"pid":child.id()}));
        journal.attach(&mut child, "setup UI");
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut ready = false;
        while Instant::now() < deadline {
            if fs::read_to_string(&ready_path).is_ok_and(|contents| contents == "ready") {
                ready = true;
                break;
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    journal.event(
                        "UI process",
                        "exited before ready",
                        json!({"exitCode":status.code()}),
                    );
                    break;
                }
                Err(e) => {
                    journal.event(
                        "UI process",
                        "wait failed",
                        json!({"reason":e.to_string(),"osCode":e.raw_os_error()}),
                    );
                    break;
                }
                Ok(None) => {}
            }
            thread::sleep(Duration::from_millis(20));
        }
        if !ready {
            let kill = child.kill();
            if kill.is_ok() {
                let _ = child.wait();
            }
            journal.event(
                "UI ready",
                "failed",
                json!({"killSucceeded":kill.is_ok(),"limitMs":8000}),
            );
            journal.settle();
            return Self::failed(journal,"The setup window did not confirm readiness within 8 seconds; see captured helper errors.".into());
        }
        journal.event("UI ready", "confirmed", json!({"pid":child.id()}));
        Self {
            child: Some(child),
            state_directory: Some(state_directory),
            state_path: Some(state_path),
            sequence: 0,
            journal,
            startup_error: None,
            manual: setup_assets.is_some(),
            heartbeat_missing_since: std::cell::Cell::new(None),
        }
    }

    pub(crate) fn set_progress(&mut self, value: u8, message: &str) {
        let _ = self.send("progress", value, message);
    }

    pub(crate) fn set_progress_detail(&mut self, value: u8, stage: &str, detail: &str) {
        let _ = self.send("progress", value, &format!("{stage}\n{detail}"));
    }

    pub(crate) fn state_path(&self) -> Option<&Path> {
        self.state_path.as_deref()
    }

    pub(crate) fn window_ready(&self) -> bool {
        self.child.is_some()
    }

    pub(crate) fn startup_failure(&self) -> Option<&str> {
        self.startup_error.as_deref()
    }

    pub(crate) fn wait_for_setup_selection(
        &mut self,
    ) -> Result<Option<std::ffi::OsString>, String> {
        let directory = self.state_directory.as_ref().ok_or_else(|| {
            self.startup_error.clone().unwrap_or(
                "The setup window could not be displayed; installation was not started.".into(),
            )
        })?;
        let path = directory.path().join("selection.json");
        loop {
            match fs::read(&path) {
                Ok(bytes) => {
                    #[derive(serde::Deserialize)]
                    #[serde(rename_all = "camelCase", deny_unknown_fields)]
                    struct Selection {
                        install_root: String,
                    }
                    if bytes.len() > 4096 {
                        return Err(
                            "Invalid setup folder response; installation was not started.".into(),
                        );
                    }
                    let selection: Selection = serde_json::from_slice(&bytes)
                        .map_err(|e| format!("Invalid setup folder response: {e}"))?;
                    if selection.install_root.is_empty()
                        || selection.install_root.contains(['\0', '\r', '\n'])
                    {
                        return Err(
                            "Invalid setup folder response; installation was not started.".into(),
                        );
                    }
                    self.journal.event(
                        "folder response",
                        "accepted",
                        json!({"responseBytes":bytes.len()}),
                    );
                    return Ok(Some(selection.install_root.into()));
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("Setup folder response could not be read: {e}")),
            }
            let child = self
                .child
                .as_mut()
                .ok_or("The setup window is unavailable.")?;
            if let Some(status) = child
                .try_wait()
                .map_err(|e| format!("Setup window status could not be read: {e}"))?
            {
                return if status.success() {
                    Ok(None)
                } else {
                    Err(format!(
                        "Setup window exited before installation started: {status}"
                    ))
                };
            }
            self.check_heartbeat()?;
            thread::sleep(Duration::from_millis(50));
        }
    }

    pub(crate) fn finish_setup(&mut self, message: &str) -> Result<(), String> {
        let sequence = self.send("finish", 100, message)?;
        self.wait_for_ack(sequence, "finish", Duration::from_secs(8))?;
        self.journal
            .event("Finish page", "awaiting user", json!({"userDeadline":null}));
        self.wait_for_user_close()
    }

    pub(crate) fn journal(&self) -> SetupJournal {
        self.journal.clone()
    }

    pub(crate) fn checking(&mut self) {
        let _=self.send("checks",0,"Checking installation...\nSetup encountered a problem. Collecting read-only diagnostic evidence.");
    }

    pub(crate) fn show_report(&mut self, message: &str, path: Option<&Path>) -> Result<(), String> {
        if !self.manual {
            return Err(
                "Branded diagnostic page unavailable; using independent error dialog".into(),
            );
        }
        let payload = serde_json::to_string(
            &json!({"message":message,"path":path.map(|p|p.to_string_lossy())}),
        )
        .map_err(|e| e.to_string())?;
        let sequence = self.send("report", 0, &payload)?;
        self.wait_for_ack(sequence, "report", Duration::from_secs(8))?;
        self.wait_for_user_close()
    }

    fn wait_for_ack(&mut self, sequence: u64, kind: &str, timeout: Duration) -> Result<(), String> {
        let path = self
            .state_directory
            .as_ref()
            .ok_or("Setup communication directory unavailable")?
            .path()
            .join("ack");
        let started = Instant::now();
        self.journal.event(
            "UI acknowledgement",
            "waiting",
            json!({"kind":kind,"sequence":sequence,"limitMs":timeout.as_millis()}),
        );
        loop {
            if fs::read_to_string(&path).is_ok_and(|v| v == format!("{sequence}|{kind}")) {
                self.journal.event("UI acknowledgement","confirmed",json!({"kind":kind,"sequence":sequence,"durationMs":started.elapsed().as_millis()}));
                return Ok(());
            }
            if let Some(child) = self.child.as_mut() {
                if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                    return Err(format!(
                        "Setup UI exited before {kind} acknowledgement: {status}"
                    ));
                }
            } else {
                return Err("Setup UI unavailable".into());
            }
            if started.elapsed() >= timeout {
                self.journal.event(
                    "UI acknowledgement",
                    "timeout",
                    json!({"kind":kind,"sequence":sequence}),
                );
                return Err(format!(
                    "Setup UI did not acknowledge {kind} within {} ms",
                    timeout.as_millis()
                ));
            }
            self.check_heartbeat()?;
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn check_heartbeat(&self) -> Result<(), String> {
        let path = self
            .state_directory
            .as_ref()
            .ok_or("UI communication unavailable")?
            .path()
            .join("heartbeat");
        let modified = match fs::metadata(&path).and_then(|m| m.modified()) {
            Ok(t) => {
                self.heartbeat_missing_since.set(None);
                t
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let since = self.heartbeat_missing_since.get().unwrap_or_else(|| {
                    let now = Instant::now();
                    self.heartbeat_missing_since.set(Some(now));
                    now
                });
                // Windows file replacement can briefly make a marker invisible.
                // Keep the same response grace instead of treating that race as a hang.
                if since.elapsed() <= Duration::from_secs(30) {
                    return Ok(());
                }
                self.journal.event(
                    "UI heartbeat",
                    "missing",
                    json!({"durationMs":since.elapsed().as_millis(),"limitMs":30000}),
                );
                return Err(
                    "Setup UI heartbeat remained unavailable for more than 30 seconds".into(),
                );
            }
            Err(e) => return Err(format!("Setup UI heartbeat unavailable: {e}")),
        };
        let age = modified.elapsed().unwrap_or_default();
        if age > Duration::from_secs(30) {
            self.journal.event(
                "UI heartbeat",
                "stalled",
                json!({"ageMs":age.as_millis(),"limitMs":30000}),
            );
            return Err("Setup UI stopped responding for more than 30 seconds".into());
        }
        Ok(())
    }

    fn wait_for_user_close(&mut self) -> Result<(), String> {
        loop {
            match self
                .child
                .as_mut()
                .ok_or("Setup UI unavailable")?
                .try_wait()
                .map_err(|e| e.to_string())?
            {
                Some(status) => {
                    self.journal
                        .event("UI closed", "observed", json!({"exitCode":status.code()}));
                    return if status.success() {
                        Ok(())
                    } else {
                        Err(format!("Setup UI exited abnormally: {status}"))
                    };
                }
                None => {
                    self.check_heartbeat()?;
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }

    pub(crate) fn set_marquee(&mut self, message: &str) {
        let _ = self.send("marquee", 0, message);
    }

    pub(crate) fn close(&mut self) {
        if self.child.is_some() {
            let _ = self.send("close", 0, "");
        }
        let Some(mut child) = self.child.take() else {
            self.state_path = None;
            self.state_directory = None;
            return;
        };
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
                _ => break,
            }
        }
        match child.try_wait() {
            Ok(Some(_)) => {}
            _ => {
                let killed = child.kill();
                self.journal.event(
                    "UI cleanup",
                    "forced",
                    json!({"killSucceeded":killed.is_ok()}),
                );
                if killed.is_ok() {
                    let _ = child.wait();
                }
            }
        }
        self.journal.settle();
        self.journal
            .event("UI cleanup", "completed", json!({"helperOnly":true}));
        self.state_path = None;
        self.state_directory = None;
    }

    fn failed(journal: SetupJournal, error: String) -> Self {
        journal.event("UI startup", "failed", json!({"reason":error}));
        Self {
            child: None,
            state_directory: None,
            state_path: None,
            sequence: 0,
            journal,
            startup_error: Some(error),
            manual: false,
            heartbeat_missing_since: std::cell::Cell::new(None),
        }
    }

    fn send(&mut self, kind: &str, value: u8, message: &str) -> Result<u64, String> {
        self.journal.event("UI command","sending",json!({"kind":kind,"value":value,"messagePreview":single_line_message(message).chars().take(160).collect::<String>()}));
        let path = self.state_path.as_ref().ok_or_else(|| {
            self.startup_error
                .clone()
                .unwrap_or("Setup UI communication unavailable".into())
        })?;
        self.sequence = self.sequence.saturating_add(1);
        let result =
            write_progress_command(path, &progress_command(self.sequence, kind, value, message));
        if let Err(e) = result {
            self.journal.event(
                "UI command",
                "write failed",
                json!({"kind":kind,"reason":e.to_string(),"osCode":e.raw_os_error()}),
            );
            return Err(format!("Setup UI {kind} command write failed: {e}"));
        }
        Ok(self.sequence)
    }
}

impl Drop for ProgressDialog {
    fn drop(&mut self) {
        self.close();
    }
}

fn write_progress_command(path: &Path, contents: &str) -> std::io::Result<()> {
    let staged = path.with_extension("pending");
    fs::write(&staged, contents)?;
    fs::rename(&staged, path)
}

#[allow(dead_code)]
fn progress_command(sequence: u64, kind: &str, value: u8, message: &str) -> String {
    format!(
        "{sequence}|{kind}|{}|{}",
        value.min(100),
        BASE64_STANDARD.encode(message.as_bytes())
    )
}

#[allow(dead_code)]
fn single_line_message(message: &str) -> String {
    message
        .chars()
        .map(|character| {
            if character == '\r' || character == '\n' || character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect()
}

pub(crate) fn show_dialog(title: &str, message: &str, error: bool) {
    let Ok(powershell) = trusted_system32_powershell() else {
        native_dialog(title, message, error);
        return;
    };

    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            DIALOG_SCRIPT,
        ])
        .env("CLE_DIALOG_TITLE", title)
        .env("CLE_DIALOG_MESSAGE", message)
        .env("CLE_DIALOG_ERROR", if error { "1" } else { "0" })
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_hidden(&mut command);
    if !command.status().is_ok_and(|status| status.success()) {
        native_dialog(title, message, error);
    }
}

fn native_dialog(title: &str, message: &str, error: bool) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            MB_ICONERROR, MB_ICONINFORMATION, MB_OK, MessageBoxW,
        };
        let title: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
        let message: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                MB_OK
                    | if error {
                        MB_ICONERROR
                    } else {
                        MB_ICONINFORMATION
                    },
            );
        }
    }
    #[cfg(not(windows))]
    {
        eprintln!("{title}: {message}");
        let _ = error;
    }
}

#[cfg(windows)]
pub(crate) fn trusted_system32_powershell() -> Result<PathBuf, String> {
    let system_root = env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or_else(|| "the Windows system directory could not be identified".to_owned())?;
    let system_root = dunce::canonicalize(system_root)
        .map_err(|error| format!("the Windows directory could not be verified: {error}"))?;
    let system32 = dunce::canonicalize(system_root.join("System32"))
        .map_err(|error| format!("the System32 directory could not be verified: {error}"))?;
    let powershell = dunce::canonicalize(
        system32
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe"),
    )
    .map_err(|error| format!("Windows PowerShell could not be verified: {error}"))?;

    if !powershell.is_file() || !path_starts_with(&powershell, &system32) {
        return Err("trusted Windows PowerShell was not found under System32".to_owned());
    }
    Ok(powershell)
}

#[cfg(not(windows))]
pub(crate) fn trusted_system32_powershell() -> Result<PathBuf, String> {
    Err("this launcher is supported only on Windows".to_owned())
}

pub(crate) fn configure_hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

#[cfg(windows)]
fn path_starts_with(candidate: &Path, root: &Path) -> bool {
    let candidate: Vec<_> = candidate
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let root: Vec<_> = root
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    candidate.starts_with(&root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_commands_are_single_line_and_clamp_values() {
        let command = progress_command(7, "progress", 255, "Installing\r\nCode-Codex");

        assert!(command.starts_with("7|progress|100|"));
        assert_eq!(command.lines().count(), 1);
        assert!(command.is_ascii());
    }

    #[test]
    fn progress_messages_round_trip_as_utf8() {
        let message = "正在安装 | Code-Codex\r\n'$please wait'";
        let command = progress_command(8, "marquee", 0, message);
        let encoded = command.splitn(4, '|').nth(3).expect("encoded message");

        assert_eq!(
            BASE64_STANDARD.decode(encoded).expect("valid base64"),
            message.as_bytes()
        );
        assert!(command.is_ascii());
        assert_eq!(command.lines().count(), 1);
    }

    #[cfg(windows)]
    fn fixture_dialog(script: &str) -> ProgressDialog {
        let temp = tempfile::tempdir().expect("fixture temp");
        let state = temp.path().join("state");
        fs::write(&state, "").expect("fixture state");
        fs::write(temp.path().join("heartbeat"), "alive").expect("fixture heartbeat");
        let mut command =
            Command::new(trusted_system32_powershell().expect("trusted fixture shell"));
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("FIXTURE_ROOT", temp.path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_hidden(&mut command);
        let mut child = command.spawn().expect("fixture process");
        let journal = SetupJournal::new();
        journal.attach(&mut child, "fixture UI");
        ProgressDialog {
            child: Some(child),
            state_directory: Some(temp),
            state_path: Some(state),
            sequence: 0,
            journal,
            startup_error: None,
            manual: true,
            heartbeat_missing_since: std::cell::Cell::new(None),
        }
    }

    #[test]
    #[cfg(windows)]
    fn finish_waits_for_matching_ack_before_user_exit() {
        let script = r#"$p=Join-Path $env:FIXTURE_ROOT 'state';do{Start-Sleep -Milliseconds 10;$v=[IO.File]::ReadAllText($p)}while($v -notmatch '^1\|finish\|');[IO.File]::WriteAllText((Join-Path $env:FIXTURE_ROOT 'ack'),'1|finish');Start-Sleep -Milliseconds 100;exit 0"#;
        let mut d = fixture_dialog(script);
        assert!(d.finish_setup("done").is_ok());
        d.close();
        assert!(d.journal.text().contains("confirmed"));
    }
    #[test]
    #[cfg(windows)]
    fn absent_or_wrong_ack_has_a_bounded_wait() {
        let mut d = fixture_dialog("Start-Sleep -Seconds 5");
        fs::write(
            d.state_directory.as_ref().unwrap().path().join("ack"),
            "99|finish",
        )
        .unwrap();
        let error = d
            .wait_for_ack(1, "finish", Duration::from_millis(120))
            .unwrap_err();
        assert!(error.contains("acknowledge"));
        d.close();
        assert!(d.journal.text().contains("timeout"));
    }
    #[test]
    #[cfg(windows)]
    fn helper_error_output_survives_exit_and_cleanup() {
        let mut d =
            fixture_dialog("[Console]::Error.WriteLine('fixture UI render failure');exit 7");
        assert!(d.wait_for_ack(1, "finish", Duration::from_secs(4)).is_err());
        d.close();
        let text = d.journal.text();
        assert!(text.contains("fixture UI render failure"));
        assert!(text.contains("totalBytes"));
    }
    #[test]
    #[cfg(windows)]
    fn command_write_failure_is_reported_without_waiting() {
        let mut d = fixture_dialog("exit 0");
        let path = d.state_path.as_ref().unwrap();
        fs::remove_file(path).unwrap();
        fs::create_dir(path).unwrap();
        assert!(d.finish_setup("done").unwrap_err().contains("write failed"));
        d.close();
        assert!(d.journal.text().contains("write failed"));
    }
    #[test]
    #[cfg(windows)]
    fn stale_heartbeat_is_distinct_from_user_wait() {
        let mut d = fixture_dialog("exit 0");
        let path = d.state_directory.as_ref().unwrap().path().join("heartbeat");
        let file = fs::OpenOptions::new().write(true).open(path).unwrap();
        file.set_times(
            fs::FileTimes::new()
                .set_modified(std::time::SystemTime::now() - Duration::from_secs(31)),
        )
        .unwrap();
        assert!(
            d.check_heartbeat()
                .unwrap_err()
                .contains("stopped responding")
        );
        d.close();
    }
    #[cfg(windows)]
    #[test]
    fn heartbeat_replacement_gap_is_not_an_immediate_ui_failure() {
        let mut d = fixture_dialog("exit 0");
        fs::remove_file(d.state_directory.as_ref().unwrap().path().join("heartbeat")).unwrap();
        assert!(d.check_heartbeat().is_ok());
        d.heartbeat_missing_since
            .set(Some(Instant::now() - Duration::from_secs(31)));
        assert!(
            d.check_heartbeat()
                .unwrap_err()
                .contains("remained unavailable")
        );
        d.close();
    }
}
