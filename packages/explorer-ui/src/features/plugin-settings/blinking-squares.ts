import type { BackgroundCommands } from "../../contracts/appearance";
import type { BlinkingSquaresBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { type BlinkingSquaresSettings } from "../../blinking-squares-settings";
import { BLINKING_SQUARES_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import {
BLINKING_SQUARES_CONTROLS
} from "../../startup-background-renderers";
export interface BlinkingSquaresSettingsControllerPorts {
  readonly backgroundActions: BackgroundCommands;
  readonly shadow: ShadowRoot;
  readonly required: <T extends Element>(selector: string) => T;
  readonly previewMarketPopover: HTMLElement;
  readonly blinkingSquaresController: Pick<BlinkingSquaresBackgroundController,"enabled"|"error"|"pending"|"replay"|"reset"|"settings"|"updateSettings">;
  readonly appearanceTransitionPending: boolean;
  readonly appearancePluginPending: boolean;
  readonly backgroundText: (zh: string,en: string) => string;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
}
export class BlinkingSquaresSettingsController {
  constructor(private readonly host: BlinkingSquaresSettingsControllerPorts) { }
  blinkingSquaresEventsBound=false;
  closeBlinkingSquares(): void {
    const panel=this.host.shadow.querySelector<HTMLElement>("#cle-blinkingSquares-settings");
    if(panel?.matches(":popover-open")) panel.hidePopover();
    this.host.shadow.querySelector(".blinkingSquares-settings-trigger")?.setAttribute("aria-expanded","false");
  }
  positionBlinkingSquares(): void {
    const panel=this.host.required<HTMLElement>("#cle-blinkingSquares-settings");
    if(!panel.matches(":popover-open")) return;
    const rect=this.host.required<HTMLElement>(".blinkingSquares-settings-trigger").getBoundingClientRect();
    panel.style.position="fixed"; panel.style.margin="0";
    panel.style.maxHeight="calc(100vh - 24px)";
    const width=Math.min(344,window.innerWidth-24);
    panel.style.width=width+"px";
    panel.style.left=Math.max(12,Math.min(rect.right+12,window.innerWidth-width-12))+"px";
    panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-panel.getBoundingClientRect().height-12))+"px";
  }
  bindBlinkingSquares(): void {
    if(this.blinkingSquaresEventsBound) return;
    this.blinkingSquaresEventsBound=true;
    const panel=this.host.required<HTMLElement>("#cle-blinkingSquares-settings");
    const trigger=this.host.required<HTMLButtonElement>(".blinkingSquares-settings-trigger");
    this.host.required<HTMLButtonElement>(".blinkingSquares-enable").addEventListener("click",() => void this.toggleBlinkingSquares());
    trigger.addEventListener("click",() => {
      if(panel.matches(":popover-open")) { this.closeBlinkingSquares(); return; }
      for(const other of this.host.shadow.querySelectorAll<HTMLElement>(".particle-settings-panel")) {
        if(other!==panel&&other.matches(":popover-open")) other.hidePopover();
      }
      this.renderBlinkingSquares(); panel.showPopover(); this.positionBlinkingSquares();
      trigger.setAttribute("aria-expanded","true");
      this.host.required<HTMLButtonElement>(".blinkingSquares-close").focus();
    });
    this.host.required<HTMLButtonElement>(".blinkingSquares-close").addEventListener("click",() => { this.closeBlinkingSquares(); trigger.focus(); });
    panel.addEventListener("keydown",(event) => { if(event.key==="Escape") { event.stopPropagation(); this.closeBlinkingSquares(); trigger.focus(); } });
    panel.addEventListener("toggle",() => trigger.setAttribute("aria-expanded",String(panel.matches(":popover-open"))));
    this.host.previewMarketPopover.addEventListener("scroll",() => this.positionBlinkingSquares());
    for(const [key] of BLINKING_SQUARES_CONTROLS) {
      const input=this.host.required<HTMLInputElement>(`#cle-blinkingSquares-${key}`);
      input.addEventListener("input",() => this.host.blinkingSquaresController.updateSettings({ ...this.host.blinkingSquaresController.settings,[key]: Number(input.value) }));
    }
    for(const input of panel.querySelectorAll<HTMLInputElement>("[data-blinking-squares-toggle]")) {
      input.addEventListener("change",() => {
        const key=input.dataset.blinkingSquaresToggle as "mouseInteraction"|"keyboardInteraction"|"introEnabled"|"paused";
        this.host.blinkingSquaresController.updateSettings({ ...this.host.blinkingSquaresController.settings,[key]: input.checked });
      });
    }
    for(const input of panel.querySelectorAll<HTMLInputElement>("[data-blinking-squares-color]")) {
      input.addEventListener("input",() => {
        const key=input.dataset.blinkingSquaresColor as "squareColor"|"backgroundColor";
        this.host.blinkingSquaresController.updateSettings({ ...this.host.blinkingSquaresController.settings,[key]: input.value });
      });
    }
    for(const button of panel.querySelectorAll<HTMLButtonElement>("[data-blinking-squares-direction]")) {
      button.addEventListener("click",() => this.host.blinkingSquaresController.updateSettings({
        ...this.host.blinkingSquaresController.settings,
        direction: button.dataset.blinkingSquaresDirection as BlinkingSquaresSettings["direction"],
      }));
    }
    this.host.required<HTMLButtonElement>(".blinkingSquares-reset").addEventListener("click",() => this.host.blinkingSquaresController.reset());
    this.host.required<HTMLButtonElement>(".blinkingSquares-replay").addEventListener("click",() => this.host.blinkingSquaresController.replay());
  }
  renderBlinkingSquares(): void {
    const card=this.host.shadow.querySelector<HTMLElement>(`[data-appearance-plugin="${BLINKING_SQUARES_BACKGROUND_PLUGIN_ID}"]`);
    if(!card) return;
    const controller=this.host.blinkingSquaresController;
    const settings=controller.settings;
    const busy=controller.pending||this.host.appearanceTransitionPending||this.host.appearancePluginPending;
    const button=this.host.required<HTMLButtonElement>(".blinkingSquares-enable");
    button.textContent=controller.enabled? "Disable":"Enable";
    button.disabled=busy;
    button.setAttribute("aria-pressed",String(controller.enabled));
    button.setAttribute("aria-label",`${controller.enabled? "Disable":"Enable"} Blinking Squares Background`);
    const status=this.host.required<HTMLElement>(".blinkingSquares-status");
    status.textContent=controller.pending? "Applying…":controller.error? "Unavailable":controller.enabled? "Enabled":"Disabled";
    status.dataset.enabled=String(controller.enabled);
    for(const [key,zh,en] of BLINKING_SQUARES_CONTROLS) {
      const input=this.host.required<HTMLInputElement>(`#cle-blinkingSquares-${key}`);
      if(this.host.shadow.activeElement!==input) input.value=String(settings[key]);
      input.disabled=busy;
      input.setAttribute("aria-label",this.host.backgroundText(zh,en));
      input.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(String(settings[key])));
    }
    for(const input of this.host.shadow.querySelectorAll<HTMLInputElement>("[data-blinking-squares-toggle]")) {
      const key=input.dataset.blinkingSquaresToggle as "mouseInteraction"|"keyboardInteraction"|"introEnabled"|"paused";
      input.checked=settings[key]; input.disabled=busy;
    }
    for(const input of this.host.shadow.querySelectorAll<HTMLInputElement>("[data-blinking-squares-color]")) {
      const key=input.dataset.blinkingSquaresColor as "squareColor"|"backgroundColor";
      input.value=settings[key]; input.disabled=busy;
    }
    for(const direction of this.host.shadow.querySelectorAll<HTMLButtonElement>("[data-blinking-squares-direction]")) {
      direction.setAttribute("aria-pressed",String(direction.dataset.blinkingSquaresDirection===settings.direction));
      direction.disabled=busy;
    }
    this.host.required<HTMLButtonElement>(".blinkingSquares-reset").disabled=busy;
    this.host.required<HTMLButtonElement>(".blinkingSquares-replay").disabled=busy||!controller.enabled;
    const error=this.host.required<HTMLElement>(".blinkingSquares-error");
    error.textContent=controller.error??""; error.hidden=!controller.error;
    this.host.backgroundPackageMarket?.queueRender();
  }
  async toggleBlinkingSquares(): Promise<void> { await this.host.backgroundActions.toggle(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID); }
}
