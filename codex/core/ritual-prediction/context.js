import {
  DEFAULT_TOKEN_GRAPH_LIMITS,
  normalizeGraphToken,
  normalizeSchoolId,
} from '../token-graph/types.js';
import { compileVerseToIR } from '../shared/truesight/compiler/compileVerseToIR.js';

function clampPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function clampPositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function normalizeTokenList(values) {
  const seen = new Set();
  const tokens = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeGraphToken(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    tokens.push(normalized);
  });

  return tokens;
}

function normalizeAnchorTokens(values, defaultWeight = 0.6) {
  const anchorWeights = new Map();

  (Array.isArray(values) ? values : []).forEach((value) => {
    if (typeof value === 'string') {
      const token = normalizeGraphToken(value);
      if (!token) return;
      anchorWeights.set(token, Math.max(anchorWeights.get(token) || 0, defaultWeight));
      return;
    }

    if (!value || typeof value !== 'object') return;
    const token = normalizeGraphToken(value.token);
    if (!token) return;
    const weight = clampPositiveNumber(value.weight, defaultWeight);
    anchorWeights.set(token, Math.max(anchorWeights.get(token) || 0, weight));
  });

  return [...anchorWeights.entries()]
    .map(([token, weight]) => ({ token, weight }))
    .sort((entryA, entryB) => {
      if (entryB.weight !== entryA.weight) return entryB.weight - entryA.weight;
      return entryA.token.localeCompare(entryB.token);
    });
}

function deriveLineAnchors(currentLineWords, verseIRState) {
  const derived = [];

  const normalizedLineWords = normalizeTokenList(currentLineWords);
  normalizedLineWords.slice(-3).forEach((token, index) => {
    derived.push({
      token,
      weight: Math.max(0.5, 0.68 - (index * 0.06)),
    });
  });

  const verseLine = verseIRState?.currentLine;
  (Array.isArray(verseLine?.anchorWords) ? verseLine.anchorWords : []).forEach((token) => {
    derived.push({
      token,
      weight: verseLine?.repeatedWindowCount > 0 ? 0.72 : 0.6,
    });
  });

  return derived;
}

function deriveLineEndToken(request, verseIRState) {
  return normalizeGraphToken(
    request.lineEndToken
    || request.prevLineEndWord
    || verseIRState?.previousLineEnd?.normalizedWord
    || verseIRState?.previousLineEnd?.word
    || null
  );
}

export function createRitualPredictionContext(request = {}, options = {}) {
  // Phase 2: VerseIR-first context binding
  // Allow passing raw text to be compiled if VerseIR is not provided.
  // Note: buildPlsVerseIRBridge is a conceptual bridge for language server environments;
  // here we ensure the core IR is always available as the authoritative substrate.
  let verseIRState = request.verseIRState && typeof request.verseIRState === 'object'
    ? request.verseIRState
    : null;

  if (!verseIRState && typeof request.rawVerseText === 'string') {
    verseIRState = compileVerseToIR(request.rawVerseText, { 
      phonemeEngine: options.phonemeEngine 
    });
  }

  const currentLineWords = normalizeTokenList(
    request.currentLineWords || verseIRState?.currentLine?.tokens?.map(t => t.word) || []
  );

  return {
    prefix: normalizeGraphToken(request.prefix),
    currentToken: normalizeGraphToken(request.currentToken),
    prevToken: normalizeGraphToken(
      request.prevToken
      || request.prevWord
      || currentLineWords.at(-1)
      || null
    ),
    lineEndToken: deriveLineEndToken(request, verseIRState),
    currentLineWords,
    currentSchool: normalizeSchoolId(request.currentSchool || null) || null,
    syntaxContext: request.syntaxContext || null,
    verseIRState,
    anchorTokens: normalizeAnchorTokens([
      ...deriveLineAnchors(currentLineWords, verseIRState),
      ...(Array.isArray(request.anchorTokens) ? request.anchorTokens : []),
    ]),
    decay: clampPositiveNumber(
      options.decay ?? request.decay,
      DEFAULT_TOKEN_GRAPH_LIMITS.decay,
    ),
    maxDepth: clampPositiveInteger(
      options.maxDepth ?? request.maxDepth,
      DEFAULT_TOKEN_GRAPH_LIMITS.maxDepth,
    ),
    maxFanout: clampPositiveInteger(
      options.maxFanout ?? request.maxFanout,
      DEFAULT_TOKEN_GRAPH_LIMITS.maxFanout,
    ),
    maxCandidates: clampPositiveInteger(
      options.maxCandidates ?? request.maxCandidates,
      DEFAULT_TOKEN_GRAPH_LIMITS.maxCandidates,
    ),
  };
}