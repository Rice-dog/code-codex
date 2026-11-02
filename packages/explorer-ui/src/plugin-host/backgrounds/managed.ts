import { registerBackgroundOpening } from '../../background-startup-hold';
import { CODEX_APPEARANCE_POLL_INTERVAL_MS, PARTICLE_BACKGROUND_ATTRIBUTE, PARTICLE_BACKGROUND_COLOR_PROPERTY } from '../../core/configuration/explorer';
import { codexDarkThemeApplied, waitForCodexDarkTheme } from '../../host/appearance/theme-probe';
import {clearParticleThemeLease,readCodexAppearanceTheme,readParticleThemeLease,writeCodexAppearanceTheme,writeParticleThemeLease,type CodexAppearanceTheme} from '../../host/appearance/theme-lease';
import type {DarkBackgroundPluginId} from '../../contracts/explorer-model';
import {ensureBackgroundPackage} from '../../plugin-load-diagnostics';
import {recordCaughtRuntimeError} from '../../runtime-operations';
export interface ManagedRenderer<S>{readonly ready?:Promise<void>;setSettings(settings:S):void;replay():void;dispose():void;readonly diagnostics?:unknown;}
export interface ManagedBackgroundOptions<S,R extends ManagedRenderer<S>>{
 readonly id:DarkBackgroundPluginId;readonly packageId:string;readonly label:string;readonly layerAttribute:string;readonly canvasClass:string;readonly defaults:S;
 read():S;normalize(input:unknown):S;persist(settings:S):void;color(settings:S):string;
 readonly disposeOnRendererError?:boolean;
 readonly deferPresentationUntilReady?:boolean;
 create(layer:HTMLElement,canvas:HTMLCanvasElement,settings:S,onError:(message?:string)=>void):R;
}
/** Owns dark lease, activation/cancellation, normal background mount and teardown. */
export class ManagedBackgroundController<Settings, Renderer extends ManagedRenderer<Settings>> {
  readonly #listeners = new Set<() => void>();
  #settings: Settings;
  #enabled = false;
  #pending = false;
  #error: string | undefined;
  #layer: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #renderer: Renderer | undefined;
  #disposed = false;
  #generation = 0;
  #enableOperation: Promise<void> | undefined;
  #failureRecovery: Promise<void> | undefined;
  #codexThemeObserver: MutationObserver | undefined;
  #codexThemePreferenceTimer = 0;
  #codexThemeMonitorGeneration = 0;
  #stoppedForExternalThemeChange = false;

  constructor(private readonly config:ManagedBackgroundOptions<Settings, Renderer>) { this.#settings=config.read();window.addEventListener("pagehide", this.#onPageHide, { once: true }); }
  protected get renderer():Renderer|undefined{return this.#renderer;}
  get diagnostics():unknown{return this.#renderer?.diagnostics;}
  get settings(): Settings { return this.#settings; }
  get enabled(): boolean { return this.#enabled; }
  get pending(): boolean { return this.#pending; }
  get error(): string | undefined { return this.#error; }
  get stoppedForExternalThemeChange(): boolean { return this.#stoppedForExternalThemeChange; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error(`${this.config.label} is unavailable`);
  }
  async enable(): Promise<void> {
    const generation = this.#generation;
    await this.#failureRecovery;
    await ensureBackgroundPackage(this.config.packageId);
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
      layer.setAttribute(this.config.layerAttribute,"v1");
      layer.setAttribute("aria-hidden", "true");
      layer.style.backgroundColor = this.config.color(this.#settings);
      if(this.config.deferPresentationUntilReady){layer.style.cssText+=';position:fixed;inset:0;width:100%;height:100%;pointer-events:none;opacity:0';}
      const canvas = document.createElement("canvas");
      canvas.className = this.config.canvasClass;
      if(this.config.deferPresentationUntilReady)canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
      layer.append(canvas);
      document.body.prepend(layer);
      this.#layer = layer;
      this.#canvas = canvas;
      if(!this.config.deferPresentationUntilReady){document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE, true);
      document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY, this.config.color(this.#settings));}
      this.#renderer = this.config.create(layer, canvas, this.#settings, (message) => {
        if (this.#disposed || generation !== this.#generation) return;
        this.#error = message;
        // A runtime renderer failure must release its presentation, rather than
        // leave an enabled card with a disposed canvas. Initial failures are
        // handled by the ready rejection below.
        if (this.#enabled && this.config.disposeOnRendererError) {
          this.#enabled = false;
          this.#generation += 1;
          this.#teardownPresentation();
          const recovery = this.#restoreCodexAppearanceTheme().catch(error => recordCaughtRuntimeError('background failure theme restore', error));
          this.#failureRecovery = recovery;
          void recovery.finally(() => { if (this.#failureRecovery === recovery) this.#failureRecovery = undefined; });
        }
        this.#notify();
      });
      await this.#renderer.ready;
      if (this.#disposed || generation !== this.#generation) return;
      if(this.config.deferPresentationUntilReady){document.documentElement.toggleAttribute(PARTICLE_BACKGROUND_ATTRIBUTE,true);document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY,this.config.color(this.#settings));layer.style.opacity='1';}
      registerBackgroundOpening(this.#layer!, this.#renderer);
      this.#enabled = true;
      this.#observeCodexTheme();
      this.#scheduleCodexThemePreferenceCheck();
    } catch (error) {
      // A user stop/dispose owns cancellation. A stale activation must not
      // restore another background's lease or publish a spurious failure.
      if (this.#disposed || generation !== this.#generation) return;
      recordCaughtRuntimeError("#performEnable", error);

      this.#error = error instanceof Error ? error.message : `${this.config.label} could not be enabled`;
      this.#teardownPresentation();
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
    if (hadPresentation) this.#teardownPresentation();
    if (pendingEnable) await pendingEnable.catch(() => undefined);
    await this.#failureRecovery;
    try {
      if (!preserveTheme) await this.#restoreCodexAppearanceTheme();
      this.#error = undefined;
    } catch (error) {
      recordCaughtRuntimeError("disable", error);

      this.#error = error instanceof Error ? error.message : "The previous Codex Appearance could not be restored";
    }
    this.#notify();
  }

  updateSettings(next: Settings): void {
    this.#settings = this.config.normalize(next);
    this.config.persist(this.#settings);
    if(this.#layer){this.#layer.style.backgroundColor=this.config.color(this.#settings);document.documentElement.style.setProperty(PARTICLE_BACKGROUND_COLOR_PROPERTY,this.config.color(this.#settings));}
    this.#renderer?.setSettings(this.#settings);
    this.#notify();
  }
  reset(): void { this.updateSettings(this.config.defaults); }
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
    const owner = this.config.id;
    let current: CodexAppearanceTheme;
    try { current = await readCodexAppearanceTheme(); }
    catch (error) {
      recordCaughtRuntimeError("#ensureCodexDarkTheme", error);

      if (codexDarkThemeApplied()) return;
      throw new Error("Code-Codex could not access the official Appearance controls. Background activation was cancelled. See the diagnostic details for the compatibility failure.", { cause: error });
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
      throw new Error(`${this.config.label} stopped because the Codex Appearance setting changed. Enable it again to use Dark mode.`);
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
    const owner = this.config.id;
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
    this.#error = `${this.config.label} stopped because Codex Appearance is no longer Dark.`;
    this.#stoppedForExternalThemeChange = true;
    this.#teardownPresentation();
    clearParticleThemeLease(this.config.id);
    this.#notify();
  }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #onPageHide = (): void => { this.dispose(); };
}



