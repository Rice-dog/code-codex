// controllers responsibility; original state keys, defaults and lifecycle retained.
import { ParticleImageRenderer } from "../../background-plugin-facade";
import { cancelBackgroundFrame,registerBackgroundOpening,requestBackgroundFrame } from "../../background-startup-hold";
import { CODEX_APPEARANCE_POLL_INTERVAL_MS, PARTICLE_BACKGROUND_ATTRIBUTE, PARTICLE_BACKGROUND_COLOR_PROPERTY, PARTICLE_BACKGROUND_IMAGE_TYPES, PARTICLE_BACKGROUND_MAX_IMAGES, PARTICLE_BACKGROUND_MAX_IMAGE_BYTES, PARTICLE_BACKGROUND_MAX_TOTAL_BYTES, PARTICLE_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import { codexDarkThemeApplied, waitForCodexDarkTheme } from "../../host/appearance/theme-probe";
import { createParticleThumbnail, deleteParticleImageRecord, saveParticleImageRecord } from "../../features/media/particle-repository";
import { clearParticleThemeLease,readCodexAppearanceTheme,readParticleThemeLease,writeCodexAppearanceTheme,writeParticleThemeLease,type CodexAppearanceTheme } from "../../host/appearance/theme-lease";
import {
DEFAULT_PARTICLE_IMAGE_TRANSFORM,
ParticleImagePreparationCache,
applyParticleImageTransform,
normalizeParticleImageTransform,
normalizeParticleSettings,
openParticleImageDatabase,
particleOpeningImageOpacity,
readParticleBackgroundSettings,
readParticleImageRecords,
smootherParticleTransition,
writeParticleBackgroundSettings,
type ParticleBackgroundSettings,
type ParticleImageRecord,
type ParticleImageTransform
} from "../../particle-image-startup";
import { ensureBackgroundPackage } from "../../plugin-load-diagnostics";
import { runtimeEvent } from "../../runtime-events";
import { recordCaughtRuntimeError } from "../../runtime-operations";



export class ParticleBackgroundController {
  readonly #listeners = new Set<() => void>();
  readonly #thumbnailUrls = new Map<string, string>();
  readonly #reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  #settings = readParticleBackgroundSettings();
  #records: ParticleImageRecord[] = [];
  #database: IDBDatabase | null = null;
  #initialization: Promise<void> | undefined;
  #enabled = false;
  #pending = false;
  // Routine image swaps track their own activity; pending stays reserved for
  // appearance transitions so BackgroundActions.busy does not flap during
  // auto-switch rotation.
  #imageBusy = false;
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
      recordCaughtRuntimeError("#performEnable", error);

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
      recordCaughtRuntimeError("#performEnable", error);

      this.#error = error instanceof Error ? error.message : "Particle Image Background could not be enabled";
      this.#teardownPresentation();
      try {
        await this.#restoreCodexAppearanceTheme();
      } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#performEnable", __codeCodexCaught);

        // Keep the original activation error. A retained lease retries restoration later.
      }
      throw error;
    } finally {
      this.#pending = false;
      this.#notify();
      // Image activation cannot schedule while its enclosing transaction is pending.
      this.#scheduleRotation();
    }
  }

  async disable(preserveTheme = false): Promise<void> {
    const pendingEnable = this.#enableOperation;
    this.#stoppedForExternalThemeChange = false;
    const hadPresentation = this.#enabled || this.#pending || Boolean(this.#layer);
    this.#enabled = false;
    this.#pending = false;
    this.#imageBusy = false;
    this.#generation += 1;
    if (hadPresentation) this.#teardownPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    try {
      if (!preserveTheme) await this.#restoreCodexAppearanceTheme();
      this.#error = undefined;
    } catch (error) {
      recordCaughtRuntimeError("disable", error);

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
    if (!this.#enabled || this.#pending || this.#imageBusy || !this.#renderer?.count || !this.#settings.introEnabled) return;
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
      recordCaughtRuntimeError("addImages", error);

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
      this.#scheduleRotation();
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
      recordCaughtRuntimeError("updateImageTransform", error);

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
      recordCaughtRuntimeError("deleteImage", error);

      this.#error = error instanceof Error ? error.message : "The image could not be deleted";
    } finally {
      this.#pending = false;
      this.#notify();
      this.#scheduleRotation();
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
    this.#imageBusy = false;
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
      recordCaughtRuntimeError("#initialize", error);

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
    this.#imageBusy = true;
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
      recordCaughtRuntimeError("#activateImage", error);

      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.#error = error instanceof Error ? error.message : "The particle image could not be loaded";
      }
      return false;
    } finally {
      if (generation === this.#generation) {
        this.#imageBusy = false;
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
      recordCaughtRuntimeError("#prepareSourceImage", error);

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
    this.#imageBusy = false;
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
      } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#clearActiveImage", __codeCodexCaught);

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
      || this.#imageBusy
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
      recordCaughtRuntimeError("#ensureCodexDarkTheme", error);

      if (codexDarkThemeApplied()) return;
      throw new Error("Code-Codex could not access the official Appearance controls. Background activation was cancelled. See the diagnostic details for the compatibility failure.", { cause: error });
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
      recordCaughtRuntimeError("#ensureCodexDarkTheme", error);

      try {
        await writeCodexAppearanceTheme(current);
        clearParticleThemeLease(owner);
      } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#ensureCodexDarkTheme", __codeCodexCaught);

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
    } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#checkCodexThemePreference", __codeCodexCaught);

      // A transient read failure must not tear down an active presentation.
    }
    if (this.#enabled && generation === this.#codexThemeMonitorGeneration) this.#scheduleCodexThemePreferenceCheck();
  }

  #stopForExternalThemeChange(): void {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#pending = false;
    this.#imageBusy = false;
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



export const PARTICLE_BACKGROUND_CONTROLLER = Symbol.for("code-codex:particle-image-background-controller:v1");



export function getParticleBackgroundController(): ParticleBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[PARTICLE_BACKGROUND_CONTROLLER];
  if (existing instanceof ParticleBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try {
      existing.dispose();
    } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("getParticleBackgroundController", __codeCodexCaught);

      // Replace a stale controller from an earlier injected bundle.
    }
  }
  const controller = new ParticleBackgroundController();
  globalState[PARTICLE_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
