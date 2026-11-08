import { icons } from "./icons";

const STORAGE_KEY = "code-codex.surface-opacity.v1";
const ACTIVE_ATTRIBUTE = "data-code-codex-ui-mask-active";
const BACKGROUND_ATTRIBUTES = ["data-code-codex-transparent-background", "data-code-codex-particle-image-background", "data-code-codex-glow-horizon-background", "data-code-codex-custom-background"];
export const MASK_REGIONS = [
  {key:"navigation", zh:"最左侧导航栏", en:"Navigation rail", value:66},
  {key:"sidebar", zh:"任务与项目选择栏", en:"Tasks and projects", value:66},
  {key:"tree", zh:"文件树", en:"File tree", value:68},
  {key:"market", zh:"插件市场与面板", en:"Plugin market and panels", value:85},
  {key:"conversation", zh:"对话区", en:"Conversation", value:58},
  {key:"changes", zh:"文件改动卡片", en:"File change cards", value:85},
  {key:"preview", zh:"文件预览区", en:"File preview", value:58},
  {key:"tabs", zh:"顶部菜单栏", en:"Top menu bar", value:78},
  {key:"composer", zh:"消息输入框", en:"Message composer", value:86},
  {key:"utility", zh:"右侧工具栏", en:"Side panel", value:66},
  {key:"login", zh:"登录页", en:"Sign-in page", value:58},
] as const;
type Region = typeof MASK_REGIONS[number]["key"];
type Preferences = {enabled:boolean; values:Record<Region,number>};
const defaults = (): Preferences => ({enabled:false, values:Object.fromEntries(MASK_REGIONS.map(r=>[r.key,r.value])) as Record<Region,number>});
let sessionPreferences = defaults();

function readPreferences(): Preferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      const record = raw as Partial<Preferences>;
      const result = defaults(); result.enabled = record.enabled === true;
      for (const region of MASK_REGIONS) {
        const value = record.values?.[region.key];
        if (typeof value === "number" && Number.isFinite(value)) result.values[region.key] = Math.round(Math.max(0,Math.min(100,value)));
      }
      sessionPreferences = result;
    }
  } catch { /* Invalid or unavailable storage keeps safe in-memory settings. */ }
  return {enabled:sessionPreferences.enabled,values:{...sessionPreferences.values}};
}

