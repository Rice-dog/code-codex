use std::env;
use std::ffi::OsString;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Output, Stdio};

use crate::gui_support::{configure_hidden, trusted_system32_powershell};

// This source is included by both the setup and uninstaller binaries; each
// binary uses only the execution mode that matches its user experience.
#[allow(dead_code)]
pub(crate) fn run_sibling_script(
    script_name: &str,
    script_arguments: impl IntoIterator<Item = OsString>,
) -> Result<Option<ExitStatus>, String> {
    let Some(script) = resolve_sibling_script(script_name)? else {
        return Ok(None);
    };
    run_script(&script, script_arguments).map(Some)
}

#[allow(dead_code)]
pub(crate) fn run_sibling_script_captured(
    script_name: &str,
    script_arguments: impl IntoIterator<Item = OsString>,
) -> Result<Option<Output>, String> {
    let Some(script) = resolve_sibling_script(script_name)? else {
        return Ok(None);
    };
    run_script_captured(&script, script_arguments).map(Some)
}

#[allow(dead_code)]
pub(crate) fn run_script(
    script: &Path,
    script_arguments: impl IntoIterator<Item = OsString>,
) -> Result<ExitStatus, String> {
    let mut command = build_script_command(script, script_arguments)?;
    command.stdout(Stdio::null()).stderr(Stdio::null());
    command
        .status()
        .map_err(|error| format!("Windows PowerShell could not be started: {error}"))
}

#[allow(dead_code)]
pub(crate) fn run_script_captured(
    script: &Path,
    script_arguments: impl IntoIterator<Item = OsString>,
) -> Result<Output, String> {
    build_script_command(script, script_arguments)?
        .output()
        .map_err(|error| format!("Windows PowerShell could not be started: {error}"))
}

fn build_script_command(
    script: &Path,
    script_arguments: impl IntoIterator<Item = OsString>,
) -> Result<Command, String> {
    if !script.is_file() {
        return Err(format!(
            "the required installer script is missing: {}",
            script.display()
        ));
    }
    let powershell = trusted_system32_powershell()?;
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(script)
        .args(script_arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_hidden(&mut command);
    Ok(command)
}

fn resolve_sibling_script(script_name: &str) -> Result<Option<PathBuf>, String> {
    let executable = env::current_exe()
        .map_err(|error| format!("the installer location could not be determined: {error}"))?;
    let executable_root = executable
        .parent()
        .ok_or_else(|| "the installer does not have a parent directory".to_owned())?;
    let canonical_root = dunce::canonicalize(executable_root)
        .map_err(|error| format!("the installer directory could not be verified: {error}"))?;
    let script = match dunce::canonicalize(executable_root.join(script_name)) {
        Ok(script) => script,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "the required script {script_name} could not be verified: {error}"
            ));
        }
    };

    if !script.is_file() || !same_path(script.parent(), Some(canonical_root.as_path())) {
        return Err(format!(
            "the required script {script_name} is not a regular sibling file"
        ));
    }
    Ok(Some(script))
}

fn same_path(left: Option<&Path>, right: Option<&Path>) -> bool {
    let (Some(left), Some(right)) = (left, right) else {
        return false;
    };
    #[cfg(windows)]
    {
        left.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&right.as_os_str().to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn captured_script_preserves_output_exit_code_and_arguments() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let script = directory.path().join("capture output.ps1");
        fs::write(
            &script,
            "param([string]$Value)\n[Console]::Out.WriteLine(('stdout-sentinel:' + $Value))\n[Console]::Error.WriteLine('stderr-sentinel')\nexit 23\n",
        )
        .expect("write PowerShell fixture");

        let output = run_script_captured(&script, [OsString::from("argument with spaces")])
            .expect("run captured script");

        assert_eq!(output.status.code(), Some(23));
        assert!(
            String::from_utf8_lossy(&output.stdout)
                .contains("stdout-sentinel:argument with spaces")
        );
        assert!(String::from_utf8_lossy(&output.stderr).contains("stderr-sentinel"));
    }
}
