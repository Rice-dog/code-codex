import { BridgeUnavailableError,WorkspaceBridge } from "../../bridge";
import { mediaPreviewRoute } from "../../components/plugin-templates";
import { type ExplorerContext,type ExplorerSettings,type ExplorerViewState,type FlatTreeRow } from "../../contracts/bridge";
import { type NormalizedPreview,type PreviewTab } from "../../contracts/explorer-model";
import type { MainPreviewPort } from "../../contracts/main-preview";
import { errorCode,isPathWithin } from "../../core/bridge/response-validation";
import { MAX_PREVIEW_TABS,PREVIEW_SELECTION_DELAY_MS } from "../../core/configuration/explorer";
import { GLTF_BINARY_PREVIEW_MIME,GLTF_JSON_PREVIEW_MIME } from "../../core/preview/configuration";
import { type MainPreviewFileView } from "../../file-preview/contracts";
import { gitHistoryError,normalizeGitDiff } from "../../git-history-facade";
import { runtimeEvent,runtimeTaskLabel } from "../../runtime-events";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import { TabStore } from "../preview/tab-store";
export interface PreviewWorkspaceControllerPorts {
 readonly element:HTMLElement;
 readonly collapse:(collapsed?:boolean)=>void;
 readonly reportEditingConflict:(message:string)=>void;
  readonly state: ExplorerViewState;
  readonly context: ExplorerContext | undefined;
  readonly bridge: WorkspaceBridge | undefined;
  readonly mainPreviewSurface: HTMLElement | undefined;
  readonly editingPath: string | null;
  readonly leaveEditing: (prompt: string) => boolean;
  readonly ensureMainPreview: () => MainPreviewPort | undefined;
  readonly renderVisible: () => void;
  readonly settings: ExplorerSettings;
  readonly announce: (message: string) => void;
  readonly generation: number;
  readonly mainPreview: MainPreviewPort | undefined;
  readonly requestPreview: (tab: PreviewTab, bridge: WorkspaceBridge, context: ExplorerContext, mainPreview: MainPreviewPort, generation: number, sessionRevision: number, instanceId: number, revision: number) => Promise<void>;
  readonly editSaving: boolean;
  readonly editError: string | undefined;
  readonly detachMainPreview: (forgetSurface?: boolean) => void;
  readonly clearEditing: (sync?: boolean) => boolean;
  readonly editDraft: string;
  readonly enabledPreviewers: ReadonlySet<string>;
  readonly syncEditModeButton: () => void;
}
export class PreviewWorkspaceController {
 restoreDetachedTab(saved:Pick<PreviewTab,"path"|"name"|"view">):PreviewTab {
 const tab:PreviewTab={instanceId:this.tabStore.nextInstanceId(),path:saved.path,name:saved.name,revision:1,timer:undefined,modifiedDuringSave:false,dirty:false,view:saved.view};this.tabStore.append(tab);return tab;
 }

  async openGitDiff(hash: string,path: string): Promise<void> {
    const normalizedPath=path.replaceAll("\\","/");
    const name=normalizedPath.split("/").at(-1)||normalizedPath;
    const tabPath=`git-diff://${hash}/${normalizedPath}`;
    if(
      (this.host.state!=="ready"&&this.host.state!=="empty")||
      !this.host.context||
      !this.host.bridge?.available||
      !this.host.mainPreviewSurface?.isConnected||
      !this.host.ensureMainPreview()
    ) return;
    if(this.host.editingPath!==null&&!this.host.leaveEditing("Open a Git diff and discard your unsaved changes?")) return;

    let tab=this.previewTabs.find((candidate) => candidate.path===tabPath);
    if(!tab) {
      if(this.previewTabs.length>=MAX_PREVIEW_TABS) {
        const evicted=this.tabStore.evictFirst();
        if(evicted) this.disposePreviewTab(evicted);
      }
      tab={
        instanceId: this.tabStore.nextInstanceId(),
        path: tabPath,
        name,
        revision: 0,
        timer: undefined,
        modifiedDuringSave: false,
        dirty: false,
        view: { kind: "loading",path: tabPath,name },
      };
      this.tabStore.append(tab);
    }
    const revision=++tab.revision;
    tab.view={ kind: "loading",path: tabPath,name };
    this.activePreviewPath=tabPath;
    this.syncMainPreview();
    this.host.renderVisible();
    if(this.host.element.dataset.placement==="drawer"&&!this.host.settings.collapsed) this.host.collapse(true);
    try {
      const bridge=this.host.bridge;
      if(!bridge?.available) throw new BridgeUnavailableError();
      const result=normalizeGitDiff(await bridge.request<unknown>("explorer.git.diff",{ hash,path }));
      if(!this.previewTabs.includes(tab)||tab.revision!==revision) return;
      tab.view={
        kind: "git-diff",
        path: tabPath,
        name,
        sourcePath: result.path||normalizedPath,
        content: result.content,
        truncated: result.truncated,
        shortHash: hash.slice(0,7),
      };
      this.syncMainPreview();
      this.host.announce(`${name} changes opened in the main view`);
    } catch(error) {
      recordCaughtRuntimeError("#openGitDiff",error);

      if(!this.previewTabs.includes(tab)||tab.revision!==revision) return;
      tab.view={ kind: "error",path: tabPath,name,code: errorCode(error),message: gitHistoryError(error) };
      this.syncMainPreview();
      this.host.announce(`Changes could not load for ${name}`);
    }
  }

