import {icons} from './icons';
import {requireConstructor} from './plugin-host/api1';
import {ensurePluginPackage,isPluginPackageLoaded,pluginExport} from './plugin-runtime';
import type {MultiAccountPlugin as Runtime} from './multi-account-runtime';
import {runtimeEvent} from './runtime-events';
import {MULTI_ACCOUNT_AVAILABLE} from './core/configuration/optional-features';

export function multiAccountCardMarkup():string {
 // Temporarily suspended; retain bindings and saved data for explicit restoration.
 return `<article class="preview-extension" data-tool-plugin="code-codex.multi-account"${MULTI_ACCOUNT_AVAILABLE?'':' hidden'}><span class="preview-extension-icon" aria-hidden="true">${icons.sliders}</span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4 data-plugin-name>Multi-account Tasks</h4><span class="preview-extension-status accounts-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action accounts-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger accounts-settings-trigger" aria-label="Configure multi-account tasks" aria-haspopup="dialog" aria-controls="cle-accounts-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}
export function multiAccountPanelMarkup():string {
 return `<section class="particle-settings-panel accounts-panel" id="cle-accounts-settings" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-accounts-title"><header class="particle-settings-header"><div class="particle-settings-heading"><h3 id="cle-accounts-title" data-i18n-key="plugin.name.multi-account">Multi-account Tasks</h3><p data-i18n-key="accounts.help">Choose an execution account beside the model selector.</p></div><div class="particle-settings-header-actions"><button type="button" class="particle-settings-close accounts-close" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><label class="particle-control-row accounts-auto-row"><span data-i18n-key="accounts.autoContinue">Continue with the next account when quota runs out</span><input class="accounts-auto-continue" type="checkbox" role="switch" disabled></label><p class="accounts-message" role="status" aria-live="polite"></p><fieldset class="particle-settings-group"><legend data-i18n-key="accounts.connections">Connected accounts</legend><div class="accounts-list"></div></fieldset></div></section>`;
}
export class MultiAccountPlugin {
 #instance?:Runtime;
 #started=false;
 #generation=0;
 #retry?:ReturnType<typeof setTimeout>;
 #attempt=0;
 constructor(private readonly shadow:ShadowRoot,private readonly notice:(message:string)=>void){}
 #loaded=()=>this.attach();
 #connected=()=>{this.#attempt=0;this.#load();};
 #load():void {
  if(!this.#started)return;
  clearTimeout(this.#retry);const generation=++this.#generation,attempt=++this.#attempt;
  void ensurePluginPackage('multi-account').then(()=>{if(this.#started&&generation===this.#generation)this.attach();},error=>{
   if(!this.#started||generation!==this.#generation)return;
   const retryMs=attempt<=5?Math.min(15000,1000*2**(attempt-1)):null;
   runtimeEvent('accounts','account.startup','failed',{stage:'package-load',attempt,retryMs,error:String(error),taskSent:false});
   if(localStorage.getItem('code-codex:multi-account-enabled:v1')!=='true')return;
   this.notice(`ACCOUNT_STARTUP_LOAD: The account plugin could not load. attempt=${attempt}; retryMs=${retryMs??'manual'}. ${String(error)}`);
   if(retryMs!==null)this.#retry=setTimeout(()=>this.#load(),retryMs);
  });
 }
 attach():void {
  if(!MULTI_ACCOUNT_AVAILABLE||!this.#started||!isPluginPackageLoaded('multi-account'))return;
  if(!this.#instance){const C=requireConstructor<typeof Runtime>('multi-account','MultiAccountPlugin',pluginExport('multi-account','MultiAccountPlugin'));this.#instance=new C(this.shadow,this.notice);}
  this.#instance.start();
 }
 start():void{if(!MULTI_ACCOUNT_AVAILABLE||this.#started)return;this.#started=true;window.addEventListener('code-codex:plugin-loaded',this.#loaded);window.addEventListener('code-codex:plugin-connection-ready',this.#connected);this.#load();}
 stop():void{this.#started=false;this.#generation++;clearTimeout(this.#retry);window.removeEventListener('code-codex:plugin-loaded',this.#loaded);window.removeEventListener('code-codex:plugin-connection-ready',this.#connected);this.#instance?.stop();}
 render():void{this.#instance?.render();}
 close():void{this.#instance?.close();}
 containsEvent(event:Event):boolean{return this.#instance?.containsEvent(event)??false;}
}
