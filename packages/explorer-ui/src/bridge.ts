import { nativeFailureCorrelation } from './host/bridge/fault-correlation';
import { type BootstrapConfig, type BridgeErrorData, type BridgeMessage, type BridgeNotification, type BridgeRequest, type BridgeResponse, type ObjectBridge } from "./contracts/bridge";
const MESSAGE_EVENT = "code-codex:message";
import { connectRuntimeInformation } from "./runtime-information";
import { runtimeEvent } from "./runtime-events";
import { runtimeErrorDetails } from "./runtime-operations";
import { reconnectRendererStorage } from './renderer-storage';
import { applyLanguage, connectLanguage } from './i18n';

function safeRuntimeName(value: string | undefined, fallback: string): string {
  return typeof value === "string" && /^__[A-Za-z][A-Za-z0-9_]{1,94}$/.test(value)
    ? value
    : fallback;
}

function consumeBootstrap(): Readonly<BootstrapConfig> {
  const source = window.__CODE_CODEX_BOOTSTRAP__;
  const copy: BootstrapConfig = source
    ? {
        ...(typeof source.token === "string" ? { token: source.token } : {}),
        ...(typeof source.binding === "string" ? { binding: source.binding } : {}),
        ...(typeof source.receiver === "string" ? { receiver: source.receiver } : {}),
        ...(typeof source.supported === "boolean" ? { supported: source.supported } : {}),
        ...(typeof source.compatible === "boolean" ? { compatible: source.compatible } : {}),
        ...(typeof source.version === "string" ? { version: source.version } : {}),
        ...(typeof source.codexVersion === "string" ? { codexVersion: source.codexVersion } : {}),
        ...(typeof source.channel === "string" ? { channel: source.channel } : {}),
        ...(typeof source.forceDrawer === "boolean" ? { forceDrawer: source.forceDrawer } : {}),
        ...(typeof source.manualWorkspace === "boolean" ? { manualWorkspace: source.manualWorkspace } : {}),
        ...(typeof source.startupSplashActive === "boolean" ? { startupSplashActive: source.startupSplashActive } : {}),
        ...(typeof source.centralizedStorage === "boolean" ? { centralizedStorage: source.centralizedStorage } : {}),
        ...(source.language && typeof source.language === 'object' ? { language: source.language } : {}),
      }
    : {};

  if (source && typeof source === "object") {
    try {
      Object.freeze(source);
    } catch {
      // A hostile page object must not prevent bootstrap cleanup.
    }
  }
  try {
    delete window.__CODE_CODEX_BOOTSTRAP__;
  } catch {
    try {
      Object.defineProperty(window, "__CODE_CODEX_BOOTSTRAP__", {
        configurable: true,
        value: undefined,
      });
    } catch {
      // The token remains only in this module closure when the host made the property non-configurable.
    }
  }
  return Object.freeze(copy);
}

const bootstrap = consumeBootstrap();
if (bootstrap.language) applyLanguage(bootstrap.language);

export function getBootstrapConfig(): Readonly<BootstrapConfig> {
  return bootstrap;
}

export function assessBootstrapCompatibility(config: Readonly<BootstrapConfig> = bootstrap): { supported: boolean; version?: string; reason?: string } {
  const version = config.codexVersion ?? config.version;
  if (config.supported === false || config.compatible === false) {
    return {
      supported: false,
      ...(version ? { version } : {}),
      reason: version ? `Codex ${version} failed runtime compatibility checks.` : "Codex failed runtime compatibility checks.",
    };
  }
  return { supported: true, ...(version ? { version } : {}) };
}

export class ExplorerBridgeError extends Error {
  readonly code: string | number;
  readonly data: unknown;

  constructor(error: BridgeErrorData | string) {
    const detail = typeof error === "string" ? { message: error } : error;
    super(detail.message || "The explorer request failed.");
    this.name = "ExplorerBridgeError";
    this.code = detail.code ?? "INTERNAL";
    this.data = detail.data;
  }
}

