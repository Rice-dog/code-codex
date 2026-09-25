"use client";

// Adapted from the user's local blinking-squares-background-effect project.
// The source effect remains independent; this wrapper forwards native Codex
// window input to a non-interactive full-window background canvas.

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const MAX_POINTER_PULSES = 6;
const MAX_KEYBOARD_PULSE_CAPACITY = 12;
const MAX_RENDERED_PULSES = MAX_POINTER_PULSES + MAX_KEYBOARD_PULSE_CAPACITY;

const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 POSITIONS[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(POSITIONS[gl_VertexID],0.,1.);}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGridSize;
uniform float uSquareSize;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uFalloff;
uniform float uMinBrightness;
uniform float uTwinkleSpeed;
uniform float uTwinkleStrength;
uniform float uIntensity;
uniform float uOpacity;
uniform float uDirection;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uInteractionRadius;
uniform float uInteractionStrength;
uniform float uBrightnessBoost;
uniform float uDensityBoost;
uniform vec4 uInertia[16];
uniform vec4 uPulses[${MAX_RENDERED_PULSES}];
uniform int uPulseCount;
uniform float uPulseStrength;
uniform float uPulseLift;
uniform float uHoldProgress;
uniform float uLiftActive;
uniform float uIntroProgress;
uniform float uIntroIntensity;
uniform vec3 uSquareColor;
uniform vec3 uBackgroundColor;
out vec4 fragColor;

float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float hash22(vec2 p){return fract(sin(dot(p,vec2(269.5,183.3)))*43758.5453123);}
float radialFalloff(vec2 point,vec2 center,float radius){
  vec2 delta=point-center;
  return 1.-smoothstep(0.,radius*radius,dot(delta,delta));
}

float directionCoordinate(vec2 cellCenter){
  vec2 cellUv=clamp(cellCenter/uResolution,0.,1.);
  if(uDirection<.5) return cellUv.x;
  if(uDirection<1.5) return 1.-cellUv.x;
  if(uDirection<2.5) return cellUv.y;
  return 1.-cellUv.y;
}

float directionalDensity(vec2 cellCenter){
  float coordinate=directionCoordinate(cellCenter);
  float span=max(.001,uFadeEnd-uFadeStart);
  float fade=clamp((coordinate-uFadeStart)/span,0.,1.);
  return pow(fade,max(.3,uFalloff));
}

float inertiaAt(vec2 cellCenter){
  float inertiaField=0.;
  for(int i=0;i<16;i++){
    vec4 samplePoint=uInertia[i];
    inertiaField=max(inertiaField,radialFalloff(cellCenter,samplePoint.xy,uInteractionRadius)*samplePoint.z);
  }
  return inertiaField;
}

float pulseAt(vec2 cellCenter,float cellSize){
  float pulseField=0.;
  for(int i=0;i<${MAX_RENDERED_PULSES};i++){
    if(i>=uPulseCount) break;
    vec4 pulse=uPulses[i];
    float ringDistance=abs(distance(cellCenter,pulse.xy)-pulse.z);
    float ring=1.-smoothstep(max(2.,cellSize*.45),max(4.,cellSize*1.45),ringDistance);
    pulseField=min(1.,pulseField+ring*pulse.w);
  }
  return pulseField;
}

float liftForValue(float value){
  if(value<=1.) return value*.16;
  if(value<=30.) return .16+(value-1.)*(.4/29.);
  return min(1.68,.56+(value-30.)*(1.12/60.));
}

