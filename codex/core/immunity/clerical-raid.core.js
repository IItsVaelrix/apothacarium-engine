/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    CLERICAL RAID: THE CORE ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TurboQuant purification + dense cosine nearest-neighbor over the pattern
 * library (PDR: Clerical RAID). Quantized shells are kept for persistence
 * and memory accounting; similarity for verdicts uses full 128-dim cosine.
 *
 * @author   Merlin Data (Testing/QA)
 * @bytecode SCHOL-CLERICAL-RAID-ENGINE
 * @version  1.0.0
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { fastHadamardTransform, quantizeF32To4Bit } from '../quantization/turboquant.js';
import { bugToVector } from './clerical-raid.vector.js';
import { VERDICT_THRESHOLDS, AGENT_NAMES } from './clerical-raid.schema.js';

const VERDICT_STAT_KEYS = Object.freeze({
  CONFIRMED: 'confirmed',
  DENIED: 'denied',
  NEEDS_MERLIN: 'needsMerlin',
  NOVEL: 'novel'
});

/** Cosine similarity in [-1, 1] (PDR verdict thresholds assume non-negative overlap). */
export function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom <= 0) return 0;
  return dot / denom;
}

/**
 * THE PATTERN OBJECT — immune memory entry
 */
export class Pattern {
  constructor(id, name, symptoms, filePaths, errorMessages, owner, fixPath, confidence = 1.0) {
    this.id = id;
    this.name = name;
    this.symptoms = symptoms;
    this.filePaths = filePaths;
    this.errorMessages = errorMessages;
    this.owner = owner;
    this.fixPath = fixPath;
    this.confidence = confidence;
    /** Phase 4 — feedback / lifecycle */
    this.hitCount = 0;
    this.missCount = 0;
    /** @type {number | null} */
    this.lastConfirmedAt = null;
    this.deprecated = false;
    /** Library ordinal set in {@link ClericalRAID.train} (no wall clock in core). */
    this.addedAt = -1;
    /** @type {Float32Array | null} */
    this.vector = null;
    /** @type {{ data: Uint8Array, norm: number } | null} */
    this.quantized = null;
  }
}

export class ClericalRAID {
  constructor(options = {}) {
    this.patterns = [];
    this.quantizedPatterns = [];
    this.capacity = options.capacity ?? 10;
    this.seed = options.seed ?? 42;
    /** Monotonic stamp for confirmations (deterministic ordering; not wall time). */
    this._confirmSeq = 0;

    this.stats = {
      queries: 0,
      confirmed: 0,
      denied: 0,
      needsMerlin: 0,
      novel: 0
    };
  }

  scan(bugReport) {
    const { symptoms = [], filePaths = [], layerHint = null, errorMessages = [] } = bugReport;
    return { symptoms, filePaths, layerHint, errorMessages, vector: null };
  }

  purify(denseVec) {
    const dim = denseVec.length;
    const vec = new Float32Array(denseVec);

    let sumSq = 0;
    for (let i = 0; i < dim; i++) sumSq += vec[i] * vec[i];
    const norm = Math.sqrt(sumSq);
    if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm;

    for (let i = 0; i < dim; i++) {
      let value = this.seed ^ i;
      let setBits = 0;
      while (value > 0) {
        value &= value - 1;
        setBits += 1;
      }
      if (setBits % 2 === 1) vec[i] *= -1.0;
    }

    fastHadamardTransform(vec);

    const packedData = new Uint8Array(Math.ceil(dim / 2));
    for (let i = 0; i < dim; i += 2) {
      const q1 = quantizeF32To4Bit(vec[i]);
      const q2 = i + 1 < dim ? quantizeF32To4Bit(vec[i + 1]) : 0;
      packedData[Math.floor(i / 2)] = (q1 << 4) | (q2 & 0x0f);
    }

    return { data: packedData, norm };
  }

  /**
   * Top-K nearest patterns by dense cosine similarity (exact for library size N).
   */
  searchDense(queryVec, k = 5) {
    const scored = [];
    for (let i = 0; i < this.patterns.length; i++) {
      const pattern = this.patterns[i];
      if (!pattern.vector || pattern.deprecated) continue;
      const distance = cosineSimilarity(queryVec, pattern.vector);
      scored.push({ pattern, distance });
    }
    scored.sort((x, y) => y.distance - x.distance);
    return scored.slice(0, k);
  }

