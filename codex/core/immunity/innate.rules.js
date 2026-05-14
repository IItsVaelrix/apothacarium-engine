/**
 * LAYER 1 — INNATE IMMUNITY (The Skin Barrier)
 *
 * Lightweight pattern checks to reject obvious entropy.
 * Cheap, fast, deterministic.
 *
 * Each rule emits a real PixelBrain bytecode error keyed to a dedicated
 * IMMUNITY error code (0x0F00–0x0FFF). The previous `customBytecode` meta
 * smuggle has been retired — see ARCH-2026-04-26-IMMUNE-SYSTEM.md and
 * BYTECODE-ERROR-SYSTEM-V3 for the canonical contract.
 */

import {
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../pixelbrain/bytecode-error.js';

/**
 * Canonical-path table for LING-0F04 (duplicate-path detector).
 * Seeded from `dead-code.md` 2026-04-25/26 entries and the BUG-FIX-PLAN
 * "DISCONNECTED-LOGIC" document. Each entry declares the canonical home
 * and the shadow paths that MUST NOT be re-introduced.
 *
 * If a staged file imports from any `forbidden` path while the project
 * already exports the same surface from `canonical`, Layer 1 blocks it.
 */
export const DUPLICATE_PATH_CANON = Object.freeze([
  {
    surface: 'animation-bytecode',
    canonical: 'codex/core/animation/bytecode/',
    forbidden: ['src/codex/animation/bytecode/', 'src/codex/animation/bytecode-bridge/'],
    incident: 'BUG-2026-04-26-ANIMATION-PARITY',
  },
  {
    surface: 'combat-scoring',
    canonical: 'codex/server/services/combatScoring.service.js',
    forbidden: ['src/lib/combatScoring.js', 'src/lib/combat/scoring.js'],
    incident: 'BUG-2026-04-26-COMBAT-AUTHORITY',
  },
  {
    surface: 'rhyme-engine',
    canonical: 'codex/core/rhyme-astrology/',
    forbidden: ['codex/core/rhyme/predictor.js', 'src/lib/rhyme/legacy/'],
    incident: 'BUG-2026-04-26-RHYME-SEVERANCE',
  },
  {
    surface: 'phoneme-analysis',
    canonical: 'codex/core/phonology/phoneme.engine.js',
    forbidden: ['src/components/phoneme.engine.js', 'src/lib/phoneme.engine.js'],
    incident: 'BUG-2026-04-26-DISCONNECTED-LOGIC',
  },
]);

function isTestPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return normalized.startsWith('tests/') || normalized.includes('/tests/') || normalized.includes('.test.');
}

function isDocumentationPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return normalized.startsWith('docs/') || normalized.endsWith('.md');
}

function isImmunityRulesPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').endsWith('codex/core/immunity/innate.rules.js');
}

/**
 * Innate ruleset. Each rule:
 *   - id            short ID (used in test assertions and dashboards)
 *   - name          human-readable label
 *   - category      ERROR_CATEGORIES.* (drives bytecode emission)
 *   - errorCode     ERROR_CODES.* (real first-class code)
 *   - severity      ERROR_SEVERITY.* (block strength)
 *   - moduleId      MODULE_IDS.IMMUNITY
 *   - detector(content, filePath) -> boolean | { matched: true, context }
 *   - repair        repair-suggestion key in repair.recommendations.js
 */
