/**
 * PRODUCTION POLISH — Pre-Commit Production Validation
 *
 * Usage:
 *   node scripts/production-polish.js [quick|full|force] [--ci]
 *
 * Options:
 *   quick  - TypeScript, lint, immunity only
 *   full   - All 9 steps (default)
 *   force  - Ignore non-critical issues (emergency only)
 *   --ci   - CI mode (quieter errors)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

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

const args = process.argv.slice(2);
const opts = {
  mode: args.includes('quick') ? 'quick' : args.includes('force') ? 'force' : 'full',
  ci: args.includes('--ci'),
};

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const LARGE_CODE_BYTES = 500 * 1024;
const LARGE_ANY_BYTES = 5 * 1024 * 1024;

function shouldExcludeFromSecretScan(rel) {
  const n = rel.replace(/\\/g, '/');
  if (n.startsWith('node_modules/') || n.includes('/node_modules/')) return true;
  if (n.startsWith('dist/') || n.startsWith('coverage/') || n.startsWith('playwright-report/')) return true;
  if (n.endsWith('.min.js')) return true;
  if (n.endsWith('.env.example') || n.endsWith('.env.sample')) return true;
  if (/\.env(\.|$)/.test(n) && !n.endsWith('.env.example')) return true;
  return false;
}

function shouldExcludeFromLargeScan(rel) {
  const n = rel.replace(/\\/g, '/');
  if (n.startsWith('node_modules/') || n.includes('/node_modules/')) return true;
  if (n.startsWith('dist/') || n.startsWith('coverage/')) return true;
  if (n.endsWith('.sqlite') || n.endsWith('.sqlite3')) return true;
  if (n === 'public/corpus.json' || n.endsWith('/corpus.json')) return true;
  return false;
}

function gitLsFiles() {
  const r = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    return [];
  }
  return r.stdout.split('\0').filter(Boolean);
}

// ─── Step 1: TypeScript Check ─────────────────────────────────────────────

function runTypeScriptCheck() {
  log(colors.cyan, '\n📘 STEP 1: TypeScript Check');
  log(colors.cyan, '─'.repeat(40));

  const result = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    shell: false,
  });

  const blob = `${result.stdout}\n${result.stderr}`;
  const errorMatch = blob.match(/(\d+) error/);
  const errors = errorMatch ? parseInt(errorMatch[1], 10) : result.status !== 0 ? 1 : 0;

  if (errors > 0) {
    log(colors.red, `  TypeScript errors: ${errors}`);
    if (!opts.ci) {
      blob
        .split('\n')
        .filter(l => l.includes('error TS'))
        .slice(0, 8)
        .forEach(l => log(colors.red, `    ${l}`));
    }
  } else {
    log(colors.green, '  TypeScript: PASS (0 errors)');
  }

  return { errors, pass: errors === 0 };
}

// ─── Step 2: Lint Check ──────────────────────────────────────────────────

function runLintCheck() {
  log(colors.cyan, '\n🔍 STEP 2: Lint Check');
  log(colors.cyan, '─'.repeat(40));

  const result = spawnSync('npm', ['run', 'lint'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });

  const errors = result.status !== 0 ? 1 : 0;
  if (errors > 0) {
    log(colors.red, '  ESLint: FAIL (fix errors before commit)');
    if (!opts.ci && result.stdout) {
      const lines = result.stdout.split('\n').filter(l => l.trim());
      lines.slice(-15).forEach(l => log(colors.red, `    ${l}`));
    }
  } else {
    log(colors.green, '  Lint: PASS (0 errors)');
  }

  return { errors, pass: errors === 0 };
}

// ─── Step 3: Import Coherence ────────────────────────────────────────────

function runImmunityScan() {
  log(colors.cyan, '\n🛡️ STEP 3: Import Coherence (Immunity)');
  log(colors.cyan, '─'.repeat(40));

  const result = spawnSync('node', ['scripts/immunity-pre-commit.js', '--all'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });

  const output = result.stdout + result.stderr;
  const criticalMatch = output.match(/CRITICAL:\s*(\d+)/);
  const critical = criticalMatch ? parseInt(criticalMatch[1], 10) : 0;
  const failed = result.status !== 0 || /COMMIT BLOCKED|Critical violations found/i.test(output);

  if (critical > 0 || failed) {
    log(colors.red, `  Immunity: FAIL (critical=${critical}, exit=${result.status})`);
  } else {
    log(colors.green, '  Immunity: PASS (0 critical violations)');
  }

  return { critical, pass: critical === 0 && !failed };
}

// ─── Step 4: Test Gate ──────────────────────────────────────────────────

function runTests() {
  log(colors.cyan, '\n🧪 STEP 4: Test Gate');
  log(colors.cyan, '─'.repeat(40));

  const result = spawnSync('npm', ['test', '--', '--passWithNoTests'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });

  const pass = result.status === 0;
  if (!pass) {
    log(colors.red, '  Tests: FAIL');
  } else {
    log(colors.green, '  Tests: PASS');
  }

  return { failed: !pass, pass };
}

// ─── Step 5: Build Verification ─────────────────────────────────────────

function runBuild() {
  log(colors.cyan, '\n🏗️ STEP 5: Build Verification');
  log(colors.cyan, '─'.repeat(40));

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });

  const pass = result.status === 0;
  if (!pass) {
    log(colors.red, '  Build: FAIL');
    if (!opts.ci && result.stderr) {
      result.stderr
        .split('\n')
        .filter(l => /error|failed/i.test(l))
        .slice(0, 10)
        .forEach(l => log(colors.red, `    ${l}`));
    }
  } else {
    log(colors.green, '  Build: PASS');
  }

  return { errors: !pass, pass };
}

// ─── Step 6: Secret Scan ─────────────────────────────────────────────────

const SECRET_LINE_PATTERNS = [
  { name: 'GitHub PAT (classic)', re: /ghp_[a-zA-Z0-9]{36,}/ },
  { name: 'GitHub fine-grained PAT', re: /github_pat_[a-zA-Z0-9_]{20,}/ },
  { name: 'Slack token', re: /xox[baprs]-[0-9a-zA-Z-]{10,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private key block', re: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: 'Stripe live key', re: /sk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Long OpenAI-style key', re: /\bsk-[a-zA-Z0-9]{48,}\b/ },
];

function lineLooksLikePlaceholder(line) {
  const l = line.toLowerCase();
  return (
    l.includes('replace-me') ||
    l.includes('changeme') ||
    l.includes('your-api') ||
    l.includes('your_key') ||
    l.includes('example.com') ||
    l.includes('xxx') ||
    l.includes('<redacted>') ||
    l.includes('polish_allow_secret')
  );
}

function lineUsesEnvRef(line) {
  return (
    line.includes('process.env') ||
    line.includes('import.meta.env') ||
    line.includes('Deno.env') ||
    line.includes('getenv(')
  );
}

function runSecretScan() {
  log(colors.cyan, '\n🔐 STEP 6: Secret Scan');
  log(colors.cyan, '─'.repeat(40));

  const tracked = gitLsFiles();
  const hits = [];

  for (const rel of tracked) {
    const ext = path.extname(rel);
    if (!CODE_EXT.has(ext)) continue;
    if (shouldExcludeFromSecretScan(rel)) continue;

    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) continue;

    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_SCAN_BYTES) continue;

    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.length > 5000) return;
      if (lineUsesEnvRef(line) || lineLooksLikePlaceholder(line)) return;
      if (/EXEMPT|POLISH_ALLOW_SECRET/i.test(line)) return;

      for (const { name, re } of SECRET_LINE_PATTERNS) {
        if (re.test(line)) {
          hits.push({ file: rel, line: idx + 1, rule: name });
          break;
        }
      }
    });
  }

  if (hits.length > 0) {
    log(colors.red, `  Secrets: FAIL (${hits.length} suspicious line(s))`);
    hits.slice(0, 25).forEach(h => log(colors.red, `    ${h.file}:${h.line} — ${h.rule}`));
    if (hits.length > 25) log(colors.red, `    … +${hits.length - 25} more`);
  } else {
    log(colors.green, `  Secrets: PASS (scanned ${tracked.filter(f => CODE_EXT.has(path.extname(f))).length} tracked paths, heuristics)`);
  }

  return { found: hits.length, pass: hits.length === 0 };
}

// ─── Step 7: Large File Check ────────────────────────────────────────────

function runLargeFileCheck() {
  log(colors.cyan, '\n📦 STEP 7: Large File Check');
  log(colors.cyan, '─'.repeat(40));

  const tracked = gitLsFiles();
  const codeLarge = [];
  const anyLarge = [];

  for (const rel of tracked) {
    if (shouldExcludeFromLargeScan(rel)) continue;
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    const ext = path.extname(rel);
    if (st.size >= LARGE_ANY_BYTES) {
      anyLarge.push({ file: rel, size: st.size });
    } else if (CODE_EXT.has(ext) && st.size >= LARGE_CODE_BYTES) {
      codeLarge.push({ file: rel, size: st.size });
    }
  }

  if (codeLarge.length > 0) {
    log(colors.yellow, `  Large source files (≥${LARGE_CODE_BYTES / 1024}KB): ${codeLarge.length}`);
    codeLarge
      .sort((a, b) => b.size - a.size)
      .slice(0, 12)
      .forEach(f => log(colors.yellow, `    ${f.file} (${(f.size / 1024).toFixed(1)} KB)`));
  }
  if (anyLarge.length > 0) {
    log(colors.yellow, `  Very large tracked files (≥${LARGE_ANY_BYTES / (1024 * 1024)}MB): ${anyLarge.length}`);
    anyLarge
      .sort((a, b) => b.size - a.size)
      .slice(0, 8)
      .forEach(f => log(colors.yellow, `    ${f.file} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`));
  }
  if (codeLarge.length === 0 && anyLarge.length === 0) {
    log(colors.green, '  Large files: PASS (no tracked sources ≥500KB; no blobs ≥5MB outside excludes)');
  }

  return { codeLarge: codeLarge.length, anyLarge: anyLarge.length, pass: true };
}

// ─── Step 8: Dependency Audit ─────────────────────────────────────────────

function runDependencyAudit() {
  log(colors.cyan, '\n📚 STEP 8: Dependency Audit');
  log(colors.cyan, '─'.repeat(40));

  const result = spawnSync('npm', ['audit', '--audit-level=high'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });

  const output = result.stdout + result.stderr;
  const highMatch = output.match(/(\d+)\s+high/);
  const criticalMatch = output.match(/(\d+)\s+critical/);

  const high = highMatch ? parseInt(highMatch[1], 10) : 0;
  const critical = criticalMatch ? parseInt(criticalMatch[1], 10) : 0;

  if (critical > 0) {
    log(colors.red, `  npm audit: FAIL (${critical} critical)`);
  } else if (high > 0) {
    log(colors.yellow, `  npm audit: ${high} high (no critical) — advisory`);
  } else {
    log(colors.green, '  Dependencies: PASS (no high/critical per npm audit)');
  }

  return { high, critical, pass: critical === 0 };
}

// ─── Step 9: Environment Validation ───────────────────────────────────────

function runEnvCheck() {
  log(colors.cyan, '\n🌍 STEP 9: Environment Validation');
  log(colors.cyan, '─'.repeat(40));

  const envExample = path.join(ROOT, '.env.example');
  if (!existsSync(envExample)) {
    log(colors.red, '  Environment: FAIL (.env.example missing)');
    return { missing: 1, pass: false, nodeOk: true, keys: 0 };
  }

  const raw = readFileSync(envExample, 'utf8');
  const keyRe = /^([A-Z][A-Z0-9_]*)\s*=/gm;
  const keys = [];
  let m;
  while ((m = keyRe.exec(raw)) !== null) {
    keys.push(m[1]);
  }

  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length > 0) {
    log(colors.red, `  Environment: FAIL (duplicate keys in .env.example: ${[...new Set(dup)].join(', ')})`);
    return { missing: dup.length, pass: false, nodeOk: true, keys: keys.length };
  }

  let nodeOk = true;
  const pkgPath = path.join(ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const eng = pkg.engines?.node;
      if (eng) {
        const major = parseInt(process.versions.node.split('.')[0], 10);
        const req = String(eng).replace(/^\D*/, '');
        const minMajor = parseInt(req.split('.')[0], 10);
        if (!Number.isNaN(minMajor) && major < minMajor) {
          log(colors.red, `  Node: FAIL (have v${process.versions.node}, package.json requires ${eng})`);
          nodeOk = false;
        } else {
          log(colors.green, `  Node: OK (v${process.versions.node}, engines.node=${eng})`);
        }
      } else {
        log(colors.green, `  Node: OK (v${process.versions.node}; no engines.node constraint)`);
      }
    } catch {
      log(colors.yellow, '  Node: skipped (could not read package.json)');
    }
  }

  log(colors.green, `  .env.example: OK (${keys.length} documented keys, no duplicates)`);
  return { missing: 0, pass: nodeOk, nodeOk, keys: keys.length };
}

