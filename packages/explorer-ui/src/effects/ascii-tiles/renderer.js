import fragmentShader from './tiles.frag';
import { normalizeOptions, rgb } from './options.mjs';
import { advanceWaves, clearWaves, createWaveGrid, kickWave, packWaves, strokeWave } from './tile-waves.mjs';
import { requestBackgroundFrame, cancelBackgroundFrame } from '../../background-startup-hold';
const vertexShader = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
function glyphAtlas() {
  const atlas = typeof document.createElement==='function'?document.createElement("canvas"):new OffscreenCanvas(480,48);
  atlas.width = 480;
  atlas.height = 48;
  const context = atlas.getContext("2d");
  if (!context) throw new Error("Cannot create the ASCII glyph atlas.");
  context.fillStyle = "black";
  context.fillRect(0, 0, atlas.width, atlas.height);
  context.fillStyle = "white";
  const masks = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 4],
    [0, 4, 0, 4, 0],
    [0, 0, 14, 0, 0],
    [0, 14, 0, 14, 0],
    [4, 4, 31, 4, 4],
    [21, 14, 31, 14, 21],
    [10, 31, 10, 31, 10],
    [25, 26, 4, 11, 19],
    [31, 17, 29, 21, 31]
  ];
  masks.forEach((rows, i) => rows.forEach((row, y) => {
    for (let x = 0; x < 5; x++) if (row & 1 << 4 - x) context.fillRect(i * 48 + 4 + x * 8, 4 + y * 8, 8, 8);
  }));
  return atlas;
}
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Cannot create shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "Shader compilation failed.");
  }
  return shader;
}
export class AsciiTilesRenderer {
  constructor(host,canvas,settings,onError=()=>{}) {
    const latest={current:settings},update={current:null},replay={current:null};
    let initialError=null,initializing=true;
    const setError=message=>{if(message&&initializing)initialError=message; if(!initializing)onError(message??undefined);};
    this.dispose=(()=>{


    const context = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: false, depth: false, stencil: false });
    if (!context) {
      throw new Error("ASCII_WEBGL_UNAVAILABLE: WebGL 2 is required. Enable hardware acceleration and retry.");
    }
    const gl = context;
    let program = null;
    let atlas = null;
    let wavesTexture = null;
    let vao = null;
    let frame = 0;
    let disposed = false;
    let lost = false;
    let visible = !document.hidden;
    let intersecting = true;
    let cssWidth = 1, cssHeight = 1;
    let rect = host.getBoundingClientRect();
    let time = 0, lastTime = 0;
    let pointerX = -1e3, pointerY = -1e3, pointerActive = false;
    let options = normalizeOptions(latest.current);
    let waveGrid = createWaveGrid(1, 1, options.tileDensity, options.tileShear);
    let previousPointer = null;
    let lastWaveInput = 0;
    let uniforms = {};
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Port only the Web entrance. Keep persisted settings and normal motion intact.
    let introProgress = motion.matches ? 1 : 0;
    const introDuration = 2.4;
    const fail = (cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      latest.current.onError?.(message);
    };
    const release = () => {
      if (program) gl.deleteProgram(program);
      if (atlas) gl.deleteTexture(atlas);
      if (wavesTexture) gl.deleteTexture(wavesTexture);
      if (vao) gl.deleteVertexArray(vao);
      program = null;
      atlas = null;
      wavesTexture = null;
      vao = null;
    };
    function requestDraw() {
      if (!frame && !disposed && !lost && visible && intersecting && program) frame = requestBackgroundFrame(host, draw);
    }
    const configure = () => {
      options = normalizeOptions(latest.current);
      if ((!options.cursorInteraction || motion.matches) && waveGrid.active) clearWaves(waveGrid);
      if (!program || lost) return;
      gl.useProgram(program);
      const values = {
        uGlyphSize: options.glyphSize,
        uTileDensity: options.tileDensity,
        uTileShear: options.tileShear,
        uBevelWidth: options.bevelWidth,
        uTileGap: options.tileGap,
        uOutlineWidth: options.outlineWidth,
        uOutlineStrength: options.outlineStrength,
        uBevelSoftness: options.bevelSoftness,
        uRefraction: options.refractionStrength,
        uChromatic: options.chromaticSpread,
        uSpecularExp: options.specularExponent,
        uSpecularStrength: options.specularStrength,
        uRadius: options.cursorRadius,
        uIntensity: options.cursorIntensity,
        uOpacity: options.opacity,
        uWaveHeight: options.waveHeight,
        uIntroStrength: 1
      };
      for (const [name, value] of Object.entries(values)) gl.uniform1f(uniforms[name], value);
      gl.uniform3f(uniforms.uFrequency, options.patternFreqX, options.patternFreqY, options.patternFreqXY);
      for (const [name, color] of [["uGlyphColor", options.glyphColor], ["uRecessColor", options.recessColor], ["uBackgroundColor", options.backgroundColor]]) {
        const [r, g, b] = rgb(color);
        gl.uniform3f(uniforms[name], r, g, b);
      }
      resize();
      lastTime = 0;
      requestDraw();
    };
    function resize() {
      rect = host.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      const limit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      const dpr = Math.min(window.devicePixelRatio || 1, options.dpr, limit / cssWidth, limit / cssHeight);
      const w = Math.max(1, Math.round(cssWidth * dpr)), h = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      if (program) {
        gl.useProgram(program);
        gl.uniform2f(uniforms.uResolution, cssWidth, cssHeight);
        const key = `${cssWidth}:${cssHeight}:${options.tileDensity}:${options.tileShear}`;
        if (waveGrid.layoutKey !== key) {
          const previous = waveGrid;
          waveGrid = createWaveGrid(cssWidth, cssHeight, options.tileDensity, options.tileShear);
          if (previous.active && previous.density === waveGrid.density && previous.shear === waveGrid.shear) {
            for (let y = 0; y < waveGrid.rows; y++) for (let x = 0; x < waveGrid.columns; x++) {
              const px = x + waveGrid.originX - previous.originX, py = y + waveGrid.originY - previous.originY;
              if (px >= 0 && py >= 0 && px < previous.columns && py < previous.rows) {
                const i = y * waveGrid.columns + x, old = py * previous.columns + px;
                waveGrid.heights[i] = previous.heights[old];
                waveGrid.velocities[i] = previous.velocities[old];
              }
            }
            waveGrid.active = true;
            waveGrid.quietFor = previous.quietFor;
            packWaves(waveGrid);
          }
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, wavesTexture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, waveGrid.columns, waveGrid.rows, 0, gl.RGBA, gl.FLOAT, waveGrid.data);
          waveGrid.dirty = false;
        }
        gl.uniform2i(uniforms.uWaveOrigin, waveGrid.originX, waveGrid.originY);
      }
      requestDraw();
    }
    function draw(now) {
      frame = 0;
      if (disposed || lost || !visible || !intersecting || !program) return;
      const animate = !latest.current.paused && options.speed > 0 && !motion.matches;
      const dt = lastTime ? Math.min((now - lastTime) / 1e3, 0.05) : 1 / 60;
      if (introProgress < 1) introProgress = Math.min(1, introProgress + dt / introDuration);
      if (options.cursorInteraction && !motion.matches) advanceWaves(waveGrid, dt, options.waveSpeed, options.cursorRecovery);
      if (animate && lastTime) time += Math.min((now - lastTime) / 1e3, 0.05) * options.speed;
      lastTime = now;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, wavesTexture);
      if (waveGrid.dirty) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, waveGrid.columns, waveGrid.rows, gl.RGBA, gl.FLOAT, waveGrid.data);
        waveGrid.dirty = false;
      }
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uIntroProgress, introProgress);
      if (introProgress < 1 || canvas.dataset.introProgress !== "1.0000") canvas.dataset.introProgress = introProgress.toFixed(4);
      gl.uniform2f(uniforms.uPointer, pointerX, pointerY);
      gl.uniform1f(uniforms.uReducedHover, motion.matches && pointerActive && options.cursorInteraction ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (animate || waveGrid.active || introProgress < 1) requestDraw();
    }
    const initialize = () => {
      let vs = null, fs = null;
      try {
        vs = compile(gl, gl.VERTEX_SHADER, vertexShader);
        fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
        program = gl.createProgram();
        if (!program) throw new Error("Cannot create shader program.");
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader linking failed.");
        uniforms = {};
        for (const name of fragmentShader.matchAll(/\bu[A-Z]\w*/g)) uniforms[name[0]] = gl.getUniformLocation(program, name[0]);
        vao = gl.createVertexArray();
        gl.activeTexture(gl.TEXTURE0);
        atlas = gl.createTexture();
        wavesTexture = gl.createTexture();
        if (!atlas || !wavesTexture || !vao) throw new Error("Cannot allocate WebGL resources.");
        gl.bindTexture(gl.TEXTURE_2D, atlas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glyphAtlas());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.useProgram(program);
        gl.uniform1i(uniforms.uAtlas, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, wavesTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, waveGrid.columns, waveGrid.rows, 0, gl.RGBA, gl.FLOAT, waveGrid.data);
        gl.uniform1i(uniforms.uWaveGrid, 1);
        setError(null);
        configure();
      } catch (cause) {
        release();
        fail(cause);
      } finally {
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
      }
    };
    const stop = () => {
      cancelBackgroundFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const expireOldWaves = () => {
      previousPointer = null;
      if (waveGrid.active && performance.now() / 1e3 - lastWaveInput >= options.cursorRecovery) clearWaves(waveGrid);
    };
    const visibility = () => {
      visible = !document.hidden;
      expireOldWaves();
      stop();
      requestDraw();
    };
    const refreshRect = () => {
      rect = host.getBoundingClientRect();
    };
    const readPointer = (event) => {
      pointerX = event.clientX - rect.left;
      pointerY = cssHeight - (event.clientY - rect.top);
      pointerActive = pointerX >= 0 && pointerX <= cssWidth && pointerY >= 0 && pointerY <= cssHeight;
    };
    const pointerEnter = (event) => {
      readPointer(event);
      previousPointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, time: performance.now() / 1e3 };
      if (options.cursorInteraction) requestDraw();
    };
    const pointer = (event) => {
      if (event.composedPath().some(target => target instanceof Element && target.matches('button,input,select,a,textarea,[contenteditable=true],[role=dialog],[role=menu],[role=slider]'))) {
        previousPointer = null;
        pointerActive = false;
        return;
      }
      readPointer(event);
      const now = performance.now() / 1e3;
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (options.cursorInteraction && !motion.matches && pointerActive && previousPointer) {
        const distance = Math.hypot(x - previousPointer.x, y - previousPointer.y);
        if (distance >= 0.5 && options.cursorIntensity > 0) {
          if (!waveGrid.active) lastTime = 0;
          strokeWave(waveGrid, previousPointer.x, previousPointer.y, x, y, now - previousPointer.time, options.cursorRadius, options.cursorIntensity);
          lastWaveInput = now;
        }
      }
      previousPointer = { x, y, time: now };
      if (options.cursorInteraction) requestDraw();
    };
    const leave = () => {
      pointerActive = false;
      previousPointer = null;
      requestDraw();
    };
    const pointerDown = (event) => {
      if (event.button !== 0 || event.composedPath().some(target => target instanceof Element && target.matches("button,input,select,a,textarea,[contenteditable=true],[role=dialog]"))) return;
      pointerEnter(event);
      if (options.cursorInteraction && !motion.matches && options.clickStrength > 0) {
        if (!waveGrid.active) lastTime = 0;
        kickWave(waveGrid, event.clientX - rect.left, event.clientY - rect.top, -14 * options.clickStrength, options.cursorRadius);
        lastWaveInput = performance.now() / 1e3;
        requestDraw();
      }
    };
    const pointerUp = (event) => {
      if (event.pointerType === "touch") leave();
    };
    const contextLost = (event) => {
      event.preventDefault();
      lost = true;
      stop();
      program = null;
      atlas = null;
      wavesTexture = null;
      vao = null;
      uniforms = {};
      setError("ASCII_CONTEXT_LOST: Waiting for graphics context restoration.");
    };
    const contextRestored = () => {
      lost = false;
      expireOldWaves();
      initialize();
    };
    const motionChanged = () => {
      if (motion.matches) { clearWaves(waveGrid); introProgress = 1; }
      stop();
      requestDraw();
    };
    const observer = new ResizeObserver(() => {
      if (!lost) resize();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      expireOldWaves();
      stop();
      requestDraw();
    });
    initialize();
    if (initialError) { observer.disconnect(); intersection.disconnect(); release(); throw new Error(initialError); }
    observer.observe(host);
    intersection.observe(host);
    update.current = configure;
    replay.current = () => {
      introProgress = motion.matches ? 1 : 0;
      lastTime = 0;
      requestDraw();
    };
    window.addEventListener("pointermove", pointer);
    window.addEventListener("pointerenter", pointerEnter);
    window.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointerleave", leave);
    window.addEventListener("pointercancel", leave);
    window.addEventListener("pointerup", pointerUp);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("scroll", refreshRect, { passive: true, capture: true });
    window.addEventListener("resize", resize);
    motion.addEventListener("change", motionChanged);
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
    return () => {
      disposed = true;
      stop();
      update.current = null;
      replay.current = null;
      observer.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("pointerenter", pointerEnter);
      window.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointercancel", leave);
      window.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("scroll", refreshRect, true);
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", motionChanged);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      release();
    };})();
    initializing=false;
    this.setSettings=next=>{latest.current=next; update.current?.();};
    this.replay=()=>replay.current?.();
    this.ready=Promise.resolve();
  }
}
