/**
 * PixelBrain QA — Classification Engine
 *
 * Takes the symbol graph and classifies each exported symbol into
 * one of 8 inert classes with evidence, reachability, and strategic value.
 */

import { basename } from 'node:path';
import {
  INERT_CLASSES,
  SEVERITIES,
  REACHABILITY,
  STRATEGIC_VALUES,
  ROLES,
} from './fingerprint.js';

// ─── Module ID Mapping ──────────────────────────────────────────────────────

const MODULE_MAP = [
  { pattern: /pixelbrain|pixel.?brain/i, id: 'PIXELBRAIN' },
  { pattern: /bytecode.error|PB-ERR/i, id: 'ERRCODE' },
  { pattern: /coord.?sym|symmetry|lattice/i, id: 'COORDSYM' },
  { pattern: /formula|dimension.*compiler/i, id: 'IMGFOR' },
  { pattern: /image.*bytecode|image.?to/i, id: 'IMGPIX' },
  { pattern: /color.*palette|palette.*resolv/i, id: 'COLBYT' },
  { pattern: /extension.*registry|extension.*adapter/i, id: 'EXTREG' },
  { pattern: /ui.?stat|component|page/i, id: 'UISTAS' },
  { pattern: /phoneme|rhyme|lingua/i, id: 'LINGUA' },
  { pattern: /combat|score|analysis/i, id: 'COMBAT' },
  { pattern: /audio|sound|wave/i, id: 'AUDIO' },
  { pattern: /corpus|lexicon|dictionary|dict/i, id: 'LEXICON' },
  { pattern: /collab|agent|heartbeat/i, id: 'COLLAB' },
  { pattern: /config|settings|theme|school/i, id: 'CONFIG' },
  { pattern: /route|handler|middleware|server.*index/i, id: 'ROUTE' },
  { pattern: /build|script|generate/i, id: 'BUILD' },
  { pattern: /hook|use[A-Z]|context/i, id: 'HOOK' },
  { pattern: /adapter/i, id: 'ADAPTER' },
  { pattern: /schema|zod|type/i, id: 'SCHEMA' },
  { pattern: /qa|assert|verify|stasis/i, id: 'QA' },
  { pattern: /test|harness|fixture/i, id: 'TEST' },
  { pattern: /shared|util|helper|common|constant/i, id: 'UTIL' },
];

function resolveModuleId(relPath) {
  for (const { pattern, id } of MODULE_MAP) {
    if (pattern.test(relPath)) return id;
  }
  return 'OTHER';
}

// ─── Role Inference ──────────────────────────────────────────────────────────

