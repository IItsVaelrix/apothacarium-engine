import { commonElementAmplifier } from './plugins/commonElements.js';
import { rareElementAmplifier } from './plugins/rareElements.js';
import { inexplicableElementAmplifier } from './plugins/inexplicableElements.js';
import { phoneticColorAmplifier } from './plugins/phoneticColor.js';
import { pixelBrainPhase1BridgeAmplifier } from './plugins/pixelBrainBridge.js';
import { lexicalResonanceAmplifier } from './plugins/lexicalResonance.js';
import { travellingWaveFilterBankAmplifier } from './plugins/travellingWaveFilterBank.js';
import { naturalLanguageAmp } from './plugins/naturalLanguageAmp.js';
import {
  clamp01,
  collectVerseIRTokenStats,
  createAmplifierDiagnostic,
  createAmplifierResult,
  normalizeAmplifierTier,
  roundTo,
  VERSEIR_AMPLIFIER_NOVELTY_BUDGET,
  VERSEIR_AMPLIFIER_VERSION,
} from './shared.js';

const MIN_PRECISION_SCALAR = 0.72;
const PRECISION_DECAY_PER_ACTIVE_AMPLIFIER = 0.08;
const MAX_MATCHES_PER_TIER = 6;
const MAX_DIAGNOSTICS = 8;
const DEFAULT_ROUTING_TOP_K = 3;
const DEFAULT_ROUTING_MIN_SCORE = 0.05;

export const DEFAULT_VERSEIR_AMPLIFIERS = Object.freeze([
  naturalLanguageAmp,
  phoneticColorAmplifier,
  pixelBrainPhase1BridgeAmplifier,
  travellingWaveFilterBankAmplifier,
  lexicalResonanceAmplifier,
  commonElementAmplifier,
  rareElementAmplifier,
  inexplicableElementAmplifier,
]);

function getAmplifierId(amplifier, index) {
  const resolved = String(amplifier?.id || amplifier?.label || '').trim();
  return resolved || `verseir_amplifier_${index + 1}`;
}

function createTimeoutError(amplifierId, timeoutMs) {
  const error = new Error(`${amplifierId} exceeded the ${timeoutMs}ms execution budget.`);
  error.code = 'VERSEIR_AMPLIFIER_TIMEOUT';
  error.amplifierId = amplifierId;
  error.timeoutMs = timeoutMs;
  return error;
}

function hasScopedOption(config, amplifierId) {
  if (!config) return false;
  if (config instanceof Map) return config.has(amplifierId);
  if (typeof config === 'object') {
    return Object.prototype.hasOwnProperty.call(config, amplifierId);
  }
  return false;
}

function readScopedOption(config, amplifierId) {
  if (!config) return undefined;
  if (config instanceof Map) return config.get(amplifierId);
  if (typeof config === 'object') return config[amplifierId];
  return undefined;
}

function resolveAmplifierTimeoutMs(options, amplifierId) {
  const scopedTimeout = hasScopedOption(options?.amplifierTimeouts, amplifierId)
    ? readScopedOption(options?.amplifierTimeouts, amplifierId)
    : options?.timeoutMs ?? options?.amplifierTimeoutMs;
  const numericTimeout = Number(scopedTimeout);
  return Number.isFinite(numericTimeout) && numericTimeout > 0 ? numericTimeout : null;
}

