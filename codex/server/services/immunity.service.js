/**
 * IMMUNITY SERVICE
 * 
 * Server-side orchestrator for the Scholomance Immune System.
 */

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { scanInnate } from '../../core/immunity/innate.scanner.js';
import { scanAdaptive } from '../../core/immunity/adaptive.scanner.js';
import { scanProtocol, harvestAsyncSurface } from '../../core/immunity/protocol.scanner.js';
import { INNATE_RULES } from '../../core/immunity/innate.rules.js';
import { PATHOGEN_REGISTRY } from '../../core/immunity/pathogenRegistry.js';
import {
  BytecodeError,
  decodeBytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../../core/pixelbrain/bytecode-error.js';

const RULESET_VERSION = '1.1.0';
const MAX_MEMORY_ROWS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROTOCOL_PATHOGEN_ID = 'pathogen.async-protocol-drift';
const VALID_OVERRIDE_LAYERS = new Set(['innate', 'adaptive', 'protocol']);
const VALID_WORKFLOW_EVENTS = new Set(['merge', 'pr', 'refactor', 'aiCommit']);

function createLogger(log) {
  if (log && typeof log === 'object') {
    return {
      info: typeof log.info === 'function' ? log.info.bind(log) : () => {},
      warn: typeof log.warn === 'function' ? log.warn.bind(log) : () => {},
      error: typeof log.error === 'function' ? log.error.bind(log) : () => {},
    };
  }

  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function generateId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function toIsoTimestamp(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function trimMemoryRows(rows) {
  if (rows.length > MAX_MEMORY_ROWS) {
    rows.splice(0, rows.length - MAX_MEMORY_ROWS);
  }
}

function isExecutableDb(candidate) {
  return Boolean(candidate && typeof candidate.execute === 'function');
}

function normalizeRequiredString(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMMUNITY,
      ERROR_CODES.MISSING_REQUIRED,
      { field, service: 'immunity' },
    );
  }
  return normalized;
}

function normalizeLayer(value) {
  const normalized = normalizeRequiredString(value, 'layer');
  if (!VALID_OVERRIDE_LAYERS.has(normalized)) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMMUNITY,
      ERROR_CODES.INVALID_ENUM,
      {
        field: 'layer',
        providedValue: normalized,
        allowedValues: [...VALID_OVERRIDE_LAYERS],
      },
    );
  }
  return normalized;
}

function summarizeInnateViolation(violation) {
  return {
    ruleId: violation.ruleId,
    name: violation.name,
    severity: violation.severity,
    bytecode: violation.bytecode,
    repairKey: violation.repair?.key || null,
    summary: violation.summary,
  };
}

function summarizeAdaptiveViolation(violation) {
  return {
    pathogenId: violation.pathogenId,
    name: violation.name,
    score: violation.score,
    threshold: violation.threshold,
    bytecode: violation.bytecode,
    entry: violation.entry,
    summary: violation.summary,
  };
}

function summarizeProtocolViolation(violation) {
  return {
    ruleId: violation.ruleId,
    pathogenId: PROTOCOL_PATHOGEN_ID,
    name: violation.name,
    severity: violation.severity,
    bytecode: violation.bytecode,
    context: violation.context,
    summary: violation.summary,
  };
}

function parseJsonObject(value, fallback = null) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeScanEventRow(row) {
  const payload = parseJsonObject(row?.result_json, {});
  const timestamp = row?.timestamp || payload.timestamp || toIsoTimestamp();
  return {
    ...payload,
    id: row?.id || payload.id || generateId('scan'),
    filePath: row?.file_path || payload.filePath || '',
    timestamp,
    timestampMs: Date.parse(timestamp) || Date.now(),
    durationMs: Number(row?.duration_ms ?? payload.durationMs ?? 0),
    counts: {
      innate: Number(row?.innate_count ?? payload.counts?.innate ?? 0),
      adaptive: Number(row?.adaptive_count ?? payload.counts?.adaptive ?? 0),
      protocol: Number(row?.protocol_count ?? payload.counts?.protocol ?? 0),
      total: Number(row?.total_count ?? payload.counts?.total ?? 0),
    },
    blocked: Boolean(Number(row?.blocked ?? (payload.blocked ? 1 : 0))),
    layersRun: {
      innate: payload.layersRun?.innate !== false,
      adaptive: Boolean(payload.layersRun?.adaptive),
      protocol: Boolean(payload.layersRun?.protocol),
    },
    timingsMs: {
      innate: Number(payload.timingsMs?.innate ?? 0),
      adaptive: Number(payload.timingsMs?.adaptive ?? 0),
      protocol: Number(payload.timingsMs?.protocol ?? 0),
    },
    violations: {
      innate: Array.isArray(payload.violations?.innate) ? payload.violations.innate : [],
      adaptive: Array.isArray(payload.violations?.adaptive) ? payload.violations.adaptive : [],
      protocol: Array.isArray(payload.violations?.protocol) ? payload.violations.protocol : [],
    },
  };
}

