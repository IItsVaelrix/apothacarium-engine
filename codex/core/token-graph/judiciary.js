import { stableTokenCompare } from './types.js';

const DEFAULT_GRAPH_TIE_DELTA = 0.03;

export function rankGraphCandidates(candidates = [], options = {}) {
  const tieDelta = Number.isFinite(Number(options.tieDelta))
    ? Math.max(0, Number(options.tieDelta))
    : DEFAULT_GRAPH_TIE_DELTA;

  return [...(Array.isArray(candidates) ? candidates : [])]
    .filter((candidate) => candidate && typeof candidate.token === 'string')
    .map((candidate) => ({
      ...candidate,
      arbitrationScore:
        (Number(candidate.totalScore) || 0)
        + ((Number(candidate.pathCoherence) || 0) * 0.04)
        + ((Number(candidate.connectedness) || 0) * 0.03)
        + ((Number(candidate.legalityScore) || 0) * 0.03),
    }))
    .sort((candidateA, candidateB) => {
      if ((candidateB.arbitrationScore || 0) !== (candidateA.arbitrationScore || 0)) {
        return (candidateB.arbitrationScore || 0) - (candidateA.arbitrationScore || 0);
      }
      if (Math.abs((candidateB.totalScore || 0) - (candidateA.totalScore || 0)) > tieDelta) {
        return (candidateB.totalScore || 0) - (candidateA.totalScore || 0);
      }
      if ((candidateB.connectedness || 0) !== (candidateA.connectedness || 0)) {
        return (candidateB.connectedness || 0) - (candidateA.connectedness || 0);
      }
      if ((candidateB.pathCoherence || 0) !== (candidateA.pathCoherence || 0)) {
        return (candidateB.pathCoherence || 0) - (candidateA.pathCoherence || 0);
      }
      return stableTokenCompare(candidateA.token, candidateB.token);
    });
}

export function arbitrateGraphCandidates(candidates = [], options = {}) {
  const ranked = rankGraphCandidates(candidates, options);
  return ranked[0] || null;
}