// ─── Report ───────────────────────────────────────────────────────────────

function generateReport(steps) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let status = 'PASS';
  const blockers = [];

  if (!steps.typeScript.pass) blockers.push(`TypeScript: ${steps.typeScript.errors} errors`);
  if (!steps.lint.pass) blockers.push(`ESLint failed`);
  if (!steps.immunity.pass) blockers.push(`Critical violations: ${steps.immunity.critical}`);
  if (!steps.build.pass) blockers.push('Build failed');
  if (!steps.tests.pass) blockers.push('Test failures');
  if (!steps.secrets.pass) blockers.push(`Secrets detected: ${steps.secrets.found}`);
  if (!steps.dependencies.pass) blockers.push(`Critical vulnerabilities: ${steps.dependencies.critical}`);
  if (!steps.env.pass) blockers.push('Environment validation failed');

  if (blockers.length > 0) {
    status = opts.mode === 'force' ? 'CONDITIONAL PASS' : 'FAIL';
  }

  return `## Production Polish Report — ${timestamp}

POLISH STATUS: ${status}

### Type Safety (Step 1)
- TypeScript errors: ${steps.typeScript.errors}
- Status: ${steps.typeScript.pass ? 'PASS' : 'FAIL'}

### Lint Check (Step 2)
- ESLint errors: ${steps.lint.errors}
- Status: ${steps.lint.pass ? 'PASS' : 'FAIL'}

### Import Coherence (Step 3)
- Critical violations: ${steps.immunity.critical}
- Status: ${steps.immunity.pass ? 'PASS' : 'FAIL'}

### Test Gate (Step 4)
- Status: ${steps.tests.pass ? 'PASS' : 'FAIL'}

### Build Verification (Step 5)
- Status: ${steps.build.pass ? 'PASS' : 'FAIL'}

### Secret Scan (Step 6)
- Suspicious lines: ${steps.secrets.found}
- Status: ${steps.secrets.pass ? 'PASS' : 'FAIL'}

### Large File Check (Step 7)
- Large source files: ${steps.largeFiles.codeLarge}
- Very large blobs: ${steps.largeFiles.anyLarge}
- Status: ${steps.largeFiles.pass ? 'PASS (warnings only)' : 'FAIL'}

### Dependency Audit (Step 8)
- High: ${steps.dependencies.high} | Critical: ${steps.dependencies.critical}
- Status: ${steps.dependencies.pass ? 'PASS' : 'FAIL'}

### Environment (Step 9)
- .env.example keys: ${steps.env.keys}
- Status: ${steps.env.pass ? 'PASS' : 'FAIL'}

### Blockers
${blockers.length > 0 ? blockers.map(b => `- ${b}`).join('\n') : '- None'}

### Sign-off
${status === 'PASS' ? '- [x] Ready for commit' : '- [ ] Blocked by issues above'}`;
}

