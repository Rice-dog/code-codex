(()=>{var w=Object.defineProperty;var E=(i,e)=>{for(var t in e)w(i,t,{get:e[t],enumerable:!0})};var f={};E(f,{MASK_REGIONS:()=>r,SURFACE_OPACITY_NATIVE_CSS:()=>k,SURFACE_OPACITY_PREVIEW_CSS:()=>p,SURFACE_OPACITY_TREE_CSS:()=>y,SurfaceOpacityPlugin:()=>m});var b="code-codex.surface-opacity.v1",u="data-code-codex-ui-mask-active",v=["data-code-codex-transparent-background","data-code-codex-particle-image-background","data-code-codex-glow-horizon-background","data-code-codex-custom-background"],r=[{key:"navigation",zh:"最左侧导航栏",en:"Navigation rail",value:66},{key:"sidebar",zh:"任务与项目选择栏",en:"Tasks and projects",value:66},{key:"tree",zh:"文件树",en:"File tree",value:68},{key:"market",zh:"插件市场与面板",en:"Plugin market and panels",value:85},{key:"conversation",zh:"对话区",en:"Conversation",value:58},{key:"changes",zh:"文件改动卡片",en:"File change cards",value:85},{key:"preview",zh:"文件预览区",en:"File preview",value:58},{key:"tabs",zh:"顶部菜单栏",en:"Top menu bar",value:78},{key:"composer",zh:"消息输入框",en:"Message composer",value:86},{key:"utility",zh:"右侧工具栏",en:"Side panel",value:66},{key:"login",zh:"登录页",en:"Sign-in page",value:58}],h=()=>({enabled:!1,values:Object.fromEntries(r.map(i=>[i.key,i.value]))}),d=h();function S(){try{let i=JSON.parse(localStorage.getItem(b)??"null");if(i&&typeof i=="object"){let e=i,t=h();t.enabled=e.enabled===!0;for(let a of r){let o=e.values?.[a.key];typeof o=="number"&&Number.isFinite(o)&&(t.values[a.key]=Math.round(Math.max(0,Math.min(100,o))))}d=t}}catch{}return{enabled:d.enabled,values:{...d.values}}}var m=class{constructor(e,t,a){this.shadow=e;this.text=t;this.notice=a}#t=S();#o;#s;#a;#n=new Set;#c=new WeakSet;#d=!1;#i=!1;#e(e){return this.shadow.querySelector(e)}#l(){return v.some(e=>document.documentElement.hasAttribute(e))}start(){if(this.#u(),!this.#d){this.#d=!0,this.#e(".surface-opacity-enable").addEventListener("click",()=>{let t=this.#e(".surface-opacity-enable").getAttribute("aria-pressed")!=="true";if(t&&!this.#l()){this.notice(this.text("必须先启用一个背景插件，才能启用界面蒙版调节。","Enable a background plugin before enabling UI Surface Opacity."));return}this.#t.enabled=t,this.#r(),this.render()}),this.#e(".surface-opacity-settings-trigger").addEventListener("click",()=>this.open()),this.#e(".surface-opacity-close").addEventListener("click",()=>{this.close(),this.#e(".surface-opacity-settings-trigger").focus()});let e=this.#e(".surface-opacity-panel");e.addEventListener("keydown",t=>{t.key==="Escape"&&(t.stopPropagation(),this.close(),this.#e(".surface-opacity-settings-trigger").focus())}),e.addEventListener("toggle",()=>this.#e(".surface-opacity-settings-trigger").setAttribute("aria-expanded",String(e.matches(":popover-open")))),e.addEventListener("input",t=>{let a=t.target,o=r.find(s=>s.key===a.dataset.maskRegion);o&&(this.#t.values[o.key]=Math.round(Math.max(0,Math.min(100,Number(a.value)))),this.#r(),this.render())}),e.addEventListener("click",t=>{let a=t.target.closest("[data-mask-reset]"),o=r.find(s=>s.key===a?.dataset.maskReset);o&&(this.#t.values[o.key]=o.value,this.#r(),this.render())}),this.#e(".surface-opacity-reset").addEventListener("click",()=>{this.#t.values=h().values,this.#r(),this.render()})}this.#o?.disconnect(),this.#o=new MutationObserver(()=>this.render()),this.#o.observe(document.documentElement,{attributes:!0,attributeFilter:v}),this.#s?.disconnect(),this.#s=new MutationObserver(e=>{for(let t of e)for(let a of t.addedNodes)this.#m(a);!this.#n.size||this.#a!==void 0||(this.#a=requestAnimationFrame(()=>{this.#a=void 0,this.#p()}))}),this.#s.observe(document.body,{childList:!0,subtree:!0}),this.render()}#u(){let e=(t,a,o)=>{let s=t.querySelector('style[data-code-codex-plugin-style="'+a+'"]');s||(s=document.createElement("style"),s.dataset.codeCodexPluginStyle=a,(t instanceof Document?t.head:t).append(s)),s.textContent!==o&&(s.textContent=o)};e(document,"surface-opacity-native",k),e(this.shadow,"surface-opacity-tree",y),this.#m(document.body),this.#p()}#m(e){if(!(e instanceof Element))return;let t=a=>{a.localName.startsWith("code-codex-main-preview-")&&(!a.shadowRoot||!this.#c.has(a.shadowRoot))&&this.#n.add(a)};t(e);for(let a of e.querySelectorAll("*"))t(a)}#p(){for(let e of this.#n){let t=e.shadowRoot;if(!e.isConnected||!t||this.#c.has(t))continue;let a=t.querySelector('style[data-code-codex-plugin-style="surface-opacity-preview"]');a||(a=document.createElement("style"),a.dataset.codeCodexPluginStyle="surface-opacity-preview",t.append(a)),a.textContent!==p&&(a.textContent=p),this.#c.add(t)}this.#n.clear()}#r(){d={enabled:this.#t.enabled,values:{...this.#t.values}};try{localStorage.setItem(b,JSON.stringify(this.#t))}catch{this.notice(this.text("设置已应用，但无法保存到本机存储。","Settings applied, but local storage could not save them."))}}render(){this.#u();let e=this.#l(),t=this.#t.enabled&&e,a=document.documentElement;if(t){for(let n of r)a.style.setProperty("--code-codex-mask-"+n.key,String(this.#t.values[n.key]/100));a.setAttribute(u,""),this.#i=!0}else if(this.#i){a.removeAttribute(u);for(let n of r)a.style.removeProperty("--code-codex-mask-"+n.key);this.#i=!1}let o=this.#e(".surface-opacity-status");this.#e('[data-appearance-plugin="code-codex.surface-opacity"] h4').textContent="UI Surface Opacity",o.textContent=t?"Enabled":this.#t.enabled?"Paused · No background":"Disabled";let s=this.#e(".surface-opacity-enable");s.textContent=this.#t.enabled?"Disable":"Enable",s.setAttribute("aria-pressed",String(t));let l=this.#e(".surface-opacity-close");l.title=this.text("关闭蒙版设置","Close opacity settings"),l.setAttribute("aria-label",l.title),this.#e(".surface-opacity-message").textContent=e?this.text(t?"设置已实时应用，并自动保存。":"启用此插件后应用以下设置。",t?"Changes apply live and save automatically.":"Enable this plugin to apply these settings."):this.text("必须先启用一个背景插件。背景关闭时，蒙版调节暂停；再次启用背景后恢复。","Enable a background plugin first. Adjustments pause without a background and resume when it returns.");for(let n of r){let c=this.#e('[data-mask-region="'+n.key+'"]');c.value=String(this.#t.values[n.key]),c.disabled=!t,c.setAttribute("aria-label",this.text(n.zh,n.en)),c.setAttribute("aria-valuetext",c.value+"%"),this.#e('output[for="'+c.id+'"]').textContent=c.value+"%";let g=this.#e('[data-mask-reset="'+n.key+'"]');g.title=this.text("恢复此项默认值","Restore this default"),g.setAttribute("aria-label",this.text("恢复"+n.zh+"默认值","Reset "+n.en))}this.#e(".surface-opacity-reset").textContent=this.text("恢复全部默认值","Restore all defaults")}open(){let e=this.#e(".surface-opacity-panel");if(e.matches(":popover-open")){this.close();return}for(let o of this.shadow.querySelectorAll(".particle-settings-panel"))o!==e&&o.matches(":popover-open")&&o.hidePopover();this.render(),e.showPopover();let t=this.#e(".surface-opacity-settings-trigger").getBoundingClientRect(),a=e.getBoundingClientRect();e.style.left=Math.max(12,Math.min(window.innerWidth-a.width-12,t.right+12))+"px",e.style.top=Math.max(12,Math.min(window.innerHeight-a.height-12,t.top))+"px",this.#e(".surface-opacity-close").focus()}containsEvent(e){return e.composedPath().includes(this.#e(".surface-opacity-panel"))||e.composedPath().includes(this.#e(".surface-opacity-settings-trigger"))}close(){let e=this.#e(".surface-opacity-panel");e.matches(":popover-open")&&e.hidePopover()}stop(){if(this.close(),this.#o?.disconnect(),this.#o=void 0,this.#s?.disconnect(),this.#s=void 0,this.#a!==void 0&&cancelAnimationFrame(this.#a),this.#a=void 0,this.#n.clear(),this.#i){document.documentElement.removeAttribute(u);for(let e of r)document.documentElement.style.removeProperty("--code-codex-mask-"+e.key);this.#i=!1}}},k=`
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
`,y=`
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

`,p=`
:host-context(html[data-code-codex-ui-mask-active]) :is(.tab-strip,.tab-slot,.tab-slot.active,.preview-tab[aria-selected="true"]) {background-color:transparent !important;}
`;var x=Symbol.for("code-codex:plugin-modules:v1"),C=window[x]??(window[x]=new Map);C.set("surface-opacity",{id:"surface-opacity",api:1,version:"1.0.14",exports:f});})();
