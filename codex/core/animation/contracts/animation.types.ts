/**
 * Animation AMP — Core Type Contracts
 * 
 * Authoritative type definitions for the Animation AMP system.
 * All motion flows through these contracts for determinism and QA traceability.
 * 
 * Architecture: Animation Intent -> AMP -> Processors -> Fused Output -> Renderer
 */

// ─── Animation Trigger Types ────────────────────────────────────────────────

export type AnimationTrigger =
  | 'mount'
  | 'unmount'
  | 'hover'
  | 'focus'
  | 'click'
  | 'scroll'
  | 'route-change'
  | 'audio'
  | 'state-change'
  | 'idle'
  | 'symmetry'
  | 'bytecode';

// ─── Renderer Targets ───────────────────────────────────────────────────────

export type AnimationRenderer = 'framer' | 'css' | 'phaser' | 'canvas' | 'overlay';

// ─── Processor Stages ───────────────────────────────────────────────────────

export type ProcessorStage =
  | 'normalize'
  | 'timing'
  | 'transform'
  | 'visual'
  | 'sequence'
  | 'reactive'
  | 'constraint'
  | 'symmetry'
  | 'finalize';

// ─── Animation Intent (Input Contract) ──────────────────────────────────────

export interface AnimationIntent {
  /** Schema version for backward compatibility */
  version: string;
  
  /** Unique target identifier (DOM id, Phaser sprite id, etc.) */
  targetId: string;
  
  /** Renderer target type */
  targetType?: AnimationRenderer;
  
  /** Preset name for common animation patterns */
  preset?: string;
  
  /** What triggered this animation */
  trigger: AnimationTrigger;
  
  /** Additional state for context-aware processors */
  state?: Record<string, unknown>;
  
  /** Constraints and limits */
  constraints?: {
    /** Respect reduced-motion preference */
    reducedMotion?: boolean;
    /** Device class hints */
    deviceClass?: 'mobile' | 'desktop' | 'tablet';
    /** Maximum allowed duration in ms */
    maxDurationMs?: number;
    /** Disable looping even if preset requests it */
    disableLoop?: boolean;
    /** FPS cap for performance-sensitive animations */
    maxFps?: number;
    /** GPU acceleration hint */
    gpuAccelerate?: boolean;
    /** Layout resolution constraint (bytecode layout definition) */
    layoutConstraint?: any;
  };
  
  /** Explicitly requested processor chain (optional, auto-selected if omitted) */
  requestedProcessors?: string[];
  
  /** Metadata for diagnostics and QA */
  metadata?: {
    /** Source system requesting animation */
    source?: string;
    /** Feature flag context */
    feature?: string;
    /** Scene/context name */
    scene?: string;
    /** Correlation ID for tracing */
    correlationId?: string;
  };
  
  /** Symmetry context (from Symmetry AMP) */
  symmetry?: {
    /** Symmetry type detected */
    type?: 'horizontal' | 'vertical' | 'radial' | 'none';
    /** Confidence score 0-1 */
    confidence?: number;
    /** Axis of symmetry */
    axis?: number;
    /** Apply mirrored motion */
    mirror?: boolean;
  };
  
  /** Bytecode instruction (for bytecode-driven animations) */
  bytecode?: string;
}

// ─── Motion Working State (Internal Processor Pipeline) ─────────────────────

export interface MotionWorkingState {
  /** Original animation intent */
  intent: AnimationIntent;
  
  /** Current motion values being transformed */
  values: {
    /** Width in pixels or percentage */
    width?: number;
    /** Height in pixels or percentage */
    height?: number;
    /** Duration in milliseconds */
    durationMs?: number;
    /** Delay before animation starts */
    delayMs?: number;
    /** Easing function name or cubic-bezier */
    easing?: string;
    /** Translation X (pixels or percentage) */
    translateX?: number;
    /** Translation Y (pixels or percentage) */
    translateY?: number;
    /** Scale factor (1 = original) */
    scale?: number;
    /** Scale X for non-uniform scaling */
    scaleX?: number;
    /** Scale Y for non-uniform scaling */
    scaleY?: number;
    /** Rotation in degrees */
    rotateDeg?: number;
    /** Opacity 0-1 */
    opacity?: number;
    /** Glow intensity 0-1 */
    glow?: number;
    /** Blur amount in pixels */
    blur?: number;
    /** Enable looping */
    loop?: boolean;
    /** Phase offset for staggered animations */
    phaseOffset?: number;
    /** Stagger index for grouped animations */
    staggerIndex?: number;
    /** Origin point for transforms */
    originX?: number;
    originY?: number;
  };
  
  /** Processor-modified flags */
  flags: {
    /** Can this animation be interrupted? */
    interruptible?: boolean;
    /** Was reduced-motion applied? */
    reduced?: boolean;
    /** Were constraints applied? */
    constrained?: boolean;
    /** Is GPU acceleration enabled? */
    gpuAccelerated?: boolean;
    /** Was symmetry applied? */
    symmetryApplied?: boolean;
  };
  
  /** Diagnostic messages from processors */
  diagnostics: string[];
  
  /** Trace of processor modifications */
  trace: Array<{
    /** Processor ID that made changes */
    processorId: string;
    /** Stage where processor ran */
    stage: ProcessorStage;
    /** List of value keys that were changed */
    changed: string[];
    /** Timestamp of processor execution */
    timestamp: number;
  }>;
}

