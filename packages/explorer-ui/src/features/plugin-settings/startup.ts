// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { WorkspaceBridge,getBootstrapConfig } from "../../bridge";
import { icons } from "../../icons";
import { ensureStartupBackgroundPackage } from "../../plugin-load-diagnostics";
import { flushStartupVideoPersistence } from "../../renderer-storage";
import { runtimeEvent } from "../../runtime-events";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import { mountStartupBackground } from "../../startup-background";
import { attachStartupCinema,clipFadeOpacity,formatTimelineTime,listStartupVideos,moveTimelineBoundary,removeStartupVideo,sampleStartupVideoFrames,saveStartupVideo,startupTimelineGeometry,type StartupVideo } from "../../startup-transition-facade";
import { DEFAULT_STARTUP_TRANSITION_SETTINGS,readStartupTransitionSettings,settingsForStartupVideo,startupDefaultClip,startupTransitionModule,startupVideoProfile,writeStartupTransitionSettings,type StartupTransitionSettings } from "../../startup-transition-plugin";
import { downloadStartupExamples,type ExampleProgress } from "../../startup-video-examples";
export interface StartupSettingsControllerPorts {
  readonly shadow: ShadowRoot;
  readonly connected: boolean;
  readonly applyResponsivePlacement: () => void;
  readonly required: <T extends Element>(selector: string) => T;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly bridge: WorkspaceBridge|undefined;
  readonly showActionNotice: (message: string,tone?: "success"|"error") => void;
  readonly startupTransitionNativeSync: Promise<void>;
  readonly previewMarketPopover: HTMLElement;
}
export class StartupSettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  startupLibraryUrls: string[] = [];
  startupCinema: ReturnType<typeof attachStartupCinema> | undefined;
  startupStillUrl: string | undefined;
  startupTimelineFramesAbort: AbortController | undefined;
  startupVideoGeneration = 0;

  constructor(private readonly host: StartupSettingsControllerPorts) { }
  startupTransitionEventsBound=false;
  startupTransitionPackageAvailable!: boolean|undefined;
  startupTransitionPending=false;
  startupVideo: StartupVideo|null=null;
  startupVideos: StartupVideo[]=[];
  startupExamplesAbort!: AbortController|undefined;
  startupExamplesProgress!: ExampleProgress|undefined;
  startupLibraryPage=0;
  startupTimelineScrubTime!: number|undefined;
  startupPlaybackFrame!: number|undefined;
  startupBackgroundPreview!: { dispose(): void }|undefined;
  startupBackgroundPreviewId!: string|undefined;
  startupPlaybackGeneration=0;
  startupPlaybackRunning=false;
  startupPreviewElapsed=0;
  startupPreviewLeadIn=0;
  startupPreviewFadeOpacity=1;
  startupPreviewComplete=false;
  startupVideoPending=false;
  closeStartupTransition(): void {
    this.startupExamplesAbort?.abort(); this.startupExamplesAbort=undefined;
    if(this.startupExamplesProgress) { this.startupExamplesProgress=undefined; this.startupVideoPending=false; }
    this.startupVideoGeneration+=1;
    this.startupTimelineFramesAbort?.abort();
    this.stopStartupPreview();
    this.startupCinema?.dispose(); this.startupCinema=undefined;
    this.releaseStartupVideoPreview();
    const panel=this.host.shadow.querySelector<HTMLElement>("#cle-startupTransition-settings");
    if(panel?.matches(":popover-open")) { panel.hidePopover(); queueMicrotask(() => { if(this.host.connected) this.host.applyResponsivePlacement(); }); }
    this.host.shadow.querySelector(".startupTransition-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  positionStartupTransition(): void {
    const panel=this.host.required<HTMLElement>("#cle-startupTransition-settings");
    if(!panel.matches(":popover-open")) return;
    const rect=this.host.required<HTMLElement>(".startupTransition-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(800,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  ensureStartupBackgroundPreview(backgroundId: string): void {
    if(this.startupBackgroundPreviewId===backgroundId&&this.startupBackgroundPreview) return;
    this.stopStartupPreview();
    const layer=document.createElement('div');
    layer.className='startupTransition-background-live';
    layer.style.cssText='position:absolute;inset:0;overflow:hidden;background:#080b0e';
    this.host.required<HTMLElement>('.legacy-startup-workspace .startupTransition-preview-stage').append(layer);
    let active=true;
    let renderer: ReturnType<typeof mountStartupBackground>|undefined;
    let preview: { dispose(): void }|undefined;
    const fail=(error: unknown) => {
      if(!active) return;
      active=false;
      renderer?.dispose();
      layer.remove();
      if(this.startupBackgroundPreview===preview) {
        this.startupBackgroundPreview=undefined;
        this.startupBackgroundPreviewId=undefined;
      }
      this.showStartupTransitionError(error);
    };
    preview={ dispose: () => { active=false; renderer?.dispose(); layer.remove(); } };
    this.startupBackgroundPreview=preview;
    this.startupBackgroundPreviewId=backgroundId;
    void ensureStartupBackgroundPackage(backgroundId).then(() => {
      if(!active) return;
      try {
        renderer=mountStartupBackground(layer,backgroundId,message => { if(message) fail(new Error(message)); });
        if(!active) { renderer.dispose(); return; }
        const currentRenderer=renderer;
        preview={ dispose: () => { active=false; currentRenderer.dispose(); layer.remove(); } };
        this.startupBackgroundPreview=preview;
        this.startupBackgroundPreviewId=backgroundId;
        runtimeEvent('startup-animation','background preview','preparing',{ backgroundId });
        void Promise.resolve(renderer.ready).then(() => {
          if(active&&this.startupBackgroundPreview===preview) runtimeEvent('startup-animation','background preview','started',{ backgroundId });
        },fail);
      } catch(error) {
        recordCaughtRuntimeError("#ensureStartupBackgroundPreview",error);
        fail(error);
      }
    },fail);
  }
  renderStartupTransition(): void {
    const available=Boolean(startupTransitionModule());
    if(available!==this.startupTransitionPackageAvailable) {
      this.startupTransitionPackageAvailable=available;
      runtimeEvent('startup-animation','settings renderer',available? 'available':'skipped',{
        packageId: 'codex-startup-transition',
        reason: available? 'player module registered':'optional player module not loaded',
        coreInitializationContinues: true,
        networkRequested: false,
      });
    }
    // A fresh installation has no optional player. Rendering the market must
    // not enter its timeline/media facade or abort core task/tree initialization.
    if(!available) {
      this.host.backgroundPackageMarket?.queueRender();
      return;
    }
    const settings=readStartupTransitionSettings();
    const panel=this.host.required<HTMLElement>("#cle-startupTransition-settings");
    const backgroundMode=settings.source==='background';
    if(backgroundMode&&panel.matches(':popover-open')) this.ensureStartupBackgroundPreview(settings.backgroundId);
    this.host.required<HTMLSelectElement>('#cle-startupTransition-source').value=settings.source;
    this.host.required<HTMLSelectElement>('#cle-startupTransition-background').value=settings.backgroundId;
    const sourceSelect=this.host.required<HTMLSelectElement>('#cle-startupTransition-source');
    const englishSource=panel.dataset.language==='en';
    this.host.required<HTMLElement>('.startupTransition-library').hidden=backgroundMode;
    sourceSelect.options[0]!.textContent=englishSource? 'Video':'视频';
    sourceSelect.options[1]!.textContent=englishSource? 'Background plugin':'背景插件';
    this.host.required<HTMLInputElement>('#cle-startupTransition-minimumVisiblePercent').closest<HTMLElement>('fieldset')!.hidden=backgroundMode;
    this.host.required<HTMLButtonElement>('.startupTransition-reset').parentElement!.hidden=backgroundMode;
    this.host.required<HTMLElement>('.startupTransition-background-controls').hidden=!backgroundMode;
    const backgroundFade=this.host.required<HTMLInputElement>('#cle-startupTransition-background-fade');
    backgroundFade.closest<HTMLElement>('.particle-control-row')!.hidden=!backgroundMode;
    backgroundFade.value=String(settings.backgroundFadeSeconds);
    backgroundFade.parentElement!.querySelector<HTMLOutputElement>('output')!.value=`${settings.backgroundFadeSeconds.toFixed(1)} s`;
    for(const element of panel.querySelectorAll<HTMLElement>('.startupTransition-timeline, #cle-startupTransition-fit')) {
      (element.matches('.startupTransition-timeline')? element:element.closest<HTMLElement>('fieldset, .startupTransition-library')!).hidden=backgroundMode;
    }
    this.host.required<HTMLVideoElement>('.startupTransition-video-still').hidden=backgroundMode||!this.startupVideo;
    const status=this.host.required<HTMLElement>(".startupTransition-status");
    const button=this.host.required<HTMLButtonElement>(".startupTransition-enable");
    status.textContent=settings.enabled? "Enabled":"Disabled";
    status.dataset.enabled=String(settings.enabled);
    button.textContent=settings.enabled? "Disable":"Enable";
    button.dataset.enabled=String(settings.enabled);
    button.disabled=this.startupTransitionPending;
    button.setAttribute("aria-pressed",String(settings.enabled));
    button.setAttribute("aria-label",`${settings.enabled? "Disable":"Enable"} Codex Startup Transition`);
    for(const input of this.host.shadow.querySelectorAll<HTMLInputElement>("[data-startup-transition-setting]")) {
      const key=input.dataset.startupTransitionSetting as keyof Pick<StartupTransitionSettings,"minimumVisiblePercent"|"fadePercent"|"playbackRate"|"videoBrightness">;
      input.value=String(settings[key]);
      const output=input.parentElement?.querySelector<HTMLOutputElement>("output");
      if(output) output.value=key==="playbackRate"? `${settings[key].toFixed(2)}×`
        :key==="videoBrightness"? `${Math.round(settings[key]*100)}%`
          :`${settings[key]}%`;
    }
    this.host.required<HTMLSelectElement>("#cle-startupTransition-fit").value=settings.videoFit;
    this.host.backgroundPackageMarket?.queueRender();
    this.host.required<HTMLElement>('.startupTransition-library').hidden=backgroundMode;
    panel.querySelectorAll<HTMLElement>('.particle-settings-scroll > .startupTransition-parameter-grid').forEach(el => el.hidden=backgroundMode);
    this.host.required<HTMLButtonElement>('.startupTransition-reset').parentElement!.hidden=backgroundMode;
    if(backgroundMode) this.releaseStartupVideoPreview();
    const english=panel.dataset.language==="en";
    const timeline=this.host.required<HTMLElement>(".startupTransition-timeline");
    const geometry=startupTimelineGeometry(
      this.startupVideo? settings:{ ...settings,clipStart: 0,clipEnd: 5 },
      this.startupVideo?.duration??5,
    );
    timeline.dataset.hasVideo=String(Boolean(this.startupVideo));
    timeline.setAttribute("aria-label",english? "Video timeline":"视频时间轴");
    timeline.style.setProperty("--clip-start",`${geometry.startPercent}%`);
    timeline.style.setProperty("--clip-end",`${geometry.endPercent}%`);
    timeline.style.setProperty("--minimum-end",`${geometry.minimumPercent}%`);
    timeline.style.setProperty("--fade-start",`${geometry.earliestFadePercent}%`);
    timeline.style.setProperty("--fade-end",`${geometry.earliestFadeEndPercent}%`);
    this.host.required<HTMLOutputElement>(".startupTransition-timeline-range").value=this.startupVideo
      ? `${formatTimelineTime(geometry.clipStart)}–${formatTimelineTime(geometry.clipEnd)} · ${geometry.clipPlaybackSeconds.toFixed(1)} s`
      :(english? "No video selected":"未选择视频");
    const ruler=this.host.required<HTMLElement>(".startupTransition-timeline-ruler");
    for(const [index,tick] of Array.from(ruler.children).entries()) {
      tick.textContent=formatTimelineTime(geometry.duration*index/4);
    }
    for(const handle of timeline.querySelectorAll<HTMLElement>("[data-startup-timeline-edge]")) {
      const start=handle.dataset.startupTimelineEdge==="start";
      const seconds=start? geometry.clipStart:geometry.clipEnd;
      handle.hidden=!this.startupVideo;
      handle.style.left=`${start? geometry.startPercent:geometry.endPercent}%`;
      handle.setAttribute("aria-label",start? (english? "Clip start":"片段起点"):(english? "Clip end":"片段终点"));
      handle.setAttribute("aria-valuemin",String(start? 0:geometry.clipStart+0.1));
      handle.setAttribute("aria-valuemax",String(start? geometry.clipEnd-0.1:geometry.duration));
      handle.setAttribute("aria-valuenow",String(seconds));
      handle.setAttribute("aria-valuetext",`${formatTimelineTime(seconds)} (${seconds.toFixed(1)} s)`);
    }
    const playhead=this.host.required<HTMLElement>(".startupTransition-timeline-playhead");
    playhead.hidden=!this.startupVideo||this.startupTimelineScrubTime===undefined;
    if(this.startupTimelineScrubTime!==undefined) {
      playhead.style.left=`${Math.max(0,Math.min(100,this.startupTimelineScrubTime/geometry.duration*100))}%`;
    }
    const relative=english? "from clip start":"从裁剪起点计时";
    for(const [selector,text] of [
      [".startupTransition-timeline-minimum",`${english? "Minimum display":"最短显示"}: ${settings.minimumVisiblePercent}% · ${relative}`],
      [".startupTransition-timeline-fade",`${english? "Fade duration (starts when ready); clip-tail preview":"淡出时长（就绪后开始）；片段末尾预览"}: ${settings.fadePercent}% · ${formatTimelineTime(geometry.clipStart+geometry.earliestFadePercent/100*(geometry.clipEnd-geometry.clipStart))}–${formatTimelineTime(geometry.clipEnd)}`],
    ] as const) {
      const marker=this.host.required<HTMLElement>(selector);
      marker.title=text; marker.setAttribute("aria-label",text);
    }
    const still=this.host.required<HTMLVideoElement>(".startupTransition-video-still");
    still.playbackRate=settings.playbackRate;
    if(!this.startupCinema&&this.startupVideo&&!backgroundMode&&panel.matches(':popover-open')) this.startupCinema=attachStartupCinema(still,this.host.required<HTMLElement>('.legacy-startup-workspace .startupTransition-preview-stage'));
    this.startupCinema?.update(backgroundMode? 'cover':settings.videoFit,settings.videoBrightness,this.startupPreviewFadeOpacity);
    still.style.opacity=String(this.startupPreviewFadeOpacity);
    this.startupCinema?.setOpacity(this.startupPreviewFadeOpacity);
    still.style.filter=`brightness(${settings.videoBrightness})`;
    this.renderStartupTransport();
    for(const button of this.host.shadow.querySelectorAll<HTMLButtonElement>(".startupTransition-transport button")) button.disabled=!this.startupVideo||this.startupVideoPending;
    const addCard=this.host.shadow.querySelector<HTMLButtonElement>('.startupTransition-add-card');
    if(addCard) addCard.disabled=this.startupVideoPending||this.startupVideos.length>=32;
    const info=this.host.required<HTMLElement>(".startupTransition-video-info");
    info.toggleAttribute("data-i18n-skip",Boolean(this.startupVideo&&!this.startupVideoPending));
    info.textContent=this.startupVideoPending? (panel.dataset.language==="en"? "Saving video…":"正在保存视频…")
      :this.startupVideo? `${this.startupVideo.name} · ${(this.startupVideo.size/1048576).toFixed(1)} MB · ${this.startupVideo.duration.toFixed(1)} s`
        :(panel.dataset.language==="en"? "Choose a video first. No startup animation plays without a video.":"请先选择视频。未选择视频时不播放启动动画。");
  }
  setStartupVideo(video: StartupVideo|null): void {
    this.startupCinema?.dispose(); this.startupCinema=undefined;
    this.stopStartupPreview();
    this.startupTimelineFramesAbort?.abort();
    this.startupVideo=video;
    this.resetStartupPreviewTiming();
    this.startupTimelineScrubTime=video? startupTimelineGeometry(readStartupTransitionSettings(),video.duration).clipStart:undefined;
    const frames=this.host.shadow.querySelectorAll<HTMLElement>(".startupTransition-timeline-frame");
    for(const frame of frames) frame.style.backgroundImage="";
    if(video) {
      const abort=new AbortController();
      this.startupTimelineFramesAbort=abort;
      void sampleStartupVideoFrames(video,abort.signal,frames.length).then((images) => {
        if(abort.signal.aborted||this.startupVideo!==video) return;
        for(const [index,frame] of Array.from(frames).entries()) {
          frame.style.backgroundImage=images[index]? `url("${images[index]}")`:"";
        }
      }).catch(() => { /* The trim handles remain usable without thumbnails. */ });
    } else {
      this.startupTimelineFramesAbort=undefined;
    }
    if(this.startupStillUrl) URL.revokeObjectURL(this.startupStillUrl);
    this.startupStillUrl=video? URL.createObjectURL(video.blob):undefined;
    const still=this.host.required<HTMLVideoElement>(".startupTransition-video-still");
    still.pause();
    still.hidden=!video;
    if(this.startupStillUrl) {
      still.src=this.startupStillUrl;
      still.onloadedmetadata=() => {
        still.currentTime=Math.min(this.startupTimelineScrubTime??readStartupTransitionSettings().clipStart,Math.max(0,still.duration-0.01));
      };
    } else {
      still.removeAttribute("src");
      still.load();
    }
    this.renderStartupTransition();
  }
  releaseStartupVideoPreview(): void {
    this.startupTimelineFramesAbort?.abort(); this.startupTimelineFramesAbort=undefined;
    this.startupCinema?.dispose(); this.startupCinema=undefined;
    const still=this.host.shadow.querySelector<HTMLVideoElement>('.startupTransition-video-still');
    if(still?.hasAttribute('src')) { still.pause(); still.onloadedmetadata=null; still.removeAttribute('src'); still.load(); }
    if(this.startupStillUrl) URL.revokeObjectURL(this.startupStillUrl);
    this.startupStillUrl=undefined;
    this.startupLibraryUrls.forEach(url => URL.revokeObjectURL(url)); this.startupLibraryUrls=[];
  }
  async loadStartupVideoForPanel(): Promise<void> {
    const generation=++this.startupVideoGeneration;
    const settings=readStartupTransitionSettings();
    if(settings.source!=='video') { this.renderStartupTransition(); return; }
    try {
      const records=await listStartupVideos();
      const current=readStartupTransitionSettings();
      if(!this.host.connected||generation!==this.startupVideoGeneration||current.source!=='video'||!this.host.shadow.querySelector('#cle-startupTransition-settings')?.matches(':popover-open')) return;
      this.startupVideos=records;
      const video=records.find(v => v.id===current.selectedVideoId)??records[0]??null;
      const next=video? settingsForStartupVideo(current,video.id,video.duration):current;
      if(!writeStartupTransitionSettings({ ...next,videoOrder: records.map(v => v.id),selectedVideoId: video?.id??'',nextVideoId: records.some(v => v.id===current.nextVideoId)? current.nextVideoId:video?.id??'' })) throw new Error('Local preference unavailable');
      this.startupLibraryPage=Math.floor(Math.max(0,records.findIndex(v => v.id===video?.id))/2);
      this.setStartupVideo(video); this.renderStartupVideoLibrary();
    } catch(error) {
      recordCaughtRuntimeError('startup basic video load',error);
      if(this.host.connected&&generation===this.startupVideoGeneration) this.showStartupTransitionError(error);
    }
  }
  renderStartupVideoLibrary(): void {
    this.renderStartupExamplesControl();
    this.startupLibraryUrls.forEach(url => URL.revokeObjectURL(url)); this.startupLibraryUrls=[];
    const grid=this.host.required<HTMLElement>('.startupTransition-library-grid'); grid.replaceChildren();
    const panel=this.host.required<HTMLElement>('#cle-startupTransition-settings'),english=panel.dataset.language==='en';
    const summary=this.host.required<HTMLElement>('.startupTransition-library-summary');
    summary.textContent=`${(this.startupVideos.reduce((n,v) => n+v.size+(v.thumbnail?.size??0),0)/1048576).toFixed(1)}/512 MB`;
    const pages=Math.max(1,Math.ceil(this.startupVideos.length/2));
    this.startupLibraryPage=Math.max(0,Math.min(pages-1,this.startupLibraryPage));
    this.host.required<HTMLElement>('.startupTransition-library .startup-video-library-count').textContent=`${this.startupVideos.length} / 32`;
    this.host.required<HTMLOutputElement>('.startup-video-page').value=`${this.startupLibraryPage+1} / ${pages}`;
    this.host.required<HTMLButtonElement>('.startup-video-prev').disabled=this.startupLibraryPage===0;
    this.host.required<HTMLButtonElement>('.startup-video-next').disabled=this.startupLibraryPage>=pages-1;
    for(const [index,record] of Array.from(this.startupVideos.entries()).slice(this.startupLibraryPage*2,this.startupLibraryPage*2+2)) {
      const item=document.createElement('article'); item.className='particle-library-item'; item.classList.toggle('is-selected',this.startupVideo?.id===record.id);
      const select=document.createElement('button'); select.type='button'; select.className='particle-library-select'; select.disabled=this.startupVideoPending; select.setAttribute('aria-pressed',String(this.startupVideo?.id===record.id)); select.title=record.name; select.dataset.startupVideoId=record.id;
      const thumb=document.createElement(record.thumbnail? 'img':'span'); thumb.className='particle-library-thumb';
      if(thumb instanceof HTMLImageElement) { thumb.alt=''; thumb.src=URL.createObjectURL(record.thumbnail!); this.startupLibraryUrls.push(thumb.src); } else { thumb.innerHTML=icons.preview; thumb.setAttribute('aria-hidden','true'); }
      const name=document.createElement('span'); name.className='particle-library-name'; name.textContent=`${record.name} · ${record.duration.toFixed(1)} s`; select.append(thumb,name); item.append(select);
      const badge=document.createElement('span'); badge.className='particle-library-order'; badge.textContent=String(index+1); item.append(badge);
      if(this.startupVideo?.id===record.id) { const live=document.createElement('span'); live.className='particle-library-live'; live.textContent=english? 'CURRENT':'当前'; item.append(live); }
      select.addEventListener('click',() => { if(this.startupVideoPending) return; this.startupVideoGeneration++; const s=readStartupTransitionSettings(); writeStartupTransitionSettings({ ...settingsForStartupVideo(s,record.id,record.duration),nextVideoId: record.id }); this.setStartupVideo(record); this.renderStartupVideoLibrary(); runtimeEvent('startup-animation','library selection','changed',{ videoId: record.id }); });
      const remove=document.createElement('button'); remove.type='button'; remove.className='particle-library-delete'; remove.innerHTML=icons.close; remove.disabled=this.startupVideoPending; remove.setAttribute('aria-label',english? `Remove ${record.name}`:`移除 ${record.name}`); remove.addEventListener('click',() => { void this.removeStartupLibraryVideo(record.id); }); item.append(remove); grid.append(item);
    }
    const addItem=document.createElement('article'); addItem.className='particle-library-item startup-video-add-item';
    const add=document.createElement('button'); add.type='button'; add.className='particle-library-select startupTransition-add-card';
    const label=english? 'Add videos':'添加视频'; add.setAttribute('aria-label',label);
    add.disabled=this.startupVideoPending||this.startupVideos.length>=32;
    add.title=this.startupVideos.length>=32? (english? 'Video library limit: 32 videos':'视频素材库上限：32 个视频'):label;
    add.innerHTML='<span class="particle-library-thumb startup-video-add-preview" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="particle-library-name" aria-hidden="true">&nbsp;</span>';
    add.addEventListener('click',() => this.host.required<HTMLInputElement>('.startupTransition-file').click()); addItem.append(add); grid.append(addItem);
    this.positionStartupTransition();
  }
  renderStartupExamplesControl(): void {
    const button=this.host.shadow.querySelector<HTMLButtonElement>('.startup-examples-download');
    const bar=this.host.shadow.querySelector<HTMLElement>('.startup-examples-progress');
    if(!button||!bar) return;
    const progress=this.startupExamplesProgress;
    button.hidden=Boolean(progress); button.disabled=this.startupVideoPending||!this.host.bridge?.available;
    bar.hidden=!progress;
    if(progress) {
      const english=this.host.shadow.querySelector<HTMLElement>('#cle-startupTransition-settings')?.dataset.language==='en';
      const labels=english? { checking: 'Checking',connecting: 'Connecting',downloading: 'Downloading',verifying: 'Verifying',importing: 'Saving',complete: 'Done' }:{ checking: '检查',connecting: '连接中',downloading: '下载',verifying: '校验',importing: '保存',complete: '完成' };
      const waiting=progress.phase==='checking'||progress.phase==='connecting';
      if(waiting) bar.removeAttribute('aria-valuenow'); else bar.setAttribute('aria-valuenow',String(progress.percent));
      bar.setAttribute('aria-valuetext',labels[progress.phase]);
      this.host.required<HTMLElement>('.startup-examples-progress-fill').style.width=progress.percent+'%';
      this.host.required<HTMLElement>('.startup-examples-progress-label').textContent=waiting? `${labels[progress.phase]}…`:`${labels[progress.phase]} ${progress.percent}%`;
      bar.title=`${labels[progress.phase]} · ${progress.index}/${progress.total}`;
    }
  }
  async downloadStartupExamples(): Promise<void> {
    if(this.startupVideoPending||!this.host.bridge?.available) return;
    const bridge=this.host.bridge,controller=new AbortController(); this.startupExamplesAbort=controller;
    this.host.required<HTMLElement>('.startupTransition-error').hidden=true;
    this.startupVideoPending=true; this.startupExamplesProgress={ phase: 'checking',percent: 0,index: 0,total: 2 };
    this.renderStartupTransition(); this.renderStartupVideoLibrary();
    const active=() => this.host.connected&&this.startupExamplesAbort===controller&&!controller.signal.aborted&&this.host.bridge===bridge;
    try {
      const result=await downloadStartupExamples(bridge.request.bind(bridge),controller.signal,p => { if(active()) { this.startupExamplesProgress=p; this.renderStartupExamplesControl(); } },async video => {
        if(!active()) return;
        const current=readStartupTransitionSettings();
        const profileSettings=settingsForStartupVideo(current,video.id,video.duration);
        const next=current.selectedVideoId? current:profileSettings;
        if(!writeStartupTransitionSettings({ ...next,videoOrder: [...new Set([...current.videoOrder,video.id])],videoProfiles: { ...current.videoProfiles,[video.id]: startupVideoProfile(profileSettings) } })) throw new Error('Example video was saved, but its preferences could not be saved');
        if(getBootstrapConfig().centralizedStorage) await flushStartupVideoPersistence();
      });
      if(active()) {
        this.host.showActionNotice(this.host.required<HTMLElement>('#cle-startupTransition-settings').dataset.language==='en'? (result.alreadyDownloaded? 'Examples already downloaded':'Examples downloaded'):(result.alreadyDownloaded? '示例已下载':'示例下载完成'));
        if(result.added) await this.loadStartupVideoForPanel();
      }
    } catch(error) {
      if(error instanceof DOMException&&error.name==='AbortError') { runtimeEvent('startup-examples','panel import','cancelled',{ cachedDownloadsMayFinish: true }); }
      else { recordCaughtRuntimeError('startup examples download/import',error); if(active()) this.showStartupTransitionError(error); }
    } finally {
      if(this.startupExamplesAbort===controller) { this.startupExamplesAbort=undefined; this.startupExamplesProgress=undefined; this.startupVideoPending=false; if(this.host.connected) { this.renderStartupTransition(); this.renderStartupVideoLibrary(); } }
    }
  }
  async removeStartupLibraryVideo(id: string): Promise<void> {
    if(this.startupVideoPending) return;
    const generation=++this.startupVideoGeneration; this.startupVideoPending=true; this.renderStartupTransition(); this.renderStartupVideoLibrary();
    try {
await removeStartupVideo(id); const s=readStartupTransitionSettings(); const remaining=this.startupVideos.filter(v => v.id!==id); const selected=remaining.find(v => v.id===s.selectedVideoId)??remaining[0]; const profiles={ ...s.videoProfiles }; delete profiles[id];
      writeStartupTransitionSettings({ ...s,...(selected? settingsForStartupVideo({ ...s,videoProfiles: profiles },selected.id,selected.duration):{}),selectedVideoId: selected?.id??'',videoProfiles: profiles,videoOrder: remaining.map(v => v.id),nextVideoId: remaining.some(v => v.id===s.nextVideoId)? s.nextVideoId:selected?.id??'' });
      runtimeEvent('startup-animation','library remove','passed',{ videoId: id,remainingCount: remaining.length }); if(this.host.connected&&generation===this.startupVideoGeneration) await this.loadStartupVideoForPanel();
    } catch(error) { recordCaughtRuntimeError('startup video remove',error); this.showStartupTransitionError(error); }
    finally { this.startupVideoPending=false; if(this.host.connected&&this.host.shadow.querySelector("#cle-startupTransition-settings")?.matches(":popover-open")) { this.renderStartupTransition(); this.renderStartupVideoLibrary(); } }
  }
  showStartupTransitionError(error: unknown): void {
    const message=this.host.required<HTMLElement>(".startupTransition-error");
    message.hidden=false;
    message.textContent=error instanceof Error? error.message:String(error);
  }
  stopStartupPreview(): void {
    this.startupBackgroundPreview?.dispose(); this.startupBackgroundPreview=undefined; this.startupBackgroundPreviewId=undefined;
    this.startupPlaybackGeneration+=1;
    if(this.startupPlaybackFrame!==undefined) cancelAnimationFrame(this.startupPlaybackFrame);
    this.startupPlaybackFrame=undefined;
    this.host.shadow.querySelector<HTMLVideoElement>(".startupTransition-video-still")?.pause();
    this.startupPlaybackRunning=false;
    this.renderStartupTransport();
  }
  updateStartupPlayhead(seconds: number): void {
    if(!this.startupVideo) return;
    this.startupTimelineScrubTime=seconds;
    const playhead=this.host.required<HTMLElement>(".startupTransition-timeline-playhead");
    playhead.hidden=false;
    playhead.style.left=`${Math.max(0,Math.min(100,seconds/this.startupVideo.duration*100))}%`;
  }
  renderStartupTransport(): void {
    const panel=this.host.shadow.querySelector<HTMLElement>("#cle-startupTransition-settings");
    const button=this.host.shadow.querySelector<HTMLButtonElement>(".startupTransition-play");
    if(!panel||!button) return;
    const english=panel.dataset.language==="en";
    const label=this.startupPlaybackRunning? (english? "Pause (Space)":"暂停（空格）"):(english? "Play (Space)":"播放（空格）");
    button.dataset.playing=String(this.startupPlaybackRunning);
    button.setAttribute("aria-pressed",String(this.startupPlaybackRunning));
    button.setAttribute("aria-label",label); button.title=label;
    for(const [selector,zh,en] of [[".startupTransition-jump-start","到片段开头","Go to clip start"],[".startupTransition-jump-end","到片段末尾","Go to clip end"]] as const) {
      const edge=panel.querySelector<HTMLButtonElement>(selector);
      edge?.setAttribute("aria-label",english? en:zh);
      if(edge) edge.title=english? en:zh;
    }
  }
  resetStartupPreviewTiming(): void {
    this.startupPreviewElapsed=0;
    this.startupPreviewLeadIn=0;
    this.startupPreviewFadeOpacity=1;
    this.startupPreviewComplete=false;
  }
  toggleStartupPlayback(): void {
    if(readStartupTransitionSettings().source==='background') return;
    if(this.startupPlaybackRunning) { this.stopStartupPreview(); return; }
    this.playStartupVideo();
  }
  playStartupVideo(): void {
    this.stopStartupPreview();
    if(!this.startupVideo||this.startupVideoPending) return;
    const generation=this.startupPlaybackGeneration;
    const still=this.host.required<HTMLVideoElement>(".startupTransition-video-still");
    const range=startupTimelineGeometry(readStartupTransitionSettings(),this.startupVideo.duration);
    let start=this.startupTimelineScrubTime??range.clipStart;
    if(this.startupPreviewComplete||start<range.clipStart||start>=range.clipEnd) {
      start=range.clipStart; this.resetStartupPreviewTiming();
    }
    if(this.startupPreviewElapsed===0) {
      this.startupPreviewLeadIn=0;
    }
    still.style.opacity=String(this.startupPreviewFadeOpacity);
    this.startupCinema?.setOpacity(this.startupPreviewFadeOpacity);
    this.updateStartupPlayhead(start);
    this.startupPlaybackRunning=true;
    this.renderStartupTransport();
    this.host.required<HTMLElement>(".startupTransition-error").hidden=true;
    const play=async () => {
      if(generation!==this.startupPlaybackGeneration) return;
      still.currentTime=Math.min(start,Math.max(0,still.duration-0.01));
      still.playbackRate=readStartupTransitionSettings().playbackRate;
      try {
        let mediaStarted=this.startupPreviewElapsed>=this.startupPreviewLeadIn;
        if(mediaStarted) await still.play();
        if(generation!==this.startupPlaybackGeneration) return;
        let previous=performance.now();
        const tick=(now: number) => {
          if(generation!==this.startupPlaybackGeneration) return;
          this.startupPreviewElapsed+=now-previous; previous=now;
          const settings=readStartupTransitionSettings();
          if(!mediaStarted&&this.startupPreviewElapsed>=this.startupPreviewLeadIn) {
            mediaStarted=true;
            void still.play().catch((error) => {
              if(generation===this.startupPlaybackGeneration) { this.stopStartupPreview(); this.showStartupTransitionError(error); }
            });
          }
          const effectiveEnd=range.clipEnd;
          const ready=still.ended||still.currentTime>=effectiveEnd-0.01;
          this.startupPreviewFadeOpacity=clipFadeOpacity(still.currentTime,range.clipStart,effectiveEnd,(range.clipEnd-range.clipStart)/settings.playbackRate*1000*settings.fadePercent/100,settings.playbackRate);
          if(ready) {
            still.pause();
            still.currentTime=Math.min(effectiveEnd,Math.max(0,still.duration-0.01));
            this.startupPreviewFadeOpacity=0;
          }
          this.updateStartupPlayhead(ready? effectiveEnd:still.currentTime);
          still.style.opacity=String(this.startupPreviewFadeOpacity);
          this.startupCinema?.setOpacity(this.startupPreviewFadeOpacity);
          if(this.startupPreviewFadeOpacity===0) {
            this.startupPreviewComplete=true;
            this.stopStartupPreview();
            return;
          }
          this.startupPlaybackFrame=requestAnimationFrame(tick);
        };
        this.startupPlaybackFrame=requestAnimationFrame(tick);
      } catch(error) {
        recordCaughtRuntimeError("play",error);

        if(generation===this.startupPlaybackGeneration) { this.stopStartupPreview(); this.showStartupTransitionError(error); }
      }
    };
    if(still.readyState>=HTMLMediaElement.HAVE_METADATA) void play();
    else still.addEventListener("loadedmetadata",() => { void play(); },{ once: true });
  }
  async syncStartupTransitionNativePreference(bridge: WorkspaceBridge): Promise<void> {
    try {
      const native=await bridge.request<{ startupTransitionEnabled?: boolean }>("explorer.settings.get");
      if(this.host.bridge!==bridge) return;
      const enabled=readStartupTransitionSettings().enabled;
      if(native.startupTransitionEnabled!==enabled) {
        await bridge.request("explorer.settings.set",{ settings: { startupTransitionEnabled: enabled } });
      }
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("#syncStartupTransitionNativePreference",__codeCodexCaught);

      if(this.host.bridge===bridge) this.host.showActionNotice("Startup transition preference could not be synchronized","error");
    }
  }
  seekStartupTimeline(seconds: number): void {
    if(!this.startupVideo) return;
    const geometry=startupTimelineGeometry(readStartupTransitionSettings(),this.startupVideo.duration);
    const time=Math.max(0,Math.min(geometry.duration,seconds));
    this.stopStartupPreview();
    this.resetStartupPreviewTiming();
    this.startupTimelineScrubTime=time;
    this.startupPreviewFadeOpacity=clipFadeOpacity(time,geometry.clipStart,geometry.clipEnd,geometry.fadeMs,readStartupTransitionSettings().playbackRate);
    const still=this.host.required<HTMLVideoElement>(".startupTransition-video-still");
    if(still.readyState>=HTMLMediaElement.HAVE_METADATA) still.currentTime=Math.min(time,Math.max(0,still.duration-0.01));
    this.renderStartupTransition();
  }
  moveStartupTimelineBoundary(edge: "start"|"end",seconds: number): void {
    if(!this.startupVideo) return;
    const current=readStartupTransitionSettings();
    const range=moveTimelineBoundary(edge,seconds,current,this.startupVideo.duration);
    if(range.clipStart===current.clipStart&&range.clipEnd===current.clipEnd) return;
    if(!writeStartupTransitionSettings({ ...current,...range })) {
      this.showStartupTransitionError("Clip range could not be saved");
      return;
    }
    this.seekStartupTimeline(edge==="start"? range.clipStart:range.clipEnd-0.02);
  }
  bindStartupTransition(): void {
    if(this.startupTransitionEventsBound) return;
    this.startupTransitionEventsBound=true;
    const panel=this.host.required<HTMLElement>("#cle-startupTransition-settings");
    const trigger=this.host.required<HTMLButtonElement>(".startupTransition-settings-trigger");
    panel.addEventListener('startup-cinema-error',event => this.showStartupTransitionError((event as CustomEvent<string>).detail));
    const saveSource=() => {
      this.stopStartupPreview();
      const source=this.host.required<HTMLSelectElement>('#cle-startupTransition-source').value==='background'? 'background':'video';
      const backgroundId=this.host.required<HTMLSelectElement>('#cle-startupTransition-background').value;
      if(!writeStartupTransitionSettings({ ...readStartupTransitionSettings(),source,backgroundId })) this.host.showActionNotice('Startup transition setting could not be saved','error');
      runtimeEvent('startup-animation','source setting','changed',{ source,backgroundId });
      this.renderStartupTransition();
      void this.loadStartupVideoForPanel();
      // Source-specific controls change the open panel's height.
      this.positionStartupTransition();
    };
    for(const selector of ['#cle-startupTransition-source','#cle-startupTransition-background']) this.host.required<HTMLElement>(selector).addEventListener('change',saveSource);
    this.host.required<HTMLInputElement>('#cle-startupTransition-background-fade').addEventListener('input',event => {
      const backgroundFadeSeconds=Number((event.target as HTMLInputElement).value);
      if(!writeStartupTransitionSettings({ ...readStartupTransitionSettings(),backgroundFadeSeconds })) this.host.showActionNotice('Startup transition setting could not be saved','error');
      runtimeEvent('startup-animation','background fade setting','changed',{ backgroundFadeSeconds });
      this.renderStartupTransition();
    });
    this.host.required<HTMLButtonElement>(".startupTransition-enable").addEventListener("click",async () => {
      if(this.startupTransitionPending) return;
      const enabled=this.host.required<HTMLButtonElement>(".startupTransition-enable").getAttribute("aria-pressed")!=="true";
      this.startupTransitionPending=true;
      this.renderStartupTransition();
      const settings=readStartupTransitionSettings();
      try {
        await this.host.startupTransitionNativeSync;
        if(this.host.bridge?.available) {
          await this.host.bridge.request("explorer.settings.set",{ settings: { startupTransitionEnabled: enabled } });
        }
        if(!writeStartupTransitionSettings({ ...settings,enabled })) throw new Error("Local preference unavailable");
      } catch(__codeCodexCaught) {
        recordCaughtRuntimeError("#bindStartupTransition",__codeCodexCaught);

        this.host.showActionNotice("Startup transition setting could not be saved","error");
      } finally {
        this.startupTransitionPending=false;
        this.renderStartupTransition();
      }
    });
    trigger.addEventListener("click",() => {
      if(panel.matches(":popover-open")) { this.closeStartupTransition(); return; }
      // Normal clicks are loaded/replayed by the market's capture handler.
      // Keep stale/programmatic actions from opening an unavailable player.
      if(!startupTransitionModule()) {
        this.host.showActionNotice('Download Codex Startup Transition in Preview Market before opening its settings','error');
        return;
      }
      for(const other of this.host.shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) {
        if(other!==panel&&other.matches(":popover-open")) other.hidePopover();
      }
      this.renderStartupTransition(); panel.showPopover(); this.renderStartupTransition(); this.positionStartupTransition();
      trigger.setAttribute("aria-expanded","true");
      this.host.required<HTMLButtonElement>(".startupTransition-close").focus();
      void this.loadStartupVideoForPanel();
    });
    this.host.required<HTMLButtonElement>(".startupTransition-close").addEventListener("click",() => { this.closeStartupTransition(); trigger.focus(); });
    panel.addEventListener("keydown",(event) => {
      if(event.key==="Escape") { event.stopPropagation(); this.closeStartupTransition(); trigger.focus(); return; }
      const target=event.target as HTMLElement;
      if((event.code==="Space"||event.key===" ")&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!target.closest('textarea, select, [contenteditable="true"], input:not([type="range"])')) {
        event.preventDefault(); event.stopPropagation();
        if(!event.repeat) { this.toggleStartupPlayback(); }
      }
    });
    panel.addEventListener("toggle",() => {
      const open=panel.matches(":popover-open");
      trigger.setAttribute("aria-expanded",String(open));
      if(!open) {
this.stopStartupPreview();
        this.startupCinema?.dispose(); this.startupCinema=undefined; this.releaseStartupVideoPreview(); this.startupVideoGeneration++;
}
    });
    this.host.previewMarketPopover.addEventListener("scroll",() => this.positionStartupTransition());
    for(const input of panel.querySelectorAll<HTMLInputElement>("[data-startup-transition-setting]")) {
      input.addEventListener("input",() => {
        const key=input.dataset.startupTransitionSetting as keyof Pick<StartupTransitionSettings,"minimumVisiblePercent"|"fadePercent"|"playbackRate"|"videoBrightness">;
        const settings=readStartupTransitionSettings();
        if(!writeStartupTransitionSettings({ ...settings,[key]: Number(input.value) })) {
          this.host.showActionNotice("Startup transition setting could not be saved","error");
        }
        this.renderStartupTransition();
      });
    }
    this.host.required<HTMLSelectElement>("#cle-startupTransition-fit").addEventListener("change",(event) => {
      const value=(event.currentTarget as HTMLSelectElement).value;
      const fit=value==="contain"||value==="cinema"? value:"cover";
      writeStartupTransitionSettings({ ...readStartupTransitionSettings(),videoFit: fit });
      this.renderStartupTransition();
    });
    const timelineTrack=this.host.required<HTMLElement>(".startupTransition-timeline-track");
    const scrub=(event: PointerEvent) => {
      if(!this.startupVideo) return;
      const rect=timelineTrack.getBoundingClientRect();
      if(rect.width>0) this.seekStartupTimeline((event.clientX-rect.left)/rect.width*this.startupVideo.duration);
    };
    timelineTrack.addEventListener("pointerdown",(event) => {
      if(!this.startupVideo||event.button!==0||(event.target as Element).closest("[data-startup-timeline-edge]")) return;
      event.preventDefault();
      timelineTrack.setPointerCapture(event.pointerId);
      scrub(event);
    });
    timelineTrack.addEventListener("pointermove",(event) => {
      if(timelineTrack.hasPointerCapture(event.pointerId)) scrub(event);
    });
    for(const type of ["pointerup","pointercancel"] as const) {
      timelineTrack.addEventListener(type,(event) => {
        if(timelineTrack.hasPointerCapture(event.pointerId)) timelineTrack.releasePointerCapture(event.pointerId);
      });
    }
    for(const handle of panel.querySelectorAll<HTMLElement>("[data-startup-timeline-edge]")) {
      const edge=handle.dataset.startupTimelineEdge as "start"|"end";
      let grabOffset=0;
      handle.addEventListener("pointerdown",(event) => {
        if(!this.startupVideo||event.button!==0) return;
        event.preventDefault();
        grabOffset=event.clientX-(handle.getBoundingClientRect().left+handle.offsetWidth/2);
        handle.setPointerCapture(event.pointerId);
        this.seekStartupTimeline(edge==="start"? readStartupTransitionSettings().clipStart:readStartupTransitionSettings().clipEnd-0.02);
      });
      handle.addEventListener("pointermove",(event) => {
        if(!this.startupVideo||!handle.hasPointerCapture(event.pointerId)) return;
        const rect=timelineTrack.getBoundingClientRect();
        const time=(event.clientX-grabOffset-rect.left)/rect.width*this.startupVideo.duration;
        this.moveStartupTimelineBoundary(edge,time);
      });
      handle.addEventListener("pointerup",(event) => {
        if(handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      });
      handle.addEventListener("keydown",(event) => {
        if(!this.startupVideo) return;
        const current=readStartupTransitionSettings();
        const value=edge==="start"? current.clipStart:current.clipEnd;
        const step=event.shiftKey||event.key==="PageUp"||event.key==="PageDown"? 1:0.1;
        const next=event.key==="ArrowLeft"||event.key==="PageDown"? value-step
          :event.key==="ArrowRight"||event.key==="PageUp"? value+step
            :event.key==="Home"? 0:event.key==="End"? this.startupVideo.duration:undefined;
        if(next===undefined) return;
        event.preventDefault();
        this.moveStartupTimelineBoundary(edge,next);
      });
    }
    const fileInput=this.host.required<HTMLInputElement>(".startupTransition-file");
    this.host.required<HTMLButtonElement>('.startup-examples-download').addEventListener('click',() => { void this.downloadStartupExamples(); });
    fileInput.addEventListener("change",async () => {
      const files=Array.from(fileInput.files??[]); fileInput.value="";
      if(!files.length||this.startupVideoPending) return;
      const generation=++this.startupVideoGeneration; this.startupVideoPending=true;
      this.host.required<HTMLElement>(".startupTransition-error").hidden=true;
      this.renderStartupTransition(); this.renderStartupVideoLibrary();
      let added=0; let failure: unknown;
      for(const file of files) {
        if(!this.host.connected||generation!==this.startupVideoGeneration) break;
        try {
          const video=await saveStartupVideo(file); const current=readStartupTransitionSettings();
          const active=this.host.connected&&generation===this.startupVideoGeneration;
          const updated=active&&added===0? settingsForStartupVideo(current,video.id,video.duration):current;
          if(!writeStartupTransitionSettings({ ...updated,videoProfiles: { ...current.videoProfiles,[video.id]: startupVideoProfile(settingsForStartupVideo(current,video.id,video.duration)) },videoOrder: [...new Set([...current.videoOrder,video.id])],nextVideoId: active&&added===0? video.id:current.nextVideoId })) throw new Error("Video saved, but its settings could not be saved");
          added++;
        } catch(error) { failure=error; recordCaughtRuntimeError("startup video import",error); }
      }
      runtimeEvent('startup-animation','library import',failure? 'partial':'passed',{ added,requested: files.length });
      const active=this.host.connected&&generation===this.startupVideoGeneration;
      if(active) await this.loadStartupVideoForPanel();
      this.startupVideoPending=false;
      if(this.host.connected&&panel.matches(":popover-open")) { this.renderStartupTransition(); this.renderStartupVideoLibrary(); if(active&&failure) this.showStartupTransitionError(failure); }
    });
    for(const [selector,delta] of [['.startup-video-prev',-1],['.startup-video-next',1]] as const) this.host.required<HTMLButtonElement>(selector).addEventListener('click',() => { this.startupLibraryPage+=delta; this.renderStartupVideoLibrary(); });
    this.host.required<HTMLButtonElement>(".startupTransition-reset").addEventListener("click",() => {
      const settings=readStartupTransitionSettings();
      if(!writeStartupTransitionSettings({ ...settings,...DEFAULT_STARTUP_TRANSITION_SETTINGS,enabled: settings.enabled,selectedVideoId: settings.selectedVideoId,videoOrder: settings.videoOrder,videoProfiles: settings.videoProfiles,nextVideoId: settings.selectedVideoId,...startupDefaultClip(this.startupVideo?.duration) })) {
        this.host.showActionNotice("Startup transition setting could not be saved","error");
      }
      this.renderStartupTransition();
      this.stopStartupPreview();
      this.resetStartupPreviewTiming();
      if(this.startupVideo) this.seekStartupTimeline(readStartupTransitionSettings().clipStart);
    });
    this.host.required<HTMLButtonElement>(".startupTransition-play").addEventListener("click",() => this.toggleStartupPlayback());
    this.host.required<HTMLButtonElement>(".startupTransition-jump-start").addEventListener("click",() => {
      if(this.startupVideo) this.seekStartupTimeline(startupTimelineGeometry(readStartupTransitionSettings(),this.startupVideo.duration).clipStart);
    });
    this.host.required<HTMLButtonElement>(".startupTransition-jump-end").addEventListener("click",() => {
      if(this.startupVideo) this.seekStartupTimeline(startupTimelineGeometry(readStartupTransitionSettings(),this.startupVideo.duration).clipEnd);
    });
  }
}
