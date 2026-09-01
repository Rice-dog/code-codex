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
const BLACK_HOLE_BACKGROUND_PLUGIN_ID = "code-codex.black-hole-background";
const GLOW_HORIZON_BACKGROUND_PLUGIN_ID = "code-codex.glow-horizon-background";
const APPEARANCE_PLUGIN_IDS = new Set([
  TRANSPARENT_BACKGROUND_PLUGIN_ID,
  PARTICLE_BACKGROUND_PLUGIN_ID,
  BLACK_HOLE_BACKGROUND_PLUGIN_ID,
  GLOW_HORIZON_BACKGROUND_PLUGIN_ID,
]);
export const TRANSPARENT_BACKGROUND_ATTRIBUTE = "data-code-codex-transparent-background";
export const TRANSPARENT_BACKGROUND_COLOR_PROPERTY = "--code-codex-window-background";
export const PARTICLE_BACKGROUND_ATTRIBUTE = "data-code-codex-particle-image-background";
export const PARTICLE_BACKGROUND_COLOR_PROPERTY = "--code-codex-particle-background";
export const GLOW_HORIZON_BACKGROUND_ATTRIBUTE = "data-code-codex-glow-horizon-background";
export const GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY = "--code-codex-glow-horizon-background";
const TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS = 1_500;
const FORCED_COLORS_QUERY = "(forced-colors: active)";
const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";
const PARTICLE_BACKGROUND_SETTINGS_KEY = "code-codex:particle-image-background:v1";
const PARTICLE_BACKGROUND_THEME_LEASE_KEY = "code-codex:particle-theme-lease:v1";
const BLACK_HOLE_BACKGROUND_SETTINGS_KEY = "code-codex:black-hole-background:v1";
const GLOW_HORIZON_BACKGROUND_SETTINGS_KEY = "code-codex:glow-horizon-background:v1";
const BACKGROUND_SETTINGS_LANGUAGE_KEY = "code-codex:background-settings-language:v1";
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
type UpdateCheckStatus = "upToDate" | "updateAvailable" | "ahead";
type UpdateCheckPresentation = "idle" | "checking" | "upToDate" | "updateAvailable" | "ahead" | "error";

interface UpdateCheckResult {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly status: UpdateCheckStatus;
  readonly tagName: string;
  readonly releaseUrl: string;
}

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

interface ParticleMorphCurveNode {
  readonly time: number;
  readonly progress: number;
}

interface ParticleMorphCurve {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly nodes: readonly ParticleMorphCurveNode[];
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
  readonly morphCurve: ParticleMorphCurve;
  readonly imageOpacity: number;
  readonly showSourceImage: boolean;
  readonly backgroundColor: string;
  readonly cursorStrength: number;
  readonly cursorInteraction: boolean;
  readonly dprCap: number;
}

interface ParticleCursorStrengthValues {
  readonly baseStrength: number;
  readonly cursorScale: number;
  readonly strengthRatio: number;
  readonly extendedStrength: number;
  readonly extremeStrength: number;
  readonly overdrive: number;
  readonly highStrengthScale: number;
  readonly stepStrengthScale: number;
  readonly strength: number;
  readonly wakeLengthScale: number;
  readonly squareRootStrength: number;
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

type DarkBackgroundPluginId =
  | typeof PARTICLE_BACKGROUND_PLUGIN_ID
  | typeof BLACK_HOLE_BACKGROUND_PLUGIN_ID
  | typeof GLOW_HORIZON_BACKGROUND_PLUGIN_ID;

interface ParticleThemeLease {
  readonly owner?: DarkBackgroundPluginId;
  readonly previousPreference: Exclude<CodexAppearanceTheme, "dark">;
  readonly forcedPreference: "dark";
}

interface BlackHoleBackgroundSettings {
  readonly distance: number;
  readonly elevation: number;
  readonly azimuth: number;
  readonly orbitSpeed: number;
  readonly roll: number;
  readonly fov: number;
  readonly diskInner: number;
  readonly diskOuter: number;
  readonly diskThickness: number;
  readonly diskDensity: number;
  readonly brightness: number;
  readonly spinSpeed: number;
  readonly grain: number;
  readonly doppler: number;
  readonly hotColor: string;
  readonly midColor: string;
  readonly coolColor: string;
  readonly starBrightness: number;
  readonly glow: number;
  readonly exposure: number;
  readonly vignette: number;
  readonly steps: number;
  readonly resolution: number;
  readonly maxDpr: number;
  readonly paused: boolean;
}

type GlowHorizonVariant = "top" | "bottom" | "left" | "right";

interface GlowHorizonBackgroundSettings {
  readonly variant: GlowHorizonVariant;
  readonly inertialWheel: boolean;
  readonly openingDuration: number;
  readonly wheelSensitivity: number;
  readonly wheelDownIntensity: number;
  readonly wheelUpIntensity: number;
  readonly wheelTravelScale: number;
  readonly wheelDownDistance: number;
  readonly wheelUpDistance: number;
  readonly wheelUpTrailDistance: number;
  readonly wheelUpTrailStrength: number;
  readonly wheelUpStiffness: number;
  readonly wheelUpDamping: number;
  readonly wheelReleaseDelay: number;
  readonly wheelUpReleaseDelay: number;
  readonly maxReleaseVelocity: number;
  readonly returnStiffness: number;
  readonly returnDamping: number;
  readonly initialStretch: number;
  readonly initialBlur: number;
  readonly rimColor: string;
  readonly violetColor: string;
  readonly blueColor: string;
  readonly shadowColor: string;
}

type GlowHorizonNumericSettingKey = {
  [Key in keyof GlowHorizonBackgroundSettings]: GlowHorizonBackgroundSettings[Key] extends number ? Key : never;
}[keyof GlowHorizonBackgroundSettings];

type GlowHorizonControlGroup = "input" | "downward" | "upward" | "release" | "entrance";

interface GlowHorizonNumericControlDefinition {
  readonly key: GlowHorizonNumericSettingKey;
  readonly group: GlowHorizonControlGroup;
  readonly id: string;
  readonly label: string;
  readonly labelZh: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly precision?: number;
}

type BackgroundSettingsLanguage = "zh" | "en";
let backgroundSettingsLanguageSession: BackgroundSettingsLanguage = "zh";

type BlackHolePresetName = "cinema" | "lens" | "ember";
type BlackHoleColorSettingKey = "hotColor" | "midColor" | "coolColor";

type BlackHoleNumericSettingKey = {
  [Key in keyof BlackHoleBackgroundSettings]: BlackHoleBackgroundSettings[Key] extends number ? Key : never;
}[keyof BlackHoleBackgroundSettings];

type BlackHoleControlGroup = "camera" | "disc" | "light" | "renderer";

interface BlackHoleNumericControlDefinition {
  readonly key: BlackHoleNumericSettingKey;
  readonly group: BlackHoleControlGroup;
  readonly id: string;
  readonly label: string;
  readonly labelZh: string;
  readonly hint: string;
  readonly hintZh: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly percent?: boolean;
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

interface ParticleValueControlDefinition {
  readonly id: string;
  readonly label: string;
  readonly labelZh: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly editorScale?: number;
  readonly format: (value: number) => string;
}

interface ParticleNumericControlDefinition extends ParticleValueControlDefinition {
  readonly key: ParticleNumericSettingKey;
  readonly group: ParticleControlGroup;
  readonly live: boolean;
}

interface ParticleImageTransform {
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
}

type ParticleImageTransformKey = keyof ParticleImageTransform;

interface ParticleImageTransformControlDefinition extends ParticleValueControlDefinition {
  readonly key: ParticleImageTransformKey;
}

interface ParticleValueControl {
  readonly definition: ParticleValueControlDefinition;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
  readonly editor: HTMLInputElement;
}

type ParticleMorphCurveHandle = "start" | "end";

type ParticleMorphCurveDragState =
  | {
      readonly pointerId: number;
      readonly kind: "handle";
      readonly handle: ParticleMorphCurveHandle;
      readonly targetElement: SVGGElement;
      readonly originalCurve: ParticleMorphCurve;
    }
  | {
      readonly pointerId: number;
      readonly kind: "node";
      readonly nodeIndex: number;
      readonly targetElement: SVGGElement;
      readonly originalCurve: ParticleMorphCurve;
    };

interface ParticleImageRecord extends ParticleImageTransform {
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

const DEFAULT_PARTICLE_MORPH_CURVE: ParticleMorphCurve = Object.freeze({
  x1: 0.42,
  y1: 0,
  x2: 0.58,
  y2: 1,
  nodes: Object.freeze([]),
});
const MAX_PARTICLE_MORPH_CURVE_NODES = 32;
const PARTICLE_MORPH_CURVE_NODE_EPSILON = 0.0001;
const PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP = 0.008;
const PARTICLE_MORPH_CURVE_SVG_NS = "http://www.w3.org/2000/svg";
const PARTICLE_MORPH_CURVE_EDITOR_BOUNDS = Object.freeze({
  width: 240,
  height: 116,
  left: 14,
  right: 226,
  top: 12,
  bottom: 100,
});

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
  morphCurve: DEFAULT_PARTICLE_MORPH_CURVE,
  imageOpacity: 1,
  showSourceImage: true,
  backgroundColor: "#000000",
  cursorStrength: PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
  cursorInteraction: true,
  dprCap: 1.5,
});

const DEFAULT_PARTICLE_IMAGE_TRANSFORM: ParticleImageTransform = Object.freeze({
  positionX: 50,
  positionY: 50,
  zoom: 1,
});

const PARTICLE_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "particleCount", group: "particles", id: "cle-particle-count", label: "Particle count", labelZh: "粒子数量", minimum: 10_000, maximum: 2_000_000, step: 10_000, live: false, format: (value: number) => Math.round(value).toLocaleString() },
  { key: "particleSize", group: "particles", id: "cle-particle-size", label: "Particle size", labelZh: "粒子大小", minimum: 0.5, maximum: 4, step: 0.1, live: true, format: (value: number) => value.toFixed(1) },
  { key: "particleOpacity", group: "particles", id: "cle-particle-opacity", label: "Particle opacity", labelZh: "粒子不透明度", minimum: 0.1, maximum: 1, step: 0.01, live: true, format: (value: number) => value.toFixed(2) },
  { key: "speed", group: "flow", id: "cle-particle-speed", label: "Speed", labelZh: "速度", minimum: 0, maximum: 2, step: 0.05, live: true, format: (value: number) => value.toFixed(2) },
  { key: "noiseScale", group: "flow", id: "cle-particle-noise-scale", label: "Noise scale", labelZh: "噪声尺度", minimum: 0.0001, maximum: 0.002, step: 0.0001, live: true, format: (value: number) => value.toFixed(4) },
  { key: "noiseStrength", group: "flow", id: "cle-particle-noise-strength", label: "Noise strength", labelZh: "噪声强度", minimum: 0, maximum: 0.15, step: 0.005, live: true, format: (value: number) => value.toFixed(3) },
  { key: "damping", group: "flow", id: "cle-particle-damping", label: "Damping", labelZh: "阻尼", minimum: 0.8, maximum: 0.9999, step: 0.0001, live: true, format: (value: number) => value.toFixed(4) },
  { key: "ambientCycle", group: "flow", id: "cle-particle-ambient-cycle", label: "Ambient cycle", labelZh: "环境循环", minimum: 40, maximum: 500, step: 10, live: true, format: (value: number) => String(Math.round(value)) },
  { key: "imageDurationSeconds", group: "source", id: "cle-particle-image-duration", label: "Image duration", labelZh: "图片显示时长", minimum: 1, maximum: 60, step: 1, live: true, format: (value: number) => `${Math.round(value)}s` },
  { key: "morphIntervalSeconds", group: "source", id: "cle-particle-morph-interval", label: "Morph interval", labelZh: "变形间隔", minimum: 1, maximum: 12, step: 0.1, live: true, format: (value: number) => `${value.toFixed(1)}s` },
  { key: "imageOpacity", group: "source", id: "cle-particle-image-opacity", label: "Image opacity", labelZh: "图片不透明度", minimum: 0, maximum: 1, step: 0.01, live: true, format: (value: number) => value.toFixed(2) },
  { key: "cursorStrength", group: "pointer", id: "cle-particle-cursor-strength", label: "Cursor strength", labelZh: "鼠标强度", minimum: 0, maximum: PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH, step: 0.01, live: true, format: (value: number) => value.toFixed(2) },
  { key: "dprCap", group: "render", id: "cle-particle-dpr-cap", label: "DPR cap", labelZh: "像素比上限", minimum: 1, maximum: 2, step: 0.25, live: true, format: (value: number) => value.toFixed(2) },
] satisfies readonly ParticleNumericControlDefinition[]);

const PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS = Object.freeze([
  { key: "positionX", id: "cle-particle-image-position-x", label: "Position X", labelZh: "水平位置", minimum: 0, maximum: 100, step: 1, format: (value: number) => `${Math.round(value)}%` },
  { key: "positionY", id: "cle-particle-image-position-y", label: "Position Y", labelZh: "垂直位置", minimum: 0, maximum: 100, step: 1, format: (value: number) => `${Math.round(value)}%` },
  { key: "zoom", id: "cle-particle-image-zoom", label: "Zoom", labelZh: "缩放", minimum: 0.25, maximum: 4, step: 0.05, editorScale: 100, format: (value: number) => `${Math.round(value * 100)}%` },
] satisfies readonly ParticleImageTransformControlDefinition[]);

const DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS: BlackHoleBackgroundSettings = Object.freeze({
  distance: 24,
  elevation: -5.5,
  azimuth: 0,
  orbitSpeed: 0,
  roll: -20,
  fov: 42,
  diskInner: 3,
  diskOuter: 15,
  diskThickness: 0.26,
  diskDensity: 1,
  brightness: 1,
  spinSpeed: 0.06,
  grain: 0.48,
  doppler: 0.35,
  hotColor: "#FFF3DE",
  midColor: "#FF9838",
  coolColor: "#8E3A0B",
  starBrightness: 0,
  glow: 1,
  exposure: 0.9,
  vignette: 0.28,
  steps: 200,
  resolution: 0.4,
  maxDpr: 1,
  paused: false,
});

const BLACK_HOLE_BACKGROUND_PRESETS: Readonly<Record<BlackHolePresetName, BlackHoleBackgroundSettings>> = Object.freeze({
  cinema: DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS,
  lens: Object.freeze({
    ...DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS,
    elevation: 6,
    roll: 0,
    fov: 47,
    diskDensity: 0.78,
    brightness: 0.88,
    spinSpeed: 0.045,
    doppler: 1,
    starBrightness: 0.42,
    glow: 0.58,
    exposure: 0.82,
    vignette: 0.18,
  }),
  ember: Object.freeze({
    ...DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS,
    elevation: -2,
    roll: -28,
    diskThickness: 0.34,
    diskDensity: 1.32,
    brightness: 1.22,
    spinSpeed: 0.085,
    grain: 0.62,
    doppler: 0.5,
    hotColor: "#FFF0CB",
    midColor: "#FF6A1A",
    coolColor: "#5B1605",
    glow: 1.3,
    exposure: 0.96,
    vignette: 0.38,
  }),
});

const BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "distance", group: "camera", id: "cle-black-hole-distance", label: "Distance", labelZh: "距离", hint: "Camera distance in horizon radii", hintZh: "以视界半径为单位的相机距离", minimum: 10, maximum: 40, step: 0.5, unit: " rH" },
  { key: "elevation", group: "camera", id: "cle-black-hole-elevation", label: "Elevation", labelZh: "仰角", hint: "Angle above the accretion disc", hintZh: "相对于吸积盘的角度", minimum: -30, maximum: 30, step: 0.5, unit: "deg" },
  { key: "azimuth", group: "camera", id: "cle-black-hole-azimuth", label: "Azimuth", labelZh: "方位角", hint: "Position around the black hole", hintZh: "黑洞周围的位置", minimum: -180, maximum: 180, step: 1, unit: "deg" },
  { key: "roll", group: "camera", id: "cle-black-hole-roll", label: "Roll", labelZh: "滚转", hint: "Disc angle across the frame", hintZh: "吸积盘在画面中的倾斜角", minimum: -45, maximum: 45, step: 1, unit: "deg" },
  { key: "fov", group: "camera", id: "cle-black-hole-fov", label: "Field of view", labelZh: "视野", hint: "Vertical camera field of view", hintZh: "垂直相机视野", minimum: 25, maximum: 75, step: 1, unit: "deg" },
  { key: "orbitSpeed", group: "camera", id: "cle-black-hole-orbit-speed", label: "Orbit drift", labelZh: "轨道漂移", hint: "Camera movement in degrees per second", hintZh: "相机每秒移动的角度", minimum: -8, maximum: 8, step: 0.1, unit: "deg/s" },
  { key: "diskInner", group: "disc", id: "cle-black-hole-disk-inner", label: "Inner edge", labelZh: "内边缘", hint: "Closest stable gas orbit", hintZh: "气体可保持的最近稳定轨道", minimum: 1.2, maximum: 6, step: 0.1, unit: " rH" },
  { key: "diskOuter", group: "disc", id: "cle-black-hole-disk-outer", label: "Outer edge", labelZh: "外边缘", hint: "Disc radius", hintZh: "吸积盘半径", minimum: 8, maximum: 24, step: 0.5, unit: " rH" },
  { key: "diskThickness", group: "disc", id: "cle-black-hole-disk-thickness", label: "Thickness", labelZh: "厚度", hint: "Gas depth at the inner rim", hintZh: "内缘处的气体深度", minimum: 0.05, maximum: 0.8, step: 0.01 },
  { key: "diskDensity", group: "disc", id: "cle-black-hole-disk-density", label: "Density", labelZh: "密度", hint: "Opacity of the gas", hintZh: "气体不透明度", minimum: 0.1, maximum: 2, step: 0.05 },
  { key: "brightness", group: "disc", id: "cle-black-hole-brightness", label: "Emission", labelZh: "发射", hint: "Light emitted before tone mapping", hintZh: "色调映射前的气体亮度", minimum: 0.2, maximum: 2, step: 0.05 },
  { key: "spinSpeed", group: "disc", id: "cle-black-hole-spin-speed", label: "Spin", labelZh: "自转", hint: "Inner-rim turns per second", hintZh: "内缘每秒旋转圈数", minimum: 0, maximum: 0.2, step: 0.005, unit: " t/s" },
  { key: "grain", group: "disc", id: "cle-black-hole-grain", label: "Turbulence", labelZh: "湍流", hint: "Scale of gas detail", hintZh: "气体细节尺度", minimum: 0.1, maximum: 1.2, step: 0.02 },
  { key: "doppler", group: "disc", id: "cle-black-hole-doppler", label: "Doppler beaming", labelZh: "多普勒束射", hint: "Relativistic color and brightness shift", hintZh: "相对论颜色与亮度偏移", minimum: 0, maximum: 1, step: 0.05, percent: true },
  { key: "starBrightness", group: "light", id: "cle-black-hole-star-brightness", label: "Lensed stars", labelZh: "透镜星光", hint: "Brightness of the background sky", hintZh: "背景天空的亮度", minimum: 0, maximum: 2, step: 0.05 },
  { key: "glow", group: "light", id: "cle-black-hole-glow", label: "Bloom", labelZh: "辉光", hint: "Halo around bright gas", hintZh: "明亮气体周围的光晕", minimum: 0, maximum: 2, step: 0.05 },
  { key: "exposure", group: "light", id: "cle-black-hole-exposure", label: "Exposure", labelZh: "曝光", hint: "Intensity entering the tone curve", hintZh: "进入色调曲线的强度", minimum: 0.25, maximum: 1.8, step: 0.05 },
  { key: "vignette", group: "light", id: "cle-black-hole-vignette", label: "Vignette", labelZh: "暗角", hint: "Darkening at the corners", hintZh: "画面角落的变暗程度", minimum: 0, maximum: 1, step: 0.01, percent: true },
  { key: "steps", group: "renderer", id: "cle-black-hole-steps", label: "Ray steps", labelZh: "光线步数", hint: "Integration steps per pixel", hintZh: "每个像素的积分步数", minimum: 120, maximum: 460, step: 10 },
  { key: "resolution", group: "renderer", id: "cle-black-hole-resolution", label: "Render scale", labelZh: "渲染比例", hint: "Canvas resolution before upscaling", hintZh: "放大前的画布分辨率", minimum: 0.4, maximum: 1, step: 0.05, percent: true },
  { key: "maxDpr", group: "renderer", id: "cle-black-hole-max-dpr", label: "Pixel ratio cap", labelZh: "像素比例上限", hint: "Maximum device pixel density", hintZh: "设备像素密度上限", minimum: 1, maximum: 2.5, step: 0.25 },
] satisfies readonly BlackHoleNumericControlDefinition[]);

const DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS: GlowHorizonBackgroundSettings = Object.freeze({
  variant: "bottom",
  inertialWheel: true,
  openingDuration: 2,
  wheelSensitivity: 1,
  wheelDownIntensity: 0.4,
  wheelUpIntensity: 0.8,
  wheelTravelScale: 1,
  wheelDownDistance: 100,
  wheelUpDistance: 20,
  wheelUpTrailDistance: 18,
  wheelUpTrailStrength: 1.15,
  wheelUpStiffness: 180,
  wheelUpDamping: 48,
  wheelReleaseDelay: 70,
  wheelUpReleaseDelay: 80,
  maxReleaseVelocity: 2.4,
  returnStiffness: 180,
  returnDamping: 14,
  initialStretch: 1.8,
  initialBlur: 0,
  rimColor: "#FFFFFF",
  violetColor: "#A558FB",
  blueColor: "#4922E5",
  shadowColor: "#000000",
});

const GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "wheelSensitivity", group: "input", id: "cle-glow-wheel-sensitivity", label: "Wheel strength", labelZh: "滚轮力度", minimum: 0.35, maximum: 1.8, step: 0.05, precision: 2 },
  { key: "wheelTravelScale", group: "input", id: "cle-glow-wheel-travel", label: "Gesture distance", labelZh: "滑动行程", minimum: 0.65, maximum: 1.6, step: 0.05, unit: "×", precision: 2 },
  { key: "wheelDownIntensity", group: "downward", id: "cle-glow-down-intensity", label: "Downward intensity", labelZh: "下滑强度", minimum: 0, maximum: 2, step: 0.05, unit: "×", precision: 2 },
  { key: "wheelDownDistance", group: "downward", id: "cle-glow-down-distance", label: "Downward rewind", labelZh: "下滑回退", minimum: 20, maximum: 100, step: 5, unit: "%", precision: 0 },
  { key: "wheelUpIntensity", group: "upward", id: "cle-glow-up-intensity", label: "Upward intensity", labelZh: "上滑强度", minimum: 0, maximum: 4, step: 0.05, unit: "×", precision: 2 },
  { key: "wheelUpDistance", group: "upward", id: "cle-glow-up-distance", label: "Upward travel", labelZh: "上滑位移", minimum: 3, maximum: 36, step: 1, unit: "%", precision: 0 },
  { key: "wheelUpTrailDistance", group: "upward", id: "cle-glow-up-trail-distance", label: "Trail length", labelZh: "拖光长度", minimum: 4, maximum: 42, step: 1, unit: "%", precision: 0 },
  { key: "wheelUpTrailStrength", group: "upward", id: "cle-glow-up-trail-strength", label: "Trail strength", labelZh: "拖光强度", minimum: 0, maximum: 2, step: 0.05, unit: "×", precision: 2 },
  { key: "wheelUpStiffness", group: "upward", id: "cle-glow-up-stiffness", label: "Upward response", labelZh: "上滑响应", minimum: 180, maximum: 900, step: 10, precision: 0 },
  { key: "wheelUpDamping", group: "upward", id: "cle-glow-up-damping", label: "Upward damping", labelZh: "上滑阻尼", minimum: 18, maximum: 48, step: 1, precision: 0 },
  { key: "wheelReleaseDelay", group: "release", id: "cle-glow-release-delay", label: "Down release delay", labelZh: "下滑释放延迟", minimum: 40, maximum: 220, step: 10, unit: "ms", precision: 0 },
  { key: "wheelUpReleaseDelay", group: "release", id: "cle-glow-up-release-delay", label: "Up release delay", labelZh: "上滑释放延迟", minimum: 40, maximum: 240, step: 10, unit: "ms", precision: 0 },
  { key: "maxReleaseVelocity", group: "release", id: "cle-glow-momentum", label: "Momentum limit", labelZh: "惯性速度上限", minimum: 0.8, maximum: 5, step: 0.1, unit: "×", precision: 1 },
  { key: "returnStiffness", group: "release", id: "cle-glow-return-stiffness", label: "Return tension", labelZh: "回弹张力", minimum: 60, maximum: 180, step: 5, precision: 0 },
  { key: "returnDamping", group: "release", id: "cle-glow-return-damping", label: "Return damping", labelZh: "回弹阻尼", minimum: 10, maximum: 30, step: 1, precision: 0 },
  { key: "openingDuration", group: "entrance", id: "cle-glow-opening-duration", label: "Opening duration", labelZh: "开场时长", minimum: 0.8, maximum: 4, step: 0.1, unit: "s", precision: 1 },
  { key: "initialStretch", group: "entrance", id: "cle-glow-initial-stretch", label: "Initial stretch", labelZh: "初始拉伸", minimum: 1, maximum: 1.8, step: 0.05, unit: "×", precision: 2 },
  { key: "initialBlur", group: "entrance", id: "cle-glow-initial-blur", label: "Initial blur", labelZh: "初始模糊", minimum: 0, maximum: 30, step: 1, unit: "px", precision: 0 },
] satisfies readonly GlowHorizonNumericControlDefinition[]);

function calculateParticleCursorStrengthValues(cursorStrength: number): ParticleCursorStrengthValues {
  const baseStrength = Math.min(
    Math.max(cursorStrength, 0),
    PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
  );
  const cursorScale = baseStrength * 6.25;
  const strengthRatio = Math.max(baseStrength / 0.64, 0);
  const extendedStrength = Math.max(strengthRatio / 15.625, 1);
  const extremeStrength = Math.max(strengthRatio / 31.25, 1);
  const overdrive = Math.max(
    cursorStrength / PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
    1,
  );
  const highStrengthScale = Math.pow(Math.max(strengthRatio, 1), 0.45)
    * Math.pow(extendedStrength, 0.28)
    * Math.pow(extremeStrength, 0.32)
    * Math.pow(overdrive, 0.45);
  const stepStrengthScale = Math.pow(Math.max(strengthRatio, 1), 0.35)
    * Math.pow(extendedStrength, 0.18)
    * Math.pow(extremeStrength, 0.22)
    * Math.pow(overdrive, 0.35);
  const strength = 4.0 * (
    strengthRatio < 1
      ? strengthRatio
      : Math.pow(Math.max(strengthRatio, 1), 0.55)
  ) * Math.pow(extendedStrength, 0.30)
    * Math.pow(extremeStrength, 0.34)
    * overdrive;
  const wakeLengthScale = Math.pow(Math.max(strengthRatio, 1), 0.12)
    * Math.pow(extendedStrength, 0.16)
    * Math.pow(extremeStrength, 0.20);
  return {
    baseStrength,
    cursorScale,
    strengthRatio,
    extendedStrength,
    extremeStrength,
    overdrive,
    highStrengthScale,
    stepStrengthScale,
    strength,
    wakeLengthScale,
    squareRootStrength: Math.sqrt(Math.max(strength, 0)),
  };
}

function particleEditorScale(definition: ParticleValueControlDefinition): number {
  return definition.editorScale ?? 1;
}

function particleEditorNumber(definition: ParticleValueControlDefinition, value: number): number {
  return Number((value * particleEditorScale(definition)).toFixed(8));
}

function bilingualLabelMarkup(zh: string, en: string, className = "cle-bilingual-label"): string {
  return `
    <span class="${className}">
      <span class="cle-bilingual-label-zh" lang="zh-CN">${zh}</span>
      <span class="cle-bilingual-label-en" lang="en">${en}</span>
    </span>
  `;
}

function backgroundSettingsText(language: BackgroundSettingsLanguage, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function backgroundSettingsError(
  error: string | undefined,
  language: BackgroundSettingsLanguage,
  pluginZh: string,
  pluginEn: string,
): string {
  if (!error) return "";
  return language === "zh" ? `${pluginZh}错误：${error}` : `${pluginEn} error: ${error}`;
}

function backgroundLanguageSwitchMarkup(id: string): string {
  return `
    <label class="background-language-switch" for="${id}" title="使用英文参数标签 / Use English parameter labels">
      <span class="background-language-option" data-language-option="zh" lang="zh-CN">中文</span>
      <input class="background-language-toggle" id="${id}" type="checkbox" role="switch" aria-label="使用英文参数标签 / Use English parameter labels">
      <span class="background-language-option" data-language-option="en" lang="en">EN</span>
    </label>
  `;
}

function particleOutputAriaLabel(
  definition: ParticleValueControlDefinition,
  formattedValue: string,
  language: BackgroundSettingsLanguage = "zh",
): string {
  return language === "zh"
    ? `编辑${definition.labelZh}数值，当前值为 ${formattedValue}。`
    : `Edit ${definition.label} value. Current value ${formattedValue}.`;
}

function clampParticleNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function clampParticleUnitInterval(value: unknown, fallback = 0): number {
  return clampParticleNumber(value, 0, 1, fallback);
}

function normalizeParticleMorphCurve(value: unknown): ParticleMorphCurve {
  const source: Record<string, unknown> = Array.isArray(value)
    ? { nodes: value }
    : value && typeof value === "object"
      ? value as Record<string, unknown>
      : DEFAULT_PARTICLE_MORPH_CURVE as unknown as Record<string, unknown>;
  let x1 = clampParticleUnitInterval(source.x1, DEFAULT_PARTICLE_MORPH_CURVE.x1);
  let y1 = clampParticleUnitInterval(source.y1, DEFAULT_PARTICLE_MORPH_CURVE.y1);
  let x2 = clampParticleUnitInterval(source.x2, DEFAULT_PARTICLE_MORPH_CURVE.x2);
  let y2 = clampParticleUnitInterval(source.y2, DEFAULT_PARTICLE_MORPH_CURVE.y2);
  if (x1 > x2) [x1, x2] = [x2, x1];
  if (y1 > y2) [y1, y2] = [y2, y1];

  const candidates: ParticleMorphCurveNode[] = [];
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  for (const rawNode of rawNodes) {
    let rawTime: unknown;
    let rawProgress: unknown;
    if (Array.isArray(rawNode)) {
      rawTime = rawNode[0];
      rawProgress = rawNode[1];
    } else if (rawNode && typeof rawNode === "object") {
      const node = rawNode as Record<string, unknown>;
      rawTime = node.time ?? node.x;
      rawProgress = node.progress ?? node.y;
    } else {
      continue;
    }
    const time = Number(rawTime);
    const progress = Number(rawProgress);
    if (!Number.isFinite(time) || !Number.isFinite(progress)) continue;
    candidates.push({
      time: clampParticleUnitInterval(time),
      progress: clampParticleUnitInterval(progress),
    });
  }
  candidates.sort((first, second) => first.time - second.time || first.progress - second.progress);

  const nodes: ParticleMorphCurveNode[] = [];
  let previousTime = 0;
  let previousProgress = 0;
  for (const candidate of candidates) {
    if (
      candidate.time <= PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.time >= 1 - PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.progress <= PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.progress >= 1 - PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.time <= previousTime + PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.progress <= previousProgress + PARTICLE_MORPH_CURVE_NODE_EPSILON
    ) continue;
    nodes.push(candidate);
    previousTime = candidate.time;
    previousProgress = candidate.progress;
    if (nodes.length >= MAX_PARTICLE_MORPH_CURVE_NODES) break;
  }
  return { x1, y1, x2, y2, nodes };
}

function cloneParticleMorphCurve(curve: ParticleMorphCurve): ParticleMorphCurve {
  return {
    x1: curve.x1,
    y1: curve.y1,
    x2: curve.x2,
    y2: curve.y2,
    nodes: curve.nodes.map((node) => ({ time: node.time, progress: node.progress })),
  };
}

function particleMorphCurvesMatch(first: ParticleMorphCurve, second: ParticleMorphCurve, tolerance = 0.002): boolean {
  if (
    Math.abs(first.x1 - second.x1) > tolerance
    || Math.abs(first.y1 - second.y1) > tolerance
    || Math.abs(first.x2 - second.x2) > tolerance
    || Math.abs(first.y2 - second.y2) > tolerance
    || first.nodes.length !== second.nodes.length
  ) return false;
  return first.nodes.every((node, index) => {
    const comparison = second.nodes[index];
    return Boolean(
      comparison
      && Math.abs(node.time - comparison.time) <= tolerance
      && Math.abs(node.progress - comparison.progress) <= tolerance
    );
  });
}

function particleCubicBezierCoordinate(parameter: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * inverse * parameter * firstControl
    + 3 * inverse * parameter * parameter * secondControl
    + parameter * parameter * parameter;
}

function particleCubicBezierDerivative(parameter: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * inverse * firstControl
    + 6 * inverse * parameter * (secondControl - firstControl)
    + 3 * parameter * parameter * (1 - secondControl);
}

function particleMonotoneEndpointSlope(
  firstSpan: number,
  secondSpan: number,
  firstSecant: number,
  secondSecant: number,
): number {
  if (!(firstSecant > 0)) return 0;
  const slope = (
    (2 * firstSpan + secondSpan) * firstSecant - firstSpan * secondSecant
  ) / Math.max(firstSpan + secondSpan, PARTICLE_MORPH_CURVE_NODE_EPSILON);
  if (!Number.isFinite(slope) || slope <= 0 || firstSecant * secondSecant <= 0) return 0;
  return Math.min(slope, 3 * firstSecant);
}

interface ParticleMorphCurveSegments {
  readonly anchors: readonly ParticleMorphCurveNode[];
  readonly spans: readonly number[];
  readonly slopes: readonly number[];
}

const particleMorphCurveSegmentCache = new WeakMap<ParticleMorphCurve, ParticleMorphCurveSegments>();

function getParticleMorphCurveSegments(curve: ParticleMorphCurve): ParticleMorphCurveSegments {
  const cached = particleMorphCurveSegmentCache.get(curve);
  if (cached) return cached;
  const anchors: ParticleMorphCurveNode[] = [
    { time: 0, progress: 0 },
    ...curve.nodes,
    { time: 1, progress: 1 },
  ];
  const spans: number[] = [];
  const secants: number[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index];
    const end = anchors[index + 1];
    if (!start || !end) continue;
    const span = Math.max(end.time - start.time, PARTICLE_MORPH_CURVE_NODE_EPSILON);
    spans.push(span);
    secants.push(Math.max(0, end.progress - start.progress) / span);
  }

  const slopes = new Array<number>(anchors.length).fill(0);
  if (secants.length === 1) {
    slopes[0] = secants[0] ?? 0;
    slopes[1] = secants[0] ?? 0;
  } else if (secants.length > 1) {
    const firstSecant = secants[0] ?? 0;
    const secondSecant = secants[1] ?? firstSecant;
    const startHandleSlope = curve.x1 > PARTICLE_MORPH_CURVE_NODE_EPSILON
      ? curve.y1 / curve.x1
      : Number.NaN;
    const endHandleSpan = 1 - curve.x2;
    const endHandleSlope = endHandleSpan > PARTICLE_MORPH_CURVE_NODE_EPSILON
      ? (1 - curve.y2) / endHandleSpan
      : Number.NaN;
    slopes[0] = Number.isFinite(startHandleSlope)
      ? Math.min(Math.max(0, startHandleSlope), 3 * firstSecant)
      : particleMonotoneEndpointSlope(spans[0] ?? 1, spans[1] ?? 1, firstSecant, secondSecant);
    for (let index = 1; index < anchors.length - 1; index += 1) {
      const previousSecant = secants[index - 1] ?? 0;
      const nextSecant = secants[index] ?? 0;
      if (previousSecant <= 0 || nextSecant <= 0) {
        slopes[index] = 0;
        continue;
      }
      const previousSpan = spans[index - 1] ?? 1;
      const nextSpan = spans[index] ?? 1;
      const weightA = 2 * nextSpan + previousSpan;
      const weightB = nextSpan + 2 * previousSpan;
      slopes[index] = (weightA + weightB) / (weightA / previousSecant + weightB / nextSecant);
    }
    const lastSecantIndex = secants.length - 1;
    const lastAnchorIndex = anchors.length - 1;
    const lastSecant = secants[lastSecantIndex] ?? 0;
    const previousLastSecant = secants[lastSecantIndex - 1] ?? lastSecant;
    slopes[lastAnchorIndex] = Number.isFinite(endHandleSlope)
      ? Math.min(Math.max(0, endHandleSlope), 3 * lastSecant)
      : particleMonotoneEndpointSlope(
          spans[lastSecantIndex] ?? 1,
          spans[lastSecantIndex - 1] ?? 1,
          lastSecant,
          previousLastSecant,
        );
  }
  const segments = { anchors, spans, slopes };
  particleMorphCurveSegmentCache.set(curve, segments);
  return segments;
}

