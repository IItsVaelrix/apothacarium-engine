import { APOTHACARIUM_PRESETS, DEFAULT_PRESET_ID } from './color-apothecary-presets.js';
import {
  clamp01,
  createByteMap,
  hslToHex,
  parseBytecodeString,
  roundTo,
  PALETTE_CONTRACT,
  pseudoRandom,
  hashString,
} from './shared.js';

/**
 * LAYER 2: COLOR-BYTE MAPPING — APOTHACARIUM ADAPTATION
 *
 * Originally resolved palettes via Scholomance SCHOOLS (SONIC, PSYCHIC,
 * ALCHEMY, WILL, VOID) and phoneme-driven chroma. Per PDR §3 Tier 3 +
 * §12 negative constraints, school constants and phonology imports are
 * removed. Palette selection is now preset-driven: a presetId field in
 * the bytecode parses to an apothacarium preset (cosmic-herbal /
 * scholomance-folk / earth-dead) and its anchor HSL seeds the
 * semantic palette generator.
 */

function firstFiniteNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function hexToHsl(hex) {
  const cleaned = String(hex || '').replace('#', '');
  if (!/^[0-9A-F]{6}$/i.test(cleaned)) {
    return { h: 0, s: 0, l: 50 };
  }
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s: s * 100, l: l * 100 };
}

function resolvePresetColor(presetId, colorFeatures = {}) {
  const safeId = String(presetId || DEFAULT_PRESET_ID).trim().toLowerCase();
  const preset = APOTHACARIUM_PRESETS[safeId];

  let baseHsl = { h: hashString(safeId) % 360, s: 50, l: 50 };
  if (preset && Array.isArray(preset.colors)) {
    const idx = (preset.use && Number.isFinite(preset.use.herbs))
      ? preset.use.herbs
      : (preset.colors.length > 1 ? 1 : 0);
    baseHsl = hexToHsl(preset.colors[idx] || preset.colors[0]);
  }

  return Object.freeze({
    hue: Number.isFinite(Number(colorFeatures?.primaryHue))
      ? Number(colorFeatures.primaryHue)
      : baseHsl.h,
    saturation: clamp01(
      Number.isFinite(Number(colorFeatures?.saturation))
        ? Number(colorFeatures.saturation)
        : baseHsl.s / 100
    ),
    brightness: clamp01(
      Number.isFinite(Number(colorFeatures?.brightness))
        ? Number(colorFeatures.brightness)
        : baseHsl.l / 100
    ),
  });
}

// Back-compat alias for any caller that still uses the school name.
const resolveSchoolColor = resolvePresetColor;

/**
 * Primary pure function for semantic palette generation (V12)
 */
export function generateSemanticPalette(params = {}, paletteSizeOverride) {
  const safeParams = params || {};
  const { color = {}, surface = {}, light = {}, form = {} } = safeParams;

  // 1. Resolve Hue (Semantic or Light color)
  let baseHue = firstFiniteNumber(color.primaryHue, safeParams.primaryHue, 0);
  if (light.color) {
    const hex = String(light.color).replace('#', '');
    if (/^[0-9A-F]{6}$/i.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      baseHue = rgbToHue(r, g, b);
    }
  }

  // 2. Resolve Saturation & Brightness
  const reflectivity = firstFiniteNumber(surface.reflectivity, 0);
  const lightIntensity = firstFiniteNumber(light.intensity, 0.5);
  const saturation = clamp01(firstFiniteNumber(
    color.saturation,
    safeParams.saturation,
    0.5 + reflectivity * 0.3
  ));
  const brightness = clamp01(firstFiniteNumber(
    color.brightness,
    safeParams.brightness,
    0.5 * lightIntensity + 0.25
  ));

  // 3. Resolve Size via Contract
  const paletteSize = paletteSizeOverride !== undefined 
    ? Number(paletteSizeOverride) 
    : paletteStepCount(safeParams.rarity, safeParams.effect, form.complexity);

  // 4. Build Colors (Deterministic variation)
  const colors = buildSemanticPaletteColors({
    hue: baseHue,
    saturation,
    brightness,
    paletteSize,
    rarity: safeParams.rarity,
    effect: safeParams.effect,
    material: surface.material,
    texture: surface.texture,
  });

  return Object.freeze({
    primaryHue: roundTo(baseHue, 2),
    saturation: roundTo(saturation),
    brightness: roundTo(brightness),
    paletteSize,
    colors,
    material: surface.material || 'stone',
    texture: surface.texture || 'grained',
    rarity: safeParams.rarity || PALETTE_CONTRACT.TIERS.COMMON,
    effect: safeParams.effect || 'INERT',
  });
}

// Alias for V11 compatibility
export const generatePaletteFromSemantics = generateSemanticPalette;

/**
 * Internal color builder with deterministic pseudo-random variation
 */
