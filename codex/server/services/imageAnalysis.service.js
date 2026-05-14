import { verseIRMicroprocessors } from '../../core/microprocessors/index.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.IMG_PIXEL;

/**
 * IMAGE ANALYSIS SERVICE
 * 
 * Extracts visual features from uploaded reference images for PixelBrain.
 * Analyzes: dominant colors, composition, brightness, contrast, edge density.
 */

/**
 * Analyze a reference image buffer
 * @param {Buffer} buffer - Image file buffer
 * @param {string} mimetype - File MIME type
 * @returns {Promise<Object>} Image analysis result
 */
export async function analyzeReferenceImage(buffer, mimetype) {
  // Validate inputs
  if (!buffer) {
    const error = new Error('INVALID_INPUT: No buffer provided to analyzeReferenceImage');
    console.error('[ImageAnalysis]', error.message);
    throw error;
  }

  try {
    console.log('[ImageAnalysis] Starting analysis:', { mimetype, bufferSize: buffer?.length });

    // 1. Decode bitstream using unified bridge (Async by default)
    const decodeStart = Date.now();
    const { pixelData, dimensions } = await verseIRMicroprocessors.execute('pixel.decode', { buffer, mimetype });
    console.log('[ImageAnalysis] Decoded in', Date.now() - decodeStart, 'ms:', dimensions);

    // Validate decode result
    if (!pixelData || !dimensions) {
      throw new BytecodeError(
        ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.INVALID_STATE,
        { reason: 'pixel.decode returned invalid result', operation: 'decodeBitStream' },
      );
    }

    // 2. Normalization: Resample to working substrate if too large
    const targetSize = {
      width: Math.min(dimensions.width, 256),
      height: Math.min(dimensions.height, 256)
    };

    const resampleStart = Date.now();
    const { pixelData: substrate, dimensions: workingDims } = await verseIRMicroprocessors.execute('pixel.resample', {
      pixelData,
      dimensions,
      targetSize
    });
    console.log('[ImageAnalysis] Resampled in', Date.now() - resampleStart, 'ms:', workingDims);

    // 3. Extraction: Extract colors and composition
    const extractStart = Date.now();
    const colors = extractDominantColors(substrate);
    const composition = analyzeComposition(substrate, workingDims.width, workingDims.height);
    console.log('[ImageAnalysis] Extracted in', Date.now() - extractStart, 'ms, colors:', colors.length);

    return {
      colors,
      composition,
      dimensions: workingDims,
      pixelData: Array.from(substrate), // Convert to array for JSON response
      semanticParams: {
        surface: { material: 'stone', reflectivity: 0.3, roughness: 0.5 },
        form: { complexity: 0.5, dominantAxis: composition.dominantAxis }
      }
    };
  } catch (error) {
    console.error('[ImageAnalysis] Error:', error.message);
    throw error;
  }
}

/**
 * Extract dominant colors from pixel data
 */
function extractDominantColors(pixelData) {
  const colorCounts = new Map();
  const step = 4; // Sample every 4th pixel for speed
  
  for (let i = 0; i < pixelData.length; i += 4 * step) {
    if (pixelData[i + 3] < 128) continue; // Skip transparent
    
    // Quantize color to reduce noise (bits 0-255 -> 0-15)
    const r = Math.round(pixelData[i] / 16) * 16;
    const g = Math.round(pixelData[i + 1] / 16) * 16;
    const b = Math.round(pixelData[i + 2] / 16) * 16;
    const hex = rgbToHex(r, g, b);
    
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }
  
  // Sort by frequency and return top 5
  return [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex, count]) => ({
      hex,
      percentage: (count / (pixelData.length / 16)) * 100
    }));
}

/**
 * Analyze composition (edge density, dominant axis)
 */
function analyzeComposition(pixelData, width, height) {
  const grayscale = new Uint8Array(pixelData.length / 4);
  let totalBrightness = 0;
  let lightPixels = 0;
  let darkPixels = 0;
  const threshold = 128;

  for (let i = 0; i < grayscale.length; i++) {
    const r = pixelData[i * 4];
    const g = pixelData[i * 4 + 1];
    const b = pixelData[i * 4 + 2];
    const brightness = (r + g + b) / 3;
    grayscale[i] = brightness;
    totalBrightness += brightness;
    
    if (brightness < threshold) darkPixels++;
    else lightPixels++;
  }

  const avgBrightness = totalBrightness / grayscale.length;
  
  let minBrightness = 255;
  let maxBrightness = 0;
  for (let i = 0; i < grayscale.length; i++) {
    if (grayscale[i] < minBrightness) minBrightness = grayscale[i];
    if (grayscale[i] > maxBrightness) maxBrightness = grayscale[i];
  }
  const contrast = maxBrightness - minBrightness;
  const _brightnessRatio = lightPixels / Math.max(1, darkPixels);

  // Simple edge detection (sobel-like gradients)
  const horizontalEdges = detectHorizontalEdges(grayscale, width, height);
  const verticalEdges = detectVerticalEdges(grayscale, width, height);
  const dominantAxis = horizontalEdges > verticalEdges ? 'horizontal' : 'vertical';
  
  return {
    brightnessNormalized: avgBrightness / 255,
    contrastNormalized: contrast / 255,
    edgeDensity: (horizontalEdges + verticalEdges) / (width * height),
    dominantAxis,
    hasSymmetry: false, // Future implementation
    complexity: (horizontalEdges + verticalEdges) / 10000 // Heuristic
  };
}

function detectHorizontalEdges(grayscale, width, height) {
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const idx = y * width + x;
      if (Math.abs(grayscale[idx] - grayscale[idx - 1]) > 30) count++;
    }
  }
  return count;
}

function detectVerticalEdges(grayscale, width, height) {
  let count = 0;
  for (let x = 0; x < width; x++) {
    for (let y = 1; y < height; y++) {
      const idx = y * width + x;
      const prevIdx = (y - 1) * width + x;
      if (Math.abs(grayscale[idx] - grayscale[prevIdx]) > 30) count++;
    }
  }
  return count;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}
