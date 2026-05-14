/**
 * SCHOLOMANCE WORD TOKENIZATION CONSTANTS
 * 
 * Central definition of word patterns used by analysis, rhyme, and 
 * Truesight rendering. Core logic units (codex/) should import from here.
 */

export const WORD_PATTERN = "[A-Za-z]+(?:['-][A-Za-z]+)*";
export const WORD_REGEX_GLOBAL = new RegExp(WORD_PATTERN, "g");
export const WORD_TOKEN_REGEX = new RegExp(`^${WORD_PATTERN}$`);
export const LINE_TOKEN_REGEX = new RegExp(`${WORD_PATTERN}|\\s+|[^A-Za-z'\\s]+`, "g");
