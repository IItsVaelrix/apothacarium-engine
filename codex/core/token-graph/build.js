import {
  TOKEN_GRAPH_NODE_TYPES,
  TOKEN_GRAPH_RELATIONS,
  clamp01,
  compareWeightedEdges,
  mergeUniqueStrings,
  normalizeGraphToken,
  normalizeGraphWeight,
  normalizeSchoolId,
} from './types.js';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNodeType(nodeType) {
  const candidate = String(nodeType || '').trim().toUpperCase();
  return TOKEN_GRAPH_NODE_TYPES.includes(candidate) ? candidate : 'LEXEME';
}

function normalizeRelation(relation) {
  const candidate = String(relation || '').trim().toUpperCase();
  return TOKEN_GRAPH_RELATIONS.includes(candidate)
    ? candidate
    : 'SEMANTIC_ASSOCIATION';
}

function normalizeSchoolBias(value) {
  if (!isRecord(value)) return {};
  const schoolBias = {};
  Object.entries(value).forEach(([school, weight]) => {
    const normalizedSchool = normalizeSchoolId(school);
    if (!normalizedSchool) return;
    schoolBias[normalizedSchool] = clamp01(weight);
  });
  return schoolBias;
}

function mergeSchoolBias(baseBias = {}, nextBias = {}) {
  const merged = { ...baseBias };
  Object.entries(normalizeSchoolBias(nextBias)).forEach(([school, weight]) => {
    merged[school] = Math.max(clamp01(merged[school]), clamp01(weight));
  });
  return merged;
}

function mergeDimensions(baseDimensions = {}, nextDimensions = {}) {
  const merged = { ...baseDimensions };
  Object.entries(isRecord(nextDimensions) ? nextDimensions : {}).forEach(([key, value]) => {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return;
    merged[key] = Math.max(Number(merged[key]) || 0, normalized);
  });
  return merged;
}

function createNodeId(node = {}) {
  if (typeof node.id === 'string' && node.id.trim()) return node.id.trim();
  const token = normalizeGraphToken(node.token || node.normalized);
  const nodeType = normalizeNodeType(node.nodeType);
  if (!token) {
    return `${nodeType.toLowerCase()}:anonymous`;
  }
  if (nodeType === 'SCHOOL_ANCHOR') {
    return `school:${normalizeSchoolId(node.token || token)}`;
  }
  if (nodeType === 'SEMANTIC_ANCHOR') {
    return `semantic:${token}`;
  }
  return `${nodeType.toLowerCase()}:${token}`;
}

function normalizeNode(node = {}) {
  const token = String(node.token || node.normalized || '').trim();
  const normalized = normalizeGraphToken(node.normalized || node.token);
  const nodeType = normalizeNodeType(node.nodeType);
  const id = createNodeId({ ...node, token, normalized, nodeType });

  return {
    id,
    token: token || normalized,
    normalized,
    nodeType,
    schoolBias: normalizeSchoolBias(node.schoolBias),
    phoneticSignature: isRecord(node.phoneticSignature) ? { ...node.phoneticSignature } : undefined,
    semanticTags: mergeUniqueStrings(node.semanticTags),
    frequencyScore: Number.isFinite(Number(node.frequencyScore))
      ? Math.max(0, Number(node.frequencyScore))
      : undefined,
  };
}

function mergeNode(baseNode, nextNode) {
  return {
    ...baseNode,
    ...nextNode,
    token: baseNode.token || nextNode.token,
    normalized: baseNode.normalized || nextNode.normalized,
    nodeType: nextNode.nodeType || baseNode.nodeType,
    schoolBias: mergeSchoolBias(baseNode.schoolBias, nextNode.schoolBias),
    phoneticSignature: nextNode.phoneticSignature || baseNode.phoneticSignature,
    semanticTags: mergeUniqueStrings(baseNode.semanticTags, nextNode.semanticTags),
    frequencyScore: Math.max(
      Number(baseNode.frequencyScore) || 0,
      Number(nextNode.frequencyScore) || 0,
    ) || undefined,
  };
}

function createEdgeId(edge = {}) {
  if (typeof edge.id === 'string' && edge.id.trim()) return edge.id.trim();
  return [
    String(edge.fromId || '').trim(),
    String(edge.toId || '').trim(),
    normalizeRelation(edge.relation),
  ].join('::');
}

