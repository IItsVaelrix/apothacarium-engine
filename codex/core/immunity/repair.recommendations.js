/**
 * REPAIR RECOMMENDATIONS — The Healing Layer
 *
 * Each repair entry follows the same shape as `getRecoveryHintsForError`
 * from `codex/core/pixelbrain/bytecode-error.js`, so downstream agents
 * (CI bot comments, dashboard, IDE bridges) can render them uniformly.
 *
 * Schema:
 *   {
 *     key:          string                  Stable lookup key (referenced by rules)
 *     title:        string                  One-line headline
 *     suggestions:  string[]                Concrete actionable steps
 *     constraints:  string[]                Invariants the fix must satisfy
 *     invariants:   string[]                Code-level predicates
 *     references:   string[]                Encyclopedia / bug-fix-plan links
 *     canonical:    string?                 Canonical replacement path/symbol (when known)
 *   }
 *
 * Reference: ARCH-2026-04-26-IMMUNE-SYSTEM.md § "Repair Recommendations"
 */

export const REPAIR_RECOMMENDATIONS = Object.freeze({
  'repair.math-random.seeded': {
    key: 'repair.math-random.seeded',
    title: 'Replace Math.random() with seeded RNG', // EXEMPT
    suggestions: [
      "Replace `Math.random()` with `seedrandom(seed)` from a deterministic source.", // EXEMPT
      "Combat seeds derive from `combatId + turn`. Visual seeds derive from session context.",
      "If this is intentional visual jitter, annotate with `// IMMUNE_ALLOW: math-random`.",
    ],
    constraints: [
      'Determinism: the same input must produce the same output across runs.',
      'No entropy may enter scoring or combat resolution paths.',
    ],
    invariants: ['typeof seed === "number" || typeof seed === "string"'],
    references: ['ARCH_CONTRACT_OVERLAY_INTEGRITY.md', 'ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
    canonical: 'seedrandom(combatSeed)',
  },

  'repair.unseeded-clock.pipeline-context': {
    key: 'repair.unseeded-clock.pipeline-context',
    title: 'Use authoritative pipeline clock',
    suggestions: [
      'Use the `clock` provided by the pipeline context instead of `Date.now()` / `performance.now()`.', // EXEMPT
      'Cross-browser parity requires a single authoritative timesource.',
    ],
    constraints: [
      'Hot paths (scoring, rendering, resolve, compute) must use the pipeline clock.',
      'Test files are exempt.',
    ],
    invariants: ['ctx.clock !== undefined && typeof ctx.clock.now === "function"'],
    references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
  },

  'repair.forbidden-import.bridge-via-lib': {
    key: 'repair.forbidden-import.bridge-via-lib',
    title: 'Move logic out of UI into Codex runtime',
    suggestions: [
      'Move the imported logic to `codex/runtime/<name>.pipeline.js`.',
      'Expose it via a `/api/...` endpoint mounted in `codex/server/index.js`.',
      'Consume from UI via `fetch` or via a thin adapter in `src/lib/`.',
    ],
    constraints: [
      'UI components must not reach into `codex/` directly.',
      '`src/lib/` is the only legal bridge surface.',
    ],
    invariants: [
      '!filePath.startsWith("src/components/") || !importPath.includes("/codex/")',
    ],
    references: ['CLAUDE.md § Architecture Contracts', 'AGENTS.md § Hard Stops'],
    canonical: 'src/lib/<adapter>.js → fetch("/api/...")',
  },

  'repair.duplicate-path.canon': {
    key: 'repair.duplicate-path.canon',
    title: 'Reroute through the canonical path',
    suggestions: [
      'The shadow path was deleted in the Corruption Cleansing. Do not re-introduce it.',
      'Import from the canonical path declared in `DUPLICATE_PATH_CANON` (innate.rules.js).',
      'If you believe the canon is wrong, file an `IMMUNE_OVERRIDE` with `IMMUNE_AUTHORITY: Angel`.',
    ],
    constraints: [
      'Only one substrate per surface may exist.',
      'Re-resurrecting a deleted shadow requires Angel co-sign.',
    ],
    invariants: ['canonicalPath.exists && !forbiddenPaths.some(p => p.exists)'],
    references: ['dead-code.md', 'BUG-FIX-PLAN-2026-04-26-DISCONNECTED-LOGIC.md'],
  },

  'repair.known-violation.cleansing': {
    key: 'repair.known-violation.cleansing',
    title: 'Forbidden symbol — replaced during cleansing',
    suggestions: [
      'This symbol was removed in the Corruption Cleansing of 2026-04-26.',
      'Look up the replacement in the linked encyclopedia entry.',
      'Do not re-introduce the symbol under a new name — that is detected by Layer 2 (adaptive).',
    ],
    constraints: ['Purged symbols must not return.'],
    invariants: ['!forbiddenSymbols.some(s => content.includes(s))'],
    references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md', 'dead-code.md'],
  },

  'repair.session.save-uninitialized': {
    key: 'repair.session.save-uninitialized',
    title: 'Fastify session must initialize for guests',
    suggestions: [
      'Set `saveUninitialized: true` in Fastify session options.',
      'The `/auth/csrf-token` route requires a session object even for new guests; otherwise it 500s.',
    ],
    constraints: ['Guests must receive a CSRF token without 500s.'],
    invariants: ['fastifySessionOptions.saveUninitialized === true'],
    references: ['BUG-2026-CSRF-GUEST-500'],
    canonical: 'saveUninitialized: true',
  },

  'repair.recursion.alias-imports': {
    key: 'repair.recursion.alias-imports',
    title: 'Avoid infinite recursion via aliased imports',
    suggestions: [
      'Rename the imported function to avoid collision with the service method name.',
      'Use the `Internal` suffix for imports: `import { foo as fooInternal }`.',
      'Ensure the service method calls the `Internal` alias instead of itself.',
    ],
    constraints: [
      'Maximum recursion depth must be respected (Law 18 threshold).',
      'Names must be distinct within the local execution context.',
    ],
    invariants: ['importedSymbol !== localMethodName'],
    references: ['BUG-2026-04-27-RECURSIVE-SHADOW'],
    canonical: 'import { x as xInternal }',
  },

  'repair.infra.port-alignment': {
    key: 'repair.infra.port-alignment',
    title: 'Align infrastructure ports across environments',
    suggestions: [
      'The project is migrating from Render (port 3000) to Fly.io (port 8080).',
      'Update local .env and documentation to use 8080.',
      'Ensure Docker EXPOSE and Fastify PORT default to 8080.',
      'Sync all agent connection scripts to the new authoritative port.',
    ],
    constraints: [
      'Local development must mirror production networking topology.',
    ],
    invariants: ['Dockerfile.PORT === index.js.PORT === documentation.PORT'],
    references: ['ARCH-PDR-ZERO-COST-INFRA', 'BUG-2026-04-26-IPV6-PROXY-BLINDNESS'],
    canonical: 'PORT=8080',
  },

  'repair.handshake.centralized-csrf': {
    key: 'repair.handshake.centralized-csrf',
    title: 'Centralize CSRF handshake in useAuth hook',
    suggestions: [
      'Avoid calling getCsrfToken() manually in every component.',
      'The useAuth hook handles the initial handshake and token management.',
      'If a request fails with 403, use clearCsrfToken() and the next request will auto-refresh.',
      'Redundant fetches can cause race conditions during cookie rotation.',
    ],
    constraints: [
      'Handshake must be atomic to prevent session fragmentation.',
    ],
    invariants: ['Only useAuth.jsx initiates the primary handshake.'],
    references: ['BUG-2026-04-27-RECURSIVE-FRAGMENTATION'],
    canonical: 'const { token } = useAuth();',
  },

  'repair.phoneme.relative-bridge': {
    key: 'repair.phoneme.relative-bridge',
    title: 'Restore Phoneme Engine Bridge',
    suggestions: [
      'Fix the relative import depth in `vowelFamily.js`.',
      "Use `./vowelWheel.js` for sibling imports instead of reaching up to root.",
      "The 'Assonance Logic Collapse' occurs when family identities fail to resolve during analysis.",
    ],
    constraints: [
      'Core modules must use stable sibling/child relative paths.',
      'PhonemeEngine must resolve FAMILY_IDENTITY to produce resonant bytecode.',
    ],
    invariants: [
      'importPath === "./vowelWheel.js"',
    ],
    references: ['BUG-2026-05-09-PHONEME-SEVERANCE'],
    canonical: "import { FAMILY_IDENTITY } from './vowelWheel.js';",
  },
});

/**
 * Look up a repair recommendation by key.
 * Returns a frozen "unknown" stub if the key is not registered, so callers
 * never crash from missing entries.
 */
export function getRepair(key) {
  if (!key) return UNKNOWN_REPAIR;
  return REPAIR_RECOMMENDATIONS[key] || UNKNOWN_REPAIR;
}

const UNKNOWN_REPAIR = Object.freeze({
  key: 'repair.unknown',
  title: 'No repair recommendation registered',
  suggestions: [
    'File an encyclopedia entry describing the violation.',
    'Add a corresponding `repair.*` key to `repair.recommendations.js`.',
  ],
  constraints: [],
  invariants: [],
  references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
});
