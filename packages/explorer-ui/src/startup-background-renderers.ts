import { requestBackgroundFrame, cancelBackgroundFrame } from './background-startup-hold';
import { BLINKING_SQUARES_DEFAULTS, type BlinkingSquaresSettings } from "./blinking-squares-settings";

export const BLACK_HOLE_BACKGROUND_SETTINGS_KEY = "code-codex:black-hole-background:v1";

export const GLOW_HORIZON_BACKGROUND_SETTINGS_KEY = "code-codex:glow-horizon-background:v1";

export const HEAVENLY_CLOUD_BACKGROUND_SETTINGS_KEY = "code-codex:heavenly-cloud-background:v1";

export const AURORA_IONOSPHERE_BACKGROUND_SETTINGS_KEY = "code-codex:aurora-ionosphere-background:v1";

export const MILKY_WAY_BACKGROUND_SETTINGS_KEY = "code-codex:milky-way-background:v1";

export const BLINKING_SQUARES_BACKGROUND_SETTINGS_KEY = "code-codex:blinking-squares-background:v1";

export interface BlackHoleBackgroundSettings {
  readonly distance: number;
  readonly elevation: number;
  readonly azimuth: number;
  readonly orbitSpeed: number;
  readonly roll: number;
  readonly fov: number;
  readonly diskInner: number;
  readonly diskOuter: number;
  readonly diskThickness: number;
  readonly diskDensity: number;
  readonly brightness: number;
  readonly spinSpeed: number;
  readonly grain: number;
  readonly doppler: number;
  readonly hotColor: string;
  readonly midColor: string;
  readonly coolColor: string;
  readonly starBrightness: number;
  readonly glow: number;
  readonly exposure: number;
  readonly vignette: number;
  readonly steps: number;
  readonly resolution: number;
  readonly maxDpr: number;
  readonly paused: boolean;
}

export type GlowHorizonVariant = "top" | "bottom" | "left" | "right";

export interface GlowHorizonBackgroundSettings {
  readonly variant: GlowHorizonVariant;
  readonly inertialWheel: boolean;
  readonly openingDuration: number;
  readonly wheelSensitivity: number;
  readonly wheelDownIntensity: number;
  readonly wheelUpIntensity: number;
  readonly wheelTravelScale: number;
  readonly wheelDownDistance: number;
  readonly wheelUpDistance: number;
  readonly wheelUpTrailDistance: number;
  readonly wheelUpTrailStrength: number;
  readonly wheelUpStiffness: number;
  readonly wheelUpDamping: number;
  readonly wheelReleaseDelay: number;
  readonly wheelUpReleaseDelay: number;
  readonly maxReleaseVelocity: number;
  readonly returnStiffness: number;
  readonly returnDamping: number;
  readonly initialStretch: number;
  readonly initialBlur: number;
  readonly rimColor: string;
  readonly violetColor: string;
  readonly blueColor: string;
  readonly shadowColor: string;
}

export type HeavenlyCloudQuality = "low" | "medium" | "high";

export interface HeavenlyCloudBackgroundSettings {
  readonly quality: HeavenlyCloudQuality;
  readonly speed: number;
  readonly intensity: number;
  readonly turbulence: number;
  readonly radius: number;
  readonly colorShift: number;
  readonly pointerInfluence: number;
  readonly introDuration: number;
  readonly introFeather: number;
  readonly paused: boolean;
}

export type AuroraIonosphereQuality = "low" | "medium" | "high";

export interface AuroraIonosphereBackgroundSettings {
  readonly hue: number;
  readonly saturation: number;
  readonly quality: AuroraIonosphereQuality;
  readonly speed: number;
  readonly intensity: number;
  readonly curtainScale: number;
  readonly turbulence: number;
  readonly glow: number;
  readonly starDensity: number;
  readonly introDuration: number;
  readonly introFeather: number;
  readonly introStart: number;
  readonly introEnd: number;
  readonly introSkyEnd: number;
  readonly introStarStart: number;
  readonly paused: boolean;
}

export type AuroraIonosphereNumericSettingKey = {
  [Key in keyof AuroraIonosphereBackgroundSettings]: AuroraIonosphereBackgroundSettings[Key] extends number ? Key : never;
}[keyof AuroraIonosphereBackgroundSettings];

export type AuroraIonosphereControlGroup = "field" | "opening";

export interface AuroraIonosphereNumericControlDefinition {
  readonly key: AuroraIonosphereNumericSettingKey;
  readonly group: AuroraIonosphereControlGroup;
  readonly id: string;
  readonly label: string;
  readonly labelZh: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly precision?: number;
}

export const DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS: BlackHoleBackgroundSettings = Object.freeze({
  distance: 24,
  elevation: -5.5,
  azimuth: 0,
  orbitSpeed: 0,
  roll: -20,
  fov: 42,
  diskInner: 3,
  diskOuter: 15,
  diskThickness: 0.26,
  diskDensity: 1,
  brightness: 1,
  spinSpeed: 0.06,
  grain: 0.48,
  doppler: 0.35,
  hotColor: "#FFF3DE",
  midColor: "#FF9838",
  coolColor: "#8E3A0B",
  starBrightness: 0,
  glow: 1,
  exposure: 0.9,
  vignette: 0.28,
  steps: 200,
  resolution: 0.4,
  maxDpr: 1,
  paused: false,
});

export const DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS: GlowHorizonBackgroundSettings = Object.freeze({
  variant: "bottom",
  inertialWheel: true,
  openingDuration: 2,
  wheelSensitivity: 1,
  wheelDownIntensity: 0.4,
  wheelUpIntensity: 0.8,
  wheelTravelScale: 1,
  wheelDownDistance: 100,
  wheelUpDistance: 20,
  wheelUpTrailDistance: 18,
  wheelUpTrailStrength: 1.15,
  wheelUpStiffness: 180,
  wheelUpDamping: 48,
  wheelReleaseDelay: 70,
  wheelUpReleaseDelay: 80,
  maxReleaseVelocity: 2.4,
  returnStiffness: 180,
  returnDamping: 14,
  initialStretch: 1.8,
  initialBlur: 0,
  rimColor: "#FFFFFF",
  violetColor: "#A558FB",
  blueColor: "#4922E5",
  shadowColor: "#000000",
});

export const HEAVENLY_CLOUD_QUALITY = Object.freeze({
  low: Object.freeze({ steps: 56, resolutionScale: 0.56, maxDpr: 1 }),
  medium: Object.freeze({ steps: 76, resolutionScale: 0.72, maxDpr: 1.25 }),
  high: Object.freeze({ steps: 100, resolutionScale: 0.86, maxDpr: 1.5 }),
} satisfies Readonly<Record<HeavenlyCloudQuality, Readonly<{
  steps: number;
  resolutionScale: number;
  maxDpr: number;
}>>>);

export const DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS: HeavenlyCloudBackgroundSettings = Object.freeze({
  quality: "high",
  speed: 0.72,
  intensity: 1.15,
  turbulence: 1,
  radius: 3,
  colorShift: 0,
  pointerInfluence: 0.45,
  introDuration: 2.2,
  introFeather: 0.22,
  paused: false,
});

export const AURORA_IONOSPHERE_QUALITY = Object.freeze({
  low: Object.freeze({ steps: 32, rayScale: 0.72, maxDpr: 1.1, minAdaptiveScale: 0.92, noiseAtlasSize: 512 }),
  medium: Object.freeze({ steps: 50, rayScale: 0.76, maxDpr: 1.25, minAdaptiveScale: 0.9, noiseAtlasSize: 768 }),
  high: Object.freeze({ steps: 72, rayScale: 0.82, maxDpr: 1.4, minAdaptiveScale: 0.9, noiseAtlasSize: 1024 }),
} satisfies Readonly<Record<AuroraIonosphereQuality, Readonly<{
  steps: 32 | 50 | 72;
  rayScale: number;
  maxDpr: number;
  minAdaptiveScale: number;
  noiseAtlasSize: number;
}>>>);

export const DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS: AuroraIonosphereBackgroundSettings = Object.freeze({
  hue: 0,
  saturation: 1,
  quality: "medium",
  speed: 1,
  intensity: 1,
  curtainScale: 0.5,
  turbulence: 0.58,
  glow: 0.72,
  starDensity: 0.56,
  introDuration: 2.4,
  introFeather: 0.16,
  introStart: -0.22,
  introEnd: 1.32,
  introSkyEnd: 0.48,
  introStarStart: 0.34,
  paused: false,
});

export function clampParticleNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

export function normalizeBlackHoleColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

export function normalizeBlackHoleSettings(value: unknown): BlackHoleBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS;
  return {
    distance: clampParticleNumber(record.distance, 10, 40, defaults.distance),
    elevation: clampParticleNumber(record.elevation, -30, 30, defaults.elevation),
    azimuth: clampParticleNumber(record.azimuth, -180, 180, defaults.azimuth),
    orbitSpeed: clampParticleNumber(record.orbitSpeed, -8, 8, defaults.orbitSpeed),
    roll: clampParticleNumber(record.roll, -45, 45, defaults.roll),
    fov: clampParticleNumber(record.fov, 25, 75, defaults.fov),
    diskInner: clampParticleNumber(record.diskInner, 1.2, 6, defaults.diskInner),
    diskOuter: clampParticleNumber(record.diskOuter, 8, 24, defaults.diskOuter),
    diskThickness: clampParticleNumber(record.diskThickness, 0.05, 0.8, defaults.diskThickness),
    diskDensity: clampParticleNumber(record.diskDensity, 0.1, 2, defaults.diskDensity),
    brightness: clampParticleNumber(record.brightness, 0.2, 2, defaults.brightness),
    spinSpeed: clampParticleNumber(record.spinSpeed, 0, 0.2, defaults.spinSpeed),
    grain: clampParticleNumber(record.grain, 0.1, 1.2, defaults.grain),
    doppler: clampParticleNumber(record.doppler, 0, 1, defaults.doppler),
    hotColor: normalizeBlackHoleColor(record.hotColor, defaults.hotColor),
    midColor: normalizeBlackHoleColor(record.midColor, defaults.midColor),
    coolColor: normalizeBlackHoleColor(record.coolColor, defaults.coolColor),
    starBrightness: clampParticleNumber(record.starBrightness, 0, 2, defaults.starBrightness),
    glow: clampParticleNumber(record.glow, 0, 2, defaults.glow),
    exposure: clampParticleNumber(record.exposure, 0.25, 1.8, defaults.exposure),
    vignette: clampParticleNumber(record.vignette, 0, 1, defaults.vignette),
    steps: defaults.steps,
    resolution: defaults.resolution,
    maxDpr: defaults.maxDpr,
    paused: defaults.paused,
  };
}

