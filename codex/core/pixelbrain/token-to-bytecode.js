import { normalizeVowelFamily } from '../phonology/vowelFamily.js';
import { SCHOOLS, VOWEL_FAMILY_TO_SCHOOL } from '../constants/schools.js';
import { PhonemeEngine } from '../phonology/phoneme.engine.js';
import { clamp01, createBytecodeString, roundTo } from './shared.js';
import { extractVisualParameters } from '../semantic/visual-extractor.js';
import { getDominantMaterial, getDominantTexture } from '../semantic/phonetic-materials.js';

/**
 * LAYER 1 → LAYER 2 BRIDGE
 * Token-to-Bytecode with Semantic Integration
 * 
 * Converts VerseIR tokens to bytecode strings using:
 * - Phonetic analysis (rarity from phonemes)
 * - Prosodic signals (rhyme, stress, syllable count)
 * - Semantic parameters (from Layer 1 visual extractor)
 */

function countIndexHits(indexMap, key) {
  if (!(indexMap instanceof Map) || key === null || key === undefined) {
    return 0;
  }

  const values = indexMap.get(key);
  return Array.isArray(values) ? values.length : 0;
}

function countMatchingPhonemes(phonemes, targetSet) {
  return (Array.isArray(phonemes) ? phonemes : [])
    .map((phoneme) => String(phoneme || '').replace(/[0-9]/g, '').trim().toUpperCase())
    .filter((phoneme) => targetSet.has(phoneme))
    .length;
}

function normalizeRarity(value) {
  const rarity = String(value || '').trim().toUpperCase();
  if (rarity === 'INEXPLICABLE') return 'INEXPLICABLE';
  if (rarity === 'RARE') return 'RARE';
  return 'COMMON';
}

function normalizeEffect(value) {
  const effect = String(value || '').trim().toUpperCase();
  if (effect === 'TRANSCENDENT') return 'TRANSCENDENT';
  if (effect === 'HARMONIC') return 'HARMONIC';
  if (effect === 'RESONANT') return 'RESONANT';
  return 'INERT';
}

function buildTokenSignal(token, verseIR) {
  const indexes = verseIR?.indexes || {};
  const normalizedStressedFamily = normalizeVowelFamily(token?.primaryStressedVowelFamily || token?.terminalVowelFamily);
  const rhymePeers = Math.max(0, countIndexHits(indexes.tokenIdsByRhymeTail, token?.rhymeTailSignature) - 1);
  const stressedPeers = Math.max(0, countIndexHits(indexes.tokenIdsByStressedVowelFamily, normalizedStressedFamily) - 1);
  const stressPeers = Math.max(0, countIndexHits(indexes.tokenIdsByStressContour, String(token?.stressPattern || '0')) - 1);
  const windowPeers = Math.max(0, countIndexHits(indexes.windowIdsBySyllableLength, Number(token?.syllableCount) || 0) - 1);
  const primaryStress = /1/.test(String(token?.stressPattern || ''));
  const lineEnd = Boolean(token?.flags?.isLineEnd);
  const syllableCount = Number(token?.syllableCount) || 0;

  const anchorWeight = roundTo(clamp01(
    (rhymePeers * 0.36)
    + (stressedPeers * 0.12)
    + (stressPeers * 0.08)
    + (windowPeers * 0.08)
    + ((lineEnd ? 1 : 0) * 0.18)
    + ((primaryStress ? 1 : 0) * 0.08)
    + ((syllableCount >= 3 ? 1 : 0) * 0.1)
  ));

  return Object.freeze({
    rhymePeers,
    stressedPeers,
    stressPeers,
    windowPeers,
    primaryStress,
    lineEnd,
    syllableCount,
    anchorWeight,
    isAnchor: anchorWeight >= 0.42,
  });
}

export function mapVowelFamilyToSchoolId(vowelFamily) {
  const family = normalizeVowelFamily(vowelFamily);
  if (!family) return 'VOID';
  return VOWEL_FAMILY_TO_SCHOOL[family] || 'VOID';
}

export function calculateRarityFromPhonemes(phonemes = [], word = '') {
  // Use the mathematical model from PhonemeEngine
  return PhonemeEngine.calculateRarity(word, phonemes);
}

export function determineEffectFromToken(token, verseIR) {
  if (!token || token?.flags?.isStopWordLike || (Array.isArray(token?.phonemes) ? token.phonemes.length : 0) === 0) {
    return 'INERT';
  }

  const signal = buildTokenSignal(token, verseIR);
  // Prefer the pre-calculated rarity from the token object (VerseIR)
  const rarity = token.rarity || calculateRarityFromPhonemes(token?.phonemes, token?.normalized);

  if ((rarity === 'INEXPLICABLE' || signal.anchorWeight >= 0.68) && signal.syllableCount >= 3) {
    return 'TRANSCENDENT';
  }
  if (signal.syllableCount >= 3 || signal.anchorWeight >= 0.42) {
    return 'HARMONIC';
  }
  if (signal.primaryStress || signal.rhymePeers > 0 || rarity === 'RARE') {
    return 'RESONANT';
  }
  return 'INERT';
}

