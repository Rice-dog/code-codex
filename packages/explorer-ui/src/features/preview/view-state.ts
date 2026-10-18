// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { AUDIO_PREVIEWER_ID,CSV_PREVIEWER_ID,DIAGRAM_PREVIEWER_ID,IMAGE_PREVIEWER_ID,MARKDOWN_PREVIEWER_ID,MODEL_PREVIEWER_ID,NOTEBOOK_PREVIEWER_ID,OFFICE_MIME_TYPES,OFFICE_PREVIEWER_ID,PDF_PREVIEWER_ID,VIDEO_PREVIEWER_ID } from "../../core/preview/configuration";
import type { DiagramSourceKind,MainPreviewFileView,MainPreviewMediaView,MainPreviewModelView,MainPreviewState,MainPreviewUnavailableReason,OfficeDocumentKind } from "../../file-preview/contracts";
import { isPluginPackageLoaded,pluginModule } from "../../plugin-runtime";


export function isMarkdownPreviewPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return normalized.endsWith(".md") || normalized.endsWith(".markdown");
}


export function isCsvPreviewPath(path: string): boolean {
  return path.replaceAll("\\", "/").toLowerCase().endsWith(".csv");
}


export function diagramSourceKind(path: string): DiagramSourceKind | null {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  if (normalized.endsWith(".drawio")) return "drawio";
  if (normalized.endsWith(".plantuml")) return "plantuml";
  return null;
}


export function isDiagramPreviewPath(path: string): boolean {
  return diagramSourceKind(path) !== null;
}


export function fileNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path || "File";
}


export function isMediaPreviewView(view: MainPreviewFileView | undefined): view is MainPreviewMediaView {
  return view?.kind === "image" ||
    view?.kind === "video" ||
    view?.kind === "pdf" ||
    view?.kind === "audio" ||
    view?.kind === "office" ||
    view?.kind === "notebook";
}


export function previewerIdForMediaKind(kind: MainPreviewMediaView["kind"] | MainPreviewModelView["kind"]): string {
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
    case "model":
      return MODEL_PREVIEWER_ID;
  }
}


export function officeDocumentKind(mimeType: string): OfficeDocumentKind | null {
  return OFFICE_MIME_TYPES[mimeType.trim().toLowerCase()] ?? null;
}


export function cloneView(view: MainPreviewFileView): MainPreviewFileView {
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
    case "git-diff":
      return {
        kind: "git-diff",
        path: view.path,
        name,
        sourcePath: view.sourcePath,
        content: view.content,
        truncated: view.truncated,
        shortHash: view.shortHash,
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
        ...(view.previewNotice === undefined ? {} : { previewNotice: view.previewNotice }),
      };
    case "model":
      return {
        kind: "model",
        path: view.path,
        name,
        mimeType: view.mimeType,
        sizeBytes: view.sizeBytes,
        bytes: view.bytes,
        version: view.version,
        resources: view.resources.map((resource) => ({ ...resource })),
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


export function normalizeState(state: MainPreviewState): MainPreviewState {
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
    MODEL_PREVIEWER_ID,
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


export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Size unavailable";
  if (value < 1024) return `${Math.trunc(value)} B`;
  const units = ["KB", "MB", "GB"] as const;
  let amount = value / 1024;
  let unit: (typeof units)[number] = units[0];
  for (let index = 1;index < units.length && amount >= 1024;index += 1) {
    amount /= 1024;
    unit = units[index] ?? unit;
  }
  const digits = amount >= 10 || Number.isInteger(amount) ? 0 : 1;
  return `${amount.toFixed(digits)} ${unit}`;
}


export function sourceLineCount(source: string): number {
  let count = 1;
  for (let index = 0;index < source.length;index += 1) {
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


export function firstVisibleLineOffset(source: string, scrollTop: number, lineHeight: number, paddingTop: number): number {
  const visibleLine = Math.max(0, Math.floor((scrollTop - paddingTop) / lineHeight));
  let offset = 0;
  for (let line = 0;line < visibleLine;line += 1) {
    const newline = source.indexOf("\n", offset);
    if (newline < 0) return source.length;
    offset = newline + 1;
  }
  return offset;
}


export function selectionOffsetWithin(root: HTMLElement, node: Node | null, offset: number): number | null {
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


export function textPositionAtOffset(root: HTMLElement, requestedOffset: number): { readonly node: Node; readonly offset: number } {
  const offset = Math.max(0, requestedOffset);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastText: Text | null = null;
  for (let current = walker.nextNode();current;current = walker.nextNode()) {
    if (!(current instanceof Text)) continue;
    lastText = current;
    if (remaining <= current.data.length) return { node: current, offset: remaining };
    remaining -= current.data.length;
  }
  if (lastText) return { node: lastText, offset: lastText.data.length };
  return { node: root, offset: Math.min(offset, root.childNodes.length) };
}


export function unsupportedCopy(reason: MainPreviewUnavailableReason): string {
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


export function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}


export function previewMethod(id: string, name: string): ((...args: any[]) => any) | undefined { try { if (!isPluginPackageLoaded(id)) return undefined; const method = pluginModule(id).exports[name]; return typeof method === "function" ? method as (...args: any[]) => any : undefined; } catch { return undefined; } }

export function previewPackageId(kind: string): string | undefined { return ["markdown", "csv", "diagram", "image", "video", "pdf", "audio", "office", "notebook", "model"].includes(kind) ? `${kind}-preview` : undefined; }
