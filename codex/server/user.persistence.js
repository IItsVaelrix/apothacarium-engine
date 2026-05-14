import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySqlitePragmas, runSqliteMigrations, runAsyncMigrations } from './db/sqlite.migrations.js';
import { createDbWrapper } from './db/persistence.wrapper.js';
import {
  DEFAULT_WORLD_ENTITIES,
  DEFAULT_WORLD_ROOMS,
} from '../core/world.entity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const TURSO_URL = process.env.TURSO_USER_DB_URL;
const TURSO_TOKEN = process.env.TURSO_USER_DB_TOKEN;

const DB_PATH = process.env.USER_DB_PATH
  ? path.resolve(process.env.USER_DB_PATH)
  : path.join(ROOT, 'scholomance_user.sqlite');

const USER_DB_NAMESPACE = 'user';
const IS_MCP_BRIDGE_PROCESS = process.argv.some((arg) =>
  typeof arg === 'string' && (
    arg.includes('codex/server/collab/mcp-bridge.js') ||
    arg.includes('codex\\server\\collab\\mcp-bridge.js')
  ),
);

function logUserDbInfo(message) {
  // MCP stdio requires stdout to stay protocol-clean during initialization.
  if (IS_MCP_BRIDGE_PROCESS) {
    console.error(message);
    return;
  }

  console.log(message);
}

const USER_MIGRATIONS = [
  {
    version: 1,
    name: 'create_users_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          recoveryTokenHash TEXT,
          recoveryTokenExpiry DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
  {
    version: 2,
    name: 'create_user_progression_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS user_progression (
          userId INTEGER PRIMARY KEY,
          xp INTEGER NOT NULL DEFAULT 0,
          unlockedSchools TEXT NOT NULL DEFAULT '["SONIC"]',
          FOREIGN KEY (userId) REFERENCES users (id)
        );
      `);
    },
  },
  {
    version: 3,
    name: 'create_scrolls_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS scrolls (
          id TEXT PRIMARY KEY,
          userId INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users (id)
        );
      `);
    },
  },
  {
    version: 4,
    name: 'add_scroll_indexes',
    up(database) {
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_scrolls_user_updated_at
          ON scrolls(userId, updatedAt DESC);
      `);
    },
  },
  {
    version: 5,
    name: 'add_email_verification',
    up(database) {
      // Helper for migration runner (synchronous)
      const hasColumn = (db, table, col) => {
        return db.prepare(`PRAGMA table_info("${table}")`).all().some(c => c.name === col);
      };
      if (!hasColumn(database, 'users', 'verified')) {
        database.exec('ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0');
      }
      if (!hasColumn(database, 'users', 'verificationToken')) {
        database.exec('ALTER TABLE users ADD COLUMN verificationToken TEXT');
      }
    },
  },
  {
    version: 6,
    name: 'create_world_rooms_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS world_rooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          school TEXT,
          state_json TEXT NOT NULL DEFAULT '{}',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
  {
    version: 7,
    name: 'create_world_entities_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS world_entities (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          lexeme TEXT NOT NULL,
          roomId TEXT,
          ownerUserId INTEGER,
          seed TEXT NOT NULL,
          actions_json TEXT NOT NULL DEFAULT '["inspect"]',
          state_json TEXT NOT NULL DEFAULT '{}',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          inspect_count INTEGER NOT NULL DEFAULT 0,
          last_inspected_at DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (roomId) REFERENCES world_rooms (id),
          FOREIGN KEY (ownerUserId) REFERENCES users (id)
        );
        CREATE INDEX IF NOT EXISTS idx_world_entities_room ON world_entities(roomId, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_world_entities_owner ON world_entities(ownerUserId, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_world_entities_lexeme ON world_entities(lexeme);
      `);
    },
  },
  {
    version: 8,
    name: 'create_user_settings_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          userId INTEGER PRIMARY KEY,
          settings_json TEXT NOT NULL DEFAULT '{}',
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users (id)
        );
      `);
    },
  },
  {
    version: 9,
    name: 'add_scroll_submission_timestamp',
    up(database) {
      const hasColumn = (db, table, col) => {
        return db.prepare(`PRAGMA table_info("${table}")`).all().some(c => c.name === col);
      };
      if (!hasColumn(database, 'scrolls', 'submittedAt')) {
        database.exec('ALTER TABLE scrolls ADD COLUMN submittedAt DATETIME');
      }
    },
  },
  {
    version: 10,
    name: 'create_email_outbox_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS email_outbox (
          id TEXT PRIMARY KEY,
          template_key TEXT NOT NULL,
          recipient TEXT NOT NULL,
          subject TEXT NOT NULL,
          text_body TEXT NOT NULL,
          html_body TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'console',
          status TEXT NOT NULL DEFAULT 'queued',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 5,
          last_error TEXT,
          provider_message_id TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          locked_at TEXT,
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_email_outbox_status_next_attempt
          ON email_outbox(status, next_attempt_at);

        CREATE INDEX IF NOT EXISTS idx_email_outbox_recipient_created
          ON email_outbox(recipient, created_at DESC);
      `);
    },
  },
  {
    version: 11,
    name: 'create_collab_tasks_unified',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS collab_tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'backlog',
          priority INTEGER NOT NULL DEFAULT 1,
          assigned_agent TEXT,
          created_by TEXT,
          depends_on TEXT DEFAULT '[]',
          file_paths TEXT DEFAULT '[]',
          pipeline_run_id TEXT,
          notes_json TEXT DEFAULT '[]',
          result_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON collab_tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON collab_tasks(assigned_agent);
      `);
    },
  },
  {
    version: 12,
    name: 'fix_task_column_names',
    up(database) {
      const columns = database.prepare('PRAGMA table_info("collab_tasks")').all();
      const hasCreatedAt = columns.some(c => c.name === 'createdAt');
      if (hasCreatedAt) {
        database.exec(`
          ALTER TABLE collab_tasks RENAME COLUMN createdAt TO created_at;
          ALTER TABLE collab_tasks RENAME COLUMN updatedAt TO updated_at;
          ALTER TABLE collab_tasks RENAME COLUMN completedAt TO completed_at;
        `);
      }
    },
  },
  {
    version: 13,
    name: 'create_sessions_table',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          expires INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
      `);
    },
  },
];

