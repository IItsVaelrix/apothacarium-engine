/**
 * PIXEL MICROPROCESSOR: Neural Transmuter
 * 
 * The orchestrator for AI-to-Scholomance style transfer.
 * Decomposes external AI art and re-skins it with world-law constraints.
 */

import { verseIRMicroprocessors } from '../index.js';
import { analyzeImageToFormula, formulaToBytecode } from '../../pixelbrain/image-to-bytecode-formula.js';
import { mapImageToPhonemes } from '../../pixelbrain/phoneme-mapping.js';

/**
 * Transmute external AI art into Scholomance variants
 * @param {Object} payload - { buffer, mimetype, schoolId, styleId, targetSize }
 * @returns {Object} { coordinates, palettes, canvas, schoolId, styleId, formula, bytecode, heatmap }
 */
export async function transmuteAIArt({ buffer, mimetype, schoolId, styleId, targetSize = { width: 160, height: 144 } }) {
  // 1. Normalization: Raw Buffer -> Standardized Substrate
  const { pixelData: rawPixels, dimensions: rawDims } = await verseIRMicroprocessors.execute('pixel.decode', { 
    buffer, 
    mimetype 
  });

  const { pixelData: normalizedPixels, dimensions: workingDims } = await verseIRMicroprocessors.execute('pixel.resample', {
    pixelData: rawPixels,
    dimensions: rawDims,
    targetSize
  });

  // 2. Structural Extraction: Trace the AI anatomy
  const { coordinates: baseCoordinates } = await verseIRMicroprocessors.execute('pixel.trace', {
    pixelData: normalizedPixels,
    dimensions: workingDims,
    threshold: 25 // Aggressive edge detection for AI art
  });

  // 3. Chromatic Transmutation: Map AI colors to School
  const colors = [...new Set(baseCoordinates.map(c => c.color))];
  const { quantizedColors } = await verseIRMicroprocessors.execute('pixel.quantize', {
    colors,
    schoolId
  });

  // Create color mapping lookup
  const colorMap = new Map();
  quantizedColors.forEach(q => colorMap.set(q.original, q.quantized));

  // Apply quantized colors to coordinates
  const transmutedCoordinates = baseCoordinates.map(coord => ({
    ...coord,
    color: colorMap.get(coord.color) || coord.color,
    source: 'transmutation'
  }));

  // 4. Stylistic Encoding: Apply retro era filter
  let finalCoordinates = transmutedCoordinates;
  if (styleId && styleId !== 'none') {
    finalCoordinates = applyRetroStyleToCoordinates(transmutedCoordinates, styleId, workingDims);
  }

  // 5. Bytecode Ignition: Generate 0xF formula from transmuted result
  // We simulate an analysis object for the formula engine
  const simulatedAnalysis = {
    pixelData: normalizedPixels,
    dimensions: workingDims,
    colors: quantizedColors.map(q => ({ hex: q.quantized, percentage: 0 })),
    composition: { edgeDensity: baseCoordinates.length / (workingDims.width * workingDims.height), hasSymmetry: false }
  };
  
  const formula = analyzeImageToFormula(simulatedAnalysis);
  const bytecode = formulaToBytecode(formula);

  // 6. Phoneme Heat-Mapping
  const heatmap = mapImageToPhonemes(normalizedPixels, workingDims);

  return {
    coordinates: finalCoordinates,
    palettes: buildPaletteFromQuantized(quantizedColors, schoolId),
    canvas: { ...workingDims, gridSize: 1 },
    schoolId,
    styleId,
    formula,
    bytecode,
    heatmap
  };
}

function buildPaletteFromQuantized(quantizedColors, schoolId) {
  const uniqueColors = [...new Set(quantizedColors.map(q => q.quantized))];
  return [{
    key: `transmute_${schoolId || 'none'}_${Date.now()}`, // EXEMPT
    colors: uniqueColors,
    source: 'transmutation',
    schoolId
  }];
}

function applyRetroStyleToCoordinates(coords, styleId, _canvas) {
  if (styleId === 'gameboy') {
    // Force coordinates to 2x2 blocks for that chunky GB feel
    return coords.map(c => ({
      ...c,
      x: Math.round(c.x / 2) * 2,
      y: Math.round(c.y / 2) * 2
    }));
  }
  
  if (styleId === 'nes') {
    // 8-bit quantization logic
    return coords.filter((_, i) => i % 2 === 0); // Decimate for lower density
  }

  return coords;
}
