use sha2::Digest;
use std::collections::VecDeque;
use std::io::{Read, SeekFrom};
use std::io::{Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use sha2::Sha256;
use zip::CompressionMethod;

use super::{
    MAX_NATIVE_POWERPOINT_CACHE_ENTRIES, MAX_NATIVE_POWERPOINT_PREVIEW_BYTES,
    MAX_NATIVE_POWERPOINT_SLIDE_BYTES, MAX_NATIVE_POWERPOINT_SLIDES, MAX_OFFICE_PREVIEW_BYTES,
    MIN_NATIVE_POWERPOINT_SOURCE_BYTES, NATIVE_POWERPOINT_COM_UNAVAILABLE_EXIT_CODE,
    NATIVE_POWERPOINT_TIMEOUT, NATIVE_POWERPOINT_WIDTH, media_version,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePowerPointCacheKey {
    pub(super) root: PathBuf,
    pub(super) relative_path: PathBuf,
    pub(super) source_version: String,
}

#[derive(Debug, Clone)]
pub(super) struct NativePowerPointCacheEntry {
    pub(super) key: NativePowerPointCacheKey,
    pub(super) bundle: NativePowerPointBundle,
}

#[derive(Debug, Clone)]
pub(super) struct NativePowerPointBundle {
    pub(super) bytes: Arc<Vec<u8>>,
    pub(super) version: String,
}

pub(super) enum NativePowerPointPreview {
    Rendered(NativePowerPointBundle),
    PowerpointUnavailable,
    Embedded,
}

pub(super) fn native_powerpoint_cache() -> &'static Mutex<VecDeque<NativePowerPointCacheEntry>> {
    static CACHE: OnceLock<Mutex<VecDeque<NativePowerPointCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(VecDeque::new()))
}

pub(super) fn native_powerpoint_render_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub(super) fn cached_native_powerpoint_bundle(
    key: &NativePowerPointCacheKey,
) -> Option<NativePowerPointBundle> {
    let mut cache = native_powerpoint_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let index = cache.iter().position(|entry| entry.key == *key)?;
    let entry = cache.remove(index)?;
    let bundle = entry.bundle.clone();
    cache.push_back(entry);
    Some(bundle)
}

pub(super) fn cache_native_powerpoint_bundle(
    key: NativePowerPointCacheKey,
    bundle: NativePowerPointBundle,
) {
    let mut cache = native_powerpoint_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache
        .retain(|entry| entry.key.root != key.root || entry.key.relative_path != key.relative_path);
    cache.push_back(NativePowerPointCacheEntry { key, bundle });
    while cache.len() > MAX_NATIVE_POWERPOINT_CACHE_ENTRIES {
        cache.pop_front();
    }
}

pub(super) fn native_powerpoint_version(source_version: &str, bundle: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(b"native-powerpoint-png-v2");
    digest.update(source_version.as_bytes());
    digest.update((bundle.len() as u64).to_le_bytes());
    digest.update(bundle);
    format!("{:x}", digest.finalize())
}

#[cfg(windows)]
pub(super) const NATIVE_POWERPOINT_EXPORT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$source = $env:CLE_POWERPOINT_SOURCE
$output = $env:CLE_POWERPOINT_OUTPUT
$pidState = $env:CLE_POWERPOINT_PID_STATE
$maximumSlides = [int]$env:CLE_POWERPOINT_MAX_SLIDES
$renderWidth = [int]$env:CLE_POWERPOINT_RENDER_WIDTH
if (-not $source -or -not $output -or -not $pidState -or $maximumSlides -lt 1 -or $renderWidth -lt 320) {
    throw 'The native PowerPoint preview arguments are invalid.'
}
$powerPointType = [Type]::GetTypeFromProgID('PowerPoint.Application', $false)
if ($null -eq $powerPointType) {
    exit 41
}

