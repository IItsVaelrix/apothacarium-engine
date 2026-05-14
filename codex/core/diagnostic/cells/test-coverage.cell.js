/**
 * TEST_COVERAGE — QA Coverage Gate Cell
 *
 * Detects modules without corresponding QA test files.
 * Key codes emitted:
 *   - PB-ERR-v1-TEST-MISSING (0x0F06)
 *   - PB-OK-v1-TEST-COVERAGE-PASS
 *
 * Reference: PDR-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE
 */

import { BytecodeError, ERROR_CODES } from '../../pixelbrain/bytecode-error.js';
import { encodeBytecodeHealth, encodeArchivedHealth } from '../BytecodeHealth.js';

export const CELL_ID = 'TEST_COVERAGE';
export const CELL_NAME = 'QA Coverage Gate';
export const CELL_DESCRIPTION = 'Detects modules without corresponding test files';
export const CELL_SCHEDULE = 'on-test-run';

// Patterns for test file discovery
const TEST_PATTERNS = [
  /\.test\.(js|jsx|ts|tsx)$/,
  /\.spec\.(js|jsx|ts|tsx)$/,
  /\/tests\//,
];

// Directories to exclude from coverage check
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.codex',
  'docs',
  'Archive',
  'ARCHIVE REFERENCE DOCS',
  'public',
  'scripts',
];

/**
 * Get the expected test file path for a source file.
 * @param {string} sourcePath
 * @returns {string}
 */
function getExpectedTestPath(sourcePath) {
  // Handle codex/core/ modules
  if (sourcePath.startsWith('codex/core/')) {
    const relative = sourcePath.slice('codex/core/'.length);
    const ext = relative.match(/\.[^.]+$/)?.[0] || '';
    const basename = relative.slice(0, -ext.length);
    const parts = basename.split('/');
    const filename = parts.pop();
    const dir = parts.join('/');
    return `tests/codex/core/${dir ? dir + '/' : ''}${filename}.test.js`;
  }

  // Handle codex/server/ modules
  if (sourcePath.startsWith('codex/server/')) {
    const relative = sourcePath.slice('codex/server/'.length);
    const ext = relative.match(/\.[^.]+$/)?.[0] || '';
    const basename = relative.slice(0, -ext.length);
    const parts = basename.split('/');
    const filename = parts.pop();
    const dir = parts.join('/');
    return `tests/codex/server/${dir ? dir + '/' : ''}${filename}.test.js`;
  }

  // Handle src/ modules
  if (sourcePath.startsWith('src/')) {
    const relative = sourcePath.slice('src/'.length);
    const ext = relative.match(/\.[^.]+$/)?.[0] || '';
    const basename = relative.slice(0, -ext.length);
    const parts = basename.split('/');
    const filename = parts.pop();
    const dir = parts.join('/');
    return `tests/src/${dir ? dir + '/' : ''}${filename}.test.js`;
  }

  // Generic fallback: replace extension with .test.js
  return sourcePath.replace(/\.[^.]+$/, '.test.js');
}

/**
 * Check if a file is a test file.
 * @param {string} path
 * @returns {boolean}
 */
function isTestFile(path) {
  return TEST_PATTERNS.some(p => p.test(path));
}

/**
 * Check if a path should be excluded from coverage checks.
 * @param {string} path
 * @returns {boolean}
 */
function isExcluded(path) {
  return EXCLUDED_DIRS.some(ex => path.includes(`/${ex}/`) || path.startsWith(`${ex}/`));
}

/**
 * Get all source file paths from the file list.
 * @param {Array<{path: string}>} files
 * @returns {string[]}
 */
function getSourceFiles(files) {
  const LOGIC_EXTENSIONS = /\.(m?[jt]sx?|cjs)$/;
  return files
    .map(f => f.path)
    .filter(p => LOGIC_EXTENSIONS.test(p) && !isTestFile(p) && !isExcluded(p));
}

/**
 * Main scan function. Stateless, idempotent.
 *
 * @param {object} snapshot
 * @param {Array<{path: string, content: string}>} files - File list from snapshot
 * @returns {Promise<ScanResult>}
 */
export async function scan(snapshot, files = []) {
  const errors = [];
  const health = [];
  const sourceFiles = getSourceFiles(files);

  // Build set of existing test files
  const testFiles = new Set(
    files.filter(f => isTestFile(f.path)).map(f => f.path)
  );

  // Map of paths to file objects for content access
  const fileMap = new Map(files.map(f => [f.path, f]));

  // Check each source file for a corresponding test
  for (const sourcePath of sourceFiles) {
    const expectedTest = getExpectedTestPath(sourcePath);

    if (!testFiles.has(expectedTest)) {
      // Check for alternative test locations
      const alternatives = [
        expectedTest,
        expectedTest.replace('.test.', '.spec.'),
        sourcePath.replace(/^codex\//, 'tests/codex/').replace(/^src\//, 'tests/src/'),
      ];

      const hasTest = alternatives.some(alt => testFiles.has(alt));

      if (!hasTest) {
        const file = fileMap.get(sourcePath);
        const content = file?.content || '';

        // Check for ARCHIVED annotation (top-level comment)
        const archivedMatch = content.match(/^\/\/\s*ARCHIVED:\s*(logic-incomplete|wip-stub)/m);
        if (archivedMatch) {
          health.push(encodeArchivedHealth(CELL_ID, 'coverage-archived', {
            sourceFile: sourcePath,
            reason: archivedMatch[1],
          }));
          continue;
        }

        const error = new BytecodeError(
          'STATE',
          'WARN',
          'IMMUNE',
          ERROR_CODES.TEST_MISSING,
          {
            layer: 'coverage',
            sourceFile: sourcePath,
            expectedTestPath: expectedTest,
            alternatives: alternatives.filter(a => a !== expectedTest),
            detail: `No test file found for ${sourcePath}`,
          },
        );
        errors.push(error);
      }
    }
  }

  // Health signals
  if (sourceFiles.length > 0) {
    const covered = sourceFiles.filter(sf => {
      const expected = getExpectedTestPath(sf);
      return testFiles.has(expected) || testFiles.has(expected.replace('.test.', '.spec.'));
    });

    health.push(encodeBytecodeHealth(CELL_ID, 'coverage-summary', {
      totalModules: sourceFiles.length,
      covered: covered.length,
      missing: errors.length,
      coveragePercent: Math.round((covered.length / sourceFiles.length) * 100),
    }));

    // Per-module health for covered files
    for (const sf of covered) {
      health.push(encodeBytecodeHealth(CELL_ID, 'module-tested', {
        moduleId: sf,
        testStatus: 'pass',
      }));
    }
  }

  return { errors, health, skipped: [] };
}