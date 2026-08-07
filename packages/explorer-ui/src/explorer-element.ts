import { ActiveThreadTracker } from "./active-thread";
import { MAIN_SURFACE_SELECTOR } from "./adapters/codex-26.715";
import { assessBootstrapCompatibility, BridgeUnavailableError, ExplorerBridge, ExplorerBridgeError, getBootstrapConfig } from "./bridge";
import { countLoadedTreeMatches, filterLoadedTreeRows, normalizeFileFilter } from "./file-filter";
import { getFileIcon, icons } from "./icons";
import {
  AUDIO_PREVIEWER_ID,
  CSV_PREVIEWER_ID,
  CodeCodexMainPreviewElement,
  DIAGRAM_PREVIEWER_ID,
  GLTF_BINARY_PREVIEW_MIME,
  GLTF_JSON_PREVIEW_MIME,
  IMAGE_PREVIEWER_ID,
  MAIN_PREVIEW_TAG,
  MARKDOWN_PREVIEWER_ID,
  MAX_GLTF_JSON_PREVIEW_BYTES,
  MAX_MODEL_AGGREGATE_BYTES,
  MAX_MODEL_PREVIEW_BYTES,
  MAX_MODEL_RESOURCE_BYTES,
  MAX_MODEL_RESOURCE_COUNT,
  MAX_MODEL_TEXTURE_BYTES,
  MODEL_PREVIEWER_ID,
  ModelPreviewSourceError,
  NATIVE_POWERPOINT_PREVIEW_MIME,
  NOTEBOOK_PREVIEWER_ID,
  OFFICE_PREVIEWER_ID,
  PDF_PREVIEWER_ID,
  registerMainPreviewElement,
  VIDEO_PREVIEWER_ID,
  inspectModelPreviewSource,
  type MainPreviewFileView,
  type MainPreviewLineEnding,
  type MainPreviewModelResource,
} from "./main-preview";
import { dismissExplorerForSession } from "./session-state";
import { styles, TREE_ROW_HEIGHT } from "./styles";
import { parentPath, TreeModel } from "./tree-model";
import type {
  ChangeKind,
  BootstrapConfig,
  ExplorerChange,
  ExplorerContext,
  ExplorerSettings,
  ExplorerViewState,
  FlatTreeRow,
  ListResult,
  TreeNodeInput,
} from "./types";