vec4 renderCell(vec2 sourceCell,float cellSize,float halfSize){
  vec2 cellCenter=(sourceCell+.5)*cellSize;
  if(cellCenter.x<0.||cellCenter.x>uResolution.x||cellCenter.y<0.||cellCenter.y>uResolution.y) return vec4(0.);
  float hoverField=radialFalloff(cellCenter,uPointer,uInteractionRadius)*uPointerActive;
  float interactionField=max(hoverField,inertiaAt(cellCenter))*uInteractionStrength;
  float pulseField=pulseAt(cellCenter,cellSize);
  float density=directionalDensity(cellCenter);
  float interactiveDensity=clamp(density+interactionField*uDensityBoost+pulseField*uDensityBoost*.72,0.,1.);
  float exists=1.-step(interactiveDensity,hash21(sourceCell));

  float phase=hash22(sourceCell)*6.2831853;
  float rate=mix(.62,1.5,hash21(sourceCell+17.37));
  float localRate=rate*(1.+hoverField*uInteractionStrength*.45);
  float oscillation=.5+.5*sin(uTime*uTwinkleSpeed*6.2831853*localRate+phase);
  float twinkle=mix(1.,oscillation,uTwinkleStrength);
  float introOrder=clamp((1.-directionCoordinate(cellCenter))*.76+(hash21(sourceCell+43.17)-.5)*.13,0.,.87);
  float introReveal=smoothstep(introOrder,introOrder+.13,uIntroProgress);
  float introFront=exp(-pow((uIntroProgress-introOrder)*10.,2.))*introReveal;
  float brightness=mix(uMinBrightness,1.,twinkle)*uIntensity;
  brightness*=1.+interactionField*uBrightnessBoost+pulseField*uPulseStrength+introFront*.9*uIntroIntensity;

  float holdField=radialFalloff(cellCenter,uPointer,uInteractionRadius)*uHoldProgress;
  float liftAmount=liftForValue(uPulseLift)*max(pow(pulseField,.72),pow(holdField,.72));
  vec2 liftedCenter=sourceCell+.5+vec2(0.,liftAmount);
  vec2 liftedLocal=gl_FragCoord.xy/cellSize-liftedCenter;
  float introStartScale=max(.05,1.-.84*min(uIntroIntensity,1.15));
  float introScale=mix(introStartScale,1.,smoothstep(introOrder,introOrder+.1,uIntroProgress));
  float distanceToEdge=max(abs(liftedLocal.x),abs(liftedLocal.y));
  float antialias=max(fwidth(distanceToEdge),.001);
  float animatedHalfSize=halfSize*introScale;
  float square=1.-smoothstep(animatedHalfSize-antialias,animatedHalfSize+antialias,distanceToEdge);
  float mask=square*exists*uOpacity*introReveal;
  return vec4(uSquareColor*brightness,mask);
}

