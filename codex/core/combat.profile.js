import { analyzeText } from './analysis.pipeline.js';
import {
  COMBAT_ARENA_SCHOOL,
  COMBAT_SCHOOLS,
  clamp01,
  getCombatRarityByScore,
  getStatusTierDefinition,
} from './combat.balance.js';
import { calculateCohesionScore } from './heuristics/cohesion.js';
import {
  SEMANTIC_TIER_COUNT,
  getSemanticSchoolRegistry,
  getSemanticTierLabel,
  normalizeSemanticKeyword,
} from './semantics.registry.js';
import { rawScoreToAbyssMultiplier } from './lexicon.abyss.js';
import { analyzeSpeaking } from './speaking/index.js';
import { WORD_REGEX_GLOBAL } from './constants/regex.js';
import { normalizeVowelFamily } from './phonology/vowelFamily.js';
import { VOWEL_FAMILY_TO_SCHOOL } from './constants/schools.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'had', 'has',
  'have', 'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my',
  'not', 'of', 'on', 'or', 'our', 'she', 'so', 'than', 'that', 'the', 'their',
  'them', 'there', 'they', 'this', 'to', 'us', 'was', 'we', 'were', 'with', 'you',
  'your',
]);

const HEAL_KEYWORDS = new Set([
  'amend', 'cure', 'cleanse', 'heal', 'health', 'mend', 'mending', 'recover',
  'recovery', 'remedy', 'restore', 'restored', 'salve', 'seal', 'sew', 'soothe',
  'stitch', 'vitalize',
]);

const BODY_KEYWORDS = new Set([
  'blood', 'bone', 'bones', 'fever', 'flesh', 'hurt', 'hurts', 'injury', 'limb',
  'scar', 'sick', 'sickness', 'skin', 'wound', 'wounds',
]);

const TERRAIN_KEYWORDS = new Set([
  'ash', 'bridge', 'earth', 'field', 'fire', 'flood', 'gate', 'glass', 'ground',
  'hill', 'ice', 'metal', 'river', 'road', 'sky', 'soil', 'space', 'stone',
  'storm', 'terrain', 'wall', 'water', 'wind', 'world',
]);

const TERRAIN_VERBS = new Set([
  'alter', 'bend', 'break', 'build', 'carve', 'forge', 'lift', 'open', 'raise',
  'reshape', 'seal', 'shift', 'shutter', 'split', 'transmute', 'turn', 'warp',
]);

const BUFF_KEYWORDS = new Set([
  'arm', 'bless', 'bolster', 'brighten', 'crown', 'empower', 'guard', 'harden',
  'lift', 'protect', 'sanctify', 'shield', 'steady', 'strengthen', 'ward',
]);

const DEBUFF_KEYWORDS = new Set([
  'blind', 'break', 'curse', 'dim', 'drain', 'fray', 'freeze', 'hex', 'rot',
  'shatter', 'silence', 'slow', 'split', 'sunder', 'weaken', 'wilt',
]);

const STATUS_DISPOSITION_BY_SCHOOL = Object.freeze({
  ALCHEMY: 'DEBUFF',
  SONIC: 'DEBUFF',
  VOID: 'DEBUFF',
  PSYCHIC: 'DEBUFF',
  WILL: 'BUFF',
});

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCombatText(rawText) {
  if (typeof rawText === 'string') return rawText;
  if (rawText === null || rawText === undefined) return '';
  return String(rawText);
}

function normalizeToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

