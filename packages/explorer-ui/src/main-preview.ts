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
export const NOTEBOOK_PREVIEWER_ID = "code-codex.notebook-preview";
export const CSV_PREVIEWER_ID = "code-codex.csv-preview";
export const DIAGRAM_PREVIEWER_ID = "code-codex.diagram-preview";
export const NOTEBOOK_PREVIEW_MIME = "application/x-ipynb+json";
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
const MAX_NOTEBOOK_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_NOTEBOOK_CELLS = 500;
const MAX_NOTEBOOK_CELL_SOURCE_UNITS = 256_000;
const MAX_NOTEBOOK_TOTAL_SOURCE_UNITS = 4_000_000;
const MAX_NOTEBOOK_OUTPUTS_PER_CELL = 100;
const MAX_NOTEBOOK_TOTAL_OUTPUTS = 2_000;
const MAX_NOTEBOOK_OUTPUT_TEXT_UNITS = 256_000;
const MAX_NOTEBOOK_TOTAL_OUTPUT_TEXT_UNITS = 2_000_000;
const MAX_NOTEBOOK_HTML_UNITS = 1_000_000;
const MAX_NOTEBOOK_TOTAL_HTML_UNITS = 4_000_000;
const MAX_NOTEBOOK_SVG_UNITS = 1_000_000;
const MAX_NOTEBOOK_SVG_NODES = 10_000;
const MAX_NOTEBOOK_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_NOTEBOOK_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_NOTEBOOK_DOM_NODES = 30_000;
const MAX_NOTEBOOK_TRACEBACK_LINES = 200;
const MAX_NOTEBOOK_ATTACHMENTS = 1_000;
const MAX_NOTEBOOK_TEXT_SEGMENTS = 16_384;
const MAX_NOTEBOOK_MARKDOWN_TOKENS = 10_000;
const MAX_NOTEBOOK_HTML_TAGS = 10_000;
const MAX_NOTEBOOK_RASTER_DIMENSION = 16_384;
const MAX_NOTEBOOK_RASTER_PIXELS = 16_777_216;
const MAX_NOTEBOOK_RASTER_FRAMES = 256;
const MAX_NOTEBOOK_RASTER_FRAME_PIXELS = 67_108_864;
const MAX_CSV_ROWS = 1_000;
const MAX_CSV_COLUMNS = 128;
const MAX_CSV_CELLS = 10_000;
const MAX_CSV_CELL_TEXT_UNITS = 16_384;
const MAX_DRAWIO_INFLATED_BYTES = 2 * 1024 * 1024;
const MAX_DRAWIO_PAGES = 32;
const MAX_DRAWIO_CELLS = 5_000;
const MAX_DRAWIO_VERTICES = 1_500;
const MAX_DRAWIO_EDGES = 2_500;
const MAX_DRAWIO_XML_ELEMENTS = 20_000;
const MAX_DRAWIO_XML_NODES = 60_000;
const MAX_DRAWIO_XML_DEPTH = 64;
const MAX_DRAWIO_XML_ATTRIBUTES = 120_000;
const MAX_DRAWIO_XML_ATTRIBUTES_PER_ELEMENT = 128;
const MAX_DRAWIO_XML_ATTRIBUTE_UNITS = 1_500_000;
const MAX_DRAWIO_XML_TAG_UNITS = 65_536;
const MAX_DIAGRAM_LABEL_UNITS = 1_000;
const MAX_DIAGRAM_LINE_CHARACTERS = 160;
const MAX_DIAGRAM_SVG_NODES = 24_000;
const MAX_DIAGRAM_SVG_TEXT_UNITS = 256_000;
const MAX_DIAGRAM_COORDINATE = 1_000_000;
const MAX_DIAGRAM_VIEWBOX_SPAN = 100_000;
const MAX_DIAGRAM_VIEWBOX_ASPECT = 100;
const MIN_DIAGRAM_DISPLAY_WIDTH = 240;
const MIN_DIAGRAM_DISPLAY_HEIGHT = 180;
const MAX_DIAGRAM_DISPLAY_WIDTH = 1_800;
const MAX_DIAGRAM_DISPLAY_HEIGHT = 1_200;
const MAX_PLANTUML_STATEMENTS = 256;
const MAX_PLANTUML_NESTING = 16;
const NOTEBOOK_RENDER_BATCH_CELLS = 4;

type OfficeDocumentKind = "docx" | "xlsx" | "ppt" | "pptx";

type NotebookMimeBundle = Readonly<Record<string, unknown>>;

interface NotebookModel {
  readonly minor: number;
  readonly languagePath: string;
  readonly languageLabel: string;
  readonly kernelLabel: string;
  readonly cells: readonly NotebookCellModel[];
  readonly reservedOutputTextUnits: number;
  readonly limited: boolean;
  readonly newerMinor: boolean;
}

interface CsvModel {
  readonly rows: readonly (readonly string[])[];
  readonly totalRows: number;
  readonly maximumColumns: number;
  readonly limited: boolean;
  readonly malformed: boolean;
}

type DiagramSourceKind = "drawio" | "plantuml";

interface DrawioPageSource {
  readonly name: string;
  readonly model: Element | null;
  readonly encoded: string | null;
}

interface DrawioCellGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DrawioVertex {
  readonly id: string;
  readonly parentId: string;
  readonly label: string;
  readonly style: ReadonlyMap<string, string>;
  readonly geometry: DrawioCellGeometry;
  readonly group: boolean;
}

interface DrawioEdge {
  readonly label: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly style: ReadonlyMap<string, string>;
  readonly points: readonly DiagramPoint[];
  readonly sourcePoint: DiagramPoint | null;
  readonly targetPoint: DiagramPoint | null;
}

interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

interface DiagramSvgBudget {
  nodes: number;
  textUnits: number;
}

type PlantActivityStatement =
  | { readonly kind: "start" | "stop" }
  | { readonly kind: "action"; readonly label: string }
  | {
      readonly kind: "if";
      readonly label: string;
      readonly yesLabel: string;
      readonly noLabel: string;
      readonly thenBranch: readonly PlantActivityStatement[];
      readonly elseBranch: readonly PlantActivityStatement[];
    };

interface PlantActivityTheme {
  readonly background: string;
  readonly fill: string;
  readonly stroke: string;
  readonly diamondFill: string;
  readonly diamondStroke: string;
  readonly font: string;
  readonly roundCorner: number;
}

interface PlantActivityModel {
  readonly title: string;
  readonly statements: readonly PlantActivityStatement[];
  readonly theme: PlantActivityTheme;
  readonly unsupported: number;
}

type PlantLayoutNodeKind = "start" | "stop" | "action" | "decision" | "join";

interface PlantLayoutNode {
  readonly kind: PlantLayoutNodeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

interface PlantLayoutEdge {
  readonly points: readonly DiagramPoint[];
  readonly label: string;
}

interface PlantBlockLayout {
  readonly width: number;
  readonly height: number;
  readonly entry: DiagramPoint | null;
  readonly exit: DiagramPoint | null;
  readonly nodes: readonly PlantLayoutNode[];
  readonly edges: readonly PlantLayoutEdge[];
}

type NotebookCellModel =
  | {
      readonly kind: "markdown";
      readonly source: string;
      readonly attachments: ReadonlyMap<string, NotebookMimeBundle>;
    }
  | {
      readonly kind: "code";
      readonly source: string;
      readonly executionCount: number | null;
      readonly outputs: readonly NotebookOutputModel[];
    }
  | { readonly kind: "raw"; readonly source: string }
  | { readonly kind: "unsupported"; readonly reason: string };

type NotebookOutputModel =
  | { readonly kind: "stream"; readonly name: "stdout" | "stderr"; readonly text: string }
  | { readonly kind: "error"; readonly ename: string; readonly evalue: string; readonly traceback: string }
  | {
      readonly kind: "display";
      readonly executionCount: number | null;
      readonly data: NotebookMimeBundle;
    }
  | { readonly kind: "unsupported" };

interface NotebookParseBudget {
  sourceUnits: number;
  outputCount: number;
  outputTextUnits: number;
  attachmentCount: number;
  limited: boolean;
}

interface NotebookRenderBudget {
  htmlUnits: number;
  outputTextUnits: number;
  imageBytes: number;
  domNodes: number;
  limited: boolean;
}

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
  readonly kind: "image" | "video" | "pdf" | "audio" | "office" | "notebook";
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

function isCsvPreviewPath(path: string): boolean {
  return path.replaceAll("\\", "/").toLowerCase().endsWith(".csv");
}

function diagramSourceKind(path: string): DiagramSourceKind | null {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  if (normalized.endsWith(".drawio")) return "drawio";
  if (normalized.endsWith(".plantuml")) return "plantuml";
  return null;
}

function isDiagramPreviewPath(path: string): boolean {
  return diagramSourceKind(path) !== null;
}

function parseCsv(source: string, allowIncompleteFinalRecord = false): CsvModel {
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (input.length === 0) {
    return { rows: [], totalRows: 0, maximumColumns: 0, limited: false, malformed: false };
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let rowColumns = 0;
  let totalRows = 0;
  let maximumColumns = 0;
  let retainedCells = 0;
  let inQuotes = false;
  let atFieldStart = true;
  let afterClosingQuote = false;
  let endedAtRecordBoundary = false;
  let limited = false;
  let malformed = false;

  const canRetainField = (): boolean =>
    totalRows < MAX_CSV_ROWS && rowColumns < MAX_CSV_COLUMNS && retainedCells < MAX_CSV_CELLS;
  const append = (value: string): void => {
    if (!canRetainField()) {
      limited = true;
      return;
    }
    const remaining = MAX_CSV_CELL_TEXT_UNITS - field.length;
    if (remaining <= 0) {
      limited = true;
      return;
    }
    const candidate = value.slice(0, remaining);
    const finalCodeUnit = candidate.charCodeAt(candidate.length - 1);
    const safeCandidate = finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff ? candidate.slice(0, -1) : candidate;
    field += safeCandidate;
    if (safeCandidate.length < value.length) limited = true;
  };
  const finishField = (): void => {
    if (canRetainField()) {
      row.push(field);
      retainedCells += 1;
    } else {
      limited = true;
    }
    rowColumns += 1;
    field = "";
    atFieldStart = true;
    afterClosingQuote = false;
  };
  const finishRow = (): void => {
    finishField();
    maximumColumns = Math.max(maximumColumns, rowColumns);
    if (totalRows < MAX_CSV_ROWS && row.length > 0) rows.push(row);
    else limited = true;
    totalRows += 1;
    row = [];
    rowColumns = 0;
  };

  for (let index = 0; index < input.length; index += 1) {
    let character = input[index] ?? "";
    const firstCodeUnit = character.charCodeAt(0);
    const secondCodeUnit = input.charCodeAt(index + 1);
    if (
      firstCodeUnit >= 0xd800 && firstCodeUnit <= 0xdbff &&
      secondCodeUnit >= 0xdc00 && secondCodeUnit <= 0xdfff
    ) {
      character += input[index + 1];
      index += 1;
    }
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else if (character === "\r") {
        append("\n");
        if (input[index + 1] === "\n") index += 1;
      } else {
        append(character);
      }
      endedAtRecordBoundary = false;
      continue;
    }

    if (character === ",") {
      finishField();
      endedAtRecordBoundary = false;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      finishRow();
      endedAtRecordBoundary = true;
      continue;
    }
    if (character === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      endedAtRecordBoundary = false;
      continue;
    }
    if (character === '"') malformed = true;
    if (afterClosingQuote) malformed = true;
    append(character);
    atFieldStart = false;
    afterClosingQuote = false;
    endedAtRecordBoundary = false;
  }

  if (inQuotes && !allowIncompleteFinalRecord) malformed = true;
  if (!endedAtRecordBoundary || rowColumns > 0 || field.length > 0 || atFieldStart === false) finishRow();
  return { rows, totalRows, maximumColumns, limited, malformed };
}

function visibleCsvCellText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });
}

function boundedDiagramNumber(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function safeDiagramColor(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^#[0-9a-f]{6}$/.test(normalized) || /^#[0-9a-f]{3}$/.test(normalized) ? normalized : fallback;
}

function parseDrawioStyle(value: string | null): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const source = (value ?? "").slice(0, 8_192);
  for (const token of source.split(";", 128)) {
    const separator = token.indexOf("=");
    const key = (separator < 0 ? token : token.slice(0, separator)).trim().toLowerCase();
    if (!key || !/^[a-z][a-z0-9_.-]{0,63}$/.test(key)) continue;
    result.set(key, separator < 0 ? "1" : token.slice(separator + 1).trim().slice(0, 256));
  }
  return result;
}

function decodedDrawioEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  if (named[normalized] !== undefined) return named[normalized];
  const numeric = normalized.startsWith("#x")
    ? Number.parseInt(normalized.slice(2), 16)
    : normalized.startsWith("#")
      ? Number.parseInt(normalized.slice(1), 10)
      : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff)
    ? String.fromCodePoint(numeric)
    : `&${entity};`;
}

function plainDrawioLabel(value: string | null): string {
  return (value ?? "")
    .slice(0, MAX_DIAGRAM_LABEL_UNITS * 4)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]{0,1024}>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (_match, entity: string) => decodedDrawioEntity(entity))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, MAX_DIAGRAM_LABEL_UNITS)
    .trim();
}

function assertDiagramNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException("The diagram preview was cancelled.", "AbortError");
}

function enforceDiagramXmlBudget(source: string, signal?: AbortSignal): void {
  let index = 0;
  let depth = 0;
  let elements = 0;
  let nodes = 0;
  let attributes = 0;
  let attributeUnits = 0;
  const countNode = (): void => {
    nodes += 1;
    if (nodes > MAX_DRAWIO_XML_NODES) throw new Error("The diagram XML has too many nodes to preview safely.");
  };
  while (index < source.length) {
    assertDiagramNotAborted(signal);
    const opening = source.indexOf("<", index);
    if (opening < 0) {
      if (index < source.length) countNode();
      break;
    }
    if (opening > index) countNode();
    if (source.startsWith("<!--", opening)) {
      const ending = source.indexOf("-->", opening + 4);
      if (ending < 0) throw new Error("The diagram XML contains an incomplete comment.");
      countNode();
      index = ending + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", opening)) {
      const ending = source.indexOf("]]>", opening + 9);
      if (ending < 0) throw new Error("The diagram XML contains an incomplete CDATA section.");
      countNode();
      index = ending + 3;
      continue;
    }
    if (source.startsWith("<?", opening)) {
      const ending = source.indexOf("?>", opening + 2);
      if (ending < 0 || ending - opening > MAX_DRAWIO_XML_TAG_UNITS) {
        throw new Error("The diagram XML declaration exceeds the safe preview limit.");
      }
      countNode();
      index = ending + 2;
      continue;
    }
    if (source.startsWith("</", opening)) {
      const ending = source.indexOf(">", opening + 2);
      if (ending < 0 || ending - opening > MAX_DRAWIO_XML_TAG_UNITS) {
        throw new Error("A diagram XML closing tag exceeds the safe preview limit.");
      }
      depth -= 1;
      if (depth < 0) throw new Error("The diagram XML nesting is malformed.");
      index = ending + 1;
      continue;
    }
    if (source.startsWith("<!", opening)) {
      throw new Error("Unsupported XML declarations are not allowed in diagram previews.");
    }
    let cursor = opening + 1;
    while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
    const nameStart = cursor;
    while (cursor < source.length && !/[\s/>]/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor === nameStart) throw new Error("The diagram XML contains a malformed element.");
    elements += 1;
    if (elements > MAX_DRAWIO_XML_ELEMENTS) throw new Error("The diagram XML has too many elements to preview safely.");
    countNode();
    depth += 1;
    if (depth > MAX_DRAWIO_XML_DEPTH) throw new Error("The diagram XML nesting is too deep to preview safely.");
    let elementAttributes = 0;
    let closed = false;
    while (cursor < source.length) {
      assertDiagramNotAborted(signal);
      if (cursor - opening > MAX_DRAWIO_XML_TAG_UNITS) throw new Error("A diagram XML tag exceeds the safe preview limit.");
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] === ">") {
        cursor += 1;
        closed = true;
        break;
      }
      if (source[cursor] === "/" && source[cursor + 1] === ">") {
        cursor += 2;
        depth -= 1;
        closed = true;
        break;
      }
      const attributeStart = cursor;
      while (cursor < source.length && !/[\s=/>]/.test(source[cursor] ?? "")) cursor += 1;
      if (cursor === attributeStart) throw new Error("The diagram XML contains a malformed attribute.");
      const attributeNameUnits = cursor - attributeStart;
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] !== "=") throw new Error("The diagram XML contains an unquoted attribute.");
      cursor += 1;
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
      const quote = source[cursor];
      if (quote !== '"' && quote !== "'") throw new Error("The diagram XML contains an unquoted attribute value.");
      const valueStart = cursor + 1;
      const valueEnd = source.indexOf(quote, valueStart);
      if (valueEnd < 0) throw new Error("The diagram XML contains an incomplete attribute value.");
      const valueUnits = valueEnd - valueStart;
      cursor = valueEnd + 1;
      elementAttributes += 1;
      attributes += 1;
      attributeUnits += attributeNameUnits + valueUnits;
      if (elementAttributes > MAX_DRAWIO_XML_ATTRIBUTES_PER_ELEMENT) {
        throw new Error("A diagram XML element has too many attributes to preview safely.");
      }
      if (attributes > MAX_DRAWIO_XML_ATTRIBUTES || attributeUnits > MAX_DRAWIO_XML_ATTRIBUTE_UNITS) {
        throw new Error("The diagram XML attribute budget was exceeded.");
      }
    }
    if (!closed) throw new Error("The diagram XML contains an incomplete element.");
    index = cursor;
  }
  if (depth !== 0) throw new Error("The diagram XML nesting is malformed.");
  assertDiagramNotAborted(signal);
}

