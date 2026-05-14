import { normalizeGraphToken } from '../token-graph/types.js';

function uniqueTokenEntries(entries = []) {
  const tokenWeights = new Map();

  entries.forEach((entry) => {
    if (!entry) return;
    const token = normalizeGraphToken(entry.token ?? entry);
    if (!token) return;
    const weight = Number(entry.weight);
    const normalizedWeight = Number.isFinite(weight) && weight > 0 ? weight : 0.5;
    tokenWeights.set(token, Math.max(tokenWeights.get(token) || 0, normalizedWeight));
  });

  return [...tokenWeights.entries()]
    .map(([token, weight]) => ({ token, weight }))
    .sort((entryA, entryB) => {
      if (entryB.weight !== entryA.weight) return entryB.weight - entryA.weight;
      return entryA.token.localeCompare(entryB.token);
    });
}

export function buildActivationAnchorTokens(context = {}) {
  const entries = [];

  if (context.currentToken) {
    entries.push({ token: context.currentToken, weight: 0.88 });
  }
  if (context.prevToken) {
    entries.push({ token: context.prevToken, weight: 0.84 });
  }
  if (context.lineEndToken) {
    entries.push({ token: context.lineEndToken, weight: 0.8 });
  }

  (Array.isArray(context.anchorTokens) ? context.anchorTokens : []).forEach((entry) => {
    entries.push(entry);
  });

  return uniqueTokenEntries(entries);
}

export function getAnchorSeedTokens(context = {}) {
  return buildActivationAnchorTokens(context).map((entry) => entry.token);
}

export function getPrimaryPhoneticAnchors(context = {}, limit = 6) {
  return getAnchorSeedTokens(context).slice(0, limit);
}
