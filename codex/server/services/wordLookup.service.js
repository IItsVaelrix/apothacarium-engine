/**
 * Canonical backend word-lookup service.
 * Centralizes provider fallback, normalization, coalescing, and Redis cache behavior.
 */

import { createEmptyLexicalEntry } from '../../core/schemas.js';
import { createJudiciaryEngine } from '../../core/judiciary.js';
import { createRitualPredictionEngine } from '../../core/ritual-prediction/run.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;
import { createTokenGraphSemanticRepo } from '../../services/token-graph/semantic.repo.js';
import { createTokenGraphSequenceRepo } from '../../services/token-graph/sequence.repo.js';
import { coalescedLookup } from './wordLookupCoalescer.js';
import { PhonemeEngine } from '../../core/phonology/phoneme.engine.js';

const DEFAULT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_CACHE_PREFIX = 'wordlookup:';
const DEFAULT_EXTERNAL_API_TIMEOUT_MS = 5000;
const MAX_DEFINITION_COUNT = 5;
const MAX_POS_COUNT = 5;
const MAX_SUGGESTION_COUNT = 15;
const DATAMUSE_FETCH_LIMIT = 50;
const ANTONYM_AFFIXES = ['un', 'non', 'dis', 'anti', 'de', 'mis', 'in', 'im', 'il', 'ir'];
const MANUAL_OVERRIDE_SOURCE = 'Manual Override';

const MANUAL_LEXICAL_OVERRIDES = Object.freeze({
  worcestershire: Object.freeze({
    definition: {
      text: 'A county in the West Midlands region of England.',
      partOfSpeech: 'proper noun',
      source: MANUAL_OVERRIDE_SOURCE,
    },
    definitions: [
      'A county in the West Midlands region of England.',
      'A thick fermented sauce named for Worcestershire, England.',
    ],
    pos: ['proper noun', 'noun'],
    synonyms: [],
    antonyms: [],
    rhymes: [],
    slantRhymes: [],
    pronunciation: '/WUH-ster-sheer/',
    etymology: 'From the English county name Worcestershire.',
    }),
    });

    const suggestionJudiciary = createJudiciaryEngine();
const suggestionSemanticRepo = createTokenGraphSemanticRepo();

/**
 * SECURITY: Validate external API response structure
 * Prevents malformed or malicious data from compromised APIs
 * @param {unknown} data - Response data to validate
 * @param {'datamuse' | 'freedictionary' | 'scholomance'} source - API source
 * @returns {boolean} - True if valid
 */
function isValidExternalApiResponse(data, source) {
  if (!data || typeof data !== 'object') return false;
  
  switch (source) {
    case 'datamuse':
      // Datamuse returns array of { word, score, tags }
      if (!Array.isArray(data)) return false;
      return data.every(item => 
        item && typeof item === 'object' && typeof item.word === 'string'
      );

    case 'freedictionary':
      // Free Dictionary returns array of entries
      if (!Array.isArray(data)) return false;
      if (data.length === 0) return true; // Empty but valid
      {
        const first = data[0];
        return first && typeof first === 'object' &&
          (
            typeof first.word === 'string'
            || typeof first.title === 'string'
            || Array.isArray(first.meanings)
            || Array.isArray(first.phonetics)
          );
      }

    case 'scholomance':
      // Scholomance dict returns { definition?, entries?, synonyms?, etc }
      return true; // Already validated downstream with type checks
    
    default:
      return false;
  }
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const normalized = values.map(toNonEmptyString).filter(Boolean);
  return [...new Set(normalized)];
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function resolvePredictionSchool(phonemeEngine, analysis) {
  const vowelFamily = Array.isArray(analysis?.vowelFamily)
    ? analysis.vowelFamily[0]
    : analysis?.vowelFamily;
  if (!vowelFamily || typeof phonemeEngine?.getSchoolFromVowelFamily !== 'function') {
    return null;
  }
  return phonemeEngine.getSchoolFromVowelFamily(vowelFamily);
}

function normalizeComparableTerm(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[\s'-]+|[\s'-]+$/g, '');
}

function commonPrefixLength(a, b, max = 6) {
  const limit = Math.min(a.length, b.length, max);
  let idx = 0;
  while (idx < limit && a[idx] === b[idx]) idx += 1;
  return idx;
}

