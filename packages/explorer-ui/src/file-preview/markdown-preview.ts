import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import TurndownService from "turndown";
// @ts-expect-error This library subpath does not publish declarations.
import { gfm as turndownGfm } from "turndown-plugin-gfm";
import { MAX_SYNTAX_SOURCE_UNITS, highlightSyntaxForPath } from "../syntax-highlight";
import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { MainPreviewTextView, MainPreviewEmptyView, MainPreviewEditorState, MainPreviewDraftDetail } from './contracts';
export const MAIN_PREVIEW_DRAFT_EVENT = "cle-main-preview-draft";

const MARKDOWN_ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

const MARKDOWN_FENCE_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  bash: "sh",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  cs: "cs",
  css: "css",
  diff: "diff",
  go: "go",
  html: "html",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  markdown: "md",
  md: "md",
  powershell: "ps1",
  ps1: "ps1",
  py: "py",
  python: "py",
  rust: "rs",
  rs: "rs",
  shell: "sh",
  sh: "sh",
  sql: "sql",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  yaml: "yaml",
  yml: "yml",
});

function escapeMarkdownHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function markdownFencePath(language: string): string {
  const requested = language.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  const extension = MARKDOWN_FENCE_EXTENSIONS[requested] ?? "txt";
  return `markdown-fence.${extension}`;
}

function renderMarkdownFence(source: string, language: string): string {
  const highlighted = highlightSyntaxForPath(markdownFencePath(language), source);
  let rendered = "";
  for (const run of highlighted.runs) {
    const text = escapeMarkdownHtml(source.slice(run.start, run.end));
    rendered += run.kind === "plain" ? text : `<span class="tok-${run.kind}">${text}</span>`;
  }
  return rendered;
}

function isSafeMarkdownLink(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function markdownDestination(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll(">", "\\>");
  return /[\s()]/.test(escaped) ? `<${escaped}>` : escaped.replaceAll(")", "\\)");
}

function markdownTitle(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeMarkdownTableCell(value: string): string {
  const flattened = value.replace(/[ \t]*(?:\r?\n)+[ \t]*/g, "<br>").trim();
  return flattened.replace(/(^|[^\\])\|/g, "$1\\|");
}

function splitMarkdownFrontMatter(source: string): { readonly body: string; readonly frontMatter?: string } {
  const match = source.match(/^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
  const body = match?.[1] ?? "";
  if (!match || !/^[A-Za-z_][\w.-]*\s*:/m.test(body)) return { body: source };
  return {
    body: source.slice(match[0].length),
    frontMatter: match[0].replace(/\n$/, ""),
  };
}

function normalizedRenderedMarkdown(value: string, preserveTrailingNewline: boolean): string {
  const normalized = value.replaceAll("\u00a0", " ").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  return normalized ? `${normalized}${preserveTrailingNewline ? "\n" : ""}` : "";
}

const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: renderMarkdownFence,
});

const markdownEditorRenderer = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
  breaks: false,
  highlight: (source) => escapeMarkdownHtml(source),
});

