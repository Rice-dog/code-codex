import { isHomeWorkspaceView } from './home-view';
import { startupContentVisible } from './startup-readiness';

export function welcomeSurfaceState(): 'waiting' | 'unready' | 'ready' {
  if (document.visibilityState !== 'visible'
      || document.querySelector('.code-codex-startup-host[popover]')
      || !isHomeWorkspaceView()) return 'waiting';
  return startupContentVisible() ? 'ready' : 'unready';
}