export const INNATE_RULES = [
  {
    id: 'QUANT-0101',
    name: 'Math.random() outside seeded contexts', // EXEMPT
    category: ERROR_CATEGORIES.VALUE,
    errorCode: ERROR_CODES.QUANT_PRECISION_LOSS,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.math-random.seeded',
    detector: (content, filePath) => {
      // Allow list: visual jitter / atmosphere
      if (filePath.includes('/effects/') || filePath.includes('/atmosphere/')) return false;
      if (isTestPath(filePath) || isDocumentationPath(filePath)) return false;
      // Skip if content contains the explicit allow annotation
      if (content.includes('IMMUNE_ALLOW: math-random')) return false;

      const regex = /Math\.random\(\)/g;
      const match = regex.test(content);
      if (!match) return false;
      return { matched: true, context: { pattern: 'Math.random()', filePath } }; // EXEMPT
    },
  },
  {
    id: 'QUANT-0102',
    name: 'Unseeded clock in hot paths',
    category: ERROR_CATEGORIES.VALUE,
    errorCode: ERROR_CODES.QUANT_PRECISION_LOSS,
    severity: ERROR_SEVERITY.WARN,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.unseeded-clock.pipeline-context',
    detector: (content, filePath) => {
      if (filePath.includes('/tests/') || filePath.includes('.test.')) return false;
      const regex = /Date\.now\(\)|performance\.now\(\)/g;
      const isHotPath = /scoring|rendering|resolve|compute/i.test(filePath);
      if (!(isHotPath && regex.test(content))) return false;
      return { matched: true, context: { pattern: 'Date.now()/performance.now()', filePath } }; // EXEMPT
    },
  },
  {
    id: 'LING-0F03',
    name: 'Forbidden UI -> Codex import',
    category: ERROR_CATEGORIES.LINGUISTIC,
    errorCode: ERROR_CODES.IMMUNE_FORBIDDEN_IMPORT,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.forbidden-import.bridge-via-lib',
    detector: (content, filePath) => {
      const normalized = filePath.replace(/^.*\/(src\/.*)$/, '$1');
      if (!normalized.startsWith('src/') || normalized.startsWith('src/lib/') || normalized.startsWith('src/codex/') || normalized.startsWith('src/hooks/')) return false;
      
      const regex = /import[^;]+from\s+['"]((?:\.\.\/)+)codex\//g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const relativePath = match[1];
        const depth = (relativePath.match(/\.\.\//g) || []).length;
        const fileDepth = (normalized.split('/').length) - 1;
        
        // If the import goes up to or beyond the src/ root, it's a root codex import
        if (depth >= fileDepth) {
          return { matched: true, context: { filePath: normalized, surface: 'ui->root-codex' } };
        }
      }
      return false;
    },
  },
  {
    id: 'LING-0F04',
    name: 'Duplicate path / shadow import',
    category: ERROR_CATEGORIES.LINGUISTIC,
    errorCode: ERROR_CODES.IMMUNE_DUPLICATE_PATH,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.duplicate-path.canon',
    detector: (content, filePath) => {
      if (isTestPath(filePath)) return false;
      for (const entry of DUPLICATE_PATH_CANON) {
        for (const forbidden of entry.forbidden) {
          // (1) Imports referencing a forbidden shadow surface
          // Use literal string match to avoid regex escaping headaches with /
          const importRegex = new RegExp(
            `(?:import[^;]+from|require\\s*\\(|import\\s*\\()\\s*['"][^'"]*${escapeForRegex(forbidden)}[^'"]*['"]`,
          );
          if (importRegex.test(content)) {
            return {
              matched: true,
              context: {
                surface: entry.surface,
                canonical: entry.canonical,
                shadowPath: forbidden,
                incident: entry.incident,
                trigger: 'import',
              },
            };
          }
          // (2) The file itself IS the forbidden path being re-introduced
          if (filePath.includes(forbidden)) {
            return {
              matched: true,
              context: {
                surface: entry.surface,
                canonical: entry.canonical,
                shadowPath: forbidden,
                incident: entry.incident,
                trigger: 'file-resurrection',
              },
            };
          }
        }
      }
      return false;
    },
  },
  {
    id: 'LING-0F05',
    name: 'Known-violation literal',
    category: ERROR_CATEGORIES.LINGUISTIC,
    errorCode: ERROR_CODES.IMMUNE_KNOWN_VIOLATION_LITERAL,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.known-violation.cleansing',
    detector: (content, filePath) => {
      if (isTestPath(filePath) || isImmunityRulesPath(filePath)) return false;
      // Forbidden symbol names purged in the Corruption Cleansing.
      // Source: dead-code.md + BUG-FIX-PLAN-2026-04-26-DISCONNECTED-LOGIC.md
      const forbidden = [
        'legacyRhymeTree',
        'combatScoringOld',
        'toolbarBytecode',
        'calculateCombatScoreClient',
      ];
      const hit = forbidden.find((sym) => content.includes(sym));
      if (!hit) return false;
      return { matched: true, context: { symbol: hit } };
    },
  },
  {
    id: 'STATE-0305',
    name: 'Uninitialized session blocking CSRF',
    // Reconciled (per ARCH-2026-04-26-IMMUNE-SYSTEM § STATE-0305 reconciliation):
    // this rule is a STATE/lifecycle invariant, not a LINGUISTIC pattern.
    // Emitted under ERROR_CATEGORIES.STATE with INVARIANT_VIOLATION.
    category: ERROR_CATEGORIES.STATE,
    errorCode: ERROR_CODES.INVARIANT_VIOLATION,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.session.save-uninitialized',
    detector: (content, filePath) => {
      if (!filePath.endsWith('server/index.js')) return false;
      const regex = /saveUninitialized:\s*false/;
      if (!regex.test(content)) return false;
      return { matched: true, context: { filePath, setting: 'saveUninitialized:false' } };
    },
  },
  {
    id: 'STATE-0306',
    name: 'Shadowing Recursion Pathogen',
    category: ERROR_CATEGORIES.STATE,
    errorCode: ERROR_CODES.INVARIANT_VIOLATION,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.recursion.alias-imports',
    detector: (content) => {
      // Look for async methods that return a call to a function of the same name
      const pattern = /async\s+(\w+)\s*\([^)]*\)\s*\{[^}]*return\s+await\s+\1\s*\(/;
      if (!pattern.test(content)) return false;
      return { matched: true, context: { pathogen: 'infinite_recursion' } };
    },
  },
  {
    id: 'INFRA-0G01',
    name: 'Infrastructure Port Drift',
    category: ERROR_CATEGORIES.STATE,
    errorCode: ERROR_CODES.INVARIANT_VIOLATION,
    severity: ERROR_SEVERITY.WARN,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.infra.port-alignment',
    detector: (content, filePath) => {
      if (isImmunityRulesPath(filePath)) return false;
      // Look for the legacy port 3000 in configuration files
      // while Docker/Fly are on 8080.
      if (filePath.endsWith('.env') || filePath.endsWith('README.md') || filePath.endsWith('.js')) {
        const regex = /localhost:3000|PORT=3000/;
        if (regex.test(content)) {
          return { matched: true, context: { filePath, detail: 'Legacy port 3000 detected; expect 8080' } };
        }
      }
      return false;
    },
  },
  {
    id: 'STATE-0307',
    name: 'Handshake Fragmentation (Redundant CSRF)',
    category: ERROR_CATEGORIES.STATE,
    errorCode: ERROR_CODES.INVARIANT_VIOLATION,
    severity: ERROR_SEVERITY.WARN,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.handshake.centralized-csrf',
    detector: (content, filePath) => {
      // Look for getCsrfToken calls outside of useAuth.jsx
      if (filePath.endsWith('useAuth.jsx') || filePath.includes('test') || filePath.includes('scripts')) return false;
      if (content.includes('// IMMUNE_ALLOW: redundant-csrf')) return false;
      const regex = /await\s+getCsrfToken\(\)/;
      if (regex.test(content)) {
        return { matched: true, context: { filePath, detail: 'Redundant CSRF fetch detected outside authority hook.' } };
      }
      return false;
    },
  },
  {
    id: 'LING-0F06',
    name: 'Phoneme Bridge Fracture (Relative Path Mismatch)',
    category: ERROR_CATEGORIES.LINGUISTIC,
    errorCode: ERROR_CODES.IMMUNE_PROTOCOL_BLOCK,
    severity: ERROR_SEVERITY.CRIT,
    moduleId: MODULE_IDS.IMMUNITY,
    repairKey: 'repair.phoneme.relative-bridge',
    detector: (content, filePath) => {
      if (!filePath.endsWith('vowelFamily.js')) return false;
      // Detect incorrect relative depth: ../../../ instead of ./
      const regex = /import\s+\{\s*FAMILY_IDENTITY\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/codex\/core\/phonology\/vowelWheel\.js['"]/;
      if (regex.test(content)) {
        return { matched: true, context: { filePath, violation: 'Incorrect relative depth for FAMILY_IDENTITY' } };
      }
      return false;
    },
  },
];

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
