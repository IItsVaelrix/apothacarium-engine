/**
 * Rhyme Scheme Pattern Definitions
 * Known rhyme schemes with regex patterns for detection.
 */

export const RHYME_SCHEMES = {
  COUPLET: {
    id: "COUPLET",
    pattern: /^(AA)+$/,
    name: "Couplet",
    minLines: 2,
    description: "Two consecutive lines that rhyme",
  },
  ALTERNATE: {
    id: "ALTERNATE",
    pattern: /^(ABAB)+$/,
    name: "Alternate",
    minLines: 4,
    description: "Alternating rhyme pattern",
  },
  ENCLOSED: {
    id: "ENCLOSED",
    pattern: /^(ABBA)+$/,
    name: "Enclosed",
    minLines: 4,
    description: "Envelope rhyme where outer lines rhyme",
  },
  TRIPLET: {
    id: "TRIPLET",
    pattern: /^(AAA)+$/,
    name: "Triplet",
    minLines: 3,
    description: "Three consecutive rhyming lines",
  },
  LIMERICK: {
    id: "LIMERICK",
    pattern: /^AABBA$/,
    name: "Limerick",
    minLines: 5,
    description: "Classic limerick form",
  },
  TERZA_RIMA: {
    id: "TERZA_RIMA",
    pattern: /^ABA(BCB)*(CDC)?$/,
    name: "Terza Rima",
    minLines: 3,
    description: "Interlocking tercets used by Dante",
  },
  SHAKESPEAREAN_SONNET: {
    id: "SHAKESPEAREAN_SONNET",
    pattern: /^ABABCDCDEFEFGG$/,
    name: "Shakespearean Sonnet",
    minLines: 14,
    description: "Three quatrains and a couplet",
  },
  PETRARCHAN_OCTAVE: {
    id: "PETRARCHAN_OCTAVE",
    pattern: /^ABBAABBA/,
    name: "Petrarchan Octave",
    minLines: 8,
    description: "Italian sonnet opening",
  },
  MONORHYME: {
    id: "MONORHYME",
    pattern: /^A{3,}$/,
    name: "Monorhyme",
    minLines: 3,
    description: "All lines share the same rhyme",
  },
  BALLAD: {
    id: "BALLAD",
    pattern: /^(ABAB|ABCB)+$/,
    name: "Ballad",
    minLines: 4,
    description: "Traditional ballad stanza",
  },
  RHYME_ROYAL: {
    id: "RHYME_ROYAL",
    pattern: /^ABABBCC$/,
    name: "Rhyme Royal",
    minLines: 7,
    description: "Seven-line stanza from Chaucer",
  },
  OTTAVA_RIMA: {
    id: "OTTAVA_RIMA",
    pattern: /^ABABABCC$/,
    name: "Ottava Rima",
    minLines: 8,
    description: "Eight-line stanza from Italian epic",
  },
  FREE_VERSE: {
    id: "FREE_VERSE",
    pattern: null,
    name: "Free Verse",
    minLines: 0,
    description: "No fixed rhyme scheme",
  },
};

export const SCHEME_LORE = {
  COUPLET: "The simplest binding - two lines joined in sonic matrimony. A spell of completion.",
  ALTERNATE: "A weaving pattern, ABAB - the dance of call and response, tension and release.",
  ENCLOSED: "ABBA - the embrace, where endings mirror beginnings. A spell of containment.",
  TRIPLET: "Three lines bound as one - the trinity of sound. Power in threes.",
  LIMERICK: "The jester's form - AABBA. Light and quick, yet precise in its architecture.",
  TERZA_RIMA: "Dante's chain - each tercet links to the next. An endless spiral descending.",
  SHAKESPEAREAN_SONNET: "The Bard's monument - three arguments and a twist. 14 lines of destiny.",
  PETRARCHAN_OCTAVE: "The Italian master's opening - ABBAABBA. A box within a box.",
  MONORHYME: "One sound repeated - hypnotic, obsessive. The drone of a single note.",
  BALLAD: "The people's verse - simple, memorable, timeless. Stories sung at crossroads.",
  RHYME_ROYAL: "Chaucer's crown - seven lines of courtly grace. Dignity in structure.",
  OTTAVA_RIMA: "The epic's breath - eight lines to carry heroes. Byron's chosen vessel.",
  FREE_VERSE: "Unbound by pattern - the verse finds its own path. Freedom has its own music.",
};

/**
 * Rhyme type definitions for classification
 */
export const RHYME_TYPES = {
  PERFECT: {
    id: "perfect",
    name: "Perfect Rhyme",
    minScore: 0.92,
    color: "#4ade80",
    lightColor: "#16a34a",
    description: "Identical vowel and coda sounds",
  },
  NEAR: {
    id: "near",
    name: "Near Rhyme",
    minScore: 0.78,
    color: "#60a5fa",
    lightColor: "#2563eb",
    description: "Close but not identical sounds",
  },
  SLANT: {
    id: "slant",
    name: "Slant Rhyme",
    minScore: 0.66,
    color: "#a78bfa",
    lightColor: "#7c3aed",
    description: "Approximate sound match",
  },
  ASSONANCE: {
    id: "assonance",
    name: "Assonance",
    minScore: 0.60,
    color: "#fbbf24",
    lightColor: "#d97706",
    description: "Matching vowel sounds only",
  },
  CONSONANCE: {
    id: "consonance",
    name: "Consonance",
    minScore: 0.65,
    color: "#f472b6",
    lightColor: "#db2777",
    description: "Matching consonant sounds only",
  },
};

/**
 * Compound rhyme subtypes
 */
export const RHYME_SUBTYPES = {
  MASCULINE: {
    id: "masculine",
    name: "Masculine",
    syllables: 1,
    description: "Single stressed syllable rhyme",
  },
  FEMININE: {
    id: "feminine",
    name: "Feminine",
    syllables: 2,
    description: "Two-syllable rhyme (stressed + unstressed)",
  },
  DACTYLIC: {
    id: "dactylic",
    name: "Dactylic",
    syllables: 3,
    description: "Three-syllable rhyme",
  },
  MOSAIC: {
    id: "mosaic",
    name: "Mosaic",
    syllables: null,
    description: "Multi-word rhyme combining to match",
  },
};

/**
 * Metrical foot definitions
 */
export const METRICAL_FEET = {
  IAMB: { pattern: "01", name: "Iamb", stress: "da-DUM" },
  TROCHEE: { pattern: "10", name: "Trochee", stress: "DUM-da" },
  SPONDEE: { pattern: "11", name: "Spondee", stress: "DUM-DUM" },
  PYRRHIC: { pattern: "00", name: "Pyrrhic", stress: "da-da" },
  DACTYL: { pattern: "100", name: "Dactyl", stress: "DUM-da-da" },
  ANAPEST: { pattern: "001", name: "Anapest", stress: "da-da-DUM" },
  AMPHIBRACH: { pattern: "010", name: "Amphibrach", stress: "da-DUM-da" },
};

/**
 * Common meter names by foot type and count
 */
export const METER_NAMES = {
  IAMB: {
    3: "Iambic Trimeter",
    4: "Iambic Tetrameter",
    5: "Iambic Pentameter",
    6: "Iambic Hexameter",
  },
  TROCHEE: {
    4: "Trochaic Tetrameter",
    5: "Trochaic Pentameter",
  },
  DACTYL: {
    4: "Dactylic Tetrameter",
    6: "Dactylic Hexameter",
  },
  ANAPEST: {
    3: "Anapestic Trimeter",
    4: "Anapestic Tetrameter",
  },
};
