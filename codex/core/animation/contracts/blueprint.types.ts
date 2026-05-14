/**
 * Animation AMP — Blueprint Types
 * 
 * Canonical definitions for animation blueprints (DSL IR).
 * Move here from the legacy bytecode-bridge to maintain continuity.
 */

// ─── Core Blueprint Type ─────────────────────────────────────────────────────

export type AnimationBlueprintV1 = {
  version: "1.0";
  id: string;
  name?: string;
  description?: string;
  target: TargetSpec;
  preset?: string;
  durationMs: number;
  delayMs?: number;
  loop: number | "infinite";
  easing: EasingSpec;
  phase?: number;
  transforms?: TransformSpec;
  envelopes?: EnvelopeMap;
  symmetry?: SymmetrySpec;
  grid?: GridSpec;
  anchors?: AnchorSpec;
  compositing?: CompositingSpec;
  backendHints?: BackendHints;
  constraints?: ConstraintSpec;
  qa?: QASpec;
  metadata?: MetadataSpec;
};

// ─── Target Specification ────────────────────────────────────────────────────

export type TargetSpec = {
  selectorType: "id" | "class" | "role" | "symbolic" | "engine-target";
  value: string;
};

// ─── Easing Specification ────────────────────────────────────────────────────

export type EasingSpec = {
  type: "token" | "cubic" | "spring" | "custom";
  value: string | number[] | Record<string, number>;
};

// ─── Transform Specification ─────────────────────────────────────────────────

export type TransformSpec = {
  scale?: ScalarTransformSpec;
  rotate?: ScalarTransformSpec;
  translateX?: ScalarTransformSpec;
  translateY?: ScalarTransformSpec;
  opacity?: ScalarTransformSpec;
  glow?: ScalarTransformSpec;
  blur?: ScalarTransformSpec;
};

export type ScalarTransformSpec = {
  base?: number;
  peak?: number;
  min?: number;
  max?: number;
  unit?: string;
  envelope?: EnvelopeSpec;
};

// ─── Envelope System ─────────────────────────────────────────────────────────

export type EnvelopeMap = Record<string, EnvelopeSpec>;

export type EnvelopeSpec = {
  kind: "constant" | "sine" | "triangle" | "expDecay" | "pulse" | "bezier" | "keyed";
  params: Record<string, number | string | boolean>;
};

// ─── Symmetry Specification ──────────────────────────────────────────────────

export type SymmetrySpec = {
  type: "none" | "mirror-x" | "mirror-y" | "radial" | "diagonal";
  order?: number;
  origin?: {
    x: number;
    y: number;
    space?: "local" | "grid" | "world";
  };
};

// ─── Grid / Lattice Specification ────────────────────────────────────────────

export type GridSpec = {
  mode: "free" | "cell-space" | "lattice";
  latticeId?: string;
  snap?: boolean;
  cellWidth?: number;
  cellHeight?: number;
};

// ─── Anchor / Pivot Specification ────────────────────────────────────────────

export type AnchorSpec = {
  pivotX?: number;
  pivotY?: number;
  originSpace?: "local" | "grid" | "world";
};

// ─── Compositing Specification ───────────────────────────────────────────────

export type CompositingSpec = {
  blendMode?: string;
  zLayer?: string | number;
  pass: "css" | "phaser" | "pixelbrain" | "hybrid";
};

// ─── Backend Hints ───────────────────────────────────────────────────────────

export type BackendHints = {
  css?: Record<string, string | number | boolean>;
  phaser?: Record<string, string | number | boolean>;
  pixelbrain?: Record<string, string | number | boolean>;
};

// ─── Constraint Specification ────────────────────────────────────────────────

export type ConstraintSpec = {
  deterministic?: boolean;
  maxFrameMs?: number;
  maxPropertyCount?: number;
  allowBackendDegradation?: boolean;
  requireParityAcrossBackends?: boolean;
};

// ─── QA Specification ────────────────────────────────────────────────────────

export type QASpec = {
  invariants?: string[];
  parityMode?: "strict" | "tolerant" | "backend-specific";
  screenshotRequired?: boolean;
};

// ─── Metadata Specification ──────────────────────────────────────────────────

export type MetadataSpec = {
  author?: string;
  createdAt?: string;
  tags?: string[];
  feature?: string;
};

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const BLUEPRINT_ERROR_CODES = {
  PARSE_UNKNOWN_DIRECTIVE: 0x1001,
  PARSE_MISSING_ANIM_START: 0x1002,
  PARSE_MISSING_ANIM_END: 0x1003,
  PARSE_DUPLICATE_DIRECTIVE: 0x1004,
  PARSE_INVALID_TOKEN: 0x1005,
  PARSE_MISSING_REQUIRED_FIELD: 0x1006,
  
  VALIDATE_MISSING_TARGET: 0x1101,
  VALIDATE_INVALID_ENVELOPE_PARAM: 0x1102,
  VALIDATE_INVALID_SYMMETRY_ORDER: 0x1103,
  VALIDATE_MISSING_SYMMETRY_ORDER: 0x1104,
  VALIDATE_INVALID_EASING: 0x1105,
  VALIDATE_INVALID_TRANSFORM: 0x1106,
  VALIDATE_GRID_CONFLICT: 0x1107,
  VALIDATE_CONSTRAINT_VIOLATION: 0x1108,
  
  COMPILE_UNSUPPORTED_BACKEND_FEATURE: 0x1201,
  COMPILE_BACKEND_DRIFT: 0x1202,
  COMPILE_ENVELOPE_FAILURE: 0x1203,
  COMPILE_SYMMETRY_FAILURE: 0x1204,
  
  PERF_BUDGET_EXCEEDED: 0x1301,
  PERF_PROPERTY_COUNT_EXCEEDED: 0x1302,
  
  PARITY_BACKEND_DRIFT: 0x1401,
  PARITY_INVARIANT_VIOLATION: 0x1402,
} as const;

export type BlueprintParseResult = {
  success: boolean;
  blueprint?: AnimationBlueprintV1;
  errors: any[];
  warnings: any[];
  sourceMap?: Map<number, string>;
};
