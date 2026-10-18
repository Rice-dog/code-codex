/** Pure tab collection; rendering and IO remain in their adapters. */
export class TabStore<T extends { path: string }> {
  #items: T[]=[];
  #active: string|null=null;
  #nextId=1;
  get items(): readonly T[] { return this.#items; }
  get activePath(): string|null { return this.#active; }
  activate(path: string|null): void { this.#active=path; }
  nextInstanceId(): number { return this.#nextId++; }
  append(tab: T): void { this.#items.push(tab); }
  evictFirst(): T|undefined { return this.#items.shift(); }
  remove(index: number): T|undefined { return this.#items.splice(index,1)[0]; }
  clear(): void { this.#items.length=0; this.#active=null; }
}
