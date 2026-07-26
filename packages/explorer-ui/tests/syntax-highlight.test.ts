import { describe, expect, it, vi } from "vitest";
import {
  MAX_SYNTAX_RUNS,
  MAX_SYNTAX_SOURCE_UNITS,
  SYNTAX_LANGUAGES,
  SYNTAX_TOKEN_KINDS,
  highlightSyntax,
  highlightSyntaxForPath,
  syntaxLanguageForPath,
  type SyntaxHighlight,
  type SyntaxTokenKind,
} from "../src/syntax-highlight";

function values(source: string, result: SyntaxHighlight, kind: SyntaxTokenKind): string[] {
  return result.runs.filter((run) => run.kind === kind).map((run) => source.slice(run.start, run.end));
}

function expectExactPartition(source: string, result: SyntaxHighlight): void {
  expect(result.runs.length).toBeLessThanOrEqual(MAX_SYNTAX_RUNS);
  let cursor = 0;
  let previous: SyntaxTokenKind | undefined;
  for (const run of result.runs) {
    expect(run.start).toBe(cursor);
    expect(run.end).toBeGreaterThan(run.start);
    expect(run.end).toBeLessThanOrEqual(source.length);
    expect(SYNTAX_TOKEN_KINDS).toContain(run.kind);
    expect(run.kind).not.toBe(previous);
    cursor = run.end;
    previous = run.kind;
  }
  expect(cursor).toBe(source.length);
  expect(result.runs.map((run) => source.slice(run.start, run.end)).join("")).toBe(source);
}

describe("syntax language detection", () => {
  it.each([
    ["src/main.py", "python"],
    ["src/component.TSX", "typescript"],
    ["lib\\worker.MJS", "javascript"],
    ["native/main.c", "c"],
    ["native/value.hpp", "cpp"],
    ["src/lib.rs", "rust"],
    ["cmd/server.go", "go"],
    ["src/App.java", "java"],
    ["src/Main.kt", "kotlin"],
    ["src/Program.cs", "csharp"],
    ["scripts/install.sh", "shell"],
    ["installer/Finalize-Uninstall.ps1", "powershell"],
    ["scripts/setup.CMD", "batch"],
    ["web/index.html", "markup"],
    ["views/page.svelte", "template"],
    ["web/theme.scss", "css"],
    ["data/package.json", "json"],
    ["pipeline.yml", "yaml"],
    ["Cargo.toml", "toml"],
    ["settings.properties", "ini"],
    ["schema.sql", "sql"],
    ["schema.graphql", "graphql"],
    ["wire.proto", "proto"],
    ["README.md", "markdown"],
    ["paper.tex", "tex"],
    ["change.patch", "diff"],
    ["rules.mk", "make"],
    ["module.php", "generic"],
    ["notes.txt", "plain"],
    ["unknown.bin", "plain"],
  ] as const)("maps %s to %s", (path, language) => {
    expect(syntaxLanguageForPath(path)).toBe(language);
  });

  it("prioritizes exact basenames before misleading extensions", () => {
    expect(syntaxLanguageForPath("C:\\repo\\CMakeLists.TXT")).toBe("make");
    expect(syntaxLanguageForPath("Dockerfile")).toBe("build");
    expect(syntaxLanguageForPath("dockerfile.windows")).toBe("build");
    expect(syntaxLanguageForPath("PACKAGE-LOCK.JSON")).toBe("json");
    expect(syntaxLanguageForPath("Pipfile.lock")).toBe("json");
    expect(syntaxLanguageForPath("composer.lock")).toBe("json");
    expect(syntaxLanguageForPath("Cargo.lock")).toBe("toml");
    expect(syntaxLanguageForPath("Gemfile")).toBe("generic");
    expect(syntaxLanguageForPath(".EDITORCONFIG")).toBe("ini");
    expect(syntaxLanguageForPath("license-tool.py")).toBe("python");
    expect(syntaxLanguageForPath("licence-company")).toBe("plain");
    expect(syntaxLanguageForPath("extensionless")).toBe("plain");
    expect(syntaxLanguageForPath("   ")).toBe("plain");
    expect(new Set(SYNTAX_LANGUAGES).size).toBe(SYNTAX_LANGUAGES.length);
    expect(new Set(SYNTAX_TOKEN_KINDS).size).toBe(SYNTAX_TOKEN_KINDS.length);
  });

  it("covers the native long-tail text families with a safe generic profile", () => {
    for (const extension of [
      "swift", "fs", "vb", "rb", "lua", "pl", "r", "dart", "scala", "groovy", "ex", "erl", "clj", "edn",
      "hs", "ml", "sol", "zig", "nim", "jl", "gradle", "sbt",
    ]) {
      expect(syntaxLanguageForPath(`sample.${extension}`)).toBe("generic");
    }
  });
});

