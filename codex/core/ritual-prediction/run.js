import { createJudiciaryEngine } from '../judiciary.js';
import {
  buildTokenGraph,
  createGraphNode,
  createSchoolAnchorNode,
} from '../token-graph/build.js';
import { buildContextActivation } from '../token-graph/activation.js';
import { traverseTokenGraph } from '../token-graph/traverse.js';
import { scoreGraphCandidates } from '../token-graph/score.js';
import {
  DEFAULT_TOKEN_GRAPH_LIMITS,
  clamp01,
  normalizeGraphToken,
} from '../token-graph/types.js';
import { getPrimaryPhoneticAnchors, buildActivationAnchorTokens, getAnchorSeedTokens } from './anchors.js';
import { createRitualPredictionContext } from './context.js';
import { createRitualPredictionArtifact } from './artifact.js';
import { rerankCandidates, isTurboQuantEnabled } from './reranker.js';
import { enforceTurboQAGates } from './turboqa.js';

function clampPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function normalizeAnalysisVowelFamily(analysis) {
  if (Array.isArray(analysis?.vowelFamily)) {
    return String(analysis.vowelFamily[0] || '').trim().toUpperCase() || null;
  }
  return String(analysis?.vowelFamily || '').trim().toUpperCase() || null;
}

function createPredictionLexemeNode(token, analysis, rankWeight = 0, resolveSchool = null) {
  const normalized = normalizeGraphToken(token);
  if (!normalized) return null;

  const resolvedSchool = typeof resolveSchool === 'function'
    ? resolveSchool(analysis, normalized)
    : null;
  const vowelFamily = normalizeAnalysisVowelFamily(analysis);
  const phonemes = Array.isArray(analysis?.phonemes) ? [...analysis.phonemes] : [];
  const onsetSignature = phonemes.length > 0
    ? String(phonemes[0]).replace(/[0-9]/g, '')
    : '';

  return createGraphNode({
    id: `lexeme:${normalized}`,
    token: normalized,
    normalized,
    nodeType: 'LEXEME',
    schoolBias: resolvedSchool
      ? { [resolvedSchool]: clamp01(0.52 + (clamp01(rankWeight) * 0.36)) }
      : {},
    frequencyScore: Math.max(1, Math.round((1 - clamp01(rankWeight)) * 100)),
    phoneticSignature: analysis
      ? {
        phonemes,
        vowelSkeleton: vowelFamily ? [vowelFamily] : [],
        consonantSkeleton: analysis?.coda ? [analysis.coda] : [],
        endingSignature: analysis?.rhymeKey || '',
        onsetSignature,
        stressPattern: String(analysis?.stressPattern || ''),
        syllableCount: Number(analysis?.syllableCount) || 0,
      }
      : undefined,
  });
}

function mergeWeightedEntries(entries = [], identityKey) {
  const merged = new Map();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const key = identityKey(entry);
    if (!key) return;
    const existing = merged.get(key) || null;
    if (!existing) {
      merged.set(key, { ...entry });
      return;
    }
    merged.set(key, {
      ...existing,
      ...entry,
      normalizedWeight: Math.max(
        Number(existing.normalizedWeight) || 0,
        Number(entry.normalizedWeight) || 0,
      ),
      weight: Math.max(Number(existing.weight) || 0, Number(entry.weight) || 0),
    });
  });

  return [...merged.values()];
}

function collectPrefixEntries(prefix, sequenceGraphRepo, limit) {
  if (!sequenceGraphRepo || typeof sequenceGraphRepo.getPrefixCandidates !== 'function') return [];
  const normalizedPrefix = normalizeGraphToken(prefix);
  if (!normalizedPrefix) return [];
  return mergeWeightedEntries(
    sequenceGraphRepo.getPrefixCandidates(normalizedPrefix, limit),
    (entry) => normalizeGraphToken(entry?.word),
  );
}

function collectTransitionEntries(anchorTokens, sequenceGraphRepo, limit) {
  if (!sequenceGraphRepo || typeof sequenceGraphRepo.getTransitions !== 'function') return [];

  const weightedTransitions = [];
  [...new Set(Array.isArray(anchorTokens) ? anchorTokens : [])].forEach((token) => {
    const normalizedToken = normalizeGraphToken(token);
    if (!normalizedToken) return;
    const transitions = sequenceGraphRepo.getTransitions(normalizedToken, limit);
    transitions.forEach((transition) => {
      weightedTransitions.push({
        ...transition,
        from: normalizedToken,
      });
    });
  });

  return mergeWeightedEntries(weightedTransitions, (entry) => normalizeGraphToken(entry?.to));
}

