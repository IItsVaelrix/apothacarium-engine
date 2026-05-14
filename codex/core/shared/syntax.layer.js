import { stemWord } from "../analysis.pipeline.js";
import { englishSyntaxHMM } from "../hmm.js";
import { runHmmPass } from "./syntax/hmmPass.js";

/**
 * English function words (closed-class tokens).
 */
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "than",
  "i", "me", "my", "mine", "you", "your", "yours", "we", "us", "our", "ours",
  "he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs",
  "it", "its", "this", "that", "these", "those",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "done",
  "to", "of", "in", "on", "at", "for", "from", "with", "by", "as",
  "not", "no", "so", "too", "very", "just", "can", "could", "would", "should",
  "will", "shall", "might", "may", "must", "across", "against", "among", "around",
  "before", "behind", "below", "beside", "between", "beyond", "during", "over", "under", "until", "etc"
]);

/**
 * Lexical triggers for specific part-of-speech context.
 */
const VERB_TRIGGERS = new Set(["to", "will", "would", "shall", "should", "can", "could", "must", "may", "might", "don't", "can't", "won't"]);
const NOUN_TRIGGERS = new Set(["the", "a", "an", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their", "every", "each", "some", "any"]);

/**
 * Enhanced Syntax Layer Analyzer
 * Performs context-aware parsing and robust token classification.
 */
export class SyntaxAnalyzer {
  /**
   * Normalizes a token for linguistic comparison.
   * @param {string} value 
   */
  static normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^[^a-z']+|[^a-z']+$/g, "");
  }
}

/**
 * Classifies a single word into a syntax token.
 * @param {object} analyzedWord 
 * @param {object} context 
 * @returns {object}
 */
export function classifySyntaxToken(analyzedWord, context) {
  const normalized = SyntaxAnalyzer.normalize(analyzedWord.text);
  const reasons = context.reasons || [];
  
  // Initial role determination
  let role = context.role || (FUNCTION_WORDS.has(normalized) ? "function" : "content");

  // Contextual refinement
  if (context.prevNorm && NOUN_TRIGGERS.has(context.prevNorm)) {
    reasons.push("noun_precursor_context");
    role = "content"; 
  } else if (context.prevNorm && VERB_TRIGGERS.has(context.prevNorm)) {
    reasons.push("verb_precursor_context");
    role = "content"; 
  }

  // Line Positioning
  let lineRole = "line_mid";
  if (context.wordIndex === 0 && context.lineWordCount === 1) lineRole = "line_end";
  else if (context.wordIndex === 0) lineRole = "line_start";
  else if (context.wordIndex === context.lineWordCount - 1) lineRole = "line_end";

  // Stress Role
  let stressRole = "unknown";
  const stresses = analyzedWord.deepPhonetics?.syllables?.map(s => s.stress) || [];
  if (stresses.includes(1)) stressRole = "primary";
  else if (stresses.includes(2)) stressRole = "secondary";
  else if (stresses.includes(0)) stressRole = "unstressed";

  // Policy Finalization
  let rhymePolicy = "allow";
  if (role === "function" && lineRole !== "line_end") {
    rhymePolicy = "suppress";
    reasons.push("function_non_terminal");
  } else if (role === "function" && lineRole === "line_end") {
    rhymePolicy = "allow_weak";
    reasons.push("function_line_end_exception");
  } else if (role === "content") {
    reasons.push("content_default");
  }

  return {
    word: analyzedWord.text,
    normalized,
    lineNumber: context.lineNumber,
    wordIndex: context.wordIndex,
    charStart: analyzedWord.start,
    charEnd: analyzedWord.end,
    role,
    lineRole,
    stressRole,
    stem: stemWord(normalized),
    rhymePolicy,
    reasons
  };
}

/**
 * Refined buildSyntaxLayer using stanza-aware contextual HMM analysis.
 */
export function buildSyntaxLayer(analyzedDoc) {
  const lines = Array.isArray(analyzedDoc?.lines) ? analyzedDoc.lines : [];
  const tokens = [];
  const tokenByIdentity = new Map();
  const tokenByCharStart = new Map();
  
  const counts = {
    roleCounts: { content: 0, function: 0 },
    lineRoleCounts: { line_start: 0, line_mid: 0, line_end: 0 },
    stressRoleCounts: { primary: 0, secondary: 0, unstressed: 0, unknown: 0 },
    rhymePolicyCounts: { allow: 0, allow_weak: 0, suppress: 0 },
    reasonCounts: {},
  };

  const registerToken = (token) => {
    tokens.push(token);
    const key = `${token.lineNumber}:${token.wordIndex}:${token.charStart}`;
    tokenByIdentity.set(key, token);
    if (token.charStart >= 0) tokenByCharStart.set(token.charStart, token);
    
    counts.roleCounts[token.role]++;
    counts.lineRoleCounts[token.lineRole]++;
    counts.stressRoleCounts[token.stressRole]++;
    counts.rhymePolicyCounts[token.rhymePolicy]++;
    token.reasons.forEach(r => {
      counts.reasonCounts[r] = (counts.reasonCounts[r] || 0) + 1;
    });
  };

  // Process document tokens
  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    const lineWords = Array.isArray(line?.words) ? line.words : [];
    const lineNum = Number.isInteger(line?.number) ? line.number : lIdx;

    for (let wIdx = 0; wIdx < lineWords.length; wIdx++) {
      const analyzedWord = lineWords[wIdx];
      const prevWord = wIdx > 0 ? lineWords[wIdx - 1] : null;
      const prevNorm = prevWord ? SyntaxAnalyzer.normalize(prevWord.text) : "";
      
      const token = classifySyntaxToken(analyzedWord, {
        lineNumber: lineNum,
        wordIndex: wIdx,
        lineWordCount: lineWords.length,
        prevNorm,
        reasons: ["initial_heuristic_judgment"]
      });

      registerToken(token);
    }
  }

  // Weave in the Hidden Harkov Model (HHM) via the dedicated pass
  // This will refine token.role and build the summary
  const { summary: hhm, tokenStateByIdentity } = runHmmPass(tokens, FUNCTION_WORDS);

  // Attach per-token HHM state
  tokens.forEach(token => {
    const identity = `${token.lineNumber}:${token.wordIndex}:${token.charStart}`;
    token.hhm = tokenStateByIdentity.get(identity) || null;
  });

  return {
    enabled: tokens.length > 0,
    tokens,
    tokenByIdentity,
    tokenByCharStart,
    hhm,
    syntaxSummary: {
      enabled: tokens.length > 0,
      tokenCount: tokens.length,
      ...counts,
      tokens,
      hhm,
    },
  };
}

