import DOMPurify from "dompurify";
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import {
  ReactPptxViewer,
  type ParsedPresentation,
  type PresentationDocument,
  type PresentationWarning,
  type PptxViewerController,
  type SlideNode,
} from "@extend-ai/react-pptx";
import { renderAsync as renderDocxAsync } from "docx-preview";
import JSZip from "jszip";
import MarkdownIt from "markdown-it";
// pdfjs-dist publishes modern runtime modules without a matching subpath declaration.
// @ts-expect-error The public declarations are imported separately below.
import { AnnotationMode, VerbosityLevel, getDocument } from "pdfjs-dist/build/pdf.mjs";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist/types/src/pdf.d.ts";
// PDF.js uses this main-thread handler as a CSP-safe fake worker inside Codex's single injected bundle.
import "pdfjs-dist/build/pdf.worker.mjs";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import TurndownService from "turndown";
// @ts-expect-error turndown-plugin-gfm does not publish TypeScript declarations.
import { gfm as turndownGfm } from "turndown-plugin-gfm";
import { getFileIcon, icons } from "./icons";
import { MAIN_SURFACE_SELECTOR } from "./adapters/codex-26.715";
import { MAX_SYNTAX_SOURCE_UNITS, highlightSyntaxForPath, type SyntaxHighlight } from "./syntax-highlight";

declare const __CODE_CODEX_PPT_WORKER_SOURCE__: string;
declare const __CODE_CODEX_PPT_WASM_BASE64__: string;
declare const __CODE_CODEX_PPT_VIEWER_STYLES__: string;

export const MAIN_PREVIEW_TAG = "code-codex-main-preview";
export const MAIN_PREVIEW_ACTIVATE_EVENT = "cle-main-preview-activate";
export const MAIN_PREVIEW_CLOSE_EVENT = "cle-main-preview-close";
export const MAIN_PREVIEW_DRAFT_EVENT = "cle-main-preview-draft";
export const MAIN_PREVIEW_SAVE_EVENT = "cle-main-preview-save";
export const MAIN_PREVIEW_RELOAD_EVENT = "cle-main-preview-reload";
export const MARKDOWN_PREVIEWER_ID = "code-codex.markdown-preview";
export const IMAGE_PREVIEWER_ID = "code-codex.image-preview";
export const VIDEO_PREVIEWER_ID = "code-codex.video-preview";
export const PDF_PREVIEWER_ID = "code-codex.pdf-preview";
export const AUDIO_PREVIEWER_ID = "code-codex.audio-preview";
export const OFFICE_PREVIEWER_ID = "code-codex.office-preview";
export const NATIVE_POWERPOINT_PREVIEW_MIME = "application/vnd.code-codex.powerpoint-slides+zip";

const MAX_PDF_CANVAS_PIXELS = 16_777_216;
const MAX_PDF_CANVAS_DIMENSION = 16_384;
const MAX_PDF_CSS_SCALE = 2;
const MAX_PDF_OUTPUT_SCALE = 2;
const MAX_OFFICE_DOM_NODES = 50_000;
const MAX_OFFICE_TEXT_UNITS = 4_000_000;
const MAX_EXCEL_SHEETS = 32;
const MAX_EXCEL_ROWS = 1_000;
const MAX_EXCEL_COLUMNS = 128;
const MAX_EXCEL_CELLS = 25_000;
const MAX_EXCEL_CELL_TEXT_UNITS = 20_000;
const MAX_EXCEL_TOTAL_TEXT_UNITS = 2_000_000;
const MAX_XLSX_ZIP_ENTRIES = 4_096;
const MAX_XLSX_WORKBOOK_XML_BYTES = 2 * 1024 * 1024;
const MAX_XLSX_RELATIONSHIP_XML_BYTES = 2 * 1024 * 1024;
const MAX_XLSX_SHARED_STRINGS_XML_BYTES = 8 * 1024 * 1024;
const MAX_XLSX_WORKSHEET_XML_BYTES = 8 * 1024 * 1024;
const MAX_XLSX_STYLES_XML_BYTES = 8 * 1024 * 1024;
const MAX_XLSX_SHARED_STRINGS = 100_000;
const MAX_XLSX_STYLE_RECORDS = 4_096;
const MAX_XLSX_MERGED_RANGES = 512;
const MAX_PPTX_RELATIONSHIP_FILES = 512;
const MAX_PPTX_RELATIONSHIP_FILE_BYTES = 512 * 1024;
const MAX_PPTX_RELATIONSHIP_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_PPT_SLIDES = 256;
const MAX_PPT_NODES = 25_000;
const MAX_PPT_NODE_DEPTH = 16;
const MAX_PPT_TEXT_UNITS = 2_000_000;
const MAX_PPT_ASSETS = 512;
const MAX_PPT_ASSET_BYTES = 24 * 1024 * 1024;
const MAX_PPT_TOTAL_ASSET_BYTES = 96 * 1024 * 1024;
const MAX_PPT_TABLE_CELLS = 25_000;
const MAX_PPT_PARSE_MILLISECONDS = 20_000;
const MAX_PPT_RENDER_MILLISECONDS = 15_000;
const MAX_DOCX_DOCUMENT_XML_BYTES = 8 * 1024 * 1024;
const MAX_DOCX_STYLES_XML_BYTES = 2 * 1024 * 1024;
const MAX_DOCX_DIRECT_PAGE_BREAKS = 512;
const MAX_DOCX_PREPARED_BYTES = 32 * 1024 * 1024;
const MAX_DOCX_AUTO_PAGES = 256;
const MAX_DOCX_AUTO_TABLE_ROWS = 5_000;
const MAX_DOCX_KEEP_NEXT_PARAGRAPHS = 5_000;
const DOCX_AUTO_PAGINATION_SLICE_MILLISECONDS = 16;
const DOCX_PAGE_OVERFLOW_EPSILON = 1;
const DOCX_LAYOUT_SETTLE_MILLISECONDS = 550;
const DOCX_IMAGE_SETTLE_MILLISECONDS = 1_000;
const MAX_DOCX_SETTLE_IMAGES = 512;
const MAX_DOCX_VISUAL_OVERFLOW_ELEMENTS = 1_024;
const DOCX_TABLE_HEADER_MARKER_PREFIX = "__cle_docx_table_header_";
const DOCX_KEEP_NEXT_MARKER_PREFIX = "__cle_docx_keep_next_";

type OfficeDocumentKind = "docx" | "xlsx" | "ppt" | "pptx";

interface OfficeDomBudget {
  remainingNodes: number;
  remainingTextUnits: number;
}

interface DocxPaginationClock {
  sliceEndsAt: number;
}

type DocxBlockSplitResult =
  | { readonly kind: "split"; readonly remainder: HTMLElement | null; readonly oversized: boolean }
  | { readonly kind: "budget" }
  | null;

interface XlsxWorksheetMeta {
  readonly name: string;
  readonly path: string;
}

interface ParsedXlsxWorksheet {
  readonly cells: ReadonlyMap<number, ReadonlyMap<number, XlsxPreviewCell>>;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columnWidths: ReadonlyMap<number, number>;
  readonly mergedFollowers: ReadonlySet<number>;
  readonly truncated: boolean;
}

interface XlsxSharedStrings {
  readonly values: readonly string[];
  readonly truncated: boolean;
}

interface XlsxCellStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  fontFamily?: string;
  fontSizePoints?: number;
  color?: string;
  backgroundColor?: string;
  horizontal?: "left" | "center" | "right" | "justify";
  vertical?: "top" | "middle" | "bottom";
  wrapText?: boolean;
}

interface XlsxPreviewCell {
  readonly text: string;
  readonly style: XlsxCellStyle | null;
}

interface XlsxStyleTable {
  readonly cellStyles: readonly XlsxCellStyle[];
  readonly truncated: boolean;
}

interface XlsxRange {
  readonly startRow: number;
  readonly startColumn: number;
  readonly endRow: number;
  readonly endColumn: number;
}

const OFFICE_MIME_TYPES: Readonly<Record<string, OfficeDocumentKind>> = Object.freeze({
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  [NATIVE_POWERPOINT_PREVIEW_MIME]: "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
});
const DOCX_SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DOCX_WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const DOCX_ALLOWED_SVG_TAGS = new Set(["ellipse", "foreignobject", "g", "image", "line", "rect", "svg"]);
const DOCX_ALLOWED_SVG_ATTRIBUTES = new Set([
  "class",
  "cx",
  "cy",
  "fill",
  "height",
  "href",
  "rx",
  "ry",
  "stroke",
  "stroke-width",
  "style",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
]);

export type MainPreviewLineEnding = "lf" | "crlf" | "none" | "mixed";

export type MainPreviewUnavailableReason =
  | "binary"
  | "invalid-utf8"
  | "sensitive"
  | "previewer-disabled"
  | "unsupported-type"
  | "unknown";

export interface MainPreviewFileBase {
  readonly path: string;
  readonly name: string;
}

export interface MainPreviewLoadingView extends MainPreviewFileBase {
  readonly kind: "loading";
}

export interface MainPreviewTextView extends MainPreviewFileBase {
  readonly kind: "text";
  readonly text: string;
  readonly sizeBytes: number;
  readonly truncated: boolean;
  readonly editable?: boolean;
  readonly version?: string;
  readonly lineEnding?: MainPreviewLineEnding;
}

export interface MainPreviewEmptyView extends MainPreviewFileBase {
  readonly kind: "empty";
  readonly sizeBytes: number;
  readonly editable?: boolean;
  readonly version?: string;
  readonly lineEnding?: MainPreviewLineEnding;
}

export interface MainPreviewMediaView extends MainPreviewFileBase {
  readonly kind: "image" | "video" | "pdf" | "audio" | "office";
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly bytes: Uint8Array;
}

export interface MainPreviewUnsupportedView extends MainPreviewFileBase {
  readonly kind: "unsupported";
  readonly sizeBytes: number;
  readonly reason: MainPreviewUnavailableReason;
}

export interface MainPreviewErrorView extends MainPreviewFileBase {
  readonly kind: "error";
  readonly code: string;
  readonly message?: string;
}

export type MainPreviewFileView =
  | MainPreviewLoadingView
  | MainPreviewTextView
  | MainPreviewEmptyView
  | MainPreviewMediaView
  | MainPreviewUnsupportedView
  | MainPreviewErrorView;

export interface MainPreviewState {
  readonly activePath: string | null;
  readonly tabs: readonly MainPreviewFileView[];
  readonly enabledPreviewers?: readonly string[];
  readonly editor?: MainPreviewEditorState;
}

export interface MainPreviewEditorState {
  readonly path: string;
  readonly draft: string;
  readonly saving: boolean;
  readonly error?: string;
}

export type MainPreviewActivateDetail =
  | { readonly kind: "conversation" }
  | { readonly kind: "file"; readonly path: string };

export interface MainPreviewCloseDetail {
  readonly path: string;
}

export interface MainPreviewDraftDetail {
  readonly path: string;
  readonly text: string;
}

export interface MainPreviewPathDetail {
  readonly path: string;
}

export type MainPreviewActivateEvent = CustomEvent<MainPreviewActivateDetail>;
export type MainPreviewCloseEvent = CustomEvent<MainPreviewCloseDetail>;
export type MainPreviewDraftEvent = CustomEvent<MainPreviewDraftDetail>;
export type MainPreviewSaveEvent = CustomEvent<MainPreviewPathDetail>;
export type MainPreviewReloadEvent = CustomEvent<MainPreviewPathDetail>;

const CONVERSATION_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.25 3.25h11.5v7.5H7l-3.5 2.5v-2.5H2.25z"/></svg>`;

const MARKDOWN_ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

const MARKDOWN_FENCE_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  bash: "sh",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  cs: "cs",
  css: "css",
  diff: "diff",
  go: "go",
  html: "html",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  markdown: "md",
  md: "md",
  powershell: "ps1",
  ps1: "ps1",
  py: "py",
  python: "py",
  rust: "rs",
  rs: "rs",
  shell: "sh",
  sh: "sh",
  sql: "sql",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  yaml: "yaml",
  yml: "yml",
});

function escapeMarkdownHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function markdownFencePath(language: string): string {
  const requested = language.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  const extension = MARKDOWN_FENCE_EXTENSIONS[requested] ?? "txt";
  return `markdown-fence.${extension}`;
}

function renderMarkdownFence(source: string, language: string): string {
  const highlighted = highlightSyntaxForPath(markdownFencePath(language), source);
  let rendered = "";
  for (const run of highlighted.runs) {
    const text = escapeMarkdownHtml(source.slice(run.start, run.end));
    rendered += run.kind === "plain" ? text : `<span class="tok-${run.kind}">${text}</span>`;
  }
  return rendered;
}

function isMarkdownPreviewPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return normalized.endsWith(".md") || normalized.endsWith(".markdown");
}

function isSafeMarkdownLink(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function markdownDestination(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll(">", "\\>");
  return /[\s()]/.test(escaped) ? `<${escaped}>` : escaped.replaceAll(")", "\\)");
}

function markdownTitle(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeMarkdownTableCell(value: string): string {
  const flattened = value.replace(/[ \t]*(?:\r?\n)+[ \t]*/g, "<br>").trim();
  return flattened.replace(/(^|[^\\])\|/g, "$1\\|");
}

function splitMarkdownFrontMatter(source: string): { readonly body: string; readonly frontMatter?: string } {
  const match = source.match(/^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
  const body = match?.[1] ?? "";
  if (!match || !/^[A-Za-z_][\w.-]*\s*:/m.test(body)) return { body: source };
  return {
    body: source.slice(match[0].length),
    frontMatter: match[0].replace(/\n$/, ""),
  };
}

function normalizedRenderedMarkdown(value: string, preserveTrailingNewline: boolean): string {
  const normalized = value.replaceAll("\u00a0", " ").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  return normalized ? `${normalized}${preserveTrailingNewline ? "\n" : ""}` : "";
}

const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: renderMarkdownFence,
});

const markdownEditorRenderer = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
  breaks: false,
  highlight: (source) => escapeMarkdownHtml(source),
});

function configureMarkdownRenderer(renderer: typeof markdownRenderer, editable: boolean): void {
  renderer.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const alt = String(token?.content ?? "").trim() || String(token?.attrGet("alt") ?? "").trim() || "Image";
    const source = String(token?.attrGet("src") ?? "");
    const title = String(token?.attrGet("title") ?? "");
    return `<span class="markdown-image-placeholder" data-markdown-image-alt="${escapeMarkdownHtml(alt)}" data-markdown-image-src="${escapeMarkdownHtml(source)}" data-markdown-image-title="${escapeMarkdownHtml(title)}">Image · ${escapeMarkdownHtml(alt)}</span>`;
  };

  renderer.renderer.rules.link_open = (tokens, index, options, _env, self) => {
    const token = tokens[index];
    if (token) {
      const href = String(token.attrGet("href") ?? "");
      const title = String(token.attrGet("title") ?? "");
      if (href) token.attrSet("data-markdown-href", href);
      if (title) token.attrSet("data-markdown-title", title);
      const hrefIndex = token.attrIndex("href");
      if (hrefIndex >= 0) token.attrs?.splice(hrefIndex, 1);
      const titleIndex = token.attrIndex("title");
      if (titleIndex >= 0) token.attrs?.splice(titleIndex, 1);
    }
    return self.renderToken(tokens, index, options);
  };

  for (const rule of ["th_open", "td_open"] as const) {
    renderer.renderer.rules[rule] = (tokens, index, options, _env, self) => {
      const token = tokens[index];
      const alignment = String(token?.attrGet("style") ?? "").match(/^text-align:\s*(left|center|right)\s*;?$/i)?.[1]?.toLowerCase();
      const styleIndex = token?.attrIndex("style") ?? -1;
      if (styleIndex >= 0) token?.attrs?.splice(styleIndex, 1);
      if (alignment) {
        token?.attrJoin("class", `markdown-align-${alignment}`);
        token?.attrSet("align", alignment);
      }
      return self.renderToken(tokens, index, options);
    };
  }

  if (editable) {
    const preservedComment = (content: string, block: boolean): string => {
      if (!/^\s*<!--[\s\S]*-->\s*$/.test(content)) return content;
      const encoded = escapeMarkdownHtml(encodeURIComponent(content.trimEnd()));
      return `<span class="markdown-comment-placeholder" data-markdown-comment="${encoded}" data-markdown-comment-block="${String(block)}">HTML comment</span>`;
    };
    renderer.renderer.rules.html_block = (tokens, index) => preservedComment(String(tokens[index]?.content ?? ""), true);
    renderer.renderer.rules.html_inline = (tokens, index) => preservedComment(String(tokens[index]?.content ?? ""), false);
  }
}

configureMarkdownRenderer(markdownRenderer, false);
configureMarkdownRenderer(markdownEditorRenderer, true);

