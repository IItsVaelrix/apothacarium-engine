/**
 * Authoritative semantic law for spellweave and combat only.
 *
 * This registry stays intentionally narrow: deterministic predicates, objects,
 * and status-chain helpers that the engine resolves authoritatively. Higher-
 * order interpretation such as metaphor, semantic fields, archetypes, and
 * register tension now belongs on the VerseIR amplifier substrate.
 */

export const INTENTS = {
  OFFENSIVE: "OFFENSIVE",
  DEFENSIVE: "DEFENSIVE",
  HEALING: "HEALING",
  UTILITY: "UTILITY",
  DISRUPTION: "DISRUPTION"
};

export const SEMANTIC_TIER_COUNT = 5;

export const PREDICATES = {
  // --- ALCHEMY (TRANSFORMATION/HEALING) ---
  MEND: { intent: INTENTS.HEALING, school: "ALCHEMY", power: 1.0 },
  PURGE: { intent: INTENTS.DISRUPTION, school: "ALCHEMY", power: 0.8 },
  TRANSMUTE: { intent: INTENTS.UTILITY, school: "ALCHEMY", power: 0.9 },
  IGNITE: { intent: INTENTS.OFFENSIVE, school: "ALCHEMY", power: 1.1 },

  // --- SONIC (VIBRATION/WAVES) ---
  ECHO: { intent: INTENTS.OFFENSIVE, school: "SONIC", power: 0.9 },
  RESONATE: { intent: INTENTS.OFFENSIVE, school: "SONIC", power: 1.2 },
  QUIET: { intent: INTENTS.DEFENSIVE, school: "SONIC", power: 1.0 },
  SHATTER: { intent: INTENTS.OFFENSIVE, school: "SONIC", power: 1.5 },

  // --- PSYCHIC (MIND/CONTROL) ---
  GAZE: { intent: INTENTS.UTILITY, school: "PSYCHIC", power: 0.7 },
  SCISSION: { intent: INTENTS.OFFENSIVE, school: "PSYCHIC", power: 1.3 },
  CALM: { intent: INTENTS.DEFENSIVE, school: "PSYCHIC", power: 1.0 },
  FEAR: { intent: INTENTS.DISRUPTION, school: "PSYCHIC", power: 1.1 },

  // --- VOID (ENTROPY/EMPTY) ---
  CONSUME: { intent: INTENTS.OFFENSIVE, school: "VOID", power: 1.4 },
  HOLLOW: { intent: INTENTS.DISRUPTION, school: "VOID", power: 1.2 },
  NULLIFY: { intent: INTENTS.DEFENSIVE, school: "VOID", power: 1.1 },

  // --- WILL (FORCE/REALITY) ---
  STRIKE: { intent: INTENTS.OFFENSIVE, school: "WILL", power: 1.2 },
  SHIELD: { intent: INTENTS.DEFENSIVE, school: "WILL", power: 1.3 },
  SURGE: { intent: INTENTS.UTILITY, school: "WILL", power: 1.1 }
};

export const OBJECTS = {
  SOUL: { category: "METAPHYSICAL", multiplier: 1.2 },
  FLESH: { category: "PHYSICAL", multiplier: 1.0 },
  MIND: { category: "MENTAL", multiplier: 1.1 },
  SINEW: { category: "PHYSICAL", multiplier: 1.0 },
  SPIRIT: { category: "METAPHYSICAL", multiplier: 1.2 },
  BLOOD: { category: "PHYSICAL", multiplier: 1.3 },
  STONE: { category: "ELEMENTAL", multiplier: 0.9 },
  AIR: { category: "ELEMENTAL", multiplier: 0.8 },
  FIRE: { category: "ELEMENTAL", multiplier: 1.1 }
};

const EMPTY_SCHOOL_REGISTRY = Object.freeze({});

function normalizeSchoolId(school) {
  return String(school || '').trim().toUpperCase();
}

export function normalizeSemanticKeyword(keyword) {
  return String(keyword || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSemanticSchoolRegistry(school) {
  const normalizedSchool = normalizeSchoolId(school);
  if (!normalizedSchool) {
    return EMPTY_SCHOOL_REGISTRY;
  }

  // Rich chain registries can be layered in later without changing the combat
  // profile contract. For now, missing registries degrade to "no status chain"
  // instead of crashing the authoritative scorer.
  return EMPTY_SCHOOL_REGISTRY;
}

export function getSemanticTierLabel(school, chainId, tier) {
  const normalizedSchool = normalizeSchoolId(school);
  const normalizedChain = String(chainId || '').trim().toUpperCase();
  const normalizedTier = Math.max(1, Number(tier) || 1);
  if (!normalizedSchool || !normalizedChain) return null;
  return `${normalizedSchool} ${normalizedChain} ${normalizedTier}`;
}

/**
 * Maps a word to a predicate or object if it exists.
 * @param {string} word 
 * @returns {Object|null}
 */
export function lookupSemanticToken(word) {
  const upper = word.toUpperCase();
  if (PREDICATES[upper]) return { type: "PREDICATE", ...PREDICATES[upper] };
  if (OBJECTS[upper]) return { type: "OBJECT", ...OBJECTS[upper] };
  return null;
}