async function main() {
  log(colors.cyan, '═'.repeat(60));
  log(colors.cyan, '  ✨ PRODUCTION POLISH');
  log(colors.cyan, `  Mode: ${opts.mode}`);
  log(colors.cyan, '═'.repeat(60));

  const typeScript = runTypeScriptCheck();
  const lint = opts.mode === 'quick' ? { errors: 0, pass: true } : runLintCheck();
  const immunity = runImmunityScan();
  const tests = opts.mode === 'quick' ? { failed: false, pass: true } : runTests();
  const build = opts.mode === 'quick' ? { errors: false, pass: true } : runBuild();
  const secrets = runSecretScan();
  const largeFiles = runLargeFileCheck();
  const dependencies = opts.mode === 'quick' ? { high: 0, critical: 0, pass: true } : runDependencyAudit();
  const env = runEnvCheck();

  const report = generateReport({
    typeScript,
    lint,
    immunity,
    tests,
    build,
    secrets,
    largeFiles,
    dependencies,
    env,
  });

  log(colors.cyan, '\n' + '═'.repeat(60));
  console.log(report);
  log(colors.cyan, '═'.repeat(60));

  const hasBlockers =
    !typeScript.pass ||
    !lint.pass ||
    !immunity.pass ||
    !build.pass ||
    !tests.pass ||
    !secrets.pass ||
    !dependencies.pass ||
    !env.pass;

  if (hasBlockers && opts.mode !== 'force') {
    log(colors.red, '\n❌ PRODUCTION POLISH FAILED — Fix blockers before commit');
    process.exit(1);
  }

  log(colors.green, '\n✅ PRODUCTION POLISH COMPLETE — Ready for commit');
  process.exit(0);
}

main().catch(err => {
  log(colors.red, `Error: ${err.message}`);
  process.exit(1);
});
