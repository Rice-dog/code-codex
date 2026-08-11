import {
  ACTIVE_THREAD_MARKER_SELECTOR,
  COMPOSER_THREAD_SELECTOR,
  RESPONSE_THREAD_SELECTOR,
  activeLocalThreadId,
  activeLocalThreadUsesTemporaryAlias,
  annotationConsensusThreadId,
  plausibleThreadId,
} from "./adapters/codex-26.715";

const ROUTE_EVENT = "code-codex:route";
const EXPLICIT_EVENT = "code-codex:thread-change";

const SELECTED_THREAD_SELECTORS = [
  ACTIVE_THREAD_MARKER_SELECTOR,
  '[data-thread-id][aria-current="page"]',
  '[data-thread-id][data-selected="true"]',
  '[data-thread-id][data-state="active"]',
  '[data-task-id][aria-current="page"]',
  '[data-task-id][data-selected="true"]',
  '[data-conversation-id][aria-current="page"]',
  '[aria-current="page"][href]',
  '[role="option"][aria-selected="true"][data-thread-id]',
].join(",");

interface DocumentThreadSignal {
  markerPresent: boolean;
  threadId: string | null;
}

function plausible(value: unknown): value is string {
  return plausibleThreadId(value);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractThreadIdFromUrl(url: URL = new URL(window.location.href)): string | null {
  for (const key of ["threadId", "thread", "taskId", "conversationId"]) {
    const value = url.searchParams.get(key);
    if (plausible(value)) return value;
  }

  const segments = url.pathname.split("/").filter(Boolean).map(decode);
  for (let index = 0; index < segments.length - 1; index += 1) {
    const marker = segments[index]?.toLowerCase();
    if (["thread", "threads", "task", "tasks", "t", "conversation", "conversations"].includes(marker ?? "")) {
      const candidate = segments[index + 1];
      if (plausible(candidate)) return candidate;
    }
  }
  return null;
}

function idFromElement(element: Element): string | null {
  const codexId = element.getAttribute("data-app-action-sidebar-thread-id");
  if (codexId) {
    const host = element.getAttribute("data-app-action-sidebar-thread-host-id");
    const kind = element.getAttribute("data-app-action-sidebar-thread-kind");
    if (host !== "local" || kind !== "local" || !codexId.startsWith("local:")) return null;
    const stripped = codexId.slice("local:".length);
    return plausible(stripped) ? stripped : null;
  }
  for (const attribute of ["data-thread-id", "data-task-id", "data-conversation-id"]) {
    const value = element.getAttribute(attribute);
    if (plausible(value)) return value;
  }
  const href = element.getAttribute("href");
  if (href) {
    try {
      return extractThreadIdFromUrl(new URL(href, window.location.href));
    } catch {
      return null;
    }
  }
  return null;
}

function documentThreadSignal(root: ParentNode = document): DocumentThreadSignal {
  if (root.querySelector(ACTIVE_THREAD_MARKER_SELECTOR)) {
    const canonical = activeLocalThreadId(root);
    if (canonical) return { markerPresent: true, threadId: canonical };
    return {
      markerPresent: true,
      threadId: activeLocalThreadUsesTemporaryAlias(root) ? annotationConsensusThreadId(root, true) : null,
    };
  }

  if (root.querySelector(`${COMPOSER_THREAD_SELECTOR},${RESPONSE_THREAD_SELECTOR}`)) {
    return { markerPresent: true, threadId: annotationConsensusThreadId(root) };
  }

  const selected = [...root.querySelectorAll(SELECTED_THREAD_SELECTORS)];
  if (!selected.length) return { markerPresent: false, threadId: null };
  const candidates = selected.map(idFromElement);
  if (candidates.some((value) => value === null)) return { markerPresent: true, threadId: null };
  const distinct = [...new Set(candidates as string[])];
  return { markerPresent: true, threadId: distinct.length === 1 ? distinct[0] ?? null : null };
}

export function extractThreadIdFromDocument(root: ParentNode = document): string | null {
  return documentThreadSignal(root).threadId;
}

export function resolveActiveThread(root: ParentNode = document): string | null {
  const fromRoute = extractThreadIdFromUrl();
  const fromDom = documentThreadSignal(root);
  if (!fromDom.markerPresent) return fromRoute;
  if (!fromDom.threadId || (fromRoute && fromRoute !== fromDom.threadId)) return null;
  return fromDom.threadId;
}

export class ActiveThreadTracker {
  #observer: MutationObserver | undefined;
  #listener: ((threadId: string | null) => void) | undefined;
  #last: string | null | undefined;
  #queued = false;
  #originalPushState: History["pushState"] | undefined;
  #originalReplaceState: History["replaceState"] | undefined;
  #pushWrapper: History["pushState"] | undefined;
  #replaceWrapper: History["replaceState"] | undefined;

  start(listener: (threadId: string | null) => void): void {
    this.stop();
    this.#listener = listener;
    this.#patchHistory();
    window.addEventListener("popstate", this.#schedule);
    window.addEventListener("hashchange", this.#schedule);
    window.addEventListener(ROUTE_EVENT, this.#schedule);
    window.addEventListener(EXPLICIT_EVENT, this.#onExplicit as EventListener);

    this.#observer = new MutationObserver(this.#schedule);
    this.#observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-current",
        "aria-selected",
        "data-selected",
        "data-state",
        "data-thread-id",
        "data-task-id",
        "data-conversation-id",
        "data-app-action-sidebar-thread-id",
        "data-app-action-sidebar-thread-active",
        "data-app-action-sidebar-thread-host-id",
        "data-app-action-sidebar-thread-kind",
        "data-above-composer-conversation-id",
        "data-response-annotation-conversation",
        "href",
      ],
    });
    this.#emit();
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    window.removeEventListener("popstate", this.#schedule);
    window.removeEventListener("hashchange", this.#schedule);
    window.removeEventListener(ROUTE_EVENT, this.#schedule);
    window.removeEventListener(EXPLICIT_EVENT, this.#onExplicit as EventListener);
    this.#restoreHistory();
    this.#listener = undefined;
    this.#last = undefined;
    this.#queued = false;
  }

  #schedule = (): void => {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#emit();
    });
  };

  #onExplicit = (event: CustomEvent<{ threadId?: unknown } | string | null>): void => {
    const detail = event.detail;
    if (!detail || typeof detail !== "object") return;
    const record = detail as { threadId?: unknown; hostId?: unknown; kind?: unknown };
    if (record.hostId !== "local" || record.kind !== "local" || !plausible(record.threadId)) return;
    if (extractThreadIdFromDocument() !== record.threadId) return;
    this.#schedule();
  };

  #emit(): void {
    const next = resolveActiveThread();
    if (next === this.#last) return;
    this.#last = next;
    this.#listener?.(next);
  }

  #patchHistory(): void {
    this.#originalPushState = history.pushState;
    this.#originalReplaceState = history.replaceState;
    const notify = () => window.dispatchEvent(new Event(ROUTE_EVENT));
    const push = this.#originalPushState;
    const replace = this.#originalReplaceState;
    this.#pushWrapper = function (this: History, ...args: Parameters<History["pushState"]>) {
      push.apply(this, args);
      notify();
    };
    this.#replaceWrapper = function (this: History, ...args: Parameters<History["replaceState"]>) {
      replace.apply(this, args);
      notify();
    };
    history.pushState = this.#pushWrapper;
    history.replaceState = this.#replaceWrapper;
  }

  #restoreHistory(): void {
    if (this.#originalPushState && history.pushState === this.#pushWrapper) history.pushState = this.#originalPushState;
    if (this.#originalReplaceState && history.replaceState === this.#replaceWrapper) history.replaceState = this.#originalReplaceState;
    this.#originalPushState = undefined;
    this.#originalReplaceState = undefined;
    this.#pushWrapper = undefined;
    this.#replaceWrapper = undefined;
  }
}
