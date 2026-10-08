declare const __CODE_CODEX_PPT_VIEWER_STYLES__: string;
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import { ReactPptxViewer, type ParsedPresentation, type PresentationDocument, type PresentationWarning, type PptxViewerController, type SlideNode } from "@extend-ai/react-pptx";
import { renderAsync as renderDocxAsync } from "docx-preview";
import JSZip from "jszip";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { OfficeDocumentKind, OfficeDomBudget, DocxPaginationClock, DocxBlockSplitResult, XlsxWorksheetMeta, ParsedXlsxWorksheet, XlsxSharedStrings, XlsxCellStyle, XlsxPreviewCell, XlsxStyleTable, XlsxRange, MainPreviewMediaView, OfficePreviewJob } from './contracts';




export const NATIVE_POWERPOINT_PREVIEW_MIME = "application/vnd.code-codex.powerpoint-slides+zip";

export const POWERPOINT_FULL_FIDELITY_NOTICE = "powerpoint-required-for-full-fidelity" as const;

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
  for (let pass = 0;pass < 2;pass += 1) {
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

export const methods = {
  _officePreview(this: PreviewHost, view: MainPreviewMediaView): HTMLElement {
    if (!this._shadow.querySelector("style[data-office-preview]")) { const style = this.ownerDocument.createElement("style"); style.dataset.officePreview = "true"; style.textContent = __CODE_CODEX_PPT_VIEWER_STYLES__; this._shadow.append(style); }
    const documentKind = officeDocumentKind(view.mimeType);
    if (!documentKind) {
      return this._statePanel("Office preview unavailable", "This Office file type is not supported.", "unsupported", view);
    }

    const container = this.ownerDocument.createElement("div");
    container.className = "office-preview";
    container.dataset.kind = documentKind;
    container.setAttribute("aria-label", `${documentKind.toUpperCase()} preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");

    const stage = this.ownerDocument.createElement("div");
    stage.className = "office-preview-stage";
    const loading = this._textSpan(`Loading ${documentKind.toUpperCase()}\u2026`, "office-preview-loading");
    loading.setAttribute("role", "status");
    stage.append(loading);
    container.append(stage);
    if (view.previewNotice === POWERPOINT_FULL_FIDELITY_NOTICE) {
      const notice = this._textSpan(
        "Install Microsoft PowerPoint for a full-fidelity preview. The built-in renderer is being used.",
        "office-preview-notice",
      );
      notice.setAttribute("role", "status");
      container.dataset.hasNotice = "true";
      container.append(notice);
    }

    const job: OfficePreviewJob = {
      generation: ++this._officeGeneration,
      abortController: new AbortController(),
      viewer: null,
      legacyPptRoot: null,
      legacyPptWorker: null,
      nativePptObjectUrl: null,
      resourceObserver: null,
      docxRepairTimer: null,
    };
    this._officeJob = job;

    const isCurrent = (): boolean =>
      this._connected &&
      this._officeJob === job &&
      this._officeGeneration === job.generation &&
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
      stage.replaceChildren(this._statePanel("Office preview failed", message, "error", view));
    };

    queueMicrotask(() => {
      void (async () => {
        if (!isCurrent()) return;
        try {
          if (documentKind === "docx") {
            await this._renderDocxOffice(view, container, stage, job, isCurrent);
          } else if (documentKind === "xlsx") {
            await this._renderXlsxOffice(view, container, stage, job, isCurrent);
          } else if (documentKind === "ppt") {
            if (view.mimeType === NATIVE_POWERPOINT_PREVIEW_MIME) {
              await this._renderNativePptOffice(view, container, stage, job, isCurrent);
            } else {
              await this._renderLegacyPptOffice(view, container, stage, job, isCurrent);
            }
          } else {
            await this._renderPptxOffice(view, container, stage, job, isCurrent);
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
  },

  async _renderDocxOffice(this: PreviewHost,
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
    const previewBytes = await this._prepareDocxPreviewBytes(view.bytes, job.abortController.signal);

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
    const generatedStyles = this._takeSanitizedDocxStyles(generatedStyleHost, docxClassName);
    for (const style of documentRoot.querySelectorAll("style")) style.remove();
    this._sanitizeDetachedDocx(documentRoot);
    this._captureDocxPreviewMarkers(documentRoot);
    const truncated = this._boundOfficeDom(documentRoot);
    const documentCost = this._officeDomCost(documentRoot, false);
    const domBudget: OfficeDomBudget = {
      remainingNodes: Math.max(0, MAX_OFFICE_DOM_NODES - documentCost.nodes),
      remainingTextUnits: Math.max(0, MAX_OFFICE_TEXT_UNITS - documentCost.textUnits),
    };
    if (!isCurrent()) return;
    stage.replaceChildren(...generatedStyles, documentRoot);
    await this._settleDocxLayout(documentRoot, job.abortController.signal);
    if (!isCurrent()) return;
    await this._paginateDocxOverflowPages(
      documentRoot,
      docxClassName,
      job.abortController.signal,
      domBudget,
    );
    if (!isCurrent()) return;
    this._renumberDocxCachedPageFooters(documentRoot, docxClassName, domBudget);
    this._observeOfficeResources(documentRoot, job);
    this._observeLateDocxLayout(documentRoot, docxClassName, job, domBudget);
    if (truncated) {
      const notice = this._textSpan("Preview limited for performance.", "office-preview-notice");
      notice.setAttribute("role", "status");
      container.append(notice);
    }
  },

  async _prepareDocxPreviewBytes(this: PreviewHost, bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    try {
      this._throwIfOfficeAborted(signal);
      const archive = await JSZip.loadAsync(bytes.slice(), { checkCRC32: false, createFolders: false });
      this._throwIfOfficeAborted(signal);
      const documentEntry = archive.file("word/document.xml");
      if (!documentEntry) return bytes;
      const document = await this._readXlsxXmlEntry(
        documentEntry,
        MAX_DOCX_DOCUMENT_XML_BYTES,
        signal,
        "Word document",
      );
      let styles: Document | null = null;
      const stylesEntry = archive.file("word/styles.xml");
      if (stylesEntry) {
        try {
          styles = await this._readXlsxXmlEntry(
            stylesEntry,
            MAX_DOCX_STYLES_XML_BYTES,
            signal,
            "Word styles",
          );
        } catch {
          this._throwIfOfficeAborted(signal);
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
        for (let pathIndex = path.length - 1;pathIndex >= 0;pathIndex -= 1) {
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
      for (let paragraphIndex = 0;paragraphIndex < paragraphs.length;paragraphIndex += 1) {
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
      for (let paragraphIndex = 0;paragraphIndex < paragraphs.length;paragraphIndex += 1) {
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
        for (let nextIndex = paragraphIndex + 1;nextIndex < paragraphs.length;nextIndex += 1) {
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
      for (let rowIndex = 0;rowIndex < tableHeaderRows.length;rowIndex += 1) {
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
      for (let paragraphIndex = 0;paragraphIndex < keepNextParagraphs.length;paragraphIndex += 1) {
        const paragraph = keepNextParagraphs[paragraphIndex];
        if (paragraph) {
          addBookmarkMarker(paragraph, `${DOCX_KEEP_NEXT_MARKER_PREFIX}${paragraphIndex}`);
        }
      }

      const serialized = new Serializer().serializeToString(document);
      archive.file("word/document.xml", serialized);
      const prepared = await archive.generateAsync(
        { type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } },
        () => this._throwIfOfficeAborted(signal),
      );
      this._throwIfOfficeAborted(signal);
      return prepared.byteLength <= MAX_DOCX_PREPARED_BYTES ? prepared : bytes;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return bytes;
    }
  },

  _captureDocxPreviewMarkers(this: PreviewHost, root: HTMLElement): void {
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
  },

  async _settleDocxLayout(this: PreviewHost, root: HTMLElement, signal: AbortSignal): Promise<void> {
    await Promise.all([
      this._waitOfficeDelay(DOCX_LAYOUT_SETTLE_MILLISECONDS, signal),
      this._waitForDocxImages(root, signal),
    ]);
    await this._yieldOfficeAnimationFrame(signal);
    await this._yieldOfficeAnimationFrame(signal);
    this._throwIfOfficeAborted(signal);
    void root.getBoundingClientRect();
  },

  async _waitForDocxImages(this: PreviewHost, root: HTMLElement, signal: AbortSignal): Promise<void> {
    this._throwIfOfficeAborted(signal);
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
      const onAbort = (): void => finish(this._officeAbortError());
      const timer = globalThis.setTimeout(() => finish(), DOCX_IMAGE_SETTLE_MILLISECONDS);
      signal.addEventListener("abort", onAbort, { once: true });
      void decoding.then(() => finish());
    });
  },

  async _waitOfficeDelay(this: PreviewHost, milliseconds: number, signal: AbortSignal): Promise<void> {
    this._throwIfOfficeAborted(signal);
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        globalThis.clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(this._officeAbortError());
      };
      const timer = globalThis.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  },

  async _yieldOfficeAnimationFrame(this: PreviewHost, signal: AbortSignal): Promise<void> {
    this._throwIfOfficeAborted(signal);
    const window = this.ownerDocument.defaultView;
    if (!window) {
      await this._waitOfficeDelay(0, signal);
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
      const onAbort = (): void => finish(this._officeAbortError());
      const frame = window.requestAnimationFrame(() => finish());
      const fallback = window.setTimeout(() => finish(), 100);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  },

  _renumberDocxCachedPageFooters(this: PreviewHost,
    root: HTMLElement,
    className: string,
    domBudget: OfficeDomBudget,
  ): void {
    const wrapperClassName = `${className}-wrapper`;
    const pages = Array.from(root.querySelectorAll<HTMLElement>(`section.${className}`)).filter(
      (page) => page.parentElement?.classList.contains(wrapperClassName),
    );
    let nextPageNumber: number | null = null;
    for (let pageIndex = 0;pageIndex < pages.length;pageIndex += 1) {
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
  },

  _observeLateDocxLayout(this: PreviewHost,
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
      if (signal.aborted || this._officeJob !== job || repairCount >= maximumRepairs) return;
      repairRunning = true;
      repairQueued = false;
      repairCount += 1;
      try {
        await this._yieldOfficeAnimationFrame(signal);
        await this._yieldOfficeAnimationFrame(signal);
        if (this._officeJob !== job) return;
        const overflowing = Array.from(
          root.querySelectorAll<HTMLElement>(`section.${className}`),
        ).some((page) => (
          !page.classList.contains("office-word-unpaginated") &&
          this._docxPageOverflows(page)
        ));
        if (!overflowing) return;
        await this._paginateDocxOverflowPages(root, className, signal, domBudget);
        if (this._officeJob === job) {
          this._renumberDocxCachedPageFooters(root, className, domBudget);
        }
      } finally {
        repairRunning = false;
        if (repairQueued && !signal.aborted && this._officeJob === job) scheduleRepair();
      }
    };

    const scheduleRepair = (): void => {
      if (
        signal.aborted ||
        this._officeJob !== job ||
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
  },

  async _checkpointDocxPagination(this: PreviewHost,
    clock: DocxPaginationClock,
    signal: AbortSignal,
    forceYield = false,
  ): Promise<void> {
    this._throwIfOfficeAborted(signal);
    if (!forceYield && Date.now() < clock.sliceEndsAt) return;
    await this._yieldOfficeRender();
    this._throwIfOfficeAborted(signal);
    clock.sliceEndsAt = Date.now() + DOCX_AUTO_PAGINATION_SLICE_MILLISECONDS;
  },

  async _paginateDocxOverflowPages(this: PreviewHost,
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
      await this._checkpointDocxPagination(clock, signal);

      const shellChildren = Array.from(sourcePage.children) as HTMLElement[];
      const sourceArticles = shellChildren.filter((child) => child.tagName === "ARTICLE");
      const unsupportedChildren = shellChildren.some(
        (child) => !["ARTICLE", "FOOTER", "HEADER"].includes(child.tagName),
      );
      if (sourceArticles.length !== 1 || unsupportedChildren) {
        if (this._docxPageOverflows(sourcePage)) {
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
        !this._docxPageOverflows(sourcePage)
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
        this._stripDocxCloneIds(page);
        if (!this._reserveOfficeDomClones(domBudget, [page])) {
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
          this._stripDocxCloneIds(fallbackPage);
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
        await this._checkpointDocxPagination(clock, signal);
        operationCount += 1;
        if (operationCount % 64 === 0) {
          await this._checkpointDocxPagination(clock, signal, true);
        }

        if (pending[0]?.dataset.cleDocxKeepNext === "true") {
          let keepNextCount = 0;
          while (pending[keepNextCount]?.dataset.cleDocxKeepNext === "true") {
            keepNextCount += 1;
            if (keepNextCount % 64 === 0) {
              await this._checkpointDocxPagination(clock, signal, true);
            }
          }
          const unitLength = Math.min(pending.length, keepNextCount + 1);
          const keepNextUnit = pending.slice(0, unitLength);
          currentArticle.append(...keepNextUnit);
          if (!this._docxPageOverflows(currentPage)) {
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
          for (let chainIndex = 0;chainIndex < keepNextCount;chainIndex += 1) {
            const chainBlock = pending[chainIndex];
            if (chainBlock) delete chainBlock.dataset.cleDocxKeepNext;
          }
        }

        const block = pending[0];
        if (!block) break;
        currentArticle.append(block);
        if (!this._docxPageOverflows(currentPage)) {
          pending.shift();
          currentHasContent = true;
          continue;
        }
        block.remove();

        if (currentHasContent) {
          let blockSplit: DocxBlockSplitResult = await this._splitDocxTableForPage(
            block,
            currentArticle,
            currentPage,
            signal,
            clock,
            domBudget,
            true,
          );
          if (blockSplit === null) {
            blockSplit = await this._splitDocxParagraphForPage(
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

        let blockSplit: DocxBlockSplitResult = await this._splitDocxTableForPage(
          block,
          currentArticle,
          currentPage,
          signal,
          clock,
          domBudget,
        );
        if (blockSplit === null) {
          blockSplit = await this._splitDocxParagraphForPage(
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
  },

  _docxPageOverflows(this: PreviewHost, page: HTMLElement): boolean {
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
  },

  _stripDocxCloneIds(this: PreviewHost, root: HTMLElement): void {
    root.removeAttribute("id");
    for (const element of root.querySelectorAll("[id]")) element.removeAttribute("id");
  },

  async _splitDocxParagraphForPage(this: PreviewHost,
    block: HTMLElement,
    article: HTMLElement,
    page: HTMLElement,
    signal: AbortSignal,
    clock: DocxPaginationClock,
    domBudget: OfficeDomBudget,
  ): Promise<DocxBlockSplitResult> {
    if (block.tagName !== "P") return null;
    await this._checkpointDocxPagination(clock, signal);
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
      for (let child = node.lastChild;child;child = child.previousSibling) nodes.push(child);
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
        await this._checkpointDocxPagination(clock, signal, true);
      }
      const candidateOffset = Math.floor((lowestCandidate + highestCandidate) / 2);
      const candidate = cloneAtOffset(candidateOffset);
      if (!candidate) return null;
      article.append(candidate.prefix);
      const fits = !this._docxPageOverflows(page);
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
    for (let offset = splitOffset;offset > Math.max(0, splitOffset - 256);offset -= 1) {
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
    if (this._docxPageOverflows(page)) {
      result.prefix.remove();
      return null;
    }
    result.prefix.remove();

    const sourceCost = this._officeDomCost(sourceParagraph);
    const prefixCost = this._officeDomCost(result.prefix);
    const remainderCost = this._officeDomCost(result.remainder);
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
  },

  async _splitDocxTableForPage(this: PreviewHost,
    block: HTMLElement,
    article: HTMLElement,
    page: HTMLElement,
    signal: AbortSignal,
    clock: DocxPaginationClock,
    domBudget: OfficeDomBudget,
    requireFittingFragment = false,
  ): Promise<DocxBlockSplitResult> {
    if (block.tagName !== "TABLE") return null;
    await this._checkpointDocxPagination(clock, signal);
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

    const sourceCost = this._officeDomCost(sourceTable);
    let movedRowNodes = 0;
    let movedRowTextUnits = 0;
    const lastRowIndexByGroup = new Map<HTMLElement | null, number>();
    for (let rowIndex = 0;rowIndex < rowDescriptors.length;rowIndex += 1) {
      if (rowIndex > 0 && rowIndex % 64 === 0) {
        await this._checkpointDocxPagination(clock, signal, true);
      }
      const descriptor = rowDescriptors[rowIndex];
      if (!descriptor) continue;
      lastRowIndexByGroup.set(descriptor.sourceGroup, rowIndex);
      const rowCost = this._officeDomCost(descriptor.row);
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
    for (let rowIndex = 0;rowIndex < rowDescriptors.length;rowIndex += 1) {
      if (rowIndex > 0 && rowIndex % 16 === 0) {
        await this._checkpointDocxPagination(clock, signal, true);
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
      this._stripDocxCloneIds(table);
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
      const cost = this._officeDomCost(table);
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
      for (let rowIndex = rowDescriptors.length - 1;rowIndex >= 0;rowIndex -= 1) {
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
      for (let rowIndex = 0;rowIndex < rowDescriptors.length;rowIndex += 1) {
        if (rowIndex > 0 && rowIndex % 16 === 0) {
          await this._checkpointDocxPagination(clock, signal, true);
        }
        const descriptor = rowDescriptors[rowIndex];
        if (!descriptor) continue;
        appendRow(first, descriptor);
        const overflows = this._docxPageOverflows(page);
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
          this._stripDocxCloneIds(clone);
          const cost = this._officeDomCost(clone);
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
        if (!this._docxPageOverflows(page)) {
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
        for (let rowIndex = splitCount;rowIndex < rowDescriptors.length;rowIndex += 1) {
          if ((rowIndex - splitCount) > 0 && (rowIndex - splitCount) % 64 === 0) {
            await this._checkpointDocxPagination(clock, signal, true);
          }
          const descriptor = rowDescriptors[rowIndex];
          if (descriptor) appendRow(rest, descriptor);
        }
      }

      const oversized = this._docxPageOverflows(page);
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
  },

  _officeAbortError(this: PreviewHost): Error {
    const error = new Error("Office preview cancelled");
    error.name = "AbortError";
    return error;
  },

  _throwIfOfficeAborted(this: PreviewHost, signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw this._officeAbortError();
  },

  _parseXlsxXml(this: PreviewHost, bytes: Uint8Array, label: string): Document {
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
  },

  async _readXlsxXmlEntry(this: PreviewHost,
    entry: JSZip.JSZipObject,
    maximumBytes: number,
    signal: AbortSignal,
    label: string,
  ): Promise<Document> {
    this._throwIfOfficeAborted(signal);
    const declaredBytes = declaredZipEntryBytes(entry);
    if (declaredBytes === null || declaredBytes > maximumBytes) {
      throw new Error(`${label} exceeds preview limits`);
    }
    const bytes = await entry.async("uint8array");
    this._throwIfOfficeAborted(signal);
    if (bytes.byteLength > maximumBytes || bytes.byteLength !== declaredBytes) {
      throw new Error(`${label} exceeds preview limits`);
    }
    return this._parseXlsxXml(bytes, label);
  },

  _xlsxArchiveEntries(this: PreviewHost, archive: JSZip): ReadonlyMap<string, JSZip.JSZipObject> {
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
  },

  async _xlsxWorksheetMetadata(this: PreviewHost,
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<{ readonly worksheets: readonly XlsxWorksheetMeta[]; readonly total: number }> {
    const workbookEntry = entries.get("xl/workbook.xml");
    const relationshipsEntry = entries.get("xl/_rels/workbook.xml.rels");
    if (!workbookEntry || !relationshipsEntry) throw new Error("Workbook structure is incomplete");
    const [workbook, relationships] = await Promise.all([
      this._readXlsxXmlEntry(workbookEntry, MAX_XLSX_WORKBOOK_XML_BYTES, signal, "workbook"),
      this._readXlsxXmlEntry(relationshipsEntry, MAX_XLSX_RELATIONSHIP_XML_BYTES, signal, "workbook relationships"),
    ]);
    this._throwIfOfficeAborted(signal);
    if (workbook.documentElement.localName.toLowerCase() !== "workbook") {
      throw new Error("Invalid workbook root");
    }

    const worksheetRelationships = new Map<string, string>();
    const seenRelationshipIds = new Set<string>();
    const relationshipNodes = relationships.getElementsByTagNameNS("*", "Relationship");
    if (relationshipNodes.length > MAX_XLSX_ZIP_ENTRIES) {
      throw new Error("Workbook contains too many relationships");
    }
    for (let relationshipIndex = 0;relationshipIndex < relationshipNodes.length;relationshipIndex += 1) {
      const relationship = relationshipNodes[relationshipIndex];
      if (!relationship) continue;
      if (relationshipIndex > 0 && relationshipIndex % 256 === 0) {
        await this._yieldOfficeRender();
        this._throwIfOfficeAborted(signal);
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
    for (let index = 0;index < maximum;index += 1) {
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
  },

  async _xlsxSharedStrings(this: PreviewHost,
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<XlsxSharedStrings> {
    const entry = entries.get("xl/sharedStrings.xml");
    if (!entry) return { values: [], truncated: false };
    const document = await this._readXlsxXmlEntry(
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
    for (let index = 0;index < maximum;index += 1) {
      this._throwIfOfficeAborted(signal);
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
      if ((index + 1) % 5_000 === 0) await this._yieldOfficeRender();
    }
    return { values, truncated };
  },

  async _xlsxStyles(this: PreviewHost,
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<XlsxStyleTable> {
    const entry = entries.get("xl/styles.xml");
    if (!entry) return { cellStyles: [], truncated: false };
    const document = await this._readXlsxXmlEntry(entry, MAX_XLSX_STYLES_XML_BYTES, signal, "styles");
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
  },

  async _parseXlsxWorksheet(this: PreviewHost,
    entry: JSZip.JSZipObject,
    sharedStrings: XlsxSharedStrings,
    styles: XlsxStyleTable,
    signal: AbortSignal,
  ): Promise<ParsedXlsxWorksheet> {
    const document = await this._readXlsxXmlEntry(
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
    for (let index = 0;index < columnDefinitionLimit;index += 1) {
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
      for (let column = minimum;column <= Math.min(maximum, MAX_EXCEL_COLUMNS);column += 1) {
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
    for (let index = 0;index < cellLimit;index += 1) {
      this._throwIfOfficeAborted(signal);
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
      if ((index + 1) % 5_000 === 0) await this._yieldOfficeRender();
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
    for (let index = 0;index < mergedLimit;index += 1) {
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
        this._throwIfOfficeAborted(signal);
        const finalRow = Math.min(range.endRow, renderedRows);
        const finalColumn = Math.min(range.endColumn, renderedColumns);
        for (let row = range.startRow;row <= finalRow;row += 1) {
          for (let column = range.startColumn;column <= finalColumn;column += 1) {
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
            await this._yieldOfficeRender();
            this._throwIfOfficeAborted(signal);
          }
        }
      }
    }
    return { cells, rowCount, columnCount, columnWidths, mergedFollowers, truncated };
  },

  async _renderXlsxOffice(this: PreviewHost,
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const signal = job.abortController.signal;
    this._throwIfOfficeAborted(signal);
    const archive = await JSZip.loadAsync(view.bytes.slice(), { checkCRC32: false, createFolders: false });
    this._throwIfOfficeAborted(signal);
    const entries = this._xlsxArchiveEntries(archive);
    const [{ worksheets, total }, sharedStrings, styles] = await Promise.all([
      this._xlsxWorksheetMetadata(entries, signal),
      this._xlsxSharedStrings(entries, signal),
      this._xlsxStyles(entries, signal),
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
      for (let index = 0;index < buttons.length;index += 1) {
        const selected = index === sheetIndex;
        buttons[index]?.setAttribute("aria-selected", String(selected));
        if (buttons[index]) buttons[index]!.tabIndex = selected ? 0 : -1;
      }
      sheetViewport.setAttribute("aria-busy", "true");
      container.setAttribute("aria-busy", "true");
      const loadingSheet = this._textSpan(`Loading ${sheet.name}\u2026`, "office-preview-loading");
      loadingSheet.setAttribute("role", "status");
      sheetViewport.replaceChildren(loadingSheet);

      const entry = entries.get(sheet.path);
      if (!entry) throw new Error("Worksheet is missing");
      const parsed = await this._parseXlsxWorksheet(entry, sharedStrings, styles, signal);
      if (!isCurrent() || generation !== sheetGeneration) return;
      const sourceRows = parsed.rowCount;
      const sourceColumns = parsed.columnCount;
      if (sourceRows < 1 || sourceColumns < 1) {
        sheetViewport.replaceChildren(this._textSpan("This worksheet is empty.", "office-preview-loading"));
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
      for (let columnIndex = 1;columnIndex <= columnCount;columnIndex += 1) {
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
      for (let columnIndex = 1;columnIndex <= columnCount;columnIndex += 1) {
        const heading = this.ownerDocument.createElement("th");
        heading.scope = "col";
        heading.textContent = excelColumnLabel(columnIndex);
        headingRow.append(heading);
      }
      head.append(headingRow);
      const body = this.ownerDocument.createElement("tbody");
      for (let rowIndex = 1;rowIndex <= rowCount;rowIndex += 1) {
        if (!isCurrent() || generation !== sheetGeneration || signal.aborted) return;
        const row = this.ownerDocument.createElement("tr");
        const rowHeading = this.ownerDocument.createElement("th");
        rowHeading.scope = "row";
        rowHeading.textContent = String(rowIndex);
        row.append(rowHeading);
        const sourceRow = parsed.cells.get(rowIndex);
        for (let columnIndex = 1;columnIndex <= columnCount;columnIndex += 1) {
          const dataCell = this.ownerDocument.createElement("td");
          const sourceCell = sourceRow?.get(columnIndex) ?? null;
          dataCell.textContent = parsed.mergedFollowers.has(xlsxMergedCellKey(rowIndex, columnIndex))
            ? ""
            : sourceCell?.text ?? "";
          applyXlsxCellStyle(dataCell, sourceCell?.style ?? null);
          row.append(dataCell);
        }
        body.append(row);
        if (rowIndex % 100 === 0) await this._yieldOfficeRender();
      }

      if (!isCurrent() || generation !== sheetGeneration) return;
      table.append(caption, columnGroup, head, body);
      const fragment = this.ownerDocument.createDocumentFragment();
      fragment.append(table);
      if (sourceRows > rowCount || sourceColumns > columnCount || parsed.truncated) {
        fragment.append(this._textSpan("Preview limited for performance.", "office-preview-notice"));
      }
      sheetViewport.replaceChildren(fragment);
      sheetViewport.setAttribute("aria-busy", "false");
      container.setAttribute("aria-busy", "false");
    };

    const showSheetError = (): void => {
      if (!isCurrent()) return;
      sheetViewport.replaceChildren(this._textSpan("This worksheet could not be opened.", "office-preview-loading"));
      sheetViewport.setAttribute("aria-busy", "false");
      container.setAttribute("aria-busy", "false");
    };
    for (let index = 0;index < worksheets.length;index += 1) {
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
      sheetTabs.append(this._textSpan(`+${total - worksheets.length}`, "office-sheet-overflow"));
    }
    await renderSheet(worksheets[0]!, 0);
  },

  async _renderNativePptOffice(this: PreviewHost,
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
    const status = this._textSpan("Loading presentation", "office-page-status");
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
        this._sanitizeOfficeTree(slideViewport);
        if (this._boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
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
      slideViewport.replaceChildren(this._statePanel("Office preview failed", "This presentation slide could not be rendered.", "error", view));
    };
    previous.addEventListener("click", () => {
      if (!busy && slideIndex > 0) void renderSlide(slideIndex - 1).catch(showSlideError);
    });
    next.addEventListener("click", () => {
      if (!busy && slideIndex < count - 1) void renderSlide(slideIndex + 1).catch(showSlideError);
    });
    updateControls();
    await renderSlide(0);
  },

  async _renderLegacyPptOffice(this: PreviewHost,
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const parsed = this._sanitizeLegacyPptPresentation(await this._parseLegacyPpt(view.bytes, job));
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
    const status = this._textSpan("Loading presentation", "office-page-status");
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
    this._observeOfficeResources(slideViewport, job);

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
          this._sanitizeOfficeTree(element);
        },
      }));
      if (job.abortController.signal.aborted) abort();
    });
    if (!isCurrent()) return;
    const readyController = controllerHolder.current;
    if (!readyController) throw new Error("Presentation viewer did not initialize");
    busy = false;
    this._sanitizeOfficeTree(slideViewport);
    if (this._boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
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
      slideViewport.replaceChildren(this._statePanel("Office preview failed", "This presentation slide could not be rendered.", "error", view));
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
        this._sanitizeOfficeTree(slideViewport);
        if (this._boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
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
  },

  async _parseLegacyPpt(this: PreviewHost, bytes: Uint8Array, job: OfficePreviewJob): Promise<ParsedPresentation> {
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

    const workerUrl = urlApi.createObjectURL(new BlobType([officePackageResource("parser.worker.js", "worker").buffer], { type: "text/javascript" }));
    let worker: Worker;
    try {
      worker = new WorkerType(workerUrl, { type: "module", name: "code-codex-ppt-parser" });
    } catch (error) {
      urlApi.revokeObjectURL(workerUrl);
      throw error;
    }
    job.legacyPptWorker = worker;

    let wasmBytes: Uint8Array<ArrayBuffer>;
    try {
      wasmBytes = officePackageResource("parser.wasm", "wasm");
    } catch (error) {
      worker.terminate();
      job.legacyPptWorker = null;
      urlApi.revokeObjectURL(workerUrl);
      throw error;
    }
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
  },

  _sanitizeLegacyPptPresentation(this: PreviewHost, parsed: ParsedPresentation): ParsedPresentation {
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
  },

  async _renderPptxOffice(this: PreviewHost,
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    await this._assertPptxHasNoExternalRelationships(view.bytes, job.abortController.signal);
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
    const status = this._textSpan("Loading presentation", "office-page-status");
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
    this._observeOfficeResources(slideViewport, job);

    await this._yieldOfficeRender();
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
        this._sanitizeOfficeTree(slideViewport);
        if (this._boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
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
      slideViewport.replaceChildren(this._statePanel("Office preview failed", "This presentation slide could not be rendered.", "error", view));
    };
    previous.addEventListener("click", () => {
      if (!busy && slideIndex > 0) void renderSlide(slideIndex - 1).catch(showSlideError);
    });
    next.addEventListener("click", () => {
      if (!busy && slideIndex < slideCount - 1) void renderSlide(slideIndex + 1).catch(showSlideError);
    });
    this._sanitizeOfficeTree(slideViewport);
    if (this._boundOfficeDom(slideViewport)) throw new Error("Slide exceeds preview limits");
    updateControls();
  },

  async _assertPptxHasNoExternalRelationships(this: PreviewHost, bytes: Uint8Array, signal: AbortSignal): Promise<void> {
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
        for (let pass = 0;pass < 2;pass += 1) {
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
  },

  _cancelOfficePreview(this: PreviewHost): void {
    this._officeGeneration += 1;
    const job = this._officeJob;
    this._officeJob = null;
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
  },

  _observeOfficeResources(this: PreviewHost, root: HTMLElement, job: OfficePreviewJob): void {
    job.resourceObserver?.disconnect();
    const Observer = this.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer((records) => {
      if (this._officeJob !== job || job.abortController.signal.aborted) return;
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target instanceof Element) this._sanitizeOfficeElement(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) this._sanitizeOfficeTree(node);
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
  },

  _takeSanitizedDocxStyles(this: PreviewHost, host: HTMLElement, className: string): HTMLStyleElement[] {
    const result: HTMLStyleElement[] = [];
    for (const generatedStyle of host.querySelectorAll("style")) {
      const cssText = this._sanitizeDocxCss(generatedStyle.textContent ?? "", className);
      if (!cssText) continue;
      const style = this.ownerDocument.createElement("style");
      style.dataset.officePreview = "docx";
      style.textContent = cssText;
      result.push(style);
    }
    host.replaceChildren();
    return result;
  },

  _sanitizeDocxCss(this: PreviewHost, cssText: string, className: string): string {
    const inertDocument = this.ownerDocument.implementation.createHTMLDocument("");
    const style = inertDocument.createElement("style");
    style.textContent = this._sanitizeOfficeCssUrls(cssText.replace(/@import\s+[^;{}]+;?/gi, ""));
    inertDocument.head.append(style);

    try {
      const sheet = style.sheet;
      if (!sheet) return "";
      const rules: string[] = [];
      for (const rule of [...sheet.cssRules]) {
        if (rule.type !== 1) continue;
        const styleRule = rule as CSSStyleRule;
        if (!this._isScopedDocxSelector(styleRule.selectorText, className)) continue;
        this._sanitizeOfficeStyleDeclaration(styleRule.style);
        if (styleRule.style.length > 0) rules.push(styleRule.cssText);
      }
      return rules.join("\n");
    } catch {
      return "";
    }
  },

  _isScopedDocxSelector(this: PreviewHost, selectorList: string, className: string): boolean {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scope = new RegExp(`^(?:[a-z][a-z0-9-]*)?\\.${escapedClassName}(?:[-_][a-z0-9_-]+)?(?:[:.#\\[]|$)`, "i");
    return selectorList.split(",").every((entry) => {
      const selector = entry.trim();
      if (!selector || /[+~]/.test(selector)) return false;
      const firstCompound = selector.match(/^[^\s>+~]+/)?.[0] ?? "";
      return scope.test(firstCompound);
    });
  },

  _sanitizeOfficeStyleDeclaration(this: PreviewHost, style: CSSStyleDeclaration): void {
    for (let index = style.length - 1;index >= 0;index -= 1) {
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
        urls.some((url) => !this._isLocalOfficeResource(url));
      if (unsafeProperty || unsafeValue) style.removeProperty(property);
    }
  },

  _sanitizeOfficeCssUrls(this: PreviewHost, value: string): string {
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote: string, url: string) =>
      this._isLocalOfficeResource(url) ? match : "url(\"\")");
  },

  _sanitizeDetachedDocx(this: PreviewHost, root: HTMLElement): void {
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
        if (tagName === "a" || !this._isLocalOfficeResource(attribute.value)) element.removeAttribute(attribute.name);
      }
      this._sanitizeOfficeElement(element);
    }
  },

  _sanitizeOfficeTree(this: PreviewHost, root: Element): void {
    this._sanitizeOfficeElement(root);
    for (const element of root.querySelectorAll("*")) this._sanitizeOfficeElement(element);
  },

  _sanitizeOfficeElement(this: PreviewHost, element: Element): void {
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
        !this._isLocalOfficeResource(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (tagName === "a") {
      for (const attribute of ["download", "href", "ping", "rel", "target"]) element.removeAttribute(attribute);
    }
    element.removeAttribute("srcdoc");
    if (element instanceof HTMLElement || element instanceof SVGElement) {
      this._sanitizeOfficeStyleDeclaration(element.style);
    }
    if (tagName === "style" && element.textContent) {
      element.textContent = element.textContent
        .replace(/@import\s+[^;]+;?/gi, "");
      element.textContent = this._sanitizeOfficeCssUrls(element.textContent);
    }
  },

  _isLocalOfficeResource(this: PreviewHost, value: string): boolean {
    const normalized = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
    return normalized === "" ||
      normalized.startsWith("#") ||
      normalized.startsWith("blob:") ||
      /^data:image\/(?:bmp|gif|jpeg|png|webp);base64,/.test(normalized);
  },

  _officeDomCost(this: PreviewHost, root: Node, includeRoot = true): { nodes: number; textUnits: number } {
    const pending: Node[] = includeRoot ? [root] : Array.from(root.childNodes);
    let nodes = 0;
    let textUnits = 0;
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) continue;
      nodes += 1;
      if (node.nodeType === Node.TEXT_NODE) textUnits += (node.nodeValue ?? "").length;
      for (let child = node.lastChild;child;child = child.previousSibling) pending.push(child);
    }
    return { nodes, textUnits };
  },

  _reserveOfficeDomClones(this: PreviewHost, domBudget: OfficeDomBudget, roots: readonly Node[]): boolean {
    let nodes = 0;
    let textUnits = 0;
    for (const root of roots) {
      const cost = this._officeDomCost(root);
      nodes += cost.nodes;
      textUnits += cost.textUnits;
    }
    if (nodes > domBudget.remainingNodes || textUnits > domBudget.remainingTextUnits) return false;
    domBudget.remainingNodes -= nodes;
    domBudget.remainingTextUnits -= textUnits;
    return true;
  },

  _boundOfficeDom(this: PreviewHost, root: HTMLElement): boolean {
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
  },

  async _yieldOfficeRender(this: PreviewHost): Promise<void> {
    await new Promise<void>((resolve) => {
      const window = this.ownerDocument.defaultView;
      if (window) window.setTimeout(resolve, 0);
      else setTimeout(resolve, 0);
    });
  }
};


/** Raw runtime bytes enter only after native length/hash verification. The clone
 * gives each transfer/Blob independent ownership; the registry remains reusable. */
function officePackageResource(name: string, kind: string): Uint8Array<ArrayBuffer> {
  const host = window as unknown as Record<symbol, unknown>;
  const registry = host[Symbol.for('code-codex:plugin-resources:v1')] as Map<string, { version: string; resources: Map<string, { kind: string; bytes: Uint8Array }> }> | undefined;
  const entry = registry?.get('office-preview');
  const path = `resources/CodeCodex-plugin-office-preview-1.0.0-${name}`;
  const resource = entry?.resources.get(path);
  if (entry?.version !== '1.0.0' || resource?.kind !== kind || !(resource.bytes instanceof Uint8Array)) throw new Error('The downloaded Office preview parser resource is unavailable. Download the complete plugin package again.');
  return new Uint8Array(resource.bytes);
}