export function readBlackHoleBackgroundSettings(): BlackHoleBackgroundSettings {
  try {
    return normalizeBlackHoleSettings(JSON.parse(localStorage.getItem(BLACK_HOLE_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS };
  }
}

export function normalizeGlowHorizonColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

export function normalizeGlowHorizonSettings(value: unknown): GlowHorizonBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS;
  const variant = record.variant === "bottom" || record.variant === "left" || record.variant === "right"
    ? record.variant
    : defaults.variant;
  return {
    variant,
    inertialWheel: typeof record.inertialWheel === "boolean" ? record.inertialWheel : defaults.inertialWheel,
    openingDuration: clampParticleNumber(record.openingDuration, 0.8, 4, defaults.openingDuration),
    wheelSensitivity: clampParticleNumber(record.wheelSensitivity, 0.35, 1.8, defaults.wheelSensitivity),
    wheelDownIntensity: clampParticleNumber(record.wheelDownIntensity, 0, 2, defaults.wheelDownIntensity),
    wheelUpIntensity: clampParticleNumber(record.wheelUpIntensity, 0, 4, defaults.wheelUpIntensity),
    wheelTravelScale: clampParticleNumber(record.wheelTravelScale, 0.65, 1.6, defaults.wheelTravelScale),
    wheelDownDistance: clampParticleNumber(record.wheelDownDistance, 20, 100, defaults.wheelDownDistance),
    wheelUpDistance: clampParticleNumber(record.wheelUpDistance, 3, 36, defaults.wheelUpDistance),
    wheelUpTrailDistance: clampParticleNumber(record.wheelUpTrailDistance, 4, 42, defaults.wheelUpTrailDistance),
    wheelUpTrailStrength: clampParticleNumber(record.wheelUpTrailStrength, 0, 2, defaults.wheelUpTrailStrength),
    wheelUpStiffness: clampParticleNumber(record.wheelUpStiffness, 180, 900, defaults.wheelUpStiffness),
    wheelUpDamping: clampParticleNumber(record.wheelUpDamping, 18, 48, defaults.wheelUpDamping),
    wheelReleaseDelay: clampParticleNumber(record.wheelReleaseDelay, 40, 220, defaults.wheelReleaseDelay),
    wheelUpReleaseDelay: clampParticleNumber(record.wheelUpReleaseDelay, 40, 240, defaults.wheelUpReleaseDelay),
    maxReleaseVelocity: clampParticleNumber(record.maxReleaseVelocity, 0.8, 5, defaults.maxReleaseVelocity),
    returnStiffness: clampParticleNumber(record.returnStiffness, 60, 180, defaults.returnStiffness),
    returnDamping: clampParticleNumber(record.returnDamping, 10, 30, defaults.returnDamping),
    initialStretch: clampParticleNumber(record.initialStretch, 1, 1.8, defaults.initialStretch),
    initialBlur: clampParticleNumber(record.initialBlur, 0, 30, defaults.initialBlur),
    rimColor: normalizeGlowHorizonColor(record.rimColor, defaults.rimColor),
    violetColor: normalizeGlowHorizonColor(record.violetColor, defaults.violetColor),
    blueColor: normalizeGlowHorizonColor(record.blueColor, defaults.blueColor),
    shadowColor: normalizeGlowHorizonColor(record.shadowColor, defaults.shadowColor),
  };
}

export function readGlowHorizonBackgroundSettings(): GlowHorizonBackgroundSettings {
  try {
    return normalizeGlowHorizonSettings(JSON.parse(localStorage.getItem(GLOW_HORIZON_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS };
  }
}

export function normalizeHeavenlyCloudSettings(value: unknown): HeavenlyCloudBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS;
  const quality = record.quality === "low" || record.quality === "medium" || record.quality === "high"
    ? record.quality
    : defaults.quality;
  return {
    quality,
    speed: clampParticleNumber(record.speed, 0, 2, defaults.speed),
    intensity: clampParticleNumber(record.intensity, 0.3, 2.4, defaults.intensity),
    turbulence: clampParticleNumber(record.turbulence, 0.35, 1.65, defaults.turbulence),
    radius: clampParticleNumber(record.radius, 1.8, 4.6, defaults.radius),
    colorShift: clampParticleNumber(record.colorShift, -3.14, 3.14, defaults.colorShift),
    pointerInfluence: clampParticleNumber(record.pointerInfluence, 0, 1.2, defaults.pointerInfluence),
    introDuration: clampParticleNumber(record.introDuration, 0.8, 5, defaults.introDuration),
    introFeather: clampParticleNumber(record.introFeather, 0.02, 0.8, defaults.introFeather),
    paused: typeof record.paused === "boolean" ? record.paused : defaults.paused,
  };
}

export function readHeavenlyCloudBackgroundSettings(): HeavenlyCloudBackgroundSettings {
  try {
    return normalizeHeavenlyCloudSettings(JSON.parse(localStorage.getItem(HEAVENLY_CLOUD_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS };
  }
}

export function normalizeAuroraIonosphereSettings(value: unknown): AuroraIonosphereBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS;
  const quality = record.quality === "low" || record.quality === "medium" || record.quality === "high"
    ? record.quality
    : defaults.quality;
  return {
    hue: clampParticleNumber(record.hue, -180, 180, defaults.hue),
    saturation: clampParticleNumber(record.saturation, 0, 2, defaults.saturation),
    quality,
    speed: clampParticleNumber(record.speed, 0, 3, defaults.speed),
    intensity: clampParticleNumber(record.intensity, 0, 3, defaults.intensity),
    curtainScale: clampParticleNumber(record.curtainScale, 0.05, 2, defaults.curtainScale),
    turbulence: clampParticleNumber(record.turbulence, 0, 1.8, defaults.turbulence),
    glow: clampParticleNumber(record.glow, 0, 2.4, defaults.glow),
    starDensity: clampParticleNumber(record.starDensity, 0, 1.5, defaults.starDensity),
    introDuration: clampParticleNumber(record.introDuration, 0.6, 6, defaults.introDuration),
    introFeather: clampParticleNumber(record.introFeather, 0.03, 0.4, defaults.introFeather),
    introStart: clampParticleNumber(record.introStart, -0.5, 0.25, defaults.introStart),
    introEnd: clampParticleNumber(record.introEnd, 0.8, 1.8, defaults.introEnd),
    introSkyEnd: clampParticleNumber(record.introSkyEnd, 0.1, 0.9, defaults.introSkyEnd),
    introStarStart: clampParticleNumber(record.introStarStart, 0, 0.8, defaults.introStarStart),
    paused: typeof record.paused === "boolean" ? record.paused : defaults.paused,
  };
}

export function readAuroraIonosphereBackgroundSettings(): AuroraIonosphereBackgroundSettings {
  try {
    return normalizeAuroraIonosphereSettings(JSON.parse(localStorage.getItem(AURORA_IONOSPHERE_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS };
  }
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export interface GlowHorizonRendererRuntime {
  readonly updateSettings: (settings: GlowHorizonBackgroundSettings) => void;
  readonly replay: () => void;
  readonly dispose: () => void;
}

export interface GlowHorizonVariantGeometry {
  readonly axis: "x" | "y";
  readonly enter: number;
  readonly rest: number;
}

export const GLOW_HORIZON_VARIANT_GEOMETRY: Readonly<Record<GlowHorizonVariant, GlowHorizonVariantGeometry>> = Object.freeze({
  top: { axis: "y", enter: -100, rest: -50 },
  bottom: { axis: "y", enter: 100, rest: 50 },
  left: { axis: "x", enter: 100, rest: 50 },
  right: { axis: "x", enter: -100, rest: -50 },
});

export function glowHorizonWithAlpha(color: string, alpha: number): string {
  const value = color.replace("#", "");
  const expanded = value.length === 3
    ? value.split("").map((character) => character + character).join("")
    : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return color;
  return `#${expanded}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0")}`;
}

export function glowHorizonClamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function glowHorizonEase(value: number): number {
  // Close to the source component's [0.16, 1, 0.3, 1] ease-out curve,
  // evaluated without pulling Framer Motion into the injected bundle.
  const t = glowHorizonClamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
}

export function glowHorizonNormalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

export function glowHorizonInsideControls(event: WheelEvent): boolean {
  if (event.target instanceof Element && event.target.closest("[data-glow-horizon-controls]")) return true;
  return event.composedPath().some((entry) => (
    entry instanceof Element && Boolean(entry.closest("[data-glow-horizon-controls]"))
  ));
}

export function glowHorizonElementVisible(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  return bounds.bottom > 0
    && bounds.top < window.innerHeight
    && bounds.right > 0
    && bounds.left < window.innerWidth;
}

export function startGlowHorizonRenderer(
  layer: HTMLElement,
  readSettings: () => GlowHorizonBackgroundSettings,
): GlowHorizonRendererRuntime {
  const horizon = layer.querySelector<HTMLElement>(".code-codex-glow-horizon-horizon");
  if (!horizon) throw new Error("Glow Horizon presentation is missing its horizon layer");
  const arcs = Array.from(horizon.querySelectorAll<HTMLElement>("[data-glow-horizon-arc]"));
  const trails = Array.from(horizon.querySelectorAll<HTMLElement>("[data-glow-horizon-trail]"));
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reducedMotionQuery.matches;
  let settings = normalizeGlowHorizonSettings(readSettings());
  let progress = reducedMotion ? 1 : 0;
  let velocity = 0;
  let springing = false;
  let openingActive = !reducedMotion;
  let springTarget = 1;
  let springMode: "up" | "return" = "return";
  let smoothingWheelUp = false;
  let openingStartedAt = performance.now();
  let lastFrameAt = openingStartedAt;
  let lastWheelAt = 0;
  let wheelVelocity = 0;
  let wheelTarget = progress;
  let wheelReleaseTimer: number | undefined;
  let animationFrame = 0;
  let running = true;

  // Keep the animation loop allocation-free. These specifications are static;
  // only their color and animated transform/opacity values change per frame.
  const arcSpecs = [
    { scale: 1.32, initialOffset: undefined, delay: 1.20, blur: 0 },
    { scale: 1.20, initialOffset: 10, delay: 0.60, blur: 31 },
    { scale: 1.24, initialOffset: 10, delay: 0, blur: 21 },
    { scale: 1.20, initialOffset: 10, delay: 0, blur: 51 },
  ] as const;
  const trailSpecs = [
    { distance: .20, opacity: .82, blur: .5, width: 2.5 },
    { distance: .45, opacity: .56, blur: 2, width: 3.5 },
    { distance: .72, opacity: .34, blur: 4, width: 5 },
    { distance: 1, opacity: .18, blur: 7, width: 7 },
  ] as const;
  const styleCache = new WeakMap<HTMLElement, Map<string, string>>();
  const setStyle = (element: HTMLElement, property: string, value: string): void => {
    let values = styleCache.get(element);
    if (!values) {
      values = new Map<string, string>();
      styleCache.set(element, values);
    }
    if (values.get(property) === value) return;
    values.set(property, value);
    element.style.setProperty(property, value);
  };

  const setAxisTransform = (element: HTMLElement, amount: number, scale: number): void => {
    const geometry = GLOW_HORIZON_VARIANT_GEOMETRY[settings.variant];
    const translate = geometry.axis === "x" ? `translateX(${amount}%)` : `translateY(${amount}%)`;
    const scaleTransform = geometry.axis === "x" ? `scaleX(${scale})` : `scaleY(${scale})`;
    setStyle(element, "transform", `${translate} ${scaleTransform}`);
  };

  const setAxisUniformTransform = (element: HTMLElement, amount: number, scale: number): void => {
    const geometry = GLOW_HORIZON_VARIANT_GEOMETRY[settings.variant];
    const translate = geometry.axis === "x" ? `translateX(${amount}%)` : `translateY(${amount}%)`;
    setStyle(element, "transform", `${translate} scale(${scale})`);
  };

  const render = (): void => {
    const geometry = GLOW_HORIZON_VARIANT_GEOMETRY[settings.variant];
    const clampedProgress = glowHorizonClamp(progress, 0, 1);
    const overscroll = glowHorizonClamp((progress - 1) / 0.2, 0, 1);
    const axisAmount = progress <= 1
      ? geometry.enter + (geometry.rest - geometry.enter) * progress
      : geometry.rest + Math.sign(geometry.rest - geometry.enter) * settings.wheelUpDistance * overscroll;
    const axisScale = settings.initialStretch + (1 - settings.initialStretch) * clampedProgress;
    setStyle(horizon, "opacity", String(clampedProgress));
    setStyle(horizon, "filter", `blur(${Math.max(0, settings.initialBlur * (1 - clampedProgress))}px)`);
    setStyle(horizon, "isolation", "isolate");
    setStyle(horizon, "will-change", "transform, opacity, filter");
    setAxisTransform(horizon, axisAmount, axisScale);

    const arcDirection = geometry.enter < 0 ? -1 : 1;
    for (let index = 0; index < arcs.length; index += 1) {
      const arc = arcs[index];
      const spec = arcSpecs[index];
      if (!arc || !spec) continue;
      // The source component staggers these layers against its fixed two-second
      // opening timeline. Keep that visual rhythm even when the user changes
      // the overall opening duration control.
      const delayProgress = Math.min(spec.delay / 2, .95);
      const arcProgress = glowHorizonClamp((progress - delayProgress) / Math.max(1 - delayProgress, .001), 0, 1);
      const startOffset = spec.initialOffset === undefined
        ? 0
        : arcDirection * Math.abs(spec.initialOffset - 50);
      const arcOffset = startOffset * (1 - arcProgress);
      const color = index === 0
        ? settings.rimColor
        : index === 1
          ? settings.violetColor
          : index === 2
            ? settings.blueColor
            : settings.shadowColor;
      const shadow = index === 0
        ? `0 -4px 23px ${glowHorizonWithAlpha(settings.rimColor, .71)}`
        : "";
      setStyle(arc, "background", color);
      setStyle(arc, "box-shadow", shadow);
      setStyle(arc, "filter", spec.blur > 0 ? `blur(${spec.blur}px)` : "");
      setStyle(arc, "will-change", "transform");
      setAxisUniformTransform(arc, arcOffset, spec.scale);
    }
    for (let index = 0; index < trails.length; index += 1) {
      const trail = trails[index];
      const spec = trailSpecs[index];
      if (!trail || !spec) continue;
      const amount = 1 - (1 - overscroll) ** 2;
      const direction = geometry.enter < 0 ? -1 : 1;
      const offset = direction * settings.wheelUpTrailDistance * spec.distance * amount;
      setStyle(trail, "opacity", String(overscroll > .0001
        ? glowHorizonClamp(Math.sqrt(overscroll) * settings.wheelUpTrailStrength * spec.opacity, 0, 1)
        : 0));
      setStyle(trail, "visibility", settings.inertialWheel && overscroll > .0001 ? "visible" : "hidden");
      setStyle(trail, "border", `${spec.width}px solid ${glowHorizonWithAlpha(settings.violetColor, .92)}`);
      setStyle(trail, "box-shadow", `0 0 ${14 + spec.blur * 3}px ${glowHorizonWithAlpha(settings.violetColor, .82)}, inset 0 0 ${10 + spec.blur * 2}px ${glowHorizonWithAlpha(settings.violetColor, .58)}`);
      setStyle(trail, "filter", `blur(${spec.blur}px)`);
      setStyle(trail, "will-change", "transform, opacity");
      setAxisUniformTransform(trail, offset, 1.32);
    }
  };

  const schedule = (): void => {
    if (!running || animationFrame) return;
    animationFrame = requestBackgroundFrame(horizon, tick);
  };

  const finishWheel = (): void => {
    if (!running) return;
    // Framer Motion carries the gesture velocity into the release spring. Keep
    // the same behavior for a downward rewind; otherwise the horizon stops
    // dead and the return feels like a snap instead of an inertial release.
    const releaseVelocity = smoothingWheelUp
      ? velocity
      : glowHorizonClamp(wheelVelocity, -settings.maxReleaseVelocity, settings.maxReleaseVelocity);
    springTarget = 1;
    springMode = "return";
    velocity = releaseVelocity;
    springing = true;
    schedule();
  };

  const handleWheel = (event: WheelEvent): void => {
    if (!running || reducedMotion || !settings.inertialWheel || glowHorizonInsideControls(event)) return;
    const host = horizon.parentElement;
    if (!host || !glowHorizonElementVisible(host)) return;
    const pixelDelta = glowHorizonNormalizeWheelDelta(event);
    if (Math.abs(pixelDelta) < .01) return;
    const now = performance.now();
    const elapsed = lastWheelAt ? Math.max((now - lastWheelAt) / 1000, 1 / 120) : 1 / 60;
    const travel = Math.min(960, Math.max(560, window.innerHeight * 1.05)) * settings.wheelTravelScale;
    const rawDelta = (-pixelDelta / Math.max(1, travel)) * settings.wheelSensitivity;
    const upward = rawDelta > 0;
    const delta = rawDelta * (upward ? settings.wheelUpIntensity : settings.wheelDownIntensity);
    if (Math.abs(delta) < .000001) return;
    const inputVelocity = delta / elapsed;
    const freshGesture = now - lastWheelAt > settings.wheelReleaseDelay * 2;
    const blended = freshGesture ? velocity * .2 + inputVelocity * .8 : wheelVelocity * .55 + inputVelocity * .45;
    wheelVelocity = glowHorizonClamp(blended, -settings.maxReleaseVelocity, settings.maxReleaseVelocity);
    openingActive = false;
    smoothingWheelUp = upward;
    if (upward) {
      const base = freshGesture ? progress : wheelTarget;
      springTarget = glowHorizonClamp(base + delta, 0, 1.2);
      velocity = glowHorizonClamp(velocity, -settings.maxReleaseVelocity, settings.maxReleaseVelocity);
      springMode = "up";
      springing = true;
    } else {
      const lower = Math.min(progress, 1 - glowHorizonClamp(settings.wheelDownDistance, 0, 100) / 100);
      progress = glowHorizonClamp(progress + delta, lower, 1.2);
      springTarget = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
    }
    wheelTarget = upward ? springTarget : progress;
    lastWheelAt = now;
    if (wheelReleaseTimer !== undefined) window.clearTimeout(wheelReleaseTimer);
    wheelReleaseTimer = window.setTimeout(finishWheel, upward ? settings.wheelUpReleaseDelay : settings.wheelReleaseDelay);
    // Wheel/trackpad events can arrive several times between two display
    // frames. Keep every physics update, but commit the resulting styles only
    // once in the scheduled animation frame.
    schedule();
  };

  function tick(now: number): void {
    animationFrame = 0;
    if (!running) return;
    const dt = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    if (!reducedMotion) {
      if (openingActive && !springing && progress < 1) {
        const openingProgress = glowHorizonClamp((now - openingStartedAt) / (Math.max(.05, settings.openingDuration) * 1000), 0, 1);
        const nextProgress = glowHorizonEase(openingProgress);
        velocity = dt > 0 ? (nextProgress - progress) / dt : 0;
        progress = nextProgress;
        if (openingProgress >= 1) {
          openingActive = false;
          springTarget = 1;
          springMode = "return";
        }
      } else if (springing) {
        const stiffness = springMode === "up" ? settings.wheelUpStiffness : settings.returnStiffness;
        const damping = springMode === "up" ? settings.wheelUpDamping : settings.returnDamping;
        const acceleration = (springTarget - progress) * stiffness - velocity * damping;
        velocity += acceleration * dt;
        progress += velocity * dt;
        if (Math.abs(springTarget - progress) < .0008 && Math.abs(velocity) < .004) {
          progress = springTarget;
          velocity = 0;
          springing = false;
        }
      }
    } else {
      progress = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      openingActive = false;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    }
    render();
    // A downward rewind can intentionally leave progress below 1 while the
    // release timer is waiting. Do not spin an idle RAF loop in that state;
    // the timer will schedule the return spring when input ends.
    if (running && (openingActive || springing)) schedule();
  }

  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      progress = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      openingActive = false;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    } else {
      openingStartedAt = performance.now();
      progress = 0;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      openingActive = true;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    }
    render();
    schedule();
  };

  window.addEventListener("wheel", handleWheel, { passive: true });
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);
  const updateSettings = (next: GlowHorizonBackgroundSettings): void => {
    settings = normalizeGlowHorizonSettings(next);
    render();
    schedule();
  };
  const replay = (): void => {
    if (reducedMotion) {
      progress = 1;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      wheelVelocity = 0;
      lastWheelAt = 0;
      openingActive = false;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
    } else {
      progress = 0;
      velocity = 0;
      springing = false;
      smoothingWheelUp = false;
      wheelVelocity = 0;
      lastWheelAt = 0;
      openingActive = true;
      springTarget = 1;
      springMode = "return";
      wheelTarget = 1;
      openingStartedAt = performance.now();
      lastFrameAt = openingStartedAt;
    }
    render();
    schedule();
  };
  const dispose = (): void => {
    if (!running) return;
    running = false;
    if (animationFrame) cancelBackgroundFrame(animationFrame);
    animationFrame = 0;
    if (wheelReleaseTimer !== undefined) window.clearTimeout(wheelReleaseTimer);
    window.removeEventListener("wheel", handleWheel);
    reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
  };
  render();
  schedule();
  return { updateSettings, replay, dispose };
}

export class GlowHorizonRenderer {
  readonly #runtime: GlowHorizonRendererRuntime;
  #settings: GlowHorizonBackgroundSettings;

  constructor(layer: HTMLElement, settings: GlowHorizonBackgroundSettings) {
    this.#settings = normalizeGlowHorizonSettings(settings);
    this.#runtime = startGlowHorizonRenderer(layer, () => this.#settings);
  }

  updateSettings(settings: GlowHorizonBackgroundSettings): void {
    this.#settings = normalizeGlowHorizonSettings(settings);
    this.#runtime.updateSettings(this.#settings);
  }

  replay(): void {
    this.#runtime.replay();
  }

  dispose(): void {
    this.#runtime.dispose();
  }
}

export const HEAVENLY_CLOUD_VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export function createHeavenlyCloudFragmentShader(stepCount: number): string {
  return `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform float uTurbulence;
uniform float uRadius;
uniform float uColorShift;
uniform float uPointerInfluence;
uniform float uIntro;
uniform float uIntroFeather;

#define MAX_STEPS ${stepCount}

void main() {
  const vec3 turbulencePhase = vec3(0.0, 0.35, 0.7);
  const vec3 spectrumPhaseCos = vec3(0.960170269, 0.540302277, -0.416146845);
  const vec3 spectrumPhaseSin = vec3(-0.279415488, 0.841470957, 0.909297407);
  vec2 screenPlane = vUv * 2.0 - 1.0;
  screenPlane.x *= uResolution.x / uResolution.y;
  float screenRadius = length(screenPlane);

  float intro = clamp(uIntro, 0.0, 1.0);
  float easedIntro = 1.0 - pow(1.0 - intro, 3.0);
  vec2 plane = screenPlane * mix(0.34, 1.0, easedIntro);
  plane += uPointer * (0.09 * uPointerInfluence);

  vec3 ray = normalize(vec3(plane, mix(-1.55, -1.0, easedIntro)));
  vec3 radiance = vec3(0.0);
  float depth = 0.0;
  float timeOffset = uTime * uSpeed;

  for (int step = 0; step < MAX_STEPS; step++) {
    vec3 point = depth * ray;
    point.z -= timeOffset;

    float depthWarp = depth * 0.2;
    point += cos(point.yzx + depthWarp + turbulencePhase) * uTurbulence;
    point += cos(point.yzx * 1.42857146 + depthWarp + turbulencePhase)
      * (uTurbulence / 1.42857146);
    point += cos(point.yzx * 2.04081631 + depthWarp + turbulencePhase)
      * (uTurbulence / 2.04081631);
    point += cos(point.yzx * 2.91545200 + depthWarp + turbulencePhase)
      * (uTurbulence / 2.91545200);
    point += cos(point.yzx * 4.16493130 + depthWarp + turbulencePhase)
      * (uTurbulence / 4.16493130);
    point += cos(point.yzx * 5.94990206 + depthWarp + turbulencePhase)
      * (uTurbulence / 5.94990206);
    point += cos(point.yzx * 8.49985981 + depthWarp + turbulencePhase)
      * (uTurbulence / 8.49985981);

    float distanceToShell = abs(uRadius - length(point.xy));
    float stepDistance = 0.02 + 0.1 * distanceToShell;
    depth += stepDistance;

    float spectrumPhase = depth + uColorShift;
    float spectrumCosine = cos(spectrumPhase);
    float spectrumSine = sin(spectrumPhase);
    vec3 spectrum = 0.5 + 0.5 * (
      spectrumCosine * spectrumPhaseCos
      - spectrumSine * spectrumPhaseSin
    );
    radiance += spectrum * (uIntensity / (1500.0 * stepDistance));
  }

  vec3 color = 1.0 - exp(-radiance * 1.35);
  color = pow(color, vec3(0.82));
  float vignette = 1.0 - smoothstep(0.52, 1.72, screenRadius);
  color *= 0.72 + 0.28 * vignette;
  color += vec3(0.006, 0.012, 0.022);

  float edgeFeather = max(uIntroFeather, 0.002);
  float revealRadius = mix(0.06, 2.25 + edgeFeather * 0.5, easedIntro);
  float aperture = 1.0 - smoothstep(
    revealRadius - edgeFeather * 0.5,
    revealRadius + edgeFeather * 0.5,
    screenRadius
  );
  float lightRise = smoothstep(0.0, 0.72, easedIntro);
  float openingWave = exp(-abs(screenRadius - revealRadius * 0.91) * 24.0)
    * sin(intro * 3.14159265);
  color = mix(vec3(0.0015, 0.003, 0.007), color, aperture * lightRise);
  color += openingWave * vec3(0.018, 0.05, 0.065);

  gl_FragColor = vec4(color, 1.0);
}
`;
}

export interface HeavenlyCloudRendererRuntime {
  readonly invalidate: (replay?: boolean) => void;
  readonly dispose: () => void;
}

export function startHeavenlyCloudRenderer(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  readSettings: () => HeavenlyCloudBackgroundSettings,
  onError: (message?: string) => void,
): HeavenlyCloudRendererRuntime {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL is unavailable for Heavenly Cloud Background");

  let program: WebGLProgram | undefined;
  let vertexShader: WebGLShader | undefined;
  let fragmentShader: WebGLShader | undefined;
  let buffer: WebGLBuffer | undefined;
  let uniforms: Readonly<Record<
    "resolution" | "pointer" | "time" | "speed" | "intensity" | "turbulence" | "radius"
      | "colorShift" | "pointerInfluence" | "intro" | "introFeather",
    WebGLUniformLocation
  >> | undefined;
  let animationFrame = 0;
  let running = true;
  let contextReady = true;
  let documentVisible = !document.hidden;
  let resizePending = true;
  let settingsDirty = true;
  let elapsed = 0;
  let introProgress = 0;
  let lastFrame = 0;
  let hostBounds = host.getBoundingClientRect();
  let uploadedResolutionWidth = -1;
  let uploadedResolutionHeight = -1;
  let uploadedPointerX = Number.NaN;
  let uploadedPointerY = Number.NaN;
  let uploadedIntro = Number.NaN;
  const pointerTarget = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("The Heavenly Cloud shader could not be allocated");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Heavenly Cloud shader compilation failed";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };

  const requiredUniform = (name: string): WebGLUniformLocation => {
    if (!program) throw new Error("The Heavenly Cloud shader program is unavailable");
    const location = gl.getUniformLocation(program, name);
    if (location === null) throw new Error(`Missing Heavenly Cloud shader uniform: ${name}`);
    return location;
  };

  const destroyGpuResources = (): void => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    buffer = undefined;
    program = undefined;
    vertexShader = undefined;
    fragmentShader = undefined;
    uniforms = undefined;
  };

  const build = (): void => {
    destroyGpuResources();
    const settings = readSettings();
    vertexShader = compile(gl.VERTEX_SHADER, HEAVENLY_CLOUD_VERTEX_SHADER);
    fragmentShader = compile(
      gl.FRAGMENT_SHADER,
      createHeavenlyCloudFragmentShader(HEAVENLY_CLOUD_QUALITY[settings.quality].steps),
    );
    program = gl.createProgram() ?? undefined;
    if (!program) throw new Error("The Heavenly Cloud shader program could not be allocated");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Heavenly Cloud shader linking failed");
    }
    buffer = gl.createBuffer() ?? undefined;
    if (!buffer) throw new Error("The Heavenly Cloud geometry buffer could not be allocated");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    if (position < 0) throw new Error("The Heavenly Cloud position attribute is unavailable");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = {
      resolution: requiredUniform("uResolution"),
      pointer: requiredUniform("uPointer"),
      time: requiredUniform("uTime"),
      speed: requiredUniform("uSpeed"),
      intensity: requiredUniform("uIntensity"),
      turbulence: requiredUniform("uTurbulence"),
      radius: requiredUniform("uRadius"),
      colorShift: requiredUniform("uColorShift"),
      pointerInfluence: requiredUniform("uPointerInfluence"),
      intro: requiredUniform("uIntro"),
      introFeather: requiredUniform("uIntroFeather"),
    };
    uploadedResolutionWidth = -1;
    uploadedResolutionHeight = -1;
    uploadedPointerX = Number.NaN;
    uploadedPointerY = Number.NaN;
    uploadedIntro = Number.NaN;
    settingsDirty = true;
  };

  const resize = (): void => {
    resizePending = false;
    const quality = HEAVENLY_CLOUD_QUALITY[readSettings().quality];
    const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
    const width = Math.max(1, Math.round(hostBounds.width * dpr * quality.resolutionScale));
    const height = Math.max(1, Math.round(hostBounds.height * dpr * quality.resolutionScale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    if (uniforms && (uploadedResolutionWidth !== width || uploadedResolutionHeight !== height)) {
      gl.uniform2f(uniforms.resolution, width, height);
      uploadedResolutionWidth = width;
      uploadedResolutionHeight = height;
    }
  };

  const stopLoop = (): void => {
    if (animationFrame) cancelBackgroundFrame(animationFrame);
    animationFrame = 0;
  };

  const schedule = (): void => {
    if (!animationFrame && running && contextReady && documentVisible) {
      animationFrame = requestBackgroundFrame(canvas, draw);
    }
  };

  const draw = (now: number): void => {
    animationFrame = 0;
    if (!running || !contextReady || !documentVisible || !program || !uniforms) return;
    if (resizePending) resize();
    const settings = readSettings();
    const reduced = reducedMotion.matches;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    if (!settings.paused && !reduced) elapsed += delta;
    if (!reduced) introProgress = Math.min(1, introProgress + delta / Math.max(settings.introDuration, 0.1));
    else introProgress = 1;
    pointer.x += (pointerTarget.x - pointer.x) * 0.075;
    pointer.y += (pointerTarget.y - pointer.y) * 0.075;
    const pointerMoving = Math.abs(pointerTarget.x - pointer.x) + Math.abs(pointerTarget.y - pointer.y) > 0.0005;

    if (pointer.x !== uploadedPointerX || pointer.y !== uploadedPointerY) {
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
      uploadedPointerX = pointer.x;
      uploadedPointerY = pointer.y;
    }
    gl.uniform1f(uniforms.time, reduced ? 5.8 : elapsed);
    if (settingsDirty) {
      gl.uniform1f(uniforms.speed, settings.speed);
      gl.uniform1f(uniforms.intensity, settings.intensity);
      gl.uniform1f(uniforms.turbulence, settings.turbulence);
      gl.uniform1f(uniforms.radius, settings.radius);
      gl.uniform1f(uniforms.colorShift, settings.colorShift);
      gl.uniform1f(uniforms.pointerInfluence, reduced ? 0 : settings.pointerInfluence);
      gl.uniform1f(uniforms.introFeather, Math.max(settings.introFeather, 0.002));
      settingsDirty = false;
    }
    if (introProgress !== uploadedIntro) {
      gl.uniform1f(uniforms.intro, introProgress);
      uploadedIntro = introProgress;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if ((!settings.paused && !reduced) || introProgress < 1 || pointerMoving) schedule();
    else lastFrame = 0;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (hostBounds.width <= 0 || hostBounds.height <= 0) return;
    pointerTarget.x = ((event.clientX - hostBounds.left) / hostBounds.width) * 2 - 1;
    pointerTarget.y = 1 - ((event.clientY - hostBounds.top) / hostBounds.height) * 2;
    schedule();
  };
  const onPointerLeave = (): void => {
    pointerTarget.x = 0;
    pointerTarget.y = 0;
    schedule();
  };
  const onVisibilityChange = (): void => {
    documentVisible = !document.hidden;
    lastFrame = 0;
    if (documentVisible) schedule();
    else stopLoop();
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextReady = false;
    stopLoop();
    onError("The Heavenly Cloud graphics context was lost; waiting for recovery.");
  };
  const onContextRestored = (): void => {
    try {
      contextReady = true;
      build();
      resizePending = true;
      lastFrame = 0;
      onError(undefined);
      schedule();
    } catch (error) {
      contextReady = false;
      onError(error instanceof Error ? error.message : "The Heavenly Cloud graphics context could not be restored");
    }
  };
  const onReducedMotionChange = (): void => {
    settingsDirty = true;
    lastFrame = 0;
    schedule();
  };
  const resizeObserver = new ResizeObserver(() => {
    hostBounds = host.getBoundingClientRect();
    resizePending = true;
    schedule();
  });

  build();
  resizeObserver.observe(host);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  reducedMotion.addEventListener("change", onReducedMotionChange);
  schedule();

  return {
    invalidate: (replay = false): void => {
      if (!running) return;
      settingsDirty = true;
      resizePending = true;
      if (replay) {
        introProgress = 0;
        elapsed = 0;
      }
      lastFrame = 0;
      schedule();
    },
    dispose: (): void => {
      if (!running) return;
      running = false;
      stopLoop();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      reducedMotion.removeEventListener("change", onReducedMotionChange);
      destroyGpuResources();
    },
  };
}

export class HeavenlyCloudRenderer {
  #settings: HeavenlyCloudBackgroundSettings;
  readonly #runtime: HeavenlyCloudRendererRuntime;

  constructor(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    settings: HeavenlyCloudBackgroundSettings,
    onError: (message?: string) => void,
  ) {
    this.#settings = normalizeHeavenlyCloudSettings(settings);
    this.#runtime = startHeavenlyCloudRenderer(host, canvas, () => this.#settings, onError);
  }

  setSettings(settings: HeavenlyCloudBackgroundSettings): void {
    this.#settings = normalizeHeavenlyCloudSettings(settings);
    this.#runtime.invalidate();
  }

  replay(): void { this.#runtime.invalidate(true); }
  dispose(): void { this.#runtime.dispose(); }
}

export const AURORA_IONOSPHERE_VERTEX_SHADER = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

export const AURORA_IONOSPHERE_NOISE_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uNoiseDomainMin;
uniform vec2 uNoiseDomainSize;
uniform vec2 uFlowRotation;
uniform float uNoiseScale;
uniform float uNoiseTurbulence;

mat2 rotateNoiseDomain(float angle) {
  float angle2 = angle * angle;
  float c = 1.0 - angle2 * (0.5 - angle2 * 0.041666667);
  float s = angle * (1.0 - angle2 * (0.166666667 - angle2 * 0.008333333));
  return mat2(c, s, -s, c);
}
float tri(float x) { return clamp(abs(fract(x) - 0.5), 0.01, 0.49); }
vec2 tri2(vec2 p) { return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x))); }
float triNoise2d(vec2 p, mat2 flowRotation) {
  float rz = 0.0;
  p *= uNoiseScale;
  p = p * rotateNoiseDomain(p.x * 0.06);
  vec2 bp = p;
  vec2 dg = tri2(bp * 1.85) * 0.75 * flowRotation;
  p -= dg * 0.4 * uNoiseTurbulence;
  p *= 1.21 + (rz - 1.0) * 0.02;
  rz += tri(p.x + tri(p.y)) * 0.756;
  p = p * mat2(-1.0, 0.0, 0.0, -1.0);
  dg = tri2(bp * 2.405) * 0.75 * flowRotation;
  p -= dg * 0.888888889 * uNoiseTurbulence;
  p *= 1.21 + (rz - 1.0) * 0.02;
  rz += tri(p.x + tri(p.y)) * 0.31752;
  p = p * mat2(0.757322769, -0.653040752, 0.653040752, 0.757322769);
  dg = tri2(bp * 3.1265) * 0.75 * flowRotation;
  p -= dg * 1.97530864 * uNoiseTurbulence;
  p *= 1.21 + (rz - 1.0) * 0.02;
  rz += tri(p.x + tri(p.y)) * 0.1333584;
  p = p * mat2(-0.147075554, 0.989125261, -0.989125261, -0.147075554);
  dg = tri2(bp * 4.06445) * 0.75 * flowRotation;
  p -= dg * 4.38957476 * uNoiseTurbulence;
  p *= 1.21 + (rz - 1.0) * 0.02;
  rz += tri(p.x + tri(p.y)) * 0.056010528;
  p = p * mat2(-0.534555438, -0.845133412, 0.845133412, -0.534555438);
  dg = tri2(bp * 5.283785) * 0.75 * flowRotation;
  p -= dg * 9.75461058 * uNoiseTurbulence;
  p *= 1.21 + (rz - 1.0) * 0.02;
  rz += tri(p.x + tri(p.y)) * 0.0235244218;
  return clamp(1.0 / pow(max(rz * 29.0, 0.0001), 1.3), 0.0, 0.55);
}
void main() {
  vec2 atlasUv = gl_FragCoord.xy / uResolution;
  vec2 worldPosition = uNoiseDomainMin + atlasUv * uNoiseDomainSize;
  mat2 flowRotation = mat2(uFlowRotation.x, uFlowRotation.y, -uFlowRotation.y, uFlowRotation.x);
  float density = triNoise2d(worldPosition, flowRotation);
  gl_FragColor = vec4(density, density, density, 1.0);
}
`;

export function createAuroraIonosphereFieldShader(stepCount: number): string {
  return `
precision highp float;
#define AURORA_STEPS ${stepCount}
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uGlow;
uniform float uIntro;
uniform float uIntroFeather;
uniform float uIntroStart;
uniform float uIntroEnd;
uniform sampler2D uLayerLut;
uniform float uLayerLutStep;
uniform sampler2D uNoiseAtlas;
uniform vec2 uNoiseDomainMin;
uniform vec2 uNoiseDomainInverseSize;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 4.1414))) * 43758.5453); }
float decode16(vec2 encoded) { return dot(encoded, vec2(65280.0, 255.0)) / 65535.0; }
void sampleAuroraLayer(vec3 ro, vec3 rd, float inverseRayHeight, float pixelJitter,
  float planeHeight, float jitterAmount, vec3 spectralColor, float layerWeight,
  inout vec4 color, inout vec4 averageColor) {
  float planeDistance = (planeHeight - ro.y) * inverseRayHeight - pixelJitter * jitterAmount;
  vec3 position = ro + planeDistance * rd;
  vec2 noiseUv = (position.zx - uNoiseDomainMin) * uNoiseDomainInverseSize;
  float density = texture2D(uNoiseAtlas, noiseUv).r;
  vec4 layerColor = vec4(spectralColor * density, density);
  averageColor = mix(averageColor, layerColor, 0.5);
  color += averageColor * layerWeight;
}
vec4 aurora(vec3 ro, vec3 rd) {
  vec4 color = vec4(0.0);
  vec4 averageColor = vec4(0.0);
  float pixelJitter = 0.006 * hash21(gl_FragCoord.xy);
  float inverseRayHeight = 1.0 / (rd.y * 2.0 + 0.4);
  for (int index = 0; index < AURORA_STEPS; index++) {
    float lookupX = (float(index) + 0.5) * uLayerLutStep;
    vec4 spectralAndWeightHigh = texture2D(uLayerLut, vec2(lookupX, 0.25));
    vec4 geometryAndWeightLow = texture2D(uLayerLut, vec2(lookupX, 0.75));
    sampleAuroraLayer(ro, rd, inverseRayHeight, pixelJitter,
      decode16(geometryAndWeightLow.rg) * 1.6, geometryAndWeightLow.b,
      spectralAndWeightHigh.rgb,
      decode16(vec2(spectralAndWeightHigh.a, geometryAndWeightLow.a)) * 0.15,
      color, averageColor);
  }
  color *= clamp(rd.y * 15.0 + 0.4, 0.0, 1.0);
  color.rgb *= uIntensity * mix(0.55, 1.175, uGlow);
  color.a *= clamp(uIntensity, 0.0, 2.0);
  return color * 1.8;
}
void main() {
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec2 p = vec2(screenUv.x - 0.5, screenUv.y * 0.55 + 0.015);
  p.x *= uResolution.x / uResolution.y;
  vec3 ro = vec3(0.0, 0.0, -6.7);
  vec3 rd = normalize(vec3(p, 1.3));
  float curtainProgress = smoothstep(0.06, 0.94, uIntro);
  float revealEdge = mix(uIntroStart, uIntroEnd, curtainProgress);
  float revealFeather = max(0.001, uIntroFeather);
  float curtainReveal = 1.0 - smoothstep(revealEdge - revealFeather, revealEdge + revealFeather, screenUv.y);
  curtainReveal = mix(curtainReveal, 1.0, smoothstep(0.92, 1.0, uIntro));
  float curtainIgnition = smoothstep(0.02, 0.22, uIntro);
  float horizonFade = smoothstep(0.0, 0.01, abs(rd.y)) * 0.1 + 0.9;
  vec4 field = smoothstep(vec4(0.0), vec4(1.5), aurora(ro, rd))
    * horizonFade * curtainReveal * curtainIgnition;
  gl_FragColor = field;
}
`;
}

export const AURORA_IONOSPHERE_COMPOSITE_SHADER = `
precision highp float;
#define STAR_LAYERS 4
uniform vec2 uResolution;
uniform float uStarResolution;
uniform float uStarDensity;
uniform float uIntro;
uniform float uIntroSkyEnd;
uniform float uIntroStarStart;
uniform sampler2D uAuroraTexture;
uniform mat3 uAuroraColor;
uniform vec2 uAuroraUvScale;
uniform vec2 uAuroraUvOffset;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p.zxy, p.yxz + 19.27);
  return fract(vec3(p.x * p.y, p.z * p.x, p.y * p.z));
}
vec3 stars(vec3 p) {
  if (uStarDensity <= 0.0) return vec3(0.0);
  vec3 color = vec3(0.0);
  float densityScale = 1.51 * uStarDensity;
  vec3 starPoint = p * (0.15 * uStarResolution);
  for (int index = 0; index < STAR_LAYERS; index++) {
    float fi = float(index);
    vec3 q = fract(starPoint) - 0.5;
    vec3 id = floor(starPoint);
    vec2 random = hash33(id).xy;
    float star = 1.0 - smoothstep(0.0, 0.6, length(q));
    star *= step(random.x, (0.0005 + fi * fi * 0.001) * densityScale);
    vec3 tint = mix(vec3(1.0, 0.49, 0.1), vec3(0.75, 0.9, 1.0), random.y);
    color += star * (tint * 0.1 + 0.9);
    starPoint *= 1.3;
  }
  return color * color * 0.8;
}
vec3 sky(vec3 rd) {
  float sunDisk = dot(normalize(vec3(-0.5, -0.6, 0.9)), rd) * 0.5 + 0.5;
  float sunDisk2 = sunDisk * sunDisk;
  sunDisk = sunDisk2 * sunDisk2 * sunDisk;
  vec3 color = mix(vec3(0.05, 0.1, 0.2), vec3(0.1, 0.05, 0.2), rd.y * 0.5 + 0.5);
  color += sunDisk * vec3(1.0, 0.9, 0.7) * 0.63;
  return color * 0.63;
}
void main() {
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec2 p = vec2(screenUv.x - 0.5, screenUv.y * 0.55 + 0.015);
  p.x *= uResolution.x / uResolution.y;
  vec3 rd = normalize(vec3(p, 1.3));
  float horizonFade = smoothstep(0.0, 0.01, abs(rd.y)) * 0.1 + 0.9;
  float skyIntro = smoothstep(0.0, max(0.001, uIntroSkyEnd), uIntro);
  float starIntro = smoothstep(uIntroStarStart, min(1.0, uIntroStarStart + 0.56), uIntro);
  vec3 color = sky(rd) * horizonFade * skyIntro;
  vec4 field = texture2D(uAuroraTexture, uAuroraUvOffset + screenUv * uAuroraUvScale);
  color += stars(rd) * starIntro;
  color = color * (1.0 - field.a) + max(vec3(0.0), uAuroraColor * field.rgb);
  gl_FragColor = vec4(color, 1.0);
}
`;

export interface AuroraIonosphereNoiseDomain {
  readonly minX: number;
  readonly minY: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

export function auroraIonosphereSmoothstep(edge0: number, edge1: number, value: number): number {
  const amount = Math.min(1, Math.max(0, (value - edge0) / Math.max(0.000001, edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

export function auroraIonosphereWritePacked16(data: Uint8Array, highIndex: number, lowIndex: number, value: number): void {
  const packed = Math.round(Math.min(1, Math.max(0, value)) * 65535);
  data[highIndex] = packed >> 8;
  data[lowIndex] = packed & 255;
}

export function calculateAuroraIonosphereNoiseDomain(width: number, height: number, steps: number): AuroraIonosphereNoiseDomain {
  const aspect = width / Math.max(1, height);
  const planeHeights = [0.8, 0.8 + Math.pow(steps - 1, 1.4) * 0.002];
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  for (let yIndex = 0; yIndex <= 16; yIndex += 1) {
    const pY = (yIndex / 16) * 0.55 + 0.015;
    for (let xIndex = 0; xIndex <= 16; xIndex += 1) {
      const pX = (xIndex / 16 - 0.5) * aspect;
      const length = Math.hypot(pX, pY, 1.3);
      const directionX = pX / length;
      const directionY = pY / length;
      const directionZ = 1.3 / length;
      const inverseRayHeight = 1 / (directionY * 2 + 0.4);
      for (const planeHeight of planeHeights) {
        for (const jitterDistance of [0, 0.006]) {
          const distance = planeHeight * inverseRayHeight - jitterDistance;
          const worldX = distance * directionX;
          const worldZ = -6.7 + distance * directionZ;
          minimumZ = Math.min(minimumZ, worldZ);
          maximumZ = Math.max(maximumZ, worldZ);
          minimumX = Math.min(minimumX, worldX);
          maximumX = Math.max(maximumX, worldX);
        }
      }
    }
  }
  const zPadding = Math.max(0.08, (maximumZ - minimumZ) * 0.035);
  const xPadding = Math.max(0.08, (maximumX - minimumX) * 0.035);
  return {
    minX: minimumZ - zPadding,
    minY: minimumX - xPadding,
    sizeX: maximumZ - minimumZ + zPadding * 2,
    sizeY: maximumX - minimumX + xPadding * 2,
  };
}

export class AuroraIonosphereRenderer {
  #settings: AuroraIonosphereBackgroundSettings;
  readonly #gl: WebGLRenderingContext;
  readonly #host: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #onError: (message?: string) => void;
  #noiseProgram!: WebGLProgram;
  #fieldProgram!: WebGLProgram;
  #compositeProgram!: WebGLProgram;
  #buffer!: WebGLBuffer;
  #layerTexture!: WebGLTexture;
  #noiseTexture!: WebGLTexture;
  #fieldTexture!: WebGLTexture;
  #noiseFramebuffer!: WebGLFramebuffer;
  #fieldFramebuffer!: WebGLFramebuffer;
  #noiseUniforms!: Readonly<Record<"resolution" | "domainMin" | "domainSize" | "flowRotation" | "scale" | "turbulence", WebGLUniformLocation>>;
  #fieldUniforms!: Readonly<Record<"resolution" | "intensity" | "glow" | "intro" | "introFeather" | "introStart" | "introEnd" | "layerLut" | "layerLutStep" | "noiseAtlas" | "domainMin" | "inverseDomainSize", WebGLUniformLocation>>;
  #compositeUniforms!: Readonly<Record<"resolution" | "starResolution" | "starDensity" | "intro" | "introSkyEnd" | "introStarStart" | "fieldTexture" | "color" | "uvScale" | "uvOffset", WebGLUniformLocation>>;
  #animationFrame = 0;
  #running = true;
  #contextReady = true;
  #documentVisible = !document.hidden;
  #resizePending = true;
  #settingsDirty = true;
  #elapsed = 0;
  #introProgress = 0;
  #lastFrame = 0;
  #hostBounds: DOMRect;
  #rayTextureWidth = 1;
  #rayTextureHeight = 1;
  #rayWidth = 1;
  #rayHeight = 1;
  #atlasWidth = 1;
  #atlasHeight = 1;
  #starResolution = 1;
  #noiseDomain: AuroraIonosphereNoiseDomain;
  #adaptiveScale = 1;
  #sampleDuration = 0;
  #sampledFrames = 0;
  readonly #uvScale = { x: 0, y: 0 };
  readonly #uvOffset = { x: 0.5, y: 0.5 };
  readonly #reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #resizeObserver: ResizeObserver;

  constructor(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    settings: AuroraIonosphereBackgroundSettings,
    onError: (message?: string) => void,
  ) {
    this.#host = host;
    this.#canvas = canvas;
    this.#settings = normalizeAuroraIonosphereSettings(settings);
    this.#onError = onError;
    this.#hostBounds = host.getBoundingClientRect();
    this.#noiseDomain = calculateAuroraIonosphereNoiseDomain(1, 1, AURORA_IONOSPHERE_QUALITY[this.#settings.quality].steps);
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL is unavailable for Aurora Ionosphere Background");
    this.#gl = gl;
    this.#build();
    this.#resizeObserver = new ResizeObserver(() => {
      this.#hostBounds = this.#host.getBoundingClientRect();
      this.#resizePending = true;
      this.#schedule();
    });
    this.#resizeObserver.observe(host);
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    canvas.addEventListener("webglcontextlost", this.#onContextLost);
    canvas.addEventListener("webglcontextrestored", this.#onContextRestored);
    this.#reducedMotion.addEventListener("change", this.#onReducedMotionChange);
    this.#schedule();
  }

  setSettings(settings: AuroraIonosphereBackgroundSettings): void {
    const next = normalizeAuroraIonosphereSettings(settings);
    if (next.quality !== this.#settings.quality) {
      this.#settings = next;
      this.#build();
      this.#adaptiveScale = 1;
      this.#resizePending = true;
    } else {
      this.#settings = next;
      this.#settingsDirty = true;
    }
    this.#schedule();
  }

  replay(): void {
    this.#introProgress = 0;
    this.#elapsed = 0;
    this.#lastFrame = 0;
    this.#schedule();
  }

  dispose(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#stopLoop();
    this.#resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
    this.#canvas.removeEventListener("webglcontextlost", this.#onContextLost);
    this.#canvas.removeEventListener("webglcontextrestored", this.#onContextRestored);
    this.#reducedMotion.removeEventListener("change", this.#onReducedMotionChange);
    this.#destroyGpuResources();
  }

  #compile(type: number, source: string): WebGLShader {
    const shader = this.#gl.createShader(type);
    if (!shader) throw new Error("The Aurora Ionosphere shader could not be allocated");
    this.#gl.shaderSource(shader, source);
    this.#gl.compileShader(shader);
    if (!this.#gl.getShaderParameter(shader, this.#gl.COMPILE_STATUS)) {
      const message = this.#gl.getShaderInfoLog(shader) || "Aurora Ionosphere shader compilation failed";
      this.#gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  #link(fragmentSource: string): WebGLProgram {
    const vertex = this.#compile(this.#gl.VERTEX_SHADER, AURORA_IONOSPHERE_VERTEX_SHADER);
    const fragment = this.#compile(this.#gl.FRAGMENT_SHADER, fragmentSource);
    const program = this.#gl.createProgram();
    if (!program) throw new Error("The Aurora Ionosphere shader program could not be allocated");
    this.#gl.attachShader(program, vertex);
    this.#gl.attachShader(program, fragment);
    this.#gl.linkProgram(program);
    this.#gl.deleteShader(vertex);
    this.#gl.deleteShader(fragment);
    if (!this.#gl.getProgramParameter(program, this.#gl.LINK_STATUS)) {
      const message = this.#gl.getProgramInfoLog(program) || "Aurora Ionosphere shader linking failed";
      this.#gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  #requiredUniform(program: WebGLProgram, name: string): WebGLUniformLocation {
    const location = this.#gl.getUniformLocation(program, name);
    if (location === null) throw new Error(`Missing Aurora Ionosphere shader uniform: ${name}`);
    return location;
  }

  #createTexture(unit: number, filter: number): WebGLTexture {
    const texture = this.#gl.createTexture();
    if (!texture) throw new Error("The Aurora Ionosphere texture could not be allocated");
    this.#gl.activeTexture(this.#gl.TEXTURE0 + unit);
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, texture);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MIN_FILTER, filter);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MAG_FILTER, filter);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_S, this.#gl.CLAMP_TO_EDGE);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_T, this.#gl.CLAMP_TO_EDGE);
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, 1, 1, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
    return texture;
  }

  #createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const framebuffer = this.#gl.createFramebuffer();
    if (!framebuffer) throw new Error("The Aurora Ionosphere framebuffer could not be allocated");
    this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, framebuffer);
    this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, texture, 0);
    return framebuffer;
  }

  #createLayerTexture(steps: number): WebGLTexture {
    const data = new Uint8Array(steps * 2 * 4);
    for (let index = 0; index < steps; index += 1) {
      const phase = index * 0.043;
      const planeHeight = 0.8 + Math.pow(index, 1.4) * 0.002;
      const jitterAmount = auroraIonosphereSmoothstep(0, 15, index);
      const spectralColor = [-1.15, 1.5, -0.2].map((offset) => Math.sin(offset + phase) * 0.5 + 0.5);
      const layerWeight = Math.pow(2, -index * 0.065 - 2.5) * auroraIonosphereSmoothstep(0, 5, index);
      const spectralOffset = index * 4;
      const geometryOffset = (steps + index) * 4;
      data[spectralOffset] = Math.round((spectralColor[0] ?? 0) * 255);
      data[spectralOffset + 1] = Math.round((spectralColor[1] ?? 0) * 255);
      data[spectralOffset + 2] = Math.round((spectralColor[2] ?? 0) * 255);
      auroraIonosphereWritePacked16(data, geometryOffset, geometryOffset + 1, planeHeight / 1.6);
      data[geometryOffset + 2] = Math.round(jitterAmount * 255);
      auroraIonosphereWritePacked16(data, spectralOffset + 3, geometryOffset + 3, layerWeight / 0.15);
    }
    const texture = this.#createTexture(0, this.#gl.NEAREST);
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, steps, 2, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, data);
    return texture;
  }

  #destroyGpuResources(): void {
    if (this.#buffer) this.#gl.deleteBuffer(this.#buffer);
    if (this.#noiseProgram) this.#gl.deleteProgram(this.#noiseProgram);
    if (this.#fieldProgram) this.#gl.deleteProgram(this.#fieldProgram);
    if (this.#compositeProgram) this.#gl.deleteProgram(this.#compositeProgram);
    if (this.#layerTexture) this.#gl.deleteTexture(this.#layerTexture);
    if (this.#noiseTexture) this.#gl.deleteTexture(this.#noiseTexture);
    if (this.#fieldTexture) this.#gl.deleteTexture(this.#fieldTexture);
    if (this.#noiseFramebuffer) this.#gl.deleteFramebuffer(this.#noiseFramebuffer);
    if (this.#fieldFramebuffer) this.#gl.deleteFramebuffer(this.#fieldFramebuffer);
  }

  #build(): void {
    this.#destroyGpuResources();
    const quality = AURORA_IONOSPHERE_QUALITY[this.#settings.quality];
    this.#noiseProgram = this.#link(AURORA_IONOSPHERE_NOISE_SHADER);
    this.#fieldProgram = this.#link(createAuroraIonosphereFieldShader(quality.steps));
    this.#compositeProgram = this.#link(AURORA_IONOSPHERE_COMPOSITE_SHADER);
    this.#buffer = this.#gl.createBuffer() ?? (() => { throw new Error("The Aurora Ionosphere geometry buffer could not be allocated"); })();
    this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, this.#buffer);
    this.#gl.bufferData(this.#gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), this.#gl.STATIC_DRAW);
    for (const program of [this.#noiseProgram, this.#fieldProgram, this.#compositeProgram]) {
      this.#gl.useProgram(program);
      const position = this.#gl.getAttribLocation(program, "aPosition");
      if (position < 0) throw new Error("The Aurora Ionosphere position attribute is unavailable");
      this.#gl.enableVertexAttribArray(position);
      this.#gl.vertexAttribPointer(position, 2, this.#gl.FLOAT, false, 0, 0);
    }
    this.#layerTexture = this.#createLayerTexture(quality.steps);
    this.#noiseTexture = this.#createTexture(2, this.#gl.LINEAR);
    this.#noiseFramebuffer = this.#createFramebuffer(this.#noiseTexture);
    this.#fieldTexture = this.#createTexture(1, this.#gl.LINEAR);
    this.#fieldFramebuffer = this.#createFramebuffer(this.#fieldTexture);
    this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
    this.#noiseUniforms = {
      resolution: this.#requiredUniform(this.#noiseProgram, "uResolution"),
      domainMin: this.#requiredUniform(this.#noiseProgram, "uNoiseDomainMin"),
      domainSize: this.#requiredUniform(this.#noiseProgram, "uNoiseDomainSize"),
      flowRotation: this.#requiredUniform(this.#noiseProgram, "uFlowRotation"),
      scale: this.#requiredUniform(this.#noiseProgram, "uNoiseScale"),
      turbulence: this.#requiredUniform(this.#noiseProgram, "uNoiseTurbulence"),
    };
    this.#fieldUniforms = {
      resolution: this.#requiredUniform(this.#fieldProgram, "uResolution"),
      intensity: this.#requiredUniform(this.#fieldProgram, "uIntensity"),
      glow: this.#requiredUniform(this.#fieldProgram, "uGlow"),
      intro: this.#requiredUniform(this.#fieldProgram, "uIntro"),
      introFeather: this.#requiredUniform(this.#fieldProgram, "uIntroFeather"),
      introStart: this.#requiredUniform(this.#fieldProgram, "uIntroStart"),
      introEnd: this.#requiredUniform(this.#fieldProgram, "uIntroEnd"),
      layerLut: this.#requiredUniform(this.#fieldProgram, "uLayerLut"),
      layerLutStep: this.#requiredUniform(this.#fieldProgram, "uLayerLutStep"),
      noiseAtlas: this.#requiredUniform(this.#fieldProgram, "uNoiseAtlas"),
      domainMin: this.#requiredUniform(this.#fieldProgram, "uNoiseDomainMin"),
      inverseDomainSize: this.#requiredUniform(this.#fieldProgram, "uNoiseDomainInverseSize"),
    };
    this.#compositeUniforms = {
      resolution: this.#requiredUniform(this.#compositeProgram, "uResolution"),
      starResolution: this.#requiredUniform(this.#compositeProgram, "uStarResolution"),
      starDensity: this.#requiredUniform(this.#compositeProgram, "uStarDensity"),
      intro: this.#requiredUniform(this.#compositeProgram, "uIntro"),
      introSkyEnd: this.#requiredUniform(this.#compositeProgram, "uIntroSkyEnd"),
      introStarStart: this.#requiredUniform(this.#compositeProgram, "uIntroStarStart"),
      fieldTexture: this.#requiredUniform(this.#compositeProgram, "uAuroraTexture"),
      color: this.#requiredUniform(this.#compositeProgram, "uAuroraColor"),
      uvScale: this.#requiredUniform(this.#compositeProgram, "uAuroraUvScale"),
      uvOffset: this.#requiredUniform(this.#compositeProgram, "uAuroraUvOffset"),
    };
    this.#gl.useProgram(this.#fieldProgram);
    this.#gl.uniform1i(this.#fieldUniforms.layerLut, 0);
    this.#gl.uniform1i(this.#fieldUniforms.noiseAtlas, 2);
    this.#gl.uniform1f(this.#fieldUniforms.layerLutStep, 1 / quality.steps);
    this.#gl.useProgram(this.#compositeProgram);
    this.#gl.uniform1i(this.#compositeUniforms.fieldTexture, 1);
    this.#settingsDirty = true;
    this.#resizePending = true;
    this.#onError(undefined);
  }

  #resize(): void {
    this.#resizePending = false;
    const quality = AURORA_IONOSPHERE_QUALITY[this.#settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
    const width = Math.max(1, Math.floor(this.#hostBounds.width * dpr));
    const height = Math.max(1, Math.floor(this.#hostBounds.height * dpr));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    this.#starResolution = Math.max(1, width);
    const nextRayTextureWidth = Math.max(1, Math.floor(width * quality.rayScale));
    const nextRayTextureHeight = Math.max(1, Math.floor(height * quality.rayScale));
    if (nextRayTextureWidth !== this.#rayTextureWidth || nextRayTextureHeight !== this.#rayTextureHeight) {
      this.#rayTextureWidth = nextRayTextureWidth;
      this.#rayTextureHeight = nextRayTextureHeight;
      this.#gl.activeTexture(this.#gl.TEXTURE1);
      this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#fieldTexture);
      this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#rayTextureWidth, this.#rayTextureHeight, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
    }
    this.#noiseDomain = calculateAuroraIonosphereNoiseDomain(width, height, quality.steps);
    const longestDomainEdge = Math.max(this.#noiseDomain.sizeX, this.#noiseDomain.sizeY);
    const atlasLongEdge = Math.min(quality.noiseAtlasSize, this.#gl.getParameter(this.#gl.MAX_TEXTURE_SIZE) as number);
    const nextAtlasWidth = Math.max(256, Math.round(atlasLongEdge * this.#noiseDomain.sizeX / longestDomainEdge));
    const nextAtlasHeight = Math.max(256, Math.round(atlasLongEdge * this.#noiseDomain.sizeY / longestDomainEdge));
    if (nextAtlasWidth !== this.#atlasWidth || nextAtlasHeight !== this.#atlasHeight) {
      this.#atlasWidth = nextAtlasWidth;
      this.#atlasHeight = nextAtlasHeight;
      this.#gl.activeTexture(this.#gl.TEXTURE2);
      this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#noiseTexture);
      this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#atlasWidth, this.#atlasHeight, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
    }
    this.#rayWidth = Math.max(1, Math.floor(this.#rayTextureWidth * this.#adaptiveScale));
    this.#rayHeight = Math.max(1, Math.floor(this.#rayTextureHeight * this.#adaptiveScale));
    this.#uvScale.x = Math.max(0, this.#rayWidth - 1) / this.#rayTextureWidth;
    this.#uvScale.y = Math.max(0, this.#rayHeight - 1) / this.#rayTextureHeight;
    this.#uvOffset.x = 0.5 / this.#rayTextureWidth;
    this.#uvOffset.y = 0.5 / this.#rayTextureHeight;
  }

  #stopLoop(): void {
    if (this.#animationFrame) cancelBackgroundFrame(this.#animationFrame);
    this.#animationFrame = 0;
  }

  #schedule(): void {
    if (!this.#animationFrame && this.#running && this.#contextReady && this.#documentVisible) {
      this.#animationFrame = requestBackgroundFrame(this.#canvas, this.#draw);
    }
  }

  #draw = (now: number): void => {
    this.#animationFrame = 0;
    if (!this.#running || !this.#contextReady || !this.#documentVisible) return;
    if (this.#resizePending) this.#resize();
    const settings = this.#settings;
    const reduced = this.#reducedMotion.matches;
    const delta = this.#lastFrame ? Math.min((now - this.#lastFrame) / 1000, 0.05) : 0;
    this.#lastFrame = now;
    if (!settings.paused) this.#elapsed += delta * (reduced ? 0.16 : 1);
    this.#introProgress = reduced
      ? 1
      : Math.min(1, this.#introProgress + delta / Math.max(0.1, settings.introDuration));

    if (!settings.paused && !reduced) {
      this.#sampleDuration += delta;
      this.#sampledFrames += 1;
      if (this.#sampledFrames >= 30) {
        const quality = AURORA_IONOSPHERE_QUALITY[settings.quality];
        const averageFrameTime = this.#sampleDuration / this.#sampledFrames;
        const previousScale = this.#adaptiveScale;
        if (averageFrameTime > 1 / 52) this.#adaptiveScale = Math.max(quality.minAdaptiveScale, this.#adaptiveScale - 0.04);
        else if (averageFrameTime < 1 / 58) this.#adaptiveScale = Math.min(1, this.#adaptiveScale + 0.02);
        this.#sampleDuration = 0;
        this.#sampledFrames = 0;
        if (this.#adaptiveScale !== previousScale) this.#resizePending = true;
      }
    }

    const intro = auroraIonosphereSmoothstep(0, 1, this.#introProgress);
    const flowAngle = this.#elapsed * 0.06 * settings.speed;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#noiseFramebuffer);
    gl.viewport(0, 0, this.#atlasWidth, this.#atlasHeight);
    gl.useProgram(this.#noiseProgram);
    gl.uniform2f(this.#noiseUniforms.resolution, this.#atlasWidth, this.#atlasHeight);
    gl.uniform2f(this.#noiseUniforms.domainMin, this.#noiseDomain.minX, this.#noiseDomain.minY);
    gl.uniform2f(this.#noiseUniforms.domainSize, this.#noiseDomain.sizeX, this.#noiseDomain.sizeY);
    gl.uniform2f(this.#noiseUniforms.flowRotation, Math.cos(flowAngle), Math.sin(flowAngle));
    if (this.#settingsDirty) {
      gl.uniform1f(this.#noiseUniforms.scale, 0.6 + 0.8 * settings.curtainScale);
      gl.uniform1f(this.#noiseUniforms.turbulence, 0.3 + 1.2 * settings.turbulence);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#fieldFramebuffer);
    gl.viewport(0, 0, this.#rayWidth, this.#rayHeight);
    gl.useProgram(this.#fieldProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#layerTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.#noiseTexture);
    gl.uniform2f(this.#fieldUniforms.resolution, this.#rayWidth, this.#rayHeight);
    gl.uniform2f(this.#fieldUniforms.domainMin, this.#noiseDomain.minX, this.#noiseDomain.minY);
    gl.uniform2f(this.#fieldUniforms.inverseDomainSize, 1 / this.#noiseDomain.sizeX, 1 / this.#noiseDomain.sizeY);
    gl.uniform1f(this.#fieldUniforms.intro, intro);
    if (this.#settingsDirty) {
      gl.uniform1f(this.#fieldUniforms.intensity, settings.intensity);
      gl.uniform1f(this.#fieldUniforms.glow, settings.glow);
      gl.uniform1f(this.#fieldUniforms.introFeather, settings.introFeather);
      gl.uniform1f(this.#fieldUniforms.introStart, settings.introStart);
      gl.uniform1f(this.#fieldUniforms.introEnd, settings.introEnd);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    gl.useProgram(this.#compositeProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#fieldTexture);
    gl.uniform2f(this.#compositeUniforms.resolution, this.#canvas.width, this.#canvas.height);
    gl.uniform1f(this.#compositeUniforms.starResolution, this.#starResolution);
    gl.uniform1f(this.#compositeUniforms.intro, intro);
    gl.uniform2f(this.#compositeUniforms.uvScale, this.#uvScale.x, this.#uvScale.y);
    gl.uniform2f(this.#compositeUniforms.uvOffset, this.#uvOffset.x, this.#uvOffset.y);
    if (this.#settingsDirty) {
      gl.uniform1f(this.#compositeUniforms.starDensity, settings.starDensity);
      // Rotate around the neutral RGB axis; compute only when settings change.
      const angle = settings.hue * Math.PI / 180;
      const c = Math.cos(angle) * settings.saturation;
      const t = (1 - c) / 3;
      const k = Math.sin(angle) * settings.saturation / Math.sqrt(3);
      gl.uniformMatrix3fv(this.#compositeUniforms.color, false, new Float32Array([
        c+t, t+k, t-k, t-k, c+t, t+k, t+k, t-k, c+t,
      ]));
      gl.uniform1f(this.#compositeUniforms.introSkyEnd, settings.introSkyEnd);
      gl.uniform1f(this.#compositeUniforms.introStarStart, settings.introStarStart);
      this.#settingsDirty = false;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!settings.paused || this.#introProgress < 1) this.#schedule();
    else this.#lastFrame = 0;
  };

  #onVisibilityChange = (): void => {
    this.#documentVisible = !document.hidden;
    this.#lastFrame = 0;
    if (this.#documentVisible) this.#schedule();
    else this.#stopLoop();
  };

  #onContextLost = (event: Event): void => {
    event.preventDefault();
    this.#contextReady = false;
    this.#stopLoop();
    this.#onError("The Aurora Ionosphere graphics context was lost; waiting for recovery.");
  };

  #onContextRestored = (): void => {
    try {
      this.#contextReady = true;
      this.#build();
      this.#adaptiveScale = 1;
      this.#lastFrame = 0;
      this.#schedule();
    } catch (error) {
      this.#contextReady = false;
      this.#onError(error instanceof Error ? error.message : "The Aurora Ionosphere graphics context could not be restored");
    }
  };

  #onReducedMotionChange = (): void => {
    this.#settingsDirty = true;
    this.#lastFrame = 0;
    this.#schedule();
  };
}

export type MilkyWayQuality = "low" | "medium" | "high";

export interface MilkyWayBackgroundSettings {
  quality: MilkyWayQuality;
  speed: number;
  amplitude: number;
  frequency: number;
  zoom: number;
  rotation: number;
  exposure: number;
  timeOffset: number;
  introDuration: number;
  introFeather: number;
  introAngle: number;
  introZoom: number;
  introEnabled: boolean;
  paused: boolean;
  colors: readonly string[];
}

export type MilkyWayNumericSettingKey = { [K in keyof MilkyWayBackgroundSettings]: MilkyWayBackgroundSettings[K] extends number ? K : never }[keyof MilkyWayBackgroundSettings];

export type MilkyWayNumericControlDefinition = Omit<AuroraIonosphereNumericControlDefinition, "key"> & { key: MilkyWayNumericSettingKey };

export const DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS: MilkyWayBackgroundSettings = Object.freeze({
  quality: "medium", speed: .35, amplitude: 1, frequency: 1, zoom: 1, rotation: 0, exposure: 1,
  timeOffset: 5.07, introDuration: 2.8, introFeather: .18, introAngle: 32, introZoom: .16,
  introEnabled: true, paused: false,
  colors: Object.freeze(["#d81159", "#8f2d56", "#218380", "#fbb13c", "#73d2de"]),
});

export const MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS: readonly MilkyWayNumericControlDefinition[] = [
  { key: "speed", group: "field", id: "cle-milky-way-speed", label: "Flow speed", labelZh: "流动速度", minimum: 0, maximum: 3, step: .01 },
  { key: "amplitude", group: "field", id: "cle-milky-way-amplitude", label: "Wave amplitude", labelZh: "波动幅度", minimum: 0, maximum: 2, step: .01 },
  { key: "frequency", group: "field", id: "cle-milky-way-frequency", label: "Wave frequency", labelZh: "波动频率", minimum: .1, maximum: 3, step: .01 },
  { key: "zoom", group: "field", id: "cle-milky-way-zoom", label: "Scale", labelZh: "画面缩放", minimum: .3, maximum: 3, step: .01 },
  { key: "rotation", group: "field", id: "cle-milky-way-rotation", label: "Rotation", labelZh: "画面旋转", minimum: -180, maximum: 180, step: 1, unit: "°" },
  { key: "exposure", group: "field", id: "cle-milky-way-exposure", label: "Brightness", labelZh: "画面亮度", minimum: 0, maximum: 2, step: .01 },
  { key: "timeOffset", group: "field", id: "cle-milky-way-time-offset", label: "Initial phase", labelZh: "初始相位", minimum: 0, maximum: 120, step: .01, unit: "s" },
  { key: "introDuration", group: "opening", id: "cle-milky-way-intro-duration", label: "Opening duration", labelZh: "开场时长", minimum: .5, maximum: 8, step: .1, unit: "s" },
  { key: "introFeather", group: "opening", id: "cle-milky-way-intro-feather", label: "Edge feathering", labelZh: "边缘羽化", minimum: .01, maximum: .5, step: .01 },
  { key: "introAngle", group: "opening", id: "cle-milky-way-intro-angle", label: "Reveal angle", labelZh: "展开角度", minimum: -180, maximum: 180, step: 1, unit: "°" },
  { key: "introZoom", group: "opening", id: "cle-milky-way-intro-zoom", label: "Zoom strength", labelZh: "缩放强度", minimum: 0, maximum: .6, step: .01 },
];

export function normalizeMilkyWaySettings(value: unknown): MilkyWayBackgroundSettings {
  const record = isObjectRecord(value) ? value : {};
  const defaults = DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS;
  const result = { ...defaults };
  for (const control of MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS) result[control.key] = clampParticleNumber(record[control.key], control.minimum, control.maximum, defaults[control.key]);
  result.quality = record.quality === "low" || record.quality === "medium" || record.quality === "high" ? record.quality : defaults.quality;
  result.paused = typeof record.paused === "boolean" ? record.paused : defaults.paused;
  result.introEnabled = typeof record.introEnabled === "boolean" ? record.introEnabled : defaults.introEnabled;
  const colors = Array.isArray(record.colors) ? record.colors : [];
  result.colors = defaults.colors.map((fallback, i) => typeof colors[i] === "string" && /^#[\da-f]{6}$/i.test(colors[i]) ? colors[i] : fallback);
  return result;
}

export function readMilkyWayBackgroundSettings(): MilkyWayBackgroundSettings {
  try { return normalizeMilkyWaySettings(JSON.parse(localStorage.getItem(MILKY_WAY_BACKGROUND_SETTINGS_KEY) || "{}")); }
  catch { return { ...DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS }; }
}

export const MILKY_WAY_FRAGMENT_SHADER = `precision highp float;
uniform vec2 uResolution;
uniform float uTime, uAmplitude, uFrequency, uZoom, uRotation, uExposure;
uniform vec3 uColors[5];
uniform float uIntro, uIntroFeather, uIntroAngle, uIntroZoom;
float phase(vec2 p) {
  // atan(0, 0) is undefined in GLSL; select a stable value at the singularity.
  return dot(p,p) < 1e-12 ? 0.0 : atan(p.x, p.y);
}
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  vec2 screen = uv;
  uv /= 1.0 + uIntroZoom * (1.0 - uIntro);
  float c = cos(uRotation), s = sin(uRotation);
  uv = mat2(c, -s, s, c) * uv / uZoom;
  vec3 color = vec3(0.0);
  uv.x += sin(uv.y * uFrequency + uTime) * uAmplitude;
  uv.y += sin(uv.x * uFrequency + uTime) * uAmplitude;
  color += sin(phase(uv)) * uColors[0];
  uv.x += sin(uv.y * uFrequency + uTime * 1.2) * uAmplitude;
  uv.y += sin(uv.x * uFrequency + uTime * 1.2) * uAmplitude;
  color += sin(phase(uv) * 2.0) * uColors[1];
  uv.x += sin(uv.y * uFrequency + uTime * 1.4) * uAmplitude;
  uv.y += sin(uv.x * uFrequency + uTime * 1.4) * uAmplitude;
  color += sin(phase(uv) * 3.0) * uColors[2];
  uv.x += sin(uv.y * uFrequency + uTime * 1.6) * uAmplitude;
  uv.y += sin(uv.x * uFrequency + uTime * 1.6) * uAmplitude;
  color += sin(phase(uv) * 4.0) * uColors[3];
  uv.x += sin(uv.y * uFrequency + uTime * 1.8) * uAmplitude;
  uv.y += sin(uv.x * uFrequency + uTime * 1.8) * uAmplitude;
  color += sin(phase(uv) * 5.0) * uColors[4];
  vec3 finalColor = clamp((color / 2.0 + 0.5) * uExposure, 0.0, 1.0);
  // A feathered slit expands to every corner. At progress 1 this is exactly
  // the original image; there is no persistent overlay, blur, or color shift.
  if (uIntro < 1.0) {
    vec2 normal = vec2(-sin(uIntroAngle), cos(uIntroAngle));
    vec2 halfSize = uResolution / min(uResolution.x, uResolution.y);
    float distance = abs(dot(screen, normal)) / dot(halfSize, abs(normal));
    float edge = mix(-uIntroFeather, 1.0 + uIntroFeather, uIntro);
    float reveal = 1.0 - smoothstep(edge - uIntroFeather, edge + uIntroFeather, distance);
    finalColor *= reveal;
  }
  gl_FragColor = vec4(finalColor, 1.0);
}`;

export class MilkyWayRenderer {
  #settings: MilkyWayBackgroundSettings;
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGLRenderingContext;
  readonly #onError: (message: string | undefined) => void;
  readonly #motion = matchMedia("(prefers-reduced-motion: reduce)");
  readonly #resize: ResizeObserver;
  readonly #intersection: IntersectionObserver;
  #program: WebGLProgram | undefined;
  #buffer: WebGLBuffer | undefined;
  #uniforms: Record<string, WebGLUniformLocation | null> = {};
  #palette = new Float32Array(15);
  #maxViewport: Int32Array = new Int32Array([16384, 16384]);
  #frame = 0;
  #last = 0;
  #time = 5.07;
  #intro = 0;
  #width = 1;
  #height = 1;
  #dirty = true;
  #visible = true;
  #lost = false;
  #disposed = false;
  constructor(layer: HTMLElement, canvas: HTMLCanvasElement, settings: MilkyWayBackgroundSettings, onError: (message: string | undefined) => void) {
    this.#canvas = canvas;
    this.#settings = normalizeMilkyWaySettings(settings);
    this.#time = this.#settings.timeOffset;
    this.#onError = onError;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL is unavailable for Milky Way Background");
    this.#gl = gl;
    this.#updatePalette();
    try { this.#initGpu(); } catch (error) { this.#cleanupGpu(); throw error; }
    this.#resize = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) { this.#width = rect.width; this.#height = rect.height; this.#request(); }
    });
    this.#resize.observe(layer);
    this.#intersection = new IntersectionObserver(entries => { this.#visible = entries[0]?.isIntersecting ?? true; this.#resetClock(); });
    this.#intersection.observe(layer);
    document.addEventListener("visibilitychange", this.#resetClock);
    window.addEventListener("resize", this.#resetClock);
    this.#motion.addEventListener("change", this.#resetClock);
    canvas.addEventListener("webglcontextlost", this.#contextLost);
    canvas.addEventListener("webglcontextrestored", this.#contextRestored);
    this.#request();
  }
  #initGpu(): void {
    const gl = this.#gl;
    this.#maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Milky Way shader allocation failed");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Milky Way shader compilation failed");
      return shader;
    };
    try {
      const program = gl.createProgram();
      if (!program) throw new Error("Milky Way program allocation failed");
      this.#program = program;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, "attribute vec2 aPosition; void main(){gl_Position=vec4(aPosition,0.,1.);}"));
      const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, precision?.precision ? MILKY_WAY_FRAGMENT_SHADER : MILKY_WAY_FRAGMENT_SHADER.replace("precision highp", "precision mediump")));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Milky Way shader link failed");
      gl.useProgram(program);
      this.#buffer = gl.createBuffer() ?? undefined;
      if (!this.#buffer) throw new Error("Milky Way geometry allocation failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      this.#uniforms = Object.fromEntries(["Resolution","Time","Amplitude","Frequency","Zoom","Rotation","Exposure","Colors[0]","Intro","IntroFeather","IntroAngle","IntroZoom"].map(name => [name, gl.getUniformLocation(program,"u"+name)]));
      this.#dirty = true;
    } finally { for (const shader of shaders) gl.deleteShader(shader); }
  }
  #updatePalette(): void {
    this.#palette = new Float32Array(this.#settings.colors.flatMap(hex => [1,3,5].map(start => parseInt(hex.slice(start,start+2),16)/255)));
  }
  setSettings(settings: MilkyWayBackgroundSettings): void {
    const next = normalizeMilkyWaySettings(settings);
    if (next.timeOffset !== this.#settings.timeOffset) this.#time = next.timeOffset;
    if (!next.introEnabled) this.#intro = 1;
    this.#settings = next;
    this.#updatePalette(); this.#dirty = true; this.#request();
  }
  replay(): void {
    this.#time = this.#settings.timeOffset;
    this.#intro = this.#settings.introEnabled ? 0 : 1;
    this.#resetClock();
  }
  #request = (): void => {
    if (!this.#disposed && !this.#lost && this.#visible && !document.hidden && !this.#frame) this.#frame = requestBackgroundFrame(this.#canvas, this.#draw);
  };
  #resetClock = (): void => { cancelBackgroundFrame(this.#frame); this.#frame=0; this.#last=0; this.#request(); };
  #draw = (now: number): void => {
    this.#frame = 0;
    if (this.#disposed || this.#lost || !this.#visible || document.hidden) { this.#last=0; return; }
    const s=this.#settings, gl=this.#gl, u=this.#uniforms;
    const delta=this.#last ? Math.min((now-this.#last)/1000,.05) : 0;
    const moving=!s.paused && s.speed>0 && !this.#motion.matches;
    if (moving) this.#time+=delta*s.speed;
    this.#intro = this.#motion.matches || !s.introEnabled ? 1 : Math.min(1,this.#intro+delta/s.introDuration);
    const p=this.#intro, eased=p*p*p*(p*(p*6-15)+10);
    const running=moving || p<1;
    this.#last=running ? now : 0;
    const ratio=Math.min(devicePixelRatio || 1, {low:1,medium:2,high:3}[s.quality]);
    const maxSize=this.#maxViewport;
    const width=Math.max(1,Math.min(maxSize[0]!,Math.round(this.#width*ratio)));
    const height=Math.max(1,Math.min(maxSize[1]!,Math.round(this.#height*ratio)));
    if (this.#canvas.width!==width || this.#canvas.height!==height) {
      this.#canvas.width=width; this.#canvas.height=height; gl.viewport(0,0,width,height); this.#dirty=true;
    }
    if (this.#dirty) {
      gl.uniform2f(u.Resolution!,width,height);
      gl.uniform1f(u.Amplitude!,s.amplitude); gl.uniform1f(u.Frequency!,s.frequency);
      gl.uniform1f(u.Zoom!,s.zoom); gl.uniform1f(u.Rotation!,s.rotation*Math.PI/180);
      gl.uniform1f(u.Exposure!,s.exposure); gl.uniform3fv(u["Colors[0]"]!,this.#palette);
      gl.uniform1f(u.IntroFeather!,s.introFeather); gl.uniform1f(u.IntroAngle!,s.introAngle*Math.PI/180);
      gl.uniform1f(u.IntroZoom!,s.introZoom); this.#dirty=false;
    }
    gl.uniform1f(u.Time!,this.#time); gl.uniform1f(u.Intro!,eased); gl.drawArrays(gl.TRIANGLES,0,3);
    if (running) this.#request();
  };
  #cleanupGpu(): void { if(this.#buffer)this.#gl.deleteBuffer(this.#buffer); if(this.#program)this.#gl.deleteProgram(this.#program); this.#buffer=undefined; this.#program=undefined; }
  #contextLost = (event: Event): void => { event.preventDefault(); this.#lost=true; cancelBackgroundFrame(this.#frame); this.#frame=0; this.#last=0; this.#onError("Milky Way graphics context interrupted. Waiting to restore…"); };
  #contextRestored = (): void => { if(this.#disposed)return; try { this.#cleanupGpu(); this.#initGpu(); this.#lost=false; this.#onError(undefined); this.#resetClock(); } catch(error) { this.#cleanupGpu(); this.#onError(error instanceof Error ? error.message : "Milky Way graphics recovery failed"); } };
  dispose(): void {
    this.#disposed=true; cancelBackgroundFrame(this.#frame);
    this.#resize.disconnect(); this.#intersection.disconnect();
    document.removeEventListener("visibilitychange",this.#resetClock); window.removeEventListener("resize",this.#resetClock);
    this.#motion.removeEventListener("change",this.#resetClock);
    this.#canvas.removeEventListener("webglcontextlost",this.#contextLost); this.#canvas.removeEventListener("webglcontextrestored",this.#contextRestored);
    this.#cleanupGpu();
  }
}

export const MOUNTAIN_DEFAULTS = { ...{ speed:.45, driftStrength:4, mountainHeight:1, zoom:1, horizon:0, softness:1, exposure:1, saturation:1, vignette:1, depth:1, detail:1, haze:1, light:1, warmth:1, resolution:1, steps:57 }, paused: false };

export type MountainSettings = typeof MOUNTAIN_DEFAULTS;

export const MOUNTAIN_CONTROLS = [
  ["speed","漂移速度（负值反向）","Drift speed (negative reverses)",-20,20,.01],
  ["driftStrength","漂移强度","Drift strength",0,20,.1],
  ["mountainHeight","山体起伏高度","Mountain height",0,4,.01],
  ["zoom","视角缩放","View zoom",.5,3,.01],
  ["horizon","画面垂直位置","Vertical offset",-.8,.8,.01],
  ["softness","山脊边缘柔和度","Edge softness",.1,6,.05],
  ["depth","山峦纵深","Mountain depth",.55,1.45,.01],
  ["detail","山脊细节","Ridge detail",0,1.5,.01],
  ["haze","雾气浓度","Atmospheric haze",.2,1.8,.01],
  ["light","逆光强度","Backlight",0,1.8,.01],
  ["warmth","色温","Color warmth",0,1,.01],
  ["exposure","曝光亮度","Exposure",.2,3,.01],
  ["saturation","色彩饱和度","Saturation",0,2.5,.01],
  ["vignette","暗角强度","Vignette",0,3,.01],
  ["resolution","渲染比例","Render scale",.5,1,.05],
] as const;

export function normalizeMountainSettings(value: unknown): MountainSettings {
  const record = isObjectRecord(value) ? value : {};
  const result = { ...MOUNTAIN_DEFAULTS };
  for (const [key,,,min,max] of MOUNTAIN_CONTROLS) result[key] = clampParticleNumber(record[key],min,max,MOUNTAIN_DEFAULTS[key]);
  result.steps = record.steps === 28 || record.steps === 42 || record.steps === 57 ? record.steps : 57;
  result.paused = typeof record.paused === "boolean" ? record.paused : false;
  return result;
}

export function readMountainBackgroundSettings(): MountainSettings {
  try { return normalizeMountainSettings(JSON.parse(localStorage.getItem("code-codex:mountain-settings:v1") || "{}")); }
  catch { return { ...MOUNTAIN_DEFAULTS }; }
}

export class MountainRenderer {
  #settings: { current: MountainSettings };
  #wake = { current: () => {} };
  #opening = { current: () => {} };
  #cleanup: (() => void) | undefined;
  #canvas: HTMLCanvasElement;
  #onError: (message: string | undefined) => void;
  constructor(_layer: HTMLElement, canvas: HTMLCanvasElement, settings: MountainSettings, onError: (message: string | undefined) => void) {
    this.#canvas=canvas; this.#settings={current:settings}; this.#onError=onError;
    this.#cleanup=this.#start();
    canvas.addEventListener("webglcontextlost", this.#lost);
    canvas.addEventListener("webglcontextrestored", this.#restored);
  }
  #start(): (() => void) | undefined {
    const canvas=this.#canvas, settings=this.#settings, wake=this.#wake, opening=this.#opening, onError=this.#onError;
    const vertex = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;

// Ridge noise is evaluated in a compact 768x64 atlas instead of at every screen pixel.
const atlasFragment = `#version 300 es
precision highp float;
uniform vec2 atlasResolution;
uniform float time, detail, drift;
out vec4 outColor;
mat2 rotate2D(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  float layer=floor(gl_FragCoord.y);
  float z=layer/63.;
  float x=(gl_FragCoord.x/atlasResolution.x-.5)*16.;
  vec2 p=vec2(x+drift*(.18+z),z*1.73);
  mat2 m=rotate2D(.5);
  float e=0.,s=4.,seed=z*7.1;
  for(int octave=0;octave<14;octave++){
    if(float(octave)>=7.+detail*4.)break;
    p=m*p*1.037+vec2(seed*.73,-seed*.29);
    e+=cos(time*.055+s*p.x+seed*2.1)/s*.48;
    e+=sin(s*p.y*.63-seed)/s*.14;
    s*=1.4;
  }
  outColor=vec4(clamp(.5+e*.8,0.,1.),0.,0.,1.);
}`;

const sceneFragment = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform sampler2D ridgeAtlas;
uniform float time, depth, haze, light, warmth;
uniform float mountainHeight, zoom, horizon, softness, exposure, saturation, vignette;
uniform float intro;
uniform int steps;
out vec4 outColor;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
  uv.x*=.93;
  uv/=zoom;
  uv.y-=horizon;
  vec3 skyLow=mix(vec3(.55,.50,.44),vec3(.64,.47,.35),warmth);
  vec3 skyHigh=mix(vec3(.73,.75,.75),vec3(.84,.81,.72),warmth);
  vec3 col=mix(skyLow,skyHigh,smoothstep(-.45,.72,uv.y));
  vec2 sunPos=vec2(.28,.31+light*.12);
  float sun=exp(-length((uv-sunPos)*vec2(.8,1.25))*3.4);
  col+=mix(vec3(.7,.78,.8),vec3(1.,.68,.28),warmth)*sun*(.18+light*.38);
  vec3 farColor=mix(vec3(.64,.56,.48),vec3(.83,.58,.38),warmth);
  vec3 nearColor=mix(vec3(.075,.09,.09),vec3(.11,.10,.085),warmth);

  int layerCount=8+steps/8;
  for(int i=0;i<16;i++){
    if(i>=layerCount)break;
    float fi=float(i),z=fi/float(max(layerCount-1,1));
    float travel=1.3+z*3.5*depth;
    float q=uv.x*travel;
    vec2 atlasUv=vec2(clamp(q/16.+.5,.001,.999),(z*63.+.5)/64.);
    float profile=(texture(ridgeAtlas,atlasUv).r-.5)/.8;
    float baseline=mix(.36,-.58,pow(z,.78));
    float mountain=baseline+profile*(.5+.38*z)*depth*mountainHeight;
    // Reveal distant ridges first; settle each layer gently into its final position.
    float reveal=smoothstep(z*.48,z*.48+.52,intro);
    mountain-=(1.-reveal)*(.035+.065*z);
    float edge=1.-smoothstep(mountain-(.006+.008*z)*softness,mountain+.003*softness,uv.y);
    float atmosphere=(1.-z)/(1.+haze*z*1.5);
    vec3 mountainColor=mix(nearColor,farColor,atmosphere);
    float rim=exp(-abs(uv.y-mountain)*85.)*(1.-z)*light;
    mountainColor+=mix(vec3(.2,.25,.27),vec3(.9,.48,.2),warmth)*rim*.13;
    col=mix(col,mountainColor,edge*reveal);
  }

  float mist=exp(-abs(uv.y+.03)*2.4)*haze*.045;
  col+=mix(vec3(.35,.43,.45),vec3(.72,.50,.34),warmth)*mist;
  col+=(hash21(gl_FragCoord.xy+floor(time*12.))-.5)/255.*2.2;
  col*=max(0.,1.-vignette*.18*dot(uv,uv));
  col=mix(vec3(dot(col,vec3(.2126,.7152,.0722))),col,saturation)*exposure;
  col=mix(vec3(.035,.04,.045),pow(max(col,0.),vec3(.86)),smoothstep(0.,.32,intro));
  outColor=vec4(col,1.);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs); gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "position"); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Shader link failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}


        const gl = canvas.getContext("webgl2", { alpha:false, antialias:false, depth:false, powerPreference:"high-performance" });
    if (!gl) { throw new Error("WebGL 2 unavailable"); }
    let atlasProgram: WebGLProgram | null = null, sceneProgram: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null, atlasTexture: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null;
    let frame=0,last=0,elapsed=0,drift=0,introElapsed=0,width=1,height=1,visible=true,disposed=false;
    const media=matchMedia("(prefers-reduced-motion: reduce)");
    try {
      atlasProgram=link(gl,atlasFragment); sceneProgram=link(gl,sceneFragment);
      buffer=gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      atlasTexture=gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D,atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,768,64,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      framebuffer=gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,atlasTexture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error("Mountain atlas framebuffer unavailable");
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      const atlasUniforms={resolution:gl.getUniformLocation(atlasProgram,"atlasResolution"),time:gl.getUniformLocation(atlasProgram,"time"),detail:gl.getUniformLocation(atlasProgram,"detail")};
      const driftUniform=gl.getUniformLocation(atlasProgram,"drift");
      const appearance = ["mountainHeight","zoom","horizon","softness","exposure","saturation","vignette"] as const;
      const sceneUniforms=Object.fromEntries(["resolution","ridgeAtlas","time","intro","depth","haze","light","warmth","steps",...appearance].map(name=>[name,gl.getUniformLocation(sceneProgram!,name)]));
      const maxViewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
      const request=()=>{if(!frame&&!disposed&&visible&&!document.hidden)frame=requestBackgroundFrame(canvas, draw);};
      const draw=(now:number)=>{
        frame=0; const s=settings.current;
        const introDt=Math.min((now-(last||now))/1000,.1);
        // Independent of drift speed; static/reduced-motion users see the completed scene.
        introElapsed=s.paused||media.matches ? 3 : Math.min(3,introElapsed+introDt);
        if(!s.paused&&!media.matches){
          const dt=Math.min((now-(last||now))/1000,.1);
          elapsed+=dt*s.speed;
          drift+=dt*s.speed*s.driftStrength*.012;
        }
        last=now;
        const ratio=Math.min(devicePixelRatio||1,1.5)*s.resolution;
        const rw=Math.max(1,Math.min(maxViewport[0]!,Math.round(width*ratio))),rh=Math.max(1,Math.min(maxViewport[1]!,Math.round(height*ratio)));
        if(canvas.width!==rw||canvas.height!==rh){canvas.width=rw;canvas.height=rh;}
        gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer); gl.viewport(0,0,768,64); gl.useProgram(atlasProgram);
        gl.uniform2f(atlasUniforms.resolution,768,64); gl.uniform1f(atlasUniforms.time,elapsed); gl.uniform1f(atlasUniforms.detail,s.detail);
        gl.uniform1f(driftUniform,drift);
        gl.drawArrays(gl.TRIANGLES,0,3);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,rw,rh); gl.useProgram(sceneProgram);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,atlasTexture); gl.uniform1i(sceneUniforms.ridgeAtlas!,0);
        gl.uniform2f(sceneUniforms.resolution!,rw,rh); gl.uniform1f(sceneUniforms.time!,elapsed);
        gl.uniform1f(sceneUniforms.intro!,introElapsed/3);
        gl.uniform1f(sceneUniforms.depth!,s.depth); gl.uniform1f(sceneUniforms.haze!,s.haze); gl.uniform1f(sceneUniforms.light!,s.light);
        gl.uniform1f(sceneUniforms.warmth!,s.warmth); gl.uniform1i(sceneUniforms.steps!,Math.round(s.steps));
        for(const key of appearance)gl.uniform1f(sceneUniforms[key]!,s[key]);
        gl.drawArrays(gl.TRIANGLES,0,3);
        if(!s.paused&&!media.matches&&(s.speed!==0||introElapsed<3))request();
      };
      const reset=()=>{cancelBackgroundFrame(frame);frame=0;last=0;request();};
      const resize=new ResizeObserver(([entry])=>{if(!entry)return;width=entry.contentRect.width;height=entry.contentRect.height;request();});
      const intersection=new IntersectionObserver(([entry])=>{if(!entry)return;visible=entry.isIntersecting;reset();});
      resize.observe(canvas);intersection.observe(canvas);document.addEventListener("visibilitychange",reset);media.addEventListener("change",reset);
      opening.current=()=>{elapsed=0;drift=0;introElapsed=0;reset();};
      wake.current=reset;request();
      return()=>{disposed=true;cancelBackgroundFrame(frame);resize.disconnect();intersection.disconnect();document.removeEventListener("visibilitychange",reset);media.removeEventListener("change",reset);wake.current=()=>undefined;opening.current=()=>{};if(framebuffer)gl.deleteFramebuffer(framebuffer);if(atlasTexture)gl.deleteTexture(atlasTexture);if(buffer)gl.deleteBuffer(buffer);if(atlasProgram)gl.deleteProgram(atlasProgram);if(sceneProgram)gl.deleteProgram(sceneProgram);};
    } catch(reason) {
      onError(reason instanceof Error?reason.message:String(reason));
      if(framebuffer)gl.deleteFramebuffer(framebuffer);if(atlasTexture)gl.deleteTexture(atlasTexture);if(buffer)gl.deleteBuffer(buffer);if(atlasProgram)gl.deleteProgram(atlasProgram);if(sceneProgram)gl.deleteProgram(sceneProgram);
      throw reason;
    }
  }
  #lost = (event: Event): void => { event.preventDefault(); this.#cleanup?.(); this.#cleanup=undefined; this.#onError("Mountain graphics context interrupted. Waiting to restore…"); };
  #restored = (): void => { try { this.#cleanup=this.#start(); this.#onError(undefined); } catch(error) { this.#onError(String(error)); } };
  setSettings(settings: MountainSettings): void { this.#settings.current=settings; this.#wake.current(); }
  resumeOpening(): void { this.#opening.current(); }
  replay(): void { this.#cleanup?.(); this.#cleanup=this.#start(); }
  dispose(): void { this.#cleanup?.(); this.#cleanup=undefined; this.#canvas.removeEventListener("webglcontextlost",this.#lost); this.#canvas.removeEventListener("webglcontextrestored",this.#restored); }
}

export const BLINKING_SQUARES_CONTROLS = [
  ["gridSize", "网格密度", "Grid density", 8, 200, 1],
  ["squareSize", "方块大小", "Square size", .05, .98, .01],
  ["fadeStart", "渐隐起点", "Fade start", 0, .99, .01],
  ["fadeEnd", "渐隐终点", "Fade end", .01, 1, .01],
  ["falloff", "密度衰减", "Density falloff", .3, 6, .05],
  ["minBrightness", "最低亮度", "Minimum brightness", 0, 1, .01],
  ["twinkleSpeed", "闪烁速度", "Twinkle speed", 0, 4, .05],
  ["twinkleStrength", "闪烁强度", "Twinkle strength", 0, 1, .01],
  ["intensity", "整体亮度", "Intensity", 0, 2, .01],
  ["opacity", "方块不透明度", "Square opacity", 0, 1, .01],
  ["interactionRadius", "交互半径", "Interaction radius", 20, 500, 1],
  ["interactionStrength", "交互强度", "Interaction strength", 0, 3, .01],
  ["brightnessBoost", "悬停提亮", "Hover brightness", 0, 3, .01],
  ["densityBoost", "悬停密度", "Hover density", 0, 1, .01],
  ["inertiaDuration", "交互余迹", "Interaction inertia", 0, 4, .05],
  ["holdLiftSpeed", "长按抬升速度", "Hold lift speed", 0, 3, .05],
  ["pulseStrength", "脉冲强度", "Pulse strength", 0, 15, .05],
  ["pulseLift", "脉冲抬升", "Pulse lift", 0, 90, .05],
  ["pulseSpeed", "脉冲速度", "Pulse speed", 20, 3500, 10],
  ["pulseDecay", "脉冲持续", "Pulse duration", .12, 20, .01],
  ["keyboardPulseLimit", "键盘波纹上限", "Keyboard wave limit", 1, 12, 1],
  ["keyboardPeakCooldown", "满额冷却时间", "Wave limit cooldown", 0, 10, .1],
  ["introDuration", "开场时长", "Opening duration", .2, 10, .1],
  ["introIntensity", "开场强度", "Opening intensity", 0, 2.5, .05],
  ["dpr", "像素比上限", "DPR limit", 1, 3, .1],
] as const;

export function normalizeBlinkingSquaresSettings(value: unknown): BlinkingSquaresSettings {
  const record = isObjectRecord(value) ? value : {};
  const result = { ...BLINKING_SQUARES_DEFAULTS };
  for (const [key, , , min, max] of BLINKING_SQUARES_CONTROLS) {
    result[key] = clampParticleNumber(record[key], min, max, BLINKING_SQUARES_DEFAULTS[key]);
  }
  if (record.direction === "right" || record.direction === "left" || record.direction === "top" || record.direction === "bottom") result.direction = record.direction;
  for (const key of ["squareColor", "backgroundColor"] as const) {
    if (typeof record[key] === "string" && /^#[0-9a-f]{6}$/i.test(record[key])) result[key] = record[key];
  }
  for (const key of ["mouseInteraction", "keyboardInteraction", "introEnabled", "paused"] as const) {
    if (typeof record[key] === "boolean") result[key] = record[key];
  }
  result.responseSpeed = clampParticleNumber(record.responseSpeed, 1, 32, BLINKING_SQUARES_DEFAULTS.responseSpeed);
  return result;
}

export function readBlinkingSquaresBackgroundSettings(): BlinkingSquaresSettings {
  try { return normalizeBlinkingSquaresSettings(JSON.parse(localStorage.getItem(BLINKING_SQUARES_BACKGROUND_SETTINGS_KEY) || "{}")); }
  catch { return { ...BLINKING_SQUARES_DEFAULTS }; }
}

export const CLOUD_TRAIN_DEFAULTS = {speed:1,resolution:.75,feedback:.3,vignette:1,zoom:1,offset:0,amplitude:1,detail:8,exposure:1,saturation:1,hue:0,temperature:0,skyTint:"#ffffff",smokeTint:"#ffffff",trainTint:"#ffffff",introEnabled:true,introDuration:3,introFeather:.22,paused:false};

export type CloudTrainSettings = typeof CLOUD_TRAIN_DEFAULTS;

export const CLOUD_TRAIN_CONTROLS = [
["introDuration","开场时长（秒）","Opening duration (s)",.5,10,.1],
["introFeather","开场羽化宽度","Opening feather",.02,.6,.01],
["speed","行进速度","Travel speed",0,5,.01],
["zoom","视角缩放","View zoom",.5,2,.01],
["offset","垂直位置","Vertical position",-.5,.5,.01],
["amplitude","云层起伏","Cloud amplitude",0,2,.01],
["detail","噪声细节","Noise octaves",1,8,1],
["exposure","曝光亮度","Exposure",.2,2,.01],
["saturation","色彩饱和度","Saturation",0,2,.01],
["hue","整体色相","Global hue",-180,180,1],
["temperature","冷暖色温","Temperature",-1,1,.01],
["resolution","渲染比例","Render scale",.25,1,.05],
["feedback","帧间拖影","Frame feedback",0,.85,.01],
["vignette","暗角强度","Vignette",0,1,.01],
] as const;

export const CLOUD_TRAIN_TINTS = [["skyTint","天空染色","Sky tint"],["smokeTint","烟雾染色","Smoke tint"],["trainTint","列车染色","Train tint"]] as const;

export function normalizeCloudTrainSettings(value:unknown):CloudTrainSettings {
const record=isObjectRecord(value)?value:{}, result={...CLOUD_TRAIN_DEFAULTS};
for(const [key,,,min,max] of CLOUD_TRAIN_CONTROLS)result[key]=clampParticleNumber(record[key],min,max,CLOUD_TRAIN_DEFAULTS[key]);
result.detail=Math.round(result.detail);
result.introEnabled=typeof record.introEnabled==="boolean"?record.introEnabled:true;
for(const [key] of CLOUD_TRAIN_TINTS)result[key]=typeof record[key]==="string"&&/^#[0-9a-f]{6}$/i.test(record[key])?record[key]:CLOUD_TRAIN_DEFAULTS[key];
result.paused=typeof record.paused==="boolean"?record.paused:false;
return result;
}

export function readCloudTrainBackgroundSettings():CloudTrainSettings {try{return normalizeCloudTrainSettings(JSON.parse(localStorage.getItem("code-codex:cloud-train-settings:v1")||"{}"));}catch{return {...CLOUD_TRAIN_DEFAULTS};}}

export function cloudTrainColorizeSource(source: string) {
  let result = source.replace('return vec4(0.58, 0.7, 1.0, 1.);', 'return vec4(vec3(0.58, 0.7, 1.0)*skyTint, 1.);');
  const trainStart = result.indexOf('col = mix(col, vec3(0.18');
  const smokeStart = result.indexOf('// loco smoke');
  if(trainStart < 0 || smokeStart < 0) throw new Error('Train color source markers missing');
  result = result.slice(0, trainStart) + result.slice(trainStart, smokeStart)
    .replace(/vec3\(([^()]*)\)/g, 'vec3($1)*trainTint') + result.slice(smokeStart);
  result = result.replace('if(y < 0.0) col = vec3(1.0, 0.94, 0.91);', 'if(y < 0.0) col = vec3(1.0, 0.94, 0.91)*smokeTint;')
    .replace('if(y < - 0.02) col = vec3(0.92, 0.85, 0.82);', 'if(y < - 0.02) col = vec3(0.92, 0.85, 0.82)*smokeTint;');
  return 'uniform vec3 skyTint, smokeTint, trainTint;\n' + result;
}

export function cloudTrainOpeningSource(source: string): string {
  return `uniform float intro, introFeather;
