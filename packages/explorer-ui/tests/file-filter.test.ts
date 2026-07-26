import { describe, expect, it } from "vitest";
import { countLoadedTreeMatches, filterLoadedTreeRows, normalizeFileFilter } from "../src/file-filter";
import { TreeModel } from "../src/tree-model";
import type { FlatTreeRow, TreeNodeInput } from "../src/types";

function node(path: string, kind: TreeNodeInput["kind"], depth: number): FlatTreeRow {
  const slash = path.lastIndexOf("/");
  return {
    key: `node:${path}`,
    path,
    depth,
    kind: "node",
    parentPath: slash < 0 ? "" : path.slice(0, slash),
    node: {
      name: slash < 0 ? path : path.slice(slash + 1),
      relativePath: path,
      kind,
    },
  };
}

const rows: FlatTreeRow[] = [
  node("installer", "directory", 1),
  node("installer/Install-CodexLiveExplorer.ps1", "file", 2),
  node("installer/SettingsCleanupCA.cpp", "file", 2),
  node("docs", "directory", 1),
  node("docs/README.md", "file", 2),
  { key: "loading:docs", path: "docs", depth: 2, kind: "directory-loading", parentPath: "docs" },
];

describe("loaded file filtering", () => {
  it("normalizes surrounding whitespace and case", () => {
    expect(normalizeFileFilter("  Ps1 ")).toBe("ps1");
  });

  it("keeps matching files and their visible ancestors", () => {
    expect(filterLoadedTreeRows(rows, "ps1").map((row) => row.path)).toEqual([
      "installer",
      "installer/Install-CodexLiveExplorer.ps1",
    ]);
    expect(countLoadedTreeMatches(rows, "ps1")).toBe(1);
  });

  it("matches loaded relative paths case-insensitively", () => {
    expect(filterLoadedTreeRows(rows, "DOCS/README").map((row) => row.path)).toEqual(["docs", "docs/README.md"]);
  });

  it("does not show unrelated utility rows or invent unloaded results", () => {
    expect(filterLoadedTreeRows(rows, "missing")).toEqual([]);
  });

  it("returns the original tree when the field is empty", () => {
    expect(filterLoadedTreeRows(rows, "  ")).toBe(rows);
  });

  it("can search previously loaded descendants without changing expansion state", () => {
    const model = new TreeModel();
    model.beginLoad("");
    model.commitLoad("", {
      entries: [{ name: "installer", relativePath: "installer", kind: "directory" }],
    });
    model.beginLoad("installer");
    model.commitLoad("installer", {
      entries: [{ name: "Install.ps1", relativePath: "installer/Install.ps1", kind: "file" }],
    });

    expect(model.isExpanded("installer")).toBe(false);
    expect(model.flatten().map((row) => row.path)).toEqual(["installer"]);
    expect(filterLoadedTreeRows(model.flatten(true), "ps1").map((row) => row.path)).toEqual([
      "installer",
      "installer/Install.ps1",
    ]);
    expect(model.isExpanded("installer")).toBe(false);
  });
});