// ─── Resolved Motion Output (Final Contract for Renderers) ──────────────────

export interface ResolvedMotionOutput {
  /** Schema version */
  version: string;
  
  /** Target identifier */
  targetId: string;
  
  /** Was motion resolution successful? */
  success: boolean;
  
  /** Target renderer type */
  renderer: AnimationRenderer;
  
  /** Final resolved motion values */
  values: {
    width?: number;
    height?: number;
    durationMs: number;
    delayMs: number;
    easing: string;
    translateX: number;
    translateY: number;
    scale: number;
    scaleX: number;
    scaleY: number;
    rotateDeg: number;
    opacity: number;
    glow?: number;
    blur?: number;
    loop: boolean;
    phaseOffset?: number;
    originX: number;
    originY: number;
  };
  
  /** CSS variable map for CSS adapter */
  cssVariables?: Record<string, string>;
  
  /** Framer Motion transition config */
  framerTransition?: {
    duration: number;
    delay?: number;
    ease?: string | number[];
    repeat?: number;
    repeatType?: 'loop' | 'reverse' | 'mirror';
  };

  /** Phaser-specific motion payload */
  phaserPayload?: {
    targetType: 'tween' | 'timeline';
    config: Record<string, unknown>;
  };

  /** PixelBrain-specific formula payload */
  pixelBrainPayload?: {
    formula: string;
    coordinates: Array<{ x: number; y: number; space: 'pixel' | 'cell' | 'lattice' }>;
  };
  
  /** Motion bytecode instructions for persistence/debug */
  bytecode?: string[];
  
  /** Diagnostic messages */
  diagnostics: string[];
  
  /** Full processor trace for debugging */
  trace: Array<{
    processorId: string;
    stage: ProcessorStage;
    changed: string[];
    timestamp: number;
  }>;
  
  /** Performance metadata */
  performance?: {
    /** Total processing time in ms */
    processingTimeMs: number;
    /** Number of processors executed */
    processorCount: number;
    /** Was reduced-motion applied? */
    reducedMotion: boolean;
    /** GPU acceleration status */
    gpuAccelerated: boolean;
  };
}

// ─── Motion Processor Interface ─────────────────────────────────────────────

export interface MotionProcessor {
  /** Unique processor identifier */
  id: string;
  
  /** Processor stage in the pipeline */
  stage: ProcessorStage;
  
  /** Does this processor support the given intent? */
  supports(intent: AnimationIntent): boolean;
  
  /** Transform motion working state */
  run(input: MotionWorkingState): MotionWorkingState;
  
  /** Processor priority within stage (higher = runs first) */
  priority?: number;
}

// ─── Animation Preset Interface ─────────────────────────────────────────────

export interface AnimationPreset {
  /** Preset name */
  name: string;
  
  /** Preset version */
  version: string;
  
  /** Default motion values for this preset */
  defaults: Partial<MotionWorkingState['values']>;
  
  /** Default flags */
  flags?: Partial<MotionWorkingState['flags']>;
  
  /** Compatible triggers */
  triggers?: AnimationTrigger[];
  
  /** Compatible renderers */
  renderers?: AnimationRenderer[];
  
  /** Processors this preset expects to use */
  expectedProcessors?: string[];
  
  /** Description for documentation */
  description?: string;
}

// ─── AMP Configuration ──────────────────────────────────────────────────────

export interface AnimationAmpConfig {
  /** Enable debug tracing */
  debug: boolean;
  
  /** Enable bytecode generation */
  bytecodeEnabled: boolean;
  
  /** Maximum processors to run per animation */
  maxProcessors: number;
  
  /** Timeout for processor execution in ms */
  processorTimeoutMs: number;
  
  /** Enable performance monitoring */
  performanceMonitoring: boolean;
  
  /** RAF budget per frame in ms (16.67ms for 60fps) */
  frameBudgetMs: number;
  
  /** Enable symmetry AMP integration */
  symmetryIntegration: boolean;
}

// ─── Default Configuration ──────────────────────────────────────────────────

export const DEFAULT_AMP_CONFIG: AnimationAmpConfig = {
  debug: import.meta.env?.DEV ?? false,
  bytecodeEnabled: true,
  maxProcessors: 16,
  processorTimeoutMs: 50,
  performanceMonitoring: true,
  frameBudgetMs: 8, // Half frame budget for AMP processing
  symmetryIntegration: true,
};

// ─── Error Types ────────────────────────────────────────────────────────────

export class AnimationAmpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly intent?: AnimationIntent,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AnimationAmpError';
  }
}

export const AMP_ERROR_CODES = {
  INTENT_VALIDATION_FAILED: 'AMP-ERR-001',
  PROCESSOR_NOT_FOUND: 'AMP-ERR-002',
  PROCESSOR_TIMEOUT: 'AMP-ERR-003',
  PROCESSOR_EXCEPTION: 'AMP-ERR-004',
  FUSION_FAILED: 'AMP-ERR-005',
  RENDERER_ADAPTER_NOT_FOUND: 'AMP-ERR-006',
  BYTECODE_DECODE_FAILED: 'AMP-ERR-007',
  SYMMETRY_AMP_INTEGRATION_FAILED: 'AMP-ERR-008',
} as const;
