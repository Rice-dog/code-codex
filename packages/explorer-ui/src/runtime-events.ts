import { redactRuntimeText, redactRuntimeValue } from "./runtime-redaction";
export interface RuntimeEvent { source: string; action: string; outcome: string; details: Record<string, unknown>; }
interface EventState { events: RuntimeEvent[]; dropped: number; }
const key = Symbol.for("code-codex:runtime-events:v1");
const store = window as unknown as Record<symbol, EventState | undefined>;
const state = store[key] ??= { events: [], dropped: 0 };

/** Early loading-page events survive until the authenticated native bridge is available. */
export function runtimeEvent(source: string, action: string, outcome: string, details: Record<string, unknown> = {}): void {
  const event: RuntimeEvent = { source: redactRuntimeText(source).slice(0,160), action: redactRuntimeText(action).slice(0,160), outcome: redactRuntimeText(outcome).slice(0,160), details: { ...(redactRuntimeValue(details) as Record<string, unknown>), observedAt: Date.now(), documentElapsedMs: Math.round(performance.now()) } };
  const bytes = new TextEncoder().encode(JSON.stringify(event)).length;
  if (bytes > 7000) event.details = {truncated:true,originalBytes:bytes,observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())};
  state.events.push(event);
  if (state.events.length > 1000) { state.events.splice(0, 200); state.dropped += 200; }
}
export function takeRuntimeEvents(): RuntimeEvent[] {
  if (state.dropped) { state.events.unshift({ source:"renderer",action:"event buffer",outcome:"truncated",details:{droppedEvents:state.dropped} }); state.dropped = 0; }
  // Authenticated binding requests have a 96 KB ceiling, including envelope/token.
  let bytes = 0, count = 0;
  for (const event of state.events.slice(0,128)) {
    const size = new TextEncoder().encode(JSON.stringify(event)).length + 1;
    if (bytes + size > 64 * 1024) break;
    bytes += size; count++;
  }
  return state.events.splice(0, count).map(event => ({
    source: redactRuntimeText(event.source).slice(0,160), action: redactRuntimeText(event.action).slice(0,160), outcome: redactRuntimeText(event.outcome).slice(0,160),
    details: redactRuntimeValue(event.details) as Record<string, unknown>,
  }));
}
export function restoreRuntimeEvents(events: RuntimeEvent[]): void {
  state.events.unshift(...events);
  if (state.events.length > 1000) { const count = state.events.length - 1000; state.events.splice(0,count); state.dropped += count; }
}
const tasks = new Map<string,string>();
export function runtimeTaskLabel(id: string | null): string {
  if (!id) return "none";
  if (!tasks.has(id)) tasks.set(id,`task-${tasks.size+1}`);
  return tasks.get(id)!;
}
