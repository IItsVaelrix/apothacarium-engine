/**
 * Procedural commentary phrase bank for CODEx heuristic commentary.
 *
 * Instead of static bridge/closer sentences, each entry provides:
 * - concept: the abstract theme label
 * - citations: static quotes from public-domain criticism (Project Gutenberg)
 * - aspects: noun phrases naming specific facets of the concept
 * - criteria: noun phrases describing what the heuristic judges
 *
 * Shared template vocabulary (verbs, quality tiers, verdict phrases, scopes)
 * lives in TEMPLATE_VOCAB. The commentary builder uses these ingredients to
 * procedurally generate bridge and closer sentences, then scores candidates
 * with a bigram Markov model.
 *
 * MODEL_CORPUS provides exemplar sentences for Markov model training,
 * establishing the bigram transitions of good commentary register.
 */

function freezeEntry(entry) {
  return Object.freeze({
    concept: String(entry?.concept || "craft signal"),
    citations: Object.freeze(Array.isArray(entry?.citations) ? entry.citations.map((citation) => Object.freeze({
      quote: String(citation?.quote || ""),
      attribution: String(citation?.attribution || ""),
    })) : []),
    aspects: Object.freeze(Array.isArray(entry?.aspects) ? entry.aspects.map((a) => String(a || "")) : []),
    criteria: Object.freeze(Array.isArray(entry?.criteria) ? entry.criteria.map((c) => String(c || "")) : []),
  });
}

// ---------------------------------------------------------------------------
// Shared template vocabulary — used by the builder for procedural generation
// ---------------------------------------------------------------------------

export const TEMPLATE_VOCAB = Object.freeze({
  readingVerbs: Object.freeze([
    "read", "measured", "interpreted", "judged", "tracked",
  ]),
  qualityTiers: Object.freeze({
    high: Object.freeze([
      "deliberate", "controlled", "structural", "governed", "disciplined",
    ]),
    mid: Object.freeze([
      "present", "operative", "detectable", "functional", "moderate",
    ]),
    low: Object.freeze([
      "faint", "nascent", "tentative", "emerging", "sparse",
    ]),
  }),
  verdictTiers: Object.freeze({
    high: Object.freeze([
      "sustains itself under scrutiny",
      "holds as deliberate craft",
      "reads as intentional throughout",
      "confirms structural discipline",
      "demonstrates governed control",
    ]),
    mid: Object.freeze([
      "registers above noise",
      "shows partial control",
      "functions intermittently",
      "holds in places but not consistently",
      "reads as uneven but present",
    ]),
    low: Object.freeze([
      "remains underdeveloped",
      "appears nascent at best",
      "lacks consistent presence",
      "does not yet sustain itself",
      "reads as incidental rather than governed",
    ]),
  }),
  scopePhrases: Object.freeze([
    "across the line system",
    "through the stanza",
    "at the measured positions",
    "across the active lines",
    "through the stress field",
  ]),
});

// ---------------------------------------------------------------------------
// Markov model training corpus — exemplar sentences that establish the
// bigram transitions of good commentary register. Citations are also
// included at training time (extracted automatically by the builder).
// ---------------------------------------------------------------------------

export const MODEL_CORPUS = Object.freeze([
  "The texture is read as deliberate across the line system.",
  "The pattern here signals controlled semantic intent.",
  "The surface reveals governed articulation through the stanza.",
  "The reading confirms structural discipline at the measured positions.",
  "The design sustains itself under scrutiny across the active lines.",
  "Sonic texture here registers as intentional throughout.",
  "The phonetic pattern holds as deliberate craft through the stress field.",
  "The aspect is interpreted as functional rather than incidental.",
  "Criticism measures the surface for structural presence.",
  "The reading tracks governed control across the line system.",
  "The texture reads as controlled rather than scattered.",
  "The pattern in the surface reads deliberate across the stanza.",
  "The aspect here confirms disciplined articulation.",
  "The reading reveals intentional design through the measured positions.",
  "The surface is judged as structural across the active lines.",
  "The chain lands as controlled emphasis through the stress field.",
  "The recurrence sharpens the attack across the line system.",
  "The architecture holds as deliberate craft under scrutiny.",
  "The coherence field sustains itself through the stanza.",
  "The emotional arc reads as intentional throughout the active lines.",
  "The lexical palette demonstrates governed control at the measured positions.",
  "The echo structure confirms structural discipline across the line system.",
  "The cadence here registers above noise through the stress field.",
  "The resonance profile shows partial control across the stanza.",
  "The device surface holds in places but not consistently.",
]);

// ---------------------------------------------------------------------------
// Default entry — used when no heuristic-specific entry is found
// ---------------------------------------------------------------------------

