function createArchetype(id, label, weight) {
  return Object.freeze({
    id,
    label,
    weight,
  });
}

function createDomain(id, label, school, lexemes, archetypes) {
  return Object.freeze({
    id,
    label,
    school,
    lexemes: Object.freeze(lexemes),
    archetypes: Object.freeze(archetypes),
  });
}

function createMetaphor(id, label, school, patterns, tokenHints, archetypes) {
  return Object.freeze({
    id,
    label,
    school,
    patterns: Object.freeze(patterns),
    tokenHints: Object.freeze(tokenHints),
    archetypes: Object.freeze(archetypes),
  });
}

function createConsonantFamily(id, label, school, signatures, examples, archetypes) {
  return Object.freeze({
    id,
    label,
    school,
    signatures: Object.freeze(signatures),
    examples: Object.freeze(examples),
    archetypes: Object.freeze(archetypes),
  });
}

function createEtymologyProfile(id, label, school, { lexemes = [], prefixes = [], suffixes = [] }, archetypes) {
  return Object.freeze({
    id,
    label,
    school,
    lexemes: Object.freeze(lexemes),
    prefixes: Object.freeze(prefixes),
    suffixes: Object.freeze(suffixes),
    archetypes: Object.freeze(archetypes),
  });
}

export const SEMANTIC_FIELDS = Object.freeze([
  createDomain(
    'violence',
    'Violence/Wound',
    'WILL',
    ['blade', 'blood', 'bone', 'break', 'bruise', 'cut', 'gash', 'scar', 'sever', 'shatter', 'steel', 'strike', 'sunder', 'wound'],
    [
      createArchetype('blade_witness', 'Blade Witness', 0.92),
      createArchetype('wound_prophet', 'Wound Prophet', 0.84),
    ]
  ),
  createDomain(
    'tenderness',
    'Tenderness/Mercy',
    'ALCHEMY',
    ['caress', 'cradle', 'gentle', 'grace', 'kiss', 'mercy', 'soft', 'soothe', 'tender', 'touch', 'warm'],
    [
      createArchetype('mercy_saint', 'Mercy Saint', 0.9),
      createArchetype('soft_hand', 'Soft Hand', 0.76),
    ]
  ),
  createDomain(
    'mystery',
    'Mystery/Veil',
    'VOID',
    ['dark', 'hidden', 'hush', 'masked', 'occult', 'secret', 'shadow', 'unknown', 'unseen', 'veiled', 'whisper'],
    [
      createArchetype('veiled_oracle', 'Veiled Oracle', 0.94),
      createArchetype('whisper_saint', 'Whisper Saint', 0.72),
    ]
  ),
  createDomain(
    'transformation',
    'Transformation/Consumption',
    'ALCHEMY',
    ['absorb', 'become', 'change', 'consume', 'devour', 'dissolve', 'ferment', 'melt', 'render', 'swallow', 'transmute'],
    [
      createArchetype('furnace_alchemist', 'Furnace Alchemist', 0.93),
      createArchetype('hollow_crucible', 'Hollow Crucible', 0.7),
    ]
  ),
  createDomain(
    'body',
    'Body/Flesh',
    'WILL',
    ['blood', 'bone', 'flesh', 'heart', 'mouth', 'rib', 'skin', 'teeth', 'throat', 'tongue', 'wound'],
    [
      createArchetype('flesh_scribe', 'Flesh Scribe', 0.88),
      createArchetype('red_witness', 'Red Witness', 0.74),
    ]
  ),
  createDomain(
    'divination',
    'Sign/Omen',
    'PSYCHIC',
    ['augury', 'eye', 'fate', 'mirror', 'omen', 'oracle', 'prophecy', 'sign', 'star', 'vision', 'witness'],
    [
      createArchetype('mirror_oracle', 'Mirror Oracle', 0.95),
      createArchetype('star_reader', 'Star Reader', 0.79),
    ]
  ),
  createDomain(
    'journey',
    'Path/Threshold',
    'WILL',
    ['beyond', 'bridge', 'climb', 'cross', 'descend', 'gate', 'path', 'return', 'road', 'step', 'threshold', 'through'],
    [
      createArchetype('threshold_walker', 'Threshold Walker', 0.9),
      createArchetype('gate_bearer', 'Gate Bearer', 0.76),
    ]
  ),
]);

