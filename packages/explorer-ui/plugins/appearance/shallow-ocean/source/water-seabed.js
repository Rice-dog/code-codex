export function install(root, document, window, matchMedia) {
/* GPU Height-Field Ripple Simulation, Pre-Baked Coral/Seagrass Seabed,
   and Dual-Pass Transparent Water Surface Shader for Ocean Shallows 2. */
(function (root) {
  "use strict";

  function fract(x) { return x - Math.floor(x); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hash2(x, y) {
    return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
  }

  function noise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return mix(mix(a, b, ux), mix(c, d, ux), uy);
  }

  function fbm2(x, y) {
    let v = 0, amp = 0.5;
    for (let i = 0; i < 4; i++) {
      v += amp * noise2(x, y);
      x = x * 2.03 + 13.7;
      y = y * 2.03 + 7.1;
      amp *= 0.5;
    }
    return v;
  }

  // Signed water depth at UV (u in [0..1] left->right, v in [0..1] bottom->top).
  // Top-left beach is at (u -> 0, v -> 1).
  // depth < 0: dry beach sand above mean sea level; depth > 0: water depth in meters.
  function getUvBathymetry(u, v, beachSize = 1.0) {
    if (beachSize <= 0.001) {
      const openUndulation = (fbm2(u * 6.5 + 2.1, v * 6.5 + 4.3) - 0.5) * 0.45;
      return 2.4 + (u * 0.6 + (1.0 - v) * 0.5) * 2.2 + openUndulation;
    }
    const dx = u * 1.15;
    const dy = (1.0 - v) * 1.35;
    const radial = Math.sqrt(dx * dx + dy * dy);
    const curve = 0.045 * Math.sin(u * 9.0 + (1.0 - v) * 6.0) + 0.025 * Math.cos(u * 17.0 - v * 11.0);
    const shoreRadius = 0.34 * Math.pow(clamp(beachSize, 0.0, 2.2), 0.72);
    const shoreDist = radial - shoreRadius + curve;
    if (shoreDist < 0) {
      return shoreDist * 3.8;
    }
    const shelf = Math.pow(shoreDist, 1.18) * 5.2;
    const reefUndulation = (fbm2(u * 6.5 + 2.1, v * 6.5 + 4.3) - 0.5) * 0.45 * smoothstep(0.05, 0.35, shoreDist);
    return shelf + reefUndulation;
  }

  function getSwashState(time) {
    const phase = (time * 0.16) % 1.0;
    const s = Math.sin(phase * Math.PI * 2.0);
    const runup = s > 0 ? Math.pow(s, 0.72) : -Math.pow(-s, 1.35) * 0.65;
    return { phase, runup };
  }

  const BASE_CORAL_HEADS = [
    { u: 0.24, v: 0.52, r: 0.052, type: "brain", hue: 0 },
    { u: 0.31, v: 0.46, r: 0.038, type: "staghorn", hue: 1 },
    { u: 0.18, v: 0.36, r: 0.044, type: "rock", hue: 2 },
    { u: 0.58, v: 0.76, r: 0.058, type: "brain", hue: 1 },
    { u: 0.65, v: 0.71, r: 0.042, type: "table", hue: 0 },
    { u: 0.78, v: 0.58, r: 0.062, type: "rock", hue: 2 },
    { u: 0.83, v: 0.51, r: 0.046, type: "staghorn", hue: 0 },
    { u: 0.44, v: 0.22, r: 0.054, type: "brain", hue: 1 },
    { u: 0.51, v: 0.18, r: 0.039, type: "rock", hue: 2 },
    { u: 0.74, v: 0.26, r: 0.049, type: "table", hue: 0 },
    { u: 0.36, v: 0.61, r: 0.045, type: "staghorn", hue: 0 },
    { u: 0.62, v: 0.38, r: 0.050, type: "brain", hue: 0 },
    { u: 0.86, v: 0.33, r: 0.044, type: "table", hue: 1 },
    { u: 0.40, v: 0.36, r: 0.041, type: "rock", hue: 2 },
    { u: 0.69, v: 0.82, r: 0.046, type: "staghorn", hue: 1 },
    { u: 0.53, v: 0.54, r: 0.048, type: "brain", hue: 1 }
  ];

  const BASE_SEAGRASS_PATCHES = [
    { u: 0.44, v: 0.62, rx: 0.13, ry: 0.09 },
    { u: 0.28, v: 0.42, rx: 0.10, ry: 0.11 },
    { u: 0.52, v: 0.40, rx: 0.14, ry: 0.10 },
    { u: 0.36, v: 0.24, rx: 0.11, ry: 0.09 },
    { u: 0.68, v: 0.46, rx: 0.12, ry: 0.11 },
    { u: 0.84, v: 0.72, rx: 0.11, ry: 0.09 },
    { u: 0.60, v: 0.66, rx: 0.12, ry: 0.09 },
    { u: 0.76, v: 0.30, rx: 0.12, ry: 0.10 }
  ];

  function computeBathymetry(u, v, beachSize = 1.0, undulation = 0.0) {
    if (beachSize <= 0.001) {
      return 2.4 + (u * 0.6 + (1.0 - v) * 0.5) * 2.2 + undulation;
    }
    const dx = u * 1.15;
    const dy = (1.0 - v) * 1.35;
    const radial = Math.sqrt(dx * dx + dy * dy);
    const curve = 0.045 * Math.sin(u * 9.0 + (1.0 - v) * 6.0) + 0.025 * Math.cos(u * 17.0 - v * 11.0);
    const shoreRadius = 0.34 * Math.pow(clamp(beachSize, 0.0, 2.2), 0.72);
    const shoreDist = radial - shoreRadius + curve;
    if (shoreDist < 0) {
      return shoreDist * 3.8;
    }
    const shelf = Math.pow(shoreDist, 1.18) * 5.2;
    return shelf + undulation * smoothstep(0.05, 0.35, shoreDist);
  }

  function bakeSeabedTextures(THREE, options = {}, existing = null) {
    const beachSize = options.beachSize !== undefined ? options.beachSize : 1.0;
    const coralDensity = options.coralDensity !== undefined ? options.coralDensity : 1.0;
    const grassDensity = options.grassDensity !== undefined ? options.grassDensity : 1.0;

    const size = 1024;
    const albedoCanvas = existing?.albedoCanvas || document.createElement("canvas");
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const ctx = albedoCanvas.getContext("2d");

    const dataCanvas = existing?.dataCanvas || document.createElement("canvas");
    dataCanvas.width = size;
    dataCanvas.height = size;
    const dCtx = dataCanvas.getContext("2d");

    const imgData = ctx.createImageData(size, size);
    const dataImg = dCtx.createImageData(size, size);
    const px = imgData.data;
    const dpx = dataImg.data;

    const activeCoralCount = Math.round(clamp(coralDensity * 10, 0, BASE_CORAL_HEADS.length));
    const coralHeads = BASE_CORAL_HEADS.slice(0, activeCoralCount).filter(
      (ch) => getUvBathymetry(ch.u, ch.v, beachSize) > 0.32
    );

    const activeGrassPatchCount = Math.round(clamp(grassDensity * 5 + (grassDensity > 0.01 ? 1 : 0), 0, BASE_SEAGRASS_PATCHES.length));
    const seagrassPatches = BASE_SEAGRASS_PATCHES.slice(0, activeGrassPatchCount);

    // Pre-bake pristine sandy seabed once; reused across real-time parameter changes
    let baseCache = existing?.baseCache;
    if (!baseCache) {
      baseCache = {
        sandPx: new Uint8ClampedArray(size * size * 4),
        baseDpx: new Uint8ClampedArray(size * size * 4),
        undulation: new Float32Array(size * size),
        turf: new Float32Array(size * size)
      };
      for (let y = 0; y < size; y++) {
        const v = 1.0 - y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const idx1D = y * size + x;
          const idx = idx1D * 4;

          const und = (fbm2(u * 6.5 + 2.1, v * 6.5 + 4.3) - 0.5) * 0.45;
          baseCache.undulation[idx1D] = und;

          const diag = u * 0.76 + (1.0 - v) * 0.65;
          const cross = -u * 0.65 + (1.0 - v) * 0.76;
          const warp = fbm2(u * 14.0, v * 14.0) * 0.035;
          const rippleWave = Math.sin((diag + warp) * 210.0) * 0.5 + 0.5;
          const fineRipple = Math.sin((diag * 1.4 - warp) * 420.0 + cross * 40.0) * 0.5 + 0.5;
          const rawRipple = rippleWave * 0.72 + fineRipple * 0.28;

          const grain = (hash2(x * 0.7, y * 0.7) - 0.5) * 14.0 + (noise2(u * 95.0, v * 95.0) - 0.5) * 18.0;
          baseCache.turf[idx1D] = fbm2(u * 65.0, v * 65.0);

          let r = 236 + (rawRipple - 0.4) * 22 + grain;
          let g = 221 + (rawRipple - 0.4) * 19 + grain * 0.9;
          let b = 188 + (rawRipple - 0.4) * 15 + grain * 0.75;

          baseCache.sandPx[idx] = clamp(Math.round(r), 0, 255);
          baseCache.sandPx[idx + 1] = clamp(Math.round(g), 0, 255);
          baseCache.sandPx[idx + 2] = clamp(Math.round(b), 0, 255);
          baseCache.sandPx[idx + 3] = 255;

          baseCache.baseDpx[idx] = Math.round(clamp(und + 0.5, 0, 1) * 255);
          baseCache.baseDpx[idx + 1] = Math.round(clamp(rawRipple, 0, 1) * 255);
          baseCache.baseDpx[idx + 2] = 0;
          baseCache.baseDpx[idx + 3] = 255;
        }
      }
    }

    // 1. Fast restore of pristine sandy seabed (approx 1.5ms)
    px.set(baseCache.sandPx);
    dpx.set(baseCache.baseDpx);

    // 2. Organic Seagrass Turf Undercoat with smooth biological depth falloff (NO hard cutting edges)
    if (grassDensity > 0.01) {
      const gDensity = clamp(grassDensity, 0.0, 2.0);
      for (let p = 0; p < seagrassPatches.length; p++) {
        const sp = seagrassPatches[p];
        const patchScale = 0.82 + 0.22 * Math.min(gDensity, 1.6);
        const rx = sp.rx * patchScale;
        const ry = sp.ry * patchScale;

        const minX = Math.max(0, Math.floor((sp.u - rx * 1.35) * size));
        const maxX = Math.min(size - 1, Math.ceil((sp.u + rx * 1.35) * size));
        const minY = Math.max(0, Math.floor((1.0 - (sp.v + ry * 1.35)) * size));
        const maxY = Math.min(size - 1, Math.ceil((1.0 - (sp.v - ry * 1.35)) * size));

        for (let y = minY; y <= maxY; y++) {
          const v = 1.0 - y / size;
          const dv = (v - sp.v) / ry;
          const dv2 = dv * dv;
          if (dv2 >= 1.45) continue;
          for (let x = minX; x <= maxX; x++) {
            const u = x / size;
            const du = (u - sp.u) / rx;
            const d2 = du * du + dv2;
            if (d2 >= 1.45) continue;

            const idx1D = y * size + x;
            const und = baseCache.undulation[idx1D];
            const depth = computeBathymetry(u, v, beachSize, und);
            // Smooth biological gradient: naturally tapers out between 0.32m and 0.68m
            const depthSuitability = smoothstep(0.32, 0.68, depth);
            if (depthSuitability <= 0.001) continue;

            const radialFalloff = smoothstep(1.35, 0.20, d2);
            const patchGrass = radialFalloff * depthSuitability * Math.min(1.3, gDensity);
            if (patchGrass <= 0.005) continue;

            const idx = idx1D * 4;
            const curMask = dpx[idx + 2] / 255;
            const newMask = Math.max(curMask, patchGrass);
            dpx[idx + 2] = Math.round(newMask * 255);

            const turfNoise = baseCache.turf[idx1D];
            const targetR = 40 + turfNoise * 28;
            const targetG = 98 + turfNoise * 38;
            const targetB = 54 + turfNoise * 22;
            const blend = patchGrass * 0.76;

            px[idx] = Math.round(mix(px[idx], targetR, blend));
            px[idx + 1] = Math.round(mix(px[idx + 1], targetG, blend));
            px[idx + 2] = Math.round(mix(px[idx + 2], targetB, blend));
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    dCtx.putImageData(dataImg, 0, 0);

    // 3. Individual Seagrass Blades with Root AO, Harmonic Wobble & Sunlit Tips (Stochastic feathered distribution)
    if (grassDensity > 0.01) {
      const gDensity = clamp(grassDensity, 0.0, 2.0);
      const bladeCount = Math.round(340 * gDensity);
      for (let p = 0; p < seagrassPatches.length; p++) {
        const sp = seagrassPatches[p];
        const patchScale = 0.82 + 0.22 * Math.min(gDensity, 1.6);
        const rx = sp.rx * patchScale;
        const ry = sp.ry * patchScale;

        for (let i = 0; i < bladeCount; i++) {
          const ang = hash2(p * 71 + i, i * 1.3) * Math.PI * 2;
          const rawRad = Math.sqrt(hash2(i * 2.7, p * 19));
          const boundaryWobble = 1.0 + 0.16 * Math.sin(ang * 3.0 + p * 2.1) + 0.10 * Math.cos(ang * 5.0 - p);
          const rad = rawRad * boundaryWobble;

          const bu = sp.u + Math.cos(ang) * rad * rx;
          const bv = sp.v + Math.sin(ang) * rad * ry;

          const depth = getUvBathymetry(bu, bv, beachSize);
          const depthSuitability = smoothstep(0.32, 0.68, depth);
          const radialFalloff = smoothstep(1.30, 0.30, rad);
          const bladeProbability = depthSuitability * radialFalloff * Math.min(1.0, gDensity * 1.15);

          // Stochastic rejection creates a realistic, naturally feathered edge without boundary alignment
          const diceRoll = hash2(p * 93.1 + i * 4.7, i * 11.3);
          if (diceRoll > bladeProbability) continue;

          const bx = bu * size;
          const by = (1.0 - bv) * size;
          const vigor = 0.5 + 0.5 * bladeProbability;
          const len = (9 + hash2(i, p * 3.7) * 15) * vigor;
          const lean = -0.55 + (hash2(p, i * 4.1) - 0.5) * 0.7;
          const tipX = bx + Math.cos(lean) * len;
          const tipY = by + Math.sin(lean) * len;
          const ctrlX = (bx + tipX) * 0.5 - 3.2;
          const ctrlY = (by + tipY) * 0.5 - 3.2;

          ctx.beginPath();
          ctx.moveTo(bx + 1.8, by + 1.8);
          ctx.quadraticCurveTo(ctrlX + 1.8, ctrlY + 1.8, tipX + 1.8, tipY + 1.8);
          ctx.strokeStyle = "rgba(12, 36, 24, " + (0.24 * vigor) + ")";
          ctx.lineWidth = 2.0 * vigor;
          ctx.stroke();

          const grad = ctx.createLinearGradient(bx, by, tipX, tipY);
          grad.addColorStop(0, "#1d4d30");
          grad.addColorStop(0.55, "#36854b");
          grad.addColorStop(1, "#7ed968");
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5 * vigor;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }
    }

    // 4. Coral Rubble Pebbles
    if (coralHeads.length > 0 && coralDensity > 0.05) {
      const rubbleCount = Math.round(380 * clamp(coralDensity, 0, 2));
      for (let i = 0; i < rubbleCount; i++) {
        const h = coralHeads[i % coralHeads.length];
        const a = hash2(i * 1.9, 9.2) * Math.PI * 2;
        const dist = h.r * (0.85 + hash2(i * 3.1, 4.7) * 1.6);
        const ru = h.u + Math.cos(a) * dist;
        const rv = h.v + Math.sin(a) * dist;
        if (ru < 0.02 || ru > 0.98 || rv < 0.02 || rv > 0.98) continue;
        if (getUvBathymetry(ru, rv, beachSize) < 0.28) continue;
        const pxX = ru * size;
        const pxY = (1.0 - rv) * size;
        const pr = 1.8 + hash2(i, 15.3) * 4.2;

        ctx.fillStyle = "rgba(20, 24, 30, 0.35)";
        ctx.beginPath();
        ctx.ellipse(pxX + 1.8, pxY + 1.8, pr * 1.1, pr * 0.85, a, 0, Math.PI * 2);
        ctx.fill();

        const shade = 175 + Math.floor(hash2(i * 7.1, 2.3) * 55);
        ctx.fillStyle = `rgb(${shade}, ${shade - 12}, ${shade - 26})`;
        ctx.beginPath();
        ctx.ellipse(pxX, pxY, pr, pr * 0.78, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Coral Heads & Reef Rocks with Contact Shadows
    const radScale = 0.82 + 0.18 * clamp(coralDensity, 0.3, 1.8);
    coralHeads.forEach((ch, idx) => {
      const cx = ch.u * size;
      const cy = (1.0 - ch.v) * size;
      const rad = ch.r * radScale * size;

      const shGrad = ctx.createRadialGradient(cx + rad * 0.22, cy + rad * 0.24, rad * 0.2, cx + rad * 0.18, cy + rad * 0.2, rad * 1.42);
      shGrad.addColorStop(0, "rgba(8, 20, 28, 0.68)");
      shGrad.addColorStop(0.65, "rgba(8, 22, 32, 0.35)");
      shGrad.addColorStop(1, "rgba(8, 22, 32, 0.0)");
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.arc(cx + rad * 0.18, cy + rad * 0.2, rad * 1.42, 0, Math.PI * 2);
      ctx.fill();

      const lobes = 9;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const wobble = 1.0 + 0.14 * Math.sin(a * lobes + idx * 2.1) + 0.08 * Math.cos(a * 5 - idx);
        const r = rad * wobble;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const baseGrad = ctx.createRadialGradient(cx - rad * 0.28, cy - rad * 0.28, rad * 0.1, cx, cy, rad * 1.15);
      if (ch.type === "brain") {
        baseGrad.addColorStop(0, ch.hue === 0 ? "#f2b880" : "#d89ce2");
        baseGrad.addColorStop(0.65, ch.hue === 0 ? "#b86b35" : "#88499c");
        baseGrad.addColorStop(1, "#3d241c");
      } else if (ch.type === "staghorn" || ch.type === "table") {
        baseGrad.addColorStop(0, ch.hue === 0 ? "#ff9b85" : "#7de8d2");
        baseGrad.addColorStop(0.7, ch.hue === 0 ? "#c44b4f" : "#2e8b7d");
        baseGrad.addColorStop(1, "#331c24");
      } else {
        baseGrad.addColorStop(0, "#c8bca8");
        baseGrad.addColorStop(0.6, "#7d7266");
        baseGrad.addColorStop(1, "#38322e");
      }
      ctx.fillStyle = baseGrad;
      ctx.fill();

      ctx.clip();
      if (ch.type === "brain") {
        ctx.strokeStyle = "rgba(45, 20, 14, 0.48)";
        ctx.lineWidth = 2.2;
        for (let ring = 6; ring < rad * 1.1; ring += 6.5) {
          ctx.beginPath();
          for (let a = 0; a < Math.PI * 2; a += 0.15) {
            const mr = ring + Math.sin(a * 8 + ring * 0.4) * 2.6;
            const x = cx + Math.cos(a) * mr;
            const y = cy + Math.sin(a) * mr;
            if (a === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      } else if (ch.type === "staghorn" || ch.type === "table") {
        for (let b = 0; b < 28; b++) {
          const ba = (b / 28) * Math.PI * 2 + (idx % 3) * 0.2;
          const br = rad * (0.45 + hash2(b, idx) * 0.55);
          ctx.strokeStyle = b % 2 === 0 ? "rgba(255, 238, 220, 0.65)" : "rgba(60, 20, 30, 0.42)";
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br);
          ctx.stroke();
        }
      } else {
        for (let k = 0; k < 18; k++) {
          const ka = hash2(k, idx * 9) * Math.PI * 2;
          const kr = hash2(idx, k * 3) * rad * 0.75;
          ctx.fillStyle = k % 3 === 0 ? "rgba(198, 102, 136, 0.32)" : "rgba(35, 30, 26, 0.28)";
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ka) * kr, cy + Math.sin(ka) * kr, 4 + (k % 5) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });

    // 5. Starfish (Protoreaster nodosus)
    const starfishList = [
      { u: 0.22, v: 0.68, s: 12, rot: 0.4, col: "#f25c3b" },
      { u: 0.39, v: 0.56, s: 10.5, rot: 1.9, col: "#ff7847" },
      { u: 0.15, v: 0.46, s: 11, rot: 2.7, col: "#e84a38" },
      { u: 0.54, v: 0.62, s: 11.5, rot: 0.9, col: "#f56a3f" },
      { u: 0.34, v: 0.33, s: 10, rot: 3.8, col: "#ff854d" },
      { u: 0.68, v: 0.34, s: 12, rot: 1.2, col: "#eb5536" }
    ];

    starfishList.forEach((sf) => {
      if (getUvBathymetry(sf.u, sf.v, beachSize) < 0.08) return;
      const sx = sf.u * size;
      const sy = (1.0 - sf.v) * size;
      for (let pass = 0; pass < 2; pass++) {
        const ox = pass === 0 ? 2.2 : 0;
        const oy = pass === 0 ? 2.4 : 0;
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const a = (i / 50) * Math.PI * 2 + sf.rot;
          const arm = Math.pow(Math.cos(a * 2.5), 2);
          const r = sf.s * (0.34 + 0.66 * arm);
          const x = sx + ox + Math.cos(a) * r;
          const y = sy + oy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        if (pass === 0) {
          ctx.fillStyle = "rgba(15, 22, 28, 0.42)";
          ctx.fill();
        } else {
          ctx.fillStyle = sf.col;
          ctx.fill();
          ctx.fillStyle = "#4a1c17";
          for (let armIdx = 0; armIdx < 5; armIdx++) {
            const aa = sf.rot + (armIdx * Math.PI * 2) / 5;
            ctx.beginPath();
            ctx.arc(sx + Math.cos(aa) * sf.s * 0.45, sy + Math.sin(aa) * sf.s * 0.45, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });

    // 6. Sea Shells
    const shells = [
      { u: 0.14, v: 0.64, s: 6.5, rot: 0.8, type: "scallop" },
      { u: 0.25, v: 0.77, s: 7.0, rot: 2.1, type: "conch" },
      { u: 0.31, v: 0.83, s: 5.8, rot: -0.6, type: "scallop" },
      { u: 0.09, v: 0.56, s: 6.2, rot: 1.4, type: "conch" },
      { u: 0.42, v: 0.72, s: 6.0, rot: 2.9, type: "scallop" },
      { u: 0.21, v: 0.29, s: 6.8, rot: 0.3, type: "conch" },
      { u: 0.59, v: 0.51, s: 6.0, rot: 1.7, type: "scallop" }
    ];

    shells.forEach((sh) => {
      const x = sh.u * size;
      const y = (1.0 - sh.v) * size;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = "rgba(18, 22, 26, 0.38)";
      ctx.beginPath();
      ctx.ellipse(1.5, 1.8, sh.s, sh.s * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = sh.type === "scallop" ? "#fff1df" : "#f7d4bc";
      ctx.beginPath();
      ctx.ellipse(0, 0, sh.s, sh.s * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c98a6b";
      ctx.lineWidth = 1.1;
      for (let r = -2; r <= 2; r++) {
        ctx.beginPath();
        ctx.moveTo(-sh.s * 0.7, 0);
        ctx.lineTo(sh.s * 0.8, r * 1.8);
        ctx.stroke();
      }
      ctx.restore();
    });

    // 7. Sea Urchins (Diadema)
    const urchins = [
      { u: 0.27, v: 0.50, r: 9.5 },
      { u: 0.29, v: 0.48, r: 8.0 },
      { u: 0.21, v: 0.38, r: 9.0 },
      { u: 0.61, v: 0.73, r: 10.0 },
      { u: 0.75, v: 0.55, r: 9.5 },
      { u: 0.47, v: 0.21, r: 8.8 },
      { u: 0.80, v: 0.49, r: 8.5 }
    ];

    urchins.slice(0, Math.round(7 * clamp(coralDensity, 0, 1.5))).forEach((ur, idx) => {
      const ux = ur.u * size;
      const uy = (1.0 - ur.v) * size;
      ctx.fillStyle = "rgba(8, 12, 18, 0.45)";
      ctx.beginPath();
      ctx.arc(ux + 1.8, uy + 1.8, ur.r * 0.75, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#191124";
      ctx.lineWidth = 1.15;
      for (let s = 0; s < 26; s++) {
        const sa = (s / 26) * Math.PI * 2 + idx * 0.3;
        const sl = ur.r * (0.78 + (s % 3) * 0.14);
        ctx.beginPath();
        ctx.moveTo(ux, uy);
        ctx.lineTo(ux + Math.cos(sa) * sl, uy + Math.sin(sa) * sl);
        ctx.stroke();
      }
      ctx.fillStyle = "#120b1c";
      ctx.beginPath();
      ctx.arc(ux, uy, ur.r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4d7cff";
      ctx.beginPath();
      ctx.arc(ux - 0.5, uy - 0.5, ur.r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    });

    let albedoTex = existing?.albedoTex;
    if (!albedoTex) {
      albedoTex = new THREE.CanvasTexture(albedoCanvas);
      albedoTex.wrapS = THREE.ClampToEdgeWrapping;
      albedoTex.wrapT = THREE.ClampToEdgeWrapping;
      albedoTex.minFilter = THREE.LinearMipMapLinearFilter;
      albedoTex.magFilter = THREE.LinearFilter;
    }
    albedoTex.needsUpdate = true;

    let dataTex = existing?.dataTex;
    if (!dataTex) {
      dataTex = new THREE.CanvasTexture(dataCanvas);
      dataTex.wrapS = THREE.ClampToEdgeWrapping;
      dataTex.wrapT = THREE.ClampToEdgeWrapping;
      dataTex.minFilter = THREE.LinearFilter;
      dataTex.magFilter = THREE.LinearFilter;
    }
    dataTex.needsUpdate = true;

    return {
      albedoTex,
      dataTex,
      albedoCanvas,
      dataCanvas,
      baseCache,
      coralHeads: coralHeads.length ? coralHeads : BASE_CORAL_HEADS.slice(0, 6)
    };
  }

  function createWaterAndSeabedSystem({ THREE, renderer, scene }) {
    let aspect = window.innerWidth / window.innerHeight;
    let worldH = 20.0;
    let worldW = 20.0 * aspect;

    function toWorld(u, v, z = 0) {
      return {
        x: (u - 0.5) * worldW,
        y: (v - 0.5) * worldH,
        z
      };
    }

    function worldToUv(x, y) {
      return {
        u: x / worldW + 0.5,
        v: y / worldH + 0.5
      };
    }

    let currentSettings = {
      beachSize: 1.0,
      coralDensity: 1.0,
      grassDensity: 1.0
    };

    const baked = bakeSeabedTextures(THREE, currentSettings);

    function rebuildSeabed(newOpts) {
      currentSettings = { ...currentSettings, ...newOpts };
      const res = bakeSeabedTextures(THREE, currentSettings, baked);
      baked.coralHeads = res.coralHeads;
      baked.baseCache = res.baseCache;
      return baked.coralHeads;
    }

    // GPU Height-Field Ripple Simulation (256x256 with Absorbing Boundary)
    const SIM_RES = 256;
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const floatType = isWebGL2
      ? THREE.HalfFloatType
      : (renderer.extensions.get("OES_texture_half_float") ? THREE.HalfFloatType : THREE.UnsignedByteType);

    function createSimTarget() {
      return new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
        type: floatType,
        depthBuffer: false,
        stencilBuffer: false
      });
    }

    let simRT0 = createSimTarget();
    let simRT1 = createSimTarget();

    const MAX_IMPULSES = 16;
    const impulseQueue = [];
    const impulseUniformArray = Array.from({ length: MAX_IMPULSES }, () => new THREE.Vector4(0, 0, 0, 0));

    function addWaterImpulseUv(u, v, radiusUv = 0.022, strength = -0.35, rippleStrengthMult = 1.0) {
      if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return;
      if (impulseQueue.length < MAX_IMPULSES) {
        impulseQueue.push({
          u,
          v,
          r: clamp(radiusUv, 0.006, 0.08),
          s: clamp(strength * rippleStrengthMult, -1.35, 1.35)
        });
      }
    }

    function addWaterImpulseWorld(x, y, radiusWorld = 0.72, strength = -0.38, rippleStrengthMult = 1.0) {
      const { u, v } = worldToUv(x, y);
      const rUv = radiusWorld / Math.max(worldW, worldH);
      addWaterImpulseUv(u, v, rUv, strength, rippleStrengthMult);
    }

    const simScene = new THREE.Scene();
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPrevState: { value: null },
        uSeabedData: { value: baked.dataTex },
        uTexel: { value: new THREE.Vector2(1.0 / SIM_RES, 1.0 / SIM_RES) },
        uImpulses: { value: impulseUniformArray },
        uImpulseCount: { value: 0 },
        uWhirlpool: { value: new THREE.Vector4(0.55, 0.45, 0.0, 0.0) },
        uDamping: { value: 0.986 },
        uBeachSize: { value: currentSettings.beachSize }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uPrevState;
        uniform sampler2D uSeabedData;
        uniform vec2 uTexel;
        uniform vec4 uImpulses[${MAX_IMPULSES}];
        uniform int uImpulseCount;
        uniform vec4 uWhirlpool;
        uniform float uDamping;
        uniform float uBeachSize;

        float computeBathymetry(vec2 uv, float beachSize, float undulation) {
          if (beachSize <= 0.001) {
            return 2.4 + (uv.x * 0.6 + (1.0 - uv.y) * 0.5) * 2.2 + undulation;
          }
          float dx = uv.x * 1.15;
          float dy = (1.0 - uv.y) * 1.35;
          float radial = sqrt(dx * dx + dy * dy);
          float curve = 0.045 * sin(uv.x * 9.0 + (1.0 - uv.y) * 6.0) + 0.025 * cos(uv.x * 17.0 - uv.y * 11.0);
          float shoreRadius = 0.34 * pow(max(0.0001, clamp(beachSize, 0.0, 2.2)), 0.72);
          float shoreDist = radial - shoreRadius + curve;
          if (shoreDist < 0.0) {
            return shoreDist * 3.8;
          }
          float shelf = pow(shoreDist, 1.18) * 5.2;
          return shelf + undulation * smoothstep(0.05, 0.35, shoreDist);
        }

        void main() {
          vec4 cur = texture2D(uPrevState, vUv);
          float h = cur.r;
          float v = cur.g;
          float foam = cur.b;

          float n = texture2D(uPrevState, vUv + vec2(0.0, uTexel.y)).r;
          float s = texture2D(uPrevState, vUv - vec2(0.0, uTexel.y)).r;
          float e = texture2D(uPrevState, vUv + vec2(uTexel.x, 0.0)).r;
          float w = texture2D(uPrevState, vUv - vec2(uTexel.x, 0.0)).r;
          float ne = texture2D(uPrevState, vUv + vec2(uTexel.x, uTexel.y)).r;
          float nw = texture2D(uPrevState, vUv + vec2(-uTexel.x, uTexel.y)).r;
          float se = texture2D(uPrevState, vUv + vec2(uTexel.x, -uTexel.y)).r;
          float sw = texture2D(uPrevState, vUv + vec2(-uTexel.x, -uTexel.y)).r;

          float avg = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05;
          float laplacian = avg - h;

          v += laplacian * 0.42 - h * 0.0065;

          for (int i = 0; i < ${MAX_IMPULSES}; i++) {
            if (i >= uImpulseCount) break;
            vec4 imp = uImpulses[i];
            vec2 d = vUv - imp.xy;
            float dist2 = dot(d, d);
            float r2 = max(imp.z * imp.z, 0.00002);
            if (dist2 < r2 * 5.0) {
              float radial = sqrt(dist2 / r2);
              float waveProfile = (1.0 - radial * radial * 0.85) * exp(-radial * radial * 0.9);
              v += imp.w * waveProfile;
              foam = min(1.5, foam + abs(imp.w) * exp(-radial * radial * 1.1) * 0.65);
            }
          }

          if (uWhirlpool.z > 0.005) {
            vec2 vd = vUv - uWhirlpool.xy;
            float vr = length(vd);
            float maxR = mix(0.05, 0.22, uWhirlpool.z);
            if (vr < maxR) {
              float va = atan(vd.y, vd.x);
              float spiral = sin(va * 3.0 - vr * 52.0 + uWhirlpool.w * 7.5);
              float env = smoothstep(maxR, 0.012, vr) * smoothstep(0.003, 0.03, vr);
              v += spiral * env * 0.018 * uWhirlpool.z;
              foam = min(0.85, foam + env * 0.012 * uWhirlpool.z);
            }
          }

          float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float edgeSponge = smoothstep(0.0, 0.075, edgeDist);
          float edgeDamp = mix(0.76, uDamping, edgeSponge);

          float undulation = texture2D(uSeabedData, vUv).r - 0.5;
          float depth = computeBathymetry(vUv, uBeachSize, undulation);
          float beachSponge = smoothstep(-0.18, 0.12, depth);

          v *= edgeDamp * beachSponge;
          h = (h + v) * mix(0.84, 0.996, edgeSponge) * beachSponge;
          h = clamp(h, -1.5, 1.5);

          foam = max(0.0, foam * 0.968 + abs(laplacian) * 0.28);

          gl_FragColor = vec4(h, v, foam, 1.0);
        }
      `
    });

    const simQuad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), simMaterial);
    simScene.add(simQuad);

    function stepWaterSimulation(time, isWhirlpool, whirlpoolUv, calmFactor) {
      const count = Math.min(impulseQueue.length, MAX_IMPULSES);
      for (let i = 0; i < count; i++) {
        const imp = impulseQueue[i];
        impulseUniformArray[i].set(imp.u, imp.v, imp.r, imp.s);
      }
      impulseQueue.length = 0;

      const wZ = typeof isWhirlpool === 'number' ? isWhirlpool : (isWhirlpool ? 1.0 : 0.0);
      simMaterial.uniforms.uPrevState.value = simRT0.texture;
      simMaterial.uniforms.uImpulseCount.value = count;
      simMaterial.uniforms.uWhirlpool.value.set(
        whirlpoolUv.u,
        whirlpoolUv.v,
        wZ,
        time
      );
      simMaterial.uniforms.uDamping.value = calmFactor > 0.01 ? 0.92 : 0.986;
      simMaterial.uniforms.uBeachSize.value = currentSettings.beachSize;

      renderer.setRenderTarget(simRT1);
      renderer.render(simScene, simCamera);
      renderer.setRenderTarget(null);

      const tmp = simRT0;
      simRT0 = simRT1;
      simRT1 = tmp;
    }

    // Dual-Pass Seabed & Transparent Water Surface Shaders in XY Plane (Z = 0)
    const MAX_SHADOW_CASTERS = 64;
    const creatureShadowData = Array.from({ length: MAX_SHADOW_CASTERS }, () => new THREE.Vector4(0, 0, -100, 0));

    const oceanGeometry = new THREE.PlaneBufferGeometry(1, 1, 1, 1);

    const sharedOceanHelpersGLSL = `
      vec2 hash22(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      vec2 voronoi(vec2 x, float t) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float m1 = 8.0;
        float m2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            o = 0.5 + 0.42 * sin(t * 1.15 + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < m1) {
              m2 = m1;
              m1 = d;
            } else if (d < m2) {
              m2 = d;
            }
          }
        }
        return vec2(sqrt(m1), sqrt(m2) - sqrt(m1));
      }

      float computeCaustics(vec2 p, float t) {
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        vec2 p1 = p * 2.15 + vec2(t * 0.18, -t * 0.14);
        vec2 p2 = (rot * p) * 2.65 + vec2(-t * 0.15, t * 0.21);
        vec2 v1 = voronoi(p1, t);
        vec2 v2 = voronoi(p2, t);
        float c1 = smoothstep(0.18, 0.0, v1.y);
        float c2 = smoothstep(0.19, 0.0, v2.y);
        return pow(c1 * 0.62 + c2 * 0.58, 1.35);
      }

      float computeLacyFoam(vec2 p, float density, float t) {
        if (density <= 0.005) return 0.0;
        vec2 vBig = voronoi(p * 4.2 + vec2(t * 0.08), t);
        vec2 vSmall = voronoi(p * 9.5 - vec2(t * 0.11), t);
        float webBig = smoothstep(0.16 * density, 0.0, vBig.y);
        float webSmall = smoothstep(0.22 * density, 0.0, vSmall.y);
        float solidFill = smoothstep(0.65, 1.15, density);
        return clamp(max(webBig * 0.9, webSmall * 0.65 * density) + solidFill * 0.75, 0.0, 1.0);
      }

      float computePalmShadow(vec2 uv, float t, vec2 worldSize, float beachSize) {
        if (beachSize <= 0.02) return 0.0;
        float scale = clamp(0.65 + 0.35 * beachSize, 0.4, 1.35);
        vec2 base = vec2(-0.02, 0.96);
        vec2 crown = base + (vec2(0.145, -0.145) * scale) + vec2(sin(t * 1.1) * 0.004, cos(t * 0.85) * 0.004);

        float shadow = 0.0;
        vec2 pa = uv - base;
        vec2 ba = crown - base;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        vec2 archOffset = vec2(-ba.y, ba.x) * (sin(h * 3.14159) * 0.14);
        vec2 trunkPt = base + ba * h + archOffset;
        float trunkWidth = mix(0.018, 0.009, h) * (0.94 + 0.06 * sin(h * 45.0)) * scale;
        float dTrunk = length(uv - trunkPt);
        shadow = max(shadow, smoothstep(trunkWidth, trunkWidth * 0.35, dTrunk));

        vec2 rel = uv - crown;
        rel.x *= worldSize.x / max(worldSize.y, 1.0);
        float r = length(rel);
        if (r < 0.28 * scale) {
          float ang = atan(rel.y, rel.x);
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float baseAng = -1.35 + fi * 0.74 + sin(t * 1.25 + fi * 1.7) * 0.065;
            float dAng = atan(sin(ang - baseAng - r * 1.35), cos(ang - baseAng - r * 1.35));
            float frondLen = (0.165 + 0.035 * sin(fi * 2.3)) * scale;
            float along = r / frondLen;
            if (along < 1.05 && abs(dAng) < 0.42) {
              float spineDist = abs(dAng) * r;
              float stem = smoothstep(0.0045, 0.001, spineDist) * smoothstep(1.0, 0.82, along);
              float env = sin(clamp(along, 0.0, 1.0) * 3.14159) * 0.036 * scale;
              float leafletWave = sin(along * 52.0 - abs(dAng) * 14.0 + sin(t * 2.3 + fi) * 0.8);
              float leaflet = smoothstep(env, env * 0.25, spineDist) * smoothstep(-0.15, 0.45, leafletWave);
              shadow = max(shadow, max(stem, leaflet * 0.88));
            }
          }
        }
        return clamp(shadow, 0.0, 1.0);
      }

      float computeRecoveryField(vec2 uv) {
        float a = length((uv - vec2(1.3, 0.5)) * vec2(0.8, 0.7));
        float b = length((uv - vec2(0.76, 1.35)) * vec2(0.8, 0.7));
        float c = length((uv - vec2(0.72, -0.35)) * vec2(0.8, 0.7));
        return -log(exp(-a * 12.0) + exp(-b * 12.0) + exp(-c * 12.0)) / 12.0
               + 0.012 * sin(uv.x * 21.0 + uv.y * 13.0)
               + 0.008 * sin(uv.y * 31.0 - uv.x * 17.0);
      }

      float computeBathymetry(vec2 uv, float beachSize, float undulation) {
        if (beachSize <= 0.001) {
          return 2.4 + (uv.x * 0.6 + (1.0 - uv.y) * 0.5) * 2.2 + undulation;
        }
        float dx = uv.x * 1.15;
        float dy = (1.0 - uv.y) * 1.35;
        float radial = sqrt(dx * dx + dy * dy);
        float curve = 0.045 * sin(uv.x * 9.0 + (1.0 - uv.y) * 6.0) + 0.025 * cos(uv.x * 17.0 - uv.y * 11.0);
        float shoreRadius = 0.34 * pow(max(0.0001, clamp(beachSize, 0.0, 2.2)), 0.72);
        float shoreDist = radial - shoreRadius + curve;
        if (shoreDist < 0.0) {
          return shoreDist * 3.8;
        }
        float shelf = pow(shoreDist, 1.18) * 5.2;
        return shelf + undulation * smoothstep(0.05, 0.35, shoreDist);
      }
    `;

    const oceanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSwellTime: { value: 0 },
        uWorldSize: { value: new THREE.Vector2(worldW, worldH) },
        uHeightMap: { value: simRT0.texture },
        uSeabedAlbedo: { value: baked.albedoTex },
        uSeabedData: { value: baked.dataTex },
        uTexel: { value: new THREE.Vector2(1.0 / SIM_RES, 1.0 / SIM_RES) },
        uSwashRunup: { value: 0.0 },
        uWetReach: { value: 0.12 },
        uSwellScale: { value: 1.0 },
        uWaterClarity: { value: 0.90 },
        uCausticsIntensity: { value: 1.0 },
        uRefractionScale: { value: 1.0 },
        uShadowIntensity: { value: 0.65 },
        uBeachSize: { value: 1.0 },
        uWhirlpool: { value: new THREE.Vector4(0.55, 0.45, 0.0, 0.0) },
        uCreatureShadows: { value: creatureShadowData },
        uCreatureCount: { value: 0 },
        uDry: { value: 0.0 },
        uRecoveryFront: { value: 0.0 },
        uRecoveryReach: { value: 1.3 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;
        uniform vec2 uWorldSize;
        void main() {
          vUv = uv;
          vec3 wp = vec3(position.x * uWorldSize.x, position.y * uWorldSize.y, 0.0);
          vHorizontalXZ = vec2(wp.x, -wp.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;

        uniform float uTime;
        uniform float uSwellTime;
        uniform vec2 uWorldSize;
        uniform sampler2D uHeightMap;
        uniform sampler2D uSeabedAlbedo;
        uniform sampler2D uSeabedData;
        uniform vec2 uTexel;
        uniform float uSwashRunup;
        uniform float uWetReach;
        uniform float uSwellScale;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;
        uniform float uRefractionScale;
        uniform float uShadowIntensity;
        uniform float uBeachSize;
        uniform vec4 uWhirlpool;
        uniform vec4 uCreatureShadows[${MAX_SHADOW_CASTERS}];
        uniform int uCreatureCount;
        uniform float uDry;
        uniform float uRecoveryFront;
        uniform float uRecoveryReach;

        ${sharedOceanHelpersGLSL}

        void main() {
          vec4 bedData = texture2D(uSeabedData, vUv);
          float undulation = bedData.r - 0.5;
          float depth = computeBathymetry(vUv, uBeachSize, undulation);
          float sandRipple = bedData.g;
          float grassMask = bedData.b;

          vec2 swellDir1 = normalize(vec2(-0.74, 0.67));
          vec2 swellDir2 = normalize(vec2(-0.58, 0.81));
          float distAlong1 = dot(vHorizontalXZ, swellDir1);
          float distAlong2 = dot(vHorizontalXZ, swellDir2);

          float shoal = smoothstep(-0.2, 2.5, depth);
          float swellPhase1 = distAlong1 * mix(1.05, 0.62, shoal) - uSwellTime * 2.15;
          float swellPhase2 = distAlong2 * 0.85 - uSwellTime * 1.65 + 1.7;

          float w1 = sin(swellPhase1) + 0.28 * (1.0 - shoal) * sin(swellPhase1 * 2.0);
          float w2 = sin(swellPhase2) * 0.55;
          float swellHeight = (w1 * 0.09 + w2 * 0.05) * uSwellScale * smoothstep(-0.15, 0.35, depth);

          float hL = texture2D(uHeightMap, vUv - vec2(uTexel.x, 0.0)).r;
          float hR = texture2D(uHeightMap, vUv + vec2(uTexel.x, 0.0)).r;
          float hD = texture2D(uHeightMap, vUv - vec2(0.0, uTexel.y)).r;
          float hU = texture2D(uHeightMap, vUv + vec2(0.0, uTexel.y)).r;
          vec2 rippleGrad = vec2(hR - hL, hU - hD) * 2.4;

          vec2 swellGrad = (swellDir1 * cos(swellPhase1) * 0.14 + swellDir2 * cos(swellPhase2) * 0.08) * uSwellScale;
          vec2 microUv = vHorizontalXZ * 2.8;
          vec2 microGrad = vec2(
            cos(microUv.x * 3.1 + uTime * 3.4 + microUv.y * 1.7),
            sin(microUv.y * 3.5 - uTime * 2.9 + microUv.x * 1.9)
          ) * 0.032;

          vec2 vortexGrad = vec2(0.0);
          if (uWhirlpool.z > 0.005) {
            vec2 vd = vUv - uWhirlpool.xy;
            vd.x *= uWorldSize.x / max(uWorldSize.y, 1.0);
            float vr = length(vd);
            float maxR = mix(0.06, 0.24, uWhirlpool.z);
            if (vr < maxR) {
              float rNorm = vr / maxR;
              float funnel = exp(-rNorm * rNorm * 4.6) * uWhirlpool.z;
              float angle = atan(vd.y, vd.x) + uTime * 5.2 - vr * 28.0;
              vortexGrad = (normalize(vd + 0.0001) * funnel * 1.5 + vec2(-vd.y, vd.x) * sin(angle * 3.0) * 1.8) * uWhirlpool.z;
            }
          }

          float shoreNoise = (sin(vUv.x * 28.0 + vUv.y * 23.0) * 0.018 + cos(vUv.x * 55.0 - vUv.y * 41.0) * 0.009);
          float swashShift = uSwashRunup * 0.24 + shoreNoise;
          float effectiveDepth = depth + swashShift + swellHeight * 0.8;

          // Meteor event seabed drain & 3-front offshore water recovery
          float recDist = computeRecoveryField(vUv);
          float frontPos = (1.0 - uRecoveryFront) * uRecoveryReach;
          float floodMask = uDry > 0.001
            ? mix(1.0, smoothstep(frontPos + 0.035, frontPos - 0.025, recDist), clamp(uDry * 1.35, 0.0, 1.0))
            : 1.0;

          float maxWetDepth = depth + uWetReach * 0.27 + shoreNoise;
          float wetness = smoothstep(0.04, -0.14, maxWetDepth) * smoothstep(-0.36, -0.02, depth);
          wetness = max(wetness, smoothstep(-0.03, 0.05, effectiveDepth));

          float waterMask = smoothstep(-0.015, 0.035, effectiveDepth) * floodMask;

          vec2 totalGrad = (rippleGrad + swellGrad + microGrad + vortexGrad) * waterMask;
          vec3 normal = normalize(vec3(-totalGrad.x, 1.0, totalGrad.y));

          vec2 refractOffset = normal.xz * clamp(effectiveDepth * 0.028, 0.0, 0.048) * uRefractionScale * waterMask;
          vec2 swayOffset = vec2(
            sin(vHorizontalXZ.x * 1.8 + uTime * 2.2),
            cos(vHorizontalXZ.y * 1.8 + uTime * 1.9)
          ) * 0.0022 * grassMask * waterMask;

          vec2 bedUv = clamp(vUv + refractOffset + swayOffset, 0.001, 0.999);
          vec3 sandColor = texture2D(uSeabedAlbedo, bedUv).rgb;

          // Meteor impact crater on seabed when uDry > 0
          if (uDry > 0.005) {
            vec2 cp = (vUv - vec2(0.55, 0.50)) * vec2(uWorldSize.x / uWorldSize.y, 1.0);
            float cr = length(cp);
            float rim = exp(-pow((cr - 0.28) / 0.055, 2.0));
            float pit = smoothstep(0.30, 0.02, cr);
            float strata = 0.5 + 0.5 * sin(cr * 95.0 + sin(atan(cp.y, cp.x) * 7.0) * 2.0);
            vec3 craterRock = mix(vec3(0.18, 0.15, 0.13), vec3(0.46, 0.39, 0.31), strata);
            sandColor = mix(sandColor, craterRock, clamp((pit * 0.88 + rim * 0.55) * uDry, 0.0, 0.92));
          }

          vec3 drySandCol = sandColor * 1.05;
          vec3 wetSandCol = sandColor * vec3(0.74, 0.71, 0.66);
          vec3 baseBeachCol = mix(drySandCol, wetSandCol, wetness * (1.0 - waterMask * 0.7));

          vec3 lightDir = normalize(vec3(0.32, 0.88, -0.35));
          float wetSandGloss = wetness * (1.0 - waterMask) * smoothstep(-0.28, 0.02, depth);
          vec3 wetSheen = vec3(0.78, 0.93, 0.99) * wetSandGloss * (0.28 + 0.14 * sandRipple);
          baseBeachCol += wetSheen;

          float caustics = computeCaustics(vHorizontalXZ + refractOffset * 18.0, uTime);
          float causticFade = smoothstep(0.02, 0.28, effectiveDepth) * exp(-max(0.0, effectiveDepth) * 0.28) * waterMask;

          float creatureShadow = 0.0;
          vec2 seabedWorldXZ = vHorizontalXZ + refractOffset * 12.0;
          for (int i = 0; i < ${MAX_SHADOW_CASTERS}; i++) {
            if (i >= uCreatureCount) break;
            vec4 c = uCreatureShadows[i];
            float hAboveBed = max(0.15, c.y + max(0.0, effectiveDepth));
            vec2 shadowCenter = c.xz - lightDir.xz * hAboveBed * 0.55;
            float dist = length(seabedWorldXZ - shadowCenter);
            float sRad = c.w * (1.0 + hAboveBed * 0.12);
            float sh = smoothstep(sRad, sRad * 0.25, dist) * clamp(0.66 - hAboveBed * 0.06, 0.18, 0.64);
            creatureShadow = max(creatureShadow, sh);
          }
          creatureShadow *= 0.72;

          float palmShadow = computePalmShadow(vUv + refractOffset * 0.35, uTime, uWorldSize, uBeachSize) * 0.75;
          float totalBedShadow = max(creatureShadow, palmShadow * 0.68);

          vec3 litSeabed = baseBeachCol * (1.0 - totalBedShadow * uShadowIntensity);
          litSeabed += vec3(0.55, 0.95, 1.0) * caustics * causticFade * uCausticsIntensity * (1.0 - totalBedShadow * clamp(uShadowIntensity * 1.15, 0.0, 1.0)) * 0.62;

          vec3 shallowTurquoise = vec3(0.09, 0.81, 0.78);
          vec3 midLagoonBlue = vec3(0.03, 0.48, 0.72);
          vec3 deepSapphire = vec3(0.015, 0.16, 0.38);

          float dNorm = clamp(effectiveDepth / 4.6, 0.0, 1.0);
          vec3 waterTint = mix(shallowTurquoise, midLagoonBlue, smoothstep(0.0, 0.48, dNorm));
          waterTint = mix(waterTint, deepSapphire, smoothstep(0.42, 1.0, dNorm));

          float turbidity = clamp(1.0 - uWaterClarity * 0.82, 0.05, 1.0);
          vec3 absorption = exp(-vec3(0.58, 0.18, 0.12) * max(0.0, effectiveDepth) * (0.28 + turbidity * 1.05));
          float scatterMix = (1.0 - exp(-max(0.0, effectiveDepth) * (0.22 + turbidity * 0.85))) * (1.0 - uWaterClarity * 0.48);
          vec3 underwaterCol = mix(litSeabed * absorption, waterTint, scatterMix);

          vec3 finalColor = mix(litSeabed, underwaterCol, waterMask);
          finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(0.95));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false
    });

    const oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
    oceanMesh.scale.set(worldW, worldH, 1);
    oceanMesh.renderOrder = 0;
    scene.add(oceanMesh);

    const waterSurfaceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSwellTime: { value: 0 },
        uWorldSize: { value: new THREE.Vector2(worldW, worldH) },
        uHeightMap: { value: simRT0.texture },
        uSeabedData: { value: baked.dataTex },
        uTexel: { value: new THREE.Vector2(1.0 / SIM_RES, 1.0 / SIM_RES) },
        uSwashRunup: { value: 0.0 },
        uSwellScale: { value: 1.0 },
        uSurfaceReflection: { value: 0.28 },
        uSunGlintIntensity: { value: 1.0 },
        uFoamIntensity: { value: 1.0 },
        uBeachSize: { value: 1.0 },
        uWhirlpool: { value: new THREE.Vector4(0.55, 0.45, 0.0, 0.0) },
        uDry: { value: 0.0 },
        uRecoveryFront: { value: 0.0 },
        uRecoveryReach: { value: 1.3 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;
        uniform vec2 uWorldSize;
        void main() {
          vUv = uv;
          vec3 wp = vec3(position.x * uWorldSize.x, position.y * uWorldSize.y, 0.0);
          vHorizontalXZ = vec2(wp.x, -wp.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;

        uniform float uTime;
        uniform float uSwellTime;
        uniform vec2 uWorldSize;
        uniform sampler2D uHeightMap;
        uniform sampler2D uSeabedData;
        uniform vec2 uTexel;
        uniform float uSwashRunup;
        uniform float uSwellScale;
        uniform float uSurfaceReflection;
        uniform float uSunGlintIntensity;
        uniform float uFoamIntensity;
        uniform float uBeachSize;
        uniform vec4 uWhirlpool;
        uniform float uDry;
        uniform float uRecoveryFront;
        uniform float uRecoveryReach;

        ${sharedOceanHelpersGLSL}

        void main() {
          vec4 bedData = texture2D(uSeabedData, vUv);
          float undulation = bedData.r - 0.5;
          float depth = computeBathymetry(vUv, uBeachSize, undulation);

          vec2 swellDir1 = normalize(vec2(-0.74, 0.67));
          vec2 swellDir2 = normalize(vec2(-0.58, 0.81));
          float distAlong1 = dot(vHorizontalXZ, swellDir1);
          float distAlong2 = dot(vHorizontalXZ, swellDir2);

          float shoal = smoothstep(-0.2, 2.5, depth);
          float swellPhase1 = distAlong1 * mix(1.05, 0.62, shoal) - uSwellTime * 2.15;
          float swellPhase2 = distAlong2 * 0.85 - uSwellTime * 1.65 + 1.7;

          float w1 = sin(swellPhase1) + 0.28 * (1.0 - shoal) * sin(swellPhase1 * 2.0);
          float w2 = sin(swellPhase2) * 0.55;
          float swellHeight = (w1 * 0.09 + w2 * 0.05) * uSwellScale * smoothstep(-0.15, 0.35, depth);

          vec4 sim = texture2D(uHeightMap, vUv);
          float hL = texture2D(uHeightMap, vUv - vec2(uTexel.x, 0.0)).r;
          float hR = texture2D(uHeightMap, vUv + vec2(uTexel.x, 0.0)).r;
          float hD = texture2D(uHeightMap, vUv - vec2(0.0, uTexel.y)).r;
          float hU = texture2D(uHeightMap, vUv + vec2(0.0, uTexel.y)).r;
          vec2 rippleGrad = vec2(hR - hL, hU - hD) * 2.4;

          vec2 swellGrad = (swellDir1 * cos(swellPhase1) * 0.14 + swellDir2 * cos(swellPhase2) * 0.08) * uSwellScale;
          vec2 microUv = vHorizontalXZ * 2.8;
          vec2 microGrad = vec2(
            cos(microUv.x * 3.1 + uTime * 3.4 + microUv.y * 1.7),
            sin(microUv.y * 3.5 - uTime * 2.9 + microUv.x * 1.9)
          ) * 0.032;

          float vortexFoam = 0.0;
          vec2 vortexGrad = vec2(0.0);
          if (uWhirlpool.z > 0.005) {
            vec2 vd = vUv - uWhirlpool.xy;
            vd.x *= uWorldSize.x / max(uWorldSize.y, 1.0);
            float vr = length(vd);
            float maxR = mix(0.06, 0.25, uWhirlpool.z);
            if (vr < maxR) {
              float rNorm = vr / maxR;
              float funnel = exp(-rNorm * rNorm * 4.6) * uWhirlpool.z;
              float angle = atan(vd.y, vd.x) + uTime * 5.2 - vr * 28.0;
              vortexGrad = (normalize(vd + 0.0001) * funnel * 1.5 + vec2(-vd.y, vd.x) * sin(angle * 3.0) * 1.8) * uWhirlpool.z;
              // Swirling foam streamers rather than a solid disc
              float swirlRibbon = pow(max(0.0, sin(angle * 2.5)), 2.8);
              vortexFoam = smoothstep(maxR * 0.75, 0.045, vr) * smoothstep(0.015, 0.050, vr) * (0.20 + 0.80 * swirlRibbon) * uWhirlpool.z * 0.42;
            }
          }

          float shoreNoise = (sin(vUv.x * 28.0 + vUv.y * 23.0) * 0.018 + cos(vUv.x * 55.0 - vUv.y * 41.0) * 0.009);
          float swashShift = uSwashRunup * 0.24 + shoreNoise;
          float effectiveDepth = depth + swashShift + swellHeight * 0.8;

          float recDist = computeRecoveryField(vUv);
          float frontPos = (1.0 - uRecoveryFront) * uRecoveryReach;
          float floodMask = uDry > 0.001
            ? mix(1.0, smoothstep(frontPos + 0.035, frontPos - 0.025, recDist), clamp(uDry * 1.35, 0.0, 1.0))
            : 1.0;
          float floodCrestFoam = uDry > 0.005
            ? exp(-pow((recDist - frontPos) / 0.032, 2.0)) * uDry * 1.25
            : 0.0;

          float waterMask = smoothstep(-0.015, 0.035, effectiveDepth) * floodMask;

          vec2 totalGrad = (rippleGrad + swellGrad + microGrad + vortexGrad) * waterMask;
          vec3 normal = normalize(vec3(-totalGrad.x, 1.0, totalGrad.y));

          vec3 lightDir = normalize(vec3(0.32, 0.88, -0.35));
          vec3 viewDir = vec3(0.0, 1.0, 0.0);
          vec3 halfVec = normalize(lightDir + viewDir);

          float palmShadow = computePalmShadow(vUv, uTime, uWorldSize, uBeachSize) * 0.75;

          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.6);
          float rippleSlope = clamp(length(rippleGrad) * 0.45, 0.0, 0.65);
          float reflAlpha = clamp((fresnel * 1.35 + rippleSlope * 0.35) * uSurfaceReflection, 0.0, 0.72) * (1.0 - palmShadow * 0.5) * waterMask;
          vec3 skyCol = mix(vec3(0.46, 0.86, 0.98), vec3(0.86, 0.97, 1.0), fresnel);

          float spec = pow(max(0.0, dot(normal, halfVec)), 140.0);
          float glintNoise = fract(sin(dot(floor(vHorizontalXZ * 16.0 + uTime * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
          float sunGlint = spec * (1.2 + step(0.75, glintNoise) * 2.4) * uSunGlintIntensity * (1.0 - palmShadow * 0.85) * waterMask;

          float hasBeach = smoothstep(0.01, 0.12, uBeachSize);
          float swashEdge = exp(-pow((effectiveDepth - 0.025) / 0.045, 2.0)) * hasBeach;
          float breakerZone = exp(-pow((effectiveDepth - 0.24 + uSwashRunup * 0.08) / 0.14, 2.0)) * max(0.0, uSwashRunup + 0.35) * hasBeach;
          float simFoam = sim.b * (1.0 - smoothstep(0.02, 0.32, length(vUv - uWhirlpool.xy)) * uWhirlpool.z * 0.75);
          float foamDensity = clamp((swashEdge * 1.15 + breakerZone * 0.85 + simFoam * 0.75 + vortexFoam * 0.85 + floodCrestFoam) * uFoamIntensity, 0.0, 1.35);

          float lacy = computeLacyFoam(vHorizontalXZ * 0.85 + normal.xz * 0.6, foamDensity, uTime);
          float lip = smoothstep(0.032, 0.004, abs(effectiveDepth - 0.012)) * 0.88 * clamp(uFoamIntensity, 0.0, 1.4) * hasBeach;
          float totalFoam = clamp(max(lacy, lip), 0.0, 1.0) * floodMask;

          // Translucency control for storm vortex waves (transparent enough to see swirling creatures)
          float vortexMask = clamp(vortexFoam * 2.8, 0.0, 1.0);
          float foamAlphaCap = mix(0.96, 0.38, vortexMask);
          totalFoam = min(totalFoam, foamAlphaCap);
          vec3 foamColor = vec3(0.96, 0.99, 1.0) * (1.0 - palmShadow * 0.38);

          float glintAlpha = clamp(sunGlint * 0.85, 0.0, 1.0);
          float maxAlpha = mix(0.98, 0.46, vortexMask);
          float outAlpha = clamp(reflAlpha + glintAlpha + totalFoam, 0.0, maxAlpha);
          if (outAlpha < 0.004) discard;

          vec3 surfCol = mix(skyCol, vec3(1.0, 0.98, 0.90), clamp(glintAlpha / max(reflAlpha + glintAlpha, 0.001), 0.0, 1.0));
          surfCol = mix(surfCol, foamColor, totalFoam * mix(1.0, 0.50, vortexMask));

          gl_FragColor = vec4(surfCol, outAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });

    const waterSurfaceMesh = new THREE.Mesh(oceanGeometry, waterSurfaceMaterial);
    waterSurfaceMesh.scale.set(worldW, worldH, 1);
    waterSurfaceMesh.renderOrder = 5;
    scene.add(waterSurfaceMesh);

    // 3D Splash Droplets, Tentacle Drips, Sand Silt Clouds & Rain Streaks (in XY + Z-up coordinates)
    const MAX_PARTICLES = 750;
    let particleScale=1,particleLimit=MAX_PARTICLES;
    const partPositions = new Float32Array(MAX_PARTICLES * 3);
    const partColors = new Float32Array(MAX_PARTICLES * 4);
    const partSizes = new Float32Array(MAX_PARTICLES);
    const particles = [];

    const partGeom = new THREE.BufferGeometry();
    const partPosAttr = new THREE.BufferAttribute(partPositions, 3).setUsage(THREE.DynamicDrawUsage);
    const partColAttr = new THREE.BufferAttribute(partColors, 4).setUsage(THREE.DynamicDrawUsage);
    const partSizeAttr = new THREE.BufferAttribute(partSizes, 1).setUsage(THREE.DynamicDrawUsage);
    partGeom.setAttribute("position", partPosAttr);
    partGeom.setAttribute("aColor", partColAttr);
    partGeom.setAttribute("aSize", partSizeAttr);
    partGeom.setDrawRange(0, 0);

    const partMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        precision highp float;
        attribute vec4 aColor;
        attribute float aSize;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(-mvPos.z, 1.0));
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vColor;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float soft = exp(-r2 * 2.2);
          gl_FragColor = vec4(vColor.rgb, vColor.a * soft);
        }
      `,
      transparent: true,
      depthWrite: false
    });

    const particlePoints = new THREE.Points(partGeom, partMaterial);
    particlePoints.frustumCulled = false;
    particlePoints.renderOrder = 7;
    scene.add(particlePoints);

    function spawnWaterSplashUv(u, v, intensity = 1.0, sound = null, rippleMult = 1.0) {
      const wp = toWorld(u, v, 0);
      addWaterImpulseUv(u, v, 0.020 + intensity * 0.010, -0.82 * intensity, rippleMult);
      setTimeout(() => {
        addWaterImpulseUv(u, v, 0.014 + intensity * 0.006, 0.58 * intensity, rippleMult);
      }, 85);

      if (sound) sound.playSplash(intensity);

      const dropletCount = Math.min(48, Math.floor((18 + intensity * 22)*particleScale));
      for (let i = 0; i < dropletCount; i++) {
        if (particles.length >= particleLimit) break;
        const ang = (i / dropletCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const ringR = (0.10 + Math.random() * 0.24) * intensity;
        const hSpeed = (1.1 + Math.random() * 2.5) * intensity;
        const vSpeed = (3.2 + Math.random() * 4.0) * Math.sqrt(intensity);
        particles.push({
          type: "droplet",
          x: wp.x + Math.cos(ang) * ringR,
          y: wp.y + Math.sin(ang) * ringR,
          z: 0.08 + Math.random() * 0.14,
          vx: Math.cos(ang) * hSpeed,
          vy: Math.sin(ang) * hSpeed,
          vz: vSpeed,
          age: 0,
          maxAge: 0.55 + Math.random() * 0.45,
          size: 0.22 + Math.random() * 0.24,
          r: 0.92,
          g: 0.99,
          b: 1.0,
          rippleOnHit: i % 4 === 0
        });
      }
    }

    function spawnTentacleDripWorld(x, y, z) {
      if (particles.length >= particleLimit) return;
      particles.push({
        type: "drip",
        x: x + (Math.random() - 0.5) * 0.06,
        y: y + (Math.random() - 0.5) * 0.06,
        z: Math.max(0.1, z),
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        vz: -0.6 - Math.random() * 0.5,
        age: 0,
        maxAge: 1.1,
        size: 0.20 + Math.random() * 0.12,
        r: 0.88,
        g: 0.98,
        b: 1.0,
        rippleOnHit: true
      });
    }

    function spawnSandSiltCloudWorld(x, y, z) {
      const count = Math.max(1,Math.round(34*particleScale));
      for (let i = 0; i < count; i++) {
        if (particles.length >= particleLimit) break;
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.35 + Math.random() * 1.45;
        particles.push({
          type: "silt",
          x: x + (Math.random() - 0.5) * 0.55,
          y: y + (Math.random() - 0.5) * 0.55,
          z: z + 0.05 + Math.random() * 0.15,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          vz: 0.22 + Math.random() * 0.45,
          age: 0,
          maxAge: 1.35 + Math.random() * 0.95,
          size: 0.65 + Math.random() * 0.75,
          r: 0.85,
          g: 0.76,
          b: 0.56,
          rippleOnHit: false
        });
      }
    }

    function updateParticles(dt, sound, rippleMult = 1.0) {
      let writeIdx = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          particles.splice(i, 1);
          continue;
        }

        if (p.type === "droplet" || p.type === "drip") {
          p.vz -= 13.5 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;

          if (p.z <= 0.0 && p.vz < 0.0) {
            if (p.rippleOnHit) {
              addWaterImpulseWorld(p.x, p.y, p.type === "drip" ? 0.32 : 0.38, p.type === "drip" ? -0.20 : -0.24, rippleMult);
              if (p.type === "drip" && sound && Math.random() < 0.22) {
                sound.playChime(null, 0.045);
              }
            }
            particles.splice(i, 1);
            continue;
          }
        } else if (p.type === "silt") {
          p.vx *= Math.pow(0.22, dt);
          p.vy *= Math.pow(0.22, dt);
          p.vz *= Math.pow(0.45, dt);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.size += dt * 0.55;
        }

        const life01 = p.age / p.maxAge;
        const alpha = p.type === "silt"
          ? Math.sin(life01 * Math.PI) * 0.62
          : (1.0 - life01 * 0.7) * 0.92;

        partPositions[writeIdx * 3] = p.x;
        partPositions[writeIdx * 3 + 1] = p.y;
        partPositions[writeIdx * 3 + 2] = p.z;

        partColors[writeIdx * 4] = p.r;
        partColors[writeIdx * 4 + 1] = p.g;
        partColors[writeIdx * 4 + 2] = p.b;
        partColors[writeIdx * 4 + 3] = alpha;

        partSizes[writeIdx] = p.size;
        writeIdx++;
      }

      partPosAttr.needsUpdate = true;
      partColAttr.needsUpdate = true;
      partSizeAttr.needsUpdate = true;
      partGeom.setDrawRange(0, writeIdx);
    }

    function resize(newAspect) {
      aspect = newAspect;
      worldH = 20.0;
      worldW = 20.0 * aspect;
      oceanMesh.scale.set(worldW, worldH, 1);
      waterSurfaceMesh.scale.set(worldW, worldH, 1);
      oceanMaterial.uniforms.uWorldSize.value.set(worldW, worldH);
      waterSurfaceMaterial.uniforms.uWorldSize.value.set(worldW, worldH);
    }

    function setBeachSize(size) {
      currentSettings.beachSize = size;
      oceanMaterial.uniforms.uBeachSize.value = size;
      waterSurfaceMaterial.uniforms.uBeachSize.value = size;
      simMaterial.uniforms.uBeachSize.value = size;
    }

    function getShoreDistance(u, v) {
      const bSize = currentSettings.beachSize;
      if (bSize <= 0.001) return 999.0;
      const dx = u;
      const dy = (1.0 - v) * 1.35;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const curve = 0.045 * Math.sin(u * 9.0 + (1.0 - v) * 6.0) + 0.025 * Math.cos(u * 17.0 - v * 11.0);
      const shoreRadius = 0.34 * Math.pow(clamp(bSize, 0.0, 2.2), 0.72);
      return radial - shoreRadius + curve;
    }

    function enforceBeachBoundary(u, v, minMargin = 0.08) {
      const bSize = currentSettings.beachSize;
      if (bSize <= 0.001) return { u, v, normalU: 0, normalV: 0, clamped: false };
      let curU = u;
      let curV = v;
      let clamped = false;
      let finalNx = 0, finalNy = 0;

      for (let iter = 0; iter < 3; iter++) {
        const dx = curU;
        const dy = (1.0 - curV) * 1.35;
        const radial = Math.sqrt(dx * dx + dy * dy);
        const curve = 0.045 * Math.sin(curU * 9.0 + (1.0 - curV) * 6.0) + 0.025 * Math.cos(curU * 17.0 - curV * 11.0);
        const shoreRadius = 0.34 * Math.pow(clamp(bSize, 0.0, 2.2), 0.72);
        const shoreDist = radial - shoreRadius + curve;
        if (shoreDist < minMargin) {
          clamped = true;
          const delta = minMargin - shoreDist;
          const len = Math.max(radial, 0.0001);
          const nx = dx / len;
          const ny = -dy / (len * 1.35);
          const normLen = Math.hypot(nx, ny) || 1.0;
          finalNx = nx / normLen;
          finalNy = ny / normLen;
          curU += finalNx * (delta + 0.008);
          curV += finalNy * (delta + 0.008);
        } else {
          break;
        }
      }
      return { u: curU, v: curV, normalU: finalNx, normalV: finalNy, clamped };
    }

    return {
      getAspect: () => aspect,
      getWorldSize: () => ({ worldW, worldH }),
      toWorld,
      worldToUv,
      getUvBathymetry: (u, v) => getUvBathymetry(u, v, currentSettings.beachSize),
      getShoreDistance,
      enforceBeachBoundary,
      setBeachSize,
      getSwashState,
      rebuildSeabed,
      getCoralHeads: () => baked.coralHeads,
      addWaterImpulseUv,
      addWaterImpulseWorld,
      stepWaterSimulation,
      spawnWaterSplashUv,
      spawnTentacleDripWorld,
      spawnSandSiltCloudWorld,
      updateParticles,
      setParticleBudget(value){particleScale=Math.max(.2,Math.min(1,value));particleLimit=Math.round(MAX_PARTICLES*particleScale);},
      clearParticles: () => { particles.length = 0; partGeom.setDrawRange(0, 0); },
      resize,
      oceanMesh,
      waterSurfaceMesh,
      oceanMaterial,
      waterSurfaceMaterial,
      simMaterial,
      creatureShadowData,
      MAX_SHADOW_CASTERS,
      getHeightMapTexture: () => simRT0.texture
    };
  }

  root.OceanWaterSeabed = {
    fract,
    mix,
    clamp,
    smoothstep,
    hash2,
    noise2,
    fbm2,
    getUvBathymetry,
    getSwashState,
    bakeSeabedTextures,
    createWaterAndSeabedSystem
  };
})(root);

}
