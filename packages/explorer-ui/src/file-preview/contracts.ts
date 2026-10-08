import type { POWERPOINT_FULL_FIDELITY_NOTICE, GLTF_JSON_PREVIEW_MIME, GLTF_BINARY_PREVIEW_MIME } from "../main-preview";
import type { PptxViewer } from "@aiden0z/pptx-renderer";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/pdf.d.ts";
import type { Root } from "react-dom/client";
import type { AnimationMixer, LoadingManager, WebGLRenderer, Object3D } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
export interface ModelPreviewSourceInspection {
  readonly externalResourceUris: readonly string[];
  readonly embeddedBufferUris: readonly string[];
  readonly embeddedImageUris: readonly string[];
  readonly bufferViewImageCount: number;
}

export type OfficeDocumentKind = "docx" | "xlsx" | "ppt" | "pptx";

export type NotebookMimeBundle = Readonly<Record<string, unknown>>;

export interface NotebookModel {
  readonly minor: number;
  readonly languagePath: string;
  readonly languageLabel: string;
  readonly kernelLabel: string;
  readonly cells: readonly NotebookCellModel[];
  readonly reservedOutputTextUnits: number;
  readonly limited: boolean;
  readonly newerMinor: boolean;
}

export interface CsvModel {
  readonly rows: readonly (readonly string[])[];
  readonly totalRows: number;
  readonly maximumColumns: number;
  readonly limited: boolean;
  readonly malformed: boolean;
}

export type DiagramSourceKind = "drawio" | "plantuml";

export interface DrawioPageSource {
  readonly name: string;
  readonly model: Element | null;
  readonly encoded: string | null;
}

export interface DrawioCellGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DrawioVertex {
  readonly id: string;
  readonly parentId: string;
  readonly label: string;
  readonly style: ReadonlyMap<string, string>;
  readonly geometry: DrawioCellGeometry;
  readonly group: boolean;
}

export interface DrawioEdge {
  readonly label: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly style: ReadonlyMap<string, string>;
  readonly points: readonly DiagramPoint[];
  readonly sourcePoint: DiagramPoint | null;
  readonly targetPoint: DiagramPoint | null;
}

export interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

export interface DiagramSvgBudget {
  nodes: number;
  textUnits: number;
}

export type PlantActivityStatement =
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

export interface PlantActivityTheme {
  readonly background: string;
  readonly fill: string;
  readonly stroke: string;
  readonly diamondFill: string;
  readonly diamondStroke: string;
  readonly font: string;
  readonly roundCorner: number;
}

export interface PlantActivityModel {
  readonly title: string;
  readonly statements: readonly PlantActivityStatement[];
  readonly theme: PlantActivityTheme;
  readonly unsupported: number;
}

export type PlantLayoutNodeKind = "start" | "stop" | "action" | "decision" | "join";

