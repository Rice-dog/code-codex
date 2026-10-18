import type { BackgroundCommands } from "../../contracts/appearance";
import type { MilkyWayBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { backgroundSettingsError } from "../../components/parameter-format";
import { formatMilkyWayControlValue } from "../../components/plugin-templates";
import { type BackgroundSettingsLanguage } from "../../contracts/explorer-model";
import { MILKY_WAY_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
MilkyWayNumericControlDefinition,
MilkyWayNumericSettingKey,
normalizeMilkyWaySettings
} from "../../startup-background-renderers";
export interface MilkyWaySettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly enabledAppearancePlugins: ReadonlySet<string>;
  readonly milkyWayBackgroundController: Pick<MilkyWayBackgroundController,"enabled"|"error"|"pending"|"settings"|"updateSettings">;
  readonly milkyWayNumericControls: Map<MilkyWayNumericSettingKey,Readonly<{ definition: MilkyWayNumericControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; }>>;
  readonly shadow: ShadowRoot;
  readonly required: <T extends Element>(selector: string) => T;
  readonly milkyWayPausedInput: HTMLInputElement;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly milkyWayBackgroundButton: HTMLButtonElement;
  readonly milkyWayQualityButtons: readonly HTMLButtonElement[];
  readonly milkyWayResetButton: HTMLButtonElement;
  readonly milkyWayReplayButton: HTMLButtonElement;
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly milkyWaySettingsPanel: HTMLElement;
  readonly previewMarketOpen: boolean;
  readonly togglePreviewMarket: () => void;
  readonly milkyWaySettingsTrigger: HTMLButtonElement;
  readonly milkyWaySettingsCloseButton: HTMLButtonElement;
}
export class MilkyWaySettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  milkyWaySettingsOpen = false;

  constructor(private readonly host: MilkyWaySettingsControllerPorts) { }
  milkyWayBackgroundCard!: HTMLElement;
  milkyWayBackgroundStatus!: HTMLElement;
  milkyWayPluginError!: HTMLElement;
  async deactivateMilkyWayForBackgroundSwitch(): Promise<void> { await this.host.backgroundActions.deactivate(MILKY_WAY_BACKGROUND_PLUGIN_ID); }
  async initializeMilkyWayBackground(generation: number): Promise<void> { await this.host.backgroundActions.initialize(MILKY_WAY_BACKGROUND_PLUGIN_ID,generation); }
  applyMilkyWaySettingsFromControls(): void {
    const values: Record<string,unknown>={ ...this.host.milkyWayBackgroundController.settings };
    for(const [key,control] of this.host.milkyWayNumericControls) values[key]=control.input.value;
    values.colors=Array.from(this.host.shadow.querySelectorAll<HTMLInputElement>("[data-milky-way-color]"),input => input.value);
    values.introEnabled=this.host.required<HTMLInputElement>("#cle-milky-way-intro-enabled").checked;
    values.paused=this.host.milkyWayPausedInput.checked;
    this.host.milkyWayBackgroundController.updateSettings(normalizeMilkyWaySettings(values));
  }
  async toggleMilkyWayBackground(): Promise<void> { await this.host.backgroundActions.toggle(MILKY_WAY_BACKGROUND_PLUGIN_ID); }
  renderMilkyWayBackgroundPlugin(): void {
    this.host.backgroundPackageMarket?.queueRender();
    const controller=this.host.milkyWayBackgroundController;
    const enabled=this.host.enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID);
    const active=enabled&&controller.enabled;
    const action=enabled&&!active? "Retry":enabled? "Disable":"Enable";
    let status=enabled? "Enabled":"Disabled";
    if(controller.pending) status=enabled||controller.enabled? "Enabled · Applying":"Applying";
    else if(enabled&&!active) status="Enabled · Not applied";
    else if(active&&controller.error) status="Enabled · Notice";
    this.milkyWayBackgroundStatus.textContent=status;
    this.milkyWayBackgroundStatus.dataset.enabled=String(active);
    this.milkyWayBackgroundStatus.dataset.pending=String(controller.pending);
    this.milkyWayBackgroundCard.setAttribute("aria-busy",String(controller.pending));
    this.host.milkyWayBackgroundButton.textContent=controller.pending? "Applying…":action;
    this.host.milkyWayBackgroundButton.dataset.enabled=String(enabled);
    this.host.milkyWayBackgroundButton.setAttribute("aria-pressed",String(enabled));
    this.host.milkyWayBackgroundButton.setAttribute(
      "aria-label",
      controller.pending? "Applying Milky Way Background":`${action} Milky Way Background`,
    );
    this.host.milkyWayBackgroundButton.disabled=this.host.backgroundActions.busy;
    const settings=controller.settings;
    this.host.required<HTMLInputElement>("#cle-milky-way-intro-enabled").checked=settings.introEnabled;
    this.host.shadow.querySelectorAll<HTMLInputElement>("[data-milky-way-color]").forEach((input,i) => { input.value=settings.colors[i]!; input.disabled=controller.pending; });
    for(const [key,control] of this.host.milkyWayNumericControls) {
      const value=settings[key];
      const formatted=formatMilkyWayControlValue(control.definition,value);
      control.input.value=String(value);
      control.input.disabled=controller.pending;
      control.input.setAttribute("aria-valuetext",formatted);
      control.output.textContent=formatted;
    }
    for(const button of this.host.milkyWayQualityButtons) {
      button.setAttribute("aria-pressed",String(button.dataset.milkyWayQuality===settings.quality));
      button.disabled=controller.pending;
    }
    this.host.milkyWayPausedInput.checked=settings.paused;
    this.host.milkyWayPausedInput.disabled=controller.pending;
    this.host.milkyWayResetButton.disabled=controller.pending;
    this.host.milkyWayReplayButton.disabled=controller.pending||!controller.enabled;
    const error=controller.error;
    this.milkyWayPluginError.hidden=!error;
    this.milkyWayPluginError.textContent=backgroundSettingsError(
      error,
      this.host.backgroundSettingsLanguage,
      "银河光场背景",
      "Milky Way Background",
    );
    this.host.milkyWaySettingsPanel.setAttribute("aria-busy",String(controller.pending));
    if(this.milkyWaySettingsOpen) requestAnimationFrame(() => this.positionMilkyWaySettingsPanel());
  }
  toggleMilkyWaySettings(): void {
    if(this.milkyWaySettingsOpen) {
      this.closeMilkyWaySettings(true);
      return;
    }
    if(!this.host.previewMarketOpen) this.host.togglePreviewMarket();
    this.host.closeOtherSettings();
    this.milkyWaySettingsOpen=true;
    this.host.milkyWaySettingsTrigger.setAttribute("aria-expanded","true");
    this.renderMilkyWayBackgroundPlugin();
    if(!this.host.milkyWaySettingsPanel.matches(":popover-open")) this.host.milkyWaySettingsPanel.showPopover();
    this.positionMilkyWaySettingsPanel();
    queueMicrotask(() => {
      if(!this.milkyWaySettingsOpen) return;
      this.positionMilkyWaySettingsPanel();
      this.host.milkyWaySettingsCloseButton.focus();
    });
  }
  closeMilkyWaySettings(restoreFocus: boolean): void {
    if(!this.milkyWaySettingsOpen&&!this.host.milkyWaySettingsPanel.matches(":popover-open")) return;
    this.milkyWaySettingsOpen=false;
    this.host.milkyWaySettingsTrigger.setAttribute("aria-expanded","false");
    if(this.host.milkyWaySettingsPanel.matches(":popover-open")) this.host.milkyWaySettingsPanel.hidePopover();
    if(restoreFocus&&this.host.milkyWaySettingsTrigger.isConnected) this.host.milkyWaySettingsTrigger.focus();
  }
  positionMilkyWaySettingsPanel(): void {
    if(!this.milkyWaySettingsOpen||!this.host.milkyWaySettingsPanel.matches(":popover-open")) return;
    const panel=this.host.milkyWaySettingsPanel;
    const cardRect=this.milkyWayBackgroundCard.getBoundingClientRect();
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
