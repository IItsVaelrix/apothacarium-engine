/**
 * FORMULA-TO-COORDINATES BRIDGE
 *
 * Evaluates mathematical formulas to generate coordinate systems.
 * Supports parametric curves, grid projections, edge traces, and fractals.
 */

import { clamp01, GOLDEN_RATIO, roundTo } from './shared.js';
import {
  FORMULA_TYPES,
  GRID_TYPES,
  COLOR_FORMULA_TYPES,
} from './image-to-bytecode-formula.js';
import { getRotationAtTime } from './gear-glide-amp.js';

const MAX_FRACTAL_ITERATIONS = 6;

/**
 * Evaluate formula and generate coordinates
 * @param {Object} formula - Bytecode formula
 * @param {Object} canvasSize - Canvas dimensions
 * @param {number} time - Time in ms for animation
 * @returns {Array} Coordinate objects
 */
export function evaluateFormula(formula, canvasSize, time = 0) {
  if (!formula || !canvasSize) {
    return [];
  }

  const { coordinateFormula, template } = formula;

  if (!coordinateFormula) {
    return [];
  }

  let coordinates = [];

  switch (coordinateFormula.type) {
    case FORMULA_TYPES.PARAMETRIC_CURVE:
      coordinates = evaluateParametricCurve(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.GRID_PROJECTION:
      coordinates = evaluateGridProjection(coordinateFormula, canvasSize, time);
      break;
    case 'fibonacci':
      coordinates = evaluateFibonacciGrid(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.EDGE_TRACE:
      coordinates = evaluateEdgeTrace(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.FRACTAL_ITER:
      coordinates = evaluateFractalIteration(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.TEMPLATE_BASED:
      coordinates = evaluateTemplateBased(coordinateFormula, template, canvasSize, time);
      break;
    default:
      coordinates = evaluateParametricCurve(createDefaultParametric(), canvasSize, time);
  }

  // Apply template constraints if available
  if (template) {
    coordinates = applyTemplateConstraints(coordinates, template, canvasSize);
  }

  return coordinates;
}

/**
 * Evaluate Fibonacci subdivision grid
 */
export function evaluateFibonacciGrid(formula, canvasSize, _time = 0) {
  const { iterations = 6, scale = 1 } = formula.parameters || formula;
  const coordinates = [];
  
  let x = 0, y = 0, w = canvasSize.width * scale, h = canvasSize.height * scale;
  let side = 0;

  for (let i = 0; i < iterations; i++) {
    const size = side % 2 === 0 ? w / GOLDEN_RATIO : h / GOLDEN_RATIO;
    
    // Add points along the subdivision lines
    const segments = 12;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      let px, py;
      
      if (side === 0) { px = x + size; py = y + t * h; }
      else if (side === 1) { px = x + t * w; py = y + size; }
      else if (side === 2) { px = x + w - size; py = y + t * h; }
      else { px = x + t * w; py = y + h - size; }
      
      coordinates.push({
        x: roundTo(px, 1),
        y: roundTo(py, 1),
        z: i,
        emphasis: clamp01(1 - i / iterations),
        source: 'fibonacci',
      });
    }

    if (side === 0) { x += size; w -= size; }
    else if (side === 1) { y += size; h -= size; }
    else if (side === 2) { w -= size; }
    else { h -= size; }
    side = (side + 1) % 4;
  }

  return coordinates;
}

/**
 * Evaluate parametric curve formula
 * x = cx + a·cos(b·t + c)
 * y = cy + a·sin(b·t + c)
 */
export function evaluateParametricCurve(formula, canvasSize, time = 0) {
  const { parameters } = formula;
  const {
    cx = canvasSize.width / 2,
    cy = canvasSize.height / 2,
    a = 50,
    b: _b = 0.1,
    c = 0,
    n = 64,
  } = parameters || {};

  const bpm = 90;
  const rotation = getRotationAtTime(time, bpm, 90);

  const coordinates = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rotation + c;
    const x = cx + a * Math.cos(t);
    const y = cy + a * Math.sin(t);

    coordinates.push({
      x: roundTo(x, 1),
      y: roundTo(y, 1),
      z: 0,
      emphasis: clamp01(0.5 + 0.5 * Math.sin(t * 3)),
      source: 'parametric',
      t: i / n,
    });
  }

  return coordinates;
}

/**
 * Evaluate grid projection formula
 */
export function evaluateGridProjection(formula, canvasSize, time = 0) {
  const {
    gridType = GRID_TYPES.RECTANGULAR,
    cellSize = 8,
    snapStrength = 0.85,
    gridWidth = canvasSize.width,
    gridHeight = canvasSize.height,
  } = formula;

  const coordinates = [];
  const safeCellSize = Math.max(4, Math.min(32, cellSize));

  const bpm = 90;
  const rotation = getRotationAtTime(time, bpm, 10);
  const wobble = Math.sin(rotation) * (1 - snapStrength) * safeCellSize * 0.5;

  switch (gridType) {
    case GRID_TYPES.RECTANGULAR:
      for (let x = 0; x < gridWidth; x += safeCellSize) {
        for (let y = 0; y < gridHeight; y += safeCellSize) {
          coordinates.push({
            x: roundTo(x + wobble, 1),
            y: roundTo(y + wobble, 1),
            z: 0,
            emphasis: clamp01(0.3 + 0.7 * Math.sin((x + y) * 0.05)),
            source: 'grid_rect',
            gridCell: { col: Math.round(x / safeCellSize), row: Math.round(y / safeCellSize) },
          });
        }
      }
      break;

    case GRID_TYPES.HEXAGONAL: {
      const hexHeight = safeCellSize * Math.sqrt(3) / 2;
      let hexRow = 0;
      for (let y = 0; y < gridHeight; y += hexHeight) {
        const xOffset = (hexRow % 2) * safeCellSize / 2;
        for (let x = xOffset; x < gridWidth; x += safeCellSize) {
          coordinates.push({
            x: roundTo(x + wobble, 1),
            y: roundTo(y + wobble, 1),
            z: 0,
            emphasis: clamp01(0.3 + 0.7 * Math.sin((x + y) * 0.05)),
            source: 'grid_hex',
            gridCell: { col: Math.round(x / safeCellSize), row: hexRow },
          });
        }
        hexRow++;
      }
      break;
    }

    case GRID_TYPES.ISOMETRIC: {
      const isoStep = safeCellSize / Math.sqrt(2);
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const x = (i - j) * isoStep + gridWidth / 2 + wobble;
          const y = (i + j) * isoStep * 0.5 + gridHeight / 2 + wobble;

          if (x >= 0 && x <= gridWidth && y >= 0 && y <= gridHeight) {
            coordinates.push({
              x: roundTo(x, 1),
              y: roundTo(y, 1),
              z: 0,
              emphasis: clamp01(0.3 + 0.7 * Math.sin((i + j) * 0.1)),
              source: 'grid_iso',
              gridCell: { col: i, row: j },
            });
          }
        }
      }
      break;
    }
  }

  return coordinates;
}

