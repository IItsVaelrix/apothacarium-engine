/**
 * Heuristic: Literary Device Richness
 * Scores literary texture from:
 * - detector-identified device variety/intensity,
 * - repeated motifs from parser bigrams,
 * - structural pattern signals (anaphora/epistrophe/enjambment).
 *
 * @see ARCH.md section 3 - Fix 2
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

import { analyzeLiteraryDevices } from '../shared/literaryDevices.detector.js';

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function scoreLiteraryDeviceRichness(doc) {
  if (!doc || !doc.raw || !doc.raw.trim()) {
    return {
      heuristic: 'literary_device_richness',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No text to analyze.',
      diagnostics: []
    };
  }

  const devices = analyzeLiteraryDevices(doc.raw);
  const deviceCount = devices.length;
  const totalInstances = devices.reduce((sum, d) => sum + d.count, 0);

  const repeatedBigrams = Array.isArray(doc?.parsed?.repeatedBigrams) ? doc.parsed.repeatedBigrams : [];
  const starterPatterns = Array.isArray(doc?.parsed?.lineStarters) ? doc.parsed.lineStarters : [];
  const endPatterns = Array.isArray(doc?.parsed?.lineEnders) ? doc.parsed.lineEnders : [];
  const enjambmentRatio = clamp01(doc?.parsed?.enjambment?.ratio || 0);

  const motifScore = clamp01(repeatedBigrams.length / 3);
  const varietyScore = clamp01(deviceCount / 4);
  const intensityScore = clamp01(totalInstances / 7);

  const structuralSignals =
    (starterPatterns.length > 0 ? 1 : 0) +
    (endPatterns.length > 0 ? 1 : 0) +
    (enjambmentRatio >= 0.25 ? 1 : 0);
  const structureScore = clamp01(structuralSignals / 3);

  const rawScore = clamp01(
    varietyScore * 0.42 +
    intensityScore * 0.30 +
    motifScore * 0.18 +
    structureScore * 0.10
  );

  const diagnostics = [];

  for (const device of devices.slice(0, 3)) {
    diagnostics.push({
      start: 0,
      end: Math.max(0, doc.raw.length - 1),
      severity: device.count >= 3 ? 'success' : 'info',
      message: `${device.name} x${device.count}`,
      metadata: {
        examples: device.examples || [],
      },
    });
  }

  for (const motif of repeatedBigrams.slice(0, 2)) {
    diagnostics.push({
      start: 0,
      end: Math.max(0, doc.raw.length - 1),
      severity: 'info',
      message: 'Motif repetition',
      metadata: {
        bigram: motif.bigram,
        count: motif.count,
      },
    });
  }

  const deviceNames = devices.map((device) => `${device.name} (${device.count})`).join(', ');
  const motifSummary = repeatedBigrams.length > 0
    ? `${repeatedBigrams.length} repeated motif${repeatedBigrams.length !== 1 ? 's' : ''}`
    : 'no repeated motifs';

  return {
    heuristic: 'literary_device_richness',
    rawScore,
    explanation: deviceCount > 0
      ? [
        `${deviceCount} device type${deviceCount !== 1 ? 's' : ''}`,
        `${deviceNames}`,
        motifSummary,
        `enjambment ${toPercent(enjambmentRatio)}`,
      ].join(', ') + '.'
      : `No literary devices detected; ${motifSummary}, enjambment ${toPercent(enjambmentRatio)}.`,
    diagnostics
  };
}

export const literaryDeviceRichnessHeuristic = {
  name: 'literary_device_richness',
  scorer: scoreLiteraryDeviceRichness,
  weight: 0.15,
};
