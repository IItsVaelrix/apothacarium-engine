/**
 * IMAGE-TO-BYTECODE FORMULA ENGINE
 *
 * Converts image analysis into mathematical bytecode formulas.
 * Extracts parametric curves, grid patterns, and color mappings
 * that can be edited manually for infinite asset generation.
 */

import { clamp01, GOLDEN_RATIO, roundTo } from './shared.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from './bytecode-error.js';

/**
 * Formula types supported by the system
 */
export const FORMULA_TYPES = Object.freeze({
  PARAMETRIC_CURVE: 'parametric_curve',
  GRID_PROJECTION: 'grid_projection',
  EDGE_TRACE: 'edge_trace',
  FRACTAL_ITER: 'fractal_iter',
  TEMPLATE_BASED: 'template_based',
});

/**
 * Grid types for template system
 */
export const GRID_TYPES = Object.freeze({
  RECTANGULAR: 'rectangular',
  ISOMETRIC: 'isometric',
  HEXAGONAL: 'hexagonal',
  FIBONACCI: 'fibonacci',
});

/**
 * Color formula types
 */
export const COLOR_FORMULA_TYPES = Object.freeze({
  PALETTE_INDEXED: 'palette_indexed',
  GRADIENT_MAPPED: 'gradient_mapped',
  BRIGHTNESS_QUANTIZED: 'brightness_quantized',
});

function createFormulaInputError(reason, context = {}) {
  return new BytecodeError(
    ERROR_CATEGORIES.FORMULA,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMG_FORMULA,
    ERROR_CODES.FORMULA_INVALID_SYNTAX,
    { reason, ...context }
  );
}

function normalizeImageAnalysis(imageAnalysis) {
  if (!imageAnalysis || typeof imageAnalysis !== 'object') {
    throw createFormulaInputError('imageAnalysis must be an object');
  }

  const dimensions = imageAnalysis.dimensions || {};
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw createFormulaInputError('imageAnalysis.dimensions must contain positive width and height', { dimensions });
  }

  const { pixelData } = imageAnalysis;
  if (!pixelData || typeof pixelData.length !== 'number') {
    throw createFormulaInputError('imageAnalysis.pixelData must be an array-like RGBA buffer');
  }

  const expectedByteLength = width * height * 4;
  if (pixelData.length < expectedByteLength) {
    throw createFormulaInputError('imageAnalysis.pixelData is shorter than dimensions require', {
      expectedByteLength,
      actualByteLength: pixelData.length,
    });
  }

  return {
    pixelData,
    dimensions: { width, height },
    colors: Array.isArray(imageAnalysis.colors) ? imageAnalysis.colors : [],
    composition: imageAnalysis.composition || {},
  };
}

/**
 * Analyze image and extract bytecode formula
 * @param {Object} imageAnalysis - Image analysis results
 * @returns {Object} Bytecode formula
 */
export function analyzeImageToFormula(imageAnalysis) {
  const { pixelData, dimensions, colors, composition } = normalizeImageAnalysis(imageAnalysis);
  const { width, height } = dimensions;

  // Extract edge points
  const edgePoints = extractEdgePoints(pixelData, width, height);

  // Detect dominant pattern type
  const patternType = detectPatternType(edgePoints, composition);

  // Generate formula based on pattern type
  let coordinateFormula;
  switch (patternType) {
    case FORMULA_TYPES.PARAMETRIC_CURVE:
      coordinateFormula = fitParametricCurve(edgePoints);
      break;
    case FORMULA_TYPES.GRID_PROJECTION:
      coordinateFormula = detectGridPattern(edgePoints, width, height);
      break;
    case FORMULA_TYPES.EDGE_TRACE:
      coordinateFormula = createEdgeTraceFormula(edgePoints);
      break;
    default:
      coordinateFormula = fitParametricCurve(edgePoints);
  }

  // Generate color formula
  const colorFormula = quantizeColorsToFormula(colors, composition);

  // Generate template for manual editing
  const template = generateTemplateFromFormula(coordinateFormula, dimensions);

  // Generate idle animation config
  const idleAnimation = generateIdleAnimationConfig(patternType, composition);

  // Create formula hash for bytecode
  const formulaHash = hashFormula(coordinateFormula, colorFormula);

  return {
    version: 1,
    formulaType: coordinateFormula.type,
    sourceImage: {
      hash: formulaHash,
      dimensions: { width, height },
      aspectRatio: width / height,
    },
    coordinateFormula,
    colorFormula,
    template,
    idleAnimation,
  };
}

/**
 * Extract edge points from image using Sobel-like gradient
 */
