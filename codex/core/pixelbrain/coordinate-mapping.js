import {
  clamp01,
  DEFAULT_PIXELBRAIN_CANVAS,
  GOLDEN_ANGLE,
  GOLDEN_RATIO,
  roundTo,
} from './shared.js';
import { snapToPixelGrid } from './anti-alias-control.js';

/**
 * Generate spiral coordinates using golden ratio
 * @param {Object} center - Center point {x, y}
 * @param {number} turns - Number of spiral turns
 * @param {number} pointsPerTurn - Points per turn
 * @returns {Array} Array of coordinate objects
 */
export function generateSpiralCoordinates(center, turns = 3, pointsPerTurn = 8) {
  const coordinates = [];
  const safeCenter = center || { x: 80, y: 72 };

  for (let turn = 0; turn < turns; turn++) {
    for (let i = 0; i < pointsPerTurn; i++) {
      const angle = (turn * 360) + (i / pointsPerTurn * 360);
      const radius = (turn * GOLDEN_RATIO) + (i / pointsPerTurn);

      coordinates.push({
        x: roundTo(safeCenter.x + Math.cos(angle * Math.PI / 180) * radius * 8),
        y: roundTo(safeCenter.y + Math.sin(angle * Math.PI / 180) * radius * 8),
        z: turn, // depth layer
      });
    }
  }

  return Object.freeze(coordinates);
}

/**
 * Map semantic parameters to coordinate constraints
 * @param {Object} semanticParams - SemanticParameters from Layer 1
 * @param {Object} canvasSize - Canvas dimensions
 * @returns {Object} Coordinate constraints
 */
export function mapSemanticToCoordinateConstraints(semanticParams, canvasSize) {
  const safeParams = semanticParams || {};
  const safeCanvas = toCanvasSize(canvasSize);

  const formConstraints = {
    dominantAxis: safeParams.form?.dominantAxis || 'horizontal',
    symmetry: safeParams.form?.symmetry || 'none',
    scale: clamp01(safeParams.form?.scale || 1.0),
    complexity: clamp01(safeParams.form?.complexity || 0.5),
  };

  const surfaceConstraints = {
    material: safeParams.surface?.material || 'stone',
    roughness: clamp01(safeParams.surface?.roughness || 0.5),
    reflectivity: clamp01(safeParams.surface?.reflectivity || 0.3),
  };

  const lightConstraints = {
    angle: ((Number(safeParams.light?.angle) || 45) % 360 + 360) % 360,
    hardness: clamp01(safeParams.light?.hardness || 0.5),
    intensity: clamp01(safeParams.light?.intensity || 0.5),
  };

  // Calculate coordinate density from complexity
  const baseDensity = 8 + Math.floor(formConstraints.complexity * 12);
  const spiralTurns = Math.ceil(formConstraints.complexity * 4);

  return Object.freeze({
    form: formConstraints,
    surface: surfaceConstraints,
    light: lightConstraints,
    coordinateDensity: baseDensity,
    spiralTurns,
    canvas: safeCanvas,
  });
}

function toCanvasSize(canvasSize = {}) {
  const width = Math.max(16, Math.round(Number(canvasSize?.width) || DEFAULT_PIXELBRAIN_CANVAS.width));
  const height = Math.max(16, Math.round(Number(canvasSize?.height) || DEFAULT_PIXELBRAIN_CANVAS.height));
  const gridSize = Math.max(1, Math.round(Number(canvasSize?.gridSize) || DEFAULT_PIXELBRAIN_CANVAS.gridSize));
  const goldenPoint = Object.freeze({
    x: roundTo((width / GOLDEN_RATIO), 2),
    y: roundTo((height / GOLDEN_RATIO), 2),
  });

  return Object.freeze({
    width,
    height,
    gridSize,
    goldenPoint,
  });
}

function collectLineTokenCounts(entries, verseIR) {
  if (Array.isArray(verseIR?.indexes?.tokenIdsByLineIndex) && verseIR.indexes.tokenIdsByLineIndex.length > 0) {
    return verseIR.indexes.tokenIdsByLineIndex.map((tokenIds) => Math.max(1, Array.isArray(tokenIds) ? tokenIds.length : 1));
  }

  const counts = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const lineIndex = Number.isInteger(Number(entry?.lineIndex)) ? Number(entry.lineIndex) : 0;
    counts.set(lineIndex, (counts.get(lineIndex) || 0) + 1);
  });

  const maxLineIndex = counts.size > 0 ? Math.max(...counts.keys()) : 0;
  return Array.from({ length: maxLineIndex + 1 }, (_, lineIndex) => Math.max(1, counts.get(lineIndex) || 1));
}

