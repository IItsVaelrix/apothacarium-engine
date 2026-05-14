/**
 * Clerical RAID — Phase 4 learning loop: Merlin vector extract, clustering, deprecation, scoring.
 */

import { bugToVector } from './clerical-raid.vector.js';
import { cosineSimilarity, Pattern } from './clerical-raid.core.js';
import { AGENT_INDEX } from './clerical-raid.schema.js';

/** Deterministic id fragment (no wall clock in codex/core). */
function stableReportKey(raw) {
  const s = `${raw.title ?? ''}\x1e${raw.summary ?? ''}\x1e${raw.observed_behavior ?? raw.observedBehavior ?? ''}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function asLines(text) {
  if (text == null) return [];
  if (Array.isArray(text)) return text.map(String).filter(Boolean);
  return String(text)
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Normalize collab / Merlin / CLI JSON into a BugReport for `raid.query`.
 * @param {Record<string, unknown>} raw
 */
export function merlinReportToBugReport(raw) {
  const symptoms = [];
  const push = v => {
    if (v != null && String(v).trim()) symptoms.push(String(v).trim());
  };
  push(raw.title);
  push(raw.summary);
  push(raw.observed_behavior);
  if (raw.observedBehavior) push(raw.observedBehavior);
  for (const line of asLines(raw.repro_steps ?? raw.reproSteps)) push(line);

  const filePaths = [];
  if (raw.module_id) filePaths.push(String(raw.module_id));
  if (raw.moduleId) filePaths.push(String(raw.moduleId));
  if (Array.isArray(raw.filePaths)) filePaths.push(...raw.filePaths.map(String));
  if (typeof raw.file_paths === 'string') {
    try {
      const parsed = JSON.parse(raw.file_paths);
      if (Array.isArray(parsed)) filePaths.push(...parsed.map(String));
    } catch {
      filePaths.push(raw.file_paths);
    }
  }

  const errorMessages = [];
  if (raw.bytecode) errorMessages.push(String(raw.bytecode));
  if (raw.errorMessage) errorMessages.push(String(raw.errorMessage));
  if (raw.expected_behavior) errorMessages.push(`expected: ${raw.expected_behavior}`);
  if (raw.expectedBehavior) errorMessages.push(`expected: ${raw.expectedBehavior}`);

  const layerHint =
    (typeof raw.category === 'string' && raw.category) ||
    (typeof raw.module_id === 'string' && raw.module_id) ||
    null;

  let ts = 0;
  if (raw.updated_at) {
    const n = Date.parse(String(raw.updated_at));
    if (!Number.isNaN(n)) ts = n;
  } else if (raw.created_at) {
    const n = Date.parse(String(raw.created_at));
    if (!Number.isNaN(n)) ts = n;
  }

  return {
    symptoms,
    filePaths,
    errorMessages,
    layerHint,
    timestamp: ts
  };
}

/**
 * Dense vector for a Merlin-shaped report (Phase 4 — automatic extract).
 * @param {Record<string, unknown>} raw
 * @param {number} seed
 */
export function extractVectorFromMerlinReport(raw, seed = 42) {
  return bugToVector(merlinReportToBugReport(raw), seed);
}

/**
 * Build a Pattern from Merlin report fields (for NOVEL auto-train).
 * @param {Record<string, unknown>} raw
 */
export function merlinReportToPattern(raw) {
  const br = merlinReportToBugReport(raw);
  const idRaw = raw.id != null ? String(raw.id) : `t${stableReportKey(raw)}`;
  const id = idRaw.startsWith('PAT-') ? idRaw : `PAT-MERLIN-${idRaw}`;
  const name = (typeof raw.title === 'string' && raw.title) || id;
  const fix =
    (typeof raw.recovery_hints === 'string' && raw.recovery_hints) ||
    (typeof raw.recoveryHints === 'string' && raw.recoveryHints) ||
    '';
  const owner = AGENT_INDEX.BLACKBOX;
  const baseConf = 0.55;
  return new Pattern(id, name, br.symptoms, br.filePaths, br.errorMessages, owner, fix, baseConf);
}

/**
 * Query then train when the library has no strong match (Merlin auto-train pipeline).
 * Trains on NOVEL and, by default, on NEEDS_MERLIN so ambiguous reports still become memory.
 * Skips CONFIRMED / DENIED to avoid duplicating known or rejected weak matches.
 * @param {import('./clerical-raid.core.js').ClericalRAID} raid
 * @param {Record<string, unknown>} raw
 * @param {{ train?: boolean, trainNeedsMerlin?: boolean }} [options]
 */
export function autoTrainFromMerlinReport(raid, raw, options = {}) {
  const train = options.train !== false;
  const trainNeedsMerlin = options.trainNeedsMerlin !== false;
  const bugReport = merlinReportToBugReport(raw);
  const queryResult = raid.query(bugReport);
  let trained = null;
  const v = queryResult.verdict;
  const shouldTrain =
    train &&
    (v === 'NOVEL' || (trainNeedsMerlin && v === 'NEEDS_MERLIN'));
  if (shouldTrain) {
    const pattern = merlinReportToPattern(raw);
    trained = raid.train(pattern);
  }
  return { query: queryResult, trained, bugReport };
}

/**
 * Effective confidence blending static pattern weight with hit/miss feedback.
 * @param {import('./clerical-raid.core.js').Pattern} pattern
 */
export function patternEffectivenessScore(pattern) {
  const hits = pattern.hitCount ?? 0;
  const misses = pattern.missCount ?? 0;
  const n = hits + misses;
  const rate = n === 0 ? 0.5 : hits / n;
  const c = typeof pattern.confidence === 'number' ? pattern.confidence : 0.5;
  return Math.min(1, Math.max(0, 0.5 * c + 0.5 * rate));
}

/**
 * Greedy clustering by cosine similarity over trained pattern vectors (novelty / redundancy).
 * @param {import('./clerical-raid.core.js').ClericalRAID} raid
 * @param {number} minSimilarity
 * @returns {string[][]} clusters of pattern ids
 */
export function clusterPatternsBySimilarity(raid, minSimilarity = 0.92) {
  const active = raid.patterns.filter(p => p.vector && !p.deprecated);
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < active.length; i++) {
    const root = active[i];
    if (assigned.has(root.id)) continue;
    const group = [root.id];
    assigned.add(root.id);
    for (let j = i + 1; j < active.length; j++) {
      const other = active[j];
      if (assigned.has(other.id)) continue;
      const sim = cosineSimilarity(root.vector, other.vector);
      if (sim >= minSimilarity) {
        group.push(other.id);
        assigned.add(other.id);
      }
    }
    clusters.push(group);
  }
  return clusters;
}

/**
 * Mark patterns with sustained negative feedback as deprecated (Phase 4).
 * @param {import('./clerical-raid.core.js').ClericalRAID} raid
 * @param {{ minFeedback?: number, missRatio?: number }} [opts]
 * @returns {string[]} ids deprecated this run
 */
export function deprecateStalePatterns(raid, opts = {}) {
  const minFeedback = opts.minFeedback ?? 6;
  const missRatio = opts.missRatio ?? 0.82;
  const deprecatedIds = [];
  for (const p of raid.patterns) {
    if (p.deprecated) continue;
    const hits = p.hitCount ?? 0;
    const misses = p.missCount ?? 0;
    const total = hits + misses;
    if (total < minFeedback) continue;
    if (misses / total >= missRatio) {
      p.deprecated = true;
      deprecatedIds.push(p.id);
    }
  }
  return deprecatedIds;
}

/**
 * Pairs of patterns that are near-duplicates (for dedupe review).
 * @param {import('./clerical-raid.core.js').ClericalRAID} raid
 * @param {number} minSimilarity
 * @returns {{ a: string, b: string, similarity: number }[]}
 */
export function findNearDuplicatePatterns(raid, minSimilarity = 0.97) {
  const active = raid.patterns.filter(p => p.vector && !p.deprecated);
  const out = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const sim = cosineSimilarity(active[i].vector, active[j].vector);
      if (sim >= minSimilarity) {
        out.push({ a: active[i].id, b: active[j].id, similarity: sim });
      }
    }
  }
  out.sort((x, y) => y.similarity - x.similarity);
  return out;
}
