/**
 * Canonical backend service for Read-page panel analysis payloads.
 * Produces unified data for rhyme/scheme, score, and vowel-family panels.
 */

import { existsSync, readFileSync } from 'node:fs';
import { WORD_REGEX_GLOBAL } from '../../core/constants/regex.js';
import { analyzeText } from '../../core/analysis.pipeline.js';
import { createDefaultScoringEngine } from '../../core/scoring.defaults.js';
import { buildPlsPhoneticFeatures } from '../../core/rhyme-astrology/scoring.js';
import { PhonemeEngine } from '../../core/phonology/phoneme.engine.js';
import { DeepRhymeEngine } from '../../core/rhyme-astrology/deepRhyme.engine.js';
import { detectScheme, analyzeMeter } from '../../core/shared/rhymeScheme.detector.js';
import { analyzeLiteraryDevices, detectEmotionDetailed } from '../../core/shared/literaryDevices.detector.js';
import { normalizeVowelFamily } from '../../core/phonology/vowelFamily.js';
import { buildSyntaxLayer } from '../../core/shared/syntax.layer.js';
import { buildHiddenHarkovSummary } from '../../core/shared/models/harkov.model.js';
import { LiteraryClassifier } from '../../core/shared/literaryClassifier.js';
import { compileVerseToIR } from '../../core/shared/truesight/compiler/compileVerseToIR.js';
import { parseBooleanFlag } from '../utils/envFlags.js';
import { createRhymeAstrologyQueryEngine } from '../../runtime/rhyme-astrology/queryEngine.js';
import { createRhymeAstrologyLexiconRepo } from '../../services/rhyme-astrology/lexiconRepo.js';
import { createRhymeAstrologyIndexRepo } from '../../services/rhyme-astrology/indexRepo.js';
import { attachVerseIRAmplifier } from '../../core/verseir-amplifier/index.js';
import { enhanceVerseIRWithServerPolicy } from './verseirAmplifier.service.js';
import { createPhonemicOracleService } from './phonemicOracle.service.js';
import { resolveRhymeAstrologyArtifactPaths } from '../utils/rhymeAstrologyPaths.js';

const EMPTY_VOWEL_SUMMARY = Object.freeze({
  families: [],
  totalWords: 0,
  uniqueWords: 0,
});

const DEFAULT_RHYME_ASTROLOGY_ANCHOR_LIMIT = 14;
const DEFAULT_RHYME_ASTROLOGY_MATCH_LIMIT = 6;
const DEFAULT_RHYME_ASTROLOGY_MIN_SCORE = 0.35;
const DEFAULT_RHYME_ASTROLOGY_MAX_CLUSTERS = 4;
const DEFAULT_RHYME_ASTROLOGY_BUCKET_CAP = 200;
const DEFAULT_RHYME_ASTROLOGY_CACHE_SIZE = 500;
const DEFAULT_RHYME_ASTROLOGY_WINDOW_LIMIT = 12;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

function parseScore(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function loadGutenbergEmotionPriors(priorsPath, log) {
  if (!priorsPath || !existsSync(priorsPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(priorsPath, 'utf8'));
    const emotions = parsed?.emotions;
    if (!emotions || typeof emotions !== 'object') return null;

    return {
      version: Number(parsed?.version) || 1,
      generatedAt: String(parsed?.generatedAt || ''),
      emotions,
    };
  } catch (error) {
    log?.warn?.({ err: error, priorsPath }, '[PanelAnalysisService] Failed to load emotion priors');
    return null;
  }
}

function getPrimaryStressedVowelFamily(analysis, fallbackVowelFamily = null) {
  const syllables = Array.isArray(analysis?.syllables)
    ? analysis.syllables
    : [];
  const stressed = syllables.find((syllable) => Number(syllable?.stress) > 0) || syllables[0];
  return normalizeVowelFamily(stressed?.vowelFamily || fallbackVowelFamily);
}

function buildAnalysisWordProfiles(analysis, syntaxLayer = null, verseIR = null) {
  const lines = Array.isArray(analysis?.lines) ? analysis.lines : [];
  const profiles = [];

  // Build a lookup for VerseIR tokens by charStart for authoritative bytecode
  const verseTokenByCharStart = new Map();
  if (Array.isArray(verseIR?.tokens)) {
    for (const token of verseIR.tokens) {
      if (Number.isInteger(token?.charStart)) {
        verseTokenByCharStart.set(token.charStart, token);
      }
    }
  }

  for (const line of lines) {
    const lineIndex = Number.isInteger(line?.lineIndex) ? line.lineIndex : 0;
    const words = Array.isArray(line?.words) ? line.words : [];
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const analyzedWord = words[wordIndex];
      const charStart = Number.isInteger(analyzedWord?.charStart) ? analyzedWord.charStart : -1;
      const syntaxIdentity = `${lineIndex}:${wordIndex}:${charStart}`;
      const syntaxToken = syntaxLayer
        ? (
          syntaxLayer.tokenByIdentity?.get?.(syntaxIdentity) ||
          syntaxLayer.tokenByCharStart?.get?.(charStart) ||
          null
        )
        : null;

      const verseToken = verseTokenByCharStart.get(charStart);

      profiles.push({
        word: String(analyzedWord?.word || ''),
        normalizedWord: String(analyzedWord?.normalizedWord || analyzedWord?.word || '').toUpperCase(),
        lineIndex,
        wordIndex,
        charStart,
        charEnd: Number.isInteger(analyzedWord?.charEnd) ? analyzedWord.charEnd : -1,
        vowelFamily: getPrimaryStressedVowelFamily(analyzedWord?.analysis, analyzedWord?.vowelFamily) || null,
        syllableCount: Number(analyzedWord?.syllableCount) || 0,
        rhymeKey: analyzedWord?.rhymeKey || analyzedWord?.analysis?.rhymeKey || null,
        stressPattern: String(analyzedWord?.stressPattern || analyzedWord?.analysis?.stressPattern || ''),
        phonemes: Array.isArray(analyzedWord?.phonemes) ? analyzedWord.phonemes : (Array.isArray(analyzedWord?.analysis?.phonemes) ? analyzedWord.analysis.phonemes : (Array.isArray(verseToken?.phonemes) ? verseToken.phonemes : [])),
        role: String(syntaxToken?.role || ''),
        lineRole: String(syntaxToken?.lineRole || ''),
        stressRole: String(syntaxToken?.stressRole || ''),
        rhymePolicy: String(syntaxToken?.rhymePolicy || ''),
        visualBytecode: verseToken?.visualBytecode || null,
        trueVisionBytecode: verseToken?.trueVisionBytecode || null,
      });
    }
  }

  return profiles;
}

