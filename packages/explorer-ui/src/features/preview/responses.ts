// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { ExplorerBridgeError } from "../../bridge";
import { MAX_MEDIA_CHUNK_BYTES,MAX_PREVIEW_TEXT_UNITS } from "../../core/configuration/explorer";
import { type MediaPreviewRoute,type NormalizedMediaInfo,type NormalizedPreview,type PreviewUnavailableReason } from "../../contracts/explorer-model";
import { asRecord,errorCode } from "../../core/bridge/response-validation";
import { ModelPreviewSourceError } from "./model-source";
import { POWERPOINT_FULL_FIDELITY_NOTICE } from "../../core/preview/configuration";
import { type MainPreviewFileView, type MainPreviewLineEnding } from "../../file-preview/contracts";
import { recordCaughtRuntimeError } from "../../runtime-operations";


export function normalizePreview(raw: unknown): NormalizedPreview {
  const object=asRecord(raw);
  if(!object||(object.kind!=="text"&&object.kind!=="unsupported")) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The preview response was not valid." });
  }
  if(!Number.isSafeInteger(object.sizeBytes)||(object.sizeBytes as number)<0||typeof object.truncated!=="boolean") {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The preview metadata was not valid." });
  }
  const sizeBytes=object.sizeBytes as number;
  if(object.kind==="unsupported") {
    return {
      kind: "unsupported",
      sizeBytes,
      truncated: object.truncated,
      reason: normalizePreviewReason(object.reason),
    };
  }
  if(typeof object.text!=="string") {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The preview text was not valid." });
  }
  const capped=object.text.slice(0,MAX_PREVIEW_TEXT_UNITS);
  const truncated=object.truncated||capped.length<object.text.length;
  const version=typeof object.version==="string"&&/^[0-9a-f]{64}$/.test(object.version)? object.version:undefined;
  const lineEnding=normalizeLineEnding(object.lineEnding);
  const editable=object.editable===true&&!truncated&&Boolean(version)&&lineEnding!==undefined&&lineEnding!=="mixed";
  return {
    kind: "text",
    text: capped,
    sizeBytes,
    truncated,
    editable,
    ...(version===undefined? {}:{ version }),
    ...(lineEnding===undefined? {}:{ lineEnding }),
  };
}


export function normalizeMediaInfo(raw: unknown,route: MediaPreviewRoute): NormalizedMediaInfo {
  const object=asRecord(raw);
  if(
    !object||
    object.kind!==route.kind||
    typeof object.mimeType!=="string"||
    !route.mimeTypes.includes(object.mimeType)||
    (object.previewNotice!==undefined&&
      (object.previewNotice!==POWERPOINT_FULL_FIDELITY_NOTICE||
        route.kind!=="office"||
        object.mimeType!=="application/vnd.ms-powerpoint"))||
    !Number.isSafeInteger(object.sizeBytes)||
    (object.sizeBytes as number)<=0||
    (object.sizeBytes as number)>route.maxBytes||
    !Number.isSafeInteger(object.chunkSize)||
    (object.chunkSize as number)<=0||
    (object.chunkSize as number)>MAX_MEDIA_CHUNK_BYTES||
    !Number.isSafeInteger(object.chunkCount)||
    (object.chunkCount as number)<=0||
    typeof object.version!=="string"||
    !/^[0-9a-f]{64}$/.test(object.version)
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The media preview metadata was not valid." });
  }
  const sizeBytes=object.sizeBytes as number;
  const chunkSize=object.chunkSize as number;
  const chunkCount=object.chunkCount as number;
  if(chunkCount!==Math.ceil(sizeBytes/chunkSize)) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The media preview chunk count was not valid." });
  }
  return {
    kind: route.kind,
    mimeType: object.mimeType,
    sizeBytes,
    chunkSize,
    chunkCount,
    version: object.version,
    ...(object.previewNotice===POWERPOINT_FULL_FIDELITY_NOTICE
      ? { previewNotice: POWERPOINT_FULL_FIDELITY_NOTICE }
      :{}),
  };
}


