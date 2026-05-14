import {
  ENTITY_TYPES,
  SUBJECT_KEYWORDS,
  MATERIAL_KEYWORDS,
  COLOR_KEYWORDS,
  STYLE_KEYWORDS,
  LIGHTING_KEYWORDS,
  MOOD_KEYWORDS
} from './constants.js';

/**
 * Extract entities from tokens
 * @param {Object} payload - { tokens: string[], fullText: string }
 * @returns {Object} entities
 */
export function extractEntities({ tokens, fullText }) {
  const entities = {
    [ENTITY_TYPES.SUBJECT]: [],
    [ENTITY_TYPES.MATERIAL]: [],
    [ENTITY_TYPES.COLOR]: [],
    [ENTITY_TYPES.STYLE]: [],
    [ENTITY_TYPES.EFFECT]: [],
    [ENTITY_TYPES.LIGHTING]: [],
    [ENTITY_TYPES.COMPOSITION]: [],
    [ENTITY_TYPES.MOOD]: [],
  };
  
  // Extract subjects
  for (const subject of SUBJECT_KEYWORDS) {
    if (tokens.includes(subject)) {
      entities[ENTITY_TYPES.SUBJECT].push(subject);
    }
  }
  
  // Extract materials
  for (const [material, keywords] of Object.entries(MATERIAL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (tokens.includes(keyword)) {
        entities[ENTITY_TYPES.MATERIAL].push(material);
        break;
      }
    }
  }
  
  // Extract colors
  for (const [color, keywords] of Object.entries(COLOR_KEYWORDS)) {
    for (const keyword of keywords) {
      if (tokens.includes(keyword)) {
        entities[ENTITY_TYPES.COLOR].push(color);
        break;
      }
    }
  }
  
  // Extract styles
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (tokens.includes(keyword) || fullText.toLowerCase().includes(keyword)) {
        entities[ENTITY_TYPES.STYLE].push(style);
        break;
      }
    }
  }
  
  // Extract lighting
  for (const [lighting, keywords] of Object.entries(LIGHTING_KEYWORDS)) {
    for (const keyword of keywords) {
      if (tokens.includes(keyword)) {
        entities[ENTITY_TYPES.LIGHTING].push(lighting);
        break;
      }
    }
  }
  
  // Extract mood
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    for (const keyword of keywords) {
      if (tokens.includes(keyword)) {
        entities[ENTITY_TYPES.MOOD].push(mood);
        break;
      }
    }
  }
  
  // Extract composition keywords
  const compositionKeywords = ['centered', 'symmetric', 'radial', 'spiral', 'balanced', 'asymmetric'];
  for (const keyword of compositionKeywords) {
    if (tokens.includes(keyword)) {
      entities[ENTITY_TYPES.COMPOSITION].push(keyword);
    }
  }
  
  // Extract effects
  const effectKeywords = ['fire', 'ice', 'lightning', 'glow', 'sparkle', 'shadow', 'wind', 'storm'];
  for (const keyword of effectKeywords) {
    if (tokens.includes(keyword) && !entities[ENTITY_TYPES.SUBJECT].includes(keyword)) {
      entities[ENTITY_TYPES.EFFECT].push(keyword);
    }
  }
  
  // Deduplicate
  for (const key of Object.keys(entities)) {
    entities[key] = [...new Set(entities[key])];
  }
  
  return Object.freeze(entities);
}