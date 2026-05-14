/**
 * Lexical Resonance Amplifier
 *
 * Semantic interpretation now lives on the VerseIR substrate. This amplifier
 * reads semantic fields, conceptual metaphors, image schemas, consonant
 * families, register layering, and rough etymological drift from compiled
 * VerseIR tokens instead of expanding core combat semantics.
 */

import {
  clamp01,
  roundTo,
  createAmplifierResult,
  createAmplifierDiagnostic,
} from '../shared.js';
import {
  CONCEPTUAL_METAPHORS,
  CONSONANT_FAMILIES,
  EMOTION_ARCHETYPES,
  ETYMOLOGY_PROFILES,
  FIELD_TENSION_PAIRS,
  HIGH_REGISTER_TOKENS,
  IMAGE_SCHEMAS,
  LOW_REGISTER_TOKENS,
  SEMANTIC_FIELDS,
} from './semanticResonance.data.js';

const ID = 'lexical_resonance';
const LABEL = 'Semantic Resonance Lattice';
const TIER = 'RARE';
const CLAIMED_WEIGHT = 0.15;
const FIELD_DENSITY_SHARE = 0.16;
const SCHEMA_DENSITY_SHARE = 0.12;
const CONSONANT_DENSITY_SHARE = 0.14;
const REGISTER_DENSITY_SHARE = 0.1;
const ETYMOLOGY_DENSITY_SHARE = 0.12;

function normalizeToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

