import {projectAssets,assetProjection,emptyAssets,resetDefinitelyNotSent,type AccountAssets} from './assets-model';
export interface QuotaRemaining {fiveHour:number|null;weekly:number|null;}
/** Unix seconds supplied by the server, independently cached for each window. */
export interface QuotaResetTimes {fiveHour:number|null;weekly:number|null;}
type RecordValue=Record<string,unknown>;
const object=(v:unknown):RecordValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{};
export function projectQuota(raw:unknown):unknown {
 const r=object(raw),window=(v:unknown)=>{const w=object(v);return {usedPercent:w.usedPercent,windowDurationMins:w.windowDurationMins,resetsAt:w.resetsAt};};
 const bucket=(v:unknown)=>{const b=object(v);return {...(Object.hasOwn(b,'credits')?{credits:assetProjection({rateLimits:b}).credits}:{}),limitId:typeof b.limitId==='string'?b.limitId.slice(0,100):null,normalModelSlug:typeof b.normalModelSlug==='string'?b.normalModelSlug.slice(0,160):null,primary:window(b.primary),secondary:window(b.secondary)};};
 return {...(Object.hasOwn(r,'ordinaryUsageAllowed')?{ordinaryUsageAllowed:typeof r.ordinaryUsageAllowed==='boolean'?r.ordinaryUsageAllowed:null}:{}),...(Object.hasOwn(r,'rateLimitResetCredits')?{rateLimitResetCredits:assetProjection(r).rateLimitResetCredits}:{}),rateLimits:bucket(r.rateLimits),rateLimitsByLimitId:Object.fromEntries(Object.entries(object(r.rateLimitsByLimitId)).slice(0,32).filter(([k])=>k.length<=100).map(([k,b])=>[k,bucket(b)]))};
}
/** Duration, not primary/secondary position, identifies a quota window. */
function quotaWindows(raw:unknown,modelSlug?:string):RecordValue[] {
 const response=object(raw),buckets=object(response.rateLimitsByLimitId),all=Object.values(buckets).map(object);
 const matched=modelSlug?all.filter(v=>v.normalModelSlug===modelSlug||v.limitId===modelSlug):[];
 const single=object(response.rateLimits);
 const bucket=matched.length===1?matched[0]!:object(buckets.codex??(single.limitId==='codex'||(!Object.keys(buckets).length&&!single.limitId)?single:null));
 return [object(bucket.primary),object(bucket.secondary)];
}
function validWindow(windows:RecordValue[],duration:number,now:number):RecordValue|undefined {
 const matches=windows.filter(w=>w.windowDurationMins===duration);if(matches.length!==1)return;
 const w=matches[0]!,used=w.usedPercent,reset=w.resetsAt;
 if(typeof used==='number'&&Number.isFinite(used)&&used>=0&&used<=100&&typeof reset==='number'&&Number.isSafeInteger(reset)&&reset*1000>now&&reset*1000<=8640000000000000)return w;
}
export function quotaRemaining(raw:unknown,now=Date.now(),modelSlug?:string):QuotaRemaining {
 const windows=quotaWindows(raw,modelSlug);
 const remaining=(duration:number):number|null=>{
  const w=validWindow(windows,duration,now);return w?Math.round((100-(w.usedPercent as number))*10)/10:null;
 };
 return {fiveHour:remaining(300),weekly:remaining(10080)};
}
export function quotaResetTimes(raw:unknown,now=Date.now()):QuotaResetTimes {
 const windows=quotaWindows(raw);
 const reset=(duration:number)=>{const w=validWindow(windows,duration,now);return w&&(w.usedPercent as number)>0?w.resetsAt as number:null;};
 return {fiveHour:reset(300),weekly:reset(10080)};
}
interface Snapshot {raw?:unknown;phase:'loading'|'ready'|'unavailable';checkedAt:number;lastSuccessAt?:number|undefined;nextRead:number;error?:string;}
/** Owner-scoped, memory-only and shared by both views. Two reads at most; no inference. */
export class AccountUsageStore {
 #redemptions=new Map<string,Promise<string>>();
 #assetDeadlines=new Map<string,{credits:number;cards:number}>();
 #assetValues=new Map<string,AccountAssets>();
 assetActions?:{allowed:(id:string)=>boolean;toggle:(id:string)=>Promise<void>;details:(id:string)=>Promise<unknown>;consume:(id:string,cardId:string,key:string)=>Promise<string>}|undefined;
 assets(id:string):AccountAssets{return this.#assetValues.get(id)??emptyAssets();}
 creditAllowed(id:string):boolean{return this.assetActions?.allowed(id)??false;}
 assetChanged():void{this.revision++;this.changed();}
 async loadCards(id:string):Promise<void>{const epoch=this.#observations.get(id)??0;const value=await this.assetActions?.details(id);if(!this.#disposed&&value!==undefined&&(this.#observations.get(id)??0)===epoch)this.observe(id,value);}
 consumeCard(id:string,cardId:string,key:string):Promise<string>{
  if(this.#disposed||!this.assetActions)return Promise.reject(Error('ACCOUNT_ASSET_UNAVAILABLE: Card controls are unavailable.'));
  const identity=id+':'+cardId,prior=this.#redemptions.get(identity);if(prior)return prior;
  const job=(async()=>{const outcome=await this.assetActions!.consume(id,cardId,key);if(!this.#disposed){if(outcome==='reset'||outcome==='alreadyRedeemed'){this.#assetValues.set(id,{...this.assets(id),availableCount:null,cards:null});this.assetChanged();}try{await this.loadCards(id);}catch(error){this.diagnostic(id,'refresh-failed',{stage:'reset-post-read',outcome,errorCode:'ACCOUNT_ASSET_REFRESH_FAILED'});}}if(outcome==='nothingToReset'||outcome==='noCredit')this.#redemptions.delete(identity);return outcome;})().catch(error=>{if(resetDefinitelyNotSent(error))this.#redemptions.delete(identity);throw error;});
  // Retain failed/uncertain attempts too. A new click must never mint a new redemption.
  this.#redemptions.set(identity,job);return job;
 }
 #inUse=new Set<string>();
 #dirty=new Set<string>();
 #values=new Map<string,Snapshot>();#queue:string[]=[];#running=0;#disposed=false;
 #resets=new Map<string,QuotaResetTimes>();
 #observations=new Map<string,number>();
 #activeReads=new Map<string,number>();
 #acceptedAt=new Map<string,number>();
 #cachedVersions=new Map<string,string>();
 #suspended=false;
 #readSequence=0;
 revision=0;
 constructor(private readonly read:(id:string)=>Promise<unknown>,private readonly changed:()=>void,private readonly now=Date.now,private readonly diagnostic:(id:string,outcome:string,details:Record<string,unknown>)=>void=()=>{}){}
 remaining(id:string):QuotaRemaining {const value=this.#values.get(id);return value?.raw?quotaRemaining(value.raw,this.now()):{fiveHour:null,weekly:null};}
 resetTimes(id:string):QuotaResetTimes {const cached=this.#resets.get(id),now=this.now();const valid=(value:number|null|undefined)=>value&&value*1000>now?value:null;return {fiveHour:valid(cached?.fiveHour),weekly:valid(cached?.weekly)};}
 diagnostics(id:string):Readonly<Snapshot>|undefined{return this.#values.get(id);}
 suspend(value:boolean):void{this.#suspended=value;if(!value)this.#pump();}
 markUsed(id:string):void{this.#inUse.add(id);this.#activeReads.set(id,this.now());}
 observe(id:string,raw:unknown):void{
  if(this.#disposed)return;
  const before=this.#presentation(id);
  // Even an identical push retires an older in-flight read. Freshness metadata
  // updates independently of whether the visible quota has changed.
  this.#observations.set(id,(this.#observations.get(id)??0)+1);this.#accept(id,raw);
  if(before!==this.#presentation(id)){this.revision++;this.changed();}
 }
 /** Re-reading a relay snapshot is not a fresh server observation. */
 observeCached(id:string,raw:unknown):void{
  const v=object(raw),at=v.observedAtMs,revision=v.observationRevision;
  if(this.#disposed||typeof at!=='number'||!Number.isSafeInteger(at)||at<=0||at>this.now()+5000||typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<=0)return;
  const key=at+':'+revision;
  if(this.#cachedVersions.get(id)===key||at<=(this.#acceptedAt.get(id)??0))return;
  this.#cachedVersions.set(id,key);
  this.diagnostic(id,'observed',{stage:'quota-observation',source:'relay-snapshot',observedAtMs:at,observationRevision:revision});
  const before=this.#presentation(id);
  this.#observations.set(id,(this.#observations.get(id)??0)+1);this.#accept(id,raw,at);
  if(before!==this.#presentation(id)){this.revision++;this.changed();}
 }
 #presentation(id:string):string{const value=this.#values.get(id);return JSON.stringify([value?.raw,value?.phase,value?.error,value?.lastSuccessAt?Math.floor(value.lastSuccessAt/60000):null,this.#resets.get(id),this.#assetValues.get(id)]);}
 invalidate(id:string):void{this.#inUse.delete(id);this.#activeReads.delete(id);this.#dirty.add(id);const v=this.#values.get(id);if(v?.phase!=='loading'&&v)v.nextRead=0;}
 refresh(ids:readonly string[]):void {
  if(this.#disposed||this.#suspended)return;
  let updated=false;
  for(const id of new Set(ids)){
   const resetDue=this.#values.get(id)?.phase==='ready'&&(this.#values.get(id)?.nextRead??Infinity)<=this.now();
   if(this.#inUse.has(id)&&!resetDue&&this.now()-(this.#activeReads.get(id)??this.now())<30000)continue;
   const existing=this.#values.get(id);if(existing&&(existing.phase==='loading'||(existing.nextRead>this.now()&&!this.#dirty.has(id)&&!this.#inUse.has(id))))continue;
   if(existing?.phase==='unavailable'&&existing.nextRead>this.now()&&!this.#dirty.has(id))continue;
   if(this.#inUse.has(id))this.#activeReads.set(id,this.now());
   this.#dirty.delete(id);this.#values.set(id,{...(existing?.raw?{raw:existing.raw}:{}),lastSuccessAt:existing?.lastSuccessAt,phase:'loading',checkedAt:existing?.checkedAt??this.now(),nextRead:Infinity});this.#queue.push(id);updated=true;
  }
  if(updated){this.revision++;this.changed();this.#pump();}
 }
 #pump():void {
  while(!this.#disposed&&!this.#suspended&&this.#running<2&&this.#queue.length){const id=this.#queue.shift()!,observation=this.#observations.get(id)??0,operationId=++this.#readSequence;this.#running++;
   this.diagnostic(id,'started',{stage:'quota-read',source:'official-read',operationId,active:this.#inUse.has(id)});
   void this.read(id).then(raw=>{
    if(this.#disposed)return;
    if((this.#observations.get(id)??0)!==observation){this.diagnostic(id,'superseded',{stage:'quota-read',operationId,reason:'newer-observation'});return;}
    this.#accept(id,raw,this.now(),true);this.diagnostic(id,'completed',{stage:'quota-read',operationId,complete:this.#values.get(id)?.phase==='ready'});
   },error=>{if(!this.#disposed&&(this.#observations.get(id)??0)===observation){this.#values.set(id,{...(this.#values.get(id)?.raw?{raw:this.#values.get(id)!.raw}:{}),lastSuccessAt:this.#values.get(id)?.lastSuccessAt,phase:'unavailable',checkedAt:this.now(),nextRead:this.now()+300000,error:error instanceof Error?error.message:String(error)});this.diagnostic(id,'failed',{stage:'quota-read',retryMs:300000,cached:!!this.#values.get(id)?.raw,error:String(error)});}}).finally(()=>{this.#running--;if(!this.#disposed){this.revision++;this.changed();this.#pump();}});
  }
 }
 #accept(id:string,raw:unknown,observedAt=this.now(),officialRead=false):void{
    const assetUpdate=projectAssets(raw),due=this.#assetDeadlines.get(id)??{credits:observedAt+300000,cards:observedAt+300000};
    if(officialRead||Object.hasOwn(assetUpdate,'balance'))due.credits=observedAt+300000;
    if(officialRead||Object.hasOwn(assetUpdate,'availableCount'))due.cards=observedAt+300000;
    this.#assetDeadlines.set(id,due);
    this.#assetValues.set(id,{...this.assets(id),...assetUpdate});
    this.#acceptedAt.set(id,observedAt);
    if(this.#inUse.has(id))this.#activeReads.set(id,observedAt);
    const now=this.now(),projected=projectQuota(raw),response=object(projected),bucket=object(response.rateLimits),resets=[bucket,...Object.values(object(response.rateLimitsByLimitId)).map(object)].flatMap(b=>[object(b.primary).resetsAt,object(b.secondary).resetsAt]).filter((v):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v*1000>now).map(v=>v*1000+500);
    const observed=quotaResetTimes(projected,now),remaining=quotaRemaining(projected,now),previous=this.resetTimes(id),old=this.#values.get(id);
    const complete=remaining.fiveHour!==null&&remaining.weekly!==null;
    const keep=(key:keyof QuotaResetTimes)=>remaining[key]===100&&observed[key]===null?null:previous[key]??observed[key];
    const cached={fiveHour:keep('fiveHour'),weekly:keep('weekly')};this.#resets.set(id,cached);
    resets.push(...(this.assets(id).cards??[]).map(c=>c.expiresAt).filter((v):v is number=>v!==null&&v*1000>now).map(v=>v*1000+500));
    resets.push(...Object.values(cached).filter((v):v is number=>v!==null).map(v=>v*1000+500));
    const prior=quotaWindows(old?.raw),fresh=quotaWindows(projected);
    const windows=[300,10080].map(duration=>validWindow(fresh,duration,now)??validWindow(prior,duration,now)??{});
    const effective=complete?projected:{...object(projected),rateLimits:{limitId:'codex',primary:windows[0],secondary:windows[1]},rateLimitsByLimitId:{...object(response.rateLimitsByLimitId),codex:{limitId:'codex',primary:windows[0],secondary:windows[1]}}};
    this.#values.set(id,{phase:complete?'ready':'unavailable',raw:effective,checkedAt:observedAt,lastSuccessAt:complete?observedAt:old?.lastSuccessAt,nextRead:complete?Math.min(observedAt+300000,due.credits,due.cards,...resets):now+30000,...complete?{}:{error:'ACCOUNT_USAGE_INCOMPLETE: The quota response did not contain both valid windows. Cached values may be shown; retry in 30 seconds.'}});
    if(!complete||old?.phase==='unavailable')this.diagnostic(id,complete?'recovered':'incomplete',{stage:'quota-validation',retryMs:complete?null:30000,cached:!!old?.raw,lastSuccessAt:complete?now:old?.lastSuccessAt,errorCode:complete?null:'ACCOUNT_USAGE_INCOMPLETE'});
 }
 dispose():void{this.#disposed=true;this.#queue=[];this.#values.clear();this.#assetValues.clear();this.#assetDeadlines.clear();this.#redemptions.clear();this.#resets.clear();this.#observations.clear();this.#activeReads.clear();this.#acceptedAt.clear();this.#cachedVersions.clear();this.#dirty.clear();this.#inUse.clear();}
}
