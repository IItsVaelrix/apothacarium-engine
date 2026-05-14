/**
 * FIXTURE_SHAPE — Test Harness Quality Cell
 *
 * Detects test fixture antipatterns:
 *   - useState(0) patterns — prefer useReducer for complex state
 *   - JSDOM reflow traps (layout thrashing)
 *   - Missing cleanup in hooks
 *
 * Key codes emitted:
 *   - PB-ERR-v1-TEST-FIXTURE-ANTIPATTERN (0x0F07)
 *   - PB-OK-v1-FIXTURE-SHAPE-OK
 *
 * Reference: PDR-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE
 */

import { BytecodeError, ERROR_CODES } from '../../pixelbrain/bytecode-error.js';
import { encodeBytecodeHealth, encodeArchivedHealth } from '../BytecodeHealth.js';

export const CELL_ID = 'FIXTURE_SHAPE';
export const CELL_NAME = 'Test Fixture Quality';
export const CELL_DESCRIPTION = 'Detects test harness antipatterns';
export const CELL_SCHEDULE = 'on-test-run';

// Antipattern patterns
const ANTIPATTERNS = [
  {
    id: 'USESTATE_SIMPLE',
    pattern: /useState\s*\(\s*0\s*\)/g,
    reason: 'useState(0) suggests simple counter — consider direct assignment for primitives',
    severity: 'info',
  },
  {
    id: 'USESTATE_COMPLEX',
    pattern: /useState\s*\(\s*(\{[^}]*\}|\[[^\]]*\])\s*\)/g,
    reason: 'Complex initial state in useState — prefer useReducer for state machines',
    severity: 'warn',
  },
  {
    id: 'LAYOUT_THRASHING',
    pattern: /querySelector|getElementsBy(ClassName|TagName|ById)/g,
    reason: 'DOM queries in loops cause reflow — cache DOM reads/writes separately',
    severity: 'warn',
  },
  {
    id: 'MISSING_CLEANUP',
    pattern: /describe\s*\([^)]*\)\s*\{[^}]*async\s+it\s*\([^}]*\{/g,
    reason: 'Async test without cleanup — ensure timers and mocks are restored',
    severity: 'warn',
  },
  {
    id: 'HARDCODED_TIMEOUT',
    pattern: /setTimeout\s*\([^,]+,\s*(?![0-9]+[ms])\s*1000\s*\)/g,
    reason: 'Hardcoded 1000ms timeout — use jest.useFakeTimers() for deterministic tests',
    severity: 'info',
  },
];

/**
 * Scan test file content for antipatterns.
 * @param {string} content
 * @param {string} path
 * @returns {Array<{antipattern: object, line: number}>}
 */
function scanForAntipatterns(content, path) {
  const findings = [];
  const lines = content.split('\n');

  for (const antipattern of ANTIPATTERNS) {
    const regex = new RegExp(antipattern.pattern.source, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      // Find line number
      let lineNum = 1;
      let charCount = 0;
      while (charCount < match.index && lineNum < lines.length) {
        charCount += lines[lineNum - 1].length + 1;
        if (charCount <= match.index) lineNum++;
      }

      findings.push({
        antipattern,
        line: lineNum,
        match: match[0],
      });
    }
  }

  return findings;
}

/**
 * Check if a file is a test file.
 * @param {string} path
 * @returns {boolean}
 */
function isTestFile(path) {
  return /\.(test|spec)\.(js|jsx|ts|tsx)$/.test(path);
}

/**
 * Main scan function. Stateless, idempotent.
 *
 * @param {object} _snapshot
 * @param {Array<{content: string, path: string}>} files
 * @returns {Promise<ScanResult>}
 */
export async function scan(_snapshot, files = []) {
  const errors = [];
  const health = [];

  const testFiles = files.filter(f => isTestFile(f.path));

  for (const { content, path } of testFiles) {
    const findings = scanForAntipatterns(content, path);

    for (const f of findings) {
      const antipatternId = f.antipattern.id;
      // Check for ARCHIVED annotation for this specific antipattern (top-level comment)
      const archivedRegex = new RegExp(`^\\/\\/\\s*ARCHIVED:\\s*${antipatternId}`, 'm');
      if (archivedRegex.test(content)) {
        health.push(encodeArchivedHealth(CELL_ID, `fixture-archived-${antipatternId}`, {
          path,
          antipatternId,
          reason: 'logic-incomplete',
        }));
      } else {
        const error = new BytecodeError(
          'STATE',
          f.antipattern.severity === 'warn' ? 'WARN' : 'INFO',
          'IMMUNE',
          ERROR_CODES.TEST_FIXTURE_ANTIPATTERN,
          {
            layer: 'fixture',
            antipatternId,
            path,
            line: f.line,
            detail: f.antipattern.reason,
            severity: f.antipattern.severity,
          },
        );
        errors.push(error);
      }
    }
  }

  // Health signals
  if (testFiles.length > 0) {
    const cleanFiles = testFiles.filter(tf =>
      !errors.some(e => e.context.path === tf.path)
    );

    health.push(encodeBytecodeHealth(CELL_ID, 'fixture-quality-summary', {
      totalTestFiles: testFiles.length,
      cleanFiles: cleanFiles.length,
      filesWithAntipatterns: testFiles.length - cleanFiles.length,
    }));

    for (const tf of cleanFiles) {
      health.push(encodeBytecodeHealth(CELL_ID, 'fixture-clean', {
        moduleId: tf.path,
        antipatterns: 0,
      }));
    }
  }

  return { errors, health, skipped: [] };
}