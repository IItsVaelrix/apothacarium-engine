/**
 * PIXEL MICROPROCESSOR: Animation Compiler
 * 
 * Bridges the Bytecode Blueprint Bridge and Gear-Glide AMP with the
 * unified Microprocessor pipeline.
 * 
 * LAW 5 COMPLIANCE: This processor only handles COMPILATION and CALCULATION.
 * Execution (DOM/Phaser effects) is handled by the render layer.
 */

import { runAnimationAmp } from '../../animation/amp/runAnimationAmp.ts';
import { parseBlueprintBlock } from '../../animation/bytecode/blueprintParser.ts';
import { getRotationAtTime } from '../../pixelbrain/gear-glide-amp.js';

/**
 * Compile an animation blueprint into target-specific payloads.
 * 
 * @param {Object} payload - { source (string or object), targets (array) }
 * @returns {Promise<Object>} The compiled animation output
 */
export async function compileAnimation({ source, targets = ['phaser', 'bytecode'] }) {
  if (!source) {
    throw new Error('Animation source is required for compilation');
  }

  let intent;

  if (typeof source === 'string') {
    // Parse blueprint DSL into intent-compatible IR
    const parseResult = parseBlueprintBlock(source);
    if (!parseResult.success || !parseResult.blueprint) {
      throw new Error(`Animation parsing failed: ${parseResult.errors.map(e => e.message).join(', ')}`);
    }
    
    const VALID_RENDERERS = ['framer', 'css', 'phaser', 'canvas', 'overlay'];
    const primaryTarget = targets[0];
    const targetType = VALID_RENDERERS.includes(primaryTarget) ? primaryTarget : 'framer';

    const blueprint = parseResult.blueprint;
    
    // Flatten transforms for intent state
    const flattenedState = {
      easing: blueprint.easing.value,
    };
    
    if (blueprint.transforms) {
      if (blueprint.transforms.scale) flattenedState.scale = blueprint.transforms.scale.peak ?? blueprint.transforms.scale.base ?? 1;
      if (blueprint.transforms.translateX) flattenedState.translateX = blueprint.transforms.translateX.base ?? 0;
      if (blueprint.transforms.translateY) flattenedState.translateY = blueprint.transforms.translateY.base ?? 0;
      if (blueprint.transforms.rotate) flattenedState.rotateDeg = blueprint.transforms.rotate.base ?? 0;
      if (blueprint.transforms.opacity) flattenedState.opacity = blueprint.transforms.opacity.base ?? 1;
      if (blueprint.transforms.glow) flattenedState.glow = blueprint.transforms.glow.base ?? 0;
      if (blueprint.transforms.blur) flattenedState.blur = blueprint.transforms.blur.base ?? 0;
    }

    intent = {
      version: 'v1.0',
      targetId: blueprint.target.value,
      targetType,
      trigger: 'mount',
      durationMs: blueprint.durationMs,
      loop: blueprint.loop === 'infinite' ? true : blueprint.loop > 1,
      state: flattenedState
    };
  } else {
    intent = source;
  }

  const result = await runAnimationAmp(intent);

  if (!result.success) {
    throw new Error(`Animation resolution failed: ${result.diagnostics.join(', ')}`);
  }

  // Map ResolvedMotionOutput to the expected bridge-compatible format for backward compatibility
  return {
    blueprint: intent,
    targets: {
      css: result.cssVariables,
      phaser: result.phaserPayload,
      pixelbrain: result.pixelBrainPayload,
      bytecode: { instructions: result.bytecode || [] },
    }
  };
}

/**
 * Calculate BPM-synced rotation for a specific point in time.
 * 
 * @param {Object} payload - { absoluteTimeMs, bpm, degreesPerBeat, config }
 * @returns {Promise<number>} Rotation in radians
 */
export async function calculateRotation({ absoluteTimeMs, bpm, degreesPerBeat = 90, config = {} }) {
  const time = absoluteTimeMs ?? performance.now(); // EXEMPT
  const safeBpm = bpm ?? 90;
  
  return getRotationAtTime(time, safeBpm, degreesPerBeat, config);
}
