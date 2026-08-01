//! Clickable, windowless entry point for the portable installer script.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{Read as _, Seek as _, SeekFrom, Write as _};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Output, Stdio};
use std::thread;
use std::time::Duration;

#[path = "../gui_support.rs"]
mod gui_support;
#[path = "../script_wrapper.rs"]
mod script_wrapper;

const TITLE: &str = "Code-Codex setup";
const INSTALL_SCRIPT: &str = "Install-CodeCodex.ps1";
const FOOTER_MAGIC: &[u8; 8] = b"CLEXZIP1";
const FOOTER_LENGTH: u64 = 24;
const MAX_SCRIPT_DIAGNOSTIC_CHARS: usize = 4_096;
const TRUNCATION_MARKER: &str = "\n[diagnostic output truncated]";
const EXPAND_ARCHIVE_SCRIPT: &str = "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:CLE_ARCHIVE_PATH -DestinationPath $env:CLE_DESTINATION_PATH -Force";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SetupSource {
    Sibling,
    Embedded {
        payload_offset: u64,
        payload_length: u64,
        executable_length: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PortableExecutableLayout {
    image_end: usize,
    certificate_range: Option<(usize, usize)>,
}

fn main() -> ExitCode {
    let arguments: Vec<_> = env::args_os().skip(1).collect();
    let mut progress = gui_support::ProgressDialog::open(TITLE, "Preparing setup...", 5);
    match run_setup(&arguments, &mut progress) {
        Ok(output) if output.status.success() => {
            progress.set_progress(100, "Installation complete");
            thread::sleep(Duration::from_millis(650));
            progress.close();
            gui_support::show_dialog(
                TITLE,
                "Code-Codex was installed successfully. Restart Codex to use Code-Codex.",
                false,
            );
            ExitCode::SUCCESS
        }
        Ok(output) => {
            progress.close();
            let detail = format_setup_failure(output.status.code(), &output.stdout, &output.stderr);
            gui_support::show_dialog(
                TITLE,
                &format!("Code-Codex setup failed:\n\n{detail}"),
                true,
            );
            ExitCode::FAILURE
        }
        Err(error) => {
            progress.close();
            gui_support::show_dialog(TITLE, &format!("Code-Codex setup failed: {error}"), true);
            ExitCode::FAILURE
        }
    }
}

fn run_setup(
    arguments: &[OsString],
    progress: &mut gui_support::ProgressDialog,
) -> Result<Output, String> {
    progress.set_progress(15, "Reading installation package...");
    let executable = env::current_exe()
        .map_err(|error| format!("the setup executable could not be located: {error}"))?;
    match inspect_setup_source(&executable)? {
        SetupSource::Embedded {
            payload_offset,
            payload_length,
            executable_length,
        } => run_embedded_setup(
            &executable,
            payload_offset,
            payload_length,
            executable_length,
            arguments,
            progress,
        ),
        SetupSource::Sibling => {
            progress.set_progress(60, "Preparing Code-Codex installer...");
            progress.set_marquee("Installing Code-Codex...");
            script_wrapper::run_sibling_script_captured(INSTALL_SCRIPT, arguments.iter().cloned())?
                .ok_or_else(|| {
                    "the plain setup program requires Install-CodeCodex.ps1 next to it".to_owned()
                })
        }
    }
}

fn run_embedded_setup(
    executable: &Path,
    payload_offset: u64,
    payload_length: u64,
    executable_length: u64,
    arguments: &[OsString],
    progress: &mut gui_support::ProgressDialog,
) -> Result<Output, String> {
    let temporary_directory = tempfile::Builder::new()
        .prefix("CodeCodex-Setup-")
        .tempdir()
        .map_err(|error| format!("a temporary setup directory could not be created: {error}"))?;
    let archive = temporary_directory.path().join("payload.zip");
    progress.set_progress(25, "Extracting installation package...");
    extract_embedded_archive(
        executable,
        &archive,
        payload_offset,
        payload_length,
        executable_length,
    )?;

    progress.set_progress(40, "Expanding installation files...");
    expand_archive(&archive, temporary_directory.path())?;
    progress.set_progress(60, "Preparing Code-Codex installer...");
    let installer = find_extracted_installer(temporary_directory.path())?;
    progress.set_marquee("Installing Code-Codex...");
    script_wrapper::run_script_captured(&installer, arguments.iter().cloned())
}

fn format_setup_failure(exit_code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = sanitize_script_output(stdout);
    let stderr = sanitize_script_output(stderr);
    let mut sections = Vec::new();
    if !stderr.is_empty() {
        sections.push(format!("PowerShell error:\n{stderr}"));
    }
    if !stdout.is_empty() {
        sections.push(format!("Installer output:\n{stdout}"));
    }
    let exit_detail = exit_code.map_or_else(
        || "without an exit code".to_owned(),
        |code| format!("with exit code {code}"),
    );
    if sections.is_empty() {
        return format!(
            "Windows PowerShell exited {exit_detail} and did not provide diagnostic output."
        );
    }
    let diagnostic = truncate_diagnostic(sections.join("\n\n"));
    format!("{diagnostic}\n\nWindows PowerShell exited {exit_detail}.")
}

fn sanitize_script_output(bytes: &[u8]) -> String {
    let decoded = if bytes.starts_with(&[0xff, 0xfe]) {
        decode_utf16_le(&bytes[2..])
    } else if looks_like_utf16_le(bytes) {
        decode_utf16_le(bytes)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    };
    decoded
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .filter(|character| *character == '\n' || *character == '\t' || !character.is_control())
        .collect::<String>()
        .trim()
        .to_owned()
}

fn looks_like_utf16_le(bytes: &[u8]) -> bool {
    if bytes.len() < 4 || bytes.len() % 2 != 0 {
        return false;
    }
    let pairs = bytes.chunks_exact(2).take(64);
    let mut count = 0usize;
    let mut zero_high_bytes = 0usize;
    for pair in pairs {
        count += 1;
        if pair[1] == 0 {
            zero_high_bytes += 1;
        }
    }
    count > 0 && zero_high_bytes * 4 >= count * 3
}

fn decode_utf16_le(bytes: &[u8]) -> String {
    let units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect::<Vec<_>>();
    String::from_utf16_lossy(&units)
}

fn truncate_diagnostic(text: String) -> String {
    if text.chars().count() <= MAX_SCRIPT_DIAGNOSTIC_CHARS {
        return text;
    }
    let keep = MAX_SCRIPT_DIAGNOSTIC_CHARS.saturating_sub(TRUNCATION_MARKER.chars().count());
    let mut truncated = text.chars().take(keep).collect::<String>();
    truncated.push_str(TRUNCATION_MARKER);
    truncated
}

fn inspect_setup_source(executable: &Path) -> Result<SetupSource, String> {
    let bytes = fs::read(executable)
        .map_err(|error| format!("the setup executable could not be read: {error}"))?;
    classify_setup_source(&bytes)
}

fn classify_setup_source(executable: &[u8]) -> Result<SetupSource, String> {
    let layout = portable_executable_layout(executable)?;
    let file_length = u64::try_from(executable.len())
        .map_err(|_| "the setup executable is too large".to_owned())?;
    let stub_length = u64::try_from(layout.image_end)
        .map_err(|_| "the setup executable is too large".to_owned())?;
    let footer_end = match layout.certificate_range {
        None if executable.len() == layout.image_end => return Ok(SetupSource::Sibling),
        None => executable.len(),
        Some((certificate_start, certificate_end)) => {
            if certificate_end != executable.len() {
                return Err(
                    "the setup program certificate table does not end at the end of the file"
                        .to_owned(),
                );
            }
            match footer_end_before_certificate(executable, certificate_start) {
                Some(footer_end) => footer_end,
                None if is_zero_alignment_padding(
                    executable,
                    layout.image_end,
                    certificate_start,
                ) =>
                {
                    return Ok(SetupSource::Sibling);
                }
                None => {
                    return Err(
                        "the appended installer payload has a missing or invalid footer".to_owned(),
                    );
                }
            }
        }
    };
    let footer_start = footer_end
        .checked_sub(FOOTER_LENGTH as usize)
        .ok_or_else(|| "the embedded installer footer is truncated".to_owned())?;
    let footer_end_u64 =
        u64::try_from(footer_end).map_err(|_| "the setup executable is too large".to_owned())?;
    let (payload_offset, payload_length) =
        parse_footer(&executable[footer_start..footer_end], footer_end_u64)?;
    if payload_offset != stub_length {
        return Err(
            "the embedded installer payload does not begin at the end of the setup program"
                .to_owned(),
        );
    }
    Ok(SetupSource::Embedded {
        payload_offset,
        payload_length,
        executable_length: file_length,
    })
}

fn footer_end_before_certificate(executable: &[u8], certificate_start: usize) -> Option<usize> {
    (0..=7).find_map(|padding_length| {
        let footer_end = certificate_start.checked_sub(padding_length)?;
        let footer_start = footer_end.checked_sub(FOOTER_LENGTH as usize)?;
        if executable
            .get(footer_end..certificate_start)?
            .iter()
            .all(|byte| *byte == 0)
            && executable.get(footer_start..footer_start + FOOTER_MAGIC.len())? == FOOTER_MAGIC
        {
            Some(footer_end)
        } else {
            None
        }
    })
}

fn is_zero_alignment_padding(executable: &[u8], start: usize, end: usize) -> bool {
    let Some(length) = end.checked_sub(start) else {
        return false;
    };
    length <= 7
        && executable
            .get(start..end)
            .is_some_and(|padding| padding.iter().all(|byte| *byte == 0))
}

fn portable_executable_layout(executable: &[u8]) -> Result<PortableExecutableLayout, String> {
    if executable.get(..2) != Some(b"MZ") {
        return Err("the setup program is not a valid Windows executable".to_owned());
    }
    let pe_offset = read_u32(executable, 0x3c)? as usize;
    let coff = checked_slice(executable, pe_offset, 24)?;
    if coff.get(..4) != Some(b"PE\0\0") {
        return Err("the setup program has an invalid PE signature".to_owned());
    }
    let section_count = usize::from(u16::from_le_bytes([coff[6], coff[7]]));
    if section_count == 0 || section_count > 96 {
        return Err("the setup program has an invalid PE section count".to_owned());
    }
    let optional_length = usize::from(u16::from_le_bytes([coff[20], coff[21]]));
    let optional_offset = pe_offset
        .checked_add(24)
        .ok_or_else(|| "the setup program PE headers overflow".to_owned())?;
    let optional = checked_slice(executable, optional_offset, optional_length)?;
    if optional.len() < 64 {
        return Err("the setup program has a truncated PE optional header".to_owned());
    }
    let magic = u16::from_le_bytes([optional[0], optional[1]]);
    let (directory_count_offset, directory_offset) = match magic {
        0x10b => (92usize, 96usize),
        0x20b => (108usize, 112usize),
        _ => return Err("the setup program has an unsupported PE optional header".to_owned()),
    };

    let section_table_offset = optional_offset
        .checked_add(optional_length)
        .ok_or_else(|| "the setup program PE headers overflow".to_owned())?;
    let section_table_length = section_count
        .checked_mul(40)
        .ok_or_else(|| "the setup program PE section table overflows".to_owned())?;
    let sections = checked_slice(executable, section_table_offset, section_table_length)?;
    let mut image_end = usize::try_from(read_u32(optional, 60)?)
        .map_err(|_| "the setup program PE headers are too large".to_owned())?;
    for section in sections.chunks_exact(40) {
        let raw_length = usize::try_from(u32::from_le_bytes([
            section[16],
            section[17],
            section[18],
            section[19],
        ]))
        .map_err(|_| "the setup program PE section is too large".to_owned())?;
        let raw_offset = usize::try_from(u32::from_le_bytes([
            section[20],
            section[21],
            section[22],
            section[23],
        ]))
        .map_err(|_| "the setup program PE section offset is too large".to_owned())?;
        let section_end = raw_offset
            .checked_add(raw_length)
            .ok_or_else(|| "the setup program PE section range overflows".to_owned())?;
        image_end = image_end.max(section_end);
    }

    let mut certificate_range = None;
    if optional.len() >= directory_count_offset + 4 {
        let directory_count = read_u32(optional, directory_count_offset)?;
        if directory_count > 4 && optional.len() >= directory_offset + 40 {
            let certificate_offset = usize::try_from(read_u32(optional, directory_offset + 32)?)
                .map_err(|_| "the setup program certificate offset is too large".to_owned())?;
            let certificate_length = usize::try_from(read_u32(optional, directory_offset + 36)?)
                .map_err(|_| "the setup program certificate is too large".to_owned())?;
            if certificate_offset != 0 || certificate_length != 0 {
                if certificate_offset == 0 || certificate_length == 0 {
                    return Err("the setup program has an invalid PE certificate range".to_owned());
                }
                let certificate_end = certificate_offset
                    .checked_add(certificate_length)
                    .ok_or_else(|| "the setup program certificate range overflows".to_owned())?;
                if certificate_offset < image_end {
                    return Err(
                        "the setup program certificate table overlaps the PE image".to_owned()
                    );
                }
                if certificate_end > executable.len() {
                    return Err("the setup program has a truncated PE certificate table".to_owned());
                }
                certificate_range = Some((certificate_offset, certificate_end));
            }
        }
    }
    if image_end == 0 || image_end > executable.len() {
        return Err("the setup program has a truncated PE image".to_owned());
    }
    Ok(PortableExecutableLayout {
        image_end,
        certificate_range,
    })
}

fn checked_slice(bytes: &[u8], offset: usize, length: usize) -> Result<&[u8], String> {
    let end = offset
        .checked_add(length)
        .ok_or_else(|| "the setup program PE range overflows".to_owned())?;
    bytes
        .get(offset..end)
        .ok_or_else(|| "the setup program has truncated PE headers".to_owned())
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let value = checked_slice(bytes, offset, 4)?;
    Ok(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn extract_embedded_archive(
    executable: &Path,
    destination: &Path,
    payload_offset: u64,
    payload_length: u64,
    executable_length: u64,
) -> Result<(), String> {
    let mut source = File::open(executable)
        .map_err(|error| format!("the setup executable could not be read: {error}"))?;
    let file_length = source
        .metadata()
        .map_err(|error| format!("the setup executable size could not be read: {error}"))?
        .len();
    let payload_end = payload_offset
        .checked_add(payload_length)
        .ok_or_else(|| "the embedded installer payload range overflows".to_owned())?;
    if file_length != executable_length {
        return Err("the setup executable changed while its payload was being opened".to_owned());
    }
    let footer_end = payload_end
        .checked_add(FOOTER_LENGTH)
        .ok_or_else(|| "the embedded installer footer range overflows".to_owned())?;
    if footer_end > file_length {
        return Err("the setup executable changed while its payload was being opened".to_owned());
    }

    source
        .seek(SeekFrom::Start(payload_end))
        .map_err(|error| format!("the embedded installer footer could not be read: {error}"))?;
    let mut footer = [0_u8; FOOTER_LENGTH as usize];
    source
        .read_exact(&mut footer)
        .map_err(|error| format!("the embedded installer footer could not be read: {error}"))?;
    if parse_footer(&footer, footer_end)? != (payload_offset, payload_length) {
        return Err("the setup executable changed while its payload was being opened".to_owned());
    }

    source
        .seek(SeekFrom::Start(payload_offset))
        .map_err(|error| format!("the embedded installer payload could not be read: {error}"))?;
    let mut output = File::create(destination).map_err(|error| {
        format!("the temporary installer archive could not be created: {error}")
    })?;
    let copied = std::io::copy(&mut source.take(payload_length), &mut output).map_err(|error| {
        format!("the embedded installer payload could not be extracted: {error}")
    })?;
    if copied != payload_length {
        return Err("the embedded installer payload is truncated".to_owned());
    }
    output.flush().map_err(|error| {
        format!("the temporary installer archive could not be written: {error}")
    })?;
    Ok(())
}

fn parse_footer(footer: &[u8], file_length: u64) -> Result<(u64, u64), String> {
    if footer.len() != FOOTER_LENGTH as usize || &footer[..8] != FOOTER_MAGIC {
        return Err(
            "the embedded installer payload is missing or has an invalid footer".to_owned(),
        );
    }
    let mut offset_bytes = [0_u8; 8];
    offset_bytes.copy_from_slice(&footer[8..16]);
    let mut length_bytes = [0_u8; 8];
    length_bytes.copy_from_slice(&footer[16..24]);
    let offset = u64::from_le_bytes(offset_bytes);
    let length = u64::from_le_bytes(length_bytes);
    let payload_end = offset
        .checked_add(length)
        .ok_or_else(|| "the embedded installer payload range overflows".to_owned())?;
    let expected_end = file_length
        .checked_sub(FOOTER_LENGTH)
        .ok_or_else(|| "the embedded installer footer is truncated".to_owned())?;
    if offset == 0 || length == 0 || payload_end != expected_end {
        return Err("the embedded installer payload range is invalid".to_owned());
    }
    Ok((offset, length))
}

fn expand_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    let powershell = gui_support::trusted_system32_powershell()?;
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            EXPAND_ARCHIVE_SCRIPT,
        ])
        .env("CLE_ARCHIVE_PATH", archive)
        .env("CLE_DESTINATION_PATH", destination)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    gui_support::configure_hidden(&mut command);
    let output = command.output().map_err(|error| {
        format!("the embedded installer archive could not be expanded: {error}")
    })?;
    if !output.status.success() {
        return Err(format!(
            "the embedded installer archive could not be expanded:\n\n{}",
            format_setup_failure(output.status.code(), &output.stdout, &output.stderr)
        ));
    }
    Ok(())
}

fn find_extracted_installer(extraction_root: &Path) -> Result<PathBuf, String> {
    let direct = extraction_root.join(INSTALL_SCRIPT);
    if direct.is_file() {
        return verify_extracted_installer(extraction_root, &direct);
    }

    let mut candidates = Vec::new();
    let entries = extraction_root.read_dir().map_err(|error| {
        format!("the expanded installer payload could not be inspected: {error}")
    })?;
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!("the expanded installer payload could not be inspected: {error}")
        })?;
        let candidate = entry.path().join(INSTALL_SCRIPT);
        if candidate.is_file() {
            candidates.push(candidate);
        }
    }
    if candidates.len() != 1 {
        return Err("the embedded archive must contain exactly one installer script at its root or in one top-level directory".to_owned());
    }
    verify_extracted_installer(extraction_root, &candidates[0])
}

