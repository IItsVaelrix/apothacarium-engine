import { COMBAT_ARENA_SCHOOL } from '../combat.balance.js';

export const VOICE_PROFILE_VERSION = 1;

const BASELINES_BY_SCHOOL = Object.freeze({
  SONIC: Object.freeze({
    preferredSpeechAct: 'THREAT',
    preferredCadence: 'SURGING',
    preferredFoot: 'TROCHEE',
    preferredSeverity: 'Boom',
  }),
  PSYCHIC: Object.freeze({
    preferredSpeechAct: 'QUESTION',
    preferredCadence: 'WITHHELD',
    preferredFoot: 'IAMB',
    preferredSeverity: 'Fracture',
  }),
  VOID: Object.freeze({
    preferredSpeechAct: 'BANISHMENT',
    preferredCadence: 'WITHHELD',
    preferredFoot: 'DACTYL',
    preferredSeverity: 'Nothingness',
  }),
  ALCHEMY: Object.freeze({
    preferredSpeechAct: 'INVOCATION',
    preferredCadence: 'RESOLVED',
    preferredFoot: 'IAMB',
    preferredSeverity: 'Burn',
  }),
  WILL: Object.freeze({
    preferredSpeechAct: 'COMMAND',
    preferredCadence: 'FALLING',
    preferredFoot: 'TROCHEE',
    preferredSeverity: 'Strike',
  }),
});

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function cloneCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((out, [key, count]) => {
    const numeric = Number(count);
    if (Number.isFinite(numeric) && numeric > 0) {
      out[String(key)] = numeric;
    }
    return out;
  }, {});
}

function topKey(counts, fallback) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) return fallback;
  entries.sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
  return entries[0][0];
}

function baselineForSchool(school) {
  return BASELINES_BY_SCHOOL[String(school || '').toUpperCase()] || BASELINES_BY_SCHOOL[COMBAT_ARENA_SCHOOL];
}

function incrementCount(counts, key, amount = 1) {
  if (!key) return counts;
  const next = { ...(counts || {}) };
  next[key] = (Number(next[key]) || 0) + amount;
  return next;
}

export function createSpeakerVoiceProfile({
  speakerId = 'speaker:unknown',
  speakerType = 'PLAYER',
  school = COMBAT_ARENA_SCHOOL,
} = {}) {
  const baseline = baselineForSchool(school);
  return {
    version: VOICE_PROFILE_VERSION,
    speakerId: String(speakerId || 'speaker:unknown'),
    speakerType: String(speakerType || 'PLAYER').toUpperCase(),
    school: String(school || COMBAT_ARENA_SCHOOL).toUpperCase(),
    samples: 0,
    speechActCounts: incrementCount({}, baseline.preferredSpeechAct, 1),
    cadenceCounts: incrementCount({}, baseline.preferredCadence, 1),
    footCounts: incrementCount({}, baseline.preferredFoot, 1),
    severityCounts: incrementCount({}, baseline.preferredSeverity, 1),
    subemotionCounts: {},
    contourAverages: {
      opening: 0.5,
      crest: 0.5,
      closure: 0.5,
      volatility: 0.5,
    },
  };
}

export function normalizeVoiceProfile(rawProfile, options = {}) {
  const fallback = createSpeakerVoiceProfile(options);
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
    return fallback;
  }

  return {
    version: VOICE_PROFILE_VERSION,
    speakerId: String(rawProfile.speakerId || fallback.speakerId),
    speakerType: String(rawProfile.speakerType || fallback.speakerType).toUpperCase(),
    school: String(rawProfile.school || fallback.school).toUpperCase(),
    samples: Math.max(0, Number(rawProfile.samples) || 0),
    speechActCounts: {
      ...fallback.speechActCounts,
      ...cloneCounts(rawProfile.speechActCounts),
    },
    cadenceCounts: {
      ...fallback.cadenceCounts,
      ...cloneCounts(rawProfile.cadenceCounts),
    },
    footCounts: {
      ...fallback.footCounts,
      ...cloneCounts(rawProfile.footCounts),
    },
    severityCounts: {
      ...fallback.severityCounts,
      ...cloneCounts(rawProfile.severityCounts),
    },
    subemotionCounts: cloneCounts(rawProfile.subemotionCounts),
    contourAverages: {
      opening: clamp01(rawProfile?.contourAverages?.opening ?? fallback.contourAverages.opening),
      crest: clamp01(rawProfile?.contourAverages?.crest ?? fallback.contourAverages.crest),
      closure: clamp01(rawProfile?.contourAverages?.closure ?? fallback.contourAverages.closure),
      volatility: clamp01(rawProfile?.contourAverages?.volatility ?? fallback.contourAverages.volatility),
    },
  };
}

