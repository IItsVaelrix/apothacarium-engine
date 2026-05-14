/**
 * Animation AMP — Motion Fusion
 * 
 * Fuses the final working state into a resolved motion output contract.
 * Generates renderer-specific configurations (CSS, Framer Motion).
 */

import { MotionWorkingState, ResolvedMotionOutput } from '../contracts/animation.types.ts';
import { validateMotionOutput } from '../contracts/animation.schemas.ts';
import { encodeMotionBytecode } from '../bytecode/encodeMotionBytecode.ts';

/**
 * Fuse working state into resolved motion output
 */
export function fuseMotionOutput(
  workingState: MotionWorkingState,
  bytecodeEnabled: boolean = true
): ResolvedMotionOutput {
  const { intent, values, flags, diagnostics, trace } = workingState;
  
  // Fill in defaults for any missing values
  const outputValues: any = {
    width: values.width,
    height: values.height,
    durationMs: values.durationMs ?? 300,
    delayMs: values.delayMs ?? 0,
    easing: values.easing ?? 'ease-out',
    translateX: values.translateX ?? 0,
    translateY: values.translateY ?? 0,
    scale: values.scale ?? 1,
    scaleX: values.scaleX ?? values.scale ?? 1,
    scaleY: values.scaleY ?? values.scale ?? 1,
    rotateDeg: values.rotateDeg ?? 0,
    opacity: values.opacity ?? 1,
    glow: values.glow ?? 0,
    blur: values.blur ?? 0,
    loop: values.loop ?? false,
    phaseOffset: values.phaseOffset ?? 0,
    originX: values.originX ?? 0.5,
    originY: values.originY ?? 0.5,
  };
  
  // Determine renderer
  const renderer = intent.targetType ?? 'framer';
  
  // Build output
  const output: ResolvedMotionOutput = {
    version: intent.version,
    targetId: intent.targetId,
    success: true,
    renderer,
    values: outputValues,
    diagnostics: [...diagnostics],
    trace: [...trace],
    performance: {
      processingTimeMs: trace.at(-1)?.timestamp ?? 0,
      processorCount: trace.length,
      reducedMotion: flags.reduced ?? false,
      gpuAccelerated: flags.gpuAccelerated ?? false,
    },
  };
  
  // Generate CSS variables for CSS adapter
  output.cssVariables = {
    '--anim-duration': `${outputValues.durationMs}ms`,
    '--anim-delay': `${outputValues.delayMs}ms`,
    '--anim-easing': outputValues.easing,
    '--anim-translate-x': `${outputValues.translateX}px`,
    '--anim-translate-y': `${outputValues.translateY}px`,
    '--anim-scale': `${outputValues.scale}`,
    '--anim-rotate': `${outputValues.rotateDeg}deg`,
    '--anim-opacity': `${outputValues.opacity}`,
    '--anim-glow': `${outputValues.glow ?? 0}`,
    '--anim-origin-x': `${outputValues.originX * 100}%`,
    '--anim-origin-y': `${outputValues.originY * 100}%`,
    '--anim-will-change': output.performance?.gpuAccelerated ? 'transform, opacity' : 'auto',
  };
  
  // Generate Framer Motion transition config
  output.framerTransition = {
    duration: outputValues.durationMs / 1000,
    delay: outputValues.delayMs / 1000,
    ease: parseEasing(outputValues.easing),
    repeat: outputValues.loop ? Infinity : 0,
    repeatType: 'loop' as const,
  };

  // Generate Phaser payload
  output.phaserPayload = {
    targetType: 'tween',
    config: {
      duration: outputValues.durationMs,
      delay: outputValues.delayMs,
      repeat: outputValues.loop ? -1 : 0,
      ease: phaserEasing(outputValues.easing),
      x: outputValues.translateX,
      y: outputValues.translateY,
      scale: outputValues.scale,
      alpha: outputValues.opacity,
      rotation: outputValues.rotateDeg * (Math.PI / 180),
    },
  };

  // Generate PixelBrain payload
  output.pixelBrainPayload = {
    formula: `scale(t) = lerp(${outputValues.scale}, ${outputValues.scale}, 1); opacity(t) = ${outputValues.opacity}`,
    coordinates: [{ x: outputValues.originX, y: outputValues.originY, space: 'pixel' }],
  };
  
  // Generate bytecode if enabled
  if (bytecodeEnabled) {
    output.bytecode = encodeMotionBytecode(output);
  }
  
  // Validate output schema
  const validation = validateMotionOutput(output);
  if (!validation.success) {
    output.success = false;
    const errorMsg = `Output validation failed: ${validation.error.message}`;
    output.diagnostics.push(errorMsg);
    if (import.meta.env?.DEV || process.env.NODE_ENV === 'test') {
      console.error('[AnimationAMP] Validation Error:', JSON.stringify(validation.error.format(), null, 2));
    }
  }
  
  return output;
}

/**
 * Parse easing string into Framer Motion format
 */
function parseEasing(easing: string): string | number[] {
  // Named easings
  const namedEasings: Record<string, string | number[]> = {
    'linear': 'linear',
    'ease': 'easeInOut',
    'ease-in': 'easeIn',
    'ease-out': 'easeOut',
    'ease-in-out': 'easeInOut',
    'spring': [0.25, 0.1, 0.25, 1.0],
    'bounce': [0.68, -0.55, 0.265, 1.55],
  };
  
  if (namedEasings[easing]) {
    return namedEasings[easing];
  }
  
  // Cubic bezier: cubic-bezier(0.4, 0, 0.2, 1)
  const cubicMatch = easing.match(/cubic-bezier\(([^)]+)\)/);
  if (cubicMatch) {
    const points = cubicMatch[1].split(',').map(s => parseFloat(s.trim()));
    if (points.length === 4 && points.every(p => !isNaN(p))) {
      return points;
    }
  }
  
  return 'easeOut';
}

/**
 * Parse easing string into Phaser format
 */
function phaserEasing(easing: string): string {
  const namedEasings: Record<string, string> = {
    'linear': 'Linear',
    'ease': 'Quad.easeInOut',
    'ease-in': 'Quad.easeIn',
    'ease-out': 'Quad.easeOut',
    'ease-in-out': 'Quad.easeInOut',
    'spring': 'Elastic.easeOut',
    'bounce': 'Bounce.easeOut',
  };

  return namedEasings[easing] || 'Power2';
}
