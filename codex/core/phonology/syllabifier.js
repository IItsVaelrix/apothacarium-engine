/**
 * CODEx Syllabification Engine
 * Implements Maximal Onset Principle and Sonority Sequencing Principle.
 */

import { ARPABET_VOWELS } from './phoneme.constants.js';
import { Phonotactics } from './phonotactics.js';

/**
 * Breaks a sequence of phonemes into syllables.
 */
export const Syllabifier = {
  /**
   * Syllabifies a list of phonemes using the Maximal Onset Principle.
   * @param {string[]} phonemes - ARPAbet phonemes (with or without stress).
   * @returns {string[][]} Array of syllables, each being an array of phonemes.
   */
  syllabify(phonemes) {
    if (!phonemes || phonemes.length === 0) return [];

    const syllables = [];
    const vowelIndices = [];

    // 1. Locate all nuclei (vowels)
    // Note: Phonemes are provided as an array where multi-char codes (e.g. "SH") are single elements.
    for (let i = 0; i < phonemes.length; i++) {
      const base = phonemes[i].replace(/[0-9]/g, '');
      if (ARPABET_VOWELS.has(base)) {
        vowelIndices.push(i);
      }
    }

    if (vowelIndices.length === 0) return [phonemes];

    // 2. Initial segmentation based on vowels
    let lastSplit = 0;
    
    for (let i = 0; i < vowelIndices.length; i++) {
      const isLastVowel = i === vowelIndices.length - 1;
      const currentVowelIdx = vowelIndices[i];
      const nextVowelIdx = isLastVowel ? phonemes.length : vowelIndices[i + 1];

      // Consonants between current vowel and next vowel
      const intervocalic = phonemes.slice(currentVowelIdx + 1, nextVowelIdx);
      
      // Determine split point (where the next onset begins)
      let splitPoint = intervocalic.length; // Default: everything is coda
      
      if (!isLastVowel) {
        // Maximal Onset Principle: Try to give as many consonants as possible to the next syllable
        // We iterate from index 0 to length, checking if the remainder is a valid onset.
        for (let s = 0; s <= intervocalic.length; s++) {
          const potentialOnset = intervocalic.slice(s);
          if (Phonotactics.validateOnset(potentialOnset).valid) {
            splitPoint = s;
            break;
          }
        }
      }

      const syllable = phonemes.slice(lastSplit, currentVowelIdx + 1 + splitPoint);
      syllables.push(syllable);
      lastSplit = currentVowelIdx + 1 + splitPoint;
    }

    return syllables;
  }
};
