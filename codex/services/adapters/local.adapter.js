/**
 * Local Dictionary Adapter
 * Wraps the ScholomanceDictionaryAPI to provide a normalized LexicalEntry interface.
 * This is the primary (local-first) adapter in the fallback chain.
 *
 * @see AI_Architecture_V2.md section 3.2
 */

import { DictionaryAdapter } from './dictionary.adapter.js';
import { createEmptyLexicalEntry } from '../../core/schemas.js';

/**
 * Adapter for the local Scholomance dictionary service.
 * Normalizes responses from ScholomanceDictionaryAPI into LexicalEntry format.
 */
export class LocalDictionaryAdapter extends DictionaryAdapter {
  /**
   * @param {import('../../../src/lib/scholomanceDictionary.api.js').ScholomanceDictionaryAPI} api
   */
  constructor(api) {
    super();
    this.api = api;
  }

  /**
   * Checks if this adapter is available (API is enabled).
   * @returns {boolean}
   */
  isAvailable() {
    return !!(this.api && typeof this.api.isEnabled === 'function' && this.api.isEnabled());
  }

  /**
   * Looks up a word and returns a normalized LexicalEntry.
   * @param {string} word - The word to look up.
   * @returns {Promise<import('../../core/schemas').LexicalEntry|null>}
   */
  async lookup(word) {
    if (!this.isAvailable() || !word) {
      return null;
    }

    try {
      const result = await this.api.lookup(word);
      if (!result) {
        return null;
      }

      return this._normalize(word, result);
    } catch (error) {
      console.warn('[LocalDictionaryAdapter] lookup failed:', error);
      return null;
    }
  }

  /**
   * Finds synonyms for a word.
   * @param {string} word - The word to find synonyms for.
   * @returns {Promise<string[]>}
   */
  async synonyms(word) {
    if (!this.isAvailable() || !word) {
      return [];
    }

    try {
      const result = await this.api.lookup(word, { include: ['synonyms'] });
      return result?.synonyms || [];
    } catch (error) {
      console.warn('[LocalDictionaryAdapter] synonyms failed:', error);
      return [];
    }
  }

  /**
   * Finds rhymes for a word.
   * @param {string} word - The word to find rhymes for.
   * @returns {Promise<string[]>}
   */
  async rhymes(word) {
    if (!this.isAvailable() || !word) {
      return [];
    }

    try {
      const result = await this.api.lookup(word, { include: ['rhymes'] });
      return result?.rhymes || [];
    } catch (error) {
      console.warn('[LocalDictionaryAdapter] rhymes failed:', error);
      return [];
    }
  }

  /**
   * Finds related words.
   * @param {string} word - The word to find related words for.
   * @returns {Promise<{ relation: string, words: string[] }[]>}
   */
  async related(word) {
    // Local dictionary doesn't support related words directly
    // Return synonyms as a "similar" relation
    const syns = await this.synonyms(word);
    if (syns.length > 0) {
      return [{ relation: 'similar', words: syns }];
    }
    return [];
  }

  /**
   * Normalizes the ScholomanceDictionaryAPI response to a LexicalEntry.
   * @param {string} word - The original word.
   * @param {Object} result - The API response.
   * @returns {import('../../core/schemas').LexicalEntry}
   * @private
   */
  _normalize(word, result) {
    const entry = createEmptyLexicalEntry(word);

    // Map definition
    if (result.definition) {
      entry.definition = {
        text: result.definition.text || '',
        partOfSpeech: result.definition.partOfSpeech || '',
        source: result.definition.source || 'Scholomance',
      };
      if (result.definition.text) {
        entry.definitions = [result.definition.text];
      }
      if (result.definition.partOfSpeech) {
        entry.pos = [result.definition.partOfSpeech];
      }
    }

    // Map arrays
    entry.synonyms = Array.isArray(result.synonyms) ? result.synonyms : [];
    entry.antonyms = Array.isArray(result.antonyms) ? result.antonyms : [];
    entry.rhymes = Array.isArray(result.rhymes) ? result.rhymes : [];

    // Map lore/mud data
    entry.lore = result.lore || result.mud || undefined;

    // Keep raw for debugging
    entry.raw = result.raw || result;

    return entry;
  }
}

/**
 * Creates a LocalDictionaryAdapter from the ScholomanceDictionaryAPI singleton.
 * @param {Object} scholomanceAPI - The ScholomanceDictionaryAPI object.
 * @returns {LocalDictionaryAdapter}
 */
export function createLocalAdapter(scholomanceAPI) {
  return new LocalDictionaryAdapter(scholomanceAPI);
}