export function extractEdgePoints(pixelData, width, height) {
  const edgePoints = [];
  const threshold = 30;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Skip transparent pixels
      if (pixelData[idx + 3] < 128) continue;

      // Compute gradient magnitude
      const leftIdx = (y * width + (x - 1)) * 4;
      const rightIdx = (y * width + (x + 1)) * 4;
      const topIdx = ((y - 1) * width + x) * 4;
      const bottomIdx = ((y + 1) * width + x) * 4;

      const gx = Math.abs(pixelData[rightIdx] - pixelData[leftIdx]) +
                 Math.abs(pixelData[rightIdx + 1] - pixelData[leftIdx + 1]) +
                 Math.abs(pixelData[rightIdx + 2] - pixelData[leftIdx + 2]);

      const gy = Math.abs(pixelData[bottomIdx] - pixelData[topIdx]) +
                 Math.abs(pixelData[bottomIdx + 1] - pixelData[topIdx + 1]) +
                 Math.abs(pixelData[bottomIdx + 2] - pixelData[topIdx + 2]);

      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude > threshold) {
        edgePoints.push({
          x,
          y,
          magnitude,
          r: pixelData[idx],
          g: pixelData[idx + 1],
          b: pixelData[idx + 2],
        });
      }
    }
  }

  return edgePoints;
}

/**
 * Detect dominant pattern type from edge points
 */
function detectPatternType(edgePoints, composition) {
  const safeComposition = composition || {};
  if (edgePoints.length === 0) {
    return FORMULA_TYPES.GRID_PROJECTION;
  }

  // Check for circular/spiral pattern
  const circularity = assessCircularity(edgePoints);
  if (circularity > 0.7) {
    return FORMULA_TYPES.PARAMETRIC_CURVE;
  }

  // Check for grid-like structure
  if ((Number(safeComposition.edgeDensity) || 0) > 0.15 && safeComposition.hasSymmetry) {
    return FORMULA_TYPES.GRID_PROJECTION;
  }

  // Default to edge tracing for complex shapes
  return FORMULA_TYPES.EDGE_TRACE;
}

/**
 * Assess how circular a set of points is
 */
function assessCircularity(points) {
  if (points.length < 5) return 0;

  // Compute centroid
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  // Compute distances from centroid
  const distances = points.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
  const meanDist = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const stdDist = Math.sqrt(
    distances.reduce((sum, d) => sum + (d - meanDist) ** 2, 0) / distances.length
  );

  // Low standard deviation = circular
  const coefficientOfVariation = stdDist / meanDist;
  return clamp01(1 - coefficientOfVariation);
}

/**
 * Fit parametric curve to edge points using least squares
 * x = a·cos(b·t + c)
 * y = a·sin(b·t + c)
 */
export function fitParametricCurve(points) {
  if (points.length === 0) {
    return createDefaultParametricFormula();
  }

  // Compute raw centroid
  const rawCx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const rawCy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  // 1. Centering Bias (Pull towards alchemical core: 80, 72)
  const bias = 0.4; // 40% centering force
  const cx = rawCx * (1 - bias) + 80 * bias;
  const cy = rawCy * (1 - bias) + 72 * bias;

  // Compute average radius
  const avgRadius = points.reduce((sum, p) => {
    return sum + Math.sqrt((p.x - rawCx) ** 2 + (p.y - rawCy) ** 2);
  }, 0) / points.length;

  // 2. Scale Normalization (Prevent 'Small Orb' failure)
  // Ensure 'a' is at least a reasonable portion of the canvas (min 24px)
  const a = Math.max(24, avgRadius * (avgRadius < 15 ? 4 : 1));
  
  const b = 2 * Math.PI / points.length; // One full rotation
  const c = 0; // Initial phase

  return {
    type: FORMULA_TYPES.PARAMETRIC_CURVE,
    parameters: {
      cx: roundTo(cx, 2),
      cy: roundTo(cy, 2),
      a: roundTo(a, 2),
      b: roundTo(b, 4),
      c: roundTo(c, 4),
      n: points.length,
    },
  };
}

/**
 * Create default parametric formula
 */
function createDefaultParametricFormula() {
  return {
    type: FORMULA_TYPES.PARAMETRIC_CURVE,
    parameters: {
      cx: 80,
      cy: 72,
      a: 50,
      b: 0.1,
      c: 0,
      n: 64,
    },
  };
}

/**
 * Detect grid pattern from edge points
 */
