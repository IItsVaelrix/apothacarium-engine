/**
 * The CODEx Scoring Engine.
 * Factory-based: call createScoringEngine(heuristics) to get an isolated instance.
 * Each instance encapsulates its own heuristic registry.
 *
 * @see AI_Architecture_V2.md section 3.3 and 5.2
 */

import { analyzeText } from './analysis.pipeline.js';
import { attachHeuristicCommentary } from './commentary/commentary.builder.js';
import { getLinguisticMass } from './diagnostic/ast-import-parser.js';
import balance from './balance.js';

const { DAMPENING_FIELD_WEIGHT, DAMPENING_FIELD_EXPONENT, DEFAULT_MASTERY_LEVEL } = balance;

/**
 * Creates a new scoring engine instance with encapsulated state.
 * @param {Array<{name: string, scorer: function(import('./schemas').AnalyzedDocument): import('./schemas').ScoreTrace, weight: number}>} [initialHeuristics=[]]
 * @returns {{ calculateScore: function(string|import('./schemas').AnalyzedDocument): {totalScore: number, traces: import('./schemas').ScoreTrace[]}, registerHeuristic: function, reset: function, getHeuristics: function }}
 */
export function createScoringEngine(initialHeuristics = []) {
  const heuristics = [...initialHeuristics];

  function registerHeuristic(heuristic) {
    heuristics.push(heuristic);
  }

  async function calculateScore(input, options = {}) {
    if (!input) {
      return { totalScore: 0, traces: [] };
    }

    /** @type {import('./schemas').AnalyzedDocument} */
    let doc;
    if (typeof input === 'string') {
      doc = await analyzeText(input);
    } else {
      doc = input;
    }

    if (!doc.stats || doc.stats.wordCount === 0) {
       // Return early if empty doc, but run heuristics if they handle empty docs?
       // Most will fail or return 0. Let's let them run but they expect a doc.
    }

    const rawTraces = await Promise.all(heuristics.map(async (h) => {
      const raw = await h.scorer(doc);
      return {
        ...raw,
        heuristic: raw?.heuristic || h.name,
        weight: h.weight,
        contribution: raw.rawScore * h.weight * 100,
      };
    }));

    const tracesWithCommentary = attachHeuristicCommentary(rawTraces, doc);
    const heuristicScore = tracesWithCommentary.reduce((sum, t) => sum + t.contribution, 0);

    const importRegex = /import(?:["'\s]*(?:[\w*{}\n\r\t, ]+)from\s*)?["'\s].*$/gm;
    const importStatements = doc.raw.match(importRegex)?.join('\n') || '';
    const { count: importCount } = getLinguisticMass(importStatements);

    const mastery = options.mastery ?? DEFAULT_MASTERY_LEVEL;
    const linguisticMass = Math.max(0, importCount - mastery);
    const costBasis = linguisticMass ** DAMPENING_FIELD_EXPONENT;
    const dampeningFactor = 1 / (1 + DAMPENING_FIELD_WEIGHT * costBasis);

    const finalTraces = [...tracesWithCommentary];

    if (linguisticMass > 0) {
        const penalty = heuristicScore * (1 - dampeningFactor);
        const bytecode = `PB-SCORE-v1-DAMPENING-FIELD ${(-penalty).toFixed(2)} linguistic_mass:${importCount} mastery_level:${mastery} cost_basis:${costBasis}`;
        finalTraces.push({
            heuristic: 'Dampening Field',
            rawScore: -penalty,
            weight: 1,
            contribution: -penalty,
            commentary: {
                title: 'Weight-Class Pressure',
                summary: `Linguistic Mass of ${linguisticMass} is dampening score multiplicatively.`
            },
            bytecode,
            linguisticMass,
            mastery,
            costBasis,
            rawImportCount: importCount,
        });
    } else {
        finalTraces.push({
            heuristic: 'Dampening Field',
            rawScore: 0,
            weight: 1,
            contribution: 0,
            commentary: {
                title: 'Weight-Class Pressure',
                summary: 'No external dependencies detected. No dampening applied.'
            },
            bytecode: `PB-SCORE-v1-DAMPENING-FIELD 0.00 linguistic_mass:0 mastery_level:${mastery} cost_basis:0`,
            linguisticMass: 0,
            mastery,
            costBasis: 0,
            rawImportCount: importCount,
        });
    }

    const totalScore = finalTraces.reduce((sum, t) => sum + t.contribution, 0);

    return {
      totalScore: Math.round(totalScore),
      traces: finalTraces,
    };
   }

  function reset() {
    heuristics.length = 0;
  }


  function getHeuristics() {
    return [...heuristics];
  }

  return { calculateScore, registerHeuristic, reset, getHeuristics };
}

