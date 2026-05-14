/**
 * GrimDesign Intent Analyzer
 *
 * Entry point for the GrimDesign pipeline. Accepts a natural-language design
 * intent string, runs it through the CODEx analysis pipeline, and returns the
 * GrimSignal needed by the decision engine.
 *
 * Codex owns this module. Claude consumes the output.
 */

import { analyzeText } from '../analysis.pipeline.js';
import { extractDominantSignal } from './signalExtractor.js';

/**
 * Analyzes a design intent string through the CODEx pipeline.
 * Returns the GrimSignal needed by resolveDesignDecisions().
 *
 * @param {string} intentString - e.g. "cooldown indicator for a VOID-school agent"
 * @returns {Promise<import('./signalExtractor').GrimSignal>}
 */
export async function analyzeDesignIntent(intentString) {
  const safe = typeof intentString === 'string' ? intentString.trim() : '';
  const doc  = await analyzeText(safe);
  return extractDominantSignal(doc);
}