function withAmplifierTimeout(task, amplifierId, timeoutMs) {
  if (!timeoutMs) {
    return Promise.resolve().then(task);
  }

  let timeoutHandle;
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(createTimeoutError(amplifierId, timeoutMs)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

function resolveRoutingConfig(options, amplifierCount) {
  const routing = options?.routing && typeof options.routing === 'object'
    ? options.routing
    : {};
  const requestedTopK = Number(routing.topK);
  const topK = Number.isInteger(requestedTopK) && requestedTopK > 0
    ? Math.min(amplifierCount, requestedTopK)
    : Math.min(amplifierCount, DEFAULT_ROUTING_TOP_K);
  const requestedMinScore = Number(routing.minScore);

  return Object.freeze({
    enabled: routing.enabled !== false,
    topK,
    minScore: Number.isFinite(requestedMinScore)
      ? clamp01(requestedMinScore)
      : DEFAULT_ROUTING_MIN_SCORE,
  });
}

function normalizeRouteResult(rawRoute, amplifier, index) {
  const amplifierId = getAmplifierId(amplifier, index);

  if (rawRoute === undefined || rawRoute === null) {
    return Object.freeze({
      amplifierId,
      score: 1,
      shouldRun: true,
      reason: 'no_route',
      matchedDomainCount: 0,
      topMatch: null,
      forceRun: false,
      routeError: null,
    });
  }

  if (typeof rawRoute === 'boolean') {
    return Object.freeze({
      amplifierId,
      score: rawRoute ? 1 : 0,
      shouldRun: rawRoute,
      reason: rawRoute ? 'matched' : 'route_rejected',
      matchedDomainCount: 0,
      topMatch: null,
      forceRun: false,
      routeError: null,
    });
  }

  if (typeof rawRoute === 'number') {
    const score = roundTo(clamp01(rawRoute));
    return Object.freeze({
      amplifierId,
      score,
      shouldRun: score > 0,
      reason: score > 0 ? 'matched' : 'route_rejected',
      matchedDomainCount: 0,
      topMatch: null,
      forceRun: false,
      routeError: null,
    });
  }

  if (typeof rawRoute !== 'object') {
    return Object.freeze({
      amplifierId,
      score: 1,
      shouldRun: true,
      reason: 'invalid_route_shape',
      matchedDomainCount: 0,
      topMatch: null,
      forceRun: false,
      routeError: null,
    });
  }

  const hasExplicitScore = Number.isFinite(Number(rawRoute?.score));
  const hasExplicitShouldRun = typeof rawRoute?.shouldRun === 'boolean';
  const score = hasExplicitScore
    ? clamp01(Number(rawRoute.score))
    : hasExplicitShouldRun
      ? (rawRoute.shouldRun ? 1 : 0)
      : 1;
  const shouldRun = hasExplicitShouldRun ? rawRoute.shouldRun : score > 0;

  return Object.freeze({
    amplifierId,
    score: roundTo(score),
    shouldRun,
    reason: String(rawRoute?.reason || (shouldRun ? 'matched' : 'route_rejected')),
    matchedDomainCount: Math.max(0, Math.round(Number(rawRoute?.matchedDomainCount) || 0)),
    topMatch: normalizeAmplifierMatch(rawRoute?.topMatch),
    forceRun: false,
    routeError: null,
  });
}

function createRouteFailureSelection(amplifier, index, error) {
  return Object.freeze({
    amplifierId: getAmplifierId(amplifier, index),
    score: 1,
    shouldRun: true,
    reason: 'route_error_fallback',
    matchedDomainCount: 0,
    topMatch: null,
    forceRun: true,
    routeError: Object.freeze({
      code: String(error?.code || 'VERSEIR_AMPLIFIER_ROUTE_FAILED'),
      message: String(error?.message || error || 'unknown error'),
    }),
  });
}

async function scoreAmplifierRoute(amplifier, executionContext, index) {
  if (!amplifier || typeof amplifier.analyze !== 'function') {
    return Object.freeze({
      amplifierId: getAmplifierId(amplifier, index),
      score: 1,
      shouldRun: true,
      reason: 'invalid_plugin',
      matchedDomainCount: 0,
      topMatch: null,
      forceRun: true,
      routeError: null,
    });
  }

  if (typeof amplifier.route !== 'function') {
    return normalizeRouteResult(undefined, amplifier, index);
  }

  try {
    return normalizeRouteResult(await amplifier.route(executionContext), amplifier, index);
  } catch (error) {
    return createRouteFailureSelection(amplifier, index, error);
  }
}

function sortRouteSelections(left, right) {
  if (right.score !== left.score) return right.score - left.score;

  const rightWeight = Number(right?.amplifier?.claimedWeight) || 0;
  const leftWeight = Number(left?.amplifier?.claimedWeight) || 0;
  if (rightWeight !== leftWeight) return rightWeight - leftWeight;

  return String(left?.amplifierId || '').localeCompare(String(right?.amplifierId || ''));
}

function createDormantAmplifierResult(amplifier, index, selection) {
  const amplifierId = selection?.amplifierId || getAmplifierId(amplifier, index);
  const amplifierLabel = String(amplifier?.label || amplifierId).trim();

  let code = 'VERSEIR_AMPLIFIER_ROUTED_OUT';
  let severity = 'info';
  let message = `${amplifierLabel} remained dormant under routing.`;
  let commentary = `${amplifierLabel} remained dormant under MoE routing.`;

  switch (selection?.reason) {
    case 'no_domains':
      code = 'VERSEIR_AMPLIFIER_NO_DOMAINS';
      severity = 'warning';
      message = `${amplifierLabel} has no registered semantic domains.`;
      commentary = `${amplifierLabel} has no semantic domains to route.`;
      break;
    case 'no_tokens':
      message = `${amplifierLabel} remained dormant because the verse exposed no routable tokens.`;
      commentary = `${amplifierLabel} remained dormant because the verse exposed no routable tokens.`;
      break;
    case 'below_threshold':
      message = `${amplifierLabel} remained dormant because its routing score stayed below the activation threshold.`;
      commentary = `${amplifierLabel} remained dormant because its routing score stayed below the activation threshold.`;
      break;
    case 'not_top_k':
      message = `${amplifierLabel} remained dormant because higher-confidence amplifiers claimed the active slots.`;
      commentary = `${amplifierLabel} remained dormant because higher-confidence amplifiers claimed the active slots.`;
      break;
    case 'route_rejected':
    case 'no_match':
      message = `${amplifierLabel} remained dormant because the router found no relevant signal.`;
      commentary = `${amplifierLabel} remained dormant because the router found no relevant signal.`;
      break;
    default:
      break;
  }

  return createAmplifierResult({
    id: amplifierId,
    label: amplifierLabel,
    tier: normalizeAmplifierTier(amplifier?.tier),
    claimedWeight: Number(amplifier?.claimedWeight) || 0,
    diagnostics: [
      createAmplifierDiagnostic({
        message,
        severity,
        source: `verseir_amplifier:${amplifierId}`,
        metadata: {
          amplifierId,
          code,
          routingScore: Number(selection?.score) || 0,
          routingReason: String(selection?.reason || 'routed_out'),
          routingTopK: Number(selection?.routing?.topK) || 0,
          routingMinScore: Number(selection?.routing?.minScore) || 0,
          matchedDomainCount: Number(selection?.matchedDomainCount) || 0,
          topMatchId: selection?.topMatch?.id || null,
          topMatchLabel: selection?.topMatch?.label || null,
        },
      }),
    ],
    commentary,
  });
}

function normalizeAmplifierMatch(match) {
  const id = String(match?.id || '').trim();
  const label = String(match?.label || match?.id || '').trim();
  if (!id || !label) return null;

  return Object.freeze({
    id,
    label,
    hits: Math.max(0, Math.round(Number(match?.hits) || 0)),
    score: roundTo(clamp01(Number(match?.score) || 0)),
    coverage: roundTo(clamp01(Number(match?.coverage) || 0)),
    lineSpread: roundTo(clamp01(Number(match?.lineSpread) || 0)),
    tokens: Object.freeze(
      [...new Set(
        (Array.isArray(match?.tokens) ? match.tokens : [])
          .map((token) => String(token || '').trim())
          .filter(Boolean)
      )]
    ),
  });
}

function normalizeAmplifierArchetype(archetype) {
  const id = String(archetype?.id || '').trim();
  const label = String(archetype?.label || archetype?.id || '').trim();
  if (!id || !label) return null;

  return Object.freeze({
    id,
    label,
    score: roundTo(clamp01(Number(archetype?.score) || 0)),
  });
}

function freezeAmplifierPayload(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeAmplifierPayload));
  }

  if (value && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, freezeAmplifierPayload(nestedValue)])
      )
    );
  }

  return value;
}

