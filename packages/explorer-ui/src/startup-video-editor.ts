import { listStartupVideos, saveStartupVideo, removeStartupVideo, type StartupVideo } from './startup-transition-media';
import { readStartupTransitionSettings, writeStartupTransitionSettings, startupDefaultClip } from './startup-transition-settings';
import { CLIP_RANGES, CLIP_EFFECT_DEFAULTS, canPlaceClip, clipDuration, newStartupClip, projectDuration, type StartupClip, type StartupVideoProject } from './startup-video-project';
import { mountStartupVideoComposition } from './startup-video-compositor';
import { snapStartupClip } from './startup-video-snapping';
import { runtimeEvent } from './runtime-events';
import { formatTimelineTime, sampleStartupVideoFrames } from './startup-transition-timeline';

const CSS = `
.startup-video-editor:focus,.startup-video-editor:focus-visible{outline:none!important;border:0;box-shadow:none}
.startup-video-editor .se-editor-stack{display:grid;gap:12px}
.startup-video-editor .se-workspace{display:flex;flex-direction:column}
.startup-video-editor .se-monitor{flex:none;min-height:0;overflow:hidden}
.startup-video-editor .se-stage{isolation:isolate;contain:layout paint}
.startup-video-editor .se-timeline{flex:none;position:relative;isolation:isolate;contain:layout paint}

.startup-video-editor .se-stage-empty{position:absolute;inset:0;display:grid;place-items:center}
.startup-video-editor .se-body,.startup-video-editor .se-footer{display:grid;row-gap:6px}
.startup-video-editor .se-effect-name,.startup-video-editor .se-buttons,.startup-video-editor .se-divider{grid-column:1/-1}
.startup-video-editor .se-effect-name{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.startup-video-editor .se-timeline-scroll{overflow-x:auto;overflow-y:hidden}
.startup-video-editor .se-time-content{position:relative;min-width:100%}
.startup-video-editor .se-ruler{margin-left:51px}
.startup-video-editor .se-track{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center}
.startup-video-editor .se-track[data-active=true] .se-track-name{color:#b4e5cd}
.startup-video-editor .se-lane:focus-visible{outline:1px solid var(--cle-focus);outline-offset:-1px}
.startup-video-editor .se-track-name{display:grid;place-items:center}
.startup-video-editor .se-lane{cursor:crosshair}
.startup-video-editor .se-lane[data-drop-state=allowed]{outline:1px solid #9de5bd;outline-offset:-1px;background:#9de5bd18}
.startup-video-editor .se-lane[data-drop-state=blocked]{outline:1px solid #db9696;outline-offset:-1px;background:#db969618}
.startup-video-editor .se-clip{position:absolute;top:0;height:48px;min-width:4px;cursor:grab;touch-action:none}
.startup-video-editor .se-film-window{position:absolute;inset:0;overflow:hidden;border-radius:3px}
.startup-video-editor .se-clip-name{position:absolute;bottom:2px;left:8px;right:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
.startup-video-editor .se-trim[data-edge=in]{left:0}.startup-video-editor .se-trim[data-edge=out]{left:100%}
.startup-video-editor .se-clip:not([aria-selected=true]) .se-trim,.startup-video-editor .se-clip:not([aria-selected=true]) .startupTransition-timeline-selection{visibility:hidden}
.startup-video-editor .se-snap-line{position:absolute;top:17px;bottom:7px;width:1px;background:#9de5bd;pointer-events:none;z-index:5}
.startup-video-editor .se-playhead{top:17px;bottom:7px}
.startup-video-editor .se-timing{margin-left:51px}
.startup-video-editor .se-minimum{left:0}.startup-video-editor .se-fade{position:absolute}
`;
export function mountStartupVideoEditor(target: HTMLElement, language: 'zh' | 'en' = 'zh') {
  const host = document.createElement('div'); host.className = 'startup-video-editor';host.tabIndex=-1; target.append(host);
  const root = host;
  let english = language === 'en', media: StartupVideo[] = [], project: StartupVideoProject = { version: 1, tracks: [[], []] };
  let libraryPage=0;
  const frameImages=new Map<string,string[]>();const frameAbort=new AbortController();const requestedFrames=new Set<string>();let frameQueue=Promise.resolve();
  let selectedMedia = '', selectedClip = '', busy = false, disposed = false, zoom = 1, span = 5;
  let previewFailed=false, activeTrack=0;
  let clipboard:StartupClip|undefined;
  let player: ReturnType<typeof mountStartupVideoComposition> | undefined;
  const thumbnailUrls = new Map<string,string>();
  let timing=readStartupTransitionSettings();
  let mediaDefaults = timing.videoClipDefaults;
  const abort = new AbortController();
  const text = (zh: string, en: string) => english ? en : zh;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const effects = { scale: ['缩放 %', 'Scale %'], x: ['水平位置 %', 'Position X %'], y: ['垂直位置 %', 'Position Y %'], rotation: ['旋转 °', 'Rotation °'], opacity: ['透明度 %', 'Opacity %'], blur: ['模糊', 'Blur'], brightness: ['亮度 %', 'Brightness %'], contrast: ['对比度 %', 'Contrast %'], saturation: ['饱和度 %', 'Saturation %'], rate: ['播放速度 ×', 'Speed ×'] } as const;
  const effectValue=(key:string,value:number)=>key==='rate'?`${value.toFixed(2)}×`:key==='rotation'?`${value}°`:key==='blur'?`${value} px`:`${value}%`;
  let lastReportedError='';
  function message(value: string, error = false) {
    if(disposed)return;host.dataset.statusMessage=value;host.dataset.statusError=String(error);
    if(error&&value!==lastReportedError)runtimeEvent('startup-editor','operation','failed',{reason:value});
    lastReportedError=error?value:'';
  }
  function showSnap(time:number|null){const line=q<HTMLElement>('.se-snap-line');if(!line)return;line.hidden=time===null;if(time!==null)line.style.left=`calc(51px + (100% - 58px) * ${time/span})`;}

  function selected(): [number, StartupClip] | undefined {
    for (let t = 0; t < 2; t++) { const c = project.tracks[t]!.find(c => c.id === selectedClip); if (c) return [t, c]; }
    return undefined;
  }
  function editableClip(): StartupClip | undefined {
    const pair = selected(); if (pair) return pair[1];
    const m = media.find(m => m.id === selectedMedia); if (!m) return undefined;
    return mediaDefaults[m.id] ??= newStartupClip(m.id, m.duration);
  }
  function selectClip(id: string): void {
    selectedClip = id;
    const pair = selected();
    if (pair) {
      activeTrack=pair[0];selectedMedia = pair[1].videoId;
      if (player && (player.time < pair[1].start || player.time >= pair[1].start + clipDuration(pair[1]))) { player.pause(); player.seek(pair[1].start); }
    }
    libraryPage=Math.floor(Math.max(0,media.findIndex(m=>m.id===selectedMedia))/3);
    renderLibrary(); renderTimeline(false); renderInspector();host.focus({preventScroll:true});
    runtimeEvent('startup-editor','selection','changed',{kind:'clip',clipId:id,track:pair?pair[0]+1:null,videoId:pair?.[1].videoId});
  }
  function persist(action: string, previous?: StartupVideoProject) {
    const settings = readStartupTransitionSettings();
    if (!writeStartupTransitionSettings({ ...settings, project, videoClipDefaults:Object.fromEntries(Object.entries(mediaDefaults).filter(([id])=>media.some(m=>m.id===id))), selectedVideoId:media.some(m=>m.id===settings.selectedVideoId)?settings.selectedVideoId:media[0]?.id??'', nextVideoId:media.some(m=>m.id===settings.nextVideoId)?settings.nextVideoId:media[0]?.id??'', videoOrder: media.map(m => m.id) })) {
      project = previous ?? settings.project ?? project;
      mediaDefaults = settings.videoClipDefaults;
      player?.update(project); renderTimeline(); renderInspector();
      message(text('设置保存失败，请检查本地存储空间。', 'Settings could not be saved. Check local storage space.'), true);
      runtimeEvent('startup-editor', 'project save', 'failed', { action });
      return false;
    }
    runtimeEvent('startup-editor', action, 'saved', { clipCount: project.tracks.flat().length, duration: projectDuration(project),selectionKind:selected()?'clip':'media' });
    return true;
  }
  function updateVisibleThumbnail(id:string) {
    const button=Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-media]')).find(b=>b.dataset.media===id);
    const img=button?.querySelector<HTMLImageElement>('.particle-library-thumb');const url=thumbnailUrls.get(id)??frameImages.get(id)?.[0];
    if(img&&url)img.src=url;
  }
  function togglePlayback() {
    if(!player||previewFailed||!projectDuration(project)){runtimeEvent('startup-editor','transport','blocked',{reason:previewFailed?'preview failed':'empty project'});return;}
    const action=player.playing?'pause':'play';action==='pause'?player.pause():player.play();
    runtimeEvent('startup-editor','transport',action==='pause'?'paused':'playing',{action,time:player.time});
  }
  function requestFrames() {
    for(const id of new Set(project.tracks.flat().map(c=>c.videoId))){
      const m=media.find(m=>m.id===id);if(!m||requestedFrames.has(id))continue;requestedFrames.add(id);
      frameQueue=frameQueue.then(async()=>{if(disposed)return;try{const images=await sampleStartupVideoFrames(m,frameAbort.signal,7);if(!disposed){frameImages.set(id,images);updateVisibleThumbnail(id);renderTimeline(false);}}catch{/* Existing thumbnail/trim controls remain usable. */}});
    }
  }
  function rebuildPlayer(time = player?.time ?? 0) {
    player?.dispose();previewFailed=false;
    player = mountStartupVideoComposition(q('.se-stage'), project, media, { onTime: updateTime, onError: (value, clip) => {
      previewFailed=true;updateTime(player?.time??0,false);message(value, true); runtimeEvent('startup-editor', 'composition', 'failed', { reason: value, clipId: clip?.id, videoId: clip?.videoId });
    } });
    player.seek(time);
    q<HTMLElement>('.se-stage-empty').hidden = project.tracks.flat().length > 0;
  }
  function updateTime(time: number, playing: boolean) {
    if (disposed || !q('.se-time')) return;
    q<HTMLOutputElement>('.se-time').value = `${formatTimelineTime(time)} / ${formatTimelineTime(projectDuration(project))}`;
    const head = q<HTMLElement>('.se-playhead'); head.style.left = `calc(44px + (100% - 44px) * ${time / span})`;
    q('.se-play-icon').toggleAttribute('hidden',playing);
    q('.se-pause-icon').toggleAttribute('hidden',!playing);
    const playable=!previewFailed&&projectDuration(project)>0&&project.tracks.flat().every(c=>media.some(m=>m.id===c.videoId));
    for(const button of root.querySelectorAll<HTMLButtonElement>('.se-transport button'))button.disabled=!playable;
    q('[data-action=play]').setAttribute('aria-pressed', String(playing));
    q('[data-action=play]').setAttribute('aria-label', text(playing ? '暂停' : '播放', playing ? 'Pause' : 'Play'));
    const duration = projectDuration(project), fade = duration * timing.fadePercent / 100;
    q<HTMLElement>('.se-stage').style.opacity = String(playing && fade > 0 ? Math.max(0, Math.min(1, (duration - time) / fade)) : 1);
  }
  function renderTimeline(rescale = true) {
    updateActiveTrack(activeTrack);
    if (rescale) span = Math.max(.1, projectDuration(project), ...media.filter(m=>project.tracks.flat().some(c=>c.videoId===m.id)).map(m=>m.duration));
    q<HTMLElement>('.se-time-content').style.width = `${zoom * 100}%`;
    const ruler = q('.se-ruler'); ruler.replaceChildren();
    for (let i = 0; i <= 4; i++) { const label = document.createElement('span'); label.textContent = formatTimelineTime(i / 4 * span); ruler.append(label); }
    for (let track = 0; track < 2; track++) {
      const lane = q<HTMLElement>(`.se-track[data-track="${track}"] .se-lane`); lane.replaceChildren();
      for (const c of project.tracks[track]!) {
        const block = document.createElement('div'); block.className = 'se-clip'; block.dataset.clip = c.id; block.tabIndex = 0; block.setAttribute('role', 'option'); block.setAttribute('aria-selected', String(c.id === selectedClip));
        block.style.left = `${c.start / span * 100}%`; block.style.width = `${clipDuration(c) / span * 100}%`;
        const m = media.find(m => m.id === c.videoId), name = document.createElement('span'); name.textContent = m?.name ?? text('素材缺失', 'Missing media'); block.title = `${name.textContent} · ${formatTimelineTime(c.start)}–${formatTimelineTime(c.start + clipDuration(c))}`;
        const film=document.createElement('div');film.className='se-film-window';
        const frames=document.createElement('div');frames.className='startupTransition-timeline-frames';
        for(let i=0;i<7;i++){const frame=document.createElement('span');frame.className='startupTransition-timeline-frame';const url=frameImages.get(c.videoId)?.[i]??thumbnailUrls.get(c.videoId);if(url)frame.style.backgroundImage=`url("${url}")`;frames.append(frame);}
        film.append(frames);block.append(film);
        const selection=document.createElement('div');selection.className='startupTransition-timeline-selection';selection.style.left='0';selection.style.right='0';block.append(selection);
        for (const edge of ['in', 'out']) { const handle = document.createElement('div'); handle.className = 'se-trim startupTransition-timeline-handle'; handle.dataset.edge = edge; handle.innerHTML='<span></span>';handle.title = text(edge === 'in' ? '裁剪入点' : '裁剪出点', edge === 'in' ? 'Trim in' : 'Trim out'); block.append(handle); }
        name.className='se-clip-name';
        block.append(name); lane.append(block);
      }
    }
    const s = readStartupTransitionSettings(), ratio = projectDuration(project) / span;
    q<HTMLElement>('.se-minimum').style.width = `${s.minimumVisiblePercent * ratio}%`;
    q<HTMLElement>('.se-minimum').title = text(`最短展示：合成长度的 ${s.minimumVisiblePercent}%`, `Minimum display: ${s.minimumVisiblePercent}% of the composition`);
    q<HTMLElement>('.se-fade').style.left = `${(100 - s.fadePercent) * ratio}%`;
    q<HTMLElement>('.se-fade').style.width = `${s.fadePercent * ratio}%`;
    q<HTMLElement>('.se-fade').title = text(`就绪后淡出：合成长度的 ${s.fadePercent}%`, `Ready fade: ${s.fadePercent}% of the composition`);
    updateTime(player?.time ?? 0, player?.playing ?? false);
  }
  function renderInspector() {
    const pair = selected(), c = editableClip();
    q<HTMLElement>('.se-effects').hidden = !c;
    q('.se-effect-name').textContent = c ? `${pair ? `V${pair[0]+1}` : text('素材','Media')} · ${media.find(m => m.id === c.videoId)?.name ?? c.videoId}` : '';
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-effect]')) { input.disabled = !c; const key = input.dataset.effect as keyof typeof CLIP_RANGES; input.value = String(c?.[key] ?? CLIP_EFFECT_DEFAULTS[key]);const output=input.parentElement!.querySelector('output');if(output)output.value=effectValue(key,Number(input.value)); }
    q<HTMLSelectElement>('.se-fit').disabled = !c; q<HTMLSelectElement>('.se-fit').value = c?.fit ?? 'contain';
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action=reset-effects],[data-action=reset-framing]')) button.disabled = !c;
  }
  function commitClip(next: StartupClip, action: string, rescale = true) {
    const pair = selected();
    if (!pair) {
      if (!canPlaceClip([],next) || next.out > (media.find(m=>m.id===next.videoId)?.duration??0)+.001) { message(text('裁剪范围超出源视频或小于 0.05 秒。','Trim exceeds the source or is shorter than 0.05 seconds.'),true);return false; }
      mediaDefaults={...mediaDefaults,[next.videoId]:{...next,start:0}};
      return !action || persist(action.replace('clip','media'));
    }
    if (!canPlaceClip(project.tracks[pair[0]]!, next) || next.out > (media.find(m => m.id === next.videoId)?.duration ?? 0) + .001) {
      message(text('片段不能重叠、超出源视频或小于 0.05 秒。', 'Clips cannot overlap, exceed their source or be shorter than 0.05 seconds.'), true); return false;
    }
    const previous = project; project = { version: 1, tracks: project.tracks.map((list, t) => t === pair[0] ? list.map(c => c.id === next.id ? next : c).sort((a, b) => a.start - b.start) : list) as StartupVideoProject['tracks'] };
    if (action && !persist(action, previous)) return false;
    player?.update(project); renderTimeline(rescale); return true;
  }
  function insert(track: number, start = player?.time ?? 0, snapping = true) {
    const m = media.find(m => m.id === selectedMedia); if (!m) return;
    if (project.tracks[track]!.length >= 16) { message(text('每条轨道最多 16 个片段。', 'Each track supports at most 16 clips.'), true); return; }
    let c:StartupClip = { ...(mediaDefaults[m.id] ?? newStartupClip(m.id, m.duration)), id:crypto.randomUUID(), start };
    if(snapping)c=snapStartupClip(c,project,track,{mode:'move',threshold:8*span/Math.max(1,q<HTMLElement>(`.se-track[data-track="${track}"] .se-lane`).clientWidth),playhead:player?.time??0,sourceDuration:m.duration}).clip;
    if (!canPlaceClip(project.tracks[track]!, c)) { runtimeEvent('startup-editor','clip placement','blocked',{track:track+1,reason:'occupied or out of bounds',videoId:c.videoId,start:c.start});message(text('目标轨道在这里已有片段。请先移动或裁剪它。', 'The destination track is occupied here. Move or trim that clip first.'), true); return; }
    const previous = project; project = { version: 1, tracks: project.tracks.map((list, t) => t === track ? [...list, c].sort((a, b) => a.start - b.start) : list) as StartupVideoProject['tracks'] };
    activeTrack=track;selectedClip = c.id; selectedMedia = c.videoId; if (!persist('clip insert', previous)) return;
    rebuildPlayer(); renderLibrary(); renderTimeline(); renderInspector();requestFrames(); message(text('已保存。V2 显示在 V1 上方。', 'Saved. V2 is composited above V1.'));
  }
  function renderLibrary() {
    for(const [id,url] of thumbnailUrls)if(!media.some(m=>m.id===id)){if(url.startsWith('blob:'))URL.revokeObjectURL(url);thumbnailUrls.delete(id);}
    const grid = q('.particle-library-grid'); grid.replaceChildren();
    const pages=Math.max(1,Math.ceil(media.length/3));libraryPage=Math.max(0,Math.min(pages-1,libraryPage));
    q<HTMLOutputElement>('.se-library-page').value=`${libraryPage+1} / ${pages}`;
    q<HTMLButtonElement>('[data-action=previous-page]').disabled=libraryPage===0;q<HTMLButtonElement>('[data-action=next-page]').disabled=libraryPage>=pages-1;
    q('.se-library-count').textContent=`${media.length} / 32`;
    for (const [i, m] of Array.from(media.entries()).slice(libraryPage*3,libraryPage*3+3)) {
      const item = document.createElement('article'); item.className = `particle-library-item${m.id === selectedMedia ? ' is-selected' : ''}`;
      const button = document.createElement('button'); button.className = 'particle-library-select'; button.type = 'button'; button.dataset.media = m.id; button.draggable = true; button.title = m.name; button.disabled = busy; button.setAttribute('aria-pressed', String(m.id === selectedMedia));
      const img = document.createElement('img'); img.className = 'particle-library-thumb'; img.alt = ''; img.draggable = false; if(thumbnailUrls.has(m.id))img.src=thumbnailUrls.get(m.id)!;else if(frameImages.get(m.id)?.[0])img.src=frameImages.get(m.id)![0]!; if (m.thumbnail) { if(!thumbnailUrls.has(m.id))thumbnailUrls.set(m.id,URL.createObjectURL(m.thumbnail));img.src=thumbnailUrls.get(m.id)!; }
      const name = document.createElement('span'); name.className = 'particle-library-name'; name.textContent = `${m.name} · ${m.duration.toFixed(1)} s`;
      button.append(img, name); item.append(button);
      if(m.id===selectedMedia){const current=document.createElement('span');current.className='particle-library-live';current.textContent=text('当前','CURRENT');item.append(current);}
      const order = document.createElement('span'); order.className = 'particle-library-order'; order.textContent = String(i + 1); item.append(order);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'particle-library-delete'; remove.dataset.removeMedia = m.id; remove.textContent = '×'; remove.disabled = busy; remove.setAttribute('aria-label', text(`移除 ${m.name}`, `Remove ${m.name}`)); item.append(remove); grid.append(item);
    }
    q('.se-summary').textContent = `${(media.reduce((n, m) => n + m.size + (m.thumbnail?.size ?? 0), 0) / 1048576).toFixed(1)}/512 MB`;
    q<HTMLButtonElement>('[data-action=import]').disabled = busy;
  }
  function layout() {
    const t = (zh: string, en: string) => text(zh, en);
    root.innerHTML = `<style>${CSS}</style><div class="se-editor-stack"><div class="se-workspace startupTransition-preview-workspace">
      <section class="se-panel se-monitor"><div class="se-monitor-body"><div class="se-stage startupTransition-preview-stage"><div class="se-stage-empty">${t('将素材拖到 V1 或 V2', 'Drag a video onto V1 or V2')}</div></div></div></section>
      <section class="se-timeline startupTransition-timeline"><div class="se-transport-row startupTransition-timeline-heading"><strong>${t('视频时间轴', 'Video timeline')}</strong><div class="se-transport startupTransition-transport"><button data-action="start" aria-label="${t('到开头', 'Go to start')}"><svg viewBox="0 0 24 24"><path d="M5 5v14M18 5l-9 7 9 7z"/></svg></button><button data-action="play" aria-pressed="false"><svg class="se-play-icon" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg><svg class="se-pause-icon" viewBox="0 0 24 24" hidden><path d="M8 5v14M16 5v14"/></svg></button><button data-action="end" aria-label="${t('到结尾', 'Go to end')}"><svg viewBox="0 0 24 24"><path d="M19 5v14M6 5l9 7-9 7z"/></svg></button></div><output class="se-time"></output></div>
      <div class="se-timeline-scroll"><div class="se-time-content"><div class="se-ruler startupTransition-timeline-ruler"></div>${[1, 0].map(track => `<div class="se-track" data-track="${track}"><div class="se-track-name">V${track + 1}</div><div class="se-lane startupTransition-timeline-track" tabindex="0" role="listbox" aria-label="V${track + 1}"></div></div>`).join('')}<div class="se-playhead startupTransition-timeline-playhead"></div><div class="se-snap-line" hidden></div><div class="se-timing startupTransition-timeline-timing-track"><span class="se-minimum startupTransition-timeline-minimum"></span><span class="se-fade startupTransition-timeline-fade"></span></div></div></div>
      </section></div>
      <section class="particle-settings-group particle-source-details startup-video-library se-materials" open><header class="se-heading particle-source-summary">${t('视频素材库', 'Video library')}<span class="startup-video-library-count particle-source-count se-library-count"></span></header>
      <div class="particle-library-toolbar"><button class="particle-library-add" data-action="import">${t('添加视频', 'Add videos')}</button><input class="se-file" type="file" accept="video/*" multiple hidden><span class="se-summary startup-video-library-summary"></span></div><div class="particle-library-grid"></div>
      <div class="startup-video-pager"><button class="particle-library-clear" data-action="previous-page" aria-label="${t('上一页','Previous page')}">‹</button><output class="se-library-page"></output><button class="particle-library-clear" data-action="next-page" aria-label="${t('下一页','Next page')}">›</button></div></section>
      <fieldset class="particle-settings-group se-effects"><legend class="se-heading">${t('视频属性', 'Video properties')}</legend><div class="se-body startupTransition-parameter-grid"><p class="se-effect-name"></p>
      ${Object.entries(effects).map(([key, labels]) => { const r = CLIP_RANGES[key as keyof typeof CLIP_RANGES]; return `<div class="particle-control-row"><label>${t(labels[0].replace(/ [%×°]$/,''), labels[1].replace(/ [%×°]$/,''))}</label><input type="range" data-effect="${key}" min="${r[0]}" max="${r[1]}" step="${r[2]}"><span class="particle-control-value"><output></output></span></div>`; }).join('')}
      <div class="particle-control-row"><label>${t('画面适配', 'Fit')}</label><select class="se-fit"><option value="contain">${t('完整显示', 'Contain')}</option><option value="cover">${t('铺满画面', 'Cover')}</option></select></div><div class="startupTransition-media-actions"><button data-action="reset-framing">${t('恢复完整画面', 'Restore full frame')}</button><button data-action="reset-effects">${t('重置效果', 'Reset effects')}</button></div></div></fieldset>
      <fieldset class="particle-settings-group se-timing-settings"><legend class="se-heading">${t('播放时长', 'Timing')}</legend><div class="se-footer startupTransition-parameter-grid">${(['minimumVisiblePercent', 'fadePercent'] as const).map((key, i) => `<div class="particle-control-row"><label>${t(['最短展示', '就绪后淡出'][i]!, ['Minimum display', 'Ready fade'][i]!)}</label><input type="range" data-timing="${key}" min="0" max="100" step="1" value="${readStartupTransitionSettings()[key]}"><span class="particle-control-value"><output>${readStartupTransitionSettings()[key]}%</output></span></div>`).join('')}</div></fieldset>
      </div>`;
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.type='button');
    renderLibrary(); renderTimeline(); renderInspector(); rebuildPlayer();requestFrames();
  }
  async function load() {
    try {
      media = await listStartupVideos(); if (disposed) return;
      const s = readStartupTransitionSettings(); selectedMedia = media.find(m => m.id === selectedMedia || m.id === s.selectedVideoId)?.id ?? media[0]?.id ?? '';
      if (s.project) project = s.project;
      else {
        const m = media.find(m => m.id === selectedMedia);
        if (m) {
          const c = newStartupClip(m.id, m.duration), trim = s.selectedVideoId === m.id ? s : startupDefaultClip(m.duration);
          c.in = Math.min(trim.clipStart, Math.max(0, m.duration - .05)); c.out = Math.max(c.in + .05, Math.min(trim.clipEnd, m.duration)); c.rate = s.playbackRate; c.brightness = s.videoBrightness * 100; c.fit = s.videoFit === 'cover' ? 'cover' : 'contain';
          project = { version: 1, tracks: [[c], []] };
          if (s.videoFit === 'cinema') { project.tracks[1].push({ ...c, id: crypto.randomUUID() }); c.fit = 'cover'; c.scale = 112; c.blur = 30; c.brightness *= .5; }
          persist('legacy migration');
        }
      }
      libraryPage=Math.floor(Math.max(0,media.findIndex(m=>m.id===selectedMedia))/3);

      selectedClip ||= project.tracks.flat().find(c=>c.videoId===selectedMedia)?.id ?? project.tracks[1][0]?.id ?? project.tracks[0][0]?.id ?? '';
      const active=selected();if(active)selectedMedia=active[1].videoId;
      layout();
      for(const m of media.filter(m=>!m.thumbnail))void sampleStartupVideoFrames(m,abort.signal,1).then(frames=>{if(disposed||!frames[0])return;thumbnailUrls.set(m.id,frames[0]);updateVisibleThumbnail(m.id);renderTimeline(false);}).catch(()=>{});
      runtimeEvent('startup-editor', 'workspace', 'opened', { mediaCount: media.length, clipCount: project.tracks.flat().length });
    } catch (error) { message(String(error), true); runtimeEvent('startup-editor', 'library load', 'failed', { reason: String(error) }); }
  }
  root.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    if (button.dataset.media) { selectedMedia = button.dataset.media; const current=selected(); const c=current?.[1].videoId===selectedMedia?current[1]:project.tracks.flat().find(c=>c.videoId===selectedMedia); selectedClip=c?.id??'';runtimeEvent('startup-editor','selection','changed',{kind:c?'clip':'media',videoId:selectedMedia,clipId:c?.id}); renderLibrary();renderTimeline(false);renderInspector();host.focus({preventScroll:true});message(c?text('正在编辑选中片段的属性。','Editing the selected clip properties.'):text('正在编辑素材属性，插入轨道后生效。','Editing media defaults; applied when inserted into a track.'));return; }
    if (button.dataset.removeMedia) {
      const id = button.dataset.removeMedia;
      if (project.tracks.flat().some(c => c.videoId === id)) { message(text('素材正在时间轴中使用，请先删除对应片段。', 'This media is used in the timeline. Delete its clips first.'), true); return; }
      busy = true; renderLibrary();
      try { await removeStartupVideo(id); if (disposed) return; media = media.filter(m => m.id !== id); delete mediaDefaults[id];if(selectedMedia===id)selectedMedia=selected()?.[1].videoId??media[0]?.id??'';persist('media remove');renderInspector(); }
      catch (e) { message(String(e), true); runtimeEvent('startup-editor', 'media remove', 'failed', { reason: String(e) }); }
      finally { busy = false; if (!disposed) renderLibrary(); } return;
    }
    switch (button.dataset.action) {
      case 'previous-page': libraryPage--;renderLibrary();break;case 'next-page':libraryPage++;renderLibrary();break;
      case 'import': q<HTMLInputElement>('.se-file').click(); break;
      case 'reset-effects': { const c=editableClip();if(c){commitClip({...c,...CLIP_EFFECT_DEFAULTS},'effects reset');renderInspector();}break;}
      case 'reset-framing': { const c=editableClip();if(c){commitClip({...c,scale:100,x:0,y:0,rotation:0,fit:'contain'},'framing reset');renderInspector();}break;}
      case 'start': player?.pause(); player?.seek(0);runtimeEvent('startup-editor','transport','seeked',{action:'start',time:0}); break; case 'end': player?.pause(); player?.seek(projectDuration(project));runtimeEvent('startup-editor','transport','seeked',{action:'end',time:projectDuration(project)}); break;
      case 'play': togglePlayback(); break;
    }
  }, { signal: abort.signal });
  root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement, current = editableClip();
    if (input.dataset.effect && current) {
      const key = input.dataset.effect as keyof typeof CLIP_RANGES, r = CLIP_RANGES[key], value = Number(input.value);
      if (!Number.isFinite(value) || value < r[0] || value > r[1]) return;
      if (commitClip({ ...current, [key]: value }, '', false)) {
        const output=input.parentElement!.querySelector('output');if(output)output.value=effectValue(key,value);
        for (const sibling of root.querySelectorAll<HTMLInputElement>(`[data-effect="${key}"]`)) if (sibling !== input) sibling.value = input.value;
      }
    }
    if (input.dataset.timing) { const s = readStartupTransitionSettings(); const key = input.dataset.timing as 'minimumVisiblePercent' | 'fadePercent'; if (!writeStartupTransitionSettings({ ...s, [key]: Number(input.value) })) message(text('保存失败。', 'Save failed.'), true); timing=readStartupTransitionSettings(); input.parentElement!.querySelector('output')!.value = `${input.value}%`; renderTimeline(); }
    if (input.classList.contains('se-zoom-input')) { zoom = Number(input.value); renderTimeline(); }
  }, { signal: abort.signal });
  root.addEventListener('change', async event => {
    const input = event.target as HTMLInputElement, current = editableClip();
    if (input.dataset.effect) { persist('clip effect'); return; }
    if (input.classList.contains('se-fit') && current) { commitClip({ ...current, fit: input.value === 'cover' ? 'cover' : 'contain' }, 'clip fit'); return; }
    if (!input.classList.contains('se-file')) return;
    const files = Array.from(input.files ?? []); input.value = ''; if (!files.length || busy) return;
    busy = true; renderLibrary();
    let imported = 0;
    try { for (const file of files) { if (disposed) break; const m = await saveStartupVideo(file); imported++; if (disposed) break; media.push(m); selectedMedia = m.id;selectedClip='';libraryPage=Math.floor((media.length-1)/3);
 } }
    catch (e) { message(String(e), true); runtimeEvent('startup-editor', 'media import', 'failed', { imported, reason: String(e) }); }
    finally { busy = false; if (!disposed) { persist('media import'); renderLibrary();renderTimeline(false);renderInspector(); } }
  }, { signal: abort.signal });
  function removeSelected(action='clip remove') {
    const pair=selected();if(!pair)return false;const previous=project;
    project={version:1,tracks:project.tracks.map(list=>list.filter(c=>c.id!==pair[1].id)) as StartupVideoProject['tracks']};
    if(!persist(action,previous))return false;
    activeTrack=pair[0];selectedClip='';rebuildPlayer();renderTimeline();renderInspector();message(text('片段已移除，源视频保留在素材库。','Clip removed; source video retained in the library.'));return true;
  }
  function pasteClip() {
    if(!clipboard){message(text('请先复制或剪切一个轨道片段。','Copy or cut a timeline clip first.'),true);return;}
    if(!media.some(m=>m.id===clipboard!.videoId)){message(text('剪贴片段的源素材已移除。','Clipboard source media was removed.'),true);runtimeEvent('startup-editor','clip paste','blocked',{reason:'missing media'});return;}
    if(project.tracks[activeTrack]!.length>=16){message(text('每条轨道最多 16 个片段。','Each track supports at most 16 clips.'),true);return;}
    const c={...clipboard,id:crypto.randomUUID(),start:player?.time??0};
    if(!canPlaceClip(project.tracks[activeTrack]!,c)){message(text('目标位置已有片段或超出时长，请选择轨道和空闲位置。','Destination occupied or out of bounds. Choose a track and free position.'),true);runtimeEvent('startup-editor','clip paste','blocked',{reason:'occupied or out of bounds',track:activeTrack+1,start:c.start});return;}
    const previous=project;project={version:1,tracks:project.tracks.map((list,t)=>t===activeTrack?[...list,c].sort((a,b)=>a.start-b.start):list) as StartupVideoProject['tracks']};
    if(!persist('clip paste',previous))return;
    selectedClip=c.id;selectedMedia=c.videoId;rebuildPlayer();renderLibrary();renderTimeline();renderInspector();requestFrames();
    message(text(`已粘贴到 V${activeTrack+1}。`,`Pasted into V${activeTrack+1}.`));
  }
  function updateActiveTrack(track:number){activeTrack=track;for(const el of root.querySelectorAll<HTMLElement>('.se-track'))el.dataset.active=String(Number(el.dataset.track)===track);}
  root.addEventListener('focusin',event=>{const track=(event.target as Element).closest<HTMLElement>('.se-track');if(track)updateActiveTrack(Number(track.dataset.track));},{signal:abort.signal});
  root.addEventListener('keydown', raw => {
    const event = raw as KeyboardEvent;
    const target=event.target as HTMLElement;
    if(target.isContentEditable||target.closest('input:not([type=range]),select,textarea,[contenteditable=true]'))return;
    const shortcut=(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&['c','v','x'].includes(event.key.toLowerCase());
    const deleting=!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&['Delete','Backspace'].includes(event.key);
    if(shortcut||deleting){event.preventDefault();event.stopPropagation();if(event.repeat||busy||drag)return;
      if(deleting){removeSelected();return;}
      const key=event.key.toLowerCase(),pair=selected();if(key==='v'){pasteClip();return;}
      if(!pair)return;const snapshot={...pair[1]};
      if(key==='c'||removeSelected('clip cut')){clipboard=snapshot;runtimeEvent('startup-editor','clip clipboard',key==='c'?'copied':'cut',{clipId:snapshot.id,videoId:snapshot.videoId,track:pair[0]+1});message(text(key==='c'?'已复制片段，选择轨道和位置后 Ctrl+V 粘贴。':'已剪切片段，选择轨道和位置后 Ctrl+V 粘贴。',key==='c'?'Clip copied. Choose a track and position, then Ctrl+V.':'Clip cut. Choose a track and position, then Ctrl+V.'));}return;
    }
    if(!busy&&event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&(event.code==='Digit1'||event.code==='Digit2')){event.preventDefault();event.stopPropagation();const card=(event.target as Element).closest<HTMLElement>('[data-media]');if(card)selectedMedia=card.dataset.media!;insert(event.code==='Digit1'?0:1,player?.time??0);return;}
    if(!busy&&event.altKey&&!event.ctrlKey&&!event.metaKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){const pair=selected();if(pair){event.preventDefault();event.stopPropagation();const track=event.key==='ArrowUp'?1:0;if(track!==pair[0])moveClip({...pair[1]},track,project,'clip track move');}return;}
    if (event.code === 'Space' && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); event.stopPropagation(); if(!event.repeat)togglePlayback(); }
    const block = (event.target as Element).closest<HTMLElement>('[data-clip]');
    if (block && (event.key === 'Enter' || event.key === ' ')) { selectClip(block.dataset.clip!); }
  }, { signal: abort.signal });
  let draggedMedia = '';
  const laneAt = (x: number, y: number) => Array.from(root.querySelectorAll<HTMLElement>('.se-lane')).find(lane => {
    const r = lane.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const clearDropTargets = () => {root.querySelectorAll<HTMLElement>('.se-lane').forEach(l=>delete l.dataset.dropState);showSnap(null);};
  function moveClip(next: StartupClip, track: number, original: StartupVideoProject, action = '') {
    const destination = original.tracks[track]!;
    const full=destination.filter(c=>c.id!==next.id).length>=16;
    if(full||!canPlaceClip(destination,next)){if(action){message(full?text('每条轨道最多 16 个片段。','Each track supports at most 16 clips.'):text('目标轨道在这里已有片段。','The destination track is occupied here.'),true);runtimeEvent('startup-editor','clip track move','blocked',{reason:full?'track full':'occupied or out of bounds',track:track+1,clipId:next.id});}return false;}
    project = {version:1,tracks:original.tracks.map((list,t) => {
      const remaining=list.filter(c=>c.id!==next.id); return t===track?[...remaining,next].sort((a,b)=>a.start-b.start):remaining;
    }) as StartupVideoProject['tracks']};
    if(action&&!persist(action,original))return false;
    activeTrack=track;player?.update(project);renderTimeline(false);renderInspector();return true;
  }
  root.addEventListener('dragstart', raw => {
    const event = raw as DragEvent, button = (event.target as Element).closest<HTMLButtonElement>('[data-media]');
    if(!button||button.disabled||busy){event.preventDefault();return;}
    // Drag the media card, not the browser's thumbnail file/URL. Keep the
    // private drag out of the file tree and the official application's handlers.
    event.stopPropagation();event.dataTransfer?.clearData();
    draggedMedia=button.dataset.media!;event.dataTransfer?.setData('application/x-codecodex-video',draggedMedia);
    if(event.dataTransfer)event.dataTransfer.effectAllowed='copy';
    runtimeEvent('startup-editor','media drag','started',{videoId:draggedMedia});
  }, {signal:abort.signal});
  root.addEventListener('dragover',raw=>{
    const event=raw as DragEvent,lane=laneAt(event.clientX,event.clientY);clearDropTargets();
    if(!Array.from(event.dataTransfer?.types??[]).includes('application/x-codecodex-video'))return;
    event.preventDefault();event.stopPropagation();
    if(!lane||busy){if(event.dataTransfer)event.dataTransfer.dropEffect='none';return;}
    const m=media.find(m=>m.id===draggedMedia),track=Number(lane.parentElement!.dataset.track),rect=lane.getBoundingClientRect();
    let candidate=m?{...(mediaDefaults[m.id]??newStartupClip(m.id,m.duration)),id:'',start:Math.max(0,(event.clientX-rect.left)/rect.width*span)}:undefined;
    if(candidate&&!event.shiftKey){const result=snapStartupClip(candidate,project,track,{mode:'move',threshold:8*span/Math.max(1,rect.width),playhead:player?.time??0,sourceDuration:m!.duration});candidate=result.clip;showSnap(result.time);}
    const allowed=!candidate||(project.tracks[track]!.length<16&&canPlaceClip(project.tracks[track]!,candidate));
    lane.dataset.dropState=allowed?'allowed':'blocked';if(event.dataTransfer)event.dataTransfer.dropEffect=allowed?'copy':'none';
  },{signal:abort.signal});
  root.addEventListener('dragleave',raw=>{if(!(raw as DragEvent).relatedTarget||!root.contains((raw as DragEvent).relatedTarget as Node))clearDropTargets();},{signal:abort.signal});
  root.addEventListener('dragend',raw=>{if(draggedMedia){raw.stopPropagation();runtimeEvent('startup-editor','media drag','ended',{videoId:draggedMedia,dropEffect:(raw as DragEvent).dataTransfer?.dropEffect??'none'});}draggedMedia='';clearDropTargets();},{signal:abort.signal});
  root.addEventListener('drop',raw=>{
    const event=raw as DragEvent,lane=laneAt(event.clientX,event.clientY),id=event.dataTransfer?.getData('application/x-codecodex-video');clearDropTargets();draggedMedia='';
    if(!id)return;event.preventDefault();event.stopPropagation();
    if(!lane){runtimeEvent('startup-editor','media drop','blocked',{reason:'outside tracks',videoId:id});return;}
    if(busy||!media.some(m=>m.id===id)){message(text('此素材暂不可拖入。','This media cannot be placed now.'),true);runtimeEvent('startup-editor','media drop','blocked',{reason:busy?'import busy':'unknown media'});return;}
    selectedMedia=id;const rect=lane.getBoundingClientRect(),track=Number(lane.parentElement!.dataset.track);
    insert(track,Math.max(0,(event.clientX-rect.left)/rect.width*span),!event.shiftKey);renderLibrary();
  },{signal:abort.signal});
  let drag: {pointer:number;lane:HTMLElement;originX:number;width:number;span:number;clip?:StartupClip;edge?:string|undefined;original:StartupVideoProject;changed:boolean;valid:boolean;track:number;snapTime:number|null} | undefined;
  root.addEventListener('pointerdown',raw=>{
    const event=raw as PointerEvent,lane=(event.target as Element).closest<HTMLElement>('.se-lane,.se-ruler');if(!lane||event.button!==0||busy)return;
    const block=(event.target as Element).closest<HTMLElement>('[data-clip]'),edge=(event.target as Element).closest<HTMLElement>('[data-edge]')?.dataset.edge;
    player?.pause();if(block)selectClip(block.dataset.clip!);else{if(lane.classList.contains('se-lane'))updateActiveTrack(Number(lane.parentElement!.dataset.track));host.focus({preventScroll:true});}
    const rect=lane.getBoundingClientRect();drag={pointer:event.pointerId,lane,originX:event.clientX,width:rect.width,span,original:project,changed:false,valid:true,snapTime:null,track:selected()?.[0]??0,...(block?{clip:{...selected()![1]},edge}: {})};
    lane.setPointerCapture(event.pointerId);event.preventDefault();if(!block)player?.seek(Math.max(0,(event.clientX-rect.left)/rect.width*span));
  },{signal:abort.signal});
  root.addEventListener('pointermove',raw=>{
    const event=raw as PointerEvent;if(!drag||event.pointerId!==drag.pointer)return;
    if(!drag.clip){const rect=drag.lane.getBoundingClientRect();player?.seek((event.clientX-rect.left)/rect.width*drag.span);return;}
    let c={...drag.clip};const delta=(event.clientX-drag.originX)/drag.width*drag.span;clearDropTargets();let snapped:number|null=null;const snap=(track:number,mode:'move'|'in'|'out')=>{if(event.shiftKey)return;const result=snapStartupClip(c,drag!.original,track,{mode,threshold:8*drag!.span/Math.max(1,drag!.width),playhead:player?.time??0,sourceDuration:media.find(m=>m.id===c.videoId)?.duration??0});c=result.clip;snapped=result.time;};
    if(drag.edge==='in'){const d=Math.max(-c.in/c.rate,Math.min(delta,clipDuration(c)-.05/c.rate));c.start+=d;c.in+=d*c.rate;snap(drag.track,'in');drag.valid=commitClip(c,'',false);}
    else if(drag.edge==='out'){c.out=Math.max(c.in+.05,c.out+delta*c.rate);snap(drag.track,'out');drag.valid=commitClip(c,'',false);}
    else {
      const lane=laneAt(event.clientX,event.clientY);c.start=Math.max(0,c.start+delta);
      const track=lane?Number(lane.parentElement!.dataset.track):-1;
      if(lane)snap(track,'move');drag.valid=!!lane&&moveClip(c,track,drag.original);
      if(lane)lane.dataset.dropState=drag.valid?'allowed':'blocked';
    }
    drag.snapTime=drag.valid?snapped:null;showSnap(drag.snapTime);drag.changed=drag.valid&&JSON.stringify(project)!==JSON.stringify(drag.original);if(drag.valid)renderInspector();
  },{signal:abort.signal});
  const endDrag=(raw:Event)=>{
    const event=raw as PointerEvent;if(!drag||event.pointerId!==drag.pointer)return;const current=drag;drag=undefined;clearDropTargets();showSnap(null);
    const cancelled=event.type==='pointercancel'||!current.valid;
    if(cancelled){project=current.original;player?.update(project);if(current.clip){message(text('未移动：目标轨道不可用或位置冲突，已保留原片段。','Move cancelled: destination unavailable or occupied. Original clip retained.'),true);runtimeEvent('startup-editor','timeline move','cancelled',{reason:event.type==='pointercancel'?'pointer cancelled':'invalid destination',clipId:current.clip.id});}}
    else if(current.changed){const saved=persist(selected()?.[0]!==current.track?'clip track move':'timeline edit',current.original);if(saved&&current.snapTime!==null)runtimeEvent('startup-editor','timeline snap','aligned',{time:current.snapTime,clipId:current.clip?.id,track:(selected()?.[0]??current.track)+1,edge:current.edge??'move'});}
    renderTimeline();renderInspector();
  };
  root.addEventListener('pointerup',endDrag,{signal:abort.signal});root.addEventListener('pointercancel',endDrag,{signal:abort.signal});
  layout(); void load();
  return {
    togglePlayback,
    setLanguage(next: 'zh' | 'en') { const value = next === 'en'; if (value !== english && !disposed) { english = value; const time = player?.time ?? 0; player?.dispose(); layout(); player?.seek(time); } },
    dispose() { if (disposed) return; disposed = true;clipboard=undefined; abort.abort();frameAbort.abort();frameImages.clear(); player?.dispose(); thumbnailUrls.forEach(url=>{if(url.startsWith('blob:'))URL.revokeObjectURL(url);}); thumbnailUrls.clear(); host.remove(); runtimeEvent('startup-editor', 'workspace', 'closed'); },
  };
}
