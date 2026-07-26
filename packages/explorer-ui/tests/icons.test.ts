import { describe, expect, it, vi } from "vitest";
import { FILE_ICON_KINDS, getFileIcon, icons } from "../src/icons";
import { styles } from "../src/styles";

describe("file type icons", () => {
  it("provides accessible-hidden command icons for every explorer menu action", () => {
    for (const icon of [icons.preview, icons.newFile, icons.newFolder, icons.rename, icons.trash, icons.copy, icons.reveal, icons.refresh]) {
      expect(icon).toMatch(/^<svg .*aria-hidden="true"/);
    }
  });

  it.each([
    ["index.ts", "typescript", "code"],
    ["Component.tsx", "typescript", "code"],
    ["worker.mjs", "javascript", "code"],
    ["view.jsx", "javascript", "code"],
    ["main.py", "python", "code"],
    ["lib.rs", "rust", "code"],
    ["server.go", "go", "code"],
    ["App.java", "java", "code"],
    ["Main.kt", "kotlin", "code"],
    ["native.c", "c", "code"],
    ["native.cpp", "cpp", "code"],
    ["Program.cs", "csharp", "code"],
    ["index.html", "html", "web"],
    ["theme.css", "css", "web"],
    ["theme.scss", "sass", "web"],
    ["README.md", "markdown", "content"],
    ["notes.txt", "text", "content"],
    ["data.json", "json", "data"],
    ["pipeline.yaml", "yaml", "data"],
    ["Cargo.toml", "toml", "data"],
    ["layout.xml", "xml", "data"],
    ["Package.wxs", "xml", "data"],
    ["SettingsCleanupCA.vcxproj", "cpp", "code"],
    ["settings.ini", "config", "config"],
    ["photo.webp", "image", "media"],
    ["music.flac", "audio", "media"],
    ["clip.mp4", "video", "media"],
    ["bundle.zip", "archive", "archive"],
    ["manual.pdf", "pdf", "document"],
    ["proposal.docx", "document", "document"],
    ["budget.xlsx", "spreadsheet", "document"],
    ["cache.sqlite3", "database", "database"],
    ["setup.sh", "shell", "terminal"],
    ["install.ps1", "powershell", "terminal"],
  ] as const)("maps %s to the %s icon", (name, kind, category) => {
    expect(getFileIcon(name)).toMatchObject({ kind, category });
    expect(getFileIcon(name).markup).toMatch(/^<svg .*aria-hidden="true"/);
  });

  it("matches case-insensitively and understands paths and compound extensions", () => {
    expect(getFileIcon("SRC\\WIDGET.TSX").kind).toBe("typescript");
    expect(getFileIcon("assets/PHOTO.JPEG").kind).toBe("image");
    expect(getFileIcon("release.backup.TAR.GZ").kind).toBe("archive");
    expect(getFileIcon("types.generated.d.ts").kind).toBe("typescript");
    expect(getFileIcon("tsconfig.browser.json").kind).toBe("config");
    expect(getFileIcon("PACKAGE-LOCK.JSON").kind).toBe("lockfile");
  });

  it("gives semantic icons to common dotfiles and lockfiles", () => {
    expect(getFileIcon(".gitignore")).toMatchObject({ kind: "git", category: "version-control" });
    expect(getFileIcon(".GITATTRIBUTES").kind).toBe("git");
    expect(getFileIcon(".env")).toMatchObject({ kind: "env", category: "config" });
    expect(getFileIcon(".env.production.local").kind).toBe("env");
    expect(getFileIcon(".editorconfig").kind).toBe("config");
    expect(getFileIcon("Cargo.lock").kind).toBe("lockfile");
    expect(getFileIcon("pnpm-lock.yaml").kind).toBe("lockfile");
  });

  it("uses one deterministic generic fallback", () => {
    const first = getFileIcon("artifact.unknown-extension");
    const second = getFileIcon("extensionless");
    expect(first).toBe(second);
    expect(first).toMatchObject({ kind: "generic", category: "generic" });
    expect(new Set(FILE_ICON_KINDS).size).toBe(FILE_ICON_KINDS.length);
    expect(getFileIcon("main.cpp").markup).not.toBe(getFileIcon("main.ts").markup);
  });

  it("styles semantic data attributes with subdued light and dark tokens", () => {
    expect(styles).toContain("--cle-icon-blue: #2473a8");
    expect(styles).toContain("--cle-icon-blue: #79b8e6");
    expect(styles).toContain('.node-icon[data-icon-kind="git"]');
    expect(styles).toContain('.node-icon[data-icon-kind="markdown"]');
    expect(styles).toContain('.node-icon[data-icon-kind="cpp"]');
  });

  it("renders icon metadata for files without changing directory, link, or inaccessible icons", async () => {
    vi.resetModules();
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "icon-secret",
      codexVersion: "26.715.4045.0",
      compatible: true,
      manualWorkspace: true,
    };
    window.__codeCodex = {
      request(message) {
        if (message.method === "explorer.settings.get") return { panelWidth: 300, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: "manual-workspace", projectName: "Icons", rootName: "icons", compatible: true };
        }
        if (message.method === "explorer.list") {
          return {
            entries: [
              { name: "src", relativePath: "src", kind: "directory" },
              { name: "main.cpp", relativePath: "main.cpp", kind: "file" },
              { name: "README.md", relativePath: "README.md", kind: "file" },
              { name: "shortcut", relativePath: "shortcut", kind: "symlink" },
              { name: "secret.ts", relativePath: "secret.ts", kind: "file", inaccessible: true },
            ],
          };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = `<section data-code-codex-mount></section><main></main>`;

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    await vi.waitFor(() => expect(explorer?.dataset.state).toBe("ready"));
    const shadow = explorer?.shadowRoot;
    const cpp = shadow?.querySelector<HTMLElement>('[data-path="main.cpp"] .node-icon');
    const markdown = shadow?.querySelector<HTMLElement>('[data-path="README.md"] .node-icon');
    expect(cpp?.dataset).toMatchObject({ iconKind: "cpp", iconCategory: "code" });
    expect(markdown?.dataset).toMatchObject({ iconKind: "markdown", iconCategory: "content" });
    expect(shadow?.querySelector('[data-path="src"] .twisty')).not.toBeNull();
    expect(shadow?.querySelector('[data-path="src"] .node-icon')).toBeNull();
    expect(shadow?.querySelector('[data-path="main.cpp"] .twisty')).toBeNull();
    expect(shadow?.querySelector('[data-path="shortcut"] .node-icon')?.hasAttribute("data-icon-kind")).toBe(false);
    expect(shadow?.querySelector('[data-path="secret.ts"] .node-icon')?.hasAttribute("data-icon-kind")).toBe(false);
  });
});
