/**
 * SEMANTIC-TO-MATH BRIDGE (The Bridge Layer)
 * 
 * Converts linguistic/sentiment tags from NLU into mathematical constraints
 * that PixelBrain can execute deterministically.
 * 
 * Architecture:
 * 1. Linguistic Tags (from NLU) → 2. Symbol Library → 3. Math Constraints → 4. PixelBrain Params
 */

import { clamp01 } from '../pixelbrain/shared.js';

/**
 * MID-LEVEL SYMBOL LIBRARY
 * Maps linguistic concepts to mathematical constraints
 */

// ============ MOOD → MATH CONSTRAINTS ============
export const MOOD_CONSTRAINTS = Object.freeze({
  heroic: {
    form: { scale: 1.3, symmetry: 'vertical', dominantAxis: 'vertical', complexity: 0.7 },
    light: { angle: 45, hardness: 0.85, intensity: 0.85, color: '#FFD700' },
    color: { primaryHue: 45, saturation: 0.7, brightness: 0.75, paletteSize: 5 },
    surface: { material: 'metal', reflectivity: 0.8, roughness: 0.25, texture: 'smooth' },
    coordinateDensity: 14,
    latticeConnections: 'strong',
  },
  dark: {
    form: { scale: 1.2, symmetry: 'none', dominantAxis: 'horizontal', complexity: 0.6 },
    light: { angle: 180, hardness: 0.7, intensity: 0.25, color: '#2F2F4F' },
    color: { primaryHue: 270, saturation: 0.4, brightness: 0.2, paletteSize: 4 },
    surface: { material: 'stone', reflectivity: 0.1, roughness: 0.85, texture: 'grained' },
    coordinateDensity: 10,
    latticeConnections: 'sparse',
  },
  peaceful: {
    form: { scale: 1.0, symmetry: 'horizontal', dominantAxis: 'horizontal', complexity: 0.4 },
    light: { angle: 60, hardness: 0.3, intensity: 0.5, color: '#87CEEB' },
    color: { primaryHue: 180, saturation: 0.5, brightness: 0.65, paletteSize: 4 },
    surface: { material: 'organic', reflectivity: 0.25, roughness: 0.6, texture: 'fibrous' },
    coordinateDensity: 10,
    latticeConnections: 'gentle',
  },
  mysterious: {
    form: { scale: 1.15, symmetry: 'radial', dominantAxis: 'radial', complexity: 0.65 },
    light: { angle: 315, hardness: 0.4, intensity: 0.35, color: '#9370DB' },
    color: { primaryHue: 270, saturation: 0.6, brightness: 0.45, paletteSize: 5 },
    surface: { material: 'energy', reflectivity: 0.4, roughness: 0.5, texture: 'smooth' },
    coordinateDensity: 12,
    latticeConnections: 'radial',
  },
  magical: {
    form: { scale: 1.25, symmetry: 'radial', dominantAxis: 'radial', complexity: 0.75 },
    light: { angle: 90, hardness: 0.5, intensity: 0.75, color: '#E0FFFF' },
    color: { primaryHue: 180, saturation: 0.7, brightness: 0.7, paletteSize: 5 },
    surface: { material: 'crystalline', reflectivity: 0.85, roughness: 0.15, texture: 'crystalline' },
    coordinateDensity: 14,
    latticeConnections: 'radial',
  },
  fierce: {
    form: { scale: 1.4, symmetry: 'diagonal', dominantAxis: 'diagonal', complexity: 0.8 },
    light: { angle: 0, hardness: 0.85, intensity: 0.85, color: '#FF4500' },
    color: { primaryHue: 15, saturation: 0.85, brightness: 0.65, paletteSize: 5 },
    surface: { material: 'energy', reflectivity: 0.6, roughness: 0.4, texture: 'fibrous' },
    coordinateDensity: 16,
    latticeConnections: 'strong',
  },
  ancient: {
    form: { scale: 1.1, symmetry: 'none', dominantAxis: 'horizontal', complexity: 0.5 },
    light: { angle: 75, hardness: 0.6, intensity: 0.45, color: '#8B7355' },
    color: { primaryHue: 30, saturation: 0.35, brightness: 0.45, paletteSize: 4 },
    surface: { material: 'stone', reflectivity: 0.15, roughness: 0.9, texture: 'grained' },
    coordinateDensity: 10,
    latticeConnections: 'sparse',
  },
  ethereal: {
    form: { scale: 0.9, symmetry: 'radial', dominantAxis: 'radial', complexity: 0.55 },
    light: { angle: 90, hardness: 0.2, intensity: 0.6, color: '#F0F8FF' },
    color: { primaryHue: 200, saturation: 0.4, brightness: 0.85, paletteSize: 4 },
    surface: { material: 'energy', reflectivity: 0.5, roughness: 0.3, texture: 'smooth' },
    coordinateDensity: 11,
    latticeConnections: 'gentle',
  },
});

