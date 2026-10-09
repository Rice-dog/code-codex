// Core-only instrumentation: published plugin bytecode and its immutable hashes stay unchanged.
import { ensurePluginPackage as loadPlugin, PLUGIN_PACKAGES } from './plugin-runtime';
import { ensureBackgroundPackage as loadBackground } from './background-plugin-runtime';
import { beginRuntimeOperation, runtimeErrorDetails } from './runtime-operations';
async function load(id:string, background:boolean):Promise<void> {
  const info=PLUGIN_PACKAGES.find(p=>p.id===id);
  const operation=beginRuntimeOperation('plugin-load','prepare',{id,background,category:info?.category,version:info?.version,api:info?.api});
  try {await (background?loadBackground(id):loadPlugin(id));operation.finish('passed',{moduleVerified:true,defaultMediaPrepared:background});}
  catch(error){operation.finish('failed',runtimeErrorDetails(error));throw error;}
}
export const ensurePluginPackage=(id:string)=>load(id,false);
export const ensureBackgroundPackage=(id:string)=>load(id,true);
