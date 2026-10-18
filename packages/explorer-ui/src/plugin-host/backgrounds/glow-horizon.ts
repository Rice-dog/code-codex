// controllers responsibility; original state keys, defaults and lifecycle retained.
import { GlowHorizonRenderer,populateGlowHorizonLayer } from "../../background-plugin-facade";
import { registerBackgroundOpening } from "../../background-startup-hold";
import { CODEX_APPEARANCE_POLL_INTERVAL_MS, GLOW_HORIZON_BACKGROUND_ATTRIBUTE, GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY, GLOW_HORIZON_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import { codexDarkThemeApplied, waitForCodexDarkTheme } from "../../host/appearance/theme-probe";
import { clearParticleThemeLease,readCodexAppearanceTheme,readParticleThemeLease,writeCodexAppearanceTheme,writeParticleThemeLease,type CodexAppearanceTheme } from "../../host/appearance/theme-lease";
import { ensureBackgroundPackage } from "../../plugin-load-diagnostics";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import {
DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS,
GLOW_HORIZON_BACKGROUND_SETTINGS_KEY,
GlowHorizonBackgroundSettings,
normalizeGlowHorizonSettings,
readGlowHorizonBackgroundSettings
} from "../../startup-background-renderers";



export function writeGlowHorizonBackgroundSettings(settings: GlowHorizonBackgroundSettings): void {
  try {
    localStorage.setItem(GLOW_HORIZON_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("writeGlowHorizonBackgroundSettings", __codeCodexCaught);

    // The current session keeps working when DOM storage is unavailable.
  }
}



export class GlowHorizonBackgroundController {
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
      recordCaughtRuntimeError("#performEnable", error);

      this.#error = error instanceof Error ? error.message : "Glow Horizon Background could not be enabled";
      this.#teardownPresentation();
      try { await this.#restoreCodexAppearanceTheme(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#performEnable", __codeCodexCaught);
 /* Keep activation error. */ }
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
      recordCaughtRuntimeError("disable", error);

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
      throw new Error("Glow Horizon Background stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.");
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
    } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("#checkCodexThemePreference", __codeCodexCaught);
 /* Transient bridge failure does not tear down presentation. */ }
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



export const GLOW_HORIZON_BACKGROUND_CONTROLLER = Symbol.for("code-codex:glow-horizon-background-controller:v1");



export function getGlowHorizonBackgroundController(): GlowHorizonBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[GLOW_HORIZON_BACKGROUND_CONTROLLER];
  if (existing instanceof GlowHorizonBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("getGlowHorizonBackgroundController", __codeCodexCaught);
 /* Replace stale controller. */ }
  }
  const controller = new GlowHorizonBackgroundController();
  globalState[GLOW_HORIZON_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
