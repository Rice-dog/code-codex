import { SignalHandsRenderer } from './renderer';
import { readSignalHandsSettings } from '../../../src/effects/signal-hands/model';
import type { BackgroundModule } from '../../../src/background-plugin-runtime';

declare const __SIGNAL_HANDS_VERSION__: string;
const module: BackgroundModule = {
  id: 'signal-hands',
  api: 1,
  version: __SIGNAL_HANDS_VERSION__,
  exports: { SignalHandsRenderer },
  startup(target, onError) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    target.append(canvas);
    return new SignalHandsRenderer(target, canvas, readSignalHandsSettings(), onError, false);
  },
};

const owner = window as unknown as Record<symbol, Map<string, BackgroundModule>>;
(owner[Symbol.for('code-codex:background-modules:v1')] ??= new Map()).set(module.id, module);
