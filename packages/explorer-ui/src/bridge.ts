import type {
  BootstrapConfig,
  BridgeErrorData,
  BridgeMessage,
  BridgeNotification,
  BridgeRequest,
  BridgeResponse,
  ObjectBridge,
} from "./types";
import { codex26715Adapter } from "./adapters/codex-26.715";

const MESSAGE_EVENT = "code-codex:message";

function consumeBootstrap(): Readonly<BootstrapConfig> {
  const source = window.__CODE_CODEX_BOOTSTRAP__;
  const copy: BootstrapConfig = source
    ? {
        ...(typeof source.token === "string" ? { token: source.token } : {}),
        ...(typeof source.supported === "boolean" ? { supported: source.supported } : {}),
        ...(typeof source.compatible === "boolean" ? { compatible: source.compatible } : {}),
        ...(typeof source.version === "string" ? { version: source.version } : {}),
        ...(typeof source.codexVersion === "string" ? { codexVersion: source.codexVersion } : {}),
        ...(typeof source.channel === "string" ? { channel: source.channel } : {}),
        ...(typeof source.forceDrawer === "boolean" ? { forceDrawer: source.forceDrawer } : {}),
        ...(typeof source.manualWorkspace === "boolean" ? { manualWorkspace: source.manualWorkspace } : {}),
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

export function getBootstrapConfig(): Readonly<BootstrapConfig> {
  return bootstrap;
}

export function assessBootstrapCompatibility(config: Readonly<BootstrapConfig> = bootstrap): { supported: boolean; version?: string; reason?: string } {
  const version = config.codexVersion ?? config.version;
  if (config.supported === false || config.compatible === false) {
    return {
      supported: false,
      ...(version ? { version } : {}),
      reason: version ? `Codex ${version} has not been verified.` : "This Codex version has not been verified.",
    };
  }
  if (version && !codex26715Adapter.supportsVersion(version)) {
    return { supported: false, version, reason: `Codex ${version} is outside the verified 26.715.x adapter range.` };
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

export class ExplorerBridge extends EventTarget {
  readonly #pending = new Map<string, PendingRequest>();
  readonly #listeners = new Set<NotificationListener>();
  readonly #timeoutMs: number;
  readonly #capabilityToken: string;
  readonly #receive: (message: BridgeMessage | string) => void;
  readonly #eventListener: EventListener;
  readonly #previousReceiver: typeof window.__codeCodexReceive;
  #unsubscribeObjectBridge?: () => void;
  #sequence = 0;
  #disposed = false;

  constructor(capabilityToken: string, timeoutMs = 12_000) {
    super();
    this.#capabilityToken = capabilityToken;
    this.#timeoutMs = timeoutMs;
    this.#receive = (message) => this.#handle(message);
    this.#eventListener = ((event: CustomEvent<BridgeMessage | string>) => {
      this.#handle(event.detail);
    }) as EventListener;
    this.#previousReceiver = window.__codeCodexReceive;
    window.__codeCodexReceive = this.#receive;
    window.addEventListener(MESSAGE_EVENT, this.#eventListener);

    const binding = this.#binding();
    if (binding && typeof binding !== "function" && typeof binding.subscribe === "function") {
      const unsubscribe = binding.subscribe(this.#receive);
      if (typeof unsubscribe === "function") this.#unsubscribeObjectBridge = unsubscribe;
    }
  }

  get available(): boolean {
    return Boolean(this.#binding());
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.#disposed) return Promise.reject(new BridgeUnavailableError());
    const binding = this.#binding();
    if (!binding) return Promise.reject(new BridgeUnavailableError());

    const id = `cle-${Date.now().toString(36)}-${(++this.#sequence).toString(36)}`;
    const request: BridgeRequest = {
      id,
      token: this.#capabilityToken,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new ExplorerBridgeError({ code: "TIMEOUT", message: `Timed out while requesting ${method}.` }));
      }, this.#timeoutMs);
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

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
    if (window.__codeCodexReceive === this.#receive) {
      if (this.#previousReceiver) window.__codeCodexReceive = this.#previousReceiver;
      else delete window.__codeCodexReceive;
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
    return window.__codeCodex ?? window.__codeCodexNative;
  }

  #send(binding: NonNullable<typeof window.__codeCodex>, request: BridgeRequest): unknown {
    if (typeof binding === "function") return binding(JSON.stringify(request));
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
