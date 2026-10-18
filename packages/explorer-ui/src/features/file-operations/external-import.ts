// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { ExplorerBridgeError } from "../../bridge";
import { EXTERNAL_IMPORT_CHUNK_BYTES,INTERNAL_DRAG_TYPE,MAX_EXTERNAL_IMPORT_DEPTH,MAX_EXTERNAL_IMPORT_ENTRIES,MAX_EXTERNAL_IMPORT_FILE_BYTES,MAX_EXTERNAL_IMPORT_TOTAL_BYTES } from "../../core/configuration/explorer";
import { type ExternalDataTransferItem,type ExternalDirectoryHandle,type ExternalDropBudget,type ExternalDropCandidate,type ExternalDropMember,type ExternalDropRoot } from "../../contracts/explorer-model";
import { asRecord,errorCode,normalizeNode } from "../../core/bridge/response-validation";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import { type TreeNodeInput } from "../../contracts/bridge";
import { entryNameValidationError } from "./context-menu";


export function isExternalFileDrag(dataTransfer: DataTransfer|null): boolean {
  if(!dataTransfer) return false;
  const types=Array.from(dataTransfer.types);
  if(types.includes(INTERNAL_DRAG_TYPE)) return false;
  return types.includes("Files")||Array.from(dataTransfer.items).some((item) => item.kind==="file");
}


export function captureExternalDropCandidates(dataTransfer: DataTransfer|null): readonly ExternalDropCandidate[] {
  if(!dataTransfer) return [];
  const candidates: ExternalDropCandidate[]=[];
  for(const rawItem of Array.from(dataTransfer.items)) {
    if(rawItem.kind!=="file") continue;
    const item=rawItem as ExternalDataTransferItem;
    let handlePromise: Promise<FileSystemHandle|null>|undefined;
    try {
      if(typeof item.getAsFileSystemHandle==="function") {
        handlePromise=item.getAsFileSystemHandle.call(item);
      }
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("captureExternalDropCandidates",__codeCodexCaught);

      handlePromise=undefined;
    }

    let entry: FileSystemEntry|undefined;
    try {
      entry=item.webkitGetAsEntry?.()??item.getAsEntry?.()??undefined;
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("captureExternalDropCandidates",__codeCodexCaught);

      entry=undefined;
    }

    let file: File|undefined;
    try {
      file=item.getAsFile()??undefined;
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("captureExternalDropCandidates",__codeCodexCaught);

      file=undefined;
    }
    if(handlePromise||entry||file) {
      candidates.push({
        ...(handlePromise? { handlePromise }:{}),
        ...(entry? { entry }:{}),
        ...(file? { file }:{}),
      });
    }
  }

  if(candidates.length) return candidates;
  return Array.from(dataTransfer.files,(file) => ({ file }));
}


export async function resolveExternalDropRoots(
  candidates: readonly ExternalDropCandidate[],
  assertCurrent: () => void,
): Promise<readonly ExternalDropRoot[]> {
  const roots: ExternalDropRoot[]=[];
  const budget: ExternalDropBudget={ entries: 0,sizeBytes: 0 };
  try {
    for(const candidate of candidates) {
      assertCurrent();
      const handle=candidate.handlePromise? await candidate.handlePromise.catch(() => null):null;
      assertCurrent();
      if(handle&&(handle.kind!=="directory"||typeof (handle as ExternalDirectoryHandle).entries==="function")) {
        roots.push(await externalDropRootFromHandle(handle,budget,assertCurrent));
        continue;
      }
      if(candidate.entry) {
        roots.push(await externalDropRootFromEntry(candidate.entry,budget,assertCurrent));
        continue;
      }
      if(candidate.file) {
        chargeExternalDropFile(candidate.file.name,candidate.file.size,1,budget);
        roots.push({
          name: candidate.file.name,
          kind: "file",
          file: candidate.file,
          members: [],
          entryCount: 1,
          sizeBytes: candidate.file.size,
        });
      }
    }
  } catch(error) {
    recordCaughtRuntimeError("resolveExternalDropRoots",error);

    throw normalizeExternalDropReadError(error);
  }
  if(!roots.length) {
    throw new ExplorerBridgeError({ code: "NOT_FOUND",message: "No readable files or folders were dropped." });
  }
  return roots;
}