interface ParticleMorphCurveEvaluation {
  readonly value: number;
  readonly slope: number;
  readonly parameter: number;
}

function evaluateParticleMorphCurve(
  progress: number,
  curve: ParticleMorphCurve = DEFAULT_PARTICLE_MORPH_CURVE,
): ParticleMorphCurveEvaluation {
  const time = clampParticleUnitInterval(progress);
  if (time <= 0) return { value: 0, slope: 0, parameter: 0 };
  if (time >= 1) return { value: 1, slope: 0, parameter: 1 };
  if (curve.nodes.length) {
    const { anchors, spans, slopes } = getParticleMorphCurveSegments(curve);
    let segmentIndex = 0;
    while (
      segmentIndex < spans.length - 1
      && time > (anchors[segmentIndex + 1]?.time ?? 1)
    ) segmentIndex += 1;
    const start = anchors[segmentIndex] ?? anchors[0] ?? { time: 0, progress: 0 };
    const end = anchors[segmentIndex + 1] ?? anchors.at(-1) ?? { time: 1, progress: 1 };
    const span = spans[segmentIndex] ?? 1;
    const local = Math.min(1, Math.max(0, (time - start.time) / span));
    const local2 = local * local;
    const local3 = local2 * local;
    const h00 = 2 * local3 - 3 * local2 + 1;
    const h10 = local3 - 2 * local2 + local;
    const h01 = -2 * local3 + 3 * local2;
    const h11 = local3 - local2;
    const startSlope = slopes[segmentIndex] ?? 0;
    const endSlope = slopes[segmentIndex + 1] ?? 0;
    const value = Math.min(end.progress, Math.max(
      start.progress,
      h00 * start.progress + h10 * span * startSlope + h01 * end.progress + h11 * span * endSlope,
    ));
    const derivative = (6 * local2 - 6 * local) * start.progress / span
      + (3 * local2 - 4 * local + 1) * startSlope
      + (-6 * local2 + 6 * local) * end.progress / span
      + (3 * local2 - 2 * local) * endSlope;
    return {
      value: clampParticleUnitInterval(value),
      slope: Math.min(8, Math.max(0, Number.isFinite(derivative) ? derivative : 0)),
      parameter: local,
    };
  }

  let parameter = time;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const error = particleCubicBezierCoordinate(parameter, curve.x1, curve.x2) - time;
    const derivative = particleCubicBezierDerivative(parameter, curve.x1, curve.x2);
    if (Math.abs(error) < 0.00001 || Math.abs(derivative) < 0.00001) break;
    parameter = Math.min(1, Math.max(0, parameter - error / derivative));
  }
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const x = particleCubicBezierCoordinate(parameter, curve.x1, curve.x2);
    if (Math.abs(x - time) < 0.00001) break;
    if (x < time) lower = parameter;
    else upper = parameter;
    parameter = 0.5 * (lower + upper);
  }
  const value = clampParticleUnitInterval(particleCubicBezierCoordinate(parameter, curve.y1, curve.y2));
  const xDerivative = particleCubicBezierDerivative(parameter, curve.x1, curve.x2);
  const yDerivative = particleCubicBezierDerivative(parameter, curve.y1, curve.y2);
  const slope = xDerivative > 0.00001 ? Math.min(8, Math.max(0, yDerivative / xDerivative)) : 0;
  return { value, slope, parameter };
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

function normalizeParticleImageTransform(value: unknown): ParticleImageTransform {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    positionX: normalizeSteppedParticleNumber(record.positionX, 0, 100, 1, DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionX, 0),
    positionY: normalizeSteppedParticleNumber(record.positionY, 0, 100, 1, DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionY, 0),
    zoom: normalizeSteppedParticleNumber(record.zoom, 0.25, 4, 0.05, DEFAULT_PARTICLE_IMAGE_TRANSFORM.zoom, 2),
  };
}

function applyParticleImageTransform(image: HTMLImageElement, value: ParticleImageTransform): void {
  const transform = normalizeParticleImageTransform(value);
  const position = `${transform.positionX}% ${transform.positionY}%`;
  image.style.setProperty("object-position", position, "important");
  image.style.setProperty("transform-origin", position, "important");
  image.style.setProperty("transform", `scale(${transform.zoom})`, "important");
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
    morphCurve: normalizeParticleMorphCurve(record.morphCurve),
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

function normalizeBlackHoleColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

function normalizeBlackHoleSettings(value: unknown): BlackHoleBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS;
  return {
    distance: clampParticleNumber(record.distance, 10, 40, defaults.distance),
    elevation: clampParticleNumber(record.elevation, -30, 30, defaults.elevation),
    azimuth: clampParticleNumber(record.azimuth, -180, 180, defaults.azimuth),
    orbitSpeed: clampParticleNumber(record.orbitSpeed, -8, 8, defaults.orbitSpeed),
    roll: clampParticleNumber(record.roll, -45, 45, defaults.roll),
    fov: clampParticleNumber(record.fov, 25, 75, defaults.fov),
    diskInner: clampParticleNumber(record.diskInner, 1.2, 6, defaults.diskInner),
    diskOuter: clampParticleNumber(record.diskOuter, 8, 24, defaults.diskOuter),
    diskThickness: clampParticleNumber(record.diskThickness, 0.05, 0.8, defaults.diskThickness),
    diskDensity: clampParticleNumber(record.diskDensity, 0.1, 2, defaults.diskDensity),
    brightness: clampParticleNumber(record.brightness, 0.2, 2, defaults.brightness),
    spinSpeed: clampParticleNumber(record.spinSpeed, 0, 0.2, defaults.spinSpeed),
    grain: clampParticleNumber(record.grain, 0.1, 1.2, defaults.grain),
    doppler: clampParticleNumber(record.doppler, 0, 1, defaults.doppler),
    hotColor: normalizeBlackHoleColor(record.hotColor, defaults.hotColor),
    midColor: normalizeBlackHoleColor(record.midColor, defaults.midColor),
    coolColor: normalizeBlackHoleColor(record.coolColor, defaults.coolColor),
    starBrightness: clampParticleNumber(record.starBrightness, 0, 2, defaults.starBrightness),
    glow: clampParticleNumber(record.glow, 0, 2, defaults.glow),
    exposure: clampParticleNumber(record.exposure, 0.25, 1.8, defaults.exposure),
    vignette: clampParticleNumber(record.vignette, 0, 1, defaults.vignette),
    steps: defaults.steps,
    resolution: defaults.resolution,
    maxDpr: defaults.maxDpr,
    paused: defaults.paused,
  };
}

