/**
 * Spellweave Engine - The Syntactic Bridge
 *
 * Resolves the relationship between the Verse (energy) and the Weave (form).
 */

import { buildTokenGraph, createGraphNode, createSchoolAnchorNode } from './token-graph/build.js';
import { buildContextActivation } from './token-graph/activation.js';
import { traverseTokenGraph } from './token-graph/traverse.js';
import { scoreGraphCandidates } from './token-graph/score.js';
import { lookupSemanticToken, INTENTS } from './semantics.registry.js';
import { phoneticMatcher } from './phonetic_matcher.js';
import { tokenize } from './tokenizer.js';

/**
 * @typedef {Object} BridgeResult
 * @property {string} intent - The resolved action intent.
 * @property {string} school - The resolved school.
 * @property {number} resonance - Magnitude multiplier.
 * @property {string[]} predicates - Extracted predicates.
 * @property {string[]} objects - Extracted objects.
 * @property {boolean} collapsed - Whether the spell collapsed due to poor syntax.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function uniqueTokens(text) {
  return [...new Set(tokenize(text))];
}

function buildSpellTokenNode(token) {
  const semantic = lookupSemanticToken(token);
  return createGraphNode({
    id: `lexeme:${token}`,
    token,
    normalized: token,
    nodeType: 'LEXEME',
    schoolBias: semantic?.school ? { [semantic.school]: 0.76 } : {},
    semanticTags: [
      semantic?.type || null,
      semantic?.intent || semantic?.category || null,
    ].filter(Boolean),
  });
}

function addBidirectionalEdge(edges, fromId, toId, relation, weight, evidence = []) {
  edges.push({ fromId, toId, relation, weight, evidence });
  edges.push({ fromId: toId, toId: fromId, relation, weight, evidence });
}

function buildSpellweaveGraph(verseTokens, weaveTokens, dominantSchool) {
  const nodes = [];
  const edges = [];

  verseTokens.forEach((token) => {
    nodes.push(createGraphNode({
      id: `scroll:${token}`,
      token,
      normalized: token,
      nodeType: 'SCROLL_TOKEN',
      semanticTags: buildSpellTokenNode(token).semanticTags,
      schoolBias: buildSpellTokenNode(token).schoolBias,
    }));
  });
  weaveTokens.forEach((token) => {
    nodes.push(buildSpellTokenNode(token));
  });

  const schoolAnchor = createSchoolAnchorNode(dominantSchool);
  if (schoolAnchor) nodes.push(schoolAnchor);

  weaveTokens.forEach((weaveToken) => {
    const weaveSemantic = lookupSemanticToken(weaveToken);
    const weaveNodeId = `lexeme:${weaveToken}`;

    if (weaveSemantic?.school && schoolAnchor) {
      addBidirectionalEdge(
        edges,
        weaveNodeId,
        schoolAnchor.id,
        'SCHOOL_RESONANCE',
        weaveSemantic.school === dominantSchool ? 0.88 : 0.44,
        ['weave_school_alignment'],
      );
    }

    verseTokens.forEach((verseToken) => {
      const verseSemantic = lookupSemanticToken(verseToken);
      const verseNodeId = `scroll:${verseToken}`;

      if (weaveToken === verseToken) {
        addBidirectionalEdge(
          edges,
          weaveNodeId,
          verseNodeId,
          'SEMANTIC_ASSOCIATION',
          0.96,
          ['exact_lexeme_alignment'],
        );
      }

      if (
        weaveSemantic &&
        verseSemantic &&
        (
          weaveSemantic.school === verseSemantic.school
          || weaveSemantic.intent === verseSemantic.intent
          || weaveSemantic.type === verseSemantic.type
        )
      ) {
        addBidirectionalEdge(
          edges,
          weaveNodeId,
          verseNodeId,
          'SEMANTIC_ASSOCIATION',
          0.72,
          ['semantic_registry_alignment'],
        );
      }

      if (
        weaveSemantic?.school &&
        verseSemantic?.school &&
        weaveSemantic.school === verseSemantic.school
      ) {
        addBidirectionalEdge(
          edges,
          weaveNodeId,
          verseNodeId,
          'SCHOOL_RESONANCE',
          0.68,
          ['shared_school_alignment'],
        );
      }

      if (phoneticMatcher.isSoundAlike(weaveToken, verseToken)) {
        addBidirectionalEdge(
          edges,
          weaveNodeId,
          verseNodeId,
          'PHONETIC_SIMILARITY',
          weaveToken === verseToken ? 0.7 : 0.56,
          ['phonetic_echo'],
        );
      }
    });
  });

  const predicates = weaveTokens.filter((token) => lookupSemanticToken(token)?.type === 'PREDICATE');
  const objects = weaveTokens.filter((token) => lookupSemanticToken(token)?.type === 'OBJECT');
  predicates.forEach((predicate) => {
    objects.forEach((objectToken) => {
      addBidirectionalEdge(
        edges,
        `lexeme:${predicate}`,
        `lexeme:${objectToken}`,
        'SYNTACTIC_COMPATIBILITY',
        0.8,
        ['predicate_object_binding'],
      );
    });
  });

  return buildTokenGraph({ nodes, edges });
}

function evaluateSpellweaveAlignment(verseTokens, weaveTokens, dominantSchool) {
  if (verseTokens.length === 0 || weaveTokens.length === 0) {
    return {
      graphAlignment: 0,
      semanticAlignment: 0,
      schoolResonance: 0,
      phoneticHarmony: 0,
      syntaxLegality: 0,
    };
  }

  const graph = buildSpellweaveGraph(verseTokens, weaveTokens, dominantSchool);
  const activation = buildContextActivation(graph, {
    currentSchool: dominantSchool,
    anchorTokens: weaveTokens,
    syntaxContext: {
      role: 'content',
      lineRole: 'line_end',
      stressRole: 'primary',
      rhymePolicy: 'allow',
    },
  });
  const traversed = traverseTokenGraph(graph, activation);
  const scored = scoreGraphCandidates(graph, traversed, activation);
  const verseSet = new Set(verseTokens);
  const verseCandidates = scored.filter((candidate) => verseSet.has(candidate.token));
  const topCandidates = verseCandidates.slice(0, Math.max(1, weaveTokens.length));

  const semanticAlignment = average(topCandidates.map((candidate) => candidate.semanticScore));
  const schoolResonance = average(topCandidates.map((candidate) => candidate.schoolScore));
  const phoneticHarmony = average(topCandidates.map((candidate) => candidate.phoneticScore));
  const syntaxLegality = average(topCandidates.map((candidate) => candidate.legalityScore));
  const graphAlignment = clamp(
    (semanticAlignment * 0.45)
    + (schoolResonance * 0.20)
    + (phoneticHarmony * 0.15)
    + (syntaxLegality * 0.20),
    0,
    1,
  );

  return {
    graphAlignment,
    semanticAlignment,
    schoolResonance,
    phoneticHarmony,
    syntaxLegality,
  };
}

/**
 * Parses the Spellweave for semantic tokens.
 * @param {string} weave
 * @returns {{ predicates: string[], objects: string[], tokens: string[] }}
 */
