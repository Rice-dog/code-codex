export function dispatcherRole(namespace:Record<string,unknown>):{key:string;value:any};
export function managerRole(namespace:Record<string,unknown>):{key:string;value:any};
export function qualifyHostModules(manifest:{version?:string;initial:string[];shared:string[]},load?:(path:string)=>Promise<Record<string,unknown>>):Promise<{version:string;initial:string;shared:string;managerExport:string;senderExport:string;dispatcherExport:string;compatibility:string;contractRevision:number}>;
export function discoverSharedDispatcher(load?:(path:string)=>Promise<Record<string,unknown>>):Promise<any>;
