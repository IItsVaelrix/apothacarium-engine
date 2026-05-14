/**
 * Heuristic: Rhyme Quality
 * Evaluates rhyme quality with weighted connection scoring, scheme coherence,
 * and line coverage. Uses the DeepRhymeEngine for algorithmic rhyme parsing.
 *
 * @see ARCH.md section 3 - Fix 2
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

import { DeepRhymeEngine } from '../rhyme-astrology/deepRhyme.engine.js';

const rhymeEngine = new DeepRhymeEngine();

const TYPE_WEIGHT = {
  perfect: 1.00,
  near: 0.90,
  slant: 0.78,
  assonance: 0.70,
  consonance: 0.62,
};

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function capitalize(value) {
  if (!value) return '';
  return value[0].toUpperCase() + value.slice(1);
}

function computeSchemeCoherence(schemePattern) {
  const pattern = String(schemePattern || '').trim();
  if (!pattern || pattern.length < 2) return 0;

  const counts = {};
  for (const token of pattern) {
    counts[token] = (counts[token] || 0) + 1;
  }

  let repeatedLines = 0;
  for (const count of Object.values(counts)) {
    if (count >= 2) repeatedLines += count;
  }

  return clamp01(repeatedLines / pattern.length);
}

function buildConnectionDiagnostics(connections, limit = 5) {
  return [...connections]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit)
    .map((connection) => {
      const start = Math.min(connection.wordA.charStart, connection.wordB.charStart);
      const end = Math.max(connection.wordA.charEnd, connection.wordB.charEnd);
      const score = clamp01(connection.score || 0);

      return {
        start,
        end,
        severity: score >= 0.85 ? 'success' : score >= 0.7 ? 'info' : 'warning',
        message: `${capitalize(connection.type || 'rhyme')} rhyme`,
        metadata: {
          pair: `${connection.wordA.word} <-> ${connection.wordB.word}`,
          score,
          syllablesMatched: connection.syllablesMatched || 0,
          subtype: connection.subtype || 'none',
          group: connection.groupLabel || null,
        }
      };
    });
}

async function scoreRhymeQuality(doc) {
  if (!doc || !doc.raw || !doc.raw.trim()) {
    return {
      heuristic: 'rhyme_quality',
      rawScore: 0,
      weight: 0.10,
      contribution: 0,
      explanation: 'No text to analyze.',
      diagnostics: []
    };
  }

  const analysis = await rhymeEngine.analyzeDocument(doc.raw);

  const endConnections = analysis.endRhymeConnections || [];
  const internalConnections = analysis.internalRhymeConnections || [];
  const allConnections = [...endConnections, ...internalConnections];

  const endRhymes = endConnections.length;
  const internalRhymes = internalConnections.length;
  const lineCount = analysis.lines?.length || 1;

  if (allConnections.length === 0) {
    return {
      heuristic: 'rhyme_quality',
      rawScore: 0,
      weight: 0.10,
      contribution: 0,
      explanation: `No rhymes detected in ${lineCount} line${lineCount !== 1 ? 's' : ''}.`,
      diagnostics: []
    };
  }

  let weightedQualitySum = 0;
  let multiSyllableCount = 0;
  const touchedLines = new Set();

  for (const connection of allConnections) {
    const typeWeight = TYPE_WEIGHT[connection.type] || 0.6;
    const baseScore = clamp01(connection.score || 0);
    weightedQualitySum += baseScore * typeWeight;

    if (connection.syllablesMatched >= 2) {
      multiSyllableCount += 1;
    }

    touchedLines.add(connection.wordA.lineIndex);
    touchedLines.add(connection.wordB.lineIndex);
  }

  const averageConnectionQuality = clamp01(weightedQualitySum / allConnections.length);
  const lineCoverage = lineCount > 0 ? clamp01(touchedLines.size / lineCount) : 0;
  const schemeCoherence = computeSchemeCoherence(analysis.schemePattern);
  const multiSyllableRatio = clamp01(multiSyllableCount / allConnections.length);
  const endRhymeRatio = clamp01(endRhymes / allConnections.length);
  const endRhymeBalance = clamp01(endRhymeRatio / 0.7);

  const rawScore = clamp01(
    averageConnectionQuality * 0.50 +
    lineCoverage * 0.25 +
    schemeCoherence * 0.20 +
    endRhymeBalance * 0.05
  );

  const diagnostics = buildConnectionDiagnostics(allConnections);
  const scheme = analysis.schemePattern || 'none';

  return {
    heuristic: 'rhyme_quality',
    rawScore,
    explanation: [
      `${allConnections.length} rhyme links`,
      `${endRhymes} end + ${internalRhymes} internal`,
      `avg strength ${toPercent(averageConnectionQuality)}`,
      `line coverage ${toPercent(lineCoverage)}`,
      `scheme ${scheme}`,
      `multisyllabic seen ${toPercent(multiSyllableRatio)} (scored separately)`,
    ].join(', ') + '.',
    diagnostics
  };
}

export const rhymeQualityHeuristic = {
  name: 'rhyme_quality',
  scorer: scoreRhymeQuality,
  weight: 0.10,
};