function normalizeOverrideRow(row) {
  return {
    id: row.id,
    sha: row.sha,
    file: row.file,
    layer: row.layer,
    pathogenId: row.pathogen_id,
    reason: row.reason,
    authority: row.authority,
    timestamp: row.timestamp,
    accepter: row.accepter_agent_id,
  };
}

function buildLayerStats(events, layer) {
  const layerEvents = events.filter((event) => event.layersRun?.[layer]);
  const scans = layerEvents.length;
  const blocks = layerEvents.filter((event) => Number(event.counts?.[layer] || 0) > 0).length;
  const totalLatency = layerEvents.reduce((sum, event) => sum + Number(event.timingsMs?.[layer] || 0), 0);

  return {
    scans,
    blocks,
    avgLatencyMs: scans > 0 ? Number((totalLatency / scans).toFixed(2)) : 0,
  };
}

function buildLastBlock(events, layer) {
  const hit = [...events]
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .find((event) => Number(event.counts?.[layer] || 0) > 0);

  if (!hit) return null;

  const violation = hit.violations?.[layer]?.[0] || null;
  return {
    id: hit.id,
    file: hit.filePath,
    layer,
    pathogenId: violation?.pathogenId || violation?.ruleId || null,
    severity: violation?.severity || null,
    bytecode: violation?.bytecode || null,
    timestamp: hit.timestamp,
  };
}

function buildInnateHitCounts(events) {
  const counts = new Map();
  for (const event of events) {
    for (const violation of event.violations?.innate || []) {
      const ruleId = violation.ruleId;
      if (ruleId) counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
    }
  }
  return counts;
}

function buildPathogenHits(events) {
  const hits = new Map();
  for (const event of events) {
    const adaptive = event.violations?.adaptive || [];
    const protocol = event.violations?.protocol || [];
    for (const violation of [...adaptive, ...protocol]) {
      const pathogenId = violation.pathogenId;
      if (!pathogenId) continue;
      const current = hits.get(pathogenId) || { hitCount: 0, lastHitAt: null };
      current.hitCount += 1;
      if (!current.lastHitAt || Date.parse(event.timestamp) > Date.parse(current.lastHitAt)) {
        current.lastHitAt = event.timestamp;
      }
      hits.set(pathogenId, current);
    }
  }
  return hits;
}

function throwScanViolation(violation, filePath) {
  const decoded = decodeBytecodeError(violation?.bytecode);
  if (decoded?.valid) {
    throw new BytecodeError(
      decoded.category,
      decoded.severity,
      decoded.moduleId,
      decoded.errorCode,
      decoded.context,
    );
  }

  throw new BytecodeError(
    ERROR_CATEGORIES.STATE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.IMMUNE_INNATE_BLOCK,
    {
      path: filePath,
      ruleId: violation?.ruleId,
      pathogenId: violation?.pathogenId,
      reason: 'scan violation lacked decodable bytecode',
    },
  );
}

