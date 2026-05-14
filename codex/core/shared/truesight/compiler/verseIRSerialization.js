import { createEmptyVerseIR } from './compileVerseToIR.js';

function freezeNumberArray(values) {
  return Object.freeze(
    (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter(Number.isFinite)
      .map((value) => Math.trunc(value))
  );
}

function freezeStringArray(values) {
  return Object.freeze(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || ''))
  );
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneJsonValue));
  }

  if (value && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, cloneJsonValue(nestedValue)])
      )
    );
  }

  return value;
}

function serializeIndexEntries(indexMap) {
  if (!(indexMap instanceof Map)) {
    return [];
  }

  return [...indexMap.entries()].map(([key, ids]) => [key, Array.isArray(ids) ? [...ids] : []]);
}

function hydrateIndexEntries(entries, parseKey = (key) => key) {
  const hydrated = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [rawKey, rawIds] = entry;
    hydrated.set(parseKey(rawKey), freezeNumberArray(rawIds));
  }

  return hydrated;
}

function serializeLineIndexes(lineIndexes) {
  return (Array.isArray(lineIndexes) ? lineIndexes : []).map((tokenIds, lineIndex) => [lineIndex, [...tokenIds]]);
}

function hydrateLineIndexes(entries, lineCount) {
  const byLineIndex = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const lineIndex = Math.max(0, Math.trunc(Number(entry[0]) || 0));
    byLineIndex.set(lineIndex, freezeNumberArray(entry[1]));
  }

  const count = Math.max(
    Number.isFinite(Number(lineCount)) ? Math.trunc(Number(lineCount)) : 0,
    byLineIndex.size > 0 ? Math.max(...byLineIndex.keys()) + 1 : 0,
  );

  return Object.freeze(
    Array.from({ length: count }, (_, lineIndex) => byLineIndex.get(lineIndex) || Object.freeze([]))
  );
}

function serializeToken(token) {
  return {
    id: Number(token?.id) || 0,
    text: String(token?.text || ''),
    normalized: String(token?.normalized || ''),
    normalizedUpper: String(token?.normalizedUpper || ''),
    lineIndex: Number(token?.lineIndex) || 0,
    tokenIndexInLine: Number(token?.tokenIndexInLine) || 0,
    globalTokenIndex: Number(token?.globalTokenIndex) || 0,
    charStart: Number(token?.charStart) || 0,
    charEnd: Number(token?.charEnd) || 0,
    graphemeStart: Number(token?.graphemeStart) || 0,
    graphemeEnd: Number(token?.graphemeEnd) || 0,
    syllableCount: Number(token?.syllableCount) || 0,
    phonemes: Array.isArray(token?.phonemes) ? [...token.phonemes] : [],
    stressPattern: String(token?.stressPattern || ''),
    onset: Array.isArray(token?.onset) ? [...token.onset] : [],
    nucleus: Array.isArray(token?.nucleus) ? [...token.nucleus] : [],
    coda: Array.isArray(token?.coda) ? [...token.coda] : [],
    vowelFamily: Array.isArray(token?.vowelFamily) ? [...token.vowelFamily] : [],
    primaryStressedVowelFamily: token?.primaryStressedVowelFamily || null,
    terminalVowelFamily: token?.terminalVowelFamily || null,
    rhymeTailSignature: String(token?.rhymeTailSignature || ''),
    consonantSkeleton: String(token?.consonantSkeleton || ''),
    extendedRhymeKeys: Array.isArray(token?.extendedRhymeKeys) ? [...token.extendedRhymeKeys] : [],
    flags: token?.flags
      ? {
          isLineStart: Boolean(token.flags.isLineStart),
          isLineEnd: Boolean(token.flags.isLineEnd),
          isStopWordLike: Boolean(token.flags.isStopWordLike),
          unknownPhonetics: Boolean(token.flags.unknownPhonetics),
        }
      : null,
    phoneticDiagnostics: token?.phoneticDiagnostics
      ? {
          source: String(token.phoneticDiagnostics.source || ''),
          branch: String(token.phoneticDiagnostics.branch || ''),
          fallbackPath: Array.isArray(token.phoneticDiagnostics.fallbackPath)
            ? [...token.phoneticDiagnostics.fallbackPath]
            : [],
          authoritySource: token.phoneticDiagnostics.authoritySource || null,
          usedAuthorityCache: Boolean(token.phoneticDiagnostics.usedAuthorityCache),
          unknownReason: token.phoneticDiagnostics.unknownReason || null,
          notes: Array.isArray(token.phoneticDiagnostics.notes)
            ? [...token.phoneticDiagnostics.notes]
            : [],
        }
      : null,
    analysis: token?.analysis ? cloneJsonValue(token.analysis) : null,
    visualBytecode: token?.visualBytecode ? cloneJsonValue(token.visualBytecode) : null,
    trueVisionBytecode: token?.trueVisionBytecode ? cloneJsonValue(token.trueVisionBytecode) : null,
  };
}

