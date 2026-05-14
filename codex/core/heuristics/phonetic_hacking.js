/**
 * Heuristic: Phonetic Hacking
 * Measures the "subliminal impact" of phonetic choices based on 
 * psychoacoustic principles: Impact, Flow, Friction, and Resonance.
 *
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

import { PhoneticHackingEngine } from '../shared/phoneticHacking.engine.js';

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function scorePhoneticHacking(doc) {
  const words = Array.isArray(doc?.allWords) ? doc.allWords : [];
  if (words.length === 0) {
    return {
      heuristic: 'phonetic_hacking',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No words found.',
      diagnostics: []
    };
  }

  const analysis = PhoneticHackingEngine.analyzeText(words);
  if (!analysis) {
    return {
      heuristic: 'phonetic_hacking',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No phonetic data available for analysis.',
      diagnostics: []
    };
  }

  const { intensities, dominant, resonanceType } = analysis;

  // We score based on the "intensity" of the dominant principle.
  // A higher score means a more focused "phonetic hack".
  const rawScore = clamp01(dominant.val * 2.5); // Normalize so 40% intensity is a strong hack

  const diagnostics = [];

  // Add a document-wide diagnostic for the dominant principle
  diagnostics.push({
    start: words[0].start,
    end: words[words.length - 1].end,
    severity: 'success',
    message: `Phonetic Hack Detected: ${dominant.label}`,
    metadata: {
      intensities,
      dominant: dominant.id,
      resonanceType
    }
  });

  return {
    heuristic: 'phonetic_hacking',
    rawScore,
    explanation: `${dominant.label} (${toPercent(dominant.val)}). Resonance: ${resonanceType}.`,
    diagnostics
  };
}

export const phoneticHackingHeuristic = {
  name: 'phonetic_hacking',
  scorer: scorePhoneticHacking,
  weight: 0.15,
};
