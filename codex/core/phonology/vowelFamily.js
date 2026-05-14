import { FAMILY_IDENTITY } from './vowelWheel.js';

/**
 * Normalizes a vowel-family token into the app's canonical family ids.
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizeVowelFamily(value) {
  const family = String(value || "").trim().toUpperCase();
  if (!family) return "";
  return FAMILY_IDENTITY[family] || family;
}

/**
 * Builds a vowel summary from a list of words.
 * Each word object must have a `vowelFamily` property (optionally nested in a `phonetics` or `analysis` object).
 * @param {Array<object>} words - List of analyzed word objects.
 * @returns {{families: Array<{id: string, count: number, percent: number}>, totalWords: number, uniqueWords: number}}
 */
export function buildVowelSummary(words) {
  if (!Array.isArray(words)) return { families: [], totalWords: 0, uniqueWords: 0 };
  
  const familyCounts = new Map();
  let totalWords = 0;

  for (const word of words) {
    // Check various common word object structures
    const rawFamily = word.vowelFamily || word.phonetics?.vowelFamily || word.analysis?.vowelFamily;
    if (!rawFamily) continue;

    const normalized = normalizeVowelFamily(rawFamily);
    if (!normalized) continue;

    familyCounts.set(normalized, (familyCounts.get(normalized) || 0) + 1);
    totalWords++;
  }

  const families = Array.from(familyCounts.entries())
    .map(([id, count]) => ({
      id,
      count,
      percent: totalWords > 0 ? count / totalWords : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    families,
    totalWords,
    uniqueWords: familyCounts.size,
  };
}
