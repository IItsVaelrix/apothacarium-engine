/**
 * SCHOLOMANCE SCHOOL CONSTANTS
 * 
 * Central definition of schools, vowel mappings, and visual properties.
 * Core logic units (codex/) should import from here.
 */

import { hslToHex } from '../pixelbrain/shared.js';

export const VOWEL_FAMILY_TO_SCHOOL = Object.freeze({
  IY: 'PSYCHIC',
  IH: 'SONIC',
  EY: 'ALCHEMY',
  AE: 'WILL',
  A:  'NECROMANCY',
  AO: 'DIVINATION',
  OW: 'ABJURATION',
  UW: 'ABJURATION',
  AA: 'NECROMANCY',
  AH: 'WILL',
  AX: 'VOID',
  AW: 'DIVINATION',
  EH: 'WILL',
  AY: 'PSYCHIC',
  OY: 'ALCHEMY',
  OH: 'ABJURATION',
  UH: 'VOID',
  OO: 'ABJURATION',
  ER: 'SONIC',
  UR: 'SONIC',
});

export const SCHOOLS = Object.freeze({
  SONIC: {
    id: "SONIC",
    name: "Sonic Thaumaturgy",
    color: "#1ab4a8",
    colorHsl: { h: 175, s: 85, l: 55 },
    angle: 288,
    unlockXP: 0,
    glyph: "♩",
    atmosphere: {
      auroraIntensity: 0.9,
      saturation: 90,
      vignetteStrength: 0.70,
      scanlineOpacity: 0,
    },
  },
  PSYCHIC: {
    id: "PSYCHIC",
    name: "Psychic Schism",
    color: "#3b82f6",
    colorHsl: { h: 220, s: 90, l: 60 },
    angle: 72,
    unlockXP: 250,
    glyph: "◬",
    atmosphere: {
      auroraIntensity: 0.8,
      saturation: 85,
      vignetteStrength: 0.65,
      scanlineOpacity: 0,
    },
  },
  VOID: {
    id: "VOID",
    name: "The Void",
    color: "#94a3b8",
    colorHsl: { h: 215, s: 15, l: 41 },
    angle: 0,
    unlockXP: 1500,
    glyph: "∅",
    atmosphere: {
      auroraIntensity: 0.15,
      saturation: 15,
      vignetteStrength: 0.92,
      scanlineOpacity: 0.02,
    },
  },
  ALCHEMY: {
    id: "ALCHEMY",
    name: "Verbal Alchemy",
    color: "#ec4899",
    colorHsl: { h: 325, s: 80, l: 58 },
    angle: 144,
    unlockXP: 8000,
    glyph: "⚗",
    atmosphere: {
      auroraIntensity: 1.1,
      saturation: 105,
      vignetteStrength: 0.60,
      scanlineOpacity: 0,
    },
  },
  WILL: {
    id: "WILL",
    name: "Willpower Surge",
    color: "#ef4444",
    colorHsl: { h: 0, s: 85, l: 48 },
    angle: 216,
    unlockXP: 25000,
    glyph: "⚡",
    atmosphere: {
      auroraIntensity: 1.0,
      saturation: 95,
      vignetteStrength: 0.62,
      scanlineOpacity: 0,
    },
  },
  NECROMANCY: {
    id: "NECROMANCY",
    name: "Necromancy",
    color: "#22c55e",
    colorHsl: { h: 120, s: 75, l: 40 },
    angle: 36,
    unlockXP: 100000,
    glyph: "☠",
    atmosphere: {
      auroraIntensity: 0.6,
      saturation: 55,
      vignetteStrength: 0.82,
      scanlineOpacity: 0.01,
    },
  },
  ABJURATION: {
    id: "ABJURATION",
    name: "Abjuration",
    color: "#06b6d4",
    colorHsl: { h: 180, s: 80, l: 68 },
    angle: 108,
    unlockXP: 500000,
    glyph: "◇",
    atmosphere: {
      auroraIntensity: 0.5,
      saturation: 50,
      vignetteStrength: 0.50,
      scanlineOpacity: 0,
    },
  },
  DIVINATION: {
    id: "DIVINATION",
    name: "Divination",
    color: "#eab308",
    colorHsl: { h: 45, s: 90, l: 68 },
    angle: 180,
    unlockXP: 2000000,
    glyph: "◉",
    atmosphere: {
      auroraIntensity: 0.85,
      saturation: 88,
      vignetteStrength: 0.55,
      scanlineOpacity: 0,
    },
  },
});

/**
 * Generate color for schools without explicit color
 * @param {string} schoolId - School ID
 * @returns {string} Hex color
 */
export function generateSchoolColor(schoolId) {
  const school = SCHOOLS[schoolId];
  if (!school) return "#888888";
  
  // Use explicit color if defined
  if (school.color) return school.color;
  
  // Generate from HSL if defined
  if (school.colorHsl) {
    const { h, s, l } = school.colorHsl;
    return hslToHex(h, s, l);
  }
  
  // Fallback
  return "#888888";
}

/**
 * Computes normalized school weights from a distribution of vowel families.
 * 
 * @param {Record<string, number>} vowelFamilyDistribution - Map of family to count.
 * @returns {Record<string, number>} Map of school ID to normalized weight (0-1).
 */
export function computeSchoolWeights(vowelFamilyDistribution) {
  const schoolWeights = {};
  let totalWeight = 0;

  for (const [family, count] of Object.entries(vowelFamilyDistribution)) {
    const schoolId = VOWEL_FAMILY_TO_SCHOOL[family] || 'VOID';
    const weight = 0.4 + (count * 0.1); // Base weight for presence + frequency scaling
    schoolWeights[schoolId] = (schoolWeights[schoolId] || 0) + weight;
    totalWeight += weight;
  }

  // Normalize
  if (totalWeight > 0) {
    for (const schoolId in schoolWeights) {
      schoolWeights[schoolId] /= totalWeight;
    }
  } else {
    schoolWeights['VOID'] = 1.0;
  }

  return schoolWeights;
}

/**
 * Computes normalized school weights from VerseIR token hints (PixelBrain Phase 1).
 * 
 * @param {Array} tokenHints - Array of token hint objects.
 * @returns {Record<string, number>} Map of school ID to normalized weight (0-1).
 */
export function computeSchoolWeightsFromHints(tokenHints) {
  const safeHints = Array.isArray(tokenHints) ? tokenHints : [];
  if (safeHints.length === 0) return { VOID: 1.0 };

  const schoolWeights = {};
  let totalWeight = 0;

  safeHints.forEach((hint) => {
    const schoolId = String(hint?.schoolId || 'VOID').trim().toUpperCase() || 'VOID';
    const weight = 0.4 + (Number(hint?.anchorWeight) || 0) + (String(hint?.effect || 'INERT') !== 'INERT' ? 0.35 : 0);
    schoolWeights[schoolId] = (schoolWeights[schoolId] || 0) + weight;
    totalWeight += weight;
  });

  if (totalWeight > 0) {
    for (const schoolId in schoolWeights) {
      schoolWeights[schoolId] /= totalWeight;
    }
  } else {
    schoolWeights['VOID'] = 1.0;
  }

  return schoolWeights;
}

/**
 * Finds the school with the highest weight in a school weights map.
 * 
 * @param {Record<string, number>} schoolWeights - Normalized school weights.
 * @returns {string|null} The dominant school ID, or null if empty.
 */
export function computeDominantSchool(schoolWeights) {
  if (!schoolWeights || Object.keys(schoolWeights).length === 0) return null;

  return Object.entries(schoolWeights)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })[0]?.[0] || null;
}
