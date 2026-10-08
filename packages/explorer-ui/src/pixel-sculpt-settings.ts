export type PixelSculptSettings = { paused: boolean };
export const PIXEL_SCULPT_DEFAULTS: PixelSculptSettings = { paused: false };
export function normalizePixelSculptSettings(value: unknown): PixelSculptSettings {return {paused:Boolean((value as PixelSculptSettings)?.paused)};}
export function readPixelSculptBackgroundSettings(): PixelSculptSettings {return {...PIXEL_SCULPT_DEFAULTS};}
export function writePixelSculptBackgroundSettings(_settings: PixelSculptSettings): void {}
