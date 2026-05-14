import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

function summarize(report) {
  if (!report || typeof report !== 'object') {
    return { total: 0, summary: 'No audit data found.' };
  }
  const meta = report.metadata || {};
  const vulnerabilities = meta.vulnerabilities || {};
  const total = Object.values(vulnerabilities).reduce((sum, count) => sum + count, 0);
  const summary = Object.entries(vulnerabilities)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${severity}: ${count}`)
    .join(', ');
  return { total, summary: summary || 'No known vulnerabilities reported.' };
}

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true
});

if (result.error) {
  console.error('Security Audit Failed: Unable to run npm audit.');
  console.error(result.error.message);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch (err) {
  console.error('Security Audit Failed: Invalid npm audit output.');
  console.error(result.stdout || result.stderr);
  process.exit(2);
}

if (report.error && report.error.code) {
  console.error(`Security Audit Error: ${report.error.code}`);
  if (report.error.summary) {
    console.error(report.error.summary);
  }
  process.exit(2);
}

const { total, summary } = summarize(report);

if (total > 0) {
  console.error('Security Audit Failed: Vulnerabilities detected.');
  console.error(summary);
  process.exit(1);
}

console.log('Security Audit Passed: No known vulnerabilities reported.');
