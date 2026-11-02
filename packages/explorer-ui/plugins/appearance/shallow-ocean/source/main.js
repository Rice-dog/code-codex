import {createPerformancePolicy} from '../performance.js';
import {createEventSchedule,COMMON_EVENTS,RARE_EVENTS} from '../event-schedule.js';
import {createWaterPointerProjection} from './water-pointer.js';
export function runScene(scope) {
const {window,document,requestAnimationFrame,setTimeout,clearTimeout,matchMedia,addEventListener,localStorage}=scope;
let innerWidth=scope.width,innerHeight=scope.height;const devicePixelRatio=globalThis.devicePixelRatio;
scope.onSize=()=>{innerWidth=scope.width;innerHeight=scope.height;};
const {OceanObjectOcclusion,OceanDriftDuo,OceanPenguinIce,OceanVisitors,OceanMeteor,OceanAudioEngine,OceanWaterSeabed,OceanMarineLife,OceanReefEcosystem,OceanOpening}=window;

'use strict';
(() => {
  const T = window.THREE;
  if (!T) {
    document.querySelector('#loading span').textContent = 'Three.js could not load. Check your connection and reload.';
    return;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const MAX_RAYS_JELLIES = 48;

  // Deterministic RNG for visitors and events
  let seed = 713802;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Parameter Defaults & Limits (matching ocean-shallows-background-effect)
  const defaults = {
      defaultCreaturesEnabled: 1,
    performanceMode: 0,
    silverCount: 72,
    reefCount: 12,
    clownCount: 6,
    sharkCount: 2,
    turtleCount: 2,
    beachSize: 1,
    fishSpeed: 1,
    fishSize: 1.15,
    schoolCohesion: 1,
    fleeRadius: 0.105,
    clarity: 1.15,
    caustics: 1.15,
    surfaceReflection: 0.30,
    sunGlint: 1.0,
    foamIntensity: 1.0,
    refractionScale: 1.0,
    shadowIntensity: 0.65,
    swell: 1.0,
    rippleStrength: 1.0,
    waterSpeed: 1.0,
    coralDensity: 1.2,
    grassDensity: 1.2,
    eventsEnabled: 1,
    introEnabled: 1,
    introDuration: 5.2,
    introIntensity: 1.0
  };

  const limits = {
      defaultCreaturesEnabled: [0,1,1],
    performanceMode: [0,3,1],
    silverCount: [0, 160, 1],
    reefCount: [0, 36, 1],
    clownCount: [0, 18, 1],
    sharkCount: [0, 8, 1],
    turtleCount: [0, 6, 1],
    beachSize: [0, 2, 0.05],
    fishSpeed: [0, 3, 0.05],
    fishSize: [0.5, 2, 0.05],
    schoolCohesion: [0.2, 2.5, 0.05],
    fleeRadius: [0.03, 0.25, 0.005],
    clarity: [0.4, 1.8, 0.05],
    caustics: [0, 2.5, 0.05],
    surfaceReflection: [0.0, 1.2, 0.05],
    sunGlint: [0.0, 3.0, 0.1],
    foamIntensity: [0.0, 2.5, 0.05],
    refractionScale: [0.0, 2.5, 0.05],
    shadowIntensity: [0.0, 1.0, 0.05],
    swell: [0, 2, 0.05],
    rippleStrength: [0, 2.5, 0.05],
    waterSpeed: [0, 2, 0.05],
    coralDensity: [0.3, 2, 0.1],
    grassDensity: [0, 2, 0.1],
    eventsEnabled: [0, 1, 1],
    introEnabled: [0, 1, 1],
    introDuration: [1.5, 12, 0.1],
    introIntensity: [0, 2, 0.05]
  };

  const STORAGE_KEY = 'ocean-shallows2-settings-v1';
  const settings = { ...defaults };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const key in defaults) {
      if (Number.isFinite(stored[key])) {
        settings[key] = clamp(stored[key], limits[key][0], limits[key][1]);
      }
    }
  } catch (e) {}

  // Renderer & Orthographic Top-Down Scene Setup
  const canvas = document.querySelector('#sea');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
  } catch (e) {
    document.querySelector('#loading span').textContent = 'WebGL is unavailable on this device.';
    return;
  }

  let W = innerWidth;
  let H = innerHeight;
  let aspect = W / H;
  const performancePolicy=createPerformancePolicy(settings.performanceMode);
  let quality = performancePolicy.pixelRatio(devicePixelRatio,W,H);

  renderer.setPixelRatio(quality);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x032539, 1);

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 80);
  camera.position.set(0, -0.01, 35);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  const opening = OceanOpening.create({ camera, title: document.querySelector('#intro-title') });
  const openingSettings = () => ({ enabled: settings.introEnabled, duration: settings.introDuration, intensity: settings.introIntensity });

  scene.add(new T.HemisphereLight(0xdff9ff, 0x3b6e68, 1.15));
  const sunLight = new T.DirectionalLight(0xfff4d8, 1.35);
  sunLight.position.set(8, 10, 22);
  scene.add(sunLight);

  // Audio Engine
  const sound = new OceanAudioEngine();

  // Water & Seabed Simulation System (preserving shallow ocean2's signature simulation & shaders)
  const waterSystem = OceanWaterSeabed.createWaterAndSeabedSystem({
    THREE: T,
    renderer,
    scene,
    initialSettings: {
      beachSize: settings.beachSize,
      coralDensity: settings.coralDensity,
      grassDensity: settings.grassDensity
    }
  });
  waterSystem.resize(aspect);

  // Coast distance function in UV space compatible with OceanVisitors & OceanMeteor
  function shore(u, v) {
    return waterSystem.getUvBathymetry(u, v) * 0.16;
  }

  function waterPoint(u, v) {
    u = clamp(u, 0.04, 0.96);
    v = clamp(v, 0.04, 0.96);
    for (let j = 0; j < 32 && waterSystem.getUvBathymetry(u, v) < 0.35; j++) {
      u = clamp(u + 0.014, 0.04, 0.96);
      v = clamp(v - 0.012, 0.04, 0.96);
    }
    return { u, v };
  }

  // Rays (Manta, Eagle Ray, Stingray) & Jellyfish (Moon Jelly, Sea Nettle) System
  const raysAndJellies = OceanMarineLife.createRaysAndJelliesSystem({
    THREE: T,
    scene,
    camera,
    waterSystem,
    sound
  });

  // Reef Ecosystem (3D Swaying Sea Anemones, Silver School, Reef Fish, Clownfish, Blacktip Reef Sharks, 960-fish Migration)
  const reefEcosystem = OceanReefEcosystem.createReefEcosystem({
    THREE: T,
    scene,
    waterSystem,
    sound
  });

  // Visitors Stage (Dolphins, Penguins on Ice Floes, SpongeBob & Patrick Drift Duo) & Rare Meteor Impact Stage
  const objectOcclusion = OceanObjectOcclusion.create(T);
  const guestStage = OceanVisitors.createStage({
    THREE: T,
    scene,
    toWorld: (u, v) => {
      const p = waterSystem.toWorld(u, v, 0);
      return new T.Vector3(p.x, p.y, 0);
    },
    aspect: () => aspect,
    splash: (u, v) => {
      waterSystem.spawnWaterSplashUv(u, v, 0.95, sound, settings.rippleStrength);
    },
    ripple: (u, v, strength = 0.08, radius = 0.012) => {
      waterSystem.addWaterImpulseUv(u, v, Math.max(0.008, radius), -Math.abs(strength) * 1.8, settings.rippleStrength);
    },
    breachSplash: (u, v, type) => {
      const intensity = type === 'in' ? 1.35 : 0.95;
      waterSystem.spawnWaterSplashUv(u, v, intensity, sound, settings.rippleStrength);
    },
    surfaceDepth: null,
    layerCenters: objectOcclusion.texture,
    surfaceParticles: null
  });

  const meteorStage = OceanMeteor.create(T);
  const reducedMeteorMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let meteorShaking = false;
  let recoveryBeach = settings.beachSize;
  waterSystem.oceanMaterial.uniforms.uRecoveryReach.value = OceanMeteor.recoveryReach(shore);
  waterSystem.waterSurfaceMaterial.uniforms.uRecoveryReach.value = waterSystem.oceanMaterial.uniforms.uRecoveryReach.value;

  // Interactive Lagoon State
  const state = {
    whirl: false,
    whirlStrength: 0.0,
    sound: false,
    hidden: false,
    calmFactor: 0,
    vortex: { u: 0.58, v: 0.46 }
  };

  // Notice Banner Helper
  let noticeTimer = null;
  function notify(msg) {
    const el = document.querySelector('#notice');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      el.textContent = '';
    }, 2400);
  }

  // Creature Counter in Header
  function updateCount() {
    const rj = raysAndJellies.getCounts();
    const rf = reefEcosystem.getCounts();
    const countEl = document.querySelector('#count');
    if (countEl) {
      countEl.textContent = `${rj.rays} rays · ${rj.jellies} jellies · ${rf.turtles} turtles · ${rf.fish} fish · ${rf.sharks} sharks`;
    }
  }

  // Sync Resident Fish & Sharks with Settings
  function syncFish() {
    reefEcosystem.syncCounts(settings);
    updateCount();
  }

  // Initial Population of Rays, Jellies & Reef Fish
  function populateInitialLagoon() {
    const initialRaysAndJellies = [
      ['manta', 0.54, 0.70],
      ['eagle', 0.38, 0.52],
      ['stingray', 0.28, 0.36],
      ['manta', 0.76, 0.34],
      ['moon', 0.46, 0.80],
      ['moon', 0.60, 0.34],
      ['nettle', 0.72, 0.64],
      ['moon', 0.33, 0.24],
      ['nettle', 0.83, 0.48]
    ];
    for (const [sp, u, v] of settings.defaultCreaturesEnabled ? initialRaysAndJellies : []) {
      const pt = waterPoint(u, v);
      const xz = raysAndJellies.uvToXZ(pt.u, pt.v);
      raysAndJellies.spawnCreature(sp, { x: xz.x, z: xz.z, state: 'swimming' });
    }
    syncFish();
  }

  // Ambient Random Event Scheduler (school, dolphin, penguin, duo, meteor)
  const ambient = (() => {
    const evState = {
      current: null,
      story: null,
      serial: 0,
    };
    const cadence = createEventSchedule(random);

    function finish() {
      if (evState.current?.type === 'school') {
        reefEcosystem.stopSchoolMigrationEvent();
      }
      if (evState.current?.type === 'storm' || state.storm) {
        state.whirl = false;
        state.whirlStrength = 0.0;
        state.storm = null;
      }
      evState.current = null;
      evState.story = null;
    }

    function trigger(type) {
      if (evState.current) return false;
      if (![...COMMON_EVENTS,...RARE_EVENTS].includes(type)) return false;

      const e = { type, age: 0, id: ++evState.serial };
      evState.current = e;

      if (type === 'meteor') {
        e.duration = OceanMeteor.DURATION;
        e.seed = Math.floor(Math.random() * 1e9);
        e.phase = '天外来客';
        return true;
      }

      if (type === 'school') {
        const started = reefEcosystem.startSchoolMigrationEvent();
        e.duration = started.duration;
        e.phase = started.phase;
        return true;
      }

      if (type === 'storm') {
        e.duration = 36;
        e.phase = '微风轻拂 · 细小微涡正在海面悄然凝聚...';
        const u0 = 0.48 + (Math.random() - 0.5) * 0.26;
        const v0 = 0.44 + (Math.random() - 0.5) * 0.24;
        state.storm = {
          age: 0,
          duration: 36,
          u0,
          v0,
          dir: Math.random() * Math.PI * 2
        };
        state.vortex.u = u0;
        state.vortex.v = v0;
        state.whirl = true;
        state.whirlStrength = 0.05;
        return true;
      }

      evState.story = OceanVisitors.create(type, random, waterPoint, aspect, shore);
      e.duration = evState.story.duration;
      e.phase = evState.story.phase;
      return true;
    }

    function advance(dt, enabled, elapsed=dt) {
      const scheduled=cadence.advance(elapsed,enabled,!!evState.current,scope.eventHooks?.included());
      if(scheduled&&trigger(scheduled))scope.eventHooks?.started(scheduled);
      dt = clamp(dt, 0, 0.05);
      const e = evState.current;
      if (!e) return;

      if (evState.story) {
        e.age += dt;
        const done = OceanVisitors.step(evState.story, dt, {
          aspect,
          splash: (u, v) => waterSystem.addWaterImpulseUv(u, v, 0.016, -0.25, settings.rippleStrength)
        });
        e.phase = evState.story.phase;
        if (done) finish();
        return;
      }

      e.age += dt;
      if (e.type === 'meteor') {
        const mState = OceanMeteor.state(e.age);
        e.phase = mState.phase;
        if (Math.abs(e.age - OceanMeteor.IMPACT) < dt * 1.2) {
          waterSystem.spawnWaterSplashUv(0.55, 0.5, 2.2, sound, settings.rippleStrength);
        }
      } else if (e.type === 'school') {
        const stream = reefEcosystem.getStreamEvent();
        if (stream && stream.active !== false) {
          e.phase = stream.phase;
        } else {
          finish();
          return;
        }
      } else if (e.type === 'storm') {
        if (state.storm) {
          state.storm.age += dt;
          const st = state.storm;
          const driftU = Math.sin(st.age * 0.22 + st.dir) * 0.16 + Math.cos(st.age * 0.11) * 0.05;
          const driftV = Math.cos(st.age * 0.18 + st.dir) * 0.16 + Math.sin(st.age * 0.09) * 0.05;
          state.vortex.u = clamp(st.u0 + driftU, 0.40, 0.86);
          state.vortex.v = clamp(st.v0 + driftV, 0.18, 0.82);
          state.whirl = true;

          // Storm lifecycle phases & smooth strength curve:
          // 0 to 9s: Formation & smooth swelling from tiny vortex (scale 0.08 -> 1.0)
          // 9 to 27s: Full maelstrom peak & continuous stratified orbital swirling (scale 1.0)
          // 27 to 36s: Gradual waning and dissipation (scale 1.0 -> 0.0)
          const growTime = 9.0;
          const waneStart = 27.0;
          let stormStrength = 0.0;
          if (st.age < growTime) {
            const t = st.age / growTime;
            stormStrength = 0.08 + 0.92 * (t * t * (3 - 2 * t));
            if (st.age < 3.5) {
              e.phase = '微风轻拂 · 细小微涡正在海面悄然凝聚...';
            } else {
              e.phase = '风暴集聚 · 小旋涡扩充为巨大引力深涡！';
            }
          } else if (st.age < waneStart) {
            stormStrength = 1.0;
            if (st.age < 18.0) {
              e.phase = '深海巨涡肆虐 · 万千生灵循体积分层盘旋！';
            } else {
              e.phase = '潮涌回旋 · 鱼群与巨兽环绕风眼同心回旋';
            }
          } else {
            const t = clamp((st.age - waneStart) / (st.duration - waneStart), 0, 1);
            stormStrength = (1.0 - (t * t * (3 - 2 * t)));
            e.phase = '风暴平息 · 巨涡消弭收缩归于安宁';
          }
          state.whirlStrength = stormStrength;
        }
      }

      if (e.age >= e.duration) {
        finish();
      }
    }

    return { state: evState, trigger, advance, cancel: finish, schedule:cadence.snapshot };
  })();

  function meteorAge() {
    return ambient.state.current?.type === 'meteor' ? ambient.state.current.age : -1;
  }

  let ambientStatusKey = '';
  function updateAmbientStatus() {
    const status = document.querySelector('#event-status');
    if (!status) return;
    const cur = ambient.state.current;
    const phase = ambient.state.story?.phase || cur?.phase;
    const eventTitles = {
      school: '鱼群穿境',
      storm: '海原风暴',
      meteor: '巨陨归潮',
      ...OceanVisitors.names
    };
    if (cur) {
      status.textContent = `正在发生：${eventTitles[cur.type] || cur.type}${phase ? ' · ' + phase : ''}${settings.eventsEnabled ? '' : '（本次结束后暂停）'}`;
    } else {
      status.textContent = settings.eventsEnabled ? '静候下一次海洋事件' : '随机事件已暂停';
    }
  }

  function previewAmbient(type) {
    if (ambient.state.current) {
      ambient.cancel();
    }
    if (!ambient.trigger(type)) {
      notify('当前事件结束后，再预览下一种');
    } else {
      const eventTitles = {
        school: '鱼群穿境',
        meteor: '巨陨归潮',
        ...OceanVisitors.names
      };
      notify(`已触发事件：${eventTitles[type] || type}`);
    }
    updateAmbientStatus();
  }

  // Dock Cards Definition (10 Species: 5 Rays/Jellies + 1 Sea Turtle + 4 Reef Fish/Shark)
  const dockCardsConfig = [
    { kind: 'manta', title: 'Manta', sub: '双吻前口蝠鲼', isFish: false },
    { kind: 'eagle', title: 'Spotted Eagle Ray', sub: '斑点鹞鲼', isFish: false },
    { kind: 'stingray', title: 'Blue-spotted Stingray', sub: '蓝斑条尾魟', isFish: false },
    { kind: 'turtle', title: 'Sea Turtle', sub: '绿海龟 · +1', isFish: true, settingKey: 'turtleCount' },
    { kind: 'moon', title: 'Moon Jelly', sub: '海月水母', isFish: false },
    { kind: 'nettle', title: 'Sea Nettle', sub: '太平洋黄金水母', isFish: false },
    { kind: 'silver', title: 'Silver School', sub: '银色鱼群 · +12', isFish: true, settingKey: 'silverCount' },
    { kind: 'reef', title: 'Reef Fish', sub: '珊瑚彩色鱼 · +1', isFish: true, settingKey: 'reefCount' },
    { kind: 'clown', title: 'Clownfish', sub: '海葵小丑鱼 · +1', isFish: true, settingKey: 'clownCount' },
    { kind: 'shark', title: 'Blacktip Reef Shark', sub: '黑鳍礁鲨 · +1', isFish: true, settingKey: 'sharkCount' }
  ];

  const dockEl = document.querySelector('#dock');
  const cardElements = {};
  let dragState = null;

  const openingWaterPoint = createWaterPointerProjection(T, camera, waterSystem.worldToUv);
  let lastOpeningPointer = null;
  function eventUV(e, projectOpening = false) {
    const origin = scope.pointerOrigin?.() ?? {left: 0, top: 0};
    const u = (e.clientX - origin.left) / Math.max(1, W);
    const v = 1 - (e.clientY - origin.top) / Math.max(1, H);
    if (projectOpening && opening.active) {
      const point = openingWaterPoint(u, v);
      return {u: clamp(point.u, 0.01, 0.99), v: clamp(point.v, 0.01, 0.99)};
    }
    return {
      u: clamp(u, 0.01, 0.99),
      v: clamp(v, 0.01, 0.99)
    };
  }

  for (const cfg of dockCardsConfig) {
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.dataset.kind = cfg.kind;
    btn.dataset.species = cfg.kind;
    btn.setAttribute('aria-label', `Add ${cfg.title}. Drag to place.`);
    btn.innerHTML = `<img alt="${cfg.title}" draggable="false"><strong>${cfg.title}</strong><small>${cfg.sub}</small>`;
    dockEl.append(btn);
    cardElements[cfg.kind] = btn;

    btn.addEventListener('pointerdown', (e) => {
      if (dragState || e.button !== 0) return;
      const p = eventUV(e);

      if (cfg.isFish) {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        dragState = {
          type: 'fish-card',
          species: cfg.kind,
          settingKey: cfg.settingKey,
          id: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          u: p.u,
          v: p.v,
          moved: false
        };
      } else {
        if (raysAndJellies.creatures.length >= MAX_RAYS_JELLIES) {
          notify('海域生物已达 48 只上限 · 可点击 Clear sea 清空');
          return;
        }
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        const xz = raysAndJellies.uvToXZ(p.u, p.v);
        const creature = raysAndJellies.spawnCreature(cfg.kind, {
          x: xz.x,
          y: 2.35,
          z: xz.z,
          state: 'dragging'
        });
        updateCount();
        dragState = {
          type: 'ray-card',
          creature,
          id: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          u: p.u,
          v: p.v,
          moved: false
        };
      }
    });
  }

  // Render 3D Thumbnails into all 9 Dock Card <img> tags
  // Host uses its shared parameter panel; no hidden thumbnail GPU pass.

  document.querySelector('#dock-prev').onclick = () => dockEl.scrollBy({ left: -240, behavior: 'smooth' });
  document.querySelector('#dock-next').onclick = () => dockEl.scrollBy({ left: 240, behavior: 'smooth' });

  // Finish Card Drag / Click Throw into Sea
  function finishCardDrag(e, cancel = false) {
    if (!dragState) return;
    if (dragState.type !== 'ray-card' && dragState.type !== 'fish-card') return;
    const d = dragState;
    dragState = null;

    if (d.type === 'fish-card') {
      const cardRect = cardElements[d.species]?.getBoundingClientRect();
      const startU = cardRect
        ? clamp((cardRect.left + cardRect.width / 2) / Math.max(1, W), 0.06, 0.94)
        : clamp(d.startX / Math.max(1, W), 0.06, 0.94);
      const startV = 0.06;

      let targetUv;
      if (d.moved && !cancel) {
        targetUv = waterPoint(d.u, d.v);
      } else {
        if (d.species === 'clown') {
          const spots = reefEcosystem.anemoneSpots;
          const spot = spots[Math.floor(random() * spots.length)] || { u: 0.58, v: 0.46 };
          targetUv = {
            u: clamp(spot.u + (random() - 0.5) * 0.04, 0.08, 0.92),
            v: clamp(spot.v + (random() - 0.5) * 0.04, 0.08, 0.92)
          };
        } else if (d.species === 'shark') {
          targetUv = waterPoint(0.35 + random() * 0.42, 0.28 + random() * 0.44);
        } else if (d.species === 'silver') {
          targetUv = waterPoint(0.30 + random() * 0.46, 0.32 + random() * 0.42);
        } else {
          targetUv = waterPoint(0.26 + random() * 0.48, 0.28 + random() * 0.45);
        }
      }

      const added = reefEcosystem.throwFishFromDock(d.species, startU, startV, targetUv.u, targetUv.v, settings);
      if (!added) {
        notify('已达到这一类鱼的数量上限');
      } else {
        if (sound) {
          const chimePitch = d.species === 'shark' ? 0 : d.species === 'silver' ? 1 : d.species === 'reef' ? 2 : 3;
          sound.playChime(chimePitch, 0.14);
        }
        saveSettings();
        refreshSettings();
        updateCount();
      }
      return;
    }

    const c = d.creature;
    if (!c) return;
    if (d.moved && !cancel) {
      const safeUv = waterPoint(d.u, d.v);
      const xz = raysAndJellies.uvToXZ(safeUv.u, safeUv.v);
      c.x = xz.x;
      c.z = xz.z;
      c.state = 'falling';
      c.vy = -1.5;
      c.vx = 0;
      c.vz = 0;
    } else {
      const targetUv = raysAndJellies.findOpenSeaUv();
      const targetXZ = raysAndJellies.uvToXZ(targetUv.u, targetUv.v);
      const startUv = { u: clamp(d.startX / Math.max(1, W), 0.1, 0.9), v: 0.06 };
      const startXZ = raysAndJellies.uvToXZ(startUv.u, startUv.v);
      c.x = startXZ.x;
      c.z = startXZ.z;
      c.y = 2.6;
      const flightT = 0.86;
      const g = 18.5;
      c.vx = (targetXZ.x - startXZ.x) / flightT;
      c.vz = (targetXZ.z - startXZ.z) / flightT;
      c.vy = (0.0 - c.y + 0.5 * g * flightT * flightT) / flightT;
      c.yaw = Math.atan2(c.vx, c.vz);
      c.targetYaw = c.yaw;
      c.state = 'thrown';
      if (sound) sound.playChime(0, 0.12);
    }
  }

  addEventListener('pointerup', (e) => finishCardDrag(e, false));
  addEventListener('pointercancel', (e) => finishCardDrag(e, true));
  addEventListener('blur', (e) => finishCardDrag(e, true));

  // Pointer Tracking & Direct Creature / Visitor Interaction on Canvas
  const pointerUv = { u: 0.5, v: 0.5, active: false, until: 0 };
  let lastPointer = null;
  let waterPress = null;

  function pickRayOrJelly(u, v) {
    const xz = raysAndJellies.uvToXZ(u, v);
    let best = null;
    let bestDist = Infinity;
    for (const c of raysAndJellies.creatures) {
      if (c.state === 'dragging' || c.state === 'thrown' || c.state === 'falling') continue;
      const d = Math.hypot(c.x - xz.x, c.z - xz.z);
      const hitRadius = c.isRay ? 1.45 * c.scale : 0.85 * c.scale;
      if (d < hitRadius && d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (opening.active || e.button !== 0 || meteorAge() >= 18) return;
    sound.unlock();
    const p = eventUV(e);
    canvas.setPointerCapture(e.pointerId);

    if ((state.whirl || state.whirlStrength > 0.05) && Math.hypot((p.u - state.vortex.u) * aspect, p.v - state.vortex.v) < 0.14) {
      dragState = { type: 'vortex', id: e.pointerId };
      return;
    }

    const visitorHit = guestStage.hit(p.u, p.v);
    const rjHit = !visitorHit ? pickRayOrJelly(p.u, p.v) : null;
    waterPress = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      u: p.u,
      v: p.v,
      visitorHit,
      rjHit,
      moved: false
    };

    pointerUv.u = p.u;
    pointerUv.v = p.v;
    pointerUv.active = true;
    pointerUv.until = clockTime + 0.75;

    if (!visitorHit && !rjHit) {
      waterSystem.addWaterImpulseUv(p.u, p.v, 0.020, -0.36, settings.rippleStrength);
    }
    lastPointer = p;
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = eventUV(e, true);
    if (opening.active) {
      // Water remains interactive while camera/title choreography is running.
      // Creature hits, dragging and startle behavior resume after the opening.
      if (!lastOpeningPointer || Math.hypot((p.u - lastOpeningPointer.u) * aspect, p.v - lastOpeningPointer.v) > 0.008) {
        waterSystem.addWaterImpulseUv(p.u, p.v, 0.013, -0.18, settings.rippleStrength);
        lastOpeningPointer = p;
      }
      return;
    }
    if (lastOpeningPointer) { lastPointer = null; lastOpeningPointer = null; }
    if (waterPress && Math.hypot(e.clientX - waterPress.x, e.clientY - waterPress.y) > 7) {
      waterPress.moved = true;
    }

    if (dragState?.type === 'vortex') {
      state.vortex.u = clamp(p.u, 0.08, 0.92);
      state.vortex.v = clamp(p.v, 0.08, 0.92);
      return;
    }

    pointerUv.u = p.u;
    pointerUv.v = p.v;
    pointerUv.active = true;
    pointerUv.until = clockTime + 0.65;

    if (!lastPointer || Math.hypot((p.u - lastPointer.u) * aspect, p.v - lastPointer.v) > 0.008) {
      if (lastPointer) {
        guestStage.pointer(p.u, p.v, p.u - lastPointer.u, p.v - lastPointer.v);
      }
      waterSystem.addWaterImpulseUv(p.u, p.v, 0.013, -0.18, settings.rippleStrength);
      const xz = raysAndJellies.uvToXZ(p.u, p.v);
      const scareRadius = (settings.fleeRadius / 0.105) * 2.2;
      for (const c of raysAndJellies.creatures) {
        if (c.isRay && (c.state === 'swimming' || c.state === 'resting')) {
          if (Math.hypot(c.x - xz.x, c.z - xz.z) < scareRadius) {
            raysAndJellies.startleRay(c, xz.x, xz.z, settings.rippleStrength);
          }
        }
      }
      lastPointer = p;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    const press = waterPress;
    waterPress = null;
    if (opening.active) return;
    if (!press || press.id !== e.pointerId || press.moved || Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 7) {
      if (dragState?.type === 'vortex') dragState = null;
      return;
    }

    if (press.visitorHit) {
      guestStage.interact(press.visitorHit.index);
      if (sound) sound.playChime(3, 0.11);
      return;
    }

    if (press.rjHit) {
      const c = press.rjHit;
      if (c.species === 'manta' || c.species === 'eagle') {
        raysAndJellies.triggerRayBreach(c, settings.rippleStrength);
      } else if (c.species === 'stingray') {
        const xz = raysAndJellies.uvToXZ(press.u, press.v);
        raysAndJellies.startleRay(c, xz.x + 0.2, xz.z + 0.2, settings.rippleStrength);
      } else {
        c.phase = 0.02;
        c.speed = c.baseSpeed * 2.4;
        waterSystem.addWaterImpulseUv(press.u, press.v, 0.016, -0.24, settings.rippleStrength);
        if (sound) sound.playChime(1, 0.10);
      }
      return;
    }

    const msg = reefEcosystem.interactAt(press.u, press.v, settings.rippleStrength);
    if (msg) notify(msg);
  });

  canvas.addEventListener('pointercancel', () => {
    waterPress = null;
    if (dragState?.type === 'vortex') dragState = null;
  });
  canvas.addEventListener('pointerleave', () => {
    lastPointer = null;
    lastOpeningPointer = null;
  });

  addEventListener('pointermove', (e) => {
    if (!dragState) return;
    if (dragState.type === 'ray-card' || dragState.type === 'fish-card') {
      const p = eventUV(e);
      if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) > 6) {
        dragState.moved = true;
      }
      dragState.u = p.u;
      dragState.v = p.v;
      if (dragState.type === 'ray-card' && dragState.creature) {
        const xz = raysAndJellies.uvToXZ(p.u, p.v);
        dragState.creature.x = xz.x;
        dragState.creature.z = xz.z;
        dragState.creature.y = 2.35;
      }
    }
  });

  // Lagoon controls and resident population actions
  function clearSea(resetCounts = true) {
    raysAndJellies.creatures.length = 0;
    if (reefEcosystem.clearAll) {
      reefEcosystem.clearAll();
    }
    waterSystem.clearParticles();
    ambient.cancel();
    guestStage.render(null, 0);
    if (resetCounts) {
      settings.defaultCreaturesEnabled = 0;
      settings.silverCount = 0;
      settings.reefCount = 0;
      settings.clownCount = 0;
      settings.sharkCount = 0;
      settings.turtleCount = 0;
      syncFish();
      saveSettings();
      refreshSettings();
    }
    updateCount();
    notify('已清除海域所有生物');
  }

  function action(name) {
    sound.unlock();
    if (name === 'reset-population') {
      clearSea(false);
      populateInitialLagoon();
    } else if (name === 'whirl') {
      state.whirl = !state.whirl;
    } else if (name === 'calm') {
      state.whirl = false;
      state.whirlStrength = 0.0;
      state.calmFactor = 1.0;
    } else if (name === 'clear') {
      clearSea(true);
      notify('已清空海域生物');
    } else if (name === 'sound') {
      state.sound = sound.toggleSound();
    } else if (name === 'hide') {
      state.hidden = !state.hidden;
      document.body.classList.toggle('hidden-ui', state.hidden);
    }

    document.querySelector('[data-action="whirl"]')?.setAttribute('aria-pressed', String(state.whirl));
    document.querySelector('[data-action="sound"]')?.setAttribute('aria-pressed', String(state.sound));
    const vLabel = document.querySelector('#vortex-label');
    if (vLabel) vLabel.style.display = state.whirl ? 'block' : 'none';
    document.querySelector('#hint').textContent = state.whirl
      ? 'Whirlpool · drag its centre to move it'
      : 'Touch the water · drag a creature into the sea';
  }

  document.querySelectorAll('[data-action]').forEach((b) => {
    b.addEventListener('click', () => action(b.dataset.action));
  });
  document.querySelector('#restore').onclick = () => action('hide');

  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const act = { w: 'whirl', c: 'calm', m: 'sound', h: 'hide' }[e.key.toLowerCase()];
    if (act) {
      e.preventDefault();
      action(act);
    }
  });

  // Parameter Panel Construction & Persistence
  const parameterGroups = [
    ['开场 · 掠海入湾', [
      ['introDuration', '开场时长（秒）'],
      ['introIntensity', '镜头展开幅度']
    ]],
    ['鱼群与生态互动', [
      ['silverCount', '银色鱼群数量'],
      ['reefCount', '珊瑚彩色鱼数量'],
      ['clownCount', '海葵小丑鱼数量'],
      ['sharkCount', '黑鳍礁鲨数量'],
      ['turtleCount', '绿海龟数量'],
      ['fishSpeed', '鱼类游动速度'],
      ['fishSize', '小鱼体型'],
      ['schoolCohesion', '鱼群聚集程度'],
      ['fleeRadius', '互动惊扰半径']
    ]],
    ['水面反光与波浪', [
      ['surfaceReflection', '水面反射强度'],
      ['sunGlint', '太阳耀斑与高光亮度'],
      ['foamIntensity', '海浪与岸线泡沫'],
      ['swell', '自然涌浪强度'],
      ['rippleStrength', '互动波纹强度'],
      ['waterSpeed', '涌浪与焦散速度']
    ]],
    ['水体光学与折射', [
      ['clarity', '海水通透度'],
      ['caustics', '水底焦散亮度'],
      ['refractionScale', '水底折射扭曲'],
      ['shadowIntensity', '生物水底阴影深度']
    ]],
    ['海岸与海床地貌', [
      ['beachSize', '沙滩面积'],
      ['coralDensity', '珊瑚密度'],
      ['grassDensity', '海草密度']
    ]],
    ['随机自然事件', [
    ]]
  ];

  let rebakeTimer = null;
  function scheduleRebake() {
    clearTimeout(rebakeTimer);
    rebakeTimer = setTimeout(() => {
      waterSystem.rebuildSeabed({
        beachSize: settings.beachSize,
        coralDensity: settings.coralDensity,
        grassDensity: settings.grassDensity
      });
      if (recoveryBeach !== settings.beachSize) {
        recoveryBeach = settings.beachSize;
        const reach = OceanMeteor.recoveryReach(shore);
        waterSystem.oceanMaterial.uniforms.uRecoveryReach.value = reach;
        waterSystem.waterSurfaceMaterial.uniforms.uRecoveryReach.value = reach;
      }
    }, 140);
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function refreshSettings() {
    for (const key in settings) {
      const input = document.querySelector(`[data-setting="${key}"]`);
      if (!input) continue;
      if (input.type === 'checkbox') {
        input.checked = !!settings[key];
        continue;
      }
      input.value = settings[key];
      const out = input.parentElement.querySelector('output');
      if (out) {
        const step = limits[key][2];
        out.textContent = Number(settings[key]).toFixed(step === 1 ? 0 : key === 'fleeRadius' ? 3 : 2);
      }
    }
    updateAmbientStatus();
  }

  const fishSettingKeys = ['silverCount', 'reefCount', 'clownCount', 'sharkCount', 'turtleCount'];
  let seabedUpdateTimer;
  function triggerRealtimeSeabed() {
    clearTimeout(seabedUpdateTimer);
    seabedUpdateTimer=setTimeout(() => {
      waterSystem.rebuildSeabed({
        beachSize: settings.beachSize,
        coralDensity: settings.coralDensity,
        grassDensity: settings.grassDensity
      });
      if (recoveryBeach !== settings.beachSize) {
        recoveryBeach = settings.beachSize;
        const reach = OceanMeteor.recoveryReach(shore);
        waterSystem.oceanMaterial.uniforms.uRecoveryReach.value = reach;
        waterSystem.waterSurfaceMaterial.uniforms.uRecoveryReach.value = reach;
      }
    },120);
  }

  function applySetting(key, value, commit = true) {
    if (!limits[key]) return;
    const [min, max, step] = limits[key];
    settings[key] = clamp(step === 1 ? Math.round(value) : value, min, max);
    if(key==='performanceMode'){performancePolicy.setMode(settings.performanceMode);applyPerformanceBudget();resize('quality-selection');}
    if (key.startsWith('intro')) opening.configure(openingSettings());
    if (fishSettingKeys.includes(key)) {
      syncFish();
    }
    if (key === 'beachSize') {
      waterSystem.setBeachSize(settings.beachSize);
    }
    if (key === 'coralDensity' || key === 'grassDensity') {
      triggerRealtimeSeabed();
    }
    if (commit && (key === 'beachSize' || key === 'coralDensity' || key === 'grassDensity')) {
      scheduleRebake();
    }
    if (commit) {
      saveSettings();
    }
    refreshSettings();
  }

  const fieldsContainer = document.querySelector('#parameter-fields');
  for (const [groupTitle, entries] of parameterGroups) {
    const h = document.createElement('h3');
    h.textContent = groupTitle;
    fieldsContainer.append(h);
    for (const [key, title] of entries) {
      const label = document.createElement('label');
      label.textContent = title;
      const output = document.createElement('output');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = limits[key][0];
      input.max = limits[key][1];
      input.step = limits[key][2];
      input.dataset.setting = key;
      input.setAttribute('aria-label', title);
      label.append(output, input);
      fieldsContainer.append(label);
      input.addEventListener('input', () => applySetting(key, +input.value, false));
      input.addEventListener('change', () => applySetting(key, +input.value, true));
    }
  }

  document.querySelector('[data-setting="eventsEnabled"]').onchange = (e) => {
    applySetting('eventsEnabled', Number(e.target.checked));
  };
  document.querySelector('[data-setting="introEnabled"]').onchange = (e) => {
    applySetting('introEnabled', Number(e.target.checked));
  };
  document.querySelector('#replay-intro').onclick = () => {
    setPanel(false);
    opening.replay(openingSettings());
  };
  document.querySelectorAll('[data-preview]').forEach((b) => {
    b.onclick = () => previewAmbient(b.dataset.preview);
  });

  function setPanel(open) {
    document.querySelector('#parameters').hidden = !open;
    document.querySelector('#settings-toggle').setAttribute('aria-expanded', String(open));
  }
  document.querySelector('#settings-toggle').onclick = () => {
    setPanel(document.querySelector('#parameters').hidden);
  };
  document.querySelector('#settings-close').onclick = () => setPanel(false);
  document.querySelector('#clear-ocean')?.addEventListener('click', () => {
    clearSea(true);
  });
  document.querySelector('#reset-settings').onclick = () => {
    Object.assign(settings, defaults);
    opening.configure(openingSettings());
    if (raysAndJellies.creatures.length === 0) {
      populateInitialLagoon();
    } else {
      syncFish();
    }
    waterSystem.setBeachSize(settings.beachSize);
    scheduleRebake();
    saveSettings();
    refreshSettings();
    notify('已恢复默认参数');
  };

  function applyPerformanceBudget(){
    reefEcosystem.setMigrationBudget(performancePolicy.profile.migration);
    waterSystem.setParticleBudget(performancePolicy.profile.particles);
  }
  applyPerformanceBudget();

  // Resize Handler
  // A size write clears WebGL's default framebuffer. Commit it only immediately
  // before a full render, never after presenting or while the scene is paused.
  let resizePending = false;
  let resizeReason = 'initial';
  const presentation = {resizeRequests:0,bufferResizes:0,redundantResizes:0,qualityChanges:0,longFrames:0,maxFrameMs:0,lastFrameMs:0,lastResize:null};
  function resize(reason='viewport') {
    resizeReason=typeof reason==='string'?reason:'viewport';
    resizePending = true;
    presentation.resizeRequests++;
  }
  function applyResize() {
    resizePending = false;
    const nextW = innerWidth, nextH = innerHeight;
    const nextQuality = performancePolicy.pixelRatio(globalThis.devicePixelRatio,nextW,nextH);
    const changed = W!==nextW || H!==nextH || quality!==nextQuality;
    if (!changed) {presentation.redundantResizes++;return;}
    const previous={width:canvas.width,height:canvas.height,pixelRatio:quality};
    const qualityChanged=quality!==nextQuality;
    W = innerWidth;
    H = innerHeight;
    aspect = W / H;
    quality=nextQuality;
    renderer.setDrawingBufferSize(W,H,quality);
    presentation.bufferResizes++;
    if(qualityChanged)presentation.qualityChanges++;
    presentation.lastResize={reason:resizeReason,previous,width:canvas.width,height:canvas.height,pixelRatio:quality,frame:frame+1};
    camera.left = -10 * aspect;
    camera.right = 10 * aspect;
    camera.top = 10;
    camera.bottom = -10;
    camera.updateProjectionMatrix();
    waterSystem.resize(aspect);
    opening.resize();
  }
  addEventListener('resize', resize);
  resize();
  waterSystem.setBeachSize(settings.beachSize);
  populateInitialLagoon();
  refreshSettings();
  opening.replay(openingSettings());

  // Main Animation Loop
  let clockTime = 0;
  let waterTime = 0;
  let lastNow = performance.now();
  let simAccum = 0;
  let frame = 0;
  let paused = false;


  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    lastNow = performance.now();
    simAccum = 0;
    performancePolicy.resetClock();
  });

  function tick(now) {
    requestAnimationFrame(tick);
    if (paused) {
      lastNow = now;
      return;
    }

    if(frame>0&&!performancePolicy.shouldRender(now))return;
    if(resizePending)applyResize();
    const rawDt = Math.max(0, (now - lastNow) / 1000);
    lastNow = now;
    const dt = Math.min(rawDt, 0.05);
    opening.advance(rawDt);
    clockTime += dt;
    waterTime += dt * settings.waterSpeed;
    frame++;
    presentation.lastFrameMs=Math.round(rawDt*10000)/10;
    presentation.maxFrameMs=Math.max(presentation.maxFrameMs,presentation.lastFrameMs);
    if(rawDt>.05)presentation.longFrames++;
    simAccum += dt;

    if (pointerUv.active && clockTime > pointerUv.until) {
      pointerUv.active = false;
    }

    if (state.calmFactor > 0) {
      state.calmFactor = Math.max(0, state.calmFactor - dt * 1.4);
    }

    // 1. Advance Random Events & Visitors
    ambient.advance(dt, settings.eventsEnabled, rawDt);
    const s = ambient.state;
    guestStage.render(s.story, s.current?.id || 0);

    const mAge = meteorAge();
    const mSeed = (s.current?.seed || 0) % 1000;
    canvas.style.pointerEvents = mAge >= 18 ? 'none' : '';

    const impactMotion = OceanMeteor.impact(mAge);
    if (!reducedMeteorMotion.matches && (impactMotion.shakeX || impactMotion.shakeY)) {
      canvas.style.transform = `translate(${impactMotion.shakeX * Math.min(3, W * 0.0018)}px,${impactMotion.shakeY * Math.min(3, H * 0.0018)}px) scale(1.014)`;
      meteorShaking = true;
    } else if (meteorShaking) {
      canvas.style.transform = '';
      meteorShaking = false;
    }

    const nextStatusKey = `${s.current?.id || 0}:${s.story?.phase || s.current?.phase || ''}:${settings.eventsEnabled}`;
    if (ambientStatusKey !== nextStatusKey) {
      ambientStatusKey = nextStatusKey;
      updateAmbientStatus();
    }

    // Whirlpool strength transition (ambient storm or manual button/key toggle)
    if (!state.storm) {
      const targetWhirl = state.whirl ? 1.0 : 0.0;
      const whirlRate = state.whirl ? 0.35 : 0.65;
      state.whirlStrength = mix(state.whirlStrength, targetWhirl, clamp(dt * whirlRate * 3.0, 0, 1));
      if (!state.whirl && state.whirlStrength < 0.005) {
        state.whirlStrength = 0.0;
      }
    }

    // 2. Step GPU Height-Field Water Simulation
    let steps = 0;
    while (simAccum >= 1 / 60 && steps < 3) {
      waterSystem.stepWaterSimulation(waterTime, state.whirlStrength, state.vortex, state.calmFactor);
      simAccum -= 1 / 60;
      steps++;
    }
    if (steps === 3) simAccum = 0;

    // 3. Update Swash, Audio & Particles
    const swash = waterSystem.getSwashState(waterTime, settings.swell);
    sound.update(waterTime, swash.phase, state.whirlStrength, settings.beachSize);
    waterSystem.updateParticles(dt);

    // 4. Update Rays, Jellyfish, Reef Fish, Anemones & Sharks
    const shadowCountAfterRays = raysAndJellies.update(dt, clockTime, {
      isWhirlpool: state.whirlStrength > 0.01,
      whirlStrength: state.whirlStrength,
      whirlpoolUv: state.vortex,
      swimSpeedMult: settings.fishSpeed,
      rippleStrengthMult: settings.rippleStrength,
      waterClarity: clamp(settings.clarity * 0.78, 0.15, 1.0),
      causticsIntensity: settings.caustics,
      meteorAge: mAge
    });

    const totalShadows = reefEcosystem.update(dt, clockTime, {
      settings: {
        ...settings,
        fleeRadius: settings.fleeRadius / 0.105
      },
      pointerUv,
      isWhirlpool: state.whirlStrength > 0.01,
      whirlStrength: state.whirlStrength,
      whirlpoolUv: state.vortex,
      meteorAge: mAge,
      shadowOffset: shadowCountAfterRays
    });

    // 5. Update Dual-Pass Ocean & Water Surface Uniforms
    const heightTex = waterSystem.getHeightMapTexture();
    const clarityUniform = clamp(settings.clarity * 0.78, 0.15, 1.0);
    const mState = mAge >= 0 ? OceanMeteor.state(mAge) : { dry: 0, recovery: 0 };

    const oUni = waterSystem.oceanMaterial.uniforms;
    oUni.uHeightMap.value = heightTex;
    oUni.uTime.value = waterTime;
    oUni.uSwellTime.value = waterTime;
    oUni.uSwashRunup.value = swash.runup;
    oUni.uWetReach.value = Math.max(0.12, swash.runup * 0.18 + 0.12);
    oUni.uWhirlpool.value.set(state.vortex.u, state.vortex.v, state.whirlStrength, waterTime);
    oUni.uCreatureCount.value = Math.min(totalShadows,performancePolicy.profile.shadows);
    oUni.uWaterClarity.value = clarityUniform;
    oUni.uCausticsIntensity.value = settings.caustics;
    oUni.uRefractionScale.value = settings.refractionScale;
    oUni.uShadowIntensity.value = settings.shadowIntensity;
    oUni.uSwellScale.value = settings.swell;
    oUni.uBeachSize.value = settings.beachSize;
    oUni.uDry.value = mState.dry || 0;
    oUni.uRecoveryFront.value = mState.recovery || 0;

    const wUni = waterSystem.waterSurfaceMaterial.uniforms;
    wUni.uHeightMap.value = heightTex;
    wUni.uTime.value = waterTime;
    wUni.uSwellTime.value = waterTime;
    wUni.uSwashRunup.value = swash.runup;
    wUni.uWhirlpool.value.set(state.vortex.u, state.vortex.v, state.whirlStrength, waterTime);
    wUni.uSwellScale.value = settings.swell;
    wUni.uBeachSize.value = settings.beachSize;
    wUni.uSurfaceReflection.value = settings.surfaceReflection;
    wUni.uSunGlintIntensity.value = settings.sunGlint;
    wUni.uFoamIntensity.value = settings.foamIntensity;
    wUni.uDry.value = mState.dry || 0;
    wUni.uRecoveryFront.value = mState.recovery || 0;

    // 6. Render Main Scene, Surface Visitor Foams/Wakes & Rare Meteor Overlay
    renderer.setRenderTarget(null);
    renderer.clear();
    if(scope.offscreen){
      // OffscreenCanvas has no CSS compositor node. Preserve the source meteor
      // shake/scale in the final viewport, entirely inside the render worker.
      const scale=meteorShaking?1.014:1;
      const x=meteorShaking?impactMotion.shakeX*Math.min(3,W*.0018):0;
      const y=meteorShaking?impactMotion.shakeY*Math.min(3,H*.0018):0;
      renderer.setViewport(x-W*(scale-1)/2,-y-H*(scale-1)/2,W*scale,H*scale);
    }
    renderer.render(scene, camera);
    guestStage.renderSurface(renderer, camera);
    meteorStage.render(renderer, mAge, aspect, s.current?.seed || 1,performancePolicy.profile.particles);

    // Retire the loader only after the first complete (possibly intro) frame.
    if (frame === 1) {
      scope.firstFrame();
      // First-use shader compilation must not consume the visible intro timeline.
      lastNow = performance.now();
      const loading = document.querySelector('#loading');
      loading?.remove();
    }

    // 7. Update Whirlpool Label Position
    const label = document.querySelector('#vortex-label');
    if (state.whirlStrength > 0.05 && label) {
      label.style.display = 'block';
      label.style.opacity = String(clamp((state.whirlStrength - 0.05) * 2.5, 0, 1));
      label.style.left = `${state.vortex.u * W}px`;
      label.style.top = `${(1 - state.vortex.v) * H - 28}px`;
    } else if (label && !state.whirl) {
      label.style.display = 'none';
    }

    // Measurements exclude hidden frames and deliberate frame-cap skips.
    if(performancePolicy.observe(rawDt)){applyPerformanceBudget();resize('automatic-quality');}

  }

  requestAnimationFrame(tick);

  // Diagnostic & Automation Surface
  window.ocean = {
    disposeScene(){opening.dispose();ambient.cancel();guestStage.dispose();sound.enabled=false;if(sound.ctx)void sound.ctx.close().catch(()=>{});},
    addCreature(kind,u=.5,v=.5){const cfg=dockCardsConfig.find(c=>c.kind===kind);if(!cfg)throw Error('Unknown marine species');const safe=waterPoint(u,v);if(cfg.isFish){reefEcosystem.spawnFromDock(kind,safe.u,safe.v,settings);saveSettings();}else{if(raysAndJellies.creatures.length>=MAX_RAYS_JELLIES)throw Error('Marine creature limit reached (48)');const xz=raysAndJellies.uvToXZ(safe.u,safe.v);raysAndJellies.spawnCreature(kind,{x:xz.x,y:1.6,z:xz.z,state:'falling'});}updateCount();},
    glError:()=>renderer.getContext().getError(),
    frameCount:()=>frame,
    audioSuspend(){if(sound.ctx)void sound.ctx.suspend().catch(()=>{});},
    audioResume(){if(sound.ctx&&sound.enabled)void sound.ctx.resume().catch(()=>{});},

    get stats() {
      const rj = raysAndJellies.getCounts();
      const rf = reefEcosystem.getCounts();
      return {
        version: '2.0.0',
        events: {...ambient.schedule(),active:ambient.state.current?.type??null},
        three: T.REVISION,
        rays: rj.rays,
        jellies: rj.jellies,
        fish: rf.fish,
        sharks: rf.sharks,
        turtles: rf.turtles,
        quality,
        performance: {...performancePolicy.snapshot(),drawingWidth:canvas.width,drawingHeight:canvas.height,migrationFish:rf.migration},
        presentation: {...presentation,pendingResize:resizePending,pendingResizeReason:resizePending?resizeReason:null},
        time: clockTime,
        state: { whirl: state.whirl, sound: state.sound }
      };
    },
    action,
    intro: {
      replay: () => opening.replay(openingSettings()),
      skip: () => opening.finish(),
      snapshot: () => opening.snapshot()
    },
    parameters: () => ({ ...settings }),
    setParameter: applySetting,
    previewEvent: previewAmbient,
    cancelEvent: () => {
      ambient.cancel();
      guestStage.render(null, 0);
      updateAmbientStatus();
    },
    shore,
    state,
    reefEcosystem,
    raysAndJellies,
    waterSystem
  };
})();

return window.ocean;
}
