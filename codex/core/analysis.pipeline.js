import { PhonemeEngine } from './phonology/phoneme.engine.js';
import { WORD_REGEX_GLOBAL } from "./constants/regex.js";
import { computeSchoolWeights, computeDominantSchool } from './constants/schools.js';
import { verseIRMicroprocessors } from './microprocessors/index.js';
import { extractGrimSignal } from './grimdesign/signalExtractor.js';
import { resolveDesignDecisions } from './grimdesign/decisionEngine.js';

/**
 * @typedef {import('./schemas').AnalyzedDocument} AnalyzedDocument
 * @typedef {import('./schemas').AnalyzedLine} AnalyzedLine
 * @typedef {import('./schemas').AnalyzedWord} AnalyzedWord
 */

const WORD_REGEX = WORD_REGEX_GLOBAL;
const SENTENCE_SPLIT_REGEX = /[.!?]+|\n+/;
const TERMINAL_PUNCTUATION_REGEX = /[.!?;:]$/;
const SCROLL_POWER_CAP = 0.7;

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "than",
  "i", "me", "my", "mine", "you", "your", "yours", "we", "our", "ours",
  "he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs",
  "it", "its", "this", "that", "these", "those",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had",
  "to", "of", "in", "on", "at", "for", "from", "with", "by", "as",
  "not", "no", "so", "too", "very", "just", "can", "could", "would", "should",
]);

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Analyzes a text document to prepare it for heuristic scoring.
 * Performs tokenization and phoneme/deep-phoneme analysis once per word and
 * builds algorithmic parse signals reused by scoring heuristics.
 *
 * @param {string} text - The raw input text.
 * @returns {Promise<AnalyzedDocument>} The structured document with linguistic data.
 */
