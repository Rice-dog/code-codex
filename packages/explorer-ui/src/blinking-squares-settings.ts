import type { BlinkingSquaresProps } from "./blinking-squares";
export type BlinkingSquaresSettings = Required<Pick<BlinkingSquaresProps,
  | "direction" | "gridSize" | "squareSize" | "fadeStart" | "fadeEnd" | "falloff"
  | "minBrightness" | "twinkleSpeed" | "twinkleStrength" | "intensity" | "opacity"
  | "squareColor" | "backgroundColor" | "dpr" | "mouseInteraction"
  | "keyboardInteraction" | "keyboardPulseLimit" | "keyboardPeakCooldown"
  | "interactionRadius" | "interactionStrength" | "brightnessBoost" | "densityBoost"
  | "responseSpeed" | "inertiaDuration" | "holdLiftSpeed" | "pulseStrength"
  | "pulseLift" | "pulseSpeed" | "pulseDecay" | "introEnabled" | "introDuration"
  | "introIntensity" | "paused"
>>;

export const BLINKING_SQUARES_DEFAULTS: BlinkingSquaresSettings = {
  direction: "right", gridSize: 52, squareSize: .57, fadeStart: .33, fadeEnd: 1,
  falloff: 1.25, minBrightness: .55, twinkleSpeed: 1.4, twinkleStrength: .94,
  intensity: 1, opacity: 1, squareColor: "#bb29ff", backgroundColor: "#000000",
  dpr: 1.5, mouseInteraction: true, keyboardInteraction: true,
  keyboardPulseLimit: 5, keyboardPeakCooldown: 2, interactionRadius: 140,
  interactionStrength: 1, brightnessBoost: .85, densityBoost: .42,
  responseSpeed: 14, inertiaDuration: .65, holdLiftSpeed: .65,
  pulseStrength: 1.35, pulseLift: .75, pulseSpeed: 280, pulseDecay: 1.35,
  introEnabled: true, introDuration: 1.8, introIntensity: 1, paused: false,
};
