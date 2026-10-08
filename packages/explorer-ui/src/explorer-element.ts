import {pluginExport} from './plugin-runtime';
import type {HistoryHost} from './git-history-runtime';
import {normalizeGitHistory,normalizeGitCommit,normalizeGitDiff,gitHistoryError} from './git-history-facade';
import {transparentPresentation,applyTransparentPresentation,clearTransparentPresentation} from './utility-plugin-facade';
import { ParticleImageRenderer, GlowHorizonRenderer, HeavenlyCloudRenderer, AuroraIonosphereRenderer, MilkyWayRenderer, MountainRenderer, BlinkingSquaresRenderer, CloudTrainRenderer, PixelSculptRenderer, BlackHoleRenderer, populateGlowHorizonLayer } from './background-plugin-facade';
import { ensureBackgroundPackage, connectBackgroundPackages } from './background-plugin-runtime';
import { BackgroundPackageMarket } from './background-package-market';
import {
  DEFAULT_PARTICLE_BACKGROUND_SETTINGS,
  DEFAULT_PARTICLE_IMAGE_TRANSFORM,
  DEFAULT_PARTICLE_MORPH_CURVE,
  MAX_PARTICLE_MORPH_CURVE_NODES,
  PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH,
  PARTICLE_BACKGROUND_STORE,
  type ParticleBackgroundSettings,
  ParticleImagePreparationCache,
  type ParticleImageRecord,
  type ParticleImageTransform,
  type ParticleMorphCurve,
  applyParticleImageTransform,
  clampParticleUnitInterval,
  cloneParticleMorphCurve,
  evaluateParticleMorphCurve,
  normalizeParticleImageTransform,
  normalizeParticleMorphCurve,
  normalizeParticleSettings,
  openParticleImageDatabase,
  particleOpeningImageOpacity,
  readParticleBackgroundSettings,
  readParticleImageRecords,
  smootherParticleTransition,
  writeParticleBackgroundSettings,
} from './particle-image-startup';
import { cancelBackgroundFrame, registerBackgroundOpening, requestBackgroundFrame } from './background-startup-hold';
import {
  BLACK_HOLE_BACKGROUND_SETTINGS_KEY,
  GLOW_HORIZON_BACKGROUND_SETTINGS_KEY,
  HEAVENLY_CLOUD_BACKGROUND_SETTINGS_KEY,
  AURORA_IONOSPHERE_BACKGROUND_SETTINGS_KEY,
  MILKY_WAY_BACKGROUND_SETTINGS_KEY,
  BLINKING_SQUARES_BACKGROUND_SETTINGS_KEY,
  BlackHoleBackgroundSettings,
  GlowHorizonVariant,
  GlowHorizonBackgroundSettings,
  HeavenlyCloudQuality,
  HeavenlyCloudBackgroundSettings,
  AuroraIonosphereQuality,
  AuroraIonosphereBackgroundSettings,
  AuroraIonosphereNumericSettingKey,
  AuroraIonosphereControlGroup,
  AuroraIonosphereNumericControlDefinition,
  DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS,
  DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS,
  HEAVENLY_CLOUD_QUALITY,
  DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS,
  AURORA_IONOSPHERE_QUALITY,
  DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS,
  clampParticleNumber,
  normalizeBlackHoleColor,
  normalizeBlackHoleSettings,
  readBlackHoleBackgroundSettings,
  normalizeGlowHorizonColor,
  normalizeGlowHorizonSettings,
  readGlowHorizonBackgroundSettings,
  normalizeHeavenlyCloudSettings,
  readHeavenlyCloudBackgroundSettings,
  normalizeAuroraIonosphereSettings,
  readAuroraIonosphereBackgroundSettings,
  isObjectRecord,
  GlowHorizonRendererRuntime,
  GlowHorizonVariantGeometry,
  GLOW_HORIZON_VARIANT_GEOMETRY,
  glowHorizonWithAlpha,
  glowHorizonClamp,
  glowHorizonEase,
  glowHorizonNormalizeWheelDelta,
  glowHorizonInsideControls,
  glowHorizonElementVisible,
  startGlowHorizonRenderer,
  HEAVENLY_CLOUD_VERTEX_SHADER,
  createHeavenlyCloudFragmentShader,
  HeavenlyCloudRendererRuntime,
  startHeavenlyCloudRenderer,
  AURORA_IONOSPHERE_VERTEX_SHADER,
  AURORA_IONOSPHERE_NOISE_SHADER,
  createAuroraIonosphereFieldShader,
  AURORA_IONOSPHERE_COMPOSITE_SHADER,
  AuroraIonosphereNoiseDomain,
  auroraIonosphereSmoothstep,
  auroraIonosphereWritePacked16,
  calculateAuroraIonosphereNoiseDomain,
  MilkyWayQuality,
  MilkyWayBackgroundSettings,
  MilkyWayNumericSettingKey,
  MilkyWayNumericControlDefinition,
  DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS,
  MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS,
  normalizeMilkyWaySettings,
  readMilkyWayBackgroundSettings,
  MILKY_WAY_FRAGMENT_SHADER,
  MOUNTAIN_DEFAULTS,
  MountainSettings,
  MOUNTAIN_CONTROLS,
  normalizeMountainSettings,
  readMountainBackgroundSettings,
  BLINKING_SQUARES_CONTROLS,
  normalizeBlinkingSquaresSettings,
  readBlinkingSquaresBackgroundSettings,
  CLOUD_TRAIN_DEFAULTS,
  CloudTrainSettings,
  CLOUD_TRAIN_CONTROLS,
  CLOUD_TRAIN_TINTS,
  normalizeCloudTrainSettings,
  readCloudTrainBackgroundSettings,
  cloudTrainColorizeSource,
  cloudTrainOpeningSource,
  cloudTrainTintRgb,
  BLACK_HOLE_VERTEX_SHADER,
  BLACK_HOLE_SCENE_FRAGMENT_SHADER,
  blackHoleSceneFragmentSource,
  BLACK_HOLE_BLEND_FRAGMENT_SHADER,
  BLACK_HOLE_BRIGHT_FRAGMENT_SHADER,
  BLACK_HOLE_BLUR_FRAGMENT_SHADER,
  BLACK_HOLE_COMPOSITE_FRAGMENT_SHADER,
  BlackHoleProgram,
  BlackHoleRenderTarget,
  BlackHoleRendererRuntime,
  BLACK_HOLE_FOCUS,
  BLACK_HOLE_RADIANS,
  blackHoleHexToLinear,
  blackHoleSceneSignature,
  blackHoleSizeSignature,
  startBlackHoleRenderer,
} from './startup-background-renderers';
import { PIXEL_SCULPT_DEFAULTS, normalizePixelSculptSettings, readPixelSculptBackgroundSettings, writePixelSculptBackgroundSettings, type PixelSculptSettings } from "./pixel-sculpt-settings";
import { ActiveThreadTracker } from "./active-thread";
import { SurfaceOpacityPlugin, surfaceOpacityCardMarkup, surfaceOpacityPanelMarkup, SURFACE_OPACITY_TREE_CSS } from "./surface-opacity";
import { BLINKING_SQUARES_DEFAULTS, type BlinkingSquaresSettings } from "./blinking-squares-settings";
import { DEFAULT_STARTUP_TRANSITION_SETTINGS, startupTransitionModule, readStartupTransitionSettings, writeStartupTransitionSettings, startupDefaultClip, type StartupTransitionSettings } from "./startup-transition-plugin";
import { STARTUP_BACKGROUNDS, mountStartupBackground } from './startup-background';
import { loadStartupVideo, removeStartupVideo, saveStartupVideo, type StartupVideo } from "./startup-transition-facade";
import { observePluginControls } from "./runtime-information";
import { runtimeEvent, runtimeTaskLabel } from "./runtime-events";
import { clipFadeOpacity, formatTimelineTime, moveTimelineBoundary, sampleStartupVideoFrames, startupTimelineGeometry } from "./startup-transition-facade";
import { activePageElements, MAIN_SURFACE_SELECTOR } from "./adapters/codex-26.715";
import { usesClippedMainLayout } from "./adapters/codex-layout-version";
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
import { dismissExplorerForSession, isExplorerDismissedForSession } from "./session-state";
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
/*
 * Third-party provenance and Code-Codex modification boundaries for the
 * appearance effects below are documented in THIRD_PARTY_NOTICES_EN.md and
 * THIRD_PARTY_NOTICES_ZH_CN.md. The repository MIT license does not relicense
 * adapted or otherwise protected third-party material. Author references are
 * attribution only and do not imply endorsement of Code-Codex.
 */
