import '../core/localization/runtime';
import { installInjector } from '../inject';
import { ExplorerBridge,getBootstrapConfig } from '../bridge';
import { initializeRendererStorage } from '../renderer-storage';
import { connectApplicationMenu } from '../host/bridge/application-menu';

/** Composition owns startup ordering. Preference failures must not hide recovery UI. */
export function startApplication(): void {
  const bootstrap=getBootstrapConfig();
  if(!bootstrap.token) {
    installInjector();
    return;
  }
  // Document-scoped commands must survive dismissal/disposal of the file tree.
  // Replace the previous composition connection on hot activation, never on hover.
  const key=Symbol.for('code-codex:application-connection:v1');
  const connections=window as unknown as Record<symbol,{dispose():void}|undefined>;
  connections[key]?.dispose();
  const storageBridge=new ExplorerBridge(bootstrap.token,bootstrap.binding,bootstrap.receiver);
  connections[key]={dispose:()=>storageBridge.dispose()};
  connectApplicationMenu(storageBridge.request.bind(storageBridge));
  if(!bootstrap.centralizedStorage) { installInjector(); return; }
  void initializeRendererStorage().then(() => {
    installInjector();
  },error => {
    console.warn('CC-START-STORAGE-001: Native preference restoration failed; mounting recovery interface.',error);
    installInjector();
  });
}
