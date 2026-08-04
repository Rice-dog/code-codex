const common = `viewBox="0 0 16 16" aria-hidden="true" focusable="false"`;

export const icons = {
  search: `<svg ${common}><circle cx="6.75" cy="6.75" r="4.75"/><path d="m10.25 10.25 3.5 3.5"/></svg>`,
  chevron: `<svg ${common}><path d="m6.25 3.75 4 4.25-4 4.25"/></svg>`,
  folder: `<svg ${common}><path d="M1.75 4.25h4l1.2 1.5h7.3v6.5h-12.5z"/><path d="M1.75 4.25v-1.5h4.1l1.1 1.5"/></svg>`,
  file: `<svg ${common}><path d="M3.25 1.75h6l3.5 3.5v9h-9.5z"/><path d="M9.25 1.75v3.5h3.5"/></svg>`,
  link: `<svg ${common}><path d="M6.3 9.7 9.7 6.3M5.5 11.9l-1 .95a2.36 2.36 0 0 1-3.35-3.33l2.7-2.7a2.36 2.36 0 0 1 3.33 0M10.5 4.1l1-.95a2.36 2.36 0 0 1 3.35 3.33l-2.7 2.7a2.36 2.36 0 0 1-3.33 0"/></svg>`,
  lock: `<svg ${common}><rect x="3" y="7" width="10" height="7"/><path d="M5.25 7V4.75a2.75 2.75 0 0 1 5.5 0V7"/></svg>`,
  collapse: `<svg ${common}><path d="M10.75 2.75 5.5 8l5.25 5.25"/></svg>`,
  refresh: `<svg ${common}><path d="M13.5 7A5.5 5.5 0 1 0 12 11.8"/><path d="M13.5 3.5V7H10"/></svg>`,
  close: `<svg ${common}><path d="m3.25 3.25 9.5 9.5M12.75 3.25l-9.5 9.5"/></svg>`,
  warning: `<svg ${common}><path d="m8 1.6 6.65 12.15H1.35z"/><path d="M8 5.25v4.25M8 11.75v.1"/></svg>`,
  preview: `<svg ${common}><path d="M1.5 8s2.35-4 6.5-4 6.5 4 6.5 4-2.35 4-6.5 4-6.5-4-6.5-4z"/><circle cx="8" cy="8" r="1.75"/></svg>`,
  newFile: `<svg ${common}><path d="M3.25 1.75h6l3.5 3.5v9h-9.5z"/><path d="M9.25 1.75v3.5h3.5M8 7.5v4M6 9.5h4"/></svg>`,
  newFolder: `<svg ${common}><path d="M1.75 4.25h4l1.2 1.5h7.3v6.5h-12.5z"/><path d="M8 7.25v3.5M6.25 9h3.5"/></svg>`,
  rename: `<svg ${common}><path d="m3 11.5-.5 2 2-.5 7.75-7.75-1.5-1.5z"/><path d="m9.75 4.75 1.5 1.5M2.5 14h11"/></svg>`,
  trash: `<svg ${common}><path d="M3.25 4.5h9.5M6 4.5V2.75h4V4.5M4.5 4.5l.6 9h5.8l.6-9M6.75 7v4M9.25 7v4"/></svg>`,
  copy: `<svg ${common}><rect x="5.25" y="5.25" width="8" height="8" rx="1"/><path d="M10.75 5.25v-2.5h-8v8h2.5"/></svg>`,
  reveal: `<svg ${common}><path d="M2 4.25h4l1.2 1.5H14v6.5H2z"/><path d="m8.5 7.25 2 2-2 2M5.5 9.25h5"/></svg>`,
};

export const FILE_ICON_KINDS = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "c",
  "cpp",
  "csharp",
  "html",
  "css",
  "sass",
  "markdown",
  "text",
  "json",
  "yaml",
  "toml",
  "xml",
  "diagram",
  "config",
  "env",
  "image",
  "audio",
  "video",
  "archive",
  "pdf",
  "document",
  "spreadsheet",
  "database",
  "shell",
  "powershell",
  "git",
  "lockfile",
  "generic",
] as const;

export type FileIconKind = (typeof FILE_ICON_KINDS)[number];

export type FileIconCategory =
  | "code"
  | "web"
  | "content"
  | "data"
  | "config"
  | "media"
  | "archive"
  | "document"
  | "database"
  | "terminal"
  | "version-control"
  | "lockfile"
  | "generic";

export interface FileIconDescriptor {
  readonly kind: FileIconKind;
  readonly category: FileIconCategory;
  readonly markup: string;
}

