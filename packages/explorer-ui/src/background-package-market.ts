import { ExplorerBridge } from './bridge';
import { PLUGIN_PACKAGES, isPluginPackageLoaded } from './plugin-runtime';
import { ensurePluginPackage } from './plugin-load-diagnostics';
import { runtimeEvent } from "./runtime-events";
import { beginRuntimeOperation, runtimeErrorDetails } from "./runtime-operations";

interface PackageState { id: string; installed: boolean; phase?: string; downloaded?: number; total?: number; error?: string; }
const cardIds: Record<string, string> = { mountain:'layered-mountain', 'particle-image':'particle-image' };
export class BackgroundPackageMarket {
  #states = new Map<string, PackageState>();
  #disposed = false;
  #timer?: ReturnType<typeof setTimeout>;
  #busy = new Set<string>();
  #loading = new Set<string>();
  #replayed = new WeakSet<Event>();
  #renderQueued = false;
  #statusFailed = false;
  constructor(private root: ShadowRoot, private bridge: ExplorerBridge, private notice: (message:string)=>void,private prepare?:(id:string,intent:'enable'|'settings')=>void) {
    root.addEventListener('click', this.#click, true);
    void this.#refresh();
  }
  #card(id:string): HTMLElement | null {
    const info=PLUGIN_PACKAGES.find(p=>p.id===id);
    if(info?.category==='file-preview')return this.root.querySelector(`[data-preview-extension="code-codex.${id}"]`);
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
    if(isPluginPackageLoaded(info.id)&&(button.getAttribute('aria-pressed')==='true' || button.dataset.enabled==='true' || button.getAttribute('aria-expanded')==='true'))return;
    event.stopImmediatePropagation();event.preventDefault();
    if(state.installed&&!this.#busy.has(info.id)){
      this.#loading.add(info.id);this.render();
      void ensurePluginPackage(info.id).then(()=>{
        if(this.#disposed||!button.isConnected)return;
        this.#loading.delete(info.id);button.disabled=false;this.render();
        if(intent==='enable'){button.setAttribute('aria-pressed','false');button.dataset.enabled='false';button.textContent='Enable';}
        this.prepare?.(info.id,intent);
        const replay=new MouseEvent('click',{bubbles:true,composed:true,cancelable:true});
        this.#replayed.add(replay);button.dispatchEvent(replay);
      },error=>{if(!this.#disposed)this.notice(error instanceof Error?error.message:String(error));}).finally(()=>{
        const ownedLoading=this.#loading.delete(info.id);
        if(!this.#disposed){if(ownedLoading&&button.isConnected)button.disabled=false;this.render();}
      });
      return;
    }
    if(!button.matches('.preview-extension-action'))return;
    if (this.#busy.has(info.id)) {
      void this.bridge.request('explorer.plugins.cancel',{id:info.id}).catch(e=>this.notice(String(e)));return;
    }
    void this.#install(info.id);
  };
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
    }catch(error){operation.finish('failed',runtimeErrorDetails(error));if(!this.#disposed)this.notice(error instanceof Error?error.message:String(error));}
    finally{this.#busy.delete(id);if(!this.#disposed)await this.#refresh();}
  }
  async #refresh():Promise<void> {
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
    this.#timer=setTimeout(()=>void this.#refresh(),this.#busy.size?600:5000);
  }
  render():void {
    for(const info of PLUGIN_PACKAGES) {
      const card=this.#card(info.id),button=card?.querySelector<HTMLButtonElement>('button.preview-extension-action');
      if(!card||!button)continue;
      const state=this.#states.get(info.id),busy=this.#busy.has(info.id);
      const installed=!!state?.installed;
      card.dataset.packageInstalled=String(installed);
      card.dataset.packagePending=String(!installed||busy);
      button.dataset.packageAction=!installed||busy?'download':'enable';
      const status=card.querySelector<HTMLElement>('.preview-extension-status');
      if(status)status.hidden=!installed||busy;
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
        progress.hidden=!busy;
        progress.setAttribute('aria-label',`Download ${info.name}`);
        const packageBytes=info.size+(info.resources??[]).reduce((sum,asset)=>sum+asset.size,0);
        const percent=state?.total?Math.min(100,Math.max(0,Math.floor((state.downloaded??0)/state.total*100))):null;
        if(busy){
          if(percent===null)progress.removeAttribute('value');else progress.value=percent;
          const phase=state?.phase==='verifying'?'Verifying':'Downloading';
          label.textContent=`${phase}${percent===null?'…':` · ${percent}%`}`;
        } else label.textContent=`${(packageBytes/1024).toFixed(0)} KB · ${state?.error?'Download failed':state?'Not installed':'Checking…'}`;
        download.title=state?.error??'';
      }
      const active=button.getAttribute('aria-pressed')==='true'||button.dataset.enabled==='true';
      if(this.#loading.has(info.id)){button.textContent='Loading…';button.disabled=true;continue;}
      if(!installed||busy) {
        button.textContent=busy?'Cancel':state?'Download':'Checking…';
        // Checking is guarded by the capture handler, not a disabled lease:
        // a runtime renderer may replace its label before status resolves.
        // Preserve any legitimate runtime busy state while status is unknown.
        if(state)button.disabled=false;
        button.dataset.enabled='false';button.setAttribute('aria-pressed','false');
        button.setAttribute('aria-label',`${busy?'Cancel download of':'Download'} ${info.name}`);
      } else if(!isPluginPackageLoaded(info.id)) {
        // A saved enabled preference is not proof of a loaded package. Keep
        // this card actionable while preserving the user's preference bytes.
        button.textContent='Enable';button.disabled=false;button.dataset.enabled='false';button.setAttribute('aria-pressed','false');
        button.setAttribute('aria-label',`Enable ${info.name}`);
        const status=card.querySelector<HTMLElement>('.preview-extension-status');
        if(status){status.textContent='Installed';status.dataset.enabled='false';}
      } else if(button.textContent==='Download'||button.textContent==='Cancel'||button.textContent==='Checking…'||button.textContent==='Loading…') {
        button.textContent=active?'Disable':'Enable';button.disabled=false;button.setAttribute('aria-label',`Enable ${info.name}`);
        const status=card.querySelector<HTMLElement>('.preview-extension-status');if(status)status.textContent='Installed';
      }
      const settings=card.querySelector<HTMLButtonElement>('.particle-settings-trigger');
      if(settings){settings.disabled=!installed||busy;settings.title=installed?'Configure plugin':'Download this plugin first';}
    }
    const select=this.root.querySelector<HTMLSelectElement>('#cle-startupTransition-background');
    if(select)for(const option of select.options){const info=PLUGIN_PACKAGES.find(p=>p.id===option.value);if(info){const available=!!this.#states.get(info.id)?.installed;option.disabled=!available;option.title=available?'':'Download this background in Preview Market first';}}
  }
  queueRender():void {
    if(this.#disposed||this.#renderQueued)return;
    this.#renderQueued=true;
    queueMicrotask(()=>{this.#renderQueued=false;if(!this.#disposed)this.render();});
  }
  dispose():void {this.#disposed=true;clearTimeout(this.#timer);this.root.removeEventListener('click',this.#click,true);}
}
