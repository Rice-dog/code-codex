import { requestBackgroundFrame, cancelBackgroundFrame } from '../../background-startup-hold';
import { normalizeSpectralDrapeSettings } from './model';
const DEFAULT_COLORS = ["#6A4BFF", "#E4DBFF"];
const VERTEX_SHADER = `
precision highp float;

#define MAX_STRANDS 12
#define MAX_RIPPLES 4

attribute vec2 aGrid;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform float uTime;
uniform float uClock;
uniform float uSeed;
uniform float uStrands;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uThickness;
uniform float uDepth;
uniform float uSpacing;
uniform float uSize;
uniform float uViewHeight;
uniform float uIntensity;
uniform float uShift;
uniform vec3 uBodyLab;
uniform vec3 uGlowLab;
uniform vec3 uWake;
uniform vec3 uWakeVector;
uniform float uWakeRadius;
uniform float uAspect;
uniform vec4 uRipple[MAX_RIPPLES];
uniform vec2 uIntro;

varying vec3 vColor;
varying float vGlow;

float hash(float n) {
  return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453);
}

vec3 labToLinear(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float strands(vec2 g, float t) {
  float sum = 0.0;
  for (int k = 0; k < MAX_STRANDS; k++) {
    float index = float(k);
    if (index >= uStrands) break;
    float a = hash(index + 1.0);
    float b = hash(index + 17.0);
    float c = hash(index + 43.0);
    float frequency = uFrequency * (0.55 + 0.9 * a);
    float phase = b * 6.2831853;
    float along = g.x * 6.2831853 * frequency;
    float wave =
      sin(along + phase + t * (0.35 + 0.45 * a)) * 0.62 +
      sin(along * 2.07 - phase * 1.31 - t * (0.27 + 0.36 * b)) * 0.26 +
      sin(along * 0.47 + phase * 0.7 + t * (0.19 + 0.2 * c)) * 0.3;
    float line = 0.5 + (c - 0.5) * 0.8 + uAmplitude * 0.16 * wave;
    float width = uThickness * (0.022 + 0.05 * c) * (0.75 + 0.5 * sin(along * 0.5 + t * 0.4 + phase));
    float d = (g.y - line) / max(width, 0.004);
    sum += exp(-d * d);
  }
  float edge = smoothstep(0.0, 0.12, g.y) * (1.0 - smoothstep(0.88, 1.0, g.y)) *
    smoothstep(0.0, 0.05, g.x) * (1.0 - smoothstep(0.95, 1.0, g.x));
  return (1.0 - exp(-sum * 1.1)) * edge;
}

void main() {
  float field = strands(aGrid, uTime);
  vec3 local = vec3((aGrid.x - 0.5) * 11.0, (aGrid.y - 0.5) * 11.0, field * uDepth);

  float introLight = 1.0;
  if (uIntro.x < 1.0 && uIntro.y > 0.0) {
    // Deform the actual point grid: gathered light threads open along their length.
    // The moving fold is geometry, not a screen-space reveal or an overlay.
    float delay = aGrid.x * 0.38 + 0.07 * pow(sin(aGrid.y * 3.14159265), 2.0);
    float opened = smoothstep(delay, delay + 0.54, uIntro.x);
    float gather = (1.0 - opened) * min(0.94, uIntro.y * 0.84);
    float thread = floor(aGrid.y * 6.0) / 6.0;
    float spine = sin(aGrid.x * 6.2831853 + thread * 2.4) * 0.35;
    local.y = mix(local.y, spine + local.y * 0.08, gather);
    local.x *= 1.0 - gather * 0.14;
    local.z = local.z * (1.0 - gather * 0.75)
      + sin(aGrid.y * 3.14159265 + aGrid.x * 2.4 + opened * 2.0) * gather * 1.2;
    introLight = (1.0 - gather * 0.65) + sin(opened * 3.14159265) * 0.12;
  }

  float reveal = 0.0;
  vec4 rippleSurfaceClip = vec4(0.0);
  for (int k = 0; k < MAX_RIPPLES; k++) {
    vec4 ripple = uRipple[k];
    float age = uClock - ripple.z;
    if (ripple.w <= 0.0 || age < 0.0 || age > 6.0) continue;
    // Project the actual folded/opening geometry, not an undeformed z=0 plane.
    // Skip this work entirely when no live ripple exists; share across four rings.
    if (rippleSurfaceClip.w == 0.0) rippleSurfaceClip = projectionMatrix * viewMatrix * modelMatrix * vec4(local, 1.0);
    vec2 surfaceNdc = rippleSurfaceClip.xy / rippleSurfaceClip.w;
    float radius = length((surfaceNdc - ripple.xy) * vec2(uAspect, 1.0)) * 9.0 / projectionMatrix[1][1];
    float front = radius - age * 3.4;
    float envelope = exp(-front * front * 3.0) * exp(-age * 0.5) * ripple.w;
    local.z += sin(front * 3.2) * 0.3 * envelope;
    reveal += envelope;
  }

  vec4 world = modelMatrix * vec4(local, 1.0);
  vec4 clip = projectionMatrix * viewMatrix * world;
  vec2 ndc = clip.xy / clip.w;
  vec2 offset = (ndc - uWake.xy) * vec2(uAspect, 1.0);
  float touch = exp(-dot(offset, offset) / max(uWakeRadius * uWakeRadius, 1e-4)) * uWake.z;
  world.xyz += uWakeVector * touch;

  vec4 view = viewMatrix * world;
  gl_Position = projectionMatrix * view;

  float eye = -view.z;
  float size = uSpacing * uSize * projectionMatrix[1][1] * uViewHeight * 0.5 / max(eye, 0.1);
  float nearness = clamp(9.0 / max(eye, 0.1), 0.35, 1.8);
  float shade = mix(0.35, 1.0, smoothstep(0.55, 1.2, nearness));

  float lift = smoothstep(0.06, 0.95, field);
  float glow = (pow(lift, 1.35) * 1.3 + reveal * 1.1) * shade * uIntensity;
  float shown = max(size, 1.35);
  vGlow = glow * min(size * size / (shown * shown), 1.0) * introLight;
  gl_PointSize = shown * (1.0 + touch * 0.35);

  float tone = clamp(lift * 0.9 + (aGrid.x - 0.5) * uShift + reveal * 0.25, 0.0, 1.0);
  vec3 lab = mix(uBodyLab, uGlowLab, tone);
  vColor = toSrgb(max(labToLinear(lab), vec3(0.0)));
}
`;
const FRAGMENT_SHADER = `
precision highp float;

uniform float uSoftness;
uniform float uInk;
uniform float uIntroOpacity;

varying vec3 vColor;
varying float vGlow;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float disc = 1.0 - smoothstep(mix(0.55, 0.0, uSoftness), 1.0, r);
  float amount = disc * vGlow;
  if (amount * uIntroOpacity < 0.003) discard;
  if (uInk > 0.5) {
    float alpha = clamp(amount, 0.0, 1.0);
    gl_FragColor = vec4(vColor * alpha, alpha) * uIntroOpacity;
  } else {
    gl_FragColor = vec4(vColor * amount, clamp(amount, 0.0, 1.0)) * uIntroOpacity;
  }
}
`;
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
function degToRad(deg) {
    return (deg * Math.PI) / 180;
}
function isTransparentColor(raw) {
    const t = (raw || "").trim().toLowerCase();
    if (!t || t === "transparent")
        return true;
    if (/^#[0-9a-f]{8}$/.test(t))
        return t.endsWith("00");
    if (/^#[0-9a-f]{4}$/.test(t))
        return t.endsWith("0");
    return /^(?:rgba?|hsla?)\(.*[,/]\s*(0|0?\.0+|0%)\s*\)$/.test(t);
}
function parseHexToRgb(color, fallback) {
    const cleaned = (color || "").trim().replace(/^#/, "");
    if (cleaned.length === 3 || cleaned.length === 4) {
        const r = parseInt(cleaned[0] + cleaned[0], 16);
        const g = parseInt(cleaned[1] + cleaned[1], 16);
        const b = parseInt(cleaned[2] + cleaned[2], 16);
        if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
            return [r / 255, g / 255, b / 255];
        }
    }
    else if (cleaned.length >= 6) {
        const r = parseInt(cleaned.slice(0, 2), 16);
        const g = parseInt(cleaned.slice(2, 4), 16);
        const b = parseInt(cleaned.slice(4, 6), 16);
        if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
            return [r / 255, g / 255, b / 255];
        }
    }
    return fallback;
}
function srgbToLinearChannel(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexToOklab(hex, fallback) {
    const [sr, sg, sb] = parseHexToRgb(hex, fallback);
    const r = srgbToLinearChannel(sr);
    const g = srgbToLinearChannel(sg);
    const b = srgbToLinearChannel(sb);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}
function getRelativeLuminance(hex) {
    if (isTransparentColor(hex))
        return 0;
    const [sr, sg, sb] = parseHexToRgb(hex, [0, 0, 0]);
    const r = srgbToLinearChannel(sr);
    const g = srgbToLinearChannel(sg);
    const b = srgbToLinearChannel(sb);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/**
 * Builds column-major 4x4 matrix for Three.js Euler("XYZ") = R_x(rx) * R_y(ry) * R_z(rz) with uniform scale.
 */
function buildModelMatrixRad(rx, ry, rz, scale, out) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const c0x = cy * cz;
    const c0y = cx * sz + sx * sy * cz;
    const c0z = sx * sz - cx * sy * cz;
    const c1x = -cy * sz;
    const c1y = cx * cz - sx * sy * sz;
    const c1z = sx * cz + cx * sy * sz;
    const c2x = sy;
    const c2y = -sx * cy;
    const c2z = cx * cy;
    out[0] = c0x * scale;
    out[1] = c0y * scale;
    out[2] = c0z * scale;
    out[3] = 0;
    out[4] = c1x * scale;
    out[5] = c1y * scale;
    out[6] = c1z * scale;
    out[7] = 0;
    out[8] = c2x * scale;
    out[9] = c2y * scale;
    out[10] = c2z * scale;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
}
function buildPerspectiveMatrix(fovDeg, aspect, near, far, out) {
    const f = 1.0 / Math.tan((fovDeg * Math.PI) / 360.0);
    const nf = 1.0 / (near - far);
    out[0] = f / Math.max(aspect, 1e-4);
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
}
function parameters(settings) { const s = normalizeSpectralDrapeSettings(settings); return { ...s, colors: [s.bodyColor, s.highlightColor] }; }
export class SpectralDrapeRenderer {
    constructor(root, canvas, settings, onError = () => { }) {
        const propsRef = { current: parameters(settings) };
        const resizeRef={current:()=>{}};
        const wakeRenderRef = { current: () => { } }, rebuildGridRef = { current: () => { } }, triggerRippleRef = { current: () => { } }, calmRef = { current: () => { } }, replayIntroRef = { current: () => { } };
        this.dispose = (() => {
            const gl = canvas.getContext("webgl2", {
                alpha: true,
                antialias: false,
                depth: false,
                premultipliedAlpha: true,
                powerPreference: "high-performance",
            }) ||
                canvas.getContext("webgl", {
                    alpha: true,
                    antialias: false,
                    depth: false,
                    premultipliedAlpha: true,
                    powerPreference: "high-performance",
                });
            if (!gl) {
                throw new Error("SPECTRAL_WEBGL_UNAVAILABLE: WebGL is required.");
            }
            const compiledShaders = [];
            let program = null;
            let gridBuffer = null;
            try {
                const compile = (type, source) => {
                    const shader = gl.createShader(type);
                    if (!shader)
                        throw new Error("Failed to create WebGL shader");
                    compiledShaders.push(shader);
                    gl.shaderSource(shader, source);
                    gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                        throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation error");
                    }
                    return shader;
                };
                program = gl.createProgram();
                if (!program)
                    throw new Error("Failed to create WebGL program");
                gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
                gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    throw new Error(gl.getProgramInfoLog(program) || "Program link error");
                }
                gl.useProgram(program);
                gridBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
                const aGridLoc = gl.getAttribLocation(program, "aGrid");
                gl.enableVertexAttribArray(aGridLoc);
                gl.vertexAttribPointer(aGridLoc, 2, gl.FLOAT, false, 0, 0);
            }
            catch (err) {
                onError(err instanceof Error ? err.message : String(err));
                compiledShaders.forEach((s) => gl.deleteShader(s));
                if (program)
                    gl.deleteProgram(program);
                if (gridBuffer)
                    gl.deleteBuffer(gridBuffer);
                throw err;
            }
            const u = {
                modelMatrix: gl.getUniformLocation(program, "modelMatrix"),
                viewMatrix: gl.getUniformLocation(program, "viewMatrix"),
                projectionMatrix: gl.getUniformLocation(program, "projectionMatrix"),
                uTime: gl.getUniformLocation(program, "uTime"),
                uClock: gl.getUniformLocation(program, "uClock"),
                uSeed: gl.getUniformLocation(program, "uSeed"),
                uStrands: gl.getUniformLocation(program, "uStrands"),
                uAmplitude: gl.getUniformLocation(program, "uAmplitude"),
                uFrequency: gl.getUniformLocation(program, "uFrequency"),
                uThickness: gl.getUniformLocation(program, "uThickness"),
                uDepth: gl.getUniformLocation(program, "uDepth"),
                uSpacing: gl.getUniformLocation(program, "uSpacing"),
                uSize: gl.getUniformLocation(program, "uSize"),
                uViewHeight: gl.getUniformLocation(program, "uViewHeight"),
                uIntensity: gl.getUniformLocation(program, "uIntensity"),
                uShift: gl.getUniformLocation(program, "uShift"),
                uBodyLab: gl.getUniformLocation(program, "uBodyLab"),
                uGlowLab: gl.getUniformLocation(program, "uGlowLab"),
                uWake: gl.getUniformLocation(program, "uWake"),
                uWakeVector: gl.getUniformLocation(program, "uWakeVector"),
                uWakeRadius: gl.getUniformLocation(program, "uWakeRadius"),
                uAspect: gl.getUniformLocation(program, "uAspect"),
                uRipple0: gl.getUniformLocation(program, "uRipple[0]"),
                uSoftness: gl.getUniformLocation(program, "uSoftness"),
                uInk: gl.getUniformLocation(program, "uInk"),
                uIntro: gl.getUniformLocation(program, "uIntro"),
                uIntroOpacity: gl.getUniformLocation(program, "uIntroOpacity"),
            };
            let pointCount = 0;
            let spacing = 11.0 / 259.0;
            const buildGrid = (rawDensity) => {
                const scale = Math.sqrt(clamp(rawDensity || 1, 0.2, 2.5));
                const cols = Math.max(24, Math.round(260 * scale));
                const rows = Math.max(16, Math.round(170 * scale));
                pointCount = cols * rows;
                spacing = 11.0 / (cols - 1);
                const data = new Float32Array(pointCount * 2);
                let ptr = 0;
                const invCols = 1.0 / (cols - 1);
                const invRows = 1.0 / (rows - 1);
                for (let r = 0; r < rows; r++) {
                    const gy = r * invRows;
                    for (let c = 0; c < cols; c++) {
                        data[ptr++] = c * invCols;
                        data[ptr++] = gy;
                    }
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            };
            rebuildGridRef.current = buildGrid;
            buildGrid(propsRef.current.density);
            const modelMatrix = new Float32Array(16);
            const viewMatrix = new Float32Array([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, -9, 1,
            ]);
            const projectionMatrix = new Float32Array(16);
            // Raw pointer input state (written by DOM events, consumed smoothly per frame)
            const pointer = {
                x: 0.5,
                y: 0.5,
                inside: false,
                presses: 0,
                pressX: 0,
                pressY: 0,
            };
            // Continuous frame-damped simulation state (matches official reference constants)
            const sim = {
                time: 0,
                clock: 0,
                leanX: 0,
                leanY: 0,
                wakeX: 9,
                wakeY: 9,
                lastX: 0.5,
                lastY: 0.5,
                hasLast: false,
                velocityX: 0,
                velocityY: 0,
                strength: 0,
                presses: 0,
                nextRipple: 0,
                ripples: new Float32Array([
                    0, 0, -99, 0,
                    0, 0, -99, 0,
                    0, 0, -99, 0,
                    0, 0, -99, 0,
                ]),
            };
            let frameId = 0;
            let lastNow = 0;
            let isVisible = true;
            let disposed = false;
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
            let introProgress = 0;
            const requestFrame = () => {
                if (!frameId && !disposed && isVisible && !document.hidden) {
                    frameId = requestBackgroundFrame(root, render);
                }
            };
            wakeRenderRef.current = requestFrame;
            replayIntroRef.current = () => {
                introProgress = 0;
                lastNow = 0;
                requestFrame();
            };
            triggerRippleRef.current = (gx = 0.5, gy = 0.5, strength = 1.0) => {
                const base = sim.nextRipple * 4;
                sim.nextRipple = (sim.nextRipple + 1) % 4;
                sim.ripples[base] = clamp(gx, -0.5, 1.5);
                sim.ripples[base + 1] = clamp(gy, -0.5, 1.5);
                sim.ripples[base + 2] = sim.clock;
                sim.ripples[base + 3] = strength;
                requestFrame();
            };
            calmRef.current = () => {
                for (let i = 0; i < 4; i++) {
                    sim.ripples[i * 4 + 2] = -99;
                    sim.ripples[i * 4 + 3] = 0;
                }
                sim.strength = 0;
                sim.velocityX = 0;
                sim.velocityY = 0;
                requestFrame();
            };
            const resize = () => {
                const rect = canvas.getBoundingClientRect();
                const maxDpr = Math.min(window.devicePixelRatio || 1, Math.max(propsRef.current.dpr || 2, 0.5));
                const width = Math.max(1, Math.round(rect.width * maxDpr));
                const height = Math.max(1, Math.round(rect.height * maxDpr));
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }
                requestFrame();
            };
            resizeRef.current=resize;
            const updatePointerCoords = (e) => {
                const rect = root.getBoundingClientRect();
                pointer.x = (e.clientX - rect.left) / Math.max(rect.width, 1);
                pointer.y = 1 - (e.clientY - rect.top) / Math.max(rect.height, 1);
                pointer.inside = true;
            };
            const onPointerMove = (e) => {
                updatePointerCoords(e);
                requestFrame();
            };
            const onPointerDown = (e) => {
                updatePointerCoords(e);
                pointer.pressX = 2 * pointer.x - 1;
                pointer.pressY = 2 * pointer.y - 1;
                pointer.presses += 1;
                requestFrame();
            };
            const onPointerLeaveOrCancel = () => {
                pointer.inside = false;
                requestFrame();
            };
            function render(now) {
                frameId = 0;
                if (disposed)
                    return;
                const p = propsRef.current;
                const m = Math.min(Math.max((now - (lastNow || now)) / 1000, 0), 0.05);
                lastNow = now;
                const isReduced = reducedMotion.matches;
                if (!p.introEnabled || isReduced || p.introStrength <= 0) {
                    introProgress = 1;
                }
                else if (introProgress < 1) {
                    introProgress = Math.min(1, introProgress + m / clamp(p.introDuration, 0.8, 12));
                }
                const progressLabel = introProgress.toFixed(4);
                if (root.dataset.introProgress !== progressLabel)
                    root.dataset.introProgress = progressLabel;
                const animateFlow = !p.paused && !isReduced;
                if (animateFlow) {
                    sim.time += m * clamp(p.speed ?? 1, 0, 4) * clamp(p.flow ?? 1, 0, 4) * 0.3;
                }
                if (!isReduced) {
                    sim.clock += m;
                }
                const w = canvas.width;
                const h = canvas.height;
                const aspect = w / Math.max(h, 1);
                const active = Boolean(p.interactive) && !isReduced && pointer.inside;
                const parallaxAmt = clamp(p.parallax ?? 1, 0, 3);
                const targetLeanX = active ? (pointer.x - 0.5) * 2 : 0;
                const targetLeanY = active ? (pointer.y - 0.5) * 2 : 0;
                const leanEase = 1 - Math.exp(-2.2 * m);
                sim.leanX += (targetLeanX - sim.leanX) * leanEase;
                sim.leanY += (targetLeanY - sim.leanY) * leanEase;
                // Fade, rotation and unfurling share the same clock and start on the first frame.
                // Ease out the opening turn into the exact configured orientation.
                const introEase = introProgress * introProgress * (3 - 2 * introProgress);
                const introTurn = (1 - introEase) * clamp(p.introStrength, 0, 2);
                const rx = degToRad(clamp(p.tilt ?? -40, -180, 180)) - 0.06 * sim.leanY * parallaxAmt - 0.12 * introTurn;
                const ry = degToRad(clamp(p.turn ?? -45, -180, 180)) + 0.08 * sim.leanX * parallaxAmt - 0.48 * introTurn;
                const rz = degToRad(clamp(p.roll ?? 110, -180, 180)) + 0.16 * introTurn;
                const zoomScale = clamp(p.zoom ?? 1, 0.3, 3);
                buildPerspectiveMatrix(38, aspect, 0.1, 100, projectionMatrix);
                buildModelMatrixRad(rx, ry, rz, zoomScale, modelMatrix);
                // Smooth frame-rate-independent velocity & wake position
                let instVx = 0;
                let instVy = 0;
                if (active) {
                    if (!sim.hasLast) {
                        sim.lastX = pointer.x;
                        sim.lastY = pointer.y;
                        sim.wakeX = pointer.x;
                        sim.wakeY = pointer.y;
                        sim.hasLast = true;
                    }
                    if (m > 0) {
                        instVx = (pointer.x - sim.lastX) / m;
                        instVy = (pointer.y - sim.lastY) / m;
                    }
                    sim.lastX = pointer.x;
                    sim.lastY = pointer.y;
                }
                else {
                    sim.hasLast = false;
                }
                const velEase = 1 - Math.exp(-6 * m);
                sim.velocityX += (clamp(instVx, -5, 5) - sim.velocityX) * velEase;
                sim.velocityY += (clamp(instVy, -5, 5) - sim.velocityY) * velEase;
                const wakeEase = 1 - Math.exp(-7 * m);
                if (active) {
                    sim.wakeX += (pointer.x - sim.wakeX) * wakeEase;
                    sim.wakeY += (pointer.y - sim.wakeY) * wakeEase;
                }
                const speedMag = Math.hypot(sim.velocityX * aspect, sim.velocityY);
                const targetStrength = active ? clamp(0.9 * speedMag, 0, 1.4) : 0;
                sim.strength += (targetStrength - sim.strength) * (1 - Math.exp(-4 * m));
                const halfFrustumHeight = 9 * Math.tan(degToRad(38) / 2);
                const brushClamped = clamp(p.brush ?? 1, 0, 3);
                const dirX = sim.velocityX / Math.max(speedMag, 1e-4);
                const dirY = sim.velocityY / Math.max(speedMag, 1e-4);
                const wakeVecX = dirX * aspect * halfFrustumHeight * 0.16;
                const wakeVecY = dirY * halfFrustumHeight * 0.16;
                // Process click ripples on press count change
                if (pointer.presses !== sim.presses) {
                    sim.presses = pointer.presses;
                    if (p.clickRipples && p.interactive && !isReduced) {
                        const slot = sim.nextRipple * 4;
                        sim.nextRipple = (sim.nextRipple + 1) % 4;
                        sim.ripples[slot] = pointer.pressX;
                        sim.ripples[slot + 1] = pointer.pressY;
                        sim.ripples[slot + 2] = sim.clock;
                        sim.ripples[slot + 3] = 1.0;
                    }
                }
                gl.viewport(0, 0, w, h);
                const bg = p.backgroundColor ?? "#0a0a0a";
                const transparent = isTransparentColor(bg);
                const lum = getRelativeLuminance(bg);
                const isInk = !transparent && lum > 0.25;
                if (transparent) {
                    gl.clearColor(0, 0, 0, 0);
                }
                else {
                    const [br, bgCh, bb] = parseHexToRgb(bg, [0.039, 0.039, 0.039]);
                    gl.clearColor(br, bgCh, bb, 1);
                }
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.disable(gl.DEPTH_TEST);
                gl.enable(gl.BLEND);
                if (isInk) {
                    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                }
                else {
                    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                }
                const c0 = p.colors?.[0] ?? DEFAULT_COLORS[0];
                const c1 = p.colors?.[1] ?? p.colors?.[0] ?? DEFAULT_COLORS[1];
                const bodyLab = hexToOklab(c0, [0.416, 0.294, 1.0]);
                const glowLab = hexToOklab(c1, [0.894, 0.859, 1.0]);
                gl.useProgram(program);
                gl.uniformMatrix4fv(u.modelMatrix, false, modelMatrix);
                gl.uniformMatrix4fv(u.viewMatrix, false, viewMatrix);
                gl.uniformMatrix4fv(u.projectionMatrix, false, projectionMatrix);
                gl.uniform1f(u.uTime, sim.time);
                gl.uniform1f(u.uClock, sim.clock);
                gl.uniform1f(u.uSeed, 0.137 * (p.seed ?? 0));
                gl.uniform1f(u.uStrands, Math.round(clamp(p.strands ?? 8, 1, 12)));
                gl.uniform1f(u.uAmplitude, clamp(p.amplitude ?? 1, 0, 3));
                gl.uniform1f(u.uFrequency, 0.6 * clamp(p.frequency ?? 1, 0.05, 4));
                gl.uniform1f(u.uThickness, clamp(p.thickness ?? 0.7, 0.2, 4));
                gl.uniform1f(u.uDepth, 1.6 * clamp(p.depth ?? 1, 0, 3));
                gl.uniform1f(u.uSpacing, spacing);
                gl.uniform1f(u.uSize, 0.5 * clamp(p.dotSize ?? 1, 0.1, 4));
                gl.uniform1f(u.uViewHeight, h);
                gl.uniform1f(u.uIntensity, clamp(p.intensity ?? 1, 0, 4));
                gl.uniform1f(u.uShift, clamp(p.colorShift ?? 0.3, -1, 1));
                gl.uniform3f(u.uBodyLab, bodyLab[0], bodyLab[1], bodyLab[2]);
                gl.uniform3f(u.uGlowLab, glowLab[0], glowLab[1], glowLab[2]);
                gl.uniform3f(u.uWake, 2 * sim.wakeX - 1, 2 * sim.wakeY - 1, sim.strength * brushClamped);
                gl.uniform3f(u.uWakeVector, wakeVecX, wakeVecY, 0);
                gl.uniform1f(u.uWakeRadius, clamp(p.brushRadius ?? 0.2, 0.03, 1));
                gl.uniform1f(u.uAspect, aspect);
                gl.uniform4fv(u.uRipple0, sim.ripples);
                gl.uniform1f(u.uSoftness, clamp(p.softness ?? 0.6, 0, 1));
                gl.uniform1f(u.uInk, isInk ? 1.0 : 0.0);
                gl.uniform2f(u.uIntro, introProgress, clamp(p.introStrength, 0, 2));
                gl.uniform1f(u.uIntroOpacity, introEase);
                gl.drawArrays(gl.POINTS, 0, pointCount);
                let hasActiveRipple = false;
                for (let i = 0; i < 4; i++) {
                    if (sim.ripples[i * 4 + 3] > 0 && sim.clock - sim.ripples[i * 4 + 2] < 6.0) {
                        hasActiveRipple = true;
                        break;
                    }
                }
                const stillSettling = hasActiveRipple ||
                    sim.strength > 0.002 ||
                    Math.abs(sim.leanX - targetLeanX) > 0.001 ||
                    Math.abs(sim.leanY - targetLeanY) > 0.001;
                if (!isReduced && (introProgress < 1 || animateFlow || stillSettling)) {
                    requestFrame();
                }
            }
            const onVisibilityChange = () => {
                if (frameId) {
                    cancelBackgroundFrame(frameId);
                    frameId = 0;
                }
                lastNow = 0;
                requestFrame();
            };
            const resizeObserver = new ResizeObserver(resize);
            resizeObserver.observe(canvas);
            const intersectionObserver = new IntersectionObserver(([entry]) => {
                isVisible = entry.isIntersecting;
                onVisibilityChange();
            }, { rootMargin: "80px" });
            intersectionObserver.observe(root);
            root.addEventListener("pointermove", onPointerMove, { passive: true });
            root.addEventListener("pointerdown", onPointerDown, { passive: true });
            root.addEventListener("pointerleave", onPointerLeaveOrCancel, { passive: true });
            root.addEventListener("pointercancel", onPointerLeaveOrCancel, { passive: true });
            document.addEventListener("visibilitychange", onVisibilityChange);
            reducedMotion.addEventListener("change", onVisibilityChange);
            const contextLost=event=>{event.preventDefault();disposed=true;if(frameId){cancelBackgroundFrame(frameId);frameId=0;}onError('SPECTRAL_CONTEXT_LOST: The graphics context was lost. Enable the background again to retry.');};
            canvas.addEventListener('webglcontextlost',contextLost);
            resize();
            return () => {
                disposed = true;
                wakeRenderRef.current = () => { };
                rebuildGridRef.current = () => { };
                triggerRippleRef.current = () => { };
                calmRef.current = () => { };
                replayIntroRef.current = () => { };
                if (frameId)
                    cancelBackgroundFrame(frameId);
                canvas.removeEventListener('webglcontextlost',contextLost);
                resizeObserver.disconnect();
                intersectionObserver.disconnect();
                root.removeEventListener("pointermove", onPointerMove);
                root.removeEventListener("pointerdown", onPointerDown);
                root.removeEventListener("pointerleave", onPointerLeaveOrCancel);
                root.removeEventListener("pointercancel", onPointerLeaveOrCancel);
                document.removeEventListener("visibilitychange", onVisibilityChange);
                reducedMotion.removeEventListener("change", onVisibilityChange);
                if (gridBuffer)
                    gl.deleteBuffer(gridBuffer);
                if (program)
                    gl.deleteProgram(program);
                compiledShaders.forEach((s) => gl.deleteShader(s));
            };
        })();
        this.setSettings = next => { const previous = propsRef.current; propsRef.current = parameters(next); if (previous.density !== propsRef.current.density)
            rebuildGridRef.current(propsRef.current.density); if (!previous.introEnabled && propsRef.current.introEnabled)
            replayIntroRef.current(); if(previous.dpr!==propsRef.current.dpr)resizeRef.current(); wakeRenderRef.current(); };
        this.replay = () => replayIntroRef.current();
    }
}
