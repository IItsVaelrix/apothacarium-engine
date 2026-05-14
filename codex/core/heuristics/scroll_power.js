/**
 * Heuristic: Scroll Power
 * Explicitly combines rhyme density and coherence, then caps the product to 70%.
 *
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

const SCROLL_POWER_CAP = 0.7;

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function scoreScrollPower(doc) {
  const signal = doc?.parsed?.scrollPower;
  if (!signal) {
    return {
      heuristic: 'scroll_power',
      rawScore: 0,
      weight: 0.1,
      contribution: 0,
      explanation: 'No scroll power signal available.',
      diagnostics: []
    };
  }

  const rhymeDensity = clamp01(Number(signal.rhymeDensity) || 0);
  const coherence = clamp01(Number(signal.coherence) || 0);
  const product = clamp01(Number(signal.product) || 0);
  const cappedProduct = Math.max(0, Math.min(SCROLL_POWER_CAP, Number(signal.cappedProduct) || 0));
  const normalized = clamp01(Number(signal.normalized) || (SCROLL_POWER_CAP > 0 ? cappedProduct / SCROLL_POWER_CAP : 0));

  return {
    heuristic: 'scroll_power',
    rawScore: normalized,
    explanation: [
      `rhyme density ${toPercent(rhymeDensity)}`,
      `coherence ${toPercent(coherence)}`,
      `product ${toPercent(product)}`,
      `bounded ${(cappedProduct * 100).toFixed(1)}% (cap 70%)`,
    ].join(', ') + '.',
    diagnostics: []
  };
}

export const scrollPowerHeuristic = {
  name: 'scroll_power',
  scorer: scoreScrollPower,
  weight: 0.10,
};