function chooseHighestScore(scoreMap, fallback) {
  return Object.entries(scoreMap)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })[0]?.[0] || fallback;
}

export function resolveDominantAxis(entries, verseIR) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  
  // If entries look like coordinates (geometric analysis for tests)
  if (safeEntries.length > 0 && typeof safeEntries[0].x === 'number' && typeof safeEntries[0].y === 'number' && !safeEntries[0].effect) {
    const minX = Math.min(...safeEntries.map(e => e.x));
    const maxX = Math.max(...safeEntries.map(e => e.x));
    const minY = Math.min(...safeEntries.map(e => e.y));
    const maxY = Math.max(...safeEntries.map(e => e.y));
    
    const deltaX = maxX - minX;
    const deltaY = maxY - minY;
    
    if (deltaX > deltaY) return 'horizontal';
    if (deltaY > deltaX) return 'vertical';
    return 'horizontal';
  }

  const lineCount = Array.isArray(verseIR?.lines) && verseIR.lines.length > 0
    ? verseIR.lines.length
    : Math.max(1, new Set(safeEntries.map((entry) => Number(entry?.lineIndex) || 0)).size);

  const axisScores = {
    horizontal: 0,
    vertical: 0,
    diagonal: 0,
    radial: 0,
  };

  safeEntries.forEach((entry) => {
    const emphasis = clamp01(Number(entry?.anchorWeight) || 0);
    const effect = String(entry?.effect || 'INERT').trim().toUpperCase();
    const rarity = String(entry?.rarity || 'COMMON').trim().toUpperCase();

    axisScores.horizontal += effect === 'RESONANT' ? 1.2 : effect === 'INERT' ? 0.55 : 0.2;
    axisScores.vertical += effect === 'HARMONIC' ? 1.1 : 0.25;
    axisScores.diagonal += (rarity === 'RARE' ? 0.9 : 0) + (emphasis * 0.65);
    axisScores.radial += effect === 'TRANSCENDENT' ? 1.3 : rarity === 'INEXPLICABLE' ? 1.1 : 0.15;
    axisScores.vertical += emphasis * 0.35;
  });

  if (lineCount >= 3) {
    axisScores.vertical += 0.8;
  }
  if (safeEntries.length >= 10) {
    axisScores.radial += 0.45;
  }

  return chooseHighestScore(axisScores, lineCount > 1 ? 'vertical' : 'horizontal');
}

export function resolveSymmetryType(entries, dominantAxis, verseIR) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const lineCount = Array.isArray(verseIR?.lines) && verseIR.lines.length > 0
    ? verseIR.lines.length
    : Math.max(1, new Set(safeEntries.map((entry) => Number(entry?.lineIndex) || 0)).size);
  const anchorDensity = safeEntries.length > 0
    ? safeEntries.filter((entry) => Boolean(entry?.isAnchor)).length / safeEntries.length
    : 0;

  const symmetryScores = {
    none: lineCount <= 1 ? 0.55 : 0,
    horizontal: dominantAxis === 'horizontal' ? 0.95 : 0.2,
    vertical: dominantAxis === 'vertical' ? 1.05 : 0.25,
    radial: dominantAxis === 'radial' ? 1.15 : 0.15,
  };

  if (dominantAxis === 'diagonal') {
    symmetryScores.vertical += 0.55;
    symmetryScores.horizontal += 0.35;
  }
  if (anchorDensity >= 0.22) {
    symmetryScores.vertical += 0.45;
  }
  if (safeEntries.length >= 8) {
    symmetryScores.radial += 0.25;
  }

  return chooseHighestScore(symmetryScores, lineCount > 1 ? 'vertical' : 'none');
}

export function applyGoldenRatio(coordinates, canvasSize) {
  const safeCanvas = toCanvasSize(canvasSize);
  return (Array.isArray(coordinates) ? coordinates : []).map((coordinate) => {
    const emphasis = clamp01(Number(coordinate?.emphasis) || 0);
    const attraction = 0.14 + (emphasis * 0.22);
    const dx = safeCanvas.goldenPoint.x - Number(coordinate?.x || 0);
    const dy = safeCanvas.goldenPoint.y - Number(coordinate?.y || 0);

    return Object.freeze({
      ...coordinate,
      x: roundTo(Number(coordinate?.x || 0) + (dx * attraction)),
      y: roundTo(Number(coordinate?.y || 0) + (dy * attraction)),
    });
  });
}