let db;
let rawDb;
let dbState = {
  currentVersion: 0,
  appliedVersions: [],
  pragmas: null,
};
let isClosed = false;

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (!value || typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeWorldRoomRow(row) {
  if (!row) return null;
  return {
    ...row,
    state: parseJsonObject(row.state_json),
  };
}

function normalizeWorldEntityRow(row) {
  if (!row) return null;
  return {
    ...row,
    actions: parseJsonArray(row.actions_json),
    state: parseJsonObject(row.state_json),
    metadata: parseJsonObject(row.metadata_json),
    inspectCount: Number(row.inspect_count) || 0,
  };
}

async function ensureWorldSeedData(database) {
  try {
    // ─── STEP 1: Check if seeding is already current ──────────────────────────
    await database.execute(`CREATE TABLE IF NOT EXISTS _world_meta (key TEXT PRIMARY KEY, value TEXT)`);
    const seedVersionRow = await database.execute(`SELECT value FROM _world_meta WHERE key = 'seed_version'`);
    const CURRENT_SEED_VERSION = '1.0.0'; // Manually increment when core entities change
    
    if (seedVersionRow.rows[0]?.value === CURRENT_SEED_VERSION) {
      logUserDbInfo(`[DB:user] World seed version ${CURRENT_SEED_VERSION} is current. Skipping seed.`);
      return;
    }

    logUserDbInfo(`[DB:user] Applying world seed version ${CURRENT_SEED_VERSION}...`);

    for (const room of DEFAULT_WORLD_ROOMS) {
      await database.execute(`
        INSERT INTO world_rooms (id, name, description, school, state_json, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          school = excluded.school,
          state_json = excluded.state_json,
          updatedAt = datetime('now')
      `, [room.id, room.name, room.description, room.school || null, JSON.stringify(room.state || {})]);
    }

    for (const entity of DEFAULT_WORLD_ENTITIES) {
      await database.execute(`
        INSERT INTO world_entities (
          id, kind, lexeme, roomId, ownerUserId, seed, actions_json, state_json, metadata_json,
          inspect_count, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO NOTHING
      `, [
        entity.id, entity.kind, entity.lexeme, entity.roomId || null, entity.ownerUserId ?? null, 
        entity.seed, JSON.stringify(entity.actions || ['inspect']), JSON.stringify(entity.state || {}),
        JSON.stringify(entity.metadata || {}), Number(entity.inspectCount) || 0
      ]);
    }

    await database.execute(`INSERT INTO _world_meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [CURRENT_SEED_VERSION]);
    logUserDbInfo(`[DB:user] World seed applied successfully.`);
  } catch (error) {
    console.error('[DB:user] Failed to ensure world seed data:', error);
  }
}

async function initializeDatabase() {
  try {
    if (TURSO_URL) {
      logUserDbInfo(`[DB:user] Connecting to Turso: ${TURSO_URL}`);
      db = createDbWrapper({
        type: 'libsql',
        config: { url: TURSO_URL, authToken: TURSO_TOKEN }
      });
      
      const migrationResult = await runAsyncMigrations(db, {
        namespace: USER_DB_NAMESPACE,
        migrations: USER_MIGRATIONS,
      });
      dbState = {
        ...dbState,
        ...migrationResult,
      };
    } else {
      mkdirSync(path.dirname(DB_PATH), { recursive: true });
      rawDb = new Database(DB_PATH);

      dbState.pragmas = applySqlitePragmas(rawDb, {
        busyTimeoutMs: process.env.DB_BUSY_TIMEOUT_MS,
      });
      const migrationResult = runSqliteMigrations(rawDb, {
        namespace: USER_DB_NAMESPACE,
        migrations: USER_MIGRATIONS,
      });
      dbState = {
        ...dbState,
        ...migrationResult,
      };
      
      db = createDbWrapper({ type: 'better-sqlite3', db: rawDb });
      
      logUserDbInfo(
        `[DB:user] Connected. version=${dbState.currentVersion}, journal=${dbState.pragmas.journalMode}, foreign_keys=${dbState.pragmas.foreignKeys}, busy_timeout=${dbState.pragmas.busyTimeout}`,
      );
    }
    
    // --- LAZY SEEDING (V12) ---
    // Background the seeding process so it doesn't block the initial page transition/auth.
    ensureWorldSeedData(db).catch(err => console.error('[DB:user] Background seeding error:', err));

  } catch (error) {
    console.error(`[DB:user] Failed to connect to database at ${TURSO_URL || DB_PATH}.`);
    console.error(error);
    process.exit(1);
  }
}

await initializeDatabase();

async function closeDatabase() {
  if (isClosed) return;
  isClosed = true;
  if (db) {
    await db.close();
    logUserDbInfo('[DB:user] Connection closed.');
  }
}

function getStatus() {
  return {
    path: DB_PATH,
    namespace: USER_DB_NAMESPACE,
    version: dbState.currentVersion,
    pragmas: dbState.pragmas,
  };
}

// --- User ---
async function findUserByUsername(username) {
  const result = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const result = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
  return result.rows[0] || null;
}

async function findUserByVerificationToken(token) {
  const result = await db.execute('SELECT * FROM users WHERE verificationToken = ?', [token]);
  return result.rows[0] || null;
}

async function findUserByRecoveryTokenHash(tokenHash) {
  const result = await db.execute('SELECT * FROM users WHERE recoveryTokenHash = ?', [tokenHash]);
  return result.rows[0] || null;
}

async function createUser(username, email, hashedPassword, verificationToken) {
  const result = await db.execute('INSERT INTO users (username, email, password, verificationToken, verified) VALUES (?, ?, ?, ?, 0)', [username, email, hashedPassword, verificationToken]);
  return { id: result.lastInsertRowid, username, email };
}

async function verifyUser(userId) {
  await db.execute('UPDATE users SET verified = 1, verificationToken = NULL WHERE id = ?', [userId]);
}

async function setVerificationToken(userId, verificationToken) {
  await db.execute(`
    UPDATE users
    SET verificationToken = ?,
        verified = 0
    WHERE id = ?
  `, [verificationToken, userId]);
  return await findUserById(userId);
}

async function setRecoveryToken(userId, recoveryTokenHash, recoveryTokenExpiry) {
  await db.execute(`
    UPDATE users
    SET recoveryTokenHash = ?,
        recoveryTokenExpiry = ?
    WHERE id = ?
  `, [recoveryTokenHash, recoveryTokenExpiry, userId]);
  return await findUserById(userId);
}

async function clearRecoveryToken(userId) {
  await db.execute(`
    UPDATE users
    SET recoveryTokenHash = NULL,
        recoveryTokenExpiry = NULL
    WHERE id = ?
  `, [userId]);
  return await findUserById(userId);
}

async function updatePasswordHash(userId, hashedPassword) {
  await db.execute(`
    UPDATE users
    SET password = ?,
        recoveryTokenHash = NULL,
        recoveryTokenExpiry = NULL
    WHERE id = ?
  `, [hashedPassword, userId]);
  return await findUserById(userId);
}

// --- Progression ---
async function getProgression(userId) {
  const result = await db.execute('SELECT * FROM user_progression WHERE userId = ?', [userId]);
  let progression = result.rows[0];
  if (!progression) {
    await db.execute('INSERT INTO user_progression (userId, xp, unlockedSchools) VALUES (?, 0, ?)', [userId, '["SONIC"]']);
    const fresh = await db.execute('SELECT * FROM user_progression WHERE userId = ?', [userId]);
    progression = fresh.rows[0];
  }
  if (progression) {
    progression.unlockedSchools = JSON.parse(progression.unlockedSchools);
  }
  return progression;
}

async function saveProgression(userId, { xp, unlockedSchools }) {
  await db.execute(`
    INSERT INTO user_progression (userId, xp, unlockedSchools)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      xp = excluded.xp,
      unlockedSchools = excluded.unlockedSchools
  `, [userId, xp, JSON.stringify(unlockedSchools)]);
  return await getProgression(userId);
}

async function resetProgression(userId) {
  return await saveProgression(userId, { xp: 0, unlockedSchools: ['SONIC'] });
}

// --- World ---
async function getWorldRoom(roomId) {
  const result = await db.execute(`
    SELECT id, name, description, school, state_json, createdAt, updatedAt
    FROM world_rooms
    WHERE id = ?
  `, [roomId]);
  return normalizeWorldRoomRow(result.rows[0]);
}

async function getWorldRooms() {
  const result = await db.execute(`
    SELECT id, name, description, school, state_json, createdAt, updatedAt
    FROM world_rooms
    ORDER BY id ASC
  `);
  return result.rows.map(normalizeWorldRoomRow).filter(Boolean);
}

async function getWorldEntity(entityId) {
  const result = await db.execute(`
    SELECT id, kind, lexeme, roomId, ownerUserId, seed, actions_json, state_json, metadata_json,
           inspect_count, last_inspected_at, createdAt, updatedAt
    FROM world_entities
    WHERE id = ?
  `, [entityId]);
  return normalizeWorldEntityRow(result.rows[0]);
}

async function getWorldEntitiesByRoom(roomId) {
  const result = await db.execute(`
    SELECT id, kind, lexeme, roomId, ownerUserId, seed, actions_json, state_json, metadata_json,
           inspect_count, last_inspected_at, createdAt, updatedAt
    FROM world_entities
    WHERE roomId = ?
    ORDER BY createdAt ASC, id ASC
  `, [roomId]);
  return result.rows.map(normalizeWorldEntityRow).filter(Boolean);
}

async function recordWorldEntityInspect(entityId) {
  const result = await db.execute(`
    UPDATE world_entities
    SET inspect_count = inspect_count + 1,
        last_inspected_at = datetime('now'),
        updatedAt = datetime('now')
    WHERE id = ?
  `, [entityId]);
  if (result.rowsAffected === 0) return null;
  return await getWorldEntity(entityId);
}

// --- Scrolls ---
async function getScrolls(userId) {
  const result = await db.execute(
    'SELECT id, title, content, createdAt, updatedAt, submittedAt FROM scrolls WHERE userId = ? ORDER BY updatedAt DESC',
    [userId]
  );
  return result.rows;
}

async function getScroll(scrollId, userId) {
  const result = await db.execute('SELECT * FROM scrolls WHERE id = ? AND userId = ?', [scrollId, userId]);
  return result.rows[0] || null;
}

async function findScrollById(scrollId) {
  const result = await db.execute('SELECT * FROM scrolls WHERE id = ?', [scrollId]);
  return result.rows[0] || null;
}

async function saveScroll(scrollId, userId, { title, content, submit = false }) {
  const now = new Date().toISOString();
  const existing = await getScroll(scrollId, userId);
  const createdAt = existing?.createdAt || now;
  const submittedAt = existing?.submittedAt || (submit ? now : null);
  
  await db.execute(`
    INSERT INTO scrolls (id, userId, title, content, createdAt, updatedAt, submittedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      updatedAt = excluded.updatedAt,
      submittedAt = excluded.submittedAt
  `, [scrollId, userId, title, content, createdAt, now, submittedAt]);
  
  return await getScroll(scrollId, userId);
}

async function deleteScroll(scrollId, userId) {
  const result = await db.execute('DELETE FROM scrolls WHERE id = ? AND userId = ?', [scrollId, userId]);
  return result.rowsAffected > 0;
}

// --- Tasks ---
function normalizeTaskRow(row) {
  if (!row) return null;
  return {
    ...row,
    notes: parseJsonArray(row.notes_json),
    file_paths: parseJsonArray(row.file_paths),
    depends_on: parseJsonArray(row.depends_on),
    result: parseJsonObject(row.result_json),
  };
}

async function createTask({ id, title, description, priority = 1, file_paths = [], depends_on = [], created_by, pipeline_run_id, notes = [] }) {
  await db.execute(`
    INSERT INTO collab_tasks (id, title, description, priority, file_paths, depends_on, created_by, pipeline_run_id, notes_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, title, description || null, priority,
    JSON.stringify(file_paths), JSON.stringify(depends_on),
    created_by || null, pipeline_run_id || null, JSON.stringify(notes)
  ]);
  return await getTask(id);
}

async function getTask(id) {
  const result = await db.execute('SELECT * FROM collab_tasks WHERE id = ?', [id]);
  return normalizeTaskRow(result.rows[0]);
}

async function getAllTasks(filters = {}, pagination = {}) {
  const limit = Number.isInteger(pagination.limit) ? pagination.limit : 50;
  const offset = Number.isInteger(pagination.offset) ? pagination.offset : 0;

  const clauses = [];
  const params = [];

  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.agent) {
    clauses.push('assigned_agent = ?');
    params.push(filters.agent);
  }
  if (filters.priority !== undefined) {
    clauses.push('priority = ?');
    params.push(filters.priority);
  }

  let query = 'SELECT * FROM collab_tasks';
  if (clauses.length > 0) {
    query += ` WHERE ${clauses.join(' AND ')}`;
  }
  query += ' ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await db.execute(query, params);
  return result.rows.map(normalizeTaskRow).filter(Boolean);
}

async function updateTask(id, updates) {
  const fields = [];
  const params = [];

  const ALLOWED_COLUMNS = [
    'title', 'description', 'status', 'priority', 'assigned_agent', 'pipeline_run_id'
  ];

  for (const col of ALLOWED_COLUMNS) {
    if (updates[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(updates[col]);
    }
  }

  if (updates.notes) {
    fields.push('notes_json = ?');
    params.push(JSON.stringify(updates.notes));
  }
  if (updates.result) {
    fields.push('result_json = ?');
    params.push(JSON.stringify(updates.result));
  }

  if (fields.length === 0) return await getTask(id);

  if (updates.status === 'done') {
    fields.push("completed_at = datetime('now')");
  }

  fields.push("updated_at = datetime('now')");
  const query = `UPDATE collab_tasks SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);

  const result = await db.execute(query, params);
  if (result.rowsAffected === 0) return null;
  return await getTask(id);
}

async function assignTaskWithLocks(taskId, agentId, _filePaths = [], _ttlMinutes = 30) {
  const result = await db.execute(`
    UPDATE collab_tasks
    SET assigned_agent = ?, status = 'assigned', updated_at = datetime('now')
    WHERE id = ?
  `, [agentId, taskId]);
  
  if (result.rowsAffected === 0) {
    return { conflict: false, task: null };
  }
  return { conflict: false, task: await getTask(taskId) };
}

async function deleteTask(id) {
  const result = await db.execute('DELETE FROM collab_tasks WHERE id = ?', [id]);
  return result.rowsAffected > 0;
}

// --- Settings ---
async function getSettings(userId) {
  const result = await db.execute('SELECT settings_json FROM user_settings WHERE userId = ?', [userId]);
  const row = result.rows[0];
  return parseJsonObject(row?.settings_json);
}

async function saveSettings(userId, settings) {
  await db.execute(`
    INSERT INTO user_settings (userId, settings_json, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(userId) DO UPDATE SET
      settings_json = excluded.settings_json,
      updatedAt = excluded.updatedAt
  `, [userId, JSON.stringify(settings || {})]);
  return await getSettings(userId);
}

// --- Mail Outbox ---
function normalizeEmailOutboxRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    templateKey: row.template_key,
    recipient: row.recipient,
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    provider: row.provider,
    status: row.status,
    attempts: Number(row.attempts) || 0,
    maxAttempts: Number(row.max_attempts) || 0,
    lastError: row.last_error || null,
    providerMessageId: row.provider_message_id || null,
    metadata: parseJsonObject(row.metadata_json),
    nextAttemptAt: row.next_attempt_at || null,
    lockedAt: row.locked_at || null,
    sentAt: row.sent_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function queueEmail(input) {
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO email_outbox (
      id, template_key, recipient, subject, text_body, html_body, provider,
      status, attempts, max_attempts, metadata_json, next_attempt_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)
  `, [
    input.id, input.templateKey, input.recipient, input.subject, 
    input.textBody, input.htmlBody, input.provider || 'console',
    input.maxAttempts || 5, JSON.stringify(input.metadata || {}),
    input.nextAttemptAt || now, now, now
  ]);
  return await getQueuedEmail(input.id);
}

async function getQueuedEmail(id) {
  const result = await db.execute('SELECT * FROM email_outbox WHERE id = ?', [id]);
  return normalizeEmailOutboxRow(result.rows[0]);
}

async function listQueuedEmails(filters = {}, pagination = {}) {
  const allowedStatuses = Array.isArray(filters.statuses)
    ? filters.statuses.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const limit = Number.isInteger(pagination.limit) ? pagination.limit : 100;
  const clauses = [];
  const params = [];

  if (allowedStatuses.length > 0) {
    clauses.push(`status IN (${allowedStatuses.map(() => '?').join(', ')})`);
    params.push(...allowedStatuses);
  }

  let query = 'SELECT * FROM email_outbox';
  if (clauses.length > 0) query += ` WHERE ${clauses.join(' AND ')}`;
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await db.execute(query, params);
  return result.rows.map(normalizeEmailOutboxRow).filter(Boolean);
}

async function claimQueuedEmails(limit = 10) {
  const result = await db.execute(`
    SELECT *
    FROM email_outbox
    WHERE status IN ('queued', 'retry')
    ORDER BY created_at ASC
    LIMIT ?
  `, [limit]);
  
  const candidateRows = result.rows;
  const nowMs = Date.now();
  const claimed = [];
  
  for (const row of candidateRows) {
    const nextAttemptMs = Date.parse(row.next_attempt_at || '');
    if (Number.isFinite(nextAttemptMs) && nextAttemptMs > nowMs) continue;
    
    const now = new Date().toISOString();
    const updateResult = await db.execute(`
      UPDATE email_outbox
      SET status = 'processing',
          attempts = attempts + 1,
          locked_at = ?,
          updated_at = ?
      WHERE id = ?
        AND status IN ('queued', 'retry')
    `, [now, now, row.id]);
    
    if (updateResult.rowsAffected > 0) {
      claimed.push(normalizeEmailOutboxRow({
        ...row,
        status: 'processing',
        attempts: Number(row.attempts || 0) + 1,
        locked_at: now,
        updated_at: now,
      }));
    }
  }
  return claimed;
}

async function markQueuedEmailSent(id, providerMessageId = null) {
  const now = new Date().toISOString();
  await db.execute(`
    UPDATE email_outbox
    SET status = 'sent',
        provider_message_id = ?,
        sent_at = ?,
        locked_at = NULL,
        updated_at = ?
    WHERE id = ?
  `, [providerMessageId, now, now, id]);
  return await getQueuedEmail(id);
}

async function markQueuedEmailFailed(id, { lastError, nextAttemptAt = null, terminal = false } = {}) {
  const now = new Date().toISOString();
  const nextStatus = terminal ? 'failed' : 'retry';
  await db.execute(`
    UPDATE email_outbox
    SET status = ?,
        last_error = ?,
        next_attempt_at = ?,
        locked_at = NULL,
        updated_at = ?
    WHERE id = ?
  `, [nextStatus, lastError || null, nextAttemptAt || now, now, id]);
  return await getQueuedEmail(id);
}

async function requeueStaleProcessingEmails(staleBeforeIso) {
  const now = new Date().toISOString();
  const result = await db.execute(`
    UPDATE email_outbox
    SET status = 'retry',
        locked_at = NULL,
        updated_at = ?
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < ?
  `, [now, staleBeforeIso]);
  return result.rowsAffected;
}

export const userPersistence = {
  users: {
    findByUsername: findUserByUsername,
    findByEmail: findUserByEmail,
    findById: findUserById,
    findByVerificationToken: findUserByVerificationToken,
    findByRecoveryTokenHash: findUserByRecoveryTokenHash,
    createUser: createUser,
    verifyUser: verifyUser,
    setVerificationToken: setVerificationToken,
    setRecoveryToken: setRecoveryToken,
    clearRecoveryToken: clearRecoveryToken,
    updatePasswordHash: updatePasswordHash,
  },
  mail: {
    queue: queueEmail,
    getOne: getQueuedEmail,
    getAll: listQueuedEmails,
    claimDue: claimQueuedEmails,
    markSent: markQueuedEmailSent,
    markFailed: markQueuedEmailFailed,
    requeueStaleProcessing: requeueStaleProcessingEmails,
  },
  settings: {
    get: getSettings,
    save: saveSettings,
  },
  progression: {
    get: getProgression,
    save: saveProgression,
    reset: resetProgression,
  },
  tasks: {
    create: createTask,
    getById: getTask,
    getAll: getAllTasks,
    update: updateTask,
    assignWithLocks: assignTaskWithLocks,
    delete: deleteTask,
  },
  world: {
    getRoom: getWorldRoom,
    getRooms: getWorldRooms,
    getEntity: getWorldEntity,
    getEntitiesByRoom: getWorldEntitiesByRoom,
    recordInspect: recordWorldEntityInspect,
  },
  scrolls: {
    getAll: getScrolls,
    getOne: getScroll,
    findById: findScrollById,
    save: saveScroll,
    delete: deleteScroll,
  },
  db,
  close: closeDatabase,
  getStatus,
};

export const persistence = userPersistence;
