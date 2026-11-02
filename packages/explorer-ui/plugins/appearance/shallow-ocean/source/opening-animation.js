import {openingTimeline} from './opening-timeline.js';
export function install(root, document, window, matchMedia) {
/* Fly over the actual lagoon: no mask, tint, or extra rendering pass. */
(function (root) {
  'use strict';
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  function create({ camera, title, body = document.body }) {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const config = { enabled: 1, duration: 5.2, intensity: 1 };
    const home = { zoom: camera.zoom, x: camera.position.x, y: camera.position.y };
    let active = false, elapsed = 0, progress = 1, disposed = false;
    function updateDOM() {
      body.style.setProperty('--intro-ui', String(smooth(.66, .98, progress)));
      body.classList.toggle('intro-active', active);
      // Controls stay gated; pointer water ripples use the moving camera mapping.
      body.classList.toggle('intro-blocked', active);
      body.classList.remove('intro-pending');
      if (title) {
        title.hidden = !active;
        const timeline = openingTimeline(elapsed, config.duration);
        title.style.opacity = String(active ? timeline.titleOpacity : 0);
        title.style.transform = `translateY(${timeline.titleY}px)`;
      }
    }
    function frameCamera() {
      // Quintic easing provides zero velocity and acceleration at both ends.
      const t = openingTimeline(elapsed, config.duration).cameraProgress;
      const ease = clamp(t * t * t * (t * (t * 6 - 15) + 10));
      const zoom = 1 + .42 * config.intensity * (1 - ease);
      const halfWidth = (camera.right - camera.left) / (2 * home.zoom);
      const halfHeight = (camera.top - camera.bottom) / (2 * home.zoom);
      const margin = 1 - 1 / zoom;
      camera.zoom = home.zoom * zoom;
      camera.position.x = home.x + halfWidth * margin * (.48 - .30 * ease);
      camera.position.y = home.y + halfHeight * margin * (-.20 + .48 * Math.sin(Math.PI * ease));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    function finish() {
      const wasActive = active;
      active = false; progress = 1;
      if (wasActive) {
        camera.zoom = home.zoom;
        camera.position.x = home.x; camera.position.y = home.y;
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      }
      updateDOM();
    }
    function configure(values = {}) {
      if (Number.isFinite(values.enabled)) config.enabled = Number(values.enabled > 0);
      if (Number.isFinite(values.duration)) config.duration = clamp(values.duration, 1.5, 12);
      if (Number.isFinite(values.intensity)) config.intensity = clamp(values.intensity, 0, 2);
      if (!config.enabled || motion.matches) finish();
      else if (active) frameCamera();
    }
    function replay(values) {
      if (disposed) return;
      configure(values);
      if (!config.enabled || motion.matches) return;
      if (!active) {
        home.zoom = camera.zoom; home.x = camera.position.x; home.y = camera.position.y;
      }
      elapsed = 0; progress = 0; active = true;
      frameCamera(); updateDOM();
    }
    function advance(dt) {
      if (!active) return;
      elapsed += Math.max(0, dt);
      progress = clamp(elapsed / config.duration);
      if (progress >= 1) { finish(); return; }
      frameCamera(); updateDOM();
    }
    const onMotion = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', onMotion);
    return {
      configure, replay, advance, finish,
      resize() { if (active) frameCamera(); },
      get active() { return active; },
      snapshot: () => ({ active, progress, elapsed, ...config, zoom: camera.zoom, cameraX: camera.position.x, cameraY: camera.position.y }),
      dispose() { finish(); disposed = true; motion.removeEventListener('change', onMotion); }
    };
  }
  root.OceanOpening = { create };
})(root);

}
