/**
 * DIAGNOSTIC REPORT — AI-Parseable Report Generator
 *
 * Aggregates results from all diagnostic cells into a single,
 * AI-consumable report with checksums for integrity verification.
 *
 * Report schema:
 *   {
 *     reportId: string,           // PB-DIAG-v1-{timestamp}-{random4}
 *     reportVersion: string,       // Semantic version
 *     timestamp: number,           // Unix timestamp
 *     commitHash: string,          // Git commit hash
 *     trigger: string,              // on-commit | hourly | on-test-run | manual
 *     cells: string[],             // Cell IDs that ran
 *     summary: {
 *       totalErrors: number,
 *       totalHealth: number,
 *       totalArchived: number,
 *       totalSkipped: number,
 *       criticalViolations: number,
 *     },
 *     violations: BytecodeError[], // All violations
 *     passing: BytecodeHealth[],    // All health signals
 *     skipped: object[],           // Skipped checks
 *     recommendations: object[],   // getRecoveryHintsForError() results
 *     checksum: string,            // SHA-256 of entire report
 *   }
 *
 * Determinism contract (VAELRIX_LAW §6):
 *   - checksum computed over stable fields only (excludes timestamp, checksum)
 *   - Same cell results → same report structure
 *
 * Reference: PDR-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE
 */

import crypto from 'node:crypto';
import { getRepair } from '../immunity/repair.recommendations.js';
import { ARCHIVED_CODES } from './BytecodeHealth.js';

export const REPORT_VERSION = '1.0.0';

/**
 * Generate a unique report ID.
 * @returns {string}
 */
let reportIdCounter = 0;
function generateReportId() {
  const timestamp = Date.now(); // EXEMPT — metadata only
  const random = (reportIdCounter++).toString(16).padStart(4, '0');
  return `PB-DIAG-v1-${timestamp}-${random}`;
}

/**
 * Compute checksum for the entire report.
 * Excludes timestamp, checksum, and volatile fields.
 *
 * @param {object} report - Report without checksum field
 * @returns {string}
 */
export function checksumReport(report) {
  // reportId is excluded — it embeds a timestamp and random suffix,
  // both of which are envelope metadata per VAELRIX_LAW §6 (white paper §5.1).
  const stable = {
    reportVersion: report.reportVersion,
    commitHash: report.commitHash,
    trigger: report.trigger,
    cells: report.cells,
    summary: {
      totalErrors: report.summary.totalErrors,
      totalHealth: report.summary.totalHealth,
      totalArchived: report.summary.totalArchived || 0,
      totalSkipped: report.summary.totalSkipped,
      criticalViolations: report.summary.criticalViolations,
    },
    violations: report.violations.map(v => ({
      code: v.code,
      category: v.category,
      severity: v.severity,
      context: v.context,
    })),
    passing: report.passing.map(h => ({
      code: h.code,
      cellId: h.cellId,
      checkId: h.checkId,
    })),
    cellErrors: (report.cellErrors || []).map(c => ({
      cellId: c.cellId,
      message: c.message,
    })),
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Get recovery hints for a BytecodeError.
 * @param {BytecodeError} error
 * @returns {object}
 */
function getHintsForError(error) {
  const context = error.context || {};
  const ruleId = context.ruleId || context.layer;

  // Map error codes to repair keys
  const repairKeyMap = {
    'IMMUNE_FORBIDDEN_IMPORT': 'repair.forbidden-import.bridge-via-lib',
    'IMMUNE_DUPLICATE_PATH': 'repair.duplicate-path.canon',
    'IMMUNE_KNOWN_VIOLATION_LITERAL': 'repair.known-violation.cleansing',
    'IMMUNE_MATH_RANDOM': 'repair.math-random.seeded',
    'IMMUNE_UNSEEDED_CLOCK': 'repair.unseeded-clock.pipeline-context',
    'IMMUNE_PHONEME_RELATIVE': 'repair.phoneme.relative-bridge',
    'IMMUNE_INFRA_PORT': 'repair.infra.port-alignment',
    'IMMUNE_OVERRIDE_VELOCITY': 'repair.unknown', 
    'TEST_MISSING': 'repair.unknown',
    'TEST_FIXTURE_ANTIPATTERN': 'repair.unknown',
    'IMMUNE_PROTOCOL_BLOCK': 'repair.unknown',
  };

  const repairKey = repairKeyMap[error.code] || 'repair.unknown';
  const repair = getRepair(repairKey);

  return {
    ruleId,
    errorCode: error.code,
    errorHex: error.errorCode?.toString(16).toUpperCase(),
    repair: {
      key: repair.key,
      title: repair.title,
      suggestions: repair.suggestions,
      canonical: repair.canonical,
    },
    path: context.path || context.sourceFile || null,
  };
}

/**
 * Generate a diagnostic report from cell results.
 *
 * @param {object} params
 * @param {string} params.commitHash - Git commit hash
 * @param {string} params.trigger - What triggered this scan
 * @param {Array<{cellId: string, errors: BytecodeError[], health: BytecodeHealth[], skipped: object[]}>} params.cellResults
 * @returns {object} Complete diagnostic report
 */
export function generateDiagnosticReport({ commitHash = 'unknown', trigger = 'manual', cellResults = [] }) {
  const reportId = generateReportId();
  const timestamp = Date.now(); // EXEMPT — metadata only

  // Aggregate all results
  const allErrors = [];
  const allHealth = [];
  const allSkipped = [];
  const allCellErrors = [];
  const cellIds = [];

  for (const result of cellResults) {
    cellIds.push(result.cellId);
    allErrors.push(...result.errors);
    allHealth.push(...result.health);
    allSkipped.push(...result.skipped);
    if (result.cellError) {
      allCellErrors.push(result.cellError);
    }
  }

  const archivedCodes = new Set(Object.values(ARCHIVED_CODES));
  const archivedHealth = allHealth.filter(h => archivedCodes.has(h.code));
  const pureHealth = allHealth.filter(h => !archivedCodes.has(h.code));

  // Compute summary — cellErrors are kept distinct from per-check skipped
  const summary = {
    totalErrors: allErrors.length,
    totalHealth: pureHealth.length,
    totalArchived: archivedHealth.length,
    totalSkipped: allSkipped.length,
    cellErrors: allCellErrors.length,
    criticalViolations: allErrors.filter(e => e.severity === 'CRIT' || e.severity === 'FATAL').length,
  };

  // Generate recommendations for each violation
  const recommendations = allErrors.map(e => getHintsForError(e));

  // Build report
  const report = {
    reportId,
    reportVersion: REPORT_VERSION,
    timestamp,
    commitHash,
    trigger,
    cells: [...new Set(cellIds)],
    summary,
    violations: allErrors.map(e => e.toJSON ? e.toJSON() : {
      code: e.bytecode,
      category: e.category,
      severity: e.severity,
      errorCode: e.errorCode,
      context: e.context,
      timestamp: e.timestamp,
    }),
    passing: allHealth.map(h => h.toJSON ? h.toJSON() : h),
    skipped: allSkipped,
    cellErrors: allCellErrors,
    recommendations,
    // Checksum placeholder
    checksum: null,
  };

  // Compute checksum (over stable fields only)
  report.checksum = checksumReport(report);

  return report;
}

/**
 * Verify report integrity.
 *
 * @param {object} report - Report to verify
 * @returns {{ valid: boolean, computed: string, stored: string }}
 */
export function verifyReport(report) {
  const computed = checksumReport(report);
  return {
    valid: computed === report.checksum,
    computed,
    stored: report.checksum,
  };
}