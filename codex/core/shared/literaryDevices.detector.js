/**
 * Literary Device Detection Engine
 * Algorithmically detects common poetic and literary devices in text.
 */
import { buildHiddenHarkovSummary } from './models/harkov.model.js';

export const LITERARY_DEVICES = {
  ALLITERATION: {
    name: 'Alliteration',
    definition: 'Repetition of initial consonant sounds in neighboring words.',
  },
  ANAPHORA: {
    name: 'Anaphora',
    definition: 'Repetition of a word or phrase at the beginning of successive lines.',
  },
  ENJAMBMENT: {
    name: 'Enjambment',
    definition: 'Continuation of a sentence beyond the end of a line break.',
  },
  REPETITION: {
    name: 'Repetition',
    definition: 'Deliberate reuse of words or phrases for rhythmic or thematic emphasis.',
  },
  INTERNAL_RHYME: {
    name: 'Internal Rhyme',
    definition: 'Rhyming words placed within the same line rather than at line endings.',
  },
  EPISTROPHE: {
    name: 'Epistrophe',
    definition: 'Repetition of a word or phrase at the end of successive lines.',
  },
  SIMILE: {
    name: 'Simile',
    definition: 'A comparison using "like" or "as".',
  },
  METAPHOR: {
    name: 'Metaphor',
    definition: 'A direct comparison between two unrelated things without using "like" or "as".',
  },
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'in', 'on', 'at', 'to', 'for', 'of', 'by', 'from', 'up',
  'with', 'as', 'into', 'but', 'or', 'and', 'so', 'if',
  'not', 'no', 'nor', 'that', 'this', 'than', 'just', 'very', 'too', 'also',
]);

function detectAlliteration(lines) {
  let count = 0;
  const examples = [];

  for (const line of lines) {
    const words = line.match(/\b[A-Za-z]+/g) || [];
    let streak = 1;
    for (let i = 1; i < words.length; i += 1) {
      const c1 = words[i - 1][0].toLowerCase();
      const c2 = words[i][0].toLowerCase();
      if (c1 === c2 && !'aeiou'.includes(c1)) {
        streak += 1;
        if (streak === 2) {
          count += 1;
          if (examples.length < 2) {
            const start = i - 1;
            let end = i;
            while (end + 1 < words.length && words[end + 1][0].toLowerCase() === c1) {
              end += 1;
            }
            examples.push(words.slice(start, end + 1).join(' '));
          }
        }
      } else {
        streak = 1;
      }
    }
  }

  return { count, examples };
}

function detectAnaphora(lines) {
  const beginnings = new Map();

  for (const line of lines) {
    const firstWord = line.trim().match(/^[A-Za-z]+/);
    if (!firstWord) continue;
    const word = firstWord[0].toLowerCase();
    if (!STOP_WORDS.has(word) || word === 'i') {
      beginnings.set(word, (beginnings.get(word) || 0) + 1);
    }
  }

  const repeated = Array.from(beginnings.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const count = repeated.reduce((sum, [, c]) => sum + c - 1, 0);
  const examples = repeated.slice(0, 2).map(([word, c]) => `"${word}" starts ${c} lines`);

  return { count, examples };
}

function detectEpistrophe(lines) {
  const endings = new Map();

  for (const line of lines) {
    const lastWord = line.trim().match(/[A-Za-z]+$/);
    if (!lastWord) continue;
    const word = lastWord[0].toLowerCase();
    if (!STOP_WORDS.has(word)) {
      endings.set(word, (endings.get(word) || 0) + 1);
    }
  }

  const repeated = Array.from(endings.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const count = repeated.reduce((sum, [, c]) => sum + c - 1, 0);
  const examples = repeated.slice(0, 2).map(([word, c]) => `"${word}" ends ${c} lines`);

  return { count, examples };
}

function detectEnjambment(lines) {
  let count = 0;
  const examples = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed && !/[.!?,;:-]$/.test(trimmed)) {
      count += 1;
      if (examples.length < 2) {
        const preview = trimmed.length > 30 ? `...${trimmed.slice(-30)}` : trimmed;
        examples.push(`L${i + 1}: "${preview}" ->`);
      }
    }
  }

  return { count, examples };
}

