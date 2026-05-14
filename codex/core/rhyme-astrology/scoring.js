export const RHYME_ASTROLOGY_WEIGHTS = Object.freeze({
  exact: 0.35,
  slant: 0.2,
  vowel: 0.2,
  consonant: 0.1,
  stress: 0.1,
  syllablePenalty: 0.05,
});

/**
 * @param {number} value
 * @returns {number}
 */
export function clampUnitInterval(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

/**
 * @param {number} value
 * @param {number} fallback
 * @returns {number}
 */
function finiteOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * @param {Partial<typeof RHYME_ASTROLOGY_WEIGHTS> | undefined | null} overrides
 * @returns {typeof RHYME_ASTROLOGY_WEIGHTS}
 */
export function normalizeRhymeAstrologyWeights(overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return RHYME_ASTROLOGY_WEIGHTS;
  }

  return Object.freeze({
    exact: finiteOr(overrides.exact, RHYME_ASTROLOGY_WEIGHTS.exact),
    slant: finiteOr(overrides.slant, RHYME_ASTROLOGY_WEIGHTS.slant),
    vowel: finiteOr(overrides.vowel, RHYME_ASTROLOGY_WEIGHTS.vowel),
    consonant: finiteOr(overrides.consonant, RHYME_ASTROLOGY_WEIGHTS.consonant),
    stress: finiteOr(overrides.stress, RHYME_ASTROLOGY_WEIGHTS.stress),
    syllablePenalty: finiteOr(overrides.syllablePenalty, RHYME_ASTROLOGY_WEIGHTS.syllablePenalty),
  });
}

/**
 * @typedef {Object} SimilarityDimensions
 * @property {number} exactRhymeScore
 * @property {number} slantRhymeScore
 * @property {number} vowelMatchScore
 * @property {number} consonantMatchScore
 * @property {number} stressAlignmentScore
 * @property {number} syllableDeltaPenalty
 */

/**
 * @param {Partial<SimilarityDimensions> | null | undefined} dimensions
 * @param {Partial<typeof RHYME_ASTROLOGY_WEIGHTS> | undefined | null} weights
 * @returns {number}
 */
export function calculateWeightedRhymeScore(dimensions, weights) {
  const resolvedWeights = normalizeRhymeAstrologyWeights(weights);
  const exactRhymeScore = clampUnitInterval(dimensions?.exactRhymeScore);
  const slantRhymeScore = clampUnitInterval(dimensions?.slantRhymeScore);
  const vowelMatchScore = clampUnitInterval(dimensions?.vowelMatchScore);
  const consonantMatchScore = clampUnitInterval(dimensions?.consonantMatchScore);
  const stressAlignmentScore = clampUnitInterval(dimensions?.stressAlignmentScore);
  const syllableDeltaPenalty = clampUnitInterval(dimensions?.syllableDeltaPenalty);

  return clampUnitInterval(
    (exactRhymeScore * resolvedWeights.exact) +
    (slantRhymeScore * resolvedWeights.slant) +
    (vowelMatchScore * resolvedWeights.vowel) +
    (consonantMatchScore * resolvedWeights.consonant) +
    (stressAlignmentScore * resolvedWeights.stress) -
    (syllableDeltaPenalty * resolvedWeights.syllablePenalty)
  );
}

/**
 * @param {Partial<SimilarityDimensions> | null | undefined} dimensions
 * @param {Partial<typeof RHYME_ASTROLOGY_WEIGHTS> | undefined | null} weights
 */
export function buildWeightedScoreBreakdown(dimensions, weights) {
  const resolvedWeights = normalizeRhymeAstrologyWeights(weights);
  const exactRhymeScore = clampUnitInterval(dimensions?.exactRhymeScore);
  const slantRhymeScore = clampUnitInterval(dimensions?.slantRhymeScore);
  const vowelMatchScore = clampUnitInterval(dimensions?.vowelMatchScore);
  const consonantMatchScore = clampUnitInterval(dimensions?.consonantMatchScore);
  const stressAlignmentScore = clampUnitInterval(dimensions?.stressAlignmentScore);
  const syllableDeltaPenalty = clampUnitInterval(dimensions?.syllableDeltaPenalty);

  const contributions = {
    exact: exactRhymeScore * resolvedWeights.exact,
    slant: slantRhymeScore * resolvedWeights.slant,
    vowel: vowelMatchScore * resolvedWeights.vowel,
    consonant: consonantMatchScore * resolvedWeights.consonant,
    stress: stressAlignmentScore * resolvedWeights.stress,
    syllablePenalty: syllableDeltaPenalty * resolvedWeights.syllablePenalty,
  };

  return {
    weights: resolvedWeights,
    dimensions: {
      exactRhymeScore,
      slantRhymeScore,
      vowelMatchScore,
      consonantMatchScore,
      stressAlignmentScore,
      syllableDeltaPenalty,
    },
    contributions,
    overallScore: clampUnitInterval(
      contributions.exact +
      contributions.slant +
      contributions.vowel +
      contributions.consonant +
      contributions.stress -
      contributions.syllablePenalty
    ),
  };
}

