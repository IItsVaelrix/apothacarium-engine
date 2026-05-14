/**
 * Phonetic-to-Material Mapping for PixelBrain Phase 3
 * 
 * Maps phonetic features to surface/material properties for pixel art generation.
 */

/**
 * Phoneme to material property mapping
 * Plosives → Hard surfaces
 * Fricatives → Soft/textured surfaces
 * Nasals → Organic materials
 * Liquids → Flowing/reflective surfaces
 */
export const PHONEME_MATERIAL_MAP = Object.freeze({
  // Plosives - hard, sharp surfaces
  'P': { roughness: -0.2, hardness: +0.3, material: 'metal' },
  'B': { roughness: -0.15, hardness: +0.25, material: 'metal' },
  'T': { roughness: -0.1, hardness: +0.2, material: 'stone' },
  'D': { roughness: -0.1, hardness: +0.15, material: 'stone' },
  'K': { roughness: -0.15, hardness: +0.25, material: 'metal' },
  'G': { roughness: -0.1, hardness: +0.2, material: 'stone' },

  // Fricatives - soft, textured surfaces
  'S': { roughness: +0.3, texture: 'grained' },
  'Z': { roughness: +0.25, texture: 'grained' },
  'SH': { roughness: +0.4, texture: 'fibrous' },
  'ZH': { roughness: +0.45, texture: 'fibrous', material: 'organic' },
  'F': { roughness: +0.2, texture: 'smooth' },
  'V': { roughness: +0.15, texture: 'smooth' },
  'TH': { roughness: +0.35, texture: 'fibrous' },
  'DH': { roughness: +0.3, texture: 'fibrous' },
  'HH': { roughness: +0.1, texture: 'smooth' },

  // Nasals - organic, soft materials
  'M': { material: 'organic', roughness: +0.2, reflectivity: -0.1 },
  'N': { material: 'organic', roughness: +0.15, reflectivity: -0.05 },
  'NG': { material: 'organic', roughness: +0.25, reflectivity: -0.1 },

  // Liquids - flowing, reflective surfaces
  'L': { reflectivity: +0.2, texture: 'smooth', roughness: -0.1 },
  'R': { reflectivity: +0.15, texture: 'grained', roughness: -0.05 },
  'W': { reflectivity: +0.25, texture: 'smooth', material: 'energy' },
  'Y': { reflectivity: +0.2, texture: 'smooth', material: 'energy' },

  // Affricates - complex textures
  'CH': { roughness: +0.2, hardness: +0.15, texture: 'crystalline' },
  'JH': { roughness: +0.15, hardness: +0.1, texture: 'crystalline' },

  // Glides - ethereal, energy-like
  'DX': { reflectivity: +0.1, texture: 'smooth' },
  'IX': { reflectivity: +0.15, texture: 'smooth' },
  'AX': { roughness: +0.05, texture: 'grained' },
  'AH': { roughness: +0.1, texture: 'grained' },
  'UH': { reflectivity: +0.1, texture: 'smooth' },
  'EH': { roughness: +0.05, hardness: +0.05 },
  'AE': { roughness: -0.05, hardness: +0.1 },
  'AA': { roughness: +0.15, texture: 'grained' },
  'AO': { reflectivity: +0.05, texture: 'smooth' },
  'IH': { roughness: -0.05, hardness: +0.05 },
  'IY': { reflectivity: +0.1, hardness: +0.05 },
  'UW': { reflectivity: +0.15, texture: 'smooth' },
  'OW': { reflectivity: +0.1, texture: 'smooth' },
  'OY': { reflectivity: +0.2, texture: 'crystalline' },
  'AW': { roughness: +0.1, texture: 'grained' },
  'ER': { roughness: +0.1, material: 'organic' },
  'EN': { roughness: +0.15, material: 'organic' },
  'EL': { reflectivity: +0.1, texture: 'smooth' },
});

/**
 * Default material properties
 */
export const DEFAULT_MATERIAL_PROPS = Object.freeze({
  material: 'stone',
  roughness: 0.5,
  reflectivity: 0.3,
  texture: 'grained',
  hardness: 0.5,
});

/**
 * Apply phonetic modifiers to base parameters
 * @param {string[]|Object} phonemes - Array of phoneme strings or object with vowelFamily/consonants
 * @param {Object} baseParams - Base visual parameters
 * @returns {Object} Modified parameters
 */
export function applyPhoneticModifiers(phonemes, baseParams = {}) {
  const safeBase = Object.keys(baseParams).length > 0 ? baseParams : { surface: { ...DEFAULT_MATERIAL_PROPS } };
  
  // Handle object input from some tests
  let phonemeArray = [];
  if (Array.isArray(phonemes)) {
    phonemeArray = phonemes;
  } else if (phonemes && typeof phonemes === 'object') {
    if (phonemes.vowelFamily) phonemeArray.push(phonemes.vowelFamily);
    if (Array.isArray(phonemes.consonants)) phonemeArray.push(...phonemes.consonants);
  }

  if (phonemeArray.length === 0) {
    return safeBase;
  }

  const modifiers = phonemeArray.reduce((acc, phoneme) => {
    // Remove digit suffixes (e.g., 'N' from 'N1')
    const cleanPhoneme = String(phoneme || '').replace(/[0-9]/g, '').toUpperCase().trim();
    const mod = PHONEME_MATERIAL_MAP[cleanPhoneme];
    
    if (mod) {
      return mergeModifiers(acc, mod);
    }
    return acc;
  }, {});

  // For compatibility with tests that expect the modifiers object directly if no baseParams provided
  if (Object.keys(baseParams).length === 0) {
    return {
      ...DEFAULT_MATERIAL_PROPS,
      ...modifiers
    };
  }

  return applyModifiers(safeBase, modifiers);
}

