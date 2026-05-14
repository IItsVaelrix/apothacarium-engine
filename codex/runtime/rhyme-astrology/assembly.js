import { buildConstellationClusters } from '../../core/rhyme-astrology/clustering.js';
import { clampUnitInterval } from '../../core/rhyme-astrology/scoring.js';
import { buildPhoneticSignature } from '../../core/rhyme-astrology/signatures.js';

const TOKEN_REGEX = /[a-z]+(?:'[a-z]+)*/g;
const DEFAULT_MAX_CLUSTERS = 12;

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeText(text) {
  return String(text || '').toLowerCase().match(TOKEN_REGEX) || [];
}

/**
 * @param {number | undefined | null} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

/**
 * @param {number | undefined | null} value
 * @param {number} fallback
 * @returns {number}
 */
function toScoreThreshold(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return clampUnitInterval(fallback);
  return clampUnitInterval(numeric);
}

/**
 * @param {any} value
 * @returns {any}
 */
export function cloneResultPayload(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {import('../../core/rhyme-astrology/types.js').LexiconNode | null | undefined} node
 */
function toResolvedNodePayload(node) {
  if (!node) return null;
  return {
    id: String(node.id || ''),
    token: String(node.token || ''),
    normalized: String(node.normalized || ''),
    endingSignature: String(node.endingSignature || ''),
    onsetSignature: String(node.onsetSignature || ''),
    stressPattern: String(node.stressPattern || ''),
    syllableCount: Number(node.syllableCount) || 0,
    frequencyScore: Number(node.frequencyScore) || 0,
  };
}

/**
 * @param {{
 *   text: string,
 *   tokens: string[],
 *   mode: 'word' | 'line',
 *   resolvedNodes: import('../../core/rhyme-astrology/types.js').LexiconNode[],
 *   compiler?: Record<string, unknown> | null,
 * }} params
 */
export function buildQueryPattern(params) {
  const tokens = Array.isArray(params.tokens) ? params.tokens.map(normalizeToken).filter(Boolean) : [];
  const resolvedNodes = Array.isArray(params.resolvedNodes)
    ? params.resolvedNodes.map(toResolvedNodePayload).filter(Boolean)
    : [];
  const lineEndingSignature = resolvedNodes.length > 0
    ? String(resolvedNodes[resolvedNodes.length - 1]?.endingSignature || '')
    : '';
  const stressContour = resolvedNodes.map((node) => String(node.stressPattern || '')).join('');

  return {
    rawText: String(params.text || ''),
    tokens,
    resolvedNodes,
    ...(params.compiler && typeof params.compiler === 'object'
      ? {
        compiler: params.compiler,
      }
      : {}),
    ...(params.mode === 'line'
      ? {
        lineEndingSignature,
        internalPattern: resolvedNodes
          .map((node) => String(node.endingSignature || ''))
          .filter(Boolean),
        stressContour,
      }
      : {}),
  };
}

/**
 * @param {{
 *   text: string,
 *   mode: string,
 *   limit: number,
 *   minScore: number,
 *   includeConstellations: boolean,
 *   compilerCacheKey?: string | null,
 * }} input
 * @returns {string}
 */
export function buildQueryCacheKey(input) {
  return JSON.stringify({
    text: String(input.text || '').trim().toLowerCase(),
    mode: input.mode === 'line' ? 'line' : 'word',
    limit: toPositiveInteger(input.limit, 25),
    minScore: toScoreThreshold(input.minScore, 0.4),
    includeConstellations: Boolean(input.includeConstellations),
    compilerCacheKey: typeof input.compilerCacheKey === 'string' ? input.compilerCacheKey : '',
  });
}

/**
 * @param {any} value
 * @returns {import('../../core/rhyme-astrology/types.js').PhoneticSignature}
 */
function resolveCandidateSignature(value) {
  if (value?.signature && Array.isArray(value.signature.phonemes)) {
    return value.signature;
  }
  if (Array.isArray(value?.phonemes)) {
    return buildPhoneticSignature(value.phonemes);
  }
  return buildPhoneticSignature([]);
}

/**
 * @param {Array<{
 *   nodeId?: string,
 *   toId?: string,
 *   id?: string,
 *   token?: string,
 *   toToken?: string,
 *   overallScore?: number,
 *   exactRhymeScore?: number,
 *   slantRhymeScore?: number,
 *   vowelMatchScore?: number,
 *   consonantMatchScore?: number,
 *   stressAlignmentScore?: number,
 *   syllableDeltaPenalty?: number,
 *   reasons?: string[],
 *   signature?: import('../../core/rhyme-astrology/types.js').PhoneticSignature,
 *   phonemes?: string[],
 *   frequencyScore?: number,
 * }>} candidates
 * @param {{ limit?: number, minScore?: number }} options
 */
export function rankCandidates(candidates, options = {}) {
  const limit = toPositiveInteger(options.limit, 25);
  const minScore = toScoreThreshold(options.minScore, 0.4);

  const normalized = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const token = normalizeToken(candidate?.token || candidate?.toToken || '');
      const nodeId = String(candidate?.nodeId || candidate?.toId || candidate?.id || '');
      const signature = resolveCandidateSignature(candidate);
      return {
        nodeId,
        token,
        overallScore: clampUnitInterval(candidate?.overallScore),
        exactRhymeScore: clampUnitInterval(candidate?.exactRhymeScore),
        slantRhymeScore: clampUnitInterval(candidate?.slantRhymeScore),
        vowelMatchScore: clampUnitInterval(candidate?.vowelMatchScore),
        consonantMatchScore: clampUnitInterval(candidate?.consonantMatchScore),
        stressAlignmentScore: clampUnitInterval(candidate?.stressAlignmentScore),
        syllableDeltaPenalty: clampUnitInterval(candidate?.syllableDeltaPenalty),
        reasons: Array.isArray(candidate?.reasons)
          ? candidate.reasons.filter((reason) => typeof reason === 'string' && reason.trim())
          : [],
        signature,
        phonemes: Array.isArray(candidate?.phonemes) ? candidate.phonemes : signature.phonemes,
        frequencyScore: Number(candidate?.frequencyScore) || 0,
      };
    })
    .filter((candidate) => candidate.token && candidate.overallScore >= minScore);

  normalized.sort((first, second) => {
    if (second.overallScore !== first.overallScore) {
      return second.overallScore - first.overallScore;
    }
    if (second.exactRhymeScore !== first.exactRhymeScore) {
      return second.exactRhymeScore - first.exactRhymeScore;
    }
    if (second.frequencyScore !== first.frequencyScore) {
      return second.frequencyScore - first.frequencyScore;
    }
    if (first.token !== second.token) {
      return first.token.localeCompare(second.token);
    }
    return first.nodeId.localeCompare(second.nodeId);
  });

  return normalized.slice(0, limit);
}

