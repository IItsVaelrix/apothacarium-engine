/**
 * Sonic Color Logic (SCL) Resolver
 * Translates ARPAbet phoneme sequences into deterministic HSL chroma signatures.
 */

import { getVowelHue } from './vowelWheel.js';

import { ARPABET_VOWELS, PHONOLOGICAL_FEATURES_V1 } from './phoneme.constants.js';

/**
 * Derives sonority/chroma weight from phonological features.
 * Sibilants peak chroma, nasals/liquids dampen, voiced > voiceless.
 */
function getFeatureChromaWeight(phoneme) {
  const base = phoneme.replace(/[0-9]/g, '').toUpperCase();
  const f = PHONOLOGICAL_FEATURES_V1[base];
  if (!f) return 0;

  let weight = 0;
  // Manner: Stops (0) / Affricates (4) > Fricatives (2) > Glides (3) > Nasals (1)
  const mannerWeights = [5, 1, 3, 2, 4];
  weight += mannerWeights[f.manner] || 0;
  
  if (f.voicing) weight += 2;
  if (f.sibilance) weight += 3;
  
  return weight;
}

/**
 * Resolves a ChromaSignature from a phoneme sequence.
 * @param {string[]} phonemes ARPAbet phonemes (e.g. ["L", "AO1", "F", "T"])
 * @returns {{h: number, s: number, l: number, bytecode: string}}
 */
export function resolveSonicChroma(phonemes = []) {
  if (!phonemes || phonemes.length === 0) {
    return { h: 0, s: 0, l: 50, bytecode: 'PB-CHROMA-0000050__' };
  }

  let nucleus = null;
  let stress = 1;
  let nucleusIndex = -1;

  for (let i = 0; i < phonemes.length; i++) {
    const p = phonemes[i];
    const base = p.replace(/[0-2]/g, '').toUpperCase();
    if (ARPABET_VOWELS.has(base)) {
      nucleus = base;
      stress = p.match(/[0-2]/) ? parseInt(p.match(/[0-2]/)[0]) : 1;
      nucleusIndex = i;
      break;
    }
  }

  if (!nucleus) {
    return { h: 180, s: 0, l: 40, bytecode: 'PB-CHROMA-b40028__' };
  }

  // 1. Resolve Base Vowel Color (H/C/L) from PCA/OKLCh
  // For the resolver, we use a simplified version of the logic to avoid circular deps
  const h = getVowelHue(nucleus);

  // 2. Resolve Saturation (S) from Coda Features
  const coda = phonemes.slice(nucleusIndex + 1);
  let totalCodaWeight = 0;
  coda.forEach(p => {
    totalCodaWeight += getFeatureChromaWeight(p);
  });

  // Base saturation 60%, plus feature-derived weight up to 40%
  const s = Math.min(100, 60 + (totalCodaWeight * 4));

  // 3. Resolve Lightness (L) from Stress
  // Per Study1: Stress modulates ±5%
  let l = 55;
  if (stress === 1) l = 60;
  if (stress === 0) l = 50;

  const hueHex = Math.floor(h).toString(16).padStart(3, '0');
  const satHex = Math.floor(s).toString(16).padStart(2, '0');
  const litHex = Math.floor(l).toString(16).padStart(2, '0');
  const bytecode = `PB-CHROMA-${hueHex}${satHex}${litHex}${nucleus}`;

  return { h, s, l, bytecode };
}
