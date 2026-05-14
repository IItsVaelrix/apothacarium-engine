/**
 * LAYER 1: LINGUISTIC INFERENCE ENGINE
 * Semantic Controller for PixelBrain Phase 3
 * 
 * Extracts visual parameters from linguistic input for pixel art generation.
 */

import { applyPhoneticModifiers } from './phonetic-materials.js';
import { SCHOOLS } from '../constants/schools.js';

const GOLDEN_RATIO = 1.618033988749895;

/**
 * @typedef {Object} SemanticParameters
 * @property {SurfaceProperties} surface - Surface properties from lexical semantics
 * @property {FormProperties} form - Form properties from syntax + semantics
 * @property {LightingProperties} light - Lighting properties from emotional valence
 * @property {ColorProperties} color - Color properties from bytecode + school affinity
 */

/**
 * @typedef {Object} SurfaceProperties
 * @property {'metal'|'stone'|'flesh'|'fabric'|'energy'|'organic'} material
 * @property {number} reflectivity - 0.0 - 1.0
 * @property {number} roughness - 0.0 - 1.0
 * @property {'smooth'|'grained'|'crystalline'|'fibrous'} texture
 */

/**
 * @typedef {Object} FormProperties
 * @property {number} scale - 0.5 - 2.0 (relative to baseline)
 * @property {'horizontal'|'vertical'|'diagonal'|'radial'|'none'} symmetry
 * @property {number} complexity - 0.0 - 1.0
 * @property {'horizontal'|'vertical'|'diagonal'|'radial'} dominantAxis
 */

/**
 * @typedef {Object} LightingProperties
 * @property {number} angle - degrees (0-360)
 * @property {number} hardness - 0.0 (soft) - 1.0 (hard)
 * @property {string} color - hex code
 * @property {number} intensity - 0.0 - 1.0
 */

/**
 * @typedef {Object} ColorProperties
 * @property {number} primaryHue - 0-360
 * @property {number} saturation - 0.0 - 1.0
 * @property {number} brightness - 0.0 - 1.0
 * @property {number} paletteSize - target color count
 */

/**
 * Lexical visual database - maps words to base visual parameters
 */
export const LEXICAL_VISUAL_DB = new Map([
  ['knight', {
    surface: { material: 'metal', reflectivity: 0.85, roughness: 0.3, texture: 'smooth' },
    form: { scale: 1.3, symmetry: 'vertical', complexity: 0.6, dominantAxis: 'vertical' },
    light: { angle: 45, hardness: 0.9, color: '#FFD700', intensity: 0.8 },
    semanticTags: ['heroic', 'noble', 'armored', 'warrior'],
  }],
  ['dragon', {
    surface: { material: 'organic', reflectivity: 0.6, roughness: 0.7, texture: 'grained' },
    form: { scale: 2.0, symmetry: 'horizontal', complexity: 0.9, dominantAxis: 'diagonal' },
    light: { angle: 30, hardness: 0.7, color: '#FF4500', intensity: 0.9 },
    semanticTags: ['mythical', 'fire', 'winged', 'dangerous'],
  }],
  ['forest', {
    surface: { material: 'organic', reflectivity: 0.2, roughness: 0.9, texture: 'fibrous' },
    form: { scale: 1.0, symmetry: 'none', complexity: 0.7, dominantAxis: 'vertical' },
    light: { angle: 60, hardness: 0.4, color: '#228B22', intensity: 0.5 },
    semanticTags: ['natural', 'growth', 'dense', 'peaceful'],
  }],
  ['crystal', {
    surface: { material: 'crystalline', reflectivity: 0.95, roughness: 0.1, texture: 'crystalline' },
    form: { scale: 0.8, symmetry: 'radial', complexity: 0.5, dominantAxis: 'radial' },
    light: { angle: 90, hardness: 1.0, color: '#E0FFFF', intensity: 1.0 },
    semanticTags: ['sharp', 'brittle', 'magical', 'pure'],
  }],
  ['shadow', {
    surface: { material: 'energy', reflectivity: 0.05, roughness: 0.5, texture: 'smooth' },
    form: { scale: 1.2, symmetry: 'none', complexity: 0.4, dominantAxis: 'horizontal' },
    light: { angle: 180, hardness: 0.2, color: '#2F2F4F', intensity: 0.2 },
    semanticTags: ['dark', 'mysterious', 'hidden', 'cold'],
  }],
  ['fire', {
    surface: { material: 'energy', reflectivity: 0.3, roughness: 0.8, texture: 'fibrous' },
    form: { scale: 1.5, symmetry: 'vertical', complexity: 0.8, dominantAxis: 'vertical' },
    light: { angle: 0, hardness: 0.6, color: '#FF6347', intensity: 1.0 },
    semanticTags: ['hot', 'destructive', 'passionate', 'bright'],
  }],
  ['water', {
    surface: { material: 'energy', reflectivity: 0.7, roughness: 0.2, texture: 'smooth' },
    form: { scale: 1.0, symmetry: 'horizontal', complexity: 0.5, dominantAxis: 'horizontal' },
    light: { angle: 45, hardness: 0.3, color: '#4169E1', intensity: 0.6 },
    semanticTags: ['fluid', 'calm', 'deep', 'reflective'],
  }],
  ['stone', {
    surface: { material: 'stone', reflectivity: 0.15, roughness: 0.95, texture: 'grained' },
    form: { scale: 1.1, symmetry: 'none', complexity: 0.3, dominantAxis: 'horizontal' },
    light: { angle: 75, hardness: 0.8, color: '#696969', intensity: 0.5 },
    semanticTags: ['solid', 'ancient', 'heavy', 'enduring'],
  }],
]);

