/**
 * CODEx Phonotactics Validator
 * Implements rule-based validation for English phoneme sequences.
 */

import { SONORITY_HIERARCHY } from './phoneme.constants.js';

/**
 * Validates a sequence of phonemes against English phonotactic constraints.
 */
export const Phonotactics = {
  /**
   * Checks if a sequence of phonemes is a valid English onset.
   * @param {string[]} phonemes - Array of phonemes (without stress markers).
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateOnset(phonemes) {
    if (phonemes.length === 0) return { valid: true };
    
    // Ensure all phonemes are stripped of stress for validation
    const stripped = this.stripStress(phonemes);
    
    if (stripped.length > 3) return { valid: false, reason: 'Onset exceeds 3 consonants' };

    // Forbidden initial phonemes
    if (stripped[0] === 'NG') return { valid: false, reason: 'Onset cannot start with NG' };
    
    // 3-Consonant Rule: If length is 3, first must be /s/, second a voiceless stop, third a liquid/glide.
    if (stripped.length === 3) {
      if (stripped[0] !== 'S') return { valid: false, reason: '3-consonant onset must start with S' };
      if (!['P', 'T', 'K'].includes(stripped[1])) return { valid: false, reason: 'Second consonant in 3-consonant onset must be P, T, or K' };
      if (!['L', 'R', 'W', 'Y'].includes(stripped[2])) return { valid: false, reason: 'Third consonant in 3-consonant onset must be a liquid or glide' };
    }

    // 2-Consonant rules (Simplified)
    if (stripped.length === 2) {
      const [c1, c2] = stripped;
      if (c1 === 'S' && ['P', 'T', 'K', 'M', 'N', 'W', 'Y', 'L'].includes(c2)) return { valid: true };
      if (c1 === 'HH' && !['Y', 'W'].includes(c2)) return { valid: false, reason: 'HH can only be followed by Y or W in onset' };
    }

    // Basic SSP check for onset (handled by Syllabifier usually, but good for validation)
    if (!this.checkSSP(stripped, 'onset')) {
      return { valid: false, reason: 'Onset violates Sonority Sequencing Principle' };
    }

    return { valid: true };
  },

  /**
   * Checks if a sequence of phonemes is a valid English coda.
   * @param {string[]} phonemes - Array of phonemes (without stress markers).
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateCoda(phonemes) {
    if (phonemes.length === 0) return { valid: true };
    const stripped = this.stripStress(phonemes);
    
    if (stripped.length > 4) return { valid: false, reason: 'Coda exceeds 4 consonants' };

    // Forbidden final phonemes
    if (stripped[stripped.length - 1] === 'HH') return { valid: false, reason: 'Coda cannot end with HH' };
    if (stripped[stripped.length - 1] === 'W') return { valid: false, reason: 'Coda cannot end with W' };
    if (stripped[stripped.length - 1] === 'Y') return { valid: false, reason: 'Coda cannot end with Y' };

    return { valid: true };
  },

  /**
   * Validates if a consonant cluster follows the Sonority Sequencing Principle.
   * @param {string[]} phonemes - Stripped phonemes.
   * @param {'onset' | 'coda'} type 
   * @returns {boolean}
   */
  checkSSP(phonemes, type) {
    if (phonemes.length <= 1) return true;

    // Special case for S-clusters in English onsets (SSP violations)
    if (type === 'onset' && phonemes[0] === 'S') {
      return this.checkSSP(phonemes.slice(1), 'onset');
    }

    for (let i = 0; i < phonemes.length - 1; i++) {
      const s1 = SONORITY_HIERARCHY[phonemes[i]] || 0;
      const s2 = SONORITY_HIERARCHY[phonemes[i + 1]] || 0;

      if (type === 'onset') {
        // Onset: Sonority must increase toward nucleus
        if (s1 >= s2) return false;
      } else {
        // Coda: Sonority must decrease away from nucleus
        if (s1 <= s2) return false;
      }
    }
    return true;
  },

  /**
   * Strips stress markers from phonemes for rule checking.
   * @param {string[]} phonemes 
   * @returns {string[]}
   */
  stripStress(phonemes) {
    return phonemes.map(p => p.replace(/[0-9]/g, ''));
  }
};
