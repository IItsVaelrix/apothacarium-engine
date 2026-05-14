/**
 * Heuristic: Vocabulary Richness
 * Measures lexical diversity with algorithmic parsing:
 * - moving-average TTR (MATTR),
 * - hapax ratio (single-use words),
 * - stem diversity,
 * - long-word density.
 *
 * @see ARCH.md section 3 - Fix 2
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function normalizeWord(wordText) {
  return String(wordText || '').toLowerCase().replace(/[^a-z'-]/g, '').replace(/^['-]+|['-]+$/g, '');
}

function stemWord(token) {
  if (!token || token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function countTokens(tokens) {
  const frequency = {};
  for (const token of tokens) {
    if (!token) continue;
    frequency[token] = (frequency[token] || 0) + 1;
  }
  return frequency;
}

function computeMATTR(tokens, windowSize) {
  if (tokens.length === 0) return 0;
  if (tokens.length <= windowSize) {
    return new Set(tokens).size / tokens.length;
  }

  let total = 0;
  let windows = 0;

  for (let i = 0; i <= tokens.length - windowSize; i++) {
    const slice = tokens.slice(i, i + windowSize);
    total += new Set(slice).size / windowSize;
    windows += 1;
  }

  return windows > 0 ? total / windows : 0;
}

function scoreVocabularyRichness(doc) {
  const allWords = Array.isArray(doc?.allWords) ? doc.allWords : [];
  if (allWords.length === 0) {
    return {
      heuristic: 'vocabulary_richness',
      rawScore: 0,
      weight: 0.10,
      contribution: 0,
      explanation: 'No words found.',
      diagnostics: []
    };
  }

  const words = allWords
    .map((word) => word?.normalized || normalizeWord(word?.text))
    .filter((token) => token.length >= 2);
  
  if (words.length === 0) {
    return {
      heuristic: 'vocabulary_richness',
      rawScore: 0,
      weight: 0.10,
      contribution: 0,
      explanation: 'No suitable words found.',
      diagnostics: []
    };
  }

  const frequency = doc?.parsed?.wordFrequency && Object.keys(doc.parsed.wordFrequency).length > 0
    ? doc.parsed.wordFrequency
    : countTokens(words);

  const uniqueWordCount = Object.keys(frequency).length;
  const ttr = uniqueWordCount / words.length;

  const windowSize = Math.max(6, Math.min(20, Math.floor(words.length / 2) || 6));
  const mattr = computeMATTR(words, windowSize);

  const hapaxCount = Object.values(frequency).filter((count) => count === 1).length;
  const hapaxRatio = uniqueWordCount > 0 ? hapaxCount / uniqueWordCount : 0;

  const uniqueStemCount = new Set(words.map(stemWord)).size;
  const stemDiversity = uniqueWordCount > 0 ? uniqueStemCount / uniqueWordCount : 0;

  const longWordRatio = words.filter((word) => word.length >= 7).length / words.length;

  const rawScore = clamp01(
    mattr * 0.50 +
    hapaxRatio * 0.20 +
    stemDiversity * 0.20 +
    clamp01(longWordRatio / 0.25) * 0.10
  );

  const diagnostics = [];

  Object.entries(frequency)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .forEach(([token, count]) => {
      diagnostics.push({
        start: 0,
        end: Math.max(0, doc.raw?.length ? doc.raw.length - 1 : 0),
        severity: 'warning',
        message: `Overused token "${token}"`,
        metadata: { token, count },
      });
    });

  return {
    heuristic: 'vocabulary_richness',
    rawScore,
    explanation: [
      `${uniqueWordCount} unique / ${words.length} total`,
      `TTR ${toPercent(ttr)}`,
      `MATTR ${toPercent(mattr)}`,
      `hapax ${toPercent(hapaxRatio)}`,
      `stem diversity ${toPercent(stemDiversity)}`,
      `long words ${toPercent(longWordRatio)}`,
    ].join(', ') + '.',
    diagnostics
  };
}

export const vocabularyRichnessHeuristic = {
  name: 'vocabulary_richness',
  scorer: scoreVocabularyRichness,
  weight: 0.10,
};
