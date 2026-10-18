import type { MainPreviewState } from '../file-preview/contracts';
/** Workspace features consume a capability, never the concrete application element. */
export interface MainPreviewPort {
  readonly isConnected: boolean;
  readonly parentElement: HTMLElement | null;
  setState(state: MainPreviewState): void;
}
