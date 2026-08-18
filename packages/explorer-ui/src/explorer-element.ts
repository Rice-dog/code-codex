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
  POWERPOINT_FULL_FIDELITY_NOTICE,
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

declare const __CODE_CODEX_VERSION__: string;

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
const EXTERNAL_IMPORT_CHUNK_BYTES = 48 * 1024;
const EXTERNAL_IMPORT_REQUEST_INTERVAL_MS = 10;
const EXTERNAL_IMPORT_COMMIT_TIMEOUT_MS = 120_000;
const MAX_EXTERNAL_IMPORT_ENTRIES = 1_024;
const MAX_EXTERNAL_IMPORT_DEPTH = 64;
const MAX_EXTERNAL_IMPORT_FILE_BYTES = 512 * 1024 * 1024;
const MAX_EXTERNAL_IMPORT_TOTAL_BYTES = 1024 * 1024 * 1024;
const DEFAULT_SETTINGS: ExplorerSettings = { width: 260, collapsed: false, showHidden: true, showIgnored: true };
const SETTINGS_KEY = "code-codex:ui-settings:v1";
const PREVIEWER_SETTINGS_KEY = "code-codex:previewers:v1";
const APPEARANCE_PLUGIN_SETTINGS_KEY = "code-codex:appearance-plugins:v1";
const TRANSPARENT_BACKGROUND_PLUGIN_ID = "code-codex.transparent-background";
const PARTICLE_BACKGROUND_PLUGIN_ID = "code-codex.particle-image-background";
const APPEARANCE_PLUGIN_IDS = new Set([TRANSPARENT_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID]);
export const TRANSPARENT_BACKGROUND_ATTRIBUTE = "data-code-codex-transparent-background";
export const TRANSPARENT_BACKGROUND_COLOR_PROPERTY = "--code-codex-window-background";
export const PARTICLE_BACKGROUND_ATTRIBUTE = "data-code-codex-particle-image-background";
export const PARTICLE_BACKGROUND_COLOR_PROPERTY = "--code-codex-particle-background";
const TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS = 1_500;
const FORCED_COLORS_QUERY = "(forced-colors: active)";
const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";
const PARTICLE_BACKGROUND_SETTINGS_KEY = "code-codex:particle-image-background:v1";
const PARTICLE_BACKGROUND_THEME_LEASE_KEY = "code-codex:particle-theme-lease:v1";
const CODEX_DARK_APPLY_TIMEOUT_MS = 5_000;
const CODEX_APPEARANCE_POLL_INTERVAL_MS = 1_500;
const PARTICLE_BACKGROUND_DB_NAME = "code-codex-particle-image-background";
const PARTICLE_BACKGROUND_DB_VERSION = 1;
const PARTICLE_BACKGROUND_STORE = "images";
const PARTICLE_BACKGROUND_MAX_IMAGES = 32;
const PARTICLE_BACKGROUND_MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const PARTICLE_BACKGROUND_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const PARTICLE_BACKGROUND_SAMPLE_MAX_DIMENSION = 900;
const PARTICLE_BACKGROUND_PREPARE_TIMEOUT_MS = 30_000;
const PARTICLE_BACKGROUND_MASS_BUCKETS = 4_096;
const PARTICLE_BACKGROUND_POINTER_SEGMENTS = 40;
const PARTICLE_BACKGROUND_PARTICLE_LIFETIME_SECONDS = 1;
const PARTICLE_BACKGROUND_PARTICLE_LIFETIME_JITTER_SECONDS = 0.12;
const PARTICLE_BACKGROUND_MAX_LIFETIME_SECONDS = PARTICLE_BACKGROUND_PARTICLE_LIFETIME_SECONDS
  + PARTICLE_BACKGROUND_PARTICLE_LIFETIME_JITTER_SECONDS;
const PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS = PARTICLE_BACKGROUND_MAX_LIFETIME_SECONDS
  / PARTICLE_BACKGROUND_POINTER_SEGMENTS;
const PARTICLE_BACKGROUND_FLOW_STEP_SECONDS = 1 / 64;
const PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS = 0.18;
const PARTICLE_BACKGROUND_MAX_FRAME_DELTA_SECONDS = 0.1;
const PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH = 40;
const PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH = 400;
const PARTICLE_BACKGROUND_MORPH_NEAR_RESPONSE_RATIO = 3.2 / 5.2;
const PARTICLE_BACKGROUND_MORPH_STAGGER_RATIO = 1.4 / 5.2;
const PARTICLE_BACKGROUND_MORPH_DISTANCE_SCALE = 0.6;
const PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION = 0.08;
const PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT = 4.7438645;
const PARTICLE_BACKGROUND_MORPH_SETTLE_ERROR = 0.0015;
const PARTICLE_BACKGROUND_MORPH_SETTLE_VELOCITY = 0.005;
const PARTICLE_BACKGROUND_MORPH_VISIBILITY_RELEASE_SECONDS = 0.42;
const PARTICLE_BACKGROUND_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";
const PARTICLE_BACKGROUND_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
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
  previewNotice?: typeof POWERPOINT_FULL_FIDELITY_NOTICE;
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
  readonly previewNotice?: typeof POWERPOINT_FULL_FIDELITY_NOTICE;
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

interface ExternalDropCandidate {
  readonly handlePromise?: Promise<FileSystemHandle | null>;
  readonly entry?: FileSystemEntry;
  readonly file?: File;
}

interface ExternalDropMember {
  readonly relativePath: string;
  readonly kind: "file" | "directory";
  readonly file?: File;
}

interface ExternalDropRoot {
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly file?: File;
  readonly members: readonly ExternalDropMember[];
  readonly entryCount: number;
  readonly sizeBytes: number;
}

interface ExternalDropBudget {
  entries: number;
  sizeBytes: number;
}

interface ExternalImportProgress {
  readonly totalEntries: number;
  readonly totalBytes: number;
  completedEntries: number;
  completedBytes: number;
  lastNoticeAt: number;
}

interface ExternalDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface ExternalDataTransferItem extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  getAsEntry?: () => FileSystemEntry | null;
}

interface ParticleBackgroundSettings {
  readonly particleCount: number;
  readonly particleSize: number;
  readonly particleOpacity: number;
  readonly speed: number;
  readonly noiseScale: number;
  readonly noiseStrength: number;
  readonly damping: number;
  readonly ambientCycle: number;
  readonly selectedImageIds: readonly string[];
  readonly activeImageId: string | null;
  readonly autoSwitch: boolean;
  readonly imageDurationSeconds: number;
  readonly morphIntervalSeconds: number;
  readonly imageOpacity: number;
  readonly showSourceImage: boolean;
  readonly backgroundColor: string;
  readonly cursorStrength: number;
  readonly cursorInteraction: boolean;
  readonly dprCap: number;
}

type CodexAppearanceTheme = "system" | "light" | "dark";

type CodexAppearanceAction =
  | { readonly type: "app.appearance.get" }
  | {
      readonly type: "app.appearance.set_mode";
      readonly mode: CodexAppearanceTheme;
    };

interface CodexAppearanceAdapter {
  readonly appActions: {
    readonly runInPrimaryWindow: (request: {
      readonly action: CodexAppearanceAction;
    }) => Promise<unknown>;
  };
  readonly clientCoordination: {
    readonly invalidateQueryCache: (request: { readonly queryKey: readonly string[] }) => Promise<unknown>;
  };
}

interface ParticleThemeLease {
  readonly previousPreference: Exclude<CodexAppearanceTheme, "dark">;
  readonly forcedPreference: "dark";
}

type ParticleNumericSettingKey =
  | "particleCount"
  | "particleSize"
  | "particleOpacity"
  | "speed"
  | "noiseScale"
  | "noiseStrength"
  | "damping"
  | "ambientCycle"
  | "imageDurationSeconds"
  | "morphIntervalSeconds"
  | "imageOpacity"
  | "cursorStrength"
  | "dprCap";

type ParticleControlGroup = "particles" | "flow" | "source" | "pointer" | "render";

interface ParticleNumericControlDefinition {
  readonly key: ParticleNumericSettingKey;
  readonly group: ParticleControlGroup;
  readonly id: string;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly live: boolean;
  readonly format: (value: number) => string;
}

interface ParticleImageRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly createdAt: number;
  readonly blob: Blob;
  readonly thumbnail: Blob;
}

interface PreparedParticleImage {
  readonly imageId: string;
  readonly targetCount: number;
  readonly width: number;
  readonly height: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly processedBlob: Blob;
  readonly normalizedHomes: Float32Array<ArrayBuffer>;
  readonly colors: Uint8Array<ArrayBuffer>;
  readonly seeds: Float32Array<ArrayBuffer>;
}

interface ParticlePointerSegment {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  velocityX: number;
  velocityY: number;
  startedAt: number;
  createdAt: number;
  duration: number;
  sealed: boolean;
}

const DEFAULT_PARTICLE_BACKGROUND_SETTINGS: ParticleBackgroundSettings = Object.freeze({
  particleCount: 560_000,
  particleSize: 1.8,
  particleOpacity: 0.96,
  speed: 0.70,
  noiseScale: 0.0001,
  noiseStrength: 0.005,
  damping: 0.9919,
  ambientCycle: 80,
  selectedImageIds: Object.freeze([]),
  activeImageId: null,
  autoSwitch: true,
  imageDurationSeconds: 2,
  morphIntervalSeconds: 2.5,
  imageOpacity: 1,
  showSourceImage: true,
  backgroundColor: "#000000",
  cursorStrength: PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
  cursorInteraction: true,
  dprCap: 1.5,
});

const PARTICLE_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "particleCount", group: "particles", id: "cle-particle-count", label: "Particle count", minimum: 10_000, maximum: 2_000_000, step: 10_000, live: false, format: (value: number) => Math.round(value).toLocaleString() },
  { key: "particleSize", group: "particles", id: "cle-particle-size", label: "Particle size", minimum: 0.5, maximum: 4, step: 0.1, live: true, format: (value: number) => value.toFixed(1) },
  { key: "particleOpacity", group: "particles", id: "cle-particle-opacity", label: "Particle opacity", minimum: 0.1, maximum: 1, step: 0.01, live: true, format: (value: number) => value.toFixed(2) },
  { key: "speed", group: "flow", id: "cle-particle-speed", label: "Speed", minimum: 0, maximum: 2, step: 0.05, live: true, format: (value: number) => value.toFixed(2) },
  { key: "noiseScale", group: "flow", id: "cle-particle-noise-scale", label: "Noise scale", minimum: 0.0001, maximum: 0.002, step: 0.0001, live: true, format: (value: number) => value.toFixed(4) },
  { key: "noiseStrength", group: "flow", id: "cle-particle-noise-strength", label: "Noise strength", minimum: 0, maximum: 0.15, step: 0.005, live: true, format: (value: number) => value.toFixed(3) },
  { key: "damping", group: "flow", id: "cle-particle-damping", label: "Damping", minimum: 0.8, maximum: 0.9999, step: 0.0001, live: true, format: (value: number) => value.toFixed(4) },
  { key: "ambientCycle", group: "flow", id: "cle-particle-ambient-cycle", label: "Ambient cycle", minimum: 40, maximum: 500, step: 10, live: true, format: (value: number) => String(Math.round(value)) },
  { key: "imageDurationSeconds", group: "source", id: "cle-particle-image-duration", label: "Image duration", minimum: 1, maximum: 60, step: 1, live: true, format: (value: number) => `${Math.round(value)}s` },
  { key: "morphIntervalSeconds", group: "source", id: "cle-particle-morph-interval", label: "Morph interval", minimum: 1, maximum: 12, step: 0.1, live: true, format: (value: number) => `${value.toFixed(1)}s` },
  { key: "imageOpacity", group: "source", id: "cle-particle-image-opacity", label: "Image opacity", minimum: 0, maximum: 1, step: 0.01, live: true, format: (value: number) => value.toFixed(2) },
  { key: "cursorStrength", group: "pointer", id: "cle-particle-cursor-strength", label: "Cursor strength", minimum: 0, maximum: PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH, step: 0.01, live: true, format: (value: number) => value.toFixed(2) },
  { key: "dprCap", group: "render", id: "cle-particle-dpr-cap", label: "DPR cap", minimum: 1, maximum: 2, step: 0.25, live: true, format: (value: number) => value.toFixed(2) },
] satisfies readonly ParticleNumericControlDefinition[]);

function clampParticleNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeParticleCount(value: unknown): number {
  return Math.round(clampParticleNumber(value, 10_000, 2_000_000, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.particleCount) / 10_000) * 10_000;
}

function normalizeSteppedParticleNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  step: number,
  fallback: number,
  precision: number,
): number {
  const clamped = clampParticleNumber(value, minimum, maximum, fallback);
  const stepped = minimum + Math.round((clamped - minimum) / step) * step;
  return Number(Math.min(maximum, Math.max(minimum, stepped)).toFixed(precision));
}

function normalizeParticleColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLocaleLowerCase()
    : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.backgroundColor;
}

function normalizeParticleSettings(value: unknown): ParticleBackgroundSettings {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const selectedImageIds = Array.isArray(record.selectedImageIds)
    ? [...new Set(record.selectedImageIds.filter((entry): entry is string => typeof entry === "string" && entry.length <= 128))]
    : [];
  return {
    particleCount: normalizeParticleCount(record.particleCount),
    particleSize: normalizeSteppedParticleNumber(record.particleSize, 0.5, 4, 0.1, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.particleSize, 1),
    particleOpacity: normalizeSteppedParticleNumber(record.particleOpacity, 0.1, 1, 0.01, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.particleOpacity, 2),
    speed: normalizeSteppedParticleNumber(record.speed, 0, 2, 0.05, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.speed, 2),
    noiseScale: normalizeSteppedParticleNumber(record.noiseScale, 0.0001, 0.002, 0.0001, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.noiseScale, 4),
    noiseStrength: normalizeSteppedParticleNumber(record.noiseStrength, 0, 0.15, 0.005, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.noiseStrength, 3),
    damping: normalizeSteppedParticleNumber(record.damping, 0.8, 0.9999, 0.0001, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.damping, 4),
    ambientCycle: normalizeSteppedParticleNumber(record.ambientCycle, 40, 500, 10, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.ambientCycle, 0),
    selectedImageIds,
    activeImageId: typeof record.activeImageId === "string" && record.activeImageId.length <= 128
      ? record.activeImageId
      : null,
    autoSwitch: typeof record.autoSwitch === "boolean" ? record.autoSwitch : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.autoSwitch,
    imageDurationSeconds: Math.round(clampParticleNumber(
      record.imageDurationSeconds,
      1,
      60,
      DEFAULT_PARTICLE_BACKGROUND_SETTINGS.imageDurationSeconds,
    )),
    morphIntervalSeconds: Math.round(clampParticleNumber(
      record.morphIntervalSeconds,
      1,
      12,
      DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds,
    ) * 10) / 10,
    imageOpacity: Math.round(clampParticleNumber(
      record.imageOpacity,
      0,
      1,
      DEFAULT_PARTICLE_BACKGROUND_SETTINGS.imageOpacity,
    ) * 100) / 100,
    showSourceImage: typeof record.showSourceImage === "boolean"
      ? record.showSourceImage
      : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.showSourceImage,
    backgroundColor: normalizeParticleColor(record.backgroundColor),
    cursorStrength: normalizeSteppedParticleNumber(record.cursorStrength, 0, PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH, 0.01, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.cursorStrength, 2),
    cursorInteraction: typeof record.cursorInteraction === "boolean"
      ? record.cursorInteraction
      : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.cursorInteraction,
    dprCap: normalizeSteppedParticleNumber(record.dprCap, 1, 2, 0.25, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.dprCap, 2),
  };
}

function readParticleBackgroundSettings(): ParticleBackgroundSettings {
  try {
    return normalizeParticleSettings(JSON.parse(localStorage.getItem(PARTICLE_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_PARTICLE_BACKGROUND_SETTINGS };
  }
}

function writeParticleBackgroundSettings(settings: ParticleBackgroundSettings): void {
  try {
    localStorage.setItem(PARTICLE_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

function isCodexAppearanceTheme(value: unknown): value is CodexAppearanceTheme {
  return value === "system" || value === "light" || value === "dark";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isCodexRpcNamespace(value: unknown): value is Record<string, unknown> {
  // Stable Codex exposes RPC namespaces as callable proxies; older builds used objects.
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function findCodexAppInitialModule(): string | undefined {
  const candidates = [
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"][href]'), (link) => link.href),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[type=module][src]"), (script) => script.src),
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
  ];
  return candidates.find((candidate) => {
    try {
      return /\/app-initial-[^/]+\.js$/.test(new URL(candidate, location.href).pathname);
    } catch {
      return false;
    }
  });
}

async function discoverCodexAppearanceAdapter(): Promise<CodexAppearanceAdapter> {
  const moduleUrl = findCodexAppInitialModule();
  if (!moduleUrl) throw new Error("Codex Appearance module is unavailable");
  const moduleExports = await import(moduleUrl) as unknown as Record<string, unknown>;
  const adapters = Object.values(moduleExports).filter((value): value is CodexAppearanceAdapter => {
    if (!isObjectRecord(value) || !isCodexRpcNamespace(value.appActions) || !isCodexRpcNamespace(value.clientCoordination)) {
      return false;
    }
    return typeof value.appActions.runInPrimaryWindow === "function"
      && typeof value.clientCoordination.invalidateQueryCache === "function";
  });
  const adapter = adapters[0];
  if (adapters.length !== 1 || !adapter) throw new Error("Codex Appearance controls could not be identified safely");
  return adapter;
}

let codexAppearanceAdapterPromise: Promise<CodexAppearanceAdapter> | undefined;

function getCodexAppearanceAdapter(): Promise<CodexAppearanceAdapter> {
  if (!codexAppearanceAdapterPromise) {
    codexAppearanceAdapterPromise = discoverCodexAppearanceAdapter().catch((error: unknown) => {
      codexAppearanceAdapterPromise = undefined;
      throw error;
    });
  }
  return codexAppearanceAdapterPromise;
}

async function runCodexAppearanceAction(action: CodexAppearanceAction): Promise<Record<string, unknown>> {
  const adapter = await getCodexAppearanceAdapter();
  const result = await adapter.appActions.runInPrimaryWindow({ action });
  if (!isObjectRecord(result)) throw new Error("Codex returned an invalid Appearance response");
  return result;
}

async function readCodexAppearanceTheme(): Promise<CodexAppearanceTheme> {
  const result = await runCodexAppearanceAction({ type: "app.appearance.get" });
  if (!isCodexAppearanceTheme(result.mode)) {
    throw new Error("Codex returned an unsupported Appearance setting");
  }
  return result.mode;
}

async function writeCodexAppearanceTheme(value: CodexAppearanceTheme): Promise<void> {
  const result = await runCodexAppearanceAction({ type: "app.appearance.set_mode", mode: value });
  if (result.mode !== value) {
    throw new Error("Codex did not confirm the Appearance change");
  }
}

function readParticleThemeLease(): ParticleThemeLease | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PARTICLE_BACKGROUND_THEME_LEASE_KEY) || "null");
    if (!value || typeof value !== "object") return undefined;
    const lease = value as Partial<ParticleThemeLease>;
    if ((lease.previousPreference === "system" || lease.previousPreference === "light") && lease.forcedPreference === "dark") {
      return { previousPreference: lease.previousPreference, forcedPreference: "dark" };
    }
  } catch {
    // Invalid or inaccessible storage is handled as an absent lease.
  }
  return undefined;
}

function writeParticleThemeLease(lease: ParticleThemeLease): void {
  try {
    localStorage.setItem(PARTICLE_BACKGROUND_THEME_LEASE_KEY, JSON.stringify(lease));
  } catch {
    throw new Error("Code-Codex could not remember the current Appearance setting");
  }
}

function clearParticleThemeLease(): void {
  try {
    localStorage.removeItem(PARTICLE_BACKGROUND_THEME_LEASE_KEY);
  } catch {
    // The setting bridge still owns the authoritative theme preference.
  }
}

function codexDarkThemeApplied(): boolean {
  const root = document.documentElement;
  return root.classList.contains("electron-dark") && !root.classList.contains("electron-light");
}

function waitForCodexDarkTheme(): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    let observer: MutationObserver | undefined;
    const cleanup = (): void => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const check = (): void => {
      if (codexDarkThemeApplied()) finish();
    };
    if (codexDarkThemeApplied()) {
      finish();
      return;
    }
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Codex did not finish applying Dark appearance"));
    }, CODEX_DARK_APPLY_TIMEOUT_MS);
    check();
  });
}

function particleHash01(value: number): number {
  const number = Math.sin(value * 91.317) * 47_453.5453;
  return number - Math.floor(number);
}