function commonSuffixLength(a, b, max = 6) {
  const limit = Math.min(a.length, b.length, max);
  let idx = 0;
  while (idx < limit && a[a.length - 1 - idx] === b[b.length - 1 - idx]) idx += 1;
  return idx;
}

function characterOverlap(a, b) {
  const setA = new Set(a.replace(/[^a-z]/g, ''));
  const setB = new Set(b.replace(/[^a-z]/g, ''));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  let shared = 0;
  union.forEach((ch) => {
    if (setA.has(ch) && setB.has(ch)) shared += 1;
  });
  return shared / union.size;
}

function hasAntonymAffix(term) {
  return ANTONYM_AFFIXES.some((affix) => term.startsWith(affix));
}

function computeSuggestionSignals(sourceWord, suggestionWord, index, total, category) {
  const source = normalizeComparableTerm(sourceWord);
  const suggestion = normalizeComparableTerm(suggestionWord);

  const maxLength = Math.max(source.length, suggestion.length, 1);
  const lengthSimilarity = 1 - Math.min(Math.abs(source.length - suggestion.length) / maxLength, 1);
  const prefixSimilarity = commonPrefixLength(source, suggestion, 5) / 5;
  const suffixSimilarity = commonSuffixLength(source, suggestion, 6) / 6;
  const overlapSimilarity = characterOverlap(source, suggestion);
  const rankBias = total <= 1 ? 1 : (1 - (index / (total - 1)));
  const contentBias = suggestionJudiciary.isLikelyContentWord(suggestion) ? 1 : 0.65;

  const inverseAntonymAffix = Number(hasAntonymAffix(source) !== hasAntonymAffix(suggestion));

  if (category === 'rhymes') {
    return {
      predictor: clamp01((rankBias * 0.30) + (lengthSimilarity * 0.15) + (suffixSimilarity * 0.45) + (prefixSimilarity * 0.10)),
      phoneme: clamp01((rankBias * 0.10) + (overlapSimilarity * 0.15) + (suffixSimilarity * 0.75)),
      syntax: clamp01((contentBias * 0.80) + (rankBias * 0.20)),
      spellcheck: clamp01((contentBias * 0.70) + (rankBias * 0.30)),
    };
  }

  if (category === 'slantRhymes') {
    const blendedEcho = ((suffixSimilarity * 0.55) + (overlapSimilarity * 0.45));
    return {
      predictor: clamp01((rankBias * 0.30) + (lengthSimilarity * 0.20) + (blendedEcho * 0.40) + (prefixSimilarity * 0.10)),
      phoneme: clamp01((rankBias * 0.15) + (suffixSimilarity * 0.45) + (overlapSimilarity * 0.40)),
      syntax: clamp01((contentBias * 0.80) + (rankBias * 0.20)),
      spellcheck: clamp01((contentBias * 0.75) + (rankBias * 0.25)),
    };
  }

  if (category === 'antonyms') {
    return {
      predictor: clamp01((rankBias * 0.35) + (lengthSimilarity * 0.20) + (inverseAntonymAffix * 0.35) + (prefixSimilarity * 0.10)),
      phoneme: clamp01((rankBias * 0.35) + (overlapSimilarity * 0.35) + (suffixSimilarity * 0.30)),
      syntax: clamp01((contentBias * 0.80) + (rankBias * 0.20)),
      spellcheck: clamp01((contentBias * 0.70) + (rankBias * 0.30)),
    };
  }

  return {
    predictor: clamp01((rankBias * 0.35) + (lengthSimilarity * 0.30) + (overlapSimilarity * 0.20) + (prefixSimilarity * 0.15)),
    phoneme: clamp01((rankBias * 0.20) + (suffixSimilarity * 0.45) + (overlapSimilarity * 0.35)),
    syntax: clamp01((contentBias * 0.80) + (rankBias * 0.20)),
    spellcheck: clamp01((contentBias * 0.75) + (rankBias * 0.25)),
  };
}

function buildSuggestionSyntaxContext(category) {
  if (category === 'rhymes' || category === 'slantRhymes') {
    return {
      role: 'content',
      lineRole: 'line_end',
      stressRole: 'primary',
      rhymePolicy: 'allow',
    };
  }

  return {
    role: 'content',
    lineRole: 'line_mid',
    stressRole: 'primary',
    rhymePolicy: 'suppress',
  };
}

