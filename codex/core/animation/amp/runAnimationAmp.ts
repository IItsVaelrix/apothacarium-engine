/**
 * Animation AMP — Core Runner
 * 
 * Main entry point for the Animation AMP system.
 * Routes animation intents through processor pipeline and emits resolved motion.
 * 
 * Flow: Intent -> Normalize -> Select Processors -> Run Pipeline -> Fuse -> Output
 */

import {
  AnimationIntent,
  MotionWorkingState,
  ResolvedMotionOutput,
  MotionProcessor,
  AnimationAmpConfig,
  DEFAULT_AMP_CONFIG,
  AnimationAmpError,
  AMP_ERROR_CODES,
} from '../contracts/animation.types.ts';
import {
  validateAnimationIntent,
  ANIMATION_ERROR_MESSAGES,
} from '../contracts/animation.schemas.ts';
import { buildMotionTrace } from '../diagnostics/buildMotionTrace.ts';
import { registerAllProcessors } from '../processors/registerAllProcessors.ts';
import { normalizeAnimationIntent } from './normalizeAnimationIntent.ts';
import { fuseMotionOutput } from './fuseMotionOutput.ts';

// ─── Processor Registry ─────────────────────────────────────────────────────

class ProcessorRegistry {
  private processors: Map<string, MotionProcessor> = new Map();
  
  register(processor: MotionProcessor): void {
    if (this.processors.has(processor.id)) {
      console.warn(`[AnimationAMP] Processor ${processor.id} already registered, overwriting`);
    }
    this.processors.set(processor.id, processor);
  }
  
  get(id: string): MotionProcessor | undefined {
    return this.processors.get(id);
  }
  
  getAll(): MotionProcessor[] {
    return Array.from(this.processors.values());
  }
  
  getByStage(stage: string): MotionProcessor[] {
    return this.getAll().filter(p => p.stage === stage);
  }
  
