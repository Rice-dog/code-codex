// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { WorkspaceBridge,ExplorerBridgeError } from "../../bridge";
import { type ExplorerViewState } from "../../contracts/bridge";
import { type UpdateCheckPresentation,type UpdateCheckResult } from "../../contracts/explorer-model";
import { errorCode } from "../../core/bridge/response-validation";
import { runtimeEvent } from "../../runtime-events";
import { recordCaughtRuntimeError,runtimeErrorDetails } from "../../runtime-operations";
import { VersionFeedback } from "../../version-feedback";
import { normalizeUpdateCheckResult,normalizeUpdateInstallResult,updateCheckError,updateInstallError } from "../updates/responses";
export interface UpdatesControllerPorts {
  readonly versionFeedback: Pick<VersionFeedback,"cancel"|"show">;
  readonly actionNotice: HTMLElement;
  readonly hideActionNotice: () => void;
  readonly state: ExplorerViewState;
  readonly bridge: WorkspaceBridge|undefined;
  readonly renderStatus: () => void;
  readonly showActionNotice: (message: string,tone?: "success"|"error") => void;
  readonly showActionProgress: (message: string) => void;
  readonly connected: boolean;
  readonly closePreviewMarket: (restoreFocus: boolean) => void;
  readonly updateMessage: HTMLElement;
  readonly updatePopover: HTMLElement;
  readonly statusCode: HTMLButtonElement;
  readonly updateInstallButton: HTMLButtonElement;
  readonly updateLaterButton: HTMLButtonElement;
}
export class UpdatesController {
async checkStartupVersion(): Promise<void> {
    if(this.startupUpdateStarted) return;
    this.startupUpdateStarted=true;
    await this.checkForUpdates(true);
  }

  // State belongs to this feature; the application consumes it explicitly.
  updateCheckPending = false;
  updateCheckPresentation: UpdateCheckPresentation = "idle";
  updateCheckSummary = `Check GitHub for updates (current version v${__CODE_CODEX_VERSION__})`;
  updateCandidate: UpdateCheckResult | undefined;
  updateDialogOpen = false;
  updateInstallPending = false;

