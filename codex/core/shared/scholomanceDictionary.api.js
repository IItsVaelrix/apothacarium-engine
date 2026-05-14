/**
 * Scholomance Dictionary API
 */

import { z } from "zod";
import { buildAuthorityUrl } from "./apiUrl.js";

const LEXICON_BASE_PATH = "/api/lexicon";

function readEnvVar(name) {
  const viteEnv = (typeof import.meta !== "undefined" && import.meta.env)
    ? import.meta.env[name]
    : undefined;
  if (typeof viteEnv === "string") return viteEnv;

  if (typeof globalThis !== "undefined" && globalThis.process?.env) {
    const value = globalThis.process.env[name];
    if (typeof value === "string") return value;
  }
  return "";
}

function resolveBaseUrl() {
  // Dictionary may live on a different host than the main API authority,
  // so honor dictionary-specific overrides before falling back to the shared builder.
  const override =
    readEnvVar("VITE_SCHOLOMANCE_DICT_API_URL") ||
    readEnvVar("SCHOLOMANCE_DICT_API_URL");

  const trimmed = String(override || "").trim().replace(/\/+$/, "");
  if (!trimmed) return buildAuthorityUrl(LEXICON_BASE_PATH);

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    const url = new URL(trimmed);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = LEXICON_BASE_PATH;
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }
    return trimmed;
  }

  return trimmed;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_HEALTH_TIMEOUT_MS = 1500;
const HEALTH_CACHE_TTL_MS = 15000;
const OFFLINE_RETRY_COOLDOWN_MS = 30000;

const BatchLookupSchema = z.object({
  families: z.record(z.object({
    family: z.string().nullable(),
    phonemes: z.array(z.string()).nullable()
  }))
});

const ValidateBatchSchema = z.object({
  valid: z.array(z.string())
});

const SuggestSchema = z.object({
  results: z.array(z.object({
    headword: z.string(),
    pos: z.string().nullable().optional(),
  })),
});

class ScholomanceHttpError extends Error {
  constructor(status) {
    super(`Scholomance API error: ${status}`);
    this.name = "ScholomanceHttpError";
    this.status = status;
  }
}

// HTTP errors prove the server is reachable — only network-level failures
// (connection refused, DNS, timeout/abort) should trigger offline cooldown.
function isNetworkError(error) {
  return !(error instanceof ScholomanceHttpError);
}

const connectionState = {
  baseUrl: "",
  reachable: null,
  lastCheckedAt: 0,
  lastError: "",
  consecutiveFailures: 0,
  unavailableUntil: 0,
};

function syncConnectionBase(baseUrl) {
  if (connectionState.baseUrl === baseUrl) return;
  connectionState.baseUrl = baseUrl;
  connectionState.reachable = null;
  connectionState.lastCheckedAt = 0;
  connectionState.lastError = "";
  connectionState.consecutiveFailures = 0;
  connectionState.unavailableUntil = 0;
}

function markConnectionSuccess(baseUrl) {
  syncConnectionBase(baseUrl);
  connectionState.reachable = true;
  connectionState.lastCheckedAt = Date.now(); // EXEMPT
  connectionState.lastError = "";
  connectionState.consecutiveFailures = 0;
  connectionState.unavailableUntil = 0;
}

function markConnectionFailure(baseUrl, error) {
  syncConnectionBase(baseUrl);
  connectionState.reachable = false;
  connectionState.lastCheckedAt = Date.now(); // EXEMPT
  connectionState.consecutiveFailures += 1;
  connectionState.lastError = error instanceof Error ? error.message : String(error || "unknown");
  connectionState.unavailableUntil = Date.now() + OFFLINE_RETRY_COOLDOWN_MS; // EXEMPT
}

function canAttemptRequest(baseUrl) {
  syncConnectionBase(baseUrl);
  if (connectionState.reachable !== false) return true;
  if (Date.now() >= connectionState.unavailableUntil) return true; // EXEMPT
  return false;
}

function createUnavailableError() {
  return new Error("Scholomance Dictionary API is in offline cooldown mode.");
}