// An independent appearance tool: never enters the background plugin's
// mutually-exclusive enabled set and never writes opacity on any content.
export class SurfaceOpacityPlugin {
  #preferences = readPreferences();
  #observer: MutationObserver | undefined;
  #styleObserver:MutationObserver|undefined;
  #styleFrame:number|undefined;
  #previewHosts=new Set<Element>();
  #styledPreviews=new WeakSet<ShadowRoot>();
  #bound = false;
  #ownsPresentation = false;
  constructor(private readonly shadow: ShadowRoot, private readonly text: (zh:string,en:string)=>string, private readonly notice:(message:string)=>void) {}
  #element<T extends HTMLElement>(selector:string): T { return this.shadow.querySelector<T>(selector)!; }
  #backgroundActive():boolean { return BACKGROUND_ATTRIBUTES.some(a=>document.documentElement.hasAttribute(a)); }
  start():void {
    this.#installStyles();
    if (!this.#bound) {
      this.#bound=true;
      this.#element('.surface-opacity-enable').addEventListener('click',()=>{
        const enabled=this.#element<HTMLButtonElement>('.surface-opacity-enable').getAttribute('aria-pressed')!=='true';
        if (enabled && !this.#backgroundActive()) {
          this.notice(this.text('必须先启用一个背景插件，才能启用界面蒙版调节。','Enable a background plugin before enabling UI Surface Opacity.'));
          return;
        }
        this.#preferences.enabled=enabled; this.#save(); this.render();
      });
      this.#element('.surface-opacity-settings-trigger').addEventListener('click',()=>this.open());
      this.#element('.surface-opacity-close').addEventListener('click',()=>{this.close();this.#element('.surface-opacity-settings-trigger').focus();});
      const panel=this.#element('.surface-opacity-panel');
      panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();this.close();this.#element('.surface-opacity-settings-trigger').focus();}});
      panel.addEventListener('toggle',()=>this.#element('.surface-opacity-settings-trigger').setAttribute('aria-expanded',String(panel.matches(':popover-open'))));
      panel.addEventListener('input',event=>{
        const input=event.target as HTMLInputElement;const region=MASK_REGIONS.find(r=>r.key===input.dataset.maskRegion);
        if(!region)return;
        this.#preferences.values[region.key]=Math.round(Math.max(0,Math.min(100,Number(input.value))));this.#save();this.render();
      });
      panel.addEventListener('click',event=>{
        const button=(event.target as Element).closest<HTMLButtonElement>('[data-mask-reset]');const region=MASK_REGIONS.find(r=>r.key===button?.dataset.maskReset);
        if(region){this.#preferences.values[region.key]=region.value;this.#save();this.render();}
      });
      this.#element('.surface-opacity-reset').addEventListener('click',()=>{this.#preferences.values=defaults().values;this.#save();this.render();});
    }
    this.#observer?.disconnect();
    this.#observer=new MutationObserver(()=>this.render());
    this.#observer.observe(document.documentElement,{attributes:true,attributeFilter:BACKGROUND_ATTRIBUTES});
    this.#styleObserver?.disconnect();this.#styleObserver=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)this.#findPreviews(node);
      if(!this.#previewHosts.size||this.#styleFrame!==undefined)return;
      this.#styleFrame=requestAnimationFrame(()=>{this.#styleFrame=undefined;this.#flushPreviews();});
    });
    this.#styleObserver.observe(document.body,{childList:true,subtree:true});
    this.render();
  }
  #installStyles():void {
    const add=(root:Document|ShadowRoot,key:string,text:string)=>{let style=root.querySelector<HTMLStyleElement>('style[data-code-codex-plugin-style="'+key+'"]');if(!style){style=document.createElement('style');style.dataset.codeCodexPluginStyle=key;(root instanceof Document?root.head:root).append(style);}if(style.textContent!==text)style.textContent=text;};
    add(document,'surface-opacity-native',SURFACE_OPACITY_NATIVE_CSS);
    add(this.shadow,'surface-opacity-tree',SURFACE_OPACITY_TREE_CSS);
    this.#findPreviews(document.body);this.#flushPreviews();
  }
  #findPreviews(node:Node):void{
    if(!(node instanceof Element))return;
    const inspect=(el:Element)=>{if(el.localName.startsWith('code-codex-main-preview-')&&(!el.shadowRoot||!this.#styledPreviews.has(el.shadowRoot)))this.#previewHosts.add(el);};
    inspect(node);for(const child of node.querySelectorAll('*'))inspect(child);
  }
  #flushPreviews():void{
    for(const el of this.#previewHosts){const root=el.shadowRoot;if(!el.isConnected||!root||this.#styledPreviews.has(root))continue;
      let style=root.querySelector<HTMLStyleElement>('style[data-code-codex-plugin-style="surface-opacity-preview"]');
      if(!style){style=document.createElement('style');style.dataset.codeCodexPluginStyle='surface-opacity-preview';root.append(style);}
      if(style.textContent!==SURFACE_OPACITY_PREVIEW_CSS)style.textContent=SURFACE_OPACITY_PREVIEW_CSS;
      this.#styledPreviews.add(root);
    }this.#previewHosts.clear();
  }
  #save():void {
    sessionPreferences={enabled:this.#preferences.enabled,values:{...this.#preferences.values}};
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(this.#preferences));}
    catch {this.notice(this.text('设置已应用，但无法保存到本机存储。','Settings applied, but local storage could not save them.'));}
  }
  render():void {
    this.#installStyles();
    const available=this.#backgroundActive();const active=this.#preferences.enabled&&available;
    const html=document.documentElement;
    if(active){
      for(const region of MASK_REGIONS)html.style.setProperty('--code-codex-mask-'+region.key,String(this.#preferences.values[region.key]/100));
      html.setAttribute(ACTIVE_ATTRIBUTE,'');this.#ownsPresentation=true;
    }else if(this.#ownsPresentation){
      html.removeAttribute(ACTIVE_ATTRIBUTE);for(const region of MASK_REGIONS)html.style.removeProperty('--code-codex-mask-'+region.key);this.#ownsPresentation=false;
    }
    const status=this.#element('.surface-opacity-status');
    this.#element('[data-appearance-plugin="code-codex.surface-opacity"] h4').textContent='UI Surface Opacity';
    status.textContent=active?'Enabled':this.#preferences.enabled?'Paused · No background':'Disabled';
    const button=this.#element<HTMLButtonElement>('.surface-opacity-enable');
    button.textContent=this.#preferences.enabled?'Disable':'Enable';button.setAttribute('aria-pressed',String(active));
    const close=this.#element('.surface-opacity-close');close.title=this.text('关闭蒙版设置','Close opacity settings');close.setAttribute('aria-label',close.title);
    this.#element('.surface-opacity-message').textContent=available?
      this.text(active?'设置已实时应用，并自动保存。':'启用此插件后应用以下设置。',active?'Changes apply live and save automatically.':'Enable this plugin to apply these settings.'):
      this.text('必须先启用一个背景插件。背景关闭时，蒙版调节暂停；再次启用背景后恢复。','Enable a background plugin first. Adjustments pause without a background and resume when it returns.');
    for(const region of MASK_REGIONS){
      const input=this.#element<HTMLInputElement>('[data-mask-region="'+region.key+'"]');input.value=String(this.#preferences.values[region.key]);input.disabled=!active;
      input.setAttribute('aria-label',this.text(region.zh,region.en));input.setAttribute('aria-valuetext',input.value+'%');
      this.#element('output[for="'+input.id+'"]').textContent=input.value+'%';
      const reset=this.#element<HTMLButtonElement>('[data-mask-reset="'+region.key+'"]');reset.title=this.text('恢复此项默认值','Restore this default');reset.setAttribute('aria-label',this.text('恢复'+region.zh+'默认值','Reset '+region.en));
    }
    this.#element('.surface-opacity-reset').textContent=this.text('恢复全部默认值','Restore all defaults');
  }
  open():void {
    const panel=this.#element('.surface-opacity-panel');if(panel.matches(':popover-open')){this.close();return;}
    for(const other of this.shadow.querySelectorAll<HTMLElement>('.particle-settings-panel'))if(other!==panel&&other.matches(':popover-open'))other.hidePopover();
    this.render();panel.showPopover();
    const anchor=this.#element('.surface-opacity-settings-trigger').getBoundingClientRect();
    const box=panel.getBoundingClientRect();
    panel.style.left=Math.max(12,Math.min(window.innerWidth-box.width-12,anchor.right+12))+'px';
    panel.style.top=Math.max(12,Math.min(window.innerHeight-box.height-12,anchor.top))+'px';
    this.#element('.surface-opacity-close').focus();
  }
  containsEvent(event:Event):boolean {return event.composedPath().includes(this.#element('.surface-opacity-panel'))||event.composedPath().includes(this.#element('.surface-opacity-settings-trigger'));}
  close():void {const panel=this.#element('.surface-opacity-panel');if(panel.matches(':popover-open'))panel.hidePopover();}
  stop():void {this.close();this.#observer?.disconnect();this.#observer=undefined;this.#styleObserver?.disconnect();this.#styleObserver=undefined;if(this.#styleFrame!==undefined)cancelAnimationFrame(this.#styleFrame);this.#styleFrame=undefined;this.#previewHosts.clear();if(this.#ownsPresentation){document.documentElement.removeAttribute(ACTIVE_ATTRIBUTE);for(const r of MASK_REGIONS)document.documentElement.style.removeProperty('--code-codex-mask-'+r.key);this.#ownsPresentation=false;}}
}

export const SURFACE_OPACITY_NATIVE_CSS = `
html[data-code-codex-ui-mask-active] body nav[data-app-navigation-rail] { background-color:rgba(16,17,20,var(--code-codex-mask-navigation)) !important; }
html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active] body :is(aside.app-shell-left-panel,aside[data-testid="app-shell-floating-left-panel"]) { background-color:rgba(16,17,20,var(--code-codex-mask-sidebar)) !important; }
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]) { background-color:rgba(11,12,15,var(--code-codex-mask-conversation)) !important; }
/* Native turn-diff cards own one background, independently of conversation.
 * Match the observed semantic group token, not localized titles or hashes.
 * File rows and expanded diff backings must not compound the card alpha.
 * Icon tiles share this single backing; glyphs, actions and focus stay native. */
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]) div:has(> [class~="group/turn-diff-header"]) {
  background-color:color-mix(in srgb,var(--color-surface-elevated-secondary,rgb(30,31,35)) calc(var(--code-codex-mask-changes) * 100%),transparent) !important;
  background-image:none !important;
}
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]) div:has(> [class~="group/turn-diff-header"]) > [class*="--codex-diffs-surface-override:"] {
  --codex-diffs-surface-override:transparent !important;
}
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]) [class~="group/turn-diff-header"] > span > span[class~="size-10"]:has(> svg) {
  background-color:transparent !important;
  background-image:none !important;
}
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]) div:has(> [class~="group/turn-diff-header"]) [class~="group/turn-diff-file-row"] > .contents > button {
  background-color:transparent !important;
}
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]) div:has(> [class~="group/turn-diff-header"]) [class~="group/turn-diff-file-row"] > .contents > button:hover {
  background-color:color-mix(in srgb,var(--color-background-primary-ghost-hover,rgba(128,128,128,.12)) 60%,transparent) !important;
}
/* Conversation already has one continuous mask. Native scroll-edge helpers
 * otherwise add an opaque theme surface/gradient over it, even at zero.
 * Keep their geometry and hit testing, but let the conversation mask paint
 * through them. Do not apply another alpha here: it would compound the mask.
 * The bottom fade may live in an independent sticky scroll spacer rather than
 * inside the footer. Target only decorative helpers in these observed slots,
 * preserving cards and the composer. Support both observed CSS module token
 * shapes (legacy _name_hash and current name-hash) without pinning hashes.
 * A newly mounted scroll container can paint before the PiP anchor is attached.
 * Its semantic container under main must receive the same rule on first paint. */
html[data-code-codex-ui-mask-active] body main[data-app-shell-main-surface="default"] [class*="MainContentTopFade"],
html[data-code-codex-ui-mask-active] body :is(
  [data-pip-anchor-host="codex-main-thread"],
  :is(main.main-surface,main[data-app-shell-main-surface="default"]) .thread-scroll-container
) .sticky.bottom-0 > .pointer-events-none:is(
  [class*="_background_"][class*="_fade_"],
  :is([class^="background-"],[class*=" background-"]):is([class^="fade-"],[class*=" fade-"])
),
html[data-code-codex-ui-mask-active] body [data-thread-scroll-footer="true"] > :is(
  [class*="_background_"],
  .pointer-events-none:is([class^="background-"],[class*=" background-"]):is([class^="surface-"],[class*=" surface-"])
) {
  background-color:transparent !important;
  background-image:none !important;
}
/* Leave the tab band's backing transparent: its own mask must not stack
 * over the content mask. Preview content stays transparent inside main. */
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]):has(> [data-code-codex-owned]) {
  --code-codex-mask-content:var(--code-codex-mask-conversation);
  background-color:transparent !important;
  background-image:linear-gradient(rgba(11,12,15,var(--code-codex-mask-content)),rgba(11,12,15,var(--code-codex-mask-content))) !important;
  background-repeat:no-repeat !important; background-position:bottom !important;
  background-size:100% calc(100% - 46px) !important;
}
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]):has(> [data-code-codex-owned][data-clipped-layout="true"]) { background-size:100% calc(100% - 42px) !important; }
html[data-code-codex-ui-mask-active] body :is(main.main-surface,main[data-app-shell-main-surface="default"]):has(> [data-code-codex-owned][data-file-active]) { --code-codex-mask-content:var(--code-codex-mask-preview); }
html[data-code-codex-ui-mask-active] body aside[data-app-shell-focus-area="right-panel"] { background-color:rgba(16,17,20,var(--code-codex-mask-utility)) !important; }
/* The tabs key is retained for the top application menu row.
 * Match the same native role/trigger IDs used by application-menu.ts, without
 * a CSS module hash or a localized label. Its parent also contains navigation
 * and Code-Codex: paint that common row once, not the conversation titlebar,
 * file tabs, or the full viewport carrying header-edge-scroll metadata. */
html[data-code-codex-ui-mask-active] body :has(> [role="menubar"] > button[id^="application-menu-trigger-"][id$="-menu"]) {
  background-color:rgba(24,25,28,var(--code-codex-mask-tabs)) !important;
  background-image:none !important;
}
/* Current native composers paint the layout surface (the Home variant paints
 * its body). Set that surface, rather than stacking a second mask on its root. */
html[data-code-codex-ui-mask-active] body [data-composer-layout] { --composer-layout-surface-background:rgba(30,31,35,var(--code-codex-mask-composer)) !important; }
html[data-code-codex-ui-mask-active] body :is(
  [data-codex-composer],
  [data-pip-obstacle="thread-footer"] form:not(:has([data-composer-layout])),
  [data-composer-layout]:not([data-composer-utility-bar-variant="home"]),
  [data-composer-utility-bar-variant="home"] [class*="ComposerLayoutBody"]
) { background-color:rgba(30,31,35,var(--code-codex-mask-composer)) !important; }
/* Home places its project/location rail above and outside the input layout.
 * Paint its independent backing once, sharing the existing composer alpha. */
html[data-code-codex-ui-mask-active] body [data-composer-placement="home"] [data-composer-utility-rail][data-composer-rail-placement="above"][data-composer-rail-contained] {
  background-color:rgba(30,31,35,var(--code-codex-mask-composer)) !important;
  background-image:none !important;
}
html[data-code-codex-ui-mask-active] body [data-code-codex-login-surface] { background-color:rgba(11,12,15,var(--code-codex-mask-login)) !important; }
`;

export const SURFACE_OPACITY_TREE_CSS = `
/* Each market or settings popover paints one mask. Nested structural backings
 * reveal it instead of multiplying alpha; foreground and controls stay native.
 * Extra active-attribute specificity beats the host's background-plugin rules. */
:host-context(html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active]) :is(.preview-market-popover,.particle-settings-panel),
:host-context(html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active]) .preview-market-popover::after,
:host-context(html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active]) .particle-settings-panel::before {
  background-color:color-mix(in srgb,var(--cle-paper-raised) calc(var(--code-codex-mask-market) * 100%),transparent) !important;
  background-image:none !important;
}
:host-context(html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active]) .preview-market-popover :is(.preview-extension,.preview-market-header,.preview-market-list),
:host-context(html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active]) .particle-settings-panel :is(.particle-settings-header,.particle-settings-scroll,.particle-settings-group,.ocean-creature-card,.accounts-connection) {
  background-color:transparent !important;
  background-image:none !important;
}
:host-context(html[data-code-codex-ui-mask-active]) .frame { background-color:rgba(16,17,20,var(--code-codex-mask-tree)) !important; }
/* Folder status backing inherits the frame's single tree alpha; preserve the SVG. */
:host([data-state="no-project"]):host-context(html[data-code-codex-ui-mask-active]) .state-mark,
:host([data-state="empty"]):host-context(html[data-code-codex-ui-mask-active]) .state-mark { background-color:transparent !important; background-image:none !important; }

:host-context(html[data-code-codex-ui-mask-active]) :is(.masthead,.statusbar,.file-search-toolbar,.tree-shell,.file-filter) { background-color:transparent !important; }
.surface-opacity-row { grid-template-columns:minmax(92px,1fr) minmax(60px,1fr) 42px 24px; }
.surface-opacity-row button {border:1px solid var(--cle-rule);border-radius:4px;background:var(--cle-paper);color:var(--cle-ink);height:24px;padding:0;cursor:pointer;font:inherit;}
.surface-opacity-row output {cursor:default;}
.surface-opacity-help,.surface-opacity-message {margin:0;color:var(--cle-muted);font-size:11px;line-height:1.4;}
.surface-opacity-help .cle-bilingual-label span {white-space:normal;overflow:visible;text-overflow:clip;}
.surface-opacity-reset {justify-self:start;}

`;

export const SURFACE_OPACITY_PREVIEW_CSS = `
:host-context(html[data-code-codex-ui-mask-active]) :is(.tab-strip,.tab-slot,.tab-slot.active,.preview-tab[aria-selected="true"]) {background-color:transparent !important;}
`;
