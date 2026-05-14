/**
 * The CODEx Runtime Pipeline orchestrator.
 * "Given event X, run pipeline Y"
 *
 * This module connects events from the event bus to a series of processing steps,
 * including caching, rate limiting, and service adapter calls.
 *
 * @see AI_Architecture_V2.md section 2.1 and 5.2
 */

import { on, emit } from './eventBus.js';
import { getFromCache, setInCache, hydrateFromStorage } from './cache.js';
import { isActionAllowed } from './rateLimit.js';
import { setupWordLookupPipeline, EVENTS as WORD_LOOKUP_EVENTS } from './wordLookupPipeline.js';

// Re-export word lookup events for consumers
export { WORD_LOOKUP_EVENTS };

// Module-level state for cleanup
let wordLookupUnsubscribe = null;

/**
 * Legacy pipeline for analyzing a word (deprecated).
 * Use the new word lookup pipeline via setupWordLookupPipeline instead.
 * @deprecated Use setupWordLookupPipeline with adapters
 */
function setupWordAnalysisPipeline() {
  on('ui:word_analysis_requested', async (payload) => {
    const { word, responseEventName } = payload;

    // 1. Check cache
    const cacheKey = `analysis:${word}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      emit(responseEventName, { word, result: cached, source: 'cache' });
      return;
    }

    // 2. Call service (adapter) - This part is conceptual until adapters are implemented
    try {
      // const result = await dictionaryAdapter.lookup(word);
      const result = { definition: `Definition for ${word}` }; // Placeholder

      // 3. Cache the result
      setInCache(cacheKey, result);

      // 4. Emit success event
      emit(responseEventName, { word, result, source: 'network' });
    } catch (error) {
      // 5. Emit error event
      emit(`${responseEventName}:error`, { word, error });
    }
  });
}

/**
 * Example pipeline for submitting a combat action.
 */
function setupCombatSubmitPipeline() {
    on('ui:combat_action_submitted', async (payload) => {
        const { responseEventName } = payload;

        // 1. Rate limit
        if (!isActionAllowed('combat_submit', 3000)) {
            emit(`${responseEventName}:error`, { error: 'Rate limited' });
            return;
        }

        // 2. Call transport adapter to send to server
        try {
            // const result = await transportAdapter.post('/combat/submit', action);
            const result = { status: 'success', serverResult: {} }; // Placeholder
            emit(responseEventName, { result });
        } catch (error) {
            emit(`${responseEventName}:error`, { error });
        }
    });
}

/**
 * Initializes all the runtime pipelines.
 * @param {Object} [options] - Configuration options.
 * @param {import('../services/adapters/dictionary.adapter.js').DictionaryAdapter[]} [options.dictionaryAdapters] - Adapter chain for word lookups.
 * @returns {Promise<{ cleanup: function(): void }>} Object with cleanup function.
 */
export async function initializePipelines(options = {}) {
  console.log("Initializing CODEx runtime pipelines...");

  // 0. Hydrate cache from persistent storage (IndexedDB)
  try {
    const hydratedCount = await hydrateFromStorage();
    console.log(`  - Cache hydrated: ${hydratedCount} entries restored.`);
  } catch (err) {
    console.warn("  - Cache hydration failed:", err.message);
  }

  // Setup word lookup pipeline with provided adapters
  if (options.dictionaryAdapters && options.dictionaryAdapters.length > 0) {
    wordLookupUnsubscribe = setupWordLookupPipeline(options.dictionaryAdapters);
    console.log(`  - Word lookup pipeline initialized with ${options.dictionaryAdapters.length} adapter(s)`);
  } else {
    // Fall back to legacy pipeline if no adapters provided
    setupWordAnalysisPipeline();
    console.log("  - Legacy word analysis pipeline initialized (no adapters provided)");
  }

  setupCombatSubmitPipeline();
  console.log("  - Combat submit pipeline initialized");

  console.log("CODEx runtime pipelines initialized.");

  return {
    cleanup: () => {
      if (wordLookupUnsubscribe) {
        wordLookupUnsubscribe();
        wordLookupUnsubscribe = null;
      }
    },
  };
}
