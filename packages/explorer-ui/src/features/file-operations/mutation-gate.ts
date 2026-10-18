export interface MutationAccess {
  readonly busy: boolean;
  acquire(): { release(): void } | undefined;
}
/** One owner for filesystem mutations from menus, keyboard and external drops. */
export class MutationGate implements MutationAccess {
  #owner: object | undefined;
  get busy(): boolean { return this.#owner !== undefined; }
  acquire(): { release(): void } | undefined {
    if (this.#owner) return undefined;
    const owner = this.#owner = {};
    return { release: () => { if (this.#owner === owner) this.#owner = undefined; } };
  }
}
