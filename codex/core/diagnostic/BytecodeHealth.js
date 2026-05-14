/**
 * BYTECODE HEALTH — The Green-Path Signal
 *
 * The complement to BytecodeError. When a diagnostic check passes cleanly,
 * it emits a BytecodeHealth payload instead of a BytecodeError. Together,
 * they form a complete diagnostic channel that AI agents can query,
 * consume, and act upon.
 *
 * Schema:
 *   {
 *     version: 'v1',
 *     code: string,           // e.g. 'PB-OK-v1-IMMUNE-PASS-COORD'
 *     cellId: string,        // Which diagnostic cell produced this
 *     checkId: string,       // Which specific check passed
 *     moduleId: string,      // Affected module (if applicable)
 *     context: object,       // Additional context
 *     timestamp: number,     // Unix timestamp (EXEMPT — metadata only)
 *     checksum: string,      // Deterministic hash for integrity
 *   }
 *
 * Encoding format:
 *   PB-OK-v1-{MODULE}-{CHECK}-{CONTEXT_B64}-{CHECKSUM_8}
 *
 * Determinism contract (VAELRIX_LAW §6):
 *   - Same input → same output (100x pass required)
 *   - Checksum computed over stable fields only (timestamp excluded)
 *   - No randomness or unseeded clocks in computation paths
 *
 * Reference: docs/scholomance-encyclopedia/PDR-archive/diagnostic_cell_infrastructure_pdr.md
 */

import crypto from 'node:crypto';

// ─── Deep Freeze ──────────────────────────────────────────────────────────────

/**
 * Recursively clone-and-freeze a value. Preserves insertion order for objects
 * (so JSON.stringify produces stable output for checksumming), freezes arrays
 * and nested objects, and returns primitives as-is.
 *
 * Caller's reference is not mutated; the returned value is fully immutable.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function deepFreezeClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreezeClone));
  }
  const out = {};
  for (const k of Object.keys(value)) {
    out[k] = deepFreezeClone(value[k]);
  }
  return Object.freeze(out);
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const HEALTH_CODES = Object.freeze({
  IMMUNE_PASS_COORD: 'PB-OK-v1-IMMUNE-PASS-COORD',
  LAYER_BOUNDARY_OK: 'PB-OK-v1-LAYER-BOUNDARY-OK',
  TEST_COVERAGE_PASS: 'PB-OK-v1-TEST-COVERAGE-PASS',
  FIXTURE_SHAPE_OK: 'PB-OK-v1-FIXTURE-SHAPE-OK',
  PROCESSOR_BRIDGE_CLEAN: 'PB-OK-v1-PROCESSOR-BRIDGE-CLEAN',
  CELL_SCAN_CLEAN: 'PB-OK-v1-CELL-SCAN-CLEAN',
});

export const HEALTH_SEVERITY = Object.freeze({
  PASS: 'pass',
  INFO: 'info',
  ARCHIVED: 'archived',
});

const HEALTH_VERSION = 'v1';

/**
 * Well-known cell IDs.
 */
export const CELL_IDS = Object.freeze({
  IMMUNITY_SCAN: 'IMMUNITY_SCAN',
  LAYER_BOUNDARY: 'LAYER_BOUNDARY',
  TEST_COVERAGE: 'TEST_COVERAGE',
  FIXTURE_SHAPE: 'FIXTURE_SHAPE',
  PROCESSOR_BRIDGE: 'PROCESSOR_BRIDGE',
  CONNECTION_HEALTH: 'CONNECTION_HEALTH',
  LIFECYCLE: 'LIFECYCLE',
  DB_HEALTH: 'DB_HEALTH',
});

// ─── Archived ────────────────────────────────────────────────────────────────

/**
 * ARCHIVED — Logic in stasis.
 *
 * For work that is known to be incomplete, stubs, or deprecated logic
 * that should not be flagged as a diagnostic failure. This prevents the
 * system from being "too ravenous" for errors in unfinished sections.
 */
export const ARCHIVED_CODES = Object.freeze({
  LOGIC_INCOMPLETE: 'PB-OK-v1-LOGIC-INCOMPLETE',
  WIP_STUB: 'PB-OK-v1-WIP-STUB',
  DEPRECATED_STASIS: 'PB-OK-v1-DEPRECATED-STASIS',
});

// ─── Checksum ─────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic checksum over a BytecodeHealth payload.
 * Excludes timestamp (which is metadata, not computation).
 *
 * @param {object} health - The health payload (without checksum field)
 * @returns {string} 8-char hex checksum
 */
export function checksumHealth(health) {
  const stable = {
    version: health.version,
    code: health.code,
    cellId: health.cellId,
    checkId: health.checkId,
    moduleId: health.moduleId,
    context: health.context,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable))
    .digest('hex')
    .slice(0, 8);
}