/**
 * Default visual parameters for unknown tokens
 */
export const DEFAULT_VISUAL_PARAMS = Object.freeze({
  surface: { material: 'stone', reflectivity: 0.3, roughness: 0.5, texture: 'grained' },
  form: { scale: 1.0, symmetry: 'none', complexity: 0.5, dominantAxis: 'horizontal' },
  light: { angle: 45, hardness: 0.5, color: '#888888', intensity: 0.5 },
  color: { primaryHue: 0, saturation: 0.5, brightness: 0.5, paletteSize: 3 },
  semanticTags: [],
});

/**
 * Extract visual parameters from a token
 * @param {Object|string} token - VerseIR token with phonemes, school, analysis, or just a string
 * @returns {SemanticParameters}
 */
export function extractVisualParameters(token) {
  const normalized = typeof token === 'string' 
    ? token.toLowerCase().trim()
    : String(token?.text || token?.normalized || '').toLowerCase().trim();
  const base = LEXICAL_VISUAL_DB.get(normalized) || DEFAULT_VISUAL_PARAMS;

  // Ensure color is present
  const baseWithColor = {
    ...DEFAULT_VISUAL_PARAMS,
    ...base,
    color: base.color || { ...DEFAULT_VISUAL_PARAMS.color }
  };

  // Apply phonetic modifiers
  const phonemeMod = applyPhoneticModifiers(token?.phonemes || [], baseWithColor);

  // Apply school modifiers
  const schoolMod = applySchoolModifiers(token?.schoolId, phonemeMod);

  // Apply semantic weight from analysis
  const semanticMod = applySemanticWeight(token?.analysis, schoolMod);

  return Object.freeze(semanticMod);
}

/**
 * Apply school affinity modifiers to visual parameters
 * @param {string} schoolId - School identifier
 * @param {SemanticParameters} baseParams - Base parameters
 * @returns {SemanticParameters}
 */
export function applySchoolModifiers(schoolId, baseParams) {
  const school = SCHOOLS[schoolId] || SCHOOLS.VOID;
  // schoolColor available for future color-based modifiers
  const _schoolColor = school?.colorHsl || { h: 0, s: 0, l: 50 };

  const schoolModifiers = {
    SONIC: { light: { hardness: +0.2, intensity: +0.15 } },
    PSYCHIC: { surface: { reflectivity: +0.15 }, light: { hardness: -0.1 } },
    ALCHEMY: { surface: { roughness: -0.1 }, light: { color: '#FF1493' } },
    WILL: { light: { intensity: +0.2, hardness: +0.15 }, form: { scale: +0.1 } },
    VOID: { surface: { reflectivity: -0.2 }, light: { intensity: -0.3, color: '#2F2F4F' } },
  };

  const modifiers = schoolModifiers[schoolId] || {};
  return applyModifiers(baseParams, modifiers);
}

/**
 * Apply semantic weight from token analysis
 * @param {Object} analysis - Token analysis data
 * @param {SemanticParameters} baseParams - Base parameters
 * @returns {SemanticParameters}
 */