function readBlackHoleBackgroundSettings(): BlackHoleBackgroundSettings {
  try {
    return normalizeBlackHoleSettings(JSON.parse(localStorage.getItem(BLACK_HOLE_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS };
  }
}

function writeBlackHoleBackgroundSettings(settings: BlackHoleBackgroundSettings): void {
  try {
    localStorage.setItem(BLACK_HOLE_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

function normalizeGlowHorizonColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

function normalizeGlowHorizonSettings(value: unknown): GlowHorizonBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS;
  const variant = record.variant === "bottom" || record.variant === "left" || record.variant === "right"
    ? record.variant
    : defaults.variant;
  return {
    variant,
    inertialWheel: typeof record.inertialWheel === "boolean" ? record.inertialWheel : defaults.inertialWheel,
    openingDuration: clampParticleNumber(record.openingDuration, 0.8, 4, defaults.openingDuration),
    wheelSensitivity: clampParticleNumber(record.wheelSensitivity, 0.35, 1.8, defaults.wheelSensitivity),
    wheelDownIntensity: clampParticleNumber(record.wheelDownIntensity, 0, 2, defaults.wheelDownIntensity),
    wheelUpIntensity: clampParticleNumber(record.wheelUpIntensity, 0, 4, defaults.wheelUpIntensity),
    wheelTravelScale: clampParticleNumber(record.wheelTravelScale, 0.65, 1.6, defaults.wheelTravelScale),
    wheelDownDistance: clampParticleNumber(record.wheelDownDistance, 20, 100, defaults.wheelDownDistance),
    wheelUpDistance: clampParticleNumber(record.wheelUpDistance, 3, 36, defaults.wheelUpDistance),
    wheelUpTrailDistance: clampParticleNumber(record.wheelUpTrailDistance, 4, 42, defaults.wheelUpTrailDistance),
    wheelUpTrailStrength: clampParticleNumber(record.wheelUpTrailStrength, 0, 2, defaults.wheelUpTrailStrength),
    wheelUpStiffness: clampParticleNumber(record.wheelUpStiffness, 180, 900, defaults.wheelUpStiffness),
    wheelUpDamping: clampParticleNumber(record.wheelUpDamping, 18, 48, defaults.wheelUpDamping),
    wheelReleaseDelay: clampParticleNumber(record.wheelReleaseDelay, 40, 220, defaults.wheelReleaseDelay),
    wheelUpReleaseDelay: clampParticleNumber(record.wheelUpReleaseDelay, 40, 240, defaults.wheelUpReleaseDelay),
    maxReleaseVelocity: clampParticleNumber(record.maxReleaseVelocity, 0.8, 5, defaults.maxReleaseVelocity),
    returnStiffness: clampParticleNumber(record.returnStiffness, 60, 180, defaults.returnStiffness),
    returnDamping: clampParticleNumber(record.returnDamping, 10, 30, defaults.returnDamping),
    initialStretch: clampParticleNumber(record.initialStretch, 1, 1.8, defaults.initialStretch),
    initialBlur: clampParticleNumber(record.initialBlur, 0, 30, defaults.initialBlur),
    rimColor: normalizeGlowHorizonColor(record.rimColor, defaults.rimColor),
    violetColor: normalizeGlowHorizonColor(record.violetColor, defaults.violetColor),
    blueColor: normalizeGlowHorizonColor(record.blueColor, defaults.blueColor),
    shadowColor: normalizeGlowHorizonColor(record.shadowColor, defaults.shadowColor),
  };
}

function readGlowHorizonBackgroundSettings(): GlowHorizonBackgroundSettings {
  try {
    return normalizeGlowHorizonSettings(JSON.parse(localStorage.getItem(GLOW_HORIZON_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS };
  }
}

function writeGlowHorizonBackgroundSettings(settings: GlowHorizonBackgroundSettings): void {
  try {
    localStorage.setItem(GLOW_HORIZON_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
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
      const owner = lease.owner === PARTICLE_BACKGROUND_PLUGIN_ID
        || lease.owner === BLACK_HOLE_BACKGROUND_PLUGIN_ID
        || lease.owner === GLOW_HORIZON_BACKGROUND_PLUGIN_ID
        ? lease.owner
        : undefined;
      return owner
        ? { owner, previousPreference: lease.previousPreference, forcedPreference: "dark" }
        : { previousPreference: lease.previousPreference, forcedPreference: "dark" };
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

function transferParticleThemeLease(from: DarkBackgroundPluginId, to: DarkBackgroundPluginId): void {
  const lease = readParticleThemeLease();
  if (!lease) return;
  if (lease.owner === to) return;
  if (lease.owner && lease.owner !== from) {
    throw new Error("Another Code-Codex background owns the Dark appearance lease");
  }
  writeParticleThemeLease({
    owner: to,
    previousPreference: lease.previousPreference,
    forcedPreference: "dark",
  });
}

function clearParticleThemeLease(owner?: DarkBackgroundPluginId): void {
  try {
    const lease = readParticleThemeLease();
    if (owner && lease?.owner && lease.owner !== owner) return;
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
  uniform float u_transitionElapsed;
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
  // log(damping) / fixed simulation step, precomputed once when settings change.
  uniform float u_dampingRate;
  uniform float u_ambientCycle;
  uniform float u_cursorStrength;
  // x/y/z = highStrengthScale/stepStrengthScale/strength.
  uniform vec3 u_cursorStrengthScales;
  // x/y = wakeLengthScale/squareRootStrength; both are invariant per draw.
  uniform vec2 u_cursorStrengthDerived;

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
    float wakeProgressSquared = wakeProgress * wakeProgress;
    float wakeMetric = lateralOffset * lateralOffset / max(wakeWidthSquared, 1.0)
      + wakeProgressSquared * wakeProgressSquared;
    float rearBase = max(0.0, 1.0 - wakeMetric);
    float rearSupport = rearBase * rearBase * rearBase;
    float frontDistance = max(-trailDistance, 0.0);
    float frontLength = radius * 0.72;
    float frontMetric = frontDistance * frontDistance / max(frontLength * frontLength, 1.0)
      + lateralOffset * lateralOffset / max(radius * radius, 1.0);
    float frontBase = max(0.0, 1.0 - frontMetric);
    float frontSupport = frontBase * frontBase * frontBase;
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
    float decayRate = u_dampingRate;
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
    float influenceRadius
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
    float decay = exp(u_dampingRate * dt);
    vec2 nextVelocity = oldVelocity * decay;
    float flowResponse = 1.0 - exp(-5.2 * influence * u_cursorStrengthScales.z * dt);
    nextVelocity = mix(nextVelocity, driverVelocity, flowResponse);
    nextVelocity *= mix(1.0, 0.76, reversal * influence);
    nextVelocity += normal * driverSpeed
      * (0.85 * turn * curlEnvelope * u_cursorStrengthScales.z) * dt;
    nextVelocity += swirlDirection * driverSpeed
      * (0.48 * turn * curlEnvelope * u_cursorStrengthScales.z) * dt;
    nextVelocity += normal * driverSpeed
      * (0.025 * seededVariation * curlEnvelope * u_cursorStrengthScales.z) * dt;

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
      * u_cursorStrengthDerived.x;
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
    float wakeProgressSquared = wakeProgress * wakeProgress;
    float wakeMetric = lateralOffset * lateralOffset / max(wakeWidthSquared, 1.0)
      + wakeProgressSquared * wakeProgressSquared;
    float rearBase = max(0.0, 1.0 - wakeMetric);
    float rearSupport = rearBase * rearBase * rearBase;
    float frontLength = influenceRadius * 0.75;
    float frontMetric = upstream * upstream / max(frontLength * frontLength, 1.0)
      + lateralOffset * lateralOffset / max(influenceRadius * influenceRadius, 1.0);
    float frontBase = max(0.0, 1.0 - frontMetric);
    float frontSupport = frontBase * frontBase * frontBase;
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
    float inducedResponse = 1.0 - exp(-1.15 * u_cursorStrengthDerived.y * dt);
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
      float transitionElapsed = max(u_transitionElapsed, 0.0);
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
    ) * u_cursorStrengthScales.x;
    float maximumStep = clamp(motionReferenceRadius * 0.42, 8.0, 20.0)
      * u_cursorStrengthScales.y;

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
          influenceRadius
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

interface ParticleTransitionClock {
  readonly rawProgress: number;
  readonly elapsed: number;
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
    | "pointerCount" | "time" | "transitionElapsed" | "transitionNearResponse" | "transitionFarResponse"
    | "transitionStagger" | "transitionActive" | "transitionVisibility" | "dpr"
    | "particleSize" | "particleOpacity" | "speed" | "noiseScale" | "noiseStrength" | "dampingRate"
    | "ambientCycle" | "cursorStrength" | "cursorStrengthScales" | "cursorStrengthDerived",
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
  #imageWidth = 1;
  #imageHeight = 1;
  #imageTransform: ParticleImageTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
  #count = 0;
  #cssWidth = 1;
  #cssHeight = 1;
  #dpr = 1;
  #simulationTime = 12.4;
  #lastFrame = performance.now();
  #transitionStart = 0;
  #transitionDuration = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionTimelineDuration = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionCurve = cloneParticleMorphCurve(DEFAULT_PARTICLE_MORPH_CURVE);
  #transitionClockCacheTime = Number.NaN;
  #transitionClockCache: ParticleTransitionClock | undefined;
  #transitionMaxResponse = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionVelocityRatio = 0;
  #transitionActive = false;
  #transitionVisibility = 0;
  #transitionReleaseStart = -100;
  #transitionRevision = 0;
  #transitionResolve: ((completed: boolean) => void) | undefined;
  #imageRevision = 0;
  #settings: ParticleBackgroundSettings;
  #cursorStrengthValues: ParticleCursorStrengthValues;
  #viewportUniformsDirty = true;
  #layoutUniformDirty = true;
  #renderSettingsUniformsDirty = true;
  #transitionConstantsUniformsDirty = true;
  #transitionActiveUniformDirty = true;
  #transitionVisibilityUniformDirty = true;
  #transitionElapsedUniformDirty = true;
  #pointerGeometryUniformsDirty = true;
  #pointerCountUniformDirty = true;
  #cursorStrengthUniformsDirty = true;
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
    this.#cursorStrengthValues = calculateParticleCursorStrengthValues(settings.cursorStrength);
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
      transitionElapsed: this.#requiredUniform("u_transitionElapsed"),
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
      dampingRate: this.#requiredUniform("u_dampingRate"),
      ambientCycle: this.#requiredUniform("u_ambientCycle"),
      cursorStrength: this.#requiredUniform("u_cursorStrength"),
      cursorStrengthScales: this.#requiredUniform("u_cursorStrengthScales"),
      cursorStrengthDerived: this.#requiredUniform("u_cursorStrengthDerived"),
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
    // Attribute pointers retain their buffer association in this private context;
    // replacing buffer data does not require rebinding them for every draw.
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
    const previousSettings = this.#settings;
    const dprChanged = settings.dprCap !== previousSettings.dprCap;
    const cursorDisabled = previousSettings.cursorInteraction && !settings.cursorInteraction;
    const transitionDurationChanged = settings.morphIntervalSeconds !== previousSettings.morphIntervalSeconds;
    if (
      settings.particleSize !== previousSettings.particleSize
      || settings.particleOpacity !== previousSettings.particleOpacity
      || settings.speed !== previousSettings.speed
      || settings.noiseScale !== previousSettings.noiseScale
      || settings.noiseStrength !== previousSettings.noiseStrength
      || settings.damping !== previousSettings.damping
      || settings.ambientCycle !== previousSettings.ambientCycle
      || settings.cursorStrength !== previousSettings.cursorStrength
    ) {
      this.#renderSettingsUniformsDirty = true;
    }
    if (settings.cursorStrength !== previousSettings.cursorStrength) {
      this.#cursorStrengthValues = calculateParticleCursorStrengthValues(settings.cursorStrength);
      this.#cursorStrengthUniformsDirty = true;
    }
    this.#settings = settings;
    if (!this.#transitionActive) {
      this.#transitionDuration = settings.morphIntervalSeconds;
      if (transitionDurationChanged) this.#transitionConstantsUniformsDirty = true;
    }
    if (cursorDisabled) {
      this.#lastPointer = undefined;
      const tail = this.#pointerSegments.at(-1);
      if (tail) tail.sealed = true;
    }
    if (dprChanged) this.resize();
    else if (this.#paused) this.#draw(performance.now(), false);
  }

  setPreparedImage(image: PreparedParticleImage, transform: ParticleImageTransform): Promise<boolean> {
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
    this.#imageWidth = image.width;
    this.#imageHeight = image.height;
    this.#imageTransform = normalizeParticleImageTransform(transform);
    this.#count = image.targetCount;
    this.#transitionDuration = this.#settings.morphIntervalSeconds;
    this.#layoutUniformDirty = true;
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
    const transition = this.#beginTransition(canMorph, revision);
    if (this.#paused) this.#draw(performance.now(), false);
    return transition;
  }

  setImageTransform(transform: ParticleImageTransform): void {
    if (this.#disposed) return;
    const nextTransform = normalizeParticleImageTransform(transform);
    if (
      nextTransform.positionX === this.#imageTransform.positionX
      && nextTransform.positionY === this.#imageTransform.positionY
      && nextTransform.zoom === this.#imageTransform.zoom
    ) return;
    this.#imageTransform = nextTransform;
    this.#layoutUniformDirty = true;
    if (this.#paused) this.#draw(performance.now(), false);
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
    const cssWidth = Math.max(1, window.innerWidth);
    const cssHeight = Math.max(1, window.innerHeight);
    const dpr = Math.min(this.#settings.dprCap, Math.max(1, window.devicePixelRatio || 1));
    const cssSizeChanged = cssWidth !== this.#cssWidth || cssHeight !== this.#cssHeight;
    const dprChanged = dpr !== this.#dpr;
    this.#cssWidth = cssWidth;
    this.#cssHeight = cssHeight;
    this.#dpr = dpr;
    if (cssSizeChanged || dprChanged) this.#viewportUniformsDirty = true;
    if (cssSizeChanged) this.#layoutUniformDirty = true;
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    const drawingBufferChanged = this.#canvas.width !== width || this.#canvas.height !== height;
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    if (drawingBufferChanged) this.#gl.viewport(0, 0, width, height);
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

  #layout(imageWidth: number, imageHeight: number): readonly [number, number, number, number] {
    const containScale = Math.min(
      this.#cssWidth / Math.max(1, imageWidth),
      this.#cssHeight / Math.max(1, imageHeight),
    );
    const width = imageWidth * containScale * this.#imageTransform.zoom;
    const height = imageHeight * containScale * this.#imageTransform.zoom;
    return [
      (this.#cssWidth - width) * this.#imageTransform.positionX / 100,
      (this.#cssHeight - height) * this.#imageTransform.positionY / 100,
      width,
      height,
    ];
  }

  #transitionNearResponse(): number {
    return this.#transitionDuration * PARTICLE_BACKGROUND_MORPH_NEAR_RESPONSE_RATIO;
  }

  #transitionStagger(): number {
    return this.#transitionDuration * PARTICLE_BACKGROUND_MORPH_STAGGER_RATIO;
  }

  #calculateTransitionTimelineDuration(): number {
    const response = Math.max(this.#transitionMaxResponse, 0.1);
    const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / response;
    const carriedVelocity = Math.max(0, this.#transitionVelocityRatio);
    const settled = (springElapsed: number): boolean => {
      const springTime = omega * springElapsed;
      const decay = Math.exp(-springTime);
      const error = (1 + (1 + carriedVelocity) * springTime) * decay;
      const velocity = omega * (
        carriedVelocity + (1 + carriedVelocity) * springTime
      ) * decay;
      return error <= PARTICLE_BACKGROUND_MORPH_SETTLE_ERROR
        && velocity <= PARTICLE_BACKGROUND_MORPH_SETTLE_VELOCITY;
    };
    let lower = 0;
    let upper = response;
    for (let iteration = 0; iteration < 18 && !settled(upper); iteration += 1) upper *= 1.5;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = 0.5 * (lower + upper);
      if (settled(middle)) upper = middle;
      else lower = middle;
    }
    return Math.max(0.1, this.#transitionStagger() + upper);
  }

  #transitionClock(): ParticleTransitionClock {
    if (this.#transitionClockCache && this.#transitionClockCacheTime === this.#simulationTime) {
      return this.#transitionClockCache;
    }
    const duration = Math.max(0.1, this.#transitionTimelineDuration);
    const rawElapsed = Math.max(0, this.#simulationTime - this.#transitionStart);
    const rawProgress = this.#transitionActive
      ? Math.min(1, rawElapsed / duration)
      : 1;
    const curve = evaluateParticleMorphCurve(rawProgress, this.#transitionCurve);
    const clock = { rawProgress, elapsed: curve.value * duration };
    this.#transitionClockCacheTime = this.#simulationTime;
    this.#transitionClockCache = clock;
    return clock;
  }

  #transitionProgress(): number {
    if (!this.#transitionActive) return 1;
    return criticalParticleSpringProgress(
      this.#transitionClock().elapsed - this.#transitionStagger() * 0.35,
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
    const [x, y, width, height] = this.#layout(this.#imageWidth, this.#imageHeight);
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

    const elapsed = this.#transitionClock().elapsed;
    const stagger = this.#transitionStagger();
    const [x, y, width, height] = this.#layout(this.#imageWidth, this.#imageHeight);
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
      this.#previousVelocities[offset] = 0;
      this.#previousVelocities[offset + 1] = 0;
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
    const [x, y, width, height] = this.#layout(this.#imageWidth, this.#imageHeight);
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
    return this.#transitionClock().rawProgress >= 1;
  }

  #interruptTransition(): void {
    const resolve = this.#transitionResolve;
    this.#transitionResolve = undefined;
    this.#transitionRevision = 0;
    resolve?.(false);
  }

  #beginTransition(active: boolean, revision: number): Promise<boolean> {
    this.#transitionStart = this.#simulationTime;
    this.#transitionCurve = normalizeParticleMorphCurve(this.#settings.morphCurve);
    this.#transitionTimelineDuration = this.#calculateTransitionTimelineDuration();
    this.#transitionClockCacheTime = Number.NaN;
    this.#transitionClockCache = undefined;
    this.#transitionActive = active;
    this.#transitionVisibility = active ? 1 : 0;
    this.#transitionReleaseStart = -100;
    this.#transitionConstantsUniformsDirty = true;
    this.#transitionActiveUniformDirty = true;
    this.#transitionVisibilityUniformDirty = true;
    this.#transitionElapsedUniformDirty = true;
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
    this.#transitionClockCacheTime = Number.NaN;
    this.#transitionClockCache = undefined;
    this.#transitionVisibility = 1;
    this.#transitionReleaseStart = this.#simulationTime;
    this.#transitionActiveUniformDirty = true;
    this.#transitionVisibilityUniformDirty = true;
    this.#transitionElapsedUniformDirty = true;
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
    const visibility = 1 - smootherParticleTransition(
      elapsed / PARTICLE_BACKGROUND_MORPH_VISIBILITY_RELEASE_SECONDS,
    );
    if (visibility === this.#transitionVisibility) return;
    this.#transitionVisibility = visibility;
    this.#transitionVisibilityUniformDirty = true;
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
    const previousSegmentCount = this.#pointerSegments.length;
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
    const { cursorScale, overdrive, highStrengthScale } = this.#cursorStrengthValues;
    const targetSpeedLimit = 5_200 * highStrengthScale;
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
    this.#pointerGeometryUniformsDirty = true;
    if (this.#pointerSegments.length !== previousSegmentCount) this.#pointerCountUniformDirty = true;
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
        this.#pointerGeometryUniformsDirty = true;
        this.#pointerCountUniformDirty = true;
      }
      const pointerCount = this.#pointerSegments.length;
      if (this.#pointerGeometryUniformsDirty) this.#pointerSegmentValues.fill(0);
      if (pointerCount > 0) this.#pointerMotionValues.fill(0);
      for (let index = 0; index < this.#pointerSegments.length; index += 1) {
        const segment = this.#pointerSegments[index];
        if (!segment) continue;
        const segmentOffset = index * 4;
        if (this.#pointerGeometryUniformsDirty) {
          this.#pointerSegmentValues[segmentOffset] = segment.startX;
          this.#pointerSegmentValues[segmentOffset + 1] = segment.startY;
          this.#pointerSegmentValues[segmentOffset + 2] = segment.endX;
          this.#pointerSegmentValues[segmentOffset + 3] = segment.endY;
        }
        this.#pointerMotionValues[segmentOffset] = segment.velocityX;
        this.#pointerMotionValues[segmentOffset + 1] = segment.velocityY;
        this.#pointerMotionValues[segmentOffset + 2] = Math.max(0, time - segment.createdAt);
        this.#pointerMotionValues[segmentOffset + 3] = Math.max(0.001, segment.duration);
      }
      if (this.#viewportUniformsDirty) {
        gl.uniform2f(this.#uniforms.resolution, this.#cssWidth, this.#cssHeight);
        gl.uniform1f(this.#uniforms.dpr, this.#dpr);
        this.#viewportUniformsDirty = false;
      }
      if (this.#layoutUniformDirty) {
        const layout = this.#layout(this.#imageWidth, this.#imageHeight);
        gl.uniform4f(this.#uniforms.layout, layout[0], layout[1], layout[2], layout[3]);
        this.#layoutUniformDirty = false;
      }
      if (this.#pointerGeometryUniformsDirty) {
        if (pointerCount > 0) {
          gl.uniform4fv(this.#uniforms.pointerSegments, this.#pointerSegmentValues);
        }
        this.#pointerGeometryUniformsDirty = false;
      }
      if (this.#pointerCountUniformDirty) {
        gl.uniform1f(this.#uniforms.pointerCount, pointerCount);
        this.#pointerCountUniformDirty = false;
      }
      if (pointerCount > 0) {
        gl.uniform4fv(this.#uniforms.pointerMotion, this.#pointerMotionValues);
      }
      gl.uniform1f(this.#uniforms.time, time);
      if (this.#transitionActive || this.#transitionElapsedUniformDirty) {
        gl.uniform1f(this.#uniforms.transitionElapsed, this.#transitionClock().elapsed);
        this.#transitionElapsedUniformDirty = false;
      }
      if (this.#transitionConstantsUniformsDirty) {
        gl.uniform1f(this.#uniforms.transitionNearResponse, this.#transitionNearResponse());
        gl.uniform1f(this.#uniforms.transitionFarResponse, this.#transitionDuration);
        gl.uniform1f(this.#uniforms.transitionStagger, this.#transitionStagger());
        this.#transitionConstantsUniformsDirty = false;
      }
      if (this.#transitionActiveUniformDirty) {
        gl.uniform1f(this.#uniforms.transitionActive, this.#transitionActive ? 1 : 0);
        this.#transitionActiveUniformDirty = false;
      }
      if (this.#transitionVisibilityUniformDirty) {
        gl.uniform1f(this.#uniforms.transitionVisibility, this.#transitionVisibility);
        this.#transitionVisibilityUniformDirty = false;
      }
      if (this.#renderSettingsUniformsDirty) {
        gl.uniform1f(this.#uniforms.particleSize, this.#settings.particleSize);
        gl.uniform1f(this.#uniforms.particleOpacity, this.#settings.particleOpacity);
        gl.uniform1f(this.#uniforms.speed, this.#settings.speed);
        gl.uniform1f(this.#uniforms.noiseScale, this.#settings.noiseScale);
        gl.uniform1f(this.#uniforms.noiseStrength, this.#settings.noiseStrength);
        const damping = Math.min(0.9999, Math.max(0.8, this.#settings.damping));
        gl.uniform1f(
          this.#uniforms.dampingRate,
          Math.log(damping) / PARTICLE_BACKGROUND_FLOW_STEP_SECONDS,
        );
        gl.uniform1f(this.#uniforms.ambientCycle, this.#settings.ambientCycle);
        gl.uniform1f(this.#uniforms.cursorStrength, this.#settings.cursorStrength);
        this.#renderSettingsUniformsDirty = false;
      }
      if (this.#cursorStrengthUniformsDirty) {
        const cursorStrengthValues = this.#cursorStrengthValues;
        gl.uniform3f(
          this.#uniforms.cursorStrengthScales,
          cursorStrengthValues.highStrengthScale,
          cursorStrengthValues.stepStrengthScale,
          cursorStrengthValues.strength,
        );
        gl.uniform2f(
          this.#uniforms.cursorStrengthDerived,
          cursorStrengthValues.wakeLengthScale,
          cursorStrengthValues.squareRootStrength,
        );
        this.#cursorStrengthUniformsDirty = false;
      }
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
        ? request.result.filter((value): value is Omit<ParticleImageRecord, keyof ParticleImageTransform> & Partial<ParticleImageTransform> => {
          if (!value || typeof value !== "object") return false;
          const record = value as Partial<ParticleImageRecord>;
          return typeof record.id === "string"
            && typeof record.name === "string"
            && typeof record.type === "string"
            && typeof record.size === "number"
            && typeof record.createdAt === "number"
            && record.blob instanceof Blob
            && record.thumbnail instanceof Blob;
        }).map((record): ParticleImageRecord => ({
          ...record,
          ...normalizeParticleImageTransform(record),
        }))
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
  #imageTransformSaveError: string | undefined;
  #layer: HTMLDivElement | undefined;
  #previousImage: HTMLImageElement | undefined;
  #image: HTMLImageElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: ParticleImageRenderer | undefined;
  #preparationCache: ParticleImagePreparationCache | undefined;
  #currentSourceUrl: string | undefined;
  #previousSourceUrl: string | undefined;
  #currentSourceTransform: ParticleImageTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
  #previousSourceTransform: ParticleImageTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
  #sourceTransitioning = false;
  #sourceTransitionProgress = 1;
  #sourceTransitionOutgoingScale = 1;
  #editingImageId: string | null = null;
  #imageTransformEditingRevision = 0;
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
    return this.#imageTransformSaveError ?? this.#error;
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
      const initialId = this.#editingImageId && this.#records.some((record) => record.id === this.#editingImageId)
        ? this.#editingImageId
        : this.#validActiveImageId() ?? this.#settings.selectedImageIds[0] ?? null;
      if (initialId) await this.#activateImage(initialId);
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

  async disable(preserveTheme = false): Promise<void> {
    const pendingEnable = this.#enableOperation;
    this.#stoppedForExternalThemeChange = false;
    const hadPresentation = this.#enabled || this.#pending || Boolean(this.#layer);
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    if (hadPresentation) this.#teardownPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    try {
      if (!preserveTheme) await this.#restoreCodexAppearanceTheme();
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
        if (activeId) await this.#activateImage(activeId);
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
            ...DEFAULT_PARTICLE_IMAGE_TRANSFORM,
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
      if (this.#enabled && imported[0]) await this.#activateImage(imported[0].id);
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
    if (index < 0 && this.#enabled && !this.#editingImageId) await this.#activateImage(id);
    else this.#scheduleRotation();
  }

  async beginImageTransformEditing(id: string): Promise<boolean> {
    const revision = ++this.#imageTransformEditingRevision;
    await this.initialize();
    if (revision !== this.#imageTransformEditingRevision) return false;
    if (!this.#records.some((record) => record.id === id)) return false;
    this.#editingImageId = id;
    this.#stopRotation();
    if (!this.#enabled || this.#settings.activeImageId === id) return true;
    const activated = await this.#activateImage(id);
    if (revision !== this.#imageTransformEditingRevision) return false;
    if (!activated) {
      this.#editingImageId = null;
      this.#scheduleRotation();
    }
    return activated;
  }

  finishImageTransformEditing(): void {
    this.#imageTransformEditingRevision += 1;
    if (!this.#editingImageId) return;
    this.#editingImageId = null;
    this.#scheduleRotation();
  }

  previewImageTransform(id: string, value: ParticleImageTransform): void {
    if (!this.#enabled || this.#settings.activeImageId !== id) return;
    const transform = normalizeParticleImageTransform(value);
    this.#currentSourceTransform = transform;
    if (this.#image) applyParticleImageTransform(this.#image, transform);
    this.#renderer?.setImageTransform(transform);
  }

  async updateImageTransform(id: string, value: ParticleImageTransform): Promise<void> {
    await this.initialize();
    const index = this.#records.findIndex((record) => record.id === id);
    const record = this.#records[index];
    if (!record) return;
    const transform = normalizeParticleImageTransform(value);
    const updated: ParticleImageRecord = { ...record, ...transform };
    try {
      if (this.#database) await saveParticleImageRecord(this.#database, updated);
      this.#records = this.#records.map((candidate, candidateIndex) => candidateIndex === index ? updated : candidate);
      this.previewImageTransform(id, transform);
      this.#imageTransformSaveError = undefined;
    } catch (error) {
      this.previewImageTransform(id, record);
      this.#imageTransformSaveError = error instanceof Error ? error.message : "The photo framing could not be saved";
    }
    this.#notify();
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
      if (this.#editingImageId === id) this.#editingImageId = null;
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
        await this.#activateImage(this.#settings.activeImageId);
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

  async #activateImage(id: string): Promise<boolean> {
    if (!this.#enabled) return false;
    const record = this.#records.find((candidate) => candidate.id === id);
    if (!record) return false;
    this.#stopRotation();
    const generation = ++this.#generation;
    this.#pending = true;
    this.#notify();
    let activated = false;
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
      const transform = normalizeParticleImageTransform(record);
      const sourceReady = await this.#prepareSourceImage(prepared.processedBlob, transform, shouldMorph, generation);
      if (!sourceReady || !this.#enabled || generation !== this.#generation) return false;
      const transitioned = renderer ? await renderer.setPreparedImage(prepared, transform) : true;
      if (!transitioned || !this.#enabled || generation !== this.#generation) return false;
      this.#settings = normalizeParticleSettings({ ...this.#settings, activeImageId: id });
      writeParticleBackgroundSettings(this.#settings);
      this.#error = renderer ? undefined : this.#error;
      this.#prewarmNext(id);
      activated = true;
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
        if (activated) this.#scheduleRotation();
      }
    }
  }

  async #prepareSourceImage(
    processedBlob: Blob,
    transform: ParticleImageTransform,
    animate: boolean,
    generation: number,
  ): Promise<boolean> {
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
    let outgoingTransform = this.#currentSourceTransform;
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
      outgoingTransform = this.#previousSourceTransform;
      outgoingOpacity = previousOpacity;
    }

    image.style.transition = "none";
    previousImage.style.transition = "none";
    image.style.opacity = "0";
    this.#currentSourceUrl = nextUrl;
    this.#currentSourceTransform = normalizeParticleImageTransform(transform);
    image.src = nextUrl;
    applyParticleImageTransform(image, this.#currentSourceTransform);
    const visibleOpacity = this.#settings.showSourceImage ? this.#settings.imageOpacity : 0;
    if (animate && outgoingUrl) {
      this.#previousSourceUrl = outgoingUrl;
      this.#previousSourceTransform = outgoingTransform;
      previousImage.src = outgoingUrl;
      applyParticleImageTransform(previousImage, this.#previousSourceTransform);
      this.#sourceTransitionOutgoingScale = visibleOpacity > 0
        ? Math.min(1, Math.max(0, outgoingOpacity / visibleOpacity))
        : 1;
      this.#sourceTransitioning = true;
      this.#sourceTransitionProgress = 0;
      this.#updateSourceTransition(0, false);
    } else {
      this.#previousSourceUrl = undefined;
      this.#previousSourceTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
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
    this.#previousSourceTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
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
    applyParticleImageTransform(image, this.#currentSourceTransform);
    if (this.#sourceTransitioning) applyParticleImageTransform(previousImage, this.#previousSourceTransform);
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
    this.#currentSourceTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
    this.#previousSourceTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
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
      || Boolean(this.#editingImageId)
      || this.#pending
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
      void this.#activateImage(nextId);
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
    this.#currentSourceTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
    this.#previousSourceTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
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
    const owner = PARTICLE_BACKGROUND_PLUGIN_ID;
    let current: CodexAppearanceTheme;
    try {
      current = await readCodexAppearanceTheme();
    } catch (error) {
      if (codexDarkThemeApplied()) return;
      throw new Error("Codex Appearance is unavailable. Restart Codex with Code-Codex, then try again.", { cause: error });
    }

    const lease = readParticleThemeLease();
    if (current === "dark") {
      if (lease?.owner && lease.owner !== owner) {
        throw new Error("Another Code-Codex background is still using Dark mode");
      }
      if (lease && !lease.owner) {
        writeParticleThemeLease({ ...lease, owner });
      }
      if (!codexDarkThemeApplied()) await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
      return;
    }
    if (lease) {
      if (lease.owner && lease.owner !== owner) {
        throw new Error("Another Code-Codex background still owns the Dark appearance lease");
      }
      clearParticleThemeLease(owner);
      this.#stoppedForExternalThemeChange = true;
      throw new Error("Particle Image Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
    }

    writeParticleThemeLease({ owner, previousPreference: current, forcedPreference: "dark" });
    try {
      await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
    } catch (error) {
      try {
        await writeCodexAppearanceTheme(current);
        clearParticleThemeLease(owner);
      } catch {
        // Retain the lease so a later disable/startup can retry restoration.
      }
      throw new Error("Codex could not switch to Dark automatically.", { cause: error });
    }
  }

  async #restoreCodexAppearanceTheme(): Promise<void> {
    const owner = PARTICLE_BACKGROUND_PLUGIN_ID;
    const lease = readParticleThemeLease();
    if (!lease) return;
    if (lease.owner && lease.owner !== owner) return;
    const current = await readCodexAppearanceTheme();
    if (current !== lease.forcedPreference) {
      clearParticleThemeLease(owner);
      return;
    }
    await writeCodexAppearanceTheme(lease.previousPreference);
    clearParticleThemeLease(owner);
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
    clearParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID);
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

interface GlowHorizonRendererRuntime {
  readonly updateSettings: (settings: GlowHorizonBackgroundSettings) => void;
  readonly replay: () => void;
  readonly dispose: () => void;
}

interface GlowHorizonVariantGeometry {
  readonly axis: "x" | "y";
  readonly enter: number;
  readonly rest: number;
}

const GLOW_HORIZON_VARIANT_GEOMETRY: Readonly<Record<GlowHorizonVariant, GlowHorizonVariantGeometry>> = Object.freeze({
  top: { axis: "y", enter: -100, rest: -50 },
  bottom: { axis: "y", enter: 100, rest: 50 },
  left: { axis: "x", enter: 100, rest: 50 },
  right: { axis: "x", enter: -100, rest: -50 },
});

function glowHorizonWithAlpha(color: string, alpha: number): string {
  const value = color.replace("#", "");
  const expanded = value.length === 3
    ? value.split("").map((character) => character + character).join("")
    : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return color;
  return `#${expanded}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0")}`;
}

function glowHorizonClamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function glowHorizonEase(value: number): number {
  // Close to the source component's [0.16, 1, 0.3, 1] ease-out curve,
  // evaluated without pulling Framer Motion into the injected bundle.
  const t = glowHorizonClamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
}

function glowHorizonNormalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function glowHorizonInsideControls(event: WheelEvent): boolean {
  if (event.target instanceof Element && event.target.closest("[data-glow-horizon-controls]")) return true;
  return event.composedPath().some((entry) => (
    entry instanceof Element && Boolean(entry.closest("[data-glow-horizon-controls]"))
  ));
}

function glowHorizonElementVisible(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  return bounds.bottom > 0
    && bounds.top < window.innerHeight
    && bounds.right > 0
    && bounds.left < window.innerWidth;
}

function startGlowHorizonRenderer(
  layer: HTMLElement,
  readSettings: () => GlowHorizonBackgroundSettings,
): GlowHorizonRendererRuntime {
  const horizon = layer.querySelector<HTMLElement>(".code-codex-glow-horizon-horizon");
  if (!horizon) throw new Error("Glow Horizon presentation is missing its horizon layer");
  const arcs = Array.from(horizon.querySelectorAll<HTMLElement>("[data-glow-horizon-arc]"));
  const trails = Array.from(horizon.querySelectorAll<HTMLElement>("[data-glow-horizon-trail]"));
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reducedMotionQuery.matches;
  let settings = normalizeGlowHorizonSettings(readSettings());
  let progress = reducedMotion ? 1 : 0;
  let velocity = 0;
  let springing = false;
  let openingActive = !reducedMotion;
  let springTarget = 1;
  let springMode: "up" | "return" = "return";
  let smoothingWheelUp = false;
  let openingStartedAt = performance.now();
  let lastFrameAt = openingStartedAt;
  let lastWheelAt = 0;
  let wheelVelocity = 0;
  let wheelTarget = progress;
  let wheelReleaseTimer: number | undefined;
  let animationFrame = 0;
  let running = true;

  // Keep the animation loop allocation-free. These specifications are static;
  // only their color and animated transform/opacity values change per frame.
  const arcSpecs = [
    { scale: 1.32, initialOffset: undefined, delay: 1.20, blur: 0 },
    { scale: 1.20, initialOffset: 10, delay: 0.60, blur: 31 },
    { scale: 1.24, initialOffset: 10, delay: 0, blur: 21 },
    { scale: 1.20, initialOffset: 10, delay: 0, blur: 51 },
  ] as const;
  const trailSpecs = [
    { distance: .20, opacity: .82, blur: .5, width: 2.5 },
    { distance: .45, opacity: .56, blur: 2, width: 3.5 },
    { distance: .72, opacity: .34, blur: 4, width: 5 },
    { distance: 1, opacity: .18, blur: 7, width: 7 },
  ] as const;
  const styleCache = new WeakMap<HTMLElement, Map<string, string>>();
  const setStyle = (element: HTMLElement, property: string, value: string): void => {
    let values = styleCache.get(element);
    if (!values) {
      values = new Map<string, string>();
      styleCache.set(element, values);
    }
    if (values.get(property) === value) return;
    values.set(property, value);
    element.style.setProperty(property, value);
  };

  const setAxisTransform = (element: HTMLElement, amount: number, scale: number): void => {
    const geometry = GLOW_HORIZON_VARIANT_GEOMETRY[settings.variant];
    const translate = geometry.axis === "x" ? `translateX(${amount}%)` : `translateY(${amount}%)`;
    const scaleTransform = geometry.axis === "x" ? `scaleX(${scale})` : `scaleY(${scale})`;
    setStyle(element, "transform", `${translate} ${scaleTransform}`);
  };

  const setAxisUniformTransform = (element: HTMLElement, amount: number, scale: number): void => {
    const geometry = GLOW_HORIZON_VARIANT_GEOMETRY[settings.variant];
    const translate = geometry.axis === "x" ? `translateX(${amount}%)` : `translateY(${amount}%)`;
    setStyle(element, "transform", `${translate} scale(${scale})`);
  };

  const render = (): void => {
    const geometry = GLOW_HORIZON_VARIANT_GEOMETRY[settings.variant];
    const clampedProgress = glowHorizonClamp(progress, 0, 1);
    const overscroll = glowHorizonClamp((progress - 1) / 0.2, 0, 1);
    const axisAmount = progress <= 1
      ? geometry.enter + (geometry.rest - geometry.enter) * progress
      : geometry.rest + Math.sign(geometry.rest - geometry.enter) * settings.wheelUpDistance * overscroll;
    const axisScale = settings.initialStretch + (1 - settings.initialStretch) * clampedProgress;
    setStyle(horizon, "opacity", String(clampedProgress));
    setStyle(horizon, "filter", `blur(${Math.max(0, settings.initialBlur * (1 - clampedProgress))}px)`);
    setStyle(horizon, "isolation", "isolate");
    setStyle(horizon, "will-change", "transform, opacity, filter");
    setAxisTransform(horizon, axisAmount, axisScale);

    const arcDirection = geometry.enter < 0 ? -1 : 1;
    for (let index = 0; index < arcs.length; index += 1) {
      const arc = arcs[index];
      const spec = arcSpecs[index];
      if (!arc || !spec) continue;
      // The source component staggers these layers against its fixed two-second
      // opening timeline. Keep that visual rhythm even when the user changes
      // the overall opening duration control.
      const delayProgress = Math.min(spec.delay / 2, .95);
      const arcProgress = glowHorizonClamp((progress - delayProgress) / Math.max(1 - delayProgress, .001), 0, 1);
      const startOffset = spec.initialOffset === undefined
        ? 0
        : arcDirection * Math.abs(spec.initialOffset - 50);
      const arcOffset = startOffset * (1 - arcProgress);
      const color = index === 0
        ? settings.rimColor
        : index === 1
          ? settings.violetColor
          : index === 2
            ? settings.blueColor
            : settings.shadowColor;
      const shadow = index === 0
        ? `0 -4px 23px ${glowHorizonWithAlpha(settings.rimColor, .71)}`
        : "";
      setStyle(arc, "background", color);
      setStyle(arc, "box-shadow", shadow);
      setStyle(arc, "filter", spec.blur > 0 ? `blur(${spec.blur}px)` : "");
      setStyle(arc, "will-change", "transform");
      setAxisUniformTransform(arc, arcOffset, spec.scale);
    }
    for (let index = 0; index < trails.length; index += 1) {
      const trail = trails[index];
      const spec = trailSpecs[index];
      if (!trail || !spec) continue;
      const amount = 1 - (1 - overscroll) ** 2;
      const direction = geometry.enter < 0 ? -1 : 1;
      const offset = direction * settings.wheelUpTrailDistance * spec.distance * amount;
      setStyle(trail, "opacity", String(overscroll > .0001
        ? glowHorizonClamp(Math.sqrt(overscroll) * settings.wheelUpTrailStrength * spec.opacity, 0, 1)
        : 0));
      setStyle(trail, "visibility", settings.inertialWheel && overscroll > .0001 ? "visible" : "hidden");
      setStyle(trail, "border", `${spec.width}px solid ${glowHorizonWithAlpha(settings.violetColor, .92)}`);
      setStyle(trail, "box-shadow", `0 0 ${14 + spec.blur * 3}px ${glowHorizonWithAlpha(settings.violetColor, .82)}, inset 0 0 ${10 + spec.blur * 2}px ${glowHorizonWithAlpha(settings.violetColor, .58)}`);
      setStyle(trail, "filter", `blur(${spec.blur}px)`);
      setStyle(trail, "will-change", "transform, opacity");
      setAxisUniformTransform(trail, offset, 1.32);
    }
  };

  const schedule = (): void => {
    if (!running || animationFrame) return;
    animationFrame = requestAnimationFrame(tick);
  };

  const finishWheel = (): void => {
    if (!running) return;
    // Framer Motion carries the gesture velocity into the release spring. Keep
    // the same behavior for a downward rewind; otherwise the horizon stops
    // dead and the return feels like a snap instead of an inertial release.
    const releaseVelocity = smoothingWheelUp
      ? velocity
      : glowHorizonClamp(wheelVelocity, -settings.maxReleaseVelocity, settings.maxReleaseVelocity);
    springTarget = 1;
    springMode = "return";
    velocity = releaseVelocity;
    springing = true;
    schedule();
  };

  const handleWheel = (event: WheelEvent): void => {
    if (!running || reducedMotion || !settings.inertialWheel || glowHorizonInsideControls(event)) return;
    const host = horizon.parentElement;
    if (!host || !glowHorizonElementVisible(host)) return;
    const pixelDelta = glowHorizonNormalizeWheelDelta(event);
    if (Math.abs(pixelDelta) < .01) return;
    const now = performance.now();
    const elapsed = lastWheelAt ? Math.max((now - lastWheelAt) / 1000, 1 / 120) : 1 / 60;
    const travel = Math.min(960, Math.max(560, window.innerHeight * 1.05)) * settings.wheelTravelScale;
    const rawDelta = (-pixelDelta / Math.max(1, travel)) * settings.wheelSensitivity;
    const upward = rawDelta > 0;
    const delta = rawDelta * (upward ? settings.wheelUpIntensity : settings.wheelDownIntensity);
    if (Math.abs(delta) < .000001) return;
    const inputVelocity = delta / elapsed;
    const freshGesture = now - lastWheelAt > settings.wheelReleaseDelay * 2;
    const blended = freshGesture ? velocity * .2 + inputVelocity * .8 : wheelVelocity * .55 + inputVelocity * .45;
    wheelVelocity = glowHorizonClamp(blended, -settings.maxReleaseVelocity, settings.maxReleaseVelocity);
    openingActive = false;
    smoothingWheelUp = upward;
    if (upward) {
      const base = freshGesture ? progress : wheelTarget;
      springTarget = glowHorizonClamp(base + delta, 0, 1.2);
      velocity = glowHorizonClamp(velocity, -settings.maxReleaseVelocity, settings.maxReleaseVelocity);
      springMode = "up";
      springing = true;
    } else {
      const lower = Math.min(progress, 1 - glowHorizonClamp(settings.wheelDownDistance, 0, 100) / 100);
      progress = glowHorizonClamp(progress + delta, lower, 1.2);
      springTarget = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
    }
    wheelTarget = upward ? springTarget : progress;
    lastWheelAt = now;
    if (wheelReleaseTimer !== undefined) window.clearTimeout(wheelReleaseTimer);
    wheelReleaseTimer = window.setTimeout(finishWheel, upward ? settings.wheelUpReleaseDelay : settings.wheelReleaseDelay);
    // Wheel/trackpad events can arrive several times between two display
    // frames. Keep every physics update, but commit the resulting styles only
    // once in the scheduled animation frame.
    schedule();
  };

  function tick(now: number): void {
    animationFrame = 0;
    if (!running) return;
    const dt = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    if (!reducedMotion) {
      if (openingActive && !springing && progress < 1) {
        const openingProgress = glowHorizonClamp((now - openingStartedAt) / (Math.max(.05, settings.openingDuration) * 1000), 0, 1);
        const nextProgress = glowHorizonEase(openingProgress);
        velocity = dt > 0 ? (nextProgress - progress) / dt : 0;
        progress = nextProgress;
        if (openingProgress >= 1) {
          openingActive = false;
          springTarget = 1;
          springMode = "return";
        }
      } else if (springing) {
        const stiffness = springMode === "up" ? settings.wheelUpStiffness : settings.returnStiffness;
        const damping = springMode === "up" ? settings.wheelUpDamping : settings.returnDamping;
        const acceleration = (springTarget - progress) * stiffness - velocity * damping;
        velocity += acceleration * dt;
        progress += velocity * dt;
        if (Math.abs(springTarget - progress) < .0008 && Math.abs(velocity) < .004) {
          progress = springTarget;
          velocity = 0;
          springing = false;
        }
      }
    } else {
      progress = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      openingActive = false;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    }
    render();
    // A downward rewind can intentionally leave progress below 1 while the
    // release timer is waiting. Do not spin an idle RAF loop in that state;
    // the timer will schedule the return spring when input ends.
    if (running && (openingActive || springing)) schedule();
  }

  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      progress = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      openingActive = false;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    } else {
      openingStartedAt = performance.now();
      progress = 0;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      openingActive = true;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    }
    render();
    schedule();
  };

  window.addEventListener("wheel", handleWheel, { passive: true });
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);
  const updateSettings = (next: GlowHorizonBackgroundSettings): void => {
    settings = normalizeGlowHorizonSettings(next);
    render();
    schedule();
  };
  const replay = (): void => {
    if (reducedMotion) {
      progress = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      wheelVelocity = 0;
      lastWheelAt = 0;
      openingActive = false;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    } else {
      progress = 0;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      wheelVelocity = 0;
      lastWheelAt = 0;
      openingActive = true;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
      openingStartedAt = performance.now();
      lastFrameAt = openingStartedAt;
    }
    render();
    schedule();
  };
  const dispose = (): void => {
    if (!running) return;
    running = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    if (wheelReleaseTimer !== undefined) window.clearTimeout(wheelReleaseTimer);
    window.removeEventListener("wheel", handleWheel);
    reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
  };
  render();
  schedule();
  return { updateSettings, replay, dispose };
}

class GlowHorizonRenderer {
  readonly #runtime: GlowHorizonRendererRuntime;
  #settings: GlowHorizonBackgroundSettings;

  constructor(layer: HTMLElement, settings: GlowHorizonBackgroundSettings) {
    this.#settings = normalizeGlowHorizonSettings(settings);
    this.#runtime = startGlowHorizonRenderer(layer, () => this.#settings);
  }

  updateSettings(settings: GlowHorizonBackgroundSettings): void {
    this.#settings = normalizeGlowHorizonSettings(settings);
    this.#runtime.updateSettings(this.#settings);
  }

  replay(): void {
    this.#runtime.replay();
  }

  dispose(): void {
    this.#runtime.dispose();
  }
}

class GlowHorizonBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readGlowHorizonBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #renderer: GlowHorizonRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() {
    window.addEventListener("pagehide", this.#onPageHide, { once: true });
  }

  get settings(): GlowHorizonBackgroundSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Glow Horizon Background is unavailable");
  }

  async enable(): Promise<void> {
    const generation = this.#generation;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally {
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
      layer.dataset.codeCodexGlowHorizonLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      const horizon = document.createElement("div");
      horizon.className = "code-codex-glow-horizon-horizon";
      const arcSpecs = [
        { color: this.#settings.rimColor, shadow: true },
        { color: this.#settings.violetColor },
        { color: this.#settings.blueColor },
        { color: this.#settings.shadowColor },
      ];
      for (const spec of arcSpecs) {
        const arc = document.createElement("div");
        arc.dataset.glowHorizonArc = "";
        arc.style.position = "absolute";
        arc.style.inset = "0";
        arc.style.borderRadius = "100%";
        arc.style.pointerEvents = "none";
        arc.style.background = spec.color;
        if (spec.shadow) arc.style.boxShadow = `0 -4px 23px ${glowHorizonWithAlpha(spec.color, .71)}`;
        horizon.append(arc);
      }
      for (let index = 0; index < 4; index += 1) {
        const trail = document.createElement("div");
        trail.dataset.glowHorizonTrail = "";
        trail.style.position = "absolute";
        trail.style.inset = "0";
        trail.style.borderRadius = "100%";
        trail.style.pointerEvents = "none";
        trail.style.mixBlendMode = "screen";
        trail.style.visibility = "hidden";
        horizon.append(trail);
      }
      layer.append(horizon);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#renderer = new GlowHorizonRenderer(layer, this.#settings);
      document.documentElement.toggleAttribute(GLOW_HORIZON_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY, "#050507");
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Glow Horizon Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Keep activation error. */ }
      throw error;
    } finally {
      this.#pending = false;
      this.#notify();
    }
  }

  async disable(preserveTheme = false): Promise<void> {
    const pendingEnable = this.#enableOperation;
    this.#stoppedForExternalThemeChange = false;
    const hadPresentation = this.#enabled || this.#pending || Boolean(this.#layer);
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    if (hadPresentation) this.#teardownPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    try {
      if (!preserveTheme) await this.#restoreCodexAppearanceTheme();
      this.#error = undefined;
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The previous Codex Appearance could not be restored";
    }
    this.#notify();
  }

  updateSettings(next: GlowHorizonBackgroundSettings): void {
    this.#settings = normalizeGlowHorizonSettings(next);
    writeGlowHorizonBackgroundSettings(this.#settings);
    this.#renderer?.updateSettings(this.#settings);
    this.#notify();
  }

  reset(): void { this.updateSettings(DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS); }
  replay(): void { this.#renderer?.replay(); }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#teardownPresentation();
    this.#listeners.clear();
    window.removeEventListener("pagehide", this.#onPageHide);
  }

  #teardownPresentation(): void {
    this.#codexThemeObserver?.disconnect();
    this.#codexThemeObserver = undefined;
    this.#codexThemeMonitorGeneration += 1;
    window.clearTimeout(this.#codexThemePreferenceTimer);
    this.#codexThemePreferenceTimer = 0;
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#layer?.remove();
    this.#layer = undefined;
    document.documentElement.toggleAttribute(GLOW_HORIZON_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = GLOW_HORIZON_BACKGROUND_PLUGIN_ID;
    let current: CodexAppearanceTheme;
    try { current = await readCodexAppearanceTheme(); }
    catch (error) {
      if (codexDarkThemeApplied()) return;
      throw new Error("Codex Appearance is unavailable. Restart Codex with Code-Codex, then try again.", { cause: error });
    }
    const lease = readParticleThemeLease();
    if (current === "dark") {
      if (lease?.owner && lease.owner !== owner) throw new Error("Another Code-Codex background is still using Dark mode");
      if (lease && !lease.owner) writeParticleThemeLease({ ...lease, owner });
      if (!codexDarkThemeApplied()) await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
      return;
    }
    if (lease) {
      if (lease.owner && lease.owner !== owner) throw new Error("Another Code-Codex background still owns the Dark appearance lease");
      clearParticleThemeLease(owner);
      this.#stoppedForExternalThemeChange = true;
      throw new Error("Glow Horizon Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
    }
    writeParticleThemeLease({ owner, previousPreference: current, forcedPreference: "dark" });
    try {
      await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
    } catch (error) {
      try { await writeCodexAppearanceTheme(current); clearParticleThemeLease(owner); } catch { /* Retain lease for retry. */ }
      throw new Error("Codex could not switch to Dark automatically.", { cause: error });
    }
  }

  async #restoreCodexAppearanceTheme(): Promise<void> {
    const owner = GLOW_HORIZON_BACKGROUND_PLUGIN_ID;
    const lease = readParticleThemeLease();
    if (!lease || (lease.owner && lease.owner !== owner)) return;
    const current = await readCodexAppearanceTheme();
    if (current !== lease.forcedPreference) { clearParticleThemeLease(owner); return; }
    await writeCodexAppearanceTheme(lease.previousPreference);
    clearParticleThemeLease(owner);
  }

  #observeCodexTheme(): void {
    this.#codexThemeObserver?.disconnect();
    this.#codexThemeObserver = new MutationObserver(() => {
      if (!this.#enabled || codexDarkThemeApplied()) return;
      this.#stopForExternalThemeChange();
    });
    this.#codexThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
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
      if (preference !== "dark") { this.#stopForExternalThemeChange(); return; }
    } catch { /* Transient bridge failure does not tear down presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }

  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Glow Horizon Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }

  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const GLOW_HORIZON_BACKGROUND_CONTROLLER = Symbol.for("code-codex:glow-horizon-background-controller:v1");

function getGlowHorizonBackgroundController(): GlowHorizonBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[GLOW_HORIZON_BACKGROUND_CONTROLLER];
  if (existing instanceof GlowHorizonBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace stale controller. */ }
  }
  const controller = new GlowHorizonBackgroundController();
  globalState[GLOW_HORIZON_BACKGROUND_CONTROLLER] = controller;
  return controller;
}

const BLACK_HOLE_VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const BLACK_HOLE_SCENE_FRAGMENT_SHADER = `
precision highp float;

#define MAX_STEPS __MAX_STEPS__
#define HAS_FIXED_STEPS __HAS_FIXED_STEPS__
#define HAS_STARS __HAS_STARS__

varying vec2 vUv;

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform vec3  uRight;
uniform vec3  uUp;
uniform vec3  uFwd;
uniform float uTanHalf;
uniform vec2  uFocus;
#if HAS_FIXED_STEPS == 0
uniform float uSteps;
#endif
uniform float uSkyR;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uThick;
uniform float uDensity;
uniform float uSpin;
// x/y/z/w = first wind phase/second wind phase/blend/spin time offset.
uniform vec4  uWind;
uniform float uGrain;
uniform float uBright;
uniform float uDoppler;
uniform vec3  uHot;
uniform vec3  uMid;
uniform vec3  uCool;
#if HAS_STARS
uniform float uStars;
#endif
uniform float uEncode;
uniform vec2  uJitter;
uniform float uSeed;

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm(vec3 p, float lod) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i != 3 || lod > 0.0) {
      s += (i == 3 ? a * lod : a) * vnoise(p);
    }
    p = p * 2.03 + vec3(11.3, 7.1, 3.7);
    a *= 0.5;
  }
  return s;
}

void gasAt(
  vec3 p,
  float rd,
  float dt,
  float diskSpanInverse,
  out float dens,
  out vec3 tint,
  out float heat
) {
  float rn = clamp((rd - uDiskIn) * diskSpanInverse, 0.0, 1.0);
  float tk = uThick * (0.35 + 1.25 * rn);
  float v = p.y / tk;
  float sheet = exp(-v * v);
  float q = uDiskIn / rd;
  float inner = smoothstep(0.0, 0.07, rn);
  float outer = 1.0 - smoothstep(0.45, 1.0, rn);
  float prof = inner * outer * q * q;
  if (sheet * prof * uDensity * 10.0 <= 0.001) {
    dens = 0.0;
    tint = vec3(0.0);
    heat = 0.0;
    return;
  }

  float lod = clamp(1.0 - dt * uGrain * 14.0, 0.0, 1.0);
  float phi = atan(p.z, p.x);
  float omega = uSpin * pow(q, 1.5);
  float lr = log(rd) * 1.1 + uWind.w;

  float cloudsA = fbm(vec3(vec2(cos(phi + omega * uWind.x),
                                sin(phi + omega * uWind.x)) * (rd * uGrain), lr), lod);
  float cloudsB = fbm(vec3(vec2(cos(phi + omega * uWind.y),
                                sin(phi + omega * uWind.y)) * (rd * uGrain), lr + 40.0), lod);
  float clouds = mix(cloudsA, cloudsB, uWind.z);
  float filaments = clouds * clouds * 1.75;
  dens = max(0.0, filaments * 1.5 - 0.30) * sheet * prof * uDensity * 4.6;

  if (dens <= 0.001) {
    tint = vec3(0.0);
    heat = 0.0;
    return;
  }

  heat = pow(q, 0.8) * (0.72 + 0.55 * clouds);
  tint = mix(uCool, uMid, smoothstep(0.10, 0.52, heat));
  tint = mix(tint, uHot, smoothstep(0.52, 1.05, heat));
}

#if HAS_STARS
vec3 starField(vec3 d) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z)      { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z)               { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else                               { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }

  vec3 col = vec3(0.0);
  float octaveScale = 1.0;
  for (int k = 0; k < 3; k++) {
    float sc = 90.0 * octaveScale;
    vec2 p = uv * sc;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = hash13(vec3(id, face * 19.0));
    if (h > 0.965) {
      vec2 off = vec2(hash13(vec3(id, face + 11.0)), hash13(vec3(id, face + 23.0)));
      float dd = length(f - (off - 0.5) * 0.7);
      float s = smoothstep(0.055, 0.0, dd);
      float warm = hash13(vec3(id, face + 51.0));
      col += s * (0.6 + 4.5 * fract(h * 97.0))
           * mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.72), warm)
           / octaveScale;
    }
    octaveScale *= 2.2;
  }
  col += vec3(0.013, 0.017, 0.030) * fbm(d * 2.6, 1.0);
  return col;
}
#endif

#if HAS_STARS == 0
bool missesVisibleDisc(vec3 origin, vec3 direction) {
  // Test a deliberately expanded cylinder around the emitting gas. Rays that
  // miss both this volume and the central strong-lensing zone cannot
  // contribute visible light, so they can skip the expensive integration.
  float cullOuter = uDiskOut * 1.16 + 0.65;
  float cullHalfThickness = uThick * 6.5 + 0.35;
  if (length(origin.xz) <= cullOuter + 0.5) return false;

  vec2 radialOrigin = origin.xz;
  vec2 radialDirection = direction.xz;
  float a = dot(radialDirection, radialDirection);
  float b = dot(radialOrigin, radialDirection);
  float c = dot(radialOrigin, radialOrigin) - cullOuter * cullOuter;
  float discriminant = b * b - a * c;
  bool intersectsExpandedDisc = false;

  if (a > 0.00001 && discriminant >= 0.0) {
    float root = sqrt(discriminant);
    float nearTime = (-b - root) / a;
    float farTime = (-b + root) / a;
    if (farTime > 0.0) {
      nearTime = max(0.0, nearTime);
      float nearY = origin.y + direction.y * nearTime;
      float farY = origin.y + direction.y * farTime;
      intersectsExpandedDisc = min(nearY, farY) <= cullHalfThickness
                            && max(nearY, farY) >= -cullHalfThickness;
    }
  }

  float impactParameter = length(cross(origin, direction));
  float lensingRadius = min(cullOuter, max(8.0, uDiskIn * 1.8 + 1.0));
  return !intersectsExpandedDisc && impactParameter > lensingRadius;
}
#endif

void main() {
  vec2 uv = (gl_FragCoord.xy + uJitter - uFocus * uRes) / uRes.y;
  vec3 dir = normalize(uFwd + (uv.x * uRight + uv.y * uUp) * 2.0 * uTanHalf);
#if HAS_STARS == 0
  if (missesVisibleDisc(uCamPos, dir)) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
#endif
  vec3 pos = uCamPos;
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float h = sqrt(h2);
  float swept = 0.0;
  vec3 col = vec3(0.0);
  float transmit = 1.0;
#if HAS_STARS
  bool captured = false;
#endif
  float jitter = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  float diskSpanInverse = 1.0 / max(0.001, uDiskOut - uDiskIn);
  float diskStepRadius = uDiskOut * 1.25;
  float diskSampleHalfThickness = uThick * 5.0;

  for (int i = 0; i < MAX_STEPS; i++) {
#if HAS_FIXED_STEPS == 0
    if (float(i) >= uSteps) break;
#endif
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) {
#if HAS_STARS
      captured = true;
#endif
      break;
    }
    if (r > uSkyR && dot(pos, vel) > 0.0) break;
    if (transmit < 0.004) break;

    float dt = clamp(0.14 * (r - 1.0), 0.025, 1.1);
    if (r < diskStepRadius) {
      float rn = clamp((r - uDiskIn) * diskSpanInverse, 0.0, 1.0);
      float tk = uThick * (0.35 + 1.25 * rn);
      dt = min(dt, max(tk * 0.38, abs(pos.y) * 0.5));
    }

    swept += h * dt / r2;
    jitter = fract(jitter + 0.6180339887);
    float sampleStep = dt * jitter;
    float midY = pos.y + vel.y * sampleStep;
    if (abs(midY) < diskSampleHalfThickness) {
      vec2 midXZ = pos.xz + vel.xz * sampleStep;
      float rd = length(midXZ);
      if (rd > uDiskIn && rd < uDiskOut) {
        vec3 mid = vec3(midXZ.x, midY, midXZ.y);
        float dens;
        float heat;
        vec3 tint;
        gasAt(mid, rd, dt, diskSpanInverse, dens, tint, heat);
        if (dens > 0.001) {
          float deep = exp(-1.3 * max(0.0, swept - 4.6));
          vec3 tang = vec3(mid.z, 0.0, -mid.x) / rd;
          float beta = min(0.85, sqrt(0.5 / max(rd, 1.5)));
          float gam = inversesqrt(max(1e-4, 1.0 - beta * beta));
          vec3 toObs = -normalize(vel);
          float g = 1.0 / (gam * (1.0 - beta * dot(tang, toObs)));
          g *= sqrt(max(0.05, 1.0 - 1.0 / rd));
          float boost = pow(max(g, 0.02), 3.0 * uDoppler);
          vec3 shift = mix(
            vec3(1.0),
            g > 1.0 ? vec3(0.86, 0.94, 1.14) : vec3(1.15, 0.82, 0.62),
            clamp(abs(g - 1.0) * 1.6, 0.0, 1.0) * uDoppler
          );
          float emit = uBright * (0.26 + 2.0 * heat * heat);
          col += tint * shift * (emit * boost * dens * transmit * dt * deep);
          transmit *= exp(-dens * 0.30 * dt);
        }
      }
    }

    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    vel += acc * dt;
    pos += vel * dt;
  }

#if HAS_STARS
  if (!captured && uStars > 0.001) {
    vec3 toHole = normalize(-uCamPos);
    float sI = length(cross(normalize(dir), toHole));
    float sS = length(cross(normalize(vel), toHole));
    float stretch = clamp(sI / max(1e-3, sS), 1.0, 40.0);
    col += starField(normalize(vel)) * uStars * transmit / stretch;
  }
#endif

  if (uEncode > 0.5) col = col / (1.0 + col);
  gl_FragColor = vec4(col, 1.0);
}
`;

function blackHoleSceneFragmentSource(starsEnabled: boolean, fixedSteps: number | null = null): string {
  return BLACK_HOLE_SCENE_FRAGMENT_SHADER
    .replace("__MAX_STEPS__", fixedSteps === null ? "460" : String(fixedSteps))
    .replace("__HAS_FIXED_STEPS__", fixedSteps === null ? "0" : "1")
    .replace("__HAS_STARS__", starsEnabled ? "1" : "0");
}

const BLACK_HOLE_BLEND_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uAlpha;
void main() {
  vec3 c = texture2D(uCur, vUv).rgb;
  vec3 p = texture2D(uPrev, vUv).rgb;
  gl_FragColor = vec4(mix(p, c, uAlpha), 1.0);
}
`;

const BLACK_HOLE_BRIGHT_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uDecode;
uniform float uPack;
uniform float uThreshold;
void main() {
  vec3 s = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  s *= 0.25;
  if (uDecode > 0.5) s = s / max(vec3(0.002), 1.0 - s);
  float l = max(s.r, max(s.g, s.b));
  s *= max(0.0, l - uThreshold) / max(0.0001, l);
  gl_FragColor = vec4(s * uPack, 1.0);
}
`;

const BLACK_HOLE_BLUR_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 0.2270270;
  s += (texture2D(uTex, vUv + uStep * 1.3846154).rgb
      + texture2D(uTex, vUv - uStep * 1.3846154).rgb) * 0.3162162;
  s += (texture2D(uTex, vUv + uStep * 3.2307692).rgb
      + texture2D(uTex, vUv - uStep * 3.2307692).rgb) * 0.0702702;
  gl_FragColor = vec4(s, 1.0);
}
`;

const BLACK_HOLE_COMPOSITE_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uDecode;
uniform float uPack;
uniform float uGlow;
uniform float uExposure;
uniform float uVignette;
uniform float uScrimDir;
uniform float uScrimAmt;
uniform float uSeed;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  if (uDecode > 0.5) scene = scene / max(vec3(0.002), 1.0 - scene);
  vec3 bloom = texture2D(uBloom, vUv).rgb / uPack;
  vec3 c = scene + bloom * uGlow;
  c = aces(c * uExposure);
  c = pow(max(c, 0.0), vec3(0.4545));
  vec2 d = vUv - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 1.9;
  if (uScrimDir > 0.5) {
    float x = uScrimDir < 1.5 ? vUv.x
            : uScrimDir < 2.5 ? 1.0 - vUv.x
            : uScrimDir < 3.5 ? 1.0 - vUv.y
            : vUv.y;
    c *= 1.0 - uScrimAmt * pow(1.0 - clamp(x, 0.0, 1.0), 2.4);
  }
  float n = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

interface BlackHoleProgram {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

interface BlackHoleRenderTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

interface BlackHoleRendererRuntime {
  readonly invalidate: (sceneChanged: boolean, sizeChanged: boolean) => void;
  readonly dispose: () => void;
}

const BLACK_HOLE_FOCUS: readonly [number, number] = Object.freeze([0.72, 0.46]);
const BLACK_HOLE_RADIANS = Math.PI / 180;

function blackHoleHexToLinear(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  const complete = value.length === 3
    ? value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2)
    : value.slice(0, 6);
  const number = Number.parseInt(complete, 16);
  const srgb = [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
  return srgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)) as [number, number, number];
}

function blackHoleSceneSignature(settings: BlackHoleBackgroundSettings): string {
  return [
    settings.distance,
    settings.elevation,
    settings.azimuth,
    settings.orbitSpeed,
    settings.roll,
    settings.fov,
    settings.diskInner,
    settings.diskOuter,
    settings.diskThickness,
    settings.diskDensity,
    settings.brightness,
    settings.spinSpeed,
    settings.grain,
    settings.doppler,
    settings.hotColor,
    settings.midColor,
    settings.coolColor,
    settings.starBrightness,
    settings.steps,
  ].join("|");
}

function blackHoleSizeSignature(settings: BlackHoleBackgroundSettings): string {
  return `${settings.resolution}|${settings.maxDpr}`;
}

function startBlackHoleRenderer(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  readSettings: () => BlackHoleBackgroundSettings,
  onError: (message?: string) => void,
): BlackHoleRendererRuntime {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reducedMotion.matches;
  const contextOptions: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  };
  const gl = (canvas.getContext("webgl2", contextOptions) || canvas.getContext("webgl", contextOptions)) as
    | WebGL2RenderingContext
    | WebGLRenderingContext
    | null;
  let reportedFailure: string | undefined;
  const giveUp = (reason: string, message: string): void => {
    host.dataset.webgl = reason;
    canvas.hidden = true;
    if (reportedFailure !== message) {
      reportedFailure = message;
      onError(message);
    }
  };
  if (!gl) {
    const message = "WebGL is unavailable; Black Hole Background could not be rendered.";
    giveUp("unsupported", message);
    throw new Error(message);
  }

  interface DebugRendererInfo { readonly UNMASKED_RENDERER_WEBGL: number }
  interface HalfFloatExtension { readonly HALF_FLOAT_OES: number }
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as DebugRendererInfo | null;
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "") : "";
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|software|microsoft basic/i.test(rendererName);
  const webGl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  const maxTextureSize = Math.max(2, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096);
  const viewportDimensions = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | number[] | null;
  const maxViewportWidth = Math.max(2, Number(viewportDimensions?.[0]) || maxTextureSize);
  const maxViewportHeight = Math.max(2, Number(viewportDimensions?.[1]) || maxTextureSize);
  const maxRenderWidth = Math.min(maxTextureSize, maxViewportWidth);
  const maxRenderHeight = Math.min(maxTextureSize, maxViewportHeight);

  const compileShader = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("black-hole: shader compilation failed", gl.getShaderInfoLog(shader) || "no log");
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const linkProgram = (fragmentSource: string): BlackHoleProgram | null => {
    const vertexShader = compileShader(gl.VERTEX_SHADER, BLACK_HOLE_VERTEX_SHADER);
    if (!vertexShader) return null;
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      return null;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("black-hole: program link failed", gl.getProgramInfoLog(program) || "no log");
      gl.deleteProgram(program);
      return null;
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index += 1) {
      const info = gl.getActiveUniform(program, index);
      if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  };

  let hdr = true;
  let textureType: number = gl.UNSIGNED_BYTE;
  let internalFormat: number = gl.RGBA;
  if (webGl2) {
    const gl2 = gl as WebGL2RenderingContext;
    const supported = gl2.getExtension("EXT_color_buffer_half_float") || gl2.getExtension("EXT_color_buffer_float");
    if (supported) {
      textureType = gl2.HALF_FLOAT;
      internalFormat = gl2.RGBA16F;
    } else {
      hdr = false;
    }
  } else {
    const halfFloat = gl.getExtension("OES_texture_half_float") as HalfFloatExtension | null;
    const colorBuffer = gl.getExtension("EXT_color_buffer_half_float");
    if (halfFloat && colorBuffer) textureType = halfFloat.HALF_FLOAT_OES;
    else hdr = false;
  }
  if (!hdr) {
    textureType = gl.UNSIGNED_BYTE;
    internalFormat = gl.RGBA;
  }
  const linearFiltering = webGl2 || Boolean(gl.getExtension("OES_texture_half_float_linear")) || !hdr;
  let textureFilter = linearFiltering ? gl.LINEAR : gl.NEAREST;
  let bloomPack = hdr ? 1 : 0.12;

  const createTarget = (width: number, height: number): BlackHoleRenderTarget | null => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, textureType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      return null;
    }
    return { framebuffer, texture, width, height };
  };

  let sceneProgram: BlackHoleProgram | null = null;
  let starSceneProgram: BlackHoleProgram | null = null;
  let starSceneUnavailable = false;
  type StepVariant = { readonly program: BlackHoleProgram; lastUsed: number };
  const stepVariants = new Map<string, StepVariant>();
  const failedStepVariants = new Set<string>();
  let stepVariantClock = 0;
  const maximumStepVariants = 6;
  let blendProgram: BlackHoleProgram | null = null;
  let brightProgram: BlackHoleProgram | null = null;
  let blurProgram: BlackHoleProgram | null = null;
  let compositeProgram: BlackHoleProgram | null = null;
  let vertexBuffer: WebGLBuffer | null = null;
  let sceneTarget: BlackHoleRenderTarget | null = null;
  let historyA: BlackHoleRenderTarget | null = null;
  let historyB: BlackHoleRenderTarget | null = null;
  let bloomA: BlackHoleRenderTarget | null = null;
  let bloomB: BlackHoleRenderTarget | null = null;
  let shownTarget: BlackHoleRenderTarget | null = null;
  let shownBloomTarget: BlackHoleRenderTarget | null = null;
  let settledFrames = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let activeProgram: WebGLProgram | null = null;
  let activeTextureUnit = -1;
  let viewportWidth = -1;
  let viewportHeight = -1;
  type PendingVariant = { readonly key: string; readonly stars: boolean; readonly steps: number };
  let pendingVariant: PendingVariant | null = null;
  let pendingVariantIdle: number | null = null;
  let pendingVariantTimer: number | null = null;
  let clock = reduced ? 6 : 0;
  let lastFrame = 0;
  let running = true;
  let inViewport = true;
  let documentVisible = !document.hidden;
  let contextReady = true;
  let allocationFailed = false;
  let animationFrame = 0;
  let needsScene = true;
  let needsComposite = true;
  let resizePending = false;
  let stillPassesRemaining = 16;
  let lastPaused = readSettings().paused || reduced;
  const sceneStaticSettings = new WeakMap<WebGLProgram, BlackHoleBackgroundSettings>();

  const effectiveSteps = (value: number): number => softwareRenderer ? 130 : Math.max(60, Math.min(460, Math.round(value)));
  const variantKey = (stars: boolean, steps: number): string => `${stars ? "stars" : "plain"}:${steps}`;
  const configureSceneProgram = (program: BlackHoleProgram): void => {
    gl.useProgram(program.program);
    gl.uniform1f(program.uniforms.uEncode ?? null, hdr ? 0 : 1);
    if (sceneWidth > 0 && sceneHeight > 0) gl.uniform2f(program.uniforms.uRes ?? null, sceneWidth, sceneHeight);
    gl.uniform2f(program.uniforms.uFocus ?? null, BLACK_HOLE_FOCUS[0], 1 - BLACK_HOLE_FOCUS[1]);
    activeProgram = null;
  };
  const cacheStepVariant = (key: string, program: BlackHoleProgram): void => {
    stepVariants.set(key, { program, lastUsed: ++stepVariantClock });
    while (stepVariants.size > maximumStepVariants) {
      let oldestKey: string | undefined;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [candidateKey, candidate] of stepVariants) {
        if (candidate.lastUsed < oldestUse) {
          oldestKey = candidateKey;
          oldestUse = candidate.lastUsed;
        }
      }
      if (!oldestKey) break;
      const evicted = stepVariants.get(oldestKey);
      stepVariants.delete(oldestKey);
      if (evicted) gl.deleteProgram(evicted.program.program);
    }
  };
  const clearStepVariants = (deletePrograms: boolean): void => {
    if (deletePrograms) {
      for (const variant of stepVariants.values()) gl.deleteProgram(variant.program.program);
    }
    stepVariants.clear();
    failedStepVariants.clear();
    stepVariantClock = 0;
  };
  const compileExactProgram = (stars: boolean, steps: number): BlackHoleProgram | null => {
    const key = variantKey(stars, steps);
    const cached = stepVariants.get(key);
    if (cached) {
      cached.lastUsed = ++stepVariantClock;
      return cached.program;
    }
    if (failedStepVariants.has(key)) return null;
    const program = linkProgram(blackHoleSceneFragmentSource(stars, steps));
    if (!program) {
      failedStepVariants.add(key);
      return null;
    }
    configureSceneProgram(program);
    cacheStepVariant(key, program);
    return program;
  };
  const cancelPendingVariant = (): void => {
    if (pendingVariantIdle !== null) {
      const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cancelIdle?.(pendingVariantIdle);
      pendingVariantIdle = null;
    }
    if (pendingVariantTimer !== null) {
      window.clearTimeout(pendingVariantTimer);
      pendingVariantTimer = null;
    }
    pendingVariant = null;
  };
  const queueExactProgram = (stars: boolean, steps: number): void => {
    const key = variantKey(stars, steps);
    if (stepVariants.has(key) || failedStepVariants.has(key)) return;
    pendingVariant = { key, stars, steps };
    if (pendingVariantIdle !== null || pendingVariantTimer !== null) return;
    const compilePending = (): void => {
      pendingVariantIdle = null;
      pendingVariantTimer = null;
      const request = pendingVariant;
      pendingVariant = null;
      if (!request || !running || !contextReady) return;
      if (!inViewport || !documentVisible) {
        pendingVariant = request;
        return;
      }
      const compiled = compileExactProgram(request.stars, request.steps);
      if (compiled) {
        const current = readSettings();
        const currentKey = variantKey(current.starBrightness > 0.001, effectiveSteps(current.steps));
        if (currentKey === request.key) {
          settledFrames = 0;
          needsScene = true;
          needsComposite = true;
          schedule();
        }
      }
      const nextRequest = pendingVariant as PendingVariant | null;
      if (nextRequest && running && contextReady) queueExactProgram(nextRequest.stars, nextRequest.steps);
    };
    const requestIdle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (requestIdle) pendingVariantIdle = requestIdle(compilePending, { timeout: 400 });
    else pendingVariantTimer = window.setTimeout(compilePending, 100);
  };
  const dynamicSceneProgram = (stars: boolean): BlackHoleProgram | null => {
    if (!stars) return sceneProgram;
    if (!starSceneProgram && !starSceneUnavailable) {
      starSceneProgram = linkProgram(blackHoleSceneFragmentSource(true));
      if (starSceneProgram) configureSceneProgram(starSceneProgram);
      else starSceneUnavailable = true;
    }
    return starSceneProgram ?? sceneProgram;
  };
  const selectSceneProgram = (stars: boolean, steps: number): BlackHoleProgram | null => {
    const exact = stepVariants.get(variantKey(stars, steps));
    if (exact) {
      exact.lastUsed = ++stepVariantClock;
      return exact.program;
    }
    queueExactProgram(stars, steps);
    return dynamicSceneProgram(stars);
  };
  const build = (): boolean => {
    cancelPendingVariant();
    clearStepVariants(true);
    sceneProgram = linkProgram(blackHoleSceneFragmentSource(false));
    starSceneProgram = null;
    starSceneUnavailable = false;
    blendProgram = linkProgram(BLACK_HOLE_BLEND_FRAGMENT_SHADER);
    brightProgram = linkProgram(BLACK_HOLE_BRIGHT_FRAGMENT_SHADER);
    blurProgram = linkProgram(BLACK_HOLE_BLUR_FRAGMENT_SHADER);
    compositeProgram = linkProgram(BLACK_HOLE_COMPOSITE_FRAGMENT_SHADER);
    if (!sceneProgram || !blendProgram || !brightProgram || !blurProgram || !compositeProgram) return false;
    configureSceneProgram(sceneProgram);
    gl.useProgram(blendProgram.program);
    gl.uniform1i(blendProgram.uniforms.uCur ?? null, 0);
    gl.uniform1i(blendProgram.uniforms.uPrev ?? null, 1);
    gl.useProgram(brightProgram.program);
    gl.uniform1i(brightProgram.uniforms.uTex ?? null, 0);
    gl.uniform1f(brightProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
    gl.uniform1f(brightProgram.uniforms.uPack ?? null, bloomPack);
    gl.uniform1f(brightProgram.uniforms.uThreshold ?? null, 0.85);
    gl.useProgram(blurProgram.program);
    gl.uniform1i(blurProgram.uniforms.uTex ?? null, 0);
    gl.useProgram(compositeProgram.program);
    gl.uniform1i(compositeProgram.uniforms.uScene ?? null, 0);
    gl.uniform1i(compositeProgram.uniforms.uBloom ?? null, 1);
    gl.uniform1f(compositeProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
    gl.uniform1f(compositeProgram.uniforms.uPack ?? null, bloomPack);
    activeProgram = null;
    activeTextureUnit = -1;
    viewportWidth = -1;
    viewportHeight = -1;
    vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const settings = readSettings();
    compileExactProgram(settings.starBrightness > 0.001, effectiveSteps(settings.steps));
    return true;
  };
  const dropTargets = (): void => {
    for (const target of [sceneTarget, historyA, historyB, bloomA, bloomB]) {
      if (!target) continue;
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    sceneTarget = historyA = historyB = bloomA = bloomB = null;
    shownTarget = shownBloomTarget = null;
    settledFrames = 0;
  };
  const destroyGpuResources = (): void => {
    dropTargets();
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
    vertexBuffer = null;
    for (const program of [sceneProgram, starSceneProgram, blendProgram, brightProgram, blurProgram, compositeProgram]) {
      if (program) gl.deleteProgram(program.program);
    }
    sceneProgram = starSceneProgram = blendProgram = brightProgram = blurProgram = compositeProgram = null;
    clearStepVariants(true);
  };
  const resize = (): boolean => {
    const rect = host.getBoundingClientRect();
    const settings = readSettings();
    const dpr = softwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, Math.max(1, settings.maxDpr));
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const scale = softwareRenderer ? 0.34 : Math.min(1, Math.max(0.4, settings.resolution));
    const requestedWidth = Math.max(2, Math.round(cssWidth * dpr));
    const requestedHeight = Math.max(2, Math.round(cssHeight * dpr));
    const gpuSizeScale = Math.min(1, maxRenderWidth / requestedWidth, maxRenderHeight / requestedHeight);
    const width = Math.max(2, Math.floor(requestedWidth * gpuSizeScale));
    const height = Math.max(2, Math.floor(requestedHeight * gpuSizeScale));
    const nextSceneWidth = Math.max(2, Math.round(width * scale));
    const nextSceneHeight = Math.max(2, Math.round(height * scale));
    if (
      width === canvasWidth
      && height === canvasHeight
      && nextSceneWidth === sceneWidth
      && nextSceneHeight === sceneHeight
      && sceneTarget
      && historyA
      && historyB
      && bloomA
      && bloomB
    ) return false;
    canvasWidth = width;
    canvasHeight = height;
    sceneWidth = nextSceneWidth;
    sceneHeight = nextSceneHeight;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    dropTargets();
    const bloomWidth = Math.max(2, sceneWidth >> 2);
    const bloomHeight = Math.max(2, sceneHeight >> 2);
    const allocateTargets = (): boolean => {
      sceneTarget = createTarget(sceneWidth, sceneHeight);
      historyA = createTarget(sceneWidth, sceneHeight);
      historyB = createTarget(sceneWidth, sceneHeight);
      bloomA = createTarget(bloomWidth, bloomHeight);
      bloomB = createTarget(bloomWidth, bloomHeight);
      return Boolean(sceneTarget && historyA && historyB && bloomA && bloomB);
    };
    let allocated = allocateTargets();
    if (!allocated && hdr) {
      dropTargets();
      hdr = false;
      textureType = gl.UNSIGNED_BYTE;
      internalFormat = gl.RGBA;
      textureFilter = gl.LINEAR;
      bloomPack = 0.12;
      allocated = allocateTargets();
    }
    if (!allocated || !sceneTarget || !historyA || !historyB || !bloomA || !bloomB) {
      dropTargets();
      canvasWidth = canvasHeight = sceneWidth = sceneHeight = 0;
      allocationFailed = true;
      giveUp("allocation-failed", "The GPU could not allocate the Black Hole Background render targets.");
      return false;
    }
    allocationFailed = false;
    canvas.hidden = false;
    host.dataset.webgl = "";
    if (reportedFailure) {
      reportedFailure = undefined;
      onError(undefined);
    }
    if (sceneProgram) configureSceneProgram(sceneProgram);
    if (starSceneProgram) configureSceneProgram(starSceneProgram);
    for (const variant of stepVariants.values()) configureSceneProgram(variant.program);
    if (brightProgram) {
      gl.useProgram(brightProgram.program);
      gl.uniform1f(brightProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
      gl.uniform1f(brightProgram.uniforms.uPack ?? null, bloomPack);
      gl.uniform2f(brightProgram.uniforms.uTexel ?? null, 1 / sceneWidth, 1 / sceneHeight);
    }
    if (compositeProgram) {
      gl.useProgram(compositeProgram.program);
      gl.uniform1f(compositeProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
      gl.uniform1f(compositeProgram.uniforms.uPack ?? null, bloomPack);
    }
    activeProgram = null;
    return true;
  };

  const pass = (program: BlackHoleProgram, target: BlackHoleRenderTarget | null): void => {
    if (activeProgram !== program.program) {
      gl.useProgram(program.program);
      activeProgram = program.program;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    const width = target?.width ?? canvasWidth;
    const height = target?.height ?? canvasHeight;
    if (viewportWidth !== width || viewportHeight !== height) {
      gl.viewport(0, 0, width, height);
      viewportWidth = width;
      viewportHeight = height;
    }
  };
  const draw = (): void => gl.drawArrays(gl.TRIANGLES, 0, 3);
  const bindTexture = (texture: WebGLTexture, unit: number): void => {
    if (activeTextureUnit !== unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      activeTextureUnit = unit;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };
  const halton: readonly (readonly [number, number])[] = [
    [0.5, 0.333], [0.25, 0.667], [0.75, 0.111], [0.125, 0.444],
    [0.625, 0.778], [0.375, 0.222], [0.875, 0.556], [0.0625, 0.889],
  ];
  type LinearColorCache = { source: string | null; value: [number, number, number] };
  const colorCache: Record<"hot" | "mid" | "cool", LinearColorCache> = {
    hot: { source: null, value: [0, 0, 0] },
    mid: { source: null, value: [0, 0, 0] },
    cool: { source: null, value: [0, 0, 0] },
  };
  const linearColor = (source: string, cache: LinearColorCache): [number, number, number] => {
    if (cache.source !== source) {
      cache.source = source;
      cache.value = blackHoleHexToLinear(source);
    }
    return cache.value;
  };

  const render = (time: number, includeScene = true, finishScene = true): void => {
    if (!sceneProgram || !blendProgram || !brightProgram || !blurProgram || !compositeProgram) return;
    const activeBlurProgram = blurProgram;
    if (!sceneTarget || !historyA || !historyB || !bloomA || !bloomB) return;
    const settings = readSettings();
    if (!includeScene && (!shownTarget || !shownBloomTarget)) return;

    if (includeScene) {
      const steps = effectiveSteps(settings.steps);
      const selectedSceneProgram = selectSceneProgram(settings.starBrightness > 0.001, steps);
      if (!selectedSceneProgram) return;
      const azimuth = (settings.azimuth + settings.orbitSpeed * time) * BLACK_HOLE_RADIANS;
      const elevation = Math.max(-88, Math.min(88, settings.elevation)) * BLACK_HOLE_RADIANS;
      const distance = Math.max(2.2, settings.distance);
      const cosineElevation = Math.cos(elevation);
      const cameraX = distance * cosineElevation * Math.cos(azimuth);
      const cameraY = distance * Math.sin(elevation);
      const cameraZ = distance * cosineElevation * Math.sin(azimuth);
      const forwardX = -cameraX / distance;
      const forwardY = -cameraY / distance;
      const forwardZ = -cameraZ / distance;
      let rightX = forwardZ;
      let rightY = 0;
      let rightZ = -forwardX;
      const rightLength = Math.hypot(rightX, rightY, rightZ) || 1;
      rightX /= rightLength;
      rightY /= rightLength;
      rightZ /= rightLength;
      const upX = rightY * forwardZ - rightZ * forwardY;
      const upY = rightZ * forwardX - rightX * forwardZ;
      const upZ = rightX * forwardY - rightY * forwardX;
      const cosineRoll = Math.cos(settings.roll * BLACK_HOLE_RADIANS);
      const sineRoll = Math.sin(settings.roll * BLACK_HOLE_RADIANS);
      const rolledRightX = rightX * cosineRoll + upX * sineRoll;
      const rolledRightY = rightY * cosineRoll + upY * sineRoll;
      const rolledRightZ = rightZ * cosineRoll + upZ * sineRoll;
      const rolledUpX = -rightX * sineRoll + upX * cosineRoll;
      const rolledUpY = -rightY * sineRoll + upY * cosineRoll;
      const rolledUpZ = -rightZ * sineRoll + upZ * cosineRoll;
      pass(selectedSceneProgram, sceneTarget);
      const uniforms = selectedSceneProgram.uniforms;
      gl.uniform3f(uniforms.uCamPos ?? null, cameraX, cameraY, cameraZ);
      gl.uniform3f(uniforms.uRight ?? null, rolledRightX, rolledRightY, rolledRightZ);
      gl.uniform3f(uniforms.uUp ?? null, rolledUpX, rolledUpY, rolledUpZ);
      gl.uniform3f(uniforms.uFwd ?? null, forwardX, forwardY, forwardZ);
      const spin = settings.spinSpeed * 6.2831853;
      const windPhase = time / 46;
      const firstWind = windPhase - Math.floor(windPhase);
      const secondWindPhase = windPhase + 0.5;
      const secondWind = secondWindPhase - Math.floor(secondWindPhase);
      gl.uniform4f(
        uniforms.uWind ?? null,
        firstWind * 46,
        secondWind * 46,
        Math.abs(2 * firstWind - 1),
        spin * time * 0.05,
      );
      if (sceneStaticSettings.get(selectedSceneProgram.program) !== settings) {
        const hot = linearColor(settings.hotColor, colorCache.hot);
        const mid = linearColor(settings.midColor, colorCache.mid);
        const cool = linearColor(settings.coolColor, colorCache.cool);
        const outer = Math.max(settings.diskInner + 0.5, settings.diskOuter);
        gl.uniform1f(uniforms.uTanHalf ?? null, Math.tan(Math.max(8, Math.min(110, settings.fov)) * 0.5 * BLACK_HOLE_RADIANS));
        if (uniforms.uSteps) gl.uniform1f(uniforms.uSteps, steps);
        gl.uniform1f(uniforms.uSkyR ?? null, Math.max(distance * 1.35, outer * 2.4));
        gl.uniform1f(uniforms.uDiskIn ?? null, Math.max(1.05, settings.diskInner));
        gl.uniform1f(uniforms.uDiskOut ?? null, outer);
        gl.uniform1f(uniforms.uThick ?? null, Math.max(0.02, settings.diskThickness));
        gl.uniform1f(uniforms.uDensity ?? null, Math.max(0, settings.diskDensity));
        gl.uniform1f(uniforms.uSpin ?? null, spin);
        gl.uniform1f(uniforms.uGrain ?? null, Math.max(0.02, settings.grain));
        gl.uniform1f(uniforms.uBright ?? null, Math.max(0, settings.brightness));
        gl.uniform1f(uniforms.uDoppler ?? null, Math.max(0, Math.min(1, settings.doppler)));
        gl.uniform3f(uniforms.uHot ?? null, hot[0], hot[1], hot[2]);
        gl.uniform3f(uniforms.uMid ?? null, mid[0], mid[1], mid[2]);
        gl.uniform3f(uniforms.uCool ?? null, cool[0], cool[1], cool[2]);
        if (uniforms.uStars) gl.uniform1f(uniforms.uStars, Math.max(0, settings.starBrightness));
        sceneStaticSettings.set(selectedSceneProgram.program, settings);
      }
      const jitter = halton[settledFrames % halton.length] ?? halton[0];
      if (!jitter) return;
      gl.uniform2f(uniforms.uJitter ?? null, jitter[0] - 0.5, jitter[1] - 0.5);
      gl.uniform1f(uniforms.uSeed ?? null, (settledFrames % 64) * 17.13);
      draw();

      const historyWeight = settledFrames === 0 ? 1 : 0.14;
      pass(blendProgram, historyB);
      bindTexture(sceneTarget.texture, 0);
      bindTexture(historyA.texture, 1);
      gl.uniform1f(blendProgram.uniforms.uAlpha ?? null, historyWeight);
      draw();
      const shown = historyB;
      const swap = historyA;
      historyA = historyB;
      historyB = swap;
      settledFrames += 1;
      shownTarget = shown;

      if (finishScene) {
        pass(brightProgram, bloomA);
        bindTexture(shown.texture, 0);
        draw();
        const blurStep = (source: BlackHoleRenderTarget, destination: BlackHoleRenderTarget, dx: number, dy: number): void => {
          pass(activeBlurProgram, destination);
          bindTexture(source.texture, 0);
          gl.uniform2f(activeBlurProgram.uniforms.uStep ?? null, dx / destination.width, dy / destination.height);
          draw();
        };
        blurStep(bloomA, bloomB, 1, 0);
        blurStep(bloomB, bloomA, 0, 1);
        blurStep(bloomA, bloomB, 2.6, 0);
        blurStep(bloomB, bloomA, 0, 2.6);
        shownBloomTarget = bloomA;
      }
    }

    if (includeScene && !finishScene) return;
    const scene = shownTarget;
    const bloom = shownBloomTarget;
    if (!scene || !bloom) return;
    pass(compositeProgram, null);
    bindTexture(scene.texture, 0);
    bindTexture(bloom.texture, 1);
    gl.uniform1f(compositeProgram.uniforms.uGlow ?? null, Math.max(0, settings.glow) * 0.26);
    gl.uniform1f(compositeProgram.uniforms.uExposure ?? null, Math.max(0.05, settings.exposure));
    gl.uniform1f(compositeProgram.uniforms.uVignette ?? null, Math.max(0, Math.min(1, settings.vignette)));
    gl.uniform1f(compositeProgram.uniforms.uScrimDir ?? null, 0);
    gl.uniform1f(compositeProgram.uniforms.uScrimAmt ?? null, 0);
    gl.uniform1f(compositeProgram.uniforms.uSeed ?? null, (time * 60) % 1000);
    draw();
  };

  const canRun = (): boolean => running && contextReady && inViewport && documentVisible;
  function schedule(): void {
    if (!canRun() || animationFrame || (allocationFailed && !resizePending)) return;
    animationFrame = requestAnimationFrame(tick);
  }
  const stopLoop = (): void => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
  };
  function tick(now: number): void {
    animationFrame = 0;
    if (!canRun()) return;
    if (resizePending) {
      resizePending = false;
      if (resize()) {
        settledFrames = 0;
        stillPassesRemaining = 16;
        needsScene = true;
      }
    }
    if (allocationFailed) return;
    const paused = readSettings().paused || reduced;
    if (paused !== lastPaused) {
      if (paused) {
        settledFrames = 0;
        stillPassesRemaining = 16;
        needsScene = true;
      }
      lastPaused = paused;
      lastFrame = 0;
      needsComposite = true;
    }
    const delta = lastFrame ? Math.min(0.05, (now - lastFrame) / 1_000) : 0;
    lastFrame = now;
    if (!paused) {
      clock += delta;
      render(clock, true, true);
      needsScene = false;
      needsComposite = false;
    } else if (needsScene) {
      const finishScene = stillPassesRemaining === 16 || stillPassesRemaining <= 1;
      render(clock, true, finishScene);
      stillPassesRemaining = Math.max(0, stillPassesRemaining - 1);
      if (stillPassesRemaining === 0) {
        needsScene = false;
        needsComposite = false;
      }
    } else if (needsComposite) {
      render(clock, false, true);
      needsComposite = false;
    }
    if (!paused || needsScene || needsComposite || resizePending) schedule();
    else lastFrame = 0;
  }

  if (!build()) {
    const message = "The Black Hole Background shaders could not be initialized.";
    giveUp("build-failed", message);
    destroyGpuResources();
    throw new Error(message);
  }
  if (!resize()) {
    const message = "The GPU could not allocate the Black Hole Background render targets.";
    destroyGpuResources();
    throw new Error(message);
  }
  schedule();

  const resizeObserver = new ResizeObserver(() => {
    resizePending = true;
    schedule();
  });
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver((entries) => {
    inViewport = entries[0]?.isIntersecting ?? true;
    if (inViewport) {
      lastFrame = 0;
      needsComposite = true;
      schedule();
    } else {
      stopLoop();
    }
  }, { threshold: 0 });
  intersectionObserver.observe(host);
  const onVisibilityChange = (): void => {
    documentVisible = !document.hidden;
    lastFrame = 0;
    if (documentVisible) {
      needsComposite = true;
      schedule();
    } else {
      stopLoop();
    }
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextReady = false;
    allocationFailed = false;
    cancelPendingVariant();
    stopLoop();
    canvasWidth = canvasHeight = sceneWidth = sceneHeight = 0;
    giveUp("context-lost", "The Black Hole Background graphics context was lost; waiting for recovery.");
  };
  const onContextRestored = (): void => {
    destroyGpuResources();
    canvasWidth = canvasHeight = sceneWidth = sceneHeight = 0;
    contextReady = true;
    if (!build()) {
      contextReady = false;
      destroyGpuResources();
      giveUp("lost", "The Black Hole Background WebGL context could not be restored.");
      return;
    }
    lastFrame = 0;
    resizePending = false;
    if (!resize()) return;
    stillPassesRemaining = 16;
    needsScene = true;
    needsComposite = true;
    schedule();
  };
  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reduced = event.matches;
    lastFrame = 0;
    settledFrames = 0;
    stillPassesRemaining = 16;
    needsScene = true;
    needsComposite = true;
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  reducedMotion.addEventListener("change", onReducedMotionChange);

  return {
    invalidate: (sceneChanged: boolean, sizeChanged: boolean): void => {
      if (!running) return;
      if (sizeChanged) resizePending = true;
      if (sceneChanged) {
        settledFrames = 0;
        stillPassesRemaining = 16;
        needsScene = true;
      }
      needsComposite = true;
      schedule();
    },
    dispose: (): void => {
      if (!running) return;
      running = false;
      cancelPendingVariant();
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      reducedMotion.removeEventListener("change", onReducedMotionChange);
      destroyGpuResources();
    },
  };
}

class BlackHoleRenderer {
  #settings: BlackHoleBackgroundSettings;
  readonly #runtime: BlackHoleRendererRuntime;

  constructor(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    settings: BlackHoleBackgroundSettings,
    onError: (message?: string) => void,
  ) {
    this.#settings = normalizeBlackHoleSettings(settings);
    this.#runtime = startBlackHoleRenderer(host, canvas, () => this.#settings, onError);
  }

  setSettings(settings: BlackHoleBackgroundSettings): void {
    const next = normalizeBlackHoleSettings(settings);
    const sceneChanged = blackHoleSceneSignature(next) !== blackHoleSceneSignature(this.#settings);
    const sizeChanged = blackHoleSizeSignature(next) !== blackHoleSizeSignature(this.#settings);
    this.#settings = next;
    this.#runtime.invalidate(sceneChanged, sizeChanged);
  }

  dispose(): void {
    this.#runtime.dispose();
  }
}

class BlackHoleBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readBlackHoleBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: BlackHoleRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() {
    window.addEventListener("pagehide", this.#onPageHide, { once: true });
  }

  get settings(): BlackHoleBackgroundSettings {
    return this.#settings;
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

  get stoppedForExternalThemeChange(): boolean {
    return this.#stoppedForExternalThemeChange;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Black Hole Background is unavailable");
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
      layer.dataset.codeCodexBlackHoleLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = "#000000";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas code-codex-black-hole-canvas";
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#000000");
      this.#renderer = new BlackHoleRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Black Hole Background could not be enabled";
      this.#teardownPresentation();
      try {
        await this.#restoreCodexAppearanceTheme();
      } catch {
        // Retain the activation error. A retained theme lease retries on disable.
      }
      throw error;
    } finally {
      this.#pending = false;
      this.#notify();
    }
  }

  async disable(preserveTheme = false): Promise<void> {
    const pendingEnable = this.#enableOperation;
    this.#stoppedForExternalThemeChange = false;
    const hadPresentation = this.#enabled || this.#pending || Boolean(this.#layer);
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    if (hadPresentation) this.#teardownPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    try {
      if (!preserveTheme) await this.#restoreCodexAppearanceTheme();
      this.#error = undefined;
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The previous Codex Appearance could not be restored";
    }
    this.#notify();
  }

  updateSettings(next: BlackHoleBackgroundSettings): void {
    this.#settings = normalizeBlackHoleSettings(next);
    writeBlackHoleBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }

  applyPreset(name: BlackHolePresetName): void {
    this.updateSettings(BLACK_HOLE_BACKGROUND_PRESETS[name]);
  }

  reset(): void {
    this.updateSettings(DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#teardownPresentation();
    this.#listeners.clear();
    window.removeEventListener("pagehide", this.#onPageHide);
  }

  #teardownPresentation(): void {
    this.#codexThemeObserver?.disconnect();
    this.#codexThemeObserver = undefined;
    this.#codexThemeMonitorGeneration += 1;
    window.clearTimeout(this.#codexThemePreferenceTimer);
    this.#codexThemePreferenceTimer = 0;
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#layer?.remove();
    this.#layer = undefined;
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = BLACK_HOLE_BACKGROUND_PLUGIN_ID;
    let current: CodexAppearanceTheme;
    try {
      current = await readCodexAppearanceTheme();
    } catch (error) {
      if (codexDarkThemeApplied()) return;
      throw new Error("Codex Appearance is unavailable. Restart Codex with Code-Codex, then try again.", { cause: error });
    }

    const lease = readParticleThemeLease();
    if (current === "dark") {
      if (lease?.owner && lease.owner !== owner) {
        throw new Error("Another Code-Codex background is still using Dark mode");
      }
      if (lease && !lease.owner) {
        writeParticleThemeLease({ ...lease, owner });
      }
      if (!codexDarkThemeApplied()) await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
      return;
    }
    if (lease) {
      if (lease.owner && lease.owner !== owner) {
        throw new Error("Another Code-Codex background still owns the Dark appearance lease");
      }
      clearParticleThemeLease(owner);
      this.#stoppedForExternalThemeChange = true;
      throw new Error("Black Hole Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
    }

    writeParticleThemeLease({ owner, previousPreference: current, forcedPreference: "dark" });
    try {
      await writeCodexAppearanceTheme("dark");
      await waitForCodexDarkTheme();
    } catch (error) {
      try {
        await writeCodexAppearanceTheme(current);
        clearParticleThemeLease(owner);
      } catch {
        // Retain the lease so a later disable/startup can retry restoration.
      }
      throw new Error("Codex could not switch to Dark automatically.", { cause: error });
    }
  }

  async #restoreCodexAppearanceTheme(): Promise<void> {
    const owner = BLACK_HOLE_BACKGROUND_PLUGIN_ID;
    const lease = readParticleThemeLease();
    if (!lease) return;
    if (lease.owner && lease.owner !== owner) return;
    const current = await readCodexAppearanceTheme();
    if (current !== lease.forcedPreference) {
      clearParticleThemeLease(owner);
      return;
    }
    await writeCodexAppearanceTheme(lease.previousPreference);
    clearParticleThemeLease(owner);
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
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) {
      this.#scheduleCodexThemePreferenceCheck();
    }
  }

  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Black Hole Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  #onPageHide = (): void => {
    this.dispose();
  };
}

const BLACK_HOLE_BACKGROUND_CONTROLLER = Symbol.for("code-codex:black-hole-background-controller:v1");

function getBlackHoleBackgroundController(): BlackHoleBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[BLACK_HOLE_BACKGROUND_CONTROLLER];
  if (existing instanceof BlackHoleBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try {
      existing.dispose();
    } catch {
      // Replace a stale controller from an earlier injected bundle.
    }
  }
  const controller = new BlackHoleBackgroundController();
  globalState[BLACK_HOLE_BACKGROUND_CONTROLLER] = controller;
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

function particleValueEditorMarkup(definition: ParticleValueControlDefinition, value: number): string {
  const formattedValue = definition.format(value);
  return `
    <span class="particle-control-value">
      <output for="${definition.id}" tabindex="0" role="button" title="双击输入数值" aria-label="${particleOutputAriaLabel(definition, formattedValue)}">${formattedValue}</output>
      <input class="particle-value-editor" id="${definition.id}-value" type="number" inputmode="decimal" min="${particleEditorNumber(definition, definition.minimum)}" max="${particleEditorNumber(definition, definition.maximum)}" step="${particleEditorNumber(definition, definition.step)}" value="${particleEditorNumber(definition, value)}" aria-label="输入${definition.labelZh}" hidden>
    </span>
  `;
}

function particleNumericControlsMarkup(group: ParticleControlGroup): string {
  return PARTICLE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_PARTICLE_BACKGROUND_SETTINGS[definition.key];
      const formattedValue = definition.format(value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-particle-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formattedValue}">
          ${particleValueEditorMarkup(definition, value)}
        </div>
      `;
    })
    .join("");
}

function particleImageTransformControlsMarkup(): string {
  return PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS
    .map((definition) => {
      const value = DEFAULT_PARTICLE_IMAGE_TRANSFORM[definition.key];
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-particle-image-transform="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${definition.format(value)}">
          ${particleValueEditorMarkup(definition, value)}
        </div>
      `;
    })
    .join("");
}

function particleMorphCurveEditorMarkup(): string {
  return `
    <section class="particle-morph-curve-control" aria-labelledby="cle-particle-morph-curve-label">
      <header class="particle-morph-curve-head">
        <span id="cle-particle-morph-curve-label">${bilingualLabelMarkup("变形曲线", "Morph curve", "cle-bilingual-label cle-bilingual-label-compact")}</span>
        <span class="particle-morph-curve-actions">
          <span class="particle-morph-curve-mode">平滑</span>
          <button class="particle-morph-curve-reset" type="button">${bilingualLabelMarkup("重置", "Reset")}</button>
        </span>
      </header>
      <svg class="particle-morph-curve-editor" viewBox="0 0 240 116" role="group" aria-labelledby="cle-particle-morph-curve-label" aria-describedby="cle-particle-morph-curve-help" data-disabled="false" data-dragging="false">
        <defs>
          <pattern id="cle-particle-morph-grid-pattern" width="53" height="22" patternUnits="userSpaceOnUse">
            <path class="particle-morph-curve-grid-line" d="M 53 0 L 0 0 0 22" fill="none"></path>
          </pattern>
        </defs>
        <rect class="particle-morph-curve-grid" x="14" y="12" width="212" height="88" fill="url(#cle-particle-morph-grid-pattern)"></rect>
        <path class="particle-morph-curve-diagonal" d="M 14 100 L 226 12"></path>
        <line class="particle-morph-curve-tangent particle-morph-curve-tangent-start"></line>
        <line class="particle-morph-curve-tangent particle-morph-curve-tangent-end"></line>
        <path class="particle-morph-curve-path-glow"></path>
        <path class="particle-morph-curve-path"></path>
        <g class="particle-morph-curve-nodes" role="group" aria-label="中间变形关键帧"></g>
        <path class="particle-morph-curve-keyframe" d="M 14 95 L 19 100 L 14 105 L 9 100 Z"></path>
        <path class="particle-morph-curve-keyframe" d="M 226 7 L 231 12 L 226 17 L 221 12 Z"></path>
        <g class="particle-morph-curve-handle particle-morph-curve-handle-start" data-handle="start" tabindex="0" role="slider" aria-label="输出控制点" aria-valuemin="0" aria-valuemax="100">
          <circle class="particle-morph-curve-hit" r="12"></circle>
          <circle class="particle-morph-curve-knob" r="5"></circle>
        </g>
        <g class="particle-morph-curve-handle particle-morph-curve-handle-end" data-handle="end" tabindex="0" role="slider" aria-label="输入控制点" aria-valuemin="0" aria-valuemax="100">
          <circle class="particle-morph-curve-hit" r="12"></circle>
          <circle class="particle-morph-curve-knob" r="5"></circle>
        </g>
        <text class="particle-morph-curve-axis cle-bilingual-label-zh" x="14" y="8" lang="zh-CN">变形</text>
        <text class="particle-morph-curve-axis cle-bilingual-label-en" x="14" y="8" lang="en">MORPH</text>
        <text class="particle-morph-curve-axis cle-bilingual-label-zh" x="226" y="111" text-anchor="end" lang="zh-CN">时间</text>
        <text class="particle-morph-curve-axis cle-bilingual-label-en" x="226" y="111" text-anchor="end" lang="en">TIME</text>
      </svg>
      <p class="particle-morph-curve-help" id="cle-particle-morph-curve-help">${bilingualLabelMarkup("双击添加关键帧 · 拖动移动 · Delete 删除", "Double-click to add a keyframe · drag to move · Delete removes it")}</p>
    </section>
  `;
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
    <section class="particle-settings-panel" id="cle-particle-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-particle-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观", "Appearance")}</p>
          <h3 id="cle-particle-settings-title">${bilingualLabelMarkup("粒子设置", "Particle settings")}</h3>
        </div>
        <div class="particle-settings-header-actions">
          ${backgroundLanguageSwitchMarkup("cle-particle-settings-language")}
          <button class="particle-settings-close" type="button" title="关闭粒子设置" aria-label="关闭粒子设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("粒子", "Particles")}</legend>
          ${particleNumericControlsMarkup("particles")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("流动", "Flow")}</legend>
          ${particleNumericControlsMarkup("flow")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("来源", "Source")}</legend>
          <details class="particle-source-details">
            <summary class="particle-source-summary">
              ${bilingualLabelMarkup("图片库", "Image library")}
              <span class="particle-source-count">0 个已保存</span>
            </summary>
            <div class="particle-library-toolbar">
              <label class="particle-library-add">
                ${bilingualLabelMarkup("添加图片", "Add images")}
                <input class="particle-library-upload" type="file" accept="${PARTICLE_BACKGROUND_ACCEPT}" multiple>
              </label>
              <button class="particle-library-clear" type="button" disabled>${bilingualLabelMarkup("清除顺序", "Clear order")}</button>
            </div>
            <section class="particle-image-transform-editor" data-empty="true" tabindex="-1" aria-busy="false" aria-labelledby="cle-particle-image-transform-title cle-particle-image-transform-name">
              <header class="particle-image-transform-header">
                <div class="particle-image-transform-identity">
                  <img class="particle-image-transform-thumb" width="28" height="28" alt="" hidden>
                  <div>
                    <span id="cle-particle-image-transform-title">${bilingualLabelMarkup("图片取景", "Photo framing")}</span>
                    <strong class="particle-image-transform-name" id="cle-particle-image-transform-name" aria-live="polite">选择照片</strong>
                  </div>
                </div>
                <button class="particle-image-transform-reset" type="button" disabled>${bilingualLabelMarkup("重置", "Reset")}</button>
              </header>
              <div class="particle-image-transform-controls">
                ${particleImageTransformControlsMarkup()}
              </div>
              <p class="particle-image-transform-empty">${bilingualLabelMarkup("在图片上点击“调整”以设置位置和缩放。", "Choose Adjust on a photo to set its position and zoom.")}</p>
            </section>
            <div class="particle-library-grid">
              <p class="particle-library-empty">${bilingualLabelMarkup("添加图片后按播放顺序选择。", "Add images, then select them in playback order.")}</p>
            </div>
            <label class="particle-toggle-row" for="cle-particle-auto-switch">
              ${bilingualLabelMarkup("自动切换", "Auto switch")}
              <input id="cle-particle-auto-switch" type="checkbox" checked>
            </label>
          </details>
          ${particleNumericControlsMarkup("source")}
          ${particleMorphCurveEditorMarkup()}
          <label class="particle-toggle-row" for="cle-particle-show-source">
            ${bilingualLabelMarkup("显示源图", "Show source image")}
            <input id="cle-particle-show-source" type="checkbox" checked>
          </label>
          <label class="particle-color-row" for="cle-particle-background-color">
            ${bilingualLabelMarkup("背景", "Background")}
            <input id="cle-particle-background-color" type="color" value="#000000">
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("指针", "Pointer")}</legend>
          ${particleNumericControlsMarkup("pointer")}
          <label class="particle-toggle-row" for="cle-particle-cursor-interaction">
            ${bilingualLabelMarkup("鼠标交互", "Cursor interaction")}
            <input id="cle-particle-cursor-interaction" type="checkbox" checked>
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染", "Render")}</legend>
          ${particleNumericControlsMarkup("render")}
        </fieldset>
        <p class="particle-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}

function formatBlackHoleControlValue(definition: BlackHoleNumericControlDefinition, value: number): string {
  if (definition.percent) return `${Math.round(value * 100)}%`;
  const precision = Math.max(0, (String(definition.step).split(".")[1] ?? "").length);
  return `${value.toFixed(precision)}${definition.unit ?? ""}`;
}

function blackHoleNumericControlsMarkup(group: BlackHoleControlGroup): string {
  return BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS[definition.key];
      const formattedValue = formatBlackHoleControlValue(definition, value);
      return `
        <div class="particle-control-row" title="${definition.hintZh}" data-hint-zh="${definition.hintZh}" data-hint-en="${definition.hint}">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-black-hole-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formattedValue}">
          <span class="particle-control-value"><output for="${definition.id}">${formattedValue}</output></span>
        </div>
      `;
    })
    .join("");
}

function blackHoleBackgroundCardMarkup(): string {
  const icon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="2.25" fill="currentColor" stroke="none"/><ellipse cx="8" cy="8" rx="6.1" ry="3.15" transform="rotate(-18 8 8)"/><path d="M2.5 9.7c2.4 1.15 8.2 1.15 11-2.35"/></svg>`;
  return `
    <article class="preview-extension appearance-extension black-hole-background-extension" data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icon}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Black Hole Background</h4>
          <span class="preview-extension-status" id="cle-black-hole-background-status">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="cle-black-hole-background-status" aria-pressed="false">Enable</button>
        <button class="particle-settings-trigger black-hole-settings-trigger" type="button" title="Configure Black Hole Background" aria-label="Configure Black Hole Background" aria-haspopup="dialog" aria-controls="cle-black-hole-settings" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}

function blackHoleSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel black-hole-settings-panel" id="cle-black-hole-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-black-hole-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观", "Appearance")}</p>
          <h3 id="cle-black-hole-settings-title">${bilingualLabelMarkup("黑洞设置", "Black hole settings")}</h3>
        </div>
        <div class="particle-settings-header-actions">
          ${backgroundLanguageSwitchMarkup("cle-black-hole-settings-language")}
          <button class="particle-settings-close black-hole-settings-close" type="button" title="关闭黑洞设置" aria-label="关闭黑洞设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <div class="black-hole-preset-toolbar" role="group" aria-label="黑洞场景预设">
          <button type="button" data-black-hole-preset="cinema">${bilingualLabelMarkup("电影", "Cinema")}</button>
          <button type="button" data-black-hole-preset="lens">${bilingualLabelMarkup("透镜", "Lens")}</button>
          <button type="button" data-black-hole-preset="ember">${bilingualLabelMarkup("余烬", "Ember")}</button>
          <button class="black-hole-reset" type="button">${bilingualLabelMarkup("重置", "Reset")}</button>
        </div>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("相机", "Camera")}</legend>
          ${blackHoleNumericControlsMarkup("camera")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("吸积盘", "Accretion disc")}</legend>
          ${blackHoleNumericControlsMarkup("disc")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("光线", "Light")}</legend>
          ${blackHoleNumericControlsMarkup("light")}
          <label class="particle-color-row" for="cle-black-hole-hot-color">
            ${bilingualLabelMarkup("热色", "Hot color")}
            <input id="cle-black-hole-hot-color" data-black-hole-color="hotColor" type="color" value="${DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS.hotColor}">
          </label>
          <label class="particle-color-row" for="cle-black-hole-mid-color">
            ${bilingualLabelMarkup("中间色", "Mid color")}
            <input id="cle-black-hole-mid-color" data-black-hole-color="midColor" type="color" value="${DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS.midColor}">
          </label>
          <label class="particle-color-row" for="cle-black-hole-cool-color">
            ${bilingualLabelMarkup("冷色", "Cool color")}
            <input id="cle-black-hole-cool-color" data-black-hole-color="coolColor" type="color" value="${DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS.coolColor}">
          </label>
        </fieldset>
        <fieldset class="particle-settings-group black-hole-renderer-settings" hidden>
          <legend>${bilingualLabelMarkup("渲染器", "Renderer")}</legend>
          ${blackHoleNumericControlsMarkup("renderer")}
          <label class="particle-toggle-row" for="cle-black-hole-paused">
            ${bilingualLabelMarkup("暂停动画", "Pause animation")}
            <input id="cle-black-hole-paused" type="checkbox">
          </label>
        </fieldset>
        <p class="particle-plugin-error black-hole-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}

function formatGlowHorizonControlValue(
  definition: GlowHorizonNumericControlDefinition,
  value: number,
): string {
  const precision = definition.precision ?? Math.max(0, (String(definition.step).split(".")[1] ?? "").length);
  return `${value.toFixed(precision)}${definition.unit ?? ""}`;
}

function glowHorizonNumericControlsMarkup(group: GlowHorizonControlGroup): string {
  return GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS[definition.key];
      const formatted = formatGlowHorizonControlValue(definition, value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-glow-horizon-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}

function glowHorizonBackgroundCardMarkup(): string {
  const icon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><ellipse cx="8" cy="9.5" rx="6.5" ry="3.3"/><path d="M1.8 8.5c1.8-2.4 10.6-2.4 12.4 0"/><path d="M3 6.4c1.9-1.5 8.1-1.5 10 0"/></svg>`;
  return `
    <article class="preview-extension appearance-extension glow-horizon-background-extension" data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icon}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Glow Horizon Background</h4>
          <span class="preview-extension-status" id="cle-glow-horizon-background-status">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="cle-glow-horizon-background-status" aria-pressed="false">Enable</button>
        <button class="particle-settings-trigger glow-horizon-settings-trigger" type="button" title="Configure Glow Horizon Background" aria-label="Configure Glow Horizon Background" aria-haspopup="dialog" aria-controls="cle-glow-horizon-settings" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}

function glowHorizonSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel glow-horizon-settings-panel" id="cle-glow-horizon-settings" data-glow-horizon-controls="panel" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-glow-horizon-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观", "Appearance")}</p>
          <h3 id="cle-glow-horizon-settings-title">${bilingualLabelMarkup("发光地平线设置", "Glow Horizon settings")}</h3>
        </div>
        <div class="particle-settings-header-actions">
          ${backgroundLanguageSwitchMarkup("cle-glow-horizon-settings-language")}
          <button class="particle-settings-close glow-horizon-settings-close" type="button" title="关闭发光地平线设置" aria-label="关闭发光地平线设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <div class="glow-horizon-direction-toolbar" role="group" aria-label="地平线方向">
          <button type="button" data-glow-horizon-direction="top" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant === "top"}"><span class="glow-horizon-direction-symbol">↑</span>${bilingualLabelMarkup("上", "Top")}</button>
          <button type="button" data-glow-horizon-direction="bottom" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant === "bottom"}"><span class="glow-horizon-direction-symbol">↓</span>${bilingualLabelMarkup("下", "Bottom")}</button>
          <button type="button" data-glow-horizon-direction="left" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant === "left"}"><span class="glow-horizon-direction-symbol">←</span>${bilingualLabelMarkup("左", "Left")}</button>
          <button type="button" data-glow-horizon-direction="right" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant === "right"}"><span class="glow-horizon-direction-symbol">→</span>${bilingualLabelMarkup("右", "Right")}</button>
        </div>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("输入", "Input")}</legend>
          ${glowHorizonNumericControlsMarkup("input")}
          <label class="particle-toggle-row" for="cle-glow-inertial-wheel">
            ${bilingualLabelMarkup("滚轮惯性", "Wheel inertia")}
            <input id="cle-glow-inertial-wheel" type="checkbox" checked>
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("下滑动态", "Downward slide")}</legend>
          ${glowHorizonNumericControlsMarkup("downward")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("上滑动态", "Upward slide")}</legend>
          ${glowHorizonNumericControlsMarkup("upward")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("释放回弹", "Release")}</legend>
          ${glowHorizonNumericControlsMarkup("release")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面", "Opening frame")}</legend>
          ${glowHorizonNumericControlsMarkup("entrance")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("光效配色", "Glow palette")}</legend>
          <label class="particle-color-row" for="cle-glow-rim-color">${bilingualLabelMarkup("亮边", "Rim")}<input id="cle-glow-rim-color" data-glow-horizon-color="rimColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.rimColor}"></label>
          <label class="particle-color-row" for="cle-glow-violet-color">${bilingualLabelMarkup("紫光", "Violet")}<input id="cle-glow-violet-color" data-glow-horizon-color="violetColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.violetColor}"></label>
          <label class="particle-color-row" for="cle-glow-blue-color">${bilingualLabelMarkup("蓝光", "Blue")}<input id="cle-glow-blue-color" data-glow-horizon-color="blueColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.blueColor}"></label>
          <label class="particle-color-row" for="cle-glow-shadow-color">${bilingualLabelMarkup("暗部", "Shadow")}<input id="cle-glow-shadow-color" data-glow-horizon-color="shadowColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.shadowColor}"></label>
        </fieldset>
        <div class="glow-horizon-actions">
          <button class="glow-horizon-reset" type="button">${bilingualLabelMarkup("重置", "Reset")}</button>
          <button class="glow-horizon-replay" type="button">${bilingualLabelMarkup("重播", "Replay")}</button>
        </div>
        <p class="particle-plugin-error glow-horizon-plugin-error" role="status" hidden></p>
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
  #updateCheckPending = false;
  #updateCheckOperation = 0;
  #updateCheckPresentation: UpdateCheckPresentation = "idle";
  #updateCheckSummary = `Check GitHub for updates (current version v${__CODE_CODEX_VERSION__})`;
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
  #appearanceInitializationGeneration = 0;
  #appearanceRpcTail: Promise<void> = Promise.resolve();
  #previewMarketOpen = false;
  #particleSettingsOpen = false;
  #blackHoleSettingsOpen = false;
  #glowHorizonSettingsOpen = false;
  #backgroundSettingsLanguage: BackgroundSettingsLanguage = "zh";
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
  readonly #statusCode: HTMLButtonElement;
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
    editor: HTMLInputElement;
  }>>();
  readonly #particleMorphCurveEditor: SVGSVGElement;
  readonly #particleMorphCurvePath: SVGPathElement;
  readonly #particleMorphCurvePathGlow: SVGPathElement;
  readonly #particleMorphCurveStartHandle: SVGGElement;
  readonly #particleMorphCurveEndHandle: SVGGElement;
  readonly #particleMorphCurveStartTangent: SVGLineElement;
  readonly #particleMorphCurveEndTangent: SVGLineElement;
  readonly #particleMorphCurveNodes: SVGGElement;
  readonly #particleMorphCurveMode: HTMLElement;
  readonly #particleMorphCurveReset: HTMLButtonElement;
  #particleMorphCurveDraft = cloneParticleMorphCurve(DEFAULT_PARTICLE_MORPH_CURVE);
  #particleMorphCurveNodeElements: SVGGElement[] = [];
  #particleMorphCurveSelectedNodeIndex: number | null = null;
  #particleMorphCurveDragState: ParticleMorphCurveDragState | undefined;
  #particleMorphCurveFocusSnapshot: ParticleMorphCurve | undefined;
  readonly #particleSourceDetails: HTMLDetailsElement;
  readonly #particleSourceCount: HTMLElement;
  readonly #particleLibraryUpload: HTMLInputElement;
  readonly #particleLibraryClear: HTMLButtonElement;
  readonly #particleLibraryGrid: HTMLElement;
  readonly #particleImageTransformEditor: HTMLElement;
  readonly #particleImageTransformThumb: HTMLImageElement;
  readonly #particleImageTransformName: HTMLElement;
  readonly #particleImageTransformReset: HTMLButtonElement;
  readonly #particleImageTransformControls = new Map<ParticleImageTransformKey, Readonly<{
    definition: ParticleImageTransformControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
    editor: HTMLInputElement;
  }>>();
  #particleTransformImageId: string | null = null;
  readonly #particleAutoSwitchInput: HTMLInputElement;
  readonly #particleShowSourceInput: HTMLInputElement;
  readonly #particleBackgroundColorInput: HTMLInputElement;
  readonly #particleCursorInteractionInput: HTMLInputElement;
  readonly #particlePluginError: HTMLElement;
  readonly #blackHoleBackgroundController = getBlackHoleBackgroundController();
  #blackHoleBackgroundUnsubscribe: (() => void) | undefined;
  #blackHoleBackgroundInitialization: Promise<void> | undefined;
  readonly #blackHoleBackgroundCard: HTMLElement;
  readonly #blackHoleBackgroundButton: HTMLButtonElement;
  readonly #blackHoleBackgroundStatus: HTMLElement;
  readonly #blackHoleSettingsPanel: HTMLElement;
  readonly #blackHoleSettingsTrigger: HTMLButtonElement;
  readonly #blackHoleSettingsCloseButton: HTMLButtonElement;
  readonly #backgroundLanguageInputs: readonly HTMLInputElement[];
  readonly #blackHoleNumericControls = new Map<BlackHoleNumericSettingKey, Readonly<{
    definition: BlackHoleNumericControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }>>();
  readonly #blackHoleColorInputs = new Map<BlackHoleColorSettingKey, HTMLInputElement>();
  readonly #blackHolePausedInput: HTMLInputElement;
  readonly #blackHoleResetButton: HTMLButtonElement;
  readonly #blackHolePresetButtons: readonly HTMLButtonElement[];
  readonly #blackHolePluginError: HTMLElement;
  readonly #glowHorizonBackgroundController = getGlowHorizonBackgroundController();
  #glowHorizonBackgroundUnsubscribe: (() => void) | undefined;
  #glowHorizonBackgroundInitialization: Promise<void> | undefined;
  readonly #glowHorizonBackgroundCard: HTMLElement;
  readonly #glowHorizonBackgroundButton: HTMLButtonElement;
  readonly #glowHorizonBackgroundStatus: HTMLElement;
  readonly #glowHorizonSettingsPanel: HTMLElement;
  readonly #glowHorizonSettingsTrigger: HTMLButtonElement;
  readonly #glowHorizonSettingsCloseButton: HTMLButtonElement;
  readonly #glowHorizonNumericControls = new Map<GlowHorizonNumericSettingKey, Readonly<{
    definition: GlowHorizonNumericControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }>>();
  readonly #glowHorizonColorInputs = new Map<"rimColor" | "violetColor" | "blueColor" | "shadowColor", HTMLInputElement>();
  readonly #glowHorizonInertialWheelInput: HTMLInputElement;
  readonly #glowHorizonResetButton: HTMLButtonElement;
  readonly #glowHorizonReplayButton: HTMLButtonElement;
  readonly #glowHorizonPluginError: HTMLElement;
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
                <div class="preview-market-section-list">${transparentBackgroundCardMarkup()}${particleBackgroundCardMarkup()}${blackHoleBackgroundCardMarkup()}${glowHorizonBackgroundCardMarkup()}</div>
              </section>
              <section class="preview-market-section" aria-labelledby="cle-file-preview-section-title">
                <div class="preview-market-section-title" id="cle-file-preview-section-title">File Preview</div>
                <div class="preview-market-section-list">${PREVIEWER_DEFINITIONS.map(previewerCardMarkup).join("")}</div>
              </section>
            </div>
          </div>
          <button class="preview-market-button" type="button" aria-haspopup="dialog" aria-controls="cle-preview-market" aria-expanded="false">${icons.preview}<span>Preview Market</span></button>
          <button class="status-code" type="button" title="Check GitHub for updates" aria-label="Check GitHub for updates">WAIT</button>
        </footer>
        <div class="action-notice" hidden></div>
        <div class="context-menu" role="menu" aria-label="Explorer actions" aria-busy="false" hidden></div>
        <div class="resize-handle" role="separator" aria-label="Resize explorer" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="480" aria-valuenow="260" tabindex="0"></div>
      </div>
      ${particleSettingsPanelMarkup()}
      ${blackHoleSettingsPanelMarkup()}
      ${glowHorizonSettingsPanelMarkup()}
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
    this.#statusCode = this.#required<HTMLButtonElement>(".status-code");
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
      const editor = this.#required<HTMLInputElement>(`#${definition.id}-value`);
      this.#particleNumericControls.set(definition.key, { definition, input, output, editor });
    }
    this.#particleMorphCurveEditor = this.#required<SVGSVGElement>(".particle-morph-curve-editor");
    this.#particleMorphCurvePath = this.#required<SVGPathElement>(".particle-morph-curve-path");
    this.#particleMorphCurvePathGlow = this.#required<SVGPathElement>(".particle-morph-curve-path-glow");
    this.#particleMorphCurveStartHandle = this.#required<SVGGElement>(".particle-morph-curve-handle-start");
    this.#particleMorphCurveEndHandle = this.#required<SVGGElement>(".particle-morph-curve-handle-end");
    this.#particleMorphCurveStartTangent = this.#required<SVGLineElement>(".particle-morph-curve-tangent-start");
    this.#particleMorphCurveEndTangent = this.#required<SVGLineElement>(".particle-morph-curve-tangent-end");
    this.#particleMorphCurveNodes = this.#required<SVGGElement>(".particle-morph-curve-nodes");
    this.#particleMorphCurveMode = this.#required<HTMLElement>(".particle-morph-curve-mode");
    this.#particleMorphCurveReset = this.#required<HTMLButtonElement>(".particle-morph-curve-reset");
    this.#particleSourceDetails = this.#required<HTMLDetailsElement>(".particle-source-details");
    this.#particleSourceCount = this.#required<HTMLElement>(".particle-source-count");
    this.#particleLibraryUpload = this.#required<HTMLInputElement>(".particle-library-upload");
    this.#particleLibraryClear = this.#required<HTMLButtonElement>(".particle-library-clear");
    this.#particleLibraryGrid = this.#required<HTMLElement>(".particle-library-grid");
    this.#particleImageTransformEditor = this.#required<HTMLElement>(".particle-image-transform-editor");
    this.#particleImageTransformThumb = this.#required<HTMLImageElement>(".particle-image-transform-thumb");
    this.#particleImageTransformName = this.#required<HTMLElement>(".particle-image-transform-name");
    this.#particleImageTransformReset = this.#required<HTMLButtonElement>(".particle-image-transform-reset");
    for (const definition of PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      const editor = this.#required<HTMLInputElement>(`#${definition.id}-value`);
      this.#particleImageTransformControls.set(definition.key, { definition, input, output, editor });
    }
    this.#particleAutoSwitchInput = this.#required<HTMLInputElement>("#cle-particle-auto-switch");
    this.#particleShowSourceInput = this.#required<HTMLInputElement>("#cle-particle-show-source");
    this.#particleBackgroundColorInput = this.#required<HTMLInputElement>("#cle-particle-background-color");
    this.#particleCursorInteractionInput = this.#required<HTMLInputElement>("#cle-particle-cursor-interaction");
    this.#particlePluginError = this.#required<HTMLElement>(".particle-plugin-error");
    this.#blackHoleBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}"]`);
    this.#blackHoleBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#blackHoleBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#blackHoleSettingsPanel = this.#required<HTMLElement>(".black-hole-settings-panel");
    this.#blackHoleSettingsTrigger = this.#required<HTMLButtonElement>(".black-hole-settings-trigger");
    this.#blackHoleSettingsCloseButton = this.#required<HTMLButtonElement>(".black-hole-settings-close");
    this.#backgroundLanguageInputs = Array.from(
      this.#shadow.querySelectorAll<HTMLInputElement>(".background-language-toggle"),
    );
    if (this.#backgroundLanguageInputs.length !== 3) {
      throw new Error("Background settings require three synchronized language switches.");
    }
    for (const definition of BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      this.#blackHoleNumericControls.set(definition.key, { definition, input, output });
    }
    for (const key of ["hotColor", "midColor", "coolColor"] as const) {
      this.#blackHoleColorInputs.set(key, this.#required<HTMLInputElement>(`[data-black-hole-color="${key}"]`));
    }
    this.#blackHolePausedInput = this.#required<HTMLInputElement>("#cle-black-hole-paused");
    this.#blackHoleResetButton = this.#required<HTMLButtonElement>(".black-hole-reset");
    this.#blackHolePresetButtons = Array.from(this.#shadow.querySelectorAll<HTMLButtonElement>("[data-black-hole-preset]"));
    this.#blackHolePluginError = this.#required<HTMLElement>(".black-hole-plugin-error");
    this.#glowHorizonBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}"]`);
    this.#glowHorizonBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#glowHorizonBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#glowHorizonSettingsPanel = this.#required<HTMLElement>(".glow-horizon-settings-panel");
    this.#glowHorizonSettingsTrigger = this.#required<HTMLButtonElement>(".glow-horizon-settings-trigger");
    this.#glowHorizonSettingsCloseButton = this.#required<HTMLButtonElement>(".glow-horizon-settings-close");
    for (const definition of GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      this.#glowHorizonNumericControls.set(definition.key, { definition, input, output });
    }
    for (const key of ["rimColor", "violetColor", "blueColor", "shadowColor"] as const) {
      this.#glowHorizonColorInputs.set(key, this.#required<HTMLInputElement>(`[data-glow-horizon-color="${key}"]`));
    }
    this.#glowHorizonInertialWheelInput = this.#required<HTMLInputElement>("#cle-glow-inertial-wheel");
    this.#glowHorizonResetButton = this.#required<HTMLButtonElement>(".glow-horizon-reset");
    this.#glowHorizonReplayButton = this.#required<HTMLButtonElement>(".glow-horizon-replay");
    this.#glowHorizonPluginError = this.#required<HTMLElement>(".glow-horizon-plugin-error");
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
    const appearanceInitializationGeneration = ++this.#appearanceInitializationGeneration;
    this.#requestedPlacement = this.dataset.placement || "inline";
    this.#rememberInlineMount();
    this.#settings = this.#readLocalSettings();
    this.#backgroundSettingsLanguage = this.#readBackgroundSettingsLanguage();
    this.#syncBackgroundSettingsLanguagePresentation();
    for (const previewer of this.#readEnabledPreviewers()) this.#enabledPreviewers.add(previewer);
    this.#enabledAppearancePlugins.clear();
    for (const plugin of this.#readEnabledAppearancePlugins()) this.#enabledAppearancePlugins.add(plugin);
    let normalizedAppearancePlugins = false;
    if (this.#particleBackgroundController.stoppedForExternalThemeChange) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (this.#blackHoleBackgroundController.stoppedForExternalThemeChange) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (this.#glowHorizonBackgroundController.stoppedForExternalThemeChange) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    } else if (this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    } else if (this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (normalizedAppearancePlugins) {
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
    this.#particleBackgroundInitialization = this.#initializeParticleBackground(appearanceInitializationGeneration);
    this.#blackHoleBackgroundUnsubscribe?.();
    this.#blackHoleBackgroundUnsubscribe = this.#blackHoleBackgroundController.subscribe(() => {
      if (!this.#connected) return;
      if (
        this.#blackHoleBackgroundController.stoppedForExternalThemeChange
        && this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
      ) {
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderBlackHoleBackgroundPlugin();
    });
    this.#blackHoleBackgroundInitialization = this.#particleBackgroundInitialization
      .then(() => this.#initializeBlackHoleBackground(appearanceInitializationGeneration));
    this.#glowHorizonBackgroundUnsubscribe?.();
    this.#glowHorizonBackgroundUnsubscribe = this.#glowHorizonBackgroundController.subscribe(() => {
      if (!this.#connected) return;
      if (
        this.#glowHorizonBackgroundController.stoppedForExternalThemeChange
        && this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
      ) {
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderGlowHorizonBackgroundPlugin();
    });
    this.#glowHorizonBackgroundInitialization = this.#blackHoleBackgroundInitialization
      .then(() => this.#initializeGlowHorizonBackground(appearanceInitializationGeneration));
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
    this.#appearanceInitializationGeneration += 1;
    this.#particleBackgroundUnsubscribe?.();
    this.#particleBackgroundUnsubscribe = undefined;
    this.#particleBackgroundInitialization = undefined;
    this.#blackHoleBackgroundUnsubscribe?.();
    this.#blackHoleBackgroundUnsubscribe = undefined;
    this.#blackHoleBackgroundInitialization = undefined;
    this.#glowHorizonBackgroundUnsubscribe?.();
    this.#glowHorizonBackgroundUnsubscribe = undefined;
    this.#glowHorizonBackgroundInitialization = undefined;
    this.#appearancePluginPending = false;
    this.#appearanceTransitionPending = false;
    this.#appearancePluginApplied = undefined;
    this.#appearancePluginError = undefined;
    this.#appearanceSyncQueued = false;
    this.#appearanceHealthPending = false;
    this.#appearanceOperation += 1;
    this.#cancelUpdateCheck();
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
    this.#appearanceOperation += 1;
    this.#appearanceTransitionPending = false;
    const particleWasEnabled = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
    const blackHoleWasEnabled = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
    const glowHorizonWasEnabled = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
    if (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled) this.#writeEnabledAppearancePlugins();
    if (particleWasEnabled || this.#particleBackgroundController.enabled) {
      await this.#particleBackgroundController.disable();
    }
    if (blackHoleWasEnabled || this.#blackHoleBackgroundController.enabled) {
      await this.#blackHoleBackgroundController.disable();
    }
    if (glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled) {
      await this.#glowHorizonBackgroundController.disable();
    }
    await this.#reconcilePersistedWindowTransparency();
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
    this.#cancelUpdateCheck();
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

  #backgroundText(zh: string, en: string): string {
    return backgroundSettingsText(this.#backgroundSettingsLanguage, zh, en);
  }

  #readBackgroundSettingsLanguage(): BackgroundSettingsLanguage {
    try {
      const stored = localStorage.getItem(BACKGROUND_SETTINGS_LANGUAGE_KEY);
      if (stored === "en" || stored === "zh") backgroundSettingsLanguageSession = stored;
    } catch {
      // Keep the last in-memory selection when DOM storage is unavailable.
    }
    return backgroundSettingsLanguageSession;
  }

  #writeBackgroundSettingsLanguage(): void {
    backgroundSettingsLanguageSession = this.#backgroundSettingsLanguage;
    try {
      localStorage.setItem(BACKGROUND_SETTINGS_LANGUAGE_KEY, this.#backgroundSettingsLanguage);
    } catch {
      // The selected language remains active for this session when DOM storage is unavailable.
    }
  }

  #syncBackgroundSettingsLanguagePresentation(): void {
    const language = this.#backgroundSettingsLanguage;
    const english = language === "en";
    for (const panel of [this.#particleSettingsPanel, this.#blackHoleSettingsPanel, this.#glowHorizonSettingsPanel]) {
      panel.dataset.language = language;
      panel.lang = language === "zh" ? "zh-CN" : "en";
    }
    for (const input of this.#backgroundLanguageInputs) {
      input.checked = english;
    }
    this.#particleSettingsCloseButton.title = this.#backgroundText("关闭粒子设置", "Close particle settings");
    this.#particleSettingsCloseButton.setAttribute("aria-label", this.#particleSettingsCloseButton.title);
    this.#blackHoleSettingsCloseButton.title = this.#backgroundText("关闭黑洞设置", "Close black hole settings");
    this.#blackHoleSettingsCloseButton.setAttribute("aria-label", this.#blackHoleSettingsCloseButton.title);
    this.#glowHorizonSettingsCloseButton.title = this.#backgroundText("关闭发光地平线设置", "Close Glow Horizon settings");
    this.#glowHorizonSettingsCloseButton.setAttribute("aria-label", this.#glowHorizonSettingsCloseButton.title);

    for (const control of [...this.#particleNumericControls.values(), ...this.#particleImageTransformControls.values()]) {
      const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
      control.input.setAttribute("aria-label", label);
      control.output.title = this.#backgroundText("双击输入数值", "Double-click to enter a value");
      control.editor.setAttribute(
        "aria-label",
        this.#backgroundText(`输入${control.definition.labelZh}`, `Enter ${control.definition.label} value`),
      );
      this.#syncParticleValueControl(control, Number(control.input.value));
    }
    for (const control of this.#blackHoleNumericControls.values()) {
      control.input.setAttribute(
        "aria-label",
        this.#backgroundText(control.definition.labelZh, control.definition.label),
      );
      const row = control.input.closest<HTMLElement>(".particle-control-row");
      if (row) row.title = this.#backgroundText(control.definition.hintZh, control.definition.hint);
    }
    this.#particleMorphCurveNodes.setAttribute(
      "aria-label",
      this.#backgroundText("中间变形关键帧", "Intermediate morph keyframes"),
    );
    this.#particleMorphCurveStartHandle.setAttribute(
      "aria-label",
      this.#backgroundText("输出控制点", "Outgoing curve handle"),
    );
    this.#particleMorphCurveEndHandle.setAttribute(
      "aria-label",
      this.#backgroundText("输入控制点", "Incoming curve handle"),
    );
    this.#shadow.querySelector<HTMLElement>(".black-hole-preset-toolbar")?.setAttribute(
      "aria-label",
      this.#backgroundText("黑洞场景预设", "Black hole scene presets"),
    );
    this.#shadow.querySelector<HTMLElement>(".glow-horizon-direction-toolbar")?.setAttribute(
      "aria-label",
      this.#backgroundText("地平线方向", "Horizon direction"),
    );
    for (const control of this.#glowHorizonNumericControls.values()) {
      const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
      control.input.setAttribute("aria-label", label);
      const formatted = formatGlowHorizonControlValue(control.definition, Number(control.input.value));
      control.input.setAttribute("aria-valuetext", formatted);
    }
  }

  #setBackgroundSettingsLanguage(language: BackgroundSettingsLanguage): void {
    this.#backgroundSettingsLanguage = language;
    this.#writeBackgroundSettingsLanguage();
    this.#syncBackgroundSettingsLanguagePresentation();
    this.#renderParticleBackgroundPlugin();
    this.#renderBlackHoleBackgroundPlugin();
    this.#renderGlowHorizonBackgroundPlugin();
    if (this.#particleSettingsOpen) requestAnimationFrame(() => this.#positionParticleSettingsPanel());
    if (this.#blackHoleSettingsOpen) requestAnimationFrame(() => this.#positionBlackHoleSettingsPanel());
    if (this.#glowHorizonSettingsOpen) requestAnimationFrame(() => this.#positionGlowHorizonSettingsPanel());
  }

  #bindDomEvents(): void {
    if (!this.#domEventsBound) {
      this.#domEventsBound = true;
      this.#collapseButton.addEventListener("click", () => this.collapse(true));
      this.#collapsedTab.addEventListener("click", () => this.collapse(false));
      this.#editModeButton.addEventListener("click", () => this.#toggleEditing());
      this.#statusCode.addEventListener("click", () => void this.#checkForUpdates());
      this.#previewMarketButton.addEventListener("click", () => this.#togglePreviewMarket());
      this.#previewMarketCloseButton.addEventListener("click", () => this.#closePreviewMarket(true));
      this.#transparentBackgroundButton.addEventListener("click", () => void this.#toggleTransparentBackground());
      this.#particleBackgroundButton.addEventListener("click", () => void this.#toggleParticleBackground());
      this.#blackHoleBackgroundButton.addEventListener("click", () => void this.#toggleBlackHoleBackground());
      this.#glowHorizonBackgroundButton.addEventListener("click", () => void this.#toggleGlowHorizonBackground());
      this.#particleSettingsTrigger.addEventListener("click", () => this.#toggleParticleSettings());
      this.#particleSettingsCloseButton.addEventListener("click", () => this.#closeParticleSettings(true));
      this.#blackHoleSettingsTrigger.addEventListener("click", () => this.#toggleBlackHoleSettings());
      this.#blackHoleSettingsCloseButton.addEventListener("click", () => this.#closeBlackHoleSettings(true));
      this.#glowHorizonSettingsTrigger.addEventListener("click", () => this.#toggleGlowHorizonSettings());
      this.#glowHorizonSettingsCloseButton.addEventListener("click", () => this.#closeGlowHorizonSettings(true));
      for (const input of this.#backgroundLanguageInputs) {
        input.addEventListener("change", () => {
          this.#setBackgroundSettingsLanguage(input.checked ? "en" : "zh");
        });
      }
      this.#particleSettingsPanel.addEventListener("toggle", () => {
        if (this.#particleSettingsPanel.matches(":popover-open") || !this.#particleSettingsOpen) return;
        this.#particleSettingsOpen = false;
        this.#particleSettingsTrigger.setAttribute("aria-expanded", "false");
        this.#cancelParticleValueEditors();
        this.#cancelParticleMorphCurveInteraction(true);
        this.#particleBackgroundController.finishImageTransformEditing();
        this.#particleTransformImageId = null;
      });
      this.#blackHoleSettingsPanel.addEventListener("toggle", () => {
        if (this.#blackHoleSettingsPanel.matches(":popover-open") || !this.#blackHoleSettingsOpen) return;
        this.#blackHoleSettingsOpen = false;
        this.#blackHoleSettingsTrigger.setAttribute("aria-expanded", "false");
      });
      this.#glowHorizonSettingsPanel.addEventListener("toggle", () => {
        if (this.#glowHorizonSettingsPanel.matches(":popover-open") || !this.#glowHorizonSettingsOpen) return;
        this.#glowHorizonSettingsOpen = false;
        this.#glowHorizonSettingsTrigger.setAttribute("aria-expanded", "false");
      });
      this.#previewMarketList.addEventListener("scroll", () => {
        if (this.#particleSettingsOpen) this.#positionParticleSettingsPanel();
        if (this.#blackHoleSettingsOpen) this.#positionBlackHoleSettingsPanel();
        if (this.#glowHorizonSettingsOpen) this.#positionGlowHorizonSettingsPanel();
      }, { passive: true });
      for (const control of this.#particleNumericControls.values()) {
        const { definition, input } = control;
        this.#bindParticleValueEditor(control);
        input.addEventListener("input", () => {
          const normalized = normalizeParticleSettings({
            ...this.#particleBackgroundController.settings,
            [definition.key]: input.value,
          })[definition.key];
          this.#syncParticleValueControl(control, normalized);
          if (definition.live) void this.#applyParticleSettingsFromControls();
        });
        if (!definition.live) {
          input.addEventListener("change", () => void this.#applyParticleSettingsFromControls());
        }
      }
      this.#bindParticleMorphCurveEditor();
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
      for (const control of this.#particleImageTransformControls.values()) {
        const { definition, input } = control;
        this.#bindParticleValueEditor(control);
        input.addEventListener("input", () => {
          const transform = this.#particleImageTransformFromControls();
          this.#syncParticleValueControl(control, transform[definition.key]);
          const id = this.#particleTransformImageId;
          if (id) this.#particleBackgroundController.previewImageTransform(id, transform);
        });
        input.addEventListener("change", () => void this.#saveParticleImageTransform());
      }
      this.#particleImageTransformReset.addEventListener("click", () => void this.#resetParticleImageTransform());
      for (const control of this.#blackHoleNumericControls.values()) {
        control.input.addEventListener("input", () => {
          const normalized = normalizeBlackHoleSettings({
            ...this.#blackHoleBackgroundController.settings,
            [control.definition.key]: control.input.value,
          })[control.definition.key];
          const formatted = formatBlackHoleControlValue(control.definition, normalized);
          control.output.textContent = formatted;
          control.input.setAttribute("aria-valuetext", formatted);
          this.#applyBlackHoleSettingsFromControls();
        });
      }
      for (const input of this.#blackHoleColorInputs.values()) {
        input.addEventListener("input", () => this.#applyBlackHoleSettingsFromControls());
      }
      this.#blackHolePausedInput.addEventListener("change", () => this.#applyBlackHoleSettingsFromControls());
      this.#blackHoleResetButton.addEventListener("click", () => this.#blackHoleBackgroundController.reset());
      for (const button of this.#blackHolePresetButtons) {
        button.addEventListener("click", () => {
          const preset = button.dataset.blackHolePreset as BlackHolePresetName | undefined;
          if (preset && preset in BLACK_HOLE_BACKGROUND_PRESETS) this.#blackHoleBackgroundController.applyPreset(preset);
        });
      }
      for (const [key, control] of this.#glowHorizonNumericControls) {
        control.input.addEventListener("input", () => {
          const normalized = normalizeGlowHorizonSettings({
            ...this.#glowHorizonBackgroundController.settings,
            [key]: control.input.value,
          });
          const value = normalized[key];
          control.input.value = String(value);
          const formatted = formatGlowHorizonControlValue(control.definition, value);
          control.output.textContent = formatted;
          control.input.setAttribute("aria-valuetext", formatted);
          this.#applyGlowHorizonSettingsFromControls();
        });
      }
      this.#glowHorizonInertialWheelInput.addEventListener("change", () => this.#applyGlowHorizonSettingsFromControls());
      for (const input of this.#glowHorizonColorInputs.values()) {
        input.addEventListener("input", () => this.#applyGlowHorizonSettingsFromControls());
      }
      this.#glowHorizonResetButton.addEventListener("click", () => {
        this.#glowHorizonBackgroundController.reset();
        this.#glowHorizonBackgroundController.replay();
      });
      this.#glowHorizonReplayButton.addEventListener("click", () => this.#glowHorizonBackgroundController.replay());
      for (const button of this.#shadow.querySelectorAll<HTMLButtonElement>("[data-glow-horizon-direction]")) {
        button.addEventListener("click", () => {
          const variant = button.dataset.glowHorizonDirection;
          if (variant !== "top" && variant !== "bottom" && variant !== "left" && variant !== "right") return;
          this.#glowHorizonBackgroundController.updateSettings({
            ...this.#glowHorizonBackgroundController.settings,
            variant,
          });
        });
      }
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
      this.#blackHoleSettingsOpen
      && !path.includes(this.#blackHoleSettingsPanel)
      && !path.includes(this.#blackHoleSettingsTrigger)
    ) {
      this.#closeBlackHoleSettings(false);
    }
    if (
      this.#glowHorizonSettingsOpen
      && !path.includes(this.#glowHorizonSettingsPanel)
      && !path.includes(this.#glowHorizonSettingsTrigger)
    ) {
      this.#closeGlowHorizonSettings(false);
    }
    if (
      !this.#previewMarketPopover.hidden
      && !path.includes(this.#previewMarketPopover)
      && !path.includes(this.#previewMarketButton)
      && !path.includes(this.#particleSettingsPanel)
      && !path.includes(this.#blackHoleSettingsPanel)
      && !path.includes(this.#glowHorizonSettingsPanel)
    ) {
      this.#closePreviewMarket(false);
    }
  };

  #onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.#particleMorphCurveDragState) {
      event.preventDefault();
      event.stopPropagation();
      this.#cancelParticleMorphCurveInteraction(true);
      return;
    }
    if (
      event.composedPath().includes(this.#particleMorphCurveEditor)
      && this.#particleMorphCurveFocusSnapshot
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.#particleMorphCurveDraft = cloneParticleMorphCurve(this.#particleMorphCurveFocusSnapshot);
      this.#renderParticleMorphCurveEditor();
      this.#saveParticleMorphCurve(this.#backgroundText("变形曲线已恢复", "Morph curve restored"));
      return;
    }
    const activeValueEditor = event.composedPath().find((target) => (
      target instanceof HTMLInputElement && target.classList.contains("particle-value-editor")
    ));
    if (activeValueEditor instanceof HTMLInputElement && !activeValueEditor.hidden) {
      const control = [
        ...this.#particleNumericControls.values(),
        ...this.#particleImageTransformControls.values(),
      ].find((candidate) => candidate.editor === activeValueEditor);
      if (control) {
        event.preventDefault();
        event.stopPropagation();
        this.#closeParticleValueEditor(control, true);
        return;
      }
    }
    if (this.#particleSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeParticleSettings(true);
      return;
    }
    if (this.#blackHoleSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeBlackHoleSettings(true);
      return;
    }
    if (this.#glowHorizonSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeGlowHorizonSettings(true);
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

  #isCurrentBackgroundInitialization(generation: number): boolean {
    return this.#connected && generation === this.#appearanceInitializationGeneration;
  }

  async #awaitBackgroundInitializations(operation: number): Promise<boolean> {
    const generation = this.#appearanceInitializationGeneration;
    this.#particleBackgroundInitialization ??= this.#initializeParticleBackground(generation);
    await this.#particleBackgroundInitialization;
    if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceOperation) return false;
    this.#blackHoleBackgroundInitialization ??= this.#particleBackgroundInitialization
      .then(() => this.#initializeBlackHoleBackground(generation));
    await this.#blackHoleBackgroundInitialization;
    if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceOperation) return false;
    this.#glowHorizonBackgroundInitialization ??= this.#blackHoleBackgroundInitialization
      .then(() => this.#initializeGlowHorizonBackground(generation));
    await this.#glowHorizonBackgroundInitialization;
    return this.#isCurrentBackgroundInitialization(generation) && operation === this.#appearanceOperation;
  }

  async #initializeParticleBackground(generation: number): Promise<void> {
    try {
      await this.#particleBackgroundController.initialize();
      if (!this.#isCurrentBackgroundInitialization(generation)) return;
      const enabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        let changed = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        if (this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== PARTICLE_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, PARTICLE_BACKGROUND_PLUGIN_ID);
        }
        await this.#particleBackgroundController.enable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#particleBackgroundController.stoppedForExternalThemeChange) {
          if (this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)) {
            this.#writeEnabledAppearancePlugins();
          }
          return;
        }
      } else if (!this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        && !this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) {
        await this.#particleBackgroundController.disable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Particle Image Background", error);
    } finally {
      if (this.#isCurrentBackgroundInitialization(generation)) this.#renderPreviewMarket();
    }
  }

  async #toggleParticleBackground(): Promise<void> {
    if (
      this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    let particleStarted = false;
    let blackHoleWasEnabled = false;
    let glowHorizonWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      previousTransparentBackground = this.#transparentBackgroundPresentation();
      const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
      const enabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
      const active = this.#particleBackgroundController.enabled;
      const nextEnabled = !enabled || !active;
      if (nextEnabled) {
        if ((transparentWasEnabled || transparentPresentationWasApplied) && bridge?.available) {
          await this.#setWindowTransparency(bridge, false);
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        if (!this.#connected || operation !== this.#appearanceOperation) return;
        this.#clearTransparentBackgroundPresentation();
        if (blackHoleWasEnabled || this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        if (glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== PARTICLE_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, PARTICLE_BACKGROUND_PLUGIN_ID);
        }
        await this.#particleBackgroundController.enable();
        particleStarted = this.#particleBackgroundController.enabled;
        if (this.#particleBackgroundController.stoppedForExternalThemeChange) {
          throw new Error(this.#particleBackgroundController.error ?? "Particle Image Background stopped because Codex Appearance changed.");
        }
        if (!particleStarted) throw new Error("Particle Image Background could not be enabled");
        if (!this.#connected || operation !== this.#appearanceOperation) {
          const reconcilePrevious = this.#connected && !this.#dismissed;
          const preserveTheme = reconcilePrevious && (blackHoleWasEnabled || glowHorizonWasEnabled);
          await this.#particleBackgroundController.disable(preserveTheme);
          if (reconcilePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          } else if (reconcilePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
            await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
          }
          return;
        }
        if (transparentWasEnabled) {
          this.#appearancePluginApplied = false;
          this.#appearancePluginError = undefined;
          this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        }
        this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(PARTICLE_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#particleBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Particle Image Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) {
        const stoppedForThemeChange = this.#particleBackgroundController.stoppedForExternalThemeChange;
        const reconcilePrevious = this.#connected
          && !this.#dismissed
          && !stoppedForThemeChange;
        if (particleStarted) {
          await this.#particleBackgroundController.disable(reconcilePrevious && (blackHoleWasEnabled || glowHorizonWasEnabled));
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (reconcilePrevious && blackHoleWasEnabled) {
          transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (reconcilePrevious && glowHorizonWasEnabled) {
          transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#particleBackgroundController.stoppedForExternalThemeChange;
      if (particleStarted) {
        await this.#particleBackgroundController.disable((blackHoleWasEnabled || glowHorizonWasEnabled) && !stoppedForThemeChange);
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
      }
      if (transparentWasEnabled && previousTransparentBackground) {
        if (bridge?.available) {
          try {
            const restored = await this.#setWindowTransparency(bridge, true);
            this.#applyTransparentBackgroundPresentation(restored.background);
          } catch {
            this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
          }
        } else {
          this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
        }
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

  async #initializeBlackHoleBackground(generation: number): Promise<void> {
    try {
      await this.#blackHoleBackgroundController.initialize();
      if (!this.#isCurrentBackgroundInitialization(generation)) return;
      const enabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        let changed = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        if (this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== BLACK_HOLE_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        }
        await this.#blackHoleBackgroundController.enable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#blackHoleBackgroundController.stoppedForExternalThemeChange) {
          if (this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)) {
            this.#writeEnabledAppearancePlugins();
          }
          return;
        }
      } else if (this.#blackHoleBackgroundController.enabled) {
        await this.#blackHoleBackgroundController.disable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Black Hole Background", error);
    } finally {
      if (this.#isCurrentBackgroundInitialization(generation)) this.#renderPreviewMarket();
    }
  }

  async #initializeGlowHorizonBackground(generation: number): Promise<void> {
    try {
      await this.#glowHorizonBackgroundController.initialize();
      if (!this.#isCurrentBackgroundInitialization(generation)) return;
      const enabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        let changed = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        if (this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== GLOW_HORIZON_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        }
        await this.#glowHorizonBackgroundController.enable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#glowHorizonBackgroundController.stoppedForExternalThemeChange) {
          if (this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) {
            this.#writeEnabledAppearancePlugins();
          }
          return;
        }
      } else if (this.#glowHorizonBackgroundController.enabled) {
        await this.#glowHorizonBackgroundController.disable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Glow Horizon Background", error);
    } finally {
      if (this.#isCurrentBackgroundInitialization(generation)) this.#renderPreviewMarket();
    }
  }

  async #toggleBlackHoleBackground(): Promise<void> {
    if (
      this.#blackHoleBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    let blackHoleStarted = false;
    let particleWasEnabled = false;
    let glowHorizonWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      previousTransparentBackground = this.#transparentBackgroundPresentation();
      const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
      const enabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
      const active = this.#blackHoleBackgroundController.enabled;
      const nextEnabled = !enabled || !active;
      if (nextEnabled) {
        if ((transparentWasEnabled || transparentPresentationWasApplied) && bridge?.available) {
          await this.#setWindowTransparency(bridge, false);
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        if (!this.#connected || operation !== this.#appearanceOperation) return;
        this.#clearTransparentBackgroundPresentation();
        if (particleWasEnabled || this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        if (glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== BLACK_HOLE_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        }
        await this.#blackHoleBackgroundController.enable();
        blackHoleStarted = this.#blackHoleBackgroundController.enabled;
        if (this.#blackHoleBackgroundController.stoppedForExternalThemeChange) {
          throw new Error(this.#blackHoleBackgroundController.error ?? "Black Hole Background stopped because Codex Appearance changed.");
        }
        if (!blackHoleStarted) throw new Error("Black Hole Background could not be enabled");
        if (!this.#connected || operation !== this.#appearanceOperation) {
          const reconcilePrevious = this.#connected && !this.#dismissed;
          const preserveTheme = reconcilePrevious && (particleWasEnabled || glowHorizonWasEnabled);
          await this.#blackHoleBackgroundController.disable(preserveTheme);
          if (reconcilePrevious && particleWasEnabled) {
            transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (reconcilePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
            await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
          }
          return;
        }
        if (transparentWasEnabled) {
          this.#appearancePluginApplied = false;
          this.#appearancePluginError = undefined;
          this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        }
        this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#blackHoleBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Black Hole Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) {
        const stoppedForThemeChange = this.#blackHoleBackgroundController.stoppedForExternalThemeChange;
        const reconcilePrevious = this.#connected
          && !this.#dismissed
          && !stoppedForThemeChange;
        if (blackHoleStarted) {
          await this.#blackHoleBackgroundController.disable(reconcilePrevious && (particleWasEnabled || glowHorizonWasEnabled));
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (reconcilePrevious && particleWasEnabled) {
          transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (reconcilePrevious && glowHorizonWasEnabled) {
          transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#blackHoleBackgroundController.stoppedForExternalThemeChange;
      if (blackHoleStarted) {
        await this.#blackHoleBackgroundController.disable((particleWasEnabled || glowHorizonWasEnabled) && !stoppedForThemeChange);
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
      }
      if (transparentWasEnabled && previousTransparentBackground) {
        if (bridge?.available) {
          try {
            const restored = await this.#setWindowTransparency(bridge, true);
            this.#applyTransparentBackgroundPresentation(restored.background);
          } catch {
            this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
          }
        } else {
          this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
        }
      }
      const message = error instanceof Error ? error.message : "Black Hole Background could not be changed";
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

  #applyGlowHorizonSettingsFromControls(): void {
    const values: Record<string, unknown> = { ...this.#glowHorizonBackgroundController.settings };
    for (const [key, control] of this.#glowHorizonNumericControls) values[key] = control.input.value;
    for (const [key, input] of this.#glowHorizonColorInputs) values[key] = input.value;
    values.inertialWheel = this.#glowHorizonInertialWheelInput.checked;
    this.#glowHorizonBackgroundController.updateSettings(normalizeGlowHorizonSettings(values));
  }

  async #toggleGlowHorizonBackground(): Promise<void> {
    if (
      this.#glowHorizonBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    let glowStarted = false;
    let particleWasEnabled = false;
    let blackHoleWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      previousTransparentBackground = this.#transparentBackgroundPresentation();
      const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
      const enabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
      const active = this.#glowHorizonBackgroundController.enabled;
      const nextEnabled = !enabled || !active;

      if (nextEnabled) {
        if ((transparentWasEnabled || transparentPresentationWasApplied) && bridge?.available) {
          await this.#setWindowTransparency(bridge, false);
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            return;
          }
        }
        if (!this.#connected || operation !== this.#appearanceOperation) return;
        this.#clearTransparentBackgroundPresentation();
        if (particleWasEnabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (blackHoleWasEnabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== GLOW_HORIZON_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        }
        await this.#glowHorizonBackgroundController.enable();
        glowStarted = this.#glowHorizonBackgroundController.enabled;
        if (this.#glowHorizonBackgroundController.stoppedForExternalThemeChange) {
          throw new Error(this.#glowHorizonBackgroundController.error
            ?? "Glow Horizon Background stopped because Codex Appearance changed.");
        }
        if (!glowStarted) throw new Error("Glow Horizon Background could not be enabled");
        if (!this.#connected || operation !== this.#appearanceOperation) {
          const restorePrevious = this.#connected && !this.#dismissed;
          await this.#glowHorizonBackgroundController.disable(restorePrevious && (particleWasEnabled || blackHoleWasEnabled));
          if (restorePrevious && particleWasEnabled) {
            transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          }
          return;
        }
        if (transparentWasEnabled) {
          this.#appearancePluginApplied = false;
          this.#appearancePluginError = undefined;
          this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        }
        this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#glowHorizonBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Glow Horizon Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) {
        const stoppedForThemeChange = this.#glowHorizonBackgroundController.stoppedForExternalThemeChange;
        const restorePrevious = this.#connected && !this.#dismissed && !stoppedForThemeChange;
        if (glowStarted) {
          await this.#glowHorizonBackgroundController.disable(restorePrevious && (particleWasEnabled || blackHoleWasEnabled));
        }
        if (restorePrevious && particleWasEnabled && !this.#particleBackgroundController.enabled) {
          transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
          transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#glowHorizonBackgroundController.stoppedForExternalThemeChange;
      if (glowStarted) {
        await this.#glowHorizonBackgroundController.disable((particleWasEnabled || blackHoleWasEnabled) && !stoppedForThemeChange);
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      }
      if (transparentWasEnabled && previousTransparentBackground) {
        if (bridge?.available) {
          try {
            const restored = await this.#setWindowTransparency(bridge, true);
            this.#applyTransparentBackgroundPresentation(restored.background);
          } catch {
            this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
          }
        } else {
          this.#applyTransparentBackgroundPresentation(previousTransparentBackground);
        }
      }
      const message = error instanceof Error ? error.message : "Glow Horizon Background could not be changed";
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

  #particleMorphCurvePoint(time: number, progress: number): { readonly x: number; readonly y: number } {
    const bounds = PARTICLE_MORPH_CURVE_EDITOR_BOUNDS;
    return {
      x: bounds.left + time * (bounds.right - bounds.left),
      y: bounds.bottom - progress * (bounds.bottom - bounds.top),
    };
  }

  #particleMorphCurvePathFor(curve: ParticleMorphCurve): string {
    const start = this.#particleMorphCurvePoint(0, 0);
    const end = this.#particleMorphCurvePoint(1, 1);
    if (!curve.nodes.length) {
      const outgoing = this.#particleMorphCurvePoint(curve.x1, curve.y1);
      const incoming = this.#particleMorphCurvePoint(curve.x2, curve.y2);
      return `M ${start.x} ${start.y} C ${outgoing.x} ${outgoing.y} ${incoming.x} ${incoming.y} ${end.x} ${end.y}`;
    }
    let path = "";
    for (let index = 0; index <= 96; index += 1) {
      const time = index / 96;
      const point = this.#particleMorphCurvePoint(
        time,
        evaluateParticleMorphCurve(time, curve).value,
      );
      path += `${index === 0 ? "M" : "L"} ${point.x} ${point.y} `;
    }
    return path.trim();
  }

  #updateParticleMorphCurveNodeSelection(): void {
    for (const element of this.#particleMorphCurveNodeElements) {
      const selected = Number(element.dataset.nodeIndex) === this.#particleMorphCurveSelectedNodeIndex;
      element.classList.toggle("is-selected", selected);
      element.setAttribute("aria-selected", String(selected));
    }
  }

  #createParticleMorphCurveNodeElement(index: number): SVGGElement {
    const element = document.createElementNS(PARTICLE_MORPH_CURVE_SVG_NS, "g");
    element.classList.add("particle-morph-curve-node");
    element.dataset.nodeIndex = String(index);
    element.setAttribute("tabindex", "0");
    element.setAttribute("role", "slider");
    element.setAttribute("aria-valuemin", "0");
    element.setAttribute("aria-valuemax", "100");
    const hit = document.createElementNS(PARTICLE_MORPH_CURVE_SVG_NS, "circle");
    hit.classList.add("particle-morph-curve-node-hit");
    hit.setAttribute("r", "12");
    const knob = document.createElementNS(PARTICLE_MORPH_CURVE_SVG_NS, "circle");
    knob.classList.add("particle-morph-curve-node-knob");
    knob.setAttribute("r", "4.5");
    element.append(hit, knob);

    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.#particleBackgroundController.pending) return;
      event.preventDefault();
      event.stopPropagation();
      const nodeIndex = Number(element.dataset.nodeIndex);
      if (!Number.isInteger(nodeIndex) || !this.#particleMorphCurveDraft.nodes[nodeIndex]) return;
      this.#particleMorphCurveSelectedNodeIndex = nodeIndex;
      this.#updateParticleMorphCurveNodeSelection();
      element.focus({ preventScroll: true });
      this.#particleMorphCurveDragState = {
        pointerId: event.pointerId,
        kind: "node",
        nodeIndex,
        targetElement: element,
        originalCurve: cloneParticleMorphCurve(this.#particleMorphCurveDraft),
      };
      this.#particleMorphCurveEditor.setPointerCapture?.(event.pointerId);
      this.#particleMorphCurveEditor.dataset.dragging = "true";
    });
    element.addEventListener("focus", () => {
      this.#particleMorphCurveSelectedNodeIndex = Number(element.dataset.nodeIndex);
      this.#updateParticleMorphCurveNodeSelection();
      this.#particleMorphCurveFocusSnapshot = cloneParticleMorphCurve(this.#particleMorphCurveDraft);
    });
    element.addEventListener("blur", () => {
      if (!this.#particleMorphCurveDragState) this.#particleMorphCurveFocusSnapshot = undefined;
    });
    element.addEventListener("keydown", (event) => {
      if (this.#particleBackgroundController.pending) return;
      const nodeIndex = Number(element.dataset.nodeIndex);
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        this.#removeParticleMorphCurveNode(nodeIndex);
        return;
      }
      const step = event.shiftKey ? 0.05 : 0.01;
      let timeDelta = 0;
      let progressDelta = 0;
      if (event.key === "ArrowLeft") timeDelta = -step;
      else if (event.key === "ArrowRight") timeDelta = step;
      else if (event.key === "ArrowDown") progressDelta = -step;
      else if (event.key === "ArrowUp") progressDelta = step;
      else return;
      event.preventDefault();
      const node = this.#particleMorphCurveDraft.nodes[nodeIndex];
      if (!node) return;
      this.#setParticleMorphCurveNode(nodeIndex, node.time + timeDelta, node.progress + progressDelta);
      this.#saveParticleMorphCurve(this.#backgroundText("变形关键帧已调整", "Morph keyframe adjusted"));
    });
    return element;
  }

  #renderParticleMorphCurveNodes(disabled: boolean): void {
    const nodes = this.#particleMorphCurveDraft.nodes;
    if (this.#particleMorphCurveNodeElements.length !== nodes.length) {
      const fragment = document.createDocumentFragment();
      this.#particleMorphCurveNodeElements = nodes.map((_node, index) => {
        const element = this.#createParticleMorphCurveNodeElement(index);
        fragment.append(element);
        return element;
      });
      this.#particleMorphCurveNodes.replaceChildren(fragment);
    }
    nodes.forEach((node, index) => {
      const element = this.#particleMorphCurveNodeElements[index];
      if (!element) return;
      const point = this.#particleMorphCurvePoint(node.time, node.progress);
      const timePercent = Math.round(node.time * 100);
      const progressPercent = Math.round(node.progress * 100);
      element.setAttribute("transform", `translate(${point.x} ${point.y})`);
      element.setAttribute("tabindex", disabled ? "-1" : "0");
      element.setAttribute("aria-disabled", String(disabled));
      element.setAttribute("aria-valuenow", String(progressPercent));
      element.setAttribute(
        "aria-valuetext",
        this.#backgroundText(
          `${progressPercent}% 变形进度，${timePercent}% 过渡时间`,
          `${progressPercent}% morph progress at ${timePercent}% transition time`,
        ),
      );
      element.setAttribute(
        "aria-label",
        this.#backgroundText(
          `中间关键帧：${timePercent}% 时间，${progressPercent}% 变形进度`,
          `Intermediate keyframe ${timePercent}% time, ${progressPercent}% morph progress`,
        ),
      );
    });
    this.#updateParticleMorphCurveNodeSelection();
  }

  #renderParticleMorphCurveEditor(): void {
    const curve = this.#particleMorphCurveDraft;
    const start = this.#particleMorphCurvePoint(0, 0);
    const end = this.#particleMorphCurvePoint(1, 1);
    const outgoing = this.#particleMorphCurvePoint(curve.x1, curve.y1);
    const incoming = this.#particleMorphCurvePoint(curve.x2, curve.y2);
    const path = this.#particleMorphCurvePathFor(curve);
    this.#particleMorphCurvePath.setAttribute("d", path);
    this.#particleMorphCurvePathGlow.setAttribute("d", path);
    this.#particleMorphCurveStartTangent.setAttribute("x1", String(start.x));
    this.#particleMorphCurveStartTangent.setAttribute("y1", String(start.y));
    this.#particleMorphCurveStartTangent.setAttribute("x2", String(outgoing.x));
    this.#particleMorphCurveStartTangent.setAttribute("y2", String(outgoing.y));
    this.#particleMorphCurveEndTangent.setAttribute("x1", String(end.x));
    this.#particleMorphCurveEndTangent.setAttribute("y1", String(end.y));
    this.#particleMorphCurveEndTangent.setAttribute("x2", String(incoming.x));
    this.#particleMorphCurveEndTangent.setAttribute("y2", String(incoming.y));
    this.#particleMorphCurveStartHandle.setAttribute("transform", `translate(${outgoing.x} ${outgoing.y})`);
    this.#particleMorphCurveEndHandle.setAttribute("transform", `translate(${incoming.x} ${incoming.y})`);
    const disabled = this.#particleBackgroundController.pending;
    this.#particleMorphCurveEditor.dataset.disabled = String(disabled);
    this.#particleMorphCurveEditor.setAttribute("aria-disabled", String(disabled));
    for (const [element, time, progress] of [
      [this.#particleMorphCurveStartHandle, curve.x1, curve.y1],
      [this.#particleMorphCurveEndHandle, curve.x2, curve.y2],
    ] as const) {
      const timePercent = Math.round(time * 100);
      const progressPercent = Math.round(progress * 100);
      element.setAttribute("tabindex", disabled ? "-1" : "0");
      element.setAttribute("aria-disabled", String(disabled));
      element.setAttribute("aria-valuenow", String(progressPercent));
      element.setAttribute(
        "aria-valuetext",
        this.#backgroundText(
          `${progressPercent}% 变形进度，${timePercent}% 过渡时间`,
          `${progressPercent}% morph progress at ${timePercent}% transition time`,
        ),
      );
    }
    this.#renderParticleMorphCurveNodes(disabled);
    const nodeCount = curve.nodes.length;
    const isDefault = particleMorphCurvesMatch(curve, DEFAULT_PARTICLE_MORPH_CURVE);
    const isLinear = Math.abs(curve.x1 - curve.y1) < 0.012
      && Math.abs(curve.x2 - curve.y2) < 0.012;
    this.#particleMorphCurveMode.textContent = isDefault
      ? this.#backgroundText("平滑", "Smooth")
      : nodeCount
        ? this.#backgroundText(
          `${nodeCount} 个关键帧`,
          `${nodeCount} keyframe${nodeCount === 1 ? "" : "s"}`,
        )
        : isLinear
          ? this.#backgroundText("线性", "Linear")
          : this.#backgroundText("自定义", "Custom");
    this.#particleMorphCurveReset.disabled = disabled || isDefault;
  }

  #setParticleMorphCurveHandle(handle: ParticleMorphCurveHandle, time: number, progress: number): void {
    let nextTime = clampParticleUnitInterval(time);
    let nextProgress = clampParticleUnitInterval(progress);
    const curve = this.#particleMorphCurveDraft;
    if (handle === "start") {
      nextTime = Math.min(nextTime, curve.x2);
      nextProgress = Math.min(nextProgress, curve.y2);
      this.#particleMorphCurveDraft = {
        ...curve,
        x1: Math.round(nextTime * 1_000) / 1_000,
        y1: Math.round(nextProgress * 1_000) / 1_000,
      };
    } else {
      nextTime = Math.max(nextTime, curve.x1);
      nextProgress = Math.max(nextProgress, curve.y1);
      this.#particleMorphCurveDraft = {
        ...curve,
        x2: Math.round(nextTime * 1_000) / 1_000,
        y2: Math.round(nextProgress * 1_000) / 1_000,
      };
    }
    this.#renderParticleMorphCurveEditor();
  }

  #setParticleMorphCurveNode(index: number, time: number, progress: number): void {
    const nodes = this.#particleMorphCurveDraft.nodes;
    if (!nodes[index]) return;
    const previous = nodes[index - 1];
    const next = nodes[index + 1];
    const timeLower = previous?.time ?? 0;
    const timeUpper = next?.time ?? 1;
    const progressLower = previous?.progress ?? 0;
    const progressUpper = next?.progress ?? 1;
    const timeGap = Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP, Math.max(0, timeUpper - timeLower) / 3);
    const progressGap = Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP, Math.max(0, progressUpper - progressLower) / 3);
    const nextTime = Math.min(timeUpper - timeGap, Math.max(timeLower + timeGap, clampParticleUnitInterval(time)));
    const nextProgress = Math.min(progressUpper - progressGap, Math.max(progressLower + progressGap, clampParticleUnitInterval(progress)));
    this.#particleMorphCurveDraft = {
      ...this.#particleMorphCurveDraft,
      nodes: nodes.map((node, nodeIndex) => nodeIndex === index
        ? {
            time: Math.round(nextTime * 1_000) / 1_000,
            progress: Math.round(nextProgress * 1_000) / 1_000,
          }
        : { ...node }),
    };
    this.#particleMorphCurveSelectedNodeIndex = index;
    this.#renderParticleMorphCurveEditor();
  }

  #addParticleMorphCurveNode(time: number, progress: number): void {
    const nodes = this.#particleMorphCurveDraft.nodes;
    if (nodes.length >= MAX_PARTICLE_MORPH_CURVE_NODES) {
      this.#showActionNotice(this.#backgroundText(
        `变形曲线最多支持 ${MAX_PARTICLE_MORPH_CURVE_NODES} 个关键帧。`,
        `Morph curves support up to ${MAX_PARTICLE_MORPH_CURVE_NODES} keyframes.`,
      ), "error");
      return;
    }
    const insertionIndex = nodes.findIndex((node) => node.time > time);
    const index = insertionIndex < 0 ? nodes.length : insertionIndex;
    const previous = nodes[index - 1];
    const next = nodes[index];
    const timeLower = previous?.time ?? 0;
    const timeUpper = next?.time ?? 1;
    const progressLower = previous?.progress ?? 0;
    const progressUpper = next?.progress ?? 1;
    const timeGap = Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP, Math.max(0, timeUpper - timeLower) / 3);
    const progressGap = Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP, Math.max(0, progressUpper - progressLower) / 3);
    const candidate = {
      time: Math.round(Math.min(timeUpper - timeGap, Math.max(timeLower + timeGap, clampParticleUnitInterval(time))) * 1_000) / 1_000,
      progress: Math.round(Math.min(progressUpper - progressGap, Math.max(progressLower + progressGap, clampParticleUnitInterval(progress))) * 1_000) / 1_000,
    };
    const nextNodes = [...nodes];
    nextNodes.splice(index, 0, candidate);
    this.#particleMorphCurveDraft = normalizeParticleMorphCurve({
      ...this.#particleMorphCurveDraft,
      nodes: nextNodes,
    });
    this.#particleMorphCurveSelectedNodeIndex = this.#particleMorphCurveDraft.nodes.findIndex((node) => (
      Math.abs(node.time - candidate.time) < 0.002
      && Math.abs(node.progress - candidate.progress) < 0.002
    ));
    this.#renderParticleMorphCurveEditor();
    this.#saveParticleMorphCurve(this.#backgroundText("已添加变形关键帧", "Morph keyframe added"));
  }

  #removeParticleMorphCurveNode(index: number): void {
    const node = this.#particleMorphCurveDraft.nodes[index];
    if (!node) return;
    this.#particleMorphCurveDraft = {
      ...this.#particleMorphCurveDraft,
      nodes: this.#particleMorphCurveDraft.nodes.filter((_candidate, nodeIndex) => nodeIndex !== index),
    };
    this.#particleMorphCurveSelectedNodeIndex = null;
    this.#renderParticleMorphCurveEditor();
    this.#saveParticleMorphCurve(this.#backgroundText(
      `已删除位于 ${Math.round(node.time * 100)}% 的变形关键帧`,
      `Morph keyframe at ${Math.round(node.time * 100)}% removed`,
    ));
  }

  #particleMorphCurvePointerValue(event: PointerEvent | MouseEvent): { readonly time: number; readonly progress: number } {
    const rect = this.#particleMorphCurveEditor.getBoundingClientRect();
    const bounds = PARTICLE_MORPH_CURVE_EDITOR_BOUNDS;
    const svgX = (event.clientX - rect.left) * bounds.width / Math.max(rect.width, 1);
    const svgY = (event.clientY - rect.top) * bounds.height / Math.max(rect.height, 1);
    return {
      time: (svgX - bounds.left) / (bounds.right - bounds.left),
      progress: (bounds.bottom - svgY) / (bounds.bottom - bounds.top),
    };
  }

  #finishParticleMorphCurveDrag(event: PointerEvent, cancelled: boolean): void {
    const drag = this.#particleMorphCurveDragState;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (this.#particleMorphCurveEditor.hasPointerCapture?.(event.pointerId)) {
      this.#particleMorphCurveEditor.releasePointerCapture?.(event.pointerId);
    }
    this.#particleMorphCurveDragState = undefined;
    this.#particleMorphCurveEditor.dataset.dragging = "false";
    if (cancelled) this.#particleMorphCurveDraft = cloneParticleMorphCurve(drag.originalCurve);
    this.#renderParticleMorphCurveEditor();
    if (!cancelled) this.#saveParticleMorphCurve(drag.kind === "node"
      ? this.#backgroundText("变形关键帧已保存", "Morph keyframe saved")
      : this.#backgroundText("变形曲线已保存", "Morph curve saved"));
  }

  #cancelParticleMorphCurveInteraction(restoreDraft: boolean): void {
    const drag = this.#particleMorphCurveDragState;
    if (drag) {
      if (this.#particleMorphCurveEditor.hasPointerCapture?.(drag.pointerId)) {
        this.#particleMorphCurveEditor.releasePointerCapture?.(drag.pointerId);
      }
      if (restoreDraft) this.#particleMorphCurveDraft = cloneParticleMorphCurve(drag.originalCurve);
    } else if (restoreDraft) {
      this.#particleMorphCurveDraft = cloneParticleMorphCurve(this.#particleBackgroundController.settings.morphCurve);
    }
    this.#particleMorphCurveDragState = undefined;
    this.#particleMorphCurveFocusSnapshot = undefined;
    this.#particleMorphCurveEditor.dataset.dragging = "false";
    this.#renderParticleMorphCurveEditor();
  }

  #saveParticleMorphCurve(message: string): void {
    const curve = normalizeParticleMorphCurve(this.#particleMorphCurveDraft);
    this.#particleMorphCurveDraft = cloneParticleMorphCurve(curve);
    void this.#particleBackgroundController.updateSettings(normalizeParticleSettings({
      ...this.#particleBackgroundController.settings,
      morphCurve: curve,
    })).then(() => this.#announce(`${message} · ${this.#backgroundText("将在下次图片切换时生效", "applies to the next image switch")}`)).catch((error: unknown) => {
      this.#showActionNotice(
        error instanceof Error ? error.message : "The morph curve could not be saved.",
        "error",
      );
    });
  }

  #bindParticleMorphCurveEditor(): void {
    for (const [element, handle] of [
      [this.#particleMorphCurveStartHandle, "start"],
      [this.#particleMorphCurveEndHandle, "end"],
    ] as const) {
      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || this.#particleBackgroundController.pending) return;
        event.preventDefault();
        element.focus({ preventScroll: true });
        this.#particleMorphCurveDragState = {
          pointerId: event.pointerId,
          kind: "handle",
          handle,
          targetElement: element,
          originalCurve: cloneParticleMorphCurve(this.#particleMorphCurveDraft),
        };
        this.#particleMorphCurveEditor.setPointerCapture?.(event.pointerId);
        this.#particleMorphCurveEditor.dataset.dragging = "true";
      });
      element.addEventListener("focus", () => {
        this.#particleMorphCurveFocusSnapshot = cloneParticleMorphCurve(this.#particleMorphCurveDraft);
      });
      element.addEventListener("blur", () => {
        if (!this.#particleMorphCurveDragState) this.#particleMorphCurveFocusSnapshot = undefined;
      });
      element.addEventListener("keydown", (event) => {
        if (this.#particleBackgroundController.pending) return;
        const step = event.shiftKey ? 0.05 : 0.01;
        let timeDelta = 0;
        let progressDelta = 0;
        if (event.key === "ArrowLeft") timeDelta = -step;
        else if (event.key === "ArrowRight") timeDelta = step;
        else if (event.key === "ArrowDown") progressDelta = -step;
        else if (event.key === "ArrowUp") progressDelta = step;
        else return;
        event.preventDefault();
        const curve = this.#particleMorphCurveDraft;
        this.#setParticleMorphCurveHandle(
          handle,
          (handle === "start" ? curve.x1 : curve.x2) + timeDelta,
          (handle === "start" ? curve.y1 : curve.y2) + progressDelta,
        );
        this.#saveParticleMorphCurve(this.#backgroundText("变形曲线已调整", "Morph curve adjusted"));
      });
    }

    this.#particleMorphCurveEditor.addEventListener("dblclick", (event) => {
      if (this.#particleBackgroundController.pending) return;
      const target = event.target;
      if (
        target instanceof Element
        && target.closest(".particle-morph-curve-handle, .particle-morph-curve-node")
      ) return;
      event.preventDefault();
      const value = this.#particleMorphCurvePointerValue(event);
      this.#addParticleMorphCurveNode(value.time, value.progress);
    });
    this.#particleMorphCurveEditor.addEventListener("pointermove", (event) => {
      const drag = this.#particleMorphCurveDragState;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const value = this.#particleMorphCurvePointerValue(event);
      if (drag.kind === "node") this.#setParticleMorphCurveNode(drag.nodeIndex, value.time, value.progress);
      else this.#setParticleMorphCurveHandle(drag.handle, value.time, value.progress);
    });
    this.#particleMorphCurveEditor.addEventListener("pointerup", (event) => {
      this.#finishParticleMorphCurveDrag(event, false);
    });
    this.#particleMorphCurveEditor.addEventListener("pointercancel", (event) => {
      this.#finishParticleMorphCurveDrag(event, true);
    });
    this.#particleMorphCurveReset.addEventListener("click", () => {
      if (this.#particleBackgroundController.pending) return;
      this.#particleMorphCurveDraft = cloneParticleMorphCurve(DEFAULT_PARTICLE_MORPH_CURVE);
      this.#particleMorphCurveSelectedNodeIndex = null;
      this.#renderParticleMorphCurveEditor();
      this.#saveParticleMorphCurve(this.#backgroundText("变形曲线已重置为平滑", "Morph curve reset to Smooth"));
    });
    this.#renderParticleMorphCurveEditor();
  }

  #syncParticleValueControl(control: ParticleValueControl, value: number): void {
    const formattedValue = control.definition.format(value);
    control.output.value = formattedValue;
    control.input.setAttribute("aria-valuetext", formattedValue);
    control.output.setAttribute(
      "aria-label",
      particleOutputAriaLabel(control.definition, formattedValue, this.#backgroundSettingsLanguage),
    );
    if (control.editor.hidden) {
      control.editor.value = String(particleEditorNumber(control.definition, value));
    }
  }

  #bindParticleValueEditor(control: ParticleValueControl): void {
    control.output.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.#beginParticleValueEditing(control);
    });
    control.output.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "F2") return;
      event.preventDefault();
      event.stopPropagation();
      this.#beginParticleValueEditing(control);
    });
    control.editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        this.#commitParticleValueEditor(control, true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.#closeParticleValueEditor(control, true);
      }
    });
    control.editor.addEventListener("blur", () => this.#commitParticleValueEditor(control, false));
  }

  #beginParticleValueEditing(control: ParticleValueControl): void {
    if (control.input.disabled || !control.editor.hidden) return;
    this.#cancelParticleValueEditors();
    control.editor.value = String(particleEditorNumber(control.definition, Number(control.input.value)));
    control.output.hidden = true;
    control.editor.hidden = false;
    control.editor.focus({ preventScroll: true });
    control.editor.select();
  }

  #commitParticleValueEditor(control: ParticleValueControl, restoreFocus: boolean): void {
    if (control.editor.hidden) return;
    const enteredValue = control.editor.valueAsNumber;
    if (Number.isFinite(enteredValue) && !control.input.disabled) {
      control.input.value = String(enteredValue / particleEditorScale(control.definition));
      this.#closeParticleValueEditor(control, restoreFocus);
      control.input.dispatchEvent(new Event("input", { bubbles: true }));
      control.input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    this.#closeParticleValueEditor(control, restoreFocus);
  }

  #closeParticleValueEditor(control: ParticleValueControl, restoreFocus: boolean): void {
    if (control.editor.hidden) return;
    control.editor.hidden = true;
    control.output.hidden = false;
    control.editor.value = String(particleEditorNumber(control.definition, Number(control.input.value)));
    if (restoreFocus && control.output.isConnected) control.output.focus({ preventScroll: true });
  }

  #cancelParticleValueEditors(): void {
    for (const control of this.#particleNumericControls.values()) {
      this.#closeParticleValueEditor(control, false);
    }
    for (const control of this.#particleImageTransformControls.values()) {
      this.#closeParticleValueEditor(control, false);
    }
  }

  async #applyParticleSettingsFromControls(): Promise<void> {
    const current = this.#particleBackgroundController.settings;
    const values: Record<string, unknown> = { ...current };
    for (const [key, { input }] of this.#particleNumericControls) values[key] = input.value;
    values.morphCurve = this.#particleMorphCurveDraft;
    values.autoSwitch = this.#particleAutoSwitchInput.checked;
    values.showSourceImage = this.#particleShowSourceInput.checked;
    values.backgroundColor = this.#particleBackgroundColorInput.value;
    values.cursorInteraction = this.#particleCursorInteractionInput.checked;
    await this.#particleBackgroundController.updateSettings(normalizeParticleSettings(values));
  }

  #particleImageTransformFromControls(): ParticleImageTransform {
    const values: Record<string, unknown> = {};
    for (const [key, { input }] of this.#particleImageTransformControls) values[key] = input.value;
    return normalizeParticleImageTransform(values);
  }

  async #saveParticleImageTransform(): Promise<void> {
    const id = this.#particleTransformImageId;
    if (!id) return;
    await this.#particleBackgroundController.updateImageTransform(id, this.#particleImageTransformFromControls());
  }

  async #resetParticleImageTransform(): Promise<void> {
    const id = this.#particleTransformImageId;
    if (!id) return;
    for (const [key, control] of this.#particleImageTransformControls) {
      const { input } = control;
      const value = DEFAULT_PARTICLE_IMAGE_TRANSFORM[key];
      input.value = String(value);
      this.#syncParticleValueControl(control, value);
    }
    this.#particleBackgroundController.previewImageTransform(id, DEFAULT_PARTICLE_IMAGE_TRANSFORM);
    await this.#particleBackgroundController.updateImageTransform(id, DEFAULT_PARTICLE_IMAGE_TRANSFORM);
  }

  async #onParticleLibraryClick(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button[data-particle-image-id]");
    if (!button || !this.#particleLibraryGrid.contains(button)) return;
    const id = button.dataset.particleImageId;
    if (!id) return;
    const action = button.dataset.particleAction;
    if (action === "delete") {
      if (this.#particleTransformImageId === id) {
        this.#particleTransformImageId = null;
        this.#particleBackgroundController.finishImageTransformEditing();
      }
      await this.#particleBackgroundController.deleteImage(id);
    } else if (action === "adjust") {
      this.#particleTransformImageId = id;
      this.#renderParticleBackgroundPlugin();
      this.#particleImageTransformEditor.scrollIntoView({ block: "nearest" });
      this.#particleImageTransformEditor.focus({ preventScroll: true });
      const editingReady = await this.#particleBackgroundController.beginImageTransformEditing(id);
      if (!this.#particleSettingsOpen || this.#particleTransformImageId !== id) return;
      if (!editingReady) this.#particleTransformImageId = null;
      this.#renderParticleBackgroundPlugin();
      if (editingReady) this.#particleImageTransformControls.get("positionX")?.input.focus();
    } else {
      await this.#particleBackgroundController.toggleImageSelection(id);
    }
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
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;

    const settings = controller.settings;
    for (const [key, control] of this.#particleNumericControls) {
      const { input, editor } = control;
      const value = settings[key];
      input.value = String(value);
      input.disabled = controller.pending;
      editor.disabled = input.disabled;
      if (editor.disabled) this.#closeParticleValueEditor(control, false);
      this.#syncParticleValueControl(control, value);
    }
    if (!this.#particleMorphCurveDragState) {
      this.#particleMorphCurveDraft = cloneParticleMorphCurve(settings.morphCurve);
    }
    this.#renderParticleMorphCurveEditor();
    this.#particleAutoSwitchInput.checked = settings.autoSwitch;
    this.#particleShowSourceInput.checked = settings.showSourceImage;
    this.#particleBackgroundColorInput.value = settings.backgroundColor;
    this.#particleCursorInteractionInput.checked = settings.cursorInteraction;

    const records = controller.records;
    const selectedIds = new Set(settings.selectedImageIds);
    const transformRecord = records.find((record) => record.id === this.#particleTransformImageId);
    this.#particleTransformImageId = transformRecord?.id ?? null;
    this.#particleImageTransformEditor.dataset.empty = String(!transformRecord);
    this.#particleImageTransformEditor.setAttribute("aria-busy", String(controller.pending && Boolean(transformRecord)));
    this.#particleImageTransformThumb.hidden = !transformRecord;
    this.#particleImageTransformName.textContent = transformRecord
      ? this.#backgroundText(`正在调整：${transformRecord.name}`, `Adjusting: ${transformRecord.name}`)
      : this.#backgroundText("选择照片", "Select a photo");
    if (transformRecord) {
      this.#particleImageTransformThumb.src = controller.thumbnailUrl(transformRecord);
    } else {
      this.#particleImageTransformThumb.removeAttribute("src");
    }
    for (const [key, control] of this.#particleImageTransformControls) {
      const { input, editor } = control;
      const value = transformRecord?.[key] ?? DEFAULT_PARTICLE_IMAGE_TRANSFORM[key];
      input.value = String(value);
      input.disabled = controller.pending || !transformRecord;
      editor.disabled = input.disabled;
      if (editor.disabled) this.#closeParticleValueEditor(control, false);
      this.#syncParticleValueControl(control, value);
    }
    this.#particleImageTransformReset.disabled = controller.pending || !transformRecord || (
      transformRecord.positionX === DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionX
      && transformRecord.positionY === DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionY
      && transformRecord.zoom === DEFAULT_PARTICLE_IMAGE_TRANSFORM.zoom
    );
    this.#particleSourceCount.textContent = records.length
      ? this.#backgroundText(
        `${records.length} 个已保存 · ${selectedIds.size} 个已选`,
        `${records.length} saved · ${selectedIds.size} selected`,
      )
      : this.#backgroundText("0 个已保存", "0 saved");
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
      empty.textContent = this.#backgroundText(
        "添加图片后按播放顺序选择。",
        "Add images, then select them in playback order.",
      );
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
      selectButton.disabled = controller.pending;
      selectButton.setAttribute("aria-pressed", String(orderIndex >= 0));
      selectButton.setAttribute("aria-label", orderIndex >= 0
        ? this.#backgroundText(
          `从切换顺序移除 ${record.name}`,
          `Remove ${record.name} from the switching order`,
        )
        : this.#backgroundText(
          `添加 ${record.name} 到切换顺序`,
          `Add ${record.name} to the switching order`,
        ));
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
        live.textContent = this.#backgroundText("当前", "LIVE");
        live.setAttribute("aria-hidden", "true");
        item.append(live);
      }
      const adjustButton = document.createElement("button");
      adjustButton.className = "particle-library-adjust";
      adjustButton.type = "button";
      adjustButton.dataset.particleImageId = record.id;
      adjustButton.dataset.particleAction = "adjust";
      adjustButton.innerHTML = icons.sliders;
      adjustButton.disabled = controller.pending;
      adjustButton.setAttribute("aria-pressed", String(record.id === this.#particleTransformImageId));
      adjustButton.setAttribute(
        "aria-label",
        this.#backgroundText(
          `调整 ${record.name} 的位置和缩放`,
          `Adjust position and zoom for ${record.name}`,
        ),
      );
      adjustButton.title = this.#backgroundText("调整位置和缩放", "Adjust position and zoom");
      item.append(adjustButton);
      const deleteButton = document.createElement("button");
      deleteButton.className = "particle-library-delete";
      deleteButton.type = "button";
      deleteButton.dataset.particleImageId = record.id;
      deleteButton.dataset.particleAction = "delete";
      deleteButton.disabled = controller.pending;
      deleteButton.textContent = "×";
      deleteButton.setAttribute(
        "aria-label",
        this.#backgroundText(
          `从图片库删除 ${record.name}`,
          `Delete ${record.name} from the image library`,
        ),
      );
      deleteButton.title = this.#backgroundText("删除图片", "Delete image");
      item.append(deleteButton);
      fragment.append(item);
    }
    this.#particleLibraryGrid.replaceChildren(fragment);
    const error = controller.error;
    this.#particlePluginError.hidden = !error;
    this.#particlePluginError.textContent = backgroundSettingsError(
      error,
      this.#backgroundSettingsLanguage,
      "粒子图片背景",
      "Particle Image Background",
    );
    if (this.#particleSettingsOpen) requestAnimationFrame(() => this.#positionParticleSettingsPanel());
  }

  #applyBlackHoleSettingsFromControls(): void {
    const values: Record<string, unknown> = { ...this.#blackHoleBackgroundController.settings };
    for (const [key, control] of this.#blackHoleNumericControls) values[key] = control.input.value;
    for (const [key, input] of this.#blackHoleColorInputs) values[key] = input.value;
    values.paused = this.#blackHolePausedInput.checked;
    this.#blackHoleBackgroundController.updateSettings(normalizeBlackHoleSettings(values));
  }

  #renderBlackHoleBackgroundPlugin(): void {
    const controller = this.#blackHoleBackgroundController;
    const enabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
    const active = enabled && controller.enabled;
    const action = enabled && !active ? "Retry" : enabled ? "Disable" : "Enable";
    let status = enabled ? "Enabled" : "Disabled";
    if (controller.pending) status = enabled || controller.enabled ? "Enabled · Applying" : "Applying";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (active && controller.error) status = "Enabled · Notice";
    this.#blackHoleBackgroundStatus.textContent = status;
    this.#blackHoleBackgroundStatus.dataset.enabled = String(active);
    this.#blackHoleBackgroundStatus.dataset.pending = String(controller.pending);
    this.#blackHoleBackgroundCard.setAttribute("aria-busy", String(controller.pending));
    this.#blackHoleBackgroundButton.textContent = controller.pending ? "Applying…" : action;
    this.#blackHoleBackgroundButton.dataset.enabled = String(enabled);
    this.#blackHoleBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#blackHoleBackgroundButton.setAttribute(
      "aria-label",
      controller.pending
        ? "Applying Black Hole Background"
        : `${action} Black Hole Background`,
    );
    this.#blackHoleBackgroundButton.disabled = controller.pending
      || this.#particleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;

    const settings = controller.settings;
    for (const [key, control] of this.#blackHoleNumericControls) {
      const value = settings[key];
      const formatted = formatBlackHoleControlValue(control.definition, value);
      control.input.value = String(value);
      control.input.disabled = controller.pending;
      control.input.setAttribute("aria-valuetext", formatted);
      control.output.textContent = formatted;
    }
    for (const [key, input] of this.#blackHoleColorInputs) {
      input.value = settings[key];
      input.disabled = controller.pending;
    }
    this.#blackHolePausedInput.checked = settings.paused;
    this.#blackHolePausedInput.disabled = controller.pending;
    this.#blackHoleResetButton.disabled = controller.pending;
    for (const button of this.#blackHolePresetButtons) {
      const preset = button.dataset.blackHolePreset as BlackHolePresetName | undefined;
      const selected = Boolean(preset && JSON.stringify(settings) === JSON.stringify(BLACK_HOLE_BACKGROUND_PRESETS[preset]));
      button.disabled = controller.pending;
      button.setAttribute("aria-pressed", String(selected));
    }
    const error = controller.error;
    this.#blackHolePluginError.hidden = !error;
    this.#blackHolePluginError.textContent = backgroundSettingsError(
      error,
      this.#backgroundSettingsLanguage,
      "黑洞背景",
      "Black Hole Background",
    );
    this.#blackHoleSettingsPanel.setAttribute("aria-busy", String(controller.pending));
    if (this.#blackHoleSettingsOpen) requestAnimationFrame(() => this.#positionBlackHoleSettingsPanel());
  }

  #renderGlowHorizonBackgroundPlugin(): void {
    const controller = this.#glowHorizonBackgroundController;
    const enabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
    const active = enabled && controller.enabled;
    const action = enabled && !active ? "Retry" : enabled ? "Disable" : "Enable";
    let status = enabled ? "Enabled" : "Disabled";
    if (controller.pending) status = enabled || controller.enabled ? "Enabled · Applying" : "Applying";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (active && controller.error) status = "Enabled · Notice";
    this.#glowHorizonBackgroundStatus.textContent = status;
    this.#glowHorizonBackgroundStatus.dataset.enabled = String(active);
    this.#glowHorizonBackgroundStatus.dataset.pending = String(controller.pending);
    this.#glowHorizonBackgroundCard.setAttribute("aria-busy", String(controller.pending));
    this.#glowHorizonBackgroundButton.textContent = controller.pending ? "Applying…" : action;
    this.#glowHorizonBackgroundButton.dataset.enabled = String(enabled);
    this.#glowHorizonBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#glowHorizonBackgroundButton.setAttribute(
      "aria-label",
      controller.pending
        ? "Applying Glow Horizon Background"
        : `${action} Glow Horizon Background`,
    );
    this.#glowHorizonBackgroundButton.disabled = controller.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;

    const settings = controller.settings;
    for (const [key, control] of this.#glowHorizonNumericControls) {
      const value = settings[key];
      const formatted = formatGlowHorizonControlValue(control.definition, value);
      control.input.value = String(value);
      control.input.disabled = controller.pending;
      control.input.setAttribute("aria-valuetext", formatted);
      control.output.textContent = formatted;
    }
    this.#glowHorizonInertialWheelInput.checked = settings.inertialWheel;
    this.#glowHorizonInertialWheelInput.disabled = controller.pending;
    for (const [key, input] of this.#glowHorizonColorInputs) {
      input.value = settings[key];
      input.disabled = controller.pending;
    }
    for (const button of this.#shadow.querySelectorAll<HTMLButtonElement>("[data-glow-horizon-direction]")) {
      button.setAttribute("aria-pressed", String(button.dataset.glowHorizonDirection === settings.variant));
      button.disabled = controller.pending;
    }
    this.#glowHorizonResetButton.disabled = controller.pending;
    this.#glowHorizonReplayButton.disabled = controller.pending || !controller.enabled;
    const error = controller.error;
    this.#glowHorizonPluginError.hidden = !error;
    this.#glowHorizonPluginError.textContent = backgroundSettingsError(
      error,
      this.#backgroundSettingsLanguage,
      "发光地平线背景",
      "Glow Horizon Background",
    );
    this.#glowHorizonSettingsPanel.setAttribute("aria-busy", String(controller.pending));
    if (this.#glowHorizonSettingsOpen) requestAnimationFrame(() => this.#positionGlowHorizonSettingsPanel());
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
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
        await this.#reconcilePersistedWindowTransparency();
        return;
      }
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
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#renderPreviewMarket();
    let bridge: ExplorerBridge | undefined;
    let nextEnabled = false;
    let previousBackground: string | undefined;
    let particleWasActive = false;
    let blackHoleWasActive = false;
    let glowHorizonWasActive = false;
    try {
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      bridge = this.#bridge;
      const enabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      nextEnabled = !enabled;
      if (!nextEnabled) this.#cancelAppearanceHealthCheck();
      if (!bridge?.available) {
        this.#appearancePluginApplied = undefined;
        this.#appearancePluginError = "Restart Codex with Code-Codex, then try again.";
        this.#showActionNotice(`Transparent Background was not changed. ${this.#appearancePluginError}`, "error");
        return;
      }
      if (nextEnabled && this.#transparencyPreferenceBlocked()) {
        this.#appearancePluginError = "Turn off high contrast or reduced transparency, then try again.";
        this.#showActionNotice(`Transparent Background was not enabled. ${this.#appearancePluginError}`, "error");
        return;
      }

      this.#appearancePluginPending = true;
      this.#appearancePluginError = undefined;
      this.#renderPreviewMarket();
      previousBackground = this.#transparentBackgroundPresentation();
      this.#clearTransparentBackgroundPresentation();
      const result = await this.#setWindowTransparency(bridge, nextEnabled);
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
        await this.#reconcilePersistedWindowTransparency();
        return;
      }
      if (nextEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = nextEnabled;
      if (nextEnabled) {
        const particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
        const blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        const glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        particleWasActive = particleWasEnabled || this.#particleBackgroundController.enabled;
        blackHoleWasActive = blackHoleWasEnabled || this.#blackHoleBackgroundController.enabled;
        glowHorizonWasActive = glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled;
        if (particleWasActive) {
          await this.#particleBackgroundController.disable();
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            if (this.#connected && !this.#dismissed && particleWasActive) {
              await this.#particleBackgroundController.enable().catch(() => undefined);
            }
            return;
          }
        }
        if (blackHoleWasActive) {
          await this.#blackHoleBackgroundController.disable();
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            if (this.#connected && !this.#dismissed) {
              if (blackHoleWasActive) await this.#blackHoleBackgroundController.enable().catch(() => undefined);
              else if (particleWasActive) await this.#particleBackgroundController.enable().catch(() => undefined);
            }
            return;
          }
        }
        if (glowHorizonWasActive) {
          await this.#glowHorizonBackgroundController.disable();
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            if (this.#connected && !this.#dismissed) {
              if (glowHorizonWasActive) await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
              else if (blackHoleWasActive) await this.#blackHoleBackgroundController.enable().catch(() => undefined);
              else if (particleWasActive) await this.#particleBackgroundController.enable().catch(() => undefined);
            }
            return;
          }
        }
        this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      } else {
        this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#renderParticleBackgroundPlugin();
      this.#renderBlackHoleBackgroundPlugin();
      this.#renderGlowHorizonBackgroundPlugin();
      this.#announce(`Transparent Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      if (nextEnabled) {
        if (glowHorizonWasActive && !this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        } else if (blackHoleWasActive && !this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (particleWasActive && !this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.enable().catch(() => undefined);
        }
      }
      if (!nextEnabled && previousBackground) this.#applyTransparentBackgroundPresentation(previousBackground);
      if (nextEnabled) this.#appearancePluginApplied = false;
      this.#appearancePluginError = transparencyActionError(error, nextEnabled);
      this.#showActionNotice(this.#appearancePluginError, "error");
    } finally {
      if (this.#connected && operation === this.#appearanceOperation) {
        this.#appearancePluginPending = false;
        this.#appearanceTransitionPending = false;
        this.#renderPreviewMarket();
        if (bridge?.available) this.#flushQueuedAppearanceSync(bridge);
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
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
        await this.#reconcilePersistedWindowTransparency();
        return;
      }
      if (requestedEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      this.#appearancePluginApplied = requestedEnabled;
    } catch (error) {
      if (!this.#isCurrentAppearanceOperation(bridge, operation)) return;
      if (
        !requestedEnabled
        && previousBackground
        && !this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        && !this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        && !this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
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

  async #reconcilePersistedWindowTransparency(): Promise<void> {
    const bridge = this.#bridge;
    if (!bridge?.available) return;
    const requestedEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)
      && !this.#transparencyPreferenceBlocked();
    try {
      const result = await this.#setWindowTransparency(bridge, requestedEnabled);
      if (this.#bridge !== bridge) return;
      if (requestedEnabled) this.#applyTransparentBackgroundPresentation(result.background);
      else this.#clearTransparentBackgroundPresentation();
      this.#appearancePluginApplied = requestedEnabled;
    } catch {
      // The next bridge synchronization retries the persisted preference.
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
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
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
    this.#cancelParticleValueEditors();
    this.#cancelParticleMorphCurveInteraction(true);
    this.#particleBackgroundController.finishImageTransformEditing();
    this.#particleTransformImageId = null;
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

  #toggleBlackHoleSettings(): void {
    if (this.#blackHoleSettingsOpen) {
      this.#closeBlackHoleSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#blackHoleSettingsOpen = true;
    this.#blackHoleSettingsTrigger.setAttribute("aria-expanded", "true");
    this.#renderBlackHoleBackgroundPlugin();
    if (!this.#blackHoleSettingsPanel.matches(":popover-open")) this.#blackHoleSettingsPanel.showPopover();
    this.#positionBlackHoleSettingsPanel();
    queueMicrotask(() => {
      if (!this.#blackHoleSettingsOpen) return;
      this.#positionBlackHoleSettingsPanel();
      this.#blackHoleSettingsCloseButton.focus();
    });
  }

  #closeBlackHoleSettings(restoreFocus: boolean): void {
    if (!this.#blackHoleSettingsOpen && !this.#blackHoleSettingsPanel.matches(":popover-open")) return;
    this.#blackHoleSettingsOpen = false;
    this.#blackHoleSettingsTrigger.setAttribute("aria-expanded", "false");
    if (this.#blackHoleSettingsPanel.matches(":popover-open")) this.#blackHoleSettingsPanel.hidePopover();
    if (restoreFocus && this.#blackHoleSettingsTrigger.isConnected) this.#blackHoleSettingsTrigger.focus();
  }

  #positionBlackHoleSettingsPanel(): void {
    if (!this.#blackHoleSettingsOpen || !this.#blackHoleSettingsPanel.matches(":popover-open")) return;
    const panel = this.#blackHoleSettingsPanel;
    const cardRect = this.#blackHoleBackgroundCard.getBoundingClientRect();
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

  #toggleGlowHorizonSettings(): void {
    if (this.#glowHorizonSettingsOpen) {
      this.#closeGlowHorizonSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeBlackHoleSettings(false);
    this.#glowHorizonSettingsOpen = true;
    this.#glowHorizonSettingsTrigger.setAttribute("aria-expanded", "true");
    this.#renderGlowHorizonBackgroundPlugin();
    if (!this.#glowHorizonSettingsPanel.matches(":popover-open")) this.#glowHorizonSettingsPanel.showPopover();
    this.#positionGlowHorizonSettingsPanel();
    queueMicrotask(() => {
      if (!this.#glowHorizonSettingsOpen) return;
      this.#positionGlowHorizonSettingsPanel();
      this.#glowHorizonSettingsCloseButton.focus();
    });
  }

  #closeGlowHorizonSettings(restoreFocus: boolean): void {
    if (!this.#glowHorizonSettingsOpen && !this.#glowHorizonSettingsPanel.matches(":popover-open")) return;
    this.#glowHorizonSettingsOpen = false;
    this.#glowHorizonSettingsTrigger.setAttribute("aria-expanded", "false");
    if (this.#glowHorizonSettingsPanel.matches(":popover-open")) this.#glowHorizonSettingsPanel.hidePopover();
    if (restoreFocus && this.#glowHorizonSettingsTrigger.isConnected) this.#glowHorizonSettingsTrigger.focus();
  }

  #positionGlowHorizonSettingsPanel(): void {
    if (!this.#glowHorizonSettingsOpen || !this.#glowHorizonSettingsPanel.matches(":popover-open")) return;
    const panel = this.#glowHorizonSettingsPanel;
    const cardRect = this.#glowHorizonBackgroundCard.getBoundingClientRect();
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
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
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
    this.#renderBlackHoleBackgroundPlugin();
    this.#renderGlowHorizonBackgroundPlugin();
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
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
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

  #cancelUpdateCheck(): void {
    this.#updateCheckOperation += 1;
    this.#updateCheckPending = false;
    if (this.#updateCheckPresentation === "checking") {
      this.#updateCheckPresentation = "idle";
      this.#updateCheckSummary = `Check GitHub for updates (current version v${__CODE_CODEX_VERSION__})`;
      if (!this.#actionNotice.hidden && this.#actionNotice.dataset.tone === "progress") this.#hideActionNotice();
    }
  }

  async #checkForUpdates(): Promise<void> {
    const versionVisible = this.#state === "ready" || this.#state === "empty" || this.#state === "no-project";
    if (!versionVisible || this.#updateCheckPending) return;

    const bridge = this.#bridge;
    if (!bridge?.available) {
      this.#updateCheckPresentation = "error";
      this.#updateCheckSummary = "Could not check GitHub because Code-Codex is disconnected.";
      this.#renderStatus();
      this.#showActionNotice(this.#updateCheckSummary, "error");
      return;
    }

    const operation = ++this.#updateCheckOperation;
    this.#updateCheckPending = true;
    this.#updateCheckPresentation = "checking";
    this.#updateCheckSummary = "Checking GitHub for the latest release…";
    this.#renderStatus();
    this.#showActionProgress(this.#updateCheckSummary);

    try {
      const result = normalizeUpdateCheckResult(await bridge.request<unknown>("explorer.update.check", {}));
      if (operation !== this.#updateCheckOperation || !this.#connected || bridge !== this.#bridge) return;

      this.#updateCheckPresentation = result.status;
      if (result.status === "updateAvailable") {
        this.#updateCheckSummary = `Code-Codex v${result.latestVersion} is available on GitHub.`;
      } else if (result.status === "ahead") {
        this.#updateCheckSummary = `This build (v${result.currentVersion}) is newer than GitHub’s latest published release (v${result.latestVersion}).`;
      } else {
        this.#updateCheckSummary = `Code-Codex v${result.currentVersion} is up to date.`;
      }
      this.#showActionNotice(this.#updateCheckSummary);
    } catch (error) {
      if (operation !== this.#updateCheckOperation || !this.#connected || bridge !== this.#bridge) return;
      this.#updateCheckPresentation = "error";
      this.#updateCheckSummary = updateCheckError(error);
      this.#showActionNotice(this.#updateCheckSummary, "error");
    } finally {
      if (operation === this.#updateCheckOperation) {
        this.#updateCheckPending = false;
        this.#renderStatus();
      }
    }
  }

  #renderStatus(): void {
    const versionVisible = this.#state === "ready" || this.#state === "empty" || this.#state === "no-project";
    this.#statusCode.textContent = versionVisible ? `v${__CODE_CODEX_VERSION__}` : this.#state.toUpperCase().slice(0, 8);
    this.#statusCode.disabled = !versionVisible || this.#updateCheckPending;
    this.#statusCode.dataset.updateState = versionVisible ? this.#updateCheckPresentation : "idle";
    this.#statusCode.setAttribute("aria-busy", String(versionVisible && this.#updateCheckPending));
    if (versionVisible) {
      this.#statusCode.title = this.#updateCheckSummary;
      this.#statusCode.setAttribute("aria-label", this.#updateCheckSummary);
    } else {
      this.#statusCode.removeAttribute("title");
      this.#statusCode.setAttribute("aria-label", this.#statusCode.textContent);
    }
  }

  #announce(message: string): void {
    this.#liveRegion.textContent = "";
    requestAnimationFrame(() => (this.#liveRegion.textContent = message));
  }

  #showActionNotice(message: string, tone: "success" | "error" = "success"): void {
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

function normalizeUpdateCheckResult(raw: unknown): UpdateCheckResult {
  const object = asRecord(raw);
  const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
  const status = object?.status;
  if (
    !object ||
    Object.keys(object).length !== 5 ||
    typeof object.currentVersion !== "string" ||
    object.currentVersion !== __CODE_CODEX_VERSION__ ||
    !versionPattern.test(object.currentVersion) ||
    typeof object.latestVersion !== "string" ||
    !versionPattern.test(object.latestVersion) ||
    (status !== "upToDate" && status !== "updateAvailable" && status !== "ahead") ||
    typeof object.tagName !== "string" ||
    (object.tagName !== object.latestVersion && object.tagName !== `v${object.latestVersion}`) ||
    typeof object.releaseUrl !== "string"
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The GitHub update response was not valid." });
  }

  let releaseUrl: URL;
  try {
    releaseUrl = new URL(object.releaseUrl);
  } catch {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The GitHub release URL was not valid." });
  }
  if (
    releaseUrl.protocol !== "https:" ||
    releaseUrl.hostname !== "github.com" ||
    releaseUrl.port ||
    releaseUrl.username ||
    releaseUrl.password ||
    releaseUrl.search ||
    releaseUrl.hash ||
    releaseUrl.pathname !== `/Rice-dog/code-codex/releases/tag/${object.tagName}`
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The GitHub release URL was not valid." });
  }

  return {
    currentVersion: object.currentVersion,
    latestVersion: object.latestVersion,
    status,
    tagName: object.tagName,
    releaseUrl: releaseUrl.href,
  };
}

function updateCheckError(error: unknown): string {
  const code = errorCode(error);
  if (code === "UPDATE_CHECK_RATE_LIMITED") return "GitHub’s update-check limit was reached. Try again later.";
  if (code === "UPDATE_NOT_PUBLISHED") return "GitHub does not have a published stable release yet.";
  if (code === "UPDATE_CHECK_INVALID_RESPONSE" || code === "INVALID_REQUEST") {
    return "GitHub returned an update response Code-Codex could not verify.";
  }
  if (code === "NO_BRIDGE") return "Could not check GitHub because Code-Codex is disconnected.";
  return "Could not reach GitHub. Check your internet connection and try again.";
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
