/**
 * CANONICAL UI FEATURE MODES
 * Defines which UI overlay or analysis panel is active.
 */
export const ANALYSIS_MODES = Object.freeze({
  NONE: 'none',
  ANALYZE: 'analyze',
  ASTROLOGY: 'astrology',
  RHYME: 'rhyme',
  VOWEL: 'vowel',
});

/**
 * CANONICAL COMPILER DEPTHS
 * Defines the computational intensity for the VerseIR engine.
 */
export const COMPILER_DEPTHS = Object.freeze({
  LIVE_FAST: 'live_fast',
  BALANCED: 'balanced',
  DEEP: 'deep_truesight',
  PIXELBRAIN: 'pixelbrain_transverse',
  VOID_ECHO: 'void_echo',
});

const DEFAULT_DEPTH = COMPILER_DEPTHS.BALANCED;

/**
 * MAPPING: UI Mode -> Required Compiler Depth
 */
const MODE_TO_DEPTH = Object.freeze({
  [ANALYSIS_MODES.NONE]: COMPILER_DEPTHS.BALANCED,
  [ANALYSIS_MODES.ANALYZE]: COMPILER_DEPTHS.DEEP,
  [ANALYSIS_MODES.ASTROLOGY]: COMPILER_DEPTHS.DEEP,
  [ANALYSIS_MODES.RHYME]: COMPILER_DEPTHS.BALANCED,
  [ANALYSIS_MODES.VOWEL]: COMPILER_DEPTHS.BALANCED,
});

const MODE_CONFIGS = Object.freeze({
  [COMPILER_DEPTHS.LIVE_FAST]: Object.freeze({
    id: COMPILER_DEPTHS.LIVE_FAST,
    maxWindowSyllables: 3,
    maxWindowTokenSpan: 3,
  }),
  [COMPILER_DEPTHS.BALANCED]: Object.freeze({
    id: COMPILER_DEPTHS.BALANCED,
    maxWindowSyllables: 4,
    maxWindowTokenSpan: 4,
  }),
  [COMPILER_DEPTHS.DEEP]: Object.freeze({
    id: COMPILER_DEPTHS.DEEP,
    maxWindowSyllables: 5,
    maxWindowTokenSpan: 6,
  }),
  [COMPILER_DEPTHS.PIXELBRAIN]: Object.freeze({
    id: COMPILER_DEPTHS.PIXELBRAIN,
    maxWindowSyllables: 8,
    maxWindowTokenSpan: 12,
    enableLatticeSnapping: true,
  }),
  [COMPILER_DEPTHS.VOID_ECHO]: Object.freeze({
    id: COMPILER_DEPTHS.VOID_ECHO,
    maxWindowSyllables: 10,
    maxWindowTokenSpan: 16,
    destructiveReencoding: true,
  }),
});

/**
 * Resolves a depth string or UI mode to a valid compiler depth.
 */
export function resolveCompilerDepth(input) {
  if (typeof input !== 'string') return DEFAULT_DEPTH;
  
  // 1. Check if input is already a canonical depth
  if (MODE_CONFIGS[input]) return input;
  
  // 2. Map UI mode to required depth
  return MODE_TO_DEPTH[input] || DEFAULT_DEPTH;
}

export function getTruesightAnalysisModeConfig(mode) {
  return MODE_CONFIGS[resolveCompilerDepth(mode)];
}

// Backward compatibility exports
export const TRUESIGHT_ANALYSIS_MODES = COMPILER_DEPTHS;
export const ARCHIVED_MODES = {};
export function resolveTruesightAnalysisMode(mode) { return resolveCompilerDepth(mode); }