void main(){
  float longEdge=max(uResolution.x,uResolution.y);
  float cellSize=longEdge/max(8.,uGridSize);
  float halfSize=clamp(uSquareSize,.05,.98)*.5;
  vec2 targetCell=floor(gl_FragCoord.xy/cellSize);
  vec4 result=renderCell(targetCell,cellSize,halfSize);
  float maximumLift=liftForValue(uPulseLift);
  if(uLiftActive>.5&&maximumLift+halfSize>.5){
    vec4 lowerCell=renderCell(targetCell-vec2(0.,1.),cellSize,halfSize);
    if(lowerCell.a>result.a) result=lowerCell;
  }
  if(uLiftActive>.5&&maximumLift+halfSize>1.5){
    vec4 secondLowerCell=renderCell(targetCell-vec2(0.,2.),cellSize,halfSize);
    if(secondLowerCell.a>result.a) result=secondLowerCell;
  }
  vec3 color=mix(uBackgroundColor,result.rgb,result.a);
  fragColor=vec4(color,1.);
}
`;

export type BlinkingSquaresDirection = "right" | "left" | "top" | "bottom";

export interface BlinkingSquaresProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
  children?: ReactNode;
  direction?: BlinkingSquaresDirection;
  gridSize?: number;
  squareSize?: number;
  fadeStart?: number;
  fadeEnd?: number;
  falloff?: number;
  minBrightness?: number;
  twinkleSpeed?: number;
  twinkleStrength?: number;
  intensity?: number;
  opacity?: number;
  squareColor?: string;
  backgroundColor?: string;
  dpr?: number;
  mouseInteraction?: boolean;
  keyboardInteraction?: boolean;
  keyboardPulseLimit?: number;
  keyboardPeakCooldown?: number;
  interactionRadius?: number;
  interactionStrength?: number;
  brightnessBoost?: number;
  densityBoost?: number;
  responseSpeed?: number;
  inertiaDuration?: number;
  holdLiftSpeed?: number;
  pulseStrength?: number;
  pulseLift?: number;
  pulseSpeed?: number;
  pulseDecay?: number;
  introEnabled?: boolean;
  introDuration?: number;
  introIntensity?: number;
  introKey?: string | number;
  paused?: boolean;
  onError?: (message?: string) => void;
}

type RuntimeConfig = Required<Omit<BlinkingSquaresProps, "width" | "height" | "className" | "children" | "introKey" | "onError">>;

export default function BlinkingSquares({
  width = "100%", height = "100%", className = "", children,
  direction = "right", gridSize = 52, squareSize = .57, fadeStart = .33, fadeEnd = 1, falloff = 1.25,
  minBrightness = .55, twinkleSpeed = 1.4, twinkleStrength = .94, intensity = 1, opacity = 1,
  squareColor = "#bb29ff", backgroundColor = "#000000", dpr = 1.5,
  mouseInteraction = true, keyboardInteraction = true, keyboardPulseLimit = 5, keyboardPeakCooldown = 2,
  interactionRadius = 140, interactionStrength = 1, brightnessBoost = .85, densityBoost = .42,
  responseSpeed = 14, inertiaDuration = .65, holdLiftSpeed = .65, pulseStrength = 1.35, pulseLift = .75, pulseSpeed = 280, pulseDecay = 1.35,
  introEnabled = true, introDuration = 1.8, introIntensity = 1, introKey = 0,
  paused = false, onError,
}: BlinkingSquaresProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef<RuntimeConfig>({ direction, gridSize, squareSize, fadeStart, fadeEnd, falloff, minBrightness, twinkleSpeed, twinkleStrength, intensity, opacity, squareColor, backgroundColor, dpr, mouseInteraction, keyboardInteraction, keyboardPulseLimit, keyboardPeakCooldown, interactionRadius, interactionStrength, brightnessBoost, densityBoost, responseSpeed, inertiaDuration, holdLiftSpeed, pulseStrength, pulseLift, pulseSpeed, pulseDecay, introEnabled, introDuration, introIntensity, paused });
  const [error, setError] = useState<string | null>(null);
  const [rendererEpoch, setRendererEpoch] = useState(0);

  useEffect(() => {
    configRef.current = { direction, gridSize, squareSize, fadeStart, fadeEnd, falloff, minBrightness, twinkleSpeed, twinkleStrength, intensity, opacity, squareColor, backgroundColor, dpr, mouseInteraction, keyboardInteraction, keyboardPulseLimit, keyboardPeakCooldown, interactionRadius, interactionStrength, brightnessBoost, densityBoost, responseSpeed, inertiaDuration, holdLiftSpeed, pulseStrength, pulseLift, pulseSpeed, pulseDecay, introEnabled, introDuration, introIntensity, paused };
  }, [direction, gridSize, squareSize, fadeStart, fadeEnd, falloff, minBrightness, twinkleSpeed, twinkleStrength, intensity, opacity, squareColor, backgroundColor, dpr, mouseInteraction, keyboardInteraction, keyboardPulseLimit, keyboardPeakCooldown, interactionRadius, interactionStrength, brightnessBoost, densityBoost, responseSpeed, inertiaDuration, holdLiftSpeed, pulseStrength, pulseLift, pulseSpeed, pulseDecay, introEnabled, introDuration, introIntensity, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, powerPreference: "high-performance" });
    if (!gl) { const message = "WebGL2 is not available in this browser."; setError(message); onError?.(message); return; }
    let program: WebGLProgram | null = null;
    let vertexArray: WebGLVertexArrayObject | null = null;
    let frameId = 0;
    let running = false;
    let pageVisible = !document.hidden;
    let onScreen = true;
    let elapsed = 0;
    let interactionElapsed = 0;
    let previousTime = performance.now();
    let introStartedAt: number | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: 0, targetActive: 0, initialized: false };
    let inertiaPoints: Array<{ x: number; y: number; start: number }> = [];
    let lastInertiaPoint: { x: number; y: number } | null = null;
    let holding = false;
    let holdProgress = 0;
    let activePointerId: number | null = null;
    let holdStartedAt = 0;
    let lastKeyboardPulseAt = 0;
    let keyboardLockedUntil = 0;
    let pointerPulses: Array<{ x: number; y: number; start: number }> = [];
    let keyboardPulses: Array<{ x: number; y: number; start: number }> = [];
    const inertiaUniforms = new Float32Array(64);
    const pulseUniforms = new Float32Array(MAX_RENDERED_PULSES * 4);

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to allocate shader.");
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error."; gl.deleteShader(shader); throw new Error(message); }
      return shader;
    };
    try {
      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      program = gl.createProgram();
      if (!program) throw new Error("Unable to allocate WebGL program.");
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Unknown shader link error.");
      vertexArray = gl.createVertexArray();
      if (!vertexArray) throw new Error("Unable to allocate vertex array.");
      gl.bindVertexArray(vertexArray); gl.useProgram(program); setError(null); onError?.();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Unable to initialize Blinking Squares."; setError(message); onError?.(message); return; }

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const locations = {
      resolution: uniform("uResolution"), time: uniform("uTime"), gridSize: uniform("uGridSize"), squareSize: uniform("uSquareSize"), fadeStart: uniform("uFadeStart"), fadeEnd: uniform("uFadeEnd"), falloff: uniform("uFalloff"), minBrightness: uniform("uMinBrightness"), twinkleSpeed: uniform("uTwinkleSpeed"), twinkleStrength: uniform("uTwinkleStrength"), intensity: uniform("uIntensity"), opacity: uniform("uOpacity"), direction: uniform("uDirection"), pointer: uniform("uPointer"), pointerActive: uniform("uPointerActive"), interactionRadius: uniform("uInteractionRadius"), interactionStrength: uniform("uInteractionStrength"), brightnessBoost: uniform("uBrightnessBoost"), densityBoost: uniform("uDensityBoost"), inertia: uniform("uInertia[0]"), pulses: uniform("uPulses[0]"), pulseCount: uniform("uPulseCount"), pulseStrength: uniform("uPulseStrength"), pulseLift: uniform("uPulseLift"), holdProgress: uniform("uHoldProgress"), liftActive: uniform("uLiftActive"), introProgress: uniform("uIntroProgress"), introIntensity: uniform("uIntroIntensity"), squareColor: uniform("uSquareColor"), backgroundColor: uniform("uBackgroundColor"),
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(3, Math.max(1, configRef.current.dpr), Math.max(1, window.devicePixelRatio || 1));
      const nextWidth = Math.max(1, Math.round(bounds.width * scale));
      const nextHeight = Math.max(1, Math.round(bounds.height * scale));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) { canvas.width = nextWidth; canvas.height = nextHeight; }
      gl.viewport(0, 0, nextWidth, nextHeight);
    };
    const pulseIsVisible = (pulse: { x: number; y: number; start: number }, config: RuntimeConfig, bounds: DOMRect) => {
      const decay = Math.min(20, Math.max(.12, config.pulseDecay));
      const age = Math.max(0, interactionElapsed - pulse.start);
      if (age >= decay) return false;
      const life = Math.max(0, 1 - age / decay);
      if (life * life < .0125) return false;
      const radius = age * Math.min(3500, Math.max(0, config.pulseSpeed));
      const cellSize = Math.max(bounds.width, bounds.height) / Math.min(200, Math.max(8, config.gridSize));
      const outerWidth = Math.max(4, cellSize * 1.45);
      const farthestX = Math.max(pulse.x, bounds.width - pulse.x);
      const farthestY = Math.max(pulse.y, bounds.height - pulse.y);
      return radius - outerWidth <= Math.hypot(farthestX, farthestY);
    };
    const render = (now: number) => {
      if (!running || !program || !vertexArray) return;
      frameId = requestAnimationFrame(render); resize();
      const config = configRef.current;
      const delta = Math.min(.05, Math.max(0, (now - previousTime) / 1000)); previousTime = now;
      if (introStartedAt === null) introStartedAt = now;
      const introSeconds = Math.max(.2, config.introDuration);
      const introProgress = !config.introEnabled || reducedMotion.matches ? 1 : Math.min(1, Math.max(0, (now - introStartedAt) / 1000 / introSeconds));
      if (!config.paused) {
        interactionElapsed += delta;
        if (!reducedMotion.matches) elapsed += delta;
      }
      const response = Math.min(32, Math.max(1, config.responseSpeed));
      const follow = 1 - Math.exp(-delta * response);
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
      pointer.active += (pointer.targetActive - pointer.active) * follow;
      const holdSpeed = Math.min(3, Math.max(0, config.holdLiftSpeed));
      if (!config.mouseInteraction) { holding = false; holdProgress = 0; }
      else if (!config.paused) {
        const holdDelta = holding ? delta * holdSpeed : -delta * Math.max(.5, holdSpeed * 2.5);
        holdProgress = Math.min(1, Math.max(0, holdProgress + holdDelta));
      }
      const square = hexToRgb(config.squareColor); const background = hexToRgb(config.backgroundColor);
      const start = Math.min(.99, Math.max(0, config.fadeStart));
      const end = Math.min(1, Math.max(start + .01, config.fadeEnd));
      const bounds = canvas.getBoundingClientRect();
      const bufferScale = canvas.width / Math.max(1, bounds.width);
      const inertiaSeconds = Math.min(4, Math.max(0, config.inertiaDuration));
      if (!config.mouseInteraction || inertiaSeconds === 0) inertiaPoints = [];
      else inertiaPoints = inertiaPoints.filter((point) => interactionElapsed - point.start < inertiaSeconds);
      inertiaUniforms.fill(0);
      inertiaPoints.slice(-16).forEach((point, index) => {
        const age = Math.max(0, interactionElapsed - point.start);
        const life = Math.max(0, 1 - age / Math.max(.001, inertiaSeconds));
        const offset = index * 4;
        inertiaUniforms[offset] = point.x * bufferScale;
        inertiaUniforms[offset + 1] = canvas.height - point.y * bufferScale;
        inertiaUniforms[offset + 2] = life * life;
      });
      const pulseDecaySeconds = Math.min(20, Math.max(.12, config.pulseDecay));
      pointerPulses = pointerPulses.filter((pulse) => pulseIsVisible(pulse, config, bounds));
      keyboardPulses = keyboardPulses.filter((pulse) => pulseIsVisible(pulse, config, bounds));
      pulseUniforms.fill(0);
      let pulseIndex = 0;
      const writePulse = (pulse: { x: number; y: number; start: number }) => {
        const age = Math.max(0, interactionElapsed - pulse.start);
        const life = Math.max(0, 1 - age / pulseDecaySeconds);
        const offset = pulseIndex * 4;
        pulseUniforms[offset] = pulse.x * bufferScale;
        pulseUniforms[offset + 1] = canvas.height - pulse.y * bufferScale;
        pulseUniforms[offset + 2] = age * Math.min(3500, Math.max(0, config.pulseSpeed)) * bufferScale;
        pulseUniforms[offset + 3] = life * life;
        pulseIndex += 1;
      };
      pointerPulses.forEach(writePulse);
      keyboardPulses.forEach(writePulse);
      gl.useProgram(program); gl.bindVertexArray(vertexArray);
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      gl.uniform1f(locations.time, elapsed);
      gl.uniform1f(locations.gridSize, Math.min(200, Math.max(8, config.gridSize)));
      gl.uniform1f(locations.squareSize, Math.min(.98, Math.max(.05, config.squareSize)));
      gl.uniform1f(locations.fadeStart, start); gl.uniform1f(locations.fadeEnd, end);
      gl.uniform1f(locations.falloff, Math.min(6, Math.max(.3, config.falloff)));
      gl.uniform1f(locations.minBrightness, Math.min(1, Math.max(0, config.minBrightness)));
      gl.uniform1f(locations.twinkleSpeed, Math.min(4, Math.max(0, config.twinkleSpeed)));
      gl.uniform1f(locations.twinkleStrength, Math.min(1, Math.max(0, config.twinkleStrength)));
      gl.uniform1f(locations.intensity, Math.min(2, Math.max(0, config.intensity)));
      gl.uniform1f(locations.opacity, Math.min(1, Math.max(0, config.opacity)));
      gl.uniform1f(locations.direction, directionToNumber(config.direction));
      gl.uniform2f(locations.pointer, pointer.x * bufferScale, canvas.height - pointer.y * bufferScale);
      gl.uniform1f(locations.pointerActive, config.mouseInteraction ? pointer.active : 0);
      gl.uniform1f(locations.interactionRadius, Math.max(20, config.interactionRadius) * bufferScale);
      gl.uniform1f(locations.interactionStrength, Math.min(3, Math.max(0, config.interactionStrength)));
      gl.uniform1f(locations.brightnessBoost, Math.min(3, Math.max(0, config.brightnessBoost)));
      gl.uniform1f(locations.densityBoost, Math.min(1, Math.max(0, config.densityBoost)));
      gl.uniform4fv(locations.inertia, inertiaUniforms);
      gl.uniform4fv(locations.pulses, pulseUniforms);
      gl.uniform1i(locations.pulseCount, pulseIndex);
      gl.uniform1f(locations.pulseStrength, Math.min(15, Math.max(0, config.pulseStrength)));
      gl.uniform1f(locations.pulseLift, Math.min(90, Math.max(0, config.pulseLift)));
      gl.uniform1f(locations.holdProgress, holdProgress);
      gl.uniform1f(locations.liftActive, pulseIndex > 0 || holdProgress > .001 ? 1 : 0);
      gl.uniform1f(locations.introProgress, introProgress);
      gl.uniform1f(locations.introIntensity, Math.min(2.5, Math.max(0, config.introIntensity)));
      gl.uniform3f(locations.squareColor, square[0], square[1], square[2]);
      gl.uniform3f(locations.backgroundColor, background[0], background[1], background[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const start = () => { if (running || !pageVisible || !onScreen) return; running = true; previousTime = performance.now(); frameId = requestAnimationFrame(render); };
    const stop = () => { running = false; cancelAnimationFrame(frameId); };
    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      pointer.targetX = x;
      pointer.targetY = y;
      pointer.targetActive = 1;
      if (configRef.current.mouseInteraction && configRef.current.inertiaDuration > 0) {
        const spacing = Math.max(10, configRef.current.interactionRadius * .18);
        if (!lastInertiaPoint) {
          inertiaPoints.push({ x, y, start: interactionElapsed });
        } else {
          const distance = Math.hypot(x - lastInertiaPoint.x, y - lastInertiaPoint.y);
          const steps = Math.min(6, Math.max(1, Math.ceil(distance / spacing)));
          for (let step = 1; step <= steps; step += 1) {
            const amount = step / steps;
            inertiaPoints.push({ x: lastInertiaPoint.x + (x - lastInertiaPoint.x) * amount, y: lastInertiaPoint.y + (y - lastInertiaPoint.y) * amount, start: interactionElapsed });
          }
        }
        if (inertiaPoints.length > 16) inertiaPoints.splice(0, inertiaPoints.length - 16);
        lastInertiaPoint = { x, y };
      }
      if (!pointer.initialized) {
        pointer.x = x;
        pointer.y = y;
        pointer.initialized = true;
      }
    };
    const leavePointer = () => { if (!holding) pointer.targetActive = 0; lastInertiaPoint = null; };
    const pushPointerPulse = (x: number, y: number) => {
      pointerPulses.push({ x, y, start: interactionElapsed });
      if (pointerPulses.length > MAX_POINTER_PULSES) pointerPulses.shift();
    };
    const addPulse = (event: PointerEvent) => {
      updatePointer(event);
      if (!configRef.current.mouseInteraction) return;
      pushPointerPulse(pointer.targetX, pointer.targetY);
    };
    const addKeyboardPulse = (event: KeyboardEvent) => {
      const config = configRef.current;
      if (!config.keyboardInteraction || config.paused || !onScreen || event.ctrlKey || event.altKey || event.metaKey) return;
      // The integrated background sits behind Codex's composer, so ordinary typing
      // happens inside editable controls. Listen in capture phase below and keep
      // those keystrokes eligible instead of treating them as settings input.
      const isInputKey = event.key.length === 1 || event.key === "Enter" || event.key === "Backspace" || event.key === "Delete" || event.isComposing || event.key === "Process";
      if (!isInputKey) return;
      const now = performance.now();
      if (now - lastKeyboardPulseAt < 55) return;
      lastKeyboardPulseAt = now;
      const bounds = canvas.getBoundingClientRect();
      keyboardPulses = keyboardPulses.filter((pulse) => pulseIsVisible(pulse, config, bounds));
      if (interactionElapsed < keyboardLockedUntil) return;
      const keyboardLimit = Math.min(MAX_KEYBOARD_PULSE_CAPACITY, Math.max(1, Math.round(config.keyboardPulseLimit)));
      if (keyboardPulses.length >= keyboardLimit) return;
      const marginX = Math.min(40, bounds.width * .08);
      const marginY = Math.min(40, bounds.height * .08);
      const x = marginX + Math.random() * Math.max(1, bounds.width - marginX * 2);
      const y = marginY + Math.random() * Math.max(1, bounds.height - marginY * 2);
      keyboardPulses.push({ x, y, start: interactionElapsed });
      if (keyboardPulses.length >= keyboardLimit) {
        keyboardLockedUntil = interactionElapsed + Math.min(10, Math.max(0, config.keyboardPeakCooldown));
      }
    };
    const beginHold = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!configRef.current.mouseInteraction) return;
      holding = true;
      holdStartedAt = performance.now();
      activePointerId = event.pointerId;
      addPulse(event);
    };
    const finishHold = (event: PointerEvent, releasePulse: boolean) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      const wasLongPress = holding && performance.now() - holdStartedAt >= 320;
      if (releasePulse && wasLongPress) addPulse(event);
      holding = false;
      holdStartedAt = 0;
      activePointerId = null;
      if (event.clientX < 0 || event.clientY < 0 || event.clientX > innerWidth || event.clientY > innerHeight) pointer.targetActive = 0;
    };
    const endHold = (event: PointerEvent) => finishHold(event, true);
    const cancelHold = (event: PointerEvent) => finishHold(event, false);
    const visibility = () => { pageVisible = !document.hidden; if (pageVisible) start(); else stop(); };
    const lost = (event: Event) => { event.preventDefault(); stop(); const message = "WebGL context lost. Waiting for recovery…"; setError(message); onError?.(message); };
    const restored = () => setRendererEpoch((value) => value + 1);
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => { onScreen = entry?.isIntersecting ?? true; if (onScreen) start(); else stop(); }, { threshold: .01 });
    resizeObserver.observe(canvas); intersectionObserver.observe(canvas); document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointermove", updatePointer);
    window.addEventListener("pointerleave", leavePointer);
    window.addEventListener("pointerdown", beginHold);
    window.addEventListener("pointerup", endHold);
    window.addEventListener("pointercancel", cancelHold);
    window.addEventListener("keydown", addKeyboardPulse, true);
    canvas.addEventListener("webglcontextlost", lost); canvas.addEventListener("webglcontextrestored", restored); start();
    return () => {
      stop(); resizeObserver.disconnect(); intersectionObserver.disconnect(); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerleave", leavePointer);
      window.removeEventListener("pointerdown", beginHold);
      window.removeEventListener("pointerup", endHold);
      window.removeEventListener("pointercancel", cancelHold);
      window.removeEventListener("keydown", addKeyboardPulse, true);
      canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored);
      if (program) gl.deleteProgram(program); if (vertexArray) gl.deleteVertexArray(vertexArray);
    };
  }, [rendererEpoch, introKey]);

  return (
    <div className={className} style={{ position: "absolute", inset: 0, overflow: "hidden", width, height, background: backgroundColor, pointerEvents: "none" }}>
      <canvas ref={canvasRef} className="code-codex-particle-canvas" style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }} aria-label="Animated directional field of blinking squares" />
      {children ? <div className="pointer-events-none absolute inset-0">{children}</div> : null}
      {error ? <div className="absolute inset-0 grid place-items-center bg-black/90 p-8 text-center text-xs tracking-[.16em] text-white/55">{error}</div> : null}
    </div>
  );
}

function directionToNumber(direction: BlinkingSquaresDirection) { return direction === "right" ? 0 : direction === "left" ? 1 : direction === "top" ? 2 : 3; }
function hexToRgb(color: string): [number, number, number] {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return [1, 1, 1];
  return [parseInt(match[1]!, 16) / 255, parseInt(match[2]!, 16) / 255, parseInt(match[3]!, 16) / 255];
}
