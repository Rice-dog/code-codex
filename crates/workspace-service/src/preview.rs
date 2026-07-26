use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{WorkspaceError, map_io};
use crate::listing::Workspace;
use crate::path_guard::{
    DirectoryCapability, open_regular_file_for_update_nofollow, open_regular_file_nofollow,
    validate_relative,
};

pub const MAX_PREVIEW_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewKind {
    Text,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewUnsupportedReason {
    Sensitive,
    UnsupportedType,
    Binary,
    InvalidUtf8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewLineEnding {
    None,
    Lf,
    CrLf,
    Mixed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub kind: PreviewKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub size_bytes: u64,
    pub truncated: bool,
    pub editable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<PreviewUnsupportedReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_ending: Option<PreviewLineEnding>,
}

impl PreviewResult {
    fn text(
        text: String,
        size_bytes: u64,
        truncated: bool,
        version: Option<String>,
        line_ending: PreviewLineEnding,
    ) -> Self {
        let editable = !truncated && line_ending != PreviewLineEnding::Mixed && version.is_some();
        Self {
            kind: PreviewKind::Text,
            text: Some(text),
            size_bytes,
            truncated,
            editable,
            reason: None,
            version,
            line_ending: Some(line_ending),
        }
    }

    fn unsupported(reason: PreviewUnsupportedReason, size_bytes: u64, truncated: bool) -> Self {
        Self {
            kind: PreviewKind::Unsupported,
            text: None,
            size_bytes,
            truncated,
            editable: false,
            reason: Some(reason),
            version: None,
            line_ending: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewPolicy {
    Text,
    Unsupported(PreviewUnsupportedReason),
}

impl Workspace {
    /// Reads a small, text-only preview through the retained workspace
    /// capability. The renderer never controls the byte ceiling.
    pub fn preview(&self, relative_path: &str) -> Result<PreviewResult, WorkspaceError> {
        self.preview_with_after_read(relative_path, || {})
    }

    fn preview_with_after_read(
        &self,
        relative_path: &str,
        after_read: impl FnOnce(),
    ) -> Result<PreviewResult, WorkspaceError> {
        self.ensure_root_valid()?;
        let clean = validate_relative(relative_path)?;
        if clean.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }

        let name = clean
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(WorkspaceError::InvalidPath)?;
        let parent = clean.parent().unwrap_or_else(|| Path::new(""));
        let directory = DirectoryCapability::open(self.root_handle(), parent)?;
        let mut file = open_regular_file_nofollow(directory.handle()?, Path::new(name))?;
        let initial_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let initial_size = initial_metadata.len();

        let policy = preview_policy(name);
        if let PreviewPolicy::Unsupported(reason) = policy {
            drop(file);
            after_read();
            self.ensure_root_valid()?;
            return Ok(PreviewResult::unsupported(
                reason,
                initial_size,
                initial_size > MAX_PREVIEW_BYTES as u64,
            ));
        }

        let read_limit = MAX_PREVIEW_BYTES.saturating_add(1);
        let mut bytes = Vec::with_capacity(read_limit);
        Read::by_ref(&mut file)
            .take(read_limit as u64)
            .read_to_end(&mut bytes)
            .map_err(|error| map_io(&error))?;
        let final_metadata = file.metadata().map_err(|error| map_io(&error))?;
        let size_bytes = final_metadata.len();
        let truncated = bytes.len() > MAX_PREVIEW_BYTES || size_bytes > MAX_PREVIEW_BYTES as u64;
        let sample_has_more_bytes = size_bytes > bytes.len() as u64;
        let contains_nul = bytes.contains(&0);
        let sample_is_valid_or_potentially_incomplete = match std::str::from_utf8(&bytes) {
            Ok(_) => true,
            Err(error) => sample_has_more_bytes && error.error_len().is_none(),
        };
        bytes.truncate(MAX_PREVIEW_BYTES);
        drop(file);
        after_read();
        self.ensure_root_valid()?;

        if contains_nul {
            return Ok(PreviewResult::unsupported(
                PreviewUnsupportedReason::Binary,
                size_bytes,
                truncated,
            ));
        }
        if !sample_is_valid_or_potentially_incomplete {
            return Ok(PreviewResult::unsupported(
                PreviewUnsupportedReason::InvalidUtf8,
                size_bytes,
                truncated,
            ));
        }

        let text = match std::str::from_utf8(&bytes) {
            Ok(text) => text.to_owned(),
            Err(error) if truncated && error.error_len().is_none() => {
                let valid = &bytes[..error.valid_up_to()];
                match std::str::from_utf8(valid) {
                    Ok(text) => text.to_owned(),
                    Err(_) => {
                        return Ok(PreviewResult::unsupported(
                            PreviewUnsupportedReason::InvalidUtf8,
                            size_bytes,
                            truncated,
                        ));
                    }
                }
            }
            Err(_) => {
                return Ok(PreviewResult::unsupported(
                    PreviewUnsupportedReason::InvalidUtf8,
                    size_bytes,
                    truncated,
                ));
            }
        };
        let line_ending = classify_line_ending(&bytes);
        let version =
            (!truncated && size_bytes == bytes.len() as u64).then(|| content_version(&bytes));
        let text = text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned();
        Ok(PreviewResult::text(
            text,
            size_bytes,
            truncated,
            version,
            line_ending,
        ))
    }

    /// Saves a complete text preview when the caller still holds the version
    /// returned by `preview`. This deliberately cannot create files or bypass
    /// the native preview policy.
    pub fn save_preview(
        &self,
        relative_path: &str,
        expected_version: &str,
        content: &[u8],
    ) -> Result<PreviewResult, WorkspaceError> {
        self.ensure_root_valid()?;
        let clean = validate_relative(relative_path)?;
        if clean.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }

        let name = clean
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(WorkspaceError::InvalidPath)?;
        if preview_policy(name) != PreviewPolicy::Text {
            return Err(WorkspaceError::NotEditable);
        }
        if content.len() > MAX_PREVIEW_BYTES {
            return Err(WorkspaceError::ContentTooLarge);
        }
        let new_text = std::str::from_utf8(content).map_err(|_| WorkspaceError::NotEditable)?;
        if new_text.as_bytes().contains(&0)
            || classify_line_ending(new_text.as_bytes()) == PreviewLineEnding::Mixed
        {
            return Err(WorkspaceError::NotEditable);
        }

        let parent = clean.parent().unwrap_or_else(|| Path::new(""));
        let directory = DirectoryCapability::open(self.root_handle(), parent)?;
        let mut file = open_regular_file_for_update_nofollow(directory.handle()?, Path::new(name))?;
        let initial_metadata = file.metadata().map_err(|error| map_io(&error))?;
        if initial_metadata.len() > MAX_PREVIEW_BYTES as u64 {
            return Err(WorkspaceError::NotEditable);
        }

        let mut current = Vec::with_capacity(MAX_PREVIEW_BYTES.saturating_add(1));
        Read::by_ref(&mut file)
            .take(MAX_PREVIEW_BYTES.saturating_add(1) as u64)
            .read_to_end(&mut current)
            .map_err(|error| map_io(&error))?;
        let current_metadata = file.metadata().map_err(|error| map_io(&error))?;
        if current.len() > MAX_PREVIEW_BYTES
            || current_metadata.len() > MAX_PREVIEW_BYTES as u64
            || current_metadata.len() != current.len() as u64
            || current.contains(&0)
            || std::str::from_utf8(&current).is_err()
            || classify_line_ending(&current) == PreviewLineEnding::Mixed
        {
            return Err(WorkspaceError::NotEditable);
        }
        if content_version(&current) != expected_version {
            return Err(WorkspaceError::Conflict);
        }

        let had_bom = current.starts_with(&[0xef, 0xbb, 0xbf]);
        let final_size = content.len().saturating_add(if had_bom { 3 } else { 0 });
        if final_size > MAX_PREVIEW_BYTES {
            return Err(WorkspaceError::ContentTooLarge);
        }
        let mut replacement = Vec::with_capacity(final_size);
        if had_bom {
            replacement.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        }
        replacement.extend_from_slice(content);

        // Revalidate the retained authority immediately before the in-place
        // update. The fixed-size operation preserves file identity and ACLs.
        self.ensure_root_valid()?;
        file.seek(SeekFrom::Start(0))
            .map_err(|error| map_io(&error))?;
        file.write_all(&replacement)
            .map_err(|error| map_io(&error))?;
        file.set_len(replacement.len() as u64)
            .map_err(|error| map_io(&error))?;
        file.sync_all().map_err(|error| map_io(&error))?;
        drop(file);
        self.ensure_root_valid()?;
        self.preview(relative_path)
    }
}

fn content_version(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn classify_line_ending(bytes: &[u8]) -> PreviewLineEnding {
    let mut saw_lf = false;
    let mut saw_crlf = false;
    let mut saw_lone_cr = false;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' if bytes.get(index + 1) == Some(&b'\n') => {
                saw_crlf = true;
                index += 2;
            }
            b'\r' => {
                saw_lone_cr = true;
                index += 1;
            }
            b'\n' => {
                saw_lf = true;
                index += 1;
            }
            _ => index += 1,
        }
    }
    if saw_lone_cr || (saw_lf && saw_crlf) {
        PreviewLineEnding::Mixed
    } else if saw_crlf {
        PreviewLineEnding::CrLf
    } else if saw_lf {
        PreviewLineEnding::Lf
    } else {
        PreviewLineEnding::None
    }
}

fn preview_policy(name: &str) -> PreviewPolicy {
    let lower = name.to_ascii_lowercase();
    let extension = Path::new(&lower)
        .extension()
        .and_then(|extension| extension.to_str());

    if is_sensitive_name(&lower, extension) {
        return PreviewPolicy::Unsupported(PreviewUnsupportedReason::Sensitive);
    }
    if is_known_text_name(&lower) || is_text_extension(extension) {
        PreviewPolicy::Text
    } else {
        PreviewPolicy::Unsupported(PreviewUnsupportedReason::UnsupportedType)
    }
}

fn is_sensitive_name(name: &str, extension: Option<&str>) -> bool {
    const SENSITIVE_NAMES: &[&str] = &[
        ".npmrc",
        ".pypirc",
        ".netrc",
        "_netrc",
        "credentials",
        "credentials.json",
        "secrets.json",
    ];
    const SSH_PRIVATE_KEY_NAMES: &[&str] =
        &["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "id_xmss"];

    name.starts_with(".env")
        || SENSITIVE_NAMES.contains(&name)
        || SSH_PRIVATE_KEY_NAMES.iter().any(|private_name| {
            name == *private_name || name.starts_with(&format!("{private_name}."))
        })
        || matches!(
            extension,
            Some(
                "pem"
                    | "key"
                    | "pkey"
                    | "ppk"
                    | "pk8"
                    | "der"
                    | "crt"
                    | "cer"
                    | "csr"
                    | "p12"
                    | "pfx"
                    | "jks"
                    | "keystore"
                    | "kdb"
                    | "kdbx"
                    | "gpg"
                    | "pgp"
            )
        )
}

fn is_known_text_name(name: &str) -> bool {
    const TEXT_NAMES: &[&str] = &[
        ".babelrc",
        ".browserslistrc",
        ".dockerignore",
        ".editorconfig",
        ".eslintignore",
        ".eslintrc",
        ".gitattributes",
        ".gitignore",
        ".gitmodules",
        ".node-version",
        ".npmignore",
        ".nvmrc",
        ".prettierignore",
        ".prettierrc",
        ".python-version",
        ".ruby-version",
        ".stylelintignore",
        ".stylelintrc",
        ".tool-versions",
        "authors",
        "brewfile",
        "changelog",
        "changes",
        "code_of_conduct",
        "containerfile",
        "contributing",
        "contributors",
        "copying",
        "dockerfile",
        "gemfile",
        "gnumakefile",
        "history",
        "justfile",
        "license",
        "makefile",
        "notice",
        "procfile",
        "rakefile",
        "readme",
        "security",
        "taskfile",
        "vagrantfile",
    ];

    TEXT_NAMES.contains(&name)
        || (Path::new(name).extension().is_none()
            && (name.starts_with("license-") || name.starts_with("licence-")))
}

fn is_text_extension(extension: Option<&str>) -> bool {
    matches!(
        extension,
        Some(
            "txt"
                | "text"
                | "log"
                | "md"
                | "markdown"
                | "mdx"
                | "rst"
                | "adoc"
                | "asciidoc"
                | "tex"
                | "diff"
                | "patch"
                | "ts"
                | "tsx"
                | "mts"
                | "cts"
                | "js"
                | "jsx"
                | "mjs"
                | "cjs"
                | "py"
                | "pyi"
                | "pyw"
                | "rs"
                | "go"
                | "java"
                | "kt"
                | "kts"
                | "swift"
                | "c"
                | "h"
                | "cc"
                | "cpp"
                | "cxx"
                | "hpp"
                | "hxx"
                | "cs"
                | "fs"
                | "fsx"
                | "vb"
                | "php"
                | "rb"
                | "rake"
                | "lua"
                | "pl"
                | "pm"
                | "r"
                | "dart"
                | "scala"
                | "sc"
                | "groovy"
                | "gvy"
                | "ex"
                | "exs"
                | "erl"
                | "hrl"
                | "clj"
                | "cljs"
                | "cljc"
                | "edn"
                | "hs"
                | "lhs"
                | "ml"
                | "mli"
                | "sol"
                | "zig"
                | "nim"
                | "jl"
                | "sh"
                | "bash"
                | "zsh"
                | "fish"
                | "ps1"
                | "psm1"
                | "psd1"
                | "bat"
                | "cmd"
                | "html"
                | "htm"
                | "css"
                | "scss"
                | "sass"
                | "less"
                | "styl"
                | "vue"
                | "svelte"
                | "astro"
                | "hbs"
                | "handlebars"
                | "mustache"
                | "ejs"
                | "njk"
                | "jinja"
                | "jinja2"
                | "j2"
                | "liquid"
                | "twig"
                | "xml"
                | "xsl"
                | "xslt"
                | "xsd"
                | "wxs"
                | "wxl"
                | "wxi"
                | "csproj"
                | "fsproj"
                | "vbproj"
                | "vcxproj"
                | "wixproj"
                | "props"
                | "targets"
                | "resx"
                | "plist"
                | "json"
                | "jsonc"
                | "json5"
                | "yaml"
                | "yml"
                | "toml"
                | "ini"
                | "cfg"
                | "conf"
                | "config"
                | "properties"
                | "csv"
                | "tsv"
                | "sql"
                | "graphql"
                | "gql"
                | "proto"
                | "lock"
                | "sum"
                | "mod"
                | "cmake"
                | "gradle"
                | "sbt"
                | "mk"
                | "make"
                | "ipynb"
        )
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;

    use tempfile::TempDir;

    use super::*;

    fn fixture() -> (TempDir, Workspace) {
        let directory = TempDir::new().expect("temp dir");
        fs::create_dir(directory.path().join("src")).expect("src");
        fs::write(directory.path().join("src/main.rs"), "fn main() {}\n").expect("source");
        let workspace = Workspace::open(directory.path()).expect("workspace");
        (directory, workspace)
    }

    #[test]
    fn previews_nested_utf8_and_strips_the_bom() {
        let (directory, workspace) = fixture();
        fs::write(
            directory.path().join("src/bom.ts"),
            b"\xef\xbb\xbfexport const answer = 42;\n",
        )
        .expect("bom source");

        let ordinary = workspace.preview("src/main.rs").expect("ordinary preview");
        assert_eq!(ordinary.kind, PreviewKind::Text);
        assert_eq!(ordinary.text.as_deref(), Some("fn main() {}\n"));
        assert_eq!(ordinary.size_bytes, 13);
        assert!(!ordinary.truncated);
        assert!(ordinary.editable);
        assert_eq!(ordinary.line_ending, Some(PreviewLineEnding::Lf));
        assert_eq!(ordinary.version.as_deref().map(str::len), Some(64));

        let bom = workspace.preview("src/bom.ts").expect("bom preview");
        assert_eq!(bom.text.as_deref(), Some("export const answer = 42;\n"));
        assert_eq!(bom.size_bytes, 29);
    }

    #[test]
    fn saves_existing_preview_and_rejects_stale_versions() {
        let (directory, workspace) = fixture();
        let original = workspace.preview("src/main.rs").expect("original preview");
        let original_version = original.version.expect("editable version");

        let saved = workspace
            .save_preview(
                "src/main.rs",
                &original_version,
                b"fn main() { println!(\"ok\"); }\n",
            )
            .expect("save preview");
        assert_eq!(
            fs::read_to_string(directory.path().join("src/main.rs")).expect("saved source"),
            "fn main() { println!(\"ok\"); }\n"
        );
        assert_eq!(
            saved.text.as_deref(),
            Some("fn main() { println!(\"ok\"); }\n")
        );
        assert_ne!(saved.version.as_deref(), Some(original_version.as_str()));
        assert!(saved.editable);

        fs::write(directory.path().join("src/main.rs"), "same length!\n").expect("external edit");
        let error = workspace
            .save_preview(
                "src/main.rs",
                saved.version.as_deref().expect("saved version"),
                b"mine\n",
            )
            .expect_err("stale save must conflict");
        assert_eq!(error.code(), crate::ErrorCode::Conflict);
        assert_eq!(
            fs::read_to_string(directory.path().join("src/main.rs")).expect("external source"),
            "same length!\n"
        );
    }

    #[test]
    fn saves_empty_files_and_preserves_bom_and_crlf() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("empty.txt"), []).expect("empty file");
        fs::write(
            directory.path().join("windows.txt"),
            b"\xef\xbb\xbffirst\r\nsecond\r\n",
        )
        .expect("windows file");

        let empty = workspace.preview("empty.txt").expect("empty preview");
        assert!(empty.editable);
        assert_eq!(empty.line_ending, Some(PreviewLineEnding::None));
        let empty_saved = workspace
            .save_preview(
                "empty.txt",
                empty.version.as_deref().expect("empty version"),
                b"now populated",
            )
            .expect("save empty file");
        assert_eq!(empty_saved.text.as_deref(), Some("now populated"));

        let windows = workspace.preview("windows.txt").expect("windows preview");
        assert_eq!(windows.text.as_deref(), Some("first\r\nsecond\r\n"));
        assert_eq!(windows.line_ending, Some(PreviewLineEnding::CrLf));
        let saved = workspace
            .save_preview(
                "windows.txt",
                windows.version.as_deref().expect("windows version"),
                b"changed\r\n",
            )
            .expect("save windows file");
        assert_eq!(saved.text.as_deref(), Some("changed\r\n"));
        assert_eq!(
            fs::read(directory.path().join("windows.txt")).expect("saved bytes"),
            b"\xef\xbb\xbfchanged\r\n"
        );
    }

    #[test]
    fn save_reuses_preview_policy_and_content_limits() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join(".env"), "TOKEN=secret\n").expect("sensitive file");
        fs::write(
            directory.path().join("large.txt"),
            vec![b'x'; MAX_PREVIEW_BYTES + 1],
        )
        .expect("large file");
        fs::write(directory.path().join("mixed.txt"), b"one\r\ntwo\n").expect("mixed file");

        assert_eq!(
            workspace
                .save_preview(".env", &"0".repeat(64), b"replacement")
                .expect_err("sensitive save")
                .code(),
            crate::ErrorCode::NotEditable
        );
        assert_eq!(
            workspace
                .save_preview("large.txt", &"0".repeat(64), b"replacement")
                .expect_err("truncated save")
                .code(),
            crate::ErrorCode::NotEditable
        );
        let mixed = workspace.preview("mixed.txt").expect("mixed preview");
        assert!(!mixed.editable);
        assert_eq!(mixed.line_ending, Some(PreviewLineEnding::Mixed));

        let original = workspace.preview("src/main.rs").expect("editable preview");
        let version = original.version.as_deref().expect("version");
        for invalid in [b"nul\0byte".as_slice(), &[0xff], b"one\r\ntwo\n"] {
            assert_eq!(
                workspace
                    .save_preview("src/main.rs", version, invalid)
                    .expect_err("invalid edit content")
                    .code(),
                crate::ErrorCode::NotEditable
            );
        }
        assert_eq!(
            workspace
                .save_preview("src/main.rs", version, &vec![b'y'; MAX_PREVIEW_BYTES + 1])
                .expect_err("oversized edit")
                .code(),
            crate::ErrorCode::ContentTooLarge
        );
        assert_eq!(
            workspace
                .save_preview("../outside.rs", version, b"outside")
                .expect_err("traversal save")
                .code(),
            crate::ErrorCode::InvalidPath
        );
    }

    #[test]
    fn rejects_root_directory_and_ambiguous_paths() {
        let (_directory, workspace) = fixture();
        for invalid in [
            "",
            ".",
            "..",
            "../secret.rs",
            "/etc/passwd",
            "C:/Windows/win.ini",
            "src/main.rs:stream",
        ] {
            assert_eq!(
                workspace
                    .preview(invalid)
                    .expect_err("invalid preview path")
                    .code(),
                crate::ErrorCode::InvalidPath,
                "path should fail: {invalid}"
            );
        }
        assert_eq!(
            workspace.preview("src").expect_err("directory").code(),
            crate::ErrorCode::InvalidPath
        );
    }

    #[test]
    fn bounds_reads_and_preserves_a_valid_utf8_prefix_at_the_cutoff() {
        let (directory, workspace) = fixture();
        let mut contents = vec![b'a'; MAX_PREVIEW_BYTES - 1];
        contents.extend_from_slice("é-tail".as_bytes());
        fs::write(directory.path().join("large.txt"), &contents).expect("large text");

        let preview = workspace.preview("large.txt").expect("large preview");
        assert_eq!(preview.kind, PreviewKind::Text);
        assert_eq!(
            preview.text.as_deref().map(str::len),
            Some(MAX_PREVIEW_BYTES - 1)
        );
        assert_eq!(preview.size_bytes, contents.len() as u64);
        assert!(preview.truncated);
    }

    #[test]
    fn distinguishes_exact_limit_from_one_byte_over_limit() {
        let (directory, workspace) = fixture();
        fs::write(
            directory.path().join("exact.txt"),
            vec![b'x'; MAX_PREVIEW_BYTES],
        )
        .expect("exact text");
        fs::write(
            directory.path().join("over.txt"),
            vec![b'y'; MAX_PREVIEW_BYTES + 1],
        )
        .expect("over text");

        let exact = workspace.preview("exact.txt").expect("exact preview");
        assert_eq!(exact.text.as_deref().map(str::len), Some(MAX_PREVIEW_BYTES));
        assert_eq!(exact.size_bytes, MAX_PREVIEW_BYTES as u64);
        assert!(!exact.truncated);
        assert!(exact.editable);
        assert!(exact.version.is_some());

        let over = workspace.preview("over.txt").expect("over preview");
        assert_eq!(over.text.as_deref().map(str::len), Some(MAX_PREVIEW_BYTES));
        assert_eq!(over.size_bytes, (MAX_PREVIEW_BYTES + 1) as u64);
        assert!(over.truncated);
        assert!(!over.editable);
        assert!(over.version.is_none());
    }

    #[test]
    fn huge_files_have_a_bounded_preview_response() {
        let (directory, workspace) = fixture();
        let path = directory.path().join("huge.txt");
        let mut file = fs::File::create(&path).expect("huge file");
        file.write_all(&vec![b'z'; MAX_PREVIEW_BYTES + 1])
            .expect("preview prefix");
        const HUGE_SIZE: u64 = 32 * 1024 * 1024;
        file.set_len(HUGE_SIZE).expect("extend huge file");
        drop(file);

        let preview = workspace.preview("huge.txt").expect("huge preview");
        assert_eq!(preview.kind, PreviewKind::Text);
        assert_eq!(
            preview.text.as_deref().map(str::len),
            Some(MAX_PREVIEW_BYTES)
        );
        assert_eq!(preview.size_bytes, HUGE_SIZE);
        assert!(preview.truncated);
    }

    #[test]
    fn rejects_nul_and_invalid_utf8_without_returning_bytes() {
        let (directory, workspace) = fixture();
        fs::write(directory.path().join("binary.txt"), b"prefix\0secret").expect("nul file");
        fs::write(directory.path().join("invalid.txt"), [b'a', 0xff, b'b']).expect("invalid file");

        let nul = workspace.preview("binary.txt").expect("nul result");
        assert_eq!(nul.kind, PreviewKind::Unsupported);
        assert_eq!(nul.reason, Some(PreviewUnsupportedReason::Binary));
        assert!(nul.text.is_none());

        let invalid = workspace.preview("invalid.txt").expect("invalid result");
        assert_eq!(invalid.kind, PreviewKind::Unsupported);
        assert_eq!(invalid.reason, Some(PreviewUnsupportedReason::InvalidUtf8));
        assert!(invalid.text.is_none());
    }

    #[test]
    fn rejects_a_nul_in_the_truncation_sentinel_byte() {
        let (directory, workspace) = fixture();
        let mut contents = vec![b'a'; MAX_PREVIEW_BYTES];
        contents.push(0);
        fs::write(directory.path().join("sentinel.txt"), contents).expect("sentinel file");

        let result = workspace.preview("sentinel.txt").expect("sentinel result");
        assert_eq!(result.kind, PreviewKind::Unsupported);
        assert_eq!(result.reason, Some(PreviewUnsupportedReason::Binary));
        assert_eq!(result.size_bytes, (MAX_PREVIEW_BYTES + 1) as u64);
        assert!(result.truncated);
        assert!(result.text.is_none());
    }

    #[test]
    fn validates_utf8_in_the_sentinel_but_allows_a_potentially_incomplete_sequence() {
        let (directory, workspace) = fixture();
        let mut invalid = vec![b'a'; MAX_PREVIEW_BYTES];
        invalid.push(0xff);
        fs::write(directory.path().join("invalid-sentinel.txt"), invalid)
            .expect("invalid sentinel file");

        let invalid_result = workspace
            .preview("invalid-sentinel.txt")
            .expect("invalid sentinel result");
        assert_eq!(invalid_result.kind, PreviewKind::Unsupported);
        assert_eq!(
            invalid_result.reason,
            Some(PreviewUnsupportedReason::InvalidUtf8)
        );
        assert!(invalid_result.truncated);
        assert!(invalid_result.text.is_none());

        let mut incomplete_eof = vec![b'b'; MAX_PREVIEW_BYTES - 1];
        incomplete_eof.extend_from_slice(&[0xf0, 0x9f]);
        fs::write(directory.path().join("incomplete-eof.txt"), incomplete_eof)
            .expect("incomplete eof file");

        let incomplete_eof_result = workspace
            .preview("incomplete-eof.txt")
            .expect("incomplete eof result");
        assert_eq!(incomplete_eof_result.kind, PreviewKind::Unsupported);
        assert_eq!(
            incomplete_eof_result.reason,
            Some(PreviewUnsupportedReason::InvalidUtf8)
        );
        assert!(incomplete_eof_result.truncated);
        assert!(incomplete_eof_result.text.is_none());

        let mut potentially_incomplete = vec![b'c'; MAX_PREVIEW_BYTES - 1];
        potentially_incomplete.extend_from_slice(&[0xf0, 0x9f, 0x92, 0xa9]);
        fs::write(
            directory.path().join("potentially-incomplete.txt"),
            potentially_incomplete,
        )
        .expect("potentially incomplete file");

        let incomplete_result = workspace
            .preview("potentially-incomplete.txt")
            .expect("potentially incomplete result");
        assert_eq!(incomplete_result.kind, PreviewKind::Text);
        assert_eq!(
            incomplete_result.text.as_deref().map(str::len),
            Some(MAX_PREVIEW_BYTES - 1)
        );
        assert!(incomplete_result.truncated);
        assert!(incomplete_result.reason.is_none());
    }

    #[test]
    fn gates_sensitive_unknown_and_binary_or_executable_types_before_reading() {
        let (directory, workspace) = fixture();
        for name in [
            ".env",
            ".env.local",
            ".npmrc",
            ".pypirc",
            ".netrc",
            "id_rsa",
            "id_ed25519.bak",
            "client.pem",
            "store.pfx",
            "secrets.json",
        ] {
            fs::write(directory.path().join(name), "should not cross").expect("sensitive file");
            let result = workspace.preview(name).expect("sensitive result");
            assert_eq!(result.kind, PreviewKind::Unsupported, "{name}");
            assert_eq!(
                result.reason,
                Some(PreviewUnsupportedReason::Sensitive),
                "{name}"
            );
            assert!(result.text.is_none());
        }

        for name in [
            "image.png",
            "archive.zip",
            "manual.pdf",
            "database.sqlite",
            "program.exe",
            "unknown.blob",
        ] {
            fs::write(
                directory.path().join(name),
                "valid UTF-8 must still be gated",
            )
            .expect("unsupported file");
            let result = workspace.preview(name).expect("unsupported result");
            assert_eq!(result.kind, PreviewKind::Unsupported, "{name}");
            assert_eq!(
                result.reason,
                Some(PreviewUnsupportedReason::UnsupportedType),
                "{name}"
            );
            assert!(result.text.is_none());
        }
    }

    #[test]
    fn permits_known_text_extensions_and_project_file_names_case_insensitively() {
        let (directory, workspace) = fixture();
        for name in [
            "README",
            "Dockerfile",
            "CONFIG.YAML",
            "query.SQL",
            ".editorconfig",
        ] {
            fs::write(directory.path().join(name), "text").expect("text file");
            assert_eq!(
                workspace.preview(name).expect("text preview").kind,
                PreviewKind::Text,
                "{name}"
            );
        }
    }

    #[test]
    fn serializes_the_camel_case_discriminated_contract() {
        let result =
            PreviewResult::unsupported(PreviewUnsupportedReason::InvalidUtf8, 70_000, true);
        let value = serde_json::to_value(result).expect("serialize preview");
        assert_eq!(value["kind"], "unsupported");
        assert_eq!(value["sizeBytes"], 70_000);
        assert_eq!(value["truncated"], true);
        assert_eq!(value["editable"], false);
        assert_eq!(value["reason"], "invalid-utf8");
        assert!(value.get("text").is_none());
        assert!(value.get("version").is_none());
        assert!(value.get("lineEnding").is_none());
    }

    #[cfg(unix)]
    fn symlink_file(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[cfg(windows)]
    fn symlink_file(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_file(target, link).is_ok()
    }

    #[cfg(unix)]
    fn symlink_directory(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[cfg(windows)]
    fn symlink_directory(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_dir(target, link).is_ok()
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn rejects_final_file_and_ancestor_reparse_points() {
        let (directory, workspace) = fixture();
        let outside = TempDir::new().expect("outside");
        fs::write(outside.path().join("outside.rs"), "outside").expect("outside file");
        fs::create_dir(outside.path().join("tree")).expect("outside tree");
        fs::write(outside.path().join("tree/nested.rs"), "outside nested").expect("outside nested");

        if !symlink_file(
            &outside.path().join("outside.rs"),
            &directory.path().join("linked.rs"),
        ) || !symlink_directory(
            &outside.path().join("tree"),
            &directory.path().join("linked-tree"),
        ) {
            return;
        }

        assert_eq!(
            workspace
                .preview("linked.rs")
                .expect_err("file reparse")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .preview("linked-tree/nested.rs")
                .expect_err("ancestor reparse")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .save_preview("linked.rs", &"0".repeat(64), b"replacement")
                .expect_err("file reparse save")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .save_preview("linked-tree/nested.rs", &"0".repeat(64), b"replacement",)
                .expect_err("ancestor reparse save")
                .code(),
            crate::ErrorCode::OutsideWorkspace
        );
        assert_eq!(
            fs::read_to_string(outside.path().join("outside.rs")).expect("outside file"),
            "outside"
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn root_replacement_after_read_prevents_content_from_returning() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let moved = parent.path().join("moved");
        fs::create_dir(&root).expect("root");
        fs::write(root.join("secret.txt"), "bound content").expect("content");
        let workspace = Workspace::open(&root).expect("workspace");

        let result = workspace.preview_with_after_read("secret.txt", || {
            fs::rename(&root, &moved).expect("move original root");
            fs::create_dir(&root).expect("replacement root");
            fs::write(root.join("secret.txt"), "replacement content").expect("replacement");
        });
        assert_eq!(
            result.expect_err("stale root must fail").code(),
            crate::ErrorCode::OutsideWorkspace
        );
    }
}