  constructor(private readonly host: UpdatesControllerPorts) { }
  startupUpdateStarted=false;
  updateCheckOperation=0;
  cancelUpdateCheck(): void {
    if(this.updateCheckPending) this.startupUpdateStarted=false;
    this.host.versionFeedback.cancel();
    this.updateCheckOperation+=1;
    this.updateCheckPending=false;
    this.updateInstallPending=false;
    this.updateCandidate=undefined;
    this.closeUpdateDialog(false);
    if(this.updateCheckPresentation==="checking") {
      this.updateCheckPresentation="idle";
      this.updateCheckSummary=`Check GitHub for updates (current version v${__CODE_CODEX_VERSION__})`;
      if(!this.host.actionNotice.hidden&&this.host.actionNotice.dataset.tone==="progress") this.host.hideActionNotice();
    }
  }
  async checkForUpdates(automatic=false): Promise<void> {
    const versionVisible=this.host.state==="ready"||this.host.state==="empty"||this.host.state==="no-project";
    if((!automatic&&!versionVisible)||this.updateCheckPending) return;

    const bridge=this.host.bridge;
    if(!bridge?.available) {
      this.updateCheckPresentation="error";
      this.updateCheckSummary="Could not check GitHub because Code-Codex is disconnected.";
      this.host.renderStatus();
      this.host.showActionNotice(this.updateCheckSummary,"error");
      return;
    }

    this.closeUpdateDialog(false);
    this.updateCandidate=undefined;
    const operation=++this.updateCheckOperation;
    this.updateCheckPending=true;
    this.updateCheckPresentation="checking";
    this.updateCheckSummary="Checking GitHub for the latest release…";
    this.host.renderStatus();
    if(!automatic) this.host.showActionProgress(this.updateCheckSummary);
    runtimeEvent("renderer","version check","started",{ automatic });

    try {
      const result=normalizeUpdateCheckResult(await bridge.request<unknown>(automatic? "explorer.update.startup":"explorer.update.check",{}));
      if(operation!==this.updateCheckOperation||!this.host.connected||bridge!==this.host.bridge) return;

      this.updateCheckPresentation=result.status;
      runtimeEvent("renderer","version check",result.status,{ automatic,currentVersion: result.currentVersion,latestVersion: result.latestVersion });
      if(result.status==="updateAvailable") {
        this.updateCheckSummary=`Code-Codex v${result.latestVersion} is available. You are using v${result.currentVersion}.`;
        this.updateCandidate=result;
        if(automatic) this.host.versionFeedback.show("update",result.latestVersion);
        else { this.host.hideActionNotice(); this.openUpdateDialog(result); }
      } else if(result.status==="ahead") {
        this.updateCheckSummary=`This build (v${result.currentVersion}) is newer than GitHub’s latest published release (v${result.latestVersion}).`;
        if(!automatic) this.host.showActionNotice(this.updateCheckSummary);
      } else {
        this.updateCheckSummary=`Code-Codex v${result.currentVersion} is up to date.`;
        if(automatic) this.host.versionFeedback.show("latest");
        else this.host.showActionNotice(this.updateCheckSummary);
      }
    } catch(error) {
      recordCaughtRuntimeError("#checkForUpdates",error);

      if(operation!==this.updateCheckOperation||!this.host.connected||bridge!==this.host.bridge) return;
      this.updateCheckPresentation="error";
      this.updateCheckSummary=updateCheckError(error);
      runtimeEvent("renderer","version check","failed",{ automatic,code: errorCode(error),...runtimeErrorDetails(error) });
      if(automatic) this.host.versionFeedback.show("error");
      else this.host.showActionNotice(this.updateCheckSummary,"error");
    } finally {
      if(operation===this.updateCheckOperation) {
        this.updateCheckPending=false;
        this.host.renderStatus();
      }
    }
  }
  openUpdateDialog(result: UpdateCheckResult): void {
    this.host.closePreviewMarket(false);
    this.updateCandidate=result;
    this.updateDialogOpen=true;
    this.host.updateMessage.textContent=`v${result.latestVersion} is available. You are using v${result.currentVersion}.`;
    this.host.updatePopover.hidden=false;
    this.host.statusCode.setAttribute("aria-expanded","true");
    this.renderUpdateDialog();
    queueMicrotask(() => {
      if(this.updateDialogOpen&&!this.updateInstallPending) this.host.updateInstallButton.focus();
    });
  }
  closeUpdateDialog(restoreFocus: boolean): void {
    if(this.updateInstallPending) return;
    if(!this.updateDialogOpen&&this.host.updatePopover.hidden) return;
    this.updateDialogOpen=false;
    this.host.updatePopover.hidden=true;
    this.host.statusCode.setAttribute("aria-expanded","false");
    if(restoreFocus&&this.host.statusCode.isConnected) this.host.statusCode.focus();
  }
  renderUpdateDialog(): void {
    this.host.updateLaterButton.disabled=this.updateInstallPending;
    this.host.updateInstallButton.disabled=this.updateInstallPending;
    this.host.updateInstallButton.textContent=this.updateInstallPending? "Preparing…":"Update";
    this.host.updatePopover.setAttribute("aria-busy",String(this.updateInstallPending));
  }
  async installUpdate(): Promise<void> {
    const candidate=this.updateCandidate;
    const bridge=this.host.bridge;
    if(!candidate||!bridge?.available||this.updateInstallPending) return;

    const operation=this.updateCheckOperation;
    this.updateInstallPending=true;
    this.renderUpdateDialog();
    this.host.renderStatus();
    this.host.showActionProgress(`Downloading and verifying Code-Codex v${candidate.latestVersion}…`);
    try {
      const result=normalizeUpdateInstallResult(await bridge.request<unknown>("explorer.update.install",{
        latestVersion: candidate.latestVersion,
      },210_000));
      if(operation!==this.updateCheckOperation||!this.host.connected||bridge!==this.host.bridge) return;
      if(result.latestVersion!==candidate.latestVersion||!result.launched) {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The update installer response was not valid." });
      }
      this.updateInstallPending=false;
      this.closeUpdateDialog(false);
      this.updateCheckSummary=result.windowReady
        ? `Code-Codex v${result.latestVersion} setup window is visible. Finish installation there.`
        :`Code-Codex v${result.latestVersion} setup started, but its window has not been confirmed. Do not start another update; check setup or Runtime Information.`;
      if(result.windowReady) this.host.showActionNotice(this.updateCheckSummary);
      else this.host.showActionProgress(this.updateCheckSummary);
    } catch(error) {
      recordCaughtRuntimeError("#installUpdate",error);

      if(operation!==this.updateCheckOperation||!this.host.connected||bridge!==this.host.bridge) return;
      this.updateCheckSummary=updateInstallError(error);
      this.host.updateMessage.textContent=this.updateCheckSummary;
      this.host.showActionNotice(this.updateCheckSummary,"error");
    } finally {
      if(operation===this.updateCheckOperation) {
        this.updateInstallPending=false;
        this.renderUpdateDialog();
        this.host.renderStatus();
      }
    }
  }
}