float openingLayer(float start) {
  if (intro >= 1.) return 1.;
  float width = mix(.08, .24, clamp(introFeather / .6, 0., 1.));
  return smoothstep(start, min(start + width, 1.), intro);
}
` + source
    .replace('#define layer(dh, v)  if (uv.y < h + midlevel - (dh) ) return vec4(v, 1.);',
      '#define layer(dh, v) { float p=openingLayer(dist>=10. ? .08+.60*(100.-dist)/90. : (dist>1.5 ? .78 : .88)); if(dist!=matchedDepth && uv.y < h + midlevel - (dh)) { matchedDepth=dist; accumulated.rgb+=(1.-accumulated.a)*p*(v); accumulated.a+=(1.-accumulated.a)*p; if(accumulated.a>=1.) return accumulated; } }')
    .replaceAll('float midlevel;', 'vec4 accumulated=vec4(0.); float matchedDepth=-1.; float midlevel;')
    .replace('return vec4(0.95, 0.80, 0.77, 0.);',
      'return vec4(accumulated.a>0. ? accumulated.rgb/accumulated.a : vec3(0.95,0.80,0.77),accumulated.a);')
    .replace('return vec4(vec3(0.58, 0.7, 1.0)*skyTint, 1.);',
      'return vec4(accumulated.rgb+(1.-accumulated.a)*mix(vec3(.008,.035,.051),vec3(0.58, 0.7, 1.0)*skyTint,openingLayer(0.)), 1.);')
    .replace('vec3 col = bg.rgb;', 'vec3 col = bg.rgb; vec3 openingBackground = col;')
    .replace('col = mix(col, fg.rgb, fg.a);',
      'col = mix(openingBackground, col, openingLayer(.70)); col = mix(col, fg.rgb, fg.a);');
}

export function cloudTrainTintRgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [1, 1, 1];
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export class CloudTrainRenderer {
#canvas:HTMLCanvasElement; #settings:{current:CloudTrainSettings}; #wake={current:()=>{}}; #opening={current:()=>{}}; #cleanup:(()=>void)|undefined; #onError:(message:string|undefined)=>void;
constructor(_layer:HTMLElement,canvas:HTMLCanvasElement,settings:CloudTrainSettings,onError:(message:string|undefined)=>void){this.#canvas=canvas;this.#settings={current:settings};this.#onError=onError;this.#cleanup=this.#start();canvas.addEventListener("webglcontextlost",this.#lost);canvas.addEventListener("webglcontextrestored",this.#restored);}
#start(): (()=>void)|undefined {
const state=this.#settings,wake=this.#wake,opening=this.#opening,canvas=this.#canvas;
const original="float noise(vec2 x){\n    vec2 f = fract(x);\n    vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);\n    vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);\n    \n    vec2 p = floor(x);\n\tfloat a = texture(iChannel0, (p+vec2(0.0, 0.0))/1024.0).x;\n\tfloat b = texture(iChannel0, (p+vec2(1.0,0.0))/1024.0).x;\n\tfloat c = texture(iChannel0, (p+vec2(0.0,1.0))/1024.0).x;\n\tfloat d = texture(iChannel0, (p+vec2(1.0,1.0))/1024.0).x;\n\n    \n\treturn a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y;\n}\n\nfloat fbm(vec2 x, int detail){\n    float a = 0.0;\n    float b = 1.0;\n    float t = 0.0;\n    for(int i = 0; i < detail; i++){\n        float n = noise(x);\n        a += b*n;\n        t += b;\n        b *= 0.7;\n        x *= 2.0; \n    \n    }\n    return a/t;\n}\n\nfloat fbm2(vec2 x, int detail){\n    float a = 0.0;\n    float b = 1.0;\n    float t = 0.0;\n    for(int i = 0; i < detail; i++){\n        float n = noise(x);\n        a += b*n;\n        t += b;\n        b *= 0.9;\n        x *= 2.0; \n    \n    }\n    return a/t;\n}\n\nfloat box(vec2 uv, float x1, float x2, float y1, float y2){\n    return (uv.x > x1 && uv.x < x2 && uv.y > y1 && uv.y < y2)?1.0:0.0;\n} \n\n#define dot2(v) dot(v, v)\n#define layer(dh, v)  if (uv.y < h + midlevel - (dh) ) return vec4(v, 1.);\n\nvec4 foreground(vec2 uv, float t){\n    float midlevel;\n    float h;\n    float disp;\n    float dist;\n    vec2 uv2;\n    \n    uv.y -= 0.2;\n    // clouds foreground //////////////////////////////////////////////////////////////\n    \n    // c14\n    midlevel = -0.1;\n    disp = 1.7;\n    dist = 1.0;\n    uv2 = uv + vec2(t/dist + 40.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.12, vec3(0.43, 0.32, 0.31));\n    layer(0.08, vec3(0.55, 0.42, 0.41));\n    layer(0.04, vec3(0.66, 0.42, 0.40));\n    layer(0., vec3(0.77, 0.48, 0.46));\n    \n    // c13\n    \n    midlevel = 0.05;\n    disp = 1.7;\n    dist = 2.0;\n    uv2 = uv + vec2(t/dist + 38.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.1, vec3(0.95, 0.66, 0.48));\n    layer(0.04, vec3(0.98, 0.76, 0.64));\n    layer(0., vec3(0.95, 0.80, 0.77));\n    \n    return vec4(0.95, 0.80, 0.77, 0.);\n}\n\nvec4 background(vec2 uv, float t){\n    float midlevel;\n    float h;\n    float disp;\n    float dist;\n    vec2 uv2;\n    \n    // clouds ///////////////////////////////////////////////////////\n    \n    // c12\n    midlevel = 0.3;\n    disp = 0.9;\n    dist = 10.0;\n    uv2 = uv + vec2(t/dist + 32.5, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.14, vec3(0.48, 0.19, 0.20));\n    layer(0.1, vec3(0.68, 0.28, 0.19));\n    layer(0.07, vec3(0.88, 0.38, 0.24));\n    layer(0., vec3(0.95, 0.45, 0.30));\n    \n    // c11\n    midlevel = 0.35;\n    disp = 1.0;\n    dist = 15.0;\n    uv2 = uv + vec2(t/dist + 30.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.04, vec3(0.98, 0.76, 0.64));\n    layer(0., vec3(0.95, 0.80, 0.77));\n    \n    // c10\n    midlevel = 0.35;\n    disp = 3.5;\n    dist = 20.0;\n    uv2 = uv + vec2(t/dist + 27.5, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.12, vec3(0.43, 0.32, 0.31));\n    layer(0.08, vec3(0.55, 0.42, 0.41));\n    layer(0.04, vec3(0.66, 0.42, 0.40));\n    layer(0., vec3(0.77, 0.48, 0.46));\n    \n    // c9\n    midlevel = 0.45;\n    disp = 2.0;\n    dist = 25.0;\n    uv2 = uv + vec2(t/dist + 23.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.04, vec3(0.98, 0.57, 0.36));\n    layer(0., vec3(1.0, 0.62, 0.44));\n    \n    // c8\n    midlevel = 0.5;\n    disp = 2.3;\n    dist = 30.0;\n    uv2 = uv + vec2(t/dist + 20.5, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.12, vec3(0.41, 0.27, 0.27));\n    layer(0.08, vec3(0.53, 0.35, 0.32));\n    layer(0.04, vec3(0.80, 0.24, 0.17));\n    layer(0., vec3(0.99, 0.29, 0.20));\n    \n    // c7\n    midlevel = 0.5;\n    disp = 2.5;\n    dist = 35.0;\n    uv2 = uv + vec2(t/dist + 18.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.1, vec3(0.88, 0.38, 0.24));\n    layer(0.05, vec3(0.98, 0.42, 0.28));\n    layer(0., vec3(1.0, 0.48, 0.35));\n    \n    // c6\n    midlevel = 0.6;\n    disp = 2.0;\n    dist = 40.0;\n    uv2 = uv + vec2(t/dist + 18.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.1, vec3(0.95, 0.66, 0.48));\n    layer(0., vec3(1.0, 0.76, 0.60));\n    \n    // c5\n    midlevel = 0.75;\n    disp = 3.5;\n    dist = 45.0;\n    uv2 = uv + vec2(t/dist + 15.5, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.2, vec3(1.0, 0.55, 0.33));\n    layer(0.15, vec3(0.98, 0.50, 0.24));\n    layer(0.1, vec3(0.90, 0.55, 0.40));\n    layer(0., vec3(1.0, 0.62, 0.44));\n    \n    // c4\n    midlevel = 0.7;\n    disp = 2.7;\n    dist = 50.0;\n    uv2 = uv + vec2(t/dist + 12.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.04, vec3(0.73, 0.36, 0.30));\n    layer(0., vec3(0.80, 0.40, 0.34));\n    \n    // c3\n    midlevel = 0.8;\n    disp = 2.7;\n    dist = 60.0;\n    uv2 = uv + vec2(t/dist + 9.5, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.1, vec3(0.93, 0.58, 0.35));\n    layer(0., vec3(1.0, 0.76, 0.60));\n    \n    // c2\n    midlevel = 0.9;\n    disp = 3.0;\n    dist = 70.0;\n    uv2 = uv + vec2(t/dist + 7.0, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.1, vec3(0.56, 0.25, 0.22));\n    layer(0.05, vec3(0.60, 0.30, 0.27));\n    layer(0., vec3(0.74, 0.35, 0.30));\n    \n    // c1\n    midlevel = 1.0;\n    disp = 5.0;\n    dist = 100.0;\n    uv2 = uv + vec2(t/dist + 3.5, 0.0);\n    h = (fbm(uv2, 8) - 0.5)*disp;\n    layer(0.1, vec3(0.92, 0.85, 0.82));\n    layer(0., vec3(1.0, 0.94, 0.91));\n    \n    return vec4(0.58, 0.7, 1.0, 1.);\n}\n\nvoid mainImage( out vec4 fragColor, in vec2 fragCoord )\n{\n    vec2 uv = fragCoord/iResolution.y;\n    //uv.x += iTime;\n    float t = iTime*4.0;\n    vec4 bg = background(uv, t);\n    \n    vec4 fg = vec4(0.);\n    int n = 5;\n    if (uv.y < 0.5)\n    for (int i = 0; i < n; i++){\n        fg += foreground(uv, t+4.*float(i)/float(n)/60.) / (float(n));\n    }\n    \n    vec3 col = bg.rgb;\n    // train /////////////////////////////////////////////////////////////////////\n    float k;\n    float midlevel;\n    float h;\n    float disp;\n    float dist;\n    vec2 uv2;\n    uv.y -= 0.2;\n    // choo choo\n    k = 1.0;\n    uv2 = fract(uv*9.0);\n    float wagon = 1.0;\n    wagon *= 1.0 - step(0.45, uv.x);\n    wagon *= 1.0 - step(0.115, uv.y);\n    wagon *= step(0.103, uv.y);\n    wagon *= step(0.05, 1.0 - abs(uv2.x*2.0 - 1.0));\n    \n    float join = 1.0; \n    join *= 1.0 - step(0.45, uv.x);\n    join *= 1.0 - step(0.11, uv.y);\n    join *= step(0.107, uv.y);\n    \n    \n    float roof = 1.0;\n    roof *= 1.0 - step(0.45, uv.x);\n    roof *= 1.0 - step(0.117, uv.y);\n    roof *= step(0.11, uv.y);\n    roof *= step(0.15, 1.0 - abs(uv2.x*2.0 - 1.0));\n    \n    float loco = box(uv, 0.45, 0.5, 0.103, 0.112);\n    float chem1 = box(uv, 0.49, 0.495, 0.103, 0.12);\n    float chem2 = box(uv, 0.488, 0.496, 0.12, 0.123);\n    float locoRoof = box(uv, 0.443, 0.47, 0.11, 0.117);\n    \n    float wheel = 1.0 - step(0.00004, dot2(uv - vec2(0.457, 0.106)));\n    wheel += 1.0 - step(0.00002, dot2(uv - vec2(0.487, 0.105)));\n    wheel += 1.0 - step(0.00002, dot2(uv - vec2(0.497, 0.105)));\n    \n    if (uv.x < 0.45 && uv.y > 0.025 && uv.y < 0.2){\n        wheel += 1.0 - step(0.002, dot2(uv2 - vec2(0.2, 0.95)));\n        wheel += 1.0 - step(0.002, dot2(uv2 - vec2(0.8, 0.95)));\n    }\n    col = mix(col, vec3(0.18, 0.12, 0.15), join);\n    col =  mix(col, vec3(0.48, 0.19, 0.20), wagon);\n    col = mix(col, vec3(0.18, 0.12, 0.15), roof);\n    \n    col = mix(col, vec3(0.38, 0.19, 0.20), loco);\n    col = mix(col, vec3(0.38, 0.19, 0.20), chem1);\n    col = mix(col, vec3(0.18, 0.12, 0.15), locoRoof);\n    col = mix(col, vec3(0.18, 0.12, 0.15), chem2 + wheel);\n    // loco smoke //////\n    \n    dist = 5.0;\n    uv2 = uv + vec2(t/dist + 3.5, 0.0);\n    uv2.x -= t/dist*0.2;\n    h = fbm2(uv2, 8) - 0.55;\n    \n    if(uv.x < 0.49){\n        float x = -uv.x + 0.49;\n        float y = abs(uv.y + h*0.4 - 0.16*sqrt(x) - 0.12) - 0.8*x*exp(-x*10.0);\n        if(y < 0.0) col = vec3(1.0, 0.94, 0.91);\n        if(y < - 0.02) col = vec3(0.92, 0.85, 0.82);\n    }\n    \n    //bridge ///////\n    dist = 5.0;\n    uv2 = uv + vec2(t/dist + 32.5, 0.0);\n    uv2.x = fract(uv2.x*3.0);\n    k = 1.0;\n    k *= smoothstep(0.001, 0.003, abs(uv2.y - pow(uv2.x - 0.5, 2.0)*0.15 - 0.12));\n    k *= min(step(0.05, 1.0 - abs(uv2.x*2.0 - 1.0))\n         +   step(0.17, uv2.y), 1.0);\n    k *= min(smoothstep(0.02, 0.05, 1.0 - abs(uv2.x*2.0 - 1.0))\n         +   step(0.177, uv2.y), 1.0);\n         \n    k *= min(step(0.1, uv2.y)\n           + smoothstep(-0.09, -0.085, -uv2.y - 0.001/(1.0 - abs(uv2.x*2.0 - 1.0))), 1.0);\n           \n    k *= min(smoothstep(0.05, 0.2, 1.0 - abs(fract(uv2.x*16.0)*2.0 - 1.0))\n         +   step(0.12, uv2.y - pow(uv2.x - 0.5, 2.0)*0.15)\n         +   step(-0.1, -uv2.y), 1.0);\n    col = mix(vec3(0.29, 0.09, 0.08)*smoothstep(-0.08, 0.08, uv.y), col, k);\n    \n    \n    \n    col = mix(col, fg.rgb, fg.a);\n\n    // Output to screen\n    uv = fragCoord/iResolution.xy;\n    col = mix(col, texture(iChannel1, uv).rgb, 0.3);\n    fragColor = vec4(col,1.0);\n}\n\n";
const imageSource="#version 300 es\nprecision highp float;\nuniform sampler2D scene;\nuniform vec2 resolution;\nuniform float vignette;\nuniform float exposure, saturation;\nuniform float hue, temperature;\nuniform float intro, introFeather;\nout vec4 color;\nvoid main(){\nvec2 uv=gl_FragCoord.xy/resolution;\nvec3 col=texture(scene,uv).rgb;\nif(hue!=0.){\n  vec3 axis=normalize(vec3(1.));\n  float angle=radians(hue);\n  col=col*cos(angle)+cross(axis,col)*sin(angle)+axis*dot(axis,col)*(1.-cos(angle));\n}\ncol*=vec3(1.+temperature*.25,1.,1.-temperature*.25);\ncol=max(col,vec3(0.));\ncol=mix(vec3(dot(col,vec3(.2126,.7152,.0722))),col,saturation)*exposure;\ncol*=mix(1.,.5+.5*pow(max(16.*uv.x*uv.y*(1.-uv.x)*(1.-uv.y),0.),.2),vignette);\nif(intro<1.){\n  float eased=intro*intro*(3.-2.*intro);\n  float edge=mix(-introFeather,1.+introFeather,eased);\n  float reveal=1.-smoothstep(edge-introFeather,edge+introFeather,uv.x);\n  col=mix(vec3(.008,.035,.051),col,reveal);\n}\ncolor=vec4(col,1.);\n}\n";
const vertex='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}';
const fragment='#version 300 es\nprecision highp float;\nuniform vec3 iResolution;uniform float iTime,uFeedback,zoom,offset,amplitude,uDetail;uniform sampler2D iChannel0,iChannel1;out vec4 result;\n'+cloudTrainOpeningSource(cloudTrainColorizeSource(original)).replace('texture(iChannel1, uv).rgb, 0.3','texture(iChannel1, uv).rgb, uFeedback').replace('vec2 uv = fragCoord/iResolution.y;', 'vec2 uv = (fragCoord/iResolution.y - .5*iResolution.xy/iResolution.y)/zoom + .5*iResolution.xy/iResolution.y; uv.y -= offset;').replaceAll('(fbm(uv2, 8) - 0.5)*disp','(fbm(uv2, 8) - 0.5)*disp*amplitude').replaceAll('i < detail;', 'i < min(detail, int(uDetail));')+'\nvoid main(){mainImage(result,gl_FragCoord.xy);}';

const el=this.#canvas,gl=el.getContext('webgl2',{alpha:false,antialias:false,depth:false});
if(!gl){throw new Error('WebGL 2 is required');}
const programs:WebGLProgram[]=[],textures:WebGLTexture[]=[],buffers:WebGLBuffer[]=[],fbos:WebGLFramebuffer[]=[];
let raf=0,last=0,time=0,w=0,h=0,read=0,history=false,dead=false;
let introProgress=state.current.paused?1:0;
function program(src:string){const p=gl!.createProgram()!;programs.push(p);
for(const [type,source] of [[gl!.VERTEX_SHADER,vertex],[gl!.FRAGMENT_SHADER,src]] as const){
const s=gl!.createShader(type)!;gl!.shaderSource(s,source);gl!.compileShader(s);
if(!gl!.getShaderParameter(s,gl!.COMPILE_STATUS)){const e=gl!.getShaderInfoLog(s);gl!.deleteShader(s);throw Error(e||'Shader error');}
gl!.attachShader(p,s);gl!.deleteShader(s);}
gl!.bindAttribLocation(p,0,'p');gl!.linkProgram(p);if(!gl!.getProgramParameter(p,gl!.LINK_STATUS))throw Error(gl!.getProgramInfoLog(p)||'Link error');return p;}
function texture(){const t=gl!.createTexture()!;textures.push(t);gl!.bindTexture(gl!.TEXTURE_2D,t);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);return t;}
function clean(){dead=true;cancelBackgroundFrame(raf);programs.forEach(p=>gl!.deleteProgram(p));textures.forEach(t=>gl!.deleteTexture(t));buffers.forEach(b=>gl!.deleteBuffer(b));fbos.forEach(f=>gl!.deleteFramebuffer(f));}
try{
// Keep five foreground samples, but reduce their temporal spread to one third.
const scene=program(fragment.replace('t+4.*float(i)/float(n)/60.', 't+(4./3.)*float(i)/float(n)/60.')),post=program(imageSource);
const locations=<const T extends readonly string[]>(p:WebGLProgram,n:T)=>Object.fromEntries(n.map(k=>[k,gl.getUniformLocation(p,k)])) as Record<T[number], WebGLUniformLocation | null>;
const tintKeys=['skyTint','smokeTint','trainTint'] as const;
const a=locations(scene,['iResolution','iTime','iChannel0','iChannel1','uFeedback','zoom','offset','amplitude','uDetail','intro','introFeather',...tintKeys]),b=locations(post,['resolution','scene','vignette','exposure','saturation','hue','temperature','intro','introFeather']);
const quad=gl.createBuffer()!;buffers.push(quad);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
// Restore the original deterministic noise; supplied thumbnail is retained as an asset only.
const noise=texture(),data=new Uint8Array(1024*1024);let seed=93451;
for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=seed&255;}
gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1024,1024,0,gl.RED,gl.UNSIGNED_BYTE,data);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
const targets=[texture(),texture()];for(const t of targets){gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);fbos.push(gl.createFramebuffer()!);}
const media=matchMedia('(prefers-reduced-motion: reduce)');
function request(){if(!dead&&!raf&&!document.hidden)raf=requestBackgroundFrame(canvas, draw);}
const uniformCache=new Map<WebGLUniformLocation,number|string>();
function scalar(location:WebGLUniformLocation|null,value:number){if(location&&uniformCache.get(location)!==value){gl!.uniform1f(location,value);uniformCache.set(location,value);}}
function tint(location:WebGLUniformLocation|null,value:string){if(location&&uniformCache.get(location)!==value){gl!.uniform3f(location,...cloudTrainTintRgb(value));uniformCache.set(location,value);}}
const bounds=el.getBoundingClientRect();let cssWidth=bounds.width,cssHeight=bounds.height;
let pixelWidth=1,pixelHeight=1,scale=state.current.resolution;
const maxViewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
function updatePixelSize(){const d=Math.min(devicePixelRatio||1,1.5)*scale;pixelWidth=Math.max(1,Math.min(maxViewport[0]!,Math.round(cssWidth*d)));pixelHeight=Math.max(1,Math.min(maxViewport[1]!,Math.round(cssHeight*d)));}
updatePixelSize();
// Each texture owns a unit: resize uploads and rendering share this cache.
let activeUnit=-1;
const boundTextures=new Map<number,WebGLTexture>();
function bindTexture(unit:number,t:WebGLTexture){
if(boundTextures.get(unit)===t)return;
if(activeUnit!==unit){gl!.activeTexture(gl!.TEXTURE0+unit);activeUnit=unit;}
gl!.bindTexture(gl!.TEXTURE_2D,t);boundTextures.set(unit,t);
}
function activate(unit:number){if(activeUnit!==unit){gl!.activeTexture(gl!.TEXTURE0+unit);activeUnit=unit;}}
bindTexture(0,noise);targets.forEach((t,i)=>bindTexture(i+1,t));
gl.useProgram(scene);gl.uniform1i(a.iChannel0,0);gl.uniform1i(a.iChannel1,1);
gl.useProgram(post);gl.uniform1i(b.scene,2);
function draw(now:number){
raf=0;const s=state.current;
if(!s.introEnabled||media.matches)introProgress=1;
else if(!s.paused)introProgress=Math.min(1,introProgress+Math.min((now-(last||now))/1000,.05)/s.introDuration);
if(!s.paused&&!media.matches)time+=Math.min((now-(last||now))/1000,.05)*s.speed;last=now;
const nw=pixelWidth,nh=pixelHeight;
if(w!==nw||h!==nh){w=nw;h=nh;el.width=w;el.height=h;history=false;
targets.forEach((t,i)=>{bindTexture(i+1,t);activate(i+1);gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,w,h,0,gl!.RGBA,gl!.UNSIGNED_BYTE,null);gl!.bindFramebuffer(gl!.FRAMEBUFFER,fbos[i] ?? null);gl!.framebufferTexture2D(gl!.FRAMEBUFFER,gl!.COLOR_ATTACHMENT0,gl!.TEXTURE_2D,t,0);gl!.clearColor(0,0,0,1);gl!.clear(gl!.COLOR_BUFFER_BIT);});
gl!.useProgram(scene);gl!.uniform3f(a.iResolution,w,h,1);
gl!.useProgram(post);gl!.uniform2f(b.resolution,w,h);
gl!.viewport(0,0,w,h);
}
const write=1-read;
gl!.bindFramebuffer(gl!.FRAMEBUFFER,fbos[write]!);gl!.useProgram(scene);
gl!.uniform1i(a.iChannel1,read+1);
for(const key of tintKeys)tint(a[key]!,s[key]);
scalar(a.zoom,s.zoom);scalar(a.offset,s.offset);scalar(a.amplitude,s.amplitude);scalar(a.uDetail,s.detail);
scalar(a.intro,introProgress);scalar(a.introFeather,s.introFeather);scalar(a.iTime,time);scalar(a.uFeedback,history&&introProgress>=1?s.feedback:0);gl!.drawArrays(gl!.TRIANGLES,0,3);
gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);gl!.useProgram(post);gl!.uniform1i(b.scene,write+1);scalar(b.intro,1);scalar(b.introFeather,s.introFeather);scalar(b.vignette,s.vignette);scalar(b.exposure,s.exposure);scalar(b.saturation,s.saturation);scalar(b.hue,s.hue);scalar(b.temperature,s.temperature);gl!.drawArrays(gl!.TRIANGLES,0,3);read=write;history=true;
if(!s.paused&&!media.matches&&(s.speed!==0||introProgress<1))request();
}
const reset=()=>{cancelBackgroundFrame(raf);raf=0;last=0;history=false;if(scale!==state.current.resolution){scale=state.current.resolution;updatePixelSize();}request();};opening.current=()=>{time=0;introProgress=state.current.paused?1:0;reset();};wake.current=reset;
let dprQuery:MediaQueryList;
const dprChanged=()=>{dprQuery?.removeEventListener('change',dprChanged);dprQuery=matchMedia('(resolution: '+(devicePixelRatio||1)+'dppx)');dprQuery.addEventListener('change',dprChanged);updatePixelSize();reset();};
dprChanged();
const resize=new ResizeObserver(([entry])=>{if(!entry)return;cssWidth=entry.contentRect.width;cssHeight=entry.contentRect.height;updatePixelSize();reset();});resize.observe(el);document.addEventListener('visibilitychange',reset);media.addEventListener('change',reset);request();
return()=>{resize.disconnect();dprQuery.removeEventListener('change',dprChanged);document.removeEventListener('visibilitychange',reset);media.removeEventListener('change',reset);wake.current=()=>{};opening.current=()=>{};clean();};
}catch(e){clean();throw e;}

}
#lost=(e:Event):void=>{e.preventDefault();this.#cleanup?.();this.#cleanup=undefined;this.#onError("Cloud Train graphics context interrupted. Waiting to restore…");};
#restored=():void=>{try{this.#cleanup=this.#start();this.#onError(undefined);}catch(e){this.#onError(String(e));}};
setSettings(s:CloudTrainSettings):void{this.#settings.current=s;this.#wake.current();}
resumeOpening():void{this.#opening.current();}
replay():void{this.#cleanup?.();this.#cleanup=this.#start();}
dispose():void{this.#cleanup?.();this.#cleanup=undefined;this.#canvas.removeEventListener("webglcontextlost",this.#lost);this.#canvas.removeEventListener("webglcontextrestored",this.#restored);}
}

export const BLACK_HOLE_VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const BLACK_HOLE_SCENE_FRAGMENT_SHADER = `
precision highp float;

