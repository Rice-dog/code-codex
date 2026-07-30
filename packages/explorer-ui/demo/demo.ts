import type { BridgeMessage, BridgeRequest, ObjectBridge, TreeNodeInput } from "../src/types";

const rootEntries: TreeNodeInput[] = [
  { name: "src", relativePath: "src", kind: "directory" },
  { name: "demo", relativePath: "demo", kind: "directory" },
  { name: "vendor-index", relativePath: "vendor-index", kind: "directory" },
  { name: ".git", relativePath: ".git", kind: "directory" },
  { name: ".env", relativePath: ".env", kind: "file" },
  { name: "coverage.json", relativePath: "coverage.json", kind: "file" },
  { name: "package.json", relativePath: "package.json", kind: "file" },
  { name: "README.md", relativePath: "README.md", kind: "file" },
];

const directories = new Map<string, TreeNodeInput[]>([
  ["", rootEntries],
  [".git", [{ name: "config", relativePath: ".git/config", kind: "file" }]],
  [
    "src",
    [
      { name: "adapters", relativePath: "src/adapters", kind: "directory" },
      { name: "bridge.ts", relativePath: "src/bridge.ts", kind: "file" },
      { name: "explorer-element.ts", relativePath: "src/explorer-element.ts", kind: "file" },
      { name: ".cache", relativePath: "src/.cache", kind: "directory" },
      { name: "tree-model.ts", relativePath: "src/tree-model.ts", kind: "file" },
    ],
  ],
  ["src/adapters", [{ name: "codex-26.715.ts", relativePath: "src/adapters/codex-26.715.ts", kind: "file" }]],
  [
    "demo",
    [
      { name: "demo.ts", relativePath: "demo/demo.ts", kind: "file" },
      { name: "index.html", relativePath: "demo/index.html", kind: "file" },
    ],
  ],
  [
    "vendor-index",
    Array.from({ length: 1250 }, (_, index) => {
      const name = `entry-${String(index + 1).padStart(4, "0")}.d.ts`;
      return { name, relativePath: `vendor-index/${name}`, kind: "file" as const };
    }),
  ],
]);

const listeners = new Set<(message: BridgeMessage) => void>();
const previewText = new Map<string, string>([
  ["README.md", "# Code-Codex\n\nA project tree with bounded file preview and editing in Codex Desktop.\n"],
  ["package.json", '{\n  "name": "@code-codex/explorer-ui",\n  "private": true\n}\n'],
  ["src/explorer-element.ts", "export class CodeCodexElement extends HTMLElement {\n  // Local demo preview\n}\n"],
  ["src/bridge.ts", "export class ExplorerBridge extends EventTarget {}\n"],
  ["src/tree-model.ts", "export class TreeModel {\n  // Lazy, virtualized file tree model\n}\n"],
]);
let settings = { width: 270, collapsed: false, showHidden: true, showIgnored: true };
let watching = false;

function demoText(path: string): string {
  return previewText.get(path) ?? `// Preview for ${path}\n`;
}

function demoVersion(text: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ (text.charCodeAt(index) || 0), 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}

function demoLineEnding(text: string): "lf" | "crlf" | "none" | "mixed" {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf && lf) return "mixed";
  if (crlf) return "crlf";
  if (lf) return "lf";
  return "none";
}

function demoPreview(path: string): Record<string, unknown> {
  const text = demoText(path);
  const lineEnding = demoLineEnding(text);
  return {
    kind: "text",
    text,
    sizeBytes: new TextEncoder().encode(text).byteLength,
    truncated: false,
    editable: lineEnding !== "mixed",
    version: demoVersion(text),
    lineEnding,
  };
}

function demoParentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function moveDemoEntry(sourcePath: string, destinationParentPath: string): TreeNodeInput {
  const sourceParentPath = demoParentPath(sourcePath);
  const sourceEntries = directories.get(sourceParentPath);
  const destinationEntries = directories.get(destinationParentPath);
  const sourceIndex = sourceEntries?.findIndex((entry) => entry.relativePath === sourcePath) ?? -1;
  if (!sourceEntries || !destinationEntries || sourceIndex < 0) throw new Error("NOT_FOUND");
  const source = sourceEntries[sourceIndex];
  if (!source) throw new Error("NOT_FOUND");
  const movedPath = destinationParentPath ? `${destinationParentPath}/${source.name}` : source.name;
  if (destinationEntries.some((entry) => entry.relativePath === movedPath)) throw new Error("CONFLICT");
  if (source.kind === "directory" && (destinationParentPath === sourcePath || destinationParentPath.startsWith(`${sourcePath}/`))) {
    throw new Error("INVALID_PATH");
  }

  sourceEntries.splice(sourceIndex, 1);
  const moved = { ...source, id: movedPath, relativePath: movedPath };
  destinationEntries.push(moved);
  if (source.kind === "directory") {
    const subtree = [...directories.entries()].filter(([path]) => path === sourcePath || path.startsWith(`${sourcePath}/`));
    for (const [path] of subtree) directories.delete(path);
    for (const [path, entries] of subtree) {
      const nextDirectoryPath = `${movedPath}${path.slice(sourcePath.length)}`;
      directories.set(nextDirectoryPath, entries.map((entry) => ({
        ...entry,
        id: `${movedPath}${entry.relativePath.slice(sourcePath.length)}`,
        relativePath: `${movedPath}${entry.relativePath.slice(sourcePath.length)}`,
      })));
    }
  }
  for (const [path, text] of [...previewText.entries()]) {
    if (path !== sourcePath && !path.startsWith(`${sourcePath}/`)) continue;
    previewText.delete(path);
    previewText.set(`${movedPath}${path.slice(sourcePath.length)}`, text);
  }
  return moved;
}