function parseSafeDiagramXml(Parser: typeof DOMParser, source: string, signal?: AbortSignal): XMLDocument {
  if (source.length === 0 || source.length > MAX_DRAWIO_INFLATED_BYTES) {
    throw new Error("The diagram XML exceeds the safe preview limit.");
  }
  assertDiagramNotAborted(signal);
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const declaration = withoutBom.match(/^\s*<\?xml\s+[^?]{0,512}\?>/i)?.[0] ?? "";
  const remaining = declaration ? withoutBom.slice(declaration.length) : withoutBom;
  if (
    /<\?/.test(remaining) ||
    /<\s*!(?:doctype|entity)\b/i.test(remaining) ||
    /<(?:[a-z][\w.-]*:)?include\b/i.test(remaining)
  ) {
    throw new Error("External resources and XML directives are not allowed in diagram previews.");
  }
  enforceDiagramXmlBudget(withoutBom, signal);
  assertDiagramNotAborted(signal);
  const document = new Parser().parseFromString(withoutBom, "application/xml");
  for (const element of document.getElementsByTagName("*")) {
    if (element.localName.toLowerCase() === "parsererror") throw new Error("The diagram XML is malformed.");
  }
  assertDiagramNotAborted(signal);
  return document;
}

function drawioPages(Parser: typeof DOMParser, source: string, signal?: AbortSignal): {
  readonly pages: readonly DrawioPageSource[];
  readonly limited: boolean;
} {
  const document = parseSafeDiagramXml(Parser, source, signal);
  const root = document.documentElement;
  const rootName = root.localName.toLowerCase();
  if (rootName === "mxgraphmodel") {
    return { pages: [{ name: "Page 1", model: root, encoded: null }], limited: false };
  }
  if (rootName !== "mxfile") throw new Error("This is not a Draw.io diagram.");
  const pageElements = Array.from(root.children).filter((element) => element.localName.toLowerCase() === "diagram");
  if (pageElements.length === 0) throw new Error("The Draw.io file has no pages.");
  const pages = pageElements.slice(0, MAX_DRAWIO_PAGES).map((page, index): DrawioPageSource => ({
    name: plainDrawioLabel(xmlAttribute(page, "name")) || `Page ${index + 1}`,
    model: directXmlChild(page, "mxGraphModel"),
    encoded: directXmlChild(page, "mxGraphModel") ? null : (page.textContent ?? "").trim(),
  }));
  return { pages, limited: pageElements.length > pages.length };
}

async function inflateDrawioPage(encoded: string, signal?: AbortSignal): Promise<string> {
  assertDiagramNotAborted(signal);
  const compact = encoded.replace(/\s+/g, "");
  if (!compact || compact.length > 128 * 1024 || !/^[a-z0-9+/]*={0,2}$/i.test(compact)) {
    throw new Error("The compressed Draw.io page is invalid.");
  }
  let binary: string;
  try {
    binary = atob(compact);
  } catch {
    throw new Error("The compressed Draw.io page is invalid.");
  }
  const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const cancelReader = (): void => {
    void reader?.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });
  try {
    assertDiagramNotAborted(signal);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    reader = stream.getReader();
    assertDiagramNotAborted(signal);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      assertDiagramNotAborted(signal);
      const result = await reader.read();
      assertDiagramNotAborted(signal);
      if (result.done) break;
      const chunk = result.value;
      length += chunk.byteLength;
      if (length > MAX_DRAWIO_INFLATED_BYTES) {
        await reader.cancel();
        throw new Error("The compressed Draw.io page expands beyond the safe preview limit.");
      }
      chunks.push(chunk);
    }
    const inflated = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      inflated.set(chunk, offset);
      offset += chunk.byteLength;
    }
    assertDiagramNotAborted(signal);
    const escaped = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
    const xml = decodeURIComponent(escaped);
    if (xml.length > MAX_DRAWIO_INFLATED_BYTES) throw new Error("The diagram XML exceeds the safe preview limit.");
    return xml;
  } catch (error) {
    if (signal?.aborted) assertDiagramNotAborted(signal);
    if (error instanceof Error && error.message.includes("safe preview limit")) throw error;
    throw new Error("This compressed Draw.io page could not be decoded locally.");
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    if (signal?.aborted) {
      try {
        await reader?.cancel(signal.reason);
      } catch {
        // Cancellation can race with a completed or errored stream.
      }
    }
    try {
      reader?.releaseLock();
    } catch {
      // The bounded reader may already have been cancelled.
    }
  }
}

async function drawioPageModel(
  Parser: typeof DOMParser,
  page: DrawioPageSource,
  signal?: AbortSignal,
): Promise<Element> {
  assertDiagramNotAborted(signal);
  if (page.model) return page.model;
  const encoded = page.encoded ?? "";
  const xml = encoded.trimStart().startsWith("<") ? encoded : await inflateDrawioPage(encoded, signal);
  assertDiagramNotAborted(signal);
  const document = parseSafeDiagramXml(Parser, xml, signal);
  if (document.documentElement.localName.toLowerCase() !== "mxgraphmodel") {
    throw new Error("The Draw.io page does not contain a graph model.");
  }
  return document.documentElement;
}

function drawioGeometry(cell: Element): DrawioCellGeometry | null {
  const geometry = directXmlChild(cell, "mxGeometry");
  if (!geometry) return null;
  return {
    x: boundedDiagramNumber(xmlAttribute(geometry, "x"), 0, -1_000_000, 1_000_000),
    y: boundedDiagramNumber(xmlAttribute(geometry, "y"), 0, -1_000_000, 1_000_000),
    width: boundedDiagramNumber(xmlAttribute(geometry, "width"), 120, 1, 100_000),
    height: boundedDiagramNumber(xmlAttribute(geometry, "height"), 50, 1, 100_000),
  };
}

function drawioPoint(element: Element): DiagramPoint {
  return {
    x: boundedDiagramNumber(xmlAttribute(element, "x"), 0, -1_000_000, 1_000_000),
    y: boundedDiagramNumber(xmlAttribute(element, "y"), 0, -1_000_000, 1_000_000),
  };
}

function drawioGraph(model: Element): {
  readonly vertices: readonly DrawioVertex[];
  readonly edges: readonly DrawioEdge[];
} {
  const cells: Element[] = [];
  for (const element of model.getElementsByTagName("*")) {
    if (element.localName.toLowerCase() !== "mxcell") continue;
    if (cells.length >= MAX_DRAWIO_CELLS) throw new Error("This Draw.io page has too many cells to preview safely.");
    cells.push(element);
  }
  const vertices: DrawioVertex[] = [];
  const edges: DrawioEdge[] = [];
  const ids = new Set<string>();
  for (const cell of cells) {
    const id = (xmlAttribute(cell, "id") ?? "").slice(0, 512);
    if (id && ids.has(id)) continue;
    if (id) ids.add(id);
    const style = parseDrawioStyle(xmlAttribute(cell, "style"));
    if (xmlAttribute(cell, "vertex") === "1") {
      if (vertices.length >= MAX_DRAWIO_VERTICES) throw new Error("This Draw.io page has too many shapes to preview safely.");
      const geometry = drawioGeometry(cell);
      if (!id || !geometry) continue;
      vertices.push({
        id,
        parentId: (xmlAttribute(cell, "parent") ?? "").slice(0, 512),
        label: plainDrawioLabel(xmlAttribute(cell, "value")),
        style,
        geometry,
        group: style.has("group") || style.get("shape")?.toLowerCase() === "group",
      });
      continue;
    }
    if (xmlAttribute(cell, "edge") !== "1") continue;
    if (edges.length >= MAX_DRAWIO_EDGES) throw new Error("This Draw.io page has too many connectors to preview safely.");
    const geometry = directXmlChild(cell, "mxGeometry");
    const points: DiagramPoint[] = [];
    let sourcePoint: DiagramPoint | null = null;
    let targetPoint: DiagramPoint | null = null;
    if (geometry) {
      for (const child of geometry.children) {
        const childName = child.localName.toLowerCase();
        if (childName === "mxpoint") {
          const purpose = (xmlAttribute(child, "as") ?? "").toLowerCase();
          if (purpose === "sourcepoint") sourcePoint = drawioPoint(child);
          else if (purpose === "targetpoint") targetPoint = drawioPoint(child);
        } else if (childName === "array" && (xmlAttribute(child, "as") ?? "").toLowerCase() === "points") {
          for (const point of Array.from(child.children).slice(0, 128)) {
            if (point.localName.toLowerCase() === "mxpoint") points.push(drawioPoint(point));
          }
        }
      }
    }
    edges.push({
      label: plainDrawioLabel(xmlAttribute(cell, "value")),
      sourceId: (xmlAttribute(cell, "source") ?? "").slice(0, 512),
      targetId: (xmlAttribute(cell, "target") ?? "").slice(0, 512),
      style,
      points,
      sourcePoint,
      targetPoint,
    });
  }
  return { vertices, edges };
}

function absoluteDrawioVertices(vertices: readonly DrawioVertex[]): ReadonlyMap<string, DrawioVertex> {
  const original = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const resolved = new Map<string, DrawioVertex>();
  const visiting = new Set<string>();
  const resolve = (vertex: DrawioVertex, depth: number): DrawioVertex => {
    const existing = resolved.get(vertex.id);
    if (existing) return existing;
    if (depth > 64 || visiting.has(vertex.id)) throw new Error("The Draw.io page contains cyclic group geometry.");
    visiting.add(vertex.id);
    const parent = original.get(vertex.parentId);
    const parentGeometry = parent ? resolve(parent, depth + 1).geometry : null;
    const absoluteX = vertex.geometry.x + (parentGeometry?.x ?? 0);
    const absoluteY = vertex.geometry.y + (parentGeometry?.y ?? 0);
    if (
      !Number.isFinite(absoluteX) ||
      !Number.isFinite(absoluteY) ||
      Math.abs(absoluteX) > MAX_DIAGRAM_COORDINATE ||
      Math.abs(absoluteY) > MAX_DIAGRAM_COORDINATE
    ) {
      throw new Error("The Draw.io group coordinates exceed the safe preview limit.");
    }
    const absolute: DrawioVertex = {
      ...vertex,
      geometry: {
        ...vertex.geometry,
        x: absoluteX,
        y: absoluteY,
      },
    };
    visiting.delete(vertex.id);
    resolved.set(vertex.id, absolute);
    return absolute;
  };
  for (const vertex of vertices) resolve(vertex, 0);
  return resolved;
}

