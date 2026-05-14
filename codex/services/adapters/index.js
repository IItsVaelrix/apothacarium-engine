/**
 * Adapter Registry
 * Creates the lookup chain: Local Scholomance Dictionary → Datamuse fallback
 *
 * @see AI_Architecture_V2.md section 3.2
 */

import { DatamuseAdapter, createDatamuseAdapter } from './datamuse.adapter.js';
import { LocalDictionaryAdapter, createLocalAdapter } from './local.adapter.js';

/**
 * Creates the adapter chain based on API availability.
 * 
 * Priority order:
 * 1. Local Scholomance Dictionary (if enabled) - Primary, local-first
 * 2. Datamuse - Always available fallback
 * 
 * @param {Object} options
 * @param {Object} [options.scholomanceAPI] - ScholomanceDictionaryAPI instance
 * @returns {import('./dictionary.adapter.js').DictionaryAdapter[]}
 */
export function createAdapterChain({ scholomanceAPI } = {}) {
  const adapters = [];

  // Local adapter first if API is enabled
  if (scholomanceAPI && typeof scholomanceAPI.isEnabled === 'function' && scholomanceAPI.isEnabled()) {
    adapters.push(createLocalAdapter(scholomanceAPI));
  }

  // Datamuse always available as fallback
  adapters.push(createDatamuseAdapter());

  return adapters;
}

/**
 * Creates a default adapter chain using the provided ScholomanceDictionaryAPI.
 * Convenience wrapper when you have the API instance.
 * 
 * @param {Object} scholomanceAPI - ScholomanceDictionaryAPI instance
 * @returns {import('./dictionary.adapter.js').DictionaryAdapter[]}
 */
export function createDefaultAdapterChain(scholomanceAPI) {
  return createAdapterChain({ scholomanceAPI });
}