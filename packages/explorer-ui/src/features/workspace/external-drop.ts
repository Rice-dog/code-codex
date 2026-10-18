import { WorkspaceBridge,ExplorerBridgeError } from "../../bridge";
import { type ExplorerContext,type ExplorerViewState,type FlatTreeRow,type TreeNodeInput } from "../../contracts/bridge";
import { type ContextMenuTarget,type DragSource,type ExternalDropCandidate,type ExternalDropRoot,type ExternalImportProgress } from "../../contracts/explorer-model";
import { errorCode,isPathWithin } from "../../core/bridge/response-validation";
import { DROP_EXPAND_DELAY_MS,EXTERNAL_IMPORT_CHUNK_BYTES,EXTERNAL_IMPORT_COMMIT_TIMEOUT_MS,EXTERNAL_IMPORT_REQUEST_INTERVAL_MS,INTERNAL_DRAG_TYPE } from "../../core/configuration/explorer";
import { runtimeEvent } from "../../runtime-events";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import { TreeModel } from "../../tree-model";
import { contextActionError } from "../file-operations/context-menu";
import { captureExternalDropCandidates,ensureDistinctExternalRootNames,externalImportBeginParams,externalImportError,invalidExternalImportResponse,isExternalFileDrag,normalizeExternalDropReadError,normalizeExternalImportBegin,normalizeExternalImportCommit,resolveExternalDropRoots,validateExternalImportChunk,validateExternalImportFlag } from "../file-operations/external-import";
import type { MutationAccess } from "../file-operations/mutation-gate";
import { encodeBase64 } from "../preview/responses";
export interface ExternalDropControllerPorts {
  readonly element: HTMLElement;
  readonly rows: FlatTreeRow[];
  readonly contextTargetForRow: (row: FlatTreeRow) => ContextMenuTarget | undefined;
  readonly treeWindow: HTMLElement;
  readonly mutations: MutationAccess;
  readonly state: ExplorerViewState;
  readonly context: ExplorerContext | undefined;
  readonly bridge: WorkspaceBridge | undefined;
  readonly closeContextMenu: (restoreFocus: boolean) => void;
  readonly hideActionNotice: () => void;
  readonly cancelMarquee: () => void;
  readonly showActionNotice: (message: string, tone?: "success" | "error") => void;
  readonly treeShell: HTMLElement;
  readonly masthead: HTMLElement;
  readonly statePanel: HTMLElement;
  readonly model: Pick<TreeModel,"getLoadError"|"hasLoaded"|"isExpanded"|"setExpanded">;
  readonly toggleDirectory: (row: FlatTreeRow, force?: boolean) => void;
  readonly generation: number;
  readonly showActionProgress: (message: string) => void;
  readonly loadDirectory: (path: string, append?: boolean, waitForExisting?: boolean, expectedGeneration?: number) => Promise<void>;
  readonly focusIndex: (index: number, focus?: boolean) => void;
  readonly connected: boolean;
  readonly dismissed: boolean;
  readonly editingPath: string | null;
  readonly editSaving: boolean;
  readonly isEditDirty: () => boolean;
  readonly confirmDiscardEditing: (message: string) => boolean;
  readonly requestEntryAction: (method: string, params: Record<string, unknown>) => Promise<boolean>;
  readonly clearEditing: (sync?: boolean) => boolean;
  readonly closePreviewTabsWithin: (path: string) => void;
}
export class ExternalDropController {
  constructor(private readonly host: ExternalDropControllerPorts) {}
dragSource: DragSource | undefined;
externalDragActive = false;
dropTargetPath: string | undefined;
dropExpandTimer: ReturnType<typeof setTimeout> | undefined;
onTreeDragStart(event: DragEvent): void {
        const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
        const index = Number(element?.dataset.index);
        const row = this.host.rows[index];
        const target = row ? this.host.contextTargetForRow(row) : undefined;
        if (!element ||
            !this.host.treeWindow.contains(element) ||
            !target ||
            target.kind === "root" ||
            !event.dataTransfer ||
            this.host.mutations.busy ||
            this.host.state !== "ready" ||
            !this.host.context ||
            !this.host.bridge?.available) {
            event.preventDefault();
            return;
        }
        this.host.closeContextMenu(false);
        this.host.hideActionNotice();
        this.host.cancelMarquee();
        this.clearDragState();
        this.dragSource = {
            path: target.path,
            parentPath: target.parentPath,
            name: target.name,
            kind: target.kind,
        };
        element.dataset.dragSource = "true";
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(INTERNAL_DRAG_TYPE, target.path);
        event.dataTransfer.setData("text/plain", target.path);
    }
onDropZoneDragOver(event: DragEvent, allowRoot: boolean): void {
        const source = this.dragSource;
        if (source) {
            const destination = this.dropDestination(event, allowRoot);
            if (destination === undefined || !this.canDrop(source, destination)) {
                this.setDropTarget(undefined);
                return;
            }
            event.preventDefault();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = "move";
            this.setDropTarget(destination);
            return;
        }
        if (!isExternalFileDrag(event.dataTransfer))
            return;
        event.preventDefault();
        event.stopPropagation();
        this.externalDragActive = true;
        const destination = this.dropDestination(event, allowRoot);
        if (destination === undefined || !this.canAcceptExternalDrop()) {
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = "none";
            this.setDropTarget(undefined);
            return;
        }
        if (event.dataTransfer)
            event.dataTransfer.dropEffect = "copy";
        this.setDropTarget(destination);
    }
onDropZoneDragLeave(event: DragEvent): void {
        if (isExternalFileDrag(event.dataTransfer))
            event.stopPropagation();
        const zone = event.currentTarget as HTMLElement | null;
        const related = event.relatedTarget as Node | null;
        if (zone && related && zone.contains(related))
            return;
        this.setDropTarget(undefined);
    }
onDropZoneDrop(event: DragEvent, allowRoot: boolean): void {
        const source = this.dragSource;
        if (source) {
            const destination = this.dropDestination(event, allowRoot);
            if (destination === undefined || !this.canDrop(source, destination)) {
                this.clearDragState();
                return;
            }
            event.preventDefault();
            this.clearDragState();
            void this.moveEntryByDrop(source, destination);
            return;
        }
        if (!isExternalFileDrag(event.dataTransfer)) {
            this.clearDragState();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const destination = this.dropDestination(event, allowRoot);
        const candidates = captureExternalDropCandidates(event.dataTransfer);
        const canImport = destination !== undefined && this.canAcceptExternalDrop();
        this.clearDragState();
        if (!canImport || destination === undefined) {
            this.host.showActionNotice("Drop files or folders onto a folder or an empty area of the file tree.", "error");
            return;
        }
        if (!candidates.length) {
            this.host.showActionNotice("Windows did not provide any readable files or folders for this drop.", "error");
            return;
        }
        void this.importExternalDrop(candidates, destination);
    }
onUnhandledExternalDragOver(event: DragEvent): void {
        if (!isExternalFileDrag(event.dataTransfer))
            return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer)
            event.dataTransfer.dropEffect = "none";
        this.setDropTarget(undefined);
    }
onUnhandledExternalDrop(event: DragEvent): void {
        if (!isExternalFileDrag(event.dataTransfer))
            return;
        event.preventDefault();
        event.stopPropagation();
        this.clearDragState();
        this.host.showActionNotice("Drop files or folders onto a folder or an empty area of the file tree.", "error");
    }
dropDestination(event: DragEvent, allowRoot: boolean): string | undefined {
        const element = (event.target as Element | null)?.closest<HTMLElement>(".tree-row");
        if (element && this.host.treeWindow.contains(element)) {
            const index = Number(element.dataset.index);
            const row = Number.isInteger(index) ? this.host.rows[index] : undefined;
            const target = row ? this.host.contextTargetForRow(row) : undefined;
            return target?.kind === "directory" ? target.path : undefined;
        }
        return allowRoot ? "" : undefined;
    }
canDrop(source: DragSource, destinationParentPath: string): boolean {
        if (this.host.mutations.busy ||
            this.host.state !== "ready" ||
            !this.host.context ||
            !this.host.bridge?.available ||
            source.parentPath === destinationParentPath) {
            return false;
        }
        return source.kind !== "directory" || !isPathWithin(source.path, destinationParentPath);
    }
canAcceptExternalDrop(): boolean {
        return !this.host.mutations.busy &&
            (this.host.state === "ready" || this.host.state === "empty") &&
            Boolean(this.host.context) &&
            this.host.bridge?.available === true;
    }
setDropTarget(path: string | undefined): void {
        if (this.dropTargetPath === path)
            return;
        if (this.dropExpandTimer)
            clearTimeout(this.dropExpandTimer);
        this.dropExpandTimer = undefined;
        this.dropTargetPath = path;
        this.host.treeShell.dataset.dropTarget = String(path === "");
        this.host.masthead.dataset.dropTarget = String(path === "");
        this.host.statePanel.dataset.dropTarget = String(path === "");
        for (const row of this.host.treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
            row.dataset.dropTarget = String(path !== undefined && path !== "" && row.dataset.path === path);
        }
        if (!path)
            return;
        if (!this.canExpandDropTarget(path) || this.host.model.isExpanded(path))
            return;
        this.dropExpandTimer = setTimeout(() => {
            this.dropExpandTimer = undefined;
            if (this.dropTargetPath !== path || !this.canExpandDropTarget(path))
                return;
            const row = this.host.rows.find((candidate) => candidate.kind === "node" && candidate.path === path);
            if (row?.node?.kind === "directory")
                this.host.toggleDirectory(row, true);
        }, DROP_EXPAND_DELAY_MS);
    }
canExpandDropTarget(path: string): boolean {
        const source = this.dragSource;
        if (source)
            return this.canDrop(source, path);
        return this.externalDragActive && this.canAcceptExternalDrop();
    }
clearDragState(): void {
        if (this.dropExpandTimer)
            clearTimeout(this.dropExpandTimer);
        this.dropExpandTimer = undefined;
        this.dragSource = undefined;
        this.externalDragActive = false;
        this.setDropTarget(undefined);
        for (const row of this.host.treeWindow.querySelectorAll<HTMLElement>(".tree-row")) {
            row.dataset.dragSource = "false";
        }
    }
async importExternalDrop(candidates: readonly ExternalDropCandidate[], destinationParentPath: string): Promise<void> {
        if (this.host.mutations.busy)
            return;
        const bridge = this.host.bridge;
        const context = this.host.context;
        if (!bridge?.available || !context || (this.host.state !== "ready" && this.host.state !== "empty"))
            return;
        const generation = this.host.generation;
        let committedCount = 0;
        let commitAttempted = false;
        const mutation=this.host.mutations.acquire(); if(!mutation)return;
        this.host.closeContextMenu(false);
        this.host.cancelMarquee();
        this.host.element.dataset.busy = "true";
        this.host.treeShell.setAttribute("aria-busy", "true");
        this.host.statePanel.setAttribute("aria-busy", "true");
        this.host.showActionProgress("Preparing dropped files and folders…");
        let nextRequestAt = 0;
        const request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
            this.assertExternalImportCurrent(bridge, context, generation);
            const delay = Math.max(0, nextRequestAt - performance.now());
            if (delay > 0)
                await new Promise<void>((resolve) => setTimeout(resolve, delay));
            this.assertExternalImportCurrent(bridge, context, generation);
            nextRequestAt = performance.now() + EXTERNAL_IMPORT_REQUEST_INTERVAL_MS;
            if (method === "explorer.entry.import.commit")
                commitAttempted = true;
            return bridge.request<unknown>(method, params, method === "explorer.entry.import.commit" ? EXTERNAL_IMPORT_COMMIT_TIMEOUT_MS : undefined);
        };
        try {
            const roots = await resolveExternalDropRoots(candidates, () => {
                this.assertExternalImportCurrent(bridge, context, generation);
            });
            this.assertExternalImportCurrent(bridge, context, generation);
            ensureDistinctExternalRootNames(roots);
            this.host.showActionProgress("Checking the destination folder…");
            await this.preflightExternalRoots(roots, destinationParentPath, request);
            const progress: ExternalImportProgress = {
                totalEntries: roots.reduce((total, root) => total + root.entryCount, 0),
                totalBytes: roots.reduce((total, root) => total + root.sizeBytes, 0),
                completedEntries: 0,
                completedBytes: 0,
                lastNoticeAt: 0,
            };
            this.updateExternalImportProgress(progress, roots[0]?.name ?? "dropped items", true);
            const imported: TreeNodeInput[] = [];
            for (const root of roots) {
                commitAttempted = false;
                const entry = await this.importExternalRoot(root, destinationParentPath, request, bridge, progress);
                imported.push(entry);
                committedCount += 1;
            }
            this.assertExternalImportCurrent(bridge, context, generation);
            if (destinationParentPath)
                this.host.model.setExpanded(destinationParentPath, true);
            await this.host.loadDirectory(destinationParentPath, false, true);
            this.assertExternalImportCurrent(bridge, context, generation);
            const firstPath = imported[0]?.relativePath;
            if (firstPath) {
                const importedIndex = this.host.rows.findIndex((row) => row.kind === "node" && row.path === firstPath);
                if (importedIndex >= 0)
                    this.host.focusIndex(importedIndex, false);
            }
            this.host.showActionNotice(`${imported.length.toLocaleString()} dropped ${imported.length === 1 ? "item" : "items"} copied.`);
        }
        catch (error) {
            recordCaughtRuntimeError("#importExternalDrop", error);
            if (this.canApplyExternalImportResult(bridge, context, generation)) {
                // A lost commit response does not prove the atomic rename failed. Never
                // replay the write: re-read only, scoped to the original workspace.
                const uncertain = commitAttempted && ["TIMEOUT", "NO_BRIDGE", "INVALID_REQUEST", "INVALID_RESPONSE"].includes(errorCode(error));
                let refreshed = false;
                if (committedCount > 0 || commitAttempted) {
                    runtimeEvent("file-tree", "import reconciliation", "started", { committedCount, uncertain });
                    await this.host.loadDirectory(destinationParentPath, false, true, generation);
                    if (!this.canApplyExternalImportResult(bridge, context, generation))
                        return;
                    refreshed = this.host.model.hasLoaded(destinationParentPath) && !this.host.model.getLoadError(destinationParentPath);
                    runtimeEvent("file-tree", "import reconciliation", refreshed ? "passed" : "failed", { committedCount, uncertain });
                }
                this.host.showActionNotice(uncertain
                    ? refreshed
                        ? "The copy result could not be confirmed. Check the refreshed destination folder before retrying; the copy was not repeated."
                        : "The copy result could not be confirmed and the destination could not be refreshed. Refresh the folder before retrying; the copy was not repeated."
                    : externalImportError(error, committedCount), "error");
            }
        }
        finally {
            mutation.release();
            const currentState = this.host.state as ExplorerViewState;
            const stateBusy = currentState === "loading" || currentState === "booting";
            this.host.element.dataset.busy = String(stateBusy);
            this.host.treeShell.setAttribute("aria-busy", String(stateBusy));
            this.host.statePanel.setAttribute("aria-busy", String(stateBusy));
        }
    }
