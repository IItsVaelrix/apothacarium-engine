/**
 * DIAGNOSTIC PERSISTENCE LAYER
 *
 * Writes DiagnosticReport JSON to .codex/diagnostic-reports/{reportId}.json
 * and applies the white-paper §10 Logarithmic Pruning policy:
 *
 *   - All reports kept for 24h
 *   - One daily representative kept from 24h–30d
 *   - One weekly representative kept beyond 30d
 *
 * The reportId encodes the generation timestamp (PB-DIAG-v1-{ms}-{rand4}),
 * so pruning can reason about retention windows without reading file contents.
 *
 * Determinism:
 *   - writeReport() output path is a pure function of (rootDir, reportId)
 *   - pruneReports({ now, files }) is a pure function: given a fixed clock and
 *     file list with mtimes, the kept-set is identical across runs
 *
 * Reference: BYTECODE_HEALTH_WHITE_PAPER §10
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DEFAULT_REPORTS_DIR = '.codex/diagnostic-reports';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

// Retention windows
export const RETENTION = Object.freeze({
  RECENT_WINDOW_MS: 24 * HOUR_MS,         // <24h: keep all
  DAILY_WINDOW_MS: 30 * DAY_MS,            // 24h–30d: one per day
  // Beyond 30d: one per ISO-week, indefinitely
});

/**
 * Resolve the absolute path for a report's JSON file.
 *
 * @param {object} params
 * @param {string} params.rootDir - Project root
 * @param {string} params.reportId - PB-DIAG-v1-{ms}-{rand4}
 * @returns {string}
 */
export function reportPath({ rootDir, reportId }) {
  return path.join(rootDir, DEFAULT_REPORTS_DIR, `${reportId}.json`);
}

/**
 * Persist a diagnostic report. Creates the reports directory if missing.
 * Returns the absolute path written.
 *
 * @param {object} params
 * @param {string} params.rootDir
 * @param {object} params.report - generateDiagnosticReport() output
 * @returns {Promise<string>}
 */
export async function writeReport({ rootDir, report }) {
  if (!report?.reportId) {
    throw new Error('writeReport: report must have a reportId');
  }
  const dir = path.join(rootDir, DEFAULT_REPORTS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const out = reportPath({ rootDir, reportId: report.reportId });
  await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return out;
}

/**
 * Read a report by ID. Returns null if not found.
 *
 * @param {object} params
 * @param {string} params.rootDir
 * @param {string} params.reportId
 * @returns {Promise<object|null>}
 */
export async function readReport({ rootDir, reportId }) {
  try {
    const raw = await fs.readFile(reportPath({ rootDir, reportId }), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Extract the generation epoch-ms from a report ID.
 *
 * @param {string} reportId
 * @returns {number|null}
 */
export function timestampFromReportId(reportId) {
  const m = /^PB-DIAG-v1-(\d+)-/.exec(String(reportId || ''));
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Compute the day bucket (YYYY-MM-DD) for a given epoch-ms in UTC.
 * Daily-window pruning keeps the newest report per day bucket.
 *
 * @param {number} ms
 * @returns {string}
 */
function dayBucket(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Compute the ISO-week bucket (YYYY-Www) for a given epoch-ms in UTC.
 * Weekly-window pruning keeps the newest report per week bucket.
 *
 * @param {number} ms
 * @returns {string}
 */
function weekBucket(ms) {
  const d = new Date(Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / DAY_MS) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Decide which reports to keep and which to prune, given a clock and a list
 * of report files. Pure — no I/O.
 *
 * @param {object} params
 * @param {number} params.now - Current epoch-ms
 * @param {Array<{name: string, ts: number}>} params.files - Reports, with name (filename) and ts (epoch-ms)
 * @returns {{ keep: string[], prune: string[] }}
 */
export function planPruning({ now, files }) {
  const keep = new Set();
  const dailyKept = new Map();   // bucket -> { name, ts }
  const weeklyKept = new Map();  // bucket -> { name, ts }

  // Sort newest-first so first encounter wins for daily/weekly
  const sorted = [...files].sort((a, b) => b.ts - a.ts);

  for (const f of sorted) {
    const age = now - f.ts;
    if (age < RETENTION.RECENT_WINDOW_MS) {
      keep.add(f.name);
    } else if (age < RETENTION.DAILY_WINDOW_MS) {
      const bucket = dayBucket(f.ts);
      const existing = dailyKept.get(bucket);
      if (!existing || f.ts > existing.ts) {
        dailyKept.set(bucket, f);
      }
    } else {
      const bucket = weekBucket(f.ts);
      const existing = weeklyKept.get(bucket);
      if (!existing || f.ts > existing.ts) {
        weeklyKept.set(bucket, f);
      }
    }
  }

  for (const f of dailyKept.values()) keep.add(f.name);
  for (const f of weeklyKept.values()) keep.add(f.name);

  const prune = files.map(f => f.name).filter(n => !keep.has(n));
  return { keep: [...keep].sort(), prune: prune.sort() };
}

/**
 * Apply the Logarithmic Pruning policy to .codex/diagnostic-reports/.
 * Inspects every {reportId}.json, plans the prune set, deletes pruned files.
 *
 * @param {object} params
 * @param {string} params.rootDir
 * @param {number} [params.now] - Defaults to current wall-clock; EXEMPT
 * @returns {Promise<{ keep: string[], pruned: string[] }>}
 */
export async function pruneReports({ rootDir, now = Date.now() }) { // EXEMPT — default arg only
  const dir = path.join(rootDir, DEFAULT_REPORTS_DIR);
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return { keep: [], pruned: [] };
    throw err;
  }

  const files = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const reportId = name.replace(/\.json$/, '');
    const ts = timestampFromReportId(reportId);
    if (ts === null) continue;
    files.push({ name, ts });
  }

  const { keep, prune } = planPruning({ now, files });

  for (const name of prune) {
    await fs.unlink(path.join(dir, name)).catch(() => {});
  }

  return { keep, pruned: prune };
}
