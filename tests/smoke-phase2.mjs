import { generateSemanticPalette, bytecodeToPalette, getHexForByte } from '../core/color-byte-mapping.js';
import { COSMIC_HERBAL, SCHOLOMANCE_FOLK, EARTH_DEAD, validatePalette, getPreset } from '../core/color-apothecary-presets.js';
import { analyzeImageToFormula, formulaToBytecode, FORMULA_TYPES, GRID_TYPES, COLOR_FORMULA_TYPES } from '../core/image-to-bytecode-formula.js';
import { generatePixelArtFromImage, generateSilhouetteFromImage, fillShape, transcribeFullPixelData } from '../core/image-to-pixel-art.js';

// 1. Palette validation
console.log('=== palettes ===');
for (const p of [COSMIC_HERBAL, SCHOLOMANCE_FOLK, EARTH_DEAD]) {
  const v = validatePalette(p);
  console.log(p.name, '→', v.ok ? 'OK' : 'FAIL', v.violations);
}

// 2. Semantic palette gen
console.log('=== semantic palette ===');
const pal = generateSemanticPalette({ primaryHue: 142, saturation: 0.4, brightness: 0.45 });
console.log('size:', pal.paletteSize, 'colors:', pal.colors);

// 3. Bytecode → palette via preset
console.log('=== bytecode→palette ===');
const bp = bytecodeToPalette('PB-cosmic-herbal-COMMON-INERT');
console.log('schoolId(presetId):', bp.schoolId, 'colors:', bp.colors);
const hex = getHexForByte('PB-cosmic-herbal-COMMON-INERT', 17);
console.log('byte 17 hex:', hex);

// 4. Formula extraction from synthetic image
console.log('=== formula extraction ===');
const w = 16, h = 16;
const pd = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < pd.length; i += 4) {
  pd[i] = 80; pd[i+1] = 124; pd[i+2] = 89; pd[i+3] = 255;
}
const analysis = { pixelData: pd, dimensions: { width: w, height: h }, colors: [{ hex: '#4A7C59', percentage: 100 }] };
const formula = analyzeImageToFormula(analysis);
console.log('formula type:', formula.type, 'gridType:', formula.gridType);
const bytecode = formulaToBytecode(formula);
console.log('bytecode lines:', bytecode.length);

// 5. Pixel art generation (sync)
console.log('=== pixel art ===');
const art = generatePixelArtFromImage({ ...analysis, coordinates: [{x:1,y:1,color:'#4A7C59',emphasis:0.5}], composition: {} }, { width: 32, height: 32, gridSize: 1 });
console.log('art coords:', art.coordinates.length, 'palette:', art.palettes.length);

// 6. Silhouette + fill
console.log('=== silhouette ===');
const sil = generateSilhouetteFromImage(analysis, { width: 32, height: 32, gridSize: 1 });
console.log('silhouette pts:', sil.length);
const filled = fillShape(sil, { width: 32, height: 32, gridSize: 1 }, '#FFBF00');
console.log('fill pts:', filled.length);

console.log('---');
console.log('Phase 2 smoke OK');