export async function analyzeText(text) {
  if (!text) {
    return createEmptyDocument();
  }

  const lines = [];
  const allWords = [];
  let charIndex = 0;
  let wordCount = 0;
  let totalSyllables = 0;
  let totalWordLength = 0;
  let longWordCount = 0;

  const rawLines = text.split("\n");

  for (let i = 0; i < rawLines.length; i++) {
    const lineText = rawLines[i];
    const lineStart = charIndex;
    const lineEnd = lineStart + lineText.length;

    /** @type {AnalyzedLine} */
    const analyzedLine = {
      text: lineText,
      number: i,
      start: lineStart,
      end: lineEnd,
      words: [],
      syllableCount: 0,
      stressPattern: "",
      wordCount: 0,
      contentWordCount: 0,
      avgWordLength: 0,
      hasTerminalPunctuation: false,
      terminalPunctuation: null,
    };

    let lineWordLengthTotal = 0;
    const lineStressPatterns = [];

    const matches = [...lineText.matchAll(WORD_REGEX)];
    for (const match of matches) {
      const wordText = match[0];
      const normalized = normalizeWord(wordText);
      const wordStart = lineStart + match.index;
      const wordEnd = wordStart + wordText.length;

      const phonetics = PhonemeEngine.analyzeWord(wordText);
      const deepPhonetics = PhonemeEngine.analyzeDeep(wordText);
      const syllables = deepPhonetics?.syllableCount || phonetics?.syllableCount || 1;
      const stressPattern = deepPhonetics?.stressPattern || "";
      const leadingSound = getLeadingSound(phonetics, normalized);
      const isStopWord = STOP_WORDS.has(normalized);
      const isContentWord = !isStopWord && normalized.length >= 3;
      const rarity = PhonemeEngine.calculateRarity(normalized, phonetics?.phonemes || []);

      /** @type {AnalyzedWord} */
      const analyzedWord = {
        text: wordText,
        normalized,
        start: wordStart,
        end: wordEnd,
        lineNumber: i,
        phonetics,
        deepPhonetics,
        syllableCount: syllables,
        stressPattern,
        leadingSound,
        isStopWord,
        isContentWord,
        rarity,
      };

      analyzedLine.words.push(analyzedWord);
      allWords.push(analyzedWord);

      analyzedLine.syllableCount += syllables;
      totalSyllables += syllables;
      wordCount += 1;

      totalWordLength += normalized.length;
      lineWordLengthTotal += normalized.length;
      if (normalized.length >= 7) {
        longWordCount += 1;
      }

      if (isContentWord) {
        analyzedLine.contentWordCount += 1;
      }
      if (stressPattern) {
        lineStressPatterns.push(stressPattern);
      }
    }

    analyzedLine.wordCount = analyzedLine.words.length;
    analyzedLine.avgWordLength = analyzedLine.wordCount > 0
      ? lineWordLengthTotal / analyzedLine.wordCount
      : 0;
    analyzedLine.stressPattern = lineStressPatterns.join("");

    const trimmed = lineText.trim();
    analyzedLine.hasTerminalPunctuation = Boolean(trimmed) && TERMINAL_PUNCTUATION_REGEX.test(trimmed);
    analyzedLine.terminalPunctuation = analyzedLine.hasTerminalPunctuation
      ? trimmed[trimmed.length - 1]
      : null;

    lines.push(analyzedLine);

    // +1 for newline separators in the source text.
    charIndex = lineEnd + 1;
  }

  const normalizedWords = allWords
    .map((word) => word.normalized || normalizeWord(word.text))
    .filter(Boolean);

  const contentWords = allWords
    .filter((word) => word.isContentWord)
    .map((word) => word.normalized)
    .filter(Boolean);

  const stems = contentWords.map(stemWord).filter(Boolean);

  const wordFrequency = countTokens(normalizedWords);
  const contentWordFrequency = countTokens(contentWords);
  const stemFrequency = countTokens(stems);

  const uniqueWordCount = Object.keys(wordFrequency).length;
  const uniqueStemCount = Object.keys(stemFrequency).length;
  const contentWordCount = contentWords.length;

  const sentenceLengths = computeSentenceLengths(text);
  const sentenceCount = sentenceLengths.length || (wordCount > 0 ? 1 : 0);
  const avgSentenceLength = sentenceCount > 0 ? average(sentenceLengths) : 0;

  const repeatedWords = buildRepeatedEntries(contentWordFrequency, allWords, 3, 8);
  const repeatedBigrams = buildRepeatedBigrams(contentWords, 2, 8);

  const boundaryPatterns = buildLineBoundaryPatterns(lines);

  const nonEmptyLines = lines.filter((line) => line.text.trim().length > 0);
  const enjambedCount = nonEmptyLines.length > 1
    ? nonEmptyLines
      .slice(0, -1)
      .filter((line) => !line.hasTerminalPunctuation)
      .length
    : 0;
  const enjambmentRatio = nonEmptyLines.length > 1
    ? enjambedCount / (nonEmptyLines.length - 1)
    : 0;

  const stressProfile = inferStressProfile(lines);

  // --- Remediated Prototype Execution (The Great Wiring) ---
  let prosodyResult = null;
  let syntaxHMMResult = null;
  let phoneticResult = null;
  let spellweaveResult = null;
  let worldEntityResult = null;
  let turboquantResult = null;
  
  try {
    const results = await Promise.allSettled([
      verseIRMicroprocessors.execute('speaking.prosody', text),
      verseIRMicroprocessors.execute('syntax.hmm', normalizedWords, STOP_WORDS),
      verseIRMicroprocessors.execute('phonetic.matcher', text),
      verseIRMicroprocessors.execute('spellweave.engine', text),
      verseIRMicroprocessors.execute('world.entity', text),
      verseIRMicroprocessors.execute('pixel.turboquant', text),
    ]);

    if (results[0].status === 'fulfilled') prosodyResult = results[0].value;
    if (results[1].status === 'fulfilled') syntaxHMMResult = results[1].value;
    if (results[2].status === 'fulfilled') phoneticResult = results[2].value;
    if (results[3].status === 'fulfilled') spellweaveResult = results[3].value;
    if (results[4].status === 'fulfilled') worldEntityResult = results[4].value;
    if (results[5].status === 'fulfilled') turboquantResult = results[5].value;

    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        console.warn(`PB-ERR-v1: [HOOK_CHAIN_BREAK] Microprocessor index ${idx} failure: ${res.reason}`);
      }
    });
  } catch (error) {
    console.warn(`PB-ERR-v1: [HOOK_CHAIN_BREAK] Microprocessor orchestration failure: ${error.message}`);
  }

  const scrollPower = buildScrollPowerSignal({
    lineEndingRepeatCount: boundaryPatterns.lineEndingRepeatCount,
    nonEmptyLineCount: nonEmptyLines.length,
    lexicalDiversity: wordCount > 0 ? uniqueWordCount / wordCount : 0,
    stressCoherence: stressProfile.coherence,
  });

  const vowelFamilyDistribution = {};
  for (const word of allWords) {
    if (word.phonetics?.vowelFamily) {
      const v = word.phonetics.vowelFamily;
      vowelFamilyDistribution[v] = (vowelFamilyDistribution[v] || 0) + 1;
    }
  }

  const schoolWeights = computeSchoolWeights(vowelFamilyDistribution);
  const dominantSchool = computeDominantSchool(schoolWeights);

  const parsed = {
    wordFrequency,
    contentWordFrequency,
    stemFrequency,
    repeatedWords,
    repeatedBigrams,
    lineStarters: boundaryPatterns.lineStarters,
    lineEnders: boundaryPatterns.lineEnders,
    sentenceLengths,
    enjambment: {
      count: enjambedCount,
      ratio: clamp01(enjambmentRatio),
    },
    stressProfile,
    scrollPower,
    prosody: prosodyResult,
    syntaxHMM: syntaxHMMResult,
    phonetics: phoneticResult,
    spellweave: spellweaveResult,
    worldEntities: worldEntityResult,
    turboquant: turboquantResult,
  };

  // --- GrimDesign Integration (Phase 5) ---
  const grimSignal = extractGrimSignal({
    stats: {
      wordCount,
      totalSyllables,
      uniqueWordCount,
    },
    dominantSchool,
    schoolWeights,
    stressProfile,
    scrollPower,
  });
  const grimDesign = resolveDesignDecisions(grimSignal);

  return {
    raw: text,
    lines,
    allWords,
    stats: {
      wordCount,
      lineCount: lines.length,
      totalSyllables,
      uniqueWordCount,
      uniqueStemCount,
      contentWordCount,
      sentenceCount,
      avgSentenceLength,
      avgWordLength: wordCount > 0 ? totalWordLength / wordCount : 0,
      avgSyllablesPerWord: wordCount > 0 ? totalSyllables / wordCount : 0,
      lexicalDiversity: wordCount > 0 ? uniqueWordCount / wordCount : 0,
      contentWordRatio: wordCount > 0 ? contentWordCount / wordCount : 0,
      longWordRatio: wordCount > 0 ? longWordCount / wordCount : 0,
    },
    vowelFamilyDistribution,
    schoolWeights,
    dominantSchool,
    parsed,
    grimDesign,
  };
}