// ============ MATERIAL → MATH CONSTRAINTS ============
export const MATERIAL_CONSTRAINTS = Object.freeze({
  metal: {
    surface: { reflectivity: 0.8, roughness: 0.25, texture: 'smooth' },
    light: { hardness: 0.8, intensity: 0.7 },
    color: { saturation: 0.5, brightness: 0.6 },
    ditherMethod: 'ordered4x4',
    aliasStrength: 0.1,
  },
  stone: {
    surface: { reflectivity: 0.15, roughness: 0.9, texture: 'grained' },
    light: { hardness: 0.7, intensity: 0.5 },
    color: { saturation: 0.3, brightness: 0.45 },
    ditherMethod: 'ordered4x4',
    aliasStrength: 0.3,
  },
  organic: {
    surface: { reflectivity: 0.3, roughness: 0.7, texture: 'fibrous' },
    light: { hardness: 0.4, intensity: 0.55 },
    color: { saturation: 0.55, brightness: 0.5 },
    ditherMethod: 'floydSteinberg',
    aliasStrength: 0.2,
  },
  energy: {
    surface: { reflectivity: 0.6, roughness: 0.35, texture: 'smooth' },
    light: { hardness: 0.5, intensity: 0.75 },
    color: { saturation: 0.75, brightness: 0.7 },
    ditherMethod: 'none',
    aliasStrength: 0.05,
  },
  crystalline: {
    surface: { reflectivity: 0.9, roughness: 0.1, texture: 'crystalline' },
    light: { hardness: 0.9, intensity: 0.85 },
    color: { saturation: 0.65, brightness: 0.75 },
    ditherMethod: 'none',
    aliasStrength: 0.0,
  },
  fabric: {
    surface: { reflectivity: 0.2, roughness: 0.65, texture: 'fibrous' },
    light: { hardness: 0.3, intensity: 0.5 },
    color: { saturation: 0.5, brightness: 0.55 },
    ditherMethod: 'floydSteinberg',
    aliasStrength: 0.25,
  },
});

// ============ STYLE → MATH CONSTRAINTS ============
export const STYLE_CONSTRAINTS = Object.freeze({
  gameboy: {
    canvas: { width: 160, height: 144, gridSize: 2 },
    color: { paletteSize: 4 },
    ditherMethod: 'ordered4x4',
    extension: 'style-gameboy',
  },
  '8bit': {
    canvas: { width: 256, height: 240, gridSize: 2 },
    color: { paletteSize: 16 },
    ditherMethod: 'ordered4x4',
    extension: 'style-8bit',
  },
  '16bit': {
    canvas: { width: 512, height: 448, gridSize: 1 },
    color: { paletteSize: 256 },
    ditherMethod: 'floydSteinberg',
    extension: 'style-16bit',
  },
  crt: {
    canvas: { width: 320, height: 288, gridSize: 1 },
    ditherMethod: 'none',
    extension: 'style-crt',
  },
  pixel: {
    canvas: { width: 128, height: 128, gridSize: 4 },
    color: { paletteSize: 8 },
    ditherMethod: 'ordered4x4',
    aliasStrength: 0.5,
  },
});

// ============ EFFECT → MATH CONSTRAINTS ============
export const EFFECT_CONSTRAINTS = Object.freeze({
  fire: {
    light: { angle: 0, hardness: 0.7, intensity: 0.9, color: '#FF6347' },
    color: { primaryHue: 15, saturation: 0.85, brightness: 0.7 },
    surface: { material: 'energy', texture: 'fibrous' },
    coordinateDensity: 16,
    latticeConnections: 'strong',
    extension: 'physics-stretch-squash',
  },
  ice: {
    light: { angle: 90, hardness: 0.85, intensity: 0.7, color: '#E0FFFF' },
    color: { primaryHue: 180, saturation: 0.6, brightness: 0.8 },
    surface: { material: 'crystalline', reflectivity: 0.9, roughness: 0.1 },
    coordinateDensity: 13,
    latticeConnections: 'radial',
  },
  lightning: {
    light: { angle: 45, hardness: 0.95, intensity: 0.95, color: '#FFD700' },
    color: { primaryHue: 45, saturation: 0.8, brightness: 0.85 },
    surface: { material: 'energy', reflectivity: 0.7 },
    coordinateDensity: 18,
    latticeConnections: 'strong',
    dominantAxis: 'diagonal',
  },
  shadow: {
    light: { angle: 180, hardness: 0.3, intensity: 0.2, color: '#1A1A2E' },
    color: { primaryHue: 270, saturation: 0.3, brightness: 0.15 },
    surface: { material: 'energy', reflectivity: 0.05 },
    coordinateDensity: 8,
    latticeConnections: 'sparse',
  },
  glow: {
    light: { hardness: 0.2, intensity: 0.8 },
    color: { brightness: 0.85 },
    surface: { material: 'energy', roughness: 0.2 },
    ditherMethod: 'none',
    aliasStrength: 0.0,
  },
  sparkle: {
    light: { hardness: 0.9, intensity: 0.85 },
    color: { saturation: 0.75, brightness: 0.8 },
    surface: { material: 'crystalline', reflectivity: 0.95 },
    coordinateDensity: 15,
    latticeConnections: 'radial',
  },
  rust: {
    light: { hardness: 0.5, intensity: 0.5 },
    color: { primaryHue: 25, saturation: 0.5, brightness: 0.45 },
    surface: { material: 'metal', roughness: 0.85, texture: 'grained' },
    ditherMethod: 'floydSteinberg',
    ditherStrength: 0.6,
    aliasStrength: 0.3,
  },
  weathered: {
    light: { hardness: 0.55, intensity: 0.5 },
    color: { saturation: 0.35, brightness: 0.45 },
    surface: { roughness: 0.85, texture: 'grained' },
    ditherMethod: 'floydSteinberg',
    ditherStrength: 0.5,
    aliasStrength: 0.35,
  },
});

