/**
 * CODEx Phonetic Similarity Algorithm
 * Granular scoring based on phoneme features and acoustic distance.
 */

const PHONEME_FEATURES = {
  'P':  { manner: 1, place: 1, voiced: false },
  'B':  { manner: 1, place: 1, voiced: true },
  'T':  { manner: 1, place: 4, voiced: false },
  'D':  { manner: 1, place: 4, voiced: true },
  'K':  { manner: 1, place: 7, voiced: false },
  'G':  { manner: 1, place: 7, voiced: true },
  'F':  { manner: 2, place: 2, voiced: false },
  'V':  { manner: 2, place: 2, voiced: true },
  'TH': { manner: 2, place: 3, voiced: false },
  'DH': { manner: 2, place: 3, voiced: true },
  'S':  { manner: 2, place: 4, voiced: false },
  'Z':  { manner: 2, place: 4, voiced: true },
  'SH': { manner: 2, place: 5, voiced: false },
  'ZH': { manner: 2, place: 5, voiced: true },
  'CH': { manner: 3, place: 5, voiced: false },
  'JH': { manner: 3, place: 5, voiced: true },
  'M':  { manner: 4, place: 1, voiced: true },
  'N':  { manner: 4, place: 4, voiced: true },
  'NG': { manner: 4, place: 7, voiced: true },
  'L':  { manner: 5, place: 4, voiced: true },
  'R':  { manner: 5, place: 5, voiced: true },
  'W':  { manner: 6, place: 1, voiced: true },
  'Y':  { manner: 6, place: 6, voiced: true },
  'HH': { manner: 2, place: 8, voiced: false }
};

/**
 * Vowel Similarity Matrix (Acoustic Distance)
 * High values indicate sounds that are easily confused or function as slant rhymes.
 */
const VOWEL_SIMILARITY = {
  'IY': { 'IH': 0.85, 'EY': 0.70 },
  'IH': { 'IY': 0.85, 'EH': 0.75, 'UH': 0.60 },
  'EY': { 'IY': 0.70, 'EH': 0.80, 'AY': 0.75 },
  'EH': { 'AE': 0.95, 'EY': 0.80, 'IH': 0.75, 'AH': 0.65 },
  'AE': { 'EH': 0.95, 'AA': 0.70, 'AH': 0.75 },
  'AA': { 'AO': 0.85, 'AE': 0.70, 'AH': 0.80 },
  'AO': { 'AA': 0.85, 'OW': 0.75, 'UH': 0.65 },
  'OW': { 'AO': 0.75, 'UW': 0.70, 'OY': 0.65 },
  'UH': { 'UW': 0.85, 'AH': 0.80, 'AO': 0.65 },
  'UW': { 'UH': 0.85, 'OW': 0.70 },
  'AH': { 'AA': 0.80, 'AE': 0.75, 'EH': 0.65, 'UH': 0.80 },
  'AY': { 'EY': 0.75, 'AA': 0.60, 'IY': 0.50 },
  'AW': { 'AA': 0.60, 'UW': 0.50 },
  'OY': { 'AO': 0.60, 'IY': 0.50 },
  'ER': { 'AH': 0.70, 'IH': 0.60 }
};

export const PhoneticSimilarity = {
  getPhonemeSimilarity(p1, p2) {
    const b1 = p1.replace(/[0-9]/g, '');
    const b2 = p2.replace(/[0-9]/g, '');
    if (b1 === b2) return 1.0;
    const f1 = PHONEME_FEATURES[b1];
    const f2 = PHONEME_FEATURES[b2];
    if (!f1 || !f2) return 0.0;
    let score = 0;
    if (f1.manner === f2.manner) score += 0.5;
    if (f1.place === f2.place) score += 0.3;
    else if (Math.abs(f1.place - f2.place) <= 1) score += 0.15;
    if (f1.voiced === f2.voiced) score += 0.2;
    return score;
  },

  /**
   * Returns similarity between two vowel phonemes based on the acoustic matrix.
   */
  getVowelSimilarity(v1, v2) {
    const b1 = v1.replace(/[0-9]/g, '');
    const b2 = v2.replace(/[0-9]/g, '');
    if (b1 === b2) return 1.0;
    return VOWEL_SIMILARITY[b1]?.[b2] || VOWEL_SIMILARITY[b2]?.[b1] || 0.0;
  },

  getArraySimilarity(a1, a2) {
    if (a1.join('') === a2.join('')) return 1.0;
    if (a1.length === 0 || a2.length === 0) return 0.0;
    const r1 = [...a1].reverse(), r2 = [...a2].reverse();
    let totalScore = 0;
    const maxLen = Math.max(r1.length, r2.length);
    for (let i = 0; i < Math.min(r1.length, r2.length); i++) {
      totalScore += this.getPhonemeSimilarity(r1[i], r2[i]);
    }
    return totalScore / maxLen;
  }
};
