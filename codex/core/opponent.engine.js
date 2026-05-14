import {
  COMBAT_ARENA_SCHOOL,
  COMBAT_SCHOOLS,
  clamp01,
  getCombatRarityByScore,
  getCounterSchool,
  getIntelligenceSignal,
  getOpponentMemoryWindow,
  getSchoolEffectiveness,
} from './combat.balance.js';
import { buildCombatProfile, tokenizeCombatWords } from './combat.profile.js';
import { createSpeakerVoiceProfile, analyzeSpeaking } from './speaking/index.js';
import { analyzeText } from './analysis.pipeline.js';

const SCHOOL_DISPLAY_NAMES = Object.freeze({
  SONIC: 'Sonic Thaumaturgy',
  PSYCHIC: 'Psychic Schism',
  VOID: 'The Void',
  ALCHEMY: 'Verbal Alchemy',
  WILL: 'Willpower Surge',
});

const OPPONENT_BANK = Object.freeze({
  SONIC: Object.freeze({
    names: Object.freeze(['Resonant Shade', 'Echo Revenant', 'The Phonocrat']),
    subtitles: Object.freeze(['Harmonic Predator', 'Breaker of Choruses', 'The Resonant Knife']),
    flavor: Object.freeze([
      'harmonics coil into a blade of living pressure',
      'your rhythm snaps inside a chamber of feedback',
      'resonance turns the chamber itself against you',
      'the room answers me in a wall of sharpened vowels',
    ]),
  }),
  PSYCHIC: Object.freeze({
    names: Object.freeze(['Schism Oracle', 'Mnemonic Hound', 'The Fractured Mind']),
    subtitles: Object.freeze(['Reader of Fault Lines', 'Arbiter of Thought', 'The Split Witness']),
    flavor: Object.freeze([
      'the seam between meanings opens under your feet',
      'your intent divides before the sentence can finish',
      'my thought enters the line and breaks its spine',
      'the counter-idea blooms before your syntax lands',
    ]),
  }),
  VOID: Object.freeze({
    names: Object.freeze(['The Cryptonym', 'Null Scribe', 'Hollow Tongue']),
    subtitles: Object.freeze(['Consumer of Syntax', 'Void Linguist', 'The Wordless One']),
    flavor: Object.freeze([
      'the null between syllables widens and drinks your force',
      'silence folds inward and leaves no surface to strike',
      'the anti-word hollows the meaning out of your breath',
      'void grammar strips the lattice from the line',
    ]),
  }),
  ALCHEMY: Object.freeze({
    names: Object.freeze(['Mercurial Apostle', 'Verbalith', 'The Brass Grammarian']),
    subtitles: Object.freeze(['Author of Revisions', 'Transmuter of Terrain', 'The Tongue of Metals']),
    flavor: Object.freeze([
      'the ground rewrites itself beneath your meter',
      'mercurial grammar turns impact into consequence',
      'the sentence changes state and the field obeys',
      'I distill your momentum into colder matter',
    ]),
  }),
  WILL: Object.freeze({
    names: Object.freeze(['Iron Liturgist', 'Crown of Intent', 'The Volitional Saint']),
    subtitles: Object.freeze(['Bearer of Imperative Fire', 'The Unbent Word', 'Judge of Resolve']),
    flavor: Object.freeze([
      'my will enters the line and reality consents',
      'your language buckles where resolve becomes law',
      'force gathers in the grammar like a drawn spear',
      'the decree lands before the echo can protest',
    ]),
  }),
});

/**
 * Procedural Opponent Doctrines.
 * Doctrines define the specific "combat personality" and move kits.
 * @see MECHANIC SPEC - Procedural Opponent Doctrines and Seeded Unique Move Kits.MD
 */
export const DOCTRINES = Object.freeze({
  NULL_SCRIBE: Object.freeze({
    id: 'NULL_SCRIBE',
    school: 'VOID',
    description: 'Specializes in syntactic erasure and cadence disruption.',
    traits: Object.freeze(['ERASURE', 'SILENCE']),
    signatureMoves: Object.freeze([
      {
        name: 'Void Pulse',
        type: 'CADENCE_PUNISH',
        weight: 0.4,
        flavor: 'The silence between your words begins to scream.',
        damageMult: 1.12,
        telegraph: 'A void pulse is gathering to fracture your cadence.',
      },
      {
        name: 'Syntactic Erasure',
        type: 'TOKEN_THEFT',
        weight: 0.3,
        flavor: 'The word simply ceases to have ever existed.',
        damageMult: 1.06,
        telegraph: 'The Null Scribe is shaping a theft of your live lexicon.',
      },
      {
        name: 'Echo Null',
        type: 'TELEGRAPH',
        weight: 0.3,
        flavor: 'I see the shape of your next line, and I hollow it out.',
        damageMult: 0.98,
        telegraph: 'A hollow omen hangs over the next exchange.',
      }
    ]),
    scaling: Object.freeze({
      damage: 1.15,
      memoryWindow: 1.5, // Remembers more to better counter
    }),
  }),
});

