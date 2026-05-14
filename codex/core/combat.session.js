import {
  COMBAT_ARENA_SCHOOL,
  getFailureCastModifier,
} from './combat.balance.js';
import { createCombatOpponent } from './opponent.engine.js';

export const COMBAT_STATES = Object.freeze({
  INTRO: 'INTRO',
  PLAYER_TURN: 'PLAYER_TURN',
  CASTING: 'CASTING',
  SPELL_FLYING: 'SPELL_FLYING',
  SCORE_REVEAL: 'SCORE_REVEAL',
  OPPONENT_TURN: 'OPPONENT_TURN',
  OPPONENT_CASTING: 'OPPONENT_CASTING',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT',
});

export const PLAYER_MAX_HP = 1000;
export const PLAYER_MAX_MP = 100;
export const MP_COST_PER_CAST = 10;
export const OPPONENT_MAX_HP = 1500;

export function splitCombatLines(text) {
  return String(text || '')
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createInitialCombatStats() {
  return {
    totalPlayerDamage: 0,
    totalPlayerHealing: 0,
    highestPlayerDamage: 0,
    bestSpellText: null,
    bestSpellSchool: null,
    xpAwarded: 0,
    verseEfficiency: 0,
  };
}

function normalizeStatusEffect(statusEffect) {
  if (!statusEffect || typeof statusEffect !== 'object') return null;

  const turns = Math.max(1, Number(statusEffect.turnsRemaining ?? statusEffect.turns) || 1);
  const tier = Math.max(1, Number(statusEffect.tier) || 1);

  return {
    ...statusEffect,
    tier,
    turns: Math.max(1, Number(statusEffect.turns) || turns),
    turnsRemaining: turns,
    magnitude: Math.max(0, Number(statusEffect.magnitude) || 0),
  };
}

export function upsertStatusEffect(statusList, statusEffect) {
  const normalizedStatus = normalizeStatusEffect(statusEffect);
  if (!normalizedStatus) {
    return Array.isArray(statusList) ? statusList : [];
  }

  const entries = Array.isArray(statusList) ? [...statusList] : [];
  const existingIndex = entries.findIndex((entry) => (
    entry?.school === normalizedStatus.school
    && entry?.chainId === normalizedStatus.chainId
    && entry?.disposition === normalizedStatus.disposition
  ));

  if (existingIndex < 0) {
    entries.push(normalizedStatus);
    return entries;
  }

  const existing = normalizeStatusEffect(entries[existingIndex]) || normalizedStatus;
  entries[existingIndex] = {
    ...existing,
    ...normalizedStatus,
    tier: Math.max(existing.tier, normalizedStatus.tier),
    turns: Math.max(existing.turns, normalizedStatus.turns),
    turnsRemaining: Math.max(existing.turnsRemaining, normalizedStatus.turnsRemaining),
    magnitude: Math.max(existing.magnitude, normalizedStatus.magnitude),
  };
  return entries;
}

export function tickStatusEffects(statusList) {
  if (!Array.isArray(statusList) || statusList.length === 0) {
    return [];
  }

  return statusList
    .map((statusEffect) => normalizeStatusEffect(statusEffect))
    .filter(Boolean)
    .map((statusEffect) => ({
      ...statusEffect,
      turnsRemaining: Math.max(0, statusEffect.turnsRemaining - 1),
    }))
    .filter((statusEffect) => statusEffect.turnsRemaining > 0);
}

/**
 * Calculates the net magnitude of a status effect chain for an entity.
 */
export function getStatusMagnitude(entity, chainId) {
  const effects = Array.isArray(entity?.statusEffects) ? entity.statusEffects : [];
  return effects
    .filter((e) => e.chainId === chainId)
    .reduce((sum, e) => sum + (Number(e.magnitude) || 0), 0);
}

export function buildSpellHistoryEntry({ text, scoreData, damage, healing, turnNumber }) {
  return {
    text,
    scoreData,
    school: scoreData?.school || COMBAT_ARENA_SCHOOL,
    damage,
    healing,
    turnNumber,
    lines: splitCombatLines(text),
  };
}

export function updateCombatStats(prevStats, spellEntry) {
  const totalPlayerDamage = (Number(prevStats?.totalPlayerDamage) || 0) + (Number(spellEntry?.damage) || 0);
  const totalPlayerHealing = (Number(prevStats?.totalPlayerHealing) || 0) + (Number(spellEntry?.healing) || 0);
  const highestPlayerDamage = Math.max(Number(prevStats?.highestPlayerDamage) || 0, Number(spellEntry?.damage) || 0);
  const shouldReplaceBest = (Number(spellEntry?.damage) || 0) >= (Number(prevStats?.highestPlayerDamage) || 0);

  return {
    ...prevStats,
    totalPlayerDamage,
    totalPlayerHealing,
    highestPlayerDamage,
    bestSpellText: shouldReplaceBest ? spellEntry?.text || prevStats?.bestSpellText : prevStats?.bestSpellText,
    bestSpellSchool: shouldReplaceBest ? spellEntry?.school || prevStats?.bestSpellSchool : prevStats?.bestSpellSchool,
  };
}

export function createInitialCombatState({ opponent = createCombatOpponent(), battleLog = [] } = {}) {
  return {
    combatState: COMBAT_STATES.INTRO,
    playerHP: PLAYER_MAX_HP,
    playerMP: PLAYER_MAX_MP,
    opponentHP: OPPONENT_MAX_HP,
    opponent,
    lastPlayerSpell: null,
    lastOpponentSpell: null,
    lastScoreData: null,
    lastPlayerDamage: 0,
    lastPlayerHealing: 0,
    lastOpponentDamage: 0,
    turnNumber: 1,
    playerSpellHistory: [],
    playerStatusEffects: [],
    opponentStatusEffects: [],
    opponentDamageModifier: 1,
    opponentStatusLabel: 'NEUTRAL',
    combatStats: createInitialCombatStats(),
    battleLog,
  };
}

export function setCombatState(state, combatState, extraUpdates = {}) {
  return {
    ...state,
    combatState,
    ...extraUpdates,
  };
}

export function applyPlayerCastPreview(state, {
  text,
  previewScore,
  previewDamage,
  previewHealing,
  nextPlayerMP,
  previewPlayerHP,
  previewOpponentHP,
}) {
  return {
    ...state,
    combatState: COMBAT_STATES.SPELL_FLYING,
    playerHP: previewPlayerHP,
    playerMP: nextPlayerMP,
    opponentHP: previewOpponentHP,
    lastPlayerSpell: text,
    lastScoreData: previewScore,
    lastPlayerDamage: previewDamage,
    lastPlayerHealing: previewHealing,
  };
}

export function applyResolvedPlayerCast(state, {
  scoreData,
  damage,
  healing,
  playerHP,
  opponentHP,
  spellHistoryEntry,
  failureDisposition = 'NEUTRAL',
}) {
  const statusEffect = normalizeStatusEffect(scoreData?.statusEffect);
  const playerStatusEffects = statusEffect?.disposition === 'BUFF'
    ? upsertStatusEffect(state.playerStatusEffects, statusEffect)
    : state.playerStatusEffects;
  const opponentStatusEffects = statusEffect?.disposition === 'DEBUFF'
    ? upsertStatusEffect(state.opponentStatusEffects, statusEffect)
    : state.opponentStatusEffects;

  return {
    ...state,
    playerHP,
    opponentHP,
    lastScoreData: scoreData,
    lastPlayerDamage: damage,
    lastPlayerHealing: healing,
    playerSpellHistory: [...state.playerSpellHistory, spellHistoryEntry],
    playerStatusEffects,
    opponentStatusEffects,
    combatStats: updateCombatStats(state.combatStats, spellHistoryEntry),
    opponentDamageModifier: scoreData?.failureCast
      ? getFailureCastModifier(failureDisposition)
      : state.opponentDamageModifier,
    opponentStatusLabel: scoreData?.failureCast
      ? failureDisposition
      : state.opponentStatusLabel,
  };
}

export function restoreFailedPlayerCast(state, pendingCast) {
  return {
    ...state,
    combatState: COMBAT_STATES.PLAYER_TURN,
    playerHP: pendingCast.playerHPBeforeCast,
    playerMP: pendingCast.playerMPBeforeCast,
    opponentHP: pendingCast.opponentHPBeforeCast,
    lastPlayerSpell: null,
    lastScoreData: null,
    lastPlayerDamage: 0,
    lastPlayerHealing: 0,
  };
}

export function startOpponentCast(state, {
  spell,
  damage,
  newPlayerHP,
  signatureMove = null,
  moveLabel = null,
  moveSchool = null,
  telegraph = null,
}) {
  return {
    ...state,
    combatState: COMBAT_STATES.OPPONENT_CASTING,
    playerHP: newPlayerHP,
    lastOpponentSpell: spell,
    lastOpponentDamage: damage,
    lastOpponentSignatureMove: signatureMove,
    lastOpponentMoveLabel: moveLabel || signatureMove?.name || null,
    lastOpponentMoveSchool: moveSchool || null,
    lastOpponentTelegraph: telegraph || null,
    opponentDamageModifier: 1,
    opponentStatusLabel: 'NEUTRAL',
  };
}

export function completeOpponentTurn(state, { nextPlayerMP }) {
  return {
    ...state,
    combatState: COMBAT_STATES.PLAYER_TURN,
    turnNumber: state.turnNumber + 1,
    playerMP: nextPlayerMP,
    playerStatusEffects: tickStatusEffects(state.playerStatusEffects),
    opponentStatusEffects: tickStatusEffects(state.opponentStatusEffects),
    opponentDamageModifier: 1,
    opponentStatusLabel: 'NEUTRAL',
  };
}

export function markCombatVictory(state, { xpAward }) {
  return {
    ...state,
    combatState: COMBAT_STATES.VICTORY,
    combatStats: {
      ...state.combatStats,
      xpAwarded: state.combatStats.xpAwarded || xpAward?.amount || 0,
      verseEfficiency: xpAward?.verseEfficiency || state.combatStats.verseEfficiency || 0,
    },
  };
}

export function markCombatDefeat(state) {
  return {
    ...state,
    combatState: COMBAT_STATES.DEFEAT,
  };
}
