import { clamp01 } from '../../pixelbrain/shared.js';
import { INTENT_TYPES, INTENT_KEYWORDS, SUBJECT_KEYWORDS } from './constants.js';

/**
 * Detect primary intent from tokens
 * @param {Object} payload - { tokens: string[] }
 * @returns {Object} { intent, confidence }
 */
export function classifyIntent({ tokens }) {
  const intentScores = {};
  
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    intentScores[intent] = 0;
    for (const keyword of keywords) {
      const keywordTokens = keyword.split(' ');
      if (keywordTokens.length === 1) {
        if (tokens.includes(keyword)) {
          intentScores[intent] += 2;
        }
      } else {
        // Multi-word keyword check
        const text = tokens.join(' ');
        if (text.includes(keyword)) {
          intentScores[intent] += 3;
        }
      }
    }
  }
  
  // Find highest scoring intent
  let maxIntent = INTENT_TYPES.UNKNOWN;
  let maxScore = 0;
  for (const [intent, score] of Object.entries(intentScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxIntent = intent;
    }
  }
  
  // Default to GENERATE_VISUAL if we have subject keywords
  if (maxIntent === INTENT_TYPES.UNKNOWN) {
    for (const subject of SUBJECT_KEYWORDS) {
      if (tokens.includes(subject)) {
        return { intent: INTENT_TYPES.GENERATE_VISUAL, confidence: 0.5 };
      }
    }
  }
  
  return {
    intent: maxIntent,
    confidence: maxScore > 0 ? clamp01(maxScore / 5) : 0.3,
  };
}