const languageTile = (mark: string): string =>
  `<svg ${common}><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2"/>${mark}</svg>`;

const page = (mark: string): string =>
  `<svg ${common}><path d="M3.25 1.75h6l3.5 3.5v9h-9.5z"/><path d="M9.25 1.75v3.5h3.5"/>${mark}</svg>`;

const descriptor = (kind: FileIconKind, category: FileIconCategory, markup: string): FileIconDescriptor =>
  Object.freeze({ kind, category, markup });

const fileIcons: Readonly<Record<FileIconKind, FileIconDescriptor>> = Object.freeze({
  typescript: descriptor(
    "typescript",
    "code",
    languageTile(`<path d="M4 6h4M6 6v5M9 7.25c.45-.55 2.6-.65 2.6.45 0 1.15-2.7.55-2.7 1.85 0 1.15 2.2 1 2.85.25"/>`),
  ),
  javascript: descriptor(
    "javascript",
    "code",
    languageTile(`<path d="M6.75 6v4c0 1.25-1.8 1.25-2.35.45M9 7.25c.45-.55 2.6-.65 2.6.45 0 1.15-2.7.55-2.7 1.85 0 1.15 2.2 1 2.85.25"/>`),
  ),
  python: descriptor(
    "python",
    "code",
    `<svg ${common}><path d="M8 1.75H5.25a2 2 0 0 0-2 2v3h5.5v1.5H5.5v-1"/><path d="M8 14.25h2.75a2 2 0 0 0 2-2v-3h-5.5v-1.5h3.25v1"/><path d="M6 3.75h.1M10 12.25h.1"/></svg>`,
  ),
  rust: descriptor(
    "rust",
    "code",
    `<svg ${common}><circle cx="8" cy="8" r="5.25"/><path d="M8 1v1.75M8 13.25V15M1 8h1.75M13.25 8H15M3.05 3.05l1.2 1.2M11.75 11.75l1.2 1.2M12.95 3.05l-1.2 1.2M4.25 11.75l-1.2 1.2M5.75 11V5h2.5a2 2 0 0 1 0 4h-2.5M8.25 9l2 2"/></svg>`,
  ),
  go: descriptor(
    "go",
    "code",
    `<svg ${common}><path d="M1.5 5h4M.75 8h4.5M1.5 11h4"/><path d="M13.5 5.4A4.75 4.75 0 1 0 13.5 10V8H9.75"/></svg>`,
  ),
  java: descriptor(
    "java",
    "code",
    `<svg ${common}><path d="M6.25 1.5c3 1.75-2.25 2.5 1 4.25M9 1.25c3.25 2-2 2.9.5 4.5M3.25 7.25h8.5v2.5a3 3 0 0 1-3 3h-2.5a3 3 0 0 1-3-3zM11.75 8h.75a1.5 1.5 0 0 1 0 3h-1.6M2 14.25h11.5"/></svg>`,
  ),
  kotlin: descriptor(
    "kotlin",
    "code",
    `<svg ${common}><path d="M2.25 2.25h11.5L8 8l5.75 5.75H2.25zM2.25 13.75 8 8 2.25 2.25"/></svg>`,
  ),
  c: descriptor(
    "c",
    "code",
    `<svg ${common}><path d="m8 1.5 5.6 3.25v6.5L8 14.5l-5.6-3.25v-6.5z"/><path d="M10.75 5.7A3 3 0 1 0 10.75 10.3"/></svg>`,
  ),
  cpp: descriptor(
    "cpp",
    "code",
    `<svg ${common}><path d="m7.25 1.5 5.6 3.25v6.5l-5.6 3.25-5.6-3.25v-6.5z"/><path d="M7.75 5.7A3 3 0 1 0 7.75 10.3M9 7h2.75M10.38 5.63v2.75M12.25 9.5H15M13.63 8.13v2.75"/></svg>`,
  ),
  csharp: descriptor(
    "csharp",
    "code",
    `<svg ${common}><path d="m7.25 1.5 5.6 3.25v6.5l-5.6 3.25-5.6-3.25v-6.5z"/><path d="M7.75 5.7A3 3 0 1 0 7.75 10.3M9.25 6.75h5M9 9.25h5M11 5.5l-.5 5M13.25 5.5l-.5 5"/></svg>`,
  ),
  html: descriptor(
    "html",
    "web",
    `<svg ${common}><path d="M2.25 1.75h11.5l-1 11L8 14.25l-4.75-1.5z"/><path d="m5.75 6.25-1.5 1.5 1.5 1.5M10.25 6.25l1.5 1.5-1.5 1.5M8.75 5.5l-1.5 4.5"/></svg>`,
  ),
  css: descriptor(
    "css",
    "web",
    `<svg ${common}><path d="M2.25 1.75h11.5l-1 11L8 14.25l-4.75-1.5zM5.25 5.5h5.5l-.35 2.25H6l.2 2.25 1.8.5 1.8-.5.15-1"/></svg>`,
  ),
  sass: descriptor(
    "sass",
    "web",
    `<svg ${common}><path d="M13.5 4.25c-.5-2.4-6-1-8.75.5-2.6 1.4-3.45 3.25.25 4.1 3 .7 5.75-.05 6.75-1.1M4.25 8.75c2.5 1.25 3 3.25 1 5M8.25 10.25c2-1.25 4.4-.5 3.25 1.2-.75 1.1-2.1.45-2.75-.2"/></svg>`,
  ),
  markdown: descriptor(
    "markdown",
    "content",
    `<svg ${common}><path d="M1.5 3.25h13v9.5h-13zM3.5 10V6l2 2 2-2v4M10.75 5.75v4.5M9.25 8.75l1.5 1.5 1.5-1.5"/></svg>`,
  ),
  text: descriptor("text", "content", page(`<path d="M5 7.25h6M5 9.5h6M5 11.75h4"/>`)),
  json: descriptor("json", "data", page(`<path d="M7 6.75c-1 0-1.25.5-1.25 1.25v.75c0 .75-.25 1.25-1.25 1.25 1 0 1.25.5 1.25 1.25V12M9 6.75c1 0 1.25.5 1.25 1.25v.75c0 .75.25 1.25 1.25 1.25-1 0-1.25.5-1.25 1.25V12"/>`)),
  yaml: descriptor("yaml", "data", page(`<path d="M5 7l2 2v3M9 7 7 9M9.5 7h2M10.5 7v5"/>`)),
  toml: descriptor("toml", "data", page(`<path d="M6 7H5v5h1M10 7h1v5h-1M7.5 7v5"/>`)),
  xml: descriptor("xml", "data", page(`<path d="m7 7-2 2.25 2 2.25M9 7l2 2.25-2 2.25"/>`)),
  diagram: descriptor(
    "diagram",
    "content",
    page(`<rect x="4.75" y="6.25" width="3" height="2.5" rx=".5"/><rect x="9.25" y="10" width="3" height="2.5" rx=".5"/><path d="M7.75 7.5h2.15a.85.85 0 0 1 .85.85V10"/>`),
  ),
  config: descriptor("config", "config", page(`<path d="M5 7.25h6M5 9.5h6M5 11.75h6M7 6.5V8M9.5 8.75v1.5M8 11v1.5"/>`)),
  env: descriptor("env", "config", page(`<circle cx="6" cy="9" r="1.4"/><path d="M7.4 9h4M10 9v1.25M11.25 9v1"/>`)),
  image: descriptor("image", "media", page(`<circle cx="6.25" cy="7" r="1"/><path d="m4.75 12 2.5-2.5 1.5 1.5 1.25-1.25 2 2.25"/>`)),
  audio: descriptor("audio", "media", page(`<path d="M7 11.25a1.5 1.5 0 1 1-1.5-1.5H7zM11.5 9.75A1.5 1.5 0 1 1 10 8.25h1.5zM7 9.75V5.5l4.5-1v3.75"/>`)),
  video: descriptor("video", "media", page(`<path d="M5 7h5.75v4H5zM10.75 8.25 12.5 7.5v3l-1.75-.75z"/>`)),
  archive: descriptor("archive", "archive", page(`<path d="M6.75 3h2.5M6.75 5h2.5M6.75 7h2.5M7.25 9h1.5v3h-1.5z"/>`)),
  pdf: descriptor("pdf", "document", page(`<path d="M5 12V7h1.5a1.5 1.5 0 0 1 0 3H5M8.75 12V7H10c1.25 0 2 .75 2 2.5s-.75 2.5-2 2.5z"/>`)),
  document: descriptor("document", "document", page(`<path d="M5 7.25h6M5 9.5h6M5 11.75h5"/>`)),
  spreadsheet: descriptor("spreadsheet", "document", page(`<path d="M5 7h6v5H5zM5 9.5h6M8 7v5"/>`)),
  database: descriptor("database", "database", `<svg ${common}><ellipse cx="8" cy="3.75" rx="5.25" ry="2.25"/><path d="M2.75 3.75v4.1c0 1.25 2.35 2.25 5.25 2.25s5.25-1 5.25-2.25v-4.1M2.75 7.85v4c0 1.25 2.35 2.25 5.25 2.25s5.25-1 5.25-2.25v-4"/></svg>`),
  shell: descriptor("shell", "terminal", `<svg ${common}><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2"/><path d="m4.25 6 2 2-2 2M8 10h3.25"/></svg>`),
  powershell: descriptor("powershell", "terminal", `<svg ${common}><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2"/><path d="m4 5.5 3 2.5-3 2.5M8.25 10.5h3.25"/></svg>`),
  git: descriptor("git", "version-control", `<svg ${common}><path d="m8 1.75 6.25 6.25L8 14.25 1.75 8z"/><circle cx="6" cy="5.75" r=".8"/><circle cx="10.25" cy="10" r=".8"/><circle cx="6" cy="10.25" r=".8"/><path d="M6 6.55v2.9M6.8 6.3l2.9 3.15"/></svg>`),
  lockfile: descriptor("lockfile", "lockfile", page(`<rect x="5.25" y="8.75" width="5.5" height="3.5" rx=".5"/><path d="M6.5 8.75v-1a1.5 1.5 0 0 1 3 0v1"/>`)),
  generic: descriptor("generic", "generic", icons.file),
});

