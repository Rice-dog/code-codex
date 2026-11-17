import {icons} from './icons';
import {ensurePluginPackage,isPluginPackageLoaded,pluginExport} from './plugin-runtime';
import {requireConstructor} from './plugin-host/api1';
import type {WorkspaceBridge} from './bridge';
import type {LanRemotePlugin as Runtime} from './lan-remote-runtime';
import {translate} from './i18n';

export function lanRemoteCardMarkup():string {
 return `<article class="preview-extension" data-tool-plugin="code-codex.lan-remote"><span class="preview-extension-icon" aria-hidden="true"></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><div class="accounts-plugin-title"><h4 data-plugin-name>LAN Remote</h4><span class="plugin-beta" data-i18n-key="plugin.beta">Beta</span></div><span class="preview-extension-status lan-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action lan-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger lan-settings" aria-label="LAN Remote settings" aria-haspopup="dialog" aria-controls="cle-lan-remote" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
export function lanRemotePanelMarkup():string {
 return `<section class="particle-settings-panel lan-panel" id="cle-lan-remote" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-lan-title"></section>`;
}
/** Core owns the authenticated port; the optional package owns room UI/behavior. */
export class LanRemotePlugin {
 #runtime:Runtime|undefined;#bridge?:WorkspaceBridge;#disposed=false;
 constructor(private root:ShadowRoot,private notice:(message:string)=>void,private closeOthers:()=>void){root.addEventListener('click',this.#click);}
 connect(bridge:WorkspaceBridge):void {
  this.#bridge=bridge;
  this.#runtime?.resetConnection();
 }
 accept(value:unknown):void {this.#runtime?.accept(value);}
 #click=(event:Event)=>{
  const button=(event.target as Element)?.closest<HTMLButtonElement>('.lan-enable,.lan-settings,.lan-panel button');
  if(!button||button.disabled||this.#disposed)return;
  event.stopImmediatePropagation();
  void this.#act(button).catch(error=>this.notice(String(error)));
 };
 async #act(button:HTMLButtonElement):Promise<void> {
  if(!this.#bridge)throw Error('REMOTE_BRIDGE_UNAVAILABLE: The native connection is unavailable.');
  if(!isPluginPackageLoaded('lan-remote'))await ensurePluginPackage('lan-remote');
  if(this.#disposed)return;
  if(!this.#runtime){
   const Constructor=requireConstructor<typeof Runtime>('lan-remote','LanRemotePlugin',pluginExport('lan-remote','LanRemotePlugin'));
   this.#runtime=new Constructor(this.root,{request:(params:Record<string,unknown>)=>this.#bridge!.request('explorer.lan.request',params)},this.notice);
  }
  if(button.matches('.lan-settings')&&!this.open)this.closeOthers();
  await this.#runtime.action(button);
 }
 get open():boolean{return !!this.root.querySelector('.lan-panel:popover-open');}
 close(restoreFocus=false):void{this.#runtime?.close(restoreFocus);}
 start():void{if(this.#disposed){this.#disposed=false;this.root.addEventListener('click',this.#click);}}
 containsEvent(event:Event):boolean {return event.composedPath().some(node=>node instanceof Element&&(node.matches('.lan-panel,.lan-settings')||!!node.closest('.lan-panel')));}
 render():void{if(this.#runtime)this.#runtime.render();else{const status=this.root.querySelector('.lan-status');if(status)status.textContent=translate('Disabled');}}
 dispose():void {this.#disposed=true;this.root.removeEventListener('click',this.#click);this.#runtime?.dispose();this.#runtime=undefined;}
}
