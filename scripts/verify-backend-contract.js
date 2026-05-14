import { readFileSync } from 'node:fs';

function readUtf8(filePath) {
  return readFileSync(filePath, 'utf8');
}

function fail(message) {
  console.error(`[verify-backend-contract] ${message}`);
  process.exitCode = 1;
}

function assertContains(content, needle, filePath) {
  if (!content.includes(needle)) {
    fail(`${filePath} is missing required content: ${needle}`);
  }
}

function parseEnvKeys(envContent) {
  const keys = new Set();
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;
    keys.add(trimmed.slice(0, equalsIndex));
  }
  return keys;
}

function assertEnvKeys(envContent, requiredKeys, filePath) {
  const keys = parseEnvKeys(envContent);
  for (const key of requiredKeys) {
    if (!keys.has(key)) {
      fail(`${filePath} is missing required env key: ${key}`);
    }
  }
}

function main() {
  const envExamplePath = '.env.example';
  const readmePath = 'README.md';
  const dockerfilePath = 'Dockerfile';
  const testWorkflowPath = '.github/workflows/test.yml';
  const auditWorkflowPath = '.github/workflows/audit.yml';

  const envExample = readUtf8(envExamplePath);
  const readme = readUtf8(readmePath);
  const dockerfile = readUtf8(dockerfilePath);
  const testWorkflow = readUtf8(testWorkflowPath);
  const auditWorkflow = readUtf8(auditWorkflowPath);

  assertEnvKeys(envExample, [
    'SESSION_SECRET',
    'NODE_ENV',
    'HOST',
    'PORT',
    'TRUST_PROXY',
    'SERVE_FRONTEND',
    'USER_DB_PATH',
    'COLLAB_DB_PATH',
    'ENABLE_COLLAB_API',
    'REDIS_URL',
    'ENABLE_REDIS_SESSIONS',
    'ENABLE_RHYME_ASTROLOGY',
    'API_TIMEOUT_MS',
    'DB_BUSY_TIMEOUT_MS',
    'SHUTDOWN_TIMEOUT_MS',
    'AUDIO_STORAGE_PATH',
    'AUDIO_ADMIN_TOKEN',
    'ENABLE_DEV_AUTH',
    'VITE_API_BASE_URL',
    'SCHOLOMANCE_DICT_API_URL',
    'SCHOLOMANCE_DICT_PATH',
    'VITE_SCHOLOMANCE_DICT_API_URL',
    'VITE_DICTIONARY_API_URL',
    'VITE_THESAURUS_API_URL',
    'VITE_USE_CODEX_PIPELINE',
    'VITE_USE_SERVER_WORD_LOOKUP',
    'VITE_ENABLE_LOCAL_WORD_LOOKUP_FALLBACK',
  ], envExamplePath);

  for (const routeLine of ['GET /health/live', 'GET /health/ready', 'GET /metrics']) {
    assertContains(readme, routeLine, readmePath);
  }

  assertContains(dockerfile, 'FROM node:20', dockerfilePath);

  for (const [path, workflow] of [
    [testWorkflowPath, testWorkflow],
    [auditWorkflowPath, auditWorkflow],
  ]) {
    assertContains(workflow, "node-version: '20'", path);
    assertContains(workflow, 'npm ci', path);
  }

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
  console.log('[verify-backend-contract] OK');
}

main();
