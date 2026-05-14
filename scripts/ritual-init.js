import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBooleanFlag } from '../codex/server/utils/envFlags.js';
import {
  hasRhymeAstrologyArtifactBundle,
  resolveRhymeAstrologyArtifactPaths,
} from '../codex/server/utils/rhymeAstrologyPaths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_RHYME_ASTROLOGY = parseBooleanFlag(process.env.ENABLE_RHYME_ASTROLOGY, false);

// Baked-in seed data paths (from Dockerfile build-time stage)
const SEED_DICT_PATH = '/app/data/scholomance_dict.sqlite';
const SEED_CORPUS_PATH = '/app/data/scholomance_corpus.sqlite';

// Resolved at call time — NOT at module load — so Render's persistent disk
// has time to mount before we check /var/data.
function resolveDataDir() {
  return IS_PRODUCTION && existsSync('/var/data') ? '/var/data' : PROJECT_ROOT;
}

const RHYME_ASTROLOGY_PATHS = resolveRhymeAstrologyArtifactPaths({
  projectRoot: PROJECT_ROOT,
  isProduction: IS_PRODUCTION,
});
const RHYME_ASTROLOGY_READY = () => hasRhymeAstrologyArtifactBundle(RHYME_ASTROLOGY_PATHS)
  && existsSync(RHYME_ASTROLOGY_PATHS.emotionPriorsPath);

function resolveRuntimeDatabasePath(envVarName, fallbackPath) {
  const explicitPath = process.env[envVarName];
  if (typeof explicitPath === 'string' && explicitPath.trim().length > 0) {
    return path.resolve(explicitPath);
  }
  return fallbackPath;
}

/**
 * Seed persistent disk with baked-in databases on first boot.
 * Render's disk mount shadows the Dockerfile copies, so we copy them over.
 */
function seedPersistentDisk(dictPath, corpusPath) {
  if (!IS_PRODUCTION) return;

  // If we are already pointing to the baked-in /app/data, no need to seed.
  // This is common in the new Fly.io/Turso infrastructure.
  if (dictPath.startsWith('/app/data') && corpusPath.startsWith('/app/data')) {
    console.log('[RITUAL] Skipping seeding — using baked-in image databases directly.');
    return;
  }

  if (!existsSync(dictPath) && existsSync(SEED_DICT_PATH)) {
    console.log(`[RITUAL] Seeding dictionary from baked-in image: ${SEED_DICT_PATH} → ${dictPath}`);
    copyFileSync(SEED_DICT_PATH, dictPath);
  }
  if (!existsSync(corpusPath) && existsSync(SEED_CORPUS_PATH)) {
    console.log(`[RITUAL] Seeding corpus from baked-in image: ${SEED_CORPUS_PATH} → ${corpusPath}`);
    copyFileSync(SEED_CORPUS_PATH, corpusPath);
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[RITUAL] Executing: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: options.cwd || PROJECT_ROOT,
      env: options.env || process.env,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const msg = `${command} exited with code ${code}`;
        console.error(`[RITUAL] Command failed: ${msg}`);
        reject(new Error(msg));
      }
    });
    proc.on('error', (err) => {
      console.error(`[RITUAL] Process error: ${err.message}`);
      reject(err);
    });
  });
}

const PLACEHOLDER_PATTERNS = [
  /^replace[\s-]/i,
  /^your[_-]/i,
  /^changeme$/i,
  /^secret$/i,
  /^todo$/i,
];

const REQUIRED_SECRETS = [
  { key: 'SESSION_SECRET', minLength: 32 },
  { key: 'AUDIO_ADMIN_TOKEN', minLength: 24 },
  { key: 'DATABASE_URL', when: () => process.env.USE_TURSO === 'true' },
];

const CONDITIONAL_SECRETS = [
  { key: 'REDIS_URL', when: () => parseBooleanFlag(process.env.ENABLE_REDIS_SESSIONS, false) },
  { key: 'SENDGRID_API_KEY', when: () => process.env.MAIL_PROVIDER === 'sendgrid' },
  { key: 'RESEND_API_KEY', when: () => process.env.MAIL_PROVIDER === 'resend' },
  { key: 'SMTP_HOST', when: () => process.env.MAIL_PROVIDER === 'smtp' || process.env.MAIL_PROVIDER === 'postfix' },
  { key: 'SMTP_USER', when: () => process.env.MAIL_PROVIDER === 'smtp' },
  { key: 'SMTP_PASS', when: () => process.env.MAIL_PROVIDER === 'smtp' },
  { key: 'VITE_ADMIN_USERNAMES', when: () => IS_PRODUCTION },
];

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some(p => p.test(String(value || '').trim()));
}

