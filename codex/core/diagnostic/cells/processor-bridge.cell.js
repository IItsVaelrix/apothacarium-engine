/**
 * PROCESSOR_BRIDGE — Illegal Bridge Crossings Cell
 *
 * Detects unauthorized crossings via processor-bridge.js and similar convenience hacks.
 * Key codes emitted:
 *   - PB-ERR-v1-IMMUNE-PROTOCOL-BLOCK (0x0F08)
 *   - PB-OK-v1-PROCESSOR-BRIDGE-CLEAN
 *
 * Reference: PDR-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE
 */

import { BytecodeError, ERROR_CODES } from '../../pixelbrain/bytecode-error.js';
import { encodeBytecodeHealth, encodeArchivedHealth } from '../BytecodeHealth.js';
import { parseImports as astParseImports } from '../ast-import-parser.js';

export const CELL_ID = 'PROCESSOR_BRIDGE';
export const CELL_NAME = 'Processor Bridge Enforcer';
export const CELL_DESCRIPTION = 'Detects illegal bridge crossings via import statements';
export const CELL_SCHEDULE = 'on-commit';

const PARSEABLE_EXTENSIONS = /\.(m?[jt]sx?|cjs)$/;

// Each rule receives an import path (a literal string from a real import/
// require/dynamic-import) and decides whether it is forbidden in `sourcePath`.
const BRIDGE_RULES = [
  {
    id: 'CROSS_LAYER_IMPORT',
    test: ({ importPath }) => /processor-?bridge/i.test(importPath) && /^src\/lib\//.test(importPath),
    reason: 'Importing processor-bridge from src/lib — forbidden convenience hack',
  },
  {
    id: 'CONVENIENCE_BRIDGE',
    test: ({ importPath, sourcePath }) =>
      // Only flag imports that end in processor-bridge.js or are exact matches
      /(^|\/)processor-?bridge\.js$/.test(importPath) &&
      // Don't flag the bridge file, adapters, or tests for importing themselves
      !sourcePath.endsWith('processor-bridge.js') &&
      !sourcePath.endsWith('engine.adapter.js') &&
      !sourcePath.endsWith('processor-bridge.cell.js') &&
      !sourcePath.includes('/diagnostic.stasis.test.'),
    reason: 'Direct processor-bridge import — use official API instead',
  },
  {
    id: 'RUNTIME_TO_CORE',
    test: ({ importPath, sourcePath }) =>
      sourcePath.startsWith('codex/core/') && /(^|\/)codex\/runtime\//.test(importPath),
    reason: 'codex/core importing from codex/runtime — forbidden layer crossing',
  },
  {
    id: 'SERVER_TO_RUNTIME',
    test: ({ importPath, sourcePath }) =>
      sourcePath.startsWith('codex/runtime/') && /(^|\/)codex\/server\//.test(importPath),
    reason: 'codex/runtime importing from codex/server — forbidden layer crossing',
  },
];

/**
 * Scan a file for bridge-rule violations via AST-resolved imports.
 *
 * @param {string} content
 * @param {string} sourcePath
 * @returns {Array<{rule: object, line: number, importPath: string}>}
 */
function scanForBridges(content, sourcePath) {
  if (!PARSEABLE_EXTENSIONS.test(sourcePath)) return [];
  const { imports } = astParseImports(content, sourcePath);
  const findings = [];
  for (const imp of imports) {
    if (!imp.path || imp.dynamic) continue;
    for (const rule of BRIDGE_RULES) {
      if (rule.test({ importPath: imp.path, sourcePath })) {
        findings.push({ rule, line: imp.line, importPath: imp.path });
      }
    }
  }
  return findings;
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

  for (const { content, path } of files) {
    const findings = scanForBridges(content, path);

    for (const f of findings) {
      const bridgeRuleId = f.rule.id;
      // Check for ARCHIVED annotation for this specific bridge rule (top-level comment)
      const archivedRegex = new RegExp(`^\\/\\/\\s*ARCHIVED:\\s*${bridgeRuleId}`, 'm');
      if (archivedRegex.test(content)) {
        health.push(encodeArchivedHealth(CELL_ID, `bridge-archived-${bridgeRuleId}`, {
          path,
          bridgeRuleId,
          reason: 'logic-incomplete',
        }));
      } else {
        const error = new BytecodeError(
          'LINGUISTIC',
          'CRIT',
          'IMMUNE',
          ERROR_CODES.IMMUNE_PROTOCOL_BLOCK,
          {
            layer: 'bridge',
            bridgePatternId: bridgeRuleId,
            path,
            line: f.line,
            importPath: f.importPath,
            detail: f.rule.reason,
          },
        );
        errors.push(error);
      }
    }
  }

  // Health signals
  const codexFiles = files.filter(f => f.path.startsWith('codex/'));
  if (codexFiles.length > 0) {
    const cleanFiles = codexFiles.filter(f =>
      !errors.some(e => e.context.path === f.path)
    );

    health.push(encodeBytecodeHealth(CELL_ID, 'bridge-integrity-summary', {
      totalCodexFiles: codexFiles.length,
      cleanFiles: cleanFiles.length,
      violations: errors.length,
    }));

    for (const cf of cleanFiles) {
      health.push(encodeBytecodeHealth(CELL_ID, 'no-bridge-violations', {
        moduleId: cf.path,
      }));
    }
  }

  return { errors, health, skipped: [] };
}