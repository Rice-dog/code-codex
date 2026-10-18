import { BridgeUnavailableError,WorkspaceBridge } from "../../bridge";
import { type ExplorerViewState,type FlatTreeRow } from "../../contracts/bridge";
import { type ContextMenuItem,type ContextMenuTarget } from "../../contracts/explorer-model";
import { WorkspaceSession } from "../../core/session/workspace-session";
import { icons } from "../../icons";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import type { TreeModel } from "../../tree-model";
import { contextActionError } from "../file-operations/context-menu";
import type { MutationAccess } from "../file-operations/mutation-gate";
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { ExplorerBridgeError } from "../../bridge";
import { type ExplorerContext } from "../../contracts/bridge";
import { type ContextMenuAction,type ContextMenuAnchor,type ContextMenuDialog,type ContextMenuNameAction } from "../../contracts/explorer-model";
import { isPathWithin,joinAbsolutePath } from "../../core/bridge/response-validation";
import { CONTEXT_DIALOG_HEIGHT,CONTEXT_MENU_ITEM_HEIGHT,CONTEXT_MENU_MARGIN,CONTEXT_MENU_WIDTH } from "../../core/configuration/explorer";
import { t } from '../../i18n';
import { contextActionTextKeys,contextNameActionCopy,entryNameValidationError,isContextMenuAction } from '../file-operations/context-menu';
export interface FileActionsControllerPorts {
 readonly clearFileClipboard:(expected:{paths:string[];operation:"copy"|"cut"})=>void;
 readonly workspaceSession:Readonly<WorkspaceSession<WorkspaceBridge>>;
 readonly canUseBridge:(bridge: WorkspaceBridge, generation: number) => boolean;
 readonly refreshLoadedDirectories:() => Promise<void>;
 readonly loadDirectory:(path: string, append?: boolean, waitForExisting?: boolean, expectedGeneration?: number) => Promise<void>;
 readonly model:Pick<TreeModel,"hasLoaded">;
 readonly element:HTMLElement;
 readonly fileClipboard:{ paths: string[]; operation: "copy" | "cut"; } | undefined;
 readonly focusedIndex:number;
 readonly mutations: MutationAccess;
  readonly context: ExplorerContext|undefined;
  readonly bridge: WorkspaceBridge|undefined;
  readonly state: ExplorerViewState;
  readonly treeWindow: HTMLElement;
  readonly rows: FlatTreeRow[];
  readonly selectedPaths: ReadonlySet<string>;
  readonly setSingleSelection: (path: string,index: number) => void;
  readonly focusIndex: (index: number,focus?: boolean) => void;
  readonly clearSelection: (sync?: boolean) => void;
  readonly treeShell: HTMLElement;
  readonly hideActionNotice: () => void;
  readonly shadow: ShadowRoot;
  readonly statePanel: HTMLElement;
  readonly contextMenu: HTMLElement;
  readonly renderVisible: () => void;
  readonly editingPath: string|null;
  readonly isEditDirty: () => boolean;
  readonly effectiveWidth: () => number;
  readonly connected: boolean;
  readonly editSaving: boolean;
  readonly showActionNotice: (message: string,tone?: "success"|"error") => void;
  readonly openPreviewTab: (row: FlatTreeRow) => void;
  readonly clearEditing: (sync?: boolean) => boolean;
  readonly closePreviewTabsWithin: (path: string) => void;
}
export class FileActionsController {
  // State belongs to this feature; the application consumes it explicitly.
  contextMenuTarget: ContextMenuTarget | undefined;
  contextMenuError: string | undefined;


  constructor(private readonly host: FileActionsControllerPorts) { }
  contextMenuFocusReturn!: HTMLElement|undefined;
  contextMenuDialog!: ContextMenuDialog|undefined;
  contextMenuAnchor!: ContextMenuAnchor|undefined;
  frame!: HTMLElement;
  onTreeContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if(this.host.mutations.busy||!this.host.context||!this.host.bridge?.available||this.host.state!=="ready") {
      this.closeContextMenu(false);
      return;
    }

