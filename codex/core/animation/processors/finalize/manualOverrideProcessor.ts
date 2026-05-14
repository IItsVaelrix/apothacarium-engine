/**
 * Manual Override Microprocessor
 * 
 * Picks up manual overrides from intent.state and applies them to values.
 * This runs LATE in the pipeline but BEFORE constraints.
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';

export const manualOverrideProcessor: MotionProcessor = {
  id: 'mp.manual.override',
  stage: 'reactive',
  priority: 5,
  
  supports(intent: AnimationIntent): boolean {
    return !!intent.state;
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    const overrides = state.intent.state;
    
    if (!overrides) return state;
    
    const validKeys = [
      'durationMs', 'delayMs', 'easing', 
      'translateX', 'translateY', 
      'scale', 'scaleX', 'scaleY', 
      'rotateDeg', 'opacity', 'glow', 'blur',
      'loop', 'phaseOffset', 'originX', 'originY'
    ];
    
    const applied: string[] = [];
    
    for (const key of validKeys) {
      if (overrides[key] !== undefined) {
        (state.values as any)[key] = overrides[key];
        applied.push(key);
      }
    }
    
    if (applied.length > 0) {
      state.diagnostics.push(`Manual overrides applied: ${applied.join(', ')}`);
      state.trace.push({
        processorId: this.id,
        stage: this.stage,
        changed: applied,
        timestamp: performance.now(), // EXEMPT
      });
    }
    
    return state;
  },
};