#define MAX_STEPS __MAX_STEPS__
#define HAS_FIXED_STEPS __HAS_FIXED_STEPS__
#define HAS_STARS __HAS_STARS__

varying vec2 vUv;

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform vec3  uRight;
uniform vec3  uUp;
uniform vec3  uFwd;
uniform float uTanHalf;
uniform vec2  uFocus;
#if HAS_FIXED_STEPS == 0
uniform float uSteps;
#endif
uniform float uSkyR;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uThick;
uniform float uDensity;
uniform float uSpin;
// x/y/z/w = first wind phase/second wind phase/blend/spin time offset.
uniform vec4  uWind;
uniform float uGrain;
uniform float uBright;
uniform float uDoppler;
uniform vec3  uHot;
uniform vec3  uMid;
uniform vec3  uCool;
#if HAS_STARS
uniform float uStars;
#endif
uniform float uEncode;
uniform vec2  uJitter;
uniform float uSeed;

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm(vec3 p, float lod) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i != 3 || lod > 0.0) {
      s += (i == 3 ? a * lod : a) * vnoise(p);
    }
    p = p * 2.03 + vec3(11.3, 7.1, 3.7);
    a *= 0.5;
  }
  return s;
}

void gasAt(
  vec3 p,
  float rd,
  float dt,
  float diskSpanInverse,
  out float dens,
  out vec3 tint,
  out float heat
) {
  float rn = clamp((rd - uDiskIn) * diskSpanInverse, 0.0, 1.0);
  float tk = uThick * (0.35 + 1.25 * rn);
  float v = p.y / tk;
  float sheet = exp(-v * v);
  float q = uDiskIn / rd;
  float inner = smoothstep(0.0, 0.07, rn);
  float outer = 1.0 - smoothstep(0.45, 1.0, rn);
  float prof = inner * outer * q * q;
  if (sheet * prof * uDensity * 10.0 <= 0.001) {
    dens = 0.0;
    tint = vec3(0.0);
    heat = 0.0;
    return;
  }

  float lod = clamp(1.0 - dt * uGrain * 14.0, 0.0, 1.0);
  float phi = atan(p.z, p.x);
  float omega = uSpin * pow(q, 1.5);
  float lr = log(rd) * 1.1 + uWind.w;

  float cloudsA = fbm(vec3(vec2(cos(phi + omega * uWind.x),
                                sin(phi + omega * uWind.x)) * (rd * uGrain), lr), lod);
  float cloudsB = fbm(vec3(vec2(cos(phi + omega * uWind.y),
                                sin(phi + omega * uWind.y)) * (rd * uGrain), lr + 40.0), lod);
  float clouds = mix(cloudsA, cloudsB, uWind.z);
  float filaments = clouds * clouds * 1.75;
  dens = max(0.0, filaments * 1.5 - 0.30) * sheet * prof * uDensity * 4.6;

  if (dens <= 0.001) {
    tint = vec3(0.0);
    heat = 0.0;
    return;
  }

  heat = pow(q, 0.8) * (0.72 + 0.55 * clouds);
  tint = mix(uCool, uMid, smoothstep(0.10, 0.52, heat));
  tint = mix(tint, uHot, smoothstep(0.52, 1.05, heat));
}

