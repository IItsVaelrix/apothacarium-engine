export const VERSEIR_AMPLIFIER_VERSION = '1.0.0';
export const VERSEIR_AMPLIFIER_NOVELTY_BUDGET = 0.15;
export const DEFAULT_VERSEIR_AMPLIFIER_WEIGHT = 0.05;

const TOKEN_NORMALIZE_REGEX = /[^a-z0-9'-]/g;
const DOMAIN_DENSITY_TARGET_SHARE = 0.18;
const AMPLIFIER_TIERS = new Set(['COMMON', 'RARE', 'INEXPLICABLE']);
const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error', 'success']);

export function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function roundTo(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function normalizeToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(TOKEN_NORMALIZE_REGEX, '')
    .replace(/^['-]+|['-]+$/g, '');
}

export function normalizeAmplifierTier(tier) {
  const normalized = String(tier || '').trim().toUpperCase();
  return AMPLIFIER_TIERS.has(normalized) ? normalized : 'COMMON';
}

export function createAmplifierDiagnostic({
  message,
  severity = 'error',
  source = 'verseir_amplifier',
  metadata = {},
} = {}) {
  return Object.freeze({
    start: 0,
    end: 0,
    severity: DIAGNOSTIC_SEVERITIES.has(String(severity || '').trim().toLowerCase())
      ? String(severity).trim().toLowerCase()
      : 'error',
    source: String(source || 'verseir_amplifier'),
    message: String(message || 'VerseIR amplifier anomaly detected.'),
    metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
  });
}

export function createAmplifierResult({
  id,
  label,
  tier,
  claimedWeight = DEFAULT_VERSEIR_AMPLIFIER_WEIGHT,
  signal = 0,
  semanticDepth = 0,
  raritySignal = 0,
  matches = [],
  archetypes = [],
  diagnostics = [],
  commentary = '',
} = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedLabel = String(label || normalizedId).trim();

  return Object.freeze({
    id: normalizedId,
    label: normalizedLabel,
    tier: normalizeAmplifierTier(tier),
    claimedWeight: roundTo(clamp01(Number(claimedWeight) || 0)),
    signal: roundTo(clamp01(Number(signal) || 0)),
    semanticDepth: roundTo(clamp01(Number(semanticDepth) || 0)),
    raritySignal: roundTo(clamp01(Number(raritySignal) || 0)),
    matches: Object.freeze(Array.isArray(matches) ? [...matches] : []),
    archetypes: Object.freeze(Array.isArray(archetypes) ? [...archetypes] : []),
    diagnostics: Object.freeze(Array.isArray(diagnostics) ? [...diagnostics] : []),
    commentary: String(commentary || `${normalizedLabel || 'VerseIR amplifier'} found no viable signal.`),
  });
}

function normalizeDomainArchetype(archetype) {
  const id = String(archetype?.id || '').trim();
  const label = String(archetype?.label || archetype?.id || '').trim();
  if (!id || !label) return null;

  return Object.freeze({
    id,
    label,
    weight: clamp01(archetype?.weight ?? 0.5),
  });
}

function normalizeDomainRecord(domain) {
  const id = String(domain?.id || '').trim();
  const label = String(domain?.label || domain?.id || '').trim();
  const lexemes = Object.freeze(
    [...new Set(
      (Array.isArray(domain?.lexemes) ? domain.lexemes : [])
        .map((lexeme) => normalizeToken(lexeme))
        .filter(Boolean)
    )]
  );

  if (!id || !label || lexemes.length === 0) return null;

  return Object.freeze({
    id,
    label,
    lexemes,
    archetypes: Object.freeze(
      (Array.isArray(domain?.archetypes) ? domain.archetypes : [])
        .map(normalizeDomainArchetype)
        .filter(Boolean)
    ),
  });
}

function normalizeDomainCollection(domains) {
  if (!Array.isArray(domains)) {
    return Object.freeze([]);
  }

  return Object.freeze(
    domains
      .map(normalizeDomainRecord)
      .filter(Boolean)
  );
}

function hasAmplifierConfig(config, amplifierId) {
  if (!config) return false;
  if (config instanceof Map) return config.has(amplifierId);
  if (typeof config === 'object') {
    return Object.prototype.hasOwnProperty.call(config, amplifierId);
  }
  return false;
}

function readAmplifierConfig(config, amplifierId) {
  if (!config) return undefined;
  if (config instanceof Map) return config.get(amplifierId);
  if (typeof config === 'object') return config[amplifierId];
  return undefined;
}

export function resolveAmplifierDomains({
  amplifierId,
  domains,
  context = {},
} = {}) {
  const options = context?.options && typeof context.options === 'object'
    ? context.options
    : {};
  const baseDomains = normalizeDomainCollection(
    typeof domains === 'function' ? domains(context) : domains
  );
  const hasOverride = hasAmplifierConfig(options.domainOverrides, amplifierId);
  const overrideDomains = hasOverride
    ? normalizeDomainCollection(readAmplifierConfig(options.domainOverrides, amplifierId))
    : null;
  const extensionDomains = normalizeDomainCollection(
    readAmplifierConfig(options.domainExtensions, amplifierId)
  );

  return Object.freeze(
    hasOverride
      ? [...(overrideDomains || []), ...extensionDomains]
      : [...baseDomains, ...extensionDomains]
  );
}

export function collectVerseIRTokenStats(verseIR) {
  const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
  const tokenCounts = new Map();
  const tokenIndex = new Map();
  const observedLineIndexes = new Set();

  for (const token of tokens) {
    const normalized = normalizeToken(token?.normalized || token?.text);
    if (!normalized) continue;
    const lineIndex = Number.isInteger(token?.lineIndex) ? token.lineIndex : 0;
    observedLineIndexes.add(lineIndex);
    tokenCounts.set(normalized, (tokenCounts.get(normalized) || 0) + 1);

    const existing = tokenIndex.get(normalized) || {
      hits: 0,
      lineIndexes: new Set(),
    };
    existing.hits += 1;
    existing.lineIndexes.add(lineIndex);
    tokenIndex.set(normalized, existing);
  }

  return {
    tokenCounts,
    tokenIndex,
    totalTokens: [...tokenCounts.values()].reduce((sum, count) => sum + count, 0),
    lineCount: Array.isArray(verseIR?.lines) && verseIR.lines.length > 0
      ? verseIR.lines.length
      : Math.max(1, observedLineIndexes.size),
  };
}

function resolveTokenStatsFromContext(context = {}) {
  if (context?.tokenStats && typeof context.tokenStats === 'object') {
    return context.tokenStats;
  }
  return collectVerseIRTokenStats(context?.verseIR);
}

function buildMatchRecords(domains, tokenIndex, tokenCounts, tierResonance, lineCount, totalTokens) {
  const matches = [];
  const densityTarget = Math.max(2, Math.ceil(Math.max(1, totalTokens) * DOMAIN_DENSITY_TARGET_SHARE));

  for (const domain of domains) {
    const lexemes = Array.isArray(domain?.lexemes) ? domain.lexemes : [];
    if (lexemes.length === 0) continue;

    const matchedTokens = lexemes.filter((lexeme) => tokenIndex.has(lexeme));
    if (matchedTokens.length === 0) continue;

    let hits = 0;
    const matchedLineIndexes = new Set();
    for (const matchedToken of matchedTokens) {
      const tokenMeta = tokenIndex.get(matchedToken);
      if (!tokenMeta) continue;
      hits += tokenMeta.hits;
      tokenMeta.lineIndexes.forEach((lineIndex) => matchedLineIndexes.add(lineIndex));
    }

    const coverage = matchedTokens.length / lexemes.length;
    // A domain feels materially present once it occupies roughly a fifth of the verse's live lexicon.
    const density = clamp01(hits / densityTarget);
    const lineSpread = clamp01(matchedLineIndexes.size / Math.max(1, lineCount));
    const score = clamp01(((coverage * 0.45) + (density * 0.35) + (lineSpread * 0.20)) * tierResonance);

    matches.push(Object.freeze({
      id: String(domain.id || ''),
      label: String(domain.label || domain.id || ''),
      hits,
      score: roundTo(score),
      coverage: roundTo(coverage),
      lineSpread: roundTo(lineSpread),
      tokens: Object.freeze([...matchedTokens].sort((left, right) => {
        const leftCount = tokenCounts.get(left) || 0;
        const rightCount = tokenCounts.get(right) || 0;
        if (rightCount !== leftCount) return rightCount - leftCount;
        return left.localeCompare(right);
      })),
      archetypes: Object.freeze(Array.isArray(domain?.archetypes) ? [...domain.archetypes] : []),
    }));
  }

  return matches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.hits !== left.hits) return right.hits - left.hits;
    return left.label.localeCompare(right.label);
  });
}

