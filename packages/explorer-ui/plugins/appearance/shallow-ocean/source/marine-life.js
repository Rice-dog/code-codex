export function install(root, document, window, matchMedia) {
/* Instanced Double-Layered Rays (Manta, Spotted Eagle Ray, Blue-Spotted Stingray)
   and Jellyfish Bells + Camera-Facing Verlet Ribbon Tentacles for Ocean Shallows 2.
   Includes forward-swimming head/cephalic-horn orientation fix for all rays. */
(function (root) {
  "use strict";

  const { fract, mix, clamp, smoothstep } = root.OceanWaterSeabed;
  const MAX_CREATURES = 48;
  const NODES_PER_RIBBON = 14;
  const MAX_RIBBONS_TOTAL = MAX_CREATURES * 12;

  function evalJellyPulse(phase01) {
    const p = fract(phase01);
    if (p < 0.28) {
      const t = p / 0.28;
      const squeeze = Math.sin(t * Math.PI * 0.5);
      const thrust = Math.sin(t * Math.PI);
      return { squeeze, thrust };
    } else {
      const t = (p - 0.28) / 0.72;
      const squeeze = Math.cos(t * Math.PI * 0.5);
      const thrust = -0.12 * Math.sin(t * Math.PI);
      return { squeeze, thrust };
    }
  }

  function createRayInstancedGeometry(THREE) {
    const nx = 36;
    const nz = 28;
    const tailSegs = 24;
    const tailSides = 6;

    const positions = [];
    const normals = [];
    const bodyCoords = [];
    const indices = [];

    function pushVert(x, y, z, nxVal, nyVal, nzVal, u, v, dorsalSign, isTail) {
      positions.push(x, y, z);
      normals.push(nxVal, nyVal, nzVal);
      bodyCoords.push(u, v, dorsalSign, isTail);
    }

    const ringCols = nx + 1;
    const ringRows = nz + 1;
    const sheetVertCount = ringCols * ringRows;

    for (let layer = 0; layer < 2; layer++) {
      const dorsalSign = layer === 0 ? 1.0 : -1.0;
      for (let iz = 0; iz <= nz; iz++) {
        const v = (iz / nz) * 2.0 - 1.0;
        for (let ix = 0; ix <= nx; ix++) {
          const u = (ix / nx) * 2.0 - 1.0;
          const edgeFade = Math.max(0.0, (1.0 - u * u) * (1.0 - v * v));
          const thickness = 0.065 * Math.pow(edgeFade, 0.65);
          const y = dorsalSign * thickness;
          pushVert(u, y, v, 0, dorsalSign, 0, u, v, dorsalSign, 0.0);
        }
      }
    }

    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const a = iz * ringCols + ix;
        const b = a + 1;
        const c = a + ringCols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
        const va = sheetVertCount + a;
        const vb = sheetVertCount + b;
        const vc = sheetVertCount + c;
        const vd = sheetVertCount + d;
        indices.push(va, vb, vc, vb, vd, vc);
      }
    }

    const tailBaseVert = positions.length / 3;
    for (let s = 0; s <= tailSegs; s++) {
      const tFrac = s / tailSegs;
      for (let c = 0; c < tailSides; c++) {
        const ang = (c / tailSides) * Math.PI * 2;
        const nxVal = Math.cos(ang);
        const nyVal = Math.sin(ang);
        const rad = 0.032 * (1.0 - tFrac * 0.82);
        pushVert(
          nxVal * rad,
          nyVal * rad,
          0.85 + tFrac * 1.4,
          nxVal,
          nyVal,
          0,
          nxVal,
          tFrac,
          nyVal >= 0 ? 1.0 : -1.0,
          1.0
        );
      }
    }

    for (let s = 0; s < tailSegs; s++) {
      for (let c = 0; c < tailSides; c++) {
        const nextC = (c + 1) % tailSides;
        const a = tailBaseVert + s * tailSides + c;
        const b = tailBaseVert + s * tailSides + nextC;
        const d = tailBaseVert + (s + 1) * tailSides + c;
        const e = tailBaseVert + (s + 1) * tailSides + nextC;
        indices.push(a, d, b, b, d, e);
      }
    }

    const geom = new THREE.InstancedBufferGeometry();
    geom.setIndex(indices);
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute("aBodyCoord", new THREE.Float32BufferAttribute(bodyCoords, 4));

    const instAnim = new Float32Array(MAX_CREATURES * 4);
    const instState = new Float32Array(MAX_CREATURES * 4);
    const instPosePos = new Float32Array(MAX_CREATURES * 4);

    geom.setAttribute("aInstAnim", new THREE.InstancedBufferAttribute(instAnim, 4).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aInstState", new THREE.InstancedBufferAttribute(instState, 4).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aInstPose", new THREE.InstancedBufferAttribute(instPosePos, 4).setUsage(THREE.DynamicDrawUsage));

    return geom;
  }

  function createJellyBellInstancedGeometry(THREE) {
    const radSegs = 40;
    const heightSegs = 22;
    const positions = [];
    const normals = [];
    const bellCoords = [];
    const indices = [];

    for (let iy = 0; iy <= heightSegs; iy++) {
      const r01 = iy / heightSegs;
      const phi = r01 * Math.PI * 0.52;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      for (let ix = 0; ix <= radSegs; ix++) {
        const u = ix / radSegs;
        const theta = u * Math.PI * 2.0;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);

        const x = sinP * ct;
        const z = sinP * st;
        const y = cosP - 0.35;

        positions.push(x, y, z);
        normals.push(sinP * ct, cosP, sinP * st);
        bellCoords.push(r01, theta, u);
      }
    }

    const ring = radSegs + 1;
    for (let iy = 0; iy < heightSegs; iy++) {
      for (let ix = 0; ix < radSegs; ix++) {
        const a = iy * ring + ix;
        const b = a + 1;
        const c = a + ring;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geom = new THREE.InstancedBufferGeometry();
    geom.setIndex(indices);
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute("aBellCoord", new THREE.Float32BufferAttribute(bellCoords, 3));

    const instPose = new Float32Array(MAX_CREATURES * 4);
    const instAxis = new Float32Array(MAX_CREATURES * 4);
    const instMeta = new Float32Array(MAX_CREATURES * 4);

    geom.setAttribute("aInstPose", new THREE.InstancedBufferAttribute(instPose, 4).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aInstAxis", new THREE.InstancedBufferAttribute(instAxis, 4).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("aInstMeta", new THREE.InstancedBufferAttribute(instMeta, 4).setUsage(THREE.DynamicDrawUsage));

    return geom;
  }

  function createRaysAndJelliesSystem({ THREE, scene, camera, waterSystem, sound }) {
    const rayInstancedGeom = createRayInstancedGeometry(THREE);

    const rayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterClarity: { value: 0.90 },
        uCausticsIntensity: { value: 1.0 },
        uRefractionScale: { value: 1.0 }
      },
      vertexShader: `
        precision highp float;
        attribute vec4 aBodyCoord; // u, v, dorsalSign, isTail
        attribute vec4 aInstAnim;  // phase, flapAmp, speciesId (0=manta, 1=eagle, 2=stingray), pitchAngle
        attribute vec4 aInstState; // turnBend, rollBank, sandBurial, sizeScale
        attribute vec4 aInstPose;  // worldX, worldY(elev), worldZ(south), headingYaw

        uniform float uTime;
        uniform float uRefractionScale;

        varying vec4 vBodyCoord;
        varying float vSpecies;
        varying float vSandBurial;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        // Planform silhouette shaping per ray species.
        // Local +Z is FORWARD (head & cephalic horns); Local -Z is REAR (trailing edge & whip tail).
        vec3 shapeRayVertex(vec4 bc, float species, float phase, float flapAmp, float turnBend, out vec3 localNorm) {
          float u = bc.x; // [-1..1] spanwise
          float v = bc.y; // [-1..1] nose(-1) to rear(+1), or [0..1] along tail
          float dorsal = bc.z;
          float isTail = bc.w;

          float au = abs(u);
          float su = sign(u);

          if (isTail > 0.5) {
            float tLen = (species < 0.5) ? 1.15 : ((species < 1.5) ? 2.15 : 1.05);
            float zBase = (species > 1.5) ? 0.72 : 0.62;
            float zPos = -(zBase + v * tLen); // Trails behind at negative local Z!
            float tailWave = sin(phase - v * 4.2) * (0.08 * v * v) * flapAmp;
            float tailTurn = -turnBend * v * v * 0.55;
            float radScale = (species > 1.5) ? (1.0 + 0.35 * sin(v * 3.14159)) : (1.0 - v * 0.65);
            float xPos = u * 0.026 * radScale + tailWave + tailTurn;
            float yPos = dorsal * 0.022 * radScale + cos(phase - v * 3.2) * 0.035 * v * flapAmp;
            localNorm = normalize(vec3(u * 0.6, dorsal, 0.0));
            return vec3(xPos, yPos, zPos);
          }

          float x = 0.0;
          float z = 0.0;
          float y = position.y;
          float wingZ = 0.0;
          float dWingDu = 0.0;
          float dWingDv = 0.0;

          if (species < 0.5) {
            // SPECIES 0: MANTA RAY (Head & cephalic horn lobes lead at +Z)
            float zLead = -0.58 + 0.52 * pow(au, 0.88);
            float horn = exp(-pow((au - 0.21) / 0.065, 2.0)) * (1.0 - smoothstep(0.0, 0.14, au) * 0.2);
            zLead -= horn * 0.42;
            float zTrail = 0.64 - 0.58 * pow(au, 0.72) + 0.08 * exp(-au * 14.0);
            float chord01 = v * 0.5 + 0.5;
            z = -mix(zLead, zTrail, chord01); // Flip so nose/cephalic horns are at +Z (forward)!
            x = u * 1.48;

            float spanFactor = pow(au, 1.45);
            float flapPhase = phase - au * 1.35 - chord01 * 0.35;
            float arch = sin(flapPhase) * spanFactor * 0.48 * flapAmp;
            float camber = -0.12 * au * au * cos(flapPhase);
            wingZ = arch + camber - horn * (1.0 - chord01) * 0.08;
            dWingDu = su * 1.45 * pow(max(au, 0.01), 0.45) * sin(flapPhase) * 0.48 * flapAmp;
          } else if (species < 1.5) {
            // SPECIES 1: SPOTTED EAGLE RAY (Protruding snout leads at +Z)
            float snout = 0.34 * exp(-pow(au / 0.16, 2.0));
            float zLead = -0.52 - snout + 0.62 * pow(au, 0.95);
            float pelvic = 0.16 * exp(-pow((au - 0.12) / 0.08, 2.0));
            float zTrail = 0.62 + pelvic - 0.50 * pow(au, 0.68);
            float chord01 = v * 0.5 + 0.5;
            z = -mix(zLead, zTrail, chord01); // Flip so snout is at +Z (forward)!
            x = u * 1.34;

            float spanFactor = pow(au, 1.38);
            float flapPhase = phase - au * 1.45 - chord01 * 0.4;
            wingZ = sin(flapPhase) * spanFactor * 0.44 * flapAmp - 0.09 * au * au * cos(flapPhase);
            dWingDu = su * 1.38 * pow(max(au, 0.01), 0.38) * sin(flapPhase) * 0.44 * flapAmp;
          } else {
            // SPECIES 2: BLUE-SPOTTED STINGRAY (Anterior snout leads at +Z)
            float r = max(au, abs(v));
            float ang = atan(v, u);
            vec2 oval = vec2(cos(ang) * 0.88, sin(ang) * 0.96);
            oval.y -= 0.06 * exp(-pow(u * 4.0, 2.0)) * step(v, 0.0);
            x = oval.x * r;
            z = -oval.y * r; // Flip so anterior snout is at +Z (forward)!

            float eyeBump = exp(-(pow((abs(x) - 0.18) / 0.07, 2.0) + pow((z - 0.24) / 0.09, 2.0)));
            if (dorsal > 0.0) {
              y += eyeBump * 0.055;
            }

            float rimFactor = smoothstep(0.28, 0.92, length(vec2(x, z * 0.9)));
            float waveArg = -z * 5.8 - phase * 1.35 + au * 1.2;
            wingZ = sin(waveArg) * rimFactor * 0.16 * flapAmp;
            dWingDv = -cos(waveArg) * 5.8 * rimFactor * 0.16 * flapAmp;
          }

          x -= turnBend * z * z * 0.28;
          y += wingZ;

          localNorm = normalize(vec3(-dWingDu * 0.65, dorsal, dWingDv * 0.45));
          return vec3(x, y, z);
        }

        void main() {
          vBodyCoord = aBodyCoord;
          vSpecies = aInstAnim.z;
          vSandBurial = aInstState.z;

          float phase = aInstAnim.x;
          float flapAmp = aInstAnim.y;
          float pitch = aInstAnim.w;

          float turnBend = aInstState.x;
          float rollBank = aInstState.y;
          float sizeScale = aInstState.w;

          vec3 worldCenter = aInstPose.xyz; // (x, y_up, z_south)
          float yaw = aInstPose.w;

          vec3 localNorm;
          vec3 p = shapeRayVertex(aBodyCoord, vSpecies, phase, flapAmp, turnBend, localNorm);
          p *= sizeScale;

          float cr = cos(rollBank), sr = sin(rollBank);
          vec3 pRoll = vec3(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z);
          vec3 nRoll = vec3(localNorm.x * cr - localNorm.y * sr, localNorm.x * sr + localNorm.y * cr, localNorm.z);

          float cp = cos(pitch), sp = sin(pitch);
          vec3 pPitch = vec3(pRoll.x, pRoll.y * cp + pRoll.z * sp, -pRoll.y * sp + pRoll.z * cp);
          vec3 nPitch = vec3(nRoll.x, nRoll.y * cp + nRoll.z * sp, -nRoll.y * sp + nRoll.z * cp);

          float cy = cos(yaw), sy = sin(yaw);
          vec3 worldOffset = vec3(pPitch.x * cy + pPitch.z * sy, pPitch.y, -pPitch.x * sy + pPitch.z * cy);
          vWorldNormal = normalize(vec3(nPitch.x * cy + nPitch.z * sy, nPitch.y, -nPitch.x * sy + nPitch.z * cy));

          vec3 wp = worldCenter + worldOffset;
          if (wp.y < 0.0) {
            float subDepth = clamp(-wp.y, 0.0, 2.5);
            wp.x += sin(wp.x * 2.4 + wp.z * 1.9 + uTime * 3.1) * 0.025 * subDepth * uRefractionScale;
            wp.z += cos(wp.z * 2.4 - wp.x * 1.9 + uTime * 2.7) * 0.025 * subDepth * uRefractionScale;
          }
          vWorldPos = wp;

          // Map (x, y_up, z_south) to unified scene coordinates (x, -z_south, y_up)
          vec3 scenePos = vec3(wp.x, -wp.z, wp.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(scenePos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vBodyCoord;
        varying float vSpecies;
        varying float vSandBurial;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        uniform float uTime;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        vec2 spotGrid(vec2 p) {
          vec2 n = floor(p);
          vec2 f = fract(p);
          float minDist = 8.0;
          float cellId = 0.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 g = vec2(float(i), float(j));
              vec2 rnd = vec2(hash21(n + g), hash21(n + g + 17.3));
              vec2 o = 0.22 + 0.56 * rnd;
              float d = length(g + o - f);
              if (d < minDist) {
                minDist = d;
                cellId = rnd.x;
              }
            }
          }
          return vec2(minDist, cellId);
        }

        void main() {
          float u = vBodyCoord.x;
          float v = vBodyCoord.y;
          float dorsal = vBodyCoord.z;
          float isTail = vBodyCoord.w;
          float au = abs(u);

          vec3 albedo = vec3(0.1);

          if (vSpecies < 0.5) {
            if (isTail > 0.5) {
              albedo = vec3(0.08, 0.09, 0.12);
            } else if (dorsal > 0.0) {
              vec3 jetBlack = vec3(0.06, 0.07, 0.11);
              vec3 shoulderWhite = vec3(0.95, 0.98, 1.0);
              float inPatchU = smoothstep(0.07, 0.13, au) * smoothstep(0.56, 0.34, au);
              float inPatchV = smoothstep(-0.62, -0.36, v) * smoothstep(0.18, -0.08, v - au * 0.35);
              float collarCut = smoothstep(0.05, 0.18, abs(v + 0.22 + au * 0.4));
              float patchMask = inPatchU * inPatchV * (0.35 + 0.65 * collarCut);

              float hornTip = exp(-pow((au - 0.21) / 0.06, 2.0)) * smoothstep(-0.55, -0.88, v);
              float rimEdge = smoothstep(0.84, 0.99, au) * 0.25;
              albedo = mix(jetBlack, shoulderWhite, clamp(patchMask * 0.95 + hornTip * 0.8 + rimEdge, 0.0, 1.0));
            } else {
              vec3 bellyWhite = vec3(0.96, 0.97, 0.99);
              vec2 sg = spotGrid(vec2(u * 4.5, v * 4.5 + 1.3));
              float bellySpot = smoothstep(0.24, 0.14, sg.x) * step(0.42, sg.y) * smoothstep(0.75, 0.25, au);
              float gillU = smoothstep(0.08, 0.12, au) * smoothstep(0.28, 0.22, au);
              float gillV = smoothstep(-0.45, -0.15, v) * smoothstep(0.15, -0.05, v);
              float gillBars = step(0.65, sin(v * 52.0)) * gillU * gillV;
              float darkEdge = smoothstep(0.72, 0.98, au);
              albedo = mix(bellyWhite, vec3(0.11, 0.13, 0.17), clamp(bellySpot * 0.85 + gillBars * 0.75 + darkEdge * 0.65, 0.0, 1.0));
            }
          } else if (vSpecies < 1.5) {
            if (isTail > 0.5) {
              albedo = vec3(0.07, 0.09, 0.14);
            } else if (dorsal > 0.0) {
              vec3 darkBack = vec3(0.07, 0.11, 0.19);
              vec3 spotWhite = vec3(0.97, 0.99, 1.0);
              float bodyInterior = smoothstep(0.96, 0.78, max(au, abs(v))) * smoothstep(-0.78, -0.45, v);
              vec2 sg = spotGrid(vec2(u * 9.5, v * 8.0));
              float solidSpot = smoothstep(0.22, 0.12, sg.x) * step(0.45, sg.y);
              float ringSpot = smoothstep(0.11, 0.04, abs(sg.x - 0.24)) * step(sg.y, 0.45);
              float pattern = clamp(solidSpot + ringSpot, 0.0, 1.0) * bodyInterior;
              albedo = mix(darkBack, spotWhite, pattern * 0.96);
            } else {
              albedo = mix(vec3(0.94, 0.96, 0.98), vec3(0.14, 0.17, 0.24), smoothstep(0.75, 0.98, au));
            }
          } else {
            vec3 tanBase = vec3(0.72, 0.58, 0.34);
            vec3 electricBlue = vec3(0.06, 0.80, 1.0);
            if (isTail > 0.5) {
              float sideStripe = smoothstep(0.35, 0.75, au) * smoothstep(0.85, 0.2, v);
              float bands = 0.85 + 0.15 * sin(v * 42.0);
              float whiteTip = smoothstep(0.78, 0.95, v);
              albedo = mix(tanBase * bands, electricBlue, sideStripe * 0.92);
              albedo = mix(albedo, vec3(0.95, 0.97, 1.0), whiteTip);
            } else if (dorsal > 0.0) {
              float rimDist = length(vec2(u * 0.92, v * 0.95));
              vec3 rimYellow = vec3(0.84, 0.71, 0.45);
              albedo = mix(tanBase, rimYellow, smoothstep(0.68, 0.96, rimDist));

              vec2 sg = spotGrid(vec2(u * 6.8 + 0.5, v * 6.8 + 0.3));
              float spotCore = smoothstep(0.24, 0.14, sg.x) * smoothstep(0.92, 0.45, rimDist);
              float spotHalo = smoothstep(0.31, 0.23, sg.x) * (1.0 - spotCore) * smoothstep(0.92, 0.45, rimDist);
              albedo = mix(albedo, vec3(0.36, 0.27, 0.14), spotHalo * 0.55);
              albedo = mix(albedo, electricBlue, spotCore);

              float eyeMask = smoothstep(0.06, 0.025, length(vec2(au - 0.19, v + 0.29)));
              float spiracleMask = smoothstep(0.075, 0.03, length(vec2(au - 0.21, v + 0.19)));
              albedo = mix(albedo, vec3(0.08, 0.07, 0.06), max(eyeMask, spiracleMask * 0.88));

              if (vSandBurial > 0.01) {
                float sandNoise = fract(sin(dot(floor(vec2(u, v) * 32.0), vec2(12.9898, 78.233))) * 43758.5453);
                float dustMask = smoothstep(0.25, 0.85, rimDist + sandNoise * 0.35) * vSandBurial;
                albedo = mix(albedo, vec3(0.86, 0.80, 0.67), dustMask * 0.65);
              }
            } else {
              albedo = vec3(0.92, 0.89, 0.82);
            }
          }

          vec3 lightDir = normalize(vec3(0.32, 0.88, -0.35));
          vec3 norm = normalize(vWorldNormal);
          float ndl = max(0.35, dot(norm, lightDir));
          vec3 col = albedo * (0.48 + 0.65 * ndl);

          if (vWorldPos.y < 0.0) {
            float subDepth = -vWorldPos.y;
            float cWave1 = sin(vWorldPos.x * 3.8 + uTime * 2.4) * cos(vWorldPos.z * 3.8 - uTime * 2.1);
            float cWave2 = sin((vWorldPos.x - vWorldPos.z) * 4.5 - uTime * 1.9);
            float causticLight = pow(max(0.0, cWave1 * 0.65 + cWave2 * 0.35), 2.4) * smoothstep(-0.2, 0.6, norm.y) * exp(-subDepth * 0.35);
            col += vec3(0.48, 0.95, 1.0) * causticLight * uCausticsIntensity * 0.46;

            vec3 waterCol = mix(vec3(0.09, 0.78, 0.78), vec3(0.03, 0.42, 0.66), clamp(subDepth / 3.2, 0.0, 1.0));
            float turbidity = clamp(1.0 - uWaterClarity * 0.82, 0.04, 1.0);
            float fog = (1.0 - exp(-subDepth * (0.18 + turbidity * 0.55))) * (1.0 - uWaterClarity * 0.68);
            col = mix(col, waterCol, clamp(fog, 0.0, 0.82));
          } else {
            vec3 viewDir = normalize(vec3(0.0, 1.0, 0.1));
            vec3 halfVec = normalize(lightDir + viewDir);
            float spec = pow(max(0.0, dot(norm, halfVec)), 48.0);
            col += vec3(1.0, 0.98, 0.92) * spec * 0.42;
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    const rayInstancedMesh = new THREE.Mesh(rayInstancedGeom, rayMaterial);
    rayInstancedMesh.frustumCulled = false;
    rayInstancedMesh.renderOrder = 2;
    rayInstancedGeom.instanceCount = 0;
    scene.add(rayInstancedMesh);

    // Jellyfish Bells
    const jellyBellGeom = createJellyBellInstancedGeometry(THREE);

    const jellyBellMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterClarity: { value: 0.90 },
        uCameraPos: { value: new THREE.Vector3(0, 35, 0.01) }
      },
      vertexShader: `
        precision highp float;
        attribute vec3 aBellCoord;
        attribute vec4 aInstPose;
        attribute vec4 aInstAxis;
        attribute vec4 aInstMeta;

        varying vec3 vBellCoord;
        varying float vSpecies;
        varying float vSqueeze;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        mat3 alignToAxis(vec3 dir) {
          vec3 up = normalize(dir);
          vec3 helper = abs(up.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 right = normalize(cross(helper, up));
          vec3 fwd = cross(up, right);
          return mat3(right, up, fwd);
        }

        void main() {
          vBellCoord = aBellCoord;
          vSpecies = aInstMeta.x;
          vSqueeze = aInstMeta.y;

          float r01 = aBellCoord.x;
          float theta = aBellCoord.y;
          float scale = aInstPose.w;

          float domeHeight = (vSpecies < 0.5) ? 0.56 : 0.86;
          float delayedSqueeze = sin(clamp(vSqueeze * 1.15 - r01 * 0.28, 0.0, 1.0) * 1.570796);
          float radialContract = 1.0 - delayedSqueeze * (0.28 * pow(r01, 1.35));
          float axialStretch = 1.0 + delayedSqueeze * 0.22;

          float lobes = (vSpecies < 0.5) ? 8.0 : 16.0;
          float scallop = sin(theta * lobes) * 0.025 * pow(r01, 3.0);

          vec3 localPos = vec3(
            position.x * radialContract,
            position.y * domeHeight * axialStretch + scallop,
            position.z * radialContract
          ) * scale;

          vec3 localNorm = normalize(vec3(
            normal.x / max(radialContract, 0.2),
            normal.y / max(domeHeight * axialStretch, 0.2),
            normal.z / max(radialContract, 0.2)
          ));

          mat3 rot = alignToAxis(aInstAxis.xyz);
          vWorldPos = aInstPose.xyz + rot * localPos;
          vWorldNormal = normalize(rot * localNorm);

          vec3 scenePos = vec3(vWorldPos.x, -vWorldPos.z, vWorldPos.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(scenePos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vBellCoord;
        varying float vSpecies;
        varying float vSqueeze;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        uniform float uTime;
        uniform float uWaterClarity;
        uniform vec3 uCameraPos;

        void main() {
          float r = vBellCoord.x;
          float theta = vBellCoord.y;

          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          vec3 norm = normalize(vWorldNormal);
          float ndv = abs(dot(norm, viewDir));
          float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.15);

          vec3 col = vec3(0.0);
          float alpha = 0.5;

          if (vSpecies < 0.5) {
            vec3 baseCyan = vec3(0.74, 0.92, 1.0);
            vec3 rimGlow = vec3(0.92, 0.98, 1.0);

            float gonadMask = 0.0;
            vec2 uvBell = vec2(cos(theta), sin(theta)) * r;
            for (int k = 0; k < 4; k++) {
              float ang = float(k) * 1.5707963 + 0.785398;
              vec2 dir = vec2(cos(ang), sin(ang));
              vec2 perp = vec2(-dir.y, dir.x);
              vec2 center = dir * 0.34;
              vec2 local = uvBell - center;
              float gx = dot(local, dir);
              float gy = dot(local, perp);
              float gr = length(vec2(gx * 1.15, gy));
              float ring = exp(-pow((gr - 0.115) / 0.032, 2.0));
              float gapCut = smoothstep(0.01, -0.05, gx);
              gonadMask = max(gonadMask, ring * (0.2 + 0.8 * gapCut));
            }

            float canal16 = pow(abs(cos(theta * 8.0 + sin(r * 10.0) * 0.15)), 18.0);
            float canal32 = pow(abs(cos(theta * 16.0)), 24.0) * smoothstep(0.35, 0.85, r);
            float canals = clamp(canal16 * 0.65 + canal32 * 0.55, 0.0, 1.0) * smoothstep(0.15, 0.96, r);

            float fringe = smoothstep(0.88, 0.99, r) * (0.55 + 0.45 * sin(theta * 72.0 + uTime * 4.0));

            vec3 gonadPink = vec3(1.0, 0.48, 0.78);
            col = mix(baseCyan, rimGlow, fresnel);
            col = mix(col, vec3(0.90, 0.97, 1.0), canals * 0.55 + fringe * 0.65);
            col = mix(col, gonadPink, gonadMask * 0.94);

            alpha = clamp(0.32 + fresnel * 0.52 + gonadMask * 0.55 + canals * 0.22 + fringe * 0.30, 0.24, 0.94);
          } else {
            vec3 amberCore = vec3(1.0, 0.70, 0.22);
            vec3 rustStripe = vec3(0.78, 0.22, 0.07);
            vec3 warmRim = vec3(1.0, 0.88, 0.55);

            float stripeWave = cos(theta * 16.0);
            float stripeMask = smoothstep(0.15, 0.72, stripeWave) * smoothstep(0.14, 0.55, r);
            float marginRing = smoothstep(0.78, 0.98, r);
            float apexSpot = smoothstep(0.22, 0.0, r) * 0.55;

            col = mix(amberCore, rustStripe, clamp(stripeMask * 0.85 + marginRing * 0.65 + apexSpot, 0.0, 1.0));
            col += warmRim * fresnel * 0.75;

            alpha = clamp(0.52 + fresnel * 0.44 + stripeMask * 0.18, 0.40, 0.96);
          }

          if (vWorldPos.y < 0.0) {
            float subDepth = -vWorldPos.y;
            vec3 waterTint = mix(vec3(0.10, 0.78, 0.78), vec3(0.03, 0.38, 0.62), clamp(subDepth / 3.2, 0.0, 1.0));
            float fog = (1.0 - exp(-subDepth * 0.25)) * (1.0 - uWaterClarity * 0.68);
            col = mix(col, waterTint, clamp(fog, 0.0, 0.75));
          }

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    const jellyBellMesh = new THREE.Mesh(jellyBellGeom, jellyBellMaterial);
    jellyBellMesh.frustumCulled = false;
    jellyBellMesh.renderOrder = 4;
    jellyBellGeom.instanceCount = 0;
    scene.add(jellyBellMesh);

    // Camera-Facing Ribbon Builder
    const ribbonVertCount = MAX_RIBBONS_TOTAL * NODES_PER_RIBBON * 2;
    const ribbonTriCount = MAX_RIBBONS_TOTAL * (NODES_PER_RIBBON - 1) * 2;

    const ribbonPositions = new Float32Array(ribbonVertCount * 3);
    const ribbonUvs = new Float32Array(ribbonVertCount * 2);
    const ribbonColors = new Float32Array(ribbonVertCount * 4);
    const ribbonIndices = new Uint32Array(ribbonTriCount * 3);

    let rIdxPtr = 0;
    for (let r = 0; r < MAX_RIBBONS_TOTAL; r++) {
      const baseV = r * NODES_PER_RIBBON * 2;
      for (let s = 0; s < NODES_PER_RIBBON - 1; s++) {
        const a = baseV + s * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        ribbonIndices[rIdxPtr++] = a;
        ribbonIndices[rIdxPtr++] = c;
        ribbonIndices[rIdxPtr++] = b;
        ribbonIndices[rIdxPtr++] = b;
        ribbonIndices[rIdxPtr++] = c;
        ribbonIndices[rIdxPtr++] = d;
      }
    }

    const ribbonGeom = new THREE.BufferGeometry();
    ribbonGeom.setIndex(new THREE.BufferAttribute(ribbonIndices, 1));
    const ribbonPosAttr = new THREE.BufferAttribute(ribbonPositions, 3).setUsage(THREE.DynamicDrawUsage);
    const ribbonUvAttr = new THREE.BufferAttribute(ribbonUvs, 2).setUsage(THREE.DynamicDrawUsage);
    const ribbonColAttr = new THREE.BufferAttribute(ribbonColors, 4).setUsage(THREE.DynamicDrawUsage);
    ribbonGeom.setAttribute("position", ribbonPosAttr);
    ribbonGeom.setAttribute("uv", ribbonUvAttr);
    ribbonGeom.setAttribute("aRibbonColor", ribbonColAttr);
    ribbonGeom.setDrawRange(0, 0);

    const ribbonMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterClarity: { value: 0.90 }
      },
      vertexShader: `
        precision highp float;
        attribute vec4 aRibbonColor;
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vColor = aRibbonColor;
          vWorldPos = position;
          vec3 scenePos = vec3(position.x, -position.z, position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(scenePos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform float uWaterClarity;

        void main() {
          float u = vUv.x * 2.0 - 1.0;
          float v = vUv.y;
          float rType = vColor.a;

          vec3 col = vColor.rgb;
          float alpha = 0.0;

          if (rType < 0.5) {
            float ruffleWave = sin(v * 38.0 - uTime * 3.2) * 0.35 + cos(v * 64.0 + u * 4.0) * 0.22;
            float edge = abs(u + ruffleWave * (1.0 - v * 0.4));
            float frill = smoothstep(0.95, 0.25, edge);
            float pleatHighlight = smoothstep(0.15, 0.75, abs(sin(v * 42.0 + u * 3.0)));
            col = mix(col * 0.85, vec3(1.0, 0.97, 0.90), pleatHighlight * 0.55);
            alpha = frill * (1.0 - pow(v, 1.6)) * 0.82;
          } else {
            float core = exp(-u * u * 4.5);
            float bead = 0.85 + 0.15 * sin(v * 55.0 - uTime * 4.0);
            alpha = core * (1.0 - pow(v, 1.35)) * bead * 0.80;
          }

          if (alpha < 0.02) discard;

          if (vWorldPos.y < 0.0) {
            float subDepth = -vWorldPos.y;
            vec3 waterTint = mix(vec3(0.10, 0.78, 0.78), vec3(0.03, 0.38, 0.62), clamp(subDepth / 3.2, 0.0, 1.0));
            float fog = (1.0 - exp(-subDepth * 0.25)) * (1.0 - uWaterClarity * 0.68);
            col = mix(col, waterTint, clamp(fog, 0.0, 0.75));
          }

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMaterial);
    ribbonMesh.frustumCulled = false;
    ribbonMesh.renderOrder = 3;
    scene.add(ribbonMesh);

    const creatures = [];
    let nextCreatureId = 1;

    function createJellyRibbonChains(x, y, z, isNettle, scale) {
      const chains = [];
      for (let r = 0; r < 12; r++) {
        const isOral = r < 4;
        const count = isOral ? 4 : 8;
        const idxInGroup = isOral ? r : r - 4;
        const angle = (idxInGroup / count) * Math.PI * 2 + (isOral ? 0.35 : 0.12);
        const radius = (isOral ? 0.18 : 0.68) * scale;
        const totalLen = isNettle
          ? (isOral ? 1.55 : 2.35 + (r % 3) * 0.28) * scale
          : (isOral ? 0.68 : 0.44 + (r % 2) * 0.1) * scale;
        const segLen = totalLen / (NODES_PER_RIBBON - 1);
        const width = isOral
          ? (isNettle ? 0.16 : 0.10) * scale
          : (isNettle ? 0.036 : 0.022) * scale;

        const nodes = [];
        for (let k = 0; k < NODES_PER_RIBBON; k++) {
          nodes.push({
            x: x + Math.cos(angle) * radius,
            y: y - k * segLen,
            z: z + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
            vz: 0
          });
        }

        chains.push({ isOral, angle, radius, segLen, width, nodes });
      }
      return chains;
    }

    function findOpenSeaUv() {
      for (let attempt = 0; attempt < 25; attempt++) {
        const u = 0.24 + Math.random() * 0.66;
        const v = 0.14 + Math.random() * 0.72;
        if (waterSystem.getUvBathymetry(u, v) > 0.65) {
          return { u, v };
        }
      }
      return { u: 0.58, v: 0.44 };
    }

    function uvToXZ(u, v) {
      const { worldW, worldH } = waterSystem.getWorldSize();
      return {
        x: (u - 0.5) * worldW,
        z: (0.5 - v) * worldH
      };
    }

    function xzToUv(x, z) {
      const { worldW, worldH } = waterSystem.getWorldSize();
      return {
        u: x / worldW + 0.5,
        v: 0.5 - z / worldH
      };
    }

    function spawnCreature(species, options = {}) {
      if (creatures.length >= MAX_CREATURES) {
        const idxToRemove = creatures.findIndex((c) => c.state !== "hovered");
        if (idxToRemove !== -1) creatures.splice(idxToRemove, 1);
        else return null;
      }

      const isRay = species === "manta" || species === "eagle" || species === "stingray";
      let spotXZ;
      if (options.u !== undefined && options.v !== undefined) {
        spotXZ = uvToXZ(options.u, options.v);
      } else if (options.x !== undefined && options.z !== undefined) {
        spotXZ = { x: options.x, z: options.z };
      } else {
        const uv = findOpenSeaUv();
        spotXZ = uvToXZ(uv.u, uv.v);
      }

      const uv = xzToUv(spotXZ.x, spotXZ.z);
      const bedDepth = Math.max(0.45, waterSystem.getUvBathymetry(uv.u, uv.v));
      const defaultY = species === "stingray"
        ? -Math.min(bedDepth * 0.85, 1.45)
        : (isRay ? -0.42 - Math.random() * 0.50 : -0.36 - Math.random() * 0.42);

      const yaw = options.yaw !== undefined ? options.yaw : Math.random() * Math.PI * 2;
      const scale = species === "manta"
        ? 1.15 + Math.random() * 0.22
        : species === "eagle"
          ? 0.96 + Math.random() * 0.18
          : species === "stingray"
            ? 0.82 + Math.random() * 0.14
            : species === "nettle"
              ? 0.76 + Math.random() * 0.14
              : 0.72 + Math.random() * 0.14;

      const c = {
        id: nextCreatureId++,
        species,
        isRay,
        speciesId: species === "manta" ? 0 : species === "eagle" ? 1 : species === "stingray" ? 2 : (species === "moon" ? 0 : 1),
        state: options.state || "swimming",
        x: spotXZ.x,
        y: options.y !== undefined ? options.y : defaultY,
        z: spotXZ.z,
        vx: options.vx || 0,
        vy: options.vy || 0,
        vz: options.vz || 0,
        yaw,
        targetYaw: yaw,
        turnRate: 0,
        turnBend: 0,
        rollBank: 0,
        pitch: options.pitch || 0,
        speed: species === "manta" ? 2.35 : species === "eagle" ? 2.55 : species === "stingray" ? 1.65 : 0.45,
        baseSpeed: species === "manta" ? 2.35 : species === "eagle" ? 2.55 : species === "stingray" ? 1.65 : 0.45,
        phase: Math.random() * Math.PI * 2,
        flapAmp: 1.0,
        scale,
        sandBurial: 0.0,
        stateTimer: 4.0 + Math.random() * 9.0,
        wakeTimer: 0.0,
        dripTimer: 0.0,
        axis: new THREE.Vector3(Math.sin(yaw) * 0.75, 0.42, Math.cos(yaw) * 0.75).normalize(),
        targetAxis: new THREE.Vector3(Math.sin(yaw) * 0.75, 0.42, Math.cos(yaw) * 0.75).normalize(),
        ribbons: !isRay ? createJellyRibbonChains(spotXZ.x, options.y !== undefined ? options.y : defaultY, spotXZ.z, species === "nettle", scale) : null
      };

      creatures.push(c);
      return c;
    }

    function startleRay(c, awayFromX, awayFromZ, rippleMult = 1.0) {
      const dx = c.x - awayFromX;
      const dz = c.z - awayFromZ;
      const escapeYaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.45;

      if (c.species === "stingray" && (c.state === "resting" || c.sandBurial > 0.15)) {
        waterSystem.spawnSandSiltCloudWorld(c.x, -c.z, c.y);
        const uv = xzToUv(c.x, c.z);
        waterSystem.addWaterImpulseUv(uv.u, uv.v, 0.022, -0.35, rippleMult);
        if (sound) sound.playSplash(0.35);
      }

      c.state = "swimming";
      c.sandBurial = 0.0;
      c.targetYaw = escapeYaw;
      c.speed = c.baseSpeed * 2.55;
      c.stateTimer = 5.0 + Math.random() * 6.0;
      const uv = xzToUv(c.x, c.z);
      waterSystem.addWaterImpulseUv(uv.u, uv.v, 0.018, -0.32, rippleMult);
    }

    function triggerRayBreach(c, rippleMult = 1.0) {
      if (c.state !== "swimming" || (c.species !== "manta" && c.species !== "eagle")) return;
      c.state = "breaching";
      c.y = 0.02;
      const launchSpeed = c.baseSpeed * 1.45;
      c.vx = Math.sin(c.yaw) * launchSpeed;
      c.vz = Math.cos(c.yaw) * launchSpeed;
      c.vy = 7.6 + Math.random() * 1.4;
      c.pitch = 0.55; // Positive pitch lifts +Z head upward!
      c.breachFlipMode = Math.random() < 0.5 ? "backflip" : "barrel";
      c.breachProgress = 0.0;
      const uv = xzToUv(c.x, c.z);
      waterSystem.spawnWaterSplashUv(uv.u, uv.v, 0.95, sound, rippleMult);
    }

    const tmpTangent = new THREE.Vector3();
    const tmpToCam = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpUp = new THREE.Vector3();
    const tmpRightBasis = new THREE.Vector3();
    const tmpFwdBasis = new THREE.Vector3();
    const camPosXZ = new THREE.Vector3(0, 35, 0.01);

    function update(dt, time, { isWhirlpool, whirlStrength, whirlpoolUv, settings = {}, swimSpeedMult, rippleStrengthMult, waterClarity, causticsIntensity, meteorAge = -1 }) {
      const { worldW, worldH } = waterSystem.getWorldSize();
      const aspect = waterSystem.getAspect();
      const speedMult = swimSpeedMult ?? settings.fishSpeed ?? 1.0;
      const rippleMult = rippleStrengthMult ?? settings.rippleStrength ?? 1.0;
      const clarityVal = waterClarity ?? clamp((settings.clarity ?? 1.15) * 0.78, 0.15, 1.0);
      const causticsVal = causticsIntensity ?? settings.caustics ?? 1.0;
      const wStr = typeof whirlStrength === 'number' ? whirlStrength : (isWhirlpool ? 1.0 : 0.0);
      const hasVortex = wStr > 0.01 && whirlpoolUv;
      rayMaterial.uniforms.uTime.value = time;
      rayMaterial.uniforms.uWaterClarity.value = clarityVal;
      rayMaterial.uniforms.uCausticsIntensity.value = causticsVal;
      jellyBellMaterial.uniforms.uTime.value = time;
      jellyBellMaterial.uniforms.uWaterClarity.value = clarityVal;
      ribbonMaterial.uniforms.uTime.value = time;
      ribbonMaterial.uniforms.uWaterClarity.value = clarityVal;
      const whirlpoolXZ = (whirlpoolUv && typeof whirlpoolUv.u === "number" && typeof whirlpoolUv.v === "number")
        ? uvToXZ(whirlpoolUv.u, whirlpoolUv.v)
        : { x: 0, z: 0 };

      let rayIdx = 0;
      let jellyIdx = 0;
      let shadowIdx = 0;
      let ribbonVertPtr = 0;
      let ribbonTriIndicesCount = 0;

      const rayAnimAttr = rayInstancedGeom.attributes.aInstAnim;
      const rayStateAttr = rayInstancedGeom.attributes.aInstState;
      const rayPoseAttr = rayInstancedGeom.attributes.aInstPose;

      const jellyPoseAttr = jellyBellGeom.attributes.aInstPose;
      const jellyAxisAttr = jellyBellGeom.attributes.aInstAxis;
      const jellyMetaAttr = jellyBellGeom.attributes.aInstMeta;

      for (let i = 0; i < creatures.length; i++) {
        const c = creatures[i];
        const inMeteorFlight = root.OceanMeteor.isFlying(meteorAge, i);
        const uv = xzToUv(c.x, c.z);
        if (root.OceanMeteor.reentry(c, meteorAge, i)) {
          // A pre-impact rest or drag must not hold a resident still after landing.
          c.state = "swimming";
          c.sandBurial = 0;
          c.stateTimer = Math.max(c.stateTimer, 2);
          c.speed = Math.max(c.speed, c.baseSpeed * speedMult * 0.72);
          c.y = Math.min(c.y, -0.25);
          c.vy = 0;
          c.airborne = false;
          c.airborneVy = 0;
          if (!c.isRay && Math.hypot(c.vx, c.vz) < 0.001) {
            c.vx = Math.sin(c.yaw) * c.baseSpeed * speedMult;
            c.vz = Math.cos(c.yaw) * c.baseSpeed * speedMult;
          }
          waterSystem.spawnWaterSplashUv(uv.u, uv.v, 0.85, sound, rippleMult);
        }
        const localDepth = waterSystem.getUvBathymetry(uv.u, uv.v);
        const effectiveScale = c.scale;

        let renderX = c.x;
        let renderY = c.y;
        let renderZ = c.z;
        let renderRoll = c.rollBank;
        let renderPitch = c.pitch;

        if (inMeteorFlight) {
          const flown = root.OceanMeteor.flight(
            { u: uv.u, v: uv.v, z: c.y, roll: c.rollBank, flip: c.pitch },
            meteorAge,
            i,
            aspect
          );
          const fXZ = uvToXZ(flown.u, flown.v);
          renderX = fXZ.x;
          renderZ = fXZ.z;
          renderY = flown.z;
          renderRoll = flown.roll;
          renderPitch = flown.flip;
        }

        if (shadowIdx < waterSystem.MAX_SHADOW_CASTERS) {
          const shadowRad = c.isRay ? effectiveScale * 1.25 : effectiveScale * 0.72;
          waterSystem.creatureShadowData[shadowIdx].set(renderX, renderY, renderZ, shadowRad);
          shadowIdx++;
        }

        if (c.isRay) {
          if (!inMeteorFlight) {
            if (c.state === "hovered") {
              c.phase += dt * 6.5 * speedMult;
              c.flapAmp = 0.85;
              c.pitch = THREE.MathUtils.lerp(c.pitch, 0.0, dt * 6.0);
              c.rollBank = THREE.MathUtils.lerp(c.rollBank, 0.0, dt * 6.0);
              c.turnBend = THREE.MathUtils.lerp(c.turnBend, 0.0, dt * 6.0);
            } else if (c.state === "thrown") {
              c.vy -= 14.5 * dt;
              c.x += c.vx * dt;
              c.y += c.vy * dt;
              c.z += c.vz * dt;
              c.phase += dt * 8.0 * speedMult;
              c.flapAmp = 0.9;
              const hSpd = Math.hypot(c.vx, c.vz) + 0.001;
              c.pitch = clamp(Math.atan2(c.vy, hSpd) * 0.65, -0.95, 0.95);

              if (c.y <= -0.05) {
                const hitUv = xzToUv(c.x, c.z);
                waterSystem.spawnWaterSplashUv(hitUv.u, hitUv.v, 1.15, sound, rippleMult);
                c.state = "swimming";
                c.y = -0.25;
                c.speed = c.baseSpeed * 1.45;
                c.pitch = 0.0;
              }
            } else if (c.state === "breaching") {
              c.vy -= 12.8 * dt;
              c.x += c.vx * dt;
              c.y += c.vy * dt;
              c.z += c.vz * dt;
              c.phase += dt * 7.5 * speedMult;
              c.flapAmp = 0.65;
              c.breachProgress = clamp((c.breachProgress || 0) + dt * 0.92, 0.0, 1.0);
              const flipAngle = smoothstep(0.05, 0.92, c.breachProgress) * Math.PI * 2.0;

              if (c.breachFlipMode === "barrel") {
                c.rollBank = flipAngle;
                c.pitch = clamp(c.vy * 0.06, -0.45, 0.45);
              } else {
                c.pitch = flipAngle;
                c.rollBank = 0.0;
              }

              if (c.y <= -0.05 && c.vy < 0) {
                const hitUv = xzToUv(c.x, c.z);
                waterSystem.spawnWaterSplashUv(hitUv.u, hitUv.v, 1.35, sound, rippleMult);
                c.state = "swimming";
                c.y = -0.35;
                c.pitch = 0.0;
                c.rollBank = 0.0;
                c.speed = c.baseSpeed * 1.35;
                c.stateTimer = 8.0 + Math.random() * 10.0;
              }
            } else if (c.state === "resting") {
              c.sandBurial = THREE.MathUtils.lerp(c.sandBurial, 0.85, dt * 1.8);
              c.speed = THREE.MathUtils.lerp(c.speed, 0.0, dt * 4.0);
              c.flapAmp = THREE.MathUtils.lerp(c.flapAmp, 0.14, dt * 3.0);
              c.phase += dt * 2.2;
              const targetBedY = -Math.max(0.35, Math.min(localDepth * 0.9, 1.65));
              c.y = THREE.MathUtils.lerp(c.y, targetBedY, dt * 3.5);
              c.rollBank = THREE.MathUtils.lerp(c.rollBank, 0.0, dt * 5.0);
              c.turnBend = THREE.MathUtils.lerp(c.turnBend, 0.0, dt * 5.0);

              c.stateTimer -= dt;
              if (c.stateTimer <= 0) {
                c.state = "swimming";
                c.sandBurial = 0.0;
                c.stateTimer = 7.0 + Math.random() * 9.0;
                c.targetYaw = c.yaw + (Math.random() - 0.5) * 1.6;
              }
            } else {
              c.sandBurial = THREE.MathUtils.lerp(c.sandBurial, 0.0, dt * 3.5);
              c.speed = THREE.MathUtils.lerp(c.speed, c.baseSpeed * speedMult, dt * 1.8);
              const speedRatio = c.speed / Math.max(0.1, c.baseSpeed);
              const freq = (c.species === "stingray" ? 5.8 : 3.6) * (0.65 + 0.45 * speedRatio);
              c.phase += dt * freq;
              c.flapAmp = THREE.MathUtils.lerp(c.flapAmp, clamp(0.75 + 0.25 * speedRatio, 0.6, 1.35), dt * 4.0);

              const lookAheadDist = 2.6;
              const probeX = c.x + Math.sin(c.yaw) * lookAheadDist;
              const probeZ = c.z + Math.cos(c.yaw) * lookAheadDist;
              const probeUv = xzToUv(probeX, probeZ);
              const probeDepth = waterSystem.getUvBathymetry(probeUv.u, probeUv.v);

              const isOffscreen = Math.abs(c.x) > worldW * 0.50 || Math.abs(c.z) > worldH * 0.50;
              if (isOffscreen) {
                c.offscreenTimer = (c.offscreenTimer || 0) + dt;
              } else {
                c.offscreenTimer = 0;
              }

              // Extended roaming buffer allows rays to swim offscreen up to 60% of world width/height
              const outerMarginX = worldW * 0.60;
              const outerMarginZ = worldH * 0.60;
              const outOfBuffer = Math.abs(probeX) > outerMarginX || Math.abs(probeZ) > outerMarginZ || (c.offscreenTimer > 3.8);
              // Avoid dry sand beach (top-left beach: probeU < 0.38, probeV > 0.52 in UV space)
              const shoreDist = waterSystem.getShoreDistance ? waterSystem.getShoreDistance(probeUv.u, probeUv.v) : 1.0;
              const shallowBeach = shoreDist < 0.22 || (probeDepth < 0.62 && probeUv.u < 0.38 && probeUv.v > 0.52);

              if (shallowBeach || outOfBuffer) {
                // Smoothly steer back toward the open visible lagoon
                const safeX = (Math.random() - 0.5) * worldW * 0.30;
                const safeZ = (Math.random() - 0.5) * worldH * 0.30;
                c.targetYaw = Math.atan2(safeX - c.x, safeZ - c.z) + (Math.random() - 0.5) * 0.35;
              } else if (Math.random() < dt * 0.45) {
                // Natural continuous wander
                c.targetYaw += (Math.random() - 0.5) * 0.75;
              }

              // Whirlpool progressive suction & outermost concentric orbiting
              if (hasVortex) {
                const dxW = whirlpoolXZ.x - c.x;
                const dzW = whirlpoolXZ.z - c.z;
                const distW = Math.hypot(dxW, dzW) + 0.001;
                // Moderate localized attraction zone (does not pull the whole ocean)
                const rInfluence = 1.8 + 3.6 * wStr;
                if (distW < rInfluence) {
                  const capture = clamp((rInfluence - distW) / (rInfluence * 0.45), 0.0, 1.0) * wStr;
                  // Outermost ray tier: r ~ 3.2 to 3.6 meters in world space
                  const rayOrbitR = 3.2 + 0.4 * ((c.id || 0) % 3);
                  const rDiff = distW - rayOrbitR;
                  const radialPull = clamp(rDiff * 2.2, -0.8, 3.2) * (0.95 + 1.25 * wStr);
                  c.x += (dxW / distW) * radialPull * dt * capture;
                  c.z += (dzW / distW) * radialPull * dt * capture;

                  // Tangential counter-clockwise yaw
                  const tangYaw = Math.atan2(dzW, -dxW);
                  const diffW = Math.atan2(Math.sin(tangYaw - c.targetYaw), Math.cos(tangYaw - c.targetYaw));
                  c.targetYaw += diffW * capture * dt * 3.4;
                  c.speed = mix(c.speed, (1.15 + 0.35 * wStr) * speedMult, capture);
                  c.rollBank = mix(c.rollBank, -0.42 * wStr, capture * dt * 4.0);
                }
              }

              if (c.airborne) {
                c.airborneVy = (c.airborneVy || 5.0) - 11.5 * dt;
                c.y += c.airborneVy * dt;
                c.rollBank += dt * 5.0;
                c.pitch += dt * 3.5;
                if (c.y <= -c.targetDepth) {
                  c.airborne = false;
                  c.y = -c.targetDepth;
                  c.airborneVy = 0;
                  const hitUv = xzToUv(c.x, c.z);
                  waterSystem.spawnWaterSplashUv(hitUv.u, hitUv.v, 1.45, sound, rippleMult);
                }
              }

              const angleDiff = Math.atan2(Math.sin(c.targetYaw - c.yaw), Math.cos(c.targetYaw - c.yaw));
              const maxTurn = (c.species === "stingray" ? 2.4 : 1.85) * dt * (0.7 + 0.3 * speedMult);
              const deltaYaw = clamp(angleDiff, -maxTurn, maxTurn);
              c.yaw += deltaYaw;
              c.turnRate = deltaYaw / Math.max(dt, 0.001);

              c.rollBank = THREE.MathUtils.lerp(c.rollBank, clamp(-c.turnRate * 0.34, -0.62, 0.62), dt * 5.5);
              c.turnBend = THREE.MathUtils.lerp(c.turnBend, clamp(c.turnRate * 0.28, -0.55, 0.55), dt * 5.5);
              c.pitch = THREE.MathUtils.lerp(c.pitch, 0.0, dt * 5.0);

              // Extended outer clamp allows seamless swimming out of view and returning
              c.x = clamp(c.x + Math.sin(c.yaw) * c.speed * dt, -worldW * 0.64, worldW * 0.64);
              c.z = clamp(c.z + Math.cos(c.yaw) * c.speed * dt, -worldH * 0.64, worldH * 0.64);

              // Firm barrier: never penetrate onto dry beach sand
              if (waterSystem.enforceBeachBoundary) {
                const curUv = xzToUv(c.x, c.z);
                const bRes = waterSystem.enforceBeachBoundary(curUv.u, curUv.v, 0.09);
                if (bRes.clamped) {
                  const fixedXZ = uvToXZ(bRes.u, bRes.v);
                  c.x = fixedXZ.x;
                  c.z = fixedXZ.z;
                  c.targetYaw = Math.atan2(0 - c.x, 0 - c.z);
                  c.yaw = c.targetYaw;
                }
              }

              const targetCruiseY = c.species === "stingray"
                ? -Math.max(0.35, Math.min(localDepth * 0.82, 1.45))
                : -0.32 - 0.18 * Math.sin(time * 0.7 + c.id);
              c.y = THREE.MathUtils.lerp(c.y, targetCruiseY, dt * 2.5);

              c.wakeTimer -= dt;
              if (c.y > -0.65 && c.wakeTimer <= 0.0) {
                c.wakeTimer = 0.085;
                const wakeStrength = clamp(0.14 * speedRatio, 0.08, 0.28);
                const wakeUv = xzToUv(
                  c.x - Math.sin(c.yaw) * effectiveScale * 0.35,
                  c.z - Math.cos(c.yaw) * effectiveScale * 0.35
                );
                waterSystem.addWaterImpulseUv(wakeUv.u, wakeUv.v, 0.016 * effectiveScale, -wakeStrength, rippleMult);
              }

              c.stateTimer -= dt;
              if (c.stateTimer <= 0) {
                const insideView = Math.abs(c.x) < worldW * 0.46 && Math.abs(c.z) < worldH * 0.46;
                if (c.species === "stingray" && localDepth > 0.55 && insideView) {
                  c.state = "resting";
                  c.stateTimer = 5.0 + Math.random() * 7.0;
                } else if ((c.species === "manta" || c.species === "eagle") && localDepth > 1.2 && insideView && Math.random() < 0.45) {
                  triggerRayBreach(c, rippleMult);
                } else {
                  c.stateTimer = 6.0 + Math.random() * 9.0;
                }
              }
            }
            renderX = c.x;
            renderY = c.y;
            renderZ = c.z;
            renderRoll = c.rollBank;
            renderPitch = c.pitch;
          }

          rayAnimAttr.setXYZW(rayIdx, c.phase, c.flapAmp, c.speciesId, renderPitch);
          rayStateAttr.setXYZW(rayIdx, c.turnBend, renderRoll, c.sandBurial, effectiveScale);
          rayPoseAttr.setXYZW(rayIdx, renderX, renderY, renderZ, c.yaw);
          rayIdx++;
        } else {
          // JELLYFISH
          const isNettle = c.species === "nettle";
          const pulseFreq = (isNettle ? 0.52 : 0.62) * speedMult;
          c.phase = (c.phase + dt * pulseFreq) % 1.0;
          const { squeeze, thrust } = evalJellyPulse(c.phase);

          if (!inMeteorFlight) {
            if (c.state === "hovered") {
              c.vx = 0;
              c.vy = 0;
              c.vz = 0;
              c.axis.lerp(new THREE.Vector3(0, 1, 0), dt * 5.0).normalize();

              c.dripTimer -= dt;
              if (c.dripTimer <= 0 && c.ribbons) {
                c.dripTimer = 0.065 + Math.random() * 0.06;
                const randChain = c.ribbons[Math.floor(Math.random() * c.ribbons.length)];
                const tipNode = randChain.nodes[NODES_PER_RIBBON - 1];
                waterSystem.spawnTentacleDripWorld(tipNode.x, -tipNode.z, tipNode.y);
              }
            } else if (c.state === "thrown") {
              c.vy -= 14.2 * dt;
              c.x += c.vx * dt;
              c.y += c.vy * dt;
              c.z += c.vz * dt;
              c.axis.set(c.vx, c.vy + 4.0, c.vz).normalize();

              if (c.y <= -0.05) {
                const hitUv = xzToUv(c.x, c.z);
                waterSystem.spawnWaterSplashUv(hitUv.u, hitUv.v, 0.95, sound, rippleMult);
                c.state = "swimming";
                c.y = -0.35;
                c.vx *= 0.25;
                c.vy = 0;
                c.vz *= 0.25;
              }
            } else {
              if (Math.random() < dt * 0.35) {
                const wanderYaw = Math.atan2(c.targetAxis.x, c.targetAxis.z) + (Math.random() - 0.5) * 0.9;
                c.targetAxis.set(Math.sin(wanderYaw) * 0.85, 0.28 + Math.random() * 0.25, Math.cos(wanderYaw) * 0.85).normalize();
              }

              const isOffscreen = Math.abs(c.x) > worldW * 0.50 || Math.abs(c.z) > worldH * 0.50;
              const outerMarginX = worldW * 0.58;
              const outerMarginZ = worldH * 0.58;
              const jellyUv = xzToUv(c.x, c.z);
              const shoreDist = waterSystem.getShoreDistance ? waterSystem.getShoreDistance(jellyUv.u, jellyUv.v) : 1.0;
              const shallowBeach = shoreDist < 0.22 || (localDepth < 0.65 && c.x < -worldW * 0.15 && c.z > worldH * 0.15);

              if (shallowBeach || Math.abs(c.x) > outerMarginX || Math.abs(c.z) > outerMarginZ) {
                c.targetAxis.set((Math.random() - 0.5) * worldW * 0.25 - c.x, 0.35, (Math.random() - 0.5) * worldH * 0.25 - c.z).normalize();
              } else if (isOffscreen && Math.random() < dt * 0.4) {
                // Gently steer drifting jellyfish back toward the central sea
                c.targetAxis.set(0 - c.x, 0.35, 0 - c.z).normalize();
              }

              let currentVx = Math.sin(time * 0.35 + c.z * 0.2) * 0.18;
              let currentVz = Math.cos(time * 0.30 + c.x * 0.2) * 0.18;

              // Whirlpool progressive suction & near-inner concentric orbiting
              if (hasVortex) {
                const dxW = whirlpoolXZ.x - c.x;
                const dzW = whirlpoolXZ.z - c.z;
                const distW = Math.hypot(dxW, dzW) + 0.05;
                // Moderate localized attraction zone (does not pull the whole ocean)
                const rInfluence = 1.8 + 3.6 * wStr;
                if (distW < rInfluence) {
                  const capture = clamp((rInfluence - distW) / (rInfluence * 0.45), 0.0, 1.0) * wStr;
                  // Near-inner jellyfish tier: r ~ 1.2 to 1.6 meters in world space
                  const jellyOrbitR = 1.25 + 0.35 * ((c.id || 0) % 3);
                  const rDiff = distW - jellyOrbitR;
                  const radialPull = clamp(rDiff * 2.0, -0.8, 2.8) * (0.85 + 1.15 * wStr);
                  const nxW = dxW / distW;
                  const nzW = dzW / distW;
                  currentVx += (nxW * radialPull - nzW * (1.6 + 1.2 * wStr)) * capture;
                  currentVz += (nzW * radialPull + nxW * (1.6 + 1.2 * wStr)) * capture;
                  c.targetAxis.set(-nzW * 0.75 + nxW * 0.35, 0.40, nxW * 0.75 + nzW * 0.35).normalize();
                }
              }

              if (c.airborne) {
                c.airborneVy = (c.airborneVy || 4.0) - 10.0 * dt;
                c.y += c.airborneVy * dt;
                if (c.y <= -c.targetDepth) {
                  c.airborne = false;
                  c.y = -c.targetDepth;
                  c.airborneVy = 0;
                  const hitUv = xzToUv(c.x, c.z);
                  waterSystem.spawnWaterSplashUv(hitUv.u, hitUv.v, 0.95, sound, rippleMult);
                }
              }

              c.axis.lerp(c.targetAxis, dt * 2.2).normalize();
              const pulseSpeed = (isNettle ? 1.35 : 0.95) * speedMult * Math.max(0.05, thrust);
              const targetVx = c.axis.x * pulseSpeed + currentVx;
              const targetVz = c.axis.z * pulseSpeed + currentVz;

              c.vx = THREE.MathUtils.lerp(c.vx, targetVx, dt * 3.2);
              c.vz = THREE.MathUtils.lerp(c.vz, targetVz, dt * 3.2);
              c.x = clamp(c.x + c.vx * dt, -worldW * 0.62, worldW * 0.62);
              c.z = clamp(c.z + c.vz * dt, -worldH * 0.62, worldH * 0.62);

              // Firm barrier: never penetrate onto dry beach sand
              if (waterSystem.enforceBeachBoundary) {
                const curUv = xzToUv(c.x, c.z);
                const bRes = waterSystem.enforceBeachBoundary(curUv.u, curUv.v, 0.10);
                if (bRes.clamped) {
                  const fixedXZ = uvToXZ(bRes.u, bRes.v);
                  c.x = fixedXZ.x;
                  c.z = fixedXZ.z;
                  c.targetAxis.set(bRes.normalU, 0.35, bRes.normalV).normalize();
                  c.vx = bRes.normalU * 0.35;
                  c.vz = bRes.normalV * 0.35;
                }
              }

              const targetJellyY = -0.36 - 0.15 * Math.sin(time * 0.9 + c.id);
              c.y = THREE.MathUtils.lerp(c.y, targetJellyY, dt * 2.5);

              if (thrust > 0.85 && Math.random() < 0.18) {
                const jUv = xzToUv(c.x, c.z);
                waterSystem.addWaterImpulseUv(jUv.u, jUv.v, 0.015 * effectiveScale, -0.09, rippleMult);
              }
            }
            renderX = c.x;
            renderY = c.y;
            renderZ = c.z;
          }

          jellyPoseAttr.setXYZW(jellyIdx, renderX, renderY, renderZ, effectiveScale);
          jellyAxisAttr.setXYZW(jellyIdx, c.axis.x, c.axis.y, c.axis.z, c.phase);
          jellyMetaAttr.setXYZW(jellyIdx, isNettle ? 1.0 : 0.0, squeeze, c.id * 0.17, 0.0);
          jellyIdx++;

          if (c.ribbons) {
            tmpUp.copy(c.axis).normalize();
            const helper = Math.abs(tmpUp.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            tmpRightBasis.crossVectors(helper, tmpUp).normalize();
            tmpFwdBasis.crossVectors(tmpUp, tmpRightBasis).normalize();

            const inAir = renderY > 0.12;
            const colOral = isNettle ? [1.0, 0.93, 0.78] : [0.96, 0.72, 0.88];
            const colTent = isNettle ? [0.86, 0.34, 0.14] : [0.78, 0.92, 1.0];

            for (let r = 0; r < c.ribbons.length; r++) {
              const chain = c.ribbons[r];
              const nodes = chain.nodes;
              const ca = Math.cos(chain.angle);
              const sa = Math.sin(chain.angle);
              const rad = chain.radius * (1.0 - squeeze * 0.18);
              const scaledSegLen = chain.segLen;
              const scaledWidth = chain.width;

              const attachOffset = -0.22 * effectiveScale;
              nodes[0].x = renderX + (tmpRightBasis.x * ca + tmpFwdBasis.x * sa) * rad + tmpUp.x * attachOffset;
              nodes[0].y = renderY + (tmpRightBasis.y * ca + tmpFwdBasis.y * sa) * rad + tmpUp.y * attachOffset;
              nodes[0].z = renderZ + (tmpRightBasis.z * ca + tmpFwdBasis.z * sa) * rad + tmpUp.z * attachOffset;

              const gravityY = inAir ? -9.5 : -1.35;
              const followFactor = inAir ? 0.24 : 0.18;

              for (let k = 1; k < NODES_PER_RIBBON; k++) {
                const prev = nodes[k - 1];
                const cur = nodes[k];
                const frac = k / (NODES_PER_RIBBON - 1);

                const waveAmp = inAir ? 0.015 : (chain.isOral ? 0.045 : 0.075) * frac;
                const wx = Math.sin(time * 2.8 - k * 0.55 + r * 1.3) * waveAmp;
                const wz = Math.cos(time * 2.5 - k * 0.55 + r * 1.7) * waveAmp;

                const swimSpeed = Math.hypot(c.vx, c.vz);
                const trailWeight = inAir ? 0.05 : clamp(swimSpeed * 0.85, 0.12, 0.92);
                const dirX = mix(0, -tmpUp.x, trailWeight);
                const dirY = mix(-1.0, -tmpUp.y - 0.35, trailWeight);
                const dirZ = mix(0, -tmpUp.z, trailWeight);
                const dirLen = Math.hypot(dirX, dirY, dirZ) + 0.0001;

                const targetX = prev.x + (dirX / dirLen) * scaledSegLen + wx;
                const targetY = prev.y + (dirY / dirLen) * scaledSegLen + gravityY * 0.015 * dt;
                const targetZ = prev.z + (dirZ / dirLen) * scaledSegLen + wz;

                cur.x += (targetX - cur.x) * clamp(dt * (11.0 - frac * 4.5) / followFactor * 0.18, 0.08, 0.65);
                cur.y += (targetY - cur.y) * clamp(dt * (11.0 - frac * 4.5) / followFactor * 0.18, 0.08, 0.65);
                cur.z += (targetZ - cur.z) * clamp(dt * (11.0 - frac * 4.5) / followFactor * 0.18, 0.08, 0.65);

                const dx = cur.x - prev.x;
                const dy = cur.y - prev.y;
                const dz = cur.z - prev.z;
                const dist = Math.hypot(dx, dy, dz) + 0.0001;
                cur.x = prev.x + (dx / dist) * scaledSegLen;
                cur.y = prev.y + (dy / dist) * scaledSegLen;
                cur.z = prev.z + (dz / dist) * scaledSegLen;
              }

              const rgb = chain.isOral ? colOral : colTent;
              const rType = chain.isOral ? 0.0 : 1.0;

              for (let k = 0; k < NODES_PER_RIBBON; k++) {
                const nCur = nodes[k];
                const nPrev = nodes[Math.max(0, k - 1)];
                const nNext = nodes[Math.min(NODES_PER_RIBBON - 1, k + 1)];

                tmpTangent.set(nNext.x - nPrev.x, nNext.y - nPrev.y, nNext.z - nPrev.z).normalize();
                tmpToCam.set(camPosXZ.x - nCur.x, camPosXZ.y - nCur.y, camPosXZ.z - nCur.z).normalize();
                tmpRight.crossVectors(tmpTangent, tmpToCam);
                if (tmpRight.lengthSq() < 0.0001) tmpRight.set(1, 0, 0);
                else tmpRight.normalize();

                const frac = k / (NODES_PER_RIBBON - 1);
                const halfW = scaledWidth * (1.0 - frac * 0.62);

                for (let side = 0; side < 2; side++) {
                  const sgn = side === 0 ? -1.0 : 1.0;
                  ribbonPositions[ribbonVertPtr * 3] = nCur.x + tmpRight.x * halfW * sgn;
                  ribbonPositions[ribbonVertPtr * 3 + 1] = nCur.y + tmpRight.y * halfW * sgn;
                  ribbonPositions[ribbonVertPtr * 3 + 2] = nCur.z + tmpRight.z * halfW * sgn;

                  ribbonUvs[ribbonVertPtr * 2] = side;
                  ribbonUvs[ribbonVertPtr * 2 + 1] = frac;

                  ribbonColors[ribbonVertPtr * 4] = rgb[0];
                  ribbonColors[ribbonVertPtr * 4 + 1] = rgb[1];
                  ribbonColors[ribbonVertPtr * 4 + 2] = rgb[2];
                  ribbonColors[ribbonVertPtr * 4 + 3] = rType;
                  ribbonVertPtr++;
                }
              }
              ribbonTriIndicesCount += (NODES_PER_RIBBON - 1) * 6;
            }
          }
        }
      }

      rayInstancedGeom.instanceCount = rayIdx;
      if (rayIdx > 0) {
        rayAnimAttr.needsUpdate = true;
        rayStateAttr.needsUpdate = true;
        rayPoseAttr.needsUpdate = true;
      }

      jellyBellGeom.instanceCount = jellyIdx;
      if (jellyIdx > 0) {
        jellyPoseAttr.needsUpdate = true;
        jellyAxisAttr.needsUpdate = true;
        jellyMetaAttr.needsUpdate = true;
      }

      ribbonPosAttr.needsUpdate = true;
      ribbonUvAttr.needsUpdate = true;
      ribbonColAttr.needsUpdate = true;
      ribbonGeom.setDrawRange(0, ribbonTriIndicesCount);

      return shadowIdx;
    }

    function getCounts() {
      let rays = 0;
      let jellies = 0;
      for (let i = 0; i < creatures.length; i++) {
        if (creatures[i].isRay) rays++;
        else jellies++;
      }
      return { rays, jellies };
    }

    return {
      creatures,
      spawnCreature,
      startleRay,
      triggerRayBreach,
      update,
      getCounts,
      uvToXZ,
      xzToUv,
      findOpenSeaUv,
      rayMaterial,
      jellyBellMaterial,
      ribbonMaterial,
      createRayInstancedGeometry: () => createRayInstancedGeometry(THREE),
      createJellyBellInstancedGeometry: () => createJellyBellInstancedGeometry(THREE),
      ribbonIndices,
      NODES_PER_RIBBON
    };
  }

  root.OceanMarineLife = {
    createRaysAndJelliesSystem
  };
})(root);

}