function detectRepetition(text) {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const frequency = new Map();

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  const repeated = Array.from(frequency.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  const count = repeated.reduce((sum, [, c]) => sum + c - 2, 0);
  const examples = repeated.slice(0, 2).map(([word, c]) => `"${word}" (${c}x)`);

  return { count, examples };
}

function detectSimile(text) {
  const simileRegex = /\b(as\s+\w+\s+as\s+[\w\s]+|[\w']+\s+like\s+(a\s+|the\s+)?[\w\s]+)\b/gi;
  const matches = text.match(simileRegex) || [];

  return {
    count: matches.length,
    examples: matches.slice(0, 2).map((m) => `"${m.trim()}"`),
  };
}

function detectMetaphor(text) {
  const metaphorRegex = /\b(I\s+am|life\s+is|love\s+is|hope\s+is|death\s+is|truth\s+is|[\w']+\s+(is|are|was|were)\s+(a\s+|the\s+)?(dream|fire|ocean|storm|mountain|shadow|mirror|thief|ghost|prison|garden|beast|star|labyrinth))\b/gi;
  const matches = text.match(metaphorRegex) || [];

  return {
    count: matches.length,
    examples: matches.slice(0, 2).map((m) => `"${m.trim()}"`),
  };
}

export function analyzeLiteraryDevices(text) {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];

  const results = [
    { id: 'ALLITERATION', ...detectAlliteration(lines) },
    { id: 'ANAPHORA', ...detectAnaphora(lines) },
    { id: 'EPISTROPHE', ...detectEpistrophe(lines) },
    { id: 'ENJAMBMENT', ...detectEnjambment(lines) },
    { id: 'REPETITION', ...detectRepetition(text) },
    { id: 'SIMILE', ...detectSimile(text) },
    { id: 'METAPHOR', ...detectMetaphor(text) },
  ].filter((row) => row.count > 0);

  results.sort((a, b) => b.count - a.count);

  return results.slice(0, 3).map((row) => ({
    id: row.id,
    name: LITERARY_DEVICES[row.id].name,
    definition: LITERARY_DEVICES[row.id].definition,
    count: row.count,
    examples: row.examples,
  }));
}

const EMOTION_LABELS = Object.freeze([
  'Joy',
  'Melancholy',
  'Rage',
  'Defiance',
  'Wonder',
  'Dread',
]);

const NEGATORS = new Set([
  'not', 'no', 'never', 'none', 'nothing', 'without',
  'hardly', 'barely', 'cannot', "can't", "won't", "don't", "didn't", "isn't", "wasn't",
]);

const INTENSIFIERS = new Set([
  'very', 'so', 'too', 'truly', 'utterly', 'deeply', 'purely', 'fully',
  'absolutely', 'totally', 'really', 'always', 'ever',
]);

const DEINTENSIFIERS = new Set([
  'slightly', 'somewhat', 'almost', 'nearly', 'kinda', 'kind', 'partly', 'faintly',
]);

const FIRST_PERSON_PRONOUNS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'we', 'us', 'our', 'ours', 'ourselves',
]);

const PHRASE_BOOST = 2.2;
const GUTENBERG_PRIOR_MULTIPLIER = 0.65;
const EPSILON = 1e-9;

const EMOTION_LEXICON = Object.freeze({
  Joy: Object.freeze({
    words: Object.freeze({
      joy: 1.4, joyful: 1.4, happy: 1.4, happiness: 1.3, delight: 1.2, love: 1.1,
      smile: 1.1, smiles: 1.1, laugh: 1.2, laughter: 1.2, bright: 1.0, light: 0.9,
      sunlight: 1.2, dawn: 0.8, bloom: 0.9, alive: 0.9, warm: 0.8,
      glory: 1.1, grace: 0.8, paradise: 1.2, bliss: 1.3, tender: 0.8, sweet: 0.8,
      healing: 1.0, gentle: 0.8, peace: 1.0, hopeful: 1.1, hope: 1.0,
    }),
    stems: Object.freeze({
      celebrat: 1.0, glori: 1.0, lov: 0.9, smile: 1.0, laugh: 1.1, joy: 1.2, bliss: 1.2,
    }),
    phrases: Object.freeze([
      'heart of gold',
      'bright as',
      'light of day',
      'sing with joy',
      'open arms',
      'warm light',
    ]),
  }),
  Melancholy: Object.freeze({
    words: Object.freeze({
      sad: 1.3, sorrow: 1.4, grief: 1.4, tears: 1.3, cry: 1.2, crying: 1.2, loss: 1.2,
      dark: 1.0, shadow: 1.1, shadows: 1.1, pain: 1.1, alone: 1.2, lonely: 1.3,
      empty: 1.2, cold: 0.9, rain: 0.9, broken: 1.2, faded: 1.1, gone: 1.0,
      hollow: 1.2, ache: 1.1, aching: 1.2, regret: 1.1, weep: 1.2, dusk: 0.8,
      silence: 0.8, quiet: 0.7, bruise: 1.0, mourn: 1.3, despair: 1.4,
    }),
    stems: Object.freeze({
      sorrow: 1.2, griev: 1.3, loneli: 1.2, empti: 1.1, broken: 1.1, regret: 1.1, mourn: 1.2,
    }),
    phrases: Object.freeze([
      'left alone',
      'cold and',
      'fading away',
      'empty room',
      'tears in',
      'gone forever',
    ]),
  }),
  Rage: Object.freeze({
    words: Object.freeze({
      anger: 1.4, rage: 1.5, fury: 1.5, hate: 1.3, wrath: 1.4, fight: 1.1,
      battle: 1.1, war: 1.2, burn: 1.1, fire: 1.0, blood: 1.0, strike: 1.1,
      destroy: 1.3, kill: 1.3, venom: 1.1, scream: 1.0, violent: 1.2,
      brutal: 1.2, savage: 1.2, crush: 1.2, break: 1.0, explode: 1.2, wreck: 1.2,
      storm: 0.8, thunder: 0.8, blade: 0.7, warpath: 1.3,
    }),
    stems: Object.freeze({
      furious: 1.3, destr: 1.2, violen: 1.1, wrath: 1.2, veng: 1.2, burn: 1.0,
    }),
    phrases: Object.freeze([
      'set it on fire',
      'tear it down',
      'blood on',
      'burn it',
      'ready to fight',
      'full of rage',
    ]),
  }),
  Defiance: Object.freeze({
    words: Object.freeze({
      never: 1.2, rise: 1.3, rising: 1.2, stand: 1.2, resist: 1.3, refuse: 1.2,
      defy: 1.4, break: 1.0, free: 1.1, fearless: 1.3, power: 1.1, strength: 1.1,
      conquer: 1.3, endure: 1.2, survive: 1.2, rebel: 1.3, rebelled: 1.2,
      stubborn: 1.0, unstoppable: 1.4, forge: 0.9, vow: 1.0, oath: 1.0,
      forward: 0.8, against: 0.7, persist: 1.2,
    }),
    stems: Object.freeze({
      resist: 1.2, defi: 1.3, conquer: 1.2, surviv: 1.1, rebel: 1.2, persist: 1.2,
    }),
    phrases: Object.freeze([
      'i will not',
      'never bow',
      'rise again',
      'stand my ground',
      'won\'t break',
      'refuse to',
    ]),
  }),
  Wonder: Object.freeze({
    words: Object.freeze({
      wonder: 1.4, awe: 1.4, mystery: 1.2, magic: 1.2, dream: 1.0, beauty: 1.1,
      stars: 1.1, star: 1.1, infinite: 1.2, cosmos: 1.2, transcend: 1.2,
      ethereal: 1.3, divine: 1.2, sacred: 1.2, celestial: 1.2, mirror: 0.8,
      moon: 0.8, sky: 0.8, horizon: 0.9, luminous: 1.1, myth: 1.0, oracle: 1.1,
      arcane: 1.1, mystic: 1.1, unknown: 1.0, shimmer: 0.9, halo: 0.9,
    }),
    stems: Object.freeze({
      myst: 1.1, magic: 1.1, transcend: 1.2, celestial: 1.1, divin: 1.1, wonder: 1.2,
    }),
    phrases: Object.freeze([
      'beyond the',
      'into the stars',
      'infinite sky',
      'divine light',
      'mystery of',
      'cosmic tide',
    ]),
  }),
  Dread: Object.freeze({
    words: Object.freeze({
      fear: 1.4, afraid: 1.3, terror: 1.4, dread: 1.4, anxious: 1.2, anxiety: 1.2,
      horror: 1.4, doom: 1.3, nightmare: 1.3, haunt: 1.2, haunted: 1.2,
      grave: 1.1, death: 1.2, void: 1.2, tremble: 1.1, panic: 1.2, abyss: 1.1,
      curse: 1.1, cursed: 1.1, plague: 1.1, decay: 1.0, rot: 1.0, noose: 1.1,
      shadowed: 1.0, coffin: 1.1, vanish: 0.8, ruin: 1.1,
    }),
    stems: Object.freeze({
      fear: 1.3, terr: 1.3, horr: 1.3, anxi: 1.1, haunt: 1.1, doom: 1.2, dread: 1.2,
    }),
    phrases: Object.freeze([
      'edge of the grave',
      'swallowed by',
      'fear of',
      'night without',
      'haunted by',
      'face the void',
    ]),
  }),
});

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEmotionToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, '');
}

