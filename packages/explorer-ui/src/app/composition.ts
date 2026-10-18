import '../core/localization/runtime';
import { installInjector } from '../inject';
import { ExplorerBridge,getBootstrapConfig } from '../bridge';
import { initializeRendererStorage } from '../renderer-storage';

/** Composition owns startup ordering. Preference failures must not hide recovery UI. */
export function startApplication(): void {
  const bootstrap=getBootstrapConfig();
  if(!bootstrap.centralizedStorage||!bootstrap.token) {
    installInjector();
    return;
  }
  const storageBridge=new ExplorerBridge(bootstrap.token,bootstrap.binding,bootstrap.receiver);
  void initializeRendererStorage().then(() => {
    storageBridge.dispose();
    installInjector();
  },error => {
    storageBridge.dispose();
    console.warn('CC-START-STORAGE-001: Native preference restoration failed; mounting recovery interface.',error);
    installInjector();
  });
}
