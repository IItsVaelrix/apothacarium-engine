/**
 * Heuristic: Meter Regularity
 * Scores metrical consistency by combining:
 * - syllable-count regularity across lines,
 * - stress-pattern alignment to inferred dominant foot.
 *
 * @see ARCH.md section 3 - Fix 2
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeStressPattern(value) {
  return String(value || '').replace(/[^01]/g, '');
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLineSyllableCount(line) {
  if (typeof line?.syllableCount === 'number') return line.syllableCount;

  const wordSyllables = (line?.words || []).reduce((sum, word) => {
    return sum + (
      word?.deepPhonetics?.syllableCount ||
      word?.syllableCount ||
      word?.phonetics?.syllableCount ||
      1
    );
  }, 0);

  return wordSyllables || 0;
}

function getLineStressPattern(line) {
  if (line?.stressPattern) return normalizeStressPattern(line.stressPattern);

  const wordPattern = (line?.words || [])
    .map((word) => word?.deepPhonetics?.stressPattern || word?.stressPattern || '')
    .join('');

  return normalizeStressPattern(wordPattern);
}

function computePatternMismatch(pattern, candidate) {
  const normalized = normalizeStressPattern(pattern);
  if (!normalized || !candidate) return 1;

  let mismatches = 0;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] !== candidate[i % candidate.length]) {
      mismatches += 1;
    }
  }

  return mismatches / normalized.length;
}

function inferDominantFoot(stressPatterns) {
  const candidates = ['01', '10'];
  const validPatterns = stressPatterns.filter((pattern) => pattern.length >= 2);

  if (validPatterns.length === 0) {
    return { foot: '01', mismatch: 1 };
  }

  let best = { foot: '01', mismatch: Number.POSITIVE_INFINITY };
  for (const candidate of candidates) {
    const mismatch = average(validPatterns.map((pattern) => computePatternMismatch(pattern, candidate)));
    if (mismatch < best.mismatch) {
      best = { foot: candidate, mismatch };
    }
  }

  return best;
}

function footLabel(foot) {
  if (foot === '01') return 'iambic';
  if (foot === '10') return 'trochaic';
  return 'mixed';
}

function scoreMeterRegularity(doc) {
  const lines = Array.isArray(doc?.lines) ? doc.lines : [];
  if (lines.length === 0) {
    return {
      heuristic: 'meter_regularity',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No lines found.',
      diagnostics: []
    };
  }

  const syllableCounts = lines.map(getLineSyllableCount);
  const stressPatterns = lines.map(getLineStressPattern);

  const { foot, mismatch } = inferDominantFoot(stressPatterns);
  const stressConsistency = clamp01(1 - mismatch);

  const diagnostics = lines.map((line, index) => {
    const syllableCount = syllableCounts[index];
    const stressPattern = stressPatterns[index];
    const lineMismatch = stressPattern.length >= 2
      ? computePatternMismatch(stressPattern, foot)
      : 1;

    return {
      start: line.start,
      end: line.end,
      severity: lineMismatch <= 0.25 ? 'success' : lineMismatch <= 0.45 ? 'info' : 'warning',
      message: stressPattern
        ? `${syllableCount} syllables, stress ${stressPattern}`
        : `${syllableCount} syllables`,
      metadata: {
        syllableCount,
        stressPattern,
        foot,
        footMismatch: lineMismatch,
      }
    };
  });

  if (syllableCounts.length < 2) {
    const count = syllableCounts[0];
    const stressPattern = stressPatterns[0];
    const syllableBandScore = count >= 7 && count <= 12 ? 0.7 : count >= 4 && count <= 16 ? 0.45 : 0.2;
    const stressBonus = stressPattern.length >= 4 ? 0.2 : stressPattern.length >= 2 ? 0.1 : 0;
    const rawScore = clamp01(syllableBandScore + stressBonus);

    return {
      heuristic: 'meter_regularity',
      rawScore,
      explanation: `Single line with ${count} syllable${count !== 1 ? 's' : ''}, stress ${stressPattern || 'n/a'}.`,
      diagnostics
    };
  }

  const mean = syllableCounts.reduce((a, b) => a + b, 0) / syllableCounts.length;
  const variance = syllableCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / syllableCounts.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1;

  const syllableConsistency = clamp01(1 - cv * 1.75);
  const shortLineRatio = lines.filter((line, index) => syllableCounts[index] < 4 && line.text.trim().length > 0).length / lines.length;
  const cadenceScore = clamp01(1 - shortLineRatio);

  const rawScore = clamp01(
    syllableConsistency * 0.50 +
    stressConsistency * 0.35 +
    cadenceScore * 0.15
  );

  return {
    heuristic: 'meter_regularity',
    rawScore,
    explanation: [
      `${lines.length} lines`,
      `${mean.toFixed(1)} syllables/line`,
      `variation ${toPercent(cv)}`,
      `dominant foot ${footLabel(foot)}`,
      `stress coherence ${toPercent(stressConsistency)}`,
    ].join(', ') + '.',
    diagnostics
  };
}

export const meterRegularityHeuristic = {
  name: 'meter_regularity',
  scorer: scoreMeterRegularity,
  weight: 0.15,
};