function tokenizeCombatWords(text) {
  const input = normalizeCombatText(text);
  const matches = input.match(WORD_REGEX_GLOBAL) || [];
  return matches
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function createEmptySchoolDensity() {
  return {
    SONIC: 0,
    PSYCHIC: 0,
    VOID: 0,
    ALCHEMY: 0,
    WILL: 0,
  };
}

function buildSchoolDensity(analyzedDoc) {
  const density = createEmptySchoolDensity();
  const words = Array.isArray(analyzedDoc?.allWords) ? analyzedDoc.allWords : [];
  let total = 0;

  for (const word of words) {
    const family = normalizeVowelFamily(word?.phonetics?.vowelFamily);
    const school = family ? VOWEL_FAMILY_TO_SCHOOL[family] : null;
    if (!school || !COMBAT_SCHOOLS.includes(school)) continue;
    density[school] += 1;
    total += 1;
  }

  if (total <= 0) {
    return density;
  }

  for (const school of COMBAT_SCHOOLS) {
    density[school] = density[school] / total;
  }

  return density;
}

function getScoreTrace(scoreData, heuristic) {
  const traces = Array.isArray(scoreData?.traces)
    ? scoreData.traces
    : Array.isArray(scoreData?.explainTrace)
      ? scoreData.explainTrace
      : [];
  return traces.find((trace) => trace?.heuristic === heuristic) || null;
}

function getTraceSignal(scoreData, heuristic) {
  const trace = getScoreTrace(scoreData, heuristic);
  const rawScore = Number(trace?.rawScore);
  if (Number.isFinite(rawScore)) return clamp01(rawScore);
  const contribution = Number(trace?.contribution);
  if (Number.isFinite(contribution)) return clamp01(contribution / 20);
  return 0;
}

export function createCorpusRankMap(dictionary = []) {
  const ranks = new Map();
  const words = Array.isArray(dictionary) ? dictionary : [];
  for (let index = 0; index < words.length; index += 1) {
    const token = normalizeToken(words[index]);
    if (!token || ranks.has(token)) continue;
    ranks.set(token, index);
  }
  return ranks;
}

function computeCorpusRarity(tokens, corpusRanks) {
  if (!(corpusRanks instanceof Map) || corpusRanks.size === 0 || tokens.length === 0) {
    return 0;
  }

  const maxRank = Math.max(1, corpusRanks.size - 1);
  let total = 0;
  let counted = 0;

  for (const token of tokens) {
    if (!token || STOP_WORDS.has(token)) continue;
    counted += 1;
    if (!corpusRanks.has(token)) {
      total += token.length >= 6 ? 0.96 : 0.82;
      continue;
    }
    const rank = corpusRanks.get(token);
    total += clamp01(1 - (rank / maxRank));
  }

  return counted > 0 ? clamp01(total / counted) : 0;
}

function computeTokenRarity(token, corpusRanks) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return 0;
  if (!(corpusRanks instanceof Map) || corpusRanks.size === 0) {
    return 0;
  }

  const maxRank = Math.max(1, corpusRanks.size - 1);
  if (!corpusRanks.has(normalizedToken)) {
    return normalizedToken.length >= 6 ? 0.96 : 0.82;
  }

  const rank = corpusRanks.get(normalizedToken);
  return clamp01(1 - (rank / maxRank));
}

function computeKeywordRarity(keyword, corpusRanks) {
  const parts = String(keyword || '')
    .split(/\s+/g)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  if (parts.length === 0) return 0;

  const total = parts.reduce((sum, token) => sum + computeTokenRarity(token, corpusRanks), 0);
  return clamp01(total / parts.length);
}

function detectSpellIntent(tokens) {
  let healHits = 0;
  let bodyHits = 0;
  let terrainHits = 0;
  let terrainVerbHits = 0;
  let buffHits = 0;
  let debuffHits = 0;

  for (const token of tokens) {
    if (HEAL_KEYWORDS.has(token)) healHits += 1;
    if (BODY_KEYWORDS.has(token)) bodyHits += 1;
    if (TERRAIN_KEYWORDS.has(token)) terrainHits += 1;
    if (TERRAIN_VERBS.has(token)) terrainVerbHits += 1;
    if (BUFF_KEYWORDS.has(token)) buffHits += 1;
    if (DEBUFF_KEYWORDS.has(token)) debuffHits += 1;
  }

  const healing = healHits > 0 && (bodyHits > 0 || healHits >= 2);
  const terrain = terrainHits > 0 && terrainVerbHits > 0;
  const buff = buffHits > debuffHits && buffHits > 0;
  const debuff = debuffHits >= buffHits && debuffHits > 0;
  const failureDisposition = debuff
    ? 'DEBUFF'
    : buff
      ? 'BUFF'
      : 'NEUTRAL';

  return {
    healing,
    terrain,
    buff,
    debuff,
    failureDisposition,
  };
}

