export function dispatcherRole(namespace:Record<string,unknown>):{key:string;value:any};
export function managerRole(namespace:Record<string,unknown>):{key:string;value:any};
export function nativeAccountServices(namespace:Record<string,unknown>):Array<Record<string,any>>;
export function rpcManagerService(namespace:Record<string,unknown>,methods?:string[]):Record<string,any>|undefined;
export function qualifyHostModules(manifest:{version?:string;initial:string[];shared:string[];runtimes?:string[]},load?:(path:string)=>Promise<Record<string,unknown>>):Promise<{version:string;initial:string;shared:string;managerExport:string;senderExport:string;dispatcherExport:string;compatibility:string;contractRevision:number}>;
export function discoverSharedDispatcher(load?:(path:string)=>Promise<Record<string,unknown>>):Promise<any>;

export function loadHostNamespace(address:string,load?:(path:string)=>Promise<Record<string,any>>):Promise<Record<string,any>>;
export function validHostModulePath(path:unknown):boolean;
export function qualifyNumberedHost(manifest:{version?:string;runtimes?:string[]},load?:(path:string)=>Promise<Record<string,any>>):Promise<Record<string,any>>;
