/**
 * In-memory cache with TTL, LRU eviction, and IndexedDB persistence.
 * The in-memory Map is the hot path for synchronous reads.
 * IndexedDB provides durable backing so lookups survive page reloads.
 *
 * @see AI_Architecture_V2.md section 5.2
 */

const cache = new Map();
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours (persistent across sessions)
const MAX_CACHE_SIZE = 1000;

// Phase 4: Ritual Prediction Artifact Cache Support
const PREDICTION_ARTIFACT_NAMESPACE = 'PB-PRED-v1:';

// --- IndexedDB Persistence Layer ---

const DB_NAME = "scholomance-cache-v2";
const STORE_NAME = "entries";
const DB_VERSION = 1;

/** @type {IDBDatabase | null} */
let db = null;

/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Writes a cache entry to IndexedDB (fire-and-forget).
 * @param {string} key
 * @param {{ data: any, timestamp: number, ttl: number }} entry
 */
function persistEntry(key, entry) {
  openDB()
    .then((database) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry, key);
    })
    .catch((err) => {
      console.warn("[Cache] IndexedDB write failed:", err);
    });
}

/**
 * Deletes a cache entry from IndexedDB (fire-and-forget).
 * @param {string} key
 */
function removePersistedEntry(key) {
  openDB()
    .then((database) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
    })
    .catch((err) => {
      console.warn("[Cache] IndexedDB delete failed:", err);
    });
}

/**
 * Clears all entries from the IndexedDB store (fire-and-forget).
 */
function clearPersistedEntries() {
  openDB()
    .then((database) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
    })
    .catch((err) => {
      console.warn("[Cache] IndexedDB clear failed:", err);
    });
}

/**
 * Hydrates the in-memory Map from IndexedDB on startup.
 * Expired entries are pruned during hydration.
 * @returns {Promise<number>} Number of entries restored.
 */
export function hydrateFromStorage() {
  return openDB()
    .then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor();
        const now = Date.now();
        let restored = 0;

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            resolve(restored);
            return;
          }

          const key = cursor.key;
          const entry = cursor.value;

          // Prune expired entries
          if (now - entry.timestamp > entry.ttl) {
            cursor.delete();
          } else if (cache.size < MAX_CACHE_SIZE) {
            cache.set(key, entry);
            restored++;
          }

          cursor.continue();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    })
    .then((restored) => {
      if (restored > 0) {
        console.log(`[Cache] Hydrated ${restored} entries from IndexedDB`);
      }
      return restored;
    })
    .catch((err) => {
      console.warn("[Cache] IndexedDB hydration failed, using memory-only:", err);
      return 0;
    });
}

// Auto-hydrate on module load (non-blocking)
if (typeof indexedDB !== "undefined") {
  hydrateFromStorage();
}

// --- Public API (unchanged signatures) ---

/**
 * Retrieves an entry from the cache.
 * @param {string} key The cache key.
 * @returns {any|null} The cached data or null if not found or expired.
 */
export function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    removePersistedEntry(key);
    return null;
  }

  // For LRU: move to end by deleting and re-setting
  cache.delete(key);
  cache.set(key, entry);

  return entry.data;
}

/**
 * Adds an entry to the cache.
 * @param {string} key The cache key.
 * @param {any} data The data to cache.
 * @param {number} [ttl=DEFAULT_TTL] The time-to-live for this entry in milliseconds.
 */
export function setInCache(key, data, ttl = DEFAULT_TTL) {
  // LRU enforcement
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
    removePersistedEntry(oldestKey);
  }

  const entry = {
    data,
    timestamp: Date.now(),
    ttl,
  };
  cache.set(key, entry);
  persistEntry(key, entry);
}

/**
 * Persists a compiled RitualPredictionArtifact to the cache.
 * This satisfies Phase 4 of the Prediction Enhancement PDR.
 * @param {string} requestHash 
 * @param {object} artifact 
 */
export function cachePredictionArtifact(requestHash, artifact) {
  setInCache(`${PREDICTION_ARTIFACT_NAMESPACE}${requestHash}`, artifact, DEFAULT_TTL);
}

/**
 * Retrieves a cached RitualPredictionArtifact.
 * @param {string} requestHash 
 * @returns {object|null}
 */
export function getPredictionArtifact(requestHash) {
  return getFromCache(`${PREDICTION_ARTIFACT_NAMESPACE}${requestHash}`);
}

/**
 * Deletes an entry from the cache.
 * @param {string} key The cache key to delete.
 */
export function deleteFromCache(key) {
  cache.delete(key);
  removePersistedEntry(key);
}

/**
 * Clears the entire cache (memory and IndexedDB).
 */
export function clearCache() {
  cache.clear();
  clearPersistedEntries();
}
