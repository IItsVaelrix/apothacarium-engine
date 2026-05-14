/**
 * Free Dictionary API Adapter
 * Provides word definitions via the free, open-source dictionaryapi.dev.
 * No API key required. Returns proper definitions, phonetics, and parts of speech.
 *
 * API Source: https://dictionaryapi.dev/
 */

import { DictionaryAdapter } from './dictionary.adapter.js';
import { createEmptyLexicalEntry } from '../../core/schemas.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;

const FREE_DICT_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DEFAULT_TIMEOUT_MS = 5000;

export class FreeDictionaryAdapter extends DictionaryAdapter {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || FREE_DICT_BASE_URL;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  isAvailable() {
    return true;
  }

  async lookup(word) {
    if (!word) return null;

    try {
      const data = await this._fetch(word);
      if (!data || !Array.isArray(data) || data.length === 0) return null;
      return this._normalize(word, data[0]);
    } catch (error) {
      console.warn('[FreeDictionaryAdapter] lookup failed:', error.message);
      return null;
    }
  }

  async synonyms(word) {
    if (!word) return [];
    try {
      const data = await this._fetch(word);
      if (!data?.[0]) return [];
      return this._extractSynonyms(data[0]);
    } catch {
      return [];
    }
  }

  async rhymes(_word) {
    // Free Dictionary API doesn't provide rhymes
    return [];
  }

  async related(_word) {
    // Free Dictionary API doesn't provide related word groupings
    return [];
  }

  async _fetch(word) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/${encodeURIComponent(word)}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new BytecodeError(
          ERROR_CATEGORIES.EXT, ERROR_SEVERITY.WARN, MOD,
          ERROR_CODES.EXT_NOT_FOUND,
          { reason: 'Free Dictionary API error', httpStatus: response.status },
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  _normalize(word, data) {
    const entry = createEmptyLexicalEntry(word);

    // Extract definitions from all meanings
    const allDefs = [];
    const allPos = new Set();
    const allSynonyms = new Set();
    const allAntonyms = new Set();

    if (Array.isArray(data.meanings)) {
      for (const meaning of data.meanings) {
        const pos = meaning.partOfSpeech || '';
        if (pos) allPos.add(pos);

        if (Array.isArray(meaning.definitions)) {
          for (const def of meaning.definitions) {
            if (def.definition) {
              allDefs.push({
                text: def.definition,
                partOfSpeech: pos,
                source: 'Free Dictionary API',
              });
            }
            if (Array.isArray(def.synonyms)) {
              def.synonyms.forEach((s) => allSynonyms.add(s));
            }
            if (Array.isArray(def.antonyms)) {
              def.antonyms.forEach((a) => allAntonyms.add(a));
            }
          }
        }

        // Top-level synonyms/antonyms on the meaning
        if (Array.isArray(meaning.synonyms)) {
          meaning.synonyms.forEach((s) => allSynonyms.add(s));
        }
        if (Array.isArray(meaning.antonyms)) {
          meaning.antonyms.forEach((a) => allAntonyms.add(a));
        }
      }
    }

    if (allDefs.length > 0) {
      entry.definition = allDefs[0];
      entry.definitions = allDefs.map((d) => d.text);
    }

    entry.pos = [...allPos];
    entry.synonyms = [...allSynonyms];
    entry.antonyms = [...allAntonyms];

    // Extract IPA from phonetics
    if (Array.isArray(data.phonetics)) {
      const withText = data.phonetics.find((p) => p.text);
      if (withText) {
        entry.ipa = withText.text;
      }
    }

    entry.raw = data;
    return entry;
  }

  _extractSynonyms(data) {
    const synonyms = new Set();
    if (Array.isArray(data.meanings)) {
      for (const meaning of data.meanings) {
        if (Array.isArray(meaning.synonyms)) {
          meaning.synonyms.forEach((s) => synonyms.add(s));
        }
        if (Array.isArray(meaning.definitions)) {
          for (const def of meaning.definitions) {
            if (Array.isArray(def.synonyms)) {
              def.synonyms.forEach((s) => synonyms.add(s));
            }
          }
        }
      }
    }
    return [...synonyms];
  }
}

export function createFreeDictionaryAdapter(options) {
  return new FreeDictionaryAdapter(options);
}
