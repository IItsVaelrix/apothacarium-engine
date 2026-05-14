/**
 * SYMMETRY ENGINE — Apothacarium adaptation.
 *
 * Pure synchronous symmetry detection and application. The original
 * Scholomance microprocessor harness (runSymmetryAmpProcessor +
 * SymmetryProcessor registration) is removed per PDR §3 / §8 Phase 1;
 * callers invoke detectSymmetry / applySymmetryToLattice /
 * generateSymmetryOverlay / cropToOpaqueRegion / emitSymmetryBytecode
 * directly.
 *
 * Default significance threshold for apothacarium scenes is 0.55
 * (PDR §5: lower than 0.65 to allow hand-warped aesthetic). The
 * threshold is applied by the caller — these functions are policy-free.
 */

import { GOLDEN_RATIO } from './shared.js';

export const DEFAULT_APOTHECARY_SIGNIFICANCE_THRESHOLD = 0.55;
export const DEFAULT_IMAGE_SIGNIFICANCE_THRESHOLD = 0.65;

/**
 * Crop to opaque region — improves symmetry detection accuracy
 * Removes empty padding that can poison bounds calculations
 *
 * @param {Uint8ClampedArray} pixelData - Raw pixel data
 * @param {Object} dimensions - Image dimensions
 * @returns {{pixelData: Uint8ClampedArray, dimensions: Object, bounds: Object}}
 */
export function cropToOpaqueRegion(pixelData, dimensions) {
  const { width, height } = dimensions;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  // Find opaque bounds
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = pixelData[idx + 3];
      if (alpha >= 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Handle empty image
  if (maxX === -1 || maxY === -1) {
    return {
      pixelData,
      dimensions,
      bounds: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 },
    };
  }

  // Create cropped buffer
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);

  for (let y = 0; y < croppedHeight; y++) {
    for (let x = 0; x < croppedWidth; x++) {
      const srcX = minX + x;
      const srcY = minY + y;
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * croppedWidth + x) * 4;

      cropped[dstIdx] = pixelData[srcIdx];
      cropped[dstIdx + 1] = pixelData[srcIdx + 1];
      cropped[dstIdx + 2] = pixelData[srcIdx + 2];
      cropped[dstIdx + 3] = pixelData[srcIdx + 3];
    }
  }

  return {
    pixelData: cropped,
    dimensions: { width: croppedWidth, height: croppedHeight },
    bounds: { minX, minY, maxX, maxY },
  };
}

/**
 * Emit symmetry bytecode metadata
 * Standardized format for persistence and interoperability
 *
 * @param {Object} symmetry - Symmetry result
 * @param {Object} dimensions - Image dimensions
 * @returns {string[]} Bytecode metadata lines
 */
export function emitSymmetryBytecode(symmetry, dimensions) {
  return [
    'AMP SYMMETRY',
    `SYMMETRY_TYPE ${symmetry.type}`,
    `SYMMETRY_CONFIDENCE ${symmetry.confidence.toFixed(4)}`,
    `SYMMETRY_SIGNIFICANT ${symmetry.significant ? 'true' : 'false'}`,
    `SYMMETRY_AXIS_X ${symmetry.axis?.x ?? 'null'}`,
    `SYMMETRY_AXIS_Y ${symmetry.axis?.y ?? 'null'}`,
    `SYMMETRY_AXIS_ANGLE ${symmetry.axis?.angle ?? 'null'}`,
    `SYMMETRY_SCORE_VERTICAL ${symmetry.scores?.vertical?.toFixed(4) ?? '0.0000'}`,
    `SYMMETRY_SCORE_HORIZONTAL ${symmetry.scores?.horizontal?.toFixed(4) ?? '0.0000'}`,
    `SYMMETRY_SCORE_RADIAL ${symmetry.scores?.radial?.toFixed(4) ?? '0.0000'}`,
    `SYMMETRY_SCORE_DIAGONAL ${symmetry.scores?.diagonal?.toFixed(4) ?? '0.0000'}`,
    `SYMMETRY_SOURCE_WIDTH ${dimensions.width}`,
    `SYMMETRY_SOURCE_HEIGHT ${dimensions.height}`,
  ];
}

