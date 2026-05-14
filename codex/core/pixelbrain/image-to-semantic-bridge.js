/**
 * IMAGE-TO-SEMANTIC BRIDGE
 * 
 * Bridges image analysis results with PixelBrain's semantic parameter system.
 * Converts visual features into parameters that Layer 1 can reason about.
 */

import { clamp01 } from './shared.js';

/**
 * Convert image analysis to PixelBrain semantic parameters
 * @param {Object} analysis - Result from image analysis
 * @returns {Object} Semantic parameters
 */
export function imageToPixelBrainParams(analysis) {
  if (!analysis) return null;
  
  const { composition, colors, dimensions: _dimensions } = analysis;
  
  // Map brightness to material
  const brightness = composition?.brightnessNormalized || 0.5;
  const material = brightness > 0.6 ? 'crystalline'
    : brightness > 0.4 ? 'metal'
    : brightness > 0.2 ? 'stone'
    : 'energy';
    
  // Map complexity to roughness/reflectivity
  const complexity = composition?.complexity || 0.5;
  const roughness = clamp01(1 - (composition?.contrastNormalized || 0.5));
  
  return {
    surface: {
      material,
      roughness,
      reflectivity: material === 'crystalline' ? 0.8 : material === 'metal' ? 0.6 : 0.3,
      texture: composition?.edgeDensity > 0.1 ? 'crystalline' : 'smooth',
    },
    form: {
      scale: 1.0 + (complexity * 0.2),
      symmetry: composition?.hasSymmetry ? composition.symmetryType : 'none',
      complexity,
      dominantAxis: composition?.dominantAxis || 'horizontal',
    },
    light: {
      angle: brightness > 0.5 ? 45 : 135,
      hardness: composition?.contrastNormalized || 0.5,
      intensity: brightness,
    },
    color: {
      paletteSize: Math.min(16, colors?.length || 4),
      saturation: composition?.contrastNormalized || 0.5,
      brightness,
    }
  };
}

/**
 * Blend image parameters with NLU-derived parameters
 * @param {Object} imageParams - Parameters from image
 * @param {Object} nluParams - Parameters from text analysis
 * @param {number} weight - Weight of image params (0-1)
 * @returns {Object} Merged parameters
 */
export function mergeImageAndNLUParams(imageParams, nluParams, weight = 0.5) {
  if (!imageParams) return nluParams;
  if (!nluParams) return imageParams;
  
  const w = clamp01(weight);
  const nw = 1 - w;
  
  return {
    surface: {
      material: w > 0.7 ? imageParams.surface.material : nluParams.surface.material,
      roughness: imageParams.surface.roughness * w + nluParams.surface.roughness * nw,
      reflectivity: imageParams.surface.reflectivity * w + nluParams.surface.reflectivity * nw,
      texture: w > 0.5 ? imageParams.surface.texture : nluParams.surface.texture,
    },
    form: {
      scale: imageParams.form.scale * w + nluParams.form.scale * nw,
      symmetry: w >= 0.5 ? imageParams.form.symmetry : nluParams.form.symmetry,
      complexity: imageParams.form.complexity * w + nluParams.form.complexity * nw,
      dominantAxis: w > 0.6 ? imageParams.form.dominantAxis : nluParams.form.dominantAxis,
    },
    light: {
      angle: imageParams.light.angle * w + nluParams.light.angle * nw,
      hardness: imageParams.light.hardness * w + nluParams.light.hardness * nw,
      intensity: imageParams.light.intensity * w + nluParams.light.intensity * nw,
    },
    color: {
      ...nluParams.color, // Prefer NLU for color logic but blend weights
      paletteSize: Math.round(imageParams.color.paletteSize * w + nluParams.color.paletteSize * nw),
    }
  };
}

/**
 * Generate a palette object from image colors
 * @param {Array} colors - Dominant colors from analysis
 * @returns {Object} Palette object
 */
export function generatePaletteFromImage(colors) {
  if (!colors || colors.length === 0) return null;
  
  const hexColors = colors.map(c => c.hex);
  const weights = colors.map(c => c.percentage / 100);
  
  return {
    key: `img_${hexColors[0].replace('#', '')}`,
    colors: hexColors,
    weights,
    source: 'image',
    schoolId: 'VOID', // Default
    rarity: 'COMMON',
    effect: 'NONE'
  };
}

/**
 * Extract coordinate hints from image composition
 * @param {Object} composition - Composition from analysis
 * @param {Object} canvasSize - Target canvas size
 * @returns {Object} Hints for coordinate mapping
 */
export function extractCoordinateHints(composition, canvasSize) {
  if (!composition) return null;
  
  const { width, height } = canvasSize;
  
  // Suggest a center point based on symmetry
  let suggestedCenter = { x: width / 2, y: height / 2 };
  
  if (composition.hasSymmetry && composition.symmetryType === 'vertical') {
    suggestedCenter.x = width / 2;
  }
  
  return {
    suggestedCenter,
    axisBias: composition.dominantAxis,
    densityHint: composition.edgeDensity,
    scaleHint: 1.0 + (composition.complexity * 0.1)
  };
}