  get previewTabs(): readonly PreviewTab[] { return this.tabStore.items; }
  get activePreviewPath(): string | null { return this.tabStore.activePath; }
  set activePreviewPath(path: string | null) { this.tabStore.activate(path); }
  constructor(private readonly host: PreviewWorkspaceControllerPorts) {}
readonly tabStore = new TabStore<PreviewTab>();
previewSessionRevision = 0;
closePreviewTabsWithin(path: string): void {
        const paths = this.previewTabs
            .filter((tab) => isPathWithin(path, tab.path))
            .map((tab) => tab.path)
            .sort((left, right) => right.length - left.length);
        for (const previewPath of paths)
            this.closePreviewTab(previewPath, false);
    }
openPreviewTab(row: FlatTreeRow): void {
        const node = row.node;
        if (row.kind !== "node" ||
            !node ||
            node.kind !== "file" ||
            node.inaccessible ||
            node.change === "deleted" ||
            (this.host.state !== "ready" && this.host.state !== "empty") ||
            !this.host.context ||
            !this.host.bridge?.available ||
            !this.host.mainPreviewSurface?.isConnected) {
            return;
        }
        this.openPreviewPath(node.relativePath, node.name);
    }
openPreviewPath(relativePath: string, name: string): void {
        if ((this.host.state !== "ready" && this.host.state !== "empty") ||
            !this.host.context ||
            !this.host.bridge?.available ||
            !this.host.mainPreviewSurface?.isConnected) {
            return;
        }
        if (this.host.editingPath !== null &&
            this.host.editingPath !== relativePath &&
            !this.host.leaveEditing("Open another file and discard your unsaved changes?")) {
            return;
        }
        if (!this.host.ensureMainPreview())
            return;
        let tab = this.previewTabs.find((candidate) => candidate.path === relativePath);
        if (!tab) {
            if (this.previewTabs.length >= MAX_PREVIEW_TABS) {
                const evicted = this.tabStore.evictFirst();
                if (evicted)
                    this.disposePreviewTab(evicted);
            }
            tab = {
                instanceId: this.tabStore.nextInstanceId(),
                path: relativePath,
                name,
                revision: 0,
                timer: undefined,
                modifiedDuringSave: false,
                dirty: false,
                view: { kind: "loading", path: relativePath, name },
            };
            this.tabStore.append(tab);
        }
        this.activePreviewPath = tab.path;
        if (tab.dirty || tab.view.kind === "error" || tab.revision === 0)
            this.schedulePreview(tab);
        else
            this.syncMainPreview();
        this.host.renderVisible();
        if (this.host.element.dataset.placement === "drawer" && !this.host.settings.collapsed)
            this.host.collapse(true);
        this.host.announce(`${tab.name} opened in the main view`);
    }
schedulePreview(tab: PreviewTab, delay = PREVIEW_SELECTION_DELAY_MS): void {
        if (tab.timer)
            clearTimeout(tab.timer);
        tab.timer = undefined;
        tab.dirty = false;
        const revision = ++tab.revision;
        tab.view = { kind: "loading", path: tab.path, name: tab.name };
        const generation = this.host.generation;
        const sessionRevision = this.previewSessionRevision;
        const instanceId = tab.instanceId;
        const bridge = this.host.bridge;
        const context = this.host.context;
        const mainPreview = this.host.mainPreview;
        this.syncMainPreview();
        if (!bridge?.available || !context || !mainPreview?.isConnected)
            return;
        tab.timer = setTimeout(() => {
            tab.timer = undefined;
            void this.host.requestPreview(tab, bridge, context, mainPreview, generation, sessionRevision, instanceId, revision);
        }, delay);
    }
previewView(tab: PreviewTab, preview: NormalizedPreview): MainPreviewFileView {
        if (preview.kind === "unsupported") {
            return {
                kind: "unsupported",
                path: tab.path,
                name: tab.name,
                sizeBytes: preview.sizeBytes,
                reason: preview.reason,
            };
        }
        if ("bytes" in preview) {
            if (preview.kind === "model") {
                if (!preview.modelVersion || !preview.modelResources) {
                    return { kind: "error", path: tab.path, name: tab.name, code: "INVALID_REQUEST", message: "The model preview response was incomplete." };
                }
                return {
                    kind: "model",
                    path: tab.path,
                    name: tab.name,
                    mimeType: preview.mimeType === GLTF_BINARY_PREVIEW_MIME ? GLTF_BINARY_PREVIEW_MIME : GLTF_JSON_PREVIEW_MIME,
                    sizeBytes: preview.sizeBytes,
                    bytes: preview.bytes,
                    version: preview.modelVersion,
                    resources: preview.modelResources,
                };
            }
            return {
                kind: preview.kind,
                path: tab.path,
                name: tab.name,
                mimeType: preview.mimeType,
                sizeBytes: preview.sizeBytes,
                bytes: preview.bytes,
                ...(preview.previewNotice === undefined ? {} : { previewNotice: preview.previewNotice }),
            };
        }
        const editability = {
            editable: preview.editable,
            ...(preview.version === undefined ? {} : { version: preview.version }),
            ...(preview.lineEnding === undefined ? {} : { lineEnding: preview.lineEnding }),
        };
        return preview.text
            ? {
                kind: "text",
                path: tab.path,
                name: tab.name,
                text: preview.text,
                sizeBytes: preview.sizeBytes,
                truncated: preview.truncated,
                ...editability,
            }
            : { kind: "empty", path: tab.path, name: tab.name, sizeBytes: preview.sizeBytes, ...editability };
    }
markPreviewModified(path: string): void {
        const tab = this.previewTabs.find((candidate) => candidate.path === path);
        if (!tab)
            return;
        if (this.host.editSaving && this.host.editingPath === path) {
            tab.modifiedDuringSave = true;
            tab.dirty = true;
            return;
        }
        if (tab.timer)
            clearTimeout(tab.timer);
        tab.timer = undefined;
        tab.revision += 1;
        tab.dirty = true;
        if (this.host.editingPath === path) {
            this.host.reportEditingConflict("This file changed on disk. Reload it before saving.");
            this.syncMainPreview();
            return;
        }
        tab.view = { kind: "loading", path: tab.path, name: tab.name };
        if (this.activePreviewPath === path)
            this.schedulePreview(tab);
        else
            this.syncMainPreview();
    }
closePreviewTab(path: string, announce = true): void {
        const index = this.previewTabs.findIndex((candidate) => candidate.path === path);
        if (index < 0)
            return;
        if (this.host.editingPath === path && !this.host.leaveEditing("Close this file and discard your unsaved changes?")) {
            this.syncMainPreview();
            return;
        }
        const closed = this.tabStore.remove(index);
        runtimeEvent("renderer", "file preview", "closed", { tab: runtimeTaskLabel(path), openTabCount: this.previewTabs.length });
        if (!closed)
            return;
        this.disposePreviewTab(closed);
        let activatedTab: PreviewTab | undefined;
        if (this.activePreviewPath === path) {
            this.activePreviewPath = this.previewTabs[index]?.path ?? this.previewTabs[index - 1]?.path ?? null;
            activatedTab = this.previewTabs.find((candidate) => candidate.path === this.activePreviewPath);
        }
        if (activatedTab && (activatedTab.dirty || activatedTab.view.kind === "error" || activatedTab.revision === 0)) {
            this.schedulePreview(activatedTab, 0);
        }
        else {
            this.syncMainPreview();
        }
        if (!this.previewTabs.length)
            this.host.detachMainPreview(false);
        this.host.renderVisible();
        if (announce)
            this.host.announce(`${closed.name} closed`);
    }
disposePreviewTab(tab: PreviewTab): void {
        if (tab.timer)
            clearTimeout(tab.timer);
        tab.timer = undefined;
        tab.revision += 1;
        tab.dirty = false;
        tab.modifiedDuringSave = false;
        tab.view = { kind: "loading", path: tab.path, name: tab.name };
    }
purgePreviewTabs(renderRows = true): void {
        this.previewSessionRevision += 1;
        this.host.clearEditing(false);
        for (const tab of this.previewTabs)
            this.disposePreviewTab(tab);
        this.tabStore.clear();
        this.activePreviewPath = null;
        this.syncMainPreview();
        this.host.detachMainPreview(false);
        if (renderRows)
            this.host.renderVisible();
    }
syncMainPreview(): void {
        this.releaseInactiveMediaPreviews();
        this.host.element.dataset.previewTabs = String(this.previewTabs.length);
        const editor = this.host.editingPath
            ? {
                path: this.host.editingPath,
                draft: this.host.editDraft,
                saving: this.host.editSaving,
                ...(this.host.editError === undefined ? {} : { error: this.host.editError }),
            }
            : undefined;
        this.host.mainPreview?.setState({
            activePath: this.activePreviewPath,
            tabs: this.previewTabs.map((tab) => tab.view),
            enabledPreviewers: [...this.host.enabledPreviewers],
            ...(editor ? { editor } : {}),
        });
        this.host.syncEditModeButton();
    }
releaseInactiveMediaPreviews(): void {
        for (const tab of this.previewTabs) {
            if (tab.path === this.activePreviewPath)
                continue;
            const route = mediaPreviewRoute(tab.path);
            if (!route || !this.host.enabledPreviewers.has(route.previewerId))
                continue;
            if (tab.dirty && tab.view.kind === "loading" && tab.timer === undefined)
                continue;
            if (tab.timer)
                clearTimeout(tab.timer);
            tab.timer = undefined;
            tab.revision += 1;
            tab.dirty = true;
            tab.view = { kind: "loading", path: tab.path, name: tab.name };
        }
    }
}
