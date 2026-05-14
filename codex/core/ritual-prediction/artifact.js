import {
  DEFAULT_PIXELBRAIN_CANVAS,
  GOLDEN_ANGLE,
  createByteMap,
  createBytecodeString,
  hashString,
  hslToHex,
  roundTo,
} from '../pixelbrain/shared.js';

const RELATION_ORDER = Object.freeze([
  'SEQUENTIAL_LIKELIHOOD',
  'PHONETIC_SIMILARITY',
  'SEMANTIC_ASSOCIATION',
  'SCHOOL_RESONANCE',
  'SYNTACTIC_COMPATIBILITY',
  'MEMORY_AFFINITY',
]);

const RELATION_EFFECTS = Object.freeze({
  SEQUENTIAL_LIKELIHOOD: 'PULSE',
  PHONETIC_SIMILARITY: 'RESONANCE',
  SEMANTIC_ASSOCIATION: 'GLYPH',
  SCHOOL_RESONANCE: 'AURA',
  SYNTACTIC_COMPATIBILITY: 'FRAME',
  MEMORY_AFFINITY: 'ECHO',
});

function toHashHex(value) {
  return hashString(value).toString(16).padStart(8, '0');
}

function detectDominantRelation(candidate) {
  const relationCounts = new Map();
  const edges = Array.isArray(candidate?.path?.pathEdges) ? candidate.path.pathEdges : [];

  edges.forEach((edge) => {
    const relation = String(edge?.relation || '').trim().toUpperCase();
    if (!relation) return;
    relationCounts.set(relation, (relationCounts.get(relation) || 0) + 1);
  });

  if (relationCounts.size === 0) return 'SEQUENTIAL_LIKELIHOOD';

  return [...relationCounts.entries()]
    .sort((entryA, entryB) => {
      if (entryB[1] !== entryA[1]) return entryB[1] - entryA[1];
      return RELATION_ORDER.indexOf(entryA[0]) - RELATION_ORDER.indexOf(entryB[0]);
    })[0][0];
}

function summarizeCandidate(candidate) {
  return {
    token: candidate.token,
    totalScore: roundTo(candidate.totalScore, 4),
    activationScore: roundTo(candidate.activationScore, 4),
    legalityScore: roundTo(candidate.legalityScore, 4),
    semanticScore: roundTo(candidate.semanticScore, 4),
    phoneticScore: roundTo(candidate.phoneticScore, 4),
    schoolScore: roundTo(candidate.schoolScore, 4),
    noveltyScore: roundTo(candidate.noveltyScore, 4),
    connectedness: roundTo(candidate.connectedness, 4),
    pathCoherence: roundTo(candidate.pathCoherence, 4),
    pathNodeIds: Array.isArray(candidate?.path?.pathNodes) ? [...candidate.path.pathNodes] : [],
    sourceRelations: Array.isArray(candidate?.path?.pathEdges)
      ? [...new Set(candidate.path.pathEdges.map((edge) => edge?.relation).filter(Boolean))]
      : [],
  };
}

function buildPredictionPalettes(candidates, currentSchool) {
  const paletteByRelation = new Map();
  const safeSchool = String(currentSchool || '').trim().toUpperCase() || null;

  candidates.forEach((candidate) => {
    const relation = detectDominantRelation(candidate);
    if (paletteByRelation.has(relation)) return;

    const paletteIndex = paletteByRelation.size;
    const hue = (paletteIndex * GOLDEN_ANGLE) % 360;
    const colors = [
      hslToHex(hue, 72, 60),
      hslToHex((hue + 14) % 360, 76, 48),
      hslToHex((hue + 28) % 360, 68, 72),
    ];
    const effect = RELATION_EFFECTS[relation] || 'PULSE';
    const rarity = paletteIndex === 0 ? 'RARE' : 'COMMON';

    paletteByRelation.set(relation, {
      key: relation.toLowerCase(),
      bytecode: createBytecodeString({
        schoolId: safeSchool || 'VOID',
        rarity,
        effect,
      }),
      schoolId: safeSchool,
      rarity,
      effect,
      colors,
      byteMap: createByteMap(colors),
    });
  });

  return paletteByRelation;
}