function normalizeEdge(edge = {}, nodeLookup = new Map()) {
  const fromId = String(edge.fromId || '').trim();
  const toId = String(edge.toId || '').trim();
  if (!fromId || !toId || !nodeLookup.has(fromId) || !nodeLookup.has(toId)) return null;

  return {
    id: createEdgeId({ ...edge, fromId, toId }),
    fromId,
    toId,
    relation: normalizeRelation(edge.relation),
    weight: normalizeGraphWeight(edge.weight),
    evidence: mergeUniqueStrings(edge.evidence),
    dimensions: mergeDimensions({}, edge.dimensions),
  };
}

function mergeEdge(baseEdge, nextEdge) {
  return {
    ...baseEdge,
    weight: Math.max(normalizeGraphWeight(baseEdge.weight), normalizeGraphWeight(nextEdge.weight)),
    evidence: mergeUniqueStrings(baseEdge.evidence, nextEdge.evidence),
    dimensions: mergeDimensions(baseEdge.dimensions, nextEdge.dimensions),
  };
}

export function createGraphNode(node) {
  return normalizeNode(node);
}

export function createGraphEdge(edge, nodeLookup) {
  return normalizeEdge(edge, nodeLookup);
}

export function createSchoolAnchorNode(school) {
  const normalizedSchool = normalizeSchoolId(school);
  if (!normalizedSchool) return null;
  return normalizeNode({
    id: `school:${normalizedSchool}`,
    token: normalizedSchool,
    normalized: normalizedSchool.toLowerCase(),
    nodeType: 'SCHOOL_ANCHOR',
  });
}

export function createSemanticAnchorNode(tag) {
  const normalizedTag = normalizeGraphToken(tag);
  if (!normalizedTag) return null;
  return normalizeNode({
    id: `semantic:${normalizedTag}`,
    token: normalizedTag,
    normalized: normalizedTag,
    nodeType: 'SEMANTIC_ANCHOR',
    semanticTags: [normalizedTag],
  });
}

export function buildTokenGraph({ nodes = [], edges = [] } = {}) {
  const nodeLookup = new Map();
  const nodeIdsByNormalized = new Map();

  nodes.forEach((node) => {
    const normalizedNode = normalizeNode(node);
    if (!normalizedNode.id) return;
    const existing = nodeLookup.get(normalizedNode.id);
    nodeLookup.set(
      normalizedNode.id,
      existing ? mergeNode(existing, normalizedNode) : normalizedNode,
    );
  });

  nodeLookup.forEach((node) => {
    if (!node.normalized) return;
    const currentIds = nodeIdsByNormalized.get(node.normalized) || [];
    currentIds.push(node.id);
    currentIds.sort((a, b) => String(a).localeCompare(String(b)));
    nodeIdsByNormalized.set(node.normalized, [...new Set(currentIds)]);
  });

  const edgeLookup = new Map();
  edges.forEach((edge) => {
    const normalizedEdge = normalizeEdge(edge, nodeLookup);
    if (!normalizedEdge) return;
    const existing = edgeLookup.get(normalizedEdge.id);
    edgeLookup.set(
      normalizedEdge.id,
      existing ? mergeEdge(existing, normalizedEdge) : normalizedEdge,
    );
  });

  const outgoing = new Map();
  const incoming = new Map();
  edgeLookup.forEach((edge) => {
    const currentOutgoing = outgoing.get(edge.fromId) || [];
    currentOutgoing.push(edge);
    outgoing.set(edge.fromId, currentOutgoing);

    const currentIncoming = incoming.get(edge.toId) || [];
    currentIncoming.push(edge);
    incoming.set(edge.toId, currentIncoming);
  });

  outgoing.forEach((edgeList, nodeId) => {
    edgeList.sort((edgeA, edgeB) => compareWeightedEdges(edgeA, edgeB, nodeLookup));
    outgoing.set(nodeId, edgeList);
  });
  incoming.forEach((edgeList, nodeId) => {
    edgeList.sort((edgeA, edgeB) => compareWeightedEdges(edgeA, edgeB, nodeLookup));
    incoming.set(nodeId, edgeList);
  });

  return {
    nodes: nodeLookup,
    edges: edgeLookup,
    outgoing,
    incoming,
    nodeIdsByNormalized,
  };
}

export function resolveNodeIdsByToken(graph, token) {
  const normalized = normalizeGraphToken(token);
  if (!normalized) return [];
  return graph?.nodeIdsByNormalized?.get?.(normalized) || [];
}
