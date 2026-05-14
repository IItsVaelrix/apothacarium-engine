import { PHRASE_BANK, DEFAULT_COMMENTARY_ENTRY } from './phrase-bank.js';

const FALLBACK_TOKEN_LIMIT = 4;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'than',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
  'it', 'its', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'as',
  'not', 'no', 'so', 'too', 'very', 'just', 'can', 'could', 'would', 'should',
]);

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stableHash(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function chooseBySeed(items, seed) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[seed % items.length];
}

function normalizeToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

function pushToken(set, token) {
  const normalized = normalizeToken(token);
  if (!normalized || normalized.length <= 2) return;
  if (STOP_WORDS.has(normalized)) return;
  set.add(normalized);
}

function collectDiagnosticTokens(trace) {
  const tokens = new Set();
  const diagnostics = Array.isArray(trace?.diagnostics) ? trace.diagnostics : [];

  diagnostics.forEach((diagnostic) => {
    const metadata = diagnostic?.metadata;
    if (!metadata || typeof metadata !== 'object') return;

    const words = Array.isArray(metadata.words) ? metadata.words : [];
    words.forEach((word) => pushToken(tokens, word));

    if (typeof metadata.pair === 'string') {
      metadata.pair
        .split(/<->|\||,|\//g)
        .forEach((part) => pushToken(tokens, part));
    }

    if (typeof metadata.bigram === 'string') {
      metadata.bigram.split(/\s+/g).forEach((part) => pushToken(tokens, part));
    }

    if (typeof metadata.word === 'string') {
      pushToken(tokens, metadata.word);
    }

    if (typeof metadata.anchorWord === 'string') {
      pushToken(tokens, metadata.anchorWord);
    }
  });

  return [...tokens];
}

function collectDocumentTokens(doc) {
  const ranked = [];
  const frequency = doc?.parsed?.contentWordFrequency;
  if (frequency && typeof frequency === 'object') {
    Object.entries(frequency)
      .filter(([token, count]) => normalizeToken(token).length > 2 && Number(count) > 0)
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        if (right[0].length !== left[0].length) return right[0].length - left[0].length;
        return String(left[0]).localeCompare(String(right[0]));
      })
      .forEach(([token]) => ranked.push(normalizeToken(token)));
  }

  if (ranked.length > 0) {
    return [...new Set(ranked)].slice(0, 12);
  }

  const fallback = new Set();
  const allWords = Array.isArray(doc?.allWords) ? doc.allWords : [];
  allWords.forEach((word) => {
    pushToken(fallback, word?.normalized || word?.text);
  });
  return [...fallback].slice(0, 12);
}

function collectAnchorTokens(trace, doc) {
  const diagnosticTokens = collectDiagnosticTokens(trace);
  const documentTokens = collectDocumentTokens(doc);
  return [...new Set([...diagnosticTokens, ...documentTokens])].slice(0, FALLBACK_TOKEN_LIMIT);
}

function formatTokenList(tokens) {
  const quoted = tokens.map((token) => `"${token}"`);
  if (quoted.length <= 1) return quoted[0] || '';
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
}

function buildEvidenceSentence(trace, doc) {
  const scorePercent = Math.round(clamp01(Number(trace?.rawScore) || 0) * 100);
  const anchors = collectAnchorTokens(trace, doc);
  if (anchors.length === 0) {
    return `In this song, the measured signal settles near ${scorePercent} percent across the active lines.`;
  }

  const anchorText = formatTokenList(anchors);
  return `In this song, the measured signal settles near ${scorePercent} percent around ${anchorText}.`;
}

function resolveEntry(trace, phraseBank) {
  const heuristic = String(trace?.heuristic || '').trim();
  if (heuristic && phraseBank?.[heuristic]) {
    return phraseBank[heuristic];
  }
  if (phraseBank?.default) {
    return phraseBank.default;
  }
  return DEFAULT_COMMENTARY_ENTRY;
}

// ---------------------------------------------------------------------------
// Upgrade 1 — Secondary Markov (bigram) response model for commentary ranking
// ---------------------------------------------------------------------------

/**
 * Tokenize text into lowercase word tokens for bigram modeling.
 * Strips punctuation, collapses whitespace. Pure function.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeForModel(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z' -]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Build a bigram transition map from an array of sentence strings.
 * Returns { word: { nextWord: count, _total: N } }.
 * Pure function — no I/O.
 *
 * @param {string[]} corpus
 * @returns {Record<string, Record<string, number>>}
 */
function buildBigramModel(corpus) {
  const model = Object.create(null);
  for (const sentence of corpus) {
    const tokens = tokenizeForModel(sentence);
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const current = tokens[i];
      const next = tokens[i + 1];
      if (!model[current]) model[current] = Object.create(null);
      model[current][next] = (model[current][next] || 0) + 1;
      model[current]._total = (model[current]._total || 0) + 1;
    }
  }
  return model;
}

/**
 * Extract all textual content from the phrase bank into a flat array
 * suitable for bigram training. Pure function.
 *
 * @param {Record<string, any>} bank
 * @returns {string[]}
 */
