import { transparencyActionError } from './window-result';

export interface NativeWindowBackgroundPorts {
  readonly blocked: () => boolean;
  readonly request: (enabled: boolean) => Promise<string>;
  readonly present: (background: string | undefined) => void;
}
/** Owns native background state; exclusivity and rollback belong to BackgroundActions. */
export class NativeWindowBackground {
  applied: boolean | undefined;
  error: string | undefined;
  get enabled(): boolean { return this.applied === true; }
  readonly pending = false;
  constructor(private readonly ports: NativeWindowBackgroundPorts) {}
  async initialize(): Promise<void> { /* Native state is reconciled by the qualified host. */ }
  async enable(): Promise<void> { await this.#apply(true); }
  async disable(): Promise<void> { await this.#apply(false); }
  async #apply(enabled: boolean): Promise<void> {
    try {
      if (enabled && this.ports.blocked()) throw new Error('Turn off high contrast or reduced transparency, then try again.');
      const background = await this.ports.request(enabled);
      this.ports.present(enabled ? background : undefined);
      this.applied = enabled;
      this.error = undefined;
    } catch (error) {
      this.error = transparencyActionError(error, enabled);
      throw error;
    }
  }
}
