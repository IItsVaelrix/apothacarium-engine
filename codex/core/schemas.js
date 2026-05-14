/**
 * @typedef {Object} Scroll
 * @property {string} id - Unique identifier for the scroll.
 * @property {string} title - The title of the scroll.
 * @property {string} content - The text content of the scroll.
 * @property {number} createdAt - Timestamp of when the scroll was created.
 * @property {number} updatedAt - Timestamp of when the scroll was last updated.
 * @property {string} authorId - The ID of the user who authored the scroll.
 */

/**
 * @typedef {Object} PhonemeAnalysis
 * @property {string} vowelFamily - The primary vowel family identified (e.g., "AY", "IY").
 * @property {string[]} phonemes - An array of phonemes in the word.
 * @property {string|null} coda - The consonant cluster at the end of the syllable.
 * @property {string} rhymeKey - A key for determining rhymes, typically `{vowelFamily}-{coda}`.
 */

/**
 * @typedef {Object} CombatAction
 * @property {string} scrollId - The ID of the scroll being used.
 * @property {string[]} lines - The specific lines of text being used in the action.
 * @property {number} timestamp - Timestamp of the combat action.
 * @property {string} playerId - The ID of the player performing the action.
 */

/**
 * @typedef {Object} ScoreTrace
 * @property {string} heuristic - The name of the scoring heuristic (e.g., "phoneme_density").
 * @property {number} rawScore - The score from 0.0 to 1.0 before weighting.
 * @property {number} weight - The weight of this heuristic in the total score.
 * @property {number} contribution - The final contribution to the total score (rawScore * weight * scale).
 * @property {string} explanation - A human-readable explanation of the score.
 * @property {string} [commentary] - Criticism-informed commentary keyed to the heuristic signal.
 * @property {Diagnostic[]} [diagnostics] - Optional range-based diagnostics from the heuristic.
 * @property {string} [bytecode] - Bytecode signal for machine-readable trace (e.g., "PB-SCORE-v1-DAMPENING-FIELD").
 * @property {number} [linguisticMass] - The effective linguistic mass after mastery reduction.
 * @property {number} [mastery] - The mastery level used in dampening calculation.
 * @property {number} [costBasis] - The raw cost basis (linguisticMass ** exponent).
 * @property {number} [rawImportCount] - The raw import count before mastery reduction.
 */

/**
 * @typedef {Object} CombatResult
 * @property {number} damage - The total damage dealt.
 * @property {string[]} statusEffects - Any status effects applied.
 * @property {Object} resourceChanges - Changes to player resources (e.g., mana, health).
 * @property {ScoreTrace[]} explainTrace - An array of traces detailing how the score was calculated.
 */

/**
 * @typedef {Object} XPEvent
 * @property {string} source - The source of the XP gain (e.g., "scroll_created", "combat_victory").
 * @property {number} amount - The amount of XP gained.
 * @property {number} timestamp - Timestamp of the event.
 * @property {string} playerId - The ID of the player receiving the XP.
 * @property {Object} [context] - Additional context for the event.
 */

/**
 * @typedef {Object} Diagnostic
 * @property {number} start - The start character index of the diagnostic range (0-based, relative to the document).
 * @property {number} end - The end character index of the diagnostic range.
 * @property {string} severity - "info" | "warning" | "error" | "success".
 * @property {string} message - A short message describing the issue or feature.
 * @property {string} [source] - The heuristic that generated this diagnostic.
 * @property {Object} [metadata] - Additional data (e.g., phoneme info).
 */

/**
 * @typedef {Object} AnalyzedWord
 * @property {string} text - The word text.
 * @property {string} [normalized] - Lowercase normalized token form.
 * @property {number} start - Start index in the original string.
 * @property {number} end - End index in the original string.
 * @property {number} [lineNumber] - Source line number (0-based).
 * @property {import('./heuristics/phoneme_density').PhonemeAnalysis|null} phonetics - The phoneme analysis from the engine.
 * @property {Object|null} [deepPhonetics] - Deep phoneme/syllable analysis from the engine.
 * @property {number} [syllableCount] - Word-level syllable count.
 * @property {string} [stressPattern] - Stress pattern extracted from deep analysis.
 * @property {string} [leadingSound] - First phonetic onset token.
 * @property {boolean} [isStopWord] - Whether the token is a stop word.
 * @property {boolean} [isContentWord] - Whether the token is considered a content word.
 */

