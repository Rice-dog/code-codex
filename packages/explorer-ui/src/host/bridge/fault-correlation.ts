/** Correlation adapter; technical evidence stays in the native bounded log. */
export function nativeFailureCorrelation(error: unknown): Record<string,unknown> {
  const result: Record<string,unknown>={};
  // Reuse a bounded native envelope; renderer propagation is not another root
  // failure and must not lose the request/epoch needed to find the native log.
  const data=error&&typeof error==='object'&&'data' in error? (error as { data: unknown }).data:undefined;
  const fault=data&&typeof data==='object'&&'fault' in data? (data as { fault: unknown }).fault:undefined;
  if(fault&&typeof fault==='object'&&'schema' in fault&&fault.schema===2&&'failureRef' in fault&&typeof fault.failureRef==='string'&&/^bridge-[0-9]+-[a-zA-Z0-9-]{1,100}$/.test(fault.failureRef)) {
    // Propagate correlation only. Full native evidence remains in its bounded log.
    result.failureRef=fault.failureRef;
    if('requestRef' in fault&&typeof fault.requestRef==='string') result.requestRef=fault.requestRef.slice(0,100);
    if('lifecycleEpoch' in fault&&Number.isSafeInteger(fault.lifecycleEpoch)) result.lifecycleEpoch=fault.lifecycleEpoch;
    result.propagatedFailure=true;
  }
  return result;
}
