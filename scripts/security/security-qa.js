import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'playwright-report',
  'test-results',
  'dict_data',
  'coverage',
  'scripts',
  'tests',
  'security'
]);

const JS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const REQUIRED_ISSUE_IDS = [
  'sqli',
  'xss',
  'idor',
  'hardcoded-secrets',
  'package-hallucination',
  'auth-bypass',
  'insecure-deserialization',
  'dos',
  'eval',
  'input-validation',
  'rate-limiting',
  'outdated-deps',
  'information-exposure',
  'tight-coupling',
  'ai-tools',
  'contextual-understanding'
];

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function lineMatches(content, regex) {
  const matches = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (regex.test(line)) {
      matches.push({ line: i + 1, text: line.trim() });
    }
  }
  return matches;
}

function scanFiles(files, regex) {
  const results = [];
  for (const file of files) {
    const content = readText(file);
    if (!content) continue;
    const matches = lineMatches(content, regex);
    if (matches.length > 0) {
      results.push({
        file,
        matches
      });
    }
  }
  return results;
}

function reportMatchList(label, entries, max = 6) {
  const details = [];
  const flattened = [];
  for (const entry of entries) {
    for (const match of entry.matches) {
      flattened.push({ file: entry.file, line: match.line, text: match.text });
    }
  }
  flattened.slice(0, max).forEach((item) => {
    details.push(`${label}: ${toPosix(path.relative(ROOT, item.file))}:${item.line} ${item.text}`);
  });
  if (flattened.length > max) {
    details.push(`${label}: ${flattened.length - max} more matches`);
  }
  return details;
}

function getServerFiles() {
  const serverFiles = [];
  const rootIndex = path.join(ROOT, 'index.js');
  if (fs.existsSync(rootIndex)) {
    serverFiles.push(rootIndex);
  }
  const serverDir = path.join(ROOT, 'server');
  if (fs.existsSync(serverDir)) {
    for (const file of listFiles(serverDir)) {
      if (JS_EXTS.has(path.extname(file))) {
        serverFiles.push(file);
      }
    }
  }
  const codexServerDir = path.join(ROOT, 'codex', 'server');
  if (fs.existsSync(codexServerDir)) {
    for (const file of listFiles(codexServerDir)) {
      if (JS_EXTS.has(path.extname(file))) {
        serverFiles.push(file);
      }
    }
  }
  return serverFiles;
}

function hasValidationSignals(content) {
  return /(safeParse|\.parse\(|validate\(|schema\s*:|zod|ajv|yup|superstruct|valibot)/i.test(content);
}

function checkQaMap() {
  const qaMapPath = path.join(ROOT, 'security', 'qa-map.json');
  if (!fs.existsSync(qaMapPath)) {
    return {
      status: 'FAIL',
      title: 'Contextual Understanding Enforcement',
      details: ['Missing security/qa-map.json (QA policy map)']
    };
  }
  const content = readText(qaMapPath);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      status: 'FAIL',
      title: 'Contextual Understanding Enforcement',
      details: ['security/qa-map.json is not valid JSON']
    };
  }
  const ids = new Set((parsed.issues || []).map((issue) => issue.id));
  const missing = REQUIRED_ISSUE_IDS.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    return {
      status: 'FAIL',
      title: 'Contextual Understanding Enforcement',
      details: missing.map((id) => `Missing issue mapping: ${id}`)
    };
  }
  const pkg = JSON.parse(readText(path.join(ROOT, 'package.json')) || '{}');
  const scripts = pkg.scripts || {};
  if (!scripts['security:qa']) {
    return {
      status: 'FAIL',
      title: 'Contextual Understanding Enforcement',
      details: ['package.json missing security:qa script']
    };
  }
  return {
    status: 'PASS',
    title: 'Contextual Understanding Enforcement',
    details: ['security/qa-map.json and package.json security:qa script are present']
  };
}