function extractCorpusFromBank(bank) {
  const sentences = [];
  for (const key of Object.keys(bank)) {
    const entry = bank[key];
    if (!entry) continue;
    for (const citation of (entry.citations || [])) {
      if (citation?.quote) sentences.push(citation.quote);
    }
    for (const bridge of (entry.bridges || [])) {
      if (bridge) sentences.push(bridge);
    }
    for (const closer of (entry.closers || [])) {
      if (closer) sentences.push(closer);
    }
  }
  return sentences;
}

/**
 * Score text coherence using bigram log-probability.
 * Higher values = more coherent according to the phrase bank language.
 * Returns average log-probability per transition.
 * Unknown bigrams receive a Laplace-smoothed floor penalty.
 *
 * @param {string} text
 * @param {Record<string, Record<string, number>>} model
 * @returns {number}
 */
function scoreCoherence(text, model) {
  const tokens = tokenizeForModel(text);
  if (tokens.length < 2) return -10;

  const SMOOTH_FLOOR = 0.001;
  let totalLogProb = 0;
  let transitions = 0;

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const current = tokens[i];
    const next = tokens[i + 1];
    const entry = model[current];
    if (entry && entry[next]) {
      totalLogProb += Math.log(entry[next] / entry._total);
    } else if (entry) {
      totalLogProb += Math.log(SMOOTH_FLOOR / entry._total);
    } else {
      totalLogProb += Math.log(SMOOTH_FLOOR);
    }
    transitions += 1;
  }

  return transitions > 0 ? totalLogProb / transitions : -10;
}

// Module-level init: build bigram model from static phrase bank (pure, no I/O)
const _phraseCorpus = extractCorpusFromBank(PHRASE_BANK);
const BIGRAM_MODEL = buildBigramModel(_phraseCorpus);

// ---------------------------------------------------------------------------
// Upgrade 2 — CTC-style path/collapse decoding and scoring
// ---------------------------------------------------------------------------

/**
 * Classify a raw score into a score band for tone selection.
 *
 * @param {number} rawScore - 0.0 to 1.0
 * @returns {'high'|'mid'|'low'}
 */
function classifyScoreBand(rawScore) {
  const score = clamp01(Number(rawScore) || 0);
  if (score > 0.7) return 'high';
  if (score >= 0.3) return 'mid';
  return 'low';
}

/**
 * Generate K candidate paths through the phrase lattice.
 * Each path is a { citation, bridge, evidence, closer, band } tuple.
 * Uses varied prime-offset seeds for deterministic diversity.
 *
 * @param {Object} entry - PHRASE_BANK entry
 * @param {Object} trace - ScoreTrace
 * @param {Object} doc - AnalyzedDocument
 * @param {number} seed - base seed from stableHash
 * @param {number} [k=6] - number of candidates
 * @returns {Array<{citation: Object|null, bridge: string, evidence: string, closer: string, band: string}>}
 */
function generateCandidatePaths(entry, trace, doc, seed, k = 6) {
  const candidates = [];
  const band = classifyScoreBand(trace?.rawScore);
  const evidence = buildEvidenceSentence(trace, doc);

  for (let i = 0; i < k; i += 1) {
    const offset = seed + i * 97;
    const citation = chooseBySeed(entry.citations, offset + 11);
    const bridge = chooseBySeed(entry.bridges, offset + 29) || '';
    const closer = chooseBySeed(entry.closers, offset + 47) || '';
    candidates.push({ citation, bridge, evidence, closer, band });
  }

  return candidates;
}

/**
 * CTC-inspired collapse: remove repeated content words between adjacent
 * segments. When the same content word (length > 3, not a stop word)
 * appears in segment[n] and segment[n+1], it is stripped from n+1.
 * If collapsing empties a segment, the original is kept.
 *
 * @param {string[]} segments - ordered text segments
 * @returns {string[]} - segments with cross-boundary repetitions removed
 */
function collapsePath(segments) {
  if (segments.length <= 1) return segments;

  const result = [segments[0]];

  for (let i = 1; i < segments.length; i += 1) {
    const prevTokens = new Set(
      tokenizeForModel(segments[i - 1])
        .filter((t) => t.length > 3 && !STOP_WORDS.has(t)),
    );

    if (prevTokens.size === 0) {
      result.push(segments[i]);
      continue;
    }

    const currentWords = segments[i].split(/\s+/);
    const collapsed = currentWords.filter((word) => {
      const normalized = normalizeToken(word);
      if (normalized.length <= 3) return true;
      return !prevTokens.has(normalized);
    });

    const collapsedText = collapsed.join(' ').trim();
    result.push(collapsedText || segments[i]);
  }

  return result;
}

/**
 * Assemble a candidate path into a full commentary string,
 * applying CTC collapse and scoring with the bigram model.
 *
 * @param {Object} candidate - { citation, bridge, evidence, closer }
 * @param {Record<string, Record<string, number>>} bigramModel
 * @returns {{ text: string, score: number }}
 */
