/**
 * IMAGE-TO-PIXEL-ART GENERATOR
 * 
 * Generates pixel art coordinates and colors from reference image analysis.
 * This module traces shapes, extracts features, and maps them to PixelBrain's coordinate system.
 */

import { snapToPixelGrid } from './anti-alias-control.js';
import { analyzeImageToFormula, formulaToBytecode } from './image-to-bytecode-formula.js';

/**
 * @typedef {Object} ImageAnalysis
 * @property {Array} colors - Dominant colors
 * @property {Object} composition - Composition metrics
 * @property {Object} semanticParams - Semantic parameters
 * @property {Uint8ClampedArray} pixelData - Raw pixel data
 * @property {Object} dimensions - Image dimensions
 */

/**
 * Generate pixel art from image analysis — SYNCHRONOUS.
 * Apothacarium adaptation: the microprocessor harness is removed, so
 * the pixel.trace stage is no longer available. Callers must pre-extract
 * `imageAnalysis.coordinates` (e.g. via the silhouette helpers below or
 * an external tracer). If no coordinates are present, an empty array is
 * used and the caller can fall back to silhouette/fill or template mode.
 *
 * @param {ImageAnalysis} imageAnalysis - Result from image analysis
 * @param {Object} canvasSize - Canvas dimensions
 * @param {string} extension - Extension ID to apply
 * @returns {Object} PixelBrain-compatible result
 */
export function generatePixelArtFromImage(imageAnalysis, canvasSize, extension = null) {
  const { colors, composition, semanticParams: _semanticParams } = imageAnalysis;

  // 1. Extract mathematical formula from image
  const formula = analyzeImageToFormula(imageAnalysis);
  const bytecode = formulaToBytecode(formula);

  // 2. Build palette from image colors
  const palettes = buildPaletteFromImageColors(colors);

  // 3. Coordinates must be pre-extracted (no async tracer microprocessor)
  const coordinates = Array.isArray(imageAnalysis.coordinates)
    ? imageAnalysis.coordinates
    : [];
  
  // Snap all coordinates to pixel grid
  const finalCoordinates = coordinates.map(coord => {
    const snapped = snapToPixelGrid(coord, canvasSize.gridSize || 1);
    return {
      ...coord,
      snappedX: snapped.x,
      snappedY: snapped.y,
    };
  });
  
  // Apply extension if specified
  let processedCoordinates = finalCoordinates;
  if (extension) {
    processedCoordinates = applyExtensionToCoordinates(finalCoordinates, extension, canvasSize);
  }
  
  return {
    coordinates: processedCoordinates,
    palettes,
    canvas: canvasSize,
    formula,
    bytecode,
    dominantAxis: composition?.dominantAxis || 'horizontal',
    dominantSymmetry: composition?.hasSymmetry ? (composition?.symmetryType || 'none') : 'none',
  };
}

/**
 * Direct transcription of pixel data to coordinates
 * (Used for high-fidelity reconstruction)
 */
export function transcribeFullPixelData(pixelData, dimensions, canvasSize) {
  const { width: srcWidth, height: srcHeight } = dimensions;
  const { width: canvasWidth, height: canvasHeight } = canvasSize;
  const coordinates = [];

  const scaleX = canvasWidth / srcWidth;
  const scaleY = canvasHeight / srcHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (canvasWidth - srcWidth * scale) / 2;
  const offsetY = (canvasHeight - srcHeight * scale) / 2;

  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      const idx = (y * srcWidth + x) * 4;
      if (pixelData[idx + 3] < 128) continue;

      coordinates.push({
        x: x * scale + offsetX,
        y: y * scale + offsetY,
        z: 0,
        color: rgbToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]),
        emphasis: 0.5,
        source: 'direct_transcription',
      });
    }
  }

  // Snap to pixel grid
  return coordinates.map(coord => {
    const snapped = snapToPixelGrid(coord, canvasSize.gridSize || 1);
    return {
      ...coord,
      snappedX: snapped.x,
      snappedY: snapped.y,
    };
  });
}

