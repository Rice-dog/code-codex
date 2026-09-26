//! Early, local-only splash. It appears before Codex is spawned and remains
//! until the verified renderer has evaluated the Code-Codex bootstrap.

use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tempfile::TempDir;

use crate::bridge::startup_splash_window;
use crate::gui_support::{configure_hidden, trusted_system32_powershell};

const SPLASH_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Windows.Forms.dll' -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
namespace CodeCodexSplashNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    public sealed class WindowHandle : IWin32Window {
        public WindowHandle(IntPtr handle) { Handle = handle; }
        public IntPtr Handle { get; private set; }
    }
    public static class Win32 {
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
        [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr handle, uint command);
    }
}
'@
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = [System.Windows.Forms.Form]::new()
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 11, 14)
$flags = [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::NonPublic
[System.Windows.Forms.Control].GetProperty('DoubleBuffered', $flags).SetValue($form, $true)
$form.Opacity = 1.0

$ink = [System.Drawing.Brushes]::White
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(169, 185, 178))
$grid = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(19, 141, 184, 169), 1)
$ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(100, 169, 223, 198), 2)
$highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(200, 184, 242, 214), 3)
$wordmark = [System.Drawing.Font]::new('Segoe UI Light', 62, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$caption = [System.Drawing.Font]::new('Consolas', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$script:angle = 0.0
$script:closing = $false
$script:target = [IntPtr]::Zero
$script:owner = $null
$script:shown = $false

$form.Add_Paint({
    param($sender, $event)
    $g = $event.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $width = $sender.ClientSize.Width
    $height = $sender.ClientSize.Height
    for ($x = 0; $x -lt $width; $x += 52) { $g.DrawLine($grid, $x, 0, $x, $height) }
    for ($y = 0; $y -lt $height; $y += 52) { $g.DrawLine($grid, 0, $y, $width, $y) }
    $cx = [single]($width / 2)
    $cy = [single]($height / 2)
    $g.DrawEllipse($ring, $cx - 46, $cy - 126, 92, 92)
    $g.DrawArc($highlight, $cx - 36, $cy - 116, 72, 72, [single]$script:angle, 95)
    $size = $g.MeasureString('CODEX.', $wordmark)
    $g.DrawString('CODEX.', $wordmark, $ink, [single]($cx - $size.Width / 2), [single]($cy - 18))
    $subtitle = 'YOUR WORKSPACE IS COMING INTO FOCUS'
    $size = $g.MeasureString($subtitle, $caption)
    $g.DrawString($subtitle, $caption, $muted, [single]($cx - $size.Width / 2), [single]($cy + 68))
    $g.DrawString('INITIALIZING WORKSPACE', $caption, $muted, 32, 29)
    $g.DrawString('READY WHEN YOU ARE', $caption, $muted, 32, [single]($height - 43))
})

$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval = 33
$timer.Add_Tick({
    if ([IO.File]::Exists($env:CLE_SPLASH_CLOSE_PATH)) { $script:closing = $true }
    if ($script:closing) {
        if (-not $script:shown) { $context.ExitThread(); return }
        $form.Opacity = [Math]::Max(0.0, [double]($form.Opacity - 0.12))
        if ($form.Opacity -le 0.01) { $form.Close(); return }
    } else {
        if ($script:target -eq [IntPtr]::Zero -and [IO.File]::Exists($env:CLE_SPLASH_TARGET_PATH)) {
            try {
                $script:target = [IntPtr]::new([long]::Parse([IO.File]::ReadAllText($env:CLE_SPLASH_TARGET_PATH)))
                $script:owner = [CodeCodexSplashNative.WindowHandle]::new($script:target)
            } catch { $script:closing = $true; return }
        }
        if ($script:target -ne [IntPtr]::Zero) {
            if (-not [CodeCodexSplashNative.Win32]::IsWindow($script:target)) {
                $script:closing = $true; return
            }
            $rect = [CodeCodexSplashNative.Rect]::new()
            if (-not [CodeCodexSplashNative.Win32]::GetWindowRect($script:target, [ref]$rect)) { return }
            if ($rect.Right -le $rect.Left -or $rect.Bottom -le $rect.Top) { return }
            $bounds = [System.Drawing.Rectangle]::FromLTRB($rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
            if ($form.Bounds -ne $bounds) { $form.Bounds = $bounds }
            if ([CodeCodexSplashNative.Win32]::IsIconic($script:target)) {
                if ($form.Visible) { $form.Hide() }
                return
            }
            if (-not $form.Visible) {
                try {
                    $form.Show($script:owner)
                    if ([CodeCodexSplashNative.Win32]::GetWindow($form.Handle, 4) -ne $script:target) {
                        $script:closing = $true; return
                    }
                    if (-not $script:shown) {
                        $script:shown = $true
                        [IO.File]::WriteAllText($env:CLE_SPLASH_VISIBLE_PATH, 'visible')
                    }
                } catch { $script:closing = $true; return }
            }
        }
        $script:angle = ($script:angle + 2.8) % 360
        if ($form.Visible) { $form.Invalidate() }
    }
})
$context = [System.Windows.Forms.ApplicationContext]::new()
$form.Add_FormClosed({ $timer.Stop(); $context.ExitThread() })
$timer.Start()
[IO.File]::WriteAllText($env:CLE_SPLASH_READY_PATH, 'ready')
[System.Windows.Forms.Application]::Run($context)
$timer.Dispose()
$form.Dispose()
$context.Dispose()
$grid.Dispose(); $ring.Dispose(); $highlight.Dispose(); $muted.Dispose(); $wordmark.Dispose(); $caption.Dispose()
"#;

pub(crate) struct StartupSplash {
    child: Option<Child>,
    directory: Option<TempDir>,
}

impl StartupSplash {
    pub(crate) fn disabled() -> Self {
        Self {
            child: None,
            directory: None,
        }
    }

    pub(crate) fn is_open(&self) -> bool {
        self.child.is_some()
    }

    pub(crate) fn open() -> Self {
        let Ok(powershell) = trusted_system32_powershell() else {
            return Self::disabled();
        };
        let Ok(directory) = tempfile::Builder::new()
            .prefix("CodeCodex-Startup-")
            .tempdir()
        else {
            return Self::disabled();
        };
        let ready_path = directory.path().join("ready");
        let close_path = directory.path().join("close");
        let target_path = directory.path().join("target");
        let visible_path = directory.path().join("visible");
        let mut command = Command::new(powershell);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-STA",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                SPLASH_SCRIPT,
            ])
            .env("CLE_SPLASH_READY_PATH", &ready_path)
            .env("CLE_SPLASH_CLOSE_PATH", &close_path)
            .env("CLE_SPLASH_TARGET_PATH", &target_path)
            .env("CLE_SPLASH_VISIBLE_PATH", &visible_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_hidden(&mut command);
        let Ok(mut child) = command.spawn() else {
            return Self::disabled();
        };
        let deadline = Instant::now() + Duration::from_secs(8);
        while Instant::now() < deadline {
            if fs::read_to_string(&ready_path).is_ok_and(|value| value == "ready") {
                return Self {
                    child: Some(child),
                    directory: Some(directory),
                };
            }
            if child.try_wait().is_ok_and(|status| status.is_some()) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = child.kill();
        let _ = child.wait();
        Self::disabled()
    }

    pub(crate) fn wait_for_handoff(
        mut self,
        pid: u32,
        visible: &AtomicBool,
        handoff: &AtomicBool,
        stop: &AtomicBool,
    ) {
        if !self.is_open() {
            return;
        }
        let deadline = Instant::now() + Duration::from_secs(45);
        let mut target_sent = false;
        while Instant::now() < deadline
            && !handoff.load(Ordering::Acquire)
            && !stop.load(Ordering::Acquire)
        {
            if let Some(directory) = &self.directory {
                if !target_sent {
                    if let Some(window) = startup_splash_window(pid) {
                        target_sent =
                            fs::write(directory.path().join("target"), window.to_string()).is_ok();
                    }
                }
                if !visible.load(Ordering::Acquire)
                    && fs::read_to_string(directory.path().join("visible"))
                        .is_ok_and(|value| value == "visible")
                {
                    visible.store(true, Ordering::Release);
                }
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        self.close();
    }

    fn close(&mut self) {
        let Some(mut child) = self.child.take() else {
            return;
        };
        if let Some(directory) = &self.directory {
            let _ = fs::write(directory.path().join("close"), b"close");
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if child.try_wait().is_ok_and(|status| status.is_some()) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        if child.try_wait().ok().flatten().is_none() {
            let _ = child.kill();
        }
        let _ = child.wait();
        self.directory = None;
    }
}

impl Drop for StartupSplash {
    fn drop(&mut self) {
        self.close();
    }
}