function diagramSvgElement(document: Document, name: string, budget: DiagramSvgBudget): SVGElement {
  budget.nodes += 1;
  if (budget.nodes > MAX_DIAGRAM_SVG_NODES) throw new Error("The diagram SVG node budget was exceeded.");
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function setDiagramSvgText(element: SVGElement, value: string, budget: DiagramSvgBudget): string {
  let text = value.slice(0, MAX_DIAGRAM_LABEL_UNITS);
  const finalCodeUnit = text.charCodeAt(text.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) text = text.slice(0, -1);
  budget.textUnits += text.length;
  if (text) budget.nodes += 1;
  if (budget.textUnits > MAX_DIAGRAM_SVG_TEXT_UNITS || budget.nodes > MAX_DIAGRAM_SVG_NODES) {
    throw new Error("The diagram SVG text budget was exceeded.");
  }
  element.textContent = text;
  return text;
}

function setBoundedDiagramSvgViewport(
  svg: SVGSVGElement,
  minimumX: number,
  minimumY: number,
  viewWidth: number,
  viewHeight: number,
): void {
  if (
    !Number.isFinite(minimumX) ||
    !Number.isFinite(minimumY) ||
    !Number.isFinite(viewWidth) ||
    !Number.isFinite(viewHeight) ||
    viewWidth <= 0 ||
    viewHeight <= 0 ||
    viewWidth > MAX_DIAGRAM_VIEWBOX_SPAN ||
    viewHeight > MAX_DIAGRAM_VIEWBOX_SPAN
  ) {
    throw new Error("The diagram dimensions exceed the safe preview limit.");
  }
  const aspect = Math.max(viewWidth / viewHeight, viewHeight / viewWidth);
  if (!Number.isFinite(aspect) || aspect > MAX_DIAGRAM_VIEWBOX_ASPECT) {
    throw new Error("The diagram aspect ratio exceeds the safe preview limit.");
  }
  let displayWidth = Math.min(MAX_DIAGRAM_DISPLAY_WIDTH, Math.max(MIN_DIAGRAM_DISPLAY_WIDTH, viewWidth));
  let displayHeight = displayWidth * viewHeight / viewWidth;
  if (displayHeight > MAX_DIAGRAM_DISPLAY_HEIGHT) {
    displayHeight = MAX_DIAGRAM_DISPLAY_HEIGHT;
    displayWidth = Math.max(MIN_DIAGRAM_DISPLAY_WIDTH, displayHeight * viewWidth / viewHeight);
  }
  displayWidth = Math.min(MAX_DIAGRAM_DISPLAY_WIDTH, Math.max(MIN_DIAGRAM_DISPLAY_WIDTH, displayWidth));
  displayHeight = Math.min(MAX_DIAGRAM_DISPLAY_HEIGHT, Math.max(MIN_DIAGRAM_DISPLAY_HEIGHT, displayHeight));
  const boundedWidth = Math.ceil(displayWidth);
  const boundedHeight = Math.ceil(displayHeight);
  svg.setAttribute("viewBox", `${minimumX} ${minimumY} ${viewWidth} ${viewHeight}`);
  svg.setAttribute("width", String(boundedWidth));
  svg.setAttribute("height", String(boundedHeight));
  svg.style.width = `${boundedWidth}px`;
  svg.style.height = `${boundedHeight}px`;
}

function diagramPolylineMidpoint(points: readonly DiagramPoint[]): DiagramPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0] ?? { x: 0, y: 0 };
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] ?? points[0] ?? { x: 0, y: 0 };
    const point = points[index] ?? previous;
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1] ?? 0;
    const previous = points[index - 1] ?? points[0] ?? { x: 0, y: 0 };
    const point = points[index] ?? previous;
    if (remaining <= length || index === points.length - 1) {
      const ratio = length > 0 ? remaining / length : 0;
      return { x: previous.x + (point.x - previous.x) * ratio, y: previous.y + (point.y - previous.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function drawioBoundaryPoint(vertex: DrawioVertex, toward: DiagramPoint): DiagramPoint {
  const { x, y, width, height } = vertex.geometry;
  const center = { x: x + width / 2, y: y + height / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = 1 / Math.max(Math.abs(dx) / Math.max(1, width / 2), Math.abs(dy) / Math.max(1, height / 2));
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function wrappedDiagramLines(value: string, maximumCharacters: number, maximumLines: number): readonly string[] {
  const result: string[] = [];
  const width = Math.min(MAX_DIAGRAM_LINE_CHARACTERS, Math.max(4, Math.trunc(maximumCharacters)));
  for (const requestedLine of value.split(/\r?\n/)) {
    const words = requestedLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push("");
      continue;
    }
    let line = "";
    let lineLength = 0;
    for (const word of words) {
      const characters = Array.from(word);
      if (characters.length > width) {
        if (line) {
          result.push(line);
          line = "";
          lineLength = 0;
        }
        for (let index = 0; index < characters.length; index += width) {
          result.push(characters.slice(index, index + width).join(""));
        }
      } else if (!line || lineLength + 1 + characters.length <= width) {
        line = line ? `${line} ${word}` : word;
        lineLength = lineLength === 0 ? characters.length : lineLength + 1 + characters.length;
      } else {
        result.push(line);
        line = word;
        lineLength = characters.length;
      }
    }
    if (line) result.push(line);
  }
  const normalized = result.slice(0, maximumLines);
  if (result.length > maximumLines && normalized.length > 0) {
    const final = normalized[normalized.length - 1] ?? "";
    normalized[normalized.length - 1] = `${Array.from(final).slice(0, Math.max(1, width - 1)).join("")}\u2026`;
  }
  return normalized;
}

function appendDiagramSvgText(
  document: Document,
  parent: SVGElement,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  fontSize: number,
  budget: DiagramSvgBudget,
): void {
  if (!label) return;
  const boundedLabel = label.slice(0, MAX_DIAGRAM_LABEL_UNITS);
  const text = diagramSvgElement(document, "text", budget);
  text.setAttribute("x", String(x + width / 2));
  text.setAttribute("y", String(y + height / 2));
  text.setAttribute("fill", color);
  text.setAttribute("font-family", "Segoe UI, sans-serif");
  text.setAttribute("font-size", String(fontSize));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  const lines = wrappedDiagramLines(boundedLabel, Math.max(5, Math.floor(width / Math.max(6, fontSize * 0.56))), Math.max(1, Math.floor(height / (fontSize * 1.25))));
  const lineHeight = fontSize * 1.22;
  for (let index = 0; index < lines.length; index += 1) {
    const span = diagramSvgElement(document, "tspan", budget);
    span.setAttribute("x", String(x + width / 2));
    span.setAttribute("dy", index === 0 ? String(-((lines.length - 1) * lineHeight) / 2) : String(lineHeight));
    setDiagramSvgText(span, lines[index] ?? "", budget);
    text.append(span);
  }
  const title = diagramSvgElement(document, "title", budget);
  setDiagramSvgText(title, boundedLabel, budget);
  text.append(title);
  parent.append(text);
}

function drawioShapeKind(style: ReadonlyMap<string, string>): "rect" | "ellipse" | "rhombus" | "hexagon" | "parallelogram" | "cylinder" | "unsupported" {
  const shape = style.get("shape")?.trim().toLowerCase() ?? "";
  if (style.has("rhombus") || shape === "rhombus") return "rhombus";
  if (style.has("ellipse") || shape === "ellipse" || shape === "doubleellipse") return "ellipse";
  if (shape === "hexagon") return "hexagon";
  if (shape === "parallelogram") return "parallelogram";
  if (shape === "cylinder" || shape === "cylinder3") return "cylinder";
  if (!shape || shape === "rectangle" || shape === "label" || shape === "process") return "rect";
  return "unsupported";
}

function appendDrawioShape(document: Document, parent: SVGElement, vertex: DrawioVertex, budget: DiagramSvgBudget): boolean {
  const { x, y, width, height } = vertex.geometry;
  const fill = safeDiagramColor(vertex.style.get("fillcolor"), "var(--cle-main-raised)");
  const stroke = safeDiagramColor(vertex.style.get("strokecolor"), "var(--cle-main-muted)");
  const font = safeDiagramColor(vertex.style.get("fontcolor"), "var(--cle-main-text)");
  const strokeWidth = boundedDiagramNumber(vertex.style.get("strokewidth") ?? null, 1.2, 0.5, 8);
  const kind = drawioShapeKind(vertex.style);
  let shape: SVGElement;
  if (kind === "ellipse") {
    shape = diagramSvgElement(document, "ellipse", budget);
    shape.setAttribute("cx", String(x + width / 2));
    shape.setAttribute("cy", String(y + height / 2));
    shape.setAttribute("rx", String(width / 2));
    shape.setAttribute("ry", String(height / 2));
  } else if (kind === "rhombus" || kind === "hexagon" || kind === "parallelogram") {
    shape = diagramSvgElement(document, "polygon", budget);
    const points = kind === "rhombus"
      ? [[x + width / 2, y], [x + width, y + height / 2], [x + width / 2, y + height], [x, y + height / 2]]
      : kind === "hexagon"
        ? [[x + width * 0.22, y], [x + width * 0.78, y], [x + width, y + height / 2], [x + width * 0.78, y + height], [x + width * 0.22, y + height], [x, y + height / 2]]
        : [[x + width * 0.18, y], [x + width, y], [x + width * 0.82, y + height], [x, y + height]];
    shape.setAttribute("points", points.map((point) => point.join(",")).join(" "));
  } else {
    shape = diagramSvgElement(document, "rect", budget);
    shape.setAttribute("x", String(x));
    shape.setAttribute("y", String(y));
    shape.setAttribute("width", String(width));
    shape.setAttribute("height", String(height));
    if (vertex.style.get("rounded") === "1" || kind === "cylinder") {
      const radius = Math.min(14, width / 5, height / 3);
      shape.setAttribute("rx", String(radius));
      shape.setAttribute("ry", String(radius));
    }
  }
  shape.setAttribute("fill", fill);
  shape.setAttribute("stroke", stroke);
  shape.setAttribute("stroke-width", String(strokeWidth));
  if (vertex.style.get("dashed") === "1") shape.setAttribute("stroke-dasharray", "6 4");
  parent.append(shape);
  const fontSize = boundedDiagramNumber(vertex.style.get("fontsize") ?? null, 14, 8, 32);
  appendDiagramSvgText(document, parent, vertex.label, x + 5, y + 4, Math.max(1, width - 10), Math.max(1, height - 8), font, fontSize, budget);
  return kind !== "unsupported";
}

function renderDrawioSvg(document: Document, model: Element, accessibleName: string): {
  readonly svg: SVGSVGElement;
  readonly unsupportedShapes: number;
} {
  const budget: DiagramSvgBudget = { nodes: 0, textUnits: 0 };
  const graph = drawioGraph(model);
  const vertices = absoluteDrawioVertices(graph.vertices);
  const drawableVertices = [...vertices.values()].filter((vertex) => !vertex.group);
  if (drawableVertices.length === 0 && graph.edges.length === 0) throw new Error("This Draw.io page has no drawable cells.");
  const svg = diagramSvgElement(document, "svg", budget) as SVGSVGElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", accessibleName);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const title = diagramSvgElement(document, "title", budget);
  setDiagramSvgText(title, accessibleName, budget);
  svg.append(title);
  const definitions = diagramSvgElement(document, "defs", budget);
  const marker = diagramSvgElement(document, "marker", budget);
  const markerId = `cle-diagram-arrow-${++nextDiagramMarkerId}`;
  marker.setAttribute("id", markerId);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const markerPath = diagramSvgElement(document, "path", budget);
  markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  markerPath.setAttribute("fill", "context-stroke");
  marker.append(markerPath);
  definitions.append(marker);
  svg.append(definitions);
  const edgeLayer = diagramSvgElement(document, "g", budget);
  const shapeLayer = diagramSvgElement(document, "g", budget);
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  const includePoint = (point: DiagramPoint): void => {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > MAX_DIAGRAM_COORDINATE ||
      Math.abs(point.y) > MAX_DIAGRAM_COORDINATE
    ) {
      throw new Error("The Draw.io geometry exceeds the safe preview limit.");
    }
    minimumX = Math.min(minimumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumX = Math.max(maximumX, point.x);
    maximumY = Math.max(maximumY, point.y);
  };
  for (const vertex of drawableVertices) {
    includePoint({ x: vertex.geometry.x, y: vertex.geometry.y });
    includePoint({ x: vertex.geometry.x + vertex.geometry.width, y: vertex.geometry.y + vertex.geometry.height });
  }
  for (const edge of graph.edges) {
    const source = vertices.get(edge.sourceId);
    const target = vertices.get(edge.targetId);
    const sourceCenter = source
      ? { x: source.geometry.x + source.geometry.width / 2, y: source.geometry.y + source.geometry.height / 2 }
      : edge.sourcePoint;
    const targetCenter = target
      ? { x: target.geometry.x + target.geometry.width / 2, y: target.geometry.y + target.geometry.height / 2 }
      : edge.targetPoint;
    if (!sourceCenter || !targetCenter) continue;
    let points: DiagramPoint[] = [sourceCenter, ...edge.points, targetCenter];
    if (edge.points.length === 0 && (edge.style.get("edgestyle") ?? "").toLowerCase().includes("orthogonal")) {
      const middleX = (sourceCenter.x + targetCenter.x) / 2;
      points = [sourceCenter, { x: middleX, y: sourceCenter.y }, { x: middleX, y: targetCenter.y }, targetCenter];
    }
    if (source) points[0] = drawioBoundaryPoint(source, points[1] ?? targetCenter);
    if (target) points[points.length - 1] = drawioBoundaryPoint(target, points[points.length - 2] ?? sourceCenter);
    for (const point of points) includePoint(point);
    const path = diagramSvgElement(document, "path", budget);
    path.setAttribute("d", points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", safeDiagramColor(edge.style.get("strokecolor"), "var(--cle-main-muted)"));
    path.setAttribute("stroke-width", String(boundedDiagramNumber(edge.style.get("strokewidth") ?? null, 1.35, 0.5, 8)));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    if (edge.style.get("dashed") === "1") path.setAttribute("stroke-dasharray", "6 4");
    if ((edge.style.get("endarrow") ?? "block").toLowerCase() !== "none") path.setAttribute("marker-end", `url(#${markerId})`);
    if ((edge.style.get("startarrow") ?? "none").toLowerCase() !== "none") path.setAttribute("marker-start", `url(#${markerId})`);
    edgeLayer.append(path);
    if (edge.label) {
      const midpoint = diagramPolylineMidpoint(points);
      appendDiagramSvgText(document, edgeLayer, edge.label, midpoint.x - 65, midpoint.y - 15, 130, 30, "var(--cle-main-text)", 12, budget);
    }
  }
  let unsupportedShapes = 0;
  for (const vertex of drawableVertices) {
    if (!appendDrawioShape(document, shapeLayer, vertex, budget)) unsupportedShapes += 1;
  }
  svg.append(edgeLayer, shapeLayer);
  if (!Number.isFinite(minimumX) || !Number.isFinite(minimumY) || !Number.isFinite(maximumX) || !Number.isFinite(maximumY)) {
    throw new Error("The Draw.io page has no visible geometry.");
  }
  const margin = 32;
  const viewWidth = Math.max(120, maximumX - minimumX + margin * 2);
  const viewHeight = Math.max(100, maximumY - minimumY + margin * 2);
  setBoundedDiagramSvgViewport(svg, minimumX - margin, minimumY - margin, viewWidth, viewHeight);
  return { svg, unsupportedShapes };
}

function plainPlantUmlLabel(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/<[^>]{0,1024}>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, MAX_DIAGRAM_LABEL_UNITS)
    .trim();
}

function parsePlantUmlActivity(source: string): PlantActivityModel {
  const withoutComments = source.replace(/\/\'[\s\S]*?(?:\'\/|$)/g, "");
  const body: string[] = [];
  let title = "PlantUML activity diagram";
  let background = "var(--cle-main-bg)";
  let fill = "var(--cle-main-raised)";
  let stroke = "var(--cle-main-muted)";
  let diamondFill = "var(--cle-main-raised)";
  let diamondStroke = "var(--cle-main-muted)";
  let font = "var(--cle-main-text)";
  let roundCorner = 12;
  let inActivitySkin = false;
  let unsupported = 0;
  const applySkinParameter = (key: string, value: string, activity: boolean): void => {
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = value.trim().split(/\s+/, 1)[0] ?? "";
    if (!activity && normalizedKey === "backgroundcolor") background = safeDiagramColor(normalizedValue, background);
    else if (!activity && normalizedKey === "roundcorner") roundCorner = boundedDiagramNumber(normalizedValue, roundCorner, 0, 36);
    else if (activity && normalizedKey === "backgroundcolor") fill = safeDiagramColor(normalizedValue, fill);
    else if (activity && normalizedKey === "bordercolor") stroke = safeDiagramColor(normalizedValue, stroke);
    else if (activity && normalizedKey === "diamondbackgroundcolor") diamondFill = safeDiagramColor(normalizedValue, diamondFill);
    else if (activity && normalizedKey === "diamondbordercolor") diamondStroke = safeDiagramColor(normalizedValue, diamondStroke);
    else if (activity && normalizedKey === "fontcolor") font = safeDiagramColor(normalizedValue, font);
  };
  for (const requestedLine of withoutComments.replace(/\r\n?/g, "\n").split("\n")) {
    const line = requestedLine.trim();
    if (!line || line.startsWith("'")) continue;
    if (/^!(?:include|include_once|import|theme|pragma|function|procedure|unquoted)/i.test(line) || /^include\b/i.test(line)) {
      throw new Error("PlantUML includes, themes, imports, and preprocessors are disabled in local preview.");
    }
    if (/^@(?:startuml|enduml)\b/i.test(line)) continue;
    if (/^title\s+/i.test(line)) {
      title = plainPlantUmlLabel(line.replace(/^title\s+/i, "")) || title;
      continue;
    }
    if (inActivitySkin) {
      if (line === "}") {
        inActivitySkin = false;
        continue;
      }
      const match = line.match(/^([a-z][a-z0-9]*)\s+(.+)$/i);
      if (match?.[1] && match[2]) applySkinParameter(match[1], match[2], true);
      else unsupported += 1;
      continue;
    }
    if (/^skinparam\s+activity\s*\{$/i.test(line)) {
      inActivitySkin = true;
      continue;
    }
    const skinParameter = line.match(/^skinparam\s+([a-z][a-z0-9]*)\s+(.+)$/i);
    if (skinParameter?.[1] && skinParameter[2]) {
      applySkinParameter(skinParameter[1], skinParameter[2], false);
      continue;
    }
    body.push(line);
  }
  if (inActivitySkin) throw new Error("The PlantUML skinparam block is incomplete.");

  let index = 0;
  let statements = 0;
  const parseBlock = (depth: number): readonly PlantActivityStatement[] => {
    if (depth > MAX_PLANTUML_NESTING) throw new Error("The PlantUML activity nesting is too deep to preview safely.");
    const result: PlantActivityStatement[] = [];
    while (index < body.length) {
      const line = body[index] ?? "";
      if (/^(?:else\b|endif\b)/i.test(line)) break;
      index += 1;
      let statement: PlantActivityStatement | null = null;
      if (/^start$/i.test(line)) statement = { kind: "start" };
      else if (/^(?:stop|end)$/i.test(line)) statement = { kind: "stop" };
      else if (line.startsWith(":") && line.endsWith(";")) {
        const label = plainPlantUmlLabel(line.slice(1, -1));
        if (label) statement = { kind: "action", label };
      } else if (/^if\s*\(/i.test(line)) {
        const thenMarker = line.toLowerCase().lastIndexOf(") then");
        const opening = line.indexOf("(");
        if (opening < 0 || thenMarker <= opening) throw new Error("A PlantUML if statement is malformed.");
        const condition = plainPlantUmlLabel(line.slice(opening + 1, thenMarker));
        const tail = line.slice(thenMarker + 6).trim();
        const yesLabel = plainPlantUmlLabel(tail.replace(/^\((.*)\)$/, "$1")) || "yes";
        const thenBranch = parseBlock(depth + 1);
        let noLabel = "no";
        let elseBranch: readonly PlantActivityStatement[] = [];
        const delimiter = body[index] ?? "";
        if (/^else\b/i.test(delimiter)) {
          noLabel = plainPlantUmlLabel(delimiter.replace(/^else\s*(?:\((.*)\))?$/i, "$1")) || "no";
          index += 1;
          elseBranch = parseBlock(depth + 1);
        }
        if (!/^endif$/i.test(body[index] ?? "")) throw new Error("A PlantUML if statement is missing endif.");
        index += 1;
        statement = {
          kind: "if",
          label: condition || "Decision",
          yesLabel,
          noLabel,
          thenBranch,
          elseBranch,
        };
      } else {
        unsupported += 1;
      }
      if (!statement) continue;
      statements += 1;
      if (statements > MAX_PLANTUML_STATEMENTS) throw new Error("This PlantUML activity has too many statements to preview safely.");
      result.push(statement);
    }
    return result;
  };
  const parsed = parseBlock(0);
  if (index < body.length) unsupported += body.length - index;
  if (parsed.length === 0) throw new Error("No supported PlantUML activity statements were found.");
  return {
    title,
    statements: parsed,
    theme: { background, fill, stroke, diamondFill, diamondStroke, font, roundCorner },
    unsupported,
  };
}

function translatePlantLayout(layout: PlantBlockLayout, x: number, y: number): PlantBlockLayout {
  const translatePoint = (point: DiagramPoint): DiagramPoint => ({ x: point.x + x, y: point.y + y });
  return {
    width: layout.width,
    height: layout.height,
    entry: layout.entry ? translatePoint(layout.entry) : null,
    exit: layout.exit ? translatePoint(layout.exit) : null,
    nodes: layout.nodes.map((node) => ({ ...node, x: node.x + x, y: node.y + y })),
    edges: layout.edges.map((edge) => ({ ...edge, points: edge.points.map(translatePoint) })),
  };
}

function emptyPlantLayout(): PlantBlockLayout {
  return {
    width: 110,
    height: 1,
    entry: { x: 55, y: 0 },
    exit: { x: 55, y: 1 },
    nodes: [],
    edges: [],
  };
}

function layoutSimplePlantStatement(statement: Exclude<PlantActivityStatement, { readonly kind: "if" }>): PlantBlockLayout {
  if (statement.kind === "action") {
    const requestedLines = wrappedDiagramLines(statement.label, 34, 8);
    const longest = Math.max(10, ...requestedLines.map((line) => Array.from(line).length));
    const width = Math.min(330, Math.max(180, longest * 7.2 + 34));
    const height = Math.max(52, requestedLines.length * 18 + 24);
    return {
      width,
      height,
      entry: { x: width / 2, y: 0 },
      exit: { x: width / 2, y: height },
      nodes: [{ kind: "action", x: 0, y: 0, width, height, label: statement.label }],
      edges: [],
    };
  }
  const size = statement.kind === "start" ? 18 : 22;
  return {
    width: size,
    height: size,
    entry: { x: size / 2, y: 0 },
    exit: { x: size / 2, y: size },
    nodes: [{ kind: statement.kind, x: 0, y: 0, width: size, height: size, label: "" }],
    edges: [],
  };
}

function layoutPlantIf(statement: Extract<PlantActivityStatement, { readonly kind: "if" }>): PlantBlockLayout {
  const thenLayout = statement.thenBranch.length > 0 ? layoutPlantBlock(statement.thenBranch) : emptyPlantLayout();
  const elseLayout = statement.elseBranch.length > 0 ? layoutPlantBlock(statement.elseBranch) : emptyPlantLayout();
  const gap = 100;
  const branchWidth = thenLayout.width + gap + elseLayout.width;
  const width = Math.max(250, branchWidth);
  const diamondWidth = 180;
  const diamondHeight = 86;
  const centerX = width / 2;
  const branchTop = diamondHeight + 54;
  const branchStartX = (width - branchWidth) / 2;
  const translatedThen = translatePlantLayout(thenLayout, branchStartX, branchTop);
  const translatedElse = translatePlantLayout(elseLayout, branchStartX + thenLayout.width + gap, branchTop);
  const branchBottom = branchTop + Math.max(thenLayout.height, elseLayout.height);
  const joinY = branchBottom + 40;
  const joinSize = 12;
  const thenEntry = translatedThen.entry ?? { x: branchStartX + thenLayout.width / 2, y: branchTop };
  const elseEntry = translatedElse.entry ?? { x: branchStartX + thenLayout.width + gap + elseLayout.width / 2, y: branchTop };
  const thenExit = translatedThen.exit ?? thenEntry;
  const elseExit = translatedElse.exit ?? elseEntry;
  const leftStart = { x: centerX - diamondWidth / 2, y: diamondHeight / 2 };
  const rightStart = { x: centerX + diamondWidth / 2, y: diamondHeight / 2 };
  const join = { x: centerX, y: joinY + joinSize / 2 };
  const edges: PlantLayoutEdge[] = [
    ...translatedThen.edges,
    ...translatedElse.edges,
    { points: [leftStart, { x: thenEntry.x, y: leftStart.y }, thenEntry], label: statement.yesLabel },
    { points: [rightStart, { x: elseEntry.x, y: rightStart.y }, elseEntry], label: statement.noLabel },
    { points: [thenExit, { x: thenExit.x, y: join.y }, join], label: "" },
    { points: [elseExit, { x: elseExit.x, y: join.y }, join], label: "" },
  ];
  return {
    width,
    height: joinY + joinSize,
    entry: { x: centerX, y: 0 },
    exit: { x: centerX, y: joinY + joinSize },
    nodes: [
      { kind: "decision", x: centerX - diamondWidth / 2, y: 0, width: diamondWidth, height: diamondHeight, label: statement.label },
      ...translatedThen.nodes,
      ...translatedElse.nodes,
      { kind: "join", x: centerX - joinSize / 2, y: joinY, width: joinSize, height: joinSize, label: "" },
    ],
    edges,
  };
}

function layoutPlantBlock(statements: readonly PlantActivityStatement[]): PlantBlockLayout {
  if (statements.length === 0) return emptyPlantLayout();
  const layouts = statements.map((statement) => statement.kind === "if" ? layoutPlantIf(statement) : layoutSimplePlantStatement(statement));
  const width = Math.max(...layouts.map((layout) => layout.width));
  const nodes: PlantLayoutNode[] = [];
  const edges: PlantLayoutEdge[] = [];
  let y = 0;
  let entry: DiagramPoint | null = null;
  let previousExit: DiagramPoint | null = null;
  for (const layout of layouts) {
    const translated = translatePlantLayout(layout, (width - layout.width) / 2, y);
    if (!entry) entry = translated.entry;
    if (previousExit && translated.entry) edges.push({ points: [previousExit, translated.entry], label: "" });
    nodes.push(...translated.nodes);
    edges.push(...translated.edges);
    previousExit = translated.exit;
    y += layout.height + 38;
  }
  return {
    width,
    height: Math.max(1, y - 38),
    entry,
    exit: previousExit,
    nodes,
    edges,
  };
}

function renderPlantUmlActivitySvg(document: Document, model: PlantActivityModel, accessibleName: string): SVGSVGElement {
  const budget: DiagramSvgBudget = { nodes: 0, textUnits: 0 };
  const layout = layoutPlantBlock(model.statements);
  const titleHeight = model.title ? 48 : 0;
  const margin = 36;
  const viewWidth = Math.max(280, layout.width + margin * 2);
  const viewHeight = Math.max(180, layout.height + titleHeight + margin * 2);
  const offsetX = (viewWidth - layout.width) / 2;
  const offsetY = margin + titleHeight;
  const translated = translatePlantLayout(layout, offsetX, offsetY);
  const svg = diagramSvgElement(document, "svg", budget) as SVGSVGElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", accessibleName);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  setBoundedDiagramSvgViewport(svg, 0, 0, viewWidth, viewHeight);
  const titleNode = diagramSvgElement(document, "title", budget);
  setDiagramSvgText(titleNode, accessibleName, budget);
  svg.append(titleNode);
  const background = diagramSvgElement(document, "rect", budget);
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(viewWidth));
  background.setAttribute("height", String(viewHeight));
  background.setAttribute("fill", model.theme.background);
  svg.append(background);
  const definitions = diagramSvgElement(document, "defs", budget);
  const marker = diagramSvgElement(document, "marker", budget);
  const markerId = `cle-diagram-arrow-${++nextDiagramMarkerId}`;
  marker.setAttribute("id", markerId);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto");
  const markerPath = diagramSvgElement(document, "path", budget);
  markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  markerPath.setAttribute("fill", model.theme.stroke);
  marker.append(markerPath);
  definitions.append(marker);
  svg.append(definitions);
  if (model.title) appendDiagramSvgText(document, svg, model.title, margin, margin - 10, viewWidth - margin * 2, 38, model.theme.font, 17, budget);
  const edges = diagramSvgElement(document, "g", budget);
  for (const edge of translated.edges) {
    if (edge.points.length < 2) continue;
    const path = diagramSvgElement(document, "path", budget);
    path.setAttribute("d", edge.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", model.theme.stroke);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("marker-end", `url(#${markerId})`);
    edges.append(path);
    if (edge.label) {
      const midpoint = diagramPolylineMidpoint(edge.points);
      appendDiagramSvgText(document, edges, edge.label, midpoint.x - 42, midpoint.y - 21, 84, 24, model.theme.font, 11, budget);
    }
  }
  svg.append(edges);
  const nodes = diagramSvgElement(document, "g", budget);
  for (const node of translated.nodes) {
    let shape: SVGElement;
    if (node.kind === "start" || node.kind === "join") {
      shape = diagramSvgElement(document, "circle", budget);
      shape.setAttribute("cx", String(node.x + node.width / 2));
      shape.setAttribute("cy", String(node.y + node.height / 2));
      shape.setAttribute("r", String(node.width / 2));
      shape.setAttribute("fill", model.theme.stroke);
    } else if (node.kind === "stop") {
      shape = diagramSvgElement(document, "circle", budget);
      shape.setAttribute("cx", String(node.x + node.width / 2));
      shape.setAttribute("cy", String(node.y + node.height / 2));
      shape.setAttribute("r", String(node.width / 2 - 1));
      shape.setAttribute("fill", model.theme.background);
      shape.setAttribute("stroke", model.theme.stroke);
      shape.setAttribute("stroke-width", "2");
      const center = diagramSvgElement(document, "circle", budget);
      center.setAttribute("cx", String(node.x + node.width / 2));
      center.setAttribute("cy", String(node.y + node.height / 2));
      center.setAttribute("r", String(Math.max(3, node.width / 2 - 5)));
      center.setAttribute("fill", model.theme.stroke);
      nodes.append(shape, center);
      continue;
    } else if (node.kind === "decision") {
      shape = diagramSvgElement(document, "polygon", budget);
      shape.setAttribute("points", [
        `${node.x + node.width / 2},${node.y}`,
        `${node.x + node.width},${node.y + node.height / 2}`,
        `${node.x + node.width / 2},${node.y + node.height}`,
        `${node.x},${node.y + node.height / 2}`,
      ].join(" "));
      shape.setAttribute("fill", model.theme.diamondFill);
      shape.setAttribute("stroke", model.theme.diamondStroke);
      shape.setAttribute("stroke-width", "1.4");
    } else {
      shape = diagramSvgElement(document, "rect", budget);
      shape.setAttribute("x", String(node.x));
      shape.setAttribute("y", String(node.y));
      shape.setAttribute("width", String(node.width));
      shape.setAttribute("height", String(node.height));
      shape.setAttribute("rx", String(Math.min(model.theme.roundCorner, node.height / 3)));
      shape.setAttribute("fill", model.theme.fill);
      shape.setAttribute("stroke", model.theme.stroke);
      shape.setAttribute("stroke-width", "1.4");
    }
    nodes.append(shape);
    if (node.label) {
      appendDiagramSvgText(document, nodes, node.label, node.x + 7, node.y + 5, node.width - 14, node.height - 10, model.theme.font, 13, budget);
    }
  }
  svg.append(nodes);
  return svg;
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

const notebookMarkdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: renderMarkdownFence,
});

notebookMarkdownRenderer.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const alt = String(token?.content ?? "").trim() || String(token?.attrGet("alt") ?? "").trim() || "Notebook image";
  const source = String(token?.attrGet("src") ?? "");
  return `<span class="notebook-image-placeholder" data-notebook-image-alt="${escapeMarkdownHtml(alt)}" data-notebook-image-src="${escapeMarkdownHtml(source)}">Image \u00b7 ${escapeMarkdownHtml(alt)}</span>`;
};

function notebookRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function notebookJoinedText(
  value: unknown,
  maximum: number,
): { readonly text: string; readonly valid: boolean; readonly truncated: boolean } {
  const limit = Math.max(0, maximum);
  if (typeof value === "string") {
    return { text: value.slice(0, limit), valid: true, truncated: value.length > limit };
  }
  if (!Array.isArray(value)) return { text: "", valid: false, truncated: false };
  let text = "";
  const segmentCount = Math.min(value.length, MAX_NOTEBOOK_TEXT_SEGMENTS);
  let truncated = value.length > segmentCount;
  for (let index = 0; index < segmentCount; index += 1) {
    const segment = value[index];
    if (typeof segment !== "string") return { text: "", valid: false, truncated: false };
    const remaining = limit - text.length;
    if (remaining <= 0) {
      if (segment.length > 0 || index + 1 < value.length) truncated = true;
      break;
    }
    text += segment.slice(0, remaining);
    if (segment.length > remaining) {
      truncated = true;
      break;
    }
  }
  return { text, valid: true, truncated };
}

function notebookBoundedSource(value: unknown, budget: NotebookParseBudget): string | null {
  const remaining = Math.max(0, MAX_NOTEBOOK_TOTAL_SOURCE_UNITS - budget.sourceUnits);
  const joined = notebookJoinedText(value, Math.min(MAX_NOTEBOOK_CELL_SOURCE_UNITS, remaining));
  if (!joined.valid) return null;
  budget.sourceUnits += joined.text.length;
  if (joined.truncated) budget.limited = true;
  return joined.text;
}

function notebookBoundedOutputText(value: unknown, budget: NotebookParseBudget, maximum = MAX_NOTEBOOK_OUTPUT_TEXT_UNITS): string | null {
  const remaining = Math.max(0, MAX_NOTEBOOK_TOTAL_OUTPUT_TEXT_UNITS - budget.outputTextUnits);
  const joined = notebookJoinedText(value, Math.min(maximum, remaining));
  if (!joined.valid) return null;
  budget.outputTextUnits += joined.text.length;
  if (joined.truncated) budget.limited = true;
  return joined.text;
}

function notebookExecutionCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function notebookSafeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 80) : fallback;
}

function notebookLanguageDetails(metadata: Record<string, unknown> | null): {
  readonly path: string;
  readonly languageLabel: string;
  readonly kernelLabel: string;
} {
  const languageInfo = notebookRecord(metadata?.language_info);
  const kernelspec = notebookRecord(metadata?.kernelspec);
  const languageName = notebookSafeLabel(languageInfo?.name ?? kernelspec?.language, "Plain text");
  const kernelLabel = notebookSafeLabel(kernelspec?.display_name ?? kernelspec?.name, "No kernel metadata");
  const requestedExtension = typeof languageInfo?.file_extension === "string" ? languageInfo.file_extension.trim().toLowerCase() : "";
  if (/^\.[a-z0-9][a-z0-9._+-]{0,11}$/.test(requestedExtension)) {
    return { path: `notebook-cell${requestedExtension}`, languageLabel: languageName, kernelLabel };
  }
  const normalized = languageName.toLowerCase();
  const extension = MARKDOWN_FENCE_EXTENSIONS[normalized] ?? ({
    ipython: "py",
    ipython3: "py",
    julia: "jl",
    r: "r",
    ruby: "rb",
    scala: "scala",
  } as Readonly<Record<string, string>>)[normalized] ?? "txt";
  return { path: `notebook-cell.${extension}`, languageLabel: languageName, kernelLabel };
}

function notebookAttachments(value: unknown, budget: NotebookParseBudget): ReadonlyMap<string, NotebookMimeBundle> {
  const result = new Map<string, NotebookMimeBundle>();
  const attachments = notebookRecord(value);
  if (!attachments) return result;
  for (const name in attachments) {
    if (!Object.prototype.hasOwnProperty.call(attachments, name)) continue;
    if (budget.attachmentCount >= MAX_NOTEBOOK_ATTACHMENTS) {
      budget.limited = true;
      break;
    }
    budget.attachmentCount += 1;
    const rawBundle = attachments[name];
    const bundle = notebookRecord(rawBundle);
    if (!bundle || name.length === 0 || name.length > 256) continue;
    result.set(name, bundle);
  }
  return result;
}

function notebookOutputs(value: unknown, budget: NotebookParseBudget): readonly NotebookOutputModel[] {
  if (!Array.isArray(value)) return [];
  const outputs: NotebookOutputModel[] = [];
  const maximum = Math.min(value.length, MAX_NOTEBOOK_OUTPUTS_PER_CELL);
  if (value.length > maximum) budget.limited = true;
  for (let index = 0; index < maximum; index += 1) {
    if (budget.outputCount >= MAX_NOTEBOOK_TOTAL_OUTPUTS) {
      budget.limited = true;
      break;
    }
    budget.outputCount += 1;
    const output = notebookRecord(value[index]);
    const outputType = typeof output?.output_type === "string" ? output.output_type : "";
    if (outputType === "stream") {
      const text = notebookBoundedOutputText(output?.text, budget);
      outputs.push(text === null
        ? { kind: "unsupported" }
        : { kind: "stream", name: output?.name === "stderr" ? "stderr" : "stdout", text });
      continue;
    }
    if (outputType === "error") {
      const traceback = notebookBoundedOutputText(output?.traceback, budget);
      outputs.push(traceback === null
        ? { kind: "unsupported" }
        : {
            kind: "error",
            ename: notebookSafeLabel(output?.ename, "Error"),
            evalue: notebookSafeLabel(output?.evalue, ""),
            traceback,
          });
      continue;
    }
    if (outputType === "display_data" || outputType === "execute_result") {
      const data = notebookRecord(output?.data);
      outputs.push(data
        ? {
            kind: "display",
            executionCount: outputType === "execute_result" ? notebookExecutionCount(output?.execution_count) : null,
            data,
          }
        : { kind: "unsupported" });
      continue;
    }
    outputs.push({ kind: "unsupported" });
  }
  return outputs;
}

function parseNotebook(bytes: Uint8Array): NotebookModel {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_NOTEBOOK_PREVIEW_BYTES) {
    throw new Error("This notebook is outside the supported preview size.");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("This notebook is not valid UTF-8 JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("This notebook does not contain valid JSON.");
  }
  const root = notebookRecord(parsed);
  if (!root || root.nbformat !== 4 || !Number.isSafeInteger(root.nbformat_minor) || (root.nbformat_minor as number) < 0) {
    throw new Error("Only Jupyter notebooks using nbformat 4 are supported.");
  }
  if (!Array.isArray(root.cells)) throw new Error("This notebook does not contain a valid cell list.");

  const budget: NotebookParseBudget = {
    sourceUnits: 0,
    outputCount: 0,
    outputTextUnits: 0,
    attachmentCount: 0,
    limited: root.cells.length > MAX_NOTEBOOK_CELLS,
  };
  const cells: NotebookCellModel[] = [];
  for (const rawCell of root.cells.slice(0, MAX_NOTEBOOK_CELLS)) {
    const cell = notebookRecord(rawCell);
    const cellType = typeof cell?.cell_type === "string" ? cell.cell_type : "";
    const cellSource = notebookBoundedSource(cell?.source, budget);
    if (cellSource === null) {
      cells.push({ kind: "unsupported", reason: "Malformed cell source" });
    } else if (cellType === "markdown") {
      cells.push({ kind: "markdown", source: cellSource, attachments: notebookAttachments(cell?.attachments, budget) });
    } else if (cellType === "code") {
      cells.push({
        kind: "code",
        source: cellSource,
        executionCount: notebookExecutionCount(cell?.execution_count),
        outputs: notebookOutputs(cell?.outputs, budget),
      });
    } else if (cellType === "raw") {
      cells.push({ kind: "raw", source: cellSource });
    } else {
      cells.push({ kind: "unsupported", reason: "Unsupported cell type" });
    }
  }
  const minor = root.nbformat_minor as number;
  const language = notebookLanguageDetails(notebookRecord(root.metadata));
  return {
    minor,
    languagePath: language.path,
    languageLabel: language.languageLabel,
    kernelLabel: language.kernelLabel,
    cells,
    reservedOutputTextUnits: budget.outputTextUnits,
    limited: budget.limited,
    newerMinor: minor > 5,
  };
}

function notebookTerminalText(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function notebookMimeText(value: unknown, maximum: number): { readonly text: string; readonly truncated: boolean } | null {
  const joined = notebookJoinedText(value, maximum);
  return joined.valid ? { text: joined.text, truncated: joined.truncated } : null;
}

function notebookMarkupTagMarkersWithinLimit(source: string, maximum: number): boolean {
  if (maximum < 1) return source.indexOf("<") < 0;
  let count = 0;
  let offset = 0;
  while (offset < source.length) {
    const marker = source.indexOf("<", offset);
    if (marker < 0) return true;
    count += 1;
    if (count > maximum) return false;
    offset = marker + 1;
  }
  return true;
}

function notebookJsonText(value: unknown, maximum: number): { readonly text: string; readonly truncated: boolean } | null {
  if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") return null;
  const limit = Math.max(0, Math.min(MAX_NOTEBOOK_OUTPUT_TEXT_UNITS, Math.trunc(maximum)));
  const chunks: string[] = [];
  let pending = "";
  let length = 0;
  let overflow = false;
  let limited = false;
  const flush = (): void => {
    if (!pending) return;
    chunks.push(pending);
    pending = "";
  };
  const append = (segment: string): boolean => {
    if (overflow || !segment) return !overflow;
    const remaining = limit - length;
    if (remaining <= 0) {
      overflow = true;
      return false;
    }
    const accepted = segment.length <= remaining ? segment : segment.slice(0, remaining);
    if (pending.length + accepted.length > 8_192) flush();
    pending += accepted;
    length += accepted.length;
    if (accepted.length < segment.length) overflow = true;
    return !overflow;
  };
  const appendString = (source: string): boolean => {
    if (!append('"')) return false;
    for (let index = 0; index < source.length && !overflow; index += 1) {
      const code = source.charCodeAt(index);
      switch (code) {
        case 0x08:
          append("\\b");
          break;
        case 0x09:
          append("\\t");
          break;
        case 0x0a:
          append("\\n");
          break;
        case 0x0c:
          append("\\f");
          break;
        case 0x0d:
          append("\\r");
          break;
        case 0x22:
          append('\\"');
          break;
        case 0x5c:
          append("\\\\");
          break;
        default:
          if (code < 0x20 || (code >= 0xd800 && code <= 0xdfff)) {
            if (code >= 0xd800 && code <= 0xdbff) {
              const low = source.charCodeAt(index + 1);
              if (low >= 0xdc00 && low <= 0xdfff) {
                append(source[index] ?? "");
                if (!overflow) append(source[index + 1] ?? "");
                index += 1;
                break;
              }
            }
            append(`\\u${code.toString(16).padStart(4, "0")}`);
          } else {
            append(source[index] ?? "");
          }
      }
    }
    return !overflow && append('"');
  };
  const entries = function* (record: Record<string, unknown>): Generator<readonly [string, unknown], void, void> {
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) yield [key, record[key]] as const;
    }
  };
  type Frame =
    | { readonly kind: "value"; readonly value: unknown; readonly depth: number }
    | { readonly kind: "array"; readonly value: readonly unknown[]; readonly index: number; readonly depth: number }
    | {
        readonly kind: "object";
        readonly iterator: Iterator<readonly [string, unknown]>;
        readonly first: boolean;
        readonly depth: number;
      };
  const stack: Frame[] = [{ kind: "value", value, depth: 0 }];
  const maximumVisits = Math.max(256, Math.min(1_100_000, limit * 4 + 512));
  let visits = 0;
  while (stack.length > 0 && !overflow) {
    visits += 1;
    if (visits > maximumVisits) {
      limited = true;
      break;
    }
    const frame = stack.pop()!;
    if (frame.kind === "array") {
      if (frame.index >= frame.value.length) {
        if (frame.value.length > 0) append(`\n${"  ".repeat(frame.depth)}`);
        append("]");
        continue;
      }
      if (frame.index > 0) append(",");
      append(`\n${"  ".repeat(frame.depth + 1)}`);
      stack.push({ kind: "array", value: frame.value, index: frame.index + 1, depth: frame.depth });
      stack.push({ kind: "value", value: frame.value[frame.index], depth: frame.depth + 1 });
      continue;
    }
    if (frame.kind === "object") {
      const next = frame.iterator.next();
      if (next.done) {
        if (!frame.first) append(`\n${"  ".repeat(frame.depth)}`);
        append("}");
        continue;
      }
      if (!frame.first) append(",");
      append(`\n${"  ".repeat(frame.depth + 1)}`);
      appendString(next.value[0]);
      append(": ");
      stack.push({ kind: "object", iterator: frame.iterator, first: false, depth: frame.depth });
      stack.push({ kind: "value", value: next.value[1], depth: frame.depth + 1 });
      continue;
    }

    const current = frame.value;
    if (current === null) {
      append("null");
    } else if (typeof current === "string") {
      appendString(current);
    } else if (typeof current === "number") {
      append(Number.isFinite(current) ? String(current) : "null");
    } else if (typeof current === "boolean") {
      append(current ? "true" : "false");
    } else if (frame.depth >= 64) {
      limited = true;
      append("null");
    } else if (Array.isArray(current)) {
      append("[");
      stack.push({ kind: "array", value: current, index: 0, depth: frame.depth });
    } else {
      const record = notebookRecord(current);
      if (!record) {
        append("null");
      } else {
        append("{");
        stack.push({ kind: "object", iterator: entries(record), first: true, depth: frame.depth });
      }
    }
  }
  flush();
  return { text: chunks.join(""), truncated: overflow || limited || stack.length > 0 };
}

function notebookByte(binary: string, index: number): number {
  return index >= 0 && index < binary.length ? binary.charCodeAt(index) : -1;
}

function notebookUint16Be(binary: string, offset: number): number {
  return notebookByte(binary, offset) * 256 + notebookByte(binary, offset + 1);
}

function notebookUint16Le(binary: string, offset: number): number {
  return notebookByte(binary, offset) + notebookByte(binary, offset + 1) * 256;
}

function notebookUint24Le(binary: string, offset: number): number {
  return notebookByte(binary, offset) + notebookByte(binary, offset + 1) * 256 + notebookByte(binary, offset + 2) * 65_536;
}

function notebookUint32Be(binary: string, offset: number): number {
  return notebookByte(binary, offset) * 16_777_216 +
    notebookByte(binary, offset + 1) * 65_536 +
    notebookByte(binary, offset + 2) * 256 +
    notebookByte(binary, offset + 3);
}

function notebookUint32Le(binary: string, offset: number): number {
  return notebookByte(binary, offset) +
    notebookByte(binary, offset + 1) * 256 +
    notebookByte(binary, offset + 2) * 65_536 +
    notebookByte(binary, offset + 3) * 16_777_216;
}

function notebookRasterDimensionsValid(width: number, height: number): boolean {
  return Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_NOTEBOOK_RASTER_DIMENSION &&
    height <= MAX_NOTEBOOK_RASTER_DIMENSION &&
    width * height <= MAX_NOTEBOOK_RASTER_PIXELS;
}

function notebookPngStructureValid(binary: string): boolean {
  if (
    binary.length < 45 ||
    ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => notebookByte(binary, index) === value)
  ) return false;
  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  while (offset + 12 <= binary.length) {
    const length = notebookUint32Be(binary, offset);
    if (!Number.isSafeInteger(length) || length < 0 || length > binary.length - offset - 12) return false;
    const type = binary.slice(offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = notebookUint32Be(binary, offset + 8);
      const height = notebookUint32Be(binary, offset + 12);
      const bitDepth = notebookByte(binary, offset + 16);
      const colorType = notebookByte(binary, offset + 17);
      const validDepths: Readonly<Record<number, readonly number[]>> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !notebookRasterDimensionsValid(width, height) ||
        !validDepths[colorType]?.includes(bitDepth) ||
        notebookByte(binary, offset + 18) !== 0 ||
        notebookByte(binary, offset + 19) !== 0 ||
        ![0, 1].includes(notebookByte(binary, offset + 20))
      ) return false;
      sawHeader = true;
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") return length === 0 && sawImageData && end === binary.length;
    offset = end;
  }
  return false;
}

function notebookJpegStructureValid(binary: string): boolean {
  if (
    binary.length < 14 ||
    notebookByte(binary, 0) !== 0xff ||
    notebookByte(binary, 1) !== 0xd8 ||
    notebookByte(binary, binary.length - 2) !== 0xff ||
    notebookByte(binary, binary.length - 1) !== 0xd9
  ) return false;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let sawFrame = false;
  while (offset < binary.length - 2) {
    if (notebookByte(binary, offset) !== 0xff) return false;
    while (notebookByte(binary, offset) === 0xff) offset += 1;
    const marker = notebookByte(binary, offset);
    offset += 1;
    if (marker < 0 || marker === 0x00) return false;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) return sawFrame && offset === binary.length;
    if (offset + 2 > binary.length) return false;
    const segmentLength = notebookUint16Be(binary, offset);
    if (segmentLength < 2 || segmentLength > binary.length - offset) return false;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) return false;
      const height = notebookUint16Be(binary, offset + 3);
      const width = notebookUint16Be(binary, offset + 5);
      if (!notebookRasterDimensionsValid(width, height)) return false;
      sawFrame = true;
    }
    if (marker === 0xda) return sawFrame;
    offset += segmentLength;
  }
  return false;
}

