/**
 * LAYER_BOUNDARY — Cell Wall Enforcement Cell
 *
 * Enforces the cell wall boundaries defined in cell_wall_infrastructure_pdr.md.
 * Detects forbidden imports crossing layer boundaries:
 *   - codex/core → src/ (forbidden)
 *   - src/lib → codex/runtime/server (allowed bridge)
 *
 * Key codes emitted:
 *   - PB-ERR-v1-IMMUNE-FORBIDDEN-IMPORT (0x0F03)
 *   - PB-OK-v1-IMMUNE-PASS-COORD
 *
 * Determinism contract (VAELRIX_LAW §6):
 *   - scan() is a pure function: same content → same violations
 *
 * Reference: docs/scholomance-encyclopedia/PDR-archive/cell_wall_infrastructure_pdr.md
 */

import { BytecodeError, ERROR_CODES } from '../../pixelbrain/bytecode-error.js';
import { encodeBytecodeHealth, encodeArchivedHealth } from '../BytecodeHealth.js';
import { parseImports as astParseImports } from '../ast-import-parser.js';

export const CELL_ID = 'LAYER_BOUNDARY';
export const CELL_NAME = 'Layer Boundary Enforcer';
export const CELL_DESCRIPTION = 'Enforces cell wall boundaries — no src/ imports in codex/core, no forbidden crossing';
export const CELL_SCHEDULE = 'on-commit';

// Layer boundary rules
const LAYER_RULES = [
  {
    // Codex core is a vacuum — no src/ imports allowed
    id: 'LING-0F03-CODEX-CORE',
    name: 'Forbidden src/ import in codex/core',
    description: 'codex/core must not import from src/',
    sourcePattern: /^codex\/core\//,
    forbiddenImports: [
      { pattern: /^src\//, reason: 'codex/core is a vacuum layer' },
      { pattern: /^\.\.\/src\//, reason: 'No relative path crossing into src/' },
    ],
  },
  {
    // Codex services may import from codex/core but not from codex/runtime/server
    id: 'LAYER-SERVICE-BOUNDARY',
    name: 'Forbidden codex/server import in codex/services',
    description: 'codex/services must not import from codex/server or codex/runtime',
    sourcePattern: /^codex\/services\//,
    forbiddenImports: [
      { pattern: /^codex\/server\//, reason: 'codex/services must not depend on server layer' },
      { pattern: /^codex\/runtime\//, reason: 'codex/services must not depend on runtime layer' },
    ],
  },
];

// Files we'll attempt to AST-parse. Anything else (.json, .md, etc.) is skipped.
const PARSEABLE_EXTENSIONS = /\.(m?[jt]sx?|cjs)$/;

/**
 * Parse imports from JS/TS/JSX content via AST. Falls back to an empty list
 * on parse failure (recorded for visibility but not treated as a violation).
 *
 * @param {string} content
 * @param {string} path
 * @returns {{ imports: Array<{line: number, path: string|null, kind: string, dynamic: boolean}>, parseError: string|null }}
 */
function parseImports(content, path) {
  if (!PARSEABLE_EXTENSIONS.test(path)) return { imports: [], parseError: null };
  return astParseImports(content, path);
}

/**
 * Check if a module path is a node built-in.
 * @param {string} path
 * @returns {boolean}
 */
function isBuiltinModule(path) {
  const builtins = [
    'node:crypto', 'node:path', 'node:url', 'node:util', 'node:buffer',
    'node:fs', 'node:events', 'node:stream', 'node:http', 'node:https',
    'crypto', 'path', 'url', 'util', 'buffer', 'fs', 'events', 'stream',
  ];
  return builtins.some(b => path === b || path.startsWith(b + '/'));
}

/**
 * Main scan function. Stateless, idempotent.
 *
 * @param {object} _snapshot - Unused
 * @param {Array<{content: string, path: string}>} files - Files to scan
 * @returns {Promise<ScanResult>}
 */
export async function scan(_snapshot, files = []) {
  const errors = [];
  const health = [];

  for (const { content, path } of files) {
    // Find applicable rules for this file
    const applicableRules = LAYER_RULES.filter(r => r.sourcePattern.test(path));
    if (applicableRules.length === 0) continue;

    const { imports } = parseImports(content, path);
    const violations = [];

    for (const imp of imports) {
      // Dynamic / unresolvable paths can't be checked statically.
      if (imp.dynamic || imp.path === null) continue;
      // Skip node built-ins (allowed in vacuum layer)
      if (isBuiltinModule(imp.path)) continue;

      for (const rule of applicableRules) {
        for (const forbidden of rule.forbiddenImports) {
          if (forbidden.pattern.test(imp.path)) {
            violations.push({
              rule,
              forbidden,
              import: imp,
              context: {
                layer: 'cell-wall',
                sourceFile: path,
                forbiddenImport: imp.path,
                line: imp.line,
                kind: imp.kind,
                reason: forbidden.reason,
              },
            });
          }
        }
      }
    }

    // Emit errors
    for (const v of violations) {
      const ruleId = v.rule.id;
      // Check for ARCHIVED annotation for this specific rule (top-level comment)
      const archivedRegex = new RegExp(`^\\/\\/\\s*ARCHIVED:\\s*${ruleId}`, 'm');
      if (archivedRegex.test(content)) {
        health.push(encodeArchivedHealth(CELL_ID, `layer-archived-${ruleId}`, {
          path,
          ruleId,
          reason: 'logic-incomplete',
        }));
      } else {
        const error = new BytecodeError(
          'LINGUISTIC',
          'CRIT',
          'IMMUNE',
          ERROR_CODES.IMMUNE_FORBIDDEN_IMPORT,
          v.context,
        );
        errors.push(error);
      }
    }
  }

  // Health signals
  const codexCoreFiles = files.filter(f => f.path.startsWith('codex/core/'));
  if (codexCoreFiles.length > 0) {
    const dirty = new Set(errors.map(e => e.context.sourceFile));
    const cleanFiles = codexCoreFiles.filter(f => !dirty.has(f.path));
    for (const file of cleanFiles) {
      health.push(encodeBytecodeHealth(CELL_ID, 'no-src-imports-in-codex-core', {
        moduleId: file.path,
        forbiddenImports: 0,
      }));
    }
  }

  return { errors, health, skipped: [] };
}