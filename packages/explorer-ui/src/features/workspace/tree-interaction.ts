import { MARQUEE_MOVE_THRESHOLD_PX,OVERSCAN } from "../../core/configuration/explorer";
import { recordCaughtRuntimeError } from "../../runtime-operations";
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { type ExplorerSettings,type ExplorerViewState,type FlatTreeRow } from "../../contracts/bridge";
import { type ContextMenuTarget,type DragSource,type MarqueeState } from "../../contracts/explorer-model";
import { MARQUEE_LONG_PRESS_MS } from "../../core/configuration/explorer";
import { countLoadedTreeMatches,filterLoadedTreeRows,normalizeFileFilter } from "../../file-filter";
import { getFileIcon,icons } from "../../icons";
import { TREE_ROW_HEIGHT } from "../../styles";
import { TreeModel } from "../../tree-model";
export interface TreeInteractionControllerPorts {
  readonly activatePreviewPath: (path: string | null) => void;
  readonly element: HTMLElement;
  readonly collapse: (collapsed?: boolean) => void;
  readonly treeShell: HTMLElement;

  readonly announce: (message: string) => void;
  readonly fileFilterInput: HTMLInputElement;
  readonly state: ExplorerViewState;
  readonly setState: (state: ExplorerViewState,detail?: string) => void;
  readonly fileFilterEmpty: HTMLElement;
  readonly renderStatus: () => void;
  readonly contextMenuTarget: ContextMenuTarget|undefined;
  readonly activePreviewPath: string|null;
  readonly dragSource: DragSource|undefined;
  readonly dropTargetPath: string|undefined;
  readonly closeContextMenu: (restoreFocus: boolean) => void;
  readonly treeWindow: HTMLElement;
  readonly openPreviewTab: (row: FlatTreeRow) => void;
  readonly settings: ExplorerSettings;
  readonly marqueeElement: HTMLElement;
  readonly contextTargetForRow: (row: FlatTreeRow) => ContextMenuTarget|undefined;
  readonly rootContextTarget: () => ContextMenuTarget;
  readonly shadow: ShadowRoot;
  readonly openContextMenu: (target: ContextMenuTarget,clientX: number,clientY: number) => void;
  readonly pasteFiles: () => Promise<void>;
  readonly deleteSelectedFiles: () => Promise<void>;
  readonly leaveEditing: (prompt: string) => boolean;
  readonly syncMainPreview: () => void;
  readonly loadDirectory: (path: string,append?: boolean,waitForExisting?: boolean,expectedGeneration?: number) => Promise<void>;
}
export class TreeInteractionController {
 clearFileClipboard(expected:{paths:string[];operation:"copy"|"cut"}):void {if(this.fileClipboard===expected)this.fileClipboard=undefined;}
 readonly model=new TreeModel();
resetFilterPresentation(): void {
        this.filterExpandablePaths.clear();
        this.filterCollapsedPaths.clear();
    }
isFilterExpandable(row: FlatTreeRow): boolean {
        return Boolean(this.fileFilterQuery && this.filterExpandablePaths.has(row.path));
    }
isFilterExpanded(row: FlatTreeRow): boolean {
        return this.isFilterExpandable(row) && !this.filterCollapsedPaths.has(row.path);
    }
renderVisible(): void {
        if (this.host.treeShell.hidden || this.host.settings.collapsed)
            return;
        this.updateScrollbarPosition();
        const viewport = this.host.treeShell.clientHeight || 420;
        const start = Math.max(0, Math.floor(this.host.treeShell.scrollTop / TREE_ROW_HEIGHT) - OVERSCAN);
        const end = Math.min(this.rows.length, Math.ceil((this.host.treeShell.scrollTop + viewport) / TREE_ROW_HEIGHT) + OVERSCAN);
        const fragment = document.createDocumentFragment();
        for (let index = start; index < end; index += 1) {
            const row = this.rows[index];
            if (row)
                fragment.append(this.createRow(row, index));
        }
        this.host.treeWindow.replaceChildren(fragment);
        const active = this.host.shadow.getElementById(`cle-row-${this.focusedIndex}`);
        if (active)
            this.host.treeShell.setAttribute("aria-activedescendant", active.id);
        else
            this.host.treeShell.removeAttribute("aria-activedescendant");
    }
updateScrollbarPosition(): void {
        const maxScrollTop = Math.max(0, this.host.treeShell.scrollHeight - this.host.treeShell.clientHeight);
        const scrollTop = Math.max(0, this.host.treeShell.scrollTop);
        const position = maxScrollTop <= 1
            ? "none"
            : scrollTop <= 1
                ? "start"
                : scrollTop >= maxScrollTop - 1
                    ? "end"
                    : "middle";
        this.host.treeShell.dataset.scrollPosition = position;
    }
onTreeDoubleClick(event: MouseEvent): void {
        const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
        const index = Number(element?.dataset.index);
        const row = this.rows[index];
        if (row?.kind === "node" && row.node?.kind === "directory")
            this.toggleDirectory(row);
    }
selectableRow(index: number): FlatTreeRow | undefined {
        const row = this.rows[index];
        return row?.kind === "node" ? row : undefined;
    }
setSingleSelection(path: string, index: number): void {
        this.selectedPaths.clear();
        this.selectedPaths.add(path);
        this.selectionAnchorIndex = index;
        this.syncSelectionDom();
    }
toggleSelectionAt(index: number): void {
        const row = this.selectableRow(index);
        if (!row)
            return;
        if (this.selectedPaths.has(row.path))
            this.selectedPaths.delete(row.path);
        else
            this.selectedPaths.add(row.path);
        this.selectionAnchorIndex = index;
        this.syncSelectionDom();
        this.announceSelectionCount();
    }
selectRangeTo(index: number): void {
        const anchor = this.selectionAnchorIndex >= 0 ? this.selectionAnchorIndex : this.focusedIndex;
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        this.selectedPaths.clear();
        for (let cursor = start; cursor <= end; cursor += 1) {
            const row = this.selectableRow(cursor);
            if (row)
                this.selectedPaths.add(row.path);
        }
        this.syncSelectionDom();
        this.announceSelectionCount();
    }
clearSelection(sync = true): void {
        if (!this.selectedPaths.size && this.selectionAnchorIndex < 0)
            return;
        this.selectedPaths.clear();
        this.selectionAnchorIndex = -1;
        if (sync)
            this.syncSelectionDom();
    }
updateSelectionAfterKeyNav(extend: boolean): void {
        const row = this.selectableRow(this.focusedIndex);
        if (extend) {
            this.selectRangeTo(this.focusedIndex);
        }
        else if (row) {
            this.setSingleSelection(row.path, this.focusedIndex);
        }
        else {
            this.clearSelection(true);
        }
    }
selectAll(): void {
        const paths = this.rows.filter((row) => row.kind === "node").map((row) => row.path);
        if (!paths.length)
            return;
        this.selectedPaths.clear();
        for (const path of paths)
            this.selectedPaths.add(path);
        const first = this.rows.findIndex((row) => row.kind === "node");
        if (first >= 0)
            this.selectionAnchorIndex = first;
        this.syncSelectionDom();
        this.host.announce(`All ${paths.length} loaded items selected`);
    }
syncSelectionDom(): void {
        for (const element of this.host.treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
            const path = element.dataset.path;
            const selected = path !== undefined && this.selectedPaths.has(path);
            element.dataset.selected = String(selected);
            element.setAttribute("aria-selected", String(selected || (path !== undefined && path === this.host.activePreviewPath)));
        }
    }
announceSelectionCount(): void {
        const count = this.selectedPaths.size;
        if (count > 1)
            this.host.announce(`${count} items selected`);
    }
beginMarquee(marquee: MarqueeState, clientX: number, clientY: number): void {
        if (this.marquee !== marquee || marquee.active)
            return;
        marquee.active = true;
        try {
            this.host.treeShell.setPointerCapture(marquee.pointerId);
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#beginMarquee", __codeCodexCaught);
            // Pointer capture is best-effort; the window pointercancel still cleans up.
        }
        if (!marquee.additive)
            this.clearSelection(true);
        this.host.marqueeElement.hidden = false;
        this.updateMarquee(clientX, clientY);
    }
onTreePointerMove(event: PointerEvent): void {
        const marquee = this.marquee;
        if (!marquee || marquee.pointerId !== event.pointerId)
            return;
        if (!marquee.active) {
            const moved = Math.abs(event.clientX - marquee.originClientX) + Math.abs(event.clientY - marquee.originClientY);
            // Movement before the long press means the user is dragging a row to move
            // it, not drawing a marquee — stand down and let the native drag proceed.
            if (moved > MARQUEE_MOVE_THRESHOLD_PX)
                this.cancelMarquee();
            return;
        }
        event.preventDefault();
        this.updateMarquee(event.clientX, event.clientY);
    }
onTreePointerUp(event: PointerEvent): void {
        const marquee = this.marquee;
        if (!marquee || marquee.pointerId !== event.pointerId)
            return;
        const wasActive = marquee.active;
        this.cancelMarquee();
        // A completed marquee must not also fire the row's click handler.
        if (wasActive) {
            event.preventDefault();
            this.suppressNextClick = true;
            this.announceSelectionCount();
        }
    }
cancelMarquee(): void {
        if (this.marqueeLongPressTimer)
            clearTimeout(this.marqueeLongPressTimer);
        this.marqueeLongPressTimer = undefined;
        const marquee = this.marquee;
        this.marquee = undefined;
        if (!marquee)
            return;
        if (marquee.active) {
            try {
                this.host.treeShell.releasePointerCapture(marquee.pointerId);
            }
            catch (__codeCodexCaught) {
                recordCaughtRuntimeError("#cancelMarquee", __codeCodexCaught);
                // Already released or never captured.
            }
        }
        this.host.marqueeElement.hidden = true;
        this.host.marqueeElement.style.removeProperty("top");
        this.host.marqueeElement.style.removeProperty("height");
    }
contentOffsetY(clientY: number): number {
        return clientY - this.host.treeShell.getBoundingClientRect().top;
    }
activateRow(row: FlatTreeRow): void {
        if (row.kind === "more")
            void this.host.loadDirectory(row.parentPath, true);
        else if (row.kind === "directory-error")
            void this.host.loadDirectory(row.parentPath);
        else if (row.kind === "node" && row.node?.kind === "directory")
            this.toggleDirectory(row);
        else if (row.kind === "node" && row.node?.kind === "file")
            this.host.openPreviewTab(row);
    }
focusIndex(index: number, focus = true): void {
        this.focusedIndex = Math.max(0, Math.min(index, this.rows.length - 1));
        const top = this.focusedIndex * TREE_ROW_HEIGHT;
        const bottom = top + TREE_ROW_HEIGHT;
        if (top < this.host.treeShell.scrollTop)
            this.host.treeShell.scrollTop = top;
        else if (bottom > this.host.treeShell.scrollTop + this.host.treeShell.clientHeight)
            this.host.treeShell.scrollTop = bottom - this.host.treeShell.clientHeight;
        this.renderVisible();
        if (focus)
            this.host.treeShell.focus();
    }
runTypeahead(character: string): void {
        if (this.typeaheadTimer)
            clearTimeout(this.typeaheadTimer);
        this.typeahead += character.toLocaleLowerCase();
        const start = (this.focusedIndex + 1) % this.rows.length;
        for (let offset = 0; offset < this.rows.length; offset += 1) {
            const index = (start + offset) % this.rows.length;
            const name = this.rows[index]?.node?.name.toLocaleLowerCase();
            if (name?.startsWith(this.typeahead)) {
                this.focusIndex(index);
                break;
            }
        }
        this.typeaheadTimer = setTimeout(() => (this.typeahead = ""), 700);
    }