export async function createImmunityService({ log, db } = {}) {
  const logger = createLogger(log);
  const hasDb = isExecutableDb(db);
  const memoryScans = [];
  const memoryOverrides = [];
  const workflow = {
    triggeredEvents: { merge: 0, pr: 0, refactor: 0, aiCommit: 0 },
    activeAgents: [],
  };

  // Layer 3 surface cache: async function names harvested from the impl
  // modules of interest. Lazily populated by configureProtocolSurface so
  // the service stays decoupled from any specific subsystem at boot time.
  let protocolAsyncSurface = new Set();
  let protocolCallerPrefixes = [];
  let persistenceReady = false;

  async function ensurePersistence() {
    if (!hasDb || persistenceReady) return persistenceReady;
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS immunity_scan_events (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          duration_ms REAL NOT NULL DEFAULT 0,
          innate_count INTEGER NOT NULL DEFAULT 0,
          adaptive_count INTEGER NOT NULL DEFAULT 0,
          protocol_count INTEGER NOT NULL DEFAULT 0,
          total_count INTEGER NOT NULL DEFAULT 0,
          blocked INTEGER NOT NULL DEFAULT 0,
          result_json TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_immunity_scan_events_timestamp
        ON immunity_scan_events(timestamp)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS immunity_override_audit (
          id TEXT PRIMARY KEY,
          sha TEXT NOT NULL,
          file TEXT NOT NULL,
          layer TEXT NOT NULL,
          pathogen_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          authority TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          accepter_agent_id TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_immunity_override_timestamp
        ON immunity_override_audit(timestamp)
      `);
      persistenceReady = true;
    } catch (error) {
      logger.warn({ err: error }, '[Immunity] Persistence unavailable; using memory telemetry.');
      persistenceReady = false;
    }
    return persistenceReady;
  }

  async function persistScanEvent(event) {
    memoryScans.push(event);
    trimMemoryRows(memoryScans);

    if (!(await ensurePersistence())) return;
    try {
      await db.execute(`
        INSERT INTO immunity_scan_events (
          id, file_path, timestamp, duration_ms, innate_count, adaptive_count,
          protocol_count, total_count, blocked, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        event.id,
        event.filePath,
        event.timestamp,
        event.durationMs,
        event.counts.innate,
        event.counts.adaptive,
        event.counts.protocol,
        event.counts.total,
        event.blocked ? 1 : 0,
        JSON.stringify(event),
      ]);
    } catch (error) {
      logger.warn({ err: error, scanId: event.id }, '[Immunity] Failed to persist scan telemetry.');
    }
  }

  async function loadScanEventsSince(timestampMs) {
    const sinceIso = toIsoTimestamp(timestampMs);
    if (await ensurePersistence()) {
      try {
        const result = await db.execute(`
          SELECT *
          FROM immunity_scan_events
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `, [sinceIso]);
        return result.rows.map(normalizeScanEventRow);
      } catch (error) {
        logger.warn({ err: error }, '[Immunity] Failed to load persisted scan telemetry.');
      }
    }

    return memoryScans
      .filter((event) => event.timestampMs >= timestampMs)
      .sort((left, right) => right.timestampMs - left.timestampMs);
  }

  async function persistOverride(auditRow) {
    memoryOverrides.push(auditRow);
    trimMemoryRows(memoryOverrides);

    if (!(await ensurePersistence())) return;
    try {
      await db.execute(`
        INSERT INTO immunity_override_audit (
          id, sha, file, layer, pathogen_id, reason, authority, timestamp, accepter_agent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        auditRow.id,
        auditRow.sha,
        auditRow.file,
        auditRow.layer,
        auditRow.pathogenId,
        auditRow.reason,
        auditRow.authority,
        auditRow.timestamp,
        auditRow.accepter,
      ]);
    } catch (error) {
      logger.warn({ err: error, auditId: auditRow.id }, '[Immunity] Failed to persist override audit.');
    }
  }

  async function loadOverridesSince(timestampMs) {
    const sinceIso = toIsoTimestamp(timestampMs);
    if (await ensurePersistence()) {
      try {
        const result = await db.execute(`
          SELECT *
          FROM immunity_override_audit
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `, [sinceIso]);
        return result.rows.map(normalizeOverrideRow);
      } catch (error) {
        logger.warn({ err: error }, '[Immunity] Failed to load override audit.');
      }
    }

    return memoryOverrides
      .filter((row) => (Date.parse(row.timestamp) || 0) >= timestampMs)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  }

  await ensurePersistence();

  return {
    /**
     * Configure the Layer 3 (protocol) surface. Caller passes the impl
     * modules whose async functions should be tracked, plus the identifier
     * prefixes scanFile should inspect (e.g. ['collabPersistence',
     * 'collabService']). Subsequent scanFile calls run the protocol layer.
     */
    configureProtocolSurface({ implPaths, callerPrefixes = [] } = {}) {
      const paths = Array.isArray(implPaths) ? implPaths.filter((p) => typeof p === 'string') : [];
      protocolAsyncSurface = harvestAsyncSurface(paths);
      protocolCallerPrefixes = Array.isArray(callerPrefixes)
        ? callerPrefixes.filter((prefix) => typeof prefix === 'string' && prefix.trim()).map((prefix) => prefix.trim())
        : [];
      logger.info({ size: protocolAsyncSurface.size, callerPrefixes: protocolCallerPrefixes }, '[Immunity] Protocol surface configured.');
      return { surfaceSize: protocolAsyncSurface.size };
    },

    /**
     * Executes a full multi-layer scan on a file.
     */
    async scanFile(content, filePath, options = {}) {
      const { runAdaptive = false, runProtocol = true, throwOnError = false } = options;
      const source = typeof content === 'string' ? content : '';
      const path = normalizeRequiredString(filePath, 'filePath');
      const startedAt = performance.now();
      const timestamp = toIsoTimestamp();
      const timingsMs = { innate: 0, adaptive: 0, protocol: 0 };
      const layersRun = { innate: true, adaptive: false, protocol: false };

      logger.info({ filePath: path }, '[Immunity] Initiating scan.');

      const innateStartedAt = performance.now();
      const innateViolations = scanInnate(source, path);
      timingsMs.innate = Number((performance.now() - innateStartedAt).toFixed(2));

      // Heuristic: Layer 1 flags trigger Layer 2 (Adaptive)
      let adaptiveViolations = [];
      if (runAdaptive || innateViolations.length > 0) {
        layersRun.adaptive = true;
        const adaptiveStartedAt = performance.now();
        adaptiveViolations = await scanAdaptive(source);
        timingsMs.adaptive = Number((performance.now() - adaptiveStartedAt).toFixed(2));
      }

      // Layer 3 (Protocol) runs whenever a surface is configured. It is cheap
      // and structural, so default-on; callers can opt out via runProtocol.
      let protocolViolations = [];
      if (runProtocol && protocolAsyncSurface.size > 0) {
        layersRun.protocol = true;
        const protocolStartedAt = performance.now();
        protocolViolations = scanProtocol(source, path, {
          asyncSurface: protocolAsyncSurface,
          callerPrefixes: protocolCallerPrefixes,
        });
        timingsMs.protocol = Number((performance.now() - protocolStartedAt).toFixed(2));
      }

      const result = {
        filePath: path,
        innate: innateViolations.map(v => ({
          ...v,
          summary: `[${v.severity}] ${v.name} (${v.ruleId}): ${v.repair.title}`,
        })),
        adaptive: adaptiveViolations.map(v => ({
          ...v,
          summary: `[ADAPTIVE] ${v.name}: Similarity to known pathogen (score: ${v.score.toFixed(2)})`,
        })),
        protocol: protocolViolations.map(v => ({
          ...v,
          summary: `[PROTOCOL] ${v.name} at ${path}:${v.context.line}: missing await on ${v.context.callExpr}`,
        })),
        timestamp,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        timingsMs,
        layersRun,
      };

      const totalCount = innateViolations.length + adaptiveViolations.length + protocolViolations.length;
      result.totalViolations = totalCount;
      result.blocked = totalCount > 0;

      await persistScanEvent({
        id: generateId('scan'),
        filePath: path,
        timestamp,
        timestampMs: Date.parse(timestamp) || Date.now(),
        durationMs: result.durationMs,
        counts: {
          innate: innateViolations.length,
          adaptive: adaptiveViolations.length,
          protocol: protocolViolations.length,
          total: totalCount,
        },
        blocked: totalCount > 0,
        layersRun,
        timingsMs,
        violations: {
          innate: result.innate.map(summarizeInnateViolation),
          adaptive: result.adaptive.map(summarizeAdaptiveViolation),
          protocol: result.protocol.map(summarizeProtocolViolation),
        },
      });

      if (throwOnError && totalCount > 0) {
        const first = innateViolations[0] || adaptiveViolations[0] || protocolViolations[0];
        throwScanViolation(first, path);
      }

      return result;
    },

    /**
     * Record an explicit sovereign override. Authority validation belongs to
     * the route/auth layer; this service records the immutable audit row.
     */
    async recordOverride(input = {}) {
      const auditRow = {
        id: generateId('override'),
        sha: normalizeRequiredString(input.sha, 'sha'),
        file: normalizeRequiredString(input.file || input.filePath, 'file'),
        layer: normalizeLayer(input.layer),
        pathogenId: normalizeRequiredString(input.pathogenId || input.ruleId, 'pathogenId'),
        reason: normalizeRequiredString(input.reason, 'reason'),
        authority: normalizeRequiredString(input.authority, 'authority'),
        timestamp: toIsoTimestamp(input.timestamp),
        accepter: input.accepter || input.accepter_agent_id || null,
      };

      await persistOverride(auditRow);
      return { auditId: auditRow.id, accepted: true };
    },

    /**
     * Increment workflow counters that the dashboard consumes. This is kept
     * in-memory until the workflow event bus is wired into persistence.
     */
    recordWorkflowEvent(kind, agent = null) {
      if (!VALID_WORKFLOW_EVENTS.has(kind)) {
        throw new BytecodeError(
          ERROR_CATEGORIES.VALUE,
          ERROR_SEVERITY.CRIT,
          MODULE_IDS.IMMUNITY,
          ERROR_CODES.INVALID_ENUM,
          {
            field: 'kind',
            providedValue: kind,
            allowedValues: [...VALID_WORKFLOW_EVENTS],
          },
        );
      }

      workflow.triggeredEvents[kind] += 1;
      if (agent?.id) {
        const existing = workflow.activeAgents.find((entry) => entry.id === agent.id);
        if (existing) {
          existing.commitsLast7d = Number(agent.commitsLast7d ?? existing.commitsLast7d ?? 0);
          existing.pathogensIntroduced = Number(agent.pathogensIntroduced ?? existing.pathogensIntroduced ?? 0);
        } else {
          workflow.activeAgents.push({
            id: String(agent.id),
            commitsLast7d: Number(agent.commitsLast7d || 0),
            pathogensIntroduced: Number(agent.pathogensIntroduced || 0),
          });
        }
      }

      return { triggeredEvents: { ...workflow.triggeredEvents } };
    },

    /**
     * Retrieves the global status of the immune system.
     */
    async getStatus() {
      const now = Date.now();
      const events24h = await loadScanEventsSince(now - DAY_MS);
      const overrides30d = await loadOverridesSince(now - (30 * DAY_MS));
      const innateHits = buildInnateHitCounts(events24h);
      const pathogenHits = buildPathogenHits(events24h);
      const adaptivePathogens = PATHOGEN_REGISTRY.filter((pathogen) => pathogen.layer !== 'protocol');
      const protocolPathogen = PATHOGEN_REGISTRY.find((pathogen) => pathogen.id === PROTOCOL_PATHOGEN_ID);

      return {
        innate: {
          enabled: true,
          rulesetVersion: RULESET_VERSION,
          rules: INNATE_RULES.map((r) => ({
            id: r.id,
            name: r.name,
            pattern: r.id,
            hitCount: innateHits.get(r.id) || 0,
            category: r.category,
            errorCode: r.errorCode,
            severity: r.severity,
            repairKey: r.repairKey,
          })),
          last24h: buildLayerStats(events24h, 'innate'),
          lastBlock: buildLastBlock(events24h, 'innate'),
        },
        adaptive: {
          enabled: true,
          pathogenCount: adaptivePathogens.length,
          pathogens: adaptivePathogens.map((pathogen) => {
            const hit = pathogenHits.get(pathogen.id) || { hitCount: 0, lastHitAt: null };
            return {
              id: pathogen.id,
              name: pathogen.name,
              threshold: pathogen.threshold,
              hitCount: hit.hitCount,
              lastHitAt: hit.lastHitAt,
              encyclopediaEntry: pathogen.encyclopediaEntry,
            };
          }),
          last24h: buildLayerStats(events24h, 'adaptive'),
        },
        protocol: {
          enabled: protocolAsyncSurface.size > 0,
          surfaceSize: protocolAsyncSurface.size,
          callerPrefixes: protocolCallerPrefixes,
          pathogen: protocolPathogen
            ? {
                id: protocolPathogen.id,
                name: protocolPathogen.name,
                encyclopediaEntry: protocolPathogen.encyclopediaEntry,
                hitCount: pathogenHits.get(PROTOCOL_PATHOGEN_ID)?.hitCount || 0,
                lastHitAt: pathogenHits.get(PROTOCOL_PATHOGEN_ID)?.lastHitAt || null,
              }
            : null,
          last24h: buildLayerStats(events24h, 'protocol'),
        },
        override: {
          last30d: overrides30d,
        },
        workflow: {
          triggeredEvents: { ...workflow.triggeredEvents },
          activeAgents: workflow.activeAgents.map((agent) => ({ ...agent })),
        },
      };
    },
  };
}