function notebookGifSubBlocksEnd(binary: string, requestedOffset: number): number {
  let offset = requestedOffset;
  while (offset < binary.length) {
    const length = notebookByte(binary, offset);
    offset += 1;
    if (length === 0) return offset;
    if (length < 0 || length > binary.length - offset) return -1;
    offset += length;
  }
  return -1;
}

function notebookGifStructureValid(binary: string): boolean {
  if (binary.length < 14 || (!binary.startsWith("GIF87a") && !binary.startsWith("GIF89a"))) return false;
  const screenWidth = notebookUint16Le(binary, 6);
  const screenHeight = notebookUint16Le(binary, 8);
  if (!notebookRasterDimensionsValid(screenWidth, screenHeight)) return false;
  const packed = notebookByte(binary, 10);
  let offset = 13;
  if ((packed & 0x80) !== 0) offset += 3 * (1 << ((packed & 0x07) + 1));
  if (offset > binary.length) return false;
  let frames = 0;
  let totalFramePixels = 0;
  while (offset < binary.length) {
    const introducer = notebookByte(binary, offset);
    if (introducer === 0x3b) return frames > 0 && offset + 1 === binary.length;
    if (introducer === 0x21) {
      if (offset + 2 > binary.length) return false;
      offset = notebookGifSubBlocksEnd(binary, offset + 2);
      if (offset < 0) return false;
      continue;
    }
    if (introducer !== 0x2c || offset + 10 > binary.length) return false;
    const width = notebookUint16Le(binary, offset + 5);
    const height = notebookUint16Le(binary, offset + 7);
    if (!notebookRasterDimensionsValid(width, height)) return false;
    frames += 1;
    totalFramePixels += width * height;
    if (frames > MAX_NOTEBOOK_RASTER_FRAMES || totalFramePixels > MAX_NOTEBOOK_RASTER_FRAME_PIXELS) return false;
    const imagePacked = notebookByte(binary, offset + 9);
    offset += 10;
    if ((imagePacked & 0x80) !== 0) offset += 3 * (1 << ((imagePacked & 0x07) + 1));
    if (offset >= binary.length || notebookByte(binary, offset) < 2 || notebookByte(binary, offset) > 12) return false;
    offset = notebookGifSubBlocksEnd(binary, offset + 1);
    if (offset < 0) return false;
  }
  return false;
}

