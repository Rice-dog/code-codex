// constants responsibility; original state keys, defaults and lifecycle retained.
import { type BlackHoleNumericControlDefinition,type BlackHolePresetName,type GlowHorizonNumericControlDefinition,type HeavenlyCloudNumericControlDefinition,type MediaPreviewRoute,type ParticleImageTransformControlDefinition,type ParticleNumericControlDefinition,type PreviewerDefinition } from "../../contracts/explorer-model";
import { AUDIO_PREVIEWER_ID, CSV_PREVIEWER_ID, DIAGRAM_PREVIEWER_ID, GLTF_BINARY_PREVIEW_MIME, GLTF_JSON_PREVIEW_MIME, IMAGE_PREVIEWER_ID, MARKDOWN_PREVIEWER_ID, MAX_GLTF_JSON_PREVIEW_BYTES, MAX_MODEL_PREVIEW_BYTES, MODEL_PREVIEWER_ID, NATIVE_POWERPOINT_PREVIEW_MIME, NOTEBOOK_PREVIEWER_ID, OFFICE_PREVIEWER_ID, PDF_PREVIEWER_ID, VIDEO_PREVIEWER_ID } from "../preview/configuration";
import {
  PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH
} from "../../particle-image-startup";
import {
  AuroraIonosphereNumericControlDefinition,
  BlackHoleBackgroundSettings,
  DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS
} from "../../startup-background-renderers";
import { type ExplorerSettings } from "../../contracts/bridge";






export const OVERSCAN=8;


export const PAGE_SIZE=500;


export const MARQUEE_LONG_PRESS_MS=280;


export const MARQUEE_MOVE_THRESHOLD_PX=4;


export const BOOTSTRAP_RETRY_DELAY_MS=180;


export const PREVIEW_SELECTION_DELAY_MS=120;


export const MAX_PREVIEW_TEXT_UNITS=65_536;


export const MAX_PREVIEW_TABS=8;


export const MIN_WIDTH=180;


export const MAX_WIDTH=480;


export const CONTEXT_MENU_WIDTH=208;


export const CONTEXT_MENU_MARGIN=6;


export const CONTEXT_MENU_ITEM_HEIGHT=30;


export const CONTEXT_DIALOG_HEIGHT=164;


export const ACTION_NOTICE_DURATION_MS=2_800;


export const DROP_EXPAND_DELAY_MS=650;


export const INTERNAL_DRAG_TYPE="application/x-code-codex-entry";


export const EXTERNAL_IMPORT_CHUNK_BYTES=48*1024;


export const EXTERNAL_IMPORT_REQUEST_INTERVAL_MS=10;


export const EXTERNAL_IMPORT_COMMIT_TIMEOUT_MS=120_000;


export const MAX_EXTERNAL_IMPORT_ENTRIES=1_024;


export const MAX_EXTERNAL_IMPORT_DEPTH=64;


export const MAX_EXTERNAL_IMPORT_FILE_BYTES=512*1024*1024;


export const MAX_EXTERNAL_IMPORT_TOTAL_BYTES=1024*1024*1024;


export const DEFAULT_SETTINGS: ExplorerSettings={ width: 260,collapsed: false,showHidden: true,showIgnored: true };


export const SETTINGS_KEY="code-codex:ui-settings:v1";


export const PREVIEWER_SETTINGS_KEY="code-codex:previewers:v1";


export const APPEARANCE_PLUGIN_SETTINGS_KEY="code-codex:appearance-plugins:v1";


/*
 * Third-party provenance and Code-Codex modification boundaries for the
 * appearance effects below are documented in THIRD_PARTY_NOTICES_EN.md and
 * THIRD_PARTY_NOTICES_ZH_CN.md. The repository MIT license does not relicense
 * adapted or otherwise protected third-party material. Author references are
 * attribution only and do not imply endorsement of Code-Codex.
 */
export const TRANSPARENT_BACKGROUND_PLUGIN_ID="code-codex.transparent-background";


export const PARTICLE_BACKGROUND_PLUGIN_ID="code-codex.particle-image-background";


