/**
 * GrimDesign Signal Extractor
 *
 * Derives a GrimSignal from an AnalyzedDocument produced by analyzeText().
 * Selects the dominant non-INERT content word and reads its phonemic character
 * to produce the school palette, effectClass, glowIntensity, syllableDepth, and
 * rarity that drive the decision engine.
 *
 * Pure function — no side effects, no I/O.
 */

import { computeBlendedHsl } from '../shared/truesight/color/pcaChroma.js';
import { VOWEL_FAMILY_TO_SCHOOL } from '../constants/schools.js';

// Mirrors token-to-bytecode.js phoneme sets — must stay in sync.
const RARE_PHONEMES = new Set(['TH', 'DH', 'ZH', 'NG', 'OY']);
const INEXPLICABLE_PHONEMES = new Set(['ZH', 'OY']);

const EFFECT_CLASS_RANK = Object.freeze({
  TRANSCENDENT: 4,
  HARMONIC: 3,
  RESONANT: 2,
  INERT: 1,
});

const DEFAULT_SIGNAL = Object.freeze({
  dominantSchool: 'VOID',
  effectClass: 'INERT',
  glowIntensity: 0,
  blendedHsl: Object.freeze({ h: 174, s: 42, l: 46 }),
  syllableDepth: 1,
  rarity: 'COMMON',
  schoolWeights: Object.freeze({ VOID: 1.0 }),
  vowelFamilyDistribution: Object.freeze({}),
  provenance: Object.freeze(['dominantSchool: VOID (no phonemic content found)',
    'effectClass: INERT (empty intent)',
    'blendedHsl: hsl(174, 42%, 46%) — DEFAULT_SCHOOL_HSL fallback']),
});

// ─── Phoneme helpers ──────────────────────────────────────────────────────────

function normalizePhoneme(raw) {
  return String(raw || '').replace(/[0-9]/g, '').trim().toUpperCase();
}

function computeRarityFromPhonemes(phonemes) {
  const normalized = (Array.isArray(phonemes) ? phonemes : []).map(normalizePhoneme);
  if (normalized.some((p) => INEXPLICABLE_PHONEMES.has(p))) return 'INEXPLICABLE';
  if (normalized.some((p) => RARE_PHONEMES.has(p))) return 'RARE';
  return 'COMMON';
}

// ─── effectClass derivation ───────────────────────────────────────────────────
//
// Simplified from token-to-bytecode.js — without a full VerseIR context (rhyme
// peers, stress peers) we use rarity + syllable count + primary stress as proxies.

function computeEffectClass(rarity, syllableCount, hasPrimaryStress) {
  const syls = Number(syllableCount) || 0;
  if (rarity === "INEXPLICABLE" && syls >= 3) return "TRANSCENDENT";
  if (rarity === "RARE" && syls >= 2) return "HARMONIC";
  if (hasPrimaryStress || rarity === "RARE" || syls >= 4) return "RESONANT";
  if (syls >= 3) return "RESONANT";
  return "INERT";
}

function computeGlowIntensity(effectClass, rarity) {
  switch (effectClass) {
    case "TRANSCENDENT": return rarity === "INEXPLICABLE" ? 0.88 : 0.75;
    case "HARMONIC": return 0.60;
    case "RESONANT": return 0.38;
    default: return 0.0;
  }
}

// ─── Per-word scoring (for dominant word selection) ───────────────────────────
//
// effectClass rank is the primary signal; school affinity of the word's vowel
// family gives a secondary boost; syllable count as tiebreaker.

function scoreWord(effectClass, vowelFamily, schoolWeights, syllableCount) {
  const effectRank = EFFECT_CLASS_RANK[effectClass] || 1;
  const wordSchool = VOWEL_FAMILY_TO_SCHOOL[vowelFamily] || null;
  const schoolBoost = wordSchool ? (schoolWeights[wordSchool] || 0) : 0;
  return effectRank * 10 + schoolBoost * 5 + (Number(syllableCount) || 0);
}

// ─── Provenance builder ───────────────────────────────────────────────────────

