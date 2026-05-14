import { ARPABET_VOWELS } from '../phonology/phoneme.constants.js';
import { normalizeVowelFamily } from '../phonology/vowelFamily.js';

const STRESS_DIGIT_REGEX = /([0-2])/;

/**
 * @param {string} phoneme
 * @returns {string}
 */
function normalizePhonemeToken(phoneme) {
  return String(phoneme || '').trim().toUpperCase();
}

/**
 * @param {string | null | undefined} phoneme
 * @returns {string}
 */
export function stripStress(phoneme) {
  return normalizePhonemeToken(phoneme).replace(/[0-9]/g, '');
}

/**
 * @param {string | null | undefined} phoneme
 * @returns {boolean}
 */
export function isVowelPhoneme(phoneme) {
  return ARPABET_VOWELS.has(stripStress(phoneme));
}

/**
 * @param {string | null | undefined} phoneme
 * @returns {string}
 */
function stressDigitOf(phoneme) {
  const match = normalizePhonemeToken(phoneme).match(STRESS_DIGIT_REGEX);
  return match ? match[1] : '0';
}

/**
 * @param {string[] | string | null | undefined} phonemeInput
 * @returns {string[]}
 */
function toPhonemeArray(phonemeInput) {
  if (Array.isArray(phonemeInput)) {
    return phonemeInput.map(normalizePhonemeToken).filter(Boolean);
  }
  if (typeof phonemeInput === 'string') {
    return phonemeInput
      .split(/\s+/g)
      .map(normalizePhonemeToken)
      .filter(Boolean);
  }
  return [];
}

/**
 * @param {string[]} phonemes
 * @returns {number}
 */
function findLastVowelIndex(phonemes) {
  for (let index = phonemes.length - 1; index >= 0; index -= 1) {
    if (isVowelPhoneme(phonemes[index])) return index;
  }
  return -1;
}

/**
 * @param {string[]} phonemes
 * @returns {number}
 */
function findFirstVowelIndex(phonemes) {
  for (let index = 0; index < phonemes.length; index += 1) {
    if (isVowelPhoneme(phonemes[index])) return index;
  }
  return -1;
}

/**
 * @param {string[]} phonemes
 * @returns {string}
 */
function buildEndingSignature(phonemes) {
  if (phonemes.length === 0) return '';

  const lastVowelIndex = findLastVowelIndex(phonemes);
  if (lastVowelIndex < 0) {
    return phonemes
      .slice(-2)
      .map(stripStress)
      .filter(Boolean)
      .join('-');
  }

  const nucleus = phonemes[lastVowelIndex];
  const coda = phonemes
    .slice(lastVowelIndex + 1)
    .map(stripStress)
    .filter(Boolean);

  return coda.length > 0 ? `${nucleus}-${coda.join('-')}` : `${nucleus}-open`;
}

/**
 * @param {string[]} phonemes
 * @returns {string}
 */
function buildOnsetSignature(phonemes) {
  if (phonemes.length === 0) return '';
  const firstVowelIndex = findFirstVowelIndex(phonemes);
  const onset = firstVowelIndex < 0
    ? phonemes
    : phonemes.slice(0, firstVowelIndex);
  return onset.map(stripStress).filter(Boolean).join('-');
}

/**
 * Builds deterministic signature fields for a phoneme sequence.
 * @param {string[] | string | null | undefined} phonemeInput
 * @returns {import('./types.js').PhoneticSignature}
 */
export function buildPhoneticSignature(phonemeInput) {
  const phonemes = toPhonemeArray(phonemeInput);
  const vowelSkeleton = phonemes.filter(isVowelPhoneme);
  const consonantSkeleton = phonemes
    .filter((phoneme) => !isVowelPhoneme(phoneme))
    .map(stripStress)
    .filter(Boolean);

  return {
    phonemes,
    vowelSkeleton,
    consonantSkeleton,
    endingSignature: buildEndingSignature(phonemes),
    onsetSignature: buildOnsetSignature(phonemes),
    stressPattern: vowelSkeleton.map(stressDigitOf).join(''),
    syllableCount: vowelSkeleton.length,
  };
}

/**
 * Returns the canonical dominant vowel family for a signature.
 * Primary stress is preferred; fallback is final vowel.
 * @param {import('./types.js').PhoneticSignature | null | undefined} signature
 * @returns {string}
 */
export function getDominantVowelFamily(signature) {
  if (!Array.isArray(signature?.vowelSkeleton) || signature.vowelSkeleton.length === 0) {
    return '';
  }

  let pivot = '';
  for (let index = signature.vowelSkeleton.length - 1; index >= 0; index -= 1) {
    const current = signature.vowelSkeleton[index];
    if (Number(stressDigitOf(current)) > 0) {
      pivot = current;
      break;
    }
  }

  if (!pivot) pivot = signature.vowelSkeleton[signature.vowelSkeleton.length - 1];
  return normalizeVowelFamily(stripStress(pivot));
}