function buildSemanticKeywordIndex(school) {
  const schoolRegistry = getSemanticSchoolRegistry(school);
  const keywordMap = new Map();
  let maxKeywordLength = 1;

  if (!schoolRegistry) {
    return {
      keywordMap,
      maxKeywordLength,
    };
  }

  for (const [chainId, chain] of Object.entries(schoolRegistry)) {
    const keywords = Array.isArray(chain?.keywords) ? chain.keywords : [];
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeSemanticKeyword(keyword);
      if (!normalizedKeyword) continue;
      const keywordLength = normalizedKeyword.split(/\s+/g).filter(Boolean).length || 1;
      maxKeywordLength = Math.max(maxKeywordLength, keywordLength);
      if (!keywordMap.has(normalizedKeyword)) {
        keywordMap.set(normalizedKeyword, []);
      }
      keywordMap.get(normalizedKeyword).push({
        chainId,
        chain,
        keyword: normalizedKeyword,
        keywordLength,
      });
    }
  }

  return {
    keywordMap,
    maxKeywordLength,
  };
}

function selectSemanticChain(hitsByChain) {
  return [...hitsByChain.values()]
    .sort((left, right) => {
      const leftAverageRarity = left.hitCount > 0 ? left.rarityTotal / left.hitCount : 0;
      const rightAverageRarity = right.hitCount > 0 ? right.rarityTotal / right.hitCount : 0;
      if (right.hitCount !== left.hitCount) return right.hitCount - left.hitCount;
      if (rightAverageRarity !== leftAverageRarity) return rightAverageRarity - leftAverageRarity;
      if (right.longestMatch !== left.longestMatch) return right.longestMatch - left.longestMatch;
      return String(left.chainId).localeCompare(String(right.chainId));
    })[0] || null;
}

function detectStatusEffect({
  tokens,
  dominantSchool,
  corpusRanks,
  rarity,
}) {
  const normalizedTokens = Array.isArray(tokens)
    ? tokens.map((token) => normalizeToken(token)).filter(Boolean)
    : [];

  if (normalizedTokens.length === 0 || !COMBAT_SCHOOLS.includes(dominantSchool)) {
    return null;
  }

  const {
    keywordMap,
    maxKeywordLength,
  } = buildSemanticKeywordIndex(dominantSchool);

  if (keywordMap.size === 0) {
    return null;
  }

  const hitsByChain = new Map();

  for (let index = 0; index < normalizedTokens.length; index += 1) {
    let matchedEntries = null;
    let matchedLength = 0;
    let matchedKeyword = '';

    for (let length = Math.min(maxKeywordLength, normalizedTokens.length - index); length >= 1; length -= 1) {
      const candidate = normalizeSemanticKeyword(normalizedTokens.slice(index, index + length).join(' '));
      if (!candidate || !keywordMap.has(candidate)) continue;
      matchedEntries = keywordMap.get(candidate);
      matchedLength = length;
      matchedKeyword = candidate;
      break;
    }

    if (!matchedEntries || matchedLength <= 0) {
      continue;
    }

    const hitRarity = computeKeywordRarity(matchedKeyword, corpusRanks);
    for (const entry of matchedEntries) {
      const existing = hitsByChain.get(entry.chainId) || {
        chainId: entry.chainId,
        chain: entry.chain,
        hitCount: 0,
        rarityTotal: 0,
        longestMatch: 0,
        matchedKeywords: [],
      };
      existing.hitCount += 1;
      existing.rarityTotal += hitRarity;
      existing.longestMatch = Math.max(existing.longestMatch, matchedLength);
      existing.matchedKeywords.push(matchedKeyword);
      hitsByChain.set(entry.chainId, existing);
    }

    index += matchedLength - 1;
  }

  const selected = selectSemanticChain(hitsByChain);
  if (!selected) {
    return null;
  }

  const averageRarity = selected.hitCount > 0
    ? clamp01(selected.rarityTotal / selected.hitCount)
    : 0;
  const tier = Math.max(
    1,
    Math.min(SEMANTIC_TIER_COUNT, Math.floor(averageRarity * SEMANTIC_TIER_COUNT))
  );
  const tierDefinition = getStatusTierDefinition(tier, {
    school: dominantSchool,
    rarityId: rarity?.id,
  });

  return {
    school: dominantSchool,
    chainId: selected.chainId,
    label: getSemanticTierLabel(dominantSchool, selected.chainId, tier) || selected.chainId,
    tier,
    turns: tierDefinition.turns,
    turnsRemaining: tierDefinition.turns,
    magnitude: tierDefinition.magnitude,
    sourceBonus: tierDefinition.sourceBonus,
    disposition: STATUS_DISPOSITION_BY_SCHOOL[dominantSchool] || 'DEBUFF',
    averageRarity: Number(averageRarity.toFixed(3)),
    hitCount: selected.hitCount,
    matchedKeywords: [...new Set(selected.matchedKeywords)],
  };
}

