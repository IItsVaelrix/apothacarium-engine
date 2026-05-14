import {
  COMBAT_ARENA_SCHOOL,
  FAILURE_CAST_THRESHOLD,
  MIN_COMBAT_DAMAGE,
  clamp01,
  computeArenaResonanceMultiplier,
  getSchoolEffectiveness,
} from './combat.balance.js';
import { buildCombatProfile } from './combat.profile.js';
import { buildSpeakingTraces } from './speaking/index.js';
import { calculateSyntacticBridge } from './spellweave.engine.js';

const SCORE_TO_DAMAGE_MULTIPLIER = 1.1;
const SCORE_TO_DAMAGE_OFFSET = 6;

export function getCombatTotalScore(scoreData) {
  const total = Number(scoreData?.totalScore ?? scoreData?.score ?? 0);
  return Number.isFinite(total) ? total : 0;
}

export function getCombatTraces(scoreData) {
  const traces = scoreData?.traces ?? scoreData?.explainTrace;
  return Array.isArray(traces) ? traces : [];
}

function getDominantDensity(profile) {
  return clamp01(profile?.schoolDensity?.[profile?.school] ?? profile?.dominantDensity ?? 0);
}

function computeBaseDamage(totalScore) {
  return Math.max(
    MIN_COMBAT_DAMAGE,
    Math.round((Math.max(0, totalScore) * SCORE_TO_DAMAGE_MULTIPLIER) + SCORE_TO_DAMAGE_OFFSET)
  );
}

function computeSyntaxControl(profile) {
  const cohesionScore = clamp01(profile?.cohesionScore ?? profile?.traceSignals?.cohesion ?? 0);
  const dominantDensity = getDominantDensity(profile);
  return 0.9 + (cohesionScore * 0.18) + (dominantDensity * 0.06);
}

function computeSpeechActMultiplier(profile) {
  const speechAct = String(profile?.intent?.speechAct || '');
  if (speechAct === 'THREAT' || speechAct === 'BANISHMENT') return 1.12;
  if (speechAct === 'COMMAND' || speechAct === 'DECLARATION') return 1.08;
  if (speechAct === 'BANISHMENT') return 1.1;
  if (speechAct === 'INVOCATION') return 1.06;
  if (speechAct === 'BLESSING' || speechAct === 'PLEA') return 0.98;
  if (speechAct === 'QUESTION') return 1.03;
  return 1;
}

function computeProsodyMultiplier(profile) {
  const beatAlignment = clamp01(profile?.speaking?.prosody?.beatAlignment ?? 0);
  const controlledVariance = clamp01(profile?.speaking?.prosody?.controlledVariance ?? 0);
  const closureScore = clamp01(profile?.speaking?.prosody?.closureScore ?? 0);
  return 0.94 + (beatAlignment * 0.1) + (controlledVariance * 0.08) + (closureScore * 0.08);
}

function computeHarmonyMultiplier(profile) {
  const harmony = clamp01(profile?.speaking?.harmony?.score ?? 0);
  return 0.96 + (harmony * 0.18);
}

function computeSeverityMultiplier(profile) {
  const potency = clamp01(profile?.speaking?.severity?.potency ?? 0);
  const rarityAmplifier = clamp01(profile?.speaking?.severity?.rarityAmplifier ?? 0);
  return 0.94 + (potency * 0.22) + (rarityAmplifier * 0.08);
}

function computeVoiceResonanceMultiplier(profile) {
  const voiceResonance = clamp01(profile?.voiceResonance ?? profile?.speaking?.voice?.resonance ?? 0);
  return 0.96 + (voiceResonance * 0.16);
}

function computeDamageFloor(profile) {
  const cohesionScore = clamp01(profile?.cohesionScore ?? profile?.traceSignals?.cohesion ?? 0);
  const statusTier = Math.max(0, Number(profile?.statusEffect?.tier) || 0);
  const severityPotency = clamp01(profile?.speaking?.severity?.potency ?? 0);
  return MIN_COMBAT_DAMAGE + Math.round((cohesionScore * 4) + Math.min(3, statusTier * 0.5) + (severityPotency * 3));
}

