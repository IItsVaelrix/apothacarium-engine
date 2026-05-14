const DEFAULT_STANZA_SIZE_BARS = 4;

export const HHM_LOGIC_ORDER = Object.freeze([
  "SYNTAX",
  "PREDICTOR",
  "SPELLCHECK",
  "JUDICIARY",
  "PHONEME",
  "HEURISTICS",
  "METER",
]);

export const HHM_STAGE_WEIGHTS = Object.freeze({
  SYNTAX: 0.27,
  PREDICTOR: 0.14,
  SPELLCHECK: 0.10,
  JUDICIARY: 0.08,
  PHONEME: 0.18,
  HEURISTICS: 0.15,
  METER: 0.08,
});

const HHM_DICTIONARY_SOURCES = Object.freeze([
  { id: "scholomance", name: "Scholomance Dictionary", linked: true },
  { id: "free_dictionary_api", name: "Free Dictionary API", linked: true },
  { id: "datamuse", name: "Datamuse API", linked: true },
  { id: "cmu", name: "CMU Pronouncing Dictionary", linked: true },
  { id: "phoneme_v2", name: "Scholomance Phoneme Dictionary v2", linked: true },
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeLineNumber(value) {
  const num = Number(value);
  if (!Number.isInteger(num)) return 0;
  return Math.max(0, num);
}

function buildLineWordCounts(tokens) {
  const lineWordCounts = new Map();
  tokens.forEach((token) => {
    const lineNumber = safeLineNumber(token?.lineNumber);
    lineWordCounts.set(lineNumber, (lineWordCounts.get(lineNumber) || 0) + 1);
  });
  return lineWordCounts;
}

function toTokenSnapshot(token) {
  if (!token) return null;
  return {
    word: String(token.word || ""),
    normalized: String(token.normalized || ""),
    stem: String(token.stem || ""),
    role: String(token.role || "content"),
    lineRole: String(token.lineRole || "line_mid"),
    stressRole: String(token.stressRole || "unknown"),
    rhymePolicy: String(token.rhymePolicy || "allow"),
    lineNumber: safeLineNumber(token.lineNumber),
    wordIndex: Number.isInteger(Number(token.wordIndex)) ? Number(token.wordIndex) : 0,
  };
}

function computeTokenWeight(token, context) {
  let weight = token.role === "content" ? 0.72 : 0.42;

  if (token.lineRole === "line_end") weight += 0.15;
  else if (token.lineRole === "line_start") weight += 0.08;

  if (token.stressRole === "primary") weight += 0.11;
  else if (token.stressRole === "secondary") weight += 0.06;
  else if (token.stressRole === "unstressed") weight -= 0.06;

  if (token.rhymePolicy === "allow") weight += 0.05;
  else if (token.rhymePolicy === "allow_weak") weight -= 0.04;
  else if (token.rhymePolicy === "suppress") weight -= 0.13;

  if (context.prevToken && context.prevToken.role === token.role) weight += 0.03;
  if (context.nextToken && context.nextToken.role === token.role) weight += 0.02;
  if (context.lineWordCount > 0) weight += Math.min(0.06, context.lineWordCount / 100);

  return clamp(weight, 0.05, 1);
}

function inferHiddenState(token, context) {
  if (token.role === "function" && token.rhymePolicy === "suppress") {
    return "function_gate";
  }
  if (token.role === "content" && token.lineRole === "line_end") {
    return "terminal_anchor";
  }
  if (token.stressRole === "primary") {
    return "stress_anchor";
  }
  if (
    context.prevToken &&
    context.prevToken.stem &&
    token.stem &&
    context.prevToken.stem === token.stem
  ) {
    return "lexical_chain";
  }
  if (token.lineRole === "line_start") {
    return "line_launch";
  }
  return "flow";
}

function computeStageSignal(stage, token, tokenWeight) {
  switch (stage) {
    case "SYNTAX":
      return clamp(tokenWeight * (token.role === "content" ? 1.05 : 0.85), 0.05, 1.6);
    case "PREDICTOR": {
      const reasons = Array.isArray(token.reasons) ? token.reasons : [];
      const hasSequentialCue = reasons.includes("noun_precursor_context") || reasons.includes("verb_precursor_context");
      if (hasSequentialCue) return clamp(tokenWeight * 1.16, 0.05, 1.6);
      if (token.role === "content" && token.lineRole !== "line_start") {
        return clamp(tokenWeight * 1.05, 0.05, 1.6);
      }
      return clamp(tokenWeight * 0.94, 0.05, 1.6);
    }
    case "SPELLCHECK":
      if (token.role === "function") return clamp(tokenWeight * 1.08, 0.05, 1.6);
      if ((token.reasons?.length || 0) >= 2) return clamp(tokenWeight * 0.99, 0.05, 1.6);
      return clamp(tokenWeight * 0.9, 0.05, 1.6);
    case "JUDICIARY":
      if (token.rhymePolicy === "suppress") return clamp(tokenWeight * 0.72, 0.05, 1.6);
      if (token.rhymePolicy === "allow_weak") return clamp(tokenWeight * 0.92, 0.05, 1.6);
      return clamp(tokenWeight * 1.08, 0.05, 1.6);
    case "PHONEME":
      if (token.stressRole === "primary") return clamp(tokenWeight * 1.12, 0.05, 1.6);
      if (token.stressRole === "secondary") return clamp(tokenWeight * 1.02, 0.05, 1.6);
      return clamp(tokenWeight * 0.88, 0.05, 1.6);
    case "HEURISTICS":
      return clamp(tokenWeight * ((token.reasons?.length || 0) >= 2 ? 1.06 : 0.95), 0.05, 1.6);
    case "METER":
      if (token.lineRole === "line_end") return clamp(tokenWeight * 1.08, 0.05, 1.6);
      if (token.lineRole === "line_start") return clamp(tokenWeight * 0.98, 0.05, 1.6);
      return clamp(tokenWeight * 0.93, 0.05, 1.6);
    default:
      return tokenWeight;
  }
}

function buildStageScores(token, tokenWeight, stageWeights) {
  const stageScores = {};
  HHM_LOGIC_ORDER.forEach((stage, index) => {
    const signal = computeStageSignal(stage, token, tokenWeight);
    const weight = Number(stageWeights?.[stage]) || 0;
    stageScores[stage] = {
      order: index + 1,
      signal,
      weight,
      weighted: signal * weight,
    };
  });
  return stageScores;
}

function keyFromToken(token) {
  return `${safeLineNumber(token.lineNumber)}:${Number(token.wordIndex) || 0}:${Number(token.charStart) || 0}`;
}

function getSerializableDictionarySources() {
  return HHM_DICTIONARY_SOURCES.map((source, index) => ({
    ...source,
    priority: index + 1,
  }));
}

function buildTransitionMatrix(transitionCountsByStanza) {
  const matrix = [];
  transitionCountsByStanza.forEach((count, pair) => {
    const separator = pair.indexOf("->");
    const from = pair.slice(0, separator);
    const to = pair.slice(separator + 2);
    matrix.push({ from, to, count });
  });

  const outgoingTotals = {};
  matrix.forEach((row) => {
    outgoingTotals[row.from] = (outgoingTotals[row.from] || 0) + row.count;
  });

  return matrix
    .map((row) => ({
      ...row,
      probability: outgoingTotals[row.from] > 0 ? row.count / outgoingTotals[row.from] : 0,
    }))
    .sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability;
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      return a.to.localeCompare(b.to);
    });
}

