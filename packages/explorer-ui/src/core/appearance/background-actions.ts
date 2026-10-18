import type { AppearanceCoordinator } from '../lifecycle/appearance-coordinator';
import type { BackgroundCommands } from '../../contracts/appearance';

/** Runtime capability shared by mutually exclusive visual backgrounds only. */
export interface BackgroundRuntime {
  readonly enabled: boolean;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly stoppedForExternalThemeChange?: boolean;
  initialize(): Promise<unknown>;
  enable(): Promise<unknown>;
  disable(preserveTheme?: boolean): Promise<unknown>;
}
export interface BackgroundEntry {
  readonly id: string;
  readonly label: string;
  readonly runtime: BackgroundRuntime;
  readonly activationOrder?: 'before-exclusion';
  readonly preserveThemeOnExclusion?: boolean;
}
export interface BackgroundActionPorts {
  readonly coordinator: AppearanceCoordinator;
  readonly entries: readonly BackgroundEntry[];
  readonly enabled: Set<string>;
  readonly connected: () => boolean;
  readonly initializationCurrent: (generation: number) => boolean;
  readonly prepare: (id: string) => Promise<unknown>;
  readonly ready: (operation: number) => Promise<boolean>;
  /** Native transparency must succeed before any current media is stopped. */
  readonly leaveNativeTransparency: (target: string) => Promise<void>;
  readonly reconcileNative: () => Promise<void>;
  readonly transferTheme: (target: string) => void;
  readonly committed: () => void;
  readonly changed: () => void;
  readonly suspendHealth: () => void;
  readonly resumeHealth: () => void;
  readonly failed: (operation: string, error: unknown) => void;
  readonly announce: (message: string) => void;
}

/** Owns cross-background policy. Settings panels never enumerate their siblings. */
export class BackgroundActions implements BackgroundCommands {
  readonly #entries: Map<string, BackgroundEntry>;
  readonly #runtimeOwners = new Map<string, object>();
  constructor(private readonly ports: BackgroundActionPorts) {
    this.#entries = new Map(ports.entries.map(entry => [entry.id, entry]));
    if (this.#entries.size !== ports.entries.length) throw new Error('BACKGROUND_REGISTRY_DUPLICATE: Background IDs must be unique.');
  }
  get busy(): boolean { return this.ports.coordinator.busy || this.ports.entries.some(entry => entry.runtime.pending); }
  async deactivate(id: string): Promise<void> {
    const entry = this.#required(id);
    if (this.ports.enabled.has(id) || entry.runtime.enabled) await entry.runtime.disable(true);
    if (this.ports.enabled.delete(id)) this.ports.committed();
  }
  async initialize(id: string, generation: number): Promise<void> {
    const entry = this.#required(id);
    try {
      await entry.runtime.initialize();
      if (!this.ports.initializationCurrent(generation)) return;
      if (!this.ports.enabled.has(id)) {
        if (entry.runtime.enabled) await entry.runtime.disable();
        return;
      }
      for (const other of this.ports.entries) {
        if (other.id === id) continue;
        if (other.runtime.enabled) await other.runtime.disable(true);
        if (!this.ports.initializationCurrent(generation)) return;
      }
      this.ports.transferTheme(id);
      this.#runtimeOwners.set(id, {});
      await entry.runtime.enable();
      if (!this.ports.initializationCurrent(generation)) return;
      if (entry.runtime.stoppedForExternalThemeChange) this.ports.enabled.delete(id);
      else if (entry.runtime.enabled) this.#select(id);
      this.ports.committed();
    } catch (error) { this.ports.failed('initialize ' + id, error); }
    finally { if (this.ports.initializationCurrent(generation)) this.ports.changed(); }
  }
  async toggle(id: string): Promise<void> {
    const entry = this.#required(id), p = this.ports;
    if (this.busy || !p.connected()) return;
    const operation = ++p.coordinator.operation;
    p.coordinator.transitionPending = true;
    p.suspendHealth(); p.changed();
    const previous: BackgroundEntry[] = [];
    let before = new Set<string>();
    let captured = false;
    let started = false, committed = false;
    const owner = {};
    const current = () => p.connected() && p.coordinator.current(operation);
    try {
      if (!p.enabled.has(id)) await p.prepare(id);
      if (!current() || !await p.ready(operation) || !current()) return;
      before = new Set(p.enabled);
      captured = true;
      if (entry.runtime.enabled && p.enabled.has(id)) {
        await entry.runtime.disable();
        if (!current()) return;
        p.enabled.delete(id);
      } else {
        await p.leaveNativeTransparency(id);
        if (!current()) { await p.reconcileNative(); return; }
        if (entry.activationOrder === 'before-exclusion') {
          this.#runtimeOwners.set(id, owner);
          await entry.runtime.enable();
          started = entry.runtime.enabled;
          if (!current()) return;
          if (!started) throw new Error(entry.runtime.error || `BACKGROUND_ENABLE_FAILED: ${entry.label} could not be enabled.`);
        }
        for (const other of p.entries) {
          if (other.id === id || !other.runtime.enabled) continue;
          previous.push(other);
          await other.runtime.disable(entry.preserveThemeOnExclusion !== false);
          if (!current()) return;
        }
        if (entry.activationOrder !== 'before-exclusion') {
          p.transferTheme(id);
          this.#runtimeOwners.set(id, owner);
          await entry.runtime.enable();
          started = entry.runtime.enabled;
        }
        if (!current()) return;
        if (!started || entry.runtime.stoppedForExternalThemeChange) throw new Error(entry.runtime.error || `BACKGROUND_ENABLE_FAILED: ${entry.label} could not be enabled.`);
        this.#select(id);
      }
      p.committed(); committed = true;
      p.announce(`${entry.label} ${entry.runtime.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) { p.failed('toggle ' + id, error); }
    finally {
      if (!committed && !current() && entry.runtime.enabled && this.#runtimeOwners.get(id) === owner) {
        await entry.runtime.disable(true).catch(error => p.failed('cancel stale ' + id, error));
      }
      // Rollback belongs to this operation only. A stale operation may not revive
      // an old background or disable one that a newer operation has acquired.
      if (!committed && captured && current()) {
        if (entry.runtime.enabled && this.#runtimeOwners.get(id) === owner) await entry.runtime.disable(previous.length > 0).catch(error => p.failed('rollback stop ' + id, error));
        for (const prior of previous) {
          if (!current()) break;
          try { p.transferTheme(prior.id); await prior.runtime.enable(); }
          catch (error) { p.failed('rollback restore ' + prior.id, error); }
        }
        if (current()) {
          for (const prior of p.entries) {
            if (before.has(prior.id)) p.enabled.add(prior.id);
            else p.enabled.delete(prior.id);
          }
          await p.reconcileNative().catch(error => p.failed('rollback native transparency', error));
        }
      }
      if (p.coordinator.current(operation)) {
        p.coordinator.transitionPending = false;
        p.changed(); p.resumeHealth();
      }
    }
  }
  #select(id: string): void {
    for (const other of this.ports.entries) this.ports.enabled.delete(other.id);
    this.ports.enabled.add(id);
  }
  #required(id: string): BackgroundEntry {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error('BACKGROUND_REGISTRY_UNKNOWN: ' + id);
    return entry;
  }
}
