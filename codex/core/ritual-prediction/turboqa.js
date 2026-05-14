/**
 * codex/core/ritual-prediction/turboqa.js
 * 
 * TurboQA: Diagnostic and Validation Layer for TurboQuant Vector Reranking.
 * 
 * Enforces two primary World-Law gates:
 * 1. Vector Fidelity Gate: Overlap with full-precision baseline.
 * 2. World-Law Legality Gate: Compliance with Syntax HMM/Judiciary constraints.
 */

import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.TURBO_QUANT;
export const TURBOQA_MIN_RECALL_OVERLAP = 0.85; // 85% overlap with FP16 baseline required
export const TURBOQA_DEFAULT_TOP_K = 5;

function clampPositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeCandidates(candidates) {
  return Array.isArray(candidates) ? candidates : [];
}

function isIllegalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.legalityScore === 0) return true;
  if (candidate.legal === false || candidate.isLegal === false) return true;

  const legalityLabels = [
    candidate.legality,
    candidate.syntaxLegality,
    candidate.hhmLegality,
    candidate.judiciary?.legality,
    candidate.judiciary?.status,
  ];

  return legalityLabels.some((value) => String(value || '').trim().toLowerCase() === 'illegal');
}

function tokenOf(candidate) {
  return String(candidate?.token || candidate?.word || '').trim().toLowerCase();
}

/**
 * Enforce TurboQA Gates for a set of reranked candidates.
 * 
 * @param {Array<object>} baselineCandidates - Top candidates from full-precision baseline
 * @param {Array<object>} rerankedCandidates - Top candidates from TurboQuant reranker
 * @param {object} options - Validation options
 * @throws {BytecodeError} If any gate is breached
 */
export function enforceTurboQAGates(baselineCandidates, rerankedCandidates, options = {}) {
  const baseline = normalizeCandidates(baselineCandidates);
  const reranked = normalizeCandidates(rerankedCandidates);
  const topK = clampPositiveInteger(options.topK, TURBOQA_DEFAULT_TOP_K);

  // GATE 1: World-Law Legality.
  const illegalCandidates = reranked.slice(0, topK).filter(isIllegalCandidate);

  if (illegalCandidates.length > 0) {
    throw new BytecodeError(
      ERROR_CATEGORIES.LINGUISTIC,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.LINGUISTIC,
      ERROR_CODES.LEGALITY_VIOLATION,
      {
        illegalTokens: illegalCandidates.map(tokenOf).filter(Boolean),
        topK,
        reason: 'TurboQuant promoted one or more candidates flagged as illegal by World-Law.',
      },
    );
  }

  // GATE 2: Vector Fidelity.
  let overlapScore = 1.0;
  const comparisonK = Math.min(topK, baseline.length, reranked.length);

  if (comparisonK > 0) {
    const baselineTopK = new Set(baseline.slice(0, comparisonK).map(tokenOf).filter(Boolean));
    const rerankedTopK = reranked.slice(0, comparisonK).map(tokenOf).filter(Boolean);

    const overlapCount = rerankedTopK.filter((token) => baselineTopK.has(token)).length;
    overlapScore = overlapCount / comparisonK;

    if (overlapScore < TURBOQA_MIN_RECALL_OVERLAP) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE,
        ERROR_SEVERITY.CRIT,
        MOD,
        ERROR_CODES.QUANT_PRECISION_LOSS,
        {
          overlapScore,
          threshold: TURBOQA_MIN_RECALL_OVERLAP,
          topK,
          comparedK: comparisonK,
          baseline: Array.from(baselineTopK),
          actual: rerankedTopK,
          reason: 'TurboQuant precision loss exceeded 15% deviation threshold.',
        },
      );
    }
  }

  return {
    ok: true,
    metrics: {
      overlapScore,
      illegalCount: illegalCandidates.length,
      topK,
      comparedK: comparisonK,
    },
  };
}
