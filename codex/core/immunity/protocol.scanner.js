/**
 * LAYER 3 — PROTOCOL SCANNER
 *
 * Detects sync-style calls to async APIs across file boundaries.
 *
 * Layer 1 (innate) catches single-file textual patterns. Layer 2 (adaptive)
 * catches semantic similarity to known pathogens. Neither catches a class of
 * decay that becomes endemic the moment a layer migrates: a function in
 * module A is changed to `async`, but callers in module B still treat it as
 * synchronous. The Promise becomes the data, every assertion becomes
 * `expected undefined`, and the test suite light goes red without any
 * pattern that a textual or vectorial scanner can detect.
 *
 * Layer 3 closes that gap by *harvesting* the async surface from one set
 * of modules and *flagging* un-awaited callers in another.
 */

import { readFileSync } from 'node:fs';
import { encodeBytecodeError, ERROR_CATEGORIES, ERROR_CODES, ERROR_SEVERITY, MODULE_IDS } from '../pixelbrain/bytecode-error.js';

/**
 * Externalized allow-list patterns for protocol scanner.
 * These patterns intentionally allow unresolved Promise calls in specific contexts.
 * 
 * Each entry:
 *   - pattern: RegExp string tested against the line after the call expression
 *   - reason: Human-readable explanation for the allowance
 */
export const PROTOCOL_ALLOW_LIST = Object.freeze([
  {
    pattern: '\\)\\s*\\.\\s*rejects',
    reason: 'Jest/Vitest async assertion: expect(promise).rejects expects unresolved Promise',
  },
  {
    pattern: '\\)\\s*\\.\\s*resolves',
    reason: 'Jest/Vitest async assertion: expect(promise).resolves expects unresolved Promise',
  },
  {
    pattern: '\\)\\s*\\.\\s*to\\.\\w+\\(',
    reason: 'Jest/Vitest matcher chaining: expect(promise).toBeX() expects unresolved Promise',
  },
  // Add new patterns here with descriptive reason fields
]);

/**
 * Harvest async function names from a list of implementation modules.
 *
 * Catches three async declaration shapes:
 *   1. `async function fooBar(...)` (top-level)
 *   2. `    async fooBar(...) {` (object-method shorthand)
 *   3. `export async function fooBar(...)` (exported async)
 *
 * @param {string[]} implPaths - Absolute paths to implementation modules.
 * @returns {Set<string>} Set of async function names found.
 */
export function harvestAsyncSurface(implPaths) {
    const surface = new Set();
    for (const filePath of implPaths) {
        let content;
        try { content = readFileSync(filePath, 'utf8'); }
        catch { continue; }
        for (const m of content.matchAll(/^(?:export\s+)?async\s+function\s+(\w+)/gm)) {
            surface.add(m[1]);
        }
        for (const m of content.matchAll(/^\s+async\s+(\w+)\s*\(/gm)) {
            surface.add(m[1]);
        }
    }
    return surface;
}

/**
 * Scan a caller source for calls to async functions that lack `await`.
 *
 * @param {string} content - Source of the caller.
 * @param {string} filePath - Path to the caller (for the violation report).
 * @param {Object} options
 * @param {Set<string>} options.asyncSurface - Async function names to flag.
 *   When the call expression's *terminal* method name is in this set, the
 *   call is treated as async-bound.
 * @param {string[]} [options.callerPrefixes] - If provided, only calls whose
 *   leading identifier is one of these (e.g. ['collabPersistence',
 *   'collabService']) are inspected. Defaults to all identifier-rooted
 *   call expressions.
 * @returns {Array<{
 *   ruleId: string,
 *   name: string,
 *   bytecode: string,
 *   category: string,
 *   severity: string,
 *   errorCode: number,
 *   context: { line: number, column: number, callExpr: string, asyncTarget: string },
 *   filePath: string
 * }>}
 */
export function scanProtocol(content, filePath, options = {}) {
    const { asyncSurface, callerPrefixes } = options;
    if (!(asyncSurface instanceof Set) || asyncSurface.size === 0) return [];

    const violations = [];
    const lines = content.split('\n');

    // We deliberately keep this scanner regex-based instead of full AST. It is
    // a structural check, not a semantic one — it only needs to know "did the
    // author write `await` immediately before this dotted call?" The cost of
    // an AST parse on every test file would be prohibitive at CI scale.
    const prefixGuard = callerPrefixes && callerPrefixes.length > 0
        ? `(?:${callerPrefixes.map(escapeRe).join('|')})`
        : '\\w+';

    // Match identifiers like `collabPersistence.X.Y(`, capturing the dotted
    // path and the terminal method name.
    const callRe = new RegExp(`(?<!\\.)\\b(${prefixGuard})((?:\\.[\\w$]+)+)\\s*\\(`, 'g');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
        while ((m = callRe.exec(line)) !== null) {
            const root = m[1];
            const tail = m[2]; // e.g. `.agents.register`
            const segments = tail.slice(1).split('.');
            const terminal = segments[segments.length - 1];
            if (!asyncSurface.has(terminal)) continue;

            // Inspect characters immediately preceding the match, after stripping
            // trailing line comments. We do not jump back across multi-line
            // expressions; the codemod and the human author both write `await`
            // on the same line as the call.
            const before = line.slice(0, m.index).replace(/\/\/.*$/, '');
            const cleaned = before.replace(/\/\*[\s\S]*?\*\//g, '');
            // Match `await` at the end of the cleaned prefix.
            if (/\bawait\s+$/.test(cleaned)) continue;
            // Check against externalized allow-list patterns
            const after = line.slice(m.index);
            const isAllowed = PROTOCOL_ALLOW_LIST.some(({ pattern }) => {
              try {
                return new RegExp(pattern).test(after);
              } catch {
                return false;
              }
            });
            if (isAllowed) continue;

            const context = {
                layer: 'protocol',
                line: i + 1,
                column: m.index + 1,
                callExpr: `${root}${tail}(...)`,
                asyncTarget: terminal,
                path: filePath,
            };
            const bytecode = encodeBytecodeError(
                ERROR_CATEGORIES.STATE,
                ERROR_SEVERITY.CRIT,
                MODULE_IDS.IMMUNITY,
                ERROR_CODES.IMMUNE_PROTOCOL_BLOCK,
                context,
            );
            violations.push({
                ruleId: 'PROTO-0F08',
                name: 'Sync call to async API (protocol drift)',
                bytecode,
                category: ERROR_CATEGORIES.STATE,
                severity: ERROR_SEVERITY.CRIT,
                errorCode: ERROR_CODES.IMMUNE_PROTOCOL_BLOCK,
                context,
                filePath,
            });
        }
    }

    return violations;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