function validateSecrets() {
  if (!IS_PRODUCTION) return;

  const errors = [];
  const warnings = [];

  for (const { key, minLength, when } of REQUIRED_SECRETS) {
    if (when && !when()) continue;
    const val = process.env[key];
    if (!val || val.trim().length === 0) {
      errors.push(`  ✗ ${key} is not set`);
    } else if (isPlaceholder(val)) {
      errors.push(`  ✗ ${key} still has a placeholder value — set a real secret via: fly secrets set ${key}=<value>`);
    } else if (minLength && val.trim().length < minLength) {
      errors.push(`  ✗ ${key} is too short (${val.trim().length} chars, need ≥${minLength})`);
    }
  }

  for (const { key, when } of CONDITIONAL_SECRETS) {
    if (when && !when()) continue;
    const val = process.env[key];
    if (!val || val.trim().length === 0) {
      // In production, missing MAIL_PROVIDER config is a FATAL if it's supposed to be on
      if (key.includes('API_KEY') || key.includes('SMTP_')) {
         errors.push(`  ✗ ${key} is required when MAIL_PROVIDER is '${process.env.MAIL_PROVIDER}'`);
      } else {
         warnings.push(`  ⚠ ${key} is recommended for production but is not set`);
      }
    } else if (isPlaceholder(val)) {
      errors.push(`  ✗ ${key} still has a placeholder value`);
    }
  }

  // Ensure internal module gating has a source of truth for admins
  if (!process.env.VITE_ADMIN_USERNAMES && IS_PRODUCTION) {
    warnings.push(`  ⚠ VITE_ADMIN_USERNAMES is not set. Internal modules (PixelBrain, Collab) will be inaccessible to ALL users in production.`);
  }

  if (warnings.length > 0) {
    console.warn('[RITUAL] Secret warnings:');
    warnings.forEach(w => console.warn(w));
  }

  if (errors.length > 0) {
    console.error('[RITUAL] FATAL: Missing or invalid production secrets:');
    errors.forEach(e => console.error(e));
    console.error('[RITUAL] Set secrets with: fly secrets set KEY=value');
    process.exit(1);
  }

  console.log('[RITUAL] Secrets validated.');
}

async function main() {
  const args = process.argv.slice(2);
  const isDetached = args.includes('--detach');

  validateSecrets();

  console.log(`[RITUAL] Starting Production Initialization... (detached=${isDetached})`);

  async function runRitual() {
    try {
      // Resolve data dir here — after any startup delay — so Render's persistent
      // disk has had time to mount before we check existsSync('/var/data').
      const dataDir = resolveDataDir();
      const dictPath = resolveRuntimeDatabasePath(
        'SCHOLOMANCE_DICT_PATH',
        path.join(dataDir, 'scholomance_dict.sqlite'),
      );
      const corpusPath = resolveRuntimeDatabasePath(
        'SCHOLOMANCE_CORPUS_PATH',
        path.join(dataDir, 'scholomance_corpus.sqlite'),
      );

      // 0. Ensure audio storage directory exists
      const audioDir = path.join(dataDir, 'audio');
      if (!existsSync(audioDir)) {
        console.log(`[RITUAL] Creating audio storage at ${audioDir}`);
        try { mkdirSync(audioDir, { recursive: true }); } catch (_e) {
          // Best-effort
        }
      }

      // 1. Seed persistent disk from baked-in image (first boot only)
      seedPersistentDisk(dictPath, corpusPath);

      // 2. Dictionary check
      if (!existsSync(dictPath)) {
        // Runtime image does not include python3 or curl — databases must be
        // baked into the Docker image at build time or pre-seeded to /var/data.
        console.error('[RITUAL] FATAL: Dictionary DB missing and runtime build is not supported.');
        console.error(`[RITUAL]   Expected: ${dictPath}`);
        console.error('[RITUAL]   Rebuild the Docker image or seed /var/data manually.');
      } else {
        console.log(`[RITUAL] Dictionary ready at ${dictPath}.`);
      }

      // 3. Corpus check
      if (!existsSync(corpusPath)) {
        console.error('[RITUAL] FATAL: Corpus DB missing and runtime build is not supported.');
        console.error(`[RITUAL]   Expected: ${corpusPath}`);
        console.error('[RITUAL]   Rebuild the Docker image or seed /var/data manually.');
      } else {
        console.log(`[RITUAL] Corpus ready at ${corpusPath}.`);
      }

      // 4. Rhyme Astrology artifact initialization
      if (ENABLE_RHYME_ASTROLOGY) {
        if (!RHYME_ASTROLOGY_READY()) {
          if (!existsSync(dictPath)) {
            console.error('[RITUAL] FATAL: Rhyme Astrology build skipped — Dictionary DB missing.');
            console.error(`[RITUAL]   Expected: ${dictPath}`);
            console.error('[RITUAL]   Rebuild the Docker image or seed /var/data manually.');
          } else try {
            mkdirSync(RHYME_ASTROLOGY_PATHS.outputDir, { recursive: true });
            await runCommand(process.execPath, ['scripts/buildRhymeAstrologyIndex.js'], {
              env: {
                ...process.env,
                SCHOLOMANCE_DICT_PATH: dictPath,
                SCHOLOMANCE_CORPUS_PATH: corpusPath,
                RHYME_ASTROLOGY_OUTPUT_DIR: RHYME_ASTROLOGY_PATHS.outputDir,
              },
            });
          } catch (err) {
            console.error('[RITUAL] Rhyme Astrology artifact build failed:', err.message);
          }
        } else {
          console.log(`[RITUAL] Rhyme Astrology artifacts already exist at ${RHYME_ASTROLOGY_PATHS.outputDir}.`);
        }
      }

      console.log('[RITUAL] Background indexing tasks completed.');
    } catch (critical) {
      console.error('[RITUAL] Critical background ritual error:', critical.message);
    }
  }

  if (isDetached) {
    console.log('[RITUAL] Detaching indexing tasks to background...');
    runRitual().catch(err => console.error('[RITUAL] Background ritual error:', err));
    // Delay gives Render's persistent disk mount time to settle before the
    // server process starts and also ensures ritual logs are visible.
    await new Promise(r => setTimeout(r, 1000));
  } else {
    await runRitual();
  }

  console.log('[RITUAL] Initialization Sequence Handoff. Launching Scholomance CODEx.');
}

main().catch((err) => {
  console.error('[RITUAL] Critical initialization failure:', err);
  process.exit(1);
});
