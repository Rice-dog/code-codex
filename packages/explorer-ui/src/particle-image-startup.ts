// Particle rendering, preparation and saved settings are shared by the normal
// background and independent startup/preview instances. No theme ownership here.
import { clampParticleNumber } from './startup-background-renderers';
import { cancelBackgroundFrame, requestBackgroundFrame } from './background-startup-hold';

export const PARTICLE_BACKGROUND_SETTINGS_KEY = "code-codex:particle-image-background:v1";

export const PARTICLE_BACKGROUND_DB_NAME = "code-codex-particle-image-background";

export const PARTICLE_BACKGROUND_DB_VERSION = 1;

export const PARTICLE_BACKGROUND_STORE = "images";

export const PARTICLE_BACKGROUND_SAMPLE_MAX_DIMENSION = 900;

export const PARTICLE_BACKGROUND_PREPARE_TIMEOUT_MS = 30_000;

export const PARTICLE_BACKGROUND_MASS_BUCKETS = 4_096;

export const PARTICLE_BACKGROUND_POINTER_SEGMENTS = 40;

export const PARTICLE_BACKGROUND_PARTICLE_LIFETIME_SECONDS = 1;

export const PARTICLE_BACKGROUND_PARTICLE_LIFETIME_JITTER_SECONDS = 0.12;

export const PARTICLE_BACKGROUND_MAX_LIFETIME_SECONDS = PARTICLE_BACKGROUND_PARTICLE_LIFETIME_SECONDS
  + PARTICLE_BACKGROUND_PARTICLE_LIFETIME_JITTER_SECONDS;

export const PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS = PARTICLE_BACKGROUND_MAX_LIFETIME_SECONDS
  / PARTICLE_BACKGROUND_POINTER_SEGMENTS;

export const PARTICLE_BACKGROUND_FLOW_STEP_SECONDS = 1 / 64;

export const PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS = 0.18;

export const PARTICLE_BACKGROUND_MAX_FRAME_DELTA_SECONDS = 0.1;

export const PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH = 40;

export const PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH = 400;

export const PARTICLE_BACKGROUND_MORPH_NEAR_RESPONSE_RATIO = 3.2 / 5.2;

export const PARTICLE_BACKGROUND_MORPH_STAGGER_RATIO = 1.4 / 5.2;

export const PARTICLE_BACKGROUND_MORPH_DISTANCE_SCALE = 0.6;

export const PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION = 0.08;

export const PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT = 4.7438645;

export const PARTICLE_BACKGROUND_MORPH_SETTLE_ERROR = 0.0015;

export const PARTICLE_BACKGROUND_MORPH_SETTLE_VELOCITY = 0.005;

export const PARTICLE_BACKGROUND_MORPH_SETTLE_POSITION_PX = 0.05;

export const PARTICLE_BACKGROUND_MORPH_SETTLE_SPEED_PX_PER_SECOND = 0.2;

export interface ParticleMorphCurveNode {
  readonly time: number;
  readonly progress: number;
}

export interface ParticleMorphCurve {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly nodes: readonly ParticleMorphCurveNode[];
}

export interface ParticleBackgroundSettings {
  readonly particleCount: number;
  readonly particleSize: number;
  readonly particleOpacity: number;
  readonly speed: number;
  readonly noiseScale: number;
  readonly noiseStrength: number;
  readonly damping: number;
  readonly ambientCycle: number;
  readonly selectedImageIds: readonly string[];
  readonly activeImageId: string | null;
  readonly autoSwitch: boolean;
  readonly imageDurationSeconds: number;
  readonly morphIntervalSeconds: number;
  readonly morphCurve: ParticleMorphCurve;
  readonly imageOpacity: number;
  readonly showSourceImage: boolean;
  readonly backgroundColor: string;
  readonly cursorStrength: number;
  readonly cursorInteraction: boolean;
  readonly dprCap: number;
}

export interface ParticleCursorStrengthValues {
  readonly baseStrength: number;
  readonly cursorScale: number;
  readonly strengthRatio: number;
  readonly extendedStrength: number;
  readonly extremeStrength: number;
  readonly overdrive: number;
  readonly highStrengthScale: number;
  readonly stepStrengthScale: number;
  readonly strength: number;
  readonly wakeLengthScale: number;
  readonly squareRootStrength: number;
}

export interface ParticleImageTransform {
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
}

export interface ParticleImageRecord extends ParticleImageTransform {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly createdAt: number;
  readonly blob: Blob;
  readonly thumbnail: Blob;
}

export interface PreparedParticleImage {
  readonly imageId: string;
  readonly targetCount: number;
  readonly width: number;
  readonly height: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly processedBlob: Blob;
  readonly normalizedHomes: Float32Array<ArrayBuffer>;
  readonly colors: Uint8Array<ArrayBuffer>;
  readonly seeds: Float32Array<ArrayBuffer>;
}

export interface ParticlePointerSegment {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  velocityX: number;
  velocityY: number;
  startedAt: number;
  createdAt: number;
  duration: number;
  sealed: boolean;
}

export const DEFAULT_PARTICLE_MORPH_CURVE: ParticleMorphCurve = Object.freeze({
  x1: 0.42,
  y1: 0,
  x2: 0.58,
  y2: 1,
  nodes: Object.freeze([]),
});

export const MAX_PARTICLE_MORPH_CURVE_NODES = 32;

export const PARTICLE_MORPH_CURVE_NODE_EPSILON = 0.0001;

export const DEFAULT_PARTICLE_BACKGROUND_SETTINGS: ParticleBackgroundSettings = Object.freeze({
  particleCount: 560_000,
  particleSize: 1.8,
  particleOpacity: 0.96,
  speed: 0.70,
  noiseScale: 0.0001,
  noiseStrength: 0.005,
  damping: 0.9919,
  ambientCycle: 80,
  selectedImageIds: Object.freeze([]),
  activeImageId: null,
  autoSwitch: true,
  imageDurationSeconds: 2,
  morphIntervalSeconds: 2.5,
  morphCurve: DEFAULT_PARTICLE_MORPH_CURVE,
  imageOpacity: 1,
  showSourceImage: true,
  backgroundColor: "#000000",
  cursorStrength: PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
  cursorInteraction: true,
  dprCap: 1.5,
});

export const DEFAULT_PARTICLE_IMAGE_TRANSFORM: ParticleImageTransform = Object.freeze({
  positionX: 50,
  positionY: 50,
  zoom: 1,
});

export function calculateParticleCursorStrengthValues(cursorStrength: number): ParticleCursorStrengthValues {
  const baseStrength = Math.min(
    Math.max(cursorStrength, 0),
    PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
  );
  const cursorScale = baseStrength * 6.25;
  const strengthRatio = Math.max(baseStrength / 0.64, 0);
  const extendedStrength = Math.max(strengthRatio / 15.625, 1);
  const extremeStrength = Math.max(strengthRatio / 31.25, 1);
  const overdrive = Math.max(
    cursorStrength / PARTICLE_BACKGROUND_CURSOR_REFERENCE_STRENGTH,
    1,
  );
  const highStrengthScale = Math.pow(Math.max(strengthRatio, 1), 0.45)
    * Math.pow(extendedStrength, 0.28)
    * Math.pow(extremeStrength, 0.32)
    * Math.pow(overdrive, 0.45);
  const stepStrengthScale = Math.pow(Math.max(strengthRatio, 1), 0.35)
    * Math.pow(extendedStrength, 0.18)
    * Math.pow(extremeStrength, 0.22)
    * Math.pow(overdrive, 0.35);
  const strength = 4.0 * (
    strengthRatio < 1
      ? strengthRatio
      : Math.pow(Math.max(strengthRatio, 1), 0.55)
  ) * Math.pow(extendedStrength, 0.30)
    * Math.pow(extremeStrength, 0.34)
    * overdrive;
  const wakeLengthScale = Math.pow(Math.max(strengthRatio, 1), 0.12)
    * Math.pow(extendedStrength, 0.16)
    * Math.pow(extremeStrength, 0.20);
  return {
    baseStrength,
    cursorScale,
    strengthRatio,
    extendedStrength,
    extremeStrength,
    overdrive,
    highStrengthScale,
    stepStrengthScale,
    strength,
    wakeLengthScale,
    squareRootStrength: Math.sqrt(Math.max(strength, 0)),
  };
}

export function clampParticleUnitInterval(value: unknown, fallback = 0): number {
  return clampParticleNumber(value, 0, 1, fallback);
}

export function normalizeParticleMorphCurve(value: unknown): ParticleMorphCurve {
  const source: Record<string, unknown> = Array.isArray(value)
    ? { nodes: value }
    : value && typeof value === "object"
      ? value as Record<string, unknown>
      : DEFAULT_PARTICLE_MORPH_CURVE as unknown as Record<string, unknown>;
  let x1 = clampParticleUnitInterval(source.x1, DEFAULT_PARTICLE_MORPH_CURVE.x1);
  let y1 = clampParticleUnitInterval(source.y1, DEFAULT_PARTICLE_MORPH_CURVE.y1);
  let x2 = clampParticleUnitInterval(source.x2, DEFAULT_PARTICLE_MORPH_CURVE.x2);
  let y2 = clampParticleUnitInterval(source.y2, DEFAULT_PARTICLE_MORPH_CURVE.y2);
  if (x1 > x2) [x1, x2] = [x2, x1];
  if (y1 > y2) [y1, y2] = [y2, y1];

  const candidates: ParticleMorphCurveNode[] = [];
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  for (const rawNode of rawNodes) {
    let rawTime: unknown;
    let rawProgress: unknown;
    if (Array.isArray(rawNode)) {
      rawTime = rawNode[0];
      rawProgress = rawNode[1];
    } else if (rawNode && typeof rawNode === "object") {
      const node = rawNode as Record<string, unknown>;
      rawTime = node.time ?? node.x;
      rawProgress = node.progress ?? node.y;
    } else {
      continue;
    }
    const time = Number(rawTime);
    const progress = Number(rawProgress);
    if (!Number.isFinite(time) || !Number.isFinite(progress)) continue;
    candidates.push({
      time: clampParticleUnitInterval(time),
      progress: clampParticleUnitInterval(progress),
    });
  }
  candidates.sort((first, second) => first.time - second.time || first.progress - second.progress);

  const nodes: ParticleMorphCurveNode[] = [];
  let previousTime = 0;
  let previousProgress = 0;
  for (const candidate of candidates) {
    if (
      candidate.time <= PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.time >= 1 - PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.progress <= PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.progress >= 1 - PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.time <= previousTime + PARTICLE_MORPH_CURVE_NODE_EPSILON
      || candidate.progress <= previousProgress + PARTICLE_MORPH_CURVE_NODE_EPSILON
    ) continue;
    nodes.push(candidate);
    previousTime = candidate.time;
    previousProgress = candidate.progress;
    if (nodes.length >= MAX_PARTICLE_MORPH_CURVE_NODES) break;
  }
  return { x1, y1, x2, y2, nodes };
}

export function cloneParticleMorphCurve(curve: ParticleMorphCurve): ParticleMorphCurve {
  return {
    x1: curve.x1,
    y1: curve.y1,
    x2: curve.x2,
    y2: curve.y2,
    nodes: curve.nodes.map((node) => ({ time: node.time, progress: node.progress })),
  };
}

export function particleCubicBezierCoordinate(parameter: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * inverse * parameter * firstControl
    + 3 * inverse * parameter * parameter * secondControl
    + parameter * parameter * parameter;
}

export function particleCubicBezierDerivative(parameter: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * inverse * firstControl
    + 6 * inverse * parameter * (secondControl - firstControl)
    + 3 * parameter * parameter * (1 - secondControl);
}

export function particleMonotoneEndpointSlope(
  firstSpan: number,
  secondSpan: number,
  firstSecant: number,
  secondSecant: number,
): number {
  if (!(firstSecant > 0)) return 0;
  const slope = (
    (2 * firstSpan + secondSpan) * firstSecant - firstSpan * secondSecant
  ) / Math.max(firstSpan + secondSpan, PARTICLE_MORPH_CURVE_NODE_EPSILON);
  if (!Number.isFinite(slope) || slope <= 0 || firstSecant * secondSecant <= 0) return 0;
  return Math.min(slope, 3 * firstSecant);
}

export interface ParticleMorphCurveSegments {
  readonly anchors: readonly ParticleMorphCurveNode[];
  readonly spans: readonly number[];
  readonly slopes: readonly number[];
}

export const particleMorphCurveSegmentCache = new WeakMap<ParticleMorphCurve, ParticleMorphCurveSegments>();