// ============ COMPOSITION → MATH CONSTRAINTS ============
export const COMPOSITION_CONSTRAINTS = Object.freeze({
  centered: {
    form: { symmetry: 'vertical', dominantAxis: 'vertical' },
    goldenPointAttraction: 0.8,
  },
  symmetric: {
    form: { symmetry: 'vertical' },
    goldenPointAttraction: 0.6,
  },
  asymmetric: {
    form: { symmetry: 'none' },
    goldenPointAttraction: 0.2,
  },
  radial: {
    form: { symmetry: 'radial', dominantAxis: 'radial' },
    goldenPointAttraction: 0.9,
  },
  spiral: {
    form: { symmetry: 'radial', dominantAxis: 'radial' },
    useSpiralCoordinates: true,
    spiralTurns: 3,
  },
  balanced: {
    form: { symmetry: 'horizontal' },
    goldenPointAttraction: 0.5,
  },
  dense: {
    coordinateDensity: 18,
    latticeConnections: 'strong',
  },
  sparse: {
    coordinateDensity: 8,
    latticeConnections: 'sparse',
  },
});

// ============ COLOR → MATH CONSTRAINTS ============
export const COLOR_CONSTRAINTS = Object.freeze({
  red: { color: { primaryHue: 0, saturation: 0.75, brightness: 0.6 }, light: { color: '#FF4500' } },
  orange: { color: { primaryHue: 30, saturation: 0.8, brightness: 0.65 }, light: { color: '#FFA500' } },
  yellow: { color: { primaryHue: 60, saturation: 0.7, brightness: 0.75 }, light: { color: '#FFD700' } },
  green: { color: { primaryHue: 120, saturation: 0.65, brightness: 0.55 }, light: { color: '#228B22' } },
  blue: { color: { primaryHue: 210, saturation: 0.7, brightness: 0.55 }, light: { color: '#4169E1' } },
  purple: { color: { primaryHue: 270, saturation: 0.65, brightness: 0.5 }, light: { color: '#9370DB' } },
  pink: { color: { primaryHue: 330, saturation: 0.7, brightness: 0.7 }, light: { color: '#FF69B4' } },
  white: { color: { saturation: 0.1, brightness: 0.95 }, light: { color: '#FFFFFF', intensity: 0.9 } },
  black: { color: { brightness: 0.15 }, light: { color: '#1A1A1A', intensity: 0.2 } },
  gray: { color: { saturation: 0.1, brightness: 0.5 }, light: { color: '#808080' } },
  gold: { color: { primaryHue: 45, saturation: 0.75, brightness: 0.7 }, light: { color: '#FFD700' } },
  silver: { color: { primaryHue: 180, saturation: 0.2, brightness: 0.75 }, light: { color: '#C0C0C0' } },
});

/**
 * Merge constraint objects (later overrides earlier)
 */