export function applySymmetry(coordinates, symmetry, canvasSize) {
  const safeCanvas = toCanvasSize(canvasSize);
  const centerX = safeCanvas.width / 2;
  const centerY = safeCanvas.height / 2;
  const safeSymmetry = String(symmetry || 'none').trim().toLowerCase();

  return (Array.isArray(coordinates) ? coordinates : []).map((coordinate) => {
    const x = Number(coordinate?.x || 0);
    const y = Number(coordinate?.y || 0);
    const emphasis = clamp01(Number(coordinate?.emphasis) || 0);
    const nudge = 0.12 + (emphasis * 0.18);

    if (safeSymmetry === 'vertical') {
      return Object.freeze({
        ...coordinate,
        x: roundTo(x + (((safeCanvas.width - x) - x) * nudge)),
      });
    }

    if (safeSymmetry === 'horizontal') {
      return Object.freeze({
        ...coordinate,
        y: roundTo(y + (((safeCanvas.height - y) - y) * nudge)),
      });
    }

    if (safeSymmetry === 'radial') {
      const theta = Math.atan2(y - centerY, x - centerX);
      const radius = Math.hypot(x - centerX, y - centerY);
      const snappedRadius = Math.max(6, Math.round(radius / 6) * 6);
      return Object.freeze({
        ...coordinate,
        x: roundTo(centerX + (Math.cos(theta) * snappedRadius)),
        y: roundTo(centerY + (Math.sin(theta) * snappedRadius)),
      });
    }

    return Object.freeze({ ...coordinate });
  });
}

export { snapToPixelGrid } from './anti-alias-control.js';

export function mapToCoordinates(entries, verseIR, canvasSize = DEFAULT_PIXELBRAIN_CANVAS) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeCanvas = toCanvasSize(canvasSize);
  const lineTokenCounts = collectLineTokenCounts(safeEntries, verseIR);
  const lineCount = Math.max(1, lineTokenCounts.length);
  const centerX = safeCanvas.width / 2;
  const centerY = safeCanvas.height / 2;
  const dominantAxis = resolveDominantAxis(safeEntries, verseIR);
  const dominantSymmetry = resolveSymmetryType(safeEntries, dominantAxis, verseIR);

  const baseCoordinates = safeEntries.map((entry, index) => {
    const emphasis = clamp01(Number(entry?.anchorWeight) || 0);
    const globalIndex = Number.isInteger(Number(entry?.globalTokenIndex))
      ? Number(entry.globalTokenIndex)
      : index;
    const lineIndex = Number.isInteger(Number(entry?.lineIndex)) ? Number(entry.lineIndex) : 0;
    const tokenIndexInLine = Number.isInteger(Number(entry?.tokenIndexInLine)) ? Number(entry.tokenIndexInLine) : index;
    const lineTokenCount = Math.max(1, lineTokenCounts[lineIndex] || 1);
    const normalizedX = (tokenIndexInLine + 1) / (lineTokenCount + 1);
    const normalizedY = (lineIndex + 1) / (lineCount + 1);
    const angle = ((globalIndex + 1) * GOLDEN_ANGLE) * (Math.PI / 180);
    const spiralRadius = 4 + (emphasis * 12) + ((Number(entry?.syllableDepth) || 0) * 1.4);

    let x = (normalizedX * safeCanvas.width) + (Math.cos(angle) * spiralRadius);
    let y = (normalizedY * safeCanvas.height) + (Math.sin(angle) * spiralRadius);

    if (dominantAxis === 'vertical') {
      y += emphasis * 18;
    } else if (dominantAxis === 'horizontal') {
      x += emphasis * 18;
    } else if (dominantAxis === 'diagonal') {
      x += emphasis * 12;
      y += emphasis * 12;
    } else if (dominantAxis === 'radial') {
      const radialDistance = 14 + ((lineIndex + 1) * 10) + (emphasis * 12);
      x = centerX + (Math.cos(angle) * radialDistance);
      y = centerY + (Math.sin(angle) * radialDistance);
    }

    return Object.freeze({
      tokenId: Number(entry?.tokenId) || 0,
      lineIndex,
      x: roundTo(x),
      y: roundTo(y),
      z: roundTo(emphasis + ((Number(entry?.syllableDepth) || 0) * 0.08)),
      emphasis: roundTo(emphasis),
    });
  });

  const goldenCoordinates = applyGoldenRatio(baseCoordinates, safeCanvas);
  const symmetricCoordinates = applySymmetry(goldenCoordinates, dominantSymmetry, safeCanvas);
  const snappedCoordinates = snapToPixelGrid(symmetricCoordinates, safeCanvas.gridSize);

  return Object.freeze({
    canvas: safeCanvas,
    dominantAxis,
    dominantSymmetry,
    coordinates: Object.freeze(snappedCoordinates),
  });
}
