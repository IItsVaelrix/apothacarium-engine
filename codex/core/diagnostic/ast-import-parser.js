/**
 * AST IMPORT PARSER — Phase 2 of the diagnostic substrate.
 *
 * Replaces the regex-based import detector in layer-boundary.cell.js with
 * a real AST parse via @babel/parser (which handles JS, TS, JSX, and
 * dynamic / re-export / require forms).
 *
 * Returns one record per resolvable import. Non-literal paths (template
 * literals with embedded expressions, identifier-typed dynamic imports)
 * are reported with `dynamic: true` and `path: null` so callers can
 * decide whether to flag them as unresolvable.
 *
 * Determinism contract (VAELRIX_LAW §6):
 *   - parseImports() is a pure function: same content → same import list
 *   - No timestamps, no randomness, no external state
 *
 * Reference: VERDICT-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE §3 (regex gap)
 */

import { parse as babelParse } from '@babel/parser';

const PARSE_OPTIONS = Object.freeze({
  sourceType: 'module',
  allowImportExportEverywhere: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  errorRecovery: true,
  plugins: ['jsx', 'typescript', 'classProperties', 'classPrivateProperties', 'classPrivateMethods', 'dynamicImport', 'importMeta', 'topLevelAwait'],
});

/**
 * @typedef {object} ImportRecord
 * @property {number} line - 1-based line number
 * @property {string|null} path - Resolved literal path, or null if non-literal
 * @property {'static'|'dynamic'|'require'|'export-from'} kind
 * @property {boolean} dynamic - True if path could not be resolved at parse time
 */

function readStringNode(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function lineOf(node) {
  return node?.loc?.start?.line ?? 1;
}

/**
 * Parse imports from JS/TS/JSX file content.
 *
 * @param {string} content
 * @param {string} _path - Used only for error messages
 * @returns {{ imports: ImportRecord[], parseError: string|null }}
 */
export function parseImports(content, _path = '<anonymous>') {
  let ast;
  try {
    ast = babelParse(content, PARSE_OPTIONS);
  } catch (err) {
    return { imports: [], parseError: err.message };
  }

  const imports = [];
  const body = ast.program?.body ?? [];

  // Top-level statements: ImportDeclaration / ExportFrom
  for (const node of body) {
    if (node.type === 'ImportDeclaration') {
      const path = readStringNode(node.source);
      imports.push({ line: lineOf(node), path, kind: 'static', dynamic: path === null });
    } else if (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      const path = readStringNode(node.source);
      imports.push({ line: lineOf(node), path, kind: 'export-from', dynamic: path === null });
    }
  }

  // Walk the entire tree for dynamic import() and require() calls
  walk(ast.program, (node) => {
    if (!node || typeof node !== 'object') return;

    // Babel emits dynamic `import('foo')` as CallExpression with callee.type === 'Import'
    if (node.type === 'CallExpression' && node.callee?.type === 'Import') {
      const arg = node.arguments?.[0];
      const path = readStringNode(arg);
      imports.push({ line: lineOf(node), path, kind: 'dynamic', dynamic: path === null });
      return;
    }

    // CommonJS: require('foo')
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require' &&
      node.arguments?.length >= 1
    ) {
      const path = readStringNode(node.arguments[0]);
      imports.push({ line: lineOf(node), path, kind: 'require', dynamic: path === null });
    }
  });

  return { imports, parseError: null };
}

/**
 * Iterative AST walker — depth-first, no recursion limit issues on deep trees.
 */
function walk(root, visit) {
  if (!root) return;
  const stack = [root];
  const seen = new WeakSet();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'start' || key === 'end' || key === 'extra') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (let i = child.length - 1; i >= 0; i--) {
          if (child[i] && typeof child[i] === 'object') stack.push(child[i]);
        }
      } else if (child && typeof child === 'object' && typeof child.type === 'string') {
        stack.push(child);
      }
    }
  }
}

/**
 * Calculates the Linguistic Mass of a file content.
 * This is defined as the number of imports.
 *
 * @param {string} content
 * @param {string} _path - Used only for error messages
 * @returns {{ count: number, parseError: string|null }}
 */
export function getLinguisticMass(content, _path = '<anonymous>') {
  const { imports, parseError } = parseImports(content, _path);
  return { count: imports.length, parseError };
}
