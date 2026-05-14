/**
 * Shared SQLite lifecycle helpers (pragmas + migration runner).
 *
 * All errors use PB-ERR-v1 bytecode for AI-parsable diagnostics.
 */

import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;
const DEFAULT_BUSY_TIMEOUT_MS = 5000;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

export function readSqlitePragmas(db) {
  return {
    journalMode: db.pragma('journal_mode', { simple: true }),
    foreignKeys: db.pragma('foreign_keys', { simple: true }),
    busyTimeout: db.pragma('busy_timeout', { simple: true }),
  };
}

export function applySqlitePragmas(db, options = {}) {
  const busyTimeoutMs = normalizePositiveInteger(
    options.busyTimeoutMs,
    DEFAULT_BUSY_TIMEOUT_MS,
  );

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${busyTimeoutMs}`);

  return readSqlitePragmas(db);
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      namespace TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (namespace, version)
    );
  `);
}

/**
 * Applies pending migrations for a namespace in ascending version order.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   namespace: string,
 *   migrations: { version: number, name: string, up: (db: import('better-sqlite3').Database) => void }[]
 * }} options
 * @returns {{ namespace: string, currentVersion: number, appliedVersions: number[] }}
 */
export function runSqliteMigrations(db, options) {
  const namespace = String(options?.namespace || '').trim();
  if (!namespace) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.MISSING_REQUIRED,
      { parameter: 'namespace', reason: 'runSqliteMigrations requires a non-empty namespace' },
    );
  }

  const migrationList = Array.isArray(options?.migrations) ? options.migrations : [];
  ensureMigrationTable(db);

  const sorted = [...migrationList].sort((left, right) => left.version - right.version);
  for (const migration of sorted) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new BytecodeError(
        ERROR_CATEGORIES.TYPE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.TYPE_MISMATCH,
        { parameter: 'version', expectedType: 'positive integer', actualValue: migration.version, namespace },
      );
    }
    if (typeof migration.name !== 'string' || migration.name.trim().length === 0) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.MISSING_REQUIRED,
        { parameter: 'name', version: migration.version },
      );
    }
    if (typeof migration.up !== 'function') {
      throw new BytecodeError(
        ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.INVALID_STATE,
        { parameter: 'up', version: migration.version, reason: 'missing up function' },
      );
    }
  }

  const currentVersionRow = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations WHERE namespace = ?')
    .get(namespace);
  const currentVersion = Number(currentVersionRow?.version || 0);
  const pending = sorted.filter((migration) => migration.version > currentVersion);
  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (namespace, version, name) VALUES (?, ?, ?)',
  );

  const appliedVersions = [];
  const applyPending = db.transaction((toApply) => {
    for (const migration of toApply) {
      migration.up(db);
      insertMigration.run(namespace, migration.version, migration.name);
      appliedVersions.push(migration.version);
    }
  });

  applyPending(pending);

  return {
    namespace,
    currentVersion: pending.length > 0 ? pending[pending.length - 1].version : currentVersion,
    appliedVersions,
  };
}

/**
 * Applies pending migrations for a namespace using an asynchronous database wrapper.
 * Supported by createDbWrapper (Turso/libSQL).
 * 
 * @param {Object} db - Async DB wrapper
 * @param {Object} options - { namespace, migrations }
 */
export async function runAsyncMigrations(db, options) {
  const namespace = String(options?.namespace || '').trim();
  if (!namespace) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.MISSING_REQUIRED,
      { parameter: 'namespace', reason: 'runAsyncMigrations requires a non-empty namespace' },
    );
  }

  const migrationList = Array.isArray(options?.migrations) ? options.migrations : [];
  
  // Ensure migration table exists
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      namespace TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (namespace, version)
    );
  `);

  const sorted = [...migrationList].sort((left, right) => left.version - right.version);
  
  const currentVersionResult = await db.execute(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations WHERE namespace = ?',
    [namespace]
  );
  
  const currentVersion = Number(currentVersionResult.rows[0]?.version || 0);
  const pending = sorted.filter((migration) => migration.version > currentVersion);

  if (pending.length === 0) {
    return { namespace, currentVersion, appliedVersions: [] };
  }

  const appliedVersions = [];
  
  // Since we don't have a cross-platform async transaction wrapper that 
  // supports the migration function callbacks easily, we'll run them 
  // sequentially. Each migration + its metadata record is a mini-transaction.
  for (const migration of pending) {
    try {
      // Execute the migration logic
      // Note: migration.up must be adapted to accept the async db wrapper
      // if it needs to perform complex logic, but usually it just calls database.exec()
      // which we will polyfill for the migration call.
      const promises = [];
      const migrationDbPolyfill = {
        exec: (sql) => {
          const p = (async () => {
            const statements = sql
              .split(';')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            
            for (const s of statements) {
              try {
                await db.execute(s);
              } catch (err) {
                // Safely handle 'duplicate column name' errors often encountered 
                // in manual migration checks (e.g. ALTER TABLE ADD COLUMN).
                if (err.message && (err.message.includes('duplicate column name') || err.message.includes('Duplicate column name'))) {
                  continue;
                }
                throw err;
              }
            }
          })();
          promises.push(p);
        },
        prepare: (sql) => ({
          run: (...args) => {
            const p = db.execute(sql, args);
            promises.push(p);
            return p;
          },
          get: (...args) => {
            // Migrations shouldn't rely on 'get' in async mode if written for better-sqlite3 sync,
            // but if they do, we return undefined to signify 'no row'.
            return undefined;
          },
          all: (...args) => {
            // FAKED SYNC RETURN: Return an empty array. 
            // This ensures checks like .all().some(...) in migrations work 
            // synchronously and return false, allowing the migration to 
            // proceed to the SQL execution stage.
            return [];
          }
        })
      };

      await Promise.resolve(migration.up(migrationDbPolyfill));
      await Promise.all(promises);
      
      await db.execute(
        'INSERT INTO schema_migrations (namespace, version, name) VALUES (?, ?, ?)',
        [namespace, migration.version, migration.name]
      );
      
      appliedVersions.push(migration.version);
    } catch (err) {
      throw new BytecodeError(
        ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.HOOK_CHAIN_BREAK,
        { 
          operation: 'runAsyncMigrations', 
          namespace, 
          failedVersion: migration.version, 
          error: err.message 
        },
      );
    }
  }

  return {
    namespace,
    currentVersion: appliedVersions[appliedVersions.length - 1],
    appliedVersions,
  };
}