function hydrateToken(token) {
  return Object.freeze({
    id: Number(token?.id) || 0,
    text: String(token?.text || ''),
    normalized: String(token?.normalized || ''),
    normalizedUpper: String(token?.normalizedUpper || ''),
    lineIndex: Number(token?.lineIndex) || 0,
    tokenIndexInLine: Number(token?.tokenIndexInLine) || 0,
    globalTokenIndex: Number(token?.globalTokenIndex) || 0,
    charStart: Number(token?.charStart) || 0,
    charEnd: Number(token?.charEnd) || 0,
    graphemeStart: Number(token?.graphemeStart) || 0,
    graphemeEnd: Number(token?.graphemeEnd) || 0,
    syllableCount: Number(token?.syllableCount) || 0,
    phonemes: freezeStringArray(token?.phonemes),
    stressPattern: String(token?.stressPattern || ''),
    onset: freezeStringArray(token?.onset),
    nucleus: freezeStringArray(token?.nucleus),
    coda: freezeStringArray(token?.coda),
    vowelFamily: freezeStringArray(token?.vowelFamily),
    primaryStressedVowelFamily: token?.primaryStressedVowelFamily || null,
    terminalVowelFamily: token?.terminalVowelFamily || null,
    rhymeTailSignature: String(token?.rhymeTailSignature || ''),
    consonantSkeleton: String(token?.consonantSkeleton || ''),
    extendedRhymeKeys: freezeStringArray(token?.extendedRhymeKeys),
    flags: token?.flags
      ? Object.freeze({
          isLineStart: Boolean(token.flags.isLineStart),
          isLineEnd: Boolean(token.flags.isLineEnd),
          isStopWordLike: Boolean(token.flags.isStopWordLike),
          unknownPhonetics: Boolean(token.flags.unknownPhonetics),
        })
      : null,
    phoneticDiagnostics: token?.phoneticDiagnostics ? cloneJsonValue(token.phoneticDiagnostics) : null,
    analysis: token?.analysis ? cloneJsonValue(token.analysis) : null,
    visualBytecode: token?.visualBytecode ? cloneJsonValue(token.visualBytecode) : null,
    trueVisionBytecode: token?.trueVisionBytecode ? cloneJsonValue(token.trueVisionBytecode) : null,
  });
}

