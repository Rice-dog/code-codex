// constants responsibility; original state keys, defaults and lifecycle retained.
import { AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_PLUGIN_ID,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID } from "../core/configuration/explorer";
import { POWERPOINT_FULL_FIDELITY_NOTICE } from "../core/preview/configuration";
import { type MainPreviewFileView, type MainPreviewLineEnding, type MainPreviewModelResource } from "../file-preview/contracts";
import {
  type ParticleImageTransform,
  type ParticleMorphCurve
} from "../particle-image-startup";
import {
  BlackHoleBackgroundSettings,
  GlowHorizonBackgroundSettings,
  HeavenlyCloudBackgroundSettings
} from "../startup-background-renderers";
import { type BootstrapConfig,type FlatTreeRow } from "./bridge";



export type MediaPreviewKind="image"|"video"|"pdf"|"audio"|"office"|"notebook"|"model";



export interface PreviewerDefinition {
  readonly id: string;
  readonly kind: "markdown"|"csv"|"diagram"|MediaPreviewKind;
  readonly title: string;
  readonly iconFileName: string;
  readonly extensions: readonly string[];
}



export interface MediaPreviewRoute {
  readonly previewerId: string;
  readonly kind: MediaPreviewKind;
  readonly mimeTypes: readonly string[];
  readonly maxBytes: number;
}



export type StateCopy={ title: string; copy: string; action?: string };


export type PreviewUnavailableReason="binary"|"invalid-utf8"|"sensitive"|"previewer-disabled"|"unsupported-type"|"unknown";


export type UpdateCheckStatus="upToDate"|"updateAvailable"|"ahead";


export type UpdateCheckPresentation="idle"|"checking"|"upToDate"|"updateAvailable"|"ahead"|"error";


export type PreviewMarketCategory="appearance"|"file-preview"|"developer-tools";



export interface UpdateCheckResult {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly status: UpdateCheckStatus;
  readonly tagName: string;
  readonly releaseUrl: string;
}



export interface UpdateInstallResult {
  readonly latestVersion: string;
  readonly launched: boolean;
  readonly windowReady: boolean;
}



export interface GitCommitSummary {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly authoredAt: string;
  readonly subject: string;
}



export interface GitHistoryResult {
  readonly branch: string;
  readonly detached: boolean;
  readonly commits: readonly GitCommitSummary[];
  readonly hasMore: boolean;
}



export interface GitChangedFile {
  readonly status: string;
  readonly path: string;
  readonly oldPath?: string;
}



export interface GitCommitResult {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly authoredAt: string;
  readonly message: string;
  readonly files: readonly GitChangedFile[];
  readonly filesTruncated: boolean;
}



export interface GitDiffResult {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
}



export interface PreviewTab {
  readonly instanceId: number;
  readonly path: string;
  readonly name: string;
  revision: number;
  timer: ReturnType<typeof setTimeout>|undefined;
  modifiedDuringSave: boolean;
  dirty: boolean;
  view: MainPreviewFileView;
}



export interface NormalizedTextPreview {
  kind: "text";
  text: string;
  sizeBytes: number;
  truncated: boolean;
  editable: boolean;
  version?: string;
  lineEnding?: MainPreviewLineEnding;
}



export interface NormalizedUnsupportedPreview {
  kind: "unsupported";
  sizeBytes: number;
  truncated: boolean;
  reason: PreviewUnavailableReason;
}



export interface NormalizedMediaPreview {
  kind: MediaPreviewKind;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
  previewNotice?: typeof POWERPOINT_FULL_FIDELITY_NOTICE;
  modelVersion?: string;
  modelResources?: readonly MainPreviewModelResource[];
}



export type NormalizedPreview=NormalizedTextPreview|NormalizedUnsupportedPreview|NormalizedMediaPreview;



export interface NormalizedMediaInfo {
  readonly kind: MediaPreviewKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly version: string;
  readonly previewNotice?: typeof POWERPOINT_FULL_FIDELITY_NOTICE;
}



export interface NormalizedModelResourceInfo {
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly version: string;
}



export interface DetachedEditDraft {
  readonly threadId: string;
  readonly path: string;
  readonly name: string;
  readonly draft: string;
  readonly view: MainPreviewFileView;
  readonly bootstrap: Readonly<BootstrapConfig>|undefined;
  readonly expiresAt: number;
}



export type ContextMenuAction=
  |"preview"
  |"new-file"
  |"new-folder"
  |"rename"
  |"delete"
  |"copy-relative"
  |"copy-absolute"
  |"reveal"
  |"refresh";



export interface ContextMenuTarget {
  readonly kind: "root"|"file"|"directory";
  readonly path: string;
  readonly parentPath: string;
  readonly name: string;
  readonly row?: FlatTreeRow;
}



export interface ContextMenuItem {
  readonly action: ContextMenuAction;
  readonly label: string;
  readonly icon: string;
  readonly separatorBefore?: boolean;
  readonly danger?: boolean;
}



export type ContextMenuNameAction="new-file"|"new-folder"|"rename";



export type ContextMenuDialog=
  |{ readonly kind: "name"; readonly action: ContextMenuNameAction; readonly value: string }
  |{ readonly kind: "confirm-delete" }
  |{ readonly kind: "confirm-rename"; readonly value: string };