function stemEmotionToken(token) {
  const value = normalizeEmotionToken(token);
  if (value.length <= 3) return value;
  if (value.endsWith('iness') && value.length > 6) return `${value.slice(0, -5)}y`;
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith('ing') && value.length > 5) return value.slice(0, -3);
  if (value.endsWith('ed') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('es') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('ly') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

function tokenizeEmotionWords(text) {
  return String(text || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) || [];
}

function sortSyntaxTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  return tokens
    .filter((token) => token && typeof token === 'object')
    .slice()
    .sort((a, b) => {
      const lineDiff = safeNumber(a?.lineNumber) - safeNumber(b?.lineNumber);
      if (lineDiff !== 0) return lineDiff;
      const wordDiff = safeNumber(a?.wordIndex) - safeNumber(b?.wordIndex);
      if (wordDiff !== 0) return wordDiff;
      return safeNumber(a?.charStart) - safeNumber(b?.charStart);
    });
}

function createZeroScoreMap() {
  return EMOTION_LABELS.reduce((out, label) => {
    out[label] = 0;
    return out;
  }, {});
}

function countPhraseMatches(textLower, phrase) {
  if (!phrase) return 0;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'g');
  const matches = textLower.match(regex);
  return Array.isArray(matches) ? matches.length : 0;
}

