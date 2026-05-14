/**
 * Word Lookup Pipeline
 * Orchestrates word lookups through cache, rate limiting, and the adapter chain.
 *
 * Event Flow:
 * 1. UI emits 'ui:word_lookup_requested' with { word, responseEvent }
 * 2. Pipeline checks cache for existing result
 * 3. If not cached, checks rate limit
 * 4. Calls adapters in fallback order
 * 5. Caches result and emits response event
 *
 * @see AI_Architecture_V2.md section 2.1 and 5.2
 */

import { on, emit } from './eventBus.js';
import { getFromCache, setInCache, clearCache } from './cache.js';
import { isActionAllowed } from './rateLimit.js';
import { mergeLexicalEntries } from '../core/schemas.js';

// Constants
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (persisted to IndexedDB)
// 10ms per-word cooldown — effectively unlimited since the 24hr cache handles
// repeat lookups. Only prevents the same word being fired multiple times in
// a single render cycle.
const RATE_LIMIT_MS = 10;
const CACHE_PREFIX = 'lexical:';

// Event names
export const EVENTS = {
  REQUEST: 'ui:word_lookup_requested',
  RESPONSE: 'runtime:word_lookup_result',
  ERROR: 'runtime:word_lookup_error',
};

/**
 * Normalizes a word for cache key generation.
 * @param {string} word - The word to normalize.
 * @returns {string}
 */
function normalizeWord(word) {
  return String(word || '').trim().toLowerCase();
}

/**
 * Creates a cache key for a word.
 * @param {string} word - The word.
 * @returns {string}
 */
function getCacheKey(word) {
  return `${CACHE_PREFIX}${normalizeWord(word)}`;
}

/**
 * Sets up the word lookup pipeline.
 * Listens for lookup requests and orchestrates the response.
 *
 * @param {import('../services/adapters/dictionary.adapter.js').DictionaryAdapter[]} adapters - The adapter chain.
 * @returns {function(): void} Unsubscribe function.
 */
export function setupWordLookupPipeline(adapters) {
  return on(EVENTS.REQUEST, async (payload) => {
    const { word, responseEvent, requestId } = payload;
    const effectiveResponseEvent = responseEvent || EVENTS.RESPONSE;
    const normalizedWord = normalizeWord(word);

    if (!normalizedWord) {
      emit(`${effectiveResponseEvent}:error`, {
        word,
        requestId,
        error: 'Empty word',
        code: 'EMPTY_WORD',
      });
      return;
    }

    // 1. Check cache
    const cacheKey = getCacheKey(word);
    const cached = getFromCache(cacheKey);
    if (cached) {
      emit(effectiveResponseEvent, {
        word: normalizedWord,
        requestId,
        data: cached,
        source: 'cache',
      });
      return;
    }

    // 2. Check rate limit — keyed per-word so concurrent lookups of different
    //    words never block each other; only rapid re-requests of the same word are throttled.
    if (!isActionAllowed(`word_lookup:${normalizedWord}`, RATE_LIMIT_MS)) {
      emit(`${effectiveResponseEvent}:error`, {
        word: normalizedWord,
        requestId,
        error: 'Rate limited. Please slow down.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    // 3. Try adapters in sequence, merging results so each adapter can fill gaps
    let result = null;
    let sourceAdapter = null;

    for (const adapter of adapters) {
      // Skip unavailable adapters
      if (typeof adapter.isAvailable === 'function' && !adapter.isAvailable()) {
        continue;
      }

      try {
        const lookupResult = await adapter.lookup(normalizedWord);
        if (lookupResult) {
          if (!result) {
            result = lookupResult;
            sourceAdapter = adapter.constructor.name;
          } else {
            // Merge: keep existing values, fill in gaps from this adapter
            result = mergeLexicalEntries(result, {
              word: result.word,
              definition: result.definition ?? lookupResult.definition,
              definitions: result.definitions?.length ? result.definitions : lookupResult.definitions,
              pos: result.pos?.length ? result.pos : lookupResult.pos,
              synonyms: result.synonyms?.length ? result.synonyms : lookupResult.synonyms,
              antonyms: result.antonyms?.length ? result.antonyms : lookupResult.antonyms,
              rhymes: result.rhymes?.length ? result.rhymes : lookupResult.rhymes,
              etymology: result.etymology ?? lookupResult.etymology,
              pronunciation: result.pronunciation ?? lookupResult.pronunciation,
            });
            sourceAdapter += `+${adapter.constructor.name}`;
          }
        }
      } catch (error) {
        console.warn(`[WordLookupPipeline] ${adapter.constructor.name} failed:`, error);
        // Continue to next adapter
      }
    }

    // 4. Handle result
    if (result) {
      // Cache the successful result
      setInCache(cacheKey, result, CACHE_TTL);

      emit(effectiveResponseEvent, {
        word: normalizedWord,
        requestId,
        data: result,
        source: sourceAdapter,
      });
    } else {
      // No adapter could find the word
      emit(`${effectiveResponseEvent}:error`, {
        word: normalizedWord,
        requestId,
        error: 'Word not found in any dictionary',
        code: 'NOT_FOUND',
      });
    }
  });
}

/**
 * Programmatically requests a word lookup.
 * Returns a Promise that resolves when the lookup completes.
 *
 * @param {string} word - The word to look up.
 * @param {Object} [options] - Options.
 * @param {number} [options.timeout=10000] - Timeout in milliseconds.
 * @returns {Promise<import('../core/schemas').LexicalEntry>}
 */
/**
 * Generates a deterministic GUID-8 format requestId.
 * @param {string} word
 * @param {number} counter
 * @returns {string}
 */
function generateRequestId(word, counter) {
  const input = `${word}:${counter}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

let requestCounter = 0;
export function requestWordLookup(word, options = {}) {
  const timeout = options.timeout || 10000;
  const requestId = generateRequestId(word, requestCounter++);

  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let unsubscribeResult = null;
    let unsubscribeError = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (unsubscribeResult) unsubscribeResult();
      if (unsubscribeError) unsubscribeError();
    };

    // Listen for result
    unsubscribeResult = on(EVENTS.RESPONSE, (payload) => {
      if (payload.requestId === requestId) {
        cleanup();
        resolve(payload.data);
      }
    });

    // Listen for error
    unsubscribeError = on(`${EVENTS.RESPONSE}:error`, (payload) => {
      if (payload.requestId === requestId) {
        cleanup();
        reject(new Error(payload.error));
      }
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Word lookup timed out'));
    }, timeout);

    // Emit request
    emit(EVENTS.REQUEST, {
      word,
      requestId,
      responseEvent: EVENTS.RESPONSE,
    });
  });
}

/**
 * Clears all cached word lookups.
 * Useful for testing or when dictionary data changes.
 */
export function clearWordLookupCache() {
  clearCache();
}

/**
 * Gets the cache TTL for word lookups.
 * @returns {number} TTL in milliseconds.
 */
export function getWordLookupCacheTTL() {
  return CACHE_TTL;
}

/**
 * Gets the rate limit interval for word lookups.
 * @returns {number} Interval in milliseconds.
 */
export function getWordLookupRateLimit() {
  return RATE_LIMIT_MS;
}