function mergeConstraints(...constraints) {
  const result = {};
  
  for (const constraint of constraints) {
    if (!constraint) continue;
    
    for (const [key, value] of Object.entries(constraint)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = { ...(result[key] || {}), ...value };
      } else {
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Convert NLU entities to mathematical constraints
 * @param {Object} entities - Extracted entities from NLU
 * @returns {Object} Merged mathematical constraints
 */
export function entitiesToMathConstraints(entities) {
  const constraints = [];
  
  // Apply mood constraints
  if (entities.mood && entities.mood.length > 0) {
    const mood = entities.mood[0].toLowerCase();
    constraints.push(MOOD_CONSTRAINTS[mood]);
  }
  
  // Apply material constraints
  if (entities.material && entities.material.length > 0) {
    const material = entities.material[0].toLowerCase();
    constraints.push(MATERIAL_CONSTRAINTS[material]);
  }
  
  // Apply style constraints
  if (entities.style && entities.style.length > 0) {
    const style = entities.style[0].toLowerCase();
    constraints.push(STYLE_CONSTRAINTS[style]);
  }
  
  // Apply effect constraints
  if (entities.effect && entities.effect.length > 0) {
    for (const effect of entities.effect) {
      const effectLower = effect.toLowerCase();
      if (EFFECT_CONSTRAINTS[effectLower]) {
        constraints.push(EFFECT_CONSTRAINTS[effectLower]);
      }
    }
  }
  
  // Apply composition constraints
  if (entities.composition && entities.composition.length > 0) {
    const composition = entities.composition[0].toLowerCase();
    constraints.push(COMPOSITION_CONSTRAINTS[composition]);
  }
  
  // Apply color constraints
  if (entities.color && entities.color.length > 0) {
    const color = entities.color[0].toLowerCase();
    constraints.push(COLOR_CONSTRAINTS[color]);
  }
  
  return mergeConstraints(...constraints);
}

/**
 * Convert mathematical constraints to PixelBrain parameters
 * @param {Object} mathConstraints - Mathematical constraints
 * @param {Object} baseParams - Base semantic parameters
 * @returns {Object} PixelBrain-ready parameters
 */
export function constraintsToPixelBrainParams(mathConstraints, baseParams = {}) {
  const params = {
    canvas: {
      width: 160,
      height: 144,
      gridSize: 1,
      ...(mathConstraints.canvas || {}),
    },
    form: {
      scale: 1.0,
      symmetry: 'none',
      complexity: 0.5,
      dominantAxis: 'horizontal',
      ...(baseParams.form || {}),
      ...(mathConstraints.form || {}),
    },
    surface: {
      material: 'stone',
      reflectivity: 0.3,
      roughness: 0.5,
      texture: 'grained',
      ...(baseParams.surface || {}),
      ...(mathConstraints.surface || {}),
    },
    light: {
      angle: 45,
      hardness: 0.5,
      intensity: 0.5,
      color: '#888888',
      ...(baseParams.light || {}),
      ...(mathConstraints.light || {}),
    },
    color: {
      primaryHue: 0,
      saturation: 0.5,
      brightness: 0.5,
      paletteSize: 4,
      ...(baseParams.color || {}),
      ...(mathConstraints.color || {}),
    },
    // PixelBrain-specific
    coordinateDensity: mathConstraints.coordinateDensity || 12,
    latticeConnections: mathConstraints.latticeConnections || 'normal',
    ditherMethod: mathConstraints.ditherMethod || 'ordered4x4',
    ditherStrength: mathConstraints.ditherStrength || 0.55,
    aliasStrength: mathConstraints.aliasStrength ?? 0.1,
    goldenPointAttraction: mathConstraints.goldenPointAttraction ?? 0.3,
    useSpiralCoordinates: mathConstraints.useSpiralCoordinates || false,
    spiralTurns: mathConstraints.spiralTurns || 3,
    extension: mathConstraints.extension || null,
  };
  
  // Normalize values
  params.form.scale = clamp01(params.form.scale * 0.5 + 0.5); // Map 0.5-2.0 to 0-1
  params.form.complexity = clamp01(params.form.complexity);
  params.surface.reflectivity = clamp01(params.surface.reflectivity);
  params.surface.roughness = clamp01(params.surface.roughness);
  params.light.hardness = clamp01(params.light.hardness);
  params.light.intensity = clamp01(params.light.intensity);
  params.color.saturation = clamp01(params.color.saturation);
  params.color.brightness = clamp01(params.color.brightness);
  
  return Object.freeze(params);
}

/**
 * Full pipeline: NLU entities → PixelBrain parameters
 * @param {Object} entities - NLU extracted entities
 * @param {Object} baseParams - Optional base parameters
 * @returns {Object} PixelBrain-ready parameters
 */
export function nluToPixelBrainParams(entities, baseParams = {}) {
  const mathConstraints = entitiesToMathConstraints(entities);
  return constraintsToPixelBrainParams(mathConstraints, baseParams);
}

/**
 * Get available symbols for debugging/introspection
 */
export function getSymbolLibrary() {
  return Object.freeze({
    moods: Object.keys(MOOD_CONSTRAINTS),
    materials: Object.keys(MATERIAL_CONSTRAINTS),
    styles: Object.keys(STYLE_CONSTRAINTS),
    effects: Object.keys(EFFECT_CONSTRAINTS),
    compositions: Object.keys(COMPOSITION_CONSTRAINTS),
    colors: Object.keys(COLOR_CONSTRAINTS),
  });
}
