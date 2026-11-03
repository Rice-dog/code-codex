import handBytes from './hands.webp';
import { mount } from './field.js';

// The default worker input lane carries pointers. Wheel gestures use the
// renderer’s filtered wheel lane so zoom, controls and horizontal scroll stay local.
export const kernelMethods = ['scroll', 'pose'];

export function createKernel(_host, canvas, initial, onError) {
  let settings = initial;
  let stage = settings.stage;
  let bitmap;
  let scene;
  let disposed = false;

  createImageBitmap(new Blob([handBytes], { type: 'image/webp' })).then(decoded => {
    if (disposed) { decoded.close(); return; }
    bitmap = decoded;
    scene = mount(canvas, bitmap, { ...settings, stage, paused: !settings.motion });
  }).catch(error => {
    if (!disposed) onError(String(error));
  });

  return {
    setSettings(next) {
      if (settings.stage !== next.stage) {
        stage = next.stage;
        scene?.setStage(stage);
      }
      if (settings.motion !== next.motion) scene?.setPaused(!next.motion);
      if (settings.pointerMode !== next.pointerMode || settings.pointerStrength !== next.pointerStrength) {
        scene?.setPointerEffect(next.pointerMode, next.pointerStrength);
      }
      if (settings.flowStrength !== next.flowStrength) scene?.setFlowStrength(next.flowStrength);
      settings = next;
    },
    scroll(delta) { scene?.scrollImpulse(delta); },
    pose(delta) {
      stage = Math.min(1, Math.max(0, stage + delta / 1300));
      scene?.setStage(stage);
    },
    replay() { scene?.setStage(stage); },
    dispose() {
      disposed = true;
      scene?.dispose();
      bitmap?.close();
    },
  };
}