export function estimateTierAmplifierRoute({
  amplifierId,
  domains,
  context = {},
  tierResonance = 1,
} = {}) {
  const resolvedDomains = resolveAmplifierDomains({
    amplifierId,
    domains,
    context,
  });

  if (resolvedDomains.length === 0) {
    return Object.freeze({
      score: 0,
      shouldRun: false,
      reason: 'no_domains',
      matchedDomainCount: 0,
      topMatch: null,
    });
  }

  const {
    tokenCounts,
    tokenIndex,
    totalTokens,
    lineCount,
  } = resolveTokenStatsFromContext(context);

  if (!(tokenIndex instanceof Map) || tokenIndex.size === 0 || totalTokens <= 0) {
    return Object.freeze({
      score: 0,
      shouldRun: false,
      reason: 'no_tokens',
      matchedDomainCount: 0,
      topMatch: null,
    });
  }

  const matches = buildMatchRecords(
    resolvedDomains,
    tokenIndex,
    tokenCounts,
    clamp01(Number(tierResonance) || 1),
    lineCount,
    totalTokens
  );
  const topMatch = matches[0] || null;

  return Object.freeze({
    score: roundTo(clamp01(topMatch?.score || 0)),
    shouldRun: Boolean(topMatch),
    reason: topMatch ? 'matched' : 'no_match',
    matchedDomainCount: matches.length,
    topMatch: topMatch ? toPublicMatch(topMatch) : null,
  });
}

