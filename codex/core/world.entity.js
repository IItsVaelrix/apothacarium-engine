const WORLD_ENTITY_KIND_SET = new Set(['item', 'npc', 'location', 'glyph']);
const POS_NOUN_SET = new Set(['noun', 'n']);
const POS_VERB_SET = new Set(['verb', 'v']);
const POS_ADJECTIVE_SET = new Set(['adjective', 'adj', 'a']);

const MATERIAL_KEYWORDS = new Set([
  'amber', 'ash', 'brass', 'cinder', 'crystal', 'glass', 'gold', 'iron',
  'liquid', 'mercury', 'metal', 'mineral', 'obsidian', 'ore', 'powder',
  'salt', 'silver', 'smoke', 'stone', 'sulfur', 'vapor',
]);

const LOCATION_KEYWORDS = new Set([
  'altar', 'archive', 'atrium', 'bridge', 'chamber', 'court', 'crypt',
  'door', 'forest', 'gate', 'hall', 'library', 'room', 'sanctum', 'tower',
  'vault', 'vestibule',
]);

const BEAST_KEYWORDS = new Set([
  'beast', 'bird', 'creature', 'dog', 'dragon', 'hound', 'monster', 'serpent',
  'shade', 'spider', 'spirit', 'wolf', 'wyrm',
]);

const SCHOOL_KEYWORDS = Object.freeze({
  SONIC: new Set(['echo', 'loud', 'noise', 'resonance', 'resonate', 'ring', 'shatter', 'silence', 'song', 'sound', 'voice']),
  PSYCHIC: new Set(['dream', 'fear', 'gaze', 'memory', 'mind', 'mnemonic', 'oracle', 'thought', 'vision']),
  VOID: new Set(['dark', 'entropy', 'hollow', 'null', 'night', 'shadow', 'vacuum', 'void']),
  ALCHEMY: new Set(['acid', 'elixir', 'mercury', 'mixture', 'remedy', 'salve', 'transmute', 'vial']),
  WILL: new Set(['command', 'crown', 'imperative', 'law', 'oath', 'resolve', 'shield', 'strike', 'vow']),
});

export const WORLD_ENTITY_KINDS = Object.freeze([...WORLD_ENTITY_KIND_SET]);
export const DEFAULT_WORLD_ROOM_ID = 'scriptorium-atrium';

export const DEFAULT_WORLD_ROOMS = Object.freeze([
  Object.freeze({
    id: DEFAULT_WORLD_ROOM_ID,
    name: 'Scriptorium Atrium',
    description: 'A parchment-lit vestibule where words condense into relics before the lesson begins.',
    school: 'SONIC',
    state: Object.freeze({
      atmosphere: 'vellum-hush',
      chapter: 'threshold',
    }),
  }),
]);

export const DEFAULT_WORLD_ENTITIES = Object.freeze([
  Object.freeze({
    id: 'entity-obsidian-lantern',
    kind: 'item',
    lexeme: 'obsidian',
    roomId: DEFAULT_WORLD_ROOM_ID,
    seed: 'obsidian:scriptorium-atrium',
    actions: Object.freeze(['inspect']),
    state: Object.freeze({
      condition: 'stable',
      attunement: 'dormant',
    }),
    metadata: Object.freeze({
      displayName: 'Obsidian Lantern',
      shortDescription: 'A black-glass lantern drinks the gold from nearby light.',
      themeSchool: 'VOID',
    }),
  }),
  Object.freeze({
    id: 'entity-mercury-reed',
    kind: 'item',
    lexeme: 'mercury',
    roomId: DEFAULT_WORLD_ROOM_ID,
    seed: 'mercury:scriptorium-atrium',
    actions: Object.freeze(['inspect']),
    state: Object.freeze({
      condition: 'sealed',
      attunement: 'volatile',
    }),
    metadata: Object.freeze({
      displayName: 'Mercury Reed',
      shortDescription: 'A silver writing reed trembles as if it wants to revise the room.',
      themeSchool: 'ALCHEMY',
    }),
  }),
  Object.freeze({
    id: 'entity-resonate-sigil',
    kind: 'glyph',
    lexeme: 'resonate',
    roomId: DEFAULT_WORLD_ROOM_ID,
    seed: 'resonate:scriptorium-atrium',
    actions: Object.freeze(['inspect']),
    state: Object.freeze({
      condition: 'awake',
      attunement: 'singing',
    }),
    metadata: Object.freeze({
      displayName: 'Sigil of Resonance',
      shortDescription: 'A suspended glyph hums before sound becomes force.',
      themeSchool: 'SONIC',
    }),
  }),
]);

function stableHash(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function titleCase(value) {
  return String(value || '')
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function normalizeTokens(values) {
  return values
    .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/g))
    .filter(Boolean);
}

