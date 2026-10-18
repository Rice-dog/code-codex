/** One epoch and pending owner for all mutually exclusive background transitions.
 * Surface opacity and startup animation are overlays and do not acquire this owner.
 * Rendering, rollback and native transparency remain explicit controller actions.
 */
export class AppearanceCoordinator {
  operation=0;
  pluginPending=false;
  transitionPending=false;
  get busy(): boolean { return this.pluginPending||this.transitionPending; }
  invalidate(): void {
    this.operation++;
    this.pluginPending=false;
    this.transitionPending=false;
  }
  current(operation: number): boolean { return operation===this.operation; }
  acquire(): { assertCurrent(): void; release(): void } | undefined {
    if (this.busy) return undefined;
    const operation=++this.operation;
    this.transitionPending=true;
    let released=false;
    return {
      assertCurrent: () => {
        if (released||!this.current(operation)) throw new DOMException('Background transition was superseded.','AbortError');
      },
      release: () => {
        if (released) return;
        released=true;
        if (this.current(operation)) this.transitionPending=false;
      },
    };
  }
}
