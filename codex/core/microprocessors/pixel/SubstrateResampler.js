/**
 * PIXEL MICROPROCESSOR: Substrate Resampler
 * 
 * Scalably transforms raw pixel buffers into target PixelBrain substrates.
 * Provides specialized sampling for pixel art preservation.
 */

import { roundTo } from '../../pixelbrain/shared.js';

/**
 * Resample pixel data to target dimensions
 * @param {Object} payload - { pixelData, dimensions, targetSize, mode }
 * @returns {Object} { pixelData, dimensions }
 */
export function resampleSubstrate({ pixelData, dimensions, targetSize, mode = 'nearest' }) {
  const { width: srcWidth, height: srcHeight } = dimensions;
  
  // Safety: Normalize target dimensions to prevent 0x0 or negative
  const dstWidth = Math.max(1, Math.round(Number(targetSize?.width) || 1));
  const dstHeight = Math.max(1, Math.round(Number(targetSize?.height) || 1));
  
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    return { pixelData, dimensions: { width: dstWidth, height: dstHeight } };
  }

  const result = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const dstIdx = (y * dstWidth + x) * 4;
      
      let srcX, srcY;
      
      if (mode === 'nearest') {
        srcX = Math.floor(x * scaleX);
        srcY = Math.floor(y * scaleY);
      } else {
        // Simple bilinear logic fallback
        srcX = Math.floor(x * scaleX);
        srcY = Math.floor(y * scaleY);
      }

      const srcIdx = (srcY * srcWidth + srcX) * 4;
      
      result[dstIdx] = pixelData[srcIdx];
      result[dstIdx + 1] = pixelData[srcIdx + 1];
      result[dstIdx + 2] = pixelData[srcIdx + 2];
      result[dstIdx + 3] = pixelData[srcIdx + 3];
    }
  }

  return {
    pixelData: result,
    dimensions: { width: dstWidth, height: dstHeight },
    scale: roundTo(Math.min(dstWidth / srcWidth, dstHeight / srcHeight), 4)
  };
}
