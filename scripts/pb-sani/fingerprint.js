/**
 * PixelBrain QA — Inert-Code Bytecode Fingerprinting
 *
 * PB-SANI-v1 encoding: deterministic, checksum-verifiable, AI-parsable.
 * Schema: PB-SANI-v1-{CLASS}-{SEVERITY}-{MODULE}-{ROLE}-{REACH}-{VALUE}-{HASH}
 */

import { createHash } from 'node:crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SANI_SCHEMA_VERSION = 'v1';
export const SANI_PREFIX = 'PB-SANI';

export const INERT_CLASSES = Object.freeze([
  'ORPHANED',           // no imports, no calls, no registration, no runtime path
  'SHADOWED',           // newer implementation replaced it
  'DORMANT',            // intentionally useful for future/optional flows
  'BROKEN_CHAIN',       // dependency chain severed
  'DECORATIVE_RESIDUE', // scaffolding/shells no longer affecting output
  'TEST_ONLY_RESIDUE',  // only referenced by obsolete/skipped tests
  'MIGRATION_RELIC',    // legacy bridge from completed migration
  'CONFIG_GHOST',       // config entries/enums/constants with no consumers
]);

export const SEVERITIES = Object.freeze(['INFO', 'WARN', 'CRIT']);

export const REACHABILITY = Object.freeze(['NONE', 'PARTIAL', 'TEST_ONLY', 'OPTIONAL']);

export const STRATEGIC_VALUES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

export const ROLES = Object.freeze([
  'FORMULA_BRIDGE',
  'FORMULA_COMPILER',
  'FORMULA_EVALUATOR',
  'SYMMETRY_TRANSFORM',
  'COORDINATE_TRANSFORM',
  'GRID_RENDERER',
  'GRID_TEMPLATE',
  'HOOK_REGISTRY',
  'EXTENSION_ADAPTER',
  'ERROR_FACTORY',
  'ERROR_DECODER',
  'PIXEL_SNAP',
  'PALETTE_RESOLVER',
  'TEXTURE_BLEND',
  'SEMANTIC_BRIDGE',
  'PHONEME_HEATMAP',
  'BPM_ROTATION',
  'ANCHOR_LAYOUT',
  'DEBUG_OVERLAY',
  'EXPORT_FORMATTER',
  'EXPORT_ADAPTER',
  'QA_ASSERTION',
  'QA_REPORTER',
  'COMBAT_RESOLVER',
  'SCROLL_ANALYSIS',
  'LINGUISTIC_ANALYSIS',
  'AUDIO_ADAPTER',
  'UI_COMPONENT',
  'STATE_HOOK',
  'DATA_MODEL',
  'UTIL_HELPER',
  'CONFIG_REGISTRY',
  'ROUTE_HANDLER',
  'MIDDLEWARE',
  'TEST_HARNESS',
  'BUILD_TOOL',
  'OTHER',
]);

// ─── Fingerprint Encoding ────────────────────────────────────────────────────

/**
 * Generate a deterministic 8-char hex hash from the bytecode-relevant fields only.
 * The hash is derived from segments that appear IN the fingerprint string itself,
 * so it can be verified during parsing without external metadata.
 */
export function hashFingerprint({ inertClass, moduleId, role, reachability, strategicValue }) {
  const input = JSON.stringify({
    inertClass,
    moduleId,
    role,
    reachability,
    strategicValue,
  });
  return createHash('sha256').update(input).digest('hex').substring(0, 8).toUpperCase();
}

/**
 * Encode a sanitization fingerprint string.
 * Returns: PB-SANI-v1-{CLASS}-{SEVERITY}-{MODULE}-{ROLE}-{REACH}-{VALUE}-{HASH}
 */
export function encodeFingerprint({ inertClass, severity, moduleId, role, reachability, strategicValue, path, symbolName }) {
  // Validate
  if (!INERT_CLASSES.includes(inertClass)) {
    throw new Error(`PB-SANI: invalid inert class "${inertClass}"`);
  }
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`PB-SANI: invalid severity "${severity}"`);
  }
  if (!ROLES.includes(role)) {
    throw new Error(`PB-SANI: invalid role "${role}"`);
  }
  if (!REACHABILITY.includes(reachability)) {
    throw new Error(`PB-SANI: invalid reachability "${reachability}"`);
  }
  if (!STRATEGIC_VALUES.includes(strategicValue)) {
    throw new Error(`PB-SANI: invalid strategic value "${strategicValue}"`);
  }

  const hash = hashFingerprint({
    inertClass,
    moduleId,
    role,
    reachability,
    strategicValue,
  });

  return `${SANI_PREFIX}-${SANI_SCHEMA_VERSION}-${inertClass}-${severity}-${moduleId}-${role}-${reachability}-${strategicValue}-${hash}`;
}

/**
 * Parse a fingerprint string back into its components.
 */
export function parseFingerprint(bytecode) {
  const parts = String(bytecode || '').trim().split('-');

  // Expected: PB-SANI-v1-CLASS-SEV-MOD-ROLE-REACH-VAL-HASH
  if (parts.length < 10) {
    return {
      valid: false,
      error: `Malformed fingerprint: expected 10+ segments, got ${parts.length}`,
      raw: bytecode,
    };
  }

  if (parts[0] !== 'PB' || parts[1] !== 'SANI') {
    return { valid: false, error: `Missing PB-SANI prefix`, raw: bytecode };
  }

  const schemaVersion = parts[2];
  const inertClass = parts[3];
  const severity = parts[4];
  const moduleId = parts[5];
  const role = parts[6];
  const reachability = parts[7];
  const strategicValue = parts[8];
  const hash = parts.slice(9).join('-'); // hash could contain dashes

  // Validate checksum
  const partialBytecode = `${SANI_PREFIX}-${schemaVersion}-${inertClass}-${severity}-${moduleId}-${role}-${reachability}-${strategicValue}`;
  const expectedHash = hashFingerprint({
    inertClass,
    moduleId,
    role,
    reachability,
    strategicValue,
  });

  const checksumValid = hash.toUpperCase() === expectedHash;

  return {
    valid: true,
    checksumVerified: checksumValid,
    schemaVersion,
    inertClass,
    severity,
    moduleId,
    role,
    reachability,
    strategicValue,
    hash,
    raw: bytecode,
  };
}
