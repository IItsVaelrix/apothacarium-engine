/**
 * Transform Microprocessors
 * 
 * Apply spatial transforms: translate, scale, rotate, anchor.
 * These processors run in the transform stage.
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';

// ─── Translate Processor ────────────────────────────────────────────────────

export const translateProcessor: MotionProcessor = {
  id: 'mp.transform.translate',
  stage: 'transform',
  priority: 50,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'hover' || 
           intent.trigger === 'click' || 
           intent.trigger === 'mount' ||
           (intent.preset?.includes('slide') ?? false) ||
           (intent.preset?.includes('enter') ?? false);
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based translations
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'panel-enter-left':
          state.values.translateX = -20;
          state.values.opacity = 0;
          break;
        case 'panel-enter-right':
          state.values.translateX = 20;
          state.values.opacity = 0;
          break;
        case 'panel-enter-up':
          state.values.translateY = 20;
          state.values.opacity = 0;
          break;
        case 'panel-enter-down':
          state.values.translateY = -20;
          state.values.opacity = 0;
          break;
        case 'hover-lift':
          if (state.intent.trigger === 'hover') {
            state.values.translateY = -4;
          }
          break;
      }
    }
    
    return state;
  },
};

// ─── Scale Processor ────────────────────────────────────────────────────────

export const scaleProcessor: MotionProcessor = {
  id: 'mp.transform.scale',
  stage: 'transform',
  priority: 50,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'hover' || 
           intent.trigger === 'click' ||
           (intent.preset?.includes('scale') ?? false) ||
           (intent.preset?.includes('pulse') ?? false) ||
           (intent.preset?.includes('breathe') ?? false);
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based scales
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'hover-resonance':
          if (state.intent.trigger === 'hover') {
            state.values.scale = 1.04;
          }
          break;
        case 'glyph-breathe':
          state.values.scale = 1.03;
          state.values.loop = true;
          break;
        case 'orb-idle':
          state.values.scale = 1.02;
          state.values.loop = true;
          break;
        case 'click-press':
          if (state.intent.trigger === 'click') {
            state.values.scale = 0.96;
          }
          break;
      }
    }
    
    return state;
  },
};

// ─── Rotate Processor ───────────────────────────────────────────────────────

export const rotateProcessor: MotionProcessor = {
  id: 'mp.transform.rotate',
  stage: 'transform',
  priority: 45,
  
  supports(intent: AnimationIntent): boolean {
    return (intent.preset?.includes('rotate') ?? false) ||
           (intent.preset?.includes('spin') ?? false) ||
           intent.symmetry?.type === 'radial';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based rotations
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'rotate-enter':
          state.values.rotateDeg = -5;
          state.values.opacity = 0;
          break;
        case 'spin-slow':
          state.values.rotateDeg = 360;
          state.values.durationMs = 8000;
          state.values.loop = true;
          break;
      }
    }
    
    // Apply symmetry-based rotation for radial symmetry
    if (state.intent.symmetry?.type === 'radial' && state.intent.symmetry.mirror) {
      state.values.rotateDeg = 360 / (state.intent.symmetry.confidence ?? 4);
      state.values.loop = true;
      state.flags.symmetryApplied = true;
    }
    
    return state;
  },
};

// ─── Anchor Processor ───────────────────────────────────────────────────────

export const anchorProcessor: MotionProcessor = {
  id: 'mp.transform.anchor',
  stage: 'transform',
  priority: 40,
  
  supports(intent: AnimationIntent): boolean {
    return (intent.preset?.includes('pivot') ?? false) ||
           (intent.preset?.includes('swing') ?? false) ||
           (intent.preset?.includes('hinge') ?? false);
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based anchor points
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'pivot-top':
          state.values.originX = 0.5;
          state.values.originY = 0;
          break;
        case 'pivot-left':
          state.values.originX = 0;
          state.values.originY = 0.5;
          break;
        case 'pivot-right':
          state.values.originX = 1;
          state.values.originY = 0.5;
          break;
        case 'pivot-bottom':
          state.values.originX = 0.5;
          state.values.originY = 1;
          break;
        case 'hinge-top-left':
          state.values.originX = 0;
          state.values.originY = 0;
          break;
      }
    }
    
    return state;
  },
};

// ─── Processor Collection ───────────────────────────────────────────────────

export const transformProcessors: MotionProcessor[] = [
  translateProcessor,
  scaleProcessor,
  rotateProcessor,
  anchorProcessor,
];