export function getParticleMorphCurveSegments(curve: ParticleMorphCurve): ParticleMorphCurveSegments {
  const cached = particleMorphCurveSegmentCache.get(curve);
  if (cached) return cached;
  const anchors: ParticleMorphCurveNode[] = [
    { time: 0, progress: 0 },
    ...curve.nodes,
    { time: 1, progress: 1 },
  ];
  const spans: number[] = [];
  const secants: number[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index];
    const end = anchors[index + 1];
    if (!start || !end) continue;
    const span = Math.max(end.time - start.time, PARTICLE_MORPH_CURVE_NODE_EPSILON);
    spans.push(span);
    secants.push(Math.max(0, end.progress - start.progress) / span);
  }

  const slopes = new Array<number>(anchors.length).fill(0);
  if (secants.length === 1) {
    slopes[0] = secants[0] ?? 0;
    slopes[1] = secants[0] ?? 0;
  } else if (secants.length > 1) {
    const firstSecant = secants[0] ?? 0;
    const secondSecant = secants[1] ?? firstSecant;
    const startHandleSlope = curve.x1 > PARTICLE_MORPH_CURVE_NODE_EPSILON
      ? curve.y1 / curve.x1
      : Number.NaN;
    const endHandleSpan = 1 - curve.x2;
    const endHandleSlope = endHandleSpan > PARTICLE_MORPH_CURVE_NODE_EPSILON
      ? (1 - curve.y2) / endHandleSpan
      : Number.NaN;
    slopes[0] = Number.isFinite(startHandleSlope)
      ? Math.min(Math.max(0, startHandleSlope), 3 * firstSecant)
      : particleMonotoneEndpointSlope(spans[0] ?? 1, spans[1] ?? 1, firstSecant, secondSecant);
    for (let index = 1; index < anchors.length - 1; index += 1) {
      const previousSecant = secants[index - 1] ?? 0;
      const nextSecant = secants[index] ?? 0;
      if (previousSecant <= 0 || nextSecant <= 0) {
        slopes[index] = 0;
        continue;
      }
      const previousSpan = spans[index - 1] ?? 1;
      const nextSpan = spans[index] ?? 1;
      const weightA = 2 * nextSpan + previousSpan;
      const weightB = nextSpan + 2 * previousSpan;
      slopes[index] = (weightA + weightB) / (weightA / previousSecant + weightB / nextSecant);
    }
    const lastSecantIndex = secants.length - 1;
    const lastAnchorIndex = anchors.length - 1;
    const lastSecant = secants[lastSecantIndex] ?? 0;
    const previousLastSecant = secants[lastSecantIndex - 1] ?? lastSecant;
    slopes[lastAnchorIndex] = Number.isFinite(endHandleSlope)
      ? Math.min(Math.max(0, endHandleSlope), 3 * lastSecant)
      : particleMonotoneEndpointSlope(
          spans[lastSecantIndex] ?? 1,
          spans[lastSecantIndex - 1] ?? 1,
          lastSecant,
          previousLastSecant,
        );
  }
  const segments = { anchors, spans, slopes };
  particleMorphCurveSegmentCache.set(curve, segments);
  return segments;
}

export interface ParticleMorphCurveEvaluation {
  readonly value: number;
  readonly slope: number;
  readonly parameter: number;
}

export function evaluateParticleMorphCurve(
  progress: number,
  curve: ParticleMorphCurve = DEFAULT_PARTICLE_MORPH_CURVE,
): ParticleMorphCurveEvaluation {
  const time = clampParticleUnitInterval(progress);
  if (time <= 0) return { value: 0, slope: 0, parameter: 0 };
  if (time >= 1) return { value: 1, slope: 0, parameter: 1 };
  if (curve.nodes.length) {
    const { anchors, spans, slopes } = getParticleMorphCurveSegments(curve);
    let segmentIndex = 0;
    while (
      segmentIndex < spans.length - 1
      && time > (anchors[segmentIndex + 1]?.time ?? 1)
    ) segmentIndex += 1;
    const start = anchors[segmentIndex] ?? anchors[0] ?? { time: 0, progress: 0 };
    const end = anchors[segmentIndex + 1] ?? anchors.at(-1) ?? { time: 1, progress: 1 };
    const span = spans[segmentIndex] ?? 1;
    const local = Math.min(1, Math.max(0, (time - start.time) / span));
    const local2 = local * local;
    const local3 = local2 * local;
    const h00 = 2 * local3 - 3 * local2 + 1;
    const h10 = local3 - 2 * local2 + local;
    const h01 = -2 * local3 + 3 * local2;
    const h11 = local3 - local2;
    const startSlope = slopes[segmentIndex] ?? 0;
    const endSlope = slopes[segmentIndex + 1] ?? 0;
    const value = Math.min(end.progress, Math.max(
      start.progress,
      h00 * start.progress + h10 * span * startSlope + h01 * end.progress + h11 * span * endSlope,
    ));
    const derivative = (6 * local2 - 6 * local) * start.progress / span
      + (3 * local2 - 4 * local + 1) * startSlope
      + (-6 * local2 + 6 * local) * end.progress / span
      + (3 * local2 - 2 * local) * endSlope;
    return {
      value: clampParticleUnitInterval(value),
      slope: Math.min(8, Math.max(0, Number.isFinite(derivative) ? derivative : 0)),
      parameter: local,
    };
  }

  let parameter = time;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const error = particleCubicBezierCoordinate(parameter, curve.x1, curve.x2) - time;
    const derivative = particleCubicBezierDerivative(parameter, curve.x1, curve.x2);
    if (Math.abs(error) < 0.00001 || Math.abs(derivative) < 0.00001) break;
    parameter = Math.min(1, Math.max(0, parameter - error / derivative));
  }
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const x = particleCubicBezierCoordinate(parameter, curve.x1, curve.x2);
    if (Math.abs(x - time) < 0.00001) break;
    if (x < time) lower = parameter;
    else upper = parameter;
    parameter = 0.5 * (lower + upper);
  }
  const value = clampParticleUnitInterval(particleCubicBezierCoordinate(parameter, curve.y1, curve.y2));
  const xDerivative = particleCubicBezierDerivative(parameter, curve.x1, curve.x2);
  const yDerivative = particleCubicBezierDerivative(parameter, curve.y1, curve.y2);
  const slope = xDerivative > 0.00001 ? Math.min(8, Math.max(0, yDerivative / xDerivative)) : 0;
  return { value, slope, parameter };
}

export function normalizeParticleCount(value: unknown): number {
  return Math.round(clampParticleNumber(value, 10_000, 2_000_000, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.particleCount) / 10_000) * 10_000;
}

export function normalizeSteppedParticleNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  step: number,
  fallback: number,
  precision: number,
): number {
  const clamped = clampParticleNumber(value, minimum, maximum, fallback);
  const stepped = minimum + Math.round((clamped - minimum) / step) * step;
  return Number(Math.min(maximum, Math.max(minimum, stepped)).toFixed(precision));
}

export function normalizeParticleImageTransform(value: unknown): ParticleImageTransform {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    positionX: normalizeSteppedParticleNumber(record.positionX, 0, 100, 1, DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionX, 0),
    positionY: normalizeSteppedParticleNumber(record.positionY, 0, 100, 1, DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionY, 0),
    zoom: normalizeSteppedParticleNumber(record.zoom, 0.25, 4, 0.05, DEFAULT_PARTICLE_IMAGE_TRANSFORM.zoom, 2),
  };
}

export function applyParticleImageTransform(image: HTMLImageElement, value: ParticleImageTransform): void {
  const transform = normalizeParticleImageTransform(value);
  const position = `${transform.positionX}% ${transform.positionY}%`;
  image.style.setProperty("object-position", position, "important");
  image.style.setProperty("transform-origin", position, "important");
  image.style.setProperty("transform", `scale(${transform.zoom})`, "important");
}

export function normalizeParticleColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLocaleLowerCase()
    : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.backgroundColor;
}

export function normalizeParticleSettings(value: unknown): ParticleBackgroundSettings {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const selectedImageIds = Array.isArray(record.selectedImageIds)
    ? [...new Set(record.selectedImageIds.filter((entry): entry is string => typeof entry === "string" && entry.length <= 128))]
    : [];
  return {
    particleCount: normalizeParticleCount(record.particleCount),
    particleSize: normalizeSteppedParticleNumber(record.particleSize, 0.5, 4, 0.1, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.particleSize, 1),
    particleOpacity: normalizeSteppedParticleNumber(record.particleOpacity, 0.1, 1, 0.01, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.particleOpacity, 2),
    speed: normalizeSteppedParticleNumber(record.speed, 0, 2, 0.05, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.speed, 2),
    noiseScale: normalizeSteppedParticleNumber(record.noiseScale, 0.0001, 0.002, 0.0001, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.noiseScale, 4),
    noiseStrength: normalizeSteppedParticleNumber(record.noiseStrength, 0, 0.15, 0.005, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.noiseStrength, 3),
    damping: normalizeSteppedParticleNumber(record.damping, 0.8, 0.9999, 0.0001, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.damping, 4),
    ambientCycle: normalizeSteppedParticleNumber(record.ambientCycle, 40, 500, 10, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.ambientCycle, 0),
    selectedImageIds,
    activeImageId: typeof record.activeImageId === "string" && record.activeImageId.length <= 128
      ? record.activeImageId
      : null,
    autoSwitch: typeof record.autoSwitch === "boolean" ? record.autoSwitch : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.autoSwitch,
    imageDurationSeconds: Math.round(clampParticleNumber(
      record.imageDurationSeconds,
      1,
      60,
      DEFAULT_PARTICLE_BACKGROUND_SETTINGS.imageDurationSeconds,
    )),
    morphIntervalSeconds: Math.round(clampParticleNumber(
      record.morphIntervalSeconds,
      1,
      12,
      DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds,
    ) * 10) / 10,
    morphCurve: normalizeParticleMorphCurve(record.morphCurve),
    imageOpacity: Math.round(clampParticleNumber(
      record.imageOpacity,
      0,
      1,
      DEFAULT_PARTICLE_BACKGROUND_SETTINGS.imageOpacity,
    ) * 100) / 100,
    showSourceImage: typeof record.showSourceImage === "boolean"
      ? record.showSourceImage
      : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.showSourceImage,
    backgroundColor: normalizeParticleColor(record.backgroundColor),
    cursorStrength: normalizeSteppedParticleNumber(record.cursorStrength, 0, PARTICLE_BACKGROUND_CURSOR_MAX_STRENGTH, 0.01, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.cursorStrength, 2),
    cursorInteraction: typeof record.cursorInteraction === "boolean"
      ? record.cursorInteraction
      : DEFAULT_PARTICLE_BACKGROUND_SETTINGS.cursorInteraction,
    dprCap: normalizeSteppedParticleNumber(record.dprCap, 1, 2, 0.25, DEFAULT_PARTICLE_BACKGROUND_SETTINGS.dprCap, 2),
  };
}

export function readParticleBackgroundSettings(): ParticleBackgroundSettings {
  try {
    return normalizeParticleSettings(JSON.parse(localStorage.getItem(PARTICLE_BACKGROUND_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_PARTICLE_BACKGROUND_SETTINGS };
  }
}

export function writeParticleBackgroundSettings(settings: ParticleBackgroundSettings): void {
  try {
    localStorage.setItem(PARTICLE_BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The current session keeps working when DOM storage is unavailable.
  }
}

export function particleHash01(value: number): number {
  const number = Math.sin(value * 91.317) * 47_453.5453;
  return number - Math.floor(number);
}

export function particleHashUint32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function particleImagePreparationWorkerMain(): void {
  const workerScope = globalThis as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<Record<string, unknown>>) => void): void;
    postMessage(message: unknown, transfer: Transferable[]): void;
  };
  const hash01 = (value: number): number => {
    const number = Math.sin(value * 91.317) * 47_453.5453;
    return number - Math.floor(number);
  };
  const hashUint32 = (value: number): number => {
    let hash = value >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
  workerScope.addEventListener("message", (event) => {
    void (async () => {
      const data = event.data;
      const jobId = Number(data.jobId);
      const imageId = String(data.imageId || "");
      const source = data.source;
      const requestedCount = Number(data.targetCount);
      let bitmap: ImageBitmap | undefined;
      try {
        if (!(source instanceof Blob)) throw new Error("The image source is invalid");
        if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
          throw new Error("Background image preparation is unavailable");
        }
        bitmap = await createImageBitmap(source);
        const naturalWidth = bitmap.width;
        const naturalHeight = bitmap.height;
        if (!naturalWidth || !naturalHeight || naturalWidth > 16_384 || naturalHeight > 16_384) {
          throw new Error("The image dimensions are unsupported");
        }
        const maximumDimension = 900;
        const scale = Math.min(1, maximumDimension / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || typeof canvas.convertToBlob !== "function") throw new Error("The image preparation canvas is unavailable");
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        let samplingSeed = hashUint32(width ^ (height << 16));
        let visiblePixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset] ?? 0;
          const green = pixels[offset + 1] ?? 0;
          const blue = pixels[offset + 2] ?? 0;
          const alpha = pixels[offset + 3] ?? 0;
          const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
          pixels[offset] = luminance;
          pixels[offset + 1] = luminance;
          pixels[offset + 2] = luminance;
          const pixelIndex = offset >>> 2;
          if ((pixelIndex & 3) === 0) {
            samplingSeed = hashUint32(samplingSeed ^ luminance ^ (alpha << 8) ^ Math.imul(pixelIndex + 1, 0x9e3779b1));
          }
          if (alpha >= 24) visiblePixels += 1;
        }
        if (!visiblePixels) throw new Error("The image contains no visible pixels");
        context.putImageData(imageData, 0, 0);
        const processedBlob = await canvas.convertToBlob({ type: "image/png" });

        const pixelCount = width * height;
        const cumulativeMass = new Uint32Array(pixelCount);
        const particleLuminance = new Uint8Array(pixelCount);
        let totalMass = 0;
        for (let y = 0; y < height; y += 1) {
          const row = y * width;
          const up = Math.max(0, y - 1) * width;
          const down = Math.min(height - 1, y + 1) * width;
          for (let x = 0; x < width; x += 1) {
            const pixelIndex = row + x;
            const offset = pixelIndex * 4;
            const alpha = pixels[offset + 3] ?? 0;
            if (alpha >= 24) {
              const leftValue = pixels[(row + Math.max(0, x - 1)) * 4] ?? 0;
              const rightValue = pixels[(row + Math.min(width - 1, x + 1)) * 4] ?? 0;
              const upValue = pixels[(up + x) * 4] ?? 0;
              const downValue = pixels[(down + x) * 4] ?? 0;
              const luminance = (pixels[offset] ?? 0) / 255;
              const edge = Math.min(1, (Math.abs(rightValue - leftValue) + Math.abs(downValue - upValue)) / 510);
              totalMass += Math.round((alpha / 255) * (Math.pow(luminance, 0.9) * 144 + edge * 112));
              particleLuminance[pixelIndex] = Math.max(pixels[offset] ?? 0, Math.round(edge * 96));
            }
            cumulativeMass[pixelIndex] = totalMass;
          }
        }
        if (!totalMass) {
          for (let index = 0; index < pixelCount; index += 1) {
            if ((pixels[index * 4 + 3] ?? 0) >= 24) {
              totalMass += 1;
              particleLuminance[index] = Math.max(pixels[index * 4] ?? 0, 96);
            }
            cumulativeMass[index] = totalMass;
          }
        }
        if (!totalMass) throw new Error("The image contains no visible pixels");

        const bucketCount = 4_096;
        const massLookup = new Uint32Array(bucketCount + 1);
        let pixelCursor = 0;
        const finalPixel = cumulativeMass.length - 1;
        for (let bucket = 0; bucket <= bucketCount; bucket += 1) {
          const threshold = totalMass * bucket / bucketCount;
          while (pixelCursor < finalPixel && (cumulativeMass[pixelCursor] ?? 0) <= threshold) pixelCursor += 1;
          massLookup[bucket] = pixelCursor;
        }

        const targetCount = Math.min(2_000_000, Math.max(10_000, Math.round(requestedCount / 10_000) * 10_000));
        const normalizedHomes = new Float32Array(targetCount * 2);
        const colors = new Uint8Array(targetCount * 4);
        const seeds = new Float32Array(targetCount);
        for (let index = 0; index < targetCount; index += 1) {
          const quantile = (hashUint32(index ^ samplingSeed) + 0.5) / 4_294_967_296;
          const targetMass = quantile * totalMass;
          const massBucket = Math.min(bucketCount - 1, Math.floor(quantile * bucketCount));
          let low = massLookup[massBucket] ?? 0;
          let high = massLookup[massBucket + 1] ?? low;
          while (low < high) {
            const middle = (low + high) >>> 1;
            if ((cumulativeMass[middle] ?? 0) <= targetMass) low = middle + 1;
            else high = middle;
          }
          const pixelIndex = low;
          const pixelX = pixelIndex % width;
          const pixelY = Math.floor(pixelIndex / width);
          const homeOffset = index * 2;
          const colorOffset = index * 4;
          normalizedHomes[homeOffset] = Math.max(0, Math.min(1, (pixelX + 0.5 + (hash01(index + 0.17) - 0.5) * 0.82) / width));
          normalizedHomes[homeOffset + 1] = Math.max(0, Math.min(1, (pixelY + 0.5 + (hash01(index + 7.31) - 0.5) * 0.82) / height));
          const luminance = particleLuminance[pixelIndex] ?? 0;
          colors[colorOffset] = luminance;
          colors[colorOffset + 1] = luminance;
          colors[colorOffset + 2] = luminance;
          colors[colorOffset + 3] = pixels[pixelIndex * 4 + 3] ?? 0;
          seeds[index] = hash01(index + 19.73);
        }
        workerScope.postMessage({
          type: "prepared",
          jobId,
          prepared: {
            imageId,
            targetCount,
            width,
            height,
            naturalWidth,
            naturalHeight,
            processedBlob,
            normalizedHomes,
            colors,
            seeds,
          },
        }, [normalizedHomes.buffer, colors.buffer, seeds.buffer]);
      } catch (error) {
        workerScope.postMessage({
          type: "error",
          jobId,
          message: error instanceof Error ? error.message : String(error),
        }, []);
      } finally {
        bitmap?.close();
      }
    })();
  });
}