function buildUrl(base, params) {
  let absoluteBase = base;
  if (base.startsWith('/') && typeof window !== 'undefined') {
    absoluteBase = `${window.location.origin}${base}`;
  }
  const url = new URL(absoluteBase, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new ScholomanceHttpError(res.status);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Dictionary Oracle timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(baseUrl, url, options = {}) {
  if (!canAttemptRequest(baseUrl)) {
    throw createUnavailableError();
  }

  try {
    const payload = await fetchJson(url, options);
    markConnectionSuccess(baseUrl);
    return payload;
  } catch (error) {
    if (isNetworkError(error)) {
      markConnectionFailure(baseUrl, error);
    }
    throw error;
  }
}

export const ScholomanceDictionaryAPI = {
  isConfigured() {
    return Boolean(resolveBaseUrl());
  },

  isEnabled() {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl) return false;
    syncConnectionBase(baseUrl);
    if (connectionState.reachable === false && Date.now() < connectionState.unavailableUntil) { // EXEMPT
      return false;
    }
    return true;
  },

  isConnected() {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl) return false;
    syncConnectionBase(baseUrl);
    return connectionState.reachable === true;
  },

  getConnectionStatus() {
    const baseUrl = resolveBaseUrl();
    syncConnectionBase(baseUrl);
    return {
      configured: Boolean(baseUrl),
      connected: connectionState.reachable === true,
      reachable: connectionState.reachable,
      lastCheckedAt: connectionState.lastCheckedAt,
      consecutiveFailures: connectionState.consecutiveFailures,
      lastError: connectionState.lastError,
      offlineCooldownMs: connectionState.unavailableUntil > Date.now() // EXEMPT
        ? (connectionState.unavailableUntil - Date.now()) // EXEMPT
        : 0,
    };
  },

  markUnavailable(reason = "manual") {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl) return;
    markConnectionFailure(baseUrl, new Error(`Marked unavailable: ${reason}`));
  },

  markAvailable() {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl) return;
    markConnectionSuccess(baseUrl);
  },

  async checkConnectivity({ force = false, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl) {
      syncConnectionBase("");
      return false;
    }

    syncConnectionBase(baseUrl);

    const now = Date.now(); // EXEMPT
    if (
      !force &&
      connectionState.reachable !== null &&
      (now - connectionState.lastCheckedAt) < HEALTH_CACHE_TTL_MS
    ) {
      return connectionState.reachable === true;
    }

    const url = buildUrl(`${baseUrl}/suggest`, { prefix: "a", limit: 1 });
    try {
      await fetchJson(url, { timeoutMs });
      markConnectionSuccess(baseUrl);
      return true;
    } catch (error) {
      if (isNetworkError(error)) {
        markConnectionFailure(baseUrl, error);
      }
      return false;
    }
  },

  getBaseUrl() {
    return resolveBaseUrl();
  },

  async lookup(word) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl || !word) return null;
    const url = buildUrl(`${baseUrl}/lookup/${encodeURIComponent(word)}`);
    const payload = await requestJson(baseUrl, url);
    return payload;
  },

  /**
   * Performs bulk lookup of rhyme families for a set of words.
   * @param {string[]} words
   * @returns {Promise<Record<string, string>>} word (upper) -> rhyme family
   */
  async lookupBatch(words) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl || !words?.length) return {};
    const url = buildUrl(`${baseUrl}/lookup-batch`);
    const payload = await requestJson(baseUrl, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words })
    });
    const parsed = BatchLookupSchema.safeParse(payload);
    return parsed.success ? parsed.data.families : {};
  },

  /**
   * Validates whether words exist in the dictionary lexicon.
   * @param {string[]} words
   * @returns {Promise<string[]>} lowercased valid words
   */
  async validateBatch(words) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl || !words?.length) return [];
    const url = buildUrl(`${baseUrl}/validate-batch`);
    const payload = await requestJson(baseUrl, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words })
    });
    const parsed = ValidateBatchSchema.safeParse(payload);
    return parsed.success ? parsed.data.valid : [];
  },

  /**
   * Returns dictionary suggestions for a prefix.
   * @param {string} prefix
   * @param {{ limit?: number }} [options]
   * @returns {Promise<string[]>}
   */
  async suggest(prefix, { limit = 20 } = {}) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl || !prefix) return [];
    const url = buildUrl(`${baseUrl}/suggest`, { prefix, limit });
    const payload = await requestJson(baseUrl, url);
    const parsed = SuggestSchema.safeParse(payload);
    if (!parsed.success) return [];

    const deduped = [];
    const seen = new Set();
    for (const row of parsed.data.results) {
      const headword = String(row?.headword || "").trim().toLowerCase();
      if (!headword || seen.has(headword)) continue;
      seen.add(headword);
      deduped.push(headword);
    }
    return deduped;
  },

  async search(query, { limit = 20 } = {}) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl || !query) return [];
    const url = buildUrl(`${baseUrl}/search`, { q: query, limit });
    const payload = await requestJson(baseUrl, url);
    return payload.results || [];
  },

  /**
   * Fetches unified Read panel analysis (rhyme, score, astrology, narrative) from the backend.
   * @param {string} text
   * @param {{ nluMode?: 'direct'|'generate' }} [options]
   * @returns {Promise<{ source: string, data: any }>}
   */
  async analyzePanels(text, { nluMode = 'generate' } = {}) {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl || !text) return null;

    const url = buildAuthorityUrl('/api/analysis/panels');

    return await requestJson(baseUrl, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, nluMode })
    });
  }
};