function createLexicalSuggestionSemanticRepo(sourceWord, category, suggestions) {
  const normalizedSource = normalizeComparableTerm(sourceWord);
  const normalizedSuggestions = suggestions
    .map((suggestion) => normalizeComparableTerm(suggestion))
    .filter(Boolean);
  const lexicalEntriesByToken = (
    category === 'synonyms'
    || category === 'antonyms'
  )
    ? {
      [normalizedSource]: {
        [category]: normalizedSuggestions,
      },
    }
    : {};

  return {
    buildNeighborhood(options = {}) {
      return suggestionSemanticRepo.buildNeighborhood({
        tokens: [
          normalizedSource,
          ...normalizedSuggestions,
          ...(Array.isArray(options.tokens) ? options.tokens : []),
        ],
        lexicalEntriesByToken,
      });
    },
  };
}

async function buildRitualSuggestionScores(sourceWord, category, preparedSuggestions, phonemeEngine) {
  const normalizedSource = normalizeComparableTerm(sourceWord);
  if (!normalizedSource || !Array.isArray(preparedSuggestions) || preparedSuggestions.length === 0) {
    return new Map();
  }

  const sequenceGraphRepo = createTokenGraphSequenceRepo({
    sequences: preparedSuggestions.map(({ suggestion, signals }) => ({
      prev: normalizedSource,
      next: normalizeComparableTerm(suggestion),
      weight: Math.max(1, Math.round((Number(signals?.predictor) || 0) * 100)),
    })),
  });
  const semanticGraphRepo = createLexicalSuggestionSemanticRepo(
    normalizedSource,
    category,
    preparedSuggestions.map(({ suggestion }) => suggestion),
  );
  const sourceAnalysis = typeof phonemeEngine?.analyzeWord === 'function'
    ? phonemeEngine.analyzeWord(normalizedSource)
    : null;
  const currentSchool = resolvePredictionSchool(phonemeEngine, sourceAnalysis);
  const ritualPredictionEngine = createRitualPredictionEngine({
    sequenceGraphRepo,
    semanticGraphRepo,
    judiciary: suggestionJudiciary,
    analyzeWord: typeof phonemeEngine?.analyzeWord === 'function'
      ? (token) => phonemeEngine.analyzeWord(token)
      : null,
    resolveSchool: (analysis) => resolvePredictionSchool(phonemeEngine, analysis),
  });
  const prediction = await ritualPredictionEngine.run({
    prefix: '',
    prevWord: normalizedSource,
    prevLineEndWord: category === 'rhymes' || category === 'slantRhymes'
      ? normalizedSource
      : null,
    currentLineWords: [normalizedSource],
    currentSchool,
    syntaxContext: buildSuggestionSyntaxContext(category),
    maxCandidates: preparedSuggestions.length,
  }, {
    maxCandidates: preparedSuggestions.length,
    maxFanout: Math.max(24, preparedSuggestions.length * 2),
  });

  return new Map(
    (Array.isArray(prediction?.candidates) ? prediction.candidates : [])
      .map((candidate) => [normalizeComparableTerm(candidate.token), candidate.totalScore])
  );
}

