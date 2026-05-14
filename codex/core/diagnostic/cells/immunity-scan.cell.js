/**
 * IMMUNITY_SCAN — Layer 1 + 2 Aggregate Cell
 *
 * Aggregates Layer 1 (innate) and Layer 2 (adaptive) scan results
 * into a single diagnostic cell. Detects:
 *   - IMMUNE_ALLOW annotations (authorized entropy zones)
 *   - Override velocity clusters
 *   - Stacking violations
 *
 * Key codes emitted:
 *   - PB-ERR-v1-IMMUNE-FORBIDDEN-IMPORT (0x0F03)
 *   - PB-ERR-v1-IMMUNE-OVERRIDE-VELOCITY (0x0F0B)
 *   - PB-OK-v1-IMMUNE-PASS-COORD
 *
 * Determinism contract (VAELRIX_LAW §6):
 *   - scan() is a pure function: same CodebaseSnapshot → same ScanResult
 *   - No side effects, no external state
 *
 * Reference: codex/core/immunity/innate.scanner.js, adaptive.scanner.js
 */

import { scanInnate } from '../../immunity/innate.scanner.js';
import { scanAdaptive } from '../../immunity/adaptive.scanner.js';
import { encodeBytecodeHealth, encodeArchivedHealth } from '../BytecodeHealth.js';
import { BytecodeError, ERROR_CODES } from '../../pixelbrain/bytecode-error.js';

export const CELL_ID = 'IMMUNITY_SCAN';
export const CELL_NAME = 'Innate Immunity Scan';
export const CELL_DESCRIPTION = 'Layer 1 (innate) + Layer 2 (adaptive) aggregate scan for immunity violations';
export const CELL_SCHEDULE = 'on-commit';

/**
 * @typedef {object} CodebaseSnapshot
 * @property {string} root - Project root path
 * @property {string} [commitHash] - Current git commit hash
 */

/**
 * @typedef {object} ScanResult
 * @property {BytecodeError[]} errors
 * @property {BytecodeHealth[]} health
 * @property {object[]} skipped
 */

/**
 * Scan a file for innate immunity violations.
 * @param {string} content - File content
 * @param {string} filePath - Relative file path
 * @returns {BytecodeError[]}
 */
function scanFileInnate(content, filePath) {
  const violations = scanInnate(content, filePath);
  return violations.map(v => {
    const error = new BytecodeError(
      v.category,
      v.severity,
      v.moduleId,
      v.errorCode,
      { ...v.context, layer: 'innate', ruleId: v.ruleId },
    );
    return error;
  });
}

/**
 * Scan files for adaptive (pathogen) violations.
 * @param {Array<{content: string, path: string}>} files
 * @returns {Promise<BytecodeError[]>}
 */
async function scanFilesAdaptive(files) {
  const errors = [];
  for (const { content, path } of files) {
    const violations = await scanAdaptive(content);
    for (const v of violations) {
      const error = new BytecodeError(
        'VALUE',
        'CRIT',
        'IMMUNE',
        ERROR_CODES.IMMUNE_ADAPTIVE_BLOCK,
        {
          layer: 'adaptive',
          pathogenId: v.pathogenId,
          pathogenName: v.name,
          score: v.score,
          threshold: v.threshold,
          encyclopediaEntry: v.entry,
          glyphs: v.glyphs,
          path,
        },
      );
      errors.push(error);
    }
  }
  return errors;
}

/**
 * Check for override velocity clusters (file-level).
 * @param {Array<{content: string, path: string}>} files
 * @returns {BytecodeError[]}
 */
function checkOverrideVelocity(files) {
  const errors = [];
  const OVERRIDE_THRESHOLD = 3; // More than 3 IMMUNE_ALLOW in same file = velocity issue

  for (const { content, path } of files) {
    const matches = content.match(/\/\/\s*IMMUNE_ALLOW:/g) || [];
    if (matches.length >= OVERRIDE_THRESHOLD) {
      const error = new BytecodeError(
        'STATE',
        'WARN',
        'IMMUNE',
        ERROR_CODES.IMMUNE_OVERRIDE_VELOCITY,
        {
          layer: 'innate',
          overrideCount: matches.length,
          path,
          detail: `File has ${matches.length} IMMUNE_ALLOW annotations — exceeds threshold of ${OVERRIDE_THRESHOLD}`,
        },
      );
      errors.push(error);
    }
  }

  return errors;
}

/**
 * Main scan function. Stateless, idempotent.
 *
 * @param {CodebaseSnapshot} _snapshot - Unused (cell is file-agnostic; cells receive file lists from runner)
 * @param {Array<{content: string, path: string}>} files - Files to scan
 * @returns {Promise<ScanResult>}
 */
export async function scan(_snapshot, files = []) {
  const errors = [];
  const health = [];

  // Layer 1: Innate pattern scan
  for (const { content, path } of files) {
    const innateErrors = scanFileInnate(content, path);
    
    for (const err of innateErrors) {
      const ruleId = err.context.ruleId;
      // Check for ARCHIVED annotation for this specific rule (top-level comment)
      const archivedRegex = new RegExp(`^\\/\\/\\s*ARCHIVED:\\s*${ruleId}`, 'm');
      if (archivedRegex.test(content)) {
        health.push(encodeArchivedHealth(CELL_ID, `innate-archived-${ruleId}`, {
          path,
          ruleId,
          reason: 'logic-incomplete',
        }));
      } else {
        errors.push(err);
      }
    }
  }

  // Override velocity check (Layer 1 extension)
  const velocityErrors = checkOverrideVelocity(files);
  errors.push(...velocityErrors);

  // Layer 2: Adaptive pathogen scan
  const adaptiveErrors = await scanFilesAdaptive(files);
  errors.push(...adaptiveErrors);

  // Health signals
  if (errors.length === 0) {
    health.push(encodeBytecodeHealth(CELL_ID, 'no-violations-detected', {
      filesScanned: files.length,
    }));
  } else {
    const bySeverity = errors.reduce((acc, e) => {
      acc[e.severity] = (acc[e.severity] || 0) + 1;
      return acc;
    }, {});
    health.push(encodeBytecodeHealth(CELL_ID, 'violations-found', bySeverity));
  }

  return { errors, health, skipped: [] };
}