export function detectGridPattern(points, imageWidth, imageHeight) {
  if (points.length === 0) {
    return createDefaultGridFormula();
  }

  // Analyze x and y distributions to find grid spacing
  const xCoords = points.map(p => p.x).sort((a, b) => a - b);
  const yCoords = points.map(p => p.y).sort((a, b) => a - b);

  // Find common gaps (grid cell size)
  const xGaps = findCommonGaps(xCoords);
  const yGaps = findCommonGaps(yCoords);

  const cellSize = Math.round((xGaps + yGaps) / 2);
  const safeCellSize = Math.max(4, Math.min(32, cellSize));

  // Determine grid type
  const gridType = detectGridType(points, safeCellSize);

  return {
    type: FORMULA_TYPES.GRID_PROJECTION,
    gridType,
    cellSize: safeCellSize,
    snapStrength: 0.85,
    gridWidth: imageWidth,
    gridHeight: imageHeight,
  };
}

/**
 * Find common gaps in sorted coordinates
 */
function findCommonGaps(sortedCoords) {
  if (sortedCoords.length < 2) return 8;

  const gaps = [];
  for (let i = 1; i < sortedCoords.length; i++) {
    const gap = sortedCoords[i] - sortedCoords[i - 1];
    if (gap > 0 && gap < 50) { // Reasonable gap size
      gaps.push(gap);
    }
  }

  if (gaps.length === 0) return 8;

  // Return median gap
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Detect grid type (rectangular, isometric, hexagonal)
 */
function detectGridType(points, _cellSize) {
  // Simple heuristic: check angle distribution
  if (points.length < 3) return GRID_TYPES.RECTANGULAR;

  let angleSum = 0;
  let count = 0;

  for (let i = 0; i < Math.min(points.length, 20); i++) {
    for (let j = i + 1; j < Math.min(points.length, 20); j++) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      // Check for 60-degree angles (hexagonal)
      if (Math.abs(Math.abs(angle) - 60) < 15 || Math.abs(Math.abs(angle) - 120) < 15) {
        angleSum += 1;
      }
      count++;
    }
  }

  const hexScore = angleSum / count;
  if (hexScore > 0.3) return GRID_TYPES.HEXAGONAL;

  // Check for 30-degree angles (isometric)
  let isoScore = 0;
  for (let i = 0; i < Math.min(points.length, 20); i++) {
    for (let j = i + 1; j < Math.min(points.length, 20); j++) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

      if (Math.abs(angle - 30) < 15 || Math.abs(angle - 150) < 15) {
        isoScore++;
      }
    }
  }

  if (isoScore / count > 0.2) return GRID_TYPES.ISOMETRIC;

  return GRID_TYPES.RECTANGULAR;
}

/**
 * Create default grid formula
 */
function createDefaultGridFormula() {
  return {
    type: FORMULA_TYPES.GRID_PROJECTION,
    gridType: GRID_TYPES.RECTANGULAR,
    cellSize: 8,
    snapStrength: 0.85,
    gridWidth: 160,
    gridHeight: 144,
  };
}

/**
 * Create edge trace formula
 */
function createEdgeTraceFormula(points) {
  if (points.length === 0) {
    return {
      type: FORMULA_TYPES.EDGE_TRACE,
      tracePath: [],
      smoothness: 0.5,
    };
  }

  // Sort points by proximity to create continuous path
  const sorted = sortPointsByProximity(points);

  // Simplify path (reduce points while preserving shape)
  const simplified = simplifyPath(sorted, 2.0);

  return {
    type: FORMULA_TYPES.EDGE_TRACE,
    tracePath: simplified.map(p => ({
      x: roundTo(p.x, 1),
      y: roundTo(p.y, 1),
    })),
    smoothness: 0.5,
  };
}

/**
 * Sort points by proximity (nearest neighbor)
 */
function sortPointsByProximity(points) {
  if (points.length === 0) return [];

  const result = [points[0]];
  const remaining = new Set(points.slice(1));

  while (remaining.size > 0) {
    const last = result[result.length - 1];
    let nearest = null;
    let nearestDist = Infinity;

    for (const point of remaining) {
      const dist = Math.sqrt((point.x - last.x) ** 2 + (point.y - last.y) ** 2);
      if (dist < nearestDist) {
        nearest = point;
        nearestDist = dist;
      }
    }

    if (nearest) {
      result.push(nearest);
      remaining.delete(nearest);
    }
  }

  return result;
}

/**
 * Simplify path using Ramer-Douglas-Peucker algorithm
 */
