import type { WorkspaceSession } from '../../core/session/workspace-session';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { WorkspaceBridge } from "../../bridge";
import { type ChangeKind,type ExplorerViewState } from "../../contracts/bridge";
import { errorCode,friendlyError,normalizeList } from "../../core/bridge/response-validation";
import { PAGE_SIZE } from "../../core/configuration/explorer";
import { runtimeTaskLabel } from "../../runtime-events";
import { beginRuntimeOperation,recordCaughtRuntimeError,runtimeErrorDetails } from "../../runtime-operations";
import { TreeModel,parentPath } from "../../tree-model";
export interface DirectoryJobsControllerPorts {
  readonly session: Readonly<WorkspaceSession<WorkspaceBridge>>;
  readonly element: HTMLElement;
  readonly model: Pick<TreeModel,"beginLoad"|"commitLoad"|"failLoad"|"getNextCursor"|"loadedDirectories"|"markChange"|"nodeCount">;
  readonly renderTree: () => void;
  readonly pendingMarks: Map<string,ChangeKind>;
  readonly setState: (state: ExplorerViewState,detail?: string) => void;
  readonly announce: (message: string) => void;
}
export class DirectoryJobsController {
  readonly loads = new Map<string,Promise<void>>();
  constructor(private readonly host: DirectoryJobsControllerPorts) { }
  async loadDirectory(path: string,append=false,waitForExisting=false,expectedGeneration?: number): Promise<void> {
    if(expectedGeneration!==undefined&&expectedGeneration!==this.host.session.generation) return;
    const existing=this.loads.get(path);
    if(existing) {
      if(!waitForExisting) return;
      await existing;
      return this.loadDirectory(path,append,false,expectedGeneration);
    }
    const load=this.performDirectoryLoad(path,append);
    this.loads.set(path,load);
    try {
      await load;
    } finally {
      if(this.loads.get(path)===load) this.loads.delete(path);
    }
  }
  async performDirectoryLoad(path: string,append: boolean): Promise<void> {
    const bridge=this.host.session.bridge;
    if(!bridge||!this.host.session.context) return;
    const cursor=append? this.host.model.getNextCursor(path):undefined;
    if(append&&!cursor) return;
    if(!this.host.model.beginLoad(path,append)) return;
    const generation=this.host.session.generation;
    const diagnostic=beginRuntimeOperation('file-tree','directory listing',{ directory: runtimeTaskLabel(path||'workspace-root'),append,generation });
    this.host.renderTree();
    try {
      const params: Record<string,unknown>={ relativePath: path,limit: PAGE_SIZE };
      if(cursor) params.cursor=cursor;
      const raw=await bridge.request<unknown>("explorer.list",params);
      if(generation!==this.host.session.generation) return;
      this.host.model.commitLoad(path,normalizeList(raw),append);
      diagnostic.finish('applied',{ nodeCount: this.host.model.nodeCount(),hasNextPage: !!this.host.model.getNextCursor(path) });
      for(const [markedPath,kind] of this.host.pendingMarks) {
        if(parentPath(markedPath)===path) {
          this.host.model.markChange(markedPath,kind);
          this.host.pendingMarks.delete(markedPath);
        }
      }
    } catch(error) {
      recordCaughtRuntimeError("#performDirectoryLoad",error);

      diagnostic.finish('failed',runtimeErrorDetails(error));
      if(generation!==this.host.session.generation) return;
      this.host.model.failLoad(path,friendlyError(error));
      if(path==="") this.host.setState("error",errorCode(error));
    } finally {
      diagnostic.finish('discarded',{ reason: 'Workspace generation changed',currentGeneration: this.host.session.generation });
      this.host.renderTree();
    }
  }
  async runDirectoryRefresh(): Promise<void> {
    if(!this.host.session.context) return;
    const directories=this.host.model.loadedDirectories();
    this.host.element.dataset.busy="true";
    try {
      // Native lifecycle requests are intentionally serialized. Refresh in the
      // same order so a deep expanded tree cannot overrun the bounded CDP
      // dispatcher when visibility settings or an overflow resync changes.
      for(const path of directories) await this.loadDirectory(path,false,true);
      this.host.announce("Visible directories refreshed");
    } finally {
      this.host.element.dataset.busy="false";
    }
  }
}
