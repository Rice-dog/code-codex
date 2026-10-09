import { runtimeEvent } from "./runtime-events";

let operationSequence = 0;
export function runtimeErrorDetails(error: unknown): Record<string, unknown> {
  try {
  const errorChain: string[] = [], seen = new Set<unknown>();
  let current = error;
  while (current != null && errorChain.length < 8 && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) { errorChain.push(`${current.name}: ${current.message}`); current = current.cause; }
    else { errorChain.push(typeof current === 'string' ? current : 'Non-Error rejection'); break; }
  }
  const code = error && typeof error === 'object' && 'code' in error ? (error as {code:unknown}).code : undefined;
  return { errorChain, ...(typeof code === 'string' || typeof code === 'number' ? {errorCode:code} : {}), ...(error instanceof Error && error.stack ? {exceptionStack:error.stack.slice(0,3000)} : {}), chainTruncated:current != null && errorChain.length >= 8 };
  } catch {return {errorChain:['Exception details could not be inspected safely.']};}
}
export function beginRuntimeOperation(source: string, action: string, details: Record<string,unknown> = {}) {
  const operationId = `renderer-${++operationSequence}`, started = performance.now();
  let finished = false;
  const event = (phase: string, outcome: string, extra: Record<string,unknown> = {}) => runtimeEvent(source,phase,outcome,{...details,...extra,operationId,durationMs:Math.round(performance.now()-started)});
  event(action,'started');
  return { event, finish(outcome: string, extra: Record<string,unknown> = {}) { if (!finished) {event(action,outcome,extra);finished=true;} } };
}
