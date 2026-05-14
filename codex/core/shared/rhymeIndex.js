import { normalizeVowelFamily } from '../phonology/vowelFamily.js';

/**
 * RhymeIndex — Pre-computed index mapping rhymeKeys and vowelFamilies to word entries.
 * Built once at corpus load for O(1) lookup during completions.
 */
export class RhymeIndex {
  constructor() {
    this.rhymeKeyMap = new Map();    // rhymeKey → Entry[]
    this.vowelFamilyMap = new Map(); // vowelFamily → Entry[]
    this.allEntries = [];            // flat list for prefix filtering
    this.built = false;
  }

  /**
   * Build the index from a word list using the phoneme engine.
   * @param {string[]} wordList - Corpus words (may contain duplicates for frequency)
   * @param {object} phonemeEngine - PhonemeEngine with analyzeWord()
   */
  build(wordList, phonemeEngine) {
    this.rhymeKeyMap.clear();
    this.vowelFamilyMap.clear();
    this.allEntries = [];

    // Count frequencies from the raw word list
    const freqMap = new Map();
    for (const w of wordList) {
      const upper = String(w || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (!upper || upper.length < 2) continue;
      freqMap.set(upper, (freqMap.get(upper) || 0) + 1);
    }

    // Analyze each unique word and bucket it
    for (const [token, frequency] of freqMap) {
      const analysis = phonemeEngine.analyzeWord(token);
      if (!analysis) continue;

      const vowelFamily = normalizeVowelFamily(analysis.vowelFamily);
      const rhymeKey = analysis.rhymeKey;
      const syllableCount = analysis.syllableCount || 1;

      const entry = { token, vowelFamily, rhymeKey, syllableCount, frequency };
      this.allEntries.push(entry);

      // Bucket by rhymeKey
      if (!this.rhymeKeyMap.has(rhymeKey)) this.rhymeKeyMap.set(rhymeKey, []);
      this.rhymeKeyMap.get(rhymeKey).push(entry);

      // Bucket by vowelFamily
      if (!this.vowelFamilyMap.has(vowelFamily)) this.vowelFamilyMap.set(vowelFamily, []);
      this.vowelFamilyMap.get(vowelFamily).push(entry);
    }

    this.built = true;
  }

  /**
   * Hydrate the index from serialized data (usually from a worker).
   * Enforces structural integrity for Map keys and entry arrays.
   * @param {Object} data - { rhymeKeyMap, vowelFamilyMap, allEntries, built }
   */
  hydrate(data) {
    if (!data) return;

    // Hardened Map reconstruction
    this.rhymeKeyMap = new Map();
    if (data.rhymeKeyMap && typeof data.rhymeKeyMap === 'object') {
      Object.entries(data.rhymeKeyMap).forEach(([key, entries]) => {
        this.rhymeKeyMap.set(String(key), Array.isArray(entries) ? entries : []);
      });
    }

    this.vowelFamilyMap = new Map();
    if (data.vowelFamilyMap && typeof data.vowelFamilyMap === 'object') {
      Object.entries(data.vowelFamilyMap).forEach(([key, entries]) => {
        this.vowelFamilyMap.set(String(key), Array.isArray(entries) ? entries : []);
      });
    }

    this.allEntries = Array.isArray(data.allEntries) ? data.allEntries : [];
    this.built = data.built ?? true;
  }

  /**
   * Get all words sharing the same rhyme key.
   * @param {string} rhymeKey
   * @returns {{ token: string, vowelFamily: string, syllableCount: number, frequency: number }[]}
   */
  getByRhymeKey(rhymeKey) {
    return this.rhymeKeyMap.get(rhymeKey) || [];
  }

  /**
   * Get all words in a given vowel family.
   * @param {string} family - Normalized vowel family
   * @returns {{ token: string, rhymeKey: string, syllableCount: number, frequency: number }[]}
   */
  getByVowelFamily(family) {
    return this.vowelFamilyMap.get(normalizeVowelFamily(family)) || [];
  }

  /**
   * Filter all indexed entries by prefix.
   * @param {string} prefix - Uppercase prefix to match
   * @returns {{ token: string, vowelFamily: string, rhymeKey: string, syllableCount: number, frequency: number }[]}
   */
  getByPrefix(prefix) {
    const upper = String(prefix || '').toUpperCase();
    if (!upper) return this.allEntries;
    return this.allEntries.filter(e => e.token.startsWith(upper));
  }
}
