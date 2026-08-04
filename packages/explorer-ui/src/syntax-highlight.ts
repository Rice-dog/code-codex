/**
 * A small, deterministic syntax highlighter for the bounded text preview.
 *
 * This is intentionally a lexical highlighter, not a parser. It never executes
 * source, builds regular expressions from source, or recursively parses
 * embedded languages. Every scanner advances monotonically through the input.
 */

export const SYNTAX_TOKEN_KINDS = [
  "plain",
  "comment",
  "string",
  "number",
  "keyword",
  "type",
  "function",
  "property",
  "tag",
  "attribute",
  "variable",
  "constant",
  "selector",
  "heading",
  "link",
  "inserted",
  "deleted",
  "meta",
  "operator",
] as const;

export type SyntaxTokenKind = (typeof SYNTAX_TOKEN_KINDS)[number];

export const SYNTAX_LANGUAGES = [
  "plain",
  "python",
  "javascript",
  "typescript",
  "c",
  "cpp",
  "rust",
  "go",
  "java",
  "kotlin",
  "csharp",
  "shell",
  "powershell",
  "batch",
  "markup",
  "template",
  "css",
  "json",
  "yaml",
  "toml",
  "ini",
  "sql",
  "graphql",
  "proto",
  "markdown",
  "tex",
  "diff",
  "make",
  "build",
  "generic",
] as const;

export type SyntaxLanguage = (typeof SYNTAX_LANGUAGES)[number];

export interface SyntaxRun {
  readonly start: number;
  readonly end: number;
  readonly kind: SyntaxTokenKind;
}

export interface SyntaxHighlight {
  readonly language: SyntaxLanguage;
  readonly runs: readonly SyntaxRun[];
  readonly limited: boolean;
}

// A typical 64 KiB source preview can exceed 4,096 alternating styled/plain
// runs long before reaching the preview-size boundary. Keep pathological DOM
// output bounded, but leave enough room to highlight ordinary previews fully.
export const MAX_SYNTAX_RUNS = 16_384;
export const MAX_SYNTAX_SOURCE_UNITS = 65_536;

const exactLanguages = new Map<string, SyntaxLanguage>([
  ["makefile", "make"],
  ["gnumakefile", "make"],
  ["cmakelists.txt", "make"],
  ["dockerfile", "build"],
  ["containerfile", "build"],
  ["justfile", "build"],
  ["taskfile", "build"],
  ["procfile", "build"],
  ["gemfile", "generic"],
  ["rakefile", "generic"],
  ["vagrantfile", "generic"],
  ["brewfile", "generic"],
  ["package-lock.json", "json"],
  ["npm-shrinkwrap.json", "json"],
  ["composer.lock", "json"],
  ["deno.lock", "json"],
  ["pipfile.lock", "json"],
  ["pnpm-lock.yaml", "yaml"],
  ["yarn.lock", "yaml"],
  ["cargo.lock", "toml"],
  ["poetry.lock", "toml"],
  ["go.mod", "generic"],
  ["go.sum", "plain"],
  [".editorconfig", "ini"],
  [".babelrc", "json"],
  [".eslintrc", "generic"],
  [".prettierrc", "generic"],
  [".stylelintrc", "generic"],
  [".gitignore", "generic"],
  [".gitattributes", "generic"],
  [".gitmodules", "ini"],
  ["readme", "markdown"],
  ["changelog", "markdown"],
  ["contributing", "markdown"],
  ["code_of_conduct", "markdown"],
]);

const extensionLanguages: Readonly<Record<string, SyntaxLanguage>> = Object.freeze({
  txt: "plain",
  text: "plain",
  log: "plain",
  csv: "plain",
  tsv: "plain",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  rst: "markdown",
  adoc: "markdown",
  asciidoc: "markdown",
  tex: "tex",
  diff: "diff",
  patch: "diff",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyi: "python",
  pyw: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  bat: "batch",
  cmd: "batch",
  html: "markup",
  htm: "markup",
  xml: "markup",
  drawio: "markup",
  xsl: "markup",
  xslt: "markup",
  xsd: "markup",
  wxs: "markup",
  wxl: "markup",
  wxi: "markup",
  csproj: "markup",
  fsproj: "markup",
  vbproj: "markup",
  vcxproj: "markup",
  wixproj: "markup",
  props: "markup",
  targets: "markup",
  resx: "markup",
  plist: "markup",
  plantuml: "generic",
  vue: "template",
  svelte: "template",
  astro: "template",
  hbs: "template",
  handlebars: "template",
  mustache: "template",
  ejs: "template",
  njk: "template",
  jinja: "template",
  jinja2: "template",
  j2: "template",
  liquid: "template",
  twig: "template",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  styl: "css",
  json: "json",
  jsonc: "json",
  json5: "json",
  ipynb: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  config: "ini",
  properties: "ini",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  cmake: "make",
  mk: "make",
  make: "make",
  swift: "generic",
  fs: "generic",
  fsx: "generic",
  vb: "generic",
  php: "generic",
  rb: "generic",
  rake: "generic",
  lua: "generic",
  pl: "generic",
  pm: "generic",
  r: "generic",
  dart: "generic",
  scala: "generic",
  sc: "generic",
  groovy: "generic",
  gvy: "generic",
  ex: "generic",
  exs: "generic",
  erl: "generic",
  hrl: "generic",
  clj: "generic",
  cljs: "generic",
  cljc: "generic",
  edn: "generic",
  hs: "generic",
  lhs: "generic",
  ml: "generic",
  mli: "generic",
  sol: "generic",
  zig: "generic",
  nim: "generic",
  jl: "generic",
  gradle: "generic",
  sbt: "generic",
  lock: "generic",
  sum: "plain",
  mod: "generic",
});

function pathBasename(path: string): string {
  const normalized = path.trim().replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  return normalized.slice(slash + 1).toLowerCase();
}

