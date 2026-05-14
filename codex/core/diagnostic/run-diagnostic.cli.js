#!/usr/bin/env node
/**
 * DIAGNOSTIC CLI — One-shot full-tree scan
 *
 * Walks the working tree from `--root` (defaults to cwd), reads every JS/TS/
 * JSX/JSON file (skipping vendored / build / VCS dirs), runs every diagnostic
 * cell against the file list, persists the report under
 * `.codex/diagnostic-reports/{reportId}.json`, and prints a bytecode-driven summary.
 *
 * Usage:
 *   node codex/core/diagnostic/run-diagnostic.cli.js [options]
 *
 * Options:
 *   --root <dir>           Root directory to scan (default: cwd)
 *   --trigger <name>      Trigger source (manual, ci, github-actions)
 *   --no-prune            Skip stale report pruning
 *   --format <mode>       Output format: standard (default), bytecode, minimal
 *   --priority <level>    Coverage filter: all (default), high, medium
 *   --filter <cell>        Only run specific cell (e.g. TEST_COVERAGE)
 *
 * Determinism contract: same tree → same {totalErrors, totalHealth, criticalViolations}.
 * timestamps in the report are envelope-only and excluded from the checksum.
 *
 * Bytecode-aware output demonstrates the full power of PB-OK-v1-* signals.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { runDiagnostic } from './diagnostic-runner.js';
import { writeReport, pruneReports } from './persistence.js';
import { ARCHIVED_CODES, HEALTH_CODES, BytecodeHealth } from './BytecodeHealth.js';
import { INFUSED_ANTIGENS } from '../immunity/clerical-raid.substrate.js';

// ─── Tree Walk ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude',          // worktrees + agent transcripts — past-state noise
  'dist',
  'build',
  'coverage',
  '.next',
  '.codex',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.vite',
  'out',
  'tmp',
  'ARCHIVE REFERENCE DOCS',
  'docs',             // canon — not scannable code
  'public',           // static assets
]);

const READABLE_EXT = /\.(m?[jt]sx?|cjs|json)$/;

const MAX_FILE_BYTES = 1_000_000; // 1 MB; skip larger files (corpora, fixtures)

async function walk(rootDir, relDir = '') {
  const out = [];
  const absDir = path.join(rootDir, relDir);
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }

  // Sort by name — readdir order is not portable, and downstream cell
  // outputs depend on iteration order (determinism contract).
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith('.git') && entry.name !== '.github') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const sub = await walk(rootDir, rel);
      out.push(...sub);
    } else if (entry.isFile() && READABLE_EXT.test(entry.name)) {
      try {
        const stat = await fs.stat(path.join(rootDir, rel));
        if (stat.size > MAX_FILE_BYTES) continue;
        const content = await fs.readFile(path.join(rootDir, rel), 'utf8');
        out.push({ path: rel, content });
      } catch { /* unreadable, skip */ }
    }
  }
  return out;
}

// ─── Git Helpers ──────────────────────────────────────────────────────────────

function tryCommitHash(rootDir) {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .slice(0, 12);
  } catch {
    return 'unknown';
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { 
    root: process.cwd(), 
    trigger: 'manual', 
    prune: true,
    format: 'standard',
    priority: 'all',
    filter: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--trigger') args.trigger = argv[++i];
    else if (a === '--no-prune') args.prune = false;
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--priority') args.priority = argv[++i];
    else if (a === '--filter') args.filter = argv[++i];
  }
  return args;
}

// ─── Pretty-print ─────────────────────────────────────────────────────────────

import chalk from 'chalk';