function amplifyStatusEffect(statusEffect, speaking) {
  if (!statusEffect) {
    return null;
  }

  const potency = clamp01(speaking?.severity?.potency ?? 0);
  const harmony = clamp01(speaking?.harmony?.score ?? 0);
  const act = String(speaking?.speechAct?.primary || '');
  const actBonus = act === 'CURSE' || act === 'BANISHMENT'
    ? 0.12
    : act === 'BLESSING' || act === 'INVOCATION'
      ? 0.1
      : act === 'COMMAND' || act === 'THREAT'
        ? 0.06
        : 0;
  const magnitudeMultiplier = 1 + (potency * 0.35) + (harmony * 0.18) + actBonus;
  const extraTurn = potency >= 0.62 || harmony >= 0.68 || act === 'BANISHMENT' || act === 'BLESSING'
    ? 1
    : 0;

  return {
    ...statusEffect,
    turns: statusEffect.turns + extraTurn,
    turnsRemaining: statusEffect.turnsRemaining + extraTurn,
    magnitude: Number((statusEffect.magnitude * magnitudeMultiplier).toFixed(3)),
  };
}

function resolveDominantSchool({
  schoolDensity,
  intent,
  fallbackSchool = COMBAT_ARENA_SCHOOL,
}) {
  if (intent.healing || intent.terrain) {
    return 'ALCHEMY';
  }

  let winner = COMBAT_SCHOOLS.includes(fallbackSchool) ? fallbackSchool : COMBAT_ARENA_SCHOOL;
  let bestDensity = -1;

  for (const school of COMBAT_SCHOOLS) {
    const density = clamp01(schoolDensity?.[school] ?? 0);
    if (density > bestDensity) {
      bestDensity = density;
      winner = school;
    }
  }

  return winner;
}

function buildRarityPraise(rarity, dominantSchool) {
  const schoolLabel = dominantSchool || COMBAT_ARENA_SCHOOL;
  if (rarity.id === 'SOURCE') {
    return `CODEx kneels before a Source-grade ${schoolLabel} spell.`;
  }
  if (rarity.id === 'LEGENDARY') {
    return `CODEx marks this ${schoolLabel} casting as legendary ordinance.`;
  }
  if (rarity.id === 'MYTHIC') {
    return `CODEx praises the spell as mythic ${schoolLabel} craftsmanship.`;
  }
  if (rarity.id === 'GRIMOIRE') {
    return `CODEx recognizes grimoire-grade structure in the spell.`;
  }
  if (rarity.id === 'UNCOMMON') {
    return `CODEx notes uncommon force gathering through the line.`;
  }
  return `CODEx judges the spell as common but coherent.`;
}