export function applySemanticWeight(analysis, baseParams) {
  if (!analysis || typeof analysis !== 'object') return baseParams;

  const modifiers = {};

  // Syllable count affects complexity and scale
  const syllableCount = Number(analysis?.syllableCount) || 0;
  if (syllableCount >= 3) {
    modifiers.form = { complexity: +0.2, scale: +0.15 };
  } else if (syllableCount === 1) {
    modifiers.form = { complexity: -0.1 };
  }

  // Stress pattern affects lighting hardness
  const stressPattern = String(analysis?.stressPattern || '');
  if (/1/.test(stressPattern)) {
    modifiers.light = { hardness: +0.15, intensity: +0.1 };
  }

  // Anchor weight affects overall prominence
  const anchorWeight = Number(analysis?.anchorWeight) || 0;
  if (anchorWeight >= 0.6) {
    modifiers.form = { ...(modifiers.form || {}), scale: +0.2 };
    modifiers.light = { ...(modifiers.light || {}), intensity: +0.2 };
  }

  return applyModifiers(baseParams, modifiers);
}

/**
 * Merge modifier objects
 * @param {Object} base - Base parameters
 * @param {Object} modifiers - Modifiers to apply
 * @returns {SemanticParameters}
 */
export function applyModifiers(base, modifiers) {
  const result = JSON.parse(JSON.stringify(base));

  for (const [category, mods] of Object.entries(modifiers)) {
    if (!result[category]) result[category] = {};
    for (const [key, value] of Object.entries(mods)) {
      if (typeof value === 'number' && typeof result[category][key] === 'number') {
        result[category][key] = clamp(result[category][key] + value, 0, 1);
      } else if (typeof value === 'string') {
        result[category][key] = value;
      } else if (typeof value === 'object' && value !== null) {
        result[category][key] = { ...result[category][key], ...value };
      }
    }
  }

  // Clamp numeric values to valid ranges
  if (result.surface) {
    result.surface.reflectivity = clamp(result.surface.reflectivity, 0, 1);
    result.surface.roughness = clamp(result.surface.roughness, 0, 1);
  }
  if (result.form) {
    result.form.scale = clamp(result.form.scale, 0.5, 2.0);
    result.form.complexity = clamp(result.form.complexity, 0, 1);
  }
  if (result.light) {
    result.light.angle = ((result.light.angle % 360) + 360) % 360;
    result.light.hardness = clamp(result.light.hardness, 0, 1);
    result.light.intensity = clamp(result.light.intensity, 0, 1);
  }
  if (result.color) {
    result.color.saturation = clamp(result.color.saturation, 0, 1);
    result.color.brightness = clamp(result.color.brightness, 0, 1);
  }

  return Object.freeze(result);
}

/**
 * Extract visual parameters from full verse input
 * @param {string} text - Input text
 * @param {Array} tokens - Tokenized verse with analysis
 * @returns {SemanticParameters} Aggregated parameters for the verse
 */
export function extractVerseVisualParameters(text, tokens = []) {
  if (!tokens || tokens.length === 0) {
    return DEFAULT_VISUAL_PARAMS;
  }

  // Aggregate parameters from all tokens
  const aggregated = tokens.reduce((acc, token) => {
    const params = extractVisualParameters(token);
    return {
      surface: averageSurface(acc.surface, params.surface),
      form: averageForm(acc.form, params.form),
      light: averageLight(acc.light, params.light),
      color: averageColor(acc.color, params.color),
    };
  }, DEFAULT_VISUAL_PARAMS);

  // Apply verse-level modifiers (line count, rhyme density, etc.)
  const verseModifiers = applyVerseModifiers(text, tokens, aggregated);

  return Object.freeze(verseModifiers);
}

/**
 * Apply verse-level modifiers
 * @param {string} text - Full verse text
 * @param {Array} tokens - Tokenized verse
 * @param {SemanticParameters} base - Aggregated base parameters
 * @returns {SemanticParameters}
 */
function applyVerseModifiers(text, tokens, base) {
  const lineCount = (text.match(/\n/g) || []).length + 1;
  const wordCount = tokens.length;
  const avgSyllables = tokens.reduce((sum, t) => sum + (t?.syllableCount || 1), 0) / Math.max(1, wordCount);

  const modifiers = {};

  // Longer verses get more complex forms
  if (wordCount >= 20) {
    modifiers.form = { complexity: +0.15, scale: +0.1 };
  }

  // Multi-line verses get vertical emphasis
  if (lineCount >= 3) {
    modifiers.form = { ...(modifiers.form || {}), dominantAxis: 'vertical' };
  }

  // High syllable density increases lighting intensity
  if (avgSyllables >= 2.5) {
    modifiers.light = { intensity: +0.15 };
  }

  return applyModifiers(base, modifiers);
}

