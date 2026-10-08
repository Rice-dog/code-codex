import type JSZip from "jszip";
import type { ParsedPresentation } from "@extend-ai/react-pptx";
import type { Object3D, Box3 } from "three";
import type { ModelMemoryCacheScope } from "./file-preview/contracts";
import { SURFACE_OPACITY_PREVIEW_CSS } from "./surface-opacity";
import { getFileIcon, icons } from "./icons";
import { activePageElements, MAIN_SURFACE_SELECTOR } from "./adapters/codex-26.715";
import { usesClippedMainLayout } from "./adapters/codex-layout-version";
import { getBootstrapConfig } from "./bridge";
import { MAX_SYNTAX_SOURCE_UNITS, highlightSyntaxForPath, type SyntaxHighlight } from "./syntax-highlight";
import { pluginModule, ensurePluginPackage, isPluginPackageLoaded } from "./plugin-runtime";
import type { ModelPreviewSourceInspection, OfficeDocumentKind, DiagramSourceKind, MainPreviewUnavailableReason, MainPreviewGitDiffView, MainPreviewMediaView, MainPreviewModelView, MainPreviewFileView, MainPreviewState, MainPreviewEditorState, MainPreviewActivateDetail, MainPreviewCloseDetail, MainPreviewDraftDetail, MainPreviewPathDetail, SuppressedAttributes, PdfPreviewJob, NotebookPreviewJob, OfficePreviewJob, DiagramPreviewJob, ModelPreviewJob, FocusSnapshot, NotebookMimeBundle, NotebookModel, CsvModel, DrawioPageSource, DrawioCellGeometry, DrawioVertex, DrawioEdge, DiagramPoint, DiagramSvgBudget, PlantActivityStatement, PlantActivityTheme, PlantActivityModel, PlantLayoutNodeKind, PlantLayoutNode, PlantLayoutEdge, PlantBlockLayout, NotebookCellModel, NotebookOutputModel, NotebookParseBudget, NotebookRenderBudget, OfficeDomBudget, DocxPaginationClock, DocxBlockSplitResult, XlsxWorksheetMeta, ParsedXlsxWorksheet, XlsxSharedStrings, XlsxCellStyle, XlsxPreviewCell, XlsxStyleTable, XlsxRange, MainPreviewLineEnding, MainPreviewFileBase, MainPreviewLoadingView, MainPreviewTextView, MainPreviewEmptyView, MainPreviewModelResource, MainPreviewUnsupportedView, MainPreviewErrorView, MainPreviewActivateEvent, MainPreviewCloseEvent, MainPreviewDraftEvent, MainPreviewSaveEvent, MainPreviewReloadEvent } from './file-preview/contracts';
export type { ModelPreviewSourceInspection, OfficeDocumentKind, NotebookMimeBundle, NotebookModel, CsvModel, DiagramSourceKind, DrawioPageSource, DrawioCellGeometry, DrawioVertex, DrawioEdge, DiagramPoint, DiagramSvgBudget, PlantActivityStatement, PlantActivityTheme, PlantActivityModel, PlantLayoutNodeKind, PlantLayoutNode, PlantLayoutEdge, PlantBlockLayout, NotebookCellModel, NotebookOutputModel, NotebookParseBudget, NotebookRenderBudget, OfficeDomBudget, DocxPaginationClock, DocxBlockSplitResult, XlsxWorksheetMeta, ParsedXlsxWorksheet, XlsxSharedStrings, XlsxCellStyle, XlsxPreviewCell, XlsxStyleTable, XlsxRange, MainPreviewLineEnding, MainPreviewUnavailableReason, MainPreviewFileBase, MainPreviewLoadingView, MainPreviewTextView, MainPreviewGitDiffView, MainPreviewEmptyView, MainPreviewMediaView, MainPreviewModelResource, MainPreviewModelView, MainPreviewUnsupportedView, MainPreviewErrorView, MainPreviewFileView, MainPreviewState, MainPreviewEditorState, MainPreviewActivateDetail, MainPreviewCloseDetail, MainPreviewDraftDetail, MainPreviewPathDetail, MainPreviewActivateEvent, MainPreviewCloseEvent, MainPreviewDraftEvent, MainPreviewSaveEvent, MainPreviewReloadEvent, SuppressedAttributes, PdfPreviewJob, NotebookPreviewJob, OfficePreviewJob, DiagramPreviewJob, ModelPreviewJob, FocusSnapshot } from './file-preview/contracts';



declare const __CODE_CODEX_VERSION__: string;

