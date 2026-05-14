import { createTierAmplifier } from '../shared.js';

const COMMON_ELEMENT_DOMAINS = Object.freeze([
  Object.freeze({
    id: 'fire',
    label: 'Fire',
    lexemes: ['fire', 'flame', 'ember', 'ash', 'cinder', 'smoke', 'burn', 'blaze', 'pyre', 'inferno', 'scorch', 'char', 'kindle', 'soot', 'furnace'],
    archetypes: [
      { id: 'pyre_singer', label: 'Pyre Singer', weight: 0.92 },
      { id: 'villain', label: 'Villain', weight: 0.34 },
    ],
  }),
  Object.freeze({
    id: 'water',
    label: 'Water',
    lexemes: ['water', 'river', 'tide', 'wave', 'flood', 'sea', 'rain', 'brine', 'drown', 'current', 'torrent', 'surge', 'undertow', 'foam', 'downpour'],
    archetypes: [
      { id: 'tide_seer', label: 'Tide Seer', weight: 0.9 },
      { id: 'oracle', label: 'Oracle', weight: 0.3 },
    ],
  }),
  Object.freeze({
    id: 'earth',
    label: 'Earth',
    lexemes: ['earth', 'stone', 'soil', 'clay', 'dust', 'grave', 'mountain', 'root', 'salt', 'bedrock', 'granite', 'loam', 'shale', 'quarry', 'terra'],
    archetypes: [
      { id: 'grave_keeper', label: 'Grave Keeper', weight: 0.88 },
      { id: 'warden', label: 'Warden', weight: 0.42 },
    ],
  }),
  Object.freeze({
    id: 'wind',
    label: 'Wind',
    lexemes: ['wind', 'air', 'gale', 'gust', 'sky', 'breath', 'whisper', 'storm', 'draft', 'breeze', 'squall', 'tempest', 'zephyr', 'cyclone', 'vapor'],
    archetypes: [
      { id: 'storm_choir', label: 'Storm Choir', weight: 0.9 },
      { id: 'messenger', label: 'Messenger', weight: 0.38 },
    ],
  }),
  Object.freeze({
    id: 'frost',
    label: 'Frost',
    lexemes: ['ice', 'frost', 'snow', 'cold', 'winter', 'rime', 'crystal', 'freeze', 'glacier', 'hail', 'sleet', 'icicle', 'permafrost', 'blizzard'],
    archetypes: [
      { id: 'crypt_warden', label: 'Crypt Warden', weight: 0.93 },
      { id: 'villain', label: 'Villain', weight: 0.28 },
    ],
  }),
]);

export const commonElementAmplifier = createTierAmplifier({
  id: 'common_elements',
  label: 'Common Elemental Lattice',
  tier: 'COMMON',
  domains: COMMON_ELEMENT_DOMAINS,
  claimedWeight: 0.05,
  tierResonance: 0.72,
});