function normalizeAmplifierDiagnostics(diagnostics, amplifierId) {
  return Object.freeze(
    (Array.isArray(diagnostics) ? diagnostics : [])
      .map((diagnostic) => createAmplifierDiagnostic({
        message: diagnostic?.message,
        severity: diagnostic?.severity,
        source: diagnostic?.source || `verseir_amplifier:${amplifierId}`,
        metadata: diagnostic?.metadata,
      }))
      .slice(0, MAX_DIAGNOSTICS)
  );
}

function sortMatches(matches) {
  return matches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.hits !== left.hits) return right.hits - left.hits;
    return left.label.localeCompare(right.label);
  });
}

function sortArchetypes(archetypes) {
  return archetypes.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.label.localeCompare(right.label);
  });
}

function createExecutionFailureResult(amplifier, index, message, code, metadata = {}) {
  const amplifierId = getAmplifierId(amplifier, index);
  const amplifierLabel = String(amplifier?.label || amplifierId).trim();

  return createAmplifierResult({
    id: amplifierId,
    label: amplifierLabel,
    tier: normalizeAmplifierTier(amplifier?.tier),
    claimedWeight: Number(amplifier?.claimedWeight) || 0,
    diagnostics: [
      createAmplifierDiagnostic({
        message,
        severity: 'error',
        source: `verseir_amplifier:${amplifierId}`,
        metadata: {
          amplifierId,
          code,
          ...metadata,
        },
      }),
    ],
    commentary: `${amplifierLabel} could not stabilize its signal.`,
  });
}