export const MAIN_PREVIEW_TAG = `code-codex-main-preview-v${__CODE_CODEX_VERSION__.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

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

export const MODEL_PREVIEWER_ID = "code-codex.model-preview";

export const NOTEBOOK_PREVIEW_MIME = "application/x-ipynb+json";

export const NATIVE_POWERPOINT_PREVIEW_MIME = "application/vnd.code-codex.powerpoint-slides+zip";

export const POWERPOINT_FULL_FIDELITY_NOTICE = "powerpoint-required-for-full-fidelity" as const;

export const GLTF_JSON_PREVIEW_MIME = "model/gltf+json";

export const GLTF_BINARY_PREVIEW_MIME = "model/gltf-binary";

const GLB_MAGIC = 0x46546c67;

const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

const MAX_MODEL_RESOURCE_URI_UNITS = 2_048;

export const MAX_GLTF_JSON_PREVIEW_BYTES = 16 * 1024 * 1024;

export const MAX_MODEL_PREVIEW_BYTES = 128 * 1024 * 1024;

export const MAX_MODEL_RESOURCE_BYTES = 128 * 1024 * 1024;

export const MAX_MODEL_TEXTURE_BYTES = 32 * 1024 * 1024;

export const MAX_MODEL_AGGREGATE_BYTES = 256 * 1024 * 1024;

export const MAX_MODEL_RESOURCE_COUNT = 256;

const SAFE_MODEL_RESOURCE_MIME_TYPES = new Set([
  "application/gltf-buffer",
  "application/octet-stream",
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const GLTFLOADER_SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  "EXT_materials_bump",
  "EXT_mesh_gpu_instancing",
  "EXT_texture_avif",
  "EXT_texture_webp",
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
  "KHR_mesh_quantization",
  "KHR_texture_transform",
]);

export class ModelPreviewSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelPreviewSourceError";
  }
}

function modelJsonSource(bytes: Uint8Array, mimeType: string): string {
  if (mimeType === GLTF_JSON_PREVIEW_MIME) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ModelPreviewSourceError("This glTF file is not valid UTF-8 JSON.");
    }
  }
  if (mimeType !== GLTF_BINARY_PREVIEW_MIME) {
    throw new ModelPreviewSourceError("This file does not contain a supported glTF 2.0 payload.");
  }
  if (bytes.byteLength < 20) throw new ModelPreviewSourceError("This GLB file is incomplete.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new ModelPreviewSourceError("This file is not a valid GLB model.");
  if (view.getUint32(4, true) !== 2) throw new ModelPreviewSourceError("Only glTF 2.0 models can be previewed.");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new ModelPreviewSourceError("The GLB file length is invalid.");
  const jsonLength = view.getUint32(12, true);
  const jsonEnd = 20 + jsonLength;
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK_TYPE || jsonLength === 0 || jsonEnd > bytes.byteLength) {
    throw new ModelPreviewSourceError("The GLB file does not contain a valid JSON scene chunk.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, jsonEnd)).replace(/[\u0000\u0020]+$/g, "");
  } catch {
    throw new ModelPreviewSourceError("The GLB scene metadata is not valid UTF-8 JSON.");
  }
}

function modelDocument(bytes: Uint8Array, mimeType: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelJsonSource(bytes, mimeType)) as unknown;
  } catch (error) {
    if (error instanceof ModelPreviewSourceError) throw error;
    throw new ModelPreviewSourceError("This glTF file does not contain valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ModelPreviewSourceError("This glTF file does not contain a valid scene document.");
  }
  const document = parsed as Record<string, unknown>;
  const asset = document.asset;
  if (!asset || typeof asset !== "object" || Array.isArray(asset) || (asset as Record<string, unknown>).version !== "2.0") {
    throw new ModelPreviewSourceError("Only glTF 2.0 models can be previewed.");
  }
  return document;
}

function modelExtensionNames(document: Record<string, unknown>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const key of ["extensionsUsed", "extensionsRequired"] as const) {
    const extensions = document[key];
    if (!Array.isArray(extensions)) continue;
    for (const extension of extensions) if (typeof extension === "string") names.add(extension);
  }
  const collect = (entries: unknown, nestedKey?: string): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const nested = nestedKey ? (entry as Record<string, unknown>)[nestedKey] : entry;
      if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
      const extensions = (nested as Record<string, unknown>).extensions;
      if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) continue;
      for (const extension of Object.keys(extensions)) names.add(extension);
    }
  };
  collect(document.bufferViews);
  collect(document.textures);
  if (Array.isArray(document.meshes)) {
    for (const mesh of document.meshes) {
      if (mesh && typeof mesh === "object" && !Array.isArray(mesh)) collect((mesh as Record<string, unknown>).primitives);
    }
  }
  return names;
}

function requiredModelExtensionNames(document: Record<string, unknown>): readonly string[] {
  const extensions = document.extensionsRequired;
  if (extensions === undefined) return [];
  if (!Array.isArray(extensions) || extensions.some((extension) => typeof extension !== "string" || extension.length === 0)) {
    throw new ModelPreviewSourceError("This glTF file contains invalid required-extension metadata.");
  }
  const required = [...new Set(extensions as string[])];
  const used = document.extensionsUsed;
  if (!Array.isArray(used) || required.some((extension) => !used.includes(extension))) {
    throw new ModelPreviewSourceError("This glTF file contains inconsistent required-extension metadata.");
  }
  return required;
}

function decodedModelUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ModelPreviewSourceError("This model contains a malformed resource URI.");
  }
}

function isModelDataUri(value: string): boolean {
  return value.trimStart().toLowerCase().startsWith("data:");
}

function validateModelDataUri(value: string): void {
  const match = /^data:([^;,]+);base64,/i.exec(value.trimStart());
  const mimeType = match?.[1]?.toLowerCase();
  if (mimeType === "image/ktx2") {
    throw new ModelPreviewSourceError("KTX2/Basis textures are not supported yet. Export this model with PNG, JPEG, WebP, or AVIF textures.");
  }
  if (!mimeType || !SAFE_MODEL_RESOURCE_MIME_TYPES.has(mimeType)) {
    throw new ModelPreviewSourceError("This model contains an unsupported embedded resource type.");
  }
}

function validateModelBufferViewImages(document: Record<string, unknown>): number {
  const images = Array.isArray(document.images) ? document.images : [];
  const bufferViews = Array.isArray(document.bufferViews) ? document.bufferViews : [];
  let count = 0;
  for (const image of images) {
    if (!image || typeof image !== "object" || Array.isArray(image)) continue;
    const imageRecord = image as Record<string, unknown>;
    if (imageRecord.bufferView === undefined) continue;
    count += 1;
    const bufferViewIndex = imageRecord.bufferView;
    const mimeType = typeof imageRecord.mimeType === "string" ? imageRecord.mimeType.toLowerCase() : "";
    const bufferView = Number.isInteger(bufferViewIndex) && Number(bufferViewIndex) >= 0
      ? bufferViews[Number(bufferViewIndex)]
      : undefined;
    const byteLength = bufferView && typeof bufferView === "object" && !Array.isArray(bufferView)
      ? (bufferView as Record<string, unknown>).byteLength
      : undefined;
    if (
      !mimeType.startsWith("image/") ||
      !SAFE_MODEL_RESOURCE_MIME_TYPES.has(mimeType) ||
      !Number.isSafeInteger(byteLength) ||
      Number(byteLength) <= 0 ||
      Number(byteLength) > MAX_MODEL_TEXTURE_BYTES
    ) {
      throw new ModelPreviewSourceError("An embedded model texture uses an unsupported type or exceeds the preview limit.");
    }
  }
  return count;
}

function validateExternalModelResourceUri(value: string): void {
  const decoded = decodedModelUri(value);
  const rawSegments = value.split("/");
  if (
    !decoded ||
    value.length > MAX_MODEL_RESOURCE_URI_UNITS ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /[\u0000-\u001f\u007f]/.test(decoded) ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes(":") ||
    decoded.includes("\\") ||
    decoded.includes("?") ||
    decoded.includes(":") ||
    /%(?:2f|5c)/i.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
    value.startsWith("/") ||
    decoded.startsWith("/") ||
    rawSegments.some((segment) => segment.length === 0)
  ) {
    throw new ModelPreviewSourceError("External or invalid model resource URLs are blocked. Use files stored with the model in this workspace.");
  }
}

export function inspectModelPreviewSource(bytes: Uint8Array, mimeType: string): ModelPreviewSourceInspection {
  const document = modelDocument(bytes, mimeType);
  const extensions = modelExtensionNames(document);
  if (extensions.has("KHR_draco_mesh_compression")) {
    throw new ModelPreviewSourceError("Draco-compressed models are not supported yet. Export this model without Draco compression.");
  }
  if (extensions.has("EXT_meshopt_compression") || extensions.has("KHR_meshopt_compression")) {
    throw new ModelPreviewSourceError("Meshopt-compressed models are not supported yet. Export this model without Meshopt compression.");
  }
  if (extensions.has("KHR_texture_basisu")) {
    throw new ModelPreviewSourceError("KTX2/Basis textures are not supported yet. Export this model with PNG, JPEG, WebP, or AVIF textures.");
  }
  if (
    Array.isArray(document.images) &&
    document.images.some((image) =>
      Boolean(image && typeof image === "object" && !Array.isArray(image) &&
        (image as Record<string, unknown>).mimeType === "image/ktx2"))
  ) {
    throw new ModelPreviewSourceError("KTX2/Basis textures are not supported yet. Export this model with PNG, JPEG, WebP, or AVIF textures.");
  }
  const unsupportedRequiredExtension = requiredModelExtensionNames(document)
    .find((extension) => !GLTFLOADER_SUPPORTED_REQUIRED_EXTENSIONS.has(extension));
  if (unsupportedRequiredExtension) {
    const label = unsupportedRequiredExtension.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "unknown";
    throw new ModelPreviewSourceError(
      `This model requires the unsupported glTF extension "${label}". Export it without that required extension.`,
    );
  }

  const buffers = Array.isArray(document.buffers) ? document.buffers : [];
  const images = Array.isArray(document.images) ? document.images : [];
  if (buffers.length + images.length > MAX_MODEL_RESOURCE_COUNT) {
    throw new ModelPreviewSourceError(`This model references more than ${MAX_MODEL_RESOURCE_COUNT.toLocaleString()} model resources.`);
  }
  const bufferViewImageCount = validateModelBufferViewImages(document);
  const resourceUris: string[] = [];
  const embeddedBufferUris: string[] = [];
  const embeddedImageUris: string[] = [];
  const seen = new Set<string>();
  const seenEmbeddedBuffers = new Set<string>();
  const seenEmbeddedImages = new Set<string>();
  for (const key of ["buffers", "images"] as const) {
    const entries = document[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const uri = (entry as Record<string, unknown>).uri;
      if (typeof uri !== "string") continue;
      if (isModelDataUri(uri)) {
        validateModelDataUri(uri);
        if (key === "buffers" && !seenEmbeddedBuffers.has(uri)) {
          seenEmbeddedBuffers.add(uri);
          embeddedBufferUris.push(uri);
        } else if (key === "images" && !seenEmbeddedImages.has(uri)) {
          seenEmbeddedImages.add(uri);
          embeddedImageUris.push(uri);
        }
        continue;
      }
      if (decodedModelUri(uri).toLowerCase().endsWith(".ktx2")) {
        throw new ModelPreviewSourceError("KTX2/Basis textures are not supported yet. Export this model with PNG, JPEG, WebP, or AVIF textures.");
      }
      validateExternalModelResourceUri(uri);
      if (!seen.has(uri)) {
        seen.add(uri);
        resourceUris.push(uri);
      }
    }
  }
  return { externalResourceUris: resourceUris, embeddedBufferUris, embeddedImageUris, bufferViewImageCount };
}

const OFFICE_MIME_TYPES: Readonly<Record<string, OfficeDocumentKind>> = Object.freeze({
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  [NATIVE_POWERPOINT_PREVIEW_MIME]: "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
});

const CONVERSATION_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.25 3.25h11.5v7.5H7l-3.5 2.5v-2.5H2.25z"/></svg>`;

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

const mainPreviewStyles = String.raw`
  :host([data-home-suspended]) { display: none !important; }
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
    .model-preview,
    .model-preview-toolbar,
    .model-preview-stage,
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

  /* The Codex main surface already supplies the background plugins' .58
   * conversation mask. Clear the preview's own opaque layers so opening a
   * file does not stack a second mask over the effect. Keep PDF pages, slides,
   * images, and editor controls themselves legible. */
  :host-context(html:is(
    [data-code-codex-particle-image-background],
    [data-code-codex-glow-horizon-background]
  )) :is(
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
    .model-preview,
    .model-preview-toolbar,
    .model-preview-stage,
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

  :host-context(html:is(
    [data-code-codex-particle-image-background],
    [data-code-codex-glow-horizon-background]
  )) .model-preview-stage {
    background-image: none !important;
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

  :host([data-clipped-layout="true"]) .surface {
    --cle-preview-header-height: 42px;
    grid-template-rows: var(--cle-preview-header-height) minmax(0, 1fr);
  }

  :host([data-clipped-layout="true"]) .tab-strip {
    height: var(--cle-preview-header-height);
    align-self: start;
    width: calc(100% - 124px);
    background: var(--cle-main-bg);
  }

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
  :host([data-clipped-layout="true"]) .tab-slot {
    flex: 0 0 144px;
    width: 144px;
  }
  :host([data-clipped-layout="true"]) .tab-slot.active,
  :host([data-clipped-layout="true"]) .preview-tab[aria-selected="true"] {
    background: var(--cle-main-bar);
  }
  :host([data-clipped-layout="true"]) .preview-tab {
    height: 41px;
    gap: 6px;
    padding-inline: 10px;
    font-size: 13px;
    line-height: var(--cle-native-title-line-height, 24px);
  }
  :host([data-clipped-layout="true"]) .tab-slot.conversation .preview-tab {
    padding-left: 17px;
  }
  :host([data-clipped-layout="true"]) .tab-icon {
    width: 14px;
    height: 14px;
  }
  :host([data-clipped-layout="true"]) .tab-close {
    width: 22px;
    height: 22px;
    margin: 0 3px 0 -2px;
    padding: 5px;
  }
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

  .git-diff-reader {
    min-width: max-content;
    margin: 0;
    padding: 10px 0 24px;
    color: var(--cle-main-muted);
    font: 12px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    tab-size: 4;
  }

  .git-diff-line {
    display: block;
    min-height: 18px;
    padding: 0 16px;
    white-space: pre;
  }

  .git-diff-line-add {
    color: var(--cle-syntax-inserted);
    background: color-mix(in srgb, var(--cle-syntax-inserted) 13%, transparent);
  }

  .git-diff-line-remove {
    color: var(--cle-syntax-deleted);
    background: color-mix(in srgb, var(--cle-syntax-deleted) 13%, transparent);
  }

  .git-diff-line-hunk {
    color: var(--cle-syntax-meta);
    background: color-mix(in srgb, var(--cle-syntax-meta) 8%, transparent);
  }

  .git-diff-line-header { color: var(--cle-main-faint); }

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

  .model-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }

  .model-preview-toolbar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    min-height: 42px;
    padding: 6px 12px 6px 14px;
    border-bottom: 1px solid var(--cle-main-line);
    background: color-mix(in srgb, var(--cle-main-bg) 94%, transparent);
  }

  .model-preview-summary {
    min-width: 0;
    overflow: hidden;
    color: var(--cle-main-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-preview-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
  }

  .model-preview-actions button {
    min-width: 54px;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .model-preview-actions button:hover:not(:disabled) { background: var(--cle-main-hover); }
  .model-preview-actions button:focus-visible,
  .model-preview-canvas:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: -3px; }
  .model-preview-actions button:disabled { cursor: default; opacity: .42; }
  .model-preview-actions button[hidden] { display: none; }

  .model-preview-stage {
    position: relative;
    min-width: 0;
    min-height: 220px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--cle-main-text) 4%, transparent), transparent 52%),
      var(--cle-main-bg);
    touch-action: none;
  }

  .model-preview-canvas {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    outline: none;
  }

  .model-preview-status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--cle-main-muted);
    font-size: 12px;
    text-align: center;
    pointer-events: none;
  }

  .model-preview-help {
    position: absolute;
    right: 12px;
    bottom: 10px;
    max-width: calc(100% - 24px);
    padding: 5px 8px;
    overflow: hidden;
    color: var(--cle-main-muted);
    background: color-mix(in srgb, var(--cle-main-bg) 86%, transparent);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .model-preview-toolbar { padding-inline: 8px; }
    .model-preview-actions { gap: 4px; }
    .model-preview-actions button { min-width: 48px; padding-inline: 7px; }
    .model-preview-help { display: none; }
  }



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

  .office-preview[data-has-notice="true"] {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .office-preview[data-has-notice="true"] .office-preview-stage {
    height: auto;
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
    .model-preview * { scroll-behavior: auto !important; }
  }

  @media (max-width: 640px) {
    .markdown-body { padding: 22px 18px 16px; }
    .markdown-truncated { padding-inline: 18px; }
  }
`;