const DEFAULT_COMMENTARY_ENTRY = freezeEntry({
  concept: "craft signal",
  citations: [
    {
      quote: "Poetry is the spontaneous overflow of powerful feelings",
      attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
    },
    {
      quote: "True ease in writing comes from art, not chance",
      attribution: "Pope, An Essay on Criticism (PG 2612)",
    },
    {
      quote: "The poet nothing affirmeth, and therefore never lieth",
      attribution: "Sidney, Defence of Poesy (PG 1265)",
    },
  ],
  aspects: [
    "craft signal", "compositional surface", "formal reading",
    "structural indicator", "craft posture",
  ],
  criteria: [
    "deliberate technique", "formal coherence", "compositional intent",
    "craft governance", "structural discipline",
  ],
});

// ---------------------------------------------------------------------------
// Per-heuristic entries
// ---------------------------------------------------------------------------

export const PHRASE_BANK = Object.freeze({

  phoneme_density: freezeEntry({
    concept: "sonic texture",
    citations: [
      {
        quote: "The sound must seem an echo to the sense",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Poetry is the breath and finer spirit of all knowledge",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "True ease in writing comes from art, not chance",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "The poet, described in ideal perfection, brings the whole soul of man into activity",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
      {
        quote: "The effect of elevated language upon an audience is not persuasion but transport",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
    ],
    aspects: [
      "sonic texture", "phonetic pattern", "sound design",
      "phoneme activity", "sonic surface",
    ],
    criteria: [
      "semantic intent", "controlled articulation", "structural presence",
      "phonetic discipline", "sonic coherence",
    ],
  }),

  alliteration_density: freezeEntry({
    concept: "consonant chaining",
    citations: [
      {
        quote: "The sound must seem an echo to the sense",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Sublimity is the echo of a great soul",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "Expression is the dress of thought",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Nature never set forth the earth in so rich tapestry as divers poets have done",
        attribution: "Sidney, Defence of Poesy (PG 1265)",
      },
      {
        quote: "Poetry is something more philosophic and of graver import than history",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
    ],
    aspects: [
      "consonant chain", "onset pattern", "alliterative surface",
      "initial recurrence", "consonant architecture",
    ],
    criteria: [
      "rhetorical emphasis", "memory scaffolding", "rhythmic attack",
      "onset discipline", "consonant control",
    ],
  }),

  rhyme_quality: freezeEntry({
    concept: "echo architecture",
    citations: [
      {
        quote: "The sound must seem an echo to the sense",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Poetry is an imitation of action",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "What oft was thought, but ne'er so well expressed",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "The poet binds together by passion and knowledge the vast empire of human society",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "Good sense is the body of poetic genius, fancy its drapery, motion its life, and imagination the soul",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
    ],
    aspects: [
      "echo structure", "rhyme net", "return pattern",
      "end-sound architecture", "echo surface",
    ],
    criteria: [
      "structural coherence", "meaningful return", "narrative continuity",
      "line-ending discipline", "echo precision",
    ],
  }),

  multisyllabic_rhyme: freezeEntry({
    concept: "resonance chaining",
    citations: [
      {
        quote: "The sound must seem an echo to the sense",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Sublimity is the echo of a great soul",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "What oft was thought, but ne'er so well expressed",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "The poet binds together by passion and knowledge the vast empire of human society",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "True ease in writing comes from art, not chance",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
    ],
    aspects: [
      "resonance chain", "terminal echo braid", "multisyllabic tail-lock",
      "syllabic return", "echo ladder",
    ],
    criteria: [
      "tiered echo pressure", "distinct-root craft", "terminal discipline",
      "syllabic continuity", "chain authority",
    ],
  }),

  meter_regularity: freezeEntry({
    concept: "metrical cadence",
    citations: [
      {
        quote: "There is not, or never has been, any essential difference between the language of prose and metrical composition",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "No man was ever yet a great poet, without being at the same time a profound philosopher",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
      {
        quote: "True ease in writing comes from art, not chance",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "The poet should prefer probable impossibilities to improbable possibilities",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "Poetry is of all human learning the most ancient and of most fatherly antiquity",
        attribution: "Sidney, Defence of Poesy (PG 1265)",
      },
    ],
    aspects: [
      "metrical cadence", "stress pattern", "rhythmic discipline",
      "tempo architecture", "beat regularity",
    ],
    criteria: [
      "emotional pacing", "tempo governance", "stress discipline",
      "delivery control", "cadence coherence",
    ],
  }),

  syntactic_cohesion: freezeEntry({
    concept: "logical progression",
    citations: [
      {
        quote: "True wit is nature to advantage dressed",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "What oft was thought, but ne'er so well expressed",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "The poet should prefer probable impossibilities to improbable possibilities",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "No man was ever yet a great poet, without being at the same time a profound philosopher",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
      {
        quote: "Expression is the dress of thought",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
    ],
    aspects: [
      "logical progression", "connective pressure", "sentence weave",
      "argument structure", "syntactic command",
    ],
    criteria: [
      "prose stability", "structural complexity", "transitional force",
      "argument coherence", "defensive penetration",
    ],
  }),

  vocabulary_richness: freezeEntry({
    concept: "diction range",
    citations: [
      {
        quote: "True wit is nature to advantage dressed",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Poetry is of all human learning the most ancient and of most fatherly antiquity",
        attribution: "Sidney, Defence of Poesy (PG 1265)",
      },
      {
        quote: "The poet, described in ideal perfection, brings the whole soul of man into activity",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
      {
        quote: "Poetry is the breath and finer spirit of all knowledge",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "Words are like leaves; and where they most abound, much fruit of sense beneath is rarely found",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
    ],
    aspects: [
      "lexical palette", "diction range", "vocabulary surface",
      "word selection", "lexical contrast",
    ],
    criteria: [
      "thematic precision", "register control", "diction fit",
      "lexical discipline", "vocabulary governance",
    ],
  }),

  literary_device_richness: freezeEntry({
    concept: "rhetorical layering",
    citations: [
      {
        quote: "Sublimity is the echo of a great soul",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "Poetry therefore is an art of imitation",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "Expression is the dress of thought",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Nature never set forth the earth in so rich tapestry as divers poets have done",
        attribution: "Sidney, Defence of Poesy (PG 1265)",
      },
      {
        quote: "The effect of elevated language upon an audience is not persuasion but transport",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
    ],
    aspects: [
      "device surface", "rhetorical texture", "figure density",
      "motif architecture", "device interaction",
    ],
    criteria: [
      "interpretive depth", "craft pressure", "structural intent",
      "rhetorical discipline", "analytical durability",
    ],
  }),

  scroll_power: freezeEntry({
    concept: "coherence pressure",
    citations: [
      {
        quote: "Poetry is the spontaneous overflow of powerful feelings",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "Sublimity is the echo of a great soul",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "The poet, described in ideal perfection, brings the whole soul of man into activity",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
      {
        quote: "Poetry is something more philosophic and of graver import than history",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "What oft was thought, but ne'er so well expressed",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
    ],
    aspects: [
      "coherence field", "compositional pressure", "line system",
      "formal coupling", "force architecture",
    ],
    criteria: [
      "formal order", "emotional intensity", "cohesion strength",
      "pressure resolution", "compositional governance",
    ],
  }),

  phonetic_hacking: freezeEntry({
    concept: "vowel strategy",
    citations: [
      {
        quote: "The sound must seem an echo to the sense",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "Poetry is an imitation of action",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "Poetry is the breath and finer spirit of all knowledge",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "The effect of elevated language upon an audience is not persuasion but transport",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "The poet nothing affirmeth, and therefore never lieth",
        attribution: "Sidney, Defence of Poesy (PG 1265)",
      },
    ],
    aspects: [
      "vowel clustering", "resonance profile", "vowel architecture",
      "phonetic concentration", "resonance contour",
    ],
    criteria: [
      "directed resonance", "vowel discipline", "phonetic strategy",
      "resonance control", "vowel coherence",
    ],
  }),

  abyssal_resonance: freezeEntry({
    concept: "entropy pressure",
    citations: [
      {
        quote: "The old order changeth, yielding place to new",
        attribution: "Tennyson, Idylls of the King (PG 610)",
      },
      {
        quote: "What has been once done can be done again",
        attribution: "The Thousand and One Nights (PG 34206)",
      },
      {
        quote: "The effect of elevated language upon an audience is not persuasion but transport",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "True ease in writing comes from art, not chance",
        attribution: "Pope, An Essay on Criticism (PG 2612)",
      },
      {
        quote: "The poet binds together by passion and knowledge the vast empire of human society",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
    ],
    aspects: [
      "entropy pressure", "public usage field", "semantic wear",
      "abyssal hunger", "lexical weather",
    ],
    criteria: [
      "rarity recovery", "collective overuse", "semantic decay",
      "public-cast freshness", "linguistic entropy",
    ],
  }),

  emotional_resonance: freezeEntry({
    concept: "affective continuity",
    citations: [
      {
        quote: "Poetry is the spontaneous overflow of powerful feelings",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
      {
        quote: "Sublimity is the echo of a great soul",
        attribution: "Longinus, On the Sublime (PG 6081)",
      },
      {
        quote: "Character is that which reveals moral purpose",
        attribution: "Aristotle, Poetics (PG 1974)",
      },
      {
        quote: "No man was ever yet a great poet, without being at the same time a profound philosopher",
        attribution: "Coleridge, Biographia Literaria (PG 7700)",
      },
      {
        quote: "The poet binds together by passion and knowledge the vast empire of human society",
        attribution: "Wordsworth, Preface to Lyrical Ballads (PG 5600)",
      },
    ],
    aspects: [
      "emotional arc", "affective surface", "emotional pressure",
      "affect continuity", "emotional contour",
    ],
    criteria: [
      "escalation control", "continuity discipline", "affective governance",
      "emotional coherence", "transition strength",
    ],
  }),

  default: DEFAULT_COMMENTARY_ENTRY,
});

export { DEFAULT_COMMENTARY_ENTRY };
