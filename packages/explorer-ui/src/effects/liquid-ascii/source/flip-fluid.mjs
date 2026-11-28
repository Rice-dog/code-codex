// Pure 2D staggered-grid FLIP/PIC hybrid fluid tank simulation and ASCII rasterizer.
// Zero DOM dependencies so physics invariants can run directly under Node tests as well as Web browsers.

const EMPTY_CELL = 0;
const FLUID_CELL = 1;
const SOLID_CELL = 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class FlipLiquidAsciiSimulation {
  constructor(width = 920, height = 500, options = {}) {
    this.time = 0;
    this.pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, lastMoveTime: -10 };
    this.fillHeight = typeof options.fillHeight === "number" ? clamp(options.fillHeight, 0, 1) : 0.4;
    this.pixelWidth = 920;
    this.pixelHeight = 500;
    this.cols = 61;
    this.rows = 33;
    this.simHeight = 10.0;
    this.simWidth = 18.4;
    this.h = 0.3;
    this.particleRadius = 0.09;
    this.fNumX = 1;
    this.fNumY = 1;
    this.fNumCells = 1;
    this.fInvSpacing = 1;
    this.pInvSpacing = 1;
    this.pNumX = 1;
    this.pNumY = 1;
    this.pNumCells = 1;
    this.numParticles = 0;
    this.maxParticles = 0;
    this.particleRestDensity = 1;
    this.restCharDens = 1;
    this.u = new Float32Array(0);
    this.v = new Float32Array(0);
    this.du = new Float32Array(0);
    this.dv = new Float32Array(0);
    this.prevU = new Float32Array(0);
    this.prevV = new Float32Array(0);
    this.p = new Float32Array(0);
    this.s = new Float32Array(0);
    this.cellType = new Int32Array(0);
    this.particleDensity = new Float32Array(0);
    this.numCellParticles = new Int32Array(0);
    this.firstCellParticle = new Int32Array(0);
    this.cellParticleIds = new Int32Array(0);
    this.particlePos = new Float32Array(0);
    this.particleVel = new Float32Array(0);
    this.charDens = new Float32Array(0);
    this.charSpeed = new Float32Array(0);
    this.smoothVal = new Float32Array(0);
    this.charIdxBuf = new Uint16Array(0);
    this.hasRenderedGrid = false;
    this.lastStepDt = 0.016;
    this.resize(width, height, options.cellSize ?? 15, this.fillHeight, true);
  }

  resize(width, height, cellSize = 15, fillHeight = this.fillHeight, forceReset = false) {
    const safeW = Math.max(60, Number.isFinite(width) ? width : 920);
    const safeH = Math.max(60, Number.isFinite(height) ? height : 500);
    const cellH = Math.max(6, Math.min(36, cellSize));
    // Square cellSize x cellSize character cells matching the public monochrome liquid matrix proportions.
    const cellW = cellH;
    const cols = Math.max(8, Math.floor(safeW / cellW));
    const rows = Math.max(6, Math.floor(safeH / cellH));

    const fillChanged = Math.abs(fillHeight - this.fillHeight) > 0.005;
    if (!forceReset && !fillChanged && cols === this.cols && rows === this.rows && Math.abs(safeW - this.pixelWidth) < 2 && Math.abs(safeH - this.pixelHeight) < 2) {
      return false;
    }

    this.pixelWidth = safeW;
    this.pixelHeight = safeH;
    this.cols = cols;
    this.rows = rows;
    this.fillHeight = clamp(fillHeight, 0, 1);

    this.simHeight = 10.0;
    this.simWidth = this.simHeight * (safeW / safeH);

    // Choose a bounded MAC grid resolution independent of ASCII font size so both fine & coarse glyphs simulate stably at 60fps.
    const targetNy = clamp(Math.round(rows * 0.78), 14, 34);
    this.h = this.simHeight / targetNy;
    this.fInvSpacing = 1.0 / this.h;
    this.fNumY = targetNy;
    this.fNumX = clamp(Math.floor(this.simWidth / this.h) + 1, 14, 68);
    this.simWidth = this.fNumX * this.h;
    this.fNumCells = this.fNumX * this.fNumY;

    this.u = new Float32Array(this.fNumCells);
    this.v = new Float32Array(this.fNumCells);
    this.du = new Float32Array(this.fNumCells);
    this.dv = new Float32Array(this.fNumCells);
    this.prevU = new Float32Array(this.fNumCells);
    this.prevV = new Float32Array(this.fNumCells);
    this.p = new Float32Array(this.fNumCells);
    this.s = new Float32Array(this.fNumCells);
    this.cellType = new Int32Array(this.fNumCells);
    this.particleDensity = new Float32Array(this.fNumCells);

    this.particleRadius = 0.35 * this.h;
    this.pInvSpacing = 1.0 / (2.2 * this.particleRadius);
    this.pNumX = Math.max(1, Math.floor(this.simWidth * this.pInvSpacing) + 1);
    this.pNumY = Math.max(1, Math.floor(this.simHeight * this.pInvSpacing) + 1);
    this.pNumCells = this.pNumX * this.pNumY;
    this.numCellParticles = new Int32Array(this.pNumCells);
    this.firstCellParticle = new Int32Array(this.pNumCells + 1);

    // Character lattice density, velocity, and temporal smoothing buffers (zero per-frame GC allocations).
    this.charDens = new Float32Array(this.cols * this.rows);
    this.charSpeed = new Float32Array(this.cols * this.rows);
    this.smoothVal = new Float32Array(this.cols * this.rows);
    this.charIdxBuf = new Uint16Array(this.cols * this.rows);
    this.hasRenderedGrid = false;

    this.initParticles();
    return true;
  }

  initParticles() {
    this.time = 0;
    this.hasRenderedGrid = false;
    this.smoothVal.fill(0);
    this.charIdxBuf.fill(0);
    const h = this.h;
    const r = this.particleRadius;
    const dx = 2.0 * r;
    const dy = Math.sqrt(3) * 0.5 * dx;

    // Solid 1-cell border enclosing the rectangular fluid tank.
    this.s.fill(1.0);
    for (let i = 0; i < this.fNumX; i++) {
      for (let j = 0; j < this.fNumY; j++) {
        if (i === 0 || i === this.fNumX - 1 || j === 0 || j === this.fNumY - 1) {
          this.s[i * this.fNumY + j] = 0.0;
        }
      }
    }

    if (this.fillHeight <= 0.001) {
      this.numParticles = 0;
      this.maxParticles = 0;
      this.particlePos = new Float32Array(0);
      this.particleVel = new Float32Array(0);
      this.cellParticleIds = new Int32Array(0);
      this.particleRestDensity = 1.0;
      return;
    }

    const innerMinX = h + r;
    const innerMaxX = (this.fNumX - 1) * h - r;
    const innerMinY = h + r;
    const usableH = (this.fNumY - 2) * h - 2 * r;
    const fillTopY = innerMinY + Math.max(dy * 1.5, usableH * this.fillHeight);

    const coords = [];
    let rowIdx = 0;
    for (let py = innerMinY; py <= fillTopY && coords.length < 9000; py += dy) {
      const xShift = (rowIdx & 1) === 0 ? 0 : r;
      for (let px = innerMinX + xShift; px <= innerMaxX && coords.length < 9000; px += dx) {
        coords.push(px, py);
      }
      rowIdx++;
    }

    this.numParticles = coords.length / 2;
    this.maxParticles = this.numParticles;
    this.particlePos = new Float32Array(coords);
    this.particleVel = new Float32Array(this.numParticles * 2);
    this.cellParticleIds = new Int32Array(this.numParticles);

    // Seed an asymmetric right-bound wave roll so sloshing crests appear from frame 1.
    for (let i = 0; i < this.numParticles; i++) {
      const nx = this.particlePos[2 * i] / this.simWidth;
      const ny = this.particlePos[2 * i + 1] / this.simHeight;
      this.particleVel[2 * i] = 5.6 * (0.35 + nx) * (0.5 + ny);
      this.particleVel[2 * i + 1] = 4.2 * Math.sin((nx - 0.2) * Math.PI);
    }

    this.particleRestDensity = 0.0;
    this.updateParticleDensity();
    let sumDens = 0;
    let fluidCells = 0;
    for (let i = 0; i < this.fNumCells; i++) {
      if (this.cellType[i] === FLUID_CELL) {
        sumDens += this.particleDensity[i];
        fluidCells++;
      }
    }
    this.particleRestDensity = fluidCells > 0 ? sumDens / fluidCells : 4.0;
    // Measure true average character-grid particle density over occupied fluid cells so intensity curves calibrate to every viewport/cellSize.
    this._splatParticlesToCharGrid();
    let charSum = 0;
    let charCount = 0;
    for (let i = 0; i < this.charDens.length; i++) {
      if (this.charDens[i] > 0.25) {
        charSum += this.charDens[i];
        charCount++;
      }
    }
    this.restCharDens = charCount > 0 ? charSum / charCount : 1.0;
  }

  splash(strength = 1.0, dirX = 1) {
    if (this.numParticles === 0) return;
    const s = clamp(strength, 0.2, 3.0);
    for (let i = 0; i < this.numParticles; i++) {
      const nx = this.particlePos[2 * i] / this.simWidth;
      const ny = this.particlePos[2 * i + 1] / Math.max(0.1, this.simHeight * Math.max(0.25, this.fillHeight));
      const crest = clamp(ny, 0, 1.4);
      this.particleVel[2 * i] += dirX * (6.5 + 8.5 * Math.sin(nx * Math.PI)) * s;
      this.particleVel[2 * i + 1] += (4.5 + 11.0 * Math.pow(nx - 0.5, 2)) * crest * s;
    }
  }

  setPointer(normX, normY, velX = 0, velY = 0, active = true) {
    this.pointer.x = clamp(normX, 0, 1) * this.simWidth;
    // Flip Y from DOM top-down [0..1] to simulation bottom-up [simHeight..0].
    this.pointer.y = (1.0 - clamp(normY, 0, 1)) * this.simHeight;
    this.pointer.vx = clamp(velX, -45, 45);
    this.pointer.vy = clamp(-velY, -45, 45);
    this.pointer.active = active;
    if (active) this.pointer.lastMoveTime = this.time;
  }

  clearPointer() {
    this.pointer.active = false;
    this.pointer.vx = 0;
    this.pointer.vy = 0;
  }

  integrateParticles(dt, gravity, autoWave, cursorRadius, cursorForce) {
    const t = this.time;
    const shortSide = Math.min(this.simWidth, this.simHeight);
    const pRadius = cursorRadius * shortSide;
    const pRadSq = pRadius * pRadius;
    const ptrActive = this.pointer.active && cursorRadius > 0 && cursorForce > 0 && t - this.pointer.lastMoveTime < 0.25;

    for (let i = 0; i < this.numParticles; i++) {
      const idx = 2 * i;
      let px = this.particlePos[idx];
      let py = this.particlePos[idx + 1];
      let vx = this.particleVel[idx];
      let vy = this.particleVel[idx + 1];

      vy += dt * gravity;

      if (autoWave) {
        const nx = px / this.simWidth;
        const crestZone = py > this.fillHeight * this.simHeight * 0.55 ? 1.0 : 0.35;
        // Single coherent low-frequency tidal rock (~4.3s period) creates rolling surface waves without high-frequency interior flicker.
        const rock = Math.sin(t * 1.45);
        vx += dt * rock * (gravity === 0 ? 3.2 : 8.2) * (0.4 + 0.6 * crestZone);
        vy += dt * Math.cos(t * 1.45 + nx * Math.PI) * (gravity === 0 ? 2.4 : 4.2) * crestZone;
      }

      if (ptrActive) {
        const dx = px - this.pointer.x;
        const dy = py - this.pointer.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < pRadSq && pRadius > 1e-4) {
          const dist = Math.sqrt(dSq);
          const falloff = 1.0 - dist / pRadius;
          const forceScale = falloff * (cursorForce / 66.0);
          // Blend directional wake from pointer velocity with radial radial push away from cursor core.
          const nx = dist > 1e-4 ? dx / dist : 0;
          const ny = dist > 1e-4 ? dy / dist : 1;
          vx += (this.pointer.vx * 0.42 + nx * 24.0) * forceScale * dt * 16.0;
          vy += (this.pointer.vy * 0.42 + ny * 24.0) * forceScale * dt * 16.0;
        }
      }

      // Soft velocity guard keeps simulation numerically stable even under max force/gravity inputs.
      vx = clamp(vx, -46, 46);
      vy = clamp(vy, -46, 46);
      px += vx * dt;
      py += vy * dt;

      this.particlePos[idx] = px;
      this.particlePos[idx + 1] = py;
      this.particleVel[idx] = vx;
      this.particleVel[idx + 1] = vy;
    }
  }

  pushParticlesApart(numIters) {
    if (this.numParticles <= 1 || numIters <= 0) return;

    this.numCellParticles.fill(0);
    for (let i = 0; i < this.numParticles; i++) {
      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];
      const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
      const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
      this.numCellParticles[xi * this.pNumY + yi]++;
    }

    let first = 0;
    for (let i = 0; i < this.pNumCells; i++) {
      first += this.numCellParticles[i];
      this.firstCellParticle[i] = first;
    }
    this.firstCellParticle[this.pNumCells] = first;

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];
      const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
      const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
      const cellNr = xi * this.pNumY + yi;
      this.firstCellParticle[cellNr]--;
      this.cellParticleIds[this.firstCellParticle[cellNr]] = i;
    }

    const minDist = 2.0 * this.particleRadius;
    const minDist2 = minDist * minDist;

    for (let iter = 0; iter < numIters; iter++) {
      for (let i = 0; i < this.numParticles; i++) {
        const px = this.particlePos[2 * i];
        const py = this.particlePos[2 * i + 1];
        const pxi = Math.floor(px * this.pInvSpacing);
        const pyi = Math.floor(py * this.pInvSpacing);
        const x0 = Math.max(pxi - 1, 0);
        const y0 = Math.max(pyi - 1, 0);
        const x1 = Math.min(pxi + 1, this.pNumX - 1);
        const y1 = Math.min(pyi + 1, this.pNumY - 1);

        for (let xi = x0; xi <= x1; xi++) {
          for (let yi = y0; yi <= y1; yi++) {
            const cellNr = xi * this.pNumY + yi;
            const cStart = this.firstCellParticle[cellNr];
            const cEnd = this.firstCellParticle[cellNr + 1];
            for (let k = cStart; k < cEnd; k++) {
              const id = this.cellParticleIds[k];
              if (id === i) continue;
              const qx = this.particlePos[2 * id];
              const qy = this.particlePos[2 * id + 1];
              let dx = qx - px;
              let dy = qy - py;
              const d2 = dx * dx + dy * dy;
              if (d2 > minDist2 || d2 === 0) continue;
              const d = Math.sqrt(d2);
              const s = 0.5 * (minDist - d) / d;
              dx *= s;
              dy *= s;
              this.particlePos[2 * i] -= dx;
              this.particlePos[2 * i + 1] -= dy;
              this.particlePos[2 * id] += dx;
              this.particlePos[2 * id + 1] += dy;
            }
          }
        }
      }
    }
  }

  handleParticleCollisions() {
    const minX = this.h + this.particleRadius;
    const maxX = (this.fNumX - 1) * this.h - this.particleRadius;
    const minY = this.h + this.particleRadius;
    const maxY = (this.fNumY - 1) * this.h - this.particleRadius;

    for (let i = 0; i < this.numParticles; i++) {
      let x = this.particlePos[2 * i];
      let y = this.particlePos[2 * i + 1];
      if (!Number.isFinite(x)) x = minX;
      if (!Number.isFinite(y)) y = minY;

      if (x < minX) {
        x = minX;
        this.particleVel[2 * i] = Math.max(0, this.particleVel[2 * i] * 0.25);
      } else if (x > maxX) {
        x = maxX;
        this.particleVel[2 * i] = Math.min(0, this.particleVel[2 * i] * 0.25);
      }
      if (y < minY) {
        y = minY;
        this.particleVel[2 * i + 1] = Math.max(0, this.particleVel[2 * i + 1] * 0.25);
      } else if (y > maxY) {
        y = maxY;
        this.particleVel[2 * i + 1] = Math.min(0, this.particleVel[2 * i + 1] * 0.25);
      }

      this.particlePos[2 * i] = x;
      this.particlePos[2 * i + 1] = y;
    }
  }

  updateParticleDensity() {
    const n = this.fNumY;
    const h = this.h;
    const h1 = this.fInvSpacing;
    const h2 = 0.5 * h;

    this.particleDensity.fill(0);
    for (let i = 0; i < this.fNumCells; i++) {
      this.cellType[i] = this.s[i] === 0.0 ? SOLID_CELL : EMPTY_CELL;
    }

    for (let i = 0; i < this.numParticles; i++) {
      let x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
      let y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);

      const ci = clamp(Math.floor(x * h1), 0, this.fNumX - 1);
      const cj = clamp(Math.floor(y * h1), 0, this.fNumY - 1);
      const cIdx = ci * n + cj;
      if (this.cellType[cIdx] === EMPTY_CELL) this.cellType[cIdx] = FLUID_CELL;

      const x0 = Math.min(Math.floor((x - h2) * h1), this.fNumX - 2);
      const tx = (x - h2 - x0 * h) * h1;
      const x1 = Math.min(x0 + 1, this.fNumX - 1);

      const y0 = Math.min(Math.floor((y - h2) * h1), this.fNumY - 2);
      const ty = (y - h2 - y0 * h) * h1;
      const y1 = Math.min(y0 + 1, this.fNumY - 1);

      const sx = 1.0 - tx;
      const sy = 1.0 - ty;

      if (x0 >= 0 && y0 >= 0) this.particleDensity[x0 * n + y0] += sx * sy;
      if (x1 >= 0 && y0 >= 0) this.particleDensity[x1 * n + y0] += tx * sy;
      if (x1 >= 0 && y1 >= 0) this.particleDensity[x1 * n + y1] += tx * ty;
      if (x0 >= 0 && y1 >= 0) this.particleDensity[x0 * n + y1] += sx * ty;
    }
  }

  transferVelocities(toGrid, flipRatio = 0.3) {
    const n = this.fNumY;
    const h = this.h;
    const h1 = this.fInvSpacing;
    const h2 = 0.5 * h;

    if (toGrid) {
      this.prevU.set(this.u);
      this.prevV.set(this.v);
      this.du.fill(0);
      this.dv.fill(0);
      this.u.fill(0);
      this.v.fill(0);

      for (let i = 0; i < this.fNumCells; i++) {
        this.cellType[i] = this.s[i] === 0.0 ? SOLID_CELL : EMPTY_CELL;
      }
      for (let i = 0; i < this.numParticles; i++) {
        const xi = clamp(Math.floor(this.particlePos[2 * i] * h1), 0, this.fNumX - 1);
        const yi = clamp(Math.floor(this.particlePos[2 * i + 1] * h1), 0, this.fNumY - 1);
        const cellNr = xi * n + yi;
        if (this.cellType[cellNr] === EMPTY_CELL) this.cellType[cellNr] = FLUID_CELL;
      }
    }

    for (let comp = 0; comp < 2; comp++) {
      const dx = comp === 0 ? 0.0 : h2;
      const dy = comp === 0 ? h2 : 0.0;
      const f = comp === 0 ? this.u : this.v;
      const prevF = comp === 0 ? this.prevU : this.prevV;
      const d = comp === 0 ? this.du : this.dv;

      for (let i = 0; i < this.numParticles; i++) {
        const x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
        const y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);

        const x0 = Math.max(0, Math.min(Math.floor((x - dx) * h1), this.fNumX - 2));
        const tx = clamp((x - dx - x0 * h) * h1, 0, 1);
        const x1 = x0 + 1;

        const y0 = Math.max(0, Math.min(Math.floor((y - dy) * h1), this.fNumY - 2));
        const ty = clamp((y - dy - y0 * h) * h1, 0, 1);
        const y1 = y0 + 1;

        const sx = 1.0 - tx;
        const sy = 1.0 - ty;
        const w0 = sx * sy;
        const w1 = tx * sy;
        const w2 = tx * ty;
        const w3 = sx * ty;

        const nr0 = x0 * n + y0;
        const nr1 = x1 * n + y0;
        const nr2 = x1 * n + y1;
        const nr3 = x0 * n + y1;

        if (toGrid) {
          const pv = this.particleVel[2 * i + comp];
          f[nr0] += pv * w0; d[nr0] += w0;
          f[nr1] += pv * w1; d[nr1] += w1;
          f[nr2] += pv * w2; d[nr2] += w2;
          f[nr3] += pv * w3; d[nr3] += w3;
        } else {
          const offset = comp === 0 ? n : 1;
          const v0 = this.cellType[nr0] !== EMPTY_CELL || this.cellType[nr0 - offset] !== EMPTY_CELL ? 1.0 : 0.0;
          const v1 = this.cellType[nr1] !== EMPTY_CELL || this.cellType[nr1 - offset] !== EMPTY_CELL ? 1.0 : 0.0;
          const v2 = this.cellType[nr2] !== EMPTY_CELL || this.cellType[nr2 - offset] !== EMPTY_CELL ? 1.0 : 0.0;
          const v3 = this.cellType[nr3] !== EMPTY_CELL || this.cellType[nr3 - offset] !== EMPTY_CELL ? 1.0 : 0.0;

          const denom = v0 * w0 + v1 * w1 + v2 * w2 + v3 * w3;
          if (denom > 0.0) {
            const picV = (v0 * w0 * f[nr0] + v1 * w1 * f[nr1] + v2 * w2 * f[nr2] + v3 * w3 * f[nr3]) / denom;
            const corr = (v0 * w0 * (f[nr0] - prevF[nr0]) + v1 * w1 * (f[nr1] - prevF[nr1]) + v2 * w2 * (f[nr2] - prevF[nr2]) + v3 * w3 * (f[nr3] - prevF[nr3])) / denom;
            const flipV = this.particleVel[2 * i + comp] + corr;
            this.particleVel[2 * i + comp] = (1.0 - flipRatio) * picV + flipRatio * flipV;
          }
        }
      }

      if (toGrid) {
        for (let i = 0; i < f.length; i++) {
          if (d[i] > 0.0) f[i] /= d[i];
        }
        for (let i = 0; i < this.fNumX; i++) {
          for (let j = 0; j < this.fNumY; j++) {
            const solid = this.cellType[i * n + j] === SOLID_CELL;
            if (solid || (i > 0 && this.cellType[(i - 1) * n + j] === SOLID_CELL)) {
              this.u[i * n + j] = 0.0;
            }
            if (solid || (j > 0 && this.cellType[i * n + j - 1] === SOLID_CELL)) {
              this.v[i * n + j] = 0.0;
            }
          }
        }
      }
    }
  }

  solveIncompressibility(numIters, overRelaxation) {
    this.p.fill(0);
    this.prevU.set(this.u);
    this.prevV.set(this.v);

    const n = this.fNumY;
    for (let iter = 0; iter < numIters; iter++) {
      for (let i = 1; i < this.fNumX - 1; i++) {
        for (let j = 1; j < this.fNumY - 1; j++) {
          const center = i * n + j;
          if (this.cellType[center] !== FLUID_CELL) continue;

          const left = (i - 1) * n + j;
          const right = (i + 1) * n + j;
          const bottom = i * n + j - 1;
          const top = i * n + j + 1;

          const sx0 = this.s[left];
          const sx1 = this.s[right];
          const sy0 = this.s[bottom];
          const sy1 = this.s[top];
          const sSum = sx0 + sx1 + sy0 + sy1;
          if (sSum === 0.0) continue;

          let div = this.u[right] - this.u[center] + this.v[top] - this.v[center];
          if (this.particleRestDensity > 0.0) {
            const compression = this.particleDensity[center] - this.particleRestDensity;
            if (compression > 0.0) div -= compression;
          }

          const p = (-div / sSum) * overRelaxation;
          this.u[center] -= sx0 * p;
          this.u[right] += sx1 * p;
          this.v[center] -= sy0 * p;
          this.v[top] += sy1 * p;
        }
      }
    }
  }

  step(deltaSeconds, options) {
    const rawDt = clamp(deltaSeconds, 0, 0.035);
    const dt = rawDt * options.speed;
    if (dt <= 0 || this.numParticles === 0) return;
    this.lastStepDt = dt;

    // Gentle dual substep keeps fast cursor splashes crisp while keeping CPU well below budget.
    const subSteps = 2;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this.time += subDt;
      this.integrateParticles(subDt, options.gravity, options.autoWave, options.cursorRadius, options.cursorForce);
      this.pushParticlesApart(options.separationIters);
      this.handleParticleCollisions();
      this.transferVelocities(true, options.flipRatio);
      this.updateParticleDensity();
      this.solveIncompressibility(options.pressureIters, options.overRelaxation);
      this.transferVelocities(false, options.flipRatio);
    }
  }

  _splatParticlesToCharGrid() {
    const cols = this.cols;
    const rows = this.rows;
    this.charDens.fill(0);
    this.charSpeed.fill(0);

    const invW = cols / this.simWidth;
    const invH = rows / this.simHeight;

    for (let i = 0; i < this.numParticles; i++) {
      const px = this.particlePos[2 * i];
      const py = this.particlePos[2 * i + 1];
      const gx = px * invW - 0.5;
      // Map bottom-up simulation Y onto top-down monospace row index [0 .. rows - 1].
      const gy = (this.simHeight - py) * invH - 0.5;

      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const spd = Math.hypot(this.particleVel[2 * i], this.particleVel[2 * i + 1]);

      for (let ox = 0; ox <= 1; ox++) {
        const cx = x0 + ox;
        if (cx < 0 || cx >= cols) continue;
        const wx = ox === 0 ? 1.0 - fx : fx;
        for (let oy = 0; oy <= 1; oy++) {
          const cy = y0 + oy;
          if (cy < 0 || cy >= rows) continue;
          const w = wx * (oy === 0 ? 1.0 - fy : fy);
          const idx = cy * cols + cx;
          this.charDens[idx] += w;
          this.charSpeed[idx] += w * spd;
        }
      }
    }
  }

  computeAsciiBuffer(charRamp = " ·:-~=+*#%@") {
    const cols = this.cols;
    const rows = this.rows;
    this._splatParticlesToCharGrid();

    const len = charRamp.length;
    const maxIdx = Math.max(1, len - 1);
    const refDens = Math.max(0.25, this.restCharDens);
    // Temporal low-pass smoothing + small deadband eliminates single-frame particle boundary flicker.
    const alpha = this.hasRenderedGrid ? 1.0 - Math.exp(-Math.max(0.004, this.lastStepDt) * 11.0) : 1.0;

    for (let idx = 0; idx < cols * rows; idx++) {
      const d = this.charDens[idx];
      let targetVal = 0;
      if (d >= 0.08 * refDens) {
        const avgSpd = this.charSpeed[idx] / Math.max(1e-5, d);
        const densRatio = clamp(d / (refDens * 1.16), 0, 1.15);
        const speedBoost = clamp(avgSpd / 6.2, 0, 0.50);
        // Keep steady body predominantly in '·:-~=+' (~65-72%) while energetic crests & shear flows light up '*#%@' (~28-35%).
        targetVal = clamp(Math.pow(densRatio, 1.54) * 0.50 + speedBoost, 0.04, 1.0);
      }

      const smoothed = this.hasRenderedGrid
        ? this.smoothVal[idx] + (targetVal - this.smoothVal[idx]) * alpha
        : targetVal;
      this.smoothVal[idx] = smoothed;

      if (smoothed < 0.045) {
        this.charIdxBuf[idx] = 0;
        continue;
      }

      const prevIdx = clamp(this.charIdxBuf[idx], 0, maxIdx);
      const rawIdx = Math.min(maxIdx, Math.max(1, Math.round(smoothed * maxIdx)));
      if (!this.hasRenderedGrid || rawIdx === prevIdx || prevIdx === 0) {
        this.charIdxBuf[idx] = rawIdx;
      } else {
        const prevCenter = prevIdx / maxIdx;
        // Deadband hysteresis prevents characters from strobing rapidly across threshold boundaries.
        if (Math.abs(smoothed - prevCenter) > 0.5 / maxIdx + 0.025) {
          this.charIdxBuf[idx] = rawIdx;
        }
      }
    }

    this.hasRenderedGrid = true;
    return this.charIdxBuf;
  }

  renderAscii(charRamp = " ·:-~=+*#%@") {
    const buf = this.computeAsciiBuffer(charRamp);
    const cols = this.cols;
    const rows = this.rows;
    const outRows = new Array(rows);

    for (let r = 0; r < rows; r++) {
      let line = "";
      const rowOff = r * cols;
      for (let c = 0; c < cols; c++) {
        line += charRamp[buf[rowOff + c]] ?? charRamp[0];
      }
      outRows[r] = line;
    }

    return outRows.join("\n");
  }
}
