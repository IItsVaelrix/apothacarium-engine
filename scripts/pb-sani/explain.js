/**
 * PixelBrain QA — Explanation Engine
 *
 * Produces AI-readable summaries for every inert candidate:
 *   - what it was supposed to do
 *   - whether it's still valuable
 *   - archive vs delete recommendation
 */

import { encodeFingerprint, hashFingerprint } from './fingerprint.js';
import { classifySymbol } from './classify.js';

// ─── Purpose Inference ───────────────────────────────────────────────────────

function inferPurpose(symbolName, relPath, role, inertClass) {
  const name = symbolName || 'anonymous';
  const path = relPath || 'unknown';

  const templates = {
    FORMULA_BRIDGE: `Bridge function translating formula output into coordinate runtime for '${name}'`,
    FORMULA_COMPILER: `Compile/parse formula expressions for '${name}' in ${path}`,
    FORMULA_EVALUATOR: `Evaluate formula expressions for '${name}'`,
    SYMMETRY_TRANSFORM: `Symmetry coordinate transformation for '${name}'`,
    COORDINATE_TRANSFORM: `Coordinate space transformation for '${name}'`,
    GRID_RENDERER: `Render grid/lattice visual output for '${name}'`,
    GRID_TEMPLATE: `Define grid templates for '${name}'`,
    HOOK_REGISTRY: `Register/manage React hooks or extension hooks for '${name}'`,
    EXTENSION_ADAPTER: `Adapt external/internal extension data for '${name}'`,
    ERROR_FACTORY: `Factory for creating structured error objects for '${name}'`,
    ERROR_DECODER: `Decode/parse structured error data for '${name}'`,
    PIXEL_SNAP: `Snap coordinates to pixel grid for '${name}'`,
    PALETTE_RESOLVER: `Resolve color palette mappings for '${name}'`,
    TEXTURE_BLEND: `Blend texture/color layers for '${name}'`,
    SEMANTIC_BRIDGE: `Bridge semantic data between systems for '${name}'`,
    PHONEME_HEATMAP: `Generate phoneme density heatmap for '${name}'`,
    BPM_ROTATION: `BPM-driven rotation animation for '${name}'`,
    ANCHOR_LAYOUT: `Anchor-based layout positioning for '${name}'`,
    DEBUG_OVERLAY: `Debug/inspection overlay for '${name}'`,
    EXPORT_FORMATTER: `Format data for export for '${name}'`,
    EXPORT_ADAPTER: `Adapt data for external export formats for '${name}'`,
    QA_ASSERTION: `QA assertion/check for '${name}'`,
    QA_REPORTER: `Generate QA reports for '${name}'`,
    COMBAT_RESOLVER: `Resolve combat outcomes and scoring for '${name}'`,
    SCROLL_ANALYSIS: `Analyze scroll/verse content for '${name}'`,
    LINGUISTIC_ANALYSIS: `Perform linguistic analysis for '${name}'`,
    AUDIO_ADAPTER: `Interface with audio subsystem for '${name}'`,
    UI_COMPONENT: `React UI component '${name}' in ${path}`,
    STATE_HOOK: `React state management hook '${name}'`,
    DATA_MODEL: `Data model/schema definition for '${name}'`,
    UTIL_HELPER: `Utility helper function '${name}' for shared operations`,
    CONFIG_REGISTRY: `Configuration/setting registry for '${name}'`,
    ROUTE_HANDLER: `HTTP route handler for '${name}'`,
    MIDDLEWARE: `Request middleware for '${name}'`,
    TEST_HARNESS: `Test infrastructure for '${name}'`,
    BUILD_TOOL: `Build/generation tool for '${name}'`,
    OTHER: `Utility function or constant '${name}' in ${path}`,
  };

  return templates[role] || templates.OTHER;
}

// ─── Flag Reasoning ──────────────────────────────────────────────────────────

function buildWhyFlagged(evidence, inertClass) {
  const reasons = [];
  if (!evidence.importsIn.length) reasons.push('No active import path detected');
  if (!evidence.callsIn.length) reasons.push('No call sites found');
  if (!evidence.referencedByTests.length) reasons.push('No test references');
  if (!evidence.registeredInRuntime.length) reasons.push('No runtime registration');

  switch (inertClass) {
    case 'ORPHANED':
      return ['Exported but not imported, called, or registered anywhere', ...reasons];
    case 'SHADOWED':
      return ['Likely superseded by a newer implementation', ...reasons];
    case 'DORMANT':
      return ['No active execution path but may serve future/optional flows', ...reasons];
    case 'BROKEN_CHAIN':
      return ['Imported but never invoked — dependency chain appears severed', ...reasons];
    case 'DECORATIVE_RESIDUE':
      return ['Exported surface exists but has no effect on output', ...reasons];
    case 'TEST_ONLY_RESIDUE':
      return ['Only referenced by test code, not by application runtime', ...reasons];
    case 'MIGRATION_RELIC':
      return ['Legacy bridge/shim from a migration that appears complete', ...reasons];
    case 'CONFIG_GHOST':
      return ['Constant/enum with no downstream consumers', ...reasons];
    default:
      return reasons;
  }
}

// ─── Recommendation Engine ───────────────────────────────────────────────────

