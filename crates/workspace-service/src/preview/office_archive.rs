use std::collections::HashSet;
use std::io::Seek;
use std::io::{Read, SeekFrom};

use crate::error::{WorkspaceError, map_io};
use zip::{CompressionMethod, ZipArchive};

use super::{
    MAX_OFFICE_CONTENT_TYPES_BYTES, MAX_OFFICE_ENTRIES, MAX_OFFICE_ENTRY_BYTES,
    MAX_OFFICE_ENTRY_NAME_BYTES, MAX_OFFICE_UNCOMPRESSED_BYTES, MAX_OFFICE_XML_BYTES,
    MediaSignature, OFFICE_VALIDATION_BUFFER_BYTES,
};

#[derive(Debug)]
pub(super) struct OfficeZipEntry {
    pub(super) name: String,
    pub(super) flags: u16,
    pub(super) compression: u16,
    pub(super) crc32: u32,
    pub(super) compressed_size: u64,
    pub(super) uncompressed_size: u64,
    pub(super) local_header_offset: u64,
}

#[derive(Debug)]
pub(super) struct OfficeZipDirectory {
    pub(super) entries: Vec<OfficeZipEntry>,
    pub(super) names: HashSet<String>,
}

pub(super) fn validate_office_package(
    file: &mut std::fs::File,
    signature: MediaSignature,
) -> Result<(), WorkspaceError> {
    let expected = office_package_identity(signature).ok_or(WorkspaceError::NotEditable)?;
    let archive_file = file.try_clone().map_err(|error| map_io(&error))?;
    let mut archive = ZipArchive::new(archive_file).map_err(map_office_zip_error)?;
    if archive.offset() != 0 || archive.is_empty() || archive.len() > MAX_OFFICE_ENTRIES {
        return Err(WorkspaceError::NotEditable);
    }

    let directory = inspect_office_zip_directory(file, archive.central_directory_start())?;
    if directory.entries.len() != archive.len()
        || !directory.names.contains("[Content_Types].xml")
        || !directory.names.contains("_rels/.rels")
        || !directory.names.contains(expected.main_part)
    {
        return Err(WorkspaceError::NotEditable);
    }

    let main_entry = directory
        .entries
        .iter()
        .find(|entry| entry.name == expected.main_part)
        .ok_or(WorkspaceError::NotEditable)?;
    if main_entry.uncompressed_size == 0 {
        return Err(WorkspaceError::NotEditable);
    }

    if archive
        .has_overlapping_files()
        .map_err(map_office_zip_error)?
    {
        return Err(WorkspaceError::NotEditable);
    }
    validate_office_decompressed_entries(&mut archive, &directory.entries)?;

    let mut content_types = archive
        .by_name("[Content_Types].xml")
        .map_err(map_office_zip_error)?;
    if content_types.encrypted()
        || content_types.size() == 0
        || content_types.size() > MAX_OFFICE_CONTENT_TYPES_BYTES
    {
        return Err(WorkspaceError::NotEditable);
    }
    let declared_size =
        usize::try_from(content_types.size()).map_err(|_| WorkspaceError::NotEditable)?;
    let mut xml = Vec::with_capacity(declared_size);
    Read::by_ref(&mut content_types)
        .take(MAX_OFFICE_CONTENT_TYPES_BYTES + 1)
        .read_to_end(&mut xml)
        .map_err(|_| WorkspaceError::NotEditable)?;
    if xml.len() != declared_size
        || !content_types_has_override(&xml, expected.main_part, expected.content_type)
        || contains_ascii_case_insensitive(&xml, b"macroenabled")
        || contains_ascii_case_insensitive(&xml, b"vbaproject")
        || contains_ascii_case_insensitive(&xml, b"activex")
    {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(())
}

pub(super) fn validate_legacy_ppt(file: &mut std::fs::File) -> Result<(), WorkspaceError> {
    const CFB_STREAM_BUFFER_BYTES: usize = 1024 * 1024;
    const CURRENT_USER_RECORD: u16 = 0x0ff6;
    const USER_EDIT_RECORD: u16 = 0x0ff5;
    const CURRENT_USER_SIZE: u32 = 0x14;
    const UNENCRYPTED_TOKEN: u32 = 0xe391_c05f;

    let compound_file = file.try_clone().map_err(|error| map_io(&error))?;
    let mut compound = cfb::OpenOptions::new()
        .max_buffer_size(CFB_STREAM_BUFFER_BYTES)
        .open_with(compound_file)
        .map_err(|_| WorkspaceError::NotEditable)?;

    let mut entry_count = 0_usize;
    let mut total_stream_bytes = 0_u64;
    for entry in compound.walk() {
        entry_count = entry_count
            .checked_add(1)
            .filter(|count| *count <= MAX_OFFICE_ENTRIES)
            .ok_or(WorkspaceError::NotEditable)?;
        if entry.path().components().count() > 32 {
            return Err(WorkspaceError::NotEditable);
        }
        let folded_name = entry.name().to_ascii_lowercase();
        if folded_name.contains("vbaproject")
            || folded_name == "vba"
            || folded_name == "_vba_project"
            || folded_name == "macros"
            || folded_name == "objectpool"
            || folded_name == "activex"
            || folded_name == "encryptedpackage"
            || folded_name == "encryptionsummary"
            || folded_name == "drmcontent"
            || folded_name == "dataspaces"
            || folded_name == "transforminfo"
        {
            return Err(WorkspaceError::NotEditable);
        }
        if !entry.is_stream() {
            continue;
        }
        if entry.len() > MAX_OFFICE_ENTRY_BYTES {
            return Err(WorkspaceError::NotEditable);
        }
        total_stream_bytes = total_stream_bytes
            .checked_add(entry.len())
            .filter(|bytes| *bytes <= MAX_OFFICE_UNCOMPRESSED_BYTES)
            .ok_or(WorkspaceError::NotEditable)?;
    }

    let mut current_user_path = None;
    let mut current_user_length = 0_u64;
    let mut document_path = None;
    let mut document_length = 0_u64;
    for entry in compound.read_root_storage() {
        if !entry.is_stream() {
            continue;
        }
        if entry.name().eq_ignore_ascii_case("Current User") {
            current_user_path = Some(entry.path().to_path_buf());
            current_user_length = entry.len();
        } else if entry.name().eq_ignore_ascii_case("PowerPoint Document") {
            document_path = Some(entry.path().to_path_buf());
            document_length = entry.len();
        }
    }
    let current_user_path = current_user_path.ok_or(WorkspaceError::NotEditable)?;
    let document_path = document_path.ok_or(WorkspaceError::NotEditable)?;
    if current_user_length < 20 || document_length < 8 {
        return Err(WorkspaceError::NotEditable);
    }

    let mut current_user = compound
        .open_stream(current_user_path)
        .map_err(|_| WorkspaceError::NotEditable)?;
    let mut current_user_header = [0_u8; 20];
    current_user
        .read_exact(&mut current_user_header)
        .map_err(|_| WorkspaceError::NotEditable)?;
    let current_user_record_length = u64::from(le_u32(&current_user_header[4..8]));
    let current_edit_offset = u64::from(le_u32(&current_user_header[16..20]));
    if le_u16(&current_user_header[2..4]) != CURRENT_USER_RECORD
        || current_user_record_length < 20
        || 8_u64
            .checked_add(current_user_record_length)
            .is_none_or(|end| end > current_user_length)
        || le_u32(&current_user_header[8..12]) != CURRENT_USER_SIZE
        || le_u32(&current_user_header[12..16]) != UNENCRYPTED_TOKEN
        || current_edit_offset
            .checked_add(8)
            .is_none_or(|end| end > document_length)
    {
        return Err(WorkspaceError::NotEditable);
    }
    drop(current_user);

    let mut document = compound
        .open_stream(document_path)
        .map_err(|_| WorkspaceError::NotEditable)?;
    document
        .seek(SeekFrom::Start(current_edit_offset))
        .map_err(|_| WorkspaceError::NotEditable)?;
    let mut user_edit_header = [0_u8; 8];
    document
        .read_exact(&mut user_edit_header)
        .map_err(|_| WorkspaceError::NotEditable)?;
    let user_edit_length = u64::from(le_u32(&user_edit_header[4..8]));
    if le_u16(&user_edit_header[2..4]) != USER_EDIT_RECORD
        || user_edit_length < 20
        || current_edit_offset
            .checked_add(8)
            .and_then(|start| start.checked_add(user_edit_length))
            .is_none_or(|end| end > document_length)
    {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(())
}

pub(super) fn validate_office_decompressed_entries(
    archive: &mut ZipArchive<std::fs::File>,
    directory_entries: &[OfficeZipEntry],
) -> Result<(), WorkspaceError> {
    let mut aggregate_actual_size = 0_u64;
    let mut buffer = [0_u8; OFFICE_VALIDATION_BUFFER_BYTES];
    let mut folded_names = HashSet::new();
    for index in 0..archive.len() {
        let directory_entry = directory_entries
            .get(index)
            .ok_or(WorkspaceError::NotEditable)?;
        let (declared_size, compressed_size, is_directory, is_xml_part) = {
            let entry = archive.by_index_raw(index).map_err(map_office_zip_error)?;
            let logical_name = entry.name();
            let folded_name = logical_name.to_ascii_lowercase();
            if entry.encrypted()
                || entry.is_symlink()
                || !matches!(
                    entry.compression(),
                    CompressionMethod::Stored | CompressionMethod::Deflated
                )
                || entry.size() > MAX_OFFICE_ENTRY_BYTES
                || entry.size() != directory_entry.uncompressed_size
                || entry.compressed_size() != directory_entry.compressed_size
                || entry.crc32() != directory_entry.crc32
                || logical_name.as_bytes() != directory_entry.name.as_bytes()
                || !valid_office_entry_name(logical_name.as_bytes())
                || !folded_names.insert(folded_name.clone())
                || forbidden_office_part(&folded_name)
            {
                return Err(WorkspaceError::NotEditable);
            }
            let is_xml_part = is_office_xml_part(&folded_name);
            if is_xml_part && entry.size() > MAX_OFFICE_XML_BYTES {
                return Err(WorkspaceError::NotEditable);
            }
            (
                entry.size(),
                entry.compressed_size(),
                entry.is_dir(),
                is_xml_part,
            )
        };
        if is_directory {
            if declared_size != 0 || compressed_size != 0 {
                return Err(WorkspaceError::NotEditable);
            }
            continue;
        }

        let mut entry = archive.by_index(index).map_err(map_office_zip_error)?;
        let mut entry_actual_size = 0_u64;
        let mut xml = is_xml_part.then(Vec::new);
        loop {
            let read = entry
                .read(&mut buffer)
                .map_err(|_| WorkspaceError::NotEditable)?;
            if read == 0 {
                break;
            }
            entry_actual_size = entry_actual_size
                .checked_add(read as u64)
                .filter(|size| *size <= MAX_OFFICE_ENTRY_BYTES)
                .ok_or(WorkspaceError::NotEditable)?;
            aggregate_actual_size = aggregate_actual_size
                .checked_add(read as u64)
                .filter(|size| *size <= MAX_OFFICE_UNCOMPRESSED_BYTES)
                .ok_or(WorkspaceError::NotEditable)?;
            if let Some(xml) = &mut xml {
                let next_length = xml
                    .len()
                    .checked_add(read)
                    .filter(|length| *length <= MAX_OFFICE_XML_BYTES as usize)
                    .ok_or(WorkspaceError::NotEditable)?;
                xml.reserve(next_length.saturating_sub(xml.len()));
                xml.extend_from_slice(&buffer[..read]);
            }
        }
        if entry_actual_size != declared_size {
            return Err(WorkspaceError::NotEditable);
        }
        if xml.is_some_and(|xml| !valid_office_xml(&xml)) {
            return Err(WorkspaceError::NotEditable);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
pub(super) struct OfficePackageIdentity {
    pub(super) main_part: &'static str,
    pub(super) content_type: &'static str,
}

pub(super) fn office_package_identity(signature: MediaSignature) -> Option<OfficePackageIdentity> {
    match signature {
        MediaSignature::Docx => Some(OfficePackageIdentity {
            main_part: "word/document.xml",
            content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        }),
        MediaSignature::Xlsx => Some(OfficePackageIdentity {
            main_part: "xl/workbook.xml",
            content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        }),
        MediaSignature::Pptx => Some(OfficePackageIdentity {
            main_part: "ppt/presentation.xml",
            content_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
        }),
        _ => None,
    }
}

pub(super) fn inspect_office_zip_directory(
    file: &mut std::fs::File,
    central_directory_start: u64,
) -> Result<OfficeZipDirectory, WorkspaceError> {
    const CENTRAL_HEADER_SIGNATURE: [u8; 4] = *b"PK\x01\x02";
    const END_SIGNATURE: [u8; 4] = *b"PK\x05\x06";

    let file_size = file.metadata().map_err(|error| map_io(&error))?.len();
    if central_directory_start == 0 || central_directory_start >= file_size {
        return Err(WorkspaceError::NotEditable);
    }
    file.seek(SeekFrom::Start(central_directory_start))
        .map_err(|error| map_io(&error))?;

    let mut entries = Vec::new();
    let mut names = HashSet::new();
    let mut folded_names = HashSet::new();
    let mut total_uncompressed = 0_u64;
    let end_record_start;
    loop {
        let record_start = file.stream_position().map_err(|error| map_io(&error))?;
        let mut signature = [0_u8; 4];
        read_office_exact(file, &mut signature)?;
        if signature == END_SIGNATURE {
            end_record_start = record_start;
            break;
        }
        if signature != CENTRAL_HEADER_SIGNATURE || entries.len() >= MAX_OFFICE_ENTRIES {
            return Err(WorkspaceError::NotEditable);
        }

        let mut fixed = [0_u8; 42];
        read_office_exact(file, &mut fixed)?;
        let flags = le_u16(&fixed[4..6]);
        let compression = le_u16(&fixed[6..8]);
        let crc32 = le_u32(&fixed[12..16]);
        let compressed_size = u64::from(le_u32(&fixed[16..20]));
        let uncompressed_size = u64::from(le_u32(&fixed[20..24]));
        let name_length = usize::from(le_u16(&fixed[24..26]));
        let extra_length = usize::from(le_u16(&fixed[26..28]));
        let comment_length = u64::from(le_u16(&fixed[28..30]));
        let disk_number = le_u16(&fixed[30..32]);
        let local_header_offset = u64::from(le_u32(&fixed[38..42]));
        if name_length == 0
            || name_length > MAX_OFFICE_ENTRY_NAME_BYTES
            || disk_number != 0
            || compressed_size == u64::from(u32::MAX)
            || uncompressed_size == u64::from(u32::MAX)
            || local_header_offset == u64::from(u32::MAX)
            || !supported_office_zip_flags(flags, compression)
            || uncompressed_size > MAX_OFFICE_ENTRY_BYTES
        {
            return Err(WorkspaceError::NotEditable);
        }

        let mut raw_name = vec![0_u8; name_length];
        read_office_exact(file, &mut raw_name)?;
        if !valid_office_entry_name(&raw_name) {
            return Err(WorkspaceError::NotEditable);
        }
        let mut extra = vec![0_u8; extra_length];
        read_office_exact(file, &mut extra)?;
        validate_office_extra_fields(&extra)?;
        let name = std::str::from_utf8(&raw_name)
            .map_err(|_| WorkspaceError::NotEditable)?
            .to_owned();
        let folded = name.to_ascii_lowercase();
        if !names.insert(name.clone())
            || !folded_names.insert(folded.clone())
            || forbidden_office_part(&folded)
            || (is_office_xml_part(&folded) && uncompressed_size > MAX_OFFICE_XML_BYTES)
        {
            return Err(WorkspaceError::NotEditable);
        }
        total_uncompressed = total_uncompressed
            .checked_add(uncompressed_size)
            .ok_or(WorkspaceError::NotEditable)?;
        if total_uncompressed > MAX_OFFICE_UNCOMPRESSED_BYTES {
            return Err(WorkspaceError::NotEditable);
        }

        let current = file.stream_position().map_err(|error| map_io(&error))?;
        let next = current
            .checked_add(comment_length)
            .filter(|next| *next <= file_size)
            .ok_or(WorkspaceError::NotEditable)?;
        file.seek(SeekFrom::Start(next))
            .map_err(|error| map_io(&error))?;
        entries.push(OfficeZipEntry {
            name,
            flags,
            compression,
            crc32,
            compressed_size,
            uncompressed_size,
            local_header_offset,
        });
    }

    let mut end = [0_u8; 18];
    read_office_exact(file, &mut end)?;
    let disk_number = le_u16(&end[0..2]);
    let central_disk = le_u16(&end[2..4]);
    let disk_entries = usize::from(le_u16(&end[4..6]));
    let total_entries = usize::from(le_u16(&end[6..8]));
    let declared_central_size = u64::from(le_u32(&end[8..12]));
    let declared_central_start = u64::from(le_u32(&end[12..16]));
    let comment_length = u64::from(le_u16(&end[16..18]));
    let actual_central_size = end_record_start
        .checked_sub(central_directory_start)
        .ok_or(WorkspaceError::NotEditable)?;
    let after_comment = file
        .stream_position()
        .map_err(|error| map_io(&error))?
        .checked_add(comment_length)
        .ok_or(WorkspaceError::NotEditable)?;
    if disk_number != 0
        || central_disk != 0
        || disk_entries != entries.len()
        || total_entries != entries.len()
        || declared_central_size != actual_central_size
        || declared_central_start != central_directory_start
        || after_comment != file_size
    {
        return Err(WorkspaceError::NotEditable);
    }

    validate_office_local_headers(file, central_directory_start, &entries)?;
    Ok(OfficeZipDirectory { entries, names })
}

pub(super) fn validate_office_local_headers(
    file: &mut std::fs::File,
    central_directory_start: u64,
    entries: &[OfficeZipEntry],
) -> Result<(), WorkspaceError> {
    const LOCAL_HEADER_SIGNATURE: [u8; 4] = *b"PK\x03\x04";
    let mut ranges = Vec::with_capacity(entries.len());
    for entry in entries {
        file.seek(SeekFrom::Start(entry.local_header_offset))
            .map_err(|error| map_io(&error))?;
        let mut fixed = [0_u8; 30];
        read_office_exact(file, &mut fixed)?;
        if fixed[..4] != LOCAL_HEADER_SIGNATURE {
            return Err(WorkspaceError::NotEditable);
        }
        let flags = le_u16(&fixed[6..8]);
        let compression = le_u16(&fixed[8..10]);
        let crc32 = le_u32(&fixed[14..18]);
        let compressed_size = u64::from(le_u32(&fixed[18..22]));
        let uncompressed_size = u64::from(le_u32(&fixed[22..26]));
        let name_length = usize::from(le_u16(&fixed[26..28]));
        let extra_length = usize::from(le_u16(&fixed[28..30]));
        if flags != entry.flags
            || compression != entry.compression
            || name_length != entry.name.len()
        {
            return Err(WorkspaceError::NotEditable);
        }
        if flags & 0x0008 == 0
            && (crc32 != entry.crc32
                || compressed_size != entry.compressed_size
                || uncompressed_size != entry.uncompressed_size)
        {
            return Err(WorkspaceError::NotEditable);
        }
        let mut raw_name = vec![0_u8; name_length];
        read_office_exact(file, &mut raw_name)?;
        if raw_name != entry.name.as_bytes() {
            return Err(WorkspaceError::NotEditable);
        }
        let mut extra = vec![0_u8; extra_length];
        read_office_exact(file, &mut extra)?;
        validate_office_extra_fields(&extra)?;
        let data_start = entry
            .local_header_offset
            .checked_add(30)
            .and_then(|value| value.checked_add(name_length as u64))
            .and_then(|value| value.checked_add(extra_length as u64))
            .ok_or(WorkspaceError::NotEditable)?;
        let data_end = data_start
            .checked_add(entry.compressed_size)
            .filter(|end| *end <= central_directory_start)
            .ok_or(WorkspaceError::NotEditable)?;
        ranges.push(entry.local_header_offset..data_end);
    }
    ranges.sort_unstable_by_key(|range| range.start);
    if ranges.first().map(|range| range.start) != Some(0)
        || ranges.windows(2).any(|pair| pair[0].end > pair[1].start)
    {
        return Err(WorkspaceError::NotEditable);
    }
    Ok(())
}

pub(super) fn supported_office_zip_flags(flags: u16, compression: u16) -> bool {
    const DATA_DESCRIPTOR: u16 = 1 << 3;
    const UTF8_NAMES: u16 = 1 << 11;
    const DEFLATE_OPTIONS: u16 = (1 << 1) | (1 << 2);
    let allowed = DATA_DESCRIPTOR | UTF8_NAMES | DEFLATE_OPTIONS;
    flags & !allowed == 0
        && matches!(compression, 0 | 8)
        && (compression == 8 || flags & DEFLATE_OPTIONS == 0)
}

pub(super) fn validate_office_extra_fields(mut extra: &[u8]) -> Result<(), WorkspaceError> {
    const ZIP64_EXTRA_FIELD: u16 = 0x0001;
    const UNICODE_PATH_EXTRA_FIELD: u16 = 0x7075;

    while !extra.is_empty() {
        if extra.len() < 4 {
            return Err(WorkspaceError::NotEditable);
        }
        let header_id = le_u16(&extra[..2]);
        let data_length = usize::from(le_u16(&extra[2..4]));
        let field_length = 4_usize
            .checked_add(data_length)
            .filter(|length| *length <= extra.len())
            .ok_or(WorkspaceError::NotEditable)?;
        if matches!(header_id, ZIP64_EXTRA_FIELD | UNICODE_PATH_EXTRA_FIELD) {
            return Err(WorkspaceError::NotEditable);
        }
        extra = &extra[field_length..];
    }
    Ok(())
}

pub(super) fn valid_office_entry_name(name: &[u8]) -> bool {
    if name.is_empty()
        || name.len() > MAX_OFFICE_ENTRY_NAME_BYTES
        || !name.is_ascii()
        || name.starts_with(b"/")
        || name.contains(&b'\\')
        || name.contains(&0)
        || name.contains(&b':')
        || name.contains(&b'?')
        || name.contains(&b'#')
    {
        return false;
    }
    let without_directory_suffix = name.strip_suffix(b"/").unwrap_or(name);
    !without_directory_suffix.is_empty()
        && without_directory_suffix
            .split(|byte| *byte == b'/')
            .all(|component| !component.is_empty() && component != b"." && component != b"..")
}

pub(super) fn forbidden_office_part(lower_name: &str) -> bool {
    lower_name.ends_with("vbaproject.bin")
        || lower_name.contains("/activex/")
        || lower_name.contains("/embeddings/")
}

pub(super) fn is_office_xml_part(lower_name: &str) -> bool {
    lower_name.ends_with(".xml") || lower_name.ends_with(".rels")
}

pub(super) fn valid_office_xml(xml: &[u8]) -> bool {
    let xml = xml.strip_prefix(b"\xef\xbb\xbf").unwrap_or(xml);
    if xml.contains(&0) || std::str::from_utf8(xml).is_err() {
        return false;
    }
    if contains_ascii_case_insensitive(xml, b"<!doctype")
        || contains_ascii_case_insensitive(xml, b"<!entity")
    {
        return false;
    }

    let Some(declaration_start) = find_xml_declaration(xml) else {
        return true;
    };
    if declaration_start != 0 {
        return false;
    }
    let Some(relative_end) = xml[5..].windows(2).position(|window| window == b"?>") else {
        return false;
    };
    let declaration_end = 5 + relative_end;
    let Ok(declaration) = std::str::from_utf8(&xml[5..declaration_end]) else {
        return false;
    };
    if !xml_declaration_allows_utf8(declaration) {
        return false;
    }
    find_xml_declaration(&xml[declaration_end + 2..]).is_none()
}

pub(super) fn find_xml_declaration(xml: &[u8]) -> Option<usize> {
    xml.windows(5).enumerate().find_map(|(index, candidate)| {
        if !candidate.eq_ignore_ascii_case(b"<?xml") {
            return None;
        }
        xml.get(index + 5)
            .is_some_and(u8::is_ascii_whitespace)
            .then_some(index)
    })
}

pub(super) fn xml_declaration_allows_utf8(declaration: &str) -> bool {
    let bytes = declaration.as_bytes();
    let mut cursor = 0;
    while cursor < bytes.len() {
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor == bytes.len() {
            return true;
        }
        let name_start = cursor;
        while cursor < bytes.len()
            && (bytes[cursor].is_ascii_alphanumeric()
                || matches!(bytes[cursor], b'_' | b':' | b'-' | b'.'))
        {
            cursor += 1;
        }
        if cursor == name_start {
            return false;
        }
        let name = &declaration[name_start..cursor];
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            return false;
        }
        cursor = skip_ascii_whitespace(bytes, cursor + 1);
        if cursor >= bytes.len() || !matches!(bytes[cursor], b'\'' | b'"') {
            return false;
        }
        let quote = bytes[cursor];
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != quote {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return false;
        }
        let value = &declaration[value_start..cursor];
        cursor += 1;
        if name.eq_ignore_ascii_case("encoding") && !value.eq_ignore_ascii_case("utf-8") {
            return false;
        }
    }
    true
}

pub(super) fn content_types_has_override(xml: &[u8], main_part: &str, content_type: &str) -> bool {
    if !valid_office_xml(xml) {
        return false;
    }
    let xml = xml.strip_prefix(b"\xef\xbb\xbf").unwrap_or(xml);
    let Ok(source) = std::str::from_utf8(xml) else {
        return false;
    };
    let expected_part = format!("/{main_part}");
    let bytes = source.as_bytes();
    let mut cursor = 0;
    while cursor < bytes.len() {
        let Some(relative_start) = bytes[cursor..].iter().position(|byte| *byte == b'<') else {
            break;
        };
        let start = cursor + relative_start;
        let mut quote = None;
        let mut end = start + 1;
        while end < bytes.len() {
            let byte = bytes[end];
            if let Some(expected_quote) = quote {
                if byte == expected_quote {
                    quote = None;
                }
            } else if byte == b'\'' || byte == b'"' {
                quote = Some(byte);
            } else if byte == b'>' {
                break;
            }
            end += 1;
        }
        if end >= bytes.len() {
            return false;
        }
        if override_tag_matches(&source[start + 1..end], &expected_part, content_type) {
            return true;
        }
        cursor = end + 1;
    }
    false
}

pub(super) fn override_tag_matches(
    tag: &str,
    expected_part: &str,
    expected_content_type: &str,
) -> bool {
    let bytes = tag.as_bytes();
    let mut cursor = skip_ascii_whitespace(bytes, 0);
    if cursor >= bytes.len() || matches!(bytes[cursor], b'/' | b'!' | b'?') {
        return false;
    }
    let name_start = cursor;
    while cursor < bytes.len() && !bytes[cursor].is_ascii_whitespace() && bytes[cursor] != b'/' {
        cursor += 1;
    }
    let element_name = &tag[name_start..cursor];
    if element_name.rsplit(':').next() != Some("Override") {
        return false;
    }

    let mut part_name = None;
    let mut content_type = None;
    while cursor < bytes.len() {
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor >= bytes.len() || bytes[cursor] == b'/' {
            break;
        }
        let attribute_start = cursor;
        while cursor < bytes.len()
            && !bytes[cursor].is_ascii_whitespace()
            && bytes[cursor] != b'='
            && bytes[cursor] != b'/'
        {
            cursor += 1;
        }
        if attribute_start == cursor {
            return false;
        }
        let attribute_name = &tag[attribute_start..cursor];
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            return false;
        }
        cursor = skip_ascii_whitespace(bytes, cursor + 1);
        if cursor >= bytes.len() || !matches!(bytes[cursor], b'\'' | b'"') {
            return false;
        }
        let quote = bytes[cursor];
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != quote {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return false;
        }
        let value = &tag[value_start..cursor];
        cursor += 1;
        match attribute_name.rsplit(':').next() {
            Some("PartName") => part_name = Some(value),
            Some("ContentType") => content_type = Some(value),
            _ => {}
        }
    }
    part_name == Some(expected_part) && content_type == Some(expected_content_type)
}

pub(super) fn skip_ascii_whitespace(bytes: &[u8], mut cursor: usize) -> usize {
    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    cursor
}

pub(super) fn contains_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && haystack.windows(needle.len()).any(|window| {
            window
                .iter()
                .zip(needle)
                .all(|(left, right)| left.eq_ignore_ascii_case(right))
        })
}

pub(super) fn read_office_exact(
    file: &mut std::fs::File,
    bytes: &mut [u8],
) -> Result<(), WorkspaceError> {
    file.read_exact(bytes).map_err(|error| {
        if error.kind() == std::io::ErrorKind::UnexpectedEof {
            WorkspaceError::NotEditable
        } else {
            map_io(&error)
        }
    })
}

pub(super) fn map_office_zip_error(error: zip::result::ZipError) -> WorkspaceError {
    match error {
        zip::result::ZipError::Io(error) => map_io(&error),
        _ => WorkspaceError::NotEditable,
    }
}

pub(super) fn le_u16(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

pub(super) fn le_u32(bytes: &[u8]) -> u32 {
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}
