import { shaderEnvironment as viewportEnvironment } from '../../../src/core/background-runtime/worker-environment';
import type { BackgroundViewport } from '../../../src/core/background-runtime/protocol';

/** The worker protocol reports a completed Canvas2D paint in place of a WebGL draw. */
export function shaderEnvironment(surface: OffscreenCanvas, viewport: BackgroundViewport, onFrame: () => void) {
  const environment = viewportEnvironment(surface, viewport, onFrame);
  const canvas = new Proxy(environment.canvas, {
    get(target, property) {
      if (property === 'presentFrame') return onFrame;
      if (property === 'getContext') return surface.getContext.bind(surface);
      return Reflect.get(target, property, target);
    },
  });
  return { ...environment, canvas };
}
