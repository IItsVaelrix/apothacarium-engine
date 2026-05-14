/**
 * CODEx Phoneme Constants
 * Based on ARPAbet and Sonority Sequencing Principle.
 */

/**
 * ARPAbet Vowel set.
 * These are the phonemes that carry stress markers (0, 1, 2).
 */
export const ARPABET_VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW', 'UR'
]);

/**
 * ARPAbet Consonant set.
 */
export const ARPABET_CONSONANTS = new Set([
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH'
]);

/**
 * STUDY1 CANONICAL PHONOLOGICAL FEATURE MATRIX (Table 1)
 * Used for feature-based alignment, sonority derivation, and TurboQuant vectorization.
 * 
 * Vowel Subtypes:
 * - height: 0=low, 1=mid, 2=high
 * - place: 0=front, 1=central, 2=back
 * - contour: 0=rising, 1=flat, 2=falling
 * - length: 0=short, 1=long
 * 
 * Consonant Subtypes:
 * - manner: 0=stop, 1=nasal, 2=fricative, 3=glide, 4=affricate
 * - place: 0=front, 1=center, 2=back
 */
export const PHONOLOGICAL_FEATURES_V1 = Object.freeze({
  // Vowels
  'AA': { height: 0, contour: 1, place: 2, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'AE': { height: 0, contour: 1, place: 1, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'AH': { height: 1, contour: 1, place: 1, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'AO': { height: 1, contour: 1, place: 2, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'AW': { height: 0, contour: 2, place: 1, length: 1, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'AY': { height: 0, contour: 0, place: 1, length: 1, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'EH': { height: 1, contour: 1, place: 0, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'ER': { height: 1, contour: 1, place: 0, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'EY': { height: 1, contour: 1, place: 1, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'IH': { height: 1, contour: 0, place: 0, length: 1, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'IY': { height: 2, contour: 1, place: 0, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'OW': { height: 1, contour: 0, place: 2, length: 1, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'OY': { height: 1, contour: 2, place: 2, length: 1, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'UH': { height: 2, contour: 1, place: 2, length: 0, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },
  'UW': { height: 2, contour: 1, place: 2, length: 1, voicing: 1, nasality: 0, manner: 0, affrication: 0, sibilance: 0, cPlace: 1 },

  // Consonants
  'B':  { nasality: 0, manner: 0, voicing: 1, affrication: 0, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'CH': { nasality: 0, manner: 4, voicing: 0, affrication: 1, sibilance: 1, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'D':  { nasality: 0, manner: 0, voicing: 1, affrication: 0, sibilance: 0, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'DH': { nasality: 0, manner: 2, voicing: 0, affrication: 1, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'F':  { nasality: 0, manner: 2, voicing: 0, affrication: 1, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'G':  { nasality: 0, manner: 0, voicing: 1, affrication: 0, sibilance: 0, place: 2, height: 1, contour: 1, vPlace: 1, length: 0 },
  'HH': { nasality: 0, manner: 2, voicing: 0, affrication: 1, sibilance: 0, place: 2, height: 1, contour: 1, vPlace: 1, length: 0 },
  'JH': { nasality: 0, manner: 4, voicing: 1, affrication: 1, sibilance: 1, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'K':  { nasality: 0, manner: 0, voicing: 0, affrication: 0, sibilance: 0, place: 2, height: 1, contour: 1, vPlace: 1, length: 0 },
  'L':  { nasality: 0, manner: 3, voicing: 1, affrication: 0, sibilance: 0, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'M':  { nasality: 1, manner: 1, voicing: 1, affrication: 0, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'N':  { nasality: 1, manner: 1, voicing: 1, affrication: 0, sibilance: 0, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'NG': { nasality: 1, manner: 1, voicing: 1, affrication: 0, sibilance: 0, place: 2, height: 1, contour: 1, vPlace: 1, length: 0 },
  'P':  { nasality: 0, manner: 0, voicing: 0, affrication: 0, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'R':  { nasality: 0, manner: 3, voicing: 1, affrication: 0, sibilance: 0, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'S':  { nasality: 0, manner: 2, voicing: 0, affrication: 1, sibilance: 1, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'SH': { nasality: 0, manner: 2, voicing: 0, affrication: 1, sibilance: 1, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'T':  { nasality: 0, manner: 0, voicing: 0, affrication: 0, sibilance: 0, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'TH': { nasality: 0, manner: 2, voicing: 1, affrication: 1, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'V':  { nasality: 0, manner: 2, voicing: 1, affrication: 1, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'W':  { nasality: 0, manner: 3, voicing: 1, affrication: 0, sibilance: 0, place: 0, height: 1, contour: 1, vPlace: 1, length: 0 },
  'Y':  { nasality: 0, manner: 3, voicing: 1, affrication: 0, sibilance: 0, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'Z':  { nasality: 0, manner: 2, voicing: 1, affrication: 1, sibilance: 1, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
  'ZH': { nasality: 0, manner: 2, voicing: 1, affrication: 1, sibilance: 1, place: 1, height: 1, contour: 1, vPlace: 1, length: 0 },
});

/**
 * Sonority levels for the Sonority Sequencing Principle (SSP).
 * Higher value = More sonorous.
 */
export const SONORITY_HIERARCHY = {
  // Vowels (Highest)
  'AA': 10, 'AE': 10, 'AH': 10, 'AO': 10, 'AW': 10, 'AY': 10,
  'EH': 10, 'ER': 10, 'EY': 10, 'IH': 10, 'IY': 10, 'OW': 10,
  'OY': 10, 'UH': 10, 'UW': 10, 'UR': 10,

  // Glides
  'W': 9, 'Y': 9,

  // Liquids
  'L': 8, 'R': 8,

  // Nasals
  'M': 7, 'N': 7, 'NG': 7,

  // Fricatives
  'V': 6, 'Z': 6, 'ZH': 6, 'DH': 6,
  'F': 5, 'S': 5, 'SH': 5, 'TH': 5, 'HH': 5,

  // Affricates
  'JH': 4, 'CH': 4,

  // Stops (Lowest)
  'B': 3, 'D': 3, 'G': 3,
  'P': 2, 'T': 2, 'K': 2
};

/**
 * Maps ARPAbet vowels to their base vowel families before normalization.
 * Aligned with src/lib/phonology/vowelFamily.js normalization.
 */
export const VOWEL_TO_BASE_FAMILY = {
  'AA': 'A',
  'AH': 'A',
  'AX': 'A',
  'AW': 'A',
  'AE': 'AE',
  'EH': 'AE',
  'AO': 'AO',
  'OW': 'OW',
  'OY': 'OW',
  'UW': 'UW',
  'UH': 'UW',
  'UR': 'IH',
  'IY': 'IY',
  'IH': 'IH',
  'ER': 'IH',
  'EY': 'EY',
  'AY': 'EY',
};

/**
 * Phonetic pronunciation names for all alphabet characters.
 * Used when letters are parsed as individual tokens.
 */
export const ALPHABET_PHONETIC_MAP = {
  'A': ['EY1'],
  'B': ['B', 'IY1'],
  'C': ['S', 'IY1'],
  'D': ['D', 'IY1'],
  'E': ['IY1'],
  'F': ['EH1', 'F'],
  'G': ['JH', 'IY1'],
  'H': ['EY1', 'CH'],
  'I': ['AY1'],
  'J': ['JH', 'EY1'],
  'K': ['K', 'EY1'],
  'L': ['EH1', 'L'],
  'M': ['EH1', 'M'],
  'N': ['EH1', 'N'],
  'O': ['OW1'],
  'P': ['P', 'IY1'],
  'Q': ['K', 'Y', 'UW1'],
  'R': ['AA1', 'R'],
  'S': ['EH1', 'S'],
  'T': ['T', 'IY1'],
  'U': ['Y', 'UW1'],
  'V': ['V', 'IY1'],
  'W': ['D', 'AH1', 'B', 'AH0', 'L', 'Y', 'UW0'],
  'X': ['EH1', 'K', 'S'],
  'Y': ['W', 'AY1'],
  'Z': ['Z', 'IY1']
};

/**
 * Phoneme mappings for common English digraphs.
 */
export const DIGRAPH_MAP = {
  'TH': ['TH'],
  'PH': ['F'],
  'SH': ['SH'],
  'CH': ['CH'],
  'GH': ['G'],
  'WH': ['W'],
  'QU': ['K', 'W'],
  'NG': ['NG'],
  'CK': ['K'],
  'OY': ['OY'],
};