export class BridgeUnavailableError extends Error {
  constructor() {
    super("Code-Codex is not connected. Restart Codex with the Code-Codex launcher.");
    this.name = "BridgeUnavailableError";
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

type NotificationListener = (notification: BridgeNotification) => void;

// One receiver can serve storage bootstrap and the retained explorer together.
// A later client must never steal replies from an existing client after login.
const receiverHubKey = Symbol.for('code-codex:bridge-receivers:v2');
type ReceiverHub = { listeners: Set<(message: unknown) => void>; receive: (message: unknown) => void };
const receiverHubs = ((window as unknown as Record<symbol, Map<string, ReceiverHub>>)[receiverHubKey] ??= new Map());
const sequenceKey = Symbol.for('code-codex:bridge-request-sequence:v1');
const sequenceHost = window as unknown as Record<symbol, number>;

export class ExplorerBridge extends EventTarget {
  readonly #pending = new Map<string, PendingRequest>();
  readonly #listeners = new Set<NotificationListener>();
  readonly #timeoutMs: number;
  readonly #capabilityToken: string;
  readonly #bindingName: string;
  readonly #receiverName: string;
  readonly #receive: (message: BridgeMessage | string) => void;
  readonly #eventListener: EventListener;
  readonly #previousReceiver: ((message: BridgeMessage | string) => void) | undefined;
  #unsubscribeObjectBridge?: () => void;
  #sequence = 0;
  #disposed = false;

  constructor(
    capabilityToken: string,
    bindingName = bootstrap.binding,
    receiverName = bootstrap.receiver,
    timeoutMs = 12_000,
  ) {
    super();
    this.#capabilityToken = capabilityToken;
    this.#timeoutMs = timeoutMs;
    this.#bindingName = safeRuntimeName(bindingName, "__codeCodex");
    this.#receiverName = safeRuntimeName(receiverName, "__codeCodexReceive");
    this.#receive = (message) => this.#handle(message);
    this.#eventListener = ((event: CustomEvent<BridgeMessage | string>) => {
      this.#handle(event.detail);
    }) as EventListener;
    const runtime = window as unknown as Record<string, unknown>;
    this.#previousReceiver = undefined;
    let hub = receiverHubs.get(this.#receiverName);
    if (!hub) {
      const listeners = new Set<(message: unknown) => void>();
      hub = { listeners, receive: message => { for (const listener of [...listeners]) listener(message); } };
      receiverHubs.set(this.#receiverName, hub);
    }
    hub.listeners.add(this.#receive as (message: unknown) => void);
    runtime[this.#receiverName] = hub.receive;
    window.addEventListener(MESSAGE_EVENT, this.#eventListener);

    const binding = this.#binding();
    if (binding && typeof binding !== "function" && typeof binding.subscribe === "function") {
      const unsubscribe = binding.subscribe(this.#receive);
      if (typeof unsubscribe === "function") this.#unsubscribeObjectBridge = unsubscribe;
    }
    connectRuntimeInformation(this.request.bind(this));
    if (bootstrap.language) connectLanguage(this.request.bind(this));
    if (bootstrap.centralizedStorage) reconnectRendererStorage(this.request.bind(this));
  }

  get available(): boolean {
    return Boolean(this.#binding());
  }

  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = this.#timeoutMs): Promise<T> {
    const serial = sequenceHost[sequenceKey] = (sequenceHost[sequenceKey] ?? 0) + 1;
    const requestRef = `cle-${Date.now().toString(36)}-${serial.toString(36)}`;
    const started = performance.now();
    const observed=!method.startsWith('explorer.runtime.') && method!=='explorer.plugins.status' && !method.endsWith('.chunk');
    const complete=(outcome:string,extra:Record<string,unknown>={})=>{if(observed || (outcome!=='passed' && !method.startsWith('explorer.runtime.')))runtimeEvent('renderer-bridge',method,outcome,{requestRef,timeoutMs,durationMs:Math.round(performance.now()-started),...extra});};
    if(observed)runtimeEvent('renderer-bridge',method,'started',{requestRef,timeoutMs,hasRelativeEntry:'relativePath' in params,hasTaskSelection:'threadId' in params,hasPagination:'cursor' in params});
    if (this.#disposed) {complete('cancelled',{reason:'Bridge disposed'});return Promise.reject(new BridgeUnavailableError());}
    const binding = this.#binding();
    if (!binding) {complete('failed',{reason:'Native binding unavailable'});return Promise.reject(new BridgeUnavailableError());}

    const id = requestRef;
    const request: BridgeRequest = {
      id,
      token: this.#capabilityToken,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const rejectLogged=(error:unknown)=>{complete(this.#disposed?'cancelled':'failed',{...runtimeErrorDetails(error),...nativeFailureCorrelation(error)});reject(error);};
      const resolveLogged=(value:unknown)=>{
        const object=value && typeof value==='object'?value as Record<string,unknown>:{};
        const summary:Record<string,unknown>={};
        for(const key of ['entries','commits','files','changes'])if(Array.isArray(object[key]))summary[`${key}Count`]=(object[key] as unknown[]).length;
        for(const key of ['sizeBytes','chunkCount','truncated','installed','cached','launched','compatible'])if(typeof object[key]==='number'||typeof object[key]==='boolean')summary[key]=object[key];
        complete('passed',{resultSummary:summary});resolve(value as T);
      };
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        rejectLogged(new ExplorerBridgeError({ code: "TIMEOUT", message: `Timed out while requesting ${method}.` }));
      }, timeoutMs);
      this.#pending.set(id, { resolve: resolveLogged, reject:rejectLogged, timer });

      try {
        const output = this.#send(binding, request);
        if (output && typeof (output as PromiseLike<unknown>).then === "function") {
          void Promise.resolve(output).then(
            (value) => {
              if (value !== undefined) this.#acceptDirect(id, value);
            },
            (error) => this.#rejectPending(id, error),
          );
        } else if (output !== undefined) {
          this.#acceptDirect(id, output);
        }
      } catch (error) {
        this.#rejectPending(id, error);
      }
    });
  }

  subscribe(listener: NotificationListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    window.removeEventListener(MESSAGE_EVENT, this.#eventListener);
    const runtime = window as unknown as Record<string, unknown>;
    const hub = receiverHubs.get(this.#receiverName);
    hub?.listeners.delete(this.#receive as (message: unknown) => void);
    if (hub && !hub.listeners.size) {
      if (runtime[this.#receiverName] === hub.receive) delete runtime[this.#receiverName];
      receiverHubs.delete(this.#receiverName);
    }
    this.#unsubscribeObjectBridge?.();
    this.#listeners.clear();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeUnavailableError());
    }
    this.#pending.clear();
  }

  #binding(): typeof window.__codeCodex {
    const runtime = window as unknown as Record<string, unknown>;
    const binding = runtime[this.#bindingName];
    if (typeof binding === "function" || (binding && typeof binding === "object")) {
      return binding as typeof window.__codeCodex;
    }
    return this.#bindingName === "__codeCodex" ? window.__codeCodexNative : undefined;
  }

  #send(binding: NonNullable<typeof window.__codeCodex>, request: BridgeRequest): unknown {
    // Match SecureGate's grammar before sending. Rejected native ingress must
    // not echo untrusted IDs; a local typo should instead fail immediately.
    if (request.method.length === 0 || request.method.length > 128 || /[^a-z.]/.test(request.method)) {
      throw new ExplorerBridgeError({
        code: 'INVALID_METHOD',
        message: 'Native request methods must use 1–128 lowercase ASCII letters or dots.',
        data: { methodOmitted: true, methodLength: request.method.length, networkRequested: false },
      });
    }
    const encoded=JSON.stringify(request),payloadBytes=new TextEncoder().encode(encoded).byteLength;
    // The native ingress has a separate 96 KiB authenticated binding budget,
    // smaller than the CDP frame limit. Never let a rejected write look hung.
    if(payloadBytes>96*1024)throw new ExplorerBridgeError({code:'PAYLOAD_LIMIT',message:`Native request ${request.method} exceeds the binding payload limit: observedBytes=${payloadBytes}; maxBytes=${96*1024}.`,data:{payloadBytes,maxBytes:96*1024,payloadOmitted:true}});
    if (typeof binding === "function") return binding(encoded);
    const objectBridge = binding as ObjectBridge;
    if (typeof objectBridge.request === "function") return objectBridge.request(request);
    if (typeof objectBridge.send === "function") return objectBridge.send(request);
    throw new BridgeUnavailableError();
  }

  #acceptDirect(id: string, value: unknown): void {
    if (isBridgeResponse(value)) {
      this.#handle(value);
      return;
    }
    const pending = this.#pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.resolve(value);
  }

  #rejectPending(id: string, error: unknown): void {
    const pending = this.#pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.reject(error);
  }

  #handle(input: BridgeMessage | string | unknown): void {
    let message: unknown = input;
    if (typeof input === "string") {
      try {
        message = JSON.parse(input) as unknown;
      } catch {
        return;
      }
    }
    if (!message || typeof message !== "object") return;

    if (isBridgeResponse(message)) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      if (message.ok === false || message.error !== undefined) {
        pending.reject(new ExplorerBridgeError(message.error ?? { code: "INTERNAL", message: "The explorer request failed." }));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (isBridgeNotification(message)) {
      if (message.method === 'explorer.language.changed') applyLanguage(message.params);
      runtimeEvent("native-bridge", "notification", "received", {method:message.method});
      for (const listener of this.#listeners) listener(message);
      this.dispatchEvent(new CustomEvent(message.method, { detail: message.params }));
    }
  }
}

function isBridgeResponse(value: unknown): value is BridgeResponse {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function isBridgeNotification(value: unknown): value is BridgeNotification {
  return Boolean(value && typeof value === "object" && typeof (value as { method?: unknown }).method === "string");
}
export type { WorkspaceBridge } from './contracts/bridge';