async preflightExternalRoots(roots: readonly ExternalDropRoot[], destinationParentPath: string, request: (method: string, params: Record<string, unknown>) => Promise<unknown>): Promise<void> {
        for (const root of roots) {
            let sessionId: string | undefined;
            try {
                sessionId = normalizeExternalImportBegin(await request("explorer.entry.import.begin", externalImportBeginParams(root, destinationParentPath))).sessionId;
            }
            finally {
                if (sessionId) {
                    validateExternalImportFlag(await request("explorer.entry.import.abort", { sessionId }), "aborted");
                }
            }
        }
    }
async importExternalRoot(root: ExternalDropRoot, destinationParentPath: string, request: (method: string, params: Record<string, unknown>) => Promise<unknown>, bridge: WorkspaceBridge, progress: ExternalImportProgress): Promise<TreeNodeInput> {
        const begin = normalizeExternalImportBegin(await request("explorer.entry.import.begin", externalImportBeginParams(root, destinationParentPath)));
        const sessionId = begin.sessionId;
        let committed = false;
        try {
            if (root.kind === "file") {
                const file = root.file;
                if (!file)
                    throw invalidExternalImportResponse("The dropped file was unavailable.");
                await this.uploadExternalFile(sessionId, file, request, progress, root.name);
                validateExternalImportFlag(await request("explorer.entry.import.file.finish", { sessionId }), "finished");
                progress.completedEntries += 1;
                this.updateExternalImportProgress(progress, root.name, true);
            }
            else {
                progress.completedEntries += 1;
                this.updateExternalImportProgress(progress, root.name, true);
                for (const member of root.members) {
                    if (member.kind === "directory") {
                        validateExternalImportFlag(await request("explorer.entry.import.directory", {
                            sessionId,
                            relativePath: member.relativePath,
                        }), "created");
                        progress.completedEntries += 1;
                        this.updateExternalImportProgress(progress, member.relativePath, true);
                        continue;
                    }
                    const file = member.file;
                    if (!file)
                        throw invalidExternalImportResponse("A dropped file was unavailable.");
                    validateExternalImportFlag(await request("explorer.entry.import.file.begin", {
                        sessionId,
                        relativePath: member.relativePath,
                        sizeBytes: file.size,
                    }), "ready");
                    await this.uploadExternalFile(sessionId, file, request, progress, member.relativePath);
                    validateExternalImportFlag(await request("explorer.entry.import.file.finish", { sessionId }), "finished");
                    progress.completedEntries += 1;
                    this.updateExternalImportProgress(progress, member.relativePath, true);
                }
            }
            const rawCommit = await request("explorer.entry.import.commit", { sessionId });
            committed = true;
            return normalizeExternalImportCommit(rawCommit, destinationParentPath, root);
        }
        finally {
            if (!committed) {
                await bridge.request("explorer.entry.import.abort", { sessionId }).catch(() => undefined);
            }
        }
    }
