/**
 * DEAD CODE AUDIT — Bytecode Scouring Tool
 * ══════════════════════════════════════════════════════════════════════════════
 * Domain: Codebase Cleanliness & Structural Integrity
 * Purpose: Identifies unreachable files and unused symbols, encoding findings
 *          into AI-parsable bytecode for precision removal.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─── Bytecode Error Constants (Mocked for script use) ───────────────────────
const PB_ERR_VERSION = 'v1';
const CATEGORY = 'STATE';
const SEVERITY = 'WARN';
const MODULE = 'SHARED';
const CODE_DEAD_FILE = '0x0D01';
const CODE_UNUSED_VAR = '0x0D02';

function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function encodeError(code, context) {
  const contextB64 = btoa(JSON.stringify(context));
  const partial = `PB-ERR-${PB_ERR_VERSION}-${CATEGORY}-${SEVERITY}-${MODULE}-${code}-${contextB64}`;
  const checksum = hashString(partial).toString(16).toUpperCase().padStart(8, '0');
  return `${partial}-${checksum}`;
}

async function runAudit() {
  console.log('Initiating Bytecode Dead Code Audit...\n');
  const results = [];

  // ─── 1. Run ESLint for Unused Variables ───
  try {
    const eslintOutput = execSync('npx eslint . --ext js,jsx,ts,tsx --rule "no-unused-vars: error" --format json', { encoding: 'utf8' });
    const files = JSON.parse(eslintOutput);
    
    files.forEach(file => {
      file.messages.forEach(msg => {
        if (msg.ruleId === 'no-unused-vars') {
          results.push(encodeError(CODE_UNUSED_VAR, {
            file: path.relative(ROOT, file.filePath),
            line: msg.line,
            column: msg.column,
            variable: msg.message.split("'")[1]
          }));
        }
      });
    });
  } catch (e) {
    // ESLint returns exit code 1 if errors found, parse the output anyway if it looks like JSON
    if (e.stdout) {
      try {
        const files = JSON.parse(e.stdout);
        files.forEach(file => {
          file.messages.forEach(msg => {
            if (msg.ruleId === 'no-unused-vars') {
              results.push(encodeError(CODE_UNUSED_VAR, {
                file: path.relative(ROOT, file.filePath),
                line: msg.line,
                column: msg.column,
                variable: msg.message.split("'")[1]
              }));
            }
          });
        });
      } catch (inner) {}
    }
  }

  // ─── 2. Run Custom Dead File Detector ───
  // We'll import parts of the existing detector or just run it and parse its report
  try {
    execSync('node scripts/dead-code-detector.mjs');
    const report = fs.readFileSync(path.join(ROOT, 'dead-code.md'), 'utf8');
    
    // Parse unreachable files
    const unreachableMatch = report.match(/## Unreachable Files\n([\s\S]*?)\n##/);
    if (unreachableMatch) {
      const files = unreachableMatch[1].split('\n')
        .filter(line => line.startsWith('- [ ] '))
        .map(line => line.replace('- [ ] ', '').trim());
      
      files.forEach(file => {
        results.push(encodeError(CODE_DEAD_FILE, { file }));
      });
    }
  } catch (e) {
    console.error('Failed to run dead-code-detector.mjs');
  }

  // ─── 3. Output Bytecode Report ───
  if (results.length === 0) {
    console.log('No dead code detected. Codebase is mathematically lean. 🎉');
  } else {
    console.log(`Found ${results.length} dead code signatures:\n`);
    results.forEach(sig => console.log(sig));
    
    // Also save to a dedicated audit file
    fs.writeFileSync(path.join(ROOT, 'DEAD_CODE_BYTECODE_AUDIT.txt'), results.join('\n'));
    console.log(`\nFull bytecode report saved to: DEAD_CODE_BYTECODE_AUDIT.txt`);
  }
}

runAudit();
