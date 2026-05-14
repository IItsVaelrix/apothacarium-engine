import { createTierAmplifier } from '../shared.js';

const INEXPLICABLE_ELEMENT_DOMAINS = Object.freeze([
  Object.freeze({
    id: 'cosmic',
    label: 'Cosmic',
    lexemes: ['cosmic', 'astral', 'celestial', 'orbit', 'nebula', 'comet', 'firmament', 'star', 'galaxy', 'meteor', 'constellation', 'supernova', 'voidstar', 'equinox'],
    archetypes: [
      { id: 'star_oracle', label: 'Star Oracle', weight: 0.99 },
      { id: 'world_seer', label: 'World Seer', weight: 0.38 },
    ],
  }),
  Object.freeze({
    id: 'mythic',
    label: 'Mythic',
    lexemes: ['mythic', 'dragon', 'phoenix', 'titan', 'oracle', 'omen', 'relic', 'fable', 'hydra', 'chimera', 'gryphon', 'leviathan', 'rune', 'shrine'],
    archetypes: [
      { id: 'legend_walker', label: 'Legend Walker', weight: 0.98 },
      { id: 'oracle', label: 'Oracle', weight: 0.34 },
    ],
  }),
  Object.freeze({
    id: 'legendary',
    label: 'Legendary',
    lexemes: ['legendary', 'immortal', 'eternal', 'epic', 'throne', 'crown', 'saga', 'heroic', 'monarch', 'dynasty', 'ascendant', 'sovereign', 'heirloom', 'valor'],
    archetypes: [
      { id: 'sovereign', label: 'Sovereign', weight: 0.97 },
      { id: 'legend_walker', label: 'Legend Walker', weight: 0.3 },
    ],
  }),
  Object.freeze({
    id: 'source',
    label: 'Source',
    lexemes: ['source', 'genesis', 'origin', 'prime', 'firstword', 'logos', 'true-name', 'alphabet', 'lexicon', 'sigil', 'alpha', 'scripture', 'namefire', 'progenitor'],
    archetypes: [
      { id: 'first_tongue', label: 'First Tongue', weight: 1 },
      { id: 'source_bearer', label: 'Source Bearer', weight: 0.46 },
    ],
  }),
]);

export const inexplicableElementAmplifier = createTierAmplifier({
  id: 'inexplicable_elements',
  label: 'Inexplicable Crown',
  tier: 'INEXPLICABLE',
  domains: INEXPLICABLE_ELEMENT_DOMAINS,
  claimedWeight: 0.05,
  tierResonance: 1,
});