const SIGNATURE_STATUS_EFFECTS = Object.freeze({
  CADENCE_PUNISH: Object.freeze({
    id: 'CADENCE_FRACTURE',
    chainId: 'cadence_fracture',
    label: 'Cadence Fracture',
    disposition: 'DEBUFF',
    tier: 2,
    turns: 2,
    turnsRemaining: 2,
    magnitude: 0.2,
    sourceBonus: 'The opponent disrupted your beat alignment.',
  }),
  TOKEN_THEFT: Object.freeze({
    id: 'LEXICAL_DRAIN',
    chainId: 'lexical_drain',
    label: 'Lexical Drain',
    disposition: 'DEBUFF',
    tier: 2,
    turns: 2,
    turnsRemaining: 2,
    magnitude: 0.16,
    sourceBonus: 'The opponent stripped force from your active vocabulary.',
  }),
  TELEGRAPH: Object.freeze({
    id: 'OMEN_MARK',
    chainId: 'omen_mark',
    label: 'Omen Mark',
    disposition: 'DEBUFF',
    tier: 1,
    turns: 1,
    turnsRemaining: 1,
    magnitude: 0.12,
    sourceBonus: 'The opponent marked the next exchange with a telegraphed omen.',
  }),
});

const COUNTER_TEMPLATES = Object.freeze([
  (token) => `I turn ${token} back through your own line`,
  (token) => `your ${token} fractures before it can settle`,
  (token) => `${token} becomes the hinge of your undoing`,
  (token) => `I answer ${token} with a harder grammar`,
  (token) => `the name ${token} collapses under counter-pressure`,
]);

const OPPONENT_VOICE_STYLE = Object.freeze({
  SONIC: Object.freeze({
    openers: Object.freeze(['Hear the chamber answer', 'Listen closely', 'Hush now']),
    punctuation: '!',
  }),
  PSYCHIC: Object.freeze({
    openers: Object.freeze(['Do you feel it', 'Tell me this', 'Consider the fracture']),
    punctuation: '?',
  }),
  VOID: Object.freeze({
    openers: Object.freeze(['Be gone', 'Witness the hollow', 'Nothing remains']),
    punctuation: '.',
  }),
  ALCHEMY: Object.freeze({
    openers: Object.freeze(['By transmutation', 'Observe the change', 'I distill the line']),
    punctuation: ';',
  }),
  WILL: Object.freeze({
    openers: Object.freeze(['Stand and receive it', 'Mark this decree', 'By force of will']),
    punctuation: '.',
  }),
});

