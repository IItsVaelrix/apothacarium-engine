/**
 * Animation AMP — Intent Normalization
 * 
 * Normalizes raw animation intents into a standard working state.
 * Applies preset defaults and initial flags.
 */

import { AnimationIntent, MotionWorkingState } from '../contracts/animation.types.ts';

/**
 * Normalize animation intent into working state
 */
export async function normalizeAnimationIntent(intent: AnimationIntent): Promise<MotionWorkingState> {
  const startTime = performance.now(); // EXEMPT

  // Apply preset defaults if preset specified
  const workingState: MotionWorkingState = {
    intent,
    values: {
      durationMs: 300,
      delayMs: 0,
      easing: 'ease-out',
      translateX: 0,
      translateY: 0,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotateDeg: 0,
      opacity: 1,
      glow: 0,
      blur: 0,
      loop: false,
      phaseOffset: 0,
      originX: 0.5,
      originY: 0.5,
    },
    flags: {
      interruptible: true,
      reduced: false,
      constrained: false,
      gpuAccelerated: intent.constraints?.gpuAccelerate ?? true,
      symmetryApplied: false,
    },
    diagnostics: [],
    trace: [],
  };
  
  // Load preset defaults if specified
  if (intent.preset) {
    try {
      const { getAnimationPreset } = await import('../presets/presetRegistry.ts');
      const preset = getAnimationPreset(intent.preset);
      if (preset) {
        workingState.values = { ...workingState.values, ...preset.defaults };
        workingState.flags = { ...workingState.flags, ...preset.flags };
        workingState.diagnostics.push(`Preset applied: ${intent.preset}`);
      } else {
        workingState.diagnostics.push(`Preset not found: ${intent.preset}`);
      }
    } catch (error) {
      workingState.diagnostics.push(`Failed to load preset registry: ${(error as Error).message}`);
    }
  }
  
  // Add normalize trace
  workingState.trace.push({
    processorId: 'amp.normalize',
    stage: 'normalize',
    changed: ['values', 'flags'],
    timestamp: performance.now() - startTime, // EXEMPT
  });
  
  return workingState;
}