function buildProvenance({ dominantSchool, schoolWeights, effectClass, rarity, syllableDepth, glowIntensity, blendedHsl, dominantToken }) {
  const topSchools = Object.entries(schoolWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([s, w]) => `${s}:${(w * 100).toFixed(0)}%`)
    .join(", ");

  return [
    `dominantSchool: ${dominantSchool} (schoolWeights: ${topSchools || "none"})`,
    dominantToken
      ? `effectClass: ${effectClass} (from token "${dominantToken}", glowIntensity: ${glowIntensity.toFixed(2)})`
      : `effectClass: ${effectClass} (no anchor token — intent produced no active phonemic signal)`,
    `blendedHsl: hsl(${blendedHsl.h}, ${blendedHsl.s}%, ${blendedHsl.l}%) — via computeBlendedHsl`,
    `syllableDepth: ${syllableDepth} (dominant anchor syllable count)`,
    `rarity: ${rarity} (mathematically determined via corpus rank)`,
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Alias for extractGrimSignal to maintain compatibility with legacy callers.
 * @param {import('../schemas').AnalyzedDocument} doc
 * @returns {GrimSignal}
 */
export function extractDominantSignal(doc) {
  return extractGrimSignal(doc);
}

/**
 * Extracts the dominant design signal from an AnalyzedDocument.
 *
 * Selects the highest-scoring non-INERT content word and builds a GrimSignal
 * suitable for consumption by decisionEngine.resolveDesignDecisions().
 *
 * @param {import('../schemas').AnalyzedDocument} doc
 * @returns {GrimSignal}
 */
export function extractGrimSignal(doc) {
  const schoolWeights = doc?.schoolWeights || {};
  const vowelFamilyDistribution = doc?.vowelFamilyDistribution || {};

  // If the document has no words or no school signal, return the default.
  if (!doc || !Array.isArray(doc.allWords) || doc.allWords.length === 0) {
    return { ...DEFAULT_SIGNAL };
  }

  const dominantSchool = doc.dominantSchool || "VOID";
  const blendedHsl = computeBlendedHsl(schoolWeights);

  // Scan all content words and find the dominant anchor.
  let dominantWord = null;
  let bestScore = -1;

  for (const word of doc.allWords) {
    if (!word.isContentWord) continue;

    const syllableCount = word.syllableCount || 1;
    const hasPrimaryStress = /1/.test(String(word.stressPattern || ""));
    const vowelFamily = word.phonetics?.vowelFamily || "";

    const rarity = word.rarity || "COMMON";
    const effectClass = computeEffectClass(rarity, syllableCount, hasPrimaryStress);
    if (effectClass === "INERT") continue;

    const score = scoreWord(effectClass, vowelFamily, schoolWeights, syllableCount);
    if (score > bestScore) {
      bestScore = score;
      dominantWord = { word, rarity, effectClass, syllableCount };
    }
  }

  const effectClass = dominantWord?.effectClass || "INERT";
  const rarity = dominantWord?.rarity || "COMMON";

  const syllableDepth = dominantWord
    ? Math.max(1, dominantWord.syllableCount)
    : Math.max(1, Math.round(doc.stats?.avgSyllablesPerWord || 1));
  const glowIntensity = computeGlowIntensity(effectClass, rarity);

  const provenance = buildProvenance({
    dominantSchool,
    schoolWeights,
    effectClass,
    rarity,
    syllableDepth,
    glowIntensity,
    blendedHsl,
    dominantToken: dominantWord?.word?.text || null,
  });

  return {
    dominantSchool,
    effectClass,
    glowIntensity,
    blendedHsl,
    syllableDepth,
    rarity,
    schoolWeights,
    vowelFamilyDistribution,
    provenance,
  };
}

/**
 * @typedef {Object} GrimSignal
 * @property {string} dominantSchool
 * @property {'INERT'|'RESONANT'|'HARMONIC'|'TRANSCENDENT'} effectClass
 * @property {number} glowIntensity      - 0.0–1.0
 * @property {{ h: number, s: number, l: number }} blendedHsl
 * @property {number} syllableDepth      - 1–4
 * @property {'COMMON'|'RARE'|'INEXPLICABLE'} rarity
 * @property {Record<string, number>} schoolWeights
 * @property {Record<string, number>} vowelFamilyDistribution
 * @property {string[]} provenance       - human-readable decision trace
 */