/**
 * Build palette from image colors
 */
function buildPaletteFromImageColors(colors) {
  if (!colors || colors.length === 0) {
    return [];
  }
  
  // Create color key from dominant color
  const dominantColor = colors[0];
  const key = `img_${dominantColor.hex.replace('#', '')}`;
  
  // Build color array with weights
  const paletteColors = colors.map(color => ({
    hex: color.hex,
    weight: color.percentage / 100,
  }));
  
  return [{
    key,
    colors: paletteColors.map(c => c.hex),
    weights: paletteColors.map(c => c.weight),
    source: 'image',
  }];
}

function applyExtensionToCoordinates(coordinates, extensionId, canvasSize) {
  // Simple extension routing for now
  if (extensionId === 'physics-gravity') {
    return coordinates.map(c => ({
      ...c,
      y: Math.min(canvasSize.height, c.y + 10),
      emphasis: c.emphasis * 0.8
    }));
  }
  return coordinates;
}

/**
 * Generate a silhouette (outline) from image analysis
 */
export function generateSilhouetteFromImage(imageAnalysis, canvasSize) {
  const { pixelData, dimensions } = imageAnalysis;
  const { width: srcWidth, height: srcHeight } = dimensions;
  const { width: canvasWidth, height: canvasHeight } = canvasSize;
  const silhouette = [];

  const scaleX = canvasWidth / srcWidth;
  const scaleY = canvasHeight / srcHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (canvasWidth - srcWidth * scale) / 2;
  const offsetY = (canvasHeight - srcHeight * scale) / 2;

  // Simple edge detection: check if alpha > 128 and has at least one transparent neighbor
  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      const idx = (y * srcWidth + x) * 4;
      if (pixelData[idx + 3] < 128) continue;

      let isEdge = false;
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= srcWidth || ny < 0 || ny >= srcHeight) {
          isEdge = true;
          break;
        }
        const nidx = (ny * srcWidth + nx) * 4;
        if (pixelData[nidx + 3] < 128) {
          isEdge = true;
          break;
        }
      }

      if (isEdge) {
        const coord = {
          x: x * scale + offsetX,
          y: y * scale + offsetY,
          z: 0,
          emphasis: 1.0,
          source: 'silhouette',
        };
        const snapped = snapToPixelGrid(coord, canvasSize.gridSize || 1);
        silhouette.push({
          ...coord,
          snappedX: snapped.x,
          snappedY: snapped.y,
        });
      }
    }
  }

  return silhouette;
}

/**
 * Fills a shape defined by a silhouette with a target color
 */
export function fillShape(silhouette, canvasSize, colorHex) {
  if (!silhouette || silhouette.length === 0) return [];

  // Simple bounding box fill for interior points
  const minX = Math.min(...silhouette.map(c => c.snappedX));
  const maxX = Math.max(...silhouette.map(c => c.snappedX));
  const minY = Math.min(...silhouette.map(c => c.snappedY));
  const maxY = Math.max(...silhouette.map(c => c.snappedY));

  const filled = [];
  const gridSize = canvasSize.gridSize || 1;

  for (let y = minY; y <= maxY; y += gridSize) {
    for (let x = minX; x <= maxX; x += gridSize) {
      // Basic check: is it inside the horizontal bounds of the silhouette for this row?
      const rowPoints = silhouette.filter(c => Math.abs(c.snappedY - y) < gridSize / 2);
      if (rowPoints.length < 2) continue;

      const rowMinX = Math.min(...rowPoints.map(c => c.snappedX));
      const rowMaxX = Math.max(...rowPoints.map(c => c.snappedX));

      if (x >= rowMinX && x <= rowMaxX) {
        filled.push({
          x,
          y,
          z: 0,
          color: colorHex,
          emphasis: 0.5,
          source: 'fill',
          snappedX: x,
          snappedY: y,
        });
      }
    }
  }

  return filled;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}