function normalizeAmplifierResult(rawResult, amplifier, index) {
  if (!rawResult || typeof rawResult !== 'object') {
    return createExecutionFailureResult(
      amplifier,
      index,
      `${String(amplifier?.label || getAmplifierId(amplifier, index)).trim()} returned an invalid payload.`,
      'VERSEIR_AMPLIFIER_INVALID_PAYLOAD'
    );
  }

  const amplifierId = getAmplifierId(rawResult?.id ? rawResult : amplifier, index);
  const amplifierLabel = String(rawResult?.label || amplifier?.label || amplifierId).trim();
  const matches = sortMatches(
    (Array.isArray(rawResult?.matches) ? rawResult.matches : [])
      .map(normalizeAmplifierMatch)
      .filter(Boolean)
  ).slice(0, MAX_MATCHES_PER_TIER);
  const archetypes = sortArchetypes(
    (Array.isArray(rawResult?.archetypes) ? rawResult.archetypes : [])
      .map(normalizeAmplifierArchetype)
      .filter(Boolean)
  ).slice(0, MAX_MATCHES_PER_TIER);

  const normalized = createAmplifierResult({
    id: amplifierId,
    label: amplifierLabel,
    tier: normalizeAmplifierTier(rawResult?.tier || amplifier?.tier),
    claimedWeight: Number(rawResult?.claimedWeight ?? amplifier?.claimedWeight) || 0,
    signal: rawResult?.signal,
    semanticDepth: rawResult?.semanticDepth,
    raritySignal: rawResult?.raritySignal,
    matches,
    archetypes,
    diagnostics: normalizeAmplifierDiagnostics(rawResult?.diagnostics, amplifierId),
    commentary: String(rawResult?.commentary || `${amplifierLabel} found no viable signal.`),
  });

  if (rawResult?.tokenBytecodes instanceof Map) {
    const normalizedWithBytecodes = Object.freeze({
      ...normalized,
      tokenBytecodes: new Map(rawResult.tokenBytecodes),
    });
    if (rawResult?.payload && typeof rawResult.payload === 'object') {
      return Object.freeze({
        ...normalizedWithBytecodes,
        payload: freezeAmplifierPayload(rawResult.payload),
      });
    }
    return normalizedWithBytecodes;
  }

  if (rawResult?.tokenBytecodes && typeof rawResult.tokenBytecodes === 'object') {
    const normalizedWithBytecodes = Object.freeze({
      ...normalized,
      tokenBytecodes: { ...rawResult.tokenBytecodes },
    });
    if (rawResult?.payload && typeof rawResult.payload === 'object') {
      return Object.freeze({
        ...normalizedWithBytecodes,
        payload: freezeAmplifierPayload(rawResult.payload),
      });
    }
    return normalizedWithBytecodes;
  }

  if (rawResult?.payload && typeof rawResult.payload === 'object') {
    return Object.freeze({
      ...normalized,
      payload: freezeAmplifierPayload(rawResult.payload),
    });
  }

  return normalized;
}

