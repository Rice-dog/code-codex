/** Diagnostics for browser-owned media/compositor lanes. Registration does not
 * create a polling timer or observe unrelated native application DOM. */
export function registerVisualSession(owner:object,id:string,mode:'compositor'|'native-media',snapshot:()=>Record<string,unknown>):()=>void {
 const root=window as unknown as Record<symbol,Map<object,unknown>>;
 const registry=root[Symbol.for('code-codex:background-isolation:v1')]??=new Map();
 const value={id,mode,get phase(){return document.hidden?'paused':'running';},get presentation(){return snapshot();}};
 registry.set(owner,value);let active=true;
 return ()=>{if(!active)return;active=false;registry.delete(owner);};
}
