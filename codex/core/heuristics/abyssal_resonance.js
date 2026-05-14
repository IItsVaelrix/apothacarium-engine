import {
  ABYSS_HEURISTIC_WEIGHT,
  ABYSS_NEUTRAL_MULTIPLIER,
  classifyAbyssalState,
  multiplierToAbyssRawScore,
} from '../lexicon.abyss.js';

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toFixedMultiplier(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '1.00';
  return numeric.toFixed(2);
}

function buildNeutralSignal(doc, source = 'neutral_fallback') {
  return {
    averageMultiplier: ABYSS_NEUTRAL_MULTIPLIER,
    tokenCount: Array.isArray(doc?.allWords) ? doc.allWords.length : 0,
    tokenDetails: [],
    source,
  };
}

function normalizeTokenDetail(detail) {
  const multiplier = Number(detail?.multiplier);
  return {
    token: String(detail?.token || '').trim().toLowerCase(),
    occurrences: Math.max(1, Number(detail?.occurrences) || 1),
    usageCount7d: Math.max(0, Number(detail?.usageCount7d) || 0),
    decayedUsageCount: Math.max(0, Number(detail?.decayedUsageCount) || 0),
    lastUsedAt: detail?.lastUsedAt || null,
    multiplier: Number.isFinite(multiplier) ? Number(multiplier.toFixed(3)) : ABYSS_NEUTRAL_MULTIPLIER,
  };
}

function normalizeSignal(signal, doc) {
  const fallback = buildNeutralSignal(doc);
  if (!signal || typeof signal !== 'object') {
    return fallback;
  }

  const tokenDetails = Array.isArray(signal.tokenDetails)
    ? signal.tokenDetails
      .map(normalizeTokenDetail)
      .filter((detail) => detail.token)
    : [];

  const averageMultiplier = Number(signal.averageMultiplier);
  return {
    averageMultiplier: Number.isFinite(averageMultiplier)
      ? Number(averageMultiplier.toFixed(3))
      : fallback.averageMultiplier,
    tokenCount: Math.max(0, Number(signal.tokenCount) || fallback.tokenCount),
    tokenDetails,
    source: String(signal.source || fallback.source),
  };
}

function buildExplanation(signal) {
  if (signal.source === 'neutral_fallback' || signal.source === 'unavailable') {
    return 'The Lexicon Abyss has no public-combat judgment here, so the cast holds neutral force.';
  }

  const resonantCount = signal.tokenDetails.filter((detail) => classifyAbyssalState(detail.multiplier) === 'resonant').length;
  const decayedCount = signal.tokenDetails.filter((detail) => classifyAbyssalState(detail.multiplier) === 'decayed').length;
  const neutralCount = Math.max(0, signal.tokenDetails.length - resonantCount - decayedCount);

  return [
    `average ${toFixedMultiplier(signal.averageMultiplier)}x across ${signal.tokenCount} cast words`,
    `${resonantCount} resonant`,
    `${decayedCount} decayed`,
    `${neutralCount} stable`,
  ].join(', ') + '.';
}

function buildDiagnostics(signal, doc) {
  if (!Array.isArray(signal.tokenDetails) || signal.tokenDetails.length === 0) {
    return [];
  }

  const rawText = String(doc?.raw || '');
  const end = Math.max(0, rawText.length - 1);

  return [...signal.tokenDetails]
    .sort((left, right) => {
      const leftDelta = Math.abs((Number(left?.multiplier) || ABYSS_NEUTRAL_MULTIPLIER) - ABYSS_NEUTRAL_MULTIPLIER);
      const rightDelta = Math.abs((Number(right?.multiplier) || ABYSS_NEUTRAL_MULTIPLIER) - ABYSS_NEUTRAL_MULTIPLIER);
      if (rightDelta !== leftDelta) return rightDelta - leftDelta;
      return String(left?.token || '').localeCompare(String(right?.token || ''));
    })
    .slice(0, 4)
    .map((detail) => {
      const state = classifyAbyssalState(detail.multiplier);
      let message = `Abyss equilibrium on "${detail.token}" (${toFixedMultiplier(detail.multiplier)}x).`;
      let severity = 'info';

      if (state === 'resonant') {
        message = `Abyssal bonus on "${detail.token}" (${toFixedMultiplier(detail.multiplier)}x).`;
        severity = 'success';
      } else if (state === 'decayed') {
        message = `Semantic decay grips "${detail.token}" (${toFixedMultiplier(detail.multiplier)}x).`;
        severity = 'warning';
      }

      return {
        start: 0,
        end,
        severity,
        message,
        metadata: {
          word: detail.token,
          multiplier: detail.multiplier,
          occurrences: detail.occurrences,
          usageCount7d: detail.usageCount7d,
          decayedUsageCount: detail.decayedUsageCount,
          lastUsedAt: detail.lastUsedAt,
          state,
        },
      };
    });
}

async function scoreAbyssalResonance(doc, provider) {
  let signal = buildNeutralSignal(doc);

  if (typeof provider === 'function') {
    try {
      signal = normalizeSignal(await provider(doc), doc);
    } catch {
      signal = buildNeutralSignal(doc, 'unavailable');
    }
  }

  const averageMultiplier = Number.isFinite(Number(signal.averageMultiplier))
    ? Number(signal.averageMultiplier)
    : ABYSS_NEUTRAL_MULTIPLIER;

  return {
    heuristic: 'abyssal_resonance',
    rawScore: clamp01(multiplierToAbyssRawScore(averageMultiplier)),
    explanation: buildExplanation(signal),
    diagnostics: buildDiagnostics(signal, doc),
  };
}

export function createAbyssalResonanceHeuristic(options = {}) {
  const provider = typeof options.provider === 'function' ? options.provider : null;
  const weight = Number.isFinite(Number(options.weight))
    ? Number(options.weight)
    : ABYSS_HEURISTIC_WEIGHT;

  return {
    name: 'abyssal_resonance',
    scorer: (doc) => scoreAbyssalResonance(doc, provider),
    weight,
  };
}

export const abyssalResonanceHeuristic = createAbyssalResonanceHeuristic();
