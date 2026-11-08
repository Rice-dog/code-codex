import type {NativeAccountAdapter} from './native-adapter';
import {NativeModelMenuPort} from './native-model-menu';

/** Only supplies model data and admission to the existing official picker. */
export class ConnectionModelSelector {
 #catalogSignature='';#anchor:HTMLButtonElement|undefined;#port:NativeModelMenuPort|undefined;#identity='';#epoch=0;
 #ids:string[]=[];#selected='';#syncRequested='';#error='';#abort=new AbortController();#observer:MutationObserver;
 #frame:number|undefined;#initial:{model:string|null;effort?:string|undefined;mode?:string|undefined}|undefined;#conversation:string|null=null;
 constructor(private readonly adapter:NativeAccountAdapter,private readonly notice:(message:string)=>void){
  this.#observer=new MutationObserver(()=>{if(this.#frame===undefined)this.#frame=requestAnimationFrame(()=>{this.#frame=undefined;this.#reconcile();});});
  const options={capture:true,signal:this.#abort.signal};
  document.addEventListener('pointerdown',event=>{if(this.#isTrigger(event)&&this.#error){event.preventDefault();event.stopImmediatePropagation();this.notice(this.#error);}},options);
  document.addEventListener('click',event=>{
   if(this.#isTrigger(event)&&this.#error){event.preventDefault();event.stopImmediatePropagation();this.notice(this.#error);return;}
   const port=this.#port,menu=port?.menu(),row=(event.target as Element)?.closest?.<HTMLElement>('[role=menuitemradio]');
   if(!port||!menu||!row||!menu.contains(row))return;
   const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
   const texts=[row,...row.querySelectorAll('*')].map(e=>normalize(e.textContent??''));const matches=port.models().filter(m=>texts.includes(normalize(m.displayName))||texts.includes(normalize(m.model)));
   const rows=[...menu.querySelectorAll('[role=menuitemradio]')];
   const isDefault=rows.length===this.#ids.length+1&&rows[0]===row;
   const model=matches.length===1?matches[0]!.model:isDefault?this.#selected:undefined;
   if(!model){event.preventDefault();event.stopImmediatePropagation();this.notice('ACCOUNT_NATIVE_MODEL_MENU_UNAVAILABLE: The selected native model could not be matched to the API catalog. stage=row-selection; no model selection was committed.');return;}
   const status=this.adapter.status();if(model===this.#selected&&!status.busy&&!status.preparing&&!isDefault)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(status.busy||status.preparing){this.notice('ACCOUNT_MODEL_BUSY: Finish the current task before changing its model.');return;}
   if(isDefault&&model===this.#selected){try{port.select(model,true);}catch(error){this.notice(String(error));}return;}
   const epoch=this.#epoch,id=status.selected;
   void this.adapter.selectApiModel(id,model).then(()=>{if(epoch!==this.#epoch||this.adapter.status().selected!==id)return;this.#selected=model;this.#syncRequested=model;port.apply(this.#ids,model);port.select(model,true);}).catch(error=>this.notice(String(error)));
  },options);
 }
 #isTrigger(event:Event):boolean{return !!this.#identity&&!!this.#anchor&&event.target instanceof Node&&this.#anchor.contains(event.target);}
 update(anchor:HTMLButtonElement|undefined):void{
  const status=this.adapter.status(),connection=this.adapter.info.connections.find(c=>c.id===status.selected);
  const identity=anchor&&connection?.api?JSON.stringify([connection.id,status.conversationId]):'';
  if(this.#anchor!==anchor||identity!==this.#identity){
   this.#clear(status.conversationId===this.#conversation);this.#anchor=anchor;this.#identity=identity;this.#conversation=status.conversationId;
   if(!anchor||!connection?.api)return;
   this.#selected=connection.api.model;this.#ids=[this.#selected];this.#catalogSignature=JSON.stringify(connection.api.models??null);
   try{const port=this.#port=new NativeModelMenuPort(anchor,this.notice),p=port.picker();this.#initial={model:p.model,effort:p.reasoningEffort,mode:p.selectionMode};port.apply(this.#ids,this.#selected);this.#observer.observe(anchor,{subtree:true,childList:true,characterData:true});}
   catch(error){this.#error=String(error);this.notice(this.#error);return;}
   this.#loadCatalog(connection.id);
  }
  if(connection?.api&&this.#port&&JSON.stringify(connection.api.models??null)!==this.#catalogSignature){
   this.#catalogSignature=JSON.stringify(connection.api.models??null);this.#epoch++;
   if(connection.api.models){this.#ids=[...connection.api.models];this.#selected=connection.api.model;this.#syncRequested='';this.#port.apply(this.#ids,this.#selected);}else this.#loadCatalog(connection.id);
  }
  if(connection?.api&&this.#port&&connection.api.model!==this.#selected){this.#selected=connection.api.model;this.#syncRequested='';this.#port.apply(this.#ids.includes(this.#selected)?this.#ids:[this.#selected],this.#selected);}
  this.#sync();
 }
 #loadCatalog(id:string):void{
  const epoch=this.#epoch;void this.adapter.apiModels(id).then(result=>{if(epoch!==this.#epoch||!this.#port)return;this.#ids=result.models;this.#selected=result.selected;this.#port.apply(this.#ids,this.#selected);if(result.warning)this.notice(result.warning);this.#sync();}).catch(error=>{if(epoch===this.#epoch)this.notice(String(error));});
 }
 #sync():void{
  const status=this.adapter.status();if(!this.#port||status.busy||status.preparing||this.#syncRequested===this.#selected)return;
  try{this.#syncRequested=this.#selected;if(this.#port.picker().model!==this.#selected)this.#port.select(this.#selected);}catch(error){this.notice(String(error));}
 }
 #reconcile():void{
  const port=this.#port,status=this.adapter.status();if(!port||status.busy||status.preparing||!this.#syncRequested)return;
  try{const model=port.picker().model;if(!model||model===this.#selected||!this.#ids.includes(model))return;
   const epoch=this.#epoch;void this.adapter.selectApiModel(status.selected,model).then(()=>{if(epoch!==this.#epoch)return;this.#selected=model;this.#syncRequested=model;port.apply(this.#ids,model);},error=>{if(epoch!==this.#epoch)return;port.select(this.#selected);this.notice(String(error));});
  }catch(error){this.notice(String(error));}
 }
 #clear(restore:boolean):void{
  this.#epoch++;this.#observer.disconnect();if(this.#frame!==undefined)cancelAnimationFrame(this.#frame);this.#frame=undefined;
  const port=this.#port;this.#port=undefined;
  if(port){port.close();let current;try{current=port.picker();}catch{}port.dispose();
   if(restore&&this.#initial&&current?.model===this.#syncRequested&&!this.adapter.status().busy){try{if(this.#initial.mode==='default'&&current.onSelectDefault)current.onSelectDefault();else if(this.#initial.model)current.onSelectModel(this.#initial.model,this.#initial.effort);}catch{}}
  }
  this.#initial=undefined;this.#syncRequested='';this.#error='';
 }
 dispose():void{this.#clear(true);this.#abort.abort();this.#identity='';this.#anchor=undefined;}
}