$application = $null
$presentation = $null
$ownsApplication = $false
$restoreBorrowedState = $false
$previousAutomationSecurity = $null
$previousDisplayAlerts = $null
try {
    $runningPowerPoint = @(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue)
    $runningPowerPointIds = @{}
    foreach ($runningProcess in $runningPowerPoint) {
        $runningPowerPointIds[[int]$runningProcess.Id] = $true
    }
    try {
        if ($runningPowerPoint.Count -eq 0) {
            $application = [Activator]::CreateInstance($powerPointType)
        }
        else {
            try {
                $application = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
            }
            catch {
                $application = [Activator]::CreateInstance($powerPointType)
            }
        }
    }
    catch {
        throw
    }

    $createdProcesses = @(
        Get-Process -Name POWERPNT -ErrorAction SilentlyContinue |
            Where-Object { -not $runningPowerPointIds.ContainsKey([int]$_.Id) }
    )
    if ($createdProcesses.Count -eq 1) {
        $createdProcess = $createdProcesses[0]
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($createdProcess.Id)" -ErrorAction SilentlyContinue
        $commandLine = [string]$processInfo.CommandLine
        $isAutomationProcess =
            $commandLine -match '(?i)(?:^|\s)/AUTOMATION(?:\s|$)' -and
            $commandLine -match '(?i)(?:^|\s)-Embedding(?:\s|$)'
        if ($isAutomationProcess) {
            $ownedState = '{0}|{1}' -f $createdProcess.Id, $createdProcess.StartTime.ToUniversalTime().Ticks
            try {
                [IO.File]::WriteAllText($pidState, $ownedState, [Text.UTF8Encoding]::new($false))
                $ownsApplication = $true
            }
            catch {}
        }
    }

    if (-not $ownsApplication) {
        $previousAutomationSecurity = $application.AutomationSecurity
        $previousDisplayAlerts = $application.DisplayAlerts
        $restoreBorrowedState = $true
    }

    $application.AutomationSecurity = 3
    $application.DisplayAlerts = 1
    try {
        $presentation = $application.Presentations.Open($source, -1, 0, 0)
    }
    finally {
        if ($restoreBorrowedState) {
            try { $application.AutomationSecurity = $previousAutomationSecurity } catch {}
            try { $application.DisplayAlerts = $previousDisplayAlerts } catch {}
            $restoreBorrowedState = $false
        }
    }
    $slideCount = [int]$presentation.Slides.Count
    if ($slideCount -lt 1 -or $slideCount -gt $maximumSlides) {
        throw 'The presentation slide count exceeds the native preview limit.'
    }
    $slideWidth = [double]$presentation.PageSetup.SlideWidth
    $slideHeight = [double]$presentation.PageSetup.SlideHeight
    if ($slideWidth -le 0 -or $slideHeight -le 0) {
        throw 'The presentation has invalid slide dimensions.'
    }
    $renderHeight = [Math]::Max(180, [Math]::Min(2160, [int][Math]::Round($renderWidth * $slideHeight / $slideWidth)))
    for ($index = 1; $index -le $slideCount; $index++) {
        $target = Join-Path $output ('slide-{0:D4}.png' -f $index)
        $slide = $null
        try {
            $slide = $presentation.Slides.Item($index)
            $slide.Export($target, 'PNG', $renderWidth, $renderHeight)
            if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
                throw "PowerPoint did not render slide $index."
            }
        }
        finally {
            if ($null -ne $slide) {
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide)
            }
        }
    }
}
finally {
    if ($restoreBorrowedState -and $null -ne $application) {
        try { $application.AutomationSecurity = $previousAutomationSecurity } catch {}
        try { $application.DisplayAlerts = $previousDisplayAlerts } catch {}
    }
    if ($null -ne $presentation) {
        try { $presentation.Close() } catch {}
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
    }
    if ($null -ne $application) {
        if ($ownsApplication) {
            try { $application.Quit() } catch {}
        }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
"#;

#[cfg(windows)]
pub(super) const NATIVE_POWERPOINT_CLEANUP_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$pidState = $env:CLE_POWERPOINT_PID_STATE
if (-not $pidState -or -not (Test-Path -LiteralPath $pidState -PathType Leaf)) {
    exit 0
}
$parts = [IO.File]::ReadAllText($pidState).Trim().Split('|')
if ($parts.Count -ne 2) {
    exit 0
}
$ownedProcessId = 0
$ownedStartTicks = 0L
if (-not [int]::TryParse($parts[0], [ref]$ownedProcessId) -or
    -not [long]::TryParse($parts[1], [ref]$ownedStartTicks)) {
    exit 0
}
$ownedProcess = Get-Process -Id $ownedProcessId -ErrorAction SilentlyContinue
if ($null -ne $ownedProcess -and
    $ownedProcess.ProcessName -eq 'POWERPNT' -and
    $ownedProcess.StartTime.ToUniversalTime().Ticks -eq $ownedStartTicks) {
    Stop-Process -Id $ownedProcessId -Force -ErrorAction SilentlyContinue
}
"#;

#[cfg(windows)]
pub(super) fn trusted_windows_powershells() -> Result<Vec<PathBuf>, String> {
    let system_root = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or_else(|| "the Windows directory is unavailable".to_owned())?;
    let system_root = dunce::canonicalize(system_root)
        .map_err(|error| format!("the Windows directory could not be verified: {error}"))?;

    let mut powershells = Vec::with_capacity(2);
    for relative in [
        "System32/WindowsPowerShell/v1.0/powershell.exe",
        "SysWOW64/WindowsPowerShell/v1.0/powershell.exe",
    ] {
        let Ok(powershell) = dunce::canonicalize(system_root.join(relative)) else {
            continue;
        };
        if powershell.starts_with(&system_root)
            && powershell
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("powershell.exe"))
            && powershell.is_file()
            && !powershells.contains(&powershell)
        {
            powershells.push(powershell);
        }
    }
    if powershells.is_empty() {
        return Err("Windows PowerShell could not be verified".to_owned());
    }
    Ok(powershells)
}

#[cfg(windows)]
pub(super) fn trusted_windows_powershell() -> Result<PathBuf, String> {
    trusted_windows_powershells()?
        .into_iter()
        .next()
        .ok_or_else(|| "Windows PowerShell could not be verified".to_owned())
}

#[cfg(windows)]
pub(super) fn cleanup_owned_powerpoint(pid_state: &Path) {
    use std::os::windows::process::CommandExt as _;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let Ok(powershell) = trusted_windows_powershell() else {
        return;
    };
    let _ = Command::new(powershell)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            NATIVE_POWERPOINT_CLEANUP_SCRIPT,
        ])
        .env("CLE_POWERPOINT_PID_STATE", pid_state)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(windows)]
