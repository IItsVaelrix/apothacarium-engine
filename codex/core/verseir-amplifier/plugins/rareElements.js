import { createTierAmplifier } from '../shared.js';

const RARE_ELEMENT_DOMAINS = Object.freeze([
  Object.freeze({
    id: 'lightning',
    label: 'Lightning',
    lexemes: ['lightning', 'thunder', 'stormbright', 'static', 'volt', 'arc', 'spark', 'flash', 'shock', 'crackle', 'surge', 'thunderhead', 'electrum'],
    archetypes: [
      { id: 'storm_herald', label: 'Storm Herald', weight: 0.98 },
      { id: 'executioner', label: 'Executioner', weight: 0.32 },
    ],
  }),
  Object.freeze({
    id: 'light',
    label: 'Light',
    lexemes: ['light', 'dawn', 'halo', 'gleam', 'radiant', 'sun', 'lumen', 'shine', 'aurora', 'beacon', 'prism', 'flare', 'glory', 'daybreak'],
    archetypes: [
      { id: 'saint', label: 'Saint', weight: 0.94 },
      { id: 'oracle', label: 'Oracle', weight: 0.36 },
    ],
  }),
  Object.freeze({
    id: 'dark',
    label: 'Dark',
    lexemes: ['dark', 'shadow', 'night', 'dusk', 'umbra', 'eclipse', 'black', 'gloom', 'shade', 'midnight', 'murk', 'shroud', 'obsidian', 'raven'],
    archetypes: [
      { id: 'night_knife', label: 'Night Knife', weight: 0.9 },
      { id: 'villain', label: 'Villain', weight: 0.48 },
    ],
  }),
  Object.freeze({
    id: 'psychic',
    label: 'Psychic',
    lexemes: ['psychic', 'mind', 'dream', 'memory', 'thought', 'psyche', 'vision', 'gaze', 'trance', 'reverie', 'intuition', 'lucid', 'nightmare', 'prophecy'],
    archetypes: [
      { id: 'mind_seer', label: 'Mind Seer', weight: 0.97 },
      { id: 'oracle', label: 'Oracle', weight: 0.41 },
    ],
  }),
  Object.freeze({
    id: 'metal',
    label: 'Metal',
    lexemes: ['metal', 'iron', 'steel', 'silver', 'copper', 'blade', 'chain', 'bronze', 'anvil', 'alloy', 'mail', 'forge', 'shield', 'gauntlet'],
    archetypes: [
      { id: 'war_smith', label: 'War Smith', weight: 0.96 },
      { id: 'warden', label: 'Warden', weight: 0.34 },
    ],
  }),
]);

export const rareElementAmplifier = createTierAmplifier({
  id: 'rare_elements',
  label: 'Rare Resonance Lattice',
  tier: 'RARE',
  domains: RARE_ELEMENT_DOMAINS,
  claimedWeight: 0.05,
  tierResonance: 0.88,
});
