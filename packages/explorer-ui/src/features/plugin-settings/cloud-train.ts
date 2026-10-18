import type { BackgroundCommands } from "../../contracts/appearance";
import type { CloudTrainBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { CLOUD_TRAIN_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
CLOUD_TRAIN_CONTROLS,
CLOUD_TRAIN_DEFAULTS,
CLOUD_TRAIN_TINTS,
clampParticleNumber,
normalizeCloudTrainSettings
} from "../../startup-background-renderers";
export interface CloudTrainSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly shadow: ShadowRoot;
  readonly required: <T extends Element>(selector: string) => T;
  readonly previewMarketPopover: HTMLElement;
  readonly cloudTrainController: Pick<CloudTrainBackgroundController,"enabled"|"error"|"pending"|"replay"|"reset"|"settings"|"updateSettings">;
  readonly appearanceTransitionPending: boolean;
  readonly appearancePluginPending: boolean;
  readonly backgroundText: (zh: string,en: string) => string;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
}
export class CloudTrainSettingsController {
  constructor(private readonly host: CloudTrainSettingsControllerPorts) { }
  cloudTrainEventsBound=false;
  closeCloudTrain(): void {
    const panel=this.host.shadow.querySelector<HTMLElement>("#cle-cloudTrain-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.host.shadow.querySelector(".cloudTrain-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  positionCloudTrain(): void {
    const panel=this.host.required<HTMLElement>("#cle-cloudTrain-settings");
    if(!panel.matches(":popover-open")) return;
    const rect=this.host.required<HTMLElement>(".cloudTrain-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(380,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  bindCloudTrain(): void {
    if(this.cloudTrainEventsBound) return; this.cloudTrainEventsBound=true;
    const panel=this.host.required<HTMLElement>("#cle-cloudTrain-settings");
    this.host.required<HTMLButtonElement>(".cloudTrain-enable").addEventListener("click",() => void this.toggleCloudTrain());
    this.host.required<HTMLButtonElement>(".cloudTrain-settings-trigger").addEventListener("click",() => {
      if(panel.matches(":popover-open")) { this.closeCloudTrain(); return; }
      this.host.closeOtherSettings();
      this.renderCloudTrain(); panel.showPopover(); this.positionCloudTrain();
      this.host.required(".cloudTrain-settings-trigger").setAttribute("aria-expanded","true");
      this.host.required<HTMLButtonElement>(".cloudTrain-close").focus();
    });
    this.host.required<HTMLButtonElement>(".cloudTrain-close").addEventListener("click",() => { this.closeCloudTrain(); this.host.required<HTMLButtonElement>(".cloudTrain-settings-trigger").focus(); });
    panel.addEventListener("keydown",event => { if(event.key==="Escape") { event.stopPropagation(); this.closeCloudTrain(); this.host.required<HTMLButtonElement>(".cloudTrain-settings-trigger").focus(); } });
    this.host.previewMarketPopover.addEventListener("scroll",() => this.positionCloudTrain());
    panel.addEventListener("toggle",() => { this.host.required(".cloudTrain-settings-trigger").setAttribute("aria-expanded",String(panel.matches(":popover-open"))); });
    for(const [key,,,min,max,step] of CLOUD_TRAIN_CONTROLS) {
      const input=this.host.required<HTMLInputElement>("#cle-cloudTrain-"+key);
      input.addEventListener("input",() => this.host.cloudTrainController.updateSettings(normalizeCloudTrainSettings({ ...this.host.cloudTrainController.settings,[key]: input.value })));
      input.addEventListener("dblclick",() => { input.type="number"; input.focus(); input.select(); });
      const finish=() => { input.value=String(clampParticleNumber(input.value,min,max,CLOUD_TRAIN_DEFAULTS[key])); input.type="range"; input.step=String(step); this.host.cloudTrainController.updateSettings(normalizeCloudTrainSettings({ ...this.host.cloudTrainController.settings,[key]: input.value })); };
      input.addEventListener("blur",finish); input.addEventListener("keydown",event => { if(event.key==="Enter") { finish(); input.blur(); } });
    }
    for(const [key] of CLOUD_TRAIN_TINTS) { const input=this.host.required<HTMLInputElement>("#cle-cloudTrain-"+key); input.addEventListener("input",() => this.host.cloudTrainController.updateSettings(normalizeCloudTrainSettings({ ...this.host.cloudTrainController.settings,[key]: input.value }))); }
    this.host.required<HTMLInputElement>(".cloudTrain-paused").addEventListener("change",event => this.host.cloudTrainController.updateSettings({ ...this.host.cloudTrainController.settings,paused: (event.target as HTMLInputElement).checked }));
    this.host.required<HTMLInputElement>(".cloudTrain-intro-enabled").addEventListener("change",event => { this.host.cloudTrainController.updateSettings({ ...this.host.cloudTrainController.settings,introEnabled: (event.target as HTMLInputElement).checked }); this.host.cloudTrainController.replay(); });
    this.host.required(".cloudTrain-reset").addEventListener("click",() => this.host.cloudTrainController.reset());
    this.host.required(".cloudTrain-replay").addEventListener("click",() => this.host.cloudTrainController.replay());
  }
  renderCloudTrain(): void {
    const card=this.host.shadow.querySelector<HTMLElement>('[data-appearance-plugin="'+CLOUD_TRAIN_BACKGROUND_PLUGIN_ID+'"]'); if(!card) return;
    const c=this.host.cloudTrainController,s=c.settings;
    const busy=c.pending||this.host.appearanceTransitionPending||this.host.appearancePluginPending;
    const button=card.querySelector<HTMLButtonElement>(".cloudTrain-enable")!;
    button.textContent=c.enabled? "Disable":"Enable"; button.disabled=busy; button.setAttribute("aria-pressed",String(c.enabled)); button.setAttribute("aria-label",`${c.enabled? "Disable":"Enable"} Cloud Train Background`);
    const status=card.querySelector<HTMLElement>(".cloudTrain-status")!; status.textContent=c.pending? "Applying…":c.error? "Unavailable":c.enabled? "Enabled":"Disabled"; status.dataset.enabled=String(c.enabled);
    for(const [key,zh,en] of CLOUD_TRAIN_CONTROLS) { const input=this.host.required<HTMLInputElement>("#cle-cloudTrain-"+key); if(this.host.shadow.activeElement!==input) input.value=String(s[key]); input.disabled=busy; input.setAttribute("aria-label",this.host.backgroundText(zh,en)); input.parentElement!.querySelector("output")!.textContent=s[key].toFixed(2); }
    for(const [key,zh,en] of CLOUD_TRAIN_TINTS) { const input=this.host.required<HTMLInputElement>("#cle-cloudTrain-"+key); input.value=s[key]; input.disabled=busy; input.setAttribute("aria-label",this.host.backgroundText(zh,en)); }
    this.host.required<HTMLInputElement>(".cloudTrain-paused").checked=s.paused;
    this.host.required<HTMLInputElement>(".cloudTrain-intro-enabled").checked=s.introEnabled;
    this.host.required<HTMLInputElement>(".cloudTrain-intro-enabled").disabled=busy;
    this.host.required<HTMLInputElement>(".cloudTrain-paused").disabled=busy;
    this.host.required<HTMLButtonElement>(".cloudTrain-reset").disabled=busy;
    this.host.required<HTMLButtonElement>(".cloudTrain-replay").disabled=busy||!c.enabled;
    const error=this.host.required<HTMLElement>(".cloudTrain-error"); error.textContent=c.error??""; error.hidden=!c.error;
    this.host.backgroundPackageMarket?.queueRender();
  }
  async toggleCloudTrain(): Promise<void> { await this.host.backgroundActions.toggle(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID); }
}