/**
 * Evaluate edge trace formula
 */
export function evaluateEdgeTrace(formula, canvasSize, _time = 0) {
  const { tracePath = [] } = formula;
  if (tracePath.length === 0) return [];

  const totalPoints = tracePath.length;
  const _speed = 0.02;

  return tracePath.map((p, index) => ({
    x: roundTo(p.x, 1),
    y: roundTo(p.y, 1),
    z: 0,
    emphasis: clamp01(index / totalPoints),
    source: 'edge_trace',
    pathIndex: index,
  }));
}

/**
 * Evaluate fractal iteration formula
 */
export function evaluateFractalIteration(formula, canvasSize, time = 0) {
  const {
    iterations: requestedIterations = 4,
    baseShape = 'triangle',
    scale = 1,
    cx = canvasSize.width / 2,
    cy = canvasSize.height / 2,
  } = formula;

  const numericIterations = Number(requestedIterations);
  const iterations = Math.min(
    MAX_FRACTAL_ITERATIONS,
    Math.max(0, Number.isFinite(numericIterations) ? Math.floor(numericIterations) : 4)
  );
  const coordinates = [];

  function generateFractal(x, y, size, depth) {
    if (depth === 0) {
      coordinates.push({
        x: roundTo(x, 1),
        y: roundTo(y, 1),
        z: depth,
        emphasis: iterations === 0 ? 1 : clamp01(1 - depth / iterations),
        source: 'fractal',
        depth,
      });
      return;
    }

    const newSize = size / 2;
    const newDepth = depth - 1;

    if (baseShape === 'triangle') {
      generateFractal(x, y - newSize / 2, newSize, newDepth);
      generateFractal(x - newSize / 2, y + newSize / 2, newSize, newDepth);
      generateFractal(x + newSize / 2, y + newSize / 2, newSize, newDepth);
    } else if (baseShape === 'square') {
      generateFractal(x - newSize / 2, y - newSize / 2, newSize, newDepth);
      generateFractal(x + newSize / 2, y - newSize / 2, newSize, newDepth);
      generateFractal(x - newSize / 2, y + newSize / 2, newSize, newDepth);
      generateFractal(x + newSize / 2, y + newSize / 2, newSize, newDepth);
    } else if (baseShape === 'circle') {
      const angle = (time * 0.001 + depth) * Math.PI / Math.max(1, iterations);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + angle;
        generateFractal(x + Math.cos(a) * newSize / 2, y + Math.sin(a) * newSize / 2, newSize, newDepth);
      }
    }
  }

  const initialSize = Math.min(canvasSize.width, canvasSize.height) * scale;
  generateFractal(cx, cy, initialSize, iterations);

  return coordinates;
}

