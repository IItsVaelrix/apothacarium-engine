/**
 * Processor Registration Utility
 * 
 * Collects and registers all available motion microprocessors into the AMP registry.
 */

import { processorRegistry } from '../amp/runAnimationAmp.ts';
import { constraintProcessors } from './constraints/constraintProcessors.ts';
import { transformProcessors } from './transform/transformProcessors.ts';
import { timeVisualProcessors } from './time/timeVisualProcessors.ts';
import { interactionProcessors } from './input/interactionProcessors.ts';
import { symmetryMotionProcessor } from './symmetry/symmetryMotionProcessor.ts';
import { manualOverrideProcessor } from './finalize/manualOverrideProcessor.ts';
import { atmosphereProcessor } from './reactive/atmosphereProcessor.ts';
import { DimensionProcessor } from './dimension-processor.ts';

/**
 * Register all implemented motion microprocessors
 */
export function registerAllProcessors(): void {
  const allProcessors = [
    ...constraintProcessors,
    ...transformProcessors,
    ...timeVisualProcessors,
    ...interactionProcessors,
    symmetryMotionProcessor,
    manualOverrideProcessor,
    atmosphereProcessor,
    new DimensionProcessor(),
  ];
  
  for (const processor of allProcessors) {
    processorRegistry.register(processor);
  }
  
  console.log(`[AnimationAMP] Registered ${allProcessors.length} microprocessors`);
}
