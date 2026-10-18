import type { BackgroundCommands } from "../../contracts/appearance";
import type { PixelSculptBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { type BackgroundSettingsLanguage } from "../../contracts/explorer-model";
import { PIXEL_SCULPT_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
export interface PixelSculptSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly shadow: ShadowRoot;
  readonly required: <T extends Element>(selector: string) => T;
  readonly pixelSculptController: Pick<PixelSculptBackgroundController,"editorPending"|"editorReady"|"enabled"|"error"|"mountControls"|"pending"|"prepareEditor"|"reset"|"settings"|"updateSettings">;
  readonly connected: boolean;
  readonly previewMarketPopover: HTMLElement;
  readonly appearanceTransitionPending: boolean;
  readonly appearancePluginPending: boolean;
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
}
export class PixelSculptSettingsController {
  constructor(private readonly host: PixelSculptSettingsControllerPorts) { }
  pixelSculptEventsBound=false;
  closePixelSculpt(): void {
    const panel=this.host.shadow.querySelector<HTMLElement>("#cle-pixelSculpt-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.host.shadow.querySelector(".pixelSculpt-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  positionPixelSculpt(): void {
    const panel=this.host.required<HTMLElement>("#cle-pixelSculpt-settings");
    if(!panel.matches(":popover-open")) return;
    const rect=this.host.required<HTMLElement>(".pixelSculpt-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(344,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  bindPixelSculpt(): void {
    if(this.pixelSculptEventsBound) return; this.pixelSculptEventsBound=true;
    const panel=this.host.required<HTMLElement>("#cle-pixelSculpt-settings");
    this.host.required<HTMLButtonElement>(".pixelSculpt-enable").addEventListener("click",() => void this.togglePixelSculpt());
    this.host.required<HTMLButtonElement>(".pixelSculpt-settings-trigger").addEventListener("click",() => {
      if(panel.matches(":popover-open")) { this.closePixelSculpt(); return; }
      this.host.closeOtherSettings();
      this.renderPixelSculpt(); panel.showPopover(); this.positionPixelSculpt();
      this.host.required(".pixelSculpt-settings-trigger").setAttribute("aria-expanded","true");
      this.host.required<HTMLButtonElement>(".pixelSculpt-close").focus();
      void this.host.pixelSculptController.prepareEditor().then(() => {
        if(!this.host.connected) return;
        this.renderPixelSculpt();
        this.positionPixelSculpt();
      }).catch(() => { if(this.host.connected) this.renderPixelSculpt(); });
    });
    this.host.required<HTMLButtonElement>(".pixelSculpt-close").addEventListener("click",() => { this.closePixelSculpt(); this.host.required<HTMLButtonElement>(".pixelSculpt-settings-trigger").focus(); });
    panel.addEventListener("keydown",event => { if(event.key==="Escape") { event.stopPropagation(); this.closePixelSculpt(); this.host.required<HTMLButtonElement>(".pixelSculpt-settings-trigger").focus(); } });
    this.host.previewMarketPopover.addEventListener("scroll",() => this.positionPixelSculpt());
    panel.addEventListener("toggle",() => { this.host.required(".pixelSculpt-settings-trigger").setAttribute("aria-expanded",String(panel.matches(":popover-open"))); });
    this.host.required<HTMLInputElement>(".pixelSculpt-paused").addEventListener("change",event => this.host.pixelSculptController.updateSettings({ ...this.host.pixelSculptController.settings,paused: (event.target as HTMLInputElement).checked }));
    this.host.required(".pixelSculpt-reset").addEventListener("click",() => this.host.pixelSculptController.reset());
  }
  renderPixelSculpt(): void {
    const card=this.host.shadow.querySelector<HTMLElement>('[data-appearance-plugin="'+PIXEL_SCULPT_BACKGROUND_PLUGIN_ID+'"]'); if(!card) return;
    const c=this.host.pixelSculptController,s=c.settings;
    const busy=c.pending||c.editorPending||this.host.appearanceTransitionPending||this.host.appearancePluginPending;
    const button=card.querySelector<HTMLButtonElement>(".pixelSculpt-enable")!;
    button.textContent=c.enabled? "Disable":"Enable"; button.disabled=busy; button.setAttribute("aria-pressed",String(c.enabled)); button.setAttribute("aria-label",`${c.enabled? "Disable":"Enable"} Pixel Sculpt Background`);
    const status=card.querySelector<HTMLElement>(".pixelSculpt-status")!; status.textContent=c.pending? "Applying…":c.error? "Unavailable":c.enabled? "Enabled":"Disabled"; status.dataset.enabled=String(c.enabled);
    this.host.required<HTMLInputElement>(".pixelSculpt-paused").checked=s.paused;
    this.host.required<HTMLInputElement>(".pixelSculpt-paused").disabled=busy||!c.enabled;
    this.host.required<HTMLButtonElement>(".pixelSculpt-reset").disabled=busy||!c.editorReady;
    this.host.required<HTMLElement>(".pixelSculpt-disabled").hidden=c.enabled;
    const controlsHost=this.host.required<HTMLElement>(".pixelSculpt-controls-host");
    controlsHost.hidden=!c.editorReady;
    if(c.editorReady) c.mountControls(controlsHost,this.host.backgroundSettingsLanguage);
    const error=this.host.required<HTMLElement>(".pixelSculpt-error"); error.textContent=c.error??""; error.hidden=!c.error;
    this.host.backgroundPackageMarket?.queueRender();
  }
  async togglePixelSculpt(): Promise<void> { await this.host.backgroundActions.toggle(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID); }
}