/**
 * Evaluate template-based formula
 */
export function evaluateTemplateBased(formula, template, canvasSize, _time = 0) {
  const { anchorPoints = [], symmetryAxes = [] } = template || {};
  const coordinates = anchorPoints.map((anchor, index) => ({
    x: roundTo(anchor.x, 1),
    y: roundTo(anchor.y, 1),
    z: 0,
    emphasis: anchor.locked ? 1 : 0.5,
    source: 'template_anchor',
    label: anchor.label,
    anchorIndex: index,
  }));

  if (symmetryAxes.includes('vertical')) {
    coordinates.push(...coordinates.map(c => ({ ...c, x: canvasSize.width - c.x, source: 'mirror_v' })));
  }
  if (symmetryAxes.includes('horizontal')) {
    coordinates.push(...coordinates.map(c => ({ ...c, y: canvasSize.height - c.y, source: 'mirror_h' })));
  }

  return coordinates;
}

/**
 * Apply template constraints
 */
export function applyTemplateConstraints(coordinates, template, canvasSize) {
  const { gridWidth, gridHeight, cellSize, anchorPoints = [], snapStrength = 0.85 } = template;
  const anchorMap = new Map();
  anchorPoints.forEach(anchor => {
    const key = `${Math.round(anchor.x / cellSize)},${Math.round(anchor.y / cellSize)}`;
    anchorMap.set(key, anchor);
  });

  return coordinates.map(coord => {
    let { x, y } = coord;
    const gridX = Math.round(x / cellSize) * cellSize;
    const gridY = Math.round(y / cellSize) * cellSize;
    x = x + (gridX - x) * snapStrength;
    y = y + (gridY - y) * snapStrength;

    const anchorKey = `${Math.round(x / cellSize)},${Math.round(y / cellSize)}`;
    const anchor = anchorMap.get(anchorKey);
    if (anchor && anchor.locked) { x = anchor.x; y = anchor.y; }

    x = clamp01(x / (gridWidth || canvasSize.width)) * (gridWidth || canvasSize.width);
    y = clamp01(y / (gridHeight || canvasSize.height)) * (gridHeight || canvasSize.height);

    return { ...coord, x: roundTo(x, 1), y: roundTo(y, 1), snappedX: Math.round(x), snappedY: Math.round(y) };
  });
}