/**
 * Detect symmetry in pixel data
 * Tests vertical, horizontal, radial, and diagonal symmetry
 *
 * @param {Uint8ClampedArray} pixelData - Raw pixel data
 * @param {Object} dimensions - Image dimensions {width, height}
 * @returns {Object} Symmetry analysis result
 */
export function detectSymmetry(pixelData, dimensions) {
  const { width, height } = dimensions;

  // Test each symmetry type
  const verticalScore = testVerticalSymmetry(pixelData, width, height);
  const horizontalScore = testHorizontalSymmetry(pixelData, width, height);
  const radialScore = testRadialSymmetry(pixelData, width, height);
  const diagonalScore = testDiagonalSymmetry(pixelData, width, height);

  // Find best match
  const scores = {
    vertical: verticalScore,
    horizontal: horizontalScore,
    radial: radialScore,
    diagonal: diagonalScore,
  };

  const bestType = Object.entries(scores)
    .reduce((a, b) => (scores[b[0]] > scores[a[0]] ? b : a))[0];

  const confidence = scores[bestType];

  return {
    type: bestType,
    confidence,
    scores,
    axis: calculateSymmetryAxis(bestType, width, height),
    suggestions: generateSymmetrySuggestions(bestType, confidence, width, height),
    significant: confidence > 0.65,
  };
}

/**
 * Test vertical (left-right) symmetry
 * @returns {number} 0-1 confidence score
 */
function testVerticalSymmetry(pixelData, width, height) {
  let matchingPixels = 0;
  let totalPixels = 0;
  const halfWidth = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const leftIdx = (y * width + x) * 4;
      const rightIdx = (y * width + (width - 1 - x)) * 4;
      totalPixels++;
      if (pixelsMatch(pixelData, leftIdx, rightIdx, 40)) {
        matchingPixels++;
      }
    }
  }

  return totalPixels > 0 ? matchingPixels / totalPixels : 0;
}

/**
 * Test horizontal (top-bottom) symmetry
 * @returns {number} 0-1 confidence score
 */
function testHorizontalSymmetry(pixelData, width, height) {
  let matchingPixels = 0;
  let totalPixels = 0;
  const halfHeight = Math.floor(height / 2);

  for (let y = 0; y < halfHeight; y++) {
    for (let x = 0; x < width; x++) {
      const topIdx = (y * width + x) * 4;
      const bottomIdx = ((height - 1 - y) * width + x) * 4;
      totalPixels++;
      if (pixelsMatch(pixelData, topIdx, bottomIdx, 40)) {
        matchingPixels++;
      }
    }
  }

  return totalPixels > 0 ? matchingPixels / totalPixels : 0;
}

/**
 * Test radial (rotational) symmetry
 * @returns {number} 0-1 confidence score
 */
function testRadialSymmetry(pixelData, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) / 2;
  let matchingSamples = 0;
  let totalSamples = 0;
  const sectors = 4;
  const angleStep = (Math.PI * 2) / sectors;

  for (let r = 2; r < maxRadius; r += 4) {
    for (let a = 0; a < angleStep; a += 0.2) {
      const samples = [];
      for (let s = 0; s < sectors; s++) {
        const angle = a + s * angleStep;
        const x = Math.floor(centerX + Math.cos(angle) * r);
        const y = Math.floor(centerY + Math.sin(angle) * r);
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          samples.push([pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]]);
        }
      }
      if (samples.length === sectors) {
        totalSamples++;
        const first = samples[0];
        const allMatch = samples.every(s =>
          Math.abs(s[0] - first[0]) < 40 &&
          Math.abs(s[1] - first[1]) < 40 &&
          Math.abs(s[2] - first[2]) < 40
        );
        if (allMatch) matchingSamples++;
      }
    }
  }

  return totalSamples > 0 ? matchingSamples / totalSamples : 0;
}