function inferRole(symbolName, relPath, code) {
  const combined = `${symbolName} ${relPath} ${code || ''}`.toLowerCase();

  if (/bridge/.test(combined)) return 'FORMULA_BRIDGE';
  if (/formula.*compil|compil.*formula/.test(combined)) return 'FORMULA_COMPILER';
  if (/formula.*eval|eval.*formula/.test(combined)) return 'FORMULA_EVALUATOR';
  if (/symmetr|mirror|canonical/.test(combined)) return 'SYMMETRY_TRANSFORM';
  if (/coord.*transform|transform.*coord|project|unproject/.test(combined)) return 'COORDINATE_TRANSFORM';
  if (/grid.*render|render.*grid|draw.*grid/.test(combined)) return 'GRID_RENDERER';
  if (/grid.*template|template.*grid/.test(combined)) return 'GRID_TEMPLATE';
  if (/regist|registry|hook.*manager/.test(combined)) return 'HOOK_REGISTRY';
  if (/adapter|wrapp|proxy/i.test(combined)) return 'EXTENSION_ADAPTER';
  if (/error.*factor|error.*creat|creat.*error|encode.*error|error.*encod/.test(combined)) return 'ERROR_FACTORY';
  if (/error.*decod|decod.*error|parse.*error/.test(combined)) return 'ERROR_DECODER';
  if (/pixel.?snap|snap.*pixel/.test(combined)) return 'PIXEL_SNAP';
  if (/palette.*resolv|color.*map|resolv.*color/.test(combined)) return 'PALETTE_RESOLVER';
  if (/texture.*blend|blend.*texture/.test(combined)) return 'TEXTURE_BLEND';
  if (/semantic.*bridge|bridge.*semantic/.test(combined)) return 'SEMANTIC_BRIDGE';
  if (/phoneme.*heat|heat.*phoneme/.test(combined)) return 'PHONEME_HEATMAP';
  if (/bpm|rotat|spin/.test(combined)) return 'BPM_ROTATION';
  if (/anchor.*layout|layout.*anchor/.test(combined)) return 'ANCHOR_LAYOUT';
  if (/debug|overlay|inspect/.test(combined)) return 'DEBUG_OVERLAY';
  if (/export.*format|format.*export/.test(combined)) return 'EXPORT_FORMATTER';
  if (/export.*adapt|adapt.*export/.test(combined)) return 'EXPORT_ADAPTER';
  if (/assert|invariant|verify|check/.test(combined)) return 'QA_ASSERTION';
  if (/qa.*report|report.*qa|stasis|visual.*test/.test(combined)) return 'QA_REPORTER';
  if (/combat|resolv.*combat|combat.*score/.test(combined)) return 'COMBAT_RESOLVER';
  if (/scroll.*analy|analy.*scroll|verse|poem/.test(combined)) return 'SCROLL_ANALYSIS';
  if (/linguist|phoneme|rhyme|sound/.test(combined)) return 'LINGUISTIC_ANALYSIS';
  if (/audio|sound|wave|music/.test(combined)) return 'AUDIO_ADAPTER';
  if (/component|page|view|screen/.test(combined)) return 'UI_COMPONENT';
  if (/use\w|hook|context/.test(combined)) return 'STATE_HOOK';
  if (/model|schema|type|interface/.test(combined)) return 'DATA_MODEL';
  if (/util|helper|common|shared|misc/.test(combined)) return 'UTIL_HELPER';
  if (/config|settings|option|pref/.test(combined)) return 'CONFIG_REGISTRY';
  if (/route|handler|endpoint|controller/.test(combined)) return 'ROUTE_HANDLER';
  if (/middle|intercept|guard|auth/.test(combined)) return 'MIDDLEWARE';
  if (/test|harness|fixture|mock/.test(combined)) return 'TEST_HARNESS';
  if (/build|generat|script|init/.test(combined)) return 'BUILD_TOOL';

  return 'OTHER';
}

// ─── Strategic Value Heuristics ──────────────────────────────────────────────

function assessStrategicValue(symbol, relPath) {
  const name = symbol.name || '';
  const path = relPath || '';

  // Bytecode/core QA infrastructure is presumed strategic (Rule 4)
  if (/bytecode|error.*factor|PB-ERR|QA.*assert|stasis|fingerprint/.test(path + name)) {
    return 'HIGH';
  }
  // Extension/registry hooks are architecturally meaningful
  if (/extension.*registry|regist|hook.*manager/.test(path)) return 'HIGH';
  // Combat, scoring, analysis — core game logic
  if (/combat|score|phoneme|rhyme|lingua|lexicon/.test(path)) return 'HIGH';
  // Symmetry/coordinate systems — complex math, worth preserving
  if (/symmetry|coord.*transform|lattice/.test(path)) return 'HIGH';
  // Schema definitions
  if (/schema|type.*def|zod|contract/.test(path)) return 'HIGH';
  // Adapters — they connect systems, worth understanding
  if (/adapter/.test(path)) return 'MEDIUM';
  // Build scripts — needed once, not strategic per se
  if (/build.*script|generate.*style|generate.*school/.test(path)) return 'MEDIUM';
  // UI components — moderate strategic value
  if (/component|page|view/.test(path)) return 'MEDIUM';
  // Utility helpers — often low value
  if (/util|helper|common|shared/.test(path)) return 'LOW';
  // Test harness — low strategic value
  if (/test|harness|fixture/.test(path)) return 'LOW';
  // Debug/inspect — often decorative residue
  if (/debug|inspect|log/.test(path)) return 'LOW';

  return 'MEDIUM'; // default: not sure, review advised
}

// ─── Reachability Assessment ─────────────────────────────────────────────────

function assessReachability(symbol) {
  const hasImporters = symbol.importedBy && symbol.importedBy.length > 0;
  const hasCallers = symbol.calledBy && symbol.calledBy.length > 0;
  const hasValueRefs = symbol.referencedBy && symbol.referencedBy.length > 0;
  const hasRegistrations = symbol.registeredIn && symbol.registeredIn.length > 0;
  const hasTests = symbol.testedIn && symbol.testedIn.length > 0;
  const hasLocalRefs = symbol.localRefs && symbol.localRefs.length > 0;

  if (hasCallers || hasValueRefs || hasImporters || hasRegistrations || hasLocalRefs) {
    return 'PARTIAL'; // at least one active reference
  }
  if (hasTests && !hasCallers && !hasImporters) {
    return 'TEST_ONLY';
  }
  return 'NONE';
}