#if HAS_STARS
vec3 starField(vec3 d) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z)      { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z)               { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else                               { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }

  vec3 col = vec3(0.0);
  float octaveScale = 1.0;
  for (int k = 0; k < 3; k++) {
    float sc = 90.0 * octaveScale;
    vec2 p = uv * sc;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = hash13(vec3(id, face * 19.0));
    if (h > 0.965) {
      vec2 off = vec2(hash13(vec3(id, face + 11.0)), hash13(vec3(id, face + 23.0)));
      float dd = length(f - (off - 0.5) * 0.7);
      float s = smoothstep(0.055, 0.0, dd);
      float warm = hash13(vec3(id, face + 51.0));
      col += s * (0.6 + 4.5 * fract(h * 97.0))
           * mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.72), warm)
           / octaveScale;
    }
    octaveScale *= 2.2;
  }
  col += vec3(0.013, 0.017, 0.030) * fbm(d * 2.6, 1.0);
  return col;
}
#endif

#if HAS_STARS == 0
bool missesVisibleDisc(vec3 origin, vec3 direction) {
  // Test a deliberately expanded cylinder around the emitting gas. Rays that
  // miss both this volume and the central strong-lensing zone cannot
  // contribute visible light, so they can skip the expensive integration.
  float cullOuter = uDiskOut * 1.16 + 0.65;
  float cullHalfThickness = uThick * 6.5 + 0.35;
  if (length(origin.xz) <= cullOuter + 0.5) return false;

  vec2 radialOrigin = origin.xz;
  vec2 radialDirection = direction.xz;
  float a = dot(radialDirection, radialDirection);
  float b = dot(radialOrigin, radialDirection);
  float c = dot(radialOrigin, radialOrigin) - cullOuter * cullOuter;
  float discriminant = b * b - a * c;
  bool intersectsExpandedDisc = false;

  if (a > 0.00001 && discriminant >= 0.0) {
    float root = sqrt(discriminant);
    float nearTime = (-b - root) / a;
    float farTime = (-b + root) / a;
    if (farTime > 0.0) {
      nearTime = max(0.0, nearTime);
      float nearY = origin.y + direction.y * nearTime;
      float farY = origin.y + direction.y * farTime;
      intersectsExpandedDisc = min(nearY, farY) <= cullHalfThickness
                            && max(nearY, farY) >= -cullHalfThickness;
    }
  }

  float impactParameter = length(cross(origin, direction));
  float lensingRadius = min(cullOuter, max(8.0, uDiskIn * 1.8 + 1.0));
  return !intersectsExpandedDisc && impactParameter > lensingRadius;
}
#endif