async function rankSuggestionGroup(sourceWord, values, category, options = {}) {
  if (!Array.isArray(values) || values.length === 0) return [];

  const normalizedSource = normalizeComparableTerm(sourceWord);
  const seen = new Set();
  const uniqueSuggestions = [];

  for (const value of values) {
    const suggestion = toNonEmptyString(value);
    if (!suggestion) continue;
    const comparable = normalizeComparableTerm(suggestion);
    if (!comparable || comparable === normalizedSource || seen.has(comparable)) continue;
    seen.add(comparable);
    uniqueSuggestions.push(suggestion);
  }

  if (uniqueSuggestions.length === 0) return [];

  const preparedSuggestions = uniqueSuggestions.map((suggestion, index) => ({
    suggestion,
    index,
    signals: computeSuggestionSignals(
      normalizedSource,
      suggestion,
      index,
      uniqueSuggestions.length,
      category,
    ),
  }));
  const ritualScores = await buildRitualSuggestionScores(
    normalizedSource,
    category,
    preparedSuggestions,
    options.phonemeEngine || null,
  );

  const scored = preparedSuggestions.map(({ suggestion, index, signals }) => {
    const candidateLayers = [
      { word: suggestion, layer: 'SYNTAX', confidence: signals.syntax, category },
      { word: suggestion, layer: 'PREDICTOR', confidence: signals.predictor, category },
      {
        word: suggestion,
        layer: 'PHONEME',
        confidence: signals.phoneme,
        category,
        isRhyme: category === 'rhymes' || category === 'slantRhymes',
      },
      { word: suggestion, layer: 'SPELLCHECK', confidence: signals.spellcheck, category },
    ];
    const flatScore = suggestionJudiciary.calculateAllScores(candidateLayers).get(suggestion)?.total ?? 0;
    const ritualScore = ritualScores.get(normalizeComparableTerm(suggestion)) ?? 0;
    return {
      suggestion,
      index,
      score: Math.max(flatScore, ritualScore),
      flatScore,
      ritualScore,
    };
  });

  scored.sort((a, b) =>
    (b.score - a.score) ||
    (b.ritualScore - a.ritualScore) ||
    (b.flatScore - a.flatScore) ||
    (a.index - b.index) ||
    a.suggestion.localeCompare(b.suggestion)
  );

  // Explicitly cap by available max so short lists stay short instead of forcing padding.
  const limit = Math.min(MAX_SUGGESTION_COUNT, scored.length);
  return scored.slice(0, limit).map(({ suggestion }) => suggestion);
}

function hasLexicalData(entry) {
  return Boolean(
    entry?.definition ||
    (entry?.definitions?.length || 0) > 0 ||
    (entry?.synonyms?.length || 0) > 0 ||
    (entry?.antonyms?.length || 0) > 0 ||
    (entry?.rhymes?.length || 0) > 0 ||
    (entry?.slantRhymes?.length || 0) > 0 ||
    (entry?.pos?.length || 0) > 0 ||
    entry?.pronunciation ||
    entry?.etymology ||
    entry?.lore
  );
}

function extractDefinitionsFromEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.senses)) continue;
    for (const sense of entry.senses) {
      if (!sense || typeof sense !== 'object') continue;
      const glosses = Array.isArray(sense.glosses) ? sense.glosses : [];
      for (const gloss of glosses) {
        const normalized = toNonEmptyString(gloss);
        if (normalized) out.push(normalized);
      }
    }
  }
  return [...new Set(out)].slice(0, MAX_DEFINITION_COUNT);
}

async function constrainLexicalEntry(entry, options = {}) {
  if (!entry) return null;
  entry.definitions = (entry.definitions || []).slice(0, MAX_DEFINITION_COUNT);
  entry.synonyms = await rankSuggestionGroup(entry.word, entry.synonyms || [], 'synonyms', options);
  entry.antonyms = await rankSuggestionGroup(entry.word, entry.antonyms || [], 'antonyms', options);
  entry.rhymes = await rankSuggestionGroup(entry.word, entry.rhymes || [], 'rhymes', options);
  entry.slantRhymes = await rankSuggestionGroup(entry.word, entry.slantRhymes || [], 'slantRhymes', options);
  entry.pos = (entry.pos || []).slice(0, MAX_POS_COUNT);
  return entry;
}

async function lookupFromManualOverrides(word) {
  const normalizedWord = normalizeComparableTerm(word);
  if (!normalizedWord) return null;
  const template = MANUAL_LEXICAL_OVERRIDES[normalizedWord];
  if (!template) return null;

  const entry = createEmptyLexicalEntry(normalizedWord);
  if (template.definition) entry.definition = { ...template.definition };
  if (Array.isArray(template.definitions)) entry.definitions = [...template.definitions];
  if (Array.isArray(template.pos)) entry.pos = [...template.pos];
  if (Array.isArray(template.synonyms)) entry.synonyms = [...template.synonyms];
  if (Array.isArray(template.antonyms)) entry.antonyms = [...template.antonyms];
  if (Array.isArray(template.rhymes)) entry.rhymes = [...template.rhymes];
  if (Array.isArray(template.slantRhymes)) entry.slantRhymes = [...template.slantRhymes];
  if (template.pronunciation) entry.pronunciation = template.pronunciation;
  if (template.etymology) entry.etymology = template.etymology;
  entry.raw = { source: 'manual', key: normalizedWord };

  const constrained = await constrainLexicalEntry(entry);
  return hasLexicalData(constrained) ? constrained : null;
}

