//! Read existing tool configuration without exposing credentials or inheriting
//! a user-writable executable/DLL search path in the app-server itself.
use super::{AccountError, Result};
use std::path::{Path, PathBuf};

/// One small tool configuration per logical executor, never per account or
/// history copy. Runtime locks must not share CODEX_HOME with the GUI writer.
pub fn prepare_execution_home(home: &Path, official: &Path) -> Result<()> {
    use std::io::Write;
    let file=official.join("config.toml");
    if file.exists() {
        let text=std::fs::read_to_string(file).map_err(|_| AccountError::protocol("The existing tool configuration cannot be read."))?;
        let config:toml::Value=toml::from_str(&text).map_err(|_| AccountError::protocol("The existing tool configuration is invalid."))?;
        let mut selected=toml::Table::new();
        for key in ["features","mcp_servers","plugins","marketplaces","tools","skills","windows","shell_environment_policy","projects","memories","js_repl_node_path","js_repl_node_module_dirs","sandbox_mode","approval_policy","permissions"] {
            if let Some(value)=config.get(key) { selected.insert(key.into(),value.clone()); }
        }
        let text=toml::to_string(&selected).map_err(|_| AccountError::protocol("The existing tool configuration cannot be prepared."))?;
        let mut temporary=tempfile::NamedTempFile::new_in(home).map_err(|_| AccountError::protocol("The executor configuration cannot be staged."))?;
        temporary.write_all(text.as_bytes()).map_err(|_| AccountError::protocol("The executor configuration cannot be written."))?;
        temporary.persist(home.join("config.toml")).map_err(|_| AccountError::protocol("The executor configuration cannot be committed."))?;
    }
    for name in ["skills","plugins","rules"] {
        let source=official.join(name);if !source.is_dir() { continue; }
        let target=home.join(name);
        if target.exists() {
            if !same_file::is_same_file(&source,&target).unwrap_or(false) { return Err(AccountError::protocol("An executor tool resource does not match its official source.")); }
        } else {
            #[cfg(windows)]
            junction::create(&source,&target).map_err(|_| AccountError::protocol("The existing tool resources cannot be linked."))?;
            #[cfg(not(windows))]
            std::os::unix::fs::symlink(&source,&target).map_err(|_| AccountError::protocol("The existing tool resources cannot be linked."))?;
        }
    }
    Ok(())
}

fn resolve_command(command: &str, path: &std::ffi::OsStr) -> Option<PathBuf> {
    let candidate = Path::new(command);
    if candidate.is_absolute() {
        return candidate.is_file().then(|| candidate.to_path_buf());
    }
    if candidate.components().count() != 1 { return None; }
    let extensions = ["", ".exe", ".cmd", ".bat", ".com"];
    std::env::split_paths(path).filter(|p| p.is_absolute()).find_map(|dir| {
        extensions.iter().map(|ext| dir.join(format!("{command}{ext}")))
            .find(|p| p.is_file()).and_then(|p| dunce::canonicalize(p).ok())
    })
}

pub fn tool_overrides(home: &Path) -> Result<Vec<String>> {
    let file = home.join("config.toml");
    if !file.exists() { return Ok(Vec::new()); }
    let text = std::fs::read_to_string(file).map_err(|_| AccountError::protocol("The existing tool configuration cannot be read."))?;
    let config: toml::Value = toml::from_str(&text).map_err(|_| AccountError::protocol("The existing tool configuration is invalid."))?;
    let path = std::env::var_os("PATH").unwrap_or_default();
    let mut overrides = Vec::new();
    if config.get("js_repl_node_path").is_none() {
        if let Some(node) = resolve_command("node", &path) {
            overrides.push(format!("js_repl_node_path={}", serde_json::json!(node)));
        }
    }
    if let Some(servers) = config.get("mcp_servers").and_then(toml::Value::as_table) {
        for (name, server) in servers {
            if server.get("enabled").and_then(toml::Value::as_bool) == Some(false) { continue; }
            let Some(command) = server.get("command").and_then(toml::Value::as_str) else { continue; };
            let configured_path = server.get("env").and_then(|e| e.get("PATH")).and_then(toml::Value::as_str);
            let tool_path = configured_path.map(std::ffi::OsStr::new).unwrap_or(&path);
            let resolved = resolve_command(command, tool_path).ok_or_else(|| AccountError::protocol("An existing MCP tool executable cannot be resolved. Check the configured tool command and PATH."))?;
            let key = serde_json::json!(name);
            overrides.push(format!("mcp_servers.{key}.command={}", serde_json::json!(resolved)));
            if configured_path.is_none() {
                overrides.push(format!("mcp_servers.{key}.env.PATH={}", serde_json::json!(path.to_string_lossy())));
            }
        }
    }
    Ok(overrides)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn executor_shares_tool_resources_without_copying_account_configuration() {
        let source=tempfile::tempdir().unwrap();let target=tempfile::tempdir().unwrap();
        std::fs::create_dir(source.path().join("skills")).unwrap();
        std::fs::write(source.path().join("skills/SKILL.md"),"fixture").unwrap();
        std::fs::write(source.path().join("config.toml"),"model='private-model'\n[model_providers.private]\napi_key='excluded'\n[features]\njs_repl=true\n").unwrap();
        prepare_execution_home(target.path(),source.path()).unwrap();
        prepare_execution_home(target.path(),source.path()).unwrap();
        let text=std::fs::read_to_string(target.path().join("config.toml")).unwrap();
        assert!(!text.contains("private-model")&&!text.contains("api_key"));
        assert!(text.contains("js_repl"));
        assert!(same_file::is_same_file(source.path().join("skills"),target.path().join("skills")).unwrap());
        #[cfg(windows)]
        junction::delete(target.path().join("skills")).unwrap();
        #[cfg(not(windows))]
        std::fs::remove_file(target.path().join("skills")).unwrap();
        assert!(source.path().join("skills/SKILL.md").is_file());
    }
    #[test]
    fn tool_resolution_uses_explicit_path_and_never_current_directory() {
        let dir=tempfile::tempdir().unwrap();
        let exe=dir.path().join("tool.cmd");std::fs::write(&exe,b"fixture").unwrap();
        assert!(resolve_command("tool", &std::env::join_paths([dir.path()]).unwrap()).is_some());
        assert!(resolve_command("tool", std::ffi::OsStr::new("")).is_none());
        assert!(resolve_command("../tool", &std::env::join_paths([dir.path()]).unwrap()).is_none());
        assert!(resolve_command(exe.to_str().unwrap(), std::ffi::OsStr::new("")).is_some());
    }
}
