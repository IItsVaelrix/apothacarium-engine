import { createHash } from 'crypto';
import { buildPhoneticSignature } from '../../core/rhyme-astrology/signatures.js';
import { clampUnitInterval } from '../../core/rhyme-astrology/scoring.js';
import { scoreNodeSimilarity } from '../../core/rhyme-astrology/similarity.js';
import { compileVerseToIR } from '../../core/shared/truesight/compiler/compileVerseToIR.js';
import { normalizeVowelFamily } from '../../core/phonology/vowelFamily.js';
import {
  assembleConstellations,
  buildQueryCacheKey,
  buildQueryPattern,
  cloneResultPayload,
  normalizeToken,
  rankCandidates,
  toPublicTopMatches,
  tokenizeText,
} from './assembly.js';
import { createRhymeAstrologyCache } from './cache.js';

const DEFAULT_LIMIT = 25;
const DEFAULT_MIN_SCORE = 0.4;
const DEFAULT_BUCKET_CANDIDATE_CAP = 200;
const DEFAULT_MAX_CLUSTERS = 12;

const EMPTY_LEXICON_REPO = Object.freeze({
  lookupNodeByNormalized: () => null,
  lookupNodesByNormalizedBatch: () => ({}),
  close: () => {},
});

const EMPTY_INDEX_REPO = Object.freeze({
  lookupHotEdges: () => [],
  lookupBucketMembers: () => [],
  lookupClustersByEndingSignature: () => [],
  close: () => {},
});

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
function toScore(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return clampUnitInterval(fallback);
  return clampUnitInterval(numeric);
}

/**
 * @returns {bigint}
 */
function nowNs() {
  return process.hrtime.bigint();
}

/**
 * @param {bigint} startNs
 * @returns {number}
 */
function durationMs(startNs) {
  return Number((process.hrtime.bigint() - startNs) / 1000000n);
}

/**
 * @param {any} value
 * @returns {number | null}
 */