function stableHash(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed) {
  let state = (Math.abs(Number(seed) || 1) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function pickOne(random, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(random() * items.length)];
}

function shuffle(random, items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function tokenizeHistoryLines(history) {
  if (!Array.isArray(history)) return [];

  return history
    .flatMap((entry) => {
      if (!entry) return [];
      if (Array.isArray(entry.lines) && entry.lines.length > 0) {
        return entry.lines;
      }
      if (typeof entry.text === 'string') {
        return entry.text.split(/\n+/g);
      }
      return [];
    })
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

function collectMemoryLines(history, opponent) {
  const lines = tokenizeHistoryLines(history);
  let memoryWindow = getOpponentMemoryWindow(opponent.int);
  
  // Doctrine scaling
  if (opponent.doctrine?.scaling?.memoryWindow) {
    memoryWindow = Math.round(memoryWindow * opponent.doctrine.scaling.memoryWindow);
  }

  if (!Number.isFinite(memoryWindow)) {
    return lines;
  }
  return memoryWindow <= 1 ? lines.slice(-1) : lines.slice(-memoryWindow);
}

function collectFocusTokens(memoryLines, intelligence, random) {
  const weighted = [];

  for (const line of memoryLines) {
    const tokens = tokenizeCombatWords(line)
      .filter((token) => token.length >= 4)
      .map((token) => ({
        token,
        weight: token.length + (/[xzvqk]/i.test(token) ? 2 : 0),
      }));
    weighted.push(...tokens);
  }

  if (weighted.length === 0) {
    return [];
  }

  weighted.sort((left, right) => {
    if (right.weight !== left.weight) return right.weight - left.weight;
    return left.token.localeCompare(right.token);
  });

  const maxTokens = intelligence >= 12 ? 4 : intelligence >= 6 ? 3 : 2;
  const selected = [];
  const seen = new Set();

  const rankedPool = intelligence >= 6
    ? weighted
    : shuffle(random, weighted);

  for (const entry of rankedPool) {
    if (selected.length >= maxTokens) break;
    if (seen.has(entry.token)) continue;
    seen.add(entry.token);
    selected.push(entry.token);
  }

  return selected;
}

function buildCounterFragments(random, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }

  return tokens.map((token) => {
    const template = pickOne(random, COUNTER_TEMPLATES);
    return typeof template === 'function' ? template(token) : String(token);
  });
}

function getPreferredRangeBand(signatureMove) {
  switch (signatureMove?.type) {
    case 'TOKEN_THEFT':
      return Object.freeze({ min: 1, max: 2 });
    case 'TELEGRAPH':
      return Object.freeze({ min: 3, max: 4 });
    case 'CADENCE_PUNISH':
    default:
      return Object.freeze({ min: 2, max: 3 });
  }
}

function createDoctrineStatusEffect(signatureMove, school) {
  if (!signatureMove?.type || !SIGNATURE_STATUS_EFFECTS[signatureMove.type]) {
    return null;
  }

  return Object.freeze({
    ...SIGNATURE_STATUS_EFFECTS[signatureMove.type],
    school,
  });
}

function buildTelegraph({
  signatureMove,
  attackSchool,
  focusTokens,
  commentary,
  memoryLinesUsed,
}) {
  const preferredRange = getPreferredRangeBand(signatureMove);
  const counterTokens = Array.isArray(focusTokens) ? focusTokens.slice(0, 3) : [];
  const label = signatureMove?.name || `${attackSchool} Counter-Verse`;
  const summary = signatureMove?.telegraph
    || commentary
    || `${attackSchool} counter-pressure is building.`;

  return Object.freeze({
    label,
    summary,
    preferredRange,
    memoryLinesUsed,
    counterTokens,
  });
}

function getAttackSchool(opponent, playerSchool, intelligence) {
  if (Number(intelligence) >= 6) {
    return getCounterSchool(playerSchool, opponent?.school);
  }
  return COMBAT_SCHOOLS.includes(opponent?.school) ? opponent.school : COMBAT_ARENA_SCHOOL;
}

function buildSyntheticTraces({
  intelligence,
  memoryLineCount,
  attackSchool,
  targetSchool,
  rarity,
}) {
  const intSignal = getIntelligenceSignal(intelligence);
  const schoolEffect = getSchoolEffectiveness(attackSchool, targetSchool);

  return [
    {
      heuristic: 'counter_intelligence',
      rawScore: intSignal,
      weight: 1,
      contribution: Number((intSignal * 12).toFixed(2)),
      explanation: `INT ${intelligence} drives a ${memoryLineCount}-line counter response.`,
    },
    {
      heuristic: 'school_counter',
      rawScore: clamp01((schoolEffect - 0.82) / 0.43),
      weight: 1,
      contribution: Number((((schoolEffect - 1) * 18) + 4).toFixed(2)),
      explanation: `${attackSchool} presses against ${targetSchool} through the affinity table.`,
    },
    {
      heuristic: 'rarity_pressure',
      rawScore: clamp01(rarity?.score ?? 0),
      weight: 1,
      contribution: Number((((rarity?.totalMultiplier ?? 1) - 1) * 10).toFixed(2)),
      explanation: `${rarity?.label || 'Common'} wording sharpens the counter-verse.`,
    },
  ];
}

export function createCombatOpponent(options = {}) {
  const random = typeof options.random === 'function' ? options.random : createSeededRandom(options.seed || 0);
  const school = COMBAT_SCHOOLS.includes(options.school)
    ? options.school
    : pickOne(random, COMBAT_SCHOOLS);
  const bank = OPPONENT_BANK[school] || OPPONENT_BANK.VOID;
  const intelligence = Number.isFinite(Number(options.int))
    ? Number(options.int)
    : (4 + Math.floor(random() * 17));
  const name = String(options.name || pickOne(random, bank.names) || 'The Cryptonym');
  const subtitle = String(options.subtitle || pickOne(random, bank.subtitles) || 'Counter-Sorcerer');

  // Assign doctrine based on school (Phase 1: Null Scribe for Void)
  let doctrine = options.doctrine || null;
  if (!doctrine && school === 'VOID') {
    doctrine = DOCTRINES.NULL_SCRIBE;
  }

  return {
    name,
    subtitle,
    school,
    doctrine,
    schoolName: SCHOOL_DISPLAY_NAMES[school] || school,
    int: intelligence,
    voiceProfile: options.voiceProfile || createSpeakerVoiceProfile({
      speakerId: `opponent:${name}`,
      speakerType: 'OPPONENT',
      school,
    }),
  };
}

function rollSignatureMove(random, doctrine, int) {
  if (!doctrine?.signatureMoves || int < 10) return null;
  
  // 30% base chance + intelligence scaling
  const chance = 0.3 + ((int - 10) * 0.04);
  if (random() > chance) return null;

  const roll = random();
  let cumulative = 0;
  for (const move of doctrine.signatureMoves) {
    cumulative += move.weight;
    if (roll <= cumulative) return move;
  }
  return doctrine.signatureMoves[0];
}

export async function generateOpponentSpell({
  opponent,
  playerHistory = [],
  playerContext = null,
  turnNumber = 1,
  arenaSchool = COMBAT_ARENA_SCHOOL,
} = {}) {
  const safeOpponent = opponent || createCombatOpponent();
  const playerText = playerContext?.text || '';
  
  // ORACLE AMP: Deep Player Analysis
  const playerDoc = playerText ? await analyzeText(playerText) : null;
  const playerSpeaking = playerText ? analyzeSpeaking({ text: playerText, analyzedDoc: playerDoc }) : null;
  
  const memoryLines = collectMemoryLines(playerHistory, safeOpponent);
  const playerSchool = playerDoc?.dominantSchool || playerContext?.school || COMBAT_ARENA_SCHOOL;
  const attackSchool = getAttackSchool(safeOpponent, playerSchool, safeOpponent.int);
  
  const seed = stableHash([
    safeOpponent.name,
    safeOpponent.school,
    safeOpponent.int,
    attackSchool,
    playerSchool,
    turnNumber,
    ...memoryLines,
    playerText
  ].join('|'));
  const random = createSeededRandom(seed);
  
  // Doctrine signature move logic
  const signatureMove = rollSignatureMove(random, safeOpponent.doctrine, safeOpponent.int);
  
  const bank = OPPONENT_BANK[attackSchool] || OPPONENT_BANK.VOID;
  const voiceStyle = OPPONENT_VOICE_STYLE[attackSchool] || OPPONENT_VOICE_STYLE.VOID;
  
  // ORACLE AMP: Intelligent Token Selection
  // If intelligence is high, the opponent specifically targets the player's most resonant vowel families
  let focusTokens = collectFocusTokens(memoryLines, safeOpponent.int, random);
  if (safeOpponent.int >= 15 && playerDoc?.vowelFamilyDistribution) {
    const sortedFamilies = Object.entries(playerDoc.vowelFamilyDistribution).sort((a,b) => b[1] - a[1]);
    const dominantFamily = sortedFamilies[0]?.[0];
    // Find tokens in the history that share this family to "counter-resonate"
    const resonantTokens = playerDoc.allWords
      .filter(w => w.phonetics?.vowelFamily === dominantFamily && !w.isStopWord)
      .map(w => w.normalized);
    if (resonantTokens.length > 0) {
      focusTokens = [...new Set([...focusTokens, ...resonantTokens.slice(0, 2)])];
    }
  }

  const directFragments = buildCounterFragments(random, focusTokens);
  const flavorCount = safeOpponent.int >= 12 ? 2 : 1;
  const flavorFragments = Array.from({ length: flavorCount }, () => pickOne(random, bank.flavor)).filter(Boolean);
  const fragmentBudget = safeOpponent.int >= 12 ? 3 : 2;
  const fragments = shuffle(random, [...directFragments, ...flavorFragments]).slice(0, fragmentBudget);

  let rawSpell = fragments.length > 0
    ? fragments.join(', ')
    : String(pickOne(random, bank.flavor) || 'The counter-verse arrives without warning');
    
  // If signature move, prefix with move flavor
  if (signatureMove) {
    rawSpell = `${signatureMove.flavor} ${rawSpell}`;
  }

  const opener = safeOpponent.int >= 9 ? pickOne(random, voiceStyle.openers) : null;
  const styledSpell = opener ? `${opener}, ${rawSpell}` : rawSpell;
  const terminalPunctuation = String(voiceStyle.punctuation || '.');
  const spell = `${styledSpell.charAt(0).toUpperCase()}${styledSpell.slice(1).trim().replace(/[,.!?;: ]+$/, '')}${terminalPunctuation}`;

  const intSignal = getIntelligenceSignal(safeOpponent.int);
  const schoolEffect = getSchoolEffectiveness(attackSchool, playerSchool);
  
  // ORACLE AMP: Prosody Matching
  // High intelligence opponents match the player's meter to "interfere" with their rhythm
  const playerCoherence = playerSpeaking?.prosody?.beatAlignment || 0.5;

  const memorySignal = memoryLines.length > 0
    ? clamp01(memoryLines.length / (Number.isFinite(getOpponentMemoryWindow(safeOpponent.int)) ? 8 : 12))
    : 0;
  const tokenSignal = focusTokens.length > 0 ? clamp01(focusTokens.length / 4) : 0;
  
  // Calculate synthetic rarity and score with Oracle signals
  const syntheticRarityScore = clamp01(
    (intSignal * 0.40) + 
    (memorySignal * 0.15) + 
    (tokenSignal * 0.15) + 
    (playerCoherence * 0.1) + // High player skill makes opponent try harder
    (random() * 0.2)
  );
  
  const rarity = getCombatRarityByScore(syntheticRarityScore);
  const syntheticTotalScore = Math.round(
    30
    + (intSignal * 24)
    + (memorySignal * 12)
    + (tokenSignal * 8)
    + (playerCoherence * 10)
    + ((schoolEffect - 1) * 24)
  );

  const profile = await buildCombatProfile({
    text: spell,
    scoreData: {
      totalScore: syntheticTotalScore,
      traces: [],
    },
    arenaSchool,
    fallbackSchool: attackSchool,
    speakerId: `opponent:${safeOpponent.name}`,
    speakerType: 'OPPONENT',
    speakerProfile: safeOpponent.voiceProfile,
  });
  const statusEffect = profile.statusEffect || createDoctrineStatusEffect(signatureMove, attackSchool);
  const commentary = profile.commentary || `${attackSchool} pressure builds through the counter-verse.`;
  const telegraph = buildTelegraph({
    signatureMove,
    attackSchool,
    focusTokens,
    commentary,
    memoryLinesUsed: memoryLines.length,
  });

  // Base damage calculation
  let damage = Math.max(
    24,
    Math.round(
      (28 + (safeOpponent.int * 3.5))
      * schoolEffect
      * (1 + (memorySignal * 0.12))
      * (1 + (tokenSignal * 0.08))
      * (1 + ((Number(profile?.speaking?.severity?.potency) || 0) * 0.14))
      * (1 + ((Number(profile?.speaking?.harmony?.score) || 0) * 0.1))
      * (1 + ((Number(profile?.voiceResonance) || 0) * 0.08))
      * Math.min(1.38, 0.86 + ((profile.rarity.totalMultiplier + rarity.totalMultiplier) * 0.12))
    )
  );

  // Doctrine scaling
  if (safeOpponent.doctrine?.scaling?.damage) {
    damage = Math.round(damage * safeOpponent.doctrine.scaling.damage);
  }

  // Signature move damage modifier (if any)
  if (signatureMove?.damageMult) {
    damage = Math.round(damage * signatureMove.damageMult);
  }

  const traces = buildSyntheticTraces({
    intelligence: safeOpponent.int,
    memoryLineCount: memoryLines.length,
    attackSchool,
    targetSchool: playerSchool,
    rarity: {
      ...profile.rarity,
      score: syntheticRarityScore,
    },
  });

  return {
    spell,
    damage,
    school: attackSchool,
    traces,
    explainTrace: traces,
    rarity: profile.rarity,
    schoolAffinityMultiplier: schoolEffect,
    memoryLinesUsed: memoryLines.length,
    counterTokens: focusTokens,
    speaking: profile.speaking,
    voiceProfile: profile.voiceProfile,
    nextVoiceProfile: profile.nextVoiceProfile,
    voiceResonance: profile.voiceResonance,
    commentary,
    intent: profile.intent,
    statusEffect,
    telegraph,
    signatureMove, // Expose move to UI/Engine
  };
}