function decideRecommendation(reachability, strategicValue, inertClass) {
  // Decision matrix from spec
  if (reachability === 'NONE' && strategicValue === 'LOW') return 'DELETE';
  if (reachability === 'NONE' && strategicValue === 'MEDIUM') return 'ARCHIVE';
  if (reachability === 'NONE' && strategicValue === 'HIGH') return 'REVIEW';
  if (reachability === 'PARTIAL' && strategicValue === 'LOW') return 'REVIEW';
  if (reachability === 'TEST_ONLY' && strategicValue === 'LOW') return 'ARCHIVE';
  if (reachability === 'OPTIONAL' && (strategicValue === 'MEDIUM' || strategicValue === 'HIGH')) return 'KEEP';
  if (inertClass === 'SHADOWED' && strategicValue === 'LOW') return 'DELETE';
  if (inertClass === 'BROKEN_CHAIN' && strategicValue === 'HIGH') return 'REVIEW';
  if (inertClass === 'MIGRATION_RELIC' && strategicValue === 'LOW') return 'DELETE';

  // Default conservative
  if (strategicValue === 'HIGH') return 'REVIEW';
  if (strategicValue === 'MEDIUM') return 'ARCHIVE';
  return 'DELETE';
}

function buildRationale(recommendation, inertClass, strategicValue, evidence) {
  const rationale = [];

  if (recommendation === 'DELETE') {
    rationale.push('No active execution path detected');
    if (strategicValue === 'LOW') rationale.push('Low strategic value — no architectural significance');
    if (!evidence.referencedByTests.length) rationale.push('Not covered by meaningful tests');
    if (inertClass === 'MIGRATION_RELIC') rationale.push('Migration complete — bridge no longer needed');
    if (inertClass === 'SHADOWED') rationale.push('Newer implementation exists — this is superseded');
  } else if (recommendation === 'ARCHIVE') {
    rationale.push('No active call path detected');
    rationale.push('Still conceptually aligned with an active subsystem');
    rationale.push('Potential reuse value exceeds deletion value');
  } else if (recommendation === 'REVIEW') {
    rationale.push('Partial or broken reference chain suggests severed dependency');
    if (strategicValue === 'HIGH') rationale.push('High strategic value — manual review required before any action');
    rationale.push('May be indirectly reachable through registry or configuration');
  } else if (recommendation === 'KEEP') {
    rationale.push('Active optional execution path exists');
    if (strategicValue === 'HIGH') rationale.push('Core architectural component');
  }

  return rationale;
}

function buildAiSummary(recommendation, symbolName, relPath, purpose, whyFlagged, rationale, strategicValue) {
  return {
    whatItWasSupposedToDo: purpose,
    isStillValuable: strategicValue === 'HIGH' ? 'Yes — core architectural significance'
      : strategicValue === 'MEDIUM' ? 'Potentially — aligned with an active subsystem'
        : 'Unlikely — low strategic value',
    recommendation,
    rationale,
  };
}

// ─── Confidence Scoring ──────────────────────────────────────────────────────

function computeConfidence(classification, evidence) {
  let score = 0.5; // baseline

  // More evidence = higher confidence
  const totalRefs = (evidence.importsIn.length + evidence.callsIn.length
    + evidence.referencedByTests.length + evidence.registeredInRuntime.length);

  if (totalRefs === 0) score += 0.3; // clean orphan
  else if (totalRefs === 1) score += 0.1;
  else score -= 0.1; // lots of refs, why flagged?

  // Strategic value clarity
  if (classification.strategicValue === 'LOW') score += 0.1;
  if (classification.strategicValue === 'HIGH') score -= 0.1; // harder to be sure

  // Test coverage clarity
  if (evidence.referencedByTests.length === 0) score += 0.05;
  if (evidence.referencedByTests.length > 2) score -= 0.1;

  return Math.max(0.1, Math.min(0.99, score));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function explainSymbol(symbol, relPath, fileData) {
  const classification = classifySymbol(symbol, relPath, fileData);
  if (!classification) return null; // active symbol, skip

  const { inertClass, severity, moduleId, role, reachability, strategicValue, evidence } = classification;

  const purpose = inferPurpose(symbol.name, relPath, role, inertClass);
  const whyFlagged = buildWhyFlagged(evidence, inertClass);
  const recommendation = decideRecommendation(reachability, strategicValue, inertClass);
  const rationale = buildRationale(recommendation, inertClass, strategicValue, evidence);
  const confidence = computeConfidence(classification, evidence);

  const fingerprint = encodeFingerprint({
    inertClass, severity, moduleId, role, reachability, strategicValue,
    path: relPath, symbolName: symbol.name,
  });

  const aiSummary = buildAiSummary(recommendation, symbol.name, relPath, purpose, whyFlagged, rationale, strategicValue);

  return {
    fingerprint,
    path: relPath,
    symbolName: symbol.name,
    symbolType: symbol.type || 'function',
    inertClass,
    severity,
    moduleId,
    intendedRole: role,
    reachability,
    strategicValue,
    evidence,
    inferredPurpose: purpose,
    whyFlagged,
    archiveRecommendation: recommendation === 'ARCHIVE',
    deleteRecommendation: recommendation === 'DELETE',
    confidence,
    aiSummary,
    checksum: fingerprint.split('-').pop(),
  };
}