function buildLocalPhoneticEdges(anchorTokens, candidateTokens, analysisByToken) {
  const edges = [];

  [...new Set(Array.isArray(anchorTokens) ? anchorTokens : [])].forEach((anchorToken) => {
    const normalizedAnchor = normalizeGraphToken(anchorToken);
    if (!normalizedAnchor) return;
    const anchorAnalysis = analysisByToken.get(normalizedAnchor);
    if (!anchorAnalysis) return;

    candidateTokens.forEach((candidateToken) => {
      const normalizedToken = normalizeGraphToken(candidateToken);
      if (!normalizedToken || normalizedToken === normalizedAnchor) return;
      const candidateAnalysis = analysisByToken.get(normalizedToken);
      if (!candidateAnalysis) return;

      let weight = 0;
      const evidence = [];

      if (anchorAnalysis.rhymeKey && anchorAnalysis.rhymeKey === candidateAnalysis.rhymeKey) {
        weight = 0.82;
        evidence.push('shared_rhyme_key');
      } else if (
        normalizeAnalysisVowelFamily(anchorAnalysis)
        && normalizeAnalysisVowelFamily(anchorAnalysis) === normalizeAnalysisVowelFamily(candidateAnalysis)
      ) {
        weight = 0.6;
        evidence.push('shared_vowel_family');
      } else if (anchorAnalysis.coda && anchorAnalysis.coda === candidateAnalysis.coda) {
        weight = 0.44;
        evidence.push('shared_coda');
      }

      if (weight <= 0) return;

      edges.push({
        fromId: `lexeme:${normalizedAnchor}`,
        toId: `lexeme:${normalizedToken}`,
        relation: 'PHONETIC_SIMILARITY',
        weight,
        evidence,
      });
      edges.push({
        fromId: `lexeme:${normalizedToken}`,
        toId: `lexeme:${normalizedAnchor}`,
        relation: 'PHONETIC_SIMILARITY',
        weight,
        evidence,
      });
    });
  });

  return edges;
}

function buildLocalSchoolEdges(candidateNodes, currentSchool) {
  const safeSchool = String(currentSchool || '').trim().toUpperCase();
  if (!safeSchool) return [];

  const schoolAnchorId = `school:${safeSchool}`;
  const edges = [];

  candidateNodes.forEach((node) => {
    const resonance = Number(node?.schoolBias?.[safeSchool]) || 0;
    if (resonance <= 0) return;

    edges.push({
      fromId: schoolAnchorId,
      toId: node.id,
      relation: 'SCHOOL_RESONANCE',
      weight: resonance,
      evidence: ['local_school_bias'],
    });
    edges.push({
      fromId: node.id,
      toId: schoolAnchorId,
      relation: 'SCHOOL_RESONANCE',
      weight: resonance,
      evidence: ['local_school_bias'],
    });
  });

  return edges;
}

function collectCandidateTokens(prefixEntries, transitionEntries) {
  const tokens = new Set();

  prefixEntries.forEach((entry) => {
    const token = normalizeGraphToken(entry?.word);
    if (token) tokens.add(token);
  });
  transitionEntries.forEach((entry) => {
    const token = normalizeGraphToken(entry?.to);
    if (token) tokens.add(token);
  });

  return [...tokens];
}

function analyzeTokens(tokens, analyzeWord) {
  const analysisByToken = new Map();

  [...new Set(Array.isArray(tokens) ? tokens : [])].forEach((token) => {
    const normalized = normalizeGraphToken(token);
    if (!normalized) return;
    const analysis = typeof analyzeWord === 'function' ? analyzeWord(normalized) : null;
    analysisByToken.set(normalized, analysis);
  });

  return analysisByToken;
}

function fallbackEmptyPrediction(context, diagnostics = []) {
  const artifact = createRitualPredictionArtifact({
    context,
    candidates: [],
    winner: null,
    diagnostics,
  });

  return {
    context,
    activation: null,
    graph: null,
    candidates: [],
    winner: null,
    artifact,
  };
}

