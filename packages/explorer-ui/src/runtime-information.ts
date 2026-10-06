import { runtimeEvent, takeRuntimeEvents, restoreRuntimeEvents } from "./runtime-events";
import { redactRuntimeText, redactRuntimeValue } from "./runtime-redaction";
import { isHomeWorkspaceView } from "./home-view";
import { isNativeLoginView } from "./native-login";

type Request = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
interface Run { id: string; bytes: number; current: boolean; }
interface Listing { runs: Run[]; currentRun: string; storageError?: string; }
let request: Request | undefined;
let sending: Promise<void> | undefined;
let syncError = "";
let timer: ReturnType<typeof setInterval> | undefined;
let currentView = "";
let dialog: HTMLDialogElement | undefined;

export function connectRuntimeInformation(send: Request): void {
  request = send;
  runtimeEvent("renderer","native bridge","connected");
  if (!timer) timer = setInterval(() => { void flushRuntimeEvents(); },1000);
  void flushRuntimeEvents();
}
export async function flushRuntimeEvents(): Promise<void> {
  if (!request) return;
  if (sending) return sending;
  sending = (async () => {
    for (let batch = 0; batch < 128; batch++) {
      const events = takeRuntimeEvents();
      if (!events.length || !request) break;
      try {
        const result = await request<{accepted:number}>("explorer.runtime.append",{events});
        if (result.accepted !== events.length) throw new Error("Runtime events were not acknowledged.");
        syncError = "";
      }
      catch(error) { syncError = error instanceof Error ? redactRuntimeText(error.message) : "Renderer log synchronization failed"; restoreRuntimeEvents(events); break; }
    }
  })();
  try { await sending; } finally { sending = undefined; }
}

/** Observe structural state, never conversation text, input values, URLs or account identifiers. */
export function observeCodexRuntime(): void {
  const marker = "data-code-codex-runtime-observed";
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker,"");
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    scheduled = undefined;
    const selected = document.querySelector('[data-app-navigation-rail] [data-sidebar-destination][aria-current="page"]');
    const nativeId = selected?.getAttribute("data-sidebar-destination") ?? "";
    const view = isNativeLoginView(document) ? "login" : isHomeWorkspaceView() ? "home" : nativeId.startsWith("builtin:") ? nativeId : "other-native-view";
    if (view !== currentView) { runtimeEvent("codex-observed","page","changed",{from:currentView || "initial",to:view}); currentView = view; }
  };
  new MutationObserver(() => { if (!scheduled) scheduled = setTimeout(check,250); }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["aria-current","data-app-shell-active-page"]});
  window.addEventListener("code-codex:thread-change",() => runtimeEvent("codex-observed","active task","changed"));
  document.addEventListener("visibilitychange",() => runtimeEvent("codex-observed","document visibility",document.visibilityState));
  window.addEventListener("pagehide",() => { runtimeEvent("renderer","document","leaving"); void flushRuntimeEvents(); });
  check();
}

export function observePluginControls(root: ShadowRoot): void {
  root.addEventListener("click",event => {
    const element = event.target instanceof Element ? event.target.closest("button") : null;
    const card = element?.closest(".preview-extension");
    if (!element || !card) return;
    const plugin = card.getAttribute("data-appearance-plugin") ?? card.querySelector("h4")?.textContent?.trim() ?? "preview-plugin";
    if (element.matches(".preview-extension-action")) {
      runtimeEvent("renderer","plugin toggle","requested",{plugin});
      // Async handlers may validate dependencies or load resources before changing the state.
      setTimeout(() => runtimeEvent("renderer","plugin state","observed",{plugin,enabled:element.getAttribute("aria-pressed")==="true"}),250);
    } else if (element.matches('[aria-haspopup="dialog"]')) runtimeEvent("renderer","plugin settings","opened",{plugin});
  });
  root.addEventListener("change",event => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement) || !control.closest(".particle-settings-panel")) return;
    // Only numeric/boolean settings; video paths and arbitrary text are deliberately excluded.
    const value = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : Number(control.value);
    if (typeof value === "boolean" || Number.isFinite(value)) runtimeEvent("renderer","plugin setting","changed",{control:control.id,value});
  });
  const states = new WeakMap<Element,string>();
  new MutationObserver(records => {
    for (const record of records) {
      const button = record.target as Element;
      if (!button.matches(".preview-extension-action") || !button.closest(".preview-extension")) continue;
      const value = button.getAttribute("aria-pressed") ?? "";
      if (states.get(button) === value) continue;
      states.set(button,value);
      const card = button.closest(".preview-extension")!;
      runtimeEvent("renderer","plugin state","changed",{plugin:card.getAttribute("data-appearance-plugin") ?? card.querySelector("h4")?.textContent?.trim() ?? "preview-plugin",enabled:value==="true"});
    }
  }).observe(root,{subtree:true,attributes:true,attributeFilter:["aria-pressed"]});
}