describe("syntax scanners", () => {
  it("highlights the Python preview sample, including its triple-quoted module string", () => {
    const source = `"""\r
This script streamlines generating localized documentation. 中文 🐍\r
\r
Usage:\r
  - Run from the root directory.\r
"""\r
import os\r
from pathlib import Path\r
\r
@decorator\r
def build_docs(target: Path = Path("site"), retries=3):\r
    # update generated links\r
    return target.resolve()\r
`;
    const result = highlightSyntaxForPath("docs/build_docs.py", source);

    expect(result.language).toBe("python");
    expect(values(source, result, "string")[0]).toBe(
      `"""\r
This script streamlines generating localized documentation. 中文 🐍\r
\r
Usage:\r
  - Run from the root directory.\r
"""`,
    );
    expect(values(source, result, "keyword")).toEqual(expect.arrayContaining(["import", "from", "def", "return"]));
    expect(values(source, result, "type")).toContain("Path");
    expect(values(source, result, "function")).toEqual(expect.arrayContaining(["build_docs"]));
    expect(values(source, result, "property")).toContain("resolve");
    expect(values(source, result, "number")).toContain("3");
    expect(values(source, result, "comment")).toContain("# update generated links");
    expect(values(source, result, "meta")).toContain("@decorator");
    expect(result.limited).toBe(false);
    expectExactPartition(source, result);
  });

  it.each([
    ["typescript", "interface User { readonly name: string } // note", "keyword", "interface"],
    ["javascript", "const answer = fn(`value ${x}`); // note", "string", "`value ${x}`"],
    ["c", "#include <stdio.h>\nint main(void) { return 0; }", "meta", "#include <stdio.h>"],
    ["cpp", "template <class T> T value() { return T{}; }", "keyword", "template"],
    ["rust", "fn main() { let value: usize = 1; /* outer /* inner */ ok */ }", "type", "usize"],
    ["go", "package main\nfunc main() { var ok bool = true }", "keyword", "package"],
    ["java", "public class App { String name = \"demo\"; }", "type", "String"],
    ["kotlin", "data class User(val name: String)", "keyword", "data"],
    ["csharp", "public record User(string Name);", "keyword", "record"],
    ["shell", "#!/bin/sh\nfor item in $items; do echo \"$item\"; done", "variable", "$items"],
    ["powershell", "param([string]$Name) # note", "variable", "$Name"],
    ["proto", "message User { optional string name = 1; }", "type", "string"],
    ["generic", "class Widget # long-tail comment", "keyword", "class"],
  ] as const)("highlights a representative %s token", (language, source, kind, expected) => {
    const result = highlightSyntax(source, language);
    expect(values(source, result, kind)).toContain(expected);
    expectExactPartition(source, result);
  });

  it.each([
    ["markup", "<article data-id=\"7\"><h1>Hello</h1><!-- note --></article>", "tag", "article"],
    ["template", "<p class=\"lead\">{{ greeting }}</p>", "meta", "{{ greeting }}"],
    ["css", ".card { color: #aabbcc; width: 12px; }", "property", "color"],
    ["json", "{\"name\": \"demo\", \"ready\": true}", "property", "\"name\""],
    ["yaml", "name: demo\nready: true # note", "property", "name"],
    ["toml", "[package]\nname = \"demo\"", "heading", "package"],
    ["ini", "[section]\nname=value ; note", "property", "name"],
    ["sql", "SELECT count(*) FROM users WHERE name = 'Ada';", "function", "count"],
    ["graphql", "query User($id: ID!) { user(id: $id) { name } }", "variable", "$id"],
    ["markdown", "# Heading\nSee [documentation](https://example.com).", "link", "[documentation](https://example.com)"],
    ["tex", "\\section{Intro} % note", "keyword", "\\section"],
    ["diff", "@@ -1 +1 @@\n-old\n+new", "inserted", "+new"],
    ["make", "build: $(OBJECTS)\n\tcc -o app", "variable", "$(OBJECTS)"],
    ["build", "FROM node:22\nENV HOME=\"/app\"", "keyword", "FROM"],
    ["batch", "set NAME=World\necho %NAME%", "variable", "%NAME%"],
  ] as const)("highlights representative %s structure", (language, source, kind, expected) => {
    const result = highlightSyntax(source, language);
    expect(values(source, result, kind)).toContain(expected);
    expectExactPartition(source, result);
  });

  it("classifies both sides and metadata of a diff", () => {
    const source = "--- a/file\r\n+++ b/file\r\n@@ -1 +1 @@\r\n-old 🐛\r\n+new 修复\r\n";
    const result = highlightSyntax(source, "diff");
    expect(values(source, result, "meta")).toEqual(["--- a/file", "+++ b/file"]);
    expect(values(source, result, "heading")).toEqual(["@@ -1 +1 @@"]);
    expect(values(source, result, "deleted")).toEqual(["-old 🐛"]);
    expect(values(source, result, "inserted")).toEqual(["+new 修复"]);
    expectExactPartition(source, result);
  });

  it("distinguishes Rust lifetimes and labels from character literals", () => {
    const source = "fn borrow<'a>(value: &'a str) -> &'a str {\n    'outer: loop { break 'outer; }\n    let ch = 'x';\n}\n";
    const result = highlightSyntax(source, "rust");

    expect(values(source, result, "variable")).toEqual(["'a", "'a", "'a", "'outer", "'outer"]);
    expect(values(source, result, "string")).toEqual(["'x'"]);
    expect(values(source, result, "keyword")).toEqual(expect.arrayContaining(["fn", "loop", "break", "let"]));
    expectExactPartition(source, result);
  });

  it("separates TOML table punctuation and classifies every key segment", () => {
    const source = `# package metadata
[package."release channel"]
name = "demo"
owner . 'display-name' . 2026 = true

[[targets]]
path = 'src/main.ts'
limits = { soft = +inf, hard = -inf, retry.count = 3 }
`;
    const result = highlightSyntax(source, "toml");

    expect(values(source, result, "heading")).toEqual(["package", '"release channel"', "targets"]);
    expect(values(source, result, "property")).toEqual([
      "name",
      "owner",
      "'display-name'",
      "2026",
      "path",
      "limits",
      "soft",
      "hard",
      "retry",
      "count",
    ]);
    expect(values(source, result, "string")).toEqual(['"demo"', "'src/main.ts'"]);
    expect(values(source, result, "constant")).toEqual(["true"]);
    expect(values(source, result, "number")).toEqual(["+inf", "-inf", "3"]);
    expect(values(source, result, "comment")).toEqual(["# package metadata"]);
    expect(values(source, result, "operator")).toEqual(expect.arrayContaining(["[", ".", "]", "[[", "]]", "="]));
    expectExactPartition(source, result);
  });
});