export async function prepareParticleImageOnMainThread(
  imageId: string,
  source: Blob,
  requestedCount: number,
  signal: AbortSignal,
): Promise<PreparedParticleImage> {
  const throwIfAborted = (): void => {
    if (signal.aborted) throw new DOMException("Image preparation was cancelled", "AbortError");
  };
  const yieldToBrowser = async (): Promise<void> => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    throwIfAborted();
  };
  throwIfAborted();
  const bitmap = await createImageBitmap(source);
  try {
    throwIfAborted();
    const naturalWidth = bitmap.width;
    const naturalHeight = bitmap.height;
    if (!naturalWidth || !naturalHeight || naturalWidth > 16_384 || naturalHeight > 16_384) {
      throw new Error("The image dimensions are unsupported");
    }
    const scale = Math.min(1, PARTICLE_BACKGROUND_SAMPLE_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The image preparation canvas is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    let samplingSeed = particleHashUint32(width ^ (height << 16));
    let visiblePixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3] ?? 0;
      const luminance = Math.round(
        (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722,
      );
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
      const pixelIndex = offset >>> 2;
      if ((pixelIndex & 3) === 0) {
        samplingSeed = particleHashUint32(samplingSeed ^ luminance ^ (alpha << 8) ^ Math.imul(pixelIndex + 1, 0x9e3779b1));
      }
      if (alpha >= 24) visiblePixels += 1;
      if ((offset & 0x7ffff) === 0x7fffc) await yieldToBrowser();
    }
    if (!visiblePixels) throw new Error("The image contains no visible pixels");
    context.putImageData(imageData, 0, 0);
    const processedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The processed image could not be created")), "image/png");
    });
    throwIfAborted();
    const pixelCount = width * height;
    const cumulativeMass = new Uint32Array(pixelCount);
    const particleLuminance = new Uint8Array(pixelCount);
    let totalMass = 0;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      const up = Math.max(0, y - 1) * width;
      const down = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = row + x;
        const offset = pixelIndex * 4;
        const alpha = pixels[offset + 3] ?? 0;
        if (alpha >= 24) {
          const edge = Math.min(1, (
            Math.abs((pixels[(row + Math.min(width - 1, x + 1)) * 4] ?? 0) - (pixels[(row + Math.max(0, x - 1)) * 4] ?? 0))
            + Math.abs((pixels[(down + x) * 4] ?? 0) - (pixels[(up + x) * 4] ?? 0))
          ) / 510);
          const luminance = (pixels[offset] ?? 0) / 255;
          totalMass += Math.round((alpha / 255) * (Math.pow(luminance, 0.9) * 144 + edge * 112));
          particleLuminance[pixelIndex] = Math.max(pixels[offset] ?? 0, Math.round(edge * 96));
        }
        cumulativeMass[pixelIndex] = totalMass;
      }
      if ((y & 63) === 63) await yieldToBrowser();
    }
    if (!totalMass) {
      for (let index = 0; index < pixelCount; index += 1) {
        if ((pixels[index * 4 + 3] ?? 0) >= 24) {
          totalMass += 1;
          particleLuminance[index] = Math.max(pixels[index * 4] ?? 0, 96);
        }
        cumulativeMass[index] = totalMass;
        if ((index & 0x1ffff) === 0x1ffff) await yieldToBrowser();
      }
    }
    if (!totalMass) throw new Error("The image contains no visible pixels");
    const massLookup = new Uint32Array(PARTICLE_BACKGROUND_MASS_BUCKETS + 1);
    let pixelCursor = 0;
    const finalPixel = cumulativeMass.length - 1;
    for (let bucket = 0; bucket <= PARTICLE_BACKGROUND_MASS_BUCKETS; bucket += 1) {
      const threshold = totalMass * bucket / PARTICLE_BACKGROUND_MASS_BUCKETS;
      while (pixelCursor < finalPixel && (cumulativeMass[pixelCursor] ?? 0) <= threshold) pixelCursor += 1;
      massLookup[bucket] = pixelCursor;
    }
    const targetCount = normalizeParticleCount(requestedCount);
    const normalizedHomes = new Float32Array(targetCount * 2);
    const colors = new Uint8Array(targetCount * 4);
    const seeds = new Float32Array(targetCount);
    for (let index = 0; index < targetCount; index += 1) {
      const quantile = (particleHashUint32(index ^ samplingSeed) + 0.5) / 4_294_967_296;
      const targetMass = quantile * totalMass;
      const massBucket = Math.min(PARTICLE_BACKGROUND_MASS_BUCKETS - 1, Math.floor(quantile * PARTICLE_BACKGROUND_MASS_BUCKETS));
      let low = massLookup[massBucket] ?? 0;
      let high = massLookup[massBucket + 1] ?? low;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if ((cumulativeMass[middle] ?? 0) <= targetMass) low = middle + 1;
        else high = middle;
      }
      const pixelX = low % width;
      const pixelY = Math.floor(low / width);
      const homeOffset = index * 2;
      const colorOffset = index * 4;
      normalizedHomes[homeOffset] = Math.max(0, Math.min(1, (pixelX + 0.5 + (particleHash01(index + 0.17) - 0.5) * 0.82) / width));
      normalizedHomes[homeOffset + 1] = Math.max(0, Math.min(1, (pixelY + 0.5 + (particleHash01(index + 7.31) - 0.5) * 0.82) / height));
      const luminance = particleLuminance[low] ?? 0;
      colors[colorOffset] = luminance;
      colors[colorOffset + 1] = luminance;
      colors[colorOffset + 2] = luminance;
      colors[colorOffset + 3] = pixels[low * 4 + 3] ?? 0;
      seeds[index] = particleHash01(index + 19.73);
      if ((index & 0x7fff) === 0x7fff) await yieldToBrowser();
    }
    throwIfAborted();
    return { imageId, targetCount, width, height, naturalWidth, naturalHeight, processedBlob, normalizedHomes, colors, seeds };
  } finally {
    bitmap.close();
  }
}

export interface ParticlePreparationCacheEntry {
  readonly key: string;
  readonly imageId: string;
  readonly promise: Promise<PreparedParticleImage>;
  readonly cancel: () => void;
}

export class ParticleImagePreparationCache {
  #workerUrl: string | null;
  #entry: ParticlePreparationCacheEntry | undefined;
  #nextJobId = 1;

  constructor() {
    this.#workerUrl = this.#createWorkerUrl();
  }

  prepare(record: ParticleImageRecord, targetCount: number): Promise<PreparedParticleImage> {
    const count = normalizeParticleCount(targetCount);
    const key = [record.id, record.createdAt, record.size, record.type, count].join(":");
    if (this.#entry?.key === key) return this.#entry.promise;
    this.invalidate();

    const abortController = new AbortController();
    let cancelWorker = (): void => undefined;
    const workerAttempt = this.#workerUrl
      ? this.#prepareWithWorker(record, count, (nextCancel) => { cancelWorker = nextCancel; })
      : Promise.reject(new Error("Worker preprocessing is unavailable"));
    const promise = workerAttempt.catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (abortController.signal.aborted) {
        throw new DOMException("Image preparation was cancelled", "AbortError");
      }
      return prepareParticleImageOnMainThread(record.id, record.blob, count, abortController.signal);
    });
    const entry: ParticlePreparationCacheEntry = {
      key,
      imageId: record.id,
      promise,
      cancel: () => {
        abortController.abort();
        cancelWorker();
      },
    };
    this.#entry = entry;
    void promise.catch(() => {
      if (this.#entry === entry) this.#entry = undefined;
    });
    return promise;
  }

  prewarm(record: ParticleImageRecord, targetCount: number): void {
    void this.prepare(record, targetCount).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("Code-Codex could not pre-process the next particle image", error);
      }
    });
  }

  invalidate(imageId?: string): void {
    const entry = this.#entry;
    if (!entry || (imageId && entry.imageId !== imageId)) return;
    this.#entry = undefined;
    entry.cancel();
  }

  dispose(): void {
    this.invalidate();
    if (this.#workerUrl) URL.revokeObjectURL(this.#workerUrl);
    this.#workerUrl = null;
  }

  #createWorkerUrl(): string | null {
    if (
      typeof Worker !== "function"
      || typeof OffscreenCanvas !== "function"
      || typeof createImageBitmap !== "function"
      || typeof URL.createObjectURL !== "function"
    ) return null;
    try {
      return URL.createObjectURL(new Blob([`(${particleImagePreparationWorkerMain.toString()})();`], { type: "text/javascript" }));
    } catch {
      return null;
    }
  }

  #prepareWithWorker(
    record: ParticleImageRecord,
    targetCount: number,
    setCancel: (cancel: () => void) => void,
  ): Promise<PreparedParticleImage> {
    const workerUrl = this.#workerUrl;
    if (!workerUrl) return Promise.reject(new Error("Worker preprocessing is unavailable"));
    const jobId = this.#nextJobId++;
    return new Promise<PreparedParticleImage>((resolve, reject) => {
      let settled = false;
      let worker: Worker;
      let timeout = 0;
      const finish = (result: { readonly value: PreparedParticleImage } | { readonly error: unknown }): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        worker.terminate();
        if ("value" in result) resolve(result.value);
        else reject(result.error);
      };
      try {
        worker = new Worker(workerUrl, { name: "code-codex-particle-image" });
      } catch (error) {
        this.#disableWorker();
        reject(error);
        return;
      }
      setCancel(() => finish({ error: new DOMException("Image preparation was cancelled", "AbortError") }));
      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        const message = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
        if (Number(message.jobId) !== jobId) return;
        if (message.type === "prepared") {
          const prepared = message.prepared;
          if (this.#isPreparedImage(prepared, record.id, targetCount)) finish({ value: prepared });
          else finish({ error: new Error("The prepared particle image is invalid") });
          return;
        }
        finish({ error: new Error(typeof message.message === "string" ? message.message : "Image preparation failed") });
      });
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        this.#disableWorker();
        finish({ error: new Error(event.message || "Image preparation worker failed") });
      }, { once: true });
      worker.addEventListener("messageerror", () => {
        this.#disableWorker();
        finish({ error: new Error("Image preparation worker returned unreadable data") });
      }, { once: true });
      timeout = window.setTimeout(() => {
        this.#disableWorker();
        finish({ error: new DOMException("Image preparation timed out", "TimeoutError") });
      }, PARTICLE_BACKGROUND_PREPARE_TIMEOUT_MS);
      worker.postMessage({
        jobId,
        imageId: record.id,
        source: record.blob,
        targetCount,
      });
    });
  }

  #disableWorker(): void {
    if (this.#workerUrl) URL.revokeObjectURL(this.#workerUrl);
    this.#workerUrl = null;
  }

  #isPreparedImage(value: unknown, imageId: string, targetCount: number): value is PreparedParticleImage {
    if (!value || typeof value !== "object") return false;
    const prepared = value as Partial<PreparedParticleImage>;
    return prepared.imageId === imageId
      && prepared.targetCount === targetCount
      && Number.isInteger(prepared.width) && Number(prepared.width) > 0
      && Number.isInteger(prepared.height) && Number(prepared.height) > 0
      && Number(prepared.naturalWidth) > 0
      && Number(prepared.naturalHeight) > 0
      && prepared.processedBlob instanceof Blob
      && prepared.normalizedHomes instanceof Float32Array
      && prepared.normalizedHomes.length === targetCount * 2
      && prepared.colors instanceof Uint8Array
      && prepared.colors.length === targetCount * 4
      && prepared.seeds instanceof Float32Array
      && prepared.seeds.length === targetCount;
  }
}

