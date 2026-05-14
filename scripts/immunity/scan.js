/**
 * scripts/immunity/scan.js
 * 
 * CLI Entry point for the Scholomance Immune System.
 * Scans staged files in git.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { scanInnate } from '../../codex/core/immunity/innate.scanner.js';
import { scanAdaptive } from '../../codex/core/immunity/adaptive.scanner.js';

async function main() {
  console.log('🛡️ [IMMUNE-SCAN] Initiating diagnostic ritual...');

  // 1. Get staged files
  let stagedFiles = [];
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    stagedFiles = output.split('\n').filter(f => f && !f.includes('node_modules'));
  } catch (e) {
    console.error('❌ Failed to retrieve staged files. Are you in a git repo?');
    process.exit(1);
  }

  if (stagedFiles.length === 0) {
    console.log('✨ No staged files to scan. The barrier is clear.');
    return;
  }

  let totalViolations = 0;

  for (const file of stagedFiles) {
    console.log(`  🔍 Scanning: ${file}`);
    const content = readFileSync(file, 'utf8');
    
    // Layer 1
    const innate = scanInnate(content, file);
    
    // Layer 2 (Heuristic trigger: innate flag or sensitive path)
    let adaptive = [];
    if (innate.length > 0 || file.includes('codex/core') || file.includes('src/lib')) {
      adaptive = await scanAdaptive(content);
    }

    if (innate.length > 0 || adaptive.length > 0) {
      totalViolations++;
      console.log(`    ❌ [BLOCK] logical infection detected in ${file}`);
      
      innate.forEach(v => {
        console.log(`      [L1] ${v.name} (${v.bytecode})`);
        console.log(`           Repair: ${v.repair}`);
      });
      
      adaptive.forEach(v => {
        console.log(`      [L2] Semantic match: ${v.name} (Score: ${(v.score * 100).toFixed(1)}%)`);
        console.log(`           Reference: ${v.entry}`);
      });
    }
  }

  if (totalViolations > 0) {
    console.log(`\n🚨 Ritual Failed. ${totalViolations} infections blocked. Purify the syntax before proceeding.`);
    process.exit(1);
  } else {
    console.log('\n✅ [PASSED] The syntax is pure. The weave is stable.');
  }
}

main().catch(err => {
  console.error('\n💥 Critical failure during scan ritual:', err.message);
  process.exit(1);
});