// ─── Inert Class Classification ──────────────────────────────────────────────

function classifyInert(symbol, relPath, fileData) {
  const reach = assessReachability(symbol);
  const hasActivePath = reach !== 'NONE';
  const isCallable = symbol.type === 'function' || symbol.type === 'class';
  const hasLocalRefs = symbol.localRefs && symbol.localRefs.length > 0;

  // ORPHANED: no imports, no calls, no registration, no runtime path
  if (!hasActivePath && !symbol.registeredIn?.length) {
    return 'ORPHANED';
  }

  // SHADOWED: check if another file exports the same name with similar purpose
  if (symbol.exported && hasActivePath === false) {
    if (/old|legacy|v1|deprecated|backup/.test(relPath)) {
      return 'SHADOWED';
    }
  }

  // TEST_ONLY_RESIDUE: only referenced by tests
  if (reach === 'TEST_ONLY') {
    return 'TEST_ONLY_RESIDUE';
  }

  // BROKEN_CHAIN: functions/classes that are imported but never called
  // Constants, types, and data models are consumed by value — not called.
  if (
    reach === 'PARTIAL'
    && isCallable
    && symbol.importedBy?.length > 0
    && symbol.calledBy?.length === 0
    && symbol.referencedBy?.length === 0
    && symbol.registeredIn?.length === 0
    && !hasLocalRefs
  ) {
    return 'BROKEN_CHAIN';
  }

  // MIGRATION_RELIC: legacy bridge patterns
  if (/bridge|legacy|compat|shim|adapt.*old/.test(relPath) && !hasActivePath) {
    return 'MIGRATION_RELIC';
  }

  // DECORATIVE_RESIDUE: exported but no consumers, likely a shell
  if (!hasActivePath && symbol.exported) {
    return 'DECORATIVE_RESIDUE';
  }

  // CONFIG_GHOST: constants/enums/config with no consumers
  if (symbol.type === 'const' || symbol.type === 'enum') {
    if (!hasActivePath && !symbol.registeredIn?.length) {
      return 'CONFIG_GHOST';
    }
  }

  // DORMANT: has some evidence of intent but currently inactive
  if (!hasActivePath) {
    return 'DORMANT';
  }

  return null; // active, not inert
}

// ─── Severity Assessment ─────────────────────────────────────────────────────

function assessSeverity(inertClass, strategicValue, reach) {
  if (inertClass === 'BROKEN_CHAIN' && strategicValue === 'HIGH') return 'CRIT';
  if (inertClass === 'ORPHANED' && strategicValue === 'LOW') return 'WARN';
  if (inertClass === 'MIGRATION_RELIC' && strategicValue === 'LOW') return 'CRIT';
  if (inertClass === 'SHADOWED' && strategicValue === 'LOW') return 'CRIT';
  if (inertClass === 'CONFIG_GHOST') return 'WARN';
  if (inertClass === 'DECORATIVE_RESIDUE') return 'WARN';
  if (inertClass === 'TEST_ONLY_RESIDUE') return 'INFO';
  if (inertClass === 'DORMANT') return 'INFO';
  return 'WARN';
}

// ─── Evidence Graph ──────────────────────────────────────────────────────────

function buildEvidence(symbol, relPath) {
  return {
    importsIn: symbol.importedBy || [],
    callsIn: symbol.calledBy || [],
    localRefs: symbol.localRefs || [],
    valueRefs: symbol.referencedBy || [],
    referencedByConfig: symbol.configRefs || [],
    referencedByTests: symbol.testedIn || [],
    registeredInRuntime: symbol.registeredIn || [],
    exported: symbol.exported || false,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function classifySymbol(symbol, relPath, fileData) {
  const inertClass = classifyInert(symbol, relPath, fileData);
  if (inertClass === null) return null; // active, skip

  const moduleId = resolveModuleId(relPath);
  const role = inferRole(symbol.name, relPath);
  const reachability = assessReachability(symbol);
  const strategicValue = assessStrategicValue(symbol, relPath);
  const severity = assessSeverity(inertClass, strategicValue, reachability);
  const evidence = buildEvidence(symbol, relPath);

  return {
    inertClass,
    severity,
    moduleId,
    role,
    reachability,
    strategicValue,
    evidence,
  };
}
