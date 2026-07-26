import { describe, expect, it, vi } from "vitest";
import { ActiveThreadTracker, extractThreadIdFromDocument, extractThreadIdFromUrl, resolveActiveThread } from "../src/active-thread";

const THREAD = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("26.715 active-thread adapter", () => {
  it("extracts and validates the exact active local sidebar signal", () => {
    document.body.innerHTML = `
      <div role="button"
        data-app-action-sidebar-thread-row
        data-app-action-sidebar-thread-active="true"
        data-app-action-sidebar-thread-host-id="local"
        data-app-action-sidebar-thread-id="local:${THREAD}"
        data-app-action-sidebar-thread-kind="local"></div>`;
    expect(extractThreadIdFromDocument()).toBe(THREAD);
  });

  it("rejects a cloud-hosted or ambiguous active row", () => {
    document.body.innerHTML = `
      <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="cloud"
        data-app-action-sidebar-thread-id="cloud:${THREAD}" data-app-action-sidebar-thread-kind="cloud"></div>
      <div data-above-composer-conversation-id="${THREAD}"></div>
      <div data-response-annotation-conversation="${THREAD}"></div>`;
    expect(extractThreadIdFromDocument()).toBeNull();
  });

  it("does not let a plausible local route override an active cloud marker", () => {
    history.replaceState(null, "", `/tasks/${THREAD}`);
    document.body.innerHTML = `
      <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="cloud"
        data-app-action-sidebar-thread-id="cloud:${THREAD}" data-app-action-sidebar-thread-kind="cloud"></div>`;

    expect(extractThreadIdFromDocument()).toBeNull();
    expect(resolveActiveThread()).toBeNull();
  });

  it("does not let a route override a malformed active Codex marker", () => {
    history.replaceState(null, "", `/tasks/${THREAD}`);
    document.body.innerHTML = `
      <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
        data-app-action-sidebar-thread-kind="local"></div>`;

    expect(extractThreadIdFromDocument()).toBeNull();
    expect(resolveActiveThread()).toBeNull();
  });

  it("uses composer and response annotations only when they agree", () => {
    document.body.innerHTML = `
      <div data-above-composer-conversation-id="${THREAD}"></div>
      <div data-response-annotation-conversation="${THREAD}"></div>`;
    expect(extractThreadIdFromDocument()).toBe(THREAD);
    document.querySelector("[data-response-annotation-conversation]")?.setAttribute("data-response-annotation-conversation", OTHER);
    expect(extractThreadIdFromDocument()).toBeNull();
  });

  it("suppresses route and generic fallbacks when active annotations conflict", () => {
    history.replaceState(null, "", `/tasks/${THREAD}`);
    document.body.innerHTML = `
      <div data-above-composer-conversation-id="${THREAD}"></div>
      <div data-response-annotation-conversation="${OTHER}"></div>
      <a aria-current="page" data-thread-id="${THREAD}"></a>`;

    expect(extractThreadIdFromDocument()).toBeNull();
    expect(resolveActiveThread()).toBeNull();
  });

  it("uses a plausible route only when the document has no active marker", () => {
    history.replaceState(null, "", `/tasks/${THREAD}`);
    document.body.innerHTML = `<main></main>`;
    expect(resolveActiveThread()).toBe(THREAD);
  });

  it("supports explicit thread routes and fails closed on conflicting signals", () => {
    expect(extractThreadIdFromUrl(new URL(`https://local.invalid/tasks/${THREAD}`))).toBe(THREAD);
    history.replaceState(null, "", `/tasks/${THREAD}`);
    document.body.innerHTML = `<a aria-current="page" data-thread-id="${OTHER}"></a>`;
    expect(resolveActiveThread()).toBeNull();
  });

  it("tracks active-row mutations and restores patched history", async () => {
    document.body.innerHTML = `<div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
      data-app-action-sidebar-thread-id="local:${THREAD}" data-app-action-sidebar-thread-kind="local"></div>`;
    const originalPush = history.pushState;
    const listener = vi.fn();
    const tracker = new ActiveThreadTracker();
    tracker.start(listener);
    expect(listener).toHaveBeenLastCalledWith(THREAD);
    document.querySelector("[data-app-action-sidebar-thread-id]")?.setAttribute("data-app-action-sidebar-thread-id", `local:${OTHER}`);
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenLastCalledWith(OTHER);
    tracker.stop();
    expect(history.pushState).toBe(originalPush);
  });

  it("ignores bare or DOM-disagreeing explicit thread-change events", async () => {
    document.body.innerHTML = `<div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
      data-app-action-sidebar-thread-id="local:${THREAD}" data-app-action-sidebar-thread-kind="local"></div>`;
    const listener = vi.fn();
    const tracker = new ActiveThreadTracker();
    tracker.start(listener);
    expect(listener).toHaveBeenLastCalledWith(THREAD);

    window.dispatchEvent(new CustomEvent("code-codex:thread-change", { detail: { threadId: OTHER } }));
    window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
      detail: { threadId: OTHER, hostId: "local", kind: "local" },
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalledWith(OTHER);
    tracker.stop();
  });
});
