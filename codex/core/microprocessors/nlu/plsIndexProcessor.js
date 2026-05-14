/**
 * PLS Indexing Microprocessor
 * 
 * Offloads corpus analysis and rhyme index building to a background thread.
 * Ensures the page loads instantly without blocking on heavy linguistic processing.
 */

import { RhymeIndex } from '../../shared/rhymeIndex.js';
import { PhonemeEngine } from '../../phonology/phoneme.engine.js';

/**
 * Build a RhymeIndex from a word list
 * 
 * @param {Object} payload - { wordList }
 * @returns {Promise<Object>} The serialized index data
 */
export async function buildPlsIndex({ wordList }) {
  if (!Array.isArray(wordList)) {
    throw new Error('wordList is required for PLS indexing');
  }

  await PhonemeEngine.ensureInitialized();
  
  const index = new RhymeIndex();
  index.build(wordList, PhonemeEngine);

  // Serialize the maps for transfer
  return {
    rhymeKeyMap: Object.fromEntries(index.rhymeKeyMap),
    vowelFamilyMap: Object.fromEntries(index.vowelFamilyMap),
    allEntries: index.allEntries,
    built: index.built
  };
}