function checkPackageAllowlist() {
  const allowlistPath = path.join(ROOT, 'security', 'dependency-allowlist.json');
  if (!fs.existsSync(allowlistPath)) {
    return {
      status: 'FAIL',
      title: 'Package Hallucination Guardrails',
      details: ['Missing security/dependency-allowlist.json']
    };
  }
  let allowlist;
  try {
    allowlist = JSON.parse(readText(allowlistPath));
  } catch {
    return {
      status: 'FAIL',
      title: 'Package Hallucination Guardrails',
      details: ['dependency-allowlist.json is not valid JSON']
    };
  }
  const pkg = JSON.parse(readText(path.join(ROOT, 'package.json')) || '{}');
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  const allowed = new Set([...(allowlist.dependencies || []), ...(allowlist.devDependencies || [])]);
  const missing = [...deps, ...devDeps].filter((dep) => !allowed.has(dep));
  if (missing.length > 0) {
    return {
      status: 'FAIL',
      title: 'Package Hallucination Guardrails',
      details: missing.map((dep) => `Dependency not in allowlist: ${dep}`)
    };
  }
  return {
    status: 'PASS',
    title: 'Package Hallucination Guardrails',
    details: ['All direct dependencies are allowlisted']
  };
}

function checkAiPolicy(allFiles) {
  const policyPath = path.join(ROOT, 'security', 'ai-tools.policy.json');
  if (!fs.existsSync(policyPath)) {
    return {
      status: 'FAIL',
      title: 'AI Tool Access Controls',
      details: ['Missing security/ai-tools.policy.json']
    };
  }
  let policy;
  try {
    policy = JSON.parse(readText(policyPath));
  } catch {
    return {
      status: 'FAIL',
      title: 'AI Tool Access Controls',
      details: ['ai-tools.policy.json is not valid JSON']
    };
  }
  const aiRegex = /(openai|anthropic|gpt|claude|gemini|ollama|bedrock|vertex)/i;
  const aiUsages = scanFiles(allFiles, aiRegex);
  if (aiUsages.length === 0) {
    return {
      status: 'PASS',
      title: 'AI Tool Access Controls',
      details: ['No AI tool usage detected; policy exists']
    };
  }
  const allowedProviders = new Set((policy.allowedProviders || []).map((value) => value.toLowerCase()));
  const unmatched = [];
  for (const entry of aiUsages) {
    const fileContent = readText(entry.file).toLowerCase();
    if (![...allowedProviders].some((provider) => fileContent.includes(provider))) {
      unmatched.push(entry.file);
    }
  }
  if (unmatched.length > 0) {
    return {
      status: 'FAIL',
      title: 'AI Tool Access Controls',
      details: unmatched.map((file) => `AI usage without allowlist entry: ${toPosix(path.relative(ROOT, file))}`)
    };
  }
  return {
    status: 'PASS',
    title: 'AI Tool Access Controls',
    details: ['AI usage matches allowlist policy']
  };
}

function checkOutdatedDepsTool() {
  const auditScriptPath = path.join(ROOT, 'scripts', 'security', 'dependency-audit.js');
  if (!fs.existsSync(auditScriptPath)) {
    return {
      status: 'FAIL',
      title: 'Outdated Dependency Scanning Tool',
      details: ['Missing scripts/security/dependency-audit.js']
    };
  }
  const pkg = JSON.parse(readText(path.join(ROOT, 'package.json')) || '{}');
  const scripts = pkg.scripts || {};
  if (!scripts['security:audit']) {
    return {
      status: 'FAIL',
      title: 'Outdated Dependency Scanning Tool',
      details: ['package.json missing security:audit script']
    };
  }
  return {
    status: 'PASS',
    title: 'Outdated Dependency Scanning Tool',
    details: ['dependency-audit tool is present']
  };
}

