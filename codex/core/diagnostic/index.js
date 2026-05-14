/**
 * DIAGNOSTIC MODULE — Public API
 *
 * Entry point for the Diagnostic Cell Infrastructure.
 * All public exports are available from this module.
 *
 * Reference: PDR-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE
 */

// BytecodeHealth — the green-path signal
export {
  BytecodeHealth,
  encodeBytecodeHealth,
  encodeModuleHealth,
  encodeArchivedHealth,
  checksumHealth,
  verifyHealthDeterminism,
  HEALTH_CODES,
  ARCHIVED_CODES,
  HEALTH_SEVERITY,
  CELL_IDS as HEALTH_CELL_IDS,
} from './BytecodeHealth.js';

// Diagnostic Report
export {
  generateDiagnosticReport,
  verifyReport,
  checksumReport,
  REPORT_VERSION,
} from './DiagnosticReport.js';

// Diagnostic Runner
export {
  runDiagnostic,
  runCellById,
  getAvailableCells,
  CELL_IDS,
} from './diagnostic-runner.js';

// Re-export cell IDs for convenience
export { CELL_IDS as CELLS } from './diagnostic-runner.js';

// Persistence + Logarithmic Pruner
export {
  writeReport,
  readReport,
  pruneReports,
  planPruning,
  timestampFromReportId,
  reportPath,
  DEFAULT_REPORTS_DIR,
  RETENTION,
} from './persistence.js';