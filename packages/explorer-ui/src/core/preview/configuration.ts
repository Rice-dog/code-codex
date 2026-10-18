// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import type { OfficeDocumentKind } from "../../file-preview/contracts";




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


export const GLB_MAGIC = 0x46546c67;


export const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;


export const MAX_MODEL_RESOURCE_URI_UNITS = 2_048;


export const MAX_GLTF_JSON_PREVIEW_BYTES = 16 * 1024 * 1024;


export const MAX_MODEL_PREVIEW_BYTES = 128 * 1024 * 1024;


export const MAX_MODEL_RESOURCE_BYTES = 128 * 1024 * 1024;


export const MAX_MODEL_TEXTURE_BYTES = 32 * 1024 * 1024;


export const MAX_MODEL_AGGREGATE_BYTES = 256 * 1024 * 1024;


export const MAX_MODEL_RESOURCE_COUNT = 256;


export const SAFE_MODEL_RESOURCE_MIME_TYPES = new Set([
  "application/gltf-buffer",
  "application/octet-stream",
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);


export const GLTFLOADER_SUPPORTED_REQUIRED_EXTENSIONS = new Set([
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


export const OFFICE_MIME_TYPES: Readonly<Record<string, OfficeDocumentKind>> = Object.freeze({
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  [NATIVE_POWERPOINT_PREVIEW_MIME]: "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
});


export const CONVERSATION_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.25 3.25h11.5v7.5H7l-3.5 2.5v-2.5H2.25z"/></svg>`;
