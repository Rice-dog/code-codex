import {requestBackgroundFrame,cancelBackgroundFrame} from '../../background-startup-hold';
import {normalizeBlackHoleSettings,type BlackHoleBackgroundSettings} from '../../startup-background-renderers';
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
uniform float uOpening;
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
  if (uOpening < 1.0) c *= smoothstep(0.0, 1.0, uOpening);
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
  readonly replay: () => void;
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
  let openingElapsed = 0;
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
    gl.uniform1f(compositeProgram.uniforms.uOpening ?? null, reduced || settings.paused ? 1 : Math.min(1, openingElapsed / 1));
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
    if (!paused) openingElapsed += delta;
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
    replay: (): void => { openingElapsed=0; needsComposite=true; render(clock,false,true); schedule(); },
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

  replay(): void { this.#runtime.replay(); }

  dispose(): void {
    this.#runtime.dispose();
  }
}

