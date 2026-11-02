// Only read transport failures may retry without an explicit reconciliation.
// A missing event or a failed consumer is never repaired by skipping a cursor.
export interface StreamFault {
 id:number;code:string;retryable:boolean;failures:number;startedAt:number;nextRetryAt:number;
}
export function accountErrorCode(error:unknown):string {
 const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
 return (/^[A-Z][A-Z0-9_]{1,79}$/.test(code)?code:String(error).match(/\b(?:ACCOUNT_[A-Z_]+|TIMEOUT|DISCONNECTED)\b/)?.[0])??'ACCOUNT_STREAM_UNCLASSIFIED';
}
export function streamFault(error:unknown,id:number,previous?:StreamFault,now=Date.now()):StreamFault {
 const code=accountErrorCode(error),failures=(previous?.failures??0)+1;
 const retryable=['TIMEOUT','ACCOUNT_REQUEST_BUSY','ACCOUNT_BUSY','BRIDGE_DISCONNECTED','ACCOUNT_TRANSPORT_HANDOFF'].includes(code);
 return {id:previous?.id??id,code,retryable,failures,startedAt:previous?.startedAt??now,nextRetryAt:now+Math.min(15000,1000*2**Math.min(4,failures-1))};
}
export function shouldRetryStream(fault:StreamFault,now=Date.now()):boolean {
 return fault.retryable&&fault.failures<=5&&now>=fault.nextRetryAt;
}
