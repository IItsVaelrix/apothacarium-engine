/**
 * LAYER 3: STYLE EXTENSIONS
 *
 * Visual style overrides for different aesthetic targets.
 * Includes GameBoy, 8-bit, and other retro style filters.
 */

import { clamp01 } from '../shared.js';

/**
 * Ordered dithering pattern (4x4 Bayer matrix)
 */
const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/**
 * Apply ordered dithering to noise buffer
 */
function applyOrderedDither(noise, paletteSize) {
  const width = Math.round(Math.sqrt(noise.length));
  const height = width;
  const dithered = new Float32Array(noise.length);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const bayerIndex = ((y % 4) * 4 + (x % 4));
      const threshold = (BAYER_4X4[bayerIndex] / 16 - 0.5) * (1 / paletteSize);
      dithered[i] = clamp01(noise[i] + threshold);
    }
  }
  
  return dithered;
}

/**
 * GameBoy Style Extension
 * 4-color monochrome green palette
 * 160x144 resolution
 */
export const styleGameBoy = Object.assign(
  function(payload, context) {
    return {
      ...payload,
      ...styleGameBoy.hooks.onColorByte(payload, context),
      coordinates: styleGameBoy.hooks.onCoordinateMap(payload.coordinates || [], context),
    };
  },
  {
    id: 'style-gameboy',
    type: 'STYLE',
    
    config: {
      palette: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'],
      resolution: { width: 160, height: 144 },
      dithering: true,
      pixelScale: 1,
    },
    
    hooks: {
      /**
       * Override with GameBoy palette
       */
      onColorByte(palette, _context) {
        return {
          ...palette,
          colors: styleGameBoy.config.palette,
          byteMap: styleGameBoy.config.palette.reduce((map, color, i) => {
            map[String(i)] = color;
            return map;
          }, {}),
        };
      },
      
      /**
       * Constrain to GameBoy resolution
       */
      onCoordinateMap(coords, _context) {
        return coords.map(coord => ({
          ...coord,
          x: Math.round((coord.x || 0) / 2),
          y: Math.round((coord.y || 0) / 2),
          z: coord.z,
        }));
      },
      
      /**
       * Apply dithering pattern
       */
      onNoiseGen(noise, _context) {
        if (!styleGameBoy.config.dithering) return noise;
        return applyOrderedDither(noise, styleGameBoy.config.palette.length);
      },
      
      /**
       * Quantize render to GameBoy colors
       */
      onRender(buffer, _context) {
        const result = new Uint8ClampedArray(buffer);
        const palette = styleGameBoy.config.palette.map(hex => {
          const clean = hex.replace('#', '');
          return {
            r: parseInt(clean.slice(0, 2), 16),
            g: parseInt(clean.slice(2, 4), 16),
            b: parseInt(clean.slice(4, 6), 16),
          };
        });
        
        for (let i = 0; i < result.length; i += 4) {
          const r = result[i];
          const g = result[i + 1];
          const b = result[i + 2];
          
          // Find closest palette color
          let minDist = Infinity;
          let closest = palette[0];
          
          for (const color of palette) {
            const dist = Math.pow(r - color.r, 2) + 
                         Math.pow(g - color.g, 2) + 
                         Math.pow(b - color.b, 2);
            if (dist < minDist) {
              minDist = dist;
              closest = color;
            }
          }
          
          result[i] = closest.r;
          result[i + 1] = closest.g;
          result[i + 2] = closest.b;
          result[i + 3] = 255;
        }
        
        return result;
      },
    },
    
    activate(context) {
      context.registerHook('color-byte', this.hooks.onColorByte);
      context.registerHook('coordinate-map', this.hooks.onCoordinateMap);
      context.registerHook('noise-gen', this.hooks.onNoiseGen);
      context.registerHook('render', this.hooks.onRender);
    },
    
    deactivate(context) {
      context.unregisterHook('color-byte');
      context.unregisterHook('coordinate-map');
      context.unregisterHook('noise-gen');
      context.unregisterHook('render');
    },
  }
);

/**
 * 8-bit NES Style Extension
 * Limited color palette, blocky pixels
 */
