const PRIMARY_EMOTION_LABELS = Object.freeze([
  'Joy',
  'Melancholy',
  'Rage',
  'Defiance',
  'Wonder',
  'Dread',
]);

const EMOTION_KEYWORDS = Object.freeze({
  Joy: new Set(['bless', 'heal', 'hope', 'light', 'grace', 'mercy', 'alive']),
  Melancholy: new Set(['cold', 'empty', 'tragic', 'sorrow', 'alone', 'hollow', 'quiet']),
  Rage: new Set(['burn', 'strike', 'sunder', 'break', 'immolate', 'shatter', 'rage']),
  Defiance: new Set(['will', 'stand', 'vow', 'resist', 'rise', 'command', 'unyielding']),
  Wonder: new Set(['witness', 'behold', 'dream', 'echo', 'vision', 'awe', 'supersonic']),
  Dread: new Set(['death', 'doom', 'void', 'mindbreak', 'banish', 'curse', 'frostbite']),
});

const SCHOOL_PREFIX = Object.freeze({
  SONIC: 'Resonant',
  PSYCHIC: 'Fractured',
  VOID: 'Entropic',
  ALCHEMY: 'Caustic',
  WILL: 'Imperative',
});

const EMOTION_NOUN = Object.freeze({
  Joy: 'Exultation',
  Melancholy: 'Sorrow',
  Rage: 'Fury',
  Defiance: 'Resolve',
  Wonder: 'Awe',
  Dread: 'Dread',
});

const ACT_NOUN = Object.freeze({
  COMMAND: 'Pressure',
  INVOCATION: 'Summons',
  THREAT: 'Malice',
  PLEA: 'Supplication',
  DECLARATION: 'Certainty',
  TAUNT: 'Mockery',
  QUESTION: 'Inquiry',
  BANISHMENT: 'Sentence',
  CURSE: 'Blight',
  BLESSING: 'Grace',
});

const SCHOOL_EMOTION_BONUS = Object.freeze({
  SONIC: Object.freeze({ Rage: 0.4, Wonder: 0.18 }),
  PSYCHIC: Object.freeze({ Wonder: 0.3, Dread: 0.22 }),
  VOID: Object.freeze({ Dread: 0.42, Melancholy: 0.18 }),
  ALCHEMY: Object.freeze({ Joy: 0.26, Rage: 0.24 }),
  WILL: Object.freeze({ Defiance: 0.42, Rage: 0.12 }),
});

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function zeroScores() {
  return PRIMARY_EMOTION_LABELS.reduce((out, label) => {
    out[label] = 0;
    return out;
  }, {});
}

function topEntries(scores, limit = 3) {
  return Object.entries(scores)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit);
}

export function analyzeAffect({
  tokens = [],
  school = '',
  speechAct = null,
  severity = null,
} = {}) {
  const normalizedTokens = Array.isArray(tokens)
    ? tokens.map((token) => String(token || '').toLowerCase()).filter(Boolean)
    : [];
  const scores = zeroScores();

  for (const token of normalizedTokens) {
    for (const label of PRIMARY_EMOTION_LABELS) {
      if (EMOTION_KEYWORDS[label].has(token)) {
        scores[label] += 0.9;
      }
    }
  }

  const act = String(speechAct?.primary || '');
  if (act === 'THREAT' || act === 'CURSE') {
    scores.Rage += 1.1;
    scores.Dread += 0.7;
  } else if (act === 'COMMAND' || act === 'DECLARATION') {
    scores.Defiance += 1.05;
  } else if (act === 'INVOCATION') {
    scores.Wonder += 0.9;
  } else if (act === 'PLEA' || act === 'BLESSING') {
    scores.Joy += 0.85;
    scores.Melancholy += 0.3;
  } else if (act === 'QUESTION') {
    scores.Wonder += 0.7;
    scores.Dread += 0.28;
  } else if (act === 'BANISHMENT') {
    scores.Dread += 1.05;
    scores.Defiance += 0.32;
  }

  const schoolBonus = SCHOOL_EMOTION_BONUS[String(school || '').toUpperCase()] || null;
  if (schoolBonus) {
    for (const [label, bonus] of Object.entries(schoolBonus)) {
      scores[label] += bonus;
    }
  }

  const potency = Number(severity?.potency) || 0;
  if (potency >= 0.6) {
    scores.Rage += potency * 0.5;
    scores.Dread += potency * 0.35;
  } else {
    scores.Defiance += potency * 0.24;
  }

  const ranked = topEntries(scores);
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const primary = ranked[0]?.[0] || 'Wonder';
  const prefix = SCHOOL_PREFIX[String(school || '').toUpperCase()] || 'Arcane';

  const subCandidates = [
    {
      id: `${String(school || 'ARCANE').toUpperCase()}_${primary.toUpperCase()}`,
      label: `${prefix} ${EMOTION_NOUN[primary] || primary}`,
      school: String(school || '').toUpperCase() || null,
      weight: total > 0 ? (ranked[0]?.[1] || 0) / total : 0.45,
    },
    {
      id: `${String(school || 'ARCANE').toUpperCase()}_${act || 'DECLARATION'}`,
      label: `${prefix} ${ACT_NOUN[act] || 'Intent'}`,
      school: String(school || '').toUpperCase() || null,
      weight: total > 0 ? clamp01(((ranked[1]?.[1] || ranked[0]?.[1] || 0) / total) * 0.9) : 0.32,
    },
    {
      id: `${String(school || 'ARCANE').toUpperCase()}_SEVERITY`,
      label: severity?.label
        ? `${severity.label} Pressure`
        : `${prefix} Tension`,
      school: String(school || '').toUpperCase() || null,
      weight: clamp01((Number(severity?.potency) || 0) * 0.88),
    },
  ]
    .filter((candidate) => candidate.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 2)
    .map((candidate) => ({
      ...candidate,
      weight: Number(clamp01(candidate.weight).toFixed(3)),
    }));

  return {
    primaryEmotion: primary,
    scores: ranked.map(([label, value]) => ({
      emotion: label,
      weight: total > 0 ? Number((value / total).toFixed(3)) : 0,
    })),
    subemotions: subCandidates,
  };
}