function toPublicMatch(match) {
  return Object.freeze({
    id: String(match?.id || '').trim(),
    label: String(match?.label || match?.id || '').trim(),
    hits: Math.max(0, Number(match?.hits) || 0),
    score: roundTo(clamp01(Number(match?.score) || 0)),
    coverage: roundTo(clamp01(Number(match?.coverage) || 0)),
    lineSpread: roundTo(clamp01(Number(match?.lineSpread) || 0)),
    tokens: Object.freeze(Array.isArray(match?.tokens) ? [...match.tokens] : []),
  });
}

function buildArchetypeScores(matches) {
  const archetypes = new Map();

  for (const match of matches) {
    const resonance = clamp01(match.score);
    for (const archetype of match.archetypes) {
      if (!archetype?.id || !archetype?.label) continue;
      const existing = archetypes.get(archetype.id) || {
        id: archetype.id,
        label: archetype.label,
        score: 0,
      };
      existing.score += resonance * clamp01(archetype.weight);
      archetypes.set(archetype.id, existing);
    }
  }

  return Object.freeze(
    [...archetypes.values()]
      .map((archetype) => ({
        ...archetype,
        score: roundTo(clamp01(archetype.score)),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.label.localeCompare(right.label);
      })
      .slice(0, 4)
      .map((archetype) => Object.freeze(archetype))
  );
}

function buildCommentary(label, tierLabel, matches, topArchetype) {
  if (matches.length === 0) {
    return `${label} found no living syntax to amplify.`;
  }

  const topMatch = matches[0];
  const tokenList = topMatch.tokens.slice(0, 3).join(', ');
  if (topArchetype?.label) {
    return `${label} traces ${tierLabel.toLowerCase()} matter through ${topMatch.label} and leans toward ${topArchetype.label}. (${tokenList})`;
  }
  return `${label} traces ${tierLabel.toLowerCase()} matter through ${topMatch.label}. (${tokenList})`;
}

function buildDiagnostics(matches, tierLabel, amplifierId) {
  return Object.freeze(
    matches
      .slice(0, 4)
      .map((match) => createAmplifierDiagnostic({
        severity: tierLabel === 'INEXPLICABLE'
          ? 'success'
          : tierLabel === 'RARE'
            ? 'info'
            : 'warning',
        source: `verseir_amplifier:${amplifierId}`,
        message: `${tierLabel} resonance detected in ${match.label}.`,
        metadata: {
          words: [...match.tokens],
          tier: tierLabel,
          domain: match.id,
          hits: match.hits,
          score: match.score,
        },
      }))
  );
}

export function createTierAmplifier({
  id,
  label,
  tier,
  domains,
  claimedWeight = DEFAULT_VERSEIR_AMPLIFIER_WEIGHT,
  tierResonance = 1,
} = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedLabel = String(label || normalizedId).trim();
  const normalizedTier = normalizeAmplifierTier(tier);
  const safeClaimedWeight = clamp01(Number(claimedWeight) || DEFAULT_VERSEIR_AMPLIFIER_WEIGHT);
  const safeTierResonance = clamp01(Number(tierResonance) || 1);

  return Object.freeze({
    id: normalizedId,
    label: normalizedLabel,
    tier: normalizedTier,
    claimedWeight: roundTo(safeClaimedWeight),
    route(context = {}) {
      return estimateTierAmplifierRoute({
        amplifierId: normalizedId,
        domains,
        context,
        tierResonance: safeTierResonance,
      });
    },
    async analyze(context = {}) {
      try {
        const resolvedDomains = resolveAmplifierDomains({
          amplifierId: normalizedId,
          domains,
          context,
        });

        if (resolvedDomains.length === 0) {
          return createAmplifierResult({
            id: normalizedId,
            label: normalizedLabel,
            tier: normalizedTier,
            claimedWeight: safeClaimedWeight,
            diagnostics: [
              createAmplifierDiagnostic({
                severity: 'warning',
                source: `verseir_amplifier:${normalizedId}`,
                message: `${normalizedLabel} has no registered semantic domains.`,
                metadata: {
                  amplifierId: normalizedId,
                  code: 'VERSEIR_AMPLIFIER_NO_DOMAINS',
                },
              }),
            ],
            commentary: `${normalizedLabel} has no semantic domains to read.`,
          });
        }

        const {
          tokenCounts,
          tokenIndex,
          totalTokens,
          lineCount,
        } = resolveTokenStatsFromContext(context);
        const matches = buildMatchRecords(
          resolvedDomains,
          tokenIndex,
          tokenCounts,
          safeTierResonance,
          lineCount,
          totalTokens
        );

        if (matches.length === 0) {
          return createAmplifierResult({
            id: normalizedId,
            label: normalizedLabel,
            tier: normalizedTier,
            claimedWeight: safeClaimedWeight,
            commentary: `${normalizedLabel} found no viable signal.`,
          });
        }

        const topMatches = matches.slice(0, 3);
        const averageScore = topMatches.reduce((sum, match) => sum + match.score, 0) / topMatches.length;
        const averageCoverage = topMatches.reduce((sum, match) => sum + match.coverage, 0) / topMatches.length;
        const averageLineSpread = topMatches.reduce((sum, match) => sum + match.lineSpread, 0) / topMatches.length;
        const archetypes = buildArchetypeScores(topMatches);
        const archetypeLead = archetypes[0]?.score || 0;
        const semanticDepth = clamp01((averageScore * 0.6) + (averageCoverage * 0.25) + (averageLineSpread * 0.15));
        const raritySignal = clamp01((safeTierResonance * 0.4) + (averageScore * 0.35) + (averageCoverage * 0.25));
        const signal = clamp01((semanticDepth * 0.45) + (raritySignal * 0.25) + (archetypeLead * 0.30));

        return createAmplifierResult({
          id: normalizedId,
          label: normalizedLabel,
          tier: normalizedTier,
          claimedWeight: safeClaimedWeight,
          signal,
          semanticDepth,
          raritySignal,
          matches: topMatches.map(toPublicMatch),
          archetypes,
          diagnostics: buildDiagnostics(topMatches, normalizedTier, normalizedId),
          commentary: buildCommentary(normalizedLabel, normalizedTier, topMatches, archetypes[0] || null),
        });
      } catch (error) {
        return createAmplifierResult({
          id: normalizedId,
          label: normalizedLabel,
          tier: normalizedTier,
          claimedWeight: safeClaimedWeight,
          diagnostics: [
            createAmplifierDiagnostic({
              severity: 'error',
              source: `verseir_amplifier:${normalizedId}`,
              message: `${normalizedLabel} failed during analysis.`,
              metadata: {
                amplifierId: normalizedId,
                code: error?.code || 'VERSEIR_AMPLIFIER_ANALYZE_FAILED',
                error: String(error?.message || error || 'unknown error'),
              },
            }),
          ],
          commentary: `${normalizedLabel} faltered before it could stabilize.`,
        });
      }
    },
  });
}
