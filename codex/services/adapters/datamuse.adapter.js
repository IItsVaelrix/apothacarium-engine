/**
 * Datamuse API Adapter
 * Provides word lookup via the free Datamuse API.
 * Used as a fallback when local dictionary is unavailable.
 *
 * API Documentation: https://www.datamuse.com/api/
 *
 * @see AI_Architecture_V2.md section 3.2
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

const DATAMUSE_BASE_URL = 'https://api.datamuse.com';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESULTS = 50;

/**
 * Adapter for the Datamuse API.
 * Free API, no key required. Rate limits are generous.
 */
export class DatamuseAdapter extends DictionaryAdapter {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || DATAMUSE_BASE_URL;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxResults = options.maxResults || MAX_RESULTS;
  }

  /**
   * Datamuse is always available (no auth required).
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Looks up a word and returns a normalized LexicalEntry.
   * Datamuse provides synonyms, rhymes, and related words but not definitions.
   * @param {string} word - The word to look up.
   * @returns {Promise<import('../../core/schemas').LexicalEntry|null>}
   */
  async lookup(word) {
    if (!word) {
      return null;
    }

    try {
      // Fetch synonyms, rhymes, and word info in parallel
      const [synonymsData, rhymesData, wordInfo] = await Promise.all([
        this._fetch(`/words?rel_syn=${encodeURIComponent(word)}&max=${this.maxResults}`),
        this._fetch(`/words?rel_rhy=${encodeURIComponent(word)}&max=${this.maxResults}`),
        this._fetch(`/words?sp=${encodeURIComponent(word)}&md=dp&max=1`), // d=definitions, p=parts of speech
      ]);

      // If we can't find the word at all, return null
      if (!wordInfo || wordInfo.length === 0) {
        return null;
      }

      return this._normalize(word, {
        synonyms: synonymsData,
        rhymes: rhymesData,
        wordInfo: wordInfo[0],
      });
    } catch (error) {
      console.warn('[DatamuseAdapter] lookup failed:', error);
      return null;
    }
  }

  /**
   * Finds synonyms for a word.
   * @param {string} word - The word to find synonyms for.
   * @returns {Promise<string[]>}
   */
  async synonyms(word) {
    if (!word) {
      return [];
    }

    try {
      const data = await this._fetch(`/words?rel_syn=${encodeURIComponent(word)}&max=${this.maxResults}`);
      return this._extractWords(data);
    } catch (error) {
      console.warn('[DatamuseAdapter] synonyms failed:', error);
      return [];
    }
  }

  /**
   * Finds rhymes for a word.
   * @param {string} word - The word to find rhymes for.
   * @returns {Promise<string[]>}
   */
  async rhymes(word) {
    if (!word) {
      return [];
    }

    try {
      const data = await this._fetch(`/words?rel_rhy=${encodeURIComponent(word)}&max=${this.maxResults}`);
      return this._extractWords(data);
    } catch (error) {
      console.warn('[DatamuseAdapter] rhymes failed:', error);
      return [];
    }
  }

  /**
   * Finds related words using various Datamuse relations.
   * @param {string} word - The word to find related words for.
   * @returns {Promise<{ relation: string, words: string[] }[]>}
   */
  async related(word) {
    if (!word) {
      return [];
    }

    try {
      // Fetch different relation types in parallel
      const [triggers, broader, narrower] = await Promise.all([
        this._fetch(`/words?rel_trg=${encodeURIComponent(word)}&max=20`), // Triggers (associated with)
        this._fetch(`/words?rel_bga=${encodeURIComponent(word)}&max=20`), // Broader (hypernyms)
        this._fetch(`/words?rel_bgb=${encodeURIComponent(word)}&max=20`), // Narrower (hyponyms)
      ]);

      const relations = [];

      if (triggers?.length > 0) {
        relations.push({ relation: 'associated', words: this._extractWords(triggers) });
      }
      if (broader?.length > 0) {
        relations.push({ relation: 'broader', words: this._extractWords(broader) });
      }
      if (narrower?.length > 0) {
        relations.push({ relation: 'narrower', words: this._extractWords(narrower) });
      }

      return relations;
    } catch (error) {
      console.warn('[DatamuseAdapter] related failed:', error);
      return [];
    }
  }

  /**
   * Fetches data from the Datamuse API.
   * @param {string} path - API path with query parameters.
   * @returns {Promise<Object[]>}
   * @private
   */
  async _fetch(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BytecodeError(
          ERROR_CATEGORIES.EXT, ERROR_SEVERITY.WARN, MOD,
          ERROR_CODES.EXT_NOT_FOUND,
          { reason: 'Datamuse API error', httpStatus: response.status },
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Extracts word strings from Datamuse response array.
   * @param {Object[]} data - Array of Datamuse word objects.
   * @returns {string[]}
   * @private
   */
  _extractWords(data) {
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((item) => item?.word)
      .filter((w) => typeof w === 'string' && w.length > 0);
  }

  /**
   * Normalizes Datamuse response to a LexicalEntry.
   * @param {string} word - The original word.
   * @param {Object} data - The combined API responses.
   * @returns {import('../../core/schemas').LexicalEntry}
   * @private
   */
  _normalize(word, data) {
    const entry = createEmptyLexicalEntry(word);

    // Datamuse doesn't provide definitions directly, but can provide some metadata
    const info = data.wordInfo || {};

    // Extract definitions if available (from md=d flag)
    if (info.defs && Array.isArray(info.defs)) {
      const defs = info.defs.map((d) => this._parseDefinition(d));
      if (defs.length > 0) {
        entry.definition = defs[0];
        entry.definitions = defs.map((d) => d.text);
        entry.pos = [...new Set(defs.map((d) => d.partOfSpeech).filter(Boolean))];
      }
    }

    // Extract tags for part of speech if not from definitions
    if (entry.pos.length === 0 && info.tags && Array.isArray(info.tags)) {
      const posTags = info.tags.filter((t) => ['n', 'v', 'adj', 'adv'].includes(t));
      entry.pos = posTags.map((t) => DatamuseAdapter._expandPosTag(t));
    }

    // Map arrays
    entry.synonyms = this._extractWords(data.synonyms);
    entry.rhymes = this._extractWords(data.rhymes);

    // Datamuse doesn't provide antonyms directly (would need rel_ant query)
    entry.antonyms = [];

    // Keep raw for debugging
    entry.raw = data;

    return entry;
  }

  /**
   * Parses a Datamuse definition string.
   * Format: "pos\tdef" (e.g., "n\ta type of hat")
   * @param {string} defString - The definition string.
   * @returns {import('../../core/schemas').Definition}
   * @private
   */
  _parseDefinition(defString) {
    if (typeof defString !== 'string') {
      return { text: '', partOfSpeech: '', source: 'Datamuse' };
    }

    const parts = defString.split('\t');
    if (parts.length >= 2) {
      return {
        text: parts.slice(1).join('\t').trim(),
        partOfSpeech: DatamuseAdapter._expandPosTag(parts[0]),
        source: 'Datamuse',
      };
    }

    return {
      text: defString.trim(),
      partOfSpeech: '',
      source: 'Datamuse',
    };
  }

  /**
   * Expands a Datamuse POS tag to a full name.
   * @param {string} tag - The short tag (n, v, adj, adv).
   * @returns {string}
   * @private
   * @static
   */
  static _expandPosTag(tag) {
    const map = {
      n: 'noun',
      v: 'verb',
      adj: 'adjective',
      adv: 'adverb',
    };
    return map[tag] || tag;
  }
}

/**
 * Creates a DatamuseAdapter with default options.
 * @param {Object} [options] - Optional configuration.
 * @returns {DatamuseAdapter}
 */
export function createDatamuseAdapter(options) {
  return new DatamuseAdapter(options);
}
