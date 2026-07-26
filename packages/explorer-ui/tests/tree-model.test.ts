import { describe, expect, it } from "vitest";
import { TreeModel } from "../src/tree-model";

describe("TreeModel", () => {
  it("sorts directories first and filters paths outside the requested page", () => {
    const model = new TreeModel();
    model.beginLoad("");
    model.commitLoad("", {
      entries: [
        { name: "z.ts", relativePath: "z.ts", kind: "file" },
        { name: "src", relativePath: "src", kind: "directory" },
        { name: "escape", relativePath: "../escape", kind: "file" },
        { name: "nested.ts", relativePath: "src/nested.ts", kind: "file" },
      ],
    });
    expect(model.flatten().map((row) => row.node?.name)).toEqual(["src", "z.ts"]);
  });

  it("represents lazy loading, pagination, and nested depth", () => {
    const model = new TreeModel();
    model.beginLoad("");
    model.commitLoad("", { entries: [{ name: "src", relativePath: "src", kind: "directory" }] });
    model.setExpanded("src", true);
    model.beginLoad("src");
    expect(model.flatten().at(-1)?.kind).toBe("directory-loading");
    model.commitLoad("src", { entries: [{ name: "a.ts", relativePath: "src/a.ts", kind: "file" }], nextCursor: "page-2" });
    const rows = model.flatten();
    expect(rows.map((row) => [row.kind, row.depth])).toEqual([
      ["node", 1],
      ["node", 2],
      ["more", 2],
    ]);
  });

  it("keeps change badges through refresh and removes deleted ghosts", () => {
    const model = new TreeModel();
    model.beginLoad("");
    model.commitLoad("", { entries: [{ name: "a.ts", relativePath: "a.ts", kind: "file" }] });
    model.applyChange({ relativePath: "a.ts", kind: "modified" });
    model.beginLoad("");
    model.commitLoad("", { entries: [{ name: "a.ts", relativePath: "a.ts", kind: "file" }] });
    expect(model.getNode("a.ts")?.change).toBe("modified");
    model.applyChange({ relativePath: "a.ts", kind: "deleted" });
    expect(model.getNode("a.ts")?.change).toBe("deleted");
    model.beginLoad("");
    model.commitLoad("", { entries: [] });
    expect(model.getNode("a.ts")?.change).toBe("deleted");
    expect(model.flatten().find((row) => row.path === "a.ts")?.node?.change).toBe("deleted");
    model.clearChange("a.ts", "deleted");
    expect(model.getNode("a.ts")).toBeUndefined();
  });

  it("enforces the global renderer node cap on a single large page", () => {
    const model = new TreeModel({ maxNodes: 4, maxLoadedDirectories: 4 });
    model.beginLoad("");
    model.commitLoad("", {
      entries: Array.from({ length: 12 }, (_, index) => ({
        name: `entry-${index}.ts`,
        relativePath: `entry-${index}.ts`,
        kind: "file" as const,
      })),
    });

    expect(model.nodeCount()).toBe(4);
    expect(model.flatten()).toHaveLength(4);
    expect(model.loadedDirectories()).toEqual([""]);
  });

  it("evicts the least-recent collapsed subtree before loaded-directory limits are exceeded", () => {
    const model = new TreeModel({ maxNodes: 12, maxLoadedDirectories: 3 });
    model.beginLoad("");
    model.commitLoad("", {
      entries: ["a", "b", "c"].map((name) => ({ name, relativePath: name, kind: "directory" as const })),
    });

    for (const directory of ["a", "b", "c"]) {
      model.setExpanded(directory, true);
      expect(model.beginLoad(directory)).toBe(true);
      model.commitLoad(directory, {
        entries: [{ name: `${directory}.ts`, relativePath: `${directory}/${directory}.ts`, kind: "file" }],
      });
      if (directory !== "c") model.setExpanded(directory, false);
    }

    expect(model.loadedDirectories()).toHaveLength(3);
    expect(model.hasLoaded("a")).toBe(false);
    expect(model.getNode("a")).toBeDefined();
    expect(model.getNode("a/a.ts")).toBeUndefined();
    expect(model.isExpanded("a")).toBe(false);
    expect(model.hasLoaded("b")).toBe(true);
    expect(model.hasLoaded("c")).toBe(true);
    expect(model.nodeCount()).toBeLessThanOrEqual(12);
  });

  it("clears evicted expansion state while preserving visible expanded ancestors", () => {
    const model = new TreeModel({ maxNodes: 10, maxLoadedDirectories: 2 });
    model.beginLoad("");
    model.commitLoad("", { entries: [{ name: "src", relativePath: "src", kind: "directory" }] });
    model.setExpanded("src", true);
    model.beginLoad("src");
    model.commitLoad("src", { entries: [{ name: "deep", relativePath: "src/deep", kind: "directory" }] });
    model.setExpanded("src/deep", true);
    model.beginLoad("src/deep");
    model.commitLoad("src/deep", { entries: [{ name: "leaf.ts", relativePath: "src/deep/leaf.ts", kind: "file" }] });

    expect(model.loadedDirectories()).toEqual(["", "src"]);
    expect(model.isExpanded("src")).toBe(true);
    expect(model.isExpanded("src/deep")).toBe(false);
    expect(model.hasLoaded("src/deep")).toBe(false);
    expect(model.getNode("src/deep")).toBeDefined();
    expect(model.getNode("src/deep/leaf.ts")).toBeUndefined();
    expect(model.flatten().map((row) => row.path)).toEqual(["src", "src/deep"]);
  });
});
