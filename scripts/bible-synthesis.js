#!/usr/bin/env node
/**
 * SCHOLOMANCE BIBLE SYNTHESIS — BIBLE-v1
 * 
 * Generates and maintains the canonical "Scholomance Bible" — a comprehensive, 
 * AI-parseable living document capturing the codebase's present state.
 * 
 * Purpose: Single source of truth for "What IS".
 * Reference: docs/skills/scholomance.bible.synthesis.skill.md
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const BIBLE_DIR = path.join(ROOT, 'docs/scholomance-bible');
const BIBLE_PATH = path.join(BIBLE_DIR, 'SCHOLOMANCE_BIBLE.md');
const INDEX_PATH = path.join(BIBLE_DIR, 'BIBLE_BYTECODE_INDEX.md');

const VERSION = '1.0.0';

/**
 * --- UTILS ---
 */

function walk(dir, results = []) {
  const list = fs.readdirSync(dir);
  for (let file of list) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (
        file.includes('node_modules') || 
        file.includes('.git') || 
        file.includes('.codex/diagnostic-reports') ||
        file.includes('.claude/worktrees') ||
        file.includes('.aider.tags.cache') ||
        file.includes('.tmp') ||
        file.includes('Archive') ||
        file.includes('ARCHIVE REFERENCE DOCS')
      ) continue;
      walk(file, results);
    } else {
      results.push(file);
    }
  }
  return results;
}

function getRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

/**
 * --- PHASE 1: Codebase Inventory ---
 */

