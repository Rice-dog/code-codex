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
 /** APIs have no standard balance endpoint. Admission is verified by prepare. */
 isApi?(id:string):boolean;
}
/** Fresh quota before one continuation; terminal events decide whether to traverse further. */
export async function continueAfterQuota(cycle:AccountContinuationCycle,ports:ContinuationPorts):Promise<'continued'|'unavailable'|'cancelled'> {
 const current=()=>!cycle.cancelled&&ports.current();
 while(current()){
  const id=cycle.next();if(!id)return 'unavailable';
  const candidateOrdinal=cycle.order.indexOf(id)+1;
  if(!ports.available(id)){ports.event('skipped',{reason:'connection-removed',candidateOrdinal,attempted:cycle.attempted.size});continue;}
  ports.phase('checking');let raw:unknown;
  if(ports.isApi?.(id)){
   ports.event('api-candidate',{candidateOrdinal,attempted:cycle.attempted.size,balance:'unverified'});
  }else{
  try{raw=await ports.quota(id);}catch(error){if(!current())return 'cancelled';ports.event('skipped',{reason:'quota-read-unavailable',errorCode:String(error).match(/ACCOUNT_[A-Z_]+/)?.[0]??'ACCOUNT_USAGE_UNAVAILABLE',candidateOrdinal,attempted:cycle.attempted.size});continue;}
  if(!current())return 'cancelled';
  const eligibility=quotaEligibility(raw,ports.model);
  if(eligibility!=='available'){ports.event('skipped',{reason:'quota-'+eligibility,candidateOrdinal,attempted:cycle.attempted.size});continue;}
  ports.event('quota-confirmed',{candidateOrdinal,attempted:cycle.attempted.size});
  }
  if(!current())return 'cancelled';
  ports.phase('preparing');await ports.prepare(id);
  if(!current())return 'cancelled';
  ports.phase('continuing');if(!current())return 'cancelled';await ports.resume(id);ports.event('continued',{candidateOrdinal,attempted:cycle.attempted.size});return 'continued';
 }
 return 'cancelled';
}
/** Exact saved catalog IDs only; this never changes the connection default. */
export function apiContinuationSettings(settings:RecordValue,api:{model:string;models?:string[]}):RecordValue {
 const models=api.models??[api.model];
 if(!models.length||!models.includes(api.model))throw Error('ACCOUNT_API_MODELS: The saved default model is unavailable. No continuation was sent.');
 const matched=typeof settings.model==='string'&&models.includes(settings.model);
 const model=matched?settings.model:api.model;
 const effort=matched&&typeof settings.effort==='string'&&['none','minimal','low','medium','high','xhigh','max','ultra'].includes(settings.effort)?settings.effort:'medium';
 const result:RecordValue={...continuationSettings(settings),model,effort,serviceTier:null};
 if(result.collaborationMode&&typeof result.collaborationMode==='object')result.collaborationMode={...object(result.collaborationMode),settings:{...object(object(result.collaborationMode).settings),model,reasoning_effort:effort}};
 return result;
}
const stickyFields=['model','serviceTier','effort','summary','collaborationMode','multiAgentMode','personality','outputSchema','disabledPluginIds'] as const;
/** Reuse settings, not original prompts/attachments/tool output or delivery callbacks. */
export function continuationSettings(request:RecordValue):RecordValue {
 return Object.fromEntries(stickyFields.filter(k=>request[k]!==undefined).map(k=>[k,structuredClone(request[k])]));
}
export function continuationOperation(threadId:string,settings:RecordValue,messageId:string):{request:RecordValue} {
 return {request:{...settings,threadId,clientUserMessageId:messageId,input:[{type:'text',text:'Continue the unfinished task from the existing conversation and current project state. Preserve completed work. Check the outcome of the last interrupted action before repeating it. Stop when the task is complete.',text_elements:[]}]}};
}