export function serializeVerseIR(verseIR) {
  const lines = Array.isArray(verseIR?.lines) ? verseIR.lines : [];
  const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
  const surfaceSpans = Array.isArray(verseIR?.surfaceSpans) ? verseIR.surfaceSpans : [];
  const syllableWindows = Array.isArray(verseIR?.syllableWindows) ? verseIR.syllableWindows : [];
  const indexes = verseIR?.indexes || {};
  const featureTables = verseIR?.featureTables || {};
  const metadata = verseIR?.metadata || {};

  return {
    version: String(verseIR?.version || ''),
    rawText: String(verseIR?.rawText || ''),
    normalizedText: String(verseIR?.normalizedText || ''),
    lines: lines.map((line) => ({
      lineIndex: Number(line?.lineIndex) || 0,
      text: String(line?.text || ''),
      normalizedText: String(line?.normalizedText || ''),
      tokenIds: Array.isArray(line?.tokenIds) ? [...line.tokenIds] : [],
      charStart: Number(line?.charStart) || 0,
      charEnd: Number(line?.charEnd) || 0,
      graphemeStart: Number(line?.graphemeStart) || 0,
      graphemeEnd: Number(line?.graphemeEnd) || 0,
      lineBreak: String(line?.lineBreak || ''),
      lineBreakStart: Number(line?.lineBreakStart) || -1,
      lineBreakEnd: Number(line?.lineBreakEnd) || -1,
      rawSlice: String(line?.rawSlice || ''),
      isTerminalLine: Boolean(line?.isTerminalLine),
    })),
    tokens: tokens.map(serializeToken),
    surfaceSpans: surfaceSpans.map((surfaceSpan) => ({
      id: Number(surfaceSpan?.id) || 0,
      lineIndex: Number(surfaceSpan?.lineIndex) || 0,
      surfaceIndexInLine: Number(surfaceSpan?.surfaceIndexInLine) || 0,
      kind: String(surfaceSpan?.kind || 'punctuation'),
      text: String(surfaceSpan?.text || ''),
      tokenId: Number.isInteger(Number(surfaceSpan?.tokenId)) ? Number(surfaceSpan.tokenId) : null,
      charStart: Number(surfaceSpan?.charStart) || 0,
      charEnd: Number(surfaceSpan?.charEnd) || 0,
      graphemeStart: Number(surfaceSpan?.graphemeStart) || 0,
      graphemeEnd: Number(surfaceSpan?.graphemeEnd) || 0,
    })),
    syllableWindows: syllableWindows.map((window) => ({
      id: Number(window?.id) || 0,
      tokenSpan: Array.isArray(window?.tokenSpan) ? [...window.tokenSpan] : [],
      lineSpan: Array.isArray(window?.lineSpan) ? [...window.lineSpan] : [],
      charStart: Number(window?.charStart) || 0,
      charEnd: Number(window?.charEnd) || 0,
      graphemeStart: Number(window?.graphemeStart) || 0,
      graphemeEnd: Number(window?.graphemeEnd) || 0,
      syllableLength: Number(window?.syllableLength) || 0,
      phonemeSpan: Array.isArray(window?.phonemeSpan) ? [...window.phonemeSpan] : [],
      vowelSequence: Array.isArray(window?.vowelSequence) ? [...window.vowelSequence] : [],
      stressContour: String(window?.stressContour || ''),
      codaContour: String(window?.codaContour || ''),
      signature: String(window?.signature || ''),
    })),
    indexes: {
      tokenIdsByLineIndex: serializeLineIndexes(indexes.tokenIdsByLineIndex),
      lineEndTokenIds: Array.isArray(indexes.lineEndTokenIds) ? [...indexes.lineEndTokenIds] : [],
      tokenIdsByRhymeTail: serializeIndexEntries(indexes.tokenIdsByRhymeTail),
      tokenIdsByVowelFamily: serializeIndexEntries(indexes.tokenIdsByVowelFamily),
      tokenIdsByTerminalVowelFamily: serializeIndexEntries(indexes.tokenIdsByTerminalVowelFamily),
      tokenIdsByStressedVowelFamily: serializeIndexEntries(indexes.tokenIdsByStressedVowelFamily),
      tokenIdsByConsonantSkeleton: serializeIndexEntries(indexes.tokenIdsByConsonantSkeleton),
      tokenIdsByStressContour: serializeIndexEntries(indexes.tokenIdsByStressContour),
      windowIdsBySyllableLength: serializeIndexEntries(indexes.windowIdsBySyllableLength),
      windowIdsBySignature: serializeIndexEntries(indexes.windowIdsBySignature),
    },
    featureTables: {
      tokenNeighborhoods: Array.isArray(featureTables.tokenNeighborhoods)
        ? featureTables.tokenNeighborhoods.map((neighborhood) => ({
            tokenId: Number(neighborhood?.tokenId) || 0,
            lineIndex: Number(neighborhood?.lineIndex) || 0,
            prevTokenId: Number.isInteger(Number(neighborhood?.prevTokenId)) ? Number(neighborhood.prevTokenId) : null,
            nextTokenId: Number.isInteger(Number(neighborhood?.nextTokenId)) ? Number(neighborhood.nextTokenId) : null,
          }))
        : [],
      lineAdjacency: Array.isArray(featureTables.lineAdjacency)
        ? featureTables.lineAdjacency.map((adjacency) => ({
            lineIndex: Number(adjacency?.lineIndex) || 0,
            prevLineIndex: Number.isInteger(Number(adjacency?.prevLineIndex)) ? Number(adjacency.prevLineIndex) : null,
            nextLineIndex: Number.isInteger(Number(adjacency?.nextLineIndex)) ? Number(adjacency.nextLineIndex) : null,
          }))
        : [],
      summary: featureTables.summary
        ? {
            tokenCount: Number(featureTables.summary.tokenCount) || 0,
            lineCount: Number(featureTables.summary.lineCount) || 0,
            syllableWindowCount: Number(featureTables.summary.syllableWindowCount) || 0,
          }
        : null,
    },
    metadata: metadata ? cloneJsonValue(metadata) : null,
    semanticDepth: typeof verseIR?.semanticDepth === 'number' ? verseIR.semanticDepth : undefined,
    archetypeResonance: verseIR?.archetypeResonance ? cloneJsonValue(verseIR.archetypeResonance) : undefined,
    elementMatches: verseIR?.elementMatches ? cloneJsonValue(verseIR.elementMatches) : undefined,
    trueVision: verseIR?.trueVision ? cloneJsonValue(verseIR.trueVision) : undefined,
    verseIRAmplifier: verseIR?.verseIRAmplifier === undefined
      ? undefined
      : cloneJsonValue(verseIR.verseIRAmplifier),
  };
}

