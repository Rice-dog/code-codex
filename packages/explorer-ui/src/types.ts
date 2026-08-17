export type NodeKind = "directory" | "file" | "symlink";
export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export interface TreeNodeInput {
  id?: string;
  name: string;
  relativePath: string;
  kind: NodeKind;
  change?: ChangeKind;
  inaccessible?: boolean;
  error?: string;
}

export interface ExplorerContext {
  threadId: string;
  projectName: string;
  rootName: string;
  // Absolute workspace root, used to build absolute paths locally. Empty when
  // the launcher did not report one (older builds).
  rootPath: string;
  compatible: boolean;
  reason?: string;
}

export interface ListRequest {
  relativePath: string;
  cursor?: string;
  limit: number;
}

export interface ListResult {
  entries: TreeNodeInput[];
  nextCursor?: string;
}

export interface ExplorerChange {
  relativePath: string;
  kind: ChangeKind;
  fromRelativePath?: string;
  node?: TreeNodeInput;
}

export interface ExplorerSettings {
  width: number;
  collapsed: boolean;
  showHidden?: boolean;
  showIgnored?: boolean;
}

export interface BridgeErrorData {
  code?: string | number;
  message: string;
  data?: unknown;
}

export interface BridgeRequest {
  id: string;
  token: string;
  method: string;
  params: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  ok?: boolean;
  result?: unknown;
  error?: BridgeErrorData | string;
}

export interface BridgeNotification {
  method: string;
  params?: unknown;
}

export type BridgeMessage = BridgeResponse | BridgeNotification;

export type ExplorerViewState =
  | "booting"
  | "loading"
  | "ready"
  | "empty"
  | "no-project"
  | "error"
  | "incompatible";

export interface FlatTreeRow {
  key: string;
  path: string;
  node?: TreeNodeInput;
  depth: number;
  kind: "node" | "more" | "directory-error" | "directory-loading";
  parentPath: string;
}

export interface BootstrapConfig {
  token?: string;
  supported?: boolean;
  compatible?: boolean;
  version?: string;
  codexVersion?: string;
  channel?: string;
  forceDrawer?: boolean;
  manualWorkspace?: boolean;
}

export interface ObjectBridge {
  send?: (message: BridgeRequest) => unknown;
  request?: (message: BridgeRequest) => unknown;
  subscribe?: (listener: (message: BridgeMessage) => void) => (() => void) | void;
}

export interface CodexViewFetchRequest {
  type: "fetch";
  requestId: string;
  method: "POST";
  url: string;
  body: string;
}

export interface CodexElectronBridge {
  sendMessageFromView?: (message: CodexViewFetchRequest) => unknown;
}

declare global {
  interface Window {
    __CODE_CODEX_BOOTSTRAP__?: BootstrapConfig;
    __codeCodex?: ((payload: string) => unknown) | ObjectBridge;
    __codeCodexNative?: ((payload: string) => unknown) | ObjectBridge;
    __codeCodexReceive?: (message: BridgeMessage | string) => void;
    __codeCodexInject?: () => HTMLElement | null;
    electronBridge?: CodexElectronBridge;
  }
}