function resolveGutenbergWeight(gutenbergPriors, emotion, token, stem) {
  const directMap = gutenbergPriors?.emotions?.[emotion] || gutenbergPriors?.[emotion] || null;
  if (!directMap || typeof directMap !== 'object') return 0;

  const tokenWeight = safeNumber(directMap[token], 0);
  if (tokenWeight > 0) return tokenWeight;
  return safeNumber(directMap[stem], 0);
}

function buildHarkovSignals(options = {}) {
  const sortedTokens = sortSyntaxTokens(options?.syntaxLayer?.tokens);
  if (sortedTokens.length === 0) {
    return {
      enabled: false,
      tokenAmplifiers: [],
      anchorDensity: 0,
      functionGateDensity: 0,
      transitionTension: 0,
    };
  }

  let summary = options?.hhmSummary || null;
  let tokenStateByIdentity = options?.hhmTokenStateByIdentity instanceof Map
    ? options.hhmTokenStateByIdentity
    : null;

  if (!summary || !tokenStateByIdentity) {
    const built = buildHiddenHarkovSummary(sortedTokens);
    summary = built.summary;
    tokenStateByIdentity = built.tokenStateByIdentity;
  }

  const tokenAmplifiers = sortedTokens.map((token) => {
    const key = `${safeNumber(token?.lineNumber)}:${safeNumber(token?.wordIndex)}:${safeNumber(token?.charStart)}`;
    const hhmState = tokenStateByIdentity?.get(key) || null;
    let amplifier = 1;

    if (hhmState) {
      amplifier += (safeNumber(hhmState.tokenWeight, 0.5) - 0.5) * 0.45;
      if (hhmState.hiddenState === 'terminal_anchor') amplifier += 0.18;
      else if (hhmState.hiddenState === 'stress_anchor') amplifier += 0.12;
      else if (hhmState.hiddenState === 'function_gate') amplifier -= 0.12;
    }

    if (token.role === 'content') amplifier += 0.06;
    if (token.lineRole === 'line_end') amplifier += 0.06;
    if (token.stressRole === 'primary') amplifier += 0.05;
    if (token.rhymePolicy === 'suppress') amplifier -= 0.08;

    return {
      amplifier: Math.max(0.45, Math.min(1.65, amplifier)),
    };
  });

  const stateCounts = { terminal_anchor: 0, stress_anchor: 0, function_gate: 0 };
  if (summary?.enabled && Array.isArray(summary.stanzas)) {
    for (const stanza of summary.stanzas) {
      const counts = stanza?.hiddenStateCounts || {};
      stateCounts.terminal_anchor += safeNumber(counts.terminal_anchor, 0);
      stateCounts.stress_anchor += safeNumber(counts.stress_anchor, 0);
      stateCounts.function_gate += safeNumber(counts.function_gate, 0);
    }
  }

  let transitionTension = 0;
  if (summary?.enabled && Array.isArray(summary.stanzas) && summary.stanzaCount > 0) {
    let pressure = 0;
    for (const stanza of summary.stanzas) {
      const transitions = Array.isArray(stanza?.transitions) ? stanza.transitions : [];
      for (const transition of transitions) {
        if (transition.from === 'stress_anchor' && transition.to === 'terminal_anchor') {
          pressure += safeNumber(transition.probability, 0) * 1.2;
        }
        if (
          (transition.to === 'stress_anchor' || transition.to === 'terminal_anchor') &&
          transition.from !== 'function_gate'
        ) {
          pressure += safeNumber(transition.probability, 0) * 0.35;
        }
      }
    }
    transitionTension = clamp01(pressure / summary.stanzaCount);
  }

  const tokenCount = Math.max(1, safeNumber(summary?.tokenCount, sortedTokens.length));
  const anchorDensity = clamp01((stateCounts.terminal_anchor + stateCounts.stress_anchor) / tokenCount);
  const functionGateDensity = clamp01(stateCounts.function_gate / tokenCount);

  return {
    enabled: true,
    tokenAmplifiers,
    anchorDensity,
    functionGateDensity,
    transitionTension,
  };
}

