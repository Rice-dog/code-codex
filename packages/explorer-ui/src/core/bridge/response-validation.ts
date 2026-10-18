// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { BridgeUnavailableError,ExplorerBridgeError } from "../../bridge";
import { MAX_MODEL_RESOURCE_BYTES, MAX_MODEL_TEXTURE_BYTES } from "../preview/configuration";
import { type ExplorerChange,type ExplorerContext,type ExplorerSettings,type ListResult,type TreeNodeInput } from "../../contracts/bridge";
import { DEFAULT_SETTINGS,MAX_MEDIA_CHUNK_BYTES,MODEL_RESOURCE_MIME_TYPES } from "../configuration/explorer";
import { type NormalizedModelResourceInfo } from "../../contracts/explorer-model";


export function asRecord(value: unknown): Record<string,unknown>|null {
  return value&&typeof value==="object"&&!Array.isArray(value)? (value as Record<string,unknown>):null;
}


export function isTransientBootstrapError(error: unknown): boolean {
  return error instanceof ExplorerBridgeError&&(error.code==="TIMEOUT"||error.code==="CANCELLED");
}


export function normalizeContext(raw: unknown,requestedThreadId: string): ExplorerContext {
  const object=asRecord(raw);
  if(!object) throw new ExplorerBridgeError({ code: "NO_CONTEXT",message: "No local workspace is bound to this task." });
  const threadId=typeof object.threadId==="string"? object.threadId:requestedThreadId;
  if(threadId!==requestedThreadId) throw new ExplorerBridgeError({ code: "NO_CONTEXT",message: "The active task changed while resolving its workspace." });
  const projectName=typeof object.projectName==="string"&&object.projectName? object.projectName:"Local project";
  const rootName=typeof object.rootName==="string"&&object.rootName? object.rootName:projectName;
  const rootPath=typeof object.rootPath==="string"? object.rootPath:"";
  const context: ExplorerContext={ threadId,projectName,rootName,rootPath,compatible: object.compatible!==false };
  if(typeof object.reason==="string") context.reason=object.reason;
  return context;
}


export function normalizeList(raw: unknown): ListResult {
  const object=asRecord(raw);
  const source=Array.isArray(raw)? raw:Array.isArray(object?.entries)? object.entries:Array.isArray(object?.nodes)? object.nodes:null;
  if(!source) throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The directory response was not valid." });
  const entries=source.map(normalizeNode).filter((node): node is TreeNodeInput => Boolean(node));
  const result: ListResult={ entries };
  if(typeof object?.nextCursor==="string"&&object.nextCursor) result.nextCursor=object.nextCursor;
  return result;
}


export function normalizeModelResourceInfo(raw: unknown): NormalizedModelResourceInfo {
  const object=asRecord(raw);
  const resourceLimit=typeof object?.mimeType==="string"&&object.mimeType.startsWith("image/")
    ? MAX_MODEL_TEXTURE_BYTES
    :MAX_MODEL_RESOURCE_BYTES;
  if(
    !object||
    typeof object.mimeType!=="string"||
    !MODEL_RESOURCE_MIME_TYPES.has(object.mimeType)||
    !Number.isSafeInteger(object.sizeBytes)||
    (object.sizeBytes as number)<=0||
    (object.sizeBytes as number)>resourceLimit||
    !Number.isSafeInteger(object.chunkSize)||
    (object.chunkSize as number)<=0||
    (object.chunkSize as number)>MAX_MEDIA_CHUNK_BYTES||
    !Number.isSafeInteger(object.chunkCount)||
    (object.chunkCount as number)<=0||
    typeof object.version!=="string"||
    !/^[0-9a-f]{64}$/.test(object.version)
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The model resource metadata was not valid." });
  }
  const sizeBytes=object.sizeBytes as number;
  const chunkSize=object.chunkSize as number;
  const chunkCount=object.chunkCount as number;
  if(chunkCount!==Math.ceil(sizeBytes/chunkSize)) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The model resource chunk count was not valid." });
  }
  return { mimeType: object.mimeType,sizeBytes,chunkSize,chunkCount,version: object.version };
}


export function normalizeHeaderLabel(value: string): string {
  const normalized=value.trim().replace(/[\\/]+$/,"");
  return (normalized.split(/[\\/]/).at(-1)??normalized).replace(/\s+/g," ").toLocaleLowerCase();
}


export function normalizeNode(raw: unknown): TreeNodeInput|null {
  const object=asRecord(raw);
  if(!object||typeof object.name!=="string") return null;
  const relativePath=typeof object.relativePath==="string"? object.relativePath:typeof object.path==="string"? object.path:null;
  const kind=object.kind;
  if(!relativePath||(kind!=="directory"&&kind!=="file"&&kind!=="symlink")) return null;
  const node: TreeNodeInput={ name: object.name,relativePath,kind };
  if(typeof object.id==="string") node.id=object.id;
  if(object.change==="added"||object.change==="modified"||object.change==="deleted"||object.change==="renamed") node.change=object.change;
  if(object.inaccessible===true) node.inaccessible=true;
  if(typeof object.error==="string") node.error=object.error;
  return node;
}


export function normalizeChange(raw: unknown): ExplorerChange|null {
  const object=asRecord(raw);
  if(!object||typeof object.relativePath!=="string") return null;
  const kind=object.kind;
  if(kind!=="added"&&kind!=="modified"&&kind!=="deleted"&&kind!=="renamed") return null;
  const change: ExplorerChange={ relativePath: object.relativePath,kind };
  const fromPath=typeof object.fromRelativePath==="string"? object.fromRelativePath:typeof object.oldRelativePath==="string"? object.oldRelativePath:null;
  if(fromPath) change.fromRelativePath=fromPath;
  const node=normalizeNode(object.node);
  if(node) change.node=node;
  return change;
}


export function normalizeSettings(raw: unknown): ExplorerSettings {
  const object=asRecord(raw);
  const nativeWidth=object?.panelWidth;
  const width=
    typeof object?.width==="number"&&Number.isFinite(object.width)
      ? object.width
      :typeof nativeWidth==="number"&&Number.isFinite(nativeWidth)
        ? nativeWidth
        :DEFAULT_SETTINGS.width;
  return {
    width,
    collapsed: object?.collapsed===true,
    showHidden: true,
    showIgnored: true,
  };
}


// Join the absolute workspace root with a tree-relative path, matching the
// root's separator (backslash on Windows, forward slash elsewhere) so the
// result is a native absolute path.
export function joinAbsolutePath(root: string,relativePath: string): string {
  const separator=root.includes("\\")? "\\":"/";
  const base=root.replace(/[\\/]+$/,"");
  const relative=relativePath.replace(/[\\/]+/g,separator);
  return relative? `${base}${separator}${relative}`:base;
}


export function errorCode(error: unknown): string {
  if(error instanceof ExplorerBridgeError) return String(error.code);
  if(error instanceof BridgeUnavailableError) return "NO_BRIDGE";
  return "INTERNAL";
}


export function isPathWithin(parent: string,candidate: string): boolean {
  return candidate===parent||candidate.startsWith(`${parent}/`);
}


export function friendlyError(error: unknown): string {
  const code=errorCode(error);
  if(code==="ACCESS_DENIED") return "Access denied — press Enter to retry";
  if(code==="NOT_FOUND") return "Directory moved — press Enter to retry";
  if(code==="TOO_MANY_ENTRIES") return "Directory limit reached";
  return "Directory unavailable — press Enter to retry";
}
