/**
 * Symmetry AMP Integration Processor
 * 
 * Connects Animation AMP to the existing Symmetry AMP system.
 * Applies symmetry-aware motion transformations for mirrored/radial patterns.
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';

/**
 * Symmetry-aware motion processor
 * 
 * Integrates with Symmetry AMP to apply:
 * - Mirrored motion for horizontal/vertical symmetry
 * - Radial motion patterns for radial symmetry
 * - Axis-aligned transforms
 */
export const symmetryMotionProcessor: MotionProcessor = {
  id: 'mp.symmetry.motion',
  stage: 'symmetry',
  priority: 70,
  
  supports(intent: AnimationIntent): boolean {
    return intent.symmetry !== undefined && 
           intent.symmetry.type !== 'none' &&
           intent.symmetry.confidence !== undefined &&
           intent.symmetry.confidence > 0.5;
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const symmetry = input.intent.symmetry;
    
    if (!symmetry) {
      return input;
    }

    // 1. CLONE STATE AND VALUES: Fix shared mutation bug
    const state = { 
      ...input,
      values: { ...input.values },
      flags: { ...input.flags },
      diagnostics: [...input.diagnostics],
      trace: [...input.trace],
    };
    
    state.diagnostics.push(`Symmetry motion applied: ${symmetry.type} (confidence: ${symmetry.confidence})`);
    state.flags.symmetryApplied = true;
    
    const changes: string[] = [];
    
    // 2. APPLY AXIS-CORRECT TRANSFORMS: Fix orientation logic
    switch (symmetry.type) {
      case 'horizontal':
        // Horizontal Symmetry = Reflection across VERTICAL axis (Left matches Right)
        // Flip X translations
        if (symmetry.mirror) {
          if (state.values.translateX !== undefined) {
            state.values.translateX = -state.values.translateX;
            changes.push('translateX');
          }
          
          // Set origin to vertical reflection line (center)
          state.values.originX = 0.5;
          changes.push('originX');
        }
        break;
        
      case 'vertical':
        // Vertical Symmetry = Reflection across HORIZONTAL axis (Top matches Bottom)
        // Flip Y translations
        if (symmetry.mirror) {
          if (state.values.translateY !== undefined) {
            state.values.translateY = -state.values.translateY;
            changes.push('translateY');
          }
          
          // Set origin to horizontal reflection line (center)
          state.values.originY = 0.5;
          changes.push('originY');
        }
        break;
        
      case 'radial':
        // Apply radial motion pattern
        if (symmetry.mirror) {
          // Calculate rotation based on symmetry order
          const order = Math.max(2, Math.round(360 / (symmetry.axis ?? 90)));
          const segmentAngle = 360 / order;
          
          // Apply rotation for radial effect
          state.values.rotateDeg = (state.values.rotateDeg ?? 0) + segmentAngle;
          state.values.loop = true;
          
          // FIX: Normalize duration. Do not multiply by 'order' which causes timing explosion.
          // Instead, slightly increase duration for complex patterns but cap it.
          const baseDuration = state.values.durationMs ?? 300;
          state.values.durationMs = Math.min(baseDuration * 1.5, baseDuration + (order * 20));
          
          changes.push('rotateDeg', 'loop', 'durationMs');
          
          // Center origin for radial rotation
          state.values.originX = 0.5;
          state.values.originY = 0.5;
          changes.push('originX', 'originY');
        }
        break;
    }
    
    // 3. APPLY CONFIDENCE SCALING: Preserve intensity
    if (symmetry.confidence !== undefined) {
      const intensity = symmetry.confidence;
      
      if (state.values.translateX !== undefined) {
        state.values.translateX *= intensity;
        changes.push('translateX');
      }
      if (state.values.translateY !== undefined) {
        state.values.translateY *= intensity;
        changes.push('translateY');
      }
      if (state.values.scale !== undefined && state.values.scale !== 1) {
        const delta = (state.values.scale - 1) * intensity;
        state.values.scale = 1 + delta;
        changes.push('scale');
      }
    }
    
    // Record trace
    if (changes.length > 0) {
      state.trace.push({
        processorId: this.id,
        stage: this.stage,
        changed: changes,
        timestamp: performance.now(), // EXEMPT
      });
    }
    
    return state;
  },
};

/**
 * Symmetry-aware stagger processor
 * 
 * Applies staggered animations based on symmetry axis
 */
export const symmetryStaggerProcessor: MotionProcessor = {
  id: 'mp.symmetry.stagger',
  stage: 'sequence',
  priority: 60,
  
  supports(intent: AnimationIntent): boolean {
    return intent.symmetry !== undefined &&
           intent.symmetry.type !== 'none' &&
           intent.state?.staggerIndex !== undefined;
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const symmetry = input.intent.symmetry;
    const staggerIndex = input.intent.state?.staggerIndex as number;
    const staggerTotal = input.intent.state?.staggerTotal as number | undefined;
    
    if (!symmetry || staggerIndex === undefined) {
      return input;
    }

    // CLONE STATE AND VALUES: Fix shared mutation bug
    const state = { 
      ...input,
      values: { ...input.values },
      flags: { ...input.flags },
      diagnostics: [...input.diagnostics],
      trace: [...input.trace],
    };
    
    // Calculate phase offset based on symmetry
    let phaseOffset = 0;
    const staggerBase = 50; // 50ms base stagger
    
    switch (symmetry.type) {
      case 'horizontal':
        // Stagger along the Horizontal axis (X)
        phaseOffset = staggerIndex * staggerBase;
        break;
        
      case 'vertical':
        // Stagger along the Vertical axis (Y)
        phaseOffset = staggerIndex * staggerBase;
        break;

      case 'radial': {
        // Stagger in radial pattern
        const total = staggerTotal ?? 8;
        const duration = state.values.durationMs ?? 300;
        phaseOffset = (staggerIndex / total) * (duration / 2); // Cap stagger to half duration
        break;
      }
    }
    
    state.values.phaseOffset = phaseOffset;
    state.values.delayMs = (state.values.delayMs ?? 0) + phaseOffset;
    
    state.diagnostics.push(`Symmetry stagger applied: ${phaseOffset}ms offset`);
    state.trace.push({
      processorId: this.id,
      stage: this.stage,
      changed: ['phaseOffset', 'delayMs'],
      timestamp: performance.now(), // EXEMPT
    });
    
    return state;
  },
};

// ─── Processor Collection ───────────────────────────────────────────────────

export const symmetryProcessors: MotionProcessor[] = [
  symmetryMotionProcessor,
  symmetryStaggerProcessor,
];
