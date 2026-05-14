import { DEFAULT_TOKEN_GRAPH_LIMITS, normalizeGraphToken } from './types.js';
import { resolveNodeIdsByToken } from './build.js';

const DEFAULT_ANCHOR_WEIGHTS = Object.freeze({
  currentToken: 1.0,
  prevToken: 0.92,
  lineEndToken: 0.84,
  school: 0.76,
  extraAnchor: 0.74,
});

function clampPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function clampPositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function addAnchorToken(graph, token, weight, anchorWeights, anchorNodeIds) {
  const nodeIds = resolveNodeIdsByToken(graph, token);
  nodeIds.forEach((nodeId) => {
    const currentWeight = anchorWeights[nodeId] || 0;
    if (weight > currentWeight) {
      anchorWeights[nodeId] = weight;
    }
    if (!anchorNodeIds.includes(nodeId)) {
      anchorNodeIds.push(nodeId);
    }
  });
}

export function buildContextActivation(graph, context = {}) {
  const anchorNodeIds = [];
  const anchorWeights = {};

  const currentToken = normalizeGraphToken(context.currentToken);
  const prevToken = normalizeGraphToken(context.prevToken);
  const lineEndToken = normalizeGraphToken(context.lineEndToken);
  const currentSchool = String(context.currentSchool || '').trim().toUpperCase() || null;
  const extraAnchors = Array.isArray(context.anchorTokens) ? context.anchorTokens : [];

  if (currentToken) {
    addAnchorToken(graph, currentToken, DEFAULT_ANCHOR_WEIGHTS.currentToken, anchorWeights, anchorNodeIds);
  }
  if (prevToken) {
    addAnchorToken(graph, prevToken, DEFAULT_ANCHOR_WEIGHTS.prevToken, anchorWeights, anchorNodeIds);
  }
  if (lineEndToken) {
    addAnchorToken(graph, lineEndToken, DEFAULT_ANCHOR_WEIGHTS.lineEndToken, anchorWeights, anchorNodeIds);
  }

  if (currentSchool) {
    const schoolAnchorId = `school:${currentSchool}`;
    if (graph?.nodes?.has?.(schoolAnchorId)) {
      anchorWeights[schoolAnchorId] = Math.max(anchorWeights[schoolAnchorId] || 0, DEFAULT_ANCHOR_WEIGHTS.school);
      if (!anchorNodeIds.includes(schoolAnchorId)) {
        anchorNodeIds.push(schoolAnchorId);
      }
    }
  }

  extraAnchors.forEach((anchor) => {
    if (typeof anchor === 'string') {
      addAnchorToken(graph, anchor, DEFAULT_ANCHOR_WEIGHTS.extraAnchor, anchorWeights, anchorNodeIds);
      return;
    }
    if (!anchor || typeof anchor !== 'object') return;
    addAnchorToken(
      graph,
      anchor.token,
      clampPositiveNumber(anchor.weight, DEFAULT_ANCHOR_WEIGHTS.extraAnchor),
      anchorWeights,
      anchorNodeIds,
    );
  });

  anchorNodeIds.sort((a, b) => String(a).localeCompare(String(b)));

  return {
    anchorNodeIds,
    anchorWeights,
    currentSchool,
    syntaxContext: context.syntaxContext || null,
    prefix: normalizeGraphToken(context.prefix),
    decay: clampPositiveNumber(context.decay, DEFAULT_TOKEN_GRAPH_LIMITS.decay),
    maxDepth: clampPositiveInteger(context.maxDepth, DEFAULT_TOKEN_GRAPH_LIMITS.maxDepth),
    maxFanout: clampPositiveInteger(context.maxFanout, DEFAULT_TOKEN_GRAPH_LIMITS.maxFanout),
  };
}
