fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    println!("cargo:rerun-if-changed=resources/windows-manifest.rc");
    println!("cargo:rerun-if-changed=resources/application.manifest");
    println!("cargo:rerun-if-changed=resources/code-codex.ico");
    let version = std::env::var("CARGO_PKG_VERSION").expect("Cargo package version");
    let parts: Vec<u16> = version.split('.').map(|part| part.parse().expect("numeric Windows version")).collect();
    assert_eq!(parts.len(), 3);
    let mut resource = std::fs::read_to_string("resources/windows-manifest.rc").expect("Windows resource source");
    resource.push_str(&format!(r#"
1 VERSIONINFO
FILEVERSION {0},{1},{2},0
PRODUCTVERSION {0},{1},{2},0
FILEOS 0x40004L
FILETYPE 0x1L
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904b0"
  BEGIN
   VALUE "CompanyName", "Code-Codex contributors\0"
   VALUE "ProductName", "Code-Codex\0"
   VALUE "FileDescription", "Code-Codex\0"
   VALUE "FileVersion", "{3}\0"
   VALUE "ProductVersion", "{3}\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x0409, 1200
 END
END
"#, parts[0], parts[1], parts[2], version));
    let generated = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR")).join("windows-versioned.rc");
    std::fs::write(&generated, resource).expect("versioned Windows resource");
    embed_resource::compile_for(
        &generated,
        [
            "code-codex",
            "code-codex-launcher",
            "code-codex-shim",
            "code-codex-setup",
            "code-codex-shortcut",
            "code-codex-uninstall",
        ],
        embed_resource::NONE,
    )
    .manifest_required()
    .expect("the Windows asInvoker manifest is required");
}
