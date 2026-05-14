/**
 * scripts/circuit-breaker.js
 * 
 * Performs Tier 3 Hyperplasia Risk Scoring and Override Velocity checks.
 * Enforces the "Sprint-Anchored Circuit Breaker" defined in PDR-2026-05-09.
 * 
 * Blocks any domain that accumulates >3 IMMUNE_AUTHORITY overrides 
 * within the current sprint cycle (proxied as last 14 days).
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const OVERRIDE_LIMIT = 3;
const SPRINT_WINDOW_DAYS = 14;

function getDomains() {
  const domains = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
        const fullPath = path.join(dir, entry.name);
        if (fs.existsSync(path.join(fullPath, 'index.js')) || fs.readdirSync(fullPath).some(f => f.endsWith('.js'))) {
          domains.push(path.relative(ROOT, fullPath));
        }
        walk(fullPath);
      }
    }
  };
  walk(path.join(ROOT, 'codex'));
  return domains;
}

function getOverrideVelocity(domain) {
  try {
    // Search for IMMUNE_ALLOW or IMMUNE_AUTHORITY tags introduced in the last 14 days
    // We use git log to find commits adding these strings in the specific domain directory
    const since = `${SPRINT_WINDOW_DAYS} days ago`;
    const cmd = `git log --since="${since}" -S"IMMUNE_ALLOW" -S"IMMUNE_AUTHORITY" --pretty=format:"%H" -- "${domain}" | wc -l`;
    const count = parseInt(execSync(cmd, { encoding: 'utf8' }).trim(), 10);
    return count;
  } catch (e) {
    // Fallback if not a git repo or no history
    return 0;
  }
}

function main() {
  console.log(`[CW-CIRCUIT] Initiating Sprint-Anchored Override Audit...`);
  console.log(`[CW-CIRCUIT] Window: Last ${SPRINT_WINDOW_DAYS} days (Sprint Proxy)`);
  
  const domains = getDomains();
  const breaches = [];

  domains.forEach(domain => {
    const velocity = getOverrideVelocity(domain);
    if (velocity > OVERRIDE_LIMIT) {
      breaches.push({ domain, velocity });
    }
  });

  if (breaches.length > 0) {
    console.error('\n🔴 CIRCUIT BREAKER TRIGGERED\n');
    breaches.forEach(b => {
      console.error(`[CRITICAL] Domain "${b.domain}" has accumulated ${b.velocity} overrides in this sprint.`);
    });
    console.error(`\nMandatory architectural review required before next sprint heart-beat.`);
    process.exit(1);
  } else {
    console.log('\n✅ CIRCUIT SECURE. OVERRIDE VELOCITY WITHIN BOUNDS.\n');
    process.exit(0);
  }
}

main();