function resolveContextScale(tokens, tokenIndex) {
  const prev1 = tokens[tokenIndex - 1] || '';
  const prev2 = tokens[tokenIndex - 2] || '';
  const next1 = tokens[tokenIndex + 1] || '';

  const hasNegator = NEGATORS.has(prev1) || NEGATORS.has(prev2);
  const hasIntensifier = INTENSIFIERS.has(prev1) || INTENSIFIERS.has(prev2) || INTENSIFIERS.has(next1);
  const hasDeintensifier = DEINTENSIFIERS.has(prev1) || DEINTENSIFIERS.has(prev2) || DEINTENSIFIERS.has(next1);

  let scale = 1;
  if (hasIntensifier) scale *= 1.22;
  if (hasDeintensifier) scale *= 0.82;
  if (hasNegator) scale *= -0.72;

  return {
    scale,
    hasNegator,
    hasIntensifier,
  };
}

function resolveDominantEmotion(scores) {
  const normalized = EMOTION_LABELS
    .map((label) => [label, Math.max(0, safeNumber(scores?.[label], 0))])
    .sort((a, b) => b[1] - a[1]);

  const total = normalized.reduce((sum, [, value]) => sum + value, 0);
  const top = normalized[0] || ['Neutral', 0];
  const runnerUp = normalized[1] || ['Neutral', 0];
  const margin = top[1] - runnerUp[1];
  const confidence = total > EPSILON ? top[1] / total : 0;

  if (top[1] < 1.1) {
    return { emotion: 'Neutral', confidence: 0, margin, total, sorted: normalized };
  }

  if (confidence < 0.34 && margin < 0.6) {
    return { emotion: 'Neutral', confidence, margin, total, sorted: normalized };
  }

  return {
    emotion: top[0],
    confidence: clamp01(confidence),
    margin,
    total,
    sorted: normalized,
  };
}