function buildCombatCommentary({
  rarity,
  dominantSchool,
  cohesionScore,
  statusEffect,
  speaking,
  abyssalResonanceMultiplier,
  verseIRAmplifier,
}) {
  const parts = [buildRarityPraise(rarity, dominantSchool)];

  if (cohesionScore >= 0.75) {
    parts.push('Your prose is unassailable. The verse bypasses the enemy guard.');
  } else if (cohesionScore >= 0.55) {
    parts.push('The syntax holds as a disciplined breach through the defense.');
  }

  if (statusEffect) {
    parts.push(
      `A ${String(rarity?.label || 'Common').toUpperCase()} ${dominantSchool} chain manifests: ${statusEffect.label.toUpperCase()}.`
    );
    if (statusEffect.sourceBonus) {
      parts.push('Source pressure floods the chain beyond mortal control.');
    }
  }

  if (speaking?.speechAct?.primary) {
    parts.push(
      `${String(speaking.speechAct.primary).toUpperCase()} delivery settles into ${String(speaking?.prosody?.cadence?.dominantTag || 'LEVEL').toLowerCase()} cadence.`
    );
  }

  if (speaking?.severity?.label && speaking?.severity?.topLexeme) {
    parts.push(
      `${String(speaking.severity.topLexeme).toUpperCase()} carries ${String(speaking.severity.label).toUpperCase()} severity through the weave.`
    );
  }

  if ((Number(speaking?.harmony?.score) || 0) >= 0.55) {
    parts.push('Vowel harmony locks the cast into a higher resonance band.');
  }

  if ((Number(abyssalResonanceMultiplier) || 1) >= 1.15) {
    parts.push('The Lexicon Abyss answers with stored hunger. The arena has not heard these words enough to dull them.');
  } else if ((Number(abyssalResonanceMultiplier) || 1) <= 0.9) {
    parts.push('The Lexicon Abyss recognizes overworked wording and bleeds force from the cast.');
  }

  if ((Number(verseIRAmplifier?.noveltySignal) || 0) >= 0.35 && verseIRAmplifier?.dominantArchetype?.label) {
    parts.push(`${String(verseIRAmplifier.dominantArchetype.label).toUpperCase()} resonance opens through the Synapse Slot.`);
  }

  if (String(verseIRAmplifier?.dominantTier || '') === 'INEXPLICABLE') {
    parts.push('Inexplicable syntax breaches the ordinary lexicon and drags the cast toward source-law rarity.');
  } else if (String(verseIRAmplifier?.dominantTier || '') === 'RARE') {
    parts.push('Rare semantic matter sharpens the verse beyond literal patterning.');
  }

  return parts.join(' ');
}