export const IMAGE_SCHEMAS = Object.freeze([
  createDomain(
    'container',
    'Container Schema',
    'VOID',
    ['belly', 'chamber', 'cup', 'hollow', 'inside', 'mouth', 'room', 'skin', 'vessel', 'within', 'womb'],
    [
      createArchetype('vessel_keeper', 'Vessel Keeper', 0.88),
      createArchetype('hollow_guard', 'Hollow Guard', 0.68),
    ]
  ),
  createDomain(
    'path',
    'Path Schema',
    'WILL',
    ['across', 'beyond', 'bridge', 'cross', 'gate', 'into', 'path', 'road', 'step', 'through', 'threshold', 'toward'],
    [
      createArchetype('road_warden', 'Road Warden', 0.86),
      createArchetype('threshold_seer', 'Threshold Seer', 0.78),
    ]
  ),
  createDomain(
    'force',
    'Force Schema',
    'WILL',
    ['break', 'crush', 'drag', 'drive', 'force', 'press', 'pull', 'push', 'shatter', 'strike'],
    [
      createArchetype('iron_will', 'Iron Will', 0.9),
      createArchetype('ram_king', 'Ram King', 0.7),
    ]
  ),
  createDomain(
    'link',
    'Link Schema',
    'PSYCHIC',
    ['bind', 'bond', 'braid', 'chain', 'clasp', 'join', 'knot', 'marry', 'tether', 'yoke'],
    [
      createArchetype('bond_weaver', 'Bond Weaver', 0.87),
      createArchetype('chain_sibyl', 'Chain Sibyl', 0.69),
    ]
  ),
  createDomain(
    'balance',
    'Balance Schema',
    'ALCHEMY',
    ['balance', 'bargain', 'counter', 'equal', 'measure', 'poise', 'scale', 'tilt', 'trade', 'weigh'],
    [
      createArchetype('scale_keeper', 'Scale Keeper', 0.9),
      createArchetype('measure_saint', 'Measure Saint', 0.7),
    ]
  ),
]);

