import {backgroundConstructor} from '../../background-plugin-runtime';
import type {SignalHandsRenderer} from '../../../plugins/appearance/signal-hands/renderer';
import {
    DEFAULT_SIGNAL_HANDS_SETTINGS,
    SIGNAL_HANDS_BACKGROUND_PLUGIN_ID,
    normalizeSignalHandsSettings,
    readSignalHandsSettings,
    writeSignalHandsSettings,
    type SignalHandsSettings,
} from '../../effects/signal-hands/model';
import {recordCaughtRuntimeError} from '../../runtime-operations';
import {ManagedBackgroundController} from './managed';

const Renderer = backgroundConstructor<typeof SignalHandsRenderer>('signal-hands', 'SignalHandsRenderer');

export class SignalHandsBackgroundController extends ManagedBackgroundController<SignalHandsSettings, SignalHandsRenderer> {
    #disconnectCleanup: Promise<void> | undefined;

    constructor() {
        super({
            id: SIGNAL_HANDS_BACKGROUND_PLUGIN_ID,
            packageId: 'signal-hands',
            label: 'Signal Between',
            layerAttribute: 'data-code-codex-signal-hands-layer',
            canvasClass: 'code-codex-particle-canvas code-codex-signal-hands-canvas',
            defaults: DEFAULT_SIGNAL_HANDS_SETTINGS,
            read: readSignalHandsSettings,
            normalize: normalizeSignalHandsSettings,
            persist: writeSignalHandsSettings,
            color: () => '#050610',
            disposeOnRendererError: true,
            deferPresentationUntilReady: true,
            create: (...args) => new Renderer(...args),
        });
    }

    // A replacement explorer may reuse this controller while the previous one
    // is still restoring the Codex appearance preference.
    detach(): void {
        this.#disconnectCleanup ??= this.disable()
            .catch(error => recordCaughtRuntimeError('Signal Between disconnect', error))
            .finally(() => { this.#disconnectCleanup = undefined; });
    }

    override async initialize(): Promise<void> {
        await this.#disconnectCleanup;
        await super.initialize();
    }
}

const SLOT = Symbol.for('code-codex:signal-hands-controller:v1');

export function getSignalHandsBackgroundController(): SignalHandsBackgroundController {
    const host = window as unknown as Record<symbol, unknown>;
    const current = host[SLOT];
    if (current instanceof SignalHandsBackgroundController) return current;
    if (current && typeof current === 'object' && 'dispose' in current && typeof current.dispose === 'function') {
        try { current.dispose(); }
        catch (error) { recordCaughtRuntimeError('Replace Signal Between controller', error); }
    }
    return host[SLOT] = new SignalHandsBackgroundController();
}
