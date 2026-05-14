const COUNTER_KEYS = [
  'authFailures',
  'rateLimitHits',
  'wordLookupRequests',
  'wordLookupCacheHits',
  'panelAnalysisRequests',
  'panelAnalysisCacheHitsMemory',
  'panelAnalysisCacheHitsRedis',
  'panelAnalysisCacheMisses',
  'panelAnalysisErrors',
  'panelAnalysisDurationMsTotal',
  'uploadFailures',
];

function nowMs() {
  return Date.now();
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePanelCacheSource(source) {
  if (source === 'memory' || source === 'redis' || source === 'miss') {
    return source;
  }
  return 'miss';
}

export function createOpsMetrics() {
  const startedAtMs = nowMs();
  const counters = Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0]));

  function increment(counter, amount = 1) {
    if (!Object.prototype.hasOwnProperty.call(counters, counter)) return;
    counters[counter] += Math.max(0, toFiniteNumber(amount, 1));
  }

  function recordWordLookup(source) {
    increment('wordLookupRequests', 1);
    if (source === 'redis-cache') {
      increment('wordLookupCacheHits', 1);
    }
  }

  function recordPanelAnalysis({ source = 'miss', durationMs = 0, ok = true } = {}) {
    increment('panelAnalysisRequests', 1);
    const normalizedSource = normalizePanelCacheSource(source);

    if (normalizedSource === 'memory') {
      increment('panelAnalysisCacheHitsMemory', 1);
    } else if (normalizedSource === 'redis') {
      increment('panelAnalysisCacheHitsRedis', 1);
    } else {
      increment('panelAnalysisCacheMisses', 1);
    }

    if (!ok) {
      increment('panelAnalysisErrors', 1);
    }

    const duration = Math.max(0, toFiniteNumber(durationMs, 0));
    increment('panelAnalysisDurationMsTotal', duration);
  }

  function snapshot() {
    const lookupRequests = counters.wordLookupRequests;
    const lookupCacheHits = counters.wordLookupCacheHits;
    const wordLookupCacheHitRatio = lookupRequests > 0
      ? Number((lookupCacheHits / lookupRequests).toFixed(4))
      : 0;

    const panelRequests = counters.panelAnalysisRequests;
    const panelCacheHits = counters.panelAnalysisCacheHitsMemory + counters.panelAnalysisCacheHitsRedis;
    const panelAnalysisCacheHitRatio = panelRequests > 0
      ? Number((panelCacheHits / panelRequests).toFixed(4))
      : 0;
    const panelAnalysisAvgDurationMs = panelRequests > 0
      ? Number((counters.panelAnalysisDurationMsTotal / panelRequests).toFixed(2))
      : 0;

    return {
      ...counters,
      wordLookupCacheHitRatio,
      panelAnalysisCacheHitRatio,
      panelAnalysisAvgDurationMs,
      startedAt: new Date(startedAtMs).toISOString(),
      uptimeSeconds: Math.floor((nowMs() - startedAtMs) / 1000),
    };
  }

  return {
    increment,
    recordWordLookup,
    recordPanelAnalysis,
    snapshot,
  };
}
