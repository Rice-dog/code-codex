use super::lock_unpoisoned;
use tokio::io::AsyncReadExt;

use std::io;

use std::path::{Component, Path, PathBuf};

use std::process::Stdio;

use cdp_client::BridgeError;

use serde_json::{Value, json};
use sha2::Digest as _;

use tokio::process::Command as TokioCommand;

use super::{
    ActiveContext, BoundedGitOutput, DEFAULT_GIT_HISTORY_LIMIT, GIT_COMMAND_TIMEOUT,
    GitChangedFile, GitCommandOutput, GitCommitParams, GitCommitResult, GitCommitSummary,
    GitDiffParams, GitDiffResult, GitHistoryParams, GitHistoryResult, MAX_GIT_CHANGED_FILES,
    MAX_GIT_COMMIT_BYTES, MAX_GIT_DIFF_BYTES, MAX_GIT_HISTORY_BYTES, MAX_GIT_HISTORY_LIMIT,
    MAX_GIT_HISTORY_SKIP, MAX_GIT_STDERR_BYTES, NativeBridge, internal_error, no_context_error,
    operation_error,
};

pub(super) fn valid_git_hash(hash: &str) -> bool {
    matches!(hash.len(), 40 | 64) && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(super) fn valid_git_relative_path(path: &str) -> bool {
    if path.is_empty() || path.contains('\0') {
        return false;
    }
    let path = Path::new(path);
    !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
        && path
            .components()
            .any(|component| matches!(component, Component::Normal(_)))
}

pub(super) fn parse_git_history(bytes: &[u8]) -> Result<Vec<GitCommitSummary>, BridgeError> {
    let fields = nul_fields(bytes);
    if fields.is_empty() {
        return Ok(Vec::new());
    }
    if fields.len() % 5 != 0 {
        return Err(internal_error());
    }
    let mut commits = Vec::with_capacity(fields.len() / 5);
    for fields in fields.chunks_exact(5) {
        if !valid_git_hash(fields[0]) {
            return Err(internal_error());
        }
        commits.push(GitCommitSummary {
            hash: fields[0].to_owned(),
            short_hash: fields[1].to_owned(),
            author: fields[2].to_owned(),
            authored_at: fields[3].to_owned(),
            subject: fields[4].to_owned(),
        });
    }
    Ok(commits)
}

pub(super) fn parse_git_commit_metadata(
    bytes: &[u8],
) -> Result<(String, String, String, String, String, String), BridgeError> {
    let fields = nul_fields(bytes);
    if fields.len() != 6 || !valid_git_hash(fields[0]) {
        return Err(internal_error());
    }
    Ok((
        fields[0].to_owned(),
        fields[1].to_owned(),
        fields[2].to_owned(),
        fields[3].to_owned(),
        fields[4].to_owned(),
        fields[5].trim_end().to_owned(),
    ))
}

pub(super) fn parse_git_changed_files(bytes: &[u8]) -> Result<Vec<GitChangedFile>, BridgeError> {
    let fields = nul_fields(bytes);
    let mut files = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = fields[index];
        index += 1;
        if status.is_empty() || index >= fields.len() {
            return Err(internal_error());
        }
        if status.starts_with('R') || status.starts_with('C') {
            if index + 1 >= fields.len() {
                return Err(internal_error());
            }
            let old_path = fields[index].to_owned();
            let path = fields[index + 1].to_owned();
            index += 2;
            if !valid_git_relative_path(&old_path) || !valid_git_relative_path(&path) {
                return Err(internal_error());
            }
            files.push(GitChangedFile {
                status: status.to_owned(),
                path,
                old_path: Some(old_path),
            });
        } else {
            let path = fields[index].to_owned();
            index += 1;
            if !valid_git_relative_path(&path) {
                return Err(internal_error());
            }
            files.push(GitChangedFile {
                status: status.to_owned(),
                path,
                old_path: None,
            });
        }
    }
    Ok(files)
}

pub(super) fn nul_fields(bytes: &[u8]) -> Vec<&str> {
    bytes
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .map(|field| std::str::from_utf8(field).unwrap_or_default())
        .collect()
}

pub(super) async fn collect_bounded<R>(mut reader: R, limit: usize) -> io::Result<BoundedGitOutput>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        let keep = limit.saturating_sub(bytes.len()).min(read);
        bytes.extend_from_slice(&buffer[..keep]);
        truncated |= keep < read;
    }
    Ok(BoundedGitOutput { bytes, truncated })
}

