import {nativeFiberChain} from './native-model-menu';
import type {NativeAccountAdapter} from './native-adapter';
import {runtimeEvent} from '../../runtime-events';
import {NativeUsageBanner} from './native-usage-banner';

type Native=Record<string,any>;
type Gate='hardBlocked'|'reserve'|'resetPending'|'usageStatus';
type GateValue=boolean|string;
type Capabilities={gates:Array<{ref:Native;gate:Gate}>;refreshNames:Set<string>};
type Lease={snapshot:Native;original:()=>GateValue;wrapped:()=>GateValue;gate:Gate;fiber:Native};
const unavailable=(stage:string)=>Error(`ACCOUNT_NATIVE_QUOTA_UNAVAILABLE: The native composer quota contract could not be verified. stage=${stage}; no message was sent.`);
const families=(value:any):value is Native=>value&&typeof value==='object'&&value.kind==='readable-family'&&typeof value.resolve==='function'&&value.scope;

function quotaGates(source:string,exports:Native):Capabilities['gates']|undefined {
 const compact=source.replace(/\s+/g,''),declaration=compact.slice(compact.lastIndexOf('.d('));
 const gates:Capabilities['gates']=[];
 for(const [property,gate] of [['hardBlocked','hardBlocked'],['active','reserve']] as const){
  const pattern=new RegExp('([$\\w]+)=\\(0,[$\\w]+\\.[$\\w]+\\)\\([^,]+,\\(([$\\w]+),\\{get:([$\\w]+)\\}\\)=>\\3\\([$\\w]+,\\2\\)\\.'+property+'\\)','g');
  const variables=[...compact.matchAll(pattern)];
  if(variables.length!==1)return undefined;
  const variable=variables[0]![1]!.replace(/\$/g,'\\$');
  const names=[...declaration.matchAll(new RegExp('[,{]([$\\w]+):(?:\\(\\)=>)?'+variable+'(?=[,}])','g'))];
  if(names.length!==1)return undefined;
  const ref=exports[names[0]![1]!];
  if(!families(ref))return undefined;
  gates.push({ref,gate});
 }
 return gates[0]!.ref!==gates[1]!.ref?gates:undefined;
}

/** Discover initialized semantic roles, never invoke an unknown module factory. */
export async function capabilities(address:string):Promise<Capabilities>{
 const path=address.split('#')[0]!;
 if(!/^\.\/assets\/[0-9]+\.[A-Za-z0-9_-]+\.js$/.test(path))throw unavailable('runtime-path');
 const namespace=await import(/* @vite-ignore */path);
 const runtimes=Object.values(namespace).filter((v:any)=>typeof v==='function'&&v.c&&v.m&&v.e&&v.C) as Native[];
 if(runtimes.length!==1)throw unavailable('runtime');
 const runtime=runtimes[0]!,ids=Object.keys(runtime.c);if(ids.length>32768)throw unavailable('module-budget');
 const quota:Native[]=[],reset:Native[]=[],refreshNames=new Set<string>();let bytes=0;
 for(const id of ids){
  const entry=Object.getOwnPropertyDescriptor(runtime.c,id)?.value,factory=Object.getOwnPropertyDescriptor(runtime.m,id)?.value;
  if(!entry?.exports||entry.error||typeof factory!=='function')continue;
  const source=String(factory);bytes+=source.length;if(bytes>64*1024*1024)throw unavailable('source-budget');
  if(source.includes('hardBlocked')&&source.includes('luna_reserve')&&source.includes('rate_limit_upsell'))quota.push({source,exports:entry.exports});
  if(source.includes('authenticatedAccountId')&&source.includes('authLoading')&&source.includes('rate_limit?.allowed')&&source.includes('.windowMinutes===')&&source.includes('.resetsAt==='))reset.push({source,exports:entry.exports});
  // This React effect only updates a useSyncExternalStore snapshot and asks
  // React to re-render if it changed. It neither subscribes nor sends work.
  const compact=source.replace(/\s+/g,'');
  for(const match of compact.matchAll(/function([$\w]+)\(([$\w]+),([$\w]+),([$\w]+),([$\w]+)\)\{\3\.value=\4,\3\.getSnapshot=\5,[$\w]+\(\3\)&&[$\w]+\(\2\)\}/g))refreshNames.add('bound '+match[1]);
 }
 if(!quota.length||reset.length!==1||!refreshNames.size)throw unavailable('semantic-roles');
 const candidates=quota.map(module=>quotaGates(module.source,module.exports)).filter(gates=>gates!==undefined);
 if(candidates.length!==1)throw unavailable(candidates.length?'quota-family-ambiguous':'quota-family');
 const gates=candidates[0]!;
 const refs=Object.values(reset[0]!.exports).filter((v:any)=>v&&typeof v==='object'&&v.cache==='cached'&&typeof v.resolve==='function'&&v.scope) as Native[];
 if(refs.length!==1)throw unavailable('reset-reference');gates.push({ref:refs[0]!,gate:'resetPending'});
 const {source:resetSource,exports:resetExports}=reset[0]!;
 if (/["']reserve-limit["']/.test(resetSource)&&/["']usage-limit["']/.test(resetSource)&&/\.filter\(Boolean\)\.join\(["'],["']\)/.test(resetSource)) {
  const familiesInStatusModule=[...new Set(Object.values(resetExports).filter(families))];
  if(familiesInStatusModule.length===1)gates.push({ref:familiesInStatusModule[0]!,gate:'usageStatus'});
 }

 return {gates,refreshNames};
}

