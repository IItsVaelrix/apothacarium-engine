/**
 * Animation Presets Registry
 * 
 * Central registry for reusable animation preset definitions.
 * Presets provide default motion values for common patterns.
 */

import { AnimationPreset } from '../contracts/animation.types.ts';

// ─── Preset Definitions ─────────────────────────────────────────────────────

/**
 * Orb idle animation - subtle breathing motion for central orb elements
 */
export const orbIdlePreset: AnimationPreset = {
  name: 'orb-idle',
  version: 'v1.0',
  description: 'Subtle breathing motion for central orb elements',
  defaults: {
    durationMs: 3000,
    scale: 1.02,
    opacity: 1,
    glow: 0.2,
    loop: true,
    easing: 'ease-in-out',
  },
  flags: {
    interruptible: true,
    gpuAccelerated: true,
  },
  triggers: ['idle', 'mount'],
  renderers: ['framer', 'css', 'phaser'],
  expectedProcessors: ['mp.transform.scale', 'mp.visual.glow', 'mp.constraint.reduced-motion'],
};

/**
 * Glyph breathe - subtle pulse for glyph elements
 */
export const glyphBreathePreset: AnimationPreset = {
  name: 'glyph-breathe',
  version: 'v1.0',
  description: 'Subtle pulse for glyph elements',
  defaults: {
    durationMs: 2500,
    scale: 1.03,
    opacity: 1,
    glow: 0.15,
    loop: true,
    easing: 'ease-in-out',
  },
  flags: {
    interruptible: true,
    gpuAccelerated: true,
  },
  triggers: ['idle', 'mount'],
  renderers: ['framer', 'css'],
};

/**
 * Ritual panel enter - dramatic panel entrance from side
 */
export const ritualPanelEnterPreset: AnimationPreset = {
  name: 'ritual-panel-enter',
  version: 'v1.0',
  description: 'Dramatic panel entrance from side',
  defaults: {
    durationMs: 450,
    translateX: -30,
    translateY: 0,
    opacity: 0,
    scale: 0.98,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  flags: {
    interruptible: false,
    gpuAccelerated: true,
  },
  triggers: ['mount', 'state-change'],
  renderers: ['framer', 'css'],
  expectedProcessors: ['mp.transform.translate', 'mp.visual.opacity', 'mp.constraint.reduced-motion'],
};

/**
 * Hover resonance - interactive hover feedback with glow
 */
export const hoverResonancePreset: AnimationPreset = {
  name: 'hover-resonance',
  version: 'v1.0',
  description: 'Interactive hover feedback with glow and lift',
  defaults: {
    durationMs: 200,
    translateY: -4,
    scale: 1.04,
    opacity: 1,
    glow: 0.4,
    easing: 'ease-out',
  },
  flags: {
    interruptible: true,
    gpuAccelerated: true,
  },
  triggers: ['hover'],
  renderers: ['framer', 'css'],
};

/**
 * Transmission pulse - audio-reactive pulse for listen page
 */
export const transmissionPulsePreset: AnimationPreset = {
  name: 'transmission-pulse',
  version: 'v1.0',
  description: 'Audio-reactive pulse for listen page',
  defaults: {
    durationMs: 800,
    scale: 1.05,
    glow: 0.5,
    opacity: 1,
    loop: true,
    easing: 'ease-in-out',
  },
  flags: {
    interruptible: true,
    gpuAccelerated: true,
  },
  triggers: ['audio', 'idle'],
  renderers: ['framer', 'css', 'phaser'],
};

/**
 * Truesight highlight - highlight effect for truesight mode
 */
export const truesightHighlightPreset: AnimationPreset = {
  name: 'truesight-highlight',
  version: 'v1.0',
  description: 'Highlight effect for truesight mode',
  defaults: {
    durationMs: 300,
    glow: 0.6,
    opacity: 1,
    scale: 1.02,
    easing: 'ease-out',
  },
  flags: {
    interruptible: true,
    gpuAccelerated: true,
  },
  triggers: ['state-change', 'hover'],
  renderers: ['framer', 'css'],
};

/**
 * Station select - view transition for station selection
 */
export const stationSelectPreset: AnimationPreset = {
  name: 'station-select',
  version: 'v1.0',
  description: 'View transition for station selection',
  defaults: {
    durationMs: 600,
    scale: 1.1,
    opacity: 0,
    rotateDeg: 5,
    easing: 'cubic-bezier(0.43, 0.13, 0.23, 0.96)',
  },
  flags: {
    interruptible: false,
    gpuAccelerated: true,
  },
  triggers: ['state-change', 'click'],
  renderers: ['framer', 'css'],
};

/**
 * Modal summon - dramatic modal entrance
 */
export const modalSummonPreset: AnimationPreset = {
  name: 'modal-summon',
  version: 'v1.0',
  description: 'Dramatic modal entrance',
  defaults: {
    durationMs: 500,
    scale: 0.9,
    opacity: 0,
    translateY: 20,
    glow: 0.3,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  flags: {
    interruptible: false,
    gpuAccelerated: true,
  },
  triggers: ['mount', 'state-change'],
  renderers: ['framer', 'css'],
};

/**
 * Console awaken - subtle activation for console elements
 */
export const consoleAwakenPreset: AnimationPreset = {
  name: 'console-awaken',
  version: 'v1.0',
  description: 'Subtle activation for console elements',
  defaults: {
    durationMs: 400,
    opacity: 0,
    glow: 0.4,
    easing: 'ease-out',
  },
  flags: {
    interruptible: true,
    gpuAccelerated: true,
  },
  triggers: ['mount', 'state-change'],
  renderers: ['framer', 'css'],
};

// ─── Preset Registry ────────────────────────────────────────────────────────

const presetRegistry: Map<string, AnimationPreset> = new Map([
  ['orb-idle', orbIdlePreset],
  ['glyph-breathe', glyphBreathePreset],
  ['ritual-panel-enter', ritualPanelEnterPreset],
  ['hover-resonance', hoverResonancePreset],
  ['transmission-pulse', transmissionPulsePreset],
  ['truesight-highlight', truesightHighlightPreset],
  ['station-select', stationSelectPreset],
  ['modal-summon', modalSummonPreset],
  ['console-awaken', consoleAwakenPreset],
]);

/**
 * Get a preset by name
 */
export function getAnimationPreset(name: string): AnimationPreset | undefined {
  return presetRegistry.get(name);
}

/**
 * Get all registered presets
 */
export function getAllPresets(): AnimationPreset[] {
  return Array.from(presetRegistry.values());
}

/**
 * Register a new preset
 */
export function registerAnimationPreset(preset: AnimationPreset): void {
  presetRegistry.set(preset.name, preset);
}

/**
 * Validate and get preset with error handling
 */
export function getValidatedPreset(name: string): {
  preset: AnimationPreset | undefined;
  error?: string;
} {
  const preset = presetRegistry.get(name);
  
  if (!preset) {
    return {
      preset: undefined,
      error: `Preset "${name}" not found`,
    };
  }
  
  return { preset };
}