function buildSemanticPaletteColors(params) {
  const { 
    hue, saturation, brightness, paletteSize, 
    material, texture, rarity, effect 
  } = params;
  
  const colors = [];
  const materialMods = {
    metal: { satMod: -0.1, briMod: +0.15, hueShift: 0 },
    stone: { satMod: -0.2, briMod: 0, hueShift: 0 },
    organic: { satMod: +0.1, briMod: -0.1, hueShift: 15 },
    energy: { satMod: +0.2, briMod: +0.1, hueShift: -10 },
    crystalline: { satMod: +0.15, briMod: +0.2, hueShift: 20 },
    fabric: { satMod: -0.05, briMod: -0.05, hueShift: 5 },
  };

  const mod = materialMods[material] || materialMods.stone;
  const textureVariation = {
    smooth: 0.05,
    grained: 0.12,
    crystalline: 0.08,
    fibrous: 0.15,
  }[texture] || 0.1;

  const rarityShift = getRarityShift(rarity);
  const effectLift = getEffectLift(effect);
  
  const baseSat = Math.max(0, Math.min(100, (saturation * 100) + effectLift));
  const baseBri = Math.max(18, Math.min(76, (brightness * 100) + effectLift));

  for (let i = 0; i < paletteSize; i++) {
    const ratio = paletteSize === 1 ? 0 : i / (paletteSize - 1);
    const seed = `${hue}-${material}-${texture}-${i}`;
    
    const lightness = Math.max(8, Math.min(92, 
      baseBri - 18 + (ratio * 36) + (mod.briMod * 20)
    ));
    
    const satVariation = (pseudoRandom(seed + '-sat') - 0.5) * textureVariation * 20;
    const saturationVal = Math.max(0, Math.min(100,
      baseSat - 10 + (ratio * 12) + mod.satMod * 20 + satVariation
    ));
    
    const hueVariation = (pseudoRandom(seed + '-hue') - 0.5) * textureVariation * 30;
    const contractHueShift = ((ratio - 0.5) * rarityShift);
    const hueVal = ((hue + mod.hueShift + hueVariation + contractHueShift) % 360 + 360) % 360;

    colors.push(hslToHex(hueVal, saturationVal, lightness));
  }

  return Object.freeze(colors);
}

function rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  switch (max) {
    case r: h = ((g - b) / d) * 60; break;
    case g: h = ((b - r) / d + 2) * 60; break;
    case b: h = ((r - g) / d + 4) * 60; break;
  }
  return ((h % 360) + 360) % 360;
}

function paletteStepCount(rarity, effect, complexity) {
  const tier = String(rarity || '').trim().toUpperCase();
  const eff = String(effect || '').trim().toUpperCase();
  
  if (tier === PALETTE_CONTRACT.TIERS.INEXPLICABLE || eff === PALETTE_CONTRACT.TIERS.TRANSCENDENT) {
    return PALETTE_CONTRACT.SIZES.INEXPLICABLE;
  }
  if (tier === PALETTE_CONTRACT.TIERS.RARE || eff === PALETTE_CONTRACT.TIERS.HARMONIC) {
    return PALETTE_CONTRACT.SIZES.RARE;
  }
  
  if (complexity !== undefined) {
    return Math.max(3, Math.min(6, Math.round(3 + complexity * 3)));
  }
  
  return PALETTE_CONTRACT.SIZES.COMMON;
}

function getRarityShift(rarity) {
  const tier = String(rarity || '').trim().toUpperCase();
  return PALETTE_CONTRACT.SHIFTS[tier] || PALETTE_CONTRACT.SHIFTS.COMMON;
}

function getEffectLift(effect) {
  const eff = String(effect || '').trim().toUpperCase();
  return PALETTE_CONTRACT.LIFT[eff] || PALETTE_CONTRACT.LIFT.INERT;
}

/**
 * Maps bytecode to a consistent palette object.
 * Pure V12 implementation. Array return and manual cleaning purged.
 */
export function bytecodeToPalette(bytecode, options = {}) {
  // If array, return array of PALETTE OBJECTS, not colors. Integrity is sovereign.
  if (Array.isArray(bytecode)) {
    return bytecode.map(bc => bytecodeToPalette(bc, options));
  }

  const parsed = parseBytecodeString(bytecode);
  const baseColor = resolveSchoolColor(parsed.schoolId, options?.colorFeatures);
  
  const palette = generateSemanticPalette({
    primaryHue: baseColor.hue,
    saturation: baseColor.saturation,
    brightness: baseColor.brightness,
    rarity: parsed.rarity,
    effect: parsed.effect,
    form: { complexity: options?.colorFeatures?.complexity }
  }, options?.colorFeatures?.paletteSize);

  return Object.freeze({
    key: String(bytecode || '').trim().toUpperCase(),
    bytecode: String(bytecode || '').trim().toUpperCase(),
    schoolId: parsed.schoolId,
    rarity: parsed.rarity,
    effect: parsed.effect,
    colors: palette.colors,
    byteMap: createByteMap(palette.colors),
  });
}

/**
 * Deterministic "SSD" Block-Aligned addressing
 * Maps bytes to blocks/pages before modulo-snapping to colors.
 */
export function getHexForByte(bytecode, byteIndex, options = {}) {
  const palette = bytecodeToPalette(bytecode, options);
  const colors = palette.colors;
  const numColors = colors.length;
  if (numColors === 0) return '#808080';

  const index = Math.max(0, Math.abs(Math.trunc(Number(byteIndex) || 0)));
  const pageSize = PALETTE_CONTRACT.ADDRESSING.PAGE_SIZE;
  const pageId = Math.floor(index / pageSize);
  const pageOffset = index % pageSize;
  
  const pageJitter = hashString(`page-${pageId}`) % numColors;
  const paletteIndex = (pageOffset + pageJitter) % numColors;
  
  return colors[paletteIndex] || colors[0];
}