const markdownSerializer = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});
markdownSerializer.use(turndownGfm as TurndownService.Plugin);
markdownSerializer.addRule("renderedMarkdownTableCell", {
  filter: ["th", "td"],
  replacement: (content, node) => {
    const siblings = node.parentNode?.childNodes;
    const index = siblings ? Array.prototype.indexOf.call(siblings, node) : 0;
    return `${index === 0 ? "| " : " "}${escapeMarkdownTableCell(content)} |`;
  },
});
markdownSerializer.addRule("preservedMarkdownFrontMatter", {
  filter: (node) => node.nodeName === "DIV" && node.classList.contains("markdown-front-matter-placeholder"),
  replacement: (_content, node) => `\n\n${node.getAttribute("data-markdown-front-matter") ?? ""}\n\n`,
});
markdownSerializer.addRule("preservedMarkdownComment", {
  filter: (node) => node.nodeName === "SPAN" && node.classList.contains("markdown-comment-placeholder"),
  replacement: (_content, node) => {
    const encoded = node.getAttribute("data-markdown-comment") ?? "";
    let comment = "";
    try {
      comment = decodeURIComponent(encoded);
    } catch {
      comment = "";
    }
    return node.getAttribute("data-markdown-comment-block") === "true" ? `\n\n${comment}\n\n` : comment;
  },
});
markdownSerializer.addRule("preservedMarkdownLink", {
  filter: (node) => node.nodeName === "A" && node.hasAttribute("data-markdown-href"),
  replacement: (content, node) => {
    const href = node.getAttribute("data-markdown-href") ?? "";
    const title = node.getAttribute("data-markdown-title") ?? "";
    return `[${content}](${markdownDestination(href)}${title ? ` "${markdownTitle(title)}"` : ""})`;
  },
});
markdownSerializer.addRule("preservedMarkdownImage", {
  filter: (node) => node.nodeName === "SPAN" && node.classList.contains("markdown-image-placeholder"),
  replacement: (_content, node) => {
    const alt = node.getAttribute("data-markdown-image-alt") ?? "Image";
    const source = node.getAttribute("data-markdown-image-src") ?? "";
    const title = node.getAttribute("data-markdown-image-title") ?? "";
    return `![${escapeMarkdownLabel(alt)}](${markdownDestination(source)}${title ? ` "${markdownTitle(title)}"` : ""})`;
  },
});
markdownSerializer.addRule("renderedTaskCheckbox", {
  filter: (node) => node.nodeName === "INPUT" && node.getAttribute("type") === "checkbox" && node.closest("li") !== null,
  replacement: (_content, node) => `${(node as HTMLInputElement).checked ? "[x]" : "[ ]"} `,
});
markdownSerializer.addRule("gfmStrikethrough", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

const mainPreviewStyles = String.raw`
  :host {
    --cle-main-bg: #ffffff;
    --cle-main-bar: #f7f7f5;
    --cle-main-raised: #fbfbfa;
    --cle-main-text: #20201e;
    --cle-main-muted: #6d6c67;
    --cle-main-faint: #96958f;
    --cle-main-line: rgba(24, 24, 22, 0.12);
    --cle-main-hover: rgba(24, 24, 22, 0.055);
    --cle-main-active: #ffffff;
    --cle-main-focus: #74736e;
    --cle-syntax-comment: #627062;
    --cle-syntax-string: #087a18;
    --cle-syntax-keyword: #6b00d7;
    --cle-syntax-number: #00717a;
    --cle-syntax-constant: #a3155b;
    --cle-syntax-type: #006e91;
    --cle-syntax-function: #075db7;
    --cle-syntax-property: #b54708;
    --cle-syntax-tag: #b4235a;
    --cle-syntax-attribute: #7a3db8;
    --cle-syntax-selector: #006f72;
    --cle-syntax-meta: #7047a3;
    --cle-syntax-inserted: #157347;
    --cle-syntax-deleted: #c12e35;
    position: absolute;
    z-index: 31;
    inset: 0;
    display: block;
    min-width: 0;
    min-height: 0;
    color: var(--cle-main-text);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: none;
    contain: layout style paint;
  }

  :host-context(.dark),
  :host-context(.electron-dark),
  :host-context([data-theme="dark"]),
  :host([data-theme="dark"]) {
    --cle-main-bg: #1d1d1c;
    --cle-main-bar: #232321;
    --cle-main-raised: #20201e;
    --cle-main-text: #ecece8;
    --cle-main-muted: #aaa9a3;
    --cle-main-faint: #7f7e79;
    --cle-main-line: rgba(255, 255, 255, 0.13);
    --cle-main-hover: rgba(255, 255, 255, 0.065);
    --cle-main-active: #1d1d1c;
    --cle-main-focus: #aaa9a3;
    --cle-syntax-comment: #9aa69a;
    --cle-syntax-string: #89d989;
    --cle-syntax-keyword: #c7a0ff;
    --cle-syntax-number: #75d0d6;
    --cle-syntax-constant: #ff91b8;
    --cle-syntax-type: #72d2e3;
    --cle-syntax-function: #88baff;
    --cle-syntax-property: #ff9d57;
    --cle-syntax-tag: #ff8fa5;
    --cle-syntax-attribute: #d0acff;
    --cle-syntax-selector: #76d5cf;
    --cle-syntax-meta: #c9a7f5;
    --cle-syntax-inserted: #76d39b;
    --cle-syntax-deleted: #ff969b;
  }

  :host([data-theme="light"]) {
    --cle-main-bg: #ffffff;
    --cle-main-bar: #f7f7f5;
    --cle-main-raised: #fbfbfa;
    --cle-main-text: #20201e;
    --cle-main-muted: #6d6c67;
    --cle-main-faint: #96958f;
    --cle-main-line: rgba(24, 24, 22, 0.12);
    --cle-main-hover: rgba(24, 24, 22, 0.055);
    --cle-main-active: #ffffff;
    --cle-main-focus: #74736e;
    --cle-syntax-comment: #627062;
    --cle-syntax-string: #087a18;
    --cle-syntax-keyword: #6b00d7;
    --cle-syntax-number: #00717a;
    --cle-syntax-constant: #a3155b;
    --cle-syntax-type: #006e91;
    --cle-syntax-function: #075db7;
    --cle-syntax-property: #b54708;
    --cle-syntax-tag: #b4235a;
    --cle-syntax-attribute: #7a3db8;
    --cle-syntax-selector: #006f72;
    --cle-syntax-meta: #7047a3;
    --cle-syntax-inserted: #157347;
    --cle-syntax-deleted: #c12e35;
  }

  *, *::before, *::after { box-sizing: border-box; }
  button { color: inherit; font: inherit; }

  .surface {
    display: grid;
    grid-template-rows: 46px minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    pointer-events: none;
  }

  .tab-strip {
    position: relative;
    display: flex;
    align-items: stretch;
    min-width: 0;
    height: 46px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    background: var(--cle-main-bar);
    border-bottom: 1px solid var(--cle-main-line);
    app-region: no-drag;
    -webkit-app-region: no-drag;
    pointer-events: auto;
  }

  .tab-strip::-webkit-scrollbar { display: none; }

  .tab-slot {
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
    border-right: 1px solid var(--cle-main-line);
  }

  .tab-slot.active { background: var(--cle-main-active); }

  .preview-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    width: 100%;
    height: 45px;
    padding: 0 13px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--cle-main-muted);
    cursor: default;
    outline: none;
    white-space: nowrap;
  }

  .tab-slot.conversation { width: 142px; }
  .tab-slot.file { width: clamp(150px, 19vw, 238px); }
  .tab-slot.file .preview-tab { padding-right: 5px; }

  .preview-tab:hover { background: var(--cle-main-hover); color: var(--cle-main-text); }
  .preview-tab[aria-selected="true"] { background: var(--cle-main-active); color: var(--cle-main-text); }
  .preview-tab[aria-selected="true"]::after {
    content: "";
    position: absolute;
    right: 9px;
    bottom: 0;
    left: 9px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: currentColor;
    opacity: 0.78;
  }

  .preview-tab:focus-visible,
  .tab-close:focus-visible,
  .preview-panel:focus-visible {
    outline: 2px solid var(--cle-main-focus);
    outline-offset: -3px;
  }

  .tab-icon,
  .panel-icon,
  .state-icon {
    display: inline-flex;
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }

  .tab-icon svg,
  .panel-icon svg,
  .state-icon svg,
  .tab-close svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tab-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-close {
    align-self: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    margin: 0 5px 0 -4px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--cle-main-faint);
    cursor: default;
    opacity: 0;
    outline: none;
  }

  .tab-slot:hover .tab-close,
  .tab-slot:focus-within .tab-close,
  .tab-slot.active .tab-close { opacity: 1; }
  .tab-close:hover { background: var(--cle-main-hover); color: var(--cle-main-text); }

  .panel-mount {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .preview-panel {
    display: grid;
    grid-template-rows: 35px minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
    pointer-events: auto;
    outline: none;
  }

  .preview-meta-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 0 16px;
    border-bottom: 1px solid var(--cle-main-line);
    background: var(--cle-main-raised);
    color: var(--cle-main-muted);
    font-size: 11px;
  }

  .preview-location {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-metadata {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--cle-main-faint);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .preview-content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--cle-main-bg);
  }

  .preview-content.editor-mode {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .preview-content.editor-mode.markdown-editor-mode {
    display: block;
    overflow: auto;
  }

  .media-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    padding: 24px;
    overflow: hidden;
  }

  .media-preview-image,
  .media-preview-video,
  .media-preview-audio {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .media-preview-image {
    width: auto;
    height: auto;
  }

  .media-preview-video {
    width: min(100%, 1200px);
    height: auto;
    background: #000000;
  }

  .media-preview[data-kind="pdf"] {
    display: block;
    padding: 0;
    overflow: auto;
    background: var(--cle-main-raised);
  }

  .media-preview-pdf {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    min-height: 100%;
  }

  .pdf-preview-toolbar {
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 42px;
    padding: 6px 12px;
    box-sizing: border-box;
    color: var(--cle-main-muted);
    background: color-mix(in srgb, var(--cle-main-bg) 94%, transparent);
    border-bottom: 1px solid var(--cle-main-line);
    backdrop-filter: blur(10px);
  }

  .pdf-preview-toolbar button {
    min-width: 70px;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .pdf-preview-toolbar button:hover:not(:disabled) { background: var(--cle-main-hover); }
  .pdf-preview-toolbar button:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }
  .pdf-preview-toolbar button[aria-disabled="true"] { cursor: default; opacity: .42; }

  .pdf-page-status {
    min-width: 84px;
    color: var(--cle-main-muted);
    font-size: 11px;
    text-align: center;
  }

  .pdf-page-stage {
    display: grid;
    place-items: start center;
    min-width: 0;
    min-height: 100%;
    padding: 24px;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .pdf-page-canvas {
    display: block;
    max-width: 100%;
    height: auto;
    background: #ffffff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .22), 0 1px 3px rgba(0, 0, 0, .2);
  }

  .pdf-preview-loading,
  .pdf-page-error {
    align-self: center;
    max-width: 440px;
    margin: auto;
    padding: 24px;
    color: var(--cle-main-muted);
    text-align: center;
  }

  .pdf-page-error { color: var(--cle-syntax-deleted); }

  @media (max-width: 640px) {
    .pdf-preview-toolbar { gap: 6px; }
    .pdf-preview-toolbar button { min-width: 60px; padding-inline: 8px; }
    .pdf-page-stage { padding: 12px; }
  }

  .media-preview-audio {
    width: min(100%, 720px);
    height: 54px;
  }

  ${__CODE_CODEX_PPT_VIEWER_STYLES__}

  .office-preview {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
  }

  .office-preview-stage {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .office-preview-loading {
    display: grid;
    min-height: 100%;
    place-items: center;
    padding: 24px;
    box-sizing: border-box;
    color: var(--cle-main-muted);
    text-align: center;
  }

  .office-preview[data-kind="docx"] {
    overflow: auto;
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .office-preview[data-kind="docx"] .office-preview-stage {
    height: auto;
    min-height: 100%;
    padding: 24px;
    box-sizing: border-box;
  }

  .office-word-document {
    width: max-content;
    min-width: 100%;
    margin: 0 auto;
    color: #1f2328;
    font-family: Aptos, Calibri, "Segoe UI", sans-serif;
  }

  .office-word-document > div {
    display: flex !important;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 0 !important;
    background: transparent !important;
  }

  .office-word-document section {
    flex: 0 0 auto;
    margin: 0 auto 20px;
    background: #ffffff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .22), 0 1px 3px rgba(0, 0, 0, .2) !important;
  }

  .office-word-document section.office-word-unpaginated {
    height: auto !important;
    min-height: 0 !important;
    box-shadow: none !important;
  }

  .office-word-document section.office-word-unpaginated > header,
  .office-word-document section.office-word-unpaginated > footer {
    position: static !important;
  }

  .office-word-document section.office-word-oversized {
    height: auto !important;
  }

  .office-word-document p[data-cle-docx-paragraph-continuation="true"] {
    list-style-type: none !important;
    counter-increment: none !important;
    counter-reset: none !important;
    counter-set: none !important;
  }

  .office-word-document p[data-cle-docx-paragraph-continuation="true"]::before {
    display: none !important;
    content: none !important;
    counter-increment: none !important;
  }

  .office-word-document section img {
    max-width: 100%;
  }

  .office-preview-notice {
    display: block;
    padding: 8px 12px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border-top: 1px solid var(--cle-main-line);
    font-size: 11px;
    text-align: center;
  }

  .office-workbook,
  .office-presentation {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .office-sheet-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    min-height: 38px;
    padding: 5px 8px 0;
    overflow-x: auto;
    overflow-y: hidden;
    box-sizing: border-box;
    background: var(--cle-main-raised);
    border-bottom: 1px solid var(--cle-main-line);
    scrollbar-width: thin;
  }

  .office-sheet-tabs button {
    flex: 0 0 auto;
    max-width: 220px;
    min-height: 28px;
    padding: 4px 10px;
    overflow: hidden;
    color: var(--cle-main-muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .office-sheet-tabs button:hover { color: var(--cle-main-text); background: var(--cle-main-hover); }
  .office-sheet-tabs button[aria-selected="true"] {
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border-color: var(--cle-main-line);
    border-bottom-color: var(--cle-main-bg);
  }
  .office-sheet-tabs button:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: -2px; }
  .office-sheet-overflow { flex: 0 0 auto; padding: 0 7px; color: var(--cle-main-faint); font-size: 11px; }

  .office-sheet-viewport {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--cle-main-bg);
  }

  .office-sheet-table {
    width: max-content;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  .office-sheet-table caption {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .office-sheet-table th,
  .office-sheet-table td {
    min-width: 72px;
    height: 26px;
    padding: 4px 7px;
    box-sizing: border-box;
    overflow: hidden;
    border-right: 1px solid var(--cle-main-line);
    border-bottom: 1px solid var(--cle-main-line);
    text-align: left;
    text-overflow: ellipsis;
    vertical-align: middle;
    white-space: pre;
  }

  .office-sheet-table thead th {
    position: sticky;
    z-index: 2;
    top: 0;
    min-width: 72px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    font-weight: 500;
    text-align: center;
  }

  .office-sheet-table tbody th,
  .office-sheet-corner {
    position: sticky;
    z-index: 1;
    left: 0;
    min-width: 44px;
    width: 44px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    font-weight: 400;
    text-align: right;
  }

  .office-sheet-corner { z-index: 3 !important; top: 0; }

  .office-preview-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 42px;
    padding: 6px 12px;
    box-sizing: border-box;
    color: var(--cle-main-muted);
    background: color-mix(in srgb, var(--cle-main-bg) 94%, transparent);
    border-bottom: 1px solid var(--cle-main-line);
  }

  .office-preview-toolbar button {
    min-width: 70px;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .office-preview-toolbar button:hover:not([aria-disabled="true"]) { background: var(--cle-main-hover); }
  .office-preview-toolbar button:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }
  .office-preview-toolbar button[aria-disabled="true"] { cursor: default; opacity: .42; }
  .office-page-status {
    min-width: 96px;
    color: var(--cle-main-muted);
    font-size: 11px;
    text-align: center;
  }

  .office-slide-viewport {
    display: grid;
    min-width: 0;
    min-height: 0;
    padding: 20px;
    overflow: auto;
    box-sizing: border-box;
    place-items: center;
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .office-slide-viewport > * { max-width: 100%; }

  .office-preview[data-kind="ppt"] .office-slide-viewport {
    padding: 0;
    overflow: hidden;
    place-items: stretch;
  }

  .office-preview[data-kind="ppt"] .rpv-root {
    width: 100%;
    height: 100%;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .office-preview[data-kind="ppt"] .rpv-workspace {
    min-height: 100%;
    max-height: 100%;
  }

  .office-preview[data-kind="ppt"] .rpv-stage,
  .office-preview[data-kind="ppt"] .rpv-viewport,
  .office-preview[data-kind="ppt"] .rpv-status {
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .office-preview[data-kind="ppt"] .rpv-viewport { padding: 20px; }

  .office-native-slide {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    background: #fff;
  }

  @media (max-width: 640px) {
    .office-preview[data-kind="docx"] .office-preview-stage { padding: 12px; }
    .office-preview-toolbar { gap: 6px; }
    .office-preview-toolbar button { min-width: 60px; padding-inline: 8px; }
    .office-slide-viewport { padding: 10px; }
  }

  .literal-text,
  .code-line-numbers,
  .code-editor-highlight,
  .code-editor {
    font: 12.5px/1.62 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0;
    tab-size: 4;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .code-reader {
    --cle-line-number-width: calc(2ch + 24px);
    display: grid;
    grid-template-columns: var(--cle-line-number-width) minmax(max-content, 1fr);
    align-items: stretch;
    width: max-content;
    min-width: 100%;
    min-height: 100%;
  }

  .code-line-numbers {
    margin: 0;
    padding: 20px 10px 48px 6px;
    overflow: hidden;
    color: var(--cle-main-muted);
    background: var(--cle-main-bg);
    border-right: 1px solid var(--cle-main-line);
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
    pointer-events: none;
  }

  .code-reader > .code-line-numbers {
    position: sticky;
    z-index: 1;
    left: 0;
    grid-column: 1;
    grid-row: 1;
  }

  .literal-text {
    grid-column: 2;
    grid-row: 1;
    min-width: max-content;
    margin: 0;
    padding: 20px 24px 48px 16px;
    color: var(--cle-main-text);
  }

  .code-editor-stack {
    --cle-line-number-width: calc(2ch + 24px);
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
  }

  .code-editor-highlight {
    position: absolute;
    inset: 0 0 0 var(--cle-line-number-width);
    margin: 0;
    padding: 20px 24px 48px;
    overflow: hidden;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    pointer-events: none;
    scrollbar-width: none;
  }

  .code-editor-highlight::-webkit-scrollbar { display: none; }

  .literal-text .syntax-code::after,
  .code-editor-highlight .syntax-code::after {
    content: "\200b";
  }

  .code-editor-line-numbers {
    position: absolute;
    z-index: 1;
    inset: 0 auto 0 0;
    width: var(--cle-line-number-width);
  }

  .code-editor {
    position: absolute;
    inset: 0 0 0 var(--cle-line-number-width);
    display: block;
    width: auto;
    height: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 20px 24px 48px;
    overflow: auto;
    resize: none;
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: var(--cle-main-text);
    background: transparent;
    border: 0;
    border-radius: 0;
    outline: none;
  }

  .code-editor::selection { color: transparent; background: rgba(80, 125, 190, 0.28); }
  .code-editor:focus-visible { box-shadow: inset 0 0 0 2px var(--cle-main-line); }

  .code-editor-stack.composing .code-editor-highlight { visibility: hidden; }
  .code-editor-stack.composing .code-editor {
    color: var(--cle-main-text);
    -webkit-text-fill-color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }

  .editor-error {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 38px;
    padding: 7px 12px 7px 16px;
    color: var(--cle-main-text);
    background: var(--cle-main-raised);
    border-top: 1px solid var(--cle-main-line);
    font-size: 11px;
  }

  .editor-error-copy {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editor-reload {
    flex: 0 0 auto;
    min-height: 24px;
    padding: 2px 8px;
    color: var(--cle-main-text);
    background: transparent;
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
  }

  .editor-reload:hover { background: var(--cle-main-hover); }
  .editor-reload:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }

  .syntax-code { color: inherit; font: inherit; }
  .tok-comment { color: var(--cle-syntax-comment); font-style: italic; }
  .tok-string { color: var(--cle-syntax-string); }
  .tok-keyword { color: var(--cle-syntax-keyword); }
  .tok-keyword { font-weight: 600; }
  .tok-number { color: var(--cle-syntax-number); }
  .tok-constant,
  .tok-variable { color: var(--cle-syntax-constant); }
  .tok-type { color: var(--cle-syntax-type); }
  .tok-function,
  .tok-link { color: var(--cle-syntax-function); }
  .tok-heading { color: var(--cle-syntax-keyword); }
  .tok-property { color: var(--cle-syntax-property); }
  .tok-tag { color: var(--cle-syntax-tag); }
  .tok-attribute { color: var(--cle-syntax-attribute); }
  .tok-selector { color: var(--cle-syntax-selector); }
  .tok-meta { color: var(--cle-syntax-meta); }
  .tok-operator { color: var(--cle-main-muted); }
  .tok-inserted { color: var(--cle-syntax-inserted); }
  .tok-deleted { color: var(--cle-syntax-deleted); }

  .markdown-reader {
    min-width: 0;
    min-height: 100%;
    padding: 0 0 64px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }

  .markdown-body {
    width: min(100%, 920px);
    margin: 0 auto;
    padding: 30px clamp(24px, 5vw, 52px) 20px;
    color: var(--cle-main-text);
    font: 14px/1.62 -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", sans-serif;
    overflow-wrap: anywhere;
  }
  .markdown-editor { min-height: 100%; }
  .markdown-editor-surface {
    min-height: calc(100% - 64px);
    caret-color: var(--cle-main-text);
    cursor: text;
    outline: none;
  }
  .markdown-editor-surface:focus-visible {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cle-main-focus) 42%, transparent);
  }
  .markdown-editor-surface[data-limit-reached="true"] {
    box-shadow: inset 0 0 0 1px var(--cle-syntax-deleted);
  }
  .markdown-editor-surface a { cursor: text; }
  .markdown-editor-surface .task-list-item input { cursor: pointer; }
  .markdown-editor-surface .markdown-image-placeholder {
    cursor: default;
    user-select: none;
  }
  .markdown-front-matter-placeholder,
  .markdown-comment-placeholder {
    display: block;
    margin: 0 0 16px;
    padding: 7px 10px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px dashed var(--cle-main-line);
    border-radius: 5px;
    font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    user-select: all;
  }
  .markdown-comment-placeholder {
    display: inline-flex;
    margin: 0 3px;
    padding-block: 1px;
  }
  .markdown-body > :first-child { margin-top: 0 !important; }
  .markdown-body > :last-child { margin-bottom: 0 !important; }
  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6 {
    margin: 1.45em 0 .6em;
    color: var(--cle-main-text);
    font-weight: 600;
    line-height: 1.25;
  }
  .markdown-body h1 {
    padding-bottom: .28em;
    border-bottom: 1px solid var(--cle-main-line);
    font-size: 2em;
    font-weight: 500;
  }
  .markdown-body h2 {
    padding-bottom: .26em;
    border-bottom: 1px solid var(--cle-main-line);
    font-size: 1.5em;
    font-weight: 500;
  }
  .markdown-body h3 { font-size: 1.25em; }
  .markdown-body h4 { font-size: 1em; }
  .markdown-body h5 { font-size: .875em; }
  .markdown-body h6 { color: var(--cle-main-muted); font-size: .85em; }
  .markdown-body p,
  .markdown-body blockquote,
  .markdown-body ul,
  .markdown-body ol,
  .markdown-body table,
  .markdown-body pre { margin: 0 0 16px; }
  .markdown-body ul,
  .markdown-body ol { padding-left: 2em; }
  .markdown-body li + li { margin-top: .25em; }
  .markdown-body li > p { margin: 8px 0; }
  .markdown-body blockquote {
    padding: 1px 0 1px 16px;
    color: var(--cle-main-muted);
    border-left: 4px solid var(--cle-main-line);
  }
  .markdown-body blockquote > :last-child { margin-bottom: 0; }
  .markdown-body hr {
    height: 2px;
    margin: 24px 0;
    background: var(--cle-main-line);
    border: 0;
  }
  .markdown-body a {
    color: var(--cle-syntax-function);
    text-decoration: none;
    cursor: not-allowed;
  }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body strong { font-weight: 650; }
  .markdown-body code {
    padding: .12em .32em;
    color: var(--cle-main-text);
    background: var(--cle-main-hover);
    border: 1px solid var(--cle-main-line);
    border-radius: 4px;
    font: .91em/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  }
  .markdown-body pre {
    max-width: 100%;
    padding: 14px 16px;
    overflow: auto;
    color: var(--cle-main-text);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    tab-size: 4;
  }
  .markdown-body pre code {
    display: block;
    min-width: max-content;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre;
  }
  .markdown-body table {
    display: block;
    width: max-content;
    max-width: 100%;
    overflow: auto;
    border-spacing: 0;
    border-collapse: collapse;
  }
  .markdown-body th,
  .markdown-body td {
    padding: 6px 12px;
    border: 1px solid var(--cle-main-line);
  }
  .markdown-body th {
    font-weight: 600;
    background: var(--cle-main-raised);
  }
  .markdown-body .markdown-align-left { text-align: left; }
  .markdown-body .markdown-align-center { text-align: center; }
  .markdown-body .markdown-align-right { text-align: right; }
  .markdown-body tr:nth-child(2n) td { background: var(--cle-main-hover); }
  .markdown-body .task-list { padding-left: .4em; list-style: none; }
  .markdown-body .task-list-item { list-style: none; }
  .markdown-body .task-list-item input {
    width: 14px;
    height: 14px;
    margin: 0 7px 0 0;
    vertical-align: -2px;
    accent-color: var(--cle-main-focus);
  }
  .markdown-image-placeholder {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px dashed var(--cle-main-line);
    border-radius: 5px;
    font-size: 11px;
  }
  .markdown-truncated {
    width: min(100%, 920px);
    margin: 18px auto -10px;
    padding: 8px clamp(24px, 5vw, 52px);
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border-bottom: 1px solid var(--cle-main-line);
    font-size: 11px;
  }

  .view-state {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-height: 180px;
    padding: 28px;
    text-align: center;
  }

  .state-card { max-width: 390px; color: var(--cle-main-muted); }
  .state-icon { width: 22px; height: 22px; margin: 0 auto 12px; color: var(--cle-main-faint); }
  .state-title { margin: 0 0 5px; color: var(--cle-main-text); font-size: 13px; font-weight: 600; }
  .state-copy { margin: 0; font-size: 12px; line-height: 1.55; }

  .spinner {
    width: 18px;
    height: 18px;
    margin: 0 auto 13px;
    border: 1.5px solid var(--cle-main-line);
    border-top-color: var(--cle-main-muted);
    border-radius: 50%;
    animation: cle-main-spin 720ms linear infinite;
  }

  @keyframes cle-main-spin { to { transform: rotate(360deg); } }

  @media (max-width: 680px) {
    .tab-slot.conversation { width: 126px; }
    .tab-slot.file { width: min(196px, 46vw); }
    .literal-text { padding: 16px 18px 40px 12px; }
    .code-line-numbers { padding: 16px 8px 40px 4px; }
    .code-editor-highlight,
    .code-editor { padding: 16px 18px 40px; }
    .preview-meta-bar { padding-inline: 12px; }
  }

  @media (prefers-color-scheme: dark) {
    :host(:not([data-theme="light"])) {
      --cle-main-bg: #1d1d1c;
      --cle-main-bar: #232321;
      --cle-main-raised: #20201e;
      --cle-main-text: #ecece8;
      --cle-main-muted: #aaa9a3;
      --cle-main-faint: #7f7e79;
      --cle-main-line: rgba(255, 255, 255, 0.13);
      --cle-main-hover: rgba(255, 255, 255, 0.065);
      --cle-main-active: #1d1d1c;
      --cle-main-focus: #aaa9a3;
      --cle-syntax-comment: #9aa69a;
      --cle-syntax-string: #89d989;
      --cle-syntax-keyword: #c7a0ff;
      --cle-syntax-number: #75d0d6;
      --cle-syntax-constant: #ff91b8;
      --cle-syntax-type: #72d2e3;
      --cle-syntax-function: #88baff;
      --cle-syntax-property: #ff9d57;
      --cle-syntax-tag: #ff8fa5;
      --cle-syntax-attribute: #d0acff;
      --cle-syntax-selector: #76d5cf;
      --cle-syntax-meta: #c9a7f5;
      --cle-syntax-inserted: #76d39b;
      --cle-syntax-deleted: #ff969b;
    }
  }

  @media (forced-colors: active) {
    .code-editor-highlight { display: none; }
    .code-line-numbers {
      color: GrayText;
      background: Canvas;
      border-right-color: GrayText;
    }
    .code-editor {
      color: CanvasText;
      -webkit-text-fill-color: CanvasText;
      background: Canvas;
    }
    .syntax-code [class^="tok-"] { color: CanvasText; forced-color-adjust: auto; }
    .syntax-code .tok-comment { color: GrayText; }
    .syntax-code .tok-keyword,
    .syntax-code .tok-heading { font-weight: 700; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; border-top-color: var(--cle-main-line); }
  }

  @media (max-width: 640px) {
    .markdown-body { padding: 22px 18px 16px; }
    .markdown-truncated { padding-inline: 18px; }
  }
`;

interface SuppressedAttributes {
  readonly inert: string | null;
  readonly ariaHidden: string | null;
}

interface PdfPreviewJob {
  readonly generation: number;
  data: Uint8Array | null;
  loadingTask: PDFDocumentLoadingTask | null;
  document: PDFDocumentProxy | null;
  renderTask: RenderTask | null;
  pageGeneration: number;
}

interface OfficePreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
  viewer: PptxViewer | null;
  legacyPptRoot: Root | null;
  legacyPptWorker: Worker | null;
  nativePptObjectUrl: { readonly url: string; readonly revoke: () => void } | null;
  resourceObserver: MutationObserver | null;
  docxRepairTimer: number | null;
}

type FocusSnapshot =
  | { readonly kind: "tab"; readonly path: string | null }
  | { readonly kind: "close"; readonly path: string }
  | { readonly kind: "panel" }
  | {
      readonly kind: "editor";
      readonly selectionStart: number;
      readonly selectionEnd: number;
      readonly selectionDirection: "forward" | "backward" | "none";
      readonly scrollTop: number;
      readonly scrollLeft: number;
    }
  | {
      readonly kind: "markdown-editor";
      readonly anchorOffset: number;
      readonly focusOffset: number;
      readonly scrollTop: number;
      readonly scrollLeft: number;
    }
  | null;

let nextInstanceId = 0;

function fileNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path || "File";
}

function isMediaPreviewView(view: MainPreviewFileView | undefined): view is MainPreviewMediaView {
  return view?.kind === "image" || view?.kind === "video" || view?.kind === "pdf" || view?.kind === "audio" || view?.kind === "office";
}

function previewerIdForMediaKind(kind: MainPreviewMediaView["kind"]): string {
  switch (kind) {
    case "image":
      return IMAGE_PREVIEWER_ID;
    case "video":
      return VIDEO_PREVIEWER_ID;
    case "pdf":
      return PDF_PREVIEWER_ID;
    case "audio":
      return AUDIO_PREVIEWER_ID;
    case "office":
      return OFFICE_PREVIEWER_ID;
  }
}

function officeDocumentKind(mimeType: string): OfficeDocumentKind | null {
  return OFFICE_MIME_TYPES[mimeType.trim().toLowerCase()] ?? null;
}

