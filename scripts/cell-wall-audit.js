/**
 * scripts/cell-wall-audit.js
 * 
 * Performs Tier 1 Static Boundary Check for the Cell Wall Infrastructure.
 * Enforces VAELRIX LAW 5 and Constraint 1 (Vacuum Layer) by blocking
 * illegal cross-layer imports.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const VIOLATIONS = [];

function checkVacuumLayer() {
  console.log('[CW-AUDIT] Checking codex/core Vacuum Layer integrity...');
  try {
    // Search for any imports from src/ within codex/core
    const output = execSync(`grep -r "from ['\\"].*src/.*['\\"]" codex/core || true`, { encoding: 'utf8' });
    if (output.trim()) {
      const lines = output.trim().split('\n');
      lines.forEach(line => {
        VIOLATIONS.push({
          level: 'CRITICAL',
          type: 'VACUUM_BREACH',
          message: `Core component importing from UI substrate: ${line.trim()}`
        });
      });
    }
  } catch (e) {
    console.error('[CW-AUDIT] Failed to execute vacuum check:', e.message);
  }
}

function checkLayerSeparation() {
  console.log('[CW-AUDIT] Checking four-layer separation laws...');
  
  // Core -> Services/Runtime/Server
  try {
    const output = execSync(`grep -r "from ['\\"].*\\.\\./(?:services|runtime|server).*['\\"]" codex/core || true`, { encoding: 'utf8' });
    if (output.trim()) {
      const lines = output.trim().split('\n');
      lines.forEach(line => {
        VIOLATIONS.push({
          level: 'CRITICAL',
          type: 'LAYER_COLLAPSE',
          message: `Core component importing from higher layer: ${line.trim()}`
        });
      });
    }
  } catch (e) {
    // Silent catch for grep non-zero exit when no matches found
  }

  // Services -> Runtime/Server
  try {
    const output = execSync(`grep -r "from ['\\"].*\\.\\./(?:runtime|server).*['\\"]" codex/services || true`, { encoding: 'utf8' });
    if (output.trim()) {
      const lines = output.trim().split('\n');
      lines.forEach(line => {
        VIOLATIONS.push({
          level: 'WARNING',
          type: 'LAYER_COLLAPSE',
          message: `Service component importing from higher layer: ${line.trim()}`
        });
      });
    }
  } catch (e) {
    // Silent catch
  }
}

function main() {
  checkVacuumLayer();
  checkLayerSeparation();

  if (VIOLATIONS.length > 0) {
    console.error('\n🔴 CELL WALL AUDIT FAILED\n');
    VIOLATIONS.forEach(v => {
      console.error(`[${v.level}] ${v.type}: ${v.message}`);
    });
    console.error(`\nFound ${VIOLATIONS.length} architectural violations.`);
    process.exit(1);
  } else {
    console.log('\n✅ CELL WALL HOLDS. ALL BOUNDARIES SECURE.\n');
    process.exit(0);
  }
}

main();
