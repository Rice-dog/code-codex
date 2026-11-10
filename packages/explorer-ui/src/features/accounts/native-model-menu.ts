/** Adapt the mounted official model observer. No menu elements or CSS are created. */
type Model=Record<string,any>&{model:string;id:string;supportedReasoningEfforts:any[]};
type Picker={models:Model[];model:string|null;reasoningEffort?:string;selectionMode?:string;onSelectModel:(model:string,effort?:string)=>void;onSelectDefault?:()=>void;onSelectModelOption?:()=>void;onSelectComplete?:()=>void;onOpenChange:(open:boolean)=>void};
const unavailable=(stage:string)=>Error(`ACCOUNT_NATIVE_MODEL_MENU_UNAVAILABLE: The official model menu data contract could not be verified. stage=${stage}; no model selection was committed.`);
export function nativeFiberChain(anchor:HTMLElement):any[]{
 const key=Object.keys(anchor).find(k=>k.startsWith('__reactFiber$'));if(!key)throw unavailable('react-anchor');
 let f=(anchor as any)[key];const path:any[]=[];
 for(let i=0;f&&i<512;i++,f=f.return)path.push(f);if(f)throw unavailable('react-depth');
 let current=path.at(-1)?.stateNode?.current;if(!current)throw unavailable('react-root');
 const mounted=[current];
 for(let i=path.length-2;i>=0;i--){const wanted=path[i];let child=current.child,found;
  for(let n=0;child&&n<512;n++,child=child.sibling)if(child===wanted||child===wanted.alternate){found=child;break;}
  if(!found)throw unavailable('react-unmounted');current=found;mounted.push(current);
 }
 return mounted.reverse();
}
export function pickerOf(chain:any[],ids?:string[]):Picker{
 const matches=chain.map(f=>f.memoizedProps).filter(p=>Array.isArray(p?.models)&&Array.isArray(p.modelOptions)&&typeof p.onSelectModel==='function'&&typeof p.onOpenChange==='function');
 const exact=ids?matches.filter(p=>p.models.length===ids.length&&p.models.every((m:Model,i:number)=>m.model===ids[i])):matches;
 if(!matches.length)throw unavailable('picker-contract');return exact[0]??matches[0];
}
export class NativeModelMenuPort {
 #query:any;#client:any;#release:()=>void;#original:any;#projected:any;#updatedAt:number;
 #leases=new Map<any,{set:any;optimistic:any;restoreSet:any;restoreOptimistic:any;wrap:(fn:any)=>any}>();
 #ids:string[]=[];#selected='';#catalog=new Map<string,Model>();#active=true;#writing=false;#refreshPending=false;
 constructor(private readonly anchor:HTMLButtonElement,private readonly notice:(error:string)=>void=()=>{}){
  const chain=nativeFiberChain(anchor),picker=pickerOf(chain),clients=new Set<any>();
  for(const f of chain){let c=f.dependencies?.firstContext;for(let i=0;c&&i<32;i++,c=c.next){const value=c.memoizedValue;try{const client=value?.queryClient??value;if(typeof client?.getQueryCache==='function'&&typeof client?.setQueryData==='function')clients.add(client);}catch{}}}
  const candidates:any[]=[];
  for(const client of clients){const cache=client.getQueryCache();if(typeof cache?.getAll!=='function'||typeof cache.subscribe!=='function')continue;
   const all=cache.getAll();if(!Array.isArray(all)||all.length>4096)throw unavailable('query-budget');
   for(const q of all.filter((q:any)=>Array.isArray(q.queryKey)&&q.queryKey[0]==='models'&&q.queryKey[1]==='list')){
    if(!Array.isArray(q.observers)||q.observers.length>64||!Array.isArray(q.state?.data?.data))continue;
    if(q.observers.some((o:any)=>{const models=o.getCurrentResult?.().data?.models;return Array.isArray(models)&&models.length>0&&models.every((m:any)=>picker.models.some(p=>p.model===m.model));}))candidates.push({q,cache,client});
   }
  }
  if(candidates.length!==1)throw unavailable('query-selection');
  if(candidates[0].q.observers.some((o:any)=>typeof o.setOptions!=='function'||typeof o.getOptimisticResult!=='function'||typeof o.options?.select!=='function'))throw unavailable('observer-contract');
  this.#query=candidates[0].q;this.#client=candidates[0].client;this.#original=this.#query.state.data;this.#updatedAt=this.#query.state.dataUpdatedAt;
  this.#release=candidates[0].cache.subscribe((event:any)=>{
   if(!this.#active||this.#writing||event.query!==this.#query||!['updated','observerAdded','observerOptionsUpdated'].includes(event.type))return;
   if(event.type!=='updated'){try{this.#leaseObservers();}catch(error){this.notice(String(error));}return;}
   if(this.#query.state.data===this.#projected)return;
   const data=this.#query.state.data;if(!Array.isArray(data?.data))return;
   if(data.data.length===this.#ids.length&&data.data.every((m:any,i:number)=>m.model===this.#ids[i])){this.#projected=data;return;}
   this.#original=data;this.#updatedAt=this.#query.state.dataUpdatedAt;
   if(!this.#refreshPending){this.#refreshPending=true;queueMicrotask(()=>{this.#refreshPending=false;if(this.#active&&this.#query.state.data!==this.#projected){try{this.apply(this.#ids,this.#selected);}catch(error){this.notice(String(error));}}});}
  });
 }
 #leaseObservers():void{
  for(const observer of this.#query.observers){
   if(this.#leases.has(observer))continue;
   if(typeof observer.setOptions!=='function'||typeof observer.getOptimisticResult!=='function')throw unavailable('observer-contract');
   const wrappers=new WeakMap<Function,Function>(),originals=new WeakMap<Function,Function>();
   const wrap=(fn:any):any=>{
    if(typeof fn!=='function')throw unavailable('observer-select');
    if(originals.has(fn))return fn;const existing=wrappers.get(fn);if(existing)return existing;
    const wrapped=(raw:any)=>{const result=fn(raw);if(!this.#active)return result;
     if(!Array.isArray(result?.models))throw unavailable('observer-result');
     const models=this.models().map(m=>{const transformed=result.models.find((x:Model)=>x.model===m.model);return transformed?{...m,supportedReasoningEfforts:transformed.supportedReasoningEfforts}:m;});
     return{...result,models,defaultModel:models.find(m=>m.model===this.#selected)??models[0],hasModelSupportingMaxReasoningEffort:models.some(m=>m.supportedReasoningEfforts.some((e:any)=>e.reasoningEffort==='max')),hasModelSupportingUltraReasoningEffort:models.some(m=>m.supportedReasoningEfforts.some((e:any)=>e.reasoningEffort==='ultra'))};
    };
    wrappers.set(fn,wrapped);originals.set(wrapped,fn);return wrapped;
   };
   const set=observer.setOptions,optimistic=observer.getOptimisticResult;
   const setWrapped=(options:any,...rest:any[])=>set.call(observer,{...options,select:wrap(options.select)},...rest);
   const optimisticWrapped=(options:any,...rest:any[])=>optimistic.call(observer,{...options,select:wrap(options.select)},...rest);
   this.#leases.set(observer,{set:setWrapped,optimistic:optimisticWrapped,restoreSet:set,restoreOptimistic:optimistic,wrap:fn=>originals.get(fn)??fn});
   observer.setOptions=setWrapped;observer.getOptimisticResult=optimisticWrapped;
   setWrapped(observer.options);
  }
 }
 picker():Picker{return pickerOf(nativeFiberChain(this.anchor),this.#ids);}
 models():Model[]{return this.#ids.map(id=>this.#catalog.get(id)!);}
 menu():HTMLElement|null{const id=this.anchor.getAttribute('aria-controls');return id?document.getElementById(id):null;}
 close():void{try{this.picker().onOpenChange(false);}catch{}}
 apply(ids:string[],selected:string):void{
  if(!ids.length||ids.length>256||new Set(ids).size!==ids.length||!ids.includes(selected)||ids.some(id=>typeof id!=='string'||!id.trim()))throw unavailable('catalog-contract');
  this.#ids=[...ids];this.#selected=selected;
  this.#catalog=new Map(ids.map(id=>{const known=this.#original.data.find((m:any)=>m.model===id);return[id,{...(known??{}),id,model:id,displayName:known?.displayName??id,description:known?.description??'',hidden:false,isDefault:id===selected,upgrade:null,upgradeInfo:null,availabilityNux:null,availableAccessPrograms:{cyber:[]},modelSpecialty:known?.modelSpecialty??null,supportsPersonality:known?.supportsPersonality??false,multiAgentVersion:known?.multiAgentVersion??null,supportedReasoningEfforts:known?.supportedReasoningEfforts??[],defaultReasoningEffort:known?.defaultReasoningEffort??'medium',inputModalities:known?.inputModalities??['text'],serviceTiers:[],additionalSpeedTiers:[],defaultServiceTier:null} as Model];}));
  this.#writing=true;try{this.#leaseObservers();this.#client.setQueryData(this.#query.queryKey,{...this.#original,data:this.models(),nextCursor:null},{updatedAt:this.#updatedAt});this.#projected=this.#query.state.data;}finally{this.#writing=false;}
 }
 select(model:string,complete=false,requestedEffort?:string):void{
  const p=this.picker(),info=this.#catalog.get(model);if(!info)throw unavailable('selection-outside-catalog');
  const effort=requestedEffort??(info.supportedReasoningEfforts.some((e:any)=>e.reasoningEffort===p.reasoningEffort)?p.reasoningEffort:info.supportedReasoningEfforts.length?info.defaultReasoningEffort:undefined);
  p.onSelectModel(model,effort);if(complete){p.onSelectModelOption?.();p.onSelectComplete?.();p.onOpenChange(false);}
 }
 dispose():void{
  this.#active=false;this.#release();
  for(const [observer,lease]of this.#leases){
   if(observer.setOptions===lease.set)observer.setOptions=lease.restoreSet;
   if(observer.getOptimisticResult===lease.optimistic)observer.getOptimisticResult=lease.restoreOptimistic;
   if(observer.options?.select)observer.setOptions({...observer.options,select:lease.wrap(observer.options.select)});
  }
  this.#leases.clear();
  if(this.#query.state.data===this.#projected)this.#client.setQueryData(this.#query.queryKey,this.#original,{updatedAt:this.#updatedAt});
 }
}
