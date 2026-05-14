import { SCHOOLS } from '../../../constants/schools.js';
import { hslToHex } from './pcaChroma.js';

/**
 * MANDATORY RHYME COLOR REGISTRY (VAELRIX LAW 8 + 5)
 * 
 * Deterministic mapping of rhymeKeys to visual resonance colors.
 * Clamps hues within the active School's harmonic gamut to prevent "rainbow-sludge".
 * 
 * Rejuvenation Specs:
 * - Deterministic: Same rhymeKey + same School = Same color (always).
 * - Harmonic: Hue variance limited to +/- 30 degrees of school anchor.
 * - Inky: Saturation and Lightness optimized for dark parchment (Lore 11).
 */

const GOLDEN_ANGLE_DEG = 137.508;
const GAMUT_VARIANCE = 30; // degrees
const REGISTRY_SATURATION = 68; // %
const REGISTRY_LIGHTNESS = 64; // %

/**
 * Hashes a string to a deterministic integer.
 * @param {string} str 
 * @returns {number}
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Resolves a deterministic, harmonic color for a given rhyme resonance.
 * 
 * @param {string} rhymeKey - The phonemic identity (e.g. "AY1 T")
 * @param {string} schoolId - The active school (SONIC, PSYCHIC, etc.)
 * @param {string|null} fallbackColor - PCA-derived color for non-rhymes
 * @returns {string} Hex color
 */
export function resolveResonanceColor(rhymeKey, schoolId = 'DEFAULT', fallbackColor = null) {
  if (!rhymeKey) return fallbackColor;

  const school = SCHOOLS[schoolId.toUpperCase()] || SCHOOLS.DEFAULT || SCHOOLS.VOID;
  const anchorHue = school?.colorHsl?.h ?? 174; // Default to Psychic teal if missing

  // Deterministic seed for this specific sound
  const seed = hashString(rhymeKey);
  
  // Map seed to a hue shift within the school's permitted gamut
  // We use the golden angle logic but localized to the gamut wedge
  const hueShift = (seed * GOLDEN_ANGLE_DEG) % (GAMUT_VARIANCE * 2);
  const finalHue = (anchorHue - GAMUT_VARIANCE + hueShift + 360) % 360;

  // Merlin Rejuvenation: "Inky" palette hardening
  // Primary rhymes get higher saturation, background frequencies are more muted
  const saturation = REGISTRY_SATURATION;
  const lightness = REGISTRY_LIGHTNESS;

  return hslToHex(finalHue, saturation, lightness);
}

/**
 * Bulk resolves colors for a set of word analyses.
 * @param {Array} profiles 
 * @param {string} schoolId 
 * @returns {Map<string, string>} wordIdentity -> hexColor
 */
export function buildResonancePalette(profiles, schoolId = 'DEFAULT') {
  const palette = new Map();
  profiles.forEach(p => {
    if (!p) return;
    const identity = p.identity || `${p.lineIndex}:${p.wordIndex}:${p.charStart}`;
    palette.set(identity, resolveResonanceColor(p.rhymeKey, schoolId, p.visualBytecode?.color));
  });
  return palette;
}
