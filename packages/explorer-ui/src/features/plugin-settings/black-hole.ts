import type { BackgroundCommands } from "../../contracts/appearance";
import type { BlackHoleBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { backgroundSettingsError } from "../../components/parameter-format";
import { formatBlackHoleControlValue } from "../../components/plugin-templates";
import { type BackgroundSettingsLanguage,type BlackHoleColorSettingKey,type BlackHoleNumericControlDefinition,type BlackHoleNumericSettingKey,type BlackHolePresetName } from "../../contracts/explorer-model";
import { BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PRESETS } from "../../core/configuration/explorer";
import {
normalizeBlackHoleSettings
} from "../../startup-background-renderers";
export interface BlackHoleSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly blackHoleBackgroundController: Pick<BlackHoleBackgroundController,"enabled"|"error"|"pending"|"settings"|"updateSettings">;
  readonly enabledAppearancePlugins: ReadonlySet<string>;
  readonly blackHoleNumericControls: Map<BlackHoleNumericSettingKey,Readonly<{ definition: BlackHoleNumericControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; }>>;
  readonly blackHoleColorInputs: Map<BlackHoleColorSettingKey,HTMLInputElement>;
  readonly blackHolePausedInput: HTMLInputElement;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly blackHoleBackgroundButton: HTMLButtonElement;
  readonly blackHoleResetButton: HTMLButtonElement;
  readonly blackHolePresetButtons: readonly HTMLButtonElement[];
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly blackHoleSettingsPanel: HTMLElement;
  readonly previewMarketOpen: boolean;
  readonly togglePreviewMarket: () => void;
  readonly blackHoleSettingsTrigger: HTMLButtonElement;
  readonly blackHoleSettingsCloseButton: HTMLButtonElement;
}
export class BlackHoleSettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  blackHoleSettingsOpen = false;

  constructor(private readonly host: BlackHoleSettingsControllerPorts) { }
  blackHoleBackgroundCard!: HTMLElement;
  blackHoleBackgroundStatus!: HTMLElement;
  blackHolePluginError!: HTMLElement;
  async initializeBlackHoleBackground(generation: number): Promise<void> { await this.host.backgroundActions.initialize(BLACK_HOLE_BACKGROUND_PLUGIN_ID,generation); }
  async toggleBlackHoleBackground(): Promise<void> { await this.host.backgroundActions.toggle(BLACK_HOLE_BACKGROUND_PLUGIN_ID); }
  applyBlackHoleSettingsFromControls(): void {
    const values: Record<string,unknown>={ ...this.host.blackHoleBackgroundController.settings };
    for(const [key,control] of this.host.blackHoleNumericControls) values[key]=control.input.value;
    for(const [key,input] of this.host.blackHoleColorInputs) values[key]=input.value;
    values.paused=this.host.blackHolePausedInput.checked;
    this.host.blackHoleBackgroundController.updateSettings(normalizeBlackHoleSettings(values));
  }
  renderBlackHoleBackgroundPlugin(): void {
    this.host.backgroundPackageMarket?.queueRender();
    const controller=this.host.blackHoleBackgroundController;
    const enabled=this.host.enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
    const active=enabled&&controller.enabled;
    const action=enabled&&!active? "Retry":enabled? "Disable":"Enable";
    let status=enabled? "Enabled":"Disabled";
    if(controller.pending) status=enabled||controller.enabled? "Enabled · Applying":"Applying";
    else if(enabled&&!active) status="Enabled · Not applied";
    else if(active&&controller.error) status="Enabled · Notice";
    this.blackHoleBackgroundStatus.textContent=status;
    this.blackHoleBackgroundStatus.dataset.enabled=String(active);
    this.blackHoleBackgroundStatus.dataset.pending=String(controller.pending);
    this.blackHoleBackgroundCard.setAttribute("aria-busy",String(controller.pending));
    this.host.blackHoleBackgroundButton.textContent=controller.pending? "Applying…":action;
    this.host.blackHoleBackgroundButton.dataset.enabled=String(enabled);
    this.host.blackHoleBackgroundButton.setAttribute("aria-pressed",String(enabled));
    this.host.blackHoleBackgroundButton.setAttribute(
      "aria-label",
      controller.pending
        ? "Applying Black Hole Background"
        :`${action} Black Hole Background`,
    );
    this.host.blackHoleBackgroundButton.disabled=this.host.backgroundActions.busy;

    const settings=controller.settings;
    for(const [key,control] of this.host.blackHoleNumericControls) {
      const value=settings[key];
      const formatted=formatBlackHoleControlValue(control.definition,value);
      control.input.value=String(value);
      control.input.disabled=controller.pending;
      control.input.setAttribute("aria-valuetext",formatted);
      control.output.textContent=formatted;
    }
    for(const [key,input] of this.host.blackHoleColorInputs) {
      input.value=settings[key];
      input.disabled=controller.pending;
    }
    this.host.blackHolePausedInput.checked=settings.paused;
    this.host.blackHolePausedInput.disabled=controller.pending;
    this.host.blackHoleResetButton.disabled=controller.pending;
    for(const button of this.host.blackHolePresetButtons) {
      const preset=button.dataset.blackHolePreset as BlackHolePresetName|undefined;
      const selected=Boolean(preset&&JSON.stringify(settings)===JSON.stringify(BLACK_HOLE_BACKGROUND_PRESETS[preset]));
      button.disabled=controller.pending;
      button.setAttribute("aria-pressed",String(selected));
    }
    const error=controller.error;
    this.blackHolePluginError.hidden=!error;
    this.blackHolePluginError.textContent=backgroundSettingsError(
      error,
      this.host.backgroundSettingsLanguage,
      "黑洞背景",
      "Black Hole Background",
    );
    this.host.blackHoleSettingsPanel.setAttribute("aria-busy",String(controller.pending));
    if(this.blackHoleSettingsOpen) requestAnimationFrame(() => this.positionBlackHoleSettingsPanel());
  }
  toggleBlackHoleSettings(): void {
    this.host.closeOtherSettings();
    if(this.blackHoleSettingsOpen) {
      this.closeBlackHoleSettings(true);
      return;
    }
    if(!this.host.previewMarketOpen) this.host.togglePreviewMarket();
    this.host.closeOtherSettings();
    this.blackHoleSettingsOpen=true;
    this.host.blackHoleSettingsTrigger.setAttribute("aria-expanded","true");
    this.renderBlackHoleBackgroundPlugin();
    if(!this.host.blackHoleSettingsPanel.matches(":popover-open")) this.host.blackHoleSettingsPanel.showPopover();
    this.positionBlackHoleSettingsPanel();
    queueMicrotask(() => {
      if(!this.blackHoleSettingsOpen) return;
      this.positionBlackHoleSettingsPanel();
      this.host.blackHoleSettingsCloseButton.focus();
    });
  }
  closeBlackHoleSettings(restoreFocus: boolean): void {
    if(!this.blackHoleSettingsOpen&&!this.host.blackHoleSettingsPanel.matches(":popover-open")) return;
    this.blackHoleSettingsOpen=false;
    this.host.blackHoleSettingsTrigger.setAttribute("aria-expanded","false");
    if(this.host.blackHoleSettingsPanel.matches(":popover-open")) this.host.blackHoleSettingsPanel.hidePopover();
    if(restoreFocus&&this.host.blackHoleSettingsTrigger.isConnected) this.host.blackHoleSettingsTrigger.focus();
  }
  positionBlackHoleSettingsPanel(): void {
    if(!this.blackHoleSettingsOpen||!this.host.blackHoleSettingsPanel.matches(":popover-open")) return;
    const panel=this.host.blackHoleSettingsPanel;
    const cardRect=this.blackHoleBackgroundCard.getBoundingClientRect();
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