export const PARTICLE_BACKGROUND_VERTEX_SHADER = `
  precision highp float;
  attribute vec2 a_previousHome;
  attribute vec2 a_home;
  attribute vec2 a_previousVelocity;
  attribute vec4 a_previousColor;
  attribute vec4 a_color;
  attribute float a_seed;

  uniform vec2 u_resolution;
  uniform vec4 u_layout;
  uniform vec4 u_pointerSegments[${PARTICLE_BACKGROUND_POINTER_SEGMENTS}];
  uniform vec4 u_pointerMotion[${PARTICLE_BACKGROUND_POINTER_SEGMENTS}];
  uniform float u_pointerCount;
  uniform float u_time;
  uniform float u_transitionElapsed;
  uniform float u_transitionNearResponse;
  uniform float u_transitionFarResponse;
  uniform float u_transitionStagger;
  uniform float u_transitionActive;
  uniform float u_dpr;
  uniform float u_particleSize;
  uniform float u_particleOpacity;
  uniform float u_speed;
  uniform float u_noiseScale;
  uniform float u_noiseStrength;
  // log(damping) / fixed simulation step, precomputed once when settings change.
  uniform float u_dampingRate;
  uniform float u_ambientCycle;
  uniform float u_cursorStrength;
  // x/y/z = highStrengthScale/stepStrengthScale/strength.
  uniform vec3 u_cursorStrengthScales;
  // x/y = wakeLengthScale/squareRootStrength; both are invariant per draw.
  uniform vec2 u_cursorStrengthDerived;

  varying vec4 v_color;

  float hash(float value) {
    return fract(sin(value * 91.317) * 47453.5453);
  }

  float smoother01(float value) {
    float t = clamp(value, 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  vec2 softLimit(vec2 value, float maximum) {
    float maximumSquared = max(maximum * maximum, 0.0001);
    return value * inversesqrt(1.0 + dot(value, value) / maximumSquared);
  }

  vec2 ambientFlow(float sampleTime, vec2 homePosition) {
    float seedAngle = a_seed * 6.2831853;
    float flowTime = sampleTime * u_speed * 200.0 / max(u_ambientCycle, 1.0);
    float spatial = max(u_noiseScale, 0.00001) * 6.2831853;
    float waveA = sin(homePosition.y * spatial + flowTime * 0.63 + seedAngle);
    float waveB = cos(homePosition.x * spatial * 1.37 - flowTime * 0.48 + seedAngle * 0.71);
    float angle = waveA * 2.3 + waveB * 1.7 + seedAngle;
    float breathing = 0.58 + 0.42 * sin(flowTime * 0.82 + seedAngle * 2.0);
    return vec2(cos(angle), sin(angle)) * u_noiseStrength * 520.0 * breathing;
  }

  float directionalWakeGain(vec2 position, vec2 cursorStart, vec2 cursorEnd, float radius) {
    vec2 cursorStep = cursorEnd - cursorStart;
    float cursorDistance = length(cursorStep);
    if (cursorDistance < 0.001) return 0.0;
    vec2 tangent = cursorStep / cursorDistance;
    vec2 normal = vec2(-tangent.y, tangent.x);
    vec2 fromCursor = position - cursorEnd;
    float trailDistance = -dot(fromCursor, tangent);
    float lateralOffset = dot(fromCursor, normal);
    float wakeLength = radius * 4.5;
    float wakeProgress = clamp(trailDistance / max(wakeLength, 1.0), 0.0, 1.0);
    float wakeEndWidth = radius * 2.35 * sqrt(1.0 / 0.40);
    float wakeWidthSquared = mix(radius * radius, wakeEndWidth * wakeEndWidth, wakeProgress);
    float wakeProgressSquared = wakeProgress * wakeProgress;
    float wakeMetric = lateralOffset * lateralOffset / max(wakeWidthSquared, 1.0)
      + wakeProgressSquared * wakeProgressSquared;
    float rearBase = max(0.0, 1.0 - wakeMetric);
    float rearSupport = rearBase * rearBase * rearBase;
    float frontDistance = max(-trailDistance, 0.0);
    float frontLength = radius * 0.72;
    float frontMetric = frontDistance * frontDistance / max(frontLength * frontLength, 1.0)
      + lateralOffset * lateralOffset / max(radius * radius, 1.0);
    float frontBase = max(0.0, 1.0 - frontMetric);
    float frontSupport = frontBase * frontBase * frontBase;
    float support = mix(frontSupport, rearSupport, step(0.0, trailDistance));
    float coreAxial = 1.0 - smoother01(abs(trailDistance) / max(radius * 0.82, 1.0));
    float coreLateral = 1.0 - smoother01(abs(lateralOffset) / max(radius * 0.28, 1.0));
    return support * (1.10 + 2.90 * coreAxial * coreLateral);
  }

  void coastGas(
    inout vec2 position,
    inout vec2 gasVelocity,
    float elapsed,
    float maximumVelocity,
    float maximumStep
  ) {
    float dt = max(elapsed, 0.0);
    if (dt <= 0.00001) return;
    float decayRate = u_dampingRate;
    float decay = exp(decayRate * dt);
    float travelTime = abs(decayRate) > 0.00001
      ? (decay - 1.0) / decayRate
      : dt;
    float stepBudget = maximumStep * max(dt / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)}, 0.25);
    position += softLimit(gasVelocity * travelTime, stepBudget);
    gasVelocity = softLimit(gasVelocity * decay, maximumVelocity);
  }

  void stirGas(
    inout vec2 position,
    inout vec2 gasVelocity,
    inout vec2 previousTangent,
    inout float hasTangent,
    vec2 cursorStart,
    vec2 cursorEnd,
    vec2 filteredVelocity,
    float elapsed,
    float segmentPhase,
    float maximumVelocity,
    float maximumStep,
    float influenceRadius
  ) {
    float dt = clamp(elapsed, 0.0, ${PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS.toFixed(2)});
    if (dt <= 0.00001) return;
    vec2 cursorStep = cursorEnd - cursorStart;
    float cursorDistance = length(cursorStep);
    float moving = step(0.001, cursorDistance) * step(0.0001, u_cursorStrength);
    if (moving < 0.5) {
      coastGas(position, gasVelocity, dt, maximumVelocity, maximumStep);
      return;
    }

    vec2 tangent = cursorStep / max(cursorDistance, 0.001);
    vec2 normal = vec2(-tangent.y, tangent.x);
    float influence = clamp(
      directionalWakeGain(position, cursorStart, cursorEnd, influenceRadius) * 0.25,
      0.0,
      1.0
    );
    vec2 cursorVelocity = cursorStep / dt;
    vec2 driverVelocity = mix(cursorVelocity, filteredVelocity, 0.28);
    driverVelocity = softLimit(driverVelocity, 2200.0 * max(maximumVelocity / 340.0, 1.0));
    float driverSpeed = length(driverVelocity);

    float cursorLengthSquared = dot(cursorStep, cursorStep);
    float along = clamp(
      dot(position - cursorStart, cursorStep) / max(cursorLengthSquared, 0.0001),
      0.0,
      1.0
    );
    vec2 closestCursor = cursorStart + cursorStep * along;
    vec2 radial = position - closestCursor;
    float radialLength = length(radial);
    vec2 radialDirection = radial / max(radialLength, 0.001);
    vec2 swirlDirection = vec2(-radialDirection.y, radialDirection.x);

    float turn = hasTangent
      * (previousTangent.x * tangent.y - previousTangent.y * tangent.x);
    float directionAlignment = dot(previousTangent, tangent);
    float reversal = hasTangent * step(directionAlignment, -0.4);
    float seededVariation = hash(a_seed * 71.17 + segmentPhase * 13.31) * 2.0 - 1.0;
    float curlEnvelope = influence * (1.0 - influence);

    vec2 oldVelocity = gasVelocity;
    float decay = exp(u_dampingRate * dt);
    vec2 nextVelocity = oldVelocity * decay;
    float flowResponse = 1.0 - exp(-5.2 * influence * u_cursorStrengthScales.z * dt);
    nextVelocity = mix(nextVelocity, driverVelocity, flowResponse);
    nextVelocity *= mix(1.0, 0.76, reversal * influence);
    nextVelocity += normal * driverSpeed
      * (0.85 * turn * curlEnvelope * u_cursorStrengthScales.z) * dt;
    nextVelocity += swirlDirection * driverSpeed
      * (0.48 * turn * curlEnvelope * u_cursorStrengthScales.z) * dt;
    nextVelocity += normal * driverSpeed
      * (0.025 * seededVariation * curlEnvelope * u_cursorStrengthScales.z) * dt;

    float segmentEnergy = smoother01(
      cursorDistance / max(influenceRadius * 0.55, 1.0)
    );
    vec2 fromCursorEnd = position - cursorEnd;
    float signedTrailDistance = -dot(fromCursorEnd, tangent);
    float downstream = max(signedTrailDistance, 0.0);
    float upstream = max(-signedTrailDistance, 0.0);
    float lateralOffset = dot(fromCursorEnd, normal);
    float speedEnergy = smoother01(driverSpeed / 1500.0);
    float wakeLength = influenceRadius
      * mix(4.5, 10.0, speedEnergy)
      * u_cursorStrengthDerived.x;
    float wakeProgress = clamp(downstream / max(wakeLength, 1.0), 0.0, 1.0);
    float originalEndScale = mix(2.15, 2.65, speedEnergy);
    float wakeStartSquared = influenceRadius * influenceRadius;
    float wakeEndSquared = wakeStartSquared
      + wakeStartSquared * (originalEndScale * originalEndScale - 1.0) / 0.40;
    float wakeWidthSquared = mix(
      wakeStartSquared,
      wakeEndSquared,
      wakeProgress
    );
    float wakeWidth = sqrt(max(wakeWidthSquared, 1.0));
    float wakeProgressSquared = wakeProgress * wakeProgress;
    float wakeMetric = lateralOffset * lateralOffset / max(wakeWidthSquared, 1.0)
      + wakeProgressSquared * wakeProgressSquared;
    float rearBase = max(0.0, 1.0 - wakeMetric);
    float rearSupport = rearBase * rearBase * rearBase;
    float frontLength = influenceRadius * 0.75;
    float frontMetric = upstream * upstream / max(frontLength * frontLength, 1.0)
      + lateralOffset * lateralOffset / max(influenceRadius * influenceRadius, 1.0);
    float frontBase = max(0.0, 1.0 - frontMetric);
    float frontSupport = frontBase * frontBase * frontBase;
    float wakeGain = segmentEnergy * mix(frontSupport, rearSupport, step(0.0, signedTrailDistance));
    float side = sign(lateralOffset);
    vec2 entrainmentDirection = -normal * side;
    float entrainmentGain = smoother01(abs(lateralOffset) / max(wakeWidth, 1.0));
    vec2 wakeVelocity = driverVelocity * (0.24 * wakeGain);
    wakeVelocity += entrainmentDirection * driverSpeed
      * (0.11 * wakeGain * entrainmentGain);
    wakeVelocity += normal * driverSpeed * (0.18 * turn * wakeGain);

    vec2 segmentCenter = 0.5 * (cursorStart + cursorEnd);
    vec2 farOffset = position - segmentCenter;
    float farDistance = length(farOffset);
    vec2 farDirection = farOffset / max(farDistance, 0.001);
    float alignment = dot(tangent, farDirection);
    vec2 dipoleDirection = 2.0 * alignment * farDirection - tangent;
    float pressureStart = smoother01(
      (farDistance / max(influenceRadius, 1.0) - 1.15) / 0.85
    );
    float pressureDistance = farDistance / max(influenceRadius * 4.5, 1.0);
    float pressureGain = segmentEnergy * pressureStart
      / (1.0 + pressureDistance * pressureDistance);
    vec2 pressureVelocity = dipoleDirection * driverSpeed * (0.018 * pressureGain);
    float inducedResponse = 1.0 - exp(-1.15 * u_cursorStrengthDerived.y * dt);
    nextVelocity += (wakeVelocity + pressureVelocity) * inducedResponse;
    nextVelocity = softLimit(nextVelocity, maximumVelocity);

    vec2 particleStep = 0.5 * (oldVelocity + nextVelocity) * dt;
    float stepBudget = maximumStep
      * max(dt / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)}, 0.25);
    position += softLimit(particleStep, stepBudget);
    gasVelocity = nextVelocity;
    previousTangent = tangent;
    hasTangent = 1.0;
  }

  void main() {
    vec2 targetHome = u_layout.xy + a_home * u_layout.zw;
    vec2 home = targetHome;
    vec4 imageColor = a_color;
    if (u_transitionActive > 0.5) {
      vec2 transitionDelta = targetHome - a_previousHome;
      float transitionDistance = length(transitionDelta);
      float transitionDistanceReference = max(
        length(u_resolution) * ${PARTICLE_BACKGROUND_MORPH_DISTANCE_SCALE.toFixed(2)},
        80.0
      );
      float transitionDistanceFactor = smoother01(
        transitionDistance / transitionDistanceReference
      );
      float transitionVariation = mix(
        ${(1 - PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION).toFixed(2)},
        ${(1 + PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION).toFixed(2)},
        a_seed
      );
      float transitionResponse = mix(
        u_transitionNearResponse,
        u_transitionFarResponse,
        transitionDistanceFactor
      ) * transitionVariation;
      float transitionElapsed = max(u_transitionElapsed, 0.0);
      float carriedVelocity = step(0.01, length(a_previousVelocity));
      float transitionDelay = a_seed * a_seed
        * u_transitionStagger
        * (1.0 - carriedVelocity);
      float springElapsed = max(transitionElapsed - transitionDelay, 0.0);
      float transitionOmega = ${PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT.toFixed(7)}
        / max(transitionResponse, 0.10);
      float transitionSpringTime = transitionOmega * springElapsed;
      float transitionDecay = exp(-transitionSpringTime);
      float transitionProgress = clamp(
        1.0 - (1.0 + transitionSpringTime) * transitionDecay,
        0.0,
        1.0
      );
      vec2 displacement = a_previousHome - targetHome;
      vec2 velocityTerm = a_previousVelocity
        + transitionOmega * displacement;
      home = targetHome + (
        displacement + velocityTerm * springElapsed
      ) * transitionDecay;
      float transitionColorProgress = smoother01(
        (transitionProgress - 0.18) / 0.82
      );
      imageColor = mix(
        a_previousColor,
        a_color,
        transitionColorProgress
      );
    }

    float lifetime = ${PARTICLE_BACKGROUND_PARTICLE_LIFETIME_SECONDS.toFixed(2)}
      + (hash(a_seed * 53.17 + 7.9) * 2.0 - 1.0)
        * ${PARTICLE_BACKGROUND_PARTICLE_LIFETIME_JITTER_SECONDS.toFixed(2)};
    float age = mod(u_time + a_seed * lifetime, lifetime);
    float fadeIn = smoother01(age / 0.18);
    float fadeOut = 1.0 - smoother01((age - (lifetime - 0.18)) / 0.18);
    float lifeAlpha = fadeIn * fadeOut;
    float birthTime = u_time - age;
    vec2 ambientAtBirth = ambientFlow(birthTime, home);
    vec2 position = home + ambientAtBirth;
    vec2 gasVelocity = vec2(0.0);
    vec2 previousTangent = vec2(1.0, 0.0);
    float hasTangent = 0.0;
    float integratedAge = 0.0;

    if (u_pointerCount > 0.5 && u_cursorStrength > 0.0001) {
    float radiusVariation = mix(0.90, 1.10, hash(a_seed * 43.71 + 2.19));
    float influenceRadius = clamp(
      min(u_resolution.x, u_resolution.y) * 0.16,
      95.0,
      175.0
    ) * radiusVariation * 0.50;
    float motionReferenceRadius = influenceRadius / 1.5;
    float maximumVelocity = clamp(
      motionReferenceRadius * 0.42 / ${PARTICLE_BACKGROUND_FLOW_STEP_SECONDS.toFixed(6)},
      180.0,
      340.0
    ) * u_cursorStrengthScales.x;
    float maximumStep = clamp(motionReferenceRadius * 0.42, 8.0, 20.0)
      * u_cursorStrengthScales.y;

    for (int index = 0; index < ${PARTICLE_BACKGROUND_POINTER_SEGMENTS}; index += 1) {
      if (float(index) >= u_pointerCount) break;
      vec4 motion = u_pointerMotion[index];
      float segmentAge = motion.z;
      if (segmentAge > age) continue;
      vec4 segment = u_pointerSegments[index];
      float segmentDuration = max(motion.w, 0.0001);
      float segmentEndAge = clamp(age - segmentAge, 0.0, age);
      float segmentStartAge = max(0.0, segmentEndAge - segmentDuration);
      coastGas(
        position,
        gasVelocity,
        max(segmentStartAge - integratedAge, 0.0),
        maximumVelocity,
        maximumStep
      );
      float activeStartAge = max(integratedAge, segmentStartAge);
      float activeDuration = max(segmentEndAge - activeStartAge, 0.0);
      if (activeDuration > 0.00001) {
        float activeFraction = clamp(activeDuration / segmentDuration, 0.0, 1.0);
        vec2 activeCursorStart = mix(segment.zw, segment.xy, activeFraction);
        stirGas(
          position,
          gasVelocity,
          previousTangent,
          hasTangent,
          activeCursorStart,
          segment.zw,
          motion.xy,
          activeDuration,
          float(index),
          maximumVelocity,
          maximumStep,
          influenceRadius
        );
      }
      integratedAge = max(integratedAge, segmentEndAge);
    }

    coastGas(
      position,
      gasVelocity,
      max(age - integratedAge, 0.0),
      maximumVelocity,
      maximumStep
    );
    }
    vec2 ambientNow = ambientFlow(u_time, home);
    position += ambientNow - ambientAtBirth;
    vec2 restingPosition = home + ambientNow;
    float disturbed = smoothstep(0.75, 3.0, length(position - restingPosition));
    float lifecycleAlpha = mix(1.0, lifeAlpha, disturbed);
    vec2 clip = vec2(position.x / u_resolution.x * 2.0 - 1.0, 1.0 - position.y / u_resolution.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = max(1.0, u_particleSize * u_dpr);
    v_color = vec4(imageColor.rgb, imageColor.a * u_particleOpacity * lifecycleAlpha);
  }
`;