function configureMarkdownRenderer(renderer: typeof markdownRenderer, editable: boolean): void {
  renderer.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const alt = String(token?.content ?? "").trim() || String(token?.attrGet("alt") ?? "").trim() || "Image";
    const source = String(token?.attrGet("src") ?? "");
    const title = String(token?.attrGet("title") ?? "");
    return `<span class="markdown-image-placeholder" data-markdown-image-alt="${escapeMarkdownHtml(alt)}" data-markdown-image-src="${escapeMarkdownHtml(source)}" data-markdown-image-title="${escapeMarkdownHtml(title)}">Image · ${escapeMarkdownHtml(alt)}</span>`;
  };

  renderer.renderer.rules.link_open = (tokens, index, options, _env, self) => {
    const token = tokens[index];
    if (token) {
      const href = String(token.attrGet("href") ?? "");
      const title = String(token.attrGet("title") ?? "");
      if (href) token.attrSet("data-markdown-href", href);
      if (title) token.attrSet("data-markdown-title", title);
      const hrefIndex = token.attrIndex("href");
      if (hrefIndex >= 0) token.attrs?.splice(hrefIndex, 1);
      const titleIndex = token.attrIndex("title");
      if (titleIndex >= 0) token.attrs?.splice(titleIndex, 1);
    }
    return self.renderToken(tokens, index, options);
  };

  for (const rule of ["th_open", "td_open"] as const) {
    renderer.renderer.rules[rule] = (tokens, index, options, _env, self) => {
      const token = tokens[index];
      const alignment = String(token?.attrGet("style") ?? "").match(/^text-align:\s*(left|center|right)\s*;?$/i)?.[1]?.toLowerCase();
      const styleIndex = token?.attrIndex("style") ?? -1;
      if (styleIndex >= 0) token?.attrs?.splice(styleIndex, 1);
      if (alignment) {
        token?.attrJoin("class", `markdown-align-${alignment}`);
        token?.attrSet("align", alignment);
      }
      return self.renderToken(tokens, index, options);
    };
  }

  if (editable) {
    const preservedComment = (content: string, block: boolean): string => {
      if (!/^\s*<!--[\s\S]*-->\s*$/.test(content)) return content;
      const encoded = escapeMarkdownHtml(encodeURIComponent(content.trimEnd()));
      return `<span class="markdown-comment-placeholder" data-markdown-comment="${encoded}" data-markdown-comment-block="${String(block)}">HTML comment</span>`;
    };
    renderer.renderer.rules.html_block = (tokens, index) => preservedComment(String(tokens[index]?.content ?? ""), true);
    renderer.renderer.rules.html_inline = (tokens, index) => preservedComment(String(tokens[index]?.content ?? ""), false);
  }
}

configureMarkdownRenderer(markdownRenderer, false);

configureMarkdownRenderer(markdownEditorRenderer, true);

const markdownSerializer = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

markdownSerializer.use(turndownGfm as TurndownService.Plugin);

markdownSerializer.addRule("renderedMarkdownTableCell", {
  filter: ["th", "td"],
  replacement: (content, node) => {
    const siblings = node.parentNode?.childNodes;
    const index = siblings ? Array.prototype.indexOf.call(siblings, node) : 0;
    return `${index === 0 ? "| " : " "}${escapeMarkdownTableCell(content)} |`;
  },
});

markdownSerializer.addRule("preservedMarkdownFrontMatter", {
  filter: (node) => node.nodeName === "DIV" && node.classList.contains("markdown-front-matter-placeholder"),
  replacement: (_content, node) => `\n\n${node.getAttribute("data-markdown-front-matter") ?? ""}\n\n`,
});

markdownSerializer.addRule("preservedMarkdownComment", {
  filter: (node) => node.nodeName === "SPAN" && node.classList.contains("markdown-comment-placeholder"),
  replacement: (_content, node) => {
    const encoded = node.getAttribute("data-markdown-comment") ?? "";
    let comment = "";
    try {
      comment = decodeURIComponent(encoded);
    } catch {
      comment = "";
    }
    return node.getAttribute("data-markdown-comment-block") === "true" ? `\n\n${comment}\n\n` : comment;
  },
});

markdownSerializer.addRule("preservedMarkdownLink", {
  filter: (node) => node.nodeName === "A" && node.hasAttribute("data-markdown-href"),
  replacement: (content, node) => {
    const href = node.getAttribute("data-markdown-href") ?? "";
    const title = node.getAttribute("data-markdown-title") ?? "";
    return `[${content}](${markdownDestination(href)}${title ? ` "${markdownTitle(title)}"` : ""})`;
  },
});