const bridge: ObjectBridge = {
  request(message: BridgeRequest): unknown {
    const { method, params } = message;
    if (method === "explorer.settings.get") {
      return { panelWidth: settings.width, collapsed: settings.collapsed, showHidden: settings.showHidden, showIgnored: settings.showIgnored };
    }
    if (method === "explorer.settings.set") {
      settings = {
        width: Number(params.panelWidth),
        collapsed: params.collapsed === true,
        showHidden: true,
        showIgnored: true,
      };
      return { panelWidth: settings.width, ...settings };
    }
    if (method === "explorer.context") {
      return {
        threadId: String(params.threadId),
        projectName: "Code-Codex",
        rootName: "Code-Codex",
        compatible: true,
      };
    }
    if (method === "explorer.list") {
      const path = String(params.relativePath ?? "");
      const offset = Number(params.cursor ?? 0);
      const limit = Number(params.limit ?? 500);
      const all = directories.get(path) ?? [];
      const entries = all.slice(offset, offset + limit);
      const next = offset + entries.length;
      return { entries, ...(next < all.length ? { nextCursor: String(next) } : {}) };
    }
    if (method === "explorer.preview") {
      const path = String(params.relativePath ?? "");
      if (path === ".env") {
        return { kind: "unsupported", sizeBytes: 0, truncated: false, reason: "sensitive" };
      }
      return demoPreview(path);
    }
    if (method === "explorer.preview.save") {
      const path = String(params.relativePath ?? "");
      const current = demoText(path);
      if (params.expectedVersion !== demoVersion(current)) throw new Error("CONFLICT");
      const binary = atob(String(params.contentBase64 ?? ""));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      previewText.set(path, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return demoPreview(path);
    }
    if (method === "explorer.entry.move") {
      return moveDemoEntry(
        String(params.relativePath ?? ""),
        String(params.destinationParentRelativePath ?? ""),
      );
    }
    if (method === "explorer.watch.start") {
      watching = true;
      return { watching };
    }
    if (method === "explorer.watch.stop") {
      watching = false;
      return { watching };
    }
    if (method === "explorer.context.clear") {
      watching = false;
      return { cleared: true };
    }
    throw new Error(`Unsupported demo method: ${method}`);
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

window.__CODE_CODEX_BOOTSTRAP__ = {
  token: "local-demo-token",
  codexVersion: "26.715.10079.0",
  channel: "demo",
};
window.__codeCodex = bridge;

await import("../src/index");
window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
  detail: { threadId: "11111111-1111-4111-8111-111111111111", hostId: "local", kind: "local" },
}));

function notify(message: BridgeMessage): void {
  for (const listener of listeners) listener(message);
}

let added = false;
document.querySelector('[data-demo="add"]')?.addEventListener("click", () => {
  if (!added) {
    added = true;
    rootEntries.push({ name: "field-notes.md", relativePath: "field-notes.md", kind: "file" });
  }
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "field-notes.md", kind: "added", node: { name: "field-notes.md", relativePath: "field-notes.md", kind: "file" } }] } });
});

document.querySelector('[data-demo="modify"]')?.addEventListener("click", () => {
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "package.json", kind: "modified" }] } });
});

document.querySelector('[data-demo="rename"]')?.addEventListener("click", () => {
  const index = rootEntries.findIndex((entry) => entry.relativePath === "README.md");
  if (index >= 0) rootEntries[index] = { name: "FIELD-GUIDE.md", relativePath: "FIELD-GUIDE.md", kind: "file" };
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "FIELD-GUIDE.md", fromRelativePath: "README.md", kind: "renamed" }] } });
});

document.querySelector('[data-demo="delete"]')?.addEventListener("click", () => {
  const index = rootEntries.findIndex((entry) => entry.relativePath === "field-notes.md");
  if (index >= 0) rootEntries.splice(index, 1);
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "field-notes.md", kind: "deleted" }] } });
});

document.querySelector('[data-demo="theme"]')?.addEventListener("click", (event) => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  (event.currentTarget as HTMLButtonElement).textContent = dark ? "Light theme" : "Dark theme";
});
