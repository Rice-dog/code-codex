import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { highlightSyntaxForPath } from "../syntax-highlight";
import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { NotebookMimeBundle, NotebookModel, NotebookCellModel, NotebookOutputModel, NotebookParseBudget, NotebookRenderBudget, MainPreviewMediaView, NotebookPreviewJob } from './contracts';
export const NOTEBOOK_PREVIEW_MIME = "application/x-ipynb+json";

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

const NOTEBOOK_RENDER_BATCH_CELLS = 4;

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
  for (let index = 0;index < segmentCount;index += 1) {
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
  for (let index = 0;index < maximum;index += 1) {
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
    for (let index = 0;index < source.length && !overflow;index += 1) {
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
  const entries = function*(record: Record<string, unknown>): Generator<readonly [string, unknown], void, void> {
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

export const methods = {
  _notebookPreview(this: PreviewHost, view: MainPreviewMediaView): HTMLElement {
    if (view.mimeType !== NOTEBOOK_PREVIEW_MIME) {
      return this._statePanel("Notebook preview unavailable", "This file does not contain a supported notebook payload.", "unsupported", view);
    }
    const container = this.ownerDocument.createElement("article");
    container.className = "notebook-preview";
    container.setAttribute("aria-label", `Jupyter notebook preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");
    const loading = this._textSpan("Loading notebook\u2026", "office-preview-loading");
    loading.setAttribute("role", "status");
    container.append(loading);

    const job: NotebookPreviewJob = {
      generation: ++this._notebookGeneration,
      abortController: new AbortController(),
    };
    this._notebookJob = job;
    const isCurrent = (): boolean =>
      this._connected &&
      this._notebookJob === job &&
      this._notebookGeneration === job.generation &&
      !job.abortController.signal.aborted &&
      container.isConnected;

    queueMicrotask(() => {
      void (async () => {
        try {
          const model = parseNotebook(view.bytes);
          if (!isCurrent()) return;
          await this._renderNotebookModel(view, model, container, job, isCurrent);
        } catch (error) {
          if (!isCurrent()) return;
          const message = error instanceof Error ? error.message : "This notebook could not be opened.";
          container.setAttribute("aria-busy", "false");
          container.replaceChildren(this._statePanel("Notebook preview failed", message, "error", view));
        }
      })();
    });
    return container;
  },

  async _renderNotebookModel(this: PreviewHost,
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
    const mode = this._textSpan("Read-only \u00b7 saved outputs only", "notebook-mode");
    header.append(headingCopy, mode);

    const notices = this.ownerDocument.createElement("div");
    const versionNotice = model.newerMinor
      ? this._textSpan("This notebook uses a newer nbformat minor version. Known fields are shown using best-effort rendering.", "notebook-notice")
      : null;
    if (versionNotice) notices.append(versionNotice);
    const limitNotice = this._textSpan("Preview limited for performance.", "notebook-notice notebook-limited");
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

    for (let start = 0;start < model.cells.length;start += NOTEBOOK_RENDER_BATCH_CELLS) {
      if (!isCurrent()) return;
      const fragment = this.ownerDocument.createDocumentFragment();
      const end = Math.min(model.cells.length, start + NOTEBOOK_RENDER_BATCH_CELLS);
      for (let index = start;index < end;index += 1) {
        const cell = this._notebookCell(model.cells[index]!, index, model.languagePath, budget, job);
        if (cell) fragment.append(cell);
      }
      cells.append(fragment);
      limitNotice.hidden = !budget.limited;
      if (end < model.cells.length) await this._yieldNotebookRender(job.abortController.signal);
    }
    if (model.cells.length === 0 && isCurrent()) {
      const empty = this._textSpan("This notebook does not contain any cells.", "notebook-notice");
      cells.append(empty);
    }
    if (isCurrent()) container.setAttribute("aria-busy", "false");
  },

  _notebookCell(this: PreviewHost,
    cell: NotebookCellModel,
    index: number,
    languagePath: string,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement | null {
    if (!this._consumeNotebookDomNodes(budget, 5)) return null;
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
      body.append(this._notebookMarkdown(cell.source, cell.attachments, budget, job));
    } else if (cell.kind === "code") {
      const execution = cell.executionCount === null ? " " : String(cell.executionCount);
      prompt.textContent = `In [${execution}]`;
      section.setAttribute("aria-label", `Code cell ${index + 1}${cell.executionCount === null ? "" : `, execution ${cell.executionCount}`}`);
      const pre = this.ownerDocument.createElement("pre");
      pre.className = "notebook-source";
      const highlighted = this._highlightedCode(languagePath, cell.source);
      const highlightedNodes = highlighted.querySelectorAll("*").length + highlighted.childNodes.length + 1;
      if (this._consumeNotebookDomNodes(budget, highlightedNodes)) {
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
        for (let outputIndex = 0;outputIndex < cell.outputs.length;outputIndex += 1) {
          if (!this._consumeNotebookDomNodes(budget, 2)) break;
          outputs.append(this._notebookOutput(cell.outputs[outputIndex]!, index, outputIndex, budget, job));
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
      body.append(this._textSpan(cell.reason, "notebook-output unsupported"));
    }
    section.append(prompt, body);
    return section;
  },

  _notebookOutput(this: PreviewHost,
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
      const rendered = this._notebookMimeOutput(output.data, budget, job, `Output from code cell ${cellIndex + 1}`);
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
  },

  _notebookMimeOutput(this: PreviewHost,
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
    for (let priorityIndex = startIndex;priorityIndex < priorities.length;priorityIndex += 1) {
      const mimeType = priorities[priorityIndex]!;
      if (!Object.prototype.hasOwnProperty.call(bundle, mimeType)) continue;
      const value = bundle[mimeType];
      if (mimeType === "image/svg+xml") {
        const image = this._notebookSvgImage(value, budget, alt);
        if (image) {
          this._bindNotebookImageFallback(image, job, () => this._notebookMimeOutput(bundle, budget, job, alt, priorityIndex + 1));
          return image;
        }
        continue;
      }
      if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/gif") {
        const image = this._notebookRasterImage(mimeType, value, budget, alt);
        if (image) {
          this._bindNotebookImageFallback(image, job, () => this._notebookMimeOutput(bundle, budget, job, alt, priorityIndex + 1));
          return image;
        }
        continue;
      }
      if (mimeType === "text/html") {
        const html = this._notebookHtml(value, budget);
        if (html) return html;
        continue;
      }
      if (mimeType === "text/markdown") {
        const text = this._takeNotebookRenderText(value, budget);
        if (!text) continue;
        return this._notebookMarkdown(text, new Map(), budget, job);
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
      const text = this._takeNotebookRenderText(value, budget);
      if (!text) continue;
      const pre = this.ownerDocument.createElement("pre");
      pre.textContent = text;
      return pre;
    }
    return null;
  },

  _takeNotebookRenderText(this: PreviewHost, value: unknown, budget: NotebookRenderBudget): string | null {
    const remaining = Math.max(0, MAX_NOTEBOOK_TOTAL_OUTPUT_TEXT_UNITS - budget.outputTextUnits);
    const text = notebookMimeText(value, Math.min(MAX_NOTEBOOK_OUTPUT_TEXT_UNITS, remaining));
    if (!text) return null;
    budget.outputTextUnits += text.text.length;
    if (text.truncated) budget.limited = true;
    return text.text;
  },

  _notebookMarkdown(this: PreviewHost,
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
      const image = attachment ? this._notebookAttachmentImage(attachment, budget, job, alt) : null;
      if (image) placeholder.replaceWith(image);
      else {
        placeholder.textContent = attachmentName ? `Attachment unavailable \u00b7 ${alt}` : `External image blocked \u00b7 ${alt}`;
        placeholder.removeAttribute("data-notebook-image-src");
        placeholder.removeAttribute("data-notebook-image-alt");
      }
    }
    const cost = article.querySelectorAll("*").length + article.childNodes.length + 1;
    if (this._consumeNotebookDomNodes(budget, cost)) return article;
    return fallback();
  },

  _notebookAttachmentImage(this: PreviewHost,
    bundle: NotebookMimeBundle,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
    alt: string,
    startIndex = 0,
  ): HTMLImageElement | null {
    const priorities = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;
    for (let priorityIndex = startIndex;priorityIndex < priorities.length;priorityIndex += 1) {
      const mimeType = priorities[priorityIndex]!;
      if (!Object.prototype.hasOwnProperty.call(bundle, mimeType)) continue;
      const value = bundle[mimeType];
      const image = mimeType === "image/svg+xml"
        ? this._notebookSvgImage(value, budget, alt)
        : this._notebookRasterImage(mimeType, value, budget, alt);
      if (image) {
        this._bindNotebookImageFallback(
          image,
          job,
          () => this._notebookAttachmentImage(bundle, budget, job, alt, priorityIndex + 1),
        );
        return image;
      }
    }
    return null;
  },

  _notebookHtml(this: PreviewHost, value: unknown, budget: NotebookRenderBudget): HTMLElement | null {
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
    const cost = this._notebookNodeCost(fragment);
    if (!this._consumeNotebookDomNodes(budget, cost)) return null;
    const container = this.ownerDocument.createElement("div");
    container.className = "notebook-rich-html";
    container.append(fragment);
    for (const anchor of container.querySelectorAll("a")) {
      anchor.removeAttribute("href");
      anchor.setAttribute("title", "Links are disabled in notebook preview");
    }
    return container;
  },

  _notebookRasterImage(this: PreviewHost,
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
  },

  _notebookSvgImage(this: PreviewHost, value: unknown, budget: NotebookRenderBudget, alt: string): HTMLImageElement | null {
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
    const nodeCount = this._notebookNodeCost(root);
    if (nodeCount > MAX_NOTEBOOK_SVG_NODES || !this._consumeNotebookDomNodes(budget, nodeCount)) return null;
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
  },

  _bindNotebookImageFallback(this: PreviewHost,
    image: HTMLImageElement,
    job: NotebookPreviewJob,
    renderFallback: () => HTMLElement | null,
  ): void {
    image.addEventListener("error", () => {
      if (!this._isNotebookJobCurrent(job) || !image.isConnected) return;
      let fallback: HTMLElement | null = null;
      try {
        fallback = renderFallback();
      } catch {
        fallback = null;
      }
      if (!this._isNotebookJobCurrent(job) || !image.isConnected) return;
      if (!fallback) fallback = this._textSpan("Saved image unavailable.", "notebook-image-placeholder notebook-limited");
      image.replaceWith(fallback);
    }, { once: true });
  },

  _isNotebookJobCurrent(this: PreviewHost, job: NotebookPreviewJob): boolean {
    return this._connected &&
      this._notebookJob === job &&
      this._notebookGeneration === job.generation &&
      !job.abortController.signal.aborted;
  },

  _notebookNodeCost(this: PreviewHost, root: Node): number {
    let count = 0;
    const walker = this.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ALL);
    for (let node = walker.nextNode();node;node = walker.nextNode()) count += 1;
    return count;
  },

  _consumeNotebookDomNodes(this: PreviewHost, budget: NotebookRenderBudget, count: number): boolean {
    if (count < 0 || budget.domNodes + count > MAX_NOTEBOOK_DOM_NODES) {
      budget.limited = true;
      return false;
    }
    budget.domNodes += count;
    return true;
  },

  async _yieldNotebookRender(this: PreviewHost, signal: AbortSignal): Promise<void> {
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
  },

  _cancelNotebookPreview(this: PreviewHost): void {
    this._notebookGeneration += 1;
    const job = this._notebookJob;
    this._notebookJob = null;
    job?.abortController.abort();
  }
};