// ─── BytecodeHealth Class ─────────────────────────────────────────────────────

/**
 * Helper to encode and log health signal
 */
export function emitHealth(checkId, context = {}) {
  const h = encodeBytecodeHealth('PHONEME_ENGINE', checkId, context);
  console.log(`[PhonemeEngine] Health: ${h.code}`);
  return h;
}

/**
 * Represents a passing health check. Immutable after construction.
 */
export class BytecodeHealth {
  /**
   * @param {object} params
   * @param {string} params.code - Health code (PB-OK-v1-*)
   * @param {string} params.cellId - Which cell produced this
   * @param {string} params.checkId - Which check passed
   * @param {string} [params.moduleId] - Affected module (optional)
   * @param {object} [params.context={}] - Additional context
   */
  constructor({ code, cellId, checkId, moduleId = null, context = {} }) {
    this.version = HEALTH_VERSION;
    this.code = code;
    this.cellId = cellId;
    this.checkId = checkId;
    this.moduleId = moduleId;
    this.context = deepFreezeClone(context);
    this.timestamp = Date.now(); // EXEMPT — metadata only

    // Checksum over stable fields (excludes timestamp)
    this.checksum = checksumHealth(this);

    // Bytecode string for AI consumption
    this.bytecode = this._encode();
  }

  /** @returns {string} Full bytecode string */
  _encode() {
    const contextB64 = Buffer.from(JSON.stringify(this.context)).toString('base64url');
    return `${this.code}-${this.cellId}-${this.checkId}-${contextB64}-${this.checksum}`;
  }

  /** @returns {object} Serialization */
  toJSON() {
    return {
      version: this.version,
      code: this.code,
      cellId: this.cellId,
      checkId: this.checkId,
      moduleId: this.moduleId,
      context: this.context,
      timestamp: this.timestamp,
      checksum: this.checksum,
      bytecode: this.bytecode,
    };
  }

  /** @returns {string} Human-readable summary */
  toString() {
    return `[${this.code}] ${this.cellId}/${this.checkId} — ${this.moduleId || 'N/A'}`;
  }
}

// ─── Factory Functions ────────────────────────────────────────────────────────

/**
 * Create a passing health signal for a clean immunity check.
 *
 * @param {string} cellId - Cell ID
 * @param {string} checkId - Check that passed
 * @param {object} [context={}] - Additional context
 * @returns {BytecodeHealth}
 */
export function encodeBytecodeHealth(cellId, checkId, context = {}) {
  return new BytecodeHealth({
    code: HEALTH_CODES.IMMUNE_PASS_COORD,
    cellId,
    checkId,
    context,
  });
}

/**
 * Create a health signal for a specific module clean check.
 *
 * @param {string} moduleId - Module that passed
 * @param {string} cellId - Cell ID
 * @param {string} checkId - Check that passed
 * @param {object} [context={}] - Additional context
 * @returns {BytecodeHealth}
 */
export function encodeModuleHealth(moduleId, cellId, checkId, context = {}) {
  return new BytecodeHealth({
    code: HEALTH_CODES.CELL_SCAN_CLEAN,
    cellId,
    checkId,
    moduleId,
    context,
  });
}

/**
 * Create a health signal for logic that is known to be incomplete or archived.
 *
 * @param {string} cellId - Cell ID
 * @param {string} checkId - Check that is archived
 * @param {object} [context={}] - Additional context
 * @returns {BytecodeHealth}
 */
export function encodeArchivedHealth(cellId, checkId, context = {}) {
  return new BytecodeHealth({
    code: ARCHIVED_CODES.LOGIC_INCOMPLETE,
    cellId,
    checkId,
    context,
  });
}

// ─── Determinism Verification ─────────────────────────────────────────────────

/**
 * Verify that encodeBytecodeHealth is deterministic.
 * Run 100 iterations of identical input; all outputs must match.
 *
 * @param {string} cellId
 * @param {string} checkId
 * @param {object} [context={}]
 * @returns {{ deterministic: boolean, iterations: number, checksumDrift: number }}
 */
export function verifyHealthDeterminism(cellId, checkId, context = {}) {
  const checksums = [];
  for (let i = 0; i < 100; i++) {
    const h = new BytecodeHealth({ code: HEALTH_CODES.IMMUNE_PASS_COORD, cellId, checkId, context });
    checksums.push(h.checksum);
  }
  const unique = new Set(checksums);
  return {
    deterministic: unique.size === 1,
    iterations: 100,
    checksumDrift: unique.size - 1,
    sampleChecksum: checksums[0],
  };
}