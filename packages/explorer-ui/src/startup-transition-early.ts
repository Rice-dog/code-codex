import { startEarlyStartupTransition, readStartupTransitionSettings, startupDocumentReady, startupTransitionModule } from "./startup-transition-plugin";
import { runtimeEvent } from "./runtime-events";

const valid = window === window.top && location.protocol === "app:" && location.host === "-"
  && location.pathname === "/index.html" && !location.search;
const state = window as unknown as Record<string, unknown>;
const entered = Symbol.for("code-codex:early-startup-entry:v2");
const shared = window as unknown as Record<symbol, unknown>;
if (valid && !shared[entered]) {
  shared[entered] = true;
  state.__CODE_CODEX_EARLY_STARTUP_STATUS__ = {stage:"awaiting-body",readyState:document.readyState,bodyPresent:!!document.body};
  const start = () => {
    if (!readStartupTransitionSettings().enabled) {
      state.__CODE_CODEX_EARLY_STARTUP_STATUS__ = { stage: "skipped", reason: "plugin disabled", networkRequested: false };
      runtimeEvent("startup-animation", "early entry", "skipped", { reason: "plugin disabled", networkRequested: false });
      return;
    }
    if (!startupTransitionModule()) {
      state.__CODE_CODEX_EARLY_STARTUP_STATUS__ = { stage: "skipped", reason: "startup package is not downloaded or verified", networkRequested: false };
      runtimeEvent("startup-animation", "early entry", "skipped", { reason: "startup package is not downloaded or verified", networkRequested: false });
      return;
    }
    const status = { stage: "preparing", enabled: readStartupTransitionSettings().enabled, readyAtEntry: startupDocumentReady(), controller: false, phase: "none", reason:"", enteredAt:Date.now() };
    state.__CODE_CODEX_EARLY_STARTUP_STATUS__ = status;
    runtimeEvent("startup-animation", "early entry", "observed", {enabled:status.enabled,readyAtEntry:status.readyAtEntry});
    void startEarlyStartupTransition().then(controller => {
      status.controller = !!controller;
      status.stage = controller ? "playing" : "skipped";
      status.reason = controller ? "" : !status.enabled ? "plugin disabled" : status.readyAtEntry ? "native document already ready at entry" : "player unavailable; inspect video lookup and player events";
      runtimeEvent("startup-animation", "early playback", status.stage, {readyAtEntry:status.readyAtEntry,enabled:status.enabled});
      if (!controller) return;
      const tick = () => {
        status.phase = controller.phase;
        if (controller.phase === "complete") { status.stage = "complete"; runtimeEvent("startup-animation","early playback","complete"); return; }
        requestAnimationFrame(tick);
      };
      tick();
    }).catch(error => { status.stage = "failed"; status.reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);runtimeEvent("startup-animation","early playback","failed",{reason:status.reason}); });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
