import { requireCallable } from '../../plugin-host/api1';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { WorkspaceBridge } from "../../bridge";
import { type GitCommitResult,type GitCommitSummary } from "../../contracts/explorer-model";
import { gitHistoryError,normalizeGitCommit,normalizeGitHistory } from "../../git-history-facade";
import type { HistoryHost } from "../../git-history-runtime";
import { pluginExport as readPluginExport } from "../../plugin-runtime";
import { recordCaughtRuntimeError } from "../../runtime-operations";
export interface GitHistorySettingsControllerPorts {
 readonly openGitDiff:(hash:string,path:string)=>Promise<void>;
  readonly frame: HTMLElement;
  readonly gitHistoryOpenButton: HTMLButtonElement;
  readonly closePreviewMarket: (restoreFocus: boolean) => void;
  readonly gitHistoryResizeHandle: HTMLElement;
  readonly gitHistoryList: HTMLElement;
  readonly gitHistoryLoadMoreButton: HTMLButtonElement;
  readonly gitHistoryRefreshButton: HTMLButtonElement;
  readonly bridge: WorkspaceBridge|undefined;
  readonly gitHistoryBackButton: HTMLButtonElement;
  readonly gitHistoryDetail: HTMLElement;
}
export class GitHistorySettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  gitHistoryOpen = false;

  constructor(private readonly host: GitHistorySettingsControllerPorts) { }
  gitHistoryLoading=false;
  gitHistoryGeneration=0;
  gitHistoryCommits: GitCommitSummary[]=[];
  gitHistoryHasMore=false;
  gitHistoryResizeState!: { pointerId: number; startY: number; startHeight: number }|undefined;
  gitHistoryPanel!: HTMLElement;
  gitHistoryBranch!: HTMLElement;
  gitHistoryState!: HTMLElement;
  gitHistoryListView!: HTMLElement;
  gitHistoryDetailView!: HTMLElement;
  toggleGitHistory(): void {
    if(this.gitHistoryOpen) {
      this.closeGitHistory(true);
      return;
    }
    this.gitHistoryOpen=true;
    this.host.frame.dataset.gitHistoryOpen="true";
    this.gitHistoryPanel.hidden=false;
    this.host.gitHistoryOpenButton.setAttribute("aria-expanded","true");
    this.host.gitHistoryOpenButton.textContent="Disable";
    this.host.gitHistoryOpenButton.dataset.enabled="true";
    this.showGitHistoryList();
    this.host.closePreviewMarket(false);
    requestAnimationFrame(() => this.syncGitHistoryResizeAria());
    void this.loadGitHistory(true);
  }
  closeGitHistory(restoreFocus: boolean): void {
    if(!this.gitHistoryOpen&&this.gitHistoryPanel.hidden) return;
    this.gitHistoryOpen=false;
    this.gitHistoryGeneration+=1;
    this.gitHistoryLoading=false;
    this.cancelGitHistoryResize();
    delete this.host.frame.dataset.gitHistoryOpen;
    this.gitHistoryPanel.hidden=true;
    this.host.gitHistoryOpenButton.setAttribute("aria-expanded","false");
    this.host.gitHistoryOpenButton.textContent="Enable";
    delete this.host.gitHistoryOpenButton.dataset.enabled;
    if(restoreFocus&&this.host.gitHistoryOpenButton.isConnected) this.host.gitHistoryOpenButton.focus();
  }
  beginGitHistoryResize(event: PointerEvent): void {
    if(!this.gitHistoryOpen||event.button!==0) return;
    event.preventDefault();
    this.gitHistoryResizeState={
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: this.gitHistoryPanel.getBoundingClientRect().height,
    };
    this.host.gitHistoryResizeHandle.setPointerCapture(event.pointerId);
    this.host.frame.dataset.gitHistoryResizing="true";
  }
  updateGitHistoryResize(event: PointerEvent): void {
    const state=this.gitHistoryResizeState;
    if(!state||state.pointerId!==event.pointerId) return;
    event.preventDefault();
    this.setGitHistoryHeight(state.startHeight+state.startY-event.clientY);
  }
  finishGitHistoryResize(event: PointerEvent): void {
    const state=this.gitHistoryResizeState;
    if(!state||state.pointerId!==event.pointerId) return;
    this.gitHistoryResizeState=undefined;
    delete this.host.frame.dataset.gitHistoryResizing;
    if(this.host.gitHistoryResizeHandle.hasPointerCapture(event.pointerId)) {
      this.host.gitHistoryResizeHandle.releasePointerCapture(event.pointerId);
    }
  }
  cancelGitHistoryResize(): void {
    const state=this.gitHistoryResizeState;
    this.gitHistoryResizeState=undefined;
    delete this.host.frame.dataset.gitHistoryResizing;
    if(state&&this.host.gitHistoryResizeHandle.hasPointerCapture(state.pointerId)) {
      this.host.gitHistoryResizeHandle.releasePointerCapture(state.pointerId);
    }
  }
  setGitHistoryHeight(height: number): void {
    const frameHeight=this.host.frame.getBoundingClientRect().height;
    const minimum=120;
    const maximum=Math.max(minimum,frameHeight-170);
    const nextHeight=Math.round(Math.min(maximum,Math.max(minimum,height)));
    this.host.frame.style.setProperty("--cle-git-history-height",`${nextHeight}px`);
    this.host.gitHistoryResizeHandle.setAttribute("aria-valuemax",String(Math.round(maximum)));
    this.host.gitHistoryResizeHandle.setAttribute("aria-valuenow",String(nextHeight));
  }
  syncGitHistoryResizeAria(): void {
    if(!this.gitHistoryOpen) return;
    const frameHeight=this.host.frame.getBoundingClientRect().height;
    const maximum=Math.max(120,frameHeight-170);
    const currentHeight=Math.round(this.gitHistoryPanel.getBoundingClientRect().height);
    this.host.gitHistoryResizeHandle.setAttribute("aria-valuemax",String(Math.round(maximum)));
    this.host.gitHistoryResizeHandle.setAttribute("aria-valuenow",String(currentHeight));
  }
  onGitHistoryResizeKeyDown(event: KeyboardEvent): void {
    if(!this.gitHistoryOpen||(event.key!=="ArrowUp"&&event.key!=="ArrowDown"&&event.key!=="Home")) return;
    event.preventDefault();
    const currentHeight=this.gitHistoryPanel.getBoundingClientRect().height;
    if(event.key==="Home") {
      this.host.frame.style.removeProperty("--cle-git-history-height");
      requestAnimationFrame(() => this.syncGitHistoryResizeAria());
      return;
    }
    this.setGitHistoryHeight(currentHeight+(event.key==="ArrowUp"? 20:-20));
  }
  prepareGitHistoryForThreadSwitch(): void {
    if(!this.gitHistoryOpen) return;
    this.gitHistoryGeneration+=1;
    this.gitHistoryLoading=false;
    this.gitHistoryCommits=[];
    this.gitHistoryHasMore=false;
    this.showGitHistoryList();
    this.gitHistoryBranch.textContent="Repository";
    this.gitHistoryState.hidden=false;
    this.gitHistoryState.textContent="Switching repository…";
    this.host.gitHistoryList.replaceChildren();
    this.host.gitHistoryLoadMoreButton.hidden=true;
    this.host.gitHistoryRefreshButton.disabled=true;
    this.host.gitHistoryLoadMoreButton.disabled=true;
  }
  showGitHistoryUnavailable(message: string): void {
    if(!this.gitHistoryOpen) return;
    this.gitHistoryGeneration+=1;
    this.gitHistoryLoading=false;
    this.gitHistoryCommits=[];
    this.gitHistoryHasMore=false;
    this.showGitHistoryList();
    this.gitHistoryBranch.textContent="Repository";
    this.host.gitHistoryList.replaceChildren();
    this.showGitHistoryError(message);
    this.host.gitHistoryRefreshButton.disabled=false;
    this.host.gitHistoryLoadMoreButton.disabled=false;
  }
  async loadGitHistory(reset: boolean): Promise<void> {
    if(this.gitHistoryLoading) return;
    const bridge=this.host.bridge;
    if(!bridge?.available) {
      this.showGitHistoryError("Code-Codex is not connected.");
      return;
    }
    const generation=++this.gitHistoryGeneration;
    this.gitHistoryLoading=true;
    this.host.gitHistoryRefreshButton.disabled=true;
    this.host.gitHistoryLoadMoreButton.disabled=true;
    if(reset) {
      this.showGitHistoryList();
      this.gitHistoryCommits=[];
      this.gitHistoryState.hidden=false;
      this.gitHistoryState.textContent="Loading commit history…";
      this.host.gitHistoryList.replaceChildren();
      this.host.gitHistoryLoadMoreButton.hidden=true;
    }
    try {
      const raw=await bridge.request<unknown>("explorer.git.history",{
        skip: reset? 0:this.gitHistoryCommits.length,
        limit: 50,
      });
      if(generation!==this.gitHistoryGeneration||!this.gitHistoryOpen) return;
      const result=normalizeGitHistory(raw);
      this.gitHistoryCommits=reset
        ? [...result.commits]
        :[...this.gitHistoryCommits,...result.commits];
      this.gitHistoryHasMore=result.hasMore;
      this.gitHistoryBranch.textContent=result.branch;
      this.renderGitHistoryList();
    } catch(error) {
      recordCaughtRuntimeError("#loadGitHistory",error);

      if(generation===this.gitHistoryGeneration&&this.gitHistoryOpen) {
        this.showGitHistoryError(gitHistoryError(error));
      }
    } finally {
      if(generation===this.gitHistoryGeneration) {
        this.gitHistoryLoading=false;
        this.host.gitHistoryRefreshButton.disabled=false;
        this.host.gitHistoryLoadMoreButton.disabled=false;
      }
    }
  }
  renderGitHistoryList(): void {
    pluginExport<(host: HistoryHost) => void>('git-history','renderGitHistoryList')({ list: this.host.gitHistoryList,commits: this.gitHistoryCommits,state: this.gitHistoryState,loadMore: this.host.gitHistoryLoadMoreButton,hasMore: this.gitHistoryHasMore });
  }
  showGitHistoryError(message: string): void {
    this.gitHistoryState.hidden=false;
    this.gitHistoryState.textContent=message;
    this.host.gitHistoryLoadMoreButton.hidden=true;
  }
  showGitHistoryList(): void {
    this.gitHistoryDetailView.hidden=true;
    this.gitHistoryListView.hidden=false;
    this.host.gitHistoryBackButton.hidden=true;
    this.host.gitHistoryDetail.replaceChildren();
  }
  async openGitCommit(hash: string): Promise<void> {
    const bridge=this.host.bridge;
    if(!bridge?.available) return;
    const generation=++this.gitHistoryGeneration;
    this.gitHistoryListView.hidden=true;
    this.gitHistoryDetailView.hidden=false;
    this.host.gitHistoryBackButton.hidden=false;
    this.host.gitHistoryDetail.textContent="Loading commit…";
    try {
      const result=normalizeGitCommit(await bridge.request<unknown>("explorer.git.commit",{ hash }));
      if(generation!==this.gitHistoryGeneration||!this.gitHistoryOpen) return;
      this.renderGitCommit(result);
    } catch(error) {
      recordCaughtRuntimeError("#openGitCommit",error);

      if(generation===this.gitHistoryGeneration) this.host.gitHistoryDetail.textContent=gitHistoryError(error);
    }
  }
  renderGitCommit(commit: GitCommitResult): void {
    pluginExport<(host: { detail: HTMLElement },commit: GitCommitResult) => void>('git-history','renderGitCommit')({ detail: this.host.gitHistoryDetail },commit);
  }
  async openGitHistoryFile(hash:string,path:string):Promise<void>{await this.host.openGitDiff(hash,path);}

}

function pluginExport<T>(id:string,name:string):T{return requireCallable(id,name,readPluginExport(id,name));}