function checkSecurityHeaders(serverFiles) {
  if (serverFiles.length === 0) {
    return {
      status: 'FAIL',
      title: 'CSP & Security Headers',
      details: ['No server entry files found to enforce CSP']
    };
  }
  const matches = scanFiles(serverFiles, /@fastify\/helmet|helmet\s*\(/i);
  const cspMatches = scanFiles(serverFiles, /contentSecurityPolicy|csp/i);
  if (matches.length === 0 || cspMatches.length === 0) {
    return {
      status: 'FAIL',
      title: 'CSP & Security Headers',
      details: ['Server does not register @fastify/helmet with CSP directives']
    };
  }
  return {
    status: 'PASS',
    title: 'CSP & Security Headers',
    details: ['Helmet with CSP detected in server']
  };
}

function checkServerRateLimit(serverFiles) {
  const matches = scanFiles(serverFiles, /@fastify\/rate-limit|rateLimit\s*\(/i);
  if (matches.length === 0) {
    return {
      status: 'FAIL',
      title: 'Server Rate Limiting',
      details: ['No server-side rate limiting detected (@fastify/rate-limit)']
    };
  }
  return {
    status: 'PASS',
    title: 'Server Rate Limiting',
    details: ['Server-side rate limiting detected']
  };
}

function checkRequestSizeLimit(serverFiles) {
  const matches = scanFiles(serverFiles, /bodyLimit|addContentTypeParser|contentLength|content-length/i);
  if (matches.length === 0) {
    return {
      status: 'FAIL',
      title: 'Request Size Limits',
      details: ['No request size limit configuration found']
    };
  }
  return {
    status: 'PASS',
    title: 'Request Size Limits',
    details: ['Request size limiting detected']
  };
}

function checkAuth(serverFiles) {
  const matches = scanFiles(serverFiles, /@fastify\/jwt|authenticate|authorization|authorize|preHandler/i);
  if (matches.length === 0) {
    return {
      status: 'FAIL',
      title: 'Authentication Enforcement',
      details: ['No auth middleware or JWT registration detected']
    };
  }
  return {
    status: 'PASS',
    title: 'Authentication Enforcement',
    details: ['Auth hooks detected in server']
  };
}

function checkIdor(serverFiles) {
  const routeMatches = scanFiles(serverFiles, /fastify\.(get|post|put|patch|delete)\(\s*['"`][^'"`]*:[^'"`]+['"`]/i);
  if (routeMatches.length === 0) {
    return {
      status: 'WARN',
      title: 'IDOR / Ownership Checks',
      details: ['No parameterized resource routes detected; ensure ownership checks for future routes']
    };
  }
  const ownershipMatches = scanFiles(serverFiles, /authorId|owner|ownership|authorize|canAccess|requireOwnership/i);
  if (ownershipMatches.length === 0) {
    return {
      status: 'FAIL',
      title: 'IDOR / Ownership Checks',
      details: ['Resource routes detected without ownership checks']
    };
  }
  return {
    status: 'PASS',
    title: 'IDOR / Ownership Checks',
    details: ['Ownership checks detected on resource routes']
  };
}

function checkInputValidation(serverFiles) {
  const validationMatches = scanFiles(serverFiles, /(schema\s*:|zod|ajv|yup|superstruct|valibot)/i);
  if (validationMatches.length === 0) {
    return {
      status: 'FAIL',
      title: 'Input Validation',
      details: ['No server-side schema validation detected']
    };
  }
  return {
    status: 'PASS',
    title: 'Input Validation',
    details: ['Server-side validation detected']
  };
}

function checkEval(allFiles) {
  const matches = scanFiles(allFiles, /\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/);
  if (matches.length > 0) {
    return {
      status: 'FAIL',
      title: 'Eval Usage',
      details: reportMatchList('Eval usage', matches)
    };
  }
  return {
    status: 'PASS',
    title: 'Eval Usage',
    details: ['No eval or Function constructor usage detected']
  };
}

function checkXss(allFiles) {
  const matches = scanFiles(allFiles, /dangerouslySetInnerHTML|innerHTML\s*=|insertAdjacentHTML|document\.write/i);
  if (matches.length > 0) {
    return {
      status: 'FAIL',
      title: 'XSS Injection Surface',
      details: reportMatchList('Potential XSS', matches)
    };
  }
  return {
    status: 'PASS',
    title: 'XSS Injection Surface',
    details: ['No dangerous HTML injection patterns detected']
  };
}

function checkSecrets(allFiles) {
  const secretLiteralMatches = scanFiles(allFiles, /\b(apiKey|secret|token|password|accessKey)\b\s*[:=]\s*['"][^'"]{8,}['"]/i);
  const localStorageMatches = scanFiles(allFiles, /localStorage\.setItem\(\s*['"`][^'"`]*(key|token|secret|api|auth)[^'"`]*['"`]/i);
  const details = [];
  if (secretLiteralMatches.length > 0) {
    details.push(...reportMatchList('Hardcoded secret', secretLiteralMatches));
  }
  if (localStorageMatches.length > 0) {
    details.push(...reportMatchList('Sensitive localStorage key', localStorageMatches));
  }
  if (details.length > 0) {
    return {
      status: 'FAIL',
      title: 'Hardcoded Secrets & Client Keys',
      details
    };
  }
  return {
    status: 'PASS',
    title: 'Hardcoded Secrets & Client Keys',
    details: ['No hardcoded secrets or sensitive localStorage keys detected']
  };
}

function checkResponseValidation(clientFiles) {
  const jsonMatches = scanFiles(clientFiles, /\.json\(\)/);
  const failures = [];
  for (const entry of jsonMatches) {
    const content = readText(entry.file);
    if (!hasValidationSignals(content)) {
      failures.push(entry.file);
    }
  }
  if (failures.length > 0) {
    return {
      status: 'FAIL',
      title: 'Response Validation (Deserialization)',
      details: failures.slice(0, 6).map((file) => `No schema validation for JSON responses: ${toPosix(path.relative(ROOT, file))}`)
    };
  }
  if (jsonMatches.length === 0) {
    return {
      status: 'WARN',
      title: 'Response Validation (Deserialization)',
      details: ['No JSON response handling detected']
    };
  }
  return {
    status: 'PASS',
    title: 'Response Validation (Deserialization)',
    details: ['Schema validation detected for JSON responses']
  };
}

function checkInformationExposure() {
  const errorBoundaryPath = path.join(ROOT, 'src', 'components', 'shared', 'ErrorBoundary.jsx');
  if (!fs.existsSync(errorBoundaryPath)) {
    return {
      status: 'WARN',
      title: 'Error Detail Exposure',
      details: ['ErrorBoundary.jsx not found']
    };
  }
  const content = readText(errorBoundaryPath);
  const showsError = /this\.state\.error/.test(content);
  const gated = /import\.meta\.env\.PROD|process\.env\.NODE_ENV/.test(content);
  if (showsError && !gated) {
    return {
      status: 'FAIL',
      title: 'Error Detail Exposure',
      details: ['ErrorBoundary renders raw error details without production gating']
    };
  }
  return {
    status: 'PASS',
    title: 'Error Detail Exposure',
    details: ['Error details are gated or not rendered']
  };
}

function checkLocalStorageCoupling(clientFiles) {
  const allowlist = new Set([
    'persistence.adapter.js'
  ]);
  const matches = scanFiles(clientFiles, /localStorage\./);
  const offenders = matches.filter((entry) => !allowlist.has(path.basename(entry.file)));
  if (offenders.length > 0) {
    return {
      status: 'FAIL',
      title: 'Tight Coupling to localStorage',
      details: reportMatchList('Direct localStorage usage', offenders)
    };
  }
  return {
    status: 'PASS',
    title: 'Tight Coupling to localStorage',
    details: ['localStorage access is limited to adapters']
  };
}

function checkSqlInjection(allFiles) {
  const sqlMatches = scanFiles(
    allFiles,
    /['"`][^'"`]*(SELECT\\s+.+\\s+FROM|INSERT\\s+INTO|UPDATE\\s+\\w+\\s+SET|DELETE\\s+FROM)[^'"`]*['"`]/i
  );
  if (sqlMatches.length === 0) {
    return {
      status: 'WARN',
      title: 'SQL Injection Protection',
      details: ['No SQL queries detected; ensure parameterized queries when DB layer is added']
    };
  }
  const risky = [];
  for (const entry of sqlMatches) {
    const content = readText(entry.file);
    if (/`[^`]*\$\{[^}]+\}[^`]*`/.test(content) || /\+\s*['"`]/.test(content)) {
      risky.push(entry);
    }
  }
  if (risky.length > 0) {
    return {
      status: 'FAIL',
      title: 'SQL Injection Protection',
      details: reportMatchList('Potential non-parameterized SQL', risky)
    };
  }
  return {
    status: 'PASS',
    title: 'SQL Injection Protection',
    details: ['SQL usage appears parameterized']
  };
}

function checkInputSizeDoS(serverFiles) {
  const rateLimit = checkServerRateLimit(serverFiles);
  const bodyLimit = checkRequestSizeLimit(serverFiles);
  if (rateLimit.status !== 'PASS' || bodyLimit.status !== 'PASS') {
    return {
      status: 'FAIL',
      title: 'DoS Controls (Rate/Size)',
      details: ['Missing server rate limiting and/or request size limits']
    };
  }
  return {
    status: 'PASS',
    title: 'DoS Controls (Rate/Size)',
    details: ['Server rate limits and request size limits detected']
  };
}

function checkMissingRateLimiting(serverFiles) {
  const rateLimit = checkServerRateLimit(serverFiles);
  if (rateLimit.status !== 'PASS') {
    return {
      status: 'FAIL',
      title: 'Missing Rate Limiting',
      details: ['No server-side rate limiting detected']
    };
  }
  return rateLimit;
}

function checkAuthBypass(serverFiles) {
  const auth = checkAuth(serverFiles);
  if (auth.status !== 'PASS') {
    return {
      status: 'FAIL',
      title: 'Authentication Bypass Risk',
      details: ['No server authentication enforcement detected']
    };
  }
  return auth;
}

function checkCspXss(serverFiles) {
  const csp = checkSecurityHeaders(serverFiles);
  if (csp.status !== 'PASS') {
    return {
      status: 'FAIL',
      title: 'XSS Mitigation via CSP',
      details: ['CSP not enforced on server responses']
    };
  }
  return csp;
}

function collectFiles() {
  const allFiles = listFiles(ROOT).filter((file) => JS_EXTS.has(path.extname(file)));
  const clientFiles = allFiles.filter((file) => toPosix(file).includes('/src/'));
  return { allFiles, clientFiles };
}

function run() {
  const { allFiles, clientFiles } = collectFiles();
  const serverFiles = getServerFiles();

  const checks = [
    checkSqlInjection(allFiles),
    checkXss(allFiles),
    checkCspXss(serverFiles),
    checkIdor(serverFiles),
    checkSecrets(allFiles),
    checkPackageAllowlist(),
    checkAuthBypass(serverFiles),
    checkResponseValidation(clientFiles),
    checkInputSizeDoS(serverFiles),
    checkEval(allFiles),
    checkInputValidation(serverFiles),
    checkMissingRateLimiting(serverFiles),
    checkOutdatedDepsTool(),
    checkInformationExposure(),
    checkLocalStorageCoupling(clientFiles),
    checkAiPolicy(allFiles),
    checkQaMap()
  ];

  console.log('Security QA Report');
  console.log(`Root: ${toPosix(ROOT)}`);
  console.log('');

  let hasFail = false;
  for (const check of checks) {
    if (check.status === 'FAIL') {
      hasFail = true;
    }
    console.log(`[${check.status}] ${check.title}`);
    for (const detail of check.details || []) {
      console.log(`- ${detail}`);
    }
    console.log('');
  }

  if (hasFail) {
    process.exit(1);
  }
}

run();
