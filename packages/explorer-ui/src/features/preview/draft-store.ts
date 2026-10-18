/** Draft state survives view replacement; it is never a module-global DOM owner. */
export class DraftStore {
  path: string|null=null;
  text='';
  error: string|undefined;
  saving=false;
  revision=0;
  session=0;
}
export class DetachedDraftStore<T extends { expiresAt: number }> {
  #draft: T|undefined;
  #timer: ReturnType<typeof setTimeout>|undefined;
  get current(): T|undefined { return this.#draft; }
  preserve(draft: T,ttlMs: number): void {
    this.clear(); this.#draft=draft;
    this.#timer=setTimeout(() => this.clear(),ttlMs);
  }
  clear(): void {
    if(this.#timer) clearTimeout(this.#timer);
    this.#timer=undefined; this.#draft=undefined;
  }
}
