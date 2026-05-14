// IMMUNE_ALLOW: math-random — this module's pattern guidance text references
// Math.random by name as a known pathogen; QUANT-0101 substring matching
// would otherwise self-flag the rule library.

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    CLERICAL RAID: SEED PATTERNS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE ARCHIVE OF DOMINANCE — LEVEL 10 BILLION PERCENT
 * 
 * "The immune memory must be seeded with known pathogens. These are the
 * scars of battles past — the genetic signatures of bugs that have torn
 * the weave and been repaired."
 * 
 * This module contains the initial pattern library — the antibody
 * repertoire that RAID uses to detect known bugs immediately.
 * 
 * Each pattern encodes:
 * - A unique ID (PAT-001, PAT-002, etc.)
 * - A name (the spoken diagnosis)
 * - Symptoms (what the victim sees)
 * - File paths (where the tear originated)
 * - Error messages (the system's complaint)
 * - Owner (which spirit fixes it)
 * - Fix path (where the needle threads)
 * 
 * These patterns are extracted from actual Merlin Data reports and
 * canonical bug knowledge from the Scholomance development history.
 * 
 * @author   Merlin Data (Testing/QA)
 * @bytecode SCHOL-CLERICAL-RAID-SEEDS
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Pattern } from './clerical-raid.core.js';
import { AGENT_INDEX } from './clerical-raid.schema.js';

/**
 * THE SEED PATTERNS
 * 
 * These patterns represent the known pathogens of the Scholomance.
 * They are the immune memory upon which RAID builds its response.
 * 
 * PAT-001: SCHEMA_CONTRACT NULL PROPAGATION
 * 
 * THE ANOMALY: A tear in the data layer allows null values to propagate
 * through the weave, causing crashes at the boundary of rendering.
 * 
 * THE SIGNS: "null is not a function", "cannot read property of undefined",
 * "schema validation failed", in codex/core or codex/services.
 * 
 * THE CURE: Null guards at schema boundaries, defensive validation.
 * 
 * Why this pattern: SchemaContract violations in the data layer are
 * the most common tear. They propagate because the weave trusts its data.
 */
