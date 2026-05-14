/**
 * Animation AMP — Zod Schemas
 * 
 * Runtime validation schemas for Animation AMP contracts.
 * Provides type-safe validation with detailed error messages for QA.
 */

import { z } from 'zod';

// ─── Trigger & Renderer Enums ───────────────────────────────────────────────

export const AnimationTriggerSchema = z.enum([
  'mount',
  'unmount',
  'hover',
  'focus',
  'click',
  'scroll',
  'route-change',
  'audio',
  'state-change',
  'idle',
  'symmetry',
  'bytecode',
]);

export const AnimationRendererSchema = z.enum(['framer', 'css', 'phaser', 'canvas', 'overlay']);

export const ProcessorStageSchema = z.enum([
  'normalize',
  'timing',
  'transform',
  'visual',
  'sequence',
  'reactive',
  'constraint',
  'symmetry',
  'finalize',
]);

// ─── Animation Intent Schema ────────────────────────────────────────────────

export const AnimationIntentSchema = z.object({
  version: z.string().regex(/^v\d+\.\d+$/, 'Version must be semver-like (v1.0)'),
  targetId: z.string().min(1, 'Target ID is required'),
  targetType: AnimationRendererSchema.optional(),
  preset: z.string().optional(),
  trigger: AnimationTriggerSchema,
  state: z.record(z.string(), z.unknown()).optional(),
  constraints: z.object({
    reducedMotion: z.boolean().optional(),
    deviceClass: z.enum(['mobile', 'desktop', 'tablet']).optional(),
    maxDurationMs: z.number().positive().optional(),
    disableLoop: z.boolean().optional(),
    maxFps: z.number().int().positive().max(144).optional(),
    gpuAccelerate: z.boolean().optional(),
    layoutConstraint: z.unknown().optional(),
  }).optional(),
  requestedProcessors: z.array(z.string()).optional(),
  metadata: z.object({
    source: z.string().optional(),
    feature: z.string().optional(),
    scene: z.string().optional(),
    correlationId: z.string().uuid().optional(),
  }).optional(),
  symmetry: z.object({
    type: z.enum(['horizontal', 'vertical', 'radial', 'none']).optional(),
    confidence: z.number().min(0).max(1).optional(),
    axis: z.number().optional(),
    mirror: z.boolean().optional(),
  }).optional(),
  bytecode: z.string().optional(),
});

// ─── Motion Values Schema ───────────────────────────────────────────────────

export const MotionValuesSchema = z.object({
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  durationMs: z.number().positive().optional(),
  delayMs: z.number().nonnegative().optional(),
  easing: z.string().optional(),
  translateX: z.number().optional(),
  translateY: z.number().optional(),
  scale: z.number().positive().optional(),
  scaleX: z.number().positive().optional(),
  scaleY: z.number().positive().optional(),
  rotateDeg: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  glow: z.number().min(0).max(1).optional(),
  blur: z.number().nonnegative().optional(),
  loop: z.boolean().optional(),
  phaseOffset: z.number().optional(),
  staggerIndex: z.number().int().nonnegative().optional(),
  originX: z.number().optional(),
  originY: z.number().optional(),
});

// ─── Motion Flags Schema ────────────────────────────────────────────────────

export const MotionFlagsSchema = z.object({
  interruptible: z.boolean().optional(),
  reduced: z.boolean().optional(),
  constrained: z.boolean().optional(),
  gpuAccelerated: z.boolean().optional(),
  symmetryApplied: z.boolean().optional(),
});

// ─── Processor Trace Schema ─────────────────────────────────────────────────

export const ProcessorTraceSchema = z.object({
  processorId: z.string(),
  stage: ProcessorStageSchema,
  changed: z.array(z.string()),
  timestamp: z.number().nonnegative(),
});

// ─── Motion Working State Schema ────────────────────────────────────────────

export const MotionWorkingStateSchema = z.object({
  intent: AnimationIntentSchema,
  values: MotionValuesSchema,
  flags: MotionFlagsSchema,
  diagnostics: z.array(z.string()),
  trace: z.array(ProcessorTraceSchema),
});

// ─── Resolved Motion Output Schema ──────────────────────────────────────────