void main() {
  vec2 uv = (gl_FragCoord.xy + uJitter - uFocus * uRes) / uRes.y;
  vec3 dir = normalize(uFwd + (uv.x * uRight + uv.y * uUp) * 2.0 * uTanHalf);
#if HAS_STARS == 0
  if (missesVisibleDisc(uCamPos, dir)) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
#endif
  vec3 pos = uCamPos;
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float h = sqrt(h2);
  float swept = 0.0;
  vec3 col = vec3(0.0);
  float transmit = 1.0;
#if HAS_STARS
  bool captured = false;
#endif
  float jitter = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  float diskSpanInverse = 1.0 / max(0.001, uDiskOut - uDiskIn);
  float diskStepRadius = uDiskOut * 1.25;
  float diskSampleHalfThickness = uThick * 5.0;

  for (int i = 0; i < MAX_STEPS; i++) {
#if HAS_FIXED_STEPS == 0
    if (float(i) >= uSteps) break;
#endif
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) {
#if HAS_STARS
      captured = true;
#endif
      break;
    }
    if (r > uSkyR && dot(pos, vel) > 0.0) break;
    if (transmit < 0.004) break;

    float dt = clamp(0.14 * (r - 1.0), 0.025, 1.1);
    if (r < diskStepRadius) {
      float rn = clamp((r - uDiskIn) * diskSpanInverse, 0.0, 1.0);
      float tk = uThick * (0.35 + 1.25 * rn);
      dt = min(dt, max(tk * 0.38, abs(pos.y) * 0.5));
    }

    swept += h * dt / r2;
    jitter = fract(jitter + 0.6180339887);
    float sampleStep = dt * jitter;
    float midY = pos.y + vel.y * sampleStep;
    if (abs(midY) < diskSampleHalfThickness) {
      vec2 midXZ = pos.xz + vel.xz * sampleStep;
      float rd = length(midXZ);
      if (rd > uDiskIn && rd < uDiskOut) {
        vec3 mid = vec3(midXZ.x, midY, midXZ.y);
        float dens;
        float heat;
        vec3 tint;
        gasAt(mid, rd, dt, diskSpanInverse, dens, tint, heat);
        if (dens > 0.001) {
          float deep = exp(-1.3 * max(0.0, swept - 4.6));
          vec3 tang = vec3(mid.z, 0.0, -mid.x) / rd;
          float beta = min(0.85, sqrt(0.5 / max(rd, 1.5)));
          float gam = inversesqrt(max(1e-4, 1.0 - beta * beta));
          vec3 toObs = -normalize(vel);
          float g = 1.0 / (gam * (1.0 - beta * dot(tang, toObs)));
          g *= sqrt(max(0.05, 1.0 - 1.0 / rd));
          float boost = pow(max(g, 0.02), 3.0 * uDoppler);
          vec3 shift = mix(
            vec3(1.0),
            g > 1.0 ? vec3(0.86, 0.94, 1.14) : vec3(1.15, 0.82, 0.62),
            clamp(abs(g - 1.0) * 1.6, 0.0, 1.0) * uDoppler
          );
          float emit = uBright * (0.26 + 2.0 * heat * heat);
          col += tint * shift * (emit * boost * dens * transmit * dt * deep);
          transmit *= exp(-dens * 0.30 * dt);
        }
      }
    }

    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    vel += acc * dt;
    pos += vel * dt;
  }