/** Selects a profile solely from a case-insensitive path. */
export function syntaxLanguageForPath(path: string): SyntaxLanguage {
  const name = pathBasename(path);
  if (!name) return "plain";
  const exact = exactLanguages.get(name);
  if (exact) return exact;

  if (name.startsWith("dockerfile.")) return "build";
  if (name.startsWith("containerfile.")) return "build";

  const dot = name.lastIndexOf(".");
  if (dot < 0 && (name.startsWith("license-") || name.startsWith("licence-"))) return "plain";
  if (dot < 0 || dot === name.length - 1) return "plain";
  return extensionLanguages[name.slice(dot + 1)] ?? "plain";
}

class RunBuilder {
  readonly runs: SyntaxRun[] = [];
  limited = false;
  #cursor = 0;

  constructor(readonly sourceLength: number) {}

  mark(start: number, end: number, kind: SyntaxTokenKind): boolean {
    if (this.limited) return false;
    const safeStart = Math.max(this.#cursor, Math.min(start, this.sourceLength));
    const safeEnd = Math.max(safeStart, Math.min(end, this.sourceLength));
    if (safeStart > this.#cursor && !this.#append(safeStart, "plain")) return false;
    if (safeEnd > this.#cursor && !this.#append(safeEnd, kind)) return false;
    return !this.limited;
  }

  finish(): readonly SyntaxRun[] {
    if (!this.limited && this.#cursor < this.sourceLength) this.#append(this.sourceLength, "plain");
    return this.runs;
  }

  #append(end: number, kind: SyntaxTokenKind): boolean {
    if (end <= this.#cursor) return true;
    const last = this.runs[this.runs.length - 1];
    if (last?.kind === kind) {
      this.runs[this.runs.length - 1] = { start: last.start, end, kind };
      this.#cursor = end;
      return true;
    }

    // Reserve one final run for a literal, unclassified remainder.
    if (this.runs.length >= MAX_SYNTAX_RUNS - 1 && end < this.sourceLength) {
      const remainderStart = this.#cursor;
      if (last?.kind === "plain") {
        this.runs[this.runs.length - 1] = { start: last.start, end: this.sourceLength, kind: "plain" };
      } else {
        this.runs.push({ start: remainderStart, end: this.sourceLength, kind: "plain" });
      }
      this.#cursor = this.sourceLength;
      this.limited = true;
      return false;
    }

    this.runs.push({ start: this.#cursor, end, kind });
    this.#cursor = end;
    return true;
  }
}

function codeAt(source: string, index: number): number {
  return source.charCodeAt(index);
}

function isDigit(source: string, index: number): boolean {
  const code = codeAt(source, index);
  return code >= 48 && code <= 57;
}

function isHexDigit(source: string, index: number): boolean {
  const code = codeAt(source, index);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

function isIdentifierStart(source: string, index: number): boolean {
  const code = codeAt(source, index);
  return code === 36 || code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code >= 128;
}

function isIdentifierPart(source: string, index: number): boolean {
  return isIdentifierStart(source, index) || isDigit(source, index);
}

function wordEnd(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && isIdentifierPart(source, index)) index += 1;
  return index;
}

function lineEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index += 1;
  return index;
}

function nextLine(source: string, end: number): number {
  if (source[end] === "\r" && source[end + 1] === "\n") return end + 2;
  if (source[end] === "\r" || source[end] === "\n") return end + 1;
  return end;
}

function lineStartThrough(source: string, current: number, end: number): number {
  const newline = source.lastIndexOf("\n", end - 1);
  return newline >= current ? newline + 1 : current;
}

function skipHorizontalSpace(source: string, start: number): number {
  let index = start;
  while (source[index] === " " || source[index] === "\t") index += 1;
  return index;
}

function previousNonSpace(source: string, start: number): string {
  let index = start - 1;
  while (index >= 0 && (source[index] === " " || source[index] === "\t")) index -= 1;
  return index >= 0 ? (source[index] ?? "") : "";
}

function startsAt(source: string, index: number, value: string): boolean {
  return source.startsWith(value, index);
}

function scanBlock(source: string, start: number, close: string): number {
  const found = source.indexOf(close, start);
  return found < 0 ? source.length : found + close.length;
}

function scanQuoted(source: string, start: number, quote: string, triple = false): number {
  const delimiter = triple ? quote + quote + quote : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (source[index] === "\\") {
      index = Math.min(source.length, index + 2);
      continue;
    }
    if (source.startsWith(delimiter, index)) return index + delimiter.length;
    index += 1;
  }
  return source.length;
}

function scanNumber(source: string, start: number): number {
  let index = start;
  if (source[index] === "0" && (source[index + 1] === "x" || source[index + 1] === "X")) {
    index += 2;
    while (index < source.length && (isHexDigit(source, index) || source[index] === "_")) index += 1;
    return index;
  }
  if (source[index] === "0" && "bBoO".includes(source[index + 1] ?? "")) {
    index += 2;
    while (index < source.length && (isDigit(source, index) || source[index] === "_")) index += 1;
    return index;
  }
  while (index < source.length && (isDigit(source, index) || source[index] === "_")) index += 1;
  if (source[index] === "." && isDigit(source, index + 1)) {
    index += 1;
    while (index < source.length && (isDigit(source, index) || source[index] === "_")) index += 1;
  }
  if (source[index] === "e" || source[index] === "E") {
    const exponent = index;
    index += 1;
    if (source[index] === "+" || source[index] === "-") index += 1;
    const digits = index;
    while (index < source.length && (isDigit(source, index) || source[index] === "_")) index += 1;
    if (digits === index) index = exponent;
  }
  if ("fFdDmMjJ".includes(source[index] ?? "")) index += 1;
  return index;
}

const commonConstants = new Set(["true", "false", "null", "none", "nil", "undefined", "nan", "infinity"]);

interface CodeProfile {
  readonly keywords: ReadonlySet<string>;
  readonly types?: ReadonlySet<string>;
  readonly hashComments?: boolean;
  readonly slashComments?: boolean;
  readonly blockComments?: boolean;
  readonly nestedBlockComments?: boolean;
  readonly backticks?: boolean;
  readonly variables?: "$" | "powershell";
  readonly preprocessor?: boolean;
  readonly decorators?: boolean;
  readonly pythonStrings?: boolean;
  readonly rustRawStrings?: boolean;
  readonly rustLifetimes?: boolean;
  readonly caseInsensitive?: boolean;
}

function words(value: string): ReadonlySet<string> {
  return new Set(value.split(" "));
}

const pythonKeywords = words(
  "and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield",
);
const pythonTypes = words(
  "bool bytearray bytes complex dict float frozenset int list memoryview object range set slice str tuple type Path Exception BaseException",
);
const javascriptKeywords = words(
  "async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield",
);
const typescriptKeywords = new Set([
  ...javascriptKeywords,
  ..."abstract any as asserts bigint boolean declare enum implements infer interface is keyof module namespace never override private protected public readonly require satisfies string symbol type unknown using number object".split(" "),
]);
const cKeywords = words(
  "alignas alignof auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while _Atomic _Bool _Complex _Generic _Imaginary _Noreturn _Static_assert _Thread_local",
);
const cTypes = words("bool char double float int long short signed size_t ssize_t uint8_t uint16_t uint32_t uint64_t unsigned void wchar_t");
const cppKeywords = new Set([
  ...cKeywords,
  ..."alignas alignof and and_eq asm bitand bitor catch char8_t char16_t char32_t class compl concept consteval constexpr constinit const_cast co_await co_return co_yield decltype delete dynamic_cast explicit export false friend mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public reflexpr reinterpret_cast requires static_assert static_cast template this thread_local throw true try typeid typename using virtual xor xor_eq".split(" "),
]);
const rustKeywords = words(
  "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
);
const rustTypes = words("bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Option Result Box");
const goKeywords = words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var");
const goTypes = words("any bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr");
const javaKeywords = words(
  "abstract assert break case catch class const continue default do else enum exports extends final finally for goto if implements import instanceof interface module native new non-sealed open opens package permits private protected provides public record requires return sealed static strictfp super switch synchronized this throw throws to transient transitive try uses var void volatile while with yield",
);
const javaTypes = words("boolean byte char double float int long short String Object Integer Long Double Float Boolean Class Exception");
const kotlinKeywords = words(
  "as break by catch class companion const constructor continue data delegate do dynamic else enum expect external false field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline null object open operator out override package param private property protected public receiver reified return sealed set setparam super suspend tailrec this throw true try typealias typeof val var vararg when where while",
);
const csharpKeywords = words(
  "abstract as async await base break case catch checked class const continue decimal default delegate do else enum event explicit extern false finally fixed for foreach from get global goto group if implicit in init interface internal into is join let lock namespace new null object on operator orderby out override params partial private protected public readonly record ref remove required return sbyte sealed select set sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unmanaged unsafe ushort using value var virtual void volatile when where while with yield",
);
const shellKeywords = words("case do done elif else esac fi for function if in select then time until while coproc declare export local readonly source trap unset");
const powershellKeywords = words(
  "begin break catch class continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function if in param process return switch throw trap try until using var while workflow",
);
const genericKeywords = words(
  "and as async await begin break case catch class const continue def do else elseif elsif end enum export extends false finally fn for foreach from func function if import in include interface let match module namespace new nil not null of or package private protected public raise require rescue return static struct switch then throw trait true try type use using val var when where while yield",
);

function isPythonPrefix(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === "r" || lower === "u" || lower === "b" || lower === "f" || lower === "br" || lower === "rb" || lower === "fr" || lower === "rf" || lower === "ur" || lower === "ru";
}

function scanRustRawString(source: string, start: number): number {
  if (source[start] !== "r") return start;
  let index = start + 1;
  let hashes = 0;
  while (source[index] === "#") {
    hashes += 1;
    index += 1;
  }
  if (source[index] !== '"') return start;
  index += 1;
  const close = '"' + "#".repeat(hashes);
  return scanBlock(source, index, close);
}

function scanNestedComment(source: string, start: number): number {
  let index = start + 2;
  let depth = 1;
  while (index < source.length) {
    if (startsAt(source, index, "/*")) {
      depth += 1;
      index += 2;
    } else if (startsAt(source, index, "*/")) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function scanVariable(source: string, start: number): number {
  if (source[start] !== "$") return start;
  if (source[start + 1] === "{") return scanBlock(source, start + 2, "}");
  let index = start + 1;
  if (source[index] === "?" || source[index] === "!" || source[index] === "#" || isDigit(source, index)) return index + 1;
  if (source[index] === "@") index += 1;
  while (index < source.length && (isIdentifierPart(source, index) || source[index] === ":" || source[index] === "-")) index += 1;
  return Math.max(index, start + 1);
}

function scanCode(source: string, profile: CodeProfile): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  let currentLineStart = 0;
  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";

    if (profile.preprocessor && char === "#") {
      if (skipHorizontalSpace(source, currentLineStart) === index) {
        const end = lineEnd(source, index);
        builder.mark(index, end, "meta");
        index = end;
        continue;
      }
    }
    if (profile.hashComments && char === "#") {
      const kind = index === 0 && source[index + 1] === "!" ? "meta" : "comment";
      const end = lineEnd(source, index);
      builder.mark(index, end, kind);
      index = end;
      continue;
    }
    if (profile.slashComments && startsAt(source, index, "//")) {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (profile.blockComments && startsAt(source, index, "/*")) {
      const end = profile.nestedBlockComments ? scanNestedComment(source, index) : scanBlock(source, index + 2, "*/");
      builder.mark(index, end, "comment");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }
    if (profile.variables === "powershell" && startsAt(source, index, "<#")) {
      const end = scanBlock(source, index + 2, "#>");
      builder.mark(index, end, "comment");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }

    if (profile.rustRawStrings && char === "r") {
      const rawEnd = scanRustRawString(source, index);
      if (rawEnd > index) {
        builder.mark(index, rawEnd, "string");
        currentLineStart = lineStartThrough(source, currentLineStart, rawEnd);
        index = rawEnd;
        continue;
      }
    }

    if (profile.rustLifetimes && char === "'" && isIdentifierStart(source, index + 1)) {
      const lifetimeEnd = wordEnd(source, index + 1);
      // A closing apostrophe makes this a character literal (`'a'`); without
      // one, Rust uses the token as a lifetime or loop label (`'a`, `'outer`).
      if (source[lifetimeEnd] !== "'") {
        builder.mark(index, lifetimeEnd, "variable");
        index = lifetimeEnd;
        continue;
      }
    }

    if (profile.pythonStrings && isIdentifierStart(source, index)) {
      const prefixEnd = wordEnd(source, index);
      const prefix = source.slice(index, prefixEnd);
      const quote = source[prefixEnd];
      if ((quote === "'" || quote === '"') && isPythonPrefix(prefix)) {
        const triple = source.startsWith(quote + quote + quote, prefixEnd);
        const end = scanQuoted(source, prefixEnd, quote, triple);
        builder.mark(index, end, "string");
        currentLineStart = lineStartThrough(source, currentLineStart, end);
        index = end;
        continue;
      }
    }

    if (char === "'" || char === '"' || (profile.backticks && char === "`")) {
      const triple = profile.pythonStrings && source.startsWith(char + char + char, index);
      const end = scanQuoted(source, index, char, triple);
      builder.mark(index, end, "string");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }
    if (isDigit(source, index) || (char === "." && isDigit(source, index + 1))) {
      const end = scanNumber(source, index);
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if (profile.variables && char === "$") {
      const end = scanVariable(source, index);
      builder.mark(index, end, "variable");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }
    if (profile.decorators && char === "@" && isIdentifierStart(source, index + 1)) {
      const end = wordEnd(source, index + 1);
      builder.mark(index, end, "meta");
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index)) {
      const end = wordEnd(source, index);
      const original = source.slice(index, end);
      const word = profile.caseInsensitive ? original.toLowerCase() : original;
      let kind: SyntaxTokenKind = "plain";
      if (profile.keywords.has(word)) kind = "keyword";
      else if (commonConstants.has(word.toLowerCase())) kind = "constant";
      else if (profile.types?.has(word)) kind = "type";
      else if (previousNonSpace(source, index) === ".") kind = "property";
      else if (source[skipHorizontalSpace(source, end)] === "(") kind = "function";
      else if (original.length > 1 && codeAt(original, 0) >= 65 && codeAt(original, 0) <= 90) kind = "type";
      if (kind !== "plain") builder.mark(index, end, kind);
      index = end;
      continue;
    }
    if ("{}[]()<>:=+-*/%&|!~^?,.;@".includes(char)) builder.mark(index, index + 1, "operator");
    if (char === "\n" || (char === "\r" && source[index + 1] !== "\n")) currentLineStart = index + 1;
    index += 1;
  }
  builder.finish();
  return builder;
}

function scanMarkup(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  while (index < source.length && !builder.limited) {
    if (startsAt(source, index, "<!--")) {
      const end = scanBlock(source, index + 4, "-->");
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (startsAt(source, index, "{{") || startsAt(source, index, "{%") || startsAt(source, index, "<%")) {
      const close = startsAt(source, index, "{{") ? "}}" : startsAt(source, index, "{%") ? "%}" : "%>";
      const end = scanBlock(source, index + 2, close);
      builder.mark(index, end, "meta");
      index = end;
      continue;
    }
    if (source[index] !== "<") {
      index += 1;
      continue;
    }
    if (source[index + 1] === "!" || source[index + 1] === "?") {
      const close = source[index + 1] === "?" ? "?>" : ">";
      const end = scanBlock(source, index + 2, close);
      builder.mark(index, end, "meta");
      index = end;
      continue;
    }
    builder.mark(index, index + 1, "operator");
    index += 1;
    if (source[index] === "/") {
      builder.mark(index, index + 1, "operator");
      index += 1;
    }
    if (isIdentifierStart(source, index)) {
      const end = wordEnd(source, index);
      builder.mark(index, end, "tag");
      index = end;
    }
    while (index < source.length && !builder.limited) {
      const char = source[index] ?? "";
      if (char === ">") {
        builder.mark(index, index + 1, "operator");
        index += 1;
        break;
      }
      if (char === "/" && source[index + 1] === ">") {
        builder.mark(index, index + 2, "operator");
        index += 2;
        break;
      }
      if (char === "'" || char === '"') {
        const end = scanQuoted(source, index, char);
        builder.mark(index, end, "string");
        index = end;
        continue;
      }
      if (char === "=") {
        builder.mark(index, index + 1, "operator");
        index += 1;
        continue;
      }
      if (isIdentifierStart(source, index)) {
        const end = wordEnd(source, index);
        builder.mark(index, end, "attribute");
        index = end;
        continue;
      }
      index += 1;
    }
  }
  builder.finish();
  return builder;
}

function scanCss(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  let depth = 0;
  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";
    if (startsAt(source, index, "/*")) {
      const end = scanBlock(source, index + 2, "*/");
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = scanQuoted(source, index, char);
      builder.mark(index, end, "string");
      index = end;
      continue;
    }
    if (char === "@") {
      const end = isIdentifierStart(source, index + 1) ? wordEnd(source, index + 1) : index + 1;
      builder.mark(index, end, "meta");
      index = end;
      continue;
    }
    if (char === "#") {
      let end = index + 1;
      while (end < source.length && isHexDigit(source, end)) end += 1;
      builder.mark(index, end, depth > 0 && end - index >= 4 ? "constant" : "selector");
      index = end;
      continue;
    }
    if (isDigit(source, index) || (char === "." && isDigit(source, index + 1))) {
      let end = scanNumber(source, index);
      while (end < source.length && isIdentifierPart(source, end)) end += 1;
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index) || (char === "-" && isIdentifierStart(source, index + 1))) {
      const wordStart = char === "-" ? index + 1 : index;
      let end = wordEnd(source, wordStart);
      while (source[end] === "-" && isIdentifierStart(source, end + 1)) end = wordEnd(source, end + 1);
      const next = source[skipHorizontalSpace(source, end)];
      const kind: SyntaxTokenKind = depth === 0 ? "selector" : next === ":" ? "property" : next === "(" ? "function" : "plain";
      if (kind !== "plain") builder.mark(index, end, kind);
      index = end;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    if ("{}[]():;,.>+~=*!".includes(char)) builder.mark(index, index + 1, "operator");
    index += 1;
  }
  builder.finish();
  return builder;
}

function scanJson(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";
    if (startsAt(source, index, "//")) {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (startsAt(source, index, "/*")) {
      const end = scanBlock(source, index + 2, "*/");
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = scanQuoted(source, index, char);
      const kind = source[skipHorizontalSpace(source, end)] === ":" ? "property" : "string";
      builder.mark(index, end, kind);
      index = end;
      continue;
    }
    if (char === "-" ? isDigit(source, index + 1) : isDigit(source, index)) {
      const end = scanNumber(source, char === "-" ? index + 1 : index);
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index)) {
      const end = wordEnd(source, index);
      const value = source.slice(index, end).toLowerCase();
      if (commonConstants.has(value)) builder.mark(index, end, "constant");
      index = end;
      continue;
    }
    if ("{}[]:,".includes(char)) builder.mark(index, index + 1, "operator");
    index += 1;
  }
  builder.finish();
  return builder;
}

interface TomlKeyScan {
  readonly equals: number;
  readonly segments: readonly [start: number, end: number][];
  readonly separators: readonly number[];
}

function isTomlBareKeyPart(source: string, index: number): boolean {
  const char = source[index] ?? "";
  return isIdentifierPart(source, index) || isDigit(source, index) || char === "-";
}

function scanTomlQuotedKey(source: string, start: number, end: number): number {
  const quote = source[start] ?? "";
  let index = start + 1;
  while (index < end) {
    if (quote === '"' && source[index] === "\\") {
      index = Math.min(end, index + 2);
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return start;
}

function scanTomlKey(source: string, start: number, end: number): TomlKeyScan | null {
  const segments: [number, number][] = [];
  const separators: number[] = [];
  let index = start;

  while (index < end) {
    index = skipHorizontalSpace(source, index);
    const segmentStart = index;
    if (source[index] === '"' || source[index] === "'") {
      index = scanTomlQuotedKey(source, index, end);
      if (index === segmentStart) return null;
    } else {
      while (index < end && isTomlBareKeyPart(source, index)) index += 1;
      if (index === segmentStart) return null;
    }
    segments.push([segmentStart, index]);

    index = skipHorizontalSpace(source, index);
    if (source[index] === "=") return { equals: index, segments, separators };
    if (source[index] !== ".") return null;
    separators.push(index);
    index += 1;
  }
  return null;
}

function markTomlKey(builder: RunBuilder, key: TomlKeyScan): void {
  let separatorIndex = 0;
  for (const [start, end] of key.segments) {
    builder.mark(start, end, "property");
    if (builder.limited) return;
    const separator = key.separators[separatorIndex];
    if (separator !== undefined) {
      builder.mark(separator, separator + 1, "operator");
      if (builder.limited) return;
      separatorIndex += 1;
    }
  }
  builder.mark(key.equals, key.equals + 1, "operator");
}

function scanTomlHeader(
  source: string,
  start: number,
  end: number,
  builder: RunBuilder,
): number {
  const arrayTable = startsAt(source, start, "[[");
  const delimiterLength = arrayTable ? 2 : 1;
  builder.mark(start, start + delimiterLength, "operator");

  let index = start + delimiterLength;
  while (index < end && !builder.limited) {
    const char = source[index] ?? "";
    if ((arrayTable && startsAt(source, index, "]]")) || (!arrayTable && char === "]")) {
      builder.mark(index, index + delimiterLength, "operator");
      return index + delimiterLength;
    }
    if (char === '"' || char === "'") {
      const quotedEnd = scanTomlQuotedKey(source, index, end);
      if (quotedEnd === index) {
        builder.mark(index, end, "heading");
        return end;
      }
      builder.mark(index, quotedEnd, "heading");
      index = quotedEnd;
      continue;
    }
    if (char === ".") {
      builder.mark(index, index + 1, "operator");
      index += 1;
      continue;
    }
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    let segmentEnd = index + 1;
    while (
      segmentEnd < end
      && source[segmentEnd] !== "."
      && source[segmentEnd] !== "]"
      && source[segmentEnd] !== " "
      && source[segmentEnd] !== "\t"
    ) {
      segmentEnd += 1;
    }
    builder.mark(index, segmentEnd, "heading");
    index = segmentEnd;
  }
  return index;
}

function scanTomlSpecialNumber(source: string, start: number): number {
  let index = start;
  if (source[index] === "+" || source[index] === "-") index += 1;
  const value = source.slice(index, index + 3);
  if (value !== "inf" && value !== "nan") return start;
  const end = index + 3;
  return isTomlBareKeyPart(source, end) ? start : end;
}

function scanToml(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  const containers: ("array" | "table")[] = [];
  let index = 0;
  let currentLineStart = 0;
  let expectKey = true;

  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";
    if (char === "#") {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }

    const first = skipHorizontalSpace(source, currentLineStart);
    if (containers.length === 0 && index === first && char === "[") {
      index = scanTomlHeader(source, index, lineEnd(source, index), builder);
      expectKey = false;
      continue;
    }

    if (expectKey && (char === '"' || char === "'" || isTomlBareKeyPart(source, index))) {
      const key = scanTomlKey(source, index, lineEnd(source, index));
      if (key) {
        markTomlKey(builder, key);
        index = key.equals + 1;
        expectKey = false;
        continue;
      }
      expectKey = false;
    }

    if (char === "'" || char === '"') {
      const triple = source.startsWith(char + char + char, index);
      const end = scanQuoted(source, index, char, triple);
      builder.mark(index, end, "string");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }

    const specialNumberEnd = scanTomlSpecialNumber(source, index);
    if (specialNumberEnd > index) {
      builder.mark(index, specialNumberEnd, "number");
      index = specialNumberEnd;
      continue;
    }
    if (isDigit(source, index) || ((char === "+" || char === "-") && isDigit(source, index + 1))) {
      const end = scanNumber(source, char === "+" || char === "-" ? index + 1 : index);
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index)) {
      const end = wordEnd(source, index);
      const value = source.slice(index, end);
      if (value === "true" || value === "false") builder.mark(index, end, "constant");
      index = end;
      continue;
    }

    if (char === "{") {
      containers.push("table");
      expectKey = true;
    } else if (char === "[") {
      containers.push("array");
      expectKey = false;
    } else if (char === "}" && containers.at(-1) === "table") {
      containers.pop();
      expectKey = false;
    } else if (char === "]" && containers.at(-1) === "array") {
      containers.pop();
      expectKey = false;
    } else if (char === ",") {
      expectKey = containers.at(-1) === "table";
    }
    if ("=.,[]{}".includes(char)) builder.mark(index, index + 1, "operator");
    if (char === "\n" || (char === "\r" && source[index + 1] !== "\n")) {
      currentLineStart = index + 1;
      expectKey = containers.length === 0;
    }
    index += 1;
  }
  builder.finish();
  return builder;
}

function scanDataConfig(source: string, language: "yaml" | "ini"): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  let currentLineStart = 0;
  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";
    if (char === "#" || (language === "ini" && char === ";")) {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = scanQuoted(source, index, char);
      builder.mark(index, end, "string");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }
    const first = skipHorizontalSpace(source, currentLineStart);
    if (language === "ini" && index === first && char === "[") {
      const close = source.indexOf("]", index + 1);
      const end = close < 0 || close > lineEnd(source, index) ? lineEnd(source, index) : close + 1;
      builder.mark(index, end, "heading");
      index = end;
      continue;
    }
    if (language === "yaml" && (char === "&" || char === "*" || char === "!")) {
      let end = index + 1;
      while (end < source.length && (isIdentifierPart(source, end) || "-./".includes(source[end] ?? ""))) end += 1;
      builder.mark(index, end, char === "!" ? "type" : "variable");
      index = end;
      continue;
    }
    if (isDigit(source, index) || (char === "-" && isDigit(source, index + 1))) {
      const end = scanNumber(source, char === "-" ? index + 1 : index);
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index)) {
      let end = wordEnd(source, index);
      while (source[end] === "-" && isIdentifierStart(source, end + 1)) end = wordEnd(source, end + 1);
      const value = source.slice(index, end).toLowerCase();
      const next = source[skipHorizontalSpace(source, end)];
      const assignment = language === "yaml" ? next === ":" : next === "=" || next === ":";
      if (assignment) builder.mark(index, end, "property");
      else if (commonConstants.has(value) || value === "yes" || value === "no" || value === "on" || value === "off") {
        builder.mark(index, end, "constant");
      }
      index = end;
      continue;
    }
    if ((language === "yaml" && "-?:,[]{}|>".includes(char)) || (language === "ini" && "=.,[]{}".includes(char))) {
      builder.mark(index, index + 1, "operator");
    }
    if (char === "\n" || (char === "\r" && source[index + 1] !== "\n")) currentLineStart = index + 1;
    index += 1;
  }
  builder.finish();
  return builder;
}

const sqlKeywords = words(
  "add all alter analyze and any as asc begin between by case check column commit constraint create cross database default delete desc distinct drop else end exists explain false fetch foreign from full grant group having if in index inner insert intersect into is join key left like limit not null offset on or order outer primary references returning revoke right rollback row schema select set table then true union unique update using values view when where with",
);
const graphqlKeywords = words("directive enum extend fragment implements input interface mutation on query repeatable scalar schema subscription type union");
const protoKeywords = words("enum extend extensions import map message oneof option optional package public repeated reserved returns rpc service stream syntax to weak");
const protoTypes = words("bool bytes double fixed32 fixed64 float int32 int64 sfixed32 sfixed64 sint32 sint64 string uint32 uint64");

function scanSql(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";
    if (startsAt(source, index, "--")) {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (startsAt(source, index, "/*")) {
      const end = scanBlock(source, index + 2, "*/");
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const end = scanQuoted(source, index, char);
      builder.mark(index, end, "string");
      index = end;
      continue;
    }
    if (char === "@" || char === ":") {
      const end = isIdentifierStart(source, index + 1) ? wordEnd(source, index + 1) : index + 1;
      builder.mark(index, end, "variable");
      index = end;
      continue;
    }
    if (isDigit(source, index)) {
      const end = scanNumber(source, index);
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index)) {
      const end = wordEnd(source, index);
      const word = source.slice(index, end).toLowerCase();
      if (sqlKeywords.has(word)) builder.mark(index, end, "keyword");
      else if (source[skipHorizontalSpace(source, end)] === "(") builder.mark(index, end, "function");
      index = end;
      continue;
    }
    if ("()[],.;=<>+-*/%".includes(char)) builder.mark(index, index + 1, "operator");
    index += 1;
  }
  builder.finish();
  return builder;
}

