import { ABYSS_MIN_MULTIPLIER, ABYSS_MAX_MULTIPLIER } from './lexicon.abyss.js';

export const COMBAT_SCHOOLS = Object.freeze(['SONIC', 'PSYCHIC', 'VOID', 'ALCHEMY', 'WILL']);
export const COMBAT_ARENA_SCHOOL = 'SONIC';
export const MIN_COMBAT_DAMAGE = 5;
export const BASE_MP_REGEN = 10;
export const FAILURE_CAST_THRESHOLD = 8;

const STRONG_MULTIPLIER = 1.25;
const WEAK_MULTIPLIER = 0.82;
const NEUTRAL_MULTIPLIER = 1;

const SCHOOL_EFFECTIVENESS = Object.freeze({
  SONIC: Object.freeze({
    SONIC: NEUTRAL_MULTIPLIER,
    PSYCHIC: STRONG_MULTIPLIER,
    VOID: WEAK_MULTIPLIER,
    ALCHEMY: WEAK_MULTIPLIER,
    WILL: NEUTRAL_MULTIPLIER,
  }),
  PSYCHIC: Object.freeze({
    SONIC: WEAK_MULTIPLIER,
    PSYCHIC: NEUTRAL_MULTIPLIER,
    VOID: NEUTRAL_MULTIPLIER,
    ALCHEMY: STRONG_MULTIPLIER,
    WILL: NEUTRAL_MULTIPLIER,
  }),
  VOID: Object.freeze({
    SONIC: STRONG_MULTIPLIER,
    PSYCHIC: NEUTRAL_MULTIPLIER,
    VOID: NEUTRAL_MULTIPLIER,
    ALCHEMY: WEAK_MULTIPLIER,
    WILL: WEAK_MULTIPLIER,
  }),
  ALCHEMY: Object.freeze({
    SONIC: NEUTRAL_MULTIPLIER,
    PSYCHIC: NEUTRAL_MULTIPLIER,
    VOID: STRONG_MULTIPLIER,
    ALCHEMY: NEUTRAL_MULTIPLIER,
    WILL: NEUTRAL_MULTIPLIER,
  }),
  WILL: Object.freeze({
    SONIC: NEUTRAL_MULTIPLIER,
    PSYCHIC: NEUTRAL_MULTIPLIER,
    VOID: STRONG_MULTIPLIER,
    ALCHEMY: NEUTRAL_MULTIPLIER,
    WILL: NEUTRAL_MULTIPLIER,
  }),
});

export const COMBAT_RARITY_TIERS = Object.freeze([
  Object.freeze({
    id: 'COMMON',
    label: 'Common',
    minScore: 0,
    bonusMultiplier: 0,
    totalMultiplier: 1,
    ordinal: 0,
  }),
  Object.freeze({
    id: 'UNCOMMON',
    label: 'Uncommon',
    minScore: 0.28,
    bonusMultiplier: 0.5,
    totalMultiplier: 1.5,
    ordinal: 1,
  }),
  Object.freeze({
    id: 'GRIMOIRE',
    label: 'Grimoire',
    minScore: 0.46,
    bonusMultiplier: 1.2,
    totalMultiplier: 2.2,
    ordinal: 2,
  }),
  Object.freeze({
    id: 'MYTHIC',
    label: 'Mythic',
    minScore: 0.62,
    bonusMultiplier: 1.8,
    totalMultiplier: 2.8,
    ordinal: 3,
  }),
  Object.freeze({
    id: 'LEGENDARY',
    label: 'Legendary',
    minScore: 0.78,
    bonusMultiplier: 2.5,
    totalMultiplier: 3.5,
    ordinal: 4,
  }),
  Object.freeze({
    id: 'SOURCE',
    label: 'Source',
    minScore: 0.91,
    bonusMultiplier: 3,
    totalMultiplier: 4,
    ordinal: 5,
  }),
]);

const STATUS_TIER_DEFINITIONS = Object.freeze([
  Object.freeze({ tier: 1, turns: 1, magnitude: 0.05 }),
  Object.freeze({ tier: 2, turns: 2, magnitude: 0.10 }),
  Object.freeze({ tier: 3, turns: 3, magnitude: 0.15 }),
  Object.freeze({ tier: 4, turns: 4, magnitude: 0.20 }),
  Object.freeze({ tier: 5, turns: 5, magnitude: 0.25 }),
]);

export function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

export function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

export function getSchoolEffectiveness(attackSchool, defenseSchool) {
  const attacker = COMBAT_SCHOOLS.includes(attackSchool) ? attackSchool : COMBAT_ARENA_SCHOOL;
  const defender = COMBAT_SCHOOLS.includes(defenseSchool) ? defenseSchool : null;
  if (!defender) return NEUTRAL_MULTIPLIER;
  return SCHOOL_EFFECTIVENESS?.[attacker]?.[defender] ?? NEUTRAL_MULTIPLIER;
}

export function getCounterSchool(targetSchool, fallbackSchool = 'VOID') {
  const defender = COMBAT_SCHOOLS.includes(targetSchool) ? targetSchool : COMBAT_ARENA_SCHOOL;
  let bestSchool = COMBAT_SCHOOLS.includes(fallbackSchool) ? fallbackSchool : COMBAT_ARENA_SCHOOL;
  let bestMultiplier = -Infinity;

  for (const school of COMBAT_SCHOOLS) {
    const multiplier = getSchoolEffectiveness(school, defender);
    if (multiplier > bestMultiplier) {
      bestMultiplier = multiplier;
      bestSchool = school;
    }
  }

  return bestSchool;
}

