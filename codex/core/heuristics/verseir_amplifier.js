function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function tierLabel(tier) {
  const normalizedTier = String(tier || '').trim().toUpperCase();
  if (normalizedTier === 'INEXPLICABLE') return 'Inexplicable';
  if (normalizedTier === 'RARE') return 'Rare';
  if (normalizedTier === 'COMMON') return 'Common';
  return 'Dormant';
}

function collectMatchLabels(payload) {
  const matchesByTier = payload?.elementMatches;
  if (!matchesByTier || typeof matchesByTier !== 'object') return [];

  return [
    ...(Array.isArray(matchesByTier.inexplicable) ? matchesByTier.inexplicable : []),
    ...(Array.isArray(matchesByTier.rare) ? matchesByTier.rare : []),
    ...(Array.isArray(matchesByTier.common) ? matchesByTier.common : []),
  ]
    .slice(0, 3)
    .map((match) => String(match?.label || '').trim())
    .filter(Boolean);
}

function scoreVerseIRAmplifier(doc) {
  const payload = doc?.parsed?.verseIRAmplifier;
  if (!payload || typeof payload !== 'object') {
    return {
      heuristic: 'verseir_amplifier',
      rawScore: 0,
      explanation: 'No VerseIR amplifier context was attached.',
      diagnostics: [],
    };
  }

  const dominantTier = tierLabel(payload?.dominantTier);
  const dominantArchetype = String(payload?.dominantArchetype?.label || '').trim();
  const trueVisionBand = String(payload?.trueVision?.dominantBand?.label || '').trim();
  const trueVisionConfidence = clamp01(Number(payload?.trueVision?.confidence) || 0);
  const matchLabels = collectMatchLabels(payload);
  const matchText = matchLabels.length > 0 ? matchLabels.join(', ') : 'no stable domains';
  const noveltySignal = clamp01(Number(payload?.noveltySignal) || 0);
  const semanticDepth = clamp01(Number(payload?.semanticDepth) || 0);
  const raritySignal = clamp01(Number(payload?.raritySignal) || 0);
  const rawScore = clamp01((noveltySignal * 0.55) + (semanticDepth * 0.25) + (raritySignal * 0.20));
  const diagnostics = Array.isArray(payload?.diagnostics) ? payload.diagnostics.slice(0, 4) : [];

  return {
    heuristic: 'verseir_amplifier',
    rawScore,
    explanation: dominantArchetype
      ? `${dominantTier} synapse resonance leans toward ${dominantArchetype}. Domains: ${matchText}. Precision ${Math.round(clamp01(payload?.precisionScalar) * 100)}%.${trueVisionBand ? ` TrueVision tracks ${trueVisionBand} at ${Math.round(trueVisionConfidence * 100)}% confidence.` : ''}`
      : `${dominantTier} synapse resonance surfaces through ${matchText}. Precision ${Math.round(clamp01(payload?.precisionScalar) * 100)}%.${trueVisionBand ? ` TrueVision tracks ${trueVisionBand} at ${Math.round(trueVisionConfidence * 100)}% confidence.` : ''}`,
    diagnostics,
  };
}

export function createVerseIRAmplifierHeuristic(options = {}) {
  const weight = Number.isFinite(Number(options.weight))
    ? Number(options.weight)
    : 0.05;

  return {
    name: 'verseir_amplifier',
    scorer: scoreVerseIRAmplifier,
    weight,
  };
}

export const verseIRAmplifierHeuristic = createVerseIRAmplifierHeuristic();