function computeHealingAmount(profile, damage) {
  const speechAct = String(profile?.intent?.speechAct || '');
  const isBlessedHealing = speechAct === 'BLESSING' || speechAct === 'PLEA';
  if ((!profile?.intent?.healing && !isBlessedHealing) || profile.school !== 'ALCHEMY') {
    return 0;
  }

  const rarityBonus = Number(profile?.rarity?.ordinal) || 0;
  const speechBonus = isBlessedHealing ? 0.18 : 0;
  const voiceBonus = clamp01(profile?.voiceResonance ?? 0);
  return Math.max(
    0,
    Math.round((damage * (0.75 + speechBonus)) + (profile.totalScore * 0.2) + (rarityBonus * 4) + (voiceBonus * 6))
  );
}

function isFailureCast(profile) {
  const speakingRescue = clamp01(
    (
      (Number(profile?.speaking?.prosody?.beatAlignment) || 0)
      + (Number(profile?.speaking?.harmony?.score) || 0)
      + (Number(profile?.voiceResonance) || 0)
      + (Number(profile?.speaking?.speechAct?.confidence) || 0)
    ) / 4
  );
  if ((Number(profile?.totalScore) || 0) < FAILURE_CAST_THRESHOLD && speakingRescue >= 0.62) {
    return false;
  }
  return (
    (Number(profile?.totalScore) || 0) < FAILURE_CAST_THRESHOLD
    || (Number(profile?.tokenCount) || 0) <= 2
    || getDominantDensity(profile) < 0.24
  );
}

// Lore Sheet Rating Ladder
const RATINGS = {
  NEOPHYTE: 'Neophyte',
  ADEPT: 'Adept',
  MASTER: 'Master',
  GODLIKE: 'Godlike',
};

function getRatingForValue(val) {
  if (val >= 0.9) return RATINGS.GODLIKE;
  if (val >= 0.7) return RATINGS.MASTER;
  if (val >= 0.4) return RATINGS.ADEPT;
  return RATINGS.NEOPHYTE;
}

