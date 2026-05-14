export const GOLDEN_RATIO = 1.618033988749895;
export const GOLDEN_ANGLE = 137.50776405003785;

export const DEFAULT_PIXELBRAIN_CANVAS = Object.freeze({
  width: 160,
  height: 144,
  gridSize: 1,
});

/**
 * PALETTE_CONTRACT — Deterministic thresholds for PixelBrain V12
 */
export const PALETTE_CONTRACT = Object.freeze({
  TIERS: {
    INEXPLICABLE: 'INEXPLICABLE',
    RARE: 'RARE',
    COMMON: 'COMMON',
    TRANSCENDENT: 'TRANSCENDENT',
    HARMONIC: 'HARMONIC',
    RESONANT: 'RESONANT',
  },
  SIZES: {
    INEXPLICABLE: 5,
    RARE: 4,
    COMMON: 3,
  },
  SHIFTS: {
    INEXPLICABLE: 18,
    RARE: 10,
    COMMON: 6,
  },
  LIFT: {
    TRANSCENDENT: 12,
    HARMONIC: 7,
    RESONANT: 4,
    INERT: 0,
  },
  ADDRESSING: {
    PAGE_SIZE: 8, // 8-byte addressing blocks for SSD alignment
    BLOCK_SIZE: 64,
  }
});

export function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

export function roundTo(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

export function hashString(value) {
  const input = String(value ?? '');
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * Deterministic pseudo-random number generator for mathematical purity
 */
export function pseudoRandom(seed) {
  const h = hashString(seed);
  // Splitmix64-style state transition
  return (h % 1000000) / 1000000;
}

export function normalizeDegrees(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return ((numeric % 360) + 360) % 360;
}

export function createBytecodeString({
  schoolId = 'VOID',
  rarity = 'COMMON',
  effect = 'INERT',
} = {}) {
  const safeSchool = String(schoolId || 'VOID').trim().toUpperCase() || 'VOID';
  const safeRarity = String(rarity || 'COMMON').trim().toUpperCase() || 'COMMON';
  const safeEffect = String(effect || 'INERT').trim().toUpperCase() || 'INERT';
  return `VW-${safeSchool}-${safeRarity}-${safeEffect}`;
}

export function parseBytecodeString(bytecode) {
  const input = String(bytecode || '').trim().toUpperCase();
  
  // ─── V12 FORMALIZATION ─────────────────────────────────────────────────────
  // If the bytecode is a 'short' string (e.g., 'AA1', 'EH1', 'R1'),
  // expand it into a formal V12 hyphenated segment.
  if (input && !input.includes('-') && !input.startsWith('VW')) {
    const schoolId = input.replace(/[0-9]/g, '');
    return Object.freeze({
      version: 'VW',
      schoolId: schoolId || 'VOID',
      rarity: 'COMMON',
      effect: 'INERT',
      isLegacyShort: true,
    });
  }

  const parts = input.split('-');
  return Object.freeze({
    version: parts[0] === 'VW' ? 'VW' : 'UNKNOWN',
    schoolId: parts[1] || 'VOID',
    rarity: parts[2] || 'COMMON',
    effect: parts[3] || 'INERT',
    isLegacyShort: false,
  });
}

export function createByteMap(colors) {
  return Object.freeze(
    Object.fromEntries(
      (Array.isArray(colors) ? colors : []).map((color, index) => [String(index), String(color || '')])
    )
  );
}

export function hslToHex(h, s, l) {
  const safeHue = normalizeDegrees(h);
  const safeSaturation = clampNumber(s, 0, 100);
  const safeLightness = clampNumber(l, 0, 100) / 100;
  const amplitude = (safeSaturation * Math.min(safeLightness, 1 - safeLightness)) / 100;
  const channel = (index) => {
    const k = (index + (safeHue / 30)) % 12;
    const color = safeLightness - (amplitude * Math.max(Math.min(k - 3, 9 - k, 1), -1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
