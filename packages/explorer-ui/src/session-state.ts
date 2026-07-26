const DISMISSED_STATE = Symbol.for("code-codex:dismissed");
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SESSION_ID_KEY = "code-codex:session-id:v1";
export const SESSION_DISMISSAL_PREFIX = "code-codex:dismissed:v1:";

type SessionWindow = Pick<Window, "crypto" | "sessionStorage"> & Record<PropertyKey, unknown>;

function asSessionWindow(target: Window): SessionWindow {
  return target as unknown as SessionWindow;
}

function storageFor(state: SessionWindow): Storage | null {
  try {
    return state.sessionStorage;
  } catch {
    return null;
  }
}

function sessionIdFor(state: SessionWindow, storage: Storage): string | null {
  try {
    const existing = storage.getItem(SESSION_ID_KEY);
    if (existing && SESSION_ID_PATTERN.test(existing)) return existing.toLowerCase();

    const generated = state.crypto.randomUUID().toLowerCase();
    if (!SESSION_ID_PATTERN.test(generated)) return null;
    storage.setItem(SESSION_ID_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export function dismissExplorerForSession(target: Window = window): void {
  const state = asSessionWindow(target);
  try {
    state[DISMISSED_STATE] = true;
  } catch {
    // Continue with the page-session marker when the host Window is sealed.
  }
  const storage = storageFor(state);
  if (!storage) return;
  const sessionId = sessionIdFor(state, storage);
  if (!sessionId) return;
  try {
    storage.setItem(`${SESSION_DISMISSAL_PREFIX}${sessionId}`, "1");
  } catch {
    // The realm-local marker still protects same-document remounts when DOM
    // storage is unavailable or disabled for this origin.
  }
}

export function clearExplorerDismissalForSession(target: Window = window): void {
  const state = asSessionWindow(target);
  try {
    // Keep an explicit realm-local false value so restoration still works when
    // a storage implementation permits reads but rejects removal.
    state[DISMISSED_STATE] = false;
  } catch {
    // Continue with the guarded page-session marker removal when the host
    // Window is sealed.
  }
  const storage = storageFor(state);
  if (!storage) return;
  const sessionId = sessionIdFor(state, storage);
  if (!sessionId) return;
  let storageCleared = false;
  try {
    storage.removeItem(`${SESSION_DISMISSAL_PREFIX}${sessionId}`);
    storageCleared = storage.getItem(`${SESSION_DISMISSAL_PREFIX}${sessionId}`) !== "1";
  } catch {
    // The realm-local false value still permits restoration in this renderer
    // when DOM storage is unavailable or disabled for this origin.
  }
  if (!storageCleared) return;
  try {
    delete state[DISMISSED_STATE];
  } catch {
    try {
      state[DISMISSED_STATE] = undefined;
    } catch {
      // A sealed host may retain the harmless explicit false value.
    }
  }
}

export function isExplorerDismissedForSession(target: Window = window): boolean {
  const state = asSessionWindow(target);
  try {
    if (state[DISMISSED_STATE] === true) return true;
    if (state[DISMISSED_STATE] === false) return false;
  } catch {
    // Continue with the guarded page-session lookup.
  }
  const storage = storageFor(state);
  if (!storage) return false;
  const sessionId = sessionIdFor(state, storage);
  if (!sessionId) return false;
  try {
    return storage.getItem(`${SESSION_DISMISSAL_PREFIX}${sessionId}`) === "1";
  } catch {
    return false;
  }
}