function excelColumnLabel(index: number): string {
  let value = Math.max(1, Math.trunc(index));
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function xmlAttribute(element: Element, requestedName: string): string | null {
  const normalizedName = requestedName.toLowerCase();
  for (const attribute of element.attributes) {
    if (attribute.localName.toLowerCase() === normalizedName) return attribute.value;
  }
  return null;
}

function directXmlChild(element: Element, requestedName: string): Element | null {
  const normalizedName = requestedName.toLowerCase();
  for (const child of element.children) {
    if (child.localName.toLowerCase() === normalizedName) return child;
  }
  return null;
}

function boundedDirectXmlChildren(
  element: Element,
  requestedName: string,
  maximum: number,
): { readonly elements: readonly Element[]; readonly truncated: boolean } {
  const normalizedName = requestedName.toLowerCase();
  const elements: Element[] = [];
  let total = 0;
  for (const child of element.children) {
    if (child.localName.toLowerCase() !== normalizedName) continue;
    total += 1;
    if (elements.length < maximum) elements.push(child);
  }
  return { elements, truncated: total > maximum };
}

function xlsxTextContent(element: Element): string {
  let text = "";
  const textNodes = element.getElementsByTagNameNS("*", "t");
  for (const textNode of textNodes) {
    let ancestor = textNode.parentElement;
    let phonetic = false;
    while (ancestor && ancestor !== element) {
      if (ancestor.localName.toLowerCase() === "rph") {
        phonetic = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!phonetic) {
      const remaining = MAX_EXCEL_CELL_TEXT_UNITS + 1 - text.length;
      if (remaining <= 0) break;
      text += (textNode.textContent ?? "").slice(0, remaining);
    }
  }
  return text;
}

function xlsxCellCoordinate(reference: string): { readonly row: number; readonly column: number } | null {
  const match = reference.trim().match(/^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]!.toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  const row = Number(match[2]);
  if (column < 1 || column > 16_384 || !Number.isSafeInteger(row) || row > 1_048_576) return null;
  return { row, column };
}

function xlsxRange(reference: string): XlsxRange | null {
  const parts = reference.trim().split(":");
  if (parts.length < 1 || parts.length > 2) return null;
  const start = xlsxCellCoordinate(parts[0] ?? "");
  const end = xlsxCellCoordinate(parts[1] ?? parts[0] ?? "");
  if (!start || !end || start.row > end.row || start.column > end.column) return null;
  return {
    startRow: start.row,
    startColumn: start.column,
    endRow: end.row,
    endColumn: end.column,
  };
}

function xlsxMergedCellKey(row: number, column: number): number {
  return row * (MAX_EXCEL_COLUMNS + 1) + column;
}

function xmlBooleanElement(element: Element, childName: string): boolean {
  const child = directXmlChild(element, childName);
  if (!child) return false;
  const value = (xmlAttribute(child, "val") ?? "1").trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off" && value !== "none";
}

function directArgbColor(element: Element | null): string | null {
  const value = element ? xmlAttribute(element, "rgb")?.trim() ?? "" : "";
  if (/^[0-9a-f]{8}$/i.test(value)) return `#${value.slice(2).toUpperCase()}`;
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toUpperCase()}`;
  return null;
}

function applyXlsxCellStyle(element: HTMLElement, style: XlsxCellStyle | null): void {
  if (!style) return;
  if (style.bold) element.style.fontWeight = "700";
  if (style.italic) element.style.fontStyle = "italic";
  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strike) decorations.push("line-through");
  if (decorations.length > 0) element.style.textDecorationLine = decorations.join(" ");
  if (style.fontFamily) element.style.fontFamily = style.fontFamily;
  if (style.fontSizePoints !== undefined) element.style.fontSize = `${style.fontSizePoints}pt`;
  if (style.color) element.style.color = style.color;
  if (style.backgroundColor) element.style.backgroundColor = style.backgroundColor;
  if (style.horizontal) element.style.textAlign = style.horizontal;
  if (style.vertical) element.style.verticalAlign = style.vertical;
  if (style.wrapText) {
    element.style.whiteSpace = "pre-wrap";
    element.style.overflowWrap = "anywhere";
    element.style.textOverflow = "clip";
  }
}

function normalizeXlsxEntryName(value: string): string | null {
  if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return null;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

function decodedOfficeTarget(value: string): string {
  let decoded = value.trim();
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function isExternalOfficeTarget(value: string): boolean {
  const decoded = decodedOfficeTarget(value);
  return /^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith("//") || decoded.startsWith("\\\\");
}

function resolveXlsxRelationshipTarget(baseFile: string, target: string): string | null {
  const decoded = decodedOfficeTarget(target);
  if (
    !decoded ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    isExternalOfficeTarget(decoded)
  ) {
    return null;
  }
  const segments = decoded.startsWith("/") ? [] : baseFile.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return normalizeXlsxEntryName(segments.join("/"));
}

function safeXlsxSheetName(value: string | null, index: number): string {
  const normalized = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!normalized) return `Sheet ${index + 1}`;
  return normalized.length > 80 ? `${normalized.slice(0, 79)}\u2026` : normalized;
}

function declaredZipEntryBytes(entry: JSZip.JSZipObject): number | null {
  const privateData = (entry as unknown as { readonly _data?: { readonly uncompressedSize?: unknown } })._data;
  const size = privateData?.uncompressedSize;
  return typeof size === "number" && Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function cloneView(view: MainPreviewFileView): MainPreviewFileView {
  const name = view.name || fileNameFromPath(view.path);
  switch (view.kind) {
    case "loading":
      return { kind: "loading", path: view.path, name };
    case "text":
      return {
        kind: "text",
        path: view.path,
        name,
        text: view.text,
        sizeBytes: view.sizeBytes,
        truncated: view.truncated,
        ...(view.editable === undefined ? {} : { editable: view.editable }),
        ...(view.version === undefined ? {} : { version: view.version }),
        ...(view.lineEnding === undefined ? {} : { lineEnding: view.lineEnding }),
      };
    case "empty":
      return {
        kind: "empty",
        path: view.path,
        name,
        sizeBytes: view.sizeBytes,
        ...(view.editable === undefined ? {} : { editable: view.editable }),
        ...(view.version === undefined ? {} : { version: view.version }),
        ...(view.lineEnding === undefined ? {} : { lineEnding: view.lineEnding }),
      };
    case "image":
    case "video":
    case "pdf":
    case "audio":
    case "office":
      return {
        kind: view.kind,
        path: view.path,
        name,
        mimeType: view.mimeType,
        sizeBytes: view.sizeBytes,
        bytes: view.bytes,
      };
    case "unsupported":
      return {
        kind: "unsupported",
        path: view.path,
        name,
        sizeBytes: view.sizeBytes,
        reason: view.reason,
      };
    case "error":
      return view.message === undefined
        ? { kind: "error", path: view.path, name, code: view.code }
        : { kind: "error", path: view.path, name, code: view.code, message: view.message };
  }
}

function normalizeState(state: MainPreviewState): MainPreviewState {
  const seen = new Set<string>();
  const tabs: MainPreviewFileView[] = [];
  for (const view of state.tabs) {
    if (!view.path || seen.has(view.path)) continue;
    seen.add(view.path);
    tabs.push(cloneView(view));
  }
  const activePath = state.activePath !== null && seen.has(state.activePath) ? state.activePath : null;
  const enabledPreviewers = [
    MARKDOWN_PREVIEWER_ID,
    IMAGE_PREVIEWER_ID,
    VIDEO_PREVIEWER_ID,
    PDF_PREVIEWER_ID,
    AUDIO_PREVIEWER_ID,
    OFFICE_PREVIEWER_ID,
  ].filter(
    (previewer) => state.enabledPreviewers?.includes(previewer) === true,
  );
  const editor = state.editor && state.editor.path === activePath
    ? {
        path: state.editor.path,
        draft: state.editor.draft,
        saving: state.editor.saving,
        ...(state.editor.error === undefined ? {} : { error: state.editor.error }),
      }
    : undefined;
  return { activePath, tabs, enabledPreviewers, ...(editor ? { editor } : {}) };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Size unavailable";
  if (value < 1024) return `${Math.trunc(value)} B`;
  const units = ["KB", "MB", "GB"] as const;
  let amount = value / 1024;
  let unit: (typeof units)[number] = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index] ?? unit;
  }
  const digits = amount >= 10 || Number.isInteger(amount) ? 0 : 1;
  return `${amount.toFixed(digits)} ${unit}`;
}

function sourceLineCount(source: string): number {
  let count = 1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source.charCodeAt(index);
    if (character === 10) {
      count += 1;
    } else if (character === 13) {
      count += 1;
      if (index + 1 < source.length && source.charCodeAt(index + 1) === 10) index += 1;
    }
  }
  return count;
}

function firstVisibleLineOffset(source: string, scrollTop: number, lineHeight: number, paddingTop: number): number {
  const visibleLine = Math.max(0, Math.floor((scrollTop - paddingTop) / lineHeight));
  let offset = 0;
  for (let line = 0; line < visibleLine; line += 1) {
    const newline = source.indexOf("\n", offset);
    if (newline < 0) return source.length;
    offset = newline + 1;
  }
  return offset;
}

function selectionOffsetWithin(root: HTMLElement, node: Node | null, offset: number): number | null {
  if (!node || (node !== root && !root.contains(node))) return null;
  try {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function textPositionAtOffset(root: HTMLElement, requestedOffset: number): { readonly node: Node; readonly offset: number } {
  const offset = Math.max(0, requestedOffset);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastText: Text | null = null;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (!(current instanceof Text)) continue;
    lastText = current;
    if (remaining <= current.data.length) return { node: current, offset: remaining };
    remaining -= current.data.length;
  }
  if (lastText) return { node: lastText, offset: lastText.data.length };
  return { node: root, offset: Math.min(offset, root.childNodes.length) };
}

function unsupportedCopy(reason: MainPreviewUnavailableReason): string {
  switch (reason) {
    case "binary":
      return "Binary files are not shown in the text preview.";
    case "invalid-utf8":
      return "This file is not valid UTF-8 text.";
    case "sensitive":
      return "Preview is disabled for sensitive files.";
    case "previewer-disabled":
      return "Enable this file preview extension in Preview Market.";
    case "unsupported-type":
      return "This file type does not support a text preview.";
    case "unknown":
      return "This file cannot be shown as text.";
  }
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export class CodeCodexMainPreviewElement extends HTMLElement {
  readonly #shadow: ShadowRoot;
  readonly #tabList: HTMLElement;
  readonly #panelMount: HTMLElement;
  readonly #instanceId = ++nextInstanceId;
  readonly #tabIds = new Map<string, string>();
  readonly #suppressedChildren = new Map<Element, SuppressedAttributes>();
  readonly #syntaxCache = new Map<string, { source: string; highlight: SyntaxHighlight }>();
  readonly #mediaObjectUrls = new Map<string, {
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly url: string;
    readonly revoke: () => void;
  }>();
  #pdfGeneration = 0;
  #pdfJob: PdfPreviewJob | null = null;
  #officeGeneration = 0;
  #officeJob: OfficePreviewJob | null = null;
  #state: MainPreviewState = { activePath: null, tabs: [] };
  #rovingPath: string | null = null;
  #nextTabId = 0;
  #connected = false;
  #suppressedParent: Element | null = null;
  #childObserver: MutationObserver | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    this.#shadow.innerHTML = `
      <style>${mainPreviewStyles}</style>
      <div class="surface">
        <div class="tab-strip" role="tablist" aria-label="Conversation and file previews"></div>
        <div class="panel-mount"></div>
      </div>
    `;
    this.#tabList = this.#required<HTMLElement>(".tab-strip");
    this.#panelMount = this.#required<HTMLElement>(".panel-mount");
    this.#tabList.addEventListener("click", (event) => this.#onTabListClick(event));
    this.#tabList.addEventListener("keydown", (event) => this.#onTabListKeyDown(event));
    this.#shadow.addEventListener("keydown", (event) => this.#onShadowKeyDown(event as KeyboardEvent));
    this.#render();
  }

  connectedCallback(): void {
    this.#connected = true;
    this.#render();
    this.#syncSuppression();
    queueMicrotask(() => {
      if (this.#connected) this.#scrollSelectedTabIntoView();
    });
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#cancelPdfPreview();
    this.#cancelOfficePreview();
    this.#syntaxCache.clear();
    this.#revokeAllMediaObjectUrls();
    this.#panelMount.replaceChildren();
    this.#restoreSuppressedChildren();
  }

  get state(): MainPreviewState {
    const editor = this.#state.editor;
    return {
      activePath: this.#state.activePath,
      tabs: this.#state.tabs.map((view) => cloneView(view)),
      enabledPreviewers: [...(this.#state.enabledPreviewers ?? [])],
      ...(editor
        ? {
            editor: {
              path: editor.path,
              draft: editor.draft,
              saving: editor.saving,
              ...(editor.error === undefined ? {} : { error: editor.error }),
            },
          }
        : {}),
    };
  }

  set state(state: MainPreviewState) {
    this.setState(state);
  }

  setState(state: MainPreviewState): void {
    const nextState = normalizeState(state);
    const previousEditorPath = this.#state.editor?.path ?? null;
    const nextEditorPath = nextState.editor?.path ?? null;
    const editorTransition = nextEditorPath !== previousEditorPath;
    const enteringEditor = nextEditorPath !== null && nextEditorPath !== previousEditorPath;
    const preserveActiveViewport = nextState.activePath !== null && nextState.activePath === this.#state.activePath;
    const readerViewport = editorTransition || preserveActiveViewport
      ? (() => {
          const scroller = this.#panelMount.querySelector<HTMLElement>(".code-editor") ??
            this.#panelMount.querySelector<HTMLElement>(".preview-content");
          return {
            scrollTop: scroller?.scrollTop ?? 0,
            scrollLeft: scroller?.scrollLeft ?? 0,
          };
        })()
      : undefined;
    const retainedPaths = new Set(nextState.tabs.map((view) => view.path));
    for (const path of this.#tabIds.keys()) {
      if (!retainedPaths.has(path)) this.#tabIds.delete(path);
    }
    for (const path of this.#syntaxCache.keys()) {
      const view = nextState.tabs.find((candidate) => candidate.path === path);
      const cached = this.#syntaxCache.get(path);
      if (view?.kind !== "text" || cached?.source !== view.text) this.#syntaxCache.delete(path);
    }
    this.#reconcileMediaObjectUrls(nextState);
    const activeChanged = nextState.activePath !== this.#state.activePath;
    const rovingStillExists = this.#rovingPath === null || nextState.tabs.some((view) => view.path === this.#rovingPath);
    this.#state = nextState;
    if (activeChanged || !rovingStillExists) this.#rovingPath = nextState.activePath;
    this.#render();
    this.#syncSuppression();
    if (readerViewport) {
      queueMicrotask(() => {
        if (this.#connected && this.#state.activePath === nextState.activePath) {
          const previewContent = this.#panelMount.querySelector<HTMLElement>(".preview-content");
          const markdownEditor = this.#panelMount.querySelector<HTMLElement>(".markdown-editor-surface");
          if (markdownEditor) {
            if (previewContent) {
              previewContent.scrollTop = readerViewport.scrollTop;
              previewContent.scrollLeft = readerViewport.scrollLeft;
            }
            return;
          }
          const editor = this.#panelMount.querySelector<HTMLTextAreaElement>(".code-editor");
          if (editor) {
            if (enteringEditor) {
              const computed = getComputedStyle(editor);
              const lineHeight = Number.parseFloat(computed.lineHeight);
              const paddingTop = Number.parseFloat(computed.paddingTop);
              const caret = firstVisibleLineOffset(
                editor.value,
                readerViewport.scrollTop,
                Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20.25,
                Number.isFinite(paddingTop) ? paddingTop : 20,
              );
              editor.setSelectionRange(caret, caret);
              editor.focus({ preventScroll: true });
            }
            editor.scrollTop = readerViewport.scrollTop;
            editor.scrollLeft = readerViewport.scrollLeft;
            this.#syncEditorScroll(editor);
            return;
          }
          if (previewContent) {
            previewContent.scrollTop = readerViewport.scrollTop;
            previewContent.scrollLeft = readerViewport.scrollLeft;
          }
        }
      });
    }
  }

  #render(): void {
    const focus = this.#captureFocus();
    this.toggleAttribute("data-file-active", this.#state.activePath !== null);
    this.toggleAttribute("data-editing", Boolean(this.#state.editor));
    this.#renderTabs();
    this.#renderPanel();
    this.#restoreFocus(focus);
    this.#scrollSelectedTabIntoView();
  }

  #renderTabs(): void {
    const fragment = this.ownerDocument.createDocumentFragment();
    const conversationSlot = this.ownerDocument.createElement("div");
    conversationSlot.className = `tab-slot conversation${this.#state.activePath === null ? " active" : ""}`;

    const conversationTab = this.ownerDocument.createElement("button");
    conversationTab.type = "button";
    conversationTab.className = "preview-tab";
    conversationTab.id = `cle-main-preview-${this.#instanceId}-conversation-tab`;
    conversationTab.setAttribute("role", "tab");
    conversationTab.setAttribute("aria-selected", String(this.#state.activePath === null));
    conversationTab.tabIndex = this.#rovingPath === null ? 0 : -1;
    conversationTab.dataset.tabKind = "conversation";
    conversationTab.append(this.#staticIcon(CONVERSATION_ICON, "tab-icon"), this.#textSpan("Conversation", "tab-label"));
    conversationSlot.append(conversationTab);
    fragment.append(conversationSlot);

    for (const view of this.#state.tabs) {
      const slot = this.ownerDocument.createElement("div");
      const active = view.path === this.#state.activePath;
      slot.className = `tab-slot file${active ? " active" : ""}`;

      const tab = this.ownerDocument.createElement("button");
      tab.type = "button";
      tab.className = "preview-tab";
      tab.id = this.#tabId(view.path);
      tab.title = view.path;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("aria-controls", this.#panelId(view.path));
      tab.tabIndex = this.#rovingPath === view.path ? 0 : -1;
      tab.dataset.tabKind = "file";
      tab.dataset.path = view.path;
      tab.append(this.#staticIcon(getFileIcon(view.name).markup, "tab-icon"), this.#textSpan(view.name, "tab-label"));

      const close = this.ownerDocument.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.title = `Close ${view.name}`;
      close.setAttribute("aria-label", `Close ${view.name}`);
      close.dataset.closePath = view.path;
      close.innerHTML = icons.close;
      slot.append(tab, close);
      fragment.append(slot);
    }

    this.#tabList.replaceChildren(fragment);
  }

  #renderPanel(): void {
    this.#cancelPdfPreview();
    this.#cancelOfficePreview();
    if (this.#state.activePath === null) {
      this.#panelMount.replaceChildren();
      return;
    }

    const view = this.#state.tabs.find((candidate) => candidate.path === this.#state.activePath);
    if (!view) {
      this.#panelMount.replaceChildren();
      return;
    }

    const panel = this.ownerDocument.createElement("section");
    panel.className = "preview-panel";
    panel.id = this.#panelId(view.path);
    panel.tabIndex = 0;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", this.#tabId(view.path));
    if (view.kind === "loading") panel.setAttribute("aria-busy", "true");

    const metaBar = this.ownerDocument.createElement("header");
    metaBar.className = "preview-meta-bar";
    metaBar.append(this.#staticIcon(getFileIcon(view.name).markup, "panel-icon"));
    const location = this.#textSpan(view.path, "preview-location");
    location.title = view.path;
    const editor = this.#state.editor?.path === view.path ? this.#state.editor : undefined;
    const markdownEditing = Boolean(
      editor &&
      (view.kind === "text" || view.kind === "empty") &&
      this.#state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) === true &&
      isMarkdownPreviewPath(view.path),
    );
    const markdownPreview = view.kind === "text" &&
      this.#state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) === true &&
      isMarkdownPreviewPath(view.path) &&
      !editor;
    const metadata = `${markdownEditing ? "Rendered Markdown edit · " : markdownPreview ? "Markdown preview · " : ""}${this.#metadataFor(view)}`;
    metaBar.append(location, this.#textSpan(metadata, "preview-metadata"));

    const content = this.ownerDocument.createElement("div");
    content.className = "preview-content";
    if (editor) content.classList.add("editor-mode");
    if (markdownEditing) content.classList.add("markdown-editor-mode");
    this.#renderViewContent(content, view, editor);
    panel.append(metaBar, content);
    this.#panelMount.replaceChildren(panel);
  }

  #renderViewContent(content: HTMLElement, view: MainPreviewFileView, editor?: MainPreviewEditorState): void {
    if (editor && (view.kind === "text" || view.kind === "empty")) {
      if (this.#state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) && isMarkdownPreviewPath(view.path)) {
        content.append(this.#markdownEditor(view, editor));
        this.#appendEditorError(content, view, editor);
        return;
      }
      const stack = this.ownerDocument.createElement("div");
      stack.className = "code-editor-stack";
      const lineNumbers = this.#lineNumberGutter(stack, editor.draft, "code-editor-line-numbers");
      const mirror = this.ownerDocument.createElement("pre");
      mirror.className = "code-editor-highlight";
      mirror.setAttribute("aria-hidden", "true");
      const code = this.#highlightedCode(view.path, editor.draft);
      mirror.append(code);

      const textarea = this.ownerDocument.createElement("textarea");
      textarea.className = "code-editor";
      textarea.value = editor.draft;
      textarea.maxLength = MAX_SYNTAX_SOURCE_UNITS;
      textarea.wrap = "off";
      textarea.spellcheck = false;
      textarea.autocomplete = "off";
      textarea.setAttribute("autocapitalize", "off");
      textarea.setAttribute("autocorrect", "off");
      textarea.setAttribute("aria-label", `Edit ${view.name}`);
      textarea.setAttribute("aria-busy", String(editor.saving));
      let acceptedDraft = editor.draft;
      textarea.addEventListener("input", () => {
        if (textarea.value.length > MAX_SYNTAX_SOURCE_UNITS) {
          const selectionStart = Math.min(textarea.selectionStart, acceptedDraft.length);
          const selectionEnd = Math.min(textarea.selectionEnd, acceptedDraft.length);
          textarea.value = acceptedDraft;
          textarea.setSelectionRange(selectionStart, selectionEnd, textarea.selectionDirection);
          return;
        }
        acceptedDraft = textarea.value;
        this.#replaceHighlightedSource(code, view.path, textarea.value);
        this.#replaceLineNumbers(lineNumbers, stack, textarea.value);
        this.#syncEditorScroll(textarea);
        this.#dispatchPathEvent<MainPreviewDraftDetail>(MAIN_PREVIEW_DRAFT_EVENT, { path: view.path, text: textarea.value });
      });
      textarea.addEventListener("scroll", () => this.#syncEditorScroll(textarea), { passive: true });
      textarea.addEventListener("compositionstart", () => stack.classList.add("composing"));
      textarea.addEventListener("compositionend", () => {
        this.#replaceHighlightedSource(code, view.path, textarea.value);
        stack.classList.remove("composing");
        this.#syncEditorScroll(textarea);
      });
      stack.append(lineNumbers, mirror, textarea);
      content.append(stack);
      this.#appendEditorError(content, view, editor);
      return;
    }
    switch (view.kind) {
      case "loading":
        content.append(this.#statePanel("Loading preview", "Reading this file from the local workspace.", "loading", view));
        return;
      case "text":
        if (view.text.length === 0) {
          content.append(this.#statePanel("Empty file", "This file is empty.", "empty", view));
          return;
        }
        if (this.#state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) && isMarkdownPreviewPath(view.path)) {
          content.append(this.#markdownReader(view));
          return;
        }
        {
          const reader = this.ownerDocument.createElement("div");
          reader.className = "code-reader";
          const lineNumbers = this.#lineNumberGutter(reader, view.text);
          const pre = this.ownerDocument.createElement("pre");
          pre.className = "literal-text";
          pre.setAttribute("aria-label", `${view.name} contents`);
          const code = this.#highlightedCode(view.path, view.text);
          pre.append(code);
          reader.append(lineNumbers, pre);
          content.append(reader);
        }
        return;
      case "image":
      case "video":
      case "pdf":
      case "audio":
      case "office":
        content.append(this.#mediaPreview(view));
        return;
      case "empty":
        content.append(this.#statePanel("Empty file", "This file is empty.", "empty", view));
        return;
      case "unsupported":
        content.append(this.#statePanel("Preview unavailable", unsupportedCopy(view.reason), "unsupported", view));
        return;
      case "error":
        content.append(
          this.#statePanel("File preview failed", view.message || "The file could not be loaded. Select it again to retry.", "error", view),
        );
    }
  }

  #mediaPreview(view: MainPreviewMediaView): HTMLElement {
    const previewerId = previewerIdForMediaKind(view.kind);
    if (!this.#state.enabledPreviewers?.includes(previewerId)) {
      return this.#statePanel("Preview unavailable", "Enable this file preview extension in Preview Market.", "unsupported", view);
    }

    if (view.kind === "pdf") return this.#pdfPreview(view);
    if (view.kind === "office") return this.#officePreview(view);

    let audioPreview: HTMLAudioElement | undefined;
    if (view.kind === "audio") {
      audioPreview = this.ownerDocument.createElement("audio");
      if (!audioPreview.canPlayType(view.mimeType)) {
        return this.#statePanel(
          "Audio preview unavailable",
          "This Codex build cannot play this audio format.",
          "unsupported",
          view,
        );
      }
    }

    const url = this.#mediaObjectUrl(view);
    if (!url) {
      return this.#statePanel("Media preview failed", "This file could not be prepared for preview.", "error", view);
    }

    const container = this.ownerDocument.createElement("div");
    container.className = "media-preview";
    container.dataset.kind = view.kind;
    if (view.kind === "image") {
      const image = this.ownerDocument.createElement("img");
      image.className = "media-preview-image";
      image.src = url;
      image.alt = view.name;
      image.draggable = false;
      container.append(image);
      return container;
    }

    if (view.kind === "audio") {
      const audio = audioPreview ?? this.ownerDocument.createElement("audio");
      audio.className = "media-preview-audio";
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";
      audio.autoplay = false;
      audio.setAttribute("aria-label", `Play ${view.name}`);
      audio.addEventListener("error", () => {
        if (!container.isConnected || this.#mediaObjectUrls.get(view.path)?.url !== url) return;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        this.#revokeMediaObjectUrl(view.path);
        container.replaceWith(
          this.#statePanel("Audio preview failed", "This audio file could not be played.", "error", view),
        );
      }, { once: true });
      container.append(audio);
      return container;
    }

    const video = this.ownerDocument.createElement("video");
    video.className = "media-preview-video";
    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.autoplay = false;
    video.setAttribute("aria-label", `Preview ${view.name}`);
    container.append(video);
    return container;
  }

  #pdfPreview(view: MainPreviewMediaView): HTMLElement {
    const container = this.ownerDocument.createElement("div");
    container.className = "media-preview";
    container.dataset.kind = "pdf";
    container.setAttribute("aria-label", `PDF preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");

    const documentPreview = this.ownerDocument.createElement("div");
    documentPreview.className = "media-preview-pdf";

    const toolbar = this.ownerDocument.createElement("nav");
    toolbar.className = "pdf-preview-toolbar";
    toolbar.setAttribute("aria-label", "PDF page navigation");

    const previous = this.ownerDocument.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.setAttribute("aria-label", "Show previous PDF page");
    previous.setAttribute("aria-disabled", "true");

    const pageStatus = this.ownerDocument.createElement("span");
    pageStatus.className = "pdf-page-status";
    pageStatus.setAttribute("role", "status");
    pageStatus.setAttribute("aria-live", "polite");
    pageStatus.textContent = "Loading PDF";

    const next = this.ownerDocument.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.setAttribute("aria-label", "Show next PDF page");
    next.setAttribute("aria-disabled", "true");
    toolbar.append(previous, pageStatus, next);

    const stage = this.ownerDocument.createElement("div");
    stage.className = "pdf-page-stage";
    stage.setAttribute("aria-label", `${view.name} page preview`);
    const loading = this.#textSpan("Loading PDF…", "pdf-preview-loading");
    loading.setAttribute("role", "status");
    stage.append(loading);
    documentPreview.append(toolbar, stage);
    container.append(documentPreview);

    const job: PdfPreviewJob = {
      generation: ++this.#pdfGeneration,
      data: null,
      loadingTask: null,
      document: null,
      renderTask: null,
      pageGeneration: 0,
    };
    this.#pdfJob = job;
    let pageNumber = 1;
    let pageCount = 0;
    let pageBusy = true;

    const isCurrent = (): boolean =>
      this.#connected && this.#pdfJob === job && this.#pdfGeneration === job.generation && container.isConnected;

    const updateControls = (busy: boolean): void => {
      pageBusy = busy;
      previous.setAttribute("aria-disabled", String(busy || pageNumber <= 1));
      next.setAttribute("aria-disabled", String(busy || pageNumber >= pageCount));
      pageStatus.textContent = pageCount > 0 ? `Page ${pageNumber} of ${pageCount}` : "Loading PDF";
      container.setAttribute("aria-busy", String(busy));
    };

    const releaseJob = (): void => {
      job.pageGeneration += 1;
      job.renderTask?.cancel();
      job.renderTask = null;
      job.data = null;
      const cleanup = job.loadingTask?.destroy() ?? job.document?.destroy();
      job.loadingTask = null;
      job.document = null;
      if (cleanup) void cleanup.catch(() => undefined);
    };

    const showError = (message: string): void => {
      if (!isCurrent()) return;
      const error = this.#textSpan(message, "pdf-page-error");
      error.setAttribute("role", "alert");
      stage.replaceChildren(error);
      pageStatus.textContent = "Preview unavailable";
      pageBusy = true;
      previous.setAttribute("aria-disabled", "true");
      next.setAttribute("aria-disabled", "true");
      container.setAttribute("aria-busy", "false");
      releaseJob();
    };

    const renderPage = async (requestedPage: number): Promise<void> => {
      const document = job.document;
      if (!document || !isCurrent()) return;
      const targetPage = Math.max(1, Math.min(pageCount, requestedPage));
      const pageGeneration = ++job.pageGeneration;
      job.renderTask?.cancel();
      job.renderTask = null;
      pageNumber = targetPage;
      updateControls(true);
      const rendering = this.#textSpan(`Rendering page ${targetPage}…`, "pdf-preview-loading");
      rendering.setAttribute("role", "status");
      stage.replaceChildren(rendering);

      let page: PDFPageProxy | undefined;
      try {
        page = await document.getPage(targetPage);
        if (!isCurrent() || pageGeneration !== job.pageGeneration) return;

        if (stage.clientWidth <= 0) {
          await new Promise<void>((resolve) => {
            const window = this.ownerDocument.defaultView;
            if (window) window.requestAnimationFrame(() => resolve());
            else setTimeout(resolve, 0);
          });
        }
        if (!isCurrent() || pageGeneration !== job.pageGeneration) return;

        const baseViewport = page.getViewport({ scale: 1 });
        if (
          !Number.isFinite(baseViewport.width) ||
          !Number.isFinite(baseViewport.height) ||
          baseViewport.width <= 0 ||
          baseViewport.height <= 0
        ) {
          throw new Error("Invalid PDF page dimensions");
        }
        const window = this.ownerDocument.defaultView;
        const computed = window?.getComputedStyle(stage);
        const horizontalPadding = computed
          ? (Number.parseFloat(computed.paddingLeft) || 0) + (Number.parseFloat(computed.paddingRight) || 0)
          : 0;
        const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
        const fitScale = availableWidth / baseViewport.width;
        const baseArea = baseViewport.width * baseViewport.height;
        if (!Number.isFinite(baseArea) || baseArea <= 0) throw new Error("Invalid PDF page area");
        const canvasAreaScale = Math.sqrt(MAX_PDF_CANVAS_PIXELS / baseArea);
        const canvasDimensionScale = Math.min(
          MAX_PDF_CANVAS_DIMENSION / baseViewport.width,
          MAX_PDF_CANVAS_DIMENSION / baseViewport.height,
        );
        const cssScale = Math.min(MAX_PDF_CSS_SCALE, fitScale, canvasAreaScale, canvasDimensionScale);
        if (!Number.isFinite(cssScale) || cssScale <= 0) throw new Error("Invalid PDF page scale");
        const viewport = page.getViewport({ scale: cssScale });
        const viewportArea = viewport.width * viewport.height;
        if (
          !Number.isFinite(viewport.width) ||
          !Number.isFinite(viewport.height) ||
          !Number.isFinite(viewportArea) ||
          viewport.width <= 0 ||
          viewport.height <= 0 ||
          viewportArea <= 0
        ) {
          throw new Error("Invalid PDF canvas dimensions");
        }
        const requestedOutputScale = Math.min(MAX_PDF_OUTPUT_SCALE, Math.max(1, window?.devicePixelRatio ?? 1));
        const outputAreaScale = Math.sqrt(MAX_PDF_CANVAS_PIXELS / viewportArea);
        const outputDimensionScale = Math.min(
          MAX_PDF_CANVAS_DIMENSION / viewport.width,
          MAX_PDF_CANVAS_DIMENSION / viewport.height,
        );
        const outputScale = Math.min(requestedOutputScale, outputAreaScale, outputDimensionScale);
        if (!Number.isFinite(outputScale) || outputScale <= 0) throw new Error("Invalid PDF output scale");
        const bitmapWidth = Math.floor(viewport.width * outputScale);
        const bitmapHeight = Math.floor(viewport.height * outputScale);
        const bitmapArea = bitmapWidth * bitmapHeight;
        if (
          !Number.isSafeInteger(bitmapWidth) ||
          !Number.isSafeInteger(bitmapHeight) ||
          !Number.isSafeInteger(bitmapArea) ||
          bitmapWidth < 1 ||
          bitmapHeight < 1 ||
          bitmapWidth > MAX_PDF_CANVAS_DIMENSION ||
          bitmapHeight > MAX_PDF_CANVAS_DIMENSION ||
          bitmapArea > MAX_PDF_CANVAS_PIXELS
        ) {
          throw new Error("PDF canvas exceeds preview limits");
        }

        const canvas = this.ownerDocument.createElement("canvas");
        canvas.className = "pdf-page-canvas";
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${view.name}, page ${targetPage} of ${pageCount}`);
        stage.replaceChildren(canvas);

        const renderTask = page.render({
          canvas,
          viewport,
          annotationMode: AnnotationMode.DISABLE,
          ...(outputScale === 1 ? {} : { transform: [outputScale, 0, 0, outputScale, 0, 0] }),
        });
        job.renderTask = renderTask;
        await renderTask.promise;
        if (!isCurrent() || pageGeneration !== job.pageGeneration) return;
        job.renderTask = null;
        updateControls(false);
      } catch (error) {
        const cancelled = error instanceof Error && error.name === "RenderingCancelledException";
        if (!cancelled && isCurrent() && pageGeneration === job.pageGeneration) {
          showError("This PDF page could not be rendered.");
        }
      } finally {
        page?.cleanup();
      }
    };

    previous.addEventListener("click", () => {
      if (!pageBusy && pageNumber > 1) void renderPage(pageNumber - 1);
    });
    next.addEventListener("click", () => {
      if (!pageBusy && pageNumber < pageCount) void renderPage(pageNumber + 1);
    });

    queueMicrotask(() => {
      void (async () => {
        if (!isCurrent()) return;
        try {
          const data = view.bytes.slice();
          job.data = data;
          const loadingTask = getDocument({
            data,
            ownerDocument: this.ownerDocument,
            verbosity: VerbosityLevel.ERRORS,
            isEvalSupported: false,
            enableXfa: false,
            useWorkerFetch: false,
            useWasm: false,
          });
          job.data = null;
          job.loadingTask = loadingTask;
          const document = await loadingTask.promise;
          if (!isCurrent()) {
            if (job.loadingTask === loadingTask) releaseJob();
            return;
          }
          job.document = document;
          pageCount = document.numPages;
          if (pageCount < 1) {
            showError("This PDF does not contain any pages.");
            return;
          }
          updateControls(true);
          await renderPage(1);
        } catch (error) {
          job.data = null;
          if (!isCurrent()) return;
          const passwordProtected = error instanceof Error && error.name === "PasswordException";
          showError(passwordProtected ? "Password-protected PDFs cannot be previewed." : "This PDF could not be opened.");
        }
      })();
    });
    return container;
  }

  #cancelPdfPreview(): void {
    this.#pdfGeneration += 1;
    const job = this.#pdfJob;
    this.#pdfJob = null;
    if (!job) return;
    job.pageGeneration += 1;
    job.renderTask?.cancel();
    job.renderTask = null;
    job.data = null;
    const cleanup = job.loadingTask?.destroy() ?? job.document?.destroy();
    if (cleanup) void cleanup.catch(() => undefined);
    job.loadingTask = null;
    job.document = null;
  }

  #officePreview(view: MainPreviewMediaView): HTMLElement {
    const documentKind = officeDocumentKind(view.mimeType);
    if (!documentKind) {
      return this.#statePanel("Office preview unavailable", "This Office file type is not supported.", "unsupported", view);
    }

    const container = this.ownerDocument.createElement("div");
    container.className = "office-preview";
    container.dataset.kind = documentKind;
    container.setAttribute("aria-label", `${documentKind.toUpperCase()} preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");

    const stage = this.ownerDocument.createElement("div");
    stage.className = "office-preview-stage";
    const loading = this.#textSpan(`Loading ${documentKind.toUpperCase()}\u2026`, "office-preview-loading");
    loading.setAttribute("role", "status");
    stage.append(loading);
    container.append(stage);

    const job: OfficePreviewJob = {
      generation: ++this.#officeGeneration,
      abortController: new AbortController(),
      viewer: null,
      legacyPptRoot: null,
      legacyPptWorker: null,
      nativePptObjectUrl: null,
      resourceObserver: null,
      docxRepairTimer: null,
    };
    this.#officeJob = job;

    const isCurrent = (): boolean =>
      this.#connected &&
      this.#officeJob === job &&
      this.#officeGeneration === job.generation &&
      !job.abortController.signal.aborted &&
      container.isConnected;

    const showError = (message: string): void => {
      if (!isCurrent()) return;
      job.resourceObserver?.disconnect();
      job.resourceObserver = null;
      job.viewer?.destroy();
      job.viewer = null;
      job.legacyPptWorker?.terminate();
      job.legacyPptWorker = null;
      job.legacyPptRoot?.unmount();
      job.legacyPptRoot = null;
      job.nativePptObjectUrl?.revoke();
      job.nativePptObjectUrl = null;
      container.setAttribute("aria-busy", "false");
      stage.replaceChildren(this.#statePanel("Office preview failed", message, "error", view));
    };

    queueMicrotask(() => {
      void (async () => {
        if (!isCurrent()) return;
        try {
          if (documentKind === "docx") {
            await this.#renderDocxOffice(view, container, stage, job, isCurrent);
          } else if (documentKind === "xlsx") {
            await this.#renderXlsxOffice(view, container, stage, job, isCurrent);
          } else if (documentKind === "ppt") {
            if (view.mimeType === NATIVE_POWERPOINT_PREVIEW_MIME) {
              await this.#renderNativePptOffice(view, container, stage, job, isCurrent);
            } else {
              await this.#renderLegacyPptOffice(view, container, stage, job, isCurrent);
            }
          } else {
            await this.#renderPptxOffice(view, container, stage, job, isCurrent);
          }
          if (isCurrent()) container.setAttribute("aria-busy", "false");
        } catch (error) {
          if (!isCurrent()) return;
          const message = error instanceof Error && error.name === "AbortError"
            ? "The preview was cancelled."
            : error instanceof Error && error.name === "ExternalOfficeResourceError"
              ? "This Office file contains external links and cannot be previewed safely."
              : `This ${documentKind.toUpperCase()} file could not be opened.`;
          showError(message);
        }
      })();
    });

    return container;
  }

  async #renderDocxOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const docxClassName = `cle-docx-${job.generation}`;
    const documentRoot = this.ownerDocument.createElement("article");
    documentRoot.className = "office-word-document";
    const generatedStyleHost = this.ownerDocument.createElement("div");
    const previewBytes = await this.#prepareDocxPreviewBytes(view.bytes, job.abortController.signal);

    await renderDocxAsync(previewBytes.slice(), documentRoot, generatedStyleHost, {
      inWrapper: true,
      hideWrapperOnPrint: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: true,
      breakPages: true,
      debug: false,
      experimental: true,
      className: docxClassName,
      trimXmlDeclaration: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
      renderChanges: true,
      renderComments: false,
      renderAltChunks: false,
    });
    if (!isCurrent()) return;
    const generatedStyles = this.#takeSanitizedDocxStyles(generatedStyleHost, docxClassName);
    for (const style of documentRoot.querySelectorAll("style")) style.remove();
    this.#sanitizeDetachedDocx(documentRoot);
    this.#captureDocxPreviewMarkers(documentRoot);
    const truncated = this.#boundOfficeDom(documentRoot);
    const documentCost = this.#officeDomCost(documentRoot, false);
    const domBudget: OfficeDomBudget = {
      remainingNodes: Math.max(0, MAX_OFFICE_DOM_NODES - documentCost.nodes),
      remainingTextUnits: Math.max(0, MAX_OFFICE_TEXT_UNITS - documentCost.textUnits),
    };
    if (!isCurrent()) return;
    stage.replaceChildren(...generatedStyles, documentRoot);
    await this.#settleDocxLayout(documentRoot, job.abortController.signal);
    if (!isCurrent()) return;
    await this.#paginateDocxOverflowPages(
      documentRoot,
      docxClassName,
      job.abortController.signal,
      domBudget,
    );
    if (!isCurrent()) return;
    this.#renumberDocxCachedPageFooters(documentRoot, docxClassName, domBudget);
    this.#observeOfficeResources(documentRoot, job);
    this.#observeLateDocxLayout(documentRoot, docxClassName, job, domBudget);
    if (truncated) {
      const notice = this.#textSpan("Preview limited for performance.", "office-preview-notice");
      notice.setAttribute("role", "status");
      container.append(notice);
    }
  }

  async #prepareDocxPreviewBytes(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    try {
      this.#throwIfOfficeAborted(signal);
      const archive = await JSZip.loadAsync(bytes.slice(), { checkCRC32: false, createFolders: false });
      this.#throwIfOfficeAborted(signal);
      const documentEntry = archive.file("word/document.xml");
      if (!documentEntry) return bytes;
      const document = await this.#readXlsxXmlEntry(
        documentEntry,
        MAX_DOCX_DOCUMENT_XML_BYTES,
        signal,
        "Word document",
      );
      let styles: Document | null = null;
      const stylesEntry = archive.file("word/styles.xml");
      if (stylesEntry) {
        try {
          styles = await this.#readXlsxXmlEntry(
            stylesEntry,
            MAX_DOCX_STYLES_XML_BYTES,
            signal,
            "Word styles",
          );
        } catch {
          this.#throwIfOfficeAborted(signal);
          styles = null;
        }
      }
      const Serializer = this.ownerDocument.defaultView?.XMLSerializer;
      if (!Serializer) return bytes;

      const body = Array.from(document.documentElement.children).find(
        (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "body",
      );
      if (!body) return bytes;
      const isMainFlowParagraph = (paragraph: Element): boolean => {
        let ancestor = paragraph.parentElement;
        while (ancestor && ancestor !== body) {
          if (
            ancestor.namespaceURI === DOCX_WORD_NAMESPACE &&
            ["tbl", "txbxContent"].includes(ancestor.localName)
          ) {
            return false;
          }
          ancestor = ancestor.parentElement;
        }
        return ancestor === body;
      };
      const paragraphs = Array.from(document.getElementsByTagNameNS(DOCX_WORD_NAMESPACE, "p"))
        .filter(isMainFlowParagraph);
      const pageBreakParagraphs: Element[] = [];
      const sectionBreakParagraphs: Element[] = [];
      const tableHeaderRows: Element[] = [];
      const keepNextParagraphs: Element[] = [];
      type DocxFlowToken = "boundary" | "content";
      const isWordElement = (element: Element | null, localName: string): boolean =>
        element?.namespaceURI === DOCX_WORD_NAMESPACE && element.localName === localName;
      const wordChild = (parent: Element | null | undefined, localName: string): Element | null => (
        parent
          ? Array.from(parent.children).find(
            (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === localName,
          ) ?? null
          : null
      );
      const wordAttribute = (element: Element | null | undefined, localName: string): string | null => (
        element?.getAttributeNS(DOCX_WORD_NAMESPACE, localName) ??
        element?.getAttribute(`w:${localName}`) ??
        element?.getAttribute(localName) ??
        null
      );
      const isEnabledWordValue = (value: string | null, defaultValue = true): boolean => {
        if (value === null) return defaultValue;
        return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
      };
      const keepNextValue = (properties: Element | null | undefined): boolean | null => {
        const keepNext = wordChild(properties, "keepNext");
        return keepNext ? isEnabledWordValue(wordAttribute(keepNext, "val")) : null;
      };
      const paragraphFlowTokens = (paragraph: Element): DocxFlowToken[] => {
        const tokens: DocxFlowToken[] = [];
        const visibleElements = new Set([
          "cr",
          "drawing",
          "endnoteReference",
          "footnoteReference",
          "noBreakHyphen",
          "object",
          "pict",
          "softHyphen",
          "sym",
          "tab",
        ]);
        const visit = (parent: Element): void => {
          for (const child of Array.from(parent.children)) {
            if (child.namespaceURI !== DOCX_WORD_NAMESPACE) continue;
            if (["pPr", "rPr"].includes(child.localName)) continue;
            if (isWordElement(child, "lastRenderedPageBreak")) {
              tokens.push("boundary");
              continue;
            }
            if (isWordElement(child, "br")) {
              const type = (
                child.getAttributeNS(DOCX_WORD_NAMESPACE, "type") ??
                child.getAttribute("w:type") ??
                child.getAttribute("type") ??
                ""
              ).trim();
              tokens.push(type === "page" ? "boundary" : "content");
              continue;
            }
            if (isWordElement(child, "t")) {
              if ((child.textContent ?? "").trim().length > 0) tokens.push("content");
              continue;
            }
            if (visibleElements.has(child.localName)) {
              tokens.push("content");
              continue;
            }
            visit(child);
          }
        };
        visit(paragraph);
        return tokens;
      };
      const beginsWithPageBreak = (paragraph: Element): boolean =>
        paragraphFlowTokens(paragraph)[0] === "boundary";
      const endsWithPageBreak = (paragraph: Element): boolean => {
        const tokens = paragraphFlowTokens(paragraph);
        return tokens[tokens.length - 1] === "boundary";
      };
      const hasEnabledTableHeader = (row: Element): boolean => {
        const properties = Array.from(row.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "trPr",
        );
        const header = properties && Array.from(properties.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "tblHeader",
        );
        if (!header) return false;
        const value = (
          header.getAttributeNS(DOCX_WORD_NAMESPACE, "val") ??
          header.getAttribute("w:val") ??
          header.getAttribute("val") ??
          "true"
        ).trim().toLowerCase();
        return !["0", "false", "off", "no"].includes(value);
      };
      for (const table of Array.from(document.getElementsByTagNameNS(DOCX_WORD_NAMESPACE, "tbl"))) {
        const rows = Array.from(table.children).filter(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "tr",
        );
        for (const row of rows) {
          if (!hasEnabledTableHeader(row)) break;
          tableHeaderRows.push(row);
          if (tableHeaderRows.length > MAX_DOCX_AUTO_TABLE_ROWS) return bytes;
        }
      }

      type DocxParagraphStyle = {
        readonly basedOn: string | null;
        readonly ownKeepNext: boolean | null;
      };
      const paragraphStyles = new Map<string, DocxParagraphStyle>();
      let documentDefaultKeepNext = false;
      let defaultParagraphStyleId: string | null = null;
      if (styles) {
        const docDefaults = wordChild(styles.documentElement, "docDefaults");
        const paragraphDefaults = wordChild(wordChild(docDefaults, "pPrDefault"), "pPr");
        documentDefaultKeepNext = keepNextValue(paragraphDefaults) ?? false;
        for (const style of Array.from(styles.getElementsByTagNameNS(DOCX_WORD_NAMESPACE, "style"))) {
          if ((wordAttribute(style, "type") ?? "").trim() !== "paragraph") continue;
          const styleId = (wordAttribute(style, "styleId") ?? "").trim();
          if (!styleId) continue;
          const basedOn = (wordAttribute(wordChild(style, "basedOn"), "val") ?? "").trim() || null;
          paragraphStyles.set(styleId, {
            basedOn,
            ownKeepNext: keepNextValue(wordChild(style, "pPr")),
          });
          if (
            defaultParagraphStyleId === null &&
            isEnabledWordValue(wordAttribute(style, "default"), false)
          ) {
            defaultParagraphStyleId = styleId;
          }
        }
      }
      if (defaultParagraphStyleId === null && paragraphStyles.has("Normal")) {
        defaultParagraphStyleId = "Normal";
      }
      const resolvedStyleKeepNext = new Map<string, boolean>();
      const resolveStyleKeepNext = (styleId: string | null): boolean => {
        if (!styleId) return documentDefaultKeepNext;
        const cached = resolvedStyleKeepNext.get(styleId);
        if (cached !== undefined) return cached;
        const path: string[] = [];
        const seen = new Set<string>();
        let cursor: string | null = styleId;
        let inherited = documentDefaultKeepNext;
        while (cursor) {
          const inheritedFromCache = resolvedStyleKeepNext.get(cursor);
          if (inheritedFromCache !== undefined) {
            inherited = inheritedFromCache;
            break;
          }
          if (seen.has(cursor)) break;
          seen.add(cursor);
          path.push(cursor);
          cursor = paragraphStyles.get(cursor)?.basedOn ?? null;
        }
        for (let pathIndex = path.length - 1; pathIndex >= 0; pathIndex -= 1) {
          const pathStyleId = path[pathIndex];
          if (!pathStyleId) continue;
          const ownKeepNext = paragraphStyles.get(pathStyleId)?.ownKeepNext ?? null;
          if (ownKeepNext !== null) inherited = ownKeepNext;
          resolvedStyleKeepNext.set(pathStyleId, inherited);
        }
        return resolvedStyleKeepNext.get(styleId) ?? inherited;
      };
      const defaultParagraphKeepNext = resolveStyleKeepNext(defaultParagraphStyleId);
      for (const paragraph of paragraphs) {
        const properties = wordChild(paragraph, "pPr");
        const directKeepNext = keepNextValue(properties);
        const styleId = (wordAttribute(wordChild(properties, "pStyle"), "val") ?? "").trim();
        const inheritedKeepNext = styleId
          ? resolveStyleKeepNext(styleId)
          : defaultParagraphKeepNext;
        if (
          (directKeepNext ?? inheritedKeepNext) &&
          keepNextParagraphs.length < MAX_DOCX_KEEP_NEXT_PARAGRAPHS
        ) {
          keepNextParagraphs.push(paragraph);
        }
      }
      // docx-preview 0.4 parses direct pageBreakBefore properties but only
      // paginates the style-level equivalent. Convert them in this preview copy.
      for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
        const paragraph = paragraphs[paragraphIndex];
        if (!paragraph) continue;
        const properties = Array.from(paragraph.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "pPr",
        );
        const pageBreakBefore = properties && Array.from(properties.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "pageBreakBefore",
        );
        if (!pageBreakBefore) continue;
        const value = (
          pageBreakBefore.getAttributeNS(DOCX_WORD_NAMESPACE, "val") ??
          pageBreakBefore.getAttribute("w:val") ??
          pageBreakBefore.getAttribute("val") ??
          "true"
        ).trim().toLowerCase();
        if (["0", "false", "off", "no"].includes(value)) continue;
        pageBreakBefore.remove();
        const previousBlock = paragraph.previousElementSibling;
        const alreadyAtPageStart = previousBlock === null || beginsWithPageBreak(paragraph) || (
          previousBlock !== null &&
          isWordElement(previousBlock, "p") &&
          endsWithPageBreak(previousBlock)
        );
        if (alreadyAtPageStart) continue;
        pageBreakParagraphs.push(paragraph);
        if (pageBreakParagraphs.length > MAX_DOCX_DIRECT_PAGE_BREAKS) return bytes;
      }
      const pageBreakParagraphSet = new Set(pageBreakParagraphs);

      // The library also ignores same-size paragraph section transitions.
      // Preserve next-page section semantics with a preview-only hard break.
      const finalSectionProperties = Array.from(body.children).find(
        (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "sectPr",
      );
      const pageSizeSignature = (sectionProperties: Element | undefined): string | null => {
        const pageSize = sectionProperties && Array.from(sectionProperties.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "pgSz",
        );
        if (!pageSize) return null;
        return ["w", "h", "orient"].map((attribute) => (
          pageSize.getAttributeNS(DOCX_WORD_NAMESPACE, attribute) ??
          pageSize.getAttribute(`w:${attribute}`) ??
          pageSize.getAttribute(attribute) ??
          ""
        )).join("|");
      };
      for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
        const paragraph = paragraphs[paragraphIndex];
        if (!paragraph) continue;
        const properties = Array.from(paragraph.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "pPr",
        );
        const sectionProperties = properties && Array.from(properties.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "sectPr",
        );
        if (!sectionProperties) continue;
        const sectionType = Array.from(sectionProperties.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "type",
        );
        const value = (
          sectionType?.getAttributeNS(DOCX_WORD_NAMESPACE, "val") ??
          sectionType?.getAttribute("w:val") ??
          sectionType?.getAttribute("val") ??
          "nextPage"
        ).trim();
        if (value !== "nextPage") continue;
        let nextSectionProperties = finalSectionProperties;
        for (let nextIndex = paragraphIndex + 1; nextIndex < paragraphs.length; nextIndex += 1) {
          const nextParagraph = paragraphs[nextIndex];
          if (!nextParagraph) continue;
          const nextProperties = Array.from(nextParagraph.children).find(
            (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "pPr",
          );
          const candidate = nextProperties && Array.from(nextProperties.children).find(
            (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "sectPr",
          );
          if (candidate) {
            nextSectionProperties = candidate;
            break;
          }
        }
        const currentPageSize = pageSizeSignature(sectionProperties);
        const nextPageSize = pageSizeSignature(nextSectionProperties);
        if (currentPageSize && nextPageSize && currentPageSize !== nextPageSize) continue;
        const nextBlock = paragraph.nextElementSibling;
        if (
          endsWithPageBreak(paragraph) ||
          (
            nextBlock !== null &&
            isWordElement(nextBlock, "p") &&
            (beginsWithPageBreak(nextBlock) || pageBreakParagraphSet.has(nextBlock))
          )
        ) {
          continue;
        }
        sectionBreakParagraphs.push(paragraph);
        if (pageBreakParagraphs.length + sectionBreakParagraphs.length > MAX_DOCX_DIRECT_PAGE_BREAKS) {
          return bytes;
        }
      }
      if (
        pageBreakParagraphs.length === 0 &&
        sectionBreakParagraphs.length === 0 &&
        tableHeaderRows.length === 0 &&
        keepNextParagraphs.length === 0
      ) {
        return bytes;
      }

      const prefix = document.documentElement.lookupPrefix(DOCX_WORD_NAMESPACE) ?? "w";
      if (document.documentElement.lookupNamespaceURI(prefix) !== DOCX_WORD_NAMESPACE) {
        document.documentElement.setAttributeNS(XMLNS_NAMESPACE, `xmlns:${prefix}`, DOCX_WORD_NAMESPACE);
      }
      const name = (localName: string): string => `${prefix}:${localName}`;
      const createPageBreakRun = (): Element => {
        const run = document.createElementNS(DOCX_WORD_NAMESPACE, name("r"));
        const pageBreak = document.createElementNS(DOCX_WORD_NAMESPACE, name("br"));
        pageBreak.setAttributeNS(DOCX_WORD_NAMESPACE, name("type"), "page");
        run.append(pageBreak);
        return run;
      };
      const createPageBreakParagraph = (): Element => {
        const breakParagraph = document.createElementNS(DOCX_WORD_NAMESPACE, name("p"));
        breakParagraph.append(createPageBreakRun());
        return breakParagraph;
      };
      for (const paragraph of pageBreakParagraphs) {
        const parent = paragraph.parentNode;
        if (parent) parent.insertBefore(createPageBreakParagraph(), paragraph);
      }
      for (const paragraph of sectionBreakParagraphs) {
        paragraph.append(createPageBreakRun());
      }

      const usedBookmarkIds = new Set(
        Array.from(document.getElementsByTagNameNS(DOCX_WORD_NAMESPACE, "bookmarkStart"))
          .map((bookmark) => (
            bookmark.getAttributeNS(DOCX_WORD_NAMESPACE, "id") ??
            bookmark.getAttribute("w:id") ??
            bookmark.getAttribute("id") ??
            ""
          )),
      );
      let nextBookmarkId = 2_000_000_000;
      const addBookmarkMarker = (paragraph: Element, markerName: string): void => {
        while (usedBookmarkIds.has(String(nextBookmarkId))) nextBookmarkId += 1;
        const bookmarkId = String(nextBookmarkId);
        nextBookmarkId += 1;
        usedBookmarkIds.add(bookmarkId);
        const bookmarkStart = document.createElementNS(DOCX_WORD_NAMESPACE, name("bookmarkStart"));
        bookmarkStart.setAttributeNS(DOCX_WORD_NAMESPACE, name("id"), bookmarkId);
        bookmarkStart.setAttributeNS(DOCX_WORD_NAMESPACE, name("name"), markerName);
        const bookmarkEnd = document.createElementNS(DOCX_WORD_NAMESPACE, name("bookmarkEnd"));
        bookmarkEnd.setAttributeNS(DOCX_WORD_NAMESPACE, name("id"), bookmarkId);
        const firstContent = Array.from(paragraph.children).find(
          (child) => !(child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "pPr"),
        ) ?? null;
        paragraph.insertBefore(bookmarkStart, firstContent);
        paragraph.insertBefore(bookmarkEnd, firstContent);
      };
      for (let rowIndex = 0; rowIndex < tableHeaderRows.length; rowIndex += 1) {
        const row = tableHeaderRows[rowIndex];
        const firstCell = row && Array.from(row.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "tc",
        );
        const firstParagraph = firstCell && Array.from(firstCell.children).find(
          (child) => child.namespaceURI === DOCX_WORD_NAMESPACE && child.localName === "p",
        );
        if (!firstParagraph) continue;
        addBookmarkMarker(firstParagraph, `${DOCX_TABLE_HEADER_MARKER_PREFIX}${rowIndex}`);
      }
      for (let paragraphIndex = 0; paragraphIndex < keepNextParagraphs.length; paragraphIndex += 1) {
        const paragraph = keepNextParagraphs[paragraphIndex];
        if (paragraph) {
          addBookmarkMarker(paragraph, `${DOCX_KEEP_NEXT_MARKER_PREFIX}${paragraphIndex}`);
        }
      }

      const serialized = new Serializer().serializeToString(document);
      archive.file("word/document.xml", serialized);
      const prepared = await archive.generateAsync(
        { type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } },
        () => this.#throwIfOfficeAborted(signal),
      );
      this.#throwIfOfficeAborted(signal);
      return prepared.byteLength <= MAX_DOCX_PREPARED_BYTES ? prepared : bytes;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return bytes;
    }
  }

  #captureDocxPreviewMarkers(root: HTMLElement): void {
    const markers = Array.from(root.querySelectorAll<HTMLElement>("[id]")).filter(
      (element) => (
        element.id.startsWith(DOCX_TABLE_HEADER_MARKER_PREFIX) ||
        element.id.startsWith(DOCX_KEEP_NEXT_MARKER_PREFIX)
      ),
    );
    for (const marker of markers) {
      if (marker.id.startsWith(DOCX_TABLE_HEADER_MARKER_PREFIX)) {
        const row = marker.closest<HTMLTableRowElement>("tr");
        if (row) row.dataset.cleDocxTableHeader = "true";
      } else {
        const paragraph = marker.closest<HTMLParagraphElement>("p");
        if (paragraph) paragraph.dataset.cleDocxKeepNext = "true";
      }
      marker.remove();
    }
  }

  async #settleDocxLayout(root: HTMLElement, signal: AbortSignal): Promise<void> {
    await Promise.all([
      this.#waitOfficeDelay(DOCX_LAYOUT_SETTLE_MILLISECONDS, signal),
      this.#waitForDocxImages(root, signal),
    ]);
    await this.#yieldOfficeAnimationFrame(signal);
    await this.#yieldOfficeAnimationFrame(signal);
    this.#throwIfOfficeAborted(signal);
    void root.getBoundingClientRect();
  }

  async #waitForDocxImages(root: HTMLElement, signal: AbortSignal): Promise<void> {
    this.#throwIfOfficeAborted(signal);
    const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"))
      .slice(0, MAX_DOCX_SETTLE_IMAGES);
    if (images.length === 0) return;

    const decoding = Promise.allSettled(images.map(async (image) => {
      try {
        if (typeof image.decode === "function") await image.decode();
      } catch {
        // A corrupt image must not prevent the rest of the document from rendering.
      }
    }));
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error): void => {
        if (finished) return;
        finished = true;
        globalThis.clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = (): void => finish(this.#officeAbortError());
      const timer = globalThis.setTimeout(() => finish(), DOCX_IMAGE_SETTLE_MILLISECONDS);
      signal.addEventListener("abort", onAbort, { once: true });
      void decoding.then(() => finish());
    });
  }

  async #waitOfficeDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    this.#throwIfOfficeAborted(signal);
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        globalThis.clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(this.#officeAbortError());
      };
      const timer = globalThis.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async #yieldOfficeAnimationFrame(signal: AbortSignal): Promise<void> {
    this.#throwIfOfficeAborted(signal);
    const window = this.ownerDocument.defaultView;
    if (!window) {
      await this.#waitOfficeDelay(0, signal);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error): void => {
        if (finished) return;
        finished = true;
        window.cancelAnimationFrame(frame);
        window.clearTimeout(fallback);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = (): void => finish(this.#officeAbortError());
      const frame = window.requestAnimationFrame(() => finish());
      const fallback = window.setTimeout(() => finish(), 100);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  #renumberDocxCachedPageFooters(
    root: HTMLElement,
    className: string,
    domBudget: OfficeDomBudget,
  ): void {
    const wrapperClassName = `${className}-wrapper`;
    const pages = Array.from(root.querySelectorAll<HTMLElement>(`section.${className}`)).filter(
      (page) => page.parentElement?.classList.contains(wrapperClassName),
    );
    let nextPageNumber: number | null = null;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      if (!page) continue;
      if (
        page.classList.contains("office-word-unpaginated") ||
        page.classList.contains("office-word-oversized")
      ) {
        break;
      }
      let pageNumberNode: Node | null = null;
      let cachedPageNumber: number | null = null;
      for (const footer of Array.from(page.children).filter((child) => child.tagName === "FOOTER")) {
        const text = (footer.textContent ?? "").replace(/\s+/g, " ").trim();
        const match = text.match(/^[-\u2013\u2014]\s*(\d+)\s*[-\u2013\u2014]$/);
        if (!match) continue;
        cachedPageNumber = Number.parseInt(match[1] ?? "", 10);
        if (!Number.isFinite(cachedPageNumber)) continue;
        const pending: Node[] = Array.from(footer.childNodes);
        while (pending.length > 0 && !pageNumberNode) {
          const node = pending.shift();
          if (!node) continue;
          if (node.nodeType === Node.TEXT_NODE && /\d+/.test(node.nodeValue ?? "")) {
            pageNumberNode = node;
            break;
          }
          pending.unshift(...Array.from(node.childNodes));
        }
        if (pageNumberNode) break;
      }
      if (nextPageNumber === null && cachedPageNumber !== null) nextPageNumber = cachedPageNumber;
      if (pageNumberNode && nextPageNumber !== null) {
        const currentValue = pageNumberNode.nodeValue ?? "";
        const replacement = String(nextPageNumber);
        const currentDigits = currentValue.match(/\d+/)?.[0] ?? "";
        const growth = Math.max(0, replacement.length - currentDigits.length);
        if (growth > domBudget.remainingTextUnits) break;
        domBudget.remainingTextUnits -= growth;
        pageNumberNode.nodeValue = currentValue.replace(/\d+/, replacement);
      }
      if (nextPageNumber !== null) nextPageNumber += 1;
    }
  }

  #observeLateDocxLayout(
    root: HTMLElement,
    className: string,
    job: OfficePreviewJob,
    domBudget: OfficeDomBudget,
  ): void {
    const signal = job.abortController.signal;
    const window = this.ownerDocument.defaultView;
    if (!window) return;
    const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"))
      .filter((image) => !image.complete);

    let repairRunning = false;
    let repairQueued = false;
    let repairCount = 0;
    const maximumRepairs = 4;

    const runRepair = async (): Promise<void> => {
      if (repairRunning) {
        repairQueued = true;
        return;
      }
      if (signal.aborted || this.#officeJob !== job || repairCount >= maximumRepairs) return;
      repairRunning = true;
      repairQueued = false;
      repairCount += 1;
      try {
        await this.#yieldOfficeAnimationFrame(signal);
        await this.#yieldOfficeAnimationFrame(signal);
        if (this.#officeJob !== job) return;
        const overflowing = Array.from(
          root.querySelectorAll<HTMLElement>(`section.${className}`),
        ).some((page) => (
          !page.classList.contains("office-word-unpaginated") &&
          this.#docxPageOverflows(page)
        ));
        if (!overflowing) return;
        await this.#paginateDocxOverflowPages(root, className, signal, domBudget);
        if (this.#officeJob === job) {
          this.#renumberDocxCachedPageFooters(root, className, domBudget);
        }
      } finally {
        repairRunning = false;
        if (repairQueued && !signal.aborted && this.#officeJob === job) scheduleRepair();
      }
    };

    const scheduleRepair = (): void => {
      if (
        signal.aborted ||
        this.#officeJob !== job ||
        repairCount >= maximumRepairs ||
        job.docxRepairTimer !== null
      ) {
        return;
      }
      repairQueued = true;
      job.docxRepairTimer = window.setTimeout(() => {
        job.docxRepairTimer = null;
        void runRepair().catch(() => undefined);
      }, 80);
    };

    for (const image of images) {
      image.addEventListener("load", scheduleRepair, { once: true, signal });
    }
    scheduleRepair();
  }

  async #checkpointDocxPagination(
    clock: DocxPaginationClock,
    signal: AbortSignal,
    forceYield = false,
  ): Promise<void> {
    this.#throwIfOfficeAborted(signal);
    if (!forceYield && Date.now() < clock.sliceEndsAt) return;
    await this.#yieldOfficeRender();
    this.#throwIfOfficeAborted(signal);
    clock.sliceEndsAt = Date.now() + DOCX_AUTO_PAGINATION_SLICE_MILLISECONDS;
  }

  async #paginateDocxOverflowPages(
    root: HTMLElement,
    className: string,
    signal: AbortSignal,
    domBudget: OfficeDomBudget,
  ): Promise<void> {
    const window = this.ownerDocument.defaultView;
    if (!window) return;

    const wrapperClassName = `${className}-wrapper`;
    const sourcePages = Array.from(root.querySelectorAll<HTMLElement>(`section.${className}`)).filter(
      (page) => page.parentElement?.classList.contains(wrapperClassName),
    );
    if (sourcePages.length === 0) return;

    const clock: DocxPaginationClock = {
      sliceEndsAt: Date.now() + DOCX_AUTO_PAGINATION_SLICE_MILLISECONDS,
    };
    let continuationPageCount = 0;
    let operationCount = 0;

    for (const sourcePage of sourcePages) {
      await this.#checkpointDocxPagination(clock, signal);

      const shellChildren = Array.from(sourcePage.children) as HTMLElement[];
      const sourceArticles = shellChildren.filter((child) => child.tagName === "ARTICLE");
      const unsupportedChildren = shellChildren.some(
        (child) => !["ARTICLE", "FOOTER", "HEADER"].includes(child.tagName),
      );
      if (sourceArticles.length !== 1 || unsupportedChildren) {
        if (this.#docxPageOverflows(sourcePage)) {
          sourcePage.classList.add("office-word-unpaginated");
          sourcePage.dataset.cleDocxUnpaginated = "structure";
          sourcePage.style.removeProperty("height");
          sourcePage.setAttribute("aria-label", "Unpaginated document content");
        }
        continue;
      }

      const computedStyle = window.getComputedStyle(sourcePage);
      const pageHeight = Number.parseFloat(computedStyle.minHeight);
      if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
        sourcePage.classList.add("office-word-unpaginated");
        sourcePage.dataset.cleDocxUnpaginated = "structure";
        sourcePage.style.removeProperty("height");
        sourcePage.setAttribute("aria-label", "Unpaginated document content");
        continue;
      }
      const naturalHeight = Math.max(sourcePage.getBoundingClientRect().height, sourcePage.scrollHeight);
      if (
        naturalHeight <= pageHeight + DOCX_PAGE_OVERFLOW_EPSILON &&
        !this.#docxPageOverflows(sourcePage)
      ) {
        continue;
      }

      const sourceArticle = sourceArticles[0];
      if (!sourceArticle) continue;
      const articleTemplate = sourceArticle.cloneNode(false) as HTMLElement;
      const pending = Array.from(sourceArticle.children) as HTMLElement[];
      if (pending.length === 0) continue;

      sourceArticle.replaceChildren();
      sourcePage.style.height = `${pageHeight}px`;
      let currentPage = sourcePage;
      let currentArticle = sourceArticle;
      let currentHasContent = false;
      let insertionAnchor = sourcePage;

      type ContinuationPageResult =
        | { readonly kind: "page"; readonly page: HTMLElement; readonly article: HTMLElement }
        | { readonly kind: "limit"; readonly reason: "budget" | "page-limit" | "structure" };

      const createContinuationPage = (): ContinuationPageResult => {
        if (continuationPageCount >= MAX_DOCX_AUTO_PAGES) {
          return { kind: "limit", reason: "page-limit" };
        }
        const page = sourcePage.cloneNode(false) as HTMLElement;
        let article: HTMLElement | null = null;
        for (const shellChild of shellChildren) {
          if (shellChild === sourceArticle) {
            article = articleTemplate.cloneNode(false) as HTMLElement;
            page.append(article);
          } else {
            page.append(shellChild.cloneNode(true));
          }
        }
        if (!article) return { kind: "limit", reason: "structure" };
        this.#stripDocxCloneIds(page);
        if (!this.#reserveOfficeDomClones(domBudget, [page])) {
          return { kind: "limit", reason: "budget" };
        }
        page.style.height = `${pageHeight}px`;
        insertionAnchor.after(page);
        insertionAnchor = page;
        continuationPageCount += 1;
        return { kind: "page", page, article };
      };

      const finishAsUnpaginatedRemainder = (
        reason: "budget" | "page-limit" | "structure",
      ): void => {
        let fallbackPage = currentPage;
        let fallbackArticle = currentArticle;
        if (currentHasContent) {
          fallbackPage = sourcePage.cloneNode(false) as HTMLElement;
          fallbackArticle = articleTemplate.cloneNode(false) as HTMLElement;
          fallbackPage.replaceChildren(fallbackArticle);
          this.#stripDocxCloneIds(fallbackPage);
          insertionAnchor.after(fallbackPage);
          insertionAnchor = fallbackPage;
        }
        fallbackPage.classList.add("office-word-unpaginated");
        fallbackPage.dataset.cleDocxUnpaginated = reason;
        fallbackPage.style.removeProperty("height");
        fallbackPage.setAttribute("aria-label", "Unpaginated document continuation");
        for (const block of pending.splice(0)) fallbackArticle.append(block);
        currentPage = fallbackPage;
        currentArticle = fallbackArticle;
        currentHasContent = fallbackArticle.childElementCount > 0;
      };

      const markCurrentPageOversized = (): void => {
        currentPage.classList.add("office-word-oversized");
        currentPage.dataset.cleDocxOversized = "atomic";
        currentPage.style.removeProperty("height");
        currentPage.setAttribute("aria-label", "Oversized document content");
      };

      const advanceToContinuation = (): boolean => {
        const continuation = createContinuationPage();
        if (continuation.kind === "limit") {
          finishAsUnpaginatedRemainder(continuation.reason);
          return false;
        }
        currentPage = continuation.page;
        currentArticle = continuation.article;
        currentHasContent = false;
        return true;
      };

      while (pending.length > 0) {
        await this.#checkpointDocxPagination(clock, signal);
        operationCount += 1;
        if (operationCount % 64 === 0) {
          await this.#checkpointDocxPagination(clock, signal, true);
        }

        if (pending[0]?.dataset.cleDocxKeepNext === "true") {
          let keepNextCount = 0;
          while (pending[keepNextCount]?.dataset.cleDocxKeepNext === "true") {
            keepNextCount += 1;
            if (keepNextCount % 64 === 0) {
              await this.#checkpointDocxPagination(clock, signal, true);
            }
          }
          const unitLength = Math.min(pending.length, keepNextCount + 1);
          const keepNextUnit = pending.slice(0, unitLength);
          currentArticle.append(...keepNextUnit);
          if (!this.#docxPageOverflows(currentPage)) {
            pending.splice(0, unitLength);
            currentHasContent = true;
            continue;
          }
          for (const unitBlock of keepNextUnit) unitBlock.remove();
          if (currentHasContent) {
            if (!advanceToContinuation()) break;
            continue;
          }
          // The chain cannot fit even on an empty page. Relax keep-next so the
          // existing table and paragraph splitters can preserve all content.
          for (let chainIndex = 0; chainIndex < keepNextCount; chainIndex += 1) {
            const chainBlock = pending[chainIndex];
            if (chainBlock) delete chainBlock.dataset.cleDocxKeepNext;
          }
        }

        const block = pending[0];
        if (!block) break;
        currentArticle.append(block);
        if (!this.#docxPageOverflows(currentPage)) {
          pending.shift();
          currentHasContent = true;
          continue;
        }
        block.remove();

        if (currentHasContent) {
          let blockSplit: DocxBlockSplitResult = await this.#splitDocxTableForPage(
            block,
            currentArticle,
            currentPage,
            signal,
            clock,
            domBudget,
            true,
          );
          if (blockSplit === null) {
            blockSplit = await this.#splitDocxParagraphForPage(
              block,
              currentArticle,
              currentPage,
              signal,
              clock,
              domBudget,
            );
          }
          if (blockSplit?.kind === "budget") {
            finishAsUnpaginatedRemainder("budget");
            break;
          }
          if (blockSplit?.kind === "split") {
            pending.shift();
            if (blockSplit.remainder) pending.unshift(blockSplit.remainder);
            if (blockSplit.oversized) markCurrentPageOversized();
            if (!blockSplit.remainder && !blockSplit.oversized) continue;
          }
          if (pending.length > 0 && !advanceToContinuation()) break;
          continue;
        }

        let blockSplit: DocxBlockSplitResult = await this.#splitDocxTableForPage(
          block,
          currentArticle,
          currentPage,
          signal,
          clock,
          domBudget,
        );
        if (blockSplit === null) {
          blockSplit = await this.#splitDocxParagraphForPage(
            block,
            currentArticle,
            currentPage,
            signal,
            clock,
            domBudget,
          );
        }
        if (blockSplit?.kind === "budget") {
          finishAsUnpaginatedRemainder("budget");
          break;
        }
        if (blockSplit?.kind === "split") {
          pending.shift();
          currentHasContent = true;
          if (blockSplit.remainder) pending.unshift(blockSplit.remainder);
          if (blockSplit.oversized) markCurrentPageOversized();
          if (!blockSplit.remainder && !blockSplit.oversized) continue;
        } else {
          pending.shift();
          currentArticle.append(block);
          currentHasContent = true;
          markCurrentPageOversized();
        }

        if (pending.length > 0 && !advanceToContinuation()) break;
      }
    }
  }

  #docxPageOverflows(page: HTMLElement): boolean {
    if (page.clientHeight <= 0) return false;
    if (page.scrollHeight > page.clientHeight + DOCX_PAGE_OVERFLOW_EPSILON) return true;
    const pageBounds = page.getBoundingClientRect();
    const computedStyle = this.ownerDocument.defaultView?.getComputedStyle(page);
    const paddingBottom = Number.parseFloat(computedStyle?.paddingBottom ?? "0");
    const contentBottom = pageBounds.bottom - (Number.isFinite(paddingBottom) ? paddingBottom : 0);
    const visualElements = page.querySelectorAll<Element>([
      "article",
      "article img",
      "article svg",
      "article canvas",
      "article object",
      "article video",
      "article table",
      'article [style*="position"]',
      'article [style*="transform"]',
    ].join(","));
    let inspected = 0;
    for (const element of visualElements) {
      inspected += 1;
      if (inspected > MAX_DOCX_VISUAL_OVERFLOW_ELEMENTS) break;
      const bounds = element.getBoundingClientRect();
      if (
        (bounds.width > 0 || bounds.height > 0) &&
        bounds.bottom > contentBottom + DOCX_PAGE_OVERFLOW_EPSILON
      ) {
        return true;
      }
    }
    return false;
  }

  #stripDocxCloneIds(root: HTMLElement): void {
    root.removeAttribute("id");
    for (const element of root.querySelectorAll("[id]")) element.removeAttribute("id");
  }

  async #splitDocxParagraphForPage(
    block: HTMLElement,
    article: HTMLElement,
    page: HTMLElement,
    signal: AbortSignal,
    clock: DocxPaginationClock,
    domBudget: OfficeDomBudget,
  ): Promise<DocxBlockSplitResult> {
    if (block.tagName !== "P") return null;
    await this.#checkpointDocxPagination(clock, signal);
    const sourceParagraph = block as HTMLParagraphElement;
    const textNodes: Text[] = [];
    const nodes = Array.from(sourceParagraph.childNodes).reverse();
    while (nodes.length > 0) {
      const node = nodes.pop();
      if (!node) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.nodeValue ?? "").length > 0) textNodes.push(node as Text);
        continue;
      }
      for (let child = node.lastChild; child; child = child.previousSibling) nodes.push(child);
    }
    const fullText = textNodes.map((node) => node.nodeValue ?? "").join("");
    if (fullText.length < 2) return null;

    const locateTextOffset = (offset: number): { node: Text; offset: number } | null => {
      let consumed = 0;
      for (const node of textNodes) {
        const length = (node.nodeValue ?? "").length;
        if (offset <= consumed + length) return { node, offset: offset - consumed };
        consumed += length;
      }
      return null;
    };
    const dedupeSplitIds = (...roots: HTMLElement[]): void => {
      const seen = new Set<string>();
      for (const root of roots) {
        const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("[id]"))];
        for (const element of elements) {
          const id = element.id;
          if (!id) continue;
          if (seen.has(id)) element.removeAttribute("id");
          else seen.add(id);
        }
      }
    };
    const cloneAtOffset = (
      offset: number,
    ): { prefix: HTMLParagraphElement; remainder: HTMLParagraphElement } | null => {
      const location = locateTextOffset(offset);
      if (!location) return null;
      const prefixRange = this.ownerDocument.createRange();
      prefixRange.selectNodeContents(sourceParagraph);
      prefixRange.setEnd(location.node, location.offset);
      const remainderRange = this.ownerDocument.createRange();
      remainderRange.selectNodeContents(sourceParagraph);
      remainderRange.setStart(location.node, location.offset);
      const prefix = sourceParagraph.cloneNode(false) as HTMLParagraphElement;
      const remainder = sourceParagraph.cloneNode(false) as HTMLParagraphElement;
      prefix.append(prefixRange.cloneContents());
      remainder.append(remainderRange.cloneContents());
      remainder.dataset.cleDocxParagraphContinuation = "true";
      dedupeSplitIds(prefix, remainder);
      return { prefix, remainder };
    };

    let lowestCandidate = 1;
    let highestCandidate = fullText.length - 1;
    let bestFit = 0;
    let trialCount = 0;
    while (lowestCandidate <= highestCandidate) {
      trialCount += 1;
      if (trialCount % 8 === 0) {
        await this.#checkpointDocxPagination(clock, signal, true);
      }
      const candidateOffset = Math.floor((lowestCandidate + highestCandidate) / 2);
      const candidate = cloneAtOffset(candidateOffset);
      if (!candidate) return null;
      article.append(candidate.prefix);
      const fits = !this.#docxPageOverflows(page);
      candidate.prefix.remove();
      if (fits) {
        bestFit = candidateOffset;
        lowestCandidate = candidateOffset + 1;
      } else {
        highestCandidate = candidateOffset - 1;
      }
    }
    if (bestFit <= 0) return null;

    let splitOffset = bestFit;
    if (
      splitOffset > 0 &&
      splitOffset < fullText.length &&
      /[\uD800-\uDBFF]/.test(fullText[splitOffset - 1] ?? "") &&
      /[\uDC00-\uDFFF]/.test(fullText[splitOffset] ?? "")
    ) {
      splitOffset -= 1;
    }
    let preferredWordBoundary = 0;
    for (let offset = splitOffset; offset > Math.max(0, splitOffset - 256); offset -= 1) {
      if (/[\s,.;:!?，。；：！？、]/u.test(fullText[offset - 1] ?? "")) {
        preferredWordBoundary = offset;
        break;
      }
    }
    if (preferredWordBoundary > 0) splitOffset = preferredWordBoundary;
    if (splitOffset <= 0 || splitOffset >= fullText.length) return null;

    const result = cloneAtOffset(splitOffset);
    if (!result) return null;
    if (`${result.prefix.textContent ?? ""}${result.remainder.textContent ?? ""}` !== fullText) {
      return null;
    }
    article.append(result.prefix);
    if (this.#docxPageOverflows(page)) {
      result.prefix.remove();
      return null;
    }
    result.prefix.remove();

    const sourceCost = this.#officeDomCost(sourceParagraph);
    const prefixCost = this.#officeDomCost(result.prefix);
    const remainderCost = this.#officeDomCost(result.remainder);
    const availableNodes = Math.min(
      MAX_OFFICE_DOM_NODES,
      domBudget.remainingNodes + sourceCost.nodes,
    );
    const availableTextUnits = Math.min(
      MAX_OFFICE_TEXT_UNITS,
      domBudget.remainingTextUnits + sourceCost.textUnits,
    );
    if (
      prefixCost.nodes + remainderCost.nodes > availableNodes ||
      prefixCost.textUnits + remainderCost.textUnits > availableTextUnits
    ) {
      return { kind: "budget" };
    }
    domBudget.remainingNodes = availableNodes - prefixCost.nodes - remainderCost.nodes;
    domBudget.remainingTextUnits = availableTextUnits - prefixCost.textUnits - remainderCost.textUnits;
    article.append(result.prefix);
    return {
      kind: "split",
      remainder: result.remainder,
      oversized: false,
    };
  }

  async #splitDocxTableForPage(
    block: HTMLElement,
    article: HTMLElement,
    page: HTMLElement,
    signal: AbortSignal,
    clock: DocxPaginationClock,
    domBudget: OfficeDomBudget,
    requireFittingFragment = false,
  ): Promise<DocxBlockSplitResult> {
    if (block.tagName !== "TABLE") return null;
    await this.#checkpointDocxPagination(clock, signal);
    const sourceTable = block as HTMLTableElement;
    const sourceChildren = Array.from(sourceTable.children) as HTMLElement[];
    const markedHeaderRows = Array.from(sourceTable.rows).filter(
      (row) => row.parentElement?.tagName !== "THEAD" && row.dataset.cleDocxTableHeader === "true",
    );
    const markedHeaderRowSet = new Set(markedHeaderRows);
    const rowDescriptors = Array.from(sourceTable.rows)
      .map((row) => ({
        row,
        sourceGroup: row.parentElement,
        sourceNextSibling: row.nextSibling,
      }))
      .filter(({ row, sourceGroup }) => (
        sourceGroup?.tagName !== "THEAD" &&
        sourceGroup?.tagName !== "TFOOT" &&
        !markedHeaderRowSet.has(row)
      ));
    if (rowDescriptors.length < 2 || rowDescriptors.length > MAX_DOCX_AUTO_TABLE_ROWS) return null;

    const sourceCost = this.#officeDomCost(sourceTable);
    let movedRowNodes = 0;
    let movedRowTextUnits = 0;
    const lastRowIndexByGroup = new Map<HTMLElement | null, number>();
    for (let rowIndex = 0; rowIndex < rowDescriptors.length; rowIndex += 1) {
      if (rowIndex > 0 && rowIndex % 64 === 0) {
        await this.#checkpointDocxPagination(clock, signal, true);
      }
      const descriptor = rowDescriptors[rowIndex];
      if (!descriptor) continue;
      lastRowIndexByGroup.set(descriptor.sourceGroup, rowIndex);
      const rowCost = this.#officeDomCost(descriptor.row);
      movedRowNodes += rowCost.nodes;
      movedRowTextUnits += rowCost.textUnits;
    }
    const releasableSourceCost = {
      nodes: Math.max(0, sourceCost.nodes - movedRowNodes),
      textUnits: Math.max(0, sourceCost.textUnits - movedRowTextUnits),
    };
    let rowSpanEnd = -1;
    let activeGroup: HTMLElement | null | undefined;
    const safeBreakAfter = new Array<boolean>(rowDescriptors.length).fill(false);
    for (let rowIndex = 0; rowIndex < rowDescriptors.length; rowIndex += 1) {
      if (rowIndex > 0 && rowIndex % 16 === 0) {
        await this.#checkpointDocxPagination(clock, signal, true);
      }
      const descriptor = rowDescriptors[rowIndex];
      if (!descriptor) continue;
      if (descriptor.sourceGroup !== activeGroup) {
        activeGroup = descriptor.sourceGroup;
        rowSpanEnd = rowIndex - 1;
      }
      const groupEnd = lastRowIndexByGroup.get(descriptor.sourceGroup) ?? rowIndex;
      for (const cell of Array.from(descriptor.row.cells)) {
        const requestedSpanEnd = cell.rowSpan === 0
          ? groupEnd
          : rowIndex + Math.max(1, cell.rowSpan) - 1;
        rowSpanEnd = Math.max(rowSpanEnd, Math.min(groupEnd, requestedSpanEnd));
      }
      safeBreakAfter[rowIndex] = rowSpanEnd <= rowIndex;
    }
    const footerChildren = sourceChildren.filter((child) => child.tagName === "TFOOT");

    const createFragment = (includeFooter: boolean): {
      table: HTMLTableElement;
      groups: Map<Element, HTMLElement>;
    } => {
      const table = sourceTable.cloneNode(false) as HTMLTableElement;
      const groups = new Map<Element, HTMLElement>();
      for (const sourceChild of sourceChildren) {
        if (sourceChild.tagName === "TR") continue;
        if (sourceChild.tagName === "TBODY") {
          const group = sourceChild.cloneNode(false) as HTMLElement;
          groups.set(sourceChild, group);
          table.append(group);
          continue;
        }
        if (sourceChild.tagName === "TFOOT" && !includeFooter) continue;
        table.append(sourceChild.cloneNode(true));
      }
      if (markedHeaderRows.length > 0) {
        const header = table.tHead ?? table.createTHead();
        for (const markedRow of markedHeaderRows) {
          const clone = markedRow.cloneNode(true) as HTMLTableRowElement;
          delete clone.dataset.cleDocxTableHeader;
          header.append(clone);
        }
      }
      this.#stripDocxCloneIds(table);
      return { table, groups };
    };

    const appendRow = (
      fragment: { table: HTMLTableElement; groups: Map<Element, HTMLElement> },
      descriptor: { row: HTMLTableRowElement; sourceGroup: HTMLElement | null },
    ): void => {
      const group = descriptor.sourceGroup ? fragment.groups.get(descriptor.sourceGroup) : null;
      (group ?? fragment.table).append(descriptor.row);
    };

    const first = createFragment(false);
    const createdTables: HTMLTableElement[] = [first.table];
    const reservedCosts: Array<{ nodes: number; textUnits: number }> = [];
    let availableNodes = Math.min(
      MAX_OFFICE_DOM_NODES,
      domBudget.remainingNodes + releasableSourceCost.nodes,
    );
    let availableTextUnits = Math.min(
      MAX_OFFICE_TEXT_UNITS,
      domBudget.remainingTextUnits + releasableSourceCost.textUnits,
    );
    const reserveTable = (table: HTMLTableElement): boolean => {
      const cost = this.#officeDomCost(table);
      if (
        cost.nodes > availableNodes ||
        cost.textUnits > availableTextUnits
      ) {
        return false;
      }
      availableNodes -= cost.nodes;
      availableTextUnits -= cost.textUnits;
      reservedCosts.push(cost);
      return true;
    };
    const refundReservedCosts = (startIndex: number): void => {
      for (const cost of reservedCosts.splice(startIndex)) {
        availableNodes += cost.nodes;
        availableTextUnits += cost.textUnits;
      }
    };
    const commitBudget = (): void => {
      domBudget.remainingNodes = Math.max(0, Math.min(MAX_OFFICE_DOM_NODES, availableNodes));
      domBudget.remainingTextUnits = Math.max(
        0,
        Math.min(MAX_OFFICE_TEXT_UNITS, availableTextUnits),
      );
    };
    const restore = (): void => {
      for (let rowIndex = rowDescriptors.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const descriptor = rowDescriptors[rowIndex];
        if (!descriptor?.sourceGroup) continue;
        descriptor.sourceGroup.insertBefore(descriptor.row, descriptor.sourceNextSibling);
      }
      for (const table of createdTables) table.remove();
      reservedCosts.splice(0);
    };
    if (!reserveTable(first.table)) return { kind: "budget" };
    article.append(first.table);
    let lastSafeFit = 0;
    let splitCount = rowDescriptors.length;
    let overflowed = false;

    try {
      for (let rowIndex = 0; rowIndex < rowDescriptors.length; rowIndex += 1) {
        if (rowIndex > 0 && rowIndex % 16 === 0) {
          await this.#checkpointDocxPagination(clock, signal, true);
        }
        const descriptor = rowDescriptors[rowIndex];
        if (!descriptor) continue;
        appendRow(first, descriptor);
        const overflows = this.#docxPageOverflows(page);
        if (!overflows && safeBreakAfter[rowIndex]) lastSafeFit = rowIndex + 1;
        if (!overflows) continue;
        overflowed = true;
        if (lastSafeFit > 0) {
          splitCount = lastSafeFit;
          break;
        }
        if (safeBreakAfter[rowIndex]) {
          if (requireFittingFragment) {
            restore();
            return null;
          }
          splitCount = rowIndex + 1;
          break;
        }
      }

      if (!overflowed) {
        const footerCostStart = reservedCosts.length;
        for (const footer of footerChildren) {
          const clone = footer.cloneNode(true) as HTMLElement;
          this.#stripDocxCloneIds(clone);
          const cost = this.#officeDomCost(clone);
          if (
            cost.nodes > availableNodes ||
            cost.textUnits > availableTextUnits
          ) {
            restore();
            return { kind: "budget" };
          }
          availableNodes -= cost.nodes;
          availableTextUnits -= cost.textUnits;
          reservedCosts.push(cost);
          first.table.append(clone);
        }
        if (!this.#docxPageOverflows(page)) {
          commitBudget();
          return { kind: "split", remainder: null, oversized: false };
        }
        overflowed = true;
        splitCount = lastSafeFit > 0 ? lastSafeFit : rowDescriptors.length;
        for (const footer of first.table.querySelectorAll(":scope > tfoot")) footer.remove();
        refundReservedCosts(footerCostStart);
      }

      const needsRemainder = splitCount < rowDescriptors.length || footerChildren.length > 0;
      let remainder: HTMLTableElement | null = null;
      if (needsRemainder) {
        const rest = createFragment(true);
        createdTables.push(rest.table);
        if (!reserveTable(rest.table)) {
          restore();
          return { kind: "budget" };
        }
        remainder = rest.table;
        for (let rowIndex = splitCount; rowIndex < rowDescriptors.length; rowIndex += 1) {
          if ((rowIndex - splitCount) > 0 && (rowIndex - splitCount) % 64 === 0) {
            await this.#checkpointDocxPagination(clock, signal, true);
          }
          const descriptor = rowDescriptors[rowIndex];
          if (descriptor) appendRow(rest, descriptor);
        }
      }

      const oversized = this.#docxPageOverflows(page);
      if (oversized && requireFittingFragment) {
        restore();
        return null;
      }
      commitBudget();
      return {
        kind: "split",
        remainder,
        oversized,
      };
    } catch (error) {
      restore();
      throw error;
    }
  }

  #officeAbortError(): Error {
    const error = new Error("Office preview cancelled");
    error.name = "AbortError";
    return error;
  }

  #throwIfOfficeAborted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw this.#officeAbortError();
  }

  #parseXlsxXml(bytes: Uint8Array, label: string): Document {
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const declaredEncoding = xml.slice(0, 512).match(/<\?xml\s+[^?]*\bencoding\s*=\s*["']([^"']+)["']/i)?.[1];
    if (
      xml.includes("\0") ||
      /<!\s*(?:doctype|entity)\b/i.test(xml) ||
      (declaredEncoding !== undefined && !/^utf-?8$/i.test(declaredEncoding.trim()))
    ) {
      throw new Error(`Unsafe ${label} XML`);
    }
    const Parser = this.ownerDocument.defaultView?.DOMParser;
    if (!Parser) throw new Error("XML parser is unavailable");
    const document = new Parser().parseFromString(xml, "application/xml");
    if (
      !document.documentElement ||
      document.documentElement.localName.toLowerCase() === "parsererror" ||
      document.getElementsByTagName("parsererror").length > 0 ||
      document.getElementsByTagNameNS("*", "parsererror").length > 0
    ) {
      throw new Error(`Invalid ${label} XML`);
    }
    return document;
  }

  async #readXlsxXmlEntry(
    entry: JSZip.JSZipObject,
    maximumBytes: number,
    signal: AbortSignal,
    label: string,
  ): Promise<Document> {
    this.#throwIfOfficeAborted(signal);
    const declaredBytes = declaredZipEntryBytes(entry);
    if (declaredBytes === null || declaredBytes > maximumBytes) {
      throw new Error(`${label} exceeds preview limits`);
    }
    const bytes = await entry.async("uint8array");
    this.#throwIfOfficeAborted(signal);
    if (bytes.byteLength > maximumBytes || bytes.byteLength !== declaredBytes) {
      throw new Error(`${label} exceeds preview limits`);
    }
    return this.#parseXlsxXml(bytes, label);
  }

  #xlsxArchiveEntries(archive: JSZip): ReadonlyMap<string, JSZip.JSZipObject> {
    const files = Object.values(archive.files).filter((entry) => !entry.dir);
    if (files.length > MAX_XLSX_ZIP_ENTRIES) throw new Error("Workbook contains too many files");
    const entries = new Map<string, JSZip.JSZipObject>();
    const foldedNames = new Set<string>();
    for (const entry of files) {
      const normalizedName = normalizeXlsxEntryName(entry.name);
      const normalizedOriginalName = normalizeXlsxEntryName(entry.unsafeOriginalName ?? entry.name);
      if (!normalizedName || normalizedName !== normalizedOriginalName) {
        throw new Error("Workbook contains an unsafe file path");
      }
      const foldedName = normalizedName.toLowerCase();
      if (entries.has(normalizedName) || foldedNames.has(foldedName)) {
        throw new Error("Workbook contains duplicate file paths");
      }
      foldedNames.add(foldedName);
      entries.set(normalizedName, entry);
    }
    return entries;
  }

  async #xlsxWorksheetMetadata(
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<{ readonly worksheets: readonly XlsxWorksheetMeta[]; readonly total: number }> {
    const workbookEntry = entries.get("xl/workbook.xml");
    const relationshipsEntry = entries.get("xl/_rels/workbook.xml.rels");
    if (!workbookEntry || !relationshipsEntry) throw new Error("Workbook structure is incomplete");
    const [workbook, relationships] = await Promise.all([
      this.#readXlsxXmlEntry(workbookEntry, MAX_XLSX_WORKBOOK_XML_BYTES, signal, "workbook"),
      this.#readXlsxXmlEntry(relationshipsEntry, MAX_XLSX_RELATIONSHIP_XML_BYTES, signal, "workbook relationships"),
    ]);
    this.#throwIfOfficeAborted(signal);
    if (workbook.documentElement.localName.toLowerCase() !== "workbook") {
      throw new Error("Invalid workbook root");
    }

    const worksheetRelationships = new Map<string, string>();
    const seenRelationshipIds = new Set<string>();
    const relationshipNodes = relationships.getElementsByTagNameNS("*", "Relationship");
    if (relationshipNodes.length > MAX_XLSX_ZIP_ENTRIES) {
      throw new Error("Workbook contains too many relationships");
    }
    for (let relationshipIndex = 0; relationshipIndex < relationshipNodes.length; relationshipIndex += 1) {
      const relationship = relationshipNodes[relationshipIndex];
      if (!relationship) continue;
      if (relationshipIndex > 0 && relationshipIndex % 256 === 0) {
        await this.#yieldOfficeRender();
        this.#throwIfOfficeAborted(signal);
      }
      const id = xmlAttribute(relationship, "id")?.trim() ?? "";
      const type = xmlAttribute(relationship, "type")?.trim() ?? "";
      const target = xmlAttribute(relationship, "target")?.trim() ?? "";
      const targetMode = xmlAttribute(relationship, "targetmode")?.trim().toLowerCase() ?? "";
      if (!id || seenRelationshipIds.has(id)) throw new Error("Invalid workbook relationship ID");
      seenRelationshipIds.add(id);
      if (targetMode === "external" || isExternalOfficeTarget(target)) {
        const error = new Error("Workbook contains external relationships");
        error.name = "ExternalOfficeResourceError";
        throw error;
      }
      const worksheetRelationship =
        type === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ||
        type === "http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet";
      if (!worksheetRelationship) continue;
      if (!id || !target || (targetMode && targetMode !== "internal") || worksheetRelationships.has(id)) {
        throw new Error("Invalid worksheet relationship");
      }
      const path = resolveXlsxRelationshipTarget("xl/workbook.xml", target);
      if (!path || !/^xl\/worksheets\/[^/]+\.xml$/.test(path) || !entries.has(path)) {
        throw new Error("Invalid worksheet path");
      }
      worksheetRelationships.set(id, path);
    }

    const sheetNodes = workbook.getElementsByTagNameNS("*", "sheet");
    if (sheetNodes.length > MAX_XLSX_ZIP_ENTRIES) throw new Error("Workbook contains too many sheets");
    const worksheets: XlsxWorksheetMeta[] = [];
    const seenPaths = new Set<string>();
    const maximum = Math.min(sheetNodes.length, MAX_EXCEL_SHEETS);
    for (let index = 0; index < maximum; index += 1) {
      const sheet = sheetNodes[index];
      if (!sheet) continue;
      const relationshipId = xmlAttribute(sheet, "id")?.trim() ?? "";
      const path = worksheetRelationships.get(relationshipId);
      if (!path || seenPaths.has(path)) throw new Error("Invalid worksheet definition");
      seenPaths.add(path);
      worksheets.push({
        name: safeXlsxSheetName(xmlAttribute(sheet, "name"), index),
        path,
      });
    }
    if (worksheets.length === 0) throw new Error("Workbook contains no worksheets");
    return { worksheets, total: sheetNodes.length };
  }

  async #xlsxSharedStrings(
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<XlsxSharedStrings> {
    const entry = entries.get("xl/sharedStrings.xml");
    if (!entry) return { values: [], truncated: false };
    const document = await this.#readXlsxXmlEntry(
      entry,
      MAX_XLSX_SHARED_STRINGS_XML_BYTES,
      signal,
      "shared strings",
    );
    const items = document.getElementsByTagNameNS("*", "si");
    const values: string[] = [];
    let textUnits = 0;
    let truncated = items.length > MAX_XLSX_SHARED_STRINGS;
    const maximum = Math.min(items.length, MAX_XLSX_SHARED_STRINGS);
    for (let index = 0; index < maximum; index += 1) {
      this.#throwIfOfficeAborted(signal);
      const item = items[index];
      if (!item) continue;
      let text = xlsxTextContent(item);
      const remaining = Math.max(0, MAX_EXCEL_TOTAL_TEXT_UNITS - textUnits);
      const permitted = Math.min(MAX_EXCEL_CELL_TEXT_UNITS, remaining);
      if (text.length > permitted) {
        text = permitted > 0 ? `${text.slice(0, Math.max(0, permitted - 1))}\u2026` : "";
        truncated = true;
      }
      values.push(text);
      textUnits += text.length;
      if (remaining === 0) {
        truncated = truncated || index + 1 < items.length;
        break;
      }
      if ((index + 1) % 5_000 === 0) await this.#yieldOfficeRender();
    }
    return { values, truncated };
  }

  async #xlsxStyles(
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<XlsxStyleTable> {
    const entry = entries.get("xl/styles.xml");
    if (!entry) return { cellStyles: [], truncated: false };
    const document = await this.#readXlsxXmlEntry(entry, MAX_XLSX_STYLES_XML_BYTES, signal, "styles");
    if (document.documentElement.localName.toLowerCase() !== "stylesheet") {
      throw new Error("Invalid styles root");
    }

    let truncated = false;
    const fonts: XlsxCellStyle[] = [];
    const fontsRoot = directXmlChild(document.documentElement, "fonts");
    if (fontsRoot) {
      const fontRecords = boundedDirectXmlChildren(fontsRoot, "font", MAX_XLSX_STYLE_RECORDS);
      if (fontRecords.truncated) truncated = true;
      for (const font of fontRecords.elements) {
        const style: XlsxCellStyle = {};
        if (xmlBooleanElement(font, "b")) style.bold = true;
        if (xmlBooleanElement(font, "i")) style.italic = true;
        if (xmlBooleanElement(font, "strike")) style.strike = true;
        if (xmlBooleanElement(font, "u")) style.underline = true;
        const nameElement = directXmlChild(font, "name");
        const family = (nameElement ? xmlAttribute(nameElement, "val") ?? "" : "")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim();
        if (family) style.fontFamily = family.slice(0, 80);
        const sizeElement = directXmlChild(font, "sz");
        const size = Number(sizeElement ? xmlAttribute(sizeElement, "val") : Number.NaN);
        if (Number.isFinite(size) && size >= 4 && size <= 96) style.fontSizePoints = size;
        const color = directArgbColor(directXmlChild(font, "color"));
        if (color) style.color = color;
        fonts.push(style);
      }
    }

    const fills: Array<string | null> = [];
    const fillsRoot = directXmlChild(document.documentElement, "fills");
    if (fillsRoot) {
      const fillRecords = boundedDirectXmlChildren(fillsRoot, "fill", MAX_XLSX_STYLE_RECORDS);
      if (fillRecords.truncated) truncated = true;
      for (const fill of fillRecords.elements) {
        const pattern = directXmlChild(fill, "patternfill");
        const solid = (pattern ? xmlAttribute(pattern, "patterntype") ?? "" : "").trim().toLowerCase() === "solid";
        fills.push(solid && pattern ? directArgbColor(directXmlChild(pattern, "fgcolor")) : null);
      }
    }

    const cellStyles: XlsxCellStyle[] = [];
    const cellFormatsRoot = directXmlChild(document.documentElement, "cellxfs");
    if (cellFormatsRoot) {
      const formatRecords = boundedDirectXmlChildren(cellFormatsRoot, "xf", MAX_XLSX_STYLE_RECORDS);
      if (formatRecords.truncated) truncated = true;
      for (const format of formatRecords.elements) {
        const style: XlsxCellStyle = {};
        const fontId = Number(xmlAttribute(format, "fontid"));
        if (Number.isInteger(fontId) && fontId >= 0 && fonts[fontId]) Object.assign(style, fonts[fontId]);
        const fillId = Number(xmlAttribute(format, "fillid"));
        const fill = Number.isInteger(fillId) && fillId >= 0 ? fills[fillId] : null;
        if (fill) style.backgroundColor = fill;
        const alignment = directXmlChild(format, "alignment");
        if (alignment) {
          const horizontal = (xmlAttribute(alignment, "horizontal") ?? "").trim().toLowerCase();
          if (horizontal === "left" || horizontal === "center" || horizontal === "right" || horizontal === "justify") {
            style.horizontal = horizontal;
          }
          const vertical = (xmlAttribute(alignment, "vertical") ?? "").trim().toLowerCase();
          if (vertical === "top" || vertical === "bottom") style.vertical = vertical;
          else if (vertical === "center") style.vertical = "middle";
          const wrapText = (xmlAttribute(alignment, "wraptext") ?? "").trim().toLowerCase();
          if (wrapText === "1" || wrapText === "true" || wrapText === "on") style.wrapText = true;
        }
        cellStyles.push(style);
      }
    }
    return { cellStyles, truncated };
  }

  async #parseXlsxWorksheet(
    entry: JSZip.JSZipObject,
    sharedStrings: XlsxSharedStrings,
    styles: XlsxStyleTable,
    signal: AbortSignal,
  ): Promise<ParsedXlsxWorksheet> {
    const document = await this.#readXlsxXmlEntry(
      entry,
      MAX_XLSX_WORKSHEET_XML_BYTES,
      signal,
      "worksheet",
    );
    if (document.documentElement.localName.toLowerCase() !== "worksheet") {
      throw new Error("Invalid worksheet root");
    }

    const columnWidths = new Map<number, number>();
    const columnDefinitions = document.getElementsByTagNameNS("*", "col");
    let truncated = columnDefinitions.length > MAX_XLSX_ZIP_ENTRIES || sharedStrings.truncated || styles.truncated;
    const columnDefinitionLimit = Math.min(columnDefinitions.length, MAX_XLSX_ZIP_ENTRIES);
    for (let index = 0; index < columnDefinitionLimit; index += 1) {
      const definition = columnDefinitions[index];
      if (!definition) continue;
      const minimum = Number(xmlAttribute(definition, "min"));
      const maximum = Number(xmlAttribute(definition, "max"));
      const width = Number(xmlAttribute(definition, "width"));
      if (
        !Number.isInteger(minimum) ||
        !Number.isInteger(maximum) ||
        minimum < 1 ||
        maximum < minimum ||
        !Number.isFinite(width) ||
        width <= 0
      ) {
        continue;
      }
      for (let column = minimum; column <= Math.min(maximum, MAX_EXCEL_COLUMNS); column += 1) {
        columnWidths.set(column, Math.min(255, width));
      }
    }

    const cells = new Map<number, Map<number, XlsxPreviewCell>>();
    const cellNodes = document.getElementsByTagNameNS("*", "c");
    const cellLimit = Math.min(cellNodes.length, MAX_EXCEL_CELLS);
    if (cellNodes.length > cellLimit) truncated = true;
    let rowCount = 0;
    let columnCount = 0;
    let textUnits = 0;
    let validCellCount = 0;
    for (let index = 0; index < cellLimit; index += 1) {
      this.#throwIfOfficeAborted(signal);
      const cell = cellNodes[index];
      if (!cell) continue;
      const coordinate = xlsxCellCoordinate(xmlAttribute(cell, "r") ?? "");
      if (!coordinate) {
        truncated = true;
        continue;
      }
      validCellCount += 1;
      rowCount = Math.max(rowCount, coordinate.row);
      columnCount = Math.max(columnCount, coordinate.column);
      if (coordinate.row > MAX_EXCEL_ROWS || coordinate.column > MAX_EXCEL_COLUMNS) {
        truncated = true;
        continue;
      }

      const type = (xmlAttribute(cell, "t") ?? "").trim().toLowerCase();
      const rawValue = directXmlChild(cell, "v")?.textContent ?? "";
      let text = rawValue;
      if (type === "s") {
        const sharedIndex = /^\d+$/.test(rawValue.trim()) ? Number(rawValue.trim()) : -1;
        text = Number.isSafeInteger(sharedIndex) && sharedIndex >= 0
          ? sharedStrings.values[sharedIndex] ?? ""
          : "";
        if (!Number.isSafeInteger(sharedIndex) || sharedIndex < 0 || sharedIndex >= sharedStrings.values.length) {
          truncated = true;
        }
      } else if (type === "inlinestr") {
        const inlineString = directXmlChild(cell, "is");
        text = inlineString ? xlsxTextContent(inlineString) : "";
      } else if (type === "b") {
        text = rawValue.trim() === "1" ? "TRUE" : rawValue.trim() === "0" ? "FALSE" : rawValue;
      }

      const remaining = Math.max(0, MAX_EXCEL_TOTAL_TEXT_UNITS - textUnits);
      const permitted = Math.min(MAX_EXCEL_CELL_TEXT_UNITS, remaining);
      if (text.length > permitted) {
        text = permitted > 0 ? `${text.slice(0, Math.max(0, permitted - 1))}\u2026` : "";
        truncated = true;
      }
      textUnits += text.length;
      const rawStyleId = (xmlAttribute(cell, "s") ?? "").trim();
      const styleId = /^\d+$/.test(rawStyleId) ? Number(rawStyleId) : -1;
      const style = Number.isSafeInteger(styleId) && styleId >= 0 ? styles.cellStyles[styleId] ?? null : null;
      if (rawStyleId && !style) truncated = true;
      if (text || style) {
        const row = cells.get(coordinate.row) ?? new Map<number, XlsxPreviewCell>();
        row.set(coordinate.column, { text, style });
        cells.set(coordinate.row, row);
      }
      if ((index + 1) % 5_000 === 0) await this.#yieldOfficeRender();
    }

    if (validCellCount > 0) {
      const dimension = document.getElementsByTagNameNS("*", "dimension")[0];
      const dimensionReference = dimension ? xmlAttribute(dimension, "ref") ?? "" : "";
      const dimensionRange = dimensionReference ? xlsxRange(dimensionReference) : null;
      if (dimensionRange) {
        rowCount = Math.max(rowCount, dimensionRange.endRow);
        columnCount = Math.max(columnCount, dimensionRange.endColumn);
        if (dimensionRange.endRow > MAX_EXCEL_ROWS || dimensionRange.endColumn > MAX_EXCEL_COLUMNS) truncated = true;
      } else if (dimensionReference) {
        truncated = true;
      }
    }
    const mergedRanges: XlsxRange[] = [];
    const mergedElements = document.getElementsByTagNameNS("*", "mergeCell");
    if (mergedElements.length > MAX_XLSX_MERGED_RANGES) truncated = true;
    const mergedLimit = Math.min(mergedElements.length, MAX_XLSX_MERGED_RANGES);
    for (let index = 0; index < mergedLimit; index += 1) {
      const mergedElement = mergedElements[index];
      const range = mergedElement ? xlsxRange(xmlAttribute(mergedElement, "ref") ?? "") : null;
      if (!range) {
        truncated = true;
        continue;
      }
      mergedRanges.push(range);
      rowCount = Math.max(rowCount, range.endRow);
      columnCount = Math.max(columnCount, range.endColumn);
      if (range.endRow > MAX_EXCEL_ROWS || range.endColumn > MAX_EXCEL_COLUMNS) truncated = true;
    }

    const mergedFollowers = new Set<number>();
    if (rowCount > 0 && columnCount > 0) {
      const renderedRows = Math.min(MAX_EXCEL_ROWS, rowCount);
      const columnBudget = Math.max(1, Math.floor(MAX_EXCEL_CELLS / renderedRows));
      const renderedColumns = Math.min(MAX_EXCEL_COLUMNS, columnCount, columnBudget);
      let mergeVisits = 0;
      mergeRanges: for (const range of mergedRanges) {
        this.#throwIfOfficeAborted(signal);
        const finalRow = Math.min(range.endRow, renderedRows);
        const finalColumn = Math.min(range.endColumn, renderedColumns);
        for (let row = range.startRow; row <= finalRow; row += 1) {
          for (let column = range.startColumn; column <= finalColumn; column += 1) {
            if (mergeVisits >= MAX_EXCEL_CELLS) {
              truncated = true;
              break mergeRanges;
            }
            mergeVisits += 1;
            if (row !== range.startRow || column !== range.startColumn) {
              mergedFollowers.add(xlsxMergedCellKey(row, column));
            }
          }
          if (mergeVisits > 0 && mergeVisits % 5_000 === 0) {
            await this.#yieldOfficeRender();
            this.#throwIfOfficeAborted(signal);
          }
        }
      }
    }
    return { cells, rowCount, columnCount, columnWidths, mergedFollowers, truncated };
  }

  async #renderXlsxOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const signal = job.abortController.signal;
    this.#throwIfOfficeAborted(signal);
    const archive = await JSZip.loadAsync(view.bytes.slice(), { checkCRC32: false, createFolders: false });
    this.#throwIfOfficeAborted(signal);
    const entries = this.#xlsxArchiveEntries(archive);
    const [{ worksheets, total }, sharedStrings, styles] = await Promise.all([
      this.#xlsxWorksheetMetadata(entries, signal),
      this.#xlsxSharedStrings(entries, signal),
      this.#xlsxStyles(entries, signal),
    ]);
    if (!isCurrent()) return;

    const shell = this.ownerDocument.createElement("div");
    shell.className = "office-workbook";
    const sheetTabs = this.ownerDocument.createElement("div");
    sheetTabs.className = "office-sheet-tabs";
    sheetTabs.setAttribute("role", "tablist");
    sheetTabs.setAttribute("aria-label", "Workbook sheets");
    const sheetViewport = this.ownerDocument.createElement("div");
    sheetViewport.className = "office-sheet-viewport";
    shell.append(sheetTabs, sheetViewport);
    stage.replaceChildren(shell);

    let sheetGeneration = 0;
    const buttons: HTMLButtonElement[] = [];
    const renderSheet = async (sheet: XlsxWorksheetMeta, sheetIndex: number): Promise<void> => {
      const generation = ++sheetGeneration;
      for (let index = 0; index < buttons.length; index += 1) {
        const selected = index === sheetIndex;
        buttons[index]?.setAttribute("aria-selected", String(selected));
        if (buttons[index]) buttons[index]!.tabIndex = selected ? 0 : -1;
      }
      sheetViewport.setAttribute("aria-busy", "true");
      container.setAttribute("aria-busy", "true");
      const loadingSheet = this.#textSpan(`Loading ${sheet.name}\u2026`, "office-preview-loading");
      loadingSheet.setAttribute("role", "status");
      sheetViewport.replaceChildren(loadingSheet);

      const entry = entries.get(sheet.path);
      if (!entry) throw new Error("Worksheet is missing");
      const parsed = await this.#parseXlsxWorksheet(entry, sharedStrings, styles, signal);
      if (!isCurrent() || generation !== sheetGeneration) return;
      const sourceRows = parsed.rowCount;
      const sourceColumns = parsed.columnCount;
      if (sourceRows < 1 || sourceColumns < 1) {
        sheetViewport.replaceChildren(this.#textSpan("This worksheet is empty.", "office-preview-loading"));
        sheetViewport.setAttribute("aria-busy", "false");
        container.setAttribute("aria-busy", "false");
        return;
      }

      const rowCount = Math.min(MAX_EXCEL_ROWS, sourceRows);
      const columnBudget = Math.max(1, Math.floor(MAX_EXCEL_CELLS / rowCount));
      const columnCount = Math.min(MAX_EXCEL_COLUMNS, sourceColumns, columnBudget);
      const table = this.ownerDocument.createElement("table");
      table.className = "office-sheet-table";
      const caption = this.ownerDocument.createElement("caption");
      caption.textContent = sheet.name;
      const columnGroup = this.ownerDocument.createElement("colgroup");
      columnGroup.append(this.ownerDocument.createElement("col"));
      for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
        const column = this.ownerDocument.createElement("col");
        const excelWidth = parsed.columnWidths.get(columnIndex);
        if (excelWidth !== undefined) {
          column.style.width = `${Math.min(420, Math.max(48, excelWidth * 7))}px`;
        }
        columnGroup.append(column);
      }
      const head = this.ownerDocument.createElement("thead");
      const headingRow = this.ownerDocument.createElement("tr");
      const corner = this.ownerDocument.createElement("th");
      corner.className = "office-sheet-corner";
      corner.setAttribute("aria-hidden", "true");
      headingRow.append(corner);
      for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
        const heading = this.ownerDocument.createElement("th");
        heading.scope = "col";
        heading.textContent = excelColumnLabel(columnIndex);
        headingRow.append(heading);
      }
      head.append(headingRow);
      const body = this.ownerDocument.createElement("tbody");
      for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
        if (!isCurrent() || generation !== sheetGeneration || signal.aborted) return;
        const row = this.ownerDocument.createElement("tr");
        const rowHeading = this.ownerDocument.createElement("th");
        rowHeading.scope = "row";
        rowHeading.textContent = String(rowIndex);
        row.append(rowHeading);
        const sourceRow = parsed.cells.get(rowIndex);
        for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
          const dataCell = this.ownerDocument.createElement("td");
          const sourceCell = sourceRow?.get(columnIndex) ?? null;
          dataCell.textContent = parsed.mergedFollowers.has(xlsxMergedCellKey(rowIndex, columnIndex))
            ? ""
            : sourceCell?.text ?? "";
          applyXlsxCellStyle(dataCell, sourceCell?.style ?? null);
          row.append(dataCell);
        }
        body.append(row);
        if (rowIndex % 100 === 0) await this.#yieldOfficeRender();
      }

      if (!isCurrent() || generation !== sheetGeneration) return;
      table.append(caption, columnGroup, head, body);
      const fragment = this.ownerDocument.createDocumentFragment();
      fragment.append(table);
      if (sourceRows > rowCount || sourceColumns > columnCount || parsed.truncated) {
        fragment.append(this.#textSpan("Preview limited for performance.", "office-preview-notice"));
      }
      sheetViewport.replaceChildren(fragment);
      sheetViewport.setAttribute("aria-busy", "false");
      container.setAttribute("aria-busy", "false");
    };

    const showSheetError = (): void => {
      if (!isCurrent()) return;
      sheetViewport.replaceChildren(this.#textSpan("This worksheet could not be opened.", "office-preview-loading"));
      sheetViewport.setAttribute("aria-busy", "false");
      container.setAttribute("aria-busy", "false");
    };
    for (let index = 0; index < worksheets.length; index += 1) {
      const worksheet = worksheets[index];
      if (!worksheet) continue;
      const button = this.ownerDocument.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.textContent = worksheet.name;
      button.title = worksheet.name;
      button.addEventListener("click", () => void renderSheet(worksheet, index).catch(showSheetError));
      buttons.push(button);
      sheetTabs.append(button);
    }
    if (total > worksheets.length) {
      sheetTabs.append(this.#textSpan(`+${total - worksheets.length}`, "office-sheet-overflow"));
    }
    await renderSheet(worksheets[0]!, 0);
  }

  async #renderNativePptOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const window = this.ownerDocument.defaultView;
    const urlApi = window?.URL;
    const BlobType = window?.Blob;
    if (!window || !urlApi || !BlobType || typeof urlApi.createObjectURL !== "function") {
      throw new Error("Native PowerPoint slide images are unavailable");
    }
    const archive = await JSZip.loadAsync(view.bytes, { checkCRC32: true, createFolders: false });
    if (job.abortController.signal.aborted) {
      const error = new Error("Office preview cancelled");
      error.name = "AbortError";
      throw error;
    }
    const manifestEntry = archive.file("manifest.json");
    if (!manifestEntry) throw new Error("Native PowerPoint manifest is missing");
    const manifestText = await manifestEntry.async("string");
    if (manifestText.length > 4_096) throw new Error("Native PowerPoint manifest exceeds preview limits");
    const parsedManifest = JSON.parse(manifestText) as unknown;
    const manifest = parsedManifest && typeof parsedManifest === "object" && !Array.isArray(parsedManifest)
      ? parsedManifest as Record<string, unknown>
      : null;
    const slideCount = manifest?.slideCount;
    const slideWidth = manifest?.width;
    const slideHeight = manifest?.height;
    if (
      manifest?.schemaVersion !== 1 ||
      !Number.isSafeInteger(slideCount) ||
      (slideCount as number) < 1 ||
      (slideCount as number) > MAX_PPT_SLIDES ||
      !Number.isSafeInteger(slideWidth) ||
      (slideWidth as number) < 1 ||
      (slideWidth as number) > 4_096 ||
      !Number.isSafeInteger(slideHeight) ||
      (slideHeight as number) < 1 ||
      (slideHeight as number) > 4_096
    ) {
      throw new Error("Native PowerPoint manifest is invalid");
    }
    const count = slideCount as number;
    const width = slideWidth as number;
    const height = slideHeight as number;
    const slideNames = Array.from({ length: count }, (_, index) => `slide-${String(index + 1).padStart(4, "0")}.png`);
    const expectedNames = new Set(["manifest.json", ...slideNames]);
    const actualNames = Object.values(archive.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name);
    if (actualNames.length !== expectedNames.size || actualNames.some((name) => !expectedNames.has(name))) {
      throw new Error("Native PowerPoint archive contains unexpected files");
    }
    const slideEntries = slideNames.map((name) => {
      const entry = archive.file(name);
      if (!entry) throw new Error("Native PowerPoint slide is missing");
      return entry;
    });

    const shell = this.ownerDocument.createElement("div");
    shell.className = "office-presentation";
    const toolbar = this.ownerDocument.createElement("nav");
    toolbar.className = "office-preview-toolbar";
    toolbar.setAttribute("aria-label", "Presentation slide navigation");
    const previous = this.ownerDocument.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    const status = this.#textSpan("Loading presentation", "office-page-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const next = this.ownerDocument.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    toolbar.append(previous, status, next);
    const slideViewport = this.ownerDocument.createElement("div");
    slideViewport.className = "office-slide-viewport";
    slideViewport.setAttribute("aria-label", `${view.name} slide preview`);
    shell.append(toolbar, slideViewport);
    stage.replaceChildren(shell);

    let slideIndex = 0;
    let busy = false;
    const updateControls = (): void => {
      previous.setAttribute("aria-disabled", String(busy || slideIndex <= 0));
      next.setAttribute("aria-disabled", String(busy || slideIndex >= count - 1));
      status.textContent = `Slide ${slideIndex + 1} of ${count}`;
      container.setAttribute("aria-busy", String(busy));
    };
    const createSlideUrl = (bytes: Uint8Array): { readonly url: string; readonly revoke: () => void } => {
      const underlying = bytes.buffer;
      let buffer: ArrayBuffer;
      if (underlying instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === underlying.byteLength) {
        buffer = underlying;
      } else if (underlying instanceof ArrayBuffer) {
        buffer = underlying.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } else {
        buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
      }
      const url = urlApi.createObjectURL(new BlobType([buffer], { type: "image/png" }));
      return { url, revoke: () => urlApi.revokeObjectURL(url) };
    };
    const validatePng = (bytes: Uint8Array): boolean => {
      if (
        bytes.byteLength < 24 ||
        ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) ||
        String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
      ) {
        return false;
      }
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return data.getUint32(16, false) === width && data.getUint32(20, false) === height;
    };
    const waitForImage = async (image: HTMLImageElement): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void): void => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          job.abortController.signal.removeEventListener("abort", abort);
          image.removeEventListener("load", loaded);
          image.removeEventListener("error", failed);
          callback();
        };
        const loaded = (): void => finish(resolve);
        const failed = (): void => finish(() => reject(new Error("PowerPoint slide image could not be decoded")));
        const abort = (): void => {
          const error = new Error("Office preview cancelled");
          error.name = "AbortError";
          finish(() => reject(error));
        };
        const timeout = window.setTimeout(
          () => finish(() => reject(new Error("PowerPoint slide rendering timed out"))),
          MAX_PPT_RENDER_MILLISECONDS,
        );
        image.addEventListener("load", loaded, { once: true });
        image.addEventListener("error", failed, { once: true });
        job.abortController.signal.addEventListener("abort", abort, { once: true });
        if (job.abortController.signal.aborted) abort();
        else if (image.complete) window.queueMicrotask(image.naturalWidth > 0 ? loaded : failed);
      });
    };
    const renderSlide = async (requested: number): Promise<void> => {
      if (busy || !isCurrent()) return;
      const target = Math.max(0, Math.min(count - 1, requested));
      busy = true;
      updateControls();
      let candidateUrl: { readonly url: string; readonly revoke: () => void } | null = null;
      try {
        const bytes = await slideEntries[target]!.async("uint8array");
        if (bytes.byteLength < 24 || bytes.byteLength > 16 * 1024 * 1024 || !validatePng(bytes)) {
          throw new Error("Native PowerPoint slide image is invalid");
        }
        candidateUrl = createSlideUrl(bytes);
        const image = this.ownerDocument.createElement("img");
        image.className = "office-native-slide";
        image.alt = `${view.name}, slide ${target + 1}`;
        image.draggable = false;
        image.src = candidateUrl.url;
        await waitForImage(image);
        if (!isCurrent()) return;
        const previousUrl = job.nativePptObjectUrl;
        job.nativePptObjectUrl = candidateUrl;
        candidateUrl = null;
        previousUrl?.revoke();
        slideIndex = target;
        slideViewport.replaceChildren(image);
        this.#sanitizeOfficeTree(slideViewport);
        if (this.#boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
      } finally {
        candidateUrl?.revoke();
        busy = false;
        if (isCurrent()) updateControls();
      }
    };
    const showSlideError = (): void => {
      if (!isCurrent()) return;
      busy = true;
      previous.setAttribute("aria-disabled", "true");
      next.setAttribute("aria-disabled", "true");
      status.textContent = "Preview unavailable";
      container.setAttribute("aria-busy", "false");
      job.nativePptObjectUrl?.revoke();
      job.nativePptObjectUrl = null;
      slideViewport.replaceChildren(this.#statePanel("Office preview failed", "This presentation slide could not be rendered.", "error", view));
    };
    previous.addEventListener("click", () => {
      if (!busy && slideIndex > 0) void renderSlide(slideIndex - 1).catch(showSlideError);
    });
    next.addEventListener("click", () => {
      if (!busy && slideIndex < count - 1) void renderSlide(slideIndex + 1).catch(showSlideError);
    });
    updateControls();
    await renderSlide(0);
  }

  async #renderLegacyPptOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const parsed = this.#sanitizeLegacyPptPresentation(await this.#parseLegacyPpt(view.bytes, job));
    if (!isCurrent()) return;

    const slideCount = parsed.document.slides.length;
    if (slideCount < 1) throw new Error("Presentation contains no slides");
    const shell = this.ownerDocument.createElement("div");
    shell.className = "office-presentation";
    const toolbar = this.ownerDocument.createElement("nav");
    toolbar.className = "office-preview-toolbar";
    toolbar.setAttribute("aria-label", "Presentation slide navigation");
    const previous = this.ownerDocument.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.setAttribute("aria-disabled", "true");
    const status = this.#textSpan("Loading presentation", "office-page-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const next = this.ownerDocument.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.setAttribute("aria-disabled", "true");
    toolbar.append(previous, status, next);
    const slideViewport = this.ownerDocument.createElement("div");
    slideViewport.className = "office-slide-viewport";
    slideViewport.setAttribute("aria-label", `${view.name} slide preview`);
    const suppressSlideNavigation = (event: Event): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    slideViewport.addEventListener("click", suppressSlideNavigation, { capture: true });
    slideViewport.addEventListener("auxclick", suppressSlideNavigation, { capture: true });
    shell.append(toolbar, slideViewport);
    stage.replaceChildren(shell);
    this.#observeOfficeResources(slideViewport, job);

    const root = createRoot(slideViewport);
    job.legacyPptRoot = root;
    const controllerHolder: { current: PptxViewerController | null } = { current: null };
    let slideIndex = 0;
    let busy = true;
    const updateControls = (): void => {
      previous.setAttribute("aria-disabled", String(busy || slideIndex <= 0));
      next.setAttribute("aria-disabled", String(busy || slideIndex >= slideCount - 1));
      status.textContent = `Slide ${slideIndex + 1} of ${slideCount}`;
      container.setAttribute("aria-busy", String(busy));
    };
    updateControls();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const window = this.ownerDocument.defaultView;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) window?.clearTimeout(timeout);
        job.abortController.signal.removeEventListener("abort", abort);
        callback();
      };
      const abort = (): void => {
        const error = new Error("Office preview cancelled");
        error.name = "AbortError";
        finish(() => reject(error));
      };
      const timeout = window?.setTimeout(
        () => finish(() => reject(new Error("Presentation rendering timed out"))),
        MAX_PPT_RENDER_MILLISECONDS,
      );
      job.abortController.signal.addEventListener("abort", abort, { once: true });
      root.render(createElement(ReactPptxViewer, {
        source: parsed,
        mode: "slide",
        initialSlide: 0,
        fitMode: "contain",
        height: "100%",
        showToolbar: false,
        showThumbnails: false,
        showNotes: false,
        showDiagnostics: false,
        showSlideLabels: false,
        virtualization: false,
        fonts: {
          loadEmbeddedFonts: false,
          waitForFonts: false,
          reportMissingFonts: false,
          useOfficeFallbacks: true,
        },
        style: { width: "100%", height: "100%" },
        onReady: (readyController) => {
          controllerHolder.current = readyController;
          slideIndex = Math.max(0, Math.min(slideCount - 1, readyController.getSlideIndex()));
          finish(resolve);
        },
        onError: (error) => finish(() => reject(error)),
        onSlideChange: (index) => {
          slideIndex = Math.max(0, Math.min(slideCount - 1, index));
          if (isCurrent()) updateControls();
        },
        onSlideRendered: (_index, element) => {
          if (!isCurrent()) return;
          this.#sanitizeOfficeTree(element);
        },
      }));
      if (job.abortController.signal.aborted) abort();
    });
    if (!isCurrent()) return;
    const readyController = controllerHolder.current;
    if (!readyController) throw new Error("Presentation viewer did not initialize");
    busy = false;
    this.#sanitizeOfficeTree(slideViewport);
    if (this.#boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
    updateControls();

    const showSlideError = (): void => {
      if (!isCurrent()) return;
      busy = true;
      previous.setAttribute("aria-disabled", "true");
      next.setAttribute("aria-disabled", "true");
      status.textContent = "Preview unavailable";
      container.setAttribute("aria-busy", "false");
      job.resourceObserver?.disconnect();
      job.resourceObserver = null;
      job.legacyPptRoot?.unmount();
      job.legacyPptRoot = null;
      slideViewport.replaceChildren(this.#statePanel("Office preview failed", "This presentation slide could not be rendered.", "error", view));
    };
    const renderSlide = async (requested: number): Promise<void> => {
      if (busy || !isCurrent()) return;
      const target = Math.max(0, Math.min(slideCount - 1, requested));
      busy = true;
      updateControls();
      try {
        await readyController.goToSlide(target);
        if (!isCurrent()) return;
        // The controller applies React state asynchronously. Reading it back
        // immediately can return the previous slide even though navigation
        // succeeded, leaving the toolbar one step behind the rendered slide.
        slideIndex = target;
        this.#sanitizeOfficeTree(slideViewport);
        if (this.#boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
      } finally {
        busy = false;
        if (isCurrent()) updateControls();
      }
    };
    previous.addEventListener("click", () => {
      if (!busy && slideIndex > 0) void renderSlide(slideIndex - 1).catch(showSlideError);
    });
    next.addEventListener("click", () => {
      if (!busy && slideIndex < slideCount - 1) void renderSlide(slideIndex + 1).catch(showSlideError);
    });
  }

  async #parseLegacyPpt(bytes: Uint8Array, job: OfficePreviewJob): Promise<ParsedPresentation> {
    const cfbMagic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (bytes.byteLength < cfbMagic.length || !cfbMagic.every((value, index) => bytes[index] === value)) {
      throw new Error("Invalid legacy PowerPoint signature");
    }
    const window = this.ownerDocument.defaultView;
    const WorkerType = window?.Worker;
    const BlobType = window?.Blob;
    const urlApi = window?.URL;
    if (!window || !WorkerType || !BlobType || !urlApi || typeof urlApi.createObjectURL !== "function") {
      throw new Error("Legacy PowerPoint workers are unavailable");
    }

    const workerUrl = urlApi.createObjectURL(new BlobType([__CODE_CODEX_PPT_WORKER_SOURCE__], { type: "text/javascript" }));
    let worker: Worker;
    try {
      worker = new WorkerType(workerUrl, { type: "module", name: "code-codex-ppt-parser" });
    } catch (error) {
      urlApi.revokeObjectURL(workerUrl);
      throw error;
    }
    job.legacyPptWorker = worker;

    let wasmBinary: string;
    try {
      wasmBinary = window.atob(__CODE_CODEX_PPT_WASM_BASE64__);
    } catch {
      worker.terminate();
      job.legacyPptWorker = null;
      urlApi.revokeObjectURL(workerUrl);
      throw new Error("Legacy PowerPoint parser is unavailable");
    }
    const wasmBytes = new Uint8Array(wasmBinary.length);
    for (let index = 0; index < wasmBinary.length; index += 1) wasmBytes[index] = wasmBinary.charCodeAt(index);
    const ownedBytes = bytes.slice().buffer;
    const ownedWasm = wasmBytes.buffer;

    const result = await new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        job.abortController.signal.removeEventListener("abort", abort);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
        window.clearTimeout(timeout);
        worker.terminate();
        if (job.legacyPptWorker === worker) job.legacyPptWorker = null;
        urlApi.revokeObjectURL(workerUrl);
      };
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const abort = (): void => {
        const error = new Error("Office preview cancelled");
        error.name = "AbortError";
        finish(() => reject(error));
      };
      const handleMessage = (event: MessageEvent<unknown>): void => {
        if (!event.data || typeof event.data !== "object") {
          finish(() => reject(new Error("Presentation parser returned an unreadable response")));
          return;
        }
        const response = event.data as { readonly id?: unknown; readonly result?: unknown; readonly error?: unknown };
        if (response.id !== job.generation) return;
        if (typeof response.error === "string" && response.error) {
          const message = response.error;
          finish(() => reject(new Error(message)));
        } else {
          finish(() => resolve(response.result));
        }
      };
      const handleError = (event: ErrorEvent): void => {
        finish(() => reject(event.error instanceof Error ? event.error : new Error(event.message || "Presentation parser failed")));
      };
      const handleMessageError = (): void => {
        finish(() => reject(new Error("Presentation parser returned an unreadable response")));
      };
      const timeout = window.setTimeout(
        () => finish(() => reject(new Error("Presentation parsing timed out"))),
        MAX_PPT_PARSE_MILLISECONDS,
      );
      job.abortController.signal.addEventListener("abort", abort, { once: true });
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      if (job.abortController.signal.aborted) {
        abort();
        return;
      }
      try {
        worker.postMessage(
          { id: job.generation, bytes: ownedBytes, wasmSource: ownedWasm },
          [ownedBytes, ownedWasm],
        );
      } catch (error) {
        finish(() => reject(error));
      }
    });

    let documentValue = result;
    if (typeof documentValue === "string") {
      if (documentValue.length > MAX_OFFICE_TEXT_UNITS) throw new Error("Presentation model exceeds preview limits");
      documentValue = JSON.parse(documentValue) as unknown;
    }
    if (!documentValue || typeof documentValue !== "object") throw new Error("Presentation parser returned no document");
    const document = documentValue as PresentationDocument;
    if (document.format !== "ppt" || !Array.isArray(document.slides) || !Array.isArray(document.warnings)) {
      throw new Error("Presentation parser returned an invalid document");
    }
    return { kind: "parsed-presentation", document, warnings: document.warnings };
  }

  #sanitizeLegacyPptPresentation(parsed: ParsedPresentation): ParsedPresentation {
    const document = parsed.document;
    if (
      document.format !== "ppt" ||
      !document.size ||
      !Number.isFinite(document.size.widthEmu) ||
      !Number.isFinite(document.size.heightEmu) ||
      document.size.widthEmu <= 0 ||
      document.size.heightEmu <= 0 ||
      document.size.widthEmu > 100_000_000 ||
      document.size.heightEmu > 100_000_000 ||
      !Array.isArray(document.slides) ||
      document.slides.length > MAX_PPT_SLIDES ||
      !Array.isArray(document.masters) ||
      !Array.isArray(document.layouts) ||
      document.masters.length > 64 ||
      document.layouts.length > 128 ||
      !document.assets ||
      typeof document.assets !== "object" ||
      Array.isArray(document.assets)
    ) {
      throw new Error("Presentation model exceeds preview limits");
    }

    const allowedAssetTypes = new Set([
      "image/bmp",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/emf",
      "image/wmf",
      "image/x-emf",
      "image/x-wmf",
    ]);
    const allowedAssets = new Set<string>();
    const assets = Object.entries(document.assets);
    if (assets.length > MAX_PPT_ASSETS) throw new Error("Presentation contains too many assets");
    let totalAssetBytes = 0;
    for (const [key, asset] of assets) {
      const validData = asset.data instanceof Uint8Array && asset.data.byteLength === asset.byteLength;
      if (
        !key ||
        key.length > 512 ||
        !asset ||
        typeof asset.id !== "string" ||
        asset.id.length > 512 ||
        !allowedAssetTypes.has(String(asset.contentType).toLowerCase()) ||
        !validData ||
        asset.byteLength <= 0 ||
        asset.byteLength > MAX_PPT_ASSET_BYTES
      ) {
        delete document.assets[key];
        continue;
      }
      totalAssetBytes += asset.byteLength;
      if (totalAssetBytes > MAX_PPT_TOTAL_ASSET_BYTES) throw new Error("Presentation assets exceed preview limits");
      delete asset.url;
      if (asset.fileName && asset.fileName.length > 512) delete asset.fileName;
      allowedAssets.add(asset.id);
      allowedAssets.add(key);
    }

    let nodeCount = 0;
    let textUnits = 0;
    let tableCells = 0;
    const accountText = (text: string): void => {
      textUnits += text.length;
      if (textUnits > MAX_PPT_TEXT_UNITS) throw new Error("Presentation text exceeds preview limits");
    };
    const sanitizeFont = (value: string | undefined): string | undefined => {
      if (!value || value.length > 128 || /[\u0000-\u001f\u007f;{}'"\\]/.test(value)) return undefined;
      return value;
    };
    const sanitizeFill = (fill: PresentationDocument["slides"][number]["background"]): PresentationDocument["slides"][number]["background"] => {
      if (!fill) return undefined;
      if (fill.type === "image" && !allowedAssets.has(fill.assetId)) return undefined;
      if (fill.type === "gradient" && (!Array.isArray(fill.stops) || fill.stops.length > 64)) return undefined;
      return fill;
    };
    const sanitizeNodes = (nodes: SlideNode[], depth: number): SlideNode[] => {
      if (!Array.isArray(nodes) || depth > MAX_PPT_NODE_DEPTH) return [];
      const result: SlideNode[] = [];
      for (const node of nodes) {
        nodeCount += 1;
        if (nodeCount > MAX_PPT_NODES) throw new Error("Presentation contains too many elements");
        if (
          !node ||
          !node.transform ||
          ![node.transform.x, node.transform.y, node.transform.width, node.transform.height].every(Number.isFinite) ||
          Math.abs(node.transform.x) > 200_000_000 ||
          Math.abs(node.transform.y) > 200_000_000 ||
          node.transform.width < 0 ||
          node.transform.height < 0 ||
          node.transform.width > 200_000_000 ||
          node.transform.height > 200_000_000
        ) {
          continue;
        }
        delete node.hyperlink;
        delete node.sourcePart;
        if (node.name && node.name.length > 512) node.name = node.name.slice(0, 512);
        if (node.altText) {
          accountText(node.altText);
          if (node.altText.length > 4_096) node.altText = node.altText.slice(0, 4_096);
        }
        if (node.type === "media") continue;
        if (node.type === "image" && !allowedAssets.has(node.assetId)) continue;
        if (node.type === "unknown") {
          if (!node.fallbackAssetId || !allowedAssets.has(node.fallbackAssetId)) continue;
        } else if (node.type === "group") {
          node.children = sanitizeNodes(node.children, depth + 1);
        } else if (node.type === "shape") {
          const fill = sanitizeFill(node.fill);
          if (fill) node.fill = fill;
          else delete node.fill;
          if (node.geometry.path) {
            accountText(node.geometry.path);
            if (node.geometry.path.length > 256_000) continue;
          }
          if (Array.isArray(node.paragraphs)) {
            for (const paragraph of node.paragraphs) {
              if (!Array.isArray(paragraph.runs)) {
                paragraph.runs = [];
                continue;
              }
              for (const run of paragraph.runs) {
                if (typeof run.text !== "string") run.text = "";
                accountText(run.text);
                delete run.hyperlink;
                for (const property of ["fontFamily", "eastAsianFontFamily", "complexScriptFontFamily", "symbolFontFamily"] as const) {
                  const font = sanitizeFont(run[property]);
                  if (font) run[property] = font;
                  else delete run[property];
                }
              }
            }
          } else {
            delete node.paragraphs;
          }
        } else if (node.type === "table") {
          if (!Array.isArray(node.rows)) continue;
          for (const row of node.rows) {
            if (!Array.isArray(row)) continue;
            tableCells += row.length;
            if (tableCells > MAX_PPT_TABLE_CELLS) throw new Error("Presentation tables exceed preview limits");
            for (const cell of row) {
              const fill = sanitizeFill(cell.fill);
              if (fill) cell.fill = fill;
              else delete cell.fill;
              if (!Array.isArray(cell.paragraphs)) {
                cell.paragraphs = [];
                continue;
              }
              for (const paragraph of cell.paragraphs) {
                if (!Array.isArray(paragraph.runs)) {
                  paragraph.runs = [];
                  continue;
                }
                for (const run of paragraph.runs) {
                  if (typeof run.text !== "string") run.text = "";
                  accountText(run.text);
                  delete run.hyperlink;
                }
              }
            }
          }
        } else if (node.type === "chart") {
          delete node.chartXml;
          delete node.chartStyleXml;
          delete node.chartColorsXml;
          if (!Array.isArray(node.series) || node.series.length > 128) continue;
          if (node.title) accountText(node.title);
          for (const series of node.series) {
            if (!Array.isArray(series.values) || series.values.length > 10_000) throw new Error("Presentation chart exceeds preview limits");
            if (series.name) accountText(series.name);
            if (series.categories) {
              if (!Array.isArray(series.categories) || series.categories.length > 10_000) throw new Error("Presentation chart exceeds preview limits");
              for (const category of series.categories) if (typeof category === "string") accountText(category);
            }
          }
        }
        result.push(node);
      }
      return result;
    };

    for (const slide of document.slides) {
      slide.nodes = sanitizeNodes(slide.nodes, 0);
      const background = sanitizeFill(slide.background);
      if (background) slide.background = background;
      else delete slide.background;
      delete slide.notes;
      delete slide.comments;
      delete slide.sourcePart;
    }
    for (const master of document.masters) master.nodes = sanitizeNodes(master.nodes, 0);
    for (const layout of document.layouts) layout.nodes = sanitizeNodes(layout.nodes, 0);
    document.embeddedFonts = [];
    delete document.metadata;
    const warnings: PresentationWarning[] = [];
    for (const warning of document.warnings.slice(0, 64)) {
      if (!warning || typeof warning.message !== "string") continue;
      accountText(warning.message);
      warnings.push({
        code: warning.code,
        message: warning.message.slice(0, 1_024),
        severity: ["info", "warning", "error"].includes(warning.severity) ? warning.severity : "warning",
        ...(Number.isInteger(warning.slideIndex) ? { slideIndex: warning.slideIndex } : {}),
      });
    }
    document.warnings = warnings;
    return { kind: "parsed-presentation", document, warnings };
  }

  async #renderPptxOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    await this.#assertPptxHasNoExternalRelationships(view.bytes, job.abortController.signal);
    if (!isCurrent()) return;
    const shell = this.ownerDocument.createElement("div");
    shell.className = "office-presentation";
    const toolbar = this.ownerDocument.createElement("nav");
    toolbar.className = "office-preview-toolbar";
    toolbar.setAttribute("aria-label", "Presentation slide navigation");
    const previous = this.ownerDocument.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.setAttribute("aria-disabled", "true");
    const status = this.#textSpan("Loading presentation", "office-page-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const next = this.ownerDocument.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.setAttribute("aria-disabled", "true");
    toolbar.append(previous, status, next);
    const slideViewport = this.ownerDocument.createElement("div");
    slideViewport.className = "office-slide-viewport";
    const suppressSlideNavigation = (event: Event): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    slideViewport.addEventListener("click", suppressSlideNavigation, { capture: true });
    slideViewport.addEventListener("auxclick", suppressSlideNavigation, { capture: true });
    shell.append(toolbar, slideViewport);
    stage.replaceChildren(shell);
    this.#observeOfficeResources(slideViewport, job);

    await this.#yieldOfficeRender();
    if (!isCurrent()) return;
    const viewer = new PptxViewer(slideViewport, {
      fitMode: "contain",
      zipLimits: {
        ...RECOMMENDED_ZIP_LIMITS,
        maxEntryUncompressedBytes: 24 * 1024 * 1024,
        maxTotalUncompressedBytes: 128 * 1024 * 1024,
        maxMediaBytes: 96 * 1024 * 1024,
      },
      lazyMedia: true,
      lazySlides: true,
      pdfjs: false,
    });
    job.viewer = viewer;
    await viewer.open(view.bytes.slice(), {
      renderMode: "slide",
      signal: job.abortController.signal,
      lazyMedia: true,
      lazySlides: true,
    });
    if (!isCurrent()) return;
    const slideCount = viewer.slideCount;
    if (slideCount < 1) throw new Error("Presentation contains no slides");
    let slideIndex = Math.max(0, viewer.currentSlideIndex);
    let busy = false;

    const updateControls = (): void => {
      previous.setAttribute("aria-disabled", String(busy || slideIndex <= 0));
      next.setAttribute("aria-disabled", String(busy || slideIndex >= slideCount - 1));
      status.textContent = `Slide ${slideIndex + 1} of ${slideCount}`;
      container.setAttribute("aria-busy", String(busy));
    };
    const renderSlide = async (requested: number): Promise<void> => {
      if (busy || !isCurrent()) return;
      const target = Math.max(0, Math.min(slideCount - 1, requested));
      busy = true;
      updateControls();
      try {
        await viewer.renderSlide(target);
        if (!isCurrent()) return;
        slideIndex = target;
        this.#sanitizeOfficeTree(slideViewport);
        if (this.#boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
      } finally {
        busy = false;
        if (isCurrent()) updateControls();
      }
    };
    const showSlideError = (): void => {
      if (!isCurrent()) return;
      busy = true;
      previous.setAttribute("aria-disabled", "true");
      next.setAttribute("aria-disabled", "true");
      status.textContent = "Preview unavailable";
      container.setAttribute("aria-busy", "false");
      job.resourceObserver?.disconnect();
      job.resourceObserver = null;
      viewer.destroy();
      if (job.viewer === viewer) job.viewer = null;
      slideViewport.replaceChildren(this.#statePanel("Office preview failed", "This presentation slide could not be rendered.", "error", view));
    };
    previous.addEventListener("click", () => {
      if (!busy && slideIndex > 0) void renderSlide(slideIndex - 1).catch(showSlideError);
    });
    next.addEventListener("click", () => {
      if (!busy && slideIndex < slideCount - 1) void renderSlide(slideIndex + 1).catch(showSlideError);
    });
    this.#sanitizeOfficeTree(slideViewport);
    if (this.#boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
    updateControls();
  }

  async #assertPptxHasNoExternalRelationships(bytes: Uint8Array, signal: AbortSignal): Promise<void> {
    const throwIfAborted = (): void => {
      if (!signal.aborted) return;
      const error = new Error("Office preview cancelled");
      error.name = "AbortError";
      throw error;
    };
    throwIfAborted();
    const archive = await JSZip.loadAsync(bytes.slice(), { checkCRC32: false, createFolders: false });
    throwIfAborted();
    const relationshipFiles = Object.values(archive.files).filter(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".rels"),
    );
    if (relationshipFiles.length > MAX_PPTX_RELATIONSHIP_FILES) {
      throw new Error("Presentation contains too many relationship files");
    }

    const Parser = this.ownerDocument.defaultView?.DOMParser;
    if (!Parser) throw new Error("XML parser is unavailable");
    const parser = new Parser();
    let totalBytes = 0;
    for (const entry of relationshipFiles) {
      throwIfAborted();
      const contents = await entry.async("uint8array");
      throwIfAborted();
      totalBytes += contents.byteLength;
      if (
        contents.byteLength > MAX_PPTX_RELATIONSHIP_FILE_BYTES ||
        totalBytes > MAX_PPTX_RELATIONSHIP_TOTAL_BYTES
      ) {
        throw new Error("Presentation relationships exceed preview limits");
      }
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(contents);
      if (/<!\s*(?:doctype|entity)\b/i.test(xml)) throw new Error("Unsafe relationship XML");
      const document = parser.parseFromString(xml, "application/xml");
      if (document.getElementsByTagName("parsererror").length > 0) {
        throw new Error("Invalid relationship XML");
      }
      const relationships = document.getElementsByTagNameNS("*", "Relationship");
      for (const relationship of relationships) {
        let target = "";
        let targetMode = "";
        for (const attribute of relationship.attributes) {
          const name = attribute.localName.toLowerCase();
          if (name === "target") target = attribute.value.trim();
          else if (name === "targetmode") targetMode = attribute.value.trim();
        }
        let decodedTarget = target;
        for (let pass = 0; pass < 2; pass += 1) {
          try {
            const decoded = decodeURIComponent(decodedTarget);
            if (decoded === decodedTarget) break;
            decodedTarget = decoded;
          } catch {
            break;
          }
        }
        const externalTarget = /^[a-z][a-z0-9+.-]*:/i.test(decodedTarget) ||
          decodedTarget.startsWith("//") ||
          decodedTarget.startsWith("\\\\");
        if (targetMode.toLowerCase() === "external" || externalTarget) {
          const error = new Error("Presentation contains external relationships");
          error.name = "ExternalOfficeResourceError";
          throw error;
        }
      }
    }
  }

  #cancelOfficePreview(): void {
    this.#officeGeneration += 1;
    const job = this.#officeJob;
    this.#officeJob = null;
    if (!job) return;
    job.abortController.abort();
    job.resourceObserver?.disconnect();
    job.resourceObserver = null;
    if (job.docxRepairTimer !== null) {
      globalThis.clearTimeout(job.docxRepairTimer);
      job.docxRepairTimer = null;
    }
    job.viewer?.destroy();
    job.viewer = null;
    job.legacyPptWorker?.terminate();
    job.legacyPptWorker = null;
    job.legacyPptRoot?.unmount();
    job.legacyPptRoot = null;
    job.nativePptObjectUrl?.revoke();
    job.nativePptObjectUrl = null;
  }

  #observeOfficeResources(root: HTMLElement, job: OfficePreviewJob): void {
    job.resourceObserver?.disconnect();
    const Observer = this.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer((records) => {
      if (this.#officeJob !== job || job.abortController.signal.aborted) return;
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target instanceof Element) this.#sanitizeOfficeElement(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) this.#sanitizeOfficeTree(node);
        }
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href", "src", "srcset", "poster", "data", "action", "formaction", "style"],
    });
    job.resourceObserver = observer;
  }

  #takeSanitizedDocxStyles(host: HTMLElement, className: string): HTMLStyleElement[] {
    const result: HTMLStyleElement[] = [];
    for (const generatedStyle of host.querySelectorAll("style")) {
      const cssText = this.#sanitizeDocxCss(generatedStyle.textContent ?? "", className);
      if (!cssText) continue;
      const style = this.ownerDocument.createElement("style");
      style.dataset.officePreview = "docx";
      style.textContent = cssText;
      result.push(style);
    }
    host.replaceChildren();
    return result;
  }

  #sanitizeDocxCss(cssText: string, className: string): string {
    const inertDocument = this.ownerDocument.implementation.createHTMLDocument("");
    const style = inertDocument.createElement("style");
    style.textContent = this.#sanitizeOfficeCssUrls(cssText.replace(/@import\s+[^;{}]+;?/gi, ""));
    inertDocument.head.append(style);

    try {
      const sheet = style.sheet;
      if (!sheet) return "";
      const rules: string[] = [];
      for (const rule of [...sheet.cssRules]) {
        if (rule.type !== 1) continue;
        const styleRule = rule as CSSStyleRule;
        if (!this.#isScopedDocxSelector(styleRule.selectorText, className)) continue;
        this.#sanitizeOfficeStyleDeclaration(styleRule.style);
        if (styleRule.style.length > 0) rules.push(styleRule.cssText);
      }
      return rules.join("\n");
    } catch {
      return "";
    }
  }

  #isScopedDocxSelector(selectorList: string, className: string): boolean {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scope = new RegExp(`^(?:[a-z][a-z0-9-]*)?\\.${escapedClassName}(?:[-_][a-z0-9_-]+)?(?:[:.#\\[]|$)`, "i");
    return selectorList.split(",").every((entry) => {
      const selector = entry.trim();
      if (!selector || /[+~]/.test(selector)) return false;
      const firstCompound = selector.match(/^[^\s>+~]+/)?.[0] ?? "";
      return scope.test(firstCompound);
    });
  }

  #sanitizeOfficeStyleDeclaration(style: CSSStyleDeclaration): void {
    for (let index = style.length - 1; index >= 0; index -= 1) {
      const property = style.item(index);
      const foldedProperty = property.toLowerCase();
      const value = style.getPropertyValue(property);
      const urls = [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((match) => match[2] ?? "");
      const unsafeCustomProperty = foldedProperty.startsWith("--") &&
        !/^--(?:docx|cle-docx-\d+)-[a-z0-9_-]+$/i.test(foldedProperty);
      const unsafeProperty = unsafeCustomProperty ||
        foldedProperty === "behavior" ||
        foldedProperty === "-moz-binding" ||
        foldedProperty.startsWith("animation") ||
        foldedProperty.startsWith("transition");
      const unsafeValue = /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|[\u0000-\u0008\u000b\u000c\u000e-\u001f])/i.test(value) ||
        (foldedProperty === "position" && /^(?:fixed|sticky)$/i.test(value.trim())) ||
        urls.some((url) => !this.#isLocalOfficeResource(url));
      if (unsafeProperty || unsafeValue) style.removeProperty(property);
    }
  }

  #sanitizeOfficeCssUrls(value: string): string {
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote: string, url: string) =>
      this.#isLocalOfficeResource(url) ? match : "url(\"\")");
  }

  #sanitizeDetachedDocx(root: HTMLElement): void {
    const unsafeTags = new Set([
      "audio",
      "base",
      "button",
      "embed",
      "form",
      "iframe",
      "input",
      "link",
      "meta",
      "object",
      "script",
      "select",
      "source",
      "style",
      "textarea",
      "track",
      "video",
    ]);
    const linkableAttributes = new Set([
      "action",
      "background",
      "data",
      "formaction",
      "href",
      "ping",
      "poster",
      "src",
      "srcdoc",
      "srcset",
    ]);
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      const tagName = element.localName.toLowerCase();
      const isSvgElement = element.namespaceURI === DOCX_SVG_NAMESPACE;
      if (isSvgElement && !DOCX_ALLOWED_SVG_TAGS.has(tagName)) {
        element.remove();
        continue;
      }
      if (unsafeTags.has(tagName)) {
        element.remove();
        continue;
      }
      for (const attribute of [...element.attributes]) {
        const name = attribute.localName.toLowerCase();
        if (isSvgElement && !DOCX_ALLOWED_SVG_ATTRIBUTES.has(name)) {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (attribute.name.toLowerCase().startsWith("on")) {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (!linkableAttributes.has(name)) continue;
        if (tagName === "a" || !this.#isLocalOfficeResource(attribute.value)) element.removeAttribute(attribute.name);
      }
      this.#sanitizeOfficeElement(element);
    }
  }

  #sanitizeOfficeTree(root: Element): void {
    this.#sanitizeOfficeElement(root);
    for (const element of root.querySelectorAll("*")) this.#sanitizeOfficeElement(element);
  }

  #sanitizeOfficeElement(element: Element): void {
    const tagName = element.localName.toLowerCase();
    if (["base", "embed", "form", "iframe", "link", "object", "script"].includes(tagName)) {
      element.remove();
      return;
    }
    for (const attribute of [...element.attributes]) {
      const attributeName = attribute.name.toLowerCase();
      if (attributeName.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (attribute.localName.toLowerCase() === "srcset") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (
        ["action", "background", "data", "formaction", "href", "poster", "src"].includes(attribute.localName.toLowerCase()) &&
        !this.#isLocalOfficeResource(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (tagName === "a") {
      for (const attribute of ["download", "href", "ping", "rel", "target"]) element.removeAttribute(attribute);
    }
    element.removeAttribute("srcdoc");
    if (element instanceof HTMLElement || element instanceof SVGElement) {
      this.#sanitizeOfficeStyleDeclaration(element.style);
    }
    if (tagName === "style" && element.textContent) {
      element.textContent = element.textContent
        .replace(/@import\s+[^;]+;?/gi, "");
      element.textContent = this.#sanitizeOfficeCssUrls(element.textContent);
    }
  }

  #isLocalOfficeResource(value: string): boolean {
    const normalized = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
    return normalized === "" ||
      normalized.startsWith("#") ||
      normalized.startsWith("blob:") ||
      /^data:image\/(?:bmp|gif|jpeg|png|webp);base64,/.test(normalized);
  }

  #officeDomCost(root: Node, includeRoot = true): { nodes: number; textUnits: number } {
    const pending: Node[] = includeRoot ? [root] : Array.from(root.childNodes);
    let nodes = 0;
    let textUnits = 0;
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) continue;
      nodes += 1;
      if (node.nodeType === Node.TEXT_NODE) textUnits += (node.nodeValue ?? "").length;
      for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child);
    }
    return { nodes, textUnits };
  }

  #reserveOfficeDomClones(domBudget: OfficeDomBudget, roots: readonly Node[]): boolean {
    let nodes = 0;
    let textUnits = 0;
    for (const root of roots) {
      const cost = this.#officeDomCost(root);
      nodes += cost.nodes;
      textUnits += cost.textUnits;
    }
    if (nodes > domBudget.remainingNodes || textUnits > domBudget.remainingTextUnits) return false;
    domBudget.remainingNodes -= nodes;
    domBudget.remainingTextUnits -= textUnits;
    return true;
  }

  #boundOfficeDom(root: HTMLElement): boolean {
    let nodeCount = 0;
    let textUnits = 0;
    let truncated = false;
    let current: Node | null = root.firstChild;
    const nextAfterSubtree = (node: Node): Node | null => {
      let cursor: Node | null = node;
      while (cursor && cursor !== root) {
        if (cursor.nextSibling) return cursor.nextSibling;
        cursor = cursor.parentNode;
      }
      return null;
    };

    while (current) {
      nodeCount += 1;
      if (nodeCount > MAX_OFFICE_DOM_NODES) {
        const next = nextAfterSubtree(current);
        current.parentNode?.removeChild(current);
        current = next;
        truncated = true;
        continue;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        const text = current.nodeValue ?? "";
        const remaining = Math.max(0, MAX_OFFICE_TEXT_UNITS - textUnits);
        if (remaining === 0 && text.length > 0) {
          const next = nextAfterSubtree(current);
          current.parentNode?.removeChild(current);
          current = next;
          truncated = true;
          continue;
        }
        if (text.length > remaining) {
          current.nodeValue = remaining > 0 ? `${text.slice(0, Math.max(0, remaining - 1))}\u2026` : "";
          textUnits = MAX_OFFICE_TEXT_UNITS;
          truncated = true;
        } else {
          textUnits += text.length;
        }
      }
      current = current.firstChild ?? nextAfterSubtree(current);
    }
    return truncated;
  }

  async #yieldOfficeRender(): Promise<void> {
    await new Promise<void>((resolve) => {
      const window = this.ownerDocument.defaultView;
      if (window) window.setTimeout(resolve, 0);
      else setTimeout(resolve, 0);
    });
  }

  #mediaObjectUrl(view: MainPreviewMediaView): string | null {
    if (!this.#connected) return null;
    const cached = this.#mediaObjectUrls.get(view.path);
    if (cached?.bytes === view.bytes && cached.mimeType === view.mimeType) return cached.url;
    if (cached) this.#revokeMediaObjectUrl(view.path);

    const urlApi = this.ownerDocument.defaultView?.URL ?? globalThis.URL;
    const BlobType = this.ownerDocument.defaultView?.Blob ?? globalThis.Blob;
    if (typeof urlApi?.createObjectURL !== "function" || typeof BlobType !== "function") return null;
    try {
      const underlying = view.bytes.buffer;
      let buffer: ArrayBuffer;
      if (
        underlying instanceof ArrayBuffer &&
        view.bytes.byteOffset === 0 &&
        view.bytes.byteLength === underlying.byteLength
      ) {
        buffer = underlying;
      } else if (underlying instanceof ArrayBuffer) {
        buffer = underlying.slice(view.bytes.byteOffset, view.bytes.byteOffset + view.bytes.byteLength);
      } else {
        buffer = new ArrayBuffer(view.bytes.byteLength);
        new Uint8Array(buffer).set(view.bytes);
      }
      const blob = new BlobType([buffer], { type: view.mimeType });
      const url = urlApi.createObjectURL(blob);
      this.#mediaObjectUrls.set(view.path, {
        bytes: view.bytes,
        mimeType: view.mimeType,
        url,
        revoke: () => urlApi.revokeObjectURL(url),
      });
      return url;
    } catch {
      return null;
    }
  }

  #reconcileMediaObjectUrls(state: MainPreviewState): void {
    for (const [path, cached] of this.#mediaObjectUrls) {
      const view = state.tabs.find((candidate) => candidate.path === path);
      const enabled = isMediaPreviewView(view) &&
        state.enabledPreviewers?.includes(previewerIdForMediaKind(view.kind)) === true;
      if (
        !isMediaPreviewView(view) ||
        view.bytes !== cached.bytes ||
        view.mimeType !== cached.mimeType ||
        !enabled
      ) {
        this.#revokeMediaObjectUrl(path);
      }
    }
  }

  #revokeMediaObjectUrl(path: string): void {
    const cached = this.#mediaObjectUrls.get(path);
    if (!cached) return;
    this.#mediaObjectUrls.delete(path);
    try {
      cached.revoke();
    } catch {
      // The document may already be torn down; dropping the cache is sufficient.
    }
  }

  #revokeAllMediaObjectUrls(): void {
    for (const path of [...this.#mediaObjectUrls.keys()]) this.#revokeMediaObjectUrl(path);
  }

  #statePanel(
    title: string,
    copy: string,
    kind: "loading" | "empty" | "unsupported" | "error",
    view: MainPreviewFileView,
  ): HTMLElement {
    const panel = this.ownerDocument.createElement("div");
    panel.className = `view-state ${kind}`;
    if (kind === "loading") panel.setAttribute("role", "status");
    else if (kind === "error") panel.setAttribute("role", "alert");

    const card = this.ownerDocument.createElement("div");
    card.className = "state-card";
    if (kind === "loading") {
      const spinner = this.ownerDocument.createElement("div");
      spinner.className = "spinner";
      spinner.setAttribute("aria-hidden", "true");
      card.append(spinner);
    } else {
      const icon = kind === "error" ? icons.warning : getFileIcon(view.name).markup;
      card.append(this.#staticIcon(icon, "state-icon"));
    }
    const heading = this.ownerDocument.createElement("h2");
    heading.className = "state-title";
    heading.textContent = title;
    const paragraph = this.ownerDocument.createElement("p");
    paragraph.className = "state-copy";
    paragraph.textContent = copy;
    card.append(heading, paragraph);
    panel.append(card);
    return panel;
  }

  #metadataFor(view: MainPreviewFileView): string {
    switch (view.kind) {
      case "loading":
        return "Loading";
      case "text":
        return view.truncated ? `${formatBytes(view.sizeBytes)} \u00b7 Preview truncated` : formatBytes(view.sizeBytes);
      case "empty":
        return formatBytes(view.sizeBytes);
      case "image":
        return `Image \u00b7 ${formatBytes(view.sizeBytes)}`;
      case "video":
        return `Video \u00b7 ${formatBytes(view.sizeBytes)}`;
      case "pdf":
        return `PDF \u00b7 ${formatBytes(view.sizeBytes)}`;
      case "audio":
        return `Audio \u00b7 ${formatBytes(view.sizeBytes)}`;
      case "office": {
        const kind = officeDocumentKind(view.mimeType);
        return `${kind?.toUpperCase() ?? "Office"} \u00b7 ${formatBytes(view.sizeBytes)}`;
      }
      case "unsupported":
        return formatBytes(view.sizeBytes);
      case "error":
        return view.code || "Preview error";
    }
  }

  #highlightedSource(path: string, source: string): SyntaxHighlight {
    const cached = this.#syntaxCache.get(path);
    if (cached?.source === source) return cached.highlight;
    const highlight = highlightSyntaxForPath(path, source);
    this.#syntaxCache.set(path, { source, highlight });
    return highlight;
  }

  #highlightedCode(path: string, source: string): HTMLElement {
    const code = this.ownerDocument.createElement("code");
    code.className = "syntax-code";
    this.#replaceHighlightedSource(code, path, source);
    return code;
  }

  #markdownReader(view: MainPreviewTextView): HTMLElement {
    return this.#createMarkdownSurface(view, view.text, false);
  }

  #markdownEditor(view: MainPreviewTextView | MainPreviewEmptyView, editor: MainPreviewEditorState): HTMLElement {
    const reader = this.#createMarkdownSurface(view, editor.draft, true);
    const article = reader.querySelector<HTMLElement>(".markdown-editor-surface");
    if (!article) return reader;
    let acceptedDraft = editor.draft;
    const preserveTrailingNewline = editor.draft.endsWith("\n");
    const syncDraft = (): void => {
      const draft = normalizedRenderedMarkdown(markdownSerializer.turndown(article), preserveTrailingNewline);
      if (draft.length > MAX_SYNTAX_SOURCE_UNITS) {
        article.dataset.limitReached = "true";
        this.#populateMarkdownArticle(article, acceptedDraft, true);
        article.focus({ preventScroll: true });
        return;
      }
      delete article.dataset.limitReached;
      acceptedDraft = draft;
      this.#dispatchPathEvent<MainPreviewDraftDetail>(MAIN_PREVIEW_DRAFT_EVENT, { path: view.path, text: draft });
    };
    article.addEventListener("input", syncDraft);
    article.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") syncDraft();
    });
    article.addEventListener("paste", (event) => this.#pastePlainText(event, article));
    article.addEventListener("drop", (event) => event.preventDefault());
    return reader;
  }

  #createMarkdownSurface(
    view: MainPreviewTextView | MainPreviewEmptyView,
    source: string,
    editable: boolean,
  ): HTMLElement {
    const reader = this.ownerDocument.createElement("div");
    reader.className = "markdown-reader";
    if (editable) reader.classList.add("markdown-editor");
    const article = this.ownerDocument.createElement("article");
    article.className = "markdown-body";
    article.setAttribute("aria-label", editable ? `Edit ${view.name} in rendered Markdown` : `${view.name} rendered Markdown preview`);
    if (editable) {
      article.classList.add("markdown-editor-surface");
      article.contentEditable = "true";
      article.spellcheck = true;
      article.setAttribute("role", "textbox");
      article.setAttribute("aria-multiline", "true");
      article.setAttribute("aria-busy", String(this.#state.editor?.saving === true));
    }
    this.#populateMarkdownArticle(article, source, editable);
    article.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target || !article.contains(target)) return;
      if (!editable) event.preventDefault();
      event.stopPropagation();
    });

    if (view.kind === "text" && view.truncated) {
      const notice = this.ownerDocument.createElement("div");
      notice.className = "markdown-truncated";
      notice.textContent = "Preview truncated at the safe file-size limit.";
      reader.append(notice);
    }
    reader.append(article);
    return reader;
  }

  #populateMarkdownArticle(article: HTMLElement, source: string, editable: boolean): void {
    const prepared = editable ? splitMarkdownFrontMatter(source) : { body: source };
    const rendered = (editable ? markdownEditorRenderer : markdownRenderer).render(prepared.body);
    const fragment = DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [...MARKDOWN_ALLOWED_TAGS],
      ALLOWED_ATTR: [
        "align",
        "class",
        "start",
        "title",
        "data-markdown-href",
        "data-markdown-title",
        "data-markdown-image-alt",
        "data-markdown-image-src",
        "data-markdown-image-title",
        "data-markdown-comment",
        "data-markdown-comment-block",
      ],
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["audio", "button", "embed", "form", "iframe", "img", "input", "math", "object", "select", "source", "style", "svg", "textarea", "video"],
      FORBID_ATTR: ["formaction", "ping", "src", "srcset", "style"],
      KEEP_CONTENT: true,
      RETURN_DOM_FRAGMENT: true,
      SANITIZE_NAMED_PROPS: true,
    }) as DocumentFragment;
    article.replaceChildren(fragment);
    const renderedBodyEmpty = !article.hasChildNodes();
    if (editable && renderedBodyEmpty) {
      const paragraph = this.ownerDocument.createElement("p");
      paragraph.append(this.ownerDocument.createElement("br"));
      article.append(paragraph);
    }
    if (editable && prepared.frontMatter) {
      const frontMatter = this.ownerDocument.createElement("div");
      frontMatter.className = "markdown-front-matter-placeholder";
      frontMatter.contentEditable = "false";
      frontMatter.setAttribute("data-markdown-front-matter", prepared.frontMatter);
      frontMatter.textContent = "YAML front matter · source preserved";
      article.prepend(frontMatter);
    }

    for (const anchor of article.querySelectorAll<HTMLAnchorElement>("a")) {
      const href = anchor.getAttribute("data-markdown-href") ?? "";
      anchor.title = href && isSafeMarkdownLink(href) ? `External link disabled in preview: ${href}` : "Link disabled in preview";
      anchor.removeAttribute("href");
      anchor.draggable = false;
    }
    for (const list of article.querySelectorAll<HTMLOListElement>("ol[start]")) {
      const start = Number(list.getAttribute("start"));
      if (!Number.isSafeInteger(start) || start < -1_000_000 || start > 1_000_000) list.removeAttribute("start");
    }
    for (const placeholder of article.querySelectorAll<HTMLElement>(".markdown-image-placeholder")) {
      placeholder.contentEditable = "false";
    }
    for (const placeholder of article.querySelectorAll<HTMLElement>(".markdown-comment-placeholder")) {
      placeholder.contentEditable = "false";
    }
    this.#decorateMarkdownTaskLists(article, editable);
  }

  #decorateMarkdownTaskLists(article: HTMLElement, editable: boolean): void {
    for (const item of article.querySelectorAll<HTMLLIElement>("li")) {
      const textHost = item.firstElementChild?.tagName === "P" ? item.firstElementChild : item;
      if (!textHost) continue;
      const walker = this.ownerDocument.createTreeWalker(textHost, NodeFilter.SHOW_TEXT);
      const firstText = walker.nextNode();
      if (!(firstText instanceof Text)) continue;
      const match = firstText.data.match(/^\s*\[([ xX])\]\s+/);
      if (!match) continue;
      firstText.data = firstText.data.slice(match[0].length);
      const checkbox = this.ownerDocument.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = !editable;
      checkbox.checked = match[1]?.toLowerCase() === "x";
      checkbox.contentEditable = "false";
      checkbox.setAttribute("aria-label", checkbox.checked ? "Completed task" : "Incomplete task");
      firstText.parentNode?.insertBefore(checkbox, firstText);
      item.classList.add("task-list-item");
      item.parentElement?.classList.add("task-list");
    }
  }

  #pastePlainText(event: ClipboardEvent, article: HTMLElement): void {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    if (!text) return;
    if (this.ownerDocument.execCommand("insertText", false, text)) return;
    const selection = this.ownerDocument.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!article.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const inserted = this.ownerDocument.createTextNode(text);
    range.insertNode(inserted);
    range.setStartAfter(inserted);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    article.dispatchEvent(new Event("input", { bubbles: true }));
  }

  #appendEditorError(content: HTMLElement, view: MainPreviewFileView, editor: MainPreviewEditorState): void {
    if (!editor.error) return;
    const error = this.ownerDocument.createElement("div");
    error.className = "editor-error";
    error.setAttribute("role", "alert");
    const copy = this.#textSpan(editor.error, "editor-error-copy");
    copy.title = editor.error;
    const reload = this.ownerDocument.createElement("button");
    reload.type = "button";
    reload.className = "editor-reload";
    reload.textContent = "Reload file";
    reload.addEventListener("click", () => {
      this.#dispatchPathEvent<MainPreviewPathDetail>(MAIN_PREVIEW_RELOAD_EVENT, { path: view.path });
    });
    error.append(copy, reload);
    content.append(error);
  }

  #replaceHighlightedSource(code: HTMLElement, path: string, source: string): void {
    const highlighted = this.#highlightedSource(path, source);
    code.dataset.language = highlighted.language;
    code.toggleAttribute("data-highlight-limited", highlighted.limited);
    const fragment = this.ownerDocument.createDocumentFragment();
    for (const run of highlighted.runs) {
      const tokenText = source.slice(run.start, run.end);
      if (run.kind === "plain") {
        fragment.append(this.ownerDocument.createTextNode(tokenText));
      } else {
        const token = this.ownerDocument.createElement("span");
        token.className = `tok-${run.kind}`;
        token.textContent = tokenText;
        fragment.append(token);
      }
    }
    code.replaceChildren(fragment);
  }

  #lineNumberGutter(surface: HTMLElement, source: string, extraClass = ""): HTMLElement {
    const gutter = this.ownerDocument.createElement("pre");
    gutter.className = `code-line-numbers ${extraClass}`.trim();
    gutter.setAttribute("aria-hidden", "true");
    this.#replaceLineNumbers(gutter, surface, source);
    return gutter;
  }

  #replaceLineNumbers(gutter: HTMLElement, surface: HTMLElement, source: string): void {
    const lineCount = sourceLineCount(source);
    gutter.dataset.lineCount = String(lineCount);
    gutter.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
    const digits = Math.max(2, String(lineCount).length);
    surface.style.setProperty("--cle-line-number-width", `calc(${digits}ch + 24px)`);
  }

  #syncEditorScroll(editor: HTMLTextAreaElement): void {
    const mirror = editor.parentElement?.querySelector<HTMLElement>(".code-editor-highlight");
    if (!mirror) return;
    mirror.scrollTop = editor.scrollTop;
    mirror.scrollLeft = editor.scrollLeft;
    const lineNumbers = editor.parentElement?.querySelector<HTMLElement>(".code-editor-line-numbers");
    if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
  }

  #onTabListClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const close = target.closest<HTMLButtonElement>("button[data-close-path]");
    if (close) {
      const path = close.dataset.closePath;
      if (path) this.#dispatchClose(path);
      return;
    }
    const tab = target.closest<HTMLElement>("[role='tab']");
    if (tab && this.#tabList.contains(tab)) this.#activateTab(tab);
  }

  #onTabListKeyDown(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[role='tab']") : null;
    if (!target || !this.#tabList.contains(target)) return;
    const focusedPath = this.#pathForTab(target);
    if (
      focusedPath !== null &&
      (event.key === "Delete" || (event.key.toLowerCase() === "w" && (event.ctrlKey || event.metaKey)))
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.#dispatchClose(focusedPath);
      return;
    }
    const tabs = this.#tabs();
    const index = tabs.indexOf(target);
    if (index < 0) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    this.#setRovingPath(this.#pathForTab(next));
    next.focus();
    this.#activateTab(next);
  }

  #onShadowKeyDown(event: KeyboardEvent): void {
    if (
      this.#state.editor &&
      event.key.toLocaleLowerCase() === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.#dispatchPathEvent<MainPreviewPathDetail>(MAIN_PREVIEW_SAVE_EVENT, { path: this.#state.editor.path });
      return;
    }
    if (event.key !== "Escape" || this.#state.activePath === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.#rovingPath = null;
    if (!this.#dispatchActivate({ kind: "conversation" })) {
      this.#setRovingPath(this.#state.activePath);
      this.#focusActiveTab();
      return;
    }
    this.#setRovingPath(null);
    this.#tabForPath(null)?.focus();
  }

  #activateTab(tab: HTMLElement): void {
    const path = this.#pathForTab(tab);
    this.#setRovingPath(path);
    const activated = path === null
      ? this.#dispatchActivate({ kind: "conversation" })
      : this.#dispatchActivate({ kind: "file", path });
    if (!activated) {
      this.#setRovingPath(this.#state.activePath);
      this.#focusActiveTab();
    }
  }

  #dispatchActivate(detail: MainPreviewActivateDetail): boolean {
    return this.dispatchEvent(
      new CustomEvent<MainPreviewActivateDetail>(MAIN_PREVIEW_ACTIVATE_EVENT, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      }),
    );
  }

  #dispatchClose(path: string): void {
    this.dispatchEvent(
      new CustomEvent<MainPreviewCloseDetail>(MAIN_PREVIEW_CLOSE_EVENT, { bubbles: true, composed: true, detail: { path } }),
    );
  }

  #dispatchPathEvent<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { bubbles: true, composed: true, detail }));
  }

  #setRovingPath(path: string | null): void {
    this.#rovingPath = path;
    for (const tab of this.#tabs()) tab.tabIndex = this.#pathForTab(tab) === path ? 0 : -1;
  }

  #pathForTab(tab: HTMLElement): string | null {
    return tab.dataset.tabKind === "file" ? (tab.dataset.path ?? null) : null;
  }

  #tabs(): HTMLElement[] {
    return Array.from(this.#tabList.querySelectorAll<HTMLElement>("[role='tab']"));
  }

  #tabForPath(path: string | null): HTMLElement | undefined {
    return this.#tabs().find((tab) => this.#pathForTab(tab) === path);
  }

  #captureFocus(): FocusSnapshot {
    const active = this.#shadow.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    if (active instanceof HTMLTextAreaElement && active.matches(".code-editor")) {
      return {
        kind: "editor",
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
        selectionDirection: active.selectionDirection,
        scrollTop: active.scrollTop,
        scrollLeft: active.scrollLeft,
      };
    }
    if (active.matches(".markdown-editor-surface")) {
      const article = active;
      const selection = this.ownerDocument.getSelection();
      const anchorOffset = selectionOffsetWithin(article, selection?.anchorNode ?? null, selection?.anchorOffset ?? 0);
      const focusOffset = selectionOffsetWithin(article, selection?.focusNode ?? null, selection?.focusOffset ?? 0);
      const scroller = article.closest<HTMLElement>(".preview-content");
      return {
        kind: "markdown-editor",
        anchorOffset: anchorOffset ?? 0,
        focusOffset: focusOffset ?? anchorOffset ?? 0,
        scrollTop: scroller?.scrollTop ?? 0,
        scrollLeft: scroller?.scrollLeft ?? 0,
      };
    }
    if (active.matches("[role='tab']")) return { kind: "tab", path: this.#pathForTab(active) };
    if (active.matches("button[data-close-path]")) {
      const path = active.dataset.closePath;
      return path ? { kind: "close", path } : null;
    }
    if (active.matches(".preview-panel")) return { kind: "panel" };
    return null;
  }

  #restoreFocus(focus: FocusSnapshot): void {
    if (!focus) return;
    if (focus.kind === "editor") {
      const editor = this.#panelMount.querySelector<HTMLTextAreaElement>(".code-editor");
      if (editor) {
        editor.focus();
        editor.setSelectionRange(focus.selectionStart, focus.selectionEnd, focus.selectionDirection);
        editor.scrollTop = focus.scrollTop;
        editor.scrollLeft = focus.scrollLeft;
        this.#syncEditorScroll(editor);
      } else {
        this.#focusActiveTab();
      }
      return;
    }
    if (focus.kind === "markdown-editor") {
      const article = this.#panelMount.querySelector<HTMLElement>(".markdown-editor-surface");
      if (!article) {
        this.#focusActiveTab();
        return;
      }
      article.focus({ preventScroll: true });
      const selection = this.ownerDocument.getSelection();
      if (selection) {
        const anchor = textPositionAtOffset(article, focus.anchorOffset);
        const selectionFocus = textPositionAtOffset(article, focus.focusOffset);
        try {
          selection.setBaseAndExtent(anchor.node, anchor.offset, selectionFocus.node, selectionFocus.offset);
        } catch {
          const range = this.ownerDocument.createRange();
          range.setStart(anchor.node, anchor.offset);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      const scroller = article.closest<HTMLElement>(".preview-content");
      if (scroller) {
        scroller.scrollTop = focus.scrollTop;
        scroller.scrollLeft = focus.scrollLeft;
      }
      return;
    }
    if (focus.kind === "tab") {
      const tab = this.#tabForPath(focus.path);
      if (tab) tab.focus();
      else this.#focusActiveTab();
      return;
    }
    if (focus.kind === "close") {
      const button = Array.from(this.#tabList.querySelectorAll<HTMLButtonElement>("button[data-close-path]")).find(
        (candidate) => candidate.dataset.closePath === focus.path,
      );
      if (button) button.focus();
      else this.#focusActiveTab();
      return;
    }
    const panel = this.#panelMount.querySelector<HTMLElement>(".preview-panel");
    if (panel) panel.focus();
    else this.#focusActiveTab();
  }

  #tabId(path: string): string {
    let id = this.#tabIds.get(path);
    if (!id) {
      this.#nextTabId += 1;
      id = `cle-main-preview-${this.#instanceId}-file-tab-${this.#nextTabId}`;
      this.#tabIds.set(path, id);
    }
    return id;
  }

  #panelId(path: string): string {
    return `${this.#tabId(path)}-panel`;
  }

  #staticIcon(markup: string, className: string): HTMLElement {
    const icon = this.ownerDocument.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = markup;
    return icon;
  }

  #textSpan(text: string, className: string): HTMLSpanElement {
    const span = this.ownerDocument.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  #focusActiveTab(): void {
    (this.#tabForPath(this.#state.activePath) ?? this.#tabForPath(null))?.focus();
  }

  #scrollSelectedTabIntoView(): void {
    const selected = this.#tabForPath(this.#state.activePath);
    const slot = selected?.parentElement;
    if (!slot) return;
    const scrollIntoView = (slot as HTMLElement).scrollIntoView;
    if (typeof scrollIntoView === "function") scrollIntoView.call(slot, { block: "nearest", inline: "nearest" });
  }

  #syncSuppression(): void {
    const parent = this.#connected && this.#state.activePath !== null && this.parentElement?.matches(MAIN_SURFACE_SELECTOR)
      ? this.parentElement
      : null;
    if (!parent) {
      this.#restoreSuppressedChildren();
      return;
    }
    if (this.#suppressedParent !== parent) {
      this.#restoreSuppressedChildren();
      this.#suppressedParent = parent;
      this.#childObserver = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.removedNodes) {
            if (node instanceof Element && node.parentElement !== parent) this.#restoreSuppressedChild(node);
          }
          for (const node of record.addedNodes) {
            if (node instanceof Element && node.parentElement === parent && node !== this) this.#suppressChild(node);
          }
        }
      });
      this.#childObserver.observe(parent, { childList: true });
    }
    for (const child of Array.from(parent.children)) {
      if (child !== this) this.#suppressChild(child);
    }
  }

  #suppressChild(child: Element): void {
    if (this.#suppressedChildren.has(child)) return;
    this.#suppressedChildren.set(child, {
      inert: child.getAttribute("inert"),
      ariaHidden: child.getAttribute("aria-hidden"),
    });
    child.setAttribute("inert", "");
    child.setAttribute("aria-hidden", "true");
  }

  #restoreSuppressedChild(child: Element): void {
    const attributes = this.#suppressedChildren.get(child);
    if (!attributes) return;
    restoreAttribute(child, "inert", attributes.inert);
    restoreAttribute(child, "aria-hidden", attributes.ariaHidden);
    this.#suppressedChildren.delete(child);
  }

  #restoreSuppressedChildren(): void {
    this.#childObserver?.disconnect();
    this.#childObserver = null;
    for (const child of Array.from(this.#suppressedChildren.keys())) this.#restoreSuppressedChild(child);
    this.#suppressedChildren.clear();
    this.#suppressedParent = null;
  }

  #required<T extends Element>(selector: string): T {
    const element = this.#shadow.querySelector<T>(selector);
    if (!element) throw new Error(`Missing main preview element: ${selector}`);
    return element;
  }
}

export function registerMainPreviewElement(): void {
  if (!customElements.get(MAIN_PREVIEW_TAG)) {
    customElements.define(MAIN_PREVIEW_TAG, CodeCodexMainPreviewElement);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "code-codex-main-preview": CodeCodexMainPreviewElement;
  }

  interface HTMLElementEventMap {
    "cle-main-preview-activate": MainPreviewActivateEvent;
    "cle-main-preview-close": MainPreviewCloseEvent;
    "cle-main-preview-draft": MainPreviewDraftEvent;
    "cle-main-preview-save": MainPreviewSaveEvent;
    "cle-main-preview-reload": MainPreviewReloadEvent;
  }
}
