/**
 * Interaction Microprocessors
 * 
 * Handles input-driven motion: hover, click, focus, scroll.
 * These processors translate user interaction triggers into value adjustments.
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';

// ─── Hover Processor ────────────────────────────────────────────────────────

/**
 * Adjusts motion values based on hover interaction
 */
export const hoverProcessor: MotionProcessor = {
  id: 'mp.input.hover',
  stage: 'reactive',
  priority: 60,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'hover';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Default hover effects if not already set by presets
    if (state.values.scale === 1) {
      state.values.scale = 1.05;
    }
    
    if (state.values.glow === 0) {
      state.values.glow = 0.2;
    }
    
    state.diagnostics.push('Hover interaction applied');
    state.trace.push({
      processorId: this.id,
      stage: this.stage,
      changed: ['scale', 'glow'],
      timestamp: performance.now(), // EXEMPT
    });
    
    return state;
  },
};

// ─── Click Processor ────────────────────────────────────────────────────────

/**
 * Adjusts motion values based on click/press interaction
 */
export const clickProcessor: MotionProcessor = {
  id: 'mp.input.click',
  stage: 'reactive',
  priority: 70,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'click';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Default click effects (squash/press)
    state.values.scale = 0.95;
    state.values.durationMs = 150;
    state.values.easing = 'ease-out';
    
    state.diagnostics.push('Click interaction applied');
    state.trace.push({
      processorId: this.id,
      stage: this.stage,
      changed: ['scale', 'durationMs', 'easing'],
      timestamp: performance.now(), // EXEMPT
    });
    
    return state;
  },
};

// ─── Scroll Processor ───────────────────────────────────────────────────────

/**
 * Adjusts motion values based on scroll position
 */
export const scrollProcessor: MotionProcessor = {
  id: 'mp.input.scroll',
  stage: 'reactive',
  priority: 50,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'scroll';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    const { scrollY = 0 } = (state.intent.state ?? {}) as { scrollY?: number };
    
    // Example parallax/scroll effect
    state.values.translateY = scrollY * 0.1;
    
    state.diagnostics.push(`Scroll interaction applied: ${scrollY}px`);
    state.trace.push({
      processorId: this.id,
      stage: this.stage,
      changed: ['translateY'],
      timestamp: performance.now(), // EXEMPT
    });
    
    return state;
  },
};

// ─── Focus Processor ────────────────────────────────────────────────────────

/**
 * Adjusts motion values based on focus interaction
 */
export const focusProcessor: MotionProcessor = {
  id: 'mp.input.focus',
  stage: 'reactive',
  priority: 55,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'focus';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Highlight on focus
    state.values.glow = 0.3;
    state.values.scale = 1.02;
    
    state.diagnostics.push('Focus interaction applied');
    state.trace.push({
      processorId: this.id,
      stage: this.stage,
      changed: ['glow', 'scale'],
      timestamp: performance.now(), // EXEMPT
    });
    
    return state;
  },
};

// ─── Route Change Processor ──────────────────────────────────────────────────

/**
 * Adjusts motion values based on route transitions
 */
export const routeChangeProcessor: MotionProcessor = {
  id: 'mp.input.route',
  stage: 'sequence',
  priority: 80,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'route-change';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Default page transition logic
    state.values.durationMs = 500;
    state.values.opacity = 0;
    state.values.translateX = -10;
    
    state.diagnostics.push('Route change transition applied');
    let motionTimestamp = 0;
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: ['durationMs', 'opacity', 'translateX'],
          timestamp: motionTimestamp++,
        });
    
    return state;
  },
};

// ─── Processor Collection ───────────────────────────────────────────────────

export const interactionProcessors: MotionProcessor[] = [
  hoverProcessor,
  clickProcessor,
  scrollProcessor,
  focusProcessor,
  routeChangeProcessor,
];
