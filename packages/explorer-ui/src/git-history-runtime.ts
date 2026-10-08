// Downloaded modules must not consume the host's bootstrap or instantiate a bridge.
class GitResponseError extends Error {
  readonly code: string;
  readonly detail: { code: string; message: string };
  constructor(detail: { code: string; message: string }) {
    super(detail.message);
    this.name = 'GitResponseError';
    this.code = detail.code;
    this.detail = detail;
  }
}
interface GitCommitSummary {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly authoredAt: string;
  readonly subject: string;
}

interface GitHistoryResult {
  readonly branch: string;
  readonly detached: boolean;
  readonly commits: readonly GitCommitSummary[];
  readonly hasMore: boolean;
}

interface GitChangedFile {
  readonly status: string;
  readonly path: string;
  readonly oldPath?: string;
}

interface GitCommitResult {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly authoredAt: string;
  readonly message: string;
  readonly files: readonly GitChangedFile[];
  readonly filesTruncated: boolean;
}

interface GitDiffResult {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
}

export interface HistoryHost{list:HTMLElement;commits:GitCommitSummary[];state:HTMLElement;loadMore:HTMLButtonElement;hasMore:boolean;}
function asRecord(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'?value as Record<string,unknown>:null;}
function errorCode(error:unknown):string{const e=error as {code?:string;detail?:{code?:string}};return e?.code??e?.detail?.code??'';}
export function normalizeGitCommitSummary(raw: unknown): GitCommitSummary {
  const object = asRecord(raw);
  if (
    !object
    || typeof object.hash !== "string"
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(object.hash)
    || typeof object.shortHash !== "string"
    || typeof object.author !== "string"
    || typeof object.authoredAt !== "string"
    || typeof object.subject !== "string"
  ) throw new GitResponseError({ code: "INVALID_REQUEST", message: "The Git history response was not valid." });
  return {
    hash: object.hash,
    shortHash: object.shortHash,
    author: object.author,
    authoredAt: object.authoredAt,
    subject: object.subject,
  };
}

export function normalizeGitHistory(raw: unknown): GitHistoryResult {
  const object = asRecord(raw);
  if (
    !object
    || typeof object.branch !== "string"
    || typeof object.detached !== "boolean"
    || !Array.isArray(object.commits)
    || typeof object.hasMore !== "boolean"
  ) throw new GitResponseError({ code: "INVALID_REQUEST", message: "The Git history response was not valid." });
  return {
    branch: object.branch,
    detached: object.detached,
    commits: object.commits.map(normalizeGitCommitSummary),
    hasMore: object.hasMore,
  };
}

export function normalizeGitCommit(raw: unknown): GitCommitResult {
  const object = asRecord(raw);
  if (
    !object
    || typeof object.hash !== "string"
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(object.hash)
    || typeof object.shortHash !== "string"
    || typeof object.author !== "string"
    || typeof object.authorEmail !== "string"
    || typeof object.authoredAt !== "string"
    || typeof object.message !== "string"
    || !Array.isArray(object.files)
    || typeof object.filesTruncated !== "boolean"
  ) throw new GitResponseError({ code: "INVALID_REQUEST", message: "The Git commit response was not valid." });
  const files = object.files.map((rawFile): GitChangedFile => {
    const file = asRecord(rawFile);
    if (
      !file
      || typeof file.status !== "string"
      || typeof file.path !== "string"
      || (file.oldPath !== undefined && typeof file.oldPath !== "string")
    ) throw new GitResponseError({ code: "INVALID_REQUEST", message: "The Git commit response was not valid." });
    return {
      status: file.status,
      path: file.path,
      ...(typeof file.oldPath === "string" ? { oldPath: file.oldPath } : {}),
    };
  });
  return {
    hash: object.hash,
    shortHash: object.shortHash,
    author: object.author,
    authorEmail: object.authorEmail,
    authoredAt: object.authoredAt,
    message: object.message,
    files,
    filesTruncated: object.filesTruncated,
  };
}

export function normalizeGitDiff(raw: unknown): GitDiffResult {
  const object = asRecord(raw);
  if (!object || typeof object.path !== "string" || typeof object.content !== "string" || typeof object.truncated !== "boolean") {
    throw new GitResponseError({ code: "INVALID_REQUEST", message: "The Git diff response was not valid." });
  }
  return { path: object.path, content: object.content, truncated: object.truncated };
}

export function formatGitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function gitHistoryError(error: unknown): string {
  switch (errorCode(error)) {
    case "NO_CONTEXT": return "Choose a local project to view its Git history.";
    case "NOT_GIT_REPOSITORY": return "The selected project is not a Git repository.";
    case "GIT_UNAVAILABLE": return "Git is not installed or is unavailable to Code-Codex.";
    case "GIT_TIMEOUT": return "Git history took too long to load.";
    case "GIT_OUTPUT_TOO_LARGE": return "This Git result is too large to display safely.";
    case "CANCELLED": return "The active project changed. Reopen Git History to continue.";
    default: return "Git history could not be loaded.";
  }
}

export function renderGitHistoryList(host:HistoryHost):void{
    host.list.replaceChildren();
    for (const commit of host.commits) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "git-history-commit";
      button.dataset.gitHash = commit.hash;
      button.setAttribute("role", "listitem");

      const rail = document.createElement("span");
      rail.className = "git-history-rail";
      rail.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "git-history-commit-copy";
      const subject = document.createElement("strong");
      subject.textContent = commit.subject || "Untitled commit";
      const meta = document.createElement("span");
      meta.className = "git-history-commit-meta";
      const hash = document.createElement("code");
      hash.textContent = commit.shortHash;
      const author = document.createElement("span");
      author.textContent = commit.author;
      const time = document.createElement("time");
      time.dateTime = commit.authoredAt;
      time.textContent = formatGitDate(commit.authoredAt);
      meta.append(hash, author, time);
      copy.append(subject, meta);
      button.append(rail, copy);
      host.list.append(button);
    }
    host.state.hidden = host.commits.length > 0;
    if (!host.commits.length) host.state.textContent = "No commits found in this repository.";
    host.loadMore.hidden = !host.hasMore;
  }

