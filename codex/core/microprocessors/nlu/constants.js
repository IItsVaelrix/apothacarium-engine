export const INTENT_TYPES = Object.freeze({
  GENERATE_VISUAL: 'GENERATE_VISUAL',
  APPLY_STYLE: 'APPLY_STYLE',
  APPLY_EFFECT: 'APPLY_EFFECT',
  MODIFY_MATERIAL: 'MODIFY_MATERIAL',
  MODIFY_LIGHTING: 'MODIFY_LIGHTING',
  COMPOSE_SCENE: 'COMPOSE_SCENE',
  UNKNOWN: 'UNKNOWN',
});

export const ENTITY_TYPES = Object.freeze({
  SUBJECT: 'SUBJECT',
  MATERIAL: 'MATERIAL',
  COLOR: 'COLOR',
  STYLE: 'STYLE',
  EFFECT: 'EFFECT',
  LIGHTING: 'LIGHTING',
  COMPOSITION: 'COMPOSITION',
  MOOD: 'MOOD',
});

export const INTENT_KEYWORDS = Object.freeze({
  [INTENT_TYPES.GENERATE_VISUAL]: [
    'show', 'display', 'render', 'generate', 'create', 'make', 'visualize',
    'draw', 'paint', 'depict', 'illustrate', 'present',
  ],
  [INTENT_TYPES.APPLY_STYLE]: [
    'style', 'in the style of', 'make it look like', 'convert to',
    'gameboy', '8-bit', '16-bit', 'retro', 'pixel', 'crt',
  ],
  [INTENT_TYPES.APPLY_EFFECT]: [
    'with', 'add', 'apply', 'effect', 'glow', 'shine', 'sparkle',
    'animate', 'motion', 'blur',
  ],
  [INTENT_TYPES.MODIFY_MATERIAL]: [
    'material', 'texture', 'surface', 'made of', 'composed of',
    'metallic', 'stone', 'crystal', 'organic', 'energy',
  ],
  [INTENT_TYPES.MODIFY_LIGHTING]: [
    'light', 'lighting', 'bright', 'dark', 'dim', 'harsh', 'soft',
    'glow', 'illuminate', 'shadow',
  ],
  [INTENT_TYPES.COMPOSE_SCENE]: [
    'compose', 'arrange', 'layout', 'position', 'center',
    'symmetric', 'balanced', 'radial', 'spiral',
  ],
});

export const SUBJECT_KEYWORDS = Object.freeze([
  'dragon', 'knight', 'warrior', 'wizard', 'castle', 'forest', 'mountain',
  'river', 'ocean', 'fire', 'ice', 'lightning', 'shadow', 'light',
  'crystal', 'gem', 'sword', 'shield', 'armor', 'wing', 'tail',
  'tree', 'flower', 'vine', 'stone', 'rock', 'cave', 'temple',
  'palace', 'tower', 'bridge', 'path', 'garden', 'ruin',
  'phoenix', 'wolf', 'eagle', 'serpent', 'tiger', 'lion',
  'moon', 'sun', 'star', 'cloud', 'storm', 'wind',
  'skull', 'bone', 'spirit', 'ghost', 'demon', 'angel',
  'vision', 'mage', 'sorcerer', 'witch', 'fairy', 'elf',
  'dwarf', 'giant', 'unicorn', 'griffin', 'hydra', 'golem',
]);

export const MATERIAL_KEYWORDS = Object.freeze({
  metal: ['metal', 'metallic', 'steel', 'iron', 'gold', 'silver', 'bronze', 'chrome'],
  stone: ['stone', 'rock', 'marble', 'granite', 'concrete', 'brick'],
  organic: ['organic', 'flesh', 'skin', 'wood', 'plant', 'leaf', 'bark'],
  energy: ['energy', 'plasma', 'fire', 'light', 'electric', 'magical', 'ethereal'],
  crystalline: ['crystal', 'gem', 'diamond', 'glass', 'ice', 'prism', 'jewel'],
  fabric: ['fabric', 'cloth', 'silk', 'leather', 'fur', 'feather'],
});

export const STYLE_KEYWORDS = Object.freeze({
  gameboy: ['gameboy', 'game boy', 'gb', 'monochrome', '4-color'],
  '8bit': ['8-bit', '8bit', 'nes', 'nintendo', 'retro'],
  '16bit': ['16-bit', '16bit', 'snes', 'super nintendo', 'super famicom'],
  crt: ['crt', 'television', 'tv', 'monitor', 'scanline'],
  pixel: ['pixel', 'pixelated', 'low-res', 'low resolution', 'blocky'],
});

export const COLOR_KEYWORDS = Object.freeze({
  red: ['red', 'crimson', 'scarlet', 'ruby', 'blood', 'rose'],
  orange: ['orange', 'amber', 'gold', 'sunset'],
  yellow: ['yellow', 'golden', 'lemon', 'sunshine'],
  green: ['green', 'emerald', 'jade', 'forest', 'lime'],
  blue: ['blue', 'azure', 'sapphire', 'ocean', 'sky'],
  purple: ['purple', 'violet', 'amethyst', 'lavender', 'plum'],
  pink: ['pink', 'magenta', 'rose', 'blush'],
  white: ['white', 'silver', 'pearl', 'snow', 'ivory'],
  black: ['black', 'dark', 'obsidian', 'ebony', 'shadow'],
  gray: ['gray', 'grey', 'silver', 'ash', 'slate'],
});

export const LIGHTING_KEYWORDS = Object.freeze({
  bright: ['bright', 'brilliant', 'radiant', 'luminous', 'glowing'],
  dim: ['dim', 'dark', 'shadowy', 'gloomy', 'murky'],
  harsh: ['harsh', 'sharp', 'stark', 'dramatic', 'high-contrast'],
  soft: ['soft', 'gentle', 'diffused', 'warm', 'subtle'],
  cold: ['cold', 'cool', 'icy', 'frosty', 'blue-tinted'],
  warm: ['warm', 'hot', 'fiery', 'orange-tinted', 'golden'],
});

export const MOOD_KEYWORDS = Object.freeze({
  heroic: ['heroic', 'brave', 'noble', 'valiant', 'courageous'],
  dark: ['dark', 'evil', 'sinister', 'menacing', 'ominous'],
  peaceful: ['peaceful', 'calm', 'serene', 'tranquil', 'gentle'],
  mysterious: ['mysterious', 'enigmatic', 'cryptic', 'hidden', 'secret'],
  magical: ['magical', 'mystical', 'enchanted', 'spellbound', 'arcane'],
  fierce: ['fierce', 'aggressive', 'violent', 'intense', 'powerful'],
});

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}
