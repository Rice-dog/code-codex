import type { ExplorerContext } from '../../contracts/bridge';

/** Renderer workspace authority. UI features share this owner, never saved clients.
 * Composition drives explicit attach/clear transitions; this class performs no IO
 * and never replays a request when the account/document changes.
 */
export class WorkspaceSession<Bridge> {
  bridge: Bridge | undefined;
  context: ExplorerContext | undefined;
  threadId: string | null = null;
  generation = 0;
  matches(bridge: Bridge, context: ExplorerContext, generation: number): boolean {
    return this.generation === generation && this.bridge === bridge &&
      this.context === context && this.threadId === context.threadId;
  }
}