function scoreEmotionSignals(text, options = {}) {
  const lower = String(text || '').toLowerCase();
  const tokens = tokenizeEmotionWords(lower);
  const scores = createZeroScoreMap();

  const phraseHits = {};
  const tokenHits = {};
  const negatedHits = {};
  const intensifierHits = {};
  const firstPersonCount = tokens.reduce((sum, token) => sum + (FIRST_PERSON_PRONOUNS.has(token) ? 1 : 0), 0);

  EMOTION_LABELS.forEach((label) => {
    tokenHits[label] = 0;
    phraseHits[label] = 0;
    negatedHits[label] = 0;
    intensifierHits[label] = 0;
  });

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = normalizeEmotionToken(tokens[tokenIndex]);
    if (!token) continue;
    const stem = stemEmotionToken(token);
    const context = resolveContextScale(tokens, tokenIndex);

    for (const emotion of EMOTION_LABELS) {
      const model = EMOTION_LEXICON[emotion];
      const lexiconWeight = safeNumber(model?.words?.[token], 0) || safeNumber(model?.stems?.[stem], 0);
      const gutenbergWeight = resolveGutenbergWeight(options?.gutenbergPriors, emotion, token, stem);
      const baseWeight = lexiconWeight + (gutenbergWeight * GUTENBERG_PRIOR_MULTIPLIER);
      if (baseWeight <= 0) continue;

      const tokenAmplifier = safeNumber(options?.tokenAmplifiers?.[tokenIndex]?.amplifier, 1);
      const delta = baseWeight * context.scale * tokenAmplifier;
      scores[emotion] += delta;
      tokenHits[emotion] += 1;
      if (context.hasNegator) negatedHits[emotion] += 1;
      if (context.hasIntensifier) intensifierHits[emotion] += 1;
    }
  }

  for (const emotion of EMOTION_LABELS) {
    const phrases = EMOTION_LEXICON[emotion]?.phrases || [];
    for (const phrase of phrases) {
      const count = countPhraseMatches(lower, phrase);
      if (count <= 0) continue;
      phraseHits[emotion] += count;
      scores[emotion] += count * PHRASE_BOOST;
    }
  }

  const exclamationCount = (lower.match(/!/g) || []).length;
  const questionCount = (lower.match(/\?/g) || []).length;
  const ellipsisCount = (lower.match(/\.{3,}/g) || []).length;

  if (exclamationCount > 0) {
    scores.Defiance += exclamationCount * 0.3;
    scores.Rage += exclamationCount * 0.22;
  }
  if (questionCount > 0) {
    scores.Wonder += questionCount * 0.24;
    scores.Dread += questionCount * 0.12;
  }
  if (ellipsisCount > 0) {
    scores.Melancholy += ellipsisCount * 0.25;
  }

  if (firstPersonCount > 0) {
    const firstPersonRatio = firstPersonCount / Math.max(1, tokens.length);
    scores.Melancholy += firstPersonRatio * 0.9;
    scores.Defiance += firstPersonRatio * 0.3;
  }

  if (options?.harkovSignals?.enabled) {
    scores.Defiance += options.harkovSignals.anchorDensity * 0.85;
    scores.Rage += options.harkovSignals.transitionTension * 0.45;
    scores.Wonder += options.harkovSignals.transitionTension * 0.28;
    scores.Melancholy += options.harkovSignals.functionGateDensity * 0.38;
    if (options.harkovSignals.functionGateDensity > 0.2) {
      scores.Dread += 0.2;
    }
  }

  return {
    scores,
    tokenHits,
    phraseHits,
    negatedHits,
    intensifierHits,
    exclamationCount,
    questionCount,
    ellipsisCount,
  };
}