function simplifyPath(points, epsilon) {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line
  let maxDist = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPath(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  } else {
    return [start, end];
  }
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLengthSq = dx * dx + dy * dy;

  if (lineLengthSq === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  const t = Math.max(0, Math.min(1,
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq
  ));

  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/**
 * Quantize colors to formula
 */
export function quantizeColorsToFormula(colors, composition) {
  const safeComposition = composition || {};
  if (!colors || colors.length === 0) {
    return {
      type: COLOR_FORMULA_TYPES.BRIGHTNESS_QUANTIZED,
      brightnessLevels: 4,
      ditherPattern: 'bayer4x4',
    };
  }

  // Determine color formula type based on color count
  const colorCount = Math.min(colors.length, 16);

  if (colorCount <= 4) {
    // Limited colors = palette indexed
    return {
      type: COLOR_FORMULA_TYPES.PALETTE_INDEXED,
      paletteKey: generatePaletteKey(colors),
      paletteSize: colorCount,
      ditherPattern: 'none',
    };
  } else if ((Number(safeComposition.contrastNormalized) || 0) > 0.6) {
    // High contrast = gradient mapped
    return {
      type: COLOR_FORMULA_TYPES.GRADIENT_MAPPED,
      gradientStops: colors.slice(0, 8).map(c => c.hex),
      ditherPattern: 'floyd-steinberg',
    };
  } else {
    // Default = brightness quantized
    return {
      type: COLOR_FORMULA_TYPES.BRIGHTNESS_QUANTIZED,
      brightnessLevels: Math.min(8, colorCount),
      ditherPattern: 'bayer4x4',
    };
  }
}

/**
 * Generate palette key from colors
 */
function generatePaletteKey(colors) {
  const hex = colors.slice(0, 4).map(c => c.hex.replace('#', '')).join('');
  return `pal_${hex.substring(0, 8)}`;
}

/**
 * Generate template for manual editing
 */
export function generateTemplateFromFormula(formula, dimensions) {
  const { width, height } = dimensions;

  // Determine optimal cell size based on image dimensions
  const targetCells = 20; // Target ~20 cells on longest side
  const maxDim = Math.max(width, height);
  const cellSize = Math.pow(2, Math.round(Math.log2(maxDim / targetCells)));
  const safeCellSize = Math.max(4, Math.min(32, cellSize));

  // Calculate grid dimensions
  const gridWidth = Math.ceil(width / safeCellSize) * safeCellSize;
  const gridHeight = Math.ceil(height / safeCellSize) * safeCellSize;

  // Generate anchor points (corners + center + golden ratio point)
  const anchorPoints = [
    { x: 0, y: 0, label: 'topLeft', locked: false },
    { x: gridWidth, y: 0, label: 'topRight', locked: false },
    { x: 0, y: gridHeight, label: 'bottomLeft', locked: false },
    { x: gridWidth, y: gridHeight, label: 'bottomRight', locked: false },
    { x: gridWidth / 2, y: gridHeight / 2, label: 'center', locked: true },
    {
      x: gridWidth * (1 - 1 / GOLDEN_RATIO),
      y: gridHeight * (1 - 1 / GOLDEN_RATIO),
      label: 'goldenPoint',
      locked: true,
    },
  ];

  // Determine symmetry axes
  const symmetryAxes = [];

  return {
    gridWidth,
    gridHeight,
    cellSize: safeCellSize,
    anchorPoints,
    symmetryAxes,
    snapStrength: 0.85,
  };
}

/**
 * Generate idle animation config for gear-glide
 */
export function generateIdleAnimationConfig(formulaType, composition) {
  const baseSpeed = formulaType === FORMULA_TYPES.PARAMETRIC_CURVE ? 0.5 : 0.3;
  const complexity = Number(composition?.complexity) || 0.5;
  const wobbleAmount = complexity > 0.6 ? 0.03 : 0.02;

  return {
    type: 'gear_glide',
    baseSpeed,
    wobbleAmount,
    torqueAmount: 0.01,
    phaseOffset: 0,
  };
}

/**
 * Hash formula for bytecode generation
 */
function hashFormula(coordinateFormula, colorFormula) {
  const coordStr = JSON.stringify(coordinateFormula);
  const colorStr = JSON.stringify(colorFormula);

  // Simple hash for identification
  let hash = 0;
  const combined = coordStr + colorStr;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Parse bytecode string back into a formula object
 * @param {string} bytecode - Bytecode string
 * @returns {Object} Formula object
 */
export function parseBytecodeToFormula(bytecode) {
  if (!bytecode || !bytecode.startsWith('0xF')) {
    throw new BytecodeError(
      ERROR_CATEGORIES.FORMULA, ERROR_SEVERITY.CRIT, MODULE_IDS.IMG_FORMULA,
      ERROR_CODES.FORMULA_PARSE_FAIL,
      { reason: 'invalid bytecode signature', expectedPrefix: '0xF', actual: bytecode ? bytecode.substring(0, 3) : 'empty' },
    );
  }

  try {
    const parts = bytecode.split('_');
    const typeCode = bytecode.charAt(3);
    const gridPart = parts[1] || '16x16';
    const palPart  = parts[2] || '4c';
    const ditherPart = parts[3] || 'd0';
    const speedPart = parts[4] || 'gg3';
    
    // Map type code back to formula type
    const typeMap = {
      'P': FORMULA_TYPES.PARAMETRIC_CURVE,
      'G': FORMULA_TYPES.GRID_PROJECTION,
      'E': FORMULA_TYPES.EDGE_TRACE,
      'F': FORMULA_TYPES.FRACTAL_ITER,
      'T': FORMULA_TYPES.TEMPLATE_BASED,
    };

    const type = typeMap[typeCode] || FORMULA_TYPES.PARAMETRIC_CURVE;
    const [w, h] = gridPart.split('x').map(n => parseInt(n));
    const palSize = parseInt(palPart);
    const ditherCode = ditherPart.replace('d', '');
    const speed = parseInt(speedPart.replace('gg', '')) / 10;

    const ditherMap = {
      '0': 'none',
      '1': 'bayer4x4',
      '2': 'floyd-steinberg',
    };

    return {
      version: 1,
      formulaType: type,
      coordinateFormula: {
        type: type,
        cellSize: w || 8,
        gridType: type === FORMULA_TYPES.GRID_PROJECTION ? GRID_TYPES.RECTANGULAR : undefined,
        parameters: type === FORMULA_TYPES.PARAMETRIC_CURVE ? { n: 64, a: w || 40, b: 0.1, cx: 80, cy: 72 } : {}
      },
      template: {
        gridWidth: w || 160,
        gridHeight: h || 144,
        cellSize: w || 8,
        anchorPoints: [],
        symmetryAxes: [],
        snapStrength: 0.85,
      },
      colorFormula: {
        type: palSize <= 4 ? COLOR_FORMULA_TYPES.PALETTE_INDEXED : COLOR_FORMULA_TYPES.BRIGHTNESS_QUANTIZED,
        paletteSize: palSize || 4,
        brightnessLevels: palSize || 4,
        ditherPattern: ditherMap[ditherCode] || 'none'
      },
      idleAnimation: {
        type: 'gear_glide',
        baseSpeed: speed || 0.3,
        wobbleAmount: 0.02,
        torqueAmount: 0.01,
        phaseOffset: 0,
      }
    };
  } catch (e) {
    throw new BytecodeError(
      ERROR_CATEGORIES.FORMULA, ERROR_SEVERITY.CRIT, MODULE_IDS.IMG_FORMULA,
      ERROR_CODES.FORMULA_EVAL_FAIL,
      { reason: 'bytecode parsing failed', originalError: e.message },
    );
  }
}

/**
 * Create bytecode string from formula
 */
export function formulaToBytecode(formula) {
  if (!formula) return '0xFX_16x16_4c_d0_gg3';

  const { formulaType, coordinateFormula, colorFormula, idleAnimation } = formula;

  // Formula type code
  const typeCode = {
    [FORMULA_TYPES.PARAMETRIC_CURVE]: 'P',
    [FORMULA_TYPES.GRID_PROJECTION]: 'G',
    [FORMULA_TYPES.EDGE_TRACE]: 'E',
    [FORMULA_TYPES.FRACTAL_ITER]: 'F',
    [FORMULA_TYPES.TEMPLATE_BASED]: 'T',
  }[formulaType || ''] || 'X';

  // Grid/cell size
  const gridSize = coordinateFormula?.cellSize ||
                   (coordinateFormula?.parameters?.a ? Math.round(coordinateFormula.parameters.a) : 8);

  // Palette size
  const palSize = colorFormula?.paletteSize ||
                  colorFormula?.brightnessLevels ||
                  colorFormula?.gradientStops?.length || 4;

  // Dither method code
  const ditherCode = {
    'none': '0',
    'bayer4x4': '1',
    'floyd-steinberg': '2',
  }[colorFormula?.ditherPattern || 'none'] || '0';

  // Gear-glide speed
  const ggSpeed = Math.round((idleAnimation?.baseSpeed || 0.3) * 10);

  // Build bytecode string
  return `0xF${typeCode}_${gridSize}x${gridSize}_${palSize}c_d${ditherCode}_gg${ggSpeed}`;
}