function createEmptyDocument() {
  return {
    raw: "",
    lines: [],
    allWords: [],
    imports: [],
    importCount: 0,
    stats: {
      wordCount: 0,
      lineCount: 0,
      totalSyllables: 0,
      uniqueWordCount: 0,
      uniqueStemCount: 0,
      contentWordCount: 0,
      sentenceCount: 0,
      avgSentenceLength: 0,
      avgWordLength: 0,
      avgSyllablesPerWord: 0,
      lexicalDiversity: 0,
      contentWordRatio: 0,
      longWordRatio: 0,
    },
    vowelFamilyDistribution: {},
    schoolWeights: {},
    dominantSchool: null,
    parsed: {
      wordFrequency: {},
      contentWordFrequency: {},
      stemFrequency: {},
      repeatedWords: [],
      repeatedBigrams: [],
      lineStarters: [],
      lineEnders: [],
      sentenceLengths: [],
      enjambment: { count: 0, ratio: 0 },
      stressProfile: { dominantFoot: "mixed", coherence: 0, error: 1 },
      scrollPower: {
        rhymeDensity: 0,
        coherence: 0,
        product: 0,
        cappedProduct: 0,
        normalized: 0,
      },
    },
  };
}

function normalizeWord(word) {
  return String(word || "")
    .toLowerCase()
    .replace(/[^a-z'-]/g, "")
    .replace(/^['-]+|['-]+$/g, "");
}

function getLeadingSound(phonetics, normalizedWord) {
  const firstPhoneme = Array.isArray(phonetics?.phonemes) ? phonetics.phonemes[0] : null;
  if (typeof firstPhoneme === "string" && firstPhoneme.length > 0) {
    return firstPhoneme.replace(/[0-9]/g, "").toUpperCase();
  }
  if (normalizedWord) {
    return normalizedWord[0].toUpperCase();
  }
  return "";
}

function countTokens(tokens) {
  /** @type {Record<string, number>} */
  const frequency = {};
  for (const token of tokens) {
    if (!token) continue;
    frequency[token] = (frequency[token] || 0) + 1;
  }
  return frequency;
}

export function stemWord(token) {
  if (!token || token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeSentenceLengths(text) {
  if (!text || typeof text !== "string") return [];

  return text
    .split(SENTENCE_SPLIT_REGEX)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const words = segment.match(WORD_REGEX) || [];
      return words.length;
    })
    .filter((length) => length > 0);
}

function buildRepeatedEntries(frequency, sourceWords, minCount = 3, limit = 8) {
  const positions = new Map();

  for (const word of sourceWords) {
    const token = word.normalized || normalizeWord(word.text);
    if (!token) continue;
    if (!positions.has(token)) positions.set(token, []);
    positions.get(token).push({
      start: word.start,
      end: word.end,
      lineNumber: word.lineNumber,
    });
  }

  return Object.entries(frequency)
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token, count]) => ({
      token,
      count,
      spans: (positions.get(token) || []).slice(0, 8),
    }));
}

