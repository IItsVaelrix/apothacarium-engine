#!/usr/bin/env node
/**
 * PixelBrain QA — Inert-Code Sanitization CLI
 *
 * Usage:
 *   node scripts/pb-sani/run.js [options]
 *
 * Options:
 *   --root <path>         Project root (default: cwd)
 *   --output <path>       Output directory for report/manifest (default: scripts/pb-sani/output)
 *   --json                Also write raw records JSON
 *   --inline              Write inline comments into source files (dry-run by default)
 *   --min-confidence <n>  Minimum confidence threshold (0.0-1.0, default: 0.3)
 *   --limit <n>           Max records to output (default: unlimited)
 *   --filter <class>      Only show specific inert class (ORPHANED, DORMANT, etc.)
 *   --module <id>         Only show specific module ID
 *   --status <action>     Only show specific status (DELETE, ARCHIVE, REVIEW, KEEP)
 *   --help                Show this help
 *
 * Sanitization pipeline stages:
 *   1. DISCOVER  — build symbol graph (imports, exports, calls, registry, tests)
 *   2. CLASSIFY  — assign inert class, reachability, strategic value
 *   3. FINGERPRINT — encode PB-SANI-v1 bytecode
 *   4. EXPLAIN   — generate AI summary + recommendation
 *   5. GATE      — enforce deletion safety rules
 *   6. MARK      — produce report, manifest, optional inline comments
 *   7. OUTPUT    — write artifacts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildSymbolGraph } from './discovery.js';
import { explainSymbol } from './explain.js';
import { gateDecision } from './gate.js';
import { generateFullReport, generateManifest, generateInlineComment } from './marking.js';

// ─── Argument Parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    output: join('scripts', 'pb-sani', 'output'),
    json: false,
    inline: false,
    minConfidence: 0.3,
    limit: Infinity,
    filter: null,
    module: null,
    status: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--root': args.root = resolve(argv[++i]); break;
      case '--output': args.output = resolve(argv[++i]); break;
      case '--json': args.json = true; break;
      case '--inline': args.inline = true; break;
      case '--min-confidence': args.minConfidence = parseFloat(argv[++i]); break;
      case '--limit': args.limit = parseInt(argv[++i]); break;
      case '--filter': args.filter = argv[++i].toUpperCase(); break;
      case '--module': args.module = argv[++i].toUpperCase(); break;
      case '--status': args.status = argv[++i].toUpperCase(); break;
      case '--help': args.help = true; break;
    }
  }

  return args;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function runPipeline(args) {
  const stages = [];
  const stageStart = () => Date.now();

  // Stage 1: DISCOVER
  console.log('[PB-SANI] Stage 1/7: DISCOVER — building symbol graph...');
  const t1 = stageStart();
  const graph = buildSymbolGraph(args.root);
  const discoverMs = Date.now() - t1;
  stages.push({ name: 'DISCOVER', ms: discoverMs, detail: `${graph.allExports.size} exports found` });
  console.log(`[PB-SANI]   → ${graph.allExports.size} exported symbols discovered in ${discoverMs}ms`);

  // Stage 2-4: CLASSIFY + FINGERPRINT + EXPLAIN
  console.log('[PB-SANI] Stage 2-4: CLASSIFY → FINGERPRINT → EXPLAIN...');
  const t2 = stageStart();
  const records = [];

  for (const [exportKey, symbol] of graph.allExports) {
    const relPath = symbol.file;
    if (!relPath) continue;

    const record = explainSymbol(symbol, relPath, graph.fileData);
    if (!record) continue; // active symbol, skip

    // Confidence filter
    if (record.confidence < args.minConfidence) continue;

    // Filters
    if (args.filter && record.inertClass !== args.filter) continue;
    if (args.module && record.moduleId !== args.module) continue;

    records.push(record);
  }

  const classifyMs = Date.now() - t2;
  stages.push({ name: 'CLASSIFY+FINGERPRINT+EXPLAIN', ms: classifyMs, detail: `${records.length} inert candidates` });
  console.log(`[PB-SANI]   → ${records.length} inert candidates identified in ${classifyMs}ms`);

  // Stage 5: GATE
  console.log('[PB-SANI] Stage 5/7: GATE — enforcing deletion safety rules...');
  const t3 = stageStart();
  const gatedRecords = records.map(record => {
    const gate = gateDecision(record);
    return { ...record, gateAction: gate.action, gateReason: gate.reason };
  });

  // Status filter
  const filtered = args.status
    ? gatedRecords.filter(r => r.gateAction === args.status)
    : gatedRecords;

  const gateMs = Date.now() - t3;
  stages.push({ name: 'GATE', ms: gateMs, detail: `${filtered.length} after filtering` });

  // Limit
  const limited = filtered.slice(0, args.limit);

  // Status summary
  const byStatus = { KEEP: 0, REVIEW: 0, ARCHIVE: 0, DELETE: 0 };
  for (const r of filtered) {
    byStatus[r.gateAction] = (byStatus[r.gateAction] || 0) + 1;
  }

  console.log(`[PB-SANI]   → ${filtered.length} records after gating (${gateMs}ms)`);
  console.log(`[PB-SANI]     DELETE: ${byStatus.DELETE} | ARCHIVE: ${byStatus.ARCHIVE} | REVIEW: ${byStatus.REVIEW} | KEEP: ${byStatus.KEEP}`);

  // Stage 6-7: MARK + OUTPUT
  console.log('[PB-SANI] Stage 6-7: MARK → OUTPUT — generating artifacts...');
  const t4 = stageStart();

  // Ensure output dir
  if (!existsSync(args.output)) {
    mkdirSync(args.output, { recursive: true });
  }

  // Human-readable report
  const report = generateFullReport(limited);
  const reportPath = join(args.output, 'sanitization-report.md');
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`[PB-SANI]   → Report: ${reportPath}`);

  // Machine-readable manifest
  const manifest = generateManifest(limited);
  const manifestPath = join(args.output, 'sanitization.manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[PB-SANI]   → Manifest: ${manifestPath}`);

  // Raw JSON (optional)
  if (args.json) {
    const rawPath = join(args.output, 'sanitization-raw.json');
    writeFileSync(rawPath, JSON.stringify(limited, null, 2), 'utf-8');
    console.log(`[PB-SANI]   → Raw records: ${rawPath}`);
  }

  // Inline comments (optional)
  if (args.inline) {
    let commentsWritten = 0;
    for (const record of limited) {
      if (record.gateAction === 'DELETE' || record.gateAction === 'ARCHIVE') {
        const comment = generateInlineComment(record);
        console.log(`[PB-SANI]   [DRY-RUN] Would insert before ${record.symbolName} in ${record.path}:`);
        console.log(comment);
        commentsWritten++;
      }
    }
    console.log(`[PB-SANI]   → ${commentsWritten} inline comments (dry-run)`);
  }

  const outputMs = Date.now() - t4;
  stages.push({ name: 'MARK+OUTPUT', ms: outputMs, detail: 'report + manifest written' });

  // Stage timing summary
  console.log('\n[PB-SANI] Pipeline complete:');
  for (const s of stages) {
    console.log(`  ${s.name}: ${s.ms}ms (${s.detail})`);
  }
  console.log(`\n[PB-SANI] Done. ${limited.length} inert-code candidates documented.`);

  return { records: limited, stages, reportPath, manifestPath };
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  // Print help from the file header
  const fileContent = readFileSync(new URL(import.meta.url, 'file:'), 'utf-8');
  const helpMatch = fileContent.match(/^\/\*\*([\s\S]*?)\*\//);
  if (helpMatch) {
    console.log(helpMatch[1].replace(/^\s*\*\s?/gm, ''));
  }
  process.exit(0);
}

console.log(`[PB-SANI] PixelBrain QA — Inert-Code Sanitization`);
console.log(`[PB-SANI] Root: ${args.root}`);
console.log(`[PB-SANI] Output: ${args.output}`);
console.log(`[PB-SANI] Min confidence: ${args.minConfidence}`);
console.log('');

runPipeline(args).catch(err => {
  console.error('[PB-SANI] Pipeline error:', err.message);
  process.exit(1);
});
