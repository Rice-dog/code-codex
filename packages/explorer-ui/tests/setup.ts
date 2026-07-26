import { afterEach, vi } from "vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverStub });

// jsdom does not implement PointerEvent; the tree marquee relies on it. Extend
// MouseEvent with the pointer fields the explorer reads.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: PointerEventStub });
}

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll('style[data-codex-live-explorer-shell-layout]').forEach((style) => style.remove());
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  delete window.__codexLiveExplorer;
  delete window.__codexLiveExplorerNative;
  delete window.__codexLiveExplorerReceive;
  delete window.__codexLiveExplorerInject;
  delete window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__;
  delete (window as unknown as Record<PropertyKey, unknown>)[Symbol.for("codex-live-explorer:dismissed")];
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024, writable: true });
  vi.useRealTimers();
});