/**
 * Test diagonal symmetry (top-left to bottom-right)
 * @returns {number} 0-1 confidence score
 */
function testDiagonalSymmetry(pixelData, width, height) {
  if (Math.abs(width - height) > Math.max(width, height) * 0.2) {
    return 0;
  }
  let matchingPixels = 0;
  let totalPixels = 0;
  const size = Math.min(width, height);

  for (let y = 0; y < size; y++) {
    for (let x = y + 1; x < size; x++) {
      const idx1 = (y * width + x) * 4;
      const idx2 = (x * width + y) * 4;
      totalPixels++;
      if (pixelsMatch(pixelData, idx1, idx2, 40)) {
        matchingPixels++;
      }
    }
  }

  return totalPixels > 0 ? matchingPixels / totalPixels : 0;
}

/**
 * Compare two pixel colors with tolerance
 */
function pixelsMatch(data, idx1, idx2, tolerance = 30) {
  const dr = Math.abs(data[idx1] - data[idx2]);
  const dg = Math.abs(data[idx1 + 1] - data[idx2 + 1]);
  const db = Math.abs(data[idx1 + 2] - data[idx2 + 2]);
  const _da = Math.abs(data[idx1 + 3] - data[idx2 + 3]);

  if ((data[idx1 + 3] < 128) !== (data[idx2 + 3] < 128)) {
    return false;
  }
  if (data[idx1 + 3] < 128) {
    return true;
  }
  return dr + dg + db < tolerance;
}

/**
 * Calculate symmetry axis position
 */
function calculateSymmetryAxis(type, width, height) {
  switch (type) {
    case 'vertical': return { x: width / 2, y: null, angle: 90 };
    case 'horizontal': return { x: null, y: height / 2, angle: 0 };
    case 'radial': return { x: width / 2, y: height / 2, angle: 360 };
    case 'diagonal': return { x: null, y: null, angle: 45 };
    default: return { x: null, y: null, angle: null };
  }
}

/**
 * Generate suggestions based on detected symmetry
 */
function generateSymmetrySuggestions(type, confidence, width, height) {
  const suggestions = [];
  if (type === 'none' || confidence < 0.5) {
    suggestions.push('No significant symmetry detected — freeform design');
    return suggestions;
  }
  switch (type) {
    case 'vertical':
      suggestions.push('Vertical symmetry detected — ideal for characters, faces, icons');
      suggestions.push('Enable mirror editing for efficient workflow');
      suggestions.push(`Golden ratio spacing: ${Math.round(width / GOLDEN_RATIO)}px`);
      break;
    case 'horizontal':
      suggestions.push('Horizontal symmetry detected — reflections, water, landscapes');
      break;
    case 'radial':
      suggestions.push('Radial symmetry detected — explosions, flowers, mandalas');
      suggestions.push(`Golden ratio radius: ${Math.round(Math.min(width, height) / 2 / GOLDEN_RATIO)}px`);
      break;
    case 'diagonal':
      suggestions.push('Diagonal symmetry detected — dynamic compositions');
      break;
  }
  if (confidence > 0.85) {
    suggestions.push('High confidence — auto-apply symmetry grid recommended');
  }
  return suggestions;
}

/**
 * Apply symmetry to lattice cells
 * Mirrors cells across detected symmetry axis
 *
 * @param {Object} lattice - Lattice object
 * @param {Object} symmetry - Detected symmetry
 * @returns {Object} Modified lattice with symmetry applied
 */