function particleHashUint32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function particleImagePreparationWorkerMain(): void {
  const workerScope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<Record<string, unknown>>) => void): void;
    postMessage(message: unknown, transfer: Transferable[]): void;
  };
  const hash01 = (value: number): number => {
    const number = Math.sin(value * 91.317) * 47_453.5453;
    return number - Math.floor(number);
  };
  const hashUint32 = (value: number): number => {
    let hash = value >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
  workerScope.addEventListener("message", (event) => {
    void (async () => {
      const data = event.data;
      const jobId = Number(data.jobId);
      const imageId = String(data.imageId || "");
      const source = data.source;
      const requestedCount = Number(data.targetCount);
      let bitmap: ImageBitmap | undefined;
      try {
        if (!(source instanceof Blob)) throw new Error("The image source is invalid");
        if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
          throw new Error("Background image preparation is unavailable");
        }
        bitmap = await createImageBitmap(source);
        const naturalWidth = bitmap.width;
        const naturalHeight = bitmap.height;
        if (!naturalWidth || !naturalHeight || naturalWidth > 16_384 || naturalHeight > 16_384) {
          throw new Error("The image dimensions are unsupported");
        }
        const maximumDimension = 900;
        const scale = Math.min(1, maximumDimension / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || typeof canvas.convertToBlob !== "function") throw new Error("The image preparation canvas is unavailable");
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        let samplingSeed = hashUint32(width ^ (height << 16));
        let visiblePixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset] ?? 0;
          const green = pixels[offset + 1] ?? 0;
          const blue = pixels[offset + 2] ?? 0;
          const alpha = pixels[offset + 3] ?? 0;
          const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
          pixels[offset] = luminance;
          pixels[offset + 1] = luminance;
          pixels[offset + 2] = luminance;
          const pixelIndex = offset >>> 2;
          if ((pixelIndex & 3) === 0) {
            samplingSeed = hashUint32(samplingSeed ^ luminance ^ (alpha << 8) ^ Math.imul(pixelIndex + 1, 0x9e3779b1));
          }
          if (alpha >= 24) visiblePixels += 1;
        }
        if (!visiblePixels) throw new Error("The image contains no visible pixels");
        context.putImageData(imageData, 0, 0);
        const processedBlob = await canvas.convertToBlob({ type: "image/png" });

        const pixelCount = width * height;
        const cumulativeMass = new Uint32Array(pixelCount);
        const particleLuminance = new Uint8Array(pixelCount);
        let totalMass = 0;
        for (let y = 0; y < height; y += 1) {
          const row = y * width;
          const up = Math.max(0, y - 1) * width;
          const down = Math.min(height - 1, y + 1) * width;
          for (let x = 0; x < width; x += 1) {
            const pixelIndex = row + x;
            const offset = pixelIndex * 4;
            const alpha = pixels[offset + 3] ?? 0;
            if (alpha >= 24) {
              const leftValue = pixels[(row + Math.max(0, x - 1)) * 4] ?? 0;
              const rightValue = pixels[(row + Math.min(width - 1, x + 1)) * 4] ?? 0;
              const upValue = pixels[(up + x) * 4] ?? 0;
              const downValue = pixels[(down + x) * 4] ?? 0;
              const luminance = (pixels[offset] ?? 0) / 255;
              const edge = Math.min(1, (Math.abs(rightValue - leftValue) + Math.abs(downValue - upValue)) / 510);
              totalMass += Math.round((alpha / 255) * (Math.pow(luminance, 0.9) * 144 + edge * 112));
              particleLuminance[pixelIndex] = Math.max(pixels[offset] ?? 0, Math.round(edge * 96));
            }
            cumulativeMass[pixelIndex] = totalMass;
          }
        }
        if (!totalMass) {
          for (let index = 0; index < pixelCount; index += 1) {
            if ((pixels[index * 4 + 3] ?? 0) >= 24) {
              totalMass += 1;
              particleLuminance[index] = Math.max(pixels[index * 4] ?? 0, 96);
            }
            cumulativeMass[index] = totalMass;
          }
        }
        if (!totalMass) throw new Error("The image contains no visible pixels");

        const bucketCount = 4_096;
        const massLookup = new Uint32Array(bucketCount + 1);
        let pixelCursor = 0;
        const finalPixel = cumulativeMass.length - 1;
        for (let bucket = 0; bucket <= bucketCount; bucket += 1) {
          const threshold = totalMass * bucket / bucketCount;
          while (pixelCursor < finalPixel && (cumulativeMass[pixelCursor] ?? 0) <= threshold) pixelCursor += 1;
          massLookup[bucket] = pixelCursor;
        }

        const targetCount = Math.min(2_000_000, Math.max(10_000, Math.round(requestedCount / 10_000) * 10_000));
        const normalizedHomes = new Float32Array(targetCount * 2);
        const colors = new Uint8Array(targetCount * 4);
        const seeds = new Float32Array(targetCount);
        for (let index = 0; index < targetCount; index += 1) {
          const quantile = (hashUint32(index ^ samplingSeed) + 0.5) / 4_294_967_296;
          const targetMass = quantile * totalMass;
          const massBucket = Math.min(bucketCount - 1, Math.floor(quantile * bucketCount));
          let low = massLookup[massBucket] ?? 0;
          let high = massLookup[massBucket + 1] ?? low;
          while (low < high) {
            const middle = (low + high) >>> 1;
            if ((cumulativeMass[middle] ?? 0) <= targetMass) low = middle + 1;
            else high = middle;
          }
          const pixelIndex = low;
          const pixelX = pixelIndex % width;
          const pixelY = Math.floor(pixelIndex / width);
          const homeOffset = index * 2;
          const colorOffset = index * 4;
          normalizedHomes[homeOffset] = Math.max(0, Math.min(1, (pixelX + 0.5 + (hash01(index + 0.17) - 0.5) * 0.82) / width));
          normalizedHomes[homeOffset + 1] = Math.max(0, Math.min(1, (pixelY + 0.5 + (hash01(index + 7.31) - 0.5) * 0.82) / height));
          const luminance = particleLuminance[pixelIndex] ?? 0;
          colors[colorOffset] = luminance;
          colors[colorOffset + 1] = luminance;
          colors[colorOffset + 2] = luminance;
          colors[colorOffset + 3] = pixels[pixelIndex * 4 + 3] ?? 0;
          seeds[index] = hash01(index + 19.73);
        }
        workerScope.postMessage({
          type: "prepared",
          jobId,
          prepared: {
            imageId,
            targetCount,
            width,
            height,
            naturalWidth,
            naturalHeight,
            processedBlob,
            normalizedHomes,
            colors,
            seeds,
          },
        }, [normalizedHomes.buffer, colors.buffer, seeds.buffer]);
      } catch (error) {
        workerScope.postMessage({
          type: "error",
          jobId,
          message: error instanceof Error ? error.message : String(error),
        }, []);
      } finally {
        bitmap?.close();
      }
    })();
  });
}

async function prepareParticleImageOnMainThread(
  imageId: string,
  source: Blob,
  requestedCount: number,
  signal: AbortSignal,
): Promise<PreparedParticleImage> {
  const throwIfAborted = (): void => {
    if (signal.aborted) throw new DOMException("Image preparation was cancelled", "AbortError");
  };
  const yieldToBrowser = async (): Promise<void> => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    throwIfAborted();
  };
  throwIfAborted();
  const bitmap = await createImageBitmap(source);
  try {
    throwIfAborted();
    const naturalWidth = bitmap.width;
    const naturalHeight = bitmap.height;
    if (!naturalWidth || !naturalHeight || naturalWidth > 16_384 || naturalHeight > 16_384) {
      throw new Error("The image dimensions are unsupported");
    }
    const scale = Math.min(1, PARTICLE_BACKGROUND_SAMPLE_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The image preparation canvas is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    let samplingSeed = particleHashUint32(width ^ (height << 16));
    let visiblePixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3] ?? 0;
      const luminance = Math.round(
        (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722,
      );
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
      const pixelIndex = offset >>> 2;
      if ((pixelIndex & 3) === 0) {
        samplingSeed = particleHashUint32(samplingSeed ^ luminance ^ (alpha << 8) ^ Math.imul(pixelIndex + 1, 0x9e3779b1));
      }
      if (alpha >= 24) visiblePixels += 1;
      if ((offset & 0x7ffff) === 0x7fffc) await yieldToBrowser();
    }
    if (!visiblePixels) throw new Error("The image contains no visible pixels");
    context.putImageData(imageData, 0, 0);
    const processedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The processed image could not be created")), "image/png");
    });
    throwIfAborted();
    const pixelCount = width * height;
    const cumulativeMass = new Uint32Array(pixelCount);
    const particleLuminance = new Uint8Array(pixelCount);
    let totalMass = 0;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      const up = Math.max(0, y - 1) * width;
      const down = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = row + x;
        const offset = pixelIndex * 4;
        const alpha = pixels[offset + 3] ?? 0;
        if (alpha >= 24) {
          const edge = Math.min(1, (
            Math.abs((pixels[(row + Math.min(width - 1, x + 1)) * 4] ?? 0) - (pixels[(row + Math.max(0, x - 1)) * 4] ?? 0))
            + Math.abs((pixels[(down + x) * 4] ?? 0) - (pixels[(up + x) * 4] ?? 0))
          ) / 510);
          const luminance = (pixels[offset] ?? 0) / 255;
          totalMass += Math.round((alpha / 255) * (Math.pow(luminance, 0.9) * 144 + edge * 112));
          particleLuminance[pixelIndex] = Math.max(pixels[offset] ?? 0, Math.round(edge * 96));
        }
        cumulativeMass[pixelIndex] = totalMass;
      }
      if ((y & 63) === 63) await yieldToBrowser();
    }
    if (!totalMass) {
      for (let index = 0; index < pixelCount; index += 1) {
        if ((pixels[index * 4 + 3] ?? 0) >= 24) {
          totalMass += 1;
          particleLuminance[index] = Math.max(pixels[index * 4] ?? 0, 96);
        }
        cumulativeMass[index] = totalMass;
        if ((index & 0x1ffff) === 0x1ffff) await yieldToBrowser();
      }
    }
    if (!totalMass) throw new Error("The image contains no visible pixels");
    const massLookup = new Uint32Array(PARTICLE_BACKGROUND_MASS_BUCKETS + 1);
    let pixelCursor = 0;
    const finalPixel = cumulativeMass.length - 1;
    for (let bucket = 0; bucket <= PARTICLE_BACKGROUND_MASS_BUCKETS; bucket += 1) {
      const threshold = totalMass * bucket / PARTICLE_BACKGROUND_MASS_BUCKETS;
      while (pixelCursor < finalPixel && (cumulativeMass[pixelCursor] ?? 0) <= threshold) pixelCursor += 1;
      massLookup[bucket] = pixelCursor;
    }
    const targetCount = normalizeParticleCount(requestedCount);
    const normalizedHomes = new Float32Array(targetCount * 2);
    const colors = new Uint8Array(targetCount * 4);
    const seeds = new Float32Array(targetCount);
    for (let index = 0; index < targetCount; index += 1) {
      const quantile = (particleHashUint32(index ^ samplingSeed) + 0.5) / 4_294_967_296;
      const targetMass = quantile * totalMass;
      const massBucket = Math.min(PARTICLE_BACKGROUND_MASS_BUCKETS - 1, Math.floor(quantile * PARTICLE_BACKGROUND_MASS_BUCKETS));
      let low = massLookup[massBucket] ?? 0;
      let high = massLookup[massBucket + 1] ?? low;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if ((cumulativeMass[middle] ?? 0) <= targetMass) low = middle + 1;
        else high = middle;
      }
      const pixelX = low % width;
      const pixelY = Math.floor(low / width);
      const homeOffset = index * 2;
      const colorOffset = index * 4;
      normalizedHomes[homeOffset] = Math.max(0, Math.min(1, (pixelX + 0.5 + (particleHash01(index + 0.17) - 0.5) * 0.82) / width));
      normalizedHomes[homeOffset + 1] = Math.max(0, Math.min(1, (pixelY + 0.5 + (particleHash01(index + 7.31) - 0.5) * 0.82) / height));
      const luminance = particleLuminance[low] ?? 0;
      colors[colorOffset] = luminance;
      colors[colorOffset + 1] = luminance;
      colors[colorOffset + 2] = luminance;
      colors[colorOffset + 3] = pixels[low * 4 + 3] ?? 0;
      seeds[index] = particleHash01(index + 19.73);
      if ((index & 0x7fff) === 0x7fff) await yieldToBrowser();
    }
    throwIfAborted();
    return { imageId, targetCount, width, height, naturalWidth, naturalHeight, processedBlob, normalizedHomes, colors, seeds };
  } finally {
    bitmap.close();
  }
}

interface ParticlePreparationCacheEntry {
  readonly key: string;
  readonly imageId: string;
  readonly promise: Promise<PreparedParticleImage>;
  readonly cancel: () => void;
}

class ParticleImagePreparationCache {
  #workerUrl: string | null;
  #entry: ParticlePreparationCacheEntry | undefined;
  #nextJobId = 1;

  constructor() {
    this.#workerUrl = this.#createWorkerUrl();
  }

  prepare(record: ParticleImageRecord, targetCount: number): Promise<PreparedParticleImage> {
    const count = normalizeParticleCount(targetCount);
    const key = [record.id, record.createdAt, record.size, record.type, count].join(":");
    if (this.#entry?.key === key) return this.#entry.promise;
    this.invalidate();

    const abortController = new AbortController();
    let cancelWorker = (): void => undefined;
    const workerAttempt = this.#workerUrl
      ? this.#prepareWithWorker(record, count, (nextCancel) => { cancelWorker = nextCancel; })
      : Promise.reject(new Error("Worker preprocessing is unavailable"));
    const promise = workerAttempt.catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (abortController.signal.aborted) {
        throw new DOMException("Image preparation was cancelled", "AbortError");
      }
      return prepareParticleImageOnMainThread(record.id, record.blob, count, abortController.signal);
    });
    const entry: ParticlePreparationCacheEntry = {
      key,
      imageId: record.id,
      promise,
      cancel: () => {
        abortController.abort();
        cancelWorker();
      },
    };
    this.#entry = entry;
    void promise.catch(() => {
      if (this.#entry === entry) this.#entry = undefined;
    });
    return promise;
  }

  prewarm(record: ParticleImageRecord, targetCount: number): void {
    void this.prepare(record, targetCount).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("Code-Codex could not pre-process the next particle image", error);
      }
    });
  }

  invalidate(imageId?: string): void {
    const entry = this.#entry;
    if (!entry || (imageId && entry.imageId !== imageId)) return;
    this.#entry = undefined;
    entry.cancel();
  }

  dispose(): void {
    this.invalidate();
    if (this.#workerUrl) URL.revokeObjectURL(this.#workerUrl);
    this.#workerUrl = null;
  }

  #createWorkerUrl(): string | null {
    if (
      typeof Worker !== "function"
      || typeof OffscreenCanvas !== "function"
      || typeof createImageBitmap !== "function"
      || typeof URL.createObjectURL !== "function"
    ) return null;
    try {
      return URL.createObjectURL(new Blob([`(${particleImagePreparationWorkerMain.toString()})();`], { type: "text/javascript" }));
    } catch {
      return null;
    }
  }

  #prepareWithWorker(
    record: ParticleImageRecord,
    targetCount: number,
    setCancel: (cancel: () => void) => void,
  ): Promise<PreparedParticleImage> {
    const workerUrl = this.#workerUrl;
    if (!workerUrl) return Promise.reject(new Error("Worker preprocessing is unavailable"));
    const jobId = this.#nextJobId++;
    return new Promise<PreparedParticleImage>((resolve, reject) => {
      let settled = false;
      let worker: Worker;
      let timeout = 0;
      const finish = (result: { readonly value: PreparedParticleImage } | { readonly error: unknown }): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        worker.terminate();
        if ("value" in result) resolve(result.value);
        else reject(result.error);
      };
      try {
        worker = new Worker(workerUrl, { name: "code-codex-particle-image" });
      } catch (error) {
        this.#disableWorker();
        reject(error);
        return;
      }
      setCancel(() => finish({ error: new DOMException("Image preparation was cancelled", "AbortError") }));
      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        const message = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
        if (Number(message.jobId) !== jobId) return;
        if (message.type === "prepared") {
          const prepared = message.prepared;
          if (this.#isPreparedImage(prepared, record.id, targetCount)) finish({ value: prepared });
          else finish({ error: new Error("The prepared particle image is invalid") });
          return;
        }
        finish({ error: new Error(typeof message.message === "string" ? message.message : "Image preparation failed") });
      });
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        this.#disableWorker();
        finish({ error: new Error(event.message || "Image preparation worker failed") });
      }, { once: true });
      worker.addEventListener("messageerror", () => {
        this.#disableWorker();
        finish({ error: new Error("Image preparation worker returned unreadable data") });
      }, { once: true });
      timeout = window.setTimeout(() => {
        this.#disableWorker();
        finish({ error: new DOMException("Image preparation timed out", "TimeoutError") });
      }, PARTICLE_BACKGROUND_PREPARE_TIMEOUT_MS);
      worker.postMessage({
        jobId,
        imageId: record.id,
        source: record.blob,
        targetCount,
      });
    });
  }

  #disableWorker(): void {
    if (this.#workerUrl) URL.revokeObjectURL(this.#workerUrl);
    this.#workerUrl = null;
  }

  #isPreparedImage(value: unknown, imageId: string, targetCount: number): value is PreparedParticleImage {
    if (!value || typeof value !== "object") return false;
    const prepared = value as Partial<PreparedParticleImage>;
    return prepared.imageId === imageId
      && prepared.targetCount === targetCount
      && Number.isInteger(prepared.width) && Number(prepared.width) > 0
      && Number.isInteger(prepared.height) && Number(prepared.height) > 0
      && Number(prepared.naturalWidth) > 0
      && Number(prepared.naturalHeight) > 0
      && prepared.processedBlob instanceof Blob
      && prepared.normalizedHomes instanceof Float32Array
      && prepared.normalizedHomes.length === targetCount * 2
      && prepared.colors instanceof Uint8Array
      && prepared.colors.length === targetCount * 4
      && prepared.seeds instanceof Float32Array
      && prepared.seeds.length === targetCount;
  }
}

