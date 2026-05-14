import {
  OBJECTS,
  PREDICATES,
  lookupSemanticToken,
  normalizeSemanticKeyword,
} from '../../core/semantics.registry.js';
import { SYNERGIES, WORD_SYNERGY_MAP } from '../../core/nexus.registry.js';
import {
  createGraphEdge,
  createGraphNode,
  createSchoolAnchorNode,
  createSemanticAnchorNode,
} from '../../core/token-graph/build.js';
import { normalizeGraphToken } from '../../core/token-graph/types.js';

const RELATION_WEIGHTS = Object.freeze({
  predicate: 0.92,
  object: 0.82,
  synonym: 0.84,
  antonym: 0.52,
  etymology: 0.38,
  synergy: 0.72,
  school: 0.76,
});

function scoreRelatedWordWeight(kind) {
  return RELATION_WEIGHTS[kind] || 0.5;
}

function toLexemeNode(token, school = null, semanticTags = []) {
  const normalized = normalizeGraphToken(token);
  if (!normalized) return null;
  const schoolBias = school ? { [String(school).trim().toUpperCase()]: RELATION_WEIGHTS.school } : {};
  return createGraphNode({
    token: normalized,
    normalized,
    nodeType: 'LEXEME',
    schoolBias,
    semanticTags,
  });
}

function addBidirectionalEdge(edges, fromNode, toNode, relation, weight, evidence = [], dimensions = undefined) {
  if (!fromNode || !toNode) return;
  edges.push({
    fromId: fromNode.id,
    toId: toNode.id,
    relation,
    weight,
    evidence,
    dimensions,
  });
  edges.push({
    fromId: toNode.id,
    toId: fromNode.id,
    relation,
    weight,
    evidence,
    dimensions,
  });
}

export function createTokenGraphSemanticRepo() {
  function buildNeighborhood(options = {}) {
    const nodes = [];
    const edges = [];
    const nodeLookup = new Map();

    const seedTokens = [...new Set((Array.isArray(options.tokens) ? options.tokens : [])
      .map(normalizeGraphToken)
      .filter(Boolean))];
    const lexicalEntriesByToken = options.lexicalEntriesByToken && typeof options.lexicalEntriesByToken === 'object'
      ? options.lexicalEntriesByToken
      : {};

    const ensureNode = (token, school = null, semanticTags = []) => {
      const node = toLexemeNode(token, school, semanticTags);
      if (!node) return null;
      const existing = nodeLookup.get(node.id);
      if (existing) return existing;
      nodeLookup.set(node.id, node);
      nodes.push(node);
      return node;
    };

    const ensureSchoolAnchor = (school) => {
      const anchor = createSchoolAnchorNode(school);
      if (!anchor) return null;
      if (nodeLookup.has(anchor.id)) return nodeLookup.get(anchor.id);
      nodeLookup.set(anchor.id, anchor);
      nodes.push(anchor);
      return anchor;
    };

    const ensureSemanticAnchor = (tag) => {
      const anchor = createSemanticAnchorNode(tag);
      if (!anchor) return null;
      if (nodeLookup.has(anchor.id)) return nodeLookup.get(anchor.id);
      nodeLookup.set(anchor.id, anchor);
      nodes.push(anchor);
      return anchor;
    };

    seedTokens.forEach((token) => {
      const semantic = lookupSemanticToken(token);
      const tagList = semantic?.type
        ? [semantic.type, semantic.intent || semantic.category || null].filter(Boolean)
        : [];
      const sourceNode = ensureNode(token, semantic?.school || null, tagList);
      if (!sourceNode) return;

      if (semantic) {
        const semanticAnchor = ensureSemanticAnchor(`${semantic.type}:${semantic.intent || semantic.category || token}`);
        if (semanticAnchor) {
          addBidirectionalEdge(
            edges,
            sourceNode,
            semanticAnchor,
            'SEMANTIC_ASSOCIATION',
            semantic.type === 'PREDICATE' ? RELATION_WEIGHTS.predicate : RELATION_WEIGHTS.object,
            [`registry:${semantic.type.toLowerCase()}`],
          );
        }

        if (semantic.school) {
          const schoolAnchor = ensureSchoolAnchor(semantic.school);
          if (schoolAnchor) {
            addBidirectionalEdge(
              edges,
              sourceNode,
              schoolAnchor,
              'SCHOOL_RESONANCE',
              RELATION_WEIGHTS.school,
              ['semantic_school_bias'],
            );
          }
        }
      }

      const synergyIds = WORD_SYNERGY_MAP[String(token || '').toUpperCase()] || [];
      synergyIds.forEach((synergyId) => {
        const synergy = SYNERGIES[synergyId];
        const synergyAnchor = ensureSemanticAnchor(`synergy:${synergyId.toLowerCase()}`);
        if (!synergyAnchor) return;
        addBidirectionalEdge(
          edges,
          sourceNode,
          synergyAnchor,
          'MEMORY_AFFINITY',
          RELATION_WEIGHTS.synergy,
          [`synergy:${synergyId.toLowerCase()}`],
        );
        if (synergy?.school) {
          const schoolAnchor = ensureSchoolAnchor(synergy.school);
          if (schoolAnchor) {
            addBidirectionalEdge(
              edges,
              sourceNode,
              schoolAnchor,
              'SCHOOL_RESONANCE',
              RELATION_WEIGHTS.school,
              ['synergy_school_resonance'],
            );
          }
        }
      });

      const lexicalEntry = lexicalEntriesByToken[token] || lexicalEntriesByToken[token.toUpperCase()] || null;
      if (!lexicalEntry || typeof lexicalEntry !== 'object') return;

      [
        ['synonyms', 'synonym'],
        ['antonyms', 'antonym'],
      ].forEach(([field, kind]) => {
        const values = Array.isArray(lexicalEntry[field]) ? lexicalEntry[field] : [];
        values.forEach((relatedToken) => {
          const relatedNode = ensureNode(relatedToken);
          if (!relatedNode) return;
          addBidirectionalEdge(
            edges,
            sourceNode,
            relatedNode,
            'SEMANTIC_ASSOCIATION',
            scoreRelatedWordWeight(kind),
            [`lexical:${field}`],
          );
        });
      });

      const etymology = normalizeSemanticKeyword(lexicalEntry.etymology);
      if (etymology) {
        const etymologyAnchor = ensureSemanticAnchor(`etymology:${etymology}`);
        if (etymologyAnchor) {
          addBidirectionalEdge(
            edges,
            sourceNode,
            etymologyAnchor,
            'SEMANTIC_ASSOCIATION',
            RELATION_WEIGHTS.etymology,
            ['lexical:etymology'],
          );
        }
      }
    });

    const graphNodeLookup = new Map(nodes.map((node) => [node.id, node]));
    const graphEdges = edges
      .map((edge) => createGraphEdge(edge, graphNodeLookup))
      .filter(Boolean);

    return {
      nodes,
      edges: graphEdges,
      registries: {
        predicates: Object.keys(PREDICATES),
        objects: Object.keys(OBJECTS),
      },
    };
  }

  return {
    buildNeighborhood,
  };
}
