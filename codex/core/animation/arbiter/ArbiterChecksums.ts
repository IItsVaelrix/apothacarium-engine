/**
 * Arbiter Checksum Registry
 * 
 * Defines deterministic hex codes for every conceivable reason a 
 * linguistic transition or rhyme might fail the Judiciary Tournament.
 */

export const ARBITER_FINGERPRINTS = Object.freeze({
  // 0x1XX: Phonetic Fractures
  NUCLEUS_MISMATCH:     '0x101', // Vowel identity does not match
  STRESS_DISSONANCE:    '0x102', // Rhythmic emphasis is misaligned
  CODA_DECAY:           '0x103', // Consonant tail is too weak or divergent
  PHONEME_VOID:         '0x104', // One or more tokens lack phonetic data

  // 0x2XX: Structural Fractures
  SYNTAX_BLOCK:         '0x201', // Grammar flow is invalid for the current bar
  ROLE_COLLISION:       '0x202', // Function word in a content-only anchor slot
  METER_OVERFLOW:       '0x203', // Candidate exceeds the bar's syllable budget

  // 0x3XX: Policy Fractures
  RHYME_POLICY_SUPPRESS: '0x301', // Current school/policy explicitly forbids this link
  DUPLICATE_IDENTITY:   '0x302', // The "Same Word" failure (identically repeating)
  ORACLE_DISSONANCE:    '0x303', // Oracle mood provides a negative resonance gain
});

export type ArbiterFingerprint = keyof typeof ARBITER_FINGERPRINTS;

/**
 * Returns a specific checksum for a failure reason.
 */
export function getFingerprintChecksum(reason: ArbiterFingerprint): string {
  return ARBITER_FINGERPRINTS[reason] || '0x000';
}
