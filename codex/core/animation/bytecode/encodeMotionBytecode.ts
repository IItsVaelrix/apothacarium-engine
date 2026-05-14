/**
 * Motion Bytecode Encoder
 * 
 * Encodes resolved motion output into bytecode format for:
 * - Deterministic replay
 * - Debug snapshots
 * - QA assertions
 * - Cross-system persistence
 * 
 * Format: ANIM_START ... ANIM_END with key-value instructions
 */

import { ResolvedMotionOutput } from '../contracts/animation.types.ts';

// ─── Bytecode Instruction Types ─────────────────────────────────────────────

export type MotionBytecodeInstruction =
  | { op: 'ANIM_START'; target: string }
  | { op: 'ANIM_END' }
  | { op: 'PRESET'; name: string }
  | { op: 'DURATION'; value: number }
  | { op: 'DELAY'; value: number }
  | { op: 'EASE'; value: string }
  | { op: 'TRANSLATE_X'; value: number }
  | { op: 'TRANSLATE_Y'; value: number }
  | { op: 'SCALE'; value: number }
  | { op: 'SCALE_X'; value: number }
  | { op: 'SCALE_Y'; value: number }
  | { op: 'ROTATE'; value: number }
  | { op: 'OPACITY'; value: number }
  | { op: 'GLOW'; value: number }
  | { op: 'BLUR'; value: number }
  | { op: 'LOOP'; value: 0 | 1 }
  | { op: 'PHASE'; value: number }
  | { op: 'ORIGIN_X'; value: number }
  | { op: 'ORIGIN_Y'; value: number }
  | { op: 'RENDERER'; value: string }
  | { op: 'GPU'; value: 0 | 1 }
  | { op: 'REDUCED'; value: 0 | 1 }
  | { op: 'TRACE'; processorId: string; stage: string };

// ─── Encoder ────────────────────────────────────────────────────────────────

/**
 * Encode resolved motion output to bytecode instructions
 */
export function encodeMotionBytecode(output: ResolvedMotionOutput): string[] {
  const instructions: MotionBytecodeInstruction[] = [];
  
  // Start
  instructions.push({ op: 'ANIM_START', target: output.targetId });
  
  // Renderer
  instructions.push({ op: 'RENDERER', value: output.renderer });
  
  // Timing
  instructions.push({ op: 'DURATION', value: output.values.durationMs });
  if (output.values.delayMs > 0) {
    instructions.push({ op: 'DELAY', value: output.values.delayMs });
  }
  instructions.push({ op: 'EASE', value: output.values.easing });
  
  // Transforms
  if (output.values.translateX !== 0) {
    instructions.push({ op: 'TRANSLATE_X', value: output.values.translateX });
  }
  if (output.values.translateY !== 0) {
    instructions.push({ op: 'TRANSLATE_Y', value: output.values.translateY });
  }
  if (output.values.scale !== 1) {
    instructions.push({ op: 'SCALE', value: output.values.scale });
  }
  if (output.values.scaleX !== 1 || output.values.scaleY !== 1) {
    if (output.values.scaleX !== output.values.scaleY) {
      instructions.push({ op: 'SCALE_X', value: output.values.scaleX });
      instructions.push({ op: 'SCALE_Y', value: output.values.scaleY });
    }
  }
  if (output.values.rotateDeg !== 0) {
    instructions.push({ op: 'ROTATE', value: output.values.rotateDeg });
  }
  
  // Visual
  if (output.values.opacity !== 1) {
    instructions.push({ op: 'OPACITY', value: output.values.opacity });
  }
  if (output.values.glow && output.values.glow > 0) {
    instructions.push({ op: 'GLOW', value: output.values.glow });
  }
  if (output.values.blur && output.values.blur > 0) {
    instructions.push({ op: 'BLUR', value: output.values.blur });
  }
  
  // Origin
  if (output.values.originX !== 0.5 || output.values.originY !== 0.5) {
    instructions.push({ op: 'ORIGIN_X', value: output.values.originX });
    instructions.push({ op: 'ORIGIN_Y', value: output.values.originY });
  }
  
  // Behavior
  instructions.push({ op: 'LOOP', value: output.values.loop ? 1 : 0 });
  if (output.values.phaseOffset && output.values.phaseOffset !== 0) {
    instructions.push({ op: 'PHASE', value: output.values.phaseOffset });
  }
  
  // Constraints
  instructions.push({
    op: 'GPU',
    value: (output.performance?.gpuAccelerated ?? false) ? 1 : 0,
  });
  instructions.push({
    op: 'REDUCED',
    value: (output.performance?.reducedMotion ?? false) ? 1 : 0,
  });
  
  // Trace (debug only)
  for (const entry of output.trace) {
    instructions.push({
      op: 'TRACE',
      processorId: entry.processorId,
      stage: entry.stage,
    });
  }
  
  // End
  instructions.push({ op: 'ANIM_END' });
  
  // Format as strings
  return instructions.map(formatInstruction);
}