pub(super) enum NativePowerPointExportAttemptError {
    ComUnavailable,
    Failed(String),
}

#[derive(Debug)]
pub(super) enum NativePowerPointRenderError {
    PowerpointUnavailable,
    Failed(String),
}

impl From<String> for NativePowerPointRenderError {
    fn from(error: String) -> Self {
        Self::Failed(error)
    }
}

#[cfg(windows)]
pub(super) fn run_native_powerpoint_export_with_shell(
    powershell: &Path,
    source: &Path,
    output: &Path,
    pid_state: &Path,
) -> Result<(), NativePowerPointExportAttemptError> {
    use std::os::windows::process::CommandExt as _;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
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
            NATIVE_POWERPOINT_EXPORT_SCRIPT,
        ])
        .env("CLE_POWERPOINT_SOURCE", source)
        .env("CLE_POWERPOINT_OUTPUT", output)
        .env("CLE_POWERPOINT_PID_STATE", pid_state)
        .env(
            "CLE_POWERPOINT_MAX_SLIDES",
            MAX_NATIVE_POWERPOINT_SLIDES.to_string(),
        )
        .env(
            "CLE_POWERPOINT_RENDER_WIDTH",
            NATIVE_POWERPOINT_WIDTH.to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    let mut child = command.spawn().map_err(|error| {
        NativePowerPointExportAttemptError::Failed(format!(
            "PowerPoint preview could not start: {error}"
        ))
    })?;
    let deadline = Instant::now() + NATIVE_POWERPOINT_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status))
                if status.code() == Some(NATIVE_POWERPOINT_COM_UNAVAILABLE_EXIT_CODE) =>
            {
                return Err(NativePowerPointExportAttemptError::ComUnavailable);
            }
            Ok(Some(status)) => {
                cleanup_owned_powerpoint(pid_state);
                return Err(NativePowerPointExportAttemptError::Failed(format!(
                    "PowerPoint preview exited with status {}",
                    status.code().unwrap_or(-1)
                )));
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                cleanup_owned_powerpoint(pid_state);
                return Err(NativePowerPointExportAttemptError::Failed(
                    "PowerPoint preview timed out".to_owned(),
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                cleanup_owned_powerpoint(pid_state);
                return Err(NativePowerPointExportAttemptError::Failed(format!(
                    "PowerPoint preview could not be monitored: {error}"
                )));
            }
        }
    }
}

