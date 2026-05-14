/**
 * APOTHACARIUM HERBAL PALETTE PRESETS
 *
 * Replaces the school/vowel-family palette resolution from Scholomance.
 * Each preset is 5-7 dominant colors with a use mapping so adapters can
 * resolve semantic roles (bg, herbs, glow, accent, labels, cabinet,
 * borders) without referencing SCHOOLS constants.
 *
 * Constraint (PDR §6): 5-7 colors max, no neon/sci-fi colors,
 * no fully saturated (#00FF00, #FF00FF, #00FFFF) entries.
 */

export const COSMIC_HERBAL = Object.freeze({
  id: 'cosmic-herbal',
  name: 'Cosmic Herbal',
  colors: ['#2D1B4E', '#4A7C59', '#FFBF00', '#B8746E', '#F5F0E6', '#3E2723', '#E8D5B7'],
  use: {
    bg: 0,
    herbs: 1,
    glow: 2,
    accent: 3,
    labels: 4,
    cabinet: 5,
    borders: 6,
  },
});

export const SCHOLOMANCE_FOLK = Object.freeze({
  id: 'scholomance-folk',
  name: 'Scholomance Folk',
  colors: ['#1A1A2E', '#5B8C5A', '#E8A838', '#C27A7A', '#F5E6D3', '#4A3728', '#D4C4A8'],
  use: {
    bg: 0,
    herbs: 1,
    glow: 2,
    accent: 3,
    labels: 4,
    cabinet: 5,
    borders: 6,
  },
});

export const EARTH_DEAD = Object.freeze({
  id: 'earth-dead',
  name: 'Earth Dead',
  colors: ['#1F1A14', '#3C5236', '#A07A2B', '#8B5A3C', '#D9C9A8', '#2A1F17'],
  use: {
    bg: 0,
    herbs: 1,
    glow: 2,
    accent: 3,
    labels: 4,
    cabinet: 5,
    borders: 5,
  },
});

export const APOTHACARIUM_PRESETS = Object.freeze({
  [COSMIC_HERBAL.id]: COSMIC_HERBAL,
  [SCHOLOMANCE_FOLK.id]: SCHOLOMANCE_FOLK,
  [EARTH_DEAD.id]: EARTH_DEAD,
});

export const DEFAULT_PRESET_ID = COSMIC_HERBAL.id;

const NEON_FORBIDDEN = new Set(['#00FF00', '#FF00FF', '#00FFFF']);

/**
 * Validate a palette against PDR §6 constraints.
 * @param {{colors: string[]}} palette
 * @returns {{ok: boolean, violations: string[]}}
 */
export function validatePalette(palette) {
  const violations = [];
  if (!palette || !Array.isArray(palette.colors)) {
    return { ok: false, violations: ['palette.colors must be an array'] };
  }
  const n = palette.colors.length;
  if (n < 5 || n > 7) {
    violations.push(`color count ${n} outside [5,7]`);
  }
  for (const hex of palette.colors) {
    const upper = (hex || '').toUpperCase();
    if (NEON_FORBIDDEN.has(upper)) {
      violations.push(`neon-forbidden color: ${hex}`);
    }
    if (!/^#[0-9A-F]{6}$/.test(upper)) {
      violations.push(`invalid hex: ${hex}`);
    }
    // No high-brightness LED-screen colors (PDR §6 no-modernity)
    if (/^#[0-9A-F]{6}$/.test(upper)) {
      const r = parseInt(upper.slice(1, 3), 16);
      const g = parseInt(upper.slice(3, 5), 16);
      const b = parseInt(upper.slice(5, 7), 16);
      if (r > 240 && g > 240 && b > 240) {
        violations.push(`LED-screen brightness (>240 RGB): ${hex}`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Resolve a palette by id, falling back to the default.
 * @param {string} [id]
 * @returns {Object} palette preset
 */
export function getPreset(id) {
  return APOTHACARIUM_PRESETS[id] || APOTHACARIUM_PRESETS[DEFAULT_PRESET_ID];
}