export interface PlantLayoutNode {
  readonly kind: PlantLayoutNodeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

export interface PlantLayoutEdge {
  readonly points: readonly DiagramPoint[];
  readonly label: string;
}

export interface PlantBlockLayout {
  readonly width: number;
  readonly height: number;
  readonly entry: DiagramPoint | null;
  readonly exit: DiagramPoint | null;
  readonly nodes: readonly PlantLayoutNode[];
  readonly edges: readonly PlantLayoutEdge[];
}

export type NotebookCellModel =
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

export type NotebookOutputModel =
  | { readonly kind: "stream"; readonly name: "stdout" | "stderr"; readonly text: string }
  | { readonly kind: "error"; readonly ename: string; readonly evalue: string; readonly traceback: string }
  | {
    readonly kind: "display";
    readonly executionCount: number | null;
    readonly data: NotebookMimeBundle;
  }
  | { readonly kind: "unsupported" };

export interface NotebookParseBudget {
  sourceUnits: number;
  outputCount: number;
  outputTextUnits: number;
  attachmentCount: number;
  limited: boolean;
}

export interface NotebookRenderBudget {
  htmlUnits: number;
  outputTextUnits: number;
  imageBytes: number;
  domNodes: number;
  limited: boolean;
}

export interface OfficeDomBudget {
  remainingNodes: number;
  remainingTextUnits: number;
}

export interface DocxPaginationClock {
  sliceEndsAt: number;
}

export type DocxBlockSplitResult =
  | { readonly kind: "split"; readonly remainder: HTMLElement | null; readonly oversized: boolean }
  | { readonly kind: "budget" }
  | null;

export interface XlsxWorksheetMeta {
  readonly name: string;
  readonly path: string;
}

export interface ParsedXlsxWorksheet {
  readonly cells: ReadonlyMap<number, ReadonlyMap<number, XlsxPreviewCell>>;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columnWidths: ReadonlyMap<number, number>;
  readonly mergedFollowers: ReadonlySet<number>;
  readonly truncated: boolean;
}

export interface XlsxSharedStrings {
  readonly values: readonly string[];
  readonly truncated: boolean;
}

export interface XlsxCellStyle {
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

export interface XlsxPreviewCell {
  readonly text: string;
  readonly style: XlsxCellStyle | null;
}

export interface XlsxStyleTable {
  readonly cellStyles: readonly XlsxCellStyle[];
  readonly truncated: boolean;
}

export interface XlsxRange {
  readonly startRow: number;
  readonly startColumn: number;
  readonly endRow: number;
  readonly endColumn: number;
}

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

export interface MainPreviewGitDiffView extends MainPreviewFileBase {
  readonly kind: "git-diff";
  readonly sourcePath: string;
  readonly content: string;
  readonly truncated: boolean;
  readonly shortHash: string;
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
  readonly previewNotice?: typeof POWERPOINT_FULL_FIDELITY_NOTICE;
}

export interface MainPreviewModelResource {
  readonly uri: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly bytes: Uint8Array;
}

export interface MainPreviewModelView extends MainPreviewFileBase {
  readonly kind: "model";
  readonly mimeType: typeof GLTF_JSON_PREVIEW_MIME | typeof GLTF_BINARY_PREVIEW_MIME;
  readonly sizeBytes: number;
  readonly bytes: Uint8Array;
  readonly version: string;
  readonly resources: readonly MainPreviewModelResource[];
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
  | MainPreviewGitDiffView
  | MainPreviewEmptyView
  | MainPreviewMediaView
  | MainPreviewModelView
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

export interface SuppressedAttributes {
  readonly inert: string | null;
  readonly ariaHidden: string | null;
  readonly opacity: string;
  readonly opacityPriority: string;
}

export interface PdfPreviewJob {
  readonly generation: number;
  data: Uint8Array | null;
  loadingTask: PDFDocumentLoadingTask | null;
  document: PDFDocumentProxy | null;
  renderTask: RenderTask | null;
  pageGeneration: number;
}

export interface NotebookPreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
}

export interface OfficePreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
  viewer: PptxViewer | null;
  legacyPptRoot: Root | null;
  legacyPptWorker: Worker | null;
  nativePptObjectUrl: { readonly url: string; readonly revoke: () => void } | null;
  resourceObserver: MutationObserver | null;
  docxRepairTimer: number | null;
}

export interface DiagramPreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
}

export interface ModelPreviewJob {
  readonly generation: number;
  readonly abortController: AbortController;
  renderer: WebGLRenderer | null;
  controls: OrbitControls | null;
  mixer: AnimationMixer | null;
  modelRoots: Object3D[];
  resizeObserver: ResizeObserver | null;
  animationFrame: number | null;
  contextLostListener: ((event: Event) => void) | null;
  loadingManager: LoadingManager | null;
  modelMemoryScope: ModelMemoryCacheScope | null;
}

export type FocusSnapshot =
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
export interface ModelMemoryCacheScope { registerBuffer(bytes: Uint8Array): string; registerImage(bytes: Uint8Array, mimeType: string): string; owns(url: string): boolean; release(): void; }
