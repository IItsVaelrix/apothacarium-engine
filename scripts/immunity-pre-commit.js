#!/usr/bin/env node
/**
 * IMMUNITY PRE-COMMIT HOOK
 * 
 * Runs the Scholomance Immune System against staged git files.
 * Blocks commit if critical violations are found.
 * 
 * Usage:
 *   node scripts/immunity-pre-commit.js [--staged|--all] [--json] [--override]
 *   
 * Options:
 *   --staged   Scan only git-staged files (default)
 *   --all      Scan all .js/.jsx/.ts/.tsx files
 *   --json     Output machine-readable JSON
 *   --override Skip blocking (report only) — requires IMMUNE_AUTHORITY env var
 * 
 * Exit codes:
 *   0 = No violations OR override accepted
 *   1 = Critical violations found (blocked)
 *   2 = Override requested but authority invalid
 *   3 = Scan error
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanInnate } from '../codex/core/immunity/innate.scanner.js';
import { scanAdaptive } from '../codex/core/immunity/adaptive.scanner.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const opts = {
  scanAll: args.includes('--all'),
  json: args.includes('--json'),
  override: args.includes('--override'),
};

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(color, ...msg) {
  if (!opts.json) process.stderr.write(`${color}${msg.join(' ')}${colors.reset}\n`);
}

/**
 * Get list of staged files from git.
 */
function getStagedFiles() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Git diff --cached failed: ${result.stderr}`);
  }
  return result.stdout
    .split('\n')
    .map(f => f.trim())
    .filter(f => f && /\.(js|jsx|ts|tsx)$/.test(f));
}

/**
 * Get all tracked source files.
 */
function getAllSourceFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '*.{js,jsx,ts,tsx}'], {
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Git ls-files failed: ${result.stderr}`);
  }
  return result.stdout
    .split('\n')
    .map(f => f.trim())
    .filter(f => f && /\.(js|jsx|ts|tsx)$/.test(f));
}

/**
 * Read file content safely.
 */
function readFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Format bytecode for display.
 */
function formatBytecode(bc) {
  if (typeof bc !== 'string' || !bc.startsWith('PB-ERR-')) return bc;
  // Extract key parts for readable display
  const parts = bc.split('-');
  if (parts.length >= 6) {
    return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}-${parts[5]}`;
  }
  return bc;
}

/**
 * Main scan function.
 */
async function runScan(files) {
  const repoRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    shell: true,
  }).stdout.trim();

  const results = {
    files: {},
    summary: { innate: 0, adaptive: 0, critical: 0, warning: 0 },
    blocked: false,
  };

  for (const file of files) {
    const absPath = join(repoRoot, file);
    const content = readFile(absPath);
    if (!content) continue;

    const innateViolations = scanInnate(content, file);
    const adaptiveViolations = await scanAdaptive(content);

    const fileResults = {
      innate: innateViolations,
      adaptive: adaptiveViolations,
      total: innateViolations.length + adaptiveViolations.length,
    };

    if (fileResults.total > 0) {
      results.files[file] = fileResults;
    }

    // Count by severity
    for (const v of innateViolations) {
      if (v.severity === 'CRIT' || v.severity === 'FATAL') {
        results.summary.critical++;
        results.blocked = true;
      } else {
        results.summary.warning++;
      }
    }
    results.summary.innate += innateViolations.length;
    results.summary.adaptive += adaptiveViolations.length;
  }

  return results;
}

/**
 * Print human-readable report.
 */
function printReport(results) {
  const { files, summary } = results;

  log(colors.cyan, '═'.repeat(60));
  log(colors.cyan, '  🛡️  SCHOLOMANCE IMMUNITY PRE-COMMIT SCAN');
  log(colors.cyan, '═'.repeat(60));

  if (Object.keys(files).length === 0) {
    log(colors.green, '\n✅ No violations detected. Commit approved.\n');
    return;
  }

  log(colors.red, '\n⚠️  VIOLATIONS DETECTED\n');

  for (const [file, fileResults] of Object.entries(files)) {
    log(colors.yellow, `\n📄 ${file}`);
    log(colors.yellow, '─'.repeat(40));

    // Innate violations
    for (const v of fileResults.innate) {
      const severityColor = v.severity === 'CRIT' ? colors.red : colors.yellow;
      log(severityColor, `  [${v.ruleId}] ${v.name}`);
      log(colors.reset, `    → ${formatBytecode(v.bytecode)}`);
      if (v.repair?.suggestions?.length) {
        log(colors.reset, `    → Fix: ${v.repair.suggestions[0]}`);
      }
    }

    // Adaptive violations
    for (const v of fileResults.adaptive) {
      log(colors.red, `  [ADAPTIVE] ${v.name}`);
      log(colors.reset, `    → Score: ${v.score.toFixed(3)} ≥ ${v.threshold} (${v.entry})`);
      log(colors.reset, `    → ${formatBytecode(v.bytecode)}`);
    }
  }

  log(colors.cyan, '─'.repeat(60));
  log(colors.cyan, `  SUMMARY: ${summary.innate} innate, ${summary.adaptive} adaptive`);
  log(colors.cyan, `  CRITICAL: ${summary.critical} | WARNING: ${summary.warning}`);
  log(colors.cyan, '─'.repeat(60));

  if (results.blocked) {
    log(colors.red, '\n❌ COMMIT BLOCKED — Critical violations found.');
    log(colors.red, '   Fix violations or use --override with IMMUNE_AUTHORITY.\n');
  }
}

/**
 * Main entry point.
 */
async function main() {
  try {
    // Determine files to scan
    const files = opts.scanAll ? getAllSourceFiles() : getStagedFiles();
    
    if (files.length === 0) {
      if (!opts.json) log(colors.green, 'No files to scan.');
      process.exit(0);
    }

    const results = await runScan(files);

    if (opts.json) {
      process.stdout.write(JSON.stringify(results, null, 2));
    } else {
      printReport(results);
    }

    // Handle override
    if (results.blocked && opts.override) {
      const authority = process.env.IMMUNE_AUTHORITY;
      if (!authority) {
        log(colors.red, '\n⚠️  --override requires IMMUNE_AUTHORITY env var.');
        process.exit(2);
      }
      log(colors.yellow, `\n⚠️  Override accepted by: ${authority}`);
      process.exit(0);
    }

    process.exit(results.blocked ? 1 : 0);
  } catch (err) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: err.message }));
    } else {
      log(colors.red, `\nScan error: ${err.message}`);
    }
    process.exit(3);
  }
}

main();