fn verify_extracted_installer(extraction_root: &Path, installer: &Path) -> Result<PathBuf, String> {
    let root = dunce::canonicalize(extraction_root).map_err(|error| {
        format!("the temporary installer directory could not be verified: {error}")
    })?;
    let installer = dunce::canonicalize(installer).map_err(|error| {
        format!("the extracted installer script could not be verified: {error}")
    })?;
    if !installer.is_file() || !installer.starts_with(&root) {
        return Err(
            "the extracted installer script resolves outside the temporary directory".to_owned(),
        );
    }
    Ok(installer)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PE_OFFSET: usize = 0x80;
    const OPTIONAL_LENGTH: usize = 0xf0;
    const OPTIONAL_OFFSET: usize = PE_OFFSET + 24;
    const SECURITY_DIRECTORY_OFFSET: usize = OPTIONAL_OFFSET + 112 + 32;

    fn plain_pe() -> Vec<u8> {
        const RAW_OFFSET: usize = 0x200;
        const RAW_LENGTH: usize = 0x200;
        let mut executable = vec![0_u8; RAW_OFFSET + RAW_LENGTH];
        executable[..2].copy_from_slice(b"MZ");
        executable[0x3c..0x40].copy_from_slice(&(PE_OFFSET as u32).to_le_bytes());
        executable[PE_OFFSET..PE_OFFSET + 4].copy_from_slice(b"PE\0\0");
        executable[PE_OFFSET + 6..PE_OFFSET + 8].copy_from_slice(&1_u16.to_le_bytes());
        executable[PE_OFFSET + 20..PE_OFFSET + 22]
            .copy_from_slice(&(OPTIONAL_LENGTH as u16).to_le_bytes());
        let optional = PE_OFFSET + 24;
        executable[optional..optional + 2].copy_from_slice(&0x20b_u16.to_le_bytes());
        executable[optional + 60..optional + 64]
            .copy_from_slice(&(RAW_OFFSET as u32).to_le_bytes());
        executable[optional + 108..optional + 112].copy_from_slice(&16_u32.to_le_bytes());
        let section = optional + OPTIONAL_LENGTH;
        executable[section + 16..section + 20].copy_from_slice(&(RAW_LENGTH as u32).to_le_bytes());
        executable[section + 20..section + 24].copy_from_slice(&(RAW_OFFSET as u32).to_le_bytes());
        executable
    }

    fn append_test_certificate(executable: &mut Vec<u8>) -> (usize, usize) {
        const CERTIFICATE_LENGTH: usize = 16;
        let padding_length = (8 - executable.len() % 8) % 8;
        executable.resize(executable.len() + padding_length, 0);
        let certificate_start = executable.len();
        let mut certificate = [0_u8; CERTIFICATE_LENGTH];
        certificate[..4].copy_from_slice(&(CERTIFICATE_LENGTH as u32).to_le_bytes());
        certificate[4..6].copy_from_slice(&0x0200_u16.to_le_bytes());
        certificate[6..8].copy_from_slice(&0x0002_u16.to_le_bytes());
        executable.extend_from_slice(&certificate);
        executable[SECURITY_DIRECTORY_OFFSET..SECURITY_DIRECTORY_OFFSET + 4]
            .copy_from_slice(&(certificate_start as u32).to_le_bytes());
        executable[SECURITY_DIRECTORY_OFFSET + 4..SECURITY_DIRECTORY_OFFSET + 8]
            .copy_from_slice(&(CERTIFICATE_LENGTH as u32).to_le_bytes());
        (certificate_start, executable.len())
    }

    fn footer(offset: u64, length: u64) -> [u8; FOOTER_LENGTH as usize] {
        let mut result = [0_u8; FOOTER_LENGTH as usize];
        result[..8].copy_from_slice(FOOTER_MAGIC);
        result[8..16].copy_from_slice(&offset.to_le_bytes());
        result[16..24].copy_from_slice(&length.to_le_bytes());
        result
    }

    #[test]
    fn parses_an_exact_end_of_file_payload_range() {
        assert_eq!(
            parse_footer(&footer(1_024, 4_096), 5_144),
            Ok((1_024, 4_096))
        );
    }

    #[test]
    fn rejects_invalid_or_ambiguous_payload_ranges() {
        let mut invalid_magic = footer(1_024, 4_096);
        invalid_magic[0] = b'X';
        assert!(parse_footer(&invalid_magic, 5_144).is_err());
        assert!(parse_footer(&footer(0, 4_096), 4_120).is_err());
        assert!(parse_footer(&footer(1_024, 0), 1_048).is_err());
        assert!(parse_footer(&footer(1_024, 4_095), 5_144).is_err());
        assert!(parse_footer(&footer(u64::MAX, 1), u64::MAX).is_err());
    }

    #[test]
    fn plain_pe_selects_sibling_mode_only_without_an_overlay() {
        assert_eq!(classify_setup_source(&plain_pe()), Ok(SetupSource::Sibling));
    }

    #[test]
    fn valid_appended_payload_selects_embedded_mode() {
        let mut executable = plain_pe();
        let offset = executable.len() as u64;
        let payload = b"PK\x03\x04embedded archive";
        executable.extend_from_slice(payload);
        executable.extend_from_slice(&footer(offset, payload.len() as u64));
        let executable_length = executable.len() as u64;

        assert_eq!(
            classify_setup_source(&executable),
            Ok(SetupSource::Embedded {
                payload_offset: offset,
                payload_length: payload.len() as u64,
                executable_length,
            })
        );
    }

    #[test]
    fn signed_plain_pe_still_selects_sibling_mode() {
        let mut executable = plain_pe();
        append_test_certificate(&mut executable);

        assert_eq!(classify_setup_source(&executable), Ok(SetupSource::Sibling));
    }

    #[test]
    fn signed_embedded_payload_is_classified_and_extracted() {
        let mut executable = plain_pe();
        let payload_offset = executable.len() as u64;
        let payload = b"PK\x03\x04signed embedded archive";
        executable.extend_from_slice(payload);
        executable.extend_from_slice(&footer(payload_offset, payload.len() as u64));
        let footer_end = executable.len();
        let (certificate_start, _) = append_test_certificate(&mut executable);
        assert!((1..=7).contains(&(certificate_start - footer_end)));

        let executable_length = executable.len() as u64;
        let source = classify_setup_source(&executable);
        assert_eq!(
            source,
            Ok(SetupSource::Embedded {
                payload_offset,
                payload_length: payload.len() as u64,
                executable_length,
            })
        );

        let temporary_directory = tempfile::tempdir().expect("temporary directory");
        let setup = temporary_directory.path().join("signed-setup.exe");
        let archive = temporary_directory.path().join("payload.zip");
        fs::write(&setup, &executable).expect("write signed setup fixture");
        extract_embedded_archive(
            &setup,
            &archive,
            payload_offset,
            payload.len() as u64,
            executable_length,
        )
        .expect("extract signed embedded payload");
        assert_eq!(fs::read(archive).expect("read extracted payload"), payload);
    }

    #[test]
    fn certificate_table_must_be_the_final_file_region() {
        let mut executable = plain_pe();
        append_test_certificate(&mut executable);
        executable.extend_from_slice(b"unexpected trailing data");

        let error = classify_setup_source(&executable).expect_err("trailing data must be rejected");
        assert!(error.contains("does not end"));
    }

    #[test]
    fn appended_data_with_a_missing_or_corrupt_footer_never_falls_back() {
        let mut missing = plain_pe();
        missing.extend_from_slice(b"appended payload without a footer");
        assert!(classify_setup_source(&missing).is_err());

        let mut corrupt = plain_pe();
        let offset = corrupt.len() as u64;
        let payload = b"PK\x03\x04embedded archive";
        corrupt.extend_from_slice(payload);
        let mut invalid_footer = footer(offset, payload.len() as u64);
        invalid_footer[0] = b'X';
        corrupt.extend_from_slice(&invalid_footer);
        assert!(classify_setup_source(&corrupt).is_err());
    }

    #[test]
    fn footer_cannot_hide_extra_data_between_the_stub_and_payload() {
        let mut executable = plain_pe();
        let stub_length = executable.len() as u64;
        executable.extend_from_slice(b"unexpected prefix");
        let payload_offset = executable.len() as u64;
        let payload = b"PK\x03\x04embedded archive";
        executable.extend_from_slice(payload);
        executable.extend_from_slice(&footer(payload_offset, payload.len() as u64));

        let error = classify_setup_source(&executable).expect_err("prefix must be rejected");
        assert!(error.contains("does not begin"));
        assert_ne!(payload_offset, stub_length);
    }

    #[test]
    fn setup_failure_prioritizes_stderr_and_keeps_stdout_and_exit_code() {
        let message = format_setup_failure(
            Some(23),
            b"preflight output",
            b"specific installation error",
        );

        let error_position = message.find("specific installation error").expect("stderr");
        let output_position = message.find("preflight output").expect("stdout");
        let exit_position = message.find("exit code 23").expect("exit code");
        assert!(error_position < output_position);
        assert!(output_position < exit_position);
        assert!(message.contains("PowerShell error:"));
        assert!(message.contains("Installer output:"));
    }

    #[test]
    fn setup_failure_uses_stdout_when_stderr_is_empty() {
        let message = format_setup_failure(Some(1), b"installer-only detail", b"");

        assert!(message.contains("Installer output:\ninstaller-only detail"));
        assert!(!message.contains("PowerShell error:"));
    }

    #[test]
    fn setup_failure_falls_back_when_powershell_is_silent() {
        assert_eq!(
            format_setup_failure(Some(1), b"", b""),
            "Windows PowerShell exited with exit code 1 and did not provide diagnostic output."
        );
        assert!(format_setup_failure(None, b"", b"").contains("without an exit code"));
    }

    #[test]
    fn setup_failure_sanitizes_utf16_newlines_nuls_and_invalid_utf8() {
        let utf16 = "\u{feff}line one\r\nline two"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();
        let message = format_setup_failure(Some(1), &[b'o', 0, b'k', 0], &utf16);

        assert!(message.contains("line one\nline two"));
        assert!(message.contains("Installer output:\nok"));
        assert!(!message.contains('\0'));
        assert!(!sanitize_script_output(&[0xff, b'e', 0, b'r', 0]).contains('\0'));
    }

    #[test]
    fn setup_failure_bounds_long_diagnostics() {
        let message = format_setup_failure(Some(1), b"", &vec![b'x'; 20_000]);

        assert!(message.contains(TRUNCATION_MARKER.trim()));
        assert!(message.ends_with("Windows PowerShell exited with exit code 1."));
        assert!(message.chars().count() <= MAX_SCRIPT_DIAGNOSTIC_CHARS + 80);
    }
}