/**
 * Average two surface property objects
 */
function averageSurface(a, b) {
  return {
    material: a.material === b.material ? a.material : 'stone',
    reflectivity: (a.reflectivity + b.reflectivity) / 2,
    roughness: (a.roughness + b.roughness) / 2,
    texture: a.texture === b.texture ? a.texture : 'grained',
  };
}

/**
 * Average two form property objects
 */
function averageForm(a, b) {
  return {
    scale: (a.scale + b.scale) / 2,
    symmetry: a.symmetry === b.symmetry ? a.symmetry : 'none',
    complexity: (a.complexity + b.complexity) / 2,
    dominantAxis: a.dominantAxis === b.dominantAxis ? a.dominantAxis : 'horizontal',
  };
}

/**
 * Average two lighting property objects
 */
function averageLight(a, b) {
  // Interpolate angle correctly across 360° boundary
  let angleDiff = b.angle - a.angle;
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;
  const avgAngle = ((a.angle + angleDiff / 2) % 360 + 360) % 360;

  return {
    angle: avgAngle,
    hardness: (a.hardness + b.hardness) / 2,
    color: a.color, // Keep dominant color
    intensity: (a.intensity + b.intensity) / 2,
  };
}

/**
 * Average two color property objects
 */
function averageColor(a, b) {
  return {
    primaryHue: (a.primaryHue + b.primaryHue) / 2,
    saturation: (a.saturation + b.saturation) / 2,
    brightness: (a.brightness + b.brightness) / 2,
    paletteSize: Math.max(a.paletteSize || 3, b.paletteSize || 3),
  };
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Semantic Controller class for stateful extraction
 */
export class SemanticController {
  constructor(options = {}) {
    this.options = Object.freeze({
      enablePhoneticModifiers: true,
      enableSchoolModifiers: true,
      enableSemanticWeight: true,
      ...options,
    });
  }

  /**
   * Apply school affinity modifiers to visual parameters (Static for Phase 3)
   */
  static applySchoolModifiers(baseParams, schoolId) {
    return applySchoolModifiers(schoolId, baseParams);
  }

  /**
   * Extract visual parameters from linguistic input
   * @param {string|Object} input - Text or VerseIR object
   * @returns {SemanticParameters}
   */
  extractVisualParameters(input) {
    if (typeof input === 'string') {
      return extractVerseVisualParameters(input, []);
    }
    if (input?.tokens) {
      return extractVerseVisualParameters(input.rawText || input.normalizedText || '', input.tokens);
    }
    return DEFAULT_VISUAL_PARAMS;
  }

  /**
   * Map phonetic features to material properties
   * @param {string[]} phonemes - Array of phoneme strings
   * @returns {Object} Material properties
   */
  mapPhonemesToMaterials(phonemes) {
    return applyPhoneticModifiers(phonemes, DEFAULT_VISUAL_PARAMS).surface;
  }

  /**
   * Derive lighting from emotional valence
   * @param {Object} valence - Emotional valence data
   * @returns {LightingProperties}
   */
  deriveLightingFromEmotion(valence) {
    const positivity = Number(valence?.positivity) || 0.5;
    const intensity = Number(valence?.intensity) || 0.5;

    return {
      angle: Math.floor(positivity * 180),
      hardness: intensity,
      color: positivity > 0.7 ? '#FFD700' : positivity < 0.3 ? '#4169E1' : '#888888',
      intensity: clamp(intensity + 0.2, 0, 1),
    };
  }

  /**
   * Calculate proportions from semantic weight
   * @param {Array} semanticWeights - Array of semantic weight objects
   * @returns {Object} Proportion grid
   */
  calculateProportions(semanticWeights) {
    if (!Array.isArray(semanticWeights) || semanticWeights.length === 0) {
      return { rows: 1, cols: 1, goldenRatio: GOLDEN_RATIO };
    }

    const totalWeight = semanticWeights.reduce((sum, w) => sum + (w?.weight || 0), 0);
    const avgWeight = totalWeight / semanticWeights.length;

    const cols = Math.ceil(Math.sqrt(semanticWeights.length * GOLDEN_RATIO));
    const rows = Math.ceil(semanticWeights.length / cols);

    return {
      rows,
      cols,
      goldenRatio: GOLDEN_RATIO,
      avgWeight: clamp(avgWeight, 0, 1),
    };
  }
}
