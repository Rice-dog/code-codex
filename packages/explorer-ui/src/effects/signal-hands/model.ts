import { recordCaughtRuntimeError } from '../../runtime-operations';

export const SIGNAL_HANDS_BACKGROUND_PLUGIN_ID = 'code-codex.signal-hands-background';
export const SIGNAL_HANDS_SETTINGS_KEY = 'code-codex:signal-hands-settings:v1';

export type PointerMode = 'brush' | 'magnet' | 'threads';
export interface SignalHandsSettings {
  motion: boolean;
  stage: number;
  pointerMode: PointerMode;
  pointerStrength: number;
  flowStrength: number;
}

export const DEFAULT_SIGNAL_HANDS_SETTINGS: Readonly<SignalHandsSettings> = Object.freeze({
  motion: true,
  stage: 0.5,
  pointerMode: 'brush',
  pointerStrength: 0.75,
  flowStrength: 0.65,
});

function fraction(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

export function normalizeSignalHandsSettings(input: unknown): SignalHandsSettings {
  const settings = input && typeof input === 'object' ? input as Partial<SignalHandsSettings> : {};
  const defaults = DEFAULT_SIGNAL_HANDS_SETTINGS;
  return {
    motion: settings.motion !== false,
    stage: fraction(settings.stage, defaults.stage),
    pointerMode: settings.pointerMode === 'magnet' || settings.pointerMode === 'threads'
      ? settings.pointerMode : defaults.pointerMode,
    pointerStrength: fraction(settings.pointerStrength, defaults.pointerStrength),
    flowStrength: fraction(settings.flowStrength, defaults.flowStrength),
  };
}

export function readSignalHandsSettings(): SignalHandsSettings {
  try {
    return normalizeSignalHandsSettings(JSON.parse(localStorage.getItem(SIGNAL_HANDS_SETTINGS_KEY) ?? '{}'));
  } catch (error) {
    recordCaughtRuntimeError('Read Signal Between settings', error);
    return { ...DEFAULT_SIGNAL_HANDS_SETTINGS };
  }
}

export function writeSignalHandsSettings(settings: SignalHandsSettings): void {
  try {
    localStorage.setItem(SIGNAL_HANDS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    recordCaughtRuntimeError('Write Signal Between settings', error);
  }
}
