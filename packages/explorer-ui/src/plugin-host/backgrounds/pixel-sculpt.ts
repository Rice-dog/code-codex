// controllers responsibility; original state keys, defaults and lifecycle retained.
import { PixelSculptRenderer } from "../../background-plugin-facade";
import { registerBackgroundOpening } from "../../background-startup-hold";
import { type BackgroundSettingsLanguage } from "../../contracts/explorer-model";
import { CODEX_APPEARANCE_POLL_INTERVAL_MS, PARTICLE_BACKGROUND_ATTRIBUTE, PARTICLE_BACKGROUND_COLOR_PROPERTY, PIXEL_SCULPT_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import { codexDarkThemeApplied, waitForCodexDarkTheme } from "../../host/appearance/theme-probe";
import { clearParticleThemeLease,readCodexAppearanceTheme,readParticleThemeLease,writeCodexAppearanceTheme,writeParticleThemeLease,type CodexAppearanceTheme } from "../../host/appearance/theme-lease";
import { PIXEL_SCULPT_DEFAULTS,normalizePixelSculptSettings,readPixelSculptBackgroundSettings,writePixelSculptBackgroundSettings,type PixelSculptSettings } from "../../pixel-sculpt-settings";
import { ensureBackgroundPackage } from "../../plugin-load-diagnostics";
import { recordCaughtRuntimeError } from "../../runtime-operations";





// Independently implemented from the publicly presented Black Hole Hero Section
// visual concept by @yura; no referenced component source or assets are intentionally included.

export class PixelSculptBackgroundController {
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
      recordCaughtRuntimeError("#createEditor", error);

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
      recordCaughtRuntimeError("#performEnable", error);

      this.#error = error instanceof Error ? error.message : "Pixel Sculpt Background could not be enabled";
      this.#detachPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#performEnable", __codeCodexCaught);
 /* Retain the activation error. */ }
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
      recordCaughtRuntimeError("disable", error);

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
      recordCaughtRuntimeError("#ensureCodexDarkTheme", error);

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
      recordCaughtRuntimeError("#ensureCodexDarkTheme", error);

      try { await writeCodexAppearanceTheme(current); clearParticleThemeLease(owner); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#ensureCodexDarkTheme", __codeCodexCaught);
 /* Retain lease for retry. */ }
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
    } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#checkCodexThemePreference", __codeCodexCaught);
 /* A transient read failure does not tear down the presentation. */ }
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



export const PIXEL_SCULPT_BACKGROUND_CONTROLLER = Symbol.for("code-codex:pixelSculpt-background-controller:v1");



export function getPixelSculptBackgroundController(): PixelSculptBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[PIXEL_SCULPT_BACKGROUND_CONTROLLER];
  if (existing instanceof PixelSculptBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("getPixelSculptBackgroundController", __codeCodexCaught);
 /* Replace a stale controller. */ }
  }
  const controller = new PixelSculptBackgroundController();
  globalState[PIXEL_SCULPT_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