function freezeMatchesByTier(results) {
  const common = [];
  const rare = [];
  const inexplicable = [];

  for (const result of results) {
    const target = result?.tier === 'INEXPLICABLE'
      ? inexplicable
      : result?.tier === 'RARE'
        ? rare
        : common;
    if (Array.isArray(result?.matches)) {
      target.push(...result.matches);
    }
  }

  return Object.freeze({
    common: Object.freeze(sortMatches(common).slice(0, MAX_MATCHES_PER_TIER)),
    rare: Object.freeze(sortMatches(rare).slice(0, MAX_MATCHES_PER_TIER)),
    inexplicable: Object.freeze(sortMatches(inexplicable).slice(0, MAX_MATCHES_PER_TIER)),
  });
}

function mergeArchetypes(results, precisionScalar) {
  const aggregate = new Map();

  for (const result of results) {
    const dampedSignal = clamp01((Number(result?.signal) || 0) * precisionScalar);
    const archetypes = Array.isArray(result?.archetypes) ? result.archetypes : [];
    for (const archetype of archetypes) {
      if (!archetype?.id || !archetype?.label) continue;
      const existing = aggregate.get(archetype.id) || {
        id: archetype.id,
        label: archetype.label,
        score: 0,
      };
      existing.score += dampedSignal * clamp01(archetype.score);
      aggregate.set(archetype.id, existing);
    }
  }

  return Object.freeze(
    sortArchetypes(
      [...aggregate.values()].map((entry) => Object.freeze({
        ...entry,
        score: roundTo(clamp01(entry.score)),
      }))
    ).slice(0, 6)
  );
}

function determineDominantTier(matchesByTier) {
  if ((matchesByTier.inexplicable?.[0]?.score || 0) > 0) return 'INEXPLICABLE';
  if ((matchesByTier.rare?.[0]?.score || 0) > 0) return 'RARE';
  if ((matchesByTier.common?.[0]?.score || 0) > 0) return 'COMMON';
  return 'NONE';
}

function collectDiagnostics(results) {
  return Object.freeze(
    results
      .flatMap((result) => Array.isArray(result?.diagnostics) ? result.diagnostics : [])
      .slice(0, MAX_DIAGNOSTICS)
  );
}

function isAmplifierActive(result) {
  return (Number(result?.signal) || 0) > 0 || (Array.isArray(result?.matches) && result.matches.length > 0);
}

function computePrecisionScalar(activeAmplifiers) {
  if (activeAmplifiers <= 1) return 1;
  return roundTo(Math.max(
    MIN_PRECISION_SCALAR,
    1 - ((activeAmplifiers - 1) * PRECISION_DECAY_PER_ACTIVE_AMPLIFIER)
  ));
}

