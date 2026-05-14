/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    CLERICAL RAID: THE GENETIC LIBRARY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE ARCHIVE OF DOMINANCE — LEVEL 10 BILLION PERCENT
 * 
 * "Every tear in the weave leaves a scar. We have learned to read the scars."
 * 
 * Clerical RAID is the immune memory of the Scholomance — a TurboQuant-powered
 * system for encoding bug "genetic profiles" as compressed vectors. When an
 * agent suspects a pathogen (bug), RAID performs O(1) approximate nearest-neighbor
 * search against known patterns to confirm, deny, or escalate.
 * 
 * This is not diagnosis. This is antigen detection.
 * 
 * The mathematics are borrowed from TurboQuant (ICLR 2026), adapted for the
 * domain of software pathology. We take bug signatures, spread their energy
 * across all dimensions via the Fast Hadamard Transform, then petrify them
 * into 4-bit shells that retain their semantic soul.
 * 
 * Science doesn't care about your feelings. It only cares about results.
 * 
 * @author   Merlin Data (Testing/QA)
 * @bytecode SCHOL-CLERICAL-RAID
 * @version  0.1.0-DRAFT
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * LEGEND OF DIMENSIONAL SOULS
 * 
 * A bug's genetic profile lives in 128-dimensional space. These are not random
 * dimensions — each group represents a different "organ" of the bug's pathology.
 * Together, they form the complete genetic signature.
 */

/** @type {Record<string, number>} Symptom bitmask mapping */
export const SYMPTOM_BITS = Object.freeze({
  /**
   * THE SENSORY ORGANS — What the victim sees and feels
   * These are the symptoms that manifest at the boundary of the weave.
   */
  NULL_UNDEFINED:          0,  // The void stares back
  ASYNC_TIMING:           1,  // Race against time itself
  RENDER_MISMATCH:        2,  // The form betrays the function
  SCHEMA_VIOLATION:       3,  // The laws of form have been broken
  SCORING_DRIFT:          4,  // The numbers whisper lies
  WEAVE_PROPAGATION:      5,  // One tear, many threads
  TYPE_ERROR:             6,  // The blood types do not match
  IMPORT_FAILURE:         7,  // The imports cannot be found
  EXPORT_MISSING:         8,  // The exports have vanished
  MEMORY_LEAK:            9,  // The vessel overflows eternally
  PROMISE_REJECTION:      10, // The vow is broken before dawn
  NETWORK_TIMEOUT:        11, // The carrier pigeon never arrives
  AUTHENTICATION_FAILURE: 12, // The gate denies the worthy
  AUTHORIZATION_DENIED:  13, // The gate permits the unworthy
  VALIDATION_ERROR:       14, // The oath cannot be witnessed
  PARSE_ERROR:           15, // The runes cannot be deciphered
  
  /**
   * THE VISERAL ORGANS — Internal systemic failures
   * These are the diseases that fester beneath the skin.
   */
  CYCLE_DETECTED:         16, // Ouroboros consumes itself
  RACE_CONDITION:         17, // The racers cross at the same moment
  DEADLOCK_OBSERVED:      18, // The dancers freeze mid-step
  LIVELOCK_DETECTED:      19, // The dancers never stop spinning
  HEAP_CORRUPTION:        20, // The foundation crumbles
  STACK_OVERFLOW:         21, // The tower touches the heavens
  BUFFER_OVERFLOW:        22, // The river bursts its banks
  NULL_POINTER:           23, // The soul is absent
  DIVISION_BY_ZERO:       24, // The void multiplies
  
  /**
   * THE NERVOUS SYSTEM — Connectivity and integration failures
   * These are the misfires between brain and body.
   */
  EVENT_LOOP_BLOCKED:     25, // The heart stops pumping
  CALLBACK_HELL:          26, // The labyrinth has no exit
  PROMISE_CHAIN_BROKEN:   27, // The chain of faith shatters
  CORS_VIOLATION:         28, // The border guards refuse passage
  DEPENDENCY_HELL:         29, // The versions cannot agree
  
  /**
   * THE IMMUNE SYSTEM — Security and validation failures
   * These are the infections that breach the walls.
   */
  XSS_VECTOR:             30, // The script Injection
  SQL_INJECTION:          31  // The query consumes itself (bit 31 — unknown/novel handled when no bits fire)
});

