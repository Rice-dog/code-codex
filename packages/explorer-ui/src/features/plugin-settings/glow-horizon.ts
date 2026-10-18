import type { BackgroundCommands } from "../../contracts/appearance";
import type { GlowHorizonBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { backgroundSettingsError } from "../../components/parameter-format";
import { formatGlowHorizonControlValue } from "../../components/plugin-templates";
import { type BackgroundSettingsLanguage,type GlowHorizonNumericControlDefinition,type GlowHorizonNumericSettingKey } from "../../contracts/explorer-model";
import { GLOW_HORIZON_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
normalizeGlowHorizonSettings
} from "../../startup-background-renderers";
export interface GlowHorizonSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly glowHorizonBackgroundController: Pick<GlowHorizonBackgroundController,"enabled"|"error"|"pending"|"settings"|"updateSettings">;
  readonly enabledAppearancePlugins: ReadonlySet<string>;
  readonly glowHorizonNumericControls: Map<GlowHorizonNumericSettingKey,Readonly<{ definition: GlowHorizonNumericControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; }>>;
  readonly glowHorizonColorInputs: Map<"rimColor"|"violetColor"|"blueColor"|"shadowColor",HTMLInputElement>;
  readonly glowHorizonInertialWheelInput: HTMLInputElement;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly glowHorizonBackgroundButton: HTMLButtonElement;
  readonly shadow: ShadowRoot;
  readonly glowHorizonResetButton: HTMLButtonElement;
  readonly glowHorizonReplayButton: HTMLButtonElement;
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly glowHorizonSettingsPanel: HTMLElement;
  readonly previewMarketOpen: boolean;
  readonly togglePreviewMarket: () => void;
  readonly glowHorizonSettingsTrigger: HTMLButtonElement;
  readonly glowHorizonSettingsCloseButton: HTMLButtonElement;
}
export class GlowHorizonSettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  glowHorizonSettingsOpen = false;

  constructor(private readonly host: GlowHorizonSettingsControllerPorts) { }
  glowHorizonBackgroundCard!: HTMLElement;
  glowHorizonBackgroundStatus!: HTMLElement;
  glowHorizonPluginError!: HTMLElement;
  async initializeGlowHorizonBackground(generation: number): Promise<void> { await this.host.backgroundActions.initialize(GLOW_HORIZON_BACKGROUND_PLUGIN_ID,generation); }
  applyGlowHorizonSettingsFromControls(): void {
    const values: Record<string,unknown>={ ...this.host.glowHorizonBackgroundController.settings };
    for(const [key,control] of this.host.glowHorizonNumericControls) values[key]=control.input.value;
    for(const [key,input] of this.host.glowHorizonColorInputs) values[key]=input.value;
    values.inertialWheel=this.host.glowHorizonInertialWheelInput.checked;
    this.host.glowHorizonBackgroundController.updateSettings(normalizeGlowHorizonSettings(values));
  }
  async toggleGlowHorizonBackground(): Promise<void> { await this.host.backgroundActions.toggle(GLOW_HORIZON_BACKGROUND_PLUGIN_ID); }
  renderGlowHorizonBackgroundPlugin(): void {
    this.host.backgroundPackageMarket?.queueRender();
    const controller=this.host.glowHorizonBackgroundController;
    const enabled=this.host.enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
    const active=enabled&&controller.enabled;
    const action=enabled&&!active? "Retry":enabled? "Disable":"Enable";
    let status=enabled? "Enabled":"Disabled";
    if(controller.pending) status=enabled||controller.enabled? "Enabled · Applying":"Applying";
    else if(enabled&&!active) status="Enabled · Not applied";
    else if(active&&controller.error) status="Enabled · Notice";
    this.glowHorizonBackgroundStatus.textContent=status;
    this.glowHorizonBackgroundStatus.dataset.enabled=String(active);
    this.glowHorizonBackgroundStatus.dataset.pending=String(controller.pending);
    this.glowHorizonBackgroundCard.setAttribute("aria-busy",String(controller.pending));
    this.host.glowHorizonBackgroundButton.textContent=controller.pending? "Applying…":action;
    this.host.glowHorizonBackgroundButton.dataset.enabled=String(enabled);
    this.host.glowHorizonBackgroundButton.setAttribute("aria-pressed",String(enabled));
    this.host.glowHorizonBackgroundButton.setAttribute(
      "aria-label",
      controller.pending
        ? "Applying Glow Horizon Background"
        :`${action} Glow Horizon Background`,
    );
    this.host.glowHorizonBackgroundButton.disabled=this.host.backgroundActions.busy;

    const settings=controller.settings;
    for(const [key,control] of this.host.glowHorizonNumericControls) {
      const value=settings[key];
      const formatted=formatGlowHorizonControlValue(control.definition,value);
      control.input.value=String(value);
      control.input.disabled=controller.pending;
      control.input.setAttribute("aria-valuetext",formatted);
      control.output.textContent=formatted;
    }
    this.host.glowHorizonInertialWheelInput.checked=settings.inertialWheel;
    this.host.glowHorizonInertialWheelInput.disabled=controller.pending;
    for(const [key,input] of this.host.glowHorizonColorInputs) {
      input.value=settings[key];
      input.disabled=controller.pending;
    }
    for(const button of this.host.shadow.querySelectorAll<HTMLButtonElement>("[data-glow-horizon-direction]")) {
      button.setAttribute("aria-pressed",String(button.dataset.glowHorizonDirection===settings.variant));
      button.disabled=controller.pending;
    }
    this.host.glowHorizonResetButton.disabled=controller.pending;
    this.host.glowHorizonReplayButton.disabled=controller.pending||!controller.enabled;
    const error=controller.error;
    this.glowHorizonPluginError.hidden=!error;
    this.glowHorizonPluginError.textContent=backgroundSettingsError(
      error,
      this.host.backgroundSettingsLanguage,
      "发光地平线背景",
      "Glow Horizon Background",
    );
    this.host.glowHorizonSettingsPanel.setAttribute("aria-busy",String(controller.pending));
    if(this.glowHorizonSettingsOpen) requestAnimationFrame(() => this.positionGlowHorizonSettingsPanel());
  }
  toggleGlowHorizonSettings(): void {
    this.host.closeOtherSettings();
    if(this.glowHorizonSettingsOpen) {
      this.closeGlowHorizonSettings(true);
      return;
    }
    if(!this.host.previewMarketOpen) this.host.togglePreviewMarket();
    this.host.closeOtherSettings();
    this.glowHorizonSettingsOpen=true;
    this.host.glowHorizonSettingsTrigger.setAttribute("aria-expanded","true");
    this.renderGlowHorizonBackgroundPlugin();
    if(!this.host.glowHorizonSettingsPanel.matches(":popover-open")) this.host.glowHorizonSettingsPanel.showPopover();
    this.positionGlowHorizonSettingsPanel();
    queueMicrotask(() => {
      if(!this.glowHorizonSettingsOpen) return;
      this.positionGlowHorizonSettingsPanel();
      this.host.glowHorizonSettingsCloseButton.focus();
    });
  }
  closeGlowHorizonSettings(restoreFocus: boolean): void {
    if(!this.glowHorizonSettingsOpen&&!this.host.glowHorizonSettingsPanel.matches(":popover-open")) return;
    this.glowHorizonSettingsOpen=false;
    this.host.glowHorizonSettingsTrigger.setAttribute("aria-expanded","false");
    if(this.host.glowHorizonSettingsPanel.matches(":popover-open")) this.host.glowHorizonSettingsPanel.hidePopover();
    if(restoreFocus&&this.host.glowHorizonSettingsTrigger.isConnected) this.host.glowHorizonSettingsTrigger.focus();
  }
  positionGlowHorizonSettingsPanel(): void {
    if(!this.glowHorizonSettingsOpen||!this.host.glowHorizonSettingsPanel.matches(":popover-open")) return;
    const panel=this.host.glowHorizonSettingsPanel;
    const cardRect=this.glowHorizonBackgroundCard.getBoundingClientRect();
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