function createEmptySummary(stanzaSizeBars) {
  return {
    enabled: false,
    model: "hidden_harkov_model",
    stanzaSizeBars,
    stanzaCount: 0,
    tokenCount: 0,
    logicOrder: [...HHM_LOGIC_ORDER],
    stageWeights: { ...HHM_STAGE_WEIGHTS },
    contextAware: true,
    dictionarySources: getSerializableDictionarySources(),
    stanzas: [],
  };
}

/**
 * Builds a Hidden Harkov Model summary and per-token state payloads.
 * @param {Array<object>} tokens
 * @param {{stanzaSizeBars?: number}} [options]
 * @returns {{summary: object, tokenStateByIdentity: Map<string, object>}}
 */
export function buildHiddenHarkovSummary(tokens, options = {}) {
  const stanzaSizeBars = Number.isInteger(Number(options?.stanzaSizeBars)) && Number(options.stanzaSizeBars) > 0
    ? Number(options.stanzaSizeBars)
    : DEFAULT_STANZA_SIZE_BARS;

  const predictedHiddenStates = options?.predictedHiddenStates || new Map();

  const orderedTokens = Array.isArray(tokens)
    ? tokens
      .filter((token) => token && typeof token === "object")
      .slice()
      .sort((a, b) => {
        if (safeLineNumber(a.lineNumber) !== safeLineNumber(b.lineNumber)) {
          return safeLineNumber(a.lineNumber) - safeLineNumber(b.lineNumber);
        }
        if (Number(a.wordIndex) !== Number(b.wordIndex)) {
          return Number(a.wordIndex) - Number(b.wordIndex);
        }
        return Number(a.charStart) - Number(b.charStart);
      })
    : [];

  if (orderedTokens.length === 0) {
    return {
      summary: createEmptySummary(stanzaSizeBars),
      tokenStateByIdentity: new Map(),
    };
  }

  const stageWeights = { ...HHM_STAGE_WEIGHTS };
  const lineWordCounts = buildLineWordCounts(orderedTokens);
  const tokenStateByIdentity = new Map();
  const stanzaBuckets = new Map();

  for (let i = 0; i < orderedTokens.length; i += 1) {
    const token = orderedTokens[i];
    const prevToken = i > 0 ? orderedTokens[i - 1] : null;
    const nextToken = i < orderedTokens.length - 1 ? orderedTokens[i + 1] : null;
    const lineNumber = safeLineNumber(token.lineNumber);
    const stanzaIndex = Math.floor(lineNumber / stanzaSizeBars);
    const stanzaBar = (lineNumber % stanzaSizeBars) + 1;
    const lineWordCount = lineWordCounts.get(lineNumber) || 0;
    const tokenWeight = computeTokenWeight(token, { prevToken, nextToken, lineWordCount });
    const tokenIdentity = keyFromToken(token);
    const hiddenState = predictedHiddenStates.get(tokenIdentity) || inferHiddenState(token, { prevToken, nextToken });
    const stageScores = buildStageScores(token, tokenWeight, stageWeights);

    const tokenState = {
      model: "hidden_harkov_model",
      stanzaIndex,
      stanzaBar,
      hiddenState,
      tokenWeight,
      logicOrder: [...HHM_LOGIC_ORDER],
      stageWeights: { ...stageWeights },
      stageScores,
      context: {
        prevToken: toTokenSnapshot(prevToken),
        nextToken: toTokenSnapshot(nextToken),
        lineWordCount,
      },
      dictionarySources: getSerializableDictionarySources(),
    };

    tokenStateByIdentity.set(tokenIdentity, tokenState);

    if (!stanzaBuckets.has(stanzaIndex)) {
      stanzaBuckets.set(stanzaIndex, {
        stanzaIndex,
        lines: new Set(),
        tokenCount: 0,
        stateCounts: {},
        transitionCounts: new Map(),
        lastState: null,
      });
    }

    const stanzaBucket = stanzaBuckets.get(stanzaIndex);
    stanzaBucket.lines.add(lineNumber);
    stanzaBucket.tokenCount += 1;
    stanzaBucket.stateCounts[hiddenState] = (stanzaBucket.stateCounts[hiddenState] || 0) + 1;

    if (stanzaBucket.lastState) {
      const transitionKey = `${stanzaBucket.lastState}->${hiddenState}`;
      stanzaBucket.transitionCounts.set(
        transitionKey,
        (stanzaBucket.transitionCounts.get(transitionKey) || 0) + 1
      );
    }
    stanzaBucket.lastState = hiddenState;
  }

  const stanzas = Array.from(stanzaBuckets.values())
    .sort((a, b) => a.stanzaIndex - b.stanzaIndex)
    .map((bucket) => {
      const bars = Array.from(bucket.lines.values()).sort((a, b) => a - b);
      return {
        stanzaIndex: bucket.stanzaIndex,
        startLine: bars.length > 0 ? bars[0] : bucket.stanzaIndex * stanzaSizeBars,
        endLine: bars.length > 0 ? bars[bars.length - 1] : (bucket.stanzaIndex * stanzaSizeBars) + (stanzaSizeBars - 1),
        bars,
        tokenCount: bucket.tokenCount,
        hiddenStateCounts: bucket.stateCounts,
        transitions: buildTransitionMatrix(bucket.transitionCounts),
      };
    });

  const summary = {
    enabled: true,
    model: "hidden_harkov_model",
    stanzaSizeBars,
    stanzaCount: stanzas.length,
    tokenCount: orderedTokens.length,
    logicOrder: [...HHM_LOGIC_ORDER],
    stageWeights,
    contextAware: true,
    dictionarySources: getSerializableDictionarySources(),
    stanzas,
  };

  return {
    summary,
    tokenStateByIdentity,
  };
}
