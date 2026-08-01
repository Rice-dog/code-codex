use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

const DIALOG_SCRIPT: &str = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; $icon = if ($env:CLE_DIALOG_ERROR -eq '1') {[System.Windows.Forms.MessageBoxIcon]::Error} else {[System.Windows.Forms.MessageBoxIcon]::Information}; [void][System.Windows.Forms.MessageBox]::Show($env:CLE_DIALOG_MESSAGE,$env:CLE_DIALOG_TITLE,[System.Windows.Forms.MessageBoxButtons]::OK,$icon)";
#[allow(dead_code)]
const PROGRESS_DIALOG_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = $env:CLE_PROGRESS_TITLE
$form.ClientSize = New-Object System.Drawing.Size(440, 112)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ControlBox = $false
$form.ShowIcon = $true
$form.ShowInTaskbar = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
try {
    $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:CLE_PROGRESS_EXECUTABLE)
} catch {}

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(20, 18)
$status.Size = New-Object System.Drawing.Size(400, 24)
$status.AutoEllipsis = $true
$status.Text = $env:CLE_PROGRESS_MESSAGE
$form.Controls.Add($status)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(20, 55)
$bar.Size = New-Object System.Drawing.Size(400, 23)
$bar.Minimum = 0
$bar.Maximum = 100
$initialValue = 0
if ([int]::TryParse($env:CLE_PROGRESS_VALUE, [ref]$initialValue)) {
    $bar.Value = [Math]::Max(0, [Math]::Min(100, $initialValue))
}
$form.Controls.Add($bar)

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
        try {
            $parent = [System.Diagnostics.Process]::GetProcessById($parentId)
            if ($parent.HasExited) {
                $timer.Stop()
                $form.Close()
                return
            }
            $parent.Dispose()
        } catch {
            $timer.Stop()
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
                $form.Close()
                return
            } elseif ($parts.Length -eq 4 -and $parts[1] -eq 'progress') {
                $value = 0
                if ([int]::TryParse($parts[2], [ref]$value)) {
                    $bar.MarqueeAnimationSpeed = 0
                    $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
                    $bar.Value = [Math]::Max(0, [Math]::Min(100, $value))
                }
                $status.Text = [System.Text.Encoding]::UTF8.GetString(
                    [Convert]::FromBase64String($parts[3])
                )
                $script:lastCommand = $command
            } elseif ($parts.Length -eq 4 -and $parts[1] -eq 'marquee') {
                $status.Text = [System.Text.Encoding]::UTF8.GetString(
                    [Convert]::FromBase64String($parts[3])
                )
                $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
                $bar.MarqueeAnimationSpeed = 24
                $script:lastCommand = $command
            }
        }
    } catch {}
})
$form.Add_Shown({
    [IO.File]::WriteAllText(
        $env:CLE_PROGRESS_READY_PATH,
        'ready',
        (New-Object System.Text.UTF8Encoding($false))
    )
})
$form.Add_FormClosed({ $timer.Stop() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
"#;

#[allow(dead_code)]
pub(crate) struct ProgressDialog {
    child: Option<Child>,
    state_directory: Option<tempfile::TempDir>,
    state_path: Option<PathBuf>,
    sequence: u64,
}

#[allow(dead_code)]
impl ProgressDialog {
    pub(crate) fn open(title: &str, message: &str, value: u8) -> Self {
        let Ok(powershell) = trusted_system32_powershell() else {
            return Self::disabled();
        };
        let Ok(state_directory) = tempfile::Builder::new()
            .prefix("CodeCodex-Progress-")
            .tempdir()
        else {
            return Self::disabled();
        };
        let ready_path = state_directory.path().join("ready");
        let state_path = state_directory.path().join("state");
        if fs::write(&state_path, progress_command(0, "progress", value, message)).is_err() {
            return Self::disabled();
        }
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
                "-Command",
                PROGRESS_DIALOG_SCRIPT,
            ])
            .env("CLE_PROGRESS_TITLE", title)
            .env("CLE_PROGRESS_MESSAGE", single_line_message(message))
            .env("CLE_PROGRESS_VALUE", value.min(100).to_string())
            .env("CLE_PROGRESS_EXECUTABLE", executable)
            .env("CLE_PROGRESS_READY_PATH", &ready_path)
            .env("CLE_PROGRESS_STATE_PATH", &state_path)
            .env("CLE_PROGRESS_PARENT_PID", std::process::id().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_hidden(&mut command);

        let Ok(mut child) = command.spawn() else {
            return Self::disabled();
        };
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut ready = false;
        while Instant::now() < deadline {
            if fs::read_to_string(&ready_path).is_ok_and(|contents| contents == "ready") {
                ready = true;
                break;
            }
            if child.try_wait().is_ok_and(|status| status.is_some()) {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        if !ready {
            let _ = child.kill();
            let _ = child.wait();
            return Self::disabled();
        }
        Self {
            child: Some(child),
            state_directory: Some(state_directory),
            state_path: Some(state_path),
            sequence: 0,
        }
    }

    pub(crate) fn set_progress(&mut self, value: u8, message: &str) {
        self.send("progress", value, message);
    }

    pub(crate) fn set_marquee(&mut self, message: &str) {
        self.send("marquee", 0, message);
    }

    pub(crate) fn close(&mut self) {
        self.sequence = self.sequence.saturating_add(1);
        if let Some(state_path) = self.state_path.as_ref() {
            let _ = fs::write(state_path, format!("{}|close|0|", self.sequence));
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
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        self.state_path = None;
        self.state_directory = None;
    }

    fn disabled() -> Self {
        Self {
            child: None,
            state_directory: None,
            state_path: None,
            sequence: 0,
        }
    }

    fn send(&mut self, kind: &str, value: u8, message: &str) {
        let Some(state_path) = self.state_path.as_ref() else {
            return;
        };
        self.sequence = self.sequence.saturating_add(1);
        let _ = fs::write(
            state_path,
            progress_command(self.sequence, kind, value, message),
        );
    }
}

impl Drop for ProgressDialog {
    fn drop(&mut self) {
        self.close();
    }
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
        eprintln!("{title}: {message}");
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
    let _ = command.status();
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
}