function normalizePhoneme(phoneme) {
  return String(phoneme || '')
    .replace(/[0-9]/g, '')
    .trim()
    .toUpperCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function average(values) {
  const numbers = safeArray(values)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function sortMatches(matches) {
  return [...matches].sort((left, right) => {
    if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
    if ((right.hits || 0) !== (left.hits || 0)) return (right.hits || 0) - (left.hits || 0);
    return String(left.label || '').localeCompare(String(right.label || ''));
  });
}

function sortArchetypes(archetypes) {
  return [...archetypes].sort((left, right) => {
    if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
    return String(left.label || '').localeCompare(String(right.label || ''));
  });
}

function getOnsetSignature(token, fallbackToken) {
  const onset = safeArray(token?.onset)
    .map(normalizePhoneme)
    .filter(Boolean);
  if (onset.length > 0) {
    return onset.slice(0, 2).join('');
  }

  const graphemeCluster = String(fallbackToken || '').match(/^[^aeiouy]+/i)?.[0] || '';
  if (!graphemeCluster) return '';

  return graphemeCluster
    .toUpperCase()
    .replace(/^CR/, 'KR')
    .replace(/^CL/, 'KL')
    .replace(/^TH/, 'TH')
    .replace(/^SH/, 'SH')
    .replace(/^SL/, 'SL')
    .replace(/^FL/, 'FL')
    .replace(/^GR/, 'GR')
    .replace(/^GL/, 'GL')
    .slice(0, 2);
}

function buildTokenStats(verseIR) {
  const tokens = safeArray(verseIR?.tokens);
  const lines = safeArray(verseIR?.lines);
  const tokenCounts = new Map();
  const tokenLines = new Map();
  const onsetIndex = new Map();
  const contentTokens = [];

  for (const token of tokens) {
    const normalized = normalizeToken(token?.normalized || token?.text);
    if (!normalized) continue;

    const lineIndex = Number.isInteger(token?.lineIndex) ? token.lineIndex : 0;
    tokenCounts.set(normalized, (tokenCounts.get(normalized) || 0) + 1);

    if (!tokenLines.has(normalized)) tokenLines.set(normalized, new Set());
    tokenLines.get(normalized).add(lineIndex);

    const onsetSignature = getOnsetSignature(token, normalized);
    if (onsetSignature) {
      if (!onsetIndex.has(onsetSignature)) onsetIndex.set(onsetSignature, []);
      onsetIndex.get(onsetSignature).push({
        normalized,
        lineIndex,
        isStopWordLike: Boolean(token?.flags?.isStopWordLike),
      });
    }

    if (!token?.flags?.isStopWordLike) {
      contentTokens.push(normalized);
    }
  }

  return {
    lines,
    tokenCounts,
    tokenLines,
    onsetIndex,
    totalContentTokens: contentTokens.length || tokens.length,
  };
}

function getTopTokens(tokens, tokenCounts, limit = 4) {
  return [...new Set(tokens)]
    .sort((left, right) => {
      const rightCount = tokenCounts.get(right) || 0;
      const leftCount = tokenCounts.get(left) || 0;
      if (rightCount !== leftCount) return rightCount - leftCount;
      return left.localeCompare(right);
    })
    .slice(0, limit);
}

function buildLexemeMatches(domains, stats, densityShare, kind) {
  const densityTarget = Math.max(2, Math.ceil(Math.max(1, stats.totalContentTokens) * densityShare));
  const lineCount = Math.max(1, stats.lines.length || 1);
  const matches = [];

  for (const domain of domains) {
    const matchedTokens = safeArray(domain?.lexemes).filter((lexeme) => stats.tokenCounts.has(lexeme));
    if (matchedTokens.length === 0) continue;

    let hits = 0;
    const lineIndexes = new Set();
    for (const token of matchedTokens) {
      hits += stats.tokenCounts.get(token) || 0;
      for (const lineIndex of stats.tokenLines.get(token) || []) {
        lineIndexes.add(lineIndex);
      }
    }

    const coverage = clamp01(matchedTokens.length / Math.max(1, safeArray(domain?.lexemes).length));
    const density = clamp01(hits / densityTarget);
    const lineSpread = clamp01(lineIndexes.size / lineCount);
    const score = clamp01((coverage * 0.42) + (density * 0.38) + (lineSpread * 0.20));

    matches.push({
      id: String(domain.id || ''),
      label: String(domain.label || domain.id || ''),
      school: String(domain.school || ''),
      kind,
      hits,
      score: roundTo(score),
      coverage: roundTo(coverage),
      lineSpread: roundTo(lineSpread),
      tokens: getTopTokens(matchedTokens, stats.tokenCounts),
      lineIndexes,
      archetypes: safeArray(domain?.archetypes),
    });
  }

  return sortMatches(matches);
}

function regexMatches(text, pattern) {
  const flags = String(pattern?.flags || '').replace(/g/g, '');
  const safePattern = new RegExp(pattern.source, flags || 'i');
  return safePattern.test(text);
}

function buildMetaphorMatches(metaphors, stats, verseIR) {
  const lineTexts = safeArray(verseIR?.lines).map((line) => String(line?.text || ''));
  const lineCount = Math.max(1, lineTexts.length || 1);
  const densityTarget = Math.max(2, Math.ceil(Math.max(1, stats.totalContentTokens) * FIELD_DENSITY_SHARE));
  const matches = [];

  for (const metaphor of metaphors) {
    const matchedHints = safeArray(metaphor?.tokenHints).filter((token) => stats.tokenCounts.has(token));
    const lineIndexes = new Set();

    for (let lineIndex = 0; lineIndex < lineTexts.length; lineIndex += 1) {
      const lineText = lineTexts[lineIndex];
      if (safeArray(metaphor?.patterns).some((pattern) => regexMatches(lineText, pattern))) {
        lineIndexes.add(lineIndex);
      }
    }

    let tokenHits = 0;
    for (const token of matchedHints) {
      tokenHits += stats.tokenCounts.get(token) || 0;
    }

    if (lineIndexes.size === 0 && matchedHints.length < 2) {
      continue;
    }

    const coverage = clamp01(matchedHints.length / Math.max(1, safeArray(metaphor?.tokenHints).length));
    const density = clamp01(tokenHits / densityTarget);
    const lineSpread = clamp01(lineIndexes.size / lineCount);
    const score = clamp01(
      (lineIndexes.size > 0 ? 0.24 : 0)
      + (coverage * 0.28)
      + (density * 0.26)
      + (lineSpread * 0.22)
    );

    matches.push({
      id: String(metaphor.id || ''),
      label: String(metaphor.label || metaphor.id || ''),
      school: String(metaphor.school || ''),
      kind: 'metaphor',
      hits: tokenHits + lineIndexes.size,
      score: roundTo(score),
      coverage: roundTo(coverage),
      lineSpread: roundTo(lineSpread),
      tokens: getTopTokens(matchedHints, stats.tokenCounts),
      lineIndexes,
      archetypes: safeArray(metaphor?.archetypes),
    });
  }

  return sortMatches(matches);
}

function buildConsonantMatches(families, stats) {
  const densityTarget = Math.max(2, Math.ceil(Math.max(1, stats.totalContentTokens) * CONSONANT_DENSITY_SHARE));
  const lineCount = Math.max(1, stats.lines.length || 1);
  const matches = [];

  for (const family of families) {
    const exampleSet = new Set(safeArray(family?.examples));
    const signatureHits = safeArray(family?.signatures)
      .flatMap((signature) => safeArray(stats.onsetIndex.get(signature)))
      .filter((entry) => !entry.isStopWordLike || exampleSet.has(entry.normalized));
    if (signatureHits.length === 0) continue;

    const lineIndexes = new Set(signatureHits.map((entry) => entry.lineIndex));
    const tokens = getTopTokens(signatureHits.map((entry) => entry.normalized), stats.tokenCounts);
    const coverage = clamp01(tokens.length / Math.max(1, safeArray(family?.examples).length));
    const density = clamp01(signatureHits.length / densityTarget);
    const lineSpread = clamp01(lineIndexes.size / lineCount);
    const score = clamp01((coverage * 0.28) + (density * 0.52) + (lineSpread * 0.20));

    matches.push({
      id: String(family.id || ''),
      label: String(family.label || family.id || ''),
      school: String(family.school || ''),
      kind: 'consonant_family',
      hits: signatureHits.length,
      score: roundTo(score),
      coverage: roundTo(coverage),
      lineSpread: roundTo(lineSpread),
      tokens,
      lineIndexes,
      archetypes: safeArray(family?.archetypes),
    });
  }

  return sortMatches(matches);
}

function computeFieldCoherence(fieldMatches) {
  const matches = safeArray(fieldMatches);
  if (matches.length === 0) return 0;

  const totalHits = matches.reduce((sum, match) => sum + (Number(match?.hits) || 0), 0);
  if (totalHits <= 0) return clamp01(matches[0]?.score || 0);

  const top = matches[0];
  const second = matches[1] || null;
  const dominance = clamp01((Number(top?.hits) || 0) / totalHits);
  const concentration = clamp01(
    ((Number(top?.hits) || 0) + (Number(second?.hits) || 0)) / totalHits
  );
  const lineLock = average([top?.lineSpread || 0, second?.lineSpread || 0]);

  return clamp01((dominance * 0.45) + (concentration * 0.35) + (lineLock * 0.20));
}

function buildFieldTensions(fieldMatches) {
  const byId = new Map(safeArray(fieldMatches).map((match) => [match.id, match]));
  const tensions = [];

  for (const pair of FIELD_TENSION_PAIRS) {
    const left = byId.get(pair.left);
    const right = byId.get(pair.right);
    if (!left || !right) continue;

    const lineSpread = average([left.lineSpread || 0, right.lineSpread || 0]);
    const coverage = average([left.coverage || 0, right.coverage || 0]);
    const score = clamp01(
      (Math.min(left.score || 0, right.score || 0) * Number(pair.weight || 0.8))
      + (lineSpread * 0.12)
      + (coverage * 0.08)
    );

    tensions.push({
      id: String(pair.id || ''),
      label: String(pair.label || pair.id || ''),
      left: left.id,
      right: right.id,
      score: roundTo(score),
    });
  }

  return [...tensions].sort((left, right) => {
    if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
    return String(left.label || '').localeCompare(String(right.label || ''));
  });
}

function matchEtymologyProfile(token, profile) {
  if (safeArray(profile?.lexemes).includes(token)) return true;
  if (safeArray(profile?.prefixes).some((prefix) => token.startsWith(prefix))) return true;
  if (safeArray(profile?.suffixes).some((suffix) => token.endsWith(suffix))) return true;
  return false;
}

function buildEtymologyProfile(stats) {
  const densityTarget = Math.max(2, Math.ceil(Math.max(1, stats.totalContentTokens) * ETYMOLOGY_DENSITY_SHARE));
  const lineCount = Math.max(1, stats.lines.length || 1);
  const profiles = [];

  for (const profile of ETYMOLOGY_PROFILES) {
    const matchedTokens = [...stats.tokenCounts.keys()].filter((token) => matchEtymologyProfile(token, profile));
    if (matchedTokens.length === 0) continue;

    let hits = 0;
    const lineIndexes = new Set();
    for (const token of matchedTokens) {
      hits += stats.tokenCounts.get(token) || 0;
      for (const lineIndex of stats.tokenLines.get(token) || []) {
        lineIndexes.add(lineIndex);
      }
    }

    const coverage = clamp01(matchedTokens.length / Math.max(1, stats.tokenCounts.size));
    const density = clamp01(hits / densityTarget);
    const lineSpread = clamp01(lineIndexes.size / lineCount);
    const score = clamp01((density * 0.5) + (lineSpread * 0.25) + (coverage * 0.25));

    profiles.push({
      id: String(profile.id || ''),
      label: String(profile.label || profile.id || ''),
      school: String(profile.school || ''),
      hits,
      score: roundTo(score),
      coverage: roundTo(coverage),
      lineSpread: roundTo(lineSpread),
      tokens: getTopTokens(matchedTokens, stats.tokenCounts),
      archetypes: safeArray(profile?.archetypes),
    });
  }

  const sortedProfiles = sortMatches(profiles);
  const top = sortedProfiles[0] || null;
  const second = sortedProfiles[1] || null;

  return {
    dominant: top ? top.id : null,
    dominantScore: top ? top.score : 0,
    tensionScore: top && second ? roundTo(clamp01(Math.min(top.score, second.score) * 0.82)) : 0,
    profiles: sortedProfiles.slice(0, 3),
  };
}

function buildRegisterMix(stats) {
  const highTokens = HIGH_REGISTER_TOKENS.filter((token) => stats.tokenCounts.has(token));
  const lowTokens = LOW_REGISTER_TOKENS.filter((token) => stats.tokenCounts.has(token));

  let highHits = 0;
  let lowHits = 0;
  for (const token of highTokens) highHits += stats.tokenCounts.get(token) || 0;
  for (const token of lowTokens) lowHits += stats.tokenCounts.get(token) || 0;

  const densityTarget = Math.max(2, Math.ceil(Math.max(1, stats.totalContentTokens) * REGISTER_DENSITY_SHARE));
  const highScore = clamp01(highHits / densityTarget);
  const lowScore = clamp01(lowHits / densityTarget);
  const tensionScore = highHits > 0 && lowHits > 0
    ? clamp01(
      ((Math.min(highHits, lowHits) / Math.max(highHits, lowHits)) * 0.62)
      + (average([highScore, lowScore]) * 0.38)
    )
    : 0;

  return {
    highHits,
    lowHits,
    highTokens,
    lowTokens,
    tensionScore: roundTo(tensionScore),
  };
}

function buildEmotionResonance(stats, gutenbergPriors) {
  if (!gutenbergPriors || typeof gutenbergPriors !== 'object') {
    return {
      dominantEmotion: null,
      dominantScore: 0,
      emotions: [],
    };
  }

  const scores = new Map();

  for (const [token, hits] of stats.tokenCounts.entries()) {
    for (const [emotion, lexemes] of Object.entries(gutenbergPriors)) {
      const weight = Number(lexemes?.[token]) || 0;
      if (weight <= 0) continue;
      scores.set(emotion, (scores.get(emotion) || 0) + (weight * hits));
    }
  }

  const emotions = [...scores.entries()]
    .map(([emotion, value]) => ({
      emotion,
      score: roundTo(clamp01(value / Math.max(1, stats.totalContentTokens))),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.emotion.localeCompare(right.emotion);
    })
    .slice(0, 4);

  return {
    dominantEmotion: emotions[0]?.emotion || null,
    dominantScore: emotions[0]?.score || 0,
    emotions,
  };
}

function accumulateArchetypes(sourceMatches, emotionResonance) {
  const aggregate = new Map();
  const allMatches = safeArray(sourceMatches).flatMap((group) => safeArray(group));

  for (const match of allMatches) {
    const sourceScore = clamp01(Number(match?.score) || 0);
    for (const archetype of safeArray(match?.archetypes)) {
      if (!archetype?.id || !archetype?.label) continue;
      const existing = aggregate.get(archetype.id) || {
        id: archetype.id,
        label: archetype.label,
        score: 0,
      };
      existing.score += sourceScore * clamp01(Number(archetype?.weight) || 0.5);
      aggregate.set(archetype.id, existing);
    }
  }

  for (const emotion of safeArray(emotionResonance?.emotions).slice(0, 2)) {
    const mappedArchetype = EMOTION_ARCHETYPES[String(emotion?.emotion || '').toLowerCase()];
    if (!mappedArchetype) continue;
    const existing = aggregate.get(mappedArchetype.id) || {
      id: mappedArchetype.id,
      label: mappedArchetype.label,
      score: 0,
    };
    existing.score += clamp01(Number(emotion?.score) || 0) * clamp01(Number(mappedArchetype.weight) || 0.5);
    aggregate.set(mappedArchetype.id, existing);
  }

  return sortArchetypes(
    [...aggregate.values()].map((archetype) => ({
      ...archetype,
      score: roundTo(clamp01(archetype.score)),
    }))
  ).slice(0, 6);
}

function toPublicMatch(match) {
  return Object.freeze({
    id: String(match?.id || '').trim(),
    label: String(match?.label || match?.id || '').trim(),
    hits: Math.max(0, Math.round(Number(match?.hits) || 0)),
    score: roundTo(clamp01(Number(match?.score) || 0)),
    coverage: roundTo(clamp01(Number(match?.coverage) || 0)),
    lineSpread: roundTo(clamp01(Number(match?.lineSpread) || 0)),
    tokens: Object.freeze(safeArray(match?.tokens).map((token) => String(token || '')).filter(Boolean)),
  });
}

function buildDiagnostics({
  fieldMatches,
  metaphorMatches,
  tensions,
  registerMix,
  etymologyProfile,
  consonantMatches,
}) {
  const diagnostics = [];
  const topField = fieldMatches[0];
  const topMetaphor = metaphorMatches[0];
  const topTension = tensions[0];
  const topConsonant = consonantMatches[0];

  if (topField) {
    diagnostics.push(createAmplifierDiagnostic({
      severity: topField.score >= 0.55 ? 'success' : 'info',
      source: `verseir_amplifier:${ID}`,
      message: `Semantic field coherence stabilizes around ${topField.label}.`,
      metadata: {
        domain: topField.id,
        score: topField.score,
        hits: topField.hits,
        words: topField.tokens,
      },
    }));
  }

  if (topMetaphor) {
    diagnostics.push(createAmplifierDiagnostic({
      severity: topMetaphor.score >= 0.55 ? 'success' : 'info',
      source: `verseir_amplifier:${ID}`,
      message: `Conceptual metaphor surfaced: ${topMetaphor.label}.`,
      metadata: {
        metaphor: topMetaphor.id,
        score: topMetaphor.score,
        words: topMetaphor.tokens,
      },
    }));
  }

  if (topTension && topTension.score >= 0.25) {
    diagnostics.push(createAmplifierDiagnostic({
      severity: 'info',
      source: `verseir_amplifier:${ID}`,
      message: `Cross-field tension detected: ${topTension.label}.`,
      metadata: {
        tension: topTension.id,
        score: topTension.score,
      },
    }));
  } else if (registerMix?.tensionScore >= 0.2) {
    diagnostics.push(createAmplifierDiagnostic({
      severity: 'info',
      source: `verseir_amplifier:${ID}`,
      message: 'Register layering is producing semantic friction.',
      metadata: {
        highTokens: registerMix.highTokens,
        lowTokens: registerMix.lowTokens,
        score: registerMix.tensionScore,
      },
    }));
  } else if ((etymologyProfile?.tensionScore || 0) >= 0.2) {
    diagnostics.push(createAmplifierDiagnostic({
      severity: 'info',
      source: `verseir_amplifier:${ID}`,
      message: 'Latinate and Germanic pressure are colliding inside the diction.',
      metadata: {
        dominant: etymologyProfile.dominant,
        score: etymologyProfile.tensionScore,
      },
    }));
  } else if (topConsonant && topConsonant.score >= 0.22) {
    diagnostics.push(createAmplifierDiagnostic({
      severity: 'info',
      source: `verseir_amplifier:${ID}`,
      message: `Consonant family pressure reinforces ${topConsonant.label}.`,
      metadata: {
        family: topConsonant.id,
        score: topConsonant.score,
        words: topConsonant.tokens,
      },
    }));
  }

  return diagnostics.slice(0, 4);
}

function buildCommentary({
  fieldMatches,
  metaphorMatches,
  tensions,
  consonantMatches,
  archetypes,
}) {
  const topField = fieldMatches[0];
  const topMetaphor = metaphorMatches[0];
  const topTension = tensions[0];
  const topConsonant = consonantMatches[0];
  const topArchetype = archetypes[0];

  if (!topField && !topMetaphor && !topConsonant) {
    return 'The semantic lattice remained quiet. VerseIR found no durable conceptual pressure.';
  }

  const parts = [];
  if (topField) {
    parts.push(`Semantic gravity locks onto ${topField.label}.`);
  }
  if (topMetaphor) {
    parts.push(`${topMetaphor.label} opens a stronger conceptual lane.`);
  }
  if (topTension && topTension.score >= 0.25) {
    parts.push(`${topTension.label} creates productive friction.`);
  } else if (topConsonant) {
    parts.push(`${topConsonant.label} reinforces the diction at the onset level.`);
  }
  if (topArchetype?.label) {
    parts.push(`Archetypal pull leans toward ${topArchetype.label}.`);
  }

  return parts.join(' ');
}

function buildSemanticSnapshot(context = {}) {
  const verseIR = context?.verseIR || {};
  const options = context?.options || {};
  const stats = buildTokenStats(verseIR);
  const fieldMatches = buildLexemeMatches(SEMANTIC_FIELDS, stats, FIELD_DENSITY_SHARE, 'semantic_field');
  const imageSchemaMatches = buildLexemeMatches(IMAGE_SCHEMAS, stats, SCHEMA_DENSITY_SHARE, 'image_schema');
  const metaphorMatches = buildMetaphorMatches(CONCEPTUAL_METAPHORS, stats, verseIR);
  const consonantMatches = buildConsonantMatches(CONSONANT_FAMILIES, stats);
  const tensions = buildFieldTensions(fieldMatches);
  const registerMix = buildRegisterMix(stats);
  const etymologyProfile = buildEtymologyProfile(stats);
  const emotionResonance = buildEmotionResonance(stats, options?.gutenbergPriors?.emotions);
  const fieldCoherence = computeFieldCoherence(fieldMatches);
  const archetypes = accumulateArchetypes(
    [
      fieldMatches.slice(0, 3),
      imageSchemaMatches.slice(0, 2),
      metaphorMatches.slice(0, 3),
      consonantMatches.slice(0, 2),
      etymologyProfile.profiles.slice(0, 2),
    ],
    emotionResonance
  );

  const topField = fieldMatches[0]?.score || 0;
  const topSchema = imageSchemaMatches[0]?.score || 0;
  const topMetaphor = metaphorMatches[0]?.score || 0;
  const topConsonant = consonantMatches[0]?.score || 0;
  const topTension = tensions[0]?.score || 0;
  const topArchetype = archetypes[0]?.score || 0;
  const registerTension = registerMix?.tensionScore || 0;
  const etymologyDominance = etymologyProfile?.dominantScore || 0;
  const etymologyTension = etymologyProfile?.tensionScore || 0;
  const emotionLead = emotionResonance?.dominantScore || 0;

  const semanticDepth = clamp01(
    (topField * 0.26)
    + (fieldCoherence * 0.18)
    + (topMetaphor * 0.19)
    + (topSchema * 0.12)
    + (topConsonant * 0.1)
    + (emotionLead * 0.08)
    + (registerTension * 0.04)
    + (etymologyDominance * 0.03)
  );

  const raritySignal = clamp01(
    (topMetaphor * 0.3)
    + (topTension * 0.22)
    + (registerTension * 0.16)
    + (etymologyTension * 0.12)
    + (topField * 0.1)
    + (topConsonant * 0.08)
    + (emotionLead * 0.12)
  );

  const signal = clamp01(
    (semanticDepth * 0.52)
    + (raritySignal * 0.18)
    + (topTension * 0.15)
    + (topArchetype * 0.15)
  );

  const matches = sortMatches([
    ...fieldMatches.slice(0, 2),
    ...imageSchemaMatches.slice(0, 1),
    ...metaphorMatches.slice(0, 2),
    ...consonantMatches.slice(0, 1),
  ]).slice(0, 6);

  return {
    fieldMatches,
    imageSchemaMatches,
    metaphorMatches,
    consonantMatches,
    tensions,
    registerMix,
    etymologyProfile,
    emotionResonance,
    fieldCoherence: roundTo(fieldCoherence),
    archetypes: archetypes.map((archetype) => Object.freeze({
      id: archetype.id,
      label: archetype.label,
      score: roundTo(clamp01(archetype.score)),
    })),
    matches: matches.map(toPublicMatch),
    signal: roundTo(signal),
    semanticDepth: roundTo(semanticDepth),
    raritySignal: roundTo(raritySignal),
  };
}

export const lexicalResonanceAmplifier = {
  id: ID,
  label: LABEL,
  tier: TIER,
  claimedWeight: CLAIMED_WEIGHT,

  route(context = {}) {
    const snapshot = buildSemanticSnapshot(context);
    const routeScore = clamp01(
      (snapshot.signal * 0.5)
      + ((snapshot.semanticDepth || 0) * 0.3)
      + ((snapshot.raritySignal || 0) * 0.2)
    );
    const shouldRun = routeScore >= 0.18;

    return {
      score: roundTo(routeScore),
      shouldRun,
      reason: shouldRun ? 'semantic_signal_detected' : 'no_semantic_signal',
      matchedDomainCount: snapshot.matches.length,
      topMatch: snapshot.matches[0] || null,
    };
  },

  async analyze(context = {}) {
    const snapshot = buildSemanticSnapshot(context);
    const diagnostics = buildDiagnostics(snapshot);

    const result = createAmplifierResult({
      id: ID,
      label: LABEL,
      tier: TIER,
      claimedWeight: CLAIMED_WEIGHT,
      signal: snapshot.signal,
      semanticDepth: snapshot.semanticDepth,
      raritySignal: snapshot.raritySignal,
      matches: snapshot.matches,
      archetypes: snapshot.archetypes,
      diagnostics,
      commentary: buildCommentary(snapshot),
    });

    return Object.freeze({
      ...result,
      payload: {
        version: '2.0.0',
        fields: snapshot.fieldMatches.map(toPublicMatch),
        imageSchemas: snapshot.imageSchemaMatches.map(toPublicMatch),
        metaphors: snapshot.metaphorMatches.map(toPublicMatch),
        consonantFamilies: snapshot.consonantMatches.map(toPublicMatch),
        fieldCoherence: snapshot.fieldCoherence,
        tensions: snapshot.tensions.map((tension) => ({
          id: tension.id,
          label: tension.label,
          left: tension.left,
          right: tension.right,
          score: roundTo(clamp01(tension.score)),
        })),
        registerMix: {
          highHits: Math.max(0, Number(snapshot.registerMix?.highHits) || 0),
          lowHits: Math.max(0, Number(snapshot.registerMix?.lowHits) || 0),
          highTokens: safeArray(snapshot.registerMix?.highTokens),
          lowTokens: safeArray(snapshot.registerMix?.lowTokens),
          tensionScore: roundTo(clamp01(snapshot.registerMix?.tensionScore || 0)),
        },
        etymologyProfile: {
          dominant: snapshot.etymologyProfile?.dominant || null,
          dominantScore: roundTo(clamp01(snapshot.etymologyProfile?.dominantScore || 0)),
          tensionScore: roundTo(clamp01(snapshot.etymologyProfile?.tensionScore || 0)),
          profiles: safeArray(snapshot.etymologyProfile?.profiles).map(toPublicMatch),
        },
        emotionResonance: {
          dominantEmotion: snapshot.emotionResonance?.dominantEmotion || null,
          dominantScore: roundTo(clamp01(snapshot.emotionResonance?.dominantScore || 0)),
          emotions: safeArray(snapshot.emotionResonance?.emotions).map((emotion) => ({
            emotion: String(emotion?.emotion || ''),
            score: roundTo(clamp01(emotion?.score || 0)),
          })),
        },
      },
    });
  },
};