async function planAmplifierExecution(amplifiers, executionContext) {
  const routing = resolveRoutingConfig(executionContext?.options, amplifiers.length);
  const scoredSelections = await Promise.all(
    amplifiers.map(async (amplifier, index) => Object.freeze({
      amplifier,
      index,
      ...(await scoreAmplifierRoute(amplifier, executionContext, index)),
    }))
  );

  if (!routing.enabled) {
    return Object.freeze(
      scoredSelections.map((selection) => Object.freeze({
        ...selection,
        selected: true,
        routing,
      }))
    );
  }

  const forcedSelections = scoredSelections.filter((selection) => selection.forceRun);
  const selectedIds = new Set(forcedSelections.map((selection) => selection.amplifierId));
  const routedSelections = scoredSelections
    .filter((selection) => !selection.forceRun && selection.shouldRun && selection.score >= routing.minScore)
    .sort(sortRouteSelections)
    .slice(0, routing.topK);

  for (const selection of routedSelections) {
    selectedIds.add(selection.amplifierId);
  }

  return Object.freeze(
    scoredSelections.map((selection) => {
      let reason = selection.reason;
      if (!selectedIds.has(selection.amplifierId)) {
        if (!selection.shouldRun || selection.score <= 0) {
          reason = selection.reason || 'no_match';
        } else if (selection.score < routing.minScore) {
          reason = 'below_threshold';
        } else {
          reason = 'not_top_k';
        }
      }

      return Object.freeze({
        ...selection,
        reason,
        selected: selectedIds.has(selection.amplifierId),
        routing,
      });
    })
  );
}

function withRouteFallbackDiagnostic(rawResult, amplifier, index, routeResult) {
  if (!routeResult?.routeError || !rawResult || typeof rawResult !== 'object') {
    return rawResult;
  }

  const amplifierId = getAmplifierId(amplifier, index);
  return {
    ...rawResult,
    diagnostics: [
      ...(Array.isArray(rawResult?.diagnostics) ? rawResult.diagnostics : []),
      createAmplifierDiagnostic({
        severity: 'warning',
        source: `verseir_amplifier:${amplifierId}`,
        message: `${String(amplifier?.label || amplifierId).trim()} routing failed, so it executed in fallback mode.`,
        metadata: {
          amplifierId,
          code: routeResult.routeError.code,
          error: routeResult.routeError.message,
        },
      }),
    ],
  };
}

async function executeAmplifier(amplifier, executionContext, index) {
  if (!amplifier || typeof amplifier.analyze !== 'function') {
    return createExecutionFailureResult(
      amplifier,
      index,
      `${getAmplifierId(amplifier, index)} is missing an analyze() function.`,
      'VERSEIR_AMPLIFIER_INVALID_PLUGIN'
    );
  }

  const amplifierId = getAmplifierId(amplifier, index);
  const options = executionContext?.options;

  try {
    const rawResult = await withAmplifierTimeout(
      () => amplifier.analyze(executionContext),
      amplifierId,
      resolveAmplifierTimeoutMs(options, amplifierId)
    );
    return normalizeAmplifierResult(
      withRouteFallbackDiagnostic(rawResult, amplifier, index, executionContext?.routeResult),
      amplifier,
      index
    );
  } catch (error) {
    const code = error?.code || 'VERSEIR_AMPLIFIER_EXECUTION_FAILED';
    const message = code === 'VERSEIR_AMPLIFIER_TIMEOUT'
      ? `${String(amplifier?.label || amplifierId).trim()} timed out before it could resolve.`
      : `${String(amplifier?.label || amplifierId).trim()} failed during execution.`;
    return createExecutionFailureResult(amplifier, index, message, code, {
      error: String(error?.message || error || 'unknown error'),
      timeoutMs: Number(error?.timeoutMs) || undefined,
    });
  }
}

