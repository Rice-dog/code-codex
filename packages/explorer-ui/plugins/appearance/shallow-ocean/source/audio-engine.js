export function install(root, document, window, matchMedia) {
/* Procedural Web Audio Synthesizer for Ocean Shallows 2:
   Swash-synchronized breaking wave surf, lacy foam sizzle,
   whirlpool vortex hum, resonant cavity splashes, and pentatonic chimes. */
(function (root) {
  "use strict";

  class OceanAudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.masterGain = null;
      this.swashGain = null;
      this.foamGain = null;
      this.vortexGain = null;
      this.swashFilter = null;
      this.foamFilter = null;
      this.vortexFilter = null;
      this.pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
    }

    init() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.0;
      this.masterGain.connect(this.ctx.destination);

      const sampleRate = this.ctx.sampleRate;
      const bufLen = sampleRate * 4;
      const noiseBuf = this.ctx.createBuffer(2, bufLen, sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = noiseBuf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufLen; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
          b6 = white * 0.115926;
        }
      }

      // 1. Deep Swell & Swash Body Channel
      const surfSrc = this.ctx.createBufferSource();
      surfSrc.buffer = noiseBuf;
      surfSrc.loop = true;
      this.swashFilter = this.ctx.createBiquadFilter();
      this.swashFilter.type = "lowpass";
      this.swashFilter.frequency.value = 260;
      this.swashFilter.Q.value = 0.8;
      this.swashGain = this.ctx.createGain();
      this.swashGain.gain.value = 0.18;
      surfSrc.connect(this.swashFilter);
      this.swashFilter.connect(this.swashGain);
      this.swashGain.connect(this.masterGain);
      surfSrc.start();

      // 2. Lacy Foam Hiss & Backwash Sizzle Channel
      const foamSrc = this.ctx.createBufferSource();
      foamSrc.buffer = noiseBuf;
      foamSrc.loop = true;
      this.foamFilter = this.ctx.createBiquadFilter();
      this.foamFilter.type = "bandpass";
      this.foamFilter.frequency.value = 1450;
      this.foamFilter.Q.value = 0.7;
      this.foamGain = this.ctx.createGain();
      this.foamGain.gain.value = 0.04;
      foamSrc.connect(this.foamFilter);
      this.foamFilter.connect(this.foamGain);
      this.foamGain.connect(this.masterGain);
      foamSrc.start(0, 1.3);

      // 4. Whirlpool Vortex Suction Hum
      const vortexSrc = this.ctx.createBufferSource();
      vortexSrc.buffer = noiseBuf;
      vortexSrc.loop = true;
      this.vortexFilter = this.ctx.createBiquadFilter();
      this.vortexFilter.type = "bandpass";
      this.vortexFilter.frequency.value = 140;
      this.vortexFilter.Q.value = 2.4;
      this.vortexGain = this.ctx.createGain();
      this.vortexGain.gain.value = 0.0;
      vortexSrc.connect(this.vortexFilter);
      this.vortexFilter.connect(this.vortexGain);
      this.vortexGain.connect(this.masterGain);
      vortexSrc.start(0, 0.7);
    }

    toggle() {
      this.init();
      if (!this.ctx) return false;
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.enabled = !this.enabled;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.85 : 0.0, now, 0.25);
      if (this.enabled) this.playChime(3);
      return this.enabled;
    }

    toggleSound() {
      return this.toggle();
    }

    unlock() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    updateSurf(swashPhase, time = 0, isWhirlpool = false, beachFactor = 1.0) {
      this.update(time, swashPhase, isWhirlpool, beachFactor);
    }

    update(time, swashPhase, isWhirlpool, beachFactor = 1.0) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const breakerCrest = Math.pow(Math.max(0, Math.sin(swashPhase * Math.PI * 2)), 1.6) * Math.max(0.25, beachFactor);
      const backwashSizzle = Math.pow(Math.max(0, Math.sin((swashPhase - 0.18) * Math.PI * 2)), 2.2) * Math.max(0.2, beachFactor);

      this.swashFilter.frequency.setTargetAtTime(170 + breakerCrest * 390, now, 0.08);
      this.swashGain.gain.setTargetAtTime(0.11 + breakerCrest * 0.28, now, 0.08);

      this.foamFilter.frequency.setTargetAtTime(1100 + backwashSizzle * 1300, now, 0.08);
      this.foamGain.gain.setTargetAtTime(0.02 + backwashSizzle * 0.15, now, 0.08);

      const vScale = typeof isWhirlpool === 'number' ? isWhirlpool : (isWhirlpool ? 1.0 : 0.0);
      this.vortexGain.gain.setTargetAtTime(0.24 * vScale, now, 0.25);
      if (vScale > 0.01) {
        this.vortexFilter.frequency.setTargetAtTime(110 + vScale * 35 + Math.sin(time * 2.5) * 25, now, 0.1);
      }
    }

    playSplash(intensity = 1.0) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const gainVal = Math.min(1.2, Math.max(0.12, intensity));

      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = "sine";
      const baseFreq = 95 + Math.random() * 45;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 3.4, now + 0.19);
      oscGain.gain.setValueAtTime(0.24 * gainVal, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.24);

      const dur = 0.35 + gainVal * 0.25;
      const bufSize = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * (0.09 + gainVal * 0.08)));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(480, now);
      filter.frequency.exponentialRampToValueAtTime(1650, now + dur * 0.7);
      filter.Q.value = 1.1;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.38 * gainVal, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      src.start(now);
    }

    playChime(noteIndex = null, volume = 0.16) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const idx = noteIndex !== null
        ? Math.abs(Math.floor(noteIndex)) % this.pentatonic.length
        : Math.floor(Math.random() * this.pentatonic.length);
      const freq = this.pentatonic[idx] * (0.985 + Math.random() * 0.03);

      const osc = this.ctx.createOscillator();
      const harm = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      harm.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.03, now + 0.06);
      harm.frequency.setValueAtTime(freq * 2.0, now);

      const harmGain = this.ctx.createGain();
      harmGain.gain.setValueAtTime(0.18, now);
      harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.48);

      osc.connect(gain);
      harm.connect(harmGain);
      harmGain.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      harm.start(now);
      osc.stop(now + 0.5);
      harm.stop(now + 0.5);
    }
  }

  root.OceanAudioEngine = OceanAudioEngine;
})(root);

}
