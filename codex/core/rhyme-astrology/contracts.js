import { z } from 'zod';

export const RHYME_ASTROLOGY_API_VERSION = 1;
export const RHYME_ASTROLOGY_QUERY_ROUTE = '/api/rhyme-astrology/query';
export const RHYME_ASTROLOGY_QUERY_MODES = Object.freeze(['word', 'line']);

export const RHYME_ASTROLOGY_QUERY_DEFAULTS = Object.freeze({
  mode: 'word',
  limit: 25,
  minScore: 0.4,
  includeConstellations: true,
  includeDiagnostics: true,
});

export const RHYME_ASTROLOGY_QUERY_LIMITS = Object.freeze({
  textMaxLength: 10000,
  limitMin: 1,
  limitMax: 100,
  minScoreMin: 0,
  minScoreMax: 1,
});

const TRUE_QUERY_VALUES = new Set(['1', 'true', 'on', 'yes']);
const FALSE_QUERY_VALUES = new Set(['0', 'false', 'off', 'no']);

function coerceBooleanQueryValue(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_QUERY_VALUES.has(normalized)) return true;
  if (FALSE_QUERY_VALUES.has(normalized)) return false;
  return fallback;
}

function normalizeModeValue(value) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

const rhymeAstrologyQueryInputSchema = z.object({
  text: z.string().trim().min(1).max(RHYME_ASTROLOGY_QUERY_LIMITS.textMaxLength),
  mode: z.preprocess(
    normalizeModeValue,
    z.enum(RHYME_ASTROLOGY_QUERY_MODES).optional()
  ),
  limit: z.coerce
    .number()
    .int()
    .min(RHYME_ASTROLOGY_QUERY_LIMITS.limitMin)
    .max(RHYME_ASTROLOGY_QUERY_LIMITS.limitMax)
    .optional(),
  minScore: z.coerce
    .number()
    .min(RHYME_ASTROLOGY_QUERY_LIMITS.minScoreMin)
    .max(RHYME_ASTROLOGY_QUERY_LIMITS.minScoreMax)
    .optional(),
  includeConstellations: z.any().optional(),
  includeDiagnostics: z.any().optional(),
});

export function normalizeRhymeAstrologyQuery(rawQuery) {
  const parsed = rhymeAstrologyQueryInputSchema.parse(rawQuery ?? {});
  return {
    text: parsed.text,
    mode: parsed.mode ?? RHYME_ASTROLOGY_QUERY_DEFAULTS.mode,
    limit: parsed.limit ?? RHYME_ASTROLOGY_QUERY_DEFAULTS.limit,
    minScore: parsed.minScore ?? RHYME_ASTROLOGY_QUERY_DEFAULTS.minScore,
    includeConstellations: coerceBooleanQueryValue(
      parsed.includeConstellations,
      RHYME_ASTROLOGY_QUERY_DEFAULTS.includeConstellations
    ),
    includeDiagnostics: coerceBooleanQueryValue(
      parsed.includeDiagnostics,
      RHYME_ASTROLOGY_QUERY_DEFAULTS.includeDiagnostics
    ),
  };
}

export const rhymeAstrologyQueryCompilerSchema = z.object({
  verseIRVersion: z.string(),
  mode: z.string(),
  tokenCount: z.number().int().min(0),
  lineCount: z.number().int().min(0),
  maxWindowSyllables: z.number().int().min(0).optional(),
  maxWindowTokenSpan: z.number().int().min(0).optional(),
  syllableWindowCount: z.number().int().min(0),
  lineBreakStyle: z.string(),
  offsetSemantics: z.string().optional(),
  graphemeAware: z.boolean().optional(),
  graphemeCount: z.number().int().min(0).optional(),
  whitespaceFidelity: z.boolean(),
  source: z.enum(['provided', 'compiled']),
  anchorTokenId: z.number().int().min(0).nullable().optional(),
  anchorLineIndex: z.number().int().min(0).nullable().optional(),
  activeTokenIds: z.array(z.number().int().min(0)).optional(),
  activeWindowIds: z.array(z.number().int().min(0)).optional(),
});

export const rhymeAstrologyQueryPatternSchema = z.object({
  rawText: z.string(),
  tokens: z.array(z.string()),
  resolvedNodes: z.array(z.any()),
  lineEndingSignature: z.string().optional(),
  internalPattern: z.array(z.string()).optional(),
  stressContour: z.string().optional(),
  compiler: rhymeAstrologyQueryCompilerSchema.optional(),
});

export const rhymeAstrologyMatchSchema = z.object({
  nodeId: z.string(),
  token: z.string(),
  overallScore: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

export const rhymeAstrologyConstellationSchema = z.object({
  id: z.string(),
  anchorId: z.string(),
  label: z.string(),
  dominantVowelFamily: z.array(z.string()),
  dominantStressPattern: z.string(),
  members: z.array(z.string()),
  densityScore: z.number().min(0).max(1),
  cohesionScore: z.number().min(0).max(1),
});

export const rhymeAstrologyDiagnosticsSchema = z.object({
  queryTimeMs: z.number().min(0),
  cacheHit: z.boolean(),
  candidateCount: z.number().int().min(0),
});

export const rhymeAstrologyResultSchema = z.object({
  query: rhymeAstrologyQueryPatternSchema,
  topMatches: z.array(rhymeAstrologyMatchSchema),
  constellations: z.array(rhymeAstrologyConstellationSchema),
  diagnostics: rhymeAstrologyDiagnosticsSchema,
});

export function validateRhymeAstrologyResult(value) {
  return rhymeAstrologyResultSchema.parse(value);
}
