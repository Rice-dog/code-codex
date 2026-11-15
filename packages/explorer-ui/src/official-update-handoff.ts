import {wrapOfficialUpdateService,type Services} from './official-update-service';
import {loadHostNamespace} from '../../../resources/account-host-capabilities.js';
import {findCodexNumberedRuntimes,findCodexAppInitialModules,isCodexRpcNamespace} from './host/appearance/theme-probe';
import {runtimeEvent} from './runtime-events';
const key=Symbol.for('code-codex:official-update-handoff:v1');
export async function installOfficialUpdateHandoff(prepare:()=>Promise<unknown>):Promise<void>{
    const state=window as unknown as Record<symbol,(()=>void)|undefined>;
    state[key]?.();delete state[key];
    const paths=[...findCodexNumberedRuntimes().map(p=>p+'#cc-host=appearance'),...findCodexAppInitialModules()];
    const candidates=new Set<Services>();
    for(const path of paths){
        const namespace=path.startsWith('./assets/')?await loadHostNamespace(path):await import(/* @vite-ignore */path);
        for(const value of Object.values(namespace)){
            if(value&&typeof value==='object'&&isCodexRpcNamespace((value as Services).appUpdates)&&typeof (value as Services).appUpdates.installUpdate==='function')candidates.add(value as Services);
        }
    }
    if(candidates.size!==1)throw new Error('CC-OFFICIAL-UPDATE-001: The official update service is missing or ambiguous.');
    state[key]=wrapOfficialUpdateService([...candidates][0]!,prepare);
    runtimeEvent('renderer','official update handoff','ready');
}
