import type { BackgroundCommands } from "../../contracts/appearance";
import type { MountainBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { MOUNTAIN_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
MOUNTAIN_CONTROLS,
MOUNTAIN_DEFAULTS,
clampParticleNumber,
normalizeMountainSettings
} from "../../startup-background-renderers";
export interface MountainSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly shadow: ShadowRoot;
  readonly required: <T extends Element>(selector: string) => T;
  readonly previewMarketPopover: HTMLElement;
  readonly mountainController: Pick<MountainBackgroundController,"enabled"|"error"|"pending"|"replay"|"reset"|"settings"|"updateSettings">;
  readonly appearanceTransitionPending: boolean;
  readonly appearancePluginPending: boolean;
  readonly backgroundText: (zh: string,en: string) => string;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
}
export class MountainSettingsController {
  constructor(private readonly host: MountainSettingsControllerPorts) { }
  mountainEventsBound=false;
  closeMountain(): void {
    const panel=this.host.shadow.querySelector<HTMLElement>("#cle-mountain-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.host.shadow.querySelector(".mountain-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  positionMountain(): void {
    const panel=this.host.required<HTMLElement>("#cle-mountain-settings");
    if(!panel.matches(":popover-open")) return;
    const rect=this.host.required<HTMLElement>(".mountain-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(380,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  bindMountain(): void {
    if(this.mountainEventsBound) return; this.mountainEventsBound=true;
    const panel=this.host.required<HTMLElement>("#cle-mountain-settings");
    this.host.required<HTMLButtonElement>(".mountain-enable").addEventListener("click",() => void this.toggleMountain());
    this.host.required<HTMLButtonElement>(".mountain-settings-trigger").addEventListener("click",() => {
      if(panel.matches(":popover-open")) { this.closeMountain(); return; }
      this.host.closeOtherSettings();
      this.renderMountain(); panel.showPopover(); this.positionMountain();
      this.host.required(".mountain-settings-trigger").setAttribute("aria-expanded","true");
      this.host.required<HTMLButtonElement>(".mountain-close").focus();
    });
    this.host.required<HTMLButtonElement>(".mountain-close").addEventListener("click",() => { this.closeMountain(); this.host.required<HTMLButtonElement>(".mountain-settings-trigger").focus(); });
    panel.addEventListener("keydown",event => { if(event.key==="Escape") { event.stopPropagation(); this.closeMountain(); this.host.required<HTMLButtonElement>(".mountain-settings-trigger").focus(); } });
    this.host.previewMarketPopover.addEventListener("scroll",() => this.positionMountain());
    panel.addEventListener("toggle",() => { this.host.required(".mountain-settings-trigger").setAttribute("aria-expanded",String(panel.matches(":popover-open"))); });
    for(const [key,,,min,max,step] of MOUNTAIN_CONTROLS) {
      const input=this.host.required<HTMLInputElement>("#cle-mountain-"+key);
      input.addEventListener("input",() => this.host.mountainController.updateSettings(normalizeMountainSettings({ ...this.host.mountainController.settings,[key]: input.value })));
      input.addEventListener("dblclick",() => { input.type="number"; input.focus(); input.select(); });
      const finish=() => { input.value=String(clampParticleNumber(input.value,min,max,MOUNTAIN_DEFAULTS[key])); input.type="range"; input.step=String(step); this.host.mountainController.updateSettings(normalizeMountainSettings({ ...this.host.mountainController.settings,[key]: input.value })); };
      input.addEventListener("blur",finish); input.addEventListener("keydown",event => { if(event.key==="Enter") { finish(); input.blur(); } });
    }
    this.host.required<HTMLInputElement>(".mountain-paused").addEventListener("change",event => this.host.mountainController.updateSettings({ ...this.host.mountainController.settings,paused: (event.target as HTMLInputElement).checked }));
    this.host.required(".mountain-reset").addEventListener("click",() => this.host.mountainController.reset());
    this.host.required(".mountain-replay").addEventListener("click",() => this.host.mountainController.replay());
    for(const button of panel.querySelectorAll<HTMLButtonElement>("[data-mountain-steps]")) button.addEventListener("click",() => this.host.mountainController.updateSettings(normalizeMountainSettings({ ...this.host.mountainController.settings,steps: Number(button.dataset.mountainSteps) })));
  }
  renderMountain(): void {
    const card=this.host.shadow.querySelector<HTMLElement>('[data-appearance-plugin="'+MOUNTAIN_BACKGROUND_PLUGIN_ID+'"]'); if(!card) return;
    const c=this.host.mountainController,s=c.settings;
    const busy=c.pending||this.host.appearanceTransitionPending||this.host.appearancePluginPending;
    const button=card.querySelector<HTMLButtonElement>(".mountain-enable")!;
    button.textContent=c.enabled? "Disable":"Enable"; button.disabled=busy; button.setAttribute("aria-pressed",String(c.enabled)); button.setAttribute("aria-label",`${c.enabled? "Disable":"Enable"} Layered Mountain Background`);
    const status=card.querySelector<HTMLElement>(".mountain-status")!; status.textContent=c.pending? "Applying…":c.error? "Unavailable":c.enabled? "Enabled":"Disabled"; status.dataset.enabled=String(c.enabled);
    for(const [key,zh,en] of MOUNTAIN_CONTROLS) { const input=this.host.required<HTMLInputElement>("#cle-mountain-"+key); if(this.host.shadow.activeElement!==input) input.value=String(s[key]); input.disabled=busy; input.setAttribute("aria-label",this.host.backgroundText(zh,en)); input.parentElement!.querySelector("output")!.textContent=s[key].toFixed(2); }
    this.host.required<HTMLInputElement>(".mountain-paused").checked=s.paused;
    this.host.required<HTMLInputElement>(".mountain-paused").disabled=busy;
    this.host.required<HTMLButtonElement>(".mountain-reset").disabled=busy;
    this.host.required<HTMLButtonElement>(".mountain-replay").disabled=busy||!c.enabled;
    for(const button of this.host.shadow.querySelectorAll<HTMLButtonElement>("[data-mountain-steps]")) { button.setAttribute("aria-pressed",String(Number(button.dataset.mountainSteps)===s.steps)); button.disabled=busy; }
    const error=this.host.required<HTMLElement>(".mountain-error"); error.textContent=c.error??""; error.hidden=!c.error;
    this.host.backgroundPackageMarket?.queueRender();
  }
  async toggleMountain(): Promise<void> { await this.host.backgroundActions.toggle(MOUNTAIN_BACKGROUND_PLUGIN_ID); }
}
