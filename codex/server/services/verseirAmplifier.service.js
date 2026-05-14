import { DEFAULT_VERSEIR_AMPLIFIERS, enhanceVerseIR } from '../../core/verseir-amplifier/index.js';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 250;
const DEFAULT_AMPLIFIER_TIMEOUT_MS = 80;

const verseIRAmplifierCache = new Map();

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function stableSerialize(value) {
  if (value instanceof Map) {
    return `Map(${stableSerialize(
      [...value.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))
    )})`;
  }

  if (value instanceof Set) {
    return `Set(${stableSerialize([...value.values()].sort())})`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildCacheKey(verseIR, options) {
  if (!verseIR || typeof verseIR !== 'object') return null;

  const amplifiers = Array.isArray(options?.amplifiers) && options.amplifiers.length > 0
    ? options.amplifiers.map((amplifier, index) => String(amplifier?.id || amplifier?.label || `custom_${index + 1}`))
    : DEFAULT_VERSEIR_AMPLIFIERS.map((amplifier, index) => String(amplifier?.id || amplifier?.label || `default_${index + 1}`));

  return stableSerialize({
    version: verseIR.version || '',
    normalizedText: verseIR.normalizedText || verseIR.rawText || '',
    tokenCount: verseIR?.metadata?.tokenCount ?? verseIR?.tokens?.length ?? 0,
    lineCount: verseIR?.metadata?.lineCount ?? verseIR?.lines?.length ?? 0,
    mode: verseIR?.metadata?.mode || '',
    lineBreakStyle: verseIR?.metadata?.lineBreakStyle || '',
    amplifiers,
    timeoutMs: options?.timeoutMs ?? null,
    amplifierTimeouts: options?.amplifierTimeouts ?? null,
    routing: options?.routing ?? null,
    domainOverrides: options?.domainOverrides ?? null,
    domainExtensions: options?.domainExtensions ?? null,
    pixelBrainEnabled: options?.pixelBrainEnabled ?? null,
    pixelBrainCanvas: options?.pixelBrainCanvas ?? null,
    pixelBrainNoise: options?.pixelBrainNoise ?? null,
    pixelBrainExtensionIds: Array.isArray(options?.pixelBrainExtensions)
      ? options.pixelBrainExtensions.map((extension, index) => String(extension?.id || extension?.label || `pixelbrain_extension_${index + 1}`))
      : null,
  });
}

function getCachedValue(cacheKey, ttlMs) {
  const cached = verseIRAmplifierCache.get(cacheKey);
  if (!cached) return null;

  if ((Date.now() - cached.timestamp) >= ttlMs) {
    verseIRAmplifierCache.delete(cacheKey);
    return null;
  }

  verseIRAmplifierCache.delete(cacheKey);
  verseIRAmplifierCache.set(cacheKey, cached);
  return cached.value;
}

function setCachedValue(cacheKey, value, maxEntries) {
  verseIRAmplifierCache.set(cacheKey, {
    value,
    timestamp: Date.now(),
  });

  while (verseIRAmplifierCache.size > maxEntries) {
    const oldestKey = verseIRAmplifierCache.keys().next().value;
    if (!oldestKey) break;
    verseIRAmplifierCache.delete(oldestKey);
  }
}

export async function enhanceVerseIRWithServerPolicy(verseIR, options = {}) {
  if (!verseIR || typeof verseIR !== 'object') {
    return verseIR;
  }

  if (verseIR?.verseIRAmplifier && typeof verseIR.verseIRAmplifier === 'object') {
    return verseIR;
  }

  const cacheTtlMs = toPositiveInteger(options?.cacheTtlMs, DEFAULT_CACHE_TTL_MS);
  const cacheMaxEntries = toPositiveInteger(options?.cacheMaxEntries, DEFAULT_CACHE_MAX_ENTRIES);
  const policyOptions = {
    ...options,
    timeoutMs: options?.timeoutMs ?? DEFAULT_AMPLIFIER_TIMEOUT_MS,
  };
  const cacheKey = buildCacheKey(verseIR, policyOptions);

  if (cacheKey) {
    const cached = getCachedValue(cacheKey, cacheTtlMs);
    if (cached) {
      return await cached;
    }
  }

  const pending = enhanceVerseIR(verseIR, policyOptions)
    .then((result) => {
      if (cacheKey) {
        setCachedValue(cacheKey, result, cacheMaxEntries);
      }
      return result;
    })
    .catch((error) => {
      if (cacheKey) {
        verseIRAmplifierCache.delete(cacheKey);
      }
      throw error;
    });

  if (cacheKey) {
    setCachedValue(cacheKey, pending, cacheMaxEntries);
  }

  return await pending;
}
