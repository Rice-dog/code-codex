import {pluginDownloadMessage} from './plugin-download-message';
import {translate,t} from './i18n';
import {pluginDisplayName} from './core/localization/plugin-names';
import type { WorkspaceBridge } from './contracts/bridge';
import { PLUGIN_PACKAGES, isPluginPackageLoaded } from './plugin-runtime';
import { ensurePluginPackage } from './plugin-load-diagnostics';
import { runtimeEvent } from "./runtime-events";
import { beginRuntimeOperation, runtimeErrorDetails } from "./runtime-operations";
import { ResourceScope } from './core/lifecycle/resource-scope';

interface PackageState { id: string; installed: boolean; phase?: string; downloaded?: number; total?: number; error?: string; errorCode?: string; }
const cardIds: Record<string, string> = { mountain:'layered-mountain', 'particle-image':'particle-image' };
const text=(node:HTMLElement,value:string)=>{if(node.textContent!==value)node.textContent=value;};
const attribute=(node:Element,name:string,value:string)=>{if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
let nextLoadingOwner=0;
export class BackgroundPackageMarket {
  #states = new Map<string, PackageState>();
  #disposed = false;
  #timer?: ReturnType<typeof setTimeout>;
  #busy = new Set<string>();
  #loading = new Set<string>();
  #loadingOwner=String(++nextLoadingOwner);
  #replayed = new WeakSet<Event>();
  #renderQueued = false;
  #statusFailed = false;
  #refreshJob:Promise<void>|undefined;
  #scope = new ResourceScope(error => runtimeEvent('plugin-market','cleanup','failed',runtimeErrorDetails(error)));
  constructor(private root: ShadowRoot, private bridge: WorkspaceBridge, private notice: (message:string)=>void,private prepare?:(id:string,intent:'enable'|'settings')=>void|Promise<void>) {
    this.#scope.listen(root,'click', this.#click, true);
    void this.#refresh();
  }
  #card(id:string): HTMLElement | null {
    const info=PLUGIN_PACKAGES.find(p=>p.id===id);
    if(info?.category==='file-preview')return this.root.querySelector(`[data-preview-extension="code-codex.${id}"]`);
    if(info?.category==='developer-tools'&&id!=='git-history')return this.root.querySelector(`[data-tool-plugin="code-codex.${id}"]`);
    if(id==='git-history')return this.root.querySelector('.git-history-extension');
    const key=id==='surface-opacity'?'surface-opacity':id==='transparent-background'?'transparent-background':id==='codex-startup-transition'?'startup-transition':`${cardIds[id]??id}-background`;
    return this.root.querySelector(`[data-appearance-plugin="code-codex.${key}"]`);
  }
  #click = (event:Event) => {
    if(this.#replayed.has(event))return;
    const button=(event.target as Element)?.closest<HTMLButtonElement>('button.preview-extension-action,button.particle-settings-trigger');
    if (!button) return;
    const info=PLUGIN_PACKAGES.find(p=>this.#card(p.id)?.contains(button));
    if (!info) return;
    const state=this.#states.get(info.id);
    const intent=button.matches('.preview-extension-action')?'enable':'settings';
    if(!state||this.#disposed||this.#loading.has(info.id)){
      event.stopImmediatePropagation();event.preventDefault();return;
    }
    // Verified modules delegate both enable and stop directly to their runtime.
    if(isPluginPackageLoaded(info.id))return;
    event.stopImmediatePropagation();event.preventDefault();
    if(state.installed&&!this.#busy.has(info.id)){
      this.#loading.add(info.id);this.render();
      void ensurePluginPackage(info.id).then(async()=>{
        if(this.#disposed||!button.isConnected)return;
        this.#releaseLoading(info.id);this.render();
        if(intent==='enable'){button.setAttribute('aria-pressed','false');button.dataset.enabled='false';button.textContent='Enable';}
        await this.prepare?.(info.id,intent);
        if(this.#disposed||!button.isConnected)return;
        const replay=new MouseEvent('click',{bubbles:true,composed:true,cancelable:true});
        this.#replayed.add(replay);button.dispatchEvent(replay);
      }).catch(error=>{if(!this.#disposed)this.notice(error instanceof Error?error.message:String(error));}).finally(()=>{
        this.#releaseLoading(info.id);
        if(!this.#disposed)this.render();
      });
      return;
    }
    if(!button.matches('.preview-extension-action'))return;
    if (this.#busy.has(info.id)) {
      void this.bridge.request('explorer.plugins.cancel',{id:info.id}).catch(e=>this.notice(String(e)));return;
    }
    void this.#install(info.id);
  };
  #releaseLoading(id:string):void {
    this.#loading.delete(id);
    const button=this.#card(id)?.querySelector<HTMLButtonElement>('button.preview-extension-action');
    if(button?.dataset.packageLoadingOwner!==this.#loadingOwner)return;
    delete button.dataset.packageLoadingOwner;
    const active=button.getAttribute('aria-pressed')==='true'||button.dataset.enabled==='true';
    button.textContent=translate(active?'Disable':'Enable');button.disabled=false;
  }
  async #install(id:string):Promise<void> {
    const info=PLUGIN_PACKAGES.find(p=>p.id===id)!;
    if(this.#disposed||this.#busy.has(id))return;
    this.#busy.add(id);this.render();
    // Start the fast progress poll immediately, even if the idle timer has
    // several seconds left. An install still has its own completion request.
    void this.#refresh();
    const operation=beginRuntimeOperation('plugin-market','download',{id:info.id,version:info.version,category:info.category});
    try{
      await this.bridge.request('explorer.plugins.install',{id},130_000);
      operation.finish('installed',{enabledAutomatically:false});
    }catch(error){operation.finish('failed',runtimeErrorDetails(error));if(!this.#disposed)this.notice(pluginDownloadMessage(error));}
    finally{this.#busy.delete(id);if(!this.#disposed)await this.#refresh(true);}
  }
  refresh():void {void this.#refresh();}
  async #refresh(afterChange=false):Promise<void> {
    if(this.#refreshJob){await this.#refreshJob;if(!afterChange)return;}
    const job=this.#readStates();this.#refreshJob=job;
    try{await job;}finally{if(this.#refreshJob===job)this.#refreshJob=undefined;}
  }
  async #readStates():Promise<void> {
    if(this.#disposed)return;
    clearTimeout(this.#timer);
    try {
      const states=await this.bridge.request<PackageState[]>('explorer.plugins.status');
      if(this.#disposed)return;
      if(this.#statusFailed){runtimeEvent('plugin-market','status','recovered');this.#statusFailed=false;}
      for(const state of states){
        const previous=this.#states.get(state.id);
        if(!previous || previous.installed!==state.installed || previous.phase!==state.phase || previous.error!==state.error)runtimeEvent('plugin-market','package state','changed',{id:state.id,installed:state.installed,phase:state.phase??'idle',downloadedBytes:state.downloaded,totalBytes:state.total,error:state.error});
        this.#states.set(state.id,state);
      }
      this.render();
    } catch(error) {
      if(this.#disposed)return;
      if(!this.#statusFailed)runtimeEvent('plugin-market','status','failed',runtimeErrorDetails(error));
      this.#statusFailed=true;
      for(const info of PLUGIN_PACKAGES)this.#states.set(info.id,{id:info.id,installed:false,error:String(error)});
      this.render();
    }
    // Only a live download needs progress observations. Idle state is refreshed
    // on opening and completion, not by a permanent status/hash loop.
    if(this.#busy.size)this.#timer=setTimeout(()=>void this.#refresh(),600);
  }
  render():void {
    if(this.#disposed)return;
    for(const info of PLUGIN_PACKAGES) {
      const card=this.#card(info.id),button=card?.querySelector<HTMLButtonElement>('button.preview-extension-action');
      if(!card||!button)continue;
      const state=this.#states.get(info.id),busy=this.#busy.has(info.id);
      // An unanswered status poll must not overwrite a verified running runtime.
      const installed=state?state.installed:isPluginPackageLoaded(info.id);
      attribute(card,'data-package-installed',String(installed));
      attribute(card,'data-package-pending',String(!installed||busy));
      const wasDownload=button.dataset.packageAction==='download';
      attribute(button,'data-package-action',!installed||busy?'download':'enable');
      const status=card.querySelector<HTMLElement>('.preview-extension-status');
      if(status&&status.hidden!==(!installed||busy))status.hidden=!installed||busy;
      let download=card.querySelector<HTMLElement>('.preview-extension-download');
      const copy=card.querySelector<HTMLElement>('.preview-extension-copy')!;
      const actions=button.closest<HTMLElement>('.preview-extension-actions')??button;
      if(installed&&!busy){
        download?.remove();
        if(actions.parentElement===copy)card.append(actions);
      }
      else {
        if(!download){
          download=document.createElement('div');download.className='preview-extension-download';
          const label=document.createElement('span');label.className='preview-extension-download-label';
          const progress=document.createElement('progress');progress.max=100;
          download.append(label,progress);
          copy.append(download);
        }
        // Keep all three rows in the text column, independent of icon height.
        if(download.parentElement!==copy)copy.append(download);
        if(actions.parentElement!==copy)copy.append(actions);
        const label=download.querySelector<HTMLElement>('span')!;
        const progress=download.querySelector('progress')!;
        if(progress.hidden!==!busy)progress.hidden=!busy;
        attribute(progress,'aria-label',t('Download {name}',{name:pluginDisplayName(info.id)}));
        const packageBytes=info.size+(info.resources??[]).reduce((sum,asset)=>sum+asset.size,0);
        const percent=state?.total?Math.min(100,Math.max(0,Math.floor((state.downloaded??0)/state.total*100))):null;
        if(busy){
          if(percent===null)progress.removeAttribute('value');else progress.value=percent;
          const phase=translate(state?.phase==='verifying'?'Verifying':'Downloading');
          text(label,`${phase}${percent===null?'…':` · ${percent}%`}`);
        } else text(label,`${(packageBytes/1024).toFixed(0)} KB · ${translate(state?.error?'Download failed':state?'Not installed':'Checking…')}`);
        attribute(download,'title',state?.error?pluginDownloadMessage(state):'');
      }
      const active=button.getAttribute('aria-pressed')==='true'||button.dataset.enabled==='true';
      if(this.#loading.has(info.id)){attribute(button,'data-package-loading-owner',this.#loadingOwner);text(button,translate('Loading…'));if(!button.disabled)button.disabled=true;continue;}
      const releasedLoading=button.dataset.packageLoadingOwner!==undefined;
      if(releasedLoading){delete button.dataset.packageLoadingOwner;button.disabled=false;}
      if(!installed||busy) {
        text(button,translate(busy?'Cancel':state?'Download':'Checking…'));
        // Checking is guarded by the capture handler, not a disabled lease:
        // a runtime renderer may replace its label before status resolves.
        // Preserve any legitimate runtime busy state while status is unknown.
        if(state&&button.disabled)button.disabled=false;
        attribute(button,'data-enabled','false');attribute(button,'aria-pressed','false');
        attribute(button,'aria-label',t(busy?'Cancel download of {name}':'Download {name}',{name:pluginDisplayName(info.id)}));
      } else if(!isPluginPackageLoaded(info.id)) {
        // A saved enabled preference is not proof of a loaded package. Keep
        // this card actionable while preserving the user's preference bytes.
        text(button,translate('Enable'));if(button.disabled)button.disabled=false;attribute(button,'data-enabled','false');attribute(button,'aria-pressed','false');
        attribute(button,'aria-label',t('Enable {name}',{name:pluginDisplayName(info.id)}));
        const status=card.querySelector<HTMLElement>('.preview-extension-status');
        if(status){text(status,translate('Installed'));attribute(status,'data-enabled','false');}
      } else if(wasDownload||releasedLoading) {
        text(button,translate(active?'Disable':'Enable'));if(button.disabled)button.disabled=false;attribute(button,'aria-label',t(active?'Disable {name}':'Enable {name}',{name:pluginDisplayName(info.id)}));
        const status=card.querySelector<HTMLElement>('.preview-extension-status');if(status&&!active)text(status,translate('Installed'));
      }
      const settings=card.querySelector<HTMLButtonElement>('.particle-settings-trigger');
      if(settings){if(settings.disabled!==(!installed||busy))settings.disabled=!installed||busy;attribute(settings,'title',translate(installed?'Configure plugin':'Download this plugin first'));}
    }
    const select=this.root.querySelector<HTMLSelectElement>('#cle-startupTransition-background');
    if(select)for(const option of select.options){const info=PLUGIN_PACKAGES.find(p=>p.id===option.value);if(info){const available=!!this.#states.get(info.id)?.installed;if(option.disabled!==!available)option.disabled=!available;attribute(option,'title',available?'':translate('Download this background in Preview Market first'));}}
  }
  queueRender():void {
    if(this.#disposed||this.#renderQueued)return;
    this.#renderQueued=true;
    queueMicrotask(()=>{this.#renderQueued=false;if(!this.#disposed)this.render();});
  }
  dispose():void {this.#disposed=true;clearTimeout(this.#timer);this.#scope.dispose();for(const id of [...this.#loading])this.#releaseLoading(id);}
}