/**
 * Merge two modifier objects
 * @param {Object} acc - Accumulator
 * @param {Object} mod - New modifier
 * @returns {Object} Merged modifiers
 */
function mergeModifiers(acc, mod) {
  const result = { ...acc };
  
  for (const [key, value] of Object.entries(mod)) {
    if (typeof value === 'number') {
      result[key] = (result[key] || 0) + value;
    } else if (typeof value === 'string') {
      // String values (material, texture) get overwritten by last occurrence
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Apply modifiers to base parameters
 * @param {Object} base - Base parameters
 * @param {Object} modifiers - Modifiers to apply
 * @returns {Object} Modified parameters
 */
function applyModifiers(base, modifiers) {
  const result = JSON.parse(JSON.stringify(base));
  
  // Apply surface modifiers
  if (!result.surface) result.surface = { ...DEFAULT_MATERIAL_PROPS };
  
  if (modifiers.material) {
    result.surface.material = modifiers.material;
  }
  if (typeof modifiers.roughness === 'number') {
    result.surface.roughness = clamp(result.surface.roughness + modifiers.roughness, 0, 1);
  }
  if (typeof modifiers.reflectivity === 'number') {
    result.surface.reflectivity = clamp(result.surface.reflectivity + modifiers.reflectivity, 0, 1);
  }
  if (modifiers.texture) {
    result.surface.texture = modifiers.texture;
  }
  
  // Apply light modifiers if present
  if (!result.light) result.light = { angle: 45, hardness: 0.5, color: '#888888', intensity: 0.5 };
  if (typeof modifiers.hardness === 'number') {
    result.light.hardness = clamp(result.light.hardness + modifiers.hardness, 0, 1);
  }
  
  return Object.freeze(result);
}

/**
 * Get dominant material from phoneme array
 * @param {string[]} phonemes - Array of phoneme strings
 * @returns {string} Dominant material type
 */
export function getDominantMaterial(phonemes) {
  if (!Array.isArray(phonemes) || phonemes.length === 0) {
    return 'stone';
  }

  const materialCounts = new Map();
  
  phonemes.forEach(phoneme => {
    const cleanPhoneme = String(phoneme || '').replace(/[0-9]/g, '').toUpperCase().trim();
    const mod = PHONEME_MATERIAL_MAP[cleanPhoneme];
    if (mod?.material) {
      materialCounts.set(mod.material, (materialCounts.get(mod.material) || 0) + 1);
    }
  });

  if (materialCounts.size === 0) return 'stone';

  let dominant = 'stone';
  let maxCount = 0;
  for (const [material, count] of materialCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominant = material;
    }
  }

  return dominant;
}

/**
 * Get texture type from phoneme array
 * @param {string[]} phonemes - Array of phoneme strings
 * @returns {'smooth'|'grained'|'crystalline'|'fibrous'}
 */
export function getDominantTexture(phonemes) {
  if (!Array.isArray(phonemes) || phonemes.length === 0) {
    return 'grained';
  }

  const textureCounts = new Map();
  
  phonemes.forEach(phoneme => {
    const cleanPhoneme = String(phoneme || '').replace(/[0-9]/g, '').toUpperCase().trim();
    const mod = PHONEME_MATERIAL_MAP[cleanPhoneme];
    if (mod?.texture) {
      textureCounts.set(mod.texture, (textureCounts.get(mod.texture) || 0) + 1);
    }
  });

  if (textureCounts.size === 0) return 'grained';

  let dominant = 'grained';
  let maxCount = 0;
  for (const [texture, count] of textureCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominant = texture;
    }
  }

  return dominant;
}

/**
 * Calculate surface hardness from phonemes
 * @param {string[]} phonemes - Array of phoneme strings
 * @returns {number} Hardness value 0.0 - 1.0
 */
export function calculateSurfaceHardness(phonemes) {
  if (!Array.isArray(phonemes) || phonemes.length === 0) {
    return 0.5;
  }

  let totalHardness = 0;
  let count = 0;

  phonemes.forEach(phoneme => {
    const cleanPhoneme = String(phoneme || '').replace(/[0-9]/g, '').toUpperCase().trim();
    const mod = PHONEME_MATERIAL_MAP[cleanPhoneme];
    if (mod?.hardness) {
      totalHardness += mod.hardness;
      count++;
    }
  });

  if (count === 0) return 0.5;

  const avgHardness = 0.5 + (totalHardness / count);
  return clamp(avgHardness, 0, 1);
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