export const FramerTransitionSchema = z.object({
  duration: z.number().positive(),
  delay: z.number().nonnegative().optional(),
  ease: z.union([
    z.string(),
    z.tuple([z.number(), z.number(), z.number(), z.number()]), // cubic-bezier
  ]).optional(),
  repeat: z.union([z.number(), z.literal(Infinity)]).optional(),
  repeatType: z.enum(['loop', 'reverse', 'mirror']).optional(),
});

export const ResolvedMotionOutputSchema = z.object({
  version: z.string(),
  targetId: z.string(),
  success: z.boolean(),
  renderer: AnimationRendererSchema,
  values: z.object({
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    durationMs: z.number().positive(),
    delayMs: z.number().nonnegative(),
    easing: z.string(),
    translateX: z.number(),
    translateY: z.number(),
    scale: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
    rotateDeg: z.number(),
    opacity: z.number().min(0).max(1),
    glow: z.number().min(0).max(1).optional(),
    blur: z.number().nonnegative().optional(),
    loop: z.boolean(),
    phaseOffset: z.number().optional(),
    originX: z.number(),
    originY: z.number(),
  }),
  cssVariables: z.record(z.string(), z.string()).optional(),
  framerTransition: FramerTransitionSchema.optional(),
  phaserPayload: z.object({
    targetType: z.enum(['tween', 'timeline']),
    config: z.record(z.string(), z.unknown()),
  }).optional(),
  pixelBrainPayload: z.object({
    formula: z.string(),
    coordinates: z.array(z.object({
      x: z.number(),
      y: z.number(),
      space: z.enum(['pixel', 'cell', 'lattice']),
    })),
  }).optional(),
  bytecode: z.array(z.string()).optional(),
  diagnostics: z.array(z.string()),
  trace: z.array(ProcessorTraceSchema),
  performance: z.object({
    processingTimeMs: z.number().nonnegative(),
    processorCount: z.number().int().nonnegative(),
    reducedMotion: z.boolean(),
    gpuAccelerated: z.boolean(),
  }).optional(),
});

// ─── Animation Preset Schema ────────────────────────────────────────────────

export const AnimationPresetSchema = z.object({
  name: z.string(),
  version: z.string(),
  defaults: MotionValuesSchema.partial(),
  flags: MotionFlagsSchema.partial().optional(),
  triggers: z.array(AnimationTriggerSchema).optional(),
  renderers: z.array(AnimationRendererSchema).optional(),
  expectedProcessors: z.array(z.string()).optional(),
  description: z.string().optional(),
});

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate an animation intent at runtime
 */
export function validateAnimationIntent(data: unknown): any {
  return AnimationIntentSchema.safeParse(data);
}

/**
 * Validate a resolved motion output at runtime
 */
export function validateMotionOutput(data: unknown): any {
  return ResolvedMotionOutputSchema.safeParse(data);
}

/**
 * Type guard for validated animation intent
 */
export function isAnimationIntent(data: unknown): data is z.infer<typeof AnimationIntentSchema> {
  return AnimationIntentSchema.safeParse(data).success;
}

/**
 * Type guard for validated motion output
 */
export function isMotionOutput(data: unknown): data is z.infer<typeof ResolvedMotionOutputSchema> {
  return ResolvedMotionOutputSchema.safeParse(data).success;
}

// ─── Preset Validators ──────────────────────────────────────────────────────

/**
 * Validate animation preset at registration time
 */
export function validateAnimationPreset(data: unknown): any {
  return AnimationPresetSchema.safeParse(data);
}

// ─── Error Messages ─────────────────────────────────────────────────────────

export const ANIMATION_ERROR_MESSAGES = {
  INVALID_VERSION: 'Animation intent version must be semver-like (e.g., v1.0)',
  MISSING_TARGET: 'Target ID is required for animation',
  INVALID_TRIGGER: 'Invalid animation trigger type',
  INVALID_RENDERER: 'Invalid renderer target',
  INVALID_CONSTRAINTS: 'Invalid constraint configuration',
  INVALID_VALUES: 'Invalid motion values',
  PRESET_NOT_FOUND: 'Animation preset not found',
  BYTECODE_INVALID: 'Invalid motion bytecode format',
} as const;