  verdict(neighbors) {
    if (neighbors.length === 0) {
      return {
        verdict: 'NOVEL',
        confidence: 0,
        matchedPattern: null,
        fixPath: null,
        owner: 'Unknown',
        escalationRequired: true
      };
    }

    const best = neighbors[0];
    const confidence = Math.min(1, Math.max(0, best.distance));

    if (confidence >= VERDICT_THRESHOLDS.CONFIRMED) {
      return {
        verdict: 'CONFIRMED',
        confidence,
        matchedPattern: best.pattern,
        fixPath: best.pattern.fixPath,
        owner: AGENT_NAMES[best.pattern.owner] || 'Unknown',
        escalationRequired: false
      };
    }

    if (confidence < VERDICT_THRESHOLDS.NOVEL) {
      return {
        verdict: 'NOVEL',
        confidence,
        matchedPattern: null,
        fixPath: null,
        owner: 'Unknown',
        escalationRequired: true
      };
    }

    if (confidence < VERDICT_THRESHOLDS.DENIED) {
      return {
        verdict: 'DENIED',
        confidence,
        matchedPattern: best.pattern,
        fixPath: null,
        owner: AGENT_NAMES[best.pattern.owner] || 'Unknown',
        escalationRequired: true
      };
    }

    return {
      verdict: 'NEEDS_MERLIN',
      confidence,
      matchedPattern: best.pattern,
      fixPath: best.pattern.fixPath,
      owner: AGENT_NAMES[best.pattern.owner] || 'Unknown',
      escalationRequired: true
    };
  }

  query(bugReport) {
    this.stats.queries++;
    const denseVec = bugToVector(bugReport, this.seed);
    const neighbors = this.searchDense(denseVec, this.capacity);
    const result = this.verdict(neighbors);
    const statKey = VERDICT_STAT_KEYS[result.verdict];
    if (statKey) this.stats[statKey]++;

    return {
      ...result,
      neighbors: neighbors.map(n => ({
        patternId: n.pattern.id,
        pattern: n.pattern.name,
        similarity: n.distance
      }))
    };
  }

  train(pattern) {
    pattern.vector = bugToVector(
      {
        symptoms: pattern.symptoms,
        filePaths: pattern.filePaths,
        errorMessages: pattern.errorMessages
      },
      this.seed
    );
    pattern.quantized = this.purify(pattern.vector);
    pattern.addedAt = this.patterns.length;
    this.patterns.push(pattern);
    this.quantizedPatterns.push(pattern.quantized);
    return pattern;
  }

  /**
   * Agent confirmed the matched pattern was correct (Phase 3 feedback loop).
   * @param {string} patternId
   * @param {number} [amount]
   */
  confirm(patternId, amount = 0.1) {
    const pattern = this.patterns.find(p => p.id === patternId && !p.deprecated);
    if (pattern) {
      pattern.confidence = Math.min(1.0, pattern.confidence + amount);
      pattern.lastConfirmedAt = ++this._confirmSeq;
      pattern.hitCount = (pattern.hitCount ?? 0) + 1;
    }
    return pattern;
  }

  /**
   * Matched pattern was a false positive — dampen library confidence (Phase 3–4).
   * @param {string} patternId
   * @param {number} [amount]
   */
  feedbackNegative(patternId, amount = 0.05) {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.missCount = (pattern.missCount ?? 0) + 1;
      pattern.confidence = Math.max(0.05, pattern.confidence - amount);
    }
    return pattern;
  }

  rebuildIndex() {
    this.quantizedPatterns = [];
    for (const p of this.patterns) {
      if (!p.vector) {
        p.vector = bugToVector(
          {
            symptoms: p.symptoms,
            filePaths: p.filePaths,
            errorMessages: p.errorMessages
          },
          this.seed
        );
      }
      p.quantized = this.purify(p.vector);
      this.quantizedPatterns.push(p.quantized);
    }
  }

  libraryMemoryBytes() {
    return this.quantizedPatterns.reduce((s, q) => s + (q?.data?.byteLength ?? 0), 0);
  }

  getStats() {
    const q = this.stats.queries;
    const deprecated = this.patterns.filter(p => p.deprecated).length;
    return {
      ...this.stats,
      patternCount: this.patterns.length,
      deprecatedPatternCount: deprecated,
      memoryBytes: this.libraryMemoryBytes(),
      avgMemoryPerQuery: q > 0 ? this.libraryMemoryBytes() / q : this.libraryMemoryBytes()
    };
  }

  exportPatterns() {
    return this.patterns.map(p => ({
      id: p.id,
      name: p.name,
      symptoms: p.symptoms,
      filePaths: p.filePaths,
      errorMessages: p.errorMessages,
      owner: p.owner,
      fixPath: p.fixPath,
      confidence: p.confidence,
      hitCount: p.hitCount ?? 0,
      missCount: p.missCount ?? 0,
      lastConfirmedAt: p.lastConfirmedAt,
      deprecated: !!p.deprecated,
      addedAt: p.addedAt
    }));
  }
}