pub(super) async fn run_git_readonly(
    root: PathBuf,
    args: Vec<String>,
    max_stdout_bytes: usize,
) -> Result<GitCommandOutput, BridgeError> {
    let command_kind = args
        .iter()
        .find(|arg| {
            ["rev-parse", "symbolic-ref", "log", "show", "diff", "status"].contains(&arg.as_str())
        })
        .cloned()
        .unwrap_or_else(|| "other-readonly".into());
    let mut operation = crate::runtime_log::Operation::start(
        "git",
        "command",
        json!({"commandKind":command_kind,"argumentCount":args.len(),"timeoutMs":GIT_COMMAND_TIMEOUT.as_millis(),"maxStdoutBytes":max_stdout_bytes}),
    );
    let result=async {
    let mut command = TokioCommand::new("git");
    command
        .arg("--no-pager")
        .arg("-c")
        .arg("color.ui=false")
        .args(args)
        .current_dir(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(|e| {
        operation.event("process spawn","failed",crate::network_diagnostics::error_details(&e));
        BridgeError::new(
            "GIT_UNAVAILABLE",
            "Git is not installed or is unavailable to Code-Codex.",
        )
    })?;
    let stdout = child.stdout.take().ok_or_else(internal_error)?;
    let stderr = child.stderr.take().ok_or_else(internal_error)?;
    let completed = tokio::time::timeout(GIT_COMMAND_TIMEOUT, async {
        tokio::join!(
            child.wait(),
            collect_bounded(stdout, max_stdout_bytes),
            collect_bounded(stderr, MAX_GIT_STDERR_BYTES)
        )
    })
    .await;
    let (status, stdout, stderr) = match completed {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            return Err(BridgeError::new(
                "GIT_TIMEOUT",
                "Git history took too long to load.",
            ));
        }
    };
    let status = status.map_err(|e|{operation.event("process exit","failed",crate::network_diagnostics::error_details(&e));internal_error()})?;
    let stdout = stdout.map_err(|e|{operation.event("stdout collection","failed",crate::network_diagnostics::error_details(&e));internal_error()})?;
    let stderr = stderr.map_err(|e|{operation.event("stderr collection","failed",crate::network_diagnostics::error_details(&e));internal_error()})?;
    operation.event("process exit","observed",json!({"exitCode":status.code(),"stdoutBytes":stdout.bytes.len(),"stderrBytes":stderr.bytes.len(),"stderrSummary":String::from_utf8_lossy(&stderr.bytes).chars().take(1800).collect::<String>()}));
    if !status.success() {
        let stderr = String::from_utf8_lossy(&stderr.bytes);
        if stderr.to_ascii_lowercase().contains("not a git repository") {
            return Err(BridgeError::new(
                "NOT_GIT_REPOSITORY",
                "The selected project is not a Git repository.",
            ));
        }
        return Err(BridgeError::new(
            "GIT_FAILED",
            "Git could not read this repository's history.",
        ));
    }
    Ok(GitCommandOutput { stdout })
    }.await;
    match &result {
        Ok(_) => operation.finish("passed", json!({})),
        Err(e) => operation.finish("failed", json!({"errorCode":e.code,"reason":e.message})),
    }
    result
}

pub(super) fn git_output_too_large_error() -> BridgeError {
    BridgeError::new(
        "GIT_OUTPUT_TOO_LARGE",
        "This Git history result is too large to display safely.",
    )
}

