/**
 * COORDINATE SYMMETRY AMP — BYTECODE ERROR CODES
 *
 * Error codes specific to coord-symmetry-amp microprocessor.
 * Follows PB-ERR-v1-{CATEGORY}-{SEVERITY}-{MODULE}-{CODE}-{CONTEXT}-{CHECKSUM} format.
 */

import { BytecodeError, MODULE_IDS as BASE_MODULE_IDS } from './bytecode-error.js';

// ─── Module ID ───────────────────────────────────────────────────────────────

export const MODULE_IDS = {
  ...BASE_MODULE_IDS,
  COORDSYM: 'COORDSYM', // Coordinate Symmetry AMP
};

// ─── Error Codes for COORDSYM Module ─────────────────────────────────────────

export const COORDSYM_ERROR_CODES = Object.freeze({
  // Transform Errors (0x0C01–0x0C0F)
  TRANSFORM_FAILED: 0x0C01,
  INVALID_TRANSFORM_MODE: 0x0C02,
  OVERLAP_RESOLUTION_FAILED: 0x0C03,
  
  // Symmetry Errors (0x0C10–0x0C1F)
  SYMMETRY_TYPE_INVALID: 0x0C10,
  SYMMETRY_AXIS_MISSING: 0x0C11,
  SYMMETRY_NOT_SIGNIFICANT: 0x0C12,
  
  // Grid Snapping Errors (0x0C20–0x0C2F)
  GRID_SNAP_FAILED: 0x0C20,
  CELL_SIZE_INVALID: 0x0C21,
  COORDINATE_SPACE_INVALID: 0x0C22,
  
  // Coordinate Errors (0x0C30–0x0C3F)
  COORDINATE_OUT_OF_BOUNDS: 0x0C30,
  COORDINATE_TRANSFORM_OVERFLOW: 0x0C31,
  COORDINATE_PRECISION_LOST: 0x0C32,
});

// ─── Error Code Metadata ─────────────────────────────────────────────────────

export const COORDSYM_ERROR_METADATA = Object.freeze({
  [COORDSYM_ERROR_CODES.TRANSFORM_FAILED]: {
    category: 'STATE',
    defaultSeverity: 'CRIT',
    description: 'Coordinate symmetry transformation failed',
    recoveryHints: {
      suggestions: [
        'Verify input coordinates are valid',
        'Check symmetry axis is within bounds',
        'Ensure transform mode is supported',
      ],
      invariants: [
        'coordinates.length > 0',
        'symmetry.type is valid enum',
        'dimensions.width > 0 && dimensions.height > 0',
      ],
    },
  },
  [COORDSYM_ERROR_CODES.INVALID_TRANSFORM_MODE]: {
    category: 'VALUE',
    defaultSeverity: 'CRIT',
    description: 'Invalid transform mode specified',
    recoveryHints: {
      suggestions: [
        'Use one of: overlay, replace, canonicalize',
        'Check transformMode spelling',
      ],
      invariants: [
        "['overlay', 'replace', 'canonicalize'].includes(transformMode)",
      ],
    },
  },
  [COORDSYM_ERROR_CODES.OVERLAP_RESOLUTION_FAILED]: {
    category: 'STATE',
    defaultSeverity: 'WARN',
    description: 'Failed to resolve overlapping coordinates',
    recoveryHints: {
      suggestions: [
        'Try different overlapPolicy',
        'Check coordinates for duplicates',
        'Use prefer-original for deterministic results',
      ],
      invariants: [
        "['prefer-original', 'prefer-transformed', 'max-emphasis', 'blend'].includes(overlapPolicy)",
      ],
    },
  },
  [COORDSYM_ERROR_CODES.SYMMETRY_TYPE_INVALID]: {
    category: 'VALUE',
    defaultSeverity: 'CRIT',
    description: 'Invalid symmetry type',
    recoveryHints: {
      suggestions: [
        'Use one of: vertical, horizontal, radial, diagonal',
        'Check symmetry type spelling',
      ],
      invariants: [
        "['vertical', 'horizontal', 'radial', 'diagonal', 'none'].includes(symmetry.type)",
      ],
    },
  },
  [COORDSYM_ERROR_CODES.SYMMETRY_AXIS_MISSING]: {
    category: 'VALUE',
    defaultSeverity: 'CRIT',
    description: 'Symmetry axis not provided or invalid',
    recoveryHints: {
      suggestions: [
        'Provide axis.x for vertical symmetry',
        'Provide axis.y for horizontal symmetry',
        'Provide axis.x and axis.y for radial symmetry',
      ],
      invariants: [
        'symmetry.axis is object',
        'axis.x or axis.y is number',
      ],
    },
  },
  [COORDSYM_ERROR_CODES.GRID_SNAP_FAILED]: {
    category: 'STATE',
    defaultSeverity: 'WARN',
    description: 'Grid snapping operation failed',
    recoveryHints: {
      suggestions: [
        'Check cellSize is positive number',
        'Verify coordinateSpace is pixel or cell',
      ],
      invariants: [
        'cellSize > 0',
        "['pixel', 'cell'].includes(coordinateSpace)",
      ],
    },
  },
  [COORDSYM_ERROR_CODES.COORDINATE_OUT_OF_BOUNDS]: {
    category: 'RANGE',
    defaultSeverity: 'CRIT',
    description: 'Transformed coordinate outside canvas bounds',
    recoveryHints: {
      suggestions: [
        'Check symmetry axis is centered',
        'Verify input coordinates are within bounds',
        'Use canonicalize mode for bounded output',
      ],
      invariants: [
        'coord.x >= 0 && coord.x <= dimensions.width',
        'coord.y >= 0 && coord.y <= dimensions.height',
      ],
    },
  },
});

