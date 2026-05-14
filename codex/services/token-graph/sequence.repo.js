import { createGraphEdge, createGraphNode } from '../../core/token-graph/build.js';
import { clamp01, normalizeGraphToken } from '../../core/token-graph/types.js';

function normalizeSequenceWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.trunc(numeric));
}

function normalizeSequenceEntry(entry) {
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const [fromToken, toToken, weight = 1] = entry;
    const from = normalizeGraphToken(fromToken);
    const to = normalizeGraphToken(toToken);
    if (!from || !to) return null;
    return { from, to, weight: normalizeSequenceWeight(weight) };
  }

  const from = normalizeGraphToken(entry.from ?? entry.prev);
  const to = normalizeGraphToken(entry.to ?? entry.next);
  if (!from || !to) return null;
  return {
    from,
    to,
    weight: normalizeSequenceWeight(entry.weight ?? entry.count ?? entry.frequency ?? 1),
  };
}

function rankToWeight(entries) {
  const total = entries.length || 1;
  return entries.map((entry, index) => ({
    ...entry,
    normalizedWeight: clamp01(1 - (index / total)),
  }));
}

export function createTokenGraphSequenceRepo(options = {}) {
  const trie = options.trie ?? null;
  const sequenceEntries = Array.isArray(options.sequences) ? options.sequences : [];
  const sequenceMap = new Map();

  sequenceEntries.forEach((entry) => {
    const normalized = normalizeSequenceEntry(entry);
    if (!normalized) return;
    const key = `${normalized.from}\u0000${normalized.to}`;
    sequenceMap.set(key, (sequenceMap.get(key) || 0) + normalized.weight);
  });

  function getTransitions(token, limit = 24) {
    const normalizedToken = normalizeGraphToken(token);
    if (!normalizedToken) return [];

    if (trie && typeof trie.predictNextEntries === 'function') {
      return rankToWeight(
        trie.predictNextEntries(normalizedToken, limit)
          .map((entry) => ({
            from: normalizedToken,
            to: normalizeGraphToken(entry.word),
            weight: normalizeSequenceWeight(entry.weight ?? entry.frequency ?? 1),
          }))
          .filter((entry) => entry.to),
      );
    }

    const ranked = [...sequenceMap.entries()]
      .map(([key, weight]) => {
        const [from, to] = key.split('\u0000');
        return { from, to, weight };
      })
      .filter((entry) => entry.from === normalizedToken)
      .sort((entryA, entryB) => {
        if (entryB.weight !== entryA.weight) return entryB.weight - entryA.weight;
        return entryA.to.localeCompare(entryB.to);
      })
      .slice(0, limit);

    const maxWeight = ranked[0]?.weight || 1;
    return ranked.map((entry) => ({
      ...entry,
      normalizedWeight: clamp01(entry.weight / maxWeight),
    }));
  }

  function getPrefixCandidates(prefix, limit = 24) {
    const normalizedPrefix = normalizeGraphToken(prefix);
    if (!normalizedPrefix) return [];
    if (trie && typeof trie.predictEntries === 'function') {
      return rankToWeight(
        trie.predictEntries(normalizedPrefix, limit)
          .map((entry) => ({
            word: normalizeGraphToken(entry.word),
            weight: normalizeSequenceWeight(entry.frequency ?? entry.weight ?? 1),
          }))
          .filter((entry) => entry.word),
      );
    }
    return [];
  }

  function buildNeighborhood(anchorTokens = [], neighborhoodOptions = {}) {
    const limit = Number.isInteger(Number(neighborhoodOptions.limit))
      ? Number(neighborhoodOptions.limit)
      : 24;

    const nodes = [];
    const edges = [];
    const nodeLookup = new Map();

    const ensureNode = (token) => {
      const normalized = normalizeGraphToken(token);
      if (!normalized) return null;
      const nodeId = `lexeme:${normalized}`;
      if (nodeLookup.has(nodeId)) return nodeLookup.get(nodeId);
      const node = createGraphNode({
        id: nodeId,
        token: normalized,
        normalized,
        nodeType: 'LEXEME',
      });
      nodeLookup.set(node.id, node);
      nodes.push(node);
      return node;
    };

    [...new Set((Array.isArray(anchorTokens) ? anchorTokens : [])
      .map(normalizeGraphToken)
      .filter(Boolean))].forEach((token) => {
      const fromNode = ensureNode(token);
      if (!fromNode) return;
      getTransitions(token, limit).forEach((transition) => {
        const toNode = ensureNode(transition.to);
        if (!toNode) return;
        edges.push({
          fromId: fromNode.id,
          toId: toNode.id,
          relation: 'SEQUENTIAL_LIKELIHOOD',
          weight: transition.normalizedWeight,
          evidence: ['sequence_memory'],
          dimensions: {
            rawWeight: transition.weight,
          },
        });
      });
    });

    const graphNodeLookup = new Map(nodes.map((node) => [node.id, node]));
    return {
      nodes,
      edges: edges
        .map((edge) => createGraphEdge(edge, graphNodeLookup))
        .filter(Boolean),
      getPrefixCandidates,
      getTransitions,
    };
  }

  return {
    getTransitions,
    getPrefixCandidates,
    buildNeighborhood,
  };
}
