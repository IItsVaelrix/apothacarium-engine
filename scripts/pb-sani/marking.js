/**
 * PixelBrain QA — Marking Protocol
 *
 * Generates:
 *   1. Inline comment blocks for flagged symbols
 *   2. Human-readable QA report
 *   3. Machine-readable manifest (sanitization.manifest.json)
 */

import { gateDecision } from './gate.js';

// ─── Inline Comment Generation ───────────────────────────────────────────────

export function generateInlineComment(record) {
  const { fingerprint, aiSummary, inferredPurpose, whyFlagged } = record;
  const status = aiSummary.recommendation;

  const lines = [
    `/**`,
    ` * ${fingerprint}`,
    ` * STATUS: ${status}`,
    ` * PURPOSE: ${inferredPurpose}`,
    ` * FLAG REASON:`,
    ...whyFlagged.map(r => ` *   - ${r}`),
    ` * AI NOTE: ${aiSummary.rationale.join('; ')}`,
    ` */`,
  ];

  return lines.join('\n');
}

export function generateInlineCommentBlock(record) {
  const comment = generateInlineComment(record);
  return `\n${comment}\n`;
}

// ─── Human-Readable Report ───────────────────────────────────────────────────

export function formatHumanReport(record) {
  const {
    fingerprint, symbolName, path, symbolType,
    inertClass, severity, moduleId, intendedRole,
    reachability, strategicValue, evidence,
    inferredPurpose, whyFlagged, confidence, aiSummary,
  } = record;

  const gate = gateDecision(record);

  const sections = [
    `### ${fingerprint}`,
    ``,
    `**Symbol:** \`${symbolName}\` (${symbolType})`,
    `**File:** \`${path}\``,
    `**Module:** ${moduleId}`,
    `**Inert Class:** ${inertClass}`,
    `**Severity:** ${severity}`,
    `**Role:** ${intendedRole}`,
    `**Reachability:** ${reachability}`,
    `**Strategic Value:** ${strategicValue}`,
    `**Confidence:** ${(confidence * 100).toFixed(0)}%`,
    ``,
    `**Supposed purpose**`,
    inferredPurpose,
    ``,
    `**Why flagged**`,
    ...whyFlagged.map(r => `- ${r}`),
    ``,
    `**Evidence**`,
    `- Imports: ${evidence.importsIn.length} (${evidence.importsIn.slice(0, 3).join(', ') || 'none'})`,
    `- Call sites: ${evidence.callsIn.length} (${evidence.callsIn.slice(0, 3).join(', ') || 'none'})`,
    `- Runtime registration: ${evidence.registeredInRuntime.length > 0 ? evidence.registeredInRuntime.join(', ') : 'none'}`,
    `- Test references: ${evidence.referencedByTests.length > 0 ? evidence.referencedByTests.join(', ') : 'none'}`,
    ``,
    `**Value assessment**`,
    aiSummary.isStillValuable,
    ``,
    `**Recommendation**`,
    gate.action,
    ``,
    `**Reasoning**`,
    ...aiSummary.rationale.map(r => `- ${r}`),
    ...gate.gateResults.reasons.map(r => `- [GATE] ${r}`),
    ``,
  ];

  return sections.join('\n');
}

// ─── Full Report Generation ──────────────────────────────────────────────────

export function generateFullReport(records) {
  const byStatus = { KEEP: [], REVIEW: [], ARCHIVE: [], DELETE: [] };
  for (const r of records) {
    const gate = gateDecision(r);
    byStatus[gate.action].push(r);
  }

  const sections = [
    `# PixelBrain QA — Inert-Code Sanitization Report`,
    ``,
    `## Summary`,
    ``,
    `| Status | Count |`,
    `|--------|-------|`,
    `| KEEP   | ${byStatus.KEEP.length} |`,
    `| REVIEW | ${byStatus.REVIEW.length} |`,
    `| ARCHIVE| ${byStatus.ARCHIVE.length} |`,
    `| DELETE | ${byStatus.DELETE.length} |`,
    `| **Total** | **${records.length}** |`,
    ``,
  ];

  if (byStatus.DELETE.length > 0) {
    sections.push(`## 🗑️ DELETE-Safe (${byStatus.DELETE.length})\n`);
    for (const r of byStatus.DELETE) {
      sections.push(formatHumanReport(r));
    }
  }

  if (byStatus.ARCHIVE.length > 0) {
    sections.push(`## 📦 ARCHIVE (${byStatus.ARCHIVE.length})\n`);
    for (const r of byStatus.ARCHIVE) {
      sections.push(formatHumanReport(r));
    }
  }

  if (byStatus.REVIEW.length > 0) {
    sections.push(`## 🔍 REVIEW REQUIRED (${byStatus.REVIEW.length})\n`);
    for (const r of byStatus.REVIEW) {
      sections.push(formatHumanReport(r));
    }
  }

  if (byStatus.KEEP.length > 0) {
    sections.push(`## ✅ KEEP (${byStatus.KEEP.length})\n`);
    for (const r of byStatus.KEEP) {
      sections.push(formatHumanReport(r));
    }
  }

  return sections.join('\n');
}

// ─── Manifest Generation ─────────────────────────────────────────────────────

export function generateManifest(records) {
  const entries = records.map(record => {
    const gate = gateDecision(record);
    return {
      fingerprint: record.fingerprint,
      path: record.path,
      symbolName: record.symbolName,
      symbolType: record.symbolType,
      inertClass: record.inertClass,
      severity: record.severity,
      moduleId: record.moduleId,
      intendedRole: record.intendedRole,
      reachability: record.reachability,
      strategicValue: record.strategicValue,
      confidence: record.confidence,
      status: gate.action,
      gateReason: gate.reason,
      aiSummary: {
        whatItWasSupposedToDo: record.aiSummary.whatItWasSupposedToDo,
        isStillValuable: record.aiSummary.isStillValuable,
        recommendation: record.aiSummary.recommendation,
        rationale: record.aiSummary.rationale,
      },
      evidence: record.evidence,
      whyFlagged: record.whyFlagged,
    };
  });

  return {
    schema: 'PB-SANI-v1',
    generatedAt: new Date().toISOString(),
    totalScanned: records.length,
    summary: {
      KEEP: entries.filter(e => e.status === 'KEEP').length,
      REVIEW: entries.filter(e => e.status === 'REVIEW').length,
      ARCHIVE: entries.filter(e => e.status === 'ARCHIVE').length,
      DELETE: entries.filter(e => e.status === 'DELETE').length,
    },
    entries,
  };
}
