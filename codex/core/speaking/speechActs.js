const SPEECH_ACT_LABELS = Object.freeze([
  'COMMAND',
  'INVOCATION',
  'THREAT',
  'PLEA',
  'DECLARATION',
  'TAUNT',
  'QUESTION',
  'BANISHMENT',
  'CURSE',
  'BLESSING',
]);

const SPEECH_ACT_RULES = Object.freeze({
  COMMAND: Object.freeze({
    keywords: Object.freeze(['obey', 'yield', 'kneel', 'listen', 'hush', 'stop', 'stand', 'submit', 'fall']),
    phrases: Object.freeze(['be still', 'hear me', 'do as', 'you must']),
  }),
  INVOCATION: Object.freeze({
    keywords: Object.freeze(['invoke', 'summon', 'call', 'awaken', 'witness', 'arise', 'gather', 'behold']),
    phrases: Object.freeze(['by the', 'let the', 'come forth', 'i call']),
  }),
  THREAT: Object.freeze({
    keywords: Object.freeze(['destroy', 'break', 'shatter', 'kill', 'bleed', 'doom', 'end', 'crush', 'sunder']),
    phrases: Object.freeze(['i will', 'soon you', 'before i', 'you will']),
  }),
  PLEA: Object.freeze({
    keywords: Object.freeze(['please', 'mercy', 'spare', 'help', 'save', 'grant', 'forgive']),
    phrases: Object.freeze(['let me', 'spare me', 'hear my', 'show mercy']),
  }),
  DECLARATION: Object.freeze({
    keywords: Object.freeze(['declare', 'name', 'vow', 'swear', 'stand', 'am', 'become']),
    phrases: Object.freeze(['i am', 'i stand', 'this is', 'so it is']),
  }),
  TAUNT: Object.freeze({
    keywords: Object.freeze(['fool', 'weak', 'coward', 'laugh', 'mock', 'pathetic']),
    phrases: Object.freeze(['is that all', 'look at you']),
  }),
  QUESTION: Object.freeze({
    keywords: Object.freeze(['who', 'what', 'why', 'how', 'when', 'where']),
    phrases: Object.freeze(['can you', 'will you', 'do you', 'have you']),
  }),
  BANISHMENT: Object.freeze({
    keywords: Object.freeze(['banish', 'begone', 'vanish', 'unmake', 'nullify', 'exile', 'erase']),
    phrases: Object.freeze(['be gone', 'cast out', 'leave this', 'return to']),
  }),
  CURSE: Object.freeze({
    keywords: Object.freeze(['curse', 'hex', 'blight', 'wither', 'rot', 'doom', 'plague']),
    phrases: Object.freeze(['i curse', 'let rot', 'be ruined']),
  }),
  BLESSING: Object.freeze({
    keywords: Object.freeze(['bless', 'ward', 'shield', 'heal', 'mend', 'sanctify', 'crown']),
    phrases: Object.freeze(['i bless', 'be whole', 'be healed']),
  }),
});

const SCHOOL_SPEECH_BIASES = Object.freeze({
  SONIC: Object.freeze({ THREAT: 0.35, COMMAND: 0.3, TAUNT: 0.12 }),
  PSYCHIC: Object.freeze({ QUESTION: 0.4, TAUNT: 0.15, DECLARATION: 0.12 }),
  VOID: Object.freeze({ BANISHMENT: 0.4, CURSE: 0.22, THREAT: 0.1 }),
  ALCHEMY: Object.freeze({ INVOCATION: 0.35, BLESSING: 0.22, DECLARATION: 0.1 }),
  WILL: Object.freeze({ COMMAND: 0.38, DECLARATION: 0.26, THREAT: 0.12 }),
});