function buildLineEmotionArc(text, options = {}) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      lineCount: 0,
      nonNeutralLineCount: 0,
      transitionCount: 0,
      transitionRate: 0,
      dominantLineEmotion: 'Neutral',
      averageConfidence: 0,
      lineSummaries: [],
    };
  }

  const lineSummaries = lines.map((line) => {
    const lineSignals = scoreEmotionSignals(line, {
      gutenbergPriors: options?.gutenbergPriors,
    });
    const lineResolved = resolveDominantEmotion(lineSignals.scores);
    return {
      emotion: lineResolved.emotion,
      confidence: lineResolved.confidence,
    };
  });

  const nonNeutral = lineSummaries.filter((entry) => entry.emotion !== 'Neutral');
  let transitionCount = 0;
  for (let i = 1; i < nonNeutral.length; i += 1) {
    if (nonNeutral[i - 1].emotion !== nonNeutral[i].emotion) transitionCount += 1;
  }

  const emotionCounts = {};
  for (const row of nonNeutral) {
    emotionCounts[row.emotion] = (emotionCounts[row.emotion] || 0) + 1;
  }
  const dominantLineEmotion = Object.entries(emotionCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Neutral';
  const averageConfidence = nonNeutral.length > 0
    ? nonNeutral.reduce((sum, row) => sum + safeNumber(row.confidence, 0), 0) / nonNeutral.length
    : 0;

  return {
    lineCount: lines.length,
    nonNeutralLineCount: nonNeutral.length,
    transitionCount,
    transitionRate: nonNeutral.length > 1 ? transitionCount / (nonNeutral.length - 1) : 0,
    dominantLineEmotion,
    averageConfidence,
    lineSummaries,
  };
}

export function detectEmotionDetailed(text, options = {}) {
  if (!text || !String(text).trim()) {
    return {
      emotion: 'Neutral',
      confidence: 0,
      scores: createZeroScoreMap(),
      diagnostics: {
        tokenHits: createZeroScoreMap(),
        phraseHits: createZeroScoreMap(),
        negatedHits: createZeroScoreMap(),
        intensifierHits: createZeroScoreMap(),
        punctuation: { exclamationCount: 0, questionCount: 0, ellipsisCount: 0 },
        lineArc: {
          lineCount: 0,
          nonNeutralLineCount: 0,
          transitionCount: 0,
          transitionRate: 0,
          dominantLineEmotion: 'Neutral',
          averageConfidence: 0,
          lineSummaries: [],
        },
        harkov: {
          enabled: false,
          anchorDensity: 0,
          functionGateDensity: 0,
          transitionTension: 0,
        },
      },
    };
  }

  const harkovSignals = buildHarkovSignals(options);
  const signals = scoreEmotionSignals(text, {
    tokenAmplifiers: harkovSignals.tokenAmplifiers,
    gutenbergPriors: options?.gutenbergPriors,
    harkovSignals,
  });

  const lineArc = buildLineEmotionArc(text, {
    gutenbergPriors: options?.gutenbergPriors,
  });

  if (lineArc.nonNeutralLineCount > 0) {
    signals.scores.Defiance += lineArc.transitionRate * 0.18;
    signals.scores.Wonder += lineArc.transitionRate * 0.12;
    signals.scores.Melancholy += (1 - lineArc.transitionRate) * 0.05;
  }

  const resolved = resolveDominantEmotion(signals.scores);

  return {
    emotion: resolved.emotion,
    confidence: resolved.confidence,
    scores: EMOTION_LABELS.reduce((out, label) => {
      out[label] = Math.max(0, safeNumber(signals.scores[label], 0));
      return out;
    }, {}),
    diagnostics: {
      tokenHits: signals.tokenHits,
      phraseHits: signals.phraseHits,
      negatedHits: signals.negatedHits,
      intensifierHits: signals.intensifierHits,
      punctuation: {
        exclamationCount: signals.exclamationCount,
        questionCount: signals.questionCount,
        ellipsisCount: signals.ellipsisCount,
      },
      lineArc,
      harkov: {
        enabled: harkovSignals.enabled,
        anchorDensity: harkovSignals.anchorDensity,
        functionGateDensity: harkovSignals.functionGateDensity,
        transitionTension: harkovSignals.transitionTension,
      },
    },
  };
}

export function detectEmotion(text, options = {}) {
  return detectEmotionDetailed(text, options).emotion;
}
