import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { applySqlitePragmas, runSqliteMigrations } from '../db/sqlite.migrations.js';
import { createDbWrapper } from '../db/persistence.wrapper.js';
import { compileVerseToIR } from '../../core/shared/truesight/compiler/compileVerseToIR.js';
import { serializeVerseIR } from '../../core/shared/truesight/compiler/verseIRSerialization.js';
import {
  ABYSS_NEUTRAL_MULTIPLIER,
  classifyAbyssalState,
  computeAbyssalResonanceMultiplier,
  computeElapsedWholeDays,
  countAbyssWordOccurrences,
  decayAbyssUsageCount,
  extractAbyssWordSequence,
} from '../../core/lexicon.abyss.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ABYSS_DB_NAMESPACE = 'abyss';

const TURSO_URL = process.env.TURSO_ABYSS_DB_URL;
const TURSO_TOKEN = process.env.TURSO_ABYSS_DB_TOKEN;

const ABYSS_MIGRATIONS = [
  // ... (migrations remain same) ...
];

function createLogger(log) {
  if (log && typeof log === 'object') {
    return {
      info: typeof log.info === 'function' ? log.info.bind(log) : () => {},
      warn: typeof log.warn === 'function' ? log.warn.bind(log) : () => {},
      error: typeof log.error === 'function' ? log.error.bind(log) : () => {},
    };
  }

  return {
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };
}

function resolveDefaultAbyssDbPath() {
  if (typeof process.env.ABYSS_DB_PATH === 'string' && process.env.ABYSS_DB_PATH.trim()) {
    return path.resolve(process.env.ABYSS_DB_PATH.trim());
  }
  let dataDir = PROJECT_ROOT;
  if (process.env.NODE_ENV === 'production') {
    // Prefer baked-in /app/data if it exists, else fallback to /var/data (legacy Render)
    dataDir = existsSync('/app/data') ? '/app/data' : '/var/data';
  }
  return path.join(dataDir, 'abyss.sqlite');
}

