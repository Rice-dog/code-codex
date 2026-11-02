export function install(root, document, window, matchMedia) {
/* Reef Ecosystem Module for Ocean Shallows 2:
   - 3D Swaying Sea Anemones (海葵) on the coral reef
   - Silver Fish School Boids (银色鱼群), 3-Variant Reef Fish (珊瑚彩色鱼), and Clownfish (海葵小丑鱼)
   - 960-Fish Streaming School Migration Event (鱼群穿境)
   - Blacktip Reef Sharks (黑鳍礁鲨) with seabed shadows & fish-parting behavior
   - 3D Thumbnail Renderer for all 9 Dock Creature Cards
   Stylized with Ocean Shallows 2's Voronoi caustics and crystal-clear water optics. */
(function (root) {
  "use strict";

  const { clamp, mix, smoothstep } = root.OceanWaterSeabed;
  const TAU = Math.PI * 2;

  const MAX_RESIDENT_FISH = 240;
  const STREAM_FISH_COUNT = 1440;
  const MAX_FISH_INSTANCES = MAX_RESIDENT_FISH + STREAM_FISH_COUNT;
  const MAX_SHARKS = 8;
  const MAX_TURTLES = 6;

  // Build 3D streamlined fish geometry (fusiform body + forked caudal tail + dorsal + pectorals)
  // Local +Y is forward (nose at +Y, tail at -Y), +Z is dorsal up, +X is right.
  function createFishGeometry(THREE) {
    const positions = [];
    const normals = [];
    const indices = [];

    const profile = [
      [-1.08, 0.065, 0.28, 0.0],
      [-0.86, 0.032, 0.16, 0.0],
      [-0.64, 0.062, 0.11, 0.0],
      [-0.36, 0.135, 0.19, 0.0],
      [-0.04, 0.205, 0.25, 0.005],
      [0.28, 0.225, 0.26, 0.008],
      [0.58, 0.180, 0.21, 0.004],
      [0.82, 0.102, 0.13, -0.004],
      [0.98, 0.020, 0.03, -0.008]
    ];

    const rings = 32;
    const sides = 18;
    for (let j = 0; j <= rings; j++) {
      const t = (j / rings) * (profile.length - 1);
      const k = Math.min(profile.length - 2, Math.floor(t));
      const f = t - k;
      const a = profile[Math.max(0, k - 1)];
      const b = profile[k];
      const c = profile[k + 1];
      const d = profile[Math.min(profile.length - 1, k + 2)];
      const interp = (n) =>
        0.5 *
        (2 * b[n] +
          (-a[n] + c[n]) * f +
          (2 * a[n] - 5 * b[n] + 4 * c[n] - d[n]) * f * f +
          (-a[n] + 3 * b[n] - 3 * c[n] + d[n]) * f * f * f);

      const y = mix(b[0], c[0], f);
      const rx = Math.max(0.004, interp(1));
      const rz = Math.max(0.008, interp(2));
      const zOff = interp(3);

      for (let i = 0; i <= sides; i++) {
        const th = (i / sides) * TAU;
        const cx = Math.cos(th);
        const sz = Math.sin(th);
        positions.push(cx * rx, y, sz * rz + zOff);
        normals.push(cx / rx, 0, sz / rz);
      }
    }

    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sides; i++) {
        const a = j * (sides + 1) + i;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    // Add dorsal fin & pectoral fins
    function addFinQuad(pts, normalVec) {
      const base = positions.length / 3;
      for (const p of pts) {
        positions.push(p[0], p[1], p[2]);
        normals.push(normalVec[0], normalVec[1], normalVec[2]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }

    // Dorsal fin
    addFinQuad(
      [
        [0, 0.28, 0.20],
        [0, -0.36, 0.16],
        [0, -0.48, 0.38],
        [0, 0.06, 0.40]
      ],
      [1, 0, 0.25]
    );

    // Flared caudal tail fin lobes (clearly visible from top-down camera)
    for (const sgn of [-1, 1]) {
      addFinQuad(
        [
          [0, -0.72, 0.04],
          [0, -0.84, -0.04],
          [sgn * 0.16, -1.16, -0.18],
          [sgn * 0.18, -1.14, 0.22]
        ],
        [sgn * 0.6, -0.2, 0.75]
      );
    }

    // Left & Right Pectoral fins
    for (const sgn of [-1, 1]) {
      addFinQuad(
        [
          [sgn * 0.15, 0.36, -0.02],
          [sgn * 0.13, 0.12, -0.04],
          [sgn * 0.46, -0.02, -0.07],
          [sgn * 0.42, 0.26, -0.03]
        ],
        [0, 0, 1]
      );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  // Build 3D Blacktip Reef Shark geometry (Local +Y is forward, +Z is dorsal up)
  function createSharkGeometry(THREE) {
    const positions = [];
    const fins = [];
    const indices = [];

    const profile = [
      [-1.72, 0.008, 0.015, 0.03],
      [-1.45, 0.038, 0.048, 0.01],
      [-1.12, 0.085, 0.095, 0.0],
      [-0.72, 0.165, 0.175, 0.0],
      [-0.25, 0.255, 0.245, 0.01],
      [0.22, 0.295, 0.265, 0.015],
      [0.62, 0.265, 0.225, 0.01],
      [0.98, 0.195, 0.155, -0.005],
      [1.28, 0.115, 0.085, -0.015],
      [1.48, 0.035, 0.028, -0.02],
      [1.54, 0.002, 0.002, -0.02]
    ];

    const sides = 32;
    const rings = 72;
    for (let j = 0; j <= rings; j++) {
      const t = (j / rings) * (profile.length - 1);
      const k = Math.min(profile.length - 2, Math.floor(t));
      const f = t - k;
      const a = profile[Math.max(0, k - 1)];
      const b = profile[k];
      const c = profile[k + 1];
      const d = profile[Math.min(profile.length - 1, k + 2)];
      const val = (n) =>
        0.5 *
        (2 * b[n] +
          (-a[n] + c[n]) * f +
          (2 * a[n] - 5 * b[n] + 4 * c[n] - d[n]) * f * f +
          (-a[n] + 3 * b[n] - 3 * c[n] + d[n]) * f * f * f);

      for (let i = 0; i <= sides; i++) {
        const th = (i / sides) * TAU;
        positions.push(
          Math.cos(th) * Math.max(0.002, val(1)),
          mix(b[0], c[0], f),
          Math.sin(th) * Math.max(0.002, val(2)) + val(3)
        );
        fins.push(0);
      }
    }

    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sides; i++) {
        const a = j * (sides + 1) + i;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    function foil(sections, vertical = false, finTag = 1) {
      const base = fins.length;
      const n = 16;
      const samples = [];
      for (let j = 0; j <= (sections.length - 1) * 4; j++) {
        const t = j / 4;
        const k = Math.min(sections.length - 2, Math.floor(t));
        const f = t - k;
        const a = sections[Math.max(0, k - 1)];
        const b = sections[k];
        const c = sections[k + 1];
        const d = sections[Math.min(sections.length - 1, k + 2)];
        samples.push(
          b.map((_, i) => {
            const v =
              0.5 *
              (2 * b[i] +
                (-a[i] + c[i]) * f +
                (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * f * f +
                (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * f * f * f);
            return i > 2 ? Math.max(0.001, v) : v;
          })
        );
      }
      for (const [x, y, z, chord, thickness] of samples) {
        for (let i = 0; i <= n; i++) {
          const th = (i / n) * TAU;
          const across = Math.sin(th) * thickness * (0.8 + 0.2 * Math.cos(th));
          positions.push(
            x + (vertical ? across : 0),
            y + Math.cos(th) * chord,
            z + (vertical ? 0 : across)
          );
          fins.push(finTag);
        }
      }
      for (let j = 0; j < samples.length - 1; j++) {
        for (let i = 0; i < n; i++) {
          const a = base + j * (n + 1) + i;
          const b = a + n + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }

    // First dorsal fin (tall, swept back, black-tipped)
    foil(
      [
        [0, 0.08, 0.22, 0.28, 0.045],
        [0, 0.02, 0.38, 0.22, 0.035],
        [0, -0.08, 0.56, 0.14, 0.024],
        [0, -0.18, 0.68, 0.05, 0.01],
        [0, -0.22, 0.71, 0.004, 0.002]
      ],
      true,
      1
    );

    // Second dorsal fin
    foil(
      [
        [0, -0.92, 0.09, 0.11, 0.022],
        [0, -0.98, 0.19, 0.07, 0.015],
        [0, -1.04, 0.25, 0.02, 0.005]
      ],
      true,
      1
    );

    // Heterocercal caudal tail fin (upper & lower lobes)
    foil(
      [
        [0, -1.48, 0.02, 0.14, 0.028],
        [0, -1.68, 0.18, 0.15, 0.024],
        [0, -1.92, 0.36, 0.11, 0.016],
        [0, -2.12, 0.48, 0.04, 0.006]
      ],
      true,
      2
    );
    foil(
      [
        [0, -1.48, -0.01, 0.12, 0.024],
        [0, -1.62, -0.16, 0.10, 0.018],
        [0, -1.74, -0.26, 0.03, 0.006]
      ],
      true,
      2
    );

    // Pectoral & Pelvic fins
    for (const sign of [-1, 1]) {
      foil(
        [
          [sign * 0.22, 0.36, -0.10, 0.24, 0.036],
          [sign * 0.46, 0.22, -0.14, 0.21, 0.028],
          [sign * 0.72, 0.04, -0.17, 0.14, 0.018],
          [sign * 0.90, -0.10, -0.18, 0.04, 0.006]
        ],
        false,
        1
      );
      foil(
        [
          [sign * 0.12, -0.52, -0.11, 0.12, 0.022],
          [sign * 0.26, -0.60, -0.13, 0.09, 0.015],
          [sign * 0.34, -0.66, -0.14, 0.02, 0.005]
        ],
        false,
        1
      );
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("fin", new THREE.Float32BufferAttribute(fins, 1));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  // Build 3D Green Sea Turtle Geometry (Carapace, Plastron, Head/Neck, Front Wings, Rear Paddles, Tail)
  function createTurtleGeometry(THREE) {
    const positions = [];
    const normals = [];
    const parts = [];
    const scutes = [];
    const indices = [];

    function pushV(px, py, pz, partId, span, chord, side, su, sv) {
      positions.push(px, py, pz);
      normals.push(0, 0, 1);
      parts.push(partId, span, chord, side);
      scutes.push(su, sv);
      return (positions.length / 3) - 1;
    }

    // 1. CARAPACE (Dorsal Shell) - partId = 0.0 (Realistic Green Sea Turtle - Sleek Hydrofoil Dome)
    const rings = 20;
    const sectors = 36;
    const yc = -0.13;
    const carapaceBase = 0;

    for (let j = 0; j <= rings; j++) {
      const f = j / rings;
      for (let i = 0; i <= sectors; i++) {
        const th = (i / sectors) * TAU;
        const sinTh = Math.sin(th);
        const cosTh = Math.cos(th);
        // Streamlined sub-cordiform oval, wider at pectoral chest, tapering smoothly to posterior notch
        const rx = 0.45 * sinTh * (1.0 + 0.10 * cosTh);
        const ry = 0.54 * cosTh;
        const x = f * rx;
        const y = yc + f * ry;
        // Natural camber: aerodynamic dome
        const zDome = 0.27 * Math.sqrt(Math.max(0.001, 1.0 - f * f));
        const rimFlare = f > 0.80 ? 0.012 * Math.sin(((f - 0.80) / 0.20) * Math.PI * 0.5) : 0.0;
        // Vertebral spine keel: natural subtle ridge along midline
        const spineKeel = 0.012 * Math.exp(-((x / 0.12) ** 2)) * Math.sin((1.0 - f) * Math.PI * 0.88);
        const z = zDome + rimFlare + spineKeel;

        const su = x / 0.45;
        const sv = (y - yc) / 0.54;
        pushV(x, y, z, 0.0, f, th / TAU, sinTh >= 0 ? 1.0 : -1.0, su, sv);
      }
    }

    const cols = sectors + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sectors; i++) {
        const a = carapaceBase + j * cols + i;
        const b = a + 1;
        const c = carapaceBase + (j + 1) * cols + i;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // 2. PLASTRON (Ventral Belly Shell) - partId = 0.5
    const plastronRings = 12;
    const plastronBase = positions.length / 3;

    for (let j = 0; j <= plastronRings; j++) {
      const f = j / plastronRings;
      for (let i = 0; i <= sectors; i++) {
        const th = (i / sectors) * TAU;
        const sinTh = Math.sin(th);
        const cosTh = Math.cos(th);
        const rx = 0.41 * sinTh * (1.0 + 0.10 * cosTh);
        const ry = 0.50 * cosTh;
        const x = f * rx;
        const y = yc + f * ry;
        const z = -0.085 * (1.0 - f * 0.88);
        const su = x / 0.41;
        const sv = (y - yc) / 0.50;
        pushV(x, y, z, 0.5, f, th / TAU, sinTh >= 0 ? 1.0 : -1.0, su, sv);
      }
    }

    for (let j = 0; j < plastronRings; j++) {
      for (let i = 0; i < sectors; i++) {
        const a = plastronBase + j * cols + i;
        const b = a + 1;
        const c = plastronBase + (j + 1) * cols + i;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    // Bridge between Carapace rim and Plastron rim (marginal bridge)
    const carapaceRimRow = carapaceBase + rings * cols;
    const plastronRimRow = plastronBase + plastronRings * cols;
    for (let i = 0; i < sectors; i++) {
      const ca = carapaceRimRow + i;
      const cb = ca + 1;
      const pa = plastronRimRow + i;
      const pb = pa + 1;
      indices.push(ca, pa, cb, cb, pa, pb);
    }

    // 3. HEAD AND NECK - partId = 1.0 (Realistic Green Sea Turtle - Sleek, Hydrodynamic Skull)
    const neckRings = 16;
    const neckSides = 20;
    const headBase = positions.length / 3;

    for (let j = 0; j <= neckRings; j++) {
      const t = j / neckRings;
      const y = 0.24 + t * 0.38; // extends to snout tip y=0.62

      let rx, rz, cz;
      if (t < 0.42) {
        // Neck cylinder
        const nf = t / 0.42;
        rx = 0.095 + 0.018 * nf;
        rz = 0.082 + 0.016 * nf;
        cz = 0.012 + 0.014 * nf;
      } else if (t < 0.80) {
        // Streamlined skull & temporal region
        const hf = (t - 0.42) / 0.38;
        rx = 0.118 + 0.018 * Math.sin(hf * Math.PI);
        rz = 0.098 + 0.016 * Math.sin(hf * Math.PI);
        cz = 0.024 + 0.010 * Math.sin(hf * Math.PI);
      } else {
        // Tapered reptilian beak & snout
        const bf = (t - 0.80) / 0.20;
        rx = 0.118 * (1.0 - bf * 0.58);
        rz = 0.098 * (1.0 - bf * 0.52);
        cz = 0.024 - bf * 0.012;
      }

      for (let i = 0; i <= neckSides; i++) {
        const th = (i / neckSides) * TAU;
        const nx = Math.cos(th);
        const nz = Math.sin(th);
        const px = nx * rx;
        const py = y;
        const pz = cz + nz * rz;
        pushV(px, py, pz, 1.0, t, th / TAU, px >= 0 ? 1.0 : -1.0, px * 2.4, t);
      }
    }

    const neckCols = neckSides + 1;
    for (let j = 0; j < neckRings; j++) {
      for (let i = 0; i < neckSides; i++) {
        const a = headBase + j * neckCols + i;
        const b = a + 1;
        const c = headBase + (j + 1) * neckCols + i;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // 4. FRONT WING FLIPPERS (Pectorals) - partId = 2.0 (Graceful, long aerodynamic hydrofoil wings)
    const spanSteps = 18;
    const chordSteps = 10;

    for (const sideSign of [-1, 1]) {
      const flipperBase = positions.length / 3;
      const shoulderX = sideSign * 0.21;
      const shoulderY = 0.21;
      const shoulderZ = -0.02;

      for (let s = 0; s <= spanSteps; s++) {
        const spanFrac = s / spanSteps;
        // Graceful swept wing matching reference top view
        const leX = shoulderX + sideSign * 0.48 * spanFrac;
        const leY = shoulderY - 0.26 * Math.pow(spanFrac, 1.25);
        const leZ = shoulderZ - 0.025 * spanFrac;

        // Hydrofoil chord: broad base, smoothly tapering to rounded wingtip
        const chordLen = 0.20 * (1.0 - 0.46 * spanFrac) * (0.32 + 0.68 * Math.sqrt(spanFrac));
        const thickness = 0.026 * (1.0 - 0.65 * spanFrac);

        for (let c = 0; c <= chordSteps * 2; c++) {
          const u = c / (chordSteps * 2);
          const isDorsal = u <= 0.5;
          const chordFrac = isDorsal ? (u * 2.0) : ((1.0 - u) * 2.0);
          const yOffset = -chordFrac * chordLen * 0.96;
          const xOffset = -sideSign * chordFrac * chordLen * 0.18;
          const zOffset = (isDorsal ? 1.0 : -1.0) * thickness * Math.sin(chordFrac * Math.PI);

          const px = leX + xOffset;
          const py = leY + yOffset;
          const pz = leZ + zOffset;

          pushV(px, py, pz, 2.0, spanFrac, chordFrac, sideSign, spanFrac, chordFrac);
        }
      }

      const flipperCols = chordSteps * 2 + 1;
      for (let s = 0; s < spanSteps; s++) {
        for (let c = 0; c < chordSteps * 2; c++) {
          const a = flipperBase + s * flipperCols + c;
          const b = a + 1;
          const d = flipperBase + (s + 1) * flipperCols + c;
          const e = d + 1;
          if (sideSign > 0) {
            indices.push(a, d, b, b, d, e);
          } else {
            indices.push(a, b, d, b, e, d);
          }
        }
      }
    }

    // 5. REAR PADDLE FLIPPERS (Pelvics) - partId = 3.0 (Realistic spatulate rudders)
    const rearSpanSteps = 10;
    const rearChordSteps = 8;

    for (const sideSign of [-1, 1]) {
      const rearBase = positions.length / 3;
      const hipX = sideSign * 0.16;
      const hipY = -0.54;
      const hipZ = -0.04;

      for (let s = 0; s <= rearSpanSteps; s++) {
        const spanFrac = s / rearSpanSteps;
        const pxBase = hipX + sideSign * 0.25 * spanFrac;
        const pyBase = hipY - 0.30 * spanFrac;
        const pzBase = hipZ - 0.02 * spanFrac;

        const paddleChord = 0.17 * Math.sin(spanFrac * Math.PI * 0.85 + 0.15);
        const paddleThick = 0.022 * (1.0 - 0.55 * spanFrac);

        for (let c = 0; c <= rearChordSteps * 2; c++) {
          const u = c / (rearChordSteps * 2);
          const isDorsal = u <= 0.5;
          const chordFrac = isDorsal ? (u * 2.0) : ((1.0 - u) * 2.0);
          const xOffset = sideSign * (chordFrac - 0.5) * paddleChord * 0.38;
          const yOffset = -(chordFrac - 0.5) * paddleChord * 0.90;
          const zOffset = (isDorsal ? 1.0 : -1.0) * paddleThick * Math.sin(chordFrac * Math.PI);

          pushV(pxBase + xOffset, pyBase + yOffset, pzBase + zOffset, 3.0, spanFrac, chordFrac, sideSign, spanFrac, chordFrac);
        }
      }

      const rearCols = rearChordSteps * 2 + 1;
      for (let s = 0; s < rearSpanSteps; s++) {
        for (let c = 0; c < rearChordSteps * 2; c++) {
          const a = rearBase + s * rearCols + c;
          const b = a + 1;
          const d = rearBase + (s + 1) * rearCols + c;
          const e = d + 1;
          if (sideSign > 0) {
            indices.push(a, d, b, b, d, e);
          } else {
            indices.push(a, b, d, b, e, d);
          }
        }
      }
    }

    // 6. TAIL - partId = 4.0
    const tailSteps = 6;
    const tailSides = 8;
    const tailBase = positions.length / 3;

    for (let s = 0; s <= tailSteps; s++) {
      const frac = s / tailSteps;
      const y = -0.65 - 0.16 * frac;
      const r = 0.035 * (1.0 - frac * 0.88);
      const cz = -0.04;
      for (let i = 0; i <= tailSides; i++) {
        const th = (i / tailSides) * TAU;
        const px = Math.cos(th) * r;
        const py = y;
        const pz = cz + Math.sin(th) * r;
        pushV(px, py, pz, 4.0, frac, th / TAU, 0.0, px * 4.0, frac);
      }
    }

    const tailCols = tailSides + 1;
    for (let s = 0; s < tailSteps; s++) {
      for (let i = 0; i < tailSides; i++) {
        const a = tailBase + s * tailCols + i;
        const b = a + 1;
        const c = tailBase + (s + 1) * tailCols + i;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(parts, 4));
    g.setAttribute("aScute", new THREE.Float32BufferAttribute(scutes, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  // Build 3D Swaying Sea Anemone Geometry (basal column + crown of 42 tapered tentacles)
  function createAnemoneGeometry(THREE) {
    const positions = [];
    const normals = [];
    const tentacleMeta = []; // (tentacleId, heightFrac01, radialDist01)
    const indices = [];

    const tentacleCount = 42;
    const segs = 10;
    const sides = 6;

    for (let t = 0; t < tentacleCount; t++) {
      const ring = t < 10 ? 0 : t < 24 ? 1 : 2;
      const idxInRing = ring === 0 ? t : ring === 1 ? t - 10 : t - 24;
      const countInRing = ring === 0 ? 10 : ring === 1 ? 14 : 18;
      const angle = (idxInRing / countInRing) * TAU + ring * 0.42;
      const radial = ring === 0 ? 0.18 : ring === 1 ? 0.36 : 0.54;
      const lean = ring === 0 ? 0.18 : ring === 1 ? 0.42 : 0.68;
      const height = ring === 0 ? 0.58 : ring === 1 ? 0.52 : 0.44;

      const baseX = Math.cos(angle) * radial;
      const baseY = Math.sin(angle) * radial;
      const baseV = positions.length / 3;

      for (let s = 0; s <= segs; s++) {
        const f = s / segs;
        const flare = Math.pow(f, 1.25) * lean;
        const cx = baseX + Math.cos(angle) * flare;
        const cy = baseY + Math.sin(angle) * flare;
        const cz = f * height;
        // Bulbous tip characteristic of Bubble-tip / Magnificent Sea Anemone
        const bulb = Math.exp(-Math.pow((f - 0.86) / 0.11, 2.0)) * 0.022;
        const r = (0.048 * (1.0 - f * 0.55) + bulb) * (1.0 - stepEnd(f));

        for (let c = 0; c < sides; c++) {
          const ca = (c / sides) * TAU;
          const nx = Math.cos(ca);
          const ny = Math.sin(ca);
          positions.push(cx + nx * r, cy + ny * r, cz);
          normals.push(nx, ny, 0.35);
          tentacleMeta.push(t * 0.17, f, radial);
        }
      }

      for (let s = 0; s < segs; s++) {
        for (let c = 0; c < sides; c++) {
          const nextC = (c + 1) % sides;
          const a = baseV + s * sides + c;
          const b = baseV + s * sides + nextC;
          const d = baseV + (s + 1) * sides + c;
          const e = baseV + (s + 1) * sides + nextC;
          indices.push(a, b, d, b, e, d);
        }
      }
    }

    function stepEnd(f) {
      return f > 0.96 ? (f - 0.96) / 0.04 : 0.0;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("aTentacle", new THREE.Float32BufferAttribute(tentacleMeta, 3));
    g.setIndex(indices);
    return g;
  }

  function createReefEcosystem({ THREE, scene, waterSystem, sound }) {
    // ------------------------------------------------------------------------
    // 1. 3D SWAYING SEA ANEMONES (海葵) ON THE CORAL REEF
    // ------------------------------------------------------------------------
    const ANEMONE_SPOTS = [
      { u: 0.255, v: 0.505, scale: 0.74, palette: 0.0, squish: 0, phase: 0.4 },
      { u: 0.302, v: 0.472, scale: 0.66, palette: 0.35, squish: 0, phase: 1.9 },
      { u: 0.592, v: 0.745, scale: 0.80, palette: 0.7, squish: 0, phase: 3.1 },
      { u: 0.642, v: 0.715, scale: 0.68, palette: 0.15, squish: 0, phase: 4.5 },
      { u: 0.792, v: 0.562, scale: 0.84, palette: 0.85, squish: 0, phase: 2.3 },
      { u: 0.455, v: 0.232, scale: 0.72, palette: 0.5, squish: 0, phase: 5.2 }
    ];

    const anemoneGeom = createAnemoneGeometry(THREE);
    const anemoneMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterClarity: { value: 0.90 },
        uCausticsIntensity: { value: 1.0 }
      },
      vertexShader: `
        precision highp float;
        attribute vec3 aTentacle; // id, heightFrac, radial
        attribute vec4 aAnemoneData; // phase, squish, palette, scale
        varying vec3 vTentacle;
        varying float vPalette;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;

        void main() {
          vTentacle = aTentacle;
          vPalette = aAnemoneData.z;
          float phase = aAnemoneData.x;
          float squish = aAnemoneData.y;
          float f = aTentacle.y;
          float tid = aTentacle.x;

          vec3 p = position;
          // Gentle current & swell sway + reactive squish when brushed
          float swayX = sin(uTime * 2.1 + phase + tid * 3.7 - f * 2.2) * 0.14 * f * f;
          float swayY = cos(uTime * 1.8 + phase * 1.3 + tid * 2.9 - f * 2.0) * 0.14 * f * f;
          p.x = p.x * (1.0 + squish * 0.22) + swayX;
          p.y = p.y * (1.0 + squish * 0.22) + swayY;
          p.z *= (1.0 - squish * 0.38);

          vec4 wp = instanceMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vTentacle;
        varying float vPalette;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;

        void main() {
          float f = vTentacle.y;
          vec3 baseCol = mix(vec3(0.42, 0.16, 0.38), vec3(0.16, 0.46, 0.52), smoothstep(0.2, 0.8, vPalette));
          vec3 midCol = mix(vec3(0.88, 0.36, 0.64), vec3(0.28, 0.84, 0.76), vPalette);
          vec3 tipCol = mix(vec3(1.0, 0.72, 0.92), vec3(0.76, 1.0, 0.88), vPalette);

          vec3 col = mix(baseCol, midCol, smoothstep(0.0, 0.65, f));
          col = mix(col, tipCol, smoothstep(0.68, 0.98, f));

          vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
          float diff = 0.55 + 0.45 * max(0.0, dot(normalize(vNormal), lightDir));
          col *= diff;

          // Bioluminescent / translucent rim & caustic dappling
          float cWave = sin(vWorldPos.x * 3.6 + uTime * 2.2) * cos(vWorldPos.y * 3.6 - uTime * 1.9);
          float caustic = pow(max(0.0, cWave), 2.2) * uCausticsIntensity;
          col += vec3(0.55, 0.96, 1.0) * caustic * 0.28;

          float subDepth = clamp(-vWorldPos.z * 0.35, 0.0, 1.5);
          vec3 waterTint = vec3(0.06, 0.62, 0.72);
          float fog = (1.0 - exp(-subDepth * 0.25)) * (1.0 - uWaterClarity * 0.68);
          col = mix(col, waterTint, clamp(fog, 0.0, 0.65));

          gl_FragColor = vec4(col, 0.95);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    const anemoneDataArray = new Float32Array(ANEMONE_SPOTS.length * 4);
    const anemoneDataAttr = new THREE.InstancedBufferAttribute(anemoneDataArray, 4).setUsage(THREE.DynamicDrawUsage);
    anemoneGeom.setAttribute("aAnemoneData", anemoneDataAttr);

    const anemoneMesh = new THREE.InstancedMesh(anemoneGeom, anemoneMat, ANEMONE_SPOTS.length);
    anemoneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    anemoneMesh.frustumCulled = false;
    anemoneMesh.renderOrder = 2;
    scene.add(anemoneMesh);

    // ------------------------------------------------------------------------
    // 2. INSTANCED FISH SYSTEM (Silver School, Reef Fish, Clownfish, Streaming School)
    // ------------------------------------------------------------------------
    const fishGeom = createFishGeometry(THREE);
    const fishStateArray = new Float32Array(MAX_FISH_INSTANCES * 4); // phase, kind, bend, scale
    const fishStateAttr = new THREE.InstancedBufferAttribute(fishStateArray, 4).setUsage(THREE.DynamicDrawUsage);
    fishGeom.setAttribute("aFishState", fishStateAttr);

    const fishMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterClarity: { value: 0.90 },
        uCausticsIntensity: { value: 1.0 }
      },
      vertexShader: `
        precision highp float;
        attribute vec4 aFishState; // phase, kind, bend, shimmer
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec4 vFishState;

        void main() {
          vLocalPos = position;
          vFishState = aFishState;
          float phase = aFishState.x;
          float kind = aFishState.y;
          float bend = aFishState.z;

          vec3 p = position;
          vec3 n = normal;
          bool isSilver = (kind < 0.5 || (kind > 3.5 && kind < 4.5));
          if (isSilver) {
            // Balanced, elegant slender willow-leaf / blade profile
            p.y *= 1.10; // Moderate 10% length extension
            p.x *= 0.52; // Compressed laterally for sleek flat profile
            p.z *= 0.80; // Flatter dorsal-ventral depth
            n.y /= 1.10;
            n.x /= 0.52;
            n.z /= 0.80;
            n = normalize(n);
          }

          // Travelling wave undulation from head (+Y) to tail (-Y)
          float aft = clamp((0.65 - p.y) / 1.75, 0.0, 1.2);
          float wave = sin(phase - aft * 4.2) * aft * aft * 0.22 + bend * aft * aft * 0.35;
          p.x += wave;

          vec4 wp = instanceMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(instanceMatrix) * n);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec4 vFishState;

        uniform float uTime;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;

        void main() {
          vec3 p = vLocalPos;
          float kind = vFishState.y;
          vec3 n = normalize(vWorldNormal);
          if (!gl_FrontFacing) n = -n;

          vec3 col = vec3(0.8);
          float dorsal = smoothstep(-0.12, 0.16, p.z);

          bool isSilver = (kind < 0.5 || (kind > 3.5 && kind < 4.5));
          if (isSilver) {
            // KIND 0 & 4: SILVER SCHOOLING FISH (银色鱼群 / 鱼群穿境 — Genuine Metallic Liquid Silver)
            vec3 bellySilver = vec3(0.85, 0.88, 0.92);
            vec3 spineSteel = vec3(0.42, 0.49, 0.56);
            float lateralLine = exp(-pow((p.z - 0.02) / 0.05, 2.0));
            float dorsalCurve = smoothstep(-0.06, 0.20, p.z);
            float flankReflect = smoothstep(0.18, -0.05, abs(p.z - 0.01));

            // Silver metal base: contrasting steel spine with high-reflectance silver flank
            col = mix(bellySilver, spineSteel, dorsalCurve * 0.72);
            col = mix(col, vec3(0.96, 0.98, 1.0), lateralLine * 0.42 + flankReflect * 0.15);
          } else if (kind < 1.5) {
            // KIND 1: REEF FISH A — Royal Blue Tang / Gold-tail Damselfish
            vec3 cobalt = mix(vec3(0.06, 0.38, 0.88), vec3(0.04, 0.18, 0.52), dorsal);
            vec3 goldTail = vec3(1.0, 0.82, 0.16);
            float tailMask = smoothstep(-0.28, -0.68, p.y);
            float dorsalRim = smoothstep(0.16, 0.28, p.z);
            col = mix(cobalt, goldTail, clamp(tailMask + dorsalRim * 0.65, 0.0, 1.0));
          } else if (kind < 2.5) {
            // KIND 2: REEF FISH B — Tropical Butterflyfish (Sunburst Gold & Coral)
            vec3 warmGold = vec3(1.0, 0.78, 0.24);
            vec3 coralRose = vec3(0.96, 0.36, 0.42);
            float chevrons = 0.5 + 0.5 * sin(p.y * 22.0 + abs(p.z) * 14.0);
            float eyeBand = exp(-pow((p.y - 0.58) / 0.10, 2.0));
            col = mix(warmGold, coralRose, smoothstep(-0.4, 0.4, p.y) * 0.65 + chevrons * 0.22);
            col = mix(col, vec3(0.08, 0.10, 0.14), eyeBand * 0.85);
          } else if (kind < 3.5) {
            // KIND 3: REEF FISH C — Lagoon Moorish Idol / Emerald Bannerfish
            vec3 cream = vec3(0.96, 0.98, 0.92);
            vec3 turquoise = vec3(0.12, 0.82, 0.76);
            vec3 darkBand = vec3(0.08, 0.14, 0.20);
            float b1 = exp(-pow((p.y - 0.42) / 0.14, 2.0));
            float b2 = exp(-pow((p.y + 0.18) / 0.16, 2.0));
            col = mix(cream, turquoise, dorsal * 0.75);
            col = mix(col, darkBand, clamp(b1 + b2, 0.0, 0.88));
          } else {
            // KIND 5: CLOWNFISH (海葵小丑鱼 — Tangerine Orange + 3 White Bands with Black Rims)
            vec3 tangerine = mix(vec3(1.0, 0.42, 0.06), vec3(0.88, 0.28, 0.03), dorsal * 0.5);
            vec3 pureWhite = vec3(0.98, 0.99, 1.0);
            vec3 jetBlack = vec3(0.05, 0.06, 0.08);

            float d1 = abs(p.y - 0.46 + p.z * 0.12);
            float d2 = abs(p.y + 0.04 + sin(p.z * 8.0) * 0.04);
            float d3 = abs(p.y + 0.56);
            float bandDist = min(d1, min(d2, d3));

            float whiteStripe = 1.0 - smoothstep(0.055, 0.085, bandDist);
            float blackEdge = (1.0 - smoothstep(0.080, 0.118, bandDist)) * (1.0 - whiteStripe);
            float finTip = smoothstep(-0.78, -0.98, p.y) + smoothstep(0.22, 0.32, abs(p.x));

            col = tangerine;
            col = mix(col, jetBlack, clamp(blackEdge * 0.92 + finTip * 0.75, 0.0, 1.0));
            col = mix(col, pureWhite, whiteStripe);
          }

          // Eye spot near +Y nose
          float eyeDist = length(vec2(p.y - 0.68, p.z - 0.04));
          float eyeMask = (1.0 - smoothstep(0.045, 0.075, eyeDist)) * step(0.03, abs(p.x));
          col = mix(col, vec3(0.04, 0.05, 0.07), eyeMask);

          vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
          vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
          float diff = max(0.32, dot(n, lightDir));

          if (isSilver) {
            // Metallic Lighting: controlled diffuse, sharp metallic specular + Fresnel chrome rim reflection
            vec3 viewDir = normalize(vec3(0.0, 1.0, 0.15));
            vec3 specHalf = normalize(lightDir + viewDir);
            float ndh = max(0.0, dot(n, specHalf));
            float sharpSpec = pow(ndh, 38.0) * 0.95; // Crisp metallic gleam
            float broadSpec = pow(ndh, 10.0) * 0.32; // Soft metallic surface sheen
            float fresnel = pow(1.0 - max(0.0, dot(n, vec3(0.0, 1.0, 0.0))), 2.4);

            vec3 skyReflect = vec3(0.88, 0.93, 0.98);
            col = col * (0.44 + 0.45 * diff) + skyReflect * (fresnel * 0.45 + broadSpec) + vec3(1.0, 1.0, 1.0) * sharpSpec;
          } else {
            float spec = pow(max(0.0, dot(n, halfVec)), 28.0) * 0.32;
            col = col * (0.52 + 0.55 * diff) + vec3(0.92, 0.98, 1.0) * spec;
          }

          // Underwater Voronoi caustic shimmer on fish backs
          float cWave = sin(vWorldPos.x * 3.8 + uTime * 2.4) * cos(vWorldPos.y * 3.8 - uTime * 2.1);
          float caustic = pow(max(0.0, cWave), 2.4) * max(0.0, n.z) * uCausticsIntensity;
          vec3 causticTint = isSilver ? vec3(0.85, 0.95, 1.0) : vec3(0.48, 0.95, 1.0);
          col += causticTint * caustic * (isSilver ? 0.28 : 0.36);

          float subDepth = clamp(-vWorldPos.z * 0.3, 0.0, 1.5);
          vec3 waterCol = vec3(0.07, 0.68, 0.74);
          float fog = (1.0 - exp(-subDepth * 0.22)) * (1.0 - uWaterClarity * 0.68) * (isSilver ? 0.45 : 1.0);
          col = mix(col, waterCol, clamp(fog, 0.0, 0.65));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide
    });

    const fishMesh = new THREE.InstancedMesh(fishGeom, fishMat, MAX_FISH_INSTANCES);
    fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fishMesh.count = 0;
    fishMesh.frustumCulled = false;
    fishMesh.renderOrder = 3;
    scene.add(fishMesh);

    // ------------------------------------------------------------------------
    // 3. BLACKTIP REEF SHARKS (黑鳍礁鲨)
    // ------------------------------------------------------------------------
    const sharkGeom = createSharkGeometry(THREE);
    const sharkVertexShader = `
      attribute float fin;
      uniform float stroke, turn, clock;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying float vIsFin;

      vec3 deform(vec3 orig) {
        vec3 p = orig;
        float aft = clamp((0.55 - p.y) / 2.25, 0.0, 1.25);
        float wave = sin(stroke - aft * 3.2) * aft * aft * 0.26 - turn * aft * aft * 0.32;
        p.x += wave;
        return p;
      }

      void main() {
        vec3 p = deform(position);
        vLocalP = position;
        vIsFin = fin;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldP = wp.xyz;
        vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;

    const sharkFragmentShader = `
      precision highp float;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying float vIsFin;
      uniform float clock, uWaterClarity, uCausticsIntensity;

      void main() {
        vec3 p = vLocalP;
        vec3 n = normalize(vWorldN);
        if (!gl_FrontFacing) n = -n;

        // Counter-shaded reef shark bronze-grey back & pale cream belly
        vec3 belly = vec3(0.88, 0.89, 0.86);
        vec3 dorsalCol = vec3(0.34, 0.39, 0.40);
        vec3 c = mix(belly, dorsalCol, smoothstep(-0.10, 0.14, p.z));

        // Characteristic white sub-terminal band + jet-black fin tips!
        float dorsalTip = smoothstep(0.46, 0.58, p.z) * step(0.5, vIsFin);
        float pectoralTip = smoothstep(0.68, 0.84, abs(p.x)) * step(0.5, vIsFin);
        float tailTip = smoothstep(0.32, 0.44, abs(p.z)) * step(1.5, vIsFin);
        float blackTipMask = clamp(dorsalTip + pectoralTip + tailTip, 0.0, 1.0);
        float whiteHalo = smoothstep(0.34, 0.46, p.z) * (1.0 - dorsalTip) * step(0.5, vIsFin) * (1.0 - step(1.5, vIsFin));

        c = mix(c, vec3(0.95, 0.96, 0.94), whiteHalo * 0.55);
        c = mix(c, vec3(0.04, 0.05, 0.06), blackTipMask * 0.95);

        // Eyes & 5 gill slits
        float eye = length(vec2((abs(p.x) - 0.14) * 1.4, p.y - 1.08));
        float eyeMask = (1.0 - smoothstep(0.018, 0.032, eye)) * step(-0.02, p.z) * (1.0 - step(0.5, vIsFin));
        c = mix(c, vec3(0.02, 0.03, 0.04), eyeMask);

        float gillZone = smoothstep(0.45, 0.52, p.y) * smoothstep(0.76, 0.68, p.y) * smoothstep(0.05, 0.22, abs(p.x));
        float gills = step(0.68, sin(p.y * 85.0)) * gillZone * (1.0 - step(0.5, vIsFin));
        c *= 1.0 - gills * 0.38;

        vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
        float diff = max(0.32, dot(n, lightDir));
        vec3 result = c * (0.54 + 0.50 * diff);

        float cWave = sin(vWorldP.x * 3.2 + clock * 2.2) * cos(vWorldP.y * 3.2 - clock * 1.9);
        float caustic = pow(max(0.0, cWave), 2.4) * max(0.0, n.z) * uCausticsIntensity;
        result += vec3(0.48, 0.95, 1.0) * caustic * 0.30;

        float subDepth = clamp(-vWorldP.z * 0.28, 0.0, 1.5);
        vec3 waterTint = vec3(0.06, 0.62, 0.70);
        float fog = (1.0 - exp(-subDepth * 0.22)) * (1.0 - uWaterClarity * 0.68);
        result = mix(result, waterTint, clamp(fog, 0.0, 0.65));

        gl_FragColor = vec4(result, 1.0);
      }
    `;

    const sharkSlots = Array.from({ length: MAX_SHARKS }, () => {
      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          stroke: { value: 0 },
          turn: { value: 0 },
          clock: { value: 0 },
          uWaterClarity: { value: 0.90 },
          uCausticsIntensity: { value: 1.0 }
        },
        vertexShader: sharkVertexShader,
        fragmentShader: sharkFragmentShader
      });
      const mesh = new THREE.Mesh(sharkGeom, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      return { mesh, mat };
    });

    // ------------------------------------------------------------------------
    // 3.5 GREEN SEA TURTLES (绿海龟)
    // ------------------------------------------------------------------------
    const turtleGeom = createTurtleGeometry(THREE);
    const turtleVertexShader = `
      attribute vec4 aPart;
      attribute vec2 aScute;
      uniform float stroke, turn, clock;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying vec4 vPart;
      varying vec2 vScute;

      vec3 deformTurtle(vec3 orig, vec4 part) {
        float partId = part.x;
        float span = part.y;
        float chord = part.z;
        float side = part.w;
        vec3 pos = orig;

        if (partId < 0.8) {
          float heave = sin(stroke) * 0.022;
          float pitchWobble = cos(stroke) * 0.032;
          pos.z += heave;
          pos.z += pos.y * pitchWobble;
          pos.y -= pos.z * pitchWobble;
        } else if (partId < 1.5) {
          float lookTurn = turn * 0.35;
          float headBob = sin(stroke - 0.5) * 0.038;
          pos.x += (pos.y - 0.24) * lookTurn;
          pos.z += headBob;
        } else if (partId < 2.5) {
          float flipperSpan = span;
          float spanPow = pow(clamp(flipperSpan, 0.0, 1.0), 1.22);
          float turnFactor = 1.0 + side * turn * 0.45;
          float flapPhase = stroke - spanPow * 0.72;
          float flapAngle = sin(flapPhase) * 0.45 * turnFactor;
          float featherAngle = cos(flapPhase) * 0.24;

          float shoulderX = side * 0.21;
          float shoulderY = 0.21;
          float shoulderZ = -0.02;

          vec3 rel = pos - vec3(shoulderX, shoulderY, shoulderZ);

          float cosF = cos(flapAngle * side);
          float sinF = sin(flapAngle * side);
          float rx = rel.x * cosF - rel.z * sinF;
          float rz = rel.x * sinF + rel.z * cosF;

          float cosP = cos(featherAngle * spanPow);
          float sinP = sin(featherAngle * spanPow);
          float ry = rel.y * cosP - rz * sinP;
          rz = rel.y * sinP + rz * cosP;

          pos = vec3(shoulderX, shoulderY, shoulderZ) + vec3(rx, ry, rz);
        } else if (partId < 3.5) {
          float steer = turn * 0.42 + sin(stroke * 0.8 + 1.2) * 0.14;
          float hipX = side * 0.16;
          float hipY = -0.54;
          float hipZ = -0.04;
          vec3 rel = pos - vec3(hipX, hipY, hipZ);

          float cosS = cos(steer * side);
          float sinS = sin(steer * side);
          float rx = rel.x * cosS - rel.z * sinS;
          float rz = rel.x * sinS + rel.z * cosS;
          pos = vec3(hipX, hipY, hipZ) + vec3(rx, rel.y, rz);
        } else {
          float tailWag = -turn * 0.32 + sin(stroke) * 0.05;
          pos.x += tailWag * (orig.y - (-0.65));
        }

        return pos;
      }

      void main() {
        vec3 p = deformTurtle(position, aPart);
        vLocalP = position;
        vPart = aPart;
        vScute = aScute;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldP = wp.xyz;
        vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;

    const turtleFragmentShader = `
      precision highp float;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying vec4 vPart;
      varying vec2 vScute;
      uniform float clock, uWaterClarity, uCausticsIntensity;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      vec2 voronoi2D(vec2 p) {
        vec2 n = floor(p);
        vec2 f = fract(p);
        float md = 8.0;
        float md2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(17.1, 31.7)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md2 = md;
              md = d;
            } else if (d < md2) {
              md2 = d;
            }
          }
        }
        return vec2(sqrt(md), sqrt(md2));
      }

      void main() {
        vec3 p = vLocalP;
        vec3 n = normalize(vWorldN);
        if (!gl_FrontFacing) n = -n;

        float partId = vPart.x;
        float span = vPart.y;
        float chord = vPart.z;
        float side = vPart.w;

        vec3 baseColor = vec3(0.18, 0.22, 0.12);
        float roughness = 0.35;

        // 1. CARAPACE (Back Shell) - Realistic Green Sea Turtle (Chelonia mydas) from 3-view reference
        if (partId < 0.25) {
          roughness = 0.26; // wet, organic keratin surface sheen
          float u = vScute.x;
          float v = vScute.y;

          // Colors accurately sampled from the realistic 3-view photograph:
          vec3 darkEspresso  = vec3(0.23, 0.18, 0.12); // deep rich chocolate/espresso ground
          vec3 honeyAmber    = vec3(0.63, 0.46, 0.24); // warm honey amber plate body
          vec3 sunCaramel    = vec3(0.82, 0.63, 0.33); // radiant caramel gold rays & marbling
          vec3 sutureIvory   = vec3(0.87, 0.80, 0.59); // fine pale ivory-gold suture lines
          vec3 sutureShadow  = vec3(0.14, 0.10, 0.06); // deep groove shadow flanking sutures
          vec3 marginalGold  = vec3(0.88, 0.78, 0.48); // outer marginal rim edge

          // Normalized longitudinal axis: 0.0 at tail, 1.0 at neck
          float vNorm = clamp((v + 1.0) * 0.5, 0.0, 1.0);
          float midDist = abs(u);

          // A. VERTEBRAL SCUTES (5 Hexagonal shield plates along the spine)
          float vertCoord = vNorm * 5.0 - 0.08;
          float vertIdx = clamp(floor(vertCoord), 0.0, 4.0);
          float vertFrac = fract(vertCoord);
          
          float hexBulge = sin(vertFrac * 3.14159265);
          float vertWidth = 0.16 + 0.070 * hexBulge - 0.035 * (1.0 - vNorm);
          float isVertebral = 1.0 - smoothstep(vertWidth - 0.03, vertWidth + 0.03, midDist);

          // Transverse seam: forward-pointing chevron arch
          float vertChevron = 0.042 * (1.0 - midDist / max(0.01, vertWidth));
          float vertSeamDist = abs(vertFrac - vertChevron);
          vertSeamDist = min(vertSeamDist, 1.0 - vertSeamDist);
          float vertSeam = smoothstep(0.038, 0.008, vertSeamDist);

          // B. COSTAL SCUTES (4 pairs of lateral plates sweeping backward in smooth hydrodynamic arcs)
          float dOut = max(0.0, midDist - 0.12);
          float backwardSweep = (0.28 + 0.16 * (1.0 - vNorm)) * pow(dOut, 1.30);
          float costalV = vNorm + backwardSweep;
          float costalCoord = costalV * 4.0 - 0.05;
          float costalIdx = clamp(floor(costalCoord), 0.0, 3.0);
          float costalFrac = fract(costalCoord);
          float costalSeamDist = abs(costalFrac - 0.5);
          float costalSeam = smoothstep(0.038, 0.008, costalSeamDist);

          // C. SUTURE GROOVES
          float lateralSeamDist = abs(midDist - vertWidth);
          float lateralSeam = smoothstep(0.038, 0.008, lateralSeamDist);

          float activeTransverseSeam = mix(costalSeam, vertSeam, isVertebral);
          float sutureMask = clamp(activeTransverseSeam + lateralSeam, 0.0, 1.0);
          float minSeamDist = min(lateralSeamDist, mix(costalSeamDist, vertSeamDist, isVertebral));

          // D. NATURAL RADIATING MARBLING & GROWTH RINGS (Symmetrical, organic tiger rays)
          float scuteSide = u >= 0.0 ? 1.0 : -1.0;
          vec2 costalNucleus = vec2(scuteSide * (0.18 + 0.05 * costalIdx), ((costalIdx + 0.75) / 4.0) * 2.0 - 1.0);
          vec2 vertNucleus = vec2(0.0, ((vertIdx + 0.5) / 5.0) * 2.0 - 1.0);

          float rayAngle = 0.0;
          float scuteDist = 0.0;
          if (isVertebral > 0.5) {
            vec2 rVec = vec2(midDist, v - vertNucleus.y);
            rayAngle = atan(rVec.y, max(0.001, rVec.x));
            scuteDist = length(rVec);
          } else {
            vec2 rVec = vec2((u - costalNucleus.x) * scuteSide, v - costalNucleus.y);
            rayAngle = atan(rVec.y - 0.16 * max(0.0, rVec.x), max(0.001, rVec.x));
            scuteDist = length(rVec);
          }

          // Radiating fan rays
          float fanRays = cos(rayAngle * 4.0) * 0.5 + 0.5;
          fanRays = smoothstep(0.15, 0.85, fanRays);

          // Organic concentric growth rings (keratin ridges)
          float growthRings = sin(scuteDist * 42.0) * 0.5 + 0.5;

          // Radial fade from deep nucleus out toward plate borders
          float radialFade = smoothstep(0.03, 0.40, scuteDist);
          vec3 plateColor = mix(darkEspresso, honeyAmber, radialFade * 0.58);
          plateColor = mix(plateColor, sunCaramel, fanRays * radialFade * 0.70 + growthRings * 0.08);

          // Plate perimeter halo:
          float scuteMargin = smoothstep(0.11, 0.02, minSeamDist);
          plateColor = mix(plateColor, sunCaramel * 1.05, scuteMargin * 0.45);

          // E. MARGINAL RIM (24 oval-rim marginal scutes with pale golden edge)
          float isMarginal = smoothstep(0.77, 0.88, span);
          float rimAngle = atan(v, u * 1.08);
          float marginalSeamDist = abs(fract(rimAngle * (24.0 / 6.2831853)) - 0.5);
          float marginalSeam = smoothstep(0.05, 0.01, marginalSeamDist);
          vec3 rimColor = mix(marginalGold, darkEspresso * 0.85, marginalSeam * 0.60);
          baseColor = mix(plateColor, rimColor, isMarginal * 0.95);

          // F. REALISTIC 3D SUTURE RELIEF (Narrow groove shadow with fine pale ivory-gold line in center)
          float sutureGroove = smoothstep(0.036, 0.008, minSeamDist);
          float sutureCore = smoothstep(0.012, 0.003, minSeamDist);
          vec3 sutureRelief = mix(sutureShadow, sutureIvory, sutureCore * 0.85);
          baseColor = mix(baseColor, sutureRelief, sutureMask * 0.95);
        }
        // 2. PLASTRON (Belly Shell) - Realistic Warm Pale Cream/Ivory
        else if (partId < 0.75) {
          roughness = 0.28;
          vec3 creamBelly = vec3(0.74, 0.75, 0.55);
          vec3 goldenSuture = vec3(0.65, 0.58, 0.38);
          float bellySuture = smoothstep(0.025, 0.0, abs(vScute.x)) * smoothstep(0.2, 0.8, span);
          float transBelly = smoothstep(0.025, 0.0, abs(fract(vScute.y * 2.5) - 0.5)) * step(0.15, span);
          baseColor = mix(creamBelly, goldenSuture, clamp(bellySuture + transBelly, 0.0, 0.45));
        }
        // 3. HEAD, BEAK, CHIN & EYES - Realistic Polygonal Mosaic Scales & Natural Eye
        else if (partId < 1.5) {
          roughness = 0.30;

          // Realistic polygonal scale tiles with pale grout channels
          vec2 vDist = voronoi2D(vec2(p.x * 24.0, (p.y - 0.22) * 22.0));
          float cellGrout = smoothstep(0.10, 0.02, vDist.y - vDist.x);
          vec3 scaleTile = mix(vec3(0.18, 0.14, 0.10), vec3(0.30, 0.22, 0.13), hash21(floor(vec2(p.x * 20.0, p.y * 18.0))));
          vec3 groutCol = vec3(0.74, 0.66, 0.44);
          vec3 headSkin = mix(scaleTile, groutCol, cellGrout * 0.88);

          // A. Lower Jaw & Chin: Smooth pale cream
          float isChin = smoothstep(0.02, -0.04, p.z) * smoothstep(0.30, 0.45, p.y);
          vec3 chinCream = vec3(0.78, 0.76, 0.58);
          headSkin = mix(headSkin, chinCream, isChin * 0.95);

          // B. Upper Beak Shield: Realistic horn/amber keratin
          float isBeak = smoothstep(0.52, 0.60, p.y);
          vec3 beakHorn = vec3(0.55, 0.44, 0.26);
          headSkin = mix(headSkin, beakHorn, isBeak * 0.82);

          // C. Neck wrinkles near shell
          float isNeck = smoothstep(0.34, 0.24, p.y);
          float wrinkle = sin(p.y * 50.0) * 0.5 + 0.5;
          vec3 neckSkin = mix(vec3(0.68, 0.58, 0.38), vec3(0.78, 0.76, 0.58), wrinkle * 0.5);
          headSkin = mix(headSkin, neckSkin, isNeck * 0.85);

          baseColor = headSkin;

          // D. Realistic green turtle eye (natural size, dark espresso iris, sharp specular highlight)
          float eyeDist = length(vec3((abs(p.x) - 0.105) * 1.0, (p.y - 0.46) * 1.15, (p.z - 0.022) * 1.0));
          if (eyeDist < 0.042) {
            roughness = 0.04;
            float eyeR = eyeDist / 0.042;
            vec3 eyelidCol = vec3(0.35, 0.26, 0.16);
            vec3 irisDark = vec3(0.18, 0.12, 0.07);
            vec3 pupilBlack = vec3(0.015, 0.015, 0.02);
            vec3 eyeCol = eyeR < 0.55 ? pupilBlack : (eyeR < 0.85 ? mix(irisDark, eyelidCol, smoothstep(0.70, 0.85, eyeR)) : eyelidCol);

            // Natural crisp specular catchlight
            vec2 eyeLocal = vec2(abs(p.x) - 0.105, p.z - 0.022);
            float sparkle = smoothstep(0.012, 0.004, length(eyeLocal - vec2(0.008, 0.010)));
            eyeCol = mix(eyeCol, vec3(1.0, 1.0, 1.0), sparkle);
            baseColor = eyeCol;
          }
        }
        // 4. FRONT WING FLIPPERS (Pectorals) - Realistic Polygonal Scales with Pale Channels
        else if (partId < 2.5) {
          roughness = 0.30;
          float scaleDensity = mix(12.0, 22.0, chord);
          vec2 vDist = voronoi2D(vec2(span * scaleDensity, chord * scaleDensity * 0.88));
          float cellGrout = smoothstep(0.10, 0.02, vDist.y - vDist.x);

          vec3 scaleTile = mix(vec3(0.15, 0.14, 0.10), vec3(0.24, 0.18, 0.11), span);
          vec3 groutCol = mix(vec3(0.72, 0.62, 0.38), vec3(0.68, 0.58, 0.35), chord);
          vec3 dorsalSkin = mix(scaleTile, groutCol, cellGrout * 0.85);

          // Pale leading edge border
          float isLeading = smoothstep(0.15, 0.0, chord);
          vec3 leadingTrim = vec3(0.76, 0.68, 0.44);
          dorsalSkin = mix(dorsalSkin, leadingTrim, isLeading * 0.65);

          float isDorsal = step(0.0, n.z);
          vec3 ventralSkin = vec3(0.76, 0.76, 0.58);
          baseColor = mix(ventralSkin, dorsalSkin, isDorsal);
        }
        // 5. REAR FLIPPERS & TAIL - Realistic Matching Scales
        else {
          roughness = 0.32;
          vec2 vDist = voronoi2D(vec2(span * 14.0, chord * 12.0));
          float cellGrout = smoothstep(0.10, 0.02, vDist.y - vDist.x);
          float isDorsal = step(0.0, n.z);
          vec3 scaleTile = vec3(0.16, 0.14, 0.10);
          vec3 groutCol = vec3(0.72, 0.62, 0.38);
          vec3 dorsalSkin = mix(scaleTile, groutCol, cellGrout * 0.82);
          vec3 ventralSkin = vec3(0.76, 0.76, 0.58);
          baseColor = mix(ventralSkin, dorsalSkin, isDorsal);
        }

        // Sunlight illumination & Soft wet sheen (zero sparkling chatter)
        vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
        float diff = max(0.0, dot(n, lightDir));
        vec3 viewDir = normalize(vec3(0.0, -0.2, 1.0));
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(0.0, dot(n, halfDir)), mix(14.0, 4.0, roughness)) * (1.0 - roughness);

        // High ambient floor (0.76) ensures turtles retain uniform, vibrant golden colors regardless of swimming heading
        vec3 result = baseColor * (0.76 + 0.26 * diff) + vec3(0.95, 0.95, 0.90) * spec * 0.24;

        // Gentle flowing tropical water caustics (soft & calm, no harsh flickering)
        float cWave = sin(vWorldP.x * 2.8 + clock * 1.5) * cos(vWorldP.y * 2.8 - clock * 1.2);
        float caustic = pow(max(0.0, cWave), 1.8) * max(0.0, n.z) * uCausticsIntensity;
        result += vec3(0.40, 0.90, 1.0) * caustic * 0.16;

        // Tropical turquoise water clarity & Depth fog (carapace protected from muddy cyan tinting)
        float subDepth = clamp(-vWorldP.z * 0.28, 0.0, 1.5);
        vec3 waterTint = vec3(0.06, 0.62, 0.70);
        float rawFog = (1.0 - exp(-subDepth * 0.20)) * (1.0 - uWaterClarity * 0.68);
        float fog = partId < 0.25 ? rawFog * 0.35 : rawFog;
        result = mix(result, waterTint, clamp(fog, 0.0, 0.35));

        gl_FragColor = vec4(result, 1.0);
      }
    `;

    const turtleSlots = Array.from({ length: MAX_TURTLES }, () => {
      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          stroke: { value: 0 },
          turn: { value: 0 },
          clock: { value: 0 },
          uWaterClarity: { value: 0.90 },
          uCausticsIntensity: { value: 1.0 }
        },
        vertexShader: turtleVertexShader,
        fragmentShader: turtleFragmentShader
      });
      const mesh = new THREE.Mesh(turtleGeom, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      return { mesh, mat };
    });

    // ------------------------------------------------------------------------
    // 4. STATE ARRAYS FOR FISH, SHARKS, TURTLES & STREAMING SCHOOL EVENT
    // ------------------------------------------------------------------------
    const schoolCenters = [
      { u: 0.44, v: 0.56, vx: 0.025, vy: 0.015 },
      { u: 0.68, v: 0.42, vx: -0.020, vy: 0.022 },
      { u: 0.54, v: 0.28, vx: 0.018, vy: -0.018 }
    ];

    const residentFish = [];
    const sharks = [];
    const turtles = [];
    let streamEvent = null;

    function randomSeaSpot(minDepth = 0.55) {
      for (let i = 0; i < 30; i++) {
        const u = 0.16 + Math.random() * 0.76;
        const v = 0.12 + Math.random() * 0.78;
        if (waterSystem.getUvBathymetry(u, v) > minDepth) return { u, v };
      }
      return { u: 0.58, v: 0.46 };
    }

    function createFish(group, options = {}) {
      let spot;
      const homeIndex = Math.floor(Math.random() * ANEMONE_SPOTS.length);
      if (options.u !== undefined && options.v !== undefined) {
        spot = { u: options.u, v: options.v };
      } else if (group === "clown") {
        const home = ANEMONE_SPOTS[homeIndex];
        spot = { u: home.u + (Math.random() - 0.5) * 0.04, v: home.v + (Math.random() - 0.5) * 0.04 };
      } else if (group === "silver") {
        const sc = schoolCenters[Math.floor(Math.random() * schoolCenters.length)];
        spot = { u: clamp(sc.u + (Math.random() - 0.5) * 0.14, 0.12, 0.92), v: clamp(sc.v + (Math.random() - 0.5) * 0.14, 0.10, 0.90) };
      } else {
        spot = randomSeaSpot(0.5);
      }

      const heading = options.heading !== undefined ? options.heading : Math.random() * TAU;
      const kind = group === "silver" ? 0 : group === "clown" ? 5 : 1 + Math.floor(Math.random() * 3);

      return {
        group,
        kind,
        u: spot.u,
        v: spot.v,
        z: options.z !== undefined ? options.z : (group === "clown" ? -1.15 : group === "reef" ? -0.95 : -0.68),
        vx: Math.sin(heading) * 0.06,
        vy: Math.cos(heading) * 0.06,
        vz: options.vz || 0,
        heading,
        pitch: 0,
        roll: 0,
        bend: 0,
        phase: Math.random() * TAU,
        seed: Math.random() * TAU,
        size: (group === "silver" ? 0.28 : group === "clown" ? 0.32 : 0.35) * (0.9 + Math.random() * 0.22),
        schoolId: Math.floor(Math.random() * schoolCenters.length),
        homeIndex,
        excited: options.excited || 0,
        airborne: !!options.airborne
      };
    }

    function createShark(options = {}) {
      const spot = options.u !== undefined && options.v !== undefined
        ? { u: options.u, v: options.v }
        : randomSeaSpot(0.85);
      const heading = options.heading !== undefined ? options.heading : Math.random() * TAU;
      return {
        u: spot.u,
        v: spot.v,
        z: options.z !== undefined ? options.z : -0.75,
        vz: options.vz || 0,
        heading,
        targetHeading: heading,
        speed: 1.55,
        baseSpeed: 1.55,
        stroke: Math.random() * TAU,
        turn: 0,
        roll: 0,
        pitch: 0,
        scale: 0.78 + Math.random() * 0.12,
        seed: Math.random() * TAU,
        excited: 0,
        wakeTimer: 0,
        airborne: !!options.airborne
      };
    }

    function createTurtle(options = {}) {
      const spot = options.u !== undefined && options.v !== undefined
        ? { u: options.u, v: options.v }
        : randomSeaSpot(0.65);
      const heading = options.heading !== undefined ? options.heading : Math.random() * TAU;
      return {
        u: spot.u,
        v: spot.v,
        z: options.z !== undefined ? options.z : -0.62,
        vz: options.vz || 0,
        heading,
        targetHeading: heading,
        speed: 0.72,
        baseSpeed: 0.72,
        stroke: Math.random() * TAU,
        turn: 0,
        roll: 0,
        pitch: 0,
        scale: 1.48 + Math.random() * 0.18,
        seed: Math.random() * TAU,
        excited: 0,
        glideTimer: 1.5 + Math.random() * 2.0,
        isGliding: false,
        diveTimer: 12 + Math.random() * 20,
        targetDepth: -0.62,
        wakeTimer: 0,
        airborne: !!options.airborne,
        offscreenTimer: 0
      };
    }

    function syncCounts(settings) {
      const targets = {
        silver: Math.round(clamp(settings.silverCount ?? 72, 0, 160)),
        reef: Math.round(clamp(settings.reefCount ?? 12, 0, 36)),
        clown: Math.round(clamp(settings.clownCount ?? 6, 0, 18))
      };

      for (const group of ["silver", "reef", "clown"]) {
        let current = residentFish.filter((f) => f.group === group).length;
        while (current < targets[group] && residentFish.length < MAX_RESIDENT_FISH) {
          residentFish.push(createFish(group));
          current++;
        }
        while (current > targets[group]) {
          const idx = residentFish.findLastIndex((f) => f.group === group);
          if (idx === -1) break;
          residentFish.splice(idx, 1);
          current--;
        }
      }

      const targetSharks = Math.round(clamp(settings.sharkCount ?? 2, 0, MAX_SHARKS));
      while (sharks.length < targetSharks) {
        sharks.push(createShark());
      }
      while (sharks.length > targetSharks) {
        sharks.pop();
      }

      const targetTurtles = Math.round(clamp(settings.turtleCount ?? 2, 0, MAX_TURTLES));
      while (turtles.length < targetTurtles) {
        turtles.push(createTurtle());
      }
      while (turtles.length > targetTurtles) {
        turtles.pop();
      }
    }

    function throwFishFromDock(species, startU, startV, endU, endV, settings) {
      const aspect = waterSystem.getAspect();
      if (species === "silver") {
        if ((settings.silverCount ?? 72) >= 160) return false;
        settings.silverCount = Math.min(160, (settings.silverCount ?? 72) + 12);
        for (let i = 0; i < 12 && residentFish.length < MAX_RESIDENT_FISH; i++) {
          const angle = i * 2.39996;
          const spread = Math.sqrt(i / 12) * 0.045;
          const targetU = clamp(endU + (Math.cos(angle) * spread) / aspect, 0.08, 0.92);
          const targetV = clamp(endV + Math.sin(angle) * spread, 0.08, 0.92);
          const duration = 0.88 + i * 0.024;
          const fish = createFish("silver", {
            u: startU + (Math.random() - 0.5) * 0.03,
            v: startV,
            z: 2.2,
            airborne: true,
            excited: 2.0
          });
          fish.flight = {
            elapsed: 0,
            duration,
            startU: fish.u,
            startV: fish.v,
            endU: targetU,
            endV: targetV,
            splash: i === 0 || i === 5 || i === 11
          };
          fish.heading = Math.atan2((targetU - fish.u) * aspect, targetV - fish.v);
          fish.pitch = 0.55;
          residentFish.push(fish);
        }
        return true;
      }
      if (species === "reef" || species === "clown") {
        const key = species === "reef" ? "reefCount" : "clownCount";
        const cap = species === "reef" ? 36 : 18;
        if ((settings[key] ?? (species === "reef" ? 12 : 6)) >= cap) return false;
        settings[key] = Math.min(cap, (settings[key] ?? (species === "reef" ? 12 : 6)) + 1);
        const duration = 0.92;
        const fish = createFish(species, {
          u: startU,
          v: startV,
          z: 2.3,
          airborne: true,
          excited: 2.4
        });
        fish.flight = {
          elapsed: 0,
          duration,
          startU,
          startV,
          endU,
          endV,
          splash: true
        };
        fish.heading = Math.atan2((endU - startU) * aspect, endV - startV);
        fish.pitch = 0.55;
        residentFish.push(fish);
        return true;
      }
      if (species === "shark") {
        if (sharks.length >= MAX_SHARKS) sharks.shift();
        settings.sharkCount = Math.min(MAX_SHARKS, (settings.sharkCount ?? 2) + 1);
        const duration = 1.05;
        const s = createShark({
          u: startU,
          v: startV,
          z: 2.5,
          airborne: true,
          excited: 2.5
        });
        s.flight = {
          elapsed: 0,
          duration,
          startU,
          startV,
          endU,
          endV,
          splash: true
        };
        s.heading = Math.atan2((endU - startU) * aspect, endV - startV);
        s.pitch = 0.50;
        sharks.push(s);
        return true;
      }
      if (species === "turtle") {
        if (turtles.length >= MAX_TURTLES) turtles.shift();
        settings.turtleCount = Math.min(MAX_TURTLES, (settings.turtleCount ?? 2) + 1);
        const duration = 1.05;
        const t = createTurtle({
          u: startU,
          v: startV,
          z: 2.4,
          airborne: true,
          excited: 2.5
        });
        t.flight = {
          elapsed: 0,
          duration,
          startU,
          startV,
          endU,
          endV,
          splash: true
        };
        t.heading = Math.atan2((endU - startU) * aspect, endV - startV);
        t.pitch = 0.45;
        turtles.push(t);
        return true;
      }
      return false;
    }

    function spawnFromDock(species, u, v, settings, options = {}) {
      if (typeof options === "boolean") {
        options = { airborne: options };
      }
      const startU = options.startU !== undefined ? options.startU : u;
      const startV = options.startV !== undefined ? options.startV : 0.06;
      return throwFishFromDock(species, startU, startV, u, v, settings);
    }

    // ========================================================================
    // Dynamic Multi-Branch Procedural Migration Routes & Oceanic Tour System
    // ========================================================================
    // Matches User's Exact Mental Model:
    // 1. Offscreen Entry: Fish school swims into the screen from OUTSIDE the screen
    //    (North v > 1.25, East u > 1.25, or South v < -0.25) at full normal size (no growing from small to big).
    // 2. Multi-Maneuver Oceanic Expedition: Not a fixed figure-8; each event is a completely
    //    randomized procedural sequence of:
    //    - 大圈环绕 (Big Loops): expansive sweeping turns (R ~ 0.24-0.30, sweep 270-360 deg)
    //    - 宝字环绕 (Jewel Swirls): compact ornamental swirls in reef pockets (R ~ 0.11-0.15)
    //    - 一字边边巡弋 (Edge Cruises): straight border cruises (length 0.40-0.75) and edge corners
    //    - 跨洋穿梭 (Diagonal Traverses): cutting across open lagoon sectors
    // 3. Divergent Branching: 2 to 4 branches with opposing turn directions and unique maneuver chains.
    // 4. Smooth Offscreen Exit: Steers naturally outward to exit off-screen.
    function normalizeAngle(a) {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    }

    function getExactBeachDistance(u, v) {
      const dx = u;
      const dy = (1.0 - v) * 1.35;
      const radial = Math.hypot(dx, dy);
      return radial - 0.34;
    }

    // Resample waypoints with exact uniform spacing (0.20 chord length)
    function resampleWaypointsUniform(waypoints, step = 0.20, aspect = 1.777) {
      if (!waypoints || waypoints.length < 2) return waypoints || [];
      const res = [waypoints[0]];
      let accum = 0;
      let cur = waypoints[0];

      for (let i = 1; i < waypoints.length; i++) {
        const next = waypoints[i];
        let segDist = Math.hypot((next.u - cur.u) * aspect, next.v - cur.v);
        if (segDist < 0.0001) continue;

        while (accum + segDist >= step) {
          const remain = step - accum;
          const frac = remain / segDist;
          const u = cur.u + (next.u - cur.u) * frac;
          const v = cur.v + (next.v - cur.v) * frac;
          const pt = { u, v };
          res.push(pt);
          cur = pt;
          segDist = Math.hypot((next.u - cur.u) * aspect, next.v - cur.v);
          accum = 0;
        }
        accum += segDist;
        cur = next;
      }
      if (accum > 0.06) {
        res.push(waypoints[waypoints.length - 1]);
      }
      return res;
    }

    // ========================================================================
    // Dynamic Three-Tier Procedural Migration Routes & Oceanic Tour System
    // ========================================================================
    // Implements User's Exact Tour Hierarchy:
    // 1. 大环游 (Grand Ocean Tour - 65% Highest Probability):
    //    Sweeps almost the ENTIRE ocean (大半个海域甚至整个海域，画一个类似于圆圈或椭圆).
    //    Encompasses u in [0.42, 0.94] and v in [0.10, 0.90], sweeping across:
    //    - Northern shelf above reef corals (v ~ 0.88)
    //    - Eastern deep ocean border (u ~ 0.94)
    //    - Southern deep trench abyss (v ~ 0.12)
    //    - Western canyon dropoff framing beach (u ~ 0.42)
    // 2. 中环游 (Medium Tour - 25% Probability):
    //    Sweeps half of the ocean (大概就是半个海域: North half or South half, u in [0.48, 0.94], v in [0.38, 0.90])
    // 3. 小环游 / 七七八八 (Small Tour & Minor Maneuvers - 10% Probability):
    //    Ornamental jewel swirls, edge cruises, and lagoon traverses
    function generateBranchingMigrationSystem(aspect) {
      const randN = Math.random();
      const branchCount = randN < 0.50 ? 2 : (randN < 0.85 ? 3 : 4);
      const splitCutoffs = [];
      for (let k = 0; k < branchCount - 1; k++) {
        splitCutoffs.push((k + 1) / branchCount + (Math.random() - 0.5) * 0.12);
      }
      splitCutoffs.sort((a, b) => a - b);

      // Tour Tier: Grand Tour (65%), Medium Tour (25%), Small Tour (10%)
      const tourTypeRand = Math.random();
      const tourTier = tourTypeRand < 0.65 ? 'grand' : (tourTypeRand < 0.90 ? 'medium' : 'small');

      // 1. Entry Corridors spanning the ENTIRE sea (including LEFT sea!):
      // 0 = North-West (Left turquoise shallows) : u in [0.42, 0.52], v = 1.28 heading South
      // 1 = South-West (Left canyon abyss)      : u in [0.38, 0.50], v = -0.28 heading North
      // 2 = East (Right shelf)                  : u = 1.28, v in [0.35, 0.65] heading West
      // 3 = North-East (Right top shelf)        : u in [0.70, 0.90], v = 1.28 heading South
      // 4 = South-East (Right bottom abyss)     : u in [0.65, 0.88], v = -0.28 heading North
      const entryCorridor = Math.floor(Math.random() * 5);
      let trunkWaypoints = [];
      let curState = { u: 0.60, v: 0.50, heading: 0 };

      // Grand Ellipse spans from Left sea (u ~ 0.36) to Right sea (u ~ 0.94)
      const grandCu = 0.64 + (Math.random() - 0.5) * 0.03;
      const grandCv = 0.50 + (Math.random() - 0.5) * 0.03;
      const grandRu = 0.275 + Math.random() * 0.015; // u: ~0.36 to ~0.94 (both left & right!)
      const grandRv = 0.385 + Math.random() * 0.015; // v: ~0.10 to ~0.90

      if (entryCorridor === 0) {
        // North-West Entry (Left sea shallows)
        const enterU = 0.45 + Math.random() * 0.08;
        trunkWaypoints = [
          { u: enterU, v: 1.55 },
          { u: enterU, v: 1.28 },
          { u: enterU, v: 1.04 },
          { u: enterU, v: 0.82 }
        ];
        curState = { u: enterU, v: 0.82, heading: Math.PI };
      } else if (entryCorridor === 1) {
        // South-West Entry (Left sea canyon)
        const enterU = 0.42 + Math.random() * 0.08;
        trunkWaypoints = [
          { u: enterU, v: -0.55 },
          { u: enterU, v: -0.28 },
          { u: enterU, v: -0.04 },
          { u: enterU, v: 0.18 }
        ];
        curState = { u: enterU, v: 0.18, heading: 0.0 };
      } else if (entryCorridor === 2) {
        // East Entry (Right shelf)
        const enterV = 0.50 + (Math.random() - 0.5) * 0.25;
        trunkWaypoints = [
          { u: 1.55, v: enterV },
          { u: 1.28, v: enterV },
          { u: 1.04, v: enterV },
          { u: 0.90, v: enterV }
        ];
        curState = { u: 0.90, v: enterV, heading: -Math.PI * 0.5 };
      } else if (entryCorridor === 3) {
        // North-East Entry (Right top shelf)
        const enterU = 0.72 + Math.random() * 0.14;
        trunkWaypoints = [
          { u: enterU, v: 1.55 },
          { u: enterU, v: 1.28 },
          { u: enterU, v: 1.04 },
          { u: enterU, v: 0.86 }
        ];
        curState = { u: enterU, v: 0.86, heading: Math.PI };
      } else {
        // South-East Entry (Right bottom abyss)
        const enterU = 0.70 + Math.random() * 0.14;
        trunkWaypoints = [
          { u: enterU, v: -0.55 },
          { u: enterU, v: -0.28 },
          { u: enterU, v: -0.04 },
          { u: enterU, v: 0.16 }
        ];
        curState = { u: enterU, v: 0.16, heading: 0.0 };
      }

      function appendLine(waypoints, state, length) {
        const numSteps = Math.max(2, Math.round(length / 0.20));
        const stepLen = length / numSteps;
        const dU = (Math.sin(state.heading) * stepLen) / aspect;
        const dV = Math.cos(state.heading) * stepLen;

        for (let s = 1; s <= numSteps; s++) {
          state.u += dU;
          state.v += dV;
          waypoints.push({ u: state.u, v: state.v });
        }
      }

      function appendArc(waypoints, state, radius, sweepAngle, cw) {
        const normalAngle = state.heading + cw * Math.PI * 0.5;
        const cU = state.u + (Math.sin(normalAngle) * radius) / aspect;
        const cV = state.v + Math.cos(normalAngle) * radius;

        const startAngle = Math.atan2((state.u - cU) * aspect, state.v - cV);
        const arcLength = radius * sweepAngle;
        const numSteps = Math.max(2, Math.round(arcLength / 0.18));

        for (let s = 1; s <= numSteps; s++) {
          const frac = s / numSteps;
          const angle = startAngle + (cw * sweepAngle) * frac;
          const u = cU + (Math.sin(angle) * radius) / aspect;
          const v = cV + Math.cos(angle) * radius;
          waypoints.push({ u, v });
          state.u = u;
          state.v = v;
          state.heading = Math.atan2(Math.sin(angle + cw * Math.PI * 0.5), Math.cos(angle + cw * Math.PI * 0.5));
        }
      }

      function isSafePoint(u, v) {
        if (u < 0.35 || u > 0.96) return false;
        if (v < 0.08 || v > 0.92) return false;
        if (getExactBeachDistance(u, v) < 0.05) return false;
        return true;
      }

      function appendEllipticalLoop(waypoints, state, cU, cV, rU, rV, sweepAngle, cw) {
        let currentTheta = Math.atan2((state.v - cV) / rV, (state.u - cU) / rU);
        const tanDu = -rU * Math.sin(currentTheta) * cw;
        const tanDv = rV * Math.cos(currentTheta) * cw;
        const targetHeading = Math.atan2(tanDu * aspect, tanDv);

        let turnAngle = normalizeAngle(targetHeading - state.heading);
        if (Math.abs(turnAngle) > 0.08) {
          const turnCw = turnAngle >= 0 ? 1 : -1;
          appendArc(waypoints, state, 0.16, Math.abs(turnAngle), turnCw);
          currentTheta = Math.atan2((state.v - cV) / rV, (state.u - cU) / rU);
        }

        const steps = Math.max(16, Math.round((sweepAngle * Math.max(rU * aspect, rV)) / 0.18));
        for (let s = 1; s <= steps; s++) {
          const frac = s / steps;
          const theta = currentTheta + cw * sweepAngle * frac;
          let u = cU + rU * Math.cos(theta);
          let v = cV + rV * Math.sin(theta);

          // Beach safety buffer for left shallows
          if (u < 0.42 && v > 0.50) {
            const bDist = getExactBeachDistance(u, v);
            if (bDist < 0.07) {
              const push = 0.07 - bDist;
              u += push * 1.3;
              v -= push * 0.8;
            }
          }

          waypoints.push({ u, v });
          state.u = u;
          state.v = v;
        }

        const len = waypoints.length;
        if (len >= 2) {
          const pPrev = waypoints[len - 2];
          const pLast = waypoints[len - 1];
          state.heading = Math.atan2((pLast.u - pPrev.u) * aspect, pLast.v - pPrev.v);
        }
      }

      function appendSafeManeuver(waypoints, state, preferredKind, forkSign) {
        const candidates = [];

        if (preferredKind === 'grand_loop') {
          // 全域大环游: 贯穿左侧浅海 (u~0.36) 到右侧深海 (u~0.94)
          const sweep = Math.PI * 1.6 + Math.random() * Math.PI * 0.5;
          candidates.push({
            type: 'ellipse',
            cu: grandCu,
            cv: grandCv,
            ru: grandRu,
            rv: grandRv,
            sweep,
            cw: forkSign
          });
        } else if (preferredKind === 'left_wing_loop') {
          // 左侧海域大回路: 专门在左侧浅海与珊瑚海葵区深度回旋 (u in [0.36, 0.62], v in [0.15, 0.85])
          candidates.push({
            type: 'ellipse',
            cu: 0.48,
            cv: 0.50,
            ru: 0.13,
            rv: 0.32,
            sweep: Math.PI * 1.7 + Math.random() * 0.4,
            cw: forkSign
          });
        } else if (preferredKind === 'medium_loop') {
          // 中环游: 半个海域
          const isNorth = state.v > 0.5;
          candidates.push({
            type: 'ellipse',
            cu: 0.62 + (Math.random() - 0.5) * 0.05,
            cv: isNorth ? 0.65 : 0.35,
            ru: 0.22 + Math.random() * 0.03,
            rv: 0.26 + Math.random() * 0.03,
            sweep: Math.PI * 1.5 + Math.random() * 0.6,
            cw: forkSign
          });
        } else if (preferredKind === 'jewel_swirl') {
          // 宝字小环游
          candidates.push(
            { type: 'arc', radius: 0.12 + Math.random() * 0.03, sweep: Math.PI * 1.7 + Math.random() * 0.5, cw: forkSign },
            { type: 'arc', radius: 0.12 + Math.random() * 0.03, sweep: Math.PI * 1.7 + Math.random() * 0.5, cw: -forkSign }
          );
        } else if (preferredKind === 'edge_cruise') {
          candidates.push(
            { type: 'line', length: 0.45 + Math.random() * 0.35 },
            { type: 'arc', radius: 0.18 + Math.random() * 0.05, sweep: Math.PI * 0.5, cw: forkSign },
            { type: 'arc', radius: 0.18 + Math.random() * 0.05, sweep: Math.PI * 0.5, cw: -forkSign }
          );
        } else { // traverse
          candidates.push(
            { type: 'line', length: 0.35 + Math.random() * 0.25 },
            { type: 'arc', radius: 0.18, sweep: Math.PI * 0.65, cw: forkSign },
            { type: 'arc', radius: 0.18, sweep: Math.PI * 0.65, cw: -forkSign }
          );
        }

        // Fallbacks
        candidates.push(
          { type: 'arc', radius: 0.15, sweep: Math.PI * 0.5, cw: forkSign },
          { type: 'arc', radius: 0.15, sweep: Math.PI * 0.5, cw: -forkSign },
          { type: 'arc', radius: 0.12, sweep: Math.PI * 0.75, cw: 1 },
          { type: 'arc', radius: 0.12, sweep: Math.PI * 0.75, cw: -1 }
        );

        for (const cand of candidates) {
          const testState = { ...state };
          const tempPts = [];
          if (cand.type === 'ellipse') {
            appendEllipticalLoop(tempPts, testState, cand.cu, cand.cv, cand.ru, cand.rv, cand.sweep, cand.cw);
          } else if (cand.type === 'line') {
            appendLine(tempPts, testState, cand.length);
          } else {
            appendArc(tempPts, testState, cand.radius, cand.sweep, cand.cw);
          }

          let safe = true;
          for (const pt of tempPts) {
            if (!isSafePoint(pt.u, pt.v)) {
              safe = false;
              break;
            }
          }

          if (safe && tempPts.length > 0) {
            for (const pt of tempPts) waypoints.push(pt);
            state.u = testState.u;
            state.v = testState.v;
            state.heading = testState.heading;
            return true;
          }
        }

        const centerH = Math.atan2((0.64 - state.u) * aspect, 0.50 - state.v);
        let diff = normalizeAngle(centerH - state.heading);
        const cw = diff >= 0 ? 1 : -1;
        appendArc(waypoints, state, 0.14, Math.min(Math.PI * 0.75, Math.abs(diff)), cw);
        return true;
      }

      // 2. VISIBLE DIVERGENT BRANCHING DURING THE TOUR:
      // Instead of all branches following the exact same single loop,
      // each branch takes a distinctly divergent route right from entry/early tour!
      const branches = [];
      for (let b = 0; b < branchCount; b++) {
        const forkSign = (b % 2 === 0) ? 1 : -1;
        const branchWaypoints = trunkWaypoints.map(pt => ({ u: pt.u, v: pt.v }));
        const bState = { ...curState };

        if (b === 0) {
          // Branch 0: Grand Outer Ocean Circuit (sweeps from u~0.36 to u~0.94)
          appendSafeManeuver(branchWaypoints, bState, 'grand_loop', 1);
          appendSafeManeuver(branchWaypoints, bState, 'edge_cruise', 1);
        } else if (b === 1) {
          // Branch 1: DIVERGES IMMEDIATELY!
          // Cuts across the LEFT ocean shallows / counter-rotates / interior circuit!
          if (Math.random() < 0.5) {
            // Option A: Left-Wing Shallow Tour (explores the left corals & anemones deeply!)
            appendSafeManeuver(branchWaypoints, bState, 'left_wing_loop', -1);
            appendSafeManeuver(branchWaypoints, bState, 'medium_loop', 1);
          } else {
            // Option B: Counter-Rotating Grand Tour (swims in opposite direction across ocean)
            appendSafeManeuver(branchWaypoints, bState, 'grand_loop', -1);
            appendSafeManeuver(branchWaypoints, bState, 'jewel_swirl', 1);
          }
        } else if (b === 2) {
          // Branch 2: Center & Left traverse through coral garden
          appendSafeManeuver(branchWaypoints, bState, 'left_wing_loop', 1);
          appendSafeManeuver(branchWaypoints, bState, 'traverse', -1);
          appendSafeManeuver(branchWaypoints, bState, 'jewel_swirl', 1);
        } else {
          // Branch 3: Edge cruise & jewel swirls
          appendSafeManeuver(branchWaypoints, bState, 'medium_loop', forkSign);
          appendSafeManeuver(branchWaypoints, bState, 'edge_cruise', -forkSign);
        }

        // Maintain 1.5x tour length (at least 38 waypoints)
        while (branchWaypoints.length < 38) {
          appendSafeManeuver(branchWaypoints, bState, Math.random() < 0.5 ? 'edge_cruise' : 'jewel_swirl', forkSign);
        }

        // Smooth exit off nearest open border
        let exitHeading;
        if (bState.u >= 0.65 && bState.v > 0.55 && Math.cos(bState.heading) > 0) {
          exitHeading = 0.0;
        } else if (bState.v < 0.45 && Math.cos(bState.heading) < 0) {
          exitHeading = Math.PI;
        } else {
          exitHeading = Math.PI * 0.5;
        }

        let turnToExit = normalizeAngle(exitHeading - bState.heading);
        if (Math.abs(turnToExit) > 0.15) {
          const cw = turnToExit >= 0 ? 1 : -1;
          appendArc(branchWaypoints, bState, 0.16, Math.abs(turnToExit), cw);
        }
        appendLine(branchWaypoints, bState, 0.75);

        const exU = bState.u + (Math.sin(bState.heading) * 0.28) / aspect;
        const exV = bState.v + Math.cos(bState.heading) * 0.28;
        branchWaypoints.push({ u: exU, v: exV });

        const uniformWaypoints = resampleWaypointsUniform(branchWaypoints, 0.20, aspect);
        branches.push({
          branchId: b,
          cw: forkSign,
          exit: uniformWaypoints[uniformWaypoints.length - 1],
          waypoints: uniformWaypoints
        });
      }

      let routeTitle = "浅海大洋全域环游";
      if (tourTier === 'grand') {
        routeTitle = "全域大环游 · 鱼群环绕大半个海域多路分流巡弋";
      } else if (tourTier === 'medium') {
        routeTitle = "半域中环游 · 鱼群半区海域开阔巡回";
      } else {
        routeTitle = "花式小环游 · 鱼群珊瑚礁盘紧凑旋流穿梭";
      }

      return {
        branchCount,
        splitCutoffs,
        entryCorridor,
        tourTier,
        routeTitle,
        branches
      };
    }

    function catmullRomSpline(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );
    }

    function catmullRomTangent(p0, p1, p2, p3, t) {
      const t2 = t * t;
      return 0.5 * (
        (-p0 + p2) +
        2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
        3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
      );
    }

    function sampleMigrationPath(waypoints, q, aspect) {
      const segCount = waypoints.length - 3;
      const p = clamp(q, 0.0, 1.0) * segCount;
      const idx = Math.min(Math.floor(p), segCount - 1);
      const s = p - idx;
      const p0 = waypoints[idx];
      const p1 = waypoints[idx + 1];
      const p2 = waypoints[idx + 2];
      const p3 = waypoints[idx + 3];

      const u = catmullRomSpline(p0.u, p1.u, p2.u, p3.u, s);
      const v = catmullRomSpline(p0.v, p1.v, p2.v, p3.v, s);
      const tu = catmullRomTangent(p0.u, p1.u, p2.u, p3.u, s);
      const tv = catmullRomTangent(p0.v, p1.v, p2.v, p3.v, s);

      const tLen = Math.hypot(tu * aspect, tv) || 1.0;
      const normU = -tv / (tLen * aspect);
      const normV = (tu * aspect) / tLen;

      return { u, v, tu, tv, normU, normV };
    }

    // Start the 960-fish Streaming School Migration Event ("鱼群穿境")
    let migrationBudget=STREAM_FISH_COUNT;
    function startSchoolMigrationEvent() {
      const streamCount=migrationBudget;
      const aspect = waterSystem.getAspect();
      const { branchCount, splitCutoffs, routeTitle, tourTier, branches } = generateBranchingMigrationSystem(aspect);
      const startTangent = sampleMigrationPath(branches[0].waypoints, 0.0, aspect);
      const startHeading = Math.atan2(startTangent.tu * aspect, startTangent.tv);

      const members = [];
      for (let i = 0; i < streamCount; i++) {
        // Staggered ribbon progression: leader starts at 0.0 (offscreen at waypoints[1]).
        // Tail offset scaled to match 1.5x path length, keeping ribbon density and physical entrance time uniform.
        const progress = -(i / streamCount) * 0.76 - Math.random() * 0.020;
        const lane = (Math.random() - 0.5) * 2.0;

        // Fully randomized cohort assignment based on dynamic splitCutoffs & branchCount:
        // No fixed percentages - completely procedurally split!
        const ratio = i / streamCount;
        let branchId = 0;
        if (branchCount === 1) {
          branchId = 0;
        } else if (branchCount === 2) {
          const cut = splitCutoffs[0];
          const dist = (ratio - cut) / 0.08;
          const p1 = clamp(0.5 + dist * 0.5, 0.0, 1.0);
          branchId = Math.random() < p1 ? 1 : 0;
        } else if (branchCount === 3) {
          const c0 = splitCutoffs[0];
          const c1 = splitCutoffs[1];
          if (ratio < c0 - 0.04) branchId = 0;
          else if (ratio > c1 + 0.04) branchId = 2;
          else if (ratio < c0 + 0.04) branchId = Math.random() < (ratio - (c0 - 0.04)) / 0.08 ? 1 : 0;
          else if (ratio > c1 - 0.04) branchId = Math.random() < (ratio - (c1 - 0.04)) / 0.08 ? 2 : 1;
          else branchId = 1;
        } else { // 4 branches
          let b = 0;
          while (b < splitCutoffs.length && ratio > splitCutoffs[b] + (Math.random() - 0.5) * 0.05) {
            b++;
          }
          branchId = Math.min(b, branchCount - 1);
        }

        const initialWp = branches[branchId].waypoints[1];
        members.push({
          branchId,
          progress,
          lane,
          laneDrift: (Math.random() - 0.5) * 0.45,
          wanderPhase: Math.random() * TAU,
          wanderFreq: 1.5 + Math.random() * 1.3,
          // Progression speed scaled by 1/1.5 so physical swimming velocity (0.078*speedMult) is unchanged while path length is 1.5x
          speed: 0.0107 + Math.random() * 0.0022,
          u: initialWp.u,
          v: initialWp.v,
          z: -0.62 - (i % 8) * 0.015,
          vx: 0,
          vy: 0,
          heading: startHeading,
          bend: 0,
          roll: 0,
          phase: Math.random() * TAU,
          size: 0.26 + Math.random() * 0.05,
          initialized: false
        });
      }

      streamEvent = {
        active: true,
        type: "school",
        age: 0,
        duration: 295,
        routeTitle,
        tourTier,
        branches,
        branchCount,
        splitCutoffs,
        members,
        phase: `鱼群穿境 · ${routeTitle}（自远海入境）`
      };
      return streamEvent;
    }

    function stopSchoolMigrationEvent() {
      streamEvent = null;
    }

    function interactAt(u, v) {
      const aspect = waterSystem.getAspect();
      // Check turtles first
      for (const t of turtles) {
        const d = Math.hypot((t.u - u) * 20 * aspect, (t.v - v) * 20);
        if (d < 1.35) {
          t.excited = 2.4;
          t.isGliding = false;
          t.speed = t.baseSpeed * 2.2;
          waterSystem.addWaterImpulseUv(t.u, t.v, 0.020, -0.30);
          if (sound) sound.playSplash(0.38);
          return "海龟惊起快速划水";
        }
      }
      // Check sharks
      for (const s of sharks) {
        const d = Math.hypot((s.u - u) * 20 * aspect, (s.v - v) * 20);
        if (d < 1.35) {
          s.excited = 2.6;
          s.speed = s.baseSpeed * 2.35;
          waterSystem.addWaterImpulseUv(s.u, s.v, 0.022, -0.35);
          if (sound) sound.playSplash(0.42);
          return "黑鳍礁鲨加速潜掠";
        }
      }
      // Check anemones
      for (const a of ANEMONE_SPOTS) {
        const d = Math.hypot((a.u - u) * 20 * aspect, (a.v - v) * 20);
        if (d < 0.85) {
          a.squish = 1.0;
          if (sound) sound.playChime(2, 0.10);
        }
      }
      // Check resident fish
      let hitCount = 0;
      for (const f of residentFish) {
        const d = Math.hypot((f.u - u) * 20 * aspect, (f.v - v) * 20);
        if (d < 1.25) {
          f.excited = 2.4;
          const ang = Math.atan2((f.u - u) * aspect, f.v - v) + (Math.random() - 0.5) * 0.5;
          f.vx = Math.sin(ang) * 0.22;
          f.vy = Math.cos(ang) * 0.22;
          hitCount++;
        }
      }
      if (hitCount > 0) {
        if (sound) sound.playChime(4, 0.10);
        return "鱼群受惊散开";
      }
      return null;
    }

    const dummyObj = new THREE.Object3D();

    function resumeAfterMeteor(creature, meteorAge, index, speedMult, aspect) {
      if (!root.OceanMeteor.reentry(creature, meteorAge, index)) return;
      creature.flight = null;
      creature.airborne = false;
      creature.vz = 0;
      creature.z = Math.min(creature.z, -0.25);
      if (creature.baseSpeed !== undefined) {
        creature.speed = Math.max(creature.speed, creature.baseSpeed * speedMult * 0.72);
      } else if (Math.hypot(creature.vx * aspect, creature.vy) < 0.001) {
        const speed = (creature.group === "silver" ? 0.075 : creature.group === "clown" ? 0.052 : 0.058) * speedMult;
        creature.vx = Math.sin(creature.heading) * speed / aspect;
        creature.vy = Math.cos(creature.heading) * speed;
      }
    }

    function update(dt, time, { settings, pointerUv, isWhirlpool, whirlStrength, whirlpoolUv, meteorAge = -1, shadowOffset = 0 }) {
      const aspect = waterSystem.getAspect();
      const speedMult = settings.fishSpeed ?? 1.0;
      const sizeMult = settings.fishSize ?? 1.0;
      const cohesionMult = settings.schoolCohesion ?? 1.0;
      const fleeMult = settings.fleeRadius ?? 1.0;
      const rippleMult = settings.rippleStrength ?? 1.0;
      const clarityVal = clamp((settings.clarity ?? 1.15) * 0.78, 0.15, 1.0);
      const causticsVal = settings.caustics ?? 1.0;
      const wStr = typeof whirlStrength === 'number' ? whirlStrength : (isWhirlpool ? 1.0 : 0.0);
      const hasVortex = wStr > 0.01 && whirlpoolUv;

      // 1. Update 3D Swaying Sea Anemones
      anemoneMat.uniforms.uTime.value = time;
      anemoneMat.uniforms.uWaterClarity.value = clarityVal;
      anemoneMat.uniforms.uCausticsIntensity.value = causticsVal;

      const coralDensity = settings.coralDensity ?? 1.0;
      const activeAnemones = coralDensity <= 0.05 ? 0 : ANEMONE_SPOTS.length;
      anemoneMesh.count = activeAnemones;

      for (let i = 0; i < activeAnemones; i++) {
        const a = ANEMONE_SPOTS[i];
        a.squish = Math.max(0, a.squish - dt * 1.8);
        if (pointerUv && pointerUv.active) {
          const dp = Math.hypot((a.u - pointerUv.u) * 20 * aspect, (a.v - pointerUv.v) * 20);
          if (dp < 0.9) a.squish = Math.max(a.squish, 0.75);
        }
        const wp = waterSystem.toWorld(a.u, a.v, -1.35);
        dummyObj.position.set(wp.x, wp.y, wp.z);
        dummyObj.rotation.set(0, 0, i * 1.1);
        dummyObj.scale.setScalar(a.scale * (0.85 + 0.15 * clamp(coralDensity, 0.2, 1.6)));
        dummyObj.updateMatrix();
        anemoneMesh.setMatrixAt(i, dummyObj.matrix);
        anemoneDataAttr.setXYZW(i, a.phase, a.squish, a.palette, a.scale);
      }
      if (activeAnemones > 0) {
        anemoneMesh.instanceMatrix.needsUpdate = true;
        anemoneDataAttr.needsUpdate = true;
      }

      // 2. Update School Attractors (Expanded roving domain allows schools to graze near & past margins)
      for (let i = 0; i < schoolCenters.length; i++) {
        const sc = schoolCenters[i];
        sc.u += sc.vx * dt * speedMult;
        sc.v += sc.vy * dt * speedMult;

        // Soft gentle turn when nearing outer roaming buffer [-0.04, 1.04]
        if (sc.u < 0.10) {
          sc.vx += dt * 0.05;
          if (sc.u < -0.04) sc.vx = Math.abs(sc.vx);
        } else if (sc.u > 0.92) {
          sc.vx -= dt * 0.05;
          if (sc.u > 1.04) sc.vx = -Math.abs(sc.vx);
        }

        if (sc.v < 0.08) {
          sc.vy += dt * 0.05;
          if (sc.v < -0.04) sc.vy = Math.abs(sc.vy);
        } else if (sc.v > 0.90) {
          sc.vy -= dt * 0.05;
          if (sc.v > 1.04) sc.vy = -Math.abs(sc.vy);
        }

        // Firm beach boundary avoidance & physical pushback away from dry sand
        if (waterSystem.getShoreDistance) {
          const sDist = waterSystem.getShoreDistance(sc.u, sc.v);
          if (sDist < 0.22) {
            const push = (0.22 - sDist) * 0.65;
            sc.vx += dt * push * 5.0;
            sc.vy -= dt * push * 5.0;
          }
          const bRes = waterSystem.enforceBeachBoundary(sc.u, sc.v, 0.14);
          if (bRes.clamped) {
            sc.u = bRes.u;
            sc.v = bRes.v;
            sc.vx = Math.abs(sc.vx);
            sc.vy = -Math.abs(sc.vy);
          }
        } else if (waterSystem.getUvBathymetry(sc.u, sc.v) < 0.70 && sc.u < 0.35 && sc.v > 0.55) {
          sc.vx = Math.abs(sc.vx);
          sc.vy = -Math.abs(sc.vy);
        }
      }

      // 3. Update Blacktip Reef Sharks
      let shadowIdx = shadowOffset;
      for (let i = 0; i < MAX_SHARKS; i++) {
        const slot = sharkSlots[i];
        const s = sharks[i];
        if (!s) {
          slot.mesh.visible = false;
          continue;
        }
        slot.mesh.visible = true;

        const inMeteorFlight = root.OceanMeteor.isFlying(meteorAge, 20 + i);
        resumeAfterMeteor(s, meteorAge, 20 + i, speedMult, aspect);
        if (!inMeteorFlight) {
          if (s.flight) {
            s.flight.elapsed += dt;
            const t = clamp(s.flight.elapsed / s.flight.duration, 0, 1);
            const ease = t * t * (3 - 2 * t);
            s.u = s.flight.startU + (s.flight.endU - s.flight.startU) * ease;
            s.v = s.flight.startV + (s.flight.endV - s.flight.startV) * ease;
            const targetZ = -0.72;
            s.z = (2.5 * (1 - t) + targetZ * t) + Math.sin(Math.PI * t) * 3.6;
            const dU = (s.flight.endU - s.flight.startU) * aspect;
            const dV = s.flight.endV - s.flight.startV;
            s.heading = Math.atan2(dU, dV);
            s.pitch = mix(0.50, -0.68, smoothstep(0.15, 0.85, t));
            s.roll = 0;
            s.turn = 0;
            s.stroke += dt * 10.0;

            if (t >= 1) {
              s.u = s.flight.endU;
              s.v = s.flight.endV;
              s.z = targetZ;
              s.pitch = 0;
              s.flight = null;
              s.airborne = false;
              s.excited = 2.5;
              waterSystem.spawnWaterSplashUv(s.u, s.v, 1.45, sound, rippleMult);
            }
          } else if (s.airborne) {
            s.vz = (s.vz || 4.0) - 11.5 * dt;
            s.z += s.vz * dt;
            s.stroke += dt * 14.0;
            s.pitch = mix(s.pitch, 0.45, dt * 4.0);
            s.roll = (s.roll || 0) + dt * 4.5;
            if (s.z <= -0.25) {
              s.airborne = false;
              s.z = -0.65;
              s.vz = 0;
              waterSystem.spawnWaterSplashUv(s.u, s.v, 1.65, sound, rippleMult);
            }
          } else {
            s.excited = Math.max(0, s.excited - dt);
            const targetSpd = s.baseSpeed * speedMult * (s.excited > 0 ? 1.85 : 1.0);
            s.speed = mix(s.speed, targetSpd, dt * 2.5);
            s.stroke += dt * (4.2 + s.speed * 1.8);

            const probeU = s.u + (Math.sin(s.heading) * 2.8) / (20 * aspect);
            const probeV = s.v + (Math.cos(s.heading) * 2.8) / 20;
            const probeDepth = waterSystem.getUvBathymetry(probeU, probeV);

            const isOffscreen = s.u < -0.01 || s.u > 1.01 || s.v < -0.01 || s.v > 1.01;
            if (isOffscreen) {
              s.offscreenTimer = (s.offscreenTimer || 0) + dt;
            } else {
              s.offscreenTimer = 0;
            }

            // Expanded roaming buffer: allows sharks to cruise offscreen up to [-0.12, 1.12]
            const outOfBuffer = probeU < -0.12 || probeU > 1.12 || probeV < -0.12 || probeV > 1.12 || (s.offscreenTimer > 3.6);
            // Strict beach avoidance (top-left beach)
            const shoreDist = waterSystem.getShoreDistance ? waterSystem.getShoreDistance(probeU, probeV) : 1.0;
            const shallowBeach = shoreDist < 0.22 || (probeDepth < 0.72 && probeU < 0.38 && probeV > 0.52);

            if (shallowBeach || outOfBuffer) {
              // Smoothly steer back toward the visible central lagoon
              const targetCenterU = 0.52 + (Math.random() - 0.5) * 0.28;
              const targetCenterV = 0.46 + (Math.random() - 0.5) * 0.28;
              s.targetHeading = Math.atan2((targetCenterU - s.u) * aspect, targetCenterV - s.v) + (Math.random() - 0.5) * 0.35;
            } else if (Math.random() < dt * 0.45) {
              // Natural continuous wander
              s.targetHeading += (Math.random() - 0.5) * 0.65;
            }

            // Whirlpool progressive suction & stratified concentric orbiting
            if (hasVortex) {
              const dxW = (whirlpoolUv.u - s.u) * aspect;
              const dyW = whirlpoolUv.v - s.v;
              const dW = Math.hypot(dxW, dyW);
              // Moderate localized attraction zone (does not pull the whole ocean)
              const rInfluence = 0.12 + 0.26 * wStr;
              if (dW < rInfluence) {
                const capture = clamp((rInfluence - dW) / (rInfluence * 0.45), 0.0, 1.0) * wStr;
                // Shark concentric tier: r ~ 0.145 to 0.175
                const sharkOrbitR = 0.145 + 0.030 * ((s.seed || 1) % 2);
                const rDiff = dW - sharkOrbitR;
                const radialPull = clamp(rDiff * 2.5, -0.5, 1.8) * (0.85 + 1.15 * wStr);
                const normX = dxW / Math.max(dW, 0.001);
                const normY = dyW / Math.max(dW, 0.001);
                s.u += (normX / aspect) * radialPull * dt * 0.55 * capture;
                s.v += normY * radialPull * dt * 0.55 * capture;

                // Tangential counter-clockwise heading
                const tangHeading = Math.atan2(normY, -normX);
                const diffW = Math.atan2(Math.sin(tangHeading - s.targetHeading), Math.cos(tangHeading - s.targetHeading));
                s.targetHeading += diffW * capture * dt * 4.5;
                s.speed = mix(s.speed, (1.45 + 0.55 * wStr) * speedMult, capture);
                s.roll = mix(s.roll, -0.38 * wStr, capture * dt * 4.5);
              }
            }

            const diff = Math.atan2(Math.sin(s.targetHeading - s.heading), Math.cos(s.targetHeading - s.heading));
            const maxTurn = 1.65 * dt * (0.8 + 0.2 * speedMult);
            const stepTurn = clamp(diff, -maxTurn, maxTurn);
            s.heading += stepTurn;
            s.turn = mix(s.turn, clamp(stepTurn / Math.max(dt, 0.001) * 0.35, -0.65, 0.65), dt * 6.0);
            s.roll = mix(s.roll, -s.turn * 0.38, dt * 5.0);

            // Extended outer clamp allows full immersion offscreen without disappearing
            s.u = clamp(s.u + (Math.sin(s.heading) * s.speed * dt) / (20 * aspect), -0.14, 1.14);
            s.v = clamp(s.v + (Math.cos(s.heading) * s.speed * dt) / 20, -0.14, 1.14);

            // Firm barrier: never penetrate onto dry beach sand
            if (waterSystem.enforceBeachBoundary) {
              const bRes = waterSystem.enforceBeachBoundary(s.u, s.v, 0.12);
              if (bRes.clamped) {
                s.u = bRes.u;
                s.v = bRes.v;
                s.targetHeading = Math.atan2(0.52 - s.u, 0.46 - s.v);
                s.heading = s.targetHeading;
              }
            }
            s.z = mix(s.z, -0.72 - 0.12 * Math.sin(time * 0.8 + s.seed), dt * 2.5);

            s.wakeTimer -= dt;
            if (s.wakeTimer <= 0) {
              s.wakeTimer = 0.22;
              waterSystem.addWaterImpulseUv(s.u, s.v, 0.016, -0.10, rippleMult);
            }
          }
        }

        let rU = s.u, rV = s.v, rZ = s.z, rRoll = s.roll, rPitch = s.pitch;
        if (inMeteorFlight) {
          const flown = root.OceanMeteor.flight(
            { u: s.u, v: s.v, z: s.z, roll: s.roll, flip: s.pitch },
            meteorAge,
            20 + i,
            aspect
          );
          rU = flown.u;
          rV = flown.v;
          rZ = flown.z;
          rRoll = flown.roll;
          rPitch = flown.flip;
        }

        const wp = waterSystem.toWorld(rU, rV, rZ);
        slot.mesh.position.set(wp.x, wp.y, wp.z);
        slot.mesh.rotation.set(rPitch, rRoll, -s.heading, "ZYX");
        slot.mesh.scale.setScalar(s.scale);

        slot.mat.uniforms.stroke.value = s.stroke;
        slot.mat.uniforms.turn.value = s.turn;
        slot.mat.uniforms.clock.value = time;
        slot.mat.uniforms.uWaterClarity.value = clarityVal;
        slot.mat.uniforms.uCausticsIntensity.value = causticsVal;

        if (shadowIdx < waterSystem.MAX_SHADOW_CASTERS) {
          const { worldW, worldH } = waterSystem.getWorldSize();
          const sx = (rU - 0.5) * worldW;
          const sz = (0.5 - rV) * worldH;
          waterSystem.creatureShadowData[shadowIdx].set(sx, rZ, sz, s.scale * 1.15);
          shadowIdx++;
        }
      }

      // 3.5 Update Green Sea Turtles
      for (let i = 0; i < MAX_TURTLES; i++) {
        const slot = turtleSlots[i];
        const t = turtles[i];
        if (!t) {
          slot.mesh.visible = false;
          continue;
        }
        slot.mesh.visible = true;

        const inMeteorFlight = root.OceanMeteor.isFlying(meteorAge, 30 + i);
        resumeAfterMeteor(t, meteorAge, 30 + i, speedMult, aspect);
        if (!inMeteorFlight) {
          if (t.flight) {
            t.flight.elapsed += dt;
            const progress = clamp(t.flight.elapsed / t.flight.duration, 0, 1);
            const ease = progress * progress * (3 - 2 * progress);
            t.u = t.flight.startU + (t.flight.endU - t.flight.startU) * ease;
            t.v = t.flight.startV + (t.flight.endV - t.flight.startV) * ease;
            const targetZ = -0.62;
            t.z = (2.4 * (1 - progress) + targetZ * progress) + Math.sin(Math.PI * progress) * 3.4;
            const dU = (t.flight.endU - t.flight.startU) * aspect;
            const dV = t.flight.endV - t.flight.startV;
            t.heading = Math.atan2(dU, dV);
            t.pitch = mix(0.45, -0.60, smoothstep(0.15, 0.85, progress));
            t.roll = 0;
            t.turn = 0;
            t.stroke += dt * 9.0;

            if (progress >= 1) {
              t.u = t.flight.endU;
              t.v = t.flight.endV;
              t.z = targetZ;
              t.pitch = 0;
              t.flight = null;
              t.airborne = false;
              t.excited = 2.4;
              waterSystem.spawnWaterSplashUv(t.u, t.v, 1.35, sound, rippleMult);
            }
          } else if (t.airborne) {
            t.vz = (t.vz || 3.8) - 11.0 * dt;
            t.z += t.vz * dt;
            t.stroke += dt * 12.0;
            t.pitch = mix(t.pitch, 0.40, dt * 4.0);
            t.roll = (t.roll || 0) + dt * 4.2;
            if (t.z <= -0.22) {
              t.airborne = false;
              t.z = -0.60;
              t.vz = 0;
              waterSystem.spawnWaterSplashUv(t.u, t.v, 1.50, sound, rippleMult);
            }
          } else {
            t.excited = Math.max(0, t.excited - dt);

            // Flapping vs Gliding gait
            if (t.excited > 0) {
              t.isGliding = false;
              t.stroke += dt * 7.5;
            } else {
              t.glideTimer -= dt;
              if (t.glideTimer <= 0) {
                t.isGliding = !t.isGliding;
                t.glideTimer = t.isGliding ? (1.8 + Math.random() * 2.2) : (2.4 + Math.random() * 2.6);
              }
              if (!t.isGliding) {
                t.stroke += dt * (2.8 + t.speed * 1.6);
              } else {
                const targetStroke = Math.round(t.stroke / TAU) * TAU + 0.22;
                t.stroke = mix(t.stroke, targetStroke, dt * 2.2);
              }
            }

            // Periodic surfacing for air vs cruising near the reef bed
            t.diveTimer -= dt;
            if (t.diveTimer <= 0) {
              if (t.targetDepth < -0.32) {
                t.targetDepth = -0.18 - Math.random() * 0.08;
                t.diveTimer = 4.5 + Math.random() * 3.0;
              } else {
                t.targetDepth = -0.62 - Math.random() * 0.24;
                t.diveTimer = 18.0 + Math.random() * 22.0;
              }
            }

            const targetSpd = t.baseSpeed * speedMult * (t.excited > 0 ? 2.1 : (t.isGliding ? 0.72 : 1.0));
            t.speed = mix(t.speed, targetSpd, dt * 2.0);

            const probeU = t.u + (Math.sin(t.heading) * 2.2) / (20 * aspect);
            const probeV = t.v + (Math.cos(t.heading) * 2.2) / 20;
            const probeDepth = waterSystem.getUvBathymetry(probeU, probeV);

            const isOffscreen = t.u < -0.01 || t.u > 1.01 || t.v < -0.01 || t.v > 1.01;
            if (isOffscreen) {
              t.offscreenTimer = (t.offscreenTimer || 0) + dt;
            } else {
              t.offscreenTimer = 0;
            }

            const outOfBuffer = probeU < -0.10 || probeU > 1.10 || probeV < -0.10 || probeV > 1.10 || (t.offscreenTimer > 3.6);
            const shoreDist = waterSystem.getShoreDistance ? waterSystem.getShoreDistance(probeU, probeV) : 1.0;
            const shallowBeach = shoreDist < 0.20 || (probeDepth < 0.65 && probeU < 0.38 && probeV > 0.52);

            if (shallowBeach || outOfBuffer) {
              const targetCenterU = 0.54 + (Math.random() - 0.5) * 0.26;
              const targetCenterV = 0.48 + (Math.random() - 0.5) * 0.26;
              t.targetHeading = Math.atan2((targetCenterU - t.u) * aspect, targetCenterV - t.v) + (Math.random() - 0.5) * 0.32;
            } else if (Math.random() < dt * 0.40) {
              t.targetHeading += (Math.random() - 0.5) * 0.55;
            }

            // Whirlpool progressive suction & stratified concentric orbiting
            if (hasVortex) {
              const dxW = (whirlpoolUv.u - t.u) * aspect;
              const dyW = whirlpoolUv.v - t.v;
              const dW = Math.hypot(dxW, dyW);
              // Moderate localized attraction zone (does not pull the whole ocean)
              const rInfluence = 0.12 + 0.26 * wStr;
              if (dW < rInfluence) {
                const capture = clamp((rInfluence - dW) / (rInfluence * 0.45), 0.0, 1.0) * wStr;
                // Sea turtle concentric tier: r ~ 0.095 to 0.125
                const turtleOrbitR = 0.095 + 0.030 * ((t.seed || 1) % 2);
                const rDiff = dW - turtleOrbitR;
                const radialPull = clamp(rDiff * 2.5, -0.5, 1.6) * (0.80 + 1.10 * wStr);
                const normX = dxW / Math.max(dW, 0.001);
                const normY = dyW / Math.max(dW, 0.001);
                t.u += (normX / aspect) * radialPull * dt * 0.50 * capture;
                t.v += normY * radialPull * dt * 0.50 * capture;

                // Tangential counter-clockwise heading
                const tangHeading = Math.atan2(normY, -normX);
                const diffW = Math.atan2(Math.sin(tangHeading - t.targetHeading), Math.cos(tangHeading - t.targetHeading));
                t.targetHeading += diffW * capture * dt * 4.2;
                t.speed = mix(t.speed, (1.10 + 0.45 * wStr) * speedMult, capture);
                t.roll = mix(t.roll, -0.32 * wStr, capture * dt * 4.0);
              }
            }

            const diff = Math.atan2(Math.sin(t.targetHeading - t.heading), Math.cos(t.targetHeading - t.heading));
            const maxTurn = 1.35 * dt * (0.8 + 0.2 * speedMult);
            const stepTurn = clamp(diff, -maxTurn, maxTurn);
            t.heading += stepTurn;
            t.turn = mix(t.turn, clamp(stepTurn / Math.max(dt, 0.001) * 0.38, -0.60, 0.60), dt * 5.0);
            t.roll = mix(t.roll, -t.turn * 0.42, dt * 4.0);

            t.u = clamp(t.u + (Math.sin(t.heading) * t.speed * dt) / (20 * aspect), -0.12, 1.12);
            t.v = clamp(t.v + (Math.cos(t.heading) * t.speed * dt) / 20, -0.12, 1.12);

            if (waterSystem.enforceBeachBoundary) {
              const bRes = waterSystem.enforceBeachBoundary(t.u, t.v, 0.12);
              if (bRes.clamped) {
                t.u = bRes.u;
                t.v = bRes.v;
                t.targetHeading = Math.atan2(0.54 - t.u, 0.48 - t.v);
                t.heading = t.targetHeading;
              }
            }

            t.z = mix(t.z, t.targetDepth + 0.04 * Math.sin(time * 0.6 + t.seed), dt * 1.5);
            t.pitch = mix(t.pitch, clamp((t.targetDepth - t.z) * 0.8, -0.32, 0.32), dt * 2.0);

            if (t.z > -0.25 && Math.random() < dt * 1.2) {
              waterSystem.addWaterImpulseUv(t.u, t.v, 0.012, -0.06, rippleMult);
            }

            t.wakeTimer -= dt;
            if (t.wakeTimer <= 0 && !t.isGliding) {
              t.wakeTimer = 0.35;
              waterSystem.addWaterImpulseUv(t.u, t.v, 0.014, -0.08, rippleMult);
            }
          }
        }

        let rU = t.u, rV = t.v, rZ = t.z, rRoll = t.roll, rPitch = t.pitch;
        if (inMeteorFlight) {
          const flown = root.OceanMeteor.flight(
            { u: t.u, v: t.v, z: t.z, roll: t.roll, flip: t.pitch },
            meteorAge,
            30 + i,
            aspect
          );
          rU = flown.u;
          rV = flown.v;
          rZ = flown.z;
          rRoll = flown.roll;
          rPitch = flown.flip;
        }

        const wp = waterSystem.toWorld(rU, rV, rZ);
        slot.mesh.position.set(wp.x, wp.y, wp.z);
        slot.mesh.rotation.set(rPitch, rRoll, -t.heading, "ZYX");
        slot.mesh.scale.setScalar(t.scale);

        slot.mat.uniforms.stroke.value = t.stroke;
        slot.mat.uniforms.turn.value = t.turn;
        slot.mat.uniforms.clock.value = time;
        slot.mat.uniforms.uWaterClarity.value = clarityVal;
        slot.mat.uniforms.uCausticsIntensity.value = causticsVal;

        if (shadowIdx < waterSystem.MAX_SHADOW_CASTERS) {
          const { worldW, worldH } = waterSystem.getWorldSize();
          const sx = (rU - 0.5) * worldW;
          const sz = (0.5 - rV) * worldH;
          waterSystem.creatureShadowData[shadowIdx].set(sx, rZ, sz, t.scale * 1.05);
          shadowIdx++;
        }
      }

      // 4. Update Resident Fish (Silver School, Reef Fish, Clownfish)
      fishMat.uniforms.uTime.value = time;
      fishMat.uniforms.uWaterClarity.value = clarityVal;
      fishMat.uniforms.uCausticsIntensity.value = causticsVal;

      let fishInstanceIdx = 0;

      for (let i = 0; i < residentFish.length; i++) {
        const f = residentFish[i];

        const inMeteorFlight = root.OceanMeteor.isFlying(meteorAge, 30 + (i % 40));
        resumeAfterMeteor(f, meteorAge, 30 + (i % 40), speedMult, aspect);
        if (!inMeteorFlight) {
          if (f.flight) {
            f.flight.elapsed += dt;
            const t = clamp(f.flight.elapsed / f.flight.duration, 0, 1);
            const ease = t * t * (3 - 2 * t);
            f.u = f.flight.startU + (f.flight.endU - f.flight.startU) * ease;
            f.v = f.flight.startV + (f.flight.endV - f.flight.startV) * ease;
            const targetSwimZ = f.group === "clown" ? -1.05 : f.group === "reef" ? -0.95 : -0.65;
            f.z = (2.3 * (1 - t) + targetSwimZ * t) + Math.sin(Math.PI * t) * 3.3;
            const dU = (f.flight.endU - f.flight.startU) * aspect;
            const dV = f.flight.endV - f.flight.startV;
            f.heading = Math.atan2(dU, dV);
            f.pitch = mix(0.55, -0.72, smoothstep(0.15, 0.85, t));
            f.roll = 0;
            f.bend = 0;
            f.phase += dt * 24.0;

            if (t >= 1) {
              f.u = f.flight.endU;
              f.v = f.flight.endV;
              f.z = targetSwimZ;
              f.pitch = 0;
              const splash = f.flight.splash;
              f.flight = null;
              f.airborne = false;
              f.excited = 2.0;
              if (splash) {
                const splashIntensity = f.group === "silver" ? 0.75 : 0.85;
                waterSystem.spawnWaterSplashUv(f.u, f.v, splashIntensity, sound, rippleMult);
              }
            }
          } else if (f.airborne) {
            f.vz = (f.vz || 4.5) - 12.0 * dt;
            f.z += f.vz * dt;
            f.u = clamp(f.u + (f.vx || 0) * dt, 0.05, 0.95);
            f.v = clamp(f.v + (f.vy || 0) * dt, 0.05, 0.95);
            f.pitch = (f.pitch || 0) + dt * 8.5;
            f.roll = (f.roll || 0) + dt * 7.0;
            f.phase += dt * 25.0;
            if (f.z <= -0.15) {
              f.airborne = false;
              f.z = f.group === "clown" ? -1.1 : -0.65;
              f.vz = 0;
              waterSystem.spawnWaterSplashUv(f.u, f.v, 0.75, i === 0 ? sound : null, rippleMult);
            }
          } else {
            f.excited = Math.max(0, f.excited - dt);
            let targetU = f.u;
            let targetV = f.v;

            if (f.group === "silver") {
              const sc = schoolCenters[f.schoolId % schoolCenters.length];
              const swirl = time * 0.65 + f.seed;
              targetU = sc.u + (Math.cos(swirl) * 0.08) / Math.max(0.4, cohesionMult);
              targetV = sc.v + (Math.sin(swirl) * 0.08) / Math.max(0.4, cohesionMult);
            } else if (f.group === "clown") {
              const home = ANEMONE_SPOTS[f.homeIndex % ANEMONE_SPOTS.length];
              const orbit = time * 1.15 + f.seed;
              targetU = home.u + Math.cos(orbit) * 0.028;
              targetV = home.v + Math.sin(orbit) * 0.028;
              if (Math.hypot((f.u - home.u) * 20 * aspect, (f.v - home.v) * 20) < 0.38) {
                home.squish = Math.max(home.squish, 0.28);
              }
            } else {
              const corals = (waterSystem.getCoralHeads && waterSystem.getCoralHeads()) || [];
              const homeCoral = corals.length > 0 ? corals[f.homeIndex % corals.length] : { u: 0.5, v: 0.5 };
              const orbit = time * 0.55 + f.seed;
              targetU = homeCoral.u + Math.cos(orbit) * 0.065;
              targetV = homeCoral.v + Math.sin(orbit) * 0.065;

              // Occasional natural exploratory foray towards outer reef and open water
              const forageCycle = Math.sin(time * 0.16 + f.seed * 3.5);
              if (forageCycle > 0.65) {
                const forageFactor = (forageCycle - 0.65) * 0.38;
                targetU += Math.cos(f.seed * 6.28) * forageFactor;
                targetV += Math.sin(f.seed * 6.28) * forageFactor;
              }
            }

            let ax = (targetU - f.u) * (f.group === "clown" ? 2.4 : 1.35 * cohesionMult);
            let ay = (targetV - f.v) * (f.group === "clown" ? 2.4 : 1.35 * cohesionMult);

            // Boid separation among neighbors
            if (f.group === "silver") {
              for (let j = Math.max(0, i - 12); j < Math.min(residentFish.length, i + 12); j++) {
                if (i === j) continue;
                const other = residentFish[j];
                const du = (f.u - other.u) * aspect;
                const dv = f.v - other.v;
                const d2 = du * du + dv * dv;
                if (d2 > 0.00001 && d2 < 0.0022) {
                  const inv = 0.0012 / Math.sqrt(d2);
                  ax += (du / aspect) * inv * 18.0;
                  ay += dv * inv * 18.0;
                }
              }
            }

            // Part ways around Blacktip Reef Sharks
            for (const s of sharks) {
              const du = (f.u - s.u) * aspect;
              const dv = f.v - s.v;
              const d = Math.hypot(du, dv);
              if (d < 0.13) {
                const push = ((0.13 - d) / 0.13) * 1.45;
                ax += (du / Math.max(d, 0.001)) * push;
                ay += (dv / Math.max(d, 0.001)) * push;
              }
            }

            // Part ways around Green Sea Turtles
            for (const t of turtles) {
              const du = (f.u - t.u) * aspect;
              const dv = f.v - t.v;
              const d = Math.hypot(du, dv);
              const rAvoid = 0.18;
              if (d < rAvoid) {
                const push = ((rAvoid - d) / rAvoid) * 1.85;
                ax += (du / Math.max(d, 0.001)) * push;
                ay += (dv / Math.max(d, 0.001)) * push;
              }
            }

            // Flee from user pointer
            if (pointerUv && pointerUv.active && fleeMult > 0.05) {
              const du = (f.u - pointerUv.u) * aspect;
              const dv = f.v - pointerUv.v;
              const d = Math.hypot(du, dv);
              const rFlee = 0.11 * fleeMult;
              if (d < rFlee) {
                const push = ((rFlee - d) / rFlee) * 2.2 * fleeMult;
                ax += (du / Math.max(d, 0.001)) * push;
                ay += (dv / Math.max(d, 0.001)) * push;
              }
            }

            // Strict beach avoidance (top-left beach)
            if (waterSystem.getShoreDistance) {
              const sDist = waterSystem.getShoreDistance(f.u, f.v);
              if (sDist < 0.18) {
                const push = (0.18 - sDist) * 1.8;
                ax += push * 1.8;
                ay -= push * 1.8;
              }
            } else if (waterSystem.getUvBathymetry(f.u, f.v) < 0.45 && f.u < 0.38 && f.v > 0.52) {
              ax += 0.85;
              ay -= 0.85;
            }

            // Whirlpool progressive suction & innermost eye concentric orbiting
            let vortexCapture = 0;
            if (hasVortex) {
              const dxW = (whirlpoolUv.u - f.u) * aspect;
              const dyW = whirlpoolUv.v - f.v;
              const dW = Math.hypot(dxW, dyW);
              // Moderate localized attraction zone (does not pull the whole ocean)
              const rInfluence = 0.12 + 0.26 * wStr;
              if (dW < rInfluence) {
                vortexCapture = clamp((rInfluence - dW) / (rInfluence * 0.45), 0.0, 1.0) * wStr;
                // Innermost core orbit: r ~ 0.020 to 0.048, distributed evenly
                const fishOrbitR = 0.020 + 0.024 * (i / residentFish.length) + 0.005 * Math.sin(f.seed * 7.5);
                const rDiff = dW - fishOrbitR;
                const radialPull = clamp(rDiff * 3.2, -0.6, 1.8) * (0.95 + 1.25 * wStr);
                const normX = dxW / Math.max(dW, 0.001);
                const normY = dyW / Math.max(dW, 0.001);

                // Counter-clockwise tangential swirl
                const tangX = normY;
                const tangY = -normX;
                const swirlSpd = (1.2 + 0.7 * wStr);

                // Irresistible inward suction and swirl
                ax = mix(ax, (normX * radialPull + tangX * swirlSpd) * 5.0, vortexCapture);
                ay = mix(ay, (normY * radialPull + tangY * swirlSpd) * 5.0, vortexCapture);
              }
            }

            // Soft-boundary return steering:
            // Allows fish to freely explore the offscreen buffer [-0.12, 1.12],
            // while gently returning toward the visible screen [0.0, 1.0]:
            if (f.u < 0.02) {
              ax += (0.02 - f.u) * 2.8;
            } else if (f.u > 0.98) {
              ax -= (f.u - 0.98) * 2.8;
            }
            if (f.v < 0.02) {
              ay += (0.02 - f.v) * 2.8;
            } else if (f.v > 0.98) {
              ay -= (f.v - 0.98) * 2.8;
            }

            f.vx = (f.vx + ax * dt) * Math.pow(0.18, dt);
            f.vy = (f.vy + ay * dt) * Math.pow(0.18, dt);

            const baseSpd = (f.group === "silver" ? 0.075 : f.group === "clown" ? 0.052 : 0.058) * speedMult * (f.excited > 0 ? 1.9 : 1.0);
            const curSpd = Math.hypot(f.vx * aspect, f.vy) + 0.0001;
            const maxVortexSpd = baseSpd * (1.85 + 1.65 * vortexCapture);
            const clampedSpd = clamp(curSpd, baseSpd * 0.55, maxVortexSpd);
            f.vx = (f.vx / curSpd) * clampedSpd;
            f.vy = (f.vy / curSpd) * clampedSpd;

            // Extended outer clamp allows full natural off-screen swimming
            f.u = clamp(f.u + f.vx * dt, -0.14, 1.14);
            f.v = clamp(f.v + f.vy * dt, -0.14, 1.14);

            // Firm barrier: never penetrate onto dry beach sand
            if (waterSystem.enforceBeachBoundary) {
              const bRes = waterSystem.enforceBeachBoundary(f.u, f.v, 0.08);
              if (bRes.clamped) {
                f.u = bRes.u;
                f.v = bRes.v;
                const dot = f.vx * bRes.normalU + f.vy * bRes.normalV;
                if (dot < 0) {
                  f.vx -= dot * bRes.normalU * 1.6;
                  f.vy -= dot * bRes.normalV * 1.6;
                }
              }
            }

            const desiredHeading = Math.atan2(f.vx * aspect, f.vy);
            const hDiff = Math.atan2(Math.sin(desiredHeading - f.heading), Math.cos(desiredHeading - f.heading));
            f.heading += hDiff * Math.min(1.0, dt * 8.5);
            f.bend = mix(f.bend, clamp(-hDiff * 0.85, -0.75, 0.75), dt * 8.0);
            f.phase += dt * (9.5 + clampedSpd * 85.0);
            f.roll = f.excited > 0 && f.group === "reef" ? f.excited * TAU : -f.bend * 0.35;
          }
        }

        let rU = f.u, rV = f.v, rZ = f.z, rRoll = f.roll, rPitch = f.pitch;
        if (inMeteorFlight) {
          const flown = root.OceanMeteor.flight(
            { u: f.u, v: f.v, z: f.z, roll: f.roll, flip: f.pitch },
            meteorAge,
            30 + (i % 40),
            aspect
          );
          rU = flown.u;
          rV = flown.v;
          rZ = flown.z;
          rRoll = flown.roll;
          rPitch = flown.flip;
        }

        const wp = waterSystem.toWorld(rU, rV, rZ);
        dummyObj.position.set(wp.x, wp.y, wp.z);
        dummyObj.rotation.set(rPitch, rRoll, -f.heading, "ZYX");
        dummyObj.scale.setScalar(f.size * sizeMult);
        dummyObj.updateMatrix();
        fishMesh.setMatrixAt(fishInstanceIdx, dummyObj.matrix);
        fishStateAttr.setXYZW(fishInstanceIdx, f.phase, f.kind, f.bend, f.size * sizeMult);
        fishInstanceIdx++;
      }

      // 5. Update 1440-Fish Streaming School Migration Event ("鱼群穿境")
      if (streamEvent) {
        streamEvent.age += dt;
        const t = streamEvent.age;
        const routeTitle = streamEvent.routeTitle || "深海大巡游";
        const tierTag = streamEvent.tourTier === 'grand' ? '【大环游】大半个海域宏大巡弋' : (streamEvent.tourTier === 'medium' ? '【中环游】半海域开阔巡回' : '【小环游】花式穿梭');
        streamEvent.phase =
          t < 54
            ? `鱼群穿境 · ${tierTag}（自远海游入）`
            : t < 200
              ? `鱼群穿境 · ${tierTag} · 1440尾银鱼舒展畅游`
              : `鱼群穿境 · 鱼群巡游完毕，向大洋深处漫游散去`;

        let visibleStreamCount = 0;
        const branches = streamEvent.branches;
        const branchCount = branches ? branches.length : 1;

        for (let i = 0; i < streamEvent.members.length; i++) {
          const m = streamEvent.members[i];
          m.progress += m.speed * dt * (0.85 + 0.25 * speedMult);
          // Strict bounds: only render fish when progress is within [0.0, 1.0].
          // Fish with progress < 0 are waiting off-screen above/beyond the frame,
          // preventing flat bunched-up lines inside the screen.
          if (m.progress < 0.0 || m.progress > 1.0) continue;

          const q = m.progress;
          const activeBranch = branches ? branches[m.branchId || 0] : streamEvent;
          const waypoints = activeBranch.waypoints;
          const pathSample = sampleMigrationPath(waypoints, q, aspect);

          // Organic ribbon breathing & billowing cloud dynamics with randomized school wave
          const ribbonWidth = 0.034 * (0.85 + 0.45 * Math.sin(q * Math.PI));
          const waveOsc = Math.sin(time * 2.4 + q * 16.0 + m.lane * 1.5) * 0.004;
          const schoolMeander = Math.sin(q * 9.0 + time * 1.2) * 0.014 + Math.cos(q * 19.0 - time * 1.7) * 0.007;
          const indWander = Math.sin(time * m.wanderFreq + m.wanderPhase) * 0.006;
          const currentLane = m.lane + Math.sin(time * 0.8 + m.wanderPhase) * (m.laneDrift || 0.1);
          const lateralDisp = currentLane * ribbonWidth + waveOsc + schoolMeander + indWander;
          const baseU = pathSample.u + pathSample.normU * lateralDisp;
          const baseV = pathSample.v + pathSample.normV * lateralDisp;

          const tLen = Math.hypot(pathSample.tu * aspect, pathSample.tv) || 1.0;
          const forwardU = pathSample.tu / tLen;
          const forwardV = pathSample.tv / tLen;
          const baseSpd = 0.078 * speedMult;

          if (!m.initialized) {
            m.u = baseU;
            m.v = baseV;
            m.vx = forwardU * baseSpd;
            m.vy = forwardV * baseSpd;
            m.heading = Math.atan2(m.vx * aspect, m.vy);
            m.bend = 0;
            m.roll = 0;
            m.initialized = true;
          }

          // Exact Native Silver Fish Avoidance & Steering Physics:
          // 1. Gentle spring attraction toward target ribbon stream position
          let ax = (baseU - m.u) * 4.6;
          let ay = (baseV - m.v) * 4.6;

          // 2. Stream forward propulsion along tangent
          ax += forwardU * baseSpd * 5.0;
          ay += forwardV * baseSpd * 5.0;

          // 3. Exact Native Silver Fish Shark Avoidance:
          // Radial repulsion pushes fish outward from shark center before contact,
          // guaranteeing fish smoothly part ways and NEVER clip into or disappear under shark 3D mesh!
          let maxSharkPush = 0;
          for (const s of sharks) {
            const du = (m.u - s.u) * aspect;
            const dv = m.v - s.v;
            const d = Math.hypot(du, dv);
            const rAvoid = 0.16;
            if (d < rAvoid) {
              const push = ((rAvoid - d) / rAvoid) * 4.0;
              ax += (du / Math.max(d, 0.001)) * push;
              ay += (dv / Math.max(d, 0.001)) * push;
              if (push > maxSharkPush) maxSharkPush = push;
            }
          }

          // Avoid Green Sea Turtles
          for (const t of turtles) {
            const du = (m.u - t.u) * aspect;
            const dv = m.v - t.v;
            const d = Math.hypot(du, dv);
            const rAvoid = 0.20;
            if (d < rAvoid) {
              const push = ((rAvoid - d) / rAvoid) * 4.2;
              ax += (du / Math.max(d, 0.001)) * push;
              ay += (dv / Math.max(d, 0.001)) * push;
            }
          }

          // 4. Pointer flee (identical to native resident fish)
          if (pointerUv && pointerUv.active && fleeMult > 0.05) {
            const du = (m.u - pointerUv.u) * aspect;
            const dv = m.v - pointerUv.v;
            const d = Math.hypot(du, dv);
            const rFlee = 0.12 * fleeMult;
            if (d < rFlee) {
              const push = ((rFlee - d) / rFlee) * 2.5 * fleeMult;
              ax += (du / Math.max(d, 0.001)) * push;
              ay += (dv / Math.max(d, 0.001)) * push;
            }
          }

          // Whirlpool progressive suction on stream fish
          let streamVortexCapture = 0;
          if (hasVortex) {
            const dxW = (whirlpoolUv.u - m.u) * aspect;
            const dyW = whirlpoolUv.v - m.v;
            const dW = Math.hypot(dxW, dyW);
            // Moderate localized attraction zone (does not pull the whole ocean)
            const rInfluence = 0.12 + 0.26 * wStr;
            if (dW < rInfluence) {
              streamVortexCapture = clamp((rInfluence - dW) / (rInfluence * 0.45), 0.0, 1.0) * wStr;
              const fishOrbitR = 0.022 + 0.024 * (m.index / Math.max(mCount, 1));
              const rDiff = dW - fishOrbitR;
              const radialPull = clamp(rDiff * 3.2, -0.6, 1.8) * (0.95 + 1.25 * wStr);
              const normX = dxW / Math.max(dW, 0.001);
              const normY = dyW / Math.max(dW, 0.001);

              const tangX = normY;
              const tangY = -normX;
              const swirlSpd = (1.2 + 0.7 * wStr);

              ax = mix(ax, (normX * radialPull + tangX * swirlSpd) * 5.0, streamVortexCapture);
              ay = mix(ay, (normY * radialPull + tangY * swirlSpd) * 5.0, streamVortexCapture);
            }
          }

          // 5. Strict beach avoidance (identical to native resident fish)
          if (waterSystem.getShoreDistance) {
            const sDist = waterSystem.getShoreDistance(m.u, m.v);
            if (sDist < 0.18) {
              const push = (0.18 - sDist) * 2.2;
              ax += push * 2.0;
              ay -= push * 2.0;
            }
          } else if (waterSystem.getUvBathymetry(m.u, m.v) < 0.45 && m.u < 0.38 && m.v > 0.52) {
            ax += 0.95;
            ay -= 0.95;
          }

          // 6. Branch hopping & organic lane shift when parting around obstacles
          if (maxSharkPush > 0.25) {
            m.lane += ((m.u - baseU) * pathSample.normU * aspect + (m.v - baseV) * pathSample.normV) * dt * 0.55;
            m.lane = clamp(m.lane, -3.2, 3.2);

            // Sub-branch hopping: smoothly switch to another branch if diverging
            if (branchCount > 1 && maxSharkPush > 0.85 && Math.random() < 0.16 * dt * 60) {
              const altBranchId = ((m.branchId || 0) + 1) % branchCount;
              const altSample = sampleMigrationPath(branches[altBranchId].waypoints, q, aspect);
              const distToAlt = Math.hypot((m.u - altSample.u) * aspect, m.v - altSample.v);
              if (distToAlt < 0.35) {
                m.branchId = altBranchId;
              }
            }
          }

          // 7. Velocity update with exponential damping (exact resident fish formula)
          m.vx = (m.vx + ax * dt) * Math.pow(0.18, dt);
          m.vy = (m.vy + ay * dt) * Math.pow(0.18, dt);

          // Clamped speed: strictly eliminates being flung away, maintains fluid swimming momentum
          const curSpd = Math.hypot(m.vx * aspect, m.vy) + 0.0001;
          const maxStreamSpd = baseSpd * (1.75 + 1.65 * streamVortexCapture);
          const clampedSpd = clamp(curSpd, baseSpd * 0.60, maxStreamSpd);
          m.vx = (m.vx / curSpd) * clampedSpd;
          m.vy = (m.vy / curSpd) * clampedSpd;

          // 8. Physical position integration
          m.u += m.vx * dt;
          m.v += m.vy * dt;

          // 9. Firm beach boundary barrier (zero sand penetration)
          if (waterSystem.enforceBeachBoundary && m.u < 0.65 && m.v > 0.35 && m.v <= 1.0) {
            const bRes = waterSystem.enforceBeachBoundary(m.u, m.v, 0.08);
            if (bRes.clamped) {
              m.u = bRes.u;
              m.v = bRes.v;
              const dot = m.vx * bRes.normalU + m.vy * bRes.normalV;
              if (dot < 0) {
                m.vx -= dot * bRes.normalU * 1.6;
                m.vy -= dot * bRes.normalV * 1.6;
              }
            }
          }

          // 10. Desired heading and continuous graceful turning (5.2 rad/s limit)
          const desiredHeading = Math.atan2(m.vx * aspect, m.vy);
          let hDiff = Math.atan2(Math.sin(desiredHeading - m.heading), Math.cos(desiredHeading - m.heading));
          const maxTurnStep = 5.2 * dt;
          m.heading += clamp(hDiff, -maxTurnStep, maxTurnStep);

          // Organic body bending & roll into turns (identical to native resident fish)
          m.bend = mix(m.bend || 0, clamp(-hDiff * 0.85, -0.75, 0.75), dt * 8.0);
          m.roll = -m.bend * 0.35;

          // Rapid natural tail flutter during lively migration & evasion
          m.phase += dt * (12.0 + clampedSpd * 75.0);

          if (fishInstanceIdx < MAX_FISH_INSTANCES) {
            // Smooth organic emergence upon spawning and diving upon exit (zero visual popping)
            // Fish swim in naturally from off-screen at full normal size (no growing from small to big)
            const curScale = m.size * sizeMult;
            if (m.airborne) {
              m.vz = (m.vz || 4.0) - 12.0 * dt;
              m.z += m.vz * dt;
              m.u = clamp(m.u + (m.vx || 0) * dt, 0.05, 0.95);
              m.v = clamp(m.v + (m.vy || 0) * dt, 0.05, 0.95);
              m.roll = (m.roll || 0) + dt * 6.0;
              if (m.z <= -0.62) {
                m.airborne = false;
                m.z = -0.62;
                m.vz = 0;
                if (Math.random() < 0.35) {
                  waterSystem.spawnWaterSplashUv(m.u, m.v, 0.65, null, rippleMult);
                }
              }
            }
            const wp = waterSystem.toWorld(m.u, m.v, m.z);
            dummyObj.position.set(wp.x, wp.y, wp.z);
            dummyObj.rotation.set(0, m.roll, -m.heading, "ZYX");
            dummyObj.scale.setScalar(curScale);
            dummyObj.updateMatrix();
            fishMesh.setMatrixAt(fishInstanceIdx, dummyObj.matrix);
            fishStateAttr.setXYZW(fishInstanceIdx, m.phase, 4.0, m.bend, curScale);
            fishInstanceIdx++;
            visibleStreamCount++;
          }
        }

        if (t >= streamEvent.duration || (t > 30 && visibleStreamCount === 0)) {
          streamEvent = null;
        }
      }

      fishMesh.count = fishInstanceIdx;
      fishMesh.visible = fishInstanceIdx > 0;
      if (fishInstanceIdx > 0) {
        fishMesh.instanceMatrix.needsUpdate = true;
        fishStateAttr.needsUpdate = true;
      }

      waterSystem.oceanMaterial.uniforms.uCreatureCount.value = shadowIdx;
      return shadowIdx;
    }

    // ------------------------------------------------------------------------
    // 5. RENDER REAL 3D MODEL THUMBNAILS FOR ALL 9 DOCK CARDS
    // ------------------------------------------------------------------------
    function renderAllDockThumbnails(renderer, raysAndJellies) {
      const thumbW = 192;
      const thumbH = 136;

      const thumbRT = new THREE.WebGLRenderTarget(thumbW, thumbH, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat
      });

      const thumbScene = new THREE.Scene();
      const thumbCam = new THREE.PerspectiveCamera(34, thumbW / thumbH, 0.1, 30);

      // 1. Ray preview mesh
      const singleRayGeom = raysAndJellies.createRayInstancedGeometry();
      singleRayGeom.instanceCount = 1;
      const singleRayMesh = new THREE.Mesh(singleRayGeom, raysAndJellies.rayMaterial);
      thumbScene.add(singleRayMesh);

      // 2. Jelly bell + ribbon preview meshes
      const singleBellGeom = raysAndJellies.createJellyBellInstancedGeometry();
      singleBellGeom.instanceCount = 1;
      const singleBellMesh = new THREE.Mesh(singleBellGeom, raysAndJellies.jellyBellMaterial);
      thumbScene.add(singleBellMesh);

      const NODES = raysAndJellies.NODES_PER_RIBBON;
      const thumbRibbonGeom = new THREE.BufferGeometry();
      const tRibPos = new Float32Array(12 * NODES * 2 * 3);
      const tRibUv = new Float32Array(12 * NODES * 2 * 2);
      const tRibCol = new Float32Array(12 * NODES * 2 * 4);
      thumbRibbonGeom.setIndex(new THREE.BufferAttribute(raysAndJellies.ribbonIndices.slice(0, 12 * (NODES - 1) * 6), 1));
      thumbRibbonGeom.setAttribute("position", new THREE.BufferAttribute(tRibPos, 3));
      thumbRibbonGeom.setAttribute("uv", new THREE.BufferAttribute(tRibUv, 2));
      thumbRibbonGeom.setAttribute("aRibbonColor", new THREE.BufferAttribute(tRibCol, 4));
      const thumbRibbonMesh = new THREE.Mesh(thumbRibbonGeom, raysAndJellies.ribbonMaterial);
      thumbScene.add(thumbRibbonMesh);

      // 3. Fish preview instanced mesh (for silver school, reef fish, clownfish)
      const thumbFishGeom = createFishGeometry(THREE);
      const thumbFishState = new THREE.InstancedBufferAttribute(new Float32Array(12 * 4), 4);
      thumbFishGeom.setAttribute("aFishState", thumbFishState);
      const thumbFishMesh = new THREE.InstancedMesh(thumbFishGeom, fishMat, 12);
      thumbScene.add(thumbFishMesh);

      // 4. Anemone preview mesh (for clownfish card)
      const thumbAnemoneGeom = createAnemoneGeometry(THREE);
      const thumbAnemoneData = new THREE.InstancedBufferAttribute(new Float32Array([0.5, 0.0, 0.2, 1.0]), 4);
      thumbAnemoneGeom.setAttribute("aAnemoneData", thumbAnemoneData);
      const thumbAnemoneMesh = new THREE.InstancedMesh(thumbAnemoneGeom, anemoneMat, 1);
      thumbScene.add(thumbAnemoneMesh);

      // 5. Shark preview mesh
      const thumbSharkMesh = new THREE.Mesh(sharkGeom, sharkSlots[0].mat);
      thumbScene.add(thumbSharkMesh);

      // 6. Turtle preview mesh
      const thumbTurtleGeom = createTurtleGeometry(THREE);
      const thumbTurtleMesh = new THREE.Mesh(thumbTurtleGeom, turtleSlots[0].mat);
      thumbScene.add(thumbTurtleMesh);

      const prevClearColor = new THREE.Color();
      renderer.getClearColor(prevClearColor);
      const prevClearAlpha = renderer.getClearAlpha();
      const pixelBuffer = new Uint8Array(thumbW * thumbH * 4);
      const outCanvas = document.createElement("canvas");
      outCanvas.width = thumbW;
      outCanvas.height = thumbH;
      const ctx2d = outCanvas.getContext("2d");

      const cards = document.querySelectorAll("#dock .card[data-kind]");
      cards.forEach((cardEl) => {
        const sp = cardEl.dataset.kind;
        const imgEl = cardEl.querySelector("img");
        if (!imgEl) return;

        singleRayMesh.visible = false;
        singleBellMesh.visible = false;
        thumbRibbonMesh.visible = false;
        thumbFishMesh.visible = false;
        thumbAnemoneMesh.visible = false;
        thumbSharkMesh.visible = false;
        thumbTurtleMesh.visible = false;

        if (sp === "manta" || sp === "eagle" || sp === "stingray") {
          singleRayMesh.visible = true;
          const spId = sp === "manta" ? 0.0 : sp === "eagle" ? 1.0 : 2.0;
          const scale = sp === "manta" ? 1.08 : sp === "eagle" ? 1.04 : 1.18;
          singleRayGeom.attributes.aInstAnim.setXYZW(0, 0.55, 0.75, spId, 0.15);
          singleRayGeom.attributes.aInstState.setXYZW(0, -0.18, -0.20, 0.0, scale);
          // Yaw = 2.62 so the +Z head & cephalic horns face toward the front-right of the card!
          singleRayGeom.attributes.aInstPose.setXYZW(0, 0.0, 0.25, 0.0, 2.55);
          singleRayGeom.attributes.aInstAnim.needsUpdate = true;
          singleRayGeom.attributes.aInstState.needsUpdate = true;
          singleRayGeom.attributes.aInstPose.needsUpdate = true;

          thumbCam.position.set(0.15, -1.35, 3.8);
          thumbCam.up.set(0, 1, 0);
          thumbCam.lookAt(0, -0.05, 0.2);
          thumbCam.updateProjectionMatrix();
        } else if (sp === "moon" || sp === "nettle") {
          singleBellMesh.visible = true;
          thumbRibbonMesh.visible = true;
          const isNettle = sp === "nettle";
          const bellScale = isNettle ? 0.84 : 0.98;
          const axis = new THREE.Vector3(0.45, 0.85, 0.25).normalize();

          singleBellGeom.attributes.aInstPose.setXYZW(0, -0.18, 0.52, 0.0, bellScale);
          singleBellGeom.attributes.aInstAxis.setXYZW(0, axis.x, axis.y, axis.z, 0.2);
          singleBellGeom.attributes.aInstMeta.setXYZW(0, isNettle ? 1.0 : 0.0, 0.32, 0.0, 0.0);
          singleBellGeom.attributes.aInstPose.needsUpdate = true;
          singleBellGeom.attributes.aInstAxis.needsUpdate = true;
          singleBellGeom.attributes.aInstMeta.needsUpdate = true;

          thumbCam.position.set(0.0, -3.45, 1.65);
          thumbCam.up.set(0, 0, 1);
          thumbCam.lookAt(0.05, 0.0, 0.15);
          thumbCam.updateProjectionMatrix();

          let vPtr = 0;
          for (let r = 0; r < 12; r++) {
            const isOral = r < 4;
            const ang = (r / (isOral ? 4 : 8)) * TAU + (isOral ? 0.3 : 0.0);
            const attachR = isOral ? 0.18 * bellScale : 0.68 * bellScale;
            const baseX = -0.18 + Math.cos(ang) * attachR;
            const baseY = 0.42;
            const baseZ = Math.sin(ang) * attachR;
            const len = isNettle ? (isOral ? 1.35 : 1.75) : (isOral ? 0.65 : 0.42);
            const width = isOral ? (isNettle ? 0.15 : 0.10) : (isNettle ? 0.032 : 0.022);

            const colR = isNettle ? (isOral ? 1.0 : 0.88) : (isOral ? 0.96 : 0.80);
            const colG = isNettle ? (isOral ? 0.91 : 0.38) : (isOral ? 0.68 : 0.92);
            const colB = isNettle ? (isOral ? 0.76 : 0.16) : (isOral ? 0.88 : 1.0);

            for (let s = 0; s < NODES; s++) {
              const frac = s / (NODES - 1);
              const sway = Math.sin(frac * 5.0 + r * 1.1) * 0.12 * frac;
              const nx = baseX - axis.x * frac * len + sway;
              const ny = baseY - axis.y * frac * len;
              const nz = baseZ - axis.z * frac * len;
              const w = width * (1.0 - frac * 0.6);

              for (let side = 0; side < 2; side++) {
                const sign = side === 0 ? -1 : 1;
                tRibPos[vPtr * 3] = nx + sign * w;
                tRibPos[vPtr * 3 + 1] = ny;
                tRibPos[vPtr * 3 + 2] = nz;
                tRibUv[vPtr * 2] = side;
                tRibUv[vPtr * 2 + 1] = frac;
                tRibCol[vPtr * 4] = colR;
                tRibCol[vPtr * 4 + 1] = colG;
                tRibCol[vPtr * 4 + 2] = colB;
                tRibCol[vPtr * 4 + 3] = isOral ? 0.0 : 1.0;
                vPtr++;
              }
            }
          }
          thumbRibbonGeom.attributes.position.needsUpdate = true;
          thumbRibbonGeom.attributes.uv.needsUpdate = true;
          thumbRibbonGeom.attributes.aRibbonColor.needsUpdate = true;
          thumbRibbonGeom.setDrawRange(0, 12 * (NODES - 1) * 6);
        } else if (sp === "silver") {
          thumbFishMesh.visible = true;
          thumbFishMesh.count = 9;
          const offsets = [
            [-0.72, 0.28, 0.1], [-0.18, 0.45, 0.2], [0.38, 0.30, 0.0],
            [-0.58, -0.05, -0.1], [0.02, 0.06, 0.15], [0.58, 0.02, -0.05],
            [-0.36, -0.36, 0.0], [0.22, -0.30, 0.1], [0.74, -0.24, -0.1]
          ];
          offsets.forEach(([ox, oy, oz], idx) => {
            dummyObj.position.set(ox, oy, oz);
            dummyObj.rotation.set(0.15, -0.2, -1.15, "ZYX");
            dummyObj.scale.setScalar(0.54);
            dummyObj.updateMatrix();
            thumbFishMesh.setMatrixAt(idx, dummyObj.matrix);
            thumbFishState.setXYZW(idx, idx * 0.9, 0.0, 0.15, 0.54);
          });
          thumbFishMesh.instanceMatrix.needsUpdate = true;
          thumbFishState.needsUpdate = true;

          thumbCam.position.set(0.0, -1.25, 2.85);
          thumbCam.up.set(0, 1, 0);
          thumbCam.lookAt(0, 0.0, 0);
          thumbCam.updateProjectionMatrix();
        } else if (sp === "reef") {
          thumbFishMesh.visible = true;
          thumbFishMesh.count = 3;
          const specs = [
            { pos: [-0.54, 0.24, 0.1], kind: 1.0, scale: 0.78, rot: -1.1 },
            { pos: [0.14, -0.10, 0.25], kind: 2.0, scale: 0.84, rot: -1.25 },
            { pos: [0.58, 0.30, -0.1], kind: 3.0, scale: 0.74, rot: -1.0 }
          ];
          specs.forEach((s, idx) => {
            dummyObj.position.set(...s.pos);
            dummyObj.rotation.set(0.2, -0.25, s.rot, "ZYX");
            dummyObj.scale.setScalar(s.scale);
            dummyObj.updateMatrix();
            thumbFishMesh.setMatrixAt(idx, dummyObj.matrix);
            thumbFishState.setXYZW(idx, idx * 1.4, s.kind, 0.18, s.scale);
          });
          thumbFishMesh.instanceMatrix.needsUpdate = true;
          thumbFishState.needsUpdate = true;

          thumbCam.position.set(0.0, -1.35, 2.75);
          thumbCam.up.set(0, 1, 0);
          thumbCam.lookAt(0.04, 0.08, 0.05);
          thumbCam.updateProjectionMatrix();
        } else if (sp === "clown") {
          thumbAnemoneMesh.visible = true;
          thumbFishMesh.visible = true;
          thumbFishMesh.count = 2;

          dummyObj.position.set(-0.24, -0.18, -0.25);
          dummyObj.rotation.set(0.2, 0, 0);
          dummyObj.scale.setScalar(1.08);
          dummyObj.updateMatrix();
          thumbAnemoneMesh.setMatrixAt(0, dummyObj.matrix);
          thumbAnemoneMesh.instanceMatrix.needsUpdate = true;

          const clowns = [
            { pos: [0.20, 0.12, 0.35], scale: 0.88, rot: -1.18 },
            { pos: [-0.36, 0.28, 0.42], scale: 0.72, rot: -0.85 }
          ];
          clowns.forEach((c, idx) => {
            dummyObj.position.set(...c.pos);
            dummyObj.rotation.set(0.18, -0.22, c.rot, "ZYX");
            dummyObj.scale.setScalar(c.scale);
            dummyObj.updateMatrix();
            thumbFishMesh.setMatrixAt(idx, dummyObj.matrix);
            thumbFishState.setXYZW(idx, idx * 1.8, 5.0, 0.22, c.scale);
          });
          thumbFishMesh.instanceMatrix.needsUpdate = true;
          thumbFishState.needsUpdate = true;

          thumbCam.position.set(0.0, -1.42, 2.78);
          thumbCam.up.set(0, 1, 0);
          thumbCam.lookAt(-0.04, 0.05, 0.1);
          thumbCam.updateProjectionMatrix();
        } else if (sp === "shark") {
          thumbSharkMesh.visible = true;
          thumbSharkMesh.position.set(0.08, 0.02, 0.0);
          thumbSharkMesh.rotation.set(0.18, -0.22, -1.18, "ZYX");
          thumbSharkMesh.scale.setScalar(0.84);
          sharkSlots[0].mat.uniforms.stroke.value = 0.8;
          sharkSlots[0].mat.uniforms.turn.value = 0.22;

          thumbCam.position.set(0.0, -1.45, 3.5);
          thumbCam.up.set(0, 1, 0);
          thumbCam.lookAt(0.0, 0.0, 0.05);
          thumbCam.updateProjectionMatrix();
        } else if (sp === "turtle") {
          thumbTurtleMesh.visible = true;
          thumbTurtleMesh.position.set(0.02, -0.02, 0.0);
          thumbTurtleMesh.rotation.set(0.24, -0.26, -1.22, "ZYX");
          thumbTurtleMesh.scale.setScalar(0.95);
          turtleSlots[0].mat.uniforms.stroke.value = 0.42;
          turtleSlots[0].mat.uniforms.turn.value = 0.12;

          thumbCam.position.set(0.0, -1.45, 3.2);
          thumbCam.up.set(0, 1, 0);
          thumbCam.lookAt(0.0, 0.0, 0.04);
          thumbCam.updateProjectionMatrix();
        }

        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(thumbRT);
        renderer.clear();
        renderer.render(thumbScene, thumbCam);
        renderer.readRenderTargetPixels(thumbRT, 0, 0, thumbW, thumbH, pixelBuffer);
        renderer.setRenderTarget(null);

        const imgData = ctx2d.createImageData(thumbW, thumbH);
        for (let y = 0; y < thumbH; y++) {
          const srcRow = (thumbH - 1 - y) * thumbW * 4;
          const dstRow = y * thumbW * 4;
          for (let x = 0; x < thumbW * 4; x++) {
            imgData.data[dstRow + x] = pixelBuffer[srcRow + x];
          }
        }
        ctx2d.putImageData(imgData, 0, 0);
        imgEl.src = outCanvas.toDataURL("image/png");
      });

      renderer.setClearColor(prevClearColor, prevClearAlpha);
      thumbRT.dispose();
    }

    function clearAll() {
      residentFish.length = 0;
      sharks.length = 0;
      turtles.length = 0;
      stopSchoolMigrationEvent();
    }

    function getCounts() {
      return {
        fish: residentFish.length,
        migration:streamEvent?.active?streamEvent.members.length:0,
        sharks: sharks.length,
        turtles: turtles.length
      };
    }

    return {
      residentFish,
      sharks,
      turtles,
      anemoneSpots: ANEMONE_SPOTS,
      syncCounts,
      clearAll,
      spawnFromDock,
      throwFishFromDock,
      startSchoolMigrationEvent,
      setMigrationBudget(value){migrationBudget=Math.max(120,Math.min(STREAM_FISH_COUNT,Math.round(value)));},
      stopSchoolMigrationEvent,
      getStreamEvent: () => streamEvent,
      interactAt,
      update,
      getCounts,
      renderAllDockThumbnails
    };
  }

  root.OceanReefEcosystem = {
    createReefEcosystem
  };
})(root);

}
