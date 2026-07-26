fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    println!("cargo:rerun-if-changed=resources/windows-manifest.rc");
    println!("cargo:rerun-if-changed=resources/application.manifest");
    embed_resource::compile_for(
        "resources/windows-manifest.rc",
        [
            "code-codex-launcher",
            "code-codex-shim",
            "code-codex-setup",
            "code-codex-uninstall",
        ],
        embed_resource::NONE,
    )
    .manifest_required()
    .expect("the Windows asInvoker manifest is required");
}