const SEVERITY_LADDERS = Object.freeze({
  SONIC: Object.freeze([
    Object.freeze({ label: 'Mute', terms: Object.freeze(['mute', 'muted', 'silenced']) }),
    Object.freeze({ label: 'Whisper', terms: Object.freeze(['whisper', 'whispered', 'hush']) }),
    Object.freeze({ label: 'Shout', terms: Object.freeze(['shout', 'shouted', 'cry']) }),
    Object.freeze({ label: 'Wale', terms: Object.freeze(['wale', 'wail', 'wailing']) }),
    Object.freeze({ label: 'Boom', terms: Object.freeze(['boom', 'booming', 'thunder']) }),
    Object.freeze({ label: 'Supersonic', terms: Object.freeze(['supersonic']) }),
  ]),
  PSYCHIC: Object.freeze([
    Object.freeze({ label: 'Doubt', terms: Object.freeze(['doubt', 'unsure']) }),
    Object.freeze({ label: 'Fracture', terms: Object.freeze(['fracture', 'fractured', 'split']) }),
    Object.freeze({ label: 'Disconnected', terms: Object.freeze(['disconnected', 'disconnect']) }),
    Object.freeze({ label: 'Crisis', terms: Object.freeze(['crisis', 'panic']) }),
    Object.freeze({ label: 'Mindbreak', terms: Object.freeze(['mindbreak', 'mind-break']) }),
  ]),
  VOID: Object.freeze([
    Object.freeze({ label: 'Empty', terms: Object.freeze(['empty']) }),
    Object.freeze({ label: 'Vacuous', terms: Object.freeze(['vacuous']) }),
    Object.freeze({ label: 'Nothingness', terms: Object.freeze(['nothingness', 'nothing']) }),
    Object.freeze({ label: 'Tragedy', terms: Object.freeze(['tragedy', 'tragic']) }),
    Object.freeze({ label: 'Death', terms: Object.freeze(['death', 'dead']) }),
  ]),
  ALCHEMY: Object.freeze([
    Object.freeze({ label: 'Singe', terms: Object.freeze(['singe', 'singed']) }),
    Object.freeze({ label: 'Scorch', terms: Object.freeze(['scorch', 'scorched']) }),
    Object.freeze({ label: 'Burn', terms: Object.freeze(['burn', 'burned', 'burnt']) }),
    Object.freeze({ label: 'Immolate', terms: Object.freeze(['immolate', 'immolated', 'immolation']) }),
  ]),
  WILL: Object.freeze([
    Object.freeze({ label: 'Push', terms: Object.freeze(['push', 'pushed']) }),
    Object.freeze({ label: 'Strike', terms: Object.freeze(['strike', 'struck']) }),
    Object.freeze({ label: 'Cleave', terms: Object.freeze(['cleave', 'cleft']) }),
    Object.freeze({ label: 'Sunder', terms: Object.freeze(['sunder', 'sundered']) }),
  ]),
});

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function normalizeToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

function countPhrase(text, phrase) {
  if (!text || !phrase) return 0;
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text).match(new RegExp(`\\b${escaped}\\b`, 'g'));
  return Array.isArray(match) ? match.length : 0;
}

