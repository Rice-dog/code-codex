// Keep the official creation request and callbacks. Only its transport changes.
type Native=Record<string,any>;
export interface DraftRoute {token:string;config:Native;model?:string;}
export interface DraftPorts {
 selection(params:Native):string|undefined;
 prepare(selected:string,params:Native):Promise<DraftRoute>;
 commit(route:DraftRoute,id:string,selected:string):Promise<void>;
 cancel(route:DraftRoute):Promise<void>;
 validateFirstTurn?(id:string,selected:string):void;
 settled():void;
}
export function wrapDraftManager(manager:Native,ports:DraftPorts):Native {
 return new Proxy(manager,{get(target,key){
  if(key!=='startConversation')return Reflect.get(target,key,target);
  return async(params:Native,options:Native={})=>{
   const selected=ports.selection(params);
   if(!selected)return target.startConversation(params,options);
   let route:DraftRoute|undefined,committed=false,created:string|undefined;
   try{
    route=await ports.prepare(selected,params);
    const prepared=route,config={...params.config,...route.config,
     features:{...params.config?.features,...route.config.features},
     model_providers:{...params.config?.model_providers,...route.config.model_providers}};
    const request={...params,config,...route.model&&params.collaborationMode?{collaborationMode:{...params.collaborationMode,settings:{...params.collaborationMode.settings,model:route.model}}}:{}};
    return await target.startConversation(request,{...options,
     afterConversationCreated:async(id:string,...rest:any[])=>{
      if(created)throw Error('ACCOUNT_DRAFT_DUPLICATE: The creation callback was repeated. No first turn was permitted.');
      created=id;
      await ports.commit(prepared,id,selected);committed=true;
      await options.afterConversationCreated?.(id,...rest);
     },
     beforeFirstTurn:async(...args:any[])=>{
      if(!committed)throw Error('ACCOUNT_DRAFT_NOT_COMMITTED: The selected account was not confirmed. No first turn was permitted.');
      ports.validateFirstTurn?.(created!,selected);
      await options.beforeFirstTurn?.(...args);
     }});
   }finally{if(route&&!committed)await ports.cancel(route).catch(()=>{});ports.settled();}
  };
 }});
}
/** Discover the renderer's existing RPC registry without owning or disposing it. */
export async function installDraftRouting(initial:Native,shared:Native,paths:string[]|undefined,load:(path:string)=>Promise<Native>,ports:DraftPorts):Promise<()=>void>{
 const getters=[...new Set(Object.values(initial).filter(v=>typeof v==='function'&&/AppServerManager RPC is unavailable for hostId:/.test(Function.prototype.toString.call(v))&&/\.forHost\(/.test(Function.prototype.toString.call(v))))] as Function[];
 const services=[...new Set(Object.values(shared).filter(v=>{if(!v||typeof v!=='object')return false;const d=Object.getOwnPropertyDescriptors(v);return d.appServerManagers?.value&&d.executionHosts?.value&&d.clientCoordination?.value&&d.appActions?.value;}))];
 if(getters.length!==1||services.length!==1||!paths?.length||paths.length>4||paths.some(p=>!/^\.\/assets\/(?:register-app-actions-[A-Za-z0-9_-]+\.js|[0-9]+\.[A-Za-z0-9_-]+\.js#cc-host=actions)$/.test(p)))throw Error('ACCOUNT_DRAFT_CAPABILITY_UNAVAILABLE: The native creation registry could not be qualified. Existing conversations remain available.');
 // New official runtimes initialize their action registry lazily. A read-only
 // official action loads it through the host's own lifecycle; no factory is forced.
 if(paths.some(p=>p.endsWith('#cc-host=actions')))await services[0]!.appActions.runInPrimaryWindow({action:{type:'app.appearance.get'}});
 const registries=[];
 for(const path of new Set(paths)){const value=(await load(path)).appActionRegistry;if(value&&typeof value.get==='function'&&typeof value.set==='function'&&typeof value.delete==='function')registries.push(value);}
 if(new Set(registries).size!==1)throw Error('ACCOUNT_DRAFT_REGISTRY_AMBIGUOUS: A unique native action registry is required.');
 const actions=registries[0],key='code-codex.internal.draft.'+crypto.randomUUID();let dispose:(()=>void)|undefined;
 actions.set(key,(_action:Native,{scope}:Native)=>{
  const found=new Set<Native>();
  getters[0]!(new Proxy(scope,{get(target,name){if(name==='get')return(...args:any[])=>{const value=target.get(...args);if(value&&typeof value.forHost==='function')found.add(value);return value;};const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;}}),'local');
  if(found.size!==1)throw Error('ACCOUNT_DRAFT_MANAGER_AMBIGUOUS: A unique renderer manager registry is required.');
  const registry=[...found][0]!,original=registry.forHost,descriptor=Object.getOwnPropertyDescriptor(registry,'forHost');
  if(!descriptor?.writable)throw Error('ACCOUNT_DRAFT_MANAGER_IMMUTABLE: The renderer creation registry cannot be safely adapted.');
  const cache=new WeakMap<object,Native>();let active=true;
  const wrapper=function(this:Native,...args:any[]){const manager=original.apply(this,args);if(!active||args[0]!=='local')return manager;let wrapped=cache.get(manager);if(!wrapped){wrapped=wrapDraftManager(manager,ports);cache.set(manager,wrapped);}return wrapped;};
  registry.forHost=wrapper;
  dispose=()=>{active=false;if(registry.forHost===wrapper)registry.forHost=original;};
  return true;
 });
 try{await services[0]!.appActions.runInPrimaryWindow({action:{type:key}});if(!dispose)throw Error('ACCOUNT_DRAFT_MANAGER_UNAVAILABLE: The primary renderer did not qualify creation admission.');return dispose;}
 catch(error){dispose?.();throw error;}
 finally{actions.delete(key);}
}
