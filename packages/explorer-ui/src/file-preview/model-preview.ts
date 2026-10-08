import { ACESFilmicToneMapping, AnimationMixer, Box3, BufferGeometry, Cache, DirectionalLight, GridHelper, Group, HemisphereLight, LoadingManager, PerspectiveCamera, Scene, SRGBColorSpace, Texture, TextureLoader, Vector3, WebGLRenderer, type Material, type Object3D } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { ModelPreviewSourceInspection, MainPreviewModelView, ModelPreviewJob } from './contracts';
export const GLTF_JSON_PREVIEW_MIME = "model/gltf+json";

export const GLTF_BINARY_PREVIEW_MIME = "model/gltf-binary";

const GLB_MAGIC = 0x46546c67;

const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

const MAX_MODEL_RESOURCE_URI_UNITS = 2_048;

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

let nextModelMemoryScopeId = 0;

let activeModelMemoryScopes = 0;

let modelCacheWasEnabled = false;

class ModelMemoryCacheScope {
  readonly _window: Window & typeof globalThis;
  readonly _prefix: string;
  readonly _cacheKeys = new Set<string>();
  readonly _virtualUrls = new Set<string>();
  readonly _objectUrls = new Set<string>();
  _nextResourceId = 0;
  _active = true;

  constructor(window: Window & typeof globalThis) {
    this._window = window;
    if (activeModelMemoryScopes === 0) modelCacheWasEnabled = Cache.enabled;
    activeModelMemoryScopes += 1;
    Cache.enabled = true;
    const id = `${Date.now().toString(36)}-${(++nextModelMemoryScopeId).toString(36)}`;
    this._prefix = `code-codex-model-memory:${id}/`;
  }

  registerBuffer(bytes: Uint8Array): string {
    this._assertActive();
    const url = `${this._prefix}${(++this._nextResourceId).toString(36)}`;
    const cacheKey = `file:${url}`;
    const buffer = bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : new Uint8Array(bytes).buffer;
    Cache.add(cacheKey, buffer);
    this._cacheKeys.add(cacheKey);
    this._virtualUrls.add(url);
    return url;
  }

  registerImage(bytes: Uint8Array, mimeType: string): string {
    this._assertActive();
    const urlApi = this._window.URL;
    if (typeof urlApi.createObjectURL !== "function") {
      throw new ModelPreviewSourceError("This Codex build cannot prepare local model textures.");
    }
    const buffer = bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : new Uint8Array(bytes).buffer;
    const url = urlApi.createObjectURL(new this._window.Blob([buffer], { type: mimeType }));
    this._objectUrls.add(url);
    return url;
  }

  owns(url: string): boolean {
    return this._virtualUrls.has(url) || this._objectUrls.has(url);
  }

  release(): void {
    if (!this._active) return;
    this._active = false;
    for (const cacheKey of this._cacheKeys) Cache.remove(cacheKey);
    for (const url of this._objectUrls) {
      try {
        this._window.URL.revokeObjectURL(url);
      } catch {
        // The owning document may already be torn down.
      }
    }
    this._cacheKeys.clear();
    this._virtualUrls.clear();
    this._objectUrls.clear();
    activeModelMemoryScopes = Math.max(0, activeModelMemoryScopes - 1);
    if (activeModelMemoryScopes === 0) Cache.enabled = modelCacheWasEnabled;
  }

  _assertActive(): void {
    if (!this._active) throw new ModelPreviewSourceError("The 3D model preview was cancelled.");
  }
}