export async function externalDropRootFromHandle(
  handle: FileSystemHandle,
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<ExternalDropRoot> {
  const startEntries=budget.entries;
  const startBytes=budget.sizeBytes;
  if(handle.kind==="file") {
    const file=await (handle as FileSystemFileHandle).getFile();
    assertCurrent();
    chargeExternalDropFile(handle.name,file.size,1,budget);
    return { name: handle.name,kind: "file",file,members: [],entryCount: 1,sizeBytes: file.size };
  }

  chargeExternalDropEntry(handle.name,1,budget);
  const members: ExternalDropMember[]=[];
  await appendExternalHandleMembers(
    handle as ExternalDirectoryHandle,
    "",
    1,
    members,
    budget,
    assertCurrent,
  );
  return {
    name: handle.name,
    kind: "directory",
    members,
    entryCount: budget.entries-startEntries,
    sizeBytes: budget.sizeBytes-startBytes,
  };
}


export async function appendExternalHandleMembers(
  directory: ExternalDirectoryHandle,
  parentRelativePath: string,
  parentDepth: number,
  members: ExternalDropMember[],
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<void> {
  for await(const [listedName,child] of directory.entries()) {
    assertCurrent();
    const name=child.name||listedName;
    const depth=parentDepth+1;
    const relativePath=joinExternalDropPath(parentRelativePath,name);
    if(child.kind==="directory") {
      chargeExternalDropEntry(name,depth,budget);
      members.push({ relativePath,kind: "directory" });
      const childDirectory=child as ExternalDirectoryHandle;
      if(typeof childDirectory.entries!=="function") {
        throw new ExplorerBridgeError({ code: "ACCESS_DENIED",message: "A dropped folder could not be read." });
      }
      await appendExternalHandleMembers(childDirectory,relativePath,depth,members,budget,assertCurrent);
      continue;
    }
    if(child.kind!=="file") {
      throw new ExplorerBridgeError({ code: "INVALID_PATH",message: "The drop contained an unsupported entry." });
    }
    const file=await (child as FileSystemFileHandle).getFile();
    assertCurrent();
    chargeExternalDropFile(name,file.size,depth,budget);
    members.push({ relativePath,kind: "file",file });
  }
}


export async function externalDropRootFromEntry(
  entry: FileSystemEntry,
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<ExternalDropRoot> {
  const startEntries=budget.entries;
  const startBytes=budget.sizeBytes;
  if(entry.isFile) {
    const file=await readExternalFileEntry(entry as FileSystemFileEntry);
    assertCurrent();
    chargeExternalDropFile(entry.name,file.size,1,budget);
    return { name: entry.name,kind: "file",file,members: [],entryCount: 1,sizeBytes: file.size };
  }
  if(!entry.isDirectory) {
    throw new ExplorerBridgeError({ code: "INVALID_PATH",message: "The drop contained an unsupported entry." });
  }

  chargeExternalDropEntry(entry.name,1,budget);
  const members: ExternalDropMember[]=[];
  await appendExternalEntryMembers(
    entry as FileSystemDirectoryEntry,
    "",
    1,
    members,
    budget,
    assertCurrent,
  );
  return {
    name: entry.name,
    kind: "directory",
    members,
    entryCount: budget.entries-startEntries,
    sizeBytes: budget.sizeBytes-startBytes,
  };
}


export async function appendExternalEntryMembers(
  directory: FileSystemDirectoryEntry,
  parentRelativePath: string,
  parentDepth: number,
  members: ExternalDropMember[],
  budget: ExternalDropBudget,
  assertCurrent: () => void,
): Promise<void> {
  const reader=directory.createReader();
  while(true) {
    const entries=await readExternalDirectoryBatch(reader);
    assertCurrent();
    if(!entries.length) return;
    for(const child of entries) {
      assertCurrent();
      const depth=parentDepth+1;
      const relativePath=joinExternalDropPath(parentRelativePath,child.name);
      if(child.isDirectory) {
        chargeExternalDropEntry(child.name,depth,budget);
        members.push({ relativePath,kind: "directory" });
        await appendExternalEntryMembers(
          child as FileSystemDirectoryEntry,
          relativePath,
          depth,
          members,
          budget,
          assertCurrent,
        );
        continue;
      }
      if(!child.isFile) {
        throw new ExplorerBridgeError({ code: "INVALID_PATH",message: "The drop contained an unsupported entry." });
      }
      const file=await readExternalFileEntry(child as FileSystemFileEntry);
      assertCurrent();
      chargeExternalDropFile(child.name,file.size,depth,budget);
      members.push({ relativePath,kind: "file",file });
    }
  }
}


export function readExternalDirectoryBatch(reader: FileSystemDirectoryReader): Promise<readonly FileSystemEntry[]> {
  return new Promise((resolve,reject) => reader.readEntries(resolve,reject));
}


export function readExternalFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve,reject) => entry.file(resolve,reject));
}


export function chargeExternalDropEntry(name: string,depth: number,budget: ExternalDropBudget): void {
  if(entryNameValidationError(name)) {
    throw new ExplorerBridgeError({ code: "INVALID_PATH",message: "A dropped item has a name Windows cannot copy." });
  }
  if(depth>MAX_EXTERNAL_IMPORT_DEPTH||budget.entries>=MAX_EXTERNAL_IMPORT_ENTRIES) {
    throw new ExplorerBridgeError({ code: "TOO_MANY_ENTRIES",message: "The dropped folder exceeds the import limits." });
  }
  budget.entries+=1;
}