function notebookWebpStructureValid(binary: string): boolean {
  if (
    binary.length < 20 ||
    !binary.startsWith("RIFF") ||
    binary.slice(8, 12) !== "WEBP" ||
    notebookUint32Le(binary, 4) + 8 !== binary.length
  ) return false;
  let offset = 12;
  let sawDimensions = false;
  let frames = 0;
  let totalFramePixels = 0;
  while (offset + 8 <= binary.length) {
    const type = binary.slice(offset, offset + 4);
    const length = notebookUint32Le(binary, offset + 4);
    const data = offset + 8;
    const end = data + length;
    const paddedEnd = end + (length & 1);
    if (!Number.isSafeInteger(length) || length < 0 || end > binary.length || paddedEnd > binary.length) return false;
    let width = 0;
    let height = 0;
    if (type === "VP8X") {
      if (length !== 10) return false;
      width = notebookUint24Le(binary, data + 4) + 1;
      height = notebookUint24Le(binary, data + 7) + 1;
    } else if (type === "VP8 ") {
      if (length < 10 || binary.slice(data + 3, data + 6) !== "\u009d\u0001\u002a") return false;
      width = notebookUint16Le(binary, data + 6) & 0x3fff;
      height = notebookUint16Le(binary, data + 8) & 0x3fff;
    } else if (type === "VP8L") {
      if (length < 5 || notebookByte(binary, data) !== 0x2f) return false;
      const bits = notebookUint32Le(binary, data + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (type === "ANMF") {
      if (length < 16) return false;
      frames += 1;
      width = notebookUint24Le(binary, data + 6) + 1;
      height = notebookUint24Le(binary, data + 9) + 1;
      totalFramePixels += width * height;
      if (frames > MAX_NOTEBOOK_RASTER_FRAMES || totalFramePixels > MAX_NOTEBOOK_RASTER_FRAME_PIXELS) return false;
    }
    if ((width > 0 || height > 0) && !notebookRasterDimensionsValid(width, height)) return false;
    if (width > 0 && height > 0) sawDimensions = true;
    offset = paddedEnd;
  }
  return sawDimensions && offset === binary.length;
}

function notebookRasterStructureValid(mimeType: string, binary: string): boolean {
  switch (mimeType) {
    case "image/png":
      return notebookPngStructureValid(binary);
    case "image/jpeg":
      return notebookJpegStructureValid(binary);
    case "image/gif":
      return notebookGifStructureValid(binary);
    case "image/webp":
      return notebookWebpStructureValid(binary);
    default:
      return false;
  }
}

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

  :host-context(html[data-code-codex-transparent-background]) :is(
    .tab-strip,
    .tab-slot.active,
    .preview-tab[aria-selected="true"],
    .preview-panel,
    .preview-meta-bar,
    .preview-content,
    .code-line-numbers,
    .code-editor-stack,
    .code-editor-highlight,
    .code-editor,
    .editor-error,
    .markdown-reader,
    .markdown-truncated,
    .csv-preview,
    .csv-table-scroll,
    .diagram-preview,
    .diagram-canvas,
    .notebook-preview,
    .media-preview[data-kind="pdf"],
    .pdf-preview-toolbar,
    .pdf-page-stage,
    .office-preview,
    .office-preview-notice,
    .office-sheet-tabs,
    .office-sheet-viewport,
    .office-preview-toolbar,
    .office-slide-viewport,
    .rpv-root,
    .rpv-stage,
    .rpv-viewport,
    .rpv-status
  ) {
    background-color: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
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

  .csv-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 18px clamp(12px, 2.5vw, 28px) 24px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }
  .csv-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 0 2px 13px;
  }
  .csv-title { margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.35; }
  .csv-summary { color: var(--cle-main-muted); font-size: 11px; line-height: 1.5; }
  .csv-mode {
    flex: 0 0 auto;
    padding: 4px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 999px;
    font-size: 10.5px;
    white-space: nowrap;
  }
  .csv-notices { display: grid; flex: 0 0 auto; gap: 6px; margin: 0 0 10px; }
  .csv-notice {
    padding: 7px 9px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .csv-warning { color: var(--cle-main-text); }
  .csv-table-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 8px;
  }
  .csv-table-scroll:focus-visible {
    outline: 2px solid var(--cle-main-focus);
    outline-offset: 2px;
  }
  .csv-table {
    width: max-content;
    min-width: 100%;
    border-spacing: 0;
    border-collapse: separate;
    color: var(--cle-main-text);
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-variant-numeric: tabular-nums;
  }
  .csv-table th,
  .csv-table td {
    min-width: 112px;
    max-width: 360px;
    padding: 6px 10px;
    border-right: 1px solid var(--cle-main-line);
    border-bottom: 1px solid var(--cle-main-line);
    vertical-align: top;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: plaintext;
    tab-size: 4;
  }
  .csv-table tr > :last-child { border-right: 0; }
  .csv-table tbody tr:last-child > * { border-bottom: 0; }
  .csv-column-header {
    position: sticky;
    top: 0;
    z-index: 2;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    font-weight: 600;
    text-align: center !important;
    user-select: none;
  }
  .csv-row-number {
    position: sticky;
    left: 0;
    z-index: 1;
    width: 48px;
    min-width: 48px !important;
    max-width: 48px !important;
    color: var(--cle-main-faint);
    background: var(--cle-main-raised);
    font-weight: 500;
    text-align: right !important;
    user-select: none;
  }
  .csv-corner { top: 0; z-index: 3; text-align: center !important; }
  .csv-table tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--cle-main-hover) 58%, transparent); }
  .csv-table tbody tr:hover td { background: var(--cle-main-hover); }
  .csv-caption {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .diagram-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 100%;
    padding: 18px clamp(12px, 2.5vw, 28px) 28px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }
  .diagram-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 0 2px 13px;
  }
  .diagram-title { margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.35; }
  .diagram-summary { color: var(--cle-main-muted); font-size: 11px; line-height: 1.5; }
  .diagram-controls { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; }
  .diagram-page-label { color: var(--cle-main-muted); font-size: 10.5px; }
  .diagram-page-select {
    max-width: 220px;
    height: 28px;
    padding: 0 25px 0 8px;
    color: var(--cle-main-text);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font: 11px/1.2 "Segoe UI", sans-serif;
  }
  .diagram-page-select:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 2px; }
  .diagram-notices { display: grid; flex: 0 0 auto; gap: 6px; margin: 0 0 10px; }
  .diagram-notice {
    padding: 7px 9px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .diagram-canvas {
    display: grid;
    flex: 1 1 auto;
    place-items: start center;
    min-width: 0;
    min-height: 240px;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 8px;
  }
  .diagram-canvas:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 2px; }
  .diagram-canvas svg { display: block; flex: 0 0 auto; max-width: none; height: auto; min-height: 220px; }
  .diagram-status {
    align-self: stretch;
    width: min(100%, 520px);
    margin: auto;
    padding: 40px 24px;
    color: var(--cle-main-muted);
    font-size: 12px;
    line-height: 1.55;
    text-align: center;
  }
  .diagram-status.error { color: var(--cle-main-text); }

  .notebook-preview {
    min-width: 0;
    min-height: 100%;
    padding: 24px clamp(14px, 3vw, 34px) 64px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }
  .notebook-shell { width: min(100%, 1040px); margin: 0 auto; }
  .notebook-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin: 0 0 18px;
    padding: 0 2px 14px;
    border-bottom: 1px solid var(--cle-main-line);
  }
  .notebook-title { margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.35; }
  .notebook-summary { color: var(--cle-main-muted); font-size: 11px; line-height: 1.5; }
  .notebook-mode {
    flex: 0 0 auto;
    padding: 4px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 999px;
    font-size: 10.5px;
    white-space: nowrap;
  }
  .notebook-notice {
    margin: 0 0 14px;
    padding: 8px 10px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 7px;
    font-size: 11px;
    line-height: 1.45;
  }
  .notebook-cells { display: grid; gap: 14px; }
  .notebook-cell {
    --cle-notebook-prompt-width: 62px;
    display: grid;
    grid-template-columns: var(--cle-notebook-prompt-width) minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 9px;
  }
  .notebook-cell.markdown { border-color: transparent; background: transparent; }
  .notebook-prompt {
    grid-column: 1;
    padding: 14px 9px 12px 6px;
    color: var(--cle-main-faint);
    background: var(--cle-main-raised);
    border-right: 1px solid var(--cle-main-line);
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
  }
  .notebook-cell.markdown .notebook-prompt { color: transparent; background: transparent; border-right-color: transparent; }
  .notebook-cell-body { grid-column: 2; min-width: 0; overflow: hidden; }
  .notebook-source,
  .notebook-raw,
  .notebook-output pre {
    margin: 0;
    font: 12.5px/1.58 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    tab-size: 4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .notebook-source { padding: 14px 16px; overflow: auto; white-space: pre; }
  .notebook-source code { display: block; min-width: max-content; font: inherit; }
  .notebook-raw { padding: 14px 16px; color: var(--cle-main-muted); }
  .notebook-markdown.markdown-body {
    width: auto;
    margin: 0;
    padding: 4px 12px 2px 16px;
    font-size: 14px;
  }
  .notebook-markdown .notebook-image-placeholder { margin-block: 3px; }
  .notebook-image-placeholder {
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
  .notebook-outputs { border-top: 1px solid var(--cle-main-line); }
  .notebook-output { min-width: 0; padding: 11px 16px; overflow: auto; }
  .notebook-output + .notebook-output { border-top: 1px solid var(--cle-main-line); }
  .notebook-output.stderr,
  .notebook-output.error { color: var(--cle-syntax-deleted); background: color-mix(in srgb, var(--cle-syntax-deleted) 5%, transparent); }
  .notebook-output.unsupported { color: var(--cle-main-muted); font-size: 11px; }
  .notebook-output-image {
    display: block;
    max-width: 100%;
    max-height: min(70vh, 920px);
    margin: 0 auto;
    object-fit: contain;
  }
  .notebook-rich-html { color: var(--cle-main-text); font-size: 12.5px; line-height: 1.55; overflow-wrap: anywhere; }
  .notebook-rich-html > :first-child { margin-top: 0; }
  .notebook-rich-html > :last-child { margin-bottom: 0; }
  .notebook-rich-html table { max-width: 100%; border-collapse: collapse; }
  .notebook-rich-html th,
  .notebook-rich-html td { padding: 5px 9px; border: 1px solid var(--cle-main-line); text-align: left; }
  .notebook-rich-html th { background: var(--cle-main-raised); font-weight: 600; }
  .notebook-rich-html pre { overflow: auto; white-space: pre; }
  .notebook-limited { color: var(--cle-main-muted); }

  @media (max-width: 680px) {
    .csv-preview { padding-inline: 9px; }
    .csv-header { display: block; }
    .csv-mode { display: inline-block; margin-top: 8px; }
    .csv-table th,
    .csv-table td { min-width: 96px; padding-inline: 8px; }
    .diagram-preview { padding-inline: 9px; }
    .diagram-header { display: block; }
    .diagram-controls { margin-top: 8px; }
    .notebook-preview { padding-inline: 10px; }
    .notebook-header { display: block; }
    .notebook-mode { display: inline-block; margin-top: 8px; }
    .notebook-cell { --cle-notebook-prompt-width: 44px; }
    .notebook-prompt { padding-inline: 3px 6px; font-size: 10px; }
    .notebook-source,
    .notebook-output,
    .notebook-raw { padding-inline: 11px; }
    .notebook-markdown.markdown-body { padding-inline: 10px 4px; }
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
  readonly opacity: string;
  readonly opacityPriority: string;
}

interface PdfPreviewJob {
  readonly generation: number;
  data: Uint8Array | null;
  loadingTask: PDFDocumentLoadingTask | null;
  document: PDFDocumentProxy | null;
  renderTask: RenderTask | null;
  pageGeneration: number;
}

interface NotebookPreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
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

interface DiagramPreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
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
let nextDiagramMarkerId = 0;

function fileNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path || "File";
}

function isMediaPreviewView(view: MainPreviewFileView | undefined): view is MainPreviewMediaView {
  return view?.kind === "image" ||
    view?.kind === "video" ||
    view?.kind === "pdf" ||
    view?.kind === "audio" ||
    view?.kind === "office" ||
    view?.kind === "notebook";
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
    case "notebook":
      return NOTEBOOK_PREVIEWER_ID;
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
    case "notebook":
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
    NOTEBOOK_PREVIEWER_ID,
    CSV_PREVIEWER_ID,
    DIAGRAM_PREVIEWER_ID,
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
  #notebookGeneration = 0;
  #notebookJob: NotebookPreviewJob | null = null;
  #officeGeneration = 0;
  #officeJob: OfficePreviewJob | null = null;
  #diagramGeneration = 0;
  #diagramJob: DiagramPreviewJob | null = null;
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
    this.#cancelNotebookPreview();
    this.#cancelOfficePreview();
    this.#cancelDiagramPreview();
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
    this.#cancelNotebookPreview();
    this.#cancelOfficePreview();
    this.#cancelDiagramPreview();
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
    const csvPreview = (view.kind === "text" || view.kind === "empty") &&
      this.#state.enabledPreviewers?.includes(CSV_PREVIEWER_ID) === true &&
      isCsvPreviewPath(view.path) &&
      !editor;
    const diagramPreview = (view.kind === "text" || view.kind === "empty") &&
      this.#state.enabledPreviewers?.includes(DIAGRAM_PREVIEWER_ID) === true &&
      isDiagramPreviewPath(view.path) &&
      !editor;
    const metadata = `${markdownEditing ? "Rendered Markdown edit · " : markdownPreview ? "Markdown preview · " : csvPreview ? "CSV preview · " : diagramPreview ? "Diagram preview · " : ""}${this.#metadataFor(view)}`;
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
        if (this.#state.enabledPreviewers?.includes(CSV_PREVIEWER_ID) && isCsvPreviewPath(view.path)) {
          content.append(this.#csvReader(view));
          return;
        }
        if (this.#state.enabledPreviewers?.includes(DIAGRAM_PREVIEWER_ID) && isDiagramPreviewPath(view.path)) {
          content.append(this.#diagramReader(view));
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
      case "notebook":
        content.append(this.#mediaPreview(view));
        return;
      case "empty":
        if (this.#state.enabledPreviewers?.includes(CSV_PREVIEWER_ID) && isCsvPreviewPath(view.path)) {
          content.append(this.#statePanel("Empty CSV file", "This CSV file has no rows.", "empty", view));
          return;
        }
        if (this.#state.enabledPreviewers?.includes(DIAGRAM_PREVIEWER_ID) && isDiagramPreviewPath(view.path)) {
          content.append(this.#statePanel("Empty diagram file", "This diagram file has no content.", "empty", view));
          return;
        }
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
    if (view.kind === "notebook") return this.#notebookPreview(view);
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

  #notebookPreview(view: MainPreviewMediaView): HTMLElement {
    if (view.mimeType !== NOTEBOOK_PREVIEW_MIME) {
      return this.#statePanel("Notebook preview unavailable", "This file does not contain a supported notebook payload.", "unsupported", view);
    }
    const container = this.ownerDocument.createElement("article");
    container.className = "notebook-preview";
    container.setAttribute("aria-label", `Jupyter notebook preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");
    const loading = this.#textSpan("Loading notebook\u2026", "office-preview-loading");
    loading.setAttribute("role", "status");
    container.append(loading);

    const job: NotebookPreviewJob = {
      generation: ++this.#notebookGeneration,
      abortController: new AbortController(),
    };
    this.#notebookJob = job;
    const isCurrent = (): boolean =>
      this.#connected &&
      this.#notebookJob === job &&
      this.#notebookGeneration === job.generation &&
      !job.abortController.signal.aborted &&
      container.isConnected;

    queueMicrotask(() => {
      void (async () => {
        try {
          const model = parseNotebook(view.bytes);
          if (!isCurrent()) return;
          await this.#renderNotebookModel(view, model, container, job, isCurrent);
        } catch (error) {
          if (!isCurrent()) return;
          const message = error instanceof Error ? error.message : "This notebook could not be opened.";
          container.setAttribute("aria-busy", "false");
          container.replaceChildren(this.#statePanel("Notebook preview failed", message, "error", view));
        }
      })();
    });
    return container;
  }

  async #renderNotebookModel(
    view: MainPreviewMediaView,
    model: NotebookModel,
    container: HTMLElement,
    job: NotebookPreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const shell = this.ownerDocument.createElement("div");
    shell.className = "notebook-shell";
    const header = this.ownerDocument.createElement("header");
    header.className = "notebook-header";
    const headingCopy = this.ownerDocument.createElement("div");
    const title = this.ownerDocument.createElement("h2");
    title.className = "notebook-title";
    title.textContent = view.name;
    const summary = this.ownerDocument.createElement("div");
    summary.className = "notebook-summary";
    summary.textContent = `${model.kernelLabel} \u00b7 ${model.languageLabel} \u00b7 nbformat 4.${model.minor} \u00b7 ${model.cells.length} ${model.cells.length === 1 ? "cell" : "cells"}`;
    headingCopy.append(title, summary);
    const mode = this.#textSpan("Read-only \u00b7 saved outputs only", "notebook-mode");
    header.append(headingCopy, mode);

    const notices = this.ownerDocument.createElement("div");
    const versionNotice = model.newerMinor
      ? this.#textSpan("This notebook uses a newer nbformat minor version. Known fields are shown using best-effort rendering.", "notebook-notice")
      : null;
    if (versionNotice) notices.append(versionNotice);
    const limitNotice = this.#textSpan("Preview limited for performance.", "notebook-notice notebook-limited");
    limitNotice.hidden = !model.limited;
    notices.append(limitNotice);

    const cells = this.ownerDocument.createElement("div");
    cells.className = "notebook-cells";
    const budget: NotebookRenderBudget = {
      htmlUnits: 0,
      outputTextUnits: model.reservedOutputTextUnits,
      imageBytes: 0,
      domNodes: 16,
      limited: model.limited,
    };
    shell.append(header, notices, cells);
    container.replaceChildren(shell);

    for (let start = 0; start < model.cells.length; start += NOTEBOOK_RENDER_BATCH_CELLS) {
      if (!isCurrent()) return;
      const fragment = this.ownerDocument.createDocumentFragment();
      const end = Math.min(model.cells.length, start + NOTEBOOK_RENDER_BATCH_CELLS);
      for (let index = start; index < end; index += 1) {
        const cell = this.#notebookCell(model.cells[index]!, index, model.languagePath, budget, job);
        if (cell) fragment.append(cell);
      }
      cells.append(fragment);
      limitNotice.hidden = !budget.limited;
      if (end < model.cells.length) await this.#yieldNotebookRender(job.abortController.signal);
    }
    if (model.cells.length === 0 && isCurrent()) {
      const empty = this.#textSpan("This notebook does not contain any cells.", "notebook-notice");
      cells.append(empty);
    }
    if (isCurrent()) container.setAttribute("aria-busy", "false");
  }

  #notebookCell(
    cell: NotebookCellModel,
    index: number,
    languagePath: string,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement | null {
    if (!this.#consumeNotebookDomNodes(budget, 5)) return null;
    const section = this.ownerDocument.createElement("section");
    section.className = `notebook-cell ${cell.kind}`;
    const prompt = this.ownerDocument.createElement("div");
    prompt.className = "notebook-prompt";
    prompt.setAttribute("aria-hidden", "true");
    const body = this.ownerDocument.createElement("div");
    body.className = "notebook-cell-body";

    if (cell.kind === "markdown") {
      prompt.textContent = "Markdown";
      section.setAttribute("aria-label", `Markdown cell ${index + 1}`);
      body.append(this.#notebookMarkdown(cell.source, cell.attachments, budget, job));
    } else if (cell.kind === "code") {
      const execution = cell.executionCount === null ? " " : String(cell.executionCount);
      prompt.textContent = `In [${execution}]`;
      section.setAttribute("aria-label", `Code cell ${index + 1}${cell.executionCount === null ? "" : `, execution ${cell.executionCount}`}`);
      const pre = this.ownerDocument.createElement("pre");
      pre.className = "notebook-source";
      const highlighted = this.#highlightedCode(languagePath, cell.source);
      const highlightedNodes = highlighted.querySelectorAll("*").length + highlighted.childNodes.length + 1;
      if (this.#consumeNotebookDomNodes(budget, highlightedNodes)) {
        pre.append(highlighted);
      } else {
        const plain = this.ownerDocument.createElement("code");
        plain.textContent = cell.source;
        pre.append(plain);
      }
      body.append(pre);
      if (cell.outputs.length > 0) {
        const outputs = this.ownerDocument.createElement("div");
        outputs.className = "notebook-outputs";
        for (let outputIndex = 0; outputIndex < cell.outputs.length; outputIndex += 1) {
          if (!this.#consumeNotebookDomNodes(budget, 2)) break;
          outputs.append(this.#notebookOutput(cell.outputs[outputIndex]!, index, outputIndex, budget, job));
        }
        body.append(outputs);
      }
    } else if (cell.kind === "raw") {
      prompt.textContent = "Raw";
      section.setAttribute("aria-label", `Raw cell ${index + 1}`);
      const pre = this.ownerDocument.createElement("pre");
      pre.className = "notebook-raw";
      pre.textContent = cell.source;
      body.append(pre);
    } else {
      prompt.textContent = "Cell";
      section.setAttribute("aria-label", `Unsupported cell ${index + 1}`);
      body.append(this.#textSpan(cell.reason, "notebook-output unsupported"));
    }
    section.append(prompt, body);
    return section;
  }

  #notebookOutput(
    output: NotebookOutputModel,
    cellIndex: number,
    outputIndex: number,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement {
    const element = this.ownerDocument.createElement("div");
    element.className = `notebook-output ${output.kind}`;
    element.setAttribute("aria-label", `Saved output ${outputIndex + 1} from code cell ${cellIndex + 1}`);
    if (output.kind === "stream") {
      element.classList.add(output.name);
      const pre = this.ownerDocument.createElement("pre");
      pre.textContent = notebookTerminalText(output.text);
      element.append(pre);
      return element;
    }
    if (output.kind === "error") {
      const pre = this.ownerDocument.createElement("pre");
      const heading = `${output.ename}${output.evalue ? `: ${output.evalue}` : ""}`;
      const traceback = notebookTerminalText(output.traceback)
        .split("\n")
        .slice(0, MAX_NOTEBOOK_TRACEBACK_LINES)
        .join("\n");
      pre.textContent = traceback ? `${heading}\n${traceback}` : heading;
      element.append(pre);
      return element;
    }
    if (output.kind === "display") {
      const rendered = this.#notebookMimeOutput(output.data, budget, job, `Output from code cell ${cellIndex + 1}`);
      if (rendered) {
        element.classList.add("rich");
        element.append(rendered);
      } else {
        element.classList.add("unsupported");
        element.textContent = "This saved output type is not supported safely.";
      }
      return element;
    }
    element.classList.add("unsupported");
    element.textContent = "Unsupported saved output.";
    return element;
  }

  #notebookMimeOutput(
    bundle: NotebookMimeBundle,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
    alt: string,
    startIndex = 0,
  ): HTMLElement | null {
    const priorities = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "text/html",
      "text/markdown",
      "application/json",
      "text/latex",
      "text/plain",
    ] as const;
    for (let priorityIndex = startIndex; priorityIndex < priorities.length; priorityIndex += 1) {
      const mimeType = priorities[priorityIndex]!;
      if (!Object.prototype.hasOwnProperty.call(bundle, mimeType)) continue;
      const value = bundle[mimeType];
      if (mimeType === "image/svg+xml") {
        const image = this.#notebookSvgImage(value, budget, alt);
        if (image) {
          this.#bindNotebookImageFallback(image, job, () => this.#notebookMimeOutput(bundle, budget, job, alt, priorityIndex + 1));
          return image;
        }
        continue;
      }
      if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/gif") {
        const image = this.#notebookRasterImage(mimeType, value, budget, alt);
        if (image) {
          this.#bindNotebookImageFallback(image, job, () => this.#notebookMimeOutput(bundle, budget, job, alt, priorityIndex + 1));
          return image;
        }
        continue;
      }
      if (mimeType === "text/html") {
        const html = this.#notebookHtml(value, budget);
        if (html) return html;
        continue;
      }
      if (mimeType === "text/markdown") {
        const text = this.#takeNotebookRenderText(value, budget);
        if (!text) continue;
        return this.#notebookMarkdown(text, new Map(), budget, job);
      }
      if (mimeType === "application/json") {
        const remaining = Math.max(0, MAX_NOTEBOOK_TOTAL_OUTPUT_TEXT_UNITS - budget.outputTextUnits);
        const json = notebookJsonText(value, Math.min(MAX_NOTEBOOK_OUTPUT_TEXT_UNITS, remaining));
        if (!json) continue;
        budget.outputTextUnits += json.text.length;
        if (json.truncated) budget.limited = true;
        const pre = this.ownerDocument.createElement("pre");
        pre.textContent = json.text;
        return pre;
      }
      const text = this.#takeNotebookRenderText(value, budget);
      if (!text) continue;
      const pre = this.ownerDocument.createElement("pre");
      pre.textContent = text;
      return pre;
    }
    return null;
  }

  #takeNotebookRenderText(value: unknown, budget: NotebookRenderBudget): string | null {
    const remaining = Math.max(0, MAX_NOTEBOOK_TOTAL_OUTPUT_TEXT_UNITS - budget.outputTextUnits);
    const text = notebookMimeText(value, Math.min(MAX_NOTEBOOK_OUTPUT_TEXT_UNITS, remaining));
    if (!text) return null;
    budget.outputTextUnits += text.text.length;
    if (text.truncated) budget.limited = true;
    return text.text;
  }

  #notebookMarkdown(
    source: string,
    attachments: ReadonlyMap<string, NotebookMimeBundle>,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement {
    const fallback = (): HTMLElement => {
      budget.limited = true;
      const plain = this.ownerDocument.createElement("pre");
      plain.className = "notebook-raw notebook-limited";
      plain.textContent = source;
      return plain;
    };
    const remainingNodes = Math.max(0, MAX_NOTEBOOK_DOM_NODES - budget.domNodes);
    const maximumTokens = Math.min(MAX_NOTEBOOK_MARKDOWN_TOKENS, remainingNodes);
    if (maximumTokens < 1) return fallback();
    const tokens = notebookMarkdownRenderer.parse(source, {});
    let tokenCount = 0;
    for (const token of tokens) {
      tokenCount += 1;
      if (token.children) tokenCount += token.children.length;
      if (tokenCount > maximumTokens) return fallback();
    }
    const article = this.ownerDocument.createElement("article");
    article.className = "notebook-markdown markdown-body";
    const rendered = notebookMarkdownRenderer.renderer.render(tokens, notebookMarkdownRenderer.options, {});
    const fragment = DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [...MARKDOWN_ALLOWED_TAGS],
      ALLOWED_ATTR: ["align", "class", "start", "title", "data-notebook-image-alt", "data-notebook-image-src"],
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["audio", "button", "embed", "form", "iframe", "img", "input", "math", "object", "select", "source", "style", "svg", "textarea", "video"],
      FORBID_ATTR: ["formaction", "href", "ping", "src", "srcset", "style"],
      KEEP_CONTENT: true,
      RETURN_DOM_FRAGMENT: true,
      SANITIZE_NAMED_PROPS: true,
    }) as DocumentFragment;
    article.append(fragment);
    for (const anchor of article.querySelectorAll("a")) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.setAttribute("title", "Links are disabled in notebook preview");
    }
    for (const placeholder of article.querySelectorAll<HTMLElement>(".notebook-image-placeholder")) {
      const sourceValue = placeholder.getAttribute("data-notebook-image-src") ?? "";
      const alt = placeholder.getAttribute("data-notebook-image-alt") ?? "Notebook attachment";
      let attachmentName = sourceValue.startsWith("attachment:") ? sourceValue.slice("attachment:".length) : "";
      if (attachmentName && !attachments.has(attachmentName)) {
        try {
          attachmentName = decodeURIComponent(attachmentName);
        } catch {
          attachmentName = "";
        }
      }
      const attachment = attachmentName ? attachments.get(attachmentName) : undefined;
      const image = attachment ? this.#notebookAttachmentImage(attachment, budget, job, alt) : null;
      if (image) placeholder.replaceWith(image);
      else {
        placeholder.textContent = attachmentName ? `Attachment unavailable \u00b7 ${alt}` : `External image blocked \u00b7 ${alt}`;
        placeholder.removeAttribute("data-notebook-image-src");
        placeholder.removeAttribute("data-notebook-image-alt");
      }
    }
    const cost = article.querySelectorAll("*").length + article.childNodes.length + 1;
    if (this.#consumeNotebookDomNodes(budget, cost)) return article;
    return fallback();
  }

  #notebookAttachmentImage(
    bundle: NotebookMimeBundle,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
    alt: string,
    startIndex = 0,
  ): HTMLImageElement | null {
    const priorities = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;
    for (let priorityIndex = startIndex; priorityIndex < priorities.length; priorityIndex += 1) {
      const mimeType = priorities[priorityIndex]!;
      if (!Object.prototype.hasOwnProperty.call(bundle, mimeType)) continue;
      const value = bundle[mimeType];
      const image = mimeType === "image/svg+xml"
        ? this.#notebookSvgImage(value, budget, alt)
        : this.#notebookRasterImage(mimeType, value, budget, alt);
      if (image) {
        this.#bindNotebookImageFallback(
          image,
          job,
          () => this.#notebookAttachmentImage(bundle, budget, job, alt, priorityIndex + 1),
        );
        return image;
      }
    }
    return null;
  }

  #notebookHtml(value: unknown, budget: NotebookRenderBudget): HTMLElement | null {
    const remaining = Math.max(0, MAX_NOTEBOOK_TOTAL_HTML_UNITS - budget.htmlUnits);
    const html = notebookMimeText(value, Math.min(MAX_NOTEBOOK_HTML_UNITS, remaining));
    if (!html) return null;
    budget.htmlUnits += html.text.length;
    if (html.truncated) budget.limited = true;
    const maximumTagMarkers = Math.min(MAX_NOTEBOOK_HTML_TAGS, Math.max(0, MAX_NOTEBOOK_DOM_NODES - budget.domNodes));
    if (!notebookMarkupTagMarkersWithinLimit(html.text, maximumTagMarkers)) {
      budget.limited = true;
      return null;
    }
    const fragment = DOMPurify.sanitize(html.text, {
      ALLOWED_TAGS: [
        "a", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol", "p", "pre", "s", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
      ],
      ALLOWED_ATTR: ["align", "colspan", "rowspan", "scope", "start", "title"],
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["audio", "button", "embed", "form", "iframe", "img", "input", "math", "object", "select", "source", "style", "svg", "textarea", "video"],
      FORBID_ATTR: ["class", "formaction", "href", "id", "ping", "src", "srcset", "style", "target"],
      KEEP_CONTENT: true,
      RETURN_DOM_FRAGMENT: true,
      SANITIZE_NAMED_PROPS: true,
    }) as DocumentFragment;
    const cost = this.#notebookNodeCost(fragment);
    if (!this.#consumeNotebookDomNodes(budget, cost)) return null;
    const container = this.ownerDocument.createElement("div");
    container.className = "notebook-rich-html";
    container.append(fragment);
    for (const anchor of container.querySelectorAll("a")) {
      anchor.removeAttribute("href");
      anchor.setAttribute("title", "Links are disabled in notebook preview");
    }
    return container;
  }

  #notebookRasterImage(
    mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif",
    value: unknown,
    budget: NotebookRenderBudget,
    alt: string,
  ): HTMLImageElement | null {
    const maximumEncodedUnits = Math.ceil(MAX_NOTEBOOK_IMAGE_BYTES / 3) * 4 + 4;
    const encoded = notebookMimeText(value, maximumEncodedUnits + 1);
    if (!encoded || encoded.truncated) return null;
    const normalized = encoded.text.replace(/[\t\n\f\r ]+/g, "");
    if (
      normalized.length === 0 ||
      normalized.length > maximumEncodedUnits ||
      normalized.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)
    ) return null;
    let binary: string;
    try {
      binary = (this.ownerDocument.defaultView?.atob ?? globalThis.atob)(normalized);
    } catch {
      return null;
    }
    if (
      binary.length === 0 ||
      binary.length > MAX_NOTEBOOK_IMAGE_BYTES ||
      budget.imageBytes + binary.length > MAX_NOTEBOOK_TOTAL_IMAGE_BYTES ||
      !notebookRasterStructureValid(mimeType, binary)
    ) {
      budget.limited = budget.imageBytes + binary.length > MAX_NOTEBOOK_TOTAL_IMAGE_BYTES;
      return null;
    }
    budget.imageBytes += binary.length;
    const image = this.ownerDocument.createElement("img");
    image.className = "notebook-output-image";
    image.alt = alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.src = `data:${mimeType};base64,${normalized}`;
    return image;
  }

  #notebookSvgImage(value: unknown, budget: NotebookRenderBudget, alt: string): HTMLImageElement | null {
    const svg = notebookMimeText(value, MAX_NOTEBOOK_SVG_UNITS + 1);
    if (!svg || svg.truncated || svg.text.length > MAX_NOTEBOOK_SVG_UNITS) return null;
    const maximumTagMarkers = Math.min(MAX_NOTEBOOK_SVG_NODES, Math.max(0, MAX_NOTEBOOK_DOM_NODES - budget.domNodes));
    if (!notebookMarkupTagMarkersWithinLimit(svg.text, maximumTagMarkers)) {
      budget.limited = true;
      return null;
    }
    const sanitized = String(DOMPurify.sanitize(svg.text, {
      ALLOWED_TAGS: [
        "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "clippath", "lineargradient", "radialgradient", "stop",
      ],
      ALLOWED_ATTR: [
        "xmlns", "viewBox", "preserveAspectRatio", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline", "offset", "stop-color", "stop-opacity", "clip-path",
      ],
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["a", "animate", "animateMotion", "animateTransform", "audio", "embed", "filter", "foreignObject", "iframe", "image", "object", "script", "set", "style", "use", "video"],
      FORBID_ATTR: ["href", "id", "style", "xlink:href"],
      KEEP_CONTENT: false,
      SANITIZE_NAMED_PROPS: true,
    }));
    if (!sanitized || /url\s*\(/i.test(sanitized)) return null;
    const template = this.ownerDocument.createElement("template");
    template.innerHTML = sanitized;
    const root = template.content.firstElementChild;
    if (!root || root.localName.toLowerCase() !== "svg" || template.content.children.length !== 1) return null;
    const nodeCount = this.#notebookNodeCost(root);
    if (nodeCount > MAX_NOTEBOOK_SVG_NODES || !this.#consumeNotebookDomNodes(budget, nodeCount)) return null;
    const serialized = root.outerHTML;
    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > MAX_NOTEBOOK_IMAGE_BYTES || budget.imageBytes + byteLength > MAX_NOTEBOOK_TOTAL_IMAGE_BYTES) {
      budget.limited = true;
      return null;
    }
    budget.imageBytes += byteLength;
    const image = this.ownerDocument.createElement("img");
    image.className = "notebook-output-image";
    image.alt = alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    return image;
  }

  #bindNotebookImageFallback(
    image: HTMLImageElement,
    job: NotebookPreviewJob,
    renderFallback: () => HTMLElement | null,
  ): void {
    image.addEventListener("error", () => {
      if (!this.#isNotebookJobCurrent(job) || !image.isConnected) return;
      let fallback: HTMLElement | null = null;
      try {
        fallback = renderFallback();
      } catch {
        fallback = null;
      }
      if (!this.#isNotebookJobCurrent(job) || !image.isConnected) return;
      if (!fallback) fallback = this.#textSpan("Saved image unavailable.", "notebook-image-placeholder notebook-limited");
      image.replaceWith(fallback);
    }, { once: true });
  }

  #isNotebookJobCurrent(job: NotebookPreviewJob): boolean {
    return this.#connected &&
      this.#notebookJob === job &&
      this.#notebookGeneration === job.generation &&
      !job.abortController.signal.aborted;
  }

  #notebookNodeCost(root: Node): number {
    let count = 0;
    const walker = this.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ALL);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) count += 1;
    return count;
  }

  #consumeNotebookDomNodes(budget: NotebookRenderBudget, count: number): boolean {
    if (count < 0 || budget.domNodes + count > MAX_NOTEBOOK_DOM_NODES) {
      budget.limited = true;
      return false;
    }
    budget.domNodes += count;
    return true;
  }

  async #yieldNotebookRender(signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve) => {
      const window = this.ownerDocument.defaultView;
      if (window) window.setTimeout(resolve, 0);
      else setTimeout(resolve, 0);
    });
    if (signal.aborted) {
      const error = new Error("Notebook preview cancelled");
      error.name = "AbortError";
      throw error;
    }
  }

  #cancelNotebookPreview(): void {
    this.#notebookGeneration += 1;
    const job = this.#notebookJob;
    this.#notebookJob = null;
    job?.abortController.abort();
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

  #csvReader(view: MainPreviewTextView): HTMLElement {
    const model = parseCsv(view.text, view.truncated);
    if (model.rows.length === 0) {
      return this.#statePanel("Empty CSV file", "This CSV file has no rows.", "empty", view);
    }

    const container = this.ownerDocument.createElement("article");
    container.className = "csv-preview";
    container.setAttribute("aria-label", `CSV preview: ${view.name}`);

    const header = this.ownerDocument.createElement("header");
    header.className = "csv-header";
    const headingCopy = this.ownerDocument.createElement("div");
    const title = this.ownerDocument.createElement("h2");
    title.className = "csv-title";
    title.textContent = view.name;
    const summary = this.ownerDocument.createElement("div");
    summary.className = "csv-summary";
    summary.textContent = `${model.totalRows.toLocaleString()} ${model.totalRows === 1 ? "row" : "rows"} · ${model.maximumColumns.toLocaleString()} ${model.maximumColumns === 1 ? "column" : "columns"} · comma-delimited`;
    headingCopy.append(title, summary);
    const mode = this.#textSpan("Preview grid", "csv-mode");
    header.append(headingCopy, mode);

    const notices = this.ownerDocument.createElement("div");
    notices.className = "csv-notices";
    if (view.truncated) {
      notices.append(this.#textSpan("Showing the beginning of this file. The final record may be incomplete.", "csv-notice"));
    }
    if (model.limited) notices.append(this.#textSpan("Preview limited for performance.", "csv-notice"));
    if (model.malformed) {
      notices.append(this.#textSpan("CSV quoting is malformed. Displayed using best effort.", "csv-notice csv-warning"));
    }

    const scroller = this.ownerDocument.createElement("div");
    scroller.className = "csv-table-scroll";
    scroller.tabIndex = 0;
    scroller.setAttribute("aria-label", `Scrollable CSV table for ${view.name}`);
    const table = this.ownerDocument.createElement("table");
    table.className = "csv-table";
    const caption = this.ownerDocument.createElement("caption");
    caption.className = "csv-caption";
    caption.textContent = `${view.name} CSV preview${view.truncated || model.limited ? ", partial data" : ""}`;

    const head = this.ownerDocument.createElement("thead");
    const headingRow = this.ownerDocument.createElement("tr");
    const corner = this.ownerDocument.createElement("th");
    corner.className = "csv-row-number csv-corner";
    corner.scope = "col";
    corner.textContent = "#";
    headingRow.append(corner);
    const displayedColumns = Math.min(model.maximumColumns, MAX_CSV_COLUMNS);
    for (let column = 1; column <= displayedColumns; column += 1) {
      const cell = this.ownerDocument.createElement("th");
      cell.className = "csv-column-header";
      cell.scope = "col";
      cell.textContent = excelColumnLabel(column);
      headingRow.append(cell);
    }
    head.append(headingRow);

    const body = this.ownerDocument.createElement("tbody");
    const fragment = this.ownerDocument.createDocumentFragment();
    for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
      const row = model.rows[rowIndex] ?? [];
      const tableRow = this.ownerDocument.createElement("tr");
      const rowNumber = this.ownerDocument.createElement("th");
      rowNumber.className = "csv-row-number";
      rowNumber.scope = "row";
      rowNumber.textContent = String(rowIndex + 1);
      tableRow.append(rowNumber);
      for (const value of row) {
        const cell = this.ownerDocument.createElement("td");
        cell.dir = "auto";
        cell.textContent = visibleCsvCellText(value);
        tableRow.append(cell);
      }
      fragment.append(tableRow);
    }
    body.append(fragment);
    table.append(caption, head, body);
    scroller.append(table);
    container.append(header);
    if (notices.childElementCount > 0) container.append(notices);
    container.append(scroller);
    return container;
  }

  #startDiagramPreview(): DiagramPreviewJob {
    this.#cancelDiagramPreview();
    const job = {
      generation: this.#diagramGeneration,
      abortController: new AbortController(),
    };
    this.#diagramJob = job;
    return job;
  }

  #isDiagramPreviewCurrent(job: DiagramPreviewJob): boolean {
    return this.#connected &&
      this.#diagramJob === job &&
      this.#diagramGeneration === job.generation &&
      !job.abortController.signal.aborted;
  }

  #cancelDiagramPreview(): void {
    this.#diagramGeneration += 1;
    const job = this.#diagramJob;
    this.#diagramJob = null;
    job?.abortController.abort(new DOMException("The diagram preview was cancelled.", "AbortError"));
  }

  #diagramReader(view: MainPreviewTextView): HTMLElement {
    const kind = diagramSourceKind(view.path);
    const container = this.ownerDocument.createElement("article");
    container.className = "diagram-preview";
    container.setAttribute("aria-label", `Diagram preview: ${view.name}`);
    const header = this.ownerDocument.createElement("header");
    header.className = "diagram-header";
    const headingCopy = this.ownerDocument.createElement("div");
    const title = this.ownerDocument.createElement("h2");
    title.className = "diagram-title";
    title.textContent = view.name;
    const summary = this.ownerDocument.createElement("div");
    summary.className = "diagram-summary";
    summary.textContent = kind === "drawio" ? "Draw.io diagram · Local preview" : "PlantUML activity · Local preview";
    headingCopy.append(title, summary);
    const controls = this.ownerDocument.createElement("div");
    controls.className = "diagram-controls";
    header.append(headingCopy, controls);
    const notices = this.ownerDocument.createElement("div");
    notices.className = "diagram-notices";
    const canvas = this.ownerDocument.createElement("div");
    canvas.className = "diagram-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", `${view.name} rendered diagram`);
    const status = (message: string, error = false): HTMLElement => {
      const element = this.ownerDocument.createElement("div");
      element.className = `diagram-status${error ? " error" : ""}`;
      element.setAttribute(error ? "role" : "aria-live", error ? "alert" : "polite");
      element.textContent = message;
      return element;
    };
    const notice = (message: string): HTMLElement => this.#textSpan(message, "diagram-notice");
    container.append(header);
    if (view.truncated) {
      notices.append(notice("Diagram rendering is disabled because this file exceeds the safe text-preview limit."));
      canvas.append(status("A truncated diagram cannot be parsed safely. Use the source file in a dedicated diagram editor.", true));
      container.append(notices, canvas);
      return container;
    }
    if (!kind) {
      canvas.append(status("This diagram format is not supported.", true));
      container.append(canvas);
      return container;
    }
    const initialJob = this.#startDiagramPreview();
    if (kind === "plantuml") {
      try {
        assertDiagramNotAborted(initialJob.abortController.signal);
        const model = parsePlantUmlActivity(view.text);
        assertDiagramNotAborted(initialJob.abortController.signal);
        summary.textContent = "PlantUML activity · Bounded local renderer";
        if (model.unsupported > 0) {
          notices.append(notice(`Partial preview: ${model.unsupported.toLocaleString()} unsupported PlantUML ${model.unsupported === 1 ? "statement was" : "statements were"} omitted.`));
        }
        const svg = renderPlantUmlActivitySvg(this.ownerDocument, model, `${view.name} PlantUML activity diagram`);
        assertDiagramNotAborted(initialJob.abortController.signal);
        canvas.append(svg);
      } catch (error) {
        if (!this.#isDiagramPreviewCurrent(initialJob)) return container;
        const message = error instanceof Error ? error.message : "The PlantUML activity could not be parsed.";
        canvas.append(status(`${message} Switch to editing mode to inspect the raw source.`, true));
      }
      if (notices.childElementCount > 0) container.append(notices);
      container.append(canvas);
      return container;
    }

    const Parser = this.ownerDocument.defaultView?.DOMParser;
    if (!Parser) {
      canvas.append(status("This Codex build cannot parse Draw.io XML locally.", true));
      container.append(canvas);
      return container;
    }
    let parsed: ReturnType<typeof drawioPages>;
    try {
      parsed = drawioPages(Parser, view.text, initialJob.abortController.signal);
    } catch (error) {
      if (!this.#isDiagramPreviewCurrent(initialJob)) return container;
      const message = error instanceof Error ? error.message : "The Draw.io file could not be parsed.";
      canvas.append(status(`${message} Switch to editing mode to inspect the raw source.`, true));
      container.append(canvas);
      return container;
    }
    summary.textContent = `Draw.io · ${parsed.pages.length.toLocaleString()} ${parsed.pages.length === 1 ? "page" : "pages"} · Local renderer`;
    if (parsed.limited) notices.append(notice(`Only the first ${MAX_DRAWIO_PAGES.toLocaleString()} Draw.io pages are available in preview.`));
    let pageNotice: HTMLElement | null = null;
    const renderPage = async (index: number): Promise<void> => {
      const page = parsed.pages[index];
      if (!page) return;
      const pageJob = this.#startDiagramPreview();
      pageNotice?.remove();
      pageNotice = null;
      canvas.replaceChildren(status(`Rendering ${page.name}…`));
      try {
        assertDiagramNotAborted(pageJob.abortController.signal);
        const model = await drawioPageModel(Parser, page, pageJob.abortController.signal);
        if (!this.#isDiagramPreviewCurrent(pageJob) || !container.isConnected) return;
        const rendered = renderDrawioSvg(this.ownerDocument, model, `${view.name} · ${page.name}`);
        if (!this.#isDiagramPreviewCurrent(pageJob) || !container.isConnected) return;
        canvas.replaceChildren(rendered.svg);
        canvas.setAttribute("aria-label", `${view.name} rendered Draw.io page: ${page.name}`);
        if (rendered.unsupportedShapes > 0) {
          pageNotice = notice(`${rendered.unsupportedShapes.toLocaleString()} unsupported Draw.io ${rendered.unsupportedShapes === 1 ? "shape uses" : "shapes use"} a safe rectangular fallback.`);
          notices.append(pageNotice);
          if (!notices.isConnected) container.insertBefore(notices, canvas);
        }
      } catch (error) {
        if (!this.#isDiagramPreviewCurrent(pageJob) || !container.isConnected) return;
        const message = error instanceof Error ? error.message : "The Draw.io page could not be rendered.";
        canvas.replaceChildren(status(`${message} Switch to editing mode to inspect the raw source.`, true));
      }
    };
    if (parsed.pages.length > 1) {
      const label = this.ownerDocument.createElement("label");
      label.className = "diagram-page-label";
      label.textContent = "Page";
      const select = this.ownerDocument.createElement("select");
      select.className = "diagram-page-select";
      select.setAttribute("aria-label", `Select a Draw.io page for ${view.name}`);
      parsed.pages.forEach((page, index) => {
        const option = this.ownerDocument.createElement("option");
        option.value = String(index);
        option.textContent = page.name;
        select.append(option);
      });
      select.addEventListener("change", () => void renderPage(Number.parseInt(select.value, 10)));
      label.append(select);
      controls.append(label);
    }
    if (notices.childElementCount > 0) container.append(notices);
    container.append(canvas);
    void renderPage(0);
    return container;
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
      case "notebook":
        return `Notebook \u00b7 ${formatBytes(view.sizeBytes)}`;
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
    const parent = this.#connected && this.#state.tabs.length > 0 && this.parentElement?.matches(MAIN_SURFACE_SELECTOR)
      ? this.parentElement
      : null;
    if (!parent) {
      this.#restoreSuppressedChildren();
      return;
    }
    if (this.#suppressedParent !== parent) {
      this.#restoreSuppressedChildren();
      this.#suppressedParent = parent;
      this.#childObserver = new MutationObserver(() => this.#syncSuppression());
      this.#childObserver.observe(parent, { childList: true, subtree: true });
    }

    const directChildren = Array.from(parent.children);
    const nativeHeader = directChildren.find((child) => child.matches(
      "header[data-app-shell-application-menu-bar], header[data-app-shell-header-edge-scroll]",
    ));
    const nativeHeaderSubject = nativeHeader?.querySelector(
      '[data-testid="app-shell-header-context-menu-surface"]',
    ) ?? nativeHeader;
    const desired = new Set<Element>();
    if (nativeHeaderSubject) desired.add(nativeHeaderSubject);

    if (this.#state.activePath !== null) {
      for (const child of directChildren) {
        if (child !== this && child !== nativeHeader) desired.add(child);
      }
    }

    for (const child of Array.from(this.#suppressedChildren.keys())) {
      if (!desired.has(child)) this.#restoreSuppressedChild(child);
    }
    for (const child of desired) this.#suppressChild(child);
  }

  #suppressChild(child: Element): void {
    if (this.#suppressedChildren.has(child)) return;
    const style = (child as HTMLElement).style;
    this.#suppressedChildren.set(child, {
      inert: child.getAttribute("inert"),
      ariaHidden: child.getAttribute("aria-hidden"),
      opacity: style.getPropertyValue("opacity"),
      opacityPriority: style.getPropertyPriority("opacity"),
    });
    child.setAttribute("inert", "");
    child.setAttribute("aria-hidden", "true");
    style.setProperty("opacity", "0", "important");
  }

  #restoreSuppressedChild(child: Element): void {
    const attributes = this.#suppressedChildren.get(child);
    if (!attributes) return;
    restoreAttribute(child, "inert", attributes.inert);
    restoreAttribute(child, "aria-hidden", attributes.ariaHidden);
    const style = (child as HTMLElement).style;
    if (attributes.opacity) style.setProperty("opacity", attributes.opacity, attributes.opacityPriority);
    else style.removeProperty("opacity");
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