function acquireModelMemoryCacheScope(window: Window & typeof globalThis): ModelMemoryCacheScope {
  return new ModelMemoryCacheScope(window);
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

export const methods = {
  _modelPreview(this: PreviewHost, view: MainPreviewModelView): HTMLElement {
    const container = this.ownerDocument.createElement("div");
    container.className = "model-preview";
    container.setAttribute("aria-label", `3D model preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");

    const toolbar = this.ownerDocument.createElement("div");
    toolbar.className = "model-preview-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "3D model controls");
    const summary = this._textSpan("Preparing glTF 2.0 scene", "model-preview-summary");
    const controlsMount = this.ownerDocument.createElement("div");
    controlsMount.className = "model-preview-actions";
    const createButton = (label: string, title: string): HTMLButtonElement => {
      const button = this.ownerDocument.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.disabled = true;
      return button;
    };
    const fitButton = createButton("Fit", "Fit the complete model in the current view (F)");
    const resetButton = createButton("Reset", "Restore the initial model view (R)");
    const animationButton = createButton("Play", "Play model animation (Space)");
    animationButton.hidden = true;
    animationButton.setAttribute("aria-pressed", "false");
    controlsMount.append(fitButton, resetButton, animationButton);
    toolbar.append(summary, controlsMount);

    const stage = this.ownerDocument.createElement("div");
    stage.className = "model-preview-stage";
    const canvas = this.ownerDocument.createElement("canvas");
    canvas.className = "model-preview-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${view.name} interactive 3D model. Drag to rotate, Shift-drag to pan, and scroll to zoom.`);
    canvas.setAttribute("aria-keyshortcuts", "F R Space");
    const loading = this._textSpan("Loading model\u2026", "model-preview-status");
    loading.setAttribute("role", "status");
    const help = this._textSpan("Drag to rotate \u00b7 Shift-drag to pan \u00b7 Scroll to zoom", "model-preview-help");
    stage.append(canvas, loading, help);
    container.append(toolbar, stage);

    const job: ModelPreviewJob = {
      generation: ++this._modelGeneration,
      abortController: new AbortController(),
      renderer: null,
      controls: null,
      mixer: null,
      modelRoots: [],
      resizeObserver: null,
      animationFrame: null,
      contextLostListener: null,
      loadingManager: null,
      modelMemoryScope: null,
    };
    this._modelJob = job;
    const isCurrent = (): boolean =>
      this._connected &&
      this._modelJob === job &&
      this._modelGeneration === job.generation &&
      !job.abortController.signal.aborted &&
      container.isConnected;

    queueMicrotask(() => {
      void (async () => {
        let parsedScenes: readonly Object3D[] = [];
        try {
          const inspection = inspectModelPreviewSource(view.bytes, view.mimeType);
          const window = this.ownerDocument.defaultView;
          if (!window) throw new ModelPreviewSourceError("This Codex window is no longer available.");
          const memoryScope = acquireModelMemoryCacheScope(window);
          job.modelMemoryScope = memoryScope;
          const resourceUrls = this._prepareModelResources(view, inspection, memoryScope);
          const manager = new LoadingManager();
          job.loadingManager = manager;
          const internalBlobUrls = new Set<string>();
          manager.setURLModifier((requestedUrl) => {
            const embeddedUrl = resourceUrls.get(requestedUrl);
            if (embeddedUrl && isModelDataUri(requestedUrl)) return embeddedUrl;
            if (isModelDataUri(requestedUrl)) {
              throw new ModelPreviewSourceError("This model references an undeclared embedded resource.");
            }
            if (memoryScope.owns(requestedUrl)) return requestedUrl;
            if (/^blob:/i.test(requestedUrl)) {
              if (internalBlobUrls.has(requestedUrl)) return requestedUrl;
              if (internalBlobUrls.size >= inspection.bufferViewImageCount) {
                throw new ModelPreviewSourceError("This model attempted to load an undeclared blob resource.");
              }
              internalBlobUrls.add(requestedUrl);
              return requestedUrl;
            }
            for (const key of this._modelResourceLookupKeys(requestedUrl)) {
              const localUrl = resourceUrls.get(key);
              if (localUrl) return localUrl;
            }
            throw new ModelPreviewSourceError("This model references an undeclared or external resource. Only local files packaged with the model can be loaded.");
          });
          manager.onProgress = (_url, loaded, total) => {
            if (isCurrent()) loading.textContent = `Loading model resources\u2026 ${loaded.toLocaleString()} of ${total.toLocaleString()}`;
          };
          const loader = new GLTFLoader(manager);
          loader.register((parser) => {
            const textureLoader = new TextureLoader(parser.options.manager);
            textureLoader.setCrossOrigin(parser.options.crossOrigin);
            textureLoader.setRequestHeader(parser.options.requestHeader);
            parser.textureLoader = textureLoader;
            return { name: "CODE_CODEX_TEXTURE_LOADER" };
          });
          let gltf: GLTF;
          try {
            gltf = await new Promise<GLTF>((resolve, reject) => {
              try {
                loader.parse(this._arrayBufferFor(view.bytes), "", resolve, reject);
              } catch (error) {
                reject(error);
              }
            });
          } finally {
            if (job.loadingManager === manager) job.loadingManager = null;
            memoryScope.release();
            if (job.modelMemoryScope === memoryScope) job.modelMemoryScope = null;
          }
          parsedScenes = gltf.scenes.length > 0 ? gltf.scenes : [gltf.scene];
          if (!isCurrent()) {
            this._disposeModelObjects(parsedScenes);
            return;
          }

          const visibleGeometryCount = this._visibleModelGeometryCount(gltf.scene);
          if (visibleGeometryCount === 0) {
            throw new ModelPreviewSourceError("This model does not contain visible geometry to preview.");
          }
          gltf.scene.updateMatrixWorld(true);
          const originalBounds = this._visibleModelBounds(gltf.scene);
          if (originalBounds.isEmpty()) {
            throw new ModelPreviewSourceError("This model does not contain measurable geometry to preview.");
          }
          const originalCenter = originalBounds.getCenter(new Vector3());
          const pivot = new Group();
          pivot.add(gltf.scene);
          pivot.position.copy(originalCenter).multiplyScalar(-1);

          const scene = new Scene();
          scene.add(pivot);
          const hemisphere = new HemisphereLight(0xffffff, 0x30343a, 2.2);
          const keyLight = new DirectionalLight(0xffffff, 3.1);
          keyLight.position.set(4, 7, 6);
          const fillLight = new DirectionalLight(0x9ab8ff, 1.15);
          fillLight.position.set(-5, 2, -4);
          scene.add(hemisphere, keyLight, fillLight);
          job.modelRoots.push(scene, ...parsedScenes.filter((candidate) => candidate !== gltf.scene));

          const bounds = this._visibleModelBounds(pivot);
          const size = bounds.getSize(new Vector3());
          const radius = Math.max(size.length() / 2, 0.001);
          if (![size.x, size.y, size.z, radius].every(Number.isFinite)) {
            throw new ModelPreviewSourceError("This model contains invalid geometry bounds.");
          }
          const gridSize = Math.max(Math.max(size.x, size.z) * 3.2, radius * 3.2, 1);
          const grid = new GridHelper(gridSize, 20, 0x7f858c, 0x7f858c);
          grid.position.y = bounds.min.y - Math.max(radius * 0.002, 0.0001);
          const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
          for (const material of gridMaterials) {
            material.transparent = true;
            material.opacity = 0.2;
            material.depthWrite = false;
          }
          scene.add(grid);

          const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
          renderer.setClearColor(0x000000, 0);
          renderer.outputColorSpace = SRGBColorSpace;
          renderer.toneMapping = ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1;
          renderer.setPixelRatio(Math.min(this.ownerDocument.defaultView?.devicePixelRatio ?? 1, 2));
          job.renderer = renderer;
          const contextLostListener = (event: Event): void => {
            event.preventDefault();
            if (!isCurrent()) return;
            this._modelJob = null;
            this._disposeModelJob(job);
            container.setAttribute("aria-busy", "false");
            container.replaceChildren(this._statePanel(
              "3D model preview failed",
              "A WebGL graphics context could not be created. Check graphics acceleration, then reopen the model.",
              "error",
              view,
            ));
          };
          job.contextLostListener = contextLostListener;
          canvas.addEventListener("webglcontextlost", contextLostListener);

          const camera = new PerspectiveCamera(42, 1, 0.001, Math.max(radius * 100, 100));
          const orbit = new OrbitControls(camera, canvas);
          orbit.enableDamping = false;
          orbit.screenSpacePanning = true;
          orbit.minDistance = Math.max(radius * 0.025, 0.0001);
          orbit.maxDistance = Math.max(radius * 40, 10);
          orbit.target.set(0, 0, 0);
          job.controls = orbit;

          const renderScene = (): void => {
            if (isCurrent()) renderer.render(scene, camera);
          };
          const fitView = (useDefaultDirection: boolean): void => {
            const verticalFov = camera.fov * Math.PI / 180;
            const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.01));
            const limitingFov = Math.max(0.05, Math.min(verticalFov, horizontalFov));
            const distance = Math.max(radius / Math.sin(limitingFov / 2) * 1.12, radius * 1.2);
            const direction = useDefaultDirection
              ? new Vector3(1, 0.62, 1.18).normalize()
              : camera.position.clone().sub(orbit.target).normalize();
            if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 0.5) direction.set(1, 0.62, 1.18).normalize();
            orbit.target.set(0, 0, 0);
            camera.position.copy(direction.multiplyScalar(distance));
            camera.near = Math.max(distance / 10_000, radius / 100_000, 0.00001);
            camera.far = Math.max(distance * 100, radius * 100, 100);
            camera.updateProjectionMatrix();
            orbit.update();
            renderScene();
          };
          const resize = (): void => {
            if (!isCurrent()) return;
            const width = Math.max(1, Math.floor(stage.clientWidth));
            const height = Math.max(1, Math.floor(stage.clientHeight));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderScene();
          };
          const ResizeObserverType = this.ownerDocument.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
          if (typeof ResizeObserverType === "function") {
            job.resizeObserver = new ResizeObserverType(resize);
            job.resizeObserver.observe(stage);
          }
          resize();
          fitView(true);
          if (!isCurrent()) return;
          orbit.saveState();
          orbit.addEventListener("change", renderScene);

          let animationPlaying = false;
          const clips = gltf.animations.filter((clip) => Number.isFinite(clip.duration) && clip.duration > 0);
          const updateAnimationButton = (): void => {
            animationButton.textContent = animationPlaying ? "Pause" : "Play";
            animationButton.title = `${animationPlaying ? "Pause" : "Play"} model animation (Space)`;
            animationButton.setAttribute("aria-pressed", String(animationPlaying));
          };
          const stopAnimationFrame = (): void => {
            if (job.animationFrame !== null && window) window.cancelAnimationFrame(job.animationFrame);
            job.animationFrame = null;
          };
          const startAnimationFrame = (): void => {
            stopAnimationFrame();
            if (!window || !animationPlaying || !job.mixer) return;
            let previousTime = window.performance.now();
            const tick = (time: number): void => {
              if (!isCurrent() || !animationPlaying || !job.mixer) {
                job.animationFrame = null;
                return;
              }
              const delta = Math.min(Math.max((time - previousTime) / 1_000, 0), 0.1);
              previousTime = time;
              job.mixer.update(delta);
              renderer.render(scene, camera);
              job.animationFrame = window.requestAnimationFrame(tick);
            };
            job.animationFrame = window.requestAnimationFrame(tick);
          };
          const toggleAnimation = (): void => {
            if (!job.mixer || clips.length === 0) return;
            animationPlaying = !animationPlaying;
            job.mixer.timeScale = animationPlaying ? 1 : 0;
            updateAnimationButton();
            if (animationPlaying) startAnimationFrame();
            else {
              stopAnimationFrame();
              renderScene();
            }
          };

          if (clips.length > 0) {
            const mixer = new AnimationMixer(gltf.scene);
            for (const clip of clips) mixer.clipAction(clip).play();
            job.mixer = mixer;
            animationButton.hidden = false;
            animationButton.disabled = false;
            animationPlaying = this.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches !== true;
            mixer.timeScale = animationPlaying ? 1 : 0;
            updateAnimationButton();
            if (animationPlaying) startAnimationFrame();
          }

          fitButton.disabled = false;
          resetButton.disabled = false;
          fitButton.addEventListener("click", () => fitView(false));
          resetButton.addEventListener("click", () => {
            orbit.reset();
            renderScene();
          });
          animationButton.addEventListener("click", toggleAnimation);
          canvas.addEventListener("keydown", (event) => {
            if (event.key.toLowerCase() === "f") {
              event.preventDefault();
              fitView(false);
            } else if (event.key.toLowerCase() === "r") {
              event.preventDefault();
              orbit.reset();
              renderScene();
            } else if (event.key === " " && clips.length > 0) {
              event.preventDefault();
              toggleAnimation();
            }
          });
          summary.textContent = `${visibleGeometryCount.toLocaleString()} ${visibleGeometryCount === 1 ? "mesh" : "meshes"} \u00b7 ${view.resources.length.toLocaleString()} local ${view.resources.length === 1 ? "resource" : "resources"}${clips.length > 0 ? ` \u00b7 ${clips.length.toLocaleString()} ${clips.length === 1 ? "animation" : "animations"}` : ""}`;
          loading.remove();
          container.setAttribute("aria-busy", "false");
          renderScene();
        } catch (error) {
          if (parsedScenes.length > 0 && job.modelRoots.length === 0) this._disposeModelObjects(parsedScenes);
          if (!isCurrent()) return;
          const message = this._modelPreviewErrorMessage(error);
          this._disposeModelJob(job);
          if (this._modelJob === job) this._modelJob = null;
          container.setAttribute("aria-busy", "false");
          container.replaceChildren(this._statePanel("3D model preview failed", message, "error", view));
        }
      })();
    });
    return container;
  },

  _prepareModelResources(this: PreviewHost,
    view: MainPreviewModelView,
    inspection: ModelPreviewSourceInspection,
    memoryScope: ModelMemoryCacheScope,
  ): ReadonlyMap<string, string> {
    if (
      view.resources.length > MAX_MODEL_RESOURCE_COUNT ||
      inspection.externalResourceUris.length +
      inspection.embeddedBufferUris.length +
      inspection.embeddedImageUris.length +
      inspection.bufferViewImageCount > MAX_MODEL_RESOURCE_COUNT
    ) {
      throw new ModelPreviewSourceError(`This model references more than ${MAX_MODEL_RESOURCE_COUNT.toLocaleString()} model resources.`);
    }
    if (view.resources.length !== inspection.externalResourceUris.length) {
      throw new ModelPreviewSourceError("One or more local model resources could not be loaded.");
    }
    const byUri = new Map(view.resources.map((resource) => [resource.uri, resource] as const));
    if (byUri.size !== view.resources.length) throw new ModelPreviewSourceError("This model contains duplicate resource references.");
    let aggregateBytes = view.sizeBytes;
    const lookup = new Map<string, string>();
    for (const uri of inspection.externalResourceUris) {
      const resource = byUri.get(uri);
      const resourceLimit = resource?.mimeType.startsWith("image/") ? MAX_MODEL_TEXTURE_BYTES : MAX_MODEL_RESOURCE_BYTES;
      if (
        !resource ||
        resource.sizeBytes <= 0 ||
        resource.sizeBytes > resourceLimit ||
        resource.sizeBytes !== resource.bytes.byteLength ||
        !SAFE_MODEL_RESOURCE_MIME_TYPES.has(resource.mimeType)
      ) {
        throw new ModelPreviewSourceError("A model resource uses an unsupported type or exceeds the preview limit.");
      }
      aggregateBytes += resource.sizeBytes;
      if (aggregateBytes > MAX_MODEL_AGGREGATE_BYTES) {
        throw new ModelPreviewSourceError(
          `This model and its resources exceed the ${(MAX_MODEL_AGGREGATE_BYTES / (1024 * 1024)).toLocaleString()} MiB preview limit.`,
        );
      }
      const localUrl = resource.mimeType.startsWith("image/")
        ? memoryScope.registerImage(resource.bytes, resource.mimeType)
        : memoryScope.registerBuffer(resource.bytes);
      for (const key of this._modelResourceLookupKeys(uri)) {
        const existing = lookup.get(key);
        if (existing && existing !== localUrl) throw new ModelPreviewSourceError("This model contains ambiguous resource paths.");
        lookup.set(key, localUrl);
      }
    }
    const window = this.ownerDocument.defaultView;
    if (!window) throw new ModelPreviewSourceError("This Codex window is no longer available.");
    for (const uri of inspection.embeddedBufferUris) {
      const bytes = this._decodeModelDataBufferUri(uri, window);
      const localUrl = memoryScope.registerBuffer(bytes);
      lookup.set(uri, localUrl);
    }
    for (const uri of inspection.embeddedImageUris) {
      const resource = this._decodeModelDataImageUri(uri, window);
      const localUrl = memoryScope.registerImage(resource.bytes, resource.mimeType);
      lookup.set(uri, localUrl);
    }
    return lookup;
  },

  _decodeModelDataBufferUri(this: PreviewHost, uri: string, window: Window): Uint8Array {
    const resource = this._decodeModelDataUri(uri, window, MAX_MODEL_RESOURCE_BYTES);
    if (resource.mimeType !== "application/gltf-buffer" && resource.mimeType !== "application/octet-stream") {
      throw new ModelPreviewSourceError("This model contains an unsupported embedded buffer type.");
    }
    return resource.bytes;
  },

  _decodeModelDataImageUri(this: PreviewHost,
    uri: string,
    window: Window,
  ): { readonly bytes: Uint8Array; readonly mimeType: string } {
    const resource = this._decodeModelDataUri(uri, window, MAX_MODEL_TEXTURE_BYTES);
    if (!resource.mimeType.startsWith("image/") || !SAFE_MODEL_RESOURCE_MIME_TYPES.has(resource.mimeType)) {
      throw new ModelPreviewSourceError("This model contains an unsupported embedded texture type.");
    }
    return resource;
  },

  _decodeModelDataUri(this: PreviewHost,
    uri: string,
    window: Window,
    maxBytes: number,
  ): { readonly bytes: Uint8Array; readonly mimeType: string } {
    const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(uri.trimStart());
    const mimeType = match?.[1]?.toLowerCase();
    if (!match || !mimeType) throw new ModelPreviewSourceError("This model contains an invalid embedded resource.");
    const payload = match[2] ?? "";
    if (payload.length > Math.ceil(maxBytes / 3) * 4 + 8) {
      throw new ModelPreviewSourceError("An embedded model resource exceeds the preview limit.");
    }
    let binary: string;
    try {
      binary = window.atob(payload);
    } catch {
      throw new ModelPreviewSourceError("This model contains an invalid embedded buffer.");
    }
    if (binary.length > maxBytes) {
      throw new ModelPreviewSourceError("An embedded model resource exceeds the preview limit.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0;index < binary.length;index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, mimeType };
  },

  _modelResourceLookupKeys(this: PreviewHost, uri: string): readonly string[] {
    const keys = new Set([uri, decodedModelUri(uri)]);
    for (const key of [...keys]) {
      if (key.startsWith("./")) keys.add(key.slice(2));
    }
    return [...keys];
  },

  _arrayBufferFor(this: PreviewHost, bytes: Uint8Array): ArrayBuffer {
    const underlying = bytes.buffer;
    if (underlying instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === underlying.byteLength) return underlying;
    if (underlying instanceof ArrayBuffer) return underlying.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  },

  _visibleModelGeometryCount(this: PreviewHost, root: Object3D): number {
    let count = 0;
    root.traverse((object) => {
      for (let current: Object3D | null = object;current;current = current.parent) {
        if (!current.visible) return;
        if (current === root) break;
      }
      const renderable = object as Object3D & {
        readonly isMesh?: boolean;
        readonly isLine?: boolean;
        readonly isPoints?: boolean;
        readonly geometry?: { readonly attributes?: { readonly position?: { readonly count?: number } } };
      };
      if (
        (renderable.isMesh || renderable.isLine || renderable.isPoints) &&
        typeof renderable.geometry?.attributes?.position?.count === "number" &&
        renderable.geometry.attributes.position.count > 0
      ) {
        count += 1;
      }
    });
    return count;
  },

  _visibleModelBounds(this: PreviewHost, root: Object3D): Box3 {
    const bounds = new Box3();
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      for (let current: Object3D | null = object;current;current = current.parent) {
        if (!current.visible) return;
        if (current === root) break;
      }
      const geometry = (object as Object3D & { readonly geometry?: BufferGeometry }).geometry;
      if (!geometry?.attributes.position || geometry.attributes.position.count <= 0) return;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox && !geometry.boundingBox.isEmpty()) {
        bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
    return bounds;
  },

  _modelPreviewErrorMessage(this: PreviewHost, error: unknown): string {
    if (error instanceof ModelPreviewSourceError) return error.message;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("draco")) return "Draco-compressed models are not supported yet. Export this model without Draco compression.";
    if (message.includes("meshopt")) return "Meshopt-compressed models are not supported yet. Export this model without Meshopt compression.";
    if (message.includes("ktx2") || message.includes("basis")) {
      return "KTX2/Basis textures are not supported yet. Export this model with PNG, JPEG, WebP, or AVIF textures.";
    }
    if (message.includes("webgl") || message.includes("context")) {
      return "A WebGL graphics context could not be created. Check graphics acceleration, then reopen the model.";
    }
    return "This glTF model could not be rendered. Check that the file and its local resources are valid glTF 2.0 data.";
  },

  _cancelModelPreview(this: PreviewHost): void {
    this._modelGeneration += 1;
    const job = this._modelJob;
    this._modelJob = null;
    if (job) this._disposeModelJob(job);
  },

  _disposeModelJob(this: PreviewHost, job: ModelPreviewJob): void {
    if (!job.abortController.signal.aborted) {
      job.abortController.abort(new DOMException("The 3D model preview was cancelled.", "AbortError"));
    }
    job.loadingManager?.abort();
    job.loadingManager = null;
    const window = this.ownerDocument.defaultView;
    if (job.animationFrame !== null && window) window.cancelAnimationFrame(job.animationFrame);
    job.animationFrame = null;
    job.resizeObserver?.disconnect();
    job.resizeObserver = null;
    job.controls?.dispose();
    job.controls = null;
    job.mixer?.stopAllAction();
    job.mixer = null;
    if (job.modelRoots.length > 0) this._disposeModelObjects(job.modelRoots);
    job.modelRoots.splice(0);
    if (job.renderer) {
      try {
        if (job.contextLostListener) {
          job.renderer.domElement.removeEventListener("webglcontextlost", job.contextLostListener);
        }
        job.renderer.renderLists.dispose();
        job.renderer.dispose();
        job.renderer.forceContextLoss();
      } catch {
        // The WebGL context may already be gone; clearing references is sufficient.
      }
    }
    job.contextLostListener = null;
    job.renderer = null;
    job.modelMemoryScope?.release();
    job.modelMemoryScope = null;
  },

  _disposeModelObjects(this: PreviewHost, roots: readonly Object3D[]): void {
    const geometries = new Set<{ dispose: () => void }>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const root of new Set(roots)) root.traverse((object) => {
      const renderable = object as Object3D & {
        readonly geometry?: { dispose?: () => void };
        readonly material?: Material | readonly Material[];
        readonly skeleton?: { readonly boneTexture?: Texture | null };
      };
      if (renderable.geometry && typeof renderable.geometry.dispose === "function") {
        geometries.add(renderable.geometry as { dispose: () => void });
      }
      const objectMaterials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
      for (const material of objectMaterials) {
        materials.add(material);
        for (const value of Object.values(material as unknown as Record<string, unknown>)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
      if (renderable.skeleton?.boneTexture) textures.add(renderable.skeleton.boneTexture);
    });
    for (const texture of textures) {
      const image = texture.source?.data as { close?: () => void } | undefined;
      texture.dispose();
      try {
        image?.close?.();
      } catch {
        // ImageBitmap cleanup is best effort across Chromium versions.
      }
    }
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
};
