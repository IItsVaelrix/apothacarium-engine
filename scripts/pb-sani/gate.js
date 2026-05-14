/**
 * PixelBrain QA — Deletion Gate
 *
 * Enforces safety rules before any symbol can be marked DELETE.
 * Rule 1: No deletion without evidence graph
 * Rule 5: Archive over delete when architecture signal exists
 */

export const DELETION_GATE_RULES = Object.freeze({
  maxImports: 0,
  maxCalls: 0,
  maxRegistrations: 0,
  maxConfigRefs: 0,
  maxTestRefsForDelete: 0, // must be zero for DELETE, test-only gets ARCHIVE
  maxStrategicValue: 'LOW', // must be LOW for automatic DELETE
  minConfidence: 0.6,
});

export function canDelete(record) {
  const { evidence, strategicValue, inertClass, confidence } = record;
  const rules = DELETION_GATE_RULES;

  const reasons = [];

  // Rule 1: No runtime path
  if ((evidence.importsIn || []).length > rules.maxImports) {
    reasons.push(`FAIL: has ${evidence.importsIn.length} import references (max ${rules.maxImports})`);
  }
  if ((evidence.callsIn || []).length > rules.maxCalls) {
    reasons.push(`FAIL: has ${evidence.callsIn.length} call references (max ${rules.maxCalls})`);
  }
  if ((evidence.registeredInRuntime || []).length > rules.maxRegistrations) {
    reasons.push(`FAIL: has ${evidence.registeredInRuntime.length} runtime registrations (max ${rules.maxRegistrations})`);
  }
  if ((evidence.referencedByConfig || []).length > rules.maxConfigRefs) {
    reasons.push(`FAIL: has ${evidence.referencedByConfig.length} config references (max ${rules.maxConfigRefs})`);
  }

  // Test-only residue gets ARCHIVE not DELETE
  if (inertClass === 'TEST_ONLY_RESIDUE') {
    reasons.push('FAIL: test-only residue should be ARCHIVE, not DELETE');
  }

  // Rule 4: Bytecode/core infra is presumed strategic
  if (strategicValue === 'HIGH') {
    reasons.push('FAIL: high strategic value — core bytecode/QA infrastructure');
  }

  // Confidence threshold
  if (confidence < rules.minConfidence) {
    reasons.push(`FAIL: confidence ${confidence.toFixed(2)} below threshold ${rules.minConfidence}`);
  }

  // Rule 5: Archive over delete
  if (inertClass === 'DORMANT' && strategicValue === 'MEDIUM') {
    reasons.push('FAIL: dormant with medium value — prefer ARCHIVE');
  }
  if (inertClass === 'BROKEN_CHAIN' && strategicValue !== 'LOW') {
    reasons.push('FAIL: broken chain with non-low value — prefer REVIEW');
  }

  if (reasons.length > 0) {
    return { allowed: false, reasons };
  }

  return { allowed: true, reasons: [] };
}

export function canArchive(record) {
  // Archiving is always allowed (Rule 5: prefer archive over delete)
  // Only block if it's actively used
  const { evidence } = record;
  const reasons = [];

  if ((evidence.callsIn || []).length > 5) {
    reasons.push(`WARN: has ${evidence.callsIn.length} call references — may be actively used`);
  }
  if ((evidence.registeredInRuntime || []).length > 0) {
    reasons.push(`WARN: has ${evidence.registeredInRuntime.length} runtime registrations — actively registered`);
  }

  if (reasons.length > 0) {
    return { allowed: true, reasons, advisory: 'Symbol may still be active — review before archiving' };
  }

  return { allowed: true, reasons: [], advisory: null };
}

export function gateDecision(record) {
  if (record.aiSummary.recommendation === 'DELETE') {
    const gate = canDelete(record);
    if (!gate.allowed) {
      return { action: 'REVIEW', gateResults: gate, reason: 'Deletion gate blocked — escalating to REVIEW' };
    }
    return { action: 'DELETE', gateResults: gate, reason: 'All deletion gate rules passed' };
  }
  if (record.aiSummary.recommendation === 'ARCHIVE') {
    const gate = canArchive(record);
    return { action: 'ARCHIVE', gateResults: gate, reason: gate.advisory || 'Archive recommended' };
  }
  if (record.aiSummary.recommendation === 'KEEP') {
    return { action: 'KEEP', gateResults: { allowed: true, reasons: [] }, reason: 'Symbol is actively used' };
  }
  // REVIEW
  return { action: 'REVIEW', gateResults: { allowed: false, reasons: ['Insufficient evidence for automated action'] }, reason: 'Manual review required' };
}