const extensions: Readonly<Record<string, FileIconKind>> = Object.freeze({
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyw: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  vcxproj: "cpp",
  cs: "csharp",
  csproj: "csharp",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  css: "css",
  scss: "sass",
  sass: "sass",
  less: "sass",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  rst: "markdown",
  adoc: "markdown",
  txt: "text",
  log: "text",
  json: "json",
  ipynb: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  xsd: "xml",
  wxs: "xml",
  wixproj: "xml",
  plist: "xml",
  drawio: "diagram",
  plantuml: "diagram",
  config: "config",
  conf: "config",
  ini: "config",
  cfg: "config",
  properties: "config",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  ico: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  avif: "image",
  heic: "image",
  mp3: "audio",
  wav: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  opus: "audio",
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  avi: "video",
  mkv: "video",
  zip: "archive",
  tar: "archive",
  gz: "archive",
  bz2: "archive",
  xz: "archive",
  tgz: "archive",
  tbz2: "archive",
  txz: "archive",
  "7z": "archive",
  rar: "archive",
  jar: "archive",
  war: "archive",
  pdf: "pdf",
  doc: "document",
  docx: "document",
  ppt: "document",
  pptx: "document",
  odt: "document",
  rtf: "document",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ods: "spreadsheet",
  csv: "spreadsheet",
  tsv: "spreadsheet",
  sql: "database",
  sqlite: "database",
  sqlite3: "database",
  db: "database",
  duckdb: "database",
  mdb: "database",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  bat: "shell",
  cmd: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
});