function buildRepeatedBigrams(tokens, minCount = 2, limit = 8) {
  if (!Array.isArray(tokens) || tokens.length < 2) return [];

  /** @type {Record<string, number>} */
  const frequency = {};
  for (let i = 1; i < tokens.length; i++) {
    const a = tokens[i - 1];
    const b = tokens[i];
    if (!a || !b) continue;
    const key = `${a} ${b}`;
    frequency[key] = (frequency[key] || 0) + 1;
  }

  return Object.entries(frequency)
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([bigram, count]) => ({ bigram, count }));
}

function buildLineBoundaryPatterns(lines) {
  const starters = new Map();
  const enders = new Map();

  for (const line of lines) {
    const contentWords = (line.words || []).filter((word) => word.isContentWord && word.normalized);
    if (contentWords.length === 0) continue;

    const firstToken = contentWords[0].normalized;
    const lastToken = contentWords[contentWords.length - 1].normalized;
    const lineNumber = line.number + 1;

    if (!starters.has(firstToken)) starters.set(firstToken, []);
    if (!enders.has(lastToken)) enders.set(lastToken, []);

    starters.get(firstToken).push(lineNumber);
    enders.get(lastToken).push(lineNumber);
  }

  const toRankedArray = (entriesMap) => Array.from(entriesMap.entries())
    .filter(([, lineNumbers]) => lineNumbers.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([token, lineNumbers]) => ({
      token,
      count: lineNumbers.length,
      lineNumbers,
    }));

  return {
    lineStarters: toRankedArray(starters),
    lineEnders: toRankedArray(enders),
    lineEndingRepeatCount: countRepeatedOccurrences(enders),
  };
}

function countRepeatedOccurrences(entriesMap) {
  let repeatCount = 0;
  for (const lineNumbers of entriesMap.values()) {
    repeatCount += Math.max(0, lineNumbers.length - 1);
  }
  return repeatCount;
}

function buildScrollPowerSignal({ lineEndingRepeatCount, nonEmptyLineCount, lexicalDiversity, stressCoherence }) {
  const safeLineCount = Number(nonEmptyLineCount) || 0;
  const repeatCount = Math.max(0, Number(lineEndingRepeatCount) || 0);

  const rhymeDensity = safeLineCount > 1
    ? clamp01(repeatCount / Math.max(1, safeLineCount - 1))
    : 0;

  const coherence = clamp01((clamp01(lexicalDiversity) + clamp01(stressCoherence)) / 2);
  const product = clamp01(rhymeDensity * coherence);
  const cappedProduct = Math.max(0, Math.min(SCROLL_POWER_CAP, product * SCROLL_POWER_CAP));
  const normalized = SCROLL_POWER_CAP > 0 ? clamp01(cappedProduct / SCROLL_POWER_CAP) : 0;

  return {
    rhymeDensity,
    coherence,
    product,
    cappedProduct,
    normalized,
  };
}

function normalizeStressPattern(pattern) {
  return String(pattern || "").replace(/[^01]/g, "");
}

function computePatternMismatch(pattern, candidate) {
  const normalizedPattern = normalizeStressPattern(pattern);
  if (!normalizedPattern || !candidate) return 1;

  let mismatches = 0;
  for (let i = 0; i < normalizedPattern.length; i++) {
    if (normalizedPattern[i] !== candidate[i % candidate.length]) {
      mismatches += 1;
    }
  }

  return mismatches / normalizedPattern.length;
}

function inferStressProfile(lines) {
  const stressPatterns = lines
    .map((line) => normalizeStressPattern(line.stressPattern))
    .filter((pattern) => pattern.length >= 2);

  if (stressPatterns.length === 0) {
    return { dominantFoot: "mixed", coherence: 0, error: 1 };
  }

  const iambicError = average(stressPatterns.map((pattern) => computePatternMismatch(pattern, "01")));
  const trochaicError = average(stressPatterns.map((pattern) => computePatternMismatch(pattern, "10")));

  if (iambicError <= trochaicError) {
    return {
      dominantFoot: "01",
      coherence: clamp01(1 - iambicError),
      error: iambicError,
    };
  }

  return {
    dominantFoot: "10",
    coherence: clamp01(1 - trochaicError),
    error: trochaicError,
  };
}