export function normalizeMediaChunk(
  raw: unknown,
  expectedOffset: number,
  expectedLength: number,
  totalSizeBytes: number,
): { readonly bytes: Uint8Array; readonly eof: boolean } {
  const object=asRecord(raw);
  const maxEncodedLength=Math.ceil(expectedLength/3)*4+4;
  if(
    !object||
    object.offset!==expectedOffset||
    typeof object.dataBase64!=="string"||
    object.dataBase64.length>maxEncodedLength||
    typeof object.eof!=="boolean"
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The media preview chunk was not valid." });
  }
  let binary: string;
  try {
    binary=window.atob(object.dataBase64);
  } catch(__codeCodexCaught) {
    recordCaughtRuntimeError("normalizeMediaChunk",__codeCodexCaught);

    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The media preview chunk was not valid Base64." });
  }
  if(binary.length!==expectedLength) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The media preview chunk had an unexpected length." });
  }
  const eof=expectedOffset+expectedLength===totalSizeBytes;
  if(object.eof!==eof) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The media preview ended at an unexpected position." });
  }
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index+=1) bytes[index]=binary.charCodeAt(index);
  return { bytes,eof };
}


export function normalizeLineEnding(value: unknown): MainPreviewLineEnding|undefined {
  return value==="lf"||value==="crlf"||value==="none"||value==="mixed"? value:undefined;
}


export function isEditablePreview(
  view: MainPreviewFileView,
): view is (Extract<MainPreviewFileView,{ kind: "text"|"empty" }>&{ editable: true; version: string }) {
  return (view.kind==="text"||view.kind==="empty")&&view.editable===true&&typeof view.version==="string"&&Boolean(view.version);
}


export function previewText(view: MainPreviewFileView): string {
  return view.kind==="text"? view.text:"";
}


export function normalizeTextareaText(text: string): string {
  return text.replaceAll("\r\n","\n").replaceAll("\r","\n");
}


export function restoreLineEndings(text: string,lineEnding: MainPreviewLineEnding|undefined): string {
  const normalized=normalizeTextareaText(text);
  return lineEnding==="crlf"? normalized.replaceAll("\n","\r\n"):normalized;
}


export function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[]=[];
  const chunkSize=16*1024;
  for(let start=0;start<bytes.length;start+=chunkSize) {
    let chunk="";
    const end=Math.min(bytes.length,start+chunkSize);
    for(let index=start;index<end;index+=1) chunk+=String.fromCharCode(bytes[index]??0);
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
}


export function editSaveError(error: unknown): string {
  const code=errorCode(error);
  if(code==="CONFLICT") return "This file changed on disk. Reload it before saving.";
  if(code==="ACCESS_DENIED") return "Windows denied permission to save this file. Your draft has been kept.";
  if(code==="NOT_FOUND") return "This file no longer exists at its original location. Your draft has been kept.";
  if(code==="TOO_LARGE"||code==="PAYLOAD_TOO_LARGE"||code==="CONTENT_TOO_LARGE") {
    return "This draft is larger than the 64 KB editing limit.";
  }
  if(code==="NOT_EDITABLE"||code==="UNSUPPORTED_TYPE") {
    return "This file is no longer eligible for editing. Reload it to continue.";
  }
  if(code==="NO_BRIDGE") return "Code-Codex is disconnected. Your draft has been kept.";
  return "Changes could not be saved. Try again or reload the file.";
}


export function mediaPreviewError(error: unknown): string {
  if(error instanceof ModelPreviewSourceError) return error.message;
  const code=errorCode(error);
  if(code==="CONTENT_TOO_LARGE"||code==="PAYLOAD_TOO_LARGE"||code==="TOO_LARGE") {
    return "This media file is larger than the preview limit.";
  }
  if(code==="NOT_EDITABLE"||code==="UNSUPPORTED_TYPE") {
    return "The file contents do not match the selected preview format.";
  }
  if(code==="CONFLICT") return "The file changed while it was loading. Select it again to retry.";
  if(code==="ACCESS_DENIED"||code==="OUTSIDE_WORKSPACE") return "Preview is blocked for this file.";
  if(code==="NO_BRIDGE") return "Code-Codex is disconnected.";
  return "The media file could not be loaded. Select it again to retry.";
}


export function normalizePreviewReason(value: unknown): PreviewUnavailableReason {
  return value==="binary"||
    value==="invalid-utf8"||
    value==="sensitive"||
    value==="unsupported-type"
    ? value
    :"unknown";
}
