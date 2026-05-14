/**
 * Phonetic Color Amplifier — Spec v2
 *
 * CLASSIFICATION: Structural Transformation Amplifier
 * WHY: Generates authoritative VisualBytecode based on a Biophysical Resonance model.
 *      Uses a Travelling-wave Filter Bank (Cochlear Place) manifold to derive
 *      permanent, distinctive hues for phonetic families.
 */

import { createRequire } from 'node:module';
import { normalizeVowelFamily } from '../../../../codex/core/phonology/vowelFamily.js';
import { VOWEL_FAMILY_TO_SCHOOL, SCHOOLS } from '../../constants/schools.js';
import { clamp01, roundTo, createAmplifierResult } from '../shared.js';
import { resolveSonicChroma } from '../../phonology/chroma.resolver.js';

const require = createRequire(import.meta.url);
const biophysicalData = require('../../../../verseir_palette_payload.json');

/**
 * Resolves biophysical color coordinates based on cochlear place metrics.
 * Uses the school's canonical hue directly to produce 8 truly distinct colors.
 * The payload's per-family delta hues (±10° within a school) were indistinguishable
 * variations of a single school color — replaced with the canonical school hue.
 */
function resolveBiophysicalVowelColor(family, nativeSchoolId, vowelData, theme = 'dark') {
  // Use the school's canonical hue — NOT the payload's delta hue.
  const hue = SCHOOLS[nativeSchoolId]?.colorHsl?.h ?? 0;
  const metrics = vowelData.metrics || {};

  const {
    spreadNorm = 0.5,
    sharpnessNorm = 0.5,
  } = metrics;

  // Base saturation: high for learning, but slightly muted for non-resonant words
  const saturation = nativeSchoolId === 'VOID' ? 15 : 85;

  // Base lightness: ensures readability on dark/light backgrounds
  // We use biophysical metrics to slightly vary lightness
  const lightness = theme === 'dark' 
    ? 60 - (spreadNorm * 5) + (sharpnessNorm * 5)
    : 45 + (spreadNorm * 5);

  return { hue, saturation, lightness, nativeSchoolId, metrics };
}

/**
 * Applies contextual resonance (rhyme, anchoring) to the base biophysical color.
 */
function applyContextualResonance(base, { glowIntensity, isAnchor, saturationBoost, hasProximity, theme }) {
  const isHighEnergy = isAnchor || glowIntensity > 0.5 || hasProximity;
  const maxL = theme === 'dark' ? 90 : 25;
  const additionalSat = (isHighEnergy ? 20 : 0) + ((saturationBoost || 0) * 15);
  
  return {
    hue: base.hue,
    // Resonant words get a saturation and lightness boost
    saturation: Math.min(100, base.saturation + additionalSat),
    lightness: theme === 'dark' 
      ? Math.min(maxL, base.lightness + (isAnchor ? 8 : 0))
      : Math.max(maxL, base.lightness - (isAnchor ? 8 : 0)),
    glow: glowIntensity,
  };
}