/**
 * Utility functions for color mapping
 */
export function evaluateFormulaWithColor(formula, canvasSize, time = 0) {
  const coordinates = evaluateFormula(formula, canvasSize, time);
  const { colorFormula } = formula || {};
  if (!colorFormula) return coordinates.map(c => ({ ...c, color: '#808080' }));

  switch (colorFormula.type) {
    case COLOR_FORMULA_TYPES.PALETTE_INDEXED: return mapCoordinatesToPalette(coordinates, colorFormula);
    case COLOR_FORMULA_TYPES.GRADIENT_MAPPED: return mapCoordinatesToGradient(coordinates, colorFormula);
    case COLOR_FORMULA_TYPES.BRIGHTNESS_QUANTIZED: return mapCoordinatesToBrightness(coordinates, colorFormula);
    default: return coordinates.map(c => ({ ...c, color: '#808080' }));
  }
}

function mapCoordinatesToPalette(coordinates, colorFormula) {
  const { paletteKey, paletteSize = 4 } = colorFormula;
  const baseHue = parseInt(paletteKey?.substring(4, 6) || '80', 16) * 16;
  return coordinates.map(coord => {
    const colorIndex = Math.floor(coord.emphasis * (paletteSize - 1));
    return { ...coord, color: `hsl(${baseHue + colorIndex * 30}, 70%, ${50 + colorIndex * 10}%)`, paletteIndex: colorIndex };
  });
}

function mapCoordinatesToGradient(coordinates, colorFormula) {
  const { gradientStops = ['#000000', '#ffffff'] } = colorFormula;
  return coordinates.map(coord => {
    const t = coord.emphasis * (gradientStops.length - 1);
    const lower = Math.floor(t);
    const upper = Math.min(lower + 1, gradientStops.length - 1);
    return { ...coord, color: lerpColor(gradientStops[lower], gradientStops[upper], t - lower) };
  });
}

function mapCoordinatesToBrightness(coordinates, colorFormula) {
  const rawLevels = Number(colorFormula.brightnessLevels);
  const brightnessLevels = Math.max(1, Math.floor(Number.isFinite(rawLevels) ? rawLevels : 4));
  const maxLevel = brightnessLevels - 1;
  return coordinates.map(coord => {
    const level = Math.min(maxLevel, Math.floor(clamp01(coord.emphasis) * brightnessLevels));
    const lightness = maxLevel === 0 ? 100 : 20 + (level / maxLevel) * 80;
    return { ...coord, color: `hsl(0, 0%, ${lightness}%)`, brightnessLevel: level };
  });
}

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.substring(1), 16), b = parseInt(hexB.substring(1), 16);
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t);
  const b2 = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t);
  return `#${((r << 16) | (g << 8) | b2).toString(16).padStart(6, '0')}`;
}

export function lerpFormulas(formulaA, formulaB, t) {
  const safeT = clamp01(t);
  const paramsA = formulaA.coordinateFormula?.parameters || {};
  const paramsB = formulaB.coordinateFormula?.parameters || {};
  const lerpedParams = {};
  new Set([...Object.keys(paramsA), ...Object.keys(paramsB)]).forEach(k => {
    lerpedParams[k] = (paramsA[k] || 0) + ((paramsB[k] || 0) - (paramsA[k] || 0)) * safeT;
  });
  return { ...formulaA, coordinateFormula: { ...formulaA.coordinateFormula, parameters: lerpedParams } };
}

function createDefaultParametric() {
  return { type: FORMULA_TYPES.PARAMETRIC_CURVE, parameters: { cx: 80, cy: 72, a: 50, b: 0.1, c: 0, n: 64 } };
}
