/**
 * @typedef {import("./phoneme.engine").PhonemeAnalysis} PhonemeAnalysis
 */

import { ARPABET_VOWELS, VOWEL_TO_BASE_FAMILY } from "./phoneme.constants.js";
import { Syllabifier } from "./syllabifier.js";
import { normalizeVowelFamily } from "./vowelFamily.js";

const isBrowser = typeof window !== "undefined";
const WORD_VARIANT_SUFFIX = /\(\d+\)$/;
const CMU_DICT_RELATIVE_PATH = "../../../node_modules/cmudict/lib/cmu/cmudict.0.7a";

function findLastVowelIndex(phones) {
  for (let i = phones.length - 1; i >= 0; i -= 1) {
    const base = phones[i].replace(/[0-9]/g, "");
    if (ARPABET_VOWELS.has(base)) return i;
  }
  return -1;
}

function toAnalysisFromPhones(phones) {
  if (!Array.isArray(phones) || phones.length === 0) return null;

  const phonemes = phones.map((phone) => String(phone).trim()).filter(Boolean);
  if (phonemes.length === 0) return null;

  const syllables = Syllabifier.syllabify(phonemes);
  const safeSyllables = syllables.length > 0 ? syllables : [phonemes];
  const stressedSyllable =
    safeSyllables.find((syllable) =>
      syllable.some((phone) => ARPABET_VOWELS.has(phone.replace(/[0-9]/g, "")) && /[12]$/.test(phone))
    ) || safeSyllables[0];

  const stressedVowel = stressedSyllable.find((phone) => ARPABET_VOWELS.has(phone.replace(/[0-9]/g, "")));
  const stressedBase = stressedVowel ? stressedVowel.replace(/[0-9]/g, "") : "AH";
  const vowelFamily = normalizeVowelFamily(VOWEL_TO_BASE_FAMILY[stressedBase] || stressedBase || "A") || "A";

  const lastSyllable = safeSyllables[safeSyllables.length - 1] || [];
  const lastVowelIndex = findLastVowelIndex(lastSyllable);
  const codaParts =
    lastVowelIndex >= 0
      ? lastSyllable
          .slice(lastVowelIndex + 1)
          .map((phone) => phone.replace(/[0-9]/g, ""))
          .filter(Boolean)
      : [];
  const coda = codaParts.length > 0 ? codaParts.join("") : null;

  return {
    vowelFamily,
    phonemes,
    coda,
    rhymeKey: `${vowelFamily}-${coda || "open"}`,
    syllableCount: safeSyllables.length,
  };
}

function parseCmuDictionary(rawText) {
  const entries = new Map();
  if (!rawText) return entries;

  const lines = String(rawText).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;

    const splitIndex = trimmed.indexOf("  ");
    if (splitIndex <= 0) continue;

    const rawWord = trimmed.slice(0, splitIndex).trim().toUpperCase();
    const phonesRaw = trimmed.slice(splitIndex + 2).trim();
    if (!rawWord || !phonesRaw) continue;

    const word = rawWord.replace(WORD_VARIANT_SUFFIX, "");
    if (!word) continue;

    const phones = phonesRaw.split(/\s+/).map((phone) => phone.trim()).filter(Boolean);
    if (phones.length === 0) continue;

    if (!entries.has(word)) entries.set(word, []);
    entries.get(word).push(phones);
  }

  return entries;
}

/**
 * CMU dictionary lookup and parsing.
 * Browser-safe: no Node APIs are touched unless running server-side.
 */
export const CmuPhonemeEngine = {
  /** @type {Promise<boolean> | null} */
  _initPromise: null,
  /** @type {boolean} */
  _available: false,
  /** @type {Map<string, string[][]>} */
  _entriesByWord: new Map(),
  /** @type {Map<string, PhonemeAnalysis>} */
  _analysisCache: new Map(),

  clearCache() {
    this._analysisCache.clear();
  },

  async init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      if (isBrowser) {
        this._available = false;
        return false;
      }

      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const url = await import("node:url");
        const currentFile = url.fileURLToPath(import.meta.url);
        const dictPath = path.resolve(path.dirname(currentFile), CMU_DICT_RELATIVE_PATH);
        const raw = await fs.readFile(dictPath, "utf8");
        this._entriesByWord = parseCmuDictionary(raw);
        this._analysisCache.clear();
        this._available = this._entriesByWord.size > 0;
      } catch (error) {
        this._entriesByWord.clear();
        this._analysisCache.clear();
        this._available = false;
      }

      return this._available;
    })();

    return this._initPromise;
  },

  isAvailable() {
    return Boolean(this._available && this._entriesByWord.size > 0);
  },

  /**
   * @param {string} word
   * @returns {PhonemeAnalysis | null}
   */
  analyzeWord(word) {
    if (isBrowser) return null;

    if (!this._initPromise) {
      // Fire-and-forget lazy load for Node callsites that skipped explicit init.
      void this.init();
    }

    if (!this.isAvailable()) return null;

    const upper = String(word || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!upper) return null;

    const cached = this._analysisCache.get(upper);
    if (cached) return cached;

    const variants = this._entriesByWord.get(upper);
    if (!Array.isArray(variants) || variants.length === 0) return null;

    const analysis = toAnalysisFromPhones(variants[0]);
    if (!analysis) return null;

    this._analysisCache.set(upper, analysis);
    return analysis;
  },
};