export function extractColorFeatures(token, components = {}) {
  const schoolId = String(components.schoolId || mapVowelFamilyToSchoolId(
    token?.primaryStressedVowelFamily || token?.terminalVowelFamily || token?.vowelFamily?.[0]
  )).trim().toUpperCase() || 'VOID';
  const school = SCHOOLS[schoolId] || SCHOOLS.VOID || { colorHsl: { h: 0, s: 0, l: 50 } };
  const rarity = normalizeRarity(components.rarity);
  const effect = normalizeEffect(components.effect);

  const raritySaturationBoost = rarity === 'INEXPLICABLE' ? 16 : rarity === 'RARE' ? 8 : 0;
  const effectLightBoost = effect === 'TRANSCENDENT' ? 14 : effect === 'HARMONIC' ? 8 : effect === 'RESONANT' ? 4 : 0;
  const effectPaletteSize = effect === 'TRANSCENDENT' ? 5 : effect === 'HARMONIC' ? 4 : 3;
  const rarityPaletteSize = rarity === 'INEXPLICABLE' ? 5 : rarity === 'RARE' ? 4 : 3;

  return Object.freeze({
    primaryHue: Number(school?.colorHsl?.h) || 0,
    saturation: roundTo(clamp01(((Number(school?.colorHsl?.s) || 50) + raritySaturationBoost) / 100)),
    brightness: roundTo(clamp01(((Number(school?.colorHsl?.l) || 50) + effectLightBoost) / 100)),
    paletteSize: Math.max(effectPaletteSize, rarityPaletteSize),
  });
}

export function semanticToBytecode(semantic = {}) {
  const schoolId = String(semantic.schoolId || semantic.school || 'VOID').trim().toUpperCase() || 'VOID';
  const rarity = normalizeRarity(semantic.rarity);
  const effect = normalizeEffect(semantic.effect);

  return Object.freeze({
    schoolId,
    rarity,
    effect,
    bytecode: createBytecodeString({ schoolId, rarity, effect }),
  });
}

export function buildPixelBrainTokenBytecode(token, verseIR) {
  if (!token || typeof token !== 'object') {
    return null;
  }

  const signal = buildTokenSignal(token, verseIR);
  const schoolId = mapVowelFamilyToSchoolId(
    token?.primaryStressedVowelFamily || token?.terminalVowelFamily || token?.vowelFamily?.[0]
  );
  const rarity = calculateRarityFromPhonemes(token?.phonemes);
  const effect = determineEffectFromToken(token, verseIR);
  const bytecode = createBytecodeString({ schoolId, rarity, effect });
  const colorFeatures = extractColorFeatures(token, { schoolId, rarity, effect });

  return Object.freeze({
    tokenId: Number.isInteger(Number(token?.id)) ? Number(token.id) : -1,
    token: String(token?.normalized || token?.text || '').trim().toLowerCase(),
    lineIndex: Number.isInteger(Number(token?.lineIndex)) ? Number(token.lineIndex) : 0,
    tokenIndexInLine: Number.isInteger(Number(token?.tokenIndexInLine)) ? Number(token.tokenIndexInLine) : 0,
    globalTokenIndex: Number.isInteger(Number(token?.globalTokenIndex)) ? Number(token.globalTokenIndex) : 0,
    syllableDepth: Math.max(0, Number(token?.syllableCount) || 0),
    schoolId,
    rarity,
    effect,
    bytecode,
    isAnchor: signal.isAnchor,
    anchorWeight: signal.anchorWeight,
    colorFeatures,
  });
}

export function tokenToBytecode(token, verseIR) {
  return buildPixelBrainTokenBytecode(token, verseIR)?.bytecode || createBytecodeString();
}

/**
 * Extract semantic parameters and convert to bytecode with Layer 1 integration
 * @param {Object} token - VerseIR token
 * @param {Object} verseIR - Full verse IR object
 * @returns {Object} Token bytecode with semantic parameters
 */
export function buildPixelBrainTokenBytecodeWithSemantics(token, verseIR) {
  if (!token || typeof token !== 'object') {
    return null;
  }

  // Layer 1: Extract semantic parameters
  const semanticParams = extractVisualParameters(token);
  
  // Layer 1 → Layer 2: Get dominant material and texture from phonemes
  const dominantMaterial = getDominantMaterial(token?.phonemes);
  const dominantTexture = getDominantTexture(token?.phonemes);
  
  // Layer 2: Build bytecode from semantic + phonetic analysis
  const signal = buildTokenSignal(token, verseIR);
  const schoolId = mapVowelFamilyToSchoolId(
    token?.primaryStressedVowelFamily || token?.terminalVowelFamily || token?.vowelFamily?.[0]
  );
  const rarity = calculateRarityFromPhonemes(token?.phonemes);
  const effect = determineEffectFromToken(token, verseIR);
  const bytecode = createBytecodeString({ schoolId, rarity, effect });
  
  // Enhanced color features with semantic integration
  const colorFeatures = extractColorFeatures(token, { schoolId, rarity, effect });
  
  return Object.freeze({
    tokenId: Number.isInteger(Number(token?.id)) ? Number(token.id) : -1,
    token: String(token?.normalized || token?.text || '').trim().toLowerCase(),
    lineIndex: Number.isInteger(Number(token?.lineIndex)) ? Number(token.lineIndex) : 0,
    tokenIndexInLine: Number.isInteger(Number(token?.tokenIndexInLine)) ? Number(token.tokenIndexInLine) : 0,
    globalTokenIndex: Number.isInteger(Number(token?.globalTokenIndex)) ? Number(token.globalTokenIndex) : 0,
    syllableDepth: Math.max(0, Number(token?.syllableCount) || 0),
    schoolId,
    rarity,
    effect,
    bytecode,
    isAnchor: signal.isAnchor,
    anchorWeight: signal.anchorWeight,
    colorFeatures,
    // Layer 1 semantic parameters
    semanticParams,
    // Phonetic material mapping
    material: dominantMaterial,
    texture: dominantTexture,
  });
}