/**
 * @typedef {Object} AnalyzedLine
 * @property {string} text - The line text.
 * @property {number} number - The line number (0-based).
 * @property {number} start - Start index of the line in the document.
 * @property {number} end - End index of the line in the document.
 * @property {AnalyzedWord[]} words - The words in this line.
 * @property {number} syllableCount - Sum of syllables in the line.
 * @property {string} [stressPattern] - Aggregated line stress pattern.
 * @property {number} [wordCount] - Number of words in the line.
 * @property {number} [contentWordCount] - Number of non-stop content words in the line.
 * @property {number} [avgWordLength] - Average normalized word length in this line.
 * @property {boolean} [hasTerminalPunctuation] - Whether the line ends in terminal punctuation.
 * @property {string|null} [terminalPunctuation] - Terminal punctuation symbol, if present.
 */

/**
 * @typedef {Object} AnalyzedDocument
 * @property {string} raw - The original raw text.
 * @property {AnalyzedLine[]} lines - Structured lines.
 * @property {AnalyzedWord[]} allWords - Flat list of all words.
 * @property {Object} stats - Aggregate lexical and structural stats.
 * @property {Record<string, number>} [vowelFamilyDistribution] - Distribution of vowel families.
 * @property {Record<string, number>} [schoolWeights] - Normalized school weights.
 * @property {string|null} [dominantSchool] - The school with the highest weight.
 * @property {Object} [parsed] - Derived parsing surfaces for heuristic consumption.
 * @property {Object} [parsed.verseIRAmplifier] - Optional VerseIR synapse payload attached by server/runtime composition.
 */

/**
 * @typedef {Object} Definition
 * @property {string} text - The definition text.
 * @property {string} partOfSpeech - Part of speech (noun, verb, etc.).
 * @property {string} source - The source of this definition (WordNet, GCIDE, Datamuse, etc.).
 */

/**
 * @typedef {Object} LexicalEntry
 * @property {string} word - The word itself.
 * @property {Definition|null} definition - Primary definition object.
 * @property {string[]} definitions - An array of all definition texts.
 * @property {string[]} pos - Parts of speech.
 * @property {string[]} synonyms - An array of synonyms.
 * @property {string[]} antonyms - An array of antonyms.
 * @property {string[]} rhymes - An array of rhyming words.
 * @property {string[]} slantRhymes - An array of slant rhyming words.
 * @property {string} [etymology] - The word's origin.
 * @property {string} [pronunciation] - The pronunciation.
 * @property {Object} [lore] - MUD-specific lore data.
 * @property {Object} [raw] - Raw response from the data source (for debugging).
 */

/**
 * Creates an empty LexicalEntry with default values.
 * @param {string} word - The word to create an entry for.
 * @returns {LexicalEntry} An empty lexical entry.
 */
export function createEmptyLexicalEntry(word) {
  return {
    word: word.toUpperCase(),
    definition: null,
    definitions: [],
    pos: [],
    synonyms: [],
    antonyms: [],
    rhymes: [],
    slantRhymes: [],
    etymology: undefined,
    pronunciation: undefined,
    lore: undefined,
    raw: undefined,
  };
}

/**
 * Merges two LexicalEntry objects, preferring non-empty values from the second entry.
 * @param {LexicalEntry} base - The base entry.
 * @param {Partial<LexicalEntry>} overlay - Values to overlay on the base.
 * @returns {LexicalEntry} The merged entry.
 */
export function mergeLexicalEntries(base, overlay) {
  return {
    word: overlay.word || base.word,
    definition: overlay.definition ?? base.definition,
    definitions: overlay.definitions?.length ? overlay.definitions : base.definitions,
    pos: overlay.pos?.length ? overlay.pos : base.pos,
    synonyms: overlay.synonyms?.length ? overlay.synonyms : base.synonyms,
    antonyms: overlay.antonyms?.length ? overlay.antonyms : base.antonyms,
    rhymes: overlay.rhymes?.length ? overlay.rhymes : base.rhymes,
    slantRhymes: overlay.slantRhymes?.length ? overlay.slantRhymes : base.slantRhymes,
    etymology: overlay.etymology ?? base.etymology,
    pronunciation: overlay.pronunciation ?? base.pronunciation,
    lore: overlay.lore ?? base.lore,
    raw: overlay.raw ?? base.raw,
  };
}

/**
 * @typedef {Object} WordMastery
 * @property {string} word - The normalized word.
 * @property {number} level - Current mastery level (1-5).
 * @property {number} exp - Experience points toward next level.
 * @property {string[]} unlockedSynergies - List of synergy IDs unlocked for this word.
 * @property {Object} stats - Usage stats (count, schools used in, max score contribution).
 */

/**
 * @typedef {Object} NexusState
 * @property {Object.<string, WordMastery>} discoveredWords - Map of word to mastery data.
 * @property {string[]} activeSynergies - List of currently active global synergies.
 */

// This is just for type definitions, so we export an empty object.
export const schemas = {};