function scanGraphql(source: string): RunBuilder {
  const builder = scanCode(source, {
    keywords: graphqlKeywords,
    hashComments: true,
    decorators: true,
    variables: "$",
  });
  // GraphQL's triple-quoted strings need the same bounded behavior as Python.
  // scanCode already treats their three adjacent strings as one coalesced run.
  return builder;
}

function findMarkdownLinkMiddle(source: string, start: number, end: number): number {
  let index = start;
  while (index + 1 < end) {
    if (source[index] === "]" && source[index + 1] === "(") return index;
    index += 1;
  }
  return -1;
}

function findMarkdownLinkClose(source: string, start: number, end: number): number {
  let index = start;
  while (index < end) {
    if (source[index] === ")") return index;
    index += 1;
  }
  return -1;
}

function scanMarkdown(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let lineStart = 0;
  let fenced = false;
  while (lineStart < source.length && !builder.limited) {
    const end = lineEnd(source, lineStart);
    const first = skipHorizontalSpace(source, lineStart);
    const fence = source.startsWith("```", first) || source.startsWith("~~~", first);
    if (fence) {
      builder.mark(first, end, "meta");
      fenced = !fenced;
      lineStart = nextLine(source, end);
      continue;
    }
    if (!fenced && source[first] === "#") {
      let hashes = first;
      while (source[hashes] === "#") hashes += 1;
      if (hashes - first <= 6 && (source[hashes] === " " || hashes === end)) {
        builder.mark(first, end, "heading");
        lineStart = nextLine(source, end);
        continue;
      }
    }
    if (fenced) {
      builder.mark(lineStart, end, "string");
      lineStart = nextLine(source, end);
      continue;
    }
    let index = first;
    if (source[index] === ">") {
      builder.mark(index, index + 1, "operator");
      index += 1;
    } else if ((source[index] === "-" || source[index] === "*" || source[index] === "+") && source[index + 1] === " ") {
      builder.mark(index, index + 1, "operator");
      index += 1;
    }
    let linkMiddleUnavailable = false;
    while (index < end && !builder.limited) {
      if (source[index] === "`" && !source.startsWith("```", index)) {
        const close = source.indexOf("`", index + 1);
        const tokenEnd = close < 0 || close >= end ? end : close + 1;
        builder.mark(index, tokenEnd, "string");
        index = tokenEnd;
        continue;
      }
      if (source[index] === "[" && !linkMiddleUnavailable) {
        const middle = findMarkdownLinkMiddle(source, index + 1, end);
        if (middle >= 0) {
          const close = findMarkdownLinkClose(source, middle + 2, end);
          const tokenEnd = close < 0 ? end : close + 1;
          builder.mark(index, tokenEnd, "link");
          index = tokenEnd;
          continue;
        }
        // A later opening bracket has a strictly smaller remaining suffix, so
        // no link middle can exist for it either. Remember the failed search
        // instead of repeatedly scanning the same tail of an adversarial line.
        linkMiddleUnavailable = true;
      }
      if (source.startsWith("http://", index) || source.startsWith("https://", index)) {
        let tokenEnd = index + (source[index + 4] === "s" ? 8 : 7);
        while (tokenEnd < end && source[tokenEnd] !== " " && source[tokenEnd] !== "\t") tokenEnd += 1;
        builder.mark(index, tokenEnd, "link");
        index = tokenEnd;
        continue;
      }
      if (source[index] === "*" || source[index] === "_" || source[index] === "~") builder.mark(index, index + 1, "meta");
      index += 1;
    }
    lineStart = nextLine(source, end);
  }
  builder.finish();
  return builder;
}

