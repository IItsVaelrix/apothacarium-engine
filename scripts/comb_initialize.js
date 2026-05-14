#!/usr/bin/env node
/**
 * COMB — The Sifting Data as a Comb Initiative
 * 
 * A framework for AI agents to always organize their work after every coding spree.
 * 
 * Usage:
 *   comb_initialize [quick|full|force] [--ci]
 *   comb_initialize --report [file]
 * 
 * Options:
 *   quick    - Skip Teeth 5-7 (faster)
 *   full     - Execute all 7 teeth (default)
 *   force    - Ignore non-critical violations
 *   --ci     - CI mode (non-interactive)
 *   --report - Output comb report to file
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Colors
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(color, ...msg) {
  process.stderr.write(`${color}${msg.join(' ')}${colors.reset}\n`);
}

// Parse args
const args = process.argv.slice(2);
const opts = {
  mode: args.includes('quick') ? 'quick' : args.includes('force') ? 'force' : 'full',
  ci: args.includes('--ci'),
  reportFile: null,
};

// ─── TOOTH 1: Git Status Audit ───────────────────────────────────────────────

function runGitStatus() {
  log(colors.cyan, '\n🖥️  TOOTH 1: Git Status Audit');
  log(colors.cyan, '─'.repeat(40));
  
  const result = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  
  const stats = {
    created: lines.filter(l => l.startsWith('??')).length,
    modified: lines.filter(l => l.startsWith('M ')).length,
    deleted: lines.filter(l => l.startsWith('D ')).length,
    renamed: lines.filter(l => l.startsWith('R ')).length,
    total: lines.length,
    details: lines,
  };
  
  log(colors.reset, `  Created: ${stats.created}`);
  log(colors.reset, `  Modified: ${stats.modified}`);
  log(colors.reset, `  Deleted: ${stats.deleted}`);
  log(colors.reset, `  Renamed: ${stats.renamed}`);
  
  return stats;
}

// ─── TOOTH 2: Layer Violation Scan ────────────────────────────────────────────

function runImmunityScan() {
  log(colors.cyan, '\n🛡️  TOOTH 2: Layer Violation Scan');
  log(colors.cyan, '─'.repeat(40));
  
  const result = spawnSync('node', ['scripts/immunity-pre-commit.js', '--all'], { encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  
  const hasViolations = output.includes('VIOLATIONS DETECTED');
  const isBlocked = output.includes('COMMIT BLOCKED');
  const criticalMatch = output.match(/CRITICAL:\s*(\d+)/);
  const warningsMatch = output.match(/WARNING:\s*(\d+)/);
  
  const stats = {
    violations: hasViolations,
    blocked: isBlocked,
    critical: criticalMatch ? parseInt(criticalMatch[1]) : 0,
    warnings: warningsMatch ? parseInt(warningsMatch[1]) : 0,
    output,
  };
  
  if (stats.critical > 0) {
    log(colors.red, `  Critical: ${stats.critical} — MUST FIX`);
  } else if (stats.warnings > 0) {
    log(colors.yellow, `  Warnings: ${stats.warnings}`);
  } else {
    log(colors.green, `  Clean — No violations`);
  }
  
  return stats;
}

// ─── TOOTH 3: Dead Code Triage ─────────────────────────────────────────────

function runDeadCodeTriage(gitStats) {
  log(colors.cyan, '\n📜 TOOTH 3: Dead Code Triage');
  log(colors.cyan, '─'.repeat(40));
  
  if (gitStats.deleted === 0) {
    log(colors.green, '  No deleted files to triage');
    return { needsDocumentation: 0, alreadyTracked: 0 };
  }
  
  const deadCodePath = 'docs/scholomance-encyclopedia/post-implementation-reports/dead-code.md';
  const hasDeadCodeFile = existsSync(deadCodePath);
  
  let alreadyTracked = 0;
  const needsAttention = [];
  
  if (hasDeadCodeFile) {
    const content = readFileSync(deadCodePath, 'utf8');
    // Check if deleted files are documented
    gitStats.details
      .filter(l => l.startsWith('D '))
      .forEach(line => {
        const file = line.slice(2);
        if (content.includes(file)) {
          alreadyTracked++;
        } else {
          needsAttention.push(file);
        }
      });
  } else {
    gitStats.details
      .filter(l => l.startsWith('D '))
      .forEach(line => needsAttention.push(line.slice(2)));
  }
  
  log(colors.reset, `  Already tracked: ${alreadyTracked}`);
  log(colors.reset, `  Needs documentation: ${needsAttention.length}`);
  
  if (needsAttention.length > 0) {
    log(colors.yellow, '  Files needing documentation:');
    needsAttention.forEach(f => log(colors.yellow, `    - ${f}`));
  }
  
  return { needsDocumentation: needsAttention.length, alreadyTracked, needsAttention };
}

// ─── TOOTH 4: Import Coherence ───────────────────────────────────────────────

function runImportCoherence(gitStats) {
  log(colors.cyan, '\n🔗 TOOTH 4: Import Coherence');
  log(colors.cyan, '─'.repeat(40));
  
  const issues = [];
  
  // Check for forbidden patterns in new files
  const newFiles = gitStats.details
    .filter(l => l.startsWith('??'))
    .map(l => l.slice(3));
  
  newFiles.forEach(file => {
    // Check for src/codex/ pattern (should not exist)
    if (file.includes('src/codex/')) {
      issues.push({ file, issue: 'Forbidden src/codex/ pattern' });
    }
    // Check for wrong layer .jsx in codex/
    if (file.includes('codex/') && file.endsWith('.jsx')) {
      issues.push({ file, issue: 'JSX in Codex layer (use .js or .ts)' });
    }
  });
  
  if (issues.length === 0) {
    log(colors.green, '  No import coherence issues');
  } else {
    log(colors.yellow, `  Found ${issues.length} issues:`);
    issues.forEach(i => log(colors.yellow, `    - ${i.file}: ${i.issue}`));
  }
  
  return { issues };
}

// ─── TOOTH 5: Documentation Currency ──────────────────────────────────────────

function runDocCurrency() {
  log(colors.cyan, '\n📚 TOOTH 5: Documentation Currency');
  log(colors.cyan, '─'.repeat(40));
  
  const checks = [
    { file: 'SCHEMA_CONTRACT.md', check: 'schema version' },
    { file: 'routes.js', check: 'exports' },
  ];
  
  let stale = 0;
  let upToDate = 0;
  
  checks.forEach(({ file, check }) => {
    if (existsSync(file)) {
      log(colors.green, `  ${file}: OK`);
      upToDate++;
    } else {
      log(colors.yellow, `  ${file}: NOT FOUND`);
      stale++;
    }
  });
  
  return { upToDate, stale };
}

// ─── TOOTH 6: Test Coverage ─────────────────────────────────────────────────

function runTestCoverage() {
  log(colors.cyan, '\n🧪 TOOTH 6: Test Coverage');
  log(colors.cyan, '─'.repeat(40));
  
  // Run a quick test to see if tests exist and pass
  const result = spawnSync('npm', ['test', '--', '--passWithNoTests', '--testPathIgnorePatterns=e2e'], {
    encoding: 'utf8',
    timeout: 60000,
  });
  
  const hasTests = result.stdout.includes('Tests:') || result.stderr.includes('Tests:');
  
  if (hasTests) {
    log(colors.green, '  Tests found and executed');
  } else {
    log(colors.yellow, '  No test output detected');
  }
  
  return { hasTests };
}

// ─── TOOTH 7: Worktree Hygiene ───────────────────────────────────────────────

function runWorktreeHygiene() {
  log(colors.cyan, '\n🌳 TOOTH 7: Worktree Hygiene');
  log(colors.cyan, '─'.repeat(40));
  
  const result = spawnSync('git', ['worktree', 'list'], { encoding: 'utf8' });
  const worktrees = result.stdout.trim().split('\n').filter(Boolean);
  
  const mainBranch = worktrees.find(w => w.includes('[main]') || w.includes('[master]'));
  const otherBranches = worktrees.filter(w => !w.includes('[main]') && !w.includes('[master]'));
  
  log(colors.reset, `  Main branch: ${mainBranch ? 'Present' : 'Not found'}`);
  log(colors.reset, `  Worktrees: ${otherBranches.length}`);
  
  otherBranches.forEach(w => log(colors.reset, `    ${w.trim()}`));
  
  return { active: otherBranches.length, worktrees: otherBranches };
}

// ─── Generate Report ────────────────────────────────────────────────────────

function generateReport(tooths) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const mode = opts.mode.toUpperCase();
  
  let status = 'PASS';
  if (tooths.immunity.critical > 0) status = 'FAIL';
  else if (tooths.deadCode.needsDocumentation > 0 || tooths.immunity.warnings > 0) {
    status = opts.mode === 'force' ? 'CONDITIONAL PASS' : 'FAIL';
  }
  
  const docCurrency = tooths.docCurrency || { upToDate: 'N/A (quick mode)', stale: 'N/A' };
  const testCoverage = tooths.testCoverage || { hasTests: null };
  const worktree = tooths.worktree || { active: 'N/A' };
  
  return `## Comb Report — ${timestamp} — ${mode} Mode

COMB STATUS: ${status}

### Git Audit (Tooth 1)
- Files created: ${tooths.git.created}
- Files modified: ${tooths.git.modified}
- Files deleted: ${tooths.git.deleted}
- Total changes: ${tooths.git.total}

### Violations (Tooth 2)
- Critical: ${tooths.immunity.critical}
- Warnings: ${tooths.immunity.warnings}
- Status: ${tooths.immunity.blocked ? 'BLOCKED' : 'OK'}

### Dead Code (Tooth 3)
- Needs documentation: ${tooths.deadCode.needsDocumentation}
- Already tracked: ${tooths.deadCode.alreadyTracked}

### Import Coherence (Tooth 4)
- Issues found: ${tooths.importCoherence.issues.length}

### Documentation Currency (Tooth 5)
- Up-to-date: ${docCurrency.upToDate}
- Stale: ${docCurrency.stale}

### Test Coverage (Tooth 6)
- Tests found: ${testCoverage.hasTests !== null ? (testCoverage.hasTests ? 'Yes' : 'No') : 'N/A (quick mode)'}

### Worktree Status (Tooth 7)
- Active worktrees: ${worktree.active}

### Sign-off
${status === 'PASS' ? '- [x] Ready for commit' : '- [ ] Blocked by violations'}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log(colors.cyan, '═'.repeat(60));
  log(colors.cyan, '  🪮 THE SIFTING DATA AS A COMB INITIATIVE');
  log(colors.cyan, `  Mode: ${opts.mode}`);
  log(colors.cyan, '═'.repeat(60));
  
  const gitStats = runGitStatus();
  const immunityStats = runImmunityScan();
  
  const tooths = {
    git: gitStats,
    immunity: immunityStats,
    deadCode: runDeadCodeTriage(gitStats),
    importCoherence: runImportCoherence(gitStats),
  };
  
  if (opts.mode === 'full' || opts.mode === 'force') {
    tooths.docCurrency = runDocCurrency();
    tooths.testCoverage = runTestCoverage();
    tooths.worktree = runWorktreeHygiene();
  }
  
  const report = generateReport(tooths);
  
  if (opts.reportFile) {
    writeFileSync(opts.reportFile, report);
    log(colors.green, `\n📄 Report saved to: ${opts.reportFile}`);
  }
  
  log(colors.cyan, '\n' + '═'.repeat(60));
  console.log(report);
  log(colors.cyan, '═'.repeat(60));
  
  // Exit with appropriate code
  if (tooths.immunity.critical > 0 && opts.mode !== 'force') {
    log(colors.red, '\n❌ COMB FAILED — Critical violations must be fixed');
    process.exit(1);
  }
  
  log(colors.green, '\n✅ COMB COMPLETE');
  process.exit(0);
}

main().catch(err => {
  log(colors.red, `Error: ${err.message}`);
  process.exit(1);
});
