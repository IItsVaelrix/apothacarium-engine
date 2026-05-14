import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    applySqlitePragmas,
    runSqliteMigrations,
    runAsyncMigrations
} from '../db/sqlite.migrations.js';

import { createDbWrapper } from '../db/persistence.wrapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

const TURSO_URL = process.env.TURSO_COLLAB_DB_URL;
const TURSO_TOKEN = process.env.TURSO_COLLAB_DB_TOKEN;

const DB_PATH = process.env.COLLAB_DB_PATH
    ? path.resolve(process.env.COLLAB_DB_PATH)
    : path.join(ROOT, 'scholomance_collab.sqlite');

const COLLAB_DB_NAMESPACE = 'collab';

const COLLAB_MIGRATIONS = [
    {
        version: 1,
        name: 'create_collab_agents',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_agents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    capabilities TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'offline',
                    current_task_id TEXT,
                    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT DEFAULT '{}'
                );
            `);
        },
    },
    {
        version: 2,
        name: 'create_collab_tasks',
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
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    result TEXT
                );
            `);
        },
    },
    {
        version: 3,
        name: 'create_collab_file_locks',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_file_locks (
                    file_path TEXT PRIMARY KEY,
                    locked_by TEXT NOT NULL,
                    task_id TEXT,
                    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME
                );
            `);
        },
    },
    {
        version: 4,
        name: 'create_collab_pipeline_runs',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_pipeline_runs (
                    id TEXT PRIMARY KEY,
                    pipeline_type TEXT NOT NULL,
                    stages TEXT NOT NULL,
                    current_stage INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    trigger_task_id TEXT,
                    results TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME
                );
            `);
        },
    },
    {
        version: 5,
        name: 'create_collab_activity',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_activity (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id TEXT,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    details TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
        },
    },
    {
        version: 6,
        name: 'add_collab_indexes',
        up(database) {
            database.exec(`
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON collab_tasks(status);
                CREATE INDEX IF NOT EXISTS idx_tasks_agent ON collab_tasks(assigned_agent);
                CREATE INDEX IF NOT EXISTS idx_tasks_pipeline_run ON collab_tasks(pipeline_run_id);
                CREATE INDEX IF NOT EXISTS idx_activity_created ON collab_activity(created_at);
                CREATE INDEX IF NOT EXISTS idx_activity_agent_created ON collab_activity(agent_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_pipeline_status ON collab_pipeline_runs(status);
                CREATE INDEX IF NOT EXISTS idx_locks_expires_at ON collab_file_locks(expires_at);
            `);
        },
    },
    {
        version: 7,
        name: 'add_notes_to_tasks',
        up(database) {
            database.exec(`
                ALTER TABLE collab_tasks ADD COLUMN notes TEXT DEFAULT '[]';
            `);
        },
    },
    {
        version: 8,
        name: 'create_collab_memories',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_memories (
                    agent_id TEXT NOT NULL DEFAULT '',
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (agent_id, key)
                );
                CREATE INDEX IF NOT EXISTS idx_memories_agent ON collab_memories(agent_id);
            `);
        },
    },
    {
        version: 9,
        name: 'create_collab_bug_reports',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_bug_reports (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    summary TEXT,
                    status TEXT NOT NULL DEFAULT 'new',
                    priority INTEGER NOT NULL DEFAULT 1,
                    source_type TEXT NOT NULL,
                    source_ref_id TEXT,
                    reporter_agent_id TEXT,
                    assigned_agent_id TEXT,
                    category TEXT,
                    severity TEXT,
                    module_id TEXT,
                    error_code_hex TEXT,
                    bytecode TEXT,
                    checksum_verified INTEGER DEFAULT 0,
                    parseable INTEGER DEFAULT 0,
                    auto_fixable INTEGER DEFAULT 0,
                    decoded_context TEXT,
                    recovery_hints TEXT,
                    observed_behavior TEXT,
                    expected_behavior TEXT,
                    repro_steps TEXT,
                    environment TEXT,
                    attachments TEXT DEFAULT '[]',
                    related_task_id TEXT,
                    related_pipeline_id TEXT,
                    related_activity_id TEXT,
                    dedupe_fingerprint TEXT,
                    duplicate_of_bug_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_bugs_status ON collab_bug_reports(status);
                CREATE INDEX IF NOT EXISTS idx_bugs_severity ON collab_bug_reports(severity);
                CREATE INDEX IF NOT EXISTS idx_bugs_fingerprint ON collab_bug_reports(dedupe_fingerprint);
            `);
        },
    },
    {
        version: 10,
        name: 'create_collab_agent_keys',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_agent_keys (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    key_hash TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    revoked_at DATETIME,
                    created_by TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_keys_agent ON collab_agent_keys(agent_id);
                CREATE INDEX IF NOT EXISTS idx_agent_keys_hash ON collab_agent_keys(key_hash);
                CREATE INDEX IF NOT EXISTS idx_agent_keys_revoked ON collab_agent_keys(revoked_at);
            `);
        },
    },
    {
        version: 11,
        name: 'add_a2a_and_mcp_fields',
        up(database) {
            // Helper to add column if it doesn't exist
            const addColumn = (table, column, type) => {
                try {
                    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
                } catch (e) {
                    if (!e.message.includes('duplicate column name')) throw e;
                }
            };
            addColumn('collab_agents', 'framework_origin', 'TEXT');
            addColumn('collab_file_locks', 'mcp_active', 'BOOLEAN DEFAULT 0');
            addColumn('collab_file_locks', 'mcp_stream_json', 'TEXT');
            addColumn('collab_bug_reports', 'solution_bytecode', 'TEXT');
            addColumn('collab_bug_reports', 'solution_ledger_status', "TEXT DEFAULT 'pending'");
            addColumn('collab_bug_reports', 'corroborating_agents', "TEXT DEFAULT '[]'");
        },
    },
    {
        version: 12,
        name: 'create_experience_ledger',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_experience_ledger (
                    skeleton_hash TEXT PRIMARY KEY,
                    bytecode_prefix TEXT NOT NULL DEFAULT 'PB-EXP-v1',
                    raw_trace_ref TEXT,
                    corroboration_count INTEGER DEFAULT 1,
                    corroborating_agent_ids TEXT DEFAULT '[]',
                    ledger_status TEXT NOT NULL DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_ledger_status ON collab_experience_ledger(ledger_status);
            `);
        },
    },
    {
        version: 13,
        name: 'create_codebase_embeddings',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS codebase_embeddings (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content_preview TEXT,
                    vector_tq BLOB NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_codebase_file ON codebase_embeddings(file_path);
            `);
        },
    },
    {
        version: 14,
        name: 'create_collab_messages',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id TEXT NOT NULL,
                    target_id TEXT NOT NULL DEFAULT 'all',
                    glyph TEXT DEFAULT '✦',
                    text TEXT NOT NULL,
                    bytecode TEXT,
                    is_telepathic INTEGER DEFAULT 0,
                    metadata TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_messages_sender ON collab_messages(sender_id);
                CREATE INDEX IF NOT EXISTS idx_messages_target ON collab_messages(target_id);
                CREATE INDEX IF NOT EXISTS idx_messages_created ON collab_messages(created_at);
            `);
        },
    },
    {
        version: 15,
        name: 'create_collab_alerts',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_alerts (
                    id TEXT PRIMARY KEY,
                    message_id INTEGER NOT NULL,
                    recipient_id TEXT NOT NULL,
                    sender_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    identity_packet TEXT NOT NULL,
                    issued_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    delivered_via TEXT,
                    FOREIGN KEY (message_id) REFERENCES collab_messages(id)
                );
                CREATE TABLE IF NOT EXISTS collab_alert_responses (
                    alert_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    responded_at INTEGER NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    payload TEXT DEFAULT '{}',
                    PRIMARY KEY (alert_id, agent_id),
                    FOREIGN KEY (alert_id) REFERENCES collab_alerts(id)
                );
                CREATE INDEX IF NOT EXISTS idx_alerts_recipient_status ON collab_alerts(recipient_id, status);
                CREATE INDEX IF NOT EXISTS idx_alerts_expires ON collab_alerts(expires_at);
                CREATE INDEX IF NOT EXISTS idx_alerts_message ON collab_alerts(message_id);
            `);
        },
    },
];

let db; // The wrapper
let rawDb; // The better-sqlite3 instance if local
let dbState = {
    currentVersion: 0,
    appliedVersions: [],
    pragmas: null,
};
let isClosed = false;

async function initializeDatabase() {
    try {
        if (TURSO_URL) {
            console.error(`[DB:collab] Connecting to Turso: ${TURSO_URL}`);
            db = createDbWrapper({
                type: 'libsql',
                config: { url: TURSO_URL, authToken: TURSO_TOKEN }
            });
            
            const migrationResult = await runAsyncMigrations(db, {
                namespace: COLLAB_DB_NAMESPACE,
                migrations: COLLAB_MIGRATIONS,
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
                namespace: COLLAB_DB_NAMESPACE,
                migrations: COLLAB_MIGRATIONS,
            });
            dbState = {
                ...dbState,
                ...migrationResult,
            };
            
            db = createDbWrapper({
                type: 'better-sqlite3',
                db: rawDb
            });
            
            console.error(
                `[DB:collab] Connected (Local). version=${dbState.currentVersion}, journal=${dbState.pragmas.journalMode}, foreign_keys=${dbState.pragmas.foreignKeys}, busy_timeout=${dbState.pragmas.busyTimeout}`,
            );
        }
    } catch (error) {
        console.error(`[DB:collab] Failed to connect to database. URL=${TURSO_URL || DB_PATH}`);
        console.error(error);
        process.exit(1);
    }
}

// Global initialization
await initializeDatabase();

async function closeDatabase() {
    if (isClosed) return;
    isClosed = true;
    if (db) {
        await db.close();
        console.error('[DB:collab] Connection closed.');
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

function parseJsonObjectOrNull(value) {
    if (!value || typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function getStatus() {
    return {
        path: DB_PATH,
        namespace: COLLAB_DB_NAMESPACE,
        version: dbState.currentVersion,
        pragmas: dbState.pragmas,
    };
}

process.on('exit', () => {
    // Note: async close on exit is tricky in Node.
    // We rely on the DB process cleanup or explicit close.
});

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

// --- Agents ---

async function registerAgent({ id, name, role, framework_origin, capabilities, metadata }) {
    await db.execute(`
        INSERT INTO collab_agents (id, name, role, framework_origin, capabilities, status, last_seen, metadata)
        VALUES (?, ?, ?, ?, ?, 'online', datetime('now'), ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            role = excluded.role,
            framework_origin = excluded.framework_origin,
            capabilities = excluded.capabilities,
            status = 'online',
            last_seen = datetime('now'),
            metadata = excluded.metadata
    `, [id, name, role, framework_origin || 'native', JSON.stringify(capabilities || []), JSON.stringify(metadata || {})]);
    return await getAgent(id);
}

async function heartbeatAgent(id, status, currentTaskId) {
    const result = await db.execute(`
        UPDATE collab_agents
        SET status = ?, current_task_id = ?, last_seen = datetime('now')
        WHERE id = ?
    `, [status, currentTaskId ?? null, id]);
    if (result.rowsAffected === 0) return null;
    return await getAgent(id);
}

async function offlineAgent(id) {
    const result = await db.execute(`
        UPDATE collab_agents
        SET status = 'offline', current_task_id = NULL, last_seen = datetime('now')
        WHERE id = ?
    `, [id]);
    if (result.rowsAffected === 0) return null;
    return await getAgent(id);
}

async function deleteAgent(id) {
    const result = await db.execute('DELETE FROM collab_agents WHERE id = ?', [id]);
    return result.rowsAffected > 0;
}

async function getAllAgentsRaw() {
    const result = await db.execute('SELECT * FROM collab_agents');
    return result.rows.map(row => ({
        ...row,
        capabilities: JSON.parse(row.capabilities),
        metadata: JSON.parse(row.metadata),
    }));
}

async function getAllAgents() {
    const rows = await getAllAgentsRaw();
    const now = Date.now();
    return rows.map(row => {
        const lastSeen = new Date(row.last_seen + 'Z').getTime();
        const isStale = (now - lastSeen) > STALE_THRESHOLD_MS;
        return {
            ...row,
            status: isStale && row.status !== 'offline' ? 'offline' : row.status,
        };
    });
}

async function getAgent(id) {
    const result = await db.execute('SELECT * FROM collab_agents WHERE id = ?', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
        ...row,
        capabilities: JSON.parse(row.capabilities),
        metadata: JSON.parse(row.metadata),
    };
}

// --- Tasks ---

async function createTask({ id, title, description, priority = 1, file_paths = [], depends_on = [], created_by, pipeline_run_id, notes = [] }) {
    await db.execute(`
        INSERT INTO collab_tasks (id, title, description, priority, file_paths, depends_on, created_by, pipeline_run_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id, 
        title, 
        description || null, 
        priority, 
        JSON.stringify(file_paths), 
        JSON.stringify(depends_on), 
        created_by, 
        pipeline_run_id || null,
        JSON.stringify(notes)
    ]);
    return await getTask(id);
}

