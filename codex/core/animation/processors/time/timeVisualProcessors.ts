/**
 * Time & Visual Microprocessors
 * 
 * Time: duration, delay, easing curves
 * Visual: opacity, glow, fade effects
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';

// ─── Time Curve Processor ───────────────────────────────────────────────────

export const timeCurveProcessor: MotionProcessor = {
  id: 'mp.time.curve',
  stage: 'timing',
  priority: 50,
  
  supports(_intent: AnimationIntent): boolean {
    return true; // Always apply timing
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based timing
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'quick-fade':
          state.values.durationMs = 150;
          state.values.easing = 'ease-out';
          break;
        case 'smooth-enter':
          state.values.durationMs = 400;
          state.values.easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
          break;
        case 'bounce-enter':
          state.values.durationMs = 600;
          state.values.easing = 'cubic-bezier(0.68, -0.55, 0.265, 1.55)';
          break;
        case 'slow-glide':
          state.values.durationMs = 800;
          state.values.easing = 'ease-in-out';
          break;
      }
    }
    
    // Apply trigger-based timing adjustments
    switch (state.intent.trigger) {
      case 'mount':
        // Mount animations can be slightly slower
        if (!state.values.durationMs || state.values.durationMs < 200) {
          state.values.durationMs = 300;
        }
        break;
      case 'hover':
        // Hover should be quick and responsive
        if (!state.values.durationMs || state.values.durationMs > 250) {
          state.values.durationMs = 200;
        }
        state.values.easing = 'ease-out';
        break;
      case 'click':
        // Click feedback should be instant
        if (!state.values.durationMs || state.values.durationMs > 150) {
          state.values.durationMs = 100;
        }
        break;
    }
    
    return state;
  },
};

// ─── Opacity Processor ──────────────────────────────────────────────────────

export const opacityProcessor: MotionProcessor = {
  id: 'mp.visual.opacity',
  stage: 'visual',
  priority: 50,
  
  supports(intent: AnimationIntent): boolean {
    return intent.trigger === 'mount' ||
           intent.trigger === 'unmount' ||
           (intent.preset?.includes('fade') ?? false) ||
           (intent.preset?.includes('enter') ?? false) ||
           (intent.preset?.includes('exit') ?? false);
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based opacity
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'fade-in':
        case 'panel-enter-left':
        case 'panel-enter-right':
        case 'panel-enter-up':
        case 'panel-enter-down':
        case 'rotate-enter':
          state.values.opacity = 0;
          break;
        case 'fade-out':
          state.values.opacity = 0;
          state.values.durationMs = 200;
          break;
        case 'hover-highlight':
          if (state.intent.trigger === 'hover') {
            state.values.opacity = 0.9;
          }
          break;
      }
    }
    
    return state;
  },
};

// ─── Glow Processor ─────────────────────────────────────────────────────────

export const glowProcessor: MotionProcessor = {
  id: 'mp.visual.glow',
  stage: 'visual',
  priority: 45,
  
  supports(intent: AnimationIntent): boolean {
    return (intent.preset?.includes('glow') ?? false) ||
           (intent.preset?.includes('highlight') ?? false) ||
           (intent.preset?.includes('resonance') ?? false) ||
           intent.trigger === 'hover';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    const state = { ...input };
    
    // Apply preset-based glow
    if (state.intent.preset) {
      switch (state.intent.preset) {
        case 'hover-resonance':
          if (state.intent.trigger === 'hover') {
            state.values.glow = 0.4;
          }
          break;
        case 'glyph-glow':
          state.values.glow = 0.3;
          state.values.loop = true;
          break;
        case 'truesight-highlight':
          state.values.glow = 0.5;
          state.values.durationMs = 400;
          break;
        case 'orb-awaken':
          state.values.glow = 0.6;
          state.values.durationMs = 600;
          break;
      }
    }
    
    return state;
  },
};

// ─── Processor Collection ───────────────────────────────────────────────────

export const timeVisualProcessors: MotionProcessor[] = [
  timeCurveProcessor,
  opacityProcessor,
  glowProcessor,
];