function scanTex(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let index = 0;
  while (index < source.length && !builder.limited) {
    const char = source[index] ?? "";
    if (char === "%") {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (char === "\\") {
      let end = index + 1;
      if (isIdentifierStart(source, end)) end = wordEnd(source, end);
      else end = Math.min(source.length, end + 1);
      builder.mark(index, end, "keyword");
      index = end;
      continue;
    }
    if (isDigit(source, index)) {
      const end = scanNumber(source, index);
      builder.mark(index, end, "number");
      index = end;
      continue;
    }
    if ("{}[]&_^~$".includes(char)) builder.mark(index, index + 1, "operator");
    index += 1;
  }
  builder.finish();
  return builder;
}

function scanDiff(source: string): RunBuilder {
  const builder = new RunBuilder(source.length);
  let start = 0;
  while (start < source.length && !builder.limited) {
    const end = lineEnd(source, start);
    let kind: SyntaxTokenKind = "plain";
    if (source.startsWith("+++", start) || source.startsWith("---", start) || source.startsWith("diff ", start) || source.startsWith("index ", start)) kind = "meta";
    else if (source.startsWith("@@", start)) kind = "heading";
    else if (source[start] === "+") kind = "inserted";
    else if (source[start] === "-") kind = "deleted";
    if (kind !== "plain") builder.mark(start, end, kind);
    start = nextLine(source, end);
  }
  builder.finish();
  return builder;
}

const makeKeywords = words("define else endef endif export ifdef ifeq ifndef ifneq include override private sinclude undefine unexport vpath");
const buildKeywords = words("add arg cmd copy entrypoint env expose from healthcheck label maintainer onbuild run shell stopsignal user volume workdir stage image command job steps uses with services targets tasks");

function scanBuild(source: string, language: "make" | "build"): RunBuilder {
  const builder = new RunBuilder(source.length);
  const keywords = language === "make" ? makeKeywords : buildKeywords;
  let start = 0;
  while (start < source.length && !builder.limited) {
    const end = lineEnd(source, start);
    const first = skipHorizontalSpace(source, start);
    if (source[first] === "#") {
      builder.mark(first, end, "comment");
      start = nextLine(source, end);
      continue;
    }
    let index = first;
    if (isIdentifierStart(source, index)) {
      const wordFinish = wordEnd(source, index);
      const word = source.slice(index, wordFinish).toLowerCase();
      if (keywords.has(word)) builder.mark(index, wordFinish, "keyword");
      else {
        let separator = wordFinish;
        while (separator < end && source[separator] !== ":" && source[separator] !== "=") separator += 1;
        if (source[separator] === ":") builder.mark(index, separator, "heading");
      }
      index = wordFinish;
    }
    while (index < end && !builder.limited) {
      const char = source[index] ?? "";
      if (char === "#") {
        builder.mark(index, end, "comment");
        break;
      }
      if (char === "$" && (source[index + 1] === "(" || source[index + 1] === "{")) {
        const close = source[index + 1] === "(" ? ")" : "}";
        const tokenEnd = scanBlock(source, index + 2, close);
        builder.mark(index, Math.min(tokenEnd, end), "variable");
        index = tokenEnd;
        continue;
      }
      if (char === "'" || char === '"') {
        const tokenEnd = Math.min(scanQuoted(source, index, char), end);
        builder.mark(index, tokenEnd, "string");
        index = tokenEnd;
        continue;
      }
      if ("=:|@+-".includes(char)) builder.mark(index, index + 1, "operator");
      index += 1;
    }
    start = nextLine(source, end);
  }
  builder.finish();
  return builder;
}

function scanBatch(source: string): RunBuilder {
  const batchKeywords = words("call cd cls copy del do echo else endlocal errorlevel exist exit for goto if in move not pause popd pushd rem ren set setlocal shift start title type");
  const builder = new RunBuilder(source.length);
  let index = 0;
  let currentLineStart = 0;
  while (index < source.length && !builder.limited) {
    const first = skipHorizontalSpace(source, currentLineStart);
    if (index === first && startsAt(source, index, "::")) {
      const end = lineEnd(source, index);
      builder.mark(index, end, "comment");
      index = end;
      continue;
    }
    if (source[index] === "%") {
      const close = source.indexOf("%", index + 1);
      const end = close < 0 ? lineEnd(source, index) : close + 1;
      builder.mark(index, end, "variable");
      index = end;
      continue;
    }
    if (source[index] === ":" && index === first) {
      const end = lineEnd(source, index);
      builder.mark(index, end, "heading");
      index = end;
      continue;
    }
    if (source[index] === '"') {
      const end = scanQuoted(source, index, '"');
      builder.mark(index, end, "string");
      currentLineStart = lineStartThrough(source, currentLineStart, end);
      index = end;
      continue;
    }
    if (isIdentifierStart(source, index)) {
      const end = wordEnd(source, index);
      const value = source.slice(index, end).toLowerCase();
      if (value === "rem" && index === first) builder.mark(index, lineEnd(source, index), "comment");
      else if (batchKeywords.has(value)) builder.mark(index, end, "keyword");
      index = value === "rem" && index === first ? lineEnd(source, index) : end;
      continue;
    }
    if ("&|<>=()".includes(source[index] ?? "")) builder.mark(index, index + 1, "operator");
    const char = source[index];
    if (char === "\n" || (char === "\r" && source[index + 1] !== "\n")) currentLineStart = index + 1;
    index += 1;
  }
  builder.finish();
  return builder;
}

function profileFor(language: SyntaxLanguage): CodeProfile | null {
  switch (language) {
    case "python":
      return { keywords: pythonKeywords, types: pythonTypes, hashComments: true, decorators: true, pythonStrings: true };
    case "javascript":
      return { keywords: javascriptKeywords, slashComments: true, blockComments: true, backticks: true };
    case "typescript":
      return { keywords: typescriptKeywords, slashComments: true, blockComments: true, backticks: true };
    case "c":
      return { keywords: cKeywords, types: cTypes, slashComments: true, blockComments: true, preprocessor: true };
    case "cpp":
      return { keywords: cppKeywords, types: cTypes, slashComments: true, blockComments: true, preprocessor: true };
    case "rust":
      return { keywords: rustKeywords, types: rustTypes, slashComments: true, blockComments: true, nestedBlockComments: true, decorators: true, rustRawStrings: true, rustLifetimes: true };
    case "go":
      return { keywords: goKeywords, types: goTypes, slashComments: true, blockComments: true, backticks: true };
    case "java":
      return { keywords: javaKeywords, types: javaTypes, slashComments: true, blockComments: true, decorators: true };
    case "kotlin":
      return { keywords: kotlinKeywords, slashComments: true, blockComments: true, decorators: true };
    case "csharp":
      return { keywords: csharpKeywords, slashComments: true, blockComments: true, preprocessor: true, decorators: true };
    case "shell":
      return { keywords: shellKeywords, hashComments: true, backticks: true, variables: "$" };
    case "powershell":
      return { keywords: powershellKeywords, hashComments: true, variables: "powershell", caseInsensitive: true };
    case "proto":
      return { keywords: protoKeywords, types: protoTypes, slashComments: true, blockComments: true };
    case "generic":
      return { keywords: genericKeywords, hashComments: true, slashComments: true, blockComments: true, backticks: true, variables: "$", decorators: true };
    default:
      return null;
  }
}

/** Highlights source with a caller-selected, closed language profile. */
export function highlightSyntax(source: string, language: SyntaxLanguage): SyntaxHighlight {
  // Native previews are currently bounded to the same size, but keep this
  // guard here as a defense in depth for direct callers and future changes.
  const scanSource = source.length > MAX_SYNTAX_SOURCE_UNITS ? source.slice(0, MAX_SYNTAX_SOURCE_UNITS) : source;
  let builder: RunBuilder;
  const profile = profileFor(language);
  if (profile) builder = scanCode(scanSource, profile);
  else {
    switch (language) {
      case "markup":
      case "template":
        builder = scanMarkup(scanSource);
        break;
      case "css":
        builder = scanCss(scanSource);
        break;
      case "json":
        builder = scanJson(scanSource);
        break;
      case "yaml":
      case "ini":
        builder = scanDataConfig(scanSource, language);
        break;
      case "toml":
        builder = scanToml(scanSource);
        break;
      case "sql":
        builder = scanSql(scanSource);
        break;
      case "graphql":
        builder = scanGraphql(scanSource);
        break;
      case "markdown":
        builder = scanMarkdown(scanSource);
        break;
      case "tex":
        builder = scanTex(scanSource);
        break;
      case "diff":
        builder = scanDiff(scanSource);
        break;
      case "make":
      case "build":
        builder = scanBuild(scanSource, language);
        break;
      case "batch":
        builder = scanBatch(scanSource);
        break;
      case "plain":
        builder = new RunBuilder(scanSource.length);
        builder.finish();
        break;
      default:
        // Code-profile languages are handled before this switch.
        builder = new RunBuilder(scanSource.length);
        builder.finish();
        break;
    }
  }

  const runs = builder.runs.slice();
  let limited = builder.limited;
  if (scanSource.length < source.length) {
    const last = runs[runs.length - 1];
    if (!last) {
      runs.push({ start: 0, end: source.length, kind: "plain" });
    } else if (last.kind === "plain") {
      runs[runs.length - 1] = { start: last.start, end: source.length, kind: "plain" };
    } else if (runs.length < MAX_SYNTAX_RUNS) {
      runs.push({ start: scanSource.length, end: source.length, kind: "plain" });
    } else {
      // Preserve the hard run bound by folding only the final classified run
      // into the unscanned remainder.
      const previous = runs[runs.length - 2];
      if (previous?.kind === "plain") {
        runs[runs.length - 2] = { start: previous.start, end: source.length, kind: "plain" };
        runs.pop();
      } else {
        runs[runs.length - 1] = { start: last.start, end: source.length, kind: "plain" };
      }
    }
    limited = true;
  }
  return { language, runs, limited };
}

/** Detects a profile from the path, then highlights without inspecting content. */
export function highlightSyntaxForPath(path: string, source: string): SyntaxHighlight {
  return highlightSyntax(source, syntaxLanguageForPath(path));
}