/**
 * Format a single instruction to string
 */
function formatInstruction(instruction: MotionBytecodeInstruction): string {
  switch (instruction.op) {
    case 'ANIM_START':
      return `ANIM_START TARGET ${instruction.target}`;
    case 'ANIM_END':
      return 'ANIM_END';
    case 'PRESET':
      return `PRESET ${instruction.name}`;
    case 'DURATION':
      return `DURATION ${instruction.value}`;
    case 'DELAY':
      return `DELAY ${instruction.value}`;
    case 'EASE':
      return `EASE ${instruction.value}`;
    case 'TRANSLATE_X':
      return `TRANSLATE_X ${instruction.value}`;
    case 'TRANSLATE_Y':
      return `TRANSLATE_Y ${instruction.value}`;
    case 'SCALE':
      return `SCALE ${instruction.value}`;
    case 'SCALE_X':
      return `SCALE_X ${instruction.value}`;
    case 'SCALE_Y':
      return `SCALE_Y ${instruction.value}`;
    case 'ROTATE':
      return `ROTATE ${instruction.value}`;
    case 'OPACITY':
      return `OPACITY ${instruction.value}`;
    case 'GLOW':
      return `GLOW ${instruction.value}`;
    case 'BLUR':
      return `BLUR ${instruction.value}`;
    case 'LOOP':
      return `LOOP ${instruction.value}`;
    case 'PHASE':
      return `PHASE ${instruction.value}`;
    case 'ORIGIN_X':
      return `ORIGIN_X ${instruction.value}`;
    case 'ORIGIN_Y':
      return `ORIGIN_Y ${instruction.value}`;
    case 'RENDERER':
      return `RENDERER ${instruction.value}`;
    case 'GPU':
      return `GPU ${instruction.value}`;
    case 'REDUCED':
      return `REDUCED ${instruction.value}`;
    case 'TRACE':
      return `TRACE ${instruction.processorId} ${instruction.stage}`;
    default:
      return `UNKNOWN ${JSON.stringify(instruction)}`;
  }
}

// ─── Decoder ────────────────────────────────────────────────────────────────

/**
 * Decode bytecode instructions back to motion values
 */
export function decodeMotionBytecode(bytecode: string[]): Partial<ResolvedMotionOutput['values']> & {
  targetId?: string;
  renderer?: string;
  loop?: boolean;
} {
  const result: Record<string, unknown> = {};
  
  for (const line of bytecode) {
    const parts = line.trim().split(/\s+/);
    const op = parts[0];
    
    switch (op) {
      case 'ANIM_START':
        result.targetId = parts[2];
        break;
      case 'DURATION':
        result.durationMs = parseFloat(parts[1]);
        break;
      case 'DELAY':
        result.delayMs = parseFloat(parts[1]);
        break;
      case 'EASE':
        result.easing = parts[1];
        break;
      case 'TRANSLATE_X':
        result.translateX = parseFloat(parts[1]);
        break;
      case 'TRANSLATE_Y':
        result.translateY = parseFloat(parts[1]);
        break;
      case 'SCALE':
        result.scale = parseFloat(parts[1]);
        break;
      case 'SCALE_X':
        result.scaleX = parseFloat(parts[1]);
        break;
      case 'SCALE_Y':
        result.scaleY = parseFloat(parts[1]);
        break;
      case 'ROTATE':
        result.rotateDeg = parseFloat(parts[1]);
        break;
      case 'OPACITY':
        result.opacity = parseFloat(parts[1]);
        break;
      case 'GLOW':
        result.glow = parseFloat(parts[1]);
        break;
      case 'BLUR':
        result.blur = parseFloat(parts[1]);
        break;
      case 'LOOP':
        result.loop = parts[1] === '1';
        break;
      case 'PHASE':
        result.phaseOffset = parseFloat(parts[1]);
        break;
      case 'ORIGIN_X':
        result.originX = parseFloat(parts[1]);
        break;
      case 'ORIGIN_Y':
        result.originY = parseFloat(parts[1]);
        break;
      case 'RENDERER':
        result.renderer = parts[1];
        break;
    }
  }
  
  return result as ResolvedMotionOutput['values'];
}

// ─── Bytecode Hash (for deduplication) ──────────────────────────────────────

/**
 * Generate a hash from bytecode for deduplication and caching
 */
export function hashMotionBytecode(bytecode: string[]): string {
  // Simple hash for deduplication
  const joined = bytecode.join('\n');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    const char = joined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `mbc_${Math.abs(hash).toString(16)}`;
}

// ─── Pretty Print ───────────────────────────────────────────────────────────

/**
 * Pretty print bytecode for debugging
 */
export function prettyPrintBytecode(bytecode: string[]): string {
  return bytecode.map((line, i) => `${String(i).padStart(3, '0')} | ${line}`).join('\n');
}