function deserializeVerseIR(payload) {
  if (!payload || typeof payload !== 'object') {
    return createEmptyVerseIR();
  }

  const base = createEmptyVerseIR({
    mode: payload?.metadata?.mode,
    normalization: payload?.metadata?.normalization,
  });
  const lines = Object.freeze(
    (Array.isArray(payload.lines) ? payload.lines : []).map((line) => Object.freeze({
      lineIndex: Number(line?.lineIndex) || 0,
      text: String(line?.text || ''),
      normalizedText: String(line?.normalizedText || ''),
      tokenIds: freezeNumberArray(line?.tokenIds),
      charStart: Number(line?.charStart) || 0,
      charEnd: Number(line?.charEnd) || 0,
      graphemeStart: Number(line?.graphemeStart) || 0,
      graphemeEnd: Number(line?.graphemeEnd) || 0,
      lineBreak: String(line?.lineBreak || ''),
      lineBreakStart: Number(line?.lineBreakStart) || -1,
      lineBreakEnd: Number(line?.lineBreakEnd) || -1,
      rawSlice: String(line?.rawSlice || ''),
      isTerminalLine: Boolean(line?.isTerminalLine),
    }))
  );
  const tokens = Object.freeze(
    (Array.isArray(payload.tokens) ? payload.tokens : []).map(hydrateToken)
  );
  const surfaceSpans = Object.freeze(
    (Array.isArray(payload.surfaceSpans) ? payload.surfaceSpans : []).map((surfaceSpan) => Object.freeze({
      id: Number(surfaceSpan?.id) || 0,
      lineIndex: Number(surfaceSpan?.lineIndex) || 0,
      surfaceIndexInLine: Number(surfaceSpan?.surfaceIndexInLine) || 0,
      kind: String(surfaceSpan?.kind || 'punctuation'),
      text: String(surfaceSpan?.text || ''),
      tokenId: Number.isInteger(Number(surfaceSpan?.tokenId)) ? Number(surfaceSpan.tokenId) : null,
      charStart: Number(surfaceSpan?.charStart) || 0,
      charEnd: Number(surfaceSpan?.charEnd) || 0,
      graphemeStart: Number(surfaceSpan?.graphemeStart) || 0,
      graphemeEnd: Number(surfaceSpan?.graphemeEnd) || 0,
    }))
  );
  const syllableWindows = Object.freeze(
    (Array.isArray(payload.syllableWindows) ? payload.syllableWindows : []).map((window) => Object.freeze({
      id: Number(window?.id) || 0,
      tokenSpan: freezeNumberArray(window?.tokenSpan),
      lineSpan: freezeNumberArray(window?.lineSpan),
      charStart: Number(window?.charStart) || 0,
      charEnd: Number(window?.charEnd) || 0,
      graphemeStart: Number(window?.graphemeStart) || 0,
      graphemeEnd: Number(window?.graphemeEnd) || 0,
      syllableLength: Number(window?.syllableLength) || 0,
      phonemeSpan: freezeStringArray(window?.phonemeSpan),
      vowelSequence: freezeStringArray(window?.vowelSequence),
      stressContour: String(window?.stressContour || ''),
      codaContour: String(window?.codaContour || ''),
      signature: String(window?.signature || ''),
    }))
  );
  const indexes = Object.freeze({
    tokenIdsByLineIndex: hydrateLineIndexes(payload?.indexes?.tokenIdsByLineIndex, lines.length),
    lineEndTokenIds: freezeNumberArray(payload?.indexes?.lineEndTokenIds),
    tokenIdsByRhymeTail: hydrateIndexEntries(payload?.indexes?.tokenIdsByRhymeTail),
    tokenIdsByVowelFamily: hydrateIndexEntries(payload?.indexes?.tokenIdsByVowelFamily),
    tokenIdsByTerminalVowelFamily: hydrateIndexEntries(payload?.indexes?.tokenIdsByTerminalVowelFamily),
    tokenIdsByStressedVowelFamily: hydrateIndexEntries(payload?.indexes?.tokenIdsByStressedVowelFamily),
    tokenIdsByConsonantSkeleton: hydrateIndexEntries(payload?.indexes?.tokenIdsByConsonantSkeleton),
    tokenIdsByStressContour: hydrateIndexEntries(payload?.indexes?.tokenIdsByStressContour),
    windowIdsBySyllableLength: hydrateIndexEntries(payload?.indexes?.windowIdsBySyllableLength, (key) => Math.trunc(Number(key) || 0)),
    windowIdsBySignature: hydrateIndexEntries(payload?.indexes?.windowIdsBySignature),
  });
  const featureTables = Object.freeze({
    tokenNeighborhoods: Object.freeze(
      (Array.isArray(payload?.featureTables?.tokenNeighborhoods) ? payload.featureTables.tokenNeighborhoods : [])
        .map((neighborhood) => Object.freeze({
          tokenId: Number(neighborhood?.tokenId) || 0,
          lineIndex: Number(neighborhood?.lineIndex) || 0,
          prevTokenId: Number.isInteger(Number(neighborhood?.prevTokenId)) ? Number(neighborhood.prevTokenId) : null,
          nextTokenId: Number.isInteger(Number(neighborhood?.nextTokenId)) ? Number(neighborhood.nextTokenId) : null,
        }))
    ),
    lineAdjacency: Object.freeze(
      (Array.isArray(payload?.featureTables?.lineAdjacency) ? payload.featureTables.lineAdjacency : [])
        .map((adjacency) => Object.freeze({
          lineIndex: Number(adjacency?.lineIndex) || 0,
          prevLineIndex: Number.isInteger(Number(adjacency?.prevLineIndex)) ? Number(adjacency.prevLineIndex) : null,
          nextLineIndex: Number.isInteger(Number(adjacency?.nextLineIndex)) ? Number(adjacency.nextLineIndex) : null,
        }))
    ),
    summary: payload?.featureTables?.summary
      ? Object.freeze({
          tokenCount: Number(payload.featureTables.summary.tokenCount) || 0,
          lineCount: Number(payload.featureTables.summary.lineCount) || 0,
          syllableWindowCount: Number(payload.featureTables.summary.syllableWindowCount) || 0,
        })
      : base.featureTables.summary,
  });

  return Object.freeze({
    version: String(payload.version || base.version),
    rawText: String(payload.rawText || ''),
    normalizedText: String(payload.normalizedText || ''),
    lines,
    tokens,
    surfaceSpans,
    syllableWindows,
    indexes,
    featureTables,
    metadata: payload?.metadata ? cloneJsonValue(payload.metadata) : base.metadata,
    semanticDepth: typeof payload?.semanticDepth === 'number' ? payload.semanticDepth : undefined,
    archetypeResonance: payload?.archetypeResonance ? cloneJsonValue(payload.archetypeResonance) : undefined,
    elementMatches: payload?.elementMatches ? cloneJsonValue(payload.elementMatches) : undefined,
    trueVision: payload?.trueVision ? cloneJsonValue(payload.trueVision) : undefined,
    verseIRAmplifier: payload?.verseIRAmplifier === undefined
      ? undefined
      : cloneJsonValue(payload.verseIRAmplifier),
  });
}
