import { WorkspaceBridge } from "../../bridge";
import { type ExplorerContext } from "../../contracts/bridge";
import type { DetachedEditDraft } from '../../contracts/explorer-model';
import { type NormalizedTextPreview,type PreviewTab } from "../../contracts/explorer-model";
import type { MainPreviewPort } from "../../contracts/main-preview";
import { WorkspaceSession } from "../../core/session/workspace-session";
import { DetachedDraftStore,DraftStore } from '../preview/draft-store';
import { isEditablePreview,normalizeTextareaText,previewText } from "../preview/responses";
const detachedDrafts=new DetachedDraftStore<DetachedEditDraft>();
const clearDetachedEditDraft=() => detachedDrafts.clear();
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { ExplorerBridgeError } from "../../bridge";
import { type BootstrapConfig } from "../../contracts/bridge";
import { type NormalizedPreview } from "../../contracts/explorer-model";
import { DETACHED_EDIT_TTL_MS } from "../../core/configuration/explorer";
import { type MainPreviewFileView } from "../../file-preview/contracts";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import { editSaveError,encodeBase64,normalizePreview,restoreLineEndings } from "../preview/responses";
export interface PreviewEditingControllerPorts {
 readonly connected:boolean;
 readonly dismissed:boolean;
 readonly workspaceSession:Readonly<WorkspaceSession<WorkspaceBridge>>;
 readonly activePreviewPath:string | null;
 readonly editModeButton:HTMLButtonElement;
 readonly restoreDetachedTab:(saved:Pick<PreviewTab,"path"|"name"|"view">)=>PreviewTab;
  readonly activatePreviewPath: (path: string | null) => void;
  readonly element: HTMLElement;
  readonly previewTabs: readonly PreviewTab[];
  readonly schedulePreview: (tab: PreviewTab,delay?: number) => void;
  readonly announce: (message: string) => void;
  readonly syncMainPreview: () => void;
  readonly threadId: string|null;
  readonly nativeReconnectMarker: Readonly<BootstrapConfig>|undefined;
  readonly ensureMainPreview: () => MainPreviewPort|undefined;
  readonly renderVisible: () => void;
  readonly bridge: WorkspaceBridge|undefined;
  readonly context: ExplorerContext|undefined;
  readonly mainPreview: MainPreviewPort|undefined;
  readonly generation: number;
  readonly previewSessionRevision: number;
  readonly flushQueuedMainPreviewReconcile: () => void;
  readonly flushQueuedThreadSwitch: () => void;
  readonly previewView: (tab: PreviewTab,preview: NormalizedPreview) => MainPreviewFileView;
  readonly flushQueuedNativeReconnect: () => boolean;
}
export class PreviewEditingController {
  reportConflict(message:string):void { this.drafts.error=message; }
  readonly drafts = new DraftStore();
  constructor(private readonly host: PreviewEditingControllerPorts) { }
  toggleEditing(): void {
    if(this.drafts.saving) return;
    if(this.drafts.path) {
      if(this.isEditDirty()) void this.saveEditing(true);
      else {
        const tab=this.host.previewTabs.find((candidate) => candidate.path===this.drafts.path);
        this.clearEditing(false);
        if(tab?.dirty) {
          this.host.schedulePreview(tab,0);
          this.host.announce(`${tab.name} reloading from disk`);
        } else {
          this.host.syncMainPreview();
          this.host.announce("Read-only preview restored");
        }
      }
      return;
    }

    const tab=this.activeEditableTab();
    if(!tab) return;
    this.drafts.path=tab.path;
    this.drafts.text=normalizeTextareaText(previewText(tab.view));
    this.drafts.error=undefined;
    this.drafts.saving=false;
    this.drafts.revision+=1;
    this.drafts.session+=1;
    this.host.syncMainPreview();
    this.host.announce(`Editing ${tab.name}`);
  }
  preserveDetachedDraft(): void {
    if(!this.host.threadId||!this.drafts.path||!this.isEditDirty()) return;
    const tab=this.host.previewTabs.find((candidate) => candidate.path===this.drafts.path);
    if(!tab||(tab.view.kind!=="text"&&tab.view.kind!=="empty")) return;
    clearDetachedEditDraft();
    detachedDrafts.preserve({
      threadId: this.host.threadId,
      path: tab.path,
      name: tab.name,
      draft: this.drafts.text,
      view: tab.view,
      bootstrap: this.host.nativeReconnectMarker,
      expiresAt: Date.now()+DETACHED_EDIT_TTL_MS,
    },DETACHED_EDIT_TTL_MS);
  }
  restoreDetachedDraft(context: ExplorerContext): boolean {
    const saved=detachedDrafts.current;
    if(!saved) return false;
    if(saved.expiresAt<=Date.now()||saved.bootstrap!==this.host.nativeReconnectMarker) {
      clearDetachedEditDraft();
      return false;
    }
    if(saved.threadId!==context.threadId||this.host.previewTabs.length||!this.host.ensureMainPreview()) return false;
    clearDetachedEditDraft();
    const tab=this.host.restoreDetachedTab(saved);
    this.host.activatePreviewPath(tab.path);
    this.drafts.path=tab.path;
    this.drafts.text=saved.draft;
    this.drafts.error="Unsaved changes were recovered after the Codex interface refreshed.";
    this.drafts.saving=false;
    this.drafts.revision+=1;
    this.drafts.session+=1;
    this.host.syncMainPreview();
    this.host.renderVisible();
    this.host.announce(`Unsaved changes recovered for ${tab.name}`);
    return true;
  }
  async saveEditing(exitAfterSave: boolean): Promise<void> {
    if(this.drafts.saving||!this.drafts.path) return;
    const tab=this.host.previewTabs.find((candidate) => candidate.path===this.drafts.path);
    if(!tab||!isEditablePreview(tab.view)||!tab.view.version) {
      this.drafts.error="This file is no longer available for editing. Reload it to continue.";
      this.host.syncMainPreview();
      return;
    }
    const bridge=this.host.bridge;
    const context=this.host.context;
    const mainPreview=this.host.mainPreview;
    if(!bridge?.available||!context||!mainPreview?.isConnected) {
      this.drafts.error="Code-Codex is disconnected. Your draft has been kept.";
      this.host.syncMainPreview();
      return;
    }

    const content=restoreLineEndings(this.drafts.text,tab.view.lineEnding);
    const encoded=new TextEncoder().encode(content);
    if(encoded.byteLength>64*1024) {
      this.drafts.error="This draft is larger than the 64 KB editing limit.";
      this.host.syncMainPreview();
      return;
    }

    const operation=++this.drafts.revision;
    const generation=this.host.generation;
    const sessionRevision=this.host.previewSessionRevision;
    const instanceId=tab.instanceId;
    const path=tab.path;
    const editSession=this.drafts.session;
    tab.modifiedDuringSave=false;
    this.drafts.saving=true;
    this.drafts.error=undefined;
    this.host.syncMainPreview();

    try {
      const raw=await bridge.request<unknown>("explorer.preview.save",{
        relativePath: path,
        expectedVersion: tab.view.version,
        contentBase64: encodeBase64(encoded),
      });
      if(!this.canApplyEditSave(tab,bridge,context,mainPreview,generation,sessionRevision,instanceId,path,editSession)) return;
      const preview=normalizePreview(raw);
      if(preview.kind!=="text") {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The saved preview response was not valid." });
      }
      if(tab.modifiedDuringSave) {
        const verified=await this.verifySavedPreview(
          tab,
          preview,
          bridge,
          context,
          mainPreview,
          generation,
          sessionRevision,
          instanceId,
          path,
          editSession,
        );
        if(!verified) return;
        this.finishSuccessfulSave(tab,verified,operation,exitAfterSave);
      } else {
        this.finishSuccessfulSave(tab,preview,operation,exitAfterSave);
      }
    } catch(error) {
      recordCaughtRuntimeError("#saveEditing",error);

      if(!this.canApplyEditSave(tab,bridge,context,mainPreview,generation,sessionRevision,instanceId,path,editSession)) return;
      tab.modifiedDuringSave=false;
      this.drafts.saving=false;
      this.drafts.error=editSaveError(error);
      this.host.syncMainPreview();
      this.host.announce(`Changes to ${tab.name} were not saved`);
      this.host.flushQueuedMainPreviewReconcile();
      this.host.flushQueuedThreadSwitch();
    }
  }
  async verifySavedPreview(
    tab: PreviewTab,
    saved: NormalizedTextPreview,
    bridge: WorkspaceBridge,
    context: ExplorerContext,
    mainPreview: MainPreviewPort,
    generation: number,
    sessionRevision: number,
    instanceId: number,
    path: string,
    editSession: number,
  ): Promise<NormalizedTextPreview|null> {
    for(let attempt=0;attempt<3;attempt+=1) {
      tab.modifiedDuringSave=false;
      const raw=await bridge.request<unknown>("explorer.preview",{ relativePath: path });
      if(!this.canApplyEditSave(
        tab,
        bridge,
        context,
        mainPreview,
        generation,
        sessionRevision,
        instanceId,
        path,
        editSession,
      )) {
        return null;
      }
      const current=normalizePreview(raw);
      if(current.kind!=="text") {
        throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The verification preview response was not valid." });
      }
      if(current.version!==saved.version) {
        tab.view=this.host.previewView(tab,current);
        tab.dirty=false;
        tab.modifiedDuringSave=false;
        this.drafts.saving=false;
        this.drafts.error="This file changed on disk while it was being saved. Your draft has been kept.";
        this.host.syncMainPreview();
        this.host.announce(`A newer disk version of ${tab.name} was detected`);
        this.host.flushQueuedMainPreviewReconcile();
        this.host.flushQueuedThreadSwitch();
        return null;
      }
      if(!tab.modifiedDuringSave) return current;
    }
    tab.modifiedDuringSave=false;
    this.drafts.saving=false;
    this.drafts.error="This file kept changing while it was being saved. Reload it before trying again.";
    this.host.syncMainPreview();
    this.host.flushQueuedMainPreviewReconcile();
    this.host.flushQueuedThreadSwitch();
    return null;
  }
  leaveEditing(prompt: string): boolean {
    if(!this.drafts.path) return true;
    if(this.drafts.saving) {
      this.host.announce("Wait for the current save to finish");
      return false;
    }
    if(this.isEditDirty()&&!this.confirmDiscardEditing(prompt)) return false;
    this.clearEditing(false);
    return true;
  }
  confirmDiscardEditing(message: string): boolean {
    try {
      return this.host.element.ownerDocument.defaultView?.confirm(message)===true;
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("#confirmDiscardEditing",__codeCodexCaught);

      return false;
    }
  }
  clearEditing(sync=true): boolean {
    this.drafts.path=null;
    this.drafts.text="";
    this.drafts.error=undefined;
    this.drafts.saving=false;
    this.drafts.revision+=1;
    this.drafts.session+=1;
    if(sync) this.host.syncMainPreview();
    else this.syncEditModeButton();
    const reconnectQueued=this.host.flushQueuedNativeReconnect();
    if(!reconnectQueued) this.host.flushQueuedThreadSwitch();
    return reconnectQueued;
  }
canApplyEditSave(tab: PreviewTab, bridge: WorkspaceBridge, context: ExplorerContext, mainPreview: MainPreviewPort, generation: number, sessionRevision: number, instanceId: number, path: string, editSession: number): boolean {
        return this.host.connected &&
            !this.host.dismissed &&
            this.drafts.path === path &&
            this.drafts.session === editSession &&
            this.host.workspaceSession.generation === generation &&
            this.host.previewSessionRevision === sessionRevision &&
            tab.instanceId === instanceId &&
            this.host.previewTabs.includes(tab) &&
            this.host.workspaceSession.bridge === bridge &&
            this.host.workspaceSession.context === context &&
            this.host.workspaceSession.threadId === context.threadId &&
            this.host.mainPreview === mainPreview;
    }
finishSuccessfulSave(tab: PreviewTab, preview: NormalizedTextPreview, operation: number, exitAfterSave: boolean): void {
        tab.view = this.host.previewView(tab, preview);
        tab.dirty = false;
        tab.modifiedDuringSave = false;
        this.drafts.saving = false;
        this.drafts.error = undefined;
        let reconnectQueued = false;
        if (this.drafts.revision === operation) {
            this.drafts.text = normalizeTextareaText(preview.text);
            if (exitAfterSave)
                reconnectQueued = this.clearEditing(false);
        }
        this.host.syncMainPreview();
        this.host.announce(this.drafts.path ? `${tab.name} saved` : `${tab.name} saved; read-only preview restored`);
        if (!reconnectQueued)
            reconnectQueued = this.host.flushQueuedNativeReconnect();
        if (!reconnectQueued) {
            this.host.flushQueuedMainPreviewReconcile();
            this.host.flushQueuedThreadSwitch();
        }
    }
reloadEditedFile(): void {
        if (!this.drafts.path)
            return;
        if (this.isEditDirty() && !this.confirmDiscardEditing("Reload this file and discard your unsaved changes?"))
            return;
        const tab = this.host.previewTabs.find((candidate) => candidate.path === this.drafts.path);
        this.clearEditing(false);
        if (tab) {
            tab.dirty = true;
            this.host.schedulePreview(tab, 0);
        }
        else {
            this.host.syncMainPreview();
        }
    }
activeEditableTab(): PreviewTab | undefined {
        if (!this.host.activePreviewPath)
            return undefined;
        const tab = this.host.previewTabs.find((candidate) => candidate.path === this.host.activePreviewPath);
        return tab && isEditablePreview(tab.view) ? tab : undefined;
    }
isEditDirty(): boolean {
        if (!this.drafts.path)
            return false;
        const tab = this.host.previewTabs.find((candidate) => candidate.path === this.drafts.path);
        return Boolean(tab && this.drafts.text !== normalizeTextareaText(previewText(tab.view)));
    }
syncEditModeButton(): void {
        const tab = this.activeEditableTab();
        const editing = this.drafts.path !== null;
        this.host.editModeButton.disabled = this.drafts.saving || (!editing && !tab);
        this.host.editModeButton.textContent = this.drafts.saving ? "Saving" : editing ? "Editing" : "Read only";
        this.host.editModeButton.setAttribute("aria-pressed", String(editing));
        this.host.editModeButton.dataset.dirty = String(this.isEditDirty());
        this.host.editModeButton.title = this.drafts.saving
            ? "Saving changes"
            : editing
                ? "Save changes and return to read-only preview"
                : tab
                    ? `Edit ${tab.name}`
                    : "Select an editable file to enable editing";
    }

}