const PARTICLE_BACKGROUND_VERTEX_SHADER = `
  precision highp float;
  attribute vec2 a_previousHome;
  attribute vec2 a_home;
  attribute vec2 a_previousVelocity;
  attribute vec4 a_previousColor;
  attribute vec4 a_color;
  attribute float a_seed;

  uniform vec2 u_resolution;
  uniform vec4 u_layout;
  uniform vec4 u_pointerSegments[${PARTICLE_BACKGROUND_POINTER_SEGMENTS}];
  uniform vec4 u_pointerMotion[${PARTICLE_BACKGROUND_POINTER_SEGMENTS}];
  uniform float u_pointerCount;
  uniform float u_time;
  uniform float u_transitionStart;
  uniform float u_transitionNearResponse;
  uniform float u_transitionFarResponse;
  uniform float u_transitionStagger;
  uniform float u_transitionActive;
  uniform float u_transitionVisibility;
  uniform float u_dpr;
  uniform float u_particleSize;
  uniform float u_particleOpacity;
  uniform float u_speed;
  uniform float u_noiseScale;
  uniform float u_noiseStrength;
  uniform float u_damping;
  uniform float u_ambientCycle;
  uniform float u_cursorStrength;

  varying vec4 v_color;

  float hash(float value) {
    return fract(sin(value * 91.317) * 47453.5453);
  }

  float smoother01(float value) {
    float t = clamp(value, 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  vec2 softLimit(vec2 value, float maximum) {
    float maximumSquared = max(maximum * maximum, 0.0001);
    return value * inversesqrt(1.0 + dot(value, value) / maximumSquared);
  }

  vec2 ambientFlow(float sampleTime, vec2 homePosition) {
    float seedAngle = a_seed * 6.2831853;
    float flowTime = sampleTime * u_speed * 200.0 / max(u_ambientCycle, 1.0);
    float spatial = max(u_noiseScale, 0.00001) * 6.2831853;
    float waveA = sin(homePosition.y * spatial + flowTime * 0.63 + seedAngle);
    float waveB = cos(homePosition.x * spatial * 1.37 - flowTime * 0.48 + seedAngle * 0.71);
    float angle = waveA * 2.3 + waveB * 1.7 + seedAngle;
    float breathing = 0.58 + 0.42 * sin(flowTime * 0.82 + seedAngle * 2.0);
    return vec2(cos(angle), sin(angle)) * u_noiseStrength * 520.0 * breathing;
  }

  float directionalWakeGain(vec2 position, vec2 cursorStart, vec2 cursorEnd, float radius) {
    vec2 cursorStep = cursorEnd - cursorStart;
    float cursorDistance = length(cursorStep);
    if (cursorDistance < 0.001) return 0.0;
    vec2 tangent = cursorStep / cursorDistance;
    vec2 normal = vec2(-tangent.y, tangent.x);
    vec2 fromCursor = position - cursorEnd;
    float trailDistance = -dot(fromCursor, tangent);
    float lateralOffset = dot(fromCursor, normal);
    float wakeLength = radius * 4.5;
    float wakeProgress = clamp(trailDistance / max(wakeLength, 1.0), 0.0, 1.0);
    float wakeEndWidth = radius * 2.35 * sqrt(1.0 / 0.40);
    float wakeWidthSquared = mix(radius * radius, wakeEndWidth * wakeEndWidth, wakeProgress);
    float wakeMetric = lateralOffset * lateralOffset / max(wakeWidthSquared, 1.0) + pow(wakeProgress, 4.0);
    float rearSupport = pow(max(0.0, 1.0 - wakeMetric), 3.0);
    float frontDistance = max(-trailDistance, 0.0);
    float frontLength = radius * 0.72;
    float frontMetric = frontDistance * frontDistance / max(frontLength * frontLength, 1.0)
      + lateralOffset * lateralOffset / max(radius * radius, 1.0);
    float frontSupport = pow(max(0.0, 1.0 - frontMetric), 3.0);
    float support = mix(frontSupport, rearSupport, step(0.0, trailDistance));
    float coreAxial = 1.0 - smoother01(abs(trailDistance) / max(radius * 0.82, 1.0));
    float coreLateral = 1.0 - smoother01(abs(lateralOffset) / max(radius * 0.28, 1.0));
    return support * (1.10 + 2.90 * coreAxial * coreLateral);
  }

  void coastGas(
    inout vec2 position,
    inout vec2 gasVelocity,
    float elapsed,
    float maximumVelocity,
    float maximumStep
  ) {
    float dt = max(elapsed, 0.0);
    if (dt <= 0.00001) return;
    float damping = clamp(u_damping, 0.80, 0.9999);
    float decayRate = log(damping) / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)};
    float decay = exp(decayRate * dt);
    float travelTime = abs(decayRate) > 0.00001
      ? (decay - 1.0) / decayRate
      : dt;
    float stepBudget = maximumStep * max(dt / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)}, 0.25);
    position += softLimit(gasVelocity * travelTime, stepBudget);
    gasVelocity = softLimit(gasVelocity * decay, maximumVelocity);
  }

  void stirGas(
    inout vec2 position,
    inout vec2 gasVelocity,
    inout vec2 previousTangent,
    inout float hasTangent,
    vec2 cursorStart,
    vec2 cursorEnd,
    vec2 filteredVelocity,
    float elapsed,
    float segmentPhase,
    float maximumVelocity,
    float maximumStep,
    float strength,
    float influenceRadius,
    float strengthRatio,
    float extendedStrength,
    float extremeStrength
  ) {
    float dt = clamp(elapsed, 0.0, ${PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS.toFixed(2)});
    if (dt <= 0.00001) return;
    vec2 cursorStep = cursorEnd - cursorStart;
    float cursorDistance = length(cursorStep);
    float moving = step(0.001, cursorDistance) * step(0.0001, u_cursorStrength);
    if (moving < 0.5) {
      coastGas(position, gasVelocity, dt, maximumVelocity, maximumStep);
      return;
    }

    vec2 tangent = cursorStep / max(cursorDistance, 0.001);
    vec2 normal = vec2(-tangent.y, tangent.x);
    float influence = clamp(
      directionalWakeGain(position, cursorStart, cursorEnd, influenceRadius) * 0.25,
      0.0,
      1.0
    );
    vec2 cursorVelocity = cursorStep / dt;
    vec2 driverVelocity = mix(cursorVelocity, filteredVelocity, 0.28);
    driverVelocity = softLimit(driverVelocity, 2200.0 * max(maximumVelocity / 340.0, 1.0));
    float driverSpeed = length(driverVelocity);

    float cursorLengthSquared = dot(cursorStep, cursorStep);
    float along = clamp(
      dot(position - cursorStart, cursorStep) / max(cursorLengthSquared, 0.0001),
      0.0,
      1.0
    );
    vec2 closestCursor = cursorStart + cursorStep * along;
    vec2 radial = position - closestCursor;
    float radialLength = length(radial);
    vec2 radialDirection = radial / max(radialLength, 0.001);
    vec2 swirlDirection = vec2(-radialDirection.y, radialDirection.x);

    float turn = hasTangent
      * (previousTangent.x * tangent.y - previousTangent.y * tangent.x);
    float directionAlignment = dot(previousTangent, tangent);
    float reversal = hasTangent * step(directionAlignment, -0.4);
    float seededVariation = hash(a_seed * 71.17 + segmentPhase * 13.31) * 2.0 - 1.0;
    float curlEnvelope = influence * (1.0 - influence);

    vec2 oldVelocity = gasVelocity;
    float decay = pow(
      clamp(u_damping, 0.80, 0.9999),
      dt / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)}
    );
    vec2 nextVelocity = oldVelocity * decay;
    float flowResponse = 1.0 - exp(-5.2 * influence * strength * dt);
    nextVelocity = mix(nextVelocity, driverVelocity, flowResponse);
    nextVelocity *= mix(1.0, 0.76, reversal * influence);
    nextVelocity += normal * driverSpeed
      * (0.85 * turn * curlEnvelope * strength) * dt;
    nextVelocity += swirlDirection * driverSpeed
      * (0.48 * turn * curlEnvelope * strength) * dt;
    nextVelocity += normal * driverSpeed
      * (0.025 * seededVariation * curlEnvelope * strength) * dt;

    float segmentEnergy = smoother01(
      cursorDistance / max(influenceRadius * 0.55, 1.0)
    );
    vec2 fromCursorEnd = position - cursorEnd;
    float signedTrailDistance = -dot(fromCursorEnd, tangent);
    float downstream = max(signedTrailDistance, 0.0);
    float upstream = max(-signedTrailDistance, 0.0);
    float lateralOffset = dot(fromCursorEnd, normal);
    float speedEnergy = smoother01(driverSpeed / 1500.0);
    float wakeLength = influenceRadius
      * mix(4.5, 10.0, speedEnergy)
      * pow(max(strengthRatio, 1.0), 0.12)
      * pow(extendedStrength, 0.16)
      * pow(extremeStrength, 0.20);
    float wakeProgress = clamp(downstream / max(wakeLength, 1.0), 0.0, 1.0);
    float originalEndScale = mix(2.15, 2.65, speedEnergy);
    float wakeStartSquared = influenceRadius * influenceRadius;
    float wakeEndSquared = wakeStartSquared
      + wakeStartSquared * (originalEndScale * originalEndScale - 1.0) / 0.40;
    float wakeWidthSquared = mix(
      wakeStartSquared,
      wakeEndSquared,
      wakeProgress
    );
    float wakeWidth = sqrt(max(wakeWidthSquared, 1.0));
    float wakeMetric = lateralOffset * lateralOffset / max(wakeWidthSquared, 1.0)
      + pow(wakeProgress, 4.0);
    float rearSupport = pow(max(0.0, 1.0 - wakeMetric), 3.0);
    float frontLength = influenceRadius * 0.75;
    float frontMetric = upstream * upstream / max(frontLength * frontLength, 1.0)
      + lateralOffset * lateralOffset / max(influenceRadius * influenceRadius, 1.0);
    float frontSupport = pow(max(0.0, 1.0 - frontMetric), 3.0);
    float wakeGain = segmentEnergy * mix(frontSupport, rearSupport, step(0.0, signedTrailDistance));
    float side = sign(lateralOffset);
    vec2 entrainmentDirection = -normal * side;
    float entrainmentGain = smoother01(abs(lateralOffset) / max(wakeWidth, 1.0));
    vec2 wakeVelocity = driverVelocity * (0.24 * wakeGain);
    wakeVelocity += entrainmentDirection * driverSpeed
      * (0.11 * wakeGain * entrainmentGain);
    wakeVelocity += normal * driverSpeed * (0.18 * turn * wakeGain);

    vec2 segmentCenter = 0.5 * (cursorStart + cursorEnd);
    vec2 farOffset = position - segmentCenter;
    float farDistance = length(farOffset);
    vec2 farDirection = farOffset / max(farDistance, 0.001);
    float alignment = dot(tangent, farDirection);
    vec2 dipoleDirection = 2.0 * alignment * farDirection - tangent;
    float pressureStart = smoother01(
      (farDistance / max(influenceRadius, 1.0) - 1.15) / 0.85
    );
    float pressureDistance = farDistance / max(influenceRadius * 4.5, 1.0);
    float pressureGain = segmentEnergy * pressureStart
      / (1.0 + pressureDistance * pressureDistance);
    vec2 pressureVelocity = dipoleDirection * driverSpeed * (0.018 * pressureGain);
    float inducedResponse = 1.0 - exp(-1.15 * sqrt(max(strength, 0.0)) * dt);
    nextVelocity += (wakeVelocity + pressureVelocity) * inducedResponse;
    nextVelocity = softLimit(nextVelocity, maximumVelocity);

    vec2 particleStep = 0.5 * (oldVelocity + nextVelocity) * dt;
    float stepBudget = maximumStep
      * max(dt / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)}, 0.25);
    position += softLimit(particleStep, stepBudget);
    gasVelocity = nextVelocity;
    previousTangent = tangent;
    hasTangent = 1.0;
  }

  void main() {
    vec2 targetHome = u_layout.xy + a_home * u_layout.zw;
    vec2 home = targetHome;
    vec4 imageColor = a_color;
    if (u_transitionActive > 0.5) {
      vec2 transitionDelta = targetHome - a_previousHome;
      float transitionDistance = length(transitionDelta);
      float transitionDistanceReference = max(
        length(u_resolution) * ${PARTICLE_BACKGROUND_MORPH_DISTANCE_SCALE.toFixed(2)},
        80.0
      );
      float transitionDistanceFactor = smoother01(
        transitionDistance / transitionDistanceReference
      );
      float transitionVariation = mix(
        ${(1 - PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION).toFixed(2)},
        ${(1 + PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION).toFixed(2)},
        a_seed
      );
      float transitionResponse = mix(
        u_transitionNearResponse,
        u_transitionFarResponse,
        transitionDistanceFactor
      ) * transitionVariation;
      float transitionElapsed = max(u_time - u_transitionStart, 0.0);
      float carriedVelocity = step(0.01, length(a_previousVelocity));
      float transitionDelay = a_seed * a_seed
        * u_transitionStagger
        * (1.0 - carriedVelocity);
      float springElapsed = max(transitionElapsed - transitionDelay, 0.0);
      float transitionOmega = ${PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT.toFixed(7)}
        / max(transitionResponse, 0.10);
      float transitionSpringTime = transitionOmega * springElapsed;
      float transitionDecay = exp(-transitionSpringTime);
      float transitionProgress = clamp(
        1.0 - (1.0 + transitionSpringTime) * transitionDecay,
        0.0,
        1.0
      );
      vec2 displacement = a_previousHome - targetHome;
      vec2 velocityTerm = a_previousVelocity
        + transitionOmega * displacement;
      home = targetHome + (
        displacement + velocityTerm * springElapsed
      ) * transitionDecay;
      float transitionColorProgress = smoother01(
        (transitionProgress - 0.18) / 0.82
      );
      imageColor = mix(
        a_previousColor,
        a_color,
        transitionColorProgress
      );
    }

    float lifetime = ${PARTICLE_BACKGROUND_PARTICLE_LIFETIME_SECONDS.toFixed(2)}
      + (hash(a_seed * 53.17 + 7.9) * 2.0 - 1.0)
        * ${PARTICLE_BACKGROUND_PARTICLE_LIFETIME_JITTER_SECONDS.toFixed(2)};
    float age = mod(u_time + a_seed * lifetime, lifetime);
    float fadeIn = smoother01(age / 0.18);
    float fadeOut = 1.0 - smoother01((age - (lifetime - 0.18)) / 0.18);
    float lifeAlpha = fadeIn * fadeOut;
    float birthTime = u_time - age;
    vec2 ambientAtBirth = ambientFlow(birthTime, home);
    vec2 position = home + ambientAtBirth;
    vec2 gasVelocity = vec2(0.0);
    vec2 previousTangent = vec2(1.0, 0.0);
    float hasTangent = 0.0;
    float integratedAge = 0.0;

    if (u_pointerCount > 0.5 && u_cursorStrength > 0.0001) {
    float baseCursorStrength = min(
      max(u_cursorStrength, 0.0),
      ${PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH.toFixed(1)}
    );
    float strengthRatio = max(baseCursorStrength / 0.64, 0.0);
    float extendedStrength = max(strengthRatio / 15.625, 1.0);
    float extremeStrength = max(strengthRatio / 31.25, 1.0);
    float overdrive = max(
      u_cursorStrength / ${PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH.toFixed(1)},
      1.0
    );
    float highStrengthScale = pow(max(strengthRatio, 1.0), 0.45)
      * pow(extendedStrength, 0.28)
      * pow(extremeStrength, 0.32)
      * pow(overdrive, 0.45);
    float stepStrengthScale = pow(max(strengthRatio, 1.0), 0.35)
      * pow(extendedStrength, 0.18)
      * pow(extremeStrength, 0.22)
      * pow(overdrive, 0.35);
    float strength = 4.0 * mix(
      strengthRatio,
      pow(max(strengthRatio, 1.0), 0.55),
      step(1.0, strengthRatio)
    ) * pow(extendedStrength, 0.30)
      * pow(extremeStrength, 0.34)
      * overdrive;
    float radiusVariation = mix(0.90, 1.10, hash(a_seed * 43.71 + 2.19));
    float influenceRadius = clamp(
      min(u_resolution.x, u_resolution.y) * 0.16,
      95.0,
      175.0
    ) * radiusVariation * 0.50;
    float motionReferenceRadius = influenceRadius / 1.5;
    float maximumVelocity = clamp(
      motionReferenceRadius * 0.42 / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)},
      180.0,
      340.0
    ) * highStrengthScale;
    float maximumStep = clamp(motionReferenceRadius * 0.42, 8.0, 20.0)
      * stepStrengthScale;

    for (int index = 0; index < ${PARTICLE_BACKGROUND_POINTER_SEGMENTS}; index += 1) {
      if (float(index) >= u_pointerCount) break;
      vec4 motion = u_pointerMotion[index];
      float segmentAge = motion.z;
      if (segmentAge > age) continue;
      vec4 segment = u_pointerSegments[index];
      float segmentDuration = max(motion.w, 0.0001);
      float segmentEndAge = clamp(age - segmentAge, 0.0, age);
      float segmentStartAge = max(0.0, segmentEndAge - segmentDuration);
      coastGas(
        position,
        gasVelocity,
        max(segmentStartAge - integratedAge, 0.0),
        maximumVelocity,
        maximumStep
      );
      float activeStartAge = max(integratedAge, segmentStartAge);
      float activeDuration = max(segmentEndAge - activeStartAge, 0.0);
      if (activeDuration > 0.00001) {
        float activeFraction = clamp(activeDuration / segmentDuration, 0.0, 1.0);
        vec2 activeCursorStart = mix(segment.zw, segment.xy, activeFraction);
        stirGas(
          position,
          gasVelocity,
          previousTangent,
          hasTangent,
          activeCursorStart,
          segment.zw,
          motion.xy,
          activeDuration,
          float(index),
          maximumVelocity,
          maximumStep,
          strength,
          influenceRadius,
          strengthRatio,
          extendedStrength,
          extremeStrength
        );
      }
      integratedAge = max(integratedAge, segmentEndAge);
    }

    coastGas(
      position,
      gasVelocity,
      max(age - integratedAge, 0.0),
      maximumVelocity,
      maximumStep
    );
    }
    vec2 ambientNow = ambientFlow(u_time, home);
    position += ambientNow - ambientAtBirth;
    vec2 restingPosition = home + ambientNow;
    float disturbed = smoothstep(0.75, 3.0, length(position - restingPosition));
    float lifecycleAlpha = mix(1.0, lifeAlpha, disturbed);
    lifecycleAlpha = mix(lifecycleAlpha, 1.0, u_transitionVisibility);
    vec2 clip = vec2(position.x / u_resolution.x * 2.0 - 1.0, 1.0 - position.y / u_resolution.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = max(1.0, u_particleSize * u_dpr);
    v_color = vec4(imageColor.rgb, imageColor.a * u_particleOpacity * lifecycleAlpha);
  }
`;

const PARTICLE_BACKGROUND_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    float distanceFromCentre = length(centred);
    float coverage = 1.0 - smoothstep(0.28, 0.5, distanceFromCentre);
    if (coverage <= 0.001) discard;
    gl_FragColor = vec4(v_color.rgb, v_color.a * coverage);
  }
