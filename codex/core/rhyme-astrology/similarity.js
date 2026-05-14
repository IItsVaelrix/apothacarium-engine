import { normalizeVowelFamily } from '../phonology/vowelFamily.js';
import { buildPhoneticSignature, stripStress } from './signatures.js';
import { calculateWeightedRhymeScore, clampUnitInterval } from './scoring.js';

/**
 * @param {string[] | string | import('./types.js').PhoneticSignature | { phonemes?: string[] }} value
 * @returns {import('./types.js').PhoneticSignature}
 */
function resolveSignature(value) {
  if (Array.isArray(value) || typeof value === 'string') {
    return buildPhoneticSignature(value);
  }
  if (Array.isArray(value?.phonemes)) {
    return buildPhoneticSignature(value.phonemes);
  }
  if (Array.isArray(value?.vowelSkeleton) || Array.isArray(value?.consonantSkeleton)) {
    return {
      phonemes: Array.isArray(value?.phonemes) ? value.phonemes : [],
      vowelSkeleton: Array.isArray(value?.vowelSkeleton) ? value.vowelSkeleton : [],
      consonantSkeleton: Array.isArray(value?.consonantSkeleton) ? value.consonantSkeleton : [],
      endingSignature: String(value?.endingSignature || ''),
      onsetSignature: String(value?.onsetSignature || ''),
      stressPattern: String(value?.stressPattern || ''),
      syllableCount: Number.isFinite(Number(value?.syllableCount)) ? Number(value?.syllableCount) : 0,
    };
  }
  return buildPhoneticSignature([]);
}

/**
 * @param {string[]} first
 * @param {string[]} second
 * @returns {number}
 */
function overlapCoefficient(first, second) {
  const setA = new Set(first.filter(Boolean));
  const setB = new Set(second.filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const value of setA) {
    if (setB.has(value)) shared += 1;
  }
  return shared / Math.min(setA.size, setB.size);
}

/**
 * @param {string[]} first
 * @param {string[]} second
 * @returns {number}
 */
function commonSuffixRatio(first, second) {
  const maxLength = Math.max(first.length, second.length);
  if (maxLength === 0) return 0;
  const minLength = Math.min(first.length, second.length);
  let count = 0;
  while (
    count < minLength &&
    first[first.length - 1 - count] === second[second.length - 1 - count]
  ) {
    count += 1;
  }
  return count / maxLength;
}

/**
 * @param {string[]} first
 * @param {string[]} second
 * @returns {number}
 */
function commonPrefixRatio(first, second) {
  const maxLength = Math.max(first.length, second.length);
  if (maxLength === 0) return 0;
  const minLength = Math.min(first.length, second.length);
  let count = 0;
  while (count < minLength && first[count] === second[count]) {
    count += 1;
  }
  return count / maxLength;
}

/**
 * @param {string} endingSignature
 * @returns {{ nucleus: string, coda: string[] }}
 */
function parseEndingSignature(endingSignature) {
  const parts = String(endingSignature || '')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { nucleus: '', coda: [] };
  }

  const [nucleus, ...rawCoda] = parts;
  const coda = rawCoda
    .map(stripStress)
    .map((part) => part.toUpperCase())
    .filter((part) => part && part !== 'OPEN');

  return { nucleus, coda };
}

/**
 * @param {import('./types.js').PhoneticSignature} first
 * @param {import('./types.js').PhoneticSignature} second
 * @returns {number}
 */
function scoreExactEnding(first, second) {
  if (!first.endingSignature || !second.endingSignature) return 0;
  return first.endingSignature === second.endingSignature ? 1 : 0;
}

/**
 * @param {import('./types.js').PhoneticSignature} first
 * @param {import('./types.js').PhoneticSignature} second
 * @param {number} exactScore
 * @returns {number}
 */
function scoreSlantEnding(first, second, exactScore) {
  if (exactScore >= 1) return 1;
  const endingA = parseEndingSignature(first.endingSignature);
  const endingB = parseEndingSignature(second.endingSignature);
  const sharedNucleus = endingA.nucleus && endingB.nucleus
    ? normalizeVowelFamily(stripStress(endingA.nucleus)) === normalizeVowelFamily(stripStress(endingB.nucleus))
    : false;
  const codaSimilarity = overlapCoefficient(endingA.coda, endingB.coda);
  const openModifier = endingA.coda.length === 0 || endingB.coda.length === 0 ? 0.9 : 1;
  return clampUnitInterval(((sharedNucleus ? 0.6 : 0) + (codaSimilarity * 0.4)) * openModifier);
}

/**
 * @param {import('./types.js').PhoneticSignature} first
 * @param {import('./types.js').PhoneticSignature} second
 * @returns {number}
 */
function scoreVowelMatch(first, second) {
  const vowelsA = first.vowelSkeleton.map((token) => normalizeVowelFamily(stripStress(token)));
  const vowelsB = second.vowelSkeleton.map((token) => normalizeVowelFamily(stripStress(token)));
  if (vowelsA.length === 0 || vowelsB.length === 0) return 0;
  return clampUnitInterval(
    (commonSuffixRatio(vowelsA, vowelsB) * 0.7) +
    (overlapCoefficient(vowelsA, vowelsB) * 0.3)
  );
}

/**
 * @param {import('./types.js').PhoneticSignature} first
 * @param {import('./types.js').PhoneticSignature} second
 * @returns {number}
 */