markdownSerializer.addRule("preservedMarkdownImage", {
  filter: (node) => node.nodeName === "SPAN" && node.classList.contains("markdown-image-placeholder"),
  replacement: (_content, node) => {
    const alt = node.getAttribute("data-markdown-image-alt") ?? "Image";
    const source = node.getAttribute("data-markdown-image-src") ?? "";
    const title = node.getAttribute("data-markdown-image-title") ?? "";
    return `![${escapeMarkdownLabel(alt)}](${markdownDestination(source)}${title ? ` "${markdownTitle(title)}"` : ""})`;
  },
});

markdownSerializer.addRule("renderedTaskCheckbox", {
  filter: (node) => node.nodeName === "INPUT" && node.getAttribute("type") === "checkbox" && node.closest("li") !== null,
  replacement: (_content, node) => `${(node as HTMLInputElement).checked ? "[x]" : "[ ]"} `,
});

markdownSerializer.addRule("gfmStrikethrough", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

export const methods = {
  _markdownReader(this: PreviewHost, view: MainPreviewTextView): HTMLElement {
    return this._createMarkdownSurface(view, view.text, false);
  },

  _markdownEditor(this: PreviewHost, view: MainPreviewTextView | MainPreviewEmptyView, editor: MainPreviewEditorState): HTMLElement {
    const reader = this._createMarkdownSurface(view, editor.draft, true);
    const article = reader.querySelector<HTMLElement>(".markdown-editor-surface");
    if (!article) return reader;
    let acceptedDraft = editor.draft;
    const preserveTrailingNewline = editor.draft.endsWith("\n");
    const syncDraft = (): void => {
      const draft = normalizedRenderedMarkdown(markdownSerializer.turndown(article), preserveTrailingNewline);
      if (draft.length > MAX_SYNTAX_SOURCE_UNITS) {
        article.dataset.limitReached = "true";
        this._populateMarkdownArticle(article, acceptedDraft, true);
        article.focus({ preventScroll: true });
        return;
      }
      delete article.dataset.limitReached;
      acceptedDraft = draft;
      this._dispatchPathEvent<MainPreviewDraftDetail>(MAIN_PREVIEW_DRAFT_EVENT, { path: view.path, text: draft });
    };
    article.addEventListener("input", syncDraft);
    article.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") syncDraft();
    });
    article.addEventListener("paste", (event) => this._pastePlainText(event, article));
    article.addEventListener("drop", (event) => event.preventDefault());
    return reader;
  },

  _createMarkdownSurface(this: PreviewHost,
    view: MainPreviewTextView | MainPreviewEmptyView,
    source: string,
    editable: boolean,
  ): HTMLElement {
    const reader = this.ownerDocument.createElement("div");
    reader.className = "markdown-reader";
    if (editable) reader.classList.add("markdown-editor");
    const article = this.ownerDocument.createElement("article");
    article.className = "markdown-body";
    article.setAttribute("aria-label", editable ? `Edit ${view.name} in rendered Markdown` : `${view.name} rendered Markdown preview`);
    if (editable) {
      article.classList.add("markdown-editor-surface");
      article.contentEditable = "true";
      article.spellcheck = true;
      article.setAttribute("role", "textbox");
      article.setAttribute("aria-multiline", "true");
      article.setAttribute("aria-busy", String(this._state.editor?.saving === true));
    }
    this._populateMarkdownArticle(article, source, editable);
    article.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target || !article.contains(target)) return;
      if (!editable) event.preventDefault();
      event.stopPropagation();
    });

    if (view.kind === "text" && view.truncated) {
      const notice = this.ownerDocument.createElement("div");
      notice.className = "markdown-truncated";
      notice.textContent = "Preview truncated at the safe file-size limit.";
      reader.append(notice);
    }
    reader.append(article);
    return reader;
  },

  _populateMarkdownArticle(this: PreviewHost, article: HTMLElement, source: string, editable: boolean): void {
    const prepared = editable ? splitMarkdownFrontMatter(source) : { body: source };
    const rendered = (editable ? markdownEditorRenderer : markdownRenderer).render(prepared.body);
    const fragment = DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [...MARKDOWN_ALLOWED_TAGS],
      ALLOWED_ATTR: [
        "align",
        "class",
        "start",
        "title",
        "data-markdown-href",
        "data-markdown-title",
        "data-markdown-image-alt",
        "data-markdown-image-src",
        "data-markdown-image-title",
        "data-markdown-comment",
        "data-markdown-comment-block",
      ],
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["audio", "button", "embed", "form", "iframe", "img", "input", "math", "object", "select", "source", "style", "svg", "textarea", "video"],
      FORBID_ATTR: ["formaction", "ping", "src", "srcset", "style"],
      KEEP_CONTENT: true,
      RETURN_DOM_FRAGMENT: true,
      SANITIZE_NAMED_PROPS: true,
    }) as DocumentFragment;
    article.replaceChildren(fragment);
    const renderedBodyEmpty = !article.hasChildNodes();
    if (editable && renderedBodyEmpty) {
      const paragraph = this.ownerDocument.createElement("p");
      paragraph.append(this.ownerDocument.createElement("br"));
      article.append(paragraph);
    }
    if (editable && prepared.frontMatter) {
      const frontMatter = this.ownerDocument.createElement("div");
      frontMatter.className = "markdown-front-matter-placeholder";
      frontMatter.contentEditable = "false";
      frontMatter.setAttribute("data-markdown-front-matter", prepared.frontMatter);
      frontMatter.textContent = "YAML front matter · source preserved";
      article.prepend(frontMatter);
    }

    for (const anchor of article.querySelectorAll<HTMLAnchorElement>("a")) {
      const href = anchor.getAttribute("data-markdown-href") ?? "";
      anchor.title = href && isSafeMarkdownLink(href) ? `External link disabled in preview: ${href}` : "Link disabled in preview";
      anchor.removeAttribute("href");
      anchor.draggable = false;
    }
    for (const list of article.querySelectorAll<HTMLOListElement>("ol[start]")) {
      const start = Number(list.getAttribute("start"));
      if (!Number.isSafeInteger(start) || start < -1_000_000 || start > 1_000_000) list.removeAttribute("start");
    }
    for (const placeholder of article.querySelectorAll<HTMLElement>(".markdown-image-placeholder")) {
      placeholder.contentEditable = "false";
    }
    for (const placeholder of article.querySelectorAll<HTMLElement>(".markdown-comment-placeholder")) {
      placeholder.contentEditable = "false";
    }
    this._decorateMarkdownTaskLists(article, editable);
  },

  _decorateMarkdownTaskLists(this: PreviewHost, article: HTMLElement, editable: boolean): void {
    for (const item of article.querySelectorAll<HTMLLIElement>("li")) {
      const textHost = item.firstElementChild?.tagName === "P" ? item.firstElementChild : item;
      if (!textHost) continue;
      const walker = this.ownerDocument.createTreeWalker(textHost, NodeFilter.SHOW_TEXT);
      const firstText = walker.nextNode();
      if (!(firstText instanceof Text)) continue;
      const match = firstText.data.match(/^\s*\[([ xX])\]\s+/);
      if (!match) continue;
      firstText.data = firstText.data.slice(match[0].length);
      const checkbox = this.ownerDocument.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = !editable;
      checkbox.checked = match[1]?.toLowerCase() === "x";
      checkbox.contentEditable = "false";
      checkbox.setAttribute("aria-label", checkbox.checked ? "Completed task" : "Incomplete task");
      firstText.parentNode?.insertBefore(checkbox, firstText);
      item.classList.add("task-list-item");
      item.parentElement?.classList.add("task-list");
    }
  },

  _pastePlainText(this: PreviewHost, event: ClipboardEvent, article: HTMLElement): void {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    if (!text) return;
    if (this.ownerDocument.execCommand("insertText", false, text)) return;
    const selection = this.ownerDocument.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!article.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const inserted = this.ownerDocument.createTextNode(text);
    range.insertNode(inserted);
    range.setStartAfter(inserted);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    article.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