export async function buildCombatProfile({
  text = '',
  scoreData = null,
  analyzedDoc = null,
  arenaSchool = COMBAT_ARENA_SCHOOL,
  corpusRanks = null,
  fallbackSchool = arenaSchool,
  speakerId = 'speaker:unknown',
  speakerType = 'PLAYER',
  speakerProfile = null,
} = {}) {
  const normalizedText = normalizeCombatText(text);
  const doc = analyzedDoc || await analyzeText(normalizedText);
  const tokens = tokenizeCombatWords(normalizedText);
  const schoolDensity = buildSchoolDensity(doc);
  const baseIntent = detectSpellIntent(tokens);
  const school = resolveDominantSchool({ schoolDensity, intent: baseIntent, fallbackSchool });
  const dominantDensity = clamp01(schoolDensity[school] ?? 0);
  const totalScore = toFiniteNumber(scoreData?.totalScore ?? scoreData?.score, 0);
  const lexicalDiversity = clamp01(doc?.stats?.lexicalDiversity ?? 0);
  const avgWordLength = toFiniteNumber(doc?.stats?.avgWordLength, 0);
  const corpusRarity = computeCorpusRarity(tokens, corpusRanks);
  const scoreSignal = clamp01(totalScore / 100);
  const vocabularySignal = getTraceSignal(scoreData, 'vocabulary_richness');
  const phonemeSignal = getTraceSignal(scoreData, 'phoneme_density');
  const hackingSignal = getTraceSignal(scoreData, 'phonetic_hacking');
  const cohesionSignal = scoreData
    ? getTraceSignal(scoreData, 'syntactic_cohesion')
    : calculateCohesionScore(doc);
  const cohesionScore = scoreData
    ? clamp01(cohesionSignal || calculateCohesionScore(doc))
    : calculateCohesionScore(doc);
  const abyssTrace = getScoreTrace(scoreData, 'abyssal_resonance');
  const abyssSignal = abyssTrace ? clamp01(Number(abyssTrace.rawScore) || 0) : 0.5;
  const abyssalResonanceMultiplier = rawScoreToAbyssMultiplier(abyssSignal);
  const verseIRAmplifier = scoreData?.verseIRAmplifier && typeof scoreData.verseIRAmplifier === 'object'
    ? scoreData.verseIRAmplifier
    : null;

  const rarityScore = clamp01(
    (corpusRarity * 0.4)
    + (lexicalDiversity * 0.15)
    + (clamp01(avgWordLength / 10) * 0.1)
    + (scoreSignal * 0.15)
    + (vocabularySignal * 0.1)
    + (((phonemeSignal + hackingSignal + cohesionScore) / 3) * 0.1)
  );
  const rarity = getCombatRarityByScore(rarityScore);
  const speaking = analyzeSpeaking({
    text: normalizedText,
    analyzedDoc: doc,
    school,
    corpusRanks,
    rarityScore,
    speakerId,
    speakerType,
    speakerProfile,
  });
  const statusEffect = amplifyStatusEffect(detectStatusEffect({
    tokens,
    dominantSchool: school,
    corpusRanks,
    rarity,
  }), speaking);
  const speechAct = String(speaking?.speechAct?.primary || '');
  const healing = baseIntent.healing || (school === 'ALCHEMY' && (speechAct === 'BLESSING' || speechAct === 'PLEA'));
  const buff = baseIntent.buff || speechAct === 'BLESSING';
  const debuff = baseIntent.debuff || speechAct === 'CURSE' || speechAct === 'BANISHMENT' || speechAct === 'THREAT' || speechAct === 'TAUNT';
  const failureDisposition = debuff
    ? 'DEBUFF'
    : buff
      ? 'BUFF'
      : baseIntent.failureDisposition;
  const commentary = buildCombatCommentary({
    rarity,
    dominantSchool: school,
    cohesionScore,
    statusEffect,
    speaking,
    abyssalResonanceMultiplier,
    verseIRAmplifier,
  });
  const intent = {
    ...baseIntent,
    healing,
    buff,
    debuff,
    failureDisposition,
    statusEffect,
    speechAct,
    intonationTag: speaking?.intonation?.mode || null,
    cadenceTag: speaking?.prosody?.cadence?.dominantTag || null,
  };

  return {
    text: normalizedText,
    analyzedDoc: doc,
    tokens,
    tokenCount: tokens.length,
    school,
    schoolDensity,
    dominantDensity,
    sonicDensity: clamp01(schoolDensity.SONIC ?? 0),
    arenaSchool,
    totalScore,
    lexicalDiversity,
    avgWordLength,
    corpusRarity,
    cohesionScore,
    traceSignals: {
      phonemeDensity: phonemeSignal,
      phoneticHacking: hackingSignal,
      vocabulary: vocabularySignal,
      cohesion: cohesionScore,
      abyssalResonance: abyssSignal,
      verseIRAmplifier: clamp01(verseIRAmplifier?.noveltySignal ?? 0),
    },
    abyssalResonanceMultiplier,
    verseIRAmplifier,
    rarity: {
      ...rarity,
      score: rarityScore,
      praise: buildRarityPraise(rarity, school),
    },
    speaking,
    voiceProfile: speaking?.voice?.profile || null,
    nextVoiceProfile: speaking?.voice?.nextProfile || null,
    voiceResonance: Number(speaking?.voice?.resonance) || 0,
    statusEffect,
    commentary,
    intent,
  };
}

export {
  normalizeCombatText,
  tokenizeCombatWords,
};