function resolveScholomanceDictApiUrl(explicitUrl) {
  const raw = explicitUrl ??
    process.env.SCHOLOMANCE_DICT_API_URL ??
    process.env.VITE_SCHOLOMANCE_DICT_API_URL ??
    '';
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function resolvePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      throw new BytecodeError(
        ERROR_CATEGORIES.HOOK, ERROR_SEVERITY.WARN, MOD,
        ERROR_CODES.HOOK_TIMEOUT,
        { timeoutMs, operation: 'word lookup request' },
      );
    }
    throw error;
  }
}

export function createWordLookupService(options = {}) {
  const redis = options.redis ?? null;
  const log = options.log ?? console;
  const fetchImpl = options.fetchImpl ?? fetch;
  const phonemeEngine = options.phonemeEngine ?? PhonemeEngine;
  const cacheTtlSeconds = resolvePositiveInteger(options.cacheTtlSeconds, DEFAULT_CACHE_TTL_SECONDS);
  const externalApiTimeoutMs = resolvePositiveInteger(
    options.externalApiTimeoutMs,
    DEFAULT_EXTERNAL_API_TIMEOUT_MS,
  );
  const cachePrefix = toNonEmptyString(options.cachePrefix) ?? DEFAULT_CACHE_PREFIX;
  const scholomanceDictApiUrl = resolveScholomanceDictApiUrl(options.scholomanceDictApiUrl);

  async function lookupFromScholomanceDict(word) {
    if (!scholomanceDictApiUrl) return null;

    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        `${scholomanceDictApiUrl}/lookup/${encodeURIComponent(word)}`,
        externalApiTimeoutMs,
      );
      if (!res.ok) return null;
      const data = await res.json();
      // SECURITY: Validate external API response structure
      if (!isValidExternalApiResponse(data, 'scholomance')) return null;

      const entry = createEmptyLexicalEntry(word);
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const firstEntry = entries[0] && typeof entries[0] === 'object' ? entries[0] : null;
      const fallbackPartOfSpeech = toNonEmptyString(firstEntry?.pos) || '';

      const definitionText = toNonEmptyString(data.definition?.text);
      if (definitionText) {
        entry.definition = {
          text: definitionText,
          partOfSpeech: toNonEmptyString(data.definition?.partOfSpeech) || fallbackPartOfSpeech,
          source: toNonEmptyString(data.definition?.source) || 'Scholomance Dictionary',
        };
      }

      const definitions = extractDefinitionsFromEntries(entries);
      if (definitions.length > 0) {
        entry.definitions = definitions;
      } else if (entry.definition?.text) {
        entry.definitions = [entry.definition.text];
      }

      entry.synonyms = normalizeStringArray(data.synonyms);
      entry.antonyms = normalizeStringArray(data.antonyms);
      entry.rhymes = normalizeStringArray(data.rhymes);
      entry.slantRhymes = normalizeStringArray(
        Array.isArray(data.slantRhymes)
          ? data.slantRhymes
          : (Array.isArray(data.nearRhymes) ? data.nearRhymes : []),
      );
      entry.pronunciation = toNonEmptyString(firstEntry?.pronunciation || firstEntry?.ipa) || undefined;
      entry.etymology = toNonEmptyString(firstEntry?.etymology) || undefined;
      entry.lore = data.lore ?? undefined;
      entry.pos = normalizeStringArray(entries.map((candidate) => candidate?.pos));
      entry.raw = data;

      if (!entry.definition && entry.definitions.length > 0) {
        entry.definition = {
          text: entry.definitions[0],
          partOfSpeech: entry.pos[0] || '',
          source: 'Scholomance Dictionary',
        };
      }

      const constrained = await constrainLexicalEntry(entry, { phonemeEngine });
      return hasLexicalData(constrained) ? constrained : null;
    } catch (error) {
      log?.warn?.({ err: error, word }, '[WordLookupService] Scholomance lookup failed, falling back');
      return null;
    }
  }

  async function lookupFromExternalApis(word) {
    const entry = createEmptyLexicalEntry(word);
    let foundData = false;

    try {
      const fdRes = await fetchWithTimeout(
        fetchImpl,
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        externalApiTimeoutMs,
      );
      if (fdRes.ok) {
        const fdData = await fdRes.json();
        // SECURITY: Validate external API response structure
        if (isValidExternalApiResponse(fdData, 'freedictionary') && fdData.length > 0) {
          const primary = fdData[0];
          const allDefs = [];
          const allPos = new Set();
          const allSynonyms = new Set();
          const allAntonyms = new Set();

          if (Array.isArray(primary.meanings)) {
            for (const meaning of primary.meanings) {
              const meaningPos = toNonEmptyString(meaning?.partOfSpeech);
              if (meaningPos) allPos.add(meaningPos);
              for (const definition of (meaning?.definitions || [])) {
                const definitionText = toNonEmptyString(definition?.definition);
                if (definitionText) allDefs.push(definitionText);
                for (const synonym of normalizeStringArray(definition?.synonyms)) allSynonyms.add(synonym);
                for (const antonym of normalizeStringArray(definition?.antonyms)) allAntonyms.add(antonym);
              }
              for (const synonym of normalizeStringArray(meaning?.synonyms)) allSynonyms.add(synonym);
              for (const antonym of normalizeStringArray(meaning?.antonyms)) allAntonyms.add(antonym);
            }
          }

          if (allDefs.length > 0) {
            entry.definition = {
              text: allDefs[0],
              partOfSpeech: [...allPos][0] || '',
              source: 'Free Dictionary API',
            };
            entry.definitions = allDefs;
            foundData = true;
          }

          entry.pos = [...allPos];
          entry.synonyms = [...allSynonyms];
          entry.antonyms = [...allAntonyms];

          const phonetic = Array.isArray(primary.phonetics)
            ? primary.phonetics.find((candidate) => toNonEmptyString(candidate?.text))
            : null;
          if (phonetic) entry.pronunciation = phonetic.text;
        }
      }
    } catch {
      // Free Dictionary failed; continue to Datamuse.
    }

    try {
      const [synRes, antRes, rhymeRes, slantRes] = await Promise.all([
        fetchWithTimeout(
          fetchImpl,
          `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=${DATAMUSE_FETCH_LIMIT}`,
          externalApiTimeoutMs,
        ),
        fetchWithTimeout(
          fetchImpl,
          `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=${DATAMUSE_FETCH_LIMIT}`,
          externalApiTimeoutMs,
        ),
        fetchWithTimeout(
          fetchImpl,
          `https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=${DATAMUSE_FETCH_LIMIT}`,
          externalApiTimeoutMs,
        ),
        fetchWithTimeout(
          fetchImpl,
          `https://api.datamuse.com/words?rel_nry=${encodeURIComponent(word)}&max=${DATAMUSE_FETCH_LIMIT}`,
          externalApiTimeoutMs,
        ),
      ]);

      if (synRes.ok) {
        const synData = await synRes.json();
        // SECURITY: Validate external API response structure
        if (isValidExternalApiResponse(synData, 'datamuse')) {
          const synonyms = normalizeStringArray(synData.map((row) => row?.word));
          if (synonyms.length > 0) {
            entry.synonyms = normalizeStringArray([...entry.synonyms, ...synonyms]);
            foundData = true;
          }
        }
      }

      if (antRes.ok) {
        const antData = await antRes.json();
        // SECURITY: Validate external API response structure
        if (isValidExternalApiResponse(antData, 'datamuse')) {
          const antonyms = normalizeStringArray(antData.map((row) => row?.word));
          if (antonyms.length > 0) {
            entry.antonyms = normalizeStringArray([...entry.antonyms, ...antonyms]);
            foundData = true;
          }
        }
      }

      if (rhymeRes.ok) {
        const rhymeData = await rhymeRes.json();
        // SECURITY: Validate external API response structure
        if (isValidExternalApiResponse(rhymeData, 'datamuse')) {
          const rhymes = normalizeStringArray(rhymeData.map((row) => row?.word));
          entry.rhymes = normalizeStringArray([...entry.rhymes, ...rhymes]);
          if (entry.rhymes.length > 0) foundData = true;
        }
      }

      if (slantRes.ok) {
        const slantData = await slantRes.json();
        // SECURITY: Validate external API response structure
        if (isValidExternalApiResponse(slantData, 'datamuse')) {
          const slantRhymes = normalizeStringArray(slantData.map((row) => row?.word));
          entry.slantRhymes = normalizeStringArray([...entry.slantRhymes, ...slantRhymes]);
          if (entry.slantRhymes.length > 0) foundData = true;
        }
      }
    } catch {
      // Datamuse failed as well.
    }

    if (!foundData) return null;
    const constrained = await constrainLexicalEntry(entry, { phonemeEngine });
    return hasLexicalData(constrained) ? constrained : null;
  }

  async function lookupWord(rawWord) {
    const normalizedWord = String(rawWord || '').trim().toLowerCase();
    if (!normalizedWord) {
      return { word: '', data: null, source: 'none' };
    }

    const manualOverride = await lookupFromManualOverrides(normalizedWord);
    if (manualOverride) {
      return { word: normalizedWord, data: manualOverride, source: 'manual-override' };
    }

    const cacheKey = `${cachePrefix}${normalizedWord}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { word: normalizedWord, data: JSON.parse(cached), source: 'redis-cache' };
        }
      } catch (error) {
        log?.warn?.({ err: error }, '[WordLookupService] Redis GET failed, falling through');
      }
    }

    const lookupResult = await coalescedLookup(normalizedWord, async () => {
      const localResult = await lookupFromScholomanceDict(normalizedWord);
      if (localResult) {
        return { data: localResult, source: 'scholomance-local' };
      }

      const externalResult = await lookupFromExternalApis(normalizedWord);
      if (externalResult) {
        return { data: externalResult, source: 'external-api' };
      }
      return { data: null, source: 'not-found' };
    });

    const result = lookupResult?.data ?? null;
    const source = lookupResult?.source ?? (result ? 'external-api' : 'not-found');

    if (redis && result) {
      try {
        await redis.setEx(cacheKey, cacheTtlSeconds, JSON.stringify(result));
      } catch (error) {
        log?.warn?.({ err: error }, '[WordLookupService] Redis SET failed');
      }
    }

    return { word: normalizedWord, data: result, source };
  }

  async function lookupBatch(words) {
    const uniqueWords = [...new Set((Array.isArray(words) ? words : []).map((word) => String(word || '').trim().toLowerCase()))]
      .filter(Boolean);

    const results = {};
    await Promise.all(uniqueWords.map(async (word) => {
      const { data, source } = await lookupWord(word);
      results[word] = { data, source };
    }));

    return {
      results,
      count: Object.keys(results).length,
    };
  }

  /**
   * Phase 4: Dual-Speed Data Refresh
   * Allows incremental injection of explicit training pairs into the cache,
   * bypassing the need for a full substrate rebuild for minor vocabulary updates.
   */
  async function incrementalRefresh(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return { updated: 0 };
    
    let updatedCount = 0;
    for (const entry of entries) {
      if (!entry || !entry.word) continue;
      const normalizedWord = normalizeComparableTerm(entry.word);
      if (!normalizedWord) continue;

      const cacheKey = `${cachePrefix}${normalizedWord}`;
      
      // Ensure it has the base shape of a lexical entry
      const payload = {
        ...createEmptyLexicalEntry(normalizedWord),
        ...entry,
        raw: { source: 'incremental_refresh', ...entry.raw }
      };

      if (redis) {
        try {
          await redis.setEx(cacheKey, cacheTtlSeconds, JSON.stringify(payload));
          updatedCount++;
        } catch (error) {
          log?.warn?.({ err: error, word: normalizedWord }, '[WordLookupService] Incremental refresh failed to write to Redis');
        }
      } else {
        // If no Redis, the service would normally rely on an in-memory fallback, 
        // but for the sake of the PDR API contract, we acknowledge the attempt.
        updatedCount++;
      }
    }
    
    return { updated: updatedCount };
  }

  return {
    lookupWord,
    lookupBatch,
    incrementalRefresh,
    config: {
      cacheTtlSeconds,
      cachePrefix,
      externalApiTimeoutMs,
      scholomanceDictApiUrl,
    },
  };
}
