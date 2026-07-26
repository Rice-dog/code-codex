import { parentPath } from "./tree-model";
import type { FlatTreeRow } from "./types";

export function normalizeFileFilter(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function rowMatchesQuery(row: FlatTreeRow, query: string): boolean {
  if (row.kind !== "node" || !row.node) return false;
  const name = row.node.name.toLocaleLowerCase();
  const path = row.node.relativePath.toLocaleLowerCase();
  return name.includes(query) || path.includes(query);
}

/** Counts direct matches without including ancestor rows retained for context. */
export function countLoadedTreeMatches(rows: FlatTreeRow[], value: string): number {
  const query = normalizeFileFilter(value);
  if (!query) return rows.filter((row) => row.kind === "node").length;
  return rows.filter((row) => rowMatchesQuery(row, query)).length;
}

/**
 * Filters the already-loaded tree without turning a lightweight navigator into
 * a recursive filesystem search. Matching descendants retain their visible
 * ancestor rows so indentation and context stay intelligible.
 */
export function filterLoadedTreeRows(rows: FlatTreeRow[], value: string): FlatTreeRow[] {
  const query = normalizeFileFilter(value);
  if (!query) return rows;

  const includedPaths = new Set<string>();
  for (const row of rows) {
    if (!rowMatchesQuery(row, query)) continue;

    includedPaths.add(row.path);
    let ancestor = row.parentPath;
    while (ancestor) {
      includedPaths.add(ancestor);
      ancestor = parentPath(ancestor);
    }
  }

  return rows.filter((row) => row.kind === "node" && includedPaths.has(row.path));
}