export interface ContextMenuAnchor {
  readonly clientX: number;
  readonly clientY: number;
}



export interface DragSource {
  readonly path: string;
  readonly parentPath: string;
  readonly name: string;
  readonly kind: "file"|"directory";
}



export interface MarqueeState {
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



export interface ExternalDropCandidate {
  readonly handlePromise?: Promise<FileSystemHandle|null>;
  readonly entry?: FileSystemEntry;
  readonly file?: File;
}



export interface ExternalDropMember {
  readonly relativePath: string;
  readonly kind: "file"|"directory";
  readonly file?: File;
}



export interface ExternalDropRoot {
  readonly name: string;
  readonly kind: "file"|"directory";
  readonly file?: File;
  readonly members: readonly ExternalDropMember[];
  readonly entryCount: number;
  readonly sizeBytes: number;
}



export interface ExternalDropBudget {
  entries: number;
  sizeBytes: number;
}



export interface ExternalImportProgress {
  readonly totalEntries: number;
  readonly totalBytes: number;
  completedEntries: number;
  completedBytes: number;
  lastNoticeAt: number;
}



export interface ExternalDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string,FileSystemHandle]>;
}



export interface ExternalDataTransferItem extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle|null>;
  getAsEntry?: () => FileSystemEntry|null;
}



export type DarkBackgroundPluginId=
  |typeof PARTICLE_BACKGROUND_PLUGIN_ID
  |typeof BLACK_HOLE_BACKGROUND_PLUGIN_ID
  |typeof GLOW_HORIZON_BACKGROUND_PLUGIN_ID
  |typeof HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID
  |typeof AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID
  |typeof MILKY_WAY_BACKGROUND_PLUGIN_ID
  |typeof BLINKING_SQUARES_BACKGROUND_PLUGIN_ID
  |typeof MOUNTAIN_BACKGROUND_PLUGIN_ID
  |typeof PIXEL_SCULPT_BACKGROUND_PLUGIN_ID
  |typeof CLOUD_TRAIN_BACKGROUND_PLUGIN_ID;



export type GlowHorizonNumericSettingKey={
  [Key in keyof GlowHorizonBackgroundSettings]: GlowHorizonBackgroundSettings[Key] extends number? Key:never;
}[keyof GlowHorizonBackgroundSettings];



export type GlowHorizonControlGroup="input"|"downward"|"upward"|"release"|"entrance";



export interface GlowHorizonNumericControlDefinition {
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



export type HeavenlyCloudNumericSettingKey={
  [Key in keyof HeavenlyCloudBackgroundSettings]: HeavenlyCloudBackgroundSettings[Key] extends number? Key:never;
}[keyof HeavenlyCloudBackgroundSettings];



export type HeavenlyCloudControlGroup="field"|"interaction"|"opening";



export interface HeavenlyCloudNumericControlDefinition {
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



export type BackgroundSettingsLanguage="zh"|"en";



export type BlackHolePresetName="cinema"|"lens"|"ember";


export type BlackHoleColorSettingKey="hotColor"|"midColor"|"coolColor";



export type BlackHoleNumericSettingKey={
  [Key in keyof BlackHoleBackgroundSettings]: BlackHoleBackgroundSettings[Key] extends number? Key:never;
}[keyof BlackHoleBackgroundSettings];



export type BlackHoleControlGroup="camera"|"disc"|"light"|"renderer";



export interface BlackHoleNumericControlDefinition {
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



export type ParticleNumericSettingKey=
  |"particleCount"
  |"particleSize"
  |"particleOpacity"
  |"speed"
  |"noiseScale"
  |"noiseStrength"
  |"damping"
  |"ambientCycle"
  |"imageDurationSeconds"
  |"morphIntervalSeconds"
  |"imageOpacity"
  |"cursorStrength"
  |"dprCap"
  |"introDuration"
  |"introSpread";



export type ParticleControlGroup="particles"|"flow"|"source"|"pointer"|"render"|"opening";



export interface ParticleValueControlDefinition {
  readonly id: string;
  readonly label: string;
  readonly labelZh: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly editorScale?: number;
  readonly format: (value: number) => string;
}



export interface ParticleNumericControlDefinition extends ParticleValueControlDefinition {
  readonly key: ParticleNumericSettingKey;
  readonly group: ParticleControlGroup;
  readonly live: boolean;
}



export type ParticleImageTransformKey=keyof ParticleImageTransform;



export interface ParticleImageTransformControlDefinition extends ParticleValueControlDefinition {
  readonly key: ParticleImageTransformKey;
}



export interface ParticleValueControl {
  readonly definition: ParticleValueControlDefinition;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
  readonly editor: HTMLInputElement;
}



export type ParticleMorphCurveHandle="start"|"end";



export type ParticleMorphCurveDragState=
  |{
    readonly pointerId: number;
    readonly kind: "handle";
    readonly handle: ParticleMorphCurveHandle;
    readonly targetElement: SVGGElement;
    readonly originalCurve: ParticleMorphCurve;
  }
  |{
    readonly pointerId: number;
    readonly kind: "node";
    readonly nodeIndex: number;
    readonly targetElement: SVGGElement;
    readonly originalCurve: ParticleMorphCurve;
  };
