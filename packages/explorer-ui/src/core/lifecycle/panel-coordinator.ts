/** Coordinates panel exclusion without exposing any other plugin's controller. */
export class PanelCoordinator {
  readonly #panels = new Map<string, (restoreFocus: boolean) => void>();
  register(id: string, close: (restoreFocus: boolean) => void): () => void {
    if (this.#panels.has(id)) throw new Error('PANEL_REGISTRY_DUPLICATE: ' + id);
    this.#panels.set(id, close);
    return () => { if (this.#panels.get(id) === close) this.#panels.delete(id); };
  }
  closeOthers(owner: string): void {
    for (const [id, close] of this.#panels) if (id !== owner) close(false);
  }
}
