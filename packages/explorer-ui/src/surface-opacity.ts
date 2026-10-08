import { icons } from './icons';
import { ensurePluginPackage, isPluginPackageLoaded, pluginExport } from './plugin-runtime';
import type { SurfaceOpacityPlugin as Runtime } from './surface-opacity-runtime';
export const MASK_REGIONS = [
  {key:"navigation", zh:"最左侧导航栏", en:"Navigation rail", value:66},
  {key:"sidebar", zh:"任务与项目选择栏", en:"Tasks and projects", value:66},
  {key:"tree", zh:"文件树", en:"File tree", value:68},
  {key:"conversation", zh:"对话区", en:"Conversation", value:58},
  {key:"preview", zh:"文件预览区", en:"File preview", value:58},
  {key:"tabs", zh:"顶部标签栏", en:"Tab bar", value:78},
  {key:"composer", zh:"消息输入框", en:"Message composer", value:86},
  {key:"utility", zh:"右侧工具栏", en:"Side panel", value:66},
  {key:"login", zh:"登录页", en:"Sign-in page", value:58},
] as const;
export function surfaceOpacityCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="code-codex.surface-opacity">
    <span class="preview-extension-icon" aria-hidden="true">${icons.sliders}</span>
    <div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>UI Surface Opacity</h4><span class="preview-extension-status surface-opacity-status">Disabled</span></div></div>
    <div class="preview-extension-actions"><button type="button" class="preview-extension-action surface-opacity-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger surface-opacity-settings-trigger" aria-label="Configure UI Surface Opacity" aria-haspopup="dialog" aria-controls="cle-surface-opacity-settings" aria-expanded="false">${icons.sliders}</button></div>
  </article>`;
}
export function surfaceOpacityPanelMarkup(languageSwitch: string, bilingual: (zh: string, en: string) => string): string {
  return `<section class="particle-settings-panel surface-opacity-panel" id="cle-surface-opacity-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-surface-opacity-title">
    <header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingual("外观", "Appearance")}</p><h3 id="cle-surface-opacity-title">${bilingual("界面蒙版不透明度", "UI Surface Opacity")}</h3></div><div class="particle-settings-header-actions">${languageSwitch}<button type="button" class="particle-settings-close surface-opacity-close" aria-label="Close settings">${icons.close}</button></div></header>
    <div class="particle-settings-scroll"><p class="surface-opacity-help">${bilingual("只调节底色，文字和图标保持清晰。0% 完全透明，100% 完全遮挡背景。", "Adjust surface backgrounds only; text and icons stay crisp. 0% is transparent, 100% hides the background.")}</p><p class="surface-opacity-message" role="status"></p>
    <fieldset class="particle-settings-group"><legend>${bilingual("分区不透明度", "Surface opacity")}</legend>${MASK_REGIONS.map(r=>`<div class="particle-control-row surface-opacity-row"><label for="cle-mask-${r.key}">${bilingual(r.zh, r.en)}</label><input id="cle-mask-${r.key}" type="range" min="0" max="100" step="1" data-mask-region="${r.key}" aria-label="${r.zh}"><output for="cle-mask-${r.key}"></output><button type="button" data-mask-reset="${r.key}" title="恢复此项默认值" aria-label="恢复${r.zh}默认值">↺</button></div>`).join("")}</fieldset>
    <button type="button" class="particle-library-clear surface-opacity-reset">恢复全部默认值</button></div>
  </section>`;
}


// Markup and the host lease are lightweight; all behavior and CSS are downloaded.
export const SURFACE_OPACITY_NATIVE_CSS='';
export const SURFACE_OPACITY_TREE_CSS='';
export const SURFACE_OPACITY_PREVIEW_CSS='';
export class SurfaceOpacityPlugin {
  #instance?: Runtime;
  #started=false;
  constructor(private shadow:ShadowRoot,private text:(zh:string,en:string)=>string,private notice:(message:string)=>void){}
  #loaded=()=>{if(this.#started)this.#attach();};
  #attach():void{
    if(!isPluginPackageLoaded('surface-opacity'))return;
    if(!this.#instance){const C=pluginExport<typeof Runtime>('surface-opacity','SurfaceOpacityPlugin');this.#instance=new C(this.shadow,this.text,this.notice);}
    this.#instance.start();
  }
  start():void{this.#started=true;window.addEventListener('code-codex:plugin-loaded',this.#loaded);queueMicrotask(()=>void ensurePluginPackage('surface-opacity').then(()=>{if(this.#started)this.#attach();}).catch(()=>{}));}
  stop():void{this.#started=false;window.removeEventListener('code-codex:plugin-loaded',this.#loaded);this.#instance?.stop();}
  render():void{this.#instance?.render();}
  close():void{this.#instance?.close();}
  containsEvent(event:Event):boolean{return this.#instance?.containsEvent(event)??false;}
}
