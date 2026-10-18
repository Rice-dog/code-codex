// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { GLB_JSON_CHUNK_TYPE,GLB_MAGIC,GLTF_BINARY_PREVIEW_MIME,GLTF_JSON_PREVIEW_MIME,GLTFLOADER_SUPPORTED_REQUIRED_EXTENSIONS,MAX_MODEL_RESOURCE_COUNT,MAX_MODEL_RESOURCE_URI_UNITS,MAX_MODEL_TEXTURE_BYTES,SAFE_MODEL_RESOURCE_MIME_TYPES } from "../../core/preview/configuration";
import type { ModelPreviewSourceInspection } from "../../file-preview/contracts";


export class ModelPreviewSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelPreviewSourceError";
  }
}


export function modelJsonSource(bytes: Uint8Array, mimeType: string): string {
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


export function modelDocument(bytes: Uint8Array, mimeType: string): Record<string, unknown> {
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


export function modelExtensionNames(document: Record<string, unknown>): ReadonlySet<string> {
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


export function requiredModelExtensionNames(document: Record<string, unknown>): readonly string[] {
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


export function decodedModelUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ModelPreviewSourceError("This model contains a malformed resource URI.");
  }
}


export function isModelDataUri(value: string): boolean {
  return value.trimStart().toLowerCase().startsWith("data:");
}


export function validateModelDataUri(value: string): void {
  const match = /^data:([^;,]+);base64,/i.exec(value.trimStart());
  const mimeType = match?.[1]?.toLowerCase();
  if (mimeType === "image/ktx2") {
    throw new ModelPreviewSourceError("KTX2/Basis textures are not supported yet. Export this model with PNG, JPEG, WebP, or AVIF textures.");
  }
  if (!mimeType || !SAFE_MODEL_RESOURCE_MIME_TYPES.has(mimeType)) {
    throw new ModelPreviewSourceError("This model contains an unsupported embedded resource type.");
  }
}


export function validateModelBufferViewImages(document: Record<string, unknown>): number {
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


export function validateExternalModelResourceUri(value: string): void {
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