async function getAllTasks(filters = {}, pagination = {}) {
    const rawLimit = Number.isInteger(Number(pagination.limit)) ? Number(pagination.limit) : 50;
    const rawOffset = Number.isInteger(Number(pagination.offset)) ? Number(pagination.offset) : 0;
    const limit = Math.max(1, rawLimit);
    const offset = Math.max(0, rawOffset);

    let query = 'SELECT * FROM collab_tasks WHERE 1=1';
    const params = [];

    if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
    }
    if (filters.agent) {
        query += ' AND assigned_agent = ?';
        params.push(filters.agent);
    }
    if (filters.priority !== undefined) {
        query += ' AND priority = ?';
        params.push(filters.priority);
    }

    query += ' ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const result = await db.execute(query, params);
    return result.rows.map(parseTaskRow);
}

async function getTask(id) {
    const result = await db.execute('SELECT * FROM collab_tasks WHERE id = ?', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return parseTaskRow(row);
}

async function getTaskCounts() {
    const result = await db.execute(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status NOT IN ('backlog', 'done', 'cancelled', 'completed', 'failed') THEN 1 ELSE 0 END) AS active
        FROM collab_tasks
    `);
    const row = result.rows[0];

    return {
        total_tasks: row?.total || 0,
        active_tasks: row?.active || 0,
    };
}

async function unassignTasksForAgent(agentId) {
    const result = await db.execute(`
        UPDATE collab_tasks
        SET assigned_agent = NULL,
            status = 'backlog',
            updated_at = datetime('now')
        WHERE assigned_agent = ?
          AND status NOT IN ('done', 'cancelled', 'completed', 'failed')
    `, [agentId]);
    return result.rowsAffected;
}

/**
 * Allowlist of valid column names for UPDATE queries on collab_tasks.
 * Prevents SQL injection via dynamic column name construction.
 */
const ALLOWED_TASK_COLUMNS = new Set([
    'title',
    'description',
    'status',
    'priority',
    'result',
    'notes',
    'assigned_agent',
    'pipeline_run_id',
]);

async function updateTask(id, updates) {
    const fields = [];
    const params = [];

    // SECURITY: Validate all update keys against allowlist before building SQL
    for (const [key, value] of Object.entries(updates || {})) {
        if (!ALLOWED_TASK_COLUMNS.has(key)) {
            console.warn(`[collab.persistence] Attempted to update invalid column: ${key}`);
            continue;
        }
        
        if (key === 'title') { fields.push('title = ?'); params.push(value); }
        else if (key === 'description') { fields.push('description = ?'); params.push(value); }
        else if (key === 'status') {
            fields.push('status = ?');
            params.push(value);
            if (value === 'done') {
                fields.push("completed_at = datetime('now')");
            }
        }
        else if (key === 'priority') { fields.push('priority = ?'); params.push(value); }
        else if (key === 'result') { fields.push('result = ?'); params.push(JSON.stringify(value)); }
        else if (key === 'notes') { fields.push('notes = ?'); params.push(JSON.stringify(value)); }
        else if (key === 'assigned_agent') { fields.push('assigned_agent = ?'); params.push(value); }
        else if (key === 'pipeline_run_id') { fields.push('pipeline_run_id = ?'); params.push(value); }
    }

    if (fields.length === 0) return await getTask(id);

    fields.push("updated_at = datetime('now')");
    params.push(id);
    await db.execute(`UPDATE collab_tasks SET ${fields.join(', ')} WHERE id = ?`, params);
    return await getTask(id);
}

async function assignTaskWithLocks(taskId, agentId, filePaths = [], ttlMinutes = 30) {
    if (filePaths.length === 0) {
        await db.execute(`
            UPDATE collab_tasks
            SET assigned_agent = ?, status = 'assigned', updated_at = datetime('now')
            WHERE id = ?
        `, [agentId, taskId]);
        return { conflict: false, task: await getTask(taskId) };
    }

    // Pre-check: bail before acquiring any lock if a foreign agent holds one of
    // the requested files. Without this, the batch transaction commits per-row
    // acquisition before conflict detection runs, leaking partial locks.
    for (const filePath of filePaths) {
        const existing = await checkLock(filePath);
        if (existing && existing.locked_by && existing.locked_by !== agentId) {
            return {
                conflict: true,
                file: filePath,
                locked_by: existing.locked_by,
                task_id: existing.task_id || null,
            };
        }
    }

    // No foreign locks — acquire all atomically. Conditional upsert still
    // protects against a tight race between the pre-check and acquisition.
    const lockStatements = filePaths.map(filePath => ({
        sql: `INSERT INTO collab_file_locks (file_path, locked_by, task_id, locked_at, expires_at)
              VALUES (?, ?, ?, datetime('now'), datetime('now', '+' || ? || ' minutes'))
              ON CONFLICT(file_path) DO UPDATE SET
                  locked_by = excluded.locked_by,
                  task_id = excluded.task_id,
                  locked_at = excluded.locked_at,
                  expires_at = excluded.expires_at
              WHERE locked_by = excluded.locked_by OR locked_by IS NULL`,
        args: [filePath, agentId, taskId, ttlMinutes]
    }));

    const results = await db.batch(lockStatements);

    const conflictIdx = results.findIndex(r => r.rowsAffected === 0);
    if (conflictIdx !== -1) {
        // Race: a foreign agent acquired the lock between pre-check and batch.
        // Release any locks we just acquired in this call before returning.
        const releaseStatements = filePaths
            .slice(0, conflictIdx)
            .map(fp => ({
                sql: `DELETE FROM collab_file_locks WHERE file_path = ? AND locked_by = ? AND task_id = ?`,
                args: [fp, agentId, taskId]
            }));
        if (releaseStatements.length > 0) await db.batch(releaseStatements);

        const conflictFile = filePaths[conflictIdx];
        const existing = await checkLock(conflictFile);
        return {
            conflict: true,
            file: conflictFile,
            locked_by: existing?.locked_by || 'unknown',
            task_id: existing?.task_id || null,
        };
    }

    // All locks claimed — update task assignment
    await db.execute(`
        UPDATE collab_tasks
        SET assigned_agent = ?, status = 'assigned', updated_at = datetime('now')
        WHERE id = ?
    `, [agentId, taskId]);

    return { conflict: false, task: await getTask(taskId) };
}

async function archiveAllTasks() {
    const result = await db.execute(`
        UPDATE collab_tasks
        SET status = 'archived', updated_at = datetime('now')
        WHERE status != 'archived'
    `);
    return result.rowsAffected;
}

async function deleteTask(id) {
    const result = await db.execute('DELETE FROM collab_tasks WHERE id = ?', [id]);
    return result.rowsAffected > 0;
}

function parseTaskRow(row) {
    return {
        ...row,
        file_paths: parseJsonArray(row.file_paths),
        depends_on: parseJsonArray(row.depends_on),
        result: parseJsonObjectOrNull(row.result),
        notes: parseJsonArray(row.notes),
    };
}

// --- File Locks ---

async function acquireLock({ file_path, agent_id, task_id, ttl_minutes }) {
    await expireStaleLocks();

    // FIX: Use atomic ON CONFLICT with WHERE clause to prevent silent lock-stealing.
    // Only acquires/renews lock if: no existing lock OR caller already owns it.
    // SQLite 3.35+ supports WHERE in ON CONFLICT DO UPDATE.
    const result = await db.execute(`
        INSERT INTO collab_file_locks (file_path, locked_by, task_id, locked_at, expires_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now', '+' || ? || ' minutes'))
        ON CONFLICT(file_path) DO UPDATE SET
            locked_by = excluded.locked_by,
            task_id = excluded.task_id,
            locked_at = excluded.locked_at,
            expires_at = excluded.expires_at
        WHERE locked_by = excluded.locked_by OR locked_by IS NULL
    `, [file_path, agent_id, task_id || null, ttl_minutes]);

    if (result.rowsAffected === 0) {
        const existing = await checkLock(file_path);
        return { 
            conflict: true, 
            locked_by: existing?.locked_by || 'unknown', 
            task_id: existing?.task_id || null 
        };
    }

    return { conflict: false, file_path, locked_by: agent_id };
}

async function releaseLock(filePath, agentId) {
    const result = await db.execute('DELETE FROM collab_file_locks WHERE file_path = ? AND locked_by = ?', [filePath, agentId]);
    return result.rowsAffected > 0;
}

async function releaseLocksForAgent(agentId) {
    const result = await db.execute('DELETE FROM collab_file_locks WHERE locked_by = ?', [agentId]);
    return result.rowsAffected;
}

async function releaseLocksForTask(taskId) {
    const result = await db.execute('DELETE FROM collab_file_locks WHERE task_id = ?', [taskId]);
    return result.rowsAffected;
}

async function checkLock(filePath) {
    await expireStaleLocks();
    const result = await db.execute('SELECT * FROM collab_file_locks WHERE file_path = ?', [filePath]);
    return result.rows[0] || null;
}

async function getAllLocks() {
    await expireStaleLocks();
    const result = await db.execute('SELECT * FROM collab_file_locks ORDER BY locked_at DESC');
    return result.rows.map(row => ({
        file_path: row.file_path,
        agent_id: row.locked_by,
        task_id: row.task_id,
        locked_at: row.locked_at,
        expires_at: row.expires_at,
        mcp_active: Boolean(row.mcp_active),
        mcp_stream: parseJsonObjectOrNull(row.mcp_stream_json)
    }));
}

async function expireStaleLocks() {
    await db.execute("DELETE FROM collab_file_locks WHERE expires_at IS NOT NULL AND expires_at < datetime('now')");
}

// --- Pipeline Runs ---

async function createPipelineRun({ id, pipeline_type, stages, trigger_task_id }) {
    await db.execute(`
        INSERT INTO collab_pipeline_runs (id, pipeline_type, stages, trigger_task_id, status)
        VALUES (?, ?, ?, ?, 'running')
    `, [id, pipeline_type, JSON.stringify(stages), trigger_task_id || null]);
    return await getPipelineRun(id);
}

async function getAllPipelineRuns(filters = {}, pagination = {}) {
    const rawLimit = Number.isInteger(Number(pagination.limit)) ? Number(pagination.limit) : 50;
    const rawOffset = Number.isInteger(Number(pagination.offset)) ? Number(pagination.offset) : 0;
    const limit = Math.max(1, rawLimit);
    const offset = Math.max(0, rawOffset);

    let query = 'SELECT * FROM collab_pipeline_runs WHERE 1=1';
    const params = [];

    if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const result = await db.execute(query, params);
    return result.rows.map(parsePipelineRow);
}

async function getPipelineRun(id) {
    const result = await db.execute('SELECT * FROM collab_pipeline_runs WHERE id = ?', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return parsePipelineRow(row);
}

async function getPipelineCounts() {
    const result = await db.execute(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
        FROM collab_pipeline_runs
    `);
    const row = result.rows[0];

    return {
        running_pipelines: row?.running || 0,
        total_pipelines: row?.total || 0,
    };
}

async function advancePipelineRun(id, stageResult) {
    const pipeline = await getPipelineRun(id);
    if (!pipeline) return null;
    if (pipeline.status !== 'running') return pipeline;

    const results = pipeline.results;
    results[`stage_${pipeline.current_stage}`] = stageResult;

    const nextStage = pipeline.current_stage + 1;
    const isComplete = nextStage >= pipeline.stages.length;

    await db.execute(`
        UPDATE collab_pipeline_runs
        SET current_stage = ?, results = ?, status = ?, updated_at = datetime('now'),
            completed_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
        WHERE id = ?
    `, [
        isComplete ? pipeline.current_stage : nextStage,
        JSON.stringify(results),
        isComplete ? 'completed' : 'running',
        isComplete ? 1 : 0,
        id,
    ]);

    return { pipeline: await getPipelineRun(id), isComplete, nextStageIndex: isComplete ? null : nextStage };
}

async function failPipelineRun(id, reason) {
    const pipeline = await getPipelineRun(id);
    if (!pipeline) return null;

    const results = pipeline.results;
    results.failure_reason = reason;

    await db.execute(`
        UPDATE collab_pipeline_runs
        SET status = 'failed', results = ?, updated_at = datetime('now'), completed_at = datetime('now')
        WHERE id = ?
    `, [JSON.stringify(results), id]);
    return await getPipelineRun(id);
}

function parsePipelineRow(row) {
    return {
        ...row,
        stages: JSON.parse(row.stages),
        results: JSON.parse(row.results),
    };
}

// --- Activity Log ---

async function logActivity({ agent_id, action, target_type, target_id, details }) {
    await db.execute(`
        INSERT INTO collab_activity (agent_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, ?, ?)
    `, [agent_id || null, action, target_type || null, target_id || null, JSON.stringify(details || {})]);
}

async function getRecentActivity(limit = 50, filters = {}, offset = 0) {
    const safeLimit = Math.max(1, Number(limit) || 50);
    const safeOffset = Math.max(0, Number(offset) || 0);
    let query = 'SELECT * FROM collab_activity WHERE 1=1';
    const params = [];

    if (filters.agent) {
        query += ' AND agent_id = ?';
        params.push(filters.agent);
    }
    if (filters.action) {
        query += ' AND action = ?';
        params.push(filters.action);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    const result = await db.execute(query, params);
    return result.rows.map(row => ({
        ...row,
        details: JSON.parse(row.details),
    }));
}

// --- Memories ---

async function setMemory(agentId, key, value) {
    await db.execute(`
        INSERT INTO collab_memories (agent_id, key, value, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(agent_id, key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
    `, [agentId ?? '', key, JSON.stringify(value)]);
    return await getMemory(agentId, key);
}

async function getMemory(agentId, key) {
    const result = await db.execute(`
        SELECT * FROM collab_memories
        WHERE agent_id = ? AND key = ?
    `, [agentId ?? '', key]);
    const row = result.rows[0];
    
    if (!row) return null;
    return {
        ...row,
        value: JSON.parse(row.value),
    };
}

async function getAllMemories(agentId = null) {
    const aid = agentId ?? '';
    let result;
    if (aid === '') {
        result = await db.execute(`
            SELECT * FROM collab_memories
            WHERE agent_id = ''
            ORDER BY updated_at DESC
        `);
    } else {
        result = await db.execute(`
            SELECT * FROM collab_memories
            WHERE agent_id IN ('', ?)
            ORDER BY updated_at DESC
        `, [aid]);
    }
    return result.rows.map(row => ({
        ...row,
        value: JSON.parse(row.value),
    }));
}

async function deleteMemory(agentId, key) {
    const result = await db.execute(`
        DELETE FROM collab_memories
        WHERE agent_id = ? AND key = ?
    `, [agentId ?? '', key]);
    return result.rowsAffected > 0;
}

// --- Bug Reports ---

async function createBugReport(input) {
    const fields = Object.keys(input);
    const placeholders = fields.map(() => '?').join(', ');
    const params = fields.map(k => {
        const v = input[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
        if (Array.isArray(v)) return JSON.stringify(v);
        return v;
    });

    await db.execute(`
        INSERT INTO collab_bug_reports (${fields.join(', ')})
        VALUES (${placeholders})
    `, params);
    return await getBugReport(input.id);
}

async function getAllBugReports(filters = {}, pagination = {}) {
    const rawLimit = Number.isInteger(Number(pagination.limit)) ? Number(pagination.limit) : 50;
    const rawOffset = Number.isInteger(Number(pagination.offset)) ? Number(pagination.offset) : 0;
    const limit = Math.max(1, rawLimit);
    const offset = Math.max(0, rawOffset);

    let query = 'SELECT * FROM collab_bug_reports WHERE 1=1';
    const params = [];

    if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
    }
    if (filters.severity) {
        query += ' AND severity = ?';
        params.push(filters.severity);
    }
    if (filters.category) {
        query += ' AND category = ?';
        params.push(filters.category);
    }
    if (filters.module_id) {
        query += ' AND module_id = ?';
        params.push(filters.module_id);
    }
    if (filters.source_type) {
        query += ' AND source_type = ?';
        params.push(filters.source_type);
    }
    if (filters.assigned_agent_id) {
        query += ' AND assigned_agent_id = ?';
        params.push(filters.assigned_agent_id);
    }

    query += ' ORDER BY priority DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const result = await db.execute(query, params);
    return result.rows.map(parseBugReportRow);
}

async function getBugReport(id) {
    const result = await db.execute('SELECT * FROM collab_bug_reports WHERE id = ?', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return parseBugReportRow(row);
}

const ALLOWED_BUG_COLUMNS = new Set([
    'title', 'summary', 'status', 'priority', 'assigned_agent_id',
    'category', 'severity', 'module_id', 'error_code_hex',
    'bytecode', 'checksum_verified', 'parseable', 'auto_fixable',
    'decoded_context', 'recovery_hints', 'observed_behavior',
    'expected_behavior', 'repro_steps', 'environment', 'attachments',
    'related_task_id', 'related_pipeline_id', 'related_activity_id',
    'duplicate_of_bug_id',
]);

async function updateBugReport(id, updates) {
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates || {})) {
        if (!ALLOWED_BUG_COLUMNS.has(key)) continue;
        
        fields.push(`${key} = ?`);
        if (value && typeof value === 'object') {
            params.push(JSON.stringify(value));
        } else {
            params.push(value);
        }
    }

    if (fields.length === 0) return await getBugReport(id);

    fields.push("updated_at = datetime('now')");
    params.push(id);
    await db.execute(`UPDATE collab_bug_reports SET ${fields.join(', ')} WHERE id = ?`, params);
    return await getBugReport(id);
}

async function deleteBugReport(id) {
    const result = await db.execute('DELETE FROM collab_bug_reports WHERE id = ?', [id]);
    return result.rowsAffected > 0;
}

function parseBugReportRow(row) {
    return {
        ...row,
        attachments: row.attachments ? JSON.parse(row.attachments) : [],
        decoded_context: row.decoded_context ? JSON.parse(row.decoded_context) : null,
        recovery_hints: row.recovery_hints ? JSON.parse(row.recovery_hints) : null,
        repro_steps: row.repro_steps ? JSON.parse(row.repro_steps) : null,
        environment: row.environment ? JSON.parse(row.environment) : null,
        corroborating_agents: row.corroborating_agents ? JSON.parse(row.corroborating_agents) : [],
        checksum_verified: !!row.checksum_verified,
        parseable: !!row.parseable,
        auto_fixable: !!row.auto_fixable,
    };
}

// --- Agent Keys ---

async function createAgentKey({ id, agentId, keyHash, expiresAt, createdBy }) {
    await db.execute(`
        INSERT INTO collab_agent_keys (id, agent_id, key_hash, expires_at, created_by)
        VALUES (?, ?, ?, ?, ?)
    `, [id, agentId, keyHash, expiresAt || null, createdBy || null]);
    return await getAgentKey(id);
}

async function getAgentKey(id) {
    const result = await db.execute('SELECT * FROM collab_agent_keys WHERE id = ?', [id]);
    return result.rows[0] || null;
}

async function getAllAgentKeys() {
    const result = await db.execute('SELECT * FROM collab_agent_keys ORDER BY created_at DESC');
    return result.rows;
}

async function getKeysByAgentId(agentId) {
    const result = await db.execute('SELECT * FROM collab_agent_keys WHERE agent_id = ? ORDER BY created_at DESC', [agentId]);
    return result.rows;
}

async function revokeAgentKeyById(keyId) {
    const result = await db.execute(
        "UPDATE collab_agent_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL",
        [keyId]
    );
    return result.rowsAffected > 0;
}

async function revokeAllKeysForAgent(agentId) {
    const result = await db.execute(
        "UPDATE collab_agent_keys SET revoked_at = datetime('now') WHERE agent_id = ? AND revoked_at IS NULL",
        [agentId]
    );
    return result.rowsAffected;
}

async function deleteAgentKey(keyId) {
    const result = await db.execute('DELETE FROM collab_agent_keys WHERE id = ?', [keyId]);
    return result.rowsAffected > 0;
}

async function expireAgentKey(keyId) {
    const result = await db.execute(
        "UPDATE collab_agent_keys SET expires_at = datetime('now', '-1 day') WHERE id = ?",
        [keyId]
    );
    return result.rowsAffected > 0;
}

// --- Experience Ledger ---

async function getLedgerEntry(skeletonHash) {
    const result = await db.execute('SELECT * FROM collab_experience_ledger WHERE skeleton_hash = ?', [skeletonHash]);
    const row = result.rows[0];
    if (!row) return null;
    return {
        ...row,
        corroborating_agent_ids: JSON.parse(row.corroborating_agent_ids)
    };
}

async function ingestExperience({ skeleton_hash, agent_id, raw_trace_ref }) {
    const existing = await getLedgerEntry(skeleton_hash);
    
    if (existing) {
        if (existing.corroborating_agent_ids.includes(agent_id)) {
            return existing; // Already corroborated by this agent
        }
        
        const newCorroborators = [...existing.corroborating_agent_ids, agent_id];
        const newCount = existing.corroboration_count + 1;
        const newStatus = newCount >= 2 ? 'active' : 'pending';
        
        await db.execute(`
            UPDATE collab_experience_ledger
            SET corroboration_count = ?,
                corroborating_agent_ids = ?,
                ledger_status = ?,
                updated_at = datetime('now')
            WHERE skeleton_hash = ?
        `, [newCount, JSON.stringify(newCorroborators), newStatus, skeleton_hash]);
        return await getLedgerEntry(skeleton_hash);
    } else {
        await db.execute(`
            INSERT INTO collab_experience_ledger (skeleton_hash, raw_trace_ref, corroborating_agent_ids, ledger_status)
            VALUES (?, ?, ?, 'pending')
        `, [skeleton_hash, raw_trace_ref, JSON.stringify([agent_id])]);
        return await getLedgerEntry(skeleton_hash);
    }
}

async function updateLedgerStatus(skeletonHash, status) {
    const result = await db.execute(`
        UPDATE collab_experience_ledger
        SET ledger_status = ?, updated_at = datetime('now')
        WHERE skeleton_hash = ?
    `, [status, skeletonHash]);
    return result.rowsAffected > 0;
}

async function listLedger(status) {
    let query = 'SELECT * FROM collab_experience_ledger';
    const params = [];
    if (status) {
        query += ' WHERE ledger_status = ?';
        params.push(status);
    }
    query += ' ORDER BY updated_at DESC';
    const result = await db.execute(query, params);
    return result.rows.map(row => ({
        ...row,
        corroborating_agent_ids: JSON.parse(row.corroborating_agent_ids)
    }));
}

// --- Codebase Search ---

async function indexCodebaseEntries(entries) {
    const statements = entries.map(entry => ({
        sql: `INSERT INTO codebase_embeddings (id, file_path, chunk_index, content_preview, vector_tq)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                  content_preview = excluded.content_preview,
                  vector_tq = excluded.vector_tq`,
        args: [entry.id, entry.file_path, entry.chunk_index, entry.content_preview, entry.vector_tq]
    }));
    await db.batch(statements);
}

async function getAllCodebaseEmbeddings() {
    const result = await db.execute('SELECT * FROM codebase_embeddings');
    return result.rows;
}

async function getEmbeddingsByPath(filePath) {
    const result = await db.execute('SELECT * FROM codebase_embeddings WHERE file_path = ?', [filePath]);
    return result.rows;
}

async function getAllCodebasePaths() {
    const result = await db.execute('SELECT DISTINCT file_path FROM codebase_embeddings ORDER BY file_path ASC');
    return result.rows.map(r => r.file_path);
}

async function clearCodebaseIndex() {
    await db.execute('DELETE FROM codebase_embeddings');
}

// --- Messaging ---

async function createMessage({ sender_id, target_id, glyph, text, bytecode, metadata }) {
    // FIX: Use RETURNING * instead of last_insert_rowid() for async-driver safety.
    // Works on SQLite 3.35+, better-sqlite3, and Turso/libSQL.
    // Eliminates race condition where concurrent inserts could return wrong row.
    const result = await db.execute(`
        INSERT INTO collab_messages (sender_id, target_id, glyph, text, bytecode, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
    `, [
        sender_id,
        target_id || 'all',
        glyph || '✦',
        text,
        bytecode || null,
        JSON.stringify(metadata || {})
    ]);

    if (result.rows.length === 0) {
        throw new Error('Message insert failed: no row returned');
    }

    const row = result.rows[0];
    const { is_telepathic, ...rest } = row;
    return {
        ...rest,
        metadata: JSON.parse(row.metadata)
    };
}

async function getAllMessages(filters = {}, pagination = {}) {
    const safeLimit = Math.max(1, Number(pagination.limit) || 50);
    const safeOffset = Math.max(0, Number(pagination.offset) || 0);

    let query = 'SELECT * FROM collab_messages WHERE 1=1';
    const params = [];

    if (filters.sender) {
        query += ' AND sender_id = ?';
        params.push(filters.sender);
    }
    if (filters.target) {
        query += ' AND target_id = ?';
        params.push(filters.target);
    }
    if (filters.since) {
        query += ' AND created_at > ?';
        params.push(filters.since);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    const result = await db.execute(query, params);
    return result.rows.map(row => {
        const { is_telepathic, ...rest } = row;
        return {
            ...rest,
            metadata: JSON.parse(row.metadata)
        };
    });
}
async function deleteMessage(id) {
    const result = await db.execute('DELETE FROM collab_messages WHERE id = ?', [id]);
    return result.rowsAffected > 0;
}

// --- Alerts ---

async function createAlert({ id, message_id, recipient_id, sender_id, target_id, identity_packet, issued_at, expires_at }) {
    await db.execute(`
        INSERT INTO collab_alerts (id, message_id, recipient_id, sender_id, target_id, identity_packet, issued_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, message_id, recipient_id, sender_id, target_id, JSON.stringify(identity_packet), issued_at, expires_at]);
    
    return await getAlertById(id);
}

async function getAlertById(id) {
    const result = await db.execute('SELECT * FROM collab_alerts WHERE id = ?', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
        ...row,
        identity_packet: JSON.parse(row.identity_packet)
    };
}

async function getPendingAlerts(agentId) {
    const result = await db.execute('SELECT * FROM collab_alerts WHERE recipient_id = ? AND status = \'pending\'', [agentId]);
    return result.rows.map(row => ({
        ...row,
        identity_packet: JSON.parse(row.identity_packet)
    }));
}

async function getAllAlerts(filters = {}) {
    let query = 'SELECT * FROM collab_alerts WHERE 1=1';
    const params = [];
    if (filters.agent_id) {
        query += ' AND recipient_id = ?';
        params.push(filters.agent_id);
    }
    if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
    }
    query += ' ORDER BY issued_at DESC LIMIT 100';
    const result = await db.execute(query, params);
    return result.rows.map(row => ({
        ...row,
        identity_packet: JSON.parse(row.identity_packet)
    }));
}

async function updateAlertStatus(id, status, deliveredVia = null) {
    const query = deliveredVia 
        ? 'UPDATE collab_alerts SET status = ?, delivered_via = ? WHERE id = ?'
        : 'UPDATE collab_alerts SET status = ? WHERE id = ?';
    const params = deliveredVia ? [status, deliveredVia, id] : [status, id];
    const result = await db.execute(query, params);
    return result.rowsAffected > 0;
}

async function markExpiredAlerts(now) {
    const result = await db.execute('UPDATE collab_alerts SET status = \'expired\' WHERE status = \'pending\' AND expires_at <= ?', [now]);
    return result.rowsAffected;
}

async function createAlertResponse({ alert_id, agent_id, responded_at, latency_ms, payload }) {
    await db.execute(`
        INSERT INTO collab_alert_responses (alert_id, agent_id, responded_at, latency_ms, payload)
        VALUES (?, ?, ?, ?, ?)
    `, [alert_id, agent_id, responded_at, latency_ms, JSON.stringify(payload || {})]);
    
    return await getAlertResponse(alert_id, agent_id);
}

async function getAlertResponse(alertId, agentId) {
    const result = await db.execute('SELECT * FROM collab_alert_responses WHERE alert_id = ? AND agent_id = ?', [alertId, agentId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
        ...row,
        payload: JSON.parse(row.payload)
    };
}


    // --- Codebase Search ---



async function updateLockMcp(file_path, agent_id, { active, stream }) {
    const result = await db.execute(`
        UPDATE collab_file_locks
        SET mcp_active = ?, mcp_stream_json = ?
        WHERE file_path = ? AND locked_by = ?
    `, [active ? 1 : 0, stream ? JSON.stringify(stream) : null, file_path, agent_id]);
    return result.rowsAffected > 0;
}

async function getStatusFull() {
    const agents = await getAllAgents();
    const taskCounts = await getTaskCounts();
    const pipelineCounts = await getPipelineCounts();
    const locks = await getAllLocks();

    const activeMcpLocks = locks.filter(l => l.mcp_active);

    return {
        online_agents: agents.filter(agent => agent.status !== 'offline').length,
        total_agents: agents.length,
        active_tasks: taskCounts.active_tasks,
        total_tasks: taskCounts.total_tasks,
        running_pipelines: pipelineCounts.running_pipelines,
        active_locks: locks.length,
        mcp_port: {
            active_bindings: activeMcpLocks.length,
            throughput: activeMcpLocks.reduce((sum, l) => sum + (l.mcp_stream?.throughput || 0), 0)
        }
    };
}

// --- Contract Enforcement ---

const PERSISTENCE_CONTRACT = [
    'agents.register', 'agents.heartbeat', 'agents.offline', 'agents.getAll', 'agents.getAllRaw', 'agents.getById',
    'agents.unassignTasks', 'agents.delete',
    'tasks.create', 'tasks.getAll', 'tasks.getById', 'tasks.getCounts', 'tasks.update',
    'tasks.assignWithLocks', 'tasks.delete', 'tasks.archiveAll',
    'bug_reports.create', 'bug_reports.getAll', 'bug_reports.getById',
    'bug_reports.update', 'bug_reports.delete',
    'pipelines.create', 'pipelines.getAll', 'pipelines.getById',
    'pipelines.getCounts', 'pipelines.advance', 'pipelines.fail',
    'activity.log', 'activity.getRecent',
    'memories.set', 'memories.get', 'memories.getAll', 'memories.delete',
    'agent_keys.create', 'agent_keys.getAll', 'agent_keys.getByAgentId',
    'agent_keys.getById', 'agent_keys.revoke', 'agent_keys.revokeAll',
    'agent_keys.delete', 'agent_keys.expire',
    'ledger.getById', 'ledger.ingest', 'ledger.updateStatus', 'ledger.list',
    'locks.acquire', 'locks.release', 'locks.releaseForAgent',
    'locks.releaseForTask', 'locks.check', 'locks.getAll', 'locks.updateMcp',
    'messages.create', 'messages.getAll', 'messages.delete',
    'alerts.create', 'alerts.getById', 'alerts.getPending', 'alerts.getAll', 'alerts.updateStatus', 'alerts.markExpired',
    'alert_responses.create', 'alert_responses.getForAlert',
    'codebase.index', 'codebase.getAll', 'codebase.getByPath', 'codebase.getAllPaths', 'codebase.clear',

    'close', 'getStatus',
];

function assertPersistenceContract(obj) {
    for (const path of PERSISTENCE_CONTRACT) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            current = current?.[part];
        }
        if (typeof current !== 'function') {
            throw new Error(`PERSISTENCE_CONTRACT_VIOLATION: ${path} is not a function`);
        }
    }
}

// --- Export ---

const collabPersistence = {
    agents: {
        register: registerAgent,
        heartbeat: heartbeatAgent,
        offline: offlineAgent,
        getAll: getAllAgents,
        getAllRaw: getAllAgentsRaw,
        getById: getAgent,
        unassignTasks: unassignTasksForAgent,
        delete: deleteAgent,
    },
    tasks: {
        create: createTask,
        getAll: getAllTasks,
        getById: getTask,
        getCounts: getTaskCounts,
        update: updateTask,
        assignWithLocks: assignTaskWithLocks,
        delete: deleteTask,
        archiveAll: archiveAllTasks,
    },
    bug_reports: {
        create: createBugReport,
        getAll: getAllBugReports,
        getById: getBugReport,
        update: updateBugReport,
        delete: deleteBugReport,
    },
    pipelines: {
        create: createPipelineRun,
        getAll: getAllPipelineRuns,
        getById: getPipelineRun,
        getCounts: getPipelineCounts,
        advance: advancePipelineRun,
        fail: failPipelineRun,
    },
    activity: {
        log: logActivity,
        getRecent: getRecentActivity,
    },
    memories: {
        set: setMemory,
        get: getMemory,
        getAll: getAllMemories,
        delete: deleteMemory,
    },
    agent_keys: {
        create: createAgentKey,
        getAll: getAllAgentKeys,
        getByAgentId: getKeysByAgentId,
        getById: getAgentKey,
        revoke: revokeAgentKeyById,
        revokeAll: revokeAllKeysForAgent,
        delete: deleteAgentKey,
        expire: expireAgentKey,
    },
    ledger: {
        getById: getLedgerEntry,
        ingest: ingestExperience,
        updateStatus: updateLedgerStatus,
        list: listLedger,
    },
    locks: {
        acquire: acquireLock,
        release: releaseLock,
        releaseForAgent: releaseLocksForAgent,
        releaseForTask: releaseLocksForTask,
        check: checkLock,
        getAll: getAllLocks,
        updateMcp: updateLockMcp,
    },
    messages: {
        create: createMessage,
        getAll: getAllMessages,
        delete: deleteMessage,
    },
    alerts: {
        create: createAlert,
        getById: getAlertById,
        getPending: getPendingAlerts,
        getAll: getAllAlerts,
        updateStatus: updateAlertStatus,
        markExpired: markExpiredAlerts,
    },
    alert_responses: {
        create: createAlertResponse,
        getForAlert: getAlertResponse,
    },
    codebase: {
        index: indexCodebaseEntries,
        getAll: getAllCodebaseEmbeddings,
        getByPath: getEmbeddingsByPath,
        getAllPaths: getAllCodebasePaths,
        clear: clearCodebaseIndex,
    },
    close: closeDatabase,
    getStatus,
    db, // Expose db for atomic batch operations in service layer
};

// Final export with contract verification
assertPersistenceContract(collabPersistence);

export { collabPersistence };