#if HAS_STARS
  if (!captured && uStars > 0.001) {
    vec3 toHole = normalize(-uCamPos);
    float sI = length(cross(normalize(dir), toHole));
    float sS = length(cross(normalize(vel), toHole));
    float stretch = clamp(sI / max(1e-3, sS), 1.0, 40.0);
    col += starField(normalize(vel)) * uStars * transmit / stretch;
  }
#endif

  if (uEncode > 0.5) col = col / (1.0 + col);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function blackHoleSceneFragmentSource(starsEnabled: boolean, fixedSteps: number | null = null): string {
  return BLACK_HOLE_SCENE_FRAGMENT_SHADER
    .replace("__MAX_STEPS__", fixedSteps === null ? "460" : String(fixedSteps))
    .replace("__HAS_FIXED_STEPS__", fixedSteps === null ? "0" : "1")
    .replace("__HAS_STARS__", starsEnabled ? "1" : "0");
}

export const BLACK_HOLE_BLEND_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uAlpha;
void main() {
  vec3 c = texture2D(uCur, vUv).rgb;
  vec3 p = texture2D(uPrev, vUv).rgb;
  gl_FragColor = vec4(mix(p, c, uAlpha), 1.0);
}
`;

export const BLACK_HOLE_BRIGHT_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uDecode;
uniform float uPack;
uniform float uThreshold;
void main() {
  vec3 s = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  s *= 0.25;
  if (uDecode > 0.5) s = s / max(vec3(0.002), 1.0 - s);
  float l = max(s.r, max(s.g, s.b));
  s *= max(0.0, l - uThreshold) / max(0.0001, l);
  gl_FragColor = vec4(s * uPack, 1.0);
}
`;