export function applySymmetryToLattice(lattice, symmetry) {
  if (!symmetry || symmetry.type === 'none' || !symmetry.significant) {
    return lattice;
  }

  const { cols, rows, cells } = lattice;
  const newCells = new Map(cells);

  switch (symmetry.type) {
    case 'vertical': {
      const _midCol = cols / 2;
      cells.forEach((cell) => {
        const mirrorCol = Math.floor((cols - 1) - cell.col);
        const mirrorKey = `${mirrorCol},${cell.row}`;
        if (!newCells.has(mirrorKey)) {
          newCells.set(mirrorKey, {
            ...cell,
            col: mirrorCol,
            color: cell.color,
            emphasis: cell.emphasis * 0.9,
          });
        }
      });
      break;
    }
    case 'horizontal': {
      const _midRow = rows / 2;
      cells.forEach((cell) => {
        const mirrorRow = Math.floor((rows - 1) - cell.row);
        const mirrorKey = `${cell.col},${mirrorRow}`;
        if (!newCells.has(mirrorKey)) {
          newCells.set(mirrorKey, {
            ...cell,
            row: mirrorRow,
            color: cell.color,
            emphasis: cell.emphasis * 0.9,
          });
        }
      });
      break;
    }
    case 'radial': {
      const _centerX = cols / 2;
      const _centerY = rows / 2;
      cells.forEach((cell) => {
        const mirrors = [
          { col: Math.floor((cols - 1) - cell.col), row: cell.row },
          { col: cell.col, row: Math.floor((rows - 1) - cell.row) },
          { col: Math.floor((cols - 1) - cell.col), row: Math.floor((rows - 1) - cell.row) },
        ];
        mirrors.forEach((m) => {
          const mirrorKey = `${m.col},${m.row}`;
          if (!newCells.has(mirrorKey)) {
            newCells.set(mirrorKey, {
              ...cell,
              col: m.col,
              row: m.row,
              color: cell.color,
              emphasis: cell.emphasis * 0.85,
            });
          }
        });
      });
      break;
    }
  }

  return { ...lattice, cells: newCells, symmetry };
}

/**
 * Generate symmetry visualization overlay
 *
 * @param {Object} symmetry - Detected symmetry
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} zoom - Zoom level
 * @returns {Array} Drawing commands for overlay
 */
export function generateSymmetryOverlay(symmetry, width, height, zoom = 1) {
  if (!symmetry || symmetry.type === 'none') {
    return [];
  }

  const overlay = [];
  const confidence = symmetry.confidence;

  switch (symmetry.type) {
    case 'vertical': {
      const x = (symmetry.axis.x || width / 2) * zoom;
      overlay.push({
        type: 'line',
        x1: x, y1: 0, x2: x, y2: height * zoom,
        color: `rgba(255, 100, 100, ${confidence * 0.6})`,
        lineWidth: 2,
        dash: [5, 5],
      });
      break;
    }
    case 'horizontal': {
      const y = (symmetry.axis.y || height / 2) * zoom;
      overlay.push({
        type: 'line',
        x1: 0, y1: y, x2: width * zoom, y2: y,
        color: `rgba(100, 255, 100, ${confidence * 0.6})`,
        lineWidth: 2,
        dash: [5, 5],
      });
      break;
    }
    case 'radial': {
      const cx = (symmetry.axis.x || width / 2) * zoom;
      const cy = (symmetry.axis.y || height / 2) * zoom;
      const radius = Math.min(width, height) * zoom / 2;
      overlay.push({
        type: 'circle',
        x: cx, y: cy, radius: 4,
        color: `rgba(255, 200, 50, ${confidence})`,
        fill: true,
      });
      for (let angle = 0; angle < 360; angle += 90) {
        const rad = (angle * Math.PI) / 180;
        overlay.push({
          type: 'line',
          x1: cx, y1: cy,
          x2: cx + Math.cos(rad) * radius,
          y2: cy + Math.sin(rad) * radius,
          color: `rgba(255, 200, 50, ${confidence * 0.4})`,
          lineWidth: 1,
          dash: [3, 3],
        });
      }
      break;
    }
    case 'diagonal': {
      overlay.push({
        type: 'line',
        x1: 0, y1: 0, x2: width * zoom, y2: height * zoom,
        color: `rgba(200, 100, 255, ${confidence * 0.6})`,
        lineWidth: 2,
        dash: [5, 5],
      });
      break;
    }
  }

  return overlay;
}

