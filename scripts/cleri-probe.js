#!/usr/bin/env node
/**
 * PROACTIVE ANTIGEN PROBE CLI
 * 
 * Scans the codebase for "Theoretical Proteins" based on a bug hypothesis.
 * Usage: node scripts/cleri-probe.js "unseeded Math.random in combat logic"
 */

import fs from 'node:fs';
import path from 'node:path';
import { vectorizeHypothesis, scanSubstrate } from '../codex/core/immunity/protein-probe.engine.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.codex', 'Archive', 'ARCHIVE REFERENCE DOCS']);

async function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.join(dir, entry.name);
    const relPath = path.relative(process.cwd(), res);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(res, files);
    } else if (/\.(js|jsx|ts|tsx|json|md)$/.test(entry.name)) {
      files.push({
        path: relPath,
        content: fs.readFileSync(res, 'utf8')
      });
    }
  }
  return files;
}

async function main() {
  const hypothesis = process.argv.slice(2).join(' ').trim();
  if (!hypothesis) {
    console.error('Usage: node scripts/cleri-probe.js "your bug hypothesis"');
    process.exit(1);
  }

  console.log(`[probe] vectorizing hypothesis: "${hypothesis}"...`);
  const searchProtein = vectorizeHypothesis(hypothesis);

  console.log('[probe] scanning substrate (codebase)...');
  const substrate = await walk(process.cwd());
  
  const heatmap = scanSubstrate(substrate, searchProtein, { minResonance: 0.4 });

  console.log('\n[probe] GENETIC HEATMAP — "Genes lighting up..."');
  console.log('--------------------------------------------------');

  if (heatmap.length === 0) {
    console.log('Zero resonance detected. The substrate is healthy for this protein.');
  } else {
    heatmap.slice(0, 15).forEach(hit => {
      const bar = '█'.repeat(Math.floor(hit.resonance * 20));
      const percentage = (hit.resonance * 100).toFixed(1);
      console.log(`${percentage.padStart(5)}% ${bar.padEnd(20)} ${hit.path}`);
    });
  }

  if (heatmap.length > 15) {
    console.log(`... and ${heatmap.length - 15} more modules.`);
  }
  
  console.log('\n[probe] ritual complete.');
}

main().catch(console.error);