const usageStatus=(value:unknown):boolean=>typeof value==='string'&&
  (value===''||value==='reserve-limit'||value==='usage-limit'||value==='reserve-limit,usage-limit');

export function composerQuotaSubscriptions(anchor:HTMLButtonElement,cap:Capabilities,expectedConversation?:string|null) {
  const chain=nativeFiberChain(anchor),root=anchor.closest('[data-codex-composer-root]');if(!root)throw unavailable('composer-root');
  // Home omits this optional prop; the native composer defaults it to false.
  const candidates=chain.filter(f=>typeof f.type==='function'&&f.memoizedProps&&(f.memoizedProps.isResponseInProgress===undefined||typeof f.memoizedProps.isResponseInProgress==='boolean')&&(f.memoizedProps.submitDisabled===undefined||typeof f.memoizedProps.submitDisabled==='boolean')&&String(f.type).includes('handleSubmitLocal'));
  if(candidates.length!==1)throw unavailable('composer-owner');const fiber=candidates[0]!;
  const contexts:Map<any,Native>[]=[];for(let c=fiber.dependencies?.firstContext,i=0;c&&i<64;c=c.next,i++)if(c.memoizedValue instanceof Map)contexts.push(c.memoizedValue);

  // Native home ComposerScope has entrypoint="home" and no placement. Local
  // conversation scopes use placement="main"; panels/previews are not home.
  const composers=[...new Set(contexts.flatMap(c=>[...c.values()]).filter(n=>n?.value&&(n.value.kind==='local'&&n.value.placement==='main'||n.value.kind==='new'&&(n.value.entrypoint==='home'||n.value.entrypoint===undefined&&n.value.placement==='main'))))];
  if(composers.length!==1||(expectedConversation!==undefined&&(composers[0]!.value.conversationId??null)!==expectedConversation))throw unavailable('composer-identity');
  const conversation=composers[0]!.value.conversationId??null;
  const hooks:Native[]=[];for(let h=fiber.memoizedState,i=0;h&&i<2048;h=h.next,i++)hooks.push(h);
  if(hooks.length===2048)throw unavailable('hook-budget');
  const targets=cap.gates.map(({ref,gate})=>{
   const nodes=[...new Set(contexts.map(c=>c.get(ref.scope.id)).filter(Boolean))];if(nodes.length!==1)throw unavailable('scope');
   const node=nodes[0]!,context=contexts.find(c=>c.get(ref.scope.id)===node)!;
   const member=families(ref)?ref.resolve(node,context,'local'):ref;
   const atom=member.resolve(node,context);const value=node.store?.get(atom);
   if(gate==='usageStatus'?!usageStatus(value):typeof value!=='boolean')throw unavailable('gate-type');
   return {atom,gate};
  });
  const found: Array<{snapshot:Native;gate:Gate}> = [];
  for(const h of hooks) {
   const memo=h.memoizedState,snapshot=Array.isArray(memo)?memo[0]:undefined,deps=Array.isArray(memo)?memo[1]:undefined;
   if(!snapshot||typeof snapshot.getSnapshot!=='function'||typeof snapshot.subscribe!=='function'||typeof snapshot.prepare!=='function'||!Array.isArray(deps))continue;
   const value=snapshot.getSnapshot();
   if(typeof value!=='boolean'&&!usageStatus(value))continue;
   const compatible=targets.filter(t=>t.gate==='usageStatus'?typeof value==='string':typeof value==='boolean');
   const reads=new Set(deps);
   const holder=deps[1]===undefined&&(deps.length===2||deps.length===3&&typeof deps[2]==='boolean')?deps[0]:undefined;
   const atom=holder?.atom??deps[1],store=holder?.store??deps[0];
   if(atom&&typeof store?.get==='function'){
    reads.add(atom);
    if(typeof atom.read==='function'&&!compatible.some(t=>t.atom===atom)){
     atom.read((dependency:Native)=>{reads.add(dependency);return store.get(dependency);});
    }
   }
   const matching=compatible.filter(t=>reads.has(t.atom));
   if(matching.length!==1)continue;
   if(snapshot.createRender?.()!==undefined)throw unavailable('snapshot');
   found.push({snapshot,gate:matching[0]!.gate});
  }
  const count=(gate:Gate)=>found.filter(item=>item.gate===gate).length;
  const combined=found.length===2&&count('reserve')===1&&count('usageStatus')===1;
  const separate=found.length===3&&count('reserve')===1&&count('hardBlocked')===1&&count('resetPending')===1;
  if(!combined&&!separate)throw unavailable('unique-subscriptions');
  return {root,conversation,fiber,found};
}