export const BLACK_HOLE_BACKGROUND_PLUGIN_ID="code-codex.black-hole-background";


export const GLOW_HORIZON_BACKGROUND_PLUGIN_ID="code-codex.glow-horizon-background";


export const HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID="code-codex.heavenly-cloud-background";


export const AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID="code-codex.aurora-ionosphere-background";


export const MOUNTAIN_BACKGROUND_PLUGIN_ID="code-codex.layered-mountain-background";


export const PIXEL_SCULPT_BACKGROUND_PLUGIN_ID="code-codex.pixel-sculpt-background";


export const CLOUD_TRAIN_BACKGROUND_PLUGIN_ID="code-codex.cloud-train-background";


export const MILKY_WAY_BACKGROUND_PLUGIN_ID="code-codex.milky-way-background";


export const BLINKING_SQUARES_BACKGROUND_PLUGIN_ID="code-codex.blinking-squares-background";


export const APPEARANCE_PLUGIN_IDS=new Set([
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


export const TRANSPARENT_BACKGROUND_ATTRIBUTE="data-code-codex-transparent-background";


export const TRANSPARENT_BACKGROUND_COLOR_PROPERTY="--code-codex-window-background";


export const PARTICLE_BACKGROUND_ATTRIBUTE="data-code-codex-particle-image-background";


export const PARTICLE_BACKGROUND_COLOR_PROPERTY="--code-codex-particle-background";


export const GLOW_HORIZON_BACKGROUND_ATTRIBUTE="data-code-codex-glow-horizon-background";


export const GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY="--code-codex-glow-horizon-background";


export const TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS=1_500;


export const FORCED_COLORS_QUERY="(forced-colors: active)";


export const REDUCED_TRANSPARENCY_QUERY="(prefers-reduced-transparency: reduce)";



export const PARTICLE_BACKGROUND_THEME_LEASE_KEY="code-codex:particle-theme-lease:v1";


export const CODEX_DARK_APPLY_TIMEOUT_MS=5_000;


export const CODEX_APPEARANCE_POLL_INTERVAL_MS=1_500;



export const PARTICLE_BACKGROUND_MAX_IMAGES=32;


export const PARTICLE_BACKGROUND_MAX_IMAGE_BYTES=30*1024*1024;


export const PARTICLE_BACKGROUND_MAX_TOTAL_BYTES=256*1024*1024;



export const PARTICLE_BACKGROUND_ACCEPT="image/png,image/jpeg,image/webp,image/gif,image/avif";


export const PARTICLE_BACKGROUND_IMAGE_TYPES=new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);


export const MAX_MEDIA_CHUNK_BYTES=2*1024*1024;


export const MAX_IMAGE_PREVIEW_BYTES=32*1024*1024;


export const MAX_VIDEO_PREVIEW_BYTES=128*1024*1024;


export const MAX_PDF_PREVIEW_BYTES=64*1024*1024;


export const MAX_AUDIO_PREVIEW_BYTES=128*1024*1024;


export const MAX_OFFICE_PREVIEW_BYTES=64*1024*1024;


export const MAX_NOTEBOOK_PREVIEW_BYTES=16*1024*1024;


export const MODEL_RESOURCE_MIME_TYPES=new Set([
  "application/gltf-buffer",
  "application/octet-stream",
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);



export const PREVIEWER_DEFINITIONS: readonly PreviewerDefinition[]=Object.freeze([
  {
    id: MARKDOWN_PREVIEWER_ID,
    kind: "markdown",
    title: "Markdown Preview",
    iconFileName: "README.md",
    extensions: [".md",".markdown"],
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
    extensions: [".drawio",".plantuml"],
  },
  {
    id: IMAGE_PREVIEWER_ID,
    kind: "image",
    title: "Image Preview",
    iconFileName: "preview.png",
    extensions: [".png",".jpg",".jpeg",".gif",".webp",".bmp",".ico",".avif"],
  },
  {
    id: VIDEO_PREVIEWER_ID,
    kind: "video",
    title: "Video Preview",
    iconFileName: "preview.mp4",
    extensions: [".mp4",".webm",".ogv",".mov",".m4v"],
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
    extensions: [".mp3",".wav",".flac",".m4a",".ogg",".aac"],
  },
  {
    id: OFFICE_PREVIEWER_ID,
    kind: "office",
    title: "Office Preview",
    iconFileName: "preview.docx",
    extensions: [".docx",".xlsx",".ppt",".pptx"],
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
    extensions: [".gltf",".glb"],
  },
]);



export const PREVIEWER_IDS=new Set(PREVIEWER_DEFINITIONS.map((previewer) => previewer.id));


export const MEDIA_PREVIEW_ROUTES: Readonly<Record<string,MediaPreviewRoute>>=Object.freeze({
  png: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/png"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  jpg: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/jpeg"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  jpeg: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/jpeg"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  gif: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/gif"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  webp: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/webp"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  bmp: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/bmp"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  ico: {
    previewerId: IMAGE_PREVIEWER_ID,
    kind: "image",
    mimeTypes: ["image/x-icon","image/vnd.microsoft.icon"],
    maxBytes: MAX_IMAGE_PREVIEW_BYTES,
  },
  avif: { previewerId: IMAGE_PREVIEWER_ID,kind: "image",mimeTypes: ["image/avif"],maxBytes: MAX_IMAGE_PREVIEW_BYTES },
  mp4: { previewerId: VIDEO_PREVIEWER_ID,kind: "video",mimeTypes: ["video/mp4"],maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  webm: { previewerId: VIDEO_PREVIEWER_ID,kind: "video",mimeTypes: ["video/webm"],maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  ogv: { previewerId: VIDEO_PREVIEWER_ID,kind: "video",mimeTypes: ["video/ogg"],maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  mov: { previewerId: VIDEO_PREVIEWER_ID,kind: "video",mimeTypes: ["video/quicktime"],maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  m4v: { previewerId: VIDEO_PREVIEWER_ID,kind: "video",mimeTypes: ["video/mp4","video/x-m4v"],maxBytes: MAX_VIDEO_PREVIEW_BYTES },
  pdf: { previewerId: PDF_PREVIEWER_ID,kind: "pdf",mimeTypes: ["application/pdf"],maxBytes: MAX_PDF_PREVIEW_BYTES },
  mp3: { previewerId: AUDIO_PREVIEWER_ID,kind: "audio",mimeTypes: ["audio/mpeg"],maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  wav: { previewerId: AUDIO_PREVIEWER_ID,kind: "audio",mimeTypes: ["audio/wav"],maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  flac: { previewerId: AUDIO_PREVIEWER_ID,kind: "audio",mimeTypes: ["audio/flac"],maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  m4a: { previewerId: AUDIO_PREVIEWER_ID,kind: "audio",mimeTypes: ["audio/mp4"],maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  ogg: { previewerId: AUDIO_PREVIEWER_ID,kind: "audio",mimeTypes: ["audio/ogg"],maxBytes: MAX_AUDIO_PREVIEW_BYTES },
  aac: { previewerId: AUDIO_PREVIEWER_ID,kind: "audio",mimeTypes: ["audio/aac"],maxBytes: MAX_AUDIO_PREVIEW_BYTES },
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
    mimeTypes: ["application/vnd.ms-powerpoint",NATIVE_POWERPOINT_PREVIEW_MIME],
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


export const DETACHED_EDIT_TTL_MS=10_000;



export const PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP=0.008;


export const PARTICLE_MORPH_CURVE_SVG_NS="http://www.w3.org/2000/svg";


export const PARTICLE_MORPH_CURVE_EDITOR_BOUNDS=Object.freeze({
  width: 240,
  height: 116,
  left: 14,
  right: 226,
  top: 12,
  bottom: 100,
});



export const PARTICLE_NUMERIC_CONTROL_DEFINITIONS=Object.freeze([
  { key: "introDuration",group: "opening",id: "cle-particle-intro-duration",label: "Opening duration",labelZh: "开场时长",minimum: 0.5,maximum: 12,step: 0.1,live: true,format: (value: number) => `${value.toFixed(1)}s` },
  { key: "introSpread",group: "opening",id: "cle-particle-intro-spread",label: "Gathering spread",labelZh: "汇聚范围",minimum: 0.2,maximum: 2,step: 0.05,live: true,format: (value: number) => `${value.toFixed(2)}×` },
  { key: "particleCount",group: "particles",id: "cle-particle-count",label: "Particle count",labelZh: "粒子数量",minimum: 10_000,maximum: 2_000_000,step: 10_000,live: false,format: (value: number) => Math.round(value).toLocaleString() },
  { key: "particleSize",group: "particles",id: "cle-particle-size",label: "Particle size",labelZh: "粒子大小",minimum: 0.5,maximum: 4,step: 0.1,live: true,format: (value: number) => value.toFixed(1) },
  { key: "particleOpacity",group: "particles",id: "cle-particle-opacity",label: "Particle opacity",labelZh: "粒子不透明度",minimum: 0.1,maximum: 1,step: 0.01,live: true,format: (value: number) => value.toFixed(2) },
  { key: "speed",group: "flow",id: "cle-particle-speed",label: "Speed",labelZh: "速度",minimum: 0,maximum: 2,step: 0.05,live: true,format: (value: number) => value.toFixed(2) },
  { key: "noiseScale",group: "flow",id: "cle-particle-noise-scale",label: "Noise scale",labelZh: "噪声尺度",minimum: 0.0001,maximum: 0.002,step: 0.0001,live: true,format: (value: number) => value.toFixed(4) },
  { key: "noiseStrength",group: "flow",id: "cle-particle-noise-strength",label: "Noise strength",labelZh: "噪声强度",minimum: 0,maximum: 0.15,step: 0.005,live: true,format: (value: number) => value.toFixed(3) },
  { key: "damping",group: "flow",id: "cle-particle-damping",label: "Damping",labelZh: "阻尼",minimum: 0.8,maximum: 0.9999,step: 0.0001,live: true,format: (value: number) => value.toFixed(4) },
  { key: "ambientCycle",group: "flow",id: "cle-particle-ambient-cycle",label: "Ambient cycle",labelZh: "环境循环",minimum: 40,maximum: 500,step: 10,live: true,format: (value: number) => String(Math.round(value)) },
  { key: "imageDurationSeconds",group: "source",id: "cle-particle-image-duration",label: "Image duration",labelZh: "图片显示时长",minimum: 1,maximum: 60,step: 1,live: true,format: (value: number) => `${Math.round(value)}s` },
  { key: "morphIntervalSeconds",group: "source",id: "cle-particle-morph-interval",label: "Morph interval",labelZh: "变形间隔",minimum: 1,maximum: 12,step: 0.1,live: true,format: (value: number) => `${value.toFixed(1)}s` },
  { key: "imageOpacity",group: "source",id: "cle-particle-image-opacity",label: "Image opacity",labelZh: "图片不透明度",minimum: 0,maximum: 1,step: 0.01,live: true,format: (value: number) => value.toFixed(2) },
  { key: "cursorStrength",group: "pointer",id: "cle-particle-cursor-strength",label: "Cursor strength",labelZh: "鼠标强度",minimum: 0,maximum: PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH,step: 0.01,live: true,format: (value: number) => value.toFixed(2) },
  { key: "dprCap",group: "render",id: "cle-particle-dpr-cap",label: "DPR cap",labelZh: "像素比上限",minimum: 1,maximum: 2,step: 0.25,live: true,format: (value: number) => value.toFixed(2) },
] satisfies readonly ParticleNumericControlDefinition[]);



export const PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS=Object.freeze([
  { key: "positionX",id: "cle-particle-image-position-x",label: "Position X",labelZh: "水平位置",minimum: 0,maximum: 100,step: 1,format: (value: number) => `${Math.round(value)}%` },
  { key: "positionY",id: "cle-particle-image-position-y",label: "Position Y",labelZh: "垂直位置",minimum: 0,maximum: 100,step: 1,format: (value: number) => `${Math.round(value)}%` },
  { key: "zoom",id: "cle-particle-image-zoom",label: "Zoom",labelZh: "缩放",minimum: 0.25,maximum: 4,step: 0.05,editorScale: 100,format: (value: number) => `${Math.round(value*100)}%` },
] satisfies readonly ParticleImageTransformControlDefinition[]);



export const BLACK_HOLE_BACKGROUND_PRESETS: Readonly<Record<BlackHolePresetName,BlackHoleBackgroundSettings>>=Object.freeze({
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



export const BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS=Object.freeze([
  { key: "distance",group: "camera",id: "cle-black-hole-distance",label: "Distance",labelZh: "距离",hint: "Camera distance in horizon radii",hintZh: "以视界半径为单位的相机距离",minimum: 10,maximum: 40,step: 0.5,unit: " rH" },
  { key: "elevation",group: "camera",id: "cle-black-hole-elevation",label: "Elevation",labelZh: "仰角",hint: "Angle above the accretion disc",hintZh: "相对于吸积盘的角度",minimum: -30,maximum: 30,step: 0.5,unit: "deg" },
  { key: "azimuth",group: "camera",id: "cle-black-hole-azimuth",label: "Azimuth",labelZh: "方位角",hint: "Position around the black hole",hintZh: "黑洞周围的位置",minimum: -180,maximum: 180,step: 1,unit: "deg" },
  { key: "roll",group: "camera",id: "cle-black-hole-roll",label: "Roll",labelZh: "滚转",hint: "Disc angle across the frame",hintZh: "吸积盘在画面中的倾斜角",minimum: -45,maximum: 45,step: 1,unit: "deg" },
  { key: "fov",group: "camera",id: "cle-black-hole-fov",label: "Field of view",labelZh: "视野",hint: "Vertical camera field of view",hintZh: "垂直相机视野",minimum: 25,maximum: 75,step: 1,unit: "deg" },
  { key: "orbitSpeed",group: "camera",id: "cle-black-hole-orbit-speed",label: "Orbit drift",labelZh: "轨道漂移",hint: "Camera movement in degrees per second",hintZh: "相机每秒移动的角度",minimum: -8,maximum: 8,step: 0.1,unit: "deg/s" },
  { key: "diskInner",group: "disc",id: "cle-black-hole-disk-inner",label: "Inner edge",labelZh: "内边缘",hint: "Closest stable gas orbit",hintZh: "气体可保持的最近稳定轨道",minimum: 1.2,maximum: 6,step: 0.1,unit: " rH" },
  { key: "diskOuter",group: "disc",id: "cle-black-hole-disk-outer",label: "Outer edge",labelZh: "外边缘",hint: "Disc radius",hintZh: "吸积盘半径",minimum: 8,maximum: 24,step: 0.5,unit: " rH" },
  { key: "diskThickness",group: "disc",id: "cle-black-hole-disk-thickness",label: "Thickness",labelZh: "厚度",hint: "Gas depth at the inner rim",hintZh: "内缘处的气体深度",minimum: 0.05,maximum: 0.8,step: 0.01 },
  { key: "diskDensity",group: "disc",id: "cle-black-hole-disk-density",label: "Density",labelZh: "密度",hint: "Opacity of the gas",hintZh: "气体不透明度",minimum: 0.1,maximum: 2,step: 0.05 },
  { key: "brightness",group: "disc",id: "cle-black-hole-brightness",label: "Emission",labelZh: "发射",hint: "Light emitted before tone mapping",hintZh: "色调映射前的气体亮度",minimum: 0.2,maximum: 2,step: 0.05 },
  { key: "spinSpeed",group: "disc",id: "cle-black-hole-spin-speed",label: "Spin",labelZh: "自转",hint: "Inner-rim turns per second",hintZh: "内缘每秒旋转圈数",minimum: 0,maximum: 0.2,step: 0.005,unit: " t/s" },
  { key: "grain",group: "disc",id: "cle-black-hole-grain",label: "Turbulence",labelZh: "湍流",hint: "Scale of gas detail",hintZh: "气体细节尺度",minimum: 0.1,maximum: 1.2,step: 0.02 },
  { key: "doppler",group: "disc",id: "cle-black-hole-doppler",label: "Doppler beaming",labelZh: "多普勒束射",hint: "Relativistic color and brightness shift",hintZh: "相对论颜色与亮度偏移",minimum: 0,maximum: 1,step: 0.05,percent: true },
  { key: "starBrightness",group: "light",id: "cle-black-hole-star-brightness",label: "Lensed stars",labelZh: "透镜星光",hint: "Brightness of the background sky",hintZh: "背景天空的亮度",minimum: 0,maximum: 2,step: 0.05 },
  { key: "glow",group: "light",id: "cle-black-hole-glow",label: "Bloom",labelZh: "辉光",hint: "Halo around bright gas",hintZh: "明亮气体周围的光晕",minimum: 0,maximum: 2,step: 0.05 },
  { key: "exposure",group: "light",id: "cle-black-hole-exposure",label: "Exposure",labelZh: "曝光",hint: "Intensity entering the tone curve",hintZh: "进入色调曲线的强度",minimum: 0.25,maximum: 1.8,step: 0.05 },
  { key: "vignette",group: "light",id: "cle-black-hole-vignette",label: "Vignette",labelZh: "暗角",hint: "Darkening at the corners",hintZh: "画面角落的变暗程度",minimum: 0,maximum: 1,step: 0.01,percent: true },
  { key: "steps",group: "renderer",id: "cle-black-hole-steps",label: "Ray steps",labelZh: "光线步数",hint: "Integration steps per pixel",hintZh: "每个像素的积分步数",minimum: 120,maximum: 460,step: 10 },
  { key: "resolution",group: "renderer",id: "cle-black-hole-resolution",label: "Render scale",labelZh: "渲染比例",hint: "Canvas resolution before upscaling",hintZh: "放大前的画布分辨率",minimum: 0.4,maximum: 1,step: 0.05,percent: true },
  { key: "maxDpr",group: "renderer",id: "cle-black-hole-max-dpr",label: "Pixel ratio cap",labelZh: "像素比例上限",hint: "Maximum device pixel density",hintZh: "设备像素密度上限",minimum: 1,maximum: 2.5,step: 0.25 },
] satisfies readonly BlackHoleNumericControlDefinition[]);



export const GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS=Object.freeze([
  { key: "wheelSensitivity",group: "input",id: "cle-glow-wheel-sensitivity",label: "Wheel strength",labelZh: "滚轮力度",minimum: 0.35,maximum: 1.8,step: 0.05,precision: 2 },
  { key: "wheelTravelScale",group: "input",id: "cle-glow-wheel-travel",label: "Gesture distance",labelZh: "滑动行程",minimum: 0.65,maximum: 1.6,step: 0.05,unit: "×",precision: 2 },
  { key: "wheelDownIntensity",group: "downward",id: "cle-glow-down-intensity",label: "Downward intensity",labelZh: "下滑强度",minimum: 0,maximum: 2,step: 0.05,unit: "×",precision: 2 },
  { key: "wheelDownDistance",group: "downward",id: "cle-glow-down-distance",label: "Downward rewind",labelZh: "下滑回退",minimum: 20,maximum: 100,step: 5,unit: "%",precision: 0 },
  { key: "wheelUpIntensity",group: "upward",id: "cle-glow-up-intensity",label: "Upward intensity",labelZh: "上滑强度",minimum: 0,maximum: 4,step: 0.05,unit: "×",precision: 2 },
  { key: "wheelUpDistance",group: "upward",id: "cle-glow-up-distance",label: "Upward travel",labelZh: "上滑位移",minimum: 3,maximum: 36,step: 1,unit: "%",precision: 0 },
  { key: "wheelUpTrailDistance",group: "upward",id: "cle-glow-up-trail-distance",label: "Trail length",labelZh: "拖光长度",minimum: 4,maximum: 42,step: 1,unit: "%",precision: 0 },
  { key: "wheelUpTrailStrength",group: "upward",id: "cle-glow-up-trail-strength",label: "Trail strength",labelZh: "拖光强度",minimum: 0,maximum: 2,step: 0.05,unit: "×",precision: 2 },
  { key: "wheelUpStiffness",group: "upward",id: "cle-glow-up-stiffness",label: "Upward response",labelZh: "上滑响应",minimum: 180,maximum: 900,step: 10,precision: 0 },
  { key: "wheelUpDamping",group: "upward",id: "cle-glow-up-damping",label: "Upward damping",labelZh: "上滑阻尼",minimum: 18,maximum: 48,step: 1,precision: 0 },
  { key: "wheelReleaseDelay",group: "release",id: "cle-glow-release-delay",label: "Down release delay",labelZh: "下滑释放延迟",minimum: 40,maximum: 220,step: 10,unit: "ms",precision: 0 },
  { key: "wheelUpReleaseDelay",group: "release",id: "cle-glow-up-release-delay",label: "Up release delay",labelZh: "上滑释放延迟",minimum: 40,maximum: 240,step: 10,unit: "ms",precision: 0 },
  { key: "maxReleaseVelocity",group: "release",id: "cle-glow-momentum",label: "Momentum limit",labelZh: "惯性速度上限",minimum: 0.8,maximum: 5,step: 0.1,unit: "×",precision: 1 },
  { key: "returnStiffness",group: "release",id: "cle-glow-return-stiffness",label: "Return tension",labelZh: "回弹张力",minimum: 60,maximum: 180,step: 5,precision: 0 },
  { key: "returnDamping",group: "release",id: "cle-glow-return-damping",label: "Return damping",labelZh: "回弹阻尼",minimum: 10,maximum: 30,step: 1,precision: 0 },
  { key: "openingDuration",group: "entrance",id: "cle-glow-opening-duration",label: "Opening duration",labelZh: "开场时长",minimum: 0.8,maximum: 4,step: 0.1,unit: "s",precision: 1 },
  { key: "initialStretch",group: "entrance",id: "cle-glow-initial-stretch",label: "Initial stretch",labelZh: "初始拉伸",minimum: 1,maximum: 1.8,step: 0.05,unit: "×",precision: 2 },
  { key: "initialBlur",group: "entrance",id: "cle-glow-initial-blur",label: "Initial blur",labelZh: "初始模糊",minimum: 0,maximum: 30,step: 1,unit: "px",precision: 0 },
] satisfies readonly GlowHorizonNumericControlDefinition[]);



export const HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS=Object.freeze([
  { key: "speed",group: "field",id: "cle-heavenly-cloud-speed",label: "Forward drift",labelZh: "前进速度",minimum: 0,maximum: 2,step: 0.01,unit: "×",precision: 2 },
  { key: "intensity",group: "field",id: "cle-heavenly-cloud-intensity",label: "Light density",labelZh: "光雾密度",minimum: 0.3,maximum: 2.4,step: 0.05,unit: "×",precision: 2 },
  { key: "turbulence",group: "field",id: "cle-heavenly-cloud-turbulence",label: "Turbulence",labelZh: "湍流强度",minimum: 0.35,maximum: 1.65,step: 0.01,unit: "×",precision: 2 },
  { key: "radius",group: "field",id: "cle-heavenly-cloud-radius",label: "Tunnel radius",labelZh: "隧道半径",minimum: 1.8,maximum: 4.6,step: 0.05,precision: 2 },
  { key: "colorShift",group: "field",id: "cle-heavenly-cloud-color-shift",label: "Spectral shift",labelZh: "光谱偏移",minimum: -3.14,maximum: 3.14,step: 0.01,precision: 2 },
  { key: "pointerInfluence",group: "interaction",id: "cle-heavenly-cloud-pointer",label: "Pointer steering",labelZh: "指针引导",minimum: 0,maximum: 1.2,step: 0.05,unit: "×",precision: 2 },
  { key: "introDuration",group: "opening",id: "cle-heavenly-cloud-intro-duration",label: "Opening duration",labelZh: "开场时长",minimum: 0.8,maximum: 5,step: 0.1,unit: "s",precision: 1 },
  { key: "introFeather",group: "opening",id: "cle-heavenly-cloud-intro-feather",label: "Aperture feather",labelZh: "圆形边缘羽化",minimum: 0.02,maximum: 0.8,step: 0.01,precision: 2 },
] satisfies readonly HeavenlyCloudNumericControlDefinition[]);



export const AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS=Object.freeze([
  { key: "hue",group: "field",id: "cle-aurora-ionosphere-hue",label: "Aurora hue",labelZh: "极光色相",minimum: -180,maximum: 180,step: 1,unit: "°",precision: 0 },
  { key: "saturation",group: "field",id: "cle-aurora-ionosphere-saturation",label: "Aurora saturation",labelZh: "极光饱和度",minimum: 0,maximum: 2,step: 0.01,unit: "×",precision: 2 },
  { key: "speed",group: "field",id: "cle-aurora-ionosphere-speed",label: "Drift speed",labelZh: "漂移速度",minimum: 0,maximum: 3,step: 0.01,unit: "×",precision: 2 },
  { key: "intensity",group: "field",id: "cle-aurora-ionosphere-intensity",label: "Aurora intensity",labelZh: "极光强度",minimum: 0,maximum: 3,step: 0.01,unit: "×",precision: 2 },
  { key: "curtainScale",group: "field",id: "cle-aurora-ionosphere-curtain-scale",label: "Curtain density",labelZh: "光幕密度",minimum: 0.05,maximum: 2,step: 0.01,precision: 2 },
  { key: "turbulence",group: "field",id: "cle-aurora-ionosphere-turbulence",label: "Turbulence",labelZh: "湍流扰动",minimum: 0,maximum: 1.8,step: 0.01,precision: 2 },
  { key: "glow",group: "field",id: "cle-aurora-ionosphere-glow",label: "Ion glow",labelZh: "离子辉光",minimum: 0,maximum: 2.4,step: 0.01,precision: 2 },
  { key: "starDensity",group: "field",id: "cle-aurora-ionosphere-star-density",label: "Star field",labelZh: "星尘数量",minimum: 0,maximum: 1.5,step: 0.01,precision: 2 },
  { key: "introDuration",group: "opening",id: "cle-aurora-ionosphere-intro-duration",label: "Opening duration",labelZh: "开场时长",minimum: 0.6,maximum: 6,step: 0.05,unit: "s",precision: 2 },
  { key: "introFeather",group: "opening",id: "cle-aurora-ionosphere-intro-feather",label: "Reveal feather",labelZh: "揭示羽化",minimum: 0.03,maximum: 0.4,step: 0.01,precision: 2 },
  { key: "introStart",group: "opening",id: "cle-aurora-ionosphere-intro-start",label: "Curtain origin",labelZh: "光幕起点",minimum: -0.5,maximum: 0.25,step: 0.01,precision: 2 },
  { key: "introEnd",group: "opening",id: "cle-aurora-ionosphere-intro-end",label: "Curtain finish",labelZh: "光幕终点",minimum: 0.8,maximum: 1.8,step: 0.01,precision: 2 },
  { key: "introSkyEnd",group: "opening",id: "cle-aurora-ionosphere-intro-sky-end",label: "Sky reveal",labelZh: "天空显现",minimum: 0.1,maximum: 0.9,step: 0.01,precision: 2 },
  { key: "introStarStart",group: "opening",id: "cle-aurora-ionosphere-intro-star-start",label: "Star delay",labelZh: "星尘延迟",minimum: 0,maximum: 0.8,step: 0.01,precision: 2 },
] satisfies readonly AuroraIonosphereNumericControlDefinition[]);
