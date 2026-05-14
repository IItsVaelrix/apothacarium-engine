const DAY_MS = 24 * 60 * 60 * 1000;
const ABYSS_RECOVERY_WINDOW_DAYS = 7;
const ABYSS_CONGESTION_CAP = 12;

export const ABYSS_MIN_MULTIPLIER = 0.5;
export const ABYSS_MAX_MULTIPLIER = 1.5;
export const ABYSS_NEUTRAL_MULTIPLIER = 1.0;
export const ABYSS_HEURISTIC_WEIGHT = 0.15;

export function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  if (numeric <= min) return min;
  if (numeric >= max) return max;
  return numeric;
}

export function normalizeAbyssWord(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

export function extractAbyssWordSequence(verseIR) {
  const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
  return tokens
    .map((token) => normalizeAbyssWord(token?.normalized || token?.text))
    .filter(Boolean);
}

export function countAbyssWordOccurrences(tokenSequence) {
  const counts = new Map();
  const tokens = Array.isArray(tokenSequence) ? tokenSequence : [];
  for (const token of tokens) {
    const normalized = normalizeAbyssWord(token);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return counts;
}

function toTimestampMs(value) {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeElapsedWholeDays(lastUsedAt, evaluatedAt = Date.now()) { // EXEMPT
  const lastUsedMs = toTimestampMs(lastUsedAt);
  const evaluatedAtMs = toTimestampMs(evaluatedAt) ?? Date.now(); // EXEMPT
  if (!Number.isFinite(lastUsedMs)) {
    return ABYSS_RECOVERY_WINDOW_DAYS;
  }
  if (evaluatedAtMs <= lastUsedMs) {
    return 0;
  }
  return Math.floor((evaluatedAtMs - lastUsedMs) / DAY_MS);
}

export function decayAbyssUsageCount(usageCount7d, elapsedDays = 0) {
  const usage = Math.max(0, Number(usageCount7d) || 0);
  const elapsed = Math.max(0, Number(elapsedDays) || 0);
  if (usage <= 0 || elapsed <= 0) return usage;
  if (elapsed >= ABYSS_RECOVERY_WINDOW_DAYS) return 0;
  return usage * ((ABYSS_RECOVERY_WINDOW_DAYS - elapsed) / ABYSS_RECOVERY_WINDOW_DAYS);
}

export function computeAbyssalResonanceMultiplier({
  usageCount7d = 0,
  lastUsedAt = null,
  evaluatedAt = Date.now(), // EXEMPT
} = {}) {
  const elapsedDays = lastUsedAt
    ? computeElapsedWholeDays(lastUsedAt, evaluatedAt)
    : ABYSS_RECOVERY_WINDOW_DAYS;
  const decayedUsageCount = decayAbyssUsageCount(usageCount7d, elapsedDays);
  const scarcityBonus = 0.25 * (1 - clamp(decayedUsageCount / ABYSS_CONGESTION_CAP, 0, 1));
  const recencyBonus = 0.15 * clamp(elapsedDays / ABYSS_RECOVERY_WINDOW_DAYS, 0, 1);
  const congestionPenalty = 0.75 * clamp(
    Math.log1p(decayedUsageCount) / Math.log1p(ABYSS_CONGESTION_CAP),
    0,
    1,
  );
  const multiplier = clamp(
    1.1 + scarcityBonus + recencyBonus - congestionPenalty,
    ABYSS_MIN_MULTIPLIER,
    ABYSS_MAX_MULTIPLIER,
  );

  return {
    multiplier: Number(multiplier.toFixed(3)),
    decayedUsageCount: Number(decayedUsageCount.toFixed(3)),
    elapsedDays,
  };
}

export function multiplierToAbyssRawScore(multiplier) {
  return clamp((Number(multiplier) || ABYSS_NEUTRAL_MULTIPLIER) - ABYSS_MIN_MULTIPLIER, 0, 1);
}

export function rawScoreToAbyssMultiplier(rawScore) {
  return Number((ABYSS_MIN_MULTIPLIER + clamp(rawScore, 0, 1)).toFixed(3));
}

export function classifyAbyssalState(multiplier) {
  const numeric = Number(multiplier) || ABYSS_NEUTRAL_MULTIPLIER;
  if (numeric >= 1.08) return 'resonant';
  if (numeric <= 0.92) return 'decayed';
  return 'neutral';
}
