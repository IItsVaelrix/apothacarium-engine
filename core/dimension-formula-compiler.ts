/**
 * Dimension Formula Compiler and Responsive Bytecode Schema for PixelBrain
 * Implementation based on PDR: Dimension Formula Compiler and Responsive Bytecode Schema for PixelBrain
 * 
 * @module dimension-formula-compiler
 * @version 1.0.0
 */

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Clamps a value to the finite range.
 */
function toFinite(val: any, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Performs a guarded division.
 */
function safeDivide(n: any, d: any, fallback = 0): number {
  const num = Number(n);
  const den = Number(d);
  if (den === 0 || !Number.isFinite(den)) return fallback;
  const result = num / den;
  return Number.isFinite(result) ? result : fallback;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export class DimensionCompileError extends Error {
  constructor(
    message: string,
    public input: string,
    public code: DimensionErrorCode,
    public line?: number
  ) {
    super(message);
    this.name = 'DimensionCompileError';
  }
}

export enum DimensionErrorCode {
  // Parse errors (1000-1099)
  MALFORMED_DIMENSION = 1001,
  UNKNOWN_UNIT = 1002,
  MIXED_UNITS_NO_CONVERSION = 1003,
  VAGUE_LANGUAGE = 1004,
  
  // Validation errors (1100-1199)
  IMPOSSIBLE_CLAMP = 1101,
  NEGATIVE_VALUE = 1102,
  MISSING_HEIGHT_NO_ASPECT = 1103,
  MIN_GREATER_THAN_MAX = 1104,
  
  // Type errors (1200-1299)
  UNSUPPORTED_TYPE = 1201,
  INVALID_VARIANT = 1202,
  INCOMPLETE_VARIANT = 1203,
  
  // Runtime errors (1300-1399)
  EXECUTION_FAILED = 1301,
  INVALID_REGISTER = 1302,
}

// ─── Type Definitions ────────────────────────────────────────────────────────

export type Unit = 'px' | 'em' | 'rem' | '%' | 'vh' | 'vw' | 'fr' | 'pt' | 'pc' | 'in' | 'cm' | 'mm';

export type FormulaNode =
  | { type: 'const'; value: number; unit?: Unit }
  | { type: 'viewportWidth' }
  | { type: 'viewportHeight' }
  | { type: 'parentWidth' }
  | { type: 'parentHeight' }
  | { type: 'viewportUnits'; value: number; unit: 'vw' | 'vh' }
  | { type: 'parentUnits'; value: number; unit: '%' }
  | { type: 'convert'; value: number; from: Unit; to: 'px'; multiplier?: number }
  | { type: 'add'; a: FormulaNode; b: FormulaNode }
  | { type: 'sub'; a: FormulaNode; b: FormulaNode }
  | { type: 'mul'; a: FormulaNode; b: FormulaNode }
  | { type: 'div'; a: FormulaNode; b: FormulaNode }
  | { type: 'min'; a: FormulaNode; b: FormulaNode }
  | { type: 'max'; a: FormulaNode; b: FormulaNode }
  | { type: 'clamp'; value: FormulaNode; min: FormulaNode; max: FormulaNode }
  | { type: 'sameAsWidth' }
  | { type: 'sameAsHeight' }
  | { type: 'selectNearest'; value: FormulaNode; options: number[] }
  | { type: 'orientation'; portrait: FormulaNode; landscape: FormulaNode };

export type FitMode = 'fill' | 'contain' | 'cover' | 'stretch' | 'snap';
export type AnchorMode = 'top-left' | 'top-center' | 'center' | 'bottom-center';
export type SnapMode = 'none' | 'integer' | 'pixel';
export type DeviceClass = 'desktop' | 'tablet' | 'mobile-android' | 'mobile-ios' | 'unknown';
export type Orientation = 'portrait' | 'landscape' | 'square';

export interface RuntimeBindings {
  viewportWidth: number;
  viewportHeight: number;
  parentWidth: number;
  parentHeight: number;
  deviceClass?: DeviceClass;
  orientation?: Orientation;
  pixelRatio?: number;
}

export interface CanonicalDimensionSpec {
  id: string;
  kind: 'fixed' | 'range' | 'aspect' | 'viewport' | 'container' | 'variant' | 'orientation';
  widthPolicy: FormulaNode;
  heightPolicy?: FormulaNode;
  aspectRatio?: { numerator: number; denominator: number };
  clamp?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  fitMode?: FitMode;
  anchor?: AnchorMode;
  snapMode?: SnapMode;
  overflowPolicy?: 'clip' | 'scale-down' | 'allow';
  variants?: CanonicalDimensionSpec[];
  deviceClass?: DeviceClass;
  orientation?: {
    portrait: CanonicalDimensionSpec;
    landscape: CanonicalDimensionSpec;
  };
}

export type BytecodeInstruction =
  | ['LOAD_CONST', number, number]
  | ['LOAD_VIEWPORT_WIDTH', number]
  | ['LOAD_VIEWPORT_HEIGHT', number]
  | ['LOAD_PARENT_WIDTH', number]
  | ['LOAD_PARENT_HEIGHT', number]
  | ['LOAD_DEVICE_CLASS', number]
  | ['LOAD_ORIENTATION', number]
  | ['MOVE', number, number]
  | ['ADD', number, number, number]
  | ['SUB', number, number, number]
  | ['MUL', number, number, number]
  | ['DIV', number, number, number]
  | ['MIN', number, number, number]
  | ['MAX', number, number, number]
  | ['CLAMP', number, number, number, number]
  | ['ROUND', number, number]
  | ['FLOOR', number, number]
  | ['CEIL', number, number]
  | ['SELECT_NEAREST', number, number, number[]]
  | ['CONVERT_UNIT', number, number, number]
  | ['APPLY_VIEWPORT_UNITS', number, number, number]
  | ['APPLY_PARENT_PERCENT', number, number, number]
  | ['BRANCH_ORIENTATION_PORTRAIT', number]
  | ['BRANCH_ORIENTATION_LANDSCAPE', number]
  | ['SET_WIDTH', number]
  | ['SET_HEIGHT', number]
  | ['SET_ASPECT', number, number]
  | ['SET_FIT_MODE', FitMode]
  | ['SET_ANCHOR', AnchorMode]
  | ['SET_SNAP', SnapMode]
  | ['SET_DEVICE_CLASS', DeviceClass]
  | ['END'];

export const REGISTERS = {
  VIEWPORT_WIDTH: 0,
  VIEWPORT_HEIGHT: 1,
  PARENT_WIDTH: 2,
  PARENT_HEIGHT: 3,
  COMPUTED_WIDTH: 4,
  COMPUTED_HEIGHT: 5,
  TEMP_1: 6,
  TEMP_2: 7,
  TEMP_3: 8,
  DEVICE_CLASS: 9,
  ORIENTATION: 10,
  PIXEL_RATIO: 11,
};

export const UNIT_MULTIPLIERS: Record<Unit, number> = {
  px: 1,
  em: 16,
  rem: 16,
  '%': 1,
  vh: 1,
  vw: 1,
  fr: 1,
  pt: 1.333,
  pc: 16,
  in: 96,
  cm: 37.8,
  mm: 3.78,
};

export function detectDeviceClass(viewportWidth: number): DeviceClass {
  if (viewportWidth >= 1024) return 'desktop';
  if (viewportWidth >= 768) return 'tablet';
  if (viewportWidth >= 375) return 'mobile-ios';
  return 'mobile-android';
}

export function detectOrientation(width: number, height: number): Orientation {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

// ─── Dimension Compiler ──────────────────────────────────────────────────────

export class DimensionCompiler {
  parse(input: string): any {
    const cleanInput = input.trim().toLowerCase();

    // Reject vague language
    const vaguePatterns = ['kinda', 'sorta', 'maybe', 'ish', 'fairly', 'normal', 'regular'];
    for (const pattern of vaguePatterns) {
      if (cleanInput.includes(pattern)) {
        throw new DimensionCompileError(
          `Vague dimension: "${input}"`,
          input,
          DimensionErrorCode.VAGUE_LANGUAGE
        );
      }
    }

    // Orientation Pair (MUST BE CHECKED BEFORE COMMA SPLIT)
    const orientationPairMatch = cleanInput.match(/^portrait\s+([\d.x\w%]+),\s*landscape\s+([\d.x\w%]+)$/);
    if (orientationPairMatch) {
      return { 
        type: 'orientation', 
        portrait: this.parse(orientationPairMatch[1].trim()), 
        landscape: this.parse(orientationPairMatch[2].trim()) 
      };
    }

    let hasTopLevelComma = false;
    let bracketLevel = 0;
    for (let i = 0; i < cleanInput.length; i++) {
      const char = cleanInput[i];
      if (char === '[' || char === '(') bracketLevel++;
      if (char === ']' || char === ')') bracketLevel--;
      if (char === ',' && bracketLevel === 0) {
        hasTopLevelComma = true;
        break;
      }
    }

    if (hasTopLevelComma) {
      const parts: string[] = [];
      let current = '';
      let nestedBracketLevel = 0;
      for (let i = 0; i < cleanInput.length; i++) {
        const char = cleanInput[i];
        if (char === '[' || char === '(') nestedBracketLevel++;
        if (char === ']' || char === ')') nestedBracketLevel--;
        if (char === ',' && nestedBracketLevel === 0) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      const base = this.parse(parts[0]);
      const attrs: any = {};
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('aspect ')) {
          const match = part.match(/aspect (\d+):(\d+)/);
          if (match) attrs.aspect = { numerator: parseInt(match[1], 10), denominator: parseInt(match[2], 10) };
        } else if (part.startsWith('snap ')) {
          attrs.snap = part.replace('snap ', '').trim();
        } else if (part.startsWith('fit ')) {
          attrs.fit = part.replace('fit ', '').trim();
        } else if (part.startsWith('anchor ')) {
          attrs.anchor = part.replace('anchor ', '').trim();
        } else if (part.startsWith('device ')) {
          attrs.device = part.replace('device ', '').trim();
        }
      }
      return { ...base, ...attrs };
    }

    // Viewport/parent references
    if (cleanInput === 'viewport.width') return { type: 'viewport-width' };
    if (cleanInput === 'viewport.height') return { type: 'viewport-height' };
    if (cleanInput === 'parent.width') return { type: 'parent-width' };
    if (cleanInput === 'parent.height') return { type: 'parent-height' };

    // Clamp
    const clampMatch = cleanInput.match(/^clamp\(([^,]+),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)$/);
    if (clampMatch) {
      const min = parseFloat(clampMatch[2]);
      const max = parseFloat(clampMatch[3]);
      if (min > max) {
        throw new DimensionCompileError(
          `Invalid clamp: min (${min}) > max (${max})`,
          input,
          DimensionErrorCode.IMPOSSIBLE_CLAMP
        );
      }
      return { type: 'clamp', value: this.parse(clampMatch[1]), min, max };
    }

    // selectNearest
    const selectMatch = cleanInput.match(/^selectnearest\(([^,]+),\s*\[([\d\s,]+)\]\)$/);
    if (selectMatch) {
      const valueStr = selectMatch[1].trim();
      const options = selectMatch[2].split(',').map((s) => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      
      if (valueStr === 'parent.width') return { type: 'select-nearest', value: { type: 'parent-width' }, options };
      if (valueStr === 'parent.height') return { type: 'select-nearest', value: { type: 'parent-height' }, options };
      if (valueStr === 'viewport.width') return { type: 'select-nearest', value: { type: 'viewport-width' }, options };
      if (valueStr === 'viewport.height') return { type: 'select-nearest', value: { type: 'viewport-height' }, options };
      
      return { type: 'select-nearest', value: this.parse(valueStr), options };
    }

    // Orientation (Single)
    if (cleanInput.startsWith('portrait ')) {
      return { type: 'orientation-single', orientation: 'portrait', value: this.parse(cleanInput.replace('portrait ', '').trim()) };
    }
    if (cleanInput.startsWith('landscape ')) {
      return { type: 'orientation-single', orientation: 'landscape', value: this.parse(cleanInput.replace('landscape ', '').trim()) };
    }

    // Variants
    if (cleanInput.includes(' or ')) {
      return { type: 'variants', variants: cleanInput.split(' or ').map((v) => this.parse(v.trim())) };
    }

    // Range with units
    const rangeMatch = cleanInput.match(/^(\d+(?:\.\d+)?)(px|em|rem|vh|vw|%)?\s*(?:to|–|-)\s*(\d+(?:\.\d+)?)(px|em|rem|vh|vw|%)?$/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[3]);
      const unit = (rangeMatch[2] as Unit) || 'px';
      if (min > max) throw new DimensionCompileError(`Invalid range: min > max`, input, DimensionErrorCode.MIN_GREATER_THAN_MAX);
      return { type: 'range', min, max, unit };
    }

    // Square range
    const squareRangeMatch = cleanInput.match(/^(\d+)x(\d+)\s*to\s*(\d+)x(\d+)$/);
    if (squareRangeMatch) {
      const min = parseInt(squareRangeMatch[1], 10);
      const max = parseInt(squareRangeMatch[3], 10);
      return { type: 'square-range', min, max, unit: 'px' };
    }

    // Fixed with units
    const fixedMatch = cleanInput.match(/^(\d+(?:\.\d+)?)(px|em|rem|vh|vw|%)?\s*(?:x|×)\s*(\d+(?:\.\d+)?)(px|em|rem|vh|vw|%)?$/);
    if (fixedMatch) {
      const width = parseFloat(fixedMatch[1]);
      const height = parseFloat(fixedMatch[3]);
      const unit = (fixedMatch[2] as Unit) || 'px';
      if (width < 0 || height < 0) throw new DimensionCompileError(`Negative dimensions`, input, DimensionErrorCode.NEGATIVE_VALUE);
      return { type: 'fixed', width, height, unit };
    }

    // Single with unit
    const singleMatch = cleanInput.match(/^(\d+(?:\.\d+)?)(px|em|rem|vh|vw|%)?$/);
    if (singleMatch) {
      const value = parseFloat(singleMatch[1]);
      const unit = (singleMatch[2] as Unit) || 'px';
      if (value < 0) throw new DimensionCompileError(`Negative value`, input, DimensionErrorCode.NEGATIVE_VALUE);
      return { type: 'single', value, unit };
    }

    throw new DimensionCompileError(`Cannot parse: "${input}"`, input, DimensionErrorCode.MALFORMED_DIMENSION);
  }

  canonicalize(parsed: any, id: string = 'root'): CanonicalDimensionSpec {
    const spec: Partial<CanonicalDimensionSpec> = {
      id,
      snapMode: (parsed.snap as SnapMode) || 'integer',
      fitMode: parsed.fit as FitMode,
      anchor: parsed.anchor as AnchorMode,
      deviceClass: parsed.device as DeviceClass,
    };

    if (parsed.aspect) spec.aspectRatio = parsed.aspect;

    switch (parsed.type) {
      case 'fixed':
        return { ...spec as CanonicalDimensionSpec, kind: 'fixed', widthPolicy: { type: 'const', value: parsed.width, unit: parsed.unit }, heightPolicy: parsed.height !== undefined ? { type: 'const', value: parsed.height, unit: parsed.unit } : undefined };
      case 'fixed-width':
        return { ...spec as CanonicalDimensionSpec, kind: 'fixed', widthPolicy: { type: 'const', value: parsed.width }, heightPolicy: parsed.aspect ? { type: 'mul', a: { type: 'sameAsWidth' }, b: { type: 'const', value: parsed.aspect.denominator / parsed.aspect.numerator } } : undefined };
      case 'single':
        return { ...spec as CanonicalDimensionSpec, kind: 'fixed', widthPolicy: this.unitToFormula(parsed.value, parsed.unit), heightPolicy: parsed.aspect ? { type: 'mul', a: { type: 'sameAsWidth' }, b: { type: 'const', value: parsed.aspect.denominator / parsed.aspect.numerator } } : undefined };
      case 'range':
        return { ...spec as CanonicalDimensionSpec, kind: 'range', widthPolicy: { type: 'clamp', value: { type: 'parentWidth' }, min: { type: 'const', value: parsed.min }, max: { type: 'const', value: parsed.max } } };
      case 'square-range':
        return { ...spec as CanonicalDimensionSpec, kind: 'range', widthPolicy: { type: 'clamp', value: { type: 'parentWidth' }, min: { type: 'const', value: parsed.min }, max: { type: 'const', value: parsed.max } }, heightPolicy: { type: 'sameAsWidth' } };
      case 'viewport-width':
        return { ...spec as CanonicalDimensionSpec, kind: 'viewport', widthPolicy: { type: 'viewportWidth' } };
      case 'viewport-height':
        return { ...spec as CanonicalDimensionSpec, kind: 'viewport', widthPolicy: { type: 'viewportHeight' } };
      case 'parent-width':
        return { ...spec as CanonicalDimensionSpec, kind: 'container', widthPolicy: { type: 'parentWidth' } };
      case 'parent-height':
        return { ...spec as CanonicalDimensionSpec, kind: 'container', widthPolicy: { type: 'parentHeight' } };
      case 'clamp': {
        const valueSpec = this.canonicalize(parsed.value);
        return { ...spec as CanonicalDimensionSpec, kind: 'range', widthPolicy: { type: 'clamp', value: valueSpec.widthPolicy, min: { type: 'const', value: parsed.min }, max: { type: 'const', value: parsed.max } } };
      }
      case 'variants':
        return { ...spec as CanonicalDimensionSpec, kind: 'variant', widthPolicy: { type: 'const', value: 0 }, variants: parsed.variants.map((v: any, i: number) => this.canonicalize(v, `${id}-v${i}`)) };
      case 'select-nearest':
        return { ...spec as CanonicalDimensionSpec, kind: 'fixed', widthPolicy: { type: 'selectNearest', value: this.canonicalize(parsed.value).widthPolicy, options: parsed.options }, heightPolicy: { type: 'sameAsWidth' } };
      case 'orientation':
        return { ...spec as CanonicalDimensionSpec, kind: 'orientation', widthPolicy: { type: 'const', value: 0 }, orientation: { portrait: this.canonicalize(parsed.portrait, `${id}-portrait`), landscape: this.canonicalize(parsed.landscape, `${id}-landscape`) } };
      case 'orientation-single': {
        // Map single orientation to same value for both if needed, but usually part of a pair
        const valSpec = this.canonicalize(parsed.value, `${id}-${parsed.orientation}`);
        return valSpec;
      }
      default:
        throw new DimensionCompileError(`Unsupported type: ${parsed.type}`, JSON.stringify(parsed), DimensionErrorCode.UNSUPPORTED_TYPE);
    }
  }

  private unitToFormula(value: number, unit: Unit): FormulaNode {
    if (unit === 'px') return { type: 'const', value };
    if (unit === 'em' || unit === 'rem' || unit === 'pt' || unit === 'pc' || unit === 'in' || unit === 'cm' || unit === 'mm') {
      return { type: 'convert', value, from: unit, to: 'px', multiplier: UNIT_MULTIPLIERS[unit] };
    }
    if (unit === 'vw' || unit === 'vh') {
      return { type: 'viewportUnits', value, unit };
    }
    if (unit === '%') {
      return { type: 'parentUnits', value, unit: '%' };
    }
    return { type: 'const', value };
  }

  compile(spec: CanonicalDimensionSpec): BytecodeInstruction[] {
    const instructions: BytecodeInstruction[] = [];

    if (spec.kind === 'orientation') {
      if (!spec.orientation) {
        throw new DimensionCompileError(`Orientation spec missing branches`, JSON.stringify(spec), DimensionErrorCode.INCOMPLETE_VARIANT);
      }

      instructions.push(['LOAD_ORIENTATION', REGISTERS.ORIENTATION]);
      const branchToLandscape: BytecodeInstruction = ['BRANCH_ORIENTATION_LANDSCAPE', 0];
      instructions.push(branchToLandscape);

      this.compileSpecBody(spec.orientation.portrait, instructions);
      instructions.push(['END']);

      branchToLandscape[1] = instructions.length;
      this.compileSpecBody(spec.orientation.landscape, instructions);
      instructions.push(['END']);

      return instructions;
    }

    this.compileSpecBody(spec, instructions);
    instructions.push(['END']);
    return instructions;
  }

  private compileSpecBody(spec: CanonicalDimensionSpec, instructions: BytecodeInstruction[]) {
    this.compileNode(spec.widthPolicy, REGISTERS.COMPUTED_WIDTH, instructions);
    instructions.push(['SET_WIDTH', REGISTERS.COMPUTED_WIDTH]);

    if (spec.heightPolicy) {
      this.compileNode(spec.heightPolicy, REGISTERS.COMPUTED_HEIGHT, instructions);
      instructions.push(['SET_HEIGHT', REGISTERS.COMPUTED_HEIGHT]);
    }

    if (spec.aspectRatio) instructions.push(['SET_ASPECT', spec.aspectRatio.numerator, spec.aspectRatio.denominator]);
    if (spec.fitMode) instructions.push(['SET_FIT_MODE', spec.fitMode]);
    if (spec.anchor) instructions.push(['SET_ANCHOR', spec.anchor]);
    if (spec.snapMode) instructions.push(['SET_SNAP', spec.snapMode]);
    if (spec.deviceClass) instructions.push(['SET_DEVICE_CLASS', spec.deviceClass]);
  }

  private compileNode(node: FormulaNode, targetReg: number, instructions: BytecodeInstruction[]) {
    switch (node.type) {
      case 'const':
        instructions.push(['LOAD_CONST', targetReg, node.value]);
        break;
      case 'viewportWidth':
        instructions.push(['LOAD_VIEWPORT_WIDTH', targetReg]);
        break;
      case 'viewportHeight':
        instructions.push(['LOAD_VIEWPORT_HEIGHT', targetReg]);
        break;
      case 'parentWidth':
        instructions.push(['LOAD_PARENT_WIDTH', targetReg]);
        break;
      case 'parentHeight':
        instructions.push(['LOAD_PARENT_HEIGHT', targetReg]);
        break;
      case 'convert': {
        const mult = node.multiplier || UNIT_MULTIPLIERS[node.from];
        instructions.push(['CONVERT_UNIT', targetReg, node.value, mult]);
        break;
      }
      case 'viewportUnits':
        if (node.unit === 'vw') {
          instructions.push(['APPLY_VIEWPORT_UNITS', targetReg, node.value, REGISTERS.VIEWPORT_WIDTH]);
        } else {
          instructions.push(['APPLY_VIEWPORT_UNITS', targetReg, node.value, REGISTERS.VIEWPORT_HEIGHT]);
        }
        break;
      case 'parentUnits':
        instructions.push(['APPLY_PARENT_PERCENT', targetReg, node.value, REGISTERS.PARENT_WIDTH]);
        break;
      case 'add':
        this.compileNode(node.a, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.b, REGISTERS.TEMP_2, instructions);
        instructions.push(['ADD', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2]);
        break;
      case 'sub':
        this.compileNode(node.a, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.b, REGISTERS.TEMP_2, instructions);
        instructions.push(['SUB', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2]);
        break;
      case 'mul':
        this.compileNode(node.a, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.b, REGISTERS.TEMP_2, instructions);
        instructions.push(['MUL', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2]);
        break;
      case 'div':
        this.compileNode(node.a, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.b, REGISTERS.TEMP_2, instructions);
        instructions.push(['DIV', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2]);
        break;
      case 'min':
        this.compileNode(node.a, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.b, REGISTERS.TEMP_2, instructions);
        instructions.push(['MIN', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2]);
        break;
      case 'max':
        this.compileNode(node.a, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.b, REGISTERS.TEMP_2, instructions);
        instructions.push(['MAX', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2]);
        break;
      case 'clamp':
        this.compileNode(node.value, REGISTERS.TEMP_1, instructions);
        this.compileNode(node.min, REGISTERS.TEMP_2, instructions);
        this.compileNode(node.max, REGISTERS.TEMP_3, instructions);
        instructions.push(['CLAMP', targetReg, REGISTERS.TEMP_1, REGISTERS.TEMP_2, REGISTERS.TEMP_3]);
        break;
      case 'sameAsWidth':
        instructions.push(['MOVE', targetReg, REGISTERS.COMPUTED_WIDTH]);
        break;
      case 'sameAsHeight':
        instructions.push(['MOVE', targetReg, REGISTERS.COMPUTED_HEIGHT]);
        break;
      case 'selectNearest':
        this.compileNode(node.value, REGISTERS.TEMP_1, instructions);
        instructions.push(['SELECT_NEAREST', targetReg, REGISTERS.TEMP_1, node.options]);
        break;
      default:
        throw new DimensionCompileError(`Unsupported node type`, JSON.stringify(node), DimensionErrorCode.UNSUPPORTED_TYPE);
    }
  }
}

// ─── Dimension Runtime ───────────────────────────────────────────────────────

export class DimensionRuntime {
  private _lastResult: any = null;
  private _lastContext: any = null;
  private _lastInstructions: BytecodeInstruction[] | null = null;

  execute(instructions: BytecodeInstruction[], context: RuntimeBindings): { width: number; height: number; fitMode?: FitMode; anchor?: AnchorMode; snapMode?: SnapMode; aspectRatio?: { numerator: number; denominator: number } } {
    
    // 1. FAST PATH: Check if inputs are identical to last execution
    if (this._lastInstructions === instructions &&
        this._lastContext &&
        Object.is(this._lastContext.viewportWidth, context.viewportWidth) &&
        Object.is(this._lastContext.viewportHeight, context.viewportHeight) &&
        Object.is(this._lastContext.parentWidth, context.parentWidth) &&
        Object.is(this._lastContext.parentHeight, context.parentHeight) &&
        this._lastContext.deviceClass === context.deviceClass &&
        this._lastContext.orientation === context.orientation) {
      return this._lastResult;
    }

    const registers = new Float64Array(16);
    registers[REGISTERS.VIEWPORT_WIDTH] = toFinite(context.viewportWidth);
    registers[REGISTERS.VIEWPORT_HEIGHT] = toFinite(context.viewportHeight);
    registers[REGISTERS.PARENT_WIDTH] = toFinite(context.parentWidth);
    registers[REGISTERS.PARENT_HEIGHT] = toFinite(context.parentHeight);
    const resolvedOrientation = context.orientation || detectOrientation(context.viewportWidth, context.viewportHeight);
    const deviceClassIndex = context.deviceClass ? ['desktop', 'tablet', 'mobile-android', 'mobile-ios'].indexOf(context.deviceClass) : 0;
    const orientationIndex = ['portrait', 'landscape', 'square'].indexOf(resolvedOrientation);
    registers[REGISTERS.DEVICE_CLASS] = deviceClassIndex >= 0 ? deviceClassIndex : 0;
    registers[REGISTERS.ORIENTATION] = orientationIndex >= 0 ? orientationIndex : 0;

    let width = 0;
    let height = 0;
    let fitMode: FitMode | undefined;
    let anchor: AnchorMode | undefined;
    let snapMode: SnapMode | undefined;
    let aspectRatio: { numerator: number; denominator: number } | undefined;

    for (let ip = 0; ip < instructions.length; ip++) {
      const inst = instructions[ip];
      const op = inst[0];
      switch (op) {
        case 'LOAD_CONST':
          registers[inst[1] as number] = inst[2] as number;
          break;
        case 'LOAD_VIEWPORT_WIDTH':
          registers[inst[1] as number] = context.viewportWidth;
          break;
        case 'LOAD_VIEWPORT_HEIGHT':
          registers[inst[1] as number] = context.viewportHeight;
          break;
        case 'LOAD_PARENT_WIDTH':
          registers[inst[1] as number] = context.parentWidth;
          break;
        case 'LOAD_PARENT_HEIGHT':
          registers[inst[1] as number] = context.parentHeight;
          break;
        case 'LOAD_DEVICE_CLASS':
          registers[inst[1] as number] = registers[REGISTERS.DEVICE_CLASS];
          break;
        case 'LOAD_ORIENTATION':
          registers[inst[1] as number] = registers[REGISTERS.ORIENTATION];
          break;
        case 'BRANCH_ORIENTATION_PORTRAIT':
          if (resolvedOrientation === 'portrait' || resolvedOrientation === 'square') {
            ip = Math.max(-1, Math.min(instructions.length - 1, (inst[1] as number) - 1));
          }
          break;
        case 'BRANCH_ORIENTATION_LANDSCAPE':
          if (resolvedOrientation === 'landscape') {
            ip = Math.max(-1, Math.min(instructions.length - 1, (inst[1] as number) - 1));
          }
          break;
        case 'MOVE':
          registers[inst[1] as number] = registers[inst[2] as number];
          break;
        case 'ADD':
          registers[inst[1] as number] = registers[inst[2] as number] + registers[inst[3] as number];
          break;
        case 'SUB':
          registers[inst[1] as number] = registers[inst[2] as number] - registers[inst[3] as number];
          break;
        case 'MUL':
          registers[inst[1] as number] = registers[inst[2] as number] * registers[inst[3] as number];
          break;
        case 'DIV':
          registers[inst[1] as number] = safeDivide(registers[inst[2] as number], registers[inst[3] as number]);
          break;
        case 'MIN':
          registers[inst[1] as number] = Math.min(registers[inst[2] as number], registers[inst[3] as number]);
          break;
        case 'MAX':
          registers[inst[1] as number] = Math.max(registers[inst[2] as number], registers[inst[3] as number]);
          break;
        case 'CLAMP':
          registers[inst[1] as number] = Math.max(registers[inst[3] as number], Math.min(registers[inst[4] as number], registers[inst[2] as number]));
          break;
        case 'CONVERT_UNIT':
          registers[inst[1] as number] = (inst[2] as number) * (inst[3] as number);
          break;
        case 'APPLY_VIEWPORT_UNITS': {
          const viewportDim = inst[3] === REGISTERS.VIEWPORT_WIDTH ? context.viewportWidth : context.viewportHeight;
          registers[inst[1] as number] = safeDivide(inst[2] as number, 100) * viewportDim;
          break;
        }
        case 'APPLY_PARENT_PERCENT':
          registers[inst[1] as number] = safeDivide(inst[2] as number, 100) * context.parentWidth;
          break;
        case 'SELECT_NEAREST': {
          const val = registers[inst[2] as number];
          const options = inst[3] as number[];
          if (!options || options.length === 0) break;
          let nearest = options[0];
          let minDiff = Math.abs(val - nearest);
          for (let i = 1; i < options.length; i++) {
            const diff = Math.abs(val - options[i]);
            if (diff < minDiff) { minDiff = diff; nearest = options[i]; }
          }
          registers[inst[1] as number] = nearest;
          break;
        }
        case 'ROUND':
          registers[inst[1] as number] = Math.round(registers[inst[2] as number]);
          break;
        case 'FLOOR':
          registers[inst[1] as number] = Math.floor(registers[inst[2] as number]);
          break;
        case 'CEIL':
          registers[inst[1] as number] = Math.ceil(registers[inst[2] as number]);
          break;
        case 'SET_WIDTH':
          width = toFinite(registers[inst[1] as number]);
          break;
        case 'SET_HEIGHT':
          height = toFinite(registers[inst[1] as number]);
          break;
        case 'SET_ASPECT':
          aspectRatio = { numerator: inst[1] as number, denominator: inst[2] as number };
          break;
        case 'SET_FIT_MODE':
          fitMode = inst[1] as FitMode;
          break;
        case 'SET_ANCHOR':
          anchor = inst[1] as AnchorMode;
          break;
        case 'SET_SNAP':
          snapMode = inst[1] as SnapMode;
          break;
        case 'SET_DEVICE_CLASS':
          break;
        case 'END': {
          if (snapMode === 'integer' || snapMode === 'pixel') {
            width = Math.round(width);
            height = Math.round(height);
          }
          const result = { width, height, fitMode, anchor, snapMode, aspectRatio };

          // 2. REFERENTIAL STABILITY: If values are identical to last run, return the OLD reference
          if (this._lastResult &&
              Object.is(this._lastResult.width, result.width) &&
              Object.is(this._lastResult.height, result.height) &&
              this._lastResult.fitMode === result.fitMode &&
              this._lastResult.anchor === result.anchor &&
              this._lastResult.snapMode === result.snapMode &&
              this._lastResult.aspectRatio?.numerator === result.aspectRatio?.numerator &&
              this._lastResult.aspectRatio?.denominator === result.aspectRatio?.denominator) {
            this._lastContext = { ...context };
            this._lastInstructions = instructions;
            return this._lastResult;
          }

          this._lastResult = Object.freeze(result);
          this._lastContext = { ...context };
          this._lastInstructions = instructions;
          return this._lastResult;
        }
      }
    }

    return { width, height, fitMode, anchor, snapMode, aspectRatio };
  }
}
