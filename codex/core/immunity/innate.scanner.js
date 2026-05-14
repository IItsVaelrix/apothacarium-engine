/**
 * LAYER 1 — INNATE SCANNER
 *
 * Applies pattern rules to file content. Each match yields a violation
 * carrying a real PixelBrain bytecode string (not a smuggled meta field).
 */

import { INNATE_RULES } from './innate.rules.js';
import { bytecodeFor } from './inflammatoryResponse.js';
import { getRepair } from './repair.recommendations.js';

/**
 * @param {string} content - Raw file content
 * @param {string} filePath - Relative path to file
 * @returns {Array<{
 *   ruleId: string,
 *   name: string,
 *   bytecode: string,
 *   category: string,
 *   severity: string,
 *   errorCode: number,
 *   repair: { key: string, title: string, suggestions: string[], canonical: string|null },
 *   context: object,
 * }>}
 */
export function scanInnate(content, filePath) {
  const violations = [];

  for (const rule of INNATE_RULES) {
    const result = rule.detector(content, filePath);
    if (!result) continue;

    const violation = result === true
      ? { matched: true, context: {} }
      : result;

    const repair = getRepair(rule.repairKey);
    violations.push({
      ruleId: rule.id,
      name: rule.name,
      bytecode: bytecodeFor(rule, violation, filePath),
      category: rule.category,
      severity: rule.severity,
      errorCode: rule.errorCode,
      moduleId: rule.moduleId,
      repair: {
        key: repair.key,
        title: repair.title,
        suggestions: repair.suggestions,
        canonical: repair.canonical || null,
      },
      context: violation.context || {},
    });
  }

  return violations;
}
