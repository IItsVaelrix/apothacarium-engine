#!/usr/bin/env node
/**
 * INIT-SECRETS
 *
 * Generates a runnable .env from .env.example by:
 *   - Filling `<random-N+>` placeholders with crypto-random hex
 *   - Ensuring local data/ paths exist
 *   - Inheriting any existing keys you've already set (won't clobber)
 *   - Optionally copying real cloud secrets from a source .env via --from
 *
 * Usage:
 *   node scripts/init-secrets.js              # write .env from .env.example
 *   node scripts/init-secrets.js --force      # overwrite existing .env
 *   node scripts/init-secrets.js --from ../scholomance-V12/.env
 *                                             # inherit non-secret values
 *   node scripts/init-secrets.js --dry-run    # print what would be written
 *   node scripts/init-secrets.js --print KEY  # print the resolved value of KEY
 *
 * Random placeholders are any RHS of the form <random-N+> where N is the
 * minimum byte length. Example: SESSION_SECRET=<random-32+>.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const EXAMPLE_PATH = resolve(REPO_ROOT, '.env.example');
const ENV_PATH = resolve(REPO_ROOT, '.env');
const DATA_DIR = resolve(REPO_ROOT, 'data');

const RANDOM_PATTERN = /^<random-(\d+)\+>$/;

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { force: false, dryRun: false, from: null, printKey: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--print') out.printKey = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function showHelp() {
  console.log(`init-secrets

Usage:
  node scripts/init-secrets.js [--force] [--from <other-.env>] [--dry-run]
                               [--print <KEY>]

Reads .env.example, fills <random-N+> placeholders with cryptographic random
hex, preserves any existing values in .env (unless --force), and writes the
result back to .env. Also creates ./data/ for local SQLite paths.

Flags:
  --force       Overwrite an existing .env. Random secrets are regenerated.
  --from FILE   Inherit non-random values from another .env (e.g., the V12 .env)
                so cloud credentials, SMTP hosts, Redis URLs, etc. carry over.
                Random/empty placeholders still get filled locally.
  --dry-run     Print what would be written; do not modify files.
  --print KEY   Resolve and print a single key's value (useful for shell evals).
  -h, --help    Show this message.
`);
}

function parseEnv(content) {
  const out = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key) out.set(key, val);
  }
  return out;
}

function readEnvFile(path) {
  if (!existsSync(path)) return new Map();
  return parseEnv(readFileSync(path, 'utf8'));
}

function rewriteValue(line, resolved) {
  // Keep blank/comment lines verbatim.
  if (!line || line.trim().startsWith('#')) return line;
  const eq = line.indexOf('=');
  if (eq < 0) return line;
  const key = line.slice(0, eq).trim();
  if (!resolved.has(key)) return line;
  return `${key}=${resolved.get(key)}`;
}

function fillRandom(placeholder) {
  const m = placeholder.match(RANDOM_PATTERN);
  if (!m) return null;
  const minBytes = Math.max(parseInt(m[1], 10), 16);
  return randomBytes(minBytes).toString('hex');
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function resolvePath(p) {
  if (!p) return p;
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

function main() {
  if (args.help) {
    showHelp();
    return;
  }

  if (!existsSync(EXAMPLE_PATH)) {
    console.error(`init-secrets: missing ${EXAMPLE_PATH}`);
    process.exit(1);
  }

  if (args.printKey) {
    const env = readEnvFile(ENV_PATH);
    const value = env.get(args.printKey) ?? '';
    process.stdout.write(value);
    return;
  }

  const exampleText = readFileSync(EXAMPLE_PATH, 'utf8');
  const exampleEnv = parseEnv(exampleText);
  const existingEnv = readEnvFile(ENV_PATH);
  const sourceEnv = args.from ? readEnvFile(resolvePath(args.from)) : new Map();

  const resolved = new Map();
  const stats = { random: 0, inherited: 0, fromSource: 0, fromExample: 0 };

  for (const [key, rhs] of exampleEnv) {
    // Priority: existing .env (unless --force overrides randoms) > --from > example random fill > example literal
    if (!args.force && existingEnv.has(key) && existingEnv.get(key) !== '') {
      resolved.set(key, existingEnv.get(key));
      stats.inherited++;
      continue;
    }
    if (sourceEnv.has(key) && sourceEnv.get(key) !== '' && !RANDOM_PATTERN.test(rhs)) {
      resolved.set(key, sourceEnv.get(key));
      stats.fromSource++;
      continue;
    }
    if (RANDOM_PATTERN.test(rhs)) {
      const random = fillRandom(rhs);
      resolved.set(key, random);
      stats.random++;
      continue;
    }
    resolved.set(key, rhs);
    stats.fromExample++;
  }

  // Reconstruct the file, preserving comments and ordering from .env.example.
  const out = exampleText
    .split(/\r?\n/)
    .map((line) => rewriteValue(line, resolved))
    .join('\n');

  // Ensure data/ exists so local SQLite paths work.
  ensureDir(DATA_DIR);

  if (args.dryRun) {
    console.log(out);
    console.error(`(dry-run) keys: ${resolved.size} | random=${stats.random} inherited=${stats.inherited} fromSource=${stats.fromSource} fromExample=${stats.fromExample}`);
    return;
  }

  if (existsSync(ENV_PATH) && !args.force) {
    // Merge: only write keys missing from existing .env. Append a footer with the new keys.
    const newKeys = [];
    for (const [k, v] of resolved) {
      if (!existingEnv.has(k) || (RANDOM_PATTERN.test(exampleEnv.get(k) || '') && (existingEnv.get(k) || '').startsWith('<random'))) {
        newKeys.push(`${k}=${v}`);
      }
    }
    if (newKeys.length === 0) {
      console.log(`init-secrets: ${ENV_PATH} already populated — no changes.`);
      console.log(`  use --force to regenerate, or delete .env first.`);
      return;
    }
    const merged = readFileSync(ENV_PATH, 'utf8').trimEnd() + '\n\n# Added by init-secrets ' + new Date().toISOString() + '\n' + newKeys.join('\n') + '\n';
    writeFileSync(ENV_PATH, merged);
    console.log(`init-secrets: appended ${newKeys.length} key(s) to ${ENV_PATH}`);
    console.log(`  random=${stats.random}, inherited=${stats.inherited}, fromSource=${stats.fromSource}, fromExample=${stats.fromExample}`);
    return;
  }

  writeFileSync(ENV_PATH, out);
  console.log(`init-secrets: wrote ${ENV_PATH}`);
  console.log(`  random=${stats.random}, inherited=${stats.inherited}, fromSource=${stats.fromSource}, fromExample=${stats.fromExample}`);
  console.log(`  data dir: ${DATA_DIR}`);
}

main();
