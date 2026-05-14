/**
 * Heuristic: Emotional Resonance
 * Uses line-level emotion dynamics to estimate tonal intensity and coherence.
 */

import { detectEmotionDetailed } from '../shared/literaryDevices.detector.js';

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function resolveLineText(line) {
  if (typeof line?.text === 'string' && line.text.trim()) return line.text;
  const words = Array.isArray(line?.words) ? line.words : [];
  return words
    .map((word) => String(word?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildLineProfiles(lines) {
  return lines
    .map((line, lineIndex) => {
      const text = resolveLineText(line);
      if (!text) return null;
      const analysis = detectEmotionDetailed(text);
      return {
        lineIndex,
        text,
        emotion: analysis.emotion,
        confidence: Number(analysis.confidence) || 0,
      };
    })
    .filter(Boolean);
}

function scoreEmotionalResonance(doc) {
  const lines = Array.isArray(doc?.lines) ? doc.lines : [];
  const lineProfiles = buildLineProfiles(lines);

  if (lineProfiles.length === 0) {
    return {
      heuristic: 'emotional_resonance',
      rawScore: 0,
      explanation: 'No lines found for emotion analysis.',
      diagnostics: [],
    };
  }

  const nonNeutral = lineProfiles.filter((line) => line.emotion !== 'Neutral');
  if (nonNeutral.length === 0) {
    return {
      heuristic: 'emotional_resonance',
      rawScore: 0.05,
      explanation: `No dominant emotion detected across ${lineProfiles.length} lines.`,
      diagnostics: [{
        start: 0,
        end: Math.max(0, String(doc?.raw || '').length - 1),
        severity: 'warning',
        message: 'Tone is mostly neutral; emotional contrast is low.',
        metadata: { lineCount: lineProfiles.length },
      }],
    };
  }

  const emotionCounts = {};
  nonNeutral.forEach((row) => {
    emotionCounts[row.emotion] = (emotionCounts[row.emotion] || 0) + 1;
  });

  const rankedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const dominantEmotion = rankedEmotions[0]?.[0] || 'Neutral';
  const dominantCount = rankedEmotions[0]?.[1] || 0;

  let transitionCount = 0;
  for (let i = 1; i < nonNeutral.length; i += 1) {
    if (nonNeutral[i - 1].emotion !== nonNeutral[i].emotion) {
      transitionCount += 1;
    }
  }

  const emotionDensity = nonNeutral.length / lineProfiles.length;
  const averageConfidence = nonNeutral.reduce((sum, row) => sum + row.confidence, 0) / nonNeutral.length;
  const cohesion = dominantCount / nonNeutral.length;
  const transitionRate = nonNeutral.length > 1 ? transitionCount / (nonNeutral.length - 1) : 0;
  const movementScore = clamp01(1 - (Math.abs(transitionRate - 0.35) / 0.35));

  const rawScore = clamp01(
    (averageConfidence * 0.45) +
    (emotionDensity * 0.25) +
    (cohesion * 0.20) +
    (movementScore * 0.10)
  );

  const diagnostics = [];
  if (emotionDensity < 0.2) {
    diagnostics.push({
      start: 0,
      end: Math.max(0, String(doc?.raw || '').length - 1),
      severity: 'warning',
      message: 'Low emotional signal density across lines.',
      metadata: {
        nonNeutralLines: nonNeutral.length,
        lineCount: lineProfiles.length,
      },
    });
  }

  return {
    heuristic: 'emotional_resonance',
    rawScore,
    explanation: [
      `${dominantEmotion} dominates ${dominantCount}/${nonNeutral.length} emotional lines`,
      `density ${toPercent(emotionDensity)}`,
      `avg confidence ${toPercent(averageConfidence)}`,
      `cohesion ${toPercent(cohesion)}`,
      `arc movement ${toPercent(transitionRate)}`,
    ].join(', ') + '.',
    diagnostics,
  };
}

export const emotionalResonanceHeuristic = {
  name: 'emotional_resonance',
  scorer: scoreEmotionalResonance,
  weight: 0.08,
};
