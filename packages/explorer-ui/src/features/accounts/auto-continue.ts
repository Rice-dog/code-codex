import {projectAssets,emptyAssets,usableCredits} from './assets-model';
import {quotaRemaining} from './quota';

type RecordValue=Record<string,unknown>;
const object=(v:unknown):RecordValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{};
/** The pinned protocol distinguishes exhausted usage from transient request throttling. */
export function isQuotaExhausted(turn:unknown):boolean {
 const t=object(turn);return t.status==='failed'&&object(t.error).codexErrorInfo==='usageLimitExceeded';
}
export type AutoPhase='checking'|'preparing'|'continuing';
export type QuotaEligibility='available'|'exhausted'|'unknown';
export function quotaEligibility(raw:unknown,model?:string):QuotaEligibility {
 if(object(raw).pluginCreditAllowed===true&&usableCredits({...emptyAssets(),...projectAssets(raw)}))return 'available';
 const q=quotaRemaining(raw,Date.now(),model);
 if(q.fiveHour===0||q.weekly===0)return 'exhausted';
 return q.fiveHour!==null&&q.weekly!==null&&q.fiveHour>0&&q.weekly>0?'available':'unknown';
}
/** One in-memory traversal per user task. No history, credentials or input are retained here. */
export class AccountContinuationCycle {
 order:readonly string[];
 readonly attempted=new Set<string>();
 #index:number;
 cancelled=false;
 constructor(ids:readonly string[],current:string){this.order=[...new Set(ids)].slice(0,128);this.#index=this.order.indexOf(current);if(this.#index<0)throw Error('ACCOUNT_AUTO_ORDER: The current execution account is unavailable.');this.attempted.add(current);}
 reorder(ids:readonly string[],current:string):void{this.order=[...new Set(ids)].slice(0,128);this.#index=this.order.indexOf(current);}
 next():string|undefined {
  if(this.cancelled)return;
  for(let i=0;i<this.order.length;i++){this.#index=(this.#index+1)%this.order.length;const id=this.order[this.#index]!;if(!this.attempted.has(id)){this.attempted.add(id);return id;}}
 }
 cancel():void{this.cancelled=true;}
}
export interface ContinuationPorts {
 current():boolean;
 available(id:string):boolean;
 quota(id:string):Promise<unknown>;
 prepare(id:string):Promise<void>;
 resume(id:string):Promise<void>;
 phase(value:AutoPhase):void;
 event(stage:string,details:Record<string,unknown>):void;
 model?:string|undefined;
}
/** Fresh quota before one continuation; terminal events decide whether to traverse further. */
export async function continueAfterQuota(cycle:AccountContinuationCycle,ports:ContinuationPorts):Promise<'continued'|'unavailable'|'cancelled'> {
 const current=()=>!cycle.cancelled&&ports.current();
 while(current()){
  const id=cycle.next();if(!id)return 'unavailable';
  const candidateOrdinal=cycle.order.indexOf(id)+1;
  if(!ports.available(id)){ports.event('skipped',{reason:'connection-removed',candidateOrdinal,attempted:cycle.attempted.size});continue;}
  ports.phase('checking');let raw:unknown;
  try{raw=await ports.quota(id);}catch(error){if(!current())return 'cancelled';ports.event('skipped',{reason:'quota-read-unavailable',errorCode:String(error).match(/ACCOUNT_[A-Z_]+/)?.[0]??'ACCOUNT_USAGE_UNAVAILABLE',candidateOrdinal,attempted:cycle.attempted.size});continue;}
  if(!current())return 'cancelled';
  const eligibility=quotaEligibility(raw,ports.model);
  if(eligibility!=='available'){ports.event('skipped',{reason:'quota-'+eligibility,candidateOrdinal,attempted:cycle.attempted.size});continue;}
  ports.event('quota-confirmed',{candidateOrdinal,attempted:cycle.attempted.size});ports.phase('preparing');await ports.prepare(id);
  if(!current())return 'cancelled';
  ports.phase('continuing');if(!current())return 'cancelled';await ports.resume(id);ports.event('continued',{candidateOrdinal,attempted:cycle.attempted.size});return 'continued';
 }
 return 'cancelled';
}
const stickyFields=['model','serviceTier','effort','summary','collaborationMode','multiAgentMode','personality','outputSchema','disabledPluginIds'] as const;
/** Reuse settings, not original prompts/attachments/tool output or delivery callbacks. */
export function continuationSettings(request:RecordValue):RecordValue {
 return Object.fromEntries(stickyFields.filter(k=>request[k]!==undefined).map(k=>[k,structuredClone(request[k])]));
}
export function continuationOperation(threadId:string,settings:RecordValue,messageId:string):{request:RecordValue} {
 return {request:{...settings,threadId,clientUserMessageId:messageId,input:[{type:'text',text:'Continue the unfinished task from the existing conversation and current project state. Preserve completed work. Check the outcome of the last interrupted action before repeating it. Stop when the task is complete.',text_elements:[]}]}};
}