function zeroScores() {
  return SPEECH_ACT_LABELS.reduce((out, label) => {
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

function computeTokenRarity(token, corpusRanks) {
  const normalized = normalizeToken(token);
  if (!normalized || !(corpusRanks instanceof Map) || corpusRanks.size === 0) {
    return 0;
  }
  const maxRank = Math.max(1, corpusRanks.size - 1);
  if (!corpusRanks.has(normalized)) {
    return normalized.length >= 6 ? 0.96 : 0.78;
  }
  const rank = corpusRanks.get(normalized);
  return clamp01(1 - (rank / maxRank));
}

export function analyzeSpeechActs({
  text = '',
  tokens = [],
  school = '',
} = {}) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedTokens = Array.isArray(tokens)
    ? tokens.map((token) => normalizeToken(token)).filter(Boolean)
    : [];
  const scores = zeroScores();

  for (const [label, rule] of Object.entries(SPEECH_ACT_RULES)) {
    for (const keyword of rule.keywords) {
      const hitCount = normalizedTokens.filter((token) => token === keyword).length;
      if (hitCount > 0) {
        scores[label] += hitCount * 1.1;
      }
    }
    for (const phrase of rule.phrases) {
      const hitCount = countPhrase(normalizedText, phrase);
      if (hitCount > 0) {
        scores[label] += hitCount * 1.4;
      }
    }
  }

  if (normalizedText.includes('?')) {
    scores.QUESTION += 2;
  }
  if (normalizedText.includes('!')) {
    scores.THREAT += 0.8;
    scores.COMMAND += 0.5;
  }
  if (/^\s*(let|hear|witness|behold)\b/.test(normalizedText)) {
    scores.INVOCATION += 1.4;
  }
  if (/^\s*(why|who|what|how|when|where)\b/.test(normalizedText)) {
    scores.QUESTION += 1.2;
  }
  if (/\b(i|we)\s+(declare|vow|name|stand)\b/.test(normalizedText)) {
    scores.DECLARATION += 1.8;
  }
  if (/\b(i|we)\s+will\b/.test(normalizedText)) {
    scores.THREAT += 1.2;
    scores.DECLARATION += 0.8;
  }
  if (/\bplease\b/.test(normalizedText)) {
    scores.PLEA += 1.6;
  }

  const schoolBias = SCHOOL_SPEECH_BIASES[String(school || '').toUpperCase()] || null;
  if (schoolBias) {
    for (const [label, bonus] of Object.entries(schoolBias)) {
      scores[label] += bonus;
    }
  }

  const ranked = topEntries(scores);
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const primary = ranked[0]?.[0] || 'DECLARATION';
  const confidence = total > 0 ? clamp01((ranked[0]?.[1] || 0) / total) : 0;

  return {
    primary,
    confidence: Number(confidence.toFixed(3)),
    topActs: ranked.map(([label, value]) => ({
      act: label,
      weight: total > 0 ? Number((value / total).toFixed(3)) : 0,
    })),
  };
}

export function analyzeSeverityLexicon({
  tokens = [],
  school = '',
  corpusRanks = null,
  rarityScore = 0,
} = {}) {
  const ladder = SEVERITY_LADDERS[String(school || '').toUpperCase()] || [];
  const normalizedTokens = Array.isArray(tokens)
    ? tokens.map((token) => normalizeToken(token)).filter(Boolean)
    : [];
  const matches = [];

  for (let tierIndex = 0; tierIndex < ladder.length; tierIndex += 1) {
    const tier = ladder[tierIndex];
    for (const token of normalizedTokens) {
      if (!tier.terms.includes(token)) continue;
      matches.push({
        token,
        label: tier.label,
        tierIndex,
        rarity: computeTokenRarity(token, corpusRanks),
      });
    }
  }

  if (matches.length === 0) {
    return {
      ladderId: String(school || '').toUpperCase() || null,
      label: null,
      topLexeme: null,
      tierIndex: -1,
      severityScore: 0,
      rarityAmplifier: Number(clamp01(rarityScore).toFixed(3)),
      potency: Number((clamp01(rarityScore) * 0.18).toFixed(3)),
      matches: [],
    };
  }

  matches.sort((left, right) => {
    if (right.tierIndex !== left.tierIndex) return right.tierIndex - left.tierIndex;
    if (right.rarity !== left.rarity) return right.rarity - left.rarity;
    return left.token.localeCompare(right.token);
  });

  const top = matches[0];
  const maxTier = Math.max(1, ladder.length - 1);
  const severityScore = clamp01(top.tierIndex / maxTier);
  const rarityAmplifier = clamp01((top.rarity * 0.65) + (clamp01(rarityScore) * 0.35));
  const potency = clamp01((severityScore * 0.55) + ((severityScore * rarityAmplifier) * 0.45));

  return {
    ladderId: String(school || '').toUpperCase() || null,
    label: top.label,
    topLexeme: top.token,
    tierIndex: top.tierIndex,
    severityScore: Number(severityScore.toFixed(3)),
    rarityAmplifier: Number(rarityAmplifier.toFixed(3)),
    potency: Number(potency.toFixed(3)),
    matches: matches.slice(0, 4).map((match) => ({
      token: match.token,
      label: match.label,
      tierIndex: match.tierIndex,
      rarity: Number(match.rarity.toFixed(3)),
    })),
  };
}
