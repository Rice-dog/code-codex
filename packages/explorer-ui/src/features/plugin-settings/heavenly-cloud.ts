import type { BackgroundCommands } from "../../contracts/appearance";
import type { HeavenlyCloudBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { backgroundSettingsError } from "../../components/parameter-format";
import { formatHeavenlyCloudControlValue } from "../../components/plugin-templates";
import { type BackgroundSettingsLanguage,type HeavenlyCloudNumericControlDefinition,type HeavenlyCloudNumericSettingKey } from "../../contracts/explorer-model";
import { HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
normalizeHeavenlyCloudSettings
} from "../../startup-background-renderers";
export interface HeavenlyCloudSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly heavenlyCloudBackgroundController: Pick<HeavenlyCloudBackgroundController,"enabled"|"error"|"pending"|"settings"|"updateSettings">;
  readonly enabledAppearancePlugins: ReadonlySet<string>;
  readonly heavenlyCloudNumericControls: Map<HeavenlyCloudNumericSettingKey,Readonly<{ definition: HeavenlyCloudNumericControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; }>>;
  readonly heavenlyCloudPausedInput: HTMLInputElement;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly heavenlyCloudBackgroundButton: HTMLButtonElement;
  readonly heavenlyCloudQualityButtons: readonly HTMLButtonElement[];
  readonly heavenlyCloudResetButton: HTMLButtonElement;
  readonly heavenlyCloudReplayButton: HTMLButtonElement;
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly heavenlyCloudSettingsPanel: HTMLElement;
  readonly previewMarketOpen: boolean;
  readonly togglePreviewMarket: () => void;
  readonly heavenlyCloudSettingsTrigger: HTMLButtonElement;
  readonly heavenlyCloudSettingsCloseButton: HTMLButtonElement;
}
export class HeavenlyCloudSettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  heavenlyCloudSettingsOpen = false;

  constructor(private readonly host: HeavenlyCloudSettingsControllerPorts) { }
  heavenlyCloudBackgroundCard!: HTMLElement;
  heavenlyCloudBackgroundStatus!: HTMLElement;
  heavenlyCloudPluginError!: HTMLElement;
  async initializeHeavenlyCloudBackground(generation: number): Promise<void> { await this.host.backgroundActions.initialize(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,generation); }
  applyHeavenlyCloudSettingsFromControls(): void {
    const values: Record<string,unknown>={ ...this.host.heavenlyCloudBackgroundController.settings };
    for(const [key,control] of this.host.heavenlyCloudNumericControls) values[key]=control.input.value;
    values.paused=this.host.heavenlyCloudPausedInput.checked;
    this.host.heavenlyCloudBackgroundController.updateSettings(normalizeHeavenlyCloudSettings(values));
  }
  async toggleHeavenlyCloudBackground(): Promise<void> { await this.host.backgroundActions.toggle(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID); }
  renderHeavenlyCloudBackgroundPlugin(): void {
    this.host.backgroundPackageMarket?.queueRender();
    const controller=this.host.heavenlyCloudBackgroundController;
    const enabled=this.host.enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
    const active=enabled&&controller.enabled;
    const action=enabled&&!active? "Retry":enabled? "Disable":"Enable";
    let status=enabled? "Enabled":"Disabled";
    if(controller.pending) status=enabled||controller.enabled? "Enabled · Applying":"Applying";
    else if(enabled&&!active) status="Enabled · Not applied";
    else if(active&&controller.error) status="Enabled · Notice";
    this.heavenlyCloudBackgroundStatus.textContent=status;
    this.heavenlyCloudBackgroundStatus.dataset.enabled=String(active);
    this.heavenlyCloudBackgroundStatus.dataset.pending=String(controller.pending);
    this.heavenlyCloudBackgroundCard.setAttribute("aria-busy",String(controller.pending));
    this.host.heavenlyCloudBackgroundButton.textContent=controller.pending? "Applying…":action;
    this.host.heavenlyCloudBackgroundButton.dataset.enabled=String(enabled);
    this.host.heavenlyCloudBackgroundButton.setAttribute("aria-pressed",String(enabled));
    this.host.heavenlyCloudBackgroundButton.setAttribute(
      "aria-label",
      controller.pending? "Applying Heavenly Cloud Background":`${action} Heavenly Cloud Background`,
    );
    this.host.heavenlyCloudBackgroundButton.disabled=this.host.backgroundActions.busy;

    const settings=controller.settings;
    for(const [key,control] of this.host.heavenlyCloudNumericControls) {
      const value=settings[key];
      const formatted=formatHeavenlyCloudControlValue(control.definition,value);
      control.input.value=String(value);
      control.input.disabled=controller.pending;
      control.input.setAttribute("aria-valuetext",formatted);
      control.output.textContent=formatted;
    }
    for(const button of this.host.heavenlyCloudQualityButtons) {
      button.setAttribute("aria-pressed",String(button.dataset.heavenlyCloudQuality===settings.quality));
      button.disabled=controller.pending;
    }
    this.host.heavenlyCloudPausedInput.checked=settings.paused;
    this.host.heavenlyCloudPausedInput.disabled=controller.pending;
    this.host.heavenlyCloudResetButton.disabled=controller.pending;
    this.host.heavenlyCloudReplayButton.disabled=controller.pending||!controller.enabled;
    const error=controller.error;
    this.heavenlyCloudPluginError.hidden=!error;
    this.heavenlyCloudPluginError.textContent=backgroundSettingsError(
      error,
      this.host.backgroundSettingsLanguage,
      "天境云隧道背景",
      "Heavenly Cloud Background",
    );
    this.host.heavenlyCloudSettingsPanel.setAttribute("aria-busy",String(controller.pending));
    if(this.heavenlyCloudSettingsOpen) requestAnimationFrame(() => this.positionHeavenlyCloudSettingsPanel());
  }
  toggleHeavenlyCloudSettings(): void {
    this.host.closeOtherSettings();
    if(this.heavenlyCloudSettingsOpen) {
      this.closeHeavenlyCloudSettings(true);
      return;
    }
    if(!this.host.previewMarketOpen) this.host.togglePreviewMarket();
    this.host.closeOtherSettings();
    this.heavenlyCloudSettingsOpen=true;
    this.host.heavenlyCloudSettingsTrigger.setAttribute("aria-expanded","true");
    this.renderHeavenlyCloudBackgroundPlugin();
    if(!this.host.heavenlyCloudSettingsPanel.matches(":popover-open")) this.host.heavenlyCloudSettingsPanel.showPopover();
    this.positionHeavenlyCloudSettingsPanel();
    queueMicrotask(() => {
      if(!this.heavenlyCloudSettingsOpen) return;
      this.positionHeavenlyCloudSettingsPanel();
      this.host.heavenlyCloudSettingsCloseButton.focus();
    });
  }
  closeHeavenlyCloudSettings(restoreFocus: boolean): void {
    if(!this.heavenlyCloudSettingsOpen&&!this.host.heavenlyCloudSettingsPanel.matches(":popover-open")) return;
    this.heavenlyCloudSettingsOpen=false;
    this.host.heavenlyCloudSettingsTrigger.setAttribute("aria-expanded","false");
    if(this.host.heavenlyCloudSettingsPanel.matches(":popover-open")) this.host.heavenlyCloudSettingsPanel.hidePopover();
    if(restoreFocus&&this.host.heavenlyCloudSettingsTrigger.isConnected) this.host.heavenlyCloudSettingsTrigger.focus();
  }
  positionHeavenlyCloudSettingsPanel(): void {
    if(!this.heavenlyCloudSettingsOpen||!this.host.heavenlyCloudSettingsPanel.matches(":popover-open")) return;
    const panel=this.host.heavenlyCloudSettingsPanel;
    const cardRect=this.heavenlyCloudBackgroundCard.getBoundingClientRect();
    const edge=12;
    const gap=8;
    const preferredWidth=344;
    const panelWidth=Math.min(preferredWidth,Math.max(240,window.innerWidth-edge*2));
    let left=cardRect.right+gap;
    let side="right";
    if(left+panelWidth>window.innerWidth-edge) {
      left=Math.max(edge,window.innerWidth-edge-panelWidth);
      side="overlay";
    }
    panel.style.width=`${panelWidth}px`;
    panel.style.maxHeight=`${Math.max(240,window.innerHeight-edge*2)}px`;
    const panelHeight=Math.min(panel.scrollHeight,Math.max(240,window.innerHeight-edge*2));
    const top=Math.min(
      Math.max(edge,cardRect.top),
      Math.max(edge,window.innerHeight-edge-panelHeight),
    );
    panel.style.left=`${Math.round(left)}px`;
    panel.style.top=`${Math.round(top)}px`;
    panel.style.setProperty(
      "--cle-particle-settings-anchor-y",
      `${Math.round(Math.min(panelHeight-18,Math.max(18,cardRect.top+cardRect.height*0.5-top)))}px`,
    );
    panel.dataset.side=side;
  }
}