/**
 * @typedef {Object} PLSPhoneticFeatures
 * @property {number} rhymeAffinityScore
 * @property {number} constellationDensity
 * @property {number} internalRecurrenceScore
 * @property {number} phoneticNoveltyScore
 */

/**
 * @param {Array<{ topMatches?: Array<{ overallScore?: number, nodeId?: string }>, constellations?: Array<{ densityScore?: number }>, lineIndex?: number, sign?: string }>} anchors
 * @param {{
 *   frequencyResolver?: ((nodeId: string) => number | null | undefined),
 * }} [options]
 * @returns {PLSPhoneticFeatures}
 */
export function buildPlsPhoneticFeatures(anchors, options = {}) {
  const rows = Array.isArray(anchors) ? anchors : [];
  if (rows.length === 0) {
    return {
      rhymeAffinityScore: 0,
      constellationDensity: 0,
      internalRecurrenceScore: 0,
      phoneticNoveltyScore: 0,
    };
  }

  const topThreeAverages = [];
  const densitySamples = [];
  const noveltySamples = [];
  const recurrenceByLine = new Map();
  const frequencyResolver = typeof options.frequencyResolver === 'function'
    ? options.frequencyResolver
    : null;

  for (const row of rows) {
    const topMatches = Array.isArray(row?.topMatches) ? row.topMatches : [];
    const topThree = topMatches.slice(0, 3).map((match) => clampUnitInterval(match?.overallScore));
    if (topThree.length > 0) {
      const avg = topThree.reduce((sum, score) => sum + score, 0) / topThree.length;
      topThreeAverages.push(clampUnitInterval(avg));
    }

    const topConstellation = Array.isArray(row?.constellations) ? row.constellations[0] : null;
    if (topConstellation) {
      densitySamples.push(clampUnitInterval(topConstellation?.densityScore));
    }

    if (frequencyResolver && topMatches.length > 0) {
      const topMatch = topMatches[0];
      const nodeId = String(topMatch?.nodeId || '');
      if (nodeId) {
        const frequencyScore = clampUnitInterval(frequencyResolver(nodeId));
        noveltySamples.push(clampUnitInterval(1 - frequencyScore));
      }
    }

    const lineIndex = Number(row?.lineIndex);
    const sign = String(row?.sign || '').trim();
    if (Number.isInteger(lineIndex) && sign) {
      if (!recurrenceByLine.has(lineIndex)) {
        recurrenceByLine.set(lineIndex, new Map());
      }
      const map = recurrenceByLine.get(lineIndex);
      map.set(sign, (map.get(sign) || 0) + 1);
    }
  }

  let recurrenceHits = 0;
  let recurrenceTotal = 0;
  for (const signMap of recurrenceByLine.values()) {
    recurrenceTotal += 1;
    const hasRepeat = [...signMap.values()].some((count) => count >= 2);
    if (hasRepeat) recurrenceHits += 1;
  }

  const rhymeAffinityScore = topThreeAverages.length > 0
    ? clampUnitInterval(topThreeAverages.reduce((sum, value) => sum + value, 0) / topThreeAverages.length)
    : 0;
  const constellationDensity = densitySamples.length > 0
    ? clampUnitInterval(densitySamples.reduce((sum, value) => sum + value, 0) / densitySamples.length)
    : 0;
  const internalRecurrenceScore = recurrenceTotal > 0
    ? clampUnitInterval(recurrenceHits / recurrenceTotal)
    : 0;
  const phoneticNoveltyScore = noveltySamples.length > 0
    ? clampUnitInterval(noveltySamples.reduce((sum, value) => sum + value, 0) / noveltySamples.length)
    : 0;

  return {
    rhymeAffinityScore,
    constellationDensity,
    internalRecurrenceScore,
    phoneticNoveltyScore,
  };
}