export async function runVerseIRAmplifiers(verseIR, options = {}) {
  const amplifiers = Array.isArray(options?.amplifiers) && options.amplifiers.length > 0
    ? options.amplifiers
    : DEFAULT_VERSEIR_AMPLIFIERS;
  const executionContext = Object.freeze({
    verseIR,
    options,
    tokenStats: collectVerseIRTokenStats(verseIR),
  });
  const executionPlan = await planAmplifierExecution(amplifiers, executionContext);
  const latencyMultiplier = roundTo(
    1 + (Math.max(0, executionPlan.filter((step) => step.selected).length - 1) * 0.18)
  );
  const normalizedResults = Object.freeze(
    await Promise.all(
      executionPlan.map((step) => (
        step.selected
          ? executeAmplifier(
            step.amplifier,
            Object.freeze({
              ...executionContext,
              routeResult: step,
            }),
            step.index
          )
          : Promise.resolve(createDormantAmplifierResult(step.amplifier, step.index, step))
      ))
    )
  );
  const activeAmplifiers = normalizedResults.filter(isAmplifierActive).length;
  const precisionScalar = computePrecisionScalar(activeAmplifiers);
  const results = Object.freeze(
    normalizedResults.map((rawResult) => {
      const effectiveSignal = clamp01((Number(rawResult?.signal) || 0) * precisionScalar);
      const effectiveSemanticDepth = clamp01((Number(rawResult?.semanticDepth) || 0) * precisionScalar);
      const effectiveRaritySignal = clamp01((Number(rawResult?.raritySignal) || 0) * precisionScalar);
      return Object.freeze({
        ...rawResult,
        claimedWeight: roundTo(Number(rawResult?.claimedWeight) || 0),
        effectiveSignal: roundTo(effectiveSignal),
        effectiveSemanticDepth: roundTo(effectiveSemanticDepth),
        effectiveRaritySignal: roundTo(effectiveRaritySignal),
        matches: Object.freeze(Array.isArray(rawResult?.matches) ? rawResult.matches : []),
        archetypes: Object.freeze(Array.isArray(rawResult?.archetypes) ? rawResult.archetypes : []),
        diagnostics: Object.freeze(Array.isArray(rawResult?.diagnostics) ? rawResult.diagnostics : []),
      });
    })
  );

  const weightedResults = results.filter((result) => isAmplifierActive(result) && (Number(result?.claimedWeight) || 0) > 0);
  const claimedWeight = roundTo(Math.min(
    VERSEIR_AMPLIFIER_NOVELTY_BUDGET,
    weightedResults.reduce((sum, result) => sum + (Number(result?.claimedWeight) || 0), 0)
  ));
  const noveltySignal = claimedWeight > 0
    ? clamp01(
      weightedResults.reduce((sum, result) => sum + ((Number(result?.effectiveSignal) || 0) * (Number(result?.claimedWeight) || 0)), 0)
      / claimedWeight
    )
    : 0;
  const semanticDepth = claimedWeight > 0
    ? clamp01(
      weightedResults.reduce((sum, result) => sum + ((Number(result?.effectiveSemanticDepth) || 0) * (Number(result?.claimedWeight) || 0)), 0)
      / claimedWeight
    )
    : 0;
  const raritySignal = claimedWeight > 0
    ? clamp01(
      weightedResults.reduce((sum, result) => sum + ((Number(result?.effectiveRaritySignal) || 0) * (Number(result?.claimedWeight) || 0)), 0)
      / claimedWeight
    )
    : 0;

  const matchesByTier = freezeMatchesByTier(results);
  const archetypeResonance = mergeArchetypes(results, precisionScalar);
  const dominantArchetype = archetypeResonance[0] || null;
  const pixelBrain = results.find((result) => result?.id === 'pixelbrain_phase1_bridge')?.payload || null;
  const trueVision = results.find((result) => result?.id === 'travelling_wave_filter_bank')?.payload || null;

  return Object.freeze({
    version: VERSEIR_AMPLIFIER_VERSION,
    activeAmplifiers,
    noveltyBudget: VERSEIR_AMPLIFIER_NOVELTY_BUDGET,
    claimedWeight,
    precisionScalar,
    latencyMultiplier,
    noveltySignal: roundTo(noveltySignal),
    semanticDepth: roundTo(semanticDepth),
    raritySignal: roundTo(raritySignal),
    impactMultiplier: roundTo(1 + (noveltySignal * semanticDepth * 0.12)),
    dominantTier: determineDominantTier(matchesByTier),
    dominantArchetype,
    archetypeResonance,
    elementMatches: matchesByTier,
    ...(pixelBrain ? { pixelBrain } : {}),
    trueVision,
    diagnostics: collectDiagnostics(results),
    amplifiers: results,
  });
}