// ─── Error Factory Functions ─────────────────────────────────────────────────

/**
 * Create transform failed error
 */
export function createTransformError(reason, context = {}) {
  return new BytecodeError(
    'STATE',
    'CRIT',
    'COORDSYM',
    COORDSYM_ERROR_CODES.TRANSFORM_FAILED,
    { reason, ...context }
  );
}

/**
 * Create invalid transform mode error
 */
export function createInvalidTransformModeError(mode, context = {}) {
  return new BytecodeError(
    'VALUE',
    'CRIT',
    'COORDSYM',
    COORDSYM_ERROR_CODES.INVALID_TRANSFORM_MODE,
    { providedMode: mode, allowedModes: ['overlay', 'replace', 'canonicalize'], ...context }
  );
}

/**
 * Create symmetry type invalid error
 */
export function createInvalidSymmetryTypeError(type, context = {}) {
  return new BytecodeError(
    'VALUE',
    'CRIT',
    'COORDSYM',
    COORDSYM_ERROR_CODES.SYMMETRY_TYPE_INVALID,
    { providedType: type, allowedTypes: ['vertical', 'horizontal', 'radial', 'diagonal', 'none'], ...context }
  );
}

/**
 * Create symmetry axis missing error
 */
export function createSymmetryAxisMissingError(symmetryType, context = {}) {
  return new BytecodeError(
    'VALUE',
    'CRIT',
    'COORDSYM',
    COORDSYM_ERROR_CODES.SYMMETRY_AXIS_MISSING,
    { symmetryType, requiredAxis: symmetryType === 'vertical' ? 'x' : 'y', ...context }
  );
}

/**
 * Create coordinate out of bounds error
 */
export function createCoordinateOutOfBoundsError(coord, bounds, context = {}) {
  return new BytecodeError(
    'RANGE',
    'CRIT',
    'COORDSYM',
    COORDSYM_ERROR_CODES.COORDINATE_OUT_OF_BOUNDS,
    { coordinate: coord, bounds, ...context }
  );
}

/**
 * Create grid snap failed error
 */
export function createGridSnapFailedError(reason, context = {}) {
  return new BytecodeError(
    'STATE',
    'WARN',
    'COORDSYM',
    COORDSYM_ERROR_CODES.GRID_SNAP_FAILED,
    { reason, ...context }
  );
}