#[cfg(windows)]
pub(super) fn run_native_powerpoint_export(
    source: &Path,
    output: &Path,
    pid_state: &Path,
) -> Result<(), NativePowerPointRenderError> {
    for powershell in trusted_windows_powershells()? {
        match run_native_powerpoint_export_with_shell(&powershell, source, output, pid_state) {
            Ok(()) => return Ok(()),
            Err(NativePowerPointExportAttemptError::ComUnavailable) => continue,
            Err(NativePowerPointExportAttemptError::Failed(error)) => {
                return Err(NativePowerPointRenderError::Failed(error));
            }
        }
    }
    Err(NativePowerPointRenderError::PowerpointUnavailable)
}

#[cfg(not(windows))]
pub(super) fn run_native_powerpoint_export(
    _source: &Path,
    _output: &Path,
    _pid_state: &Path,
) -> Result<(), NativePowerPointRenderError> {
    Err(NativePowerPointRenderError::PowerpointUnavailable)
}

pub(super) fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24
        || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.get(12..16) != Some(b"IHDR")
    {
        return None;
    }
    let width = u32::from_be_bytes(bytes.get(16..20)?.try_into().ok()?);
    let height = u32::from_be_bytes(bytes.get(20..24)?.try_into().ok()?);
    (width > 0 && height > 0 && width <= 4_096 && height <= 4_096).then_some((width, height))
}

pub(super) fn bundle_native_powerpoint_slides(output: &Path) -> Result<Vec<u8>, String> {
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    let mut slides = Vec::new();
    let mut total_bytes = 0_u64;
    let mut dimensions = None;
    for index in 1..=MAX_NATIVE_POWERPOINT_SLIDES {
        let name = format!("slide-{index:04}.png");
        let path = output.join(&name);
        if !path.is_file() {
            break;
        }
        let metadata = std::fs::metadata(&path)
            .map_err(|error| format!("rendered slide metadata is unavailable: {error}"))?;
        if metadata.len() == 0 || metadata.len() > MAX_NATIVE_POWERPOINT_SLIDE_BYTES {
            return Err("a rendered PowerPoint slide exceeds the preview limit".to_owned());
        }
        total_bytes = total_bytes
            .checked_add(metadata.len())
            .ok_or_else(|| "the rendered PowerPoint preview size overflowed".to_owned())?;
        if total_bytes > MAX_NATIVE_POWERPOINT_PREVIEW_BYTES {
            return Err("the rendered PowerPoint preview exceeds the size limit".to_owned());
        }
        let bytes = std::fs::read(&path)
            .map_err(|error| format!("a rendered PowerPoint slide could not be read: {error}"))?;
        let current_dimensions = png_dimensions(&bytes)
            .ok_or_else(|| "PowerPoint returned an invalid slide image".to_owned())?;
        if dimensions.is_some_and(|expected| expected != current_dimensions) {
            return Err("PowerPoint returned inconsistent slide dimensions".to_owned());
        }
        dimensions = Some(current_dimensions);
        slides.push((name, bytes));
    }
    if slides.is_empty() {
        return Err("PowerPoint returned no slide images".to_owned());
    }
    let unexpected_entry = std::fs::read_dir(output)
        .map_err(|error| format!("the rendered PowerPoint directory could not be read: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .count()
        != slides.len();
    if unexpected_entry {
        return Err("PowerPoint returned an unexpected preview file".to_owned());
    }

    let (width, height) = dimensions.ok_or_else(|| "slide dimensions are missing".to_owned())?;
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "slideCount": slides.len(),
        "width": width,
        "height": height,
    }))
    .map_err(|error| format!("the PowerPoint preview manifest could not be created: {error}"))?;
    let cursor = std::io::Cursor::new(Vec::new());
    let mut archive = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    archive
        .start_file("manifest.json", options)
        .map_err(|error| format!("the PowerPoint preview archive could not start: {error}"))?;
    archive.write_all(&manifest).map_err(|error| {
        format!("the PowerPoint preview manifest could not be written: {error}")
    })?;
    for (name, bytes) in slides {
        archive
            .start_file(name, options)
            .map_err(|error| format!("a PowerPoint slide could not be archived: {error}"))?;
        archive
            .write_all(&bytes)
            .map_err(|error| format!("a PowerPoint slide could not be written: {error}"))?;
    }
    let bundle = archive
        .finish()
        .map_err(|error| format!("the PowerPoint preview archive could not finish: {error}"))?
        .into_inner();
    if bundle.len() as u64 > MAX_NATIVE_POWERPOINT_PREVIEW_BYTES {
        return Err("the PowerPoint preview archive exceeds the size limit".to_owned());
    }
    Ok(bundle)
}