function normalizeIdentifier(value) {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function toTimestampMs(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function buildTraceId(occurredAtMs) {
  return `combat-${occurredAtMs}-${randomUUID().slice(0, 8)}`;
}

function serializeVerseIRForAbyss(verseIR) {
  return serializeVerseIR(verseIR);
}

function buildNeutralSignal(tokenCount, source = 'neutral_fallback') {
  return {
    averageMultiplier: ABYSS_NEUTRAL_MULTIPLIER,
    tokenCount,
    tokenDetails: [],
    source,
  };
}

export async function createLexiconAbyssService(options = {}) {
  const log = createLogger(options.log);
  const dbPath = options.dbPath ? path.resolve(options.dbPath) : resolveDefaultAbyssDbPath();

  let db = null;
  let rawDb = null;
  let closed = false;
  let dbState = {
    currentVersion: 0,
    pragmas: null,
  };

  try {
    if (TURSO_URL) {
      log.info?.(`[DB:abyss] Connecting to Turso: ${TURSO_URL}`);
      db = createDbWrapper({
        type: 'libsql',
        config: { url: TURSO_URL, authToken: TURSO_TOKEN }
      });
      dbState.currentVersion = ABYSS_MIGRATIONS.length > 0 
        ? ABYSS_MIGRATIONS[ABYSS_MIGRATIONS.length - 1].version 
        : 0;
    } else {
      mkdirSync(path.dirname(dbPath), { recursive: true });
      rawDb = new Database(dbPath);
      dbState.pragmas = applySqlitePragmas(rawDb, {
        busyTimeoutMs: process.env.ABYSS_DB_BUSY_TIMEOUT_MS,
      });
      const migrationState = runSqliteMigrations(rawDb, {
        namespace: ABYSS_DB_NAMESPACE,
        migrations: ABYSS_MIGRATIONS,
      });
      dbState = {
        ...dbState,
        ...migrationState,
      };
      
      db = createDbWrapper({ type: 'better-sqlite3', db: rawDb });
      
      log.info?.(
        `[DB:abyss] Connected. version=${dbState.currentVersion}, journal=${dbState.pragmas?.journalMode}, busy_timeout=${dbState.pragmas?.busyTimeout}`,
      );
    }
  } catch (error) {
    db = null;
    log.warn?.({ err: error, dbPath }, '[DB:abyss] Failed to initialize. Falling back to neutral resonance.');
  }

  async function resolveResonance({ text = '', verseIR = null, evaluatedAt = Date.now() } = {}) {
    const resolvedVerseIR = verseIR || compileVerseToIR(text, { mode: 'balanced' });
    const tokenSequence = extractAbyssWordSequence(resolvedVerseIR);
    const tokenCount = tokenSequence.length;

    if (tokenCount === 0) {
      return buildNeutralSignal(0, db ? 'no_tokens' : 'unavailable');
    }

    const counts = countAbyssWordOccurrences(tokenSequence);
    const occurredAtMs = toTimestampMs(evaluatedAt);
    const tokenDetails = [];

    for (const [word, occurrences] of [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
      let row = null;
      if (db) {
        const result = await db.execute(`
          SELECT word, usage_count_7d, last_used, current_multiplier
          FROM word_entropy
          WHERE word = ?
        `, [word]);
        row = result.rows[0];
      }
      
      const snapshot = computeAbyssalResonanceMultiplier({
        usageCount7d: row?.usage_count_7d || 0,
        lastUsedAt: row?.last_used || null,
        evaluatedAt: occurredAtMs,
      });

      tokenDetails.push({
        token: word,
        occurrences,
        usageCount7d: Math.max(0, Number(row?.usage_count_7d) || 0),
        decayedUsageCount: snapshot.decayedUsageCount,
        lastUsedAt: row?.last_used || null,
        multiplier: snapshot.multiplier,
        state: classifyAbyssalState(snapshot.multiplier),
      });
    }

    const weightedTotal = tokenDetails.reduce(
      (sum, detail) => sum + (detail.multiplier * detail.occurrences),
      0,
    );

    return {
      averageMultiplier: Number((weightedTotal / tokenCount).toFixed(3)),
      tokenCount,
      tokenDetails,
      source: db ? 'public_combat_history' : 'unavailable',
    };
  }

  function createHeuristicProvider() {
    return async (doc) => await resolveResonance({
      text: doc?.raw || '',
      evaluatedAt: Date.now(),
    });
  }

  async function recordCombatResolved({
    traceId = null,
    text = '',
    verseIR = null,
    scoreResponse = null,
    playerId = null,
    opponentId = null,
    occurredAt = Date.now(),
  } = {}) {
    const occurredAtMs = toTimestampMs(occurredAt);
    const timestamp = new Date(occurredAtMs).toISOString();
    const combatId = normalizeIdentifier(traceId) || buildTraceId(occurredAtMs);
    const resolvedVerseIR = verseIR || compileVerseToIR(text, { mode: 'balanced' });
    const counts = countAbyssWordOccurrences(extractAbyssWordSequence(resolvedVerseIR));

    if (!db) {
      return combatId;
    }

    const entries = [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    const statements = [];

    for (const [word, occurrences] of entries) {
      const result = await db.execute(`
        SELECT last_used, usage_count_7d FROM word_entropy WHERE word = ?
      `, [word]);
      const existing = result.rows[0];
      
      const elapsedDays = existing?.last_used
        ? computeElapsedWholeDays(existing.last_used, occurredAtMs)
        : 7;
      const decayedUsage = decayAbyssUsageCount(existing?.usage_count_7d || 0, elapsedDays);
      const usageCount7d = Math.max(0, Math.round(decayedUsage + occurrences));
      const multiplier = computeAbyssalResonanceMultiplier({
        usageCount7d,
        lastUsedAt: timestamp,
        evaluatedAt: occurredAtMs,
      }).multiplier;

      statements.push({
        sql: `INSERT INTO word_entropy (word, usage_count_7d, last_used, current_multiplier)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(word) DO UPDATE SET
                usage_count_7d = excluded.usage_count_7d,
                last_used = excluded.last_used,
                current_multiplier = excluded.current_multiplier`,
        args: [word, usageCount7d, timestamp, multiplier]
      });
    }

    statements.push({
      sql: `INSERT INTO akashic_replays (
              combat_id, timestamp, player_id, opponent_id, verse_ir_json, score_response_json
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        combatId,
        timestamp,
        normalizeIdentifier(playerId),
        normalizeIdentifier(opponentId),
        JSON.stringify(serializeVerseIRForAbyss(resolvedVerseIR)),
        JSON.stringify({
          ...(scoreResponse && typeof scoreResponse === 'object' ? scoreResponse : {}),
          traceId: combatId,
        })
      ]
    });

    await db.batch(statements);
    return combatId;
  }

  function getStatus() {
    return {
      path: dbPath,
      available: Boolean(db),
      version: dbState.currentVersion,
      pragmas: dbState.pragmas,
    };
  }

  async function close() {
    if (closed) return;
    closed = true;
    if (db) {
      await db.close();
      log.info?.('[DB:abyss] Connection closed.');
    }
  }

  return {
    resolveResonance,
    createHeuristicProvider,
    recordCombatResolved,
    getStatus,
    close,
  };
}