const lockfileNames = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",
]);

const configNames = new Set([
  ".babelrc",
  ".browserslistrc",
  ".dockerignore",
  ".editorconfig",
  ".eslintignore",
  ".eslintrc",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
  "cmakelists.txt",
  "dockerfile",
  "makefile",
]);

const textNames = new Set(["license", "notice", "readme"]);

function basename(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/");
  return (normalized.slice(normalized.lastIndexOf("/") + 1) || normalized).toLowerCase();
}

/**
 * Maps a file name (or relative path) to a stable semantic icon descriptor.
 * Matching is case-insensitive and exact-name rules take precedence over the
 * final extension so compound lockfiles and configuration dotfiles are not
 * mistaken for their storage format.
 */
export function getFileIcon(value: string): FileIconDescriptor {
  const name = basename(value);
  if (!name) return fileIcons.generic;
  if (lockfileNames.has(name) || name.endsWith(".lock")) return fileIcons.lockfile;
  if (name === ".gitignore" || name === ".gitattributes" || name === ".gitmodules") return fileIcons.git;
  if (name === ".env" || name.startsWith(".env.")) return fileIcons.env;
  if (configNames.has(name) || /^(?:ts|js)config(?:\.[^.]+)*\.json$/.test(name)) return fileIcons.config;
  if (textNames.has(name)) return fileIcons.text;
  if (/^(?:license|notice|readme|changelog|contributing)(?:\.[^.]+)?$/.test(name)) {
    return name.endsWith(".md") || name.endsWith(".mdx") ? fileIcons.markdown : fileIcons.text;
  }
  if (name.endsWith(".tar.gz") || name.endsWith(".tar.bz2") || name.endsWith(".tar.xz")) return fileIcons.archive;

  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return fileIcons.generic;
  const extension = name.slice(dot + 1);
  const kind = extensions[extension] ?? "generic";
  return fileIcons[kind];
}