let nextInstanceId = 0;

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

function previewerIdForMediaKind(kind: MainPreviewMediaView["kind"] | MainPreviewModelView["kind"]): string {
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

function officeDocumentKind(mimeType: string): OfficeDocumentKind | null {
  return OFFICE_MIME_TYPES[mimeType.trim().toLowerCase()] ?? null;
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

function formatBytes(value: number): string {
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

function sourceLineCount(source: string): number {
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

function firstVisibleLineOffset(source: string, scrollTop: number, lineHeight: number, paddingTop: number): number {
  const visibleLine = Math.max(0, Math.floor((scrollTop - paddingTop) / lineHeight));
  let offset = 0;
  for (let line = 0;line < visibleLine;line += 1) {
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
  for (let current = walker.nextNode();current;current = walker.nextNode()) {
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

function previewMethod(id: string, name: string): ((...args: any[]) => any) | undefined { try { if (!isPluginPackageLoaded(id)) return undefined; const method = pluginModule(id).exports[name]; return typeof method === "function" ? method as (...args: any[]) => any : undefined; } catch { return undefined; } }
export function previewPackageId(kind: string): string | undefined { return ["markdown", "csv", "diagram", "image", "video", "pdf", "audio", "office", "notebook", "model"].includes(kind) ? `${kind}-preview` : undefined; }

/** The shell owns tabs, safe source inspection, editor drafts, and generations.
 * Downloaded first-party viewers operate against this explicit internal context.
 * _ fields are a plugin ABI, not a file-access or permission boundary. */
export class CodeCodexMainPreviewElement extends HTMLElement {
  readonly _previewLoads = new Set<string>();
  readonly _previewLoadFailures = new Map<string, string>();
  readonly _onPluginLoaded = (event: Event): void => {
    const id = (event as CustomEvent<{ id?: string }>).detail?.id;
    if (!id?.endsWith('-preview')) return;
    this._previewLoadFailures.delete(id);
    if (this._connected && this._state.activePath !== null) this._render();
  };
  readonly _shadow: ShadowRoot;

  readonly _tabList: HTMLElement;

  readonly _panelMount: HTMLElement;

  readonly _instanceId = ++nextInstanceId;

  readonly _tabIds = new Map<string, string>();

  readonly _suppressedChildren = new Map<Element, SuppressedAttributes>();

  readonly _syntaxCache = new Map<string, { source: string; highlight: SyntaxHighlight }>();

  readonly _mediaObjectUrls = new Map<string, {
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly url: string;
    readonly revoke: () => void;
  }>();

  _pdfGeneration = 0;

  _pdfJob: PdfPreviewJob | null = null;

  _notebookGeneration = 0;

  _notebookJob: NotebookPreviewJob | null = null;

  _officeGeneration = 0;

  _officeJob: OfficePreviewJob | null = null;

  _diagramGeneration = 0;

  _diagramJob: DiagramPreviewJob | null = null;

  _modelGeneration = 0;

  _modelJob: ModelPreviewJob | null = null;

  _state: MainPreviewState = { activePath: null, tabs: [] };

  _rovingPath: string | null = null;

  _nextTabId = 0;

  _connected = false;

  _reparenting = false;

  _suspended = false;

  _suppressedParent: Element | null = null;

  _childObserver: MutationObserver | null = null;

  _nativeTitleObserver: MutationObserver | null = null;

  _nativeTitleObserverRoot: Element | null = null;

  _nativeViewportObserver: ResizeObserver | null = null;

  _observedNativeViewport: HTMLElement | null = null;

  _conversationTitle = "Conversation";

  readonly _clippedLayout: boolean;

  constructor() {
    super();
    const bootstrap = getBootstrapConfig();
    this._clippedLayout = usesClippedMainLayout(bootstrap.codexVersion ?? bootstrap.version);
    this._shadow = this.attachShadow({ mode: "open" });
    this._shadow.innerHTML = `
      <style>${mainPreviewStyles}${SURFACE_OPACITY_PREVIEW_CSS}</style>
      <div class="surface">
        <div class="tab-strip" role="tablist" aria-label="Conversation and file previews"></div>
        <div class="panel-mount"></div>
      </div>
    `;
    this._tabList = this._required<HTMLElement>(".tab-strip");
    this._panelMount = this._required<HTMLElement>(".panel-mount");
    this._tabList.addEventListener("click", (event) => this._onTabListClick(event));
    this._tabList.addEventListener("keydown", (event) => this._onTabListKeyDown(event));
    this._shadow.addEventListener("keydown", (event) => this._onShadowKeyDown(event as KeyboardEvent));
    this._render();
  }

  connectedCallback(): void {
    if (this._connected) return;
    this._connected = true;
    this.ownerDocument.defaultView?.addEventListener("code-codex:plugin-loaded", this._onPluginLoaded);
    if (this._clippedLayout) this.dataset.clippedLayout = "true";
    this._render();
    this._syncSuppression();
    queueMicrotask(() => {
      if (this._connected) this._scrollSelectedTabIntoView();
    });
  }

  disconnectedCallback(): void {
    if (this._reparenting) return;
    setTimeout(() => {
      if (!this.isConnected) this._disposeDisconnected();
    }, 0);
  }

  _disposeDisconnected(): void {
    this._connected = false;
    this.ownerDocument.defaultView?.removeEventListener("code-codex:plugin-loaded", this._onPluginLoaded);
    this._cancelPdfPreview();
    this._cancelNotebookPreview();
    this._cancelOfficePreview();
    this._cancelDiagramPreview();
    this._cancelModelPreview();
    this._syntaxCache.clear();
    this._revokeAllMediaObjectUrls();
    this._panelMount.replaceChildren();
    this._restoreSuppressedChildren();
    this._nativeTitleObserver?.disconnect();
    this._nativeTitleObserver = null;
    this._nativeTitleObserverRoot = null;
    this._nativeViewportObserver?.disconnect();
    this._nativeViewportObserver = null;
    this._observedNativeViewport = null;
  }

  setSuspended(suspended: boolean): void {
    this._suspended = suspended;
    this.toggleAttribute("data-home-suspended", suspended);
    this._syncSuppression();
  }

  reparent(parent: Element): void {
    if (this.parentElement === parent) return;
    this._restoreSuppressedChildren();
    this._reparenting = true;
    try {
      parent.append(this);
    } finally {
      this._reparenting = false;
    }
    this._syncSuppression();
  }

  get state(): MainPreviewState {
    const editor = this._state.editor;
    return {
      activePath: this._state.activePath,
      tabs: this._state.tabs.map((view) => cloneView(view)),
      enabledPreviewers: [...(this._state.enabledPreviewers ?? [])],
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
    const previousEditorPath = this._state.editor?.path ?? null;
    const nextEditorPath = nextState.editor?.path ?? null;
    const editorTransition = nextEditorPath !== previousEditorPath;
    const enteringEditor = nextEditorPath !== null && nextEditorPath !== previousEditorPath;
    const preserveActiveViewport = nextState.activePath !== null && nextState.activePath === this._state.activePath;
    const readerViewport = editorTransition || preserveActiveViewport
      ? (() => {
        const scroller = this._panelMount.querySelector<HTMLElement>(".code-editor") ??
          this._panelMount.querySelector<HTMLElement>(".preview-content");
        return {
          scrollTop: scroller?.scrollTop ?? 0,
          scrollLeft: scroller?.scrollLeft ?? 0,
        };
      })()
      : undefined;
    const retainedPaths = new Set(nextState.tabs.map((view) => view.path));
    for (const path of this._tabIds.keys()) {
      if (!retainedPaths.has(path)) this._tabIds.delete(path);
    }
    for (const path of this._syntaxCache.keys()) {
      const view = nextState.tabs.find((candidate) => candidate.path === path);
      const cached = this._syntaxCache.get(path);
      if (view?.kind !== "text" || cached?.source !== view.text) this._syntaxCache.delete(path);
    }
    this._reconcileMediaObjectUrls(nextState);
    const activeChanged = nextState.activePath !== this._state.activePath;
    const rovingStillExists = this._rovingPath === null || nextState.tabs.some((view) => view.path === this._rovingPath);
    this._state = nextState;
    if (activeChanged || !rovingStillExists) this._rovingPath = nextState.activePath;
    this._render();
    this._syncSuppression();
    if (readerViewport) {
      queueMicrotask(() => {
        if (this._connected && this._state.activePath === nextState.activePath) {
          const previewContent = this._panelMount.querySelector<HTMLElement>(".preview-content");
          const markdownEditor = this._panelMount.querySelector<HTMLElement>(".markdown-editor-surface");
          if (markdownEditor) {
            if (previewContent) {
              previewContent.scrollTop = readerViewport.scrollTop;
              previewContent.scrollLeft = readerViewport.scrollLeft;
            }
            return;
          }
          const editor = this._panelMount.querySelector<HTMLTextAreaElement>(".code-editor");
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
            this._syncEditorScroll(editor);
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

  _render(): void {
    const focus = this._captureFocus();
    this.toggleAttribute("data-file-active", this._state.activePath !== null);
    this.toggleAttribute("data-editing", Boolean(this._state.editor));
    this._renderTabs();
    this._renderPanel();
    this._restoreFocus(focus);
    this._scrollSelectedTabIntoView();
  }

  _renderTabs(): void {
    const fragment = this.ownerDocument.createDocumentFragment();
    const conversationSlot = this.ownerDocument.createElement("div");
    conversationSlot.className = `tab-slot conversation${this._state.activePath === null ? " active" : ""}`;

    const conversationTab = this.ownerDocument.createElement("button");
    conversationTab.type = "button";
    conversationTab.className = "preview-tab";
    conversationTab.id = `cle-main-preview-${this._instanceId}-conversation-tab`;
    conversationTab.setAttribute("role", "tab");
    conversationTab.setAttribute("aria-selected", String(this._state.activePath === null));
    conversationTab.tabIndex = this._rovingPath === null ? 0 : -1;
    conversationTab.dataset.tabKind = "conversation";
    conversationTab.title = this._conversationTitle;
    conversationTab.append(this._staticIcon(CONVERSATION_ICON, "tab-icon"), this._textSpan(this._conversationTitle, "tab-label"));
    conversationSlot.append(conversationTab);
    fragment.append(conversationSlot);

    for (const view of this._state.tabs) {
      const slot = this.ownerDocument.createElement("div");
      const active = view.path === this._state.activePath;
      slot.className = `tab-slot file${active ? " active" : ""}`;

      const tab = this.ownerDocument.createElement("button");
      tab.type = "button";
      tab.className = "preview-tab";
      tab.id = this._tabId(view.path);
      tab.title = view.path;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("aria-controls", this._panelId(view.path));
      tab.tabIndex = this._rovingPath === view.path ? 0 : -1;
      tab.dataset.tabKind = "file";
      tab.dataset.path = view.path;
      tab.append(this._staticIcon(getFileIcon(view.name).markup, "tab-icon"), this._textSpan(view.name, "tab-label"));

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

    this._tabList.replaceChildren(fragment);
  }

  _renderPanel(): void {
    this._cancelPdfPreview();
    this._cancelNotebookPreview();
    this._cancelOfficePreview();
    this._cancelDiagramPreview();
    this._cancelModelPreview();
    if (this._state.activePath === null) {
      this._panelMount.replaceChildren();
      return;
    }

    const view = this._state.tabs.find((candidate) => candidate.path === this._state.activePath);
    if (!view) {
      this._panelMount.replaceChildren();
      return;
    }

    const panel = this.ownerDocument.createElement("section");
    panel.className = "preview-panel";
    panel.id = this._panelId(view.path);
    panel.tabIndex = 0;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", this._tabId(view.path));
    if (view.kind === "loading") panel.setAttribute("aria-busy", "true");

    const metaBar = this.ownerDocument.createElement("header");
    metaBar.className = "preview-meta-bar";
    metaBar.append(this._staticIcon(getFileIcon(view.name).markup, "panel-icon"));
    const displayPath = view.kind === "git-diff" ? view.sourcePath : view.path;
    const location = this._textSpan(displayPath, "preview-location");
    location.title = displayPath;
    const editor = this._state.editor?.path === view.path ? this._state.editor : undefined;
    const markdownEditing = Boolean(
      editor &&
      (view.kind === "text" || view.kind === "empty") &&
      this._state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) === true &&
      isMarkdownPreviewPath(view.path),
    );
    const markdownPreview = view.kind === "text" &&
      this._state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) === true &&
      isMarkdownPreviewPath(view.path) &&
      !editor;
    const csvPreview = (view.kind === "text" || view.kind === "empty") &&
      this._state.enabledPreviewers?.includes(CSV_PREVIEWER_ID) === true &&
      isCsvPreviewPath(view.path) &&
      !editor;
    const diagramPreview = (view.kind === "text" || view.kind === "empty") &&
      this._state.enabledPreviewers?.includes(DIAGRAM_PREVIEWER_ID) === true &&
      isDiagramPreviewPath(view.path) &&
      !editor;
    const metadata = `${markdownEditing ? "Rendered Markdown edit · " : markdownPreview ? "Markdown preview · " : csvPreview ? "CSV preview · " : diagramPreview ? "Diagram preview · " : ""}${this._metadataFor(view)}`;
    metaBar.append(location, this._textSpan(metadata, "preview-metadata"));

    const content = this.ownerDocument.createElement("div");
    content.className = "preview-content";
    if (editor) content.classList.add("editor-mode");
    if (markdownEditing) content.classList.add("markdown-editor-mode");
    this._renderViewContent(content, view, editor);
    panel.append(metaBar, content);
    this._panelMount.replaceChildren(panel);
  }

  _renderViewContent(content: HTMLElement, view: MainPreviewFileView, editor?: MainPreviewEditorState): void {
    const optionalKind = (view.kind === 'text' || view.kind === 'empty')
      ? isMarkdownPreviewPath(view.path) ? 'markdown' : !editor && isCsvPreviewPath(view.path) ? 'csv' : !editor && isDiagramPreviewPath(view.path) ? 'diagram' : undefined
      : previewPackageId(view.kind) ? view.kind : undefined;
    const optionalId = optionalKind && previewPackageId(optionalKind);
    if (optionalId && this._state.enabledPreviewers?.includes(`code-codex.${optionalId}`)) {
      if (!isPluginPackageLoaded(optionalId)) {
        const failed = this._previewLoadFailures.get(optionalId);
        content.append(this._statePanel(failed ? 'Preview plugin unavailable' : 'Loading preview plugin', failed || 'Loading the previously downloaded and verified local plugin.', 'unsupported', view));
        if (!failed && !this._previewLoads.has(optionalId)) {
          this._previewLoads.add(optionalId);
          const path = view.path;
          void ensurePluginPackage(optionalId).catch(error => {
            this._previewLoadFailures.set(optionalId, error instanceof Error ? error.message : 'The plugin could not load. Download it in Preview Market.');
          }).finally(() => {
            this._previewLoads.delete(optionalId);
            if (this._connected && this._state.activePath === path) this._render();
          });
        }
        return;
      }
    }
    if (editor && (view.kind === "text" || view.kind === "empty")) {
      if (this._state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) && isMarkdownPreviewPath(view.path)) {
        content.append(this._markdownEditor(view, editor));
        this._appendEditorError(content, view, editor);
        return;
      }
      const stack = this.ownerDocument.createElement("div");
      stack.className = "code-editor-stack";
      const lineNumbers = this._lineNumberGutter(stack, editor.draft, "code-editor-line-numbers");
      const mirror = this.ownerDocument.createElement("pre");
      mirror.className = "code-editor-highlight";
      mirror.setAttribute("aria-hidden", "true");
      const code = this._highlightedCode(view.path, editor.draft);
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
        this._replaceHighlightedSource(code, view.path, textarea.value);
        this._replaceLineNumbers(lineNumbers, stack, textarea.value);
        this._syncEditorScroll(textarea);
        this._dispatchPathEvent<MainPreviewDraftDetail>(MAIN_PREVIEW_DRAFT_EVENT, { path: view.path, text: textarea.value });
      });
      textarea.addEventListener("scroll", () => this._syncEditorScroll(textarea), { passive: true });
      textarea.addEventListener("compositionstart", () => stack.classList.add("composing"));
      textarea.addEventListener("compositionend", () => {
        this._replaceHighlightedSource(code, view.path, textarea.value);
        stack.classList.remove("composing");
        this._syncEditorScroll(textarea);
      });
      stack.append(lineNumbers, mirror, textarea);
      content.append(stack);
      this._appendEditorError(content, view, editor);
      return;
    }
    switch (view.kind) {
      case "loading":
        content.append(this._statePanel("Loading preview", "Reading this file from the local workspace.", "loading", view));
        return;
      case "text":
        if (view.text.length === 0) {
          content.append(this._statePanel("Empty file", "This file is empty.", "empty", view));
          return;
        }
        if (this._state.enabledPreviewers?.includes(MARKDOWN_PREVIEWER_ID) && isMarkdownPreviewPath(view.path)) {
          content.append(this._markdownReader(view));
          return;
        }
        if (this._state.enabledPreviewers?.includes(CSV_PREVIEWER_ID) && isCsvPreviewPath(view.path)) {
          content.append(this._csvReader(view));
          return;
        }
        if (this._state.enabledPreviewers?.includes(DIAGRAM_PREVIEWER_ID) && isDiagramPreviewPath(view.path)) {
          content.append(this._diagramReader(view));
          return;
        }
        {
          const reader = this.ownerDocument.createElement("div");
          reader.className = "code-reader";
          const lineNumbers = this._lineNumberGutter(reader, view.text);
          const pre = this.ownerDocument.createElement("pre");
          pre.className = "literal-text";
          pre.setAttribute("aria-label", `${view.name} contents`);
          const code = this._highlightedCode(view.path, view.text);
          pre.append(code);
          reader.append(lineNumbers, pre);
          content.append(reader);
        }
        return;
      case "git-diff":
        content.append(this._gitDiffReader(view));
        return;
      case "image":
      case "video":
      case "pdf":
      case "audio":
      case "office":
      case "notebook":
      case "model":
        content.append(this._mediaPreview(view));
        return;
      case "empty":
        if (this._state.enabledPreviewers?.includes(CSV_PREVIEWER_ID) && isCsvPreviewPath(view.path)) {
          content.append(this._statePanel("Empty CSV file", "This CSV file has no rows.", "empty", view));
          return;
        }
        if (this._state.enabledPreviewers?.includes(DIAGRAM_PREVIEWER_ID) && isDiagramPreviewPath(view.path)) {
          content.append(this._statePanel("Empty diagram file", "This diagram file has no content.", "empty", view));
          return;
        }
        content.append(this._statePanel("Empty file", "This file is empty.", "empty", view));
        return;
      case "unsupported":
        content.append(this._statePanel("Preview unavailable", unsupportedCopy(view.reason), "unsupported", view));
        return;
      case "error":
        content.append(
          this._statePanel("File preview failed", view.message || "The file could not be loaded. Select it again to retry.", "error", view),
        );
    }
  }

  _mediaPreview(view: MainPreviewMediaView | MainPreviewModelView): HTMLElement {
    const id = previewPackageId(view.kind); if (!id || !this._state.enabledPreviewers?.includes(previewerIdForMediaKind(view.kind))) return this._statePanel('Preview unavailable', 'Enable this file preview extension in Preview Market.', 'unsupported', view);
    const methods: Record<string, string> = { pdf: '_pdfPreview', office: '_officePreview', notebook: '_notebookPreview', model: '_modelPreview', image: '_mediaPreview', video: '_mediaPreview', audio: '_mediaPreview' }; const method = previewMethod(id, methods[view.kind]!); if (!method) return this._statePanel('Preview unavailable', 'Download this file preview extension in Preview Market.', 'unsupported', view); return method.call(this, view);
  }

  _modelPreview(view: MainPreviewModelView): HTMLElement {
    const method = previewMethod("model-preview", "_modelPreview");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  _prepareModelResources(
    view: MainPreviewModelView,
    inspection: ModelPreviewSourceInspection,
    memoryScope: ModelMemoryCacheScope,
  ): ReadonlyMap<string, string> {
    const method = previewMethod("model-preview", "_prepareModelResources");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, inspection, memoryScope);
  }

  _decodeModelDataBufferUri(uri: string, window: Window): Uint8Array {
    const method = previewMethod("model-preview", "_decodeModelDataBufferUri");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, uri, window);
  }

  _decodeModelDataImageUri(
    uri: string,
    window: Window,
  ): { readonly bytes: Uint8Array; readonly mimeType: string } {
    const method = previewMethod("model-preview", "_decodeModelDataImageUri");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, uri, window);
  }

  _decodeModelDataUri(
    uri: string,
    window: Window,
    maxBytes: number,
  ): { readonly bytes: Uint8Array; readonly mimeType: string } {
    const method = previewMethod("model-preview", "_decodeModelDataUri");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, uri, window, maxBytes);
  }

  _modelResourceLookupKeys(uri: string): readonly string[] {
    const method = previewMethod("model-preview", "_modelResourceLookupKeys");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, uri);
  }

  _arrayBufferFor(bytes: Uint8Array): ArrayBuffer {
    const method = previewMethod("model-preview", "_arrayBufferFor");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bytes);
  }

  _visibleModelGeometryCount(root: Object3D): number {
    const method = previewMethod("model-preview", "_visibleModelGeometryCount");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  _visibleModelBounds(root: Object3D): Box3 {
    const method = previewMethod("model-preview", "_visibleModelBounds");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  _modelPreviewErrorMessage(error: unknown): string {
    const method = previewMethod("model-preview", "_modelPreviewErrorMessage");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, error);
  }

  _notebookPreview(view: MainPreviewMediaView): HTMLElement {
    const method = previewMethod("notebook-preview", "_notebookPreview");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  async _renderNotebookModel(
    view: MainPreviewMediaView,
    model: NotebookModel,
    container: HTMLElement,
    job: NotebookPreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const method = previewMethod("notebook-preview", "_renderNotebookModel");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, model, container, job, isCurrent);
  }

  _notebookCell(
    cell: NotebookCellModel,
    index: number,
    languagePath: string,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement | null {
    const method = previewMethod("notebook-preview", "_notebookCell");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, cell, index, languagePath, budget, job);
  }

  _notebookOutput(
    output: NotebookOutputModel,
    cellIndex: number,
    outputIndex: number,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement {
    const method = previewMethod("notebook-preview", "_notebookOutput");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, output, cellIndex, outputIndex, budget, job);
  }

  _notebookMimeOutput(
    bundle: NotebookMimeBundle,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
    alt: string,
    startIndex = 0,
  ): HTMLElement | null {
    const method = previewMethod("notebook-preview", "_notebookMimeOutput");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bundle, budget, job, alt, startIndex);
  }

  _takeNotebookRenderText(value: unknown, budget: NotebookRenderBudget): string | null {
    const method = previewMethod("notebook-preview", "_takeNotebookRenderText");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, value, budget);
  }

  _notebookMarkdown(
    source: string,
    attachments: ReadonlyMap<string, NotebookMimeBundle>,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
  ): HTMLElement {
    const method = previewMethod("notebook-preview", "_notebookMarkdown");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, source, attachments, budget, job);
  }

  _notebookAttachmentImage(
    bundle: NotebookMimeBundle,
    budget: NotebookRenderBudget,
    job: NotebookPreviewJob,
    alt: string,
    startIndex = 0,
  ): HTMLImageElement | null {
    const method = previewMethod("notebook-preview", "_notebookAttachmentImage");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bundle, budget, job, alt, startIndex);
  }

  _notebookHtml(value: unknown, budget: NotebookRenderBudget): HTMLElement | null {
    const method = previewMethod("notebook-preview", "_notebookHtml");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, value, budget);
  }

  _notebookRasterImage(
    mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif",
    value: unknown,
    budget: NotebookRenderBudget,
    alt: string,
  ): HTMLImageElement | null {
    const method = previewMethod("notebook-preview", "_notebookRasterImage");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, mimeType, value, budget, alt);
  }

  _notebookSvgImage(value: unknown, budget: NotebookRenderBudget, alt: string): HTMLImageElement | null {
    const method = previewMethod("notebook-preview", "_notebookSvgImage");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, value, budget, alt);
  }

  _bindNotebookImageFallback(
    image: HTMLImageElement,
    job: NotebookPreviewJob,
    renderFallback: () => HTMLElement | null,
  ): void {
    const method = previewMethod("notebook-preview", "_bindNotebookImageFallback");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, image, job, renderFallback);
  }

  _isNotebookJobCurrent(job: NotebookPreviewJob): boolean {
    const method = previewMethod("notebook-preview", "_isNotebookJobCurrent");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, job);
  }

  _notebookNodeCost(root: Node): number {
    const method = previewMethod("notebook-preview", "_notebookNodeCost");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  _consumeNotebookDomNodes(budget: NotebookRenderBudget, count: number): boolean {
    const method = previewMethod("notebook-preview", "_consumeNotebookDomNodes");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, budget, count);
  }

  async _yieldNotebookRender(signal: AbortSignal): Promise<void> {
    const method = previewMethod("notebook-preview", "_yieldNotebookRender");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, signal);
  }

  _cancelNotebookPreview(): void {
    const method = previewMethod("notebook-preview", "_cancelNotebookPreview");
    if (!method) return;
    return method.call(this);
  }

  _pdfPreview(view: MainPreviewMediaView): HTMLElement {
    const method = previewMethod("pdf-preview", "_pdfPreview");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  _cancelPdfPreview(): void {
    const method = previewMethod("pdf-preview", "_cancelPdfPreview");
    if (!method) return;
    return method.call(this);
  }

  _officePreview(view: MainPreviewMediaView): HTMLElement {
    const method = previewMethod("office-preview", "_officePreview");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  async _renderDocxOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_renderDocxOffice");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, container, stage, job, isCurrent);
  }

  async _prepareDocxPreviewBytes(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    const method = previewMethod("office-preview", "_prepareDocxPreviewBytes");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bytes, signal);
  }

  _captureDocxPreviewMarkers(root: HTMLElement): void {
    const method = previewMethod("office-preview", "_captureDocxPreviewMarkers");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  async _settleDocxLayout(root: HTMLElement, signal: AbortSignal): Promise<void> {
    const method = previewMethod("office-preview", "_settleDocxLayout");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, signal);
  }

  async _waitForDocxImages(root: HTMLElement, signal: AbortSignal): Promise<void> {
    const method = previewMethod("office-preview", "_waitForDocxImages");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, signal);
  }

  async _waitOfficeDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    const method = previewMethod("office-preview", "_waitOfficeDelay");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, milliseconds, signal);
  }

  async _yieldOfficeAnimationFrame(signal: AbortSignal): Promise<void> {
    const method = previewMethod("office-preview", "_yieldOfficeAnimationFrame");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, signal);
  }

  _renumberDocxCachedPageFooters(
    root: HTMLElement,
    className: string,
    domBudget: OfficeDomBudget,
  ): void {
    const method = previewMethod("office-preview", "_renumberDocxCachedPageFooters");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, className, domBudget);
  }

  _observeLateDocxLayout(
    root: HTMLElement,
    className: string,
    job: OfficePreviewJob,
    domBudget: OfficeDomBudget,
  ): void {
    const method = previewMethod("office-preview", "_observeLateDocxLayout");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, className, job, domBudget);
  }

  async _checkpointDocxPagination(
    clock: DocxPaginationClock,
    signal: AbortSignal,
    forceYield = false,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_checkpointDocxPagination");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, clock, signal, forceYield);
  }

  async _paginateDocxOverflowPages(
    root: HTMLElement,
    className: string,
    signal: AbortSignal,
    domBudget: OfficeDomBudget,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_paginateDocxOverflowPages");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, className, signal, domBudget);
  }

  _docxPageOverflows(page: HTMLElement): boolean {
    const method = previewMethod("office-preview", "_docxPageOverflows");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, page);
  }

  _stripDocxCloneIds(root: HTMLElement): void {
    const method = previewMethod("office-preview", "_stripDocxCloneIds");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  async _splitDocxParagraphForPage(
    block: HTMLElement,
    article: HTMLElement,
    page: HTMLElement,
    signal: AbortSignal,
    clock: DocxPaginationClock,
    domBudget: OfficeDomBudget,
  ): Promise<DocxBlockSplitResult> {
    const method = previewMethod("office-preview", "_splitDocxParagraphForPage");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, block, article, page, signal, clock, domBudget);
  }

  async _splitDocxTableForPage(
    block: HTMLElement,
    article: HTMLElement,
    page: HTMLElement,
    signal: AbortSignal,
    clock: DocxPaginationClock,
    domBudget: OfficeDomBudget,
    requireFittingFragment = false,
  ): Promise<DocxBlockSplitResult> {
    const method = previewMethod("office-preview", "_splitDocxTableForPage");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, block, article, page, signal, clock, domBudget, requireFittingFragment);
  }

  _officeAbortError(): Error {
    const method = previewMethod("office-preview", "_officeAbortError");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this);
  }

  _throwIfOfficeAborted(signal: AbortSignal): void {
    const method = previewMethod("office-preview", "_throwIfOfficeAborted");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, signal);
  }

  _parseXlsxXml(bytes: Uint8Array, label: string): Document {
    const method = previewMethod("office-preview", "_parseXlsxXml");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bytes, label);
  }

  async _readXlsxXmlEntry(
    entry: JSZip.JSZipObject,
    maximumBytes: number,
    signal: AbortSignal,
    label: string,
  ): Promise<Document> {
    const method = previewMethod("office-preview", "_readXlsxXmlEntry");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, entry, maximumBytes, signal, label);
  }

  _xlsxArchiveEntries(archive: JSZip): ReadonlyMap<string, JSZip.JSZipObject> {
    const method = previewMethod("office-preview", "_xlsxArchiveEntries");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, archive);
  }

  async _xlsxWorksheetMetadata(
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<{ readonly worksheets: readonly XlsxWorksheetMeta[]; readonly total: number }> {
    const method = previewMethod("office-preview", "_xlsxWorksheetMetadata");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, entries, signal);
  }

  async _xlsxSharedStrings(
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<XlsxSharedStrings> {
    const method = previewMethod("office-preview", "_xlsxSharedStrings");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, entries, signal);
  }

  async _xlsxStyles(
    entries: ReadonlyMap<string, JSZip.JSZipObject>,
    signal: AbortSignal,
  ): Promise<XlsxStyleTable> {
    const method = previewMethod("office-preview", "_xlsxStyles");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, entries, signal);
  }

  async _parseXlsxWorksheet(
    entry: JSZip.JSZipObject,
    sharedStrings: XlsxSharedStrings,
    styles: XlsxStyleTable,
    signal: AbortSignal,
  ): Promise<ParsedXlsxWorksheet> {
    const method = previewMethod("office-preview", "_parseXlsxWorksheet");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, entry, sharedStrings, styles, signal);
  }

  async _renderXlsxOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_renderXlsxOffice");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, container, stage, job, isCurrent);
  }

  async _renderNativePptOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_renderNativePptOffice");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, container, stage, job, isCurrent);
  }

  async _renderLegacyPptOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_renderLegacyPptOffice");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, container, stage, job, isCurrent);
  }

  async _parseLegacyPpt(bytes: Uint8Array, job: OfficePreviewJob): Promise<ParsedPresentation> {
    const method = previewMethod("office-preview", "_parseLegacyPpt");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bytes, job);
  }

  _sanitizeLegacyPptPresentation(parsed: ParsedPresentation): ParsedPresentation {
    const method = previewMethod("office-preview", "_sanitizeLegacyPptPresentation");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, parsed);
  }

  async _renderPptxOffice(
    view: MainPreviewMediaView,
    container: HTMLElement,
    stage: HTMLElement,
    job: OfficePreviewJob,
    isCurrent: () => boolean,
  ): Promise<void> {
    const method = previewMethod("office-preview", "_renderPptxOffice");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, container, stage, job, isCurrent);
  }

  async _assertPptxHasNoExternalRelationships(bytes: Uint8Array, signal: AbortSignal): Promise<void> {
    const method = previewMethod("office-preview", "_assertPptxHasNoExternalRelationships");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, bytes, signal);
  }

  _cancelOfficePreview(): void {
    const method = previewMethod("office-preview", "_cancelOfficePreview");
    if (!method) return;
    return method.call(this);
  }

  _observeOfficeResources(root: HTMLElement, job: OfficePreviewJob): void {
    const method = previewMethod("office-preview", "_observeOfficeResources");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, job);
  }

  _takeSanitizedDocxStyles(host: HTMLElement, className: string): HTMLStyleElement[] {
    const method = previewMethod("office-preview", "_takeSanitizedDocxStyles");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, host, className);
  }

  _sanitizeDocxCss(cssText: string, className: string): string {
    const method = previewMethod("office-preview", "_sanitizeDocxCss");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, cssText, className);
  }

  _isScopedDocxSelector(selectorList: string, className: string): boolean {
    const method = previewMethod("office-preview", "_isScopedDocxSelector");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, selectorList, className);
  }

  _sanitizeOfficeStyleDeclaration(style: CSSStyleDeclaration): void {
    const method = previewMethod("office-preview", "_sanitizeOfficeStyleDeclaration");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, style);
  }

  _sanitizeOfficeCssUrls(value: string): string {
    const method = previewMethod("office-preview", "_sanitizeOfficeCssUrls");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, value);
  }

  _sanitizeDetachedDocx(root: HTMLElement): void {
    const method = previewMethod("office-preview", "_sanitizeDetachedDocx");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  _sanitizeOfficeTree(root: Element): void {
    const method = previewMethod("office-preview", "_sanitizeOfficeTree");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  _sanitizeOfficeElement(element: Element): void {
    const method = previewMethod("office-preview", "_sanitizeOfficeElement");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, element);
  }

  _isLocalOfficeResource(value: string): boolean {
    const method = previewMethod("office-preview", "_isLocalOfficeResource");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, value);
  }

  _officeDomCost(root: Node, includeRoot = true): { nodes: number; textUnits: number } {
    const method = previewMethod("office-preview", "_officeDomCost");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root, includeRoot);
  }

  _reserveOfficeDomClones(domBudget: OfficeDomBudget, roots: readonly Node[]): boolean {
    const method = previewMethod("office-preview", "_reserveOfficeDomClones");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, domBudget, roots);
  }

  _boundOfficeDom(root: HTMLElement): boolean {
    const method = previewMethod("office-preview", "_boundOfficeDom");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, root);
  }

  async _yieldOfficeRender(): Promise<void> {
    const method = previewMethod("office-preview", "_yieldOfficeRender");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this);
  }

  _mediaObjectUrl(view: MainPreviewMediaView): string | null {
    if (!this._connected) return null;
    const cached = this._mediaObjectUrls.get(view.path);
    if (cached?.bytes === view.bytes && cached.mimeType === view.mimeType) return cached.url;
    if (cached) this._revokeMediaObjectUrl(view.path);

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
      this._mediaObjectUrls.set(view.path, {
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

  _reconcileMediaObjectUrls(state: MainPreviewState): void {
    for (const [path, cached] of this._mediaObjectUrls) {
      const view = state.tabs.find((candidate) => candidate.path === path);
      const enabled = isMediaPreviewView(view) &&
        state.enabledPreviewers?.includes(previewerIdForMediaKind(view.kind)) === true;
      if (
        !isMediaPreviewView(view) ||
        view.bytes !== cached.bytes ||
        view.mimeType !== cached.mimeType ||
        !enabled
      ) {
        this._revokeMediaObjectUrl(path);
      }
    }
  }

  _revokeMediaObjectUrl(path: string): void {
    const cached = this._mediaObjectUrls.get(path);
    if (!cached) return;
    this._mediaObjectUrls.delete(path);
    try {
      cached.revoke();
    } catch {
      // The document may already be torn down; dropping the cache is sufficient.
    }
  }

  _revokeAllMediaObjectUrls(): void {
    for (const path of [...this._mediaObjectUrls.keys()]) this._revokeMediaObjectUrl(path);
  }

  _statePanel(
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
      card.append(this._staticIcon(icon, "state-icon"));
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

  _csvReader(view: MainPreviewTextView): HTMLElement {
    const method = previewMethod("csv-preview", "_csvReader");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  _startDiagramPreview(): DiagramPreviewJob {
    const method = previewMethod("diagram-preview", "_startDiagramPreview");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this);
  }

  _isDiagramPreviewCurrent(job: DiagramPreviewJob): boolean {
    const method = previewMethod("diagram-preview", "_isDiagramPreviewCurrent");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, job);
  }

  _cancelDiagramPreview(): void {
    const method = previewMethod("diagram-preview", "_cancelDiagramPreview");
    if (!method) return;
    return method.call(this);
  }

  _cancelModelPreview(): void {
    const method = previewMethod("model-preview", "_cancelModelPreview");
    if (!method) return;
    return method.call(this);
  }

  _disposeModelJob(job: ModelPreviewJob): void {
    const method = previewMethod("model-preview", "_disposeModelJob");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, job);
  }

  _disposeModelObjects(roots: readonly Object3D[]): void {
    const method = previewMethod("model-preview", "_disposeModelObjects");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, roots);
  }

  _diagramReader(view: MainPreviewTextView): HTMLElement {
    const method = previewMethod("diagram-preview", "_diagramReader");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  _metadataFor(view: MainPreviewFileView): string {
    switch (view.kind) {
      case "loading":
        return "Loading";
      case "text":
        return view.truncated ? `${formatBytes(view.sizeBytes)} \u00b7 Preview truncated` : formatBytes(view.sizeBytes);
      case "git-diff":
        return `Commit ${view.shortHash}${view.truncated ? " \u00b7 Diff truncated" : ""}`;
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
      case "model":
        return `3D model \u00b7 ${formatBytes(view.sizeBytes)}`;
      case "unsupported":
        return formatBytes(view.sizeBytes);
      case "error":
        return view.code || "Preview error";
    }
  }

  _gitDiffReader(view: MainPreviewGitDiffView): HTMLElement {
    const reader = this.ownerDocument.createElement("pre");
    reader.className = "git-diff-reader";
    reader.setAttribute("aria-label", `${view.name} changes in commit ${view.shortHash}`);
    for (const line of view.content.split("\n")) {
      const row = this.ownerDocument.createElement("span");
      row.className = "git-diff-line";
      if (line.startsWith("+") && !line.startsWith("+++")) row.classList.add("git-diff-line-add");
      else if (line.startsWith("-") && !line.startsWith("---")) row.classList.add("git-diff-line-remove");
      else if (line.startsWith("@@")) row.classList.add("git-diff-line-hunk");
      else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
        row.classList.add("git-diff-line-header");
      }
      row.textContent = line || " ";
      reader.append(row);
    }
    return reader;
  }

  _highlightedSource(path: string, source: string): SyntaxHighlight {
    const cached = this._syntaxCache.get(path);
    if (cached?.source === source) return cached.highlight;
    const highlight = highlightSyntaxForPath(path, source);
    this._syntaxCache.set(path, { source, highlight });
    return highlight;
  }

  _highlightedCode(path: string, source: string): HTMLElement {
    const code = this.ownerDocument.createElement("code");
    code.className = "syntax-code";
    this._replaceHighlightedSource(code, path, source);
    return code;
  }

  _markdownReader(view: MainPreviewTextView): HTMLElement {
    const method = previewMethod("markdown-preview", "_markdownReader");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view);
  }

  _markdownEditor(view: MainPreviewTextView | MainPreviewEmptyView, editor: MainPreviewEditorState): HTMLElement {
    const method = previewMethod("markdown-preview", "_markdownEditor");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, editor);
  }

  _createMarkdownSurface(
    view: MainPreviewTextView | MainPreviewEmptyView,
    source: string,
    editable: boolean,
  ): HTMLElement {
    const method = previewMethod("markdown-preview", "_createMarkdownSurface");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, view, source, editable);
  }

  _populateMarkdownArticle(article: HTMLElement, source: string, editable: boolean): void {
    const method = previewMethod("markdown-preview", "_populateMarkdownArticle");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, article, source, editable);
  }

  _decorateMarkdownTaskLists(article: HTMLElement, editable: boolean): void {
    const method = previewMethod("markdown-preview", "_decorateMarkdownTaskLists");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, article, editable);
  }

  _pastePlainText(event: ClipboardEvent, article: HTMLElement): void {
    const method = previewMethod("markdown-preview", "_pastePlainText");
    if (!method) throw new Error("Download this file preview plugin in Preview Market first.");
    return method.call(this, event, article);
  }

  _appendEditorError(content: HTMLElement, view: MainPreviewFileView, editor: MainPreviewEditorState): void {
    if (!editor.error) return;
    const error = this.ownerDocument.createElement("div");
    error.className = "editor-error";
    error.setAttribute("role", "alert");
    const copy = this._textSpan(editor.error, "editor-error-copy");
    copy.title = editor.error;
    const reload = this.ownerDocument.createElement("button");
    reload.type = "button";
    reload.className = "editor-reload";
    reload.textContent = "Reload file";
    reload.addEventListener("click", () => {
      this._dispatchPathEvent<MainPreviewPathDetail>(MAIN_PREVIEW_RELOAD_EVENT, { path: view.path });
    });
    error.append(copy, reload);
    content.append(error);
  }

  _replaceHighlightedSource(code: HTMLElement, path: string, source: string): void {
    const highlighted = this._highlightedSource(path, source);
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

  _lineNumberGutter(surface: HTMLElement, source: string, extraClass = ""): HTMLElement {
    const gutter = this.ownerDocument.createElement("pre");
    gutter.className = `code-line-numbers ${extraClass}`.trim();
    gutter.setAttribute("aria-hidden", "true");
    this._replaceLineNumbers(gutter, surface, source);
    return gutter;
  }

  _replaceLineNumbers(gutter: HTMLElement, surface: HTMLElement, source: string): void {
    const lineCount = sourceLineCount(source);
    gutter.dataset.lineCount = String(lineCount);
    gutter.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
    const digits = Math.max(2, String(lineCount).length);
    surface.style.setProperty("--cle-line-number-width", `calc(${digits}ch + 24px)`);
  }

  _syncEditorScroll(editor: HTMLTextAreaElement): void {
    const mirror = editor.parentElement?.querySelector<HTMLElement>(".code-editor-highlight");
    if (!mirror) return;
    mirror.scrollTop = editor.scrollTop;
    mirror.scrollLeft = editor.scrollLeft;
    const lineNumbers = editor.parentElement?.querySelector<HTMLElement>(".code-editor-line-numbers");
    if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
  }

  _onTabListClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const close = target.closest<HTMLButtonElement>("button[data-close-path]");
    if (close) {
      const path = close.dataset.closePath;
      if (path) this._dispatchClose(path);
      return;
    }
    const tab = target.closest<HTMLElement>("[role='tab']");
    if (tab && this._tabList.contains(tab)) this._activateTab(tab);
  }

  _onTabListKeyDown(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[role='tab']") : null;
    if (!target || !this._tabList.contains(target)) return;
    const focusedPath = this._pathForTab(target);
    if (
      focusedPath !== null &&
      (event.key === "Delete" || (event.key.toLowerCase() === "w" && (event.ctrlKey || event.metaKey)))
    ) {
      event.preventDefault();
      event.stopPropagation();
      this._dispatchClose(focusedPath);
      return;
    }
    const tabs = this._tabs();
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
    this._setRovingPath(this._pathForTab(next));
    next.focus();
    this._activateTab(next);
  }

  _onShadowKeyDown(event: KeyboardEvent): void {
    if (
      this._state.editor &&
      event.key.toLocaleLowerCase() === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this._dispatchPathEvent<MainPreviewPathDetail>(MAIN_PREVIEW_SAVE_EVENT, { path: this._state.editor.path });
      return;
    }
    if (event.key !== "Escape" || this._state.activePath === null) return;
    event.preventDefault();
    event.stopPropagation();
    this._rovingPath = null;
    if (!this._dispatchActivate({ kind: "conversation" })) {
      this._setRovingPath(this._state.activePath);
      this._focusActiveTab();
      return;
    }
    this._setRovingPath(null);
    this._tabForPath(null)?.focus();
  }

  _activateTab(tab: HTMLElement): void {
    const path = this._pathForTab(tab);
    this._setRovingPath(path);
    const activated = path === null
      ? this._dispatchActivate({ kind: "conversation" })
      : this._dispatchActivate({ kind: "file", path });
    if (!activated) {
      this._setRovingPath(this._state.activePath);
      this._focusActiveTab();
    }
  }

  _dispatchActivate(detail: MainPreviewActivateDetail): boolean {
    return this.dispatchEvent(
      new CustomEvent<MainPreviewActivateDetail>(MAIN_PREVIEW_ACTIVATE_EVENT, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      }),
    );
  }

  _dispatchClose(path: string): void {
    this.dispatchEvent(
      new CustomEvent<MainPreviewCloseDetail>(MAIN_PREVIEW_CLOSE_EVENT, { bubbles: true, composed: true, detail: { path } }),
    );
  }

  _dispatchPathEvent<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { bubbles: true, composed: true, detail }));
  }

  _setRovingPath(path: string | null): void {
    this._rovingPath = path;
    for (const tab of this._tabs()) tab.tabIndex = this._pathForTab(tab) === path ? 0 : -1;
  }

  _pathForTab(tab: HTMLElement): string | null {
    return tab.dataset.tabKind === "file" ? (tab.dataset.path ?? null) : null;
  }

  _tabs(): HTMLElement[] {
    return Array.from(this._tabList.querySelectorAll<HTMLElement>("[role='tab']"));
  }

  _tabForPath(path: string | null): HTMLElement | undefined {
    return this._tabs().find((tab) => this._pathForTab(tab) === path);
  }

  _captureFocus(): FocusSnapshot {
    const active = this._shadow.activeElement;
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
    if (active.matches("[role='tab']")) return { kind: "tab", path: this._pathForTab(active) };
    if (active.matches("button[data-close-path]")) {
      const path = active.dataset.closePath;
      return path ? { kind: "close", path } : null;
    }
    if (active.matches(".preview-panel")) return { kind: "panel" };
    return null;
  }

  _restoreFocus(focus: FocusSnapshot): void {
    if (!focus) return;
    if (focus.kind === "editor") {
      const editor = this._panelMount.querySelector<HTMLTextAreaElement>(".code-editor");
      if (editor) {
        editor.focus();
        editor.setSelectionRange(focus.selectionStart, focus.selectionEnd, focus.selectionDirection);
        editor.scrollTop = focus.scrollTop;
        editor.scrollLeft = focus.scrollLeft;
        this._syncEditorScroll(editor);
      } else {
        this._focusActiveTab();
      }
      return;
    }
    if (focus.kind === "markdown-editor") {
      const article = this._panelMount.querySelector<HTMLElement>(".markdown-editor-surface");
      if (!article) {
        this._focusActiveTab();
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
      const tab = this._tabForPath(focus.path);
      if (tab) tab.focus();
      else this._focusActiveTab();
      return;
    }
    if (focus.kind === "close") {
      const button = Array.from(this._tabList.querySelectorAll<HTMLButtonElement>("button[data-close-path]")).find(
        (candidate) => candidate.dataset.closePath === focus.path,
      );
      if (button) button.focus();
      else this._focusActiveTab();
      return;
    }
    const panel = this._panelMount.querySelector<HTMLElement>(".preview-panel");
    if (panel) panel.focus();
    else this._focusActiveTab();
  }

  _tabId(path: string): string {
    let id = this._tabIds.get(path);
    if (!id) {
      this._nextTabId += 1;
      id = `cle-main-preview-${this._instanceId}-file-tab-${this._nextTabId}`;
      this._tabIds.set(path, id);
    }
    return id;
  }

  _panelId(path: string): string {
    return `${this._tabId(path)}-panel`;
  }

  _staticIcon(markup: string, className: string): HTMLElement {
    const icon = this.ownerDocument.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = markup;
    return icon;
  }

  _textSpan(text: string, className: string): HTMLSpanElement {
    const span = this.ownerDocument.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  _focusActiveTab(): void {
    (this._tabForPath(this._state.activePath) ?? this._tabForPath(null))?.focus();
  }

  _scrollSelectedTabIntoView(): void {
    const selected = this._tabForPath(this._state.activePath);
    const slot = selected?.parentElement;
    if (!slot) return;
    const scrollIntoView = (slot as HTMLElement).scrollIntoView;
    if (typeof scrollIntoView === "function") scrollIntoView.call(slot, { block: "nearest", inline: "nearest" });
  }

  _nativeConversationViewport(parent: Element): HTMLElement | null {
    if (!this._clippedLayout) return null;
    const viewports = parent.querySelectorAll<HTMLElement>(
      ':scope > div > [data-app-shell-workspace-layout]',
    );
    const viewport = viewports.length === 1 ? viewports[0] : null;
    return viewport?.parentElement?.parentElement === parent ? viewport : null;
  }

  _syncNativeViewportBounds(parent: Element, viewport: HTMLElement | null): void {
    if (!viewport) {
      this._nativeViewportObserver?.disconnect();
      this._observedNativeViewport = null;
      this.style.removeProperty("left");
      this.style.removeProperty("right");
      return;
    }
    if (this._observedNativeViewport !== viewport) {
      this._nativeViewportObserver?.disconnect();
      this._observedNativeViewport = viewport;
      if (typeof ResizeObserver !== "undefined") {
        this._nativeViewportObserver ??= new ResizeObserver(() => {
          const currentParent = this.parentElement;
          const currentViewport = this._observedNativeViewport;
          if (this._connected && currentParent?.matches(MAIN_SURFACE_SELECTOR) && currentViewport) {
            this._syncNativeViewportBounds(currentParent, currentViewport);
          }
        });
        this._nativeViewportObserver.observe(parent);
        this._nativeViewportObserver.observe(viewport);
      }
    }
    const parentRect = parent.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    if (parentRect.width <= 0 || viewportRect.width <= 0) return;
    const parentStyle = getComputedStyle(parent);
    // Absolute offsets start at the main surface's padding edge, after its border.
    const contentLeft = parentRect.left + (Number.parseFloat(parentStyle.borderLeftWidth) || 0);
    const contentRight = parentRect.right - (Number.parseFloat(parentStyle.borderRightWidth) || 0);
    this.style.left = `${Math.max(0, viewportRect.left - contentLeft)}px`;
    this.style.right = `${Math.max(0, contentRight - viewportRect.right)}px`;
  }

  _syncSuppression(): void {
    const parent = this._connected && !this._suspended && this._state.tabs.length > 0 && this.parentElement?.matches(MAIN_SURFACE_SELECTOR)
      ? this.parentElement
      : null;
    if (!parent) {
      this._restoreSuppressedChildren();
      this._syncNativeViewportBounds(this.parentElement ?? this, null);
      this._nativeTitleObserver?.disconnect();
      this._nativeTitleObserver = null;
      this._nativeTitleObserverRoot = null;
      return;
    }
    if (this._suppressedParent !== parent) {
      this._restoreSuppressedChildren();
      this._suppressedParent = parent;
      this._childObserver = new MutationObserver(() => this._syncSuppression());
      this._childObserver.observe(parent, { childList: true, subtree: true });
    }

    const nativeViewport = this._nativeConversationViewport(parent);
    this._syncNativeViewportBounds(parent, nativeViewport);

    const directChildren = Array.from(parent.children);
    const nativeHeader = directChildren.find((child) => child.matches(
      "header[data-app-shell-application-menu-bar], header[data-app-shell-header-edge-scroll]",
    ));
    const nativeHeaderSubject = nativeHeader?.querySelector(
      '[data-testid="app-shell-header-context-menu-surface"]',
    ) ?? nativeHeader;
    const desired = new Set<Element>();
    if (nativeHeaderSubject) desired.add(nativeHeaderSubject);

    if (this._clippedLayout) {
      const titleRoot = parent.closest('[data-app-shell-active-page="true"]') ?? document;
      const focusedTitles = activePageElements<HTMLElement>(titleRoot,
        'header [data-app-shell-focus-area="main"] [data-app-shell-titlebar-content]',
      );
      const titles = focusedTitles.length ? focusedTitles :
        activePageElements<HTMLElement>(titleRoot, "header [data-app-shell-titlebar-content]");
      const title = titles.length === 1 ? titles[0] : null;
      const header = title?.closest("header") ?? null;
      const observerRoot = header?.parentElement ??
        (this._nativeTitleObserverRoot?.isConnected ? this._nativeTitleObserverRoot : document.body);
      if (observerRoot !== this._nativeTitleObserverRoot) {
        this._nativeTitleObserver?.disconnect();
        this._nativeTitleObserverRoot = observerRoot;
        this._nativeTitleObserver = observerRoot ? new MutationObserver(() => this._syncSuppression()) : null;
        this._nativeTitleObserver?.observe(observerRoot!, {
          childList: true,
          subtree: true,
          characterData: observerRoot !== document.body,
        });
      }
      const titleText = title?.textContent?.trim() || "Conversation";
      if (titleText !== this._conversationTitle) {
        this._conversationTitle = titleText;
        const tab = this._tabList.querySelector<HTMLButtonElement>('[data-tab-kind="conversation"]');
        const label = tab?.querySelector<HTMLElement>(".tab-label");
        if (label) label.textContent = titleText;
        if (tab) tab.title = titleText;
      }
      const titleRect = title?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      if (titleRect && headerRect) {
        this.style.setProperty("--cle-native-header-height", `${headerRect.height}px`);
        const titleStyle = getComputedStyle(title!);
        this.style.setProperty("--cle-native-title-line-height", titleStyle.lineHeight);
        desired.add(title!);
      }
    }

    if (this._state.activePath !== null) {
      if (this._clippedLayout && nativeViewport) {
        desired.add(nativeViewport);
      } else {
        for (const child of directChildren) {
          if (child !== this && child !== nativeHeader) desired.add(child);
        }
      }
    }

    for (const child of Array.from(this._suppressedChildren.keys())) {
      if (!desired.has(child)) this._restoreSuppressedChild(child);
    }
    for (const child of desired) this._suppressChild(child);
  }

  _suppressChild(child: Element): void {
    if (this._suppressedChildren.has(child)) return;
    const style = (child as HTMLElement).style;
    this._suppressedChildren.set(child, {
      inert: child.getAttribute("inert"),
      ariaHidden: child.getAttribute("aria-hidden"),
      opacity: style.getPropertyValue("opacity"),
      opacityPriority: style.getPropertyPriority("opacity"),
    });
    child.setAttribute("inert", "");
    child.setAttribute("aria-hidden", "true");
    style.setProperty("opacity", "0", "important");
  }

  _restoreSuppressedChild(child: Element): void {
    const attributes = this._suppressedChildren.get(child);
    if (!attributes) return;
    restoreAttribute(child, "inert", attributes.inert);
    restoreAttribute(child, "aria-hidden", attributes.ariaHidden);
    const style = (child as HTMLElement).style;
    if (attributes.opacity) style.setProperty("opacity", attributes.opacity, attributes.opacityPriority);
    else style.removeProperty("opacity");
    this._suppressedChildren.delete(child);
  }

  _restoreSuppressedChildren(): void {
    this._childObserver?.disconnect();
    this._childObserver = null;
    for (const child of Array.from(this._suppressedChildren.keys())) this._restoreSuppressedChild(child);
    this._suppressedChildren.clear();
    this._suppressedParent = null;
  }

  _required<T extends Element>(selector: string): T {
    const element = this._shadow.querySelector<T>(selector);
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