function buildPredictionCoordinates(candidates, paletteByRelation, currentSchool) {
  const safeSchool = String(currentSchool || '').trim().toUpperCase() || null;
  const count = candidates.length;
  const columns = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(Math.max(count, 1)))));
  const cellWidth = 12;
  const cellHeight = 10;
  const originX = 8;
  const originY = 12;

  return candidates.map((candidate, index) => {
    const relation = detectDominantRelation(candidate);
    const palette = paletteByRelation.get(relation);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = originX + (column * cellWidth);
    const baseY = originY + (row * cellHeight);
    const heightOffset = Math.round((1 - (Number(candidate.totalScore) || 0)) * 6);
    const y = baseY + heightOffset;
    const rarity = candidate === candidates[0]
      ? 'INEXPLICABLE'
      : (candidate.totalScore >= 0.72 ? 'RARE' : 'COMMON');
    const effect = candidate === candidates[0]
      ? 'FOCUS'
      : (palette?.effect || 'PULSE');

    return {
      tokenId: index,
      token: candidate.token,
      lineIndex: row,
      bytecode: createBytecodeString({
        schoolId: safeSchool || 'VOID',
        rarity,
        effect,
      }),
      schoolId: safeSchool,
      rarity,
      effect,
      emphasis: roundTo(candidate.totalScore, 4),
      x,
      y,
      z: Math.round((Number(candidate.totalScore) || 0) * 100),
      snappedX: x,
      snappedY: y,
      paletteKey: palette?.key || relation.toLowerCase(),
    };
  });
}

function serializeContextSnapshot(context = {}) {
  return {
    prefix: context.prefix || '',
    currentToken: context.currentToken || null,
    prevToken: context.prevToken || null,
    lineEndToken: context.lineEndToken || null,
    currentSchool: context.currentSchool || null,
    currentLineWords: Array.isArray(context.currentLineWords) ? [...context.currentLineWords] : [],
    maxDepth: context.maxDepth || 0,
    maxFanout: context.maxFanout || 0,
    maxCandidates: context.maxCandidates || 0,
    verseIRState: context.verseIRState
      ? {
        compiler: context.verseIRState.compiler || null,
        previousLineEnd: context.verseIRState.previousLineEnd
          ? {
            normalizedWord: context.verseIRState.previousLineEnd.normalizedWord || null,
            lineIndex: context.verseIRState.previousLineEnd.lineIndex ?? null,
            rhymeTailSignature: context.verseIRState.previousLineEnd.rhymeTailSignature || null,
          }
          : null,
        currentLine: context.verseIRState.currentLine
          ? {
            lineIndex: context.verseIRState.currentLine.lineIndex ?? null,
            dominantVowelFamily: context.verseIRState.currentLine.dominantVowelFamily || null,
            repeatedWindowCount: context.verseIRState.currentLine.repeatedWindowCount ?? 0,
          }
          : null,
      }
      : null,
  };
}

export function createRitualPredictionArtifact({
  context = {},
  candidates = [],
  winner = null,
  diagnostics = [],
} = {}) {
  const summarizedCandidates = (Array.isArray(candidates) ? candidates : []).map(summarizeCandidate);
  const contextSnapshot = serializeContextSnapshot(context);
  const requestHash = toHashHex(JSON.stringify(contextSnapshot));
  const traceChecksum = toHashHex(JSON.stringify(summarizedCandidates));
  const paletteByRelation = buildPredictionPalettes(candidates, context.currentSchool);
  const palettes = [...paletteByRelation.values()];
  const coordinates = buildPredictionCoordinates(candidates, paletteByRelation, context.currentSchool);

  return Object.freeze({
    version: '1.0.0',
    requestHash,
    traceChecksum,
    context: contextSnapshot,
    winner: winner ? summarizeCandidate(winner) : null,
    candidates: summarizedCandidates,
    diagnostics: Array.isArray(diagnostics) ? [...diagnostics] : [],
    pixelbrainProjection: {
      version: '1.0.0',
      candidateCount: summarizedCandidates.length,
      paletteCount: palettes.length,
      dominantAxis: 'horizontal',
      dominantSymmetry: 'none',
      canvas: {
        ...DEFAULT_PIXELBRAIN_CANVAS,
        goldenPoint: {
          x: Math.round(DEFAULT_PIXELBRAIN_CANVAS.width * 0.618),
          y: Math.round(DEFAULT_PIXELBRAIN_CANVAS.height * 0.618),
        },
      },
      palettes,
      coordinates,
    },
  });
}