`;

function compileParticleShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a particle shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Particle shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createParticleProgram(gl: WebGLRenderingContext): {
  readonly program: WebGLProgram;
  readonly vertexShader: WebGLShader;
  readonly fragmentShader: WebGLShader;
} {
  const vertexShader = compileParticleShader(gl, gl.VERTEX_SHADER, PARTICLE_BACKGROUND_VERTEX_SHADER);
  const fragmentShader = compileParticleShader(gl, gl.FRAGMENT_SHADER, PARTICLE_BACKGROUND_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL could not create the particle program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Particle shader linking failed";
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(message);
  }
  return { program, vertexShader, fragmentShader };
}

function smootherParticleTransition(value: number): number {
  const progress = Math.min(1, Math.max(0, value));
  return progress * progress * progress
    * (progress * (progress * 6 - 15) + 10);
}

function criticalParticleSpringProgress(elapsed: number, response: number): number {
  const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / Math.max(response, 0.1);
  const springTime = omega * Math.max(0, elapsed);
  return Math.min(1, Math.max(0, 1 - (1 + springTime) * Math.exp(-springTime)));
}

class ParticleImageRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGLRenderingContext;
  readonly #program: WebGLProgram;
  readonly #vertexShader: WebGLShader;
  readonly #fragmentShader: WebGLShader;
  readonly #attributes: Readonly<Record<"previousHome" | "home" | "previousVelocity" | "previousColor" | "color" | "seed", number>>;
  readonly #uniforms: Readonly<Record<
    "resolution" | "layout" | "pointerSegments" | "pointerMotion"
    | "pointerCount" | "time" | "transitionStart" | "transitionNearResponse" | "transitionFarResponse"
    | "transitionStagger" | "transitionActive" | "transitionVisibility" | "dpr"
    | "particleSize" | "particleOpacity" | "speed" | "noiseScale" | "noiseStrength" | "damping"
    | "ambientCycle" | "cursorStrength",
    WebGLUniformLocation
  >>;
  readonly #buffers: Readonly<Record<"previousHome" | "home" | "previousVelocity" | "previousColor" | "color" | "seed", WebGLBuffer>>;
  readonly #pointerSegments: ParticlePointerSegment[] = [];
  readonly #pointerSegmentValues = new Float32Array(PARTICLE_BACKGROUND_POINTER_SEGMENTS * 4);
  readonly #pointerMotionValues = new Float32Array(PARTICLE_BACKGROUND_POINTER_SEGMENTS * 4);
  readonly #reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #onError: (message: string) => void;
  readonly #onTransitionFrame: (progress: number, complete: boolean) => void;
  #previousHomes: Float32Array<ArrayBuffer> = new Float32Array(0);
  #homes: Float32Array<ArrayBuffer> = new Float32Array(0);
  #previousVelocities: Float32Array<ArrayBuffer> = new Float32Array(0);
  #previousColors: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  #colors: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  #seeds: Float32Array<ArrayBuffer> = new Float32Array(0);
  #naturalWidth = 1;
  #naturalHeight = 1;
  #count = 0;
  #cssWidth = 1;
  #cssHeight = 1;
  #dpr = 1;
  #simulationTime = 12.4;
  #lastFrame = performance.now();
  #transitionStart = 0;
  #transitionDuration = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionMaxResponse = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionVelocityRatio = 0;
  #transitionActive = false;
  #transitionVisibility = 0;
  #transitionReleaseStart = -100;
  #transitionRevision = 0;
  #transitionResolve: ((completed: boolean) => void) | undefined;
  #imageRevision = 0;
  #settings: ParticleBackgroundSettings;
  #animationFrame = 0;
  #disposed = false;
  #paused = false;
  #lastPointer: { readonly x: number; readonly y: number; readonly at: number } | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    onError: (message: string) => void,
    settings: ParticleBackgroundSettings,
    onTransitionFrame: (progress: number, complete: boolean) => void,
  ) {
    this.#canvas = canvas;
    this.#onError = onError;
    this.#settings = settings;
    this.#onTransitionFrame = onTransitionFrame;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL is unavailable");
    this.#gl = gl;
    const compiled = createParticleProgram(gl);
    this.#program = compiled.program;
    this.#vertexShader = compiled.vertexShader;
    this.#fragmentShader = compiled.fragmentShader;
    this.#attributes = {
      previousHome: this.#requiredAttribute("a_previousHome"),
      home: this.#requiredAttribute("a_home"),
      previousVelocity: this.#requiredAttribute("a_previousVelocity"),
      previousColor: this.#requiredAttribute("a_previousColor"),
      color: this.#requiredAttribute("a_color"),
      seed: this.#requiredAttribute("a_seed"),
    };
    this.#uniforms = {
      resolution: this.#requiredUniform("u_resolution"),
      layout: this.#requiredUniform("u_layout"),
      pointerSegments: this.#requiredUniform("u_pointerSegments[0]"),
      pointerMotion: this.#requiredUniform("u_pointerMotion[0]"),
      pointerCount: this.#requiredUniform("u_pointerCount"),
      time: this.#requiredUniform("u_time"),
      transitionStart: this.#requiredUniform("u_transitionStart"),
      transitionNearResponse: this.#requiredUniform("u_transitionNearResponse"),
      transitionFarResponse: this.#requiredUniform("u_transitionFarResponse"),
      transitionStagger: this.#requiredUniform("u_transitionStagger"),
      transitionActive: this.#requiredUniform("u_transitionActive"),
      transitionVisibility: this.#requiredUniform("u_transitionVisibility"),
      dpr: this.#requiredUniform("u_dpr"),
      particleSize: this.#requiredUniform("u_particleSize"),
      particleOpacity: this.#requiredUniform("u_particleOpacity"),
      speed: this.#requiredUniform("u_speed"),
      noiseScale: this.#requiredUniform("u_noiseScale"),
      noiseStrength: this.#requiredUniform("u_noiseStrength"),
      damping: this.#requiredUniform("u_damping"),
      ambientCycle: this.#requiredUniform("u_ambientCycle"),
      cursorStrength: this.#requiredUniform("u_cursorStrength"),
    };
    this.#buffers = {
      previousHome: this.#requiredBuffer(),
      home: this.#requiredBuffer(),
      previousVelocity: this.#requiredBuffer(),
      previousColor: this.#requiredBuffer(),
      color: this.#requiredBuffer(),
      seed: this.#requiredBuffer(),
    };
    gl.useProgram(this.#program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    this.#bindAttributes();
    this.resize();
    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.#onPointerMove, { capture: true, passive: true });
    window.addEventListener("blur", this.#resetPointer, { passive: true });
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    this.#reducedMotion.addEventListener("change", this.#onReducedMotionChange);
    canvas.addEventListener("webglcontextlost", this.#onContextLost);
    this.#paused = document.hidden || this.#reducedMotion.matches;
    this.#scheduleFrame();
  }

  get count(): number {
    return this.#count;
  }

  setRenderSettings(settings: ParticleBackgroundSettings): void {
    if (this.#disposed) return;
    const dprChanged = settings.dprCap !== this.#settings.dprCap;
    const cursorDisabled = this.#settings.cursorInteraction && !settings.cursorInteraction;
    this.#settings = settings;
    this.#transitionDuration = settings.morphIntervalSeconds;
    if (cursorDisabled) {
      this.#lastPointer = undefined;
      const tail = this.#pointerSegments.at(-1);
      if (tail) tail.sealed = true;
    }
    if (dprChanged) this.resize();
    else if (this.#paused) this.#draw(performance.now(), false);
  }

  setPreparedImage(image: PreparedParticleImage): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
    const now = performance.now();
    if (!this.#paused) this.#simulationTime = this.#clockSeconds(now);
    this.#lastFrame = now;
    const revision = ++this.#imageRevision;
    this.#interruptTransition();
    const canMorph = this.#count === image.targetCount
      && this.#count > 0
      && !this.#reducedMotion.matches
      && this.#captureCurrentImagePresentation();
    this.#homes = image.normalizedHomes;
    this.#colors = image.colors;
    this.#seeds = image.seeds;
    this.#naturalWidth = image.naturalWidth;
    this.#naturalHeight = image.naturalHeight;
    this.#count = image.targetCount;
    this.#transitionDuration = this.#settings.morphIntervalSeconds;
    this.#transitionStart = this.#clockSeconds();
    if (!canMorph) {
      this.#previousHomes = new Float32Array(image.targetCount * 2);
      this.#previousVelocities = new Float32Array(image.targetCount * 2);
      this.#previousColors = new Uint8Array(image.targetCount * 4);
      this.#copyCurrentHomesTo(this.#previousHomes);
      this.#previousColors.set(this.#colors);
    }
    this.#transitionMaxResponse = canMorph
      ? this.#estimateMaximumTransitionResponse()
      : this.#transitionDuration;
    if (!canMorph) this.#transitionVelocityRatio = 0;
    this.#uploadBuffer(this.#buffers.previousHome, this.#previousHomes);
    this.#uploadBuffer(this.#buffers.home, this.#homes);
    this.#uploadBuffer(this.#buffers.previousVelocity, this.#previousVelocities);
    this.#uploadBuffer(this.#buffers.previousColor, this.#previousColors);
    this.#uploadBuffer(this.#buffers.color, this.#colors);
    this.#uploadBuffer(this.#buffers.seed, this.#seeds);
    this.#bindAttributes();
    const transition = this.#beginTransition(canMorph, revision);
    if (this.#paused) this.#draw(performance.now(), false);
    return transition;
  }

  setPaused(paused: boolean): void {
    this.#paused = paused || document.hidden || this.#reducedMotion.matches;
    this.#lastFrame = performance.now();
    if (this.#paused && this.#transitionActive) this.#completeTransition();
    if (!this.#paused) this.#scheduleFrame();
    else this.#draw(performance.now(), false);
  }

  readonly resize = (): void => {
    if (this.#disposed) return;
    this.#cssWidth = Math.max(1, window.innerWidth);
    this.#cssHeight = Math.max(1, window.innerHeight);
    this.#dpr = Math.min(this.#settings.dprCap, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(this.#cssWidth * this.#dpr));
    const height = Math.max(1, Math.round(this.#cssHeight * this.#dpr));
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    this.#gl.viewport(0, 0, width, height);
    if (this.#paused) this.#draw(performance.now(), false);
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#interruptTransition();
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.#onPointerMove, true);
    window.removeEventListener("blur", this.#resetPointer);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
    this.#reducedMotion.removeEventListener("change", this.#onReducedMotionChange);
    this.#canvas.removeEventListener("webglcontextlost", this.#onContextLost);
    for (const buffer of Object.values(this.#buffers)) this.#gl.deleteBuffer(buffer);
    this.#gl.deleteProgram(this.#program);
    this.#gl.deleteShader(this.#vertexShader);
    this.#gl.deleteShader(this.#fragmentShader);
    this.#gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.#pointerSegments.length = 0;
  }

  #requiredAttribute(name: string): number {
    const location = this.#gl.getAttribLocation(this.#program, name);
    if (location < 0) throw new Error(`Particle shader attribute ${name} is unavailable`);
    return location;
  }

  #requiredUniform(name: string): WebGLUniformLocation {
    const location = this.#gl.getUniformLocation(this.#program, name);
    if (!location) throw new Error(`Particle shader uniform ${name} is unavailable`);
    return location;
  }

  #requiredBuffer(): WebGLBuffer {
    const buffer = this.#gl.createBuffer();
    if (!buffer) throw new Error("WebGL could not create a particle buffer");
    return buffer;
  }

  #uploadBuffer(buffer: WebGLBuffer, values: BufferSource): void {
    this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, buffer);
    this.#gl.bufferData(this.#gl.ARRAY_BUFFER, values, this.#gl.STATIC_DRAW);
  }

  #bindAttributes(): void {
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.previousHome);
    gl.enableVertexAttribArray(this.#attributes.previousHome);
    gl.vertexAttribPointer(this.#attributes.previousHome, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.home);
    gl.enableVertexAttribArray(this.#attributes.home);
    gl.vertexAttribPointer(this.#attributes.home, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.previousVelocity);
    gl.enableVertexAttribArray(this.#attributes.previousVelocity);
    gl.vertexAttribPointer(this.#attributes.previousVelocity, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.previousColor);
    gl.enableVertexAttribArray(this.#attributes.previousColor);
    gl.vertexAttribPointer(this.#attributes.previousColor, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.color);
    gl.enableVertexAttribArray(this.#attributes.color);
    gl.vertexAttribPointer(this.#attributes.color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.seed);
    gl.enableVertexAttribArray(this.#attributes.seed);
    gl.vertexAttribPointer(this.#attributes.seed, 1, gl.FLOAT, false, 0, 0);
  }

  #layout(naturalWidth: number, naturalHeight: number): readonly [number, number, number, number] {
    const scale = Math.min(this.#cssWidth / Math.max(1, naturalWidth), this.#cssHeight / Math.max(1, naturalHeight));
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return [(this.#cssWidth - width) * 0.5, (this.#cssHeight - height) * 0.5, width, height];
  }

  #transitionNearResponse(): number {
    return this.#transitionDuration * PARTICLE_BACKGROUND_MORPH_NEAR_RESPONSE_RATIO;
  }

  #transitionStagger(): number {
    return this.#transitionDuration * PARTICLE_BACKGROUND_MORPH_STAGGER_RATIO;
  }

  #transitionProgress(): number {
    if (!this.#transitionActive) return 1;
    return criticalParticleSpringProgress(
      this.#simulationTime - this.#transitionStart - this.#transitionStagger() * 0.35,
      this.#transitionMaxResponse,
    );
  }

  #particleTransitionResponse(distance: number, seed: number): number {
    const distanceReference = Math.max(
      Math.hypot(this.#cssWidth, this.#cssHeight) * PARTICLE_BACKGROUND_MORPH_DISTANCE_SCALE,
      80,
    );
    const distanceFactor = smootherParticleTransition(distance / distanceReference);
    const variation = 1 - PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION
      + seed * PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION * 2;
    return (
      this.#transitionNearResponse()
      + distanceFactor * (this.#transitionDuration - this.#transitionNearResponse())
    ) * variation;
  }

  #copyCurrentHomesTo(destination: Float32Array<ArrayBuffer>): boolean {
    if (destination.length !== this.#homes.length) return false;
    const [x, y, width, height] = this.#layout(this.#naturalWidth, this.#naturalHeight);
    for (let index = 0; index < this.#count; index += 1) {
      const offset = index * 2;
      destination[offset] = x + (this.#homes[offset] ?? 0) * width;
      destination[offset + 1] = y + (this.#homes[offset + 1] ?? 0) * height;
    }
    return true;
  }

  #captureCurrentImagePresentation(): boolean {
    if (
      !this.#count
      || this.#previousHomes.length !== this.#homes.length
      || this.#previousVelocities.length !== this.#homes.length
      || this.#previousColors.length !== this.#colors.length
    ) return false;
    if (!this.#transitionActive) {
      if (!this.#copyCurrentHomesTo(this.#previousHomes)) return false;
      this.#previousVelocities.fill(0);
      this.#previousColors.set(this.#colors);
      return true;
    }

    const elapsed = Math.max(0, this.#simulationTime - this.#transitionStart);
    const stagger = this.#transitionStagger();
    const [x, y, width, height] = this.#layout(this.#naturalWidth, this.#naturalHeight);
    for (let index = 0; index < this.#count; index += 1) {
      const offset = index * 2;
      const previousX = this.#previousHomes[offset] ?? 0;
      const previousY = this.#previousHomes[offset + 1] ?? 0;
      const homeX = x + (this.#homes[offset] ?? 0) * width;
      const homeY = y + (this.#homes[offset + 1] ?? 0) * height;
      const distance = Math.hypot(homeX - previousX, homeY - previousY);
      const response = this.#particleTransitionResponse(distance, this.#seeds[index] ?? 0);
      const displacementX = previousX - homeX;
      const displacementY = previousY - homeY;
      const initialVelocityX = this.#previousVelocities[offset] ?? 0;
      const initialVelocityY = this.#previousVelocities[offset + 1] ?? 0;
      const hasCarriedVelocity = Math.hypot(initialVelocityX, initialVelocityY) >= 0.01;
      const seed = this.#seeds[index] ?? 0;
      const transitionDelay = hasCarriedVelocity ? 0 : seed * seed * stagger;
      const springElapsed = Math.max(0, elapsed - transitionDelay);
      const progress = criticalParticleSpringProgress(springElapsed, response);
      const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / response;
      const decay = Math.exp(-omega * springElapsed);
      const velocityTermX = initialVelocityX + omega * displacementX;
      const velocityTermY = initialVelocityY + omega * displacementY;
      this.#previousHomes[offset] = homeX
        + (displacementX + velocityTermX * springElapsed) * decay;
      this.#previousHomes[offset + 1] = homeY
        + (displacementY + velocityTermY * springElapsed) * decay;
      this.#previousVelocities[offset] = (
        initialVelocityX - omega * velocityTermX * springElapsed
      ) * decay;
      this.#previousVelocities[offset + 1] = (
        initialVelocityY - omega * velocityTermY * springElapsed
      ) * decay;
      const colorProgress = smootherParticleTransition((progress - 0.18) / 0.82);
      const inverseColor = 1 - colorProgress;
      const colorOffset = index * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const channelOffset = colorOffset + channel;
        this.#previousColors[channelOffset] = Math.round(
          (this.#previousColors[channelOffset] ?? 0) * inverseColor
          + (this.#colors[channelOffset] ?? 0) * colorProgress,
        );
      }
    }
    return true;
  }

  #estimateMaximumTransitionResponse(): number {
    const [x, y, width, height] = this.#layout(this.#naturalWidth, this.#naturalHeight);
    let maximumResponse = this.#transitionNearResponse()
      * (1 - PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION);
    let maximumVelocityRatio = 0;
    for (let index = 0; index < this.#count; index += 1) {
      const offset = index * 2;
      const homeX = x + (this.#homes[offset] ?? 0) * width;
      const homeY = y + (this.#homes[offset + 1] ?? 0) * height;
      const distance = Math.hypot(
        homeX - (this.#previousHomes[offset] ?? 0),
        homeY - (this.#previousHomes[offset + 1] ?? 0),
      );
      const response = this.#particleTransitionResponse(distance, this.#seeds[index] ?? 0);
      maximumResponse = Math.max(maximumResponse, response);
      const velocity = Math.hypot(
        this.#previousVelocities[offset] ?? 0,
        this.#previousVelocities[offset + 1] ?? 0,
      );
      const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / response;
      maximumVelocityRatio = Math.max(maximumVelocityRatio, velocity / (omega * Math.max(distance, 1)));
    }
    this.#transitionVelocityRatio = maximumVelocityRatio;
    return maximumResponse;
  }

  #transitionSettled(): boolean {
    if (!this.#transitionActive) return true;
    const elapsed = Math.max(
      0,
      this.#simulationTime - this.#transitionStart - this.#transitionStagger(),
    );
    const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / this.#transitionMaxResponse;
    const springTime = omega * elapsed;
    const decay = Math.exp(-springTime);
    const carriedVelocity = this.#transitionVelocityRatio;
    const error = (1 + (1 + carriedVelocity) * springTime) * decay;
    const velocity = omega * (
      carriedVelocity + (1 + carriedVelocity) * springTime
    ) * decay;
    return error <= PARTICLE_BACKGROUND_MORPH_SETTLE_ERROR
      && velocity <= PARTICLE_BACKGROUND_MORPH_SETTLE_VELOCITY;
  }

  #interruptTransition(): void {
    const resolve = this.#transitionResolve;
    this.#transitionResolve = undefined;
    this.#transitionRevision = 0;
    resolve?.(false);
  }

  #beginTransition(active: boolean, revision: number): Promise<boolean> {
    this.#transitionActive = active;
    this.#transitionVisibility = active ? 1 : 0;
    this.#transitionReleaseStart = -100;
    this.#onTransitionFrame(active ? 0 : 1, !active);
    if (!active) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      this.#transitionRevision = revision;
      this.#transitionResolve = resolve;
    });
  }

  #completeTransition(): void {
    if (!this.#transitionActive) return;
    this.#transitionActive = false;
    this.#transitionVisibility = 1;
    this.#transitionReleaseStart = this.#simulationTime;
    this.#onTransitionFrame(1, true);
    const resolve = this.#transitionResolve;
    const revision = this.#transitionRevision;
    this.#transitionResolve = undefined;
    this.#transitionRevision = 0;
    resolve?.(revision === this.#imageRevision && !this.#disposed);
  }

  #updateTransitionVisibility(): void {
    if (this.#transitionActive || this.#transitionVisibility <= 0) return;
    const elapsed = this.#simulationTime - this.#transitionReleaseStart;
    this.#transitionVisibility = 1 - smootherParticleTransition(
      elapsed / PARTICLE_BACKGROUND_MORPH_VISIBILITY_RELEASE_SECONDS,
    );
  }

  #clockSeconds(timestamp = performance.now()): number {
    if (this.#paused) return this.#simulationTime;
    const pending = Math.min(
      PARTICLE_BACKGROUND_MAX_FRAME_DELTA_SECONDS,
      Math.max(0, (timestamp - this.#lastFrame) / 1_000),
    );
    return this.#simulationTime + pending;
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (this.#disposed || this.#paused || !this.#settings.cursorInteraction || !event.isPrimary) return;
    const now = this.#clockSeconds();
    const previous = this.#lastPointer;
    this.#lastPointer = { x: event.clientX, y: event.clientY, at: now };
    if (!previous) return;
    const tail = this.#pointerSegments.at(-1);
    const elapsed = now - previous.at;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    if (elapsed <= 0.001 || elapsed > PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS) {
      if (tail) tail.sealed = true;
      return;
    }
    const speed = Math.hypot(deltaX, deltaY) / elapsed;
    if (speed < 1.5) {
      if (tail && now - tail.startedAt >= PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS) {
        tail.sealed = true;
      }
      return;
    }
    if (
      tail
      && !tail.sealed
      && now - tail.startedAt > PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS * 1.5
    ) {
      tail.sealed = true;
    }
    const rawVelocityX = deltaX / elapsed;
    const rawVelocityY = deltaY / elapsed;
    const baseStrength = Math.min(
      Math.max(this.#settings.cursorStrength, 0),
      PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
    );
    const cursorScale = baseStrength * 6.25;
    const strengthRatio = Math.max(0, baseStrength / 0.64);
    const extendedStrength = Math.max(1, strengthRatio / 15.625);
    const extremeStrength = Math.max(1, strengthRatio / 31.25);
    const overdrive = Math.max(
      1,
      this.#settings.cursorStrength / PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
    );
    const targetSpeedLimit = 5_200
      * Math.pow(Math.max(strengthRatio, 1), 0.45)
      * Math.pow(extendedStrength, 0.28)
      * Math.pow(extremeStrength, 0.32)
      * Math.pow(overdrive, 0.45);
    const targetSpeed = cursorScale > 0
      ? Math.min(targetSpeedLimit, speed * (1.04 + 0.14 * cursorScale) * Math.sqrt(overdrive))
      : 0;
    const targetVelocityX = rawVelocityX / speed * targetSpeed;
    const targetVelocityY = rawVelocityY / speed * targetSpeed;
    const prior = tail && now - tail.createdAt <= PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS
      ? tail
      : undefined;
    const velocityX = prior ? prior.velocityX * 0.28 + targetVelocityX * 0.72 : targetVelocityX;
    const velocityY = prior ? prior.velocityY * 0.28 + targetVelocityY * 0.72 : targetVelocityY;
    if (tail && !tail.sealed) {
      tail.endX = event.clientX;
      tail.endY = event.clientY;
      tail.velocityX = velocityX;
      tail.velocityY = velocityY;
      tail.createdAt = now;
      tail.duration = Math.max(0.001, now - tail.startedAt);
      tail.sealed = tail.duration >= PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS;
    } else {
      this.#pointerSegments.push({
        startX: previous.x,
        startY: previous.y,
        endX: event.clientX,
        endY: event.clientY,
        velocityX,
        velocityY,
        startedAt: previous.at,
        createdAt: now,
        duration: elapsed,
        sealed: elapsed >= PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS,
      });
    }
    if (this.#pointerSegments.length > PARTICLE_BACKGROUND_POINTER_SEGMENTS) {
      this.#pointerSegments.shift();
    }
  };

  #resetPointer = (): void => {
    this.#lastPointer = undefined;
    const tail = this.#pointerSegments.at(-1);
    if (tail) tail.sealed = true;
  };

  #onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = 0;
      this.#resetPointer();
      this.#lastFrame = performance.now();
      return;
    }
    this.#lastFrame = performance.now();
    if (!this.#paused && !this.#reducedMotion.matches) this.#scheduleFrame();
  };

  #onReducedMotionChange = (): void => {
    this.setPaused(this.#reducedMotion.matches);
  };

  #onContextLost = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    this.#onError("The particle renderer lost its WebGL context. Disable and re-enable the plugin.");
  };

  #scheduleFrame(): void {
    if (this.#disposed || this.#paused || document.hidden || this.#animationFrame) return;
    this.#animationFrame = requestAnimationFrame((timestamp) => {
      this.#animationFrame = 0;
      this.#draw(timestamp, true);
    });
  }

  #draw(timestamp: number, scheduleNext: boolean): void {
    if (this.#disposed) return;
    if (!this.#paused) {
      this.#simulationTime = this.#clockSeconds(timestamp);
    }
    this.#lastFrame = timestamp;
    const gl = this.#gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.#count > 0) {
      const time = this.#simulationTime;
      if (this.#transitionActive) {
        this.#onTransitionFrame(this.#transitionProgress(), false);
        if (this.#transitionSettled()) this.#completeTransition();
      }
      this.#updateTransitionVisibility();
      while (
        this.#pointerSegments.length
        && time - (this.#pointerSegments[0]?.createdAt ?? time) > PARTICLE_BACKGROUND_MAX_LIFETIME_SECONDS
      ) {
        this.#pointerSegments.shift();
      }
      this.#pointerSegmentValues.fill(0);
      this.#pointerMotionValues.fill(0);
      for (let index = 0; index < this.#pointerSegments.length; index += 1) {
        const segment = this.#pointerSegments[index];
        if (!segment) continue;
        const segmentOffset = index * 4;
        this.#pointerSegmentValues[segmentOffset] = segment.startX;
        this.#pointerSegmentValues[segmentOffset + 1] = segment.startY;
        this.#pointerSegmentValues[segmentOffset + 2] = segment.endX;
        this.#pointerSegmentValues[segmentOffset + 3] = segment.endY;
        this.#pointerMotionValues[segmentOffset] = segment.velocityX;
        this.#pointerMotionValues[segmentOffset + 1] = segment.velocityY;
        this.#pointerMotionValues[segmentOffset + 2] = Math.max(0, time - segment.createdAt);
        this.#pointerMotionValues[segmentOffset + 3] = Math.max(0.001, segment.duration);
      }
      const layout = this.#layout(this.#naturalWidth, this.#naturalHeight);
      gl.useProgram(this.#program);
      gl.uniform2f(this.#uniforms.resolution, this.#cssWidth, this.#cssHeight);
      gl.uniform4f(this.#uniforms.layout, layout[0], layout[1], layout[2], layout[3]);
      gl.uniform4fv(this.#uniforms.pointerSegments, this.#pointerSegmentValues);
      gl.uniform4fv(this.#uniforms.pointerMotion, this.#pointerMotionValues);
      gl.uniform1f(this.#uniforms.pointerCount, this.#pointerSegments.length);
      gl.uniform1f(this.#uniforms.time, time);
      gl.uniform1f(this.#uniforms.transitionStart, this.#transitionStart);
      gl.uniform1f(this.#uniforms.transitionNearResponse, this.#transitionNearResponse());
      gl.uniform1f(this.#uniforms.transitionFarResponse, this.#transitionDuration);
      gl.uniform1f(this.#uniforms.transitionStagger, this.#transitionStagger());
      gl.uniform1f(this.#uniforms.transitionActive, this.#transitionActive ? 1 : 0);
      gl.uniform1f(this.#uniforms.transitionVisibility, this.#transitionVisibility);
      gl.uniform1f(this.#uniforms.dpr, this.#dpr);
      gl.uniform1f(this.#uniforms.particleSize, this.#settings.particleSize);
      gl.uniform1f(this.#uniforms.particleOpacity, this.#settings.particleOpacity);
      gl.uniform1f(this.#uniforms.speed, this.#settings.speed);
      gl.uniform1f(this.#uniforms.noiseScale, this.#settings.noiseScale);
      gl.uniform1f(this.#uniforms.noiseStrength, this.#settings.noiseStrength);
      gl.uniform1f(this.#uniforms.damping, this.#settings.damping);
      gl.uniform1f(this.#uniforms.ambientCycle, this.#settings.ambientCycle);
      gl.uniform1f(this.#uniforms.cursorStrength, this.#settings.cursorStrength);
      this.#bindAttributes();
      gl.drawArrays(gl.POINTS, 0, this.#count);
    }
    if (scheduleNext) this.#scheduleFrame();
  }
}

function openParticleImageDatabase(onVersionChange: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(PARTICLE_BACKGROUND_DB_NAME, PARTICLE_BACKGROUND_DB_VERSION);
    let settled = false;
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PARTICLE_BACKGROUND_STORE)) {
        database.createObjectStore(PARTICLE_BACKGROUND_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.addEventListener("versionchange", () => {
        database.close();
        onVersionChange();
      }, { once: true });
      resolve(database);
    });
    request.addEventListener("blocked", () => {
      if (settled) return;
      settled = true;
      reject(new Error("The image library database is blocked"));
    }, { once: true });
    request.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("The image library database could not be opened"));
    }, { once: true });
  });
}

function readParticleImageRecords(database: IDBDatabase): Promise<ParticleImageRecord[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(PARTICLE_BACKGROUND_STORE, "readonly")
      .objectStore(PARTICLE_BACKGROUND_STORE)
      .getAll();
    request.addEventListener("success", () => {
      const records = Array.isArray(request.result)
        ? request.result.filter((value): value is ParticleImageRecord => {
          if (!value || typeof value !== "object") return false;
          const record = value as Partial<ParticleImageRecord>;
          return typeof record.id === "string"
            && typeof record.name === "string"
            && typeof record.type === "string"
            && typeof record.size === "number"
            && typeof record.createdAt === "number"
            && record.blob instanceof Blob
            && record.thumbnail instanceof Blob;
        })
        : [];
      resolve(records);
    });
    request.addEventListener("error", () => reject(request.error ?? new Error("Saved particle images could not be read")), { once: true });
  });
}

function saveParticleImageRecord(database: IDBDatabase, record: ParticleImageRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PARTICLE_BACKGROUND_STORE, "readwrite");
    transaction.objectStore(PARTICLE_BACKGROUND_STORE).put(record);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("The image could not be saved")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("The image could not be saved")), { once: true });
  });
}

function deleteParticleImageRecord(database: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PARTICLE_BACKGROUND_STORE, "readwrite");
    transaction.objectStore(PARTICLE_BACKGROUND_STORE).delete(id);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("The image could not be deleted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("The image could not be deleted")), { once: true });
  });
}

async function createParticleThumbnail(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 180 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The thumbnail canvas is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const luminance = Math.round(
        (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722,
      );
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
    }
    context.putImageData(imageData, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The thumbnail could not be created")), "image/png", 0.82);
    });
  } finally {
    bitmap.close();
  }
}

class ParticleBackgroundController {
  readonly #listeners = new Set<() => void>();
  readonly #thumbnailUrls = new Map<string, string>();
  readonly #reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  #settings = readParticleBackgroundSettings();
  #records: ParticleImageRecord[] = [];
  #database: IDBDatabase | null = null;
  #initialization: Promise<void> | undefined;
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #previousImage: HTMLImageElement | undefined;
  #image: HTMLImageElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: ParticleImageRenderer | undefined;
  #preparationCache: ParticleImagePreparationCache | undefined;
  #currentSourceUrl: string | undefined;
  #previousSourceUrl: string | undefined;
  #sourceTransitioning = false;
  #sourceTransitionProgress = 1;
  #sourceTransitionOutgoingScale = 1;
  #rotationTimer = 0;
  #generation = 0;
  #disposed = false;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() {
    window.addEventListener("pagehide", this.#onPageHide, { once: true });
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    this.#reducedMotion.addEventListener("change", this.#onReducedMotionChange);
  }

  get settings(): ParticleBackgroundSettings {
    return this.#settings;
  }

  get records(): readonly ParticleImageRecord[] {
    return this.#records;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  get pending(): boolean {
    return this.#pending;
  }

  get error(): string | undefined {
    return this.#error;
  }

  get activeImageId(): string | null {
    return this.#settings.activeImageId;
  }

  get stoppedForExternalThemeChange(): boolean {
    return this.#stoppedForExternalThemeChange;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.#initialization) return this.#initialization;
    this.#initialization = this.#initialize();
    return this.#initialization;
  }

  async enable(): Promise<void> {
    const generation = this.#generation;
    await this.initialize();
    if (
      this.#disposed
      || this.#enabled
      || this.#pending
      || this.#enableOperation
      || generation !== this.#generation
    ) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try {
      await operation;
    } finally {
      if (this.#enableOperation === operation) this.#enableOperation = undefined;
    }
  }

  async #performEnable(generation: number): Promise<void> {
    this.#stoppedForExternalThemeChange = false;
    this.#pending = true;
    this.#error = undefined;
    this.#notify();
    try {
      if (!document.body) throw new Error("The Codex window is not ready");
      await this.#ensureCodexDarkTheme();
      if (this.#disposed || generation !== this.#generation) return;
      const layer = document.createElement("div");
      layer.dataset.codeCodexParticleLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      const previousImage = document.createElement("img");
      previousImage.className = "code-codex-particle-source code-codex-particle-source-previous";
      previousImage.alt = "";
      const image = document.createElement("img");
      image.className = "code-codex-particle-source code-codex-particle-source-current";
      image.alt = "";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas";
      layer.append(previousImage, image, canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#previousImage = previousImage;
      this.#image = image;
      this.#canvas = canvas;
      this.#preparationCache = new ParticleImagePreparationCache();
      try {
        this.#renderer = new ParticleImageRenderer(canvas, (message) => {
          this.#error = message;
          this.#notify();
        }, this.#settings, (progress, complete) => {
          this.#updateSourceTransition(progress, complete);
        });
      } catch (error) {
        this.#error = error instanceof Error ? `${error.message}; showing the source image only.` : "WebGL is unavailable; showing the source image only.";
      }
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, this.#settings.backgroundColor);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
      this.#applySourcePresentation();
      const initialId = this.#validActiveImageId() ?? this.#settings.selectedImageIds[0] ?? null;
      if (initialId) await this.#activateImage(initialId, false);
      else {
        this.#error = "Add an image in Source to start the particle effect.";
        this.#scheduleRotation();
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Particle Image Background could not be enabled";
      this.#teardownPresentation();
      try {
        await this.#restoreCodexAppearanceTheme();
      } catch {
        // Keep the original activation error. A retained lease retries restoration later.
      }
      throw error;
    } finally {
      this.#pending = false;
      this.#notify();
    }
  }

  async disable(): Promise<void> {
    const pendingEnable = this.#enableOperation;
    this.#stoppedForExternalThemeChange = false;
    const hadPresentation = this.#enabled || this.#pending || Boolean(this.#layer);
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    if (hadPresentation) this.#teardownPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    try {
      await this.#restoreCodexAppearanceTheme();
      this.#error = undefined;
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The previous Codex Appearance could not be restored";
    }
    this.#notify();
  }

  async updateSettings(next: ParticleBackgroundSettings): Promise<void> {
    const previous = this.#settings;
    this.#settings = normalizeParticleSettings(next);
    writeParticleBackgroundSettings(this.#settings);
    if (this.#enabled) {
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, this.#settings.backgroundColor);
      this.#applySourcePresentation();
      this.#renderer?.setRenderSettings(this.#settings);
      if (previous.particleCount !== this.#settings.particleCount) {
        this.#preparationCache?.invalidate();
        const activeId = this.#validActiveImageId();
        if (activeId) await this.#activateImage(activeId, false);
      } else {
        this.#scheduleRotation();
      }
    }
    this.#notify();
  }

  async addImages(files: FileList | readonly File[]): Promise<void> {
    await this.initialize();
    const candidates = Array.from(files);
    if (!candidates.length) return;
    this.#pending = true;
    this.#error = undefined;
    this.#notify();
    const imported: ParticleImageRecord[] = [];
    try {
      let totalBytes = this.#records.reduce((total, record) => total + record.size, 0);
      for (const file of candidates) {
        if (this.#records.length + imported.length >= PARTICLE_BACKGROUND_MAX_IMAGES) {
          this.#error = `The image library can contain up to ${PARTICLE_BACKGROUND_MAX_IMAGES} images.`;
          break;
        }
        if (!PARTICLE_BACKGROUND_IMAGE_TYPES.has(file.type)) {
          this.#error = `${file.name} is not a supported PNG, JPEG, WebP, GIF, or AVIF image.`;
          continue;
        }
        if (!file.size || file.size > PARTICLE_BACKGROUND_MAX_IMAGE_BYTES) {
          this.#error = `${file.name} must be smaller than 30 MB.`;
          continue;
        }
        if (totalBytes + file.size > PARTICLE_BACKGROUND_MAX_TOTAL_BYTES) {
          this.#error = "The image library has reached its 256 MB limit.";
          break;
        }
        try {
          const thumbnail = await createParticleThumbnail(file);
          const record: ParticleImageRecord = {
            id: typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
            name: file.name.slice(0, 240),
            type: file.type,
            size: file.size,
            createdAt: Date.now() + imported.length,
            blob: file,
            thumbnail,
          };
          if (this.#database) await saveParticleImageRecord(this.#database, record);
          imported.push(record);
          totalBytes += file.size;
        } catch (error) {
          this.#error = error instanceof Error ? `${file.name}: ${error.message}` : `${file.name} could not be saved.`;
        }
      }
      if (!imported.length) return;
      this.#records = [...this.#records, ...imported].sort((first, second) => first.createdAt - second.createdAt);
      const selectedImageIds = [...this.#settings.selectedImageIds];
      for (const record of imported) if (!selectedImageIds.includes(record.id)) selectedImageIds.push(record.id);
      this.#settings = normalizeParticleSettings({
        ...this.#settings,
        selectedImageIds,
        activeImageId: imported[0]?.id ?? this.#settings.activeImageId,
      });
      writeParticleBackgroundSettings(this.#settings);
      if (this.#enabled && imported[0]) await this.#activateImage(imported[0].id, true);
    } finally {
      this.#pending = false;
      this.#notify();
    }
  }

  async toggleImageSelection(id: string): Promise<void> {
    await this.initialize();
    if (!this.#records.some((record) => record.id === id)) return;
    const selectedImageIds = [...this.#settings.selectedImageIds];
    const index = selectedImageIds.indexOf(id);
    if (index >= 0) selectedImageIds.splice(index, 1);
    else selectedImageIds.push(id);
    this.#settings = normalizeParticleSettings({ ...this.#settings, selectedImageIds });
    writeParticleBackgroundSettings(this.#settings);
    this.#preparationCache?.invalidate();
    this.#notify();
    if (index < 0 && this.#enabled) await this.#activateImage(id, true);
    else this.#scheduleRotation();
  }

  clearOrder(): void {
    this.#settings = normalizeParticleSettings({ ...this.#settings, selectedImageIds: [] });
    writeParticleBackgroundSettings(this.#settings);
    this.#stopRotation();
    this.#preparationCache?.invalidate();
    this.#notify();
  }

  async deleteImage(id: string): Promise<void> {
    await this.initialize();
    const record = this.#records.find((candidate) => candidate.id === id);
    if (!record) return;
    this.#pending = true;
    this.#error = undefined;
    this.#notify();
    try {
      if (this.#database) await deleteParticleImageRecord(this.#database, id);
      this.#records = this.#records.filter((candidate) => candidate.id !== id);
      const wasActive = this.#settings.activeImageId === id;
      const selectedImageIds = this.#settings.selectedImageIds.filter((candidate) => candidate !== id);
      const activeImageId = this.#settings.activeImageId === id ? selectedImageIds[0] ?? null : this.#settings.activeImageId;
      this.#settings = normalizeParticleSettings({ ...this.#settings, selectedImageIds, activeImageId });
      writeParticleBackgroundSettings(this.#settings);
      this.#preparationCache?.invalidate(id);
      const thumbnailUrl = this.#thumbnailUrls.get(id);
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
      this.#thumbnailUrls.delete(id);
      if (this.#enabled && wasActive && this.#settings.activeImageId) {
        await this.#activateImage(this.#settings.activeImageId, true);
      } else if (this.#enabled && wasActive) {
        this.#clearActiveImage();
      } else {
        this.#scheduleRotation();
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The image could not be deleted";
    } finally {
      this.#pending = false;
      this.#notify();
    }
  }

  thumbnailUrl(record: ParticleImageRecord): string {
    const existing = this.#thumbnailUrls.get(record.id);
    if (existing) return existing;
    const url = URL.createObjectURL(record.thumbnail);
    this.#thumbnailUrls.set(record.id, url);
    return url;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#teardownPresentation();
    this.#database?.close();
    this.#database = null;
    for (const url of this.#thumbnailUrls.values()) URL.revokeObjectURL(url);
    this.#thumbnailUrls.clear();
    this.#listeners.clear();
    window.removeEventListener("pagehide", this.#onPageHide);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
    this.#reducedMotion.removeEventListener("change", this.#onReducedMotionChange);
  }

  async #initialize(): Promise<void> {
    try {
      this.#database = await openParticleImageDatabase(() => {
        this.#database = null;
        this.#error = "The image library changed in another Code-Codex window. Reopen the plugin to reconnect.";
        this.#notify();
      });
      this.#records = (await readParticleImageRecords(this.#database))
        .filter((record) => PARTICLE_BACKGROUND_IMAGE_TYPES.has(record.type) && record.size <= PARTICLE_BACKGROUND_MAX_IMAGE_BYTES)
        .sort((first, second) => first.createdAt - second.createdAt)
        .slice(0, PARTICLE_BACKGROUND_MAX_IMAGES);
      void navigator.storage?.persist?.().catch(() => false);
    } catch (error) {
      this.#database = null;
      this.#error = "The image library is available for this session only.";
      console.warn("Code-Codex particle image storage is unavailable", error);
    }
    const available = new Set(this.#records.map((record) => record.id));
    const selectedImageIds = this.#settings.selectedImageIds.filter((id) => available.has(id));
    const activeImageId = this.#settings.activeImageId && available.has(this.#settings.activeImageId)
      ? this.#settings.activeImageId
      : selectedImageIds[0] ?? null;
    this.#settings = normalizeParticleSettings({ ...this.#settings, selectedImageIds, activeImageId });
    writeParticleBackgroundSettings(this.#settings);
    this.#notify();
  }

  async #activateImage(id: string, restartRotation: boolean): Promise<boolean> {
    if (!this.#enabled) return false;
    const record = this.#records.find((candidate) => candidate.id === id);
    if (!record) return false;
    this.#stopRotation();
    const generation = ++this.#generation;
    this.#pending = true;
    this.#notify();
    try {
      const cache = this.#preparationCache;
      if (!cache) return false;
      const prepared = await cache.prepare(record, this.#settings.particleCount);
      if (!this.#enabled || generation !== this.#generation) return false;
      const renderer = this.#renderer;
      const shouldMorph = Boolean(
        renderer
        && renderer.count === prepared.targetCount
        && renderer.count > 0
        && !this.#reducedMotion.matches,
      );
      const sourceReady = await this.#prepareSourceImage(prepared.processedBlob, shouldMorph, generation);
      if (!sourceReady || !this.#enabled || generation !== this.#generation) return false;
      const transitioned = renderer ? await renderer.setPreparedImage(prepared) : true;
      if (!transitioned || !this.#enabled || generation !== this.#generation) return false;
      this.#settings = normalizeParticleSettings({ ...this.#settings, activeImageId: id });
      writeParticleBackgroundSettings(this.#settings);
      this.#error = renderer ? undefined : this.#error;
      this.#prewarmNext(id);
      if (restartRotation) this.#scheduleRotation();
      else this.#scheduleRotation();
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.#error = error instanceof Error ? error.message : "The particle image could not be loaded";
      }
      return false;
    } finally {
      if (generation === this.#generation) {
        this.#pending = false;
        this.#notify();
      }
    }
  }

  async #prepareSourceImage(processedBlob: Blob, animate: boolean, generation: number): Promise<boolean> {
    const image = this.#image;
    const previousImage = this.#previousImage;
    if (!image || !previousImage) return false;
    const nextUrl = URL.createObjectURL(processedBlob);
    try {
      const decoder = new Image();
      decoder.src = nextUrl;
      await decoder.decode();
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      throw new Error("The processed particle image could not be decoded", { cause: error });
    }
    if (!this.#enabled || generation !== this.#generation) {
      URL.revokeObjectURL(nextUrl);
      return false;
    }

    const oldCurrentUrl = this.#currentSourceUrl;
    const oldPreviousUrl = this.#previousSourceUrl;
    const currentOpacity = Number.parseFloat(image.style.opacity);
    const previousOpacity = Number.parseFloat(previousImage.style.opacity);
    let outgoingUrl = oldCurrentUrl;
    let outgoingOpacity = Number.isFinite(currentOpacity)
      ? currentOpacity
      : this.#settings.showSourceImage ? this.#settings.imageOpacity : 0;
    if (
      this.#sourceTransitioning
      && oldPreviousUrl
      && Number.isFinite(previousOpacity)
      && previousOpacity > outgoingOpacity
    ) {
      outgoingUrl = oldPreviousUrl;
      outgoingOpacity = previousOpacity;
    }

    image.style.transition = "none";
    previousImage.style.transition = "none";
    image.style.opacity = "0";
    this.#currentSourceUrl = nextUrl;
    image.src = nextUrl;
    const visibleOpacity = this.#settings.showSourceImage ? this.#settings.imageOpacity : 0;
    if (animate && outgoingUrl) {
      this.#previousSourceUrl = outgoingUrl;
      previousImage.src = outgoingUrl;
      this.#sourceTransitionOutgoingScale = visibleOpacity > 0
        ? Math.min(1, Math.max(0, outgoingOpacity / visibleOpacity))
        : 1;
      this.#sourceTransitioning = true;
      this.#sourceTransitionProgress = 0;
      this.#updateSourceTransition(0, false);
    } else {
      this.#previousSourceUrl = undefined;
      previousImage.removeAttribute("src");
      previousImage.style.opacity = "0";
      image.style.opacity = String(visibleOpacity);
      this.#sourceTransitioning = false;
      this.#sourceTransitionProgress = 1;
      this.#sourceTransitionOutgoingScale = 1;
    }
    for (const staleUrl of new Set([oldCurrentUrl, oldPreviousUrl])) {
      if (staleUrl && staleUrl !== this.#previousSourceUrl) URL.revokeObjectURL(staleUrl);
    }
    return true;
  }

  #updateSourceTransition(progress: number, complete: boolean): void {
    const image = this.#image;
    const previousImage = this.#previousImage;
    if (!image || !previousImage) return;
    this.#sourceTransitionProgress = Math.min(1, Math.max(0, progress));
    const opacity = this.#settings.showSourceImage ? this.#settings.imageOpacity : 0;
    if (!this.#sourceTransitioning) {
      image.style.opacity = String(opacity);
      previousImage.style.opacity = "0";
      return;
    }
    const blend = smootherParticleTransition(this.#sourceTransitionProgress);
    const particleReveal = 1 - Math.sin(this.#sourceTransitionProgress * Math.PI) ** 2 * 0.58;
    previousImage.style.opacity = String(
      opacity * this.#sourceTransitionOutgoingScale * (1 - blend) * particleReveal,
    );
    image.style.opacity = String(opacity * blend * particleReveal);
    if (complete) this.#finishSourceTransition();
  }

  #finishSourceTransition(): void {
    const image = this.#image;
    const previousImage = this.#previousImage;
    if (this.#previousSourceUrl) URL.revokeObjectURL(this.#previousSourceUrl);
    this.#previousSourceUrl = undefined;
    previousImage?.removeAttribute("src");
    if (previousImage) previousImage.style.opacity = "0";
    if (image) {
      const opacity = this.#settings.showSourceImage ? this.#settings.imageOpacity : 0;
      image.style.opacity = String(opacity);
    }
    this.#sourceTransitioning = false;
    this.#sourceTransitionProgress = 1;
    this.#sourceTransitionOutgoingScale = 1;
  }

  #applySourcePresentation(): void {
    const layer = this.#layer;
    const image = this.#image;
    const previousImage = this.#previousImage;
    if (!layer || !image || !previousImage) return;
    layer.style.backgroundColor = this.#settings.backgroundColor;
    if (this.#sourceTransitioning) {
      this.#updateSourceTransition(this.#sourceTransitionProgress, false);
      return;
    }
    const opacity = this.#settings.showSourceImage ? this.#settings.imageOpacity : 0;
    image.style.opacity = String(opacity);
    previousImage.style.opacity = "0";
  }

  #clearActiveImage(): void {
    this.#generation += 1;
    this.#preparationCache?.invalidate();
    this.#renderer?.dispose();
    if (this.#canvas) {
      try {
        this.#renderer = new ParticleImageRenderer(this.#canvas, (message) => {
          this.#error = message;
          this.#notify();
        }, this.#settings, (progress, complete) => {
          this.#updateSourceTransition(progress, complete);
        });
      } catch {
        this.#renderer = undefined;
      }
    }
    if (this.#currentSourceUrl) URL.revokeObjectURL(this.#currentSourceUrl);
    if (this.#previousSourceUrl) URL.revokeObjectURL(this.#previousSourceUrl);
    this.#currentSourceUrl = undefined;
    this.#previousSourceUrl = undefined;
    this.#sourceTransitioning = false;
    this.#sourceTransitionProgress = 1;
    this.#sourceTransitionOutgoingScale = 1;
    this.#image?.removeAttribute("src");
    this.#previousImage?.removeAttribute("src");
  }

  #validActiveImageId(): string | null {
    const id = this.#settings.activeImageId;
    return id && this.#records.some((record) => record.id === id) ? id : null;
  }

  #nextSelectedImageId(afterId: string | null = this.#settings.activeImageId): string | null {
    const available = new Set(this.#records.map((record) => record.id));
    const selected = this.#settings.selectedImageIds.filter((id) => available.has(id));
    if (!selected.length) return null;
    const index = afterId ? selected.indexOf(afterId) : -1;
    return selected[(index + 1 + selected.length) % selected.length] ?? null;
  }

  #prewarmNext(afterId: string): void {
    const nextId = this.#nextSelectedImageId(afterId);
    if (!nextId || nextId === afterId) return;
    const record = this.#records.find((candidate) => candidate.id === nextId);
    if (record) this.#preparationCache?.prewarm(record, this.#settings.particleCount);
  }

  #scheduleRotation(): void {
    this.#stopRotation();
    if (
      !this.#enabled
      || !this.#settings.autoSwitch
      || document.hidden
      || this.#reducedMotion.matches
      || this.#settings.selectedImageIds.length < 2
    ) return;
    const nextId = this.#nextSelectedImageId();
    if (!nextId || nextId === this.#settings.activeImageId) return;
    const delay = this.#settings.imageDurationSeconds * 1_000;
    this.#rotationTimer = window.setTimeout(() => {
      this.#rotationTimer = 0;
      if (document.hidden || this.#reducedMotion.matches) return;
      void this.#activateImage(nextId, true);
    }, delay);
  }

  #stopRotation(): void {
    window.clearTimeout(this.#rotationTimer);
    this.#rotationTimer = 0;
  }

  #teardownPresentation(): void {
    this.#codexThemeObserver?.disconnect();
    this.#codexThemeObserver = undefined;
    this.#codexThemeMonitorGeneration += 1;
    window.clearTimeout(this.#codexThemePreferenceTimer);
    this.#codexThemePreferenceTimer = 0;
    this.#stopRotation();
    this.#preparationCache?.dispose();
    this.#preparationCache = undefined;
    this.#renderer?.dispose();
    this.#renderer = undefined;
    if (this.#currentSourceUrl) URL.revokeObjectURL(this.#currentSourceUrl);
    if (this.#previousSourceUrl) URL.revokeObjectURL(this.#previousSourceUrl);
    this.#currentSourceUrl = undefined;
    this.#previousSourceUrl = undefined;
    this.#sourceTransitioning = false;
    this.#sourceTransitionProgress = 1;
    this.#sourceTransitionOutgoingScale = 1;
    this.#layer?.remove();
    this.#layer = undefined;
    this.#previousImage = undefined;
    this.#image = undefined;
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    let current: CodexAppearanceTheme;
    try {
      current = await readCodexAppearanceTheme();
    } catch (error) {
      if (codexDarkThemeApplied()) return;
      throw new Error("Codex Appearance is unavailable. Restart Codex with Code-Codex, then try again.", { cause: error });
    }

    const lease = readParticleThemeLease();
    if (current === "dark") {
      if (!codexDarkThemeApplied()) await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
      return;
    }
    if (lease) {
      clearParticleThemeLease();
      this.#stoppedForExternalThemeChange = true;
      throw new Error("Particle Image Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
    }

    writeParticleThemeLease({ previousPreference: current, forcedPreference: "dark" });
    try {
      await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
    } catch (error) {
      try {
        await writeCodexAppearanceTheme(current);
        clearParticleThemeLease();
      } catch {
        // Retain the lease so a later disable/startup can retry restoration.
      }
      throw new Error("Codex could not switch to Dark automatically.", { cause: error });
    }
  }

  async #restoreCodexAppearanceTheme(): Promise<void> {
    const lease = readParticleThemeLease();
    if (!lease) return;
    const current = await readCodexAppearanceTheme();
    if (current !== lease.forcedPreference) {
      clearParticleThemeLease();
      return;
    }
    await writeCodexAppearanceTheme(lease.previousPreference);
    clearParticleThemeLease();
  }

  #observeCodexTheme(): void {
    this.#codexThemeObserver?.disconnect();
    this.#codexThemeObserver = new MutationObserver(() => {
      if (!this.#enabled || codexDarkThemeApplied()) return;
      this.#stopForExternalThemeChange();
    });
    this.#codexThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
  }

  #scheduleCodexThemePreferenceCheck(): void {
    window.clearTimeout(this.#codexThemePreferenceTimer);
    this.#codexThemePreferenceTimer = 0;
    if (!this.#enabled) return;
    const generation = this.#codexThemeMonitorGeneration;
    this.#codexThemePreferenceTimer = window.setTimeout(() => {
      this.#codexThemePreferenceTimer = 0;
      void this.#checkCodexThemePreference(generation);
    }, CODEX_APPEARANCE_POLL_INTERVAL_MS);
  }

  async #checkCodexThemePreference(generation: number): Promise<void> {
    if (!this.#enabled || generation !== this.#codexThemeMonitorGeneration) return;
    try {
      const preference = await readCodexAppearanceTheme();
      if (!this.#enabled || generation !== this.#codexThemeMonitorGeneration) return;
      if (preference !== "dark") {
        this.#stopForExternalThemeChange();
        return;
      }
    } catch {
      // A transient read failure must not tear down an active presentation.
    }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }

  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Particle Image Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease();
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  #onVisibilityChange = (): void => {
    if (document.hidden) this.#stopRotation();
    else {
      const activeId = this.#validActiveImageId();
      if (activeId) this.#prewarmNext(activeId);
      this.#scheduleRotation();
    }
  };

  #onReducedMotionChange = (): void => {
    if (this.#reducedMotion.matches) this.#stopRotation();
    else this.#scheduleRotation();
  };

  #onPageHide = (): void => {
    this.dispose();
  };
}

const PARTICLE_BACKGROUND_CONTROLLER = Symbol.for("code-codex:particle-image-background-controller:v1");

function getParticleBackgroundController(): ParticleBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[PARTICLE_BACKGROUND_CONTROLLER];
  if (existing instanceof ParticleBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try {
      existing.dispose();
    } catch {
      // Replace a stale controller from an earlier injected bundle.
    }
  }
  const controller = new ParticleBackgroundController();
  globalState[PARTICLE_BACKGROUND_CONTROLLER] = controller;
  return controller;
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

function particleNumericControlsMarkup(group: ParticleControlGroup): string {
  return PARTICLE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_PARTICLE_BACKGROUND_SETTINGS[definition.key];
      return `
        <label class="particle-control-row" for="${definition.id}">
          <span>${definition.label}</span>
          <input id="${definition.id}" data-particle-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
          <output for="${definition.id}">${definition.format(value)}</output>
        </label>
      `;
    })
    .join("");
}

function particleBackgroundCardMarkup(): string {
  return `
    <article class="preview-extension appearance-extension particle-background-extension" data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Particle Image Background</h4>
          <span class="preview-extension-status" id="cle-particle-background-status">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="cle-particle-background-status" aria-pressed="false">Enable</button>
        <button class="particle-settings-trigger" type="button" title="Configure Particle Image Background" aria-label="Configure Particle Image Background" aria-haspopup="dialog" aria-controls="cle-particle-settings" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}

function particleSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel" id="cle-particle-settings" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-particle-settings-title">
      <header class="particle-settings-header">
        <div>
          <p>Appearance</p>
          <h3 id="cle-particle-settings-title">Particle settings</h3>
        </div>
        <button class="particle-settings-close" type="button" title="Close particle settings" aria-label="Close particle settings">${icons.close}</button>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>Particles</legend>
          ${particleNumericControlsMarkup("particles")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>Flow</legend>
          ${particleNumericControlsMarkup("flow")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>Source</legend>
        <details class="particle-source-details">
          <summary class="particle-source-summary">
            <span>Image library</span>
            <span class="particle-source-count">0 saved</span>
          </summary>
          <div class="particle-library-toolbar">
            <label class="particle-library-add">
              <span>Add images</span>
              <input class="particle-library-upload" type="file" accept="${PARTICLE_BACKGROUND_ACCEPT}" multiple>
            </label>
            <button class="particle-library-clear" type="button" disabled>Clear order</button>
          </div>
          <div class="particle-library-grid">
            <p class="particle-library-empty">Add images, then select them in playback order.</p>
          </div>
          <label class="particle-toggle-row" for="cle-particle-auto-switch">
            <span>Auto switch</span>
            <input id="cle-particle-auto-switch" type="checkbox" checked>
          </label>
        </details>
          ${particleNumericControlsMarkup("source")}
          <label class="particle-toggle-row" for="cle-particle-show-source">
            <span>Show source image</span>
            <input id="cle-particle-show-source" type="checkbox" checked>
          </label>
          <label class="particle-color-row" for="cle-particle-background-color">
            <span>Background</span>
            <input id="cle-particle-background-color" type="color" value="#000000">
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>Pointer</legend>
          ${particleNumericControlsMarkup("pointer")}
          <label class="particle-toggle-row" for="cle-particle-cursor-interaction">
            <span>Cursor interaction</span>
            <input id="cle-particle-cursor-interaction" type="checkbox" checked>
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>Render</legend>
          ${particleNumericControlsMarkup("render")}
        </fieldset>
        <p class="particle-plugin-error" role="status" hidden></p>
      </div>
    </section>
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
  #externalDragActive = false;
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
  #appearanceTransitionPending = false;
  #appearancePluginApplied: boolean | undefined;
  #appearancePluginError: string | undefined;
  #appearanceSyncQueued = false;
  #appearanceHealthPending = false;
  #appearanceHealthTimer: ReturnType<typeof setTimeout> | undefined;
  #appearanceOperation = 0;
  #appearanceRpcTail: Promise<void> = Promise.resolve();
  #previewMarketOpen = false;
  #particleSettingsOpen = false;
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
  readonly #previewMarketList: HTMLElement;
  readonly #previewMarketCloseButton: HTMLButtonElement;
  readonly #previewerButtons = new Map<string, HTMLButtonElement>();
  readonly #previewerStatuses = new Map<string, HTMLElement>();
  readonly #transparentBackgroundCard: HTMLElement;
  readonly #transparentBackgroundButton: HTMLButtonElement;
  readonly #transparentBackgroundStatus: HTMLElement;
  readonly #particleBackgroundController = getParticleBackgroundController();
  #particleBackgroundUnsubscribe: (() => void) | undefined;
  #particleBackgroundInitialization: Promise<void> | undefined;
  readonly #particleBackgroundCard: HTMLElement;
  readonly #particleBackgroundButton: HTMLButtonElement;
  readonly #particleBackgroundStatus: HTMLElement;
  readonly #particleSettingsPanel: HTMLElement;
  readonly #particleSettingsTrigger: HTMLButtonElement;
  readonly #particleSettingsCloseButton: HTMLButtonElement;
  readonly #particleNumericControls = new Map<ParticleNumericSettingKey, Readonly<{
    definition: ParticleNumericControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }>>();
  readonly #particleSourceDetails: HTMLDetailsElement;
  readonly #particleSourceCount: HTMLElement;
  readonly #particleLibraryUpload: HTMLInputElement;
  readonly #particleLibraryClear: HTMLButtonElement;
  readonly #particleLibraryGrid: HTMLElement;
  readonly #particleAutoSwitchInput: HTMLInputElement;
  readonly #particleShowSourceInput: HTMLInputElement;
  readonly #particleBackgroundColorInput: HTMLInputElement;
  readonly #particleCursorInteractionInput: HTMLInputElement;
  readonly #particlePluginError: HTMLElement;
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
                <div class="preview-market-section-list">${transparentBackgroundCardMarkup()}${particleBackgroundCardMarkup()}</div>
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
      ${particleSettingsPanelMarkup()}
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
    this.#previewMarketList = this.#required<HTMLElement>(".preview-market-list");
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
    this.#particleBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"]`);
    this.#particleBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#particleBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#particleSettingsPanel = this.#required<HTMLElement>(".particle-settings-panel");
    this.#particleSettingsTrigger = this.#required<HTMLButtonElement>(".particle-settings-trigger");
    this.#particleSettingsCloseButton = this.#required<HTMLButtonElement>(".particle-settings-close");
    for (const definition of PARTICLE_NUMERIC_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      this.#particleNumericControls.set(definition.key, { definition, input, output });
    }
    this.#particleSourceDetails = this.#required<HTMLDetailsElement>(".particle-source-details");
    this.#particleSourceCount = this.#required<HTMLElement>(".particle-source-count");
    this.#particleLibraryUpload = this.#required<HTMLInputElement>(".particle-library-upload");
    this.#particleLibraryClear = this.#required<HTMLButtonElement>(".particle-library-clear");
    this.#particleLibraryGrid = this.#required<HTMLElement>(".particle-library-grid");
    this.#particleAutoSwitchInput = this.#required<HTMLInputElement>("#cle-particle-auto-switch");
    this.#particleShowSourceInput = this.#required<HTMLInputElement>("#cle-particle-show-source");
    this.#particleBackgroundColorInput = this.#required<HTMLInputElement>("#cle-particle-background-color");
    this.#particleCursorInteractionInput = this.#required<HTMLInputElement>("#cle-particle-cursor-interaction");
    this.#particlePluginError = this.#required<HTMLElement>(".particle-plugin-error");
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
    if (
      this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
      && this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
    ) {
      this.#writeEnabledAppearancePlugins();
    }
    this.#particleBackgroundUnsubscribe?.();
    this.#particleBackgroundUnsubscribe = this.#particleBackgroundController.subscribe(() => {
      if (!this.#connected) return;
      if (
        this.#particleBackgroundController.stoppedForExternalThemeChange
        && this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
      ) {
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderParticleBackgroundPlugin();
    });
    this.#particleBackgroundInitialization = this.#initializeParticleBackground();
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
    this.#particleBackgroundUnsubscribe?.();
    this.#particleBackgroundUnsubscribe = undefined;
    this.#particleBackgroundInitialization = undefined;
    this.#appearancePluginPending = false;
    this.#appearanceTransitionPending = false;
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
    if (this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)) {
      this.#writeEnabledAppearancePlugins();
    }
    await this.#particleBackgroundController.disable();
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
    this.#appearanceTransitionPending = false;
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
      this.#particleBackgroundButton.addEventListener("click", () => void this.#toggleParticleBackground());
      this.#particleSettingsTrigger.addEventListener("click", () => this.#toggleParticleSettings());
      this.#particleSettingsCloseButton.addEventListener("click", () => this.#closeParticleSettings(true));
      this.#particleSettingsPanel.addEventListener("toggle", () => {
        if (this.#particleSettingsPanel.matches(":popover-open") || !this.#particleSettingsOpen) return;
        this.#particleSettingsOpen = false;
        this.#particleSettingsTrigger.setAttribute("aria-expanded", "false");
      });
      this.#previewMarketList.addEventListener("scroll", () => {
        if (this.#particleSettingsOpen) this.#positionParticleSettingsPanel();
      }, { passive: true });
      for (const { definition, input, output } of this.#particleNumericControls.values()) {
        input.addEventListener("input", () => {
          const normalized = normalizeParticleSettings({
            ...this.#particleBackgroundController.settings,
            [definition.key]: input.value,
          })[definition.key];
          output.value = definition.format(normalized);
          if (definition.live) void this.#applyParticleSettingsFromControls();
        });
        if (!definition.live) {
          input.addEventListener("change", () => void this.#applyParticleSettingsFromControls());
        }
      }
      this.#particleAutoSwitchInput.addEventListener("change", () => void this.#applyParticleSettingsFromControls());
      this.#particleShowSourceInput.addEventListener("change", () => void this.#applyParticleSettingsFromControls());
      this.#particleBackgroundColorInput.addEventListener("input", () => void this.#applyParticleSettingsFromControls());
      this.#particleCursorInteractionInput.addEventListener("change", () => void this.#applyParticleSettingsFromControls());
      this.#particleLibraryUpload.addEventListener("change", () => {
        const files = Array.from(this.#particleLibraryUpload.files ?? []);
        this.#particleLibraryUpload.value = "";
        if (files.length) void this.#particleBackgroundController.addImages(files);
      });
      this.#particleLibraryClear.addEventListener("click", () => this.#particleBackgroundController.clearOrder());
      this.#particleLibraryGrid.addEventListener("click", (event) => void this.#onParticleLibraryClick(event));
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
      this.#statePanel.addEventListener("dragover", (event) => this.#onDropZoneDragOver(event, true));
      this.#statePanel.addEventListener("dragleave", (event) => this.#onDropZoneDragLeave(event));
      this.#statePanel.addEventListener("drop", (event) => this.#onDropZoneDrop(event, true));
      this.addEventListener("dragover", (event) => this.#onUnhandledExternalDragOver(event));
      this.addEventListener("drop", (event) => this.#onUnhandledExternalDrop(event));
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
    const classDark = sources.some((source) => source.classList.contains("electron-dark") || /(^|\s)dark(\s|$)/i.test(source.className));
    const classLight = sources.some((source) => source.classList.contains("electron-light") || /(^|\s)light(\s|$)/i.test(source.className));
    if (explicit) this.dataset.theme = explicit;
    else if (classDark) this.dataset.theme = "dark";
    else if (classLight) this.dataset.theme = "light";
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
    if (
      this.#particleSettingsOpen
      && !path.includes(this.#particleSettingsPanel)
      && !path.includes(this.#particleSettingsTrigger)
    ) {
      this.#closeParticleSettings(false);
    }
    if (
      !this.#previewMarketPopover.hidden
      && !path.includes(this.#previewMarketPopover)
      && !path.includes(this.#previewMarketButton)
      && !path.includes(this.#particleSettingsPanel)
    ) {
      this.#closePreviewMarket(false);
    }
  };

  #onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.#particleSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeParticleSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) return;
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
    if (source) {
      const destination = this.#dropDestination(event, allowRoot);
      if (destination === undefined || !this.#canDrop(source, destination)) {
        this.#setDropTarget(undefined);
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.#setDropTarget(destination);
      return;
    }

    if (!isExternalFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    this.#externalDragActive = true;
    const destination = this.#dropDestination(event, allowRoot);
    if (destination === undefined || !this.#canAcceptExternalDrop()) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      this.#setDropTarget(undefined);
      return;
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    this.#setDropTarget(destination);
  }

  #onDropZoneDragLeave(event: DragEvent): void {
    if (isExternalFileDrag(event.dataTransfer)) event.stopPropagation();
    const zone = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (zone && related && zone.contains(related)) return;
    this.#setDropTarget(undefined);
  }

  #onDropZoneDrop(event: DragEvent, allowRoot: boolean): void {
    const source = this.#dragSource;
    if (source) {
      const destination = this.#dropDestination(event, allowRoot);
      if (destination === undefined || !this.#canDrop(source, destination)) {
        this.#clearDragState();
        return;
      }
      event.preventDefault();
      this.#clearDragState();
      void this.#moveEntryByDrop(source, destination);
      return;
    }

    if (!isExternalFileDrag(event.dataTransfer)) {
      this.#clearDragState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const destination = this.#dropDestination(event, allowRoot);
    const candidates = captureExternalDropCandidates(event.dataTransfer);
    const canImport = destination !== undefined && this.#canAcceptExternalDrop();
    this.#clearDragState();
    if (!canImport || destination === undefined) {
      this.#showActionNotice("Drop files or folders onto a folder or an empty area of the file tree.", "error");
      return;
    }
    if (!candidates.length) {
      this.#showActionNotice("Windows did not provide any readable files or folders for this drop.", "error");
      return;
    }
    void this.#importExternalDrop(candidates, destination);
  }

  #onUnhandledExternalDragOver(event: DragEvent): void {
    if (!isExternalFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    this.#setDropTarget(undefined);
  }

  #onUnhandledExternalDrop(event: DragEvent): void {
    if (!isExternalFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    this.#clearDragState();
    this.#showActionNotice("Drop files or folders onto a folder or an empty area of the file tree.", "error");
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

  #canAcceptExternalDrop(): boolean {
    return !this.#contextActionPending &&
      (this.#state === "ready" || this.#state === "empty") &&
      Boolean(this.#context) &&
      this.#bridge?.available === true;
  }

  #setDropTarget(path: string | undefined): void {
    if (this.#dropTargetPath === path) return;
    if (this.#dropExpandTimer) clearTimeout(this.#dropExpandTimer);
    this.#dropExpandTimer = undefined;
    this.#dropTargetPath = path;
    this.#treeShell.dataset.dropTarget = String(path === "");
    this.#masthead.dataset.dropTarget = String(path === "");
    this.#statePanel.dataset.dropTarget = String(path === "");
    for (const row of this.#treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
      row.dataset.dropTarget = String(path !== undefined && path !== "" && row.dataset.path === path);
    }
    if (!path) return;
    if (!this.#canExpandDropTarget(path) || this.#model.isExpanded(path)) return;
    this.#dropExpandTimer = setTimeout(() => {
      this.#dropExpandTimer = undefined;
      if (this.#dropTargetPath !== path || !this.#canExpandDropTarget(path)) return;
      const row = this.#rows.find((candidate) => candidate.kind === "node" && candidate.path === path);
      if (row?.node?.kind === "directory") this.#toggleDirectory(row, true);
    }, DROP_EXPAND_DELAY_MS);
  }

  #canExpandDropTarget(path: string): boolean {
    const source = this.#dragSource;
    if (source) return this.#canDrop(source, path);
    return this.#externalDragActive && this.#canAcceptExternalDrop();
  }

  #clearDragState(): void {
    if (this.#dropExpandTimer) clearTimeout(this.#dropExpandTimer);
    this.#dropExpandTimer = undefined;
    this.#dragSource = undefined;
    this.#externalDragActive = false;
    this.#setDropTarget(undefined);
    for (const row of this.#treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
      row.dataset.dragSource = "false";
    }
  }

  async #importExternalDrop(candidates: readonly ExternalDropCandidate[], destinationParentPath: string): Promise<void> {
    if (this.#contextActionPending) return;
    const bridge = this.#bridge;
    const context = this.#context;
    if (!bridge?.available || !context || (this.#state !== "ready" && this.#state !== "empty")) return;

    const generation = this.#generation;
    let committedCount = 0;
    this.#contextActionPending = true;
    this.#closeContextMenu(false);
    this.#cancelMarquee();
    this.dataset.busy = "true";
    this.#treeShell.setAttribute("aria-busy", "true");
    this.#statePanel.setAttribute("aria-busy", "true");
    this.#showActionProgress("Preparing dropped files and folders…");

    let nextRequestAt = 0;
    const request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      this.#assertExternalImportCurrent(bridge, context, generation);
      const delay = Math.max(0, nextRequestAt - performance.now());
      if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
      this.#assertExternalImportCurrent(bridge, context, generation);
      nextRequestAt = performance.now() + EXTERNAL_IMPORT_REQUEST_INTERVAL_MS;
      return bridge.request<unknown>(
        method,
        params,
        method === "explorer.entry.import.commit" ? EXTERNAL_IMPORT_COMMIT_TIMEOUT_MS : undefined,
      );
    };

    try {
      const roots = await resolveExternalDropRoots(candidates, () => {
        this.#assertExternalImportCurrent(bridge, context, generation);
      });
      this.#assertExternalImportCurrent(bridge, context, generation);
      ensureDistinctExternalRootNames(roots);
      this.#showActionProgress("Checking the destination folder…");
      await this.#preflightExternalRoots(roots, destinationParentPath, request);

      const progress: ExternalImportProgress = {
        totalEntries: roots.reduce((total, root) => total + root.entryCount, 0),
        totalBytes: roots.reduce((total, root) => total + root.sizeBytes, 0),
        completedEntries: 0,
        completedBytes: 0,
        lastNoticeAt: 0,
      };
      this.#updateExternalImportProgress(progress, roots[0]?.name ?? "dropped items", true);

      const imported: TreeNodeInput[] = [];
      for (const root of roots) {
        const entry = await this.#importExternalRoot(root, destinationParentPath, request, bridge, progress);
        imported.push(entry);
        committedCount += 1;
      }

      this.#assertExternalImportCurrent(bridge, context, generation);
      if (destinationParentPath) this.#model.setExpanded(destinationParentPath, true);
      await this.#loadDirectory(destinationParentPath, false, true);
      this.#assertExternalImportCurrent(bridge, context, generation);
      const firstPath = imported[0]?.relativePath;
      if (firstPath) {
        const importedIndex = this.#rows.findIndex((row) => row.kind === "node" && row.path === firstPath);
        if (importedIndex >= 0) this.#focusIndex(importedIndex, false);
      }
      this.#showActionNotice(
        `${imported.length.toLocaleString()} dropped ${imported.length === 1 ? "item" : "items"} copied.`,
      );
    } catch (error) {
      if (this.#canApplyExternalImportResult(bridge, context, generation)) {
        if (committedCount > 0) await this.#loadDirectory(destinationParentPath, false, true);
        this.#showActionNotice(externalImportError(error, committedCount), "error");
      }
    } finally {
      this.#contextActionPending = false;
      const currentState = this.#state as ExplorerViewState;
      const stateBusy = currentState === "loading" || currentState === "booting";
      this.dataset.busy = String(stateBusy);
      this.#treeShell.setAttribute("aria-busy", String(stateBusy));
      this.#statePanel.setAttribute("aria-busy", String(stateBusy));
    }
  }

  async #preflightExternalRoots(
    roots: readonly ExternalDropRoot[],
    destinationParentPath: string,
    request: (method: string, params: Record<string, unknown>) => Promise<unknown>,
  ): Promise<void> {
    for (const root of roots) {
      let sessionId: string | undefined;
      try {
        sessionId = normalizeExternalImportBegin(
          await request(
            "explorer.entry.import.begin",
            externalImportBeginParams(root, destinationParentPath),
          ),
        ).sessionId;
      } finally {
        if (sessionId) {
          validateExternalImportFlag(
            await request("explorer.entry.import.abort", { sessionId }),
            "aborted",
          );
        }
      }
    }
  }

  async #importExternalRoot(
    root: ExternalDropRoot,
    destinationParentPath: string,
    request: (method: string, params: Record<string, unknown>) => Promise<unknown>,
    bridge: ExplorerBridge,
    progress: ExternalImportProgress,
  ): Promise<TreeNodeInput> {
    const begin = normalizeExternalImportBegin(
      await request("explorer.entry.import.begin", externalImportBeginParams(root, destinationParentPath)),
    );
    const sessionId = begin.sessionId;
    let committed = false;

    try {
      if (root.kind === "file") {
        const file = root.file;
        if (!file) throw invalidExternalImportResponse("The dropped file was unavailable.");
        await this.#uploadExternalFile(sessionId, file, request, progress, root.name);
        validateExternalImportFlag(
          await request("explorer.entry.import.file.finish", { sessionId }),
          "finished",
        );
        progress.completedEntries += 1;
        this.#updateExternalImportProgress(progress, root.name, true);
      } else {
        progress.completedEntries += 1;
        this.#updateExternalImportProgress(progress, root.name, true);
        for (const member of root.members) {
          if (member.kind === "directory") {
            validateExternalImportFlag(
              await request("explorer.entry.import.directory", {
                sessionId,
                relativePath: member.relativePath,
              }),
              "created",
            );
            progress.completedEntries += 1;
            this.#updateExternalImportProgress(progress, member.relativePath, true);
            continue;
          }

          const file = member.file;
          if (!file) throw invalidExternalImportResponse("A dropped file was unavailable.");
          validateExternalImportFlag(
            await request("explorer.entry.import.file.begin", {
              sessionId,
              relativePath: member.relativePath,
              sizeBytes: file.size,
            }),
            "ready",
          );
          await this.#uploadExternalFile(sessionId, file, request, progress, member.relativePath);
          validateExternalImportFlag(
            await request("explorer.entry.import.file.finish", { sessionId }),
            "finished",
          );
          progress.completedEntries += 1;
          this.#updateExternalImportProgress(progress, member.relativePath, true);
        }
      }

      const rawCommit = await request("explorer.entry.import.commit", { sessionId });
      committed = true;
      return normalizeExternalImportCommit(rawCommit, destinationParentPath, root);
    } finally {
      if (!committed) {
        await bridge.request("explorer.entry.import.abort", { sessionId }).catch(() => undefined);
      }
    }
  }

  async #uploadExternalFile(
    sessionId: string,
    file: File,
    request: (method: string, params: Record<string, unknown>) => Promise<unknown>,
    progress: ExternalImportProgress,
    displayPath: string,
  ): Promise<void> {
    let offset = 0;
    while (offset < file.size) {
      const expectedLength = Math.min(EXTERNAL_IMPORT_CHUNK_BYTES, file.size - offset);
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.slice(offset, offset + expectedLength).arrayBuffer());
      } catch (error) {
        throw normalizeExternalDropReadError(error);
      }
      if (bytes.byteLength !== expectedLength) {
        throw new ExplorerBridgeError({ code: "NOT_FOUND", message: "A dropped file changed while it was being copied." });
      }
      const nextOffset = offset + bytes.byteLength;
      validateExternalImportChunk(
        await request("explorer.entry.import.chunk", {
          sessionId,
          offset,
          dataBase64: encodeBase64(bytes),
        }),
        nextOffset,
      );
      offset = nextOffset;
      progress.completedBytes += bytes.byteLength;
      this.#updateExternalImportProgress(progress, displayPath, offset === file.size);
    }
  }

  #updateExternalImportProgress(
    progress: ExternalImportProgress,
    displayPath: string,
    force: boolean,
  ): void {
    const now = performance.now();
    if (!force && now - progress.lastNoticeAt < 250) return;
    progress.lastNoticeAt = now;
    const byteRatio = progress.totalBytes > 0 ? progress.completedBytes / progress.totalBytes : 0;
    const entryRatio = progress.totalEntries > 0 ? progress.completedEntries / progress.totalEntries : 0;
    const percent = Math.min(100, Math.max(0, Math.floor(Math.max(byteRatio, entryRatio) * 100)));
    const leaf = displayPath.split("/").at(-1) || displayPath;
    this.#showActionProgress(
      `Copying dropped items… ${percent}% · ${progress.completedEntries.toLocaleString()}/${progress.totalEntries.toLocaleString()} · ${leaf}`,
    );
  }

  #assertExternalImportCurrent(
    bridge: ExplorerBridge,
    context: ExplorerContext,
    generation: number,
  ): void {
    if (!this.#canApplyExternalImportResult(bridge, context, generation)) {
      throw new ExplorerBridgeError({ code: "CANCELLED", message: "The active workspace changed during the import." });
    }
  }

  #canApplyExternalImportResult(
    bridge: ExplorerBridge,
    context: ExplorerContext,
    generation: number,
  ): boolean {
    return this.#connected &&
      !this.#dismissed &&
      this.#generation === generation &&
      this.#bridge === bridge &&
      this.#context === context &&
      bridge.available;
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
        return {
          kind: info.kind,
          mimeType: info.mimeType,
          sizeBytes: info.sizeBytes,
          bytes,
          ...(info.previewNotice === undefined ? {} : { previewNotice: info.previewNotice }),
        };
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
        ...(preview.previewNotice === undefined ? {} : { previewNotice: preview.previewNotice }),
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

  async #initializeParticleBackground(): Promise<void> {
    try {
      await this.#particleBackgroundController.initialize();
      if (!this.#connected) return;
      const enabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        if (this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)) {
          this.#writeEnabledAppearancePlugins();
        }
        this.#clearTransparentBackgroundPresentation();
        await this.#particleBackgroundController.enable();
      } else {
        await this.#particleBackgroundController.disable();
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Particle Image Background", error);
    } finally {
      if (this.#connected) this.#renderPreviewMarket();
    }
  }

  async #toggleParticleBackground(): Promise<void> {
    if (
      this.#particleBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    const bridge = this.#bridge;
    const transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
    const previousTransparentBackground = this.#transparentBackgroundPresentation();
    const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
    let particleStarted = false;
    try {
      this.#particleBackgroundInitialization ??= this.#initializeParticleBackground();
      await this.#particleBackgroundInitialization;
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      const enabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
      const nextEnabled = !enabled;
      if (nextEnabled) {
        if ((transparentWasEnabled || transparentPresentationWasApplied) && bridge?.available) {
          await this.#setWindowTransparency(bridge, false);
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
        }
        this.#clearTransparentBackgroundPresentation();
        await this.#particleBackgroundController.enable();
        particleStarted = true;
        if (!this.#connected || operation !== this.#appearanceOperation) {
          await this.#particleBackgroundController.disable();
          return;
        }
        if (transparentWasEnabled) {
          this.#appearancePluginApplied = false;
          this.#appearancePluginError = undefined;
          this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        }
        this.#enabledAppearancePlugins.add(PARTICLE_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#particleBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Particle Image Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (particleStarted) await this.#particleBackgroundController.disable();
      if (transparentWasEnabled && previousTransparentBackground) {
        this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
      }
      const message = error instanceof Error ? error.message : "Particle Image Background could not be changed";
      this.#showActionNotice(message, "error");
    } finally {
      if (operation === this.#appearanceOperation) {
        this.#appearanceTransitionPending = false;
        this.#renderPreviewMarket();
        if (bridge?.available) this.#flushQueuedAppearanceSync(bridge);
        if (this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)) {
          this.#scheduleAppearanceHealthCheck();
        }
      }
    }
  }

  async #applyParticleSettingsFromControls(): Promise<void> {
    const current = this.#particleBackgroundController.settings;
    const values: Record<string, unknown> = { ...current };
    for (const [key, { input }] of this.#particleNumericControls) values[key] = input.value;
    values.autoSwitch = this.#particleAutoSwitchInput.checked;
    values.showSourceImage = this.#particleShowSourceInput.checked;
    values.backgroundColor = this.#particleBackgroundColorInput.value;
    values.cursorInteraction = this.#particleCursorInteractionInput.checked;
    await this.#particleBackgroundController.updateSettings(normalizeParticleSettings(values));
  }

  async #onParticleLibraryClick(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button[data-particle-image-id]");
    if (!button || !this.#particleLibraryGrid.contains(button)) return;
    const id = button.dataset.particleImageId;
    if (!id) return;
    if (button.dataset.particleAction === "delete") await this.#particleBackgroundController.deleteImage(id);
    else await this.#particleBackgroundController.toggleImageSelection(id);
  }

  #renderParticleBackgroundPlugin(): void {
    const controller = this.#particleBackgroundController;
    const enabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
    const active = enabled && controller.enabled;
    let status = enabled ? "Enabled" : "Disabled";
    if (controller.pending) status = enabled || controller.enabled ? "Enabled · Applying" : "Applying";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (active && controller.error) status = "Enabled · Notice";
    this.#particleBackgroundStatus.textContent = status;
    this.#particleBackgroundStatus.dataset.enabled = String(active);
    this.#particleBackgroundStatus.dataset.pending = String(controller.pending);
    this.#particleBackgroundCard.setAttribute("aria-busy", String(controller.pending));
    this.#particleBackgroundButton.textContent = controller.pending ? "Applying…" : enabled ? "Disable" : "Enable";
    this.#particleBackgroundButton.dataset.enabled = String(enabled);
    this.#particleBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#particleBackgroundButton.setAttribute(
      "aria-label",
      controller.pending
        ? "Applying Particle Image Background"
        : `${enabled ? "Disable" : "Enable"} Particle Image Background`,
    );
    this.#particleBackgroundButton.disabled = controller.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;

    const settings = controller.settings;
    for (const [key, { definition, input, output }] of this.#particleNumericControls) {
      const value = settings[key];
      input.value = String(value);
      input.disabled = controller.pending;
      output.value = definition.format(value);
    }
    this.#particleAutoSwitchInput.checked = settings.autoSwitch;
    this.#particleShowSourceInput.checked = settings.showSourceImage;
    this.#particleBackgroundColorInput.value = settings.backgroundColor;
    this.#particleCursorInteractionInput.checked = settings.cursorInteraction;

    const records = controller.records;
    const selectedIds = new Set(settings.selectedImageIds);
    this.#particleSourceCount.textContent = records.length
      ? `${records.length} saved · ${selectedIds.size} selected`
      : "0 saved";
    this.#particleLibraryClear.disabled = controller.pending || selectedIds.size === 0;
    this.#particleLibraryUpload.disabled = controller.pending;
    this.#particleAutoSwitchInput.disabled = controller.pending || selectedIds.size < 2;
    this.#particleShowSourceInput.disabled = controller.pending;
    this.#particleBackgroundColorInput.disabled = controller.pending;
    this.#particleCursorInteractionInput.disabled = controller.pending;

    const fragment = document.createDocumentFragment();
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "particle-library-empty";
      empty.textContent = "Add images, then select them in playback order.";
      fragment.append(empty);
    }
    for (const record of records) {
      const orderIndex = settings.selectedImageIds.indexOf(record.id);
      const item = document.createElement("article");
      item.className = "particle-library-item";
      if (orderIndex >= 0) item.classList.add("is-selected");
      if (record.id === settings.activeImageId) item.classList.add("is-active");

      const selectButton = document.createElement("button");
      selectButton.className = "particle-library-select";
      selectButton.type = "button";
      selectButton.dataset.particleImageId = record.id;
      selectButton.dataset.particleAction = "select";
      selectButton.setAttribute("aria-pressed", String(orderIndex >= 0));
      selectButton.setAttribute("aria-label", orderIndex >= 0
        ? `Remove ${record.name} from the switching order`
        : `Add ${record.name} to the switching order`);
      selectButton.title = record.name;
      const thumbnail = document.createElement("img");
      thumbnail.className = "particle-library-thumb";
      thumbnail.src = controller.thumbnailUrl(record);
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      const name = document.createElement("span");
      name.className = "particle-library-name";
      name.textContent = record.name;
      selectButton.append(thumbnail, name);
      item.append(selectButton);

      if (orderIndex >= 0) {
        const order = document.createElement("span");
        order.className = "particle-library-order";
        order.textContent = String(orderIndex + 1);
        order.setAttribute("aria-hidden", "true");
        item.append(order);
      }
      if (record.id === settings.activeImageId) {
        const live = document.createElement("span");
        live.className = "particle-library-live";
        live.textContent = "LIVE";
        live.setAttribute("aria-hidden", "true");
        item.append(live);
      }
      const deleteButton = document.createElement("button");
      deleteButton.className = "particle-library-delete";
      deleteButton.type = "button";
      deleteButton.dataset.particleImageId = record.id;
      deleteButton.dataset.particleAction = "delete";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", `Delete ${record.name} from the image library`);
      deleteButton.title = "Delete image";
      item.append(deleteButton);
      fragment.append(item);
    }
    this.#particleLibraryGrid.replaceChildren(fragment);
    const error = controller.error;
    this.#particlePluginError.hidden = !error;
    this.#particlePluginError.textContent = error ?? "";
    if (this.#particleSettingsOpen) requestAnimationFrame(() => this.#positionParticleSettingsPanel());
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
      this.#appearanceTransitionPending ||
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
      this.#appearanceTransitionPending ||
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
    if (
      this.#appearancePluginPending
      || this.#appearanceTransitionPending
      || this.#particleBackgroundController.pending
    ) return;
    const bridge = this.#bridge;
    const enabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
    const nextEnabled = !enabled;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    if (!nextEnabled) this.#cancelAppearanceHealthCheck();

    if (!bridge?.available) {
      this.#appearanceTransitionPending = false;
      this.#appearancePluginApplied = undefined;
      this.#appearancePluginError = "Restart Codex with Code-Codex, then try again.";
      this.#renderAppearancePlugin();
      this.#showActionNotice(`Transparent Background was not changed. ${this.#appearancePluginError}`, "error");
      return;
    }
    if (nextEnabled && this.#transparencyPreferenceBlocked()) {
      this.#appearanceTransitionPending = false;
      this.#appearancePluginError = "Turn off high contrast or reduced transparency, then try again.";
      this.#renderAppearancePlugin();
      this.#showActionNotice(`Transparent Background was not enabled. ${this.#appearancePluginError}`, "error");
      return;
    }

    this.#appearancePluginPending = true;
    this.#appearancePluginError = undefined;
    this.#renderPreviewMarket();
    const previousBackground = this.#transparentBackgroundPresentation();
    this.#clearTransparentBackgroundPresentation();
    try {
      const result = await this.#setWindowTransparency(bridge, nextEnabled);
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (nextEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = nextEnabled;
      if (nextEnabled) {
        if (this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)) {
          await this.#particleBackgroundController.disable();
        }
        this.#enabledAppearancePlugins.add(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      } else {
        this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#renderParticleBackgroundPlugin();
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
        this.#appearanceTransitionPending = false;
        this.#renderPreviewMarket();
        this.#flushQueuedAppearanceSync(bridge);
        if (this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)) {
          this.#scheduleAppearanceHealthCheck();
        }
      }
    }
  }

  async #syncPersistedAppearance(bridge: ExplorerBridge, reportErrors: boolean): Promise<void> {
    if (!this.#canUseAppearanceBridge(bridge)) return;
    if (this.#appearancePluginPending || this.#appearanceTransitionPending) {
      this.#appearanceSyncQueued = true;
      return;
    }
    const persistedEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
    const requestedEnabled = persistedEnabled && !this.#transparencyPreferenceBlocked();
    const operation = ++this.#appearanceOperation;
    if (!requestedEnabled) this.#cancelAppearanceHealthCheck();
    this.#appearancePluginPending = true;
    this.#appearancePluginError = undefined;
    this.#renderPreviewMarket();
    const previousBackground = this.#transparentBackgroundPresentation();
    this.#clearTransparentBackgroundPresentation();
    try {
      const result = await this.#setWindowTransparency(bridge, requestedEnabled);
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (requestedEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = requestedEnabled;
    } catch (error) {
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (
        !requestedEnabled
        && previousBackground
        && !this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
      ) {
        this.#applyTransparentBackgroundPresentation(previousBackground);
      }
      if (requestedEnabled) this.#appearancePluginApplied = false;
      this.#appearancePluginError = transparencyActionError(error, requestedEnabled);
      if (reportErrors) this.#showActionNotice(this.#appearancePluginError, "error");
    } finally {
      if (this.#isCurrentAppearanceOperation(bridge, operation)) {
        this.#appearancePluginPending = false;
        this.#renderPreviewMarket();
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

  #toggleParticleSettings(): void {
    if (this.#particleSettingsOpen) {
      this.#closeParticleSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#particleSettingsOpen = true;
    this.#particleSettingsTrigger.setAttribute("aria-expanded", "true");
    this.#renderParticleBackgroundPlugin();
    if (!this.#particleSettingsPanel.matches(":popover-open")) this.#particleSettingsPanel.showPopover();
    this.#positionParticleSettingsPanel();
    queueMicrotask(() => {
      if (!this.#particleSettingsOpen) return;
      this.#positionParticleSettingsPanel();
      this.#particleSettingsCloseButton.focus();
    });
  }

  #closeParticleSettings(restoreFocus: boolean): void {
    if (!this.#particleSettingsOpen && !this.#particleSettingsPanel.matches(":popover-open")) return;
    this.#particleSettingsOpen = false;
    this.#particleSettingsTrigger.setAttribute("aria-expanded", "false");
    if (this.#particleSettingsPanel.matches(":popover-open")) this.#particleSettingsPanel.hidePopover();
    if (restoreFocus && this.#particleSettingsTrigger.isConnected) this.#particleSettingsTrigger.focus();
  }

  #positionParticleSettingsPanel(): void {
    if (!this.#particleSettingsOpen || !this.#particleSettingsPanel.matches(":popover-open")) return;
    const panel = this.#particleSettingsPanel;
    const cardRect = this.#particleBackgroundCard.getBoundingClientRect();
    const edge = 12;
    const gap = 8;
    const preferredWidth = 344;
    const panelWidth = Math.min(preferredWidth, Math.max(240, window.innerWidth - edge * 2));
    let left = cardRect.right + gap;
    let side = "right";
    if (left + panelWidth > window.innerWidth - edge) {
      left = Math.max(edge, window.innerWidth - edge - panelWidth);
      side = "overlay";
    }
    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = `${Math.max(240, window.innerHeight - edge * 2)}px`;
    const panelHeight = Math.min(panel.scrollHeight, Math.max(240, window.innerHeight - edge * 2));
    const top = Math.min(
      Math.max(edge, cardRect.top),
      Math.max(edge, window.innerHeight - edge - panelHeight),
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.setProperty(
      "--cle-particle-settings-anchor-y",
      `${Math.round(Math.min(panelHeight - 18, Math.max(18, cardRect.top + cardRect.height * 0.5 - top)))}px`,
    );
    panel.dataset.side = side;
  }

  #closePreviewMarket(restoreFocus: boolean): void {
    this.#closeParticleSettings(false);
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
    this.#renderParticleBackgroundPlugin();
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
      this.#appearancePluginPending
      || this.#appearanceTransitionPending
      || this.#particleBackgroundController.pending
      || !bridgeAvailable
      || (!enabled && preferenceBlocked);

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
    this.#statusCode.textContent = this.#state === "ready" || this.#state === "empty" || this.#state === "no-project"
      ? `v${__CODE_CODEX_VERSION__}`
      : this.#state.toUpperCase().slice(0, 8);
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

  #showActionProgress(message: string): void {
    if (!this.#actionNotice.hidden && this.#actionNotice.dataset.tone === "progress") {
      this.#actionNotice.textContent = message;
      return;
    }
    this.#hideActionNotice();
    this.#actionNotice.textContent = message;
    this.#actionNotice.dataset.tone = "progress";
    this.#actionNotice.hidden = false;
    this.#announce(message);
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

function isExternalFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types);
  if (types.includes(INTERNAL_DRAG_TYPE)) return false;
  return types.includes("Files") || Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function captureExternalDropCandidates(dataTransfer: DataTransfer | null): readonly ExternalDropCandidate[] {
  if (!dataTransfer) return [];
  const candidates: ExternalDropCandidate[] = [];
  for (const rawItem of Array.from(dataTransfer.items)) {
    if (rawItem.kind !== "file") continue;
    const item = rawItem as ExternalDataTransferItem;
    let handlePromise: Promise<FileSystemHandle | null> | undefined;
    try {
      if (typeof item.getAsFileSystemHandle === "function") {
        handlePromise = item.getAsFileSystemHandle.call(item);
      }
    } catch {
      handlePromise = undefined;
    }

    let entry: FileSystemEntry | undefined;
    try {
      entry = item.webkitGetAsEntry?.() ?? item.getAsEntry?.() ?? undefined;
    } catch {
      entry = undefined;
    }

    let file: File | undefined;
    try {
      file = item.getAsFile() ?? undefined;
    } catch {
      file = undefined;
    }
    if (handlePromise || entry || file) {
      candidates.push({
        ...(handlePromise ? { handlePromise } : {}),
        ...(entry ? { entry } : {}),
        ...(file ? { file } : {}),
      });
    }
  }

  if (candidates.length) return candidates;
  return Array.from(dataTransfer.files, (file) => ({ file }));
}

async function resolveExternalDropRoots(
  candidates: readonly ExternalDropCandidate[],
  assertCurrent: () => void,
): Promise<readonly ExternalDropRoot[]> {
  const roots: ExternalDropRoot[] = [];
  const budget: ExternalDropBudget = { entries: 0, sizeBytes: 0 };
  try {
    for (const candidate of candidates) {
      assertCurrent();
      const handle = candidate.handlePromise ? await candidate.handlePromise.catch(() => null) : null;
      assertCurrent();
      if (handle && (handle.kind !== "directory" || typeof (handle as ExternalDirectoryHandle).entries === "function")) {
        roots.push(await externalDropRootFromHandle(handle, budget, assertCurrent));
        continue;
      }
      if (candidate.entry) {
        roots.push(await externalDropRootFromEntry(candidate.entry, budget, assertCurrent));
        continue;
      }
      if (candidate.file) {
        chargeExternalDropFile(candidate.file.name, candidate.file.size, 1, budget);
        roots.push({
          name: candidate.file.name,
          kind: "file",
          file: candidate.file,
          members: [],
          entryCount: 1,
          sizeBytes: candidate.file.size,
        });
      }
    }
  } catch (error) {
    throw normalizeExternalDropReadError(error);
  }
  if (!roots.length) {
    throw new ExplorerBridgeError({ code: "NOT_FOUND", message: "No readable files or folders were dropped." });
  }
  return roots;
}

async function externalDropRootFromHandle(
  handle: FileSystemHandle,
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<ExternalDropRoot> {
  const startEntries = budget.entries;
  const startBytes = budget.sizeBytes;
  if (handle.kind === "file") {
    const file = await (handle as FileSystemFileHandle).getFile();
    assertCurrent();
    chargeExternalDropFile(handle.name, file.size, 1, budget);
    return { name: handle.name, kind: "file", file, members: [], entryCount: 1, sizeBytes: file.size };
  }

  chargeExternalDropEntry(handle.name, 1, budget);
  const members: ExternalDropMember[] = [];
  await appendExternalHandleMembers(
    handle as ExternalDirectoryHandle,
    "",
    1,
    members,
    budget,
    assertCurrent,
  );
  return {
    name: handle.name,
    kind: "directory",
    members,
    entryCount: budget.entries - startEntries,
    sizeBytes: budget.sizeBytes - startBytes,
  };
}

async function appendExternalHandleMembers(
  directory: ExternalDirectoryHandle,
  parentRelativePath: string,
  parentDepth: number,
  members: ExternalDropMember[],
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<void> {
  for await (const [listedName, child] of directory.entries()) {
    assertCurrent();
    const name = child.name || listedName;
    const depth = parentDepth + 1;
    const relativePath = joinExternalDropPath(parentRelativePath, name);
    if (child.kind === "directory") {
      chargeExternalDropEntry(name, depth, budget);
      members.push({ relativePath, kind: "directory" });
      const childDirectory = child as ExternalDirectoryHandle;
      if (typeof childDirectory.entries !== "function") {
        throw new ExplorerBridgeError({ code: "ACCESS_DENIED", message: "A dropped folder could not be read." });
      }
      await appendExternalHandleMembers(childDirectory, relativePath, depth, members, budget, assertCurrent);
      continue;
    }
    if (child.kind !== "file") {
      throw new ExplorerBridgeError({ code: "INVALID_PATH", message: "The drop contained an unsupported entry." });
    }
    const file = await (child as FileSystemFileHandle).getFile();
    assertCurrent();
    chargeExternalDropFile(name, file.size, depth, budget);
    members.push({ relativePath, kind: "file", file });
  }
}

async function externalDropRootFromEntry(
  entry: FileSystemEntry,
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<ExternalDropRoot> {
  const startEntries = budget.entries;
  const startBytes = budget.sizeBytes;
  if (entry.isFile) {
    const file = await readExternalFileEntry(entry as FileSystemFileEntry);
    assertCurrent();
    chargeExternalDropFile(entry.name, file.size, 1, budget);
    return { name: entry.name, kind: "file", file, members: [], entryCount: 1, sizeBytes: file.size };
  }
  if (!entry.isDirectory) {
    throw new ExplorerBridgeError({ code: "INVALID_PATH", message: "The drop contained an unsupported entry." });
  }

  chargeExternalDropEntry(entry.name, 1, budget);
  const members: ExternalDropMember[] = [];
  await appendExternalEntryMembers(
    entry as FileSystemDirectoryEntry,
    "",
    1,
    members,
    budget,
    assertCurrent,
  );
  return {
    name: entry.name,
    kind: "directory",
    members,
    entryCount: budget.entries - startEntries,
    sizeBytes: budget.sizeBytes - startBytes,
  };
}

async function appendExternalEntryMembers(
  directory: FileSystemDirectoryEntry,
  parentRelativePath: string,
  parentDepth: number,
  members: ExternalDropMember[],
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<void> {
  const reader = directory.createReader();
  while (true) {
    const entries = await readExternalDirectoryBatch(reader);
    assertCurrent();
    if (!entries.length) return;
    for (const child of entries) {
      assertCurrent();
      const depth = parentDepth + 1;
      const relativePath = joinExternalDropPath(parentRelativePath, child.name);
      if (child.isDirectory) {
        chargeExternalDropEntry(child.name, depth, budget);
        members.push({ relativePath, kind: "directory" });
        await appendExternalEntryMembers(
          child as FileSystemDirectoryEntry,
          relativePath,
          depth,
          members,
          budget,
          assertCurrent,
        );
        continue;
      }
      if (!child.isFile) {
        throw new ExplorerBridgeError({ code: "INVALID_PATH", message: "The drop contained an unsupported entry." });
      }
      const file = await readExternalFileEntry(child as FileSystemFileEntry);
      assertCurrent();
      chargeExternalDropFile(child.name, file.size, depth, budget);
      members.push({ relativePath, kind: "file", file });
    }
  }
}

function readExternalDirectoryBatch(reader: FileSystemDirectoryReader): Promise<readonly FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function readExternalFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function chargeExternalDropEntry(name: string, depth: number, budget: ExternalDropBudget): void {
  if (entryNameValidationError(name)) {
    throw new ExplorerBridgeError({ code: "INVALID_PATH", message: "A dropped item has a name Windows cannot copy." });
  }
  if (depth > MAX_EXTERNAL_IMPORT_DEPTH || budget.entries >= MAX_EXTERNAL_IMPORT_ENTRIES) {
    throw new ExplorerBridgeError({ code: "TOO_MANY_ENTRIES", message: "The dropped folder exceeds the import limits." });
  }
  budget.entries += 1;
}

function chargeExternalDropFile(name: string, sizeBytes: number, depth: number, budget: ExternalDropBudget): void {
  chargeExternalDropEntry(name, depth, budget);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_EXTERNAL_IMPORT_FILE_BYTES) {
    throw new ExplorerBridgeError({ code: "CONTENT_TOO_LARGE", message: "A dropped file exceeds the import limit." });
  }
  if (budget.sizeBytes + sizeBytes > MAX_EXTERNAL_IMPORT_TOTAL_BYTES) {
    throw new ExplorerBridgeError({ code: "CONTENT_TOO_LARGE", message: "The dropped items exceed the import limit." });
  }
  budget.sizeBytes += sizeBytes;
}

function joinExternalDropPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function ensureDistinctExternalRootNames(roots: readonly ExternalDropRoot[]): void {
  const names = new Set<string>();
  for (const root of roots) {
    const folded = root.name.normalize("NFC").toLocaleLowerCase();
    if (names.has(folded)) {
      throw new ExplorerBridgeError({ code: "CONFLICT", message: "Two dropped items have the same name." });
    }
    names.add(folded);
  }
}

function normalizeExternalDropReadError(error: unknown): ExplorerBridgeError {
  if (error instanceof ExplorerBridgeError) return error;
  const name = error instanceof DOMException ? error.name : "";
  const code = name === "NotAllowedError" || name === "SecurityError" ? "ACCESS_DENIED" : "NOT_FOUND";
  return new ExplorerBridgeError({ code, message: "Windows could not read one of the dropped items." });
}

function invalidExternalImportResponse(message = "The file import response was not valid."): ExplorerBridgeError {
  return new ExplorerBridgeError({ code: "INVALID_REQUEST", message });
}

function externalImportBeginParams(
  root: ExternalDropRoot,
  destinationParentPath: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    destinationParentRelativePath: destinationParentPath,
    name: root.name,
    kind: root.kind,
  };
  if (root.kind === "file") params.sizeBytes = root.file?.size ?? 0;
  return params;
}

function normalizeExternalImportBegin(raw: unknown): { readonly sessionId: string } {
  const object = asRecord(raw);
  if (
    !object ||
    typeof object.sessionId !== "string" ||
    !object.sessionId ||
    object.sessionId.length > 128 ||
    object.chunkSize !== EXTERNAL_IMPORT_CHUNK_BYTES
  ) {
    throw invalidExternalImportResponse();
  }
  return { sessionId: object.sessionId };
}

function validateExternalImportFlag(raw: unknown, field: "created" | "ready" | "finished" | "aborted"): void {
  const object = asRecord(raw);
  if (!object || object[field] !== true) throw invalidExternalImportResponse();
}

function validateExternalImportChunk(raw: unknown, expectedNextOffset: number): void {
  const object = asRecord(raw);
  if (!object || object.nextOffset !== expectedNextOffset) throw invalidExternalImportResponse();
}

function normalizeExternalImportCommit(
  raw: unknown,
  destinationParentPath: string,
  root: ExternalDropRoot,
): TreeNodeInput {
  const object = asRecord(raw);
  const entry = normalizeNode(object?.entry);
  const expectedPath = destinationParentPath ? `${destinationParentPath}/${root.name}` : root.name;
  if (!entry || entry.kind !== root.kind || entry.name !== root.name || entry.relativePath !== expectedPath || entry.inaccessible) {
    throw invalidExternalImportResponse();
  }
  return entry;
}

function externalImportError(error: unknown, committedCount: number): string {
  const prefix = committedCount > 0
    ? `${committedCount.toLocaleString()} ${committedCount === 1 ? "item was" : "items were"} copied, but `
    : "";
  const code = errorCode(error);
  if (code === "CONFLICT" || code === "ALREADY_EXISTS") return `${prefix}an item with that name already exists in this folder.`;
  if (code === "TOO_MANY_ENTRIES") return `${prefix}the dropped folders contain more than 1,024 items or are nested too deeply.`;
  if (code === "CONTENT_TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" || code === "TOO_LARGE") {
    return `${prefix}the dropped files exceed the 512 MB per-file or 1 GB total limit.`;
  }
  if (code === "INVALID_PATH" || code === "INVALID_NAME" || code === "INVALID_REQUEST") {
    return `${prefix}one of the dropped items has a name or path that cannot be copied.`;
  }
  if (code === "ACCESS_DENIED") return `${prefix}Windows denied access to one of the dropped items.`;
  if (code === "NOT_FOUND") return `${prefix}one of the dropped items changed or became unavailable.`;
  if (code === "CANCELLED") return `${prefix}the copy was cancelled because the active workspace changed.`;
  if (code === "TIMEOUT") return `${prefix}copying the dropped items timed out.`;
  if (code === "NO_BRIDGE") return `${prefix}Code-Codex disconnected before the copy finished.`;
  return `${prefix}the dropped items could not be copied.`;
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
    (object.previewNotice !== undefined &&
      (object.previewNotice !== POWERPOINT_FULL_FIDELITY_NOTICE ||
        route.kind !== "office" ||
        object.mimeType !== "application/vnd.ms-powerpoint")) ||
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
    ...(object.previewNotice === POWERPOINT_FULL_FIDELITY_NOTICE
      ? { previewNotice: POWERPOINT_FULL_FIDELITY_NOTICE }
      : {}),
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