async uploadExternalFile(sessionId: string, file: File, request: (method: string, params: Record<string, unknown>) => Promise<unknown>, progress: ExternalImportProgress, displayPath: string): Promise<void> {
        let offset = 0;
        while (offset < file.size) {
            const expectedLength = Math.min(EXTERNAL_IMPORT_CHUNK_BYTES, file.size - offset);
            let bytes: Uint8Array;
            try {
                bytes = new Uint8Array(await file.slice(offset, offset + expectedLength).arrayBuffer());
            }
            catch (error) {
                recordCaughtRuntimeError("#uploadExternalFile", error);
                throw normalizeExternalDropReadError(error);
            }
            if (bytes.byteLength !== expectedLength) {
                throw new ExplorerBridgeError({ code: "NOT_FOUND", message: "A dropped file changed while it was being copied." });
            }
            const nextOffset = offset + bytes.byteLength;
            validateExternalImportChunk(await request("explorer.entry.import.chunk", {
                sessionId,
                offset,
                dataBase64: encodeBase64(bytes),
            }), nextOffset);
            offset = nextOffset;
            progress.completedBytes += bytes.byteLength;
            this.updateExternalImportProgress(progress, displayPath, offset === file.size);
        }
    }
updateExternalImportProgress(progress: ExternalImportProgress, displayPath: string, force: boolean): void {
        const now = performance.now();
        if (!force && now - progress.lastNoticeAt < 250)
            return;
        progress.lastNoticeAt = now;
        const byteRatio = progress.totalBytes > 0 ? progress.completedBytes / progress.totalBytes : 0;
        const entryRatio = progress.totalEntries > 0 ? progress.completedEntries / progress.totalEntries : 0;
        const percent = Math.min(100, Math.max(0, Math.floor(Math.max(byteRatio, entryRatio) * 100)));
        const leaf = displayPath.split("/").at(-1) || displayPath;
        this.host.showActionProgress(`Copying dropped items… ${percent}% · ${progress.completedEntries.toLocaleString()}/${progress.totalEntries.toLocaleString()} · ${leaf}`);
    }