  selectForIntent(intent: AnimationIntent): MotionProcessor[] {
    const allProcessors = this.getAll();
    const selected = allProcessors.filter(p => p.supports(intent));
    
    // Sort by stage order and priority
    const stageOrder: Record<string, number> = {
      normalize: 0,
      timing: 1,
      transform: 2,
      visual: 3,
      sequence: 4,
      reactive: 5,
      constraint: 6,
      symmetry: 7,
      finalize: 8,
    };
    
    return selected.sort((a, b) => {
      const stageDiff = (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99);
      if (stageDiff !== 0) return stageDiff;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
  }
  
  clear(): void {
    this.processors.clear();
  }
}

// Global registry instance
export const processorRegistry = new ProcessorRegistry();

// ─── AMP State ──────────────────────────────────────────────────────────────

interface AmpState {
  config: AnimationAmpConfig;
  isRunning: boolean;
  activeAnimations: Map<string, ResolvedMotionOutput>;
}

const ampState: AmpState = {
  config: { ...DEFAULT_AMP_CONFIG },
  isRunning: false,
  activeAnimations: new Map(),
};

// ─── Core AMP Functions ─────────────────────────────────────────────────────

/**
 * Initialize Animation AMP with custom configuration
 */
export function initAnimationAmp(config: Partial<AnimationAmpConfig> = {}): void {
  ampState.config = { ...DEFAULT_AMP_CONFIG, ...config };
  
  // Register all available processors
  registerAllProcessors();
  
  ampState.isRunning = true;
  console.log('[AnimationAMP] Initialized with config:', ampState.config);
}

/**
 * Run processor pipeline on working state
 */
async function runProcessorPipeline(
  workingState: MotionWorkingState,
  processors: MotionProcessor[]
): Promise<MotionWorkingState> {
  const config = ampState.config;
  let state = { ...workingState };
  const pipelineStart = performance.now(); // EXEMPT

  // Limit processor count for performance
  const limitedProcessors = processors.slice(0, config.maxProcessors);

  for (const processor of limitedProcessors) {
    const processorStart = performance.now(); // EXEMPT

    // Run processor (sync for simple processors, async for complex ones)
    try {
      const result = await processor.run(state);
      state = result;

      // Check processor execution time
      const processorTime = performance.now() - processorStart; // EXEMPT
      if (config.performanceMonitoring && processorTime > config.frameBudgetMs) {
        state.diagnostics.push(`Processor ${processor.id} took ${processorTime.toFixed(2)}ms (budget: ${config.frameBudgetMs}ms)`);
      }
    } catch (error) {
      state.diagnostics.push(`Processor ${processor.id} failed: ${(error as Error).message}`);
      if (config.debug) {
        console.error(`[AnimationAMP] Processor ${processor.id} error:`, error);
      }
    }
  }

  // Log total pipeline time
  const totalTime = performance.now() - pipelineStart; // EXEMPT
  if (config.performanceMonitoring) {
    state.diagnostics.push(`AMP pipeline completed in ${totalTime.toFixed(2)}ms`);
    if (totalTime > config.frameBudgetMs * 2) {
      state.diagnostics.push(`WARNING: Total AMP time (${totalTime.toFixed(2)}ms) exceeds frame budget`);
    }
  }

  return state;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run Animation AMP with given intent
 * 
 * @param intent - Animation intent to process
 * @returns Resolved motion output for renderer
 */
export async function runAnimationAmp(intent: AnimationIntent): Promise<ResolvedMotionOutput> {
  // Validate intent
  const validation = validateAnimationIntent(intent);
  if (!validation.success) {
    throw new AnimationAmpError(
      `Intent validation failed: ${validation.error.message}`,
      AMP_ERROR_CODES.INTENT_VALIDATION_FAILED,
      intent,
      validation.error
    );
  }
  
  // Check if AMP is initialized
  if (!ampState.isRunning) {
    console.warn('[AnimationAMP] AMP not initialized, using defaults');
    initAnimationAmp();
  }
  
  // Normalize intent
  let workingState = await normalizeAnimationIntent(intent);
  
  // Select processors
  const processors = processorRegistry.selectForIntent(intent);
  
  if (ampState.config.debug) {
    console.log('[AnimationAMP] Selected processors:', processors.map(p => p.id));
  }
  
  // Run processor pipeline
  workingState = await runProcessorPipeline(workingState, processors);
  
  // Fuse output
  const output = fuseMotionOutput(workingState, ampState.config.bytecodeEnabled);
  
  // Add to active animations
  ampState.activeAnimations.set(intent.targetId, output);
  
  // Build trace for diagnostics
  if (ampState.config.debug) {
    const trace = buildMotionTrace(workingState);
    console.log('[AnimationAMP] Motion trace:', trace);
  }
  
  return output;
}

/**
 * Get active animation output for target
 */
export function getActiveAnimation(targetId: string): ResolvedMotionOutput | undefined {
  return ampState.activeAnimations.get(targetId);
}

/**
 * Clear active animation for target
 */
export function clearActiveAnimation(targetId: string): void {
  ampState.activeAnimations.delete(targetId);
}

/**
 * Get all active animations
 */
export function getAllActiveAnimations(): Map<string, ResolvedMotionOutput> {
  return new Map(ampState.activeAnimations);
}

/**
 * Shutdown Animation AMP
 */
export function shutdownAnimationAmp(): void {
  ampState.isRunning = false;
  ampState.activeAnimations.clear();
  console.log('[AnimationAMP] Shutdown complete');
}

/**
 * Get AMP status
 */
export function getAmpStatus(): {
  isRunning: boolean;
  activeCount: number;
  config: AnimationAmpConfig;
} {
  return {
    isRunning: ampState.isRunning,
    activeCount: ampState.activeAnimations.size,
    config: { ...ampState.config },
  };
}

// Auto-initialization ────────────────────────────────────────────────────

// Auto-init in dev mode for convenience
if (import.meta.env?.DEV) {
  initAnimationAmp({ 
    debug: true, 
    bytecodeEnabled: true, 
    maxProcessors: 16, 
    processorTimeoutMs: 50, 
    performanceMonitoring: true,
    frameBudgetMs: 8,
    symmetryIntegration: true
  });
}