export function getCombatRarityByScore(score) {
  // Apply Abyssal Gate: extreme results are compressed unless fresh
  const gatedScore = clampNumber(score, ABYSS_MIN_MULTIPLIER, ABYSS_MAX_MULTIPLIER);
  const normalizedScore = clamp01(gatedScore);
  let selected = COMBAT_RARITY_TIERS[0];

  for (const definition of COMBAT_RARITY_TIERS) {
    if (normalizedScore >= definition.minScore) {
      selected = definition;
    }
  }

  return selected;
}

export function getStatusTierDefinition(tier, options = {}) {
  const safeTier = clampNumber(Math.floor(Number(tier) || 0), 1, STATUS_TIER_DEFINITIONS.length);
  const base = STATUS_TIER_DEFINITIONS[safeTier - 1];
  const rarityId = String(options?.rarityId || '').toUpperCase();
  const school = String(options?.school || '').toUpperCase() || null;
  const sourceBonus = safeTier === STATUS_TIER_DEFINITIONS.length && rarityId === 'SOURCE'
    ? `${school || 'ARCANE'}_SOURCE`
    : null;

  return {
    ...base,
    sourceBonus,
  };
}

export function getOpponentMemoryWindow(intelligence) {
  const intValue = Number(intelligence) || 0;
  if (intValue >= 20) return Number.POSITIVE_INFINITY;
  if (intValue >= 12) return 8;
  if (intValue >= 6) return 4;
  return 1;
}

export function getIntelligenceSignal(intelligence) {
  return clamp01(((Number(intelligence) || 0) - 1) / 19);
}

export function computeArenaResonanceMultiplier({
  dominantSchool,
  schoolDensity,
  arenaSchool = COMBAT_ARENA_SCHOOL,
} = {}) {
  const density = schoolDensity && typeof schoolDensity === 'object'
    ? schoolDensity
    : {};
  const arenaDensity = clamp01(density[arenaSchool] ?? 0);
  const dominantDensity = clamp01(density[dominantSchool] ?? 0);

  if (dominantSchool === arenaSchool) {
    return 1 + (Math.pow(arenaDensity, 1.35) * 0.45);
  }

  const penalty = Math.pow(dominantDensity, 1.15) * 0.18;
  const compensation = Math.pow(arenaDensity, 1.05) * 0.08;
  return clampNumber(1 - penalty + compensation, 0.82, 1.04);
}

function getTraceRawScore(scoreData, heuristic) {
  const traces = Array.isArray(scoreData?.traces)
    ? scoreData.traces
    : Array.isArray(scoreData?.explainTrace)
      ? scoreData.explainTrace
      : [];
  const trace = traces.find((entry) => entry?.heuristic === heuristic);
  const raw = Number(trace?.rawScore);
  if (Number.isFinite(raw)) return clamp01(raw);
  const contribution = Number(trace?.contribution);
  return Number.isFinite(contribution) ? clamp01(contribution / 20) : 0;
}

function computeCombatManaRegen(scoreData, options = {}) {
  const baseRegen = Number(options.baseRegen) || BASE_MP_REGEN;
  const sonicDensity = clamp01(scoreData?.schoolDensity?.SONIC ?? 0);
  const isSonicSpell = scoreData?.school === 'SONIC' || sonicDensity >= 0.34;
  if (!isSonicSpell) {
    return baseRegen;
  }

  const rarityOrdinal = Number(scoreData?.rarity?.ordinal) || 0;
  const phonemeSignal = getTraceRawScore(scoreData, 'phoneme_density');
  const hackingSignal = getTraceRawScore(scoreData, 'phonetic_hacking');
  const vocabularySignal = getTraceRawScore(scoreData, 'vocabulary_richness');

  const bonus = Math.round(
    (sonicDensity * 8)
    + (phonemeSignal * 4)
    + (hackingSignal * 3)
    + (vocabularySignal * 2)
    + (rarityOrdinal * 2)
  );

  return clampNumber(baseRegen + bonus, baseRegen, 28);
}

export function getFailureCastModifier(disposition) {
  if (disposition === 'DEBUFF') return 0.85;
  if (disposition === 'BUFF') return 1.15;
  return 1;
}

export function computeVerseEfficiency(totalDamage, turnsTaken) {
  const turns = Math.max(1, Number(turnsTaken) || 1);
  const damage = Math.max(0, Number(totalDamage) || 0);
  return damage / turns;
}

function computeCombatXpAward({
  victory = true,
  totalPlayerDamage = 0,
  totalPlayerHealing = 0,
  turnsTaken = 1,
  opponentInt = 1,
  playerHP = 0,
  maxPlayerHP = 1,
} = {}) {
  if (!victory) {
    return {
      amount: 0,
      source: 'combat_defeat',
      breakdown: {
        base: 0,
        efficiency: 0,
        difficulty: 0,
        survival: 0,
        healing: 0,
      },
      verseEfficiency: 0,
    };
  }

  const verseEfficiency = computeVerseEfficiency(totalPlayerDamage, turnsTaken);
  const base = 40;
  const efficiency = Math.min(45, Math.round(verseEfficiency / 4));
  const difficulty = Math.max(0, Math.round((Number(opponentInt) || 0) * 4));
  const survivalRatio = maxPlayerHP > 0 ? clamp01((Number(playerHP) || 0) / maxPlayerHP) : 0;
  const survival = Math.round(survivalRatio * 15);
  const healing = Math.min(12, Math.round((Number(totalPlayerHealing) || 0) / 25));
  const amount = base + efficiency + difficulty + survival + healing;

  return {
    amount,
    source: 'combat_victory',
    breakdown: {
      base,
      efficiency,
      difficulty,
      survival,
      healing,
    },
    verseEfficiency,
  };
}