export function parseWeave(weave) {
  const tokens = uniqueTokens(weave).map((token) => token.toUpperCase());
  const predicates = [];
  const objects = [];

  tokens.forEach((token) => {
    const semantic = lookupSemanticToken(token);
    if (semantic?.type === 'PREDICATE') predicates.push(token);
    if (semantic?.type === 'OBJECT') objects.push(token);
  });

  return { predicates, objects, tokens };
}

/**
 * Calculates the Syntactic Bridge between Verse and Weave.
 * @param {Object} params
 * @param {string} params.verse - The 300-char Verse.
 * @param {string} params.weave - The 60-100 char Spellweave.
 * @param {string} params.dominantSchool - The school identified by the Verse's vowel gravity.
 * @returns {BridgeResult}
 */
export function calculateSyntacticBridge({ verse, weave, dominantSchool }) {
  const { predicates, objects, tokens: weaveTokens } = parseWeave(weave);
  const verseTokens = uniqueTokens(verse).map((token) => token.toUpperCase());
  const alignment = evaluateSpellweaveAlignment(verseTokens, weaveTokens, dominantSchool);

  const collapsed = (
    predicates.length > 3
    || (predicates.length === 0 && objects.length === 0)
  );

  if (collapsed) {
    return {
      intent: INTENTS.UTILITY,
      school: dominantSchool,
      resonance: Math.max(0.1, 0.18 + (alignment.graphAlignment * 0.32)),
      predicates,
      objects,
      collapsed: true,
    };
  }

  const primaryPredicate = predicates[0] || 'STRIKE';
  const predicateData = lookupSemanticToken(primaryPredicate) || {
    intent: INTENTS.OFFENSIVE,
    school: dominantSchool,
  };

  let resonance = 0.55
    + (alignment.semanticAlignment * 0.35)
    + (alignment.schoolResonance * 0.25)
    + (alignment.phoneticHarmony * 0.12)
    + (alignment.syntaxLegality * 0.18);

  if (predicateData.school === dominantSchool) {
    resonance += 0.12;
  } else {
    resonance -= 0.06;
  }

  if (objects.length > 1) {
    resonance += 0.06;
  }
  if (alignment.graphAlignment > 0.75) {
    resonance += 0.08;
  } else if (alignment.graphAlignment < 0.25) {
    resonance -= 0.12;
  }

  return {
    intent: predicateData.intent,
    school: predicateData.school,
    resonance: Math.max(0.1, resonance),
    predicates,
    objects,
    collapsed: false,
  };
}
