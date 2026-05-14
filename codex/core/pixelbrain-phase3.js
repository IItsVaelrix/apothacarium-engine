/**
 * PIXELBRAIN PHASE 3 — THREE-LAYER ARCHITECTURE
 * 
 * Layer 1: Linguistic Inference Engine (Semantic Controller)
 * Layer 2: Arithmetic Modeling Processor (Coordinate, Color, Noise)
 * Layer 3: Extension Interface (Physics, Style plugins)
 */

// ============ LAYER 1: LINGUISTIC INFERENCE ============
export {
  SemanticController,
  extractVisualParameters,
  extractVerseVisualParameters,
  applySchoolModifiers,
  applySemanticWeight,
  applyModifiers,
  LEXICAL_VISUAL_DB,
  DEFAULT_VISUAL_PARAMS,
} from './semantic/visual-extractor.js';

export {
  PHONEME_MATERIAL_MAP,
  applyPhoneticModifiers,
  getDominantMaterial,
  getDominantTexture,
  calculateSurfaceHardness,
  DEFAULT_MATERIAL_PROPS,
} from './semantic/phonetic-materials.js';

// ============ LAYER 2: ARITHMETIC MODELING PROCESSOR ============
export {
  mapToCoordinates,
  resolveDominantAxis,
  resolveSymmetryType,
  applyGoldenRatio,
  applySymmetry,
  snapToPixelGrid,
  generateSpiralCoordinates,
  mapSemanticToCoordinateConstraints,
} from './pixelbrain/coordinate-mapping.js';

export {
  bytecodeToPalette,
  getHexForByte,
  generateSemanticPalette,
} from './pixelbrain/color-byte-mapping.js';

export {
  imageToPixelBrainParams,
  mergeImageAndNLUParams,
  generatePaletteFromImage,
  extractCoordinateHints,
} from './pixelbrain/image-to-semantic-bridge.js';

export {
  generatePixelArtFromImage,
  generateSilhouetteFromImage,
  fillShape,
} from './pixelbrain/image-to-pixel-art.js';

export {
  perlinNoiseGrid,
  noiseToTexture,
  applyDithering,
  summarizeNoiseGrid,
  normalizeNoiseSeed,
} from './pixelbrain/procedural-noise.js';

export {
  snapToPixelGrid as snapCoordinates,
  drawPixelatedLine,
  applyPixelArtAliasing,
  summarizePixelBuffer,
} from './pixelbrain/anti-alias-control.js';

export {
  buildPixelBrainTokenBytecode,
  extractColorFeatures,
  mapVowelFamilyToSchoolId,
  calculateRarityFromPhonemes,
  determineEffectFromToken,
} from './pixelbrain/token-to-bytecode.js';

export {
  DEFAULT_PIXELBRAIN_CANVAS,
  GOLDEN_RATIO,
  GOLDEN_ANGLE,
  clamp01,
  createBytecodeString,
  parseBytecodeString,
  createByteMap,
  hslToHex,
} from './pixelbrain/shared.js';

// ============ LAYER 3: EXTENSION INTERFACE ============
export {
  createExtensionRegistry,
} from './pixelbrain/extension-registry.js';

export {
  physicsStretchSquash,
  physicsGravity,
  physicsBounce,
  PHYSICS_EXTENSIONS,
} from './pixelbrain/extensions/physics-extensions.js';

export {
  styleGameBoy,
  style8Bit,
  style16Bit,
  styleCRT,
  STYLE_EXTENSIONS,
} from './pixelbrain/extensions/style-extensions.js';

// ============ VERSEIR AMPLIFIER INTEGRATION ============
export {
  pixelBrainPhase1BridgeAmplifier,
} from './verseir-amplifier/plugins/pixelBrainBridge.js';

export {
  enhanceVerseIR,
  DEFAULT_VERSEIR_AMPLIFIERS,
} from './verseir-amplifier/index.js';