export const SEED_PATTERNS = [
  new Pattern(
    'PAT-001',
    'SchemaContract Null Propagation',
    [
      'null is not a function',
      'cannot read property of undefined',
      'schema validation failed',
      'type null is not assignable'
    ],
    ['codex/core', 'codex/services', 'src/lib'],
    [
      'TypeError: Cannot read property',
      'Schema validation error: null value'
    ],
    AGENT_INDEX.CODEX,
    'codex/core: Add null guards at schema validator boundaries. ' +
    'Ensure SCHEMA_CONTRACT types are enforced before propagation.',
    1.0
  ),
  
  /**
   * PAT-002: ASYNC DATA RACE IN RENDER
   * 
   * THE ANOMALY: The render spirit reads data before the async hook
   * has completed its fetch. The form renders, but with void — the
   * data has not yet arrived from the carrier.
   * 
   * THE SIGNS: "render before data load", "loading state undefined",
   * "async timing mismatch", in src/hooks or src/components.
   * 
   * THE CURE: Loading state guards, async/await proper ordering,
   * Suspense boundaries at the render layer.
   * 
   * Why this pattern: Async timing is the second most common tear.
   * The hook fetches, the component renders, the data arrives after.
   */
  new Pattern(
    'PAT-002',
    'Async Data Race in Render',
    [
      'render before data load',
      'loading state undefined',
      'async timing mismatch',
      'data not available during render',
      'useEffect dependency missing'
    ],
    ['src/hooks', 'src/components', 'src/pages'],
    [
      'Error: Rendered without required data',
      "Warning: Can't perform a React state update"
    ],
    AGENT_INDEX.CLAUDE,
    'Claude: Add loading state guard (if (!data) return <Loading />). ' +
    'Ensure useEffect has correct dependency array. Consider Suspense.',
    1.0
  ),
  
  /**
   * PAT-003: SCORING DETERMINISM BREAK
   * 
   * THE ANOMALY: The same verse scores differently on different runs.
   * The numbers whisper lies. The weave has entropy where it should
   * have perfect crystal.
   * 
   * THE SIGNS: "scoring inconsistent", "determinism broken",
   * "random in scoring", "different score each run", in codex/core/scoring.
   * 
   * THE CURE: Remove random/pseudo-random from scoring heuristics.
   * Ensure all weights are normalized. Lock the seed.
   * 
   * Why this pattern: Scoring determinism is the sacred law of the
   * combat engine. If scores drift, the entire ritual is corrupted.
   */
  new Pattern(
    'PAT-003',
    'Scoring Determinism Break',
    [
      'scoring inconsistent',
      'determinism broken',
      'random in scoring',
      'different score each run',
      'scoring drift'
    ],
    ['codex/core/scoring', 'codex/core/combat.scoring.js'],
    [
      'Score mismatch: expected 0.85, got 0.72',
      'Determinism check failed'
    ],
    AGENT_INDEX.CODEX,
    'Codex: Remove random/Math.random() from scoring heuristics. ' + // EXEMPT
    'Lock seed parameter. Ensure VAELRIX_LAW determinism mandate is met.',
    1.0
  ),
  
  /**
   * PAT-004: WEAVE PROPAGATION CHAIN
   * 
   * THE ANOMALY: A tear in one layer spreads to others. The data
   * layer breaks, the service layer feels it, the UI layer crashes.
   * One tear, many threads.
   * 
   * THE SIGNS: "error in A affects B", "cascade failure",
   * "propagation chain", "layer boundary breach", across multiple layers.
   * 
   * THE CURE: Isolate at origin layer. Add error boundaries.
   * Trace the propagation chain and seal at each boundary.
   * 
   * Why this pattern: Propagation chains are the most dangerous tears.
   * They start small and spread. Early detection is critical.
   */
  new Pattern(
    'PAT-004',
    'Weave Propagation Chain',
    [
      'error in A affects B',
      'cascade failure',
      'propagation chain',
      'layer boundary breach',
      'error spreads to other layers'
    ],
    ['codex/core', 'codex/services', 'src/hooks', 'src/components'],
    [
      'Uncaught error propagates to root',
      'Boundary error: Cannot recover'
    ],
    AGENT_INDEX.CODEX,
    'Codex: Trace propagation chain to origin. Add error boundaries ' +
    'at each layer transition. Seal at Codex → Services → UI.',
    1.0
  ),
  
  /**
   * PAT-005: XSS VECTOR (dangerouslySetInnerHTML)
   * 
   * THE ANOMALY: The script injection breaches the walls. User input
   * flows directly into the DOM without sanitization. The enemy
   * rides the carrier.
   * 
   * THE SIGNS: "dangerouslysetinnerhtml", "xss", "script injection",
   * "sanitize", "innerHTML without escape", in src/components.
   * 
   * THE CURE: Never use dangerouslySetInnerHTML. Use sanitization
   * libraries (DOMPurify). Escape all user input.
   * 
   * Why this pattern: XSS is a security covenant violation. It is
   * the infection that breaches the walls of the Scholomance.
   */
  new Pattern(
    'PAT-005',
    'XSS Vector (dangerouslySetInnerHTML)',
    [
      'dangerouslysetinnerhtml used',
      'xss vulnerability',
      'script injection possible',
      'innerHTML without sanitization',
      'user input in DOM'
    ],
    ['src/components', 'src/pages'],
    [
      'XSS detected: <script> tag in output',
      'Security violation: innerHTML used'
    ],
    AGENT_INDEX.CLAUDE,
    'Claude: Replace dangerouslySetInnerHTML with DOMPurify.sanitize(). ' +
    'Never pass raw user input to innerHTML. ARCH_CONTRACT_SECURITY requires sanitization.',
    1.0
  ),
  
  /**
   * PAT-006: RATE LIMIT BYPASS
   * 
   * THE ANOMALY: The rapid-fire defense fails. The enemy sends
   * actions faster than the cooldown allows, bypassing the rate
   * limiter through race conditions or missing server validation.
   * 
   * THE SIGNS: "rate limit bypassed", "too many actions",
   * "cooldown not enforced", "rapid fire spam", in codex/services.
   * 
   * THE CURE: Server-side rate limiting with timestamp tracking.
   * Client-side is advisory only. Verify on server.
   * 
   * Why this pattern: Rate limiting is critical for combat balance.
   * Bypasses corrupt the ritual's timing.
   */
  new Pattern(
    'PAT-006',
    'Rate Limit Bypass',
    [
      'rate limit bypassed',
      'too many actions',
      'cooldown not enforced',
      'rapid fire spam',
      'action throttling failed'
    ],
    ['codex/services', 'codex/core/combat.session.js'],
    [
      'Rate limit: 1 action per 3 seconds',
      'Warning: Rapid action detected'
    ],
    AGENT_INDEX.CODEX,
    'Codex: Implement server-side rate limiting with timestamp tracking. ' +
    'Client-side is advisory only. Verify cooldown on server before processing.',
    1.0
  ),
  
  /**
   * PAT-007: COVERAGE REGRESSION
   * 
   * THE ANOMALY: A thread of the weave is no longer tested. The
   * coverage drops, and with it, the confidence in the ritual's
   * integrity. Tears go undetected.
   * 
   * THE SIGNS: "coverage dropped", "test not executed",
   * "uncovered line", "regression in tests", in tests/ directory.
   * 
   * THE CURE: Add regression tests covering the torn thread.
   * Ensure coverage stays above target thresholds.
   * 
   * Why this pattern: Coverage regressions are silent killers.
   * They don't break the build — they break the future.
   */
  new Pattern(
    'PAT-007',
    'Coverage Regression',
    [
      'coverage dropped',
      'test not executed',
      'uncovered line',
      'regression in tests',
      'missing test coverage'
    ],
    ['tests', 'src/hooks', 'src/lib'],
    [
      'Coverage: 78% (target: 80%)',
      'Test suite: 12 tests, 3 failing'
    ],
    AGENT_INDEX.BLACKBOX,
    'Blackbox: Add regression test for the torn thread. ' +
    'Ensure codex/core/ coverage >95%, codex/services/ >80%.',
    1.0
  ),
  
  /**
   * PAT-008: TYPESCRIPT STRICT NULL
   * 
   * THE ANOMALY: The blood-typing ritual fails. A variable holds
   * the void (null/undefined) where a typed value was expected.
   * The TypeScript compiler screams.
   * 
   * THE SIGNS: "ts2322", "ts2345", "null is not assignable",
   * "undefined is not a function", in any TypeScript file.
   * 
   * THE CURE: Add null guards, use optional chaining (?.),
   * add proper type annotations, disable strict null if intentional.
   * 
   * Why this pattern: TypeScript strict null is the most common
   * compile-time error. It's a blood-typing failure.
   */
  new Pattern(
    'PAT-008',
    'TypeScript Strict Null',
    [
      'ts2322 type error',
      'ts2345 type error',
      'null is not assignable',
      'undefined is not a function',
      'cannot assign null to type'
    ],
    ['src/', 'codex/'],
    [
      'TypeScript error TS2322',
      'TypeScript error TS2345'
    ],
    AGENT_INDEX.CODEX,
    'Codex: Add null guards, use optional chaining (?.), ' +
    'ensure proper type annotations. Fix at source, not with @ts-ignore.',
    1.0
  ),
  
  /**
   * PAT-009: IMPORT/CYCLE DETECTION
   * 
   * THE ANOMALY: Ouroboros consumes itself. The modules form a
   * circular dependency — A imports B, B imports C, C imports A.
   * The loader cannot untangle the knot.
   * 
   * THE SIGNS: "circular dependency", "require cycle",
   * "import cycle detected", "cannot resolve module", in imports.
   * 
   * THE CURE: Refactor to break the cycle. Use dependency injection,
   * lazy imports, or a shared intermediary module.
   * 
   * Why this pattern: Circular dependencies are the labyrinth
   * with no exit. They compile, but runtime fails mysteriously.
   */
  new Pattern(
    'PAT-009',
    'Import/Require Cycle',
    [
      'circular dependency',
      'require cycle',
      'import cycle detected',
      'cannot resolve module',
      'ourobos consumes itself'
    ],
    ['codex/core', 'codex/services', 'src/lib'],
    [
      'Error: Cannot find module',
      'Warning: Circular dependency'
    ],
    AGENT_INDEX.CODEX,
    'Codex: Refactor imports to break cycle. Use lazy imports, ' +
    'dependency injection, or shared intermediary. Check with webpack-bundle-analyzer.',
    1.0
  ),
  
  /**
   * PAT-010: UI STATE BLEEDING
   * 
   * THE ANOMALY: State from one realm bleeds into another. The
   * component should be isolated, but the hook shares its blood.
   * Closing a modal re-opens it. Clicking one button clicks all.
   * 
   * THE SIGNS: "state bleeding", "shared state contamination",
   * "modal reopens on close", "component isolation failed",
   * "hook state affects siblings", in src/hooks or src/components.
   * 
   * THE CURE: Isolate state in hook. Use useMemo/useCallback for
   * stable references. Ensure cleanup in useEffect return.
   * 
   * Why this pattern: UI state bleeding is a subtle tear. It doesn't
   * crash — it corrupts the user's mental model of the interface.
   */
  new Pattern(
    'PAT-010',
    'UI State Bleeding',
    [
      'state bleeding',
      'shared state contamination',
      'modal reopens on close',
      'component isolation failed',
      'hook state affects siblings',
      'useEffect cleanup missing'
    ],
    ['src/hooks', 'src/components'],
    [
      'State persists across mounts',
      'Warning: Memory leak in useEffect'
    ],
    AGENT_INDEX.CLAUDE,
    'Claude: Isolate state in hook. Use useMemo/useCallback for ' +
    'stable references. Add cleanup in useEffect return. ' +
    'Ensure each component has independent state.',
    1.0
  ),

  ...[
    ['PAT-011', 'CSRF Missing on Mutating Route', ['csrf', 'forbidden', 'mutate'], ['codex/server'], ['403', 'csrf'], AGENT_INDEX.CODEX, 'codex/server: Require CSRF token on POST/PUT/PATCH per ARCH_CONTRACT_SECURITY.', 1.0],
    ['PAT-012', 'Session Store Desync', ['session', 'redis', 'async timing'], ['codex/server'], ['session expired'], AGENT_INDEX.CODEX, 'Codex: Align Fastify session + Redis TTL; verify cookie rotation.', 1.0],
    ['PAT-013', 'SQLite Database Locked', ['deadlock', 'sqlite', 'promise'], ['codex/server'], ['SQLITE_BUSY'], AGENT_INDEX.CODEX, 'Codex: Serialize writes or use WAL + busy_timeout on better-sqlite3.', 1.0],
    ['PAT-014', 'WebSocket Reconnect Storm', ['async timing', 'network timeout', 'race'], ['codex/server', 'src/hooks'], ['websocket'], AGENT_INDEX.GEMINI, 'Gemini: Backoff reconnect; single flight; server close codes.', 1.0],
    ['PAT-015', 'SSR Hydration Mismatch', ['render mismatch', 'hydration'], ['src/pages', 'src/components'], ['Hydration failed'], AGENT_INDEX.CLAUDE, 'Claude: Guard browser-only APIs; match server/client markup.', 1.0],
    ['PAT-016', 'Infinite Re-render Loop', ['render mismatch', 'race'], ['src/hooks'], ['Maximum update depth'], AGENT_INDEX.CLAUDE, 'Claude: Stabilize deps; remove setState in render path.', 1.0],
    ['PAT-017', 'Stale Closure in Hook', ['async timing', 'state bleeding'], ['src/hooks'], ['stale closure'], AGENT_INDEX.CLAUDE, 'Claude: useRef for latest callback or fix effect deps.', 1.0],
    ['PAT-018', 'Effect Dependency Omission', ['useEffect dependency missing', 'async timing'], ['src/hooks'], ['exhaustive-deps'], AGENT_INDEX.CLAUDE, 'Claude: Add missing deps or document intentional omit.', 1.0],
    ['PAT-019', 'Font Flash / Layout Jump', ['render mismatch', 'display'], ['src/pages'], ['FOUT'], AGENT_INDEX.CLAUDE, 'Claude: font-display strategy; reserve space for glyphs.', 1.0],
    ['PAT-020', 'Cumulative Layout Shift', ['render mismatch', 'ui'], ['src/components'], ['CLS'], AGENT_INDEX.CLAUDE, 'Claude: Size media; avoid late-insert banners.', 1.0],
    ['PAT-021', 'Focus Trap Regression', ['keyboard', 'modal'], ['src/components'], ['focus'], AGENT_INDEX.CLAUDE, 'Claude: Restore focus; trap in dialogs per a11y.', 1.0],
    ['PAT-022', 'Live Region Not Announced', ['aria', 'screen reader'], ['src/components'], ['a11y'], AGENT_INDEX.CLAUDE, 'Claude: aria-live polite/assertive for dynamic status.', 1.0],
    ['PAT-023', 'Keyboard Navigation Broken', ['keyboard', 'tab'], ['src/pages'], ['a11y'], AGENT_INDEX.CLAUDE, 'Claude: Tab order and roving tabindex for composite widgets.', 1.0],
    ['PAT-024', 'Contrast Below WCAG', ['contrast', 'color'], ['src/components'], ['a11y'], AGENT_INDEX.CLAUDE, 'Claude: Adjust tokens; verify against theme backgrounds.', 1.0],
    ['PAT-025', 'Missing i18n String', ['parse error', 'undefined'], ['src/components'], ['i18n'], AGENT_INDEX.CLAUDE, 'Claude: Add fallback key; sync catalog.', 1.0],
    ['PAT-026', 'Production Env Missing', ['config', 'undefined'], ['config', 'scripts'], ['env'], AGENT_INDEX.GEMINI, 'Gemini: Document required env; fail fast on boot.', 1.0],
    ['PAT-027', 'CORS Misconfiguration', ['cors', 'network timeout'], ['codex/server'], ['CORS'], AGENT_INDEX.CODEX, 'Codex: Allow-list origins; no wildcard with credentials.', 1.0],
    ['PAT-028', 'Cookie SameSite Regression', ['session', 'auth'], ['codex/server'], ['cookie'], AGENT_INDEX.CODEX, 'Codex: SameSite + Secure flags for production.', 1.0],
    ['PAT-029', 'JWT Expiry Not Honored', ['auth', 'async timing'], ['codex/server'], ['401'], AGENT_INDEX.CODEX, 'Codex: Refresh or re-auth path before expiry.', 1.0],
    ['PAT-030', 'Sensitive Data in Logs', ['security', 'password'], ['codex/server'], ['PII'], AGENT_INDEX.CODEX, 'Codex: Redact secrets; structured logging allow-list.', 1.0],
    ['PAT-031', 'N+1 Query Pattern', ['performance', 'async timing'], ['codex/server'], ['slow'], AGENT_INDEX.CODEX, 'Codex: Batch queries; join or dataload.', 1.0],
    ['PAT-032', 'Pagination Off-By-One', ['schema', 'validation'], ['codex/server'], ['offset'], AGENT_INDEX.CODEX, 'Codex: Clamp page; total count vs limit.', 1.0],
    ['PAT-033', 'Unstable Sort in List', ['scoring', 'determinism'], ['codex/core'], ['order'], AGENT_INDEX.CODEX, 'Codex: Tie-break with stable secondary key.', 1.0],
    ['PAT-034', 'Cache Stampede', ['race', 'async timing'], ['codex/runtime'], ['cache'], AGENT_INDEX.GEMINI, 'Gemini: Single-flight populate; TTL jitter.', 1.0],
    ['PAT-035', 'Feature Flag Stuck On', ['config', 'state bleeding'], ['src/lib'], ['flag'], AGENT_INDEX.GEMINI, 'Gemini: Env override + kill switch route.', 1.0],
    ['PAT-036', 'Source Map Leak in Build', ['security', 'config'], ['scripts'], ['sourcemap'], AGENT_INDEX.BLACKBOX, 'Blackbox: Disable external maps in prod CI gate.', 1.0],
    ['PAT-037', 'Playwright Flaky Selector', ['async timing', 'test'], ['tests'], ['timeout'], AGENT_INDEX.BLACKBOX, 'Blackbox: data-testid; wait for network idle.', 1.0],
    ['PAT-038', 'Vitest Async Timeout', ['promise', 'async timing'], ['tests'], ['timeout'], AGENT_INDEX.BLACKBOX, 'Blackbox: fake timers; await microtasks.', 1.0],
    ['PAT-039', 'CI Cache Poisoned', ['import failure', 'config'], ['.github'], ['cache'], AGENT_INDEX.BLACKBOX, 'Blackbox: Bump cache key; verify lockfile hash.', 1.0],
    ['PAT-040', 'Worker Import from Codex Core', ['import failure', 'circular'], ['src/workers', 'codex/core'], ['LING'], AGENT_INDEX.CODEX, 'Codex: Route via official processor bridge API.', 1.0],
    ['PAT-041', 'Lexicon Adapter Corruption', ['parse error', 'schema'], ['codex/server'], ['sqlite'], AGENT_INDEX.CODEX, 'Codex: Integrity check; rebuild lexicon index.', 1.0],
    ['PAT-042', 'Rhyme Index Drift', ['scoring', 'schema'], ['codex/core'], ['rhyme'], AGENT_INDEX.CODEX, 'Codex: Rebuild rhyme-astrology index; verify fixtures.', 1.0],
    ['PAT-043', 'VerseIR Grapheme Offset Drift', ['schema', 'render mismatch'], ['codex/core', 'src/pages/Read'], ['offset'], AGENT_INDEX.CODEX, 'Codex: Align surfaceSpans with Truesight overlay.', 1.0],
    ['PAT-044', 'Bytecode Parse Failure', ['parse error', 'schema'], ['codex/core/pixelbrain'], ['PB-ERR'], AGENT_INDEX.CODEX, 'Codex: Validate PB framing; extend error context.', 1.0],
    ['PAT-045', 'MCP Bridge Disconnect', ['network timeout', 'import failure'], ['codex/server/collab'], ['mcp'], AGENT_INDEX.CODEX, 'Codex: Heartbeat + stderr logging; stdio lifecycle.', 1.0],
    ['PAT-046', 'Collab Lock TTL Expired', ['race', 'async timing'], ['codex/server/collab'], ['lock'], AGENT_INDEX.GEMINI, 'Gemini: Renew lock or release; preflight assign.', 1.0],
    ['PAT-047', 'Immune Scanner False Positive', ['validation', 'coverage'], ['codex/core/immunity'], ['IMMUNE'], AGENT_INDEX.BLACKBOX, 'Blackbox: Allow-list annotation or path exemption.', 1.0],
    ['PAT-048', 'TurboQuant WASM Fallback', ['performance', 'type error'], ['codex/core/quantization'], ['wasm'], AGENT_INDEX.CODEX, 'Codex: Ensure JS kernel parity tests pass.', 1.0],
    ['PAT-049', 'Lattice Grid Coordinate Overflow', ['range', 'render'], ['codex/core/pixelbrain'], ['coordinate'], AGENT_INDEX.CODEX, 'Codex: Clamp lattice coords; assert SCHEMA_CONTRACT.', 1.0],
    ['PAT-050', 'Truesight Semantic Ambiguity', ['schema', 'render mismatch'], ['src/pages/Read'], ['truesight'], AGENT_INDEX.CLAUDE, 'Claude: Disambiguate rhymeKey vs near-rhyme in overlay.', 1.0],
    ['PAT-051', 'AI Hallucination: Legacy Path Reintroduction', ['import failure', 'circular', 'LING'], ['codex/core', 'scripts'], ['No such file', 'cannot find module'], AGENT_INDEX.BLACKBOX, 'Blackbox: Agent used Archive/Prototypes as a base for new logic. Re-route to codex/core/rhyme-astrology or relevant canonical layer.', 1.0]
  ].map(row => new Pattern(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]))
];

/**
 * SEED STATISTICS
 */
export const SEED_STATS = {
  total: SEED_PATTERNS.length,
  byOwner: {
    Codex: SEED_PATTERNS.filter(p => p.owner === AGENT_INDEX.CODEX).length,
    Claude: SEED_PATTERNS.filter(p => p.owner === AGENT_INDEX.CLAUDE).length,
    Gemini: SEED_PATTERNS.filter(p => p.owner === AGENT_INDEX.GEMINI).length,
    Blackbox: SEED_PATTERNS.filter(p => p.owner === AGENT_INDEX.BLACKBOX).length
  }
};