export function chargeExternalDropFile(name: string,sizeBytes: number,depth: number,budget: ExternalDropBudget): void {
  chargeExternalDropEntry(name,depth,budget);
  if(!Number.isSafeInteger(sizeBytes)||sizeBytes<0||sizeBytes>MAX_EXTERNAL_IMPORT_FILE_BYTES) {
    throw new ExplorerBridgeError({ code: "CONTENT_TOO_LARGE",message: "A dropped file exceeds the import limit." });
  }
  if(budget.sizeBytes+sizeBytes>MAX_EXTERNAL_IMPORT_TOTAL_BYTES) {
    throw new ExplorerBridgeError({ code: "CONTENT_TOO_LARGE",message: "The dropped items exceed the import limit." });
  }
  budget.sizeBytes+=sizeBytes;
}


export function joinExternalDropPath(parent: string,name: string): string {
  return parent? `${parent}/${name}`:name;
}


export function ensureDistinctExternalRootNames(roots: readonly ExternalDropRoot[]): void {
  const names=new Set<string>();
  for(const root of roots) {
    const folded=root.name.normalize("NFC").toLocaleLowerCase();
    if(names.has(folded)) {
      throw new ExplorerBridgeError({ code: "CONFLICT",message: "Two dropped items have the same name." });
    }
    names.add(folded);
  }
}


export function normalizeExternalDropReadError(error: unknown): ExplorerBridgeError {
  if(error instanceof ExplorerBridgeError) return error;
  const name=error instanceof DOMException? error.name:"";
  const code=name==="NotAllowedError"||name==="SecurityError"? "ACCESS_DENIED":"NOT_FOUND";
  return new ExplorerBridgeError({ code,message: "Windows could not read one of the dropped items." });
}


export function invalidExternalImportResponse(message="The file import response was not valid."): ExplorerBridgeError {
  return new ExplorerBridgeError({ code: "INVALID_REQUEST",message });
}


export function externalImportBeginParams(
  root: ExternalDropRoot,
  destinationParentPath: string,
): Record<string,unknown> {
  const params: Record<string,unknown>={
    destinationParentRelativePath: destinationParentPath,
    name: root.name,
    kind: root.kind,
  };
  if(root.kind==="file") params.sizeBytes=root.file?.size??0;
  return params;
}


export function normalizeExternalImportBegin(raw: unknown): { readonly sessionId: string } {
  const object=asRecord(raw);
  if(
    !object||
    typeof object.sessionId!=="string"||
    !object.sessionId||
    object.sessionId.length>128||
    object.chunkSize!==EXTERNAL_IMPORT_CHUNK_BYTES
  ) {
    throw invalidExternalImportResponse();
  }
  return { sessionId: object.sessionId };
}


export function validateExternalImportFlag(raw: unknown,field: "created"|"ready"|"finished"|"aborted"): void {
  const object=asRecord(raw);
  if(!object||object[field]!==true) throw invalidExternalImportResponse();
}


export function validateExternalImportChunk(raw: unknown,expectedNextOffset: number): void {
  const object=asRecord(raw);
  if(!object||object.nextOffset!==expectedNextOffset) throw invalidExternalImportResponse();
}


export function normalizeExternalImportCommit(
  raw: unknown,
  destinationParentPath: string,
  root: ExternalDropRoot,
): TreeNodeInput {
  const object=asRecord(raw);
  const entry=normalizeNode(object?.entry);
  const expectedPath=destinationParentPath? `${destinationParentPath}/${root.name}`:root.name;
  if(!entry||entry.kind!==root.kind||entry.name!==root.name||entry.relativePath!==expectedPath||entry.inaccessible) {
    throw invalidExternalImportResponse();
  }
  return entry;
}


export function externalImportError(error: unknown,committedCount: number): string {
  const prefix=committedCount>0
    ? `${committedCount.toLocaleString()} ${committedCount===1? "item was":"items were"} copied, but `
    :"";
  const code=errorCode(error);
  if(code==="CONFLICT"||code==="ALREADY_EXISTS") return `${prefix}an item with that name already exists in this folder.`;
  if(code==="TOO_MANY_ENTRIES") return `${prefix}the dropped folders contain more than 1,024 items or are nested too deeply.`;
  if(code==="CONTENT_TOO_LARGE"||code==="PAYLOAD_TOO_LARGE"||code==="TOO_LARGE") {
    return `${prefix}the dropped files exceed the 512 MB per-file or 1 GB total limit.`;
  }
  if(code==="INVALID_PATH"||code==="INVALID_NAME"||code==="INVALID_REQUEST") {
    return `${prefix}one of the dropped items has a name or path that cannot be copied.`;
  }
  if(code==="ACCESS_DENIED") return `${prefix}Windows denied access to one of the dropped items.`;
  if(code==="NOT_FOUND") return `${prefix}one of the dropped items changed or became unavailable.`;
  if(code==="CANCELLED") return `${prefix}the copy was cancelled because the active workspace changed.`;
  if(code==="TIMEOUT") return `${prefix}copying the dropped items timed out.`;
  if(code==="NO_BRIDGE") return `${prefix}Code-Codex disconnected before the copy finished.`;
  return `${prefix}the dropped items could not be copied.`;
}