function normalizePosList(pos) {
  const values = Array.isArray(pos) ? pos : [pos];
  return values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function firstDefinitionText(lexicalData) {
  if (typeof lexicalData?.definition?.text === 'string' && lexicalData.definition.text.trim()) {
    return lexicalData.definition.text.trim();
  }
  const senses = lexicalData?.entry?.senses;
  if (Array.isArray(senses)) {
    for (const sense of senses) {
      const glosses = Array.isArray(sense?.glosses) ? sense.glosses : Array.isArray(sense?.definitions) ? sense.definitions : [];
      const gloss = glosses.find((value) => typeof value === 'string' && value.trim());
      if (gloss) return gloss.trim();
    }
  }
  return null;
}

export function normalizeWorldEntityKind(kind, fallback = 'item') {
  const normalized = String(kind || '').trim().toLowerCase();
  return WORLD_ENTITY_KIND_SET.has(normalized) ? normalized : fallback;
}

export function inferWorldTags({ lexeme, kind, definitionText, pos, metadata, roomSchool } = {}) {
  const tokens = normalizeTokens([
    lexeme,
    definitionText,
    metadata?.displayName,
    metadata?.shortDescription,
  ]);
  const normalizedPos = normalizePosList(pos);
  const tags = new Set();

  if (kind === 'glyph' || normalizedPos.some((value) => POS_VERB_SET.has(value))) {
    tags.add('Action');
    tags.add('Spell');
  }
  if (normalizedPos.some((value) => POS_NOUN_SET.has(value))) {
    tags.add('Noun');
  }
  if (normalizedPos.some((value) => POS_ADJECTIVE_SET.has(value))) {
    tags.add('Descriptor');
  }
  if (tokens.some((token) => MATERIAL_KEYWORDS.has(token))) {
    tags.add('Material');
  }
  if (tokens.some((token) => LOCATION_KEYWORDS.has(token)) || kind === 'location') {
    tags.add('Location');
  }
  if (tokens.some((token) => BEAST_KEYWORDS.has(token)) || kind === 'npc') {
    tags.add('Bestiary');
  }
  if (kind === 'item') {
    tags.add('Artifact');
  }
  if (roomSchool) {
    tags.add(roomSchool);
  }

  return [...tags];
}

export function inferWorldSchool({ tags = [], definitionText, lexeme, metadata, roomSchool } = {}) {
  const metadataSchool = String(metadata?.themeSchool || '').trim().toUpperCase();
  if (SCHOOL_KEYWORDS[metadataSchool]) {
    return metadataSchool;
  }

  const tokens = new Set(normalizeTokens([definitionText, lexeme, ...tags]));
  let bestSchool = String(roomSchool || '').trim().toUpperCase() || null;
  let bestScore = 0;

  for (const [school, keywords] of Object.entries(SCHOOL_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (tokens.has(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestSchool = school;
      bestScore = score;
    }
  }

  return bestSchool;
}

export function inferMudEntityType({ kind, pos, tags = [], definitionText } = {}) {
  const normalizedKind = normalizeWorldEntityKind(kind);
  const normalizedPos = normalizePosList(pos);
  const tokenSet = new Set(normalizeTokens([definitionText, ...tags]));

  if (normalizedKind === 'glyph' || normalizedPos.some((value) => POS_VERB_SET.has(value))) {
    return 'Glyph';
  }
  if (normalizedKind === 'location' || tokenSet.has('location')) {
    return 'Landmark';
  }
  if (normalizedKind === 'npc' || tokenSet.has('bestiary')) {
    return 'Bestiary';
  }
  if (tokenSet.has('material')) {
    return 'Reagent';
  }
  return 'Artifact';
}

export function inferMudRarity({ seed, kind, definitionText, lexeme } = {}) {
  const base = stableHash([seed, kind, definitionText, lexeme].filter(Boolean).join('|')) % 100;
  if (base >= 94) return 'LEGENDARY';
  if (base >= 80) return 'MYTHIC';
  if (base >= 60) return 'GRIMOIRE';
  if (base >= 32) return 'UNCOMMON';
  return 'COMMON';
}

function buildFlavorText({ name, rarity, school, entityType, inspectCount, shortDescription }) {
  if (shortDescription) {
    return shortDescription;
  }

  const inspectPrefix = inspectCount > 0
    ? 'The object answers repeat attention with a steadier outline.'
    : 'The first glance only catches the edge of its syntax.';

  return `${inspectPrefix} ${name} presents itself as a ${rarity.toLowerCase()} ${school || 'ARCANE'} ${entityType.toLowerCase()}.`;
}

export function buildWorldEntitySummary({ entity, room, lexicalData } = {}) {
  const definitionText = firstDefinitionText(lexicalData);
  const displayName = entity?.metadata?.displayName || titleCase(entity?.lexeme || entity?.id);
  const tags = inferWorldTags({
    lexeme: entity?.lexeme,
    kind: entity?.kind,
    definitionText,
    pos: lexicalData?.entry?.pos || lexicalData?.definition?.partOfSpeech,
    metadata: entity?.metadata,
    roomSchool: room?.school,
  });
  const school = inferWorldSchool({
    tags,
    definitionText,
    lexeme: entity?.lexeme,
    metadata: entity?.metadata,
    roomSchool: room?.school,
  });
  const rarity = inferMudRarity({
    seed: entity?.seed,
    kind: entity?.kind,
    definitionText,
    lexeme: entity?.lexeme,
  });

  return {
    entityId: entity?.id || null,
    kind: normalizeWorldEntityKind(entity?.kind),
    lexeme: entity?.lexeme || null,
    name: displayName,
    summary: entity?.metadata?.shortDescription || definitionText || `A ${rarity.toLowerCase()} object waits to be inspected.`,
    roomId: entity?.roomId || room?.id || null,
    actions: Array.isArray(entity?.actions) ? entity.actions : ['inspect'],
    school,
    rarity,
    inspectCount: Number(entity?.inspectCount) || 0,
  };
}

export function buildInspectableEntity({ entity, room, lexicalData } = {}) {
  const definitionText = firstDefinitionText(lexicalData);
  const normalizedKind = normalizeWorldEntityKind(entity?.kind);
  const displayName = entity?.metadata?.displayName || titleCase(entity?.lexeme || entity?.id);
  const tags = inferWorldTags({
    lexeme: entity?.lexeme,
    kind: normalizedKind,
    definitionText,
    pos: lexicalData?.entry?.pos || lexicalData?.definition?.partOfSpeech,
    metadata: entity?.metadata,
    roomSchool: room?.school,
  });
  const school = inferWorldSchool({
    tags,
    definitionText,
    lexeme: entity?.lexeme,
    metadata: entity?.metadata,
    roomSchool: room?.school,
  });
  const entityType = inferMudEntityType({
    kind: normalizedKind,
    pos: lexicalData?.entry?.pos || lexicalData?.definition?.partOfSpeech,
    tags,
    definitionText,
  });
  const rarity = inferMudRarity({
    seed: entity?.seed,
    kind: normalizedKind,
    definitionText,
    lexeme: entity?.lexeme,
  });

  return {
    ref: {
      entityId: entity?.id || null,
      kind: normalizedKind,
      lexeme: entity?.lexeme || null,
      roomId: entity?.roomId || room?.id || null,
      instanceId: entity?.id || null,
    },
    title: displayName,
    summary: definitionText || entity?.metadata?.shortDescription || null,
    codex: {
      word: lexicalData?.word || entity?.lexeme || null,
      headword: lexicalData?.entry?.headword || titleCase(entity?.lexeme || ''),
      definition: definitionText,
      partOfSpeech: lexicalData?.definition?.partOfSpeech || lexicalData?.entry?.pos || null,
      pronunciation: lexicalData?.entry?.pronunciation || null,
      etymology: lexicalData?.entry?.etymology || null,
      synonyms: Array.isArray(lexicalData?.synonyms) ? lexicalData.synonyms : [],
      antonyms: Array.isArray(lexicalData?.antonyms) ? lexicalData.antonyms : [],
      rhymes: Array.isArray(lexicalData?.rhymes) ? lexicalData.rhymes : [],
      rhymeFamily: lexicalData?.rhymeFamily || null,
      tags,
      school,
      loreSeed: entity?.seed || entity?.lexeme || null,
    },
    mud: {
      entityType,
      rarity,
      school,
      roomId: entity?.roomId || room?.id || null,
      roomName: room?.name || null,
      actions: Array.isArray(entity?.actions) ? entity.actions : ['inspect'],
      state: entity?.state && typeof entity.state === 'object' ? entity.state : {},
      ownership: entity?.ownerUserId ?? null,
      inspectCount: Number(entity?.inspectCount) || 0,
      flavorText: buildFlavorText({
        name: displayName,
        rarity,
        school,
        entityType,
        inspectCount: Number(entity?.inspectCount) || 0,
        shortDescription: entity?.metadata?.shortDescription,
      }),
    },
    room: room
      ? {
          id: room.id,
          name: room.name,
          description: room.description,
          school: room.school,
        }
      : null,
  };
}

export function buildRoomSnapshot({ room, entities = [], lexicalByEntityId = {} } = {}) {
  return {
    room: room
      ? {
          id: room.id,
          name: room.name,
          description: room.description,
          school: room.school,
          state: room.state && typeof room.state === 'object' ? room.state : {},
        }
      : null,
    entities: entities.map((entity) => buildWorldEntitySummary({
      entity,
      room,
      lexicalData: lexicalByEntityId?.[entity.id] || null,
    })),
  };
}
