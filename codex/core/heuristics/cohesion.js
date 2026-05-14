import { WORD_REGEX_GLOBAL } from '../constants/regex.js';

/**
 * Heuristic: Syntactic Cohesion
 * Measures whether the verse advances with controlled prose logic.
 *
 * @param {string|import('../schemas').AnalyzedDocument} input
 * @returns {number}
 */

const CONNECTIVE_GATES = new Set([
  'although',
  'but',
  'however',
  'meanwhile',
  'nonetheless',
  'therefore',
  'though',
  'whereas',
  'while',
  'yet',
]);

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function getRawText(input) {
  if (typeof input === 'string') return input;
  return String(input?.raw || '');
}

function getSentenceLengths(input, text) {
  const parsedLengths = Array.isArray(input?.parsed?.sentenceLengths)
    ? input.parsed.sentenceLengths.filter((value) => Number(value) > 0)
    : [];

  if (parsedLengths.length > 0) {
    return parsedLengths.map((value) => Number(value) || 0).filter((value) => value > 0);
  }

  return text
    .split(/[.!?]+|\n+/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (segment.match(WORD_REGEX_GLOBAL) || []).length)
    .filter((value) => value > 0);
}

function getTokens(input, text) {
  const analyzedWords = Array.isArray(input?.allWords) ? input.allWords : [];
  if (analyzedWords.length > 0) {
    return analyzedWords
      .map((word) => String(word?.normalized || word?.text || '').trim().toLowerCase())
      .filter(Boolean);
  }

  return (text.match(WORD_REGEX_GLOBAL) || [])
    .map((token) => token.toLowerCase());
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeSentenceVariation(lengths) {
  if (!Array.isArray(lengths) || lengths.length <= 1) return 0;

  const mean = average(lengths);
  if (mean <= 0) return 0;

  const variance = lengths.reduce((sum, length) => {
    const delta = length - mean;
    return sum + (delta * delta);
  }, 0) / lengths.length;
  const coefficient = Math.sqrt(variance) / mean;

  return clamp01(coefficient / 0.65);
}

function computeConnectiveDensity(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  const connectiveHits = tokens.filter((token) => CONNECTIVE_GATES.has(token)).length;
  return clamp01((connectiveHits / tokens.length) / 0.08);
}

function computePunctuationDensity(text, tokenCount) {
  const rawText = String(text || '');
  const punctuationHits = (rawText.match(/[,:;]/g) || []).length;
  if (punctuationHits <= 0 || tokenCount <= 0) return 0;
  return clamp01((punctuationHits / tokenCount) / 0.12);
}

export function calculateCohesionScore(input) {
  const text = getRawText(input);
  if (!text.trim()) return 0;

  const sentenceLengths = getSentenceLengths(input, text);
  const tokens = getTokens(input, text);

  const sentenceVariation = computeSentenceVariation(sentenceLengths);
  const connectiveDensity = computeConnectiveDensity(tokens);
  const punctuationDensity = computePunctuationDensity(text, tokens.length);

  return clamp01(
    (sentenceVariation * 0.4)
    + (connectiveDensity * 0.35)
    + (punctuationDensity * 0.25)
  );
}

function scoreCohesion(doc) {
  const text = getRawText(doc);
  if (!text.trim()) {
    return {
      heuristic: 'syntactic_cohesion',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No prose structure detected.',
      diagnostics: [],
    };
  }

  const sentenceLengths = getSentenceLengths(doc, text);
  const tokens = getTokens(doc, text);
  const sentenceVariation = computeSentenceVariation(sentenceLengths);
  const connectiveDensity = computeConnectiveDensity(tokens);
  const punctuationDensity = computePunctuationDensity(text, tokens.length);
  const rawScore = calculateCohesionScore(doc);

  const connectiveHits = tokens.filter((token) => CONNECTIVE_GATES.has(token));
  const diagnostics = connectiveHits.length > 0
    ? [{
        start: 0,
        end: Math.max(0, text.length - 1),
        severity: rawScore >= 0.7 ? 'success' : 'info',
        message: `Logic gates present: ${[...new Set(connectiveHits)].slice(0, 4).join(', ')}`,
        metadata: {
          connectiveHits: connectiveHits.length,
        },
      }]
    : [];

  return {
    heuristic: 'syntactic_cohesion',
    rawScore,
    explanation: [
      `${sentenceLengths.length || 1} sentence units`,
      `variation ${toPercent(sentenceVariation)}`,
      `logic gates ${toPercent(connectiveDensity)}`,
      `punctuation ${toPercent(punctuationDensity)}`,
    ].join(', ') + '.',
    diagnostics,
  };
}

export const cohesionHeuristic = {
  name: 'syntactic_cohesion',
  scorer: scoreCohesion,
  weight: 0.15,
};