const OVERSCAN = 8;
const PAGE_SIZE = 500;
const MARQUEE_LONG_PRESS_MS = 280;
const MARQUEE_MOVE_THRESHOLD_PX = 4;
const BOOTSTRAP_RETRY_DELAY_MS = 180;
const PREVIEW_SELECTION_DELAY_MS = 120;
const MAX_PREVIEW_TEXT_UNITS = 65_536;
const MAX_PREVIEW_TABS = 8;
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const CONTEXT_MENU_WIDTH = 208;
const CONTEXT_MENU_MARGIN = 6;
const CONTEXT_MENU_ITEM_HEIGHT = 30;
const CONTEXT_DIALOG_HEIGHT = 164;
const ACTION_NOTICE_DURATION_MS = 2_800;
const DROP_EXPAND_DELAY_MS = 650;
const INTERNAL_DRAG_TYPE = "application/x-code-codex-entry";
const DEFAULT_SETTINGS: ExplorerSettings = { width: 260, collapsed: false, showHidden: true, showIgnored: true };
const SETTINGS_KEY = "code-codex:ui-settings:v1";
const PREVIEWER_SETTINGS_KEY = "code-codex:previewers:v1";
const APPEARANCE_PLUGIN_SETTINGS_KEY = "code-codex:appearance-plugins:v1";
const TRANSPARENT_BACKGROUND_PLUGIN_ID = "code-codex.transparent-background";
const APPEARANCE_PLUGIN_IDS = new Set([TRANSPARENT_BACKGROUND_PLUGIN_ID]);
export const TRANSPARENT_BACKGROUND_ATTRIBUTE = "data-code-codex-transparent-background";
export const TRANSPARENT_BACKGROUND_COLOR_PROPERTY = "--code-codex-window-background";
const TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS = 1_500;
const FORCED_COLORS_QUERY = "(forced-colors: active)";
const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";
const MAX_MEDIA_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 32 * 1024 * 1024;
const MAX_VIDEO_PREVIEW_BYTES = 128 * 1024 * 1024;
const MAX_PDF_PREVIEW_BYTES = 64 * 1024 * 1024;
const MAX_AUDIO_PREVIEW_BYTES = 128 * 1024 * 1024;
const MAX_OFFICE_PREVIEW_BYTES = 64 * 1024 * 1024;
const MAX_NOTEBOOK_PREVIEW_BYTES = 16 * 1024 * 1024;
const MODEL_RESOURCE_MIME_TYPES = new Set([
  "application/gltf-buffer",
  "application/octet-stream",
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type MediaPreviewKind = "image" | "video" | "pdf" | "audio" | "office" | "notebook" | "model";

interface PreviewerDefinition {
  readonly id: string;
  readonly kind: "markdown" | "csv" | "diagram" | MediaPreviewKind;
  readonly title: string;
  readonly iconFileName: string;
  readonly extensions: readonly string[];
}

interface MediaPreviewRoute {
  readonly previewerId: string;
  readonly kind: MediaPreviewKind;
  readonly mimeTypes: readonly string[];
  readonly maxBytes: number;
}

const PREVIEWER_DEFINITIONS: readonly PreviewerDefinition[] = Object.freeze([
  {
    id: MARKDOWN_PREVIEWER_ID,
    kind: "markdown",
    title: "Markdown Preview",
    iconFileName: "README.md",
    extensions: [".md", ".markdown"],
  },
  {
    id: CSV_PREVIEWER_ID,
    kind: "csv",
    title: "CSV Preview",
    iconFileName: "preview.csv",
    extensions: [".csv"],
  },
  {
    id: DIAGRAM_PREVIEWER_ID,
    kind: "diagram",
    title: "Diagram Preview",
    iconFileName: "preview.drawio",
    extensions: [".drawio", ".plantuml"],
  },
  {
    id: IMAGE_PREVIEWER_ID,
    kind: "image",
    title: "Image Preview",
    iconFileName: "preview.png",
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif"],
  },
  {
    id: VIDEO_PREVIEWER_ID,
    kind: "video",
    title: "Video Preview",
    iconFileName: "preview.mp4",
    extensions: [".mp4", ".webm", ".ogv", ".mov", ".m4v"],
  },
  {
    id: PDF_PREVIEWER_ID,
    kind: "pdf",
    title: "PDF Preview",
    iconFileName: "preview.pdf",
    extensions: [".pdf"],
  },
  {
    id: AUDIO_PREVIEWER_ID,
    kind: "audio",
    title: "Audio Preview",
    iconFileName: "preview.mp3",
    extensions: [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"],
  },
  {
    id: OFFICE_PREVIEWER_ID,
    kind: "office",
    title: "Office Preview",
    iconFileName: "preview.docx",
    extensions: [".docx", ".xlsx", ".ppt", ".pptx"],
  },
  {
    id: NOTEBOOK_PREVIEWER_ID,
    kind: "notebook",
    title: "Jupyter Notebook Preview",
    iconFileName: "preview.ipynb",
    extensions: [".ipynb"],
  },
  {
    id: MODEL_PREVIEWER_ID,
    kind: "model",
    title: "3D Model Preview",
    iconFileName: "preview.glb",
    extensions: [".gltf", ".glb"],
  },
]);

const PREVIEWER_IDS = new Set(PREVIEWER_DEFINITIONS.map((previewer) => previewer.id));
const MEDIA_PREVIEW_ROUTES: Readonly<Record<string, MediaPreviewRoute>> = Object.freeze({
  png: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/png"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  jpg: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/jpeg"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  jpeg: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/jpeg"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  gif: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/gif"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  webp: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/webp"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  bmp: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/bmp"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  ico: {
    previewerId: IMAGE_PREVIEWER_ID,
    kind: "image",
    mimeTypes: ["image/x-icon", "image/vnd.microsoft.icon"],
    maxBytes: MAX_IMAGE_PREVIEW_BYTES,
  },
  avif: { previewerId: IMAGE_PREVIEWER_ID, kind: "image", mimeTypes: ["image/avif"], maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  mp4: { previewerId: VIDEO_PREVIEWER_ID, kind: "video", mimeTypes: ["video/mp4"], maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  webm: { previewerId: VIDEO_PREVIEWER_ID, kind: "video", mimeTypes: ["video/webm"], maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  ogv: { previewerId: VIDEO_PREVIEWER_ID, kind: "video", mimeTypes: ["video/ogg"], maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  mov: { previewerId: VIDEO_PREVIEWER_ID, kind: "video", mimeTypes: ["video/quicktime"], maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  m4v: { previewerId: VIDEO_PREVIEWER_ID, kind: "video", mimeTypes: ["video/mp4", "video/x-m4v"], maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  pdf: { previewerId: PDF_PREVIEWER_ID, kind: "pdf", mimeTypes: ["application/pdf"], maxBytes: MAX_PDF_PREVIEW_BYTES },
  mp3: { previewerId: AUDIO_PREVIEWER_ID, kind: "audio", mimeTypes: ["audio/mpeg"], maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  wav: { previewerId: AUDIO_PREVIEWER_ID, kind: "audio", mimeTypes: ["audio/wav"], maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  flac: { previewerId: AUDIO_PREVIEWER_ID, kind: "audio", mimeTypes: ["audio/flac"], maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  m4a: { previewerId: AUDIO_PREVIEWER_ID, kind: "audio", mimeTypes: ["audio/mp4"], maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  ogg: { previewerId: AUDIO_PREVIEWER_ID, kind: "audio", mimeTypes: ["audio/ogg"], maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  aac: { previewerId: AUDIO_PREVIEWER_ID, kind: "audio", mimeTypes: ["audio/aac"], maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  docx: {
    previewerId: OFFICE_PREVIEWER_ID,
    kind: "office",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    maxBytes: MAX_OFFICE_PREVIEW_BYTES,
  },
  xlsx: {
    previewerId: OFFICE_PREVIEWER_ID,
    kind: "office",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    maxBytes: MAX_OFFICE_PREVIEW_BYTES,
  },
  ppt: {
    previewerId: OFFICE_PREVIEWER_ID,
    kind: "office",
    mimeTypes: ["application/vnd.ms-powerpoint", NATIVE_POWERPOINT_PREVIEW_MIME],
    maxBytes: MAX_OFFICE_PREVIEW_BYTES,
  },
  pptx: {
    previewerId: OFFICE_PREVIEWER_ID,
    kind: "office",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    maxBytes: MAX_OFFICE_PREVIEW_BYTES,
  },
  ipynb: {
    previewerId: NOTEBOOK_PREVIEWER_ID,
    kind: "notebook",
    mimeTypes: ["application/x-ipynb+json"],
    maxBytes: MAX_NOTEBOOK_PREVIEW_BYTES,
  },
  gltf: {
    previewerId: MODEL_PREVIEWER_ID,
    kind: "model",
    mimeTypes: [GLTF_JSON_PREVIEW_MIME],
    maxBytes: MAX_GLTF_JSON_PREVIEW_BYTES,
  },
  glb: {
    previewerId: MODEL_PREVIEWER_ID,
    kind: "model",
    mimeTypes: [GLTF_BINARY_PREVIEW_MIME],
    maxBytes: MAX_MODEL_PREVIEW_BYTES,
  },
});

type StateCopy = { title: string; copy: string; action?: string };
type PreviewUnavailableReason = "binary" | "invalid-utf8" | "sensitive" | "previewer-disabled" | "unsupported-type" | "unknown";

interface PreviewTab {
  readonly instanceId: number;
  readonly path: string;
  readonly name: string;
  revision: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  modifiedDuringSave: boolean;
  dirty: boolean;
  view: MainPreviewFileView;
}

interface NormalizedTextPreview {
  kind: "text";
  text: string;
  sizeBytes: number;
  truncated: boolean;
  editable: boolean;
  version?: string;
  lineEnding?: MainPreviewLineEnding;
}

interface NormalizedUnsupportedPreview {
  kind: "unsupported";
  sizeBytes: number;
  truncated: boolean;
  reason: PreviewUnavailableReason;
}

interface NormalizedMediaPreview {
  kind: MediaPreviewKind;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
  modelVersion?: string;
  modelResources?: readonly MainPreviewModelResource[];
}

type NormalizedPreview = NormalizedTextPreview | NormalizedUnsupportedPreview | NormalizedMediaPreview;

interface NormalizedMediaInfo {
  readonly kind: MediaPreviewKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly version: string;
}

interface NormalizedModelResourceInfo {
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly version: string;
}

interface DetachedEditDraft {
  readonly threadId: string;
  readonly path: string;
  readonly name: string;
  readonly draft: string;
  readonly view: MainPreviewFileView;
  readonly bootstrap: Readonly<BootstrapConfig> | undefined;
  readonly expiresAt: number;
}

type ContextMenuAction =
  | "preview"
  | "new-file"
  | "new-folder"
  | "rename"
  | "delete"
  | "copy-relative"
  | "copy-absolute"
  | "reveal"
  | "refresh";

interface ContextMenuTarget {
  readonly kind: "root" | "file" | "directory";
  readonly path: string;
  readonly parentPath: string;
  readonly name: string;
  readonly row?: FlatTreeRow;
}

interface ContextMenuItem {
  readonly action: ContextMenuAction;
  readonly label: string;
  readonly icon: string;
  readonly separatorBefore?: boolean;
  readonly danger?: boolean;
}

type ContextMenuNameAction = "new-file" | "new-folder" | "rename";

type ContextMenuDialog =
  | { readonly kind: "name"; readonly action: ContextMenuNameAction; readonly value: string }
  | { readonly kind: "confirm-delete" }
  | { readonly kind: "confirm-rename"; readonly value: string };

interface ContextMenuAnchor {
  readonly clientX: number;
  readonly clientY: number;
}

interface DragSource {
  readonly path: string;
  readonly parentPath: string;
  readonly name: string;
  readonly kind: "file" | "directory";
}

interface MarqueeState {
  readonly pointerId: number;
  /** Tree-content Y (scrollTop + clientY offset) where the press began. */
  readonly originContentY: number;
  readonly originClientX: number;
  readonly originClientY: number;
  /** Selection captured before the marquee began, for additive (Ctrl) drags. */
  readonly baseSelection: ReadonlySet<string>;
  readonly additive: boolean;
  active: boolean;
}

let detachedEditDraft: DetachedEditDraft | undefined;
let detachedEditDraftTimer: ReturnType<typeof setTimeout> | undefined;
const DETACHED_EDIT_TTL_MS = 10_000;

function clearDetachedEditDraft(): void {
  if (detachedEditDraftTimer) clearTimeout(detachedEditDraftTimer);
  detachedEditDraftTimer = undefined;
  detachedEditDraft = undefined;
}

function previewerCardMarkup(previewer: PreviewerDefinition): string {
  const extensionTags = previewer.extensions.map((extension) => `<span>${extension}</span>`).join("");
  return `
    <article class="preview-extension" data-preview-extension="${previewer.id}">
      <span class="preview-extension-icon" aria-hidden="true">${getFileIcon(previewer.iconFileName).markup}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>${previewer.title}</h4>
          <span class="preview-extension-status">Disabled</span>
        </div>
        <div class="preview-extension-meta">${extensionTags}</div>
      </div>
      <button class="preview-extension-action" type="button">Enable</button>
    </article>
  `;
}

function transparentBackgroundCardMarkup(): string {
  return `
    <article class="preview-extension appearance-extension" data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Transparent Background</h4>
          <span class="preview-extension-status" id="cle-transparent-background-status">Disabled</span>
        </div>
      </div>
      <button class="preview-extension-action" type="button" aria-describedby="cle-transparent-background-status" aria-pressed="false">Enable</button>
    </article>
  `;
}

function mediaPreviewRoute(path: string): MediaPreviewRoute | undefined {
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return undefined;
  return MEDIA_PREVIEW_ROUTES[name.slice(dot + 1).toLocaleLowerCase()];
}

export class CodeCodexElement extends HTMLElement {
  readonly #shadow: ShadowRoot;
  readonly #model = new TreeModel();
  readonly #tracker = new ActiveThreadTracker();
  readonly #changeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #directoryLoads = new Map<string, Promise<void>>();
  readonly #pendingMarks = new Map<string, ChangeKind>();
  #bridge: ExplorerBridge | undefined;
  #unsubscribe: (() => void) | undefined;
  #themeObserver: MutationObserver | undefined;
  #mountObserver: MutationObserver | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #persistTimer: ReturnType<typeof setTimeout> | undefined;
  #refreshCommit: Promise<void> = Promise.resolve();
  #refreshRevision = 0;
  #connected = false;
  #domEventsBound = false;
  #generation = 0;
  #threadId: string | null = null;
  #context: ExplorerContext | undefined;
  #state: ExplorerViewState = "booting";
  #stateDetail = "";
  #rows: FlatTreeRow[] = [];
  #allRowCount = 0;
  #fileFilterQuery = "";
  readonly #filterExpandablePaths = new Set<string>();
  readonly #filterCollapsedPaths = new Set<string>();
  #focusedIndex = 0;
  readonly #previewTabs: PreviewTab[] = [];
  #activePreviewPath: string | null = null;
  #previewSessionRevision = 0;
  #nextPreviewInstanceId = 1;
  #mainPreview: CodeCodexMainPreviewElement | undefined;
  #mainPreviewSurface: HTMLElement | undefined;
  #editingPath: string | null = null;
  #editDraft = "";
  #editError: string | undefined;
  #editSaving = false;
  #editRevision = 0;
  #editSession = 0;
  #queuedThreadSwitch: { threadId: string | null; force: boolean } | undefined;
  #queuedMainPreviewReconcile: { surface: HTMLElement | undefined } | undefined;
  #queuedNativeReconnect: Readonly<BootstrapConfig> | undefined;
  #settings: ExplorerSettings = { ...DEFAULT_SETTINGS };
  #watching = false;
  #typeahead = "";
  #typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
  #requestedPlacement = "inline";
  #inlineParent: Element | undefined;
  #inlineNextSibling: ChildNode | null = null;
  #reparenting = false;
  #nativeReconnectMarker: Readonly<BootstrapConfig> | undefined;
  #dismissed = false;
  #contextMenuTarget: ContextMenuTarget | undefined;
  #contextMenuFocusReturn: HTMLElement | undefined;
  #contextMenuDialog: ContextMenuDialog | undefined;
  #contextMenuAnchor: ContextMenuAnchor | undefined;
  #contextMenuError: string | undefined;
  #contextActionPending = false;
  #actionNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  #dragSource: DragSource | undefined;
  #dropTargetPath: string | undefined;
  #dropExpandTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #selectedPaths = new Set<string>();
  #selectionAnchorIndex = -1;
  // Internal clipboard for file copy/cut operations (not the OS clipboard).
  // Paths are relative to the workspace root; operation is "copy" or "cut".
  #fileClipboard: { paths: string[]; operation: "copy" | "cut" } | undefined;
  #marquee: MarqueeState | undefined;
  #marqueeLongPressTimer: ReturnType<typeof setTimeout> | undefined;
  #suppressNextClick = false;
  readonly #enabledPreviewers = new Set<string>();
  readonly #enabledAppearancePlugins = new Set<string>();
  #appearancePluginPending = false;
  #appearancePluginApplied: boolean | undefined;
  #appearancePluginError: string | undefined;
  #appearanceSyncQueued = false;
  #appearanceHealthPending = false;
  #appearanceHealthTimer: ReturnType<typeof setTimeout> | undefined;
  #appearanceOperation = 0;
  #appearanceRpcTail: Promise<void> = Promise.resolve();
  #previewMarketOpen = false;
  #forcedColorsQuery: MediaQueryList | undefined;
  #reducedTransparencyQuery: MediaQueryList | undefined;

  readonly #treeShell: HTMLElement;
  readonly #frame: HTMLElement;
  readonly #treeSpacer: HTMLElement;
  readonly #treeWindow: HTMLElement;
  readonly #statePanel: HTMLElement;
  readonly #loadingVeil: HTMLElement;
  readonly #projectName: HTMLElement;
  readonly #rootLabel: HTMLElement;
  readonly #masthead: HTMLElement;
  readonly #editModeButton: HTMLButtonElement;
  readonly #statusCode: HTMLElement;
  readonly #previewMarketButton: HTMLButtonElement;
  readonly #previewMarketPopover: HTMLElement;
  readonly #previewMarketCloseButton: HTMLButtonElement;
  readonly #previewerButtons = new Map<string, HTMLButtonElement>();
  readonly #previewerStatuses = new Map<string, HTMLElement>();
  readonly #transparentBackgroundCard: HTMLElement;
  readonly #transparentBackgroundButton: HTMLButtonElement;
  readonly #transparentBackgroundStatus: HTMLElement;
  readonly #liveRegion: HTMLElement;
  readonly #collapseButton: HTMLButtonElement;
  readonly #collapsedTab: HTMLButtonElement;
  readonly #refreshButton: HTMLButtonElement;
  readonly #disableButton: HTMLButtonElement;
  readonly #fileSearchToolbar: HTMLElement;
  readonly #fileFilterInput: HTMLInputElement;
  readonly #fileFilterEmpty: HTMLElement;
  readonly #resizeHandle: HTMLElement;
  readonly #contextMenu: HTMLElement;
  readonly #actionNotice: HTMLElement;
  readonly #marqueeElement: HTMLElement;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    this.#shadow.innerHTML = `
      <style>${styles}</style>
      <div class="frame">
        <div class="activity-bus" aria-hidden="true"></div>
        <header class="masthead" data-root-visible="true">
          <div class="identity">
            <div class="eyebrow"><button class="edit-mode-toggle" type="button" aria-pressed="false" disabled>Read only</button></div>
            <h2 class="project-name">Code-Codex</h2>
            <div class="root-label">Waiting for local task</div>
          </div>
          <div class="masthead-actions">
            <button class="icon-button refresh" type="button" title="Refresh visible directories" aria-label="Refresh visible directories">${icons.refresh}</button>
            <button class="icon-button collapse" type="button" title="Collapse explorer" aria-label="Collapse explorer">${icons.collapse}</button>
            <button class="icon-button disable" type="button" title="Hide until a conversation is selected" aria-label="Hide Code-Codex until a conversation is selected">${icons.close}</button>
          </div>
        </header>
        <div class="file-search-toolbar" hidden>
          <label class="file-search">
            <span class="sr-only">Filter loaded files</span>
            <span class="file-search-icon" aria-hidden="true">${icons.search}</span>
            <input class="file-filter" name="file-filter" type="search" placeholder="Filter files…" aria-label="Filter loaded files" aria-controls="cle-tree" autocomplete="off" spellcheck="false">
          </label>
        </div>
        <div class="tree-shell" id="cle-tree" role="tree" aria-label="Project files" aria-multiselectable="true" tabindex="0">
          <div class="file-filter-empty" role="status" hidden>No loaded files match this filter.</div>
          <div class="tree-spacer"><div class="tree-window"></div><div class="tree-marquee" aria-hidden="true" hidden></div></div>
        </div>
        <section class="state" hidden></section>
        <div class="loading-veil" aria-hidden="true"><span class="loading-chip">Switching project</span></div>
        <footer class="statusbar">
          <div class="preview-market-popover" id="cle-preview-market" role="dialog" aria-modal="false" aria-labelledby="cle-preview-market-title" hidden>
            <div class="preview-market-header">
              <div>
                <h3 id="cle-preview-market-title">Preview Market</h3>
                <p>File preview extensions</p>
              </div>
              <button class="preview-market-close" type="button" title="Close Preview Market" aria-label="Close Preview Market">${icons.close}</button>
            </div>
            <div class="preview-market-list">
              <section class="preview-market-section" aria-labelledby="cle-appearance-section-title">
                <div class="preview-market-section-title" id="cle-appearance-section-title">Appearance</div>
                <div class="preview-market-section-list">${transparentBackgroundCardMarkup()}</div>
              </section>
              <section class="preview-market-section" aria-labelledby="cle-file-preview-section-title">
                <div class="preview-market-section-title" id="cle-file-preview-section-title">File Preview</div>
                <div class="preview-market-section-list">${PREVIEWER_DEFINITIONS.map(previewerCardMarkup).join("")}</div>
              </section>
            </div>
          </div>
          <button class="preview-market-button" type="button" aria-haspopup="dialog" aria-controls="cle-preview-market" aria-expanded="false">${icons.preview}<span>Preview Market</span></button>
          <span class="status-code">WAIT</span>
        </footer>
        <div class="action-notice" hidden></div>
        <div class="context-menu" role="menu" aria-label="Explorer actions" aria-busy="false" hidden></div>
        <div class="resize-handle" role="separator" aria-label="Resize explorer" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="480" aria-valuenow="260" tabindex="0"></div>
      </div>
      <button class="collapsed-tab" type="button" title="Open Code-Codex" aria-label="Open Code-Codex">${icons.collapse}</button>
      <div class="sr-only live-region" aria-live="polite" aria-atomic="true"></div>
    `;

    this.#frame = this.#required<HTMLElement>(".frame");
    this.#treeShell = this.#required<HTMLElement>(".tree-shell");
    this.#treeSpacer = this.#required<HTMLElement>(".tree-spacer");
    this.#treeWindow = this.#required<HTMLElement>(".tree-window");
    this.#statePanel = this.#required<HTMLElement>(".state");
    this.#loadingVeil = this.#required<HTMLElement>(".loading-veil");
    this.#projectName = this.#required<HTMLElement>(".project-name");
    this.#rootLabel = this.#required<HTMLElement>(".root-label");
    this.#masthead = this.#required<HTMLElement>(".masthead");
    this.#editModeButton = this.#required<HTMLButtonElement>(".edit-mode-toggle");
    this.#statusCode = this.#required<HTMLElement>(".status-code");
    this.#previewMarketButton = this.#required<HTMLButtonElement>(".preview-market-button");
    this.#previewMarketPopover = this.#required<HTMLElement>(".preview-market-popover");
    this.#previewMarketCloseButton = this.#required<HTMLButtonElement>(".preview-market-close");
    for (const previewer of PREVIEWER_DEFINITIONS) {
      const card = this.#required<HTMLElement>(`[data-preview-extension="${previewer.id}"]`);
      const button = card.querySelector<HTMLButtonElement>(".preview-extension-action");
      const status = card.querySelector<HTMLElement>(".preview-extension-status");
      if (!button || !status) throw new Error(`Preview Market is missing ${previewer.id}.`);
      this.#previewerButtons.set(previewer.id, button);
      this.#previewerStatuses.set(previewer.id, status);
    }
    this.#transparentBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}"]`);
    this.#transparentBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#transparentBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#liveRegion = this.#required<HTMLElement>(".live-region");
    this.#collapseButton = this.#required<HTMLButtonElement>(".collapse");
    this.#collapsedTab = this.#required<HTMLButtonElement>(".collapsed-tab");
    this.#refreshButton = this.#required<HTMLButtonElement>(".refresh");
    this.#disableButton = this.#required<HTMLButtonElement>(".disable");
    this.#fileSearchToolbar = this.#required<HTMLElement>(".file-search-toolbar");
    this.#fileFilterInput = this.#required<HTMLInputElement>(".file-filter");
    this.#fileFilterEmpty = this.#required<HTMLElement>(".file-filter-empty");
    this.#resizeHandle = this.#required<HTMLElement>(".resize-handle");
    this.#contextMenu = this.#required<HTMLElement>(".context-menu");
    this.#actionNotice = this.#required<HTMLElement>(".action-notice");
    this.#marqueeElement = this.#required<HTMLElement>(".tree-marquee");
  }

  connectedCallback(): void {
    if (this.#connected) return;
    this.#connected = true;
    this.#requestedPlacement = this.dataset.placement || "inline";
    this.#rememberInlineMount();
    this.#settings = this.#readLocalSettings();
    for (const previewer of this.#readEnabledPreviewers()) this.#enabledPreviewers.add(previewer);
    this.#enabledAppearancePlugins.clear();
    for (const plugin of this.#readEnabledAppearancePlugins()) this.#enabledAppearancePlugins.add(plugin);
    this.#appearancePluginApplied = undefined;
    this.#appearancePluginError = undefined;
    this.#renderPreviewMarket();
    this.#applySettings();
    this.#applyResponsivePlacement();
    this.#applyTheme();
    this.#bindDomEvents();

    const bootstrap = this.#nativeReconnectMarker ?? getBootstrapConfig();
    this.#nativeReconnectMarker = bootstrap;
    const compatibility = assessBootstrapCompatibility(bootstrap);
    if (!compatibility.supported) {
      this.#setState("incompatible", compatibility.reason);
      return;
    }

    this.#bridge = new ExplorerBridge(bootstrap.token ?? "");
    this.#unsubscribe = this.#bridge.subscribe((notification) => this.#onNotification(notification.method, notification.params));
    if (!this.#bridge.available) {
      this.#setState("error", "NO_BRIDGE");
      return;
    }
    void this.#start(this.#bridge, this.#generation, bootstrap.manualWorkspace === true);
  }

  disconnectedCallback(): void {
    if (this.#reparenting) return;
    if (!this.#connected) return;
    this.#closeContextMenu(false);
    this.#closePreviewMarket(false);
    this.#clearDragState();
    this.#cancelMarquee();
    this.#preserveDetachedDraft();
    this.#connected = false;
    this.#appearancePluginPending = false;
    this.#appearancePluginApplied = undefined;
    this.#appearancePluginError = undefined;
    this.#appearanceSyncQueued = false;
    this.#appearanceHealthPending = false;
    this.#appearanceOperation += 1;
    this.#queuedThreadSwitch = undefined;
    this.#queuedMainPreviewReconcile = undefined;
    this.#queuedNativeReconnect = undefined;
    this.#generation += 1;
    this.#purgePreviewTabs(false);
    this.#detachMainPreview();
    this.#tracker.stop();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    const bridge = this.#bridge;
    this.#bridge = undefined;
    if (bridge) {
      void this.#stopWatch(bridge).catch(() => undefined);
      bridge.dispose();
    }
    this.#themeObserver?.disconnect();
    this.#themeObserver = undefined;
    this.#mountObserver?.disconnect();
    this.#mountObserver = undefined;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#forcedColorsQuery?.removeEventListener("change", this.#onTransparencyPreferenceChange);
    this.#reducedTransparencyQuery?.removeEventListener("change", this.#onTransparencyPreferenceChange);
    window.removeEventListener("resize", this.#onWindowResize);
    window.removeEventListener("beforeunload", this.#onBeforeUnload);
    window.removeEventListener("pointerdown", this.#onWindowPointerDown, true);
    window.removeEventListener("dragend", this.#onWindowDragEnd, true);
    window.removeEventListener("keydown", this.#onWindowKeyDown, true);
    this.#clearTimers();
  }

  refresh(): void {
    if (!this.#context || this.#state === "loading") return;
    void this.#refreshLoadedDirectories();
  }

  collapse(collapsed = true): void {
    this.#settings = { ...this.#settings, collapsed };
    if (collapsed) {
      this.#closeContextMenu(false);
      this.#closePreviewMarket(false);
    }
    this.#applySettings();
    this.#persistSettings();
    this.#announce(collapsed ? "Explorer collapsed" : "Explorer opened");
    if (!collapsed) {
      this.#renderVisible();
      requestAnimationFrame(() => this.#treeShell.focus());
    }
  }

  async disable(): Promise<void> {
    if (this.#disableButton.disabled) return;
    this.#closeContextMenu(false);
    this.#closePreviewMarket(false);
    if (!this.#leaveEditing("Hide Code-Codex and discard your unsaved changes?")) return;
    this.#disableButton.disabled = true;
    this.#dismissed = true;
    this.#purgePreviewTabs(false);
    dismissExplorerForSession();
    window.dispatchEvent(new Event("code-codex:dismiss"));
    this.#generation += 1;
    this.#tracker.stop();
    const bridge = this.#bridge;
    try {
      if (bridge?.available) {
        try {
          await this.#stopWatch(bridge);
        } finally {
          await this.#clearNativeContext(bridge);
        }
      }
    } catch {
      // Native context clear was attempted in the inner finally. Removal still
      // revokes the renderer surface if the bridge no longer accepts requests.
    } finally {
      this.remove();
    }
  }

  reconcileMount(parent: Element, before: ChildNode | null, placement: "inline" | "drawer", strategy: string): void {
    this.dataset.placement = placement;
    this.dataset.mountStrategy = strategy;
    this.#requestedPlacement = placement;
    const correctlyPlaced = this.parentElement === parent && (before === null || this.nextSibling === before);
    if (!correctlyPlaced) this.#moveHost(parent, before);
    if (placement === "inline") {
      this.#inlineParent = undefined;
      this.#inlineNextSibling = null;
      this.#rememberInlineMount();
    }
    this.#applyResponsivePlacement();
  }

  reconcileMainPreview(surface: HTMLElement | null): void {
    const nextSurface = surface?.isConnected ? surface : undefined;
    const alreadyReconciled = nextSurface === this.#mainPreviewSurface &&
      (!this.#mainPreview || this.#mainPreview.parentElement === nextSurface);
    if (this.#editSaving) {
      this.#queuedMainPreviewReconcile = alreadyReconciled ? undefined : { surface: nextSurface };
      return;
    }
    if (alreadyReconciled) return;
    this.#detachMainPreview();
    this.#mainPreviewSurface = nextSurface;
    if (nextSurface && this.#context && !this.#previewTabs.length && this.#restoreDetachedDraft(this.#context)) return;
    if (nextSurface && this.#previewTabs.length) {
      this.#ensureMainPreview();
      this.#syncMainPreview();
    }
  }

  reconnectNative(bootstrap: Readonly<BootstrapConfig> = getBootstrapConfig()): void {
    if (this.#dismissed) return;
    this.#closeContextMenu(false);
    if (this.#nativeReconnectMarker === bootstrap) {
      this.#queuedNativeReconnect = undefined;
      return;
    }
    if (!this.#connected) {
      this.#queuedNativeReconnect = undefined;
      this.#nativeReconnectMarker = bootstrap;
      return;
    }
    if (this.#editSaving) {
      this.#queuedNativeReconnect = bootstrap;
      this.#announce("Code-Codex will reconnect after the current save finishes");
      return;
    }
    if (this.#editingPath && this.#isEditDirty() &&
      !this.#confirmDiscardEditing("Reconnect Code-Codex and discard your unsaved changes?")) {
      this.#queuedNativeReconnect = bootstrap;
      return;
    }
    this.#queuedNativeReconnect = undefined;
    this.#queuedThreadSwitch = undefined;
    if (this.#editingPath) this.#clearEditing(false);
    this.#flushQueuedMainPreviewReconcile();
    this.#nativeReconnectMarker = bootstrap;
    const compatibility = assessBootstrapCompatibility(bootstrap);

    this.#generation += 1;
    this.#purgePreviewTabs(false);
    this.#refreshRevision += 1;
    this.#clearWorkspaceTimers();
    this.#directoryLoads.clear();
    this.#tracker.stop();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#watching = false;
    this.#threadId = null;
    this.#context = undefined;
    this.#appearancePluginPending = false;
    this.#appearancePluginApplied = undefined;
    this.#appearancePluginError = undefined;
    this.#appearanceSyncQueued = false;
    this.#appearanceHealthPending = false;
    this.#appearanceOperation += 1;
    this.#cancelAppearanceHealthCheck();
    this.#clearTransparentBackgroundPresentation();
    this.#bridge?.dispose();
    this.#bridge = undefined;
    this.#renderAppearancePlugin();

    if (!compatibility.supported) {
      this.#setState("incompatible", compatibility.reason);
      return;
    }

    const bridge = new ExplorerBridge(bootstrap.token ?? "");
    this.#bridge = bridge;
    this.#unsubscribe = bridge.subscribe((notification) => this.#onNotification(notification.method, notification.params));
    if (!bridge.available) {
      this.#setState("error", "NO_BRIDGE");
      return;
    }
    this.#setState("loading");
    void this.#start(bridge, this.#generation, bootstrap.manualWorkspace === true);
  }

  async #start(bridge: ExplorerBridge, generation: number, manualWorkspace: boolean): Promise<void> {
    await this.#syncPersistedAppearance(bridge, true);
    if (!this.#canUseBridge(bridge, generation)) return;
    await this.#loadNativeSettings(bridge, generation);
    if (!this.#canUseBridge(bridge, generation)) return;
    if (manualWorkspace) {
      await this.#switchThread("manual-workspace");
      return;
    }
    this.#tracker.start((threadId) => void this.#switchThread(threadId));
  }

  #required<T extends Element>(selector: string): T {
    const element = this.#shadow.querySelector<T>(selector);
    if (!element) throw new Error(`Explorer template is missing ${selector}.`);
    return element;
  }

  #bindDomEvents(): void {
    if (!this.#domEventsBound) {
      this.#domEventsBound = true;
      this.#collapseButton.addEventListener("click", () => this.collapse(true));
      this.#collapsedTab.addEventListener("click", () => this.collapse(false));
      this.#editModeButton.addEventListener("click", () => this.#toggleEditing());
      this.#previewMarketButton.addEventListener("click", () => this.#togglePreviewMarket());
      this.#previewMarketCloseButton.addEventListener("click", () => this.#closePreviewMarket(true));
      this.#transparentBackgroundButton.addEventListener("click", () => void this.#toggleTransparentBackground());
      for (const previewer of PREVIEWER_DEFINITIONS) {
        this.#previewerButtons.get(previewer.id)?.addEventListener("click", () => this.#togglePreviewer(previewer));
      }
      this.#disableButton.addEventListener("click", () => void this.disable());
      this.#fileFilterInput.addEventListener("input", () => this.#applyFileFilter(this.#fileFilterInput.value));
      this.#fileFilterInput.addEventListener("keydown", (event) => this.#onFileFilterKeyDown(event));
      this.#refreshButton.addEventListener("click", () => this.refresh());
      this.#treeShell.addEventListener("scroll", () => {
        this.#closeContextMenu(false);
        this.#renderVisible();
      });
      this.#treeShell.addEventListener("keydown", (event) => this.#onTreeKeyDown(event));
      this.#treeShell.addEventListener("click", (event) => this.#onTreeClick(event));
      this.#treeShell.addEventListener("dblclick", (event) => this.#onTreeDoubleClick(event));
      this.#treeShell.addEventListener("contextmenu", (event) => this.#onTreeContextMenu(event));
      this.#treeShell.addEventListener("dragstart", (event) => this.#onTreeDragStart(event));
      this.#treeShell.addEventListener("pointerdown", (event) => this.#onTreePointerDown(event));
      this.#treeShell.addEventListener("pointermove", (event) => this.#onTreePointerMove(event));
      this.#treeShell.addEventListener("pointerup", (event) => this.#onTreePointerUp(event));
      this.#treeShell.addEventListener("pointercancel", () => this.#cancelMarquee());
      this.#treeShell.addEventListener("dragover", (event) => this.#onDropZoneDragOver(event, true));
      this.#treeShell.addEventListener("dragleave", (event) => this.#onDropZoneDragLeave(event));
      this.#treeShell.addEventListener("drop", (event) => this.#onDropZoneDrop(event, true));
      this.#masthead.addEventListener("dragover", (event) => this.#onDropZoneDragOver(event, true));
      this.#masthead.addEventListener("dragleave", (event) => this.#onDropZoneDragLeave(event));
      this.#masthead.addEventListener("drop", (event) => this.#onDropZoneDrop(event, true));
      this.#statePanel.addEventListener("contextmenu", (event) => this.#onEmptyStateContextMenu(event));
      this.#statePanel.addEventListener("keydown", (event) => this.#onEmptyStateKeyDown(event));
      this.#contextMenu.addEventListener("click", (event) => this.#onContextMenuClick(event));
      this.#contextMenu.addEventListener("keydown", (event) => this.#onContextMenuKeyDown(event));
      this.#contextMenu.addEventListener("submit", (event) => this.#onContextMenuSubmit(event));
      this.#contextMenu.addEventListener("input", () => this.#clearContextMenuError());
      this.#resizeHandle.addEventListener("pointerdown", (event) => this.#startResize(event));
      this.#resizeHandle.addEventListener("keydown", (event) => this.#onResizeKeyDown(event));
    }
    window.addEventListener("resize", this.#onWindowResize);
    window.addEventListener("beforeunload", this.#onBeforeUnload);
    window.addEventListener("pointerdown", this.#onWindowPointerDown, true);
    window.addEventListener("dragend", this.#onWindowDragEnd, true);
    window.addEventListener("keydown", this.#onWindowKeyDown, true);

    this.#forcedColorsQuery ??= window.matchMedia(FORCED_COLORS_QUERY);
    this.#reducedTransparencyQuery ??= window.matchMedia(REDUCED_TRANSPARENCY_QUERY);
    this.#forcedColorsQuery.addEventListener("change", this.#onTransparencyPreferenceChange);
    this.#reducedTransparencyQuery.addEventListener("change", this.#onTransparencyPreferenceChange);
    this.#renderAppearancePlugin();

    this.#themeObserver = new MutationObserver(() => {
      this.#applyTheme();
      if (
        this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) &&
        !this.#transparentBackgroundPresentation()
      ) {
        this.#scheduleAppearanceHealthCheck(0);
      }
    });
    this.#themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style", TRANSPARENT_BACKGROUND_ATTRIBUTE],
    });
    if (document.body) this.#themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

    if (typeof ResizeObserver !== "undefined") {
      this.#resizeObserver = new ResizeObserver(() => this.#renderVisible());
      this.#resizeObserver.observe(this.#treeShell);
    }
  }

  #applyFileFilter(value: string): void {
    const next = normalizeFileFilter(value);
    if (next === this.#fileFilterQuery) return;
    this.#fileFilterQuery = next;
    this.#resetFilterPresentation();
    this.#clearSelection(false);
    this.#rows = [];
    this.#focusedIndex = 0;
    this.#treeShell.scrollTop = 0;
    this.#renderTree();
    const matches = countLoadedTreeMatches(this.#model.flatten(true), next);
    this.#announce(next ? (matches === 1 ? "1 loaded item matches" : `${matches} loaded items match`) : "File filter cleared");
  }

  #onFileFilterKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" && this.#rows.length > 0) {
      event.preventDefault();
      this.#focusIndex(0);
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (this.#fileFilterQuery || this.#fileFilterInput.value) {
      this.#clearFileFilter(true);
      this.#announce("File filter cleared");
    } else {
      this.#treeShell.focus();
    }
  }

  #clearFileFilter(render: boolean): void {
    const changed = Boolean(this.#fileFilterQuery || this.#fileFilterInput.value);
    this.#fileFilterQuery = "";
    this.#fileFilterInput.value = "";
    this.#resetFilterPresentation();
    if (!render || !changed) return;
    this.#clearSelection(false);
    this.#rows = [];
    this.#focusedIndex = 0;
    this.#treeShell.scrollTop = 0;
    this.#renderTree();
  }

  #resetFilterPresentation(): void {
    this.#filterExpandablePaths.clear();
    this.#filterCollapsedPaths.clear();
  }

  #applyTheme(): void {
    const sources = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
    const explicit = sources.map((source) => source.dataset.theme).find((theme) => theme === "dark" || theme === "light");
    const classDark = sources.some((source) => /(^|\s)dark(\s|$)/i.test(source.className));
    if (explicit) this.dataset.theme = explicit;
    else if (classDark) this.dataset.theme = "dark";
    else delete this.dataset.theme;
    this.#mirrorThemeToMainPreview();
  }

  #mirrorThemeToMainPreview(preview = this.#mainPreview): void {
    if (!preview) return;
    const theme = this.dataset.theme;
    if (theme === "dark" || theme === "light") preview.dataset.theme = theme;
    else delete preview.dataset.theme;
  }

  #onWindowResize = (): void => {
    this.#closeContextMenu(false);
    const marketHasFocus = this.#previewMarketPopover.contains(this.#shadow.activeElement);
    this.#closePreviewMarket(marketHasFocus);
    this.#applyResponsivePlacement();
    this.#applySettings();
    this.#renderVisible();
  };

  #onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.#isEditDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };

  #onWindowPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (!this.#contextMenu.hidden && !path.includes(this.#contextMenu)) this.#closeContextMenu(false);
    if (!this.#previewMarketPopover.hidden && !path.includes(this.#previewMarketPopover) && !path.includes(this.#previewMarketButton)) {
      this.#closePreviewMarket(false);
    }
  };

  #onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.#previewMarketOpen) return;
    event.preventDefault();
    event.stopPropagation();
    this.#closePreviewMarket(true);
  };

  #onTransparencyPreferenceChange = (): void => {
    this.#renderAppearancePlugin();
    const bridge = this.#bridge;
    if (!bridge?.available || !this.#connected || this.#dismissed) return;
    if (this.#appearancePluginPending) {
      this.#appearanceSyncQueued = true;
      return;
    }
    void this.#syncPersistedAppearance(bridge, true);
  };

  #onWindowDragEnd = (): void => {
    this.#clearDragState();
  };

  #applyResponsivePlacement(): void {
    const inlineHidden = this.#inlineParent ? this.#isHidden(this.#inlineParent) : false;
    const drawer = window.innerWidth <= 820 || inlineHidden || this.#requestedPlacement === "drawer";
    this.dataset.placement = drawer ? "drawer" : this.#requestedPlacement;
    if (drawer && this.parentElement !== document.body && document.body) {
      this.#moveHost(document.body, null);
    } else if (!drawer && this.#inlineParent?.isConnected && this.parentElement !== this.#inlineParent) {
      const before = this.#inlineNextSibling?.parentNode === this.#inlineParent ? this.#inlineNextSibling : null;
      this.#moveHost(this.#inlineParent, before);
    }
  }

  #rememberInlineMount(): void {
    if (this.#requestedPlacement === "drawer" || !this.parentElement || this.parentElement === document.body) return;
    this.#inlineParent = this.parentElement;
    this.#inlineNextSibling = this.nextSibling;
    this.#mountObserver?.disconnect();
    this.#mountObserver = new MutationObserver(() => this.#applyResponsivePlacement());
    this.#mountObserver.observe(this.#inlineParent, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
  }

  #isHidden(element: Element): boolean {
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current);
      if ((current as HTMLElement).hidden || style.display === "none" || style.visibility === "hidden") return true;
      current = current.parentElement;
    }
    return false;
  }

  #moveHost(parent: Element, before: ChildNode | null): void {
    this.#reparenting = true;
    try {
      parent.insertBefore(this, before);
    } finally {
      this.#reparenting = false;
    }
  }

  async #switchThread(threadId: string | null, force = false): Promise<void> {
    this.#closeContextMenu(false);
    if (!force && threadId === this.#threadId && this.#context) {
      this.#queuedThreadSwitch = undefined;
      return;
    }
    if (this.#editSaving) {
      this.#queuedThreadSwitch = { threadId, force };
      this.#announce("Task switch queued until the current save finishes");
      return;
    }
    if (!this.#leaveEditing("Switch tasks and discard your unsaved changes?")) {
      this.#queuedThreadSwitch = { threadId, force };
      return;
    }
    this.#purgePreviewTabs(false);
    const selectionChanged = threadId !== this.#threadId;
    if (selectionChanged) {
      this.#clearFileFilter(false);
      this.#clearSelection(false);
      if (this.#allRowCount > 0) this.#renderTree();
    }
    const generation = ++this.#generation;
    this.#clearWorkspaceTimers();
    this.#threadId = threadId;
    this.#context = undefined;

    const bridge = this.#bridge;
    if (!bridge) {
      this.#setState("error", "NO_BRIDGE");
      return;
    }

    this.#setState("loading");
    try {
      await this.#stopWatch(bridge);
      if (generation !== this.#generation) return;

      if (!threadId) {
        await this.#clearNativeContext(bridge);
        if (generation !== this.#generation) return;
        this.#showNoProject();
        return;
      }

      const rawContext = await this.#requestBootstrap<unknown>(bridge, generation, "explorer.context", { threadId });
      if (generation !== this.#generation) return;
      const context = normalizeContext(rawContext, threadId);
      if (!context.compatible) {
        this.#setState("incompatible", context.reason ?? "This Codex version is not supported.");
        return;
      }
      this.#context = context;
      this.#setHeader(context.projectName, context.rootName);

      try {
        await bridge.request("explorer.watch.start", {});
        if (generation !== this.#generation) return;
        this.#watching = true;
      } catch {
        if (generation !== this.#generation) return;
        this.#watching = false;
      }

      const rawList = await this.#requestBootstrap<unknown>(bridge, generation, "explorer.list", { relativePath: "", limit: PAGE_SIZE });
      if (generation !== this.#generation) return;
      const list = normalizeList(rawList);
      this.#model.reset();
      this.#model.beginLoad("");
      this.#model.commitLoad("", list);
      this.#setState("ready");
      this.#renderTree();
      if (!this.#restoreDetachedDraft(context)) this.#announce(`${context.projectName} loaded`);
    } catch (error) {
      if (generation !== this.#generation) return;
      if (error instanceof ExplorerBridgeError && error.code === "NO_CONTEXT") {
        try {
          await this.#stopWatch(bridge);
          await this.#clearNativeContext(bridge);
          if (generation !== this.#generation) return;
          this.#showNoProject();
        } catch (clearError) {
          if (generation === this.#generation) this.#setState("error", errorCode(clearError));
        }
      } else if (error instanceof ExplorerBridgeError && error.code === "UNSUPPORTED_VERSION") {
        this.#setState("incompatible", error.message);
      } else {
        this.#setState("error", errorCode(error));
      }
    }
  }

  async #requestBootstrap<T>(
    bridge: ExplorerBridge,
    generation: number,
    method: "explorer.context" | "explorer.list",
    params: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await bridge.request<T>(method, params);
    } catch (error) {
      if (!isTransientBootstrapError(error) || !this.#canRetryBootstrap(bridge, generation)) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
      if (!this.#canRetryBootstrap(bridge, generation)) throw error;
      return bridge.request<T>(method, params);
    }
  }

  #canRetryBootstrap(bridge: ExplorerBridge, generation: number): boolean {
    return this.#canUseBridge(bridge, generation);
  }

  #canUseBridge(bridge: ExplorerBridge, generation: number): boolean {
    return this.#connected && !this.#dismissed && this.#generation === generation && this.#bridge === bridge;
  }

  #canUseAppearanceBridge(bridge: ExplorerBridge): boolean {
    return this.#connected && !this.#dismissed && this.#bridge === bridge;
  }

  async #stopWatch(bridge = this.#bridge): Promise<void> {
    const wasWatching = this.#watching;
    this.#watching = false;
    if (wasWatching && bridge?.available) await bridge.request("explorer.watch.stop", {});
  }

  async #clearNativeContext(bridge: ExplorerBridge): Promise<void> {
    await bridge.request("explorer.context.clear", {});
  }

  #showNoProject(): void {
    this.#context = undefined;
    this.#purgePreviewTabs(false);
    this.#model.reset();
    this.#clearSelection(false);
    this.#rows = [];
    this.#allRowCount = 0;
    this.#setHeader("Code-Codex", "No local project detected");
    this.#setState("no-project");
  }

  async #loadDirectory(path: string, append = false, waitForExisting = false): Promise<void> {
    const existing = this.#directoryLoads.get(path);
    if (existing) {
      if (!waitForExisting) return;
      await existing;
      return this.#loadDirectory(path, append, false);
    }
    const load = this.#performDirectoryLoad(path, append);
    this.#directoryLoads.set(path, load);
    try {
      await load;
    } finally {
      if (this.#directoryLoads.get(path) === load) this.#directoryLoads.delete(path);
    }
  }

  async #performDirectoryLoad(path: string, append: boolean): Promise<void> {
    const bridge = this.#bridge;
    if (!bridge || !this.#context) return;
    const cursor = append ? this.#model.getNextCursor(path) : undefined;
    if (append && !cursor) return;
    if (!this.#model.beginLoad(path, append)) return;
    const generation = this.#generation;
    this.#renderTree();
    try {
      const params: Record<string, unknown> = { relativePath: path, limit: PAGE_SIZE };
      if (cursor) params.cursor = cursor;
      const raw = await bridge.request<unknown>("explorer.list", params);
      if (generation !== this.#generation) return;
      this.#model.commitLoad(path, normalizeList(raw), append);
      for (const [markedPath, kind] of this.#pendingMarks) {
        if (parentPath(markedPath) === path) {
          this.#model.markChange(markedPath, kind);
          this.#pendingMarks.delete(markedPath);
        }
      }
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#model.failLoad(path, friendlyError(error));
      if (path === "") this.#setState("error", errorCode(error));
    } finally {
      this.#renderTree();
    }
  }

  #refreshLoadedDirectories(): Promise<void> {
    const revision = ++this.#refreshRevision;
    const refresh = this.#refreshCommit
      .catch(() => undefined)
      .then(() => revision === this.#refreshRevision ? this.#runDirectoryRefresh() : undefined);
    this.#refreshCommit = refresh;
    return refresh;
  }

  async #runDirectoryRefresh(): Promise<void> {
    if (!this.#context) return;
    const directories = this.#model.loadedDirectories();
    this.dataset.busy = "true";
    try {
      // Native lifecycle requests are intentionally serialized. Refresh in the
      // same order so a deep expanded tree cannot overrun the bounded CDP
      // dispatcher when visibility settings or an overflow resync changes.
      for (const path of directories) await this.#loadDirectory(path, false, true);
      this.#announce("Visible directories refreshed");
    } finally {
      this.dataset.busy = "false";
    }
  }

  #onNotification(method: string, params: unknown): void {
    if (method === "explorer.changed") {
      if (!this.#context || this.#state === "loading") return;
      this.#applyChanges(params);
      return;
    }
    if (method === "explorer.context.changed") {
      const object = asRecord(params);
      const threadId = typeof object?.threadId === "string" ? object.threadId : null;
      if (threadId) {
        window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
          detail: { threadId, hostId: "local", kind: "local" },
        }));
      }
      else void this.#switchThread(null);
      return;
    }
    if (method === "explorer.resync") {
      for (const tab of [...this.#previewTabs]) this.#markPreviewModified(tab.path);
      void this.#refreshLoadedDirectories();
      const bridge = this.#bridge;
      if (bridge?.available) void this.#syncPersistedAppearance(bridge, false);
      return;
    }
    if (method === "explorer.incompatible") {
      const object = asRecord(params);
      this.#setState("incompatible", typeof object?.reason === "string" ? object.reason : "This Codex version is not supported.");
    }
  }

  #applyChanges(params: unknown): void {
    const object = asRecord(params);
    const rawChanges = Array.isArray(params) ? params : Array.isArray(object?.changes) ? object.changes : [params];
    const changes = rawChanges.map(normalizeChange).filter((change): change is ExplorerChange => Boolean(change));
    if (!changes.length) return;

    for (const change of changes) {
      const removedPath = change.kind === "renamed" ? (change.fromRelativePath ?? change.relativePath) : change.relativePath;
      if ((change.kind === "deleted" || change.kind === "renamed") && this.#editingPath === removedPath) {
        const tab = this.#previewTabs.find((candidate) => candidate.path === removedPath);
        if (tab) {
          if (this.#editSaving) tab.modifiedDuringSave = true;
          tab.dirty = true;
        }
        this.#editError = "This file was removed or renamed on disk. Your draft is still available.";
        this.#syncMainPreview();
      }
      else if (change.kind === "deleted") this.#closePreviewTab(change.relativePath, false);
      else if (change.kind === "renamed") this.#closePreviewTab(change.fromRelativePath ?? change.relativePath, false);
      else if (change.kind === "modified") this.#markPreviewModified(change.relativePath);
      const affectedParents = this.#model.applyChange(change);
      this.#pendingMarks.set(change.relativePath, change.kind);
      this.#scheduleChangeExpiry(change);
      if (change.kind === "renamed") {
        for (const affectedParent of affectedParents) {
          if (this.#model.hasLoaded(affectedParent)) this.#scheduleRefresh(affectedParent, 170);
        }
      } else if (change.kind === "added" || change.kind === "modified") {
        for (const affectedParent of affectedParents) {
          if (this.#model.hasLoaded(affectedParent)) this.#scheduleRefresh(affectedParent, 170);
        }
      }
    }
    this.#renderTree();
    const summary = changes.length === 1 ? `Project entry ${changes[0]?.kind}` : `${changes.length} project entries changed`;
    this.#announce(summary);
  }

  #scheduleChangeExpiry(change: ExplorerChange): void {
    const existing = this.#changeTimers.get(change.relativePath);
    if (existing) clearTimeout(existing);
    const delay = change.kind === "deleted" ? 2600 : 4200;
    const timer = setTimeout(() => {
      this.#changeTimers.delete(change.relativePath);
      this.#pendingMarks.delete(change.relativePath);
      this.#model.clearChange(change.relativePath, change.kind);
      const parent = parentPath(change.relativePath);
      if (this.#model.hasLoaded(parent)) this.#scheduleRefresh(parent, 0);
      if (change.fromRelativePath) {
        const oldParent = parentPath(change.fromRelativePath);
        if (this.#model.hasLoaded(oldParent)) this.#scheduleRefresh(oldParent, 0);
      }
      this.#renderTree();
    }, delay);
    this.#changeTimers.set(change.relativePath, timer);
  }

  #scheduleRefresh(path: string, delay: number): void {
    const existing = this.#refreshTimers.get(path);
    if (existing) clearTimeout(existing);
    this.#refreshTimers.set(
      path,
      setTimeout(() => {
        this.#refreshTimers.delete(path);
        void this.#loadDirectory(path);
      }, delay),
    );
  }

  #setState(state: ExplorerViewState, detail = ""): void {
    if (state !== "ready") this.#clearDragState();
    if ((state === "error" || state === "incompatible" || state === "no-project") && this.#previewTabs.length) {
      if (this.#isEditDirty()) {
        this.#editError = "Code-Codex stopped before these changes were saved. Your draft is still available.";
        this.#syncMainPreview();
      } else {
        this.#purgePreviewTabs();
      }
    }
    this.#state = state;
    this.#stateDetail = detail;
    this.dataset.state = state;
    this.dataset.busy = state === "loading" || state === "booting" ? "true" : "false";
    const hasOldTree = this.#allRowCount > 0;
    const showTree = state === "ready" || (state === "loading" && hasOldTree);
    this.#fileSearchToolbar.hidden = !showTree;
    this.#treeShell.hidden = !showTree;
    this.#treeShell.dataset.switching = state === "loading" ? "true" : "false";
    this.#treeShell.setAttribute("aria-busy", String(state === "loading" || state === "booting"));
    this.#loadingVeil.setAttribute("aria-hidden", state === "loading" && hasOldTree ? "false" : "true");
    this.#statePanel.hidden = showTree;
    this.#statePanel.tabIndex = state === "empty" ? 0 : -1;
    if (!showTree) this.#fileFilterEmpty.hidden = true;
    if (!showTree) this.#renderStatePanel();
    this.#renderStatus();
  }

  #renderStatePanel(): void {
    const copy = this.#stateCopy();
    this.#statePanel.replaceChildren();
    const mark = document.createElement("div");
    mark.className = "state-mark";
    mark.innerHTML = this.#state === "no-project" || this.#state === "empty" ? icons.folder : icons.warning;
    const title = document.createElement("h3");
    title.className = "state-title";
    title.textContent = copy.title;
    const paragraph = document.createElement("p");
    paragraph.className = "state-copy";
    paragraph.textContent = copy.copy;
    this.#statePanel.append(mark, title, paragraph);
    if (copy.action) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "state-action";
      action.textContent = copy.action;
      action.addEventListener("click", () => {
        if (this.#state === "incompatible") {
          void this.disable();
        }
        else if (this.#threadId) void this.#switchThread(this.#threadId, true);
      });
      this.#statePanel.append(action);
    }
  }

  #stateCopy(): StateCopy {
    if (this.#state === "booting") return { title: "Calibrating explorer", copy: "Connecting the local workspace bridge." };
    if (this.#state === "loading") return { title: "Switching project", copy: "Resolving the selected task and its local workspace." };
    if (this.#state === "no-project") return { title: "No local project", copy: "The selected task is not bound to a local workspace. Choose a local Codex task to show its files." };
    if (this.#state === "empty") return { title: "No visible files", copy: "This project is empty, or all top-level entries are filtered by the workspace rules." };
    if (this.#state === "incompatible") return { title: "Version not supported", copy: this.#stateDetail || "Code-Codex stopped safely because this Codex version has not been verified.", action: "Close explorer" };
    const code = this.#stateDetail;
    if (code === "NO_BRIDGE") {
      return { title: "Explorer is not connected", copy: "Restart Codex using the Code-Codex launcher to enable the local bridge." };
    }
    if (code === "ACCESS_DENIED") return { title: "Project is unavailable", copy: "Windows denied access to this directory. Check the project permissions, then retry.", action: "Retry" };
    if (code === "NOT_FOUND") return { title: "Project moved", copy: "The workspace directory no longer exists at its registered location.", action: "Retry" };
    return { title: "Project could not load", copy: "The local file index did not respond. The Codex interface is unchanged and no files were modified.", action: "Retry" };
  }

  #setHeader(project: string, root: string): void {
    this.#projectName.textContent = project;
    this.#projectName.title = project;
    this.#rootLabel.textContent = root;
    this.#rootLabel.title = root;
    const duplicate = normalizeHeaderLabel(project) === normalizeHeaderLabel(root);
    this.#rootLabel.hidden = duplicate;
    this.#masthead.dataset.rootVisible = String(!duplicate);
  }

  #renderTree(): void {
    const focusedKey = this.#rows[this.#focusedIndex]?.key;
    const allRows = this.#model.flatten();
    const filterSource = this.#fileFilterQuery ? this.#model.flatten(true) : allRows;
    const filteredRows = filterLoadedTreeRows(filterSource, this.#fileFilterQuery);
    if (this.#fileFilterQuery) {
      this.#updateFilterExpandablePaths(filteredRows);
      this.#rows = this.#applyFilterPresentationCollapses(filteredRows);
    } else {
      this.#resetFilterPresentation();
      this.#rows = filteredRows;
    }
    this.#allRowCount = allRows.filter((row) => row.kind === "node").length;
    if (this.#state === "ready" && allRows.length === 0) {
      this.#setState("empty");
      return;
    }
    if (this.#state === "empty" && allRows.length > 0) this.#setState("ready");
    const retainedFocus = focusedKey ? this.#rows.findIndex((row) => row.key === focusedKey) : -1;
    this.#focusedIndex = retainedFocus >= 0 ? retainedFocus : Math.max(0, Math.min(this.#focusedIndex, this.#rows.length - 1));
    const noMatches = Boolean(this.#fileFilterQuery) && this.#rows.length === 0;
    this.#fileFilterEmpty.hidden = !noMatches;
    this.#treeShell.dataset.filterEmpty = String(noMatches);
    if (noMatches) this.#fileFilterEmpty.textContent = `No loaded files match “${this.#fileFilterInput.value.trim()}”.`;
    this.#treeSpacer.style.height = `${Math.max(1, this.#rows.length) * TREE_ROW_HEIGHT}px`;
    this.#renderVisible();
    this.#renderStatus();
  }

  #updateFilterExpandablePaths(rows: FlatTreeRow[]): void {
    this.#filterExpandablePaths.clear();
    for (let index = 0; index < rows.length - 1; index += 1) {
      const row = rows[index];
      const next = rows[index + 1];
      if (
        row?.kind === "node" &&
        row.node?.kind === "directory" &&
        !row.node.inaccessible &&
        next &&
        next.depth > row.depth
      ) {
        this.#filterExpandablePaths.add(row.path);
      }
    }
  }

  #applyFilterPresentationCollapses(rows: FlatTreeRow[]): FlatTreeRow[] {
    const visible: FlatTreeRow[] = [];
    let collapsedDepth: number | undefined;
    for (const row of rows) {
      if (collapsedDepth !== undefined) {
        if (row.depth > collapsedDepth) continue;
        collapsedDepth = undefined;
      }
      visible.push(row);
      if (this.#filterExpandablePaths.has(row.path) && this.#filterCollapsedPaths.has(row.path)) {
        collapsedDepth = row.depth;
      }
    }
    return visible;
  }

  #isFilterExpandable(row: FlatTreeRow): boolean {
    return Boolean(this.#fileFilterQuery && this.#filterExpandablePaths.has(row.path));
  }

  #isFilterExpanded(row: FlatTreeRow): boolean {
    return this.#isFilterExpandable(row) && !this.#filterCollapsedPaths.has(row.path);
  }

  #renderVisible(): void {
    if (this.#treeShell.hidden || this.#settings.collapsed) return;
    this.#updateScrollbarPosition();
    const viewport = this.#treeShell.clientHeight || 420;
    const start = Math.max(0, Math.floor(this.#treeShell.scrollTop / TREE_ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(this.#rows.length, Math.ceil((this.#treeShell.scrollTop + viewport) / TREE_ROW_HEIGHT) + OVERSCAN);
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index += 1) {
      const row = this.#rows[index];
      if (row) fragment.append(this.#createRow(row, index));
    }
    this.#treeWindow.replaceChildren(fragment);
    const active = this.#shadow.getElementById(`cle-row-${this.#focusedIndex}`);
    if (active) this.#treeShell.setAttribute("aria-activedescendant", active.id);
    else this.#treeShell.removeAttribute("aria-activedescendant");
  }

  #updateScrollbarPosition(): void {
    const maxScrollTop = Math.max(0, this.#treeShell.scrollHeight - this.#treeShell.clientHeight);
    const scrollTop = Math.max(0, this.#treeShell.scrollTop);
    const position = maxScrollTop <= 1
      ? "none"
      : scrollTop <= 1
        ? "start"
        : scrollTop >= maxScrollTop - 1
          ? "end"
          : "middle";
    this.#treeShell.dataset.scrollPosition = position;
  }

  #createRow(row: FlatTreeRow, index: number): HTMLElement {
    const element = document.createElement("div");
    element.className = "tree-row";
    element.id = `cle-row-${index}`;
    element.dataset.index = String(index);
    element.style.setProperty("--depth", String(row.depth));
    element.style.top = `${index * TREE_ROW_HEIGHT}px`;
    element.setAttribute("role", "treeitem");
    element.setAttribute("aria-level", String(row.depth));
    element.dataset.active = String(index === this.#focusedIndex);
    element.dataset.contextTarget = String(row.kind === "node" && row.path === this.#contextMenuTarget?.path);
    const selected = row.kind === "node" && this.#selectedPaths.has(row.path);
    element.dataset.selected = String(selected);
    element.setAttribute(
      "aria-selected",
      String(selected || (row.kind === "node" && row.path === this.#activePreviewPath)),
    );

    if (row.kind !== "node" || !row.node) {
      element.dataset.kind = "utility";
      const icon = document.createElement("span");
      icon.className = "node-icon utility";
      icon.textContent = row.kind === "directory-loading" ? "·" : row.kind === "directory-error" ? "!" : "+";
      const name = document.createElement("span");
      name.className = "node-name";
      name.textContent =
        row.kind === "directory-loading" ? "Loading directory…" : row.kind === "directory-error" ? "Directory unavailable — retry" : "Load next page";
      element.append(icon, name);
      if (row.kind === "directory-loading") element.setAttribute("aria-disabled", "true");
      return element;
    }

    const node = row.node;
    const expandable = node.kind === "directory" && !node.inaccessible &&
      (!this.#fileFilterQuery || this.#isFilterExpandable(row));
    element.dataset.path = node.relativePath;
    element.dataset.change = node.change ?? "";
    element.dataset.nodeKind = node.kind;
    element.dataset.inaccessible = String(node.inaccessible === true);
    element.title = node.relativePath;
    const draggable = (node.kind === "file" || node.kind === "directory") &&
      !node.inaccessible && node.change !== "deleted";
    element.draggable = draggable;
    element.dataset.dragSource = String(this.#dragSource?.path === node.relativePath);
    element.dataset.dropTarget = String(
      node.kind === "directory" && this.#dropTargetPath === node.relativePath,
    );
    if (expandable) element.setAttribute("aria-expanded", String(
      this.#fileFilterQuery ? this.#isFilterExpanded(row) : this.#model.isExpanded(node.relativePath),
    ));
    if (node.inaccessible) element.setAttribute("aria-disabled", "true");

    const leading = document.createElement("span");
    if (expandable) {
      leading.className = "twisty";
      leading.dataset.action = "toggle";
      leading.innerHTML = icons.chevron;
    } else {
      leading.className = `node-icon ${node.inaccessible ? "inaccessible" : node.kind}`;
      if (node.inaccessible) {
        leading.innerHTML = icons.lock;
      } else if (node.kind === "directory") {
        leading.innerHTML = icons.folder;
      } else if (node.kind === "symlink") {
        leading.innerHTML = icons.link;
      } else {
        const fileIcon = getFileIcon(node.name);
        leading.dataset.iconKind = fileIcon.kind;
        leading.dataset.iconCategory = fileIcon.category;
        leading.innerHTML = fileIcon.markup;
      }
    }
    const name = document.createElement("span");
    name.className = "node-name";
    name.textContent = node.name;
    element.append(leading, name);

    if (node.change) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.dataset.change = node.change;
      badge.textContent = ({ added: "A", modified: "M", deleted: "D", renamed: "R" } as const)[node.change];
      badge.title = `${node.change[0]?.toUpperCase()}${node.change.slice(1)}`;
      badge.setAttribute("aria-label", badge.title);
      element.append(badge);
    }
    return element;
  }

  #onTreeClick(event: MouseEvent): void {
    this.#closeContextMenu(false);
    if (this.#suppressNextClick) {
      this.#suppressNextClick = false;
      return;
    }
    const target = event.target as Element | null;
    const element = target?.closest<HTMLElement>(".tree-row");
    if (!element || !this.#treeWindow.contains(element)) return;
    const index = Number(element.dataset.index);
    if (!Number.isInteger(index)) return;
    const row = this.#rows[index];
    if (!row) return;

    // The disclosure triangle only expands or collapses; it never changes selection.
    if (row.kind === "node" && target?.closest('[data-action="toggle"]')) {
      this.#focusIndex(index, false);
      this.#toggleDirectory(row);
      return;
    }

    const additive = event.ctrlKey || event.metaKey;
    const range = event.shiftKey;
    if ((additive || range) && row.kind === "node") {
      if (range) this.#selectRangeTo(index);
      else this.#toggleSelectionAt(index);
      this.#focusIndex(index, false);
      return;
    }

    this.#focusIndex(index, false);
    if (row.kind === "node") this.#setSingleSelection(row.path, index);
    else this.#clearSelection(false);

    if (row.kind !== "node") {
      this.#activateRow(row);
    } else if (row.node?.kind === "file") {
      this.#openPreviewTab(row);
    }
  }

  #onTreeDoubleClick(event: MouseEvent): void {
    const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
    const index = Number(element?.dataset.index);
    const row = this.#rows[index];
    if (row?.kind === "node" && row.node?.kind === "directory") this.#toggleDirectory(row);
  }

  #selectableRow(index: number): FlatTreeRow | undefined {
    const row = this.#rows[index];
    return row?.kind === "node" ? row : undefined;
  }

  #setSingleSelection(path: string, index: number): void {
    this.#selectedPaths.clear();
    this.#selectedPaths.add(path);
    this.#selectionAnchorIndex = index;
    this.#syncSelectionDom();
  }

  #toggleSelectionAt(index: number): void {
    const row = this.#selectableRow(index);
    if (!row) return;
    if (this.#selectedPaths.has(row.path)) this.#selectedPaths.delete(row.path);
    else this.#selectedPaths.add(row.path);
    this.#selectionAnchorIndex = index;
    this.#syncSelectionDom();
    this.#announceSelectionCount();
  }

  #selectRangeTo(index: number): void {
    const anchor = this.#selectionAnchorIndex >= 0 ? this.#selectionAnchorIndex : this.#focusedIndex;
    const start = Math.min(anchor, index);
    const end = Math.max(anchor, index);
    this.#selectedPaths.clear();
    for (let cursor = start; cursor <= end; cursor += 1) {
      const row = this.#selectableRow(cursor);
      if (row) this.#selectedPaths.add(row.path);
    }
    this.#syncSelectionDom();
    this.#announceSelectionCount();
  }

  #clearSelection(sync = true): void {
    if (!this.#selectedPaths.size && this.#selectionAnchorIndex < 0) return;
    this.#selectedPaths.clear();
    this.#selectionAnchorIndex = -1;
    if (sync) this.#syncSelectionDom();
  }

  #updateSelectionAfterKeyNav(extend: boolean): void {
    const row = this.#selectableRow(this.#focusedIndex);
    if (extend) {
      this.#selectRangeTo(this.#focusedIndex);
    } else if (row) {
      this.#setSingleSelection(row.path, this.#focusedIndex);
    } else {
      this.#clearSelection(true);
    }
  }

  #selectAll(): void {
    const paths = this.#rows.filter((row) => row.kind === "node").map((row) => row.path);
    if (!paths.length) return;
    this.#selectedPaths.clear();
    for (const path of paths) this.#selectedPaths.add(path);
    const first = this.#rows.findIndex((row) => row.kind === "node");
    if (first >= 0) this.#selectionAnchorIndex = first;
    this.#syncSelectionDom();
    this.#announce(`All ${paths.length} loaded items selected`);
  }

  #syncSelectionDom(): void {
    for (const element of this.#treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
      const path = element.dataset.path;
      const selected = path !== undefined && this.#selectedPaths.has(path);
      element.dataset.selected = String(selected);
      element.setAttribute(
        "aria-selected",
        String(selected || (path !== undefined && path === this.#activePreviewPath)),
      );
    }
  }

  #announceSelectionCount(): void {
    const count = this.#selectedPaths.size;
    if (count > 1) this.#announce(`${count} items selected`);
  }

  #onTreePointerDown(event: PointerEvent): void {
    this.#cancelMarquee();
    if (event.button !== 0 || event.pointerType === "touch") return;
    // Shift extends an existing selection through the click handler, never a marquee.
    if (event.shiftKey) return;
    if (this.#state !== "ready" || this.#settings.collapsed) return;
    // Ignore presses on the native scrollbar gutter (past the content width).
    if (event.clientX - this.#treeShell.getBoundingClientRect().left > this.#treeShell.clientWidth) return;
    const target = event.target as Element | null;
    const overRow = target?.closest<HTMLElement>(".tree-row");
    // A press that lands on a row belongs to click/drag handling; only empty
    // space in the scroller starts a marquee immediately. A press on a row can
    // still promote to a marquee after the long-press threshold elapses.
    const additive = event.ctrlKey || event.metaKey;
    const originContentY = this.#treeShell.scrollTop + this.#contentOffsetY(event.clientY);
    const marquee: MarqueeState = {
      pointerId: event.pointerId,
      originContentY,
      originClientX: event.clientX,
      originClientY: event.clientY,
      baseSelection: new Set(additive ? this.#selectedPaths : []),
      additive,
      active: false,
    };
    this.#marquee = marquee;
    if (overRow) {
      // Defer: rows are draggable, so a quick press-and-move is a move gesture.
      // Only a stationary long press converts into a marquee.
      this.#marqueeLongPressTimer = setTimeout(() => {
        this.#marqueeLongPressTimer = undefined;
        if (this.#marquee === marquee && !marquee.active) this.#beginMarquee(marquee, event.clientX, event.clientY);
      }, MARQUEE_LONG_PRESS_MS);
    } else {
      this.#beginMarquee(marquee, event.clientX, event.clientY);
    }
  }

  #beginMarquee(marquee: MarqueeState, clientX: number, clientY: number): void {
    if (this.#marquee !== marquee || marquee.active) return;
    marquee.active = true;
    try {
      this.#treeShell.setPointerCapture(marquee.pointerId);
    } catch {
      // Pointer capture is best-effort; the window pointercancel still cleans up.
    }
    if (!marquee.additive) this.#clearSelection(true);
    this.#marqueeElement.hidden = false;
    this.#updateMarquee(clientX, clientY);
  }

  #onTreePointerMove(event: PointerEvent): void {
    const marquee = this.#marquee;
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    if (!marquee.active) {
      const moved = Math.abs(event.clientX - marquee.originClientX) + Math.abs(event.clientY - marquee.originClientY);
      // Movement before the long press means the user is dragging a row to move
      // it, not drawing a marquee — stand down and let the native drag proceed.
      if (moved > MARQUEE_MOVE_THRESHOLD_PX) this.#cancelMarquee();
      return;
    }
    event.preventDefault();
    this.#updateMarquee(event.clientX, event.clientY);
  }

  #onTreePointerUp(event: PointerEvent): void {
    const marquee = this.#marquee;
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    const wasActive = marquee.active;
    this.#cancelMarquee();
    // A completed marquee must not also fire the row's click handler.
    if (wasActive) {
      event.preventDefault();
      this.#suppressNextClick = true;
      this.#announceSelectionCount();
    }
  }

  #cancelMarquee(): void {
    if (this.#marqueeLongPressTimer) clearTimeout(this.#marqueeLongPressTimer);
    this.#marqueeLongPressTimer = undefined;
    const marquee = this.#marquee;
    this.#marquee = undefined;
    if (!marquee) return;
    if (marquee.active) {
      try {
        this.#treeShell.releasePointerCapture(marquee.pointerId);
      } catch {
        // Already released or never captured.
      }
    }
    this.#marqueeElement.hidden = true;
    this.#marqueeElement.style.removeProperty("top");
    this.#marqueeElement.style.removeProperty("height");
  }

  #contentOffsetY(clientY: number): number {
    return clientY - this.#treeShell.getBoundingClientRect().top;
  }

  #updateMarquee(clientX: number, clientY: number): void {
    const marquee = this.#marquee;
    if (!marquee?.active) return;
    const rect = this.#treeShell.getBoundingClientRect();
    // Auto-scroll when the pointer is dragged past either vertical edge.
    const edge = 18;
    if (clientY < rect.top + edge) this.#treeShell.scrollTop -= edge;
    else if (clientY > rect.bottom - edge) this.#treeShell.scrollTop += edge;

    const pointerContentY = this.#treeShell.scrollTop + (clientY - rect.top);
    const maxContentY = Math.max(0, this.#rows.length * TREE_ROW_HEIGHT);
    const top = Math.max(0, Math.min(marquee.originContentY, pointerContentY));
    const bottom = Math.min(maxContentY, Math.max(marquee.originContentY, pointerContentY));
    this.#marqueeElement.style.top = `${top}px`;
    this.#marqueeElement.style.height = `${Math.max(0, bottom - top)}px`;

    const startIndex = Math.max(0, Math.floor(top / TREE_ROW_HEIGHT));
    const endIndex = Math.min(this.#rows.length - 1, Math.floor((bottom - 0.001) / TREE_ROW_HEIGHT));
    const next = new Set<string>(marquee.baseSelection);
    if (bottom > top) {
      for (let index = startIndex; index <= endIndex; index += 1) {
        const row = this.#selectableRow(index);
        if (row) next.add(row.path);
      }
    }
    this.#selectedPaths.clear();
    for (const path of next) this.#selectedPaths.add(path);
    if (endIndex >= startIndex) this.#selectionAnchorIndex = startIndex;
    this.#renderVisible();
  }

  #onTreeDragStart(event: DragEvent): void {
    const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
    const index = Number(element?.dataset.index);
    const row = this.#rows[index];
    const target = row ? this.#contextTargetForRow(row) : undefined;
    if (
      !element ||
      !this.#treeWindow.contains(element) ||
      !target ||
      target.kind === "root" ||
      !event.dataTransfer ||
      this.#contextActionPending ||
      this.#state !== "ready" ||
      !this.#context ||
      !this.#bridge?.available
    ) {
      event.preventDefault();
      return;
    }

    this.#closeContextMenu(false);
    this.#hideActionNotice();
    this.#cancelMarquee();
    this.#clearDragState();
    this.#dragSource = {
      path: target.path,
      parentPath: target.parentPath,
      name: target.name,
      kind: target.kind,
    };
    element.dataset.dragSource = "true";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(INTERNAL_DRAG_TYPE, target.path);
    event.dataTransfer.setData("text/plain", target.path);
  }

  #onDropZoneDragOver(event: DragEvent, allowRoot: boolean): void {
    const source = this.#dragSource;
    if (!source) return;
    const destination = this.#dropDestination(event, allowRoot);
    if (destination === undefined || !this.#canDrop(source, destination)) {
      this.#setDropTarget(undefined);
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.#setDropTarget(destination);
  }

  #onDropZoneDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (zone && related && zone.contains(related)) return;
    this.#setDropTarget(undefined);
  }

  #onDropZoneDrop(event: DragEvent, allowRoot: boolean): void {
    const source = this.#dragSource;
    const destination = source ? this.#dropDestination(event, allowRoot) : undefined;
    if (!source || destination === undefined || !this.#canDrop(source, destination)) {
      this.#clearDragState();
      return;
    }
    event.preventDefault();
    this.#clearDragState();
    void this.#moveEntryByDrop(source, destination);
  }

  #dropDestination(event: DragEvent, allowRoot: boolean): string | undefined {
    const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
    if (element && this.#treeWindow.contains(element)) {
      const index = Number(element.dataset.index);
      const row = Number.isInteger(index) ? this.#rows[index] : undefined;
      const target = row ? this.#contextTargetForRow(row) : undefined;
      return target?.kind === "directory" ? target.path : undefined;
    }
    return allowRoot ? "" : undefined;
  }

  #canDrop(source: DragSource, destinationParentPath: string): boolean {
    if (
      this.#contextActionPending ||
      this.#state !== "ready" ||
      !this.#context ||
      !this.#bridge?.available ||
      source.parentPath === destinationParentPath
    ) {
      return false;
    }
    return source.kind !== "directory" || !isPathWithin(source.path, destinationParentPath);
  }

  #setDropTarget(path: string | undefined): void {
    if (this.#dropTargetPath === path) return;
    if (this.#dropExpandTimer) clearTimeout(this.#dropExpandTimer);
    this.#dropExpandTimer = undefined;
    this.#dropTargetPath = path;
    this.#treeShell.dataset.dropTarget = String(path === "");
    this.#masthead.dataset.dropTarget = String(path === "");
    for (const row of this.#treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
      row.dataset.dropTarget = String(path !== undefined && path !== "" && row.dataset.path === path);
    }
    if (!path) return;
    const source = this.#dragSource;
    if (!source || !this.#canDrop(source, path) || this.#model.isExpanded(path)) return;
    this.#dropExpandTimer = setTimeout(() => {
      this.#dropExpandTimer = undefined;
      if (this.#dropTargetPath !== path || !this.#dragSource || !this.#canDrop(this.#dragSource, path)) return;
      const row = this.#rows.find((candidate) => candidate.kind === "node" && candidate.path === path);
      if (row?.node?.kind === "directory") this.#toggleDirectory(row, true);
    }, DROP_EXPAND_DELAY_MS);
  }

  #clearDragState(): void {
    if (this.#dropExpandTimer) clearTimeout(this.#dropExpandTimer);
    this.#dropExpandTimer = undefined;
    this.#dragSource = undefined;
    this.#setDropTarget(undefined);
    for (const row of this.#treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
      row.dataset.dragSource = "false";
    }
  }

  async #moveEntryByDrop(source: DragSource, destinationParentPath: string): Promise<void> {
    if (this.#contextActionPending) return;
    const affectsEditing = Boolean(
      this.#editingPath && isPathWithin(source.path, this.#editingPath),
    );
    if (affectsEditing && this.#editSaving) {
      this.#showActionNotice("Wait for the current save to finish before moving this item.", "error");
      return;
    }
    if (
      affectsEditing &&
      this.#isEditDirty() &&
      !this.#confirmDiscardEditing(`Move ${source.name} and discard your unsaved changes?`)
    ) {
      this.#showActionNotice("Move cancelled; your unsaved changes were kept.", "error");
      return;
    }

    this.#contextActionPending = true;
    try {
      const current = await this.#requestEntryAction("explorer.entry.move", {
        relativePath: source.path,
        destinationParentRelativePath: destinationParentPath,
      });
      if (!current) return;

      if (affectsEditing) this.#clearEditing(false);
      this.#closePreviewTabsWithin(source.path);
      if (destinationParentPath) this.#model.setExpanded(destinationParentPath, true);

      const refreshPaths = [...new Set([source.parentPath, destinationParentPath])];
      for (const path of refreshPaths) {
        const shouldLoad = path === destinationParentPath || this.#model.hasLoaded(path);
        if (!shouldLoad) continue;
        try {
          await this.#loadDirectory(path, false, true);
        } catch {}
      }

      const movedPath = destinationParentPath ? `${destinationParentPath}/${source.name}` : source.name;
      const movedIndex = this.#rows.findIndex((row) => row.kind === "node" && row.path === movedPath);
      if (movedIndex >= 0) this.#focusIndex(movedIndex, false);
    } catch (error) {
      this.#showActionNotice(contextActionError("move", error), "error");
    } finally {
      this.#contextActionPending = false;
    }
  }

  #onTreeContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.#contextActionPending || !this.#context || !this.#bridge?.available || this.#state !== "ready") {
      this.#closeContextMenu(false);
      return;
    }

    const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
    let target: ContextMenuTarget | undefined;
    if (element && this.#treeWindow.contains(element)) {
      const index = Number(element.dataset.index);
      if (!Number.isInteger(index)) return;
      const row = this.#rows[index];
      target = row ? this.#contextTargetForRow(row) : undefined;
      if (!target) {
        this.#closeContextMenu(false);
        return;
      }
      // Right-clicking a row that is already part of a multi-selection keeps the
      // selection; right-clicking elsewhere collapses to just that row.
      if (!this.#selectedPaths.has(target.path)) this.#setSingleSelection(target.path, index);
      this.#focusIndex(index, false);
    } else {
      this.#clearSelection(true);
      target = this.#rootContextTarget();
    }
    this.#treeShell.focus();
    this.#openContextMenu(target, event.clientX, event.clientY);
  }

  #onEmptyStateContextMenu(event: MouseEvent): void {
    if (this.#state !== "empty") return;
    event.preventDefault();
    this.#openContextMenu(this.#rootContextTarget(), event.clientX, event.clientY);
  }

  #onEmptyStateKeyDown(event: KeyboardEvent): void {
    if (this.#state !== "empty" || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
    event.preventDefault();
    const rect = this.#statePanel.getBoundingClientRect();
    this.#openContextMenu(this.#rootContextTarget(), rect.left + Math.min(28, rect.width), rect.top + 48);
  }

  #contextTargetForRow(row: FlatTreeRow): ContextMenuTarget | undefined {
    const node = row.node;
    if (
      row.kind !== "node" ||
      !node ||
      (node.kind !== "file" && node.kind !== "directory") ||
      node.inaccessible ||
      node.change === "deleted"
    ) {
      return undefined;
    }
    return {
      kind: node.kind,
      path: node.relativePath,
      parentPath: row.parentPath,
      name: node.name,
      row: { ...row, node: { ...node } },
    };
  }

  #rootContextTarget(): ContextMenuTarget {
    return { kind: "root", path: "", parentPath: "", name: this.#context?.rootName ?? "Project" };
  }

  #openContextMenu(target: ContextMenuTarget, clientX: number, clientY: number): void {
    if (this.#contextActionPending || (this.#state !== "ready" && this.#state !== "empty") || !this.#context || !this.#bridge?.available) return;
    this.#hideActionNotice();
    const active = this.#shadow.activeElement;
    this.#contextMenuFocusReturn = active instanceof HTMLElement
      ? active
      : this.#state === "empty"
        ? this.#statePanel
        : this.#treeShell;
    this.#contextMenuTarget = target;
    this.#contextMenuDialog = undefined;
    this.#contextMenuError = undefined;
    this.#contextMenuAnchor = { clientX, clientY };
    this.#renderContextMenu();
    this.#contextMenu.hidden = false;
    this.#positionContextMenu(clientX, clientY);
    this.#renderVisible();
    this.#focusContextMenuContent(target);
  }

  #renderContextMenu(): void {
    const target = this.#contextMenuTarget;
    const fragment = document.createDocumentFragment();
    if (!target) {
      this.#contextMenu.replaceChildren();
      return;
    }
    if (this.#contextMenuDialog) {
      this.#renderContextMenuDialog(target, this.#contextMenuDialog);
      return;
    }
    this.#contextMenu.setAttribute("role", "menu");
    this.#contextMenu.setAttribute("aria-label", "Explorer actions");
    this.#contextMenu.removeAttribute("aria-modal");
    let first = true;
    for (const item of this.#contextMenuItems(target)) {
      if (item.separatorBefore) {
        const separator = document.createElement("div");
        separator.className = "context-menu-separator";
        separator.setAttribute("role", "separator");
        fragment.append(separator);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "context-menu-item";
      button.dataset.action = item.action;
      if (item.danger) button.dataset.danger = "true";
      button.setAttribute("role", "menuitem");
      button.tabIndex = first ? 0 : -1;
      button.disabled = this.#contextActionPending;
      const icon = document.createElement("span");
      icon.className = "context-menu-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = item.icon;
      const label = document.createElement("span");
      label.className = "context-menu-label";
      label.textContent = item.label;
      button.append(icon, label);
      fragment.append(button);
      first = false;
    }
    this.#contextMenu.replaceChildren(fragment);
  }

  #renderContextMenuDialog(target: ContextMenuTarget, dialog: ContextMenuDialog): void {
    const form = document.createElement("form");
    form.className = "context-menu-dialog";
    form.dataset.dialogKind = dialog.kind;

    const heading = document.createElement("div");
    heading.className = "context-dialog-heading";
    const icon = document.createElement("span");
    icon.className = "context-menu-icon";
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "context-dialog-title";

    if (dialog.kind === "name") {
      const copy = contextNameActionCopy(dialog.action);
      icon.innerHTML = copy.icon;
      title.textContent = copy.title;
      heading.append(icon, title);

      const input = document.createElement("input");
      input.className = "context-dialog-input";
      input.type = "text";
      input.value = dialog.value;
      input.maxLength = 255;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.dialogName = "true";
      input.setAttribute("aria-label", copy.inputLabel);
      input.setAttribute("aria-invalid", String(Boolean(this.#contextMenuError)));
      input.setAttribute("aria-describedby", "cle-context-dialog-error");

      form.append(heading, input, this.#contextMenuErrorElement());
      form.append(this.#contextDialogButtons(copy.submitLabel));
      form.setAttribute("aria-label", copy.title);
    } else {
      const rename = dialog.kind === "confirm-rename";
      icon.innerHTML = rename ? icons.rename : icons.trash;
      title.textContent = rename ? "Confirm Rename" : "Confirm Delete";
      heading.append(icon, title);

      const question = document.createElement("p");
      question.className = "context-dialog-question";
      const multiDelete = this.#selectedPaths.size > 1 && this.#selectedPaths.has(target.path);
      question.textContent = rename
        ? `Rename ${target.name} to ${dialog.value}?`
        : multiDelete
          ? `Delete ${this.#selectedPaths.size} items?`
          : `Delete ${target.name}?`;
      question.title = question.textContent;

      const warning = document.createElement("p");
      warning.className = "context-dialog-warning";
      const discardsDraft = Boolean(
        this.#editingPath && isPathWithin(target.path, this.#editingPath) && this.#isEditDirty(),
      );
      warning.textContent = rename
        ? "Unsaved changes will be discarded."
        : `This action cannot be undone${discardsDraft ? "; unsaved changes will be discarded" : ""}.`;

      form.append(heading, question, warning, this.#contextMenuErrorElement());
      form.append(this.#contextDialogButtons(rename ? "Rename" : "Delete", !rename));
      form.setAttribute("aria-label", rename ? "Confirm rename" : "Confirm delete");
    }

    this.#contextMenu.setAttribute("role", "dialog");
    this.#contextMenu.setAttribute("aria-modal", "true");
    this.#contextMenu.setAttribute("aria-label", form.getAttribute("aria-label") ?? "Explorer action");
    this.#contextMenu.replaceChildren(form);
  }

  #contextMenuErrorElement(): HTMLElement {
    const error = document.createElement("div");
    error.id = "cle-context-dialog-error";
    error.className = "context-dialog-error";
    error.setAttribute("role", "alert");
    error.hidden = !this.#contextMenuError;
    error.textContent = this.#contextMenuError ?? "";
    return error;
  }

  #contextDialogButtons(submitLabel: string, danger = false): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "context-dialog-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "context-dialog-button secondary";
    cancel.dataset.dialogAction = "cancel";
    cancel.textContent = "Cancel";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = `context-dialog-button primary${danger ? " danger" : ""}`;
    submit.dataset.dialogSubmit = "true";
    submit.textContent = submitLabel;

    actions.append(cancel, submit);
    return actions;
  }

  #contextMenuItems(target: ContextMenuTarget): ContextMenuItem[] {
    const create: ContextMenuItem[] = [
      { action: "new-file", label: "New File", icon: icons.newFile },
      { action: "new-folder", label: "New Folder", icon: icons.newFolder },
    ];
    if (target.kind === "root") {
      return [...create, { action: "refresh", label: "Refresh", icon: icons.refresh, separatorBefore: true }];
    }
    const mutate: ContextMenuItem[] = [
      { action: "rename", label: "Rename", icon: icons.rename, separatorBefore: true },
      { action: "delete", label: "Delete", icon: icons.trash, danger: true },
      { action: "copy-relative", label: "Copy Relative Path", icon: icons.copy, separatorBefore: true },
      { action: "copy-absolute", label: "Copy Absolute Path", icon: icons.link },
      { action: "reveal", label: "Reveal in File Explorer", icon: icons.reveal },
    ];
    if (target.kind === "file") {
      return [{ action: "preview", label: "Preview", icon: icons.preview }, ...create, ...mutate];
    }
    return [...create, ...mutate, { action: "refresh", label: "Refresh", icon: icons.refresh, separatorBefore: true }];
  }

  #positionContextMenu(clientX: number, clientY: number): void {
    const frameRect = this.#frame.getBoundingClientRect();
    const frameWidth = this.#frame.clientWidth || frameRect.width || this.#effectiveWidth();
    const frameHeight = this.#frame.clientHeight || frameRect.height || 420;
    const menuRect = this.#contextMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || Math.min(CONTEXT_MENU_WIDTH, Math.max(0, frameWidth - CONTEXT_MENU_MARGIN * 2));
    const itemCount = this.#contextMenu.querySelectorAll(".context-menu-item").length;
    const separatorCount = this.#contextMenu.querySelectorAll(".context-menu-separator").length;
    const fallbackHeight = this.#contextMenuDialog
      ? CONTEXT_DIALOG_HEIGHT
      : itemCount * CONTEXT_MENU_ITEM_HEIGHT + separatorCount * 9 + 8;
    const menuHeight = menuRect.height || this.#contextMenu.scrollHeight || fallbackHeight;
    const rawX = clientX - frameRect.left;
    const rawY = clientY - frameRect.top;
    const maxX = Math.max(CONTEXT_MENU_MARGIN, frameWidth - menuWidth - CONTEXT_MENU_MARGIN);
    const maxY = Math.max(CONTEXT_MENU_MARGIN, frameHeight - menuHeight - CONTEXT_MENU_MARGIN);
    const left = Math.max(CONTEXT_MENU_MARGIN, Math.min(rawX, maxX));
    const top = Math.max(CONTEXT_MENU_MARGIN, Math.min(rawY, maxY));
    this.#contextMenu.style.left = `${Math.round(left)}px`;
    this.#contextMenu.style.top = `${Math.round(top)}px`;
  }

  #closeContextMenu(restoreFocus: boolean): void {
    const focusReturn = this.#contextMenuFocusReturn;
    this.#contextMenu.hidden = true;
    this.#contextMenuTarget = undefined;
    this.#contextMenuFocusReturn = undefined;
    this.#contextMenuDialog = undefined;
    this.#contextMenuAnchor = undefined;
    this.#contextMenuError = undefined;
    this.#contextMenu.setAttribute("aria-busy", "false");
    this.#contextMenu.style.removeProperty("left");
    this.#contextMenu.style.removeProperty("top");
    this.#treeWindow.querySelector<HTMLElement>('.tree-row[data-context-target="true"]')?.setAttribute("data-context-target", "false");
    if (restoreFocus && this.#connected && focusReturn?.isConnected && !focusReturn.hidden) focusReturn.focus();
  }

  #onContextMenuClick(event: MouseEvent): void {
    const dialogControl = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-dialog-action]");
    if (dialogControl && this.#contextMenu.contains(dialogControl) && !dialogControl.disabled) {
      if (dialogControl.dataset.dialogAction === "cancel") this.#closeContextMenu(true);
      return;
    }
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".context-menu-item");
    if (!button || !this.#contextMenu.contains(button) || button.disabled || this.#contextActionPending) return;
    const action = button.dataset.action;
    if (!isContextMenuAction(action)) return;
    if (action === "new-file" || action === "new-folder" || action === "rename" || action === "delete") {
      this.#beginContextMenuDialog(action);
    } else {
      void this.#runContextMenuAction(action);
    }
  }

  #onContextMenuSubmit(event: SubmitEvent): void {
    const form = (event.target as Element | null)?.closest<HTMLFormElement>(".context-menu-dialog");
    if (!form || !this.#contextMenu.contains(form)) return;
    event.preventDefault();
    if (this.#contextActionPending) return;
    const target = this.#contextMenuTarget;
    const dialog = this.#contextMenuDialog;
    if (!target || !dialog) return;

    if (dialog.kind === "name") {
      const input = form.querySelector<HTMLInputElement>("[data-dialog-name]");
      const value = input?.value ?? "";
      this.#contextMenuDialog = { ...dialog, value };
      const validationError = entryNameValidationError(value);
      if (validationError) {
        this.#showContextMenuError(validationError);
        return;
      }
      if (dialog.action === "rename") {
        if (value === target.name) {
          this.#closeContextMenu(true);
          return;
        }
        if (this.#editingPath && isPathWithin(target.path, this.#editingPath)) {
          if (this.#editSaving) {
            this.#showContextMenuError("Wait for the current save to finish.");
            return;
          }
          if (this.#isEditDirty()) {
            this.#showContextMenuDialog({ kind: "confirm-rename", value });
            return;
          }
        }
      }
      void this.#runContextMenuMutation(dialog.action, value);
      return;
    }

    if (this.#editingPath && isPathWithin(target.path, this.#editingPath) && this.#editSaving) {
      this.#showContextMenuError("Wait for the current save to finish.");
      return;
    }
    void this.#runContextMenuMutation(dialog.kind === "confirm-delete" ? "delete" : "rename",
      dialog.kind === "confirm-rename" ? dialog.value : undefined);
  }

  #onContextMenuKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.#closeContextMenu(true);
      return;
    }
    if (this.#contextMenuDialog) {
      if (event.key !== "Tab") return;
      const controls = Array.from(
        this.#contextMenu.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"),
      );
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const current = controls.indexOf(this.#shadow.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (current <= 0 ? controls.length - 1 : current - 1)
        : (current < 0 || current === controls.length - 1 ? 0 : current + 1);
      event.preventDefault();
      controls[next]?.focus();
      return;
    }
    if (event.key === "Tab") {
      this.#closeContextMenu(false);
      return;
    }
    const items = Array.from(this.#contextMenu.querySelectorAll<HTMLButtonElement>(".context-menu-item:not(:disabled)"));
    if (!items.length) return;
    let next = -1;
    const current = items.indexOf(this.#shadow.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") next = (current + 1 + items.length) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    for (const item of items) item.tabIndex = -1;
    const item = items[next];
    if (item) {
      item.tabIndex = 0;
      item.focus();
    }
  }

  async #runContextMenuAction(action: ContextMenuAction): Promise<void> {
    const target = this.#contextMenuTarget;
    if (!target || this.#contextActionPending) return;
    this.#contextActionPending = true;
    this.#setContextMenuBusy(true);
    let close = false;
    try {
      close = await this.#performContextMenuAction(action, target);
    } catch (error) {
      this.#showActionNotice(contextActionError(action, error), "error");
    } finally {
      this.#contextActionPending = false;
      this.#setContextMenuBusy(false);
      if (close) this.#closeContextMenu(true);
    }
  }

  async #performContextMenuAction(action: ContextMenuAction, target: ContextMenuTarget): Promise<boolean> {
    if (action === "preview") {
      if (target.row) this.#openPreviewTab(target.row);
      return true;
    }
    if (action === "copy-relative") {
      const paths = this.#selectedPaths.size > 1 && this.#selectedPaths.has(target.path)
        ? Array.from(this.#selectedPaths).sort()
        : [target.path];
      const copyText = paths.length === 1 ? (paths[0] ?? "") : paths.join("\n");
      await this.#copyRelativePath(copyText);
      return true;
    }
    if (action === "copy-absolute") {
      const root = this.#context?.rootPath;
      if (!root) throw new ExplorerBridgeError({ code: "NO_CONTEXT", message: "The workspace path is unavailable." });
      // Absolute path is just root + relative path, built locally — no bridge
      // round-trip, so the copy is instant and stays in the click's activation
      // window. Paths are already contained (validated when the tree loaded).
      const absolutePaths = this.#contextActionPaths(target).map((path) => joinAbsolutePath(root, path));
      await this.#copyRelativePath(absolutePaths.join("\r\n"));
      return true;
    }
    if (action === "reveal") {
      const paths = this.#contextActionPaths(target);
      for (const path of paths) {
        const current = await this.#requestEntryAction("explorer.entry.reveal", { relativePath: path });
        if (!current) break;
      }
      return true;
    }
    if (action === "refresh") {
      await this.#refreshContextTarget(target);
      return true;
    }
    throw new Error("Unsupported context-menu action.");
  }

  #setContextMenuBusy(busy: boolean): void {
    this.#contextMenu.setAttribute("aria-busy", String(busy));
    for (const control of this.#contextMenu.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")) {
      control.disabled = busy;
      control.setAttribute("aria-disabled", String(busy));
    }
  }

  #beginContextMenuDialog(action: ContextMenuNameAction | "delete"): void {
    const target = this.#contextMenuTarget;
    if (!target || this.#contextActionPending) return;
    this.#showContextMenuDialog(action === "delete"
      ? { kind: "confirm-delete" }
      : { kind: "name", action, value: action === "rename" ? target.name : "" });
  }

  #showContextMenuDialog(dialog: ContextMenuDialog): void {
    const target = this.#contextMenuTarget;
    if (!target || this.#contextMenu.hidden) return;
    this.#contextMenuDialog = dialog;
    this.#contextMenuError = undefined;
    this.#renderContextMenu();
    const anchor = this.#contextMenuAnchor;
    if (anchor) this.#positionContextMenu(anchor.clientX, anchor.clientY);
    this.#focusContextMenuContent(target);
  }

  #focusContextMenuContent(target: ContextMenuTarget): void {
    requestAnimationFrame(() => {
      if (this.#contextMenu.hidden || this.#contextMenuTarget !== target) return;
      const anchor = this.#contextMenuAnchor;
      if (anchor) this.#positionContextMenu(anchor.clientX, anchor.clientY);
      if (!this.#contextMenuDialog) {
        this.#contextMenu.querySelector<HTMLButtonElement>('.context-menu-item:not(:disabled)')?.focus();
        return;
      }
      if (this.#contextMenuDialog.kind === "name") {
        const input = this.#contextMenu.querySelector<HTMLInputElement>("[data-dialog-name]:not(:disabled)");
        if (!input) return;
        input.focus();
        const dot = this.#contextMenuDialog.action === "rename" ? input.value.lastIndexOf(".") : -1;
        input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
        return;
      }
      this.#contextMenu.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]:not(:disabled)')?.focus();
    });
  }

  #clearContextMenuError(): void {
    if (!this.#contextMenuError) return;
    this.#contextMenuError = undefined;
    const error = this.#contextMenu.querySelector<HTMLElement>(".context-dialog-error");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    this.#contextMenu.querySelector<HTMLInputElement>("[data-dialog-name]")?.setAttribute("aria-invalid", "false");
  }

  #showContextMenuError(message: string): void {
    const target = this.#contextMenuTarget;
    if (!target || !this.#contextMenuDialog) return;
    this.#contextMenuError = message;
    this.#renderContextMenu();
    const anchor = this.#contextMenuAnchor;
    if (anchor) this.#positionContextMenu(anchor.clientX, anchor.clientY);
    this.#focusContextMenuContent(target);
  }

  async #runContextMenuMutation(action: ContextMenuNameAction | "delete", name?: string): Promise<void> {
    const target = this.#contextMenuTarget;
    if (!target || this.#contextActionPending) return;
    this.#contextActionPending = true;
    this.#contextMenuError = undefined;
    this.#setContextMenuBusy(true);
    let succeeded = false;
    let failureMessage: string | undefined;
    try {
      if (action === "new-file" || action === "new-folder") {
        if (name === undefined) throw new Error("A name is required.");
        const kind = action === "new-file" ? "file" : "directory";
        const parentRelativePath = target.kind === "directory" ? target.path : target.parentPath;
        const current = await this.#requestEntryAction("explorer.entry.create", { parentRelativePath, name, kind });
        if (!current) return;
        try {
          await this.#refreshDirectoryIfLoaded(parentRelativePath);
        } catch {}
        succeeded = true;
      } else if (action === "rename") {
        if (name === undefined) throw new Error("A name is required.");
        const current = await this.#requestEntryAction("explorer.entry.rename", { relativePath: target.path, newName: name });
        if (!current) return;
        if (this.#editingPath && isPathWithin(target.path, this.#editingPath)) this.#clearEditing(false);
        this.#closePreviewTabsWithin(target.path);
        try {
          await this.#refreshDirectoryIfLoaded(target.parentPath);
        } catch {}
        succeeded = true;
      } else {
        // Delete: operate on all selected paths if the target is part of a multi-selection.
        const pathsToDelete = this.#selectedPaths.size > 1 && this.#selectedPaths.has(target.path)
          ? Array.from(this.#selectedPaths).sort()
          : [target.path];
        // Filter out nested paths: if deleting "src/" and "src/main.ts", only delete "src/".
        const topLevel = pathsToDelete.filter((path) => !pathsToDelete.some((other) => other !== path && isPathWithin(other, path)));
        const parentPaths = new Set<string>();
        for (const path of topLevel) {
          const current = await this.#requestEntryAction("explorer.entry.delete", { relativePath: path });
          if (!current) return;
          if (this.#editingPath && isPathWithin(path, this.#editingPath)) this.#clearEditing(false);
          this.#closePreviewTabsWithin(path);
          const row = this.#rows.find((r) => r.kind === "node" && r.path === path);
          if (row) parentPaths.add(row.parentPath);
        }
        try {
          for (const parentPath of parentPaths) await this.#refreshDirectoryIfLoaded(parentPath);
        } catch {}
        succeeded = true;
      }
    } catch (error) {
      failureMessage = contextActionError(action, error);
    } finally {
      this.#contextActionPending = false;
      const dialogStillOpen = this.#contextMenuTarget === target && Boolean(this.#contextMenuDialog);
      if (this.#contextMenuTarget === target) this.#setContextMenuBusy(false);
      if (failureMessage) {
        if (dialogStillOpen) this.#showContextMenuError(failureMessage);
        else this.#showActionNotice(failureMessage, "error");
      } else if (succeeded) {
        if (this.#contextMenuTarget === target) this.#closeContextMenu(true);
      }
    }
  }

  async #requestEntryAction(method: string, params: Record<string, unknown>): Promise<boolean> {
    const bridge = this.#bridge;
    const context = this.#context;
    const generation = this.#generation;
    if (!bridge?.available || !context) throw new BridgeUnavailableError();
    await bridge.request(method, params);
    return this.#canUseBridge(bridge, generation) && this.#context === context && this.#threadId === context.threadId;
  }

  async #refreshContextTarget(target: ContextMenuTarget): Promise<void> {
    if (target.kind === "root") {
      await this.#refreshLoadedDirectories();
      return;
    }
    if (target.kind === "directory") await this.#loadDirectory(target.path, false, true);
    else await this.#refreshDirectoryIfLoaded(target.parentPath);
  }

  async #refreshDirectoryIfLoaded(path: string): Promise<void> {
    if (this.#model.hasLoaded(path)) await this.#loadDirectory(path, false, true);
  }

  #closePreviewTabsWithin(path: string): void {
    const paths = this.#previewTabs
      .filter((tab) => isPathWithin(path, tab.path))
      .map((tab) => tab.path)
      .sort((left, right) => right.length - left.length);
    for (const previewPath of paths) this.#closePreviewTab(previewPath, false);
  }

  async #copyRelativePath(path: string): Promise<void> {
    const clipboard = this.ownerDocument.defaultView?.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      try {
        await clipboard.writeText(path);
        return;
      } catch {
        // Codex may expose the Clipboard API without granting this injected realm permission.
      }
    }
    const focusReturn = this.#shadow.activeElement instanceof HTMLElement ? this.#shadow.activeElement : undefined;
    const input = this.ownerDocument.createElement("textarea");
    input.className = "clipboard-proxy";
    input.value = path;
    input.setAttribute("aria-hidden", "true");
    this.#shadow.append(input);
    input.select();
    let copied = false;
    try {
      copied = this.ownerDocument.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      input.remove();
      if (focusReturn?.isConnected) focusReturn.focus();
    }
    if (!copied) throw new Error("Clipboard access is unavailable.");
  }

  // The paths a context action applies to: the whole selection when the target
  // is part of a multi-selection, otherwise just the target.
  #contextActionPaths(target: ContextMenuTarget): string[] {
    return this.#selectedPaths.size > 1 && this.#selectedPaths.has(target.path)
      ? Array.from(this.#selectedPaths).sort()
      : [target.path];
  }

  async #pasteFiles(): Promise<void> {
    if (!this.#fileClipboard || !this.#context || !this.#bridge?.available) return;

    // Determine target directory: use focused row if it's a directory, otherwise its parent.
    const focusedRow = this.#rows[this.#focusedIndex];
    let targetDir = "";
    if (focusedRow?.kind === "node") {
      targetDir = focusedRow.node?.kind === "directory" ? focusedRow.path : focusedRow.parentPath;
    }

    try {
      const { paths, operation } = this.#fileClipboard;
      const method = operation === "copy" ? "explorer.entry.copy" : "explorer.entry.move";

      await this.#bridge.request(method, {
        sourcePaths: paths,
        targetDirectory: targetDir,
      });

      // Clear clipboard after cut (move), keep it for copy (can paste multiple times).
      if (operation === "cut") this.#fileClipboard = undefined;

      // Refresh the target directory to show the new files.
      if (targetDir) await this.#loadDirectory(targetDir, false, true);
      else await this.#refreshLoadedDirectories();
    } catch (error) {
      this.#showActionNotice(contextActionError("paste", error), "error");
    }
  }

  async #deleteSelectedFiles(): Promise<void> {
    if (this.#selectedPaths.size === 0 || !this.#context || !this.#bridge?.available) return;

    const paths = Array.from(this.#selectedPaths).sort();
    try {
      // Delete each file/directory.
      for (const path of paths) {
        await this.#bridge.request("explorer.entry.delete", { relativePath: path });
      }

      this.#clearSelection(false);

      // Refresh parent directories.
      const parentPaths = new Set(paths.map((path) => {
        const lastSlash = path.lastIndexOf("/");
        return lastSlash >= 0 ? path.substring(0, lastSlash) : "";
      }));

      for (const parentPath of parentPaths) {
        if (parentPath) await this.#refreshDirectoryIfLoaded(parentPath);
      }
    } catch (error) {
      this.#showActionNotice(contextActionError("delete", error), "error");
    }
  }

  #onTreeKeyDown(event: KeyboardEvent): void {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const row = this.#rows[this.#focusedIndex];
      const target = row ? this.#contextTargetForRow(row) : this.#rootContextTarget();
      if (!target) {
        this.#closeContextMenu(false);
        return;
      }
      const active = this.#shadow.getElementById(`cle-row-${this.#focusedIndex}`);
      const rect = (active ?? this.#treeShell).getBoundingClientRect();
      this.#openContextMenu(target, rect.left + Math.min(28, rect.width), rect.bottom || rect.top + TREE_ROW_HEIGHT);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      this.#fileFilterInput.focus();
      this.#fileFilterInput.select();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "a") {
      event.preventDefault();
      this.#selectAll();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "c") {
      event.preventDefault();
      // Copy selected files to internal clipboard (for paste operation), not OS clipboard.
      if (this.#selectedPaths.size > 0) {
        this.#fileClipboard = { paths: Array.from(this.#selectedPaths).sort(), operation: "copy" };
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "x") {
      event.preventDefault();
      // Cut selected files to internal clipboard (will be moved on paste).
      if (this.#selectedPaths.size > 0) {
        this.#fileClipboard = { paths: Array.from(this.#selectedPaths).sort(), operation: "cut" };
        this.#syncSelectionDom(); // Visual update for cut state
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "v") {
      event.preventDefault();
      // Paste files from internal clipboard to the current focused directory.
      if (this.#fileClipboard && this.#fileClipboard.paths.length > 0) {
        void this.#pasteFiles();
      }
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      // Delete selected files.
      if (this.#selectedPaths.size > 0) {
        void this.#deleteSelectedFiles();
      }
      return;
    }
    if (!this.#rows.length) return;
    const row = this.#rows[this.#focusedIndex];
    if (!row) return;
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        this.#focusIndex(this.#focusedIndex + 1);
        this.#updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "ArrowUp":
        this.#focusIndex(this.#focusedIndex - 1);
        this.#updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "Home":
        this.#focusIndex(0);
        this.#updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "End":
        this.#focusIndex(this.#rows.length - 1);
        this.#updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "ArrowRight":
        if (row.kind === "node" && row.node?.kind === "directory") {
          if (this.#isFilterExpandable(row) && !this.#isFilterExpanded(row)) this.#toggleDirectory(row, true);
          else if (this.#isFilterExpanded(row) && this.#rows[this.#focusedIndex + 1]?.depth === row.depth + 1) {
            this.#focusIndex(this.#focusedIndex + 1);
          }
          else if (!this.#fileFilterQuery && !this.#model.isExpanded(row.path)) this.#toggleDirectory(row, true);
          else if (this.#rows[this.#focusedIndex + 1]?.depth === row.depth + 1) this.#focusIndex(this.#focusedIndex + 1);
        }
        break;
      case "ArrowLeft":
        if (this.#isFilterExpanded(row)) {
          this.#toggleDirectory(row, false);
        } else if (!this.#fileFilterQuery && row.kind === "node" && row.node?.kind === "directory" && this.#model.isExpanded(row.path)) {
          this.#toggleDirectory(row, false);
        } else {
          const parentIndex = this.#rows.findIndex((candidate) => candidate.kind === "node" && candidate.path === row.parentPath);
          if (parentIndex >= 0) this.#focusIndex(parentIndex);
        }
        break;
      case "Enter":
      case " ":
        this.#activateRow(row);
        break;
      case "Escape":
        if (this.#selectedPaths.size > 1) {
          const focusRow = this.#selectableRow(this.#focusedIndex);
          if (focusRow) this.#setSingleSelection(focusRow.path, this.#focusedIndex);
          else this.#clearSelection(true);
          this.#announce("Selection reduced to one item");
        } else if (this.#activePreviewPath) {
          if (this.#leaveEditing("Return to the conversation and discard your unsaved changes?")) {
            this.#activePreviewPath = null;
            this.#syncMainPreview();
            this.#renderVisible();
            this.#announce("Conversation shown");
          }
        } else if (this.dataset.placement === "drawer") this.collapse(true);
        else handled = false;
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) this.#runTypeahead(event.key);
        else handled = false;
    }
    if (handled) event.preventDefault();
  }

  #activateRow(row: FlatTreeRow): void {
    if (row.kind === "more") void this.#loadDirectory(row.parentPath, true);
    else if (row.kind === "directory-error") void this.#loadDirectory(row.parentPath);
    else if (row.kind === "node" && row.node?.kind === "directory") this.#toggleDirectory(row);
    else if (row.kind === "node" && row.node?.kind === "file") this.#openPreviewTab(row);
  }

  #toggleDirectory(row: FlatTreeRow, force?: boolean): void {
    const node = row.node;
    if (!node || node.kind !== "directory" || node.inaccessible) return;
    if (this.#fileFilterQuery) {
      if (!this.#isFilterExpandable(row)) return;
      const expanded = force ?? !this.#isFilterExpanded(row);
      if (expanded) this.#filterCollapsedPaths.delete(node.relativePath);
      else this.#filterCollapsedPaths.add(node.relativePath);
      this.#renderTree();
      return;
    }
    const expanded = force ?? !this.#model.isExpanded(node.relativePath);
    this.#model.setExpanded(node.relativePath, expanded);
    if (expanded && !this.#model.hasLoaded(node.relativePath)) void this.#loadDirectory(node.relativePath);
    this.#renderTree();
  }

  #focusIndex(index: number, focus = true): void {
    this.#focusedIndex = Math.max(0, Math.min(index, this.#rows.length - 1));
    const top = this.#focusedIndex * TREE_ROW_HEIGHT;
    const bottom = top + TREE_ROW_HEIGHT;
    if (top < this.#treeShell.scrollTop) this.#treeShell.scrollTop = top;
    else if (bottom > this.#treeShell.scrollTop + this.#treeShell.clientHeight) this.#treeShell.scrollTop = bottom - this.#treeShell.clientHeight;
    this.#renderVisible();
    if (focus) this.#treeShell.focus();
  }

  #toggleEditing(): void {
    if (this.#editSaving) return;
    if (this.#editingPath) {
      if (this.#isEditDirty()) void this.#saveEditing(true);
      else {
        const tab = this.#previewTabs.find((candidate) => candidate.path === this.#editingPath);
        this.#clearEditing(false);
        if (tab?.dirty) {
          this.#schedulePreview(tab, 0);
          this.#announce(`${tab.name} reloading from disk`);
        } else {
          this.#syncMainPreview();
          this.#announce("Read-only preview restored");
        }
      }
      return;
    }

    const tab = this.#activeEditableTab();
    if (!tab) return;
    this.#editingPath = tab.path;
    this.#editDraft = normalizeTextareaText(previewText(tab.view));
    this.#editError = undefined;
    this.#editSaving = false;
    this.#editRevision += 1;
    this.#editSession += 1;
    this.#syncMainPreview();
    this.#announce(`Editing ${tab.name}`);
  }

  #preserveDetachedDraft(): void {
    if (!this.#threadId || !this.#editingPath || !this.#isEditDirty()) return;
    const tab = this.#previewTabs.find((candidate) => candidate.path === this.#editingPath);
    if (!tab || (tab.view.kind !== "text" && tab.view.kind !== "empty")) return;
    clearDetachedEditDraft();
    detachedEditDraft = {
      threadId: this.#threadId,
      path: tab.path,
      name: tab.name,
      draft: this.#editDraft,
      view: tab.view,
      bootstrap: this.#nativeReconnectMarker,
      expiresAt: Date.now() + DETACHED_EDIT_TTL_MS,
    };
    detachedEditDraftTimer = setTimeout(clearDetachedEditDraft, DETACHED_EDIT_TTL_MS);
  }

  #restoreDetachedDraft(context: ExplorerContext): boolean {
    const saved = detachedEditDraft;
    if (!saved) return false;
    if (saved.expiresAt <= Date.now() || saved.bootstrap !== this.#nativeReconnectMarker) {
      clearDetachedEditDraft();
      return false;
    }
    if (saved.threadId !== context.threadId || this.#previewTabs.length || !this.#ensureMainPreview()) return false;
    clearDetachedEditDraft();
    const tab: PreviewTab = {
      instanceId: this.#nextPreviewInstanceId++,
      path: saved.path,
      name: saved.name,
      revision: 1,
      timer: undefined,
      modifiedDuringSave: false,
      dirty: false,
      view: saved.view,
    };
    this.#previewTabs.push(tab);
    this.#activePreviewPath = tab.path;
    this.#editingPath = tab.path;
    this.#editDraft = saved.draft;
    this.#editError = "Unsaved changes were recovered after the Codex interface refreshed.";
    this.#editSaving = false;
    this.#editRevision += 1;
    this.#editSession += 1;
    this.#syncMainPreview();
    this.#renderVisible();
    this.#announce(`Unsaved changes recovered for ${tab.name}`);
    return true;
  }

  async #saveEditing(exitAfterSave: boolean): Promise<void> {
    if (this.#editSaving || !this.#editingPath) return;
    const tab = this.#previewTabs.find((candidate) => candidate.path === this.#editingPath);
    if (!tab || !isEditablePreview(tab.view) || !tab.view.version) {
      this.#editError = "This file is no longer available for editing. Reload it to continue.";
      this.#syncMainPreview();
      return;
    }
    const bridge = this.#bridge;
    const context = this.#context;
    const mainPreview = this.#mainPreview;
    if (!bridge?.available || !context || !mainPreview?.isConnected) {
      this.#editError = "Code-Codex is disconnected. Your draft has been kept.";
      this.#syncMainPreview();
      return;
    }

    const content = restoreLineEndings(this.#editDraft, tab.view.lineEnding);
    const encoded = new TextEncoder().encode(content);
    if (encoded.byteLength > 64 * 1024) {
      this.#editError = "This draft is larger than the 64 KB editing limit.";
      this.#syncMainPreview();
      return;
    }

    const operation = ++this.#editRevision;
    const generation = this.#generation;
    const sessionRevision = this.#previewSessionRevision;
    const instanceId = tab.instanceId;
    const path = tab.path;
    const editSession = this.#editSession;
    tab.modifiedDuringSave = false;
    this.#editSaving = true;
    this.#editError = undefined;
    this.#syncMainPreview();

    try {
      const raw = await bridge.request<unknown>("explorer.preview.save", {
        relativePath: path,
        expectedVersion: tab.view.version,
        contentBase64: encodeBase64(encoded),
      });
      if (!this.#canApplyEditSave(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, path, editSession)) return;
      const preview = normalizePreview(raw);
      if (preview.kind !== "text") {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The saved preview response was not valid." });
      }
      if (tab.modifiedDuringSave) {
        const verified = await this.#verifySavedPreview(
          tab,
          preview,
          bridge,
          context,
          mainPreview,
          generation,
          sessionRevision,
          instanceId,
          path,
          editSession,
        );
        if (!verified) return;
        this.#finishSuccessfulSave(tab, verified, operation, exitAfterSave);
      } else {
        this.#finishSuccessfulSave(tab, preview, operation, exitAfterSave);
      }
    } catch (error) {
      if (!this.#canApplyEditSave(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, path, editSession)) return;
      tab.modifiedDuringSave = false;
      this.#editSaving = false;
      this.#editError = editSaveError(error);
      this.#syncMainPreview();
      this.#announce(`Changes to ${tab.name} were not saved`);
      this.#flushQueuedMainPreviewReconcile();
      this.#flushQueuedThreadSwitch();
    }
  }

  #canApplyEditSave(
    tab: PreviewTab,
    bridge: ExplorerBridge,
    context: ExplorerContext,
    mainPreview: CodeCodexMainPreviewElement,
    generation: number,
    sessionRevision: number,
    instanceId: number,
    path: string,
    editSession: number,
  ): boolean {
    return this.#connected &&
      !this.#dismissed &&
      this.#editingPath === path &&
      this.#editSession === editSession &&
      this.#generation === generation &&
      this.#previewSessionRevision === sessionRevision &&
      tab.instanceId === instanceId &&
      this.#previewTabs.includes(tab) &&
      this.#bridge === bridge &&
      this.#context === context &&
      this.#threadId === context.threadId &&
      this.#mainPreview === mainPreview;
  }

  async #verifySavedPreview(
    tab: PreviewTab,
    saved: NormalizedTextPreview,
    bridge: ExplorerBridge,
    context: ExplorerContext,
    mainPreview: CodeCodexMainPreviewElement,
    generation: number,
    sessionRevision: number,
    instanceId: number,
    path: string,
    editSession: number,
  ): Promise<NormalizedTextPreview | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      tab.modifiedDuringSave = false;
      const raw = await bridge.request<unknown>("explorer.preview", { relativePath: path });
      if (!this.#canApplyEditSave(
        tab,
        bridge,
        context,
        mainPreview,
        generation,
        sessionRevision,
        instanceId,
        path,
        editSession,
      )) {
        return null;
      }
      const current = normalizePreview(raw);
      if (current.kind !== "text") {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The verification preview response was not valid." });
      }
      if (current.version !== saved.version) {
        tab.view = this.#previewView(tab, current);
        tab.dirty = false;
        tab.modifiedDuringSave = false;
        this.#editSaving = false;
        this.#editError = "This file changed on disk while it was being saved. Your draft has been kept.";
        this.#syncMainPreview();
        this.#announce(`A newer disk version of ${tab.name} was detected`);
        this.#flushQueuedMainPreviewReconcile();
        this.#flushQueuedThreadSwitch();
        return null;
      }
      if (!tab.modifiedDuringSave) return current;
    }
    tab.modifiedDuringSave = false;
    this.#editSaving = false;
    this.#editError = "This file kept changing while it was being saved. Reload it before trying again.";
    this.#syncMainPreview();
    this.#flushQueuedMainPreviewReconcile();
    this.#flushQueuedThreadSwitch();
    return null;
  }

  #finishSuccessfulSave(tab: PreviewTab, preview: NormalizedTextPreview, operation: number, exitAfterSave: boolean): void {
    tab.view = this.#previewView(tab, preview);
    tab.dirty = false;
    tab.modifiedDuringSave = false;
    this.#editSaving = false;
    this.#editError = undefined;
    let reconnectQueued = false;
    if (this.#editRevision === operation) {
      this.#editDraft = normalizeTextareaText(preview.text);
      if (exitAfterSave) reconnectQueued = this.#clearEditing(false);
    }
    this.#syncMainPreview();
    this.#announce(this.#editingPath ? `${tab.name} saved` : `${tab.name} saved; read-only preview restored`);
    if (!reconnectQueued) reconnectQueued = this.#flushQueuedNativeReconnect();
    if (!reconnectQueued) {
      this.#flushQueuedMainPreviewReconcile();
      this.#flushQueuedThreadSwitch();
    }
  }

  #flushQueuedMainPreviewReconcile(): void {
    const queued = this.#queuedMainPreviewReconcile;
    if (!queued || this.#editSaving) return;
    this.#queuedMainPreviewReconcile = undefined;
    this.#detachMainPreview();
    this.#mainPreviewSurface = queued.surface;
    if (queued.surface && this.#previewTabs.length) {
      this.#ensureMainPreview();
      this.#syncMainPreview();
    }
  }

  #flushQueuedThreadSwitch(): void {
    const queued = this.#queuedThreadSwitch;
    if (!queued || this.#editSaving) return;
    this.#queuedThreadSwitch = undefined;
    queueMicrotask(() => {
      if (this.#connected && !this.#dismissed) void this.#switchThread(queued.threadId, queued.force);
    });
  }

  #flushQueuedNativeReconnect(): boolean {
    const queued = this.#queuedNativeReconnect;
    if (!queued || this.#editSaving || this.#isEditDirty()) return false;
    this.#queuedNativeReconnect = undefined;
    queueMicrotask(() => {
      if (this.#connected && !this.#dismissed) this.reconnectNative(queued);
    });
    return true;
  }

  #reloadEditedFile(): void {
    if (!this.#editingPath) return;
    if (this.#isEditDirty() && !this.#confirmDiscardEditing("Reload this file and discard your unsaved changes?")) return;
    const tab = this.#previewTabs.find((candidate) => candidate.path === this.#editingPath);
    this.#clearEditing(false);
    if (tab) {
      tab.dirty = true;
      this.#schedulePreview(tab, 0);
    } else {
      this.#syncMainPreview();
    }
  }

  #activeEditableTab(): PreviewTab | undefined {
    if (!this.#activePreviewPath) return undefined;
    const tab = this.#previewTabs.find((candidate) => candidate.path === this.#activePreviewPath);
    return tab && isEditablePreview(tab.view) ? tab : undefined;
  }

  #isEditDirty(): boolean {
    if (!this.#editingPath) return false;
    const tab = this.#previewTabs.find((candidate) => candidate.path === this.#editingPath);
    return Boolean(tab && this.#editDraft !== normalizeTextareaText(previewText(tab.view)));
  }

  #leaveEditing(prompt: string): boolean {
    if (!this.#editingPath) return true;
    if (this.#editSaving) {
      this.#announce("Wait for the current save to finish");
      return false;
    }
    if (this.#isEditDirty() && !this.#confirmDiscardEditing(prompt)) return false;
    this.#clearEditing(false);
    return true;
  }

  #confirmDiscardEditing(message: string): boolean {
    try {
      return this.ownerDocument.defaultView?.confirm(message) === true;
    } catch {
      return false;
    }
  }

  #clearEditing(sync = true): boolean {
    this.#editingPath = null;
    this.#editDraft = "";
    this.#editError = undefined;
    this.#editSaving = false;
    this.#editRevision += 1;
    this.#editSession += 1;
    if (sync) this.#syncMainPreview();
    else this.#syncEditModeButton();
    const reconnectQueued = this.#flushQueuedNativeReconnect();
    if (!reconnectQueued) this.#flushQueuedThreadSwitch();
    return reconnectQueued;
  }

  #syncEditModeButton(): void {
    const tab = this.#activeEditableTab();
    const editing = this.#editingPath !== null;
    this.#editModeButton.disabled = this.#editSaving || (!editing && !tab);
    this.#editModeButton.textContent = this.#editSaving ? "Saving" : editing ? "Editing" : "Read only";
    this.#editModeButton.setAttribute("aria-pressed", String(editing));
    this.#editModeButton.dataset.dirty = String(this.#isEditDirty());
    this.#editModeButton.title = this.#editSaving
      ? "Saving changes"
      : editing
        ? "Save changes and return to read-only preview"
        : tab
          ? `Edit ${tab.name}`
          : "Select an editable file to enable editing";
  }

  #openPreviewTab(row: FlatTreeRow): void {
    const node = row.node;
    if (
      row.kind !== "node" ||
      !node ||
      node.kind !== "file" ||
      node.inaccessible ||
      node.change === "deleted" ||
      (this.#state !== "ready" && this.#state !== "empty") ||
      !this.#context ||
      !this.#bridge?.available ||
      !this.#mainPreviewSurface?.isConnected
    ) {
      return;
    }
    if (
      this.#editingPath !== null &&
      this.#editingPath !== node.relativePath &&
      !this.#leaveEditing("Open another file and discard your unsaved changes?")
    ) {
      return;
    }
    if (!this.#ensureMainPreview()) return;

    let tab = this.#previewTabs.find((candidate) => candidate.path === node.relativePath);
    if (!tab) {
      if (this.#previewTabs.length >= MAX_PREVIEW_TABS) {
        const evicted = this.#previewTabs.shift();
        if (evicted) this.#disposePreviewTab(evicted);
      }
      tab = {
        instanceId: this.#nextPreviewInstanceId++,
        path: node.relativePath,
        name: node.name,
        revision: 0,
        timer: undefined,
        modifiedDuringSave: false,
        dirty: false,
        view: { kind: "loading", path: node.relativePath, name: node.name },
      };
      this.#previewTabs.push(tab);
    }

    this.#activePreviewPath = tab.path;
    if (tab.dirty || tab.view.kind === "error" || tab.revision === 0) this.#schedulePreview(tab);
    else this.#syncMainPreview();
    this.#renderVisible();
    if (this.dataset.placement === "drawer" && !this.#settings.collapsed) this.collapse(true);
    this.#announce(`${tab.name} opened in the main view`);
  }

  #schedulePreview(tab: PreviewTab, delay = PREVIEW_SELECTION_DELAY_MS): void {
    if (tab.timer) clearTimeout(tab.timer);
    tab.timer = undefined;
    tab.dirty = false;
    const revision = ++tab.revision;
    tab.view = { kind: "loading", path: tab.path, name: tab.name };
    const generation = this.#generation;
    const sessionRevision = this.#previewSessionRevision;
    const instanceId = tab.instanceId;
    const bridge = this.#bridge;
    const context = this.#context;
    const mainPreview = this.#mainPreview;
    this.#syncMainPreview();

    if (!bridge?.available || !context || !mainPreview?.isConnected) return;
    tab.timer = setTimeout(() => {
      tab.timer = undefined;
      void this.#requestPreview(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, revision);
    }, delay);
  }

  async #requestPreview(
    tab: PreviewTab,
    bridge: ExplorerBridge,
    context: ExplorerContext,
    mainPreview: CodeCodexMainPreviewElement,
    generation: number,
    sessionRevision: number,
    instanceId: number,
    revision: number,
  ): Promise<void> {
    if (!this.#canApplyPreview(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, revision)) return;
    const mediaRoute = mediaPreviewRoute(tab.path);
    if (mediaRoute && !this.#enabledPreviewers.has(mediaRoute.previewerId)) {
      tab.view = { kind: "unsupported", path: tab.path, name: tab.name, sizeBytes: 0, reason: "previewer-disabled" };
      this.#syncMainPreview();
      this.#announce(`Preview extension disabled for ${tab.name}`);
      return;
    }
    try {
      const canContinue = (): boolean =>
        (!mediaRoute || this.#enabledPreviewers.has(mediaRoute.previewerId)) &&
        this.#canApplyPreview(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, revision);
      const preview = mediaRoute
        ? await this.#requestMediaPreview(tab.path, bridge, mediaRoute, canContinue)
        : normalizePreview(await bridge.request<unknown>("explorer.preview", { relativePath: tab.path }));
      if (!preview || !canContinue()) return;
      tab.view = this.#previewView(tab, preview);
      this.#syncMainPreview();
      this.#announce(preview.kind === "unsupported" ? `Preview unavailable for ${tab.name}` : `Preview loaded for ${tab.name}`);
    } catch (error) {
      if (!this.#canApplyPreview(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, revision)) return;
      const code = errorCode(error);
      const message = mediaRoute ? mediaPreviewError(error) : undefined;
      tab.view = message
        ? { kind: "error", path: tab.path, name: tab.name, code, message }
        : { kind: "error", path: tab.path, name: tab.name, code };
      this.#syncMainPreview();
      this.#announce(`Preview could not load for ${tab.name}`);
    }
  }

  async #requestMediaPreview(
    relativePath: string,
    bridge: ExplorerBridge,
    route: MediaPreviewRoute,
    canContinue: () => boolean,
  ): Promise<NormalizedMediaPreview | undefined> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!canContinue()) return undefined;
      try {
        const rawInfo = await bridge.request<unknown>("explorer.media.info", { relativePath });
        if (!canContinue()) return undefined;
        const info = normalizeMediaInfo(rawInfo, route);
        const bytes = new Uint8Array(info.sizeBytes);
        let offset = 0;
        for (let chunkIndex = 0; chunkIndex < info.chunkCount; chunkIndex += 1) {
          if (!canContinue()) return undefined;
          const length = Math.min(info.chunkSize, info.sizeBytes - offset);
          const rawChunk = await bridge.request<unknown>("explorer.media.chunk", {
            relativePath,
            offset,
            length,
            expectedSizeBytes: info.sizeBytes,
            expectedVersion: info.version,
          });
          if (!canContinue()) return undefined;
          const chunk = normalizeMediaChunk(rawChunk, offset, length, info.sizeBytes);
          bytes.set(chunk.bytes, offset);
          offset += chunk.bytes.byteLength;
        }
        if (offset !== info.sizeBytes) {
          throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview ended before the complete file was received." });
        }
        if (info.kind === "model") {
          const inspection = inspectModelPreviewSource(bytes, info.mimeType);
          const modelResources = await this.#requestModelResources(
            relativePath,
            info.version,
            inspection.externalResourceUris,
            info.sizeBytes,
            bridge,
            canContinue,
          );
          if (!modelResources || !canContinue()) return undefined;
          return {
            kind: "model",
            mimeType: info.mimeType,
            sizeBytes: info.sizeBytes,
            bytes,
            modelVersion: info.version,
            modelResources,
          };
        }
        return { kind: info.kind, mimeType: info.mimeType, sizeBytes: info.sizeBytes, bytes };
      } catch (error) {
        if (attempt === 0 && errorCode(error) === "CONFLICT" && canContinue()) continue;
        throw error;
      }
    }
    return undefined;
  }

  async #requestModelResources(
    modelRelativePath: string,
    expectedModelVersion: string,
    resourceUris: readonly string[],
    modelSizeBytes: number,
    bridge: ExplorerBridge,
    canContinue: () => boolean,
  ): Promise<readonly MainPreviewModelResource[] | undefined> {
    if (resourceUris.length > MAX_MODEL_RESOURCE_COUNT) {
      throw new ModelPreviewSourceError(`This model references more than ${MAX_MODEL_RESOURCE_COUNT.toLocaleString()} external resources.`);
    }
    const resources: MainPreviewModelResource[] = [];
    let aggregateBytes = modelSizeBytes;
    for (const resourceUri of resourceUris) {
      if (!canContinue()) return undefined;
      const rawInfo = await bridge.request<unknown>("explorer.model.resource.info", {
        modelRelativePath,
        resourceUri,
        expectedModelVersion,
      });
      if (!canContinue()) return undefined;
      const info = normalizeModelResourceInfo(rawInfo);
      aggregateBytes += info.sizeBytes;
      if (aggregateBytes > MAX_MODEL_AGGREGATE_BYTES) {
        throw new ModelPreviewSourceError(
          `This model and its resources exceed the ${(MAX_MODEL_AGGREGATE_BYTES / (1024 * 1024)).toLocaleString()} MiB preview limit.`,
        );
      }
      const bytes = new Uint8Array(info.sizeBytes);
      let offset = 0;
      for (let chunkIndex = 0; chunkIndex < info.chunkCount; chunkIndex += 1) {
        if (!canContinue()) return undefined;
        const length = Math.min(info.chunkSize, info.sizeBytes - offset);
        const rawChunk = await bridge.request<unknown>("explorer.model.resource.chunk", {
          modelRelativePath,
          resourceUri,
          expectedModelVersion,
          offset,
          length,
          expectedSizeBytes: info.sizeBytes,
          expectedVersion: info.version,
        });
        if (!canContinue()) return undefined;
        const chunk = normalizeMediaChunk(rawChunk, offset, length, info.sizeBytes);
        bytes.set(chunk.bytes, offset);
        offset += chunk.bytes.byteLength;
      }
      if (offset !== info.sizeBytes) {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The model resource ended before the complete file was received." });
      }
      resources.push({ uri: resourceUri, mimeType: info.mimeType, sizeBytes: info.sizeBytes, bytes });
    }
    return resources;
  }

  #previewView(tab: PreviewTab, preview: NormalizedPreview): MainPreviewFileView {
    if (preview.kind === "unsupported") {
      return {
        kind: "unsupported",
        path: tab.path,
        name: tab.name,
        sizeBytes: preview.sizeBytes,
        reason: preview.reason,
      };
    }
    if ("bytes" in preview) {
      if (preview.kind === "model") {
        if (!preview.modelVersion || !preview.modelResources) {
          return { kind: "error", path: tab.path, name: tab.name, code: "INVALID_REQUEST", message: "The model preview response was incomplete." };
        }
        return {
          kind: "model",
          path: tab.path,
          name: tab.name,
          mimeType: preview.mimeType === GLTF_BINARY_PREVIEW_MIME ? GLTF_BINARY_PREVIEW_MIME : GLTF_JSON_PREVIEW_MIME,
          sizeBytes: preview.sizeBytes,
          bytes: preview.bytes,
          version: preview.modelVersion,
          resources: preview.modelResources,
        };
      }
      return {
        kind: preview.kind,
        path: tab.path,
        name: tab.name,
        mimeType: preview.mimeType,
        sizeBytes: preview.sizeBytes,
        bytes: preview.bytes,
      };
    }
    const editability = {
      editable: preview.editable,
      ...(preview.version === undefined ? {} : { version: preview.version }),
      ...(preview.lineEnding === undefined ? {} : { lineEnding: preview.lineEnding }),
    };
    return preview.text
      ? {
          kind: "text",
          path: tab.path,
          name: tab.name,
          text: preview.text,
          sizeBytes: preview.sizeBytes,
          truncated: preview.truncated,
          ...editability,
        }
      : { kind: "empty", path: tab.path, name: tab.name, sizeBytes: preview.sizeBytes, ...editability };
  }

  #canApplyPreview(
    tab: PreviewTab,
    bridge: ExplorerBridge,
    context: ExplorerContext,
    mainPreview: CodeCodexMainPreviewElement,
    generation: number,
    sessionRevision: number,
    instanceId: number,
    revision: number,
  ): boolean {
    return this.#connected &&
      !this.#dismissed &&
      this.#generation === generation &&
      this.#previewSessionRevision === sessionRevision &&
      tab.instanceId === instanceId &&
      tab.revision === revision &&
      this.#previewTabs.includes(tab) &&
      this.#bridge === bridge &&
      this.#context === context &&
      this.#threadId === context.threadId &&
      this.#mainPreview === mainPreview &&
      mainPreview.isConnected &&
      mainPreview.parentElement === this.#mainPreviewSurface;
  }

  #markPreviewModified(path: string): void {
    const tab = this.#previewTabs.find((candidate) => candidate.path === path);
    if (!tab) return;
    if (this.#editSaving && this.#editingPath === path) {
      tab.modifiedDuringSave = true;
      tab.dirty = true;
      return;
    }
    if (tab.timer) clearTimeout(tab.timer);
    tab.timer = undefined;
    tab.revision += 1;
    tab.dirty = true;
    if (this.#editingPath === path) {
      this.#editError = "This file changed on disk. Reload it before saving.";
      this.#syncMainPreview();
      return;
    }
    tab.view = { kind: "loading", path: tab.path, name: tab.name };
    if (this.#activePreviewPath === path) this.#schedulePreview(tab);
    else this.#syncMainPreview();
  }

  #closePreviewTab(path: string, announce = true): void {
    const index = this.#previewTabs.findIndex((candidate) => candidate.path === path);
    if (index < 0) return;
    if (this.#editingPath === path && !this.#leaveEditing("Close this file and discard your unsaved changes?")) {
      this.#syncMainPreview();
      return;
    }
    const [closed] = this.#previewTabs.splice(index, 1);
    if (!closed) return;
    this.#disposePreviewTab(closed);
    let activatedTab: PreviewTab | undefined;
    if (this.#activePreviewPath === path) {
      this.#activePreviewPath = this.#previewTabs[index]?.path ?? this.#previewTabs[index - 1]?.path ?? null;
      activatedTab = this.#previewTabs.find((candidate) => candidate.path === this.#activePreviewPath);
    }
    if (activatedTab && (activatedTab.dirty || activatedTab.view.kind === "error" || activatedTab.revision === 0)) {
      this.#schedulePreview(activatedTab, 0);
    } else {
      this.#syncMainPreview();
    }
    if (!this.#previewTabs.length) this.#detachMainPreview(false);
    this.#renderVisible();
    if (announce) this.#announce(`${closed.name} closed`);
  }

  #disposePreviewTab(tab: PreviewTab): void {
    if (tab.timer) clearTimeout(tab.timer);
    tab.timer = undefined;
    tab.revision += 1;
    tab.dirty = false;
    tab.modifiedDuringSave = false;
    tab.view = { kind: "loading", path: tab.path, name: tab.name };
  }

  #purgePreviewTabs(renderRows = true): void {
    this.#previewSessionRevision += 1;
    this.#clearEditing(false);
    for (const tab of this.#previewTabs) this.#disposePreviewTab(tab);
    this.#previewTabs.splice(0);
    this.#activePreviewPath = null;
    this.#syncMainPreview();
    this.#detachMainPreview(false);
    if (renderRows) this.#renderVisible();
  }

  #syncMainPreview(): void {
    this.#releaseInactiveMediaPreviews();
    this.dataset.previewTabs = String(this.#previewTabs.length);
    const editor = this.#editingPath
      ? {
          path: this.#editingPath,
          draft: this.#editDraft,
          saving: this.#editSaving,
          ...(this.#editError === undefined ? {} : { error: this.#editError }),
        }
      : undefined;
    this.#mainPreview?.setState({
      activePath: this.#activePreviewPath,
      tabs: this.#previewTabs.map((tab) => tab.view),
      enabledPreviewers: [...this.#enabledPreviewers],
      ...(editor ? { editor } : {}),
    });
    this.#syncEditModeButton();
  }

  #releaseInactiveMediaPreviews(): void {
    for (const tab of this.#previewTabs) {
      if (tab.path === this.#activePreviewPath) continue;
      const route = mediaPreviewRoute(tab.path);
      if (!route || !this.#enabledPreviewers.has(route.previewerId)) continue;
      if (tab.dirty && tab.view.kind === "loading" && tab.timer === undefined) continue;
      if (tab.timer) clearTimeout(tab.timer);
      tab.timer = undefined;
      tab.revision += 1;
      tab.dirty = true;
      tab.view = { kind: "loading", path: tab.path, name: tab.name };
    }
  }

  #ensureMainPreview(): CodeCodexMainPreviewElement | undefined {
    const surface = this.#mainPreviewSurface;
    if (!surface?.isConnected || this.#dismissed) return undefined;
    const qualifiedSurfaces = document.querySelectorAll(MAIN_SURFACE_SELECTOR);
    if (qualifiedSurfaces.length !== 1 || qualifiedSurfaces[0] !== surface) return undefined;
    if (this.#mainPreview?.parentElement === surface) return this.#mainPreview;
    this.#detachMainPreview(false);
    registerMainPreviewElement();
    const preview = document.createElement(MAIN_PREVIEW_TAG) as CodeCodexMainPreviewElement;
    preview.dataset.codeCodexOwned = "true";
    this.#mirrorThemeToMainPreview(preview);
    preview.addEventListener("cle-main-preview-activate", this.#onMainPreviewActivate as EventListener);
    preview.addEventListener("cle-main-preview-close", this.#onMainPreviewClose as EventListener);
    preview.addEventListener("cle-main-preview-draft", this.#onMainPreviewDraft as EventListener);
    preview.addEventListener("cle-main-preview-save", this.#onMainPreviewSave as EventListener);
    preview.addEventListener("cle-main-preview-reload", this.#onMainPreviewReload as EventListener);
    surface.append(preview);
    this.#mainPreview = preview;
    return preview;
  }

  #detachMainPreview(forgetSurface = true): void {
    const preview = this.#mainPreview;
    this.#mainPreview = undefined;
    if (forgetSurface) this.#mainPreviewSurface = undefined;
    if (!preview) return;
    preview.removeEventListener("cle-main-preview-activate", this.#onMainPreviewActivate as EventListener);
    preview.removeEventListener("cle-main-preview-close", this.#onMainPreviewClose as EventListener);
    preview.removeEventListener("cle-main-preview-draft", this.#onMainPreviewDraft as EventListener);
    preview.removeEventListener("cle-main-preview-save", this.#onMainPreviewSave as EventListener);
    preview.removeEventListener("cle-main-preview-reload", this.#onMainPreviewReload as EventListener);
    preview.setState({ activePath: null, tabs: [] });
    preview.remove();
  }

  #onMainPreviewActivate = (event: CustomEvent<unknown>): void => {
    const detail = asRecord(event.detail);
    if (detail?.kind === "conversation") {
      if (!this.#leaveEditing("Return to the conversation and discard your unsaved changes?")) {
        event.preventDefault();
        this.#syncMainPreview();
        return;
      }
      this.#activePreviewPath = null;
      this.#syncMainPreview();
      this.#renderVisible();
      this.#announce("Conversation shown");
      return;
    }
    if (detail?.kind !== "file" || typeof detail.path !== "string") return;
    const tab = this.#previewTabs.find((candidate) => candidate.path === detail.path);
    if (!tab) return;
    if (this.#activePreviewPath === tab.path) return;
    if (
      this.#editingPath !== null &&
      this.#editingPath !== tab.path &&
      !this.#leaveEditing("Switch files and discard your unsaved changes?")
    ) {
      event.preventDefault();
      this.#syncMainPreview();
      return;
    }
    this.#activePreviewPath = tab.path;
    if (tab.dirty || tab.view.kind === "error") this.#schedulePreview(tab);
    else this.#syncMainPreview();
    this.#renderVisible();
  };

  #onMainPreviewClose = (event: CustomEvent<unknown>): void => {
    const detail = asRecord(event.detail);
    if (typeof detail?.path === "string") this.#closePreviewTab(detail.path);
  };

  #onMainPreviewDraft = (event: CustomEvent<unknown>): void => {
    if (event.target !== this.#mainPreview) return;
    const detail = asRecord(event.detail);
    if (detail?.path !== this.#editingPath || typeof detail.text !== "string") return;
    this.#editDraft = detail.text;
    this.#editRevision += 1;
    this.#syncEditModeButton();
  };

  #onMainPreviewSave = (event: CustomEvent<unknown>): void => {
    if (event.target !== this.#mainPreview) return;
    const detail = asRecord(event.detail);
    if (detail?.path === this.#editingPath) void this.#saveEditing(false);
  };

  #onMainPreviewReload = (event: CustomEvent<unknown>): void => {
    if (event.target !== this.#mainPreview) return;
    const detail = asRecord(event.detail);
    if (detail?.path === this.#editingPath) this.#reloadEditedFile();
  };

  #runTypeahead(character: string): void {
    if (this.#typeaheadTimer) clearTimeout(this.#typeaheadTimer);
    this.#typeahead += character.toLocaleLowerCase();
    const start = (this.#focusedIndex + 1) % this.#rows.length;
    for (let offset = 0; offset < this.#rows.length; offset += 1) {
      const index = (start + offset) % this.#rows.length;
      const name = this.#rows[index]?.node?.name.toLocaleLowerCase();
      if (name?.startsWith(this.#typeahead)) {
        this.#focusIndex(index);
        break;
      }
    }
    this.#typeaheadTimer = setTimeout(() => (this.#typeahead = ""), 700);
  }

  #startResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.#settings.width;
    this.#resizeHandle.dataset.resizing = "true";
    const cursor = document.documentElement.style.cursor;
    const userSelect = document.documentElement.style.userSelect;
    document.documentElement.style.cursor = "ew-resize";
    document.documentElement.style.userSelect = "none";

    const move = (moveEvent: PointerEvent) => {
      this.#settings = { ...this.#settings, width: this.#clampWidth(startWidth + moveEvent.clientX - startX) };
      this.#applySettings();
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      delete this.#resizeHandle.dataset.resizing;
      document.documentElement.style.cursor = cursor;
      document.documentElement.style.userSelect = userSelect;
      this.#persistSettings();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  #onResizeKeyDown(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = event.shiftKey ? 40 : 10;
    this.#settings = { ...this.#settings, width: this.#clampWidth(this.#settings.width + (event.key === "ArrowRight" ? amount : -amount)) };
    this.#applySettings();
    this.#persistSettings();
  }

  #clampWidth(width: number): number {
    return Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
  }

  #effectiveWidth(): number {
    const viewportLimit = Math.max(1, Math.floor(window.innerWidth * 0.84));
    return Math.min(this.#settings.width, viewportLimit);
  }

  #readEnabledPreviewers(): readonly string[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(PREVIEWER_SETTINGS_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && PREVIEWER_IDS.has(entry)))];
    } catch {
      return [];
    }
  }

  #writeEnabledPreviewers(): void {
    try {
      localStorage.setItem(PREVIEWER_SETTINGS_KEY, JSON.stringify([...this.#enabledPreviewers]));
    } catch {
      // Preview extensions remain enabled for this session when DOM storage is unavailable.
    }
  }

  #readEnabledAppearancePlugins(): readonly string[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(APPEARANCE_PLUGIN_SETTINGS_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && APPEARANCE_PLUGIN_IDS.has(entry)))];
    } catch {
      return [];
    }
  }

  #writeEnabledAppearancePlugins(): void {
    try {
      localStorage.setItem(APPEARANCE_PLUGIN_SETTINGS_KEY, JSON.stringify([...this.#enabledAppearancePlugins]));
    } catch {
      // Appearance plugins remain enabled for this session when DOM storage is unavailable.
    }
  }

  #transparencyPreferenceBlocked(): boolean {
    return this.#forcedColorsQuery?.matches === true || this.#reducedTransparencyQuery?.matches === true;
  }

  #transparentBackgroundPresentation(): string | undefined {
    const root = document.documentElement;
    if (!root.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE)) return undefined;
    const background = root.style.getPropertyValue(TRANSPARENT_BACKGROUND_COLOR_PROPERTY).trim();
    return background === "transparent" ? background : undefined;
  }

  #applyTransparentBackgroundPresentation(background: string): void {
    const root = document.documentElement;
    if (root.style.getPropertyValue(TRANSPARENT_BACKGROUND_COLOR_PROPERTY).trim() !== background) {
      root.style.setProperty(TRANSPARENT_BACKGROUND_COLOR_PROPERTY, background);
    }
    if (!root.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE)) {
      root.toggleAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE, true);
    }
  }

  #clearTransparentBackgroundPresentation(): void {
    document.documentElement.toggleAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(TRANSPARENT_BACKGROUND_COLOR_PROPERTY);
  }

  #cancelAppearanceHealthCheck(): void {
    if (this.#appearanceHealthTimer !== undefined) clearTimeout(this.#appearanceHealthTimer);
    this.#appearanceHealthTimer = undefined;
  }

  #scheduleAppearanceHealthCheck(delay = TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS): void {
    if (
      this.#appearanceHealthTimer !== undefined ||
      !this.#connected ||
      this.#dismissed ||
      !this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) ||
      this.#transparencyPreferenceBlocked()
    ) {
      return;
    }
    this.#appearanceHealthTimer = setTimeout(() => {
      this.#appearanceHealthTimer = undefined;
      void this.#runAppearanceHealthCheck();
    }, Math.max(0, delay));
  }

  async #runAppearanceHealthCheck(): Promise<void> {
    if (
      this.#appearanceHealthPending ||
      this.#appearancePluginPending ||
      !this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) ||
      this.#transparencyPreferenceBlocked()
    ) {
      this.#scheduleAppearanceHealthCheck(250);
      return;
    }
    const bridge = this.#bridge;
    if (!bridge?.available || !this.#canUseAppearanceBridge(bridge)) return;

    this.#appearanceHealthPending = true;
    const operation = this.#appearanceOperation;
    let retryDelay = TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS;
    try {
      const result = await this.#setWindowTransparency(bridge, true);
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = true;
      this.#appearancePluginError = undefined;
    } catch (error) {
      retryDelay = 500;
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      this.#clearTransparentBackgroundPresentation();
      this.#appearancePluginApplied = false;
      this.#appearancePluginError = transparencyActionError(error, true);
    } finally {
      this.#appearanceHealthPending = false;
      if (this.#isCurrentAppearanceOperation(bridge, operation)) {
        this.#renderAppearancePlugin();
        this.#scheduleAppearanceHealthCheck(retryDelay);
      }
    }
  }

  async #toggleTransparentBackground(): Promise<void> {
    if (this.#appearancePluginPending) return;
    const bridge = this.#bridge;
    const enabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
    const nextEnabled = !enabled;
    const operation = ++this.#appearanceOperation;
    if (!nextEnabled) this.#cancelAppearanceHealthCheck();

    if (!bridge?.available) {
      this.#appearancePluginApplied = undefined;
      this.#appearancePluginError = "Restart Codex with Code-Codex, then try again.";
      this.#renderAppearancePlugin();
      this.#showActionNotice(`Transparent Background was not changed. ${this.#appearancePluginError}`, "error");
      return;
    }
    if (nextEnabled && this.#transparencyPreferenceBlocked()) {
      this.#appearancePluginError = "Turn off high contrast or reduced transparency, then try again.";
      this.#renderAppearancePlugin();
      this.#showActionNotice(`Transparent Background was not enabled. ${this.#appearancePluginError}`, "error");
      return;
    }

    this.#appearancePluginPending = true;
    this.#appearancePluginError = undefined;
    this.#renderAppearancePlugin();
    const previousBackground = this.#transparentBackgroundPresentation();
    this.#clearTransparentBackgroundPresentation();
    try {
      const result = await this.#setWindowTransparency(bridge, nextEnabled);
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (nextEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = nextEnabled;
      if (nextEnabled) this.#enabledAppearancePlugins.add(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      else this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Transparent Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (!nextEnabled && previousBackground) this.#applyTransparentBackgroundPresentation(previousBackground);
      if (nextEnabled) this.#appearancePluginApplied = false;
      this.#appearancePluginError = transparencyActionError(error, nextEnabled);
      this.#showActionNotice(this.#appearancePluginError, "error");
    } finally {
      if (this.#isCurrentAppearanceOperation(bridge, operation)) {
        this.#appearancePluginPending = false;
        this.#renderAppearancePlugin();
        this.#flushQueuedAppearanceSync(bridge);
        if (this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)) {
          this.#scheduleAppearanceHealthCheck();
        }
      }
    }
  }

  async #syncPersistedAppearance(bridge: ExplorerBridge, reportErrors: boolean): Promise<void> {
    if (!this.#canUseAppearanceBridge(bridge)) return;
    if (this.#appearancePluginPending) {
      this.#appearanceSyncQueued = true;
      return;
    }
    const persistedEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
    const requestedEnabled = persistedEnabled && !this.#transparencyPreferenceBlocked();
    const operation = ++this.#appearanceOperation;
    if (!requestedEnabled) this.#cancelAppearanceHealthCheck();
    this.#appearancePluginPending = true;
    this.#appearancePluginError = undefined;
    this.#renderAppearancePlugin();
    const previousBackground = this.#transparentBackgroundPresentation();
    this.#clearTransparentBackgroundPresentation();
    try {
      const result = await this.#setWindowTransparency(bridge, requestedEnabled);
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (requestedEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = requestedEnabled;
    } catch (error) {
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (!requestedEnabled && previousBackground) this.#applyTransparentBackgroundPresentation(previousBackground);
      if (requestedEnabled) this.#appearancePluginApplied = false;
      this.#appearancePluginError = transparencyActionError(error, requestedEnabled);
      if (reportErrors) this.#showActionNotice(this.#appearancePluginError, "error");
    } finally {
      if (this.#isCurrentAppearanceOperation(bridge, operation)) {
        this.#appearancePluginPending = false;
        this.#renderAppearancePlugin();
        this.#flushQueuedAppearanceSync(bridge);
        if (requestedEnabled) this.#scheduleAppearanceHealthCheck();
      }
    }
  }

  async #setWindowTransparency(bridge: ExplorerBridge, enabled: boolean): Promise<WindowTransparencyResult> {
    const previous = this.#appearanceRpcTail;
    let release: (() => void) | undefined;
    this.#appearanceRpcTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const raw = await bridge.request<unknown>("explorer.window.transparency.set", { enabled });
      return validateTransparencyResult(raw, enabled);
    } finally {
      release?.();
    }
  }

  #isCurrentAppearanceOperation(bridge: ExplorerBridge, operation: number): boolean {
    return this.#appearanceOperation === operation && this.#canUseAppearanceBridge(bridge);
  }

  #flushQueuedAppearanceSync(bridge: ExplorerBridge): void {
    if (!this.#appearanceSyncQueued) return;
    this.#appearanceSyncQueued = false;
    void this.#syncPersistedAppearance(bridge, true);
  }

  #togglePreviewMarket(): void {
    if (this.#previewMarketOpen) {
      this.#closePreviewMarket(true);
      return;
    }
    this.#closeContextMenu(false);
    this.#previewMarketOpen = true;
    this.#previewMarketPopover.hidden = false;
    this.#previewMarketButton.setAttribute("aria-expanded", "true");
    this.#renderPreviewMarket();
    queueMicrotask(() => {
      if (this.#previewMarketOpen) this.#previewMarketCloseButton.focus();
    });
  }

  #closePreviewMarket(restoreFocus: boolean): void {
    if (!this.#previewMarketOpen && this.#previewMarketPopover.hidden) return;
    this.#previewMarketOpen = false;
    this.#previewMarketPopover.hidden = true;
    this.#previewMarketButton.setAttribute("aria-expanded", "false");
    if (restoreFocus && this.#previewMarketButton.isConnected) this.#previewMarketButton.focus();
  }

  #togglePreviewer(previewer: PreviewerDefinition): void {
    const wasEnabled = this.#enabledPreviewers.has(previewer.id);
    if (wasEnabled) this.#enabledPreviewers.delete(previewer.id);
    else this.#enabledPreviewers.add(previewer.id);
    this.#writeEnabledPreviewers();
    this.#renderPreviewMarket();
    if (previewer.kind === "markdown" || previewer.kind === "csv" || previewer.kind === "diagram") {
      this.#syncMainPreview();
    } else {
      this.#applyMediaPreviewerToggle(previewer.id, !wasEnabled);
    }
    this.#announce(`${previewer.title} ${wasEnabled ? "disabled" : "enabled"}`);
  }

  #renderPreviewMarket(): void {
    this.#renderAppearancePlugin();
    for (const previewer of PREVIEWER_DEFINITIONS) {
      const enabled = this.#enabledPreviewers.has(previewer.id);
      const status = this.#previewerStatuses.get(previewer.id);
      const button = this.#previewerButtons.get(previewer.id);
      if (!status || !button) continue;
      status.textContent = enabled ? "Enabled" : "Disabled";
      status.dataset.enabled = String(enabled);
      button.textContent = enabled ? "Disable" : "Enable";
      button.dataset.enabled = String(enabled);
      button.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${previewer.title}`);
    }
  }

  #renderAppearancePlugin(): void {
    const enabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
    const bridgeAvailable = this.#bridge?.available === true;
    const preferenceBlocked = this.#transparencyPreferenceBlocked();
    const presentationApplied = this.#transparentBackgroundPresentation() !== undefined;
    const active = enabled && this.#appearancePluginApplied === true && presentationApplied && !preferenceBlocked;
    let status = enabled ? "Enabled" : "Disabled";
    if (enabled && preferenceBlocked) status = "Enabled · Paused";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (!enabled && this.#appearancePluginApplied === undefined) status = "Disabled · Not verified";

    this.#transparentBackgroundStatus.textContent = status;
    this.#transparentBackgroundStatus.dataset.enabled = String(active);
    this.#transparentBackgroundStatus.dataset.pending = String(this.#appearancePluginPending);
    this.#transparentBackgroundCard.setAttribute("aria-busy", String(this.#appearancePluginPending));

    this.#transparentBackgroundButton.textContent = this.#appearancePluginPending ? "Applying…" : enabled ? "Disable" : "Enable";
    this.#transparentBackgroundButton.dataset.enabled = String(enabled);
    this.#transparentBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#transparentBackgroundButton.setAttribute(
      "aria-label",
      this.#appearancePluginPending
        ? "Applying Transparent Background"
        : `${enabled ? "Disable" : "Enable"} Transparent Background`,
    );
    this.#transparentBackgroundButton.disabled =
      this.#appearancePluginPending || !bridgeAvailable || (!enabled && preferenceBlocked);

    let title = "";
    if (!bridgeAvailable) title = "Restart Codex with Code-Codex to change this extension.";
    else if (!enabled && preferenceBlocked) title = "Turn off high contrast or reduced transparency to enable this extension.";
    else if (this.#appearancePluginError) title = this.#appearancePluginError;
    if (title) this.#transparentBackgroundButton.title = title;
    else this.#transparentBackgroundButton.removeAttribute("title");
  }

  #applyMediaPreviewerToggle(previewerId: string, enabled: boolean): void {
    let activeReload: PreviewTab | undefined;
    for (const tab of this.#previewTabs) {
      if (mediaPreviewRoute(tab.path)?.previewerId !== previewerId) continue;
      if (tab.timer) clearTimeout(tab.timer);
      tab.timer = undefined;
      tab.revision += 1;
      tab.dirty = enabled;
      tab.view = enabled
        ? { kind: "loading", path: tab.path, name: tab.name }
        : { kind: "unsupported", path: tab.path, name: tab.name, sizeBytes: 0, reason: "previewer-disabled" };
      if (enabled && tab.path === this.#activePreviewPath) activeReload = tab;
    }
    if (activeReload) this.#schedulePreview(activeReload, 0);
    else this.#syncMainPreview();
  }

  #readLocalSettings(): ExplorerSettings {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async #loadNativeSettings(bridge: ExplorerBridge, generation: number): Promise<void> {
    try {
      const raw = await bridge.request<unknown>("explorer.settings.get", {});
      if (!raw || !this.#canUseBridge(bridge, generation)) return;
      this.#settings = normalizeSettings(asRecord(raw)?.settings ?? raw);
      this.#applySettings();
      this.#writeLocalSettings();
    } catch {
      if (!this.#canUseBridge(bridge, generation)) return;
      // Local storage is the reversible fallback when native settings are unavailable.
    }
  }

  #applySettings(): void {
    this.#settings = { ...this.#settings, width: this.#clampWidth(this.#settings.width) };
    this.style.setProperty("--cle-width", `${this.#effectiveWidth()}px`);
    this.#resizeHandle.setAttribute("aria-valuenow", String(this.#settings.width));
    this.dataset.collapsed = String(this.#settings.collapsed);
    this.#collapseButton.setAttribute("aria-expanded", String(!this.#settings.collapsed));
    this.#collapsedTab.setAttribute("aria-expanded", String(!this.#settings.collapsed));
  }

  #writeLocalSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.#settings));
    } catch {
      // The native settings bridge remains available when DOM storage is disabled.
    }
  }

  #nativeSettings(): Record<string, unknown> {
    return {
      panelWidth: this.#settings.width,
      collapsed: this.#settings.collapsed,
      showHidden: true,
      showIgnored: true,
    };
  }

  #persistSettings(): void {
    this.#writeLocalSettings();
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = setTimeout(() => {
      if (this.#bridge?.available) {
        void this.#bridge.request("explorer.settings.set", this.#nativeSettings()).catch(() => undefined);
      }
    }, 220);
  }

  #renderStatus(): void {
    this.#statusCode.textContent = this.#state === "ready" || this.#state === "empty" ? `${this.#rows.filter((row) => row.kind === "node").length} VIS` : this.#state.toUpperCase().slice(0, 8);
  }

  #announce(message: string): void {
    this.#liveRegion.textContent = "";
    requestAnimationFrame(() => (this.#liveRegion.textContent = message));
  }

  #showActionNotice(message: string, tone: "success" | "error" = "success"): void {
    if (tone !== "error") {
      this.#hideActionNotice();
      return;
    }
    this.#hideActionNotice();
    this.#actionNotice.textContent = message;
    this.#actionNotice.dataset.tone = tone;
    this.#actionNotice.hidden = false;
    this.#announce(message);
    this.#actionNoticeTimer = setTimeout(() => this.#hideActionNotice(), ACTION_NOTICE_DURATION_MS);
  }

  #hideActionNotice(): void {
    if (this.#actionNoticeTimer) clearTimeout(this.#actionNoticeTimer);
    this.#actionNoticeTimer = undefined;
    this.#actionNotice.hidden = true;
    this.#actionNotice.textContent = "";
    delete this.#actionNotice.dataset.tone;
  }

  #clearTimers(): void {
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    if (this.#typeaheadTimer) clearTimeout(this.#typeaheadTimer);
    if (this.#marqueeLongPressTimer) clearTimeout(this.#marqueeLongPressTimer);
    this.#cancelAppearanceHealthCheck();
    this.#hideActionNotice();
    for (const tab of this.#previewTabs) {
      if (tab.timer) clearTimeout(tab.timer);
      tab.timer = undefined;
    }
    this.#clearWorkspaceTimers();
  }

  #clearWorkspaceTimers(): void {
    for (const timer of this.#changeTimers.values()) clearTimeout(timer);
    for (const timer of this.#refreshTimers.values()) clearTimeout(timer);
    this.#changeTimers.clear();
    this.#refreshTimers.clear();
    this.#pendingMarks.clear();
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isTransientBootstrapError(error: unknown): boolean {
  return error instanceof ExplorerBridgeError && (error.code === "TIMEOUT" || error.code === "CANCELLED");
}

function normalizeContext(raw: unknown, requestedThreadId: string): ExplorerContext {
  const object = asRecord(raw);
  if (!object) throw new ExplorerBridgeError({ code: "NO_CONTEXT", message: "No local workspace is bound to this task." });
  const threadId = typeof object.threadId === "string" ? object.threadId : requestedThreadId;
  if (threadId !== requestedThreadId) throw new ExplorerBridgeError({ code: "NO_CONTEXT", message: "The active task changed while resolving its workspace." });
  const projectName = typeof object.projectName === "string" && object.projectName ? object.projectName : "Local project";
  const rootName = typeof object.rootName === "string" && object.rootName ? object.rootName : projectName;
  const rootPath = typeof object.rootPath === "string" ? object.rootPath : "";
  const context: ExplorerContext = { threadId, projectName, rootName, rootPath, compatible: object.compatible !== false };
  if (typeof object.reason === "string") context.reason = object.reason;
  return context;
}

function normalizeList(raw: unknown): ListResult {
  const object = asRecord(raw);
  const source = Array.isArray(raw) ? raw : Array.isArray(object?.entries) ? object.entries : Array.isArray(object?.nodes) ? object.nodes : null;
  if (!source) throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The directory response was not valid." });
  const entries = source.map(normalizeNode).filter((node): node is TreeNodeInput => Boolean(node));
  const result: ListResult = { entries };
  if (typeof object?.nextCursor === "string" && object.nextCursor) result.nextCursor = object.nextCursor;
  return result;
}

function normalizePreview(raw: unknown): NormalizedPreview {
  const object = asRecord(raw);
  if (!object || (object.kind !== "text" && object.kind !== "unsupported")) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The preview response was not valid." });
  }
  if (!Number.isSafeInteger(object.sizeBytes) || (object.sizeBytes as number) < 0 || typeof object.truncated !== "boolean") {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The preview metadata was not valid." });
  }
  const sizeBytes = object.sizeBytes as number;
  if (object.kind === "unsupported") {
    return {
      kind: "unsupported",
      sizeBytes,
      truncated: object.truncated,
      reason: normalizePreviewReason(object.reason),
    };
  }
  if (typeof object.text !== "string") {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The preview text was not valid." });
  }
  const capped = object.text.slice(0, MAX_PREVIEW_TEXT_UNITS);
  const truncated = object.truncated || capped.length < object.text.length;
  const version = typeof object.version === "string" && /^[0-9a-f]{64}$/.test(object.version) ? object.version : undefined;
  const lineEnding = normalizeLineEnding(object.lineEnding);
  const editable = object.editable === true && !truncated && Boolean(version) && lineEnding !== undefined && lineEnding !== "mixed";
  return {
    kind: "text",
    text: capped,
    sizeBytes,
    truncated,
    editable,
    ...(version === undefined ? {} : { version }),
    ...(lineEnding === undefined ? {} : { lineEnding }),
  };
}

function normalizeMediaInfo(raw: unknown, route: MediaPreviewRoute): NormalizedMediaInfo {
  const object = asRecord(raw);
  if (
    !object ||
    object.kind !== route.kind ||
    typeof object.mimeType !== "string" ||
    !route.mimeTypes.includes(object.mimeType) ||
    !Number.isSafeInteger(object.sizeBytes) ||
    (object.sizeBytes as number) <= 0 ||
    (object.sizeBytes as number) > route.maxBytes ||
    !Number.isSafeInteger(object.chunkSize) ||
    (object.chunkSize as number) <= 0 ||
    (object.chunkSize as number) > MAX_MEDIA_CHUNK_BYTES ||
    !Number.isSafeInteger(object.chunkCount) ||
    (object.chunkCount as number) <= 0 ||
    typeof object.version !== "string" ||
    !/^[0-9a-f]{64}$/.test(object.version)
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview metadata was not valid." });
  }
  const sizeBytes = object.sizeBytes as number;
  const chunkSize = object.chunkSize as number;
  const chunkCount = object.chunkCount as number;
  if (chunkCount !== Math.ceil(sizeBytes / chunkSize)) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview chunk count was not valid." });
  }
  return {
    kind: route.kind,
    mimeType: object.mimeType,
    sizeBytes,
    chunkSize,
    chunkCount,
    version: object.version,
  };
}

function normalizeModelResourceInfo(raw: unknown): NormalizedModelResourceInfo {
  const object = asRecord(raw);
  const resourceLimit = typeof object?.mimeType === "string" && object.mimeType.startsWith("image/")
    ? MAX_MODEL_TEXTURE_BYTES
    : MAX_MODEL_RESOURCE_BYTES;
  if (
    !object ||
    typeof object.mimeType !== "string" ||
    !MODEL_RESOURCE_MIME_TYPES.has(object.mimeType) ||
    !Number.isSafeInteger(object.sizeBytes) ||
    (object.sizeBytes as number) <= 0 ||
    (object.sizeBytes as number) > resourceLimit ||
    !Number.isSafeInteger(object.chunkSize) ||
    (object.chunkSize as number) <= 0 ||
    (object.chunkSize as number) > MAX_MEDIA_CHUNK_BYTES ||
    !Number.isSafeInteger(object.chunkCount) ||
    (object.chunkCount as number) <= 0 ||
    typeof object.version !== "string" ||
    !/^[0-9a-f]{64}$/.test(object.version)
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The model resource metadata was not valid." });
  }
  const sizeBytes = object.sizeBytes as number;
  const chunkSize = object.chunkSize as number;
  const chunkCount = object.chunkCount as number;
  if (chunkCount !== Math.ceil(sizeBytes / chunkSize)) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The model resource chunk count was not valid." });
  }
  return { mimeType: object.mimeType, sizeBytes, chunkSize, chunkCount, version: object.version };
}

function normalizeMediaChunk(
  raw: unknown,
  expectedOffset: number,
  expectedLength: number,
  totalSizeBytes: number,
): { readonly bytes: Uint8Array; readonly eof: boolean } {
  const object = asRecord(raw);
  const maxEncodedLength = Math.ceil(expectedLength / 3) * 4 + 4;
  if (
    !object ||
    object.offset !== expectedOffset ||
    typeof object.dataBase64 !== "string" ||
    object.dataBase64.length > maxEncodedLength ||
    typeof object.eof !== "boolean"
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview chunk was not valid." });
  }
  let binary: string;
  try {
    binary = window.atob(object.dataBase64);
  } catch {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview chunk was not valid Base64." });
  }
  if (binary.length !== expectedLength) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview chunk had an unexpected length." });
  }
  const eof = expectedOffset + expectedLength === totalSizeBytes;
  if (object.eof !== eof) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The media preview ended at an unexpected position." });
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, eof };
}

function normalizeLineEnding(value: unknown): MainPreviewLineEnding | undefined {
  return value === "lf" || value === "crlf" || value === "none" || value === "mixed" ? value : undefined;
}

function isEditablePreview(
  view: MainPreviewFileView,
): view is (Extract<MainPreviewFileView, { kind: "text" | "empty" }> & { editable: true; version: string }) {
  return (view.kind === "text" || view.kind === "empty") && view.editable === true && typeof view.version === "string" && Boolean(view.version);
}

function previewText(view: MainPreviewFileView): string {
  return view.kind === "text" ? view.text : "";
}

function normalizeTextareaText(text: string): string {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function restoreLineEndings(text: string, lineEnding: MainPreviewLineEnding | undefined): string {
  const normalized = normalizeTextareaText(text);
  return lineEnding === "crlf" ? normalized.replaceAll("\n", "\r\n") : normalized;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 16 * 1024;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    let chunk = "";
    const end = Math.min(bytes.length, start + chunkSize);
    for (let index = start; index < end; index += 1) chunk += String.fromCharCode(bytes[index] ?? 0);
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
}

function normalizeHeaderLabel(value: string): string {
  const normalized = value.trim().replace(/[\\/]+$/, "");
  return (normalized.split(/[\\/]/).at(-1) ?? normalized).replace(/\s+/g, " ").toLocaleLowerCase();
}

function editSaveError(error: unknown): string {
  const code = errorCode(error);
  if (code === "CONFLICT") return "This file changed on disk. Reload it before saving.";
  if (code === "ACCESS_DENIED") return "Windows denied permission to save this file. Your draft has been kept.";
  if (code === "NOT_FOUND") return "This file no longer exists at its original location. Your draft has been kept.";
  if (code === "TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" || code === "CONTENT_TOO_LARGE") {
    return "This draft is larger than the 64 KB editing limit.";
  }
  if (code === "NOT_EDITABLE" || code === "UNSUPPORTED_TYPE") {
    return "This file is no longer eligible for editing. Reload it to continue.";
  }
  if (code === "NO_BRIDGE") return "Code-Codex is disconnected. Your draft has been kept.";
  return "Changes could not be saved. Try again or reload the file.";
}

function mediaPreviewError(error: unknown): string {
  if (error instanceof ModelPreviewSourceError) return error.message;
  const code = errorCode(error);
  if (code === "CONTENT_TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" || code === "TOO_LARGE") {
    return "This media file is larger than the preview limit.";
  }
  if (code === "NOT_EDITABLE" || code === "UNSUPPORTED_TYPE") {
    return "The file contents do not match the selected preview format.";
  }
  if (code === "CONFLICT") return "The file changed while it was loading. Select it again to retry.";
  if (code === "ACCESS_DENIED" || code === "OUTSIDE_WORKSPACE") return "Preview is blocked for this file.";
  if (code === "NO_BRIDGE") return "Code-Codex is disconnected.";
  return "The media file could not be loaded. Select it again to retry.";
}

function normalizePreviewReason(value: unknown): PreviewUnavailableReason {
  return value === "binary" ||
    value === "invalid-utf8" ||
    value === "sensitive" ||
    value === "unsupported-type"
    ? value
    : "unknown";
}

function normalizeNode(raw: unknown): TreeNodeInput | null {
  const object = asRecord(raw);
  if (!object || typeof object.name !== "string") return null;
  const relativePath = typeof object.relativePath === "string" ? object.relativePath : typeof object.path === "string" ? object.path : null;
  const kind = object.kind;
  if (!relativePath || (kind !== "directory" && kind !== "file" && kind !== "symlink")) return null;
  const node: TreeNodeInput = { name: object.name, relativePath, kind };
  if (typeof object.id === "string") node.id = object.id;
  if (object.change === "added" || object.change === "modified" || object.change === "deleted" || object.change === "renamed") node.change = object.change;
  if (object.inaccessible === true) node.inaccessible = true;
  if (typeof object.error === "string") node.error = object.error;
  return node;
}

function normalizeChange(raw: unknown): ExplorerChange | null {
  const object = asRecord(raw);
  if (!object || typeof object.relativePath !== "string") return null;
  const kind = object.kind;
  if (kind !== "added" && kind !== "modified" && kind !== "deleted" && kind !== "renamed") return null;
  const change: ExplorerChange = { relativePath: object.relativePath, kind };
  const fromPath = typeof object.fromRelativePath === "string" ? object.fromRelativePath : typeof object.oldRelativePath === "string" ? object.oldRelativePath : null;
  if (fromPath) change.fromRelativePath = fromPath;
  const node = normalizeNode(object.node);
  if (node) change.node = node;
  return change;
}

function normalizeSettings(raw: unknown): ExplorerSettings {
  const object = asRecord(raw);
  const nativeWidth = object?.panelWidth;
  const width =
    typeof object?.width === "number" && Number.isFinite(object.width)
      ? object.width
      : typeof nativeWidth === "number" && Number.isFinite(nativeWidth)
        ? nativeWidth
        : DEFAULT_SETTINGS.width;
  return {
    width,
    collapsed: object?.collapsed === true,
    showHidden: true,
    showIgnored: true,
  };
}

// Join the absolute workspace root with a tree-relative path, matching the
// root's separator (backslash on Windows, forward slash elsewhere) so the
// result is a native absolute path.
function joinAbsolutePath(root: string, relativePath: string): string {
  const separator = root.includes("\\") ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  const relative = relativePath.replace(/[\\/]+/g, separator);
  return relative ? `${base}${separator}${relative}` : base;
}

function errorCode(error: unknown): string {
  if (error instanceof ExplorerBridgeError) return String(error.code);
  if (error instanceof BridgeUnavailableError) return "NO_BRIDGE";
  return "INTERNAL";
}

interface WindowTransparencyResult {
  readonly enabled: boolean;
  readonly background: "transparent";
}

function validateTransparencyResult(raw: unknown, requestedEnabled: boolean): WindowTransparencyResult {
  const result = asRecord(raw);
  if (
    !result ||
    Object.keys(result).length !== 2 ||
    result.enabled !== requestedEnabled ||
    result.background !== "transparent"
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The window transparency response was not valid." });
  }
  return { enabled: requestedEnabled, background: "transparent" };
}

function transparencyActionError(error: unknown, requestedEnabled: boolean): string {
  const action = requestedEnabled ? "enabled" : "disabled";
  const code = errorCode(error);
  if (code === "NO_BRIDGE") return `Transparent Background was not ${action}. Restart Codex with Code-Codex, then try again.`;
  if (code === "TIMEOUT") return `Transparent Background was not ${action}. Try again.`;
  if (code === "ACCESS_DENIED") return `Transparent Background was not ${action} because Windows denied access.`;
  if (
    code === "UNSUPPORTED" ||
    code === "UNSUPPORTED_VERSION" ||
    code === "NOT_SUPPORTED" ||
    code === "METHOD_NOT_FOUND" ||
    code === "WINDOW_UNAVAILABLE"
  ) {
    return "Transparent Background is not supported by this Codex window.";
  }
  return `Transparent Background was not ${action}. Try again.`;
}

function isPathWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

function isContextMenuAction(value: unknown): value is ContextMenuAction {
  return value === "preview" ||
    value === "new-file" ||
    value === "new-folder" ||
    value === "rename" ||
    value === "delete" ||
    value === "copy-relative" ||
    value === "copy-absolute" ||
    value === "reveal" ||
    value === "refresh";
}

function contextNameActionCopy(action: ContextMenuNameAction): {
  readonly title: string;
  readonly inputLabel: string;
  readonly submitLabel: string;
  readonly icon: string;
} {
  if (action === "new-file") {
    return { title: "New File", inputLabel: "File name", submitLabel: "Create", icon: icons.newFile };
  }
  if (action === "new-folder") {
    return { title: "New Folder", inputLabel: "Folder name", submitLabel: "Create", icon: icons.newFolder };
  }
  return { title: "Rename", inputLabel: "New name", submitLabel: "Rename", icon: icons.rename };
}

function entryNameValidationError(value: string): string | undefined {
  if (!value.length || !value.trim().length) return "Enter a name.";
  if (value.length > 255) return "Use a name with 255 characters or fewer.";
  if (value === "." || value === "..") return "That name is reserved by Windows.";
  if (/[\\/:]/.test(value)) return "A name cannot contain a slash, backslash, or colon.";
  if (/[<>"|?*\u0000-\u001f]/.test(value)) return "That name contains a character Windows does not allow.";
  if (/[ .]$/.test(value)) return "A name cannot end with a space or period.";

  const stem = value.split(".", 1)[0]?.toUpperCase() ?? "";
  if (
    stem === "CON" ||
    stem === "PRN" ||
    stem === "AUX" ||
    stem === "NUL" ||
    /^(?:COM|LPT)0*[1-9]$/.test(stem)
  ) {
    return "That name is reserved by Windows.";
  }
  return undefined;
}

function contextActionError(action: ContextMenuAction | "move" | "paste", error: unknown): string {
  const subject = action === "new-file"
    ? "The file"
    : action === "new-folder"
      ? "The folder"
      : action === "copy-relative" || action === "copy-absolute"
        ? "The path"
        : action === "reveal"
          ? "The item"
          : action === "refresh"
            ? "The directory"
            : "The item";
  const code = errorCode(error);
  if (code === "ACCESS_DENIED") return `${subject} could not be changed because Windows denied access.`;
  if (code === "NOT_FOUND") return `${subject} no longer exists.`;
  if (code === "CONFLICT" || code === "ALREADY_EXISTS") {
    if (action === "new-file") return "A file with that name already exists.";
    if (action === "new-folder") return "A folder with that name already exists.";
    if (action === "rename") return "An item with that name already exists.";
    if (action === "move") return "An item with that name already exists in this folder.";
    if (action === "delete") return "The item changed before it could be deleted. Refresh and try again.";
    return `${subject} already exists.`;
  }
  if (code === "INVALID_REQUEST" || code === "INVALID_NAME" || code === "INVALID_PATH") {
    return action === "new-file" || action === "new-folder" || action === "rename"
      ? "That name is not valid on Windows."
      : "The item path is no longer valid.";
  }
  if (code === "TOO_MANY_ENTRIES") return "This folder contains too many items to change safely.";
  if (code === "OUTSIDE_WORKSPACE") return "The item is outside the active workspace.";
  if (code === "CANCELLED") return "The action was cancelled.";
  if (code === "TIMEOUT") return "The action is taking longer than expected. Refresh before trying again.";
  if (code === "NO_BRIDGE") return "Code-Codex is disconnected.";
  return `${subject} action could not be completed.`;
}

function friendlyError(error: unknown): string {
  const code = errorCode(error);
  if (code === "ACCESS_DENIED") return "Access denied — press Enter to retry";
  if (code === "NOT_FOUND") return "Directory moved — press Enter to retry";
  if (code === "TOO_MANY_ENTRIES") return "Directory limit reached";
  return "Directory unavailable — press Enter to retry";
}