export async function runRitualPrediction(request = {}, dependencies = {}, options = {}) {
  const context = createRitualPredictionContext(request, options);
  const diagnostics = [];
  const sequenceGraphRepo = dependencies.sequenceGraphRepo || null;
  const semanticGraphRepo = dependencies.semanticGraphRepo || null;
  const analyzeWord = dependencies.analyzeWord || null;
  const resolveSchool = dependencies.resolveSchool || null;
  const judiciary = dependencies.judiciary || createJudiciaryEngine();

  if (!sequenceGraphRepo) {
    diagnostics.push({
      source: 'ritual_prediction',
      severity: 'warn',
      message: 'Sequence graph repository unavailable; no ritual prediction candidates could be produced.',
    });
    return fallbackEmptyPrediction(context, diagnostics);
  }

  const candidateLimit = clampPositiveInteger(
    options.maxCandidates ?? context.maxCandidates,
    DEFAULT_TOKEN_GRAPH_LIMITS.maxCandidates,
  );
  const queryLimit = Math.max(candidateLimit * 3, 24);
  const anchorEntries = buildActivationAnchorTokens(context);
  const anchorSeedTokens = getAnchorSeedTokens(context);
  const prefixEntries = collectPrefixEntries(context.prefix, sequenceGraphRepo, queryLimit);
  const transitionEntries = collectTransitionEntries(anchorSeedTokens, sequenceGraphRepo, queryLimit);
  const candidateTokens = collectCandidateTokens(prefixEntries, transitionEntries);

  if (candidateTokens.length === 0) {
    return fallbackEmptyPrediction(context, diagnostics);
  }

  const analysisByToken = analyzeTokens([
    ...candidateTokens,
    ...getPrimaryPhoneticAnchors(context),
  ], analyzeWord);
  const rankWeightByToken = new Map();

  prefixEntries.forEach((entry) => {
    const token = normalizeGraphToken(entry?.word);
    if (!token) return;
    rankWeightByToken.set(token, Math.max(rankWeightByToken.get(token) || 0, entry.normalizedWeight || 0));
  });
  transitionEntries.forEach((entry) => {
    const token = normalizeGraphToken(entry?.to);
    if (!token) return;
    rankWeightByToken.set(token, Math.max(rankWeightByToken.get(token) || 0, entry.normalizedWeight || 0));
  });

  const candidateNodes = candidateTokens
    .map((token) => createPredictionLexemeNode(
      token,
      analysisByToken.get(token),
      rankWeightByToken.get(token) || 0,
      resolveSchool,
    ))
    .filter(Boolean);

  const schoolAnchor = context.currentSchool
    ? createSchoolAnchorNode(context.currentSchool)
    : null;
  const sequenceNeighborhood = typeof sequenceGraphRepo.buildNeighborhood === 'function'
    ? sequenceGraphRepo.buildNeighborhood(anchorSeedTokens, { limit: queryLimit })
    : { nodes: [], edges: [] };
  const semanticNeighborhood = semanticGraphRepo && typeof semanticGraphRepo.buildNeighborhood === 'function'
    ? semanticGraphRepo.buildNeighborhood({
      tokens: [...candidateTokens, ...anchorSeedTokens],
    })
    : { nodes: [], edges: [] };
  const localPhoneticEdges = buildLocalPhoneticEdges(
    getPrimaryPhoneticAnchors(context),
    candidateTokens,
    analysisByToken,
  );
  const localSchoolEdges = buildLocalSchoolEdges(candidateNodes, context.currentSchool);

  const graph = buildTokenGraph({
    nodes: [
      ...candidateNodes,
      ...(schoolAnchor ? [schoolAnchor] : []),
      ...(sequenceNeighborhood.nodes || []),
      ...(semanticNeighborhood.nodes || []),
    ],
    edges: [
      ...(sequenceNeighborhood.edges || []),
      ...(semanticNeighborhood.edges || []),
      ...localPhoneticEdges,
      ...localSchoolEdges,
    ],
  });

  const activation = buildContextActivation(graph, {
    currentToken: context.currentToken,
    prevToken: context.prevToken,
    lineEndToken: context.lineEndToken,
    currentSchool: context.currentSchool,
    anchorTokens: anchorEntries,
    prefix: context.prefix,
    syntaxContext: context.syntaxContext,
    maxDepth: context.maxDepth,
    maxFanout: context.maxFanout,
    decay: context.decay,
  });

  const traversed = traverseTokenGraph(graph, activation);
  const scoredCandidates = scoreGraphCandidates(graph, traversed, activation).slice(0, candidateLimit);
  const graphRankedCandidates = judiciary.rankGraphCandidates(scoredCandidates);

  // Pass 2: TurboQuant Vector Reranking
  const candidates = await rerankCandidates(graphRankedCandidates, context, dependencies, options);

  if (isTurboQuantEnabled(options)) {
    enforceTurboQAGates(graphRankedCandidates, candidates, {
      topK: Math.min(5, candidateLimit),
    });
  }

  const winner = candidates[0] || null;
  const artifact = createRitualPredictionArtifact({
    context,
    candidates,
    winner,
    diagnostics,
  });

  return {
    context,
    activation,
    graph,
    candidates,
    winner,
    artifact,
  };
}

export function createRitualPredictionEngine(dependencies = {}, options = {}) {
  return {
    async run(request = {}, runOptions = {}) {
      return await runRitualPrediction(request, dependencies, {
        ...options,
        ...runOptions,
      });
    },
    async predictTokens(request = {}, runOptions = {}) {
      const result = await runRitualPrediction(request, dependencies, {
        ...options,
        ...runOptions,
      });
      const limit = clampPositiveInteger(
        request.limit ?? runOptions.limit,
        5,
      );
      return result.candidates.slice(0, limit).map((candidate) => candidate.token);
    },
  };
}
