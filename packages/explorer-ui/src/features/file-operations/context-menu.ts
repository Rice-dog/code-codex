// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { type ContextMenuAction,type ContextMenuNameAction } from "../../contracts/explorer-model";
import { errorCode } from "../../core/bridge/response-validation";
import { icons } from "../../icons";

/** Stable UI keys derive from actions, never by searching displayed English. */
export const contextActionTextKeys: Readonly<Record<ContextMenuAction,string>> = {
  'new-file':'context.newFile','new-folder':'context.newFolder',rename:'context.rename',
  delete:'context.delete','copy-relative':'context.copyRelative','copy-absolute':'context.copyAbsolute',
  reveal:'context.reveal',refresh:'context.refresh',preview:'context.preview',
};


export function isContextMenuAction(value: unknown): value is ContextMenuAction {
  return value==="preview"||
    value==="new-file"||
    value==="new-folder"||
    value==="rename"||
    value==="delete"||
    value==="copy-relative"||
    value==="copy-absolute"||
    value==="reveal"||
    value==="refresh";
}


export function contextNameActionCopy(action: ContextMenuNameAction): {
  readonly title: string;
  readonly inputLabel: string;
  readonly submitLabel: string;
  readonly icon: string;
} {
  if(action==="new-file") {
    return { title: "New File",inputLabel: "File name",submitLabel: "Create",icon: icons.newFile };
  }
  if(action==="new-folder") {
    return { title: "New Folder",inputLabel: "Folder name",submitLabel: "Create",icon: icons.newFolder };
  }
  return { title: "Rename",inputLabel: "New name",submitLabel: "Rename",icon: icons.rename };
}


export function entryNameValidationError(value: string): string|undefined {
  if(!value.length||!value.trim().length) return "Enter a name.";
  if(value.length>255) return "Use a name with 255 characters or fewer.";
  if(value==="."||value==="..") return "That name is reserved by Windows.";
  if(/[\\/:]/.test(value)) return "A name cannot contain a slash, backslash, or colon.";
  if(/[<>"|?*\u0000-\u001f]/.test(value)) return "That name contains a character Windows does not allow.";
  if(/[ .]$/.test(value)) return "A name cannot end with a space or period.";

  const stem=value.split(".",1)[0]?.toUpperCase()??"";
  if(
    stem==="CON"||
    stem==="PRN"||
    stem==="AUX"||
    stem==="NUL"||
    /^(?:COM|LPT)0*[1-9]$/.test(stem)
  ) {
    return "That name is reserved by Windows.";
  }
  return undefined;
}


export function contextActionError(action: ContextMenuAction|"move"|"paste",error: unknown): string {
  const subject=action==="new-file"
    ? "The file"
    :action==="new-folder"
      ? "The folder"
      :action==="copy-relative"||action==="copy-absolute"
        ? "The path"
        :action==="reveal"
          ? "The item"
          :action==="refresh"
            ? "The directory"
            :"The item";
  const code=errorCode(error);
  if(code==="ACCESS_DENIED") return `${subject} could not be changed because Windows denied access.`;
  if(code==="NOT_FOUND") return `${subject} no longer exists.`;
  if(code==="CONFLICT"||code==="ALREADY_EXISTS") {
    if(action==="new-file") return "A file with that name already exists.";
    if(action==="new-folder") return "A folder with that name already exists.";
    if(action==="rename") return "An item with that name already exists.";
    if(action==="move") return "An item with that name already exists in this folder.";
    if(action==="delete") return "The item changed before it could be deleted. Refresh and try again.";
    return `${subject} already exists.`;
  }
  if(code==="INVALID_REQUEST"||code==="INVALID_NAME"||code==="INVALID_PATH") {
    return action==="new-file"||action==="new-folder"||action==="rename"
      ? "That name is not valid on Windows."
      :"The item path is no longer valid.";
  }
  if(code==="TOO_MANY_ENTRIES") return "This folder contains too many items to change safely.";
  if(code==="OUTSIDE_WORKSPACE") return "The item is outside the active workspace.";
  if(code==="CANCELLED") return "The action was cancelled.";
  if(code==="TIMEOUT") return "The action is taking longer than expected. Refresh before trying again.";
  if(code==="NO_BRIDGE") return "Code-Codex is disconnected.";
  return `${subject} action could not be completed.`;
}
