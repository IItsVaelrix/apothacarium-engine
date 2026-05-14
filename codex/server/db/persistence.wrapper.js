import { createClient } from '@libsql/client';

/**
 * Creates a unified database client wrapper that supports both synchronous
 * better-sqlite3 (local) and asynchronous @libsql/client (Turso).
 * 
 * It forces an asynchronous interface for both to ensure application-level
 * consistency regardless of the underlying driver.
 */
export function createDbWrapper(options) {
    const { type, config } = options;

    if (type === 'libsql') {
        const client = createClient(config);
        
        return {
            type: 'libsql',
            client,
            async execute(sql, params = []) {
                const result = await client.execute({ sql, args: params });
                return {
                    rows: result.rows,
                    rowsAffected: result.rowsAffected,
                    lastInsertRowid: result.lastInsertRowid?.toString(),
                };
            },
            async batch(statements) {
                return await client.batch(statements);
            },
            async transaction(callback) {
                // libsql batch is atomic by default when not in read-only mode
                // Use execute with BEGIN/COMMIT wrappers for explicit transaction
                const results = [];
                await client.execute({ sql: 'BEGIN' });
                try {
                    results.push(await callback(client));
                    await client.execute({ sql: 'COMMIT' });
                    return results;
                } catch (err) {
                    await client.execute({ sql: 'ROLLBACK' });
                    throw err;
                }
            },
            async close() {
                await client.close();
            }
        };
    }

    if (type === 'better-sqlite3') {
        const db = options.db; // Already instantiated Database instance
        
        return {
            type: 'better-sqlite3',
            client: db,
            async execute(sql, params = []) {
                const stmt = db.prepare(sql);
                if (stmt.reader) {
                    const rows = stmt.all(...params);
                    return { rows, rowsAffected: 0 };
                } else {
                    const result = stmt.run(...params);
                    return {
                        rows: [],
                        rowsAffected: result.changes,
                        lastInsertRowid: result.lastInsertRowid?.toString(),
                    };
                }
            },
            async batch(statements) {
                // simple serial execution for compatibility
                const results = [];
                const transaction = db.transaction((stmts) => {
                    for (const s of stmts) {
                        const stmt = db.prepare(typeof s === 'string' ? s : s.sql);
                        const args = typeof s === 'string' ? [] : (s.args || []);
                        const result = stmt.run(...args);
                        results.push({
                            rowsAffected: result.changes,
                            lastInsertRowid: result.lastInsertRowid?.toString(),
                        });
                    }
                });
                transaction(statements);
                return results;
            },
            async transaction(callback) {
                const results = [];
                const tx = db.transaction(() => {
                    results.push(callback(db));
                });
                tx();
                return results;
            },
            async close() {
                db.close();
            }
        };
    }

    throw new Error(`Unsupported database type: ${type}`);
}
