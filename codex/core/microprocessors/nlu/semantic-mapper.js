import { ENTITY_TYPES } from './constants.js';
import { LEXICAL_VISUAL_DB } from '../../semantic/visual-extractor.js';

export function mapEntitiesToSemanticParameters({ entities, intent: _intent }) {
  const params = {
    surface: {
      material: 'stone',
      reflectivity: 0.3,
      roughness: 0.5,
      texture: 'grained',
    },
    form: {
      scale: 1.0,
      symmetry: 'none',
      complexity: 0.5,
      dominantAxis: 'horizontal',
    },
    light: {
      angle: 45,
      hardness: 0.5,
      color: '#888888',
      intensity: 0.5,
    },
    color: {
      primaryHue: 0,
      saturation: 0.5,
      brightness: 0.5,
      paletteSize: 4,
    },
    style: null,
    effects: [],
  };
  
  // Apply material
  if (entities[ENTITY_TYPES.MATERIAL] && entities[ENTITY_TYPES.MATERIAL].length > 0) {
    const material = entities[ENTITY_TYPES.MATERIAL][0];
    params.surface.material = material;
    
    const materialDefaults = {
      metal: { reflectivity: 0.8, roughness: 0.3, texture: 'smooth' },
      stone: { reflectivity: 0.15, roughness: 0.9, texture: 'grained' },
      organic: { reflectivity: 0.3, roughness: 0.7, texture: 'fibrous' },
      energy: { reflectivity: 0.5, roughness: 0.4, texture: 'smooth' },
      crystalline: { reflectivity: 0.9, roughness: 0.1, texture: 'crystalline' },
      fabric: { reflectivity: 0.2, roughness: 0.6, texture: 'fibrous' },
    };
    
    Object.assign(params.surface, materialDefaults[material] || {});
  }
  
  // Apply color
  if (entities[ENTITY_TYPES.COLOR] && entities[ENTITY_TYPES.COLOR].length > 0) {
    const color = entities[ENTITY_TYPES.COLOR][0];
    const colorHues = {
      red: 0,
      orange: 30,
      yellow: 60,
      green: 120,
      blue: 210,
      purple: 270,
      pink: 330,
      white: 0,
      black: 0,
      gray: 0,
    };
    
    params.color.primaryHue = colorHues[color] || 0;
    
    // Adjust saturation/brightness based on color
    if (color === 'white' || color === 'silver') {
      params.color.brightness = 0.9;
      params.color.saturation = 0.1;
    } else if (color === 'black' || color === 'dark') {
      params.color.brightness = 0.15;
    } else if (['red', 'orange', 'yellow'].includes(color)) {
      params.color.saturation = 0.8;
      params.color.brightness = 0.6;
    } else if (['blue', 'purple'].includes(color)) {
      params.color.saturation = 0.7;
      params.color.brightness = 0.5;
    }
    
    // Set light color
    const colorHexMap = {
      red: '#FF4500',
      orange: '#FFA500',
      yellow: '#FFD700',
      green: '#228B22',
      blue: '#4169E1',
      purple: '#9370DB',
      pink: '#FF69B4',
      white: '#FFFFFF',
      black: '#1A1A1A',
      gray: '#808080',
    };
    params.light.color = colorHexMap[color] || params.light.color;
  }
  
  // Apply lighting
  if (entities[ENTITY_TYPES.LIGHTING] && entities[ENTITY_TYPES.LIGHTING].length > 0) {
    const lighting = entities[ENTITY_TYPES.LIGHTING][0];
    const lightingDefaults = {
      bright: { intensity: 0.9, hardness: 0.6 },
      dim: { intensity: 0.2, hardness: 0.3 },
      harsh: { intensity: 0.8, hardness: 0.95 },
      soft: { intensity: 0.5, hardness: 0.2 },
      cold: { color: '#4169E1', intensity: 0.6 },
      warm: { color: '#FF6347', intensity: 0.7 },
    };
    
    Object.assign(params.light, lightingDefaults[lighting] || {});
  }
  
  // Apply mood to form/lighting
  if (entities[ENTITY_TYPES.MOOD] && entities[ENTITY_TYPES.MOOD].length > 0) {
    const mood = entities[ENTITY_TYPES.MOOD][0];
    const moodDefaults = {
      heroic: { form: { scale: 1.3, symmetry: 'vertical' }, light: { intensity: 0.8, color: '#FFD700' } },
      dark: { form: { scale: 1.2, symmetry: 'none' }, light: { intensity: 0.25, hardness: 0.7, color: '#2F2F4F' } },
      peaceful: { form: { scale: 1.0, symmetry: 'horizontal' }, light: { intensity: 0.5, hardness: 0.3, color: '#87CEEB' } },
      mysterious: { form: { scale: 1.1, symmetry: 'radial' }, light: { intensity: 0.35, hardness: 0.4, color: '#9370DB' } },
      magical: { form: { scale: 1.2, symmetry: 'radial' }, light: { intensity: 0.7, hardness: 0.5, color: '#E0FFFF' } },
      fierce: { form: { scale: 1.4, symmetry: 'diagonal' }, light: { intensity: 0.85, hardness: 0.8, color: '#FF4500' } },
    };
    
    const moodConfig = moodDefaults[mood] || {};
    if (moodConfig.form) Object.assign(params.form, moodConfig.form);
    if (moodConfig.light) Object.assign(params.light, moodConfig.light);
  }
  
  // Apply composition
  if (entities[ENTITY_TYPES.COMPOSITION] && entities[ENTITY_TYPES.COMPOSITION].length > 0) {
    const composition = entities[ENTITY_TYPES.COMPOSITION][0];
    const compositionDefaults = {
      centered: { symmetry: 'vertical', dominantAxis: 'vertical' },
      symmetric: { symmetry: 'vertical' },
      radial: { symmetry: 'radial', dominantAxis: 'radial' },
      spiral: { symmetry: 'radial', dominantAxis: 'radial' },
      balanced: { symmetry: 'horizontal' },
      asymmetric: { symmetry: 'none' },
    };
    
    Object.assign(params.form, compositionDefaults[composition] || {});
  }
  
  // Apply style
  if (entities[ENTITY_TYPES.STYLE] && entities[ENTITY_TYPES.STYLE].length > 0) {
    params.style = entities[ENTITY_TYPES.STYLE][0];
  }
  
  // Apply effects
  if (entities[ENTITY_TYPES.EFFECT] && entities[ENTITY_TYPES.EFFECT].length > 0) {
    params.effects = entities[ENTITY_TYPES.EFFECT];
  }
  
  // Apply subject-specific defaults
  if (entities[ENTITY_TYPES.SUBJECT] && entities[ENTITY_TYPES.SUBJECT].length > 0) {
    const subject = entities[ENTITY_TYPES.SUBJECT][0];
    const subjectDefaults = LEXICAL_VISUAL_DB.get(subject);
    if (subjectDefaults) {
      // Merge with lower priority than explicit entities
      params.surface = { ...subjectDefaults.surface, ...params.surface };
      params.form = { ...subjectDefaults.form, ...params.form };
      params.light = { ...subjectDefaults.light, ...params.light };
    }
  }
  
  return Object.freeze(params);
}
