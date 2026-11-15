export type Services={appUpdates:Record<string,unknown>};
export function wrapOfficialUpdateService(service:Services,prepare:()=>Promise<unknown>):()=>void {
    const original=service.appUpdates;
    const install=original.installUpdate as (...args:unknown[])=>unknown;
    let pending:Promise<unknown>|undefined;
    let disposed=false;
    const wrapped=new Proxy(original,{get(target,property,receiver){
        if(property!=='installUpdate')return Reflect.get(target,property,receiver);
        return async(...args:unknown[])=>{await(pending??=prepare().catch(error=>{pending=undefined;throw error;}));if(disposed)throw new Error('CC-OFFICIAL-UPDATE-003: The update entry was replaced before preparation completed.');return Reflect.apply(install,original,args);};
    }});
    service.appUpdates=wrapped;
    if(service.appUpdates!==wrapped)throw new Error('CC-OFFICIAL-UPDATE-002: The official update service cannot be wrapped.');
    return ()=>{disposed=true;if(service.appUpdates===wrapped)service.appUpdates=original;};
}