export const CONCEPTUAL_METAPHORS = Object.freeze([
  createMetaphor(
    'darkness_identity',
    'Darkness as Identity',
    'VOID',
    [
      /\b(?:i am|i'm|we are|become|became)\s+(?:the\s+)?(?:shadow|darkness|void|night|hollow)\b/i,
    ],
    ['darkness', 'hollow', 'night', 'shadow', 'void'],
    [
      createArchetype('shadow_self', 'Shadow Self', 0.97),
      createArchetype('night_king', 'Night King', 0.72),
    ]
  ),
  createMetaphor(
    'consumption_transformation',
    'Consumption as Transformation',
    'ALCHEMY',
    [
      /\b(?:devour|consume|swallow|absorb|drink)\b(?:\W+\w+){0,3}\W+(?:light|name|memory|fear|grief|silence|fire)\b/i,
    ],
    ['absorb', 'consume', 'devour', 'drink', 'swallow', 'transmute'],
    [
      createArchetype('furnace_alchemist', 'Furnace Alchemist', 0.95),
      createArchetype('mouth_of_change', 'Mouth of Change', 0.73),
    ]
  ),
  createMetaphor(
    'wound_as_mouth',
    'Wound as Mouth',
    'WILL',
    [
      /\b(?:wound|scar|cut|gash)\b(?:\W+\w+){0,3}\W+(?:mouth|tongue|sing|speak)\b/i,
    ],
    ['cut', 'gash', 'mouth', 'scar', 'speak', 'tongue', 'wound'],
    [
      createArchetype('red_oracle', 'Red Oracle', 0.92),
      createArchetype('scar_singer', 'Scar Singer', 0.8),
    ]
  ),
  createMetaphor(
    'silence_as_substance',
    'Silence as Substance',
    'PSYCHIC',
    [
      /\b(?:silence|quiet|hush)\b(?:\W+\w+){0,3}\W+(?:cuts?|bleeds?|burns?|breaks?|opens?|thickens?)\b/i,
    ],
    ['break', 'burn', 'cut', 'hush', 'quiet', 'silence'],
    [
      createArchetype('hush_physician', 'Hush Physician', 0.86),
      createArchetype('quiet_knife', 'Quiet Knife', 0.78),
    ]
  ),
  createMetaphor(
    'self_as_vessel',
    'Self as Vessel',
    'VOID',
    [
      /\b(?:i am|i'm|my body is|my heart is)\b(?:\W+\w+){0,3}\W+(?:vessel|altar|grave|mirror|furnace|mouth)\b/i,
    ],
    ['altar', 'body', 'furnace', 'grave', 'heart', 'mirror', 'mouth', 'vessel'],
    [
      createArchetype('vessel_king', 'Vessel King', 0.89),
      createArchetype('grave_mirror', 'Grave Mirror', 0.72),
    ]
  ),
]);

export const CONSONANT_FAMILIES = Object.freeze([
  createConsonantFamily(
    'kr_impact',
    'KR Impact Cluster',
    'WILL',
    ['KR'],
    ['crack', 'crash', 'crush', 'crumble'],
    [
      createArchetype('iron_jaw', 'Iron Jaw', 0.9),
      createArchetype('breaker_saint', 'Breaker Saint', 0.72),
    ]
  ),
  createConsonantFamily(
    'gr_grind',
    'GR Grind Cluster',
    'SONIC',
    ['GR'],
    ['grave', 'grind', 'groan', 'growl'],
    [
      createArchetype('grit_cantor', 'Grit Cantor', 0.86),
      createArchetype('gravel_herald', 'Gravel Herald', 0.68),
    ]
  ),
  createConsonantFamily(
    'sl_dissolution',
    'SL Slip/Dissolve Cluster',
    'ALCHEMY',
    ['SL'],
    ['slide', 'slime', 'slip', 'slither'],
    [
      createArchetype('slime_alchemist', 'Slime Alchemist', 0.88),
      createArchetype('slick_adept', 'Slick Adept', 0.66),
    ]
  ),
  createConsonantFamily(
    'fl_flux',
    'FL Flux Cluster',
    'VOID',
    ['FL'],
    ['flee', 'float', 'flow', 'flood'],
    [
      createArchetype('flux_runner', 'Flux Runner', 0.85),
      createArchetype('flood_ghost', 'Flood Ghost', 0.69),
    ]
  ),
  createConsonantFamily(
    'sh_hush',
    'SH Hush Cluster',
    'PSYCHIC',
    ['SH'],
    ['shadow', 'shake', 'shiver', 'shroud'],
    [
      createArchetype('whisper_seer', 'Whisper Seer', 0.91),
      createArchetype('shroud_reader', 'Shroud Reader', 0.71),
    ]
  ),
  createConsonantFamily(
    'th_witness',
    'TH Witness Cluster',
    'PSYCHIC',
    ['TH', 'DH'],
    ['that', 'thee', 'them', 'there', 'this', 'thou'],
    [
      createArchetype('deictic_witness', 'Deictic Witness', 0.87),
      createArchetype('pointing_sibyl', 'Pointing Sibyl', 0.67),
    ]
  ),
]);

export const FIELD_TENSION_PAIRS = Object.freeze([
  Object.freeze({
    id: 'violence_tenderness',
    label: 'Violence meeting Tenderness',
    left: 'violence',
    right: 'tenderness',
    weight: 0.96,
  }),
  Object.freeze({
    id: 'mystery_divination',
    label: 'Mystery meeting Divination',
    left: 'mystery',
    right: 'divination',
    weight: 0.84,
  }),
  Object.freeze({
    id: 'body_transformation',
    label: 'Body meeting Transformation',
    left: 'body',
    right: 'transformation',
    weight: 0.86,
  }),
]);

export const HIGH_REGISTER_TOKENS = Object.freeze([
  'altar',
  'amongst',
  'behold',
  'covenant',
  'hallowed',
  'hence',
  'hither',
  'litany',
  'psalm',
  'thee',
  'thine',
  'thou',
  'thy',
  'unto',
  'vesper',
  'whilst',
]);

export const LOW_REGISTER_TOKENS = Object.freeze([
  "ain't",
  'bastard',
  'damn',
  'damned',
  'fuck',
  'fucking',
  'gut',
  'guts',
  'shit',
  'spit',
  'wanna',
]);

export const ETYMOLOGY_PROFILES = Object.freeze([
  createEtymologyProfile(
    'latinate',
    'Latinate Register',
    'ALCHEMY',
    {
      lexemes: ['cadence', 'consume', 'memory', 'oracle', 'resonance', 'silence', 'transmute', 'vessel', 'vision'],
      suffixes: ['ance', 'ence', 'ity', 'ment', 'orium', 'sion', 'tion', 'tude'],
    },
    [
      createArchetype('court_alchemist', 'Court Alchemist', 0.85),
      createArchetype('velvet_magister', 'Velvet Magister', 0.64),
    ]
  ),
  createEtymologyProfile(
    'greek',
    'Greek Arcana',
    'PSYCHIC',
    {
      lexemes: ['chaos', 'echo', 'glyph', 'oracle', 'phantom', 'prophecy'],
      prefixes: ['astro', 'chrono', 'geo', 'hydro', 'meta', 'micro', 'necro', 'psy', 'psycho', 'pyro', 'theo'],
      suffixes: ['graph', 'logy', 'phage', 'scope'],
    },
    [
      createArchetype('mirror_logician', 'Mirror Logician', 0.83),
      createArchetype('necrotic_scholar', 'Necrotic Scholar', 0.67),
    ]
  ),
  createEtymologyProfile(
    'germanic',
    'Germanic Strike',
    'WILL',
    {
      lexemes: ['ash', 'blood', 'bone', 'breath', 'dark', 'doom', 'fire', 'grave', 'hand', 'heart', 'knife', 'shield', 'stone', 'storm', 'word', 'wound'],
    },
    [
      createArchetype('ash_king', 'Ash King', 0.84),
      createArchetype('bone_singer', 'Bone Singer', 0.69),
    ]
  ),
]);

export const EMOTION_ARCHETYPES = Object.freeze({
  anger: Object.freeze({ id: 'ruin_cantor', label: 'Ruin Cantor', weight: 0.82 }),
  anticipation: Object.freeze({ id: 'threshold_seer', label: 'Threshold Seer', weight: 0.74 }),
  disgust: Object.freeze({ id: 'rot_judge', label: 'Rot Judge', weight: 0.78 }),
  fear: Object.freeze({ id: 'pale_witness', label: 'Pale Witness', weight: 0.86 }),
  joy: Object.freeze({ id: 'dawn_throat', label: 'Dawn Throat', weight: 0.7 }),
  sadness: Object.freeze({ id: 'ash_psalter', label: 'Ash Psalter', weight: 0.81 }),
  surprise: Object.freeze({ id: 'storm_herald', label: 'Storm Herald', weight: 0.72 }),
  trust: Object.freeze({ id: 'oath_keeper', label: 'Oath Keeper', weight: 0.76 }),
});