  // State belongs to this feature; the application consumes it explicitly.
  rows: FlatTreeRow[] = [];
  allRowCount = 0;
  fileFilterQuery = "";
  readonly filterExpandablePaths = new Set<string>();
  readonly filterCollapsedPaths = new Set<string>();
  focusedIndex = 0;
  typeahead = "";
  typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
  readonly selectedPaths = new Set<string>();
  selectionAnchorIndex = -1;
  fileClipboard: {
        paths: string[];
        operation: "copy" | "cut";
    } | undefined;
  marquee: MarqueeState | undefined;
  marqueeLongPressTimer: ReturnType<typeof setTimeout> | undefined;
  suppressNextClick = false;

  constructor(private readonly host: TreeInteractionControllerPorts) { }
  treeSpacer!: HTMLElement;
  applyFileFilter(value: string): void {
    const next=normalizeFileFilter(value);
    if(next===this.fileFilterQuery) return;
    this.fileFilterQuery=next;
    this.resetFilterPresentation();
    this.clearSelection(false);
    this.rows=[];
    this.focusedIndex=0;
    this.host.treeShell.scrollTop=0;
    this.renderTree();
    const matches=countLoadedTreeMatches(this.model.flatten(true),next);
    this.host.announce(next? (matches===1? "1 loaded item matches":`${matches} loaded items match`):"File filter cleared");
  }
  onFileFilterKeyDown(event: KeyboardEvent): void {
    if(event.key==="ArrowDown"&&this.rows.length>0) {
      event.preventDefault();
      this.focusIndex(0);
      return;
    }
    if(event.key!=="Escape") return;
    event.preventDefault();
    if(this.fileFilterQuery||this.host.fileFilterInput.value) {
      this.clearFileFilter(true);
      this.host.announce("File filter cleared");
    } else {
      this.host.treeShell.focus();
    }
  }
  clearFileFilter(render: boolean): void {
    const changed=Boolean(this.fileFilterQuery||this.host.fileFilterInput.value);
    this.fileFilterQuery="";
    this.host.fileFilterInput.value="";
    this.resetFilterPresentation();
    if(!render||!changed) return;
    this.clearSelection(false);
    this.rows=[];
    this.focusedIndex=0;
    this.host.treeShell.scrollTop=0;
    this.renderTree();
  }
  renderTree(): void {
    const focusedKey=this.rows[this.focusedIndex]?.key;
    const allRows=this.model.flatten();
    const filterSource=this.fileFilterQuery? this.model.flatten(true):allRows;
    const filteredRows=filterLoadedTreeRows(filterSource,this.fileFilterQuery);
    if(this.fileFilterQuery) {
      this.updateFilterExpandablePaths(filteredRows);
      this.rows=this.applyFilterPresentationCollapses(filteredRows);
    } else {
      this.resetFilterPresentation();
      this.rows=filteredRows;
    }
    this.allRowCount=allRows.filter((row) => row.kind==="node").length;
    if(this.host.state==="ready"&&allRows.length===0) {
      this.host.setState("empty");
      return;
    }
    if(this.host.state==="empty"&&allRows.length>0) this.host.setState("ready");
    const retainedFocus=focusedKey? this.rows.findIndex((row) => row.key===focusedKey):-1;
    this.focusedIndex=retainedFocus>=0? retainedFocus:Math.max(0,Math.min(this.focusedIndex,this.rows.length-1));
    const noMatches=Boolean(this.fileFilterQuery)&&this.rows.length===0;
    this.host.fileFilterEmpty.hidden=!noMatches;
    this.host.treeShell.dataset.filterEmpty=String(noMatches);
    if(noMatches) this.host.fileFilterEmpty.textContent=`No loaded files match “${this.host.fileFilterInput.value.trim()}”.`;
    this.treeSpacer.style.height=`${Math.max(1,this.rows.length)*TREE_ROW_HEIGHT}px`;
    this.renderVisible();
    this.host.renderStatus();
  }
  updateFilterExpandablePaths(rows: FlatTreeRow[]): void {
    this.filterExpandablePaths.clear();
    for(let index=0;index<rows.length-1;index+=1) {
      const row=rows[index];
      const next=rows[index+1];
      if(
        row?.kind==="node"&&
        row.node?.kind==="directory"&&
        !row.node.inaccessible&&
        next&&
        next.depth>row.depth
      ) {
        this.filterExpandablePaths.add(row.path);
      }
    }
  }
  applyFilterPresentationCollapses(rows: FlatTreeRow[]): FlatTreeRow[] {
    const visible: FlatTreeRow[]=[];
    let collapsedDepth: number|undefined;
    for(const row of rows) {
      if(collapsedDepth!==undefined) {
        if(row.depth>collapsedDepth) continue;
        collapsedDepth=undefined;
      }
      visible.push(row);
      if(this.filterExpandablePaths.has(row.path)&&this.filterCollapsedPaths.has(row.path)) {
        collapsedDepth=row.depth;
      }
    }
    return visible;
  }
  createRow(row: FlatTreeRow,index: number): HTMLElement {
    const element=document.createElement("div");
    element.className="tree-row";
    element.id=`cle-row-${index}`;
    element.dataset.index=String(index);
    element.style.setProperty("--depth",String(row.depth));
    element.style.top=`${index*TREE_ROW_HEIGHT}px`;
    element.setAttribute("role","treeitem");
    element.setAttribute("aria-level",String(row.depth));
    element.dataset.active=String(index===this.focusedIndex);
    element.dataset.contextTarget=String(row.kind==="node"&&row.path===this.host.contextMenuTarget?.path);
    const selected=row.kind==="node"&&this.selectedPaths.has(row.path);
    element.dataset.selected=String(selected);
    element.setAttribute(
      "aria-selected",
      String(selected||(row.kind==="node"&&row.path===this.host.activePreviewPath)),
    );

    if(row.kind!=="node"||!row.node) {
      element.dataset.kind="utility";
      const icon=document.createElement("span");
      icon.className="node-icon utility";
      icon.textContent=row.kind==="directory-loading"? "·":row.kind==="directory-error"? "!":"+";
      const name=document.createElement("span");
      name.className="node-name";
      name.dataset.i18nOwned="";
      name.textContent=
        row.kind==="directory-loading"? "Loading directory…":row.kind==="directory-error"? "Directory unavailable — retry":"Load next page";
      element.append(icon,name);
      if(row.kind==="directory-loading") element.setAttribute("aria-disabled","true");
      return element;
    }

    const node=row.node;
    const expandable=node.kind==="directory"&&!node.inaccessible&&
      (!this.fileFilterQuery||this.isFilterExpandable(row));
    element.dataset.path=node.relativePath;
    element.dataset.change=node.change??"";
    element.dataset.nodeKind=node.kind;
    element.dataset.inaccessible=String(node.inaccessible===true);
    element.title=node.relativePath;
    const draggable=(node.kind==="file"||node.kind==="directory")&&
      !node.inaccessible&&node.change!=="deleted";
    element.draggable=draggable;
    element.dataset.dragSource=String(this.host.dragSource?.path===node.relativePath);
    element.dataset.dropTarget=String(
      node.kind==="directory"&&this.host.dropTargetPath===node.relativePath,
    );
    if(expandable) element.setAttribute("aria-expanded",String(
      this.fileFilterQuery? this.isFilterExpanded(row):this.model.isExpanded(node.relativePath),
    ));
    if(node.inaccessible) element.setAttribute("aria-disabled","true");

    const leading=document.createElement("span");
    if(expandable) {
      leading.className="twisty";
      leading.dataset.action="toggle";
      leading.innerHTML=icons.chevron;
    } else {
      leading.className=`node-icon ${node.inaccessible? "inaccessible":node.kind}`;
      if(node.inaccessible) {
        leading.innerHTML=icons.lock;
      } else if(node.kind==="directory") {
        leading.innerHTML=icons.folder;
      } else if(node.kind==="symlink") {
        leading.innerHTML=icons.link;
      } else {
        const fileIcon=getFileIcon(node.name);
        leading.dataset.iconKind=fileIcon.kind;
        leading.dataset.iconCategory=fileIcon.category;
        leading.innerHTML=fileIcon.markup;
      }
    }
    const name=document.createElement("span");
    name.className="node-name";
    name.textContent=node.name;
    element.append(leading,name);

    if(node.change) {
      const badge=document.createElement("span");
      badge.className="badge";
      badge.dataset.change=node.change;
      badge.textContent=({ added: "A",modified: "M",deleted: "D",renamed: "R" } as const)[node.change];
      badge.title=`${node.change[0]?.toUpperCase()}${node.change.slice(1)}`;
      badge.setAttribute("aria-label",badge.title);
      element.append(badge);
    }
    return element;
  }
  onTreeClick(event: MouseEvent): void {
    this.host.closeContextMenu(false);
    if(this.suppressNextClick) {
      this.suppressNextClick=false;
      return;
    }
    const target=event.target as Element|null;
    const element=target?.closest<HTMLElement>(".tree-row");
    if(!element||!this.host.treeWindow.contains(element)) return;
    const index=Number(element.dataset.index);
    if(!Number.isInteger(index)) return;
    const row=this.rows[index];
    if(!row) return;

    // The disclosure triangle only expands or collapses; it never changes selection.
    if(row.kind==="node"&&target?.closest('[data-action="toggle"]')) {
      this.focusIndex(index,false);
      this.toggleDirectory(row);
      return;
    }

    const additive=event.ctrlKey||event.metaKey;
    const range=event.shiftKey;
    if((additive||range)&&row.kind==="node") {
      if(range) this.selectRangeTo(index);
      else this.toggleSelectionAt(index);
      this.focusIndex(index,false);
      return;
    }

    this.focusIndex(index,false);
    if(row.kind==="node") this.setSingleSelection(row.path,index);
    else this.clearSelection(false);

    if(row.kind!=="node") {
      this.activateRow(row);
    } else if(row.node?.kind==="file") {
      this.host.openPreviewTab(row);
    }
  }
  onTreePointerDown(event: PointerEvent): void {
    this.cancelMarquee();
    if(event.button!==0||event.pointerType==="touch") return;
    // Shift extends an existing selection through the click handler, never a marquee.
    if(event.shiftKey) return;
    if(this.host.state!=="ready"||this.host.settings.collapsed) return;
    // Ignore presses on the native scrollbar gutter (past the content width).
    if(event.clientX-this.host.treeShell.getBoundingClientRect().left>this.host.treeShell.clientWidth) return;
    const target=event.target as Element|null;
    const overRow=target?.closest<HTMLElement>(".tree-row");
    // A press that lands on a row belongs to click/drag handling; only empty
    // space in the scroller starts a marquee immediately. A press on a row can
    // still promote to a marquee after the long-press threshold elapses.
    const additive=event.ctrlKey||event.metaKey;
    const originContentY=this.host.treeShell.scrollTop+this.contentOffsetY(event.clientY);
    const marquee: MarqueeState={
      pointerId: event.pointerId,
      originContentY,
      originClientX: event.clientX,
      originClientY: event.clientY,
      baseSelection: new Set(additive? this.selectedPaths:[]),
      additive,
      active: false,
    };
    this.marquee=marquee;
    if(overRow) {
      // Defer: rows are draggable, so a quick press-and-move is a move gesture.
      // Only a stationary long press converts into a marquee.
      this.marqueeLongPressTimer=setTimeout(() => {
        this.marqueeLongPressTimer=undefined;
        if(this.marquee===marquee&&!marquee.active) this.beginMarquee(marquee,event.clientX,event.clientY);
      },MARQUEE_LONG_PRESS_MS);
    } else {
      this.beginMarquee(marquee,event.clientX,event.clientY);
    }
  }
  updateMarquee(clientX: number,clientY: number): void {
    const marquee=this.marquee;
    if(!marquee?.active) return;
    const rect=this.host.treeShell.getBoundingClientRect();
    // Auto-scroll when the pointer is dragged past either vertical edge.
    const edge=18;
    if(clientY<rect.top+edge) this.host.treeShell.scrollTop-=edge;
    else if(clientY>rect.bottom-edge) this.host.treeShell.scrollTop+=edge;

    const pointerContentY=this.host.treeShell.scrollTop+(clientY-rect.top);
    const maxContentY=Math.max(0,this.rows.length*TREE_ROW_HEIGHT);
    const top=Math.max(0,Math.min(marquee.originContentY,pointerContentY));
    const bottom=Math.min(maxContentY,Math.max(marquee.originContentY,pointerContentY));
    this.host.marqueeElement.style.top=`${top}px`;
    this.host.marqueeElement.style.height=`${Math.max(0,bottom-top)}px`;

    const startIndex=Math.max(0,Math.floor(top/TREE_ROW_HEIGHT));
    const endIndex=Math.min(this.rows.length-1,Math.floor((bottom-0.001)/TREE_ROW_HEIGHT));
    const next=new Set<string>(marquee.baseSelection);
    if(bottom>top) {
      for(let index=startIndex;index<=endIndex;index+=1) {
        const row=this.selectableRow(index);
        if(row) next.add(row.path);
      }
    }
    this.selectedPaths.clear();
    for(const path of next) this.selectedPaths.add(path);
    if(endIndex>=startIndex) this.selectionAnchorIndex=startIndex;
    this.renderVisible();
  }
  onTreeKeyDown(event: KeyboardEvent): void {
    if(event.key==="ContextMenu"||(event.shiftKey&&event.key==="F10")) {
      event.preventDefault();
      const row=this.rows[this.focusedIndex];
      const target=row? this.host.contextTargetForRow(row):this.host.rootContextTarget();
      if(!target) {
        this.host.closeContextMenu(false);
        return;
      }
      const active=this.host.shadow.getElementById(`cle-row-${this.focusedIndex}`);
      const rect=(active??this.host.treeShell).getBoundingClientRect();
      this.host.openContextMenu(target,rect.left+Math.min(28,rect.width),rect.bottom||rect.top+TREE_ROW_HEIGHT);
      return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==="f") {
      event.preventDefault();
      this.host.fileFilterInput.focus();
      this.host.fileFilterInput.select();
      return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==="a") {
      event.preventDefault();
      this.selectAll();
      return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==="c") {
      event.preventDefault();
      // Copy selected files to internal clipboard (for paste operation), not OS clipboard.
      if(this.selectedPaths.size>0) {
        this.fileClipboard={ paths: Array.from(this.selectedPaths).sort(),operation: "copy" };
      }
      return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==="x") {
      event.preventDefault();
      // Cut selected files to internal clipboard (will be moved on paste).
      if(this.selectedPaths.size>0) {
        this.fileClipboard={ paths: Array.from(this.selectedPaths).sort(),operation: "cut" };
        this.syncSelectionDom(); // Visual update for cut state
      }
      return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==="v") {
      event.preventDefault();
      // Paste files from internal clipboard to the current focused directory.
      if(this.fileClipboard&&this.fileClipboard.paths.length>0) {
        void this.host.pasteFiles();
      }
      return;
    }
    if(event.key==="Delete") {
      event.preventDefault();
      // Delete selected files.
      if(this.selectedPaths.size>0) {
        void this.host.deleteSelectedFiles();
      }
      return;
    }
    if(!this.rows.length) return;
    const row=this.rows[this.focusedIndex];
    if(!row) return;
    let handled=true;
    switch(event.key) {
      case "ArrowDown":
        this.focusIndex(this.focusedIndex+1);
        this.updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "ArrowUp":
        this.focusIndex(this.focusedIndex-1);
        this.updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "Home":
        this.focusIndex(0);
        this.updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "End":
        this.focusIndex(this.rows.length-1);
        this.updateSelectionAfterKeyNav(event.shiftKey);
        break;
      case "ArrowRight":
        if(row.kind==="node"&&row.node?.kind==="directory") {
          if(this.isFilterExpandable(row)&&!this.isFilterExpanded(row)) this.toggleDirectory(row,true);
          else if(this.isFilterExpanded(row)&&this.rows[this.focusedIndex+1]?.depth===row.depth+1) {
            this.focusIndex(this.focusedIndex+1);
          }
          else if(!this.fileFilterQuery&&!this.model.isExpanded(row.path)) this.toggleDirectory(row,true);
          else if(this.rows[this.focusedIndex+1]?.depth===row.depth+1) this.focusIndex(this.focusedIndex+1);
        }
        break;
      case "ArrowLeft":
        if(this.isFilterExpanded(row)) {
          this.toggleDirectory(row,false);
        } else if(!this.fileFilterQuery&&row.kind==="node"&&row.node?.kind==="directory"&&this.model.isExpanded(row.path)) {
          this.toggleDirectory(row,false);
        } else {
          const parentIndex=this.rows.findIndex((candidate) => candidate.kind==="node"&&candidate.path===row.parentPath);
          if(parentIndex>=0) this.focusIndex(parentIndex);
        }
        break;
      case "Enter":
      case " ":
        this.activateRow(row);
        break;
      case "Escape":
        if(this.selectedPaths.size>1) {
          const focusRow=this.selectableRow(this.focusedIndex);
          if(focusRow) this.setSingleSelection(focusRow.path,this.focusedIndex);
          else this.clearSelection(true);
          this.host.announce("Selection reduced to one item");
        } else if(this.host.activePreviewPath) {
          if(this.host.leaveEditing("Return to the conversation and discard your unsaved changes?")) {
            this.host.activatePreviewPath(null);
            this.host.syncMainPreview();
            this.renderVisible();
            this.host.announce("Conversation shown");
          }
        } else if(this.host.element.dataset.placement==="drawer") this.host.collapse(true);
        else handled=false;
        break;
      default:
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey) this.runTypeahead(event.key);
        else handled=false;
    }
    if(handled) event.preventDefault();
  }
  toggleDirectory(row: FlatTreeRow,force?: boolean): void {
    const node=row.node;
    if(!node||node.kind!=="directory"||node.inaccessible) return;
    if(this.fileFilterQuery) {
      if(!this.isFilterExpandable(row)) return;
      const expanded=force??!this.isFilterExpanded(row);
      if(expanded) this.filterCollapsedPaths.delete(node.relativePath);
      else this.filterCollapsedPaths.add(node.relativePath);
      this.renderTree();
      return;
    }
    const expanded=force??!this.model.isExpanded(node.relativePath);
    this.model.setExpanded(node.relativePath,expanded);
    if(expanded&&!this.model.hasLoaded(node.relativePath)) void this.host.loadDirectory(node.relativePath);
    this.renderTree();
  }
}