describe("syntax highlighting safety and bounds", () => {
  it("preserves hostile-looking text, CRLF, CJK, and surrogate pairs exactly", () => {
    const source = '<script>window.pwned = true</script>\r\n<img src=x onerror="alert(1)">\r\n中文 😀 🧪';
    for (const language of ["plain", "markup", "javascript", "generic"] as const) {
      const result = highlightSyntax(source, language);
      expectExactPartition(source, result);
      expect(result.limited).toBe(false);
    }
  });

  it.each([
    ["python", "value = '''unterminated\r\n中文 😀"],
    ["javascript", "const value = `unterminated ${name}"],
    ["c", "int value; /* unterminated\r\ncomment"],
    ["json", "{\"name\": \"unterminated"],
    ["markup", "<div title=\"unterminated"],
    ["toml", "description = '''unterminated"],
  ] as const)("handles unterminated %s tokens without losing text", (language, source) => {
    const result = highlightSyntax(source, language);
    expectExactPartition(source, result);
    expect(result.runs.at(-1)?.kind).not.toBeUndefined();
  });

  it("caps a 64 KiB adversarial stream and emits one final plain remainder", () => {
    const source = `${"if;".repeat(21_845)}x`;
    expect(source.length).toBe(65_536);
    const result = highlightSyntax(source, "python");

    expect(result.limited).toBe(true);
    expect(result.runs).toHaveLength(MAX_SYNTAX_RUNS);
    expect(result.runs.at(-1)?.kind).toBe("plain");
    expect(result.runs.at(-1)?.end).toBe(source.length);
    expectExactPartition(source, result);
  });

  it("keeps adversarial unmatched Markdown links within a linear search budget", () => {
    const source = "[]".repeat(MAX_SYNTAX_SOURCE_UNITS / 2);
    let suffixUnitsInspected = 0;
    const nativeIndexOf = String.prototype.indexOf;
    const indexOfSpy = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (
      this: string,
      searchString: string,
      position?: number,
    ): number {
      if ((searchString === "](" || searchString === ")") && this.length === source.length) {
        suffixUnitsInspected += Math.max(0, this.length - (position ?? 0));
        if (suffixUnitsInspected > source.length * 4) {
          throw new Error("Markdown link scanning exceeded its linear suffix-search budget");
        }
      }
      return nativeIndexOf.call(this, searchString, position);
    });

    let result: SyntaxHighlight;
    try {
      result = highlightSyntax(source, "markdown");
    } finally {
      indexOfSpy.mockRestore();
    }

    expect(suffixUnitsInspected).toBeLessThanOrEqual(source.length * 4);
    expect(values(source, result, "link")).toEqual([]);
    expect(result.limited).toBe(false);
    expectExactPartition(source, result);
  });

  it("keeps a 64 KiB short-line build file within a linear separator-search budget", () => {
    const source = "x\n".repeat(MAX_SYNTAX_SOURCE_UNITS / 2);
    let suffixUnitsInspected = 0;
    const nativeIndexOf = String.prototype.indexOf;
    const indexOfSpy = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (
      this: string,
      searchString: string,
      position?: number,
    ): number {
      if ((searchString === ":" || searchString === "=") && this.length === source.length) {
        suffixUnitsInspected += Math.max(0, this.length - (position ?? 0));
        if (suffixUnitsInspected > source.length * 2) {
          throw new Error("Build separator scanning exceeded its linear suffix-search budget");
        }
      }
      return nativeIndexOf.call(this, searchString, position);
    });

    let result: SyntaxHighlight;
    try {
      result = highlightSyntax(source, "build");
    } finally {
      indexOfSpy.mockRestore();
    }

    expect(suffixUnitsInspected).toBeLessThanOrEqual(source.length * 2);
    expect(result.limited).toBe(false);
    expectExactPartition(source, result);
  });

  it("never tokenizes beyond 65,536 UTF-16 units", () => {
    const prefix = "x".repeat(MAX_SYNTAX_SOURCE_UNITS);
    const unscanned = "if;return;\"suffix\";".repeat(8_000);
    const source = prefix + unscanned;
    const result = highlightSyntax(source, "python");

    expect(result.limited).toBe(true);
    expect(result.runs).toEqual([{ start: 0, end: source.length, kind: "plain" }]);
    expectExactPartition(source, result);
  });

  it("coalesces a plain boundary run when both hard limits meet", () => {
    const scanned = `${"a".repeat(31)};`.repeat(2_048);
    expect(scanned.length).toBe(MAX_SYNTAX_SOURCE_UNITS);
    const source = `${scanned}suffix`;
    const result = highlightSyntax(source, "python");

    expect(result.limited).toBe(true);
    expect(result.runs.at(-1)?.kind).toBe("plain");
    expectExactPartition(source, result);
  });

  it("uses one literal run for plaintext fallback and no runs for an empty file", () => {
    const source = "ordinary text\r\n中文 😀 <not markup>";
    const detected = highlightSyntaxForPath("notes.unknown", source);
    expect(detected).toEqual({
      language: "plain",
      runs: [{ start: 0, end: source.length, kind: "plain" }],
      limited: false,
    });
    expect(highlightSyntax("", "plain")).toEqual({ language: "plain", runs: [], limited: false });
    expectExactPartition(source, detected);
    expectExactPartition("", highlightSyntax("", "plain"));
  });
});
