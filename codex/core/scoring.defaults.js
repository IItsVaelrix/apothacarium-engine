import { createScoringEngine } from './scoring.engine.js';
import { createAbyssalResonanceHeuristic } from './heuristics/abyssal_resonance.js';
import { alliterationDensityHeuristic } from './heuristics/alliteration_density.js';
import { cohesionHeuristic } from './heuristics/cohesion.js';
import { literaryDeviceRichnessHeuristic } from './heuristics/literary_device_richness.js';
import { meterRegularityHeuristic } from './heuristics/meter_regularity.js';
import { multisyllabicRhymeHeuristic } from './heuristics/multisyllabic_rhyme.js';
import { phoneticHackingHeuristic } from './heuristics/phonetic_hacking.js';
import { phonemeDensityHeuristic } from './heuristics/phoneme_density.js';
import { rhymeQualityHeuristic } from './heuristics/rhyme_quality.js';
import { scrollPowerHeuristic } from './heuristics/scroll_power.js';
import { createVerseIRAmplifierHeuristic } from './heuristics/verseir_amplifier.js';
import { vocabularyRichnessHeuristic } from './heuristics/vocabulary_richness.js';
import { emotionalResonanceHeuristic } from './heuristics/emotional_resonance.js';

export const DEFAULT_SCORING_HEURISTICS = Object.freeze([
  phonemeDensityHeuristic,
  alliterationDensityHeuristic,
  rhymeQualityHeuristic,
  multisyllabicRhymeHeuristic,
  scrollPowerHeuristic,
  meterRegularityHeuristic,
  literaryDeviceRichnessHeuristic,
  vocabularyRichnessHeuristic,
  phoneticHackingHeuristic,
  emotionalResonanceHeuristic,
]);

function overrideHeuristicWeight(heuristicDef, weight) {
  return Object.freeze({
    ...heuristicDef,
    weight,
  });
}

export const COMBAT_SCORING_HEURISTICS = Object.freeze([
  overrideHeuristicWeight(phonemeDensityHeuristic, 0.15),
  overrideHeuristicWeight(rhymeQualityHeuristic, 0.15),
  overrideHeuristicWeight(multisyllabicRhymeHeuristic, 0.15),
  overrideHeuristicWeight(cohesionHeuristic, 0.15),
  overrideHeuristicWeight(vocabularyRichnessHeuristic, 0.10),
  createVerseIRAmplifierHeuristic({ weight: 0.05 }),
  createAbyssalResonanceHeuristic({ weight: 0.15 }),
  overrideHeuristicWeight(phoneticHackingHeuristic, 0.10),
]);

export function createDefaultScoringEngine() {
  const engine = createScoringEngine();
  DEFAULT_SCORING_HEURISTICS.forEach((heuristicDef) => {
    engine.registerHeuristic({
      name: heuristicDef.name,
      scorer: heuristicDef.scorer,
      weight: heuristicDef.weight,
    });
  });
  return engine;
}

function getCombatScoringHeuristics(options = {}) {
  return Object.freeze([
    overrideHeuristicWeight(phonemeDensityHeuristic, 0.15),
    overrideHeuristicWeight(rhymeQualityHeuristic, 0.15),
    overrideHeuristicWeight(multisyllabicRhymeHeuristic, 0.15),
    overrideHeuristicWeight(cohesionHeuristic, 0.15),
    overrideHeuristicWeight(vocabularyRichnessHeuristic, 0.10),
    createVerseIRAmplifierHeuristic({ weight: 0.05 }),
    createAbyssalResonanceHeuristic({
      provider: options.abyssProvider,
      weight: 0.15,
    }),
    overrideHeuristicWeight(phoneticHackingHeuristic, 0.10),
  ]);
}

export function createCombatScoringEngine(options = {}) {
  const engine = createScoringEngine();
  getCombatScoringHeuristics(options).forEach((heuristicDef) => {
    engine.registerHeuristic({
      name: heuristicDef.name,
      scorer: heuristicDef.scorer,
      weight: heuristicDef.weight,
    });
  });
  return engine;
}

export { getCombatScoringHeuristics };
