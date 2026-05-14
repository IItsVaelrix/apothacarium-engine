/**
 * DIAGNOSTIC RUNNER — Cell Orchestrator
 *
 * Runs all registered diagnostic cells against a codebase snapshot,
 * aggregates results, and returns a complete DiagnosticReport.
 *
 * Design constraint: stateless and idempotent.
 * Same CodebaseSnapshot always produces the same ScanResult.
 *
 * Reference: PDR-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE
 */

import * as immunityScan from './cells/immunity-scan.cell.js';
import * as layerBoundaryScan from './cells/layer-boundary.cell.js';
import * as testCoverageScan from './cells/test-coverage.cell.js';
import * as fixtureShapeScan from './cells/fixture-shape.cell.js';
import * as processorBridgeScan from './cells/processor-bridge.cell.js';
import { generateDiagnosticReport } from './DiagnosticReport.js';

export const CELL_IDS = Object.freeze({
  IMMUNITY_SCAN: 'IMMUNITY_SCAN',
  LAYER_BOUNDARY: 'LAYER_BOUNDARY',
  TEST_COVERAGE: 'TEST_COVERAGE',
  FIXTURE_SHAPE: 'FIXTURE_SHAPE',
  PROCESSOR_BRIDGE: 'PROCESSOR_BRIDGE',
});

/**
 * Cell registry. Maps cell ID to module with scan function + metadata.
 */
const CELL_MODULES = {
  [CELL_IDS.IMMUNITY_SCAN]: immunityScan,
  [CELL_IDS.LAYER_BOUNDARY]: layerBoundaryScan,
  [CELL_IDS.TEST_COVERAGE]: testCoverageScan,
  [CELL_IDS.FIXTURE_SHAPE]: fixtureShapeScan,
  [CELL_IDS.PROCESSOR_BRIDGE]: processorBridgeScan,
};

const REQUIRED_CELL_EXPORTS = ['CELL_ID', 'CELL_NAME', 'CELL_DESCRIPTION', 'CELL_SCHEDULE', 'scan'];

/**
 * Validate cell module against the interface contract (white paper §11).
 * Throws on any missing required export.
 */
function assertCellInterface(id, mod) {
  const missing = REQUIRED_CELL_EXPORTS.filter(k => mod[k] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[diagnostic-runner] Cell ${id} is missing required exports: ${missing.join(', ')}. ` +
      `White paper §11 requires every cell to export ${REQUIRED_CELL_EXPORTS.join(', ')}.`,
    );
  }
  if (typeof mod.scan !== 'function') {
    throw new Error(`[diagnostic-runner] Cell ${id}.scan must be a function, got ${typeof mod.scan}`);
  }
}

/** @type {Array<{id: string, scan: function, name: string, description: string, schedule: string}>} */
const CELLS = Object.entries(CELL_MODULES).map(([id, mod]) => {
  assertCellInterface(id, mod);
  return {
    id,
    scan: mod.scan,
    name: mod.CELL_NAME,
    description: mod.CELL_DESCRIPTION,
    schedule: mod.CELL_SCHEDULE,
  };
});

/**
 * Run a single cell scan.
 *
 * @param {object} cell
 * @param {object} snapshot
 * @param {Array<{content: string, path: string}>} files
 * @returns {Promise<{cellId: string, errors: [], health: [], skipped: []}>}
 */
async function runCell(cell, snapshot, files) {
  try {
    const result = await cell.scan(snapshot, files);
    return {
      cellId: cell.id,
      errors: result.errors || [],
      health: result.health || [],
      skipped: result.skipped || [],
      cellError: null,
    };
  } catch (error) {
    // Cell crashed — surface as a first-class cellError, distinct from
    // per-check `skipped`. The runner stays alive so other cells finish.
    console.error(`[diagnostic-runner] Cell ${cell.id} crashed:`, error.message);
    return {
      cellId: cell.id,
      errors: [],
      health: [],
      skipped: [],
      cellError: { cellId: cell.id, message: error.message, stack: error.stack || null },
    };
  }
}

/**
 * Run all diagnostic cells against the provided files.
 *
 * @param {object} snapshot
 * @param {Array<{content: string, path: string}>} files
 * @param {object} options
 * @param {string} [options.commitHash='unknown']
 * @param {string} [options.trigger='manual']
 * @param {string[]} [options.cellFilter] - Run only these cell IDs
 * @returns {Promise<object>} Complete diagnostic report
 */
export async function runDiagnostic({ snapshot, files = [], commitHash = 'unknown', trigger = 'manual', cellFilter = null }) {
  const cellsToRun = cellFilter
    ? CELLS.filter(c => cellFilter.includes(c.id))
    : CELLS;

  // Run all cells in parallel
  const results = await Promise.all(
    cellsToRun.map(cell => runCell(cell, snapshot, files))
  );

  // Generate the report
  const report = generateDiagnosticReport({
    commitHash,
    trigger,
    cellResults: results,
  });

  return report;
}

/**
 * Run a specific cell by ID.
 *
 * @param {string} cellId
 * @param {object} snapshot
 * @param {Array<{content: string, path: string}>} files
 * @returns {Promise<{cellId: string, errors: [], health: [], skipped: []}>}
 */
export async function runCellById(cellId, snapshot, files) {
  const cell = CELLS.find(c => c.id === cellId);
  if (!cell) {
    throw new Error(`Unknown cell: ${cellId}. Available: ${CELLS.map(c => c.id).join(', ')}`);
  }
  return runCell(cell, snapshot, files);
}

/**
 * Get list of available cells.
 *
 * @returns {Array<{id: string, name: string, description: string, schedule: string}>}
 */
export function getAvailableCells() {
  return CELLS.map(cell => ({
    id: cell.id,
    name: cell.name || cell.id,
    description: cell.description || '',
    schedule: cell.schedule || 'manual',
  }));
}