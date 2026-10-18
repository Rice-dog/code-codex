/** A single owner for reversible resources; disposal is idempotent and LIFO. */
export class ResourceScope {
  #closed=false;
  #releases=new Set<() => void>();
  readonly signal: AbortSignal;
  #abort=new AbortController();
  constructor(private readonly report: (error: unknown) => void) { this.signal=this.#abort.signal; }
  get disposed(): boolean { return this.#closed; }
  own(release: () => void): () => void {
    let active=true;
    const once=() => { if(!active) return; active=false; this.#releases.delete(once); release(); };
    if(this.#closed) once(); else this.#releases.add(once);
    return once;
  }
  listen(target: EventTarget,type: string,listener: EventListener,options?: AddEventListenerOptions|boolean): () => void {
    if(this.#closed) return () => { };
    target.addEventListener(type,listener,options);
    return this.own(() => target.removeEventListener(type,listener,options));
  }
  dispose(): void {
    if(this.#closed) return;
    this.#closed=true;
    this.#abort.abort();
    for(const release of [...this.#releases].reverse()) try { release(); } catch(error) {
      try { this.report(error); } catch { /* Diagnostics never interrupt resource release. */ }
    }
  }
}

/** Late completions can observe intent, but cannot revive a cancelled owner. */
export class LatestIntent {
  #generation=0;
  begin(): number { return ++this.#generation; }
  current(generation: number): boolean { return generation===this.#generation; }
  cancel(): void { this.#generation++; }
}