export const style8Bit = Object.assign(
  function(payload, context) {
    return {
      ...payload,
      coordinates: style8Bit.hooks.onCoordinateMap(payload.coordinates || [], context),
    };
  },
  {
    id: 'style-8bit',
    type: 'STYLE',
    
    config: {
      resolution: { width: 256, height: 240 },
      colorCount: 16,
      pixelScale: 2,
      scanlines: true,
    },
    
    hooks: {
      onCoordinateMap(coords, _context) {
        const scale = style8Bit.config.pixelScale;
        
        return coords.map(coord => ({
          ...coord,
          x: Math.round((coord.x || 0) / scale) * scale,
          y: Math.round((coord.y || 0) / scale) * scale,
          z: coord.z,
        }));
      },
      
      onRender(buffer, _context) {
        const result = new Uint8ClampedArray(buffer);
        const { colorCount, scanlines } = style8Bit.config;
        const colorSteps = colorCount - 1;
        
        // Color quantization
        for (let i = 0; i < result.length; i += 4) {
          result[i] = Math.round(result[i] / colorSteps) * colorSteps;
          result[i + 1] = Math.round(result[i + 1] / colorSteps) * colorSteps;
          result[i + 2] = Math.round(result[i + 2] / colorSteps) * colorSteps;
        }
        
        // Scanline effect
        if (scanlines) {
          const width = Math.round(Math.sqrt(result.length / 4));
          for (let y = 0; y < result.length / 4; y += 2) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              result[i] = Math.round(result[i] * 0.7);
              result[i + 1] = Math.round(result[i + 1] * 0.7);
              result[i + 2] = Math.round(result[i + 2] * 0.7);
            }
          }
        }
        
        return result;
      },
    },
    
    activate(context) {
      context.registerHook('coordinate-map', this.hooks.onCoordinateMap);
      context.registerHook('render', this.hooks.onRender);
    },
    
    deactivate(context) {
      context.unregisterHook('coordinate-map');
      context.unregisterHook('render');
    },
  }
);

/**
 * 16-bit SNES Style Extension
 * Enhanced colors, mode 7 rotation support
 */
export const style16Bit = {
  id: 'style-16bit',
  type: 'STYLE',
  
  config: Object.freeze({
    resolution: { width: 512, height: 448 },
    colorCount: 256,
    mode7: false,
    rotation: 0,
  }),
  
  hooks: {
    onCoordinateMap(coords, _context) {
      const { mode7, rotation, resolution } = this.config;
      const centerX = resolution.width / 2;
      const centerY = resolution.height / 2;
      
      if (!mode7) return coords;
      
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      
      return coords.map(coord => {
        const dx = (coord.x || 0) - centerX;
        const dy = (coord.y || 0) - centerY;
        
        return {
          ...coord,
          x: Math.round(centerX + (dx * cos - dy * sin)),
          y: Math.round(centerY + (dx * sin + dy * cos)),
        };
      });
    },
    
    onRender(buffer, _context) {
      const result = new Uint8ClampedArray(buffer);
      const { colorCount } = this.config;
      const colorSteps = Math.sqrt(colorCount);
      
      // Enhanced color depth with dithering
      for (let i = 0; i < result.length; i += 4) {
        result[i] = Math.min(255, Math.round(result[i] / colorSteps) * colorSteps);
        result[i + 1] = Math.min(255, Math.round(result[i + 1] / colorSteps) * colorSteps);
        result[i + 2] = Math.min(255, Math.round(result[i + 2] / colorSteps) * colorSteps);
      }
      
      return result;
    },
  },
  
  activate(context) {
    context.registerHook('coordinate-map', this.hooks.onCoordinateMap);
    context.registerHook('render', this.hooks.onRender);
  },
  
  deactivate(context) {
    context.unregisterHook('coordinate-map');
    context.unregisterHook('render');
  },
};

/**
 * CRT Display Style Extension
 * Scanlines, curvature, phosphor glow
 */
export const styleCRT = Object.assign(
  function(payload, _context) {
    return {
      ...payload,
      // No coordinate changes for CRT
    };
  },
  {
    id: 'style-crt',
    type: 'STYLE',
    
    config: {
      scanlineIntensity: 0.3,
      curvature: 0.05,
      phosphorGlow: 0.1,
      chromaBlur: true,
    },
    
    hooks: {
      onRender(buffer, _context) {
        const result = new Uint8ClampedArray(buffer);
        const { scanlineIntensity, curvature, phosphorGlow } = styleCRT.config;
        const size = Math.round(Math.sqrt(result.length / 4));
        
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            
            // Scanline darkening
            if (y % 2 === 1) {
              result[i] = Math.round(result[i] * (1 - scanlineIntensity));
              result[i + 1] = Math.round(result[i + 1] * (1 - scanlineIntensity));
              result[i + 2] = Math.round(result[i + 2] * (1 - scanlineIntensity));
            }
            
            // Curvature vignette
            const nx = x / size - 0.5;
            const ny = y / size - 0.5;
            const dist = Math.sqrt(nx * nx + ny * ny);
            const vignette = 1 - (dist * curvature);
            
            result[i] = Math.round(result[i] * vignette);
            result[i + 1] = Math.round(result[i + 1] * vignette);
            result[i + 2] = Math.round(result[i + 2] * vignette);
            
            // Phosphor glow (simple brightness boost)
            if (phosphorGlow > 0 && result[i] > 200) {
              result[i] = Math.min(255, result[i] + phosphorGlow * 55);
              result[i + 1] = Math.min(255, result[i + 1] + phosphorGlow * 55);
              result[i + 2] = Math.min(255, result[i + 2] + phosphorGlow * 55);
            }
          }
        }
        
        return result;
      },
    },
    
    activate(context) {
      context.registerHook('render', this.hooks.onRender);
    },
    
    deactivate(context) {
      context.unregisterHook('render');
    },
  }
);


/**
 * Export all style extensions
 */
export const STYLE_EXTENSIONS = Object.freeze([
  styleGameBoy,
  style8Bit,
  style16Bit,
  styleCRT,
]);
