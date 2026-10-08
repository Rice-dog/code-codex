import { pluginModules, pluginExport } from './plugin-runtime';
export function optionalPluginExport<T>(id:string,name:string):T|undefined{return pluginModules().get(id)?.exports[name] as T|undefined;}
export const transparentPresentation=():string|undefined=>optionalPluginExport<()=>string|undefined>('transparent-background','presentation')?.();
export const applyTransparentPresentation=(value:string):void=>pluginExport<(v:string)=>void>('transparent-background','applyPresentation')(value);
export const clearTransparentPresentation=():void=>optionalPluginExport<()=>void>('transparent-background','clearPresentation')?.();