    const element=(event.target as Element|null)?.closest<HTMLElement>(".tree-row");
    let target: ContextMenuTarget|undefined;
    if(element&&this.host.treeWindow.contains(element)) {
      const index=Number(element.dataset.index);
      if(!Number.isInteger(index)) return;
      const row=this.host.rows[index];
      target=row? this.contextTargetForRow(row):undefined;
      if(!target) {
        this.closeContextMenu(false);
        return;
      }
      // Right-clicking a row that is already part of a multi-selection keeps the
      // selection; right-clicking elsewhere collapses to just that row.
      if(!this.host.selectedPaths.has(target.path)) this.host.setSingleSelection(target.path,index);
      this.host.focusIndex(index,false);
    } else {
      this.host.clearSelection(true);
      target=this.rootContextTarget();
    }
    this.host.treeShell.focus();
    this.openContextMenu(target,event.clientX,event.clientY);
  }
  onEmptyStateContextMenu(event: MouseEvent): void {
    if(this.host.state!=="empty") return;
    event.preventDefault();
    this.openContextMenu(this.rootContextTarget(),event.clientX,event.clientY);
  }
  openContextMenu(target: ContextMenuTarget,clientX: number,clientY: number): void {
    if(this.host.mutations.busy||(this.host.state!=="ready"&&this.host.state!=="empty")||!this.host.context||!this.host.bridge?.available) return;
    this.host.hideActionNotice();
    const active=this.host.shadow.activeElement;
    this.contextMenuFocusReturn=active instanceof HTMLElement
      ? active
      :this.host.state==="empty"
        ? this.host.statePanel
        :this.host.treeShell;
    this.contextMenuTarget=target;
    this.contextMenuDialog=undefined;
    this.contextMenuError=undefined;
    this.contextMenuAnchor={ clientX,clientY };
    this.renderContextMenu();
    this.host.contextMenu.hidden=false;
    this.positionContextMenu(clientX,clientY);
    this.host.renderVisible();
    this.focusContextMenuContent(target);
  }
  renderContextMenu(): void {
    const target=this.contextMenuTarget;
    const fragment=document.createDocumentFragment();
    if(!target) {
      this.host.contextMenu.replaceChildren();
      return;
    }
    if(this.contextMenuDialog) {
      this.renderContextMenuDialog(target,this.contextMenuDialog);
      return;
    }
    this.host.contextMenu.setAttribute("role","menu");
    this.host.contextMenu.setAttribute("aria-label","Explorer actions");
    this.host.contextMenu.removeAttribute("aria-modal");
    let first=true;
    for(const item of this.contextMenuItems(target)) {
      if(item.separatorBefore) {
        const separator=document.createElement("div");
        separator.className="context-menu-separator";
        separator.setAttribute("role","separator");
        fragment.append(separator);
      }
      const button=document.createElement("button");
      button.type="button";
      button.className="context-menu-item";
      button.dataset.action=item.action;
      if(item.danger) button.dataset.danger="true";
      button.setAttribute("role","menuitem");
      button.tabIndex=first? 0:-1;
      button.disabled=this.host.mutations.busy;
      const icon=document.createElement("span");
      icon.className="context-menu-icon";
      icon.setAttribute("aria-hidden","true");
      icon.innerHTML=item.icon;
      const label=document.createElement("span");
      label.className="context-menu-label";
      label.dataset.i18nKey=contextActionTextKeys[item.action];
      label.textContent=t(contextActionTextKeys[item.action]);
      button.append(icon,label);
      fragment.append(button);
      first=false;
    }
    this.host.contextMenu.replaceChildren(fragment);
  }
  renderContextMenuDialog(target: ContextMenuTarget,dialog: ContextMenuDialog): void {
    const form=document.createElement("form");
    form.className="context-menu-dialog";
    form.dataset.dialogKind=dialog.kind;

    const heading=document.createElement("div");
    heading.className="context-dialog-heading";
    const icon=document.createElement("span");
    icon.className="context-menu-icon";
    icon.setAttribute("aria-hidden","true");
    const title=document.createElement("span");
    title.className="context-dialog-title";

    if(dialog.kind==="name") {
      const copy=contextNameActionCopy(dialog.action);
      icon.innerHTML=copy.icon;
      title.textContent=copy.title;
      heading.append(icon,title);

      const input=document.createElement("input");
      input.className="context-dialog-input";
      input.type="text";
      input.value=dialog.value;
      input.maxLength=255;
      input.autocomplete="off";
      input.spellcheck=false;
      input.dataset.dialogName="true";
      input.setAttribute("aria-label",copy.inputLabel);
      input.setAttribute("aria-invalid",String(Boolean(this.contextMenuError)));
      input.setAttribute("aria-describedby","cle-context-dialog-error");

      form.append(heading,input,this.contextMenuErrorElement());
      form.append(this.contextDialogButtons(copy.submitLabel));
      form.setAttribute("aria-label",copy.title);
    } else {
      const rename=dialog.kind==="confirm-rename";
      icon.innerHTML=rename? icons.rename:icons.trash;
      title.textContent=rename? "Confirm Rename":"Confirm Delete";
      heading.append(icon,title);

      const question=document.createElement("p");
      question.className="context-dialog-question";
      const multiDelete=this.host.selectedPaths.size>1&&this.host.selectedPaths.has(target.path);
      question.textContent=rename
        ? `Rename ${target.name} to ${dialog.value}?`
        :multiDelete
          ? `Delete ${this.host.selectedPaths.size} items?`
          :`Delete ${target.name}?`;
      question.title=question.textContent;

      const warning=document.createElement("p");
      warning.className="context-dialog-warning";
      const discardsDraft=Boolean(
        this.host.editingPath&&isPathWithin(target.path,this.host.editingPath)&&this.host.isEditDirty(),
      );
      warning.textContent=rename
        ? "Unsaved changes will be discarded."
        :`This action cannot be undone${discardsDraft? "; unsaved changes will be discarded":""}.`;

      form.append(heading,question,warning,this.contextMenuErrorElement());
      form.append(this.contextDialogButtons(rename? "Rename":"Delete",!rename));
      form.setAttribute("aria-label",rename? "Confirm rename":"Confirm delete");
    }

    this.host.contextMenu.setAttribute("role","dialog");
    this.host.contextMenu.setAttribute("aria-modal","true");
    this.host.contextMenu.setAttribute("aria-label",form.getAttribute("aria-label")??"Explorer action");
    this.host.contextMenu.replaceChildren(form);
  }
  positionContextMenu(clientX: number,clientY: number): void {
    const frameRect=this.frame.getBoundingClientRect();
    const frameWidth=this.frame.clientWidth||frameRect.width||this.host.effectiveWidth();
    const frameHeight=this.frame.clientHeight||frameRect.height||420;
    const menuRect=this.host.contextMenu.getBoundingClientRect();
    const menuWidth=menuRect.width||Math.min(CONTEXT_MENU_WIDTH,Math.max(0,frameWidth-CONTEXT_MENU_MARGIN*2));
    const itemCount=this.host.contextMenu.querySelectorAll(".context-menu-item").length;
    const separatorCount=this.host.contextMenu.querySelectorAll(".context-menu-separator").length;
    const fallbackHeight=this.contextMenuDialog
      ? CONTEXT_DIALOG_HEIGHT
      :itemCount*CONTEXT_MENU_ITEM_HEIGHT+separatorCount*9+8;
    const menuHeight=menuRect.height||this.host.contextMenu.scrollHeight||fallbackHeight;
    const rawX=clientX-frameRect.left;
    const rawY=clientY-frameRect.top;
    const maxX=Math.max(CONTEXT_MENU_MARGIN,frameWidth-menuWidth-CONTEXT_MENU_MARGIN);
    const maxY=Math.max(CONTEXT_MENU_MARGIN,frameHeight-menuHeight-CONTEXT_MENU_MARGIN);
    const left=Math.max(CONTEXT_MENU_MARGIN,Math.min(rawX,maxX));
    const top=Math.max(CONTEXT_MENU_MARGIN,Math.min(rawY,maxY));
    this.host.contextMenu.style.left=`${Math.round(left)}px`;
    this.host.contextMenu.style.top=`${Math.round(top)}px`;
  }
  closeContextMenu(restoreFocus: boolean): void {
    const focusReturn=this.contextMenuFocusReturn;
    this.host.contextMenu.hidden=true;
    this.contextMenuTarget=undefined;
    this.contextMenuFocusReturn=undefined;
    this.contextMenuDialog=undefined;
    this.contextMenuAnchor=undefined;
    this.contextMenuError=undefined;
    this.host.contextMenu.setAttribute("aria-busy","false");
    this.host.contextMenu.style.removeProperty("left");
    this.host.contextMenu.style.removeProperty("top");
    this.host.treeWindow.querySelector<HTMLElement>('.tree-row[data-context-target="true"]')?.setAttribute("data-context-target","false");
    if(restoreFocus&&this.host.connected&&focusReturn?.isConnected&&!focusReturn.hidden) focusReturn.focus();
  }
  onContextMenuClick(event: MouseEvent): void {
    const dialogControl=(event.target as Element|null)?.closest<HTMLButtonElement>("[data-dialog-action]");
    if(dialogControl&&this.host.contextMenu.contains(dialogControl)&&!dialogControl.disabled) {
      if(dialogControl.dataset.dialogAction==="cancel") this.closeContextMenu(true);
      return;
    }
    const button=(event.target as Element|null)?.closest<HTMLButtonElement>(".context-menu-item");
    if(!button||!this.host.contextMenu.contains(button)||button.disabled||this.host.mutations.busy) return;
    const action=button.dataset.action;
    if(!isContextMenuAction(action)) return;
    if(action==="new-file"||action==="new-folder"||action==="rename"||action==="delete") {
      this.beginContextMenuDialog(action);
    } else {
      void this.runContextMenuAction(action);
    }
  }
  onContextMenuSubmit(event: SubmitEvent): void {
    const form=(event.target as Element|null)?.closest<HTMLFormElement>(".context-menu-dialog");
    if(!form||!this.host.contextMenu.contains(form)) return;
    event.preventDefault();
    if(this.host.mutations.busy) return;
    const target=this.contextMenuTarget;
    const dialog=this.contextMenuDialog;
    if(!target||!dialog) return;

    if(dialog.kind==="name") {
      const input=form.querySelector<HTMLInputElement>("[data-dialog-name]");
      const value=input?.value??"";
      this.contextMenuDialog={ ...dialog,value };
      const validationError=entryNameValidationError(value);
      if(validationError) {
        this.showContextMenuError(validationError);
        return;
      }
      if(dialog.action==="rename") {
        if(value===target.name) {
          this.closeContextMenu(true);
          return;
        }
        if(this.host.editingPath&&isPathWithin(target.path,this.host.editingPath)) {
          if(this.host.editSaving) {
            this.showContextMenuError("Wait for the current save to finish.");
            return;
          }
          if(this.host.isEditDirty()) {
            this.showContextMenuDialog({ kind: "confirm-rename",value });
            return;
          }
        }
      }
      void this.runContextMenuMutation(dialog.action,value);
      return;
    }

    if(this.host.editingPath&&isPathWithin(target.path,this.host.editingPath)&&this.host.editSaving) {
      this.showContextMenuError("Wait for the current save to finish.");
      return;
    }
    void this.runContextMenuMutation(dialog.kind==="confirm-delete"? "delete":"rename",
      dialog.kind==="confirm-rename"? dialog.value:undefined);
  }
  onContextMenuKeyDown(event: KeyboardEvent): void {
    if(event.key==="Escape") {
      event.preventDefault();
      this.closeContextMenu(true);
      return;
    }
    if(this.contextMenuDialog) {
      if(event.key!=="Tab") return;
      const controls=Array.from(
        this.host.contextMenu.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"),
      );
      if(!controls.length) {
        event.preventDefault();
        return;
      }
      const current=controls.indexOf(this.host.shadow.activeElement as HTMLElement);
      const next=event.shiftKey
        ? (current<=0? controls.length-1:current-1)
        :(current<0||current===controls.length-1? 0:current+1);
      event.preventDefault();
      controls[next]?.focus();
      return;
    }
    if(event.key==="Tab") {
      this.closeContextMenu(false);
      return;
    }
    const items=Array.from(this.host.contextMenu.querySelectorAll<HTMLButtonElement>(".context-menu-item:not(:disabled)"));
    if(!items.length) return;
    let next=-1;
    const current=items.indexOf(this.host.shadow.activeElement as HTMLButtonElement);
    if(event.key==="ArrowDown") next=(current+1+items.length)%items.length;
    else if(event.key==="ArrowUp") next=(current-1+items.length)%items.length;
    else if(event.key==="Home") next=0;
    else if(event.key==="End") next=items.length-1;
    if(next<0) return;
    event.preventDefault();
    for(const item of items) item.tabIndex=-1;
    const item=items[next];
    if(item) {
      item.tabIndex=0;
      item.focus();
    }
  }
  async runContextMenuAction(action: ContextMenuAction): Promise<void> {
    const target=this.contextMenuTarget;
    if(!target||this.host.mutations.busy) return;
    const mutation=this.host.mutations.acquire(); if(!mutation)return;
    this.setContextMenuBusy(true);
    let close=false;
    try {
      close=await this.performContextMenuAction(action,target);
    } catch(error) {
      recordCaughtRuntimeError("#runContextMenuAction",error);

      this.host.showActionNotice(contextActionError(action,error),"error");
    } finally {
      mutation.release();
      this.setContextMenuBusy(false);
      if(close) this.closeContextMenu(true);
    }
  }
  async performContextMenuAction(action: ContextMenuAction,target: ContextMenuTarget): Promise<boolean> {
    if(action==="preview") {
      if(target.row) this.host.openPreviewTab(target.row);
      return true;
    }
    if(action==="copy-relative") {
      const paths=this.host.selectedPaths.size>1&&this.host.selectedPaths.has(target.path)
        ? Array.from(this.host.selectedPaths).sort()
        :[target.path];
      const copyText=paths.length===1? (paths[0]??""):paths.join("\n");
      await this.copyRelativePath(copyText);
      return true;
    }
    if(action==="copy-absolute") {
      const root=this.host.context?.rootPath;
      if(!root) throw new ExplorerBridgeError({ code: "NO_CONTEXT",message: "The workspace path is unavailable." });
      // Absolute path is just root + relative path, built locally — no bridge
      // round-trip, so the copy is instant and stays in the click's activation
      // window. Paths are already contained (validated when the tree loaded).
      const absolutePaths=this.contextActionPaths(target).map((path) => joinAbsolutePath(root,path));
      await this.copyRelativePath(absolutePaths.join("\r\n"));
      return true;
    }
    if(action==="reveal") {
      const paths=this.contextActionPaths(target);
      for(const path of paths) {
        const current=await this.requestEntryAction("explorer.entry.reveal",{ relativePath: path });
        if(!current) break;
      }
      return true;
    }
    if(action==="refresh") {
      await this.refreshContextTarget(target);
      return true;
    }
    throw new Error("Unsupported context-menu action.");
  }
  setContextMenuBusy(busy: boolean): void {
    this.host.contextMenu.setAttribute("aria-busy",String(busy));
    for(const control of this.host.contextMenu.querySelectorAll<HTMLButtonElement|HTMLInputElement>("button, input")) {
      control.disabled=busy;
      control.setAttribute("aria-disabled",String(busy));
    }
  }
  beginContextMenuDialog(action: ContextMenuNameAction|"delete"): void {
    const target=this.contextMenuTarget;
    if(!target||this.host.mutations.busy) return;
    this.showContextMenuDialog(action==="delete"
      ? { kind: "confirm-delete" }
      :{ kind: "name",action,value: action==="rename"? target.name:"" });
  }
  showContextMenuDialog(dialog: ContextMenuDialog): void {
    const target=this.contextMenuTarget;
    if(!target||this.host.contextMenu.hidden) return;
    this.contextMenuDialog=dialog;
    this.contextMenuError=undefined;
    this.renderContextMenu();
    const anchor=this.contextMenuAnchor;
    if(anchor) this.positionContextMenu(anchor.clientX,anchor.clientY);
    this.focusContextMenuContent(target);
  }
  focusContextMenuContent(target: ContextMenuTarget): void {
    requestAnimationFrame(() => {
      if(this.host.contextMenu.hidden||this.contextMenuTarget!==target) return;
      const anchor=this.contextMenuAnchor;
      if(anchor) this.positionContextMenu(anchor.clientX,anchor.clientY);
      if(!this.contextMenuDialog) {
        this.host.contextMenu.querySelector<HTMLButtonElement>('.context-menu-item:not(:disabled)')?.focus();
        return;
      }
      if(this.contextMenuDialog.kind==="name") {
        const input=this.host.contextMenu.querySelector<HTMLInputElement>("[data-dialog-name]:not(:disabled)");
        if(!input) return;
        input.focus();
        const dot=this.contextMenuDialog.action==="rename"? input.value.lastIndexOf("."):-1;
        input.setSelectionRange(0,dot>0? dot:input.value.length);
        return;
      }
      this.host.contextMenu.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]:not(:disabled)')?.focus();
    });
  }
  clearContextMenuError(): void {
    if(!this.contextMenuError) return;
    this.contextMenuError=undefined;
    const error=this.host.contextMenu.querySelector<HTMLElement>(".context-dialog-error");
    if(error) {
      error.hidden=true;
      error.textContent="";
    }
    this.host.contextMenu.querySelector<HTMLInputElement>("[data-dialog-name]")?.setAttribute("aria-invalid","false");
  }
  showContextMenuError(message: string): void {
    const target=this.contextMenuTarget;
    if(!target||!this.contextMenuDialog) return;
    this.contextMenuError=message;
    this.renderContextMenu();
    const anchor=this.contextMenuAnchor;
    if(anchor) this.positionContextMenu(anchor.clientX,anchor.clientY);
    this.focusContextMenuContent(target);
  }
  async runContextMenuMutation(action: ContextMenuNameAction|"delete",name?: string): Promise<void> {
    const target=this.contextMenuTarget;
    if(!target||this.host.mutations.busy) return;
    const mutation=this.host.mutations.acquire(); if(!mutation)return;
    this.contextMenuError=undefined;
    this.setContextMenuBusy(true);
    let succeeded=false;
    let failureMessage: string|undefined;
    try {
      if(action==="new-file"||action==="new-folder") {
        if(name===undefined) throw new Error("A name is required.");
        const kind=action==="new-file"? "file":"directory";
        const parentRelativePath=target.kind==="directory"? target.path:target.parentPath;
        const current=await this.requestEntryAction("explorer.entry.create",{ parentRelativePath,name,kind });
        if(!current) return;
        try {
          await this.refreshDirectoryIfLoaded(parentRelativePath);
        } catch(__codeCodexCaught) {
          recordCaughtRuntimeError("#runContextMenuMutation",__codeCodexCaught);
        }
        succeeded=true;
      } else if(action==="rename") {
        if(name===undefined) throw new Error("A name is required.");
        const current=await this.requestEntryAction("explorer.entry.rename",{ relativePath: target.path,newName: name });
        if(!current) return;
        if(this.host.editingPath&&isPathWithin(target.path,this.host.editingPath)) this.host.clearEditing(false);
        this.host.closePreviewTabsWithin(target.path);
        try {
          await this.refreshDirectoryIfLoaded(target.parentPath);
        } catch(__codeCodexCaught) {
          recordCaughtRuntimeError("#runContextMenuMutation",__codeCodexCaught);
        }
        succeeded=true;
      } else {
        // Delete: operate on all selected paths if the target is part of a multi-selection.
        const pathsToDelete=this.host.selectedPaths.size>1&&this.host.selectedPaths.has(target.path)
          ? Array.from(this.host.selectedPaths).sort()
          :[target.path];
        // Filter out nested paths: if deleting "src/" and "src/main.ts", only delete "src/".
        const topLevel=pathsToDelete.filter((path) => !pathsToDelete.some((other) => other!==path&&isPathWithin(other,path)));
        const parentPaths=new Set<string>();
        for(const path of topLevel) {
          const current=await this.requestEntryAction("explorer.entry.delete",{ relativePath: path });
          if(!current) return;
          if(this.host.editingPath&&isPathWithin(path,this.host.editingPath)) this.host.clearEditing(false);
          this.host.closePreviewTabsWithin(path);
          const row=this.host.rows.find((r) => r.kind==="node"&&r.path===path);
          if(row) parentPaths.add(row.parentPath);
        }
        try {
          for(const parentPath of parentPaths) await this.refreshDirectoryIfLoaded(parentPath);
        } catch(__codeCodexCaught) {
          recordCaughtRuntimeError("#runContextMenuMutation",__codeCodexCaught);
        }
        succeeded=true;
      }
    } catch(error) {
      recordCaughtRuntimeError("#runContextMenuMutation",error);

      failureMessage=contextActionError(action,error);
    } finally {
      mutation.release();
      const dialogStillOpen=this.contextMenuTarget===target&&Boolean(this.contextMenuDialog);
      if(this.contextMenuTarget===target) this.setContextMenuBusy(false);
      if(failureMessage) {
        if(dialogStillOpen) this.showContextMenuError(failureMessage);
        else this.host.showActionNotice(failureMessage,"error");
      } else if(succeeded) {
        if(this.contextMenuTarget===target) this.closeContextMenu(true);
      }
    }
  }
