export const DEFAULTS = Object.freeze({
  speed: 0.3,
  cellSize: 12,
  gravity: 0,
  flipRatio: 1,
  pressureIters: 30,
  separationIters: 3,
  overRelaxation: 1.5,
  fillHeight: 0.4,
  cursorRadius: 0.18,
  cursorForce: 134,
  characters: " ·:-~=+*#%@",
  color: "#9e9e9e",
  backgroundColor: "#000000",
  fontFamily: "monospace",
  opacity: 1,
  autoWave: true,
  paused: false,
  interactive: true,
  introEnabled: true,
  introDuration: 3.2,
  introStrength: 1,
});

// Shared by the simulation renderer, live showcase panel, and dependency-free Node tests.
export const RANGES = Object.freeze({
  speed: [0, 3, 0.05],
  cellSize: [6, 30, 1],
  gravity: [-50, 0, 1],
  flipRatio: [0, 1, 0.01],
  pressureIters: [5, 80, 1],
  separationIters: [1, 10, 1],
  overRelaxation: [1, 2, 0.01],
  fillHeight: [0, 1, 0.01],
  cursorRadius: [0, 0.5, 0.01],
  cursorForce: [0, 200, 1],
  opacity: [0, 1, 0.01],
  introDuration: [0.8, 8, 0.1],
  introStrength: [0, 2, 0.05],
});

const INTEGER_KEYS = new Set(["cellSize", "pressureIters", "separationIters"]);

export function normalizeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[\da-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function normalizeCharacters(value) {
  if (typeof value !== "string") return DEFAULTS.characters;
  // Require at least empty space + one glyph so density mapping never indexes out of range.
  return value.length >= 2 ? value : DEFAULTS.characters;
}

export function normalizeOptions(input = {}) {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(RANGES)) {
    const [min, max] = RANGES[key];
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const clamped = Math.min(max, Math.max(min, value));
      result[key] = INTEGER_KEYS.has(key) ? Math.round(clamped) : clamped;
    }
  }
  result.color = normalizeColor(input.color, DEFAULTS.color);
  result.backgroundColor = normalizeColor(input.backgroundColor, DEFAULTS.backgroundColor);
  result.characters = normalizeCharacters(input.characters);
  if (typeof input.fontFamily === "string" && input.fontFamily.trim().length > 0) {
    result.fontFamily = input.fontFamily.trim();
  }
  for (const key of ["autoWave", "paused", "interactive", "introEnabled"]) {
    if (typeof input[key] === "boolean") result[key] = input[key];
  }
  return result;
}