function assembleAndScorePath(candidate, bigramModel) {
  const parts = [];

  if (candidate.citation?.quote) {
    const attribution = candidate.citation.attribution
      ? ` (${candidate.citation.attribution})`
      : '';
    parts.push(`"${candidate.citation.quote}"${attribution}.`);
  }
  if (candidate.bridge) parts.push(candidate.bridge);
  if (candidate.evidence) parts.push(candidate.evidence);
  if (candidate.closer) parts.push(candidate.closer);

  const collapsed = collapsePath(parts);
  const text = collapsed.join(' ').replace(/\s+/g, ' ').trim();
  const score = scoreCoherence(text, bigramModel);

  return { text, score };
}

// ---------------------------------------------------------------------------
// Upgrade 3 — Reworked commentary generation with varied, context-aware
// candidates scored by the bigram model after CTC collapse
// ---------------------------------------------------------------------------

/**
 * Determine candidate count based on contribution magnitude.
 * High-contribution heuristics get more candidates for richer exploration.
 *
 * @param {number} contribution
 * @returns {number} 4-8
 */
function candidateCountForContribution(contribution) {
  const c = Number(contribution) || 0;
  if (c >= 15) return 8;
  if (c >= 10) return 6;
  if (c >= 5) return 5;
  return 4;
}

/**
 * Extract content-word tokens from trace.explanation to detect redundancy.
 *
 * @param {string} explanation
 * @returns {Set<string>}
 */
function extractExplanationTokens(explanation) {
  const tokens = new Set();
  if (!explanation || typeof explanation !== 'string') return tokens;
  tokenizeForModel(explanation).forEach((t) => {
    if (t.length > 3 && !STOP_WORDS.has(t)) {
      tokens.add(t);
    }
  });
  return tokens;
}

/**
 * Score anchor affinity: how well a phrase references the entry concept
 * or the trace's anchor tokens. Returns a bonus in [0, 0.5].
 *
 * @param {string} phrase
 * @param {string} concept
 * @param {string[]} anchors
 * @returns {number}
 */
function anchorAffinity(phrase, concept, anchors) {
  const phraseTokens = new Set(tokenizeForModel(phrase));
  let hits = 0;

  for (const cWord of tokenizeForModel(concept)) {
    if (phraseTokens.has(cWord)) hits += 1;
  }

  for (const anchor of anchors) {
    if (phraseTokens.has(normalizeToken(anchor))) hits += 1;
  }

  return Math.min(hits * 0.15, 0.5);
}

/**
 * Penalize commentary that overlaps heavily with trace.explanation.
 * Returns a penalty in [-0.5, 0].
 *
 * @param {string} commentaryText
 * @param {Set<string>} explanationTokens
 * @returns {number}
 */
function explanationOverlapPenalty(commentaryText, explanationTokens) {
  if (explanationTokens.size === 0) return 0;

  const commentaryTokens = tokenizeForModel(commentaryText)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));

  if (commentaryTokens.length === 0) return 0;

  let overlapCount = 0;
  for (const token of commentaryTokens) {
    if (explanationTokens.has(token)) overlapCount += 1;
  }

  const overlapRatio = overlapCount / commentaryTokens.length;
  return -overlapRatio * 0.5;
}

/**
 * Build deterministic criticism commentary for a heuristic trace.
 * Uses multi-candidate generation with Markov scoring and CTC collapse.
 *
 * @param {import('../schemas').ScoreTrace} trace
 * @param {import('../schemas').AnalyzedDocument} doc
 * @param {Record<string, any>} [phraseBank]
 * @returns {string}
 */
export function buildHeuristicCommentary(trace, doc, phraseBank = PHRASE_BANK) {
  if (!trace || typeof trace !== 'object') return '';

  const entry = resolveEntry(trace, phraseBank);
  const heuristic = String(trace?.heuristic || 'unknown');
  const seed = stableHash(
    `${heuristic}|${trace?.rawScore}|${trace?.contribution}|${doc?.stats?.wordCount || 0}`,
  );

  const k = candidateCountForContribution(trace?.contribution);
  const anchors = collectAnchorTokens(trace, doc);
  const explTokens = extractExplanationTokens(trace?.explanation);

  const candidates = generateCandidatePaths(entry, trace, doc, seed, k);

  let bestText = '';
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const { text, score: coherenceScore } = assembleAndScorePath(
      candidate, BIGRAM_MODEL,
    );

    const affinity = anchorAffinity(text, entry.concept || '', anchors);
    const overlap = explanationOverlapPenalty(text, explTokens);
    const totalScore = coherenceScore + affinity + overlap;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestText = text;
    }
  }

  return bestText;
}

/**
 * Build commentary for every trace in a score payload.
 *
 * @param {import('../schemas').ScoreTrace[]} traces
 * @param {import('../schemas').AnalyzedDocument} doc
 * @param {Record<string, any>} [phraseBank]
 * @returns {import('../schemas').ScoreTrace[]}
 */
export function attachHeuristicCommentary(traces, doc, phraseBank = PHRASE_BANK) {
  if (!Array.isArray(traces)) return [];
  return traces.map((trace) => ({
    ...trace,
    commentary: buildHeuristicCommentary(trace, doc, phraseBank),
  }));
}