onEmptyStateKeyDown(event: KeyboardEvent): void {
        if (this.host.state !== "empty" || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")))
            return;
        event.preventDefault();
        const rect = this.host.statePanel.getBoundingClientRect();
        this.openContextMenu(this.rootContextTarget(), rect.left + Math.min(28, rect.width), rect.top + 48);
    }
contextTargetForRow(row: FlatTreeRow): ContextMenuTarget | undefined {
        const node = row.node;
        if (row.kind !== "node" ||
            !node ||
            (node.kind !== "file" && node.kind !== "directory") ||
            node.inaccessible ||
            node.change === "deleted") {
            return undefined;
        }
        return {
            kind: node.kind,
            path: node.relativePath,
            parentPath: row.parentPath,
            name: node.name,
            row: { ...row, node: { ...node } },
        };
    }
rootContextTarget(): ContextMenuTarget {
        return { kind: "root", path: "", parentPath: "", name: this.host.workspaceSession.context?.rootName ?? "Project" };
    }
contextMenuErrorElement(): HTMLElement {
        const error = document.createElement("div");
        error.id = "cle-context-dialog-error";
        error.className = "context-dialog-error";
        error.setAttribute("role", "alert");
        error.hidden = !this.contextMenuError;
        error.textContent = this.contextMenuError ?? "";
        return error;
    }
contextDialogButtons(submitLabel: string, danger = false): HTMLElement {
        const actions = document.createElement("div");
        actions.className = "context-dialog-actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "context-dialog-button secondary";
        cancel.dataset.dialogAction = "cancel";
        cancel.textContent = "Cancel";
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = `context-dialog-button primary${danger ? " danger" : ""}`;
        submit.dataset.dialogSubmit = "true";
        submit.textContent = submitLabel;
        actions.append(cancel, submit);
        return actions;
    }
contextMenuItems(target: ContextMenuTarget): ContextMenuItem[] {
        const create: ContextMenuItem[] = [
            { action: "new-file", label: "New File", icon: icons.newFile },
            { action: "new-folder", label: "New Folder", icon: icons.newFolder },
        ];
        if (target.kind === "root") {
            return [...create, { action: "refresh", label: "Refresh", icon: icons.refresh, separatorBefore: true }];
        }
        const mutate: ContextMenuItem[] = [
            { action: "rename", label: "Rename", icon: icons.rename, separatorBefore: true },
            { action: "delete", label: "Delete", icon: icons.trash, danger: true },
            { action: "copy-relative", label: "Copy Relative Path", icon: icons.copy, separatorBefore: true },
            { action: "copy-absolute", label: "Copy Absolute Path", icon: icons.link },
            { action: "reveal", label: "Reveal in File Explorer", icon: icons.reveal },
        ];
        if (target.kind === "file") {
            return [{ action: "preview", label: "Preview", icon: icons.preview }, ...create, ...mutate];
        }
        return [...create, ...mutate, { action: "refresh", label: "Refresh", icon: icons.refresh, separatorBefore: true }];
    }
async requestEntryAction(method: string, params: Record<string, unknown>): Promise<boolean> {
        const bridge = this.host.workspaceSession.bridge;
        const context = this.host.workspaceSession.context;
        const generation = this.host.workspaceSession.generation;
        if (!bridge?.available || !context)
            throw new BridgeUnavailableError();
        await bridge.request(method, params);
        return this.host.canUseBridge(bridge, generation) && this.host.workspaceSession.context === context && this.host.workspaceSession.threadId === context.threadId;
    }
async refreshContextTarget(target: ContextMenuTarget): Promise<void> {
        if (target.kind === "root") {
            await this.host.refreshLoadedDirectories();
            return;
        }
        if (target.kind === "directory")
            await this.host.loadDirectory(target.path, false, true);
        else
            await this.refreshDirectoryIfLoaded(target.parentPath);
    }
async refreshDirectoryIfLoaded(path: string): Promise<void> {
        if (this.host.model.hasLoaded(path))
            await this.host.loadDirectory(path, false, true);
    }
async copyRelativePath(path: string): Promise<void> {
        const clipboard = this.host.element.ownerDocument.defaultView?.navigator.clipboard;
        if (clipboard && typeof clipboard.writeText === "function") {
            try {
                await clipboard.writeText(path);
                return;
            }
            catch (__codeCodexCaught) {
                recordCaughtRuntimeError("#copyRelativePath", __codeCodexCaught);
                // Codex may expose the Clipboard API without granting this injected realm permission.
            }
        }
        const focusReturn = this.host.shadow.activeElement instanceof HTMLElement ? this.host.shadow.activeElement : undefined;
        const input = this.host.element.ownerDocument.createElement("textarea");
        input.className = "clipboard-proxy";
        input.value = path;
        input.setAttribute("aria-hidden", "true");
        this.host.shadow.append(input);
        input.select();
        let copied = false;
        try {
            copied = this.host.element.ownerDocument.execCommand("copy");
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#copyRelativePath", __codeCodexCaught);
            copied = false;
        }
        finally {
            input.remove();
            if (focusReturn?.isConnected)
                focusReturn.focus();
        }
        if (!copied)
            throw new Error("Clipboard access is unavailable.");
    }
contextActionPaths(target: ContextMenuTarget): string[] {
        return this.host.selectedPaths.size > 1 && this.host.selectedPaths.has(target.path)
            ? Array.from(this.host.selectedPaths).sort()
            : [target.path];
    }
async pasteFiles(): Promise<void> {
        if (!this.host.fileClipboard || !this.host.workspaceSession.context || !this.host.workspaceSession.bridge?.available)
            return;
        // Determine target directory: use focused row if it's a directory, otherwise its parent.
        const focusedRow = this.host.rows[this.host.focusedIndex];
        let targetDir = "";
        if (focusedRow?.kind === "node") {
            targetDir = focusedRow.node?.kind === "directory" ? focusedRow.path : focusedRow.parentPath;
        }
        const mutation=this.host.mutations.acquire();
        if(!mutation)return;
        try {
            const clipboard=this.host.fileClipboard;
            const { paths, operation } = clipboard;
            const method = operation === "copy" ? "explorer.entry.copy" : "explorer.entry.move";
            const current=await this.requestEntryAction(method, {
                sourcePaths: paths,
                targetDirectory: targetDir,
            });
            if(!current)return;
            // Clear clipboard after cut (move), keep it for copy (can paste multiple times).
            if (operation === "cut")
                this.host.clearFileClipboard(clipboard);
            // Refresh the target directory to show the new files.
            if (targetDir)
                await this.host.loadDirectory(targetDir, false, true);
            else
                await this.host.refreshLoadedDirectories();
        }
        catch (error) {
            recordCaughtRuntimeError("#pasteFiles", error);
            this.host.showActionNotice(contextActionError("paste", error), "error");
        }
        finally { mutation.release(); }
    }
async deleteSelectedFiles(): Promise<void> {
        if (this.host.selectedPaths.size === 0 || !this.host.workspaceSession.context || !this.host.workspaceSession.bridge?.available)
            return;
        const paths = Array.from(this.host.selectedPaths).sort();
        const mutation=this.host.mutations.acquire();
        if(!mutation)return;
        try {
            // Delete each file/directory.
            for (const path of paths) {
                if(!await this.requestEntryAction("explorer.entry.delete", { relativePath: path }))return;
            }
            this.host.clearSelection(false);
            // Refresh parent directories.
            const parentPaths = new Set(paths.map((path) => {
                const lastSlash = path.lastIndexOf("/");
                return lastSlash >= 0 ? path.substring(0, lastSlash) : "";
            }));
            for (const parentPath of parentPaths) {
                if (parentPath)
                    await this.refreshDirectoryIfLoaded(parentPath);
            }
        }
        catch (error) {
            recordCaughtRuntimeError("#deleteSelectedFiles", error);
            this.host.showActionNotice(contextActionError("delete", error), "error");
        }
        finally { mutation.release(); }
    }

}