export function calculateCombatScore({
  text = '',
  weave = '',
  scoreData = null,
  arenaSchool = COMBAT_ARENA_SCHOOL,
  defenderSchool = null,
  analyzedDoc = null,
  corpusRanks = null,
  fallbackSchool = arenaSchool,
  speakerId = 'speaker:unknown',
  speakerType = 'PLAYER',
  speakerProfile = null,
} = {}) {
  const totalScore = getCombatTotalScore(scoreData);
  const traces = getCombatTraces(scoreData);
  const profile = buildCombatProfile({
    text,
    scoreData: {
      ...scoreData,
      totalScore,
      traces,
    },
    analyzedDoc,
    arenaSchool,
    corpusRanks,
    fallbackSchool,
    speakerId,
    speakerType,
    speakerProfile,
  });

  // Calculate Syntactic Bridge (Weave)
  const bridge = calculateSyntacticBridge({
    verse: text,
    weave: weave,
    dominantSchool: profile.school
  });

  const baseDamage = computeBaseDamage(totalScore);
  const arenaResonanceMultiplier = computeArenaResonanceMultiplier({
    dominantSchool: profile.school,
    schoolDensity: profile.schoolDensity,
    arenaSchool,
  });
  const schoolAffinityMultiplier = getSchoolEffectiveness(profile.school, defenderSchool);
  const densityMultiplier = 1 + (getDominantDensity(profile) * 0.18);
  const terrainMultiplier = profile.intent.terrain ? 1.08 : 1;
  const supportPenalty = profile.intent.healing ? 0.72 : 1;
  const syntaxControlMultiplier = computeSyntaxControl(profile);
  const speechActMultiplier = computeSpeechActMultiplier(profile);
  const prosodyMultiplier = computeProsodyMultiplier(profile);
  const harmonyMultiplier = computeHarmonyMultiplier(profile);
  const severityMultiplier = computeSeverityMultiplier(profile);
  const voiceResonanceMultiplier = computeVoiceResonanceMultiplier(profile);
  const weaveResonanceMultiplier = bridge.resonance;
  const speakingTraces = buildSpeakingTraces(profile.speaking);
  const combinedTraces = [...traces, ...speakingTraces];

  const rawDamage = baseDamage
    * arenaResonanceMultiplier
    * schoolAffinityMultiplier
    * densityMultiplier
    * terrainMultiplier
    * syntaxControlMultiplier
    * speechActMultiplier
    * prosodyMultiplier
    * harmonyMultiplier
    * severityMultiplier
    * voiceResonanceMultiplier
    * weaveResonanceMultiplier
    * (profile.rarity?.totalMultiplier ?? 1)
    * (profile.abyssalResonanceMultiplier ?? 1)
    * supportPenalty;

  const damage = Math.max(computeDamageFloor(profile), Math.round(rawDamage));
  const healing = computeHealingAmount(profile, damage);
  const failureCast = isFailureCast(profile) || bridge.collapsed;

  // Lore Sheet Stat Mapping
  const syntVal = clamp01((profile.cohesionScore + (profile.tokenCount / 20) + (profile.rhymeQuality || 0)) / 3);
  const metaVal = clamp01(profile.abyssalResonanceMultiplier || 0.1);
  const mythVal = clamp01((profile.verseIRAmplifier?.totalMultiplier || 1) / 2);
  const visVal = clamp01(profile.literaryDeviceRichness || 0.2);
  const psycVal = clamp01(profile.emotionalResonance || 0.2);
  const codexVal = clamp01(profile.vocabularyRichness || 0.3);

  const loreStats = {
    SYNT: { rating: getRatingForValue(syntVal), value: syntVal, justification: 'Structural precision and internal patterning.' },
    META: { rating: getRatingForValue(metaVal), value: metaVal, justification: 'Spiritual reach and reality-bending force.' },
    MYTH: { rating: getRatingForValue(mythVal), value: mythVal, justification: 'Symbolic archetype and epic resonance.' },
    VIS: { rating: getRatingForValue(visVal), value: visVal, justification: 'Visual imagination and atmospheric force.' },
    PSYC: { rating: getRatingForValue(psycVal), value: psycVal, justification: 'Trauma logic and cognitive complexity.' },
    CODEX: { rating: getRatingForValue(codexVal), value: codexVal, justification: 'Lore density and continuity weight.' },
  };

  return {
    totalScore,
    traces: combinedTraces,
    explainTrace: combinedTraces,
    damage,
    healing,
    school: bridge.school || profile.school,
    schoolDensity: profile.schoolDensity,
    arenaSchool,
    opponentSchool: defenderSchool || null,
    arenaResonanceMultiplier,
    schoolAffinityMultiplier,
    syntaxControlMultiplier,
    speechActMultiplier,
    prosodyMultiplier,
    harmonyMultiplier,
    severityMultiplier,
    voiceResonanceMultiplier,
    abyssalResonanceMultiplier: profile.abyssalResonanceMultiplier,
    weaveResonanceMultiplier,
    bridge,
    rarity: profile.rarity,
    intent: {
      ...profile.intent,
      bridgeIntent: bridge.intent || null,
    },
    cohesionScore: profile.cohesionScore,
    speaking: profile.speaking,
    voiceProfile: profile.voiceProfile,
    nextVoiceProfile: profile.nextVoiceProfile,
    statusEffect: profile.statusEffect,
    failureCast,
    commentary: bridge.collapsed ? "Syntactic Collapse: The Weave has frayed." : (profile.commentary || profile.rarity?.praise || ''),
    loreStats,
  };
}

export async function normalizeCombatScore(scoreData, options = {}) {
  return await calculateCombatScore({
    text: options.scrollText || scoreData?.scrollText || '',
    weave: options.weave || scoreData?.weave || '',
    scoreData,
    arenaSchool: options.arenaSchool,
    defenderSchool: options.opponentSchool,
    analyzedDoc: options.analyzedDoc,
    corpusRanks: options.corpusRanks,
    fallbackSchool: options.fallbackSchool,
    speakerId: options.speakerId,
    speakerType: options.speakerType,
    speakerProfile: options.speakerProfile,
  });
}

export { MIN_COMBAT_DAMAGE };