impl NativeBridge {
    pub(super) async fn git_history(
        &self,
        params: Value,
        epoch: u64,
    ) -> Result<Value, BridgeError> {
        let params: GitHistoryParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "git_history",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        let skip = params.skip.unwrap_or(0);
        let limit = params.limit.unwrap_or(DEFAULT_GIT_HISTORY_LIMIT);
        if skip > MAX_GIT_HISTORY_SKIP || limit == 0 || limit > MAX_GIT_HISTORY_LIMIT {
            return Err(BridgeError::invalid_request());
        }
        let context = self.git_context(epoch)?;
        let root = context.workspace.root_path().to_path_buf();

        let branch_output = run_git_readonly(
            root.clone(),
            vec!["rev-parse".into(), "--abbrev-ref".into(), "HEAD".into()],
            4096,
        )
        .await?;
        if branch_output.stdout.truncated {
            return Err(git_output_too_large_error());
        }
        let mut branch = String::from_utf8_lossy(&branch_output.stdout.bytes)
            .trim()
            .to_owned();
        let detached = branch == "HEAD";
        if detached {
            let head_output = run_git_readonly(
                root.clone(),
                vec!["rev-parse".into(), "--short".into(), "HEAD".into()],
                4096,
            )
            .await?;
            if head_output.stdout.truncated {
                return Err(git_output_too_large_error());
            }
            branch = format!(
                "Detached at {}",
                String::from_utf8_lossy(&head_output.stdout.bytes).trim()
            );
        }

        let output = run_git_readonly(
            root,
            vec![
                "log".into(),
                "-z".into(),
                "--date=iso-strict".into(),
                "--format=%H%x00%h%x00%an%x00%aI%x00%s".into(),
                format!("--max-count={}", limit + 1),
                format!("--skip={skip}"),
            ],
            MAX_GIT_HISTORY_BYTES,
        )
        .await?;
        if output.stdout.truncated {
            return Err(git_output_too_large_error());
        }
        let mut commits = parse_git_history(&output.stdout.bytes)?;
        let has_more = commits.len() > limit;
        commits.truncate(limit);
        self.ensure_active_context(&context, epoch)?;
        serde_json::to_value(GitHistoryResult {
            branch,
            detached,
            commits,
            has_more,
        })
        .map_err(|error| {
            operation_error(
                internal_error(),
                "git_history",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn git_commit(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: GitCommitParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "git_commit",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if !valid_git_hash(&params.hash) {
            return Err(BridgeError::invalid_request());
        }
        let context = self.git_context(epoch)?;
        let root = context.workspace.root_path().to_path_buf();
        let metadata = run_git_readonly(
            root.clone(),
            vec![
                "show".into(),
                "-s".into(),
                "--date=iso-strict".into(),
                "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%B".into(),
                params.hash.clone(),
            ],
            MAX_GIT_COMMIT_BYTES,
        )
        .await?;
        if metadata.stdout.truncated {
            return Err(git_output_too_large_error());
        }
        let (hash, short_hash, author, author_email, authored_at, message) =
            parse_git_commit_metadata(&metadata.stdout.bytes)?;
        let files_output = run_git_readonly(
            root,
            vec![
                "diff-tree".into(),
                "--no-commit-id".into(),
                "--name-status".into(),
                "-r".into(),
                "-m".into(),
                "--first-parent".into(),
                "-M".into(),
                "--root".into(),
                "-z".into(),
                params.hash,
            ],
            MAX_GIT_COMMIT_BYTES,
        )
        .await?;
        if files_output.stdout.truncated {
            return Err(git_output_too_large_error());
        }
        let mut files = parse_git_changed_files(&files_output.stdout.bytes)?;
        let files_truncated = files.len() > MAX_GIT_CHANGED_FILES;
        files.truncate(MAX_GIT_CHANGED_FILES);
        self.ensure_active_context(&context, epoch)?;
        serde_json::to_value(GitCommitResult {
            hash,
            short_hash,
            author,
            author_email,
            authored_at,
            message,
            files,
            files_truncated,
        })
        .map_err(|error| {
            operation_error(
                internal_error(),
                "git_commit",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) async fn git_diff(&self, params: Value, epoch: u64) -> Result<Value, BridgeError> {
        let params: GitDiffParams = serde_json::from_value(params).map_err(|error| {
            operation_error(
                BridgeError::invalid_request(),
                "git_diff",
                format!(
                    "category={:?}; line={}; column={}; rejected payload omitted",
                    error.classify(),
                    error.line(),
                    error.column()
                ),
            )
        })?;
        if !valid_git_hash(&params.hash) || !valid_git_relative_path(&params.path) {
            return Err(BridgeError::invalid_request());
        }
        let context = self.git_context(epoch)?;
        let root = context.workspace.root_path().to_path_buf();
        let output = run_git_readonly(
            root,
            vec![
                "show".into(),
                "--format=".into(),
                "--no-ext-diff".into(),
                "--no-textconv".into(),
                "--unified=3".into(),
                "--find-renames".into(),
                params.hash,
                "--".into(),
                params.path.clone(),
            ],
            MAX_GIT_DIFF_BYTES,
        )
        .await?;
        self.ensure_active_context(&context, epoch)?;
        serde_json::to_value(GitDiffResult {
            path: params.path,
            content: String::from_utf8_lossy(&output.stdout.bytes).into_owned(),
            truncated: output.stdout.truncated,
        })
        .map_err(|error| {
            operation_error(
                internal_error(),
                "git_diff",
                format!(
                    "exceptionType={}; cause={error}",
                    std::any::type_name_of_val(&error)
                ),
            )
        })
    }
}

impl NativeBridge {
    pub(super) fn git_context(&self, epoch: u64) -> Result<ActiveContext, BridgeError> {
        let state = lock_unpoisoned(&self.inner.state);
        self.ensure_epoch(epoch)?;
        let context = state.current.clone().ok_or_else(no_context_error)?;
        if context.lifecycle_epoch != epoch {
            return Err(no_context_error());
        }
        Ok(context)
    }
}
