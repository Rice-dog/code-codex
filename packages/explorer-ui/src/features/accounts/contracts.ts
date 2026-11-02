export type AccountRequest=<T=unknown>(params:Record<string,unknown>)=>Promise<T>;
export interface AccountConnection {id:string;label:string;email:string|null;plan:string|null;}
export interface AccountsInfo {
 owner:{id:string;label:string;plan?:string|null};
 profile:{version:string;initial:string;shared:string;managerExport:string;senderExport:string;dispatcherExport:string};
 connections:AccountConnection[];selected:Record<string,string>;activeConversations:string[];sharedConversations?:string[];
 nativeRouting?:boolean;nativeRoutes?:Record<string,string>;
}
export interface WorkerEvent {sequence:number;message:{id?:number|string;method:string;params:Record<string,unknown>};}
export interface EventsResult {events:WorkerEvent[];cursor:number;disconnected:boolean;hasMore?:boolean;queuedEvents?:number;queuedBytes?:number;}
export interface NativeAccountStatus {recoveryNotice?:string|undefined;sendBlocked?:boolean;executionMode?:string;supported:boolean;active:boolean;conversationId:string|null;selected:string;busy:boolean;preparing?:boolean;progress?:number;preparation?:{phase:string;elapsedMs:number;operationId?:number|undefined}|undefined;selectionTarget?:{id:string;conversationId:string|null}|undefined;error?:string|undefined;}
export const ACCOUNT_PLUGIN_ID='multi-account';
export const ACCOUNT_ENABLED_KEY='code-codex:multi-account-enabled:v1';
export const ACCOUNT_AUTO_CONTINUE_KEY='code-codex:account-auto-continue:v1';
export const ACCOUNT_UI_CHANGED='code-codex:accounts-state-changed';