export function getVoiceProfileSnapshot(profile) {
  const normalized = normalizeVoiceProfile(profile);
  return {
    version: normalized.version,
    speakerId: normalized.speakerId,
    speakerType: normalized.speakerType,
    school: normalized.school,
    samples: normalized.samples,
    preferredSpeechAct: topKey(normalized.speechActCounts, baselineForSchool(normalized.school).preferredSpeechAct),
    preferredCadence: topKey(normalized.cadenceCounts, baselineForSchool(normalized.school).preferredCadence),
    preferredFoot: topKey(normalized.footCounts, baselineForSchool(normalized.school).preferredFoot),
    preferredSeverity: topKey(normalized.severityCounts, baselineForSchool(normalized.school).preferredSeverity),
    contourAverages: {
      ...normalized.contourAverages,
    },
  };
}

export function computeVoiceResonance(profile, speakingAnalysis = {}) {
  const normalized = normalizeVoiceProfile(profile, {
    speakerId: speakingAnalysis?.voice?.speakerId,
    speakerType: speakingAnalysis?.voice?.speakerType,
    school: speakingAnalysis?.school,
  });
  const snapshot = getVoiceProfileSnapshot(normalized);
  const currentSpeechAct = String(speakingAnalysis?.speechAct?.primary || '');
  const currentCadence = String(speakingAnalysis?.prosody?.cadence?.dominantTag || '');
  const currentFoot = String(speakingAnalysis?.prosody?.dominantFoot || '');
  const currentSeverity = String(speakingAnalysis?.severity?.label || '');
  const contour = speakingAnalysis?.intonation?.contour || {};
  const maturity = clamp01(normalized.samples / 8);

  let score = 0.14;
  if (snapshot.preferredSpeechAct && snapshot.preferredSpeechAct === currentSpeechAct) score += 0.28;
  if (snapshot.preferredCadence && snapshot.preferredCadence === currentCadence) score += 0.22;
  if (snapshot.preferredFoot && snapshot.preferredFoot === currentFoot) score += 0.16;
  if (snapshot.preferredSeverity && snapshot.preferredSeverity === currentSeverity) score += 0.12;

  const contourDelta = (
    Math.abs((Number(contour.opening) || 0.5) - snapshot.contourAverages.opening)
    + Math.abs((Number(contour.crest) || 0.5) - snapshot.contourAverages.crest)
    + Math.abs((Number(contour.closure) || 0.5) - snapshot.contourAverages.closure)
    + Math.abs((Number(contour.volatility) || 0.5) - snapshot.contourAverages.volatility)
  ) / 4;
  score += (1 - clamp01(contourDelta)) * 0.18;
  score += maturity * 0.1;

  return clamp01(score);
}

export function updateVoiceProfile(profile, speakingAnalysis = {}) {
  const normalized = normalizeVoiceProfile(profile, {
    speakerId: speakingAnalysis?.voice?.speakerId || speakingAnalysis?.speakerId,
    speakerType: speakingAnalysis?.voice?.speakerType || speakingAnalysis?.speakerType,
    school: speakingAnalysis?.school,
  });
  const sampleCount = normalized.samples + 1;
  const contour = speakingAnalysis?.intonation?.contour || {};
  const next = {
    ...normalized,
    school: String(speakingAnalysis?.school || normalized.school || COMBAT_ARENA_SCHOOL).toUpperCase(),
    samples: sampleCount,
    speechActCounts: incrementCount(normalized.speechActCounts, speakingAnalysis?.speechAct?.primary),
    cadenceCounts: incrementCount(normalized.cadenceCounts, speakingAnalysis?.prosody?.cadence?.dominantTag),
    footCounts: incrementCount(normalized.footCounts, speakingAnalysis?.prosody?.dominantFoot),
    severityCounts: incrementCount(normalized.severityCounts, speakingAnalysis?.severity?.label),
    subemotionCounts: { ...normalized.subemotionCounts },
    contourAverages: {
      opening: ((normalized.contourAverages.opening * normalized.samples) + clamp01(contour.opening ?? 0.5)) / sampleCount,
      crest: ((normalized.contourAverages.crest * normalized.samples) + clamp01(contour.crest ?? 0.5)) / sampleCount,
      closure: ((normalized.contourAverages.closure * normalized.samples) + clamp01(contour.closure ?? 0.5)) / sampleCount,
      volatility: ((normalized.contourAverages.volatility * normalized.samples) + clamp01(contour.volatility ?? 0.5)) / sampleCount,
    },
  };

  const subemotions = Array.isArray(speakingAnalysis?.affect?.subemotions)
    ? speakingAnalysis.affect.subemotions
    : [];
  for (const entry of subemotions) {
    const id = String(entry?.id || '').trim();
    if (!id) continue;
    next.subemotionCounts = incrementCount(next.subemotionCounts, id, clamp01(entry?.weight || 0.5));
  }

  return next;
}