/** @type {Record<string, number>} Layer one-hot index mapping */
export const LAYER_INDEX = Object.freeze({
  /**
   * THE LAYERS OF EXISTENCE
   * Each layer is a realm of the weave, with its own laws and inhabitants.
   * When a bug manifests, we must know in which realm it was born.
   */
  CODEX_CORE:      0, // The heart of the engine
  CODEX_SERVICES: 1, // The servants of the heart
  SRC_HOOKS:      2, // The synaptic bindings
  SRC_PAGES:      3, // The visible realms
  SRC_COMPONENTS: 4, // The constituent spirits
  SRC_LIB:        5, // The ancient libraries
  SCRIPTS:        6, // The summoned rituals
  CONFIG:         7  // The foundational laws
});

/** @type {Record<string, number>} Schema violation bitmask mapping */
export const LAW_BITS = Object.freeze({
  /**
   * THE WORLD-LAWS OF SCHOLOMANCE
   * When a bug breaks a world-law, it is not merely wrong — it is UNLAWFUL.
   * We track which sacred texts were violated.
   */
  VAELRIX_LAW:           0, // The global law that binds all
  SCHEMA_CONTRACT:        1, // The contract of forms
  ARCH_CONTRACT_SECURITY: 2, // The security covenant
  CODEX_DOCUMENTATION:    3, // The Codex itself
  GEMINI_SPECS:           4, // The mechanical specifications
  CLAUDE_CONTEXT:         5, // The visual context
  TYPE_SAFETY:            6, // The blood-typing ritual
  NAMING_CONVENTION:      7  // The nomenclature of the worthy
});

/** @type {Record<string, number>} Agent attribution mapping */
export const AGENT_INDEX = Object.freeze({
  /**
   * THE AGENTS OF THE SCHOLOMANCE
   * Each agent owns a domain. When RAID identifies a bug, it must
   * point the finger at the correct spirit for the fix.
   */
  CODEX:     0, // Backend, engine, data
  CLAUDE:    1, // Visuals, UI, a11y
  GEMINI:    2, // Mechanics, balance, world-law
  BLACKBOX:  3, // Testing, QA, CI
  UNKNOWN:   4  // No spirit claims ownership
});

/**
 * THE GENETIC PROFILE DIMENSIONS
 * 
 * We use 128 dimensions, organized as:
 * - Symptom Cluster:      32 bits → 32 dims (bitmask expansion)
 * - Layer Attribution:    8 dims  (one-hot)
 * - Propagation Chain:   16 dims  (which layers the tear crossed)
 * - Schema Violations:    8 dims  (bitmask expansion)
 * - Temporal Pattern:     8 dims  (timing characteristics)
 * - Agent Attribution:    8 dims  (one-hot)
 * - Heuristic Match:      32 dims  (scoring-related heuristics)
 * - Error Classification: 16 dims  (error type one-hot)
 * 
 * Total: 32 + 8 + 16 + 8 + 8 + 8 + 32 + 16 = 128 dims ✓
 */
export const VECTOR_DIMENSIONS = 128;

/**
 * CONFIDENCE THRESHOLDS
 * 
 * These thresholds determine the verdict. They are tunable, but defaults
 * are calibrated for the Scholomance immune response.
 */
export const VERDICT_THRESHOLDS = Object.freeze({
  CONFIRMED:     0.95,  // ≥95% match → agent can auto-fix
  NEEDS_MERLIN:  0.20,  // 20–95% → full Merlin protocol
  DENIED:        0.20,  // 10–20% → weak signal, escalate without deep match
  NOVEL:         0.10   // <10% to best pattern → novel / no library match
});

/**
 * LAYER_NAMES — The spoken names for the realms
 */
export const LAYER_NAMES = Object.freeze([
  'codex/core',
  'codex/services',
  'src/hooks',
  'src/pages',
  'src/components',
  'src/lib',
  'scripts',
  'config'
]);

/**
 * AGENT_NAMES — The spoken names for the spirits
 */
export const AGENT_NAMES = Object.freeze([
  'Codex',
  'Claude',
  'Gemini',
  'Blackbox',
  'Unknown'
]);