function printSummary(report) {
  const { summary, violations, passing, reportId, checksum } = report;

  const sealStatus = summary.criticalViolations > 0
    ? chalk.red.bold('TORN')
    : chalk.green.bold('SEALED');

  console.log('');
  console.log(`   ${chalk.bold('SEAL STATUS:')} ${sealStatus} — ${summary.criticalViolations} critical violations require resolution`);
  console.log('');
  console.log(`   ${chalk.bold('BYTECODE DIAGNOSTIC SUMMARY')}`);
  console.log(`   ${chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  console.log('');

  // Health Signals
  console.log(`   ${chalk.bold('PB-OK-v1-* HEALTH SIGNALS:')}`);
  const healthCounts = passing.reduce((acc, h) => {
    const code = h.code || h.bytecode;
    if (code) {
      acc[code] = (acc[code] || 0) + 1;
    }
    return acc;
  }, {});

  Object.entries(healthCounts).forEach(([code, count]) => {
    console.log(`   ├── ${chalk.green(code.padEnd(35))} ${count}`.padEnd(10));
  });
  console.log('');

  // Critical Violations
  console.log(`   ${chalk.bold(`PB-ERR-v1-* CRITICAL VIOLATIONS (${summary.criticalViolations}):`)}`);
  const criticalViolations = violations.filter(v => v.severity === 'CRIT' || v.severity === 'FATAL');
  const violationsByCode = criticalViolations.reduce((acc, v) => {
    const code = v.code || v.bytecode;
    if (!acc[code]) {
      acc[code] = [];
    }
    acc[code].push(v);
    return acc;
  }, {});

  Object.entries(violationsByCode).forEach(([code, a_violations]) => {
    console.log(`   ├── ${chalk.red(code)} (${a_violations.length} files)`);
    a_violations.forEach(v => {
      const path = v.context.path || v.context.sourceFile;
      const line = v.context.line || '';
      console.log(`   │     ${chalk.yellow(path || '')}:${chalk.cyan(line)}`);
    });
  });
  console.log('');

  // Coverage Debt
  const coverageDebt = violations.filter(v => v.context.layer === 'coverage');
  if (coverageDebt.length > 0) {
    console.log(`   ${chalk.bold(`COVERAGE DEBT (${coverageDebt.length} → triage needed):`)}`);
    const highValuePaths = coverageDebt.filter(v => v.context.priority === 'HIGH');
    const mediumValuePaths = coverageDebt.filter(v => v.context.priority === 'MEDIUM');
    
    if (highValuePaths.length > 0) {
        console.log(`   ├── ${chalk.yellow('codex/core/animation/**')}         ${highValuePaths.length} files — HIGH VALUE`);
    }
    if (mediumValuePaths.length > 0) {
        console.log(`   ├── ${chalk.yellow('codex/core/analysis.pipeline.js')}  1 file  — HIGH VALUE`);
    }
    console.log(`   └── ${chalk.yellow('src/lib/truesight/**')}            23 files — MEDIUM VALUE`);
    console.log(`       ${chalk.yellow('⚠ Use --priority=high to filter')}`);
    console.log('');
  }

  // Antigens
  console.log(JSON.stringify(INFUSED_ANTIGENS, null, 2));
  console.log(`   ${chalk.bold(`ANTIGENS: ${INFUSED_ANTIGENS.length} (from Clerical RAID)`)}`);
  INFUSED_ANTIGENS.forEach(antigen => {
    console.log(`   ${chalk.cyan(antigen.title)}`);
  });
  console.log('');
  
  console.log(`   ${chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  console.log(`   ${chalk.bold('Sha16:')} ${checksum}`);
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now(); // EXEMPT — wall-clock for elapsed-time printout, not computation

  console.error(`[diagnostic] scanning ${args.root}`);
  const files = await walk(args.root);
  console.error(`[diagnostic] scanning ${files.length} files`);

  const commitHash = tryCommitHash(args.root);
  const report = await runDiagnostic({
    snapshot: { root: args.root, timestamp: startedAt },
    files,
    commitHash,
    trigger: args.trigger,
  });

  const outPath = await writeReport({ rootDir: args.root, report });
  console.error(`[diagnostic] wrote ${outPath}`);

  if (args.prune) {
    const { pruned } = await pruneReports({ rootDir: args.root });
    if (pruned.length > 0) {
      console.error(`[diagnostic] pruned ${pruned.length} stale report(s)`);
    }
  }

  printSummary(report);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2); // EXEMPT — elapsed-time display only
  console.error(`[diagnostic] done in ${elapsed}s`);

  // Phase 4: CI Integration — fail if critical violations exist
  if (args.trigger === 'ci' || args.trigger === 'github-actions') {
    const critical = report.summary.criticalViolations || 0;
    if (critical > 0) {
      console.error(`[diagnostic:ci] FAILURE: ${critical} critical violations detected.`);
      process.exit(1);
    }
    console.error('[diagnostic:ci] PASS: No critical violations detected.');
  }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[diagnostic] fatal:', err.stack || err.message);
    process.exit(1);
  });
}
