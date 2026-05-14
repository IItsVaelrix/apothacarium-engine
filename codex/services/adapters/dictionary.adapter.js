/**
 * Abstract base class for all dictionary adapters.
 * Defines the interface that all dictionary sources must implement.
 *
 * @see AI_Architecture_V2.md section 3.2
 */
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;

export class DictionaryAdapter {
  /**
   * Looks up a word and returns a normalized lexical entry.
   * @param {string} word The word to look up.
   * @returns {Promise<import('../../core/schemas').LexicalEntry|null>} A promise that resolves to a LexicalEntry or null if not found.
   */
  async lookup(_word) {
    throw new BytecodeError(
      ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.LIFECYCLE_VIOLATION,
      { reason: 'DictionaryAdapter.lookup() must be implemented by subclasses' },
    );
  }

  /**
   * Finds synonyms for a given word.
   * @param {string} word The word to find synonyms for.
   * @returns {Promise<string[]>} A promise that resolves to an array of synonyms.
   */
  async synonyms(_word) {
    throw new BytecodeError(
      ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.LIFECYCLE_VIOLATION,
      { reason: 'DictionaryAdapter.synonyms() must be implemented by subclasses' },
    );
  }

  /**
   * Finds rhymes for a given word.
   * @param {string} word The word to find rhymes for.
   * @returns {Promise<string[]>} A promise that resolves to an array of rhyming words.
   */
  async rhymes(_word) {
    throw new BytecodeError(
      ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.LIFECYCLE_VIOLATION,
      { reason: 'DictionaryAdapter.rhymes() must be implemented by subclasses' },
    );
  }

  /**
   * Finds related words (e.g., hypernyms, hyponyms).
   * @param {string} word The word to find related words for.
   * @returns {Promise<{ relation: string, words: string[] }[]>} A promise that resolves to an array of related word groups.
   */
  async related(_word) {
    throw new BytecodeError(
      ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.LIFECYCLE_VIOLATION,
      { reason: 'DictionaryAdapter.related() must be implemented by subclasses' },
    );
  }
}
