import type { BackgroundCommands } from "../../contracts/appearance";
import type { AuroraIonosphereBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { backgroundSettingsError } from "../../components/parameter-format";
import { formatAuroraIonosphereControlValue } from "../../components/plugin-templates";
import { type BackgroundSettingsLanguage } from "../../contracts/explorer-model";
import { AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
AuroraIonosphereNumericControlDefinition,
AuroraIonosphereNumericSettingKey,
normalizeAuroraIonosphereSettings
} from "../../startup-background-renderers";
export interface AuroraIonosphereSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly enabledAppearancePlugins: ReadonlySet<string>;
  readonly auroraIonosphereBackgroundController: Pick<AuroraIonosphereBackgroundController,"enabled"|"error"|"pending"|"settings"|"updateSettings">;
  readonly auroraIonosphereNumericControls: Map<AuroraIonosphereNumericSettingKey,Readonly<{ definition: AuroraIonosphereNumericControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; }>>;
  readonly auroraIonospherePausedInput: HTMLInputElement;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly auroraIonosphereBackgroundButton: HTMLButtonElement;
  readonly auroraIonosphereQualityButtons: readonly HTMLButtonElement[];
  readonly auroraIonosphereResetButton: HTMLButtonElement;
  readonly auroraIonosphereReplayButton: HTMLButtonElement;
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly auroraIonosphereSettingsPanel: HTMLElement;
  readonly milkyWaySettingsOpen: boolean;
  readonly positionMilkyWaySettingsPanel: () => void;
  readonly previewMarketOpen: boolean;
  readonly togglePreviewMarket: () => void;
  readonly auroraIonosphereSettingsTrigger: HTMLButtonElement;
  readonly renderMilkyWayBackgroundPlugin: () => void;
  readonly auroraIonosphereSettingsCloseButton: HTMLButtonElement;
}
export class AuroraIonosphereSettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  auroraIonosphereSettingsOpen = false;

  constructor(private readonly host: AuroraIonosphereSettingsControllerPorts) { }
  auroraIonosphereBackgroundCard!: HTMLElement;
  auroraIonosphereBackgroundStatus!: HTMLElement;
  auroraIonospherePluginError!: HTMLElement;
  async deactivateAuroraIonosphereForBackgroundSwitch(): Promise<void> { await this.host.backgroundActions.deactivate(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID); }
  async initializeAuroraIonosphereBackground(generation: number): Promise<void> { await this.host.backgroundActions.initialize(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,generation); }
  applyAuroraIonosphereSettingsFromControls(): void {
    const values: Record<string,unknown>={ ...this.host.auroraIonosphereBackgroundController.settings };
    for(const [key,control] of this.host.auroraIonosphereNumericControls) values[key]=control.input.value;
    values.paused=this.host.auroraIonospherePausedInput.checked;
    this.host.auroraIonosphereBackgroundController.updateSettings(normalizeAuroraIonosphereSettings(values));
  }
  async toggleAuroraIonosphereBackground(): Promise<void> { await this.host.backgroundActions.toggle(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID); }
  renderAuroraIonosphereBackgroundPlugin(): void {
    this.host.backgroundPackageMarket?.queueRender();
    const controller=this.host.auroraIonosphereBackgroundController;
    const enabled=this.host.enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
    const active=enabled&&controller.enabled;
    const action=enabled&&!active? "Retry":enabled? "Disable":"Enable";
    let status=enabled? "Enabled":"Disabled";
    if(controller.pending) status=enabled||controller.enabled? "Enabled · Applying":"Applying";
    else if(enabled&&!active) status="Enabled · Not applied";
    else if(active&&controller.error) status="Enabled · Notice";
    this.auroraIonosphereBackgroundStatus.textContent=status;
    this.auroraIonosphereBackgroundStatus.dataset.enabled=String(active);
    this.auroraIonosphereBackgroundStatus.dataset.pending=String(controller.pending);
    this.auroraIonosphereBackgroundCard.setAttribute("aria-busy",String(controller.pending));
    this.host.auroraIonosphereBackgroundButton.textContent=controller.pending? "Applying…":action;
    this.host.auroraIonosphereBackgroundButton.dataset.enabled=String(enabled);
    this.host.auroraIonosphereBackgroundButton.setAttribute("aria-pressed",String(enabled));
    this.host.auroraIonosphereBackgroundButton.setAttribute(
      "aria-label",
      controller.pending? "Applying Aurora Ionosphere Background":`${action} Aurora Ionosphere Background`,
    );
    this.host.auroraIonosphereBackgroundButton.disabled=this.host.backgroundActions.busy;
    const settings=controller.settings;
    for(const [key,control] of this.host.auroraIonosphereNumericControls) {
      const value=settings[key];
      const formatted=formatAuroraIonosphereControlValue(control.definition,value);
      control.input.value=String(value);
      control.input.disabled=controller.pending;
      control.input.setAttribute("aria-valuetext",formatted);
      control.output.textContent=formatted;
    }
    for(const button of this.host.auroraIonosphereQualityButtons) {
      button.setAttribute("aria-pressed",String(button.dataset.auroraIonosphereQuality===settings.quality));
      button.disabled=controller.pending;
    }
    this.host.auroraIonospherePausedInput.checked=settings.paused;
    this.host.auroraIonospherePausedInput.disabled=controller.pending;
    this.host.auroraIonosphereResetButton.disabled=controller.pending;
    this.host.auroraIonosphereReplayButton.disabled=controller.pending||!controller.enabled;
    const error=controller.error;
    this.auroraIonospherePluginError.hidden=!error;
    this.auroraIonospherePluginError.textContent=backgroundSettingsError(
      error,
      this.host.backgroundSettingsLanguage,
      "极光电离层背景",
      "Aurora Ionosphere Background",
    );
    this.host.auroraIonosphereSettingsPanel.setAttribute("aria-busy",String(controller.pending));
    if(this.auroraIonosphereSettingsOpen) requestAnimationFrame(() => this.positionAuroraIonosphereSettingsPanel());
    if(this.host.milkyWaySettingsOpen) requestAnimationFrame(() => this.host.positionMilkyWaySettingsPanel());
  }
  toggleAuroraIonosphereSettings(): void {
    this.host.closeOtherSettings();
    if(this.auroraIonosphereSettingsOpen) {
      this.closeAuroraIonosphereSettings(true);
      return;
    }
    if(!this.host.previewMarketOpen) this.host.togglePreviewMarket();
    this.host.closeOtherSettings();
    this.auroraIonosphereSettingsOpen=true;
    this.host.auroraIonosphereSettingsTrigger.setAttribute("aria-expanded","true");
    this.renderAuroraIonosphereBackgroundPlugin();
    this.host.renderMilkyWayBackgroundPlugin();
    if(!this.host.auroraIonosphereSettingsPanel.matches(":popover-open")) this.host.auroraIonosphereSettingsPanel.showPopover();
    this.positionAuroraIonosphereSettingsPanel();
    queueMicrotask(() => {
      if(!this.auroraIonosphereSettingsOpen) return;
      this.positionAuroraIonosphereSettingsPanel();
      this.host.auroraIonosphereSettingsCloseButton.focus();
    });
  }
  closeAuroraIonosphereSettings(restoreFocus: boolean): void {
    if(!this.auroraIonosphereSettingsOpen&&!this.host.auroraIonosphereSettingsPanel.matches(":popover-open")) return;
    this.auroraIonosphereSettingsOpen=false;
    this.host.auroraIonosphereSettingsTrigger.setAttribute("aria-expanded","false");
    if(this.host.auroraIonosphereSettingsPanel.matches(":popover-open")) this.host.auroraIonosphereSettingsPanel.hidePopover();
    if(restoreFocus&&this.host.auroraIonosphereSettingsTrigger.isConnected) this.host.auroraIonosphereSettingsTrigger.focus();
  }
  positionAuroraIonosphereSettingsPanel(): void {
    if(!this.auroraIonosphereSettingsOpen||!this.host.auroraIonosphereSettingsPanel.matches(":popover-open")) return;
    const panel=this.host.auroraIonosphereSettingsPanel;
    const cardRect=this.auroraIonosphereBackgroundCard.getBoundingClientRect();
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