export const phoneticColorAmplifier = {
  id: 'phonetic_color',
  label: 'Phonetic Spectral Resonance',
  tier: 'COMMON',
  claimedWeight: 0.10,

  route(context = {}) {
    const hasTokens = (context.verseIR?.tokens?.length || 0) > 0;
    return {
      score: hasTokens ? 1.0 : 0,
      shouldRun: hasTokens,
      reason: hasTokens ? 'structural_requirement' : 'no_tokens',
    };
  },

  async analyze(context = {}) {
    const { verseIR, options = {} } = context;
    const tokens = verseIR?.tokens || [];
    const tokenBytecodes = new Map();
    const theme = options.theme || 'dark';
    
    const familyFrequency = new Map();
    const proximityResonance = new Map();

    // 1. Global Analysis for Spectral Hygiene
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const family = normalizeVowelFamily(token.primaryStressedVowelFamily || token.terminalVowelFamily);
      if (!family) continue;

      familyFrequency.set(family, (familyFrequency.get(family) || 0) + 1);
      
      let hasPeer = false;
      const lookback = Math.max(0, i - 3);
      const lookahead = Math.min(tokens.length - 1, i + 3);
      for (let j = lookback; j <= lookahead; j++) {
        if (i === j) continue;
        const peer = tokens[j];
        const peerFamily = normalizeVowelFamily(peer.primaryStressedVowelFamily || peer.terminalVowelFamily);
        if (peerFamily === family) { hasPeer = true; break; }
      }
      proximityResonance.set(token.id, hasPeer);
    }

    const rhymeTailIndex = verseIR?.indexes?.tokenIdsByRhymeTail || new Map();

    for (const token of tokens) {
      const rawFamily = token.primaryStressedVowelFamily || token.terminalVowelFamily;
      const family = normalizeVowelFamily(rawFamily);
      const nativeSchoolId = VOWEL_FAMILY_TO_SCHOOL[family] || 'VOID';
      
      // 2. Resolve Biophysical Identity using the authoritative native school entry
      const schoolData = biophysicalData[nativeSchoolId] || biophysicalData.VOID;
      const vowelData = schoolData[family] || schoolData.AX || { hue: 0, metrics: {} };
      
      const baseColor = resolveBiophysicalVowelColor(family, nativeSchoolId, vowelData, theme);

      // 3. Calculate Resonance (Glow/Saturation)
      const rhymePeers = rhymeTailIndex.get(token.rhymeTailSignature) || [];
      const connectionCount = Math.max(0, rhymePeers.length - 1);
      const connectionSignal = connectionCount > 0 ? clamp01(0.3 + (connectionCount * 0.15)) : 0;
      const isAnchor = connectionCount >= 2;
      const hasProximity = proximityResonance.get(token.id) || false;
      
      // We no longer zero out saturation or color for isolated vowels.
      // We only dampen GLOW to keep the focus on rhymes.
      let glowIntensity = token.flags?.isStopWordLike ? 0 : clamp01(connectionSignal * (isAnchor ? 1.2 : 1.0));
      if (!hasProximity && !isAnchor) glowIntensity *= 0.15; 

      let saturationBoost = token.flags?.isStopWordLike ? 0 : clamp01((token.syllableCount * 0.1) + (isAnchor ? 0.2 : 0));

      // 4. Final Color Synthesis
      const sonic = (Array.isArray(token.phonemes) && token.phonemes.length > 0)
        ? resolveSonicChroma(token.phonemes)
        : null;

      // SCL (Sonic Color Logic) becomes the base if available, otherwise biophysical
      const effectiveBase = sonic 
        ? { hue: sonic.h, saturation: sonic.s, lightness: sonic.l }
        : baseColor;
      
      const final = applyContextualResonance(effectiveBase, { glowIntensity, isAnchor, saturationBoost, hasProximity, theme });
      const color = `hsl(${Math.round(final.hue)}, ${Math.round(final.saturation)}%, ${Math.round(final.lightness)}%)`;

      // 5. Effect Classification
      let effectClass = 'INERT';
      if (!token.flags?.isStopWordLike) {
        if (isAnchor || (token.syllableCount >= 3 && glowIntensity > 0.7)) effectClass = 'TRANSCENDENT';
        else if (token.syllableCount >= 2 || glowIntensity > 0.5) effectClass = 'HARMONIC';
        else if (hasProximity) effectClass = 'RESONANT';
      }

      tokenBytecodes.set(token.id, {
        version: 2,
        school: nativeSchoolId === 'VOID' ? null : nativeSchoolId,
        color,
        glowIntensity: roundTo(glowIntensity),
        saturationBoost: roundTo(saturationBoost),
        syllableDepth: token.syllableCount,
        isAnchor,
        isStopWord: token.flags?.isStopWordLike || false,
        effectClass,
        biophysical: baseColor.metrics,
      });
    }

    return {
      ...createAmplifierResult({
        id: 'phonetic_color',
        label: 'Phonetic Spectral Resonance',
        tier: 'COMMON',
        signal: 1.0,
        commentary: 'Biophysical teaching palette mapping complete.',
      }),
      tokenBytecodes,
    };
  }
};
