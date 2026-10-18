// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { ExplorerBridgeError } from "../../bridge";
import { asRecord,errorCode } from "../../core/bridge/response-validation";


export interface WindowTransparencyResult {
  readonly enabled: boolean;
  readonly background: "transparent";
}


export function validateTransparencyResult(raw: unknown,requestedEnabled: boolean): WindowTransparencyResult {
  const result=asRecord(raw);
  if(
    !result||
    Object.keys(result).length!==2||
    result.enabled!==requestedEnabled||
    result.background!=="transparent"
  ) {
    throw new ExplorerBridgeError({ code: "INVALID_REQUEST",message: "The window transparency response was not valid." });
  }
  return { enabled: requestedEnabled,background: "transparent" };
}


export function transparencyActionError(error: unknown,requestedEnabled: boolean): string {
  const action=requestedEnabled? "enabled":"disabled";
  const code=errorCode(error);
  if(code==="NO_BRIDGE") return `Transparent Background was not ${action}. Restart Codex with Code-Codex, then try again.`;
  if(code==="TIMEOUT") return `Transparent Background was not ${action}. Try again.`;
  if(code==="ACCESS_DENIED") return `Transparent Background was not ${action} because Windows denied access.`;
  if(
    code==="UNSUPPORTED"||
    code==="UNSUPPORTED_VERSION"||
    code==="NOT_SUPPORTED"||
    code==="METHOD_NOT_FOUND"||
    code==="WINDOW_UNAVAILABLE"
  ) {
    return "Transparent Background is not supported by this Codex window.";
  }
  return `Transparent Background was not ${action}. Try again.`;
}