function buildLineSyllableCounts(analysis) {
  const lines = Array.isArray(analysis?.lines) ? analysis.lines : [];
  return lines.map((line) => Number(line?.syllableTotal) || 0);
}

function toSerializableGroupEntries(value) {
  const map = value instanceof Map
    ? value
    : Array.isArray(value)
      ? new Map(value.filter((entry) => Array.isArray(entry) && entry.length === 2))
      : new Map();

  return Array.from(map.entries()).map(([group, lineIndices]) => [
    String(group),
    Array.isArray(lineIndices)
      ? lineIndices.filter((lineIndex) => Number.isInteger(lineIndex))
      : [],
  ]);
}

function summarizeVowelFamilies(analyzedDoc) {
  if (!analyzedDoc || !Array.isArray(analyzedDoc.allWords)) {
    return EMPTY_VOWEL_SUMMARY;
  }

  const familyCounts = new Map();
  const uniqueWords = new Set();

  for (const analyzedWord of analyzedDoc.allWords) {
    const normalized = String(analyzedWord?.normalized || '').trim().toUpperCase();
    if (normalized) {
      uniqueWords.add(normalized);
    }

    const familyId = normalizeVowelFamily(analyzedWord?.phonetics?.vowelFamily);
    if (!familyId) continue;
    familyCounts.set(familyId, (familyCounts.get(familyId) || 0) + 1);
  }

  const totalWords = Array.from(familyCounts.values()).reduce((sum, count) => sum + count, 0);

  const families = Array.from(familyCounts.entries())
    .map(([id, count]) => ({
      id,
      count,
      percent: totalWords > 0 ? count / totalWords : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.id.localeCompare(b.id);
    });

  return {
    families,
    totalWords,
    uniqueWords: uniqueWords.size,
  };
}

function toMinimalAnalysisPayload(
  analysis,
  wordAnalyses,
  lineSyllableCounts,
  verseIRAmplifier = null,
  schoolWeights = {},
  dominantSchool = null
) {
  if (!analysis || typeof analysis !== 'object') {
    return null;
  }

  return {
    allConnections: Array.isArray(analysis.allConnections) ? analysis.allConnections : [],
    statistics: analysis.statistics || null,
    schemePattern: typeof analysis.schemePattern === 'string' ? analysis.schemePattern : '',
    rhymeGroups: toSerializableGroupEntries(analysis.rhymeGroups),
    schoolWeights: schoolWeights && typeof schoolWeights === 'object' ? schoolWeights : {},
    dominantSchool: typeof dominantSchool === 'string' ? dominantSchool : null,
    syntaxSummary: analysis.syntaxSummary || null,
    compiler: analysis.compiler || null,
    wordAnalyses: Array.isArray(wordAnalyses) ? wordAnalyses : [],
    lineSyllableCounts: Array.isArray(lineSyllableCounts) ? lineSyllableCounts : [],
    verseIRAmplifier: verseIRAmplifier && typeof verseIRAmplifier === 'object' ? verseIRAmplifier : null,
  };
}

function createEmptyPanelPayload() {
  return {
    analysis: null,
    scheme: null,
    meter: null,
    literaryDevices: [],
    genreProfile: null,
    emotion: 'Neutral',
    scoreData: null,
    vowelSummary: EMPTY_VOWEL_SUMMARY,
    rhymeAstrology: null,
    narrativeAMP: null,
    oracle: null,
  };
}

function toLegacyOraclePayload(narrativeAMP) {
  if (!narrativeAMP || typeof narrativeAMP !== 'object') {
    return null;
  }

  return {
    version: String(narrativeAMP.version || ''),
    persona: String(narrativeAMP.narrator || 'VerseIR Narrative AMP'),
    mood: String(narrativeAMP.mood || 'OBSERVANT'),
    summary: String(narrativeAMP.summary || ''),
    insights: Array.isArray(narrativeAMP.beats)
      ? narrativeAMP.beats.map((beat) => ({
        id: String(beat?.id || beat?.message || ''),
        category: String(beat?.tone || 'TECHNICAL'),
        message: String(beat?.message || ''),
        evidence: Array.isArray(beat?.evidence) ? beat.evidence : [],
        ...(Number.isFinite(Number(beat?.signal))
          ? { scoreImpact: Number(Number(beat.signal).toFixed(3)) }
          : {}),
      }))
      : [],
    suggestions: Array.isArray(narrativeAMP.revisions)
      ? narrativeAMP.revisions.map((revision) => ({
        original: String(revision?.original || ''),
        suggested: String(revision?.suggested || ''),
        reason: String(revision?.reason || ''),
        resonanceGain: Number.isFinite(Number(revision?.resonanceGain))
          ? Number(Number(revision.resonanceGain).toFixed(3))
          : 0,
      }))
      : [],
  };
}

function normalizeInputText(rawText) {
  if (typeof rawText === 'string') return rawText;
  if (rawText === null || rawText === undefined) return '';
  return String(rawText);
}

function buildWordProfileIndexes(wordAnalyses) {
  const byIdentity = new Map();
  const byCharStart = new Map();
  for (const profile of Array.isArray(wordAnalyses) ? wordAnalyses : []) {
    const lineIndex = Number(profile?.lineIndex);
    const wordIndex = Number(profile?.wordIndex);
    const charStart = Number(profile?.charStart);
    if (Number.isInteger(lineIndex) && Number.isInteger(wordIndex) && Number.isInteger(charStart)) {
      byIdentity.set(`${lineIndex}:${wordIndex}:${charStart}`, profile);
      byCharStart.set(charStart, profile);
    }
  }
  return {
    byIdentity,
    byCharStart,
  };
}

function buildWindowIdsByTokenId(verseIR) {
  const windows = Array.isArray(verseIR?.syllableWindows) ? verseIR.syllableWindows : [];
  const map = new Map();
  for (const window of windows) {
    const tokenSpan = Array.isArray(window?.tokenSpan) ? window.tokenSpan : [];
    if (tokenSpan.length !== 2) continue;
    const start = Number(tokenSpan[0]);
    const end = Number(tokenSpan[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    for (let tokenId = start; tokenId <= end; tokenId += 1) {
      if (!map.has(tokenId)) map.set(tokenId, []);
      map.get(tokenId).push(Number(window.id));
    }
  }
  return map;
}

function buildAnchorCompilerRef(token, activeWindowIds = []) {
  const tokenId = Number.isInteger(Number(token?.id)) ? Number(token.id) : -1;
  return {
    tokenId,
    lineIndex: Number.isInteger(Number(token?.lineIndex)) ? Number(token.lineIndex) : -1,
    tokenIndexInLine: Number.isInteger(Number(token?.tokenIndexInLine)) ? Number(token.tokenIndexInLine) : -1,
    tokenSpan: [tokenId, tokenId],
    activeWindowIds: activeWindowIds.filter((value) => Number.isInteger(Number(value))).map(Number),
    charStart: Number.isInteger(Number(token?.charStart)) ? Number(token.charStart) : -1,
    charEnd: Number.isInteger(Number(token?.charEnd)) ? Number(token.charEnd) : -1,
    syllableCount: Number(token?.syllableCount) || 0,
    stressPattern: String(token?.stressPattern || ''),
    rhymeTailSignature: String(token?.rhymeTailSignature || ''),
    primaryStressedVowelFamily: normalizeVowelFamily(token?.primaryStressedVowelFamily) || null,
    terminalVowelFamily: normalizeVowelFamily(token?.terminalVowelFamily) || null,
    isLineStart: Boolean(token?.flags?.isLineStart),
    isLineEnd: Boolean(token?.flags?.isLineEnd),
  };
}

function buildRhymeAstrologyAnchorCandidates(wordAnalyses, verseIR, maxAnchors) {
  const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
  if (tokens.length === 0) return [];

  const { byIdentity, byCharStart } = buildWordProfileIndexes(wordAnalyses);
  const windowIdsByTokenId = buildWindowIdsByTokenId(verseIR);
  const tokenProfiles = tokens.map((token) => {
    const identity = `${Number(token?.lineIndex)}:${Number(token?.tokenIndexInLine)}:${Number(token?.charStart)}`;
    const profile = byIdentity.get(identity) || byCharStart.get(Number(token?.charStart)) || null;
    const activeWindowIds = windowIdsByTokenId.get(Number(token?.id)) || [];
    return {
      word: String(profile?.word || token?.text || ''),
      normalizedWord: String(profile?.normalizedWord || token?.normalizedUpper || token?.normalized || '').toUpperCase(),
      lineIndex: Number.isInteger(Number(token?.lineIndex)) ? Number(token.lineIndex) : -1,
      wordIndex: Number.isInteger(Number(token?.tokenIndexInLine)) ? Number(token.tokenIndexInLine) : -1,
      charStart: Number.isInteger(Number(token?.charStart)) ? Number(token.charStart) : -1,
      charEnd: Number.isInteger(Number(token?.charEnd)) ? Number(token.charEnd) : -1,
      vowelFamily: getPrimaryStressedVowelFamily(profile?.analysis, profile?.vowelFamily || token?.primaryStressedVowelFamily || token?.terminalVowelFamily) || null,
      syllableCount: Number(profile?.syllableCount) || Number(token?.syllableCount) || 0,
      rhymeKey: profile?.rhymeKey || token?.rhymeTailSignature || null,
      stressPattern: String(profile?.stressPattern || token?.stressPattern || ''),
      role: String(profile?.role || ''),
      lineRole: String(profile?.lineRole || (token?.flags?.isLineEnd ? 'line_end' : token?.flags?.isLineStart ? 'line_start' : 'line_mid')),
      stressRole: String(profile?.stressRole || ''),
      rhymePolicy: String(profile?.rhymePolicy || ''),
      tokenId: Number.isInteger(Number(token?.id)) ? Number(token.id) : -1,
      activeWindowIds,
      compilerRef: buildAnchorCompilerRef(token, activeWindowIds),
    };
  });

  /** @type {Array<any>} */
  const anchors = [];
  const seen = new Set();
  const addAnchor = (profile) => {
    const lineIndex = Number(profile?.lineIndex);
    const wordIndex = Number(profile?.wordIndex);
    const charStart = Number(profile?.charStart);
    if (!Number.isInteger(lineIndex) || !Number.isInteger(wordIndex) || !Number.isInteger(charStart)) return;
    const key = `${lineIndex}:${wordIndex}:${charStart}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push(profile);
  };

  const byLine = new Map();
  for (const profile of tokenProfiles) {
    const lineIndex = Number(profile?.lineIndex);
    if (!Number.isInteger(lineIndex)) continue;
    if (!byLine.has(lineIndex)) byLine.set(lineIndex, []);
    byLine.get(lineIndex).push(profile);
  }

  const sortedLineEntries = [...byLine.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, lineWords] of sortedLineEntries) {
    const sortedWords = [...lineWords].sort(
      (a, b) => (Number(a?.wordIndex) || 0) - (Number(b?.wordIndex) || 0)
    );
    const lineEndWord = sortedWords[sortedWords.length - 1];
    if (lineEndWord) addAnchor(lineEndWord);
  }

  if (anchors.length < maxAnchors) {
    const internalCandidates = tokenProfiles
      .filter((profile) => Number(profile?.syllableCount) >= 2)
      .sort((a, b) => {
        const syllableDiff = (Number(b?.syllableCount) || 0) - (Number(a?.syllableCount) || 0);
        if (syllableDiff !== 0) return syllableDiff;
        const lineDiff = (Number(a?.lineIndex) || 0) - (Number(b?.lineIndex) || 0);
        if (lineDiff !== 0) return lineDiff;
        return (Number(a?.wordIndex) || 0) - (Number(b?.wordIndex) || 0);
      });
    for (const candidate of internalCandidates) {
      if (anchors.length >= maxAnchors) break;
      addAnchor(candidate);
    }
  }

  return anchors.slice(0, maxAnchors);
}

function buildRhymeAstrologyWindowSummaries(verseIR, anchors, maxWindows = DEFAULT_RHYME_ASTROLOGY_WINDOW_LIMIT) {
  const windows = Array.isArray(verseIR?.syllableWindows) ? verseIR.syllableWindows : [];
  const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
  if (windows.length === 0 || tokens.length === 0) return [];

  const anchorTokenIds = new Set(
    (Array.isArray(anchors) ? anchors : [])
      .map((anchor) => Number(anchor?.tokenId))
      .filter(Number.isInteger)
  );
  const occurrencesBySignature = new Map();
  for (const window of windows) {
    const signature = String(window?.signature || '');
    if (!signature) continue;
    occurrencesBySignature.set(signature, (occurrencesBySignature.get(signature) || 0) + 1);
  }

  return windows
    .map((window) => {
      const tokenSpan = Array.isArray(window?.tokenSpan) ? window.tokenSpan : [];
      if (tokenSpan.length !== 2) return null;
      const start = Number(tokenSpan[0]);
      const end = Number(tokenSpan[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
      const tokenIds = [];
      for (let tokenId = start; tokenId <= end; tokenId += 1) {
        tokenIds.push(tokenId);
      }
      const attachedAnchorTokenIds = tokenIds.filter((tokenId) => anchorTokenIds.has(tokenId));
      const signature = String(window?.signature || '');
      const occurrenceCount = occurrencesBySignature.get(signature) || 0;
      return {
        id: Number(window?.id),
        lineIndex: Array.isArray(window?.lineSpan) ? Number(window.lineSpan[0]) : -1,
        lineSpan: Array.isArray(window?.lineSpan) ? window.lineSpan.map(Number) : [],
        tokenIds,
        tokenSpan: tokenSpan.map(Number),
        charStart: Number.isInteger(Number(window?.charStart)) ? Number(window.charStart) : -1,
        charEnd: Number.isInteger(Number(window?.charEnd)) ? Number(window.charEnd) : -1,
        syllableLength: Number(window?.syllableLength) || 0,
        signature,
        stressContour: String(window?.stressContour || ''),
        codaContour: String(window?.codaContour || ''),
        vowelSequence: Array.isArray(window?.vowelSequence) ? window.vowelSequence.map((value) => String(value || '')) : [],
        occurrenceCount,
        repeated: occurrenceCount > 1,
        anchorTokenIds: attachedAnchorTokenIds,
        anchorWords: attachedAnchorTokenIds
          .map((tokenId) => String(tokens[tokenId]?.normalizedUpper || tokens[tokenId]?.text || '').toUpperCase())
          .filter(Boolean)
          .slice(0, 4),
      };
    })
    .filter((window) => window && (window.repeated || window.anchorTokenIds.length > 0 || window.syllableLength >= 3))
    .sort((first, second) => {
      if (Boolean(second.repeated) !== Boolean(first.repeated)) {
        return Number(Boolean(second.repeated)) - Number(Boolean(first.repeated));
      }
      if ((second.occurrenceCount || 0) !== (first.occurrenceCount || 0)) {
        return (second.occurrenceCount || 0) - (first.occurrenceCount || 0);
      }
      if ((second.syllableLength || 0) !== (first.syllableLength || 0)) {
        return (second.syllableLength || 0) - (first.syllableLength || 0);
      }
      return (first.charStart || 0) - (second.charStart || 0);
    })
    .slice(0, maxWindows);
}

function buildRhymeAstrologySpans(anchors, windows) {
  const spans = [];
  const seen = new Set();
  const anchorRows = Array.isArray(anchors) ? anchors : [];
  const windowRows = Array.isArray(windows) ? windows : [];
  const clusterIdsByTokenId = new Map();

  for (const anchor of anchorRows) {
    const tokenId = Number(anchor?.tokenId);
    if (!Number.isInteger(tokenId)) continue;
    const constellationIds = Array.isArray(anchor?.constellations)
      ? anchor.constellations
        .map((constellation) => String(constellation?.id || ''))
        .filter(Boolean)
      : [];
    clusterIdsByTokenId.set(tokenId, constellationIds);
    const id = `anchor:${tokenId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    spans.push({
      id,
      kind: 'anchor_token',
      lineIndex: Number(anchor?.lineIndex) || 0,
      charStart: Number(anchor?.charStart) || 0,
      charEnd: Number(anchor?.charEnd) || 0,
      tokenIds: [tokenId],
      anchorTokenId: tokenId,
      windowId: null,
      label: String(anchor?.word || anchor?.normalizedWord || ''),
      sign: typeof anchor?.sign === 'string' && anchor.sign ? anchor.sign : null,
      clusterIds: constellationIds,
    });
  }

  for (const window of windowRows) {
    const windowId = Number(window?.id);
    if (!Number.isInteger(windowId)) continue;
    const id = `window:${windowId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tokenIds = Array.isArray(window?.tokenIds) ? window.tokenIds.map(Number).filter(Number.isInteger) : [];
    const clusterIds = [...new Set(
      tokenIds.flatMap((tokenId) => clusterIdsByTokenId.get(tokenId) || [])
    )];
    spans.push({
      id,
      kind: 'syllable_window',
      lineIndex: Number(window?.lineIndex) || 0,
      charStart: Number(window?.charStart) || 0,
      charEnd: Number(window?.charEnd) || 0,
      tokenIds,
      anchorTokenId: Array.isArray(window?.anchorTokenIds) && window.anchorTokenIds.length > 0
        ? Number(window.anchorTokenIds[0])
        : null,
      windowId,
      label: `${Number(window?.syllableLength) || 0}-syllable window`,
      sign: null,
      clusterIds,
    });
  }

  return spans.sort((first, second) => {
    if ((first.lineIndex || 0) !== (second.lineIndex || 0)) {
      return (first.lineIndex || 0) - (second.lineIndex || 0);
    }
    if ((first.charStart || 0) !== (second.charStart || 0)) {
      return (first.charStart || 0) - (second.charStart || 0);
    }
    return String(first.id || '').localeCompare(String(second.id || ''));
  });
}

function buildRhymeAstrologyClusterSummary(anchors, maxClusters) {
  const rows = Array.isArray(anchors) ? anchors : [];
  const clusterMap = new Map();

  for (const anchor of rows) {
    const anchorWord = String(anchor?.word || '');
    const anchorSign = String(anchor?.sign || '');
    const constellations = Array.isArray(anchor?.constellations) ? anchor.constellations : [];
    for (const constellation of constellations) {
      const id = String(constellation?.id || '');
      if (!id) continue;
      if (!clusterMap.has(id)) {
        clusterMap.set(id, {
          id,
          label: String(constellation?.label || ''),
          anchorWord,
          sign: anchorSign,
          dominantVowelFamily: Array.isArray(constellation?.dominantVowelFamily)
            ? constellation.dominantVowelFamily
            : [],
          dominantStressPattern: String(constellation?.dominantStressPattern || ''),
          densityScore: Number(constellation?.densityScore) || 0,
          cohesionScore: Number(constellation?.cohesionScore) || 0,
          membersCount: Array.isArray(constellation?.members) ? constellation.members.length : 0,
        });
      }
    }
  }

  return [...clusterMap.values()]
    .sort((first, second) => {
      if (second.cohesionScore !== first.cohesionScore) {
        return second.cohesionScore - first.cohesionScore;
      }
      if (second.densityScore !== first.densityScore) {
        return second.densityScore - first.densityScore;
      }
      return first.label.localeCompare(second.label);
    })
    .slice(0, maxClusters);
}

export async function createPanelAnalysisService(options = {}) {
  const log = options.log ?? console;
  
  // Ensure PhonemeEngine is initialized as it is used by various components in this service
  const phonemeEngine = options.phonemeEngine || PhonemeEngine;
  if (typeof phonemeEngine.init === 'function') {
    try {
      await phonemeEngine.init();
    } catch (error) {
      log?.error?.({ err: error }, '[PanelAnalysisService] Failed to initialize PhonemeEngine');
    }
  }

  const enableSyntaxRhymeLayer = options.enableSyntaxRhymeLayer ?? parseBooleanFlag(
    process.env.ENABLE_SYNTAX_RHYME_LAYER,
    false
  );
  const enableRhymeAstrology = options.enableRhymeAstrology ?? parseBooleanFlag(
    process.env.ENABLE_RHYME_ASTROLOGY,
    false
  );
  const scoreEngine = createDefaultScoringEngine();
  const deepRhymeEngine = new DeepRhymeEngine();

  const rhymeAstrologyAnchorLimit = parsePositiveInt(
    options.rhymeAstrologyAnchorLimit ?? process.env.RHYME_ASTROLOGY_PANEL_ANCHOR_LIMIT,
    DEFAULT_RHYME_ASTROLOGY_ANCHOR_LIMIT
  );
  const rhymeAstrologyMatchLimit = parsePositiveInt(
    options.rhymeAstrologyMatchLimit ?? process.env.RHYME_ASTROLOGY_PANEL_MATCH_LIMIT,
    DEFAULT_RHYME_ASTROLOGY_MATCH_LIMIT
  );
  const rhymeAstrologyMaxClusters = parsePositiveInt(
    options.rhymeAstrologyMaxClusters ?? process.env.RHYME_ASTROLOGY_PANEL_MAX_CLUSTERS,
    DEFAULT_RHYME_ASTROLOGY_MAX_CLUSTERS
  );
  const rhymeAstrologyMinScore = parseScore(
    options.rhymeAstrologyMinScore ?? process.env.RHYME_ASTROLOGY_PANEL_MIN_SCORE,
    DEFAULT_RHYME_ASTROLOGY_MIN_SCORE
  );
  const rhymeAstrologyPaths = resolveRhymeAstrologyArtifactPaths({
    outputDir: options.rhymeAstrologyOutputDir ?? process.env.RHYME_ASTROLOGY_OUTPUT_DIR,
    lexiconDbPath: options.rhymeAstrologyLexiconDbPath ?? process.env.RHYME_ASTROLOGY_LEXICON_DB_PATH,
    indexDbPath: options.rhymeAstrologyIndexDbPath ?? process.env.RHYME_ASTROLOGY_INDEX_DB_PATH,
    edgesDbPath: options.rhymeAstrologyEdgesDbPath ?? process.env.RHYME_ASTROLOGY_EDGES_DB_PATH,
    emotionPriorsPath: options.rhymeEmotionPriorsPath ?? process.env.RHYME_EMOTION_PRIORS_PATH,
    projectRoot: options.projectRoot,
    persistentDataDir: options.persistentDataDir,
    isProduction: options.isProduction,
  });
  const gutenbergEmotionPriors = options.gutenbergEmotionPriors
    ?? loadGutenbergEmotionPriors(rhymeAstrologyPaths.emotionPriorsPath, log);

  const hasInjectedRhymeAstrologyQueryEngine = Boolean(options.rhymeAstrologyQueryEngine);
  let rhymeAstrologyQueryEngine = options.rhymeAstrologyQueryEngine || null;
  const narrativeAMPService = options.narrativeAMPService || options.phonemicOracleService || await createPhonemicOracleService({
    log,
    lexiconAbyssService: options.lexiconAbyssService,
    wordLookupService: options.wordLookupService,
    corpusService: options.corpusService,
  });
  const ownsNarrativeAMPService = !options.narrativeAMPService && !options.phonemicOracleService;

  if (!rhymeAstrologyQueryEngine && enableRhymeAstrology) {
    if (rhymeAstrologyPaths.usedExistingArtifactsFallback || rhymeAstrologyPaths.usedProductionPersistentFallback) {
      log?.warn?.({
        configuredOutputDir: rhymeAstrologyPaths.configuredOutputDir,
        resolvedOutputDir: rhymeAstrologyPaths.outputDir,
        candidateOutputDirs: rhymeAstrologyPaths.candidateOutputDirs,
      }, '[PanelAnalysisService] Falling back to detected rhyme-astrology artifact bundle.');
    }
    const lexiconRepo = createRhymeAstrologyLexiconRepo(rhymeAstrologyPaths.lexiconDbPath, { log });
    const indexRepo = createRhymeAstrologyIndexRepo({
      indexDbPath: rhymeAstrologyPaths.indexDbPath,
      edgesDbPath: rhymeAstrologyPaths.edgesDbPath,
      log,
    });
    rhymeAstrologyQueryEngine = createRhymeAstrologyQueryEngine({
      lexiconRepo,
      indexRepo,
      phonemeEngine: options.phonemeEngine || PhonemeEngine,
      cacheSize: parsePositiveInt(
        options.rhymeAstrologyCacheSize ?? process.env.RHYME_ASTROLOGY_CACHE_SIZE,
        DEFAULT_RHYME_ASTROLOGY_CACHE_SIZE
      ),
      bucketCandidateCap: parsePositiveInt(
        options.rhymeAstrologyBucketCandidateCap ?? process.env.RHYME_ASTROLOGY_BUCKET_QUERY_CAP,
        DEFAULT_RHYME_ASTROLOGY_BUCKET_CAP
      ),
      maxClusters: rhymeAstrologyMaxClusters,
      log,
    });
  }

  async function buildRhymeAstrologyPayload(wordAnalyses, verseIR) {
    if (!enableRhymeAstrology || !rhymeAstrologyQueryEngine) return null;
    const anchors = buildRhymeAstrologyAnchorCandidates(wordAnalyses, verseIR, rhymeAstrologyAnchorLimit);
    const windows = buildRhymeAstrologyWindowSummaries(
      verseIR,
      anchors,
      Math.max(DEFAULT_RHYME_ASTROLOGY_WINDOW_LIMIT, rhymeAstrologyMaxClusters * 3)
    );
    if (anchors.length === 0) {
      return {
        enabled: true,
        features: buildPlsPhoneticFeatures([]),
        inspector: {
          anchors: [],
          clusters: [],
          windows,
          spans: [],
        },
        diagnostics: {
          anchorCount: 0,
          cacheHitCount: 0,
          averageQueryTimeMs: 0,
        },
      };
    }

    const anchorResults = (await Promise.all(
      anchors.map(async (anchor) => {
        const word = String(anchor?.normalizedWord || anchor?.word || '').trim();
        if (!word) return null;
        try {
          const result = await rhymeAstrologyQueryEngine.query({
            text: word,
            mode: 'word',
            verseIR,
            anchorTokenId: Number.isInteger(Number(anchor?.tokenId)) ? Number(anchor.tokenId) : undefined,
            anchorLineIndex: Number.isInteger(Number(anchor?.lineIndex)) ? Number(anchor.lineIndex) : undefined,
            anchorWindowIds: Array.isArray(anchor?.activeWindowIds) ? anchor.activeWindowIds : undefined,
            limit: rhymeAstrologyMatchLimit,
            minScore: rhymeAstrologyMinScore,
            includeConstellations: true,
            includeDiagnostics: true,
          });
          const resolvedNodes = Array.isArray(result?.query?.resolvedNodes)
            ? result.query.resolvedNodes
            : [];
          const resolvedAnchor = resolvedNodes[resolvedNodes.length - 1] || null;
          return {
            word: String(anchor?.word || '').trim(),
            normalizedWord: String(anchor?.normalizedWord || '').toUpperCase(),
            lineIndex: Number.isInteger(anchor?.lineIndex) ? anchor.lineIndex : -1,
            wordIndex: Number.isInteger(anchor?.wordIndex) ? anchor.wordIndex : -1,
            charStart: Number.isInteger(anchor?.charStart) ? anchor.charStart : -1,
            charEnd: Number.isInteger(anchor?.charEnd) ? anchor.charEnd : -1,
            sign: String(resolvedAnchor?.endingSignature || ''),
            dominantVowelFamily: String(anchor?.vowelFamily || ''),
            tokenId: Number.isInteger(Number(anchor?.tokenId)) ? Number(anchor.tokenId) : -1,
            activeWindowIds: Array.isArray(result?.query?.compiler?.activeWindowIds)
              ? result.query.compiler.activeWindowIds.map(Number).filter(Number.isInteger)
              : (Array.isArray(anchor?.activeWindowIds) ? anchor.activeWindowIds : []),
            compilerRef: anchor?.compilerRef
              ? {
                ...anchor.compilerRef,
                activeWindowIds: Array.isArray(result?.query?.compiler?.activeWindowIds)
                  ? result.query.compiler.activeWindowIds.map(Number).filter(Number.isInteger)
                  : (Array.isArray(anchor.compilerRef.activeWindowIds) ? anchor.compilerRef.activeWindowIds : []),
              }
              : null,
            topMatches: Array.isArray(result?.topMatches) ? result.topMatches : [],
            constellations: Array.isArray(result?.constellations) ? result.constellations : [],
            diagnostics: result?.diagnostics || {
              queryTimeMs: 0,
              cacheHit: false,
              candidateCount: 0,
            },
          };
        } catch (error) {
          log?.warn?.(
            { err: error, word },
            '[PanelAnalysisService] RhymeAstrology anchor query failed.'
          );
          return null;
        }
      })
    )).filter(Boolean);

    const frequencyResolver = (nodeId) => {
      const lexiconRepo = rhymeAstrologyQueryEngine?.__unsafe?.lexiconRepo;
      if (typeof lexiconRepo?.lookupNodeById !== 'function') return null;
      return Number(lexiconRepo.lookupNodeById(nodeId)?.frequencyScore) || 0;
    };

    const features = buildPlsPhoneticFeatures(anchorResults, { frequencyResolver });
    const cacheHitCount = anchorResults.reduce(
      (sum, row) => sum + (row?.diagnostics?.cacheHit ? 1 : 0),
      0
    );
    const avgQueryTimeMs = anchorResults.length > 0
      ? anchorResults.reduce(
        (sum, row) => sum + (Number(row?.diagnostics?.queryTimeMs) || 0),
        0
      ) / anchorResults.length
      : 0;

    return {
      enabled: true,
      features,
      inspector: {
        anchors: anchorResults,
        clusters: buildRhymeAstrologyClusterSummary(anchorResults, rhymeAstrologyMaxClusters),
        windows,
        spans: buildRhymeAstrologySpans(anchorResults, windows),
      },
      diagnostics: {
        anchorCount: anchorResults.length,
        cacheHitCount,
        averageQueryTimeMs: Number(avgQueryTimeMs.toFixed(3)),
      },
    };
  }

  async function analyzePanels(rawText, options = {}) {
    const text = normalizeInputText(rawText);
    if (!text.trim()) {
      return createEmptyPanelPayload();
    }

    const nluMode = options?.nluMode || 'generate';

    try {
      const uniqueWords = [...new Set(text.match(WORD_REGEX_GLOBAL) || [])];
      if (typeof PhonemeEngine.primeAuthorityBatch === 'function') {
        void PhonemeEngine.primeAuthorityBatch(uniqueWords);
      } else {
        void PhonemeEngine.ensureAuthorityBatch(uniqueWords);
      }

      const analyzedDoc = await analyzeText(text);
      const syntaxLayerForEmotion = buildSyntaxLayer(analyzedDoc);
      const syntaxLayer = enableSyntaxRhymeLayer ? syntaxLayerForEmotion : null;
      const hhmSignals = syntaxLayerForEmotion?.enabled
        ? buildHiddenHarkovSummary(syntaxLayerForEmotion.tokens)
        : { summary: null, tokenStateByIdentity: null };
      const deepAnalysis = await deepRhymeEngine.analyzeDocument(
        text,
        syntaxLayer
          ? { syntaxLayer, authorityMode: 'background' }
          : { authorityMode: 'background' }
      );
      const verseIR = await enhanceVerseIRWithServerPolicy(compileVerseToIR(text, {
        phonemeEngine: PhonemeEngine,
        mode: deepAnalysis?.compiler?.mode || 'balanced',
      }), {
        gutenbergPriors: gutenbergEmotionPriors,
        pixelBrainEnabled: true,
        nluMode,
        routing: { topK: 4 },
        wordNetEnabled: true,
      });
      const amplifiedDoc = attachVerseIRAmplifier(analyzedDoc, verseIR?.verseIRAmplifier || null);
      const scoreData = await scoreEngine.calculateScore(amplifiedDoc);
      const wordAnalyses = buildAnalysisWordProfiles(deepAnalysis, syntaxLayer, verseIR);
      const lineSyllableCounts = buildLineSyllableCounts(deepAnalysis);

      const genreProfile = LiteraryClassifier.classify(amplifiedDoc, deepAnalysis);
      const scheme = detectScheme(deepAnalysis.schemePattern, deepAnalysis.rhymeGroups);
      const meter = analyzeMeter(deepAnalysis.lines);
      const literaryDevices = analyzeLiteraryDevices(text);
      const emotion = detectEmotionDetailed(text, {
        syntaxLayer: syntaxLayerForEmotion,
        hhmSummary: hhmSignals.summary,
        hhmTokenStateByIdentity: hhmSignals.tokenStateByIdentity,
        gutenbergPriors: gutenbergEmotionPriors,
      }).emotion;
      const rhymeAstrology = await buildRhymeAstrologyPayload(wordAnalyses, verseIR);
      const narrativeAMP = await narrativeAMPService.analyzeVerse({
        text,
        verseIR,
        hhmSummary: hhmSignals.summary,
        scoreData,
        verseIRAmplifier: verseIR?.verseIRAmplifier || null,
      });
      const scoreDataWithPlsFeatures = scoreData && rhymeAstrology?.features
        ? {
          ...scoreData,
          plsPhoneticFeatures: rhymeAstrology.features,
        }
        : scoreData;

      return {
        analysis: toMinimalAnalysisPayload(
          deepAnalysis,
          wordAnalyses,
          lineSyllableCounts,
          verseIR?.verseIRAmplifier || null,
          amplifiedDoc?.schoolWeights || analyzedDoc?.schoolWeights || {},
          amplifiedDoc?.dominantSchool || analyzedDoc?.dominantSchool || null
        ),
        scheme: scheme
          ? {
            ...scheme,
            groups: toSerializableGroupEntries(scheme.groups),
          }
          : null,
        meter,
        genreProfile,
        literaryDevices,
        emotion,
        scoreData: scoreDataWithPlsFeatures,
        vowelSummary: summarizeVowelFamilies(analyzedDoc),
        rhymeAstrology,
        narrativeAMP,
        oracle: toLegacyOraclePayload(narrativeAMP),
      };
    } catch (error) {
      log?.error?.({ err: error }, '[PanelAnalysisService] Failed to analyze panel payload');
      throw error;
    }
  }

  function close() {
    if (!hasInjectedRhymeAstrologyQueryEngine) {
      rhymeAstrologyQueryEngine?.close?.();
    }
    if (ownsNarrativeAMPService) {
      narrativeAMPService.close?.();
    }
  }

  return {
    analyzePanels,
    close,
  };
}
