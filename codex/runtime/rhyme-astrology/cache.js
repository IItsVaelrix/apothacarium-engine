const DEFAULT_MAX_ENTRIES = 500;

/**
 * @param {number | undefined | null} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

/**
 * In-process LRU cache for query responses.
 * No TTL is applied because v1 contract only requires bounded memory.
 * @param {{ maxEntries?: number }} [options]
 */
export function createRhymeAstrologyCache(options = {}) {
  const maxEntries = toPositiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const entries = new Map();

  /**
   * @param {string} key
   */
  function get(key) {
    if (!entries.has(key)) return null;
    const value = entries.get(key);
    entries.delete(key);
    entries.set(key, value);
    return value;
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  function set(key, value) {
    if (entries.has(key)) {
      entries.delete(key);
    }
    entries.set(key, value);

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  function clear() {
    entries.clear();
  }

  function size() {
    return entries.size;
  }

  return {
    get,
    set,
    clear,
    size,
    maxEntries,
  };
}