/**
 * @param {ReturnType<typeof rankCandidates>} rankedCandidates
 */
export function toPublicTopMatches(rankedCandidates) {
  return (Array.isArray(rankedCandidates) ? rankedCandidates : []).map((candidate) => ({
    nodeId: String(candidate.nodeId || ''),
    token: String(candidate.token || ''),
    overallScore: clampUnitInterval(candidate.overallScore),
    reasons: Array.isArray(candidate.reasons) && candidate.reasons.length > 0
      ? candidate.reasons
      : ['weak phonetic affinity'],
  }));
}

/**
 * @param {{
 *   rankedCandidates: ReturnType<typeof rankCandidates>,
 *   includeConstellations: boolean,
 *   indexRepo?: { lookupClustersByEndingSignature?: (endingSignature: string, limit?: number) => any[] } | null,
 *   endingSignature?: string,
 *   maxClusters?: number,
 * }} options
 */
export function assembleConstellations(options) {
  if (!options?.includeConstellations) return [];

  const maxClusters = toPositiveInteger(options.maxClusters, DEFAULT_MAX_CLUSTERS);
  const rankedCandidates = Array.isArray(options.rankedCandidates) ? options.rankedCandidates : [];
  const dynamicConstellations = buildConstellationClusters(
    rankedCandidates.map((candidate) => ({
      nodeId: candidate.nodeId,
      token: candidate.token,
      overallScore: candidate.overallScore,
      signature: candidate.signature,
      phonemes: candidate.phonemes,
    })),
    {
      minScore: 0,
      maxClusters,
    }
  );

  if (dynamicConstellations.length > 0) {
    return dynamicConstellations;
  }

  if (typeof options?.indexRepo?.lookupClustersByEndingSignature !== 'function') {
    return [];
  }

  const endingSignature = String(options.endingSignature || '');
  if (!endingSignature) return [];
  return options.indexRepo.lookupClustersByEndingSignature(endingSignature, maxClusters);
}
