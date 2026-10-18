import { customBackgroundPanelMarkup } from './view';
// custom responsibility; original state keys, defaults and lifecycle retained.
import { PreviewClockFollower } from "../../../src/core/media/preview-clock";
import { nativeSettingsBackgroundCss } from "../../../src/native-background-surfaces";
import { controls,defaults,KEY,normalizeParameters,type Media,type Parameters } from "./model";
import { transaction } from "./repository";


export class CustomBackground {
 #records:Media[]=[]; #selected=''; #enabled=false; #disposed=false; #page=0;
 #toggling=false; #toggleGeneration=0;
 #layer:HTMLElement|undefined; #media:HTMLVideoElement|HTMLImageElement|undefined; #url:string|undefined;
 #previewMedia:HTMLVideoElement|HTMLImageElement|undefined; #previewUrl:string|undefined;
 #activeRecord:Media|undefined; #previewRecord:Media|undefined; #rendered:Media[]=[];
 #playAttempts=new WeakMap<HTMLVideoElement,symbol>();

 #thumbUrls:string[]=[]; #abort=new AbortController(); #panel:HTMLElement;
 #save:Promise<unknown>=Promise.resolve(); #style:HTMLStyleElement|undefined;
 readonly ready:Promise<void>;
 constructor(private root:ShadowRoot,private beforeEnable:()=>Promise<void>,private report:(code:string,error:unknown)=>void){
  this.#panel=root.querySelector<HTMLElement>('.custom-background-panel')!;
  this.#panel.innerHTML=customBackgroundPanelMarkup();
  try{const v=JSON.parse(localStorage.getItem(KEY)??'{}');this.#selected=typeof v.selected==='string'?v.selected:'';this.#enabled=v.enabled===true;}catch(e){this.#error('CC-BG-SETTINGS-READ',e);}
  const listen=(target:EventTarget,name:string,fn:EventListener)=>target.addEventListener(name,fn,{signal:this.#abort.signal});
  listen(root.querySelector('.custom-background-enable')!,'click',()=>void this.#toggle());
  listen(root.querySelector('.custom-background-settings')!,'click',()=>this.#open());
  listen(this.#panel,'toggle',()=>{const open=this.#panel.matches(':popover-open');this.#trigger().setAttribute('aria-expanded',String(open));if(!open)this.close();});
  listen(window,'resize',()=>this.#position());
  root.addEventListener('scroll',()=>this.#position(),{capture:true,signal:this.#abort.signal});
  listen(window,'pointerdown',e=>{const path=e.composedPath();if(!path.includes(this.#panel)&&!path.includes(this.#trigger()))this.close();});
  listen(this.#panel.querySelector('.custom-background-reset')!,'click',()=>this.#update({...defaults}));
  listen(this.#panel.querySelector('.custom-background-close')!,'click',()=>{this.close();this.#trigger().focus();});
  listen(this.#panel,'keydown',e=>{if((e as KeyboardEvent).key==='Escape'){e.stopPropagation();this.close();this.#trigger().focus();}});
  listen(this.#panel.querySelector('.custom-background-file')!,'change',e=>{const input=e.target as HTMLInputElement;void this.importFiles([...input.files??[]]).finally(()=>{input.value='';});});
  listen(this.#panel.querySelector('.custom-prev')!,'click',()=>{this.#page--;this.#render();});
  listen(this.#panel.querySelector('.custom-next')!,'click',()=>{this.#page++;this.#render();});
  listen(this.#panel,'input',e=>{const input=e.target as HTMLInputElement;const key=input.dataset.customSetting;if(!key)return;this.#update({[key]:Number(input.value)});});
  listen(this.#panel.querySelector('#cle-custom-fit')!,'change',e=>this.#update({fit:(e.target as HTMLSelectElement).value==='contain'?'contain':'cover'}));
  listen(window,'code-codex:custom-background-stop',()=>{this.#toggleGeneration++;this.#toggling=false;this.#enabled=false;this.#preferences();this.#apply();this.#renderStatus();});
  this.setLanguage(this.#panel.dataset.language??'en');this.ready=this.#load();
 }
 #error(code:string,error:unknown){if(this.#disposed)return;const out=this.#panel.querySelector<HTMLElement>('.custom-background-error');if(out){out.hidden=false;out.textContent=`${code}: ${error instanceof Error?error.message:String(error)}`;}this.report(code,error);}
 async #load(){try{this.#records=await transaction<Media[]>('readonly',s=>s.getAll());if(this.#disposed)return;for(const r of this.#records)r.parameters=normalizeParameters(r.parameters);if(!this.#records.some(r=>r.id===this.#selected))this.#selected=this.#records[0]?.id??'';this.#render();this.#apply();}catch(e){this.#error('CC-BG-STORAGE-READ',e);}}
 #preferences(){try{localStorage.setItem(KEY,JSON.stringify({selected:this.#selected,enabled:this.#enabled}));}catch(e){this.#error('CC-BG-SETTINGS-WRITE',e);}}
 async #toggle(){
  if(this.#disposed||this.#toggling)return;
  const target=!this.#enabled,generation=++this.#toggleGeneration;
  this.#toggling=true;this.#renderStatus();
  try{
   await this.ready;if(target)await this.beforeEnable();
   if(this.#disposed||generation!==this.#toggleGeneration)return;
   this.#enabled=target;this.#preferences();this.#apply();
  }catch(e){this.#error('CC-BG-ENABLE',e);}
  finally{if(generation===this.#toggleGeneration&&!this.#disposed){this.#toggling=false;this.#renderStatus();}}
 }
 #renderStatus(){
  const button=this.root.querySelector<HTMLButtonElement>('.custom-background-enable')!;
  button.setAttribute('aria-pressed',String(this.#enabled));button.dataset.enabled=String(this.#enabled);
  // Match Surface/Startup: the host global catalog localizes these canonical labels.
  button.textContent=this.#enabled?'Disable':'Enable';button.disabled=this.#toggling;
  button.dataset.runtimePending=String(this.#toggling);
  this.root.querySelector('[data-appearance-plugin="code-codex.custom-background-background"]')!.setAttribute('aria-busy',String(this.#toggling));
  const status=this.root.querySelector<HTMLElement>('.custom-background-status')!;
  status.textContent=this.#enabled?'Enabled':'Disabled';status.dataset.enabled=String(this.#enabled);
 }
 async importFiles(files:File[]){try{for(const file of files){if(this.#disposed)return;if(this.#records.length>=32)throw Error('Media library limit: 32 items.');if(!file.size||file.size>128*1024*1024)throw Error('Each media file must contain data and be at most 128 MB.');if(this.#records.reduce((n,r)=>n+r.blob.size,0)+file.size>512*1024*1024)throw Error('Media library limit: 512 MB.');const kind=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':null;if(!kind)throw Error('Unsupported media type; select an image or video.');await this.#validate(file,kind);const record:Media={id:crypto.randomUUID(),name:file.name,kind,blob:file,parameters:{...defaults}};await transaction('readwrite',s=>s.put(record));if(this.#disposed)return;this.#records.push(record);this.#selected=record.id;this.#page=Math.floor((this.#records.length-1)/2);this.#preferences();this.#render();this.#apply();}}catch(e){this.#error('CC-BG-MEDIA-IMPORT',e);}}
 async #validate(blob:Blob,kind:'image'|'video'){const url=URL.createObjectURL(blob),media=document.createElement(kind==='video'?'video':'img');try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{media.onload=null;media.onerror=null;reject(Error('Media metadata timeout after 10 seconds.'));},10000);const done=(e?:Event|string)=>{clearTimeout(timer);e?reject(Error('Media could not be decoded.')):resolve();};media.onerror=done;if(media instanceof HTMLVideoElement){media.preload='metadata';media.onloadedmetadata=()=>done();}else media.onload=()=>done();media.src=url;});}finally{if(media instanceof HTMLVideoElement){media.removeAttribute('src');media.load();}URL.revokeObjectURL(url);}}
 #update(patch:Partial<Parameters>){const record=this.#records.find(r=>r.id===this.#selected);if(!record)return;record.parameters=normalizeParameters({...record.parameters,...patch});const snapshot={...record,parameters:{...record.parameters}};this.#save=this.#save.catch(()=>{}).then(()=>transaction('readwrite',s=>s.put(snapshot))).catch(e=>this.#error('CC-BG-PARAMETER-WRITE',e));this.#styleMedia();this.#renderValues();this.#position();}
 #renderValues(){const record=this.#records.find(r=>r.id===this.#selected);this.#panel.querySelector<HTMLButtonElement>('.custom-background-reset')!.disabled=!record;this.#panel.querySelector<HTMLElement>('.custom-parameters')!.hidden=!record;for(const [key,,,,,,unit] of controls){const row=this.#panel.querySelector<HTMLElement>(`[data-control="${key}"]`)!;row.hidden=key==='speed'&&record?.kind!=='video';const input=row.querySelector('input')!,output=row.querySelector('output')!;input.value=String(record?.parameters[key]??defaults[key]);output.textContent=input.value+unit;}(this.#panel.querySelector('#cle-custom-fit') as HTMLSelectElement).value=record?.parameters.fit??'cover';}
 #render(){
  if(this.#disposed)return;
  this.#renderStatus();
  const grid=this.#panel.querySelector<HTMLElement>('.particle-library-grid')!;
  const pages=Math.max(1,Math.ceil(this.#records.length/2));
  this.#page=Math.max(0,Math.min(pages-1,this.#page));
  const visible=this.#records.slice(this.#page*2,this.#page*2+2);
  // Selection/parameter changes keep decoded thumbnails and their URLs alive.
  if(!grid.childElementCount||visible.length!==this.#rendered.length||visible.some((r,i)=>r.id!==this.#rendered[i]?.id||r.blob!==this.#rendered[i]?.blob)){
   for(const video of grid.querySelectorAll('video'))this.#releaseVideo(video);
   this.#thumbUrls.forEach(u=>URL.revokeObjectURL(u));this.#thumbUrls=[];
   grid.replaceChildren();this.#rendered=visible;
   for(const record of visible){
    const item=document.createElement('article');item.className='particle-library-item';
    const select=document.createElement('button');select.type='button';select.className='particle-library-select';select.title=record.name;
    const thumb=document.createElement(record.kind==='video'?'video':'img');thumb.className='particle-library-thumb';
    const url=URL.createObjectURL(record.blob);this.#thumbUrls.push(url);thumb.src=url;
    if(thumb instanceof HTMLVideoElement){thumb.muted=true;thumb.preload='metadata';thumb.playsInline=true;}
    const name=document.createElement('span');name.className='particle-library-name';name.textContent=record.name;select.append(thumb,name);
    select.onclick=()=>{if(this.#selected===record.id)return;this.#selected=record.id;this.#preferences();this.#render();this.#apply();};
    const remove=document.createElement('button');remove.type='button';remove.className='particle-library-delete';remove.style.cssText='position:absolute;right:4px;top:4px;z-index:3;color:var(--cle-ink);background:var(--cle-paper);border:1px solid var(--cle-rule);border-radius:5px;width:22px;height:22px';remove.textContent='×';remove.setAttribute('aria-label','Remove '+record.name);remove.onclick=()=>void this.#remove(record.id);
    item.append(select,remove);grid.append(item);
   }
   const addItem=document.createElement('article');addItem.className='particle-library-item startup-video-add-item';
   const add=document.createElement('button');add.type='button';add.className='particle-library-select startupTransition-add-card';add.setAttribute('aria-label','Import images or videos');add.innerHTML='<span class="particle-library-thumb startup-video-add-preview" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="particle-library-name">&nbsp;</span>';add.onclick=()=>this.#panel.querySelector<HTMLInputElement>('.custom-background-file')!.click();addItem.append(add);grid.append(addItem);
  }
  visible.forEach((record,i)=>{const item=grid.children[i]!,selected=record.id===this.#selected;item.classList.toggle('is-selected',selected);item.querySelector('.particle-library-select')!.setAttribute('aria-pressed',String(selected));});
  grid.querySelector<HTMLButtonElement>('.startupTransition-add-card')!.disabled=this.#records.length>=32;
  this.#panel.querySelector('.particle-source-count')!.textContent=`${this.#records.length} / 32`;
  this.#panel.querySelector('.startupTransition-library-summary')!.textContent=`${(this.#records.reduce((n,r)=>n+r.blob.size,0)/1048576).toFixed(1)}/512 MB`;
  this.#panel.querySelector('.startup-video-pager output')!.textContent=`${this.#page+1} / ${pages}`;
  (this.#panel.querySelector('.custom-prev') as HTMLButtonElement).disabled=this.#page===0;
  (this.#panel.querySelector('.custom-next') as HTMLButtonElement).disabled=this.#page===pages-1;
  this.#renderValues();this.#position();
 }
 async #remove(id:string){try{await this.#save;await transaction('readwrite',s=>s.delete(id));if(this.#disposed)return;this.#records=this.#records.filter(r=>r.id!==id);if(this.#selected===id)this.#selected=this.#records[0]?.id??'';this.#preferences();this.#render();this.#apply();}catch(e){this.#error('CC-BG-MEDIA-DELETE',e);}}
 #releaseVideo(media:HTMLVideoElement){this.#playAttempts.delete(media);media.pause();media.removeAttribute('src');media.load();}
 #clearBackground(){
  this.#stopPreviewSync();
  const media=this.#media;this.#media=undefined;this.#activeRecord=undefined;
  if(media instanceof HTMLVideoElement)this.#releaseVideo(media);
  media?.remove();this.#layer?.remove();this.#layer=undefined;this.#style?.remove();this.#style=undefined;
  if(!document.querySelector('[data-code-codex-custom-layer]'))document.documentElement.removeAttribute('data-code-codex-custom-background');
  if(this.#url)URL.revokeObjectURL(this.#url);this.#url=undefined;
 }
 #clearPreview(){
  this.#stopPreviewSync();
  const media=this.#previewMedia;this.#previewMedia=undefined;this.#previewRecord=undefined;
  if(media instanceof HTMLVideoElement)this.#releaseVideo(media);
  media?.remove();if(this.#previewUrl)URL.revokeObjectURL(this.#previewUrl);this.#previewUrl=undefined;
 }
 #current(media:HTMLImageElement|HTMLVideoElement){return !this.#disposed&&(this.#media===media||(this.#previewMedia===media&&!this.#panel.hidden));}
 #play(media:HTMLImageElement|HTMLVideoElement){
  if(!(media instanceof HTMLVideoElement)||!media.paused)return;
  const attempt=Symbol();this.#playAttempts.set(media,attempt);
  void media.play().catch(e=>{if(this.#playAttempts.get(media)===attempt&&this.#current(media))this.#error('CC-BG-VIDEO-PLAY',e);});
 }
 #makeMedia(record:Media,url:string){
  const media=document.createElement(record.kind==='video'?'video':'img');
  media.style.cssText='position:absolute;width:100%;height:100%;inset:0;pointer-events:none';
  if(media instanceof HTMLVideoElement){media.muted=true;media.loop=true;media.autoplay=true;media.playsInline=true;media.playbackRate=record.parameters.speed;}
  media.onerror=()=>{if(this.#current(media))this.#error('CC-BG-MEDIA-DECODE',media instanceof HTMLVideoElement?media.error?.message??'Video decode failed':'Image decode failed');};
  if(media instanceof HTMLVideoElement){
   const align=()=>{if(this.#current(media)&&this.#previewClock.running)this.#alignPreview();};
   media.onloadedmetadata=align;media.onseeked=align;media.onplaying=align;
  }
  media.src=url;return media;
 }
 #previewClock=new PreviewClockFollower({active:()=>!this.#disposed&&!this.#panel.hidden,background:()=>this.#media,preview:()=>this.#previewMedia,play:video=>this.#play(video),pause:video=>{this.#playAttempts.delete(video);video.pause();},failed:error=>this.#error('CC-BG-PREVIEW-SYNC',error)});
 #stopPreviewSync(){this.#previewClock.stop();}
 #startPreviewSync(){this.#previewClock.start();}
 #alignPreview(){this.#previewClock.align();}
 #same(record:Media|undefined,current:Media|undefined){return !!record&&record.id===current?.id&&record.blob===current.blob;}
 #apply(){
  if(this.#disposed)return;
  const record=this.#records.find(r=>r.id===this.#selected);
  // The normal background and settings preview have independent ownership.
  // Opening a panel cannot revoke the URL or reset the decoder of the background.
  if(!this.#enabled||!record)this.#clearBackground();
  else if(!this.#same(record,this.#activeRecord)){
   this.#clearBackground();this.#activeRecord=record;this.#url=URL.createObjectURL(record.blob);
   this.#layer=document.createElement('div');this.#layer.dataset.codeCodexCustomLayer='true';this.#layer.style.cssText='position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict';
   this.#media=this.#makeMedia(record,this.#url);this.#layer.append(this.#media);document.body.prepend(this.#layer);
   document.documentElement.setAttribute('data-code-codex-custom-background','true');
   this.#style=document.createElement('style');this.#style.textContent=`html[data-code-codex-custom-background] body{isolation:isolate;background:transparent!important}html[data-code-codex-custom-background] :is(main.main-surface,[data-app-shell-main-surface="default"],aside.app-shell-left-panel,[data-app-shell-page-surface],.sidebar-navigation){background-color:transparent!important;background-image:none!important}html[data-code-codex-custom-background] [class*="WorkspaceContent"]::before{background:transparent!important}
${nativeSettingsBackgroundCss('data-code-codex-custom-background')}
/* Match the existing Particle/Glow auxiliary shell treatment. Surface Opacity
 * owns the utility's outer alpha while active; nested backing paints only once. */
html[data-code-codex-custom-background]:not([data-code-codex-ui-mask-active]) body aside[data-app-shell-focus-area="right-panel"]{background-color:rgba(16,17,20,.66)!important}
html[data-code-codex-custom-background] body :is(aside[data-app-shell-focus-area="right-panel"] .bg-surface,[data-app-shell-header-edge-scroll],.thread-scroll-container[data-app-action-timeline-scroll]){background-color:transparent!important}`;
   document.head.append(this.#style);this.#play(this.#media);
  }
  if(!record||(!this.#same(record,this.#previewRecord)&&this.#previewMedia))this.#clearPreview();
  if(record&&!this.#panel.hidden){
   if(!this.#same(record,this.#previewRecord)){
    this.#previewRecord=record;this.#previewUrl=URL.createObjectURL(record.blob);this.#previewMedia=this.#makeMedia(record,this.#previewUrl);
    this.#panel.querySelector('.custom-background-preview')!.append(this.#previewMedia);
   }
  }
  this.#styleMedia();this.#startPreviewSync();
 }
 #styleMedia(){const record=this.#records.find(r=>r.id===this.#selected);if(!record)return;const p=record.parameters;for(const media of [...this.#panel.querySelectorAll<HTMLImageElement|HTMLVideoElement>('.custom-background-preview img,.custom-background-preview video'),...(this.#media?[this.#media]:[])]){media.style.objectFit=p.fit;media.style.transform=`translate(${p.x}%,${p.y}%) rotate(${p.rotation}deg) scale(${p.scale/100})`;media.style.opacity=String(p.opacity/100);media.style.filter=`blur(${p.blur}px) brightness(${p.brightness/100}) contrast(${p.contrast/100}) saturate(${p.saturation/100})`;if(media instanceof HTMLVideoElement)media.playbackRate=p.speed;}}
 setLanguage(language:string){this.root.querySelector<HTMLElement>('[data-appearance-plugin="code-codex.custom-background-background"]')!.dataset.language=language;this.#panel.dataset.language=language;this.#panel.lang=language==='zh'?'zh-CN':'en';const fit=this.#panel.querySelector<HTMLSelectElement>('#cle-custom-fit')!;fit.options[0]!.textContent=language==='zh'?'铺满':'Cover';fit.options[1]!.textContent=language==='zh'?'完整显示':'Contain';const reset=this.#panel.querySelector<HTMLButtonElement>('.custom-background-reset')!;reset.textContent=language==='zh'?'重置参数':'Reset';reset.title=language==='zh'?'重置当前素材的参数':'Reset parameters for the selected media';this.#renderStatus();}
 #trigger(){return this.root.querySelector<HTMLButtonElement>('.custom-background-settings')!;}
 #open(){
  if(this.#panel.matches(':popover-open')){this.close();return;}
  for(const other of this.root.querySelectorAll<HTMLElement>('.particle-settings-panel'))if(other!==this.#panel&&other.matches(':popover-open'))other.hidePopover();
  this.#panel.hidden=false;this.#panel.showPopover();this.#apply();this.#position();
  this.#trigger().setAttribute('aria-expanded','true');this.#panel.querySelector<HTMLButtonElement>('.custom-background-close')!.focus();
 }
 // Reuse Startup Transition width while retaining the plugin card anchor.
 #position(){
  const panel=this.#panel;if(!panel.matches(':popover-open'))return;
  const card=this.#trigger().closest<HTMLElement>('.preview-extension')!;
  const rect=card.getBoundingClientRect(),edge=12,gap=8;
  const width=Math.min(800,Math.max(0,window.innerWidth-edge*2));
  let left=rect.right+gap;
  if(left+width>window.innerWidth-edge){left=Math.max(edge,window.innerWidth-edge-width);}
  panel.style.boxSizing='border-box';panel.style.width=width+'px';panel.style.maxHeight=Math.max(0,window.innerHeight-edge*2)+'px';
  const height=panel.offsetHeight;
  const top=Math.min(Math.max(edge,rect.top),Math.max(edge,window.innerHeight-edge-height));
  panel.style.left=Math.round(left)+'px';panel.style.top=Math.round(top)+'px';

 }
 close(){this.#stopPreviewSync();try{if(this.#panel.matches(':popover-open'))this.#panel.hidePopover();}catch{}this.#panel.hidden=true;this.#trigger().setAttribute('aria-expanded','false');for(const video of this.#panel.querySelectorAll('video')){this.#playAttempts.delete(video);video.pause();}}
 dispose(){this.#toggleGeneration++;this.#disposed=true;this.#abort.abort();this.close();this.#clearBackground();this.#clearPreview();for(const u of this.#thumbUrls)URL.revokeObjectURL(u);this.#thumbUrls=[];}
}