const TRANSPARENT_BACKGROUND_PLUGIN_ID = "code-codex.transparent-background";
const PARTICLE_BACKGROUND_PLUGIN_ID = "code-codex.particle-image-background";
const BLACK_HOLE_BACKGROUND_PLUGIN_ID = "code-codex.black-hole-background";
const GLOW_HORIZON_BACKGROUND_PLUGIN_ID = "code-codex.glow-horizon-background";
const HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID = "code-codex.heavenly-cloud-background";
const AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID = "code-codex.aurora-ionosphere-background";
const MOUNTAIN_BACKGROUND_PLUGIN_ID = "code-codex.layered-mountain-background";
const PIXEL_SCULPT_BACKGROUND_PLUGIN_ID = "code-codex.pixel-sculpt-background";
const CLOUD_TRAIN_BACKGROUND_PLUGIN_ID = "code-codex.cloud-train-background";
const MILKY_WAY_BACKGROUND_PLUGIN_ID = "code-codex.milky-way-background";
const BLINKING_SQUARES_BACKGROUND_PLUGIN_ID = "code-codex.blinking-squares-background";
const APPEARANCE_PLUGIN_IDS = new Set([
  TRANSPARENT_BACKGROUND_PLUGIN_ID,
  PARTICLE_BACKGROUND_PLUGIN_ID,
  BLACK_HOLE_BACKGROUND_PLUGIN_ID,
  GLOW_HORIZON_BACKGROUND_PLUGIN_ID,
  HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,
  AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,
  MILKY_WAY_BACKGROUND_PLUGIN_ID,
  BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,
  MOUNTAIN_BACKGROUND_PLUGIN_ID,
  CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,
  PIXEL_SCULPT_BACKGROUND_PLUGIN_ID,
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

const PARTICLE_BACKGROUND_THEME_LEASE_KEY = "code-codex:particle-theme-lease:v1";
const BACKGROUND_SETTINGS_LANGUAGE_KEY = "code-codex:background-settings-language:v1";
const CODEX_DARK_APPLY_TIMEOUT_MS = 5_000;
const CODEX_APPEARANCE_POLL_INTERVAL_MS = 1_500;

const PARTICLE_BACKGROUND_MAX_IMAGES = 32;
const PARTICLE_BACKGROUND_MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const PARTICLE_BACKGROUND_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

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
type PreviewMarketCategory = "appearance" | "file-preview" | "developer-tools";

interface UpdateCheckResult {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly status: UpdateCheckStatus;
  readonly tagName: string;
  readonly releaseUrl: string;
}

interface UpdateInstallResult {
  readonly latestVersion: string;
  readonly launched: boolean;
}

interface GitCommitSummary {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly authoredAt: string;
  readonly subject: string;
}

interface GitHistoryResult {
  readonly branch: string;
  readonly detached: boolean;
  readonly commits: readonly GitCommitSummary[];
  readonly hasMore: boolean;
}

interface GitChangedFile {
  readonly status: string;
  readonly path: string;
  readonly oldPath?: string;
}

interface GitCommitResult {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly authoredAt: string;
  readonly message: string;
  readonly files: readonly GitChangedFile[];
  readonly filesTruncated: boolean;
}

interface GitDiffResult {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
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

type CodexAppearanceTheme = "system" | "light" | "dark";

type CodexAppearanceAction =
  | { readonly type: "app.appearance.get" }
  | {
      readonly type: "app.appearance.set_mode";
      readonly mode: CodexAppearanceTheme;
    };

interface CodexAppearanceAdapter {
  readonly runAction: (action: CodexAppearanceAction) => Promise<unknown>;
}

type DarkBackgroundPluginId =
  | typeof PARTICLE_BACKGROUND_PLUGIN_ID
  | typeof BLACK_HOLE_BACKGROUND_PLUGIN_ID
  | typeof GLOW_HORIZON_BACKGROUND_PLUGIN_ID
  | typeof HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID
  | typeof AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID
  | typeof MILKY_WAY_BACKGROUND_PLUGIN_ID
  | typeof BLINKING_SQUARES_BACKGROUND_PLUGIN_ID
  | typeof MOUNTAIN_BACKGROUND_PLUGIN_ID
  | typeof PIXEL_SCULPT_BACKGROUND_PLUGIN_ID
  | typeof CLOUD_TRAIN_BACKGROUND_PLUGIN_ID;

interface ParticleThemeLease {
  readonly owner?: DarkBackgroundPluginId;
  readonly previousPreference: Exclude<CodexAppearanceTheme, "dark">;
  readonly forcedPreference: "dark";
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

type HeavenlyCloudNumericSettingKey = {
  [Key in keyof HeavenlyCloudBackgroundSettings]: HeavenlyCloudBackgroundSettings[Key] extends number ? Key : never;
}[keyof HeavenlyCloudBackgroundSettings];

type HeavenlyCloudControlGroup = "field" | "interaction" | "opening";

interface HeavenlyCloudNumericControlDefinition {
  readonly key: HeavenlyCloudNumericSettingKey;
  readonly group: HeavenlyCloudControlGroup;
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
  | "dprCap"
  | "introDuration"
  | "introSpread";

type ParticleControlGroup = "particles" | "flow" | "source" | "pointer" | "render" | "opening";

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

const PARTICLE_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "introDuration", group: "opening", id: "cle-particle-intro-duration", label: "Opening duration", labelZh: "开场时长", minimum: 0.5, maximum: 12, step: 0.1, live: true, format: (value: number) => `${value.toFixed(1)}s` },
  { key: "introSpread", group: "opening", id: "cle-particle-intro-spread", label: "Gathering spread", labelZh: "汇聚范围", minimum: 0.2, maximum: 2, step: 0.05, live: true, format: (value: number) => `${value.toFixed(2)}×` },
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

const HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "speed", group: "field", id: "cle-heavenly-cloud-speed", label: "Forward drift", labelZh: "前进速度", minimum: 0, maximum: 2, step: 0.01, unit: "×", precision: 2 },
  { key: "intensity", group: "field", id: "cle-heavenly-cloud-intensity", label: "Light density", labelZh: "光雾密度", minimum: 0.3, maximum: 2.4, step: 0.05, unit: "×", precision: 2 },
  { key: "turbulence", group: "field", id: "cle-heavenly-cloud-turbulence", label: "Turbulence", labelZh: "湍流强度", minimum: 0.35, maximum: 1.65, step: 0.01, unit: "×", precision: 2 },
  { key: "radius", group: "field", id: "cle-heavenly-cloud-radius", label: "Tunnel radius", labelZh: "隧道半径", minimum: 1.8, maximum: 4.6, step: 0.05, precision: 2 },
  { key: "colorShift", group: "field", id: "cle-heavenly-cloud-color-shift", label: "Spectral shift", labelZh: "光谱偏移", minimum: -3.14, maximum: 3.14, step: 0.01, precision: 2 },
  { key: "pointerInfluence", group: "interaction", id: "cle-heavenly-cloud-pointer", label: "Pointer steering", labelZh: "指针引导", minimum: 0, maximum: 1.2, step: 0.05, unit: "×", precision: 2 },
  { key: "introDuration", group: "opening", id: "cle-heavenly-cloud-intro-duration", label: "Opening duration", labelZh: "开场时长", minimum: 0.8, maximum: 5, step: 0.1, unit: "s", precision: 1 },
  { key: "introFeather", group: "opening", id: "cle-heavenly-cloud-intro-feather", label: "Aperture feather", labelZh: "圆形边缘羽化", minimum: 0.02, maximum: 0.8, step: 0.01, precision: 2 },
] satisfies readonly HeavenlyCloudNumericControlDefinition[]);

const AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS = Object.freeze([
  { key: "hue", group: "field", id: "cle-aurora-ionosphere-hue", label: "Aurora hue", labelZh: "极光色相", minimum: -180, maximum: 180, step: 1, unit: "°", precision: 0 },
  { key: "saturation", group: "field", id: "cle-aurora-ionosphere-saturation", label: "Aurora saturation", labelZh: "极光饱和度", minimum: 0, maximum: 2, step: 0.01, unit: "×", precision: 2 },
  { key: "speed", group: "field", id: "cle-aurora-ionosphere-speed", label: "Drift speed", labelZh: "漂移速度", minimum: 0, maximum: 3, step: 0.01, unit: "×", precision: 2 },
  { key: "intensity", group: "field", id: "cle-aurora-ionosphere-intensity", label: "Aurora intensity", labelZh: "极光强度", minimum: 0, maximum: 3, step: 0.01, unit: "×", precision: 2 },
  { key: "curtainScale", group: "field", id: "cle-aurora-ionosphere-curtain-scale", label: "Curtain density", labelZh: "光幕密度", minimum: 0.05, maximum: 2, step: 0.01, precision: 2 },
  { key: "turbulence", group: "field", id: "cle-aurora-ionosphere-turbulence", label: "Turbulence", labelZh: "湍流扰动", minimum: 0, maximum: 1.8, step: 0.01, precision: 2 },
  { key: "glow", group: "field", id: "cle-aurora-ionosphere-glow", label: "Ion glow", labelZh: "离子辉光", minimum: 0, maximum: 2.4, step: 0.01, precision: 2 },
  { key: "starDensity", group: "field", id: "cle-aurora-ionosphere-star-density", label: "Star field", labelZh: "星尘数量", minimum: 0, maximum: 1.5, step: 0.01, precision: 2 },
  { key: "introDuration", group: "opening", id: "cle-aurora-ionosphere-intro-duration", label: "Opening duration", labelZh: "开场时长", minimum: 0.6, maximum: 6, step: 0.05, unit: "s", precision: 2 },
  { key: "introFeather", group: "opening", id: "cle-aurora-ionosphere-intro-feather", label: "Reveal feather", labelZh: "揭示羽化", minimum: 0.03, maximum: 0.4, step: 0.01, precision: 2 },
  { key: "introStart", group: "opening", id: "cle-aurora-ionosphere-intro-start", label: "Curtain origin", labelZh: "光幕起点", minimum: -0.5, maximum: 0.25, step: 0.01, precision: 2 },
  { key: "introEnd", group: "opening", id: "cle-aurora-ionosphere-intro-end", label: "Curtain finish", labelZh: "光幕终点", minimum: 0.8, maximum: 1.8, step: 0.01, precision: 2 },
  { key: "introSkyEnd", group: "opening", id: "cle-aurora-ionosphere-intro-sky-end", label: "Sky reveal", labelZh: "天空显现", minimum: 0.1, maximum: 0.9, step: 0.01, precision: 2 },
  { key: "introStarStart", group: "opening", id: "cle-aurora-ionosphere-intro-star-start", label: "Star delay", labelZh: "星尘延迟", minimum: 0, maximum: 0.8, step: 0.01, precision: 2 },
] satisfies readonly AuroraIonosphereNumericControlDefinition[]);

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

function writeBlackHoleBackgroundSettings(settings: BlackHoleBackgroundSettings): void {
  try {
    localStorage.setItem(BLACK_HOLE_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

function writeGlowHorizonBackgroundSettings(settings: GlowHorizonBackgroundSettings): void {
  try {
    localStorage.setItem(GLOW_HORIZON_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

function writeHeavenlyCloudBackgroundSettings(settings: HeavenlyCloudBackgroundSettings): void {
  try {
    localStorage.setItem(HEAVENLY_CLOUD_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

function writeAuroraIonosphereBackgroundSettings(settings: AuroraIonosphereBackgroundSettings): void {
  try {
    localStorage.setItem(AURORA_IONOSPHERE_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

function isCodexAppearanceTheme(value: unknown): value is CodexAppearanceTheme {
  return value === "system" || value === "light" || value === "dark";
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
  const adapters = Object.values(moduleExports).filter((value): value is {
    appActions: { runInPrimaryWindow: (request: { action: CodexAppearanceAction }) => Promise<unknown> };
    clientCoordination: { invalidateQueryCache: (request: { queryKey: readonly string[] }) => Promise<unknown> };
  } => {
    if (!isObjectRecord(value) || !isCodexRpcNamespace(value.appActions) || !isCodexRpcNamespace(value.clientCoordination)) {
      return false;
    }
    return typeof value.appActions.runInPrimaryWindow === "function"
      && typeof value.clientCoordination.invalidateQueryCache === "function";
  });
  const adapter = adapters[0];
  if (adapters.length === 1 && adapter) {
    return { runAction: (action) => adapter.appActions.runInPrimaryWindow({ action }) };
  }

  // Codex 26.924 moved app actions out of the combined RPC namespace. Find
  // the single exported dispatcher by its implementation, not its minified
  // export name, which changes on every official build.
  const bootstrap = getBootstrapConfig();
  if (usesClippedMainLayout(bootstrap.codexVersion ?? bootstrap.version)) {
    const actions = Object.values(moduleExports).filter((value): value is (action: CodexAppearanceAction) => Promise<unknown> =>
      typeof value === "function"
      && Function.prototype.toString.call(value).includes(".appActions")
      && Function.prototype.toString.call(value).includes("runInPrimaryWindow({action:"));
    if (actions.length === 1 && actions[0]) return { runAction: actions[0] };
  }
  throw new Error("Codex Appearance controls could not be identified safely");
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
  const result = await adapter.runAction(action);
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
        || lease.owner === HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID
        || lease.owner === AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID
        || lease.owner === MILKY_WAY_BACKGROUND_PLUGIN_ID
        || lease.owner === BLINKING_SQUARES_BACKGROUND_PLUGIN_ID
        || lease.owner === MOUNTAIN_BACKGROUND_PLUGIN_ID
        || lease.owner === PIXEL_SCULPT_BACKGROUND_PLUGIN_ID
        || lease.owner === CLOUD_TRAIN_BACKGROUND_PLUGIN_ID
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
  const dark = root.classList.contains("electron-dark")
    || root.classList.contains("dark")
    || root.dataset.theme === "dark";
  const light = root.classList.contains("electron-light")
    || root.classList.contains("light")
    || root.dataset.theme === "light";
  return dark && !light;
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













// Independently implemented from the public Particle Image interaction concept
// by React Bits / David Haz; no React Bits Pro source or assets are intentionally included.
// See THIRD_PARTY_NOTICES_EN.md and THIRD_PARTY_NOTICES_ZH_CN.md.




















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
  #rotationFrame = 0;
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

  async refreshLibrary(): Promise<void> {
    this.#settings = readParticleBackgroundSettings();
    await this.initialize();
    if (this.#database) this.#records = (await readParticleImageRecords(this.#database)).sort((a,b)=>a.createdAt-b.createdAt).slice(0,PARTICLE_BACKGROUND_MAX_IMAGES);
    this.#notify();
  }

  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('particle-image');
    if (generation !== this.#generation) return;
    this.#settings = readParticleBackgroundSettings();
    await this.initialize();
    this.#settings = readParticleBackgroundSettings();
    if (this.#database) this.#records = (await readParticleImageRecords(this.#database)).sort((a,b)=>a.createdAt-b.createdAt).slice(0,PARTICLE_BACKGROUND_MAX_IMAGES);
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
        }, () => {
          this.#updateSourceTransition(this.#sourceTransitionProgress, false);
        });
        registerBackgroundOpening(layer, this.#renderer);
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

  replayOpening(): void {
    if (!this.#enabled || this.#pending || !this.#renderer?.count || !this.#settings.introEnabled) return;
    this.#renderer.replayOpening();
    this.#scheduleRotation();
    runtimeEvent("particle-image", "opening replay", "started", {
      durationSeconds: this.#settings.introDuration, spread: this.#settings.introSpread,
    });
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
    const opacity = this.#settings.showSourceImage
      ? this.#settings.imageOpacity * particleOpeningImageOpacity(this.#renderer?.openingProgress ?? 1) : 0;
    if (!this.#sourceTransitioning) {
      image.style.opacity = String(opacity);
      previousImage.style.opacity = "0";
      return;
    }
    const blend = smootherParticleTransition(this.#sourceTransitionProgress);
    const incomingOpacity = opacity * blend;
    const outgoingContribution = opacity * this.#sourceTransitionOutgoingScale * (1 - blend);
    const remainingCoverage = 1 - incomingOpacity;
    // The current image is composited over the previous image. Compensate the
    // lower layer so its effective source-over contribution follows the same
    // crossfade curve instead of dimming twice beneath the incoming layer.
    const outgoingOpacity = remainingCoverage > Number.EPSILON
      ? Math.min(1, Math.max(0, outgoingContribution / remainingCoverage))
      : 0;
    previousImage.style.opacity = String(
      outgoingOpacity,
    );
    image.style.opacity = String(incomingOpacity);
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
      const opacity = this.#settings.showSourceImage
        ? this.#settings.imageOpacity * particleOpeningImageOpacity(this.#renderer?.openingProgress ?? 1) : 0;
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
    const opacity = this.#settings.showSourceImage
      ? this.#settings.imageOpacity * particleOpeningImageOpacity(this.#renderer?.openingProgress ?? 1) : 0;
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
        }, () => {
          this.#updateSourceTransition(this.#sourceTransitionProgress, false);
        });
        registerBackgroundOpening(this.#canvas, this.#renderer);
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
    const delay = (this.#settings.imageDurationSeconds + (this.#renderer?.openingRemainingSeconds ?? 0)) * 1_000;
    this.#rotationTimer = window.setTimeout(() => {
      this.#rotationTimer = 0;
      if (document.hidden || this.#reducedMotion.matches) return;
      const layer = this.#layer;
      if (!layer) return;
      // Keep image rotation parked with the normal renderer under the splash.
      this.#rotationFrame = requestBackgroundFrame(layer, () => {
        this.#rotationFrame = 0;
        if (!this.#enabled || document.hidden || this.#reducedMotion.matches) return;
        if ((this.#renderer?.openingRemainingSeconds ?? 0) > 0) {
          this.#scheduleRotation();
          return;
        }
        void this.#activateImage(nextId);
      });
    }, delay);
  }

  #stopRotation(): void {
    window.clearTimeout(this.#rotationTimer);
    this.#rotationTimer = 0;
    cancelBackgroundFrame(this.#rotationFrame);
    this.#rotationFrame = 0;
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
    await ensureBackgroundPackage('glow-horizon');
    if (generation !== this.#generation) return;
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
      populateGlowHorizonLayer(layer, this.#settings);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#renderer = new GlowHorizonRenderer(layer, this.#settings);
      registerBackgroundOpening(this.#layer!, this.#renderer);
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

class HeavenlyCloudBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readHeavenlyCloudBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: HeavenlyCloudRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): HeavenlyCloudBackgroundSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Heavenly Cloud Background is unavailable");
  }

  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('heavenly-cloud');
    if (generation !== this.#generation) return;
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
      layer.dataset.codeCodexParticleLayer = "v1";
      layer.dataset.codeCodexHeavenlyCloudLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = "#020408";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas code-codex-heavenly-cloud-canvas";
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#020408");
      this.#renderer = new HeavenlyCloudRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Heavenly Cloud Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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

  updateSettings(next: HeavenlyCloudBackgroundSettings): void {
    const previousQuality = this.#settings.quality;
    this.#settings = normalizeHeavenlyCloudSettings(next);
    writeHeavenlyCloudBackgroundSettings(this.#settings);
    if (this.#renderer && this.#layer && this.#canvas && previousQuality !== this.#settings.quality) {
      this.#renderer.dispose();
      this.#renderer = new HeavenlyCloudRenderer(this.#layer, this.#canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
    } else {
      this.#renderer?.setSettings(this.#settings);
    }
    this.#notify();
  }

  reset(): void { this.updateSettings(DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS); }
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
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Heavenly Cloud Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }

  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Heavenly Cloud Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }

  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const HEAVENLY_CLOUD_BACKGROUND_CONTROLLER = Symbol.for("code-codex:heavenly-cloud-background-controller:v1");

function getHeavenlyCloudBackgroundController(): HeavenlyCloudBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[HEAVENLY_CLOUD_BACKGROUND_CONTROLLER];
  if (existing instanceof HeavenlyCloudBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new HeavenlyCloudBackgroundController();
  globalState[HEAVENLY_CLOUD_BACKGROUND_CONTROLLER] = controller;
  return controller;
}

class AuroraIonosphereBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readAuroraIonosphereBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: AuroraIonosphereRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): AuroraIonosphereBackgroundSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Aurora Ionosphere Background is unavailable");
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('aurora-ionosphere');
    if (generation !== this.#generation) return;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally { if (this.#enableOperation === operation) this.#enableOperation = undefined; }
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
      layer.dataset.codeCodexAuroraIonosphereLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = "#02090d";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas code-codex-aurora-ionosphere-canvas";
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#02090d");
      this.#renderer = new AuroraIonosphereRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Aurora Ionosphere Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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

  updateSettings(next: AuroraIonosphereBackgroundSettings): void {
    this.#settings = normalizeAuroraIonosphereSettings(next);
    writeAuroraIonosphereBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }
  reset(): void { this.updateSettings(DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS); }
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
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Aurora Ionosphere Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }
  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Aurora Ionosphere Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const AURORA_IONOSPHERE_BACKGROUND_CONTROLLER = Symbol.for("code-codex:aurora-ionosphere-background-controller:v1");

function getAuroraIonosphereBackgroundController(): AuroraIonosphereBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[AURORA_IONOSPHERE_BACKGROUND_CONTROLLER];
  if (existing instanceof AuroraIonosphereBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new AuroraIonosphereBackgroundController();
  globalState[AURORA_IONOSPHERE_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
type MilkyWayControlGroup = "field" | "opening";
function writeMilkyWayBackgroundSettings(settings: MilkyWayBackgroundSettings): void {
  try { localStorage.setItem(MILKY_WAY_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Session settings remain usable. */ }
}

class MilkyWayBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readMilkyWayBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: MilkyWayRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): MilkyWayBackgroundSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Milky Way Background is unavailable");
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('milky-way');
    if (generation !== this.#generation) return;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally { if (this.#enableOperation === operation) this.#enableOperation = undefined; }
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
      layer.dataset.codeCodexMilkyWayLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = "#02090d";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas code-codex-milky-way-canvas";
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#02090d");
      this.#renderer = new MilkyWayRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Milky Way Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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

  updateSettings(next: MilkyWayBackgroundSettings): void {
    this.#settings = normalizeMilkyWaySettings(next);
    writeMilkyWayBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }
  reset(): void { this.updateSettings(DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS); }
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
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = MILKY_WAY_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Milky Way Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = MILKY_WAY_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }
  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Milky Way Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const MILKY_WAY_BACKGROUND_CONTROLLER = Symbol.for("code-codex:milky-way-background-controller:v1");

function getMilkyWayBackgroundController(): MilkyWayBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[MILKY_WAY_BACKGROUND_CONTROLLER];
  if (existing instanceof MilkyWayBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new MilkyWayBackgroundController();
  globalState[MILKY_WAY_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
function writeMountainBackgroundSettings(settings: MountainSettings): void {
  try { localStorage.setItem("code-codex:mountain-settings:v1",JSON.stringify(settings)); } catch { /* Keep session settings. */ }
}
class MountainBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readMountainBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: MountainRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): MountainSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Layered Mountain Background is unavailable");
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('mountain');
    if (generation !== this.#generation) return;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally { if (this.#enableOperation === operation) this.#enableOperation = undefined; }
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
      layer.dataset.codeCodexMountainLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = "#02090d";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas code-codex-mountain-canvas";
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#02090d");
      this.#renderer = new MountainRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Layered Mountain Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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

  updateSettings(next: MountainSettings): void {
    this.#settings = normalizeMountainSettings(next);
    writeMountainBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }
  reset(): void { this.updateSettings(MOUNTAIN_DEFAULTS); }
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
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = MOUNTAIN_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Layered Mountain Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = MOUNTAIN_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }
  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Layered Mountain Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(MOUNTAIN_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const MOUNTAIN_BACKGROUND_CONTROLLER = Symbol.for("code-codex:mountain-background-controller:v1");

function getMountainBackgroundController(): MountainBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[MOUNTAIN_BACKGROUND_CONTROLLER];
  if (existing instanceof MountainBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new MountainBackgroundController();
  globalState[MOUNTAIN_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
type BlinkingSquaresNumericKey = (typeof BLINKING_SQUARES_CONTROLS)[number][0];
function writeBlinkingSquaresBackgroundSettings(settings: BlinkingSquaresSettings): void {
  try { localStorage.setItem(BLINKING_SQUARES_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* Keep session settings usable. */ }
}

class BlinkingSquaresBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readBlinkingSquaresBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #renderer: BlinkingSquaresRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): BlinkingSquaresSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Blinking Squares Background is unavailable");
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('blinking-squares');
    if (generation !== this.#generation) return;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally { if (this.#enableOperation === operation) this.#enableOperation = undefined; }
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
      layer.dataset.codeCodexBlinkingSquaresLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = this.#settings.backgroundColor;
      document.body.prepend(layer);
      this.#layer = layer;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, this.#settings.backgroundColor);
      this.#renderer = new BlinkingSquaresRenderer(layer, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Blinking Squares Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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

  updateSettings(next: BlinkingSquaresSettings): void {
    this.#settings = normalizeBlinkingSquaresSettings(next);
    writeBlinkingSquaresBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    if (this.#layer) this.#layer.style.backgroundColor = this.#settings.backgroundColor;
    if (this.#enabled) document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, this.#settings.backgroundColor);
    this.#notify();
  }
  reset(): void { this.updateSettings(BLINKING_SQUARES_DEFAULTS); }
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
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = BLINKING_SQUARES_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Blinking Squares Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = BLINKING_SQUARES_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }
  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Blinking Squares Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const BLINKING_SQUARES_BACKGROUND_CONTROLLER = Symbol.for("code-codex:blinking-squares-background-controller:v1");

function getBlinkingSquaresBackgroundController(): BlinkingSquaresBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[BLINKING_SQUARES_BACKGROUND_CONTROLLER];
  if (existing instanceof BlinkingSquaresBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new BlinkingSquaresBackgroundController();
  globalState[BLINKING_SQUARES_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
function writeCloudTrainBackgroundSettings(s:CloudTrainSettings):void {try{localStorage.setItem("code-codex:cloud-train-settings:v1",JSON.stringify(s));}catch{/* Session settings remain usable. */}}
class CloudTrainBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readCloudTrainBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: CloudTrainRenderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): CloudTrainSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Cloud Train Background is unavailable");
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('cloud-train');
    if (generation !== this.#generation) return;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally { if (this.#enableOperation === operation) this.#enableOperation = undefined; }
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
      layer.dataset.codeCodexCloudTrainLayer = "v1";
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = "#02090d";
      const canvas = document.createElement("canvas");
      canvas.className = "code-codex-particle-canvas code-codex-cloudTrain-canvas";
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#02090d");
      this.#renderer = new CloudTrainRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Cloud Train Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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

  updateSettings(next: CloudTrainSettings): void {
    this.#settings = normalizeCloudTrainSettings(next);
    writeCloudTrainBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }
  reset(): void { this.updateSettings(CLOUD_TRAIN_DEFAULTS); }
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
    this.#canvas = undefined;
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = CLOUD_TRAIN_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Cloud Train Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = CLOUD_TRAIN_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }
  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Cloud Train Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const CLOUD_TRAIN_BACKGROUND_CONTROLLER = Symbol.for("code-codex:cloudTrain-background-controller:v1");

function getCloudTrainBackgroundController(): CloudTrainBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[CLOUD_TRAIN_BACKGROUND_CONTROLLER];
  if (existing instanceof CloudTrainBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new CloudTrainBackgroundController();
  globalState[CLOUD_TRAIN_BACKGROUND_CONTROLLER] = controller;
  return controller;
}



// Independently implemented from the publicly presented Black Hole Hero Section
// visual concept by @yura; no referenced component source or assets are intentionally included.

class PixelSculptBackgroundController {
  readonly #listeners = new Set<() => void>();
  #settings = readPixelSculptBackgroundSettings();
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: PixelSculptRenderer | undefined;
  #editorOperation: Promise<void> | undefined;
  #editorPending = false;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor() { window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  get settings(): PixelSculptSettings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get editorPending(): boolean { return this.#editorPending; }
  get editorReady(): boolean { return Boolean(this.#renderer); }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Pixel Sculpt Background is unavailable");
  }
  async prepareEditor(): Promise<void> {
    if (this.#disposed) throw new Error("Pixel Sculpt Background is unavailable");
    if (this.#renderer) { await this.#renderer.ready; return; }
    if (this.#editorOperation) return this.#editorOperation;
    const operation = this.#createEditor();
    this.#editorOperation = operation;
    try { await operation; } finally { if (this.#editorOperation === operation) this.#editorOperation = undefined; }
  }
  async #createEditor(): Promise<void> {
    this.#editorPending = true;
    this.#error = undefined;
    this.#notify();
    const layer = document.createElement("div");
    layer.dataset.codeCodexParticleLayer = "v1";
    layer.dataset.codeCodexPixelSculptLayer = "v1";
    layer.setAttribute("aria-hidden", "true");
    layer.style.backgroundColor = "#02090d";
    const canvas = document.createElement("canvas");
    canvas.className = "code-codex-particle-canvas code-codex-pixelSculpt-canvas";
    layer.append(canvas);
    let renderer: PixelSculptRenderer | undefined;
    try {
      renderer = new PixelSculptRenderer(layer, canvas, this.#settings, (message) => {
        this.#error = message;
        this.#notify();
      });
      this.#layer = layer;
      this.#canvas = canvas;
      this.#renderer = renderer;
      registerBackgroundOpening(canvas, renderer);
      await renderer.ready;
    } catch (error) {
      renderer?.dispose();
      if (this.#renderer === renderer) this.#renderer = undefined;
      if (this.#layer === layer) this.#layer = undefined;
      if (this.#canvas === canvas) this.#canvas = undefined;
      this.#error = error instanceof Error ? error.message : "Pixel Sculpt settings could not be loaded";
      throw error;
    } finally {
      this.#editorPending = false;
      this.#notify();
    }
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await ensureBackgroundPackage('pixel-sculpt');
    if (generation !== this.#generation) return;
    await this.initialize();
    if (this.#disposed || this.#enabled || this.#pending || this.#enableOperation || generation !== this.#generation) return;
    const operation = this.#performEnable(generation);
    this.#enableOperation = operation;
    try { await operation; } finally { if (this.#enableOperation === operation) this.#enableOperation = undefined; }
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
      await this.prepareEditor();
      if (this.#disposed || generation !== this.#generation || !this.#layer || !this.#renderer) return;
      document.body.prepend(this.#layer);
      document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, "#02090d");
      this.#renderer.setActive(true, this.#settings);
      if (this.#disposed || generation !== this.#generation) return;
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Pixel Sculpt Background could not be enabled";
      this.#detachPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch { /* Retain the activation error. */ }
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
    if (hadPresentation) this.#detachPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    try {
      if (!preserveTheme) await this.#restoreCodexAppearanceTheme();
      this.#error = undefined;
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The previous Codex Appearance could not be restored";
    }
    this.#notify();
  }

  updateSettings(next: PixelSculptSettings): void {
    this.#settings = normalizePixelSculptSettings(next);
    writePixelSculptBackgroundSettings(this.#settings);
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }
  reset(): void { this.updateSettings(PIXEL_SCULPT_DEFAULTS); this.#renderer?.reset(); }
  replay(): void { this.#renderer?.replay(); }
  mountControls(container: HTMLElement, language: BackgroundSettingsLanguage): void { this.#renderer?.mountControls(container, language); }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#detachPresentation();
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#layer = undefined;
    this.#canvas = undefined;
    this.#listeners.clear();
    window.removeEventListener("pagehide", this.#onPageHide);
  }

  #detachPresentation(): void {
    this.#codexThemeObserver?.disconnect();
    this.#codexThemeObserver = undefined;
    this.#codexThemeMonitorGeneration += 1;
    window.clearTimeout(this.#codexThemePreferenceTimer);
    this.#codexThemePreferenceTimer = 0;
    this.#renderer?.setActive(false, this.#settings);
    this.#layer?.remove();
    document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, false);
    document.documentElement.style.removeProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY);
  }

  async #ensureCodexDarkTheme(): Promise<void> {
    const owner = PIXEL_SCULPT_BACKGROUND_PLUGIN_ID;
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
      throw new Error("Pixel Sculpt Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    const owner = PIXEL_SCULPT_BACKGROUND_PLUGIN_ID;
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
    } catch { /* A transient read failure does not tear down the presentation. */ }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }
  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#generation += 1;
    this.#error = "Pixel Sculpt Background stopped because Codex Appearance is no longer Dark.";
    this.#stoppedForExternalThemeChange = true;
    this.#detachPresentation();
    clearParticleThemeLease(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}

const PIXEL_SCULPT_BACKGROUND_CONTROLLER = Symbol.for("code-codex:pixelSculpt-background-controller:v1");

function getPixelSculptBackgroundController(): PixelSculptBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[PIXEL_SCULPT_BACKGROUND_CONTROLLER];
  if (existing instanceof PixelSculptBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch { /* Replace a stale controller. */ }
  }
  const controller = new PixelSculptBackgroundController();
  globalState[PIXEL_SCULPT_BACKGROUND_CONTROLLER] = controller;
  return controller;
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
    await ensureBackgroundPackage('black-hole');
    if (generation !== this.#generation) return;
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
      registerBackgroundOpening(this.#layer!, this.#renderer);
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

function gitHistoryCardMarkup(): string {
  return `
    <article class="preview-extension git-history-extension">
      <span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 4.5v7M5.5 5.25C8 5.25 9 8 10.5 8"/></svg></span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Git History</h4>
        </div>
        <div class="preview-extension-meta"><span>Commits</span><span>Diffs</span></div>
      </div>
      <button class="preview-extension-action git-history-open" type="button" aria-controls="cle-git-history" aria-expanded="false">Enable</button>
    </article>
  `;
}

function gitHistoryPanelMarkup(): string {
  return `
    <section class="git-history-panel" id="cle-git-history" role="region" aria-label="Git History" hidden>
      <div class="git-history-toolbar">
        <div class="git-history-resize-handle" role="separator" aria-label="Resize Git History panel" aria-orientation="horizontal" aria-valuemin="120" tabindex="0">
          <span class="git-history-branch">Repository</span>
        </div>
        <div class="git-history-toolbar-actions">
          <button class="git-history-refresh" type="button" title="Refresh history" aria-label="Refresh Git history">${icons.refresh}</button>
          <button class="git-history-back" type="button" title="Back to history" aria-label="Back to Git history" hidden>${icons.collapse}</button>
          <button class="git-history-close" type="button" title="Close Git history" aria-label="Close Git history">${icons.close}</button>
        </div>
      </div>
      <div class="git-history-body">
        <section class="git-history-list-view">
          <div class="git-history-state" role="status">Open Git History to load commits.</div>
          <div class="git-history-list" role="list"></div>
          <button class="git-history-load-more" type="button" hidden>Load more</button>
        </section>
        <section class="git-history-detail-view" hidden>
          <div class="git-history-detail"></div>
        </section>
      </div>
    </section>
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
          <legend>${bilingualLabelMarkup("开场动画", "Opening animation")}</legend>
          <label class="particle-toggle-row" for="cle-particle-intro-enabled">${bilingualLabelMarkup("粒子汇聚", "Particle gathering")}<input id="cle-particle-intro-enabled" type="checkbox" checked></label>
          ${particleNumericControlsMarkup("opening")}
          <button class="particle-opening-replay" type="button" disabled>${bilingualLabelMarkup("重播开场", "Replay opening")}</button>
        </fieldset>
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

function formatHeavenlyCloudControlValue(
  definition: HeavenlyCloudNumericControlDefinition,
  value: number,
): string {
  const precision = definition.precision ?? Math.max(0, (String(definition.step).split(".")[1] ?? "").length);
  return `${value.toFixed(precision)}${definition.unit ?? ""}`;
}

function heavenlyCloudNumericControlsMarkup(group: HeavenlyCloudControlGroup): string {
  return HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS[definition.key];
      const formatted = formatHeavenlyCloudControlValue(definition, value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-heavenly-cloud-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}

function heavenlyCloudBackgroundCardMarkup(): string {
  const icon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.1 10.9c.7-1.1 1.8-1.7 3.1-1.7.5-2 2.1-3.3 4.1-3.3 2.4 0 4.3 1.9 4.3 4.3 0 .2 0 .5-.1.7"/><path d="M1.7 12.2h12.7M3.4 14h9.1"/><path d="M6.1 8.6c.6-1.1 1.7-1.8 3-1.8"/></svg>`;
  return `
    <article class="preview-extension appearance-extension heavenly-cloud-background-extension" data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icon}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Heavenly Cloud Background</h4>
          <span class="preview-extension-status" id="cle-heavenly-cloud-background-status">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="cle-heavenly-cloud-background-status" aria-pressed="false">Enable</button>
        <button class="particle-settings-trigger heavenly-cloud-settings-trigger" type="button" title="Configure Heavenly Cloud Background" aria-label="Configure Heavenly Cloud Background" aria-haspopup="dialog" aria-controls="cle-heavenly-cloud-settings" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}

function heavenlyCloudSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel heavenly-cloud-settings-panel" id="cle-heavenly-cloud-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-heavenly-cloud-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观", "Appearance")}</p>
          <h3 id="cle-heavenly-cloud-settings-title">${bilingualLabelMarkup("天境云隧道设置", "Heavenly Cloud settings")}</h3>
        </div>
        <div class="particle-settings-header-actions">
          ${backgroundLanguageSwitchMarkup("cle-heavenly-cloud-settings-language")}
          <button class="particle-settings-close heavenly-cloud-settings-close" type="button" title="关闭天境云隧道设置" aria-label="关闭天境云隧道设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染质量", "Render quality")}</legend>
          <div class="heavenly-cloud-quality-toolbar" role="group" aria-label="光线步数">
            <button type="button" data-heavenly-cloud-quality="low" aria-pressed="${DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS.quality === "low"}"><strong>56</strong>${bilingualLabelMarkup("低", "Low")}</button>
            <button type="button" data-heavenly-cloud-quality="medium" aria-pressed="${DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS.quality === "medium"}"><strong>76</strong>${bilingualLabelMarkup("中", "Medium")}</button>
            <button type="button" data-heavenly-cloud-quality="high" aria-pressed="${DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS.quality === "high"}"><strong>100</strong>${bilingualLabelMarkup("高", "High")}</button>
          </div>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("云场", "Cloud field")}</legend>
          ${heavenlyCloudNumericControlsMarkup("field")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("交互", "Interaction")}</legend>
          ${heavenlyCloudNumericControlsMarkup("interaction")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面", "Opening frame")}</legend>
          ${heavenlyCloudNumericControlsMarkup("opening")}
        </fieldset>
        <label class="particle-toggle-row heavenly-cloud-paused-row" for="cle-heavenly-cloud-paused">
          ${bilingualLabelMarkup("暂停动画", "Pause animation")}
          <input id="cle-heavenly-cloud-paused" type="checkbox">
        </label>
        <div class="glow-horizon-actions heavenly-cloud-actions">
          <button class="heavenly-cloud-reset" type="button">${bilingualLabelMarkup("重置", "Reset")}</button>
          <button class="heavenly-cloud-replay" type="button">${bilingualLabelMarkup("重播", "Replay")}</button>
        </div>
        <p class="particle-plugin-error heavenly-cloud-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}

function formatAuroraIonosphereControlValue(
  definition: AuroraIonosphereNumericControlDefinition,
  value: number,
): string {
  const precision = definition.precision ?? Math.max(0, (String(definition.step).split(".")[1] ?? "").length);
  return `${value.toFixed(precision)}${definition.unit ?? ""}`;
}

function auroraIonosphereNumericControlsMarkup(group: AuroraIonosphereControlGroup): string {
  return AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS[definition.key];
      const formatted = formatAuroraIonosphereControlValue(definition, value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-aurora-ionosphere-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}

function auroraIonosphereBackgroundCardMarkup(): string {
  const icon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.8 11.9c1.3-4 2.8-6.1 4.2-6.1 1.5 0 1.6 4.4 3 4.4 1.2 0 2.1-2.7 3.3-5.9"/><path d="M3.1 13.6c1.4-2.5 2.6-3.7 3.7-3.7 1.2 0 1.8 2.1 3 2.1 1 0 1.9-1.2 2.8-3.4"/><path d="M3.4 3.3h.01M10.3 2.3h.01M13.5 7h.01"/></svg>`;
  return `
    <article class="preview-extension appearance-extension aurora-ionosphere-background-extension" data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icon}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Aurora Ionosphere Background</h4>
          <span class="preview-extension-status" id="cle-aurora-ionosphere-background-status">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="cle-aurora-ionosphere-background-status" aria-pressed="false">Enable</button>
        <button class="particle-settings-trigger aurora-ionosphere-settings-trigger" type="button" title="Configure Aurora Ionosphere Background" aria-label="Configure Aurora Ionosphere Background" aria-haspopup="dialog" aria-controls="cle-aurora-ionosphere-settings" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}

function auroraIonosphereSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel aurora-ionosphere-settings-panel" id="cle-aurora-ionosphere-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-aurora-ionosphere-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观", "Appearance")}</p>
          <h3 id="cle-aurora-ionosphere-settings-title">${bilingualLabelMarkup("极光电离层设置", "Aurora Ionosphere settings")}</h3>
        </div>
        <div class="particle-settings-header-actions">
          ${backgroundLanguageSwitchMarkup("cle-aurora-ionosphere-settings-language")}
          <button class="particle-settings-close aurora-ionosphere-settings-close" type="button" title="关闭极光电离层设置" aria-label="关闭极光电离层设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染质量", "Render quality")}</legend>
          <div class="heavenly-cloud-quality-toolbar aurora-ionosphere-quality-toolbar" role="group" aria-label="光幕采样">
            <button type="button" data-aurora-ionosphere-quality="low" aria-pressed="${DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS.quality === "low"}"><strong>32</strong>${bilingualLabelMarkup("轻量", "Light")}</button>
            <button type="button" data-aurora-ionosphere-quality="medium" aria-pressed="${DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS.quality === "medium"}"><strong>50</strong>${bilingualLabelMarkup("均衡", "Balanced")}</button>
            <button type="button" data-aurora-ionosphere-quality="high" aria-pressed="${DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS.quality === "high"}"><strong>72</strong>${bilingualLabelMarkup("精细", "Fine")}</button>
          </div>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("电离层", "Ionosphere field")}</legend>
          ${auroraIonosphereNumericControlsMarkup("field")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面", "Opening frame")}</legend>
          ${auroraIonosphereNumericControlsMarkup("opening")}
        </fieldset>
        <label class="particle-toggle-row aurora-ionosphere-paused-row" for="cle-aurora-ionosphere-paused">
          ${bilingualLabelMarkup("暂停动画", "Pause animation")}
          <input id="cle-aurora-ionosphere-paused" type="checkbox">
        </label>
        <div class="glow-horizon-actions aurora-ionosphere-actions">
          <button class="aurora-ionosphere-reset" type="button">${bilingualLabelMarkup("重置", "Reset")}</button>
          <button class="aurora-ionosphere-replay" type="button">${bilingualLabelMarkup("重播", "Replay")}</button>
        </div>
        <p class="particle-plugin-error aurora-ionosphere-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}
function formatMilkyWayControlValue(
  definition: MilkyWayNumericControlDefinition,
  value: number,
): string {
  const precision = definition.precision ?? Math.max(0, (String(definition.step).split(".")[1] ?? "").length);
  return `${value.toFixed(precision)}${definition.unit ?? ""}`;
}

function milkyWayNumericControlsMarkup(group: MilkyWayControlGroup): string {
  return MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group === group)
    .map((definition) => {
      const value = DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS[definition.key];
      const formatted = formatMilkyWayControlValue(definition, value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh, definition.label)}</label>
          <input id="${definition.id}" data-milky-way-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}

function milkyWayBackgroundCardMarkup(): string {
  const icon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.8 11.9c1.3-4 2.8-6.1 4.2-6.1 1.5 0 1.6 4.4 3 4.4 1.2 0 2.1-2.7 3.3-5.9"/><path d="M3.1 13.6c1.4-2.5 2.6-3.7 3.7-3.7 1.2 0 1.8 2.1 3 2.1 1 0 1.9-1.2 2.8-3.4"/><path d="M3.4 3.3h.01M10.3 2.3h.01M13.5 7h.01"/></svg>`;
  return `
    <article class="preview-extension appearance-extension milky-way-background-extension" data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icon}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Milky Way Background</h4>
          <span class="preview-extension-status" id="cle-milky-way-background-status">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="cle-milky-way-background-status" aria-pressed="false">Enable</button>
        <button class="particle-settings-trigger milky-way-settings-trigger" type="button" title="Configure Milky Way Background" aria-label="Configure Milky Way Background" aria-haspopup="dialog" aria-controls="cle-milky-way-settings" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}

function milkyWaySettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel milky-way-settings-panel" id="cle-milky-way-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-milky-way-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观", "Appearance")}</p>
          <h3 id="cle-milky-way-settings-title">${bilingualLabelMarkup("银河光场设置", "Milky Way settings")}</h3>
        </div>
        <div class="particle-settings-header-actions">
          ${backgroundLanguageSwitchMarkup("cle-milky-way-settings-language")}
          <button class="particle-settings-close milky-way-settings-close" type="button" title="关闭银河光场设置" aria-label="关闭银河光场设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染质量", "Render quality")}</legend>
          <div class="heavenly-cloud-quality-toolbar milky-way-quality-toolbar" role="group" aria-label="像素密度上限">
            <button type="button" data-milky-way-quality="low" aria-pressed="${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.quality === "low"}"><strong>1×</strong>${bilingualLabelMarkup("轻量", "Light")}</button>
            <button type="button" data-milky-way-quality="medium" aria-pressed="${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.quality === "medium"}"><strong>2×</strong>${bilingualLabelMarkup("均衡", "Balanced")}</button>
            <button type="button" data-milky-way-quality="high" aria-pressed="${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.quality === "high"}"><strong>3×</strong>${bilingualLabelMarkup("精细", "Fine")}</button>
          </div>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("运动与形态", "Movement and form")}</legend>
          ${milkyWayNumericControlsMarkup("field")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面", "Opening frame")}</legend>
          ${milkyWayNumericControlsMarkup("opening")}
        </fieldset>
        <label class="particle-toggle-row milky-way-paused-row" for="cle-milky-way-paused">
          ${bilingualLabelMarkup("暂停动画", "Pause animation")}
          <input id="cle-milky-way-paused" type="checkbox">
        </label>
        <label class="particle-toggle-row" for="cle-milky-way-intro-enabled">
          ${bilingualLabelMarkup("启用开场", "Enable opening")}<input id="cle-milky-way-intro-enabled" type="checkbox">
        </label>
        <fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("五色调色板", "Five-color palette")}</legend>
          ${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.colors.map((color, i) => `<label class="particle-toggle-row">${bilingualLabelMarkup("颜色 " + (i + 1), "Color " + (i + 1))}<input type="color" data-milky-way-color="${i}" value="${color}" aria-label="Color ${i + 1}"></label>`).join("")}
        </fieldset>
        <div class="glow-horizon-actions milky-way-actions">
          <button class="milky-way-reset" type="button">${bilingualLabelMarkup("重置", "Reset")}</button>
          <button class="milky-way-replay" type="button">${bilingualLabelMarkup("重播", "Replay")}</button>
        </div>
        <p class="particle-plugin-error milky-way-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}

function pixelSculptCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${PIXEL_SCULPT_BACKGROUND_PLUGIN_ID}"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 13 6 3l4 7 2-4 3 7ZM4 7l2 2 2-2" fill="none" stroke="currentColor"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Pixel Sculpt Background</h4><span class="preview-extension-status pixelSculpt-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action pixelSculpt-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger pixelSculpt-settings-trigger" type="button" aria-label="Configure Pixel Sculpt Background" aria-haspopup="dialog" aria-controls="cle-pixelSculpt-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
function blinkingSquaresCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${BLINKING_SQUARES_BACKGROUND_PLUGIN_ID}" aria-busy="false"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="3" height="3"/><rect x="7" y="2" width="2" height="2"/><rect x="12" y="1" width="3" height="3"/><rect x="2" y="8" width="2" height="2"/><rect x="7" y="7" width="3" height="3"/><rect x="12" y="9" width="2" height="2"/><rect x="1" y="12" width="3" height="3"/><rect x="8" y="13" width="2" height="2"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Blinking Squares Background</h4><span class="preview-extension-status blinkingSquares-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action blinkingSquares-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger blinkingSquares-settings-trigger" type="button" aria-label="Configure Blinking Squares Background" aria-haspopup="dialog" aria-controls="cle-blinkingSquares-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
const STARTUP_TRANSITION_MARKET_VISIBLE = true;

function startupTransitionCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="code-codex.startup-transition" ${STARTUP_TRANSITION_MARKET_VISIBLE ? "" : "hidden aria-hidden=\"true\""}><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2v3m0 6v3M2 8h3m6 0h3"/><circle cx="8" cy="8" r="1.5"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Codex Startup Transition</h4><span class="preview-extension-status startupTransition-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action startupTransition-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger startupTransition-settings-trigger" type="button" aria-label="Configure Codex Startup Transition" aria-haspopup="dialog" aria-controls="cle-startupTransition-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
function startupTransitionPanelMarkup(): string {
  const controls: readonly [keyof Pick<StartupTransitionSettings, "minimumVisiblePercent" | "fadePercent">, string, string, number, number, number][] = [
    ["minimumVisiblePercent", "最短展示比例", "Minimum display", 0, 100, 1],
    ["fadePercent", "淡出比例", "Fade", 0, 100, 1],
  ];
  const videoControls: readonly [keyof Pick<StartupTransitionSettings, "playbackRate" | "videoBrightness">, string, string, number, number, number][] = [
    ["playbackRate", "播放速度", "Playback speed", 0.5, 2, 0.05],
    ["videoBrightness", "视频亮度", "Video brightness", 0.4, 1.4, 0.05],
  ];
  return `<section class="particle-settings-panel startupTransition-settings-panel" id="cle-startupTransition-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-startupTransition-title">
    <header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观", "Appearance")}</p><h3 id="cle-startupTransition-title">${bilingualLabelMarkup("Codex 启动过渡", "Codex Startup Transition")}</h3></div><div class="particle-settings-header-actions">${backgroundLanguageSwitchMarkup("cle-startupTransition-language")}<button class="particle-settings-close startupTransition-close" type="button" aria-label="Close settings">${icons.close}</button></div></header>
    <div class="particle-settings-scroll">
      <p>${bilingualLabelMarkup("在此预览启动效果。自选视频只保存在本机。", "Preview the startup effect here. Your video stays on this computer.")}</p>
      <div class="particle-control-row"><label for="cle-startupTransition-source">${bilingualLabelMarkup("动画来源", "Animation source")}</label><select id="cle-startupTransition-source"><option value="video">Video</option><option value="background">Background plugin</option></select></div>
      <div class="particle-control-row startupTransition-background-controls" hidden><label for="cle-startupTransition-background">${bilingualLabelMarkup("背景插件", "Background plugin")}</label><select id="cle-startupTransition-background">${STARTUP_BACKGROUNDS.map(([id,name])=>`<option value="${id}">${name}</option>`).join("")}</select></div>
      <div class="particle-control-row startupTransition-background-fade" hidden><label for="cle-startupTransition-background-fade">${bilingualLabelMarkup("背景淡化时间", "Background fade duration")}</label><input id="cle-startupTransition-background-fade" type="range" min="0.1" max="10" step="0.1" value="1"><span class="particle-control-value"><output>1.0 s</output></span></div>
      <div class="startupTransition-preview-workspace">
        <div class="startupTransition-preview-stage" aria-label="Startup transition preview"><video class="startupTransition-video-still" muted playsinline preload="metadata" hidden></video></div>
        <div class="startupTransition-timeline" role="group" aria-label="视频时间轴">
          <div class="startupTransition-timeline-heading"><strong>${bilingualLabelMarkup("视频时间轴", "Video timeline")}</strong><output class="startupTransition-timeline-range"></output>
          <div class="startupTransition-transport" role="group" aria-label="Playback controls">
            <button class="startupTransition-jump-start" type="button" aria-label="Go to clip start"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M18 5l-9 7 9 7z"/></svg></button>
            <button class="startupTransition-play" type="button" aria-label="Play" aria-pressed="false"><svg class="startupTransition-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg><svg class="startupTransition-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button>
            <button class="startupTransition-jump-end" type="button" aria-label="Go to clip end"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M6 5l9 7-9 7z"/></svg></button>
          </div></div>
          <div class="startupTransition-timeline-ruler" aria-hidden="true"><span>0:00.0</span><span>0:01.3</span><span>0:02.5</span><span>0:03.8</span><span>0:05.0</span></div>
          <div class="startupTransition-timeline-track">
            <div class="startupTransition-timeline-frames" aria-hidden="true">${Array.from({ length: 7 }, () => '<span class="startupTransition-timeline-frame"></span>').join("")}</div>
            <div class="startupTransition-timeline-empty">${bilingualLabelMarkup("选择视频后可拖动两端裁剪", "Choose a video to drag its trim handles")}</div>
            <div class="startupTransition-timeline-selection" aria-hidden="true"></div>
            <div class="startupTransition-timeline-mask startupTransition-timeline-mask--left" aria-hidden="true"></div>
            <div class="startupTransition-timeline-mask startupTransition-timeline-mask--right" aria-hidden="true"></div>
            <div class="startupTransition-timeline-playhead" aria-hidden="true" hidden></div>
            <div class="startupTransition-timeline-handle" data-startup-timeline-edge="start" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="片段起点" hidden><span></span></div>
            <div class="startupTransition-timeline-handle" data-startup-timeline-edge="end" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="片段终点" hidden><span></span></div>
          </div>
          <div class="startupTransition-timeline-timing-track" role="group" aria-label="Clip timing ranges">
            <div class="startupTransition-timeline-timing-clip"><span class="startupTransition-timeline-minimum" tabindex="0"></span><span class="startupTransition-timeline-fade" tabindex="0"></span></div>
          </div>
        </div>
      </div>
      <fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("自选视频", "Custom video")}</legend>
        <div class="startupTransition-media-actions"><button class="startupTransition-upload" type="button">${bilingualLabelMarkup("选择视频", "Choose video")}</button><button class="startupTransition-remove" type="button" disabled>${bilingualLabelMarkup("移除视频", "Remove video")}</button><input class="startupTransition-file" type="file" accept="video/*" hidden></div>
        <p class="startupTransition-video-info" role="status">${bilingualLabelMarkup("请先选择视频。未选择视频时不播放启动动画。", "Choose a video first. No startup animation plays without a video.")}</p>
      </fieldset>
      <fieldset class="particle-settings-group startupTransition-parameter-grid"><legend>${bilingualLabelMarkup("视频外观", "Video appearance")}</legend>
        ${videoControls.map(([key, zh, en, min, max, step]) => `<div class="particle-control-row"><label for="cle-startupTransition-${key}">${bilingualLabelMarkup(zh, en)}</label><input id="cle-startupTransition-${key}" data-startup-transition-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULT_STARTUP_TRANSITION_SETTINGS[key]}"><span class="particle-control-value"><output></output></span></div>`).join("")}
        <div class="particle-control-row startupTransition-fit-row"><label for="cle-startupTransition-fit">${bilingualLabelMarkup("画面适配", "Video fit")}</label><select id="cle-startupTransition-fit"><option value="cover">铺满</option><option value="contain">完整显示</option></select></div>
      </fieldset>
      <fieldset class="particle-settings-group startupTransition-parameter-grid"><legend>${bilingualLabelMarkup("播放时长", "Timing")}</legend>${controls.map(([key, zh, en, min, max, step]) => `<div class="particle-control-row"><label for="cle-startupTransition-${key}">${bilingualLabelMarkup(zh, en)}</label><input id="cle-startupTransition-${key}" data-startup-transition-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULT_STARTUP_TRANSITION_SETTINGS[key]}"><span class="particle-control-value"><output>${DEFAULT_STARTUP_TRANSITION_SETTINGS[key]}%</output></span></div>`).join("")}</fieldset>
      <div class="glow-horizon-actions"><button class="startupTransition-reset" type="button">${bilingualLabelMarkup("重置参数", "Reset settings")}</button></div>
      <p class="particle-plugin-error startupTransition-error" role="alert" hidden></p>
    </div>
  </section>`;
}
function blinkingSquaresPanelMarkup(): string {
  const control = ([key, zh, en, min, max, step]: (typeof BLINKING_SQUARES_CONTROLS)[number]) => `<div class="particle-control-row"><label for="cle-blinkingSquares-${key}">${bilingualLabelMarkup(zh, en)}</label><input id="cle-blinkingSquares-${key}" data-blinking-squares-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${BLINKING_SQUARES_DEFAULTS[key]}"><span class="particle-control-value"><output>${BLINKING_SQUARES_DEFAULTS[key]}</output></span></div>`;
  const toggle = (key: "mouseInteraction" | "keyboardInteraction" | "introEnabled" | "paused", zh: string, en: string) => `<label class="particle-toggle-row">${bilingualLabelMarkup(zh, en)}<input type="checkbox" data-blinking-squares-toggle="${key}"></label>`;
  return `<section class="particle-settings-panel blinkingSquares-settings-panel" id="cle-blinkingSquares-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-blinkingSquares-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观", "Appearance")}</p><h3 id="cle-blinkingSquares-title">${bilingualLabelMarkup("闪烁方块设置", "Blinking Squares settings")}</h3></div><div class="particle-settings-header-actions">${backgroundLanguageSwitchMarkup("cle-blinkingSquares-language")}<button class="particle-settings-close blinkingSquares-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("渐隐方向", "Fade direction")}</legend><div class="heavenly-cloud-quality-toolbar">${(["right", "left", "top", "bottom"] as const).map((direction) => `<button type="button" data-blinking-squares-direction="${direction}" aria-pressed="${direction === "right"}">${bilingualLabelMarkup(({ right: "右", left: "左", top: "上", bottom: "下" })[direction], direction[0]!.toUpperCase() + direction.slice(1))}</button>`).join("")}</div></fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("方块与闪烁", "Squares and twinkle")}</legend>${BLINKING_SQUARES_CONTROLS.slice(0, 10).map(control).join("")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("交互与脉冲", "Interaction and pulses")}</legend>${BLINKING_SQUARES_CONTROLS.slice(10, 20).map(control).join("")}${toggle("mouseInteraction", "鼠标交互", "Mouse interaction")}${toggle("keyboardInteraction", "键盘随机波纹", "Keyboard waves")}${BLINKING_SQUARES_CONTROLS.slice(20, 22).map(control).join("")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("开场与画质", "Opening and quality")}</legend>${BLINKING_SQUARES_CONTROLS.slice(22).map(control).join("")}${toggle("introEnabled", "启用开场", "Enable opening")}${toggle("paused", "暂停动画", "Pause animation")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("颜色", "Colors")}</legend><div class="particle-control-row"><label for="cle-blinkingSquares-squareColor">${bilingualLabelMarkup("方块颜色", "Square color")}</label><input id="cle-blinkingSquares-squareColor" type="color" data-blinking-squares-color="squareColor" value="${BLINKING_SQUARES_DEFAULTS.squareColor}"></div><div class="particle-control-row"><label for="cle-blinkingSquares-backgroundColor">${bilingualLabelMarkup("背景颜色", "Background color")}</label><input id="cle-blinkingSquares-backgroundColor" type="color" data-blinking-squares-color="backgroundColor" value="${BLINKING_SQUARES_DEFAULTS.backgroundColor}"></div></fieldset><div class="glow-horizon-actions"><button type="button" class="blinkingSquares-reset">${bilingualLabelMarkup("重置", "Reset")}</button><button type="button" class="blinkingSquares-replay">${bilingualLabelMarkup("重播", "Replay")}</button></div><p class="particle-plugin-error blinkingSquares-error" role="status" hidden></p></div></section>`;
}
function pixelSculptPanelMarkup(): string {
 return `<section class="particle-settings-panel pixelSculpt-settings-panel" id="cle-pixelSculpt-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-pixelSculpt-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-pixelSculpt-title">${bilingualLabelMarkup("像素雕塑设置","Pixel Sculpt settings")}</h3></div><div class="particle-settings-header-actions">${backgroundLanguageSwitchMarkup("cle-pixelSculpt-language")}<button class="particle-settings-close pixelSculpt-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><p class="pixelSculpt-disabled">${bilingualLabelMarkup("插件尚未启用；这里的设置会在下次启用时生效。","The plugin is disabled; changes here apply the next time it is enabled.")}</p><div class="pixelSculpt-controls-host"></div><label class="particle-toggle-row pixelSculpt-paused-row">${bilingualLabelMarkup("暂停动画","Pause animation")}<input type="checkbox" class="pixelSculpt-paused"></label><div class="glow-horizon-actions pixelSculpt-actions"><button type="button" class="pixelSculpt-reset">${bilingualLabelMarkup("重置参数","Reset parameters")}</button></div><p class="particle-plugin-error pixelSculpt-error" role="status" hidden></p></div></section>`;
}

function cloudTrainCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${CLOUD_TRAIN_BACKGROUND_PLUGIN_ID}"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 13 6 3l4 7 2-4 3 7ZM4 7l2 2 2-2" fill="none" stroke="currentColor"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Cloud Train Background</h4><span class="preview-extension-status cloudTrain-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action cloudTrain-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger cloudTrain-settings-trigger" type="button" aria-label="Configure Cloud Train Background" aria-haspopup="dialog" aria-controls="cle-cloudTrain-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
function cloudTrainPanelMarkup(): string {
  return `<section class="particle-settings-panel cloudTrain-settings-panel" id="cle-cloudTrain-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-cloudTrain-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-cloudTrain-title">${bilingualLabelMarkup("云间列车设置","Cloud Train settings")}</h3></div><div class="particle-settings-header-actions">${backgroundLanguageSwitchMarkup("cle-cloudTrain-language")}<button class="particle-settings-close cloudTrain-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("列车与云海","Train and clouds")}</legend>${CLOUD_TRAIN_CONTROLS.map(([key,zh,en,min,max,step])=>`<div class="particle-control-row"><label for="cle-cloudTrain-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-cloudTrain-${key}" data-cloudTrain-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${CLOUD_TRAIN_DEFAULTS[key]}"><span class="particle-control-value"><output>${CLOUD_TRAIN_DEFAULTS[key]}</output></span></div>`).join("")}</fieldset>${CLOUD_TRAIN_TINTS.map(([key,zh,en])=>`<div class="particle-control-row"><label for="cle-cloudTrain-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-cloudTrain-${key}" type="color" value="#ffffff"></div>`).join("")}<label class="particle-toggle-row">${bilingualLabelMarkup("启用开场动画","Enable opening")}<input type="checkbox" class="cloudTrain-intro-enabled"></label><label class="particle-toggle-row">${bilingualLabelMarkup("暂停动画","Pause animation")}<input type="checkbox" class="cloudTrain-paused"></label><div class="glow-horizon-actions"><button type="button" class="cloudTrain-reset">${bilingualLabelMarkup("重置","Reset")}</button><button type="button" class="cloudTrain-replay">${bilingualLabelMarkup("重播","Replay")}</button></div><p class="particle-plugin-error cloudTrain-error" role="status" hidden></p></div></section>`;
}

function mountainCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${MOUNTAIN_BACKGROUND_PLUGIN_ID}"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 13 6 3l4 7 2-4 3 7ZM4 7l2 2 2-2" fill="none" stroke="currentColor"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Layered Mountain Background</h4><span class="preview-extension-status mountain-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action mountain-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger mountain-settings-trigger" type="button" aria-label="Configure Layered Mountain Background" aria-haspopup="dialog" aria-controls="cle-mountain-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
function mountainPanelMarkup(): string {
  return `<section class="particle-settings-panel mountain-settings-panel" id="cle-mountain-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-mountain-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-mountain-title">${bilingualLabelMarkup("层叠山峦设置","Layered Mountain settings")}</h3></div><div class="particle-settings-header-actions">${backgroundLanguageSwitchMarkup("cle-mountain-language")}<button class="particle-settings-close mountain-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("山峦与氛围","Mountains and atmosphere")}</legend>${MOUNTAIN_CONTROLS.map(([key,zh,en,min,max,step])=>`<div class="particle-control-row"><label for="cle-mountain-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-mountain-${key}" data-mountain-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${MOUNTAIN_DEFAULTS[key]}"><span class="particle-control-value"><output>${MOUNTAIN_DEFAULTS[key]}</output></span></div>`).join("")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("渲染质量","Render quality")}</legend><div class="heavenly-cloud-quality-toolbar">${[[28,"流畅","Fast"],[42,"均衡","Balanced"],[57,"完整","Full"]].map(([steps,zh,en])=>`<button type="button" data-mountain-steps="${steps}" aria-pressed="${steps===57}">${bilingualLabelMarkup(String(zh),String(en))}</button>`).join("")}</div></fieldset><label class="particle-toggle-row">${bilingualLabelMarkup("暂停动画","Pause animation")}<input type="checkbox" class="mountain-paused"></label><div class="glow-horizon-actions"><button type="button" class="mountain-reset">${bilingualLabelMarkup("重置","Reset")}</button><button type="button" class="mountain-replay">${bilingualLabelMarkup("重播","Replay")}</button></div><p class="particle-plugin-error mountain-error" role="status" hidden></p></div></section>`;
}

function mediaPreviewRoute(path: string): MediaPreviewRoute | undefined {
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return undefined;
  return MEDIA_PREVIEW_ROUTES[name.slice(dot + 1).toLocaleLowerCase()];
}

export class CodeCodexElement extends HTMLElement {
  readonly #shadow: ShadowRoot;
  readonly #surfaceOpacity: SurfaceOpacityPlugin;
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
  #homeViewActive = true;
  #homeScrollTop = 0;
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
  #updateCandidate: UpdateCheckResult | undefined;
  #updateDialogOpen = false;
  #updateInstallPending = false;
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
  readonly #mountainController = getMountainBackgroundController();
  readonly #pixelSculptController = getPixelSculptBackgroundController();
  readonly #blinkingSquaresController = getBlinkingSquaresBackgroundController();
  #blinkingSquaresUnsubscribe: (() => void) | undefined;
  #blinkingSquaresInitialization: Promise<void> | undefined;
  #blinkingSquaresEventsBound = false;
  #startupTransitionEventsBound = false;
  #startupTransitionNativeSync: Promise<void> = Promise.resolve();
  #startupTransitionPending = false;
  #startupVideo: StartupVideo | null = null;
  #startupStillUrl: string | undefined;
  #startupTimelineFramesAbort: AbortController | undefined;
  #startupTimelineScrubTime: number | undefined;
  #startupPlaybackFrame: number | undefined;
  #startupBackgroundPreview: { dispose(): void } | undefined;
  #startupBackgroundPreviewId: string | undefined;
  #startupPlaybackGeneration = 0;
  #startupPlaybackRunning = false;
  #startupPreviewElapsed = 0;
  #startupPreviewLeadIn = 0;
  #startupPreviewFadeOpacity = 1;
  #startupPreviewComplete = false;
  #startupVideoGeneration = 0;
  #startupVideoPending = false;
  #pixelSculptUnsubscribe: (() => void) | undefined;
  #pixelSculptInitialization: Promise<void> | undefined;
  #pixelSculptEventsBound = false;
  readonly #cloudTrainController = getCloudTrainBackgroundController();
  #cloudTrainUnsubscribe: (() => void) | undefined;
  #cloudTrainInitialization: Promise<void> | undefined;
  #cloudTrainEventsBound = false;
  #mountainUnsubscribe: (() => void) | undefined;
  #mountainInitialization: Promise<void> | undefined;
  #mountainEventsBound = false;
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
  #gitHistoryOpen = false;
  #gitHistoryLoading = false;
  #gitHistoryGeneration = 0;
  #gitHistoryCommits: GitCommitSummary[] = [];
  #gitHistoryHasMore = false;
  #gitHistoryResizeState: { pointerId: number; startY: number; startHeight: number } | undefined;
  #particleSettingsOpen = false;
  #blackHoleSettingsOpen = false;
  #glowHorizonSettingsOpen = false;
  #heavenlyCloudSettingsOpen = false;
  #auroraIonosphereSettingsOpen = false;
  #milkyWaySettingsOpen = false;
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
  readonly #updatePopover: HTMLElement;
  readonly #updateMessage: HTMLElement;
  readonly #updateLaterButton: HTMLButtonElement;
  readonly #updateInstallButton: HTMLButtonElement;
  readonly #previewMarketButton: HTMLButtonElement;
  readonly #previewMarketPopover: HTMLElement;
  readonly #previewMarketList: HTMLElement;
  readonly #previewMarketCloseButton: HTMLButtonElement;
  readonly #gitHistoryOpenButton: HTMLButtonElement;
  readonly #gitHistoryPanel: HTMLElement;
  readonly #gitHistoryResizeHandle: HTMLElement;
  readonly #gitHistoryCloseButton: HTMLButtonElement;
  readonly #gitHistoryRefreshButton: HTMLButtonElement;
  readonly #gitHistoryBranch: HTMLElement;
  readonly #gitHistoryState: HTMLElement;
  readonly #gitHistoryList: HTMLElement;
  readonly #gitHistoryLoadMoreButton: HTMLButtonElement;
  readonly #gitHistoryListView: HTMLElement;
  readonly #gitHistoryDetailView: HTMLElement;
  readonly #gitHistoryBackButton: HTMLButtonElement;
  readonly #gitHistoryDetail: HTMLElement;
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
  readonly #particleIntroEnabledInput: HTMLInputElement;
  readonly #particleOpeningReplayButton: HTMLButtonElement;
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
  readonly #heavenlyCloudBackgroundController = getHeavenlyCloudBackgroundController();
  #heavenlyCloudBackgroundUnsubscribe: (() => void) | undefined;
  #heavenlyCloudBackgroundInitialization: Promise<void> | undefined;
  readonly #heavenlyCloudBackgroundCard: HTMLElement;
  readonly #heavenlyCloudBackgroundButton: HTMLButtonElement;
  readonly #heavenlyCloudBackgroundStatus: HTMLElement;
  readonly #heavenlyCloudSettingsPanel: HTMLElement;
  readonly #heavenlyCloudSettingsTrigger: HTMLButtonElement;
  readonly #heavenlyCloudSettingsCloseButton: HTMLButtonElement;
  readonly #heavenlyCloudNumericControls = new Map<HeavenlyCloudNumericSettingKey, Readonly<{
    definition: HeavenlyCloudNumericControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }>>();
  readonly #heavenlyCloudQualityButtons: readonly HTMLButtonElement[];
  readonly #heavenlyCloudPausedInput: HTMLInputElement;
  readonly #heavenlyCloudResetButton: HTMLButtonElement;
  readonly #heavenlyCloudReplayButton: HTMLButtonElement;
  readonly #heavenlyCloudPluginError: HTMLElement;
  readonly #auroraIonosphereBackgroundController = getAuroraIonosphereBackgroundController();
  #auroraIonosphereBackgroundUnsubscribe: (() => void) | undefined;
  #auroraIonosphereBackgroundInitialization: Promise<void> | undefined;
  readonly #auroraIonosphereBackgroundCard: HTMLElement;
  readonly #auroraIonosphereBackgroundButton: HTMLButtonElement;
  readonly #auroraIonosphereBackgroundStatus: HTMLElement;
  readonly #auroraIonosphereSettingsPanel: HTMLElement;
  readonly #auroraIonosphereSettingsTrigger: HTMLButtonElement;
  readonly #auroraIonosphereSettingsCloseButton: HTMLButtonElement;
  readonly #auroraIonosphereNumericControls = new Map<AuroraIonosphereNumericSettingKey, Readonly<{
    definition: AuroraIonosphereNumericControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }>>();
  readonly #auroraIonosphereQualityButtons: readonly HTMLButtonElement[];
  readonly #auroraIonospherePausedInput: HTMLInputElement;
  readonly #auroraIonosphereResetButton: HTMLButtonElement;
  readonly #auroraIonosphereReplayButton: HTMLButtonElement;
  readonly #auroraIonospherePluginError: HTMLElement;
  readonly #milkyWayBackgroundController = getMilkyWayBackgroundController();
  #milkyWayBackgroundUnsubscribe: (() => void) | undefined;
  #milkyWayBackgroundInitialization: Promise<void> | undefined;
  readonly #milkyWayBackgroundCard: HTMLElement;
  readonly #milkyWayBackgroundButton: HTMLButtonElement;
  readonly #milkyWayBackgroundStatus: HTMLElement;
  readonly #milkyWaySettingsPanel: HTMLElement;
  readonly #milkyWaySettingsTrigger: HTMLButtonElement;
  readonly #milkyWaySettingsCloseButton: HTMLButtonElement;
  readonly #milkyWayNumericControls = new Map<MilkyWayNumericSettingKey, Readonly<{
    definition: MilkyWayNumericControlDefinition;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }>>();
  readonly #milkyWayQualityButtons: readonly HTMLButtonElement[];
  readonly #milkyWayPausedInput: HTMLInputElement;
  readonly #milkyWayResetButton: HTMLButtonElement;
  readonly #milkyWayReplayButton: HTMLButtonElement;
  readonly #milkyWayPluginError: HTMLElement;
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
    observePluginControls(this.#shadow);
    this.#shadow.innerHTML = `
      <style>${styles}${SURFACE_OPACITY_TREE_CSS}</style>
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
        ${gitHistoryPanelMarkup()}
        <div class="loading-veil" aria-hidden="true"><span class="loading-chip">Switching project</span></div>
        <footer class="statusbar">
          <div class="preview-market-popover" id="cle-preview-market" role="dialog" aria-modal="false" aria-labelledby="cle-preview-market-title" hidden>
            <div class="preview-market-header">
              <h3 id="cle-preview-market-title">Preview Market</h3>
              <button class="preview-market-close" type="button" title="Close Preview Market" aria-label="Close Preview Market">${icons.close}</button>
            </div>
            <div class="preview-market-list">
              <div class="preview-market-categories" role="tablist" aria-label="Plugin categories">
                <button class="preview-market-category" type="button" role="tab" aria-selected="true" aria-controls="cle-appearance-section" data-preview-market-category="appearance">Appearance</button>
                <button class="preview-market-category" type="button" role="tab" aria-selected="false" aria-controls="cle-file-preview-section" data-preview-market-category="file-preview">File Preview</button>
                <button class="preview-market-category" type="button" role="tab" aria-selected="false" aria-controls="cle-developer-tools-section" data-preview-market-category="developer-tools">Tools</button>
              </div>
              <section class="preview-market-section" id="cle-appearance-section" role="tabpanel" data-preview-market-section="appearance">
                <div class="preview-market-section-list">${surfaceOpacityCardMarkup()}${transparentBackgroundCardMarkup()}${particleBackgroundCardMarkup()}${blackHoleBackgroundCardMarkup()}${glowHorizonBackgroundCardMarkup()}${heavenlyCloudBackgroundCardMarkup()}${auroraIonosphereBackgroundCardMarkup()}${milkyWayBackgroundCardMarkup()}${mountainCardMarkup()}${cloudTrainCardMarkup()}${pixelSculptCardMarkup()}${blinkingSquaresCardMarkup()}${startupTransitionCardMarkup()}</div>
              </section>
              <section class="preview-market-section" id="cle-file-preview-section" role="tabpanel" data-preview-market-section="file-preview" hidden>
                <div class="preview-market-section-list">${PREVIEWER_DEFINITIONS.map(previewerCardMarkup).join("")}</div>
              </section>
              <section class="preview-market-section" id="cle-developer-tools-section" role="tabpanel" data-preview-market-section="developer-tools" hidden>
                <div class="preview-market-section-list">${gitHistoryCardMarkup()}</div>
              </section>
            </div>
          </div>
          <button class="preview-market-button" type="button" aria-haspopup="dialog" aria-controls="cle-preview-market" aria-expanded="false">${icons.preview}<span>Preview Market</span></button>
          <div class="update-popover" id="cle-update-dialog" role="dialog" aria-modal="false" aria-labelledby="cle-update-title" aria-describedby="cle-update-message" hidden>
            <h3 id="cle-update-title">Code-Codex update available</h3>
            <p class="update-message" id="cle-update-message"></p>
            <div class="update-actions">
              <button class="update-later" type="button">Later</button>
              <button class="update-install" type="button">Update</button>
            </div>
          </div>
          <button class="status-code" type="button" title="Check GitHub for updates" aria-label="Check GitHub for updates" aria-haspopup="dialog" aria-controls="cle-update-dialog" aria-expanded="false">WAIT</button>
        </footer>
        <div class="action-notice" popover="manual" role="status" hidden></div>
        <div class="context-menu" role="menu" aria-label="Explorer actions" aria-busy="false" hidden></div>
        <div class="resize-handle" role="separator" aria-label="Resize explorer" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="480" aria-valuenow="260" tabindex="0"></div>
      </div>
      ${particleSettingsPanelMarkup()}
      ${blackHoleSettingsPanelMarkup()}
      ${glowHorizonSettingsPanelMarkup()}
      ${heavenlyCloudSettingsPanelMarkup()}
      ${auroraIonosphereSettingsPanelMarkup()}
      ${milkyWaySettingsPanelMarkup()}
      ${mountainPanelMarkup()}
      ${cloudTrainPanelMarkup()}
      ${pixelSculptPanelMarkup()}
      ${blinkingSquaresPanelMarkup()}
      ${startupTransitionPanelMarkup()}
      ${surfaceOpacityPanelMarkup(backgroundLanguageSwitchMarkup("cle-surface-opacity-settings-language"), bilingualLabelMarkup)}
      <button class="collapsed-tab" type="button" title="Open Code-Codex" aria-label="Open Code-Codex">${icons.collapse}</button>
      <div class="sr-only live-region" aria-live="polite" aria-atomic="true"></div>
    `;

    this.#surfaceOpacity = new SurfaceOpacityPlugin(this.#shadow, (zh,en)=>this.#backgroundText(zh,en), message=>this.#showActionNotice(message,"error"));
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
    this.#updatePopover = this.#required<HTMLElement>(".update-popover");
    this.#updateMessage = this.#required<HTMLElement>(".update-message");
    this.#updateLaterButton = this.#required<HTMLButtonElement>(".update-later");
    this.#updateInstallButton = this.#required<HTMLButtonElement>(".update-install");
    this.#previewMarketButton = this.#required<HTMLButtonElement>(".preview-market-button");
    this.#previewMarketPopover = this.#required<HTMLElement>(".preview-market-popover");
    this.#previewMarketList = this.#required<HTMLElement>(".preview-market-list");
    this.#previewMarketCloseButton = this.#required<HTMLButtonElement>(".preview-market-close");
    this.#gitHistoryOpenButton = this.#required<HTMLButtonElement>(".git-history-open");
    this.#gitHistoryPanel = this.#required<HTMLElement>(".git-history-panel");
    this.#gitHistoryResizeHandle = this.#required<HTMLElement>(".git-history-resize-handle");
    this.#gitHistoryCloseButton = this.#required<HTMLButtonElement>(".git-history-close");
    this.#gitHistoryRefreshButton = this.#required<HTMLButtonElement>(".git-history-refresh");
    this.#gitHistoryBranch = this.#required<HTMLElement>(".git-history-branch");
    this.#gitHistoryState = this.#required<HTMLElement>(".git-history-state");
    this.#gitHistoryList = this.#required<HTMLElement>(".git-history-list");
    this.#gitHistoryLoadMoreButton = this.#required<HTMLButtonElement>(".git-history-load-more");
    this.#gitHistoryListView = this.#required<HTMLElement>(".git-history-list-view");
    this.#gitHistoryDetailView = this.#required<HTMLElement>(".git-history-detail-view");
    this.#gitHistoryBackButton = this.#required<HTMLButtonElement>(".git-history-back");
    this.#gitHistoryDetail = this.#required<HTMLElement>(".git-history-detail");
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
    this.#particleSettingsTrigger = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"] .particle-settings-trigger`);
    this.#particleSettingsCloseButton = this.#required<HTMLButtonElement>(".particle-settings-close");
    this.#particleIntroEnabledInput = this.#required<HTMLInputElement>("#cle-particle-intro-enabled");
    this.#particleOpeningReplayButton = this.#required<HTMLButtonElement>(".particle-opening-replay");
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
    if (this.#backgroundLanguageInputs.length !== 12) {
      throw new Error("Background settings require twelve synchronized language switches.");
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
    this.#heavenlyCloudBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}"]`);
    this.#heavenlyCloudBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#heavenlyCloudBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#heavenlyCloudSettingsPanel = this.#required<HTMLElement>(".heavenly-cloud-settings-panel");
    this.#heavenlyCloudSettingsTrigger = this.#required<HTMLButtonElement>(".heavenly-cloud-settings-trigger");
    this.#heavenlyCloudSettingsCloseButton = this.#required<HTMLButtonElement>(".heavenly-cloud-settings-close");
    for (const definition of HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      this.#heavenlyCloudNumericControls.set(definition.key, { definition, input, output });
    }
    this.#heavenlyCloudQualityButtons = Array.from(
      this.#shadow.querySelectorAll<HTMLButtonElement>("[data-heavenly-cloud-quality]"),
    );
    this.#heavenlyCloudPausedInput = this.#required<HTMLInputElement>("#cle-heavenly-cloud-paused");
    this.#heavenlyCloudResetButton = this.#required<HTMLButtonElement>(".heavenly-cloud-reset");
    this.#heavenlyCloudReplayButton = this.#required<HTMLButtonElement>(".heavenly-cloud-replay");
    this.#heavenlyCloudPluginError = this.#required<HTMLElement>(".heavenly-cloud-plugin-error");
    this.#auroraIonosphereBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}"]`);
    this.#auroraIonosphereBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#auroraIonosphereBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#auroraIonosphereSettingsPanel = this.#required<HTMLElement>(".aurora-ionosphere-settings-panel");
    this.#auroraIonosphereSettingsTrigger = this.#required<HTMLButtonElement>(".aurora-ionosphere-settings-trigger");
    this.#auroraIonosphereSettingsCloseButton = this.#required<HTMLButtonElement>(".aurora-ionosphere-settings-close");
    for (const definition of AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      this.#auroraIonosphereNumericControls.set(definition.key, { definition, input, output });
    }
    this.#auroraIonosphereQualityButtons = Array.from(
      this.#shadow.querySelectorAll<HTMLButtonElement>("[data-aurora-ionosphere-quality]"),
    );
    this.#auroraIonospherePausedInput = this.#required<HTMLInputElement>("#cle-aurora-ionosphere-paused");
    this.#auroraIonosphereResetButton = this.#required<HTMLButtonElement>(".aurora-ionosphere-reset");
    this.#auroraIonosphereReplayButton = this.#required<HTMLButtonElement>(".aurora-ionosphere-replay");
    this.#auroraIonospherePluginError = this.#required<HTMLElement>(".aurora-ionosphere-plugin-error");
    this.#milkyWayBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}"]`);
    this.#milkyWayBackgroundButton = this.#required<HTMLButtonElement>(
      `[data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`,
    );
    this.#milkyWayBackgroundStatus = this.#required<HTMLElement>(
      `[data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`,
    );
    this.#milkyWaySettingsPanel = this.#required<HTMLElement>(".milky-way-settings-panel");
    this.#milkyWaySettingsTrigger = this.#required<HTMLButtonElement>(".milky-way-settings-trigger");
    this.#milkyWaySettingsCloseButton = this.#required<HTMLButtonElement>(".milky-way-settings-close");
    for (const definition of MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS) {
      const input = this.#required<HTMLInputElement>(`#${definition.id}`);
      const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
      this.#milkyWayNumericControls.set(definition.key, { definition, input, output });
    }
    this.#milkyWayQualityButtons = Array.from(
      this.#shadow.querySelectorAll<HTMLButtonElement>("[data-milky-way-quality]"),
    );
    this.#milkyWayPausedInput = this.#required<HTMLInputElement>("#cle-milky-way-paused");
    this.#milkyWayResetButton = this.#required<HTMLButtonElement>(".milky-way-reset");
    this.#milkyWayReplayButton = this.#required<HTMLButtonElement>(".milky-way-replay");
    this.#milkyWayPluginError = this.#required<HTMLElement>(".milky-way-plugin-error");
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
    if (this.#mountainController.stoppedForExternalThemeChange) this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);
    if (this.#cloudTrainController.stoppedForExternalThemeChange) this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
    if (this.#pixelSculptController.stoppedForExternalThemeChange) this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
    if (this.#blinkingSquaresController.stoppedForExternalThemeChange) this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
    if (this.#enabledAppearancePlugins.has(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID)) {
      this.#enabledAppearancePlugins.clear(); this.#enabledAppearancePlugins.add(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
    }
    if (this.#enabledAppearancePlugins.has(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID)) {
      this.#enabledAppearancePlugins.clear(); this.#enabledAppearancePlugins.add(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
    }
    if (this.#enabledAppearancePlugins.has(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID)) {
      this.#enabledAppearancePlugins.clear(); this.#enabledAppearancePlugins.add(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
    }
    if (this.#enabledAppearancePlugins.has(MOUNTAIN_BACKGROUND_PLUGIN_ID)) {
      this.#enabledAppearancePlugins.clear(); this.#enabledAppearancePlugins.add(MOUNTAIN_BACKGROUND_PLUGIN_ID);
      this.#writeEnabledAppearancePlugins();
    }
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
    if (this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (this.#milkyWayBackgroundController.stoppedForExternalThemeChange) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    }
    if (this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID)) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) || normalizedAppearancePlugins;
    } else if (this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    } else if (this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)) {
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
      normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || normalizedAppearancePlugins;
    } else if (this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) {
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
    this.#heavenlyCloudBackgroundUnsubscribe?.();
    this.#heavenlyCloudBackgroundUnsubscribe = this.#heavenlyCloudBackgroundController.subscribe(() => {
      if (!this.#connected) return;
      if (
        this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange
        && this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
      ) {
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderHeavenlyCloudBackgroundPlugin();
    });
    this.#heavenlyCloudBackgroundInitialization = this.#glowHorizonBackgroundInitialization
      .then(() => this.#initializeHeavenlyCloudBackground(appearanceInitializationGeneration));
    this.#auroraIonosphereBackgroundUnsubscribe?.();
    this.#auroraIonosphereBackgroundUnsubscribe = this.#auroraIonosphereBackgroundController.subscribe(() => {
      if (!this.#connected) return;
      if (
        this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange
        && this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)
      ) {
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderAuroraIonosphereBackgroundPlugin();
      this.#renderMilkyWayBackgroundPlugin();
    });
    this.#auroraIonosphereBackgroundInitialization = this.#heavenlyCloudBackgroundInitialization
      .then(() => this.#initializeAuroraIonosphereBackground(appearanceInitializationGeneration));
    this.#milkyWayBackgroundUnsubscribe?.();
    this.#milkyWayBackgroundUnsubscribe = this.#milkyWayBackgroundController.subscribe(() => {
      if (!this.#connected) return;
      if (
        this.#milkyWayBackgroundController.stoppedForExternalThemeChange
        && this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID)
      ) {
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderMilkyWayBackgroundPlugin();
    });
    this.#milkyWayBackgroundInitialization = this.#auroraIonosphereBackgroundInitialization
      .then(() => this.#initializeMilkyWayBackground(appearanceInitializationGeneration));
    this.#mountainUnsubscribe?.();
    this.#mountainUnsubscribe = this.#mountainController.subscribe(() => {
      if (this.#mountainController.stoppedForExternalThemeChange) {
        this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
      }
      this.#renderMountain();
      this.#renderCloudTrain();
    });
    this.#mountainInitialization = this.#milkyWayBackgroundInitialization.then(async () => {
      if (!this.#isCurrentBackgroundInitialization(appearanceInitializationGeneration)) return;
      if (this.#enabledAppearancePlugins.has(MOUNTAIN_BACKGROUND_PLUGIN_ID)) {
        try { await this.#mountainController.enable(); } catch(error) { this.#showActionNotice(String(error), "error"); }
      }
      this.#renderMountain();
    });
    this.#bindMountain();
    this.#cloudTrainUnsubscribe?.();
    this.#cloudTrainUnsubscribe = this.#cloudTrainController.subscribe(() => {
      if (this.#cloudTrainController.stoppedForExternalThemeChange) {
        this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
      }
      this.#renderCloudTrain();
    });
    this.#cloudTrainInitialization = this.#mountainInitialization!.then(async () => {
      if (!this.#isCurrentBackgroundInitialization(appearanceInitializationGeneration)) return;
      if (this.#enabledAppearancePlugins.has(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID)) {
        try { await this.#cloudTrainController.enable(); } catch(error) { this.#showActionNotice(String(error), "error"); }
      }
      this.#renderCloudTrain();
    });
    this.#bindCloudTrain();
    this.#pixelSculptUnsubscribe?.();
    this.#pixelSculptUnsubscribe = this.#pixelSculptController.subscribe(() => {
      if(this.#pixelSculptController.stoppedForExternalThemeChange){this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);this.#writeEnabledAppearancePlugins();}
      this.#renderPixelSculpt();
    });
    this.#pixelSculptInitialization = this.#cloudTrainInitialization.then(async()=>{
      if(!this.#isCurrentBackgroundInitialization(appearanceInitializationGeneration))return;
      if(this.#enabledAppearancePlugins.has(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID)){try{await this.#pixelSculptController.enable();}catch(error){this.#showActionNotice(String(error),"error");}}
      this.#renderPixelSculpt();
    });
    this.#bindPixelSculpt();
    this.#blinkingSquaresUnsubscribe?.();
    this.#blinkingSquaresUnsubscribe = this.#blinkingSquaresController.subscribe(() => {
      if (this.#blinkingSquaresController.stoppedForExternalThemeChange) {
        this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
        this.#writeEnabledAppearancePlugins();
      }
      this.#renderBlinkingSquares();
    });
    this.#blinkingSquaresInitialization = this.#pixelSculptInitialization.then(async () => {
      if (!this.#isCurrentBackgroundInitialization(appearanceInitializationGeneration)) return;
      if (this.#enabledAppearancePlugins.has(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID)) {
        try { await this.#blinkingSquaresController.enable(); }
        catch (error) { this.#showActionNotice(String(error), "error"); }
      }
      this.#renderBlinkingSquares();
    });
    this.#bindBlinkingSquares();
    this.#bindStartupTransition();
    this.#surfaceOpacity.start();

    this.#appearancePluginApplied = undefined;
    this.#appearancePluginError = undefined;
    this.#renderPreviewMarket();
    this.#applySettings();
    this.#applyResponsivePlacement();
    this.#applyTheme();
    this.#bindDomEvents();

    const bootstrap = this.#nativeReconnectMarker ?? getBootstrapConfig();
    runtimeEvent("renderer", "bootstrap", "received", {version:bootstrap.version,codexVersion:bootstrap.codexVersion,compatible:bootstrap.compatible,supported:bootstrap.supported,appearancePlugins:[...this.#enabledAppearancePlugins],startupAnimationEnabled:readStartupTransitionSettings().enabled});
    this.#nativeReconnectMarker = bootstrap;
    const compatibility = assessBootstrapCompatibility(bootstrap);
    if (!compatibility.supported) {
      this.#setState("incompatible", compatibility.reason);
      return;
    }

    this.#bridge = new ExplorerBridge(bootstrap.token ?? "", bootstrap.binding, bootstrap.receiver);
    this.#unsubscribe = this.#bridge.subscribe((notification) => this.#onNotification(notification.method, notification.params));
    if (!this.#bridge.available) {
      this.#setState("error", "NO_BRIDGE");
      return;
    }
    connectBackgroundPackages((method, params, timeout) => this.#bridge!.request(method, params, timeout));
    this.#backgroundPackageMarket?.dispose();
    this.#backgroundPackageMarket = new BackgroundPackageMarket(this.#shadow, this.#bridge, message => this.#showActionNotice(message, 'error'), (id,intent)=>this.#prepareDownloadedPluginAction(id,intent));
    this.#startupTransitionNativeSync = this.#syncStartupTransitionNativePreference(this.#bridge);
    void this.#start(this.#bridge, this.#generation, bootstrap.manualWorkspace === true);
  }

  disconnectedCallback(): void {
    if (this.#reparenting) return;
    if (!this.#connected) return;
    // Native Settings can replace the entire workspace row during one React
    // commit. Decide after that commit, before disposing the retained bridge.
    queueMicrotask(() => {
      if (this.isConnected || !this.#connected) return;
      if (!this.#dismissed && !isExplorerDismissedForSession() &&
        window.__codeCodexRuntimeOwner?.tagName === this.localName && document.body) {
        this.setHomeViewActive(false);
        if (!this.isConnected) this.#moveHost(document.body, null);
        return;
      }
      this.#disposeDisconnected();
    });
  }

  #disposeDisconnected(): void {
    this.#surfaceOpacity.stop();
    this.#closeContextMenu(false);
    this.#closePreviewMarket(false);
    this.#startupVideoGeneration += 1;
    this.#startupTimelineFramesAbort?.abort();
    this.#stopStartupPreview();
    if (this.#startupStillUrl) URL.revokeObjectURL(this.#startupStillUrl);
    this.#startupStillUrl = undefined;
    this.#closeUpdateDialog(false);
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
    this.#heavenlyCloudBackgroundUnsubscribe?.();
    this.#heavenlyCloudBackgroundUnsubscribe = undefined;
    this.#heavenlyCloudBackgroundInitialization = undefined;
    this.#auroraIonosphereBackgroundUnsubscribe?.();
    this.#auroraIonosphereBackgroundUnsubscribe = undefined;
    this.#auroraIonosphereBackgroundInitialization = undefined;
    this.#milkyWayBackgroundUnsubscribe?.();
    this.#milkyWayBackgroundUnsubscribe = undefined;
    this.#mountainUnsubscribe?.(); this.#mountainUnsubscribe=undefined; this.#mountainInitialization=undefined;
    this.#pixelSculptUnsubscribe?.(); this.#pixelSculptUnsubscribe=undefined; this.#pixelSculptInitialization=undefined;
    this.#closePixelSculpt();
    this.#blinkingSquaresUnsubscribe?.(); this.#blinkingSquaresUnsubscribe=undefined; this.#blinkingSquaresInitialization=undefined;
    this.#closeBlinkingSquares();
    this.#cloudTrainUnsubscribe?.(); this.#cloudTrainUnsubscribe=undefined; this.#cloudTrainInitialization=undefined;
    this.#closeCloudTrain();
    this.#closeMountain();
    this.#closeCloudTrain();
    this.#milkyWayBackgroundInitialization = undefined;
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
    if (this.#settings.collapsed !== collapsed) runtimeEvent("renderer","file tree",collapsed ? "collapsed" : "expanded");
    this.#settings = { ...this.#settings, collapsed };
    if (collapsed) {
      this.#closeContextMenu(false);
      this.#closePreviewMarket(false);
      this.#closeUpdateDialog(false);
    }
    this.#applySettings();
    this.#persistSettings();
    this.#announce(collapsed ? "Explorer collapsed" : "Explorer opened");
    if (!collapsed) {
      this.#renderVisible();
      requestAnimationFrame(() => this.#treeShell.focus());
    }
  }

  openPreviewMarket(): void {
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    else this.#previewMarketCloseButton.focus();
  }

  checkForUpdates(): void {
    void this.#checkForUpdates();
  }

  async disable(): Promise<void> {
    if (this.#disableButton.disabled) return;
    this.#closeContextMenu(false);
    this.#closePreviewMarket(false);
    this.#closeUpdateDialog(false);
    if (!this.#leaveEditing("Hide Code-Codex and discard your unsaved changes?")) return;
    this.#disableButton.disabled = true;
    this.#dismissed = true;
    this.#appearanceOperation += 1;
    this.#appearanceTransitionPending = false;
    const particleWasEnabled = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
    const blackHoleWasEnabled = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
    const glowHorizonWasEnabled = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
    const heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
    const auroraIonosphereWasEnabled = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
    const milkyWayWasEnabled = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
    const mountainWasEnabled = this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);
    const pixelSculptWasEnabled = this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
    const blinkingSquaresWasEnabled = this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
    if (blinkingSquaresWasEnabled) this.#writeEnabledAppearancePlugins();
    if (blinkingSquaresWasEnabled || this.#blinkingSquaresController.enabled || this.#blinkingSquaresController.pending) await this.#blinkingSquaresController.disable();
    if(pixelSculptWasEnabled)this.#writeEnabledAppearancePlugins();
    if(pixelSculptWasEnabled||this.#pixelSculptController.enabled||this.#pixelSculptController.pending)await this.#pixelSculptController.disable();
    const cloudTrainWasEnabled = this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
    if (cloudTrainWasEnabled) this.#writeEnabledAppearancePlugins();
    if (cloudTrainWasEnabled || this.#cloudTrainController.enabled || this.#cloudTrainController.pending) await this.#cloudTrainController.disable();
    if (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled || auroraIonosphereWasEnabled || milkyWayWasEnabled || mountainWasEnabled) this.#writeEnabledAppearancePlugins();
    if (mountainWasEnabled || this.#mountainController.enabled || this.#mountainController.pending) await this.#mountainController.disable();
    if (particleWasEnabled || this.#particleBackgroundController.enabled) {
      await this.#particleBackgroundController.disable();
    }
    if (blackHoleWasEnabled || this.#blackHoleBackgroundController.enabled) {
      await this.#blackHoleBackgroundController.disable();
    }
    if (glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled) {
      await this.#glowHorizonBackgroundController.disable();
    }
    if (heavenlyCloudWasEnabled || this.#heavenlyCloudBackgroundController.enabled) {
      await this.#heavenlyCloudBackgroundController.disable();
    }
    if (auroraIonosphereWasEnabled || this.#auroraIonosphereBackgroundController.enabled) {
      await this.#auroraIonosphereBackgroundController.disable();
    }
    if (milkyWayWasEnabled || this.#milkyWayBackgroundController.enabled) {
      await this.#milkyWayBackgroundController.disable();
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

  setHomeViewActive(active: boolean): void {
    if (this.#homeViewActive === active) return;
    runtimeEvent("renderer", "file tree visibility", active ? "shown" : "hidden", {reason:active ? "Home active" : "outside Home"});
    this.#homeViewActive = active;
    if (!active) this.#homeScrollTop = this.#treeShell.scrollTop;
    this.toggleAttribute("data-home-view-hidden", !active);
    this.toggleAttribute("inert", !active);
    if (active) this.removeAttribute("aria-hidden");
    else this.setAttribute("aria-hidden", "true");
    if (!active) {
      this.#closeContextMenu(false);
      this.#closePreviewMarket(false);
      this.#closeUpdateDialog(false);
      this.#clearDragState();
      this.#cancelMarquee();
      this.#mainPreview?.setSuspended(true);
      if (document.body) {
        this.#mainPreview?.reparent(document.body);
        this.#moveHost(document.body, null);
      }
    } else {
      requestAnimationFrame(() => {
        if (!this.#homeViewActive || !this.#connected) return;
        this.#treeShell.scrollTop = this.#homeScrollTop;
        this.#renderVisible();
      });
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
    if (!this.#homeViewActive) return;
    const nextSurface = surface?.isConnected ? surface : undefined;
    const alreadyReconciled = nextSurface === this.#mainPreviewSurface &&
      (!this.#mainPreview || this.#mainPreview.parentElement === nextSurface);
    if (this.#editSaving) {
      this.#queuedMainPreviewReconcile = alreadyReconciled ? undefined : { surface: nextSurface };
      return;
    }
    if (alreadyReconciled) return;
    this.#mainPreview?.setSuspended(true);
    this.#mainPreviewSurface = nextSurface;
    if (!nextSurface && document.body) this.#mainPreview?.reparent(document.body);
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
    this.#backgroundPackageMarket?.dispose();
    this.#backgroundPackageMarket = undefined;
    connectBackgroundPackages(undefined);
    this.#bridge?.dispose();
    this.#bridge = undefined;
    this.#renderAppearancePlugin();

    if (!compatibility.supported) {
      this.#setState("incompatible", compatibility.reason);
      return;
    }

    const bridge = new ExplorerBridge(bootstrap.token ?? "", bootstrap.binding, bootstrap.receiver);
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
    this.#tracker.start((threadId, homeView) => {
      this.setHomeViewActive(homeView);
      if (homeView) void this.#switchThread(threadId);
    });
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
    this.#surfaceOpacity.render();
    const language = this.#backgroundSettingsLanguage;
    const english = language === "en";
    for (const panel of [this.#required<HTMLElement>("#cle-surface-opacity-settings"), this.#particleSettingsPanel, this.#blackHoleSettingsPanel, this.#glowHorizonSettingsPanel, this.#heavenlyCloudSettingsPanel, this.#auroraIonosphereSettingsPanel, this.#milkyWaySettingsPanel, this.#required<HTMLElement>("#cle-mountain-settings"), this.#required<HTMLElement>("#cle-cloudTrain-settings"), this.#required<HTMLElement>("#cle-pixelSculpt-settings"), this.#required<HTMLElement>("#cle-blinkingSquares-settings"), this.#required<HTMLElement>("#cle-startupTransition-settings")]) {
      panel.dataset.language = language;
      panel.lang = language === "zh" ? "zh-CN" : "en";
    }
    for (const input of this.#backgroundLanguageInputs) {
      input.checked = english;
    }
    const videoFit = this.#required<HTMLSelectElement>("#cle-startupTransition-fit");
    videoFit.options[0]!.textContent = english ? "Fill" : "铺满";
    videoFit.options[1]!.textContent = english ? "Contain" : "完整显示";
    this.#particleSettingsCloseButton.title = this.#backgroundText("关闭粒子设置", "Close particle settings");
    this.#particleSettingsCloseButton.setAttribute("aria-label", this.#particleSettingsCloseButton.title);
    this.#blackHoleSettingsCloseButton.title = this.#backgroundText("关闭黑洞设置", "Close black hole settings");
    this.#blackHoleSettingsCloseButton.setAttribute("aria-label", this.#blackHoleSettingsCloseButton.title);
    this.#glowHorizonSettingsCloseButton.title = this.#backgroundText("关闭发光地平线设置", "Close Glow Horizon settings");
    this.#glowHorizonSettingsCloseButton.setAttribute("aria-label", this.#glowHorizonSettingsCloseButton.title);
    this.#heavenlyCloudSettingsCloseButton.title = this.#backgroundText("关闭天境云隧道设置", "Close Heavenly Cloud settings");
    this.#heavenlyCloudSettingsCloseButton.setAttribute("aria-label", this.#heavenlyCloudSettingsCloseButton.title);
    this.#auroraIonosphereSettingsCloseButton.title = this.#backgroundText("关闭极光电离层设置", "Close Aurora Ionosphere settings");
    this.#auroraIonosphereSettingsCloseButton.setAttribute("aria-label", this.#auroraIonosphereSettingsCloseButton.title);
    this.#milkyWaySettingsCloseButton.title = this.#backgroundText("关闭银河光场设置", "Close Milky Way settings");
    this.#milkyWaySettingsCloseButton.setAttribute("aria-label", this.#milkyWaySettingsCloseButton.title);

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
    for (const control of this.#heavenlyCloudNumericControls.values()) {
      const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
      control.input.setAttribute("aria-label", label);
      const formatted = formatHeavenlyCloudControlValue(control.definition, Number(control.input.value));
      control.input.setAttribute("aria-valuetext", formatted);
    }
    this.#shadow.querySelector<HTMLElement>(".heavenly-cloud-quality-toolbar")?.setAttribute(
      "aria-label",
      this.#backgroundText("光线步数", "Ray steps"),
    );
    for (const control of this.#auroraIonosphereNumericControls.values()) {
      const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
      control.input.setAttribute("aria-label", label);
      const formatted = formatAuroraIonosphereControlValue(control.definition, Number(control.input.value));
      control.input.setAttribute("aria-valuetext", formatted);
    }
    this.#shadow.querySelector<HTMLElement>(".aurora-ionosphere-quality-toolbar")?.setAttribute(
      "aria-label",
      this.#backgroundText("光幕采样", "Curtain samples"),
    );
    for (const control of this.#milkyWayNumericControls.values()) {
      const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
      control.input.setAttribute("aria-label", label);
      const formatted = formatMilkyWayControlValue(control.definition, Number(control.input.value));
      control.input.setAttribute("aria-valuetext", formatted);
    }
    this.#shadow.querySelector<HTMLElement>(".milky-way-quality-toolbar")?.setAttribute(
      "aria-label",
      this.#backgroundText("像素密度上限", "Pixel density limit"),
    );
  }

  #setBackgroundSettingsLanguage(language: BackgroundSettingsLanguage): void {
    this.#backgroundSettingsLanguage = language;
    this.#writeBackgroundSettingsLanguage();
    this.#syncBackgroundSettingsLanguagePresentation();
    this.#renderMountain();
    this.#renderCloudTrain();
    requestAnimationFrame(() => this.#positionMountain());
    this.#renderPixelSculpt();
    requestAnimationFrame(() => this.#positionPixelSculpt());
    this.#renderBlinkingSquares();
    requestAnimationFrame(() => this.#positionBlinkingSquares());
    this.#renderParticleBackgroundPlugin();
    this.#renderBlackHoleBackgroundPlugin();
    this.#renderGlowHorizonBackgroundPlugin();
    this.#renderHeavenlyCloudBackgroundPlugin();
    this.#renderAuroraIonosphereBackgroundPlugin();
    this.#renderMilkyWayBackgroundPlugin();
    this.#renderStartupTransition();
    if (this.#particleSettingsOpen) requestAnimationFrame(() => this.#positionParticleSettingsPanel());
    if (this.#blackHoleSettingsOpen) requestAnimationFrame(() => this.#positionBlackHoleSettingsPanel());
    if (this.#glowHorizonSettingsOpen) requestAnimationFrame(() => this.#positionGlowHorizonSettingsPanel());
    if (this.#heavenlyCloudSettingsOpen) requestAnimationFrame(() => this.#positionHeavenlyCloudSettingsPanel());
    if (this.#auroraIonosphereSettingsOpen) requestAnimationFrame(() => this.#positionAuroraIonosphereSettingsPanel());
    if (this.#milkyWaySettingsOpen) requestAnimationFrame(() => this.#positionMilkyWaySettingsPanel());
  }

  #bindDomEvents(): void {
    if (!this.#domEventsBound) {
      this.#domEventsBound = true;
      this.#collapseButton.addEventListener("click", () => this.collapse(true));
      this.#collapsedTab.addEventListener("click", () => this.collapse(false));
      this.#editModeButton.addEventListener("click", () => this.#toggleEditing());
      this.#statusCode.addEventListener("click", () => void this.#checkForUpdates());
      this.#updateLaterButton.addEventListener("click", () => this.#closeUpdateDialog(true));
      this.#updateInstallButton.addEventListener("click", () => void this.#installUpdate());
      this.#previewMarketButton.addEventListener("click", () => this.#togglePreviewMarket());
      this.#previewMarketCloseButton.addEventListener("click", () => this.#closePreviewMarket(true));
      this.#previewMarketList.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-preview-market-category]");
        const category = button?.dataset.previewMarketCategory;
        if (category === "appearance" || category === "file-preview" || category === "developer-tools") {
          this.#selectPreviewMarketCategory(category);
        }
      });
      this.#gitHistoryOpenButton.addEventListener("click", () => this.#toggleGitHistory());
      this.#gitHistoryCloseButton.addEventListener("click", () => this.#closeGitHistory(true));
      this.#gitHistoryRefreshButton.addEventListener("click", () => void this.#loadGitHistory(true));
      this.#gitHistoryResizeHandle.addEventListener("pointerdown", (event) => this.#beginGitHistoryResize(event));
      this.#gitHistoryResizeHandle.addEventListener("pointermove", (event) => this.#updateGitHistoryResize(event));
      this.#gitHistoryResizeHandle.addEventListener("pointerup", (event) => this.#finishGitHistoryResize(event));
      this.#gitHistoryResizeHandle.addEventListener("pointercancel", (event) => this.#finishGitHistoryResize(event));
      this.#gitHistoryResizeHandle.addEventListener("lostpointercapture", (event) => this.#finishGitHistoryResize(event));
      this.#gitHistoryResizeHandle.addEventListener("keydown", (event) => this.#onGitHistoryResizeKeyDown(event));
      this.#gitHistoryLoadMoreButton.addEventListener("click", () => void this.#loadGitHistory(false));
      this.#gitHistoryBackButton.addEventListener("click", () => this.#showGitHistoryList());
      this.#gitHistoryList.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-git-hash]");
        if (button?.dataset.gitHash) void this.#openGitCommit(button.dataset.gitHash);
      });
      this.#gitHistoryDetail.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        const openButton = target?.closest<HTMLButtonElement>("button[data-git-open-file]");
        if (openButton?.dataset.gitOpenFile && openButton.dataset.gitHash) {
          void this.#openGitHistoryFile(openButton.dataset.gitHash, openButton.dataset.gitOpenFile);
        }
      });
      this.#transparentBackgroundButton.addEventListener("click", () => void this.#toggleTransparentBackground());
      this.#particleBackgroundButton.addEventListener("click", () => void this.#toggleParticleBackground());
      this.#blackHoleBackgroundButton.addEventListener("click", () => void this.#toggleBlackHoleBackground());
      this.#glowHorizonBackgroundButton.addEventListener("click", () => void this.#toggleGlowHorizonBackground());
      this.#heavenlyCloudBackgroundButton.addEventListener("click", () => void this.#toggleHeavenlyCloudBackground());
      this.#auroraIonosphereBackgroundButton.addEventListener("click", () => void this.#toggleAuroraIonosphereBackground());
      this.#milkyWayBackgroundButton.addEventListener("click", () => void this.#toggleMilkyWayBackground());
      this.#particleSettingsTrigger.addEventListener("click", () => this.#toggleParticleSettings());
      this.#particleSettingsCloseButton.addEventListener("click", () => this.#closeParticleSettings(true));
      this.#blackHoleSettingsTrigger.addEventListener("click", () => this.#toggleBlackHoleSettings());
      this.#blackHoleSettingsCloseButton.addEventListener("click", () => this.#closeBlackHoleSettings(true));
      this.#glowHorizonSettingsTrigger.addEventListener("click", () => this.#toggleGlowHorizonSettings());
      this.#glowHorizonSettingsCloseButton.addEventListener("click", () => this.#closeGlowHorizonSettings(true));
      this.#heavenlyCloudSettingsTrigger.addEventListener("click", () => this.#toggleHeavenlyCloudSettings());
      this.#heavenlyCloudSettingsCloseButton.addEventListener("click", () => this.#closeHeavenlyCloudSettings(true));
      this.#auroraIonosphereSettingsTrigger.addEventListener("click", () => this.#toggleAuroraIonosphereSettings());
      this.#auroraIonosphereSettingsCloseButton.addEventListener("click", () => this.#closeAuroraIonosphereSettings(true));
      this.#milkyWaySettingsTrigger.addEventListener("click", () => this.#toggleMilkyWaySettings());
      this.#milkyWaySettingsCloseButton.addEventListener("click", () => this.#closeMilkyWaySettings(true));
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
      this.#heavenlyCloudSettingsPanel.addEventListener("toggle", () => {
        if (this.#heavenlyCloudSettingsPanel.matches(":popover-open") || !this.#heavenlyCloudSettingsOpen) return;
        this.#heavenlyCloudSettingsOpen = false;
        this.#heavenlyCloudSettingsTrigger.setAttribute("aria-expanded", "false");
      });
      this.#auroraIonosphereSettingsPanel.addEventListener("toggle", () => {
        if (this.#auroraIonosphereSettingsPanel.matches(":popover-open") || !this.#auroraIonosphereSettingsOpen) return;
        this.#auroraIonosphereSettingsOpen = false;
        this.#auroraIonosphereSettingsTrigger.setAttribute("aria-expanded", "false");
      });
      this.#milkyWaySettingsPanel.addEventListener("toggle", () => {
        if (this.#milkyWaySettingsPanel.matches(":popover-open") || !this.#milkyWaySettingsOpen) return;
        this.#milkyWaySettingsOpen = false;
        this.#milkyWaySettingsTrigger.setAttribute("aria-expanded", "false");
      });
      this.#previewMarketList.addEventListener("scroll", () => {
        if (this.#particleSettingsOpen) this.#positionParticleSettingsPanel();
        if (this.#blackHoleSettingsOpen) this.#positionBlackHoleSettingsPanel();
        if (this.#glowHorizonSettingsOpen) this.#positionGlowHorizonSettingsPanel();
        if (this.#heavenlyCloudSettingsOpen) this.#positionHeavenlyCloudSettingsPanel();
        if (this.#auroraIonosphereSettingsOpen) this.#positionAuroraIonosphereSettingsPanel();
        if (this.#milkyWaySettingsOpen) this.#positionMilkyWaySettingsPanel();
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
      this.#particleIntroEnabledInput.addEventListener("change", () => void this.#applyParticleSettingsFromControls());
      this.#particleOpeningReplayButton.addEventListener("click", () => this.#particleBackgroundController.replayOpening());
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
      for (const [key, control] of this.#heavenlyCloudNumericControls) {
        control.input.addEventListener("input", () => {
          const normalized = normalizeHeavenlyCloudSettings({
            ...this.#heavenlyCloudBackgroundController.settings,
            [key]: control.input.value,
          });
          const value = normalized[key];
          control.input.value = String(value);
          const formatted = formatHeavenlyCloudControlValue(control.definition, value);
          control.output.textContent = formatted;
          control.input.setAttribute("aria-valuetext", formatted);
          this.#applyHeavenlyCloudSettingsFromControls();
        });
      }
      this.#heavenlyCloudPausedInput.addEventListener("change", () => this.#applyHeavenlyCloudSettingsFromControls());
      this.#heavenlyCloudResetButton.addEventListener("click", () => {
        this.#heavenlyCloudBackgroundController.reset();
        this.#heavenlyCloudBackgroundController.replay();
      });
      this.#heavenlyCloudReplayButton.addEventListener("click", () => this.#heavenlyCloudBackgroundController.replay());
      for (const button of this.#heavenlyCloudQualityButtons) {
        button.addEventListener("click", () => {
          const quality = button.dataset.heavenlyCloudQuality;
          if (quality !== "low" && quality !== "medium" && quality !== "high") return;
          this.#heavenlyCloudBackgroundController.updateSettings({
            ...this.#heavenlyCloudBackgroundController.settings,
            quality,
          });
        });
      }
      for (const [key, control] of this.#auroraIonosphereNumericControls) {
        control.input.addEventListener("input", () => {
          const normalized = normalizeAuroraIonosphereSettings({
            ...this.#auroraIonosphereBackgroundController.settings,
            [key]: control.input.value,
          });
          const value = normalized[key];
          control.input.value = String(value);
          const formatted = formatAuroraIonosphereControlValue(control.definition, value);
          control.output.textContent = formatted;
          control.input.setAttribute("aria-valuetext", formatted);
          this.#applyAuroraIonosphereSettingsFromControls();
        });
      }
      this.#auroraIonospherePausedInput.addEventListener("change", () => this.#applyAuroraIonosphereSettingsFromControls());
      this.#auroraIonosphereResetButton.addEventListener("click", () => {
        this.#auroraIonosphereBackgroundController.reset();
        this.#auroraIonosphereBackgroundController.replay();
      });
      this.#auroraIonosphereReplayButton.addEventListener("click", () => this.#auroraIonosphereBackgroundController.replay());
      for (const button of this.#auroraIonosphereQualityButtons) {
        button.addEventListener("click", () => {
          const quality = button.dataset.auroraIonosphereQuality;
          if (quality !== "low" && quality !== "medium" && quality !== "high") return;
          this.#auroraIonosphereBackgroundController.updateSettings({
            ...this.#auroraIonosphereBackgroundController.settings,
            quality,
          });
        });
      }
      for (const [key, control] of this.#milkyWayNumericControls) {
        control.input.addEventListener("input", () => {
          const normalized = normalizeMilkyWaySettings({
            ...this.#milkyWayBackgroundController.settings,
            [key]: control.input.value,
          });
          const value = normalized[key];
          control.input.value = String(value);
          const formatted = formatMilkyWayControlValue(control.definition, value);
          control.output.textContent = formatted;
          control.input.setAttribute("aria-valuetext", formatted);
          this.#applyMilkyWaySettingsFromControls();
        });
      }
      for (const input of this.#shadow.querySelectorAll<HTMLInputElement>("[data-milky-way-color], #cle-milky-way-intro-enabled")) {
        input.addEventListener("input", () => this.#applyMilkyWaySettingsFromControls());
      }
      this.#milkyWayPausedInput.addEventListener("change", () => this.#applyMilkyWaySettingsFromControls());
      this.#milkyWayResetButton.addEventListener("click", () => {
        this.#milkyWayBackgroundController.reset();
        this.#milkyWayBackgroundController.replay();
      });
      this.#milkyWayReplayButton.addEventListener("click", () => this.#milkyWayBackgroundController.replay());
      for (const button of this.#milkyWayQualityButtons) {
        button.addEventListener("click", () => {
          const quality = button.dataset.milkyWayQuality;
          if (quality !== "low" && quality !== "medium" && quality !== "high") return;
          this.#milkyWayBackgroundController.updateSettings({
            ...this.#milkyWayBackgroundController.settings,
            quality,
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
    this.#positionStartupTransition();
    this.#positionBlinkingSquares();
    this.#positionMountain();
    this.#positionPixelSculpt();
    this.#positionCloudTrain();
    this.#closeContextMenu(false);
    const marketHasFocus = this.#previewMarketPopover.contains(this.#shadow.activeElement);
    this.#closePreviewMarket(marketHasFocus);
    this.#closeUpdateDialog(false);
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
    if (event.composedPath().includes(this.#actionNotice)) return;
    if (this.#surfaceOpacity.containsEvent(event)) return;
    this.#surfaceOpacity.close();
    const path = event.composedPath();
    if (!path.includes(this.#required<HTMLElement>("#cle-startupTransition-settings")) && !path.includes(this.#required<HTMLElement>(".startupTransition-settings-trigger"))) this.#closeStartupTransition();
    if (!path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings")) && !path.includes(this.#required<HTMLElement>(".blinkingSquares-settings-trigger"))) this.#closeBlinkingSquares();
    if(!path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))&&!path.includes(this.#required<HTMLElement>(".pixelSculpt-settings-trigger")))this.#closePixelSculpt();
    if (!path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings")) && !path.includes(this.#required<HTMLElement>(".cloudTrain-settings-trigger"))) this.#closeCloudTrain();
    if (!path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
        && !path.includes(this.#required<HTMLElement>(".mountain-settings-trigger"))) this.#closeMountain();
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
      this.#heavenlyCloudSettingsOpen
      && !path.includes(this.#heavenlyCloudSettingsPanel)
      && !path.includes(this.#heavenlyCloudSettingsTrigger)
    ) {
      this.#closeHeavenlyCloudSettings(false);
    }
    if (
      this.#auroraIonosphereSettingsOpen
      && !path.includes(this.#auroraIonosphereSettingsPanel)
      && !path.includes(this.#milkyWaySettingsPanel)
      && !path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings"))
      && !path.includes(this.#auroraIonosphereSettingsTrigger)
    ) {
      this.#closeAuroraIonosphereSettings(false);
    }
    if (
      this.#milkyWaySettingsOpen
      && !path.includes(this.#milkyWaySettingsPanel)
      && !path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
      && !path.includes(this.#milkyWaySettingsTrigger)
      && !path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-startupTransition-settings"))
    ) {
      this.#closeMilkyWaySettings(false);
    }
    if (
      !this.#previewMarketPopover.hidden
      && !path.includes(this.#previewMarketPopover)
      && !path.includes(this.#previewMarketButton)
      && !path.includes(this.#particleSettingsPanel)
      && !path.includes(this.#blackHoleSettingsPanel)
      && !path.includes(this.#glowHorizonSettingsPanel)
      && !path.includes(this.#heavenlyCloudSettingsPanel)
      && !path.includes(this.#auroraIonosphereSettingsPanel)
      && !path.includes(this.#milkyWaySettingsPanel)
      && !path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings"))
      && !path.includes(this.#required<HTMLElement>("#cle-startupTransition-settings"))
    ) {
      this.#closePreviewMarket(false);
    }
    if (
      this.#updateDialogOpen
      && !path.includes(this.#updatePopover)
      && !path.includes(this.#statusCode)
    ) {
      this.#closeUpdateDialog(false);
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
    if (this.#heavenlyCloudSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeHeavenlyCloudSettings(true);
      return;
    }
    if (this.#auroraIonosphereSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeAuroraIonosphereSettings(true);
      return;
    }
    if (this.#milkyWaySettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeMilkyWaySettings(true);
      return;
    }
    if (this.#gitHistoryOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeGitHistory(true);
      return;
    }
    if (this.#updateDialogOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeUpdateDialog(true);
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
    if (!this.#homeViewActive) return;
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
    runtimeEvent("renderer", "workspace selection", "requested", {from:runtimeTaskLabel(this.#threadId),to:runtimeTaskLabel(threadId),hasTask:!!threadId,force,cached:threadId===this.#threadId && !!this.#context});
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
    this.#prepareGitHistoryForThreadSwitch();
    const generation = ++this.#generation;
    this.#clearWorkspaceTimers();
    this.#threadId = threadId;
    this.#context = undefined;

    const bridge = this.#bridge;
    if (!bridge) {
      this.#setState("error", "NO_BRIDGE");
      this.#showGitHistoryUnavailable("Code-Codex is not connected.");
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
        this.#showGitHistoryUnavailable("Choose a local project to view its Git history.");
        return;
      }

      const rawContext = await this.#requestBootstrap<unknown>(bridge, generation, "explorer.context", { threadId });
      if (generation !== this.#generation) return;
      const context = normalizeContext(rawContext, threadId);
      if (!context.compatible) {
        this.#setState("incompatible", context.reason ?? "This Codex version is not supported.");
        this.#showGitHistoryUnavailable("Git history is unavailable for this task.");
        return;
      }
      this.#context = context;
      this.#setHeader(context.projectName, context.rootName);

      const rawList = await this.#requestBootstrap<unknown>(bridge, generation, "explorer.list", { relativePath: "", limit: PAGE_SIZE });
      if (generation !== this.#generation) return;
      const list = normalizeList(rawList);
      this.#model.reset();
      this.#model.beginLoad("");
      this.#model.commitLoad("", list);
      this.#setState("ready");
      this.#renderTree();
      if (!this.#restoreDetachedDraft(context)) this.#announce(`${context.projectName} loaded`);
      if (this.#gitHistoryOpen) void this.#loadGitHistory(true);

      // Show the root before installing a recursive watcher (large projects
      // can take time to subscribe). Re-read after subscription to close the
      // gap between the initial listing and the first watched event.
      try {
        await bridge.request("explorer.watch.start", {});
        if (generation !== this.#generation) return;
        this.#watching = true;
      } catch {
        if (generation !== this.#generation) return;
        this.#watching = false;
      }
      if (this.#watching) await this.#loadDirectory("");
    } catch (error) {
      if (generation !== this.#generation) return;
      if (error instanceof ExplorerBridgeError && error.code === "NO_CONTEXT") {
        try {
          await this.#stopWatch(bridge);
          await this.#clearNativeContext(bridge);
          if (generation !== this.#generation) return;
          this.#showNoProject();
          this.#showGitHistoryUnavailable("Choose a local project to view its Git history.");
        } catch (clearError) {
          if (generation === this.#generation) {
            this.#setState("error", errorCode(clearError));
            this.#showGitHistoryUnavailable("Git history is unavailable for this task.");
          }
        }
      } else if (error instanceof ExplorerBridgeError && error.code === "UNSUPPORTED_VERSION") {
        this.#setState("incompatible", error.message);
        this.#showGitHistoryUnavailable("Git history is unavailable for this task.");
      } else {
        this.#setState("error", errorCode(error));
        this.#showGitHistoryUnavailable("Git history is unavailable while the project is not loaded.");
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

  async #loadDirectory(path: string, append = false, waitForExisting = false, expectedGeneration?: number): Promise<void> {
    if (expectedGeneration !== undefined && expectedGeneration !== this.#generation) return;
    const existing = this.#directoryLoads.get(path);
    if (existing) {
      if (!waitForExisting) return;
      await existing;
      return this.#loadDirectory(path, append, false, expectedGeneration);
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
    if (this.#state !== state) runtimeEvent("renderer", "file tree state", state, {previous:this.#state});
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
    let commitAttempted = false;
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
      if (method === "explorer.entry.import.commit") commitAttempted = true;
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
        commitAttempted = false;
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
        // A lost commit response does not prove the atomic rename failed. Never
        // replay the write: re-read only, scoped to the original workspace.
        const uncertain = commitAttempted && ["TIMEOUT", "NO_BRIDGE", "INVALID_REQUEST", "INVALID_RESPONSE"].includes(errorCode(error));
        let refreshed = false;
        if (committedCount > 0 || commitAttempted) {
          runtimeEvent("file-tree", "import reconciliation", "started", { committedCount, uncertain });
          await this.#loadDirectory(destinationParentPath, false, true, generation);
          if (!this.#canApplyExternalImportResult(bridge, context, generation)) return;
          refreshed = this.#model.hasLoaded(destinationParentPath) && !this.#model.getLoadError(destinationParentPath);
          runtimeEvent("file-tree", "import reconciliation", refreshed ? "passed" : "failed", { committedCount, uncertain });
        }
        this.#showActionNotice(uncertain
          ? refreshed
            ? "The copy result could not be confirmed. Check the refreshed destination folder before retrying; the copy was not repeated."
            : "The copy result could not be confirmed and the destination could not be refreshed. Refresh the folder before retrying; the copy was not repeated."
          : externalImportError(error, committedCount), "error");
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
    this.#openPreviewPath(node.relativePath, node.name);
  }

  #openPreviewPath(relativePath: string, name: string): void {
    if (
      (this.#state !== "ready" && this.#state !== "empty") ||
      !this.#context ||
      !this.#bridge?.available ||
      !this.#mainPreviewSurface?.isConnected
    ) {
      return;
    }
    if (
      this.#editingPath !== null &&
      this.#editingPath !== relativePath &&
      !this.#leaveEditing("Open another file and discard your unsaved changes?")
    ) {
      return;
    }
    if (!this.#ensureMainPreview()) return;

    let tab = this.#previewTabs.find((candidate) => candidate.path === relativePath);
    if (!tab) {
      if (this.#previewTabs.length >= MAX_PREVIEW_TABS) {
        const evicted = this.#previewTabs.shift();
        if (evicted) this.#disposePreviewTab(evicted);
      }
      tab = {
        instanceId: this.#nextPreviewInstanceId++,
        path: relativePath,
        name,
        revision: 0,
        timer: undefined,
        modifiedDuringSave: false,
        dirty: false,
        view: { kind: "loading", path: relativePath, name },
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
    runtimeEvent("renderer","file preview","requested",{tab:runtimeTaskLabel(tab.path),extension:tab.path.split(".").pop()?.slice(0,12),openTabCount:this.#previewTabs.length});
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
    runtimeEvent("renderer","file preview","closed",{tab:runtimeTaskLabel(path),openTabCount:this.#previewTabs.length});
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
    if (!this.#homeViewActive || !surface?.isConnected || this.#dismissed) return undefined;
    const qualifiedSurfaces = activePageElements(document, MAIN_SURFACE_SELECTOR);
    if (qualifiedSurfaces.length !== 1 || qualifiedSurfaces[0] !== surface) return undefined;
    if (this.#mainPreview) {
      this.#mainPreview.reparent(surface);
      this.#mainPreview.setSuspended(false);
      return this.#mainPreview;
    }
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

  async #deactivateAuroraIonosphereForBackgroundSwitch(): Promise<void> {
    const persisted = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
    if (persisted) this.#writeEnabledAppearancePlugins();
    if (persisted || this.#auroraIonosphereBackgroundController.enabled) {
      await this.#auroraIonosphereBackgroundController.disable(true);
    }
  }

  async #deactivateMilkyWayForBackgroundSwitch(): Promise<void> {
    const persisted = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
    if (persisted) this.#writeEnabledAppearancePlugins();
    if (persisted || this.#milkyWayBackgroundController.enabled) {
      await this.#milkyWayBackgroundController.disable(true);
    }
  }

  async #awaitBackgroundInitializations(operation: number, mountainSwitch = false, cloudTrainSwitch = false, pixelSculptSwitch = false, blinkingSquaresSwitch = false): Promise<boolean> {
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
    if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceOperation) return false;
    this.#heavenlyCloudBackgroundInitialization ??= this.#glowHorizonBackgroundInitialization
      .then(() => this.#initializeHeavenlyCloudBackground(generation));
    await this.#heavenlyCloudBackgroundInitialization;
    if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceOperation) return false;
    this.#auroraIonosphereBackgroundInitialization ??= this.#heavenlyCloudBackgroundInitialization
      .then(() => this.#initializeAuroraIonosphereBackground(generation));
    await this.#auroraIonosphereBackgroundInitialization;
    this.#milkyWayBackgroundInitialization ??= this.#auroraIonosphereBackgroundInitialization.then(() => this.#initializeMilkyWayBackground(generation));
    await this.#milkyWayBackgroundInitialization;
    await this.#mountainInitialization;
    await this.#cloudTrainInitialization;
    await this.#pixelSculptInitialization;
    await this.#blinkingSquaresInitialization;
    if (!blinkingSquaresSwitch && (this.#blinkingSquaresController.enabled || this.#enabledAppearancePlugins.has(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID))) {
      await this.#blinkingSquaresController.disable();
      this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
    }
    if(!pixelSculptSwitch&&(this.#pixelSculptController.enabled||this.#enabledAppearancePlugins.has(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID))){
      await this.#pixelSculptController.disable();this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);this.#writeEnabledAppearancePlugins();
    }
    if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceOperation) return false;
    if (!cloudTrainSwitch && (this.#cloudTrainController.enabled || this.#enabledAppearancePlugins.has(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID))) {
      await this.#cloudTrainController.disable();
      this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
    }
    if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceOperation) return false;
    if (!mountainSwitch && (this.#mountainController.enabled || this.#enabledAppearancePlugins.has(MOUNTAIN_BACKGROUND_PLUGIN_ID))) {
      await this.#mountainController.disable();
      this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID); this.#writeEnabledAppearancePlugins();
    }
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
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
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
        && !this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        && !this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)) {
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
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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
    let heavenlyCloudWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('particle-image');
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || this.#heavenlyCloudBackgroundController.enabled;
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
        if (heavenlyCloudWasEnabled || this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
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
          const preserveTheme = reconcilePrevious
            && (blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled);
          await this.#particleBackgroundController.disable(preserveTheme);
          if (reconcilePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          } else if (reconcilePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
            await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
          } else if (reconcilePrevious && heavenlyCloudWasEnabled) {
            transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
            await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
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
          await this.#particleBackgroundController.disable(
            reconcilePrevious && (blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled),
          );
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (reconcilePrevious && blackHoleWasEnabled) {
          transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (reconcilePrevious && glowHorizonWasEnabled) {
          transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        } else if (reconcilePrevious && heavenlyCloudWasEnabled) {
          transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
          await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#particleBackgroundController.stoppedForExternalThemeChange;
      if (particleStarted) {
        await this.#particleBackgroundController.disable(
          (blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled) && !stoppedForThemeChange,
        );
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
      } else if (heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
        transferParticleThemeLease(PARTICLE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
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
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
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

  async #initializeHeavenlyCloudBackground(generation: number): Promise<void> {
    try {
      await this.#heavenlyCloudBackgroundController.initialize();
      if (!this.#isCurrentBackgroundInitialization(generation)) return;
      const enabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        let changed = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        }
        await this.#heavenlyCloudBackgroundController.enable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange) {
          if (this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)) {
            this.#writeEnabledAppearancePlugins();
          }
        }
      } else if (this.#heavenlyCloudBackgroundController.enabled) {
        await this.#heavenlyCloudBackgroundController.disable();
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Heavenly Cloud Background", error);
    } finally {
      if (this.#isCurrentBackgroundInitialization(generation)) this.#renderPreviewMarket();
    }
  }

  async #initializeAuroraIonosphereBackground(generation: number): Promise<void> {
    try {
      await this.#auroraIonosphereBackgroundController.initialize();
      if (!this.#isCurrentBackgroundInitialization(generation)) return;
      const enabled = this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        let changed = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        this.#clearTransparentBackgroundPresentation();
        await this.#deactivateMilkyWayForBackgroundSwitch();
        if (this.#particleBackgroundController.enabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#blackHoleBackgroundController.enabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        }
        await this.#auroraIonosphereBackgroundController.enable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange) {
          if (this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)) {
            this.#writeEnabledAppearancePlugins();
          }
        }
      } else if (this.#auroraIonosphereBackgroundController.enabled) {
        await this.#auroraIonosphereBackgroundController.disable();
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Aurora Ionosphere Background", error);
    } finally {
      if (this.#isCurrentBackgroundInitialization(generation)) this.#renderPreviewMarket();
    }
  }

  async #initializeMilkyWayBackground(generation: number): Promise<void> {
    try {
      await this.#milkyWayBackgroundController.initialize();
      if (!this.#isCurrentBackgroundInitialization(generation)) return;
      const enabled = this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID);
      if (enabled) {
        await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        let changed = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
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
        if (this.#glowHorizonBackgroundController.enabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        if (this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
          if (!this.#isCurrentBackgroundInitialization(generation)) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== MILKY_WAY_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, MILKY_WAY_BACKGROUND_PLUGIN_ID);
        }
        await this.#milkyWayBackgroundController.enable();
        if (!this.#isCurrentBackgroundInitialization(generation)) return;
        if (this.#milkyWayBackgroundController.stoppedForExternalThemeChange) {
          if (this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID)) {
            this.#writeEnabledAppearancePlugins();
          }
        }
      } else if (this.#milkyWayBackgroundController.enabled) {
        await this.#milkyWayBackgroundController.disable();
      }
    } catch (error) {
      console.error("Code-Codex could not initialize Milky Way Background", error);
    } finally {
      if (this.#isCurrentBackgroundInitialization(generation)) this.#renderPreviewMarket();
    }
  }

  async #toggleBlackHoleBackground(): Promise<void> {
    if (
      this.#blackHoleBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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
    let heavenlyCloudWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('black-hole');
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || this.#heavenlyCloudBackgroundController.enabled;
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
        if (heavenlyCloudWasEnabled || this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
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
          const preserveTheme = reconcilePrevious
            && (particleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled);
          await this.#blackHoleBackgroundController.disable(preserveTheme);
          if (reconcilePrevious && particleWasEnabled) {
            transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (reconcilePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
            await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
          } else if (reconcilePrevious && heavenlyCloudWasEnabled) {
            transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
            await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
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
          await this.#blackHoleBackgroundController.disable(
            reconcilePrevious && (particleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled),
          );
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (reconcilePrevious && particleWasEnabled) {
          transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (reconcilePrevious && glowHorizonWasEnabled) {
          transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        } else if (reconcilePrevious && heavenlyCloudWasEnabled) {
          transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
          await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#blackHoleBackgroundController.stoppedForExternalThemeChange;
      if (blackHoleStarted) {
        await this.#blackHoleBackgroundController.disable(
          (particleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled) && !stoppedForThemeChange,
        );
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
      } else if (heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
        transferParticleThemeLease(BLACK_HOLE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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

  #applyHeavenlyCloudSettingsFromControls(): void {
    const values: Record<string, unknown> = { ...this.#heavenlyCloudBackgroundController.settings };
    for (const [key, control] of this.#heavenlyCloudNumericControls) values[key] = control.input.value;
    values.paused = this.#heavenlyCloudPausedInput.checked;
    this.#heavenlyCloudBackgroundController.updateSettings(normalizeHeavenlyCloudSettings(values));
  }

  #applyAuroraIonosphereSettingsFromControls(): void {
    const values: Record<string, unknown> = { ...this.#auroraIonosphereBackgroundController.settings };
    for (const [key, control] of this.#auroraIonosphereNumericControls) values[key] = control.input.value;
    values.paused = this.#auroraIonospherePausedInput.checked;
    this.#auroraIonosphereBackgroundController.updateSettings(normalizeAuroraIonosphereSettings(values));
  }

  #applyMilkyWaySettingsFromControls(): void {
    const values: Record<string, unknown> = { ...this.#milkyWayBackgroundController.settings };
    for (const [key, control] of this.#milkyWayNumericControls) values[key] = control.input.value;
    values.colors = Array.from(this.#shadow.querySelectorAll<HTMLInputElement>("[data-milky-way-color]"), input => input.value);
    values.introEnabled = this.#required<HTMLInputElement>("#cle-milky-way-intro-enabled").checked;
    values.paused = this.#milkyWayPausedInput.checked;
    this.#milkyWayBackgroundController.updateSettings(normalizeMilkyWaySettings(values));
  }

  async #toggleGlowHorizonBackground(): Promise<void> {
    if (
      this.#glowHorizonBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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
    let heavenlyCloudWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('glow-horizon');
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || this.#heavenlyCloudBackgroundController.enabled;
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
        if (heavenlyCloudWasEnabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
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
          await this.#glowHorizonBackgroundController.disable(
            restorePrevious && (particleWasEnabled || blackHoleWasEnabled || heavenlyCloudWasEnabled),
          );
          if (restorePrevious && particleWasEnabled) {
            transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && heavenlyCloudWasEnabled) {
            transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
            await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
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
          await this.#glowHorizonBackgroundController.disable(
            restorePrevious && (particleWasEnabled || blackHoleWasEnabled || heavenlyCloudWasEnabled),
          );
        }
        if (restorePrevious && particleWasEnabled && !this.#particleBackgroundController.enabled) {
          transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
          transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
          transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
          await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#glowHorizonBackgroundController.stoppedForExternalThemeChange;
      if (glowStarted) {
        await this.#glowHorizonBackgroundController.disable(
          (particleWasEnabled || blackHoleWasEnabled || heavenlyCloudWasEnabled) && !stoppedForThemeChange,
        );
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      } else if (heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
        transferParticleThemeLease(GLOW_HORIZON_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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

  async #toggleHeavenlyCloudBackground(): Promise<void> {
    if (
      this.#heavenlyCloudBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    let heavenlyCloudStarted = false;
    let particleWasEnabled = false;
    let blackHoleWasEnabled = false;
    let glowHorizonWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('heavenly-cloud');
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      await this.#deactivateAuroraIonosphereForBackgroundSwitch();
        await this.#deactivateMilkyWayForBackgroundSwitch();
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      previousTransparentBackground = this.#transparentBackgroundPresentation();
      const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
      const enabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
      const active = this.#heavenlyCloudBackgroundController.enabled;
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
        if (glowHorizonWasEnabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        }
        await this.#heavenlyCloudBackgroundController.enable();
        heavenlyCloudStarted = this.#heavenlyCloudBackgroundController.enabled;
        if (this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange) {
          throw new Error(this.#heavenlyCloudBackgroundController.error
            ?? "Heavenly Cloud Background stopped because Codex Appearance changed.");
        }
        if (!heavenlyCloudStarted) throw new Error("Heavenly Cloud Background could not be enabled");
        if (!this.#connected || operation !== this.#appearanceOperation) {
          const restorePrevious = this.#connected && !this.#dismissed;
          const preserveTheme = restorePrevious
            && (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled);
          await this.#heavenlyCloudBackgroundController.disable(preserveTheme);
          if (restorePrevious && particleWasEnabled) {
            transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
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
        this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#heavenlyCloudBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Heavenly Cloud Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) {
        const stoppedForThemeChange = this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange;
        const restorePrevious = this.#connected && !this.#dismissed && !stoppedForThemeChange;
        if (heavenlyCloudStarted) {
          await this.#heavenlyCloudBackgroundController.disable(
            restorePrevious && (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled),
          );
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (restorePrevious && particleWasEnabled && !this.#particleBackgroundController.enabled) {
          transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
          transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
          transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange;
      if (heavenlyCloudStarted) {
        await this.#heavenlyCloudBackgroundController.disable(
          (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled) && !stoppedForThemeChange,
        );
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
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
      const message = error instanceof Error ? error.message : "Heavenly Cloud Background could not be changed";
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

  async #toggleAuroraIonosphereBackground(): Promise<void> {
    if (
      this.#auroraIonosphereBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#heavenlyCloudBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    let auroraStarted = false;
    let particleWasEnabled = false;
    let blackHoleWasEnabled = false;
    let glowHorizonWasEnabled = false;
    let heavenlyCloudWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('aurora-ionosphere');
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || this.#heavenlyCloudBackgroundController.enabled;
      previousTransparentBackground = this.#transparentBackgroundPresentation();
      const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
      const enabled = this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
      const active = this.#auroraIonosphereBackgroundController.enabled;
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
        await this.#deactivateMilkyWayForBackgroundSwitch();
        if (particleWasEnabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (blackHoleWasEnabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (glowHorizonWasEnabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (heavenlyCloudWasEnabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        }
        await this.#auroraIonosphereBackgroundController.enable();
        auroraStarted = this.#auroraIonosphereBackgroundController.enabled;
        if (this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange) {
          throw new Error(this.#auroraIonosphereBackgroundController.error
            ?? "Aurora Ionosphere Background stopped because Codex Appearance changed.");
        }
        if (!auroraStarted) throw new Error("Aurora Ionosphere Background could not be enabled");
        if (!this.#connected || operation !== this.#appearanceOperation) {
          const restorePrevious = this.#connected && !this.#dismissed;
          const preserveTheme = restorePrevious
            && (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled);
          await this.#auroraIonosphereBackgroundController.disable(preserveTheme);
          if (restorePrevious && particleWasEnabled) {
            transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
            await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && heavenlyCloudWasEnabled) {
            transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
            await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#auroraIonosphereBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Aurora Ionosphere Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) {
        const stoppedForThemeChange = this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange;
        const restorePrevious = this.#connected && !this.#dismissed && !stoppedForThemeChange;
        if (auroraStarted) {
          await this.#auroraIonosphereBackgroundController.disable(
            restorePrevious && (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled),
          );
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (restorePrevious && particleWasEnabled && !this.#particleBackgroundController.enabled) {
          transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
          transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
          transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
          transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
          await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange;
      if (auroraStarted) {
        await this.#auroraIonosphereBackgroundController.disable(
          (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled)
            && !stoppedForThemeChange,
        );
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
      } else if (heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
        transferParticleThemeLease(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
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
      const message = error instanceof Error ? error.message : "Aurora Ionosphere Background could not be changed";
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

  async #toggleMilkyWayBackground(): Promise<void> {
    if (
      this.#milkyWayBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#heavenlyCloudBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending
    ) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true;
    this.#cancelAppearanceHealthCheck();
    this.#renderPreviewMarket();
    let milkyStarted = false;
    let particleWasEnabled = false;
    let blackHoleWasEnabled = false;
    let glowHorizonWasEnabled = false;
    let heavenlyCloudWasEnabled = false;
    let auroraIonosphereWasEnabled = false;
    let transparentWasEnabled = false;
    let previousTransparentBackground: string | undefined;
    let bridge: ExplorerBridge | undefined;
    try {
      if (!this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('milky-way');
      if (!await this.#awaitBackgroundInitializations(operation)) return;
      bridge = this.#bridge;
      transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      particleWasEnabled = this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
        || this.#particleBackgroundController.enabled;
      blackHoleWasEnabled = this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
        || this.#blackHoleBackgroundController.enabled;
      glowHorizonWasEnabled = this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
        || this.#glowHorizonBackgroundController.enabled;
      heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        || this.#heavenlyCloudBackgroundController.enabled;
      auroraIonosphereWasEnabled = this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) || this.#auroraIonosphereBackgroundController.enabled;
      previousTransparentBackground = this.#transparentBackgroundPresentation();
      const transparentPresentationWasApplied = document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
      const enabled = this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID);
      const active = this.#milkyWayBackgroundController.enabled;
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
        if (auroraIonosphereWasEnabled) await this.#auroraIonosphereBackgroundController.disable(true);
        if (particleWasEnabled) {
          await this.#particleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (blackHoleWasEnabled) {
          await this.#blackHoleBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (glowHorizonWasEnabled) {
          await this.#glowHorizonBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        if (heavenlyCloudWasEnabled) {
          await this.#heavenlyCloudBackgroundController.disable(true);
          if (!this.#connected || operation !== this.#appearanceOperation) return;
        }
        const lease = readParticleThemeLease();
        if (lease?.owner && lease.owner !== MILKY_WAY_BACKGROUND_PLUGIN_ID) {
          transferParticleThemeLease(lease.owner, MILKY_WAY_BACKGROUND_PLUGIN_ID);
        }
        await this.#milkyWayBackgroundController.enable();
        milkyStarted = this.#milkyWayBackgroundController.enabled;
        if (this.#milkyWayBackgroundController.stoppedForExternalThemeChange) {
          throw new Error(this.#milkyWayBackgroundController.error
            ?? "Milky Way Background stopped because Codex Appearance changed.");
        }
        if (!milkyStarted) throw new Error("Milky Way Background could not be enabled");
        if (!this.#connected || operation !== this.#appearanceOperation) {
          const restorePrevious = this.#connected && !this.#dismissed;
          const preserveTheme = restorePrevious
            && (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled || auroraIonosphereWasEnabled);
          await this.#milkyWayBackgroundController.disable(preserveTheme);
          if (restorePrevious && particleWasEnabled) {
            transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
            await this.#particleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && blackHoleWasEnabled) {
            transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
            await this.#blackHoleBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && glowHorizonWasEnabled) {
            transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
            await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && heavenlyCloudWasEnabled) {
            transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
            await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
          } else if (restorePrevious && auroraIonosphereWasEnabled) {
            transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
            await this.#auroraIonosphereBackgroundController.enable().catch(() => undefined);
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
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(MILKY_WAY_BACKGROUND_PLUGIN_ID);
      } else {
        await this.#milkyWayBackgroundController.disable();
        this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Milky Way Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) {
        const stoppedForThemeChange = this.#milkyWayBackgroundController.stoppedForExternalThemeChange;
        const restorePrevious = this.#connected && !this.#dismissed && !stoppedForThemeChange;
        if (milkyStarted) {
          await this.#milkyWayBackgroundController.disable(
            restorePrevious && (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled || auroraIonosphereWasEnabled),
          );
        }
        if (this.#connected && !this.#dismissed && stoppedForThemeChange) {
          let changed = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
          changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) || changed;
          if (changed) this.#writeEnabledAppearancePlugins();
        } else if (restorePrevious && particleWasEnabled && !this.#particleBackgroundController.enabled) {
          transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
          await this.#particleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
          transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
          await this.#blackHoleBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
          transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
          await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
          transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
          await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
        } else if (restorePrevious && auroraIonosphereWasEnabled && !this.#auroraIonosphereBackgroundController.enabled) {
          transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
          await this.#auroraIonosphereBackgroundController.enable().catch(() => undefined);
        }
        return;
      }
      const stoppedForThemeChange = this.#milkyWayBackgroundController.stoppedForExternalThemeChange;
      if (milkyStarted) {
        await this.#milkyWayBackgroundController.disable(
          (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled || auroraIonosphereWasEnabled)
            && !stoppedForThemeChange,
        );
      }
      if (stoppedForThemeChange) {
        let changed = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
        changed = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID) || changed;
        changed = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID) || changed;
          changed = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) || changed;
        if (changed) this.#writeEnabledAppearancePlugins();
      } else if (particleWasEnabled && !this.#particleBackgroundController.enabled) {
        transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, PARTICLE_BACKGROUND_PLUGIN_ID);
        await this.#particleBackgroundController.enable().catch(() => undefined);
      } else if (blackHoleWasEnabled && !this.#blackHoleBackgroundController.enabled) {
        transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        await this.#blackHoleBackgroundController.enable().catch(() => undefined);
      } else if (glowHorizonWasEnabled && !this.#glowHorizonBackgroundController.enabled) {
        transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
      } else if (heavenlyCloudWasEnabled && !this.#heavenlyCloudBackgroundController.enabled) {
        transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
      } else if (auroraIonosphereWasEnabled && !this.#auroraIonosphereBackgroundController.enabled) {
        transferParticleThemeLease(MILKY_WAY_BACKGROUND_PLUGIN_ID, AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        await this.#auroraIonosphereBackgroundController.enable().catch(() => undefined);
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
      const message = error instanceof Error ? error.message : "Milky Way Background could not be changed";
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
    values.introEnabled = this.#particleIntroEnabledInput.checked;
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
    this.#backgroundPackageMarket?.queueRender();
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
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;

    const settings = controller.settings;
    this.#particleIntroEnabledInput.checked = settings.introEnabled;
    this.#particleIntroEnabledInput.disabled = controller.pending;
    this.#particleOpeningReplayButton.disabled = !active || controller.pending || !settings.introEnabled || !controller.settings.activeImageId;
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
    this.#backgroundPackageMarket?.queueRender();
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
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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
    this.#backgroundPackageMarket?.queueRender();
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
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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

  #renderHeavenlyCloudBackgroundPlugin(): void {
    this.#backgroundPackageMarket?.queueRender();
    const controller = this.#heavenlyCloudBackgroundController;
    const enabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
    const active = enabled && controller.enabled;
    const action = enabled && !active ? "Retry" : enabled ? "Disable" : "Enable";
    let status = enabled ? "Enabled" : "Disabled";
    if (controller.pending) status = enabled || controller.enabled ? "Enabled · Applying" : "Applying";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (active && controller.error) status = "Enabled · Notice";
    this.#heavenlyCloudBackgroundStatus.textContent = status;
    this.#heavenlyCloudBackgroundStatus.dataset.enabled = String(active);
    this.#heavenlyCloudBackgroundStatus.dataset.pending = String(controller.pending);
    this.#heavenlyCloudBackgroundCard.setAttribute("aria-busy", String(controller.pending));
    this.#heavenlyCloudBackgroundButton.textContent = controller.pending ? "Applying…" : action;
    this.#heavenlyCloudBackgroundButton.dataset.enabled = String(enabled);
    this.#heavenlyCloudBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#heavenlyCloudBackgroundButton.setAttribute(
      "aria-label",
      controller.pending ? "Applying Heavenly Cloud Background" : `${action} Heavenly Cloud Background`,
    );
    this.#heavenlyCloudBackgroundButton.disabled = controller.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;

    const settings = controller.settings;
    for (const [key, control] of this.#heavenlyCloudNumericControls) {
      const value = settings[key];
      const formatted = formatHeavenlyCloudControlValue(control.definition, value);
      control.input.value = String(value);
      control.input.disabled = controller.pending;
      control.input.setAttribute("aria-valuetext", formatted);
      control.output.textContent = formatted;
    }
    for (const button of this.#heavenlyCloudQualityButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.heavenlyCloudQuality === settings.quality));
      button.disabled = controller.pending;
    }
    this.#heavenlyCloudPausedInput.checked = settings.paused;
    this.#heavenlyCloudPausedInput.disabled = controller.pending;
    this.#heavenlyCloudResetButton.disabled = controller.pending;
    this.#heavenlyCloudReplayButton.disabled = controller.pending || !controller.enabled;
    const error = controller.error;
    this.#heavenlyCloudPluginError.hidden = !error;
    this.#heavenlyCloudPluginError.textContent = backgroundSettingsError(
      error,
      this.#backgroundSettingsLanguage,
      "天境云隧道背景",
      "Heavenly Cloud Background",
    );
    this.#heavenlyCloudSettingsPanel.setAttribute("aria-busy", String(controller.pending));
    if (this.#heavenlyCloudSettingsOpen) requestAnimationFrame(() => this.#positionHeavenlyCloudSettingsPanel());
  }

  #renderAuroraIonosphereBackgroundPlugin(): void {
    this.#backgroundPackageMarket?.queueRender();
    const controller = this.#auroraIonosphereBackgroundController;
    const enabled = this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
    const active = enabled && controller.enabled;
    const action = enabled && !active ? "Retry" : enabled ? "Disable" : "Enable";
    let status = enabled ? "Enabled" : "Disabled";
    if (controller.pending) status = enabled || controller.enabled ? "Enabled · Applying" : "Applying";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (active && controller.error) status = "Enabled · Notice";
    this.#auroraIonosphereBackgroundStatus.textContent = status;
    this.#auroraIonosphereBackgroundStatus.dataset.enabled = String(active);
    this.#auroraIonosphereBackgroundStatus.dataset.pending = String(controller.pending);
    this.#auroraIonosphereBackgroundCard.setAttribute("aria-busy", String(controller.pending));
    this.#auroraIonosphereBackgroundButton.textContent = controller.pending ? "Applying…" : action;
    this.#auroraIonosphereBackgroundButton.dataset.enabled = String(enabled);
    this.#auroraIonosphereBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#auroraIonosphereBackgroundButton.setAttribute(
      "aria-label",
      controller.pending ? "Applying Aurora Ionosphere Background" : `${action} Aurora Ionosphere Background`,
    );
    this.#auroraIonosphereBackgroundButton.disabled = controller.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#heavenlyCloudBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;
    const settings = controller.settings;
    for (const [key, control] of this.#auroraIonosphereNumericControls) {
      const value = settings[key];
      const formatted = formatAuroraIonosphereControlValue(control.definition, value);
      control.input.value = String(value);
      control.input.disabled = controller.pending;
      control.input.setAttribute("aria-valuetext", formatted);
      control.output.textContent = formatted;
    }
    for (const button of this.#auroraIonosphereQualityButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.auroraIonosphereQuality === settings.quality));
      button.disabled = controller.pending;
    }
    this.#auroraIonospherePausedInput.checked = settings.paused;
    this.#auroraIonospherePausedInput.disabled = controller.pending;
    this.#auroraIonosphereResetButton.disabled = controller.pending;
    this.#auroraIonosphereReplayButton.disabled = controller.pending || !controller.enabled;
    const error = controller.error;
    this.#auroraIonospherePluginError.hidden = !error;
    this.#auroraIonospherePluginError.textContent = backgroundSettingsError(
      error,
      this.#backgroundSettingsLanguage,
      "极光电离层背景",
      "Aurora Ionosphere Background",
    );
    this.#auroraIonosphereSettingsPanel.setAttribute("aria-busy", String(controller.pending));
    if (this.#auroraIonosphereSettingsOpen) requestAnimationFrame(() => this.#positionAuroraIonosphereSettingsPanel());
    if (this.#milkyWaySettingsOpen) requestAnimationFrame(() => this.#positionMilkyWaySettingsPanel());
  }

  #renderMilkyWayBackgroundPlugin(): void {
    this.#backgroundPackageMarket?.queueRender();
    const controller = this.#milkyWayBackgroundController;
    const enabled = this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID);
    const active = enabled && controller.enabled;
    const action = enabled && !active ? "Retry" : enabled ? "Disable" : "Enable";
    let status = enabled ? "Enabled" : "Disabled";
    if (controller.pending) status = enabled || controller.enabled ? "Enabled · Applying" : "Applying";
    else if (enabled && !active) status = "Enabled · Not applied";
    else if (active && controller.error) status = "Enabled · Notice";
    this.#milkyWayBackgroundStatus.textContent = status;
    this.#milkyWayBackgroundStatus.dataset.enabled = String(active);
    this.#milkyWayBackgroundStatus.dataset.pending = String(controller.pending);
    this.#milkyWayBackgroundCard.setAttribute("aria-busy", String(controller.pending));
    this.#milkyWayBackgroundButton.textContent = controller.pending ? "Applying…" : action;
    this.#milkyWayBackgroundButton.dataset.enabled = String(enabled);
    this.#milkyWayBackgroundButton.setAttribute("aria-pressed", String(enabled));
    this.#milkyWayBackgroundButton.setAttribute(
      "aria-label",
      controller.pending ? "Applying Milky Way Background" : `${action} Milky Way Background`,
    );
    this.#milkyWayBackgroundButton.disabled = controller.pending
      || this.#particleBackgroundController.pending
      || this.#blackHoleBackgroundController.pending
      || this.#glowHorizonBackgroundController.pending
      || this.#heavenlyCloudBackgroundController.pending
      || this.#appearancePluginPending
      || this.#appearanceTransitionPending;
    const settings = controller.settings;
    this.#required<HTMLInputElement>("#cle-milky-way-intro-enabled").checked = settings.introEnabled;
    this.#shadow.querySelectorAll<HTMLInputElement>("[data-milky-way-color]").forEach((input, i) => { input.value = settings.colors[i]!; input.disabled = controller.pending; });
    for (const [key, control] of this.#milkyWayNumericControls) {
      const value = settings[key];
      const formatted = formatMilkyWayControlValue(control.definition, value);
      control.input.value = String(value);
      control.input.disabled = controller.pending;
      control.input.setAttribute("aria-valuetext", formatted);
      control.output.textContent = formatted;
    }
    for (const button of this.#milkyWayQualityButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.milkyWayQuality === settings.quality));
      button.disabled = controller.pending;
    }
    this.#milkyWayPausedInput.checked = settings.paused;
    this.#milkyWayPausedInput.disabled = controller.pending;
    this.#milkyWayResetButton.disabled = controller.pending;
    this.#milkyWayReplayButton.disabled = controller.pending || !controller.enabled;
    const error = controller.error;
    this.#milkyWayPluginError.hidden = !error;
    this.#milkyWayPluginError.textContent = backgroundSettingsError(
      error,
      this.#backgroundSettingsLanguage,
      "银河光场背景",
      "Milky Way Background",
    );
    this.#milkyWaySettingsPanel.setAttribute("aria-busy", String(controller.pending));
    if (this.#milkyWaySettingsOpen) requestAnimationFrame(() => this.#positionMilkyWaySettingsPanel());
  }


  #closeMountain(): void {
    const panel=this.#shadow.querySelector<HTMLElement>("#cle-mountain-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.#shadow.querySelector(".mountain-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  #positionMountain(): void {
    const panel=this.#required<HTMLElement>("#cle-mountain-settings");
    if(!panel.matches(":popover-open"))return;
    const rect=this.#required<HTMLElement>(".mountain-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(380,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  #bindMountain(): void {
    if(this.#mountainEventsBound)return; this.#mountainEventsBound=true;
    const panel=this.#required<HTMLElement>("#cle-mountain-settings");
    this.#required<HTMLButtonElement>(".mountain-enable").addEventListener("click",()=>void this.#toggleMountain());
    this.#required<HTMLButtonElement>(".mountain-settings-trigger").addEventListener("click",()=>{
      if(panel.matches(":popover-open")){this.#closeMountain();return;}
      for(const other of this.#shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) if(other!==panel&&other.matches(":popover-open"))other.hidePopover();
      this.#renderMountain(); panel.showPopover(); this.#positionMountain();
      this.#required(".mountain-settings-trigger").setAttribute("aria-expanded","true");
      this.#required<HTMLButtonElement>(".mountain-close").focus();
    });
    this.#required<HTMLButtonElement>(".mountain-close").addEventListener("click",()=>{this.#closeMountain();this.#required<HTMLButtonElement>(".mountain-settings-trigger").focus();});
    panel.addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopPropagation();this.#closeMountain();this.#required<HTMLButtonElement>(".mountain-settings-trigger").focus();}});
    this.#previewMarketPopover.addEventListener("scroll",()=>this.#positionMountain());
    panel.addEventListener("toggle",()=>{this.#required(".mountain-settings-trigger").setAttribute("aria-expanded",String(panel.matches(":popover-open")));});
    for(const [key,,,min,max,step] of MOUNTAIN_CONTROLS){
      const input=this.#required<HTMLInputElement>("#cle-mountain-"+key);
      input.addEventListener("input",()=>this.#mountainController.updateSettings(normalizeMountainSettings({...this.#mountainController.settings,[key]:input.value})));
      input.addEventListener("dblclick",()=>{ input.type="number";input.focus();input.select(); });
      const finish=()=>{ input.value=String(clampParticleNumber(input.value,min,max,MOUNTAIN_DEFAULTS[key]));input.type="range";input.step=String(step);this.#mountainController.updateSettings(normalizeMountainSettings({...this.#mountainController.settings,[key]:input.value})); };
      input.addEventListener("blur",finish);input.addEventListener("keydown",event=>{if(event.key==="Enter"){finish();input.blur();}});
    }
    this.#required<HTMLInputElement>(".mountain-paused").addEventListener("change",event=>this.#mountainController.updateSettings({...this.#mountainController.settings,paused:(event.target as HTMLInputElement).checked}));
    this.#required(".mountain-reset").addEventListener("click",()=>this.#mountainController.reset());
    this.#required(".mountain-replay").addEventListener("click",()=>this.#mountainController.replay());
    for(const button of panel.querySelectorAll<HTMLButtonElement>("[data-mountain-steps]")) button.addEventListener("click",()=>this.#mountainController.updateSettings(normalizeMountainSettings({...this.#mountainController.settings,steps:Number(button.dataset.mountainSteps)})));
  }
  #renderMountain(): void {
    const card=this.#shadow.querySelector<HTMLElement>('[data-appearance-plugin="'+MOUNTAIN_BACKGROUND_PLUGIN_ID+'"]'); if(!card)return;
    const c=this.#mountainController, s=c.settings;
    const busy=c.pending||this.#appearanceTransitionPending||this.#appearancePluginPending;
    const button=card.querySelector<HTMLButtonElement>(".mountain-enable")!;
    button.textContent=c.enabled?"Disable":"Enable";button.disabled=busy;button.setAttribute("aria-pressed",String(c.enabled));button.setAttribute("aria-label",`${c.enabled?"Disable":"Enable"} Layered Mountain Background`);
    const status=card.querySelector<HTMLElement>(".mountain-status")!;status.textContent=c.pending?"Applying…":c.error?"Unavailable":c.enabled?"Enabled":"Disabled";status.dataset.enabled=String(c.enabled);
    for(const [key,zh,en] of MOUNTAIN_CONTROLS){const input=this.#required<HTMLInputElement>("#cle-mountain-"+key);if(this.#shadow.activeElement!==input)input.value=String(s[key]);input.disabled=busy;input.setAttribute("aria-label",this.#backgroundText(zh,en));input.parentElement!.querySelector("output")!.textContent=s[key].toFixed(2);}
    this.#required<HTMLInputElement>(".mountain-paused").checked=s.paused;
    this.#required<HTMLInputElement>(".mountain-paused").disabled=busy;
    this.#required<HTMLButtonElement>(".mountain-reset").disabled=busy;
    this.#required<HTMLButtonElement>(".mountain-replay").disabled=busy||!c.enabled;
    for(const button of this.#shadow.querySelectorAll<HTMLButtonElement>("[data-mountain-steps]")){button.setAttribute("aria-pressed",String(Number(button.dataset.mountainSteps)===s.steps));button.disabled=busy;}
    const error=this.#required<HTMLElement>(".mountain-error");error.textContent=c.error??"";error.hidden=!c.error;
    this.#backgroundPackageMarket?.queueRender();
  }
  async #toggleMountain(): Promise<void> {
    if(this.#appearanceTransitionPending||this.#appearancePluginPending||this.#mountainController.pending)return;
    const operation=++this.#appearanceOperation;this.#appearanceTransitionPending=true;this.#renderPreviewMarket();
    const controllers=[this.#particleBackgroundController,this.#blackHoleBackgroundController,this.#glowHorizonBackgroundController,this.#heavenlyCloudBackgroundController,this.#auroraIonosphereBackgroundController,this.#milkyWayBackgroundController];
    const ids=[PARTICLE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID];
    let previous=-1;
    try {
      if (!this.#enabledAppearancePlugins.has(MOUNTAIN_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('mountain');
      if(!await this.#awaitBackgroundInitializations(operation,true))return;
      if(this.#mountainController.enabled){await this.#mountainController.disable();this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);}
      else {
        if(this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)){
          if(!this.#bridge?.available)throw new Error("Restart Codex with Code-Codex to disable transparency first.");
          await this.#setWindowTransparency(this.#bridge,false);this.#clearTransparentBackgroundPresentation();this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);this.#appearancePluginApplied=false;
        }
        for(let i=0;i<controllers.length;i++){if(controllers[i]!.enabled){previous=i;await controllers[i]!.disable(true);}this.#enabledAppearancePlugins.delete(ids[i]!);}
        const lease=readParticleThemeLease();if(lease?.owner)transferParticleThemeLease(lease.owner,MOUNTAIN_BACKGROUND_PLUGIN_ID);
        await this.#mountainController.enable();
        if (!this.#connected || operation !== this.#appearanceOperation) { await this.#mountainController.disable(); return; }
        if(!this.#mountainController.enabled)throw new Error(this.#mountainController.error||"Layered Mountain Background could not be enabled");
        this.#enabledAppearancePlugins.add(MOUNTAIN_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
    } catch(error) {
      this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);
      if(previous>=0){try{await controllers[previous]!.enable();if(controllers[previous]!.enabled)this.#enabledAppearancePlugins.add(ids[previous]!);}catch{}}
      this.#writeEnabledAppearancePlugins();this.#showActionNotice(error instanceof Error?error.message:String(error),"error");
    } finally {this.#appearanceTransitionPending=false;this.#renderPreviewMarket();}
  }

  #closeCloudTrain(): void {
    const panel=this.#shadow.querySelector<HTMLElement>("#cle-cloudTrain-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.#shadow.querySelector(".cloudTrain-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  #positionCloudTrain(): void {
    const panel=this.#required<HTMLElement>("#cle-cloudTrain-settings");
    if(!panel.matches(":popover-open"))return;
    const rect=this.#required<HTMLElement>(".cloudTrain-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(380,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  #bindCloudTrain(): void {
    if(this.#cloudTrainEventsBound)return; this.#cloudTrainEventsBound=true;
    const panel=this.#required<HTMLElement>("#cle-cloudTrain-settings");
    this.#required<HTMLButtonElement>(".cloudTrain-enable").addEventListener("click",()=>void this.#toggleCloudTrain());
    this.#required<HTMLButtonElement>(".cloudTrain-settings-trigger").addEventListener("click",()=>{
      if(panel.matches(":popover-open")){this.#closeCloudTrain();return;}
      for(const other of this.#shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) if(other!==panel&&other.matches(":popover-open"))other.hidePopover();
      this.#renderCloudTrain(); panel.showPopover(); this.#positionCloudTrain();
      this.#required(".cloudTrain-settings-trigger").setAttribute("aria-expanded","true");
      this.#required<HTMLButtonElement>(".cloudTrain-close").focus();
    });
    this.#required<HTMLButtonElement>(".cloudTrain-close").addEventListener("click",()=>{this.#closeCloudTrain();this.#required<HTMLButtonElement>(".cloudTrain-settings-trigger").focus();});
    panel.addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopPropagation();this.#closeCloudTrain();this.#required<HTMLButtonElement>(".cloudTrain-settings-trigger").focus();}});
    this.#previewMarketPopover.addEventListener("scroll",()=>this.#positionCloudTrain());
    panel.addEventListener("toggle",()=>{this.#required(".cloudTrain-settings-trigger").setAttribute("aria-expanded",String(panel.matches(":popover-open")));});
    for(const [key,,,min,max,step] of CLOUD_TRAIN_CONTROLS){
      const input=this.#required<HTMLInputElement>("#cle-cloudTrain-"+key);
      input.addEventListener("input",()=>this.#cloudTrainController.updateSettings(normalizeCloudTrainSettings({...this.#cloudTrainController.settings,[key]:input.value})));
      input.addEventListener("dblclick",()=>{ input.type="number";input.focus();input.select(); });
      const finish=()=>{ input.value=String(clampParticleNumber(input.value,min,max,CLOUD_TRAIN_DEFAULTS[key]));input.type="range";input.step=String(step);this.#cloudTrainController.updateSettings(normalizeCloudTrainSettings({...this.#cloudTrainController.settings,[key]:input.value})); };
      input.addEventListener("blur",finish);input.addEventListener("keydown",event=>{if(event.key==="Enter"){finish();input.blur();}});
    }
    for(const [key] of CLOUD_TRAIN_TINTS){const input=this.#required<HTMLInputElement>("#cle-cloudTrain-"+key);input.addEventListener("input",()=>this.#cloudTrainController.updateSettings(normalizeCloudTrainSettings({...this.#cloudTrainController.settings,[key]:input.value})));}
    this.#required<HTMLInputElement>(".cloudTrain-paused").addEventListener("change",event=>this.#cloudTrainController.updateSettings({...this.#cloudTrainController.settings,paused:(event.target as HTMLInputElement).checked}));
    this.#required<HTMLInputElement>(".cloudTrain-intro-enabled").addEventListener("change",event=>{this.#cloudTrainController.updateSettings({...this.#cloudTrainController.settings,introEnabled:(event.target as HTMLInputElement).checked});this.#cloudTrainController.replay();});
    this.#required(".cloudTrain-reset").addEventListener("click",()=>this.#cloudTrainController.reset());
    this.#required(".cloudTrain-replay").addEventListener("click",()=>this.#cloudTrainController.replay());
  }
  #renderCloudTrain(): void {
    const card=this.#shadow.querySelector<HTMLElement>('[data-appearance-plugin="'+CLOUD_TRAIN_BACKGROUND_PLUGIN_ID+'"]'); if(!card)return;
    const c=this.#cloudTrainController, s=c.settings;
    const busy=c.pending||this.#appearanceTransitionPending||this.#appearancePluginPending;
    const button=card.querySelector<HTMLButtonElement>(".cloudTrain-enable")!;
    button.textContent=c.enabled?"Disable":"Enable";button.disabled=busy;button.setAttribute("aria-pressed",String(c.enabled));button.setAttribute("aria-label",`${c.enabled?"Disable":"Enable"} Cloud Train Background`);
    const status=card.querySelector<HTMLElement>(".cloudTrain-status")!;status.textContent=c.pending?"Applying…":c.error?"Unavailable":c.enabled?"Enabled":"Disabled";status.dataset.enabled=String(c.enabled);
    for(const [key,zh,en] of CLOUD_TRAIN_CONTROLS){const input=this.#required<HTMLInputElement>("#cle-cloudTrain-"+key);if(this.#shadow.activeElement!==input)input.value=String(s[key]);input.disabled=busy;input.setAttribute("aria-label",this.#backgroundText(zh,en));input.parentElement!.querySelector("output")!.textContent=s[key].toFixed(2);}
    for(const [key,zh,en] of CLOUD_TRAIN_TINTS){const input=this.#required<HTMLInputElement>("#cle-cloudTrain-"+key);input.value=s[key];input.disabled=busy;input.setAttribute("aria-label",this.#backgroundText(zh,en));}
    this.#required<HTMLInputElement>(".cloudTrain-paused").checked=s.paused;
    this.#required<HTMLInputElement>(".cloudTrain-intro-enabled").checked=s.introEnabled;
    this.#required<HTMLInputElement>(".cloudTrain-intro-enabled").disabled=busy;
    this.#required<HTMLInputElement>(".cloudTrain-paused").disabled=busy;
    this.#required<HTMLButtonElement>(".cloudTrain-reset").disabled=busy;
    this.#required<HTMLButtonElement>(".cloudTrain-replay").disabled=busy||!c.enabled;
    const error=this.#required<HTMLElement>(".cloudTrain-error");error.textContent=c.error??"";error.hidden=!c.error;
    this.#backgroundPackageMarket?.queueRender();
  }
  async #toggleCloudTrain(): Promise<void> {
    if(this.#appearanceTransitionPending||this.#appearancePluginPending||this.#cloudTrainController.pending)return;
    const operation=++this.#appearanceOperation;this.#appearanceTransitionPending=true;this.#renderPreviewMarket();
    const controllers=[this.#particleBackgroundController,this.#blackHoleBackgroundController,this.#glowHorizonBackgroundController,this.#heavenlyCloudBackgroundController,this.#auroraIonosphereBackgroundController,this.#milkyWayBackgroundController,this.#mountainController];
    const ids=[PARTICLE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID];
    let previous=-1;
    try {
      if (!this.#enabledAppearancePlugins.has(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('cloud-train');
      if(!await this.#awaitBackgroundInitializations(operation,true,true))return;
      if(this.#cloudTrainController.enabled){await this.#cloudTrainController.disable();this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);}
      else {
        if(this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)){
          if(!this.#bridge?.available)throw new Error("Restart Codex with Code-Codex to disable transparency first.");
          await this.#setWindowTransparency(this.#bridge,false);this.#clearTransparentBackgroundPresentation();this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);this.#appearancePluginApplied=false;
        }
        for(let i=0;i<controllers.length;i++){if(controllers[i]!.enabled){previous=i;await controllers[i]!.disable(true);}this.#enabledAppearancePlugins.delete(ids[i]!);}
        const lease=readParticleThemeLease();if(lease?.owner)transferParticleThemeLease(lease.owner,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
        await this.#cloudTrainController.enable();
        if (!this.#connected || operation !== this.#appearanceOperation) { await this.#cloudTrainController.disable(); return; }
        if(!this.#cloudTrainController.enabled)throw new Error(this.#cloudTrainController.error||"Cloud Train Background could not be enabled");
        this.#enabledAppearancePlugins.add(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
    } catch(error) {
      this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
      if(previous>=0){try{await controllers[previous]!.enable();if(controllers[previous]!.enabled)this.#enabledAppearancePlugins.add(ids[previous]!);}catch{}}
      this.#writeEnabledAppearancePlugins();this.#showActionNotice(error instanceof Error?error.message:String(error),"error");
    } finally {this.#appearanceTransitionPending=false;this.#renderPreviewMarket();}
  }


  #closeStartupTransition(): void {
    this.#startupVideoGeneration += 1;
    this.#startupTimelineFramesAbort?.abort();
    this.#stopStartupPreview();
    const panel = this.#shadow.querySelector<HTMLElement>("#cle-startupTransition-settings");
    if (panel?.matches(":popover-open")) panel.hidePopover();
    this.#shadow.querySelector(".startupTransition-settings-trigger")?.setAttribute("aria-expanded", "false");
  }

  #positionStartupTransition(): void {
    const panel = this.#required<HTMLElement>("#cle-startupTransition-settings");
    if (!panel.matches(":popover-open")) return;
    const rect = this.#required<HTMLElement>(".startupTransition-settings-trigger").getBoundingClientRect();
    panel.style.position = "fixed"; panel.style.margin = "0";
    panel.style.maxHeight = "calc(100vh - 24px)";
    const width = Math.min(800, window.innerWidth - 24);
    panel.style.width = width + "px";
    panel.style.left = Math.max(12, Math.min(rect.right + 12, window.innerWidth - width - 12)) + "px";
    panel.style.top = Math.max(12, Math.min(rect.top, window.innerHeight - panel.getBoundingClientRect().height - 12)) + "px";
  }

  #ensureStartupBackgroundPreview(backgroundId: string): void {
    if (this.#startupBackgroundPreviewId === backgroundId && this.#startupBackgroundPreview) return;
    this.#stopStartupPreview();
    const layer = document.createElement('div');
    layer.className = 'startupTransition-background-live';
    layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#080b0e';
    this.#required<HTMLElement>('.startupTransition-preview-stage').append(layer);
    let active = true;
    let renderer: ReturnType<typeof mountStartupBackground> | undefined;
    let preview: {dispose():void} | undefined;
    const fail = (error: unknown) => {
      if (!active) return;
      active = false;
      renderer?.dispose();
      layer.remove();
      if (this.#startupBackgroundPreview === preview) {
        this.#startupBackgroundPreview = undefined;
        this.#startupBackgroundPreviewId = undefined;
      }
      this.#showStartupTransitionError(error);
    };
    preview = { dispose: () => { active = false; renderer?.dispose(); layer.remove(); } };
    this.#startupBackgroundPreview = preview;
    this.#startupBackgroundPreviewId = backgroundId;
    void ensureBackgroundPackage(backgroundId).then(() => {
    if (!active) return;
    try {
      renderer = mountStartupBackground(layer, backgroundId, message => { if (message) fail(new Error(message)); });
      if (!active) { renderer.dispose(); return; }
      const currentRenderer = renderer;
      preview = { dispose: () => { active = false; currentRenderer.dispose(); layer.remove(); } };
      this.#startupBackgroundPreview = preview;
      this.#startupBackgroundPreviewId = backgroundId;
      runtimeEvent('startup-animation', 'background preview', 'preparing', { backgroundId });
      void Promise.resolve(renderer.ready).then(() => {
        if (active && this.#startupBackgroundPreview === preview) runtimeEvent('startup-animation', 'background preview', 'started', { backgroundId });
      }, fail);
    } catch (error) { fail(error); }
    }, fail);
  }

  #renderStartupTransition(): void {
    const settings = readStartupTransitionSettings();
    const panel = this.#required<HTMLElement>("#cle-startupTransition-settings");
    const backgroundMode = settings.source === 'background';
    if (backgroundMode && panel.matches(':popover-open')) this.#ensureStartupBackgroundPreview(settings.backgroundId);
    this.#required<HTMLSelectElement>('#cle-startupTransition-source').value=settings.source;
    this.#required<HTMLSelectElement>('#cle-startupTransition-background').value=settings.backgroundId;
    const sourceSelect = this.#required<HTMLSelectElement>('#cle-startupTransition-source');
    const englishSource = panel.dataset.language === 'en';
    sourceSelect.options[0]!.textContent = englishSource ? 'Video' : '视频';
    sourceSelect.options[1]!.textContent = englishSource ? 'Background plugin' : '背景插件';
    this.#required<HTMLInputElement>('#cle-startupTransition-minimumVisiblePercent').closest<HTMLElement>('fieldset')!.hidden = backgroundMode;
    this.#required<HTMLButtonElement>('.startupTransition-reset').parentElement!.hidden = backgroundMode;
    this.#required<HTMLElement>('.startupTransition-background-controls').hidden=!backgroundMode;
    const backgroundFade = this.#required<HTMLInputElement>('#cle-startupTransition-background-fade');
    backgroundFade.closest<HTMLElement>('.particle-control-row')!.hidden = !backgroundMode;
    backgroundFade.value = String(settings.backgroundFadeSeconds);
    backgroundFade.parentElement!.querySelector<HTMLOutputElement>('output')!.value = `${settings.backgroundFadeSeconds.toFixed(1)} s`;
    for(const element of panel.querySelectorAll<HTMLElement>('.startupTransition-timeline, .startupTransition-upload, #cle-startupTransition-fit')) {
      (element.matches('.startupTransition-timeline') ? element : element.closest<HTMLElement>('fieldset')!).hidden=backgroundMode;
    }
    this.#required<HTMLVideoElement>('.startupTransition-video-still').hidden=backgroundMode || !this.#startupVideo;
    const status = this.#required<HTMLElement>(".startupTransition-status");
    const button = this.#required<HTMLButtonElement>(".startupTransition-enable");
    status.textContent = settings.enabled ? "Enabled" : "Disabled";
    status.dataset.enabled = String(settings.enabled);
    button.textContent = settings.enabled ? "Disable" : "Enable";
    button.dataset.enabled = String(settings.enabled);
    button.disabled = this.#startupTransitionPending;
    button.setAttribute("aria-pressed", String(settings.enabled));
    button.setAttribute("aria-label", `${settings.enabled ? "Disable" : "Enable"} Codex Startup Transition`);
    for (const input of this.#shadow.querySelectorAll<HTMLInputElement>("[data-startup-transition-setting]")) {
      const key = input.dataset.startupTransitionSetting as keyof Pick<StartupTransitionSettings, "minimumVisiblePercent" | "fadePercent" | "playbackRate" | "videoBrightness">;
      input.value = String(settings[key]);
      const output = input.parentElement?.querySelector<HTMLOutputElement>("output");
      if (output) output.value = key === "playbackRate" ? `${settings[key].toFixed(2)}×`
        : key === "videoBrightness" ? `${Math.round(settings[key] * 100)}%`
        : `${settings[key]}%`;
    }
    this.#required<HTMLSelectElement>("#cle-startupTransition-fit").value = settings.videoFit;
    this.#backgroundPackageMarket?.queueRender();
    if(!startupTransitionModule())return;
    const english = panel.dataset.language === "en";
    const timeline = this.#required<HTMLElement>(".startupTransition-timeline");
    const geometry = startupTimelineGeometry(
      this.#startupVideo ? settings : { ...settings, clipStart: 0, clipEnd: 5 },
      this.#startupVideo?.duration ?? 5,
    );
    timeline.dataset.hasVideo = String(Boolean(this.#startupVideo));
    timeline.setAttribute("aria-label", english ? "Video timeline" : "视频时间轴");
    timeline.style.setProperty("--clip-start", `${geometry.startPercent}%`);
    timeline.style.setProperty("--clip-end", `${geometry.endPercent}%`);
    timeline.style.setProperty("--minimum-end", `${geometry.minimumPercent}%`);
    timeline.style.setProperty("--fade-start", `${geometry.earliestFadePercent}%`);
    timeline.style.setProperty("--fade-end", `${geometry.earliestFadeEndPercent}%`);
    this.#required<HTMLOutputElement>(".startupTransition-timeline-range").value = this.#startupVideo
      ? `${formatTimelineTime(geometry.clipStart)}–${formatTimelineTime(geometry.clipEnd)} · ${geometry.clipPlaybackSeconds.toFixed(1)} s`
      : (english ? "No video selected" : "未选择视频");
    const ruler = this.#required<HTMLElement>(".startupTransition-timeline-ruler");
    for (const [index, tick] of Array.from(ruler.children).entries()) {
      tick.textContent = formatTimelineTime(geometry.duration * index / 4);
    }
    for (const handle of timeline.querySelectorAll<HTMLElement>("[data-startup-timeline-edge]")) {
      const start = handle.dataset.startupTimelineEdge === "start";
      const seconds = start ? geometry.clipStart : geometry.clipEnd;
      handle.hidden = !this.#startupVideo;
      handle.style.left = `${start ? geometry.startPercent : geometry.endPercent}%`;
      handle.setAttribute("aria-label", start ? (english ? "Clip start" : "片段起点") : (english ? "Clip end" : "片段终点"));
      handle.setAttribute("aria-valuemin", String(start ? 0 : geometry.clipStart + 0.1));
      handle.setAttribute("aria-valuemax", String(start ? geometry.clipEnd - 0.1 : geometry.duration));
      handle.setAttribute("aria-valuenow", String(seconds));
      handle.setAttribute("aria-valuetext", `${formatTimelineTime(seconds)} (${seconds.toFixed(1)} s)`);
    }
    const playhead = this.#required<HTMLElement>(".startupTransition-timeline-playhead");
    playhead.hidden = !this.#startupVideo || this.#startupTimelineScrubTime === undefined;
    if (this.#startupTimelineScrubTime !== undefined) {
      playhead.style.left = `${Math.max(0, Math.min(100, this.#startupTimelineScrubTime / geometry.duration * 100))}%`;
    }
    const relative = english ? "from clip start" : "从裁剪起点计时";
    for (const [selector, text] of [
      [".startupTransition-timeline-minimum", `${english ? "Minimum display" : "最短显示"}: ${settings.minimumVisiblePercent}% · ${relative}`],
      [".startupTransition-timeline-fade", `${english ? "Fade duration (starts when ready); clip-tail preview" : "淡出时长（就绪后开始）；片段末尾预览"}: ${settings.fadePercent}% · ${formatTimelineTime(geometry.clipStart + geometry.earliestFadePercent / 100 * (geometry.clipEnd - geometry.clipStart))}–${formatTimelineTime(geometry.clipEnd)}`],
    ] as const) {
      const marker = this.#required<HTMLElement>(selector);
      marker.title = text; marker.setAttribute("aria-label", text);
    }
    const still = this.#required<HTMLVideoElement>(".startupTransition-video-still");
    still.playbackRate = settings.playbackRate;
    still.style.objectFit = settings.videoFit;
    still.style.opacity = String(this.#startupPreviewFadeOpacity);
    still.style.filter = `brightness(${settings.videoBrightness})`;
    this.#renderStartupTransport();
    for (const button of this.#shadow.querySelectorAll<HTMLButtonElement>(".startupTransition-transport button")) button.disabled = !this.#startupVideo || this.#startupVideoPending;
    this.#required<HTMLButtonElement>(".startupTransition-remove").disabled = !this.#startupVideo || this.#startupVideoPending;
    this.#required<HTMLButtonElement>(".startupTransition-upload").disabled = this.#startupVideoPending;
    const info = this.#required<HTMLElement>(".startupTransition-video-info");
    info.textContent = this.#startupVideoPending ? (panel.dataset.language === "en" ? "Saving video…" : "正在保存视频…")
      : this.#startupVideo ? `${this.#startupVideo.name} · ${(this.#startupVideo.size / 1048576).toFixed(1)} MB · ${this.#startupVideo.duration.toFixed(1)} s`
      : (panel.dataset.language === "en" ? "Choose a video first. No startup animation plays without a video." : "请先选择视频。未选择视频时不播放启动动画。");
  }

  #setStartupVideo(video: StartupVideo | null): void {
    this.#stopStartupPreview();
    this.#startupTimelineFramesAbort?.abort();
    this.#startupVideo = video;
    this.#resetStartupPreviewTiming();
    this.#startupTimelineScrubTime = video ? startupTimelineGeometry(readStartupTransitionSettings(), video.duration).clipStart : undefined;
    const frames = this.#shadow.querySelectorAll<HTMLElement>(".startupTransition-timeline-frame");
    for (const frame of frames) frame.style.backgroundImage = "";
    if (video) {
      const abort = new AbortController();
      this.#startupTimelineFramesAbort = abort;
      void sampleStartupVideoFrames(video, abort.signal, frames.length).then((images) => {
        if (abort.signal.aborted || this.#startupVideo !== video) return;
        for (const [index, frame] of Array.from(frames).entries()) {
          frame.style.backgroundImage = images[index] ? `url("${images[index]}")` : "";
        }
      }).catch(() => { /* The trim handles remain usable without thumbnails. */ });
    } else {
      this.#startupTimelineFramesAbort = undefined;
    }
    if (this.#startupStillUrl) URL.revokeObjectURL(this.#startupStillUrl);
    this.#startupStillUrl = video ? URL.createObjectURL(video.blob) : undefined;
    const still = this.#required<HTMLVideoElement>(".startupTransition-video-still");
    still.pause();
    still.hidden = !video;
    if (this.#startupStillUrl) {
      still.src = this.#startupStillUrl;
      still.onloadedmetadata = () => {
        still.currentTime = Math.min(this.#startupTimelineScrubTime ?? readStartupTransitionSettings().clipStart, Math.max(0, still.duration - 0.01));
      };
    } else {
      still.removeAttribute("src");
      still.load();
    }
    this.#renderStartupTransition();
  }

  async #loadStartupVideoForPanel(): Promise<void> {
    const generation = ++this.#startupVideoGeneration;
    try {
      const video = await loadStartupVideo();
      if (!this.#connected || generation !== this.#startupVideoGeneration) return;
      this.#setStartupVideo(video);
    } catch (error) {
      if (generation === this.#startupVideoGeneration) this.#showStartupTransitionError(error);
    }
  }

  #showStartupTransitionError(error: unknown): void {
    const message = this.#required<HTMLElement>(".startupTransition-error");
    message.hidden = false;
    message.textContent = error instanceof Error ? error.message : String(error);
  }

  #stopStartupPreview(): void {
    this.#startupBackgroundPreview?.dispose(); this.#startupBackgroundPreview = undefined; this.#startupBackgroundPreviewId = undefined;
    this.#startupPlaybackGeneration += 1;
    if (this.#startupPlaybackFrame !== undefined) cancelAnimationFrame(this.#startupPlaybackFrame);
    this.#startupPlaybackFrame = undefined;
    this.#shadow.querySelector<HTMLVideoElement>(".startupTransition-video-still")?.pause();
    this.#startupPlaybackRunning = false;
    this.#renderStartupTransport();
  }

  #updateStartupPlayhead(seconds: number): void {
    if (!this.#startupVideo) return;
    this.#startupTimelineScrubTime = seconds;
    const playhead = this.#required<HTMLElement>(".startupTransition-timeline-playhead");
    playhead.hidden = false;
    playhead.style.left = `${Math.max(0, Math.min(100, seconds / this.#startupVideo.duration * 100))}%`;
  }

  #renderStartupTransport(): void {
    const panel = this.#shadow.querySelector<HTMLElement>("#cle-startupTransition-settings");
    const button = this.#shadow.querySelector<HTMLButtonElement>(".startupTransition-play");
    if (!panel || !button) return;
    const english = panel.dataset.language === "en";
    const label = this.#startupPlaybackRunning ? (english ? "Pause (Space)" : "暂停（空格）") : (english ? "Play (Space)" : "播放（空格）");
    button.dataset.playing = String(this.#startupPlaybackRunning);
    button.setAttribute("aria-pressed", String(this.#startupPlaybackRunning));
    button.setAttribute("aria-label", label); button.title = label;
    for (const [selector, zh, en] of [[".startupTransition-jump-start", "到片段开头", "Go to clip start"], [".startupTransition-jump-end", "到片段末尾", "Go to clip end"]] as const) {
      const edge = panel.querySelector<HTMLButtonElement>(selector);
      edge?.setAttribute("aria-label", english ? en : zh);
      if (edge) edge.title = english ? en : zh;
    }
  }

  #resetStartupPreviewTiming(): void {
    this.#startupPreviewElapsed = 0;
    this.#startupPreviewLeadIn = 0;
    this.#startupPreviewFadeOpacity = 1;
    this.#startupPreviewComplete = false;
  }

  #toggleStartupPlayback(): void {
    if(readStartupTransitionSettings().source==='background') return;
    if (this.#startupPlaybackRunning) { this.#stopStartupPreview(); return; }
    this.#playStartupVideo();
  }

  #playStartupVideo(): void {
    this.#stopStartupPreview();
    if (!this.#startupVideo || this.#startupVideoPending) return;
    const generation = this.#startupPlaybackGeneration;
    const still = this.#required<HTMLVideoElement>(".startupTransition-video-still");
    const range = startupTimelineGeometry(readStartupTransitionSettings(), this.#startupVideo.duration);
    let start = this.#startupTimelineScrubTime ?? range.clipStart;
    if (this.#startupPreviewComplete || start < range.clipStart || start >= range.clipEnd) {
      start = range.clipStart; this.#resetStartupPreviewTiming();
    }
    if (this.#startupPreviewElapsed === 0) {
      this.#startupPreviewLeadIn = 0;
    }
    still.style.opacity = String(this.#startupPreviewFadeOpacity);
    this.#updateStartupPlayhead(start);
    this.#startupPlaybackRunning = true;
    this.#renderStartupTransport();
    this.#required<HTMLElement>(".startupTransition-error").hidden = true;
    const play = async () => {
      if (generation !== this.#startupPlaybackGeneration) return;
      still.currentTime = Math.min(start, Math.max(0, still.duration - 0.01));
      still.playbackRate = readStartupTransitionSettings().playbackRate;
      try {
        let mediaStarted = this.#startupPreviewElapsed >= this.#startupPreviewLeadIn;
        if (mediaStarted) await still.play();
        if (generation !== this.#startupPlaybackGeneration) return;
        let previous = performance.now();
        const tick = (now: number) => {
          if (generation !== this.#startupPlaybackGeneration) return;
          this.#startupPreviewElapsed += now - previous; previous = now;
          const settings = readStartupTransitionSettings();
          if (!mediaStarted && this.#startupPreviewElapsed >= this.#startupPreviewLeadIn) {
            mediaStarted = true;
            void still.play().catch((error) => {
              if (generation === this.#startupPlaybackGeneration) { this.#stopStartupPreview(); this.#showStartupTransitionError(error); }
            });
          }
          const effectiveEnd = range.clipEnd;
          const ready = still.ended || still.currentTime >= effectiveEnd - 0.01;
          this.#startupPreviewFadeOpacity = clipFadeOpacity(still.currentTime, range.clipStart, effectiveEnd, (range.clipEnd - range.clipStart) / settings.playbackRate * 1000 * settings.fadePercent / 100, settings.playbackRate);
          if (ready) {
            still.pause();
            still.currentTime = Math.min(effectiveEnd, Math.max(0, still.duration - 0.01));
            this.#startupPreviewFadeOpacity = 0;
          }
          this.#updateStartupPlayhead(ready ? effectiveEnd : still.currentTime);
          still.style.opacity = String(this.#startupPreviewFadeOpacity);
          if (this.#startupPreviewFadeOpacity === 0) {
            this.#startupPreviewComplete = true;
            this.#stopStartupPreview();
            return;
          }
          this.#startupPlaybackFrame = requestAnimationFrame(tick);
        };
        this.#startupPlaybackFrame = requestAnimationFrame(tick);
      } catch (error) {
        if (generation === this.#startupPlaybackGeneration) { this.#stopStartupPreview(); this.#showStartupTransitionError(error); }
      }
    };
    if (still.readyState >= HTMLMediaElement.HAVE_METADATA) void play();
    else still.addEventListener("loadedmetadata", () => { void play(); }, { once: true });
  }

  async #syncStartupTransitionNativePreference(bridge: ExplorerBridge): Promise<void> {
    try {
      const native = await bridge.request<{ startupTransitionEnabled?: boolean }>("explorer.settings.get");
      if (this.#bridge !== bridge) return;
      const enabled = readStartupTransitionSettings().enabled;
      if (native.startupTransitionEnabled !== enabled) {
        await bridge.request("explorer.settings.set", { settings: { startupTransitionEnabled: enabled } });
      }
    } catch {
      if (this.#bridge === bridge) this.#showActionNotice("Startup transition preference could not be synchronized", "error");
    }
  }

  #seekStartupTimeline(seconds: number): void {
    if (!this.#startupVideo) return;
    const geometry = startupTimelineGeometry(readStartupTransitionSettings(), this.#startupVideo.duration);
    const time = Math.max(0, Math.min(geometry.duration, seconds));
    this.#stopStartupPreview();
    this.#resetStartupPreviewTiming();
    this.#startupTimelineScrubTime = time;
    this.#startupPreviewFadeOpacity = clipFadeOpacity(time, geometry.clipStart, geometry.clipEnd, geometry.fadeMs, readStartupTransitionSettings().playbackRate);
    const still = this.#required<HTMLVideoElement>(".startupTransition-video-still");
    if (still.readyState >= HTMLMediaElement.HAVE_METADATA) still.currentTime = Math.min(time, Math.max(0, still.duration - 0.01));
    this.#renderStartupTransition();
  }

  #moveStartupTimelineBoundary(edge: "start" | "end", seconds: number): void {
    if (!this.#startupVideo) return;
    const current = readStartupTransitionSettings();
    const range = moveTimelineBoundary(edge, seconds, current, this.#startupVideo.duration);
    if (range.clipStart === current.clipStart && range.clipEnd === current.clipEnd) return;
    if (!writeStartupTransitionSettings({ ...current, ...range })) {
      this.#showStartupTransitionError("Clip range could not be saved");
      return;
    }
    this.#seekStartupTimeline(edge === "start" ? range.clipStart : range.clipEnd - 0.02);
  }

  #bindStartupTransition(): void {
    if (this.#startupTransitionEventsBound) return;
    this.#startupTransitionEventsBound = true;
    const panel = this.#required<HTMLElement>("#cle-startupTransition-settings");
    const trigger = this.#required<HTMLButtonElement>(".startupTransition-settings-trigger");
    const saveSource = () => {
      this.#stopStartupPreview();
      const source=this.#required<HTMLSelectElement>('#cle-startupTransition-source').value==='background'?'background':'video';
      const backgroundId=this.#required<HTMLSelectElement>('#cle-startupTransition-background').value;
      if(!writeStartupTransitionSettings({...readStartupTransitionSettings(),source,backgroundId})) this.#showActionNotice('Startup transition setting could not be saved','error');
      runtimeEvent('startup-animation','source setting','changed',{source,backgroundId});
      this.#renderStartupTransition();
      // Source-specific controls change the open panel's height.
      this.#positionStartupTransition();
    };
    for(const selector of ['#cle-startupTransition-source','#cle-startupTransition-background']) this.#required<HTMLElement>(selector).addEventListener('change',saveSource);
    this.#required<HTMLInputElement>('#cle-startupTransition-background-fade').addEventListener('input', event => {
      const backgroundFadeSeconds = Number((event.target as HTMLInputElement).value);
      if (!writeStartupTransitionSettings({ ...readStartupTransitionSettings(), backgroundFadeSeconds })) this.#showActionNotice('Startup transition setting could not be saved', 'error');
      runtimeEvent('startup-animation', 'background fade setting', 'changed', { backgroundFadeSeconds });
      this.#renderStartupTransition();
    });
    this.#required<HTMLButtonElement>(".startupTransition-enable").addEventListener("click", async () => {
      if (this.#startupTransitionPending) return;
      const enabled = this.#required<HTMLButtonElement>(".startupTransition-enable").getAttribute("aria-pressed") !== "true";
      this.#startupTransitionPending = true;
      this.#renderStartupTransition();
      const settings = readStartupTransitionSettings();
      try {
        await this.#startupTransitionNativeSync;
        if (this.#bridge?.available) {
          await this.#bridge.request("explorer.settings.set", { settings: { startupTransitionEnabled: enabled } });
        }
        if (!writeStartupTransitionSettings({ ...settings, enabled })) throw new Error("Local preference unavailable");
      } catch {
        this.#showActionNotice("Startup transition setting could not be saved", "error");
      } finally {
        this.#startupTransitionPending = false;
        this.#renderStartupTransition();
      }
    });
    trigger.addEventListener("click", () => {
      if (panel.matches(":popover-open")) { this.#closeStartupTransition(); return; }
      for (const other of this.#shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) {
        if (other !== panel && other.matches(":popover-open")) other.hidePopover();
      }
      this.#renderStartupTransition(); panel.showPopover(); this.#renderStartupTransition(); this.#positionStartupTransition();
      trigger.setAttribute("aria-expanded", "true");
      this.#required<HTMLButtonElement>(".startupTransition-close").focus();
      void this.#loadStartupVideoForPanel();
    });
    this.#required<HTMLButtonElement>(".startupTransition-close").addEventListener("click", () => { this.#closeStartupTransition(); trigger.focus(); });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); this.#closeStartupTransition(); trigger.focus(); return; }
      const target = event.target as HTMLElement;
      if ((event.code === "Space" || event.key === " ") && !event.ctrlKey && !event.altKey && !event.metaKey && !target.closest('textarea, select, [contenteditable="true"], input:not([type="range"])')) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) this.#toggleStartupPlayback();
      }
    });
    panel.addEventListener("toggle", () => {
      const open = panel.matches(":popover-open");
      trigger.setAttribute("aria-expanded", String(open));
      if (!open) this.#stopStartupPreview();
    });
    this.#previewMarketPopover.addEventListener("scroll", () => this.#positionStartupTransition());
    for (const input of panel.querySelectorAll<HTMLInputElement>("[data-startup-transition-setting]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.startupTransitionSetting as keyof Pick<StartupTransitionSettings, "minimumVisiblePercent" | "fadePercent" | "playbackRate" | "videoBrightness">;
        const settings = readStartupTransitionSettings();
        if (!writeStartupTransitionSettings({ ...settings, [key]: Number(input.value) })) {
          this.#showActionNotice("Startup transition setting could not be saved", "error");
        }
        this.#renderStartupTransition();
      });
    }
    this.#required<HTMLSelectElement>("#cle-startupTransition-fit").addEventListener("change", (event) => {
      const fit = (event.currentTarget as HTMLSelectElement).value === "contain" ? "contain" : "cover";
      writeStartupTransitionSettings({ ...readStartupTransitionSettings(), videoFit: fit });
      this.#renderStartupTransition();
    });
    const timelineTrack = this.#required<HTMLElement>(".startupTransition-timeline-track");
    const scrub = (event: PointerEvent) => {
      if (!this.#startupVideo) return;
      const rect = timelineTrack.getBoundingClientRect();
      if (rect.width > 0) this.#seekStartupTimeline((event.clientX - rect.left) / rect.width * this.#startupVideo.duration);
    };
    timelineTrack.addEventListener("pointerdown", (event) => {
      if (!this.#startupVideo || event.button !== 0 || (event.target as Element).closest("[data-startup-timeline-edge]")) return;
      event.preventDefault();
      timelineTrack.setPointerCapture(event.pointerId);
      scrub(event);
    });
    timelineTrack.addEventListener("pointermove", (event) => {
      if (timelineTrack.hasPointerCapture(event.pointerId)) scrub(event);
    });
    for (const type of ["pointerup", "pointercancel"] as const) {
      timelineTrack.addEventListener(type, (event) => {
        if (timelineTrack.hasPointerCapture(event.pointerId)) timelineTrack.releasePointerCapture(event.pointerId);
      });
    }
    for (const handle of panel.querySelectorAll<HTMLElement>("[data-startup-timeline-edge]")) {
      const edge = handle.dataset.startupTimelineEdge as "start" | "end";
      let grabOffset = 0;
      handle.addEventListener("pointerdown", (event) => {
        if (!this.#startupVideo || event.button !== 0) return;
        event.preventDefault();
        grabOffset = event.clientX - (handle.getBoundingClientRect().left + handle.offsetWidth / 2);
        handle.setPointerCapture(event.pointerId);
        this.#seekStartupTimeline(edge === "start" ? readStartupTransitionSettings().clipStart : readStartupTransitionSettings().clipEnd - 0.02);
      });
      handle.addEventListener("pointermove", (event) => {
        if (!this.#startupVideo || !handle.hasPointerCapture(event.pointerId)) return;
        const rect = timelineTrack.getBoundingClientRect();
        const time = (event.clientX - grabOffset - rect.left) / rect.width * this.#startupVideo.duration;
        this.#moveStartupTimelineBoundary(edge, time);
      });
      handle.addEventListener("pointerup", (event) => {
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      });
      handle.addEventListener("keydown", (event) => {
        if (!this.#startupVideo) return;
        const current = readStartupTransitionSettings();
        const value = edge === "start" ? current.clipStart : current.clipEnd;
        const step = event.shiftKey || event.key === "PageUp" || event.key === "PageDown" ? 1 : 0.1;
        const next = event.key === "ArrowLeft" || event.key === "PageDown" ? value - step
          : event.key === "ArrowRight" || event.key === "PageUp" ? value + step
          : event.key === "Home" ? 0 : event.key === "End" ? this.#startupVideo.duration : undefined;
        if (next === undefined) return;
        event.preventDefault();
        this.#moveStartupTimelineBoundary(edge, next);
      });
    }
    const fileInput = this.#required<HTMLInputElement>(".startupTransition-file");
    this.#required<HTMLButtonElement>(".startupTransition-upload").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      const generation = ++this.#startupVideoGeneration;
      this.#startupVideoPending = true;
      this.#required<HTMLElement>(".startupTransition-error").hidden = true;
      this.#renderStartupTransition();
      try {
        const video = await saveStartupVideo(file);
        if (!this.#connected || generation !== this.#startupVideoGeneration) return;
        const settings = readStartupTransitionSettings();
        if (!writeStartupTransitionSettings({ ...settings, ...startupDefaultClip(video.duration) })) {
          throw new Error("Video trim settings could not be saved");
        }
        this.#setStartupVideo(video);
      } catch (error) {
        if (generation === this.#startupVideoGeneration) this.#showStartupTransitionError(error);
      } finally {
        this.#startupVideoPending = false;
        this.#renderStartupTransition();
      }
    });
    this.#required<HTMLButtonElement>(".startupTransition-remove").addEventListener("click", async () => {
      if (this.#startupVideoPending) return;
      this.#startupVideoPending = true;
      this.#renderStartupTransition();
      try {
        await removeStartupVideo();
        this.#startupVideoGeneration += 1;
        this.#setStartupVideo(null);
      } catch (error) {
        this.#showStartupTransitionError(error);
      } finally {
        this.#startupVideoPending = false;
        this.#renderStartupTransition();
      }
    });
    this.#required<HTMLButtonElement>(".startupTransition-reset").addEventListener("click", () => {
      const settings = readStartupTransitionSettings();
      if (!writeStartupTransitionSettings({ ...DEFAULT_STARTUP_TRANSITION_SETTINGS, enabled: settings.enabled, ...startupDefaultClip(this.#startupVideo?.duration) })) {
        this.#showActionNotice("Startup transition setting could not be saved", "error");
      }
      this.#renderStartupTransition();
      this.#stopStartupPreview();
      this.#resetStartupPreviewTiming();
      if (this.#startupVideo) this.#seekStartupTimeline(readStartupTransitionSettings().clipStart);
    });
    this.#required<HTMLButtonElement>(".startupTransition-play").addEventListener("click", () => this.#toggleStartupPlayback());
    this.#required<HTMLButtonElement>(".startupTransition-jump-start").addEventListener("click", () => {
      if (this.#startupVideo) this.#seekStartupTimeline(startupTimelineGeometry(readStartupTransitionSettings(), this.#startupVideo.duration).clipStart);
    });
    this.#required<HTMLButtonElement>(".startupTransition-jump-end").addEventListener("click", () => {
      if (this.#startupVideo) this.#seekStartupTimeline(startupTimelineGeometry(readStartupTransitionSettings(), this.#startupVideo.duration).clipEnd);
    });
  }

  #closeBlinkingSquares(): void {
    const panel = this.#shadow.querySelector<HTMLElement>("#cle-blinkingSquares-settings");
    if (panel?.matches(":popover-open")) panel.hidePopover();
    this.#shadow.querySelector(".blinkingSquares-settings-trigger")?.setAttribute("aria-expanded", "false");
  }
  #positionBlinkingSquares(): void {
    const panel = this.#required<HTMLElement>("#cle-blinkingSquares-settings");
    if (!panel.matches(":popover-open")) return;
    const rect = this.#required<HTMLElement>(".blinkingSquares-settings-trigger").getBoundingClientRect();
    panel.style.position = "fixed"; panel.style.margin = "0";
    panel.style.maxHeight = "calc(100vh - 24px)";
    const width = Math.min(344, window.innerWidth - 24);
    panel.style.width = width + "px";
    panel.style.left = Math.max(12, Math.min(rect.right + 12, window.innerWidth - width - 12)) + "px";
    panel.style.top = Math.max(12, Math.min(rect.top, window.innerHeight - panel.getBoundingClientRect().height - 12)) + "px";
  }
  #bindBlinkingSquares(): void {
    if (this.#blinkingSquaresEventsBound) return;
    this.#blinkingSquaresEventsBound = true;
    const panel = this.#required<HTMLElement>("#cle-blinkingSquares-settings");
    const trigger = this.#required<HTMLButtonElement>(".blinkingSquares-settings-trigger");
    this.#required<HTMLButtonElement>(".blinkingSquares-enable").addEventListener("click", () => void this.#toggleBlinkingSquares());
    trigger.addEventListener("click", () => {
      if (panel.matches(":popover-open")) { this.#closeBlinkingSquares(); return; }
      for (const other of this.#shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) {
        if (other !== panel && other.matches(":popover-open")) other.hidePopover();
      }
      this.#renderBlinkingSquares(); panel.showPopover(); this.#positionBlinkingSquares();
      trigger.setAttribute("aria-expanded", "true");
      this.#required<HTMLButtonElement>(".blinkingSquares-close").focus();
    });
    this.#required<HTMLButtonElement>(".blinkingSquares-close").addEventListener("click", () => { this.#closeBlinkingSquares(); trigger.focus(); });
    panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); this.#closeBlinkingSquares(); trigger.focus(); } });
    panel.addEventListener("toggle", () => trigger.setAttribute("aria-expanded", String(panel.matches(":popover-open"))));
    this.#previewMarketPopover.addEventListener("scroll", () => this.#positionBlinkingSquares());
    for (const [key] of BLINKING_SQUARES_CONTROLS) {
      const input = this.#required<HTMLInputElement>(`#cle-blinkingSquares-${key}`);
      input.addEventListener("input", () => this.#blinkingSquaresController.updateSettings({ ...this.#blinkingSquaresController.settings, [key]: Number(input.value) }));
    }
    for (const input of panel.querySelectorAll<HTMLInputElement>("[data-blinking-squares-toggle]")) {
      input.addEventListener("change", () => {
        const key = input.dataset.blinkingSquaresToggle as "mouseInteraction" | "keyboardInteraction" | "introEnabled" | "paused";
        this.#blinkingSquaresController.updateSettings({ ...this.#blinkingSquaresController.settings, [key]: input.checked });
      });
    }
    for (const input of panel.querySelectorAll<HTMLInputElement>("[data-blinking-squares-color]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.blinkingSquaresColor as "squareColor" | "backgroundColor";
        this.#blinkingSquaresController.updateSettings({ ...this.#blinkingSquaresController.settings, [key]: input.value });
      });
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-blinking-squares-direction]")) {
      button.addEventListener("click", () => this.#blinkingSquaresController.updateSettings({
        ...this.#blinkingSquaresController.settings,
        direction: button.dataset.blinkingSquaresDirection as BlinkingSquaresSettings["direction"],
      }));
    }
    this.#required<HTMLButtonElement>(".blinkingSquares-reset").addEventListener("click", () => this.#blinkingSquaresController.reset());
    this.#required<HTMLButtonElement>(".blinkingSquares-replay").addEventListener("click", () => this.#blinkingSquaresController.replay());
  }
  #renderBlinkingSquares(): void {
    const card = this.#shadow.querySelector<HTMLElement>(`[data-appearance-plugin="${BLINKING_SQUARES_BACKGROUND_PLUGIN_ID}"]`);
    if (!card) return;
    const controller = this.#blinkingSquaresController;
    const settings = controller.settings;
    const busy = controller.pending || this.#appearanceTransitionPending || this.#appearancePluginPending;
    const button = this.#required<HTMLButtonElement>(".blinkingSquares-enable");
    button.textContent = controller.enabled ? "Disable" : "Enable";
    button.disabled = busy;
    button.setAttribute("aria-pressed", String(controller.enabled));
    button.setAttribute("aria-label", `${controller.enabled ? "Disable" : "Enable"} Blinking Squares Background`);
    const status = this.#required<HTMLElement>(".blinkingSquares-status");
    status.textContent = controller.pending ? "Applying…" : controller.error ? "Unavailable" : controller.enabled ? "Enabled" : "Disabled";
    status.dataset.enabled = String(controller.enabled);
    for (const [key, zh, en] of BLINKING_SQUARES_CONTROLS) {
      const input = this.#required<HTMLInputElement>(`#cle-blinkingSquares-${key}`);
      if (this.#shadow.activeElement !== input) input.value = String(settings[key]);
      input.disabled = busy;
      input.setAttribute("aria-label", this.#backgroundText(zh, en));
      input.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(String(settings[key])));
    }
    for (const input of this.#shadow.querySelectorAll<HTMLInputElement>("[data-blinking-squares-toggle]")) {
      const key = input.dataset.blinkingSquaresToggle as "mouseInteraction" | "keyboardInteraction" | "introEnabled" | "paused";
      input.checked = settings[key]; input.disabled = busy;
    }
    for (const input of this.#shadow.querySelectorAll<HTMLInputElement>("[data-blinking-squares-color]")) {
      const key = input.dataset.blinkingSquaresColor as "squareColor" | "backgroundColor";
      input.value = settings[key]; input.disabled = busy;
    }
    for (const direction of this.#shadow.querySelectorAll<HTMLButtonElement>("[data-blinking-squares-direction]")) {
      direction.setAttribute("aria-pressed", String(direction.dataset.blinkingSquaresDirection === settings.direction));
      direction.disabled = busy;
    }
    this.#required<HTMLButtonElement>(".blinkingSquares-reset").disabled = busy;
    this.#required<HTMLButtonElement>(".blinkingSquares-replay").disabled = busy || !controller.enabled;
    const error = this.#required<HTMLElement>(".blinkingSquares-error");
    error.textContent = controller.error ?? ""; error.hidden = !controller.error;
    this.#backgroundPackageMarket?.queueRender();
  }
  async #toggleBlinkingSquares(): Promise<void> {
    if (this.#appearanceTransitionPending || this.#appearancePluginPending || this.#blinkingSquaresController.pending) return;
    const operation = ++this.#appearanceOperation;
    this.#appearanceTransitionPending = true; this.#renderPreviewMarket();
    const controllers = [this.#particleBackgroundController, this.#blackHoleBackgroundController, this.#glowHorizonBackgroundController, this.#heavenlyCloudBackgroundController, this.#auroraIonosphereBackgroundController, this.#milkyWayBackgroundController, this.#mountainController, this.#cloudTrainController, this.#pixelSculptController];
    const ids = [PARTICLE_BACKGROUND_PLUGIN_ID, BLACK_HOLE_BACKGROUND_PLUGIN_ID, GLOW_HORIZON_BACKGROUND_PLUGIN_ID, HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID, AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID, MILKY_WAY_BACKGROUND_PLUGIN_ID, MOUNTAIN_BACKGROUND_PLUGIN_ID, CLOUD_TRAIN_BACKGROUND_PLUGIN_ID, PIXEL_SCULPT_BACKGROUND_PLUGIN_ID];
    let previous = -1;
    try {
      if (!this.#enabledAppearancePlugins.has(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('blinking-squares');
      if (!await this.#awaitBackgroundInitializations(operation, true, true, true, true)) return;
      if (this.#blinkingSquaresController.enabled) {
        await this.#blinkingSquaresController.disable();
        this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
      } else {
        if (this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)) {
          if (!this.#bridge?.available) throw new Error("Restart Codex with Code-Codex to disable transparency first.");
          await this.#setWindowTransparency(this.#bridge, false);
          this.#clearTransparentBackgroundPresentation();
          this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
          this.#appearancePluginApplied = false;
        }
        for (let index = 0; index < controllers.length; index += 1) {
          if (controllers[index]!.enabled) { previous = index; await controllers[index]!.disable(true); }
          this.#enabledAppearancePlugins.delete(ids[index]!);
        }
        const lease = readParticleThemeLease();
        if (lease?.owner) transferParticleThemeLease(lease.owner, BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
        await this.#blinkingSquaresController.enable();
        if (!this.#connected || operation !== this.#appearanceOperation) { await this.#blinkingSquaresController.disable(); return; }
        if (!this.#blinkingSquaresController.enabled) throw new Error(this.#blinkingSquaresController.error || "Blinking Squares Background could not be enabled");
        this.#enabledAppearancePlugins.add(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#announce(`Blinking Squares Background ${this.#blinkingSquaresController.enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
      if (previous >= 0) {
        try { await controllers[previous]!.enable(); if (controllers[previous]!.enabled) this.#enabledAppearancePlugins.add(ids[previous]!); }
        catch { /* Preserve the original activation failure. */ }
      }
      this.#writeEnabledAppearancePlugins();
      this.#showActionNotice(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.#appearanceTransitionPending = false; this.#renderPreviewMarket();
    }
  }

  #closePixelSculpt(): void {
    const panel=this.#shadow.querySelector<HTMLElement>("#cle-pixelSculpt-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.#shadow.querySelector(".pixelSculpt-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  #positionPixelSculpt(): void {
    const panel=this.#required<HTMLElement>("#cle-pixelSculpt-settings");
    if(!panel.matches(":popover-open"))return;
    const rect=this.#required<HTMLElement>(".pixelSculpt-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(344,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  #bindPixelSculpt(): void {
    if(this.#pixelSculptEventsBound)return; this.#pixelSculptEventsBound=true;
    const panel=this.#required<HTMLElement>("#cle-pixelSculpt-settings");
    this.#required<HTMLButtonElement>(".pixelSculpt-enable").addEventListener("click",()=>void this.#togglePixelSculpt());
    this.#required<HTMLButtonElement>(".pixelSculpt-settings-trigger").addEventListener("click",()=>{
      if(panel.matches(":popover-open")){this.#closePixelSculpt();return;}
      for(const other of this.#shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) if(other!==panel&&other.matches(":popover-open"))other.hidePopover();
      this.#renderPixelSculpt(); panel.showPopover(); this.#positionPixelSculpt();
      this.#required(".pixelSculpt-settings-trigger").setAttribute("aria-expanded","true");
      this.#required<HTMLButtonElement>(".pixelSculpt-close").focus();
      void this.#pixelSculptController.prepareEditor().then(()=>{
        if(!this.#connected)return;
        this.#renderPixelSculpt();
        this.#positionPixelSculpt();
      }).catch(()=>{ if(this.#connected)this.#renderPixelSculpt(); });
    });
    this.#required<HTMLButtonElement>(".pixelSculpt-close").addEventListener("click",()=>{this.#closePixelSculpt();this.#required<HTMLButtonElement>(".pixelSculpt-settings-trigger").focus();});
    panel.addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopPropagation();this.#closePixelSculpt();this.#required<HTMLButtonElement>(".pixelSculpt-settings-trigger").focus();}});
    this.#previewMarketPopover.addEventListener("scroll",()=>this.#positionPixelSculpt());
    panel.addEventListener("toggle",()=>{this.#required(".pixelSculpt-settings-trigger").setAttribute("aria-expanded",String(panel.matches(":popover-open")));});
    this.#required<HTMLInputElement>(".pixelSculpt-paused").addEventListener("change",event=>this.#pixelSculptController.updateSettings({...this.#pixelSculptController.settings,paused:(event.target as HTMLInputElement).checked}));
    this.#required(".pixelSculpt-reset").addEventListener("click",()=>this.#pixelSculptController.reset());
  }
  #renderPixelSculpt(): void {
    const card=this.#shadow.querySelector<HTMLElement>('[data-appearance-plugin="'+PIXEL_SCULPT_BACKGROUND_PLUGIN_ID+'"]'); if(!card)return;
    const c=this.#pixelSculptController, s=c.settings;
    const busy=c.pending||c.editorPending||this.#appearanceTransitionPending||this.#appearancePluginPending;
    const button=card.querySelector<HTMLButtonElement>(".pixelSculpt-enable")!;
    button.textContent=c.enabled?"Disable":"Enable";button.disabled=busy;button.setAttribute("aria-pressed",String(c.enabled));button.setAttribute("aria-label",`${c.enabled?"Disable":"Enable"} Pixel Sculpt Background`);
    const status=card.querySelector<HTMLElement>(".pixelSculpt-status")!;status.textContent=c.pending?"Applying…":c.error?"Unavailable":c.enabled?"Enabled":"Disabled";status.dataset.enabled=String(c.enabled);
    this.#required<HTMLInputElement>(".pixelSculpt-paused").checked=s.paused;
    this.#required<HTMLInputElement>(".pixelSculpt-paused").disabled=busy||!c.enabled;
    this.#required<HTMLButtonElement>(".pixelSculpt-reset").disabled=busy||!c.editorReady;
    this.#required<HTMLElement>(".pixelSculpt-disabled").hidden=c.enabled;
    const controlsHost=this.#required<HTMLElement>(".pixelSculpt-controls-host");
    controlsHost.hidden=!c.editorReady;
    if(c.editorReady)c.mountControls(controlsHost,this.#backgroundSettingsLanguage);
    const error=this.#required<HTMLElement>(".pixelSculpt-error");error.textContent=c.error??"";error.hidden=!c.error;
    this.#backgroundPackageMarket?.queueRender();
  }
  async #togglePixelSculpt(): Promise<void> {
    if(this.#appearanceTransitionPending||this.#appearancePluginPending||this.#pixelSculptController.pending)return;
    const operation=++this.#appearanceOperation;this.#appearanceTransitionPending=true;this.#renderPreviewMarket();
    const controllers=[this.#particleBackgroundController,this.#blackHoleBackgroundController,this.#glowHorizonBackgroundController,this.#heavenlyCloudBackgroundController,this.#auroraIonosphereBackgroundController,this.#milkyWayBackgroundController,this.#mountainController,this.#cloudTrainController];
    const ids=[PARTICLE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID];
    let previous=-1;
    try {
      if (!this.#enabledAppearancePlugins.has(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID)) await ensureBackgroundPackage('pixel-sculpt');
      if(!await this.#awaitBackgroundInitializations(operation,true,true,true))return;
      if(this.#pixelSculptController.enabled){await this.#pixelSculptController.disable();this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);}
      else {
        if(this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)){
          if(!this.#bridge?.available)throw new Error("Restart Codex with Code-Codex to disable transparency first.");
          await this.#setWindowTransparency(this.#bridge,false);this.#clearTransparentBackgroundPresentation();this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);this.#appearancePluginApplied=false;
        }
        for(let i=0;i<controllers.length;i++){if(controllers[i]!.enabled){previous=i;await controllers[i]!.disable(true);}this.#enabledAppearancePlugins.delete(ids[i]!);}
        const lease=readParticleThemeLease();if(lease?.owner)transferParticleThemeLease(lease.owner,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
        await this.#pixelSculptController.enable();
        if (!this.#connected || operation !== this.#appearanceOperation) { await this.#pixelSculptController.disable(); return; }
        if(!this.#pixelSculptController.enabled)throw new Error(this.#pixelSculptController.error||"Pixel Sculpt Background could not be enabled");
        this.#enabledAppearancePlugins.add(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
    } catch(error) {
      this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
      if(previous>=0){try{await controllers[previous]!.enable();if(controllers[previous]!.enabled)this.#enabledAppearancePlugins.add(ids[previous]!);}catch{}}
      this.#writeEnabledAppearancePlugins();this.#showActionNotice(error instanceof Error?error.message:String(error),"error");
    } finally {this.#appearanceTransitionPending=false;this.#renderPreviewMarket();}
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
    runtimeEvent("renderer", "appearance plugins", "active set updated", {plugins:[...this.#enabledAppearancePlugins]});
    try {
      localStorage.setItem(APPEARANCE_PLUGIN_SETTINGS_KEY, JSON.stringify([...this.#enabledAppearancePlugins]));
    } catch {
      // Appearance plugins remain enabled for this session when DOM storage is unavailable.
    }
  }

  #transparencyPreferenceBlocked(): boolean {
    return this.#forcedColorsQuery?.matches === true || this.#reducedTransparencyQuery?.matches === true;
  }

  #transparentBackgroundPresentation():string|undefined{return transparentPresentation();}
  #applyTransparentBackgroundPresentation(background:string):void{applyTransparentPresentation(background);}
  #clearTransparentBackgroundPresentation():void{clearTransparentPresentation();}

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
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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
    let heavenlyCloudWasActive = false;
    let auroraIonosphereWasActive = false;
    let milkyWayWasActive = false;
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
        const heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        const auroraIonosphereWasEnabled = this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        const milkyWayWasEnabled = this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID);
        particleWasActive = particleWasEnabled || this.#particleBackgroundController.enabled;
        blackHoleWasActive = blackHoleWasEnabled || this.#blackHoleBackgroundController.enabled;
        glowHorizonWasActive = glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled;
        heavenlyCloudWasActive = heavenlyCloudWasEnabled || this.#heavenlyCloudBackgroundController.enabled;
        auroraIonosphereWasActive = auroraIonosphereWasEnabled || this.#auroraIonosphereBackgroundController.enabled;
        milkyWayWasActive = milkyWayWasEnabled || this.#milkyWayBackgroundController.enabled;
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
        if (heavenlyCloudWasActive) {
          await this.#heavenlyCloudBackgroundController.disable();
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            if (this.#connected && !this.#dismissed) {
              if (heavenlyCloudWasActive) await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
              else if (glowHorizonWasActive) await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
              else if (blackHoleWasActive) await this.#blackHoleBackgroundController.enable().catch(() => undefined);
              else if (particleWasActive) await this.#particleBackgroundController.enable().catch(() => undefined);
            }
            return;
          }
        }
        if (auroraIonosphereWasActive) {
          await this.#auroraIonosphereBackgroundController.disable();
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            if (this.#connected && !this.#dismissed) {
              if (auroraIonosphereWasActive) await this.#auroraIonosphereBackgroundController.enable().catch(() => undefined);
              else if (heavenlyCloudWasActive) await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
              else if (glowHorizonWasActive) await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
              else if (blackHoleWasActive) await this.#blackHoleBackgroundController.enable().catch(() => undefined);
              else if (particleWasActive) await this.#particleBackgroundController.enable().catch(() => undefined);
            }
            return;
          }
        }
        if (milkyWayWasActive) {
          await this.#milkyWayBackgroundController.disable();
          if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
            await this.#reconcilePersistedWindowTransparency();
            if (this.#connected && !this.#dismissed) {
              if (milkyWayWasActive) await this.#milkyWayBackgroundController.enable().catch(() => undefined);
              else if (heavenlyCloudWasActive) await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
              else if (glowHorizonWasActive) await this.#glowHorizonBackgroundController.enable().catch(() => undefined);
              else if (blackHoleWasActive) await this.#blackHoleBackgroundController.enable().catch(() => undefined);
              else if (particleWasActive) await this.#particleBackgroundController.enable().catch(() => undefined);
            }
            return;
          }
        }
        this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
        this.#enabledAppearancePlugins.add(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      } else {
        this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
      }
      this.#writeEnabledAppearancePlugins();
      this.#renderParticleBackgroundPlugin();
      this.#renderBlackHoleBackgroundPlugin();
      this.#renderGlowHorizonBackgroundPlugin();
      this.#renderHeavenlyCloudBackgroundPlugin();
      this.#renderAuroraIonosphereBackgroundPlugin();
      this.#renderMilkyWayBackgroundPlugin();
      this.#announce(`Transparent Background ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      if (!this.#connected || operation !== this.#appearanceOperation) return;
      if (nextEnabled) {
        if (milkyWayWasActive && !this.#milkyWayBackgroundController.enabled) await this.#milkyWayBackgroundController.enable().catch(() => undefined);
        if (auroraIonosphereWasActive && !this.#auroraIonosphereBackgroundController.enabled) {
          await this.#auroraIonosphereBackgroundController.enable().catch(() => undefined);
        } else if (heavenlyCloudWasActive && !this.#heavenlyCloudBackgroundController.enabled) {
          await this.#heavenlyCloudBackgroundController.enable().catch(() => undefined);
        } else if (glowHorizonWasActive && !this.#glowHorizonBackgroundController.enabled) {
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
        && !this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
        && !this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)
        && !this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID)
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
    this.#closeUpdateDialog(false);
    this.#previewMarketOpen = true;
    this.#previewMarketPopover.hidden = false;
    this.#previewMarketButton.setAttribute("aria-expanded", "true");
    this.#renderPreviewMarket();
    this.#selectPreviewMarketCategory("appearance", false);
    queueMicrotask(() => {
      if (this.#previewMarketOpen) this.#previewMarketCloseButton.focus();
    });
  }

  #toggleParticleSettings(): void {
    this.#closeMilkyWaySettings(false);
    if (this.#particleSettingsOpen) {
      this.#closeParticleSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#closeHeavenlyCloudSettings(false);
    this.#closeAuroraIonosphereSettings(false);
    this.#particleSettingsOpen = true;
    void ensureBackgroundPackage('particle-image').then(async()=>{
      await this.#particleBackgroundController.refreshLibrary();
      if(this.#particleSettingsOpen) this.#renderParticleBackgroundPlugin();
    }).catch(error=>this.#showActionNotice(error instanceof Error ? error.message : String(error),'error'));
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
    this.#closeMilkyWaySettings(false);
    if (this.#blackHoleSettingsOpen) {
      this.#closeBlackHoleSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#closeHeavenlyCloudSettings(false);
    this.#closeAuroraIonosphereSettings(false);
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
    this.#closeMilkyWaySettings(false);
    if (this.#glowHorizonSettingsOpen) {
      this.#closeGlowHorizonSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeBlackHoleSettings(false);
    this.#closeHeavenlyCloudSettings(false);
    this.#closeAuroraIonosphereSettings(false);
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

  #toggleHeavenlyCloudSettings(): void {
    this.#closeMilkyWaySettings(false);
    if (this.#heavenlyCloudSettingsOpen) {
      this.#closeHeavenlyCloudSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#closeAuroraIonosphereSettings(false);
    this.#heavenlyCloudSettingsOpen = true;
    this.#heavenlyCloudSettingsTrigger.setAttribute("aria-expanded", "true");
    this.#renderHeavenlyCloudBackgroundPlugin();
    if (!this.#heavenlyCloudSettingsPanel.matches(":popover-open")) this.#heavenlyCloudSettingsPanel.showPopover();
    this.#positionHeavenlyCloudSettingsPanel();
    queueMicrotask(() => {
      if (!this.#heavenlyCloudSettingsOpen) return;
      this.#positionHeavenlyCloudSettingsPanel();
      this.#heavenlyCloudSettingsCloseButton.focus();
    });
  }

  #closeHeavenlyCloudSettings(restoreFocus: boolean): void {
    if (!this.#heavenlyCloudSettingsOpen && !this.#heavenlyCloudSettingsPanel.matches(":popover-open")) return;
    this.#heavenlyCloudSettingsOpen = false;
    this.#heavenlyCloudSettingsTrigger.setAttribute("aria-expanded", "false");
    if (this.#heavenlyCloudSettingsPanel.matches(":popover-open")) this.#heavenlyCloudSettingsPanel.hidePopover();
    if (restoreFocus && this.#heavenlyCloudSettingsTrigger.isConnected) this.#heavenlyCloudSettingsTrigger.focus();
  }

  #positionHeavenlyCloudSettingsPanel(): void {
    if (!this.#heavenlyCloudSettingsOpen || !this.#heavenlyCloudSettingsPanel.matches(":popover-open")) return;
    const panel = this.#heavenlyCloudSettingsPanel;
    const cardRect = this.#heavenlyCloudBackgroundCard.getBoundingClientRect();
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

  #toggleAuroraIonosphereSettings(): void {
    this.#closeMilkyWaySettings(false);
    if (this.#auroraIonosphereSettingsOpen) {
      this.#closeAuroraIonosphereSettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#closeHeavenlyCloudSettings(false);
    this.#auroraIonosphereSettingsOpen = true;
    this.#auroraIonosphereSettingsTrigger.setAttribute("aria-expanded", "true");
    this.#renderAuroraIonosphereBackgroundPlugin();
    this.#renderMilkyWayBackgroundPlugin();
    if (!this.#auroraIonosphereSettingsPanel.matches(":popover-open")) this.#auroraIonosphereSettingsPanel.showPopover();
    this.#positionAuroraIonosphereSettingsPanel();
    queueMicrotask(() => {
      if (!this.#auroraIonosphereSettingsOpen) return;
      this.#positionAuroraIonosphereSettingsPanel();
      this.#auroraIonosphereSettingsCloseButton.focus();
    });
  }

  #toggleMilkyWaySettings(): void {
    if (this.#milkyWaySettingsOpen) {
      this.#closeMilkyWaySettings(true);
      return;
    }
    if (!this.#previewMarketOpen) this.#togglePreviewMarket();
    this.#closeParticleSettings(false);
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#closeHeavenlyCloudSettings(false);
    this.#closeAuroraIonosphereSettings(false);
    this.#milkyWaySettingsOpen = true;
    this.#milkyWaySettingsTrigger.setAttribute("aria-expanded", "true");
    this.#renderMilkyWayBackgroundPlugin();
    if (!this.#milkyWaySettingsPanel.matches(":popover-open")) this.#milkyWaySettingsPanel.showPopover();
    this.#positionMilkyWaySettingsPanel();
    queueMicrotask(() => {
      if (!this.#milkyWaySettingsOpen) return;
      this.#positionMilkyWaySettingsPanel();
      this.#milkyWaySettingsCloseButton.focus();
    });
  }

  #closeAuroraIonosphereSettings(restoreFocus: boolean): void {
    if (!this.#auroraIonosphereSettingsOpen && !this.#auroraIonosphereSettingsPanel.matches(":popover-open")) return;
    this.#auroraIonosphereSettingsOpen = false;
    this.#auroraIonosphereSettingsTrigger.setAttribute("aria-expanded", "false");
    if (this.#auroraIonosphereSettingsPanel.matches(":popover-open")) this.#auroraIonosphereSettingsPanel.hidePopover();
    if (restoreFocus && this.#auroraIonosphereSettingsTrigger.isConnected) this.#auroraIonosphereSettingsTrigger.focus();
  }

  #closeMilkyWaySettings(restoreFocus: boolean): void {
    if (!this.#milkyWaySettingsOpen && !this.#milkyWaySettingsPanel.matches(":popover-open")) return;
    this.#milkyWaySettingsOpen = false;
    this.#milkyWaySettingsTrigger.setAttribute("aria-expanded", "false");
    if (this.#milkyWaySettingsPanel.matches(":popover-open")) this.#milkyWaySettingsPanel.hidePopover();
    if (restoreFocus && this.#milkyWaySettingsTrigger.isConnected) this.#milkyWaySettingsTrigger.focus();
  }

  #positionAuroraIonosphereSettingsPanel(): void {
    if (!this.#auroraIonosphereSettingsOpen || !this.#auroraIonosphereSettingsPanel.matches(":popover-open")) return;
    const panel = this.#auroraIonosphereSettingsPanel;
    const cardRect = this.#auroraIonosphereBackgroundCard.getBoundingClientRect();
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

  #positionMilkyWaySettingsPanel(): void {
    if (!this.#milkyWaySettingsOpen || !this.#milkyWaySettingsPanel.matches(":popover-open")) return;
    const panel = this.#milkyWaySettingsPanel;
    const cardRect = this.#milkyWayBackgroundCard.getBoundingClientRect();
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

  #toggleGitHistory(): void {
    if (this.#gitHistoryOpen) {
      this.#closeGitHistory(true);
      return;
    }
    this.#gitHistoryOpen = true;
    this.#frame.dataset.gitHistoryOpen = "true";
    this.#gitHistoryPanel.hidden = false;
    this.#gitHistoryOpenButton.setAttribute("aria-expanded", "true");
    this.#gitHistoryOpenButton.textContent = "Disable";
    this.#gitHistoryOpenButton.dataset.enabled = "true";
    this.#showGitHistoryList();
    this.#closePreviewMarket(false);
    requestAnimationFrame(() => this.#syncGitHistoryResizeAria());
    void this.#loadGitHistory(true);
  }

  #selectPreviewMarketCategory(category: PreviewMarketCategory, focus = true): void {
    this.#previewMarketList.dataset.previewMarketCategory = category;
    for (const button of this.#previewMarketList.querySelectorAll<HTMLButtonElement>("button[data-preview-market-category]")) {
      const selected = button.dataset.previewMarketCategory === category;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    }
    for (const section of this.#previewMarketList.querySelectorAll<HTMLElement>("[data-preview-market-section]")) {
      section.hidden = section.dataset.previewMarketSection !== category;
    }
    this.#previewMarketList.scrollTop = 0;
    if (category !== "appearance") {
      this.#closeBlinkingSquares();
      this.#closePixelSculpt();
      this.#closeCloudTrain();
      this.#closeMountain();
      this.#closeMilkyWaySettings(false);
      this.#closeParticleSettings(false);
      this.#closeBlackHoleSettings(false);
      this.#closeGlowHorizonSettings(false);
      this.#closeHeavenlyCloudSettings(false);
      this.#closeAuroraIonosphereSettings(false);
    }
    this.#revealEnabledPreviewMarketCard(category);
  }

  #revealEnabledPreviewMarketCard(category: PreviewMarketCategory): void {
    if (!this.#previewMarketOpen) return;
    const section = this.#previewMarketList.querySelector<HTMLElement>(
      `[data-preview-market-section="${category}"]`,
    );
    if (!section || section.hidden) return;
    const card = Array.from(section.querySelectorAll<HTMLElement>(".preview-extension:not([hidden])"))
      .find((candidate) => {
        const action = candidate.querySelector<HTMLButtonElement>(".preview-extension-action");
        return action?.getAttribute("aria-pressed") === "true" || action?.dataset.enabled === "true";
      });
    if (!card) return;
    const list = this.#previewMarketList;
    const top = list.scrollTop + card.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
    list.scrollTop = Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
  }

  #closeGitHistory(restoreFocus: boolean): void {
    if (!this.#gitHistoryOpen && this.#gitHistoryPanel.hidden) return;
    this.#gitHistoryOpen = false;
    this.#gitHistoryGeneration += 1;
    this.#gitHistoryLoading = false;
    this.#cancelGitHistoryResize();
    delete this.#frame.dataset.gitHistoryOpen;
    this.#gitHistoryPanel.hidden = true;
    this.#gitHistoryOpenButton.setAttribute("aria-expanded", "false");
    this.#gitHistoryOpenButton.textContent = "Enable";
    delete this.#gitHistoryOpenButton.dataset.enabled;
    if (restoreFocus && this.#gitHistoryOpenButton.isConnected) this.#gitHistoryOpenButton.focus();
  }

  #beginGitHistoryResize(event: PointerEvent): void {
    if (!this.#gitHistoryOpen || event.button !== 0) return;
    event.preventDefault();
    this.#gitHistoryResizeState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: this.#gitHistoryPanel.getBoundingClientRect().height,
    };
    this.#gitHistoryResizeHandle.setPointerCapture(event.pointerId);
    this.#frame.dataset.gitHistoryResizing = "true";
  }

  #updateGitHistoryResize(event: PointerEvent): void {
    const state = this.#gitHistoryResizeState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.#setGitHistoryHeight(state.startHeight + state.startY - event.clientY);
  }

  #finishGitHistoryResize(event: PointerEvent): void {
    const state = this.#gitHistoryResizeState;
    if (!state || state.pointerId !== event.pointerId) return;
    this.#gitHistoryResizeState = undefined;
    delete this.#frame.dataset.gitHistoryResizing;
    if (this.#gitHistoryResizeHandle.hasPointerCapture(event.pointerId)) {
      this.#gitHistoryResizeHandle.releasePointerCapture(event.pointerId);
    }
  }

  #cancelGitHistoryResize(): void {
    const state = this.#gitHistoryResizeState;
    this.#gitHistoryResizeState = undefined;
    delete this.#frame.dataset.gitHistoryResizing;
    if (state && this.#gitHistoryResizeHandle.hasPointerCapture(state.pointerId)) {
      this.#gitHistoryResizeHandle.releasePointerCapture(state.pointerId);
    }
  }

  #setGitHistoryHeight(height: number): void {
    const frameHeight = this.#frame.getBoundingClientRect().height;
    const minimum = 120;
    const maximum = Math.max(minimum, frameHeight - 170);
    const nextHeight = Math.round(Math.min(maximum, Math.max(minimum, height)));
    this.#frame.style.setProperty("--cle-git-history-height", `${nextHeight}px`);
    this.#gitHistoryResizeHandle.setAttribute("aria-valuemax", String(Math.round(maximum)));
    this.#gitHistoryResizeHandle.setAttribute("aria-valuenow", String(nextHeight));
  }

  #syncGitHistoryResizeAria(): void {
    if (!this.#gitHistoryOpen) return;
    const frameHeight = this.#frame.getBoundingClientRect().height;
    const maximum = Math.max(120, frameHeight - 170);
    const currentHeight = Math.round(this.#gitHistoryPanel.getBoundingClientRect().height);
    this.#gitHistoryResizeHandle.setAttribute("aria-valuemax", String(Math.round(maximum)));
    this.#gitHistoryResizeHandle.setAttribute("aria-valuenow", String(currentHeight));
  }

  #onGitHistoryResizeKeyDown(event: KeyboardEvent): void {
    if (!this.#gitHistoryOpen || (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home")) return;
    event.preventDefault();
    const currentHeight = this.#gitHistoryPanel.getBoundingClientRect().height;
    if (event.key === "Home") {
      this.#frame.style.removeProperty("--cle-git-history-height");
      requestAnimationFrame(() => this.#syncGitHistoryResizeAria());
      return;
    }
    this.#setGitHistoryHeight(currentHeight + (event.key === "ArrowUp" ? 20 : -20));
  }

  #prepareGitHistoryForThreadSwitch(): void {
    if (!this.#gitHistoryOpen) return;
    this.#gitHistoryGeneration += 1;
    this.#gitHistoryLoading = false;
    this.#gitHistoryCommits = [];
    this.#gitHistoryHasMore = false;
    this.#showGitHistoryList();
    this.#gitHistoryBranch.textContent = "Repository";
    this.#gitHistoryState.hidden = false;
    this.#gitHistoryState.textContent = "Switching repository…";
    this.#gitHistoryList.replaceChildren();
    this.#gitHistoryLoadMoreButton.hidden = true;
    this.#gitHistoryRefreshButton.disabled = true;
    this.#gitHistoryLoadMoreButton.disabled = true;
  }

  #showGitHistoryUnavailable(message: string): void {
    if (!this.#gitHistoryOpen) return;
    this.#gitHistoryGeneration += 1;
    this.#gitHistoryLoading = false;
    this.#gitHistoryCommits = [];
    this.#gitHistoryHasMore = false;
    this.#showGitHistoryList();
    this.#gitHistoryBranch.textContent = "Repository";
    this.#gitHistoryList.replaceChildren();
    this.#showGitHistoryError(message);
    this.#gitHistoryRefreshButton.disabled = false;
    this.#gitHistoryLoadMoreButton.disabled = false;
  }

  async #loadGitHistory(reset: boolean): Promise<void> {
    if (this.#gitHistoryLoading) return;
    const bridge = this.#bridge;
    if (!bridge?.available) {
      this.#showGitHistoryError("Code-Codex is not connected.");
      return;
    }
    const generation = ++this.#gitHistoryGeneration;
    this.#gitHistoryLoading = true;
    this.#gitHistoryRefreshButton.disabled = true;
    this.#gitHistoryLoadMoreButton.disabled = true;
    if (reset) {
      this.#showGitHistoryList();
      this.#gitHistoryCommits = [];
      this.#gitHistoryState.hidden = false;
      this.#gitHistoryState.textContent = "Loading commit history…";
      this.#gitHistoryList.replaceChildren();
      this.#gitHistoryLoadMoreButton.hidden = true;
    }
    try {
      const raw = await bridge.request<unknown>("explorer.git.history", {
        skip: reset ? 0 : this.#gitHistoryCommits.length,
        limit: 50,
      });
      if (generation !== this.#gitHistoryGeneration || !this.#gitHistoryOpen) return;
      const result = normalizeGitHistory(raw);
      this.#gitHistoryCommits = reset
        ? [...result.commits]
        : [...this.#gitHistoryCommits, ...result.commits];
      this.#gitHistoryHasMore = result.hasMore;
      this.#gitHistoryBranch.textContent = result.branch;
      this.#renderGitHistoryList();
    } catch (error) {
      if (generation === this.#gitHistoryGeneration && this.#gitHistoryOpen) {
        this.#showGitHistoryError(gitHistoryError(error));
      }
    } finally {
      if (generation === this.#gitHistoryGeneration) {
        this.#gitHistoryLoading = false;
        this.#gitHistoryRefreshButton.disabled = false;
        this.#gitHistoryLoadMoreButton.disabled = false;
      }
    }
  }

  #renderGitHistoryList(): void {
    pluginExport<(host:HistoryHost)=>void>('git-history','renderGitHistoryList')({list:this.#gitHistoryList,commits:this.#gitHistoryCommits,state:this.#gitHistoryState,loadMore:this.#gitHistoryLoadMoreButton,hasMore:this.#gitHistoryHasMore});
  }

  #showGitHistoryError(message: string): void {
    this.#gitHistoryState.hidden = false;
    this.#gitHistoryState.textContent = message;
    this.#gitHistoryLoadMoreButton.hidden = true;
  }

  #showGitHistoryList(): void {
    this.#gitHistoryDetailView.hidden = true;
    this.#gitHistoryListView.hidden = false;
    this.#gitHistoryBackButton.hidden = true;
    this.#gitHistoryDetail.replaceChildren();
  }

  async #openGitCommit(hash: string): Promise<void> {
    const bridge = this.#bridge;
    if (!bridge?.available) return;
    const generation = ++this.#gitHistoryGeneration;
    this.#gitHistoryListView.hidden = true;
    this.#gitHistoryDetailView.hidden = false;
    this.#gitHistoryBackButton.hidden = false;
    this.#gitHistoryDetail.textContent = "Loading commit…";
    try {
      const result = normalizeGitCommit(await bridge.request<unknown>("explorer.git.commit", { hash }));
      if (generation !== this.#gitHistoryGeneration || !this.#gitHistoryOpen) return;
      this.#renderGitCommit(result);
    } catch (error) {
      if (generation === this.#gitHistoryGeneration) this.#gitHistoryDetail.textContent = gitHistoryError(error);
    }
  }

  #renderGitCommit(commit: GitCommitResult): void {
    pluginExport<(host:{detail:HTMLElement},commit:GitCommitResult)=>void>('git-history','renderGitCommit')({detail:this.#gitHistoryDetail},commit);
  }

  async #openGitHistoryFile(hash: string, path: string): Promise<void> {
    const normalizedPath = path.replaceAll("\\", "/");
    const name = normalizedPath.split("/").at(-1) || normalizedPath;
    const tabPath = `git-diff://${hash}/${normalizedPath}`;
    if (
      (this.#state !== "ready" && this.#state !== "empty") ||
      !this.#context ||
      !this.#bridge?.available ||
      !this.#mainPreviewSurface?.isConnected ||
      !this.#ensureMainPreview()
    ) return;
    if (this.#editingPath !== null && !this.#leaveEditing("Open a Git diff and discard your unsaved changes?")) return;

    let tab = this.#previewTabs.find((candidate) => candidate.path === tabPath);
    if (!tab) {
      if (this.#previewTabs.length >= MAX_PREVIEW_TABS) {
        const evicted = this.#previewTabs.shift();
        if (evicted) this.#disposePreviewTab(evicted);
      }
      tab = {
        instanceId: this.#nextPreviewInstanceId++,
        path: tabPath,
        name,
        revision: 0,
        timer: undefined,
        modifiedDuringSave: false,
        dirty: false,
        view: { kind: "loading", path: tabPath, name },
      };
      this.#previewTabs.push(tab);
    }
    const revision = ++tab.revision;
    tab.view = { kind: "loading", path: tabPath, name };
    this.#activePreviewPath = tabPath;
    this.#syncMainPreview();
    this.#renderVisible();
    if (this.dataset.placement === "drawer" && !this.#settings.collapsed) this.collapse(true);
    try {
      const bridge = this.#bridge;
      if (!bridge?.available) throw new BridgeUnavailableError();
      const result = normalizeGitDiff(await bridge.request<unknown>("explorer.git.diff", { hash, path }));
      if (!this.#previewTabs.includes(tab) || tab.revision !== revision) return;
      tab.view = {
        kind: "git-diff",
        path: tabPath,
        name,
        sourcePath: result.path || normalizedPath,
        content: result.content,
        truncated: result.truncated,
        shortHash: hash.slice(0, 7),
      };
      this.#syncMainPreview();
      this.#announce(`${name} changes opened in the main view`);
    } catch (error) {
      if (!this.#previewTabs.includes(tab) || tab.revision !== revision) return;
      tab.view = { kind: "error", path: tabPath, name, code: errorCode(error), message: gitHistoryError(error) };
      this.#syncMainPreview();
      this.#announce(`Changes could not load for ${name}`);
    }
  }

  #closePreviewMarket(restoreFocus: boolean): void {
    this.#surfaceOpacity.close();
    this.#closeStartupTransition();
    this.#closeBlinkingSquares();
    this.#closePixelSculpt();
    this.#closeCloudTrain();
    this.#closeMountain();
    this.#closeMilkyWaySettings(false);
    this.#closeParticleSettings(false);
    this.#closeBlackHoleSettings(false);
    this.#closeGlowHorizonSettings(false);
    this.#closeHeavenlyCloudSettings(false);
    this.#closeAuroraIonosphereSettings(false);
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

  #prepareDownloadedPluginAction(id:string,intent:'enable'|'settings'):void {
    if(intent!=='enable')return;
    if(id.endsWith('-preview'))this.#enabledPreviewers.delete(`code-codex.${id}`);
    else if(id!=='surface-opacity'&&id!=='codex-startup-transition'&&id!=='git-history') {
      this.#enabledAppearancePlugins.delete(id==='transparent-background'?'code-codex.transparent-background':`code-codex.${id==='mountain'?'layered-mountain':id}-background`);
    }
  }

  #backgroundPackageMarket: BackgroundPackageMarket | undefined;

  #renderPreviewMarket(): void {
    this.#surfaceOpacity.render();
    this.#renderStartupTransition();
    this.#renderBlinkingSquares();
    this.#renderPixelSculpt();
    this.#renderCloudTrain();
    this.#renderMountain();
    this.#renderAppearancePlugin();
    this.#renderParticleBackgroundPlugin();
    this.#renderBlackHoleBackgroundPlugin();
    this.#renderGlowHorizonBackgroundPlugin();
    this.#renderHeavenlyCloudBackgroundPlugin();
    this.#renderAuroraIonosphereBackgroundPlugin();
    this.#renderMilkyWayBackgroundPlugin();
    for (const previewer of PREVIEWER_DEFINITIONS) {
      const enabled = this.#enabledPreviewers.has(previewer.id);
      const status = this.#previewerStatuses.get(previewer.id);
      const button = this.#previewerButtons.get(previewer.id);
      if (!status || !button) continue;
      status.textContent = enabled ? "Enabled" : "Disabled";
      status.dataset.enabled = String(enabled);
      button.textContent = enabled ? "Disable" : "Enable";
      button.dataset.enabled = String(enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${previewer.title}`);
    }
    this.#backgroundPackageMarket?.render();
  }

  #renderAppearancePlugin(): void {
    this.#backgroundPackageMarket?.queueRender();
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
      || this.#heavenlyCloudBackgroundController.pending
      || this.#auroraIonosphereBackgroundController.pending
      || this.#milkyWayBackgroundController.pending
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
    this.#updateInstallPending = false;
    this.#updateCandidate = undefined;
    this.#closeUpdateDialog(false);
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

    this.#closeUpdateDialog(false);
    this.#updateCandidate = undefined;
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
        this.#updateCheckSummary = `Code-Codex v${result.latestVersion} is available. You are using v${result.currentVersion}.`;
        this.#hideActionNotice();
        this.#openUpdateDialog(result);
      } else if (result.status === "ahead") {
        this.#updateCheckSummary = `This build (v${result.currentVersion}) is newer than GitHub’s latest published release (v${result.latestVersion}).`;
        this.#showActionNotice(this.#updateCheckSummary);
      } else {
        this.#updateCheckSummary = `Code-Codex v${result.currentVersion} is up to date.`;
        this.#showActionNotice(this.#updateCheckSummary);
      }
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

  #openUpdateDialog(result: UpdateCheckResult): void {
    this.#closePreviewMarket(false);
    this.#updateCandidate = result;
    this.#updateDialogOpen = true;
    this.#updateMessage.textContent = `v${result.latestVersion} is available. You are using v${result.currentVersion}.`;
    this.#updatePopover.hidden = false;
    this.#statusCode.setAttribute("aria-expanded", "true");
    this.#renderUpdateDialog();
    queueMicrotask(() => {
      if (this.#updateDialogOpen && !this.#updateInstallPending) this.#updateInstallButton.focus();
    });
  }

  #closeUpdateDialog(restoreFocus: boolean): void {
    if (this.#updateInstallPending) return;
    if (!this.#updateDialogOpen && this.#updatePopover.hidden) return;
    this.#updateDialogOpen = false;
    this.#updatePopover.hidden = true;
    this.#statusCode.setAttribute("aria-expanded", "false");
    if (restoreFocus && this.#statusCode.isConnected) this.#statusCode.focus();
  }

  #renderUpdateDialog(): void {
    this.#updateLaterButton.disabled = this.#updateInstallPending;
    this.#updateInstallButton.disabled = this.#updateInstallPending;
    this.#updateInstallButton.textContent = this.#updateInstallPending ? "Preparing…" : "Update";
    this.#updatePopover.setAttribute("aria-busy", String(this.#updateInstallPending));
  }

  async #installUpdate(): Promise<void> {
    const candidate = this.#updateCandidate;
    const bridge = this.#bridge;
    if (!candidate || !bridge?.available || this.#updateInstallPending) return;

    const operation = this.#updateCheckOperation;
    this.#updateInstallPending = true;
    this.#renderUpdateDialog();
    this.#renderStatus();
    this.#showActionProgress(`Downloading and verifying Code-Codex v${candidate.latestVersion}…`);
    try {
      const result = normalizeUpdateInstallResult(await bridge.request<unknown>("explorer.update.install", {
        latestVersion: candidate.latestVersion,
      }));
      if (operation !== this.#updateCheckOperation || !this.#connected || bridge !== this.#bridge) return;
      if (result.latestVersion !== candidate.latestVersion || !result.launched) {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The update installer response was not valid." });
      }
      this.#updateInstallPending = false;
      this.#closeUpdateDialog(false);
      this.#updateCheckSummary = `Code-Codex v${result.latestVersion} setup is open. Finish installation; the running Codex window will activate it automatically.`;
      this.#showActionNotice(this.#updateCheckSummary);
    } catch (error) {
      if (operation !== this.#updateCheckOperation || !this.#connected || bridge !== this.#bridge) return;
      this.#updateCheckSummary = updateInstallError(error);
      this.#showActionNotice(this.#updateCheckSummary, "error");
    } finally {
      if (operation === this.#updateCheckOperation) {
        this.#updateInstallPending = false;
        this.#renderUpdateDialog();
        this.#renderStatus();
      }
    }
  }

  #renderStatus(): void {
    const versionVisible = this.#state === "ready" || this.#state === "empty" || this.#state === "no-project";
    this.#statusCode.textContent = versionVisible ? `v${__CODE_CODEX_VERSION__}` : this.#state.toUpperCase().slice(0, 8);
    this.#statusCode.disabled = !versionVisible || this.#updateCheckPending || this.#updateInstallPending;
    this.#statusCode.dataset.updateState = versionVisible ? this.#updateCheckPresentation : "idle";
    this.#statusCode.setAttribute("aria-busy", String(versionVisible && (this.#updateCheckPending || this.#updateInstallPending)));
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
    // Only Code-Codex notices, never native conversation or form contents.
    runtimeEvent("renderer", "action notice", tone, {message:message.slice(0,1000)});
    this.#hideActionNotice();
    this.#actionNotice.textContent = message;
    this.#actionNotice.dataset.tone = tone;
    this.#actionNotice.hidden = false;
    this.#presentActionNotice();
    this.#announce(message);
    this.#actionNoticeTimer = setTimeout(() => this.#hideActionNotice(), ACTION_NOTICE_DURATION_MS);
  }

  #showActionProgress(message: string): void {
    if (!this.#actionNotice.hidden && this.#actionNotice.dataset.tone === "progress") {
      this.#actionNotice.textContent = message;
      this.#presentActionNotice();
      return;
    }
    this.#hideActionNotice();
    this.#actionNotice.textContent = message;
    this.#actionNotice.dataset.tone = "progress";
    this.#actionNotice.hidden = false;
    this.#presentActionNotice();
    this.#announce(message);
  }

  #presentActionNotice(): void {
    if (!this.#actionNotice.isConnected) return;
    // Reinsert at the end of the top layer so even an open settings popover
    // cannot obscure a newly generated message.
    if (this.#actionNotice.matches(":popover-open")) this.#actionNotice.hidePopover();
    this.#actionNotice.showPopover();
    const anchor = this.#previewMarketOpen ? this.#previewMarketPopover : this;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(160, Math.min(rect.width - 16, window.innerWidth - 24));
    this.#actionNotice.style.width = `${width}px`;
    this.#actionNotice.style.left = `${Math.max(12, Math.min(rect.left + 8, window.innerWidth - width - 12))}px`;
    const height = this.#actionNotice.getBoundingClientRect().height;
    this.#actionNotice.style.top = `${Math.max(12, Math.min(rect.bottom - (this.#previewMarketOpen ? 8 : 36) - height, window.innerHeight - height - 12))}px`;
  }

  #hideActionNotice(): void {
    if (this.#actionNoticeTimer) clearTimeout(this.#actionNoticeTimer);
    this.#actionNoticeTimer = undefined;
    if (this.#actionNotice.matches(":popover-open")) this.#actionNotice.hidePopover();
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

function normalizeUpdateInstallResult(raw: unknown): UpdateInstallResult {
  const object = asRecord(raw);
  if (
    !object
    || Object.keys(object).length !== 2
    || typeof object.latestVersion !== "string"
    || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(object.latestVersion)
    || object.launched !== true
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST", message: "The update installer response was not valid." });
  }
  return { latestVersion: object.latestVersion, launched: true };
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

function updateInstallError(error: unknown): string {
  const code = errorCode(error);
  if (code === "UPDATE_NO_LONGER_AVAILABLE") return "The selected update is no longer the latest. Check again.";
  if (code === "UPDATE_ASSET_UNAVAILABLE") return "The latest GitHub release does not contain a verified Windows setup program.";
  if (code === "UPDATE_DOWNLOAD_FAILED") return "The update could not be downloaded from GitHub. Check your connection and try again.";
  if (code === "UPDATE_VERIFY_FAILED") return "The downloaded update failed integrity verification and was not opened.";
  if (code === "UPDATE_LAUNCH_FAILED") return "The update was verified, but Windows could not open the setup program.";
  if (code === "UPDATE_INSTALL_BUSY") return "Another Code-Codex update is already being prepared.";
  if (code === "UPDATE_INSTALL_UNSUPPORTED") return "Automatic updates are supported on Windows only.";
  if (code === "UPDATE_CHECK_RATE_LIMITED") return "GitHub’s update-check limit was reached. Try again later.";
  if (code === "NO_BRIDGE" || code === "CANCELLED") return "Code-Codex disconnected before the update was ready.";
  return "The Code-Codex update could not be prepared. Try again later.";
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