/** Project quota only at the mounted composer's existing native subscriptions.
 * Never replace an auth/usage cache, a shared atom, a permission gate or a button.
 */
export class NativeComposerQuota {
 #cap:Capabilities|undefined;#loading:Promise<void>|undefined;#error='';#disposed=false;
 #leases=new Map<Native,Lease>();#banners:NativeUsageBanner;
 #anchor:HTMLButtonElement|undefined;#identity='';#refreshQueued=false;#root:Element|undefined;#conversation:string|null|undefined;#owner:string;
 constructor(private readonly adapter:NativeAccountAdapter,private readonly changed:()=>void){this.#owner=adapter.info.owner.id;this.#banners=new NativeUsageBanner(this.#owner,()=>!this.#disposed&&adapter.info.owner.id===this.#owner&&adapter.status().active);}
 diagnostics():{ready:boolean;scoped:boolean;error:string|null;subscriptions:number;hiddenHostBanners:number;gates:Array<{gate:Gate;native:GateValue;projected:GateValue}>}{return {ready:this.#leases.size>0,scoped:!!this.#selection(),error:this.#error||null,subscriptions:this.#leases.size,hiddenHostBanners:this.#banners.hiddenCount,gates:[...this.#leases.values()].map(l=>({gate:l.gate,native:l.original(),projected:l.snapshot.getSnapshot()}))};}
 observes(node:Element):boolean{
  return this.#banners.observes(node);
 }
 #selection():{id:string;blocked:boolean}|undefined{
  const status=this.adapter.status(),info=this.adapter.info;
  const id=status.busy?status.executionSelected??status.selected:status.selected;
  if(info.owner.id!==this.#owner||!status.active||!status.supported||status.sendBlocked||id==='host')return;
  const connection=info.connections.find(c=>c.id===id);
  if(!connection||!connection.api&&!connection.email||connection.reauthorizationRequired)return;
  // A deferred choice can update the idle composer's quota preview. Actual
  // delivery still requires the prepared, authenticated route.
  if(status.conversationId&&info.nativeRoutes?.[status.conversationId]!==id&&!(status.deferredSelection&&!status.busy))return;
  const q=this.adapter.usage.remaining(id);
  return {id,blocked:!connection.api&&!this.adapter.usage.creditAllowed(id)&&(q.fiveHour===0||q.weekly===0)};
 }
 #projecting():boolean{return !!this.#root?.isConnected&&this.adapter.status().conversationId===this.#conversation&&!this.#root.closest('[data-app-shell-active-page="false"],[aria-hidden="true"]')&&!!this.#selection();}
 update(anchor:HTMLButtonElement|undefined):void{
  if(this.#disposed)return;this.#anchor=anchor;
  this.#banners.update(anchor,this.adapter.status().conversationId,!!this.#selection());
  if(!this.#selection()||!anchor){this.#restore();return;}
  if(!this.#cap){
   if(!this.#loading&&!this.#error)this.#loading=capabilities(this.adapter.info.profile.initial).then(cap=>{if(!this.#disposed){this.#cap=cap;this.changed();}},error=>{this.#error=String(error);runtimeEvent('accounts','account.quota-adapter','unavailable',{stage:'native-quota-capability',taskSent:false});});
   return;
  }
  try{this.#bind(anchor);}catch(error){this.#error=String(error);this.#restore();}
 }
  async ready(required:boolean):Promise<boolean>{
   if(!this.#selection())return false;
  await this.#loading;if(this.#anchor)this.update(this.#anchor);
   if(this.#error){if(required)throw Error(this.#error);return false;}
   if(!this.#leases.size){if(required)throw unavailable('composer-subscriptions');return false;}
  const selection=this.#selection();if(selection?.blocked)throw Error('ACCOUNT_SELECTED_QUOTA_EXHAUSTED: The selected account has no included usage remaining. Select another account or explicitly permit its available credits. No message was sent.');
  // React owns the actual recomputation and every other submitDisabled operand.
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   return true;
 }
 #bind(anchor:HTMLButtonElement):void{
  const {root,conversation,fiber,found}=composerQuotaSubscriptions(anchor,this.#cap!,this.adapter.status().conversationId);
  if(this.#root!==root||this.#conversation!==conversation)this.#restore();
  this.#root=root;this.#conversation=conversation;
  const current=new Set(found.map(x=>x.snapshot));
  for(const [snapshot,lease]of this.#leases)if(!current.has(snapshot)){this.#release(lease);this.#leases.delete(snapshot);}
  let added=false;
  for(const {snapshot,gate}of found)if(!this.#leases.has(snapshot)){
   const descriptor=Object.getOwnPropertyDescriptor(snapshot,'getSnapshot');if(!descriptor?.writable)throw unavailable('snapshot-ownership');
   // A routed child's quota/credit admission belongs to prepareSend/ready.
   // Keep the native submit action reachable so automatic traversal can run
   // before an exhausted selected account is rejected. No quota is invented.
   const original=snapshot.getSnapshot as ()=>GateValue;
   const wrapped=()=> {
    if(!this.#projecting())return original();
    if(gate!=='usageStatus')return false;
    const value=original();
    return usageStatus(value)?'':value;
   };
   const lease:Lease={snapshot,original,wrapped,gate,fiber};
   snapshot.getSnapshot=lease.wrapped;this.#leases.set(snapshot,lease);added=true;
  }else this.#leases.get(snapshot)!.fiber=fiber;
  const selection=this.#selection(),identity=selection?.id+':'+selection?.blocked;
  this.#error='';if(added||identity!==this.#identity){this.#identity=identity;this.#refresh();runtimeEvent('accounts','account.quota-adapter','bound',{stage:'native-composer-quota',subscriptions:found.length,combinedStatus:found.some(item=>item.gate==='usageStatus'),hostUsageCacheChanged:false,taskSent:false});}
 }
 #refresh():void{
  if(this.#refreshQueued)return;this.#refreshQueued=true;
  queueMicrotask(()=>{this.#refreshQueued=false;if(this.#disposed)return;
   try{for(const lease of this.#leases.values())this.#notify(lease);}catch(error){this.#error=String(error);this.#restore();runtimeEvent('accounts','account.quota-adapter','unavailable',{stage:'native-quota-refresh',taskSent:false});}
  });
 }
 #notify(lease:Lease):void{
  // Locate the effect by the exact owned subscription, then qualify the
  // adjacent snapshot-only React effect against its initialized factory.
  const fiber=this.#anchor?.isConnected?nativeFiberChain(this.#anchor).find(f=>f===lease.fiber||f===lease.fiber.alternate):undefined;
  if(!fiber)return;
  const last=fiber.updateQueue?.lastEffect;let effect=last?.next;
  for(let i=0;effect&&i<2048;i++,effect=effect.next){
   if(effect.deps?.length===1&&effect.deps[0]===lease.snapshot.subscribe){
    const update=effect.next;if(update?.deps==null&&this.#cap!.refreshNames.has(update.create?.name)){update.create();return;}
    throw unavailable('snapshot-refresh');
   }
   if(effect===last)break;
  }
  throw unavailable('subscription-effect');
 }
 #release(lease:Lease):void{if(lease.snapshot.getSnapshot===lease.wrapped){lease.snapshot.getSnapshot=lease.original;try{this.#notify(lease);}catch{}}}
 #restore():void{for(const lease of this.#leases.values())this.#release(lease);this.#leases.clear();this.#identity='';this.#root=undefined;this.#conversation=undefined;}
 dispose():void{this.#banners.dispose();this.#restore();this.#disposed=true;this.#anchor=undefined;}
}