function scoreConsonantMatch(first, second) {
  const consonantsA = first.consonantSkeleton.map((token) => token.toUpperCase());
  const consonantsB = second.consonantSkeleton.map((token) => token.toUpperCase());
  if (consonantsA.length === 0 || consonantsB.length === 0) return 0;
  return clampUnitInterval(
    (commonSuffixRatio(consonantsA, consonantsB) * 0.65) +
    (commonPrefixRatio(consonantsA, consonantsB) * 0.15) +
    (overlapCoefficient(consonantsA, consonantsB) * 0.2)
  );
}

/**
 * @param {string} patternA
 * @param {string} patternB
 * @returns {number}
 */
function scoreStressAlignment(patternA, patternB) {
  const first = String(patternA || '');
  const second = String(patternB || '');
  if (!first || !second) return 0;
  if (first === second) return 1;

  const maxLength = Math.max(first.length, second.length);
  const minLength = Math.min(first.length, second.length);
  let positionalMatches = 0;
  for (let index = 0; index < minLength; index += 1) {
    if (first[index] === second[index]) positionalMatches += 1;
  }

  let suffixMatches = 0;
  while (
    suffixMatches < minLength &&
    first[first.length - 1 - suffixMatches] === second[second.length - 1 - suffixMatches]
  ) {
    suffixMatches += 1;
  }

  return clampUnitInterval(
    ((positionalMatches / maxLength) * 0.35) +
    ((suffixMatches / maxLength) * 0.65)
  );
}

/**
 * @param {import('./types.js').PhoneticSignature} first
 * @param {import('./types.js').PhoneticSignature} second
 * @returns {number}
 */
function scoreSyllableDeltaPenalty(first, second) {
  const countA = Number(first.syllableCount) || 0;
  const countB = Number(second.syllableCount) || 0;
  const baseline = Math.max(1, countA, countB);
  return clampUnitInterval(Math.abs(countA - countB) / baseline);
}

/**
 * @param {import('./types.js').PhoneticSignature} first
 * @param {import('./types.js').PhoneticSignature} second
 * @param {{
 *   exactRhymeScore: number,
 *   slantRhymeScore: number,
 *   vowelMatchScore: number,
 *   consonantMatchScore: number,
 *   stressAlignmentScore: number,
 *   syllableDeltaPenalty: number,
 * }} dimensions
 * @returns {string[]}
 */
function buildReasons(first, second, dimensions) {
  const reasons = [];
  const firstEnding = parseEndingSignature(first.endingSignature);
  const secondEnding = parseEndingSignature(second.endingSignature);
  const sharedNucleus = firstEnding.nucleus && secondEnding.nucleus
    ? normalizeVowelFamily(stripStress(firstEnding.nucleus)) === normalizeVowelFamily(stripStress(secondEnding.nucleus))
    : false;

  if (dimensions.exactRhymeScore >= 1) {
    reasons.push(`matching ending signature ${first.endingSignature}`);
  } else if (dimensions.slantRhymeScore >= 0.65) {
    reasons.push('compatible ending consonant tail');
  }

  if (sharedNucleus) {
    reasons.push(`shared stressed vowel ${firstEnding.nucleus}`);
  } else if (dimensions.vowelMatchScore >= 0.65) {
    reasons.push('aligned vowel flow');
  }

  if (dimensions.consonantMatchScore >= 0.7) {
    reasons.push('matching consonant skeleton');
  }

  if (dimensions.stressAlignmentScore >= 0.8) {
    reasons.push('aligned stress pattern');
  }

  if (dimensions.syllableDeltaPenalty === 0) {
    reasons.push('same syllable count');
  } else if (dimensions.syllableDeltaPenalty <= 0.34) {
    reasons.push('near syllable count');
  }

  return reasons.length > 0 ? reasons : ['weak phonetic affinity'];
}

/**
 * Scores similarity between two lexicon nodes/signatures.
 * @param {import('./types.js').LexiconNode | import('./types.js').PhoneticSignature | string[] | string} first
 * @param {import('./types.js').LexiconNode | import('./types.js').PhoneticSignature | string[] | string} second
 * @param {Partial<{
 *   exact: number,
 *   slant: number,
 *   vowel: number,
 *   consonant: number,
 *   stress: number,
 *   syllablePenalty: number,
 * }>} [weights]
 * @returns {import('./types.js').SimilarityEdge}
 */
export function scoreNodeSimilarity(first, second, weights) {
  const signatureA = resolveSignature(first);
  const signatureB = resolveSignature(second);

  const exactRhymeScore = scoreExactEnding(signatureA, signatureB);
  const slantRhymeScore = scoreSlantEnding(signatureA, signatureB, exactRhymeScore);
  const vowelMatchScore = scoreVowelMatch(signatureA, signatureB);
  const consonantMatchScore = scoreConsonantMatch(signatureA, signatureB);
  const stressAlignmentScore = scoreStressAlignment(signatureA.stressPattern, signatureB.stressPattern);
  const syllableDeltaPenalty = scoreSyllableDeltaPenalty(signatureA, signatureB);

  const dimensions = {
    exactRhymeScore,
    slantRhymeScore,
    vowelMatchScore,
    consonantMatchScore,
    stressAlignmentScore,
    syllableDeltaPenalty,
  };

  return {
    fromId: String(first?.id || ''),
    toId: String(second?.id || ''),
    ...dimensions,
    overallScore: calculateWeightedRhymeScore(dimensions, weights),
    reasons: buildReasons(signatureA, signatureB, dimensions),
  };
}