export async function openRuntimeInformation(): Promise<void> {
  if (dialog?.isConnected) { if (!dialog.open) dialog.showModal(); return; }
  const host = document.createElement("dialog"); dialog = host;
  host.dataset.codeCodexRuntimeInformation = "";
  if (!document.querySelector("style[data-code-codex-runtime-style]")) {
    const style = document.createElement("style");style.dataset.codeCodexRuntimeStyle="";
    style.textContent='dialog[data-code-codex-runtime-information]{box-sizing:border-box;width:min(1000px,calc(100vw - 40px));height:min(760px,calc(100vh - 40px));padding:0;border:1px solid #8885;border-radius:14px;background:var(--surface-primary,#fafafa);color:var(--text-default,#222);box-shadow:0 24px 80px #0005}dialog[data-code-codex-runtime-information]::backdrop{background:#0005}@media(prefers-color-scheme:dark){dialog[data-code-codex-runtime-information]{background:var(--surface-primary,#202020);color:var(--text-default,#eee)}}';
    document.head.append(style);
  }
  const content = document.createElement("div");host.append(content);
  const shadow = content.attachShadow({mode:"open"});
  shadow.innerHTML = `<style>
    :host{display:block;box-sizing:border-box;width:100%;height:100%;font:13px/1.5 system-ui;color:inherit;background:transparent}
    :host::backdrop{background:#0005}*{box-sizing:border-box}section{height:100%;display:flex;flex-direction:column}header{padding:18px 20px;border-bottom:1px solid #8883;display:flex;justify-content:space-between;align-items:center}h2{margin:0;font-size:18px}button,select,input{font:inherit;color:inherit;border:1px solid #8885;border-radius:7px;background:transparent;padding:7px 10px}button{cursor:pointer}button:hover{background:#8882}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #408cda;outline-offset:2px}.tools{display:flex;gap:8px;padding:12px 20px;flex-wrap:wrap}input{flex:1;min-width:140px}select{max-width:100%}.summary{padding:0 20px 12px;color:var(--text-secondary,#777)}.events{flex:1;overflow:auto;padding:0 20px 20px}.event{display:grid;grid-template-columns:85px 130px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #8882}.time{font:12px/1.5 ui-monospace,monospace;color:var(--text-secondary,#777)}.source{color:var(--text-secondary,#777);overflow-wrap:anywhere}strong{font-weight:600}.detail{margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace}.failed{color:#d45252}footer{padding:10px 20px;border-top:1px solid #8883;color:var(--text-secondary,#777)}@media(prefers-color-scheme:dark){:host{background:var(--surface-primary,#202020);color:var(--text-default,#eee)}}@media(max-width:600px){.event{grid-template-columns:72px 1fr}.source{grid-column:2}.body{grid-column:1/-1}}
    </style><section><header><h2>Runtime Information</h2><button class="close" aria-label="Close runtime information">✕</button></header><div class="tools"><select aria-label="Run"></select><input type="search" placeholder="Filter events" aria-label="Filter events"><button class="refresh">Refresh</button><button class="copy">Copy Details</button><button class="export">Export</button></div><div class="summary" role="status">Loading…</div><div class="events" tabindex="0" aria-label="Runtime events"></div><footer><button class="older">Load Older Events</button> Latest 10 runs · Maximum 5 MB per run · Oldest events are removed when the limit is reached.</footer></section>`;
  document.body.append(host); host.showModal();
  const select = shadow.querySelector("select")!;
  const filter = shadow.querySelector("input")!;
  const summary = shadow.querySelector<HTMLElement>(".summary")!;
  const container = shadow.querySelector(".events")!;
  let text = "";
  let events: Record<string,unknown>[] = [];
  let generation = 0;
  let visibleLimit = 500;
  const older = shadow.querySelector<HTMLButtonElement>(".older")!;
  const render = () => {
    const query = filter.value.toLowerCase();
    const matching = events.filter(event => JSON.stringify(event).toLowerCase().includes(query));
    const scrollTop = container.scrollTop;
    const following = container.scrollHeight - container.scrollTop - container.clientHeight < 30;
    container.replaceChildren();
    // Bound DOM work; Copy/Export always contains the complete retained log.
    for (const event of matching.slice(-visibleLimit)) {
      const row = document.createElement("div"); row.className = "event";
      const time = document.createElement("span"); time.className="time"; time.textContent=`+${event.elapsedMs} ms`;
      const source = document.createElement("span"); source.className="source"; source.textContent=String(event.source);
      const body = document.createElement("div"); body.className="body";
      const title = document.createElement("strong"); title.textContent=`${event.action} · ${event.outcome}`; if (event.outcome==="failed") title.className="failed";
      const details = document.createElement("div"); details.className="detail"; details.textContent=JSON.stringify(event.details);
      body.append(title,details); row.append(time,source,body); container.append(row);
    }
    if (!matching.length) container.textContent="No matching events.";
    older.hidden=matching.length<=visibleLimit;
    container.scrollTop=following ? container.scrollHeight : scrollTop;
  };
  const load = async () => {
    const token = ++generation;
    try {
      if (!request) throw new Error("The native logging connection is unavailable.");
      await flushRuntimeEvents();
      const data = await request<{text:string;storageError?:string}>("explorer.runtime.read",{id:select.value});
      if (token !== generation || !host.isConnected) return;
      const lines=data.text.trim().split("\n").map(line=>redactRuntimeValue(JSON.parse(line)) as Record<string, unknown>); text=lines.map(line=>JSON.stringify(line)).join("\n")+"\n"; const metadata=lines.shift()!; events=lines as typeof events;
      summary.textContent=`Version ${metadata.version} · ${events.length} retained events · ${metadata.droppedEvents} older events removed · ${(new TextEncoder().encode(text).length/1024/1024).toFixed(2)} MB${data.storageError ? ` · Storage error: ${data.storageError}` : ""}${syncError ? ` · Renderer sync error: ${syncError}` : ""}`;
      render();
    } catch(error) { summary.textContent=error instanceof Error ? redactRuntimeText(error.message) : "Could not load runtime information."; }
  };
  const refresh = async () => {
    try {
      if (!request) throw new Error("The native logging connection is unavailable.");
      const listing = await request<Listing>("explorer.runtime.list");
      const selected=select.value;
      select.replaceChildren(...listing.runs.map(run=>{const option=document.createElement("option"); option.value=run.id; const date=new Date(Number(run.id.split("-")[0])); option.textContent=`${date.toLocaleString()}${run.current ? " · Current run" : ""}`; return option;}));
      select.value=listing.runs.some(run=>run.id===selected) ? selected : listing.currentRun;
      await load();
    } catch(error) { summary.textContent=error instanceof Error ? redactRuntimeText(error.message) : "Could not list runtime logs."; }
  };
  shadow.querySelector(".close")!.addEventListener("click",()=>host.close());
  host.addEventListener("close",()=>{host.remove();dialog=undefined;clearInterval(refreshTimer);});
  select.addEventListener("change",()=>{visibleLimit=500;void load();}); filter.addEventListener("input",()=>{visibleLimit=500;render();});
  older.addEventListener("click",()=>{const height=container.scrollHeight,top=container.scrollTop;visibleLimit+=500;render();container.scrollTop=top+container.scrollHeight-height;});
  shadow.querySelector(".refresh")!.addEventListener("click",()=>void refresh());
  shadow.querySelector(".copy")!.addEventListener("click",async()=>{try {await load(); await navigator.clipboard.writeText(`Code-Codex runtime information\n${summary.textContent}\n${text}`);summary.textContent="Complete retained log copied.";} catch {summary.textContent="Clipboard unavailable. Use Export to save the complete log.";}});
  shadow.querySelector(".export")!.addEventListener("click",()=>{const url=URL.createObjectURL(new Blob([text],{type:"application/x-ndjson;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`CodeCodex-runtime-${select.value}.jsonl`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const refreshTimer = setInterval(()=>{if (select.selectedOptions[0]?.textContent?.endsWith(" · Current run")) void load();},3000);
  await refresh();
}
