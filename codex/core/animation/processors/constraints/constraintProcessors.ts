/**
 * Constraint Microprocessors
 * 
 * Apply constraints to motion: reduced motion, device caps, bounds, performance.
 * These processors have HIGH precedence and run late in the pipeline.
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';

// ─── Reduced Motion Processor ───────────────────────────────────────────────

/**
 * Applies reduced motion preferences
 * Precedence: HIGHEST - accessibility always wins
 */
export const reducedMotionProcessor: MotionProcessor = {
  id: 'mp.constraint.reduced-motion',
  stage: 'constraint',
  priority: 100,
  
  supports(_intent: AnimationIntent): boolean {
    // Always run this processor if constraints are present or if it's explicitly requested.
    // It's safer to always run it to ensure defaults are checked.
    return true; 
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Check if reduced motion is requested via intent constraints
    if (state.intent.constraints?.reducedMotion) {
      state.diagnostics.push('Reduced motion applied');
      state.flags.reduced = true;
      state.flags.constrained = true;
      
      // Clamp duration
      if (state.values.durationMs && state.values.durationMs > 200) {
        state.values.durationMs = 200;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['durationMs'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      // Disable loop
      if (state.values.loop) {
        state.values.loop = false;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['loop'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      // Reduce transforms
      if (state.values.translateX && Math.abs(state.values.translateX) > 10) {
        state.values.translateX = state.values.translateX > 0 ? 10 : -10;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['translateX'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      if (state.values.translateY && Math.abs(state.values.translateY) > 10) {
        state.values.translateY = state.values.translateY > 0 ? 10 : -10;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['translateY'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      // Reduce scale
      if (state.values.scale && state.values.scale !== 1) {
        const delta = state.values.scale - 1;
        state.values.scale = 1 + (delta > 0 ? Math.min(delta, 0.05) : Math.max(delta, -0.05));
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['scale'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      // Disable glow/blur effects
      if (state.values.glow && state.values.glow > 0) {
        state.values.glow = 0;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['glow'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      if (state.values.blur && state.values.blur > 0) {
        state.values.blur = 0;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['blur'],
          timestamp: performance.now(), // EXEMPT
        });
      }
    }
    
    return state;
  },
};

// ─── Device Profile Processor ───────────────────────────────────────────────

/**
 * Applies device-specific caps (mobile performance)
 */
export const deviceProfileProcessor: MotionProcessor = {
  id: 'mp.constraint.device-profile',
  stage: 'constraint',
  priority: 90,
  
  supports(intent: AnimationIntent): boolean {
    return intent.constraints?.deviceClass !== undefined;
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    const deviceClass = state.intent.constraints?.deviceClass;
    
    if (deviceClass === 'mobile') {
      state.diagnostics.push('Mobile device profile applied');
      state.flags.constrained = true;
      
      // Cap duration for mobile
      if (state.values.durationMs && state.values.durationMs > 400) {
        state.values.durationMs = 400;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['durationMs'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      // Disable complex effects on mobile
      if (state.values.blur && state.values.blur > 0) {
        state.values.blur = 0;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['blur'],
          timestamp: performance.now(), // EXEMPT
        });
      }
      
      // Reduce glow on mobile
      if (state.values.glow && state.values.glow > 0.3) {
        state.values.glow = 0.3;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['glow'],
          timestamp: performance.now(), // EXEMPT
        });
      }
    }
    
    return state;
  },
};

// ─── Performance Cap Processor ──────────────────────────────────────────────

/**
 * Applies FPS caps and performance constraints
 */
export const performanceCapProcessor: MotionProcessor = {
  id: 'mp.constraint.performance-cap',
  stage: 'constraint',
  priority: 85,
  
  supports(intent: AnimationIntent): boolean {
    return intent.constraints?.maxFps !== undefined || intent.constraints?.maxDurationMs !== undefined;
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    const { maxFps, maxDurationMs } = state.intent.constraints ?? {};
    
    // Apply max duration constraint
    if (maxDurationMs && state.values.durationMs && state.values.durationMs > maxDurationMs) {
      state.diagnostics.push(`Duration capped at ${maxDurationMs}ms`);
      state.values.durationMs = maxDurationMs;
      state.flags.constrained = true;
      state.trace.push({
        processorId: this.id,
        stage: this.stage,
        changed: ['durationMs'],
        timestamp: performance.now(), // EXEMPT
      });
    }
    
    // Apply FPS cap (affects loop animations)
    if (maxFps && state.values.loop) {
      const frameTime = 1000 / maxFps;
      if (state.values.durationMs && state.values.durationMs < frameTime) {
        state.diagnostics.push(`Duration adjusted for ${maxFps} FPS cap`);
        state.values.durationMs = frameTime;
        state.flags.constrained = true;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['durationMs'],
          timestamp: performance.now(), // EXEMPT
        });
      }
    }
    
    return state;
  },
};

// ─── Bounds Constraint Processor ────────────────────────────────────────────

/**
 * Clamps transform values to safe bounds
 */
export const boundsConstraintProcessor: MotionProcessor = {
  id: 'mp.constraint.bounds',
  stage: 'constraint',
  priority: 80,
  
  supports(_intent: AnimationIntent): boolean {
    return true; // Always apply bounds
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    const changes: string[] = [];
    
    // Clamp scale to reasonable bounds
    if (state.values.scale !== undefined) {
      const originalScale = state.values.scale;
      state.values.scale = Math.max(0.1, Math.min(3, state.values.scale));
      if (originalScale !== state.values.scale) changes.push('scale');
    }
    
    // Clamp opacity to 0-1
    if (state.values.opacity !== undefined) {
      const originalOpacity = state.values.opacity;
      state.values.opacity = Math.max(0, Math.min(1, state.values.opacity));
      if (originalOpacity !== state.values.opacity) changes.push('opacity');
    }
    
    // Clamp glow to 0-1
    if (state.values.glow !== undefined) {
      const originalGlow = state.values.glow;
      state.values.glow = Math.max(0, Math.min(1, state.values.glow));
      if (originalGlow !== state.values.glow) changes.push('glow');
    }
    
    // Clamp rotation to reasonable bounds (prevent excessive spinning)
    if (state.values.rotateDeg !== undefined) {
      const originalRotate = state.values.rotateDeg;
      state.values.rotateDeg = ((state.values.rotateDeg % 360) + 360) % 360;
      if (originalRotate !== state.values.rotateDeg) changes.push('rotateDeg');
    }
    
    // Record changes
    if (changes.length > 0) {
      state.diagnostics.push('Bounds constraints applied');
      state.flags.constrained = true;
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

// ─── Processor Collection ───────────────────────────────────────────────────

export const constraintProcessors: MotionProcessor[] = [
  reducedMotionProcessor,
  deviceProfileProcessor,
  performanceCapProcessor,
  boundsConstraintProcessor,
];
