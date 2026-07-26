import type { ChangeKind, ExplorerChange, FlatTreeRow, ListResult, TreeNodeInput } from "./types";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const MAX_RENDERER_NODES = 10_000;
export const MAX_LOADED_DIRECTORIES = 128;

interface TreeModelLimits {
  maxNodes?: number;
  maxLoadedDirectories?: number;
}

function boundedLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function normalizePath(path: string): string | null {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (normalized === "") return "";
  if (
    normalized.startsWith("/") ||
    normalized.includes(":") ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return null;
  }
  return normalized;
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

function sortNodes(a: TreeNodeInput, b: TreeNodeInput): number {
  if (a.kind === "directory" && b.kind !== "directory") return -1;
  if (a.kind !== "directory" && b.kind === "directory") return 1;
  return collator.compare(a.name, b.name);
}

function sanitizedNode(input: TreeNodeInput, requestedParent: string): TreeNodeInput | null {
  const path = normalizePath(input.relativePath);
  if (!path || parentPath(path) !== requestedParent || !["directory", "file", "symlink"].includes(input.kind)) return null;
  const actualName = basename(path);
  if (!actualName || input.name !== actualName) return null;
  return { ...input, id: input.id || path, relativePath: path };
}

export class TreeModel {
  readonly #nodes = new Map<string, TreeNodeInput>();
  readonly #children = new Map<string, string[]>();
  readonly #expanded = new Set<string>();
  readonly #loading = new Set<string>();
  readonly #errors = new Map<string, string>();
  readonly #nextCursor = new Map<string, string>();
  readonly #directoryAccess = new Map<string, number>();
  readonly #maxNodes: number;
  readonly #maxLoadedDirectories: number;
  #accessClock = 0;

  constructor(limits: TreeModelLimits = {}) {
    this.#maxLoadedDirectories = boundedLimit(limits.maxLoadedDirectories, MAX_LOADED_DIRECTORIES);
    this.#maxNodes = Math.max(boundedLimit(limits.maxNodes, MAX_RENDERER_NODES), this.#maxLoadedDirectories);
  }

  reset(): void {
    this.#nodes.clear();
    this.#children.clear();
    this.#expanded.clear();
    this.#loading.clear();
    this.#errors.clear();
    this.#nextCursor.clear();
    this.#directoryAccess.clear();
    this.#accessClock = 0;
  }

  nodeCount(): number {
    return this.#nodes.size;
  }

  getNode(path: string): TreeNodeInput | undefined {
    return this.#nodes.get(path);
  }

  hasLoaded(path: string): boolean {
    return this.#children.has(path);
  }

  isExpanded(path: string): boolean {
    return this.#expanded.has(path);
  }

  isLoading(path: string): boolean {
    return this.#loading.has(path);
  }

  getNextCursor(path: string): string | undefined {
    return this.#nextCursor.get(path);
  }

  loadedDirectories(): string[] {
    return [...this.#children.keys()];
  }

  setExpanded(path: string, expanded: boolean): void {
    const normalized = normalizePath(path);
    if (!normalized) return;
    if (expanded) {
      if (this.#nodes.get(normalized)?.kind !== "directory") return;
      this.#expanded.add(normalized);
      this.#touchDirectory(normalized);
    } else {
      this.#expanded.delete(normalized);
    }
  }

  beginLoad(path: string, append = false): boolean {
    const normalized = normalizePath(path);
    if (normalized === null || (normalized !== "" && this.#nodes.get(normalized)?.kind !== "directory")) return false;
    if (this.#loading.has(normalized)) return false;
    this.#loading.add(normalized);
    this.#errors.delete(normalized);
    if (!append) this.#nextCursor.delete(normalized);
    if (this.#children.has(normalized)) this.#touchDirectory(normalized);
    return true;
  }

  commitLoad(path: string, result: ListResult, append = false): void {
    const normalizedParent = normalizePath(path);
    if (normalizedParent === null) return;
    const accepted = result.entries
      .map((entry) => sanitizedNode(entry, normalizedParent))
      .filter((entry): entry is TreeNodeInput => Boolean(entry));
    const loadedChildren = this.#children.get(normalizedParent) ?? [];
    const previous = append
      ? loadedChildren
      : loadedChildren.filter((childPath) => this.#nodes.get(childPath)?.change === "deleted");
    const merged = new Map<string, TreeNodeInput>();
    for (const previousPath of previous) {
      const previousNode = this.#nodes.get(previousPath);
      if (previousNode) merged.set(previousPath, previousNode);
    }
    for (const entry of accepted) {
      const current = this.#nodes.get(entry.relativePath);
      merged.set(entry.relativePath, current?.change && !entry.change ? { ...entry, change: current.change } : entry);
    }

    const ordered = [...merged.values()].sort(sortNodes);
    if (!append) {
      const retainedPaths = new Set(ordered.map((entry) => entry.relativePath));
      for (const previousPath of loadedChildren) {
        if (!retainedPaths.has(previousPath)) this.#removeNodeAndSubtree(previousPath);
      }
    }
    for (const entry of ordered) this.#nodes.set(entry.relativePath, entry);
    this.#children.set(normalizedParent, ordered.map((entry) => entry.relativePath));
    this.#loading.delete(normalizedParent);
    this.#errors.delete(normalizedParent);
    if (result.nextCursor) this.#nextCursor.set(normalizedParent, result.nextCursor);
    else this.#nextCursor.delete(normalizedParent);
    this.#touchDirectory(normalizedParent);
    this.#enforceBudgets();
  }

  failLoad(path: string, message: string): void {
    const normalized = normalizePath(path);
    if (normalized === null) return;
    this.#loading.delete(normalized);
    this.#errors.set(normalized, message);
  }

  cancelLoad(path: string): void {
    const normalized = normalizePath(path);
    if (normalized !== null) this.#loading.delete(normalized);
  }

  flatten(includeLoadedCollapsed = false): FlatTreeRow[] {
    const rows: FlatTreeRow[] = [];
    this.#appendDirectoryRows("", 1, rows, includeLoadedCollapsed);
    return rows;
  }

  applyChange(change: ExplorerChange): Set<string> {
    const affectedParents = new Set<string>();
    const path = normalizePath(change.relativePath);
    if (!path) return affectedParents;
    const parent = parentPath(path);
    affectedParents.add(parent);

    if (change.kind === "renamed" && change.fromRelativePath) {
      const from = normalizePath(change.fromRelativePath);
      if (from) {
        const old = this.#nodes.get(from);
        const oldParent = parentPath(from);
        affectedParents.add(oldParent);
        if (old) {
          this.#removeNodeAndSubtree(from);
          const replacement: TreeNodeInput = {
            ...(change.node ?? old),
            id: change.node?.id ?? path,
            name: basename(path),
            relativePath: path,
            change: "renamed",
          };
          this.#nodes.set(path, replacement);
          this.#insertChild(parent, path);
          this.#enforceBudgets();
          return affectedParents;
        }
      }
    }

    const existing = this.#nodes.get(path);
    if (change.kind === "deleted") {
      if (existing) this.#nodes.set(path, { ...existing, change: "deleted" });
      else if (change.node && sanitizedNode(change.node, parent)) {
        this.#nodes.set(path, { ...change.node, relativePath: path, change: "deleted" });
        this.#insertChild(parent, path);
      }
      this.#enforceBudgets();
      return affectedParents;
    }

    if (existing) {
      this.#nodes.set(path, { ...existing, ...(change.node ?? {}), relativePath: path, change: change.kind });
    } else if (change.node) {
      const node = sanitizedNode(change.node, parent);
      if (node) {
        this.#nodes.set(path, { ...node, change: change.kind });
        this.#insertChild(parent, path);
      }
    }
    this.#enforceBudgets();
    return affectedParents;
  }

  clearChange(path: string, expected: ChangeKind): void {
    const node = this.#nodes.get(path);
    if (!node || node.change !== expected) return;
    if (expected === "deleted") {
      this.#removeNodeAndSubtree(path);
      return;
    }
    const { change: _change, ...rest } = node;
    this.#nodes.set(path, rest);
  }

  markChange(path: string, change: ChangeKind): void {
    const node = this.#nodes.get(path);
    if (node) this.#nodes.set(path, { ...node, change });
  }

  #appendDirectoryRows(path: string, depth: number, rows: FlatTreeRow[], includeLoadedCollapsed: boolean): void {
    for (const childPath of this.#children.get(path) ?? []) {
      const node = this.#nodes.get(childPath);
      if (!node) continue;
      rows.push({
        key: `node:${childPath}`,
        path: childPath,
        node,
        depth,
        kind: "node",
        parentPath: path,
      });
      if (
        node.kind === "directory" &&
        (this.#expanded.has(childPath) || (includeLoadedCollapsed && this.#children.has(childPath)))
      ) {
        this.#appendDirectoryRows(childPath, depth + 1, rows, includeLoadedCollapsed);
      }
    }

    if (this.#loading.has(path)) {
      rows.push({ key: `loading:${path}`, path, depth, kind: "directory-loading", parentPath: path });
    } else if (this.#errors.has(path)) {
      rows.push({ key: `error:${path}`, path, depth, kind: "directory-error", parentPath: path });
    } else if (this.#nextCursor.has(path)) {
      rows.push({ key: `more:${path}`, path, depth, kind: "more", parentPath: path });
    }
  }

  #insertChild(parent: string, path: string): void {
    const children = this.#children.get(parent);
    if (!children || children.includes(path)) return;
    children.push(path);
    children.sort((left, right) => {
      const a = this.#nodes.get(left);
      const b = this.#nodes.get(right);
      return a && b ? sortNodes(a, b) : collator.compare(left, right);
    });
  }

  #removeChild(parent: string, path: string): void {
    const children = this.#children.get(parent);
    if (!children) return;
    this.#children.set(parent, children.filter((child) => child !== path));
  }

  #touchDirectory(path: string): void {
    this.#accessClock += 1;
    this.#directoryAccess.set(path, this.#accessClock);
  }

  #enforceBudgets(): void {
    while (this.#children.size > this.#maxLoadedDirectories || this.#nodes.size > this.#maxNodes) {
      const needsNodeSpace = this.#children.size <= this.#maxLoadedDirectories && this.#nodes.size > this.#maxNodes;
      const directory = this.#directoryEvictionCandidate(needsNodeSpace);
      if (directory) {
        this.#evictLoadedDirectory(directory);
        continue;
      }
      if (this.#nodes.size > this.#maxNodes && this.#evictNodesToBudget()) continue;
      break;
    }
  }

  #directoryEvictionCandidate(mustFreeNodes: boolean): string | null {
    const loaded = [...this.#children.keys()].filter(
      (path) => path !== "" && (!mustFreeNodes || this.#descendantNodeCount(path) > 0),
    );
    const collapsed = loaded.filter((path) => !this.#expanded.has(path));
    const candidates = collapsed.length
      ? collapsed
      : loaded.filter((path) => this.#expanded.has(path) && !this.#hasExpandedDescendant(path));
    candidates.sort((left, right) => {
      const access = (this.#directoryAccess.get(left) ?? 0) - (this.#directoryAccess.get(right) ?? 0);
      return access || right.split("/").length - left.split("/").length || collator.compare(left, right);
    });
    return candidates[0] ?? null;
  }

  #evictLoadedDirectory(path: string): void {
    const prefix = `${path}/`;
    for (const nodePath of [...this.#nodes.keys()]) {
      if (nodePath.startsWith(prefix)) this.#nodes.delete(nodePath);
    }
    this.#clearDirectoryState(path, prefix);
  }

  #removeNodeAndSubtree(path: string): void {
    const prefix = `${path}/`;
    for (const nodePath of [...this.#nodes.keys()]) {
      if (nodePath === path || nodePath.startsWith(prefix)) this.#nodes.delete(nodePath);
    }
    this.#clearDirectoryState(path, prefix);
    this.#removeChild(parentPath(path), path);
  }

  #clearDirectoryState(path: string, prefix: string): void {
    for (const directory of [...this.#children.keys()]) {
      if (directory === path || directory.startsWith(prefix)) this.#children.delete(directory);
    }
    for (const expanded of [...this.#expanded]) {
      if (expanded === path || expanded.startsWith(prefix)) this.#expanded.delete(expanded);
    }
    for (const loading of [...this.#loading]) {
      if (loading === path || loading.startsWith(prefix)) this.#loading.delete(loading);
    }
    for (const directory of [...this.#errors.keys()]) {
      if (directory === path || directory.startsWith(prefix)) this.#errors.delete(directory);
    }
    for (const directory of [...this.#nextCursor.keys()]) {
      if (directory === path || directory.startsWith(prefix)) this.#nextCursor.delete(directory);
    }
    for (const directory of [...this.#directoryAccess.keys()]) {
      if (directory === path || directory.startsWith(prefix)) this.#directoryAccess.delete(directory);
    }
  }

  #descendantNodeCount(path: string): number {
    const prefix = `${path}/`;
    let count = 0;
    for (const nodePath of this.#nodes.keys()) {
      if (nodePath.startsWith(prefix)) count += 1;
    }
    return count;
  }

  #hasExpandedDescendant(path: string): boolean {
    const prefix = `${path}/`;
    for (const expanded of this.#expanded) {
      if (expanded.startsWith(prefix)) return true;
    }
    return false;
  }

  #evictNodesToBudget(): boolean {
    const candidates = [...this.#nodes.keys()].filter(
      (path) => !this.#expanded.has(path) && !this.#hasExpandedDescendant(path),
    );
    candidates.sort((left, right) => {
      const leftHidden = this.#isVisible(left) ? 1 : 0;
      const rightHidden = this.#isVisible(right) ? 1 : 0;
      return leftHidden - rightHidden || right.split("/").length - left.split("/").length || collator.compare(right, left);
    });
    let removed = false;
    for (const candidate of candidates) {
      if (this.#nodes.size <= this.#maxNodes) break;
      if (!this.#nodes.has(candidate) || this.#expanded.has(candidate) || this.#hasExpandedDescendant(candidate)) continue;
      this.#removeNodeAndSubtree(candidate);
      removed = true;
    }
    return removed;
  }

  #isVisible(path: string): boolean {
    let parent = parentPath(path);
    while (parent) {
      if (!this.#expanded.has(parent)) return false;
      parent = parentPath(parent);
    }
    return true;
  }
}
