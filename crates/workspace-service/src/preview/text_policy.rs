use sha2::Digest;

use std::path::Path;

use sha2::Sha256;

use super::{PreviewLineEnding, PreviewPolicy, PreviewUnsupportedReason};

pub(super) fn content_version(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(super) fn classify_line_ending(bytes: &[u8]) -> PreviewLineEnding {
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

pub(super) fn preview_policy(name: &str) -> PreviewPolicy {
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

pub(super) fn is_sensitive_name(name: &str, extension: Option<&str>) -> bool {
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

pub(super) fn is_known_text_name(name: &str) -> bool {
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

pub(super) fn is_text_extension(extension: Option<&str>) -> bool {
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
                | "drawio"
                | "plantuml"
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