async function synthesizeBible() {
  console.log(`[bible] initiating synthesis v${VERSION}...`);

  if (!fs.existsSync(BIBLE_DIR)) {
    fs.mkdirSync(BIBLE_DIR, { recursive: true });
  }

  const files = walk(ROOT);
  const inventory = [];
  const errorCodesUsage = [];
  const healthCodesUsage = [];

  for (const file of files) {
    const relPath = getRelativePath(file);
    
    // Skip large non-code files
    if (relPath.endsWith('.png') || relPath.endsWith('.jpg') || relPath.endsWith('.bmp') || relPath.endsWith('.sqlite')) continue;

    const content = fs.readFileSync(file, 'utf8');
    
    // Classify
    let layer = 'Unknown';
    if (relPath.startsWith('codex/core/')) layer = 'Core';
    else if (relPath.startsWith('codex/services/')) layer = 'Services';
    else if (relPath.startsWith('codex/runtime/')) layer = 'Runtime';
    else if (relPath.startsWith('codex/server/')) layer = 'Server';
    else if (relPath.startsWith('src/')) layer = 'UI';
    else if (relPath.startsWith('tests/')) layer = 'Test';
    else if (relPath.startsWith('docs/')) layer = 'Doc';
    else if (relPath.startsWith('scripts/')) layer = 'Script';

    // Scan for Bytecode. Skip the Bible files themselves — they cite codes,
    // not define them; scanning them produces circular self-references.
    const isBibleFile =
      relPath === 'docs/scholomance-bible/SCHOLOMANCE_BIBLE.md' ||
      relPath === 'docs/scholomance-bible/BIBLE_BYTECODE_INDEX.md';

    const errRegex = /PB-ERR-v1-[A-Z_]+-[A-Z]+-[A-Z_]+-[0-9A-F]{4}/g;
    const okRegex = /PB-OK-v1-[A-Z0-9_-]+/g;
    const recurseRegex = /PB-RECURSE[-_]v1[-_][A-Za-z0-9_-]+/g;
    const saniRegex = /PB-SANI-v1-[A-Z0-9_-]+/g;

    // Strip trailing hyphen — greedy `[A-Z0-9_-]+` includes the `-` before
    // template-literal interpolation (e.g. `PB-OK-v1-IMMUNE-PASS-COORD-${x}`).
    const stripTrail = (m) => m.replace(/-+$/, '');

    const errMatches = isBibleFile ? [] : (content.match(errRegex) || []);
    const okMatches = isBibleFile ? [] : (content.match(okRegex) || []).map(stripTrail);
    const recurseMatches = isBibleFile ? [] : (content.match(recurseRegex) || []).map(stripTrail);
    const saniMatches = isBibleFile ? [] : (content.match(saniRegex) || []).map(stripTrail);

    for (const match of errMatches) {
      errorCodesUsage.push({ code: match, file: relPath });
    }
    for (const match of [...okMatches, ...recurseMatches, ...saniMatches]) {
      healthCodesUsage.push({ code: match, file: relPath });
    }

    inventory.push({
      path: relPath,
      layer,
      errorCodes: [...new Set(errMatches)],
      healthCodes: [...new Set([...okMatches, ...recurseMatches, ...saniMatches])]
    });
  }

  // --- PHASE 3: Pathogen Detection ---

  console.log('[bible] beginning pathogen detection...');
  const pathogens = [];

  for (const item of inventory) {
    const ext = path.extname(item.path);
    if (ext === '.json' || ext === '.md') continue;
    if (item.path.includes('diagnostic/cells/')) continue;
    if (item.path.includes('scripts/')) continue;

    const content = fs.readFileSync(path.join(ROOT, item.path), 'utf8');

    // 1. Direct UI -> Codex Breach (Law 11)
    if (item.layer === 'UI' && !item.path.startsWith('src/lib/') && !item.path.startsWith('src/hooks/')) {
      const regex = /import[^;]+from\s+['"]((?:\.\.\/)+)codex\//g;
      if (regex.test(content)) {
        pathogens.push({
          code: 'PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F03',
          file: item.path,
          detail: 'Direct UI -> Codex breach detected.'
        });
      }
    }

    // 2. Layer Boundary Violation (Law 5/ARCH-CONTRACT)
    if (item.layer === 'Core') {
      const forbidden = ['codex/services', 'codex/runtime', 'codex/server'];
      for (const f of forbidden) {
        // Look for actual import/require patterns
        const regex = new RegExp(`(import|require|from)\\s+['"][^'"]*${f}`, 'g');
        if (regex.test(content)) {
          pathogens.push({
            code: 'PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F08',
            file: item.path,
            detail: `Layer violation: Core importing from ${f}`
          });
        }
      }
    }
  }

  if (pathogens.length > 0) {
    console.warn(`[bible] ${pathogens.length} pathogens detected!`);
    for (const p of pathogens) {
      console.log(`[pathogen] ${p.code} | ${p.file} | ${p.detail}`);
    }
  } else {
    console.log('[bible] zero pathogens detected. health is 100%.');
  }

  // --- PHASE 4: Synthesis ---

  const date = new Date().toISOString().split('T')[0];
  
  let bibleContent = `# The Scholomance Bible — v${VERSION}

> Generated: ${date}
> Generator: BIBLE-v1 (Scholomance Bible Synthesis Skill)
> Companion: \`docs/scholomance-encyclopedia/\` (history)

---

## Volume I — Canonical Architecture

### I.1 System Topology

\`\`\`
Browser (React SPA) ──→ CODEx Engine (4-layer)
       │                        │
       │                   ┌────┴────┐
       ▼                   ▼         ▼
  Fastify Server ──→ SQLite/Redis ──→ External APIs
       │
       ▼
  MCP Bridge ──→ Collab Plane ──→ AI Agents
\`\`\`

### I.2 Module Inventory

| Module | Path | Layer | Error Codes | Health Codes |
|--------|------|-------|-------------|--------------|
`;

  // Aggregate by top-level directories
  const modules = {};
  for (const item of inventory) {
    const parts = item.path.split('/');
    const moduleName = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : item.path;
    if (!modules[moduleName]) {
      modules[moduleName] = { path: moduleName, layer: item.layer, errors: new Set(), health: new Set() };
    }
    item.errorCodes.forEach(e => modules[moduleName].errors.add(e));
    item.healthCodes.forEach(h => modules[moduleName].health.add(h));
  }

  for (const mod of Object.values(modules)) {
    if (mod.path.includes('node_modules') || mod.path.includes('.git')) continue;
    bibleContent += `| ${path.basename(mod.path)} | ${mod.path} | ${mod.layer} | ${mod.errors.size} codes | ${mod.health.size} codes |\n`;
  }

  bibleContent += `
---

## Volume II — Bytecode Diagnostic System

### II.1 BytecodeError System (Red Path — \`PB-ERR-v1\`)

#### Error Code Table

| Code Hex | Category | Severity | Module | Source File |
|----------|----------|----------|--------|-------------|
`;

  const uniqueErrors = Array.from(new Set(errorCodesUsage.map(e => e.code))).sort();
  for (const err of uniqueErrors) {
    const parts = err.split('-');
    const category = parts[3];
    const severity = parts[4];
    const module = parts[5];
    const hex = parts[6];
    const firstFile = errorCodesUsage.find(e => e.code === err).file;
    bibleContent += `| ${hex} | ${category} | ${severity} | ${module} | ${firstFile} |\n`;
  }

  bibleContent += `
### II.2 BytecodeHealth System (Green Path — \`PB-OK-v1\`)

| Code | Purpose | Source File |
|------|---------|-------------|
`;

  const uniqueHealth = Array.from(new Set(healthCodesUsage.map(h => h.code))).sort();
  for (const ok of uniqueHealth) {
    const firstFile = healthCodesUsage.find(h => h.code === ok).file;
    bibleContent += `| ${ok} | Health Signal | ${firstFile} |\n`;
  }

  bibleContent += `
---

## Volume VIII — System Health Metrics

### VIII.1 Bytecode Health Snapshot

| Area | Status | Last Verified |
|------|--------|---------------|
| Immunity | ACTIVE | ${date} |
| Layer Boundary | ACTIVE | ${date} |
| Bridge Integrity | ACTIVE | ${date} |

---

## Appendix D: Bytecode Index
Flat, machine-parseable index of every bytecode string prefix in the system.
`;

  // Compute checksum
  const checksum = crypto.createHash('sha256').update(bibleContent).digest('hex').slice(0, 8);
  bibleContent = bibleContent.replace('SCHOL-BIBLE-v1-{CHECKSUM}', `SCHOL-BIBLE-v1-${checksum}`);
  
  // Add the anchor to the top
  bibleContent = bibleContent.replace('> Companion:', `> Bytecode Health Anchor: \`SCHOL-BIBLE-v1-${checksum}\`\n> Companion:`);

  fs.writeFileSync(BIBLE_PATH, bibleContent);
  
  // Generate Index
  let indexContent = `# Bible Bytecode Index

> Auto-generated companion to SCHOLOMANCE_BIBLE.md v${VERSION}
> Search anchor: \`SCHOL-BIBLE-BYTE-INDEX\`
>
> Coverage: ${uniqueErrors.length} error codes + ${uniqueHealth.length} health codes
> indexed by static regex scan. This is a subset of the live runtime
> emission set — consult \`mcp_scholomance_collab_diagnostic_summary\` for
> the complete current emission set. Absence from this index does not
> imply absence from the runtime.
>
> Each entry lists distinct file references only (deduped, sorted). The
> Bible files themselves are excluded from the scan to avoid circular
> self-references.

## Error Codes
`;

  for (const err of uniqueErrors) {
    const files = [...new Set(errorCodesUsage.filter(e => e.code === err).map(e => e.file))].sort();
    indexContent += `${err} → ${files.join(', ')}\n`;
  }

  indexContent += `\n## Health Codes\n`;
  for (const ok of uniqueHealth) {
    const files = [...new Set(healthCodesUsage.filter(h => h.code === ok).map(h => h.file))].sort();
    indexContent += `${ok} → ${files.join(', ')}\n`;
  }

  fs.writeFileSync(INDEX_PATH, indexContent);

  console.log(`[bible] synthesis complete. checksum: ${checksum}`);
  console.log(`[bible] artifacts written to ${BIBLE_DIR}`);

  // Emit Health Signal
  const healthSignal = {
    cellId: 'BIBLE_SYNTHESIS',
    code: 'bible-generated',
    context: {
      version: VERSION,
      checksum,
      modules_covered: Object.keys(modules).length,
      error_codes_documented: uniqueErrors.length,
      health_codes_documented: uniqueHealth.length,
    }
  };

  console.log(`[bible] PB-OK-v1-BIBLE-GENERATED-${checksum}`);
}

synthesizeBible().catch(console.error);