function toIntegerOrNull(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

/**
 * @param {any} node
 * @param {string} fallbackToken
 */
function toRuntimeNode(node, fallbackToken) {
  const token = normalizeToken(node?.token || fallbackToken);
  const normalized = normalizeToken(node?.normalized || token);
  const phonemes = Array.isArray(node?.phonemes) ? node.phonemes : [];
  const signature = node?.signature && Array.isArray(node.signature.phonemes)
    ? node.signature
    : buildPhoneticSignature(phonemes);

  return {
    id: String(node?.id || ''),
    token,
    normalized,
    phonemes: signature.phonemes,
    stressPattern: String(node?.stressPattern || signature.stressPattern || ''),
    syllableCount: Number(node?.syllableCount) || signature.syllableCount,
    vowelSkeleton: Array.isArray(node?.vowelSkeleton)
      ? node.vowelSkeleton
      : signature.vowelSkeleton,
    consonantSkeleton: Array.isArray(node?.consonantSkeleton)
      ? node.consonantSkeleton
      : signature.consonantSkeleton,
    endingSignature: String(node?.endingSignature || signature.endingSignature || ''),
    onsetSignature: String(node?.onsetSignature || signature.onsetSignature || ''),
    frequencyScore: Number(node?.frequencyScore) || 0,
    signature,
  };
}

/**
 * @param {any} token
 * @param {any} lexiconNode
 * @returns {import('../../core/rhyme-astrology/types.js').PhoneticSignature}
 */
function buildVerseTokenSignature(token, lexiconNode = null) {
  const hasTokenPhonemes = Array.isArray(token?.phonemes) && token.phonemes.length > 0;
  const phonemes = hasTokenPhonemes
    ? token.phonemes
    : (Array.isArray(lexiconNode?.phonemes) ? lexiconNode.phonemes : []);
  const derived = buildPhoneticSignature(phonemes);
  return {
    ...derived,
    endingSignature: String(
      (hasTokenPhonemes ? token?.rhymeTailSignature : null)
      || lexiconNode?.endingSignature
      || token?.rhymeTailSignature
      || derived.endingSignature
      || ''
    ),
    onsetSignature: String(
      (hasTokenPhonemes ? token?.onsetSignature : null)
      || lexiconNode?.onsetSignature
      || token?.onsetSignature
      || derived.onsetSignature
      || ''
    ),
    stressPattern: String(
      (hasTokenPhonemes ? token?.stressPattern : null)
      || lexiconNode?.stressPattern
      || token?.stressPattern
      || derived.stressPattern
      || ''
    ),
    syllableCount: Number(hasTokenPhonemes ? token?.syllableCount : null)
      || Number(lexiconNode?.syllableCount)
      || Number(token?.syllableCount)
      || derived.syllableCount,
  };
}

/**
 * @param {any} token
 * @param {any} lexiconNode
 */
function toRuntimeNodeFromVerseToken(token, lexiconNode = null) {
  const signature = buildVerseTokenSignature(token, lexiconNode);
  const tokenText = normalizeToken(token?.text || lexiconNode?.token || '');
  const normalized = normalizeToken(token?.normalized || lexiconNode?.normalized || tokenText);
  return {
    id: String(lexiconNode?.id || ''),
    token: tokenText,
    normalized,
    phonemes: signature.phonemes,
    stressPattern: signature.stressPattern,
    syllableCount: signature.syllableCount,
    vowelSkeleton: signature.vowelSkeleton,
    consonantSkeleton: signature.consonantSkeleton,
    endingSignature: signature.endingSignature,
    onsetSignature: signature.onsetSignature,
    frequencyScore: Number(lexiconNode?.frequencyScore) || 0,
    signature,
    verseTokenId: toIntegerOrNull(token?.id),
    primaryStressedVowelFamily: normalizeVowelFamily(token?.primaryStressedVowelFamily)
      || normalizeVowelFamily(lexiconNode?.primaryStressedVowelFamily)
      || extractSignatureVowelFamily(signature),
    terminalVowelFamily: normalizeVowelFamily(token?.terminalVowelFamily)
      || normalizeVowelFamily(lexiconNode?.terminalVowelFamily)
      || extractSignatureVowelFamily(signature),
  };
}

/**
 * @param {import('../../core/rhyme-astrology/types.js').PhoneticSignature} signature
 * @returns {string | null}
 */
function extractSignatureVowelFamily(signature) {
  const vowels = Array.isArray(signature?.vowelSkeleton) ? signature.vowelSkeleton : [];
  for (let index = vowels.length - 1; index >= 0; index -= 1) {
    const family = normalizeVowelFamily(vowels[index]);
    if (family) return family;
  }
  return null;
}

/**
 * @param {import('../../core/phonology/phoneme.engine.js').PhonemeEngine} phonemeEngine
 * @param {string} token
 */
function buildTransientNode(phonemeEngine, token) {
  let deep = null;
  try {
    deep = phonemeEngine?.analyzeDeep?.(token) || null;
  } catch {
    deep = null;
  }

  const signature = buildPhoneticSignature(deep?.phonemes || []);
  return {
    id: '',
    token,
    normalized: token,
    phonemes: signature.phonemes,
    stressPattern: signature.stressPattern,
    syllableCount: signature.syllableCount,
    vowelSkeleton: signature.vowelSkeleton,
    consonantSkeleton: signature.consonantSkeleton,
    endingSignature: signature.endingSignature,
    onsetSignature: signature.onsetSignature,
    frequencyScore: 0,
    signature,
  };
}

/**
 * @param {Array<ReturnType<typeof toRuntimeNode> | ReturnType<typeof toRuntimeNodeFromVerseToken>>} resolvedNodes
 * @param {ReturnType<typeof toRuntimeNode> | ReturnType<typeof toRuntimeNodeFromVerseToken>} anchorNode
 * @param {Array<any>} [activeWindows]
 */
function buildCompilerBoostContext(resolvedNodes, anchorNode, activeWindows = []) {
  const internalEndingSignatures = new Set();
  const internalOnsets = new Set();
  const stressedFamilies = new Set();
  const windowSyllableLengths = new Set();
  for (const node of resolvedNodes) {
    if (!node) continue;
    if (node.endingSignature && node.endingSignature !== anchorNode.endingSignature) {
      internalEndingSignatures.add(node.endingSignature);
    }
    if (node.onsetSignature && node.onsetSignature !== anchorNode.onsetSignature) {
      internalOnsets.add(node.onsetSignature);
    }
    const family = node.primaryStressedVowelFamily
      || node.terminalVowelFamily
      || extractSignatureVowelFamily(node.signature);
    if (family) stressedFamilies.add(family);
  }
  for (const window of Array.isArray(activeWindows) ? activeWindows : []) {
    const syllableLength = Number(window?.syllableLength);
    if (Number.isInteger(syllableLength) && syllableLength > 0) {
      windowSyllableLengths.add(syllableLength);
    }
    const vowelSequence = Array.isArray(window?.vowelSequence) ? window.vowelSequence : [];
    for (const value of vowelSequence) {
      const family = normalizeVowelFamily(value);
      if (family) stressedFamilies.add(family);
    }
  }
  return {
    internalEndingSignatures,
    internalOnsets,
    stressedFamilies,
    windowSyllableLengths,
  };
}

/**
 * @param {Array<any>} candidates
 * @param {{
 *   internalEndingSignatures: Set<string>,
 *   internalOnsets: Set<string>,
 *   stressedFamilies: Set<string>,
 *   windowSyllableLengths: Set<number>,
 * }} lineContext
 */
function applyCompilerContextBoost(candidates, lineContext) {
  return candidates.map((candidate) => {
    const signature = candidate.signature || buildPhoneticSignature(candidate.phonemes || []);
    const reasons = Array.isArray(candidate.reasons) ? [...candidate.reasons] : [];
    let boostedScore = clampUnitInterval(candidate.overallScore);

    if (
      signature.endingSignature &&
      lineContext.internalEndingSignatures.has(signature.endingSignature)
    ) {
      boostedScore = clampUnitInterval(boostedScore + 0.03);
      reasons.push('strong line-ending rhyme affinity');
    }

    if (
      signature.onsetSignature &&
      lineContext.internalOnsets.has(signature.onsetSignature)
    ) {
      boostedScore = clampUnitInterval(boostedScore + 0.02);
      reasons.push('mirrored onset with internal pattern');
    }

    const family = extractSignatureVowelFamily(signature);
    if (family && lineContext.stressedFamilies.has(family)) {
      boostedScore = clampUnitInterval(boostedScore + 0.02);
      reasons.push('shares stressed vowel family with local verse context');
    }

    if (lineContext.windowSyllableLengths.has(Number(signature?.syllableCount) || 0)) {
      boostedScore = clampUnitInterval(boostedScore + 0.015);
      reasons.push('matches active syllable window length');
    }

    return {
      ...candidate,
      overallScore: boostedScore,
      reasons,
      signature,
    };
  });
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function toBoolean(value) {
  return value === true;
}

/**
 * Creates a runtime query engine for rhyme-astrology requests.
 * @param {{
 *   lexiconRepo?: any,
 *   indexRepo?: any,
 *   phonemeEngine?: any,
 *   cache?: ReturnType<typeof createRhymeAstrologyCache>,
 *   cacheSize?: number,
 *   bucketCandidateCap?: number,
 *   maxClusters?: number,
 *   log?: any,
 * }} [options]
 */
export function createRhymeAstrologyQueryEngine(options = {}) {
  const lexiconRepo = options.lexiconRepo || EMPTY_LEXICON_REPO;
  const indexRepo = options.indexRepo || EMPTY_INDEX_REPO;
  const phonemeEngine = options.phonemeEngine || null;
  const cache = options.cache || createRhymeAstrologyCache({
    maxEntries: toPositiveInteger(options.cacheSize, 500),
  });
  const bucketCandidateCap = toPositiveInteger(
    options.bucketCandidateCap,
    DEFAULT_BUCKET_CANDIDATE_CAP
  );
  const maxClusters = toPositiveInteger(options.maxClusters, DEFAULT_MAX_CLUSTERS);
  const log = options.log ?? console;

  let phonemeInitPromise = null;
  async function ensurePhonemeReady() {
    if (!phonemeEngine) return;
    if (phonemeInitPromise) {
      await phonemeInitPromise;
      return;
    }

    if (typeof phonemeEngine.ensureInitialized === 'function') {
      phonemeInitPromise = Promise.resolve(phonemeEngine.ensureInitialized());
    } else if (typeof phonemeEngine.init === 'function') {
      phonemeInitPromise = Promise.resolve(phonemeEngine.init());
    } else {
      phonemeInitPromise = Promise.resolve();
    }
    await phonemeInitPromise;
  }

  /**
   * @param {any} verseIR
   * @param {number} anchorTokenId
   * @returns {number[]}
   */
  function inferActiveWindowIds(verseIR, anchorTokenId) {
    const windows = Array.isArray(verseIR?.syllableWindows) ? verseIR.syllableWindows : [];
    if (!Number.isInteger(anchorTokenId)) return [];
    return windows
      .filter((window) => {
        const tokenSpan = Array.isArray(window?.tokenSpan) ? window.tokenSpan : [];
        return tokenSpan.length === 2
          && Number(tokenSpan[0]) <= anchorTokenId
          && anchorTokenId <= Number(tokenSpan[1]);
      })
      .map((window) => Number(window.id))
      .filter(Number.isInteger)
      .slice(0, 6);
  }

  /**
   * @param {any} verseIR
   * @param {{
   *   text: string,
   *   mode: 'word' | 'line',
   *   anchorTokenId?: number,
   *   anchorLineIndex?: number,
   *   anchorWindowIds?: number[],
   * }} input
   */
  function buildCompilerContext(verseIR, input) {
    if (!verseIR || !Array.isArray(verseIR.tokens) || verseIR.tokens.length === 0) {
      return null;
    }

    const tokens = verseIR.tokens;
    const lines = Array.isArray(verseIR.lines) ? verseIR.lines : [];
    const tokenById = new Map(
      tokens
        .map((token) => [Number(token?.id), token])
        .filter(([tokenId]) => Number.isInteger(tokenId))
    );
    let anchorTokenId = Number.isInteger(Number(input?.anchorTokenId))
      ? Number(input.anchorTokenId)
      : null;
    let anchorLineIndex = Number.isInteger(Number(input?.anchorLineIndex))
      ? Number(input.anchorLineIndex)
      : null;

    if (anchorTokenId !== null && !tokenById.has(anchorTokenId)) {
      anchorTokenId = null;
    }

    if (anchorLineIndex === null && anchorTokenId !== null) {
      anchorLineIndex = Number(tokenById.get(anchorTokenId)?.lineIndex);
    }

    if (input.mode === 'line') {
      if (anchorLineIndex === null) {
        const fallbackLine = [...lines].reverse().find((line) => Array.isArray(line?.tokenIds) && line.tokenIds.length > 0);
        anchorLineIndex = Number.isInteger(Number(fallbackLine?.lineIndex))
          ? Number(fallbackLine.lineIndex)
          : null;
      }
      if (anchorTokenId === null && anchorLineIndex !== null) {
        const anchorLine = lines.find((line) => Number(line?.lineIndex) === anchorLineIndex) || null;
        const lineTokenIds = Array.isArray(anchorLine?.tokenIds) ? anchorLine.tokenIds : [];
        if (lineTokenIds.length > 0) {
          anchorTokenId = Number(lineTokenIds[lineTokenIds.length - 1]);
        }
      }
    } else {
      if (anchorTokenId === null) {
        anchorTokenId = Number(tokens[tokens.length - 1]?.id);
      }
      if (anchorLineIndex === null && anchorTokenId !== null) {
        anchorLineIndex = Number(tokenById.get(anchorTokenId)?.lineIndex);
      }
    }

    if (anchorTokenId !== null && !tokenById.has(anchorTokenId)) {
      anchorTokenId = null;
    }

    const activeTokens = input.mode === 'line'
      ? tokens.filter((token) => Number(token?.lineIndex) === anchorLineIndex)
      : (anchorTokenId !== null && tokenById.has(anchorTokenId) ? [tokenById.get(anchorTokenId)] : []);
    const activeTokenIds = activeTokens
      .map((token) => Number(token?.id))
      .filter(Number.isInteger);
    const requestedWindowIds = Array.isArray(input?.anchorWindowIds)
      ? input.anchorWindowIds.map(Number).filter((id) => Number.isInteger(id) && verseIR.syllableWindows?.[id])
      : [];
    const activeWindowIds = requestedWindowIds.length > 0
      ? requestedWindowIds
      : inferActiveWindowIds(verseIR, anchorTokenId);
    const activeWindows = activeWindowIds
      .map((id) => verseIR.syllableWindows?.[id] || null)
      .filter(Boolean);

    return {
      verseIR,
      source: input?.verseIR ? 'provided' : 'compiled',
      anchorTokenId,
      anchorLineIndex,
      activeTokens,
      activeTokenIds,
      activeWindowIds,
      activeWindows,
    };
  }

  /**
   * @param {ReturnType<typeof buildCompilerContext>} compilerContext
   * @returns {string}
   */
  function buildCompilerCacheKey(compilerContext) {
    if (!compilerContext?.verseIR) return '';
    return createHash('sha1')
      .update(JSON.stringify({
        rawText: String(compilerContext.verseIR.rawText || ''),
        version: String(compilerContext.verseIR.version || ''),
        source: compilerContext.source,
        anchorTokenId: compilerContext.anchorTokenId,
        anchorLineIndex: compilerContext.anchorLineIndex,
        activeTokenIds: compilerContext.activeTokenIds,
        activeWindowIds: compilerContext.activeWindowIds,
      }))
      .digest('hex');
  }

  /**
   * @param {ReturnType<typeof buildCompilerContext>} compilerContext
   */
  function buildCompilerDescriptor(compilerContext) {
    if (!compilerContext?.verseIR) return null;
    const metadata = compilerContext.verseIR.metadata || {};
    const tokens = Array.isArray(compilerContext.verseIR.tokens) ? compilerContext.verseIR.tokens : [];
    const lines = Array.isArray(compilerContext.verseIR.lines) ? compilerContext.verseIR.lines : [];
    const syllableWindows = Array.isArray(compilerContext.verseIR.syllableWindows)
      ? compilerContext.verseIR.syllableWindows
      : [];
    return {
      verseIRVersion: String(compilerContext.verseIR.version || ''),
      mode: String(metadata.mode || 'balanced'),
      tokenCount: Number(metadata.tokenCount) || tokens.length,
      lineCount: Number(metadata.lineCount) || lines.length,
      maxWindowSyllables: Number(metadata.maxWindowSyllables) || undefined,
      maxWindowTokenSpan: Number(metadata.maxWindowTokenSpan) || undefined,
      syllableWindowCount: Number(metadata.syllableWindowCount) || syllableWindows.length,
      lineBreakStyle: String(metadata.lineBreakStyle || 'none'),
      offsetSemantics: metadata.offsetSemantics ? String(metadata.offsetSemantics) : undefined,
      graphemeAware: typeof metadata.graphemeAware === 'boolean' ? metadata.graphemeAware : undefined,
      graphemeCount: Number(metadata.graphemeCount) || undefined,
      whitespaceFidelity: Boolean(metadata.whitespaceFidelity),
      source: compilerContext.source,
      anchorTokenId: compilerContext.anchorTokenId,
      anchorLineIndex: compilerContext.anchorLineIndex,
      activeTokenIds: [...compilerContext.activeTokenIds],
      activeWindowIds: [...compilerContext.activeWindowIds],
    };
  }

  /**
   * @param {string[]} tokens
   * @returns {Promise<Array<ReturnType<typeof toRuntimeNode>>>}
   */
  async function resolveNodes(tokens) {
    const normalizedTokens = tokens.map(normalizeToken).filter(Boolean);
    if (normalizedTokens.length === 0) return [];

    await ensurePhonemeReady();
    const batchLookup = typeof lexiconRepo.lookupNodesByNormalizedBatch === 'function'
      ? await Promise.resolve(lexiconRepo.lookupNodesByNormalizedBatch(normalizedTokens))
      : {};

    const byToken = batchLookup && typeof batchLookup === 'object' ? batchLookup : {};
    const resolved = [];
    for (const token of normalizedTokens) {
      let node = byToken[token] || null;
      if (!node && typeof lexiconRepo.lookupNodeByNormalized === 'function') {
        node = await Promise.resolve(lexiconRepo.lookupNodeByNormalized(token));
      }
      if (!node) {
        node = buildTransientNode(phonemeEngine, token);
      }
      resolved.push(toRuntimeNode(node, token));
    }

    return resolved;
  }

  /**
   * @param {any[]} verseTokens
   * @returns {Promise<Array<ReturnType<typeof toRuntimeNodeFromVerseToken>>>}
   */
  async function resolveVerseTokens(verseTokens) {
    const normalizedTokens = (Array.isArray(verseTokens) ? verseTokens : [])
      .map((token) => normalizeToken(token?.normalized || token?.text))
      .filter(Boolean);
    if (normalizedTokens.length === 0) return [];

    await ensurePhonemeReady();
    const batchLookup = typeof lexiconRepo.lookupNodesByNormalizedBatch === 'function'
      ? await Promise.resolve(lexiconRepo.lookupNodesByNormalizedBatch(normalizedTokens))
      : {};
    const byToken = batchLookup && typeof batchLookup === 'object' ? batchLookup : {};

    return verseTokens.map((token) => {
      const normalized = normalizeToken(token?.normalized || token?.text);
      let lexiconNode = byToken[normalized] || null;
      if (!lexiconNode && typeof lexiconRepo.lookupNodeByNormalized === 'function') {
        lexiconNode = lexiconRepo.lookupNodeByNormalized(normalized);
      }
      return toRuntimeNodeFromVerseToken(token, lexiconNode);
    });
  }

  /**
   * @param {ReturnType<typeof toRuntimeNode>} anchorNode
   * @param {number} fetchLimit
   */
  function collectHotEdgeCandidates(anchorNode, fetchLimit) {
    if (!anchorNode.id || typeof indexRepo.lookupHotEdges !== 'function') {
      return null;
    }

    const hotEdges = indexRepo.lookupHotEdges(anchorNode.id, fetchLimit);
    if (!Array.isArray(hotEdges) || hotEdges.length === 0) {
      return null;
    }

    const bucketMembers = anchorNode.endingSignature && typeof indexRepo.lookupBucketMembers === 'function'
      ? indexRepo.lookupBucketMembers(anchorNode.endingSignature, bucketCandidateCap)
      : [];
    const memberById = new Map(
      (Array.isArray(bucketMembers) ? bucketMembers : [])
        .filter((member) => member?.id)
        .map((member) => [String(member.id), member])
    );

    const candidates = hotEdges.map((edge) => {
      const member = memberById.get(String(edge.toId || edge.nodeId || '')) || null;
      const runtimeNode = member
        ? toRuntimeNode(member, edge.toToken || edge.token || '')
        : buildTransientNode(phonemeEngine, normalizeToken(edge.toToken || edge.token || ''));
      return {
        nodeId: String(edge.toId || edge.nodeId || ''),
        token: normalizeToken(edge.toToken || edge.token || runtimeNode.token),
        overallScore: clampUnitInterval(edge.overallScore),
        exactRhymeScore: clampUnitInterval(edge.exactRhymeScore),
        slantRhymeScore: clampUnitInterval(edge.slantRhymeScore),
        vowelMatchScore: clampUnitInterval(edge.vowelMatchScore),
        consonantMatchScore: clampUnitInterval(edge.consonantMatchScore),
        stressAlignmentScore: clampUnitInterval(edge.stressAlignmentScore),
        syllableDeltaPenalty: clampUnitInterval(edge.syllableDeltaPenalty),
        reasons: Array.isArray(edge.reasons) ? edge.reasons : [],
        signature: runtimeNode.signature,
        phonemes: runtimeNode.phonemes,
        frequencyScore: runtimeNode.frequencyScore,
      };
    });

    return {
      candidates,
      candidateCount: hotEdges.length,
    };
  }

  /**
   * @param {ReturnType<typeof toRuntimeNode>} anchorNode
   */
  function collectBucketCandidates(anchorNode) {
    if (!anchorNode.endingSignature || typeof indexRepo.lookupBucketMembers !== 'function') {
      return {
        candidates: [],
        candidateCount: 0,
      };
    }

    const bucketMembers = indexRepo.lookupBucketMembers(
      anchorNode.endingSignature,
      bucketCandidateCap + 1
    );
    const normalizedBucket = Array.isArray(bucketMembers)
      ? bucketMembers.map((member) => toRuntimeNode(member, member?.token || ''))
      : [];

    const filtered = normalizedBucket.filter((member) => {
      if (anchorNode.id && member.id && anchorNode.id === member.id) return false;
      if (!anchorNode.id && member.token === anchorNode.token) return false;
      return true;
    }).slice(0, bucketCandidateCap);

    const candidates = [];
    for (const candidateNode of filtered) {
      const edge = scoreNodeSimilarity(anchorNode, candidateNode);
      candidates.push({
        nodeId: candidateNode.id,
        token: candidateNode.token,
        overallScore: edge.overallScore,
        exactRhymeScore: edge.exactRhymeScore,
        slantRhymeScore: edge.slantRhymeScore,
        vowelMatchScore: edge.vowelMatchScore,
        consonantMatchScore: edge.consonantMatchScore,
        stressAlignmentScore: edge.stressAlignmentScore,
        syllableDeltaPenalty: edge.syllableDeltaPenalty,
        reasons: edge.reasons || [],
        signature: candidateNode.signature,
        phonemes: candidateNode.phonemes,
        frequencyScore: candidateNode.frequencyScore,
      });
    }

    return {
      candidates,
      candidateCount: filtered.length,
    };
  }

  /**
   * @param {{
   *   text: string,
   *   mode?: 'word' | 'line',
   *   limit?: number,
   *   minScore?: number,
   *   includeConstellations?: boolean,
   *   includeDiagnostics?: boolean,
   * }} input
   */
  async function query(input) {
    const startedAtNs = nowNs();
    const text = String(input?.text || '');
    const mode = input?.mode === 'line' ? 'line' : 'word';
    const limit = toPositiveInteger(input?.limit, DEFAULT_LIMIT);
    const minScore = toScore(input?.minScore, DEFAULT_MIN_SCORE);
    const includeConstellations = input?.includeConstellations !== false;
    const includeDiagnostics = input?.includeDiagnostics !== false;
    const shouldUseCompiler = Boolean(input?.verseIR)
      || mode === 'line'
      || Number.isInteger(Number(input?.anchorTokenId))
      || Number.isInteger(Number(input?.anchorLineIndex))
      || (Array.isArray(input?.anchorWindowIds) && input.anchorWindowIds.length > 0);

    let compilerContext = null;
    if (shouldUseCompiler && text.trim()) {
      await ensurePhonemeReady();
      const verseIR = input?.verseIR || compileVerseToIR(text, {
        phonemeEngine,
        mode: mode === 'line' ? 'balanced' : 'live_fast',
      });
      compilerContext = buildCompilerContext(verseIR, {
        ...input,
        text,
        mode,
      });
    }
    const compilerDescriptor = buildCompilerDescriptor(compilerContext);
    const compilerCacheKey = buildCompilerCacheKey(compilerContext);

    const cacheKey = buildQueryCacheKey({
      text,
      mode,
      limit,
      minScore,
      includeConstellations,
      compilerCacheKey,
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      const payload = cloneResultPayload(cached);
      payload.diagnostics = {
        ...payload.diagnostics,
        cacheHit: true,
        queryTimeMs: durationMs(startedAtNs),
      };
      return payload;
    }

    const allTokens = tokenizeText(text);
    let queryTokens = mode === 'line'
      ? allTokens
      : (allTokens.length > 0 ? [allTokens[allTokens.length - 1]] : []);
    let resolvedNodes = [];
    let anchorNode = null;
    let compilerBoostContext = null;

    if (compilerContext?.activeTokens?.length > 0) {
      queryTokens = compilerContext.activeTokens
        .map((token) => normalizeToken(token?.text))
        .filter(Boolean);
      resolvedNodes = await resolveVerseTokens(compilerContext.activeTokens);
      anchorNode = compilerContext.anchorTokenId !== null
        ? resolvedNodes.find((node) => node.verseTokenId === compilerContext.anchorTokenId) || null
        : null;
      if (!anchorNode) {
        anchorNode = resolvedNodes[resolvedNodes.length - 1] || null;
      }
      if (anchorNode) {
        compilerBoostContext = buildCompilerBoostContext(
          resolvedNodes,
          anchorNode,
          compilerContext.activeWindows
        );
      }
    }

    if (queryTokens.length === 0) {
      const emptyResult = {
        query: buildQueryPattern({
          text,
          mode,
          tokens: [],
          resolvedNodes: [],
          compiler: compilerDescriptor,
        }),
        topMatches: [],
        constellations: [],
        diagnostics: {
          queryTimeMs: durationMs(startedAtNs),
          cacheHit: false,
          candidateCount: 0,
        },
      };
      cache.set(cacheKey, {
        ...cloneResultPayload(emptyResult),
        diagnostics: {
          ...emptyResult.diagnostics,
          queryTimeMs: 0,
          cacheHit: false,
        },
      });
      return emptyResult;
    }

    if (!anchorNode) {
      resolvedNodes = await resolveNodes(queryTokens);
      anchorNode = resolvedNodes[resolvedNodes.length - 1];
      if (mode === 'line' && anchorNode) {
        compilerBoostContext = buildCompilerBoostContext(resolvedNodes, anchorNode, []);
      }
    }
    if (!anchorNode) {
      throw new Error('Failed to resolve anchor node for rhyme astrology query.');
    }

    let candidateEnvelope = collectHotEdgeCandidates(anchorNode, Math.max(limit * 3, limit));
    if (!candidateEnvelope) {
      candidateEnvelope = collectBucketCandidates(anchorNode);
    }

    let scoredCandidates = Array.isArray(candidateEnvelope.candidates)
      ? candidateEnvelope.candidates
      : [];
    if (compilerBoostContext) {
      scoredCandidates = applyCompilerContextBoost(scoredCandidates, compilerBoostContext);
    }

    const rankedCandidates = rankCandidates(scoredCandidates, { limit, minScore });
    const topMatches = toPublicTopMatches(rankedCandidates);
    const constellations = assembleConstellations({
      rankedCandidates,
      includeConstellations: toBoolean(includeConstellations),
      indexRepo,
      endingSignature: anchorNode.endingSignature,
      maxClusters,
    });

    const diagnostics = {
      queryTimeMs: durationMs(startedAtNs),
      cacheHit: false,
      candidateCount: Number(candidateEnvelope.candidateCount) || 0,
    };

    const result = {
      query: buildQueryPattern({
        text,
        mode,
        tokens: queryTokens,
        resolvedNodes,
        compiler: compilerDescriptor,
      }),
      topMatches,
      constellations: includeConstellations ? constellations : [],
      diagnostics: includeDiagnostics
        ? diagnostics
        : {
          queryTimeMs: diagnostics.queryTimeMs,
          cacheHit: diagnostics.cacheHit,
          candidateCount: diagnostics.candidateCount,
        },
    };

    cache.set(cacheKey, {
      ...cloneResultPayload(result),
      diagnostics: {
        ...result.diagnostics,
        queryTimeMs: 0,
        cacheHit: false,
      },
    });

    return result;
  }

  function clearCache() {
    cache.clear();
  }

  function close() {
    try {
      lexiconRepo.close?.();
    } catch (error) {
      log?.warn?.({ err: error }, '[RhymeAstrologyQueryEngine] Failed to close lexicon repo.');
    }
    try {
      indexRepo.close?.();
    } catch (error) {
      log?.warn?.({ err: error }, '[RhymeAstrologyQueryEngine] Failed to close index repo.');
    }
  }

  return {
    query,
    clearCache,
    close,
    __unsafe: {
      cache,
      lexiconRepo,
      indexRepo,
    },
  };
}