export const BLACK_HOLE_BLUR_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 0.2270270;
  s += (texture2D(uTex, vUv + uStep * 1.3846154).rgb
      + texture2D(uTex, vUv - uStep * 1.3846154).rgb) * 0.3162162;
  s += (texture2D(uTex, vUv + uStep * 3.2307692).rgb
      + texture2D(uTex, vUv - uStep * 3.2307692).rgb) * 0.0702702;
  gl_FragColor = vec4(s, 1.0);
}
`;

export const BLACK_HOLE_COMPOSITE_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uDecode;
uniform float uPack;
uniform float uGlow;
uniform float uExposure;
uniform float uVignette;
uniform float uScrimDir;
uniform float uScrimAmt;
uniform float uSeed;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  if (uDecode > 0.5) scene = scene / max(vec3(0.002), 1.0 - scene);
  vec3 bloom = texture2D(uBloom, vUv).rgb / uPack;
  vec3 c = scene + bloom * uGlow;
  c = aces(c * uExposure);
  c = pow(max(c, 0.0), vec3(0.4545));
  vec2 d = vUv - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 1.9;
  if (uScrimDir > 0.5) {
    float x = uScrimDir < 1.5 ? vUv.x
            : uScrimDir < 2.5 ? 1.0 - vUv.x
            : uScrimDir < 3.5 ? 1.0 - vUv.y
            : vUv.y;
    c *= 1.0 - uScrimAmt * pow(1.0 - clamp(x, 0.0, 1.0), 2.4);
  }
  float n = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export interface BlackHoleProgram {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

export interface BlackHoleRenderTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

export interface BlackHoleRendererRuntime {
  readonly invalidate: (sceneChanged: boolean, sizeChanged: boolean) => void;
  readonly dispose: () => void;
}

export const BLACK_HOLE_FOCUS: readonly [number, number] = Object.freeze([0.72, 0.46]);

export const BLACK_HOLE_RADIANS = Math.PI / 180;

export function blackHoleHexToLinear(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  const complete = value.length === 3
    ? value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2)
    : value.slice(0, 6);
  const number = Number.parseInt(complete, 16);
  const srgb = [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
  return srgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)) as [number, number, number];
}

export function blackHoleSceneSignature(settings: BlackHoleBackgroundSettings): string {
  return [
    settings.distance,
    settings.elevation,
    settings.azimuth,
    settings.orbitSpeed,
    settings.roll,
    settings.fov,
    settings.diskInner,
    settings.diskOuter,
    settings.diskThickness,
    settings.diskDensity,
    settings.brightness,
    settings.spinSpeed,
    settings.grain,
    settings.doppler,
    settings.hotColor,
    settings.midColor,
    settings.coolColor,
    settings.starBrightness,
    settings.steps,
  ].join("|");
}

export function blackHoleSizeSignature(settings: BlackHoleBackgroundSettings): string {
  return `${settings.resolution}|${settings.maxDpr}`;
}

export function startBlackHoleRenderer(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  readSettings: () => BlackHoleBackgroundSettings,
  onError: (message?: string) => void,
): BlackHoleRendererRuntime {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reducedMotion.matches;
  const contextOptions: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  };
  const gl = (canvas.getContext("webgl2", contextOptions) || canvas.getContext("webgl", contextOptions)) as
    | WebGL2RenderingContext
    | WebGLRenderingContext
    | null;
  let reportedFailure: string | undefined;
  const giveUp = (reason: string, message: string): void => {
    host.dataset.webgl = reason;
    canvas.hidden = true;
    if (reportedFailure !== message) {
      reportedFailure = message;
      onError(message);
    }
  };
  if (!gl) {
    const message = "WebGL is unavailable; Black Hole Background could not be rendered.";
    giveUp("unsupported", message);
    throw new Error(message);
  }

  interface DebugRendererInfo { readonly UNMASKED_RENDERER_WEBGL: number }
  interface HalfFloatExtension { readonly HALF_FLOAT_OES: number }
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as DebugRendererInfo | null;
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "") : "";
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|software|microsoft basic/i.test(rendererName);
  const webGl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  const maxTextureSize = Math.max(2, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096);
  const viewportDimensions = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | number[] | null;
  const maxViewportWidth = Math.max(2, Number(viewportDimensions?.[0]) || maxTextureSize);
  const maxViewportHeight = Math.max(2, Number(viewportDimensions?.[1]) || maxTextureSize);
  const maxRenderWidth = Math.min(maxTextureSize, maxViewportWidth);
  const maxRenderHeight = Math.min(maxTextureSize, maxViewportHeight);

  const compileShader = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("black-hole: shader compilation failed", gl.getShaderInfoLog(shader) || "no log");
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const linkProgram = (fragmentSource: string): BlackHoleProgram | null => {
    const vertexShader = compileShader(gl.VERTEX_SHADER, BLACK_HOLE_VERTEX_SHADER);
    if (!vertexShader) return null;
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      return null;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("black-hole: program link failed", gl.getProgramInfoLog(program) || "no log");
      gl.deleteProgram(program);
      return null;
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index += 1) {
      const info = gl.getActiveUniform(program, index);
      if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  };

  let hdr = true;
  let textureType: number = gl.UNSIGNED_BYTE;
  let internalFormat: number = gl.RGBA;
  if (webGl2) {
    const gl2 = gl as WebGL2RenderingContext;
    const supported = gl2.getExtension("EXT_color_buffer_half_float") || gl2.getExtension("EXT_color_buffer_float");
    if (supported) {
      textureType = gl2.HALF_FLOAT;
      internalFormat = gl2.RGBA16F;
    } else {
      hdr = false;
    }
  } else {
    const halfFloat = gl.getExtension("OES_texture_half_float") as HalfFloatExtension | null;
    const colorBuffer = gl.getExtension("EXT_color_buffer_half_float");
    if (halfFloat && colorBuffer) textureType = halfFloat.HALF_FLOAT_OES;
    else hdr = false;
  }
  if (!hdr) {
    textureType = gl.UNSIGNED_BYTE;
    internalFormat = gl.RGBA;
  }
  const linearFiltering = webGl2 || Boolean(gl.getExtension("OES_texture_half_float_linear")) || !hdr;
  let textureFilter = linearFiltering ? gl.LINEAR : gl.NEAREST;
  let bloomPack = hdr ? 1 : 0.12;

  const createTarget = (width: number, height: number): BlackHoleRenderTarget | null => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, textureType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      return null;
    }
    return { framebuffer, texture, width, height };
  };

  let sceneProgram: BlackHoleProgram | null = null;
  let starSceneProgram: BlackHoleProgram | null = null;
  let starSceneUnavailable = false;
  type StepVariant = { readonly program: BlackHoleProgram; lastUsed: number };
  const stepVariants = new Map<string, StepVariant>();
  const failedStepVariants = new Set<string>();
  let stepVariantClock = 0;
  const maximumStepVariants = 6;
  let blendProgram: BlackHoleProgram | null = null;
  let brightProgram: BlackHoleProgram | null = null;
  let blurProgram: BlackHoleProgram | null = null;
  let compositeProgram: BlackHoleProgram | null = null;
  let vertexBuffer: WebGLBuffer | null = null;
  let sceneTarget: BlackHoleRenderTarget | null = null;
  let historyA: BlackHoleRenderTarget | null = null;
  let historyB: BlackHoleRenderTarget | null = null;
  let bloomA: BlackHoleRenderTarget | null = null;
  let bloomB: BlackHoleRenderTarget | null = null;
  let shownTarget: BlackHoleRenderTarget | null = null;
  let shownBloomTarget: BlackHoleRenderTarget | null = null;
  let settledFrames = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let activeProgram: WebGLProgram | null = null;
  let activeTextureUnit = -1;
  let viewportWidth = -1;
  let viewportHeight = -1;
  type PendingVariant = { readonly key: string; readonly stars: boolean; readonly steps: number };
  let pendingVariant: PendingVariant | null = null;
  let pendingVariantIdle: number | null = null;
  let pendingVariantTimer: number | null = null;
  let clock = reduced ? 6 : 0;
  let lastFrame = 0;
  let running = true;
  let inViewport = true;
  let documentVisible = !document.hidden;
  let contextReady = true;
  let allocationFailed = false;
  let animationFrame = 0;
  let needsScene = true;
  let needsComposite = true;
  let resizePending = false;
  let stillPassesRemaining = 16;
  let lastPaused = readSettings().paused || reduced;
  const sceneStaticSettings = new WeakMap<WebGLProgram, BlackHoleBackgroundSettings>();

  const effectiveSteps = (value: number): number => softwareRenderer ? 130 : Math.max(60, Math.min(460, Math.round(value)));
  const variantKey = (stars: boolean, steps: number): string => `${stars ? "stars" : "plain"}:${steps}`;
  const configureSceneProgram = (program: BlackHoleProgram): void => {
    gl.useProgram(program.program);
    gl.uniform1f(program.uniforms.uEncode ?? null, hdr ? 0 : 1);
    if (sceneWidth > 0 && sceneHeight > 0) gl.uniform2f(program.uniforms.uRes ?? null, sceneWidth, sceneHeight);
    gl.uniform2f(program.uniforms.uFocus ?? null, BLACK_HOLE_FOCUS[0], 1 - BLACK_HOLE_FOCUS[1]);
    activeProgram = null;
  };
  const cacheStepVariant = (key: string, program: BlackHoleProgram): void => {
    stepVariants.set(key, { program, lastUsed: ++stepVariantClock });
    while (stepVariants.size > maximumStepVariants) {
      let oldestKey: string | undefined;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [candidateKey, candidate] of stepVariants) {
        if (candidate.lastUsed < oldestUse) {
          oldestKey = candidateKey;
          oldestUse = candidate.lastUsed;
        }
      }
      if (!oldestKey) break;
      const evicted = stepVariants.get(oldestKey);
      stepVariants.delete(oldestKey);
      if (evicted) gl.deleteProgram(evicted.program.program);
    }
  };
  const clearStepVariants = (deletePrograms: boolean): void => {
    if (deletePrograms) {
      for (const variant of stepVariants.values()) gl.deleteProgram(variant.program.program);
    }
    stepVariants.clear();
    failedStepVariants.clear();
    stepVariantClock = 0;
  };
  const compileExactProgram = (stars: boolean, steps: number): BlackHoleProgram | null => {
    const key = variantKey(stars, steps);
    const cached = stepVariants.get(key);
    if (cached) {
      cached.lastUsed = ++stepVariantClock;
      return cached.program;
    }
    if (failedStepVariants.has(key)) return null;
    const program = linkProgram(blackHoleSceneFragmentSource(stars, steps));
    if (!program) {
      failedStepVariants.add(key);
      return null;
    }
    configureSceneProgram(program);
    cacheStepVariant(key, program);
    return program;
  };
  const cancelPendingVariant = (): void => {
    if (pendingVariantIdle !== null) {
      const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cancelIdle?.(pendingVariantIdle);
      pendingVariantIdle = null;
    }
    if (pendingVariantTimer !== null) {
      window.clearTimeout(pendingVariantTimer);
      pendingVariantTimer = null;
    }
    pendingVariant = null;
  };
  const queueExactProgram = (stars: boolean, steps: number): void => {
    const key = variantKey(stars, steps);
    if (stepVariants.has(key) || failedStepVariants.has(key)) return;
    pendingVariant = { key, stars, steps };
    if (pendingVariantIdle !== null || pendingVariantTimer !== null) return;
    const compilePending = (): void => {
      pendingVariantIdle = null;
      pendingVariantTimer = null;
      const request = pendingVariant;
      pendingVariant = null;
      if (!request || !running || !contextReady) return;
      if (!inViewport || !documentVisible) {
        pendingVariant = request;
        return;
      }
      const compiled = compileExactProgram(request.stars, request.steps);
      if (compiled) {
        const current = readSettings();
        const currentKey = variantKey(current.starBrightness > 0.001, effectiveSteps(current.steps));
        if (currentKey === request.key) {
          settledFrames = 0;
          needsScene = true;
          needsComposite = true;
          schedule();
        }
      }
      const nextRequest = pendingVariant as PendingVariant | null;
      if (nextRequest && running && contextReady) queueExactProgram(nextRequest.stars, nextRequest.steps);
    };
    const requestIdle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (requestIdle) pendingVariantIdle = requestIdle(compilePending, { timeout: 400 });
    else pendingVariantTimer = window.setTimeout(compilePending, 100);
  };
  const dynamicSceneProgram = (stars: boolean): BlackHoleProgram | null => {
    if (!stars) return sceneProgram;
    if (!starSceneProgram && !starSceneUnavailable) {
      starSceneProgram = linkProgram(blackHoleSceneFragmentSource(true));
      if (starSceneProgram) configureSceneProgram(starSceneProgram);
      else starSceneUnavailable = true;
    }
    return starSceneProgram ?? sceneProgram;
  };
  const selectSceneProgram = (stars: boolean, steps: number): BlackHoleProgram | null => {
    const exact = stepVariants.get(variantKey(stars, steps));
    if (exact) {
      exact.lastUsed = ++stepVariantClock;
      return exact.program;
    }
    queueExactProgram(stars, steps);
    return dynamicSceneProgram(stars);
  };
  const build = (): boolean => {
    cancelPendingVariant();
    clearStepVariants(true);
    sceneProgram = linkProgram(blackHoleSceneFragmentSource(false));
    starSceneProgram = null;
    starSceneUnavailable = false;
    blendProgram = linkProgram(BLACK_HOLE_BLEND_FRAGMENT_SHADER);
    brightProgram = linkProgram(BLACK_HOLE_BRIGHT_FRAGMENT_SHADER);
    blurProgram = linkProgram(BLACK_HOLE_BLUR_FRAGMENT_SHADER);
    compositeProgram = linkProgram(BLACK_HOLE_COMPOSITE_FRAGMENT_SHADER);
    if (!sceneProgram || !blendProgram || !brightProgram || !blurProgram || !compositeProgram) return false;
    configureSceneProgram(sceneProgram);
    gl.useProgram(blendProgram.program);
    gl.uniform1i(blendProgram.uniforms.uCur ?? null, 0);
    gl.uniform1i(blendProgram.uniforms.uPrev ?? null, 1);
    gl.useProgram(brightProgram.program);
    gl.uniform1i(brightProgram.uniforms.uTex ?? null, 0);
    gl.uniform1f(brightProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
    gl.uniform1f(brightProgram.uniforms.uPack ?? null, bloomPack);
    gl.uniform1f(brightProgram.uniforms.uThreshold ?? null, 0.85);
    gl.useProgram(blurProgram.program);
    gl.uniform1i(blurProgram.uniforms.uTex ?? null, 0);
    gl.useProgram(compositeProgram.program);
    gl.uniform1i(compositeProgram.uniforms.uScene ?? null, 0);
    gl.uniform1i(compositeProgram.uniforms.uBloom ?? null, 1);
    gl.uniform1f(compositeProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
    gl.uniform1f(compositeProgram.uniforms.uPack ?? null, bloomPack);
    activeProgram = null;
    activeTextureUnit = -1;
    viewportWidth = -1;
    viewportHeight = -1;
    vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const settings = readSettings();
    compileExactProgram(settings.starBrightness > 0.001, effectiveSteps(settings.steps));
    return true;
  };
  const dropTargets = (): void => {
    for (const target of [sceneTarget, historyA, historyB, bloomA, bloomB]) {
      if (!target) continue;
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    sceneTarget = historyA = historyB = bloomA = bloomB = null;
    shownTarget = shownBloomTarget = null;
    settledFrames = 0;
  };
  const destroyGpuResources = (): void => {
    dropTargets();
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
    vertexBuffer = null;
    for (const program of [sceneProgram, starSceneProgram, blendProgram, brightProgram, blurProgram, compositeProgram]) {
      if (program) gl.deleteProgram(program.program);
    }
    sceneProgram = starSceneProgram = blendProgram = brightProgram = blurProgram = compositeProgram = null;
    clearStepVariants(true);
  };
  const resize = (): boolean => {
    const rect = host.getBoundingClientRect();
    const settings = readSettings();
    const dpr = softwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, Math.max(1, settings.maxDpr));
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const scale = softwareRenderer ? 0.34 : Math.min(1, Math.max(0.4, settings.resolution));
    const requestedWidth = Math.max(2, Math.round(cssWidth * dpr));
    const requestedHeight = Math.max(2, Math.round(cssHeight * dpr));
    const gpuSizeScale = Math.min(1, maxRenderWidth / requestedWidth, maxRenderHeight / requestedHeight);
    const width = Math.max(2, Math.floor(requestedWidth * gpuSizeScale));
    const height = Math.max(2, Math.floor(requestedHeight * gpuSizeScale));
    const nextSceneWidth = Math.max(2, Math.round(width * scale));
    const nextSceneHeight = Math.max(2, Math.round(height * scale));
    if (
      width === canvasWidth
      && height === canvasHeight
      && nextSceneWidth === sceneWidth
      && nextSceneHeight === sceneHeight
      && sceneTarget
      && historyA
      && historyB
      && bloomA
      && bloomB
    ) return false;
    canvasWidth = width;
    canvasHeight = height;
    sceneWidth = nextSceneWidth;
    sceneHeight = nextSceneHeight;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    dropTargets();
    const bloomWidth = Math.max(2, sceneWidth >> 2);
    const bloomHeight = Math.max(2, sceneHeight >> 2);
    const allocateTargets = (): boolean => {
      sceneTarget = createTarget(sceneWidth, sceneHeight);
      historyA = createTarget(sceneWidth, sceneHeight);
      historyB = createTarget(sceneWidth, sceneHeight);
      bloomA = createTarget(bloomWidth, bloomHeight);
      bloomB = createTarget(bloomWidth, bloomHeight);
      return Boolean(sceneTarget && historyA && historyB && bloomA && bloomB);
    };
    let allocated = allocateTargets();
    if (!allocated && hdr) {
      dropTargets();
      hdr = false;
      textureType = gl.UNSIGNED_BYTE;
      internalFormat = gl.RGBA;
      textureFilter = gl.LINEAR;
      bloomPack = 0.12;
      allocated = allocateTargets();
    }
    if (!allocated || !sceneTarget || !historyA || !historyB || !bloomA || !bloomB) {
      dropTargets();
      canvasWidth = canvasHeight = sceneWidth = sceneHeight = 0;
      allocationFailed = true;
      giveUp("allocation-failed", "The GPU could not allocate the Black Hole Background render targets.");
      return false;
    }
    allocationFailed = false;
    canvas.hidden = false;
    host.dataset.webgl = "";
    if (reportedFailure) {
      reportedFailure = undefined;
      onError(undefined);
    }
    if (sceneProgram) configureSceneProgram(sceneProgram);
    if (starSceneProgram) configureSceneProgram(starSceneProgram);
    for (const variant of stepVariants.values()) configureSceneProgram(variant.program);
    if (brightProgram) {
      gl.useProgram(brightProgram.program);
      gl.uniform1f(brightProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
      gl.uniform1f(brightProgram.uniforms.uPack ?? null, bloomPack);
      gl.uniform2f(brightProgram.uniforms.uTexel ?? null, 1 / sceneWidth, 1 / sceneHeight);
    }
    if (compositeProgram) {
      gl.useProgram(compositeProgram.program);
      gl.uniform1f(compositeProgram.uniforms.uDecode ?? null, hdr ? 0 : 1);
      gl.uniform1f(compositeProgram.uniforms.uPack ?? null, bloomPack);
    }
    activeProgram = null;
    return true;
  };

  const pass = (program: BlackHoleProgram, target: BlackHoleRenderTarget | null): void => {
    if (activeProgram !== program.program) {
      gl.useProgram(program.program);
      activeProgram = program.program;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    const width = target?.width ?? canvasWidth;
    const height = target?.height ?? canvasHeight;
    if (viewportWidth !== width || viewportHeight !== height) {
      gl.viewport(0, 0, width, height);
      viewportWidth = width;
      viewportHeight = height;
    }
  };
  const draw = (): void => gl.drawArrays(gl.TRIANGLES, 0, 3);
  const bindTexture = (texture: WebGLTexture, unit: number): void => {
    if (activeTextureUnit !== unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      activeTextureUnit = unit;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };
  const halton: readonly (readonly [number, number])[] = [
    [0.5, 0.333], [0.25, 0.667], [0.75, 0.111], [0.125, 0.444],
    [0.625, 0.778], [0.375, 0.222], [0.875, 0.556], [0.0625, 0.889],
  ];
  type LinearColorCache = { source: string | null; value: [number, number, number] };
  const colorCache: Record<"hot" | "mid" | "cool", LinearColorCache> = {
    hot: { source: null, value: [0, 0, 0] },
    mid: { source: null, value: [0, 0, 0] },
    cool: { source: null, value: [0, 0, 0] },
  };
  const linearColor = (source: string, cache: LinearColorCache): [number, number, number] => {
    if (cache.source !== source) {
      cache.source = source;
      cache.value = blackHoleHexToLinear(source);
    }
    return cache.value;
  };

  const render = (time: number, includeScene = true, finishScene = true): void => {
    if (!sceneProgram || !blendProgram || !brightProgram || !blurProgram || !compositeProgram) return;
    const activeBlurProgram = blurProgram;
    if (!sceneTarget || !historyA || !historyB || !bloomA || !bloomB) return;
    const settings = readSettings();
    if (!includeScene && (!shownTarget || !shownBloomTarget)) return;

    if (includeScene) {
      const steps = effectiveSteps(settings.steps);
      const selectedSceneProgram = selectSceneProgram(settings.starBrightness > 0.001, steps);
      if (!selectedSceneProgram) return;
      const azimuth = (settings.azimuth + settings.orbitSpeed * time) * BLACK_HOLE_RADIANS;
      const elevation = Math.max(-88, Math.min(88, settings.elevation)) * BLACK_HOLE_RADIANS;
      const distance = Math.max(2.2, settings.distance);
      const cosineElevation = Math.cos(elevation);
      const cameraX = distance * cosineElevation * Math.cos(azimuth);
      const cameraY = distance * Math.sin(elevation);
      const cameraZ = distance * cosineElevation * Math.sin(azimuth);
      const forwardX = -cameraX / distance;
      const forwardY = -cameraY / distance;
      const forwardZ = -cameraZ / distance;
      let rightX = forwardZ;
      let rightY = 0;
      let rightZ = -forwardX;
      const rightLength = Math.hypot(rightX, rightY, rightZ) || 1;
      rightX /= rightLength;
      rightY /= rightLength;
      rightZ /= rightLength;
      const upX = rightY * forwardZ - rightZ * forwardY;
      const upY = rightZ * forwardX - rightX * forwardZ;
      const upZ = rightX * forwardY - rightY * forwardX;
      const cosineRoll = Math.cos(settings.roll * BLACK_HOLE_RADIANS);
      const sineRoll = Math.sin(settings.roll * BLACK_HOLE_RADIANS);
      const rolledRightX = rightX * cosineRoll + upX * sineRoll;
      const rolledRightY = rightY * cosineRoll + upY * sineRoll;
      const rolledRightZ = rightZ * cosineRoll + upZ * sineRoll;
      const rolledUpX = -rightX * sineRoll + upX * cosineRoll;
      const rolledUpY = -rightY * sineRoll + upY * cosineRoll;
      const rolledUpZ = -rightZ * sineRoll + upZ * cosineRoll;
      pass(selectedSceneProgram, sceneTarget);
      const uniforms = selectedSceneProgram.uniforms;
      gl.uniform3f(uniforms.uCamPos ?? null, cameraX, cameraY, cameraZ);
      gl.uniform3f(uniforms.uRight ?? null, rolledRightX, rolledRightY, rolledRightZ);
      gl.uniform3f(uniforms.uUp ?? null, rolledUpX, rolledUpY, rolledUpZ);
      gl.uniform3f(uniforms.uFwd ?? null, forwardX, forwardY, forwardZ);
      const spin = settings.spinSpeed * 6.2831853;
      const windPhase = time / 46;
      const firstWind = windPhase - Math.floor(windPhase);
      const secondWindPhase = windPhase + 0.5;
      const secondWind = secondWindPhase - Math.floor(secondWindPhase);
      gl.uniform4f(
        uniforms.uWind ?? null,
        firstWind * 46,
        secondWind * 46,
        Math.abs(2 * firstWind - 1),
        spin * time * 0.05,
      );
      if (sceneStaticSettings.get(selectedSceneProgram.program) !== settings) {
        const hot = linearColor(settings.hotColor, colorCache.hot);
        const mid = linearColor(settings.midColor, colorCache.mid);
        const cool = linearColor(settings.coolColor, colorCache.cool);
        const outer = Math.max(settings.diskInner + 0.5, settings.diskOuter);
        gl.uniform1f(uniforms.uTanHalf ?? null, Math.tan(Math.max(8, Math.min(110, settings.fov)) * 0.5 * BLACK_HOLE_RADIANS));
        if (uniforms.uSteps) gl.uniform1f(uniforms.uSteps, steps);
        gl.uniform1f(uniforms.uSkyR ?? null, Math.max(distance * 1.35, outer * 2.4));
        gl.uniform1f(uniforms.uDiskIn ?? null, Math.max(1.05, settings.diskInner));
        gl.uniform1f(uniforms.uDiskOut ?? null, outer);
        gl.uniform1f(uniforms.uThick ?? null, Math.max(0.02, settings.diskThickness));
        gl.uniform1f(uniforms.uDensity ?? null, Math.max(0, settings.diskDensity));
        gl.uniform1f(uniforms.uSpin ?? null, spin);
        gl.uniform1f(uniforms.uGrain ?? null, Math.max(0.02, settings.grain));
        gl.uniform1f(uniforms.uBright ?? null, Math.max(0, settings.brightness));
        gl.uniform1f(uniforms.uDoppler ?? null, Math.max(0, Math.min(1, settings.doppler)));
        gl.uniform3f(uniforms.uHot ?? null, hot[0], hot[1], hot[2]);
        gl.uniform3f(uniforms.uMid ?? null, mid[0], mid[1], mid[2]);
        gl.uniform3f(uniforms.uCool ?? null, cool[0], cool[1], cool[2]);
        if (uniforms.uStars) gl.uniform1f(uniforms.uStars, Math.max(0, settings.starBrightness));
        sceneStaticSettings.set(selectedSceneProgram.program, settings);
      }
      const jitter = halton[settledFrames % halton.length] ?? halton[0];
      if (!jitter) return;
      gl.uniform2f(uniforms.uJitter ?? null, jitter[0] - 0.5, jitter[1] - 0.5);
      gl.uniform1f(uniforms.uSeed ?? null, (settledFrames % 64) * 17.13);
      draw();

      const historyWeight = settledFrames === 0 ? 1 : 0.14;
      pass(blendProgram, historyB);
      bindTexture(sceneTarget.texture, 0);
      bindTexture(historyA.texture, 1);
      gl.uniform1f(blendProgram.uniforms.uAlpha ?? null, historyWeight);
      draw();
      const shown = historyB;
      const swap = historyA;
      historyA = historyB;
      historyB = swap;
      settledFrames += 1;
      shownTarget = shown;

      if (finishScene) {
        pass(brightProgram, bloomA);
        bindTexture(shown.texture, 0);
        draw();
        const blurStep = (source: BlackHoleRenderTarget, destination: BlackHoleRenderTarget, dx: number, dy: number): void => {
          pass(activeBlurProgram, destination);
          bindTexture(source.texture, 0);
          gl.uniform2f(activeBlurProgram.uniforms.uStep ?? null, dx / destination.width, dy / destination.height);
          draw();
        };
        blurStep(bloomA, bloomB, 1, 0);
        blurStep(bloomB, bloomA, 0, 1);
        blurStep(bloomA, bloomB, 2.6, 0);
        blurStep(bloomB, bloomA, 0, 2.6);
        shownBloomTarget = bloomA;
      }
    }

    if (includeScene && !finishScene) return;
    const scene = shownTarget;
    const bloom = shownBloomTarget;
    if (!scene || !bloom) return;
    pass(compositeProgram, null);
    bindTexture(scene.texture, 0);
    bindTexture(bloom.texture, 1);
    gl.uniform1f(compositeProgram.uniforms.uGlow ?? null, Math.max(0, settings.glow) * 0.26);
    gl.uniform1f(compositeProgram.uniforms.uExposure ?? null, Math.max(0.05, settings.exposure));
    gl.uniform1f(compositeProgram.uniforms.uVignette ?? null, Math.max(0, Math.min(1, settings.vignette)));
    gl.uniform1f(compositeProgram.uniforms.uScrimDir ?? null, 0);
    gl.uniform1f(compositeProgram.uniforms.uScrimAmt ?? null, 0);
    gl.uniform1f(compositeProgram.uniforms.uSeed ?? null, (time * 60) % 1000);
    draw();
  };

  const canRun = (): boolean => running && contextReady && inViewport && documentVisible;
  function schedule(): void {
    if (!canRun() || animationFrame || (allocationFailed && !resizePending)) return;
    animationFrame = requestBackgroundFrame(canvas, tick);
  }
  const stopLoop = (): void => {
    if (animationFrame) cancelBackgroundFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
  };
  function tick(now: number): void {
    animationFrame = 0;
    if (!canRun()) return;
    if (resizePending) {
      resizePending = false;
      if (resize()) {
        settledFrames = 0;
        stillPassesRemaining = 16;
        needsScene = true;
      }
    }
    if (allocationFailed) return;
    const paused = readSettings().paused || reduced;
    if (paused !== lastPaused) {
      if (paused) {
        settledFrames = 0;
        stillPassesRemaining = 16;
        needsScene = true;
      }
      lastPaused = paused;
      lastFrame = 0;
      needsComposite = true;
    }
    const delta = lastFrame ? Math.min(0.05, (now - lastFrame) / 1_000) : 0;
    lastFrame = now;
    if (!paused) {
      clock += delta;
      render(clock, true, true);
      needsScene = false;
      needsComposite = false;
    } else if (needsScene) {
      const finishScene = stillPassesRemaining === 16 || stillPassesRemaining <= 1;
      render(clock, true, finishScene);
      stillPassesRemaining = Math.max(0, stillPassesRemaining - 1);
      if (stillPassesRemaining === 0) {
        needsScene = false;
        needsComposite = false;
      }
    } else if (needsComposite) {
      render(clock, false, true);
      needsComposite = false;
    }
    if (!paused || needsScene || needsComposite || resizePending) schedule();
    else lastFrame = 0;
  }

  if (!build()) {
    const message = "The Black Hole Background shaders could not be initialized.";
    giveUp("build-failed", message);
    destroyGpuResources();
    throw new Error(message);
  }
  if (!resize()) {
    const message = "The GPU could not allocate the Black Hole Background render targets.";
    destroyGpuResources();
    throw new Error(message);
  }
  schedule();

  const resizeObserver = new ResizeObserver(() => {
    resizePending = true;
    schedule();
  });
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver((entries) => {
    inViewport = entries[0]?.isIntersecting ?? true;
    if (inViewport) {
      lastFrame = 0;
      needsComposite = true;
      schedule();
    } else {
      stopLoop();
    }
  }, { threshold: 0 });
  intersectionObserver.observe(host);
  const onVisibilityChange = (): void => {
    documentVisible = !document.hidden;
    lastFrame = 0;
    if (documentVisible) {
      needsComposite = true;
      schedule();
    } else {
      stopLoop();
    }
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextReady = false;
    allocationFailed = false;
    cancelPendingVariant();
    stopLoop();
    canvasWidth = canvasHeight = sceneWidth = sceneHeight = 0;
    giveUp("context-lost", "The Black Hole Background graphics context was lost; waiting for recovery.");
  };
  const onContextRestored = (): void => {
    destroyGpuResources();
    canvasWidth = canvasHeight = sceneWidth = sceneHeight = 0;
    contextReady = true;
    if (!build()) {
      contextReady = false;
      destroyGpuResources();
      giveUp("lost", "The Black Hole Background WebGL context could not be restored.");
      return;
    }
    lastFrame = 0;
    resizePending = false;
    if (!resize()) return;
    stillPassesRemaining = 16;
    needsScene = true;
    needsComposite = true;
    schedule();
  };
  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reduced = event.matches;
    lastFrame = 0;
    settledFrames = 0;
    stillPassesRemaining = 16;
    needsScene = true;
    needsComposite = true;
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  reducedMotion.addEventListener("change", onReducedMotionChange);

  return {
    invalidate: (sceneChanged: boolean, sizeChanged: boolean): void => {
      if (!running) return;
      if (sizeChanged) resizePending = true;
      if (sceneChanged) {
        settledFrames = 0;
        stillPassesRemaining = 16;
        needsScene = true;
      }
      needsComposite = true;
      schedule();
    },
    dispose: (): void => {
      if (!running) return;
      running = false;
      cancelPendingVariant();
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      reducedMotion.removeEventListener("change", onReducedMotionChange);
      destroyGpuResources();
    },
  };
}

export class BlackHoleRenderer {
  #settings: BlackHoleBackgroundSettings;
  readonly #runtime: BlackHoleRendererRuntime;

  constructor(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    settings: BlackHoleBackgroundSettings,
    onError: (message?: string) => void,
  ) {
    this.#settings = normalizeBlackHoleSettings(settings);
    this.#runtime = startBlackHoleRenderer(host, canvas, () => this.#settings, onError);
  }

  setSettings(settings: BlackHoleBackgroundSettings): void {
    const next = normalizeBlackHoleSettings(settings);
    const sceneChanged = blackHoleSceneSignature(next) !== blackHoleSceneSignature(this.#settings);
    const sizeChanged = blackHoleSizeSignature(next) !== blackHoleSizeSignature(this.#settings);
    this.#settings = next;
    this.#runtime.invalidate(sceneChanged, sizeChanged);
  }

  dispose(): void {
    this.#runtime.dispose();
  }
}

export function populateGlowHorizonLayer(layer:HTMLElement, settings:GlowHorizonBackgroundSettings):void {
      const horizon = document.createElement("div");
      horizon.className = "code-codex-glow-horizon-horizon";
      const arcSpecs = [
        { color: settings.rimColor, shadow: true },
        { color: settings.violetColor },
        { color: settings.blueColor },
        { color: settings.shadowColor },
      ];
      for (const spec of arcSpecs) {
        const arc = document.createElement("div");
        arc.dataset.glowHorizonArc = "";
        arc.style.position = "absolute";
        arc.style.inset = "0";
        arc.style.borderRadius = "100%";
        arc.style.pointerEvents = "none";
        arc.style.background = spec.color;
        if (spec.shadow) arc.style.boxShadow = `0 -4px 23px ${glowHorizonWithAlpha(spec.color, .71)}`;
        horizon.append(arc);
      }
      for (let index = 0; index < 4; index += 1) {
        const trail = document.createElement("div");
        trail.dataset.glowHorizonTrail = "";
        trail.style.position = "absolute";
        trail.style.inset = "0";
        trail.style.borderRadius = "100%";
        trail.style.pointerEvents = "none";
        trail.style.mixBlendMode = "screen";
        trail.style.visibility = "hidden";
        horizon.append(trail);
      }

 horizon.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';layer.append(horizon);
}
