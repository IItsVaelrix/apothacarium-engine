import { clamp01, normalizeGraphToken, stableTokenCompare } from './types.js';

const GRAPH_SCORE_WEIGHTS = Object.freeze({
  activation: 0.34,
  legality: 0.22,
  semantic: 0.14,
  phonetic: 0.14,
  school: 0.10,
  novelty: 0.06,
});

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'than',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
  'it', 'its', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had', 'done',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'as',
  'not', 'no', 'so', 'too', 'very', 'just', 'can', 'could', 'would', 'should',
  'will', 'shall', 'might', 'may', 'must',
]);

function isLikelyContentWord(token) {
  const normalized = normalizeGraphToken(token).replace(/[^a-z'-]/g, '');
  if (!normalized) return false;
  if (FUNCTION_WORDS.has(normalized)) return false;
  return normalized.length >= 3;
}

function average(values) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function buildRelationScores(pathEdges = []) {
  const relationScores = {
    PHONETIC_SIMILARITY: [],
    SEMANTIC_ASSOCIATION: [],
    SYNTACTIC_COMPATIBILITY: [],
    SCHOOL_RESONANCE: [],
    MEMORY_AFFINITY: [],
    SEQUENTIAL_LIKELIHOOD: [],
  };

  pathEdges.forEach((edge) => {
    if (!relationScores[edge?.relation]) return;
    relationScores[edge.relation].push(clamp01(edge.weight));
  });

  return relationScores;
}

function computeLegalityScore(node, relationScores, syntaxContext, prefix) {
  let legality = 1;
  const normalizedPrefix = normalizeGraphToken(prefix);
  const normalizedToken = normalizeGraphToken(node?.token);

  if (normalizedPrefix) {
    if (!normalizedToken.startsWith(normalizedPrefix)) {
      return 0;
    }
    if (normalizedToken === normalizedPrefix) {
      legality *= 0.4;
    }
  }

  const isContentWord = isLikelyContentWord(node?.token);
  const syntaxBoost = average(relationScores.SYNTACTIC_COMPATIBILITY);
  if (syntaxBoost > 0) {
    legality *= 0.82 + (syntaxBoost * 0.26);
  }

  if (syntaxContext?.role === 'content') {
    legality *= isContentWord ? 1.08 : 0.72;
  } else if (syntaxContext?.role === 'function') {
    legality *= isContentWord ? 0.76 : 1.05;
  }

  if (syntaxContext?.lineRole === 'line_end' && syntaxContext?.stressRole === 'primary' && isContentWord) {
    legality *= 1.08;
  }

  if (syntaxContext?.rhymePolicy === 'suppress' && average(relationScores.PHONETIC_SIMILARITY) > 0) {
    legality *= 0.52;
  } else if (syntaxContext?.rhymePolicy === 'allow_weak' && average(relationScores.PHONETIC_SIMILARITY) > 0) {
    legality *= 0.78;
  }

  return clamp01(legality);
}

function computeSemanticScore(node, relationScores) {
  const semanticEdges = relationScores.SEMANTIC_ASSOCIATION;
  const memoryEdges = relationScores.MEMORY_AFFINITY;
  const tagBonus = Array.isArray(node?.semanticTags) && node.semanticTags.length > 0
    ? Math.min(0.18, node.semanticTags.length * 0.06)
    : 0;
  return clamp01((average(semanticEdges) * 0.74) + (average(memoryEdges) * 0.18) + tagBonus);
}

function computePhoneticScore(relationScores) {
  return clamp01(
    (average(relationScores.PHONETIC_SIMILARITY) * 0.84)
    + (average(relationScores.SEQUENTIAL_LIKELIHOOD) * 0.08)
    + (average(relationScores.SYNTACTIC_COMPATIBILITY) * 0.08)
  );
}

function computeSchoolScore(node, relationScores, currentSchool) {
  const normalizedSchool = String(currentSchool || '').trim().toUpperCase();
  const resonanceEdges = average(relationScores.SCHOOL_RESONANCE);
  if (!normalizedSchool) return clamp01(resonanceEdges);

  const schoolBias = Number(node?.schoolBias?.[normalizedSchool]) || 0;
  return clamp01((schoolBias * 0.7) + (resonanceEdges * 0.3));
}

function computeNoveltyScore(node) {
  const frequencyScore = Number(node?.frequencyScore);
  if (!Number.isFinite(frequencyScore) || frequencyScore <= 0) return 0.56;
  return clamp01(1 / (1 + Math.log10(1 + frequencyScore)));
}

function buildTrace(heuristic, rawScore, weight, explanation, commentary = undefined) {
  const safeRawScore = clamp01(rawScore);
  const safeWeight = clamp01(weight);
  return {
    heuristic,
    rawScore: safeRawScore,
    weight: safeWeight,
    contribution: safeRawScore * safeWeight,
    explanation,
    ...(commentary ? { commentary } : {}),
  };
}

export function scoreGraphCandidates(graph, paths = [], context = {}) {
  const syntaxContext = context.syntaxContext || null;
  const currentSchool = context.currentSchool || null;
  const prefix = context.prefix || '';

  const candidates = paths
    .map((path) => {
      const node = graph?.nodes?.get?.(path.nodeId);
      if (!node) return null;
      if (node.nodeType !== 'LEXEME' && node.nodeType !== 'SCROLL_TOKEN') return null;

      const relationScores = buildRelationScores(path.pathEdges);
      const activationScore = clamp01(path.activationScore);
      const legalityScore = computeLegalityScore(node, relationScores, syntaxContext, prefix);
      if (legalityScore <= 0) return null;

      const semanticScore = computeSemanticScore(node, relationScores);
      const phoneticScore = computePhoneticScore(relationScores);
      const schoolScore = computeSchoolScore(node, relationScores, currentSchool);
      const noveltyScore = computeNoveltyScore(node);
      const connectedness = clamp01((path.pathEdges.length + 1) / 3);
      const pathCoherence = path.pathEdges.length > 0
        ? clamp01(average(path.pathEdges.map((edge) => edge.weight)))
        : activationScore;

      const blendedActivation = clamp01((activationScore * 0.72) + (pathCoherence * 0.28));
      const totalScore = clamp01(
        (blendedActivation * GRAPH_SCORE_WEIGHTS.activation)
        + (legalityScore * GRAPH_SCORE_WEIGHTS.legality)
        + (semanticScore * GRAPH_SCORE_WEIGHTS.semantic)
        + (phoneticScore * GRAPH_SCORE_WEIGHTS.phonetic)
        + (schoolScore * GRAPH_SCORE_WEIGHTS.school)
        + (noveltyScore * GRAPH_SCORE_WEIGHTS.novelty)
      );

      const trace = [
        buildTrace(
          'graph_activation',
          blendedActivation,
          GRAPH_SCORE_WEIGHTS.activation,
          `Traversal carried ${Math.round(blendedActivation * 100)}% activation across ${path.pathEdges.length} edge${path.pathEdges.length !== 1 ? 's' : ''}.`,
        ),
        buildTrace(
          'graph_legality',
          legalityScore,
          GRAPH_SCORE_WEIGHTS.legality,
          `Syntax gate leaves ${Math.round(legalityScore * 100)}% legality for ${String(node.token || '').toLowerCase()}.`,
        ),
        buildTrace(
          'graph_semantic',
          semanticScore,
          GRAPH_SCORE_WEIGHTS.semantic,
          `Semantic and memory links hold at ${Math.round(semanticScore * 100)}%.`,
        ),
        buildTrace(
          'graph_phonetic',
          phoneticScore,
          GRAPH_SCORE_WEIGHTS.phonetic,
          `Phonetic and sequential resonance hold at ${Math.round(phoneticScore * 100)}%.`,
        ),
        buildTrace(
          'graph_school',
          schoolScore,
          GRAPH_SCORE_WEIGHTS.school,
          `School resonance contributes ${Math.round(schoolScore * 100)}%.`,
        ),
        buildTrace(
          'graph_novelty',
          noveltyScore,
          GRAPH_SCORE_WEIGHTS.novelty,
          `Novelty contributes ${Math.round(noveltyScore * 100)}% after frequency damping.`,
        ),
      ];

      return {
        nodeId: path.nodeId,
        token: node.token,
        activationScore: blendedActivation,
        legalityScore,
        semanticScore,
        phoneticScore,
        schoolScore,
        noveltyScore,
        totalScore,
        trace,
        path,
        connectedness,
        pathCoherence,
      };
    })
    .filter(Boolean);

  return candidates.sort((candidateA, candidateB) => {
    if ((candidateB.totalScore || 0) !== (candidateA.totalScore || 0)) {
      return (candidateB.totalScore || 0) - (candidateA.totalScore || 0);
    }
    if ((candidateB.connectedness || 0) !== (candidateA.connectedness || 0)) {
      return (candidateB.connectedness || 0) - (candidateA.connectedness || 0);
    }
    return stableTokenCompare(candidateA.token, candidateB.token);
  });
}
