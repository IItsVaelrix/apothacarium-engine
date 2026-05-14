/**
 * Word Lookup Request Coalescer
 * Deduplicates concurrent in-flight requests for the same word.
 * If 100 users request "ephemeral" simultaneously, only 1 external API call is made.
 *
 * @see ARCH.md section 1 - Fix 2
 */

const pendingRequests = new Map();

/**
 * Wraps an async lookup function with request coalescing.
 * Concurrent calls for the same key share a single in-flight promise.
 *
 * @param {string} word - The normalized word to look up.
 * @param {function(): Promise<Object>} lookupFn - The actual lookup function to execute.
 * @returns {Promise<Object>} The lookup result.
 */
export async function coalescedLookup(word, lookupFn) {
  const key = word.toLowerCase().trim();

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = lookupFn()
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * Returns the number of currently in-flight coalesced requests.
 * Useful for monitoring and testing.
 * @returns {number}
 */
export function getPendingCount() {
  return pendingRequests.size;
}