export const PARTICLE_BACKGROUND_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    float distanceFromCentre = length(centred);
    float coverage = 1.0 - smoothstep(0.28, 0.5, distanceFromCentre);
    if (coverage <= 0.001) discard;
    gl_FragColor = vec4(v_color.rgb, v_color.a * coverage);
  }
`;

export function compileParticleShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a particle shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Particle shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export function createParticleProgram(gl: WebGLRenderingContext): {
  readonly program: WebGLProgram;
  readonly vertexShader: WebGLShader;
  readonly fragmentShader: WebGLShader;
} {
  const vertexShader = compileParticleShader(gl, gl.VERTEX_SHADER, PARTICLE_BACKGROUND_VERTEX_SHADER);
  const fragmentShader = compileParticleShader(gl, gl.FRAGMENT_SHADER, PARTICLE_BACKGROUND_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL could not create the particle program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Particle shader linking failed";
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(message);
  }
  return { program, vertexShader, fragmentShader };
}

export function smootherParticleTransition(value: number): number {
  const progress = Math.min(1, Math.max(0, value));
  return progress * progress * progress
    * (progress * (progress * 6 - 15) + 10);
}

export function criticalParticleSpringProgress(elapsed: number, response: number): number {
  const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / Math.max(response, 0.1);
  const springTime = omega * Math.max(0, elapsed);
  return Math.min(1, Math.max(0, 1 - (1 + springTime) * Math.exp(-springTime)));
}

export interface ParticleTransitionClock {
  readonly rawProgress: number;
  readonly elapsed: number;
}

export class ParticleImageRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGLRenderingContext;
  readonly #program: WebGLProgram;
  readonly #vertexShader: WebGLShader;
  readonly #fragmentShader: WebGLShader;
  readonly #attributes: Readonly<Record<"previousHome" | "home" | "previousVelocity" | "previousColor" | "color" | "seed", number>>;
  readonly #uniforms: Readonly<Record<
    "resolution" | "layout" | "pointerSegments" | "pointerMotion"
    | "pointerCount" | "time" | "transitionElapsed" | "transitionNearResponse" | "transitionFarResponse"
    | "transitionStagger" | "transitionActive" | "dpr"
    | "particleSize" | "particleOpacity" | "speed" | "noiseScale" | "noiseStrength" | "dampingRate"
    | "ambientCycle" | "cursorStrength" | "cursorStrengthScales" | "cursorStrengthDerived",
    WebGLUniformLocation
  >>;
  readonly #buffers: Readonly<Record<"previousHome" | "home" | "previousVelocity" | "previousColor" | "color" | "seed", WebGLBuffer>>;
  readonly #pointerSegments: ParticlePointerSegment[] = [];
  readonly #pointerSegmentValues = new Float32Array(PARTICLE_BACKGROUND_POINTER_SEGMENTS * 4);
  readonly #pointerMotionValues = new Float32Array(PARTICLE_BACKGROUND_POINTER_SEGMENTS * 4);
  readonly #reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #onError: (message: string) => void;
  readonly #onTransitionFrame: (progress: number, complete: boolean) => void;
  #previousHomes: Float32Array<ArrayBuffer> = new Float32Array(0);
  #homes: Float32Array<ArrayBuffer> = new Float32Array(0);
  #previousVelocities: Float32Array<ArrayBuffer> = new Float32Array(0);
  #previousColors: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  #colors: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  #seeds: Float32Array<ArrayBuffer> = new Float32Array(0);
  #imageWidth = 1;
  #imageHeight = 1;
  #imageTransform: ParticleImageTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
  #count = 0;
  #cssWidth = 1;
  #cssHeight = 1;
  #dpr = 1;
  #simulationTime = 12.4;
  #lastFrame = performance.now();
  #transitionStart = 0;
  #transitionDuration = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionTimelineDuration = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionCurve = cloneParticleMorphCurve(DEFAULT_PARTICLE_MORPH_CURVE);
  #transitionClockCacheTime = Number.NaN;
  #transitionClockCache: ParticleTransitionClock | undefined;
  #transitionMaxResponse = DEFAULT_PARTICLE_BACKGROUND_SETTINGS.morphIntervalSeconds;
  #transitionMaximumDistance = 0;
  #transitionVelocityRatio = 0;
  #transitionActive = false;
  #transitionRevision = 0;
  #transitionResolve: ((completed: boolean) => void) | undefined;
  #imageRevision = 0;
  #settings: ParticleBackgroundSettings;
  #cursorStrengthValues: ParticleCursorStrengthValues;
  #viewportUniformsDirty = true;
  #layoutUniformDirty = true;
  #renderSettingsUniformsDirty = true;
  #transitionConstantsUniformsDirty = true;
  #transitionActiveUniformDirty = true;
  #transitionElapsedUniformDirty = true;
  #pointerGeometryUniformsDirty = true;
  #pointerCountUniformDirty = true;
  #cursorStrengthUniformsDirty = true;
  #animationFrame = 0;
  #disposed = false;
  #paused = false;
  #resizeObserver: ResizeObserver | undefined;
  #lastPointer: { readonly x: number; readonly y: number; readonly at: number } | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    onError: (message: string) => void,
    settings: ParticleBackgroundSettings,
    onTransitionFrame: (progress: number, complete: boolean) => void,
  ) {
    this.#canvas = canvas;
    this.#onError = onError;
    this.#settings = settings;
    this.#cursorStrengthValues = calculateParticleCursorStrengthValues(settings.cursorStrength);
    this.#onTransitionFrame = onTransitionFrame;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL is unavailable");
    this.#gl = gl;
    const compiled = createParticleProgram(gl);
    this.#program = compiled.program;
    this.#vertexShader = compiled.vertexShader;
    this.#fragmentShader = compiled.fragmentShader;
    this.#attributes = {
      previousHome: this.#requiredAttribute("a_previousHome"),
      home: this.#requiredAttribute("a_home"),
      previousVelocity: this.#requiredAttribute("a_previousVelocity"),
      previousColor: this.#requiredAttribute("a_previousColor"),
      color: this.#requiredAttribute("a_color"),
      seed: this.#requiredAttribute("a_seed"),
    };
    this.#uniforms = {
      resolution: this.#requiredUniform("u_resolution"),
      layout: this.#requiredUniform("u_layout"),
      pointerSegments: this.#requiredUniform("u_pointerSegments[0]"),
      pointerMotion: this.#requiredUniform("u_pointerMotion[0]"),
      pointerCount: this.#requiredUniform("u_pointerCount"),
      time: this.#requiredUniform("u_time"),
      transitionElapsed: this.#requiredUniform("u_transitionElapsed"),
      transitionNearResponse: this.#requiredUniform("u_transitionNearResponse"),
      transitionFarResponse: this.#requiredUniform("u_transitionFarResponse"),
      transitionStagger: this.#requiredUniform("u_transitionStagger"),
      transitionActive: this.#requiredUniform("u_transitionActive"),
      dpr: this.#requiredUniform("u_dpr"),
      particleSize: this.#requiredUniform("u_particleSize"),
      particleOpacity: this.#requiredUniform("u_particleOpacity"),
      speed: this.#requiredUniform("u_speed"),
      noiseScale: this.#requiredUniform("u_noiseScale"),
      noiseStrength: this.#requiredUniform("u_noiseStrength"),
      dampingRate: this.#requiredUniform("u_dampingRate"),
      ambientCycle: this.#requiredUniform("u_ambientCycle"),
      cursorStrength: this.#requiredUniform("u_cursorStrength"),
      cursorStrengthScales: this.#requiredUniform("u_cursorStrengthScales"),
      cursorStrengthDerived: this.#requiredUniform("u_cursorStrengthDerived"),
    };
    this.#buffers = {
      previousHome: this.#requiredBuffer(),
      home: this.#requiredBuffer(),
      previousVelocity: this.#requiredBuffer(),
      previousColor: this.#requiredBuffer(),
      color: this.#requiredBuffer(),
      seed: this.#requiredBuffer(),
    };
    gl.useProgram(this.#program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    // Attribute pointers retain their buffer association in this private context;
    // replacing buffer data does not require rebinding them for every draw.
    this.#bindAttributes();
    this.resize();
    if (typeof ResizeObserver === "function") {
      this.#resizeObserver = new ResizeObserver(this.resize);
      this.#resizeObserver.observe(canvas);
    }
    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.#onPointerMove, { capture: true, passive: true });
    window.addEventListener("blur", this.#resetPointer, { passive: true });
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    this.#reducedMotion.addEventListener("change", this.#onReducedMotionChange);
    canvas.addEventListener("webglcontextlost", this.#onContextLost);
    this.#paused = document.hidden || this.#reducedMotion.matches;
    this.#scheduleFrame();
  }

  get count(): number {
    return this.#count;
  }

  setRenderSettings(settings: ParticleBackgroundSettings): void {
    if (this.#disposed) return;
    const previousSettings = this.#settings;
    const dprChanged = settings.dprCap !== previousSettings.dprCap;
    const cursorDisabled = previousSettings.cursorInteraction && !settings.cursorInteraction;
    const transitionDurationChanged = settings.morphIntervalSeconds !== previousSettings.morphIntervalSeconds;
    if (
      settings.particleSize !== previousSettings.particleSize
      || settings.particleOpacity !== previousSettings.particleOpacity
      || settings.speed !== previousSettings.speed
      || settings.noiseScale !== previousSettings.noiseScale
      || settings.noiseStrength !== previousSettings.noiseStrength
      || settings.damping !== previousSettings.damping
      || settings.ambientCycle !== previousSettings.ambientCycle
      || settings.cursorStrength !== previousSettings.cursorStrength
    ) {
      this.#renderSettingsUniformsDirty = true;
    }
    if (settings.cursorStrength !== previousSettings.cursorStrength) {
      this.#cursorStrengthValues = calculateParticleCursorStrengthValues(settings.cursorStrength);
      this.#cursorStrengthUniformsDirty = true;
    }
    this.#settings = settings;
    if (!this.#transitionActive) {
      this.#transitionDuration = settings.morphIntervalSeconds;
      if (transitionDurationChanged) this.#transitionConstantsUniformsDirty = true;
    }
    if (cursorDisabled) {
      this.#lastPointer = undefined;
      const tail = this.#pointerSegments.at(-1);
      if (tail) tail.sealed = true;
    }
    if (dprChanged) this.resize();
    else if (this.#paused) this.#draw(performance.now(), false);
  }

  setPreparedImage(image: PreparedParticleImage, transform: ParticleImageTransform): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
    const now = performance.now();
    if (!this.#paused) this.#simulationTime = this.#clockSeconds(now);
    this.#lastFrame = now;
    const revision = ++this.#imageRevision;
    this.#interruptTransition();
    const canMorph = this.#count === image.targetCount
      && this.#count > 0
      && !this.#reducedMotion.matches
      && this.#captureCurrentImagePresentation();
    this.#homes = image.normalizedHomes;
    this.#colors = image.colors;
    this.#seeds = image.seeds;
    this.#imageWidth = image.width;
    this.#imageHeight = image.height;
    this.#imageTransform = normalizeParticleImageTransform(transform);
    this.#count = image.targetCount;
    this.#transitionDuration = this.#settings.morphIntervalSeconds;
    this.#layoutUniformDirty = true;
    if (!canMorph) {
      this.#previousHomes = new Float32Array(image.targetCount * 2);
      this.#previousVelocities = new Float32Array(image.targetCount * 2);
      this.#previousColors = new Uint8Array(image.targetCount * 4);
      this.#copyCurrentHomesTo(this.#previousHomes);
      this.#previousColors.set(this.#colors);
    }
    this.#transitionMaxResponse = canMorph
      ? this.#estimateMaximumTransitionResponse()
      : this.#transitionDuration;
    if (!canMorph) {
      this.#transitionMaximumDistance = 0;
      this.#transitionVelocityRatio = 0;
    }
    this.#uploadBuffer(this.#buffers.previousHome, this.#previousHomes);
    this.#uploadBuffer(this.#buffers.home, this.#homes);
    this.#uploadBuffer(this.#buffers.previousVelocity, this.#previousVelocities);
    this.#uploadBuffer(this.#buffers.previousColor, this.#previousColors);
    this.#uploadBuffer(this.#buffers.color, this.#colors);
    this.#uploadBuffer(this.#buffers.seed, this.#seeds);
    const transition = this.#beginTransition(canMorph, revision);
    if (this.#paused || !canMorph) this.#draw(performance.now(), false);
    return transition;
  }

  /** Submit an image-bearing frame before an independent startup source is ready. */
  renderPreparedFrame(): boolean {
    if (this.#disposed || this.#count <= 0 || this.#gl.isContextLost()) return false;
    this.#draw(performance.now(), false);
    this.#gl.flush();
    return true;
  }

  /** Time covered by the startup splash must not advance the normal background. */
  resumeOpening(): void {
    if (this.#disposed) return;
    this.#lastFrame = performance.now();
    this.#resetPointer();
  }

  setImageTransform(transform: ParticleImageTransform): void {
    if (this.#disposed) return;
    const nextTransform = normalizeParticleImageTransform(transform);
    if (
      nextTransform.positionX === this.#imageTransform.positionX
      && nextTransform.positionY === this.#imageTransform.positionY
      && nextTransform.zoom === this.#imageTransform.zoom
    ) return;
    this.#imageTransform = nextTransform;
    this.#layoutUniformDirty = true;
    if (this.#paused) this.#draw(performance.now(), false);
  }

  setPaused(paused: boolean): void {
    this.#paused = paused || document.hidden || this.#reducedMotion.matches;
    this.#lastFrame = performance.now();
    if (this.#paused && this.#transitionActive) this.#completeTransition();
    if (!this.#paused) this.#scheduleFrame();
    else this.#draw(performance.now(), false);
  }

  readonly resize = (): void => {
    if (this.#disposed) return;
    const bounds = this.#canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, bounds.width);
    const cssHeight = Math.max(1, bounds.height);
    const dpr = Math.min(this.#settings.dprCap, Math.max(1, window.devicePixelRatio || 1));
    const cssSizeChanged = cssWidth !== this.#cssWidth || cssHeight !== this.#cssHeight;
    const dprChanged = dpr !== this.#dpr;
    this.#cssWidth = cssWidth;
    this.#cssHeight = cssHeight;
    this.#dpr = dpr;
    if (cssSizeChanged || dprChanged) this.#viewportUniformsDirty = true;
    if (cssSizeChanged) this.#layoutUniformDirty = true;
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    const drawingBufferChanged = this.#canvas.width !== width || this.#canvas.height !== height;
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    if (drawingBufferChanged) this.#gl.viewport(0, 0, width, height);
    if (this.#paused) this.#draw(performance.now(), false);
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#interruptTransition();
    cancelBackgroundFrame(this.#animationFrame);
    this.#animationFrame = 0;
    window.removeEventListener("resize", this.resize);
    this.#resizeObserver?.disconnect();
    window.removeEventListener("pointermove", this.#onPointerMove, true);
    window.removeEventListener("blur", this.#resetPointer);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
    this.#reducedMotion.removeEventListener("change", this.#onReducedMotionChange);
    this.#canvas.removeEventListener("webglcontextlost", this.#onContextLost);
    for (const buffer of Object.values(this.#buffers)) this.#gl.deleteBuffer(buffer);
    this.#gl.deleteProgram(this.#program);
    this.#gl.deleteShader(this.#vertexShader);
    this.#gl.deleteShader(this.#fragmentShader);
    this.#gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.#pointerSegments.length = 0;
  }

  #requiredAttribute(name: string): number {
    const location = this.#gl.getAttribLocation(this.#program, name);
    if (location < 0) throw new Error(`Particle shader attribute ${name} is unavailable`);
    return location;
  }

  #requiredUniform(name: string): WebGLUniformLocation {
    const location = this.#gl.getUniformLocation(this.#program, name);
    if (!location) throw new Error(`Particle shader uniform ${name} is unavailable`);
    return location;
  }

  #requiredBuffer(): WebGLBuffer {
    const buffer = this.#gl.createBuffer();
    if (!buffer) throw new Error("WebGL could not create a particle buffer");
    return buffer;
  }

  #uploadBuffer(buffer: WebGLBuffer, values: BufferSource): void {
    this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, buffer);
    this.#gl.bufferData(this.#gl.ARRAY_BUFFER, values, this.#gl.STATIC_DRAW);
  }

  #bindAttributes(): void {
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.previousHome);
    gl.enableVertexAttribArray(this.#attributes.previousHome);
    gl.vertexAttribPointer(this.#attributes.previousHome, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.home);
    gl.enableVertexAttribArray(this.#attributes.home);
    gl.vertexAttribPointer(this.#attributes.home, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.previousVelocity);
    gl.enableVertexAttribArray(this.#attributes.previousVelocity);
    gl.vertexAttribPointer(this.#attributes.previousVelocity, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.previousColor);
    gl.enableVertexAttribArray(this.#attributes.previousColor);
    gl.vertexAttribPointer(this.#attributes.previousColor, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.color);
    gl.enableVertexAttribArray(this.#attributes.color);
    gl.vertexAttribPointer(this.#attributes.color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers.seed);
    gl.enableVertexAttribArray(this.#attributes.seed);
    gl.vertexAttribPointer(this.#attributes.seed, 1, gl.FLOAT, false, 0, 0);
  }

  #layout(imageWidth: number, imageHeight: number): readonly [number, number, number, number] {
    const containScale = Math.min(
      this.#cssWidth / Math.max(1, imageWidth),
      this.#cssHeight / Math.max(1, imageHeight),
    );
    const width = imageWidth * containScale * this.#imageTransform.zoom;
    const height = imageHeight * containScale * this.#imageTransform.zoom;
    return [
      (this.#cssWidth - width) * this.#imageTransform.positionX / 100,
      (this.#cssHeight - height) * this.#imageTransform.positionY / 100,
      width,
      height,
    ];
  }

  #transitionNearResponse(): number {
    return this.#transitionDuration * PARTICLE_BACKGROUND_MORPH_NEAR_RESPONSE_RATIO;
  }

  #transitionStagger(): number {
    return this.#transitionDuration * PARTICLE_BACKGROUND_MORPH_STAGGER_RATIO;
  }

  #calculateTransitionTimelineDuration(): number {
    const response = Math.max(this.#transitionMaxResponse, 0.1);
    const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / response;
    const carriedVelocity = Math.max(0, this.#transitionVelocityRatio);
    const maximumDistance = Math.max(1, this.#transitionMaximumDistance);
    const settleError = Math.min(
      PARTICLE_BACKGROUND_MORPH_SETTLE_ERROR,
      PARTICLE_BACKGROUND_MORPH_SETTLE_POSITION_PX / maximumDistance,
    );
    const settleVelocity = Math.min(
      PARTICLE_BACKGROUND_MORPH_SETTLE_VELOCITY,
      PARTICLE_BACKGROUND_MORPH_SETTLE_SPEED_PX_PER_SECOND / maximumDistance,
    );
    const settled = (springElapsed: number): boolean => {
      const springTime = omega * springElapsed;
      const decay = Math.exp(-springTime);
      const error = (1 + (1 + carriedVelocity) * springTime) * decay;
      const velocity = omega * (
        carriedVelocity + (1 + carriedVelocity) * springTime
      ) * decay;
      return error <= settleError && velocity <= settleVelocity;
    };
    let lower = 0;
    let upper = response;
    for (let iteration = 0; iteration < 18 && !settled(upper); iteration += 1) upper *= 1.5;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = 0.5 * (lower + upper);
      if (settled(middle)) upper = middle;
      else lower = middle;
    }
    return Math.max(0.1, this.#transitionStagger() + upper);
  }

  #transitionClock(): ParticleTransitionClock {
    if (this.#transitionClockCache && this.#transitionClockCacheTime === this.#simulationTime) {
      return this.#transitionClockCache;
    }
    const duration = Math.max(0.1, this.#transitionTimelineDuration);
    const rawElapsed = Math.max(0, this.#simulationTime - this.#transitionStart);
    const rawProgress = this.#transitionActive
      ? Math.min(1, rawElapsed / duration)
      : 1;
    const curve = evaluateParticleMorphCurve(rawProgress, this.#transitionCurve);
    const clock = { rawProgress, elapsed: curve.value * duration };
    this.#transitionClockCacheTime = this.#simulationTime;
    this.#transitionClockCache = clock;
    return clock;
  }

  #transitionProgress(): number {
    if (!this.#transitionActive) return 1;
    return criticalParticleSpringProgress(
      this.#transitionClock().elapsed - this.#transitionStagger() * 0.35,
      this.#transitionMaxResponse,
    );
  }

  #particleTransitionResponse(distance: number, seed: number): number {
    const distanceReference = Math.max(
      Math.hypot(this.#cssWidth, this.#cssHeight) * PARTICLE_BACKGROUND_MORPH_DISTANCE_SCALE,
      80,
    );
    const distanceFactor = smootherParticleTransition(distance / distanceReference);
    const variation = 1 - PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION
      + seed * PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION * 2;
    return (
      this.#transitionNearResponse()
      + distanceFactor * (this.#transitionDuration - this.#transitionNearResponse())
    ) * variation;
  }

  #copyCurrentHomesTo(destination: Float32Array<ArrayBuffer>): boolean {
    if (destination.length !== this.#homes.length) return false;
    const [x, y, width, height] = this.#layout(this.#imageWidth, this.#imageHeight);
    for (let index = 0; index < this.#count; index += 1) {
      const offset = index * 2;
      destination[offset] = x + (this.#homes[offset] ?? 0) * width;
      destination[offset + 1] = y + (this.#homes[offset + 1] ?? 0) * height;
    }
    return true;
  }

  #captureCurrentImagePresentation(): boolean {
    if (
      !this.#count
      || this.#previousHomes.length !== this.#homes.length
      || this.#previousVelocities.length !== this.#homes.length
      || this.#previousColors.length !== this.#colors.length
    ) return false;
    if (!this.#transitionActive) {
      if (!this.#copyCurrentHomesTo(this.#previousHomes)) return false;
      this.#previousVelocities.fill(0);
      this.#previousColors.set(this.#colors);
      return true;
    }

    const elapsed = this.#transitionClock().elapsed;
    const stagger = this.#transitionStagger();
    const [x, y, width, height] = this.#layout(this.#imageWidth, this.#imageHeight);
    for (let index = 0; index < this.#count; index += 1) {
      const offset = index * 2;
      const previousX = this.#previousHomes[offset] ?? 0;
      const previousY = this.#previousHomes[offset + 1] ?? 0;
      const homeX = x + (this.#homes[offset] ?? 0) * width;
      const homeY = y + (this.#homes[offset + 1] ?? 0) * height;
      const distance = Math.hypot(homeX - previousX, homeY - previousY);
      const response = this.#particleTransitionResponse(distance, this.#seeds[index] ?? 0);
      const displacementX = previousX - homeX;
      const displacementY = previousY - homeY;
      const initialVelocityX = this.#previousVelocities[offset] ?? 0;
      const initialVelocityY = this.#previousVelocities[offset + 1] ?? 0;
      const hasCarriedVelocity = Math.hypot(initialVelocityX, initialVelocityY) >= 0.01;
      const seed = this.#seeds[index] ?? 0;
      const transitionDelay = hasCarriedVelocity ? 0 : seed * seed * stagger;
      const springElapsed = Math.max(0, elapsed - transitionDelay);
      const progress = criticalParticleSpringProgress(springElapsed, response);
      const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / response;
      const decay = Math.exp(-omega * springElapsed);
      const velocityTermX = initialVelocityX + omega * displacementX;
      const velocityTermY = initialVelocityY + omega * displacementY;
      this.#previousHomes[offset] = homeX
        + (displacementX + velocityTermX * springElapsed) * decay;
      this.#previousHomes[offset + 1] = homeY
        + (displacementY + velocityTermY * springElapsed) * decay;
      this.#previousVelocities[offset] = 0;
      this.#previousVelocities[offset + 1] = 0;
      const colorProgress = smootherParticleTransition((progress - 0.18) / 0.82);
      const inverseColor = 1 - colorProgress;
      const colorOffset = index * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const channelOffset = colorOffset + channel;
        this.#previousColors[channelOffset] = Math.round(
          (this.#previousColors[channelOffset] ?? 0) * inverseColor
          + (this.#colors[channelOffset] ?? 0) * colorProgress,
        );
      }
    }
    return true;
  }

  #estimateMaximumTransitionResponse(): number {
    const [x, y, width, height] = this.#layout(this.#imageWidth, this.#imageHeight);
    let maximumResponse = this.#transitionNearResponse()
      * (1 - PARTICLE_BACKGROUND_MORPH_RESPONSE_VARIATION);
    let maximumVelocityRatio = 0;
    let maximumDistance = 0;
    for (let index = 0; index < this.#count; index += 1) {
      const offset = index * 2;
      const homeX = x + (this.#homes[offset] ?? 0) * width;
      const homeY = y + (this.#homes[offset + 1] ?? 0) * height;
      const distance = Math.hypot(
        homeX - (this.#previousHomes[offset] ?? 0),
        homeY - (this.#previousHomes[offset + 1] ?? 0),
      );
      maximumDistance = Math.max(maximumDistance, distance);
      const response = this.#particleTransitionResponse(distance, this.#seeds[index] ?? 0);
      maximumResponse = Math.max(maximumResponse, response);
      const velocity = Math.hypot(
        this.#previousVelocities[offset] ?? 0,
        this.#previousVelocities[offset + 1] ?? 0,
      );
      const omega = PARTICLE_BACKGROUND_CRITICAL_SPRING_95_PERCENT / response;
      maximumVelocityRatio = Math.max(maximumVelocityRatio, velocity / (omega * Math.max(distance, 1)));
    }
    this.#transitionMaximumDistance = maximumDistance;
    this.#transitionVelocityRatio = maximumVelocityRatio;
    return maximumResponse;
  }

  #transitionSettled(): boolean {
    if (!this.#transitionActive) return true;
    return this.#transitionClock().rawProgress >= 1;
  }

  #interruptTransition(): void {
    const resolve = this.#transitionResolve;
    this.#transitionResolve = undefined;
    this.#transitionRevision = 0;
    resolve?.(false);
  }

  #beginTransition(active: boolean, revision: number): Promise<boolean> {
    this.#transitionStart = this.#simulationTime;
    this.#transitionCurve = normalizeParticleMorphCurve(this.#settings.morphCurve);
    this.#transitionTimelineDuration = this.#calculateTransitionTimelineDuration();
    this.#transitionClockCacheTime = Number.NaN;
    this.#transitionClockCache = undefined;
    this.#transitionActive = active;
    this.#transitionConstantsUniformsDirty = true;
    this.#transitionActiveUniformDirty = true;
    this.#transitionElapsedUniformDirty = true;
    this.#onTransitionFrame(active ? 0 : 1, !active);
    if (!active) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      this.#transitionRevision = revision;
      this.#transitionResolve = resolve;
    });
  }

  #completeTransition(): void {
    if (!this.#transitionActive) return;
    this.#transitionActive = false;
    this.#transitionClockCacheTime = Number.NaN;
    this.#transitionClockCache = undefined;
    this.#transitionActiveUniformDirty = true;
    this.#transitionElapsedUniformDirty = true;
    this.#onTransitionFrame(1, true);
    const resolve = this.#transitionResolve;
    const revision = this.#transitionRevision;
    this.#transitionResolve = undefined;
    this.#transitionRevision = 0;
    resolve?.(revision === this.#imageRevision && !this.#disposed);
  }

  #clockSeconds(timestamp = performance.now()): number {
    if (this.#paused) return this.#simulationTime;
    const pending = Math.min(
      PARTICLE_BACKGROUND_MAX_FRAME_DELTA_SECONDS,
      Math.max(0, (timestamp - this.#lastFrame) / 1_000),
    );
    return this.#simulationTime + pending;
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (this.#disposed || this.#paused || !this.#settings.cursorInteraction || !event.isPrimary) return;
    const bounds = this.#canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
      this.#resetPointer();
      return;
    }
    const now = this.#clockSeconds();
    const previous = this.#lastPointer;
    this.#lastPointer = { x, y, at: now };
    if (!previous) return;
    const previousSegmentCount = this.#pointerSegments.length;
    const tail = this.#pointerSegments.at(-1);
    const elapsed = now - previous.at;
    const deltaX = x - previous.x;
    const deltaY = y - previous.y;
    if (elapsed <= 0.001 || elapsed > PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS) {
      if (tail) tail.sealed = true;
      return;
    }
    const speed = Math.hypot(deltaX, deltaY) / elapsed;
    if (speed < 1.5) {
      if (tail && now - tail.startedAt >= PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS) {
        tail.sealed = true;
      }
      return;
    }
    if (
      tail
      && !tail.sealed
      && now - tail.startedAt > PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS * 1.5
    ) {
      tail.sealed = true;
    }
    const rawVelocityX = deltaX / elapsed;
    const rawVelocityY = deltaY / elapsed;
    const { cursorScale, overdrive, highStrengthScale } = this.#cursorStrengthValues;
    const targetSpeedLimit = 5_200 * highStrengthScale;
    const targetSpeed = cursorScale > 0
      ? Math.min(targetSpeedLimit, speed * (1.04 + 0.14 * cursorScale) * Math.sqrt(overdrive))
      : 0;
    const targetVelocityX = rawVelocityX / speed * targetSpeed;
    const targetVelocityY = rawVelocityY / speed * targetSpeed;
    const prior = tail && now - tail.createdAt <= PARTICLE_BACKGROUND_POINTER_IDLE_SECONDS
      ? tail
      : undefined;
    const velocityX = prior ? prior.velocityX * 0.28 + targetVelocityX * 0.72 : targetVelocityX;
    const velocityY = prior ? prior.velocityY * 0.28 + targetVelocityY * 0.72 : targetVelocityY;
    if (tail && !tail.sealed) {
      tail.endX = x;
      tail.endY = y;
      tail.velocityX = velocityX;
      tail.velocityY = velocityY;
      tail.createdAt = now;
      tail.duration = Math.max(0.001, now - tail.startedAt);
      tail.sealed = tail.duration >= PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS;
    } else {
      this.#pointerSegments.push({
        startX: previous.x,
        startY: previous.y,
        endX: x,
        endY: y,
        velocityX,
        velocityY,
        startedAt: previous.at,
        createdAt: now,
        duration: elapsed,
        sealed: elapsed >= PARTICLE_BACKGROUND_POINTER_SAMPLE_SECONDS,
      });
    }
    if (this.#pointerSegments.length > PARTICLE_BACKGROUND_POINTER_SEGMENTS) {
      this.#pointerSegments.shift();
    }
    this.#pointerGeometryUniformsDirty = true;
    if (this.#pointerSegments.length !== previousSegmentCount) this.#pointerCountUniformDirty = true;
  };

  #resetPointer = (): void => {
    this.#lastPointer = undefined;
    const tail = this.#pointerSegments.at(-1);
    if (tail) tail.sealed = true;
  };

  #onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelBackgroundFrame(this.#animationFrame);
      this.#animationFrame = 0;
      this.#resetPointer();
      this.#lastFrame = performance.now();
      return;
    }
    this.#lastFrame = performance.now();
    if (!this.#paused && !this.#reducedMotion.matches) this.#scheduleFrame();
  };

  #onReducedMotionChange = (): void => {
    this.setPaused(this.#reducedMotion.matches);
  };

  #onContextLost = (event: Event): void => {
    event.preventDefault();
    cancelBackgroundFrame(this.#animationFrame);
    this.#animationFrame = 0;
    this.#onError("The particle renderer lost its WebGL context. Disable and re-enable the plugin.");
  };

  #scheduleFrame(): void {
    if (this.#disposed || this.#paused || document.hidden || this.#animationFrame) return;
    this.#animationFrame = requestBackgroundFrame(this.#canvas, (timestamp) => {
      this.#animationFrame = 0;
      this.#draw(timestamp, true);
    });
  }

  #draw(timestamp: number, scheduleNext: boolean): void {
    if (this.#disposed) return;
    if (!this.#paused) {
      this.#simulationTime = this.#clockSeconds(timestamp);
    }
    this.#lastFrame = timestamp;
    const gl = this.#gl;
    let completeTransitionAfterDraw = false;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.#count > 0) {
      const time = this.#simulationTime;
      if (this.#transitionActive) {
        this.#onTransitionFrame(this.#transitionProgress(), false);
        completeTransitionAfterDraw = this.#transitionSettled();
      }
      while (
        this.#pointerSegments.length
        && time - (this.#pointerSegments[0]?.createdAt ?? time) > PARTICLE_BACKGROUND_MAX_LIFETIME_SECONDS
      ) {
        this.#pointerSegments.shift();
        this.#pointerGeometryUniformsDirty = true;
        this.#pointerCountUniformDirty = true;
      }
      const pointerCount = this.#pointerSegments.length;
      if (this.#pointerGeometryUniformsDirty) this.#pointerSegmentValues.fill(0);
      if (pointerCount > 0) this.#pointerMotionValues.fill(0);
      for (let index = 0; index < this.#pointerSegments.length; index += 1) {
        const segment = this.#pointerSegments[index];
        if (!segment) continue;
        const segmentOffset = index * 4;
        if (this.#pointerGeometryUniformsDirty) {
          this.#pointerSegmentValues[segmentOffset] = segment.startX;
          this.#pointerSegmentValues[segmentOffset + 1] = segment.startY;
          this.#pointerSegmentValues[segmentOffset + 2] = segment.endX;
          this.#pointerSegmentValues[segmentOffset + 3] = segment.endY;
        }
        this.#pointerMotionValues[segmentOffset] = segment.velocityX;
        this.#pointerMotionValues[segmentOffset + 1] = segment.velocityY;
        this.#pointerMotionValues[segmentOffset + 2] = Math.max(0, time - segment.createdAt);
        this.#pointerMotionValues[segmentOffset + 3] = Math.max(0.001, segment.duration);
      }
      if (this.#viewportUniformsDirty) {
        gl.uniform2f(this.#uniforms.resolution, this.#cssWidth, this.#cssHeight);
        gl.uniform1f(this.#uniforms.dpr, this.#dpr);
        this.#viewportUniformsDirty = false;
      }
      if (this.#layoutUniformDirty) {
        const layout = this.#layout(this.#imageWidth, this.#imageHeight);
        gl.uniform4f(this.#uniforms.layout, layout[0], layout[1], layout[2], layout[3]);
        this.#layoutUniformDirty = false;
      }
      if (this.#pointerGeometryUniformsDirty) {
        if (pointerCount > 0) {
          gl.uniform4fv(this.#uniforms.pointerSegments, this.#pointerSegmentValues);
        }
        this.#pointerGeometryUniformsDirty = false;
      }
      if (this.#pointerCountUniformDirty) {
        gl.uniform1f(this.#uniforms.pointerCount, pointerCount);
        this.#pointerCountUniformDirty = false;
      }
      if (pointerCount > 0) {
        gl.uniform4fv(this.#uniforms.pointerMotion, this.#pointerMotionValues);
      }
      gl.uniform1f(this.#uniforms.time, time);
      if (this.#transitionActive || this.#transitionElapsedUniformDirty) {
        gl.uniform1f(this.#uniforms.transitionElapsed, this.#transitionClock().elapsed);
        this.#transitionElapsedUniformDirty = false;
      }
      if (this.#transitionConstantsUniformsDirty) {
        gl.uniform1f(this.#uniforms.transitionNearResponse, this.#transitionNearResponse());
        gl.uniform1f(this.#uniforms.transitionFarResponse, this.#transitionDuration);
        gl.uniform1f(this.#uniforms.transitionStagger, this.#transitionStagger());
        this.#transitionConstantsUniformsDirty = false;
      }
      if (this.#transitionActiveUniformDirty) {
        gl.uniform1f(this.#uniforms.transitionActive, this.#transitionActive ? 1 : 0);
        this.#transitionActiveUniformDirty = false;
      }
      if (this.#renderSettingsUniformsDirty) {
        gl.uniform1f(this.#uniforms.particleSize, this.#settings.particleSize);
        gl.uniform1f(this.#uniforms.particleOpacity, this.#settings.particleOpacity);
        gl.uniform1f(this.#uniforms.speed, this.#settings.speed);
        gl.uniform1f(this.#uniforms.noiseScale, this.#settings.noiseScale);
        gl.uniform1f(this.#uniforms.noiseStrength, this.#settings.noiseStrength);
        const damping = Math.min(0.9999, Math.max(0.8, this.#settings.damping));
        gl.uniform1f(
          this.#uniforms.dampingRate,
          Math.log(damping) / PARTICLE_BACKGROUND_FLOW_STEP_SECONDS,
        );
        gl.uniform1f(this.#uniforms.ambientCycle, this.#settings.ambientCycle);
        gl.uniform1f(this.#uniforms.cursorStrength, this.#settings.cursorStrength);
        this.#renderSettingsUniformsDirty = false;
      }
      if (this.#cursorStrengthUniformsDirty) {
        const cursorStrengthValues = this.#cursorStrengthValues;
        gl.uniform3f(
          this.#uniforms.cursorStrengthScales,
          cursorStrengthValues.highStrengthScale,
          cursorStrengthValues.stepStrengthScale,
          cursorStrengthValues.strength,
        );
        gl.uniform2f(
          this.#uniforms.cursorStrengthDerived,
          cursorStrengthValues.wakeLengthScale,
          cursorStrengthValues.squareRootStrength,
        );
        this.#cursorStrengthUniformsDirty = false;
      }
      gl.drawArrays(gl.POINTS, 0, this.#count);
    }
    // Keep the transition shader active through the draw that uses the final
    // spring state. Completing earlier skips that presentation frame and makes
    // the renderer jump straight from the penultimate pose to the static grid.
    if (completeTransitionAfterDraw) this.#completeTransition();
    if (scheduleNext) this.#scheduleFrame();
  }
}

export function openParticleImageDatabase(onVersionChange: () => void, existingOnly = false): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(PARTICLE_BACKGROUND_DB_NAME, PARTICLE_BACKGROUND_DB_VERSION);
    let settled = false;
    request.addEventListener("upgradeneeded", () => {
      if (existingOnly) {
        settled = true;
        request.transaction?.abort();
        reject(new Error("Add/select an image in Particle Image Background before using it as the startup source."));
        return;
      }
      const database = request.result;
      if (!database.objectStoreNames.contains(PARTICLE_BACKGROUND_STORE)) {
        database.createObjectStore(PARTICLE_BACKGROUND_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.addEventListener("versionchange", () => {
        database.close();
        onVersionChange();
      }, { once: true });
      resolve(database);
    });
    request.addEventListener("blocked", () => {
      if (settled) return;
      settled = true;
      reject(new Error("The image library database is blocked"));
    }, { once: true });
    request.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("The image library database could not be opened"));
    }, { once: true });
  });
}

export function readParticleImageRecords(database: IDBDatabase): Promise<ParticleImageRecord[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(PARTICLE_BACKGROUND_STORE, "readonly")
      .objectStore(PARTICLE_BACKGROUND_STORE)
      .getAll();
    request.addEventListener("success", () => {
      const records = Array.isArray(request.result)
        ? request.result.filter((value): value is Omit<ParticleImageRecord, keyof ParticleImageTransform> & Partial<ParticleImageTransform> => {
          if (!value || typeof value !== "object") return false;
          const record = value as Partial<ParticleImageRecord>;
          return typeof record.id === "string"
            && typeof record.name === "string"
            && typeof record.type === "string"
            && typeof record.size === "number"
            && typeof record.createdAt === "number"
            && record.blob instanceof Blob
            && record.thumbnail instanceof Blob;
        }).map((record): ParticleImageRecord => ({
          ...record,
          ...normalizeParticleImageTransform(record),
        }))
        : [];
      resolve(records);
    });
    request.addEventListener("error", () => reject(request.error ?? new Error("Saved particle images could not be read")), { once: true });
  });
}

/**
 * A separate, read-only presentation of the production Particle Image renderer.
 * It shares saved media/settings, never the normal controller or its theme lease.
 */
export function mountParticleImageStartupBackground(
  target: HTMLElement,
  onError: (message?: string) => void,
): { readonly ready: Promise<void>; dispose(): void } {
  const settings = readParticleBackgroundSettings();
  const layer = document.createElement("div");
  layer.dataset.codeCodexStartupParticleImage = "v1";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "absolute", inset: "0", overflow: "hidden",
    backgroundColor: settings.backgroundColor, pointerEvents: "none",
  });
  const previousImage = document.createElement("img");
  const image = document.createElement("img");
  previousImage.className = "code-codex-particle-source-previous";
  image.className = "code-codex-particle-source-current";
  for (const source of [previousImage, image]) {
    source.alt = "";
    Object.assign(source.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%",
      objectFit: "contain", opacity: "0", transition: "none", pointerEvents: "none",
    });
  }
  const canvas = document.createElement("canvas");
  canvas.className = "code-codex-particle-canvas";
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  layer.append(previousImage, image, canvas);
  target.append(layer);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cache = new ParticleImagePreparationCache();
  const urls = new Set<string>();
  let database: IDBDatabase | undefined;
  let renderer: ParticleImageRenderer | undefined;
  let records: ParticleImageRecord[] = [];
  let selectedIds: string[] = [];
  let activeId: string | undefined;
  let currentUrl: string | undefined;
  let previousUrl: string | undefined;
  let currentTransform = { ...DEFAULT_PARTICLE_IMAGE_TRANSFORM };
  let transitioning = false;
  let disposed = false;
  let settled = false;
  let activating = false;
  let firstFrame = 0;
  let cancelPaintWait: (() => void) | undefined;
  let rotationTimer = 0;
  let preparationTimer = 0;
  let resolveReady!: () => void;
  let rejectReady!: (reason: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // A caller may dispose before it starts awaiting ready; keep that cancellation
  // observed while still returning the original rejecting promise to the caller.
  void ready.catch(() => undefined);

  function revoke(url: string | undefined): void {
    if (!url || !urls.delete(url)) return;
    URL.revokeObjectURL(url);
  }
  function stopRotation(): void {
    window.clearTimeout(rotationTimer);
    rotationTimer = 0;
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stopRotation();
    window.clearTimeout(preparationTimer);
    cancelAnimationFrame(firstFrame);
    cancelPaintWait?.();
    cancelPaintWait = undefined;
    cache.dispose();
    renderer?.dispose();
    renderer = undefined;
    database?.close();
    database = undefined;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener("change", onVisibilityChange);
    image.removeAttribute("src");
    previousImage.removeAttribute("src");
    for (const url of [...urls]) revoke(url);
    layer.remove();
    if (!settled) {
      settled = true;
      rejectReady(new DOMException("Particle startup source was disposed", "AbortError"));
    }
  }
  function fail(reason: unknown): void {
    if (disposed) return;
    const detail = reason instanceof Error ? reason.message : String(reason);
    const error = new Error(`Particle Image startup source: ${detail}`);
    if (!settled) {
      settled = true;
      rejectReady(error);
    }
    dispose();
    onError(error.message);
  }
  function finishTransition(progress: number, complete: boolean): void {
    if (disposed) return;
    const opacity = settings.showSourceImage ? settings.imageOpacity : 0;
    if (!transitioning) {
      image.style.opacity = String(opacity);
      previousImage.style.opacity = "0";
      return;
    }
    const blend = smootherParticleTransition(Math.min(1, Math.max(0, progress)));
    const incoming = opacity * blend;
    const remaining = 1 - incoming;
    previousImage.style.opacity = String(remaining > Number.EPSILON
      ? Math.min(1, Math.max(0, opacity * (1 - blend) / remaining))
      : 0);
    image.style.opacity = String(incoming);
    if (complete) {
      transitioning = false;
      revoke(previousUrl);
      previousUrl = undefined;
      previousImage.removeAttribute("src");
      previousImage.style.opacity = "0";
      image.style.opacity = String(opacity);
    }
  }
  function nextRecord(): ParticleImageRecord | undefined {
    const index = activeId ? selectedIds.indexOf(activeId) : -1;
    const id = selectedIds[(index + 1 + selectedIds.length) % selectedIds.length];
    return records.find((record) => record.id === id);
  }
  function scheduleRotation(): void {
    stopRotation();
    if (disposed || activating || !settings.autoSwitch || document.hidden || reducedMotion.matches || selectedIds.length < 2) return;
    const next = nextRecord();
    if (!next || next.id === activeId) return;
    cache.prewarm(next, settings.particleCount);
    rotationTimer = window.setTimeout(() => {
      rotationTimer = 0;
      if (disposed || document.hidden || reducedMotion.matches) return;
      void activate(next).catch(fail);
    }, settings.imageDurationSeconds * 1_000);
  }
  function onVisibilityChange(): void {
    if (document.hidden || reducedMotion.matches) stopRotation();
    else scheduleRotation();
  }
  function ensureLive(): void {
    if (disposed) throw new DOMException("Particle startup source was disposed", "AbortError");
  }
  async function activate(record: ParticleImageRecord): Promise<void> {
    ensureLive();
    activating = true;
    stopRotation();
    preparationTimer = window.setTimeout(() => {
      fail(new Error("Image preparation timed out. Choose a smaller or valid image in Particle Image Background."));
    }, PARTICLE_BACKGROUND_PREPARE_TIMEOUT_MS);
    try {
      let prepared: PreparedParticleImage;
      try {
        prepared = await cache.prepare(record, settings.particleCount);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`The saved particle image could not be prepared (${detail}). Select a valid image in Particle Image Background.`, { cause: error });
      }
      ensureLive();
      const nextUrl = URL.createObjectURL(prepared.processedBlob);
      urls.add(nextUrl);
      const decoder = new Image();
      decoder.src = nextUrl;
      try {
        await decoder.decode();
      } catch (error) {
        revoke(nextUrl);
        throw new Error("The saved image could not be decoded. Select a valid image in Particle Image Background.", { cause: error });
      } finally {
        decoder.removeAttribute("src");
      }
      ensureLive();
      const transform = normalizeParticleImageTransform(record);
      const canMorph = Boolean(currentUrl && renderer && renderer.count === prepared.targetCount && !reducedMotion.matches);
      const oldCurrentUrl = currentUrl;
      revoke(previousUrl);
      previousUrl = canMorph ? oldCurrentUrl : undefined;
      if (previousUrl) {
        previousImage.src = previousUrl;
        applyParticleImageTransform(previousImage, currentTransform);
      } else {
        previousImage.removeAttribute("src");
        revoke(oldCurrentUrl);
      }
      currentUrl = nextUrl;
      currentTransform = transform;
      image.src = nextUrl;
      applyParticleImageTransform(image, transform);
      transitioning = canMorph;
      finishTransition(canMorph ? 0 : 1, !canMorph);
      const completed = await renderer?.setPreparedImage(prepared, transform);
      ensureLive();
      if (!completed || !renderer?.renderPreparedFrame()) throw new Error("The particle renderer did not present the saved image.");
      activeId = record.id;
      // Preserve the normal controller's saved selection; this is just the
      // independent instance's current image, never a localStorage update.
      if (!settled) {
        await new Promise<void>((resolve) => {
          cancelPaintWait = resolve;
          firstFrame = requestAnimationFrame(() => {
            firstFrame = requestAnimationFrame(() => {
              firstFrame = 0;
              cancelPaintWait = undefined;
              resolve();
            });
          });
        });
        ensureLive();
        layer.dataset.codeCodexStartupParticleReady = "true";
        settled = true;
        resolveReady();
      }
    } finally {
      window.clearTimeout(preparationTimer);
      preparationTimer = 0;
      activating = false;
      scheduleRotation();
    }
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotion.addEventListener("change", onVisibilityChange);
  preparationTimer = window.setTimeout(() => {
    fail(new Error("The saved image library did not become ready. Reopen Particle Image Background and select an image."));
  }, PARTICLE_BACKGROUND_PREPARE_TIMEOUT_MS);
  void (async () => {
    if (!settings.activeImageId && !settings.selectedImageIds.length) {
      throw new Error("Add/select an image in Particle Image Background before using it as the startup source.");
    }
    const opened = await openParticleImageDatabase(() => {
      fail(new Error("The saved image library changed. Reopen the startup preview."));
    }, true);
    if (disposed) {
      opened.close();
      return;
    }
    database = opened;
    records = (await readParticleImageRecords(opened)).sort((first, second) => first.createdAt - second.createdAt).slice(0, 32);
    ensureLive();
    const available = new Set(records.map((record) => record.id));
    selectedIds = settings.selectedImageIds.filter((id) => available.has(id));
    const id = settings.activeImageId && available.has(settings.activeImageId)
      ? settings.activeImageId
      : selectedIds[0];
    const initial = records.find((record) => record.id === id);
    if (!initial) throw new Error("Add/select an image in Particle Image Background before using it as the startup source.");
    renderer = new ParticleImageRenderer(canvas, fail, settings, finishTransition);
    window.clearTimeout(preparationTimer);
    await activate(initial);
  })().catch(fail);
  return { ready, dispose };
}