export async function enhanceVerseIR(verseIR, options = {}) {
  if (!verseIR || typeof verseIR !== 'object') {
    return verseIR;
  }

  if (verseIR?.verseIRAmplifier && typeof verseIR.verseIRAmplifier === 'object') {
    return verseIR;
  }

  const verseIRAmplifier = await runVerseIRAmplifiers(verseIR, options);

  // Extract authoritative bytecodes from the phonetic color amplifier
  const colorResult = (Array.isArray(verseIRAmplifier.amplifiers) ? verseIRAmplifier.amplifiers : [])
    .find((a) => a.id === 'phonetic_color');
  const trueVisionResult = (Array.isArray(verseIRAmplifier.amplifiers) ? verseIRAmplifier.amplifiers : [])
    .find((a) => a.id === 'travelling_wave_filter_bank');
  const colorBytecodeMap = colorResult?.tokenBytecodes || new Map();
  const trueVisionBytecodeMap = trueVisionResult?.tokenBytecodes || new Map();
  const trueVision = verseIRAmplifier?.trueVision && typeof verseIRAmplifier.trueVision === 'object'
    ? Object.freeze(verseIRAmplifier.trueVision)
    : null;

  // Attach bytecodes to tokens in a new frozen tokens array
  const enhancedTokens = Object.freeze(
    (Array.isArray(verseIR.tokens) ? verseIR.tokens : []).map((token) => {
      const visualBytecode = colorBytecodeMap instanceof Map
        ? colorBytecodeMap.get(token.id)
        : colorBytecodeMap?.[token.id];
      const trueVisionBytecode = trueVisionBytecodeMap instanceof Map
        ? trueVisionBytecodeMap.get(token.id)
        : trueVisionBytecodeMap?.[token.id];

      if (!visualBytecode && !trueVisionBytecode) return token;

      return Object.freeze({
        ...token,
        ...(visualBytecode ? { visualBytecode: Object.freeze(visualBytecode) } : {}),
        ...(trueVisionBytecode ? { trueVisionBytecode: Object.freeze(trueVisionBytecode) } : {}),
      });
    })
  );

  return Object.freeze({
    ...verseIR,
    tokens: enhancedTokens,
    semanticDepth: verseIRAmplifier.semanticDepth,
    archetypeResonance: verseIRAmplifier.archetypeResonance,
    elementMatches: verseIRAmplifier.elementMatches,
    ...(trueVision ? { trueVision } : {}),
    verseIRAmplifier,
  });
}

export function attachVerseIRAmplifier(analyzedDoc, verseIRAmplifier) {
  if (!analyzedDoc || typeof analyzedDoc !== 'object' || !verseIRAmplifier || typeof verseIRAmplifier !== 'object') {
    return analyzedDoc;
  }

  return {
    ...analyzedDoc,
    parsed: {
      ...(analyzedDoc.parsed && typeof analyzedDoc.parsed === 'object' ? analyzedDoc.parsed : {}),
      verseIRAmplifier,
    },
  };
}