export function renderGitCommit(host:{detail:HTMLElement},commit:GitCommitResult):void{
    host.detail.replaceChildren();
    const heading = document.createElement("h4");
    heading.textContent = commit.message.split(/\r?\n/, 1)[0] || "Untitled commit";
    const metadata = document.createElement("div");
    metadata.className = "git-history-detail-meta";
    const hash = document.createElement("code");
    hash.textContent = commit.shortHash;
    const author = document.createElement("span");
    author.textContent = `${commit.author} · ${formatGitDate(commit.authoredAt)}`;
    metadata.append(hash, author);
    const fileHeading = document.createElement("h5");
    fileHeading.textContent = `${commit.files.length} changed ${commit.files.length === 1 ? "file" : "files"}`;
    host.detail.append(heading, metadata, fileHeading);
    for (const file of commit.files) {
      const row = document.createElement("div");
      row.className = "git-history-file";
      const actions = document.createElement("div");
      actions.className = "git-history-file-actions";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "git-history-file-open";
      openButton.dataset.gitOpenFile = file.path;
      openButton.dataset.gitHash = commit.hash;
      openButton.setAttribute("aria-label", `Open changes for ${file.path} in the main view`);
      const status = document.createElement("span");
      status.className = `git-history-file-status status-${file.status[0]?.toLowerCase() || "m"}`;
      status.textContent = file.status[0] || "M";
      const path = document.createElement("span");
      path.className = "git-history-file-path";
      path.textContent = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
      openButton.append(status, path);
      actions.append(openButton);
      row.append(actions);
      host.detail.append(row);
    }
    if (commit.filesTruncated) {
      const note = document.createElement("p");
      note.className = "git-history-note";
      note.textContent = "Only the first 500 changed files are shown.";
      host.detail.append(note);
    }
  }