pub(super) fn render_native_powerpoint_bundle(
    source: &mut std::fs::File,
    source_size: u64,
    source_version: &str,
) -> Result<Vec<u8>, NativePowerPointRenderError> {
    if source_size < MIN_NATIVE_POWERPOINT_SOURCE_BYTES || source_size > MAX_OFFICE_PREVIEW_BYTES {
        return Err(NativePowerPointRenderError::Failed(
            "the PowerPoint source size is outside the native preview limits".to_owned(),
        ));
    }
    let temporary_root = crate::application_paths::temp_root()
        .map_err(|error| format!("the preview storage location is unavailable: {error}"))?;
    let temporary = tempfile::Builder::new()
        .prefix("CodeCodex-PowerPoint-")
        .tempdir_in(temporary_root)
        .map_err(|error| format!("a PowerPoint preview directory could not be created: {error}"))?;
    let source_path = temporary.path().join("source.ppt");
    let output_path = temporary.path().join("slides");
    let pid_state_path = temporary.path().join("powerpoint-owner.txt");
    std::fs::create_dir(&output_path)
        .map_err(|error| format!("the PowerPoint slide directory could not be created: {error}"))?;
    source
        .seek(SeekFrom::Start(0))
        .map_err(|error| format!("the PowerPoint source could not be rewound: {error}"))?;
    let mut copied_source = std::fs::File::create(&source_path)
        .map_err(|error| format!("the PowerPoint source copy could not be created: {error}"))?;
    let copied = std::io::copy(
        &mut Read::by_ref(source).take(source_size.saturating_add(1)),
        &mut copied_source,
    )
    .map_err(|error| format!("the PowerPoint source could not be copied: {error}"))?;
    if copied != source_size {
        return Err(NativePowerPointRenderError::Failed(
            "the PowerPoint source changed while it was being copied".to_owned(),
        ));
    }
    copied_source.sync_all().map_err(|error| {
        format!("the PowerPoint source copy could not be synchronized: {error}")
    })?;
    drop(copied_source);
    let metadata = source
        .metadata()
        .map_err(|error| format!("the PowerPoint source metadata is unavailable: {error}"))?;
    let final_version = media_version(source, &metadata)
        .map_err(|error| format!("the PowerPoint source could not be revalidated: {error}"))?;
    if metadata.len() != source_size || final_version != source_version {
        return Err(NativePowerPointRenderError::Failed(
            "the PowerPoint source changed during preview".to_owned(),
        ));
    }

    run_native_powerpoint_export(&source_path, &output_path, &pid_state_path)?;
    let bundle = bundle_native_powerpoint_slides(&output_path)?;
    temporary.close().map_err(|error| {
        format!("the PowerPoint preview directory could not be removed: {error}")
    })?;
    Ok(bundle)
}
