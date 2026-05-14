/**
 * @fastify/session-compatible store backed by Turso (libSQL).
 * Implements get/set/destroy/touch.
 */
export class TursoSessionStore {
    constructor(dbWrapper) {
        this.db = dbWrapper;
    }

    async get(sessionId, callback) {
        try {
            const result = await this.db.execute(
                'SELECT data, expires FROM sessions WHERE sid = ?',
                [sessionId]
            );
            const row = result.rows[0];
            if (!row || Date.now() > Number(row.expires)) {
                return callback(null, null);
            }
            callback(null, JSON.parse(row.data));
        } catch (err) {
            console.error('[SESSION_STORE] GET FAILED:', err);
            callback(err);
        }
    }

    async set(sessionId, session, callback) {
        const expires = session.cookie?.expires
            ? new Date(session.cookie.expires).getTime()
            : Date.now() + 86400000; // 24h default
        try {
            await this.db.execute(
                `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
                 ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`,
                [sessionId, JSON.stringify(session), expires]
            );
            callback(null);
        } catch (err) {
            console.error('[SESSION_STORE] SET FAILED:', err);
            callback(err);
        }
    }

    async destroy(sessionId, callback) {
        try {
            await this.db.execute('DELETE FROM sessions WHERE sid = ?', [sessionId]);
            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    async touch(sessionId, session, callback) {
        return this.set(sessionId, session, callback);
    }
}