assertExternalImportCurrent(bridge: WorkspaceBridge, context: ExplorerContext, generation: number): void {
        if (!this.canApplyExternalImportResult(bridge, context, generation)) {
            throw new ExplorerBridgeError({ code: "CANCELLED", message: "The active workspace changed during the import." });
        }
    }
canApplyExternalImportResult(bridge: WorkspaceBridge, context: ExplorerContext, generation: number): boolean {
        return this.host.connected &&
            !this.host.dismissed &&
            this.host.generation === generation &&
            this.host.bridge === bridge &&
            this.host.context === context &&
            bridge.available;
    }
async moveEntryByDrop(source: DragSource, destinationParentPath: string): Promise<void> {
        if (this.host.mutations.busy)
            return;
        const affectsEditing = Boolean(this.host.editingPath && isPathWithin(source.path, this.host.editingPath));
        if (affectsEditing && this.host.editSaving) {
            this.host.showActionNotice("Wait for the current save to finish before moving this item.", "error");
            return;
        }
        if (affectsEditing &&
            this.host.isEditDirty() &&
            !this.host.confirmDiscardEditing(`Move ${source.name} and discard your unsaved changes?`)) {
            this.host.showActionNotice("Move cancelled; your unsaved changes were kept.", "error");
            return;
        }
        const mutation=this.host.mutations.acquire(); if(!mutation)return;
        try {
            const current = await this.host.requestEntryAction("explorer.entry.move", {
                relativePath: source.path,
                destinationParentRelativePath: destinationParentPath,
            });
            if (!current)
                return;
            if (affectsEditing)
                this.host.clearEditing(false);
            this.host.closePreviewTabsWithin(source.path);
            if (destinationParentPath)
                this.host.model.setExpanded(destinationParentPath, true);
            const refreshPaths = [...new Set([source.parentPath, destinationParentPath])];
            for (const path of refreshPaths) {
                const shouldLoad = path === destinationParentPath || this.host.model.hasLoaded(path);
                if (!shouldLoad)
                    continue;
                try {
                    await this.host.loadDirectory(path, false, true);
                }
                catch (__codeCodexCaught) {
                    recordCaughtRuntimeError("#moveEntryByDrop", __codeCodexCaught);
                }
            }
            const movedPath = destinationParentPath ? `${destinationParentPath}/${source.name}` : source.name;
            const movedIndex = this.host.rows.findIndex((row) => row.kind === "node" && row.path === movedPath);
            if (movedIndex >= 0)
                this.host.focusIndex(movedIndex, false);
        }
        catch (error) {
            recordCaughtRuntimeError("#moveEntryByDrop", error);
            this.host.showActionNotice(contextActionError("move", error), "error");
        }
        finally {
            mutation.release();
        }
    }
